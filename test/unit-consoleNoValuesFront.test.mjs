//前端瀏覽器 console 不印資料值(排程第 206 項; 規則帳本 R-CONSOLE-NOVAL-01 之前端站點; 規格〈診斷輸出與遮罩〉D2、〈輸入參數之檢測機制〉V20)
//  承 2026-10-31 perm 輪(伺服端 console 不印值; 裁定當時只改伺服端、不改畫面), 本輪補前端: src/ 下可執行之 console 呼叫(.vue 之 <script>、.js、.mjs)只印固定字面值、typeof、或不含值之摘要函數(describeShape／describeErr), 不印權杖、使用者物件、授權字串、回應內容、錯誤本體.
//CNVF-001 站點不變式: src/ 下(排除已於 SITE-NV-001 涵蓋之伺服端匯入閉包)每個可執行 console 呼叫之每個引數皆不印值
//CNVF-002 範圍: 掃描範圍含前端進入檔、全部 .vue 元件與 src/js、src/plugins; 站點全集已盤點(CNVF-002 釘住各檔之站點數, 新增站點須先判定)
//CNVF-003 單一實作: 前端與伺服端共用同一份 describeShape／describeErr(src/js/describeShape.mjs), server/maskLog.mjs 只轉出; 其依賴閉包不含 Node 內建模組(瀏覽器可載入)
//CNVF-004 行為: 前端用之摘要不含值(以識別值植入使用者物件、授權字串、錯誤訊息逐一驗)
//跑法: npx mocha test/unit-consoleNoValuesFront.test.mjs --timeout 60000
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { builtinModules } from 'module'
import { fileURLToPath } from 'url'
import { scanConsoleValueArgs, importClosure, sourceLines, blankStrings } from './tools/srcScan.mjs'
import { describeShape as dsMaskLog, describeErr as deMaskLog } from '../server/maskLog.mjs'
import { describeShape, describeErr } from '../src/js/describeShape.mjs'

const A = assert.strict
const projRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const rel = (fp) => path.relative(projRoot, fp).replace(/\\/g, '/')

//src/ 下全部可執行檔(.vue、.js、.mjs)
function walkSrc() {
    let out = []
    let walk = (d) => {
        for (let n of fs.readdirSync(d, { withFileTypes: true })) {
            let fp = path.join(d, n.name)
            if (n.isDirectory()) {
                walk(fp)
            }
            else if (/\.(vue|js|mjs)$/.test(n.name)) {
                out.push(fp)
            }
        }
    }
    walk(path.join(projRoot, 'src'))
    return out.sort()
}

//各檔可執行 console 呼叫之站點數(2026-11-23 盤點; 不含已於 SITE-NV-001 涵蓋之伺服端閉包內之 src 檔)——新增站點須先判定其引數是否印值
const SITES = {
    'src/App.vue': 5,
    'src/main.js': 2,
    'src/plugins/mUI.mjs': 1,
    'src/js/cellEditing.mjs': 1,
    'src/js/getCascadePreview.mjs': 1,
    'src/components/LayoutContentGrups.vue': 5,
    'src/components/LayoutContentPemis.vue': 5,
    'src/components/LayoutContentTargets.vue': 4,
    'src/components/LayoutContentUsers.vue': 5,
    'src/components/LayoutContentStaInfor.vue': 4,
    'src/components/VeCgrups.vue': 4,
    'src/components/VeCpemis.vue': 4,
    'src/components/VeCrules.vue': 6,
    'src/components/VeGrupBlngUsers.vue': 4,
    'src/components/VePemiBlngGrups.vue': 4,
}


//findOddConsoleRefs: 可執行碼中「不是 console.(log|error|warn|info|debug)( 形式」之 console 引用(別名、解構、括號存取、傳遞 `.catch(console.log)`、其他方法 table／dir／trace／group／assert／count…)
//  與「行首為區塊註解但其後接 console 呼叫」之行(sourceLines 會把以 /* 開頭之行整行視為註解而略過; 2026-11-23 獨立複審指出之盲點)
function findOddConsoleRefs(fp) {
    let bad = []
    for (let { no, text } of sourceLines(fp, 'code')) {
        let code = blankStrings(text) //字串字面值內之 console 字樣(如語系文字「permission console」)不算引用
        for (let m of code.matchAll(/\bconsole\b/g)) {
            if (!/^console\.(log|error|warn|info|debug)\(/.test(code.slice(m.index))) {
                bad.push(`${path.basename(fp)}:${no}: ${text.trim()}`)
                break
            }
        }
    }
    fs.readFileSync(fp, 'utf8').split(/\r?\n/).forEach((ln, k) => {
        if (/\*\/\s*console\b/.test(ln)) {
            bad.push(`${path.basename(fp)}:${k + 1}: ${ln.trim()}`)
        }
    })
    return bad
}


describe('unit-consoleNoValuesFront (前端 console 不印資料值, 排程第 206 項)', function() {

    let serverClosure = null
    let files = null

    before(function() {
        serverClosure = importClosure(path.join(projRoot, 'server', 'WWebPerm.mjs'))
        //伺服端閉包內之 src 檔已由 unit-consoleNoValues SITE-NV-001 掃描; 其餘(前端專用)於此掃描
        files = walkSrc().filter((fp) => !serverClosure.has(fp))
    })

    it('CNVF-001 前端專用之 src 檔: 每個可執行 console 呼叫之每個引數皆為固定字面值／typeof／describeShape／describeErr(修前 2026-11-23 於 55 處站點中 43 處含未遮罩之引數: 登入成功之使用者物件、登入失敗回應、授權字串、選取列、錯誤本體等)', function() {
        let bad = []
        for (let fp of files) {
            bad.push(...scanConsoleValueArgs(fp, 'code', {}).map((x) => `${rel(fp)} ${x}`))
        }
        A.deepEqual(bad, [], `前端 console 站點印出可能含資料值之引數 ${bad.length} 處:\n${bad.join('\n')}`)
    })

    it('CNVF-002 站點全集: 各檔之可執行 console 呼叫數與已盤點者相同; 範圍涵蓋進入檔與全部元件', function() {
        let got = {}
        for (let fp of files) {
            let n = sourceLines(fp, 'code').filter((l) => /\bconsole\.(log|warn|error|info|debug|table|dir|trace|group)\b/.test(l.text)).length
            if (n > 0) {
                got[rel(fp)] = n
            }
        }
        A.deepEqual(got, SITES, '各檔站點數與盤點不符(新增或移除站點須先判定引數是否印值, 再更新 SITES)')
        let rels = files.map(rel)
        for (let f of ['src/App.vue', 'src/main.js', 'src/components/VeCgrups.vue', 'src/components/LayoutContentStaInfor.vue', 'src/plugins/mUI.mjs', 'src/js/cellEditing.mjs']) {
            A.ok(rels.includes(f), `掃描範圍缺 ${f}`)
        }
        //掃描器未空轉: 至少掃到 .vue 與 .mjs 之可執行行
        A.ok(files.some((fp) => fp.endsWith('.vue')) && files.some((fp) => fp.endsWith('.mjs')))
    })

    it('CNVF-002b console 之引用皆為 console.(log|error|warn|info|debug)( 形式: 無別名、解構、括號存取、`.catch(console.log)` 式傳遞、其他方法、區塊註解後接呼叫(掃描器 CNVF-001 之盲點)', function() {
        let bad = []
        for (let fp of walkSrc()) {
            bad.push(...findOddConsoleRefs(fp).map((x) => `${rel(fp)} ${x}`))
        }
        A.deepEqual(bad, [], `console 之非常規引用(CNVF-001 之掃描器不涵蓋)${bad.length} 處, 須先改為常規形式或擴充掃描器:\n${bad.join('\n')}`)
    })

    it('CNVF-002c 掃描器自測: 對 .vue 之 <script> 區與各種盲點寫法確實回報(防掃描器空轉)', function() {
        let fd = path.join(projRoot, 'test', '_tmp', 'consoleNoValuesFront-scan')
        let fpVue = path.join(fd, 'Sample.vue')
        let fpJs = path.join(fd, 'sample.mjs')
        fs.mkdirSync(fd, { recursive: true })
        try {
            let linesVue = [
                '<template><div></div></template>',
                '<script>',
                'export default {',
                '    methods: {',
                '        f: function() {',
                '            console.log(\'user\', user)',
                '            console.log(\'ok\', describeShape(user), describeErr(err))',
                '        },',
                '    },',
                '}',
                '</script>',
            ]
            fs.writeFileSync(fpVue, linesVue.join('\n'), 'utf8')
            //第 1 別名、2 解構、3 括號存取、4 傳遞、5 table、6 區塊註解後接呼叫 皆為盲點寫法; 第 7 行合格
            let linesJs = [
                'let c = console',
                'let { log } = console',
                'console[\'log\'](x)',
                'p.catch(console.log)',
                'console.table(rows)',
                '/* x */ console.log(user)',
                'console.log(\'固定字面值\')',
            ]
            fs.writeFileSync(fpJs, linesJs.join('\n'), 'utf8')
            let v = scanConsoleValueArgs(fpVue, 'code', {})
            A.deepEqual(v.map((x) => Number(/:(\d+)/.exec(x)[1])), [6], `.vue 之 <script> 內 console.log('user', user) 須被回報(第 6 行), 實得 ${v.join(' | ')}`)
            let o = findOddConsoleRefs(fpJs)
            A.deepEqual(o.map((x) => Number(/:(\d+):/.exec(x)[1])).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6], `非常規引用須回報第 1～6 行(第 7 行合格), 實得 ${o.join(' | ')}`)
        }
        finally {
            fs.rmSync(fd, { recursive: true, force: true })
        }
    })

    it('CNVF-003 describeShape／describeErr 單一實作(src/js/describeShape.mjs): maskLog 轉出同一函數; 依賴閉包不含 Node 內建模組', function() {
        A.ok(dsMaskLog === describeShape && deMaskLog === describeErr, 'server/maskLog.mjs 須轉出 src/js/describeShape.mjs 之同一函數(不另寫等價實作, 規格 D1)')
        let code = sourceLines(path.join(projRoot, 'server', 'maskLog.mjs'), 'code').map((l) => l.text).join('\n')
        A.ok(!/function describeShape\(|function describeErr\(/.test(code), 'server/maskLog.mjs 不得自寫 describeShape／describeErr')
        //閉包(相對匯入): src/js/describeShape.mjs → wsemi 之 isarr、getDiagBriefErr(再往下 _diagCodes／_diagKit／_pmMarkHandled); 不得靜態匯入 Node 內建模組
        let entries = [
            path.join(projRoot, 'src', 'js', 'describeShape.mjs'),
            path.join(projRoot, 'node_modules', 'wsemi', 'src', 'isarr.mjs'),
            path.join(projRoot, 'node_modules', 'wsemi', 'src', 'getDiagBriefErr.mjs'),
        ]
        let builtins = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)])
        let all = new Set()
        for (let e of entries) {
            for (let fp of importClosure(e)) {
                all.add(fp)
            }
        }
        A.ok(all.size >= 5, `閉包應至少含 5 檔(describeShape、isarr、getDiagBriefErr 及其私有依賴), 實得 ${all.size}`)
        let hits = []
        for (let fp of all) {
            let t = fs.readFileSync(fp, 'utf8')
            let re = /(?:^|\n)\s*(?:import|export)\s[^'"\n]*?from\s*['"]([^'"]+)['"]|(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g
            let m
            while ((m = re.exec(t)) !== null) {
                let spec = m[1] || m[2]
                if (builtins.has(spec)) {
                    hits.push(`${rel(fp)} 匯入 ${spec}`)
                }
            }
        }
        A.deepEqual(hits, [], `前端用之摘要函數閉包不得靜態匯入 Node 內建模組(webpack 5 不自動填補): ${hits}`)
    })

    it('CNVF-004 摘要不含值: 使用者物件、授權字串、請求回應、錯誤訊息之識別值皆不出現; 輸出有界; 永不拋錯', function() {
        const SEC = 'ZZ-secret-front-5521'
        //登入成功之使用者物件(App.vue)與登入失敗回應: 只列鍵名
        let user = { id: SEC, name: SEC, email: `${SEC}@example.com`, cgrups: JSON.stringify({ [SEC]: 'y' }) }
        A.equal(describeShape(user), '(keys: id,name,email,cgrups)')
        A.ok(!describeShape(user).includes(SEC))
        //授權字串(VeCgrups／VeCpemis／VeCrules 之 console.log('cgrups', cgrups)): 只標型別
        A.equal(describeShape(JSON.stringify({ [SEC]: 'y' })), '(typeof string)')
        //選取列陣列(LayoutContent*): 只標筆數
        A.equal(describeShape([{ data: { id: SEC } }, { data: { id: SEC } }]), '(array, length=2)')
        //錯誤: 伺服端回傳之語系鍵(字串)、Error 本體、帶 code 之錯誤、含識別值之訊息
        for (let e of [SEC, new Error(SEC), Object.assign(new Error(SEC), { code: 'ENOENT' }), { message: SEC }, { err: SEC }]) {
            let s = describeErr(e)
            A.ok(!s.includes(SEC), `describeErr 不得含識別值, 實得 ${s}`)
        }
        A.equal(describeErr(SEC), '(string)')
        A.equal(describeErr(new Error(SEC)), '(Error)')
        //控制字元: C0、DEL、C1(U+0085)、行／段分隔(U+2028、U+2029)、雙向文字控制(U+202E)皆換成 '?', 不可偽造 log 行或改變顯示順序(2026-11-23 獨立複審指出原只換 < 32 與 127)
        let ctl = {}
        for (let [k, x] of [['a', 0x2028], ['c', 0x202e], ['e', 0x85], ['g', 0x2029], ['i', 7], ['k', 0x7f], ['m', 0x2067]]) {
            ctl[`${k}${String.fromCharCode(x)}z`] = 1 //以 fromCharCode 組成, 原始碼不含字面控制字元
        }
        A.equal(describeShape(ctl), '(keys: a?z,c?z,e?z,g?z,i?z,k?z,m?z)')
        //一般文字(含中文與全形標點)不受影響
        A.equal(describeShape({ '名稱': 1, 'user-id': 2 }), '(keys: 名稱,user-id)')
        //有界與不拋錯
        let huge = {}
        for (let i = 0; i < 3000; i++) {
            huge[`k${i}${SEC}`] = 1
        }
        A.ok(describeShape(huge).length < 1500)
        let evil = new Proxy({}, {
            ownKeys: () => {
                throw new Error(SEC)
            },
        })
        A.doesNotThrow(() => describeShape(evil))
        A.ok(!describeShape(evil).includes(SEC))
        A.doesNotThrow(() => describeErr(evil))
    })
})
