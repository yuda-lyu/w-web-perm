//變異驗證(perm-run01 本輪, 任務 20261025161334; R-SYSFUNCS-01): 對 server/WWebPerm.mjs、src/main.js、package.json 逐個施加變異, 跑 unit-sysFuncsSite 與 api-sysFuncs(真後端, 經 quiet-run --lock),
//記錄是否被抓到(任一測試失敗即「被抓到」); 每個變異後必還原原檔並驗位元組相等(finally + 行程結束備援)。
//用法: node spec/evidence/perm-run01-20261025/scripts/mutate.mjs [--only M1,M2] (以專案根為 cwd)
//結果: spec/evidence/perm-run01-20261025/mutation-results.json
import fs from 'fs'
import path from 'path'
import { spawnSync } from 'child_process'
import { fileURLToPath } from 'url'

const here = path.dirname(fileURLToPath(import.meta.url))
const projRoot = path.resolve(here, '..', '..', '..', '..')
const quietRun = 'C:/opensrcOper/tools/quiet-run.mjs'
const onlyIdx = process.argv.indexOf('--only')
const only = onlyIdx >= 0 ? process.argv[onlyIdx + 1].split(',') : null
const outFile = path.join(here, '..', 'mutation-results.json')

const F_SRV = 'server/WWebPerm.mjs'
const F_MAIN = 'src/main.js'
const F_PKG = 'package.json'
const SYS_LINE = '        sysFuncsPublic: [\'[sys:getFuncList]\'],'
const UNIT = { name: 'unit-sysFuncsSite', args: ['npx', 'mocha', '--no-parallel', 'test/unit-sysFuncsSite.test.mjs', '--timeout', '30000'], lock: false }
const API = { name: 'api-sysFuncs', args: ['npx', 'mocha', '--no-parallel', 'test/api-sysFuncs.test.mjs', '--timeout', '300000'], lock: true }

//變異表: id, 描述, 檔, old(必恰出現一次), new, 要跑的測試
const MUTATIONS = [
    { id: 'M1', desc: '拿掉 sysFuncsPublic(退回框架預設:三者皆公開)', file: F_SRV, old: SYS_LINE + '\n', neu: '', runs: [UNIT, API] },
    { id: 'M2', desc: 'sysFuncsPublic 多列 [sys:polling]', file: F_SRV, old: SYS_LINE, neu: '        sysFuncsPublic: [\'[sys:getFuncList]\', \'[sys:polling]\'],', runs: [UNIT, API] },
    { id: 'M3', desc: 'sysFuncsPublic 多列 [sys:getTableTags]', file: F_SRV, old: SYS_LINE, neu: '        sysFuncsPublic: [\'[sys:getFuncList]\', \'[sys:getTableTags]\'],', runs: [UNIT, API] },
    { id: 'M4', desc: 'sysFuncsPublic 改為空陣列', file: F_SRV, old: SYS_LINE, neu: '        sysFuncsPublic: [],', runs: [UNIT, API] },
    { id: 'M5', desc: '鍵名打錯(sysFuncPublic; 框架忽略未知鍵而退回預設)', file: F_SRV, old: SYS_LINE, neu: '        sysFuncPublic: [\'[sys:getFuncList]\'],', runs: [UNIT, API] },
    { id: 'M6', desc: '明列三者皆公開', file: F_SRV, old: SYS_LINE, neu: '        sysFuncsPublic: [\'[sys:getFuncList]\', \'[sys:polling]\', \'[sys:getTableTags]\'],', runs: [UNIT, API] },
    { id: 'M7', desc: 'getUserIdByToken 對空 token 改回空字串(fail-open): 公開之 [sys:getFuncList] 變匿名可呼叫', file: F_SRV, old: '                user = await getAndVerifyAdminUser(token, \'main\')', neu: '                if (!isestr(token)) { return \'\' }\n                user = await getAndVerifyAdminUser(token, \'main\')', runs: [UNIT, API] },
    { id: 'M8', desc: '前端 useWaitToken 改 false(登入前即連線)', file: F_MAIN, old: 'useWaitToken: true', neu: 'useWaitToken: false', runs: [UNIT] },
    { id: 'M9', desc: 'package.json 之 w-serv-hapi 範圍退回 ^1.1.7', file: F_PKG, old: '"w-serv-hapi": "^1.1.8"', neu: '"w-serv-hapi": "^1.1.7"', runs: [UNIT] },
    { id: 'M10', desc: '另處(server/ 內)新增系統函數公開判斷之字面值', file: F_SRV, old: SYS_LINE, neu: SYS_LINE + '\n        //kpSysPublicExtra: [\'[sys:polling]\'],\n        kpSysPublicExtra: [\'[sys:polling]\'],', runs: [UNIT] },
]

const orig = new Map()
for (const f of [F_SRV, F_MAIN, F_PKG]) {
    orig.set(f, fs.readFileSync(path.join(projRoot, f)))
}
const restore = () => {
    for (const [f, buf] of orig) {
        const p = path.join(projRoot, f)
        if (!fs.readFileSync(p).equals(buf)) {
            fs.writeFileSync(p, buf)
        }
    }
}
process.on('exit', restore)
process.on('SIGINT', () => { restore(); process.exit(130) })

const listening = () => {
    const r = spawnSync('netstat', ['-ano'], { encoding: 'utf8', windowsHide: true })
    return /:11006\s.*LISTENING/.test(r.stdout || '')
}

const parse = (stdout) => {
    const pass = /(\d+) passing/.exec(stdout)
    const fail = /(\d+) failing/.exec(stdout)
    const exit = /\[quiet-run\] exit=(\d+)/.exec(stdout)
    const firstFail = []
    for (const m of stdout.matchAll(/^\s+\d+\) .*$/gm)) {
        if (firstFail.length < 6) {
            firstFail.push(m[0].trim().slice(0, 160))
        }
    }
    return { exit: exit ? Number(exit[1]) : null, passing: pass ? Number(pass[1]) : 0, failing: fail ? Number(fail[1]) : 0, failedTitles: firstFail }
}

const results = []
try {
    for (const m of MUTATIONS) {
        if (only && !only.includes(m.id)) {
            continue
        }
        const p = path.join(projRoot, m.file)
        const src = fs.readFileSync(p, 'utf8')
        const n = src.split(m.old).length - 1
        if (n !== 1) {
            throw new Error(`${m.id}: 變異前樣式在 ${m.file} 出現 ${n} 次(須恰 1 次)`)
        }
        fs.writeFileSync(p, src.replace(m.old, () => m.neu), 'utf8')
        const rec = { id: m.id, desc: m.desc, file: m.file, runs: [] }
        try {
            for (const r of m.runs) {
                if (listening()) {
                    throw new Error('port 11006 仍有行程監聽, 停止(避免沿用舊行程使變異未生效)')
                }
                const args = [quietRun, ...(r.lock ? ['--lock'] : []), '--name', 'perm-run01', '--timeout', '900', '--', ...r.args]
                const t0 = Date.now()
                const res = spawnSync(process.execPath, args, { cwd: projRoot, encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024, timeout: 1000 * 1000 })
                const info = parse(`${res.stdout || ''}\n${res.stderr || ''}`)
                rec.runs.push({ test: r.name, ...info, caught: info.failing > 0 || (info.exit !== 0), sec: Math.round((Date.now() - t0) / 1000) })
            }
        }
        finally {
            restore()
        }
        rec.caughtBy = rec.runs.filter((x) => x.caught).map((x) => x.test)
        rec.caught = rec.caughtBy.length > 0
        results.push(rec)
        console.log(`${m.id} ${rec.caught ? '被抓到' : '倖存'} by [${rec.caughtBy.join(', ')}] — ${m.desc}`)
    }
}
finally {
    restore()
    for (const [f, buf] of orig) {
        if (!fs.readFileSync(path.join(projRoot, f)).equals(buf)) {
            console.log(`!!! ${f} 未還原`)
            process.exitCode = 2
        }
    }
}
fs.writeFileSync(outFile, JSON.stringify({ when: new Date().toISOString(), results }, null, 2), 'utf8')
console.log(`mutation done -> ${outFile}`)
