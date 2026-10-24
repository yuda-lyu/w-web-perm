// 修前紅與變異驗證(單一測試鎖內循序執行; 結束必還原被改之檔) —— perm-run01 第三輪(任務 20261024182735)所用腳本之留存
// 用法(自專案根): node C:/opensrcOper/tools/quiet-run.mjs --lock --name perm-run01-evidence --timeout 9000 -- node spec/evidence/perm-run01-20261024b/run-evidence.mjs [old|mut|all] [變異id,逗號分隔]
// 暫存: ./tmp/perm-run01/evidence/{orig,logs,*.json}(跑完請清理); 結果 JSON 於該目錄。
// 原理: 備份四個會被改的檔 → old 模式以 `git show HEAD:server/WWebPerm.mjs` 取代後跑測試 → mut 模式逐一套最小文字變異(錨點須恰命中 1 次)跑測試(--bail)→ 還原; 結束以 git diff --stat 比對。
// 注意: 此腳本在工作樹原地改檔, 跑的期間不得編輯 server/、srv.mjs 與被跑之測試; 被外力終止時 exit 事件不會執行, 須以 ./tmp/perm-run01/evidence/orig/ 之備份手動還原並 cmp 驗證。
import fs from 'fs'
import path from 'path'
import { spawnSync, execSync } from 'child_process'

const root = path.resolve('.')
const evDir = path.resolve('./tmp/perm-run01/evidence')
const logDir = path.join(evDir, 'logs')
const origDir = path.join(evDir, 'orig')
fs.mkdirSync(logDir, { recursive: true })
fs.mkdirSync(origDir, { recursive: true })
const mode = process.argv[2] || 'all'

const TOUCH = ['server/WWebPerm.mjs', 'server/keyCheck.mjs', 'server/routeResult.mjs', 'srv.mjs']
const abs = (f) => path.join(root, f)
for (const f of TOUCH) {
    fs.copyFileSync(abs(f), path.join(origDir, f.replace(/[\\/]/g, '__')))
}
const restore = () => {
    for (const f of TOUCH) {
        fs.copyFileSync(path.join(origDir, f.replace(/[\\/]/g, '__')), abs(f))
    }
}
const stat0 = execSync('git diff --stat', { cwd: root, encoding: 'utf8' })
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
    waitPortFree()
    return { label, exit: r.status, passing, failing, pending, sec: Math.round((Date.now() - t0) / 1000), failTitles: fails.slice(0, 80) }
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

const ALL_TESTS = ['test/api-callerMatrix.test.mjs', 'test/unit-appToken.test.mjs', 'test/unit-routeResult.test.mjs']

// ---------- 修前紅: 以 HEAD 之 server/WWebPerm.mjs 取代(其餘新檔不動; srv.mjs 保留新測試權杖) ----------
if (mode === 'old' || mode === 'all') {
    const headSrc = execSync('git show HEAD:server/WWebPerm.mjs', { cwd: root, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 })
    fs.writeFileSync(abs('server/WWebPerm.mjs'), headSrc, 'utf8')
    const res = runMocha('old-code', ALL_TESTS)
    restore()
    fs.writeFileSync(path.join(evDir, 'old-code-results.json'), JSON.stringify(res, null, 2))
    console.log('[old-code]', JSON.stringify({ ...res, failTitles: res.failTitles && res.failTitles.length }))
}

// ---------- 變異 ----------
const MUT = [
    { id: 'M1a', desc: 'P-1 拿掉等級檢查(!isLevel 永不成立)', file: 'server/WWebPerm.mjs', pairs: [['if (!isLevel) {', 'if (false) {']] },
    { id: 'M1b', desc: 'P-1 在表者不判 isAdminRow(isLevel 恆真)', file: 'server/WWebPerm.mjs', pairs: [['isLevel = isAdminRow(userPerm)', 'isLevel = true']] },
    { id: 'M1c', desc: 'P-1 不在表者不判 isSystemAppUser(isLevel 恆真)', file: 'server/WWebPerm.mjs', pairs: [['isLevel = isSystemAppUser(user)', 'isLevel = true']] },
    { id: 'M2a', desc: 'P-2 拿掉系統服務用途放行', file: 'server/WWebPerm.mjs', pairs: [['if (isSystemAppUser(userExt) && (await countPermRows(userExt)) === 0) {', 'if (false) {']] },
    { id: 'M2b', desc: 'P-2 系統服務用途不要求「不在表」', file: 'server/WWebPerm.mjs', pairs: [['if (isSystemAppUser(userExt) && (await countPermRows(userExt)) === 0) {', 'if (isSystemAppUser(userExt)) {']] },
    { id: 'M2c', desc: 'P-2 countLoginRows 只計有效列(停用者視同不在表)', file: 'server/keyCheck.mjs', pairs: [['return [...kp.values()].filter((r) => loginIdOf(r) === vSelf).length', "return [...kp.values()].filter((r) => loginIdOf(r) === vSelf && r.isActive === 'y').length"]] },
    { id: 'M2d', desc: 'P-2 requireAdmin 不認系統服務用途登錄', file: 'server/WWebPerm.mjs', pairs: [['ok = (u !== null) ? isAdminRow(u) : isSystemAppIdRecent(userId)', 'ok = (u !== null) ? isAdminRow(u) : false']] },
    { id: 'M2e', desc: 'P-2 getUserIdByToken 不登錄系統服務用途 id', file: 'server/WWebPerm.mjs', pairs: [['markSystemAppId(userId)', 'void 0']] },
    { id: 'M10', desc: 'F03 「在表」不含外部 id 等於表中某列主鍵', file: 'server/WWebPerm.mjs', pairs: [["if (n === 0 && isestr(get(userExt, 'id', ''))) {", 'if (false) {']] },
    { id: 'M11', desc: 'F05 getExtUser 不回淺層快照', file: 'server/WWebPerm.mjs', pairs: [['return { ...user } //淺層快照', 'return user //淺層快照']] },
    { id: 'M12', desc: 'F06 系統服務用途 id 登錄無 TTL(永久)', file: 'server/WWebPerm.mjs', pairs: [['return t !== undefined && Date.now() - t <= SYSTEM_APP_TTL_MS', 'return t !== undefined']] },
    { id: 'M13', desc: 'F02 應用路由稽核 id 取外部 id 而非 perm 主鍵', file: 'server/WWebPerm.mjs', pairs: [['{ ...user, id: userPerm.id }', '{ ...user }']] },
    { id: 'M14', desc: 'F08 routeResult 診斷字串化拋錯不攔截', file: 'server/routeResult.mjs', pairs: [["            catch (err) {\n                rawStr = '[unprintable]'\n            }", '            catch (err) {\n                throw err\n            }']] },
    { id: 'M2f', desc: 'P-2 系統服務用途不套用部署方 verifyAppUser', file: 'server/WWebPerm.mjs', pairs: [["        if (!b) {\n            srLog.error({ event, msg: 'userNoPermission', from })", "        if (false) {\n            srLog.error({ event, msg: 'userNoPermission', from })"]] },
    { id: 'M3a', desc: 'P-3 還原舊作法(固定截前 7 字元)', file: 'server/WWebPerm.mjs', pairs: [["let token = (mBearer === null) ? '' : mBearer[1]", "let token = isestr(authorization) ? authorization.slice(7) : ''"]] },
    { id: 'M3b', desc: 'P-3 Bearer 正規式改為大小寫敏感', file: 'server/WWebPerm.mjs', pairs: [['let reBearerAuth = /^Bearer (\\S+)$/i', 'let reBearerAuth = /^Bearer (\\S+)$/']] },
    { id: 'M3c', desc: 'P-3 Bearer 正規式容許多個空白', file: 'server/WWebPerm.mjs', pairs: [['let reBearerAuth = /^Bearer (\\S+)$/i', 'let reBearerAuth = /^Bearer +(\\S+)$/i']] },
    { id: 'M3d', desc: 'P-3 Bearer 正規式去掉結尾錨(後接多餘字元仍通過)', file: 'server/WWebPerm.mjs', pairs: [['let reBearerAuth = /^Bearer (\\S+)$/i', 'let reBearerAuth = /^Bearer (\\S+)/i']] },
    { id: 'M5', desc: 'P-5 在身分驗證前先驗 keyTable', file: 'server/WWebPerm.mjs', pairs: [['                    //提供對象為node使用者, 須為系統管理者, 須先檢測token是否有效, 再進行數據變更\n', "                    //提供對象為node使用者, 須為系統管理者, 須先檢測token是否有效, 再進行數據變更\n                    if (!['targets', 'pemis', 'grups', 'users'].includes(get(req, 'query.keyTable', ''))) {\n                        return Promise.reject(`invalidKeyTable`)\n                    }\n"]] },
    { id: 'M6', desc: 'sol#5 /api/getPerm 路由改回取 Error.message 原樣', file: 'server/WWebPerm.mjs', pairs: [["r = routeResult(r, 'api/getPerm-error')", 'if (r.msg instanceof Error) { r.msg = r.msg.message }']] },
    { id: 'M7', desc: 'sol#5 routeResult 不收斂(key = raw)', file: 'server/routeResult.mjs', pairs: [["let key = toOutKey(raw, 'anUnexpectedErrorOccurred')", 'let key = raw']] },
    { id: 'M8', desc: '檢查之值即使用之值: getAndVerifyAppUser 把原物件交部署方並回傳原物件', file: 'server/WWebPerm.mjs', pairs: [['verifyAppUser({ ...user }, from)', 'verifyAppUser(user, from)'], ['let userUse = (userPerm !== null) ? { ...user, id: userPerm.id } : { ...user }', 'let userUse = user']] },
    { id: 'M15', desc: 'P-2 countLoginRows(email／name 路徑)只計有效列(停用者視同不在表)', file: 'server/keyCheck.mjs', pairs: [['return Array.isArray(rs) ? rs.filter((r) => isObj(r)).length : 0\n    }\n    let rsId = await tabUsers.select({ id: vSelf })\n    let rsSrc = await tabUsers.select({ srcKey: vSelf })\n    let kp = new Map()', "return Array.isArray(rs) ? rs.filter((r) => isObj(r) && r.isActive === 'y').length : 0\n    }\n    let rsId = await tabUsers.select({ id: vSelf })\n    let rsSrc = await tabUsers.select({ srcKey: vSelf })\n    let kp = new Map()"]] },
    { id: 'M9', desc: 'P-7 範例 verifyClientUser 還原以 isAdmin 否決', file: 'srv.mjs', pairs: [["    //只放行有效之瀏覽使用者, 不以 isAdmin 判斷(P-7): 非管理員由本套件統一拒絕並使畫面顯示「無權進入權限後台」(userNotAdmin); 若在此先否決非管理員, 使用者只會看到「拒絕登入」並被轉址; 部署方可依 from 與自家政策(來源網段、系統別)再收緊\n    return true", "    return user.isAdmin === 'y'"]] },
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
        const res = runMocha(`mut-${m.id}`, ALL_TESTS, ['--bail'])
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
const stat1 = execSync('git diff --stat', { cwd: root, encoding: 'utf8' })
console.log(stat0 === stat1 ? '[restore] 工作樹 git diff --stat 與開始時一致' : '[restore] 警告: git diff --stat 與開始時不同!\n--- before\n' + stat0 + '\n--- after\n' + stat1)
