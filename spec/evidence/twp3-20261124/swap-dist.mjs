//暫時以新建之前端建置檔覆蓋 ./dist(供 e2e-init 等「後端 serve dist」之案例驗證現行 src 之正式建置), 用畢還原(承 twp2-20261123/swap-dist.mjs, 備份位置改為 ./tmp/twp3, 新增 backup 模式與 status 模式)
//用法(cwd 為 repo 根): node spec/evidence/twp3-20261124/swap-dist.mjs backup   |   use <新建置夾>   |   restore   |   status
//  backup: 改動前之 ./dist 全部檔案原位元組複製至 ./tmp/twp3/dist-backup(已存在即拒絕, 免覆蓋先前之備份), 並以檔數與逐檔 sha256 回驗
//  use: 新建置之 js／css 複製進 ./dist(新增雜湊檔名, 舊檔保留), index.html 依 toolg/genEntry.mjs 之規則(/mperm/ → {sfd}/)寫成 ./dist/index.tmp
//  restore: 刪 ./dist 後自備份還原(原位元組), 並以檔數與逐檔 sha256 回驗
//  status: 列出 ./dist 與備份之檔數及是否逐檔相同(結束前核對; 另以 git status --short dist 核對版控內之檔)
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

const root = process.cwd()
const dist = path.join(root, 'dist')
const bak = path.join(root, 'tmp', 'twp3', 'dist-backup')
const sha = (fp) => crypto.createHash('sha256').update(fs.readFileSync(fp)).digest('hex')
const walk = (d, base = d) => {
    let out = []
    for (let n of fs.readdirSync(d, { withFileTypes: true })) {
        let fp = path.join(d, n.name)
        if (n.isSymbolicLink()) {
            throw new Error(`目錄內有連結, 拒絕處理: ${fp}`)
        }
        if (n.isDirectory()) {
            out.push(...walk(fp, base))
        }
        else {
            out.push(path.relative(base, fp).replace(/\\/g, '/'))
        }
    }
    return out.sort()
}
const same = () => {
    let a = walk(bak)
    let b = walk(dist)
    return { na: a.length, nb: b.length, ok: JSON.stringify(a) === JSON.stringify(b) && a.every((f) => sha(path.join(bak, f)) === sha(path.join(dist, f))) }
}
const mode = process.argv[2]
if (mode === 'backup') {
    if (fs.existsSync(bak)) {
        console.log(`[swap] 備份已存在: ${path.relative(root, bak)}, 拒絕覆蓋`)
        process.exitCode = 1
    }
    else {
        fs.mkdirSync(path.dirname(bak), { recursive: true })
        fs.cpSync(dist, bak, { recursive: true })
        let r = same()
        console.log(`[swap] backup: 檔數 ${r.nb}(備份 ${r.na}), 逐檔 sha256 ${r.ok ? '相同' : '不同!'}`)
        process.exitCode = r.ok ? 0 : 1
    }
}
else if (mode === 'use') {
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
    let r = same()
    console.log(`[swap] restore: 檔數 ${r.nb}(備份 ${r.na}), 逐檔 sha256 ${r.ok ? '相同' : '不同!'}`)
    process.exitCode = r.ok ? 0 : 1
}
else if (mode === 'status') {
    let r = same()
    console.log(`[swap] status: dist ${r.nb} 檔／備份 ${r.na} 檔, 逐檔 sha256 ${r.ok ? '相同' : '不同'}`)
    process.exitCode = r.ok ? 0 : 1
}
else {
    console.log('usage: backup | use <dir> | restore | status')
    process.exitCode = 2
}
