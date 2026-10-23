//users 登入對應 mappingBy='id' 之 O1 規則(perm-run04 範圍一; 真後端): 外部列(from 非空)以外部 token 使用者 id 對 srcKey、後台列(from 空)對 id; 撞值於匯入批次、後台存檔、登入三處皆拒。
//規格(真理源): C:\opensrcOper\dspec\外部匯入之定義與機制.md 第 9 節末(主控 2026-10-24 定案 O1); 規則帳本 R-MAPKEY-04; 上位 R-PRINCIPLE-00 原則 3(衝突收嚴＋提示)、4(所有入口一致)。
//
//測試 token(srv.mjs getUserByToken 寫死): '{token-for-admin2}' → id 'id-for-admin2'／email admin2@example.com／name admin2／isAdmin 'y'(過 verifyClientUser 需 perm 內該列 isAdmin='y')。
//本檔以此 token 扮演「外部系統的使用者」: 外部列的 srcKey＝'id-for-admin2'(外部使用者 id), 其 perm 內部 id 為本系統配發之值(≠ 'id-for-admin2')。
//述語:
//  M1 經匯入新增之外部使用者(內部 id 為系統配)以其 srcKey 登入成功, 回 perm 列(id＝內部 id); 登入入口、資料通道(連線閘＋執行身分)、getPerm 皆通;
//  M2 外部列的內部 id 不是登入識別: 外部列的 id 恰等於 token 使用者 id 而 srcKey 不同 → 查無(cannotGetUserFromPerm), 資料通道 permission denied;
//  M3 遷移: 遷移前之舊外部列(無 srcKey)暫以 id 登入(同升版前); 首次匯入補上 srcKey(srcKey＝舊 id)後照常登入、id 不變;
//  M4 後台列(from 空)仍以 id 登入(不變); 預設管理者 'sys' 不受影響;
//  M5 匯入撞值: 批次 srcKey 等於有效後台列 id → 整批拒收 loginIdCollision、零寫入;
//  M6 後台存檔撞值: 新增之後台列 id 等於有效外部列 srcKey → 整次拒收 loginIdCollision、零變更;
//  M7 登入撞多筆(歷史資料: 後台列 id 與外部列 srcKey 相同, 皆有效)→ ambiguousUserFromPerm, 不取首筆; 資料通道 permission denied;
//  M8 mappingBy 為 email／name 時行為不變: 以該欄位登入(與 srcKey 無關), 匯入 srcKey 等於後台 id 不拒;
//  M9 停用的外部列不能登入; 重新匯入為有效後可登入; 停用列不構成撞值;
//  M10 以 srcKey 登入之外部管理員呼叫寫入函數: 執行身分為其 perm 內部 id(稽核欄位記內部 id, 非 srcKey)。
//跑法(需測試鎖): node C:/opensrcOper/tools/quiet-run.mjs --name mapkeyid --lock --timeout 1800 -- npx mocha test/api-mapKeyId.test.mjs --timeout 300000
import assert from 'assert'
import { startApi, TOKEN_ADMIN, TOKEN_ADMIN2, TOKEN_APP, urlSync, getWoItems, callRpc, readTables, restoreTables, selectAllRows, cleanExternalFixtures } from './tools/api-setup.mjs'
import { restartBackend, genTempSettings, apiBaseUrl } from './tools/e2e-setup.mjs'

const A = assert.strict
const X2 = 'id-for-admin2' //'{token-for-admin2}' 之使用者 id
const FROMS = ['appMi-1', 'appMi-2', 'appMi-3', 'appMi-5', 'appMi-6', 'appMi-7', 'appMi-8', 'appMi-9', 'appMi-10']
const T0 = '2026-01-01 00:00:00'

let postSync = async (keyTable, body) => {
    let url = urlSync.replace('{keyTable}', keyTable).replace('{token}', TOKEN_APP)
    let res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) })
    return await res.json()
}
let getUserByTokenApi = async (token) => (await fetch(`${apiBaseUrl}/api/getUserByToken?token=${encodeURIComponent(token)}`)).json()
let getPermApi = async (token) => (await fetch(`${apiBaseUrl}/api/getPerm?token=${encodeURIComponent(token)}`)).json()

//extRow: 匯入批次之外部使用者列(srcKey＝外部系統的使用者 id; 不送 id)
let extRow = (srcKey, o = {}) => ({ srcKey, order: 0, name: 'admin2', email: 'admin2@example.com', description: 'ext', cgrups: '{}', isAdmin: 'y', isActive: 'y', ...o })
//fullRow: 直接寫庫之完整列(測試框架夾具: 遷移前舊外部列、歷史撞值、外部列的內部 id 指定); 欄位承 schema 全欄
let fullRow = (o) => ({ id: 'x', order: 0, name: 'admin2', email: 'admin2@example.com', description: 'fixture', from: '', cgrups: '{}', isAdmin: 'y', isActive: 'y', userId: 'id-for-application', timeCreate: T0, userIdUpdate: 'id-for-application', timeUpdate: T0, ...o })
let putRows = async (rows) => {
    let rs = await (await getWoItems()).users.save(rows)
    A.ok(Array.isArray(rs) && !rs.some((v) => v && v.ok === 0), `直接寫入夾具列應成功，實得: ${JSON.stringify(rs).slice(0, 300)}`)
}
let rowsFrom = async (from) => (await (await getWoItems()).users.select({ from }))
//newAdminRow: 後台新增之使用者列(from ''; 稽核欄位由伺服端填)
let backendRow = (id, o = {}) => ({ id, order: 99, name: 'admin2-b', email: 'admin2-b@example.com', description: '', from: '', cgrups: '{}', isAdmin: 'y', isActive: 'y', ...o })
//addBackend: 以管理員在現況之上追加後台列(回 callRpc 結果, 不丟錯)
let addBackend = async (rows) => {
    let cur = (await selectAllRows('users')).slice().sort((a, b) => (a.order || 0) - (b.order || 0)).map((v) => JSON.parse(JSON.stringify(v)))
    return await callRpc('updateUsers', [[...cur, ...rows]], TOKEN_ADMIN)
}
let snapUsers = async () => JSON.stringify((await selectAllRows('users')).slice().sort((a, b) => String(a.id).localeCompare(String(b.id))))


describe('api-mapKeyId (mappingBy=id 之 O1: 外部列對 srcKey、後台列對 id, 撞值收嚴; perm-run04, R-MAPKEY-04)', function() {
    this.timeout(300000)

    let BASE = null

    before(async function() {
        this.timeout(300000)
        await startApi() //預設 settings.json(無 mappingBy → 'id')
        BASE = await readTables()
    })

    afterEach(async function() {
        this.timeout(120000)
        await cleanExternalFixtures({ kts: ['users'], froms: FROMS })
        await restoreTables(BASE)
    })

    after(async function() {
        this.timeout(300000)
        await restartBackend('./settings.json') //本檔曾切換 mappingBy
        await cleanExternalFixtures({ kts: ['users'], froms: FROMS })
        await restoreTables(BASE)
    })


    it('MI-001 經匯入新增之外部使用者(內部 id 為系統配)以其 srcKey 登入: 登入入口、getPerm、資料通道皆通; 回 perm 列(id 為內部 id, ≠ srcKey)  [M1]', async function() {
        let res = await postSync('users', { from: 'appMi-1', rows: [extRow(X2)] })
        A.equal(res.state, 'success', JSON.stringify(res))
        let rows = await rowsFrom('appMi-1')
        A.equal(rows.length, 1)
        A.equal(rows[0].srcKey, X2)
        A.notEqual(rows[0].id, X2, '前提: 內部 id 為系統配, 不是外部使用者 id')

        let r = await getUserByTokenApi(TOKEN_ADMIN2)
        A.equal(r.state, 'success', `以 srcKey 應可登入, 實得: ${JSON.stringify(r)}`)
        A.equal(r.msg.id, rows[0].id, '回的是 perm 內之列(內部 id)')
        let rp = await getPermApi(TOKEN_ADMIN2)
        A.equal(rp.state, 'success', `getPerm: ${JSON.stringify(rp).slice(0, 200)}`)
        let rc = await callRpc('getWebInfor', [], TOKEN_ADMIN2) //連線閘(標頭)＋執行身分(本體)皆以同一 token 通過完整驗證
        A.equal(rc.ok, true, `資料通道: ${JSON.stringify(rc).slice(0, 200)}`)
    })

    it('MI-002 外部列的內部 id 恰等於 token 使用者 id、srcKey 不同 → 查無(內部 id 不是登入識別): 登入 cannotGetUserFromPerm、資料通道 permission denied  [M2]', async function() {
        await putRows([fullRow({ id: X2, srcKey: 'mi2-some-guid', from: 'appMi-2' })])
        let r = await getUserByTokenApi(TOKEN_ADMIN2)
        A.equal(r.state, 'error', `外部列不得以內部 id 登入, 實得: ${JSON.stringify(r)}`)
        A.equal(r.msg, 'cannotGetUserFromPerm')
        let rc = await callRpc('getWebInfor', [], TOKEN_ADMIN2)
        A.equal(rc.ok, false)
        A.ok(/permission denied/.test(String(rc.msg)), `傳輸層回 permission denied，實得: ${rc.msg}`)
    })

    it('MI-003 遷移: 舊外部列(無 srcKey)暫以 id 登入; 首次匯入(srcKey＝舊 id)補上 srcKey 後照常登入、id 不變、其後只認 srcKey  [M3]', async function() {
        await putRows([fullRow({ id: X2, from: 'appMi-3' })]) //遷移前資料: 無 srcKey
        let r0 = await getUserByTokenApi(TOKEN_ADMIN2)
        A.equal(r0.state, 'success', `遷移前舊外部列應照常登入(同升版前), 實得: ${JSON.stringify(r0)}`)
        A.equal(r0.msg.id, X2)

        let res = await postSync('users', { from: 'appMi-3', rows: [extRow(X2, { description: 'fixture' })] }) //srcKey＝舊 id
        A.equal(res.state, 'success', JSON.stringify(res))
        A.deepEqual(res.msg, { nAdd: 0, nUpdate: 1, nDel: 0, nSame: 0 })
        let rows = await rowsFrom('appMi-3')
        A.deepEqual([rows.length, rows[0].id, rows[0].srcKey], [1, X2, X2])
        let r1 = await getUserByTokenApi(TOKEN_ADMIN2)
        A.equal(r1.state, 'success', `遷移後照常登入, 實得: ${JSON.stringify(r1)}`)
        A.equal(r1.msg.id, X2)
    })

    it('MI-004 後台列仍以 id 登入(不變); 預設管理者 sys 不受影響  [M4]', async function() {
        let ra = await addBackend([backendRow(X2)])
        A.equal(ra.ok, true, JSON.stringify(ra))
        let r = await getUserByTokenApi(TOKEN_ADMIN2)
        A.equal(r.state, 'success', JSON.stringify(r))
        A.equal(r.msg.id, X2)
        let rs = await getUserByTokenApi(TOKEN_ADMIN)
        A.equal(rs.state, 'success')
        A.equal(rs.msg.id, 'id-for-admin')
    })

    it('MI-005 匯入撞值: 批次 srcKey 等於有效後台列 id → 整批 loginIdCollision、零寫入(含批次中其他列)  [M5]', async function() {
        let ra = await addBackend([backendRow(X2)])
        A.equal(ra.ok, true, JSON.stringify(ra))
        let before = await snapUsers()
        let res = await postSync('users', { from: 'appMi-5', rows: [extRow('mi5-ok', { name: 'ok5', email: 'ok5@example.com' }), extRow(X2)] })
        A.equal(res.state, 'error', `應被拒, 實得: ${JSON.stringify(res)}`)
        A.equal(res.msg, 'loginIdCollision')
        A.equal(await snapUsers(), before, '零寫入: users 表逐位元不變')
        A.equal((await rowsFrom('appMi-5')).length, 0)
        //外部端不能靠此探測內部 id 值: 回應固定訊息, 不含 id／srcKey
        A.ok(!JSON.stringify(res).includes(X2), '回應不得回顯 srcKey／id')
    })

    it('MI-006 後台存檔撞值: 新增後台列 id 等於有效外部列 srcKey → 整次 loginIdCollision、零變更; 登入仍對到外部列  [M6]', async function() {
        let res = await postSync('users', { from: 'appMi-6', rows: [extRow(X2)] })
        A.equal(res.state, 'success', JSON.stringify(res))
        let before = await snapUsers()
        let ra = await addBackend([backendRow(X2)])
        A.equal(ra.ok, false, `應被拒, 實得: ${JSON.stringify(ra).slice(0, 200)}`)
        A.equal(ra.msg, 'loginIdCollision')
        A.equal(await snapUsers(), before, '零變更')
        let r = await getUserByTokenApi(TOKEN_ADMIN2)
        A.equal(r.state, 'success', '登入仍唯一對到外部列')
        A.equal((await rowsFrom('appMi-6'))[0].id, r.msg.id)
    })

    it('MI-007 登入撞多筆(歷史資料: 後台列 id 與外部列 srcKey 相同, 皆有效, 旁路寫庫)→ ambiguousUserFromPerm, 不取首筆; 資料通道 permission denied; 其餘使用者不受影響  [M7]', async function() {
        await putRows([fullRow({ id: X2, from: '' }), fullRow({ id: 'sys-mi7', srcKey: X2, from: 'appMi-7' })])
        let r = await getUserByTokenApi(TOKEN_ADMIN2)
        A.equal(r.state, 'error', `命中 2 筆應拒絕, 實得: ${JSON.stringify(r)}`)
        A.equal(r.msg, 'ambiguousUserFromPerm')
        let rc = await callRpc('getWebInfor', [], TOKEN_ADMIN2)
        A.equal(rc.ok, false)
        A.ok(/permission denied/.test(String(rc.msg)), `傳輸層回 permission denied，實得: ${rc.msg}`)
        let rs = await getUserByTokenApi(TOKEN_ADMIN)
        A.equal(rs.state, 'success', '其餘使用者不受影響')
        //在後台修復(刪除其中後台列)後恢復: 歷史撞值不使所有存檔失敗
        let cur = (await selectAllRows('users')).filter((v) => v.id !== X2).sort((a, b) => (a.order || 0) - (b.order || 0))
        let fix = await callRpc('updateUsers', [cur], TOKEN_ADMIN)
        A.equal(fix.ok, true, `歷史撞值存在時後台仍可存檔修復, 實得: ${JSON.stringify(fix).slice(0, 200)}`)
        let r2 = await getUserByTokenApi(TOKEN_ADMIN2)
        A.equal(r2.state, 'success', `修復後恰 1 筆(外部列)應登入, 實得: ${JSON.stringify(r2)}`)
    })

    it('MI-008 mappingBy 為 email／name 時行為不變: 以該欄位登入(與 srcKey 無關); 匯入 srcKey 等於後台列 id 不拒  [M8]', async function() {
        for (let mode of ['email', 'name']) {
            await restartBackend(genTempSettings({ mappingBy: mode }))
            let from = `appMi-8`
            //srcKey 刻意等於 base seed 之後台列 id('id-for-admin'): id 模式下撞值, email／name 模式下與登入無關
            let res = await postSync('users', { from, rows: [extRow('id-for-admin', { name: 'admin2', email: 'admin2@example.com' })] })
            A.equal(res.state, 'success', `mappingBy=${mode} 不檢查, 實得: ${JSON.stringify(res)}`)
            let r = await getUserByTokenApi(TOKEN_ADMIN2)
            A.equal(r.state, 'success', `mappingBy=${mode} 以 ${mode} 登入, 實得: ${JSON.stringify(r)}`)
            A.equal(r.msg.srcKey, 'id-for-admin', '對到的是該外部列(與其 srcKey 無關)')
            let rs = await getUserByTokenApi(TOKEN_ADMIN)
            A.equal(rs.state, 'success', `mappingBy=${mode} 後台管理者 sys 仍以 ${mode} 登入`)
            A.equal(rs.msg.id, 'id-for-admin')
            await cleanExternalFixtures({ kts: ['users'], froms: [from] })
        }
        await restartBackend('./settings.json')
    })

    it('MI-009 停用的外部列不能登入; 重新匯入為有效後可登入; 停用列不構成撞值  [M9]', async function() {
        let res = await postSync('users', { from: 'appMi-9', rows: [extRow(X2, { isActive: 'n' })] })
        A.equal(res.state, 'success', JSON.stringify(res))
        let r0 = await getUserByTokenApi(TOKEN_ADMIN2)
        A.equal(r0.state, 'error')
        A.equal(r0.msg, 'cannotGetUserFromPerm')
        //停用的外部列 srcKey 等於後台列 id: 不構成撞值(匯入可、後台新增可)
        let ra = await addBackend([backendRow(X2, { isActive: 'n' })]) //停用的後台列, 與停用的外部列 srcKey 相同
        A.equal(ra.ok, true, JSON.stringify(ra))
        let res2 = await postSync('users', { from: 'appMi-9', rows: [extRow(X2, { isActive: 'y' })] }) //外部列轉有效, 後台列仍停用: 可
        A.equal(res2.state, 'success', JSON.stringify(res2))
        let r1 = await getUserByTokenApi(TOKEN_ADMIN2)
        A.equal(r1.state, 'success', `外部列有效、後台列停用: 恰 1 筆, 實得: ${JSON.stringify(r1)}`)
        A.equal(r1.msg.srcKey, X2)
    })

    it('MI-010 以 srcKey 登入之外部管理員呼叫寫入函數: 通過 requireAdmin, 稽核欄位記其 perm 內部 id(不是 srcKey)  [M10]', async function() {
        let res = await postSync('users', { from: 'appMi-10', rows: [extRow(X2)] })
        A.equal(res.state, 'success', JSON.stringify(res))
        let me = (await rowsFrom('appMi-10'))[0]
        let grups = (await selectAllRows('grups')).slice().sort((a, b) => (a.order || 0) - (b.order || 0)).map((v) => JSON.parse(JSON.stringify(v)))
        let add = { id: 'id-mi10-g', order: 0, name: 'mi10-g', description: 'mi10', from: '', cpemis: '{}' }
        let rc = await callRpc('updateGrups', [[...grups, add]], TOKEN_ADMIN2)
        A.equal(rc.ok, true, `外部管理員(srcKey 登入)可寫入, 實得: ${JSON.stringify(rc).slice(0, 200)}`)
        let g = (await selectAllRows('grups')).find((v) => v.id === 'id-mi10-g')
        A.ok(g)
        A.equal(g.userId, me.id, '建立者記 perm 內部 id')
        A.notEqual(g.userId, X2, '不是 srcKey')
    })
})
