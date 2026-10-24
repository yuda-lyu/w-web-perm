//API 契約測試：getPermUserInfor app SDK（對應 spec/流程_查詢指定使用者權限.md）。
//唯讀查詢，裸 fetch(內建) 打真實 HTTP（非 RPC）。client SDK 失敗 reject 純字串（非 Error）。
//cleanup 由 e2e-setup.mjs 的 mocha root after hook 自動觸發，本檔不寫 after(cleanup)。

import assert from 'assert'
import { startApi, apiBaseUrl, TOKEN_APP, TOKEN_BAD, urlGetPermUserInfor, urlSync, SEED, cleanExternalFixtures, selectAllRows } from './tools/api-setup.mjs'
import getPermUserInfor from '../src/getPermUserInfor.mjs'


describe('api-getPermUserInfor', function() {
    this.timeout(120000)

    before(async function() {
        this.timeout(200000)
        await startApi()
    })

    it('API-getPermUserInfor-001-success', async () => {

        //對應 spec E2E-001：合法 app token 查詢既有 userId 回傳該使用者權限。
        //注意用 TOKEN_APP（非 sys）；getPermUserInfor.mjs:32 以 encodeURIComponent(tokenSelf) 代入 {sysToken}（伺服端解出原值）。
        let ur = await getPermUserInfor(urlGetPermUserInfor, TOKEN_APP, SEED.peterId)

        //對應 spec E2E-001 驗證 1：resolve 物件含 user 與 rules（getPermUserInfor.mjs:69,96 取 msg 物件）
        assert.strict.ok(ur && typeof ur === 'object', 'resolve 值應為物件')
        assert.strict.ok(ur.user && typeof ur.user === 'object', 'ur 應含 user 物件')

        //對應 spec E2E-001 驗證 1：user.id 等於查找的 userIdTar（WWebPerm.mjs:812 回 {...userFind, grupsNames}）
        assert.strict.equal(ur.user.id, SEED.peterId, 'user.id 應等於查找的 peterId')

        //對應 spec E2E-001 驗證 1：user.email 為 base seed peter email
        assert.strict.equal(ur.user.email, SEED.peterEmail, 'user.email 應為 peterEmail')

        //對應 spec E2E-001 驗證 1：grupsNames 為有效權限群組名稱（WWebPerm.mjs:809-810；peter→M1）
        assert.strict.equal(ur.user.grupsNames, SEED.peterGrup, 'user.grupsNames 應為 peterGrup（權限群組M1）')

        //對應 spec E2E-001 驗證 1：rules 為陣列（WWebPerm.mjs:818）
        assert.strict.ok(Array.isArray(ur.rules), 'rules 應為陣列')
    })

    it('API-getPermUserInfor-002-missing-both-placeholders-reject', async () => {

        //對應 spec E2E-002：url 缺 token={sysToken} 或 userId={userId} 任一佔位符 → 客戶端前置 reject。
        //源碼 getPermUserInfor.mjs 之佔位符檢查為「缺一即拒（||）」（2026-09-25 起, ADR-023; 原為 &&: 兩者皆缺才拒,
        //只缺一個時仍送出請求——本案原「對照子斷言」即凍結了該缺陷行為, 已改為缺一即拒之斷言）。
        let urls = [
            `${apiBaseUrl}/api/getPermUserInfor`, //兩者皆缺
            `${apiBaseUrl}/api/getPermUserInfor?token={sysToken}`, //只缺 userId={userId}
            `${apiBaseUrl}/api/getPermUserInfor?userId={userId}`, //只缺 token={sysToken}
        ]
        for (let url of urls) {
            let rejMsg = null
            try {
                await getPermUserInfor(url, TOKEN_APP, SEED.peterId)
            }
            catch (e) {
                rejMsg = e
            }
            //對應 spec E2E-002 驗證 1：reject 固定 err key（getPermUserInfor.mjs 佔位符檢查處），不打後端
            assert.strict.equal(rejMsg, 'noTokenUserIdInUrl', `url 缺佔位符應 reject err key noTokenUserIdInUrl: ${url}`)
        }
    })

    it('API-getPermUserInfor-003-invalid-args-reject', async () => {

        //對應 spec E2E-003：url / tokenSelf / userIdTar 任一為非有效字串於對應檢查點 reject。

        //url 空字串 → reject 'invalid url'（getPermUserInfor.mjs:14-15）
        try {
            await getPermUserInfor('', TOKEN_APP, SEED.peterId)
            assert.fail('應 reject（url 空字串）')
        }
        catch (e) {
            assert.strict.equal(e, 'invalidUrl', 'reject 應為 err key invalidUrl')
        }

        //tokenSelf 空字串 → reject 'invalid tokenSelf'（getPermUserInfor.mjs:17-18）
        try {
            await getPermUserInfor(urlGetPermUserInfor, '', SEED.peterId)
            assert.fail('應 reject（tokenSelf 空字串）')
        }
        catch (e) {
            assert.strict.equal(e, 'invalidTokenSelf', 'reject 應為 err key invalidTokenSelf')
        }

        //userIdTar 空字串 → reject 'invalid userIdTar'（getPermUserInfor.mjs:20-21）
        try {
            await getPermUserInfor(urlGetPermUserInfor, TOKEN_APP, '')
            assert.fail('應 reject（userIdTar 空字串）')
        }
        catch (e) {
            assert.strict.equal(e, 'invalidUserIdTar', 'reject 應為 err key invalidUserIdTar')
        }
    })

    it('API-getPermUserInfor-004-bad-token-reject', async () => {

        //對應 spec E2E-004：tokenSelf 非合法 app 使用者 → 後端 state='error' → 客戶端因 state!=='success' reject。
        try {
            await getPermUserInfor(urlGetPermUserInfor, TOKEN_BAD, SEED.peterId)
            assert.fail('應 reject（bad token）')
        }
        catch (e) {
            //對應 spec E2E-004 驗證 1：reject 已改為 camelCase key（getPermUserInfor.mjs:65）
            assert.strict.equal(e, 'cannotGetUserDataByUrl', `reject 應為 'cannotGetUserDataByUrl'，實得：${e}`)
        }
    })

    it('API-getPermUserInfor-005-nonexistent-userId-empty-perms', async () => {

        //對應 spec E2E-005（已更新對齊現狀）：查詢不存在的 userId 時，後端 getGenUserByUserId 取不到使用者，
        //但 getUserRules 容忍此情形、回「全停用」空權限（fail-safe），故 resolve（非 reject）：
        //user 無有效 id、rules 全 isActive='n'。
        let ur = await getPermUserInfor(urlGetPermUserInfor, TOKEN_APP, 'id-not-exist-xyz')

        //spec E2E-005：resolve 物件（非 reject）
        assert.strict.ok(ur && typeof ur === 'object', 'resolve 應為物件（非 reject）')

        //spec E2E-005：user 無有效 id（不存在的 userId 查無真使用者）
        assert.strict.ok(!ur.user || ur.user.id === undefined, 'user 應無有效 id')

        //spec E2E-005：rules 為陣列且全 isActive==='n'（空權限 fail-safe）
        assert.strict.ok(Array.isArray(ur.rules), 'rules 應為陣列')
        assert.strict.ok(ur.rules.every((x) => x.isActive === 'n'), 'rules 應全 isActive=n（空權限）')
        assert.strict.ok(ur.rules.length > 0, 'rules 須列出全部標的(非 rules=[] 之空洞「全 n」; perm-run05 外審 sol 第一輪#8)')
    })

    it('API-getPermUserInfor-006-funConvertPerm', async () => {

        //對應 spec E2E-006：opt.funConvertPerm 提供時改以轉換後物件 resolve（getPermUserInfor.mjs:79-85）。
        let ur = await getPermUserInfor(urlGetPermUserInfor, TOKEN_APP, SEED.peterId, {
            funConvertPerm: (ur) => ({ ...ur, _wrapped: true }),
        })

        //對應 spec E2E-006 驗證 1：resolve 為 funConvertPerm 轉換後結果（含注入欄位）
        assert.strict.ok(ur && typeof ur === 'object', 'resolve 值應為物件')
        assert.strict.equal(ur._wrapped, true, 'resolve 物件應含 funConvertPerm 注入的 _wrapped:true')

        //對應 spec E2E-006：funConvertPerm「支援同步或回傳 Promise」，此子斷言驗回 Promise 分支
        //（getPermUserInfor.mjs:75 於 try 內 await, 同步值與 Promise 皆適用）→ 以 resolve 後物件 resolve。
        let urAsync = await getPermUserInfor(urlGetPermUserInfor, TOKEN_APP, SEED.peterId, {
            funConvertPerm: async (ur) => ({ ...ur, _async: true }),
        })
        assert.strict.ok(urAsync && typeof urAsync === 'object', 'async funConvertPerm resolve 值應為物件')
        assert.strict.equal(urAsync._async, true, 'resolve 物件應含 async funConvertPerm 注入的 _async:true（await 分支生效）')

        //對應 spec E2E-006 驗證 1：funConvertPerm 回非物件（null）時 reject（getPermUserInfor.mjs:89-91）
        try {
            await getPermUserInfor(urlGetPermUserInfor, TOKEN_APP, SEED.peterId, {
                funConvertPerm: () => null,
            })
            assert.fail('應 reject（funConvertPerm 回 null）')
        }
        catch (e) {
            assert.strict.equal(e, 'noUserDataAfterConvert', 'reject 應為 err key noUserDataAfterConvert')
        }
    })

    //R-OBJ-ITER-01（規則帳本「迭代使用端傳入之物件」）：cgrups／cpemis／crules 為使用者或外部應用寫入之 JSON 字串，解析後之物件含數字 length 鍵時，
    //修正前 getUserRules 以 lodash each 當陣列樣迭代而略過真實鍵（群組、權限、規則被靜默評估為無權限）；length 極大時使每次權限查詢空轉或耗盡記憶體（毒化資料持久）。
    //本案經真後端：外部應用以 syncAndReplaceTabs 寫入一組含 length 鍵之資料，再以 getPermUserInfor 查詢該使用者之有效權限。
    //  perm-run03(R-IMPORT-01): 同步端點不收 id、每列須帶 srcKey; 使用者之 id 由伺服端產生, 故依 srcKey 讀回真實 id 再查詢。
    //巨大 length 之單元案例見 unit-getUserRules UNIT-OI-007（子行程，避免修前使後端空轉或崩潰）。
    describe('length 鍵於 JSON 字串欄位（R-OBJ-ITER-01）', function() {
        const F = 'appTest-oi'
        const TARGET = '專案A/頁A/區塊A' //base seed 既有標的

        let postSync = async (keyTable, rows) => {
            let url = urlSync.replace('{keyTable}', keyTable).replace('{token}', TOKEN_APP)
            let res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ from: F, rows }) })
            return await res.json()
        }

        after(async function() {
            this.timeout(60000)
            await cleanExternalFixtures({ kts: ['users', 'grups', 'pemis'], froms: [F] }) //外部列夾具收尾之單一入口(R-TEST-EXT-CLEAN-01)
        })

        it('API-getPermUserInfor-007-length-key-in-json-strings：三層 JSON 字串皆含 length 鍵 → 群組名稱與標的權限仍正確', async function() {
            this.timeout(60000)
            let OR = '{"mode":"OR","isActive":"y"}'
            let r1 = await postSync('pemis', [{ srcKey: 'sk-oi-p1', order: 0, name: 'oiPemi', description: '', from: F, crules: `{"length":0,"${TARGET}":"y"}` }])
            assert.strict.equal(r1.state, 'success', `pemis 預置應成功: ${JSON.stringify(r1)}`)
            let r2 = await postSync('grups', [{ srcKey: 'sk-oi-g1', order: 0, name: 'oiGrup', description: '', from: F, cpemis: `{"length":1,"oiPemi":${OR}}` }])
            assert.strict.equal(r2.state, 'success', `grups 預置應成功: ${JSON.stringify(r2)}`)
            let r3 = await postSync('users', [{ srcKey: 'sk-oi-u1', order: 0, name: 'oiUser', email: 'oi@appTest.com', description: '', from: F, cgrups: `{"length":2,"oiGrup":${OR}}`, isAdmin: 'n', isActive: 'y' }])
            assert.strict.equal(r3.state, 'success', `users 預置應成功: ${JSON.stringify(r3)}`)

            //使用者之 id 由伺服端產生: 依 srcKey 讀回
            let uOi = (await selectAllRows('users')).find((v) => v.srcKey === 'sk-oi-u1')
            assert.strict.ok(uOi && typeof uOi.id === 'string' && uOi.id !== '', '依 srcKey 應讀回外部使用者列')
            let ur = await getPermUserInfor(urlGetPermUserInfor, TOKEN_APP, uOi.srcKey) //perm-run05: mappingBy 為 id 時 userId 依登入對應(外部列傳 srcKey, 不是內部 id)
            assert.strict.equal(ur.user.grupsNames, 'oiGrup', 'cgrups 含 length 鍵時群組仍應被辨識（修正前為空字串）')
            let rule = ur.rules.find((v) => v.name === TARGET)
            assert.strict.ok(rule, `rules 應含標的 ${TARGET}`)
            assert.strict.equal(rule.isActive, 'y', 'cpemis／crules 含 length 鍵時標的仍應為 y（修正前為 n）')
        })
    })

    //R-AUTH-PATH-01（規則帳本；外審 sol#5，主控 run01 複審裁示 1）：標的 id 是資料不是路徑。
    //修正前實測（單元層 getUserRules）：crules 只授權 apQ 時，標的 apQ.0、apQ[0] 經 lodash get 的字串索引得 y、apQ.length 得數字 1；未授權之 toString 取到繼承函數。
    //本案經真後端：外部應用以 syncAndReplaceTabs 寫入一組標的／權限／群組／使用者，再以 getPermUserInfor 查有效權限。
    //  perm-run03(R-IMPORT-01): 每列帶 srcKey、不帶 id; 標的之 id＝srcKey(含 . 或 [ 或原型鍵名者如實成為標的 id), 使用者 id 依 srcKey 讀回。
    describe('標的 id 含 . 或 [ 、或為原型鍵名（R-AUTH-PATH-01）', function() {
        const F = 'appTest-ap'
        const IDS = ['apQ', 'apQ.0', 'apQ[0]', 'apQ.length', 'apR', 'apR.exact', 'constructor', 'toString']

        let postSync = async (keyTable, rows) => {
            let url = urlSync.replace('{keyTable}', keyTable).replace('{token}', TOKEN_APP)
            let res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ from: F, rows }) })
            return await res.json()
        }

        after(async function() {
            this.timeout(60000)
            await cleanExternalFixtures({ froms: [F] }) //外部列夾具收尾之單一入口(R-TEST-EXT-CLEAN-01)
        })

        it('API-getPermUserInfor-008-target-id-not-a-path：只授權 apQ 與精確鍵 apR.exact → apQ.0／apQ[0]／apQ.length／constructor／toString 皆 n，精確鍵為 y', async function() {
            this.timeout(60000)
            let OR = '{"mode":"OR","isActive":"y"}'
            let r0 = await postSync('targets', IDS.map((id, k) => ({ srcKey: id, order: k, description: '', from: F })))
            assert.strict.equal(r0.state, 'success', `targets 預置應成功: ${JSON.stringify(r0)}`)
            assert.strict.deepEqual((await selectAllRows('targets')).filter((v) => v.from === F).map((v) => v.id).sort(), [...IDS].sort(), 'targets 之 id 即 srcKey(標的名稱)')
            let r1 = await postSync('pemis', [{ srcKey: 'sk-ap-p1', order: 0, name: 'apPemi', description: '', from: F, crules: '{"apQ":"y","apR.exact":"y"}' }])
            assert.strict.equal(r1.state, 'success', `pemis 預置應成功: ${JSON.stringify(r1)}`)
            let r2 = await postSync('grups', [{ srcKey: 'sk-ap-g1', order: 0, name: 'apGrup', description: '', from: F, cpemis: `{"apPemi":${OR}}` }])
            assert.strict.equal(r2.state, 'success', `grups 預置應成功: ${JSON.stringify(r2)}`)
            let r3 = await postSync('users', [{ srcKey: 'sk-ap-u1', order: 0, name: 'apUser', email: 'ap@appTest.com', description: '', from: F, cgrups: `{"apGrup":${OR}}`, isAdmin: 'n', isActive: 'y' }])
            assert.strict.equal(r3.state, 'success', `users 預置應成功: ${JSON.stringify(r3)}`)

            let uAp = (await selectAllRows('users')).find((v) => v.srcKey === 'sk-ap-u1')
            assert.strict.ok(uAp && typeof uAp.id === 'string' && uAp.id !== '', '依 srcKey 應讀回外部使用者列')
            let ur = await getPermUserInfor(urlGetPermUserInfor, TOKEN_APP, uAp.srcKey) //perm-run05: 同上(外部列傳 srcKey)
            assert.strict.equal(ur.user.grupsNames, 'apGrup')
            let by = new Map(ur.rules.map((v) => [v.name, v.isActive]))
            assert.strict.equal(by.get('apQ'), 'y', '被授權之標的')
            assert.strict.equal(by.get('apR.exact'), 'y', '精確鍵（含 .）照常授權')
            for (let id of ['apQ.0', 'apQ[0]', 'apQ.length', 'apR', 'constructor', 'toString']) {
                assert.strict.equal(by.get(id), 'n', `${id} 未被授權，須為 n（修正前 apQ.0／apQ[0] 為 y、apQ.length 為數字 1、toString 為函數）`)
            }
            assert.strict.deepEqual(ur.rules.filter((v) => IDS.includes(v.name)).map((v) => v.name).sort(), [...IDS].sort(), '本案標的各一筆(rules 另含 base seed 之標的)')
        })
    })
})
