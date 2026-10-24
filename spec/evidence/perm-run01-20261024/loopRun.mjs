//重複執行同一測試指令 N 次(經 quiet-run 取鎖), 彙整離開碼與失敗摘要; 用法: node loopRun.mjs <次數> <名稱> -- <指令...>
import { spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'

let argv = process.argv.slice(2)
let n = Number(argv[0])
let name = argv[1]
let iSep = argv.indexOf('--')
let cmd = argv.slice(iSep + 1)
let outDir = path.resolve('./tmp/perm-run01/loop')
fs.mkdirSync(outDir, { recursive: true })
let results = []
for (let i = 1; i <= n; i++) {
    let t0 = Date.now()
    let r = spawnSync('node', ['C:/opensrcOper/tools/quiet-run.mjs', '--lock', '--name', `${name}-${i}`, '--timeout', '1200', '--', ...cmd], { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 })
    let out = (r.stdout || '') + (r.stderr || '')
    fs.writeFileSync(path.join(outDir, `${name}-${i}.txt`), out, 'utf8')
    let m = out.match(/(\d+) passing/)
    let f = out.match(/(\d+) failing/)
    results.push({ i, exit: r.status, passing: m ? Number(m[1]) : null, failing: f ? Number(f[1]) : 0, sec: Math.round((Date.now() - t0) / 1000) })
    console.log(JSON.stringify(results[results.length - 1]))
}
let nFail = results.filter((x) => x.exit !== 0).length
console.log(`SUMMARY name=${name} runs=${n} failedRuns=${nFail}`)
fs.writeFileSync(path.join(outDir, `${name}-summary.json`), JSON.stringify(results, null, 2), 'utf8')
