//syncAndReplaceTabs API 契約測試。對應 spec/流程_外部應用同步權限資料.md、跨套件規格 C:\opensrcOper\dspec\外部匯入之定義與機制.md(第 3～10 節)、規則帳本 R-IMPORT-01。
//
//端點：POST /syncAndReplaceTabs?keyTable={keyTable}&token={token}（根路徑、無 /api 前綴，WWebPerm.mjs 自訂 route）。
//以內建 fetch 直打真實 HTTP，回應 JSON 即後端 pmConvertResolve 包裝的 { state, msg } envelope（HTTP 200；
//reject → {state:'error', msg:<純字串語系鍵>}，resolve → {state:'success', msg:{ nAdd, nUpdate, nDel, nSame }}）。
//本 API **會寫 DB**。
//
//【perm-run03 範圍二：外部匯入改依來源鍵 srcKey 差異同步】(server/syncCore.mjs；使用者 2026-10-22 裁示原則 11、2026-10-23 裁示不提供呼叫端相容)
//  本文 { from, rows }：每列必帶 srcKey(非空字串、同批唯一、UTF-8 ≤ 1978 位元組、不含標記)，**不得帶 id**(內部主鍵由本系統產生，targets 例外：id＝srcKey)；
//  於表鎖內依 srcKey 比對庫內該 from 之列：新增(配新 id)／修改(保留 id)／刪除(庫有批次無；引用連帶清理)／不變(零寫入)，回 { nAdd, nUpdate, nDel, nSame }；
//  後台列(from '')與他 from 之列永不被觸及；不同 from 之 srcKey 命名空間各自獨立(targets 例外：id 即標的名稱，與他 from／後台列撞名 → invalidRows)；
//  名稱／對應鍵撞他 from 或後台列 → 整批 invalidRows、雙方不變。原『整批取代(delAll＋insert)』『外部送 id 沿用』『未帶 id 依名稱對應』『跨 from 同 id 拒收(grups／pemis／users)』皆已不存在，
//  對應規則改寫為本檔下列各案(逐案理由見 tmp/perm-run03/agent-C-report.md)。
//
//【測試隔離策略】每個 case 用**自己獨立的 from（'appTest-N'）**，不撞 base seed 的 ''（四表全部為後台列）、也互不干擾。
//每次 mocha run 由 startApi→seedDb 重建 base seed、run 結束 mocha root after 殺 backend，故跨 run 亦 hermetic。
//DB 斷言一律 getWoItems() 後 select（絕不在測試進程寫外部列：寫一律走 backend HTTP）。
//  唯一例外：API-sync-035／036／037 的『遷移前資料』——舊式外部列(無 srcKey)無任何現行寫入入口可造，以 getWoItems().save 直接寫入(測試框架之夾具，同 api-mapKey 之 seedExtra 歷史列，非產品旁路)。
//
//reject 的 msg 為 procLang 語系鍵（皆純字串，非 Error；handler core() 各檢查以 Promise.reject 短路）：
//  syncAndReplaceTabs handler 缺 token / 缺 keyTable（query 取不到）                 → 'tokenNoPermission'
//  syncAndReplaceTabs handler keyTable 不在白名單 ['targets','pemis','grups','users'] → 'invalidKeyTable'
//  getAndVerifyAppUser         token 非空但無效（getUserByToken 回 {} → !iseobj）    → 'cannotFindUserFromToken'
//  parsePayload                payload 非物件                                        → 'invalidPayload'
//  parsePayload                payload.from 非有效字串                               → 'invalidFromInPayload'
//  parsePayload                payload.rows 非「非空陣列」（wsemi isearr：[]、[{}] 皆非）→ 'invalidRowsInPayload'
//  syncCore                    任一列帶 id 鍵（含空值）                              → 'idNotAllowed'（先於 srcKey 檢查）
//  syncCore                    srcKey 缺／空白／非字串／過長／含標記                 → 'srcKeyInvalid'
//  syncCore                    同批 srcKey 重複                                      → 'srcKeyDuplicate'
//  syncCore                    庫內同 from 無法依 srcKey 唯一配對(資料異常)          → 'srcKeyConflict'
//  syncCore                    其餘整批驗證(非物件列、name 無效／重複、撞他 from、非純量欄位、targets id 被占) → 'invalidRows'；欄位含標記 → 'htmlMarkupNotAllowed'
//  註：空批次在 HTTP 路徑被 parsePayload 先攔下(回 invalidRowsInPayload)；syncCore 內之 invalidRows 空批次檢查為同判準之縱深防禦，由 HTTP 不可達(見報告)。

import assert from 'assert'
import { startApi, urlSync, TOKEN_APP, TOKEN_BAD, SEED, getWoItems, cleanExternalFixtures } from './tools/api-setup.mjs'
import provideTabs from '../server/provideTabs.mjs'
import procLang from '../server/procLang.mjs'


const KTS = ['users', 'grups', 'pemis', 'targets']
const UUID_RE = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/ //新增列之內部 id＝wsemi genIDSeq(uuid v7)
const ON = { mode: 'OR', isActive: 'y' }


//postSync：以 node 內建 fetch 直打該 keyTable + token（本套件 2026-09-07 起不再依賴 axios），回 {state, msg} envelope。
//body 為物件時 JSON 化；字串則原樣送出（供 text/plain 非物件 payload 案例）。
let postSync = async (keyTable, token, body, contentType = 'application/json; charset=utf-8') => {
    let url = urlSync.replace('{keyTable}', keyTable).replace('{token}', token)
    let res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': contentType },
        body: (typeof body === 'string') ? body : JSON.stringify(body),
    })
    return await res.json()
}

let sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let byId = (a, b) => String(a.id).localeCompare(String(b.id))

//DB 唯讀取列(getWoItems 直接 select；srcKey 為外部列之身分欄，後台列恆空)
let dbRows = async (kt, from) => (await getWoItems())[kt].select({ from })
let srcsOf = async (kt, from) => (await dbRows(kt, from)).map((v) => v.srcKey).sort()
let bySrc = async (kt, from) => Object.fromEntries((await dbRows(kt, from)).map((v) => [v.srcKey, v]))
let snapOf = async (kt, F) => JSON.stringify((await dbRows(kt, F)).sort(byId))
let snapOthers = async (kt, F) => JSON.stringify((await (await getWoItems())[kt].select()).filter((v) => v.from !== F).sort(byId))
//snapAll：四表全列快照(含稽核欄位與時間)；拒收案例前後須逐位元相同＝零寫入
let snapAll = async () => {
    let w = await getWoItems()
    let o = {}
    for (let kt of KTS) {
        o[kt] = (await w[kt].select()).sort(byId)
    }
    return JSON.stringify(o)
}

//okSync：送出並要求成功，回計數物件 { nAdd, nUpdate, nDel, nSame }
let okSync = async (kt, from, rows, label = '') => {
    let res = await postSync(kt, TOKEN_APP, { from, rows })
    assert.strict.equal(res.state, 'success', `${label} ${kt}(${from}) 應成功，實得: ${JSON.stringify(res).slice(0, 400)}`)
    return res.msg
}
let cnt = (nAdd, nUpdate, nDel, nSame) => ({ nAdd, nUpdate, nDel, nSame })

//expectReject：整批被拒且回固定語系鍵、四表零寫入(逐位元不變)
let expectReject = async (kt, body, key, label) => {
    let s0 = await snapAll()
    let res = await postSync(kt, TOKEN_APP, body)
    assert.strict.equal(res.state, 'error', `${label} 應被拒，實得: ${JSON.stringify(res).slice(0, 300)}`)
    assert.strict.equal(res.msg, key, `${label} 應回語系鍵 ${key}，實得: ${JSON.stringify(res.msg).slice(0, 200)}`)
    assert.strict.equal(await snapAll(), s0, `${label} 四表須逐位元不變(零寫入)`)
}

//列夾具(外部給之列：只帶 srcKey 與外部擁有欄位，不帶 id／from)；srcKey 為外部自訂鍵，內部 id 由伺服端產生
const MK = {
    users: (s, o = {}) => ({ srcKey: s, order: 0, name: `n-${s}`, email: `${s}@appTest.com`, cgrups: '{}', isAdmin: 'n', isActive: 'y', ...o }),
    grups: (s, o = {}) => ({ srcKey: s, order: 0, name: `n-${s}`, description: s, cpemis: '{}', ...o }),
    pemis: (s, o = {}) => ({ srcKey: s, order: 0, name: `n-${s}`, description: s, crules: '{}', ...o }),
    targets: (s, o = {}) => ({ srcKey: s, order: 0, description: s, ...o }),
}
//ov：以標籤 tag 產生「各表互異」之外部擁有欄位覆寫(users: name＋email；grups／pemis: name；targets: description)
let ov = (kt, tag) => {
    if (kt === 'users') {
        return { name: tag, email: `${tag}@appTest.com` }
    }
    return kt === 'targets' ? { description: tag } : { name: tag }
}
//withKey：複製列並設定／刪除(v 為 undefined)某鍵
let withKey = (row, key, v) => {
    let o = { ...row }
    if (v === undefined) {
        delete o[key]
    }
    else {
        o[key] = v
    }
    return o
}

//舊式外部列(遷移前資料；無 srcKey)：欄位承 schema 全欄(稽核欄位給定值)，供 API-sync-035～037 以 getWoItems().save 直接寫入
let legacyRow = (kt, id, from, o = {}) => {
    let t = '2026-01-01 00:00:00'
    let base = { id, order: 0, description: 'legacy', from, userId: 'id-for-application', timeCreate: t, userIdUpdate: 'id-for-application', timeUpdate: t }
    let r = {
        users: { ...base, name: `leg-${id}`, email: `${id}@legacy.example.com`, cgrups: '{}', isAdmin: 'n', isActive: 'y' },
        grups: { ...base, name: `leg-${id}`, cpemis: '{}' },
        pemis: { ...base, name: `leg-${id}`, crules: '{}' },
        targets: { ...base },
    }[kt]
    return { ...r, ...o }
}
let putRows = async (kt, rows) => {
    let rs = await (await getWoItems())[kt].save(rows)
    assert.strict.ok(Array.isArray(rs) && !rs.some((v) => v && v.ok === 0), `${kt} 直接寫入夾具列應成功，實得: ${JSON.stringify(rs).slice(0, 300)}`)
}


describe('api-syncAndReplaceTabs', function() {
    this.timeout(120000)

    before(async function() {
        this.timeout(200000)
        await startApi()
    })

    //本檔 per-case 清理：各案寫入 DB 後，backend 被 reuse（已啟動）時不重 seed，appTest-N 列會殘留 → 污染同進程其他唯讀斷言（如 api-getPerm T28 以 targets 總數斷言）。
    //  外部同步端點拒絕空 rows（isearr 安全閘），故經 cleanExternalFixtures（外部列夾具收尾之單一入口，R-TEST-EXT-CLEAN-01，底層為測試框架之直接重置）刪除本檔用到的每個 appTest-N 分區列。
    //  僅刪本檔特化之 appTest from，base seed（from=''，四表全為後台列）不動。
    after(async function() {
        this.timeout(60000)
        let froms = Array.from({ length: 40 }, (_, i) => `appTest-${i + 1}`)
        froms.push('appTest-11b', 'appTest-17b', 'appTest-24b', 'appTest-27b', 'appTest-33h', 'appTest-34h', 'appTest-35h', 'appTest-37h', 'appTest-38b')
        await cleanExternalFixtures({ froms })
    })

    //對應 spec I1(同批重送零寫入)、I2(新增)、I3(少一列刪除)、I4(外部擁有欄位改變＝修改且 id 不變)、I10(後台列不被觸及)：
    //  users 全流程——首次匯入全新增(配 uuid id、補稽核欄位)、重送 nSame、改／刪／增各一；後台列(from '')逐位元不變。
    it('API-sync-001-success-diff-users', async function() {
        const F = 'appTest-1'
        let bo0 = await snapOf('users', '')

        //(1) 首次匯入: 兩筆全新增
        let rows1 = [MK.users('sk1-u1', { order: 0, name: 'appUser1', email: 'appuser1@appTest.com' }), MK.users('sk1-u2', { order: 1, name: 'appUser2', email: 'appuser2@appTest.com' })]
        assert.strict.deepEqual(await okSync('users', F, rows1, '首次'), cnt(2, 0, 0, 0), '首次匯入應為 nAdd=2')
        let rs1 = await dbRows('users', F)
        assert.strict.deepEqual(rs1.map((v) => v.srcKey).sort(), ['sk1-u1', 'sk1-u2'], '分區 srcKey 應為批次兩筆')
        for (let v of rs1) {
            assert.strict.ok(UUID_RE.test(v.id), `新增列之 id 應由伺服端產生(uuid 形式)，實得 ${v.id}`) //規格第 5 節 6：新增＝本系統配 id
            assert.strict.notEqual(v.id, v.srcKey, 'id 不得等於外部給的 srcKey(users)')
            assert.strict.equal(v.from, F, 'from 以本文為準')
            //稽核欄位由後端自動補入：userId=app 使用者 id、timeCreate 非空
            assert.strict.equal(v.userId, 'id-for-application', 'userId 應補為 app token 對應使用者 id')
            assert.strict.ok(typeof v.timeCreate === 'string' && v.timeCreate.length > 0, 'timeCreate 應由後端自動補為非空字串')
        }
        let id1 = (await bySrc('users', F))['sk1-u1'].id
        let tc1 = (await bySrc('users', F))['sk1-u1'].timeCreate

        //(2) 同一批重送(I1): nSame=全數、零寫入(分區全列含稽核時間逐位元不變)、id 不變
        let snap1 = await snapOf('users', F)
        assert.strict.deepEqual(await okSync('users', F, rows1, '重送'), cnt(0, 0, 0, 2), '重送應全為 nSame')
        assert.strict.equal(await snapOf('users', F), snap1, '重送後分區全列須逐位元不變(零寫入、id 不變)')

        //(3) 改一、刪一、增一: u1 改名(同 srcKey＝修改，id 與建立者／建立時間保留)、u2 不在批次(刪除)、u3 新增
        await sleep(20)
        let rows3 = [MK.users('sk1-u1', { order: 0, name: 'appUser1-renamed', email: 'appuser1@appTest.com' }), MK.users('sk1-u3', { order: 2, name: 'appUser3', email: 'appuser3@appTest.com' })]
        assert.strict.deepEqual(await okSync('users', F, rows3, '差異'), cnt(1, 1, 1, 0), '應為 nAdd=1／nUpdate=1／nDel=1')
        let m3 = await bySrc('users', F)
        assert.strict.deepEqual(Object.keys(m3).sort(), ['sk1-u1', 'sk1-u3'], 'u2 已刪除、u3 已新增')
        assert.strict.equal(m3['sk1-u1'].id, id1, 'I4: 修改保留 id')
        assert.strict.equal(m3['sk1-u1'].name, 'appUser1-renamed', '外部擁有欄位以批次為準')
        assert.strict.equal(m3['sk1-u1'].timeCreate, tc1, '修改不改建立時間')
        assert.strict.equal(m3['sk1-u1'].userIdUpdate, 'id-for-application', '更新者記為 app 使用者')
        assert.strict.ok(typeof m3['sk1-u1'].timeUpdate === 'string' && m3['sk1-u1'].timeUpdate !== rs1.find((v) => v.srcKey === 'sk1-u1').timeUpdate, '修改應更新 timeUpdate')
        assert.strict.ok(UUID_RE.test(m3['sk1-u3'].id) && m3['sk1-u3'].id !== id1, 'u3 配新 id')

        //(4) I10: 後台列(from '')全列逐位元不變，不受 appTest 同步影響
        assert.strict.equal(await snapOf('users', ''), bo0, '後台列(from \'\'：admin/peter/mary/john)須逐位元不變')
        assert.strict.deepEqual((await dbRows('users', '')).map((v) => v.id).sort(), ['id-for-admin', 'id-for-john', 'id-for-mary', 'id-for-peter'])
    })

    //對應 spec I8(空批次拒收)：HTTP 路徑上由 parsePayload 的 isearr 先攔下，回 invalidRowsInPayload(syncCore 之 invalidRows 空批次檢查為縱深防禦、HTTP 不可達)。
    //  空批次拒收為「防外部應用誤送空陣列而整批清空資料」之安全閘；即使分區非空，空批次仍被拒、不清空(清空某來源須另以明確操作)。
    it('API-sync-002-empty-rows-rejected', async function() {
        const F = 'appTest-2'

        //先推兩筆 grups（建立非空狀態，驗證「即使分區非空，空批次仍被拒、不會清空」）
        assert.strict.deepEqual(await okSync('grups', F, [MK.grups('sk2-g1', { order: 0, name: 'appGrup1' }), MK.grups('sk2-g2', { order: 1, name: 'appGrup2' })], '預置'), cnt(2, 0, 0, 0))
        let s0 = await snapAll()

        for (let [label, body] of [['rows:[]', { from: F, rows: [] }], ['rows:[{}]', { from: F, rows: [{}] }], ['缺 rows', { from: F }], ['rows:null', { from: F, rows: null }]]) {
            let res = await postSync('grups', TOKEN_APP, body)
            assert.strict.equal(res.state, 'error', `${label} 應被拒（state='error'），實得: ${JSON.stringify(res)}`)
            assert.strict.equal(res.msg, 'invalidRowsInPayload', `${label} msg 應為 err key 'invalidRowsInPayload'，實得: ${res.msg}`)
            assert.strict.equal(await snapAll(), s0, `${label} 被拒後四表須逐位元不變(先前兩筆 grups 仍在)`)
        }

        assert.strict.equal((await dbRows('grups', F)).length, 2, '空批次被拒，分區未被清空，仍為先前 2 筆')
        assert.strict.equal((await dbRows('grups', '')).length, SEED.grupCount, `base seed grups（from=''）應仍為 ${SEED.grupCount} 筆`)
    })

    //對應 spec I14：無效 token 於 token 守門階段被拒（getAndVerifyAppUser），不進入同步、不寫 DB。
    it('API-sync-003-bad-token-reject-no-write', async function() {
        const F = 'appTest-3'
        let s0 = await snapAll()

        let res = await postSync('users', TOKEN_BAD, { from: F, rows: [MK.users('sk3-bad', { name: 'badTokenUser', email: 'bad@appTest.com' })] })
        assert.strict.equal(res.state, 'error', `無效 token 應回 state='error'，實得: ${JSON.stringify(res)}`)
        //TOKEN_BAD（非空但無效）→ getUserByToken 回 {} → !iseobj → getAndVerifyAppUser reject err key
        assert.strict.equal(res.msg, 'cannotFindUserFromToken', `reject msg 應為 err key 'cannotFindUserFromToken'，實得: ${res.msg}`)

        //被拒未寫入 —— 該 from 分區為空，四表逐位元不變
        assert.strict.deepEqual(await dbRows('users', F), [], 'token 被拒後分區應無任何寫入（空陣列）')
        assert.strict.equal(await snapAll(), s0, 'token 被拒後四表須逐位元不變')
    })

    //對應 spec I14：keyTable 不在白名單 → 拒絕，四個資料表皆無變動。
    it('API-sync-004-invalid-keyTable-reject', async function() {
        const F = 'appTest-4'
        let s0 = await snapAll()

        let res = await postSync('foobar', TOKEN_APP, { from: F, rows: [{ srcKey: 'sk4-x', order: 0, from: F }] })
        assert.strict.equal(res.state, 'error', `非白名單 keyTable 應回 state='error'，實得: ${JSON.stringify(res)}`)
        //WWebPerm.mjs invalidKeyTable（keyTable 細節改記 srLog）
        assert.strict.ok(String(res.msg).includes('invalidKeyTable'), `reject msg 應為 err key 'invalidKeyTable'，實得: ${res.msg}`)

        //四個合法表的該 from 分區皆無變動（保持空）
        for (let kt of KTS) {
            assert.strict.deepEqual(await dbRows(kt, F), [], `${kt} 的 ${F} 分區應無變動（空陣列）`)
        }
        assert.strict.equal(await snapAll(), s0, '四表須逐位元不變')
    })

    //對應 spec 第 5 節 1(解析)：payload 解析階段（parsePayload）三類無效輸入皆拒絕，且不寫 DB。
    it('API-sync-005-invalid-payload-reject', async function() {
        const F = 'appTest-5'
        let s0 = await snapAll()

        //(a) 缺 from → err key invalidFromInPayload
        let resA = await postSync('users', TOKEN_APP, { rows: [{ srcKey: 'sk5-x', order: 0, name: 'x', email: 'x@x.com' }] })
        assert.strict.equal(resA.state, 'error', `缺 from 應回 state='error'，實得: ${JSON.stringify(resA)}`)
        assert.strict.ok(String(resA.msg).includes('invalidFromInPayload'), `reject msg 應為 err key 'invalidFromInPayload'，實得: ${resA.msg}`)

        //(b) rows 非陣列 → err key invalidRowsInPayload
        let resB = await postSync('users', TOKEN_APP, { from: F, rows: 'x' })
        assert.strict.equal(resB.state, 'error', `rows 非陣列應回 state='error'，實得: ${JSON.stringify(resB)}`)
        assert.strict.ok(String(resB.msg).includes('invalidRowsInPayload'), `reject msg 應為 err key 'invalidRowsInPayload'，實得: ${resB.msg}`)

        //(c) payload 完全非物件（text/plain body 'x'）→ err key invalidPayload
        let resC = await postSync('users', TOKEN_APP, 'x', 'text/plain; charset=utf-8')
        assert.strict.equal(resC.state, 'error', `非物件 payload 應回 state='error'，實得: ${JSON.stringify(resC)}`)
        assert.strict.ok(String(resC.msg).includes('invalidPayload'), `reject msg 應為 err key 'invalidPayload'，實得: ${resC.msg}`)

        //三類無效 payload 皆未寫 DB —— 該 from 分區為空，四表逐位元不變
        assert.strict.deepEqual(await dbRows('users', F), [], '無效 payload 皆不應寫入分區（空陣列）')
        assert.strict.equal(await snapAll(), s0, '四表須逐位元不變')
    })

    //對應 spec I1／I2／I3／I4(targets)：targets 之 id 即標的名稱(路徑字串)，外部匯入時 id＝srcKey；差異同步，後台標的不受影響。
    it('API-sync-006-success-diff-targets', async function() {
        const F = 'appTest-6'

        let newRows = [
            { srcKey: '專案X/頁1/區塊A', order: 0, description: '區塊A說明' },
            { srcKey: '專案X/頁1/區塊A/執行按鈕', order: 1, description: '執行按鈕說明' },
            { srcKey: '專案X/頁2/區塊B', order: 2, description: '區塊B說明' },
        ]
        assert.strict.deepEqual(await okSync('targets', F, newRows, '首次'), cnt(3, 0, 0, 0), 'targets 首次匯入應為 nAdd=3')

        //DB 核對：該 from 分區等於推送 rows，id＝srcKey(路徑字串原樣)
        let rowsApp = await dbRows('targets', F)
        assert.strict.deepEqual(rowsApp.map((v) => v.id).sort(), newRows.map((v) => v.srcKey).sort(), 'targets 的 id 應為 srcKey(路徑字串)')
        assert.strict.ok(rowsApp.every((v) => v.srcKey === v.id && v.from === F), 'targets 之 srcKey＝id、from 為本文 from')

        //base seed targets（from=''）不受影響
        assert.strict.equal((await dbRows('targets', '')).length, SEED.targetCount, `base seed targets（from=''）應仍為 ${SEED.targetCount} 筆`)

        //重送＝全 nSame、零寫入
        let snap = await snapOf('targets', F)
        assert.strict.deepEqual(await okSync('targets', F, newRows, '重送'), cnt(0, 0, 0, 3))
        assert.strict.equal(await snapOf('targets', F), snap, '重送後分區須逐位元不變')

        //差異: 第 1 筆改說明(修改)、第 3 筆不在批次(刪除)、新增第 4 筆、第 2 筆不變
        let rows2 = [
            { ...newRows[0], description: '區塊A說明-改' },
            newRows[1],
            { srcKey: '專案X/頁3/區塊C', order: 3, description: '區塊C說明' },
        ]
        assert.strict.deepEqual(await okSync('targets', F, rows2, '差異'), cnt(1, 1, 1, 1))
        let m = await bySrc('targets', F)
        assert.strict.deepEqual(Object.keys(m).sort(), ['專案X/頁1/區塊A', '專案X/頁1/區塊A/執行按鈕', '專案X/頁3/區塊C'])
        assert.strict.equal(m['專案X/頁1/區塊A'].description, '區塊A說明-改')
    })


    // ============ 寫入前驗證（ADR-026，規則帳本 R-ORM-01／R-ORM-02；spec 流程_外部應用同步權限資料 E2E-007～009）============
    //srcKey 含 HTML 標記／過長 → srcKeyInvalid(原『主鍵含標記／過長』之等價: targets 之 id 即 srcKey，其餘表 srcKey 同口徑)；非身分欄位含標記 → htmlMarkupNotAllowed；皆整批拒收、零寫入。

    it('API-sync-007-markup-srcKey-rejected-rows-kept：srcKey 含 HTML 標記 → srcKeyInvalid，該 from 既有列與四表皆不變', async function() {
        const F = 'appTest-7'
        for (let kt of KTS) {
            let rows0 = [MK[kt]('sk7-a', ov(kt, 'n7a')), MK[kt]('sk7-b', ov(kt, 'n7b'))]
            assert.strict.deepEqual(await okSync(kt, F, rows0, '預置'), cnt(2, 0, 0, 0))
            let good = MK[kt]('sk7-c', ov(kt, 'n7c'))
            for (let bad of ['sk7-a<c', 'sk7-<script>x</script>']) {
                await expectReject(kt, { from: F, rows: [good, MK[kt](bad, ov(kt, 'n7d'))] }, 'srcKeyInvalid', `${kt} srcKey=${bad}`)
                assert.strict.deepEqual(await srcsOf(kt, F), ['sk7-a', 'sk7-b'], `${kt} 該 from 之既有列須不變`)
            }
        }
    })

    it('API-sync-008-markup-field-rejected-rows-kept：非身分欄位含 HTML 標記 → htmlMarkupNotAllowed，不靜默改寫、既有列不變', async function() {
        const F = 'appTest-8'
        let rows0 = [MK.grups('sk8-g1', { name: 'app8Grup1', description: 'g1' })]
        assert.strict.deepEqual(await okSync('grups', F, rows0, '預置'), cnt(1, 0, 0, 0))

        await expectReject('grups', { from: F, rows: [MK.grups('sk8-g2', { name: 'app8Grup2', description: 'x<y' })] }, 'htmlMarkupNotAllowed', '含標記之欄位(修正前存為 x&lt;y)')
        let rs = await dbRows('grups', F)
        assert.strict.deepEqual(rs.map((v) => [v.srcKey, v.description]), [['sk8-g1', 'g1']], '該 from 之既有列須不變')
    })

    it('API-sync-009-long-srcKey-rejected-rows-kept：srcKey UTF-8 超過 1978 位元組 → srcKeyInvalid，該 from 既有列不變', async function() {
        const F = 'appTest-9'
        let longKey = 'U' + 'x'.repeat(1978) //1979 B
        assert.strict.equal(Buffer.byteLength(longKey, 'utf8'), 1979, '前提: 1979 位元組(上限 1978)')
        for (let kt of ['users', 'grups', 'targets']) {
            assert.strict.deepEqual(await okSync(kt, F, [MK[kt]('sk9-a', ov(kt, 'n9a'))], '預置'), cnt(1, 0, 0, 0))
            await expectReject(kt, { from: F, rows: [MK[kt](longKey, ov(kt, 'n9b'))] }, 'srcKeyInvalid', `${kt} 過長 srcKey`)
            assert.strict.deepEqual(await srcsOf(kt, F), ['sk9-a'], `${kt} 該 from 之既有列須不變`)
        }
    })


    // ============ 數字 srcKey 與跨來源同鍵（原 R-ORM-04、R-SYNC-01 之等價；2026-10-14 run05 → perm-run03 改寫）============
    //srcKey 須為字串(數字非法)；不同 from 之 srcKey 命名空間各自獨立(grups／pemis／users 同 srcKey 並存、互不影響)；targets 之 id 即標的名稱，被他 from 或後台列占用 → invalidRows。

    it('API-sync-010-numeric-srcKey：數字 srcKey 被拒(srcKeyInvalid)；字串形式之數字 srcKey 可用、重送為 nSame 且 id 不變', async function() {
        const F = 'appTest-10'
        await expectReject('users', { from: F, rows: [MK.users(1010, { name: 'app10User0', email: 'app10user0@appTest.com' })] }, 'srcKeyInvalid', '數字 srcKey')

        let row = MK.users('1010', { name: 'app10User1', email: 'app10user1@appTest.com' })
        assert.strict.deepEqual(await okSync('users', F, [row], '字串數字'), cnt(1, 0, 0, 0))
        let rs = await dbRows('users', F)
        assert.strict.equal(rs.length, 1)
        assert.strict.equal(rs[0].srcKey, '1010', '庫內 srcKey 為字串')
        assert.strict.ok(UUID_RE.test(rs[0].id), 'id 由伺服端產生，不等於外部給的數字字串')
        let snap = await snapOf('users', F)
        assert.strict.deepEqual(await okSync('users', F, [row], '重送'), cnt(0, 0, 0, 1))
        assert.strict.equal(await snapOf('users', F), snap, '重送不增列、全列不變')
    })

    it('API-sync-011-srcKey-namespace-per-from：grups／pemis 不同 from 之同一 srcKey 各自獨立(皆成功、各配 id、互不影響); users 於 mappingBy=id 時 srcKey 須跨來源唯一(perm-run05: 他來源同 srcKey 整批 loginIdCollision、零寫入)', async function() {
        const F = 'appTest-11'
        const G = 'appTest-11b'
        //perm-run05(R-MAPKEY-05, 主控 2026-10-24 裁示①): users 之登入識別值(外部列為 srcKey)須跨全表唯一、不論 isActive; 預設 mappingBy=id 下他來源同 srcKey 不再各自獨立
        assert.strict.deepEqual(await okSync('users', F, [MK.users('sk11-shared', ov('users', 'n11F-users'))], 'F users'), cnt(1, 0, 0, 0))
        let snapU = await snapOf('users', F)
        await expectReject('users', { from: G, rows: [MK.users('sk11-shared', ov('users', 'n11G-users'))] }, 'loginIdCollision', 'users 他 from 同 srcKey')
        assert.strict.equal((await dbRows('users', G)).length, 0, '被拒時他 from 無任何列')
        assert.strict.equal(await snapOf('users', F), snapU, '被拒時 F 逐位元不變')
        for (let kt of ['grups', 'pemis']) {
            assert.strict.deepEqual(await okSync(kt, F, [MK[kt]('sk11-shared', ov(kt, `n11F-${kt}`))], 'F'), cnt(1, 0, 0, 0))
            //他 from 同 srcKey：不再被拒(修正前『主鍵已屬其他 from → invalidRows』僅 targets 仍成立，見下案)
            assert.strict.deepEqual(await okSync(kt, G, [MK[kt]('sk11-shared', ov(kt, `n11G-${kt}`))], 'G'), cnt(1, 0, 0, 0))
            let f = (await bySrc(kt, F))['sk11-shared']
            let g = (await bySrc(kt, G))['sk11-shared']
            assert.strict.ok(UUID_RE.test(f.id) && UUID_RE.test(g.id) && f.id !== g.id, `${kt} 兩 from 之同 srcKey 各配不同 id`)

            //修改 F 不影響 G; 刪 F 之該列(批次改送別的 srcKey)亦不影響 G
            let snapG = await snapOf(kt, G)
            assert.strict.deepEqual(await okSync(kt, F, [MK[kt]('sk11-shared', ov(kt, `n11F2-${kt}`))], 'F 修改'), cnt(0, 1, 0, 0))
            assert.strict.equal((await bySrc(kt, F))['sk11-shared'].id, f.id, `${kt} F 之 id 不變`)
            assert.strict.equal(await snapOf(kt, G), snapG, `${kt} 修改 F 後 G 須逐位元不變`)
            assert.strict.deepEqual(await okSync(kt, F, [MK[kt]('sk11-other', ov(kt, `n11F3-${kt}`))], 'F 刪舊增新'), cnt(1, 0, 1, 0))
            assert.strict.equal(await snapOf(kt, G), snapG, `${kt} F 刪除其同 srcKey 之列後 G 須逐位元不變`)
        }
    })

    it('API-sync-011b-targets-id-taken-rejected：targets 之 id 即 srcKey，已被他 from 或後台標的占用 → invalidRows，雙方不變', async function() {
        const F = 'appTest-11'
        const G = 'appTest-11b'
        assert.strict.deepEqual(await okSync('targets', F, [MK.targets('專案11/頁1/區塊A')], 'F'), cnt(1, 0, 0, 0))

        //他 from 已使用此標的名稱(夾在合法列之間，整批拒收)
        await expectReject('targets', { from: G, rows: [MK.targets('專案11/頁1/區塊B'), MK.targets('專案11/頁1/區塊A')] }, 'invalidRows', 'targets 撞他 from')
        //後台標的(base seed)已使用
        let baseId = (await dbRows('targets', ''))[0].id
        await expectReject('targets', { from: G, rows: [MK.targets(baseId)] }, 'invalidRows', 'targets 撞後台標的')
        assert.strict.deepEqual(await srcsOf('targets', G), [], 'G 未寫入任何列')
        assert.strict.deepEqual(await srcsOf('targets', F), ['專案11/頁1/區塊A'], 'F 不變')
    })


    // ============ R-OBJ-ITER-01：列物件含數字 length 欄位（2026-10-20，建議書 建議w-web-perm修正.md §1；規則帳本「迭代使用端傳入之物件」）============
    //修正前實測（HEAD 434c0d4，真後端）：含 length 欄位之列已被拒——syncAndReplaceTabs 於 validateRowsBeforeWrite 之前以 ltdtmapping 依 schema 欄位重建列（四表 schema 皆無 length 欄），
    //length 到不了 validateRows；本案為整合面迴歸（函數本身之縱深防禦見 unit-validateRows VR-OI-*）。

    it('API-sync-012-row-with-length-field-markup-rejected-rows-kept：列帶 length 欄位（0、1、2**32-1）且欄位含標記 → htmlMarkupNotAllowed，該 from 既有列不變', async function() {
        const F = 'appTest-12'
        let rows0 = [MK.targets('專案Z/頁1/區塊A')]
        assert.strict.deepEqual(await okSync('targets', F, rows0, '預置'), cnt(1, 0, 0, 0))

        for (let n of [0, 1, 2 ** 32 - 1]) {
            await expectReject('targets', { from: F, rows: [{ srcKey: '專案Z/頁1/區塊B', order: 0, length: n, description: '<script>x</script>' }] }, 'htmlMarkupNotAllowed', `length:${n} 含標記之列`)
            assert.strict.deepEqual(await srcsOf('targets', F), ['專案Z/頁1/區塊A'], `length:${n} 該 from 之既有列須不變`)
        }
    })

    it('API-sync-013-row-with-length-field-valid-accepted：列帶 length 欄位但內容合法 → 成功，length 不入庫', async function() {
        const F = 'appTest-13'
        assert.strict.deepEqual(await okSync('targets', F, [{ srcKey: '專案Z/頁1/區塊C', order: 0, length: 5, description: 'ok' }]), cnt(1, 0, 0, 0))
        let rs = await dbRows('targets', F)
        assert.strict.equal(rs.length, 1)
        assert.strict.ok(!Object.prototype.hasOwnProperty.call(rs[0], 'length'), 'length 不是 schema 欄位，不得入庫')
    })

    // ============ R-ORM-05（外部同步）：rows 之元素須為非空物件（2026-10-20 run02；主控 run01 複審裁示 5）============
    //修正前實測（真後端）：元素為字串／數字／null 時 `v.from = from` 拋 TypeError，pm2resolve 把引擎原文外送（msg="Cannot create property 'from' on string 'abc'"）；
    //元素為 {}（多元素陣列內）時寫入一筆自動主鍵之空白列。與後台整表寫入之 isRowObj 同判準。

    it('API-sync-014-non-object-elements-rejected-no-engine-text：rows 含非物件元素（字串、數字、null、陣列、布林） → invalidRows（語系鍵），不外送引擎原文，該 from 既有列不變', async function() {
        const F = 'appTest-14'
        let row0 = (s) => ({ srcKey: s, order: 0, description: 'ok' })
        assert.strict.deepEqual(await okSync('targets', F, [row0('專案14/頁1/區塊A')], '預置'), cnt(1, 0, 0, 0))

        let variants = [['abc', 1], ['abc'], [row0('專案14/頁1/區塊B'), null], [row0('專案14/頁1/區塊B'), 5], [row0('專案14/頁1/區塊B'), 'x'], [row0('專案14/頁1/區塊B'), [1]], [row0('專案14/頁1/區塊B'), true]]
        for (let rows of variants) {
            let s0 = await snapAll()
            let res = await postSync('targets', TOKEN_APP, { from: F, rows })
            assert.strict.equal(res.state, 'error', `rows=${JSON.stringify(rows)} 應被拒，實得: ${JSON.stringify(res)}`)
            assert.strict.equal(res.msg, 'invalidRows', `rows=${JSON.stringify(rows)} 應回語系鍵 invalidRows，實得: ${JSON.stringify(res.msg)}`)
            assert.strict.ok(!/Cannot|TypeError|undefined|property/.test(JSON.stringify(res)), `不得外送引擎原文: ${JSON.stringify(res)}`)
            assert.strict.equal(await snapAll(), s0, `rows=${JSON.stringify(rows)} 四表須逐位元不變`)
        }
        assert.strict.deepEqual(await srcsOf('targets', F), ['專案14/頁1/區塊A'], '該 from 之既有列須不變')
    })

    it('API-sync-015-empty-object-element-rejected-no-blank-row：rows 含 {} → invalidRows，不寫入空白列，該 from 既有列不變', async function() {
        const F = 'appTest-15'
        assert.strict.deepEqual(await okSync('targets', F, [MK.targets('專案15/頁1/區塊A', { description: 'ok' })], '預置'), cnt(1, 0, 0, 0))

        for (let rows of [[{ srcKey: '專案15/頁1/區塊B', order: 0, description: 'x' }, {}], [{}, {}], [{}, { srcKey: '專案15/頁1/區塊C', order: 0 }]]) {
            await expectReject('targets', { from: F, rows }, 'invalidRows', `rows=${JSON.stringify(rows)}`)
        }
        assert.strict.deepEqual(await srcsOf('targets', F), ['專案15/頁1/區塊A'], '不得寫入空白列、既有列須不變')
    })

    //外審 minimax#3 之等價(原『只含非 schema 欄位之列映射到 schema 後與 {} 相同』): perm-run03 起每列必帶 srcKey，只含非 schema 欄位／只有 from 之列缺 srcKey → srcKeyInvalid，同樣不寫入空白列
    it('API-sync-016-row-without-srcKey-rejected-no-blank-row：列只含非 schema 欄位（或只有 from）而缺 srcKey → srcKeyInvalid，不寫入空白列，該 from 既有列不變；有 srcKey 且有內容之列照常寫入', async function() {
        const F = 'appTest-16'
        let valid = MK.targets('sk16-b', { description: 'x' })
        assert.strict.deepEqual(await okSync('targets', F, [MK.targets('sk16-a', { description: 'ok' })], '預置'), cnt(1, 0, 0, 0))

        for (let rows of [[valid, { foo: 1 }], [valid, { length: 5 }], [{ foo: 1 }, { bar: 2 }], [valid, { from: 'other' }], [{ foo: 1 }]]) {
            await expectReject('targets', { from: F, rows }, 'srcKeyInvalid', `rows=${JSON.stringify(rows)}`)
        }
        assert.strict.deepEqual(await srcsOf('targets', F), ['sk16-a'], '不得寫入空白列、既有列須不變')

        //有 srcKey 且有內容之列照常寫入（order 為 0 亦算有值；僅 srcKey 之 targets 列亦成立：id＝srcKey）
        assert.strict.deepEqual(await okSync('targets', F, [{ srcKey: 'sk16-c', order: 0, description: 'only-desc-and-order' }, { srcKey: 'sk16-d' }], '有內容'), cnt(2, 0, 1, 0))
        assert.strict.deepEqual(await srcsOf('targets', F), ['sk16-c', 'sk16-d'])
    })

    //外審 sol(run03)#3／#4 之等價：只帶伺服器管理欄（userId、timeCreate、userIdUpdate、timeUpdate）或只帶空容器之列——缺 srcKey 者 srcKeyInvalid；有 srcKey 而欄位為空容器者 invalidRows(非純量)
    it('API-sync-017-row-with-only-server-managed-or-empty-container-fields-rejected：只含伺服器管理欄或空容器值而缺 srcKey → srcKeyInvalid；帶 srcKey 而欄位為空容器 → invalidRows；皆不寫入空白列；order 為 0 之列照常寫入', async function() {
        const F = 'appTest-17'
        let valid = MK.targets('sk17-b', { description: 'x' })
        assert.strict.deepEqual(await okSync('targets', F, [MK.targets('sk17-a', { description: 'ok' })], '預置'), cnt(1, 0, 0, 0))

        let badsNoSrc = [
            [{ userId: 'supplied' }],
            [{ timeCreate: '2020-01-01 00:00:00' }],
            [{ userIdUpdate: 'u', timeUpdate: 't' }],
            [valid, { userId: 'supplied', timeCreate: 'x', userIdUpdate: 'y', timeUpdate: 'z', from: 'other' }],
            [{ description: [] }],
            [{ description: {} }],
            [valid, { description: [], order: {} }],
        ]
        for (let rows of badsNoSrc) {
            await expectReject('targets', { from: F, rows }, 'srcKeyInvalid', `無 srcKey rows=${JSON.stringify(rows)}`)
        }
        let badsEmptyContainer = [
            [{ srcKey: 'sk17-c', description: [] }],
            [{ srcKey: 'sk17-c', description: {} }],
            [valid, { srcKey: 'sk17-c', description: [], order: {} }],
        ]
        for (let rows of badsEmptyContainer) {
            await expectReject('targets', { from: F, rows }, 'invalidRows', `空容器 rows=${JSON.stringify(rows)}`)
        }
        assert.strict.deepEqual(await srcsOf('targets', F), ['sk17-a'], '既有列須不變、不得寫入空白列')

        //order 為 0 本身即內容（獨立一列，不靠同批其他欄位）：照常寫入，由伺服器產生主鍵
        assert.strict.deepEqual(await okSync('users', F, [{ srcKey: 'sk17-u', order: 0 }], 'order 0'), cnt(1, 0, 0, 0))
        let u = (await dbRows('users', F))[0]
        assert.strict.ok(UUID_RE.test(u.id) && u.srcKey === 'sk17-u')
    })

    //伺服器管理欄(建立者／建立時間／更新者／更新時間)由伺服器擁有，批次帶值一律不採(規格第 4 節；syncCore 檔頭『欄位歸屬』)
    it('API-sync-017b-server-managed-fields-not-adopted：批次帶 userId／timeCreate／userIdUpdate／timeUpdate 之偽值 → 新增與修改皆不採納', async function() {
        const F = 'appTest-17b'
        const FORGED = { userId: 'forged-user', timeCreate: '2000-01-01 00:00:00', userIdUpdate: 'forged-user', timeUpdate: '2000-01-01 00:00:00' }
        assert.strict.deepEqual(await okSync('targets', F, [MK.targets('sk17b-a', { description: 'v1', ...FORGED })], '新增'), cnt(1, 0, 0, 0))
        let r1 = (await bySrc('targets', F))['sk17b-a']
        assert.strict.equal(r1.userId, 'id-for-application', '新增: userId 不採批次值')
        assert.strict.equal(r1.userIdUpdate, 'id-for-application', '新增: userIdUpdate 不採批次值')
        assert.strict.notEqual(r1.timeCreate, FORGED.timeCreate, '新增: timeCreate 不採批次值')
        assert.strict.notEqual(r1.timeUpdate, FORGED.timeUpdate, '新增: timeUpdate 不採批次值')

        await sleep(20)
        assert.strict.deepEqual(await okSync('targets', F, [MK.targets('sk17b-a', { description: 'v2', ...FORGED })], '修改'), cnt(0, 1, 0, 0))
        let r2 = (await bySrc('targets', F))['sk17b-a']
        assert.strict.equal(r2.description, 'v2')
        assert.strict.equal(r2.userId, r1.userId, '修改: 建立者保留庫內值')
        assert.strict.equal(r2.timeCreate, r1.timeCreate, '修改: 建立時間保留庫內值')
        assert.strict.equal(r2.userIdUpdate, 'id-for-application')
        assert.strict.notEqual(r2.timeUpdate, FORGED.timeUpdate, '修改: timeUpdate 不採批次值')
    })

    // ===== R-FIELD-SCALAR-01（第 92 項②）：欄位值須為純量；非純量於寫入之前整批拒絕 =====
    //四表 schema 欄位型別只有 STRING／INTEGER／TEXT，無合法物件型欄位。修正前真後端實測：同一列其他欄位有內容時，
    //{ description: { value: '<script>x</script>' } } 避過預檢（預檢只看 isestr）而於寫入時被 w-serv-orm 靜默改寫（非拒絕）。
    //「不變」以全列快照比對（外審 sol#8）：四表全部列(含稽核時間)拒收前後逐位元相同。

    it('API-sync-018-nonscalar-field-rejected-rows-kept：列的 description 為物件／陣列／巢狀（同列他欄有內容） → invalidRows，四表全列逐位元不變', async function() {
        const F = 'appTest-18'
        let rows0 = [MK.targets('sk18-a', { description: 'ok' }), MK.targets('sk18-z', { order: 1, description: 'second' })]
        assert.strict.deepEqual(await okSync('targets', F, rows0, '預置'), cnt(2, 0, 0, 0))
        assert.strict.ok((await snapAll()).length > 100, '前置快照非空')

        let probes = [
            { value: '<script>x</script>' },
            { value: 'plain' },
            ['a', 'b'],
            { a: { b: '<b' } },
        ]
        for (let v of probes) {
            await expectReject('targets', { from: F, rows: [{ srcKey: 'sk18-b', order: 1, description: v }] }, 'invalidRows', `description=${JSON.stringify(v)}`)
        }
        //同批多列只有一列帶非純量 → 整批拒絕
        await expectReject('targets', { from: F, rows: [{ srcKey: 'sk18-c', description: 'good' }, { srcKey: 'sk18-d', description: { v: 1 } }] }, 'invalidRows', '同批僅一列非純量')
        assert.strict.deepEqual(await srcsOf('targets', F), ['sk18-a', 'sk18-z'])
    })

    it('API-sync-019-nonscalar-in-other-tables-rejected：users／grups／pemis 的非純量欄位亦拒絕（cgrups／cpemis／crules 為 JSON 字串，物件非法）；先建立舊列，拒收後全列逐位元不變', async function() {
        const F = 'appTest-19'
        let legacy = {
            users: MK.users('sk19-u0', { name: 'ns19-old', email: 'ns19-old@example.com' }),
            grups: MK.grups('sk19-g0', { name: 'ns19g-old' }),
            pemis: MK.pemis('sk19-p0', { name: 'ns19p-old' }),
        }
        let cases = [
            ['users', { srcKey: 'sk19-u', name: 'ns19', email: 'ns19@example.com', cgrups: { 權限群組M1: ON }, isAdmin: 'n', isActive: 'y' }],
            ['grups', { srcKey: 'sk19-g', name: 'ns19g', cpemis: { 權限P1: ON } }],
            ['pemis', { srcKey: 'sk19-p', name: 'ns19p', crules: ['專案A/頁A/區塊A'] }],
        ]
        for (let [kt, row] of cases) {
            assert.strict.deepEqual(await okSync(kt, F, [legacy[kt]], '預置舊列'), cnt(1, 0, 0, 0))
            await expectReject(kt, { from: F, rows: [row] }, 'invalidRows', `${kt} 非純量`)
            assert.strict.deepEqual(await srcsOf(kt, F), [legacy[kt].srcKey], `${kt} 只剩舊列`)
        }
        //純量（JSON 字串）照常寫入: 新 srcKey ＝ 舊列刪除、新列新增
        let ok = await okSync('pemis', F, [{ srcKey: 'sk19-p', name: 'ns19p', crules: JSON.stringify({ '專案A/頁A/區塊A': 'y' }) }], '純量')
        assert.strict.deepEqual(ok, cnt(1, 0, 1, 0))
        assert.strict.deepEqual(await srcsOf('pemis', F), ['sk19-p'])
    })


    // ===== R-SYNC-NAME-01（run02，複審 R2）：grups／pemis 的 name 須為非空字串，否則整批拒收（比照後台 ckKey） =====
    //背景：外部同步灌入 name:'' 之群組／權限時，伺服端 arrFinder 以 === 採納，編輯器（cvKpToObj／doSave）視空名稱為無效，存檔即移除該授權（移除 AND 限制時增權）。
    //缺漏、''、數字、布林、null 皆整批拒收（invalidRows），於寫入之前，該 from 與他 from 之既有列逐位元不變。users 不在範圍（name 可重複）。
    //targets 之 id 非空字串要求(原 API-sync-021)已由 srcKey 必填取代，併入 API-sync-028(四表 srcKey 無效值全格)。

    //BAD：name 的無效值（undefined 代表整個欄位缺漏）
    const BAD_KEYS = [undefined, '', 5, true, null]

    it('API-sync-020-empty-or-nonstring-name-rejected：grups／pemis 的 name 缺漏／空字串／數字／布林／null → invalidRows，整批拒收（含同批其他合法列），四表逐位元不變', async function() {
        const F = 'appTest-20'
        for (let kt of ['grups', 'pemis']) {
            let legacy = MK[kt]('sk20-old', { name: `nm20-old-${kt}` })
            let valid = MK[kt]('sk20-new', { name: `nm20-new-${kt}` })
            assert.strict.deepEqual(await okSync(kt, F, [legacy], '預置舊列'), cnt(1, 0, 0, 0))
            for (let v of BAD_KEYS) {
                let bad = withKey(MK[kt]('sk20-bad'), 'name', v)
                for (let rows of [[bad], [valid, bad], [bad, valid]]) {
                    await expectReject(kt, { from: F, rows }, 'invalidRows', `${kt} name=${JSON.stringify(v)}`)
                }
            }
            assert.strict.deepEqual(await srcsOf(kt, F), ['sk20-old'], `${kt} 只剩舊列`)
        }
    })

    it('API-sync-022-valid-string-names-accepted-users-unaffected：合法非空字串（含中文、含空白字元內嵌）照常寫入；users 不要求 name（name 可重複、可省）', async function() {
        const F = 'appTest-22'
        assert.strict.deepEqual(await okSync('grups', F, [MK.grups('sk22-g1', { name: '權限群組 22' }), MK.grups('sk22-g2', { name: 'a' })], 'grups'), cnt(2, 0, 0, 0))
        assert.strict.deepEqual(await okSync('pemis', F, [MK.pemis('sk22-p1', { name: '權限 22' })], 'pemis'), cnt(1, 0, 0, 0))
        assert.strict.deepEqual(await okSync('targets', F, [{ srcKey: '專案22/頁1/區塊A', description: 'x' }], 'targets'), cnt(1, 0, 0, 0))
        //users：name 可省、可重複——不在 R-SYNC-NAME-01 範圍
        let ru = await okSync('users', F, [
            { srcKey: 'sk22-u1', order: 0, email: 'nm22a@appTest.com', cgrups: '{}', isAdmin: 'n', isActive: 'y' },
            { srcKey: 'sk22-u2', order: 1, name: 'dup', email: 'nm22b@appTest.com', cgrups: '{}', isAdmin: 'n', isActive: 'y' },
            { srcKey: 'sk22-u3', order: 2, name: 'dup', email: 'nm22c@appTest.com', cgrups: '{}', isAdmin: 'n', isActive: 'y' },
        ], 'users')
        assert.strict.deepEqual(ru, cnt(3, 0, 0, 0))
        assert.strict.equal((await dbRows('users', F)).length, 3)
    })


    // ===== R-NAME-UNIQ-01（F-02, ADR-034）：grups／pemis 的 name 不得重複（批內／他 from）=====
    //述語: 外部同步於寫入之前, ①本批 rows 內 name 精確 === 重複 → invalidRows; ②該表既有列中 from 不等於本 from 者已使用此 name → invalidRows; 同 from 之既有列不算衝突(同批比對後被修改或刪除);
    //  外部應用只收固定語系鍵 invalidRows; 被拒時四表全列逐位元不變; 比對為精確 ===(大小寫與空白不同視為不同名稱).
    //修正前: 兩者皆回 success 並寫入同名列(ADR-031 決定 4 明載「不比照 ckKey 之重複偵測」)——授權以名稱查找(arrFinder 取第一個同名列), 同名並存即取決於列序.

    it('API-sync-023-duplicate-name-in-batch-rejected：grups／pemis 同批 rows 內 name 重複（相鄰、不相鄰、三筆中兩筆）→ invalidRows，四表逐位元不變', async function() {
        const F = 'appTest-23'
        for (let kt of ['grups', 'pemis']) {
            let mk = (s, name) => MK[kt](s, { name })
            assert.strict.deepEqual(await okSync(kt, F, [mk('sk23-old', `nd23-old-${kt}`)], '預置舊列'), cnt(1, 0, 0, 0))
            let variants = [
                [mk('sk23-a', 'dupN'), mk('sk23-b', 'dupN')],
                [mk('sk23-a', 'dupN'), mk('sk23-c', 'uniq'), mk('sk23-b', 'dupN')],
                [mk('sk23-c', 'uniq'), mk('sk23-a', 'dupN'), mk('sk23-b', 'dupN')],
            ]
            for (let rows of variants) {
                await expectReject(kt, { from: F, rows }, 'invalidRows', `${kt} rows=${JSON.stringify(rows.map((v) => v.name))} 同批同名`)
            }
            assert.strict.deepEqual(await srcsOf(kt, F), ['sk23-old'], `${kt} 只剩舊列`)
        }
    })

    it('API-sync-024-name-used-by-other-from-rejected：grups／pemis 的 name 已為他 from 之既有列使用（含 base seed）→ invalidRows，兩個 from 皆不變', async function() {
        const F = 'appTest-24'
        const G = 'appTest-24b'
        for (let kt of ['grups', 'pemis']) {
            let mk = (s, name) => MK[kt](s, { name })
            //G 先持有 name
            assert.strict.deepEqual(await okSync(kt, G, [mk('sk24-g', `of24-${kt}`)], 'G 預置'), cnt(1, 0, 0, 0))
            //F 預置自己之列
            assert.strict.deepEqual(await okSync(kt, F, [mk('sk24-f0', `of24-f0-${kt}`)], 'F 預置'), cnt(1, 0, 0, 0))
            //(a) 與 G 之 name 相同; (b) 與 base seed(from '')之 name 相同; 各自夾在合法列之間, 整批拒收
            let baseName = (await dbRows(kt, ''))[0].name
            for (let name of [`of24-${kt}`, baseName]) {
                await expectReject(kt, { from: F, rows: [mk('sk24-ok', `of24-ok-${kt}`), mk('sk24-f1', name)] }, 'invalidRows', `${kt} name=${name} 已屬他 from`)
            }
            assert.strict.deepEqual(await srcsOf(kt, F), ['sk24-f0'], `${kt} F 只剩預置列`)
            assert.strict.deepEqual(await srcsOf(kt, G), ['sk24-g'], `${kt} G 不變`)
        }
    })

    //原『同 from 重送同名(含換 id 保留 name)→ 成功(舊列隨 delAll 重寫)』: 差異語意下改為——重送同批＝nSame；換 srcKey 保留 name＝刪舊增新(新 id)，同 from 之既有列不算名稱衝突
    it('API-sync-025-same-from-resend-same-name-accepted：同 from 重送同名（重送完全相同之批＝nSame；換 srcKey 保留 name＝刪舊增新、新 id）→ 成功（同 from 之既有列不算衝突）', async function() {
        const F = 'appTest-25'
        for (let kt of ['grups', 'pemis']) {
            let mk = (s, name) => MK[kt](s, { name })
            let batch = [mk('sk25-a', `sf25-${kt}`), mk('sk25-b', `sf25b-${kt}`)]
            assert.strict.deepEqual(await okSync(kt, F, batch, '第 1 次'), cnt(2, 0, 0, 0))
            let idA = (await bySrc(kt, F))['sk25-a'].id
            let snap = await snapOf(kt, F)
            assert.strict.deepEqual(await okSync(kt, F, batch, '重送完全相同之批'), cnt(0, 0, 0, 2))
            assert.strict.equal(await snapOf(kt, F), snap, `${kt} 重送後全列不變`)
            //換 srcKey 保留 name: 舊列 a、b 不在批次(刪除)，c 新增(同名 sf25-kt 不算衝突)
            assert.strict.deepEqual(await okSync(kt, F, [mk('sk25-c', `sf25-${kt}`)], '換 srcKey 保留 name'), cnt(1, 0, 2, 0))
            assert.strict.deepEqual(await srcsOf(kt, F), ['sk25-c'], `${kt} 只剩新批`)
            let c = (await bySrc(kt, F))['sk25-c']
            assert.strict.ok(UUID_RE.test(c.id) && c.id !== idA, `${kt} 換 srcKey 即為新實體(新 id，不繼承舊 id)`)
            //收尾: 上一步為『同名異 srcKey』(疑似來源鍵重編)，伺服端登錄了 syncWarns 提示(記憶體，重啟前常駐; 清單頁橫幅會讀它)；以同批重送(已無此情形)清除，免污染其後案例
            assert.strict.deepEqual(await okSync(kt, F, [mk('sk25-c', `sf25-${kt}`)], '清除重編提示'), cnt(0, 0, 0, 1))
        }
    })

    it('API-sync-026-exact-match-only：僅大小寫或前後空白不同之 name 視為不同名稱（精確 ===，不正規化），可寫入', async function() {
        const F = 'appTest-26'
        for (let kt of ['grups', 'pemis']) {
            let names = [`Case26-${kt}`, `case26-${kt}`, `Case26-${kt} `, ` Case26-${kt}`, `CASE26-${kt}`]
            let res = await okSync(kt, F, names.map((n, i) => MK[kt](`sk26-${i}`, { name: n })), kt)
            assert.strict.deepEqual(res, cnt(names.length, 0, 0, 0), `${kt} 精確比對下互不相同，應全數新增`)
            assert.strict.equal((await dbRows(kt, F)).length, names.length, `${kt} 全部寫入`)
        }
    })

    it('API-sync-027-users-default-mappingBy-id-no-mapkey-check：預設 mappingBy=id 時 users 不另檢查對應鍵（email 空／批內重複／與他 from 重複皆可寫入）', async function() {
        //述語(R-MAPKEY-01): mappingBy='id'(預設)不另檢查——預設部署之 email 可空／可重複, 新規則不得使其外部同步全部失敗.
        //mappingBy='email'／'name' 之行為見 api-mapKey.test.mjs 與 unit-keyCheck.
        const F = 'appTest-27'
        const G = 'appTest-27b'
        let u = (s, name, email, isActive = 'y') => MK.users(s, { name, email, isActive })
        assert.strict.deepEqual(await okSync('users', G, [u('sk27-g', 'g27', 'x27@appTest.com')], 'G 預置'), cnt(1, 0, 0, 0))
        let res = await okSync('users', F, [
            u('sk27-1', 'a27', ''), //active 且 email 空
            u('sk27-2', 'b27', 'dup27@appTest.com'),
            u('sk27-3', 'c27', 'dup27@appTest.com'), //批內重複
            u('sk27-4', 'd27', 'x27@appTest.com'), //與他 from(G)重複
        ], 'mappingBy=id 不應檢查 email')
        assert.strict.deepEqual(res, cnt(4, 0, 0, 0))
        assert.strict.equal((await dbRows('users', F)).length, 4)
    })


    // ============ perm-run03 新增: 來源鍵 srcKey 協定之拒收案例(spec I7／I8／I13；每案皆斷言四表逐位元不變＝零寫入) ============

    //BAD_SRC：srcKey 無效值(undefined 代表整個欄位缺漏)；含 UTF-8 超過 1978 位元組、HTML 標記、空白、非字串
    const BAD_SRC = [undefined, '', '   ', '\t\n', 5, true, null, ['a'], { v: 'a' }, 'U' + 'x'.repeat(1978), 'sk<script>x</script>', 'a<c']

    it('API-sync-028-srcKey-invalid-rejected-all-tables：四表之 srcKey 缺漏／空字串／空白／非字串／過長／含標記 → srcKeyInvalid，整批拒收(含同批其他合法列)、四表逐位元不變', async function() {
        const F = 'appTest-28'
        for (let kt of KTS) {
            assert.strict.deepEqual(await okSync(kt, F, [MK[kt]('sk28-old', ov(kt, 'n28old'))], `${kt} 預置舊列`), cnt(1, 0, 0, 0))
            let valid = MK[kt]('sk28-ok', ov(kt, 'n28ok'))
            for (let v of BAD_SRC) {
                let bad = withKey(MK[kt]('sk28-bad', ov(kt, 'n28bad')), 'srcKey', v)
                for (let rows of [[bad], [valid, bad], [bad, valid]]) {
                    await expectReject(kt, { from: F, rows }, 'srcKeyInvalid', `${kt} srcKey=${String(JSON.stringify(v)).slice(0, 40)}`)
                }
            }
            assert.strict.deepEqual(await srcsOf(kt, F), ['sk28-old'], `${kt} 只剩舊列`)
        }
    })

    it('API-sync-029-srcKey-duplicate-in-batch-rejected：四表同批 srcKey 重複(相鄰、不相鄰、三筆中兩筆；其餘欄位互異) → srcKeyDuplicate、四表逐位元不變；僅大小寫不同者非重複(精確 ===)', async function() {
        const F = 'appTest-29'
        for (let kt of KTS) {
            assert.strict.deepEqual(await okSync(kt, F, [MK[kt]('sk29-old', ov(kt, 'n29old'))], `${kt} 預置舊列`), cnt(1, 0, 0, 0))
            let a1 = MK[kt]('sk29-a', ov(kt, 'n29a1'))
            let a2 = MK[kt]('sk29-a', ov(kt, 'n29a2')) //同 srcKey、其餘欄位互異
            let b = MK[kt]('sk29-b', ov(kt, 'n29b'))
            for (let rows of [[a1, a2], [a1, b, a2], [b, a1, a2]]) {
                await expectReject(kt, { from: F, rows }, 'srcKeyDuplicate', `${kt} 同批重複`)
            }
            assert.strict.deepEqual(await srcsOf(kt, F), ['sk29-old'], `${kt} 只剩舊列`)
        }
        //精確比對: Dup29 與 dup29 為不同 srcKey
        let res = await okSync('users', F, [MK.users('Dup29', ov('users', 'n29u1')), MK.users('dup29', ov('users', 'n29u2'))], '大小寫不同')
        assert.strict.deepEqual(res, cnt(2, 0, 1, 0), '大小寫不同之 srcKey 視為不同(舊列 sk29-old 刪除)')
    })

    it('API-sync-030-id-not-allowed-rejected：任一列帶 id 鍵(任何值，含空字串／null／數字；含舊呼叫方式只送 id 不送 srcKey) → idNotAllowed(先於 srcKey 檢查)，整批拒收、四表逐位元不變', async function() {
        const F = 'appTest-30'
        for (let kt of KTS) {
            assert.strict.deepEqual(await okSync(kt, F, [MK[kt]('sk30-old', ov(kt, 'n30old'))], `${kt} 預置舊列`), cnt(1, 0, 0, 0))
            let valid = MK[kt]('sk30-ok', ov(kt, 'n30ok'))
            let withId = (v) => withKey(MK[kt]('sk30-bad', ov(kt, 'n30bad')), 'id', v)
            let variants = [
                [withId('x')],
                [valid, withId('y')],
                [withId('')],
                [withId(null)],
                [withId(123)],
                [withKey(withId('z'), 'srcKey', undefined)], //舊呼叫方式: 只送 id、不送 srcKey → 仍回 idNotAllowed(先提示移除 id)
                [{ id: 'old-style', order: 0, description: 'old style call' }], //舊呼叫方式的最小形狀
            ]
            for (let rows of variants) {
                await expectReject(kt, { from: F, rows }, 'idNotAllowed', `${kt} rows=${JSON.stringify(rows).slice(0, 80)}`)
            }
            assert.strict.deepEqual(await srcsOf(kt, F), ['sk30-old'], `${kt} 只剩舊列`)
        }
    })

    //外部端輔助 provideTabs(server/provideTabs.mjs; spec 第 3 節)：依表挑欄後送出，已改送 srcKey、不送 id——列內即使夾帶 id 也被挑欄剝除；舊呼叫方式(只有 id)被伺服端拒收
    it('API-sync-031-provideTabs-sends-srcKey-not-id：provideTabs 實打真後端——夾帶 id 之列被挑欄剝除、以 srcKey 成功匯入；只有 id 無 srcKey 之列 → srcKeyInvalid', async function() {
        const F = 'appTest-31'
        let url = urlSync.replace('{keyTable}', 'grups').replace('{token}', TOKEN_APP)
        let msg = await provideTabs(url, 'grups', F, [{ id: 'old-style-id-1', srcKey: 'sk31-g1', order: 0, name: 'Prov31', description: 'p', cpemis: '{}' }])
        assert.strict.deepEqual(msg, cnt(1, 0, 0, 0), 'provideTabs 應成功且為新增')
        let row = (await bySrc('grups', F))['sk31-g1']
        assert.strict.ok(row && UUID_RE.test(row.id) && row.id !== 'old-style-id-1', '外部夾帶之 id 不被採用，內部 id 由伺服端產生')

        let s0 = await snapAll()
        await assert.rejects(() => provideTabs(url, 'grups', F, [{ id: 'old-style-id-2', name: 'Prov31b', description: 'x', cpemis: '{}' }]), (e) => e === 'srcKeyInvalid', '只送 id 之舊呼叫方式應被拒 srcKeyInvalid')
        assert.strict.equal(await snapAll(), s0, '被拒後四表逐位元不變')
    })


    // ============ perm-run03 新增: 差異同步之四表通則(spec I1～I4、I10)與引用連帶(I3、I5；原則 6) ============

    it('API-sync-032-diff-semantics-all-tables：四表之差異同步——新增／修改／刪除／不變計數正確、id 穩定(targets：id＝srcKey)、不變之列零寫入、後台列與他 from 全列逐位元不變', async function() {
        const F = 'appTest-32'
        for (let kt of KTS) {
            let A = MK[kt]('sk32-a', ov(kt, 'n32a'))
            let B = MK[kt]('sk32-b', ov(kt, 'n32b'))
            let C = MK[kt]('sk32-c', ov(kt, 'n32c'))
            assert.strict.deepEqual(await okSync(kt, F, [A, B, C], `${kt} 首次`), cnt(3, 0, 0, 0))
            let m0 = await bySrc(kt, F)
            for (let s of ['sk32-a', 'sk32-b', 'sk32-c']) {
                assert.strict.equal(UUID_RE.test(m0[s].id), kt !== 'targets', `${kt} ${s} 之 id ${kt === 'targets' ? '＝srcKey(標的名稱)' : '為伺服端產生之 uuid'}`)
            }
            if (kt === 'targets') {
                assert.strict.ok(['sk32-a', 'sk32-b', 'sk32-c'].every((s) => m0[s].id === s), 'targets 之 id＝srcKey')
            }
            let others0 = await snapOthers(kt, F) //後台列與他 from 全列
            let rowA0 = JSON.stringify(m0['sk32-a'])

            //差異: A 不變、B 改 description(修改)、C 不在批次(刪除)、D 新增
            let B2 = { ...B, description: 'n32b-changed' }
            let D = MK[kt]('sk32-d', ov(kt, 'n32d'))
            await sleep(20)
            assert.strict.deepEqual(await okSync(kt, F, [A, B2, D], `${kt} 差異`), cnt(1, 1, 1, 1))
            let m1 = await bySrc(kt, F)
            assert.strict.deepEqual(Object.keys(m1).sort(), ['sk32-a', 'sk32-b', 'sk32-d'], `${kt} C 已刪、D 已增`)
            assert.strict.equal(JSON.stringify(m1['sk32-a']), rowA0, `${kt} 不變之列 A 須逐位元不變(零寫入)`)
            assert.strict.equal(m1['sk32-b'].id, m0['sk32-b'].id, `${kt} 修改保留 id`)
            assert.strict.equal(m1['sk32-b'].description, 'n32b-changed')
            assert.strict.equal(UUID_RE.test(m1['sk32-d'].id), kt !== 'targets', `${kt} D 之 id`)
            assert.strict.equal(await snapOthers(kt, F), others0, `${kt} 後台列與他 from 全列須逐位元不變`)

            //重送同批: 全 nSame
            let snap = await snapOf(kt, F)
            assert.strict.deepEqual(await okSync(kt, F, [A, B2, D], `${kt} 重送`), cnt(0, 0, 0, 3))
            assert.strict.equal(await snapOf(kt, F), snap, `${kt} 重送後分區須逐位元不變`)
        }
    })

    //spec I5: 同 srcKey 不同名稱＝改名(修改，id 不變)；以名稱引用者跟著改(cascadeRename 預設開；規則帳本 R-REF-CASCADE-01)
    it('API-sync-033-rename-same-srcKey-cascades-reference：同 srcKey 改名 → 視為修改(id 不變)，引用它之其他來源使用者的 cgrups 跟著改為新名', async function() {
        const F = 'appTest-33'
        const H = 'appTest-33h'
        assert.strict.deepEqual(await okSync('grups', F, [MK.grups('sk33-g', { name: 'Ren33-old' })], 'grups'), cnt(1, 0, 0, 0))
        let gid = (await bySrc('grups', F))['sk33-g'].id
        assert.strict.deepEqual(await okSync('users', H, [MK.users('sk33-u', { cgrups: JSON.stringify({ 'Ren33-old': ON }) })], 'users(引用端)'), cnt(1, 0, 0, 0))

        assert.strict.deepEqual(await okSync('grups', F, [MK.grups('sk33-g', { name: 'Ren33-new' })], '改名'), cnt(0, 1, 0, 0), '同 srcKey 異名＝nUpdate')
        let g = (await bySrc('grups', F))['sk33-g']
        assert.strict.equal(g.id, gid, '改名保留 id')
        assert.strict.equal(g.name, 'Ren33-new')
        let u = (await bySrc('users', H))['sk33-u']
        assert.strict.deepEqual(JSON.parse(u.cgrups), { 'Ren33-new': ON }, '引用端 cgrups 應跟著改為新名')
    })

    //原則 6(新實體不繼承)：名稱不變而 srcKey 不同＝刪舊增新(新 id)，引用被清、不被同名新實體接管
    it('API-sync-034-same-name-different-srcKey-is-delete-and-add：名稱不變、srcKey 不同 → 刪舊增新(新 id)，引用被連帶清理、不被同名新實體接管', async function() {
        const F = 'appTest-34'
        const H = 'appTest-34h'
        assert.strict.deepEqual(await okSync('grups', F, [MK.grups('sk34-g1', { name: 'Keep34' })], 'grups'), cnt(1, 0, 0, 0))
        let oldId = (await bySrc('grups', F))['sk34-g1'].id
        assert.strict.deepEqual(await okSync('users', H, [MK.users('sk34-u', { cgrups: JSON.stringify({ Keep34: ON }) })], 'users(引用端)'), cnt(1, 0, 0, 0))

        assert.strict.deepEqual(await okSync('grups', F, [MK.grups('sk34-g2', { name: 'Keep34' })], '換 srcKey 同名'), cnt(1, 0, 1, 0))
        let rs = await dbRows('grups', F)
        assert.strict.deepEqual(rs.map((v) => v.srcKey), ['sk34-g2'], '舊列已刪、新列已增')
        assert.strict.ok(UUID_RE.test(rs[0].id) && rs[0].id !== oldId, '新實體配新 id')
        let u = (await bySrc('users', H))['sk34-u']
        assert.strict.deepEqual(JSON.parse(u.cgrups), {}, '引用應被清理，不被同名新實體接管')
        //收尾: 『同名異 srcKey』使伺服端登錄 syncWarns 提示(見 API-sync-025)；同批重送(已無此情形)清除
        assert.strict.deepEqual(await okSync('grups', F, [MK.grups('sk34-g2', { name: 'Keep34' })], '清除重編提示'), cnt(0, 0, 0, 1))
    })

    //spec I3: 批次少一列 → 該列刪除、引用清理(其餘存續之列的引用不動)
    it('API-sync-035-delete-cleans-reference：批次少一列 → 該列刪除，引用它之其他來源 grups 的 cpemis 連帶清理(存續者之引用保留)', async function() {
        const F = 'appTest-35'
        const H = 'appTest-35h'
        assert.strict.deepEqual(await okSync('pemis', F, [MK.pemis('sk35-p1', { name: 'P35a' }), MK.pemis('sk35-p2', { name: 'P35b' })], 'pemis'), cnt(2, 0, 0, 0))
        assert.strict.deepEqual(await okSync('grups', H, [MK.grups('sk35-g', { name: 'G35', cpemis: JSON.stringify({ P35a: ON, P35b: ON }) })], 'grups(引用端)'), cnt(1, 0, 0, 0))

        assert.strict.deepEqual(await okSync('pemis', F, [MK.pemis('sk35-p2', { name: 'P35b' })], '少一列'), cnt(0, 0, 1, 1))
        assert.strict.deepEqual(await srcsOf('pemis', F), ['sk35-p2'])
        let g = (await bySrc('grups', H))['sk35-g']
        assert.strict.deepEqual(JSON.parse(g.cpemis), { P35b: ON }, '被刪者之引用清理、存續者之引用保留')
    })


    // ============ perm-run03 新增: 一次性資料遷移(spec 第 9 節、I15) ============
    //舊同步寫入之外部列無 srcKey：首次匯入時批次 srcKey 等於其 id 者視為同一列(補上 srcKey、id 不變、計入 nUpdate)；其後只認 srcKey；對不上者依差異同步刪舊增新(引用連帶清理)。
    //舊式列以 getWoItems().save 直接寫入(無任何現行入口可造；測試框架夾具)。

    it('API-sync-036-migrate-legacy-row-matched-by-id：既有無 srcKey 之外部列，批次 srcKey 等於其 id → 視為同一列(id 不變、補上 srcKey、nUpdate=1)；其後重送為 nSame', async function() {
        const F = 'appTest-36'
        for (let kt of KTS) {
            let id = kt === 'targets' ? '專案36/legacy/區塊A' : `legacy-36-${kt}`
            let leg = legacyRow(kt, id, F)
            await putRows(kt, [leg])
            let r0 = (await dbRows(kt, F))[0]
            assert.strict.ok(r0 && r0.id === id && !r0.srcKey, `${kt} 前提: 舊式列存在且無 srcKey`)

            //批次內容與舊列相同(僅補 srcKey): 遷移仍計為修改
            let { id: _id, from: _from, userId, timeCreate, userIdUpdate, timeUpdate, ...ext } = leg
            let batch = [{ ...ext, srcKey: id }]
            assert.strict.deepEqual(await okSync(kt, F, batch, `${kt} 遷移`), cnt(0, 1, 0, 0), `${kt} 遷移列計入 nUpdate`)
            let rows = await dbRows(kt, F)
            assert.strict.equal(rows.length, 1, `${kt} 不得新增另一列(視為同一列)`)
            assert.strict.equal(rows[0].id, id, `${kt} id 不變`)
            assert.strict.equal(rows[0].srcKey, id, `${kt} 已補上 srcKey`)
            assert.strict.equal(rows[0].timeCreate, leg.timeCreate, `${kt} 建立時間保留`)
            assert.strict.equal(rows[0].userId, leg.userId, `${kt} 建立者保留`)

            //其後只認 srcKey: 重送 nSame、零寫入
            let snap = await snapOf(kt, F)
            assert.strict.deepEqual(await okSync(kt, F, batch, `${kt} 遷移後重送`), cnt(0, 0, 0, 1))
            assert.strict.equal(await snapOf(kt, F), snap, `${kt} 重送後全列不變`)
        }
    })

    it('API-sync-037-migrate-legacy-row-unmatched-deleted：既有無 srcKey 之外部列，批次 srcKey 不等於任何舊 id → 舊列刪除(引用連帶清理)、新列配新 id', async function() {
        const F = 'appTest-37'
        const H = 'appTest-37h'
        await putRows('grups', [legacyRow('grups', 'legacy-37-g', F, { name: 'Leg37G' })])
        assert.strict.deepEqual(await okSync('users', H, [MK.users('sk37-u', { cgrups: JSON.stringify({ Leg37G: ON }) })], 'users(引用端)'), cnt(1, 0, 0, 0))

        assert.strict.deepEqual(await okSync('grups', F, [MK.grups('sk37-new', { name: 'New37G' })], '對不上舊 id'), cnt(1, 0, 1, 0))
        let rs = await dbRows('grups', F)
        assert.strict.deepEqual(rs.map((v) => v.srcKey), ['sk37-new'], '舊列已刪、新列已增')
        assert.strict.ok(UUID_RE.test(rs[0].id) && rs[0].id !== 'legacy-37-g', '新列配新 id')
        let u = (await bySrc('users', H))['sk37-u']
        assert.strict.deepEqual(JSON.parse(u.cgrups), {}, '被刪舊列之引用應連帶清理')
    })

    //spec 第 5 節 4：庫內同範圍有重複 srcKey，或同一 srcKey 被兩個庫內列主張(一個已有 srcKey、一個以 id 主張) → 無法唯一配對，整批拒收 srcKeyConflict(提示人工處置)、零寫入
    it('API-sync-038-srcKey-conflict-in-db-rejected：庫內同 from 有重複 srcKey、或同一 srcKey 被兩個庫內列主張 → srcKeyConflict，整批拒收、四表逐位元不變', async function() {
        const F = 'appTest-38'
        const G = 'appTest-38b'
        //(a) 庫內重複 srcKey
        await putRows('users', [legacyRow('users', 'c38-1', F, { srcKey: 'dup38' }), legacyRow('users', 'c38-2', F, { srcKey: 'dup38' })])
        await expectReject('users', { from: F, rows: [MK.users('dup38', ov('users', 'n38a'))] }, 'srcKeyConflict', '庫內重複 srcKey')
        await expectReject('users', { from: F, rows: [MK.users('other38', ov('users', 'n38b'))] }, 'srcKeyConflict', '庫內重複 srcKey(批次與之無關亦拒)')

        //(b) 同一 srcKey 被兩個庫內列主張: 列 X 已有 srcKey 'claim38'，列 Y 無 srcKey 而其 id＝'claim38'
        await putRows('users', [legacyRow('users', 'c38-x', G, { srcKey: 'claim38' }), legacyRow('users', 'claim38', G)])
        await expectReject('users', { from: G, rows: [MK.users('claim38', ov('users', 'n38c'))] }, 'srcKeyConflict', '同一 srcKey 被兩列主張')
        assert.strict.deepEqual((await dbRows('users', G)).map((v) => v.id).sort(), ['c38-x', 'claim38'], 'G 之兩列原樣保留')
    })

    //全專案規則: 系統回應使用者之文字訊息須有 key 與對應語系文字(server/procLang.mjs, eng + cht)；外部匯入新增之固定錯誤鍵亦然
    it('API-sync-039-new-error-keys-have-lang-text：idNotAllowed／srcKeyInvalid／srcKeyDuplicate／srcKeyConflict 皆有 eng 與 cht 文字', async function() {
        let lang = procLang({})
        for (let key of ['idNotAllowed', 'srcKeyInvalid', 'srcKeyDuplicate', 'srcKeyConflict']) {
            assert.strict.ok(typeof lang.eng[key] === 'string' && lang.eng[key].length > 0, `procLang.eng 須有 ${key}`)
            assert.strict.ok(typeof lang.cht[key] === 'string' && lang.cht[key].length > 0, `procLang.cht 須有 ${key}`)
        }
    })

})
