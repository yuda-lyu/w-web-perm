//暫時以新建之前端建置檔覆蓋 ./dist(供 e2e-init 等「後端 serve dist」之案例驗證現行 src 之正式建置), 用畢還原
//用法: node ./tmp/twp2/swap-dist.mjs use <新建置夾>   |   node ./tmp/twp2/swap-dist.mjs restore
//  use: 新建置之 js／css 複製進 ./dist(新增雜湊檔名, 舊檔保留), index.html 依 toolg/genEntry.mjs 之規則(/mperm/ → {sfd}/)寫成 ./dist/index.tmp
//  restore: 刪 ./dist 後自 ./tmp/twp2/dist-backup 還原(備份為改動前之 ./dist 全部檔案), 並以檔數與逐檔 sha256 回驗
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

const root = process.cwd()
const dist = path.join(root, 'dist')
const bak = path.join(root, 'tmp', 'twp2', 'dist-backup')
const sha = (fp) => crypto.createHash('sha256').update(fs.readFileSync(fp)).digest('hex')
const walk = (d, base = d) => {
    let out = []
    for (let n of fs.readdirSync(d, { withFileTypes: true })) {
        let fp = path.join(d, n.name)
        if (n.isDirectory()) {
            out.push(...walk(fp, base))
        }
        else {
            out.push(path.relative(base, fp).replace(/\\/g, '/'))
        }
    }
    return out.sort()
}
const mode = process.argv[2]
if (mode === 'use') {
    let src = path.resolve(root, process.argv[3])
    for (let sub of ['js', 'css']) {
        fs.cpSync(path.join(src, sub), path.join(dist, sub), { recursive: true })
    }
    let c = fs.readFileSync(path.join(src, 'index.html'), 'utf8').split('/mperm/').join('{sfd}/')
    fs.writeFileSync(path.join(dist, 'index.tmp'), c, 'utf8')
    console.log(`[swap] use ${path.relative(root, src)}: dist 檔數 ${walk(dist).length}`)
}
else if (mode === 'restore') {
    fs.rmSync(dist, { recursive: true, force: true })
    fs.cpSync(bak, dist, { recursive: true })
    let a = walk(bak)
    let b = walk(dist)
    let same = JSON.stringify(a) === JSON.stringify(b) && a.every((f) => sha(path.join(bak, f)) === sha(path.join(dist, f)))
    console.log(`[swap] restore: 檔數 ${b.length}(備份 ${a.length}), 逐檔 sha256 ${same ? '相同' : '不同!'}`)
    process.exitCode = same ? 0 : 1
}
else {
    console.log('usage: use <dir> | restore')
    process.exitCode = 2
}
