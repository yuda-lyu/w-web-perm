//分類 cmpdirs 之輸出: A 表頭字形(員→者)唯一差異 / B eng 既有 1 像素雜訊(pm 0) / C 其他(須停下回報)
//用法: node tmp/perm-run01/classify.mjs <cmp.json> <outList.json>
import fs from 'fs'

let [inp, outp] = process.argv.slice(2)
let rows = JSON.parse(fs.readFileSync(inp, 'utf8'))
let A = []
let B = []
let C = []
let I = []
for (let r of rows) {
    if (r.status === 'IDENTICAL') { I.push(r.name); continue }
    if (r.status !== 'DIFF') { C.push(r); continue }
    let [x0, y0, x1, y1] = r.bbox
    let isGlyph = r.name.includes('-cht-') && r.exactDiff <= 120 && x0 >= 1404 && x1 <= 1415 && (y1 - y0) <= 11 && (x1 - x0) <= 11
    let isNoise = r.name.includes('-eng-') && r.exactDiff === 1 && x0 === 60 && y0 === 47 && x1 === 60 && y1 === 47 && r.pm === 0
    if (isGlyph) A.push(r)
    else if (isNoise) B.push(r)
    else C.push(r)
}
console.log('IDENTICAL', I.length, 'A(header-glyph-only cht)', A.length, 'B(eng 1px noise, pm0)', B.length, 'C(other)', C.length)
let byFlow = {}
for (let r of A) { let f = r.name.split('-')[0] + (r.name.startsWith('rela-user-grup') ? '-user-grup' : '').replace(/^-user-grup$/, ''); byFlow[r.name.startsWith('rela-user-grup') ? 'rela-user-grup' : r.name.startsWith('external-rows') ? 'external-rows' : r.name.startsWith('ref-cascade') ? 'ref-cascade' : r.name.split('-')[0]] = (byFlow[r.name.startsWith('rela-user-grup') ? 'rela-user-grup' : r.name.startsWith('external-rows') ? 'external-rows' : r.name.startsWith('ref-cascade') ? 'ref-cascade' : r.name.split('-')[0]] || 0) + 1 }
console.log('A by flow', JSON.stringify(byFlow))
let pmMax = Math.max(...A.map((r) => r.pm))
console.log('A: exactDiff set', JSON.stringify([...new Set(A.map((r) => r.exactDiff))]), 'pm range', Math.min(...A.map((r) => r.pm)), pmMax)
for (let r of C) console.log('C', r.name, r.status, r.exactDiff, r.pm, JSON.stringify(r.bbox))
fs.writeFileSync(outp, JSON.stringify({ A: A.map((r) => ({ name: r.name, basePath: r.basePath, newPath: r.newPath, exactDiff: r.exactDiff, pm: r.pm, bbox: r.bbox })), B: B.map((r) => r.name), C, I }, null, 1))
