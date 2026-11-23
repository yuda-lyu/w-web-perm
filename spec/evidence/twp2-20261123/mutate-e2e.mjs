//真瀏覽器變異(twp2): E1 登入成功改印使用者物件(App.vue)、E2 getWebInfor 失敗改印錯誤本體(main.js); 兩項各由 E2E-CN-001／E2E-CN-002 擊殺, 同時植入、一次跑 e2e-consoleNoValues
//用法: node ./tmp/twp2/mutate-e2e.mjs   (cwd 為 repo 根; 由 quiet-run --lock 包住)
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { spawnSync } from 'child_process'

const root = process.cwd()
const mocha = path.join(root, 'node_modules', 'mocha', 'bin', 'mocha.js')
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex')
const edits = [
    { id: 'E1', file: 'src/App.vue', from: 'console.log(\'login success\', getDiagShape(data.user))', to: 'console.log(\'login success\', data.user)', killer: 'E2E-CN-001' },
    { id: 'E2', file: 'src/main.js', from: 'console.log(\'getWebInfor catch\', getDiagBriefErr(err))', to: 'console.log(\'getWebInfor catch\', err)', killer: 'E2E-CN-002' },
]
let saved = []
try {
    for (let e of edits) {
        let fp = path.join(root, e.file)
        let before = fs.readFileSync(fp, 'utf8')
        let n = before.split(e.from).length - 1
        if (n !== 1) {
            throw new Error(`${e.id} 錨點出現 ${n} 次`)
        }
        saved.push({ fp, before, id: e.id })
        fs.writeFileSync(fp, before.replace(e.from, () => e.to), 'utf8')
    }
    let r = spawnSync(process.execPath, [mocha, '--no-parallel', 'test/e2e-consoleNoValues.test.mjs', '--reporter', 'list', '--timeout', '300000'], { cwd: root, encoding: 'utf8', timeout: 1200000, windowsHide: true, maxBuffer: 64 * 1024 * 1024 })
    let out = `${r.stdout || ''}\n${r.stderr || ''}`
    let failTitles = [...out.matchAll(/^\s+\d+\) .*?(E2E-CN-\d+)/gm)].map((m) => m[1])
    let np = /(\d+) passing/.exec(out)
    let nf = /(\d+) failing/.exec(out)
    console.log(`passing=${np ? np[1] : 0} failing=${nf ? nf[1] : 0} failTitles=${[...new Set(failTitles)].join(',')}`)
    for (let e of edits) {
        console.log(`[${e.id}] ${failTitles.includes(e.killer) ? 'KILLED' : 'SURVIVED'} (by ${e.killer})`)
    }
    let msgs = [...out.matchAll(/AssertionError.*\n/g)].map((m) => m[0].trim().slice(0, 220))
    console.log(msgs.slice(0, 4).join('\n'))
}
finally {
    for (let s of saved) {
        fs.writeFileSync(s.fp, s.before, 'utf8')
        console.log(`[restore] ${s.id} ${sha(fs.readFileSync(s.fp, 'utf8')) === sha(s.before) ? 'OK' : 'MISMATCH'}`)
    }
}
