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
//  M9 停用的外部列不能登入(恰 1 筆且停用 → 查無); 重新匯入為有效後可登入; perm-run05 起停用列仍構成撞值(不論 isActive): 匯入／後台存檔皆拒;
//  M10 以 srcKey 登入之外部管理員呼叫寫入函數: 執行身分為其 perm 內部 id(稽核欄位記內部 id, 非 srcKey)。
//perm-run05(主控 2026-10-24 收件裁示; 規則帳本 R-MAPKEY-05): 登入識別值須跨全表唯一、不論 isActive、含他來源——
//  M11 匯入撞值(他來源): 批次 srcKey 等於他來源既有外部列之 srcKey(含停用者)→ 整批 loginIdCollision、零寫入; 同來源重送自己之列不算;
//  M12 登入撞多筆不論有效與否: 兩來源同 srcKey 且一有效一停用 → ambiguousUserFromPerm(不以「只有一列有效」放行); 清掉其一後恰 1 筆有效照常登入;
//  M13 匯入撞值(遷移前舊外部列): 他來源舊外部列(無 srcKey)以 id 為登入識別而參與, 批次 srcKey 等於其 id → 整批拒收;
//  M14 getPermUserInfor(mappingBy='id'): userId 依登入對應解析——外部列傳 srcKey(傳內部 id 查無、回全停用空權限)、後台列傳 id、停用列查無、命中多筆 → HTTP 回應 msg 為 ambiguousUserFromPerm;
//  M15 getPermUserInfor(mappingBy 為 email／name): userId 維持 perm 內部 id(不變), 傳 srcKey 查無;
//  M16 後台存檔撞值不論 isActive: 新增停用之後台列 id 等於停用外部列 srcKey → 整次 loginIdCollision、零變更。
//跑法(需測試鎖): node C:/opensrcOper/tools/quiet-run.mjs --name mapkeyid --lock --timeout 1800 -- npx mocha test/api-mapKeyId.test.mjs --timeout 300000
import assert from 'assert'
import { startApi, TOKEN_ADMIN, TOKEN_ADMIN2, TOKEN_APP, urlSync, getWoItems, callRpc, readTables, restoreTables, selectAllRows, cleanExternalFixtures, markSrLog, readSrLogSince } from './tools/api-setup.mjs'
import { restartBackend, genTempSettings, apiBaseUrl } from './tools/e2e-setup.mjs'

const A = assert.strict
const X2 = 'id-for-admin2' //'{token-for-admin2}' 之使用者 id
const FROMS = ['appMi-1', 'appMi-2', 'appMi-3', 'appMi-5', 'appMi-6', 'appMi-7', 'appMi-8', 'appMi-9', 'appMi-10', 'appMi-11a', 'appMi-11b', 'appMi-12a', 'appMi-12b', 'appMi-13a', 'appMi-13b', 'appMi-14', 'appMi-15', 'appMi-16']
const T0 = '2026-01-01 00:00:00'

let postSync = async (keyTable, body) => {
    let url = urlSync.replace('{keyTable}', keyTable).replace('{token}', TOKEN_APP)
    let res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) })
    return await res.json()
}
let getUserByTokenApi = async (token) => (await fetch(`${apiBaseUrl}/api/getUserByToken?token=${encodeURIComponent(token)}`)).json()
let getPermApi = async (token) => (await fetch(`${apiBaseUrl}/api/getPerm?token=${encodeURIComponent(token)}`)).json()
//裸 HTTP 取 getPermUserInfor 之原始回應(app 使用者 token; 不經 client SDK, 以便檢視 msg 鍵)
let getPermUserInforApi = async (userId) => (await fetch(`${apiBaseUrl}/api/getPermUserInfor?token=${encodeURIComponent(TOKEN_APP)}&userId=${encodeURIComponent(userId)}`)).json()

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
//waitLines: srLog 經 pino 非同步落檔, 以標記(動作之前取)定位後輪詢到符合 pred 之行(同 api-callerIdentity)
let waitLines = async (mark, pred, label, ms = 30000) => {
    let tEnd = Date.now() + ms
    let lines = []
    while (Date.now() < tEnd) {
        lines = readSrLogSince(mark)
        if (lines.some(pred)) {
            return lines
        }
        await new Promise((resolve) => setTimeout(resolve, 100))
    }
    throw new Error(`${label}: ${ms} ms 內未見預期之 log 行; 實得 ${JSON.stringify(lines.map((l) => l.event || l.msg)).slice(0, 300)}`)
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
        A.equal(rp.msg.user.id, rows[0].id, 'getPerm 以 getTokenUser 回傳之內部 id 查本人(不經 getPermUserInfor 之 userId 解析; perm-run05: 若誤經解析, 外部列以內部 id 會查無而 user 無 id)')
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

    it('MI-009 停用的外部列不能登入(恰 1 筆且停用 → 查無); 與之同值的停用後台列仍構成撞值(perm-run05: 不論 isActive, 後台存檔整次拒收); 重新匯入為有效後可登入  [M9]', async function() {
        let res = await postSync('users', { from: 'appMi-9', rows: [extRow(X2, { isActive: 'n' })] })
        A.equal(res.state, 'success', JSON.stringify(res))
        let r0 = await getUserByTokenApi(TOKEN_ADMIN2)
        A.equal(r0.state, 'error')
        A.equal(r0.msg, 'cannotGetUserFromPerm')
        //停用的外部列 srcKey 等於(停用)後台列 id: 構成撞值(修正前為「停用列不參與」而放行, 其後任一方轉有效即造成登入永久拒絕)
        let before = await snapUsers()
        let ra = await addBackend([backendRow(X2, { isActive: 'n' })])
        A.equal(ra.ok, false, `不論 isActive 皆拒, 實得: ${JSON.stringify(ra).slice(0, 200)}`)
        A.equal(ra.msg, 'loginIdCollision')
        A.equal(await snapUsers(), before, '零變更')
        let res2 = await postSync('users', { from: 'appMi-9', rows: [extRow(X2, { isActive: 'y' })] }) //同來源重送並轉有效: 可
        A.equal(res2.state, 'success', JSON.stringify(res2))
        let r1 = await getUserByTokenApi(TOKEN_ADMIN2)
        A.equal(r1.state, 'success', `外部列有效: 恰 1 筆, 實得: ${JSON.stringify(r1)}`)
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

    it('MI-011 匯入撞值(他來源; perm-run05): 批次 srcKey 等於他來源既有外部列之 srcKey(含停用者)→ 整批 loginIdCollision、零寫入; 同來源重送自己之列不算; 改用不同 srcKey 後可匯入  [M11]', async function() {
        let r1 = await postSync('users', { from: 'appMi-11a', rows: [extRow(X2, { isActive: 'n' })] })
        A.equal(r1.state, 'success', JSON.stringify(r1))
        let before = await snapUsers()
        for (let isActive of ['y', 'n']) { //本批列有效或停用皆拒(停用列可被重新啟用, 不得預先放行)
            let res = await postSync('users', { from: 'appMi-11b', rows: [extRow('mi11-ok', { name: 'ok11', email: 'ok11@example.com' }), extRow(X2, { name: 'dup11', email: 'dup11@example.com', isActive })] })
            A.equal(res.state, 'error', `isActive=${isActive} 應被拒, 實得: ${JSON.stringify(res)}`)
            A.equal(res.msg, 'loginIdCollision')
            A.equal(await snapUsers(), before, '零寫入: users 表逐位元不變(含批次中不撞之列)')
            A.ok(!JSON.stringify(res).includes(X2), '回應不得回顯 srcKey／id')
        }
        A.equal((await rowsFrom('appMi-11b')).length, 0)
        let r2 = await postSync('users', { from: 'appMi-11a', rows: [extRow(X2, { isActive: 'n' })] }) //同來源重送自己之列
        A.equal(r2.state, 'success', JSON.stringify(r2))
        A.deepEqual(r2.msg, { nAdd: 0, nUpdate: 0, nDel: 0, nSame: 1 })
        let r3 = await postSync('users', { from: 'appMi-11b', rows: [extRow('mi11-ok', { name: 'ok11', email: 'ok11@example.com' }), extRow('mi11-other', { name: 'oth11', email: 'oth11@example.com' })] })
        A.equal(r3.state, 'success', `改用可唯一對應之 srcKey 後可匯入, 實得: ${JSON.stringify(r3)}`)
        A.deepEqual(r3.msg, { nAdd: 2, nUpdate: 0, nDel: 0, nSame: 0 })
    })

    it('MI-012 登入撞多筆不論有效與否(perm-run05): 兩來源同 srcKey 且一有效一停用(歷史資料, 旁路寫庫)→ ambiguousUserFromPerm, 不因「只有一列有效」放行; 清掉其一後恰 1 筆有效照常登入  [M12]', async function() {
        await putRows([
            fullRow({ id: 'sys-mi12a', srcKey: X2, from: 'appMi-12a', isActive: 'n', name: 'mi12a', email: 'mi12a@example.com' }),
            fullRow({ id: 'sys-mi12b', srcKey: X2, from: 'appMi-12b', isActive: 'y', name: 'mi12b', email: 'mi12b@example.com' }),
        ])
        let mark = await markSrLog()
        let r = await getUserByTokenApi(TOKEN_ADMIN2)
        A.equal(r.state, 'error', `命中 2 筆(含停用者)應拒絕, 實得: ${JSON.stringify(r)}`)
        A.equal(r.msg, 'ambiguousUserFromPerm')
        //既有跨來源重複之歷史資料: 登入拒絕並有 srLog 記錄(裁示①): 只記 mappingBy 與筆數, 不記登入值
        let lines = await waitLines(mark, (l) => l.event === 'getTokenUser-error' && l.msg === 'ambiguousUserFromPerm', 'getTokenUser-error')
        let ev = lines.find((l) => l.event === 'getTokenUser-error' && l.msg === 'ambiguousUserFromPerm')
        A.equal(ev.mappingBy, 'id')
        A.equal(ev.count, 2)
        A.ok(!JSON.stringify(ev).includes(X2), 'srLog 不得記登入值')
        let rc = await callRpc('getWebInfor', [], TOKEN_ADMIN2)
        A.equal(rc.ok, false)
        A.ok(/permission denied/.test(String(rc.msg)), `傳輸層回 permission denied，實得: ${rc.msg}`)
        let rs = await getUserByTokenApi(TOKEN_ADMIN)
        A.equal(rs.state, 'success', '其餘使用者不受影響')
        await cleanExternalFixtures({ kts: ['users'], froms: ['appMi-12a'] }) //清掉停用的那一列
        let r2 = await getUserByTokenApi(TOKEN_ADMIN2)
        A.equal(r2.state, 'success', `恰 1 筆有效應登入, 實得: ${JSON.stringify(r2)}`)
        A.equal(r2.msg.id, 'sys-mi12b')
    })

    it('MI-013 遷移前舊外部列(無 srcKey, 他來源)以 id 為登入識別而參與(主控裁示③): 批次 srcKey 等於其 id → 整批拒收、零寫入; 該來源首次匯入(srcKey＝舊 id)仍可遷移  [M13]', async function() {
        await putRows([fullRow({ id: X2, from: 'appMi-13a', name: 'leg13', email: 'leg13@example.com' })]) //遷移前資料: 無 srcKey
        let before = await snapUsers()
        let res = await postSync('users', { from: 'appMi-13b', rows: [extRow(X2, { name: 'imp13', email: 'imp13@example.com' })] })
        A.equal(res.state, 'error', `應被拒, 實得: ${JSON.stringify(res)}`)
        A.equal(res.msg, 'loginIdCollision')
        A.equal(await snapUsers(), before, '零寫入')
        let r3 = await postSync('users', { from: 'appMi-13a', rows: [extRow(X2, { name: 'leg13', email: 'leg13@example.com', description: 'fixture' })] })
        A.equal(r3.state, 'success', JSON.stringify(r3))
        A.deepEqual(r3.msg, { nAdd: 0, nUpdate: 1, nDel: 0, nSame: 0 })
    })

    it('MI-014 getPermUserInfor(mappingBy=id)的 userId 依登入對應解析(perm-run05, 主控裁示②): 外部列傳 srcKey 命中、傳內部 id 查無(回全停用空權限)、後台列傳 id、停用列查無、命中多筆回 ambiguousUserFromPerm  [M14]', async function() {
        let res = await postSync('users', { from: 'appMi-14', rows: [extRow(X2), extRow('mi14-off', { name: 'off14', email: 'off14@example.com', isActive: 'n' })] })
        A.equal(res.state, 'success', JSON.stringify(res))
        let me = (await rowsFrom('appMi-14')).find((v) => v.srcKey === X2)
        A.ok(me && me.id !== X2, '前提: 外部列之內部 id 為系統配, 不是外部使用者 id')

        let r1 = await getPermUserInforApi(X2) //外部列: 傳 srcKey
        A.equal(r1.state, 'success', JSON.stringify(r1).slice(0, 200))
        A.equal(r1.msg.user.id, me.id, '解析為該外部列(回的是內部 id)')
        A.equal(r1.msg.user.srcKey, X2)

        let r2 = await getPermUserInforApi(me.id) //傳內部 id: 不是登入識別 → 查無 → 全停用空權限(同不存在的 userId)
        A.equal(r2.state, 'success', JSON.stringify(r2).slice(0, 200))
        A.equal(r2.msg.user.id, undefined, '內部 id 不得命中外部列')
        A.ok(Array.isArray(r2.msg.rules) && r2.msg.rules.every((v) => v.isActive === 'n'), '空權限')

        let r3 = await getPermUserInforApi('id-for-admin') //後台列: 傳 id
        A.equal(r3.state, 'success')
        A.equal(r3.msg.user.id, 'id-for-admin')
        A.ok(r2.msg.rules.length > 0 && r2.msg.rules.length === r3.msg.rules.length, '空權限須列出全部標的(筆數同有權限者), 不得是 rules=[] 之空洞「全 n」(外審 sol 第一輪#8)')

        let r4 = await getPermUserInforApi('mi14-off') //停用的外部列: 查無
        A.equal(r4.state, 'success')
        A.equal(r4.msg.user.id, undefined, '停用列查無')

        await putRows([fullRow({ id: X2, from: '', name: 'bk14', email: 'bk14@example.com' })]) //歷史撞值(旁路寫庫): 後台列 id 與外部列 srcKey 相同
        let mark = await markSrLog()
        let r5 = await getPermUserInforApi(X2)
        A.equal(r5.state, 'error', `命中 2 筆應拒絕, 實得: ${JSON.stringify(r5).slice(0, 200)}`)
        A.equal(r5.msg, 'ambiguousUserFromPerm')
        //srLog: 只記 mappingBy 與筆數, 不記查詢值(外審 sol 第一輪#9)
        let lines = await waitLines(mark, (l) => l.event === 'api/getPermUserInfor-error' && l.msg === 'ambiguousUserFromPerm', 'api/getPermUserInfor-error')
        let ev = lines.find((l) => l.event === 'api/getPermUserInfor-error' && l.msg === 'ambiguousUserFromPerm')
        A.equal(ev.mappingBy, 'id')
        A.equal(ev.count, 2)
        A.ok(!JSON.stringify(ev).includes(X2), 'srLog 不得記查詢值')
    })

    it('MI-015 getPermUserInfor(mappingBy 為 email／name)的 userId 維持 perm 內部 id(不變): 傳內部 id 命中、傳 srcKey 查無  [M15]', async function() {
        for (let mode of ['email', 'name']) {
            await restartBackend(genTempSettings({ mappingBy: mode }))
            let from = 'appMi-15'
            let res = await postSync('users', { from, rows: [extRow('mi15-guid', { name: 'mi15', email: 'mi15@example.com' })] })
            A.equal(res.state, 'success', `mappingBy=${mode}: ${JSON.stringify(res)}`)
            let me = (await rowsFrom(from))[0]
            let r1 = await getPermUserInforApi(me.id)
            A.equal(r1.state, 'success', `mappingBy=${mode}: ${JSON.stringify(r1).slice(0, 200)}`)
            A.equal(r1.msg.user.id, me.id, `mappingBy=${mode} 傳內部 id 命中(不變)`)
            let r2 = await getPermUserInforApi('mi15-guid')
            A.equal(r2.state, 'success')
            A.equal(r2.msg.user.id, undefined, `mappingBy=${mode} srcKey 不是 userId`)
            await cleanExternalFixtures({ kts: ['users'], froms: [from] })
        }
        await restartBackend('./settings.json')
    })

    it('MI-016 後台存檔撞值不論 isActive(perm-run05): 停用之外部列 srcKey 等於新增之後台列 id(有效或停用)→ 整次 loginIdCollision、零變更  [M16]', async function() {
        let res = await postSync('users', { from: 'appMi-16', rows: [extRow(X2, { isActive: 'n' })] })
        A.equal(res.state, 'success', JSON.stringify(res))
        let before = await snapUsers()
        for (let isActive of ['y', 'n']) {
            let ra = await addBackend([backendRow(X2, { isActive })])
            A.equal(ra.ok, false, `isActive=${isActive} 應被拒, 實得: ${JSON.stringify(ra).slice(0, 200)}`)
            A.equal(ra.msg, 'loginIdCollision')
            A.equal(await snapUsers(), before, '零變更')
        }
    })
})
