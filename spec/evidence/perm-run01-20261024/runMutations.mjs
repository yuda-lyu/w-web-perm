//依序執行變異驗證(每個變異: 暫時改寫 → 跑指定測試 → 還原), 結果彙整為 spec/evidence/perm-run01-20261024/mutation-results.json 與 .md
import fs from 'fs'
import { spawnSync } from 'child_process'

const AO = ['npx', 'mocha', '--no-parallel', 'test/api-adminOnly.test.mjs', 'test/unit-adminOnlySite.test.mjs', '--timeout', '300000']
const UNIT_SITE = ['npx', 'mocha', '--no-parallel', 'test/unit-adminOnlySite.test.mjs', '--timeout', '60000']
const DUP = ['npx', 'mocha', '--no-parallel', 'test/unit-procCore-writeValidate.test.mjs', 'test/api-batchIdDup.test.mjs', '--timeout', '300000']
const RA = ['npx', 'mocha', '--no-parallel', 'test/unit-refAudit.test.mjs', '--grep', 'RA-037', '--timeout', '180000']
const EXT13 = ['npx', 'mocha', '--no-parallel', 'test/unit-procCore-external.test.mjs', '--grep', 'SITE-EX-013', '--timeout', '60000']
const W = 'server/WWebPerm.mjs'

const muts = [
    { id: 'M1', desc: '拿掉連線閘之角色檢查(checkToken 改回 getAndVerifyClientUser)', file: W, from: 'await getAndVerifyAdminUser(token, from)', to: 'await getAndVerifyClientUser(token, from)', cmd: AO },
    { id: 'M2', desc: '拿掉反查之角色檢查(getUserIdByToken 改回 getAndVerifyClientUser)', file: W, from: "user = await getAndVerifyAdminUser(token, 'main')", to: "user = await getAndVerifyClientUser(token, 'main')", cmd: AO },
    { id: 'M3', desc: '拿掉後台登入之角色檢查(/api/getUserByToken 改回 getAndVerifyClientUser)', file: W, from: "let user = await getAndVerifyAdminUser(token, 'getUserByToken')", to: "let user = await getAndVerifyClientUser(token, 'getUserByToken')", cmd: AO },
    { id: 'M4', desc: '核心關卡不檢查角色(adminOnly && !isAdmin 恆假)', file: W, from: 'if (adminOnly && !isAdmin) {', to: 'if (false) {', cmd: AO },
    { id: 'M5', desc: '角色恆為系統管理者(let isAdmin = isAdminRow(user) 改 true)', file: W, from: 'let isAdmin = isAdminRow(user)', to: 'let isAdmin = true', cmd: AO },
    { id: 'M6', desc: '過度收緊: /api/getPerm 也要求系統管理者(一般使用者查本人權限樹被擋)', file: W, from: "let userSelf = await getAndVerifyClientUser(token, 'getPerm')", to: "let userSelf = await getAndVerifyAdminUser(token, 'getPerm')", cmd: AO },
    { id: 'M7', desc: '縱深防禦拿掉(requireAdmin 恆通過)', file: W, from: 'if (!isAdminRow(u)) {', to: 'if (false) {', cmd: UNIT_SITE },
    { id: 'M8', desc: 'isAdminRow 不檢查 isActive', file: 'server/adminCheck.mjs', from: "has('isActive') && has('isAdmin') && row.isActive === 'y' && row.isAdmin === 'y'", to: "has('isAdmin') && row.isAdmin === 'y'", cmd: UNIT_SITE },
    { id: 'M9', desc: 'isAdminRow 改認繼承屬性', file: 'server/adminCheck.mjs', from: "let has = (k) => Object.prototype.hasOwnProperty.call(row, k)", to: "let has = (k) => true", cmd: UNIT_SITE },
    { id: 'M10', desc: '角色改於部署方之後才判定(isAdminRow 移到 verifyClientUser 之後)', file: W, from: '        let isAdmin = isAdminRow(user)\n\n        //verifyClientUser\n        let b = verifyClientUser(user, from)\n        if (ispm(b)) {\n            b = await b\n        }\n', to: '        //verifyClientUser\n        let b = verifyClientUser(user, from)\n        if (ispm(b)) {\n            b = await b\n        }\n        let isAdmin = isAdminRow(user)\n', cmd: UNIT_SITE },
    { id: 'M11', desc: '範圍二: users 不檢查同批重複 id', file: 'server/procCore.mjs', from: "if (arrHas(keyTable, ['pemis', 'grups', 'users'])) {", to: "if (arrHas(keyTable, ['pemis', 'grups'])) {", cmd: DUP },
    { id: 'M12', desc: '範圍二: pickKeysOnly 模式不預檢送入列重複 id', file: 'server/procCore.mjs', from: 'if (kIdDupIn >= 0) {', to: 'if (false) {', cmd: DUP },
    { id: 'M13', desc: '範圍二: 預檢不做數字／字串同值正規化', file: 'server/procCore.mjs', from: "return (typeof id === 'number' && Number.isFinite(id)) ? { id: String(id) } : r\n            }), 'id'", to: "return r\n            }), 'id'", cmd: DUP },
    { id: 'M14', desc: '範圍三: isSameFile 退回 Number inode', file: 'server/tools/authRefsAudit.mjs', from: 'let a = statFn(fpA, { bigint: true })\n        let b = statFn(fpB, { bigint: true })', to: 'let a = statFn(fpA)\n        let b = statFn(fpB)', cmd: RA },
    { id: 'M15', desc: '範圍三: isSameFile 不比 dev', file: 'server/tools/authRefsAudit.mjs', from: 'same = a.ino !== 0n && a.ino === b.ino && a.dev === b.dev', to: 'same = a.ino !== 0n && a.ino === b.ino', cmd: RA },
    { id: 'M17', desc: '外審 sol#3: /api/getPerm 驗證後以 id 重讀(不傳 userSelf)', file: W, from: 'getGenUserAndRulesByUserId(userIdSelf, userSelf)', to: 'getGenUserAndRulesByUserId(userIdSelf)', cmd: AO },
    { id: 'M18', desc: '外審 sol#2: 部署方收到原物件而非副本', file: W, from: 'verifyClientUser({ ...user }, from)', to: 'verifyClientUser(user, from)', cmd: AO },
    { id: 'M19', desc: '外審 sol#6: isSameFile 路徑比對在所有平台不分大小寫', file: 'server/tools/authRefsAudit.mjs', from: "let norm = (p) => (platform === 'win32' ? p.toLowerCase() : p)", to: 'let norm = (p) => p.toLowerCase()', cmd: RA },
    { id: 'M20', desc: '外審 sol#7: isSameFile 拿掉 realpath 判定(ino=0n 時符號連結別名當不同檔)', file: 'server/tools/authRefsAudit.mjs', from: 'same = norm(fs.realpathSync.native(fpA)) === norm(fs.realpathSync.native(fpB))', to: 'same = false', cmd: RA },
    { id: 'M16', desc: 'requireAdmin 站點守護: SITE-EX-013 對 isAdminRow 的檢查(requireAdmin 改回不判角色)', file: W, from: 'if (!isAdminRow(u)) {', to: 'if (!iseobj(u)) {', cmd: EXT13 },
]

const only = process.argv.slice(2)
const results = []
for (const m of muts) {
    if (only.length > 0 && !only.includes(m.id)) {
        continue
    }
    const r = spawnSync('node', ['./tmp/perm-run01/mutate.mjs', m.id, m.desc, m.file, m.from, m.to, '--', ...m.cmd], { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 })
    const line = (r.stdout || '').trim().split('\n').filter((s) => s.startsWith('{')).pop()
    let o
    try {
        o = JSON.parse(line)
    }
    catch (e) {
        o = { id: m.id, error: `無法解析輸出: ${(r.stdout || '').slice(-300)} ${(r.stderr || '').slice(-300)}` }
    }
    results.push({ ...o, desc: m.desc, file: m.file })
    console.log(JSON.stringify(results[results.length - 1]))
}
const dir = 'spec/evidence/perm-run01-20261024'
fs.mkdirSync(dir, { recursive: true })
fs.writeFileSync(`${dir}/mutation-results${only.length > 0 ? '-' + only.join('') : ''}.json`, JSON.stringify(results, null, 2), 'utf8')
