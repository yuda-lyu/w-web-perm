//API 契約測試：getPermUserInfor app SDK（對應 spec/流程_查詢指定使用者權限.md）。
//唯讀查詢，裸 axios 打真實 HTTP（非 RPC）。client SDK 失敗 reject 純字串（非 Error）。
//cleanup 由 e2e-setup.mjs 的 mocha root after hook 自動觸發，本檔不寫 after(cleanup)。

import assert from 'assert'
import { startApi, apiBaseUrl, TOKEN_APP, TOKEN_BAD, urlGetPermUserInfor, SEED } from './api-setup.mjs'
import getPermUserInfor from '../src/getPermUserInfor.mjs'


describe('api-getPermUserInfor', function() {
    this.timeout(120000)

    before(async function() {
        this.timeout(200000)
        await startApi()
    })

    it('API-getPermUserInfor-001-success', async () => {

        //對應 spec E2E-001：合法 app token 查詢既有 userId 回傳該使用者權限。
        //注意用 TOKEN_APP（非 sys）；getPermUserInfor.mjs:31 以 tokenSelf 置換 {sysToken}。
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

        //對應 spec E2E-002：url 同時缺 token={sysToken} 與 userId={userId} 佔位符 → 客戶端前置 reject。
        //源碼 getPermUserInfor.mjs:28 條件為「兩佔位符皆缺（&&）」才 reject。
        let urlNoPh = `${apiBaseUrl}/api/getPermUserInfor`
        try {
            await getPermUserInfor(urlNoPh, TOKEN_APP, SEED.peterId)
            assert.fail('應 reject（url 缺兩個佔位符）')
        }
        catch (e) {
            //對應 spec E2E-002 驗證 1：reject 固定字串（getPermUserInfor.mjs:29），不打後端
            assert.strict.equal(e, 'noTokenUserIdInUrl', 'reject 應為 err key noTokenUserIdInUrl')
        }

        //對照子斷言：url 只缺 userId={userId} 但保留 token={sysToken} → && 為 false → 不走此 reject。
        //（會往後送，{sysToken} 被置換、{userId} 不存在故 userId 不入 query；最終後端查詢結果不深究，
        // 只驗「非上述缺佔位符 reject 字串」即可。）
        let urlOnlyToken = `${apiBaseUrl}/api/getPermUserInfor?token={sysToken}`
        let rejMsg = null
        try {
            await getPermUserInfor(urlOnlyToken, TOKEN_APP, SEED.peterId)
            //可能 resolve（空權限/其他結果），不深究
        }
        catch (e) {
            rejMsg = String(e)
        }
        //對應 spec E2E-002：保留 token 佔位符時不應走「缺佔位符」前置 reject
        assert.strict.notEqual(rejMsg, 'noTokenUserIdInUrl', '保留 token 佔位符時不應走缺佔位符 reject')
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
    })

    it('API-getPermUserInfor-006-funConvertPerm', async () => {

        //對應 spec E2E-006：opt.funConvertPerm 提供時改以轉換後物件 resolve（getPermUserInfor.mjs:79-85）。
        let ur = await getPermUserInfor(urlGetPermUserInfor, TOKEN_APP, SEED.peterId, {
            funConvertPerm: (ur) => ({ ...ur, _wrapped: true }),
        })

        //對應 spec E2E-006 驗證 1：resolve 為 funConvertPerm 轉換後結果（含注入欄位）
        assert.strict.ok(ur && typeof ur === 'object', 'resolve 值應為物件')
        assert.strict.equal(ur._wrapped, true, 'resolve 物件應含 funConvertPerm 注入的 _wrapped:true')

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
})
