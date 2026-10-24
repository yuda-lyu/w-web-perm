//perm-run05 變異驗證 harness(僅暫存用; 不入版控): 對 <root> 下的 server 檔逐一施加單點變異 → 跑指定測試 → 還原並以 md5 回驗。
//用法: node tmp/perm-run05/mutate.mjs <root> <unit|api> <輸出json> [只跑的變異id逗號分隔]
//  <root> 為 repo 內副本(unit)或 repo 本身(api; 須在 quiet-run --lock 內且無其他測試鏈執行)。
//每個變異: 讀檔 → 每個 [find, replace] 須恰好命中 1 處(否則 INVALID) → 寫入 → mocha(json 報告) → 無論結果一律還原 → md5 與原檔相同才算還原成功。
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { spawnSync } from 'child_process'

const [, , rootArg, setName, outArg, onlyArg] = process.argv
const root = path.resolve(rootArg)
const REPO = 'C:/opensrc/開源-JS-411-8-w-web-perm/w-web-perm'
const MOCHA = path.join(REPO, 'node_modules/mocha/bin/mocha.js')
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex')

const UNIT_TESTS = ['test/unit-loginId.test.mjs', 'test/unit-procCore-loginId.test.mjs', 'test/unit-syncCore.test.mjs', 'test/unit-nameDupReport.test.mjs', 'test/unit-keyCheck.test.mjs']
const API_TESTS = ['test/api-mapKeyId.test.mjs', 'test/api-getPermUserInfor.test.mjs']

//[id, 說明, 檔, [[find, replace]...], set]
const M = [
    //—— keyCheck.mjs ——
    ['K1', '登入查找只計有效列(修前口徑: 兩次 select 帶 isActive:y)', 'server/keyCheck.mjs', [["let rsId = await tabUsers.select({ id: vSelf })", "let rsId = await tabUsers.select({ id: vSelf, isActive: 'y' })"], ["let rsSrc = await tabUsers.select({ srcKey: vSelf })", "let rsSrc = await tabUsers.select({ srcKey: vSelf, isActive: 'y' })"]], 'both'],
    ['K2', '撞值只計有效列(修前口徑)', 'server/keyCheck.mjs', [["if (!rx && !ox) {", "if ((!rx && !ox) || r.isActive !== 'y' || o.isActive !== 'y') {"]], 'unit'],
    ['K3', '撞值不含他來源外部列(otherFrom 不判)', 'server/keyCheck.mjs', [["return { k, kOther, kind: (rx && ox) ? 'otherFrom' : 'adminId' }", "if (rx && ox) {\n                continue\n            }\n            return { k, kOther, kind: 'adminId' }"]], 'unit'],
    ['K4', '同一來源之兩外部列也算撞值', 'server/keyCheck.mjs', [["if (rx && ox && r.from === o.from) {", "if (false) {"]], 'unit'],
    ['K5', '兩後台列也算撞值', 'server/keyCheck.mjs', [["if (!rx && !ox) {", "if (false) {"]], 'unit'],
    ['K6', '舊外部列(無 srcKey)不參與登入識別', 'server/keyCheck.mjs', [["return isEStr(row.id) ? row.id : ''", "return (isEStr(row.id) && !isEStr(row.from)) ? row.id : ''"]], 'unit'],
    ['K7', '登入多筆時只剩一列有效則放行(「只有一列有效」放行)', 'server/keyCheck.mjs', [["return pickUniqueUser(hits)", "return pickUniqueUser(hits.filter((r) => r.isActive === 'y'))"]], 'both'],
    ['K8', '恰 1 筆停用仍登入該列', 'server/keyCheck.mjs', [["if (hits.length === 1 && hits[0].isActive !== 'y') {", "if (false) {"]], 'both'],
    ['K9', '所有列皆視為被觸及(歷史撞值也擋)', 'server/keyCheck.mjs', [["if (v === '' || !isTouched(r, k)) {", "if (v === '') {"]], 'unit'],
    ['K10', '同一來源 claimTwice 形(一有 srcKey 一為舊形)不算撞值(外審 sol 第一輪#1 修前口徑)', 'server/keyCheck.mjs', [["if (isEStr(r.srcKey) === isEStr(o.srcKey)) {", "if (true) {"]], 'unit'],
    ['K12', 'claimTwice 形只在雙方皆有效時算撞值(外審 sol 第二輪#2 之改壞範例)', 'server/keyCheck.mjs', [["return { k, kOther, kind: 'sameFrom' }", "if (r.isActive !== 'y' || o.isActive !== 'y') {\n                    continue\n                }\n                return { k, kOther, kind: 'sameFrom' }"]], 'unit'],
    ['K11', 'claimTwice 形之 kind 誤標為 otherFrom', 'server/keyCheck.mjs', [["return { k, kOther, kind: 'sameFrom' }", "return { k, kOther, kind: 'otherFrom' }"]], 'unit'],
    //—— syncCore.mjs ——
    ['S1', '匯入端不檢查登入識別撞值', 'server/syncCore.mjs', [["let dClash = findLoginIdClashDetail([...others, ...rows], (r, k) => k >= others.length)", "let dClash = null"]], 'both'],
    ['S3', '匯入端 reason 恆為 srcKeyIsAdminId', 'server/syncCore.mjs', [["reason: (dClash.kind === 'otherFrom') ? 'srcKeyOtherFrom' : 'srcKeyIsAdminId'", "reason: 'srcKeyIsAdminId'"]], 'unit'],
    ['S4', '匯入端只與他 from 之有效列比對(修前口徑)', 'server/syncCore.mjs', [["let dClash = findLoginIdClashDetail([...others, ...rows], (r, k) => k >= others.length)", "let dClash = findLoginIdClashDetail([...others.filter((r) => r.isActive === 'y'), ...rows], (r) => rows.includes(r))"]], 'unit'],
    //—— procCore.mjs ——
    ['P1', '後台存檔不檢查登入識別撞值', 'server/procCore.mjs', [["if (dClash !== null) {", "if (false) {"]], 'both'],
    ['P2', '被觸及簽章不含來源', 'server/procCore.mjs', [["`${isestr(v.from) ? `x:${v.from}` : 'a'}|${loginIdOf(v)}`", "`${isestr(v.from) ? 'x' : 'a'}|${loginIdOf(v)}`"]], 'unit'],
    ['P3', '庫內舊列只取有效者(修前口徑: 停用改啟用算被觸及)', 'server/procCore.mjs', [["v !== null && typeof v === 'object' && isestr(v.id)).map((v) => [v.id, sigOf(v)])", "v !== null && typeof v === 'object' && v.isActive === 'y' && isestr(v.id)).map((v) => [v.id, sigOf(v)])"]], 'unit'],
    ['P4', '後台存檔所有列皆視為被觸及', 'server/procCore.mjs', [["(r) => !(isestr(r.id) && loginOld.has(r.id) && loginOld.get(r.id) === sigOf(r))", "() => true"]], 'unit'],
    //—— WWebPerm.mjs ——
    ['W1', 'getPermUserInfor 恢復只以內部 id 查找(不經解析)', 'server/WWebPerm.mjs', [["await getGenUserAndRulesByUserId(userPerm.userId, userPerm.userFind)", "await getGenUserAndRulesByUserId(userIdFind)"]], 'api'],
    ['W2', 'getPermUserInfor 解析命中多筆不拒絕', 'server/WWebPerm.mjs', [["if (count > 1) {", "if (false) {"]], 'api'],
    ['W3', 'getPermUserInfor 於 email／name 模式亦解析(應維持內部 id)', 'server/WWebPerm.mjs', [["if (mapKeyOf(mappingBy) !== null) {", "if (false) {"]], 'api'],
    ['W4', 'getPermUserInfor 查無改 reject userIdNoPermrules(應維持空權限)', 'server/WWebPerm.mjs', [["return iseobj(user) ? { userId: user.id, userFind: user } : { userId: null, userFind: null }", "if (!iseobj(user)) {\n            return Promise.reject('userIdNoPermrules')\n        }\n        return { userId: user.id, userFind: user }"]], 'api'],
    ['W5', '/api/getPerm 亦經 resolvePermUserId', 'server/WWebPerm.mjs', [["let userWithRulesSelf = await getGenUserAndRulesByUserId(userIdSelf)", "let userWithRulesSelf = await getGenUserAndRulesByUserId(await resolvePermUserId(userIdSelf))"]], 'both'],
    ['W8', 'getPermUserInfor 不採用已解析之列, 改以內部 id 重讀(解析與重讀間可被換人)', 'server/WWebPerm.mjs', [["await getGenUserAndRulesByUserId(userPerm.userId, userPerm.userFind)", "await getGenUserAndRulesByUserId(userPerm.userId)"]], 'both'],
    ['W11', 'resolvePermUserId 命中後再以內部 id 重讀使用者(外審 sol 第二輪#1 之改壞範例)', 'server/WWebPerm.mjs', [["return iseobj(user) ? { userId: user.id, userFind: user } : { userId: null, userFind: null }", "return iseobj(user) ? { userId: user.id, userFind: await getGenUserByUserId(user.id) } : { userId: null, userFind: null }"]], 'both'],
    ['W9', 'resolvePermUserId 多筆時不記 srLog', 'server/WWebPerm.mjs', [["srLog.error({ event: 'api/getPermUserInfor-error', msg: 'ambiguousUserFromPerm', mappingBy, count })", "void 0"]], 'api'],
    ['W10', 'resolvePermUserId 之 srLog 記查詢值', 'server/WWebPerm.mjs', [["srLog.error({ event: 'api/getPermUserInfor-error', msg: 'ambiguousUserFromPerm', mappingBy, count })", "srLog.error({ event: 'api/getPermUserInfor-error', msg: 'ambiguousUserFromPerm', mappingBy, count, userId: userIdFind })"]], 'api'],
    ['W7', 'getTokenUser 多筆不拒絕(放行 null→查無)', 'server/WWebPerm.mjs', [["if (countFind > 1) {", "if (false) {"]], 'both'],
    //—— nameDupReport.mjs ——
    ['N1', '離線稽核不列登入識別撞值', 'server/tools/nameDupReport.mjs', [["dup: loginIdDups(d.users) }", "dup: [] }"]], 'unit'],
    ['N2', '離線稽核只列有效列之撞值', 'server/tools/nameDupReport.mjs', [["        if (v === '') {", "        if (v === '' || u.isActive !== 'y') {"]], 'unit'],
    ['N3', '離線稽核不列同一來源之重複(外審 sol 第一輪#5 修前口徑)', 'server/tools/nameDupReport.mjs', [[".filter(([, rs]) => rs.length >= 2)\n        .map(([value, rs]) => ({ value, scope:", ".filter(([, rs]) => rs.length >= 2 && findLoginIdClashDetail(rs, () => true) !== null)\n        .map(([value, rs]) => ({ value, scope:"]], 'unit'],
    ['P5', '後台存檔 reason 不分 sameFrom', 'server/procCore.mjs', [["((dClash.kind === 'sameFrom') ? 'srcKeyClaimTwice' : 'adminIdIsSrcKey')", "'adminIdIsSrcKey'"]], 'unit'],
]

const only = onlyArg ? new Set(onlyArg.split(',')) : null
const list = M.filter(([id, , , , set]) => (set === 'both' || set === setName) && (!only || only.has(id)))
const tests = setName === 'unit' ? UNIT_TESTS : API_TESTS
const results = []

let runMocha = (tag) => {
    const out = path.join(root, `tmp-mut-${tag}.json`)
    try { fs.rmSync(out, { force: true }) } catch (e) { /* ignore */ }
    const r = spawnSync(process.execPath, [MOCHA, '--no-parallel', ...tests, '--reporter', 'json', '--reporter-option', `output=${out}`, '--timeout', '300000'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 })
    let rep = null
    try { rep = JSON.parse(fs.readFileSync(out, 'utf8')) } catch (e) { rep = null }
    try { fs.rmSync(out, { force: true }) } catch (e) { /* ignore */ }
    return { status: r.status, rep, stderrTail: (r.stderr || '').slice(-400) }
}

//基準(不變異)
{
    const b = runMocha('base')
    const f = b.rep ? b.rep.stats.failures : -1
    const p = b.rep ? b.rep.stats.passes : -1
    console.log(`BASE: passes=${p} failures=${f} status=${b.status}`)
    results.push({ id: 'BASE', passes: p, failures: f })
    if (f !== 0) {
        console.log('基準非全綠, 中止')
        fs.writeFileSync(outArg, JSON.stringify(results, null, 1))
        process.exit(2)
    }
}

for (const [id, note, file, edits] of list) {
    const fp = path.join(root, file)
    const orig = fs.readFileSync(fp, 'utf8')
    const h0 = md5(orig)
    const eol = orig.includes('\r\n') ? '\r\n' : '\n'
    let text = orig
    let invalid = null
    for (const [find, rep] of edits) {
        const f = find.replace(/\n/g, eol)
        const n = text.split(f).length - 1
        if (n !== 1) {
            invalid = `find 命中 ${n} 處: ${find.slice(0, 60)}`
            break
        }
        text = text.replace(f, () => rep.replace(/\n/g, eol))
    }
    let res = null
    if (invalid === null) {
        try {
            fs.writeFileSync(fp, text)
            const r = runMocha(id)
            const fails = r.rep ? r.rep.failures.map((x) => x.fullTitle.replace(/\s+/g, ' ').slice(0, 90)) : []
            res = { id, note, file, status: r.status, passes: r.rep ? r.rep.stats.passes : -1, failures: r.rep ? r.rep.stats.failures : -1, caught: r.rep ? r.rep.stats.failures > 0 : (r.status !== 0), titles: fails.slice(0, 6), crash: r.rep === null ? r.stderrTail : undefined }
        }
        finally {
            fs.writeFileSync(fp, orig)
        }
    }
    else {
        res = { id, note, file, invalid }
    }
    const restored = md5(fs.readFileSync(fp, 'utf8')) === h0
    res.restored = restored
    results.push(res)
    console.log(`${id} ${res.invalid ? 'INVALID ' + res.invalid : (res.caught ? 'CAUGHT' : 'SURVIVED')} failures=${res.failures} restored=${restored} :: ${note}${res.titles && res.titles.length ? ' :: ' + res.titles[0] : ''}`)
    if (!restored) {
        console.log('!!! 還原失敗, 中止')
        break
    }
}
fs.writeFileSync(outArg, JSON.stringify(results, null, 1))
console.log(`DONE ${results.length - 1} mutants -> ${outArg}`)
