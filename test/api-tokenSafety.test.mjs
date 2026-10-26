//權杖不外洩之 API 層契約測試(W 契約 / M 契約; spec/設計要點與取捨.md ADR-023)。
//通道: C1 HTTP 回應、C2 srLog(本次後端 logFd 內 time ≥ 本檔起點之各行)。
//  C3 後端 stdout 不在 harness 可觀察範圍(e2e-setup 之 spawnSrv 丟棄 stdout), 由 unit-maskLog 之 SITE-* 靜態不變式守護, 並於 ADR-023 驗證段以探測實測。
//測試權杖(srv.mjs, 非 production 才有):
//  '{token-for-reject}'       → getUserByToken 以舊版 w-web-sso helper(≤1.1.4)之失敗形狀 reject: 字串含已代入權杖之完整網址(夾 SYNTH-SYS-SECRET-FOR-TEST 與所送權杖)
//  '{token-for-verify-throw}' → getUserByToken 回 id-for-verify-throw; verifyClientUser / verifyAppUser 對其 throw Error('SYNTH-VERIFY-SECRET-FOR-TEST')
//  client 通道(api/getUserByToken、api/getPerm、資料通道)會反查 perm users 表(mappingBy), 故 before 以系統管理者寫入 RPC(updateUsers, editTableRows)於 perm users 表建立後台列
//  id-for-verify-throw(from ''; isActive='y')使驗證走到 verifyClientUser; after 以系統管理者寫入 RPC 移除該列。
//  perm-run03 變更: 原以 app token 經 /syncAndReplaceTabs 灌入此列, 但外部匯入改依 srcKey 差異同步(R-IMPORT-01), 內部主鍵 id 由伺服端產生而不再是外部給的值,
//  而本專案測試 server 之登入對應 mappingBy 為預設 'id'(以 perm users 列之 id 比對 token 使用者之 id, 本輪未改, 待裁示), 經同步建立之列不再能與 '{token-for-verify-throw}' 對應, 故改以後台列建立。
//  資料通道之執行身分(__sysToken__ → getUserIdByToken)本輪起與連線閘同等完整驗證(外部 getUserByToken → perm users 存在且啟用 → verifyClientUser), 任一關不過即拒、函數不執行(見 TS-003 E6／E6b)。
//述語(W 契約): 注入函數拋錯或 reject 視同否定結果——getUserByToken 失敗 ≡ 查無使用者(自家 key cannotFindUserFromToken / cannotFindUserId),
//  verify* 失敗 ≡ 無權限(userNoPermission); 上游原文不回前端、不入 srLog, srLog 只記 warn(白名單 key, 或型別與 Error.name)。
//述語(M 契約): verifyConn 之 srLog referer 只記 origin + pathname。
//修正前(2026-09-24 探測 tmp/probe-v3/result-before.json 之 perm 段): 回應 msg 為上游原文、verifyConn 之 srLog msg 與 referer 皆含權杖。
import assert from 'assert'
import { startApi, apiBaseUrl, callRpc, markSrLog, readSrLogSince, getWoItems, cleanExternalFixtures, editTableRows, selectAllRows, TOKEN_ADMIN, TOKEN_APP, TOKEN_REJECT, TOKEN_VERIFY_THROW, SEED } from './tools/api-setup.mjs'


const SECRET_SYS = 'SYNTH-SYS-SECRET-FOR-TEST' //srv.mjs 之 '{token-for-reject}' 夾帶之合成介接權杖
const SECRET_VERIFY = 'SYNTH-VERIFY-SECRET-FOR-TEST' //srv.mjs 之 verify* 拋錯訊息
const SECRET_REF = 'SYNTH-REF-SECRET-FOR-TEST' //Referer 查詢值
const SECRET_Y1 = 'SYNTH-TS-Y1-SECRET' //重複 token 參數(Hapi 解析為陣列)
const SECRET_Y2 = 'SYNTH-TS-Y2-SECRET'
const SECRETS = [SECRET_SYS, SECRET_VERIFY, SECRET_REF, SECRET_Y1, SECRET_Y2, TOKEN_REJECT, 'getSsoUserInfor']

const ID_VT = 'id-for-verify-throw' //srv.mjs '{token-for-verify-throw}' 之使用者 id; 本檔以後台列建立於 perm users 表(見檔頭)
const ROW_VT = { id: ID_VT, order: 99, name: 'verify-throw', email: 'verify-throw@example.com', description: '', from: '', cgrups: '{}', isAdmin: 'y', isActive: 'y' }
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
    //本文須為協定合規之外部匯入(每列帶 srcKey、不帶 id): 否則被拒時無法區分「權杖被拒」與「本文不合規(idNotAllowed／srcKeyInvalid)」, 權杖防線退化時「不得寫入」之斷言亦會空過
    let row = { srcKey: 'sk-ts-blocked', order: 0, name: 'blocked', email: 'blocked@apiTokenSafety.test', from: FROM_BLOCKED, cgrups: '{}', isAdmin: 'n', isActive: 'y' }
    let post ={ method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ from: FROM_BLOCKED, rows: [row] }) }
    return [
        ['GET /api/getUserByToken', `${apiBaseUrl}/api/getUserByToken?${tokenQuery}`, {}],
        ['GET /api/getPerm', `${apiBaseUrl}/api/getPerm?${tokenQuery}`, {}],
        ['GET /api/getPermUserInfor', `${apiBaseUrl}/api/getPermUserInfor?${tokenQuery}&userId=${SEED.adminId}`, {}],
        ['POST /syncAndReplaceTabs', `${apiBaseUrl}/syncAndReplaceTabs?keyTable=users&${tokenQuery}`, post],
    ]
}


describe('api-tokenSafety', function() {
    this.timeout(300000)

    let mark = null //srLog 標記(以檔案位置定位本檔動作之後新增之行, 不比對跨行程時鐘; R-SRLOG-MARK-01)

    before(async function() {
        await startApi()
        mark = await markSrLog()
        //建立 id-for-verify-throw(後台列, isActive='y'), 使 client 通道之驗證走到 verifyClientUser(editTableRows 經系統管理者寫入 RPC, 失敗即拋錯)
        await editTableRows('users', (rows) => {
            assert.strict.ok(!rows.some((v) => v.id === ID_VT), `前置: perm users 不得已有 ${ID_VT}(上一檔殘留)`)
            rows.push({ ...ROW_VT })
        })
        assert.strict.ok((await selectAllRows('users')).some((v) => v.id === ID_VT && v.isActive === 'y'), `前置: ${ID_VT} 應已建立且 isActive='y'`)
    })

    after(async function() {
        this.timeout(60000)
        //移除本檔建立之後台列(整表寫入; 其餘列原樣帶回), 並回驗已移除
        await editTableRows('users', (rows) => rows.filter((v) => v.id !== ID_VT))
        assert.strict.ok(!(await selectAllRows('users')).some((v) => v.id === ID_VT), `收尾: ${ID_VT} 應已移除`)
        await cleanExternalFixtures({ kts: ['users'], froms: [FROM_BLOCKED] }) //被拒之同步請求應始終未寫入; 若防線退化而殘留則於此清除並回驗(外部列夾具收尾之單一入口, R-TEST-EXT-CLEAN-01)
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
        //E6: Authorization 有效(sys)、本體 __sysToken__ 為 {token-for-reject} → getUserIdByToken(完整驗證, perm-run03)走上游失敗路徑(getUserByToken 失敗 ≡ 查無), 函數不得執行, 回固定語系鍵 cannotFindUserFromToken
        let r3 = await callRpc('getWebInfor', [], TOKEN_ADMIN, { sysToken: TOKEN_REJECT })
        if (r3.ok || r3.msg !== 'cannotFindUserFromToken') {
            bad.push(`E6: getUserIdByToken 失敗時不得執行且應回 cannotFindUserFromToken, 實得 ${JSON.stringify(r3)}`)
        }
        //E6b: Authorization 有效(sys)、本體 __sysToken__ 為 {token-for-verify-throw}(perm users 內有效, 但 verifyClientUser 拋錯 ≡ 無權限) → getUserIdByToken 拒, 函數不得執行, 回 userNoPermission, 不含合成秘密
        let r3b = await callRpc('getWebInfor', [], TOKEN_ADMIN, { sysToken: TOKEN_VERIFY_THROW })
        if (r3b.ok || r3b.msg !== 'userNoPermission') {
            bad.push(`E6b: 本體權杖之使用者驗證拋錯時不得執行且應回 userNoPermission, 實得 ${JSON.stringify(r3b)}`)
        }
        for (let r of [r1, r2, r3, r3b]) {
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
        let sentinel = `tsSentinel${process.pid}x${Date.now()}`
        //應用系統路由先驗身分再驗 keyTable(perm-run01 P-5): 哨兵請求須帶系統管理者等級之 token(TOKEN_APP＝系統服務用途)才會走到 keyTable 檢查並記 srLog
        await httpText(`${apiBaseUrl}/syncAndReplaceTabs?keyTable=${sentinel}&token=${encodeURIComponent(TOKEN_APP)}`, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: '{}' })
        let lines = []
        let tEnd = Date.now() + 30000
        while (Date.now() < tEnd) {
            lines = readSrLogSince(mark)
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
        //W 契約: 呼叫點記 error(果)——getUserIdByToken 為完整驗證(perm-run03), 上游失敗走 getTokenUser 之查無分支, srLog 記該固定語系鍵(E6: cannotFindUserFromToken; E6b: userNoPermission), 不含上游原文
        if (!lines.some((l) => l.event === 'getUserIdByToken-error' && l.msg === 'cannotFindUserFromToken')) {
            bad.push('缺 getUserIdByToken-error { msg:\'cannotFindUserFromToken\' }(E6 上游失敗應走查無分支)')
        }
        if (!lines.some((l) => l.event === 'getUserIdByToken-error' && l.msg === 'userNoPermission')) {
            bad.push('缺 getUserIdByToken-error { msg:\'userNoPermission\' }(E6b 本體權杖之使用者驗證拋錯應視同無權限)')
        }

        assert.strict.deepEqual(bad, [], `${bad.length} 項:\n${bad.join('\n')}`)
    })

})
