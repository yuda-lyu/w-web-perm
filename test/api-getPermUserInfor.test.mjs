//API 契約測試：getPermUserInfor app SDK（對應 spec/流程_查詢指定使用者權限.md）。
//唯讀查詢，裸 fetch(內建) 打真實 HTTP（非 RPC）。client SDK 失敗 reject 純字串（非 Error）。
//cleanup 由 e2e-setup.mjs 的 mocha root after hook 自動觸發，本檔不寫 after(cleanup)。

import assert from 'assert'
import { startApi, apiBaseUrl, TOKEN_APP, TOKEN_BAD, urlGetPermUserInfor, SEED } from './tools/api-setup.mjs'
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
})
