//前端變異驗證: 暫時改寫 src 檔 → 重建 dist(npm run build + genEntry, 還原 SDK umd) → 跑 e2e-init E2E-007 → 還原 src → 重建 dist 回正確版本
import fs from 'fs'
import { spawnSync } from 'child_process'

const run = (cmd, args, opt = {}) => spawnSync(cmd, args, { encoding: 'utf8', windowsHide: true, shell: process.platform === 'win32' && cmd === 'npm', maxBuffer: 64 * 1024 * 1024, ...opt })
const rebuild = () => {
    let b = run('npm', ['run', 'build'])
    if (b.status !== 0) {
        throw new Error(`build 失敗: ${(b.stdout || '').slice(-400)}`)
    }
    run('node', ['toolg/genEntry.mjs'])
    fs.copyFileSync('tmp/perm-run01/dist-orig/w-web-perm.umd.js', 'dist/w-web-perm.umd.js')
    fs.copyFileSync('tmp/perm-run01/dist-orig/w-web-perm.umd.js.map', 'dist/w-web-perm.umd.js.map')
}

const muts = [
    { id: 'F1', desc: '前端: userNotAdmin 時仍轉址(拿掉 loginError 之 return)', file: 'src/App.vue', from: '            if (isNotAdmin) {\n                return\n            }\n', to: '' },
    { id: 'F2', desc: '前端: kpFallback 之 csErrNotAdmin 英文文字為空(被拒者取不到字典, 英文畫面只剩鍵名)', file: 'src/plugins/mUI.mjs', from: "        eng: 'No permission to enter the permission console',", to: "        eng: ''," },
    { id: 'F3', desc: '前端: loginError 不辨識 userNotAdmin(退回一律 csErrLogin＋轉址)', file: 'src/App.vue', from: "let isNotAdmin = get(data, 'msg') === 'userNotAdmin'", to: 'let isNotAdmin = false' },
]
const only = process.argv.slice(2)
const results = []
for (const m of muts) {
    if (only.length > 0 && !only.includes(m.id)) {
        continue
    }
    const orig = fs.readFileSync(m.file, 'utf8')
    const n = orig.split(m.from).length - 1
    if (n !== 1) {
        results.push({ id: m.id, error: `原字串須恰命中 1 處, 實得 ${n}` })
        continue
    }
    let o = { id: m.id, desc: m.desc, file: m.file }
    try {
        fs.writeFileSync(m.file, orig.replace(m.from, () => m.to), 'utf8')
        rebuild()
        const r = run('node', ['C:/opensrcOper/tools/quiet-run.mjs', '--lock', '--name', `fe-${m.id}`, '--timeout', '900', '--', 'npx', 'mocha', '--no-parallel', 'test/e2e-init.test.mjs', '--grep', 'E2E-007', '--timeout', '300000'])
        const out = (r.stdout || '') + (r.stderr || '')
        const f = out.match(/(\d+) failing/)
        const p = out.match(/(\d+) passing/)
        o = { ...o, caught: r.status !== 0, exit: r.status, failing: f ? Number(f[1]) : 0, passing: p ? Number(p[1]) : 0 }
    }
    finally {
        fs.writeFileSync(m.file, orig, 'utf8')
    }
    o.restored = fs.readFileSync(m.file, 'utf8') === orig
    results.push(o)
    console.log(JSON.stringify(o))
}
rebuild() //還原正確 dist
console.log('dist rebuilt from restored sources')
fs.writeFileSync(`spec/evidence/perm-run01-20261024/mutation-results-frontend${only.length > 0 ? '-' + only.join('') : ''}.json`, JSON.stringify(results, null, 2), 'utf8')
