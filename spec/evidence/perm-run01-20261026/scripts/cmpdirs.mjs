//比對新產圖(暫存目錄)與 test/pics 現行標準圖: 逐張列 尺寸/精確差異像素數/差異外框/pixelmatch 計數
//用法: node tmp/perm-run01/cmpdirs.mjs <newDir> <baseDir> <outJson>
import fs from 'fs'
import path from 'path'
import { PNG } from 'pngjs'
import pixelmatch from 'pixelmatch'

let [newDir, baseDir, outJson] = process.argv.slice(2)
console.log('newDir', path.resolve(newDir), 'baseDir', path.resolve(baseDir))

let walk = (d) => {
    let out = []
    for (let n of fs.readdirSync(d, { withFileTypes: true })) {
        let p = path.join(d, n.name)
        if (n.isDirectory()) out.push(...walk(p))
        else if (n.name.endsWith('.png')) out.push(p)
    }
    return out
}

let rows = []
let newFiles = walk(newDir)
for (let f of newFiles) {
    let name = path.basename(f)
    let flow = name.split('-')[0]
    //標準圖在 test/pics/<flow>/ (flow 含連字號者另行對應)
    let cands = [path.join(baseDir, name)]
    let flowDirs = fs.readdirSync(baseDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
    let hit = flowDirs.find((d) => name.startsWith(d + '-'))
    if (hit) cands.unshift(path.join(baseDir, hit, name))
    let bp = cands.find((p) => fs.existsSync(p))
    if (!bp) { rows.push({ name, status: 'NO-BASELINE' }); continue }
    let a = PNG.sync.read(fs.readFileSync(bp))
    let b = PNG.sync.read(fs.readFileSync(f))
    if (a.width !== b.width || a.height !== b.height) {
        rows.push({ name, status: 'SIZE-DIFF', base: [a.width, a.height], now: [b.width, b.height] })
        continue
    }
    let n = 0
    let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1
    for (let y = 0; y < a.height; y++) {
        for (let x = 0; x < a.width; x++) {
            let i = (y * a.width + x) * 4
            if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2] || a.data[i + 3] !== b.data[i + 3]) {
                n++
                if (x < minX) minX = x
                if (y < minY) minY = y
                if (x > maxX) maxX = x
                if (y > maxY) maxY = y
            }
        }
    }
    let pm = pixelmatch(a.data, b.data, null, a.width, a.height, { includeAA: false, threshold: 0.1 })
    rows.push({ name, status: n === 0 ? 'IDENTICAL' : 'DIFF', exactDiff: n, pm, bbox: n ? [minX, minY, maxX, maxY] : null, w: a.width, h: a.height, basePath: bp, newPath: f })
}
fs.writeFileSync(outJson, JSON.stringify(rows, null, 1))
let cnt = {}
for (let r of rows) cnt[r.status] = (cnt[r.status] || 0) + 1
console.log('summary', JSON.stringify(cnt))
for (let r of rows.filter((x) => x.status !== 'IDENTICAL')) console.log(r.status, r.name, r.exactDiff ?? '', r.pm ?? '', JSON.stringify(r.bbox ?? ''))
