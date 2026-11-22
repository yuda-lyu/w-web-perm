//第 301 項最小重現(父行程): 逐候選以逾時保護之子行程跑 genPlan; 逾時(預設 6s)視為無窮迴圈
//用法: node repro301-run.mjs <模組相對路徑> [逾時ms]
import { spawnSync } from 'child_process'
import path from 'path'

let modRel = process.argv[2]
let timeout = Number(process.argv[3] || 6000)
let names = ['str7', 'strAbc', 'strEmpty', 'NaN', 'neg1', 'negHuge', 'Infinity', 'negInfinity', 'obj', 'arr', 'nul', 'undef', 'true', 'float1.5', 'zero', 'int7', 'huge1e20', 'big3650', 'big3651', 'big100000']
let child = path.resolve('./tmp/twp1/repro301-child.mjs')
for (let n of names) {
    let r = spawnSync(process.execPath, [child, n, modRel], { timeout, windowsHide: true, encoding: 'utf8', killSignal: 'SIGKILL' })
    if (r.error && r.error.code === 'ETIMEDOUT') {
        console.log(JSON.stringify({ name: n, hang: true, note: `timeout ${timeout}ms (無窮迴圈或過慢)` }))
    }
    else {
        let out = String(r.stdout || '').trim().split('\n').pop()
        console.log(out || JSON.stringify({ name: n, status: r.status, stderr: String(r.stderr || '').slice(0, 200) }))
    }
}
