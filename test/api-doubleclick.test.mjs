//api-doubleclick：perm 4 個寫入 RPC 之後端雙擊防護與並行序列化回歸測試（純 API 契約測試，無 Playwright、無瀏覽器）。
//
//命名沿革（2026-09-28）：原檔名 e2e-doubleclick.test.mjs；依全域規範 §16.3（e2e- 前綴須真瀏覽器 act/assert，
//api- 前綴為直打 HTTP/RPC，不經 UI）改名 api-doubleclick.test.mjs；w-web-sso 同類檔已依其 J-1 裁決同名為
//test/api-doubleclick.test.mjs。spec/設計要點與取捨.md ADR-017 原第 1 點「因需真實後端而歸 e2e」之理由不成立
//（api- 層同樣接真實後端，見該 ADR 文末 Update）。
//
//對應 server/procCore.mjs 之 updateTabItems()，其寫入由外而內兩層（spec/設計要點與取捨.md ADR-025、ADR-012）：
//  ① lockSave(`updateTabItems:${keyTable}`, 操作者 id, …)（server/lockSave.mjs，cacheSt 原子占位）：同一操作者之同表寫入處理中
//     再送出 → reject 'saveInProgress'（不排隊）；
//  ② kmx('updateTabItems:'+keyTable, …)（pmKeyMutex 單例，建立於 server/WWebPerm.mjs 並傳入 procCore）：不同操作者之同表並行寫入
//     「序列化」、不同表並行；
//  另於 kmx 內 select 之後：前端標為新增（transient _isNew）之列 id 已存在 → reject 'saveNewRowExists'（擋依序重送；pickKeysOnly 模式不檢查）。
//
//【契約】
//  DC-01～04（ADR-012，2026-09-29 起改兩位不同操作者）：perm 為「整表 diff」，每位操作者各送一份「完整 rows 快照」，server 把整表推成
//  該快照。兩位操作者並行各帶自己的完整快照，mutex 序列化使兩份快照「依序、各自原子地」套用——兩次皆 success、終態必為「其中
//  一份完整快照」，絕不會出現「A 的 del 與 B 的 add 交錯」的損毀中間態（lost-update / 半套用 / 重複 insert）。
//  原以同一 TOKEN_ADMIN 並行兩次；ADR-025 起同一操作者之並行第 2 次改回 saveInProgress，故改由兩位操作者保留本契約。
//  DC-05／06（ADR-025，四表各一案）：同一操作者送同一包「含 _isNew 新列」——並行時 1 成功 1 拒絕（拒絕 key 為 saveInProgress 或
//  saveNewRowExists，視兩請求是否重疊而定）、依序時第 2 次 saveNewRowExists；兩者皆斷言新列之建立者／建立時間為伺服器於新增時
//  填入之值（非前端佔位字）且只 1 筆。兩請求是否重疊取決於時序，故只斷言與時序無關之不變式（占位與新增列檢查之判定邏輯另由
//  unit-lockSave、unit-procCore-updateTabItems 以受控順序驗證）。
//
//【第二位操作者】沿用既有測試權杖 TOKEN_APP（'{token-for-application}'，srv.mjs 開發樣本：getUserByToken → id 'id-for-application'、
//  isAdmin 'y'），不新增權杖。資料通道（verifyConn → getAndVerifyClientUser）須該 id（mappingBy 預設 'id'）於 perm users 表且
//  isActive='y'、isAdmin='y'（verifyClientUser 讀 perm 列），故 before 以 TOKEN_ADMIN 之 updateUsers 插入 OP_B 列（from＝FROM_DC）；
//  users 表之案例基底（caseBase.users）＝ base seed ＋ OP_B 列，快照一律含之。after 以 base seed 還原（移除 OP_B 列），另以
//  delAll({from}) 兜底——OP_B 列若殘留，api-verifyConn-auth「TOKEN_APP 走 client 通道應拒」會失敗。
//
//act＝以 Promise.allSettled 並行打 2 次（或依序 2 次）同表寫入 RPC；assert 走 DB 終態（g_mOrm 唯讀 select）+ RPC 回傳。
//callRpc 改自 test/tools/api-setup.mjs import（2026-09-28 收斂；本檔原一份局部實作，與共用版邏輯僅差 raw／
//output 欄位及 reject 訊息格式化細節，本檔皆未斷言其內容，換 import 後斷言不受影響，回歸測試已過）。
//RPC 為 stateless POST {apiBaseUrl}/api/main（obj2u8arr 編碼，見 api-setup.mjs），非常駐連線，無 force-exit 顧慮；
//lifecycle 對稱沿用 e2e-setup 的 startServersOnce↔cleanup（mocha root after hook 殺 backend）。
//本檔無 --baseline / 無 pixel 截圖（純並行序列化驗證）；因無瀏覽器/UI 終態、不再匹配 run-e2e-isolated.mjs 之
//`e2e-*.test.mjs` 樣式，故不納入逐檔隔離 runner，改與其餘 api-*/unit-* 共用同一後端、由 `npm test` 涵蓋。

import assert from 'assert'
import { startServersOnce, cleanup } from './tools/e2e-setup.mjs'
import { callRpc, TOKEN_ADMIN, TOKEN_APP } from './tools/api-setup.mjs'


//操作者 id（getUserIdByToken 取外部 getUserByToken 之 id，見 srv.mjs）
const OP_A_ID = 'id-for-admin' //TOKEN_ADMIN('sys')
const OP_B_ID = 'id-for-application' //TOKEN_APP

//本檔插入之測試資料之 from（OP_B 列）
const FROM_DC = 'apiDoubleclick'

//前端新列之佔位字（清單頁 addItem / copyItem 把 userId / timeCreate / userIdUpdate / timeUpdate 設為 `{${$t('xxxAddIdNew')}}`）
const PH = '{新增}'

const RPC = {
    users: { fn: 'updateUsers', key: 'id' },
    grups: { fn: 'updateGrups', key: 'name' },
    pemis: { fn: 'updatePemis', key: 'name' },
    targets: { fn: 'updateTargets', key: 'id' },
}

//OP_B 之 perm users 列（isAdmin='y' 始過 verifyClientUser；isActive='y' 始過 getTokenUser 反查）
const OP_B_ROW = { id: OP_B_ID, order: 99, name: 'application', email: 'application@example.com', description: '', from: FROM_DC, cgrups: '{}', isAdmin: 'y', isActive: 'y' }


//callRpc 已改自 test/tools/api-setup.mjs import（見檔頭 import 清單與檔頭說明），本檔不再自留副本。

function summarize(results) {
    let successCount = 0, errorCount = 0, msgs = []
    for (let r of results) {
        if (r.status !== 'fulfilled') { errorCount++; msgs.push(`unfulfilled: ${String(r.reason)}`); continue }
        if (r.value.ok) successCount++
        else { errorCount++ }
        msgs.push(r.value.msg)
    }
    return { successCount, errorCount, msgs }
}

//唯讀讀整張表
let _woItems = null
async function getTables() {
    if (!_woItems) { const m = await import('../g_mOrm.mjs'); _woItems = m.woItems }
    return _woItems
}
async function readTable(keyTable) {
    return await (await getTables())[keyTable].select()
}


//base seed 快照（before 擷取一次，未含 OP_B 列）：after 以此還原各表。
let baseSeed = { users: null, grups: null, pemis: null, targets: null }

//案例基底：users ＝ base seed ＋ OP_B 列（第二位操作者須在表內），其餘表 ＝ base seed。每 case 前以此經 RPC 復原該表，確保隔離。
function caseBase(keyTable) {
    if (keyTable === 'users') {
        return [...baseSeed.users.map((v) => ({ ...v })), { ...OP_B_ROW }]
    }
    return baseSeed[keyTable].map((v) => ({ ...v }))
}

async function restoreRows(keyTable, rows) {
    let res = await callRpc(RPC[keyTable].fn, [rows], TOKEN_ADMIN)
    assert.strict.ok(res.ok, `restore(${keyTable}) 應成功，實得: ${JSON.stringify(res)}`)
}

//以案例基底為基礎產生「整表快照 + 追加一列新 row」（新 row 的 key 由 newRow[keyField] 決定）。
function snapshotPlus(base, newRow) {
    return [...base.map((v) => ({ ...v })), newRow]
}

//斷言「無損毀中間態」：終態必等於兩份候選快照其中一份的 key 集合（序列化原子性），且無重複 key。
function assertOneOfSnapshots(keyField, after, candidateKeySetsByName) {
    let afterKeys = after.map((v) => v[keyField])
    //無重複 key（無重複 insert）
    assert.strict.equal(new Set(afterKeys).size, afterKeys.length,
        `終態 ${keyField} 不應有重複（無重複 insert），實得: ${JSON.stringify(afterKeys)}`)

    let afterSorted = JSON.stringify([...afterKeys].sort())
    let matched = null
    for (let [name, set] of Object.entries(candidateKeySetsByName)) {
        if (JSON.stringify([...set].sort()) === afterSorted) { matched = name; break }
    }
    assert.strict.ok(matched !== null,
        `終態 ${keyField} 集合應「完整等於」其中一份送入快照（序列化原子、無半套用/lost-update）；` +
        `實得 ${afterSorted}，候選: ${JSON.stringify(candidateKeySetsByName, (k, v) => v instanceof Array ? v : v)}`)
    return matched
}


//newRowIsNew：模擬清單頁 addItem 送出之新列（前端 funNew 之 id、稽核欄位為佔位字、transient _isNew，對齊 LayoutContent*.vue addItem）
function newRowIsNew(keyTable, tag) {
    let common = { order: 0, description: '', from: 'dcTest', userId: PH, timeCreate: PH, userIdUpdate: PH, timeUpdate: PH, _isNew: true }
    if (keyTable === 'users') {
        return { ...common, id: `id-dc${tag}-user`, name: `dcUser${tag}`, email: `dc${tag}-user@example.com`, cgrups: '{}', isAdmin: 'n', isActive: 'y' }
    }
    if (keyTable === 'grups') {
        return { ...common, id: `id-dc${tag}-grup`, name: `dcGrupNew${tag}`, cpemis: '{}' }
    }
    if (keyTable === 'pemis') {
        return { ...common, id: `id-dc${tag}-pemi`, name: `dcPemiNew${tag}`, crules: '{}' }
    }
    return { ...common, id: `專案DC/頁/新增${tag}` } //targets 之 id 為標的路徑
}

//assertNewRowIntact：新列只 1 筆，且伺服器於新增時填入之建立者 / 建立時間未被第 2 次送出之佔位字覆寫；回傳該列供前後比對
async function assertNewRowIntact(keyTable, nr) {
    let rs = (await readTable(keyTable)).filter((v) => v.id === nr.id)
    assert.strict.equal(rs.length, 1, `${keyTable} 新列應只 1 筆，實得 ${rs.length}`)
    let r = rs[0]
    assert.strict.equal(r.userId, OP_A_ID, `${keyTable} 建立者應為送出之操作者 ${OP_A_ID}，實得「${r.userId}」（佔位字即被第 2 次覆寫）`)
    assert.strict.equal(typeof r.timeCreate === 'string' && r.timeCreate !== '' && r.timeCreate !== PH, true, `${keyTable} 建立時間不得為空或前端佔位字，實得「${r.timeCreate}」`)
    assert.strict.equal('_isNew' in r, false, `${keyTable} transient _isNew 不得入庫`)
    return r
}


describe('doubleclick API E2E — perm 寫入 RPC 之雙擊防護與並行序列化（無 lost-update）', function() {
    this.timeout(120000)

    before(async function() {
        this.timeout(200000)
        await startServersOnce({ backendOnly: true })
        for (let kt of ['users', 'grups', 'pemis', 'targets']) {
            baseSeed[kt] = await readTable(kt)
        }
        //前次中斷而殘留之 OP_B 列不屬 base seed（否則 caseBase 內 id / email 重複，且 after 還原後仍殘留）
        baseSeed.users = baseSeed.users.filter((v) => v.id !== OP_B_ID && v.from !== FROM_DC)
        //前置：插入第二位操作者（OP_B）之 perm users 列，並確認其 token 可走 client 通道
        await restoreRows('users', caseBase('users'))
        let probe = await callRpc('getWebInfor', [], TOKEN_APP)
        assert.strict.ok(probe.ok, `前置: 第二位操作者 TOKEN_APP 應可走資料通道（OP_B 列已插入），實得 ${JSON.stringify(probe)}`)
    })


    //共用 case 骨架：兩位不同操作者並行 2 次同表寫入，各帶「案例基底 + 各自一列新 row」之完整快照。
    //序列化後終態必為其中一份完整快照（含 A-only 或 B-only 的新列），絕不同時含兩列、亦不損毀既有列。
    async function runConcurrentCase(keyTable, rowA, rowB) {
        let cfg = RPC[keyTable]
        await restoreRows(keyTable, caseBase(keyTable))
        let base = await readTable(keyTable)
        let baseKeys = base.map((v) => v[cfg.key])

        let snapA = snapshotPlus(base, rowA)
        let snapB = snapshotPlus(base, rowB)

        //並行打 2 次（兩位不同操作者各自完整快照）
        let results = await Promise.allSettled([
            callRpc(cfg.fn, [snapA], TOKEN_ADMIN),
            callRpc(cfg.fn, [snapB], TOKEN_APP),
        ])
        let { successCount, errorCount, msgs } = summarize(results)

        //契約 1：兩次皆為合法整表寫入 → 序列化後皆 success（不同操作者之占位互不影響，無 saveInProgress）
        assert.strict.equal(successCount, 2,
            `預期兩次並行寫入皆 success（兩位操作者、mutex 序列化，皆為合法整表寫入），實得 success=${successCount} error=${errorCount} msgs=${JSON.stringify(msgs)}`)

        //契約 2：DB 終態 == 其中一份完整快照（原子、無半套用/lost-update/重複 insert）
        let after = await readTable(keyTable)
        let candidates = {
            snapA: [...baseKeys, rowA[cfg.key]],
            snapB: [...baseKeys, rowB[cfg.key]],
        }
        let matched = assertOneOfSnapshots(cfg.key, after, candidates)

        //契約 3：既有 base 列全數保留（未被任一並行寫入損毀）
        for (let bk of baseKeys) {
            assert.strict.ok(after.some((v) => v[cfg.key] === bk), `base 既有 ${cfg.key}=${bk} 應仍存在（未被損毀）`)
        }

        //契約 4：終態筆數 = base + 1（恰好一份快照之新列被反映）
        assert.strict.equal(after.length, base.length + 1,
            `終態筆數應為 base+1（恰一份快照之新列），實得 ${after.length}（base ${base.length}）`)

        return matched
    }


    it('E2E-DC-01-update-users-double：兩位操作者並行 updateUsers 同表 → 序列化、終態為其一快照、無 lost-update', async function() {
        await runConcurrentCase('users',
            { id: 'id-dc-user-a', order: 90, name: 'dcUserA', email: 'dc-user-a@example.com', description: '', from: 'dcTest', cgrups: '{}', isAdmin: 'n', isActive: 'y' },
            { id: 'id-dc-user-b', order: 91, name: 'dcUserB', email: 'dc-user-b@example.com', description: '', from: 'dcTest', cgrups: '{}', isAdmin: 'n', isActive: 'y' },
        )
    })

    it('E2E-DC-02-update-grups-double：兩位操作者並行 updateGrups 同表 → 序列化、終態為其一快照、無 lost-update', async function() {
        await runConcurrentCase('grups',
            { id: 'id-dc-grup-a', order: 90, name: 'dcGrupA', description: 'A', from: 'dcTest', cpemis: '{}' },
            { id: 'id-dc-grup-b', order: 91, name: 'dcGrupB', description: 'B', from: 'dcTest', cpemis: '{}' },
        )
    })

    it('E2E-DC-03-update-pemis-double：兩位操作者並行 updatePemis 同表 → 序列化、終態為其一快照、無 lost-update', async function() {
        await runConcurrentCase('pemis',
            { id: 'id-dc-pemi-a', order: 90, name: 'dcPemiA', description: 'A', from: 'dcTest', crules: '{}' },
            { id: 'id-dc-pemi-b', order: 91, name: 'dcPemiB', description: 'B', from: 'dcTest', crules: '{}' },
        )
    })

    it('E2E-DC-04-update-targets-double：兩位操作者並行 updateTargets 同表 → 序列化、終態為其一快照、無 lost-update', async function() {
        await runConcurrentCase('targets',
            { id: '專案DC/頁/區塊A', order: 90, description: 'A', from: 'dcTest' },
            { id: '專案DC/頁/區塊B', order: 91, description: 'B', from: 'dcTest' },
        )
    })


    // ===================================================================
    // DC-05／06：同一操作者之雙擊防護 (ADR-025)
    //   後端以「updateTabItems:{表名}:{操作者 id}」原子占位(server/lockSave.mjs)：同一操作者之同表寫入處理中再送出 → reject 'saveInProgress'；
    //   新增列標記(_isNew)擋依序重送 → reject 'saveNewRowExists'。四表各一案(比對鍵 users / targets 為 id、grups / pemis 為 name)。
    // ===================================================================

    for (let keyTable of ['users', 'grups', 'pemis', 'targets']) {

        it(`E2E-DC-05-${keyTable}-new-row-double-same-operator：同一操作者並行 2 次同一包「含 _isNew 新列」之 ${RPC[keyTable].fn} → 1 成功 1 拒絕，新列未被覆寫`, async function() {
            let cfg = RPC[keyTable]
            await restoreRows(keyTable, caseBase(keyTable))
            let base = await readTable(keyTable)
            let nr = newRowIsNew(keyTable, '05')
            let rows = [nr, ...base.map((v) => ({ ...v }))] //前端新列加在最首

            let results = await Promise.allSettled([
                callRpc(cfg.fn, [rows], TOKEN_ADMIN),
                callRpc(cfg.fn, [rows], TOKEN_ADMIN),
            ])
            let { successCount, errorCount, msgs } = summarize(results)

            //驗證 1：一成功一拒絕；拒絕為「處理中」(兩次重疊) 或「新增列已存在」(第 2 次於第 1 次完成後才處理)，視時序而定
            assert.strict.equal(successCount, 1, `預期 1 次成功，實際 ${successCount}，msgs=${JSON.stringify(msgs)}`)
            assert.strict.equal(errorCount, 1, `預期 1 次拒絕，實際 ${errorCount}，msgs=${JSON.stringify(msgs)}`)
            let errMsg = results.map((r) => r.value).find((v) => !v.ok).msg
            assert.strict.equal(['saveInProgress', 'saveNewRowExists'].includes(errMsg), true, `拒絕之 key 應為 saveInProgress 或 saveNewRowExists，實際: ${errMsg}`)

            //驗證 2：新列只 1 筆、未被第 2 次覆寫（修正前：第 2 次把建立者 / 建立時間寫成前端佔位字）
            await assertNewRowIntact(keyTable, nr)
            let after = await readTable(keyTable)
            assert.strict.equal(after.length, base.length + 1, `${keyTable} 終態筆數應為 base+1，實得 ${after.length}（base ${base.length}）`)
        })

        it(`E2E-DC-06-${keyTable}-new-row-resend-same-operator：同一操作者依序 2 次同一包「含 _isNew 新列」之 ${RPC[keyTable].fn} → 第 2 次 saveNewRowExists，新列未被覆寫`, async function() {
            let cfg = RPC[keyTable]
            await restoreRows(keyTable, caseBase(keyTable))
            let base = await readTable(keyTable)
            let nr = newRowIsNew(keyTable, '06')
            let rows = [nr, ...base.map((v) => ({ ...v }))]

            let r1 = await callRpc(cfg.fn, [rows], TOKEN_ADMIN)
            assert.strict.equal(r1.ok, true, `第 1 次應成功，實際 ${JSON.stringify(r1)}`)
            let after1 = await assertNewRowIntact(keyTable, nr)

            let r2 = await callRpc(cfg.fn, [rows], TOKEN_ADMIN)
            assert.strict.equal(r2.ok, false, `第 2 次應被拒絕，實際 ${JSON.stringify(r2)}`)
            assert.strict.equal(r2.msg, 'saveNewRowExists', `第 2 次之 key 應為 saveNewRowExists，實際: ${r2.msg}`)

            let after2 = await assertNewRowIntact(keyTable, nr)
            assert.strict.deepEqual(after2, after1, `${keyTable} 新列不得被第 2 次寫入改動`)
        })

    }


    //收尾：所有表復原 base seed（users 之 OP_B 列一併移除）；OP_B 列若仍殘留（如 users 還原失敗）以 delAll({from}) 兜底
    after(async function() {
        this.timeout(60000)
        for (let kt of ['users', 'grups', 'pemis', 'targets']) {
            if (baseSeed[kt]) await restoreRows(kt, baseSeed[kt].map((v) => ({ ...v })))
        }
        let us = await readTable('users')
        if (us.some((v) => v.from === FROM_DC)) {
            await (await getTables()).users.delAll({ from: FROM_DC })
        }
    })

})

//cleanup 由 e2e-setup 之 mocha root after() 觸發；本檔無直跑 baseline 入口。
void cleanup
