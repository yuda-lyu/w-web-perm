//呼叫者 × 入口 存取矩陣(perm-run01 本輪; 使用者 2026-10-24 定案之 token 權責; 真後端)。
//規格: C:\opensrcOper\dspec\w-web存取管控表.md 第二節(w-web-perm; AU＝使用者用途、AS＝系統服務用途)、dspec/使用者身分驗證原則.md 二之一; 規則帳本 R-APP-TOKEN-01(sgud/rule/rulebook_security.md)。
//
//定義: 管理員之判準為 perm 自身 users 表(isAdmin='y' 且 isActive='y'); 使用者用途之應用系統 token(AU)以所綁使用者之 perm 列判定(同其使用者 token); 系統服務用途(AS)不在 perm users 表、
//      部署方 getUserByToken 轉傳 isApp='y' 且 isAdmin='y'(反查 id 如 'app:<金鑰主鍵>'), 可用管理員之後端服務, 稽核欄記其 id; 不可用 /api/getPerm(無「本人」權限樹)。
//呼叫者軸: N 無 token、U 一般使用者、A 管理員、AUA 使用者用途綁管理員、AUM 使用者用途綁一般使用者、AS 系統服務用途;
//          相容軸: NF isApp 未轉傳(AS 形狀)、ASN AS 形狀但 isAdmin n、AUD 使用者用途綁停用之使用者、APP 虛擬應用系統(TOKEN_APP; 現轉傳 isApp)。
//入口軸(24): 靜態檔 1、hapi 路由 4(getUserByToken／getPerm／getPermUserInfor／syncAndReplaceTabs)、通訊路由 5(ulctr／slc／dwgfn／dwgf／dw)、資料通道函數 14
//          (表 select ×4、getWebInfor、updateTargets／Pemis／Grups／Users、getStaEvent／getStaEventTable、系統函數 ×3); 資料通道每格另分「標頭 token(連線閘)」「本體 __sysToken__(執行身分)」兩個身分來源。
//跑法(需測試鎖): node C:/opensrcOper/tools/quiet-run.mjs --name tmatrix --lock --timeout 3000 -- npx mocha --no-parallel test/api-callerMatrix.test.mjs --timeout 300000
import assert from 'assert'
import obj2u8arr from 'wsemi/src/obj2u8arr.mjs'
import u8arr2obj from 'wsemi/src/u8arr2obj.mjs'
import { assertPristineSeed } from './tools/baseSeed.mjs'
import {
    startApi, apiBaseUrl, urlSync,
    TOKEN_ADMIN, TOKEN_MEMBER, TOKEN_APP, TOKEN_AS, TOKEN_AS_N, TOKEN_NOFLAG, TOKEN_AU_ADMIN, TOKEN_AU_MEMBER, TOKEN_AU_DISABLED, TOKEN_DENY, TOKEN_AS_DENY, TOKEN_AS_MUTATE, TOKEN_ALT_ADMIN, TOKEN_AU_DISABLED_ALT, TOKEN_BAD, TOKEN_PETER,
    callRpc, readTables, selectAllRows, purgeExternalRows, cleanExternalFixtures, markSrLog, readSrLogSince,
} from './tools/api-setup.mjs'
import { restartBackend, genTempSettings } from './tools/e2e-setup.mjs'
import procLang from '../server/procLang.mjs'

const A = assert.strict
const KTS = ['users', 'grups', 'pemis', 'targets']
const FN = { users: 'updateUsers', grups: 'updateGrups', pemis: 'updatePemis', targets: 'updateTargets' }
const KEYS = new Set(Object.keys(procLang({}).eng)) //語系鍵全集: 路由失敗之 msg 一律須在其內(R-ROUTE-MSG-01)
const F_SYNC = 'appMatrix' //同步端點之專屬 from 分區

let clone = (o) => JSON.parse(JSON.stringify(o))
let byId = (a, b) => String(a.id).localeCompare(String(b.id))
let byOrder = (a, b) => ((a.order || 0) - (b.order || 0)) || byId(a, b)
let rowsOf = async (kt) => (await selectAllRows(kt)).slice().sort(byOrder).map(clone)
let snapKt = async (kt) => JSON.stringify((await selectAllRows(kt)).slice().sort(byId))
let snap4 = async () => JSON.stringify(await Promise.all(KTS.map(snapKt)))
let sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let userRow = (id, name, isAdmin, isActive, cgrups) => ({ id, order: 50, name, email: `${name}@example.com`, description: '', from: '', cgrups, isAdmin, isActive })

//呼叫者: lvl＝是否為管理員等級(可用管理員之服務); own＝可用 /api/getPerm 者其本人 id; aud＝其寫入之稽核欄 id(userId／userIdUpdate)
const CALLERS = [
    { k: 'N', label: '無 token', token: '', lvl: false, own: null, aud: null },
    { k: 'U', label: '一般使用者', token: TOKEN_MEMBER, lvl: false, own: 'id-for-member', aud: null },
    { k: 'A', label: '管理員', token: TOKEN_ADMIN, lvl: true, own: 'id-for-admin', aud: 'id-for-admin' },
    { k: 'AUA', label: '使用者用途綁管理員', token: TOKEN_AU_ADMIN, lvl: true, own: 'id-for-admin', aud: 'id-for-admin' },
    { k: 'AUM', label: '使用者用途綁一般使用者', token: TOKEN_AU_MEMBER, lvl: false, own: 'id-for-peter', aud: null },
    { k: 'AS', label: '系統服務用途', token: TOKEN_AS, lvl: true, own: null, aud: 'app:key-sys' },
]
const COMPAT = [
    { k: 'NF', label: 'isApp 未轉傳(AS 形狀)', token: TOKEN_NOFLAG, lvl: false, own: null, aud: null },
    { k: 'ASN', label: 'AS 形狀但 isAdmin n', token: TOKEN_AS_N, lvl: false, own: null, aud: null },
    { k: 'AUD', label: '使用者用途綁停用之使用者', token: TOKEN_AU_DISABLED, lvl: false, own: null, aud: null },
    { k: 'APP', label: '虛擬應用系統 TOKEN_APP(轉傳 isApp)', token: TOKEN_APP, lvl: true, own: null, aud: 'id-for-application' },
]
const ALL = [...CALLERS, ...COMPAT]

//回應不得含之資料特徵(管理員視角之 base seed 資料)
const LEAK = ['admin@example.com', 'peter@example.com', 'mary@example.com', 'john@example.com', '權限群組M1', '權限群組M4']

let getJson = async (path) => {
    let r = await fetch(`${apiBaseUrl}${path}`)
    return await r.json()
}
let q = (token) => encodeURIComponent(token)

//waitLines: srLog 經 pino 非同步落檔, 以標記(動作之前取)定位後輪詢到符合 pred 之行
let waitLines = async (mark, pred, label, ms = 30000) => {
    let tEnd = Date.now() + ms
    let lines = []
    while (Date.now() < tEnd) {
        lines = readSrLogSince(mark)
        if (lines.some(pred)) {
            return lines
        }
        await sleep(100)
    }
    throw new Error(`${label}: ${ms} ms 內未見預期之 log 行; 實得 ${JSON.stringify(lines.map((l) => l.event || l.msg)).slice(0, 300)}`)
}

//rawRpc: 直打 POST /api/main(自組 input, 供 [sys:polling] 之 { clientId } 協定與自訂 Authorization 標頭); 回 { ok, msg, raw }(同 callRpc 之判讀)
let rawRpc = async (func, input, headers = {}) => {
    let r = await fetch(`${apiBaseUrl}/api/main`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', ...headers }, body: Buffer.from(obj2u8arr({ func, input })) })
    let u8a = new Uint8Array(await r.arrayBuffer())
    let raw = Buffer.from(u8a).toString('utf8')
    let o = u8arr2obj(u8a)
    if (o && typeof o === 'object' && 'success' in o) {
        let out = o.success && o.success.output
        if (out && typeof out === 'object' && 'state' in out) {
            return { ok: out.state === 'success', msg: typeof out.msg === 'string' ? out.msg : JSON.stringify(out.msg), raw }
        }
        return { ok: true, msg: '', raw }
    }
    return { ok: false, msg: String(o && o.error), raw }
}


describe('api-callerMatrix (呼叫者 × 入口 存取矩陣, perm-run01 R-APP-TOKEN-01, 真後端)', function() {
    this.timeout(600000)

    let BASE = null
    let CGRUPS_PETER = ''
    let stat = { cells: 0 } //輸入空間統計: 已斷言格數(報告引用)

    let restoreBase = async () => {
        await purgeExternalRows(KTS, { keepIds: Object.fromEntries(KTS.map((kt) => [kt, BASE[kt].map((r) => r.id)])) })
        for (let kt of ['targets', 'pemis', 'grups', 'users']) {
            let r = await callRpc(FN[kt], [clone(BASE[kt])], TOKEN_ADMIN)
            if (!r.ok) {
                throw new Error(`restoreBase ${FN[kt]} 失敗: ${JSON.stringify(r).slice(0, 200)}`)
            }
        }
    }
    //fixtures: member(一般使用者, 通過部署方)、appdis(使用者用途綁定之使用者, 在表但停用, 上游 isAdmin y)
    let addFixtures = async () => {
        let cur = await rowsOf('users')
        let r = await callRpc('updateUsers', [[...cur, userRow('id-for-member', 'member', 'n', 'y', CGRUPS_PETER), userRow('id-for-appdis', 'appdis', 'y', 'n', '{}')]], TOKEN_ADMIN)
        A.ok(r.ok, `夾具使用者應建立成功: ${JSON.stringify(r).slice(0, 300)}`)
    }
    let resetFixtures = async () => {
        await restoreBase()
        await addFixtures()
    }

    before(async function() {
        this.timeout(300000)
        await startApi()
        for (let kt of KTS) {
            assertPristineSeed(kt, await selectAllRows(kt))
        }
        BASE = await readTables()
        BASE.targets = await rowsOf('targets')
        CGRUPS_PETER = BASE.users.find((u) => u.id === 'id-for-peter').cgrups
        await addFixtures()
    })

    afterEach(async function() {
        this.timeout(120000)
        await resetFixtures()
    })

    after(async function() {
        this.timeout(300000)
        await restartBackend('./settings.json')
        await restoreBase()
        await cleanExternalFixtures({ froms: [F_SYNC] })
    })


    // ===== [H] 靜態檔與 hapi 路由 =====
    describe('H 靜態檔與 hapi 路由(5 入口 × 10 呼叫者)', function() {

        it('MX-H1 靜態檔 /{file*}: 所有呼叫者(含無 token)皆可取得  [靜態檔公開, 表第二節]', async function() {
            for (let c of ALL) {
                for (let p of ['/index.html', '/']) {
                    let r = await fetch(`${apiBaseUrl}${p}`, { headers: c.token === '' ? {} : { Authorization: `Bearer ${c.token}` } })
                    A.equal(r.status, 200, `${c.k} ${p}`)
                    await r.text()
                    stat.cells++
                }
            }
        })

        it('MX-H2 GET /api/getUserByToken(後台登入檢查): 管理員等級(A／AUA／AS／APP)通過並回該身分; 其餘一律拒、固定語系鍵、不回資料  [P-2: AS 放行]', async function() {
            for (let c of ALL) {
                let r = await getJson(`/api/getUserByToken?token=${q(c.token)}`)
                if (c.lvl) {
                    A.equal(r.state, 'success', `${c.k}: ${JSON.stringify(r).slice(0, 200)}`)
                    A.equal(r.msg.isAdmin, 'y', `${c.k}`)
                    A.equal(r.msg.id, c.aud, `${c.k} 回傳身分之 id`)
                }
                else {
                    A.equal(r.state, 'error', `${c.k}: ${JSON.stringify(r).slice(0, 200)}`)
                    A.ok(KEYS.has(r.msg), `${c.k}: 失敗 msg 應為語系鍵, 實得 ${JSON.stringify(r.msg)}`)
                    for (let s of LEAK) {
                        A.ok(!JSON.stringify(r).includes(s), `${c.k}: 被拒回應不得含 ${s}`)
                    }
                }
                stat.cells++
            }
            //固定鍵(各拒絕原因): 無 token tokenNoPermission、一般使用者與 AU 綁一般使用者 userNotAdmin、isApp 未轉傳者與 AS 形狀非管理員、AU 綁停用者不在有效 perm 列 → cannotGetUserFromPerm／cannotGetUserEmail
            A.equal((await getJson(`/api/getUserByToken?token=`)).msg, 'tokenNoPermission')
            A.equal((await getJson(`/api/getUserByToken?token=${q(TOKEN_MEMBER)}`)).msg, 'userNotAdmin')
            A.equal((await getJson(`/api/getUserByToken?token=${q(TOKEN_AU_MEMBER)}`)).msg, 'userNotAdmin')
            A.equal((await getJson(`/api/getUserByToken?token=${q(TOKEN_NOFLAG)}`)).msg, 'cannotGetUserFromPerm')
            A.equal((await getJson(`/api/getUserByToken?token=${q(TOKEN_AU_DISABLED)}`)).msg, 'cannotGetUserFromPerm')
            A.equal((await getJson(`/api/getUserByToken?token=${q(TOKEN_AS_N)}`)).msg, 'cannotGetUserEmail')
        })

        it('MX-H3 GET /api/getPerm(查本人權限樹): U／A／AUA／AUM 得本人之樹; N、AS、NF、ASN、AUD 拒(AS 無「本人」)  [表第二節; AU＝所綁使用者]', async function() {
            for (let c of ALL) {
                let r = await getJson(`/api/getPerm?token=${q(c.token)}`)
                if (c.own !== null) {
                    A.equal(r.state, 'success', `${c.k}: ${JSON.stringify(r).slice(0, 200)}`)
                    A.equal(r.msg.user.id, c.own, `${c.k} 應得本人(所綁使用者)之樹`)
                }
                else {
                    A.equal(r.state, 'error', `${c.k}: ${JSON.stringify(r).slice(0, 200)}`)
                    A.ok(KEYS.has(r.msg), `${c.k}: 失敗 msg 應為語系鍵, 實得 ${JSON.stringify(r.msg)}`)
                }
                stat.cells++
            }
            A.equal((await getJson(`/api/getPerm?token=${q(TOKEN_AS)}`)).state, 'error', 'AS(真實形狀: email 空)不可查本人樹')
            A.equal((await getJson(`/api/getPerm?token=${q(TOKEN_APP)}`)).state, 'error', 'TOKEN_APP(有 email, 不在表)不可查本人樹')
            //AU 綁一般使用者之樹 ≡ 該使用者以使用者 token 查得者
            let au = (await getJson(`/api/getPerm?token=${q(TOKEN_AU_MEMBER)}`)).msg
            let up = (await getJson(`/api/getPerm?token=${q(TOKEN_PETER)}`))
            A.equal(up.state, 'success')
            A.deepEqual(au.rules, up.msg.rules, '使用者用途綁 peter 之權限樹 ≡ peter 之使用者 token 查得者')
        })

        it('MX-H4 GET /api/getPermUserInfor(查他人權限樹): 管理員等級(A／AUA／AS／APP)通過; 其餘拒  [P-1: 套件自行要求管理員等級]', async function() {
            for (let c of ALL) {
                let r = await getJson(`/api/getPermUserInfor?token=${q(c.token)}&userId=id-for-peter`)
                if (c.lvl) {
                    A.equal(r.state, 'success', `${c.k}: ${JSON.stringify(r).slice(0, 200)}`)
                    A.equal(r.msg.user.id, 'id-for-peter', `${c.k}`)
                }
                else {
                    A.equal(r.state, 'error', `${c.k}: ${JSON.stringify(r).slice(0, 200)}`)
                    A.ok(KEYS.has(r.msg), `${c.k}: 失敗 msg 應為語系鍵, 實得 ${JSON.stringify(r.msg)}`)
                    for (let s of LEAK) {
                        A.ok(!JSON.stringify(r).includes(s), `${c.k}: 被拒回應不得含 ${s}`)
                    }
                }
                stat.cells++
            }
            //固定鍵: 一般使用者與 AU 綁一般使用者 userNotAdmin; isApp 未轉傳之虛擬應用系統(不在表)userNotAdmin
            A.equal((await getJson(`/api/getPermUserInfor?token=${q(TOKEN_MEMBER)}&userId=id-for-peter`)).msg, 'userNotAdmin')
            A.equal((await getJson(`/api/getPermUserInfor?token=${q(TOKEN_AU_MEMBER)}&userId=id-for-peter`)).msg, 'userNotAdmin')
            A.equal((await getJson(`/api/getPermUserInfor?token=${q(TOKEN_NOFLAG)}&userId=id-for-peter`)).msg, 'userNotAdmin')
            A.equal((await getJson(`/api/getPermUserInfor?token=${q(TOKEN_AS_N)}&userId=id-for-peter`)).msg, 'userNotAdmin')
            A.equal((await getJson(`/api/getPermUserInfor?token=&userId=id-for-peter`)).msg, 'tokenNoPermission')
        })

        it('MX-H5 POST /syncAndReplaceTabs(整表覆寫): 管理員等級通過並寫入(稽核欄 userId 記呼叫者 id); 其餘拒且零寫入  [P-1; P-2 稽核欄記 app:…]', async function() {
            for (let c of ALL) {
                let s0 = await snap4()
                let row = { srcKey: `sk-${c.k}`, order: 0, name: `n-${c.k}`, description: c.k, cpemis: '{}' }
                let url = urlSync.replace('{keyTable}', 'grups').replace('{token}', q(c.token))
                let res = await (await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ from: F_SYNC, rows: [row] }) })).json()
                if (c.lvl) {
                    A.equal(res.state, 'success', `${c.k}: ${JSON.stringify(res).slice(0, 300)}`)
                    let w = (await rowsOf('grups')).find((g) => g.from === F_SYNC && g.srcKey === `sk-${c.k}`)
                    A.ok(w, `${c.k}: 新列已寫入`)
                    A.equal(w.userId, c.aud, `${c.k}: 稽核欄 userId 應為呼叫者 id`)
                }
                else {
                    A.equal(res.state, 'error', `${c.k}: ${JSON.stringify(res).slice(0, 300)}`)
                    A.ok(KEYS.has(res.msg), `${c.k}: 失敗 msg 應為語系鍵, 實得 ${JSON.stringify(res.msg)}`)
                    A.equal(await snap4(), s0, `${c.k}: 零寫入`)
                }
                stat.cells++
                await cleanExternalFixtures({ kts: ['grups'], froms: [F_SYNC] })
            }
        })
    })


    // ===== [C] 通訊路由 =====
    describe('C 通訊路由(ulctr／slc／dwgfn／dwgf／dw × 10 呼叫者): 同一連線閘, 管理員等級過閘, 其餘 permission denied', function() {
        let routes = [
            { name: '/api/ulctr(upload-controller)', path: '/api/ulctr', method: 'POST' },
            { name: '/api/slc(upload-slice)', path: '/api/slc', method: 'POST' },
            { name: '/api/dwgfn(download-get-filename)', path: '/api/dwgfn', method: 'POST' },
            { name: '/api/dwgf(download-get-file)', path: '/api/dwgf', method: 'GET' },
            { name: '/api/dw(download)', path: '/api/dw', method: 'POST' },
        ]
        let callRoute = async (rt, token) => {
            let url = `${apiBaseUrl}${rt.path}${rt.method === 'GET' ? `?token=${q(token)}` : ''}`
            let r = await fetch(url, { method: rt.method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' }, body: rt.method === 'GET' ? undefined : Buffer.from('x') })
            let body = Buffer.from(await r.arrayBuffer()).toString('latin1')
            return { status: r.status, body }
        }
        for (let rt of routes) {
            it(`MX-C ${rt.name}: 非管理員等級之回應 ≡ 無效 token 之回應(permission denied); 管理員等級已過閘`, async function() {
                let bad = await callRoute(rt, TOKEN_BAD)
                A.ok(bad.body.includes('permission denied'), `無效 token 應為 permission denied: ${bad.body.slice(0, 100)}`)
                for (let c of ALL) {
                    let r = await callRoute(rt, c.token)
                    if (c.lvl) {
                        A.ok(!r.body.includes('permission denied'), `${c.k} 應已過閘(回應為參數類錯誤): ${r.body.slice(0, 100)}`)
                    }
                    else {
                        A.equal(r.status, bad.status, `${c.k}: HTTP 狀態同無效 token`)
                        A.equal(r.body, bad.body, `${c.k}: 回應本體同無效 token`)
                    }
                    stat.cells++
                }
            })
        }
    })


    // ===== [D] 資料通道 14 函數 × 10 呼叫者 × 2 身分來源 =====
    describe('D 資料通道(/api/main)14 個函數 × 10 呼叫者 × 標頭／本體兩個身分來源', function() {
        let descOf = (c) => `by-${c.k}`
        let entries = [
            { name: 'getWebInfor', fn: 'getWebInfor', args: async () => [] },
            { name: 'getStaEventTable', fn: 'getStaEventTable', args: async () => [] },
            { name: 'getStaEvent', fn: 'getStaEvent', args: async () => [7, 'hr'] },
            { name: 'users.select', fn: 'users.select', args: async () => [] },
            { name: 'grups.select', fn: 'grups.select', args: async () => [] },
            { name: 'pemis.select', fn: 'pemis.select', args: async () => [] },
            { name: 'targets.select', fn: 'targets.select', args: async () => [] },
            { name: '[sys:getFuncList]', fn: '[sys:getFuncList]', args: async () => [] },
            { name: '[sys:getTableTags]', fn: '[sys:getTableTags]', args: async () => [] },
            //[sys:polling](w-serv-broadcast 輪詢; 輸入為 { clientId }): 連線閘(標頭)與其他入口同; 其本體 __sysToken__ 之身分檢查屬框架(w-serv-webdata ≥1.1.16 之 verifyPolling; 本機安裝 w-serv-broadcast 1.1.10 無此檢查,
            //  排程第 128 項 sysFuncsPublic 嚴格設定), 故只測標頭來源(onlyHeader)
            { name: '[sys:polling]', fn: '[sys:polling]', onlyHeader: true, call: async (c, src) => rawRpc('[sys:polling]', { clientId: `mx-${c.k}`, __sysToken__: c.token }, { Authorization: `Bearer ${c.token}` }) },
            { name: 'updateUsers', fn: 'updateUsers', kt: 'users', args: async (c) => [(await rowsOf('users')).map((r, k) => (k === 0 ? { ...r, description: descOf(c) } : r))] },
            { name: 'updateGrups', fn: 'updateGrups', kt: 'grups', args: async (c) => [(await rowsOf('grups')).map((r, k) => (k === 0 ? { ...r, description: descOf(c) } : r))] },
            { name: 'updatePemis', fn: 'updatePemis', kt: 'pemis', args: async (c) => [(await rowsOf('pemis')).map((r, k) => (k === 0 ? { ...r, description: descOf(c) } : r))] },
            { name: 'updateTargets', fn: 'updateTargets', kt: 'targets', args: async (c) => [(await rowsOf('targets')).map((r, k) => (k === 0 ? { ...r, description: descOf(c) } : r))] },
        ]

        for (let e of entries) {
            it(`MX-D ${e.name}: 管理員等級(A／AUA／AS／APP)成功, 其餘於連線閘 permission denied、於執行身分回固定語系鍵; 零寫入  [P-2]`, async function() {
                for (let c of ALL) {
                    for (let src of (e.onlyHeader ? ['header'] : ['header', 'body'])) {
                        let s0 = await snap4()
                        let args = e.args ? await e.args(c) : null
                        let r = e.call ? await e.call(c, src) : ((src === 'header') ? await callRpc(e.fn, args, c.token) : await callRpc(e.fn, args, TOKEN_ADMIN, { sysToken: c.token }))
                        let tag = `${e.name} ${c.k} ${src}`
                        if (c.lvl) {
                            A.equal(r.ok, true, `${tag}: ${JSON.stringify(r).slice(0, 300)}`)
                            if (e.kt) {
                                //稽核欄: 該表第 1 列(order 最小)被改, userIdUpdate 記呼叫者(執行身分)id; 本體來源時為本體 token 之身分
                                let row = (await rowsOf(e.kt))[0]
                                A.equal(row.description, descOf(c), `${tag}: 寫入生效`)
                                A.equal(row.userIdUpdate, c.aud, `${tag}: 稽核欄 userIdUpdate 應為呼叫者 id`)
                                await resetFixtures()
                            }
                        }
                        else {
                            A.equal(r.ok, false, `${tag}: 不得成功, 實得 ${JSON.stringify(r).slice(0, 200)}`)
                            if (src === 'header') {
                                A.equal(r.msg, 'permission denied', `${tag}: 連線閘`)
                            }
                            else {
                                A.ok(KEYS.has(r.msg) || r.msg === 'permission denied' || /sysToken|userId/i.test(r.msg), `${tag}: 執行身分之拒絕應為固定語系鍵, 實得 ${r.msg}`)
                            }
                            for (let s of LEAK) {
                                A.ok(!r.raw.includes(s), `${tag}: 被拒回應不得含 ${s}`)
                            }
                            A.equal(await snap4(), s0, `${tag}: 零寫入`)
                        }
                        stat.cells++
                    }
                }
            })
        }
    })


    // ===== [P] 使用者用途跟隨所綁使用者之 perm 列; 部署方否決; 檢查之值即使用之值 =====
    describe('P 使用者用途跟隨所綁使用者; 部署方否決; 檢查之值即使用之值', function() {

        it('MX-P1 AU 綁管理員: 該管理員被降為一般使用者 → AU 同步失去管理員服務(資料通道、後台登入、應用路由皆拒); 升回後恢復  [AU＝同綁定者, perm 列為權威]', async function() {
            let setAdmin = async (id, isAdmin) => {
                let users = (await rowsOf('users')).map((u) => (u.id === id ? { ...u, isAdmin } : u))
                let r = await callRpc('updateUsers', [users], TOKEN_ADMIN)
                A.equal(r.ok, true, JSON.stringify(r).slice(0, 300))
            }
            //peter 升為管理員 → AUM(綁 peter)得管理員服務
            await setAdmin('id-for-peter', 'y')
            A.equal((await callRpc('getWebInfor', [], TOKEN_AU_MEMBER)).ok, true, 'AUM 綁定者升為管理員後應可用資料通道')
            A.equal((await getJson(`/api/getUserByToken?token=${q(TOKEN_AU_MEMBER)}`)).state, 'success')
            A.equal((await getJson(`/api/getPermUserInfor?token=${q(TOKEN_AU_MEMBER)}&userId=id-for-admin`)).state, 'success')
            //降回 → 失去
            await setAdmin('id-for-peter', 'n')
            A.equal((await callRpc('getWebInfor', [], TOKEN_AU_MEMBER)).ok, false)
            A.equal((await getJson(`/api/getUserByToken?token=${q(TOKEN_AU_MEMBER)}`)).msg, 'userNotAdmin')
            A.equal((await getJson(`/api/getPermUserInfor?token=${q(TOKEN_AU_MEMBER)}&userId=id-for-admin`)).msg, 'userNotAdmin')
            stat.cells += 6
        })

        it('MX-P2 AU 綁停用之使用者: 不因「停用視同查無」落入系統服務用途; 該使用者啟用且為管理員後可用, 停用後又拒  [AU 在表者以 perm 列為準]', async function() {
            let setRow = async (patch) => {
                let users = (await rowsOf('users')).map((u) => (u.id === 'id-for-appdis' ? { ...u, ...patch } : u))
                let r = await callRpc('updateUsers', [users], TOKEN_ADMIN)
                A.equal(r.ok, true, JSON.stringify(r).slice(0, 300))
            }
            A.equal((await callRpc('getWebInfor', [], TOKEN_AU_DISABLED)).ok, false, '綁停用者: 資料通道拒')
            A.equal((await getJson(`/api/getUserByToken?token=${q(TOKEN_AU_DISABLED)}`)).state, 'error')
            A.equal((await getJson(`/api/getPermUserInfor?token=${q(TOKEN_AU_DISABLED)}&userId=id-for-peter`)).state, 'error', '綁停用者: 應用路由拒')
            await setRow({ isActive: 'y' })
            A.equal((await callRpc('getWebInfor', [], TOKEN_AU_DISABLED)).ok, true, '啟用且 isAdmin y 後可用')
            await setRow({ isActive: 'n' })
            A.equal((await callRpc('getWebInfor', [], TOKEN_AU_DISABLED)).ok, false, '再停用後又拒')
            stat.cells += 5
        })

        it('MX-P3 AS 被部署方 verifyAppUser 因非角色因素否決: 後台登入、應用路由、資料通道(標頭 permission denied／本體 userNoPermission)皆拒且零寫入  [部署方可再收緊]', async function() {
            let s0 = await snap4()
            let mark = await markSrLog()
            A.equal((await getJson(`/api/getUserByToken?token=${q(TOKEN_AS_DENY)}`)).msg, 'userNoPermission')
            //拒絕須有對應 srLog(event／msg／from; 不含 token 與使用者資料)  [外審 sol F10]
            let lines = await waitLines(mark, (l) => l.event === 'getAndVerifyAdminUser-error' && l.msg === 'userNoPermission' && l.from === 'getUserByToken', 'AS 否決 srLog')
            A.ok(!JSON.stringify(lines).includes(TOKEN_AS_DENY) && !JSON.stringify(lines).includes('app:key-deny'), 'srLog 不得含 token 與服務身分 id')
            A.equal((await getJson(`/api/getPermUserInfor?token=${q(TOKEN_AS_DENY)}&userId=id-for-peter`)).msg, 'userNoPermission')
            let url = urlSync.replace('{keyTable}', 'grups').replace('{token}', q(TOKEN_AS_DENY))
            let res = await (await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ from: F_SYNC, rows: [{ srcKey: 'sk-deny', order: 0, name: 'n-deny', description: 'x', cpemis: '{}' }] }) })).json()
            A.equal(res.msg, 'userNoPermission')
            let h = await callRpc('getWebInfor', [], TOKEN_AS_DENY)
            A.equal(h.ok, false)
            A.equal(h.msg, 'permission denied')
            let b = await callRpc('getWebInfor', [], TOKEN_ADMIN, { sysToken: TOKEN_AS_DENY })
            A.equal(b.ok, false)
            A.equal(b.msg, 'userNoPermission')
            A.equal(await snap4(), s0)
            stat.cells += 6
        })

        it('MX-P4 管理員之 perm 列因非角色因素被 verifyClientUser 否決(TOKEN_DENY): userNoPermission  [P-7: 部署方否決者之固定鍵]', async function() {
            let users = [...(await rowsOf('users')), userRow('id-for-deny', 'deny', 'y', 'y', '{}')]
            A.equal((await callRpc('updateUsers', [users], TOKEN_ADMIN)).ok, true)
            A.equal((await getJson(`/api/getUserByToken?token=${q(TOKEN_DENY)}`)).msg, 'userNoPermission')
            A.equal((await callRpc('getWebInfor', [], TOKEN_DENY)).msg, 'permission denied')
            A.equal((await callRpc('getWebInfor', [], TOKEN_ADMIN, { sysToken: TOKEN_DENY })).msg, 'userNoPermission')
            //拒絕鍵次序(1.1.15 行為不變): 同時『部署方否決』與『非管理員』→ 部署方否決先(userNoPermission), 不是 userNotAdmin  [外審 sol F09]
            //  deny 之 perm 列降為一般使用者後: 後台登入檢查(client 路徑)與應用路由(srv.mjs 之 verifyAppUser 亦否決 id-for-deny)皆先見 userNoPermission
            let users2 = (await rowsOf('users')).map((u) => (u.id === 'id-for-deny' ? { ...u, isAdmin: 'n' } : u))
            A.equal((await callRpc('updateUsers', [users2], TOKEN_ADMIN)).ok, true)
            A.equal((await getJson(`/api/getUserByToken?token=${q(TOKEN_DENY)}`)).msg, 'userNoPermission', '雙原因(否決＋非管理員): 部署方否決先')
            A.equal((await getJson(`/api/getPermUserInfor?token=${q(TOKEN_DENY)}&userId=id-for-peter`)).msg, 'userNoPermission', '應用路由雙原因: 部署方否決先')
            A.equal((await callRpc('getWebInfor', [], TOKEN_ADMIN, { sysToken: TOKEN_DENY })).msg, 'userNoPermission', '執行身分雙原因: 部署方否決先')
            stat.cells += 6
        })

        it('MX-P7 標頭與本體為不同身分之組合(資料通道兩個身分來源各自完整驗證, 函數以本體身分執行): 服務身分／管理員交叉  [外審 sol F01]', async function() {
            let addGrup = async (id) => (await rowsOf('grups')).concat([{ id, order: 0, name: id, description: '', from: '', cpemis: '{}' }])
            let runAs = async (hdr, body, id) => {
                let w = await callRpc('updateGrups', [await addGrup(id)], hdr, { sysToken: body })
                return w
            }
            //標頭 AS＋本體 A → 以 A 執行
            let w1 = await runAs(TOKEN_AS, TOKEN_ADMIN, 'id-mx-p7a')
            A.equal(w1.ok, true, JSON.stringify(w1).slice(0, 300))
            A.equal((await rowsOf('grups')).find((g) => g.id === 'id-mx-p7a').userId, 'id-for-admin')
            //標頭 A＋本體 AS → 以 AS 執行
            let w2 = await runAs(TOKEN_ADMIN, TOKEN_AS, 'id-mx-p7b')
            A.equal(w2.ok, true, JSON.stringify(w2).slice(0, 300))
            A.equal((await rowsOf('grups')).find((g) => g.id === 'id-mx-p7b').userId, 'app:key-sys')
            //標頭 AUA＋本體 AS → 以 AS 執行; 標頭 AS＋本體 AUA → 以 AUA(所綁管理員)執行
            let w3 = await runAs(TOKEN_AU_ADMIN, TOKEN_AS, 'id-mx-p7c')
            A.equal(w3.ok, true)
            A.equal((await rowsOf('grups')).find((g) => g.id === 'id-mx-p7c').userId, 'app:key-sys')
            let w4 = await runAs(TOKEN_AS, TOKEN_AU_ADMIN, 'id-mx-p7d')
            A.equal(w4.ok, true)
            A.equal((await rowsOf('grups')).find((g) => g.id === 'id-mx-p7d').userId, 'id-for-admin')
            //任一邊為非管理員等級 → 拒、零寫入: 標頭 U／AUM／NF 於連線閘; 本體 U／AUM／NF 於執行身分
            let s0 = await snap4()
            for (let bad of [TOKEN_MEMBER, TOKEN_AU_MEMBER, TOKEN_NOFLAG]) {
                let g = await runAs(bad, TOKEN_AS, 'id-mx-p7x')
                A.equal(g.ok, false)
                A.equal(g.msg, 'permission denied', '標頭為非管理員等級: 連線閘')
                let b = await runAs(TOKEN_AS, bad, 'id-mx-p7y')
                A.equal(b.ok, false)
                A.ok(KEYS.has(b.msg), `本體為非管理員等級: 執行身分拒絕鍵 ${b.msg}`)
            }
            A.equal(await snap4(), s0, '零寫入')
            stat.cells += 13
        })

        it('MX-P5 檢查之值即使用之值: verifyAppUser 改寫其收到之 user 物件(id→id-for-peter、isAdmin→n)後放行, 稽核欄與回傳身分仍為交給部署方之前取得者(app:key-mutate)', async function() {
            let lg = await getJson(`/api/getUserByToken?token=${q(TOKEN_AS_MUTATE)}`)
            A.equal(lg.state, 'success', JSON.stringify(lg).slice(0, 200))
            A.equal(lg.msg.id, 'app:key-mutate')
            A.equal(lg.msg.isAdmin, 'y')
            let rows = (await rowsOf('grups')).concat([{ id: 'id-mx-p5', order: 0, name: 'mx-p5', description: '', from: '', cpemis: '{}' }])
            let w = await callRpc('updateGrups', [rows], TOKEN_AS_MUTATE)
            A.equal(w.ok, true, JSON.stringify(w).slice(0, 300))
            let row = (await rowsOf('grups')).find((g) => g.id === 'id-mx-p5')
            A.equal(row.userId, 'app:key-mutate')
            A.equal(row.userIdUpdate, 'app:key-mutate')
            let url = urlSync.replace('{keyTable}', 'grups').replace('{token}', q(TOKEN_AS_MUTATE))
            let res = await (await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ from: F_SYNC, rows: [{ srcKey: 'sk-mutate', order: 0, name: 'n-mutate', description: 'x', cpemis: '{}' }] }) })).json()
            A.equal(res.state, 'success', JSON.stringify(res).slice(0, 300))
            let sw = (await rowsOf('grups')).find((g) => g.from === F_SYNC && g.srcKey === 'sk-mutate')
            A.equal(sw.userId, 'app:key-mutate', '同步端點之稽核欄亦為交給部署方之前取得者')
            await cleanExternalFixtures({ kts: ['grups'], froms: [F_SYNC] })
            stat.cells += 4
        })

        it('MX-P6 AS 新增資料: 新列建立者與更新者皆為 app:…, 且可被管理員讀回; AS 之寫入與管理員同一契約(同批重複 id 仍整批拒收)', async function() {
            let rows = (await rowsOf('grups')).concat([{ id: 'id-mx-p6', order: 0, name: 'mx-p6', description: '', from: '', cpemis: '{}' }])
            let w = await callRpc('updateGrups', [rows], TOKEN_AS)
            A.equal(w.ok, true, JSON.stringify(w).slice(0, 300))
            let row = (await rowsOf('grups')).find((g) => g.id === 'id-mx-p6')
            A.equal(row.userId, 'app:key-sys')
            A.equal(row.userIdUpdate, 'app:key-sys')
            let dup = (await rowsOf('grups')).concat([{ id: 'id-mx-p6b', order: 0, name: 'mx-p6b', description: '', from: '', cpemis: '{}' }, { id: 'id-mx-p6b', order: 0, name: 'mx-p6c', description: '', from: '', cpemis: '{}' }])
            let s0 = await snap4()
            let d = await callRpc('updateGrups', [dup], TOKEN_AS)
            A.equal(d.ok, false)
            A.equal(d.msg, 'saveRowFieldDuplicate')
            A.equal(await snap4(), s0)
            stat.cells += 2
        })
    })


    // ===== [M] mappingBy 變體(外審 sol F01／F02／F03／F04) =====
    describe('M mappingBy 變體(email／name): 呼叫者分類不隨對應鍵改變; 稽核 id 為 perm 內 id; 外部 id 與 perm 主鍵衝突之服務身分各入口一致被拒', function() {
        for (let mb of ['email', 'name']) {
            describe(`mappingBy=${mb}`, function() {
                before(async function() {
                    this.timeout(300000)
                    await restartBackend(genTempSettings({ mappingBy: mb }))
                })

                after(async function() {
                    this.timeout(300000)
                    await restartBackend('./settings.json')
                })

                it(`MX-M1 [${mb}] 十類呼叫者 × 後台登入檢查／應用路由查他人樹／資料通道(標頭、本體): 管理員等級才通過, 與預設對應鍵(id)相同`, async function() {
                    for (let c of ALL) {
                        let r = await getJson(`/api/getUserByToken?token=${q(c.token)}`)
                        A.equal(r.state, c.lvl ? 'success' : 'error', `${mb} ${c.k} getUserByToken: ${JSON.stringify(r).slice(0, 200)}`)
                        let p = await getJson(`/api/getPermUserInfor?token=${q(c.token)}&userId=id-for-peter`)
                        A.equal(p.state, c.lvl ? 'success' : 'error', `${mb} ${c.k} getPermUserInfor: ${JSON.stringify(p).slice(0, 200)}`)
                        let h = await callRpc('users.select', [], c.token)
                        A.equal(h.ok, c.lvl, `${mb} ${c.k} users.select 標頭: ${JSON.stringify(h).slice(0, 200)}`)
                        let b = await callRpc('users.select', [], TOKEN_ADMIN, { sysToken: c.token })
                        A.equal(b.ok, c.lvl, `${mb} ${c.k} users.select 本體: ${JSON.stringify(b).slice(0, 200)}`)
                        stat.cells += 4
                    }
                })

                it(`MX-M2 [${mb}] 外部 id 與 perm 主鍵衝突之服務身分(users 另有 id 同為 app:key-sys 之一般使用者列): 各入口一致被拒, 零寫入  [外審 sol F03]`, async function() {
                    let users = [...(await rowsOf('users')), userRow('app:key-sys', 'collide', 'n', 'y', '{}')]
                    A.equal((await callRpc('updateUsers', [users], TOKEN_ADMIN)).ok, true)
                    let s0 = await snap4()
                    let r = await getJson(`/api/getUserByToken?token=${q(TOKEN_AS)}`)
                    A.equal(r.state, 'error', JSON.stringify(r).slice(0, 200))
                    A.equal((await getJson(`/api/getPermUserInfor?token=${q(TOKEN_AS)}&userId=id-for-peter`)).state, 'error')
                    A.equal((await callRpc('users.select', [], TOKEN_AS)).ok, false, '標頭: 連線閘')
                    let rows = (await rowsOf('grups')).concat([{ id: 'id-mx-m2', order: 0, name: 'mx-m2', description: '', from: '', cpemis: '{}' }])
                    let w = await callRpc('updateGrups', [rows], TOKEN_ADMIN, { sysToken: TOKEN_AS })
                    A.equal(w.ok, false, '本體: 執行身分')
                    A.equal(await snap4(), s0, '零寫入')
                    stat.cells += 5
                })
            })
        }

        describe('mappingBy=email 之稽核 id', function() {
            before(async function() {
                this.timeout(300000)
                await restartBackend(genTempSettings({ mappingBy: 'email' }))
            })

            after(async function() {
                this.timeout(300000)
                await restartBackend('./settings.json')
            })

            it('MX-M3 外部 id(sso-admin-9)與 perm 主鍵(id-for-admin)不同之管理員: 資料通道與應用路由之稽核欄皆記 perm 內 id; 後台登入檢查回 perm 列  [外審 sol F02]', async function() {
                let lg = await getJson(`/api/getUserByToken?token=${q(TOKEN_ALT_ADMIN)}`)
                A.equal(lg.state, 'success', JSON.stringify(lg).slice(0, 200))
                A.equal(lg.msg.id, 'id-for-admin', '登入檢查回 perm 列')
                let rows = (await rowsOf('grups')).concat([{ id: 'id-mx-m3', order: 0, name: 'mx-m3', description: '', from: '', cpemis: '{}' }])
                let w = await callRpc('updateGrups', [rows], TOKEN_ALT_ADMIN)
                A.equal(w.ok, true, JSON.stringify(w).slice(0, 300))
                A.equal((await rowsOf('grups')).find((g) => g.id === 'id-mx-m3').userId, 'id-for-admin', '資料通道: perm 內 id')
                let url = urlSync.replace('{keyTable}', 'grups').replace('{token}', q(TOKEN_ALT_ADMIN))
                let res = await (await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ from: F_SYNC, rows: [{ srcKey: 'sk-m3', order: 0, name: 'n-m3', description: 'x', cpemis: '{}' }] }) })).json()
                A.equal(res.state, 'success', JSON.stringify(res).slice(0, 300))
                A.equal((await rowsOf('grups')).find((g) => g.from === F_SYNC && g.srcKey === 'sk-m3').userId, 'id-for-admin', '應用路由: 與資料通道同為 perm 內 id')
                await cleanExternalFixtures({ kts: ['grups'], froms: [F_SYNC] })
                stat.cells += 4
            })

            it('MX-M4 使用者用途綁定之使用者在 perm 表但停用、外部 id(sso-appdis-9)與 perm 主鍵不同(只能靠對應鍵 email 找到該列): 不得因「停用視同查無」落入系統服務用途; 啟用後以該列為準  [P-2 核心: 在表含停用]', async function() {
                A.equal((await getJson(`/api/getUserByToken?token=${q(TOKEN_AU_DISABLED_ALT)}`)).state, 'error')
                A.equal((await getJson(`/api/getPermUserInfor?token=${q(TOKEN_AU_DISABLED_ALT)}&userId=id-for-peter`)).state, 'error')
                A.equal((await callRpc('users.select', [], TOKEN_AU_DISABLED_ALT)).ok, false, '標頭')
                A.equal((await callRpc('users.select', [], TOKEN_ADMIN, { sysToken: TOKEN_AU_DISABLED_ALT })).ok, false, '本體')
                let users = (await rowsOf('users')).map((u) => (u.id === 'id-for-appdis' ? { ...u, isActive: 'y' } : u))
                A.equal((await callRpc('updateUsers', [users], TOKEN_ADMIN)).ok, true)
                let ok = await getJson(`/api/getUserByToken?token=${q(TOKEN_AU_DISABLED_ALT)}`)
                A.equal(ok.state, 'success', '啟用且 isAdmin y 後以該列為準: ' + JSON.stringify(ok).slice(0, 200))
                A.equal(ok.msg.id, 'id-for-appdis', '回 perm 列')
                stat.cells += 6
            })
        })
    })


    // ===== [B] Authorization 標頭須為 Bearer 方案(P-3) =====
    describe('B 連線閘之 Authorization 須為 Bearer 方案(P-3)', function() {
        //getWebInfor 之 input 與 callRpc 同(本體 __sysToken__ 為 sys, 即管理員), 只改 Authorization 標頭
        let bearerRpc = async (headers) => rawRpc('getWebInfor', { __sysInputArgs__: [], __sysToken__: 'sys' }, headers)

        it('MX-B1 Bearer 方案(大小寫不敏感、單一空白)通過; Basic／Token／無方案／多空白／Tab／缺憑證／無標頭 → 視同無 token(permission denied)', async function() {
            for (let v of ['Bearer sys', 'bearer sys', 'BEARER sys', 'BeArEr sys']) {
                A.equal((await bearerRpc({ Authorization: v })).ok, true, `應通過: ${v}`)
            }
            for (let v of ['Basic sys', 'Token sys', 'Digest sys', 'sys', 'Bearer  sys', 'Bearer\tsys', 'Bearersys', 'Bearer', 'Bearer ', 'xBearer sys', 'Bearer sys extra', '']) {
                let r = await bearerRpc({ Authorization: v })
                A.equal(r.ok, false, `應被拒: ${JSON.stringify(v)}`)
                A.equal(r.msg, 'permission denied', `應被拒: ${JSON.stringify(v)}`)
            }
            let r0 = await bearerRpc({})
            A.equal(r0.ok, false, '無 Authorization 標頭')
            A.equal(r0.msg, 'permission denied')
            stat.cells += 17
        })

        it('MX-B2 通訊路由同一規則: Basic 方案帶管理員 token 亦視同無 token(回應 ≡ 無效 token)', async function() {
            for (let path of ['/api/ulctr', '/api/slc', '/api/dwgfn', '/api/dw']) {
                let call = async (auth) => {
                    let r = await fetch(`${apiBaseUrl}${path}`, { method: 'POST', headers: { Authorization: auth, 'Content-Type': 'application/octet-stream' }, body: Buffer.from('x') })
                    return Buffer.from(await r.arrayBuffer()).toString('latin1')
                }
                let bad = await call('Bearer nope-invalid')
                A.ok(bad.includes('permission denied'))
                A.equal(await call('Basic sys'), bad, `${path}: Basic sys`)
                A.equal(await call('Token sys'), bad, `${path}: Token sys`)
                A.equal(await call('Digest sys'), bad, `${path}: Digest sys(方案名恰 6 字元＋空白＝7 字元, 修前截前 7 字元即得 sys 而通過; Basic／Token 僅 5 字元方案名, 修前截完剩 ys 而恰好被拒)`)
                A.ok(!(await call('Bearer sys')).includes('permission denied'), `${path}: Bearer sys 過閘`)
                stat.cells += 4
            }
        })
    })


    // ===== [Q] /syncAndReplaceTabs 先驗身分再驗參數(P-5) =====
    describe('Q /syncAndReplaceTabs 先驗身分再驗 keyTable(P-5)', function() {
        let post = async (keyTableQuery, token) => {
            let url = `${apiBaseUrl}/syncAndReplaceTabs?${keyTableQuery}token=${q(token)}`
            return await (await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ from: F_SYNC, rows: [{ srcKey: 'sk-q', order: 0, name: 'n-q', description: 'x', cpemis: '{}' }] }) })).json()
        }

        it('MX-Q1 未通過身分驗證者(無 token、無效 token、U、AUM、NF、ASN、AUD)之回應與 srLog 皆與 keyTable 無關(有效表名／未知表名／空／未帶皆同一回應); 管理員等級才見 invalidKeyTable', async function() {
            let mark = await markSrLog()
            let unauth = [['N', ''], ['BAD', TOKEN_BAD], ['U', TOKEN_MEMBER], ['AUM', TOKEN_AU_MEMBER], ['NF', TOKEN_NOFLAG], ['ASN', TOKEN_AS_N], ['AUD', TOKEN_AU_DISABLED]]
            for (let [k, tk] of unauth) {
                let rs = []
                for (let kq of ['keyTable=grups&', 'keyTable=zz-bogus-table&', 'keyTable=&', '']) {
                    rs.push(await post(kq, tk))
                }
                for (let r of rs) {
                    A.equal(r.state, 'error', k)
                    A.deepEqual(r, rs[0], `${k}: 回應不得因 keyTable 不同而不同`)
                    A.notEqual(r.msg, 'invalidKeyTable', `${k}: 未驗證者不得得知 keyTable 無效`)
                }
                stat.cells += 4
            }
            let mark2 = await markSrLog() //哨兵: 其前各行已落檔
            A.ok(mark2 !== null)
            let lines = readSrLogSince(mark)
            A.ok(!lines.some((l) => l.keyTable === 'zz-bogus-table'), '未驗證者之請求不得在 srLog 留下 keyTable(以未知表名為記號)')
            //管理員等級: 才走到 keyTable 檢查
            for (let tk of [TOKEN_ADMIN, TOKEN_AS]) {
                A.equal((await post('keyTable=zz-bogus-table&', tk)).msg, 'invalidKeyTable')
                A.equal((await post('keyTable=&', tk)).msg, 'tokenNoPermission')
                A.equal((await post('', tk)).msg, 'tokenNoPermission')
            }
            stat.cells += 6
        })
    })


    after(function() {
        console.log(`[api-callerMatrix] 已斷言格數(含相容軸): ${stat.cells}`)
    })
})
