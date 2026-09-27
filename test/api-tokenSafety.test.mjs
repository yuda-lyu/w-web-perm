//權杖不外洩之 API 層契約測試(W 契約 / M 契約; spec/設計要點與取捨.md ADR-023)。
//通道: C1 HTTP 回應、C2 srLog(本次後端 logFd 內 time ≥ 本檔起點之各行)。
//  C3 後端 stdout 不在 harness 可觀察範圍(e2e-setup 之 spawnSrv 丟棄 stdout), 由 unit-maskLog 之 SITE-* 靜態不變式守護, 並於 ADR-023 驗證段以探測實測。
//測試權杖(srv.mjs, 非 production 才有):
//  '{token-for-reject}'       → getUserByToken 以舊版 w-web-sso helper(≤1.1.4)之失敗形狀 reject: 字串含已代入權杖之完整網址(夾 SYNTH-SYS-SECRET-FOR-TEST 與所送權杖)
//  '{token-for-verify-throw}' → getUserByToken 回 id-for-verify-throw; verifyClientUser / verifyAppUser 對其 throw Error('SYNTH-VERIFY-SECRET-FOR-TEST')
//  client 通道(api/getUserByToken、api/getPerm、資料通道)會反查 perm users 表(mappingBy), 故 before 以 app token 經 /syncAndReplaceTabs 於本檔專用 from
//  插入 id-for-verify-throw 使驗證走到 verifyClientUser; after 以 delAll({from}) 清除(同 api-syncAndReplaceTabs 之清理慣例)。
//述語(W 契約): 注入函數拋錯或 reject 視同否定結果——getUserByToken 失敗 ≡ 查無使用者(自家 key cannotFindUserFromToken / cannotFindUserId),
//  verify* 失敗 ≡ 無權限(userNoPermission); 上游原文不回前端、不入 srLog, srLog 只記 warn(白名單 key, 或型別與 Error.name)。
//述語(M 契約): verifyConn 之 srLog referer 只記 origin + pathname。
//修正前(2026-09-24 探測 tmp/probe-v3/result-before.json 之 perm 段): 回應 msg 為上游原文、verifyConn 之 srLog msg 與 referer 皆含權杖。
import assert from 'assert'
import { startApi, apiBaseUrl, callRpc, readSrLogSince, getWoItems, TOKEN_ADMIN, TOKEN_APP, TOKEN_REJECT, TOKEN_VERIFY_THROW, SEED } from './tools/api-setup.mjs'


const SECRET_SYS = 'SYNTH-SYS-SECRET-FOR-TEST' //srv.mjs 之 '{token-for-reject}' 夾帶之合成介接權杖
const SECRET_VERIFY = 'SYNTH-VERIFY-SECRET-FOR-TEST' //srv.mjs 之 verify* 拋錯訊息
const SECRET_REF = 'SYNTH-REF-SECRET-FOR-TEST' //Referer 查詢值
const SECRET_Y1 = 'SYNTH-TS-Y1-SECRET' //重複 token 參數(Hapi 解析為陣列)
const SECRET_Y2 = 'SYNTH-TS-Y2-SECRET'
const SECRETS = [SECRET_SYS, SECRET_VERIFY, SECRET_REF, SECRET_Y1, SECRET_Y2, TOKEN_REJECT, 'getSsoUserInfor']

const FROM_VT = 'apiTokenSafety' //本檔插入 id-for-verify-throw 之 from
const FROM_BLOCKED = 'apiTokenSafety-blocked' //被拒之同步請求所用之 from(須始終無列)


//httpText: 打 HTTP 入口, 回 { status, text, json }(text 供秘密掃描)
async function httpText(url, opt = {}) {
    let r = await fetch(url, opt)
    let text = await r.text()
    let json = null
    try {
        json = JSON.parse(text)
    }
    catch (e) {}
    return { status: r.status, text, json }
}

//hits: 文字中出現之秘密
function hits(text) {
    return SECRETS.filter((s) => String(text).includes(s))
}

//四個 HTTP 入口(token 以 query 帶入; 值經 encodeURIComponent, Hapi 解回原值)
function entries(tokenQuery) {
    let row = { id: 'id-ts-blocked', order: 0, name: 'blocked', email: 'blocked@apiTokenSafety.test', from: FROM_BLOCKED, cgrups: '{}', isAdmin: 'n', isActive: 'y' }
    let post = { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ from: FROM_BLOCKED, rows: [row] }) }
    return [
        ['GET /api/getUserByToken', `${apiBaseUrl}/api/getUserByToken?${tokenQuery}`, {}],
        ['GET /api/getPerm', `${apiBaseUrl}/api/getPerm?${tokenQuery}`, {}],
        ['GET /api/getPermUserInfor', `${apiBaseUrl}/api/getPermUserInfor?${tokenQuery}&userId=${SEED.adminId}`, {}],
        ['POST /syncAndReplaceTabs', `${apiBaseUrl}/syncAndReplaceTabs?keyTable=users&${tokenQuery}`, post],
    ]
}


describe('api-tokenSafety', function() {
    this.timeout(300000)

    let t0 = 0

    before(async function() {
        await startApi()
        t0 = Date.now()
        //插入 id-for-verify-throw(isActive='y'), 使 client 通道之驗證走到 verifyClientUser
        let r = await httpText(`${apiBaseUrl}/syncAndReplaceTabs?keyTable=users&token=${encodeURIComponent(TOKEN_APP)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body: JSON.stringify({ from: FROM_VT, rows: [{ id: 'id-for-verify-throw', order: 0, name: 'verify-throw', email: 'verify-throw@example.com', from: FROM_VT, cgrups: '{}', isAdmin: 'y', isActive: 'y' }] }),
        })
        assert.strict.equal(r.json?.state, 'success', `前置: 插入 id-for-verify-throw 應成功, 實得 ${r.text}`)
    })

    after(async function() {
        let woItems = await getWoItems()
        await woItems.users.delAll({ from: FROM_VT })
        await woItems.users.delAll({ from: FROM_BLOCKED })
    })


    //getUserByToken 之上游 reject(舊版 helper 形狀) → 四入口皆回自家 key cannotFindUserFromToken, 回應全文不含合成秘密與所送權杖
    it('TS-001-injected-getUserByToken-reject-http-entries', async function() {
        let bad = []
        for (let [name, url, opt] of entries(`token=${encodeURIComponent(TOKEN_REJECT)}`)) {
            let r = await httpText(url, opt)
            if (r.json?.state !== 'error' || r.json?.msg !== 'cannotFindUserFromToken') {
                bad.push(`${name}: 應回 {state:'error', msg:'cannotFindUserFromToken'}, 實得 ${r.text}`)
            }
            if (hits(r.text).length > 0) {
                bad.push(`${name}: 回應含 ${hits(r.text).join(', ')}`)
            }
        }
        assert.strict.deepEqual(bad, [], `${bad.length} 項:\n${bad.join('\n')}`)
    })

    //verifyClientUser / verifyAppUser 拋錯 → 四入口皆回 userNoPermission, 不含合成秘密; 被拒之同步請求不寫入(fail-closed)
    it('TS-002-injected-verify-throw-http-entries', async function() {
        let bad = []
        for (let [name, url, opt] of entries(`token=${encodeURIComponent(TOKEN_VERIFY_THROW)}`)) {
            let r = await httpText(url, opt)
            if (r.json?.state !== 'error' || r.json?.msg !== 'userNoPermission') {
                bad.push(`${name}: 應回 {state:'error', msg:'userNoPermission'}, 實得 ${r.text}`)
            }
            if (hits(r.text).length > 0) {
                bad.push(`${name}: 回應含 ${hits(r.text).join(', ')}`)
            }
        }
        let woItems = await getWoItems()
        let rs = await woItems.users.select({ from: FROM_BLOCKED })
        if (rs.length !== 0) {
            bad.push(`被拒之 /syncAndReplaceTabs 不得寫入, 實得 ${rs.length} 列`)
        }
        assert.strict.deepEqual(bad, [], `${bad.length} 項:\n${bad.join('\n')}`)
    })

    //資料通道(Authorization + Referer)、execute 之 __sysToken__、重複 token 參數; 之後讀本次 srLog: 不含任何合成秘密, 且 W / M 契約之紀錄如實
    it('TS-003-data-channel-and-srLog', async function() {
        let bad = []

        //E5: Authorization 為 {token-for-reject}, Referer 帶權杖 → permission denied
        let r1 = await callRpc('getWebInfor', [], TOKEN_REJECT, { headers: { 'Referer': `http://127.0.0.1/?token=${SECRET_REF}` } })
        if (r1.ok || r1.msg !== 'permission denied') {
            bad.push(`E5 reject: 應回 permission denied, 實得 ${JSON.stringify(r1)}`)
        }
        //E5': Authorization 為 {token-for-verify-throw}(verifyClientUser 拋錯) → permission denied
        let r2 = await callRpc('getWebInfor', [], TOKEN_VERIFY_THROW)
        if (r2.ok || r2.msg !== 'permission denied') {
            bad.push(`E5 verify-throw: 應回 permission denied, 實得 ${JSON.stringify(r2)}`)
        }
        //E6: Authorization 有效(sys)、本體 __sysToken__ 為 {token-for-reject} → getUserIdByToken 走上游失敗路徑, 不得執行
        let r3 = await callRpc('getWebInfor', [], TOKEN_ADMIN, { sysToken: TOKEN_REJECT })
        if (r3.ok) {
            bad.push(`E6: getUserIdByToken 失敗時不得執行, 實得 ${JSON.stringify(r3)}`)
        }
        for (let r of [r1, r2, r3]) {
            if (hits(r.raw).length > 0) {
                bad.push(`資料通道回應含 ${hits(r.raw).join(', ')}`)
            }
        }
        //E7: 重複 token 參數(Hapi 解析為陣列) → 型別檢查拒, tokenNoPermission(其 console 通道由 unit-maskLog SITE-001 守護)
        for (let [name, url, opt] of entries(`token=${SECRET_Y1}&token=${SECRET_Y2}`)) {
            let r = await httpText(url, opt)
            if (r.json?.msg !== 'tokenNoPermission' || hits(r.text).length > 0) {
                bad.push(`E7 ${name}: 應回 tokenNoPermission 且不含權杖, 實得 ${r.text}`)
            }
        }

        //哨兵: keyTable 不在白名單時 srLog 會記 keyTable(本次唯一值); 同一行程之 srLog 依呼叫序落檔, 見哨兵即前面各行已落檔
        let sentinel = `tsSentinel${t0}`
        await httpText(`${apiBaseUrl}/syncAndReplaceTabs?keyTable=${sentinel}&token=x`, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: '{}' })
        let lines = []
        let tEnd = Date.now() + 30000
        while (Date.now() < tEnd) {
            lines = readSrLogSince(t0)
            if (lines.some((l) => l.keyTable === sentinel)) {
                break
            }
            await new Promise((resolve) => setTimeout(resolve, 300))
        }
        assert.strict.ok(lines.some((l) => l.keyTable === sentinel), `30s 內未見哨兵行, srLog 未落檔或 logFd 不符(讀到 ${lines.length} 行)`)

        //C2: 本次各行不含任何合成秘密與所送權杖
        for (let l of lines) {
            let h = hits(l._raw)
            if (h.length > 0) {
                bad.push(`srLog 含 ${h.join(', ')}: ${l._raw}`)
            }
        }
        //M 契約: verifyConn 之 referer 只記 origin + pathname, msg 為自家 key
        if (!lines.some((l) => l.event === 'verifyConn-error' && l.referer === 'http://127.0.0.1/' && l.msg === 'cannotFindUserFromToken')) {
            bad.push(`缺 verifyConn-error { referer:'http://127.0.0.1/', msg:'cannotFindUserFromToken' }; 實得 ${JSON.stringify(lines.filter((l) => l.event === 'verifyConn-error').map((l) => ({ referer: l.referer, msg: l.msg })))}`)
        }
        if (!lines.some((l) => l.event === 'verifyConn-error' && l.msg === 'userNoPermission')) {
            bad.push('缺 verifyConn-error { msg:\'userNoPermission\' }(verifyClientUser 拋錯經資料通道)')
        }
        //W 契約: 包裝處記 warn(因), 非白名單只記型別與 Error.name
        let warn = (ev) => lines.filter((l) => l.event === ev && l.level === 40)
        if (!warn('inject-getUserByToken-fail').some((l) => l.upstreamType === 'string' && !('upstream' in l))) {
            bad.push(`缺 warn inject-getUserByToken-fail { upstreamType:'string' }; 實得 ${JSON.stringify(warn('inject-getUserByToken-fail'))}`)
        }
        if (!warn('inject-verifyClientUser-fail').some((l) => l.upstreamType === 'object' && l.upstreamName === 'Error')) {
            bad.push(`缺 warn inject-verifyClientUser-fail { upstreamType:'object', upstreamName:'Error' }; 實得 ${JSON.stringify(warn('inject-verifyClientUser-fail'))}`)
        }
        if (!warn('inject-verifyAppUser-fail').some((l) => l.upstreamType === 'object' && l.upstreamName === 'Error')) {
            bad.push(`缺 warn inject-verifyAppUser-fail { upstreamType:'object', upstreamName:'Error' }; 實得 ${JSON.stringify(warn('inject-verifyAppUser-fail'))}`)
        }
        //W 契約: 呼叫點記 error(果)——getUserIdByToken 之上游失敗走既有查無分支
        if (!lines.some((l) => l.event === 'getUserIdByToken-error' && l.msg === 'cannotFindUserId')) {
            bad.push('缺 getUserIdByToken-error { msg:\'cannotFindUserId\' }(E6 上游失敗應走既有查無分支)')
        }

        assert.strict.deepEqual(bad, [], `${bad.length} 項:\n${bad.join('\n')}`)
    })

})
