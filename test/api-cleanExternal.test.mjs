//外部列夾具收尾之單一入口 cleanExternalFixtures(test/tools/api-setup.mjs; 規則帳本 R-TEST-EXT-CLEAN-01; run09)之行為契約, 真後端.
//
//背景(2026-10-22 全套): e2e-init E2E-006 以外部同步灌入 id-mk-dup(from=appE2eInit006), 收尾退而以系統管理者寫入移除 → 後台不得刪外部列(Lv1 saveExternalRowChanged), 夾具殘留,
//  其後 e2e-ref-cascade／e2e-rela-user-grup／e2e-targets／e2e-users 之 captureBaseSeedOnce 擷取到 5 筆而 12 案失敗。外部同步端點又拒空 rows(isearr 閘, ADR-008), 且單一 mocha 行程內
//  restartBackend({ reseed:true }) 刪不掉 ./db(api 檔使本行程持有 lmdb 映射)而退化為 upsert, 皆不能移除夾具 → 收尾只能經測試框架之直接重置, 並由單一入口提供, 各檔不再自寫。
//述語:
//  CE-001 froms 限定分區: 只移除指定 from 之外部列, 其他分區與後台列不動(跨表, 回傳各表移除筆數)
//  CE-002 不限分區＋pristine: 移除全部外部列後四表回到 base seed(主鍵集合＝種子、from 皆為空字串)
//  CE-003 不放寬產品: 系統管理者寫入無法移除外部列(回 saveExternalRowChanged、列仍在), 唯有本入口移除
//  CE-004 keepIds: 指定 id 之外部列保留
//  CE-005 pristine 回驗不放寬: 種子以外之列仍在即拋錯, 訊息含多出主鍵與其 from 分區
//  CE-006 froms 含空字串即拋錯(from 為空字串者是後台列, 不是外部列); purgeExternalRows 同
//  CE-007 無外部列時回傳全 0、資料不動
//跑法: node C:/opensrcOper/tools/quiet-run.mjs --name tapi --lock --timeout 600 -- npx mocha test/api-cleanExternal.test.mjs --timeout 300000

import assert from 'assert'
import { startApi, TOKEN_ADMIN, TOKEN_APP, callRpc, urlSync, selectAllRows, cleanExternalFixtures, purgeExternalRows } from './tools/api-setup.mjs'
import { idOfSrc } from './tools/e2eExt.mjs'
import { BASE_SEED_COUNT } from './tools/baseSeed.mjs'


//perm-run03(外部匯入改依來源鍵 srcKey 差異同步; server/syncCore.mjs): 夾具列改送 srcKey(外部不送 id, 送 id 整批 idNotAllowed), 外部列之內部 id 由伺服端產生(不再等於夾具標籤);
//  故各案以 srcKey(夾具標籤)找列(srcsOf), 需要真實 id 者(keepIds、assertPristineSeed 訊息)以 e2eExt.idOfSrc 查。cleanExternalFixtures／purgeExternalRows 依 from 與 id 直接刪外部列, 不依賴外部給 id, 行為不受協定影響。
const A = assert.strict
const F1 = 'appCe-1'
const F2 = 'appCe-2'
const KTS = ['users', 'grups', 'pemis', 'targets']

let postSync = async (kt, from, rows) => {
    let url = urlSync.replace('{keyTable}', kt).replace('{token}', TOKEN_APP)
    let res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ from, rows }) })
    let r = await res.json()
    A.equal(r.state, 'success', `夾具 ${kt}(${from}) 同步應成功, 實得 ${JSON.stringify(r)}`)
}
let mkU = (srcKey) => ({ srcKey, order: 90, name: srcKey, email: `${srcKey}@ext.example.com`, description: '', cgrups: '{}', isAdmin: 'n', isActive: 'y' })
let mkG = (srcKey) => ({ srcKey, order: 90, name: srcKey, description: '', cpemis: '{}' })
let srcsOf = async (kt, from) => (await selectAllRows(kt)).filter((r) => r.from === from).map((r) => r.srcKey).sort()
let snapAll = async () => {
    let out = {}
    for (let kt of KTS) {
        out[kt] = JSON.stringify((await selectAllRows(kt)).sort((a, b) => String(a.id).localeCompare(String(b.id))))
    }
    return out
}


describe('api-cleanExternal (外部列夾具收尾之單一入口 cleanExternalFixtures, R-TEST-EXT-CLEAN-01)', function() {
    this.timeout(120000)

    before(async function() {
        this.timeout(200000)
        await startApi()
    })

    after(async function() {
        this.timeout(60000)
        await cleanExternalFixtures({ froms: [F1, F2] }) //任一案失敗時之兜底
    })

    it('CE-001 froms 限定分區: 只移除指定 from 之外部列(跨表), 其他分區與後台列不動, 回傳各表移除筆數', async function() {
        await postSync('users', F1, [mkU('ce-u1')])
        await postSync('users', F2, [mkU('ce-u2')])
        await postSync('grups', F1, [mkG('ce-g1')])
        A.deepEqual(await srcsOf('users', F1), ['ce-u1'], '前置')
        let r = await cleanExternalFixtures({ kts: ['users', 'grups'], froms: [F1] })
        A.deepEqual(r, { users: 1, grups: 1 })
        A.deepEqual(await srcsOf('users', F1), [], 'F1 之 users 已移除')
        A.deepEqual(await srcsOf('grups', F1), [], 'F1 之 grups 已移除')
        A.deepEqual(await srcsOf('users', F2), ['ce-u2'], '他分區 F2 不動')
        A.equal((await selectAllRows('users')).filter((x) => x.from === '').length, BASE_SEED_COUNT.users, '後台列不動')
        A.deepEqual(await cleanExternalFixtures({ kts: ['users'], froms: [F2] }), { users: 1 })
        A.deepEqual(await srcsOf('users', F2), [])
    })

    it('CE-002 不限分區＋pristine: 移除全部外部列後四表回到 base seed(筆數與種子相符、from 皆為空字串)', async function() {
        await postSync('users', F1, [mkU('ce-u1')])
        await postSync('grups', F2, [mkG('ce-g2')])
        let r = await cleanExternalFixtures({ pristine: true })
        A.deepEqual(r, { users: 1, grups: 1, pemis: 0, targets: 0 })
        for (let kt of KTS) {
            let rows = await selectAllRows(kt)
            A.equal(rows.length, BASE_SEED_COUNT[kt], `${kt} 筆數＝種子`)
            A.ok(rows.every((x) => x.from === ''), `${kt} 無外部列`)
        }
    })

    it('CE-003 不放寬產品: 系統管理者寫入無法移除外部列(回 saveExternalRowChanged、列仍在); 唯有本入口移除', async function() {
        await postSync('users', F1, [mkU('ce-u1')])
        let rows = (await selectAllRows('users')).filter((x) => x.srcKey !== 'ce-u1').sort((a, b) => (a.order || 0) - (b.order || 0))
        let res = await callRpc('updateUsers', [rows], TOKEN_ADMIN)
        A.equal(res.ok, false, `系統管理者寫入應拒絕, 實得 ${JSON.stringify(res).slice(0, 200)}`)
        A.equal(res.msg, 'saveExternalRowChanged', '拒絕鍵')
        A.deepEqual(await srcsOf('users', F1), ['ce-u1'], '外部列仍在')
        A.deepEqual(await cleanExternalFixtures({ kts: ['users'], froms: [F1], pristine: true }), { users: 1 })
        A.deepEqual(await srcsOf('users', F1), [])
    })

    it('CE-004 keepIds: 指定 id 之外部列保留, 其餘移除', async function() {
        await postSync('users', F1, [mkU('ce-u1'), mkU('ce-u2')])
        let idU2 = await idOfSrc('users', 'ce-u2') //keepIds 以內部 id 計(伺服端產生, 非夾具標籤 srcKey)
        A.ok(typeof idU2 === 'string' && idU2 !== 'ce-u2', `前置: ce-u2 之內部 id 由伺服端產生, 實得 ${idU2}`)
        let r = await cleanExternalFixtures({ kts: ['users'], froms: [F1], keepIds: { users: [idU2] } })
        A.deepEqual(r, { users: 1 })
        A.deepEqual(await srcsOf('users', F1), ['ce-u2'])
        A.deepEqual(await cleanExternalFixtures({ kts: ['users'], froms: [F1] }), { users: 1 })
        A.deepEqual(await srcsOf('users', F1), [])
    })

    it('CE-005 pristine 回驗不放寬: 表內仍有種子以外之列(此處以 keepIds 保留一筆外部列模擬)即拋錯, 訊息含多出主鍵與其 from 分區(指向遺留之測試檔)', async function() {
        await postSync('users', F1, [mkU('ce-u1')])
        let idU1 = await idOfSrc('users', 'ce-u1') //assertPristineSeed 訊息之「多出主鍵」是內部 id(伺服端產生)
        A.ok(typeof idU1 === 'string' && idU1 !== 'ce-u1', `前置: ce-u1 之內部 id 由伺服端產生, 實得 ${idU1}`)
        await A.rejects(cleanExternalFixtures({ kts: ['users'], froms: [F1], keepIds: { users: [idU1] }, pristine: true }), (err) => {
            A.ok(/cleanExternalFixtures\(users\)/.test(err.message) && /不是 pristine base seed/.test(err.message), err.message)
            A.ok(err.message.includes(`多出主鍵 [${idU1}(from=${F1})]`), err.message)
            return true
        })
        A.deepEqual(await srcsOf('users', F1), ['ce-u1'], '回驗失敗不代表會多刪或少刪: 保留之列仍在')
        A.deepEqual(await cleanExternalFixtures({ kts: ['users'], froms: [F1] }), { users: 1 })
        A.equal((await selectAllRows('users')).length, BASE_SEED_COUNT.users, '清除後回到種子筆數')
    })

    it('CE-006 froms 含空字串即拋錯(from 為空字串者是後台列, 不是外部列); purgeExternalRows 同', async function() {
        let snap = await snapAll()
        await A.rejects(cleanExternalFixtures({ froms: [''] }), /不得含空字串/)
        await A.rejects(purgeExternalRows(['users'], { froms: ['appCe-1', ''] }), /不得含空字串/)
        A.deepEqual(await snapAll(), snap, '拋錯時資料不動')
    })

    it('CE-007 無外部列時回傳全 0、資料不動', async function() {
        let snap = await snapAll()
        A.deepEqual(await cleanExternalFixtures(), { users: 0, grups: 0, pemis: 0, targets: 0 })
        A.deepEqual(await cleanExternalFixtures({ kts: ['users'], froms: [F1] }), { users: 0 })
        A.deepEqual(await snapAll(), snap)
    })

})
