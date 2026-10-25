// E2E-008 不穩定度量測: 同一案例(未改碼)重跑 N 次, 統計失敗率(用法: node tmp/perm-run02/loop008.mjs <N> <標籤>; 需在 quiet-run --lock 內)
import { spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'

const N = Number(process.argv[2] || 10)
const label = process.argv[3] || 'x'
const root = path.resolve('.')
const outDir = path.resolve('./tmp/perm-run02/loop008')
fs.mkdirSync(outDir, { recursive: true })
let pass = 0
let fail = 0
let rows = []
for (let i = 1; i <= N; i++) {
    const r = spawnSync('node', ['node_modules/mocha/bin/mocha.js', 'test/e2e-init.test.mjs', '--grep', 'E2E-008', '--timeout', '180000', '--reporter', 'dot'], { cwd: root, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 })
    const out = (r.stdout || '') + '\n' + (r.stderr || '')
    fs.writeFileSync(path.join(outDir, `${label}-${i}.log`), out, 'utf8')
    const p = Number((/(\d+) passing/.exec(out) || [0, 0])[1])
    const f = Number((/(\d+) failing/.exec(out) || [0, 0])[1])
    const why = f > 0 ? ((/\n\s+(response\.json[^\n]*|AssertionError[^\n]*|Error[^\n]*)/.exec(out) || [0, ''])[1]).slice(0, 120) : ''
    rows.push(`${i}\tpassing=${p}\tfailing=${f}\t${why}`)
    if (r.status === 0) {
        pass++
    }
    else {
        fail++
    }
    console.log(`[loop008:${label}] ${i}/${N} exit=${r.status} passing=${p} failing=${f} ${why}`)
}
console.log(`[loop008:${label}] 結果: ${pass} 次全過, ${fail} 次含失敗(共 ${N} 次, 每次 2 案〔eng、cht〕)`)
fs.writeFileSync(path.join(outDir, `${label}-summary.tsv`), rows.join('\n'), 'utf8')
