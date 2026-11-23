//真瀏覽器變異 E3(twp2): App.vue 之 login error 改印物件本身(含 msg／text 之值), 應由 e2e-init E2E-006 擊殺(新斷言: 主控台 login error 為鍵名摘要且不含值)
//  E2E-006 開啟之頁面由後端 serve ./dist(server 注入語系), 不經 dev server, 故須以變異後之 src 重新建置並暫時覆蓋 ./dist(首版只改 src 未建置, 該案存活——因測試看的是舊建置檔)
//用法: node ./tmp/twp2/mutate-e2e3.mjs   (cwd 為 repo 根; 由 quiet-run --lock 包住; 用畢還原 src 與 ./dist)
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { spawnSync } from 'child_process'

const root = process.cwd()
const mocha = path.join(root, 'node_modules', 'mocha', 'bin', 'mocha.js')
const vcs = path.join(root, 'node_modules', '@vue', 'cli-service', 'bin', 'vue-cli-service.js')
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex')
const e = { id: 'E3', file: 'src/App.vue', from: 'console.log(\'login error\', getDiagShape(data))', to: 'console.log(\'login error\', data)' }
let fp = path.join(root, e.file)
let before = fs.readFileSync(fp, 'utf8')
const run = (args) => spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', timeout: 1200000, windowsHide: true, maxBuffer: 64 * 1024 * 1024 })
try {
    let n = before.split(e.from).length - 1
    if (n !== 1) {
        throw new Error(`錨點出現 ${n} 次`)
    }
    fs.writeFileSync(fp, before.replace(e.from, () => e.to), 'utf8')
    fs.rmSync(path.join(root, 'tmp', 'twp2', 'dist-mut'), { recursive: true, force: true })
    let b = run([vcs, 'build', '--dest', './tmp/twp2/dist-mut'])
    console.log(`[build] exit=${b.status} ${/Build complete/.test(String(b.stdout)) ? 'complete' : 'NOT complete'}`)
    let sw = run([path.join(root, 'tmp', 'twp2', 'swap-dist.mjs'), 'use', 'tmp/twp2/dist-mut'])
    console.log(String(sw.stdout).trim())
    let r = run([mocha, '--no-parallel', 'test/e2e-init.test.mjs', '--grep', 'E2E-006-ambiguous', '--reporter', 'list', '--timeout', '300000'])
    let out = `${r.stdout || ''}\n${r.stderr || ''}`
    let np = /(\d+) passing/.exec(out)
    let nf = /(\d+) failing/.exec(out)
    console.log(`passing=${np ? np[1] : 0} failing=${nf ? nf[1] : 0}`)
    console.log(`[E3] ${nf && Number(nf[1]) > 0 ? 'KILLED' : 'SURVIVED'} (by e2e-init E2E-006)`)
    console.log([...out.matchAll(/AssertionError.*\n/g)].map((m) => m[0].trim().slice(0, 300)).slice(0, 2).join('\n'))
}
finally {
    fs.writeFileSync(fp, before, 'utf8')
    console.log(`[restore src] E3 ${sha(fs.readFileSync(fp, 'utf8')) === sha(before) ? 'OK' : 'MISMATCH'}`)
    let rs = run([path.join(root, 'tmp', 'twp2', 'swap-dist.mjs'), 'restore'])
    console.log(String(rs.stdout).trim())
}
