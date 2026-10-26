//裁切 baseline / new / 差異 三列並排放大: node tmp/perm-run01/crop.mjs <base> <new> <out> <x> <y> <w> <h> [scale]
import sharp from 'sharp'

let [base, now, out, x, y, w, h, scale] = process.argv.slice(2)
x = Number(x); y = Number(y); w = Number(w); h = Number(h); scale = Number(scale || 3)
let crop = async (p) => await sharp(p).extract({ left: x, top: y, width: w, height: h }).resize(w * scale, h * scale, { kernel: 'nearest' }).png().toBuffer()
let a = await crop(base)
let b = await crop(now)
let d = await sharp(a).composite([{ input: b, blend: 'difference' }]).png().toBuffer()
let gap = 6
let W = w * scale
let H = h * scale
await sharp({ create: { width: W, height: H * 3 + gap * 2, channels: 3, background: { r: 200, g: 200, b: 200 } } })
    .composite([{ input: a, left: 0, top: 0 }, { input: b, left: 0, top: H + gap }, { input: d, left: 0, top: (H + gap) * 2 }])
    .png().toFile(out)
console.log('wrote', out)
