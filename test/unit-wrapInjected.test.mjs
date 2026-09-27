//W 契約(部署方注入函數之包裝, server/wrapInjected.mjs)單元測試與站點不變式。對應 spec/設計要點與取捨.md ADR-023。
//  wrapInjected(fn, { failValue, onFail }): fn 之回傳(同步或 Promise)原樣回傳; 同步拋錯或 reject → 回 failValue, 並以 describeUpstream(err) 之結果呼叫 onFail
//  describeUpstream(err): reject 值(或 Error.message)屬 w-web-sso K 契約之 14 個 key → { upstream: key }; 否則 → { upstreamType, upstreamName }(只記型別與 Error.name, 絕不記原文)
//why: 部署方常以 w-web-sso 對外 helper(≤1.1.4)包裝 getUserByToken, 其 reject 字串含已代入系統介接權杖與使用者權杖之完整網址;
//  未包裝時原文經 pm2resolve 回前端、經 verifyConn 之 msg 入 srLog(修正前探測 tmp/probe-v3/result-before.json)。
//站點不變式(WRAP-SITE-*)為 CLAUDE_rulebook.md「注入函數只經 wrapInjected」之可執行版: 靜態掃描 server/WWebPerm.mjs(可執行碼行, 見 test/tools/srcScan.mjs)。
import assert from 'assert'
import path from 'path'
import { fileURLToPath } from 'url'
import { sourceLines, blankStrings } from './tools/srcScan.mjs'


const projRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

//舊版 w-web-sso helper 之失敗形狀(合成秘密)
const SECRET = 'SYNTH-WRAP-SECRET'
const OLD_HELPER_REJECT = `can not get user data by url[http://127.0.0.1:11007/api/getSsoUserInfor?token=${SECRET}-SYS&key=token&value=${SECRET}-USER]`

//w-web-sso K 契約之 14 個 key(與 sso 之同步點, 見 CLAUDE_rulebook.md)
const K_KEYS = [
    'invalidUrl', 'invalidTokenSelf', 'invalidTokenTar', 'invalidUserIdTar',
    'noTokenKeyValueInUrl', 'noTokenKeyUserIdInUrl', 'noTokenInUrl',
    'cannotGetUserByUrl', 'cannotGetUsersByUrl',
    'cannotGetUserDataByUrl', 'cannotGetUsersDataByUrl',
    'noUserDataByUrl', 'noUsersDataByUrl',
    'noUserDataAfterConvert',
]


describe('unit-wrapInjected', function() {

    let wrapInjected = null
    let describeUpstream = null
    let keysUpstream = null

    before(async function() {
        let m = await import('../server/wrapInjected.mjs')
        wrapInjected = m.default
        describeUpstream = m.describeUpstream
        keysUpstream = m.keysUpstream
    })

    //onFail 收集器
    let collect = () => {
        let calls = []
        let onFail = (d) => {
            calls.push(d)
        }
        return { calls, onFail }
    }

    //resolve 原樣(含物件身分), 引數原樣傳入, 不呼叫 onFail
    it('WRAP-001-resolve-passthrough', async function() {
        let user = { id: 'u1', name: 'n', email: 'e@x', isAdmin: 'y' }
        let got = null
        let c = collect()
        let f = wrapInjected(async (a, b) => {
            got = [a, b]
            return user
        }, { failValue: null, onFail: c.onFail })
        let r = await f('tk', 'from-x')
        assert.strict.equal(r, user)
        assert.strict.deepEqual(got, ['tk', 'from-x'])
        assert.strict.equal(c.calls.length, 0)
    })

    //非 Promise 回傳原樣; 否定結果(false / {} / '')不得被當成失敗改寫
    it('WRAP-002-sync-return-passthrough', async function() {
        let c = collect()
        assert.strict.equal(await wrapInjected(() => true, { failValue: false, onFail: c.onFail })(), true)
        assert.strict.equal(await wrapInjected(() => false, { failValue: 'FAIL', onFail: c.onFail })(), false)
        assert.strict.deepEqual(await wrapInjected(() => ({}), { failValue: null, onFail: c.onFail })(), {})
        assert.strict.equal(await wrapInjected(() => '', { failValue: null, onFail: c.onFail })(), '')
        assert.strict.equal(c.calls.length, 0)
    })

    //reject 舊版 helper 之字串(含合成秘密) → failValue; onFail 收到之物件不含秘密與網址, 只有型別
    it('WRAP-003-reject-string-with-secret', async function() {
        let c = collect()
        let r = await wrapInjected(() => Promise.reject(OLD_HELPER_REJECT), { failValue: null, onFail: c.onFail })('tk')
        assert.strict.equal(r, null)
        assert.strict.equal(c.calls.length, 1)
        let s = JSON.stringify(c.calls[0])
        assert.strict.ok(!s.includes(SECRET) && !s.includes('getSsoUserInfor') && !s.includes('http'), `onFail 不得含上游原文, 實得 ${s}`)
        assert.strict.deepEqual(c.calls[0], { upstreamType: 'string', upstreamName: '' })
    })

    //白名單 key(reject 字串或 Error.message)照記 upstream
    it('WRAP-004-whitelisted-key-recorded', async function() {
        assert.strict.deepEqual([...keysUpstream].sort(), [...K_KEYS].sort(), '白名單須恰為 w-web-sso K 契約之 14 個 key')
        for (let k of K_KEYS) {
            let c = collect()
            let r = await wrapInjected(() => Promise.reject(k), { failValue: null, onFail: c.onFail })()
            assert.strict.equal(r, null)
            assert.strict.deepEqual(c.calls, [{ upstream: k }], `reject '${k}'`)
            let c2 = collect()
            await wrapInjected(async () => {
                throw new Error(k)
            }, { failValue: null, onFail: c2.onFail })()
            assert.strict.deepEqual(c2.calls, [{ upstream: k }], `Error('${k}')`)
        }
    })

    //非白名單但像 key 之字串(本系統自家 key、key 形狀之秘密)不照記原文
    it('WRAP-005-non-whitelisted-key-shape-not-recorded', function() {
        assert.strict.deepEqual(describeUpstream('tokenNoPermission'), { upstreamType: 'string', upstreamName: '' })
        assert.strict.deepEqual(describeUpstream('SYNTHKEYSHAPEDSECRET'), { upstreamType: 'string', upstreamName: '' })
        assert.strict.deepEqual(describeUpstream(new Error('SYNTHKEYSHAPEDSECRET')), { upstreamType: 'object', upstreamName: 'Error' })
    })

    //Error 物件(含子類): 只記 Error.name; name 非名稱形狀者不記
    it('WRAP-006-error-object', async function() {
        let c = collect()
        let r = await wrapInjected(() => Promise.reject(new TypeError(`${SECRET} ${OLD_HELPER_REJECT}`)), { failValue: false, onFail: c.onFail })()
        assert.strict.equal(r, false)
        assert.strict.deepEqual(c.calls, [{ upstreamType: 'object', upstreamName: 'TypeError' }])
        let e = new Error('x')
        e.name = `${SECRET}-AS-NAME`
        assert.strict.deepEqual(describeUpstream(e), { upstreamType: 'object', upstreamName: '' })
    })

    //同步 throw → failValue(verify 系為 false)
    it('WRAP-007-sync-throw', async function() {
        let c = collect()
        let f = wrapInjected((user, from) => {
            throw new Error(`SYNTH-VERIFY-${SECRET}`)
        }, { failValue: false, onFail: c.onFail })
        let r = await f({ id: 'u' }, 'getUserByToken')
        assert.strict.equal(r, false)
        assert.strict.equal(c.calls.length, 1)
        assert.strict.ok(!JSON.stringify(c.calls[0]).includes(SECRET))
        assert.strict.deepEqual(c.calls[0], { upstreamType: 'object', upstreamName: 'Error' })
    })

    //各型別之 reject 值: 只記型別
    it('WRAP-008-other-reject-types', function() {
        assert.strict.deepEqual(describeUpstream(undefined), { upstreamType: 'undefined', upstreamName: '' })
        assert.strict.deepEqual(describeUpstream(null), { upstreamType: 'null', upstreamName: '' })
        assert.strict.deepEqual(describeUpstream(12345), { upstreamType: 'number', upstreamName: '' })
        assert.strict.deepEqual(describeUpstream([SECRET]), { upstreamType: 'array', upstreamName: '' })
        assert.strict.deepEqual(describeUpstream({ kind: 'request', status: 0, message: OLD_HELPER_REJECT }), { upstreamType: 'object', upstreamName: '' })
        assert.strict.deepEqual(describeUpstream({ message: 'cannotGetUserByUrl' }), { upstream: 'cannotGetUserByUrl' })
    })

    //onFail 本身拋錯不影響「失敗＝否定結果」; 未給 onFail 亦可
    it('WRAP-009-onFail-throws-or-missing', async function() {
        let r = await wrapInjected(() => Promise.reject(OLD_HELPER_REJECT), {
            failValue: null,
            onFail: () => {
                throw new Error('log down')
            },
        })()
        assert.strict.equal(r, null)
        assert.strict.equal(await wrapInjected(() => Promise.reject(OLD_HELPER_REJECT), { failValue: false })(), false)
        //thenable 之 reject 亦攔截
        let thenable = { then: (res, rej) => rej(OLD_HELPER_REJECT) }
        assert.strict.equal(await wrapInjected(() => thenable, { failValue: null })(), null)
    })

})


//—— 站點不變式: 靜態掃描(不需 server/wrapInjected.mjs 存在, 修正前即可獨立執行) ——

//第四個注入函數 getUserById(opt 選填, useCheckUser=true 時由 WServOrm 呼叫)於主代理複審時納入(2026-09-25, ADR-023)
const NAMES = ['getUserByToken', 'verifyClientUser', 'verifyAppUser', 'getUserById']


describe('unit-wrapInjected-sites', function() {

    let fp = path.join(projRoot, 'server', 'WWebPerm.mjs')

    //四個注入函數(三個建構子參數 + opt.getUserById)各恰有一處包裝指派, 且在 srLog 初始化之後
    it('WRAP-SITE-001-wrap-assignments-after-srLog-init', function() {
        let ls = sourceLines(fp, 'code')
        let srLogInit = ls.find((l) => /let srLog = srLogInit\(opt\)/.test(l.text))
        assert.strict.ok(srLogInit, '找不到 srLog 初始化')
        let bad = []
        for (let nm of NAMES) {
            let hits = ls.filter((l) => new RegExp(`^\\s*${nm}\\s*=\\s*wrapInjected\\(\\s*${nm}\\b`).test(l.text))
            if (hits.length !== 1) {
                bad.push(`${nm}: 包裝指派應恰 1 處, 實得 ${hits.length}`)
            }
            else if (hits[0].no <= srLogInit.no) {
                bad.push(`${nm}: 包裝指派(:${hits[0].no})須在 srLog 初始化(:${srLogInit.no})之後`)
            }
        }
        assert.strict.deepEqual(bad, [], bad.join('\n'))
    })

    //包裝指派之前, 原始參數只允許出現在函數簽名與參數檢查(isfun / 'invalid xxx' 之 console 與 throw); 不得被呼叫或另存別名
    it('WRAP-SITE-002-no-direct-use-of-originals-before-wrap', function() {
        let ls = sourceLines(fp, 'code')
        let bad = []
        for (let nm of NAMES) {
            let wrap = ls.find((l) => new RegExp(`^\\s*${nm}\\s*=\\s*wrapInjected\\(\\s*${nm}\\b`).test(l.text))
            let limit = wrap ? wrap.no : Infinity
            let allowed = [
                /^\s*function WWebPerm\(/,
                new RegExp(`^\\s*let ${nm} = get\\(opt, '${nm}'`), //opt 選填之注入函數(getUserById)之讀取
                new RegExp(`isfun\\(${nm}\\)`),
                new RegExp(`console\\.log\\('invalid ${nm}', ${nm}\\)`),
                new RegExp(`throw new Error\\('invalid ${nm}'\\)`),
            ]
            for (let l of ls) {
                if (l.no >= limit) {
                    break
                }
                if (!new RegExp(`\\b${nm}\\b`).test(blankStrings(l.text))) {
                    continue
                }
                if (allowed.some((re) => re.test(l.text))) {
                    continue
                }
                bad.push(`${nm} 於包裝前被直接使用 WWebPerm.mjs:${l.no}: ${l.text.trim()}`)
            }
        }
        assert.strict.deepEqual(bad, [], `${bad.length} 處:\n${bad.join('\n')}`)
    })

})
