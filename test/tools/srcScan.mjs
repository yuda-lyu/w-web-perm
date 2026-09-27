//原始碼靜態盤點工具(供 unit-maskLog / unit-wrapInjected 之站點不變式 SITE-* / WRAP-SITE-* 共用; 規則見 CLAUDE_rulebook.md「權杖不外洩」)。
//以行為單位處理: 本專案之 console 呼叫與注入函數呼叫皆為單行; 跨行之 console 呼叫會回報為「無法解析」而非靜默略過。
import fs from 'fs'
import path from 'path'


//takeParen: 自 i0(左括號之後)取平衡括號內之字串, 略過字串字面值; 未閉合(跨行)回 null
export function takeParen(s, i0) {
    let depth = 1
    let q = null
    for (let i = i0; i < s.length; i++) {
        let c = s[i]
        if (q) {
            if (c === '\\') {
                i++
                continue
            }
            if (c === q) {
                q = null
            }
            continue
        }
        if (c === '\'' || c === '"' || c === '`') {
            q = c
            continue
        }
        if (c === '(') {
            depth++
        }
        else if (c === ')') {
            depth--
            if (depth === 0) {
                return s.slice(i0, i)
            }
        }
    }
    return null
}


//blankStrings: 字串字面值換成空字串, 避免 '...token...' 之文字被當成識別字
export function blankStrings(s) {
    return s.replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/g, '""')
}


//stripLineComment: 去掉行尾 // 註解(字串內之 // 不算, 如 'http://')
export function stripLineComment(s) {
    let q = null
    for (let i = 0; i < s.length; i++) {
        let c = s[i]
        if (q) {
            if (c === '\\') {
                i++
                continue
            }
            if (c === q) {
                q = null
            }
            continue
        }
        if (c === '\'' || c === '"' || c === '`') {
            q = c
            continue
        }
        if (c === '/' && s[i + 1] === '/') {
            return s.slice(0, i)
        }
    }
    return s
}


/**
 * 取檔案之行
 *
 * @param {String} fp 輸入檔案路徑
 * @param {String} mode 輸入模式: 'code' 可執行碼(略過 // 註解行、JSDoc 與區塊註解, 並去掉行尾註解); 'doc' 只取 JSDoc / 區塊註解行(去掉前導 *); 'md' 全部行
 * @returns {Array} 回傳 [{ no, text }], no 為 1 起算之行號
 */
export function sourceLines(fp, mode) {
    let lines = fs.readFileSync(fp, 'utf8').split(/\r?\n/)
    let out = []
    let inBlock = false
    lines.forEach((ln, k) => {
        if (mode === 'md') {
            out.push({ no: k + 1, text: ln })
            return
        }
        let t = ln.trim()
        let isDoc = inBlock || t.startsWith('/*') || t.startsWith('*')
        if (t.startsWith('/*') && !t.includes('*/')) {
            inBlock = true
        }
        if (inBlock && t.includes('*/')) {
            inBlock = false
        }
        if (mode === 'code') {
            if (isDoc || t.startsWith('//')) {
                return
            }
            out.push({ no: k + 1, text: stripLineComment(ln) })
        }
        else if (isDoc) { //doc
            out.push({ no: k + 1, text: t.replace(/^\/?\*+\s?/, '') })
        }
    })
    return out
}


//dropMaskCalls: 移除 maskTok(...) / maskQuery(...) / maskUrl(...) 整段(已遮罩之引數)
function dropMaskCalls(s) {
    let re = /\b(maskTok|maskQuery|maskUrl)\(/
    for (let n = 0; n < 100; n++) {
        let m = re.exec(s)
        if (!m) {
            break
        }
        let i0 = m.index + m[0].length
        let inner = takeParen(s, i0)
        if (inner === null) {
            break
        }
        s = s.slice(0, m.index) + '""' + s.slice(i0 + inner.length + 1)
    }
    return s
}


/**
 * 盤點 console.log / error / warn / info 呼叫中未經遮罩之權杖引數
 * 判準: 引數(去掉 maskTok / maskQuery / maskUrl 之整段後)含權杖類識別字 token / tokenSelf / authorization / headers / referer,
 * 或含 get(req, 'query') / req.query 者為違規
 *
 * @param {String} fp 輸入檔案路徑
 * @param {String} mode 輸入模式, 同 sourceLines
 * @returns {Array} 回傳違規描述字串陣列, 形如 'WWebPerm.mjs:399: console.log(`token`, token)'
 */
export function scanConsoleTokenArgs(fp, mode) {
    let bad = []
    for (let { no, text } of sourceLines(fp, mode)) {
        let re = /console\.(log|error|warn|info)\(/g
        let m
        while ((m = re.exec(text)) !== null) {
            let args = takeParen(text, m.index + m[0].length)
            if (args === null) {
                bad.push(`${path.basename(fp)}:${no} 無法解析(跨行呼叫, 請改單行或人工盤點): ${text.trim()}`)
                continue
            }
            let a = dropMaskCalls(args)
            let aCode = blankStrings(a) //識別字判斷須排除字串字面值(如標籤 'req.query')
            let hasQuery = /get\(\s*req\s*,\s*['"`]query['"`]/.test(a) || /\breq\.query\b/.test(aCode)
            let hasTok = /\b(token|tokenSelf|authorization|headers|referer)\b/.test(aCode)
            if (hasQuery || hasTok) {
                bad.push(`${path.basename(fp)}:${no}: ${text.trim()}`)
            }
        }
    }
    return bad
}
