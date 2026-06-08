//syncAndReplaceTabs API 契約測試。對應 spec/流程_外部應用同步權限資料.md。
//
//端點：POST /syncAndReplaceTabs?keyTable={keyTable}&token={token}（根路徑、無 /api 前綴，WWebPerm.mjs:1056 自訂 route）。
//以裸 axios.post 打真實 HTTP，res.data 即後端 pmConvertResolve 包裝的 { state, msg } envelope（HTTP 200；
//reject → {state:'error', msg:<純字串>}，resolve → {state:'success', msg:<insert 結果>}）。
//本 API **會寫 DB**（全量取代：同 from 先 delAll 再 insert）。
//
//【測試隔離策略】每個 case 用**自己獨立的 from（'appTest-N'）**，不撞 base seed 的 ''（admin/grups/pemis/targets）
//與 'teamA'（peter/mary/john）、也互不干擾。成功案例的 full-replace 本身會先 delAll(該 from) 自清，故 case 間
//無需額外 clearFrom（且 backend 對空 rows 會拒、無法用 rows:[] 清——見下 DISCREPANCY）。每次 mocha run 由
//startApi→seedDb 重建 base seed、run 結束 mocha root after 殺 backend，故跨 run 亦 hermetic。
//DB 斷言一律 getWoItems() 後**唯讀** select（跨進程唯讀實測可行；絕不在測試進程寫 DB，寫一律走 backend HTTP）。
//
//reject 字串已 Read 原始碼確認（皆純字串，非 Error；handler core() 各檢查以 Promise.reject 短路）：
//  WWebPerm.mjs:1073/1085  缺 token / 缺 keyTable（query 取不到）              → 'token does not have permission'
//  WWebPerm.mjs:1092       keyTable 不在白名單 ['targets','pemis','grups','users'] → `invalid keyTable: ${keyTable}`
//  WWebPerm.mjs:631        token 非空但無效（getUserByToken 回 {} → !iseobj）    → 'can not find the user from token'
//  WWebPerm.mjs:666        payload 非物件                                        → 'invalid payload in req'
//  WWebPerm.mjs:676        payload.from 非有效字串                               → 'invalid from in payload'
//  WWebPerm.mjs:683/686    payload.rows 非「非空陣列」（isearr）                 → 'invalid rows in payload'
//
//全量取代 + 稽核欄位自動補入已 Read 確認：WWebPerm.mjs:736 delAll({from}) → :740 procOrm(userId,keyTable,'insert',rows)；
//  procOrm insert 自動補 userId(=token 對應 user.id='id-for-application')/timeCreate/...；sync 路徑用 ltdtmapping+insert
//  （非 funNew），故 payload 的 id(pk) 原樣保留。

import assert from 'assert'
import axios from 'axios'
import { startApi, urlSync, TOKEN_APP, TOKEN_BAD, SEED, getWoItems } from './api-setup.mjs'


//postSync：裸 axios.post 該 keyTable + token，回 res.data（{state, msg} envelope）。
let postSync = async (keyTable, token, body, contentType = 'application/json; charset=utf-8') => {
    let url = urlSync.replace('{keyTable}', keyTable).replace('{token}', token)
    let res = await axios.post(url, body, { headers: { 'Content-Type': contentType } })
    return res.data
}


describe('api-syncAndReplaceTabs', function() {
    this.timeout(120000)

    before(async function() {
        this.timeout(200000)
        await startApi()
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
    //  推送空 rows（rows:[]）被後端 parsePayload 的 isearr 非空檢查（WWebPerm.mjs:683）拒絕，
    //  回 state='error'、msg 含 'invalid rows in payload'，未進 delAll，故不支援「以空集合清源」。
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
        assert.strict.ok(String(resEmpty.msg).includes('invalid rows in payload'), `msg 應含 'invalid rows in payload'，實得: ${resEmpty.msg}`)

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
        //TOKEN_BAD（非空但無效）→ getUserByToken 回 {} → !iseobj → WWebPerm.mjs:631
        assert.strict.equal(res.msg, 'can not find the user from token', `reject msg 應為 token 守門字串，實得: ${res.msg}`)

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
        //WWebPerm.mjs:1092
        assert.strict.ok(String(res.msg).includes('invalid keyTable'), `reject msg 應含 'invalid keyTable'，實得: ${res.msg}`)

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

        //(a) 缺 from → WWebPerm.mjs:676 'invalid from in payload'
        let resA = await postSync('users', TOKEN_APP, { rows: [{ id: 'x', order: 0, name: 'x', email: 'x@x.com' }] })
        assert.strict.equal(resA.state, 'error', `缺 from 應回 state='error'，實得: ${JSON.stringify(resA)}`)
        assert.strict.ok(String(resA.msg).includes('invalid from in payload'), `reject msg 應含 'invalid from in payload'，實得: ${resA.msg}`)

        //(b) rows 非陣列 → WWebPerm.mjs:686 'invalid rows in payload'
        let resB = await postSync('users', TOKEN_APP, { from: F, rows: 'x' })
        assert.strict.equal(resB.state, 'error', `rows 非陣列應回 state='error'，實得: ${JSON.stringify(resB)}`)
        assert.strict.ok(String(resB.msg).includes('invalid rows in payload'), `reject msg 應含 'invalid rows in payload'，實得: ${resB.msg}`)

        //(c) payload 完全非物件（text/plain body 'x'）→ WWebPerm.mjs:666 'invalid payload in req'
        let resC = await postSync('users', TOKEN_APP, 'x', 'text/plain; charset=utf-8')
        assert.strict.equal(resC.state, 'error', `非物件 payload 應回 state='error'，實得: ${JSON.stringify(resC)}`)
        assert.strict.ok(String(resC.msg).includes('invalid payload in req'), `reject msg 應含 'invalid payload in req'，實得: ${resC.msg}`)

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

})
