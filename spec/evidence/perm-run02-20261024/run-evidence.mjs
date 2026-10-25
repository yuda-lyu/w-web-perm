// 修前紅與變異驗證(單一測試鎖內循序執行; 結束必還原被改之檔) —— perm-run02(任務 20261024182735)所用腳本之留存
// 用法(自專案根): node C:/opensrcOper/tools/quiet-run.mjs --lock --name perm-run02-evidence --timeout 5400 -- node spec/evidence/perm-run02-20261024/run-evidence.mjs [old|mut|all] [變異id,逗號分隔]
// 暫存: ./tmp/perm-run02/evidence/{orig,logs,*.json}(跑完請清理); 結果 JSON 於該目錄。
// 原理: 備份會被改的檔 → old 模式以 `git show HEAD:<檔>` 取代 server/WWebPerm.mjs、server/adminCheck.mjs 後跑測試(修前紅; 測試與 srv.mjs 保留新版) →
//       mut 模式逐一套最小文字變異(錨點須恰命中 1 次)跑測試(--bail)→ 還原; 結束以 git diff --stat 比對。
// 注意: 此腳本在工作樹原地改檔, 跑的期間不得編輯 server/、srv.mjs 與被跑之測試; 被外力終止時 exit 事件不會執行, 須以 ./tmp/perm-run02/evidence/orig/ 之備份手動還原並 cmp 驗證。
import fs from 'fs'
import path from 'path'
import { spawnSync, execSync } from 'child_process'

const root = path.resolve('.')
const evDir = path.resolve('./tmp/perm-run02/evidence')
const logDir = path.join(evDir, 'logs')
const origDir = path.join(evDir, 'orig')
fs.mkdirSync(logDir, { recursive: true })
fs.mkdirSync(origDir, { recursive: true })
const mode = process.argv[2] || 'all'

const TOUCH = ['server/WWebPerm.mjs', 'server/adminCheck.mjs', 'srv.mjs']
const abs = (f) => path.join(root, f)
for (const f of TOUCH) {
    fs.copyFileSync(abs(f), path.join(origDir, f.replace(/[\\/]/g, '__')))
}
const restore = () => {
    for (const f of TOUCH) {
        fs.copyFileSync(path.join(origDir, f.replace(/[\\/]/g, '__')), abs(f))
    }
}
const stat0 = execSync('git diff --stat -- server srv.mjs test README.md spec sgud', { cwd: root, encoding: 'utf8' })
process.on('exit', restore)
process.on('SIGINT', () => process.exit(130))

const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
const portBusy = () => {
    try {
        return execSync('netstat -ano', { encoding: 'utf8' }).split('\n').some((l) => /:11006\s/.test(l) && /LISTENING/.test(l))
    }
    catch (e) {
        return false
    }
}
const waitPortFree = () => {
    for (let k = 0; k < 30; k++) {
        if (!portBusy()) {
            return true
        }
        sleepSync(2000)
    }
    return false
}

const runMocha = (label, files, extra = []) => {
    if (!waitPortFree()) {
        return { label, error: '11006 仍被占用(上一輪後端未結束), 略過' }
    }
    const args = ['node_modules/mocha/bin/mocha.js', '--no-parallel', ...files, '--timeout', '300000', '--reporter', 'spec', ...extra]
    const t0 = Date.now()
    const r = spawnSync('node', args, { cwd: root, encoding: 'utf8', maxBuffer: 200 * 1024 * 1024 })
    const out = (r.stdout || '') + '\n' + (r.stderr || '')
    fs.writeFileSync(path.join(logDir, `${label}.log`), out, 'utf8')
    const passing = Number((/(\d+) passing/.exec(out) || [0, 0])[1])
    const failing = Number((/(\d+) failing/.exec(out) || [0, 0])[1])
    const pending = Number((/(\d+) pending/.exec(out) || [0, 0])[1])
    const fails = []
    for (const mm of out.matchAll(/^\s{4,}(\d+)\) (.+)$/gm)) { //spec reporter 進度行之失敗案(含案名)
        fails.push(mm[2].trim())
    }
    const importFail = /does not provide an export named/.test(out) //unit 檔於 import 即失敗(整檔紅)
    waitPortFree()
    return { label, exit: r.status, passing, failing, pending, importFail, sec: Math.round((Date.now() - t0) / 1000), failTitles: fails.slice(0, 80) }
}

const edit = (file, pairs) => {
    let c = fs.readFileSync(path.join(origDir, file.replace(/[\\/]/g, '__')), 'utf8')
    for (const [find, rep] of pairs) {
        const n = c.split(find).length - 1
        if (n !== 1) {
            throw new Error(`錨點命中 ${n} 次(須恰 1): ${find.slice(0, 60)} @ ${file}`)
        }
        c = c.replace(find, () => rep)
    }
    fs.writeFileSync(abs(file), c, 'utf8')
}

const API_TEST = 'test/api-callerMatrix.test.mjs'
const UNIT_TEST = 'test/unit-appToken.test.mjs'
const ALL_TESTS = [API_TEST, UNIT_TEST]

// ---------- 修前紅: 以 HEAD 之 server/WWebPerm.mjs、server/adminCheck.mjs 取代(測試與 srv.mjs 新權杖保留) ----------
if (mode === 'old' || mode === 'all') {
    for (const f of ['server/WWebPerm.mjs', 'server/adminCheck.mjs']) {
        fs.writeFileSync(abs(f), execSync(`git show HEAD:${f}`, { cwd: root, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }), 'utf8')
    }
    const resApi = runMocha('old-api', [API_TEST])
    const resUnit = runMocha('old-unit', [UNIT_TEST])
    restore()
    fs.writeFileSync(path.join(evDir, 'old-code-results.json'), JSON.stringify({ api: resApi, unit: resUnit }, null, 2))
    console.log('[old-api]', JSON.stringify({ ...resApi, failTitles: resApi.failTitles && resApi.failTitles.length }))
    console.log('[old-unit]', JSON.stringify({ ...resUnit, failTitles: resUnit.failTitles && resUnit.failTitles.length }))
}

// ---------- 變異 ----------
const APP_LEVEL = 'isLevel = isExtAdminUser(user)'
const GATE = 'if (isSystemAppUser(userExt) && (await countPermRows(userExt)) === 0) {'
const MUT = [
    // ① 應用系統路由(不在表者相容認定)
    { id: 'MA1', desc: '①應用系統路由不在表分支重新要求 isApp(須 isApp y 才放行)', file: 'server/WWebPerm.mjs', pairs: [[APP_LEVEL, "isLevel = isExtAdminUser(user) && user.isApp === 'y'"]] },
    { id: 'MA2', desc: '①應用系統路由不在表分支改回嚴格認定 isSystemAppUser(須 isApp y、id 以 app: 開頭)', file: 'server/WWebPerm.mjs', pairs: [[APP_LEVEL, 'isLevel = isSystemAppUser(user)']] },
    { id: 'MA3', desc: '①應用系統路由不在表分支不判等級(恆真)', file: 'server/WWebPerm.mjs', pairs: [[APP_LEVEL, 'isLevel = true']] },
    { id: 'MA4', desc: '①isExtAdminUser 另要求 id 以 app: 開頭(路由仍要求前綴)', file: 'server/adminCheck.mjs', pairs: [["return Object.prototype.hasOwnProperty.call(user, 'isAdmin') && user.isAdmin === 'y'", "return Object.prototype.hasOwnProperty.call(user, 'isAdmin') && user.isAdmin === 'y' && typeof user.id === 'string' && user.id.startsWith(SYSTEM_APP_ID_PREFIX)"]] },
    { id: 'MA5', desc: '①isExtAdminUser 恆真(任何物件皆為管理員)', file: 'server/adminCheck.mjs', pairs: [["return Object.prototype.hasOwnProperty.call(user, 'isAdmin') && user.isAdmin === 'y'", 'return true']] },
    { id: 'MA6', desc: '①應用系統路由在表者改採反查之 isAdmin(不以 perm 列為準)', file: 'server/WWebPerm.mjs', pairs: [['isLevel = isAdminRow(userPerm)', 'isLevel = isExtAdminUser(user)']] },
    // ② 系統服務用途(須 app: 前綴)
    { id: 'MB1', desc: '②系統服務用途拿掉 app: 前綴條件(改回只要非空字串 id)', file: 'server/adminCheck.mjs', pairs: [['user.id.startsWith(SYSTEM_APP_ID_PREFIX)', "user.id !== ''"]] },
    { id: 'MB2', desc: '②前綴比對改為不分大小寫', file: 'server/adminCheck.mjs', pairs: [['user.id.startsWith(SYSTEM_APP_ID_PREFIX)', 'user.id.toLowerCase().startsWith(SYSTEM_APP_ID_PREFIX)']] },
    { id: 'MB3', desc: '②前綴比對改為 includes(任意位置含 app:)', file: 'server/adminCheck.mjs', pairs: [['user.id.startsWith(SYSTEM_APP_ID_PREFIX)', 'user.id.includes(SYSTEM_APP_ID_PREFIX)']] },
    { id: 'MB4', desc: '②前綴比對先 trim', file: 'server/adminCheck.mjs', pairs: [['user.id.startsWith(SYSTEM_APP_ID_PREFIX)', 'user.id.trim().startsWith(SYSTEM_APP_ID_PREFIX)']] },
    { id: 'MB5', desc: "②前綴常數改為 'app'(無冒號)", file: 'server/adminCheck.mjs', pairs: [["const SYSTEM_APP_ID_PREFIX = 'app:'", "const SYSTEM_APP_ID_PREFIX = 'app'"]] },
    { id: 'MB6', desc: '②系統服務用途不要求 isApp(只看 app: 前綴與 isAdmin)', file: 'server/adminCheck.mjs', pairs: [["has('isApp') && user.isApp === 'y' && ", '']] },
    { id: 'MC1', desc: '②後台與資料通道之系統服務用途閘門改用 isExtAdminUser(只看 isAdmin y)', file: 'server/WWebPerm.mjs', pairs: [[GATE, 'if (isExtAdminUser(userExt) && (await countPermRows(userExt)) === 0) {']] },
    { id: 'MC2', desc: '②系統服務用途閘門不要求不在表', file: 'server/WWebPerm.mjs', pairs: [[GATE, 'if (isSystemAppUser(userExt)) {']] },
    { id: 'MC3', desc: '②requireAdmin 對不在表者恆放行(縱深防禦失效)', file: 'server/WWebPerm.mjs', pairs: [['ok = (u !== null) ? isAdminRow(u) : isSystemAppIdRecent(userId)', 'ok = (u !== null) ? isAdminRow(u) : true']] },
    { id: 'MC4', desc: '②getUserIdByToken 對任何身分登錄系統服務用途 id(不憑 verifySystemApp 產生之物件)', file: 'server/WWebPerm.mjs', pairs: [['if (kpSystemAppUser.has(user)) {', 'if (true) {']] },
    // 外審後(sol F3／F4／F1)新增
    { id: 'MD1', desc: '外審F3: 以 perm 列通過者不清除同 id 之近期系統服務用途登錄', file: 'server/WWebPerm.mjs', pairs: [['clearSystemAppId(userId) //以 perm 列通過者: 該 id 不再是系統服務用途憑據(見 clearSystemAppId)', 'void 0']] },
    { id: 'MD2', desc: '外審F4: requireAdmin 查無列時提前放行(保留原三元式, 避開字串守護)', file: 'server/WWebPerm.mjs', pairs: [['ok = (u !== null) ? isAdminRow(u) : isSystemAppIdRecent(userId)', 'if (u === null) {\n                return true\n            }\n            ok = (u !== null) ? isAdminRow(u) : isSystemAppIdRecent(userId)']] },
    { id: 'MD3', desc: '外審F3: clearSystemAppId 變成空操作', file: 'server/WWebPerm.mjs', pairs: [['kpSystemAppIds.delete(id)', 'void id']] },
    { id: 'MD4', desc: '外審增量G4: 嚴格系統服務形狀略過對應鍵查找(只留主鍵相等檢查)', file: 'server/WWebPerm.mjs', pairs: [["let n = await countLoginRows(woItems.users, mappingBy, get(userExt, mappingBy, ''))", "let n = isSystemAppUser(userExt) ? 0 : await countLoginRows(woItems.users, mappingBy, get(userExt, mappingBy, ''))"]] },
    { id: 'MD5', desc: '外審F1: 應用系統路由先判等級再判部署方否決(不在表 isAdmin n 且被否決者回 userNotAdmin)', file: 'server/WWebPerm.mjs', pairs: [["if (!b) {\n            console.log('user', user)\n            srLog.error({ event: 'getAndVerifyAppUser-error', msg: 'userNoPermission', from })", "if (!b && isLevel) {\n            console.log('user', user)\n            srLog.error({ event: 'getAndVerifyAppUser-error', msg: 'userNoPermission', from })"]] },
]

if (mode === 'mut' || mode === 'all') {
    const only = process.argv[3] ? process.argv[3].split(',') : null //第 3 參數: 只跑指定變異 id(逗號分隔)
    const results = []
    for (const m of MUT.filter((v) => only === null || only.includes(v.id))) {
        restore()
        try {
            edit(m.file, m.pairs)
        }
        catch (err) {
            results.push({ id: m.id, desc: m.desc, error: String(err.message) })
            console.log('[mut]', m.id, 'ERROR', err.message)
            continue
        }
        const res = runMocha(`mut-${m.id}`, ALL_TESTS, process.env.MUT_NOBAIL ? [] : ['--bail']) //MUT_NOBAIL=1: 不在首敗即停, 列出該變異下全部失敗案
        restore()
        const caught = res.error ? null : (res.failing > 0)
        results.push({ id: m.id, desc: m.desc, file: m.file, caught, passing: res.passing, failing: res.failing, firstFail: (res.failTitles || [])[0] || '', sec: res.sec, error: res.error })
        console.log('[mut]', m.id, caught ? 'CAUGHT' : (caught === null ? 'SKIPPED' : 'SURVIVED'), (res.failTitles || [])[0] || '')
        fs.writeFileSync(path.join(evDir, only === null ? 'mutation-results.json' : 'mutation-results-subset.json'), JSON.stringify(results, null, 2))
    }
    const caughtN = results.filter((r) => r.caught === true).length
    console.log(`[mut] ${caughtN}/${results.length} caught`)
}

restore()
const stat1 = execSync('git diff --stat -- server srv.mjs test README.md spec sgud', { cwd: root, encoding: 'utf8' })
console.log(stat0 === stat1 ? '[restore] 工作樹 git diff --stat 與開始時一致' : '[restore] 警告: git diff --stat 與開始時不同!\n--- before\n' + stat0 + '\n--- after\n' + stat1)
