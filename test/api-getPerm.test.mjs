//getPerm client SDK 契約測試。對應 spec/流程_查詢使用者權限.md。
//唯讀（不改 DB）：以 admin（token=sys）查自身權限、各類錯誤路徑 reject、funConvertPerm 轉換、perm() factory accessors。
//
//reject 字串已 Read 原始碼確認（皆為純字串，非 Error）：
//  src/getPerm.mjs:15  'invalid url'
//  src/getPerm.mjs:18  'invalid tokenTar'
//  src/getPerm.mjs:26  `no 'token={token}' in url`（url 無佔位符，送出前攔截）
//  src/getPerm.mjs:61  `can not get user data by url[<url>]`（後端 envelope state='error' → client 轉拋）
//  src/getPerm.mjs:87  'no user data after funConvertPerm'
//後端 /api/getPerm（server/WWebPerm.mjs:908-981）：invalid token → core() reject 'token does not have permission'
//  → pm2resolve 包成 {state:'error', msg:...}（HTTP 200）→ client 見 state!=='success' → reject 'can not get user data by url[...]'。

import assert from 'assert'
import { startApi, cleanup, apiBaseUrl, TOKEN_ADMIN, TOKEN_BAD, urlGetPerm, SEED } from './api-setup.mjs'
import getPerm from '../src/getPerm.mjs'
import perm from '../src/perm.mjs'


describe('api-getPerm', function() {
    this.timeout(120000)

    before(async function() {
        this.timeout(200000)
        await startApi()
    })

    //對應 spec：以有效 client token（admin）查詢自身權限，回傳 user 物件與 rules 清單。
    it('API-getPerm-001-success-admin-self', async function() {
        let ur = await getPerm(urlGetPerm, TOKEN_ADMIN)

        //spec：resolve 物件含 user 與 rules
        assert.strict.ok(ur && typeof ur === 'object', 'getPerm 應 resolve 物件')
        assert.strict.ok(ur.user && typeof ur.user === 'object', 'ur 應含 user 物件')
        assert.strict.ok(Array.isArray(ur.rules), 'ur.rules 應為陣列')

        //spec：user 為 admin 自身（email / id / grupsNames 對應 base seed admin）
        assert.strict.equal(ur.user.email, SEED.adminEmail, 'user.email 應為 admin email')
        assert.strict.equal(ur.user.id, SEED.adminId, 'user.id 應為 admin id')
        assert.strict.equal(ur.user.grupsNames, SEED.adminGrup, 'user.grupsNames 應為 admin 權限群組')

        //spec：rules 對應全部 targets（22 筆）
        assert.strict.equal(ur.rules.length, SEED.targetCount, `rules.length 應為 ${SEED.targetCount}`)

        //spec：每筆 rule 含 name(string) 與 isActive(∈'y'/'n')
        for (let r of ur.rules) {
            assert.strict.equal(typeof r.name, 'string', 'rule.name 應為字串')
            assert.strict.ok(r.isActive === 'y' || r.isActive === 'n', "rule.isActive 應為 'y' 或 'n'")
        }
    })

    //對應 spec：無效 token → 後端回 state='error' → client 轉拋查詢失敗訊息。
    it('API-getPerm-002-invalid-token-reject', async function() {
        try {
            await getPerm(urlGetPerm, TOKEN_BAD)
            assert.fail('應 reject（無效 token）')
        }
        catch (e) {
            //src/getPerm.mjs:61，含動態 url 後綴故用 startsWith
            assert.strict.equal(typeof e, 'string', 'reject 應為純字串')
            assert.strict.ok(String(e).startsWith('can not get user data by url'), `reject 應以 'can not get user data by url' 起頭，實得: ${e}`)
        }
    })

    //對應 spec：url 缺少 token={token} 佔位符 → 前端送出前攔截。
    it('API-getPerm-003-missing-placeholder-reject', async function() {
        try {
            await getPerm(`${apiBaseUrl}/api/getPerm`, TOKEN_ADMIN)
            assert.fail('應 reject（url 無佔位符）')
        }
        catch (e) {
            //src/getPerm.mjs:26
            assert.strict.equal(e, "no 'token={token}' in url", 'reject 字串應為佔位符缺失訊息')
        }
    })

    //對應 spec：url / tokenTar 為空字串等無效引數 → 前置檢測 reject。
    it('API-getPerm-004-invalid-args-reject', async function() {
        try {
            await getPerm('', TOKEN_ADMIN)
            assert.fail('應 reject（空 url）')
        }
        catch (e) {
            //src/getPerm.mjs:15
            assert.strict.equal(e, 'invalid url', 'reject 字串應為 invalid url')
        }

        try {
            await getPerm(urlGetPerm, '')
            assert.fail('應 reject（空 tokenTar）')
        }
        catch (e) {
            //src/getPerm.mjs:18
            assert.strict.equal(e, 'invalid tokenTar', 'reject 字串應為 invalid tokenTar')
        }
    })

    //對應 spec：funConvertPerm 可在 resolve 前轉換 ur；回傳非物件（null）則視為無效 → reject。
    it('API-getPerm-005-funConvertPerm', async function() {
        //成功轉換：附加欄位後仍含 user / rules
        let ur = await getPerm(urlGetPerm, TOKEN_ADMIN, { funConvertPerm: (ur) => ({ ...ur, _extra: 1 }) })
        assert.strict.equal(ur._extra, 1, 'funConvertPerm 附加欄位應保留')
        assert.strict.ok(ur.user && typeof ur.user === 'object', '轉換後仍應含 user')
        assert.strict.ok(Array.isArray(ur.rules), '轉換後仍應含 rules')

        //轉換回傳 null → src/getPerm.mjs:87
        try {
            await getPerm(urlGetPerm, TOKEN_ADMIN, { funConvertPerm: () => null })
            assert.fail('應 reject（funConvertPerm 回傳 null）')
        }
        catch (e) {
            assert.strict.equal(e, 'no user data after funConvertPerm', 'reject 字串應為 funConvertPerm 後無資料')
        }
    })

    //對應 spec：perm() factory 連線後可由 accessors 取得 user / rules，並以 active(name) 查詢單一目標權限。
    it('API-getPerm-006-perm-factory-accessors', async function() {
        let p = perm()

        //url 已帶妥 token=sys（非佔位符）；perm.conn 走 axios → pmInvResolve → 取 {user, rules}
        await p.conn(`${apiBaseUrl}/api/getPerm?token=sys`)

        //getUser / getRules accessors
        assert.strict.equal(p.getUser().id, SEED.adminId, 'getUser().id 應為 admin id')
        assert.strict.ok(Array.isArray(p.getRules()), 'getRules() 應為陣列')

        //從實際 rules 找一個 isActive==='y' 的 name，驗 active(name)==='y'（admin 為 M4 群組，實測有啟用 rule）
        let ruleActive = p.getRules().find((r) => r.isActive === 'y')
        assert.strict.ok(ruleActive && typeof ruleActive.name === 'string', '應至少有一個 isActive=y 的 rule')
        assert.strict.equal(p.active(ruleActive.name), 'y', `active('${ruleActive.name}') 應為 'y'`)

        //不存在的 name → active 回 'n'（src/perm.mjs:117-121 預設 ''→'n'）
        assert.strict.equal(p.active('__not_exist__'), 'n', "active('__not_exist__') 應為 'n'")
    })

})
