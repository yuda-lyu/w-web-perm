//使用者對應鍵(mappingBy)之外部同步檢查與登入多筆拒絕(F-14; 規則帳本 R-MAPKEY-01、R-MAPKEY-02; ADR-034)
//
//述語:
//  M1 mappingBy='email'／'name' 時, 外部同步 users 於寫入之前檢查: 每個 isActive==='y' 之列, 該欄位須為非空字串(trim 後長度>0)且在〔本批 active 列〕∪〔他 from 既有 active 列〕內唯一
//     (比對用原值精確 ===), 違規整批 invalidRows 且該 from 與他 from 全列不變; isActive!=='y' 之列不參與; 同 from 之既有列不算衝突(同批比對後被修改或刪除);
//  M2 mappingBy='id'(預設)不另檢查(見 api-syncAndReplaceTabs API-sync-027);
//  M3 getTokenUser 以對應鍵查 perm users 命中多於 1 筆 → 拒絕(ambiguousUserFromPerm), 不取首筆: 登入入口(/api/getUserByToken)與資料通道(verifyConn)兩條路徑皆拒, 0 筆行為不變, 恰 1 筆照常登入;
//  M4 (run05, R-PRINCIPLE-00 適用表 h) 後台 updateUsers 整表寫入於 mappingBy='email'／'name' 時對 active 列檢查該欄位(非空／唯一), 只擋本次造成或觸及者(MK-020／021; 歷史資料先以 mappingBy='id' 同步造成).
//
//真後端; 以 restartBackend(genTempSettings({ mappingBy })) 切換設定(DB 保留, 不 reseed), after 還原 './settings.json' 並 reseed 重建 base seed.
//測試 token(srv.mjs getUserByToken 寫死): 'sys' → id-for-admin／email admin@example.com／name admin; '{token-for-application}' 為 app 使用者(用於 sync).
//跑法: npx mocha test/api-mapKey.test.mjs --reporter list --timeout 300000

import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { startApi, TOKEN_ADMIN, TOKEN_APP, getWoItems, callRpc, urlSync, cleanExternalFixtures } from './tools/api-setup.mjs'
import { restartBackend, genTempSettings, apiBaseUrl } from './tools/e2e-setup.mjs'

//run07(F-23 外部列守門)調整說明: MK-020／021 測的是「後台 updateUsers 對歷史重複／空對應鍵只擋本次造成或觸及者」(R-MAPKEY-03), 其「歷史資料」原以外部同步(from=appMk-9／appMk-10)造出,
//  並由後台編修該些列之 name／email／isActive 與刪改——自 run07 起外部列(from 非空)之身分欄後台不得改(saveExternalRowChanged), 故歷史資料改為「後台列」(from ''; 即 F-14 之前版本由後台寫入之歷史列),
//  以 restartBackend 之 seedExtra 於後端停止期間旁路寫庫(同 api-refCascade 歷史同名列之作法; 現行任何寫入入口皆拒造出此類資料); 後台新增列之 from 一律 ''。
//  外部列版之守門(後台不得改外部列之 name／email)見 api-externalRows。
//perm-run03 調整說明(外部匯入改依來源鍵 srcKey 差異同步; server/syncCore.mjs): 夾具列改送 srcKey(不送 id; 帶 id 整批 idNotAllowed), 內部 id 由伺服端產生(不再等於外部給的值);
//  外部同步為差異同步(同 srcKey 重送＝修改/不變, 批次沒有的列＝刪除), 不再 delAll＋insert; 故各案以 srcKey 取代 id 找列(srcsOf), 「同 from 重送同 email」之舊列隨差異同步刪除。
//  本檔無案例以「經同步建立之外部使用者」之 token 登入(MK-010／011 以 base seed 之 admin 'sys' 登入, 其 email 與同步建立之使用者重複; mappingBy='id' 本輪未改〔待裁示〕, 若需外部使用者登入須改用 mappingBy email／name 或後台列),
//  故 mappingBy 登入對應之變更對本檔無影響。
const dirTmp = path.join(path.dirname(fileURLToPath(import.meta.url)), '_tmp', 'api-mapKey') //seed-extra.json, 收尾刪除
const SEED_EXTRA_IDS = ['id-mk9-a', 'id-mk9-b', 'id-mk9-c', 'id-mk9-new', 'id-mk10-a', 'id-mk10-b', 'id-mk10-c', 'id-mk10-new']


let postSync = async (keyTable, body) => {
    let url = urlSync.replace('{keyTable}', keyTable).replace('{token}', TOKEN_APP)
    let res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) })
    return await res.json()
}

let getUserByTokenApi = async (token) => {
    let res = await fetch(`${apiBaseUrl}/api/getUserByToken?token=${encodeURIComponent(token)}`)
    return await res.json()
}

//u: 外部同步之使用者列夾具; 第 1 參為外部自訂之來源鍵 srcKey(perm-run03 起外部不送 id, 內部 id 由伺服端產生)
let u = (srcKey, name, email, from, isActive = 'y', isAdmin = 'n') => ({ srcKey, order: 0, name, email, from, cgrups: '{}', isAdmin, isActive })

let srcsOf = async (from) => (await (await getWoItems()).users.select({ from })).map((v) => v.srcKey).sort()
let snapOf = async (from) => JSON.stringify((await (await getWoItems()).users.select({ from })).sort((a, b) => String(a.id).localeCompare(String(b.id))))
let snapOthers = async (from) => JSON.stringify((await (await getWoItems()).users.select()).filter((v) => v.from !== from).sort((a, b) => String(a.id).localeCompare(String(b.id))))


describe('api-mapKey (F-14: 使用者對應鍵之外部同步檢查與登入多筆拒絕)', function() {
    this.timeout(300000)

    before(async function() {
        this.timeout(300000)
        await startApi() //預設 settings.json(無 mappingBy → 'id')
    })

    after(async function() {
        this.timeout(300000)
        //本檔寫入之 from 分區經 cleanExternalFixtures 移除(外部列夾具收尾之單一入口, R-TEST-EXT-CLEAN-01; 只動本檔專屬之 appMk-* from, base seed 不動)。
        //  reseed 於 mocha 進程持有 lmdb 映射時刪不掉 ./db 而退化為 upsert(見 e2e-setup wipeDbVerified), 不會移除測試列, 故須先自行清
        let woItems = await getWoItems()
        await cleanExternalFixtures({ kts: ['users'], froms: ['appMk-dup', 'appMk-1', 'appMk-2', 'appMk-3', 'appMk-4', 'appMk-5', 'appMk-6', 'appMk-6b', 'appMk-7', 'appMk-8'] })
        //MK-020／021(run05; run07 起歷史列為後台列, from ''): 以主鍵清除旁路追加列與其後台新增列, 並刪除 seed-extra.json
        await woItems.users.delAll({ id: { $in: SEED_EXTRA_IDS } })
        fs.rmSync(dirTmp, { recursive: true, force: true })
        //還原預設設定(本檔曾切換 mappingBy)並 reseed 收尾
        await restartBackend('./settings.json', { reseed: true })
    })


    // ===== M3: 登入多筆拒絕(先於 mappingBy=email 之檢查案例: 需利用 mappingBy='id' 時允許之重複) =====

    it('MK-010 歷史重複(mappingBy=id 時同步允許)於切換為 email 後: 登入入口與資料通道皆拒 ambiguousUserFromPerm／permission denied, 不取首筆', async function() {
        //(1) 預設 mappingBy='id': 同步一筆 active 使用者, email 與 base seed admin 相同(M2: 不檢查, 成功)
        let res = await postSync('users', { from: 'appMk-dup', rows: [u('id-mk-dup', 'dup-admin', 'admin@example.com', 'appMk-dup')] })
        assert.strict.equal(res.state, 'success', `mappingBy=id 下同步應成功，實得: ${JSON.stringify(res)}`)
        let woItems = await getWoItems()
        let two = await woItems.users.select({ email: 'admin@example.com', isActive: 'y' })
        assert.strict.equal(two.length, 2, '前置: 兩筆 active 使用者同 email')
        //(2) mappingBy='id' 時 'sys' 仍可登入(以 id 查找, 唯一)
        let r0 = await getUserByTokenApi('sys')
        assert.strict.equal(r0.state, 'success', `mappingBy=id 時登入應成功，實得: ${JSON.stringify(r0)}`)

        //(3) 切換為 email, DB 保留
        await restartBackend(genTempSettings({ mappingBy: 'email' }))
        let r1 = await getUserByTokenApi('sys')
        assert.strict.equal(r1.state, 'error', `命中 2 筆應拒絕(修正前取首筆而登入成功)，實得: ${JSON.stringify(r1)}`) //M3
        assert.strict.equal(r1.msg, 'ambiguousUserFromPerm', `應回固定語系鍵 ambiguousUserFromPerm，實得: ${JSON.stringify(r1.msg)}`)
        assert.strict.ok(!JSON.stringify(r1).includes('admin@example.com'), '回應不得帶使用者之對應值(email)')
        //資料通道: verifyConn(checkToken → getAndVerifyClientUser → getTokenUser)同樣拒
        let rc = await callRpc('users.select', [], TOKEN_ADMIN)
        assert.strict.equal(rc.ok, false, `資料通道應拒絕(修正前取首筆而通過)，實得: ${JSON.stringify(rc).slice(0, 300)}`) //M3
        assert.strict.ok(/permission denied/.test(String(rc.msg)), `傳輸層回 permission denied，實得: ${rc.msg}`)
        //查詢入口 /api/getPerm 亦經 getAndVerifyClientUser → getTokenUser, 同一規則(流程_查詢使用者權限 E2E-007)
        let rp = await fetch(`${apiBaseUrl}/api/getPerm?token=sys`).then((r) => r.json())
        assert.strict.equal(rp.state, 'error', `getPerm 命中 2 筆應拒絕，實得: ${JSON.stringify(rp).slice(0, 300)}`)
        assert.strict.equal(rp.msg, 'ambiguousUserFromPerm')
    })

    it('MK-011 移除重複後(同 email 剩 1 筆)登入恢復; 0 筆行為不變(cannotGetUserFromPerm)', async function() {
        //此時 backend 為 mappingBy='email'; 以 app token 同步:同 srcKey 把 appMk-dup 之列改為另一個 email(＝修改, id 不變; M1: 該 email 唯一, 通過)
        let res = await postSync('users', { from: 'appMk-dup', rows: [u('id-mk-dup', 'dup-admin', 'dup-admin@example.com', 'appMk-dup')] })
        assert.strict.equal(res.state, 'success', `改為不同 email 應成功，實得: ${JSON.stringify(res)}`)
        assert.strict.deepEqual(res.msg, { nAdd: 0, nUpdate: 1, nDel: 0, nSame: 0 }, '同 srcKey 改 email 應為 nUpdate=1(差異同步)')
        let r1 = await getUserByTokenApi('sys')
        assert.strict.equal(r1.state, 'success', `重複移除後恰 1 筆, 登入應成功，實得: ${JSON.stringify(r1)}`)
        assert.strict.equal(r1.msg.id, 'id-for-admin')
        let rc = await callRpc('users.select', [], TOKEN_ADMIN)
        assert.strict.equal(rc.ok, true, `資料通道應通過，實得: ${JSON.stringify(rc).slice(0, 300)}`)
        let rp = await fetch(`${apiBaseUrl}/api/getPerm?token=sys`).then((r) => r.json())
        assert.strict.equal(rp.state, 'success', `getPerm 恰 1 筆應成功，實得: ${JSON.stringify(rp).slice(0, 300)}`)
        //0 筆: app 使用者(不在 perm users 表)以 client 通道登入 → cannotGetUserFromPerm(不變)
        let r0 = await getUserByTokenApi(TOKEN_APP)
        assert.strict.equal(r0.state, 'error')
        assert.strict.equal(r0.msg, 'cannotGetUserFromPerm', `0 筆須維持 cannotGetUserFromPerm，實得: ${JSON.stringify(r0.msg)}`)
    })


    // ===== M1: mappingBy='email'(backend 目前即為 email) =====

    it('MK-001 email: active 列之 email 為空／空白／缺漏／非字串 → invalidRows, 該 from 與他 from 全列不變', async function() {
        const F = 'appMk-1'
        let ok0 = await postSync('users', { from: F, rows: [u('id-mk1-old', 'old1', 'old1@appMk.com', F)] })
        assert.strict.equal(ok0.state, 'success', `預置應成功，實得: ${JSON.stringify(ok0)}`)
        let part0 = await snapOf(F)
        let others0 = await snapOthers(F)
        let good = u('id-mk1-good', 'good1', 'good1@appMk.com', F)
        for (let bad of ['', '   ', '\t', undefined, null, 5, true]) {
            let row = u('id-mk1-bad', 'bad1', bad, F)
            if (bad === undefined) {
                delete row.email
            }
            for (let rows of [[row], [good, row], [row, good]]) {
                let res = await postSync('users', { from: F, rows })
                assert.strict.equal(res.state, 'error', `email=${JSON.stringify(bad)} 應被拒，實得: ${JSON.stringify(res)}`)
                assert.strict.equal(res.msg, 'invalidRows', `email=${JSON.stringify(bad)} 應回 invalidRows，實得: ${JSON.stringify(res.msg)}`)
                assert.strict.equal(await snapOf(F), part0, `email=${JSON.stringify(bad)} 該 from 須逐位元不變`)
                assert.strict.equal(await snapOthers(F), others0, `email=${JSON.stringify(bad)} 他 from 須逐位元不變`)
            }
        }
    })

    it('MK-002 email: 同批 active 列 email 重複（精確 ===）→ invalidRows, 零變更; 僅大小寫或空白不同視為不同 → 成功', async function() {
        const F = 'appMk-2'
        let ok0 = await postSync('users', { from: F, rows: [u('id-mk2-old', 'old2', 'old2@appMk.com', F)] })
        assert.strict.equal(ok0.state, 'success')
        let part0 = await snapOf(F)
        let others0 = await snapOthers(F)
        let res = await postSync('users', { from: F, rows: [u('id-mk2-a', 'a2', 'dup2@appMk.com', F), u('id-mk2-b', 'b2', 'x2@appMk.com', F), u('id-mk2-c', 'c2', 'dup2@appMk.com', F)] })
        assert.strict.equal(res.state, 'error', `批內重複應被拒，實得: ${JSON.stringify(res)}`)
        assert.strict.equal(res.msg, 'invalidRows')
        assert.strict.equal(await snapOf(F), part0)
        assert.strict.equal(await snapOthers(F), others0)
        //精確比對: 大小寫／前後空白不同 = 不同鍵(getTokenUser 之 select 亦精確比對)
        let resOk = await postSync('users', { from: F, rows: [u('id-mk2-a', 'a2', 'Case2@appMk.com', F), u('id-mk2-b', 'b2', 'case2@appMk.com', F), u('id-mk2-c', 'c2', 'case2@appMk.com ', F)] })
        assert.strict.equal(resOk.state, 'success', `精確 === 下互不相同，應成功，實得: ${JSON.stringify(resOk)}`)
    })

    it('MK-003 email: active 列之 email 已為他 from 既有 active 列使用（含 base seed）→ invalidRows, 兩個 from 皆不變', async function() {
        const F = 'appMk-3'
        const G = 'appMk-6b' //他 from
        let rg = await postSync('users', { from: G, rows: [u('id-mk3-g', 'g3', 'g3@appMk.com', G)] })
        assert.strict.equal(rg.state, 'success')
        let rf0 = await postSync('users', { from: F, rows: [u('id-mk3-f0', 'f03', 'f03@appMk.com', F)] })
        assert.strict.equal(rf0.state, 'success')
        let partF0 = await snapOf(F)
        let partG0 = await snapOf(G)
        let others0 = await snapOthers(F)
        for (let email of ['g3@appMk.com', 'peter@example.com']) { //他 from(G)與 base seed(peter, 後台列 from ''; run07 前為 teamA)
            let res = await postSync('users', { from: F, rows: [u('id-mk3-ok', 'ok3', 'ok3@appMk.com', F), u('id-mk3-f1', 'f13', email, F)] })
            assert.strict.equal(res.state, 'error', `email=${email} 已屬他 from 應被拒，實得: ${JSON.stringify(res)}`)
            assert.strict.equal(res.msg, 'invalidRows')
            assert.strict.equal(await snapOf(F), partF0, `email=${email} 本 from 須不變`)
            assert.strict.equal(await snapOf(G), partG0, `email=${email} 他 from(G)須不變`)
            assert.strict.equal(await snapOthers(F), others0, `email=${email} 其他 from 全列須不變`)
        }
    })

    it('MK-004 email: isActive 非 y 之列不參與(email 可空、可與他 from 或本批 active 列重複); 同 from 重送同 email 成功', async function() {
        const F = 'appMk-4'
        let res = await postSync('users', { from: F, rows: [
            u('id-mk4-a', 'a4', '', F, 'n'), //inactive 且空
            u('id-mk4-b', 'b4', 'peter@example.com', F, 'n'), //inactive, 與 base seed active 重複
            u('id-mk4-c', 'c4', 'same4@appMk.com', F, 'y'),
            u('id-mk4-d', 'd4', 'same4@appMk.com', F, 'n'), //inactive, 與本批 active 重複
            { ...u('id-mk4-e', 'e4', '', F), isActive: '' }, //isActive 空字串: 非 'y'
        ] })
        assert.strict.equal(res.state, 'success', `inactive 列不參與檢查，應成功，實得: ${JSON.stringify(res)}`)
        let again = await postSync('users', { from: F, rows: [u('id-mk4-c2', 'c42', 'same4@appMk.com', F, 'y')] })
        assert.strict.equal(again.state, 'success', `同 from 重送同 email(換 srcKey＝刪舊增新; 同 from 之既有列不算衝突)應成功，實得: ${JSON.stringify(again)}`)
        assert.strict.deepEqual(again.msg, { nAdd: 1, nUpdate: 0, nDel: 5, nSame: 0 }, '新 srcKey 新增 1 筆、批次沒有的 5 筆舊列刪除')
        assert.strict.deepEqual(await srcsOf(F), ['id-mk4-c2'])
    })

    it('MK-005 email: 他 from 之 inactive 列不構成衝突(getTokenUser 只匹配 active)', async function() {
        const F = 'appMk-5'
        const G = 'appMk-6'
        let rg = await postSync('users', { from: G, rows: [u('id-mk5-g', 'g5', 'inactive5@appMk.com', G, 'n')] })
        assert.strict.equal(rg.state, 'success')
        let res = await postSync('users', { from: F, rows: [u('id-mk5-f', 'f5', 'inactive5@appMk.com', F, 'y')] })
        assert.strict.equal(res.state, 'success', `他 from 之 inactive 列不構成衝突，實得: ${JSON.stringify(res)}`)
    })


    // ===== M1: mappingBy='name' =====

    it('MK-006 name: 切換 mappingBy=name 後, active 列 name 空／批內重複／他 from 已用 → invalidRows; inactive 不參與; email 重複不再檢查', async function() {
        await restartBackend(genTempSettings({ mappingBy: 'name' }))
        const F = 'appMk-7'
        const G = 'appMk-8'
        let rg = await postSync('users', { from: G, rows: [u('id-mk7-g', 'name7g', 'g7@appMk.com', G)] })
        assert.strict.equal(rg.state, 'success', `G 預置應成功，實得: ${JSON.stringify(rg)}`)
        let rf0 = await postSync('users', { from: F, rows: [u('id-mk7-f0', 'name7f0', 'f07@appMk.com', F)] })
        assert.strict.equal(rf0.state, 'success')
        let partF0 = await snapOf(F)
        let partG0 = await snapOf(G)
        let others0 = await snapOthers(F)
        let bads = [
            [u('id-mk7-a', '', 'a7@appMk.com', F)], //空
            [u('id-mk7-a', '  ', 'a7@appMk.com', F)], //空白
            [u('id-mk7-a', 'name7', 'a7@appMk.com', F), u('id-mk7-b', 'name7', 'b7@appMk.com', F)], //批內重複
            [u('id-mk7-a', 'name7g', 'a7@appMk.com', F)], //他 from(G)已用
            [u('id-mk7-a', 'admin', 'a7@appMk.com', F)], //base seed 之 admin 已用
        ]
        for (let rows of bads) {
            let res = await postSync('users', { from: F, rows })
            assert.strict.equal(res.state, 'error', `rows=${JSON.stringify(rows.map((v) => v.name))} 應被拒，實得: ${JSON.stringify(res)}`)
            assert.strict.equal(res.msg, 'invalidRows')
            assert.strict.equal(await snapOf(F), partF0, '本 from 須不變')
            assert.strict.equal(await snapOf(G), partG0, '他 from 須不變')
            assert.strict.equal(await snapOthers(F), others0, '其他 from 全列須不變')
        }
        //name 檢查之外: email 空／重複不檢查(對應鍵是 name); inactive 不參與
        let ok = await postSync('users', { from: F, rows: [u('id-mk7-a', 'name7a', '', F), u('id-mk7-b', 'name7b', '', F), u('id-mk7-c', 'name7g', 'c7@appMk.com', F, 'n')] })
        assert.strict.equal(ok.state, 'success', `對應鍵為 name 時 email 不檢查、inactive 不參與，實得: ${JSON.stringify(ok)}`)
    })


    // ===== M4（run05 新增，待主責於全套結束後實跑〔尚未執行〕; R-PRINCIPLE-00 適用表 h、規則帳本 R-MAPKEY-03）: 後台 updateUsers 整表寫入之對應鍵檢查 =====
    //述語: mappingBy='email'／'name' 時, 後台 users 整表寫入對 isActive==='y' 之列檢查該欄位(非空／唯一, 與外部同步 F-14 同口徑), 且只擋「本次造成或觸及」者——
    //  歷史既有之空值／重複(以 mappingBy='id' 同步造成)原樣送回可存; 新增／改成空或重複、由停用改為啟用而撞值或為空者 → saveRowFieldInvalid／saveRowFieldDuplicate, DB 零變更;
    //  inactive 列不參與. unit 版(全格)見 unit-procCore-usersKey. 歷史資料先在 mappingBy='id' 下以同步造成(name 模式之同步會拒絕重複的 active name), 再切換設定(DB 保留).

    let usersSorted = async () => (await (await getWoItems()).users.select()).sort((a, b) => (a.order || 0) - (b.order || 0))
    let snapUsers = async () => JSON.stringify((await (await getWoItems()).users.select()).sort((a, b) => String(a.id).localeCompare(String(b.id))))
    let updateUsers = async (rows) => callRpc('updateUsers', [rows], TOKEN_ADMIN)
    //writeSeedExtra(run07): 旁路追加之後台歷史列(from ''; 其餘欄位承 base seed 之 peter 列, 含稽核欄位), 回傳 seed-extra.json 路徑供 restartBackend 之 seedExtra
    let writeSeedExtra = async (users) => {
        let p = (await (await getWoItems()).users.select({ id: 'id-for-peter' }))[0]
        let rows = users.map((o) => ({ ...p, from: '', cgrups: '{}', description: '', isAdmin: 'n', isActive: 'y', ...o }))
        fs.mkdirSync(dirTmp, { recursive: true })
        let fp = path.join(dirTmp, 'seed-extra.json')
        fs.writeFileSync(fp, JSON.stringify({ users: rows }), 'utf8')
        return fp
    }
    //expectReject: 送出 mut(整表複本) 應被拒且回 key, DB 零變更
    let expectReject = async (label, mut, key) => {
        let snap0 = await snapUsers()
        let r = await updateUsers(mut((await usersSorted()).map((v) => ({ ...v }))))
        assert.strict.equal(r.ok, false, `${label} 應被拒，實得: ${JSON.stringify(r)}`)
        assert.strict.equal(r.msg, key, `${label} 應回 ${key}，實得: ${r.msg}`)
        assert.strict.equal(await snapUsers(), snap0, `${label} DB 須零變更`)
    }

    it('MK-020 後台 users 整表寫入(mappingBy=name): 歷史重複 name 的 active 列原樣送回可存; 新增同名／空 name 的 active 列、啟用而撞名的停用列 → 被拒; inactive 不參與', async function() {
        //前置: 「歷史重複 name 的兩個 active 列」與「一個停用列」——run07 前以 mappingBy='id' 同步(外部列)造成(name 模式的同步會拒絕重複 active name), 現改為後台歷史列(from '')以 seedExtra 於後端停止期間旁路寫庫
        //  (外部列之 name／isActive 後台不得改, 見檔頭 run07 說明), 並直接以 mappingBy=name 之設定重啟; 新增列之 from 一律 ''
        const F = ''
        await restartBackend(genTempSettings({ mappingBy: 'name' }), { seedExtra: await writeSeedExtra([
            { id: 'id-mk9-a', order: 91, name: 'hist9', email: 'a9@appMk.com' },
            { id: 'id-mk9-b', order: 92, name: 'hist9', email: 'b9@appMk.com' },
            { id: 'id-mk9-c', order: 93, name: 'inact9', email: 'c9@appMk.com', isActive: 'n' },
        ]) })

        //(1) 歷史重複 name 原樣送回並編修無關列 → 成功(修正前: 若整表有任一列 email 空或重複即整次拒存; name 模式下本就不應被歷史資料卡住)
        let rows0 = await usersSorted()
        assert.strict.equal(rows0.filter((v) => v.name === 'hist9' && v.isActive === 'y').length, 2, '前置：兩列 active 同名')
        let r1 = await updateUsers(rows0.map((v) => (v.id === 'id-mk9-c' ? { ...v, description: 'mk20-edited' } : { ...v })))
        assert.strict.ok(r1.ok, `歷史重複 name 原樣送回應成功，實得: ${JSON.stringify(r1)}`)
        assert.strict.equal((await usersSorted()).find((v) => v.id === 'id-mk9-c').description, 'mk20-edited')

        //(2) 本次造成者仍擋: 新增第三個 active 同名／新增 active 空 name／新增 active 全空白 name／無關 active 列改成該名; 停用列改成該名而維持停用則可存(inactive 不參與)
        //perm-run03: rows[0] 可能是前案遺留之外部使用者列(order 0 排最前), 新增列須清空繼承之 srcKey(來源鍵與 from 同為身分欄, 後台不可新增帶 srcKey 之列, saveFromNotAllowed)
        let newRow = (o) => (rows) => [...rows, { ...rows[0], id: 'id-mk9-new', name: 'new9', email: 'new9@appMk.com', from: F, srcKey: '', isActive: 'y', ...o }]
        await expectReject('新增第三個同名 active 列', newRow({ name: 'hist9' }), 'saveRowFieldDuplicate')
        await expectReject('新增 active 空 name', newRow({ name: '' }), 'saveRowFieldInvalid')
        await expectReject('新增 active 全空白 name', newRow({ name: '   ' }), 'saveRowFieldInvalid')
        await expectReject('無關 active 列(admin)改成歷史重複名', (rows) => rows.map((v) => (v.id === 'id-for-admin' ? { ...v, name: 'hist9' } : v)), 'saveRowFieldDuplicate')
        let rInact = await updateUsers((await usersSorted()).map((v) => (v.id === 'id-mk9-c' ? { ...v, name: 'hist9' } : { ...v })))
        assert.strict.ok(rInact.ok, `停用列改成同名而維持停用應可存(inactive 不參與)，實得: ${JSON.stringify(rInact)}`)

        //(3) 停用列改為啟用而撞名 → 被拒; 歷史重複中一列改成唯一名稱(修復) → 成功
        await expectReject('啟用而撞名的停用列', (rows) => rows.map((v) => (v.id === 'id-mk9-c' ? { ...v, isActive: 'y' } : v)), 'saveRowFieldDuplicate')
        let rFix = await updateUsers((await usersSorted()).map((v) => (v.id === 'id-mk9-a' ? { ...v, name: 'fixed9' } : { ...v })))
        assert.strict.ok(rFix.ok, `歷史重複中一列改成唯一名稱應成功，實得: ${JSON.stringify(rFix)}`)
    })

    it('MK-021 後台 users 整表寫入(mappingBy=email): 歷史空／重複 email 原樣送回可存; 啟用而空／撞 email 的停用列、新增 active 全空白 email → 被拒; 新增空 email(任何列) → 被拒', async function() {
        //前置: 「active 空 email」「inactive 空 email」「inactive 與 base seed peter 同 email」之歷史列——run07 前以 mappingBy='id' 同步(外部列)造成, 現改為後台歷史列(from '')以 seedExtra 旁路寫庫, 再以 mappingBy=email 重啟(理由同 MK-020)
        const F = ''
        await restartBackend(genTempSettings({ mappingBy: 'email' }), { seedExtra: await writeSeedExtra([
            { id: 'id-mk10-a', order: 91, name: 'a10', email: '' },
            { id: 'id-mk10-b', order: 92, name: 'b10', email: '', isActive: 'n' },
            { id: 'id-mk10-c', order: 93, name: 'c10', email: 'peter@example.com', isActive: 'n' },
        ]) })

        //(1) 歷史空／重複 email 原樣送回並編修無關列 → 成功(對應鍵 email 時, active 空 email 亦屬歷史容忍)
        let rows0 = await usersSorted()
        let r1 = await updateUsers(rows0.map((v) => (v.id === 'id-mk10-a' ? { ...v, description: 'mk21-edited' } : { ...v })))
        assert.strict.ok(r1.ok, `歷史空／重複 email 原樣送回應成功，實得: ${JSON.stringify(r1)}`)
        assert.strict.equal((await usersSorted()).find((v) => v.id === 'id-mk10-a').description, 'mk21-edited')

        //(2) 本次造成或觸及者被拒
        let newRow = (o) => (rows) => [...rows, { ...rows[0], id: 'id-mk10-new', name: 'new10', email: 'new10@appMk.com', from: F, srcKey: '', isActive: 'y', ...o }]
        await expectReject('新增 active 列 email 空', newRow({ email: '' }), 'saveRowFieldInvalid')
        await expectReject('新增 inactive 列 email 空(email 全表檢查)', newRow({ email: '', isActive: 'n' }), 'saveRowFieldInvalid')
        await expectReject('新增 active 列 email 全空白(對應鍵以 trim 判空)', newRow({ email: '   ' }), 'saveRowFieldInvalid')
        await expectReject('新增列 email 與 base seed 相同', newRow({ email: 'peter@example.com' }), 'saveRowFieldDuplicate')
        await expectReject('啟用空 email 的停用列', (rows) => rows.map((v) => (v.id === 'id-mk10-b' ? { ...v, isActive: 'y' } : v)), 'saveRowFieldInvalid')
        await expectReject('啟用與 active 列同 email 的停用列', (rows) => rows.map((v) => (v.id === 'id-mk10-c' ? { ...v, isActive: 'y' } : v)), 'saveRowFieldDuplicate')

        //(3) inactive 新增全空白 email(email 為非空字串, inactive 不參與對應鍵檢查) → 可存
        let rOk = await updateUsers(newRow({ email: '   ', isActive: 'n' })(await usersSorted()))
        assert.strict.ok(rOk.ok, `新增 inactive 全空白 email 應可存，實得: ${JSON.stringify(rOk)}`)
    })

})
