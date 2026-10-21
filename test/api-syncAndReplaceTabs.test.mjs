//syncAndReplaceTabs API 契約測試。對應 spec/流程_外部應用同步權限資料.md。
//
//端點：POST /syncAndReplaceTabs?keyTable={keyTable}&token={token}（根路徑、無 /api 前綴，WWebPerm.mjs:1056 自訂 route）。
//以內建 fetch 直打真實 HTTP，回應 JSON 即後端 pmConvertResolve 包裝的 { state, msg } envelope（HTTP 200；
//reject → {state:'error', msg:<純字串>}，resolve → {state:'success', msg:<insert 結果>}）。
//本 API **會寫 DB**（全量取代：同 from 先 delAll 再 insert）。
//
//【測試隔離策略】每個 case 用**自己獨立的 from（'appTest-N'）**，不撞 base seed 的 ''（admin/grups/pemis/targets）
//與 'teamA'（peter/mary/john）、也互不干擾。成功案例的 full-replace 本身會先 delAll(該 from) 自清，故 case 間
//無需額外 clearFrom（且 backend 對空 rows 會拒、無法用 rows:[] 清——見下 DISCREPANCY）。每次 mocha run 由
//startApi→seedDb 重建 base seed、run 結束 mocha root after 殺 backend，故跨 run 亦 hermetic。
//DB 斷言一律 getWoItems() 後**唯讀** select（跨進程唯讀實測可行；絕不在測試進程寫 DB，寫一律走 backend HTTP）。
//
//reject 的 msg 為 procLang 語系鍵（皆純字串，非 Error；handler core() 各檢查以 Promise.reject 短路；
//  2026-10-21 run03 校正: 原註記為英文訊息與行號，現碼皆為語系鍵，位置改以符號錨標示）：
//  syncAndReplaceTabs handler 缺 token / 缺 keyTable（query 取不到）                 → 'tokenNoPermission'
//  syncAndReplaceTabs handler keyTable 不在白名單 ['targets','pemis','grups','users'] → 'invalidKeyTable'
//  getAndVerifyAppUser         token 非空但無效（getUserByToken 回 {} → !iseobj）    → 'cannotFindUserFromToken'
//  parsePayload                payload 非物件                                        → 'invalidPayload'
//  parsePayload                payload.from 非有效字串                               → 'invalidFromInPayload'
//  parsePayload                payload.rows 非「非空陣列」（isearr）                 → 'invalidRowsInPayload'
//
//全量取代 + 稽核欄位自動補入已 Read 確認：syncAndReplaceTabs 內 delAll({from}) → procOrm(userId,keyTable,'insert',rows)；
//  procOrm insert 自動補 userId(=token 對應 user.id='id-for-application')/timeCreate/...；sync 路徑用 ltdtmapping+insert
//  （非 funNew），故 payload 的 id(pk) 原樣保留。

import assert from 'assert'
import { startApi, urlSync, TOKEN_APP, TOKEN_BAD, SEED, getWoItems } from './tools/api-setup.mjs'


//postSync：以 node 內建 fetch 直打該 keyTable + token（本套件 2026-09-07 起不再依賴 axios），回 {state, msg} envelope。
//body 為物件時 JSON 化（對齊原 axios 自動 stringify）；字串則原樣送出（供 text/plain 非物件 payload 案例）。
let postSync = async (keyTable, token, body, contentType = 'application/json; charset=utf-8') => {
    let url = urlSync.replace('{keyTable}', keyTable).replace('{token}', token)
    let res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': contentType },
        body: (typeof body === 'string') ? body : JSON.stringify(body),
    })
    return await res.json()
}


describe('api-syncAndReplaceTabs', function() {
    this.timeout(120000)

    before(async function() {
        this.timeout(200000)
        await startApi()
    })

    //本檔 per-case 清理：各成功案例（appTest-1 users、appTest-6 targets、appTest-2 grups 等）寫入 DB 後，
    //  原僅倚賴下次 fresh spawn 之 seedDb 重建 base seed 自動移除；但 backend 被 reuse（已啟動）時不重 seed，
    //  appTest-N 列會殘留 → 污染同進程其他唯讀斷言（如 api-getPerm T28 以 targets 總數斷言）。
    //  後端 sync 路徑無法以空 rows 清源（isearr 安全閘拒空陣列，WWebPerm.mjs:683），故直接以 woItems.delAll({from})
    //  刪除本檔用到的每個 appTest-N 分區列（delAll 同 backend 全量取代所用之刪除機制，WWebPerm.mjs:736）。
    //  僅刪本檔特化之 appTest from，base seed（from='' / 'teamA'）不動。
    after(async function() {
        this.timeout(60000)
        let woItems = await getWoItems()
        let froms = ['appTest-1', 'appTest-2', 'appTest-3', 'appTest-4', 'appTest-5', 'appTest-6', 'appTest-7', 'appTest-8', 'appTest-9', 'appTest-10', 'appTest-11', 'appTest-11b', 'appTest-12', 'appTest-13', 'appTest-14', 'appTest-15', 'appTest-16', 'appTest-17', 'appTest-18', 'appTest-19', 'appTest-20', 'appTest-21', 'appTest-22', 'appTest-23', 'appTest-24', 'appTest-24b', 'appTest-25', 'appTest-26', 'appTest-27', 'appTest-27b']
        for (let kt of ['users', 'grups', 'pemis', 'targets']) {
            for (let from of froms) {
                await woItems[kt].delAll({ from })
            }
        }
    })

    //對應 spec E2E-001：以 app token 全量取代某 from 分區的 users —— 先推一筆舊資料、再推新批，舊批應被整批替換，
    //base seed 其他分區（teamA 的 peter/mary/john）不受影響，新列稽核欄位由後端自動補入。
    it('API-sync-001-success-replace-users', async function() {
        const F = 'appTest-1'

        //先推一筆舊 user（建立可被取代的舊狀態；非空 rows）
        let resOld = await postSync('users', TOKEN_APP, {
            from: F,
            rows: [{ id: 'id-app-olduser', order: 0, name: 'oldUser', email: 'olduser@appTest.com', from: F, cgrups: '{}', isAdmin: 'n', isActive: 'y' }],
        })
        assert.strict.equal(resOld.state, 'success', `舊批推送應成功，實得: ${JSON.stringify(resOld)}`)

        //再推新批兩筆（全量取代：delAll(F) 後 insert）
        let newRows = [
            { id: 'id-app-u1', order: 0, name: 'appUser1', email: 'appuser1@appTest.com', from: F, cgrups: '{}', isAdmin: 'n', isActive: 'y' },
            { id: 'id-app-u2', order: 1, name: 'appUser2', email: 'appuser2@appTest.com', from: F, cgrups: '{}', isAdmin: 'n', isActive: 'y' },
        ]
        let resNew = await postSync('users', TOKEN_APP, { from: F, rows: newRows })
        assert.strict.equal(resNew.state, 'success', `新批推送應成功，實得: ${JSON.stringify(resNew)}`)

        //DB 唯讀核對：同 from 全刪後 insert，舊列不存在＝全量取代
        let woItems = await getWoItems()
        let rowsApp = await woItems.users.select({ from: F })
        assert.strict.equal(rowsApp.length, 2, `${F} 分區應只剩新批 2 筆，實得 ${rowsApp.length}`)
        assert.strict.deepEqual(rowsApp.map((v) => v.id).sort(), ['id-app-u1', 'id-app-u2'], '分區 id 應為新批兩筆（id 由 payload 原樣保留）')
        assert.strict.deepEqual(rowsApp.map((v) => v.name).sort(), ['appUser1', 'appUser2'], '分區 name 應為新批兩筆')
        assert.strict.ok(rowsApp.every((v) => v.id !== 'id-app-olduser'), '舊列 olduser 應已被全量取代移除')

        //稽核欄位由後端自動補入：userId=app 使用者 id、timeCreate 非空
        for (let v of rowsApp) {
            assert.strict.equal(v.userId, 'id-for-application', 'userId 應補為 app token 對應使用者 id')
            assert.strict.ok(typeof v.timeCreate === 'string' && v.timeCreate.length > 0, 'timeCreate 應由後端自動補為非空字串')
        }

        //base seed 其他分區不受影響（teamA：peter/mary/john 仍 3 筆）
        let rowsTeamA = await woItems.users.select({ from: 'teamA' })
        assert.strict.equal(rowsTeamA.length, 3, 'teamA 分區（peter/mary/john）應仍為 3 筆，不受 appTest 同步影響')
    })

    //對應 spec E2E-002（已更新對齊現狀，決定保留 isearr 安全閘）：
    //  推送空 rows（rows:[]）被後端 parsePayload 的 isearr 非空檢查拒絕，
    //  回 state='error'、msg 含語系鍵 'invalidRowsInPayload'，未進 delAll，故不支援「以空集合清源」。
    //  此 isearr 檢查為「防外部應用誤送空陣列而整批清空資料」之安全閘。
    it('API-sync-002-empty-rows-rejected', async function() {
        const F = 'appTest-2'

        //先推兩筆 grups（建立非空狀態，驗證「即使分區非空，空 rows 仍被拒、不會清空」）
        let resSeed = await postSync('grups', TOKEN_APP, {
            from: F,
            rows: [
                { id: 'id-app-g1', order: 0, name: 'appGrup1', description: 'g1', from: F, cpemis: '{}' },
                { id: 'id-app-g2', order: 1, name: 'appGrup2', description: 'g2', from: F, cpemis: '{}' },
            ],
        })
        assert.strict.equal(resSeed.state, 'success', `grups 預置推送應成功，實得: ${JSON.stringify(resSeed)}`)

        //spec E2E-002：以空 rows 推送 → 被拒（不支援以空集合清源）
        let resEmpty = await postSync('grups', TOKEN_APP, { from: F, rows: [] })
        assert.strict.equal(resEmpty.state, 'error', `空 rows 應被拒（state='error'），實得: ${JSON.stringify(resEmpty)}`)
        assert.strict.ok(String(resEmpty.msg).includes('invalidRowsInPayload'), `msg 應為 err key 'invalidRowsInPayload'，實得: ${resEmpty.msg}`)

        //spec E2E-002：因被拒、未進入 delAll，先前兩筆 grups 仍在（未被清空）
        let woItems = await getWoItems()
        let rowsApp = await woItems.grups.select({ from: F })
        assert.strict.equal(rowsApp.length, 2, '空 rows 被拒，分區未被清空，仍為先前 2 筆')

        //base seed grups（from=''）不受影響
        let rowsBase = await woItems.grups.select({ from: '' })
        assert.strict.equal(rowsBase.length, SEED.grupCount, `base seed grups（from=''）應仍為 ${SEED.grupCount} 筆`)
    })

    //對應 spec E2E-003：無效 token 於 token 守門階段被拒（getAndVerifyAppUser），不進入全量取代、不寫 DB。
    it('API-sync-003-bad-token-reject-no-write', async function() {
        const F = 'appTest-3'

        let res = await postSync('users', TOKEN_BAD, {
            from: F,
            rows: [{ id: 'id-app-bad', order: 0, name: 'badTokenUser', email: 'bad@appTest.com', from: F, cgrups: '{}', isAdmin: 'n', isActive: 'y' }],
        })
        assert.strict.equal(res.state, 'error', `無效 token 應回 state='error'，實得: ${JSON.stringify(res)}`)
        //TOKEN_BAD（非空但無效）→ getUserByToken 回 {} → !iseobj → getAndVerifyAppUser reject err key
        assert.strict.equal(res.msg, 'cannotFindUserFromToken', `reject msg 應為 err key 'cannotFindUserFromToken'，實得: ${res.msg}`)

        //被拒未寫入 —— 該 from 分區為空
        let woItems = await getWoItems()
        let rowsApp = await woItems.users.select({ from: F })
        assert.strict.deepEqual(rowsApp, [], 'token 被拒後分區應無任何寫入（空陣列）')
    })

    //對應 spec E2E-004：keyTable 不在白名單 → 拒絕，四個資料表皆無變動。
    it('API-sync-004-invalid-keyTable-reject', async function() {
        const F = 'appTest-4'

        let res = await postSync('foobar', TOKEN_APP, { from: F, rows: [{ id: 'x', order: 0, from: F }] })
        assert.strict.equal(res.state, 'error', `非白名單 keyTable 應回 state='error'，實得: ${JSON.stringify(res)}`)
        //WWebPerm.mjs invalidKeyTable（keyTable 細節改記 srLog）
        assert.strict.ok(String(res.msg).includes('invalidKeyTable'), `reject msg 應為 err key 'invalidKeyTable'，實得: ${res.msg}`)

        //四個合法表的該 from 分區皆無變動（保持空）
        let woItems = await getWoItems()
        for (let kt of ['users', 'grups', 'pemis', 'targets']) {
            let rows = await woItems[kt].select({ from: F })
            assert.strict.deepEqual(rows, [], `${kt} 的 ${F} 分區應無變動（空陣列）`)
        }
    })

    //對應 spec E2E-005：payload 解析階段（parsePayload）三類無效輸入皆拒絕，且不寫 DB。
    it('API-sync-005-invalid-payload-reject', async function() {
        const F = 'appTest-5'

        //(a) 缺 from → err key invalidFromInPayload
        let resA = await postSync('users', TOKEN_APP, { rows: [{ id: 'x', order: 0, name: 'x', email: 'x@x.com' }] })
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

        //三類無效 payload 皆未寫 DB —— 該 from 分區為空
        let woItems = await getWoItems()
        let rowsApp = await woItems.users.select({ from: F })
        assert.strict.deepEqual(rowsApp, [], '無效 payload 皆不應寫入分區（空陣列）')
    })

    //對應 spec E2E-006：以 app token 全量取代 targets（id 為路徑字串），同 from 先全刪後 insert，DB 反映推送 rows。
    it('API-sync-006-success-replace-targets', async function() {
        const F = 'appTest-6'

        let newRows = [
            { id: '專案X/頁1/區塊A', order: 0, description: '區塊A說明', from: F },
            { id: '專案X/頁1/區塊A/執行按鈕', order: 1, description: '執行按鈕說明', from: F },
            { id: '專案X/頁2/區塊B', order: 2, description: '區塊B說明', from: F },
        ]
        let res = await postSync('targets', TOKEN_APP, { from: F, rows: newRows })
        assert.strict.equal(res.state, 'success', `targets 推送應成功，實得: ${JSON.stringify(res)}`)

        //DB 唯讀核對：該 from 分區等於推送 rows（id 路徑字串原樣保留）
        let woItems = await getWoItems()
        let rowsApp = await woItems.targets.select({ from: F })
        assert.strict.equal(rowsApp.length, newRows.length, `${F} targets 應為 ${newRows.length} 筆，實得 ${rowsApp.length}`)
        assert.strict.deepEqual(rowsApp.map((v) => v.id).sort(), newRows.map((v) => v.id).sort(), '分區 targets 的 id（路徑字串）應與推送 rows 一致')

        //base seed targets（from=''）不受影響，仍 22 筆
        let rowsBase = await woItems.targets.select({ from: '' })
        assert.strict.equal(rowsBase.length, SEED.targetCount, `base seed targets（from=''）應仍為 ${SEED.targetCount} 筆`)
    })


    // ============ 寫入前驗證（ADR-026，規則帳本 R-ORM-01／R-ORM-02；spec 流程_外部應用同步權限資料 E2E-007～009）============
    //修正前：先 delAll({from}) 再 insert，insert 遇可預判之拒絕（主鍵含 HTML 標記、主鍵過長）時該 from 之既有列已全數清空（違反 ADR-008 防誤清源）；
    //非主鍵欄位之標記被靜默改寫為 &lt;；拒絕訊息為 w-serv-orm／LMDB 英文原文（非語系鍵）。

    //ids：該 from 分區之 id（排序）
    let idsOf = async (kt, from) => (await (await getWoItems())[kt].select({ from })).map((v) => v.id).sort()

    it('API-sync-007-markup-id-rejected-rows-kept：主鍵含 HTML 標記 → htmlMarkupNotAllowed，該 from 既有列不變', async function() {
        const F = 'appTest-7'
        let rows0 = [
            { id: '專案Y/頁1/區塊A', order: 0, description: 'A', from: F },
            { id: '專案Y/頁1/區塊B', order: 1, description: 'B', from: F },
        ]
        let res0 = await postSync('targets', TOKEN_APP, { from: F, rows: rows0 })
        assert.strict.equal(res0.state, 'success', `預置應成功，實得: ${JSON.stringify(res0)}`)

        let res = await postSync('targets', TOKEN_APP, { from: F, rows: [{ id: '專案Y/頁1/區塊C', order: 0, description: 'C', from: F }, { id: '專案Y/頁1/a<c', order: 1, description: 'D', from: F }] })
        assert.strict.equal(res.state, 'error', `含標記主鍵應被拒，實得: ${JSON.stringify(res)}`)
        assert.strict.equal(res.msg, 'htmlMarkupNotAllowed', `外部應用應收語系鍵（非 ORM 英文原文），實得: ${res.msg}`)
        assert.strict.deepEqual(await idsOf('targets', F), rows0.map((v) => v.id).sort(), '該 from 之既有列須不變（修正前被清空）')
    })

    it('API-sync-008-markup-field-rejected-rows-kept：非主鍵欄位含 HTML 標記 → htmlMarkupNotAllowed，不靜默改寫、既有列不變', async function() {
        const F = 'appTest-8'
        let rows0 = [{ id: 'id-app8-g1', order: 0, name: 'app8Grup1', description: 'g1', from: F, cpemis: '{}' }]
        let res0 = await postSync('grups', TOKEN_APP, { from: F, rows: rows0 })
        assert.strict.equal(res0.state, 'success', `預置應成功，實得: ${JSON.stringify(res0)}`)

        let res = await postSync('grups', TOKEN_APP, { from: F, rows: [{ id: 'id-app8-g2', order: 0, name: 'app8Grup2', description: 'x<y', from: F, cpemis: '{}' }] })
        assert.strict.equal(res.state, 'error', `含標記之欄位應被拒（修正前存為 x&lt;y），實得: ${JSON.stringify(res)}`)
        assert.strict.equal(res.msg, 'htmlMarkupNotAllowed')
        let rs = await (await getWoItems()).grups.select({ from: F })
        assert.strict.deepEqual(rs.map((v) => [v.id, v.description]), [['id-app8-g1', 'g1']], '該 from 之既有列須不變')
    })

    it('API-sync-009-long-id-rejected-rows-kept：主鍵 UTF-8 超過 1978 位元組 → invalidRows，該 from 既有列不變', async function() {
        const F = 'appTest-9'
        let rows0 = [{ id: 'id-app9-u1', order: 0, name: 'app9User1', email: 'app9user1@appTest.com', from: F, cgrups: '{}', isAdmin: 'n', isActive: 'y' }]
        let res0 = await postSync('users', TOKEN_APP, { from: F, rows: rows0 })
        assert.strict.equal(res0.state, 'success', `預置應成功，實得: ${JSON.stringify(res0)}`)

        let longId = 'U' + 'x'.repeat(1978) //1979 B
        let res = await postSync('users', TOKEN_APP, { from: F, rows: [{ id: longId, order: 0, name: 'app9User2', email: 'app9user2@appTest.com', from: F, cgrups: '{}', isAdmin: 'n', isActive: 'y' }] })
        assert.strict.equal(res.state, 'error', `過長主鍵應被拒，實得: ${JSON.stringify(res).slice(0, 300)}`)
        assert.strict.equal(res.msg, 'invalidRows', `應回語系鍵 invalidRows，實得: ${String(res.msg).slice(0, 200)}`)
        assert.strict.deepEqual(await idsOf('users', F), ['id-app9-u1'], '該 from 之既有列須不變（修正前被清空）')
    })


    // ============ 數字主鍵與跨來源同鍵（2026-10-14 run05；規則帳本 R-ORM-04、R-SYNC-01；spec 流程_外部應用同步權限資料 E2E-010／E2E-011；依 w-serv-orm 主責 agent 之建議書 3.5-1）============
    //w-serv-orm 1.1.11 起數字主鍵存為其字串形式（123 存為 '123'、回應之 id 為 '123'）；insert 為「主鍵已存在即略過」，
    //他 from 已有之主鍵原本被靜默略過而整批回 success（以流水號為主鍵之各應用因而互撞）→ 改為整批拒絕 invalidRows、兩個 from 皆不變。

    it('API-sync-010-numeric-id-stored-as-string：數字主鍵存為其字串形式、回應 id 為字串、重送不增列', async function() {
        const F = 'appTest-10'
        let row = { id: 1010, order: 0, name: 'app10User1', email: 'app10user1@appTest.com', from: F, cgrups: '{}', isAdmin: 'n', isActive: 'y' }
        let res1 = await postSync('users', TOKEN_APP, { from: F, rows: [row] })
        assert.strict.equal(res1.state, 'success', `應成功，實得: ${JSON.stringify(res1)}`)
        assert.strict.deepEqual(res1.msg, [{ id: '1010' }], '回應之 id 為字串')
        let res2 = await postSync('users', TOKEN_APP, { from: F, rows: [row] })
        assert.strict.equal(res2.state, 'success', `重送應成功，實得: ${JSON.stringify(res2)}`)
        assert.strict.deepEqual(await idsOf('users', F), ['1010'], '庫內以字串存放且重送不增列')
    })

    it('API-sync-011-id-of-other-from-rejected：主鍵已屬其他 from（數字或其字串形式）→ invalidRows，兩個 from 皆不變', async function() {
        const F = 'appTest-11'
        const G = 'appTest-11b'
        let mk = (id, f) => ({ id, order: 0, name: `app11-${f}`, email: `app11-${f}@appTest.com`, from: f, cgrups: '{}', isAdmin: 'n', isActive: 'y' })
        let res0 = await postSync('users', TOKEN_APP, { from: F, rows: [mk(1011, F)] })
        assert.strict.equal(res0.state, 'success', `預置應成功，實得: ${JSON.stringify(res0)}`)
        for (let id of [1011, '1011']) {
            let res = await postSync('users', TOKEN_APP, { from: G, rows: [mk(id, G)] })
            assert.strict.equal(res.state, 'error', `屬其他 from 之主鍵應被拒（修正前回 success 而該列未寫入），實得: ${JSON.stringify(res)}`)
            assert.strict.equal(res.msg, 'invalidRows')
        }
        assert.strict.deepEqual(await idsOf('users', F), ['1011'], '原 from 不變')
        assert.strict.deepEqual(await idsOf('users', G), [], '目標 from 不變')
    })


    // ============ R-OBJ-ITER-01：列物件含數字 length 欄位（2026-10-20，建議書 建議w-web-perm修正.md §1；規則帳本「迭代使用端傳入之物件」）============
    //修正前實測（HEAD 434c0d4，真後端）：含 length 欄位之列已被拒——syncAndReplaceTabs 於 validateRowsBeforeWrite 之前以 ltdtmapping 依 schema 欄位重建列（四表 schema 皆無 length 欄），
    //length 到不了 validateRows；本案為整合面迴歸（函數本身之縱深防禦見 unit-validateRows VR-OI-*）。

    it('API-sync-012-row-with-length-field-markup-rejected-rows-kept：列帶 length 欄位（0、1、2**32-1）且欄位含標記 → htmlMarkupNotAllowed，該 from 既有列不變', async function() {
        const F = 'appTest-12'
        let rows0 = [{ id: '專案Z/頁1/區塊A', order: 0, description: 'A', from: F }]
        let res0 = await postSync('targets', TOKEN_APP, { from: F, rows: rows0 })
        assert.strict.equal(res0.state, 'success', `預置應成功，實得: ${JSON.stringify(res0)}`)

        for (let n of [0, 1, 2 ** 32 - 1]) {
            let res = await postSync('targets', TOKEN_APP, { from: F, rows: [{ id: '專案Z/頁1/區塊B', order: 0, length: n, description: '<script>x</script>', from: F }] })
            assert.strict.equal(res.state, 'error', `length:${n} 含標記之列應被拒，實得: ${JSON.stringify(res)}`)
            assert.strict.equal(res.msg, 'htmlMarkupNotAllowed', `length:${n} 應回語系鍵，實得: ${res.msg}`)
            assert.strict.deepEqual(await idsOf('targets', F), rows0.map((v) => v.id), `length:${n} 該 from 之既有列須不變`)
        }
    })

    it('API-sync-013-row-with-length-field-valid-accepted：列帶 length 欄位但內容合法 → 成功，length 不入庫', async function() {
        const F = 'appTest-13'
        let res = await postSync('targets', TOKEN_APP, { from: F, rows: [{ id: '專案Z/頁1/區塊C', order: 0, length: 5, description: 'ok', from: F }] })
        assert.strict.equal(res.state, 'success', `應成功，實得: ${JSON.stringify(res)}`)
        let rs = await (await getWoItems()).targets.select({ from: F })
        assert.strict.equal(rs.length, 1)
        assert.strict.ok(!Object.prototype.hasOwnProperty.call(rs[0], 'length'), 'length 不是 schema 欄位，不得入庫')
    })

    // ============ R-ORM-05（外部同步）：rows 之元素須為非空物件（2026-10-20 run02；主控 run01 複審裁示 5）============
    //修正前實測（真後端）：元素為字串／數字／null 時 `v.from = from` 拋 TypeError，pm2resolve 把引擎原文外送（msg="Cannot create property 'from' on string 'abc'"）；
    //元素為 {}（多元素陣列內）時寫入一筆自動主鍵之空白列。與後台整表寫入之 isRowObj 同判準。

    it('API-sync-014-non-object-elements-rejected-no-engine-text：rows 含非物件元素（字串、數字、null、陣列、布林） → invalidRows（語系鍵），不外送引擎原文，該 from 既有列不變', async function() {
        const F = 'appTest-14'
        let row0 = (id) => ({ id, order: 0, description: 'ok', from: F })
        let rows0 = [row0('專案14/頁1/區塊A')]
        let res0 = await postSync('targets', TOKEN_APP, { from: F, rows: rows0 })
        assert.strict.equal(res0.state, 'success', `預置應成功，實得: ${JSON.stringify(res0)}`)

        let variants = [['abc', 1], ['abc'], [row0('專案14/頁1/區塊B'), null], [row0('專案14/頁1/區塊B'), 5], [row0('專案14/頁1/區塊B'), 'x'], [row0('專案14/頁1/區塊B'), [1]], [row0('專案14/頁1/區塊B'), true]]
        for (let rows of variants) {
            let res = await postSync('targets', TOKEN_APP, { from: F, rows })
            assert.strict.equal(res.state, 'error', `rows=${JSON.stringify(rows)} 應被拒，實得: ${JSON.stringify(res)}`)
            assert.strict.equal(res.msg, 'invalidRows', `rows=${JSON.stringify(rows)} 應回語系鍵 invalidRows，實得: ${JSON.stringify(res.msg)}`)
            assert.strict.ok(!/Cannot|TypeError|undefined|property/.test(JSON.stringify(res)), `不得外送引擎原文: ${JSON.stringify(res)}`)
            assert.strict.deepEqual(await idsOf('targets', F), rows0.map((v) => v.id), `rows=${JSON.stringify(rows)} 該 from 之既有列須不變`)
        }
    })

    it('API-sync-015-empty-object-element-rejected-no-blank-row：rows 含 {} → invalidRows，不寫入空白列，該 from 既有列不變', async function() {
        const F = 'appTest-15'
        let rows0 = [{ id: '專案15/頁1/區塊A', order: 0, description: 'ok', from: F }]
        let res0 = await postSync('targets', TOKEN_APP, { from: F, rows: rows0 })
        assert.strict.equal(res0.state, 'success', `預置應成功，實得: ${JSON.stringify(res0)}`)

        for (let rows of [[{ id: '專案15/頁1/區塊B', order: 0, description: 'x', from: F }, {}], [{}, {}], [{}, { id: '專案15/頁1/區塊C', order: 0, from: F }]]) {
            let res = await postSync('targets', TOKEN_APP, { from: F, rows })
            assert.strict.equal(res.state, 'error', `rows=${JSON.stringify(rows)} 應被拒，實得: ${JSON.stringify(res)}`)
            assert.strict.equal(res.msg, 'invalidRows')
            assert.strict.deepEqual(await idsOf('targets', F), rows0.map((v) => v.id), `rows=${JSON.stringify(rows)} 不得寫入空白列、既有列須不變`)
        }
    })

    //外審 minimax#3: 只含非 schema 欄位之列（{"foo":1}、{"length":5}）映射到 schema 後與 {} 相同，isRowObj 擋不到；須以「映射後除 from 外各欄皆空」再擋一層
    it('API-sync-016-row-without-schema-fields-rejected-no-blank-row：列只含非 schema 欄位（或只有 from）→ invalidRows，不寫入空白列，該 from 既有列不變', async function() {
        const F = 'appTest-16'
        let valid = { id: '專案16/頁1/區塊B', order: 0, description: 'x', from: F }
        let rows0 = [{ id: '專案16/頁1/區塊A', order: 0, description: 'ok', from: F }]
        let res0 = await postSync('targets', TOKEN_APP, { from: F, rows: rows0 })
        assert.strict.equal(res0.state, 'success', `預置應成功，實得: ${JSON.stringify(res0)}`)

        for (let rows of [[valid, { foo: 1 }], [valid, { length: 5 }], [{ foo: 1 }, { bar: 2 }], [valid, { from: 'other' }], [valid, { id: '', description: '' }], [{ foo: 1 }]]) {
            let res = await postSync('targets', TOKEN_APP, { from: F, rows })
            assert.strict.equal(res.state, 'error', `rows=${JSON.stringify(rows)} 應被拒，實得: ${JSON.stringify(res)}`)
            assert.strict.equal(res.msg, 'invalidRows', `rows=${JSON.stringify(rows)} 應回 invalidRows，實得: ${JSON.stringify(res.msg)}`)
            assert.strict.deepEqual(await idsOf('targets', F), rows0.map((v) => v.id), `rows=${JSON.stringify(rows)} 不得寫入空白列、既有列須不變`)
        }
        //有任一 schema 欄位有值之列照常寫入（order 為 0 亦算有值）
        let ok = await postSync('targets', TOKEN_APP, { from: F, rows: [{ order: 0, description: 'only-desc-and-order', id: '專案16/頁1/區塊C' }, { id: '專案16/頁1/區塊D' }] })
        assert.strict.equal(ok.state, 'success', `有值之列應成功，實得: ${JSON.stringify(ok)}`)
        assert.strict.deepEqual(await idsOf('targets', F), ['專案16/頁1/區塊C', '專案16/頁1/區塊D'])
    })

    //外審 sol(run03)#3／#4: 只帶伺服器管理欄（userId、timeCreate、userIdUpdate、timeUpdate；寫入時被伺服器覆寫）或只帶空容器之列，結果同為空白列
    it('API-sync-017-row-with-only-server-managed-or-empty-container-fields-rejected：只含伺服器管理欄或空容器值之列 → invalidRows，不寫入空白列；order 為 0 之列照常寫入', async function() {
        const F = 'appTest-17'
        let valid = { id: '專案17/頁1/區塊B', order: 0, description: 'x', from: F }
        let rows0 = [{ id: '專案17/頁1/區塊A', order: 0, description: 'ok', from: F }]
        let res0 = await postSync('targets', TOKEN_APP, { from: F, rows: rows0 })
        assert.strict.equal(res0.state, 'success', `預置應成功，實得: ${JSON.stringify(res0)}`)

        let bads = [
            [{ userId: 'supplied' }],
            [{ timeCreate: '2020-01-01 00:00:00' }],
            [{ userIdUpdate: 'u', timeUpdate: 't' }],
            [valid, { userId: 'supplied', timeCreate: 'x', userIdUpdate: 'y', timeUpdate: 'z', from: 'other' }],
            [{ description: [] }],
            [{ description: {} }],
            [valid, { id: '', description: [], order: {} }],
        ]
        for (let rows of bads) {
            let res = await postSync('targets', TOKEN_APP, { from: F, rows })
            assert.strict.equal(res.state, 'error', `rows=${JSON.stringify(rows)} 應被拒，實得: ${JSON.stringify(res)}`)
            assert.strict.equal(res.msg, 'invalidRows', `rows=${JSON.stringify(rows)} 應回 invalidRows，實得: ${JSON.stringify(res.msg)}`)
            assert.strict.deepEqual(await idsOf('targets', F), rows0.map((v) => v.id), `rows=${JSON.stringify(rows)} 不得寫入空白列、既有列須不變`)
        }

        //order 為 0 本身即內容（獨立一列，不靠同批其他欄位）：照常寫入，由伺服器產生主鍵。
        //targets 之 id 須為非空字串（R-SYNC-NAME-01，run02 複審 R2），僅 order:0 之 targets 列現於入口拒收；內容判定改以不要求 id 之 users 驗
        let okT = await postSync('targets', TOKEN_APP, { from: F, rows: [{ order: 0 }] })
        assert.strict.equal(okT.state, 'error', `targets 無 id 之列應被拒，實得: ${JSON.stringify(okT)}`)
        assert.strict.equal(okT.msg, 'invalidRows')
        assert.strict.deepEqual(await idsOf('targets', F), rows0.map((v) => v.id), 'targets 既有列不變')
        let ok = await postSync('users', TOKEN_APP, { from: F, rows: [{ order: 0 }] })
        assert.strict.equal(ok.state, 'success', `僅 order:0 之 users 列應成功，實得: ${JSON.stringify(ok)}`)
        assert.strict.equal((await idsOf('users', F)).length, 1)
    })

    // ===== R-FIELD-SCALAR-01（第 92 項②）：欄位值須為純量；非純量於 delAll 之前整批拒絕 =====
    //四表 schema 欄位型別只有 STRING／INTEGER／TEXT，無合法物件型欄位。修正前真後端實測：同一列其他欄位有內容時，
    //{ description: { value: '<script>x</script>' } } 避過預檢（預檢只看 isestr）而於寫入時被 w-serv-orm 靜默改寫（非拒絕）。
    //「不變」以全列快照比對（外審 sol#8）：該 from 分區之全部欄位（含稽核時間）與其他 from 之全部列，拒收前後逐位元相同。
    let snapOf = async (kt, F) => JSON.stringify((await (await getWoItems())[kt].select({ from: F })).sort((a, b) => String(a.id).localeCompare(String(b.id))))
    let snapOthers = async (kt, F) => JSON.stringify((await (await getWoItems())[kt].select()).filter((v) => v.from !== F).sort((a, b) => String(a.id).localeCompare(String(b.id))))

    it('API-sync-018-nonscalar-field-rejected-rows-kept：列的 description 為物件／陣列／巢狀（同列他欄有內容） → invalidRows，該 from 分區全列與其他 from 之全部列逐位元不變', async function() {
        const F = 'appTest-18'
        let rows0 = [{ id: '專案18/頁1/區塊A', order: 0, description: 'ok', from: F }, { id: '專案18/頁1/區塊Z', order: 1, description: 'second', from: F }]
        let res0 = await postSync('targets', TOKEN_APP, { from: F, rows: rows0 })
        assert.strict.equal(res0.state, 'success', `預置應成功，實得: ${JSON.stringify(res0)}`)
        let part0 = await snapOf('targets', F)
        let others0 = await snapOthers('targets', F)
        assert.strict.ok(part0.length > 10 && others0.length > 10, '前置快照非空')

        let probes = [
            { value: '<script>x</script>' },
            { value: 'plain' },
            ['a', 'b'],
            { a: { b: '<b' } },
        ]
        for (let v of probes) {
            let rows = [{ id: '專案18/頁1/區塊B', order: 1, description: v, from: F }]
            let res = await postSync('targets', TOKEN_APP, { from: F, rows })
            assert.strict.equal(res.state, 'error', `description=${JSON.stringify(v)} 應被拒，實得: ${JSON.stringify(res)}`)
            assert.strict.equal(res.msg, 'invalidRows', `description=${JSON.stringify(v)} 應回 invalidRows，實得: ${JSON.stringify(res.msg)}`)
            assert.strict.equal(await snapOf('targets', F), part0, `description=${JSON.stringify(v)} 該 from 分區須逐位元不變`)
            assert.strict.equal(await snapOthers('targets', F), others0, `description=${JSON.stringify(v)} 其他 from 須逐位元不變`)
        }
        //同批多列只有一列帶非純量 → 整批拒絕
        let resMix = await postSync('targets', TOKEN_APP, { from: F, rows: [{ id: '專案18/頁1/區塊C', description: 'good' }, { id: '專案18/頁1/區塊D', description: { v: 1 } }] })
        assert.strict.equal(resMix.state, 'error')
        assert.strict.equal(resMix.msg, 'invalidRows')
        assert.strict.equal(await snapOf('targets', F), part0, '同批僅一列非純量亦整批拒絕（該 from 分區不變）')
        assert.strict.equal(await snapOthers('targets', F), others0)
    })

    it('API-sync-019-nonscalar-in-other-tables-rejected：users／grups／pemis 的非純量欄位亦拒絕（cgrups／cpemis／crules 為 JSON 字串，物件非法）；先建立舊列，拒收後全列與其他 from 逐位元不變', async function() {
        const F = 'appTest-19'
        let legacy = {
            users: { id: 'id-ns19-u0', name: 'ns19-old', email: 'ns19-old@example.com', cgrups: '{}', isAdmin: 'n', isActive: 'y' },
            grups: { id: 'id-ns19-g0', name: 'ns19g-old', cpemis: '{}' },
            pemis: { id: 'id-ns19-p0', name: 'ns19p-old', crules: '{}' },
        }
        let cases = [
            ['users', { id: 'id-ns19-u', name: 'ns19', email: 'ns19@example.com', cgrups: { 權限群組M1: { mode: 'OR', isActive: 'y' } }, isAdmin: 'n', isActive: 'y' }],
            ['grups', { id: 'id-ns19-g', name: 'ns19g', cpemis: { 權限P1: { mode: 'OR', isActive: 'y' } } }],
            ['pemis', { id: 'id-ns19-p', name: 'ns19p', crules: ['專案A/頁A/區塊A'] }],
        ]
        for (let [kt, row] of cases) {
            let ok0 = await postSync(kt, TOKEN_APP, { from: F, rows: [legacy[kt]] })
            assert.strict.equal(ok0.state, 'success', `${kt} 預置舊列應成功，實得: ${JSON.stringify(ok0)}`)
            let part0 = await snapOf(kt, F)
            let others0 = await snapOthers(kt, F)
            let res = await postSync(kt, TOKEN_APP, { from: F, rows: [row] })
            assert.strict.equal(res.state, 'error', `${kt} 應被拒，實得: ${JSON.stringify(res)}`)
            assert.strict.equal(res.msg, 'invalidRows', `${kt} 應回 invalidRows，實得: ${JSON.stringify(res.msg)}`)
            assert.strict.equal(await snapOf(kt, F), part0, `${kt} 該 from 分區（舊列）須逐位元不變`)
            assert.strict.equal(await snapOthers(kt, F), others0, `${kt} 其他 from 須逐位元不變`)
            assert.strict.deepEqual(await idsOf(kt, F), [legacy[kt].id], `${kt} 只剩舊列`)
        }
        //純量（JSON 字串）照常寫入
        let ok = await postSync('pemis', TOKEN_APP, { from: F, rows: [{ id: 'id-ns19-p', name: 'ns19p', crules: JSON.stringify({ '專案A/頁A/區塊A': 'y' }) }] })
        assert.strict.equal(ok.state, 'success', `純量應成功，實得: ${JSON.stringify(ok)}`)
        assert.strict.deepEqual(await idsOf('pemis', F), ['id-ns19-p'])
    })


    // ===== R-SYNC-NAME-01（run02，複審 R2）：grups／pemis 的 name、targets 的 id 須為非空字串，否則整批拒收（比照後台 ckKey） =====
    //背景：外部同步灌入 name:'' 之群組／權限時，伺服端 arrFinder 以 === 採納，編輯器（cvKpToObj／doSave）視空名稱為無效，存檔即移除該授權（移除 AND 限制時增權）。
    //修正後入口比照後台 ckKey(isestr)：缺漏、''、數字、布林、null 皆整批拒收（invalidRows），於 delAll 之前，該 from 與他 from 之既有列逐位元不變。
    //不比照 ckKey 之重複偵測（複審 R2 範圍僅「非空」）。users 不在範圍（name 可重複）。

    //BAD：name／id 的無效值（undefined 代表整個欄位缺漏）
    const BAD_KEYS = [undefined, '', 5, true, null]
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

    it('API-sync-020-empty-or-nonstring-name-rejected：grups／pemis 的 name 缺漏／空字串／數字／布林／null → invalidRows，整批拒收（含同批其他合法列），該 from 與他 from 逐位元不變', async function() {
        const F = 'appTest-20'
        let legacy = {
            grups: { id: 'id-nm20-g0', name: 'nm20g-old', cpemis: '{}' },
            pemis: { id: 'id-nm20-p0', name: 'nm20p-old', crules: '{}' },
        }
        let valid = {
            grups: { id: 'id-nm20-g1', name: 'nm20g-new', cpemis: '{}' },
            pemis: { id: 'id-nm20-p1', name: 'nm20p-new', crules: '{}' },
        }
        for (let kt of ['grups', 'pemis']) {
            let ok0 = await postSync(kt, TOKEN_APP, { from: F, rows: [legacy[kt]] })
            assert.strict.equal(ok0.state, 'success', `${kt} 預置舊列應成功，實得: ${JSON.stringify(ok0)}`)
            let part0 = await snapOf(kt, F)
            let others0 = await snapOthers(kt, F)
            for (let v of BAD_KEYS) {
                let bad = withKey({ ...valid[kt], id: 'id-nm20-bad' }, 'name', v)
                for (let rows of [[bad], [valid[kt], bad], [bad, valid[kt]]]) {
                    let res = await postSync(kt, TOKEN_APP, { from: F, rows })
                    assert.strict.equal(res.state, 'error', `${kt} name=${JSON.stringify(v)} 應被拒，實得: ${JSON.stringify(res)}`)
                    assert.strict.equal(res.msg, 'invalidRows', `${kt} name=${JSON.stringify(v)} 應回 invalidRows，實得: ${JSON.stringify(res.msg)}`)
                    assert.strict.equal(await snapOf(kt, F), part0, `${kt} name=${JSON.stringify(v)} 該 from 分區須逐位元不變（整批拒收）`)
                    assert.strict.equal(await snapOthers(kt, F), others0, `${kt} name=${JSON.stringify(v)} 其他 from 須逐位元不變`)
                }
            }
            assert.strict.deepEqual(await idsOf(kt, F), [legacy[kt].id], `${kt} 只剩舊列`)
        }
    })

    it('API-sync-021-empty-or-nonstring-id-rejected-targets：targets 的 id 缺漏／空字串／數字／布林／null → invalidRows，整批拒收，該 from 與他 from 逐位元不變', async function() {
        const F = 'appTest-21'
        let ok0 = await postSync('targets', TOKEN_APP, { from: F, rows: [{ id: '專案21/頁1/區塊A', order: 0, description: 'old', from: F }] })
        assert.strict.equal(ok0.state, 'success', `預置舊列應成功，實得: ${JSON.stringify(ok0)}`)
        let part0 = await snapOf('targets', F)
        let others0 = await snapOthers('targets', F)
        let valid = { id: '專案21/頁1/區塊B', order: 1, description: 'new', from: F }
        for (let v of BAD_KEYS) {
            let bad = withKey({ id: 'x', order: 2, description: 'bad', from: F }, 'id', v)
            for (let rows of [[bad], [valid, bad], [bad, valid]]) {
                let res = await postSync('targets', TOKEN_APP, { from: F, rows })
                assert.strict.equal(res.state, 'error', `targets id=${JSON.stringify(v)} 應被拒，實得: ${JSON.stringify(res)}`)
                assert.strict.equal(res.msg, 'invalidRows', `targets id=${JSON.stringify(v)} 應回 invalidRows，實得: ${JSON.stringify(res.msg)}`)
                assert.strict.equal(await snapOf('targets', F), part0, `targets id=${JSON.stringify(v)} 該 from 分區須逐位元不變`)
                assert.strict.equal(await snapOthers('targets', F), others0, `targets id=${JSON.stringify(v)} 其他 from 須逐位元不變`)
            }
        }
    })

    it('API-sync-022-valid-string-names-accepted-users-unaffected：合法非空字串（含中文、含空白字元內嵌）照常寫入；users 不要求 name（name 可重複）', async function() {
        const F = 'appTest-22'
        let rg = await postSync('grups', TOKEN_APP, { from: F, rows: [{ id: 'id-nm22-g1', name: '權限群組 22', cpemis: '{}' }, { id: 'id-nm22-g2', name: 'a', cpemis: '{}' }] })
        assert.strict.equal(rg.state, 'success', `grups 合法 name 應成功，實得: ${JSON.stringify(rg)}`)
        let rp = await postSync('pemis', TOKEN_APP, { from: F, rows: [{ id: 'id-nm22-p1', name: '權限 22', crules: '{}' }] })
        assert.strict.equal(rp.state, 'success', `pemis 合法 name 應成功，實得: ${JSON.stringify(rp)}`)
        let rt = await postSync('targets', TOKEN_APP, { from: F, rows: [{ id: '專案22/頁1/區塊A', description: 'x' }] })
        assert.strict.equal(rt.state, 'success', `targets 合法 id 應成功，實得: ${JSON.stringify(rt)}`)
        //users：name 與 id 皆可省（id 由伺服器產生）、name 可重複——不在 R-SYNC-NAME-01 範圍
        let ru = await postSync('users', TOKEN_APP, { from: F, rows: [{ order: 0, email: 'nm22a@appTest.com', cgrups: '{}', isAdmin: 'n', isActive: 'y' }, { order: 1, name: 'dup', email: 'nm22b@appTest.com', cgrups: '{}', isAdmin: 'n', isActive: 'y' }, { order: 2, name: 'dup', email: 'nm22c@appTest.com', cgrups: '{}', isAdmin: 'n', isActive: 'y' }] })
        assert.strict.equal(ru.state, 'success', `users 不受影響，實得: ${JSON.stringify(ru)}`)
        assert.strict.equal((await idsOf('users', F)).length, 3)
    })


    // ===== R-NAME-UNIQ-01（F-02, ADR-034）：grups／pemis 的 name 不得重複（批內／他 from）=====
    //述語: 外部同步於 delAll 之前, ①本批 rows 內 name 精確 === 重複 → invalidRows; ②該表既有列中 from 不等於本 from 者已使用此 name → invalidRows; 同 from 之既有列不算衝突;
    //  外部應用只收固定語系鍵 invalidRows; 被拒時該 from 與他 from 全列逐位元不變(delAll 之前拒收); 比對為精確 ===(大小寫與空白不同視為不同名稱).
    //修正前: 兩者皆回 success 並寫入同名列(ADR-031 決定 4 明載「不比照 ckKey 之重複偵測」)——授權以名稱查找(arrFinder 取第一個同名列), 同名並存即取決於列序.
    const ROW_OF = {
        grups: (id, name, F) => ({ id, name, description: id, from: F, cpemis: '{}' }),
        pemis: (id, name, F) => ({ id, name, description: id, from: F, crules: '{}' }),
    }

    it('API-sync-023-duplicate-name-in-batch-rejected：grups／pemis 同批 rows 內 name 重複（相鄰、不相鄰、三筆中兩筆）→ invalidRows，該 from 與他 from 全列逐位元不變', async function() {
        const F = 'appTest-23'
        for (let kt of ['grups', 'pemis']) {
            let mk = ROW_OF[kt]
            let ok0 = await postSync(kt, TOKEN_APP, { from: F, rows: [mk('id-nd23-old', `nd23-old-${kt}`, F)] })
            assert.strict.equal(ok0.state, 'success', `${kt} 預置舊列應成功，實得: ${JSON.stringify(ok0)}`)
            let part0 = await snapOf(kt, F)
            let others0 = await snapOthers(kt, F)
            let variants = [
                [mk('id-nd23-a', 'dupN', F), mk('id-nd23-b', 'dupN', F)],
                [mk('id-nd23-a', 'dupN', F), mk('id-nd23-c', 'uniq', F), mk('id-nd23-b', 'dupN', F)],
                [mk('id-nd23-c', 'uniq', F), mk('id-nd23-a', 'dupN', F), mk('id-nd23-b', 'dupN', F)],
            ]
            for (let rows of variants) {
                let res = await postSync(kt, TOKEN_APP, { from: F, rows })
                assert.strict.equal(res.state, 'error', `${kt} rows=${JSON.stringify(rows.map((v) => v.name))} 同批同名應被拒，實得: ${JSON.stringify(res)}`)
                assert.strict.equal(res.msg, 'invalidRows', `${kt} 應回語系鍵 invalidRows，實得: ${JSON.stringify(res.msg)}`)
                assert.strict.equal(await snapOf(kt, F), part0, `${kt} 該 from 分區須逐位元不變（delAll 之前拒收）`)
                assert.strict.equal(await snapOthers(kt, F), others0, `${kt} 他 from 須逐位元不變`)
            }
            assert.strict.deepEqual(await idsOf(kt, F), ['id-nd23-old'], `${kt} 只剩舊列`)
        }
    })

    it('API-sync-024-name-used-by-other-from-rejected：grups／pemis 的 name 已為他 from 之既有列使用（含 base seed）→ invalidRows，兩個 from 皆不變', async function() {
        const F = 'appTest-24'
        const G = 'appTest-24b'
        for (let kt of ['grups', 'pemis']) {
            let mk = ROW_OF[kt]
            //G 先持有 name
            let resG = await postSync(kt, TOKEN_APP, { from: G, rows: [mk('id-of24-g', `of24-${kt}`, G)] })
            assert.strict.equal(resG.state, 'success', `${kt} G 預置應成功，實得: ${JSON.stringify(resG)}`)
            //F 預置自己之列
            let resF0 = await postSync(kt, TOKEN_APP, { from: F, rows: [mk('id-of24-f0', `of24-f0-${kt}`, F)] })
            assert.strict.equal(resF0.state, 'success', `${kt} F 預置應成功，實得: ${JSON.stringify(resF0)}`)
            let partF0 = await snapOf(kt, F)
            let partG0 = await snapOf(kt, G)
            let others0 = await snapOthers(kt, F)
            //(a) 與 G 之 name 相同; (b) 與 base seed(from '')之 name 相同; 各自夾在合法列之間, 整批拒收
            let baseName = (await (await getWoItems())[kt].select({ from: '' }))[0].name
            for (let name of [`of24-${kt}`, baseName]) {
                let res = await postSync(kt, TOKEN_APP, { from: F, rows: [mk('id-of24-ok', `of24-ok-${kt}`, F), mk('id-of24-f1', name, F)] })
                assert.strict.equal(res.state, 'error', `${kt} name=${name} 已屬他 from 應被拒，實得: ${JSON.stringify(res)}`)
                assert.strict.equal(res.msg, 'invalidRows', `${kt} 應回語系鍵 invalidRows，實得: ${JSON.stringify(res.msg)}`)
                assert.strict.equal(await snapOf(kt, F), partF0, `${kt} name=${name} 本 from 須逐位元不變`)
                assert.strict.equal(await snapOf(kt, G), partG0, `${kt} name=${name} 他 from(G)須逐位元不變`)
                assert.strict.equal(await snapOthers(kt, F), others0, `${kt} name=${name} 其他 from 全列須逐位元不變`)
            }
        }
    })

    it('API-sync-025-same-from-resend-same-name-accepted：同 from 重送同名（含換 id 保留 name、重送完全相同之批）→ 成功（同 from 之既有列隨 delAll 重寫，不算衝突）', async function() {
        const F = 'appTest-25'
        for (let kt of ['grups', 'pemis']) {
            let mk = ROW_OF[kt]
            let r1 = await postSync(kt, TOKEN_APP, { from: F, rows: [mk('id-sf25-a', `sf25-${kt}`, F), mk('id-sf25-b', `sf25b-${kt}`, F)] })
            assert.strict.equal(r1.state, 'success', `${kt} 第 1 次應成功，實得: ${JSON.stringify(r1)}`)
            let r2 = await postSync(kt, TOKEN_APP, { from: F, rows: [mk('id-sf25-a', `sf25-${kt}`, F), mk('id-sf25-b', `sf25b-${kt}`, F)] })
            assert.strict.equal(r2.state, 'success', `${kt} 重送完全相同之批應成功，實得: ${JSON.stringify(r2)}`)
            let r3 = await postSync(kt, TOKEN_APP, { from: F, rows: [mk('id-sf25-c', `sf25-${kt}`, F)] })
            assert.strict.equal(r3.state, 'success', `${kt} 換 id 保留 name 應成功（舊列隨 delAll 移除），實得: ${JSON.stringify(r3)}`)
            assert.strict.deepEqual(await idsOf(kt, F), ['id-sf25-c'], `${kt} 全量取代後只剩新批`)
        }
    })

    it('API-sync-026-exact-match-only：僅大小寫或前後空白不同之 name 視為不同名稱（精確 ===，不正規化），可寫入', async function() {
        const F = 'appTest-26'
        for (let kt of ['grups', 'pemis']) {
            let mk = ROW_OF[kt]
            let names = [`Case26-${kt}`, `case26-${kt}`, `Case26-${kt} `, ` Case26-${kt}`, `CASE26-${kt}`]
            let res = await postSync(kt, TOKEN_APP, { from: F, rows: names.map((n, i) => mk(`id-ci26-${i}`, n, F)) })
            assert.strict.equal(res.state, 'success', `${kt} 精確比對下互不相同，應成功，實得: ${JSON.stringify(res)}`)
            assert.strict.equal((await idsOf(kt, F)).length, names.length, `${kt} 全部寫入`)
        }
    })

    it('API-sync-027-users-default-mappingBy-id-no-mapkey-check：預設 mappingBy=id 時 users 不另檢查對應鍵（email 空／批內重複／與他 from 重複皆可寫入）', async function() {
        //述語(R-MAPKEY-01): mappingBy='id'(預設)不另檢查——預設部署之 email 可空／可重複, 新規則不得使其外部同步全部失敗; id 唯一性由主鍵與 idOtherFrom 保證.
        //mappingBy='email'／'name' 之行為見 api-mapKey.test.mjs 與 unit-keyCheck.
        const F = 'appTest-27'
        const G = 'appTest-27b'
        let u = (id, name, email, f, isActive = 'y') => ({ id, order: 0, name, email, from: f, cgrups: '{}', isAdmin: 'n', isActive })
        let rG = await postSync('users', TOKEN_APP, { from: G, rows: [u('id-mk27-g', 'g27', 'x27@appTest.com', G)] })
        assert.strict.equal(rG.state, 'success', `G 預置應成功，實得: ${JSON.stringify(rG)}`)
        let res = await postSync('users', TOKEN_APP, { from: F, rows: [
            u('id-mk27-1', 'a27', '', F), //active 且 email 空
            u('id-mk27-2', 'b27', 'dup27@appTest.com', F),
            u('id-mk27-3', 'c27', 'dup27@appTest.com', F), //批內重複
            u('id-mk27-4', 'd27', 'x27@appTest.com', F), //與他 from(G)重複
        ] })
        assert.strict.equal(res.state, 'success', `mappingBy=id 不應檢查 email，實得: ${JSON.stringify(res)}`)
        assert.strict.equal((await idsOf('users', F)).length, 4)
    })

})
