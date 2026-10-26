//把「差異僅為表頭字形 員→者」之 A 類新圖覆蓋到 test/pics(只此 56 張), 並先留 舊圖/新圖/差異 三列放大證據到 spec/evidence/perm-run01-20261026/diff/
//用法: node tmp/perm-run01/apply.mjs <classified.json>
import fs from 'fs'
import path from 'path'
import sharp from 'sharp'

let cls = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
let evDir = path.resolve('spec/evidence/perm-run01-20261026/diff')
let oldDir = path.resolve('tmp/perm-run01/old')
fs.mkdirSync(evDir, { recursive: true })
fs.mkdirSync(oldDir, { recursive: true })
console.log('evidence dir', evDir)
console.log('A count', cls.A.length)

let scale = 5
let list = []
for (let r of cls.A) {
    //授權範圍護欄: 只限 cht 圖、差異像素 108、外框為單一字形
    let [x0, y0, x1, y1] = r.bbox
    if (!r.name.includes('-cht-') || r.exactDiff > 120 || x1 - x0 > 11 || y1 - y0 > 11) throw new Error('out of authorized scope: ' + r.name)
    let left = 1296
    let top = Math.max(0, y0 - 8)
    let w = 144
    let h = 26
    let crop = async (p) => await sharp(p).extract({ left, top, width: w, height: h }).resize(w * scale, h * scale, { kernel: 'nearest' }).png().toBuffer()
    let a = await crop(r.basePath)
    let b = await crop(r.newPath)
    let d = await sharp(a).composite([{ input: b, blend: 'difference' }]).png().toBuffer()
    let gap = 6
    let W = w * scale
    let H = h * scale
    let out = path.join(evDir, r.name.replace(/\.png$/, '') + '.diff.png')
    await sharp({ create: { width: W, height: H * 3 + gap * 2, channels: 3, background: { r: 200, g: 200, b: 200 } } })
        .composite([{ input: a, left: 0, top: 0 }, { input: b, left: 0, top: H + gap }, { input: d, left: 0, top: (H + gap) * 2 }])
        .png({ compressionLevel: 9 }).toFile(out)
    fs.copyFileSync(r.basePath, path.join(oldDir, r.name))
    fs.copyFileSync(r.newPath, r.basePath)
    list.push({ name: r.name, exactDiff: r.exactDiff, pixelmatch: r.pm, bbox: r.bbox, base: path.relative(process.cwd(), r.basePath).replace(/\\/g, '/') })
}
fs.writeFileSync(path.join(path.dirname(evDir), 'regen-list.json'), JSON.stringify(list, null, 1))
console.log('applied', list.length)
