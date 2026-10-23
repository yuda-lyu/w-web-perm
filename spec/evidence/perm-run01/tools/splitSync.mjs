//rulebook_sync.md 依類型分拆(perm-run01 sgud 整理): 只搬移、不刪不改內容, 節(###)之標題與內文逐字不變; 搬完以「###節之 multiset 位元組相等」回驗
//  rulebook_sync.md          : 名稱唯一／對應鍵(R-NAME-UNIQ-*／R-MAPKEY-*)、引用連帶(R-REF-CASCADE-01)、外部匯入(R-IMPORT-01) + 分拆索引
//  rulebook_sync_lock.md     : R-WRITE-LOCK-01／02
//  rulebook_sync_external.md : 外部列受保護(R-EXT-OWN-01)、離線維運工具出貨(R-SHIP-TOOLS-01)
//  rulebook_sync_baseline.md : R-BASELINE-01、R-DRAFT-KEEP-01、R-RELOAD-GUARD-01
//用法: node tmp/perm-run01/splitSync.mjs [--check]  (--check 只解析與印出分組, 不寫檔)
import fs from 'fs'
import path from 'path'

const dir = path.resolve('./sgud/rule')
const srcPath = path.join(dir, 'rulebook_sync.md')
const raw = fs.readFileSync(srcPath, 'utf8')
const eol = raw.includes('\r\n') ? '\r\n' : '\n'
const lines = raw.split(eol)

//解析區塊: 標題行(# ／## ／### , 圍欄外)起算至下一個標題行前
const parse = (ls) => {
    const blocks = []
    let inFence = false
    let cur = { level: 1, head: null, lines: [] }
    ls.forEach((ln, i) => {
        if (/^\s*```/.test(ln)) {
            inFence = !inFence
        }
        const m = !inFence && ln.match(/^(#{1,3}) /)
        if (m && (cur.lines.length > 0 || cur.head !== null)) {
            blocks.push(cur)
            cur = { level: m[1].length, head: ln, lines: [ln] }
        }
        else {
            if (m) {
                cur.level = m[1].length
                cur.head = ln
            }
            cur.lines.push(ln)
        }
    })
    blocks.push(cur)
    return blocks
}
const blocks = parse(lines)
const textOf = (b) => b.lines.join(eol).trimEnd()
const idOf = (b) => (b.head || '').match(/^###\s+(R-[A-Z0-9-]+)/)?.[1] || null

const GROUP = {
    'R-WRITE-LOCK-01': 'lock',
    'R-WRITE-LOCK-02': 'lock',
    'R-EXT-OWN-01': 'external',
    'R-SHIP-TOOLS-01': 'external',
    'R-BASELINE-01': 'baseline',
    'R-DRAFT-KEEP-01': 'baseline',
    'R-RELOAD-GUARD-01': 'baseline',
}

//## 區塊(含其前言)與 # 抬頭之歸屬
const H2_GROUP = (b) => {
    if (b.level === 2 && /^## 外部列受保護與過期快照基準/.test(b.head)) {
        return 'external'
    }
    return 'sync'
}

const out = { sync: [], lock: [], external: [], baseline: [] }
blocks.forEach((b) => {
    if (b.level === 3) {
        const id = idOf(b)
        out[GROUP[id] || 'sync'].push(b)
    }
    else {
        out[H2_GROUP(b)].push(b)
    }
})

const summary = Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.map((b) => (b.level === 3 ? idOf(b) : b.head.slice(0, 40)))]))
console.log(JSON.stringify(summary, null, 1))
if (process.argv.includes('--check')) {
    process.exit(0)
}

const H1 = '# 規則帳本'
const NOTE = (extra) => `本檔為 \`sgud/rule/rulebook.md\` 之分冊(2026-10-22 主控依使用者指示自原 312KB 之帳本依類型分拆; 2026-10-23 perm-run01 再將 \`rulebook_sync.md\`〔73KB〕依類型拆為四冊, 節(###)之標題與內容不變, 依規則編號 \`R-…\` 查找者請用 \`rulebook.md\` 之索引).${extra}`

const INDEX = [
    '| 規則 | 所在分冊 |',
    '|---|---|',
    '| R-NAME-UNIQ-01／02／03、R-MAPKEY-01／02、R-REF-CASCADE-01、R-IMPORT-01 | 本冊 `rulebook_sync.md` |',
    '| R-WRITE-LOCK-01／02(表鎖取鎖階層) | `rulebook_sync_lock.md` |',
    '| R-EXT-OWN-01(外部列守門)、R-SHIP-TOOLS-01(離線維運工具出貨) | `rulebook_sync_external.md` |',
    '| R-BASELINE-01(載入基準)、R-DRAFT-KEEP-01(草稿保留)、R-RELOAD-GUARD-01(程式端重載旗標) | `rulebook_sync_baseline.md` |',
    '| 多人同時編輯之落地規則(perm-run01 新增: 寫入契約、鎖共用、存檔回傳列、對話框主體身分等) | `rulebook_concurrent.md` |',
].join(eol)

const render = (name, title, extraNote, headBlocks, bodyBlocks, withIndex) => {
    const parts = [`${H1}:${title}`, '', NOTE(extraNote), '']
    if (withIndex) {
        parts.push('## 分拆索引(2026-10-23 perm-run01)', '', INDEX, '')
    }
    const body = [...headBlocks, ...bodyBlocks].map((b) => b.lines.join(eol).trimEnd()).join(eol + eol)
    fs.writeFileSync(path.join(dir, name), parts.join(eol) + eol + body + eol, 'utf8')
}

//sync(留): 原 H1 抬頭行不再沿用(以新抬頭取代), 其餘 ## 區塊與其 ### 子節原樣
const syncBlocks = out.sync.filter((b) => !(b.level === 1))
render('rulebook_sync.md', '名稱唯一、引用連帶與外部匯入', '', [], syncBlocks, true)

const extHead = out.external.filter((b) => b.level === 2)
const extBody = out.external.filter((b) => b.level === 3)
render('rulebook_sync_external.md', '外部列受保護與離線維運工具', '本冊收自 `rulebook_sync.md` 之「外部列受保護與過期快照基準」一節的 R-EXT-OWN-01、R-SHIP-TOOLS-01; 同節之 R-BASELINE-01、R-DRAFT-KEEP-01、R-RELOAD-GUARD-01 在 `rulebook_sync_baseline.md`.', extHead, extBody, false)

const LOCK_H2 = { level: 2, head: '## 寫入取鎖', lines: ['## 寫入取鎖(自 `rulebook_sync.md`「名稱唯一與對應鍵檢查」一節搬入; R-WRITE-LOCK-01／02 之標題與內容不變)', ''] }
render('rulebook_sync_lock.md', '寫入取鎖與表鎖階層', '', [LOCK_H2], out.lock, false)

const BASE_H2 = { level: 2, head: '## 載入基準與草稿保留', lines: ['## 外部列受保護與過期快照基準(續: 載入基準、草稿保留與重載旗標; 自 `rulebook_sync.md` 搬入, 原一節之後三條; 2026-10-22 run07／run11／run12, 2026-10-23 perm-run01 改寫 R-BASELINE-01、R-DRAFT-KEEP-01)', ''] }
render('rulebook_sync_baseline.md', '載入基準、草稿保留與重載旗標', '多人同時編輯之寫入契約落地(鎖共用、存檔回傳列、對話框主體身分等)另見 `rulebook_concurrent.md`.', [BASE_H2], out.baseline, false)

//—— 回驗: 四冊之 ### 節(去尾端空白)multiset 與原檔逐字相等; 並核對 ## 前言區塊皆保留 ——
const files = ['rulebook_sync.md', 'rulebook_sync_lock.md', 'rulebook_sync_external.md', 'rulebook_sync_baseline.md']
const newBlocks = files.flatMap((f) => parse(fs.readFileSync(path.join(dir, f), 'utf8').split(eol)))
const sig = (bs) => bs.filter((b) => b.level === 3).map((b) => textOf(b)).sort()
const a = sig(blocks)
const b = sig(newBlocks)
const sameCount = a.length === b.length
const sameAll = sameCount && a.every((v, i) => v === b[i])
const bytes = (arr) => arr.reduce((n, s) => n + Buffer.byteLength(s), 0)
const h2Orig = blocks.filter((x) => x.level === 2).map(textOf)
const h2New = new Set(newBlocks.filter((x) => x.level === 2).map(textOf))
const h2Kept = h2Orig.filter((t) => h2New.has(t)).length
console.log(JSON.stringify({
    sections: a.length,
    sectionsAfter: b.length,
    allSectionsByteEqual: sameAll,
    sectionBytesBefore: bytes(a),
    sectionBytesAfter: bytes(b),
    h2OriginalCount: h2Orig.length,
    h2KeptVerbatim: h2Kept,
    sizes: Object.fromEntries(files.map((f) => [f, fs.statSync(path.join(dir, f)).size])),
}, null, 1))
if (!sameAll) {
    process.exitCode = 3
}
