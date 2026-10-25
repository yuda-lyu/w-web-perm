//呼叫者 × 入口 存取矩陣(perm-run01 本輪; 使用者 2026-10-24 定案之 token 權責; 真後端)。
//規格: C:\opensrcOper\dspec\w-web存取管控表.md 第二節(w-web-perm; AU＝使用者用途、AS＝系統服務用途)、dspec/使用者身分驗證原則.md 二之一; 規則帳本 R-APP-TOKEN-01(sgud/rule/rulebook_security.md)。
//
//定義: 管理員之判準為 perm 自身 users 表(isAdmin='y' 且 isActive='y'); 使用者用途之應用系統 token(AU)以所綁使用者之 perm 列判定(同其使用者 token); 系統服務用途(AS)須同時: 不在 perm users 表、
//      部署方 getUserByToken 轉傳 isApp='y'、isAdmin='y'、且反查 id 以 'app:' 開頭('app:<金鑰主鍵>'; sso 拒收以 app: 開頭之使用者主鍵), 可用管理員之後端服務, 稽核欄記其 id; 不可用 /api/getPerm(無「本人」權限樹)。
//等級有兩套判準(perm-run02, 主控裁示): svc＝後台登入檢查／資料通道／requireAdmin 用「系統服務用途」之嚴格認定(上述四條件); app＝應用系統路由(getPermUserInfor、syncAndReplaceTabs)用相容認定——
//      在表者以 perm 列(有效且 isAdmin y), 不在表者只看反查 isAdmin='y'(不要求 isApp、不要求 app: 前綴; 舊版 sso 之應用系統身分即 isAdmin y, 升版不中斷)。
//呼叫者軸: N 無 token、U 一般使用者、A 管理員、AUA 使用者用途綁管理員、AUM 使用者用途綁一般使用者、AS 系統服務用途;
//          相容軸: NF isApp 未轉傳(AS 形狀, app: 前綴)、NFV 不在表之 sso 管理員自身使用者 token(未轉傳 isApp)、NFN 不在表且 isAdmin n 未轉傳 isApp、ASN AS 形狀但 isAdmin n、AUD 使用者用途綁停用之使用者、
//          APP 虛擬應用系統(TOKEN_APP; isApp y、isAdmin y 但 id 非 app: 開頭)、AUX 使用者用途綁不在表之 sso 管理員(isApp y、isAdmin y、id 非 app: 開頭)。
//入口軸(24): 靜態檔 1、hapi 路由 4(getUserByToken／getPerm／getPermUserInfor／syncAndReplaceTabs)、通訊路由 5(ulctr／slc／dwgfn／dwgf／dw)、資料通道函數 14
//          (表 select ×4、getWebInfor、updateTargets／Pemis／Grups／Users、getStaEvent／getStaEventTable、系統函數 ×3); 資料通道每格另分「標頭 token(連線閘)」「本體 __sysToken__(執行身分)」兩個身分來源。
//跑法(需測試鎖): node C:/opensrcOper/tools/quiet-run.mjs --name tmatrix --lock --timeout 3000 -- npx mocha --no-parallel test/api-callerMatrix.test.mjs --timeout 300000
import assert from 'assert'
import obj2u8arr from 'wsemi/src/obj2u8arr.mjs'
import u8arr2obj from 'wsemi/src/u8arr2obj.mjs'
import { assertPristineSeed } from './tools/baseSeed.mjs'
import {
    startApi, apiBaseUrl, urlSync,
    TOKEN_ADMIN, TOKEN_MEMBER, TOKEN_APP, TOKEN_AS, TOKEN_AS_N, TOKEN_NOFLAG, TOKEN_NOFLAG_N, TOKEN_SSO_ADMIN, TOKEN_AU_SSO, TOKEN_FLAG_N, TOKEN_FLAG_ODD, TOKEN_APP_DENY_N, TOKEN_EXT_ROW, TOKEN_AS_EMAIL, TOKEN_AS_EMAIL_ALT, TOKEN_AS_GHOST, TOKEN_GHOST_USER, TOKEN_AU_ADMIN, TOKEN_AU_MEMBER, TOKEN_AU_DISABLED, TOKEN_DENY, TOKEN_AS_DENY, TOKEN_AS_MUTATE, TOKEN_ALT_ADMIN, TOKEN_AU_DISABLED_ALT, TOKEN_BAD, TOKEN_PETER,
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

//呼叫者: svc＝是否為「後端管理員服務」等級(後台登入檢查、資料通道各入口、requireAdmin; 系統服務用途須 isApp y＋isAdmin y＋id 以 app: 開頭＋不在表); app＝是否通過應用系統路由之等級(在表以 perm 列, 不在表只看 isAdmin y);
//        own＝可用 /api/getPerm 者其本人 id; aud＝其寫入之稽核欄 id(userId／userIdUpdate)
const CALLERS = [
    { k: 'N', label: '無 token', token: '', svc: false, app: false, own: null, aud: null },
    { k: 'U', label: '一般使用者', token: TOKEN_MEMBER, svc: false, app: false, own: 'id-for-member', aud: null },
    { k: 'A', label: '管理員', token: TOKEN_ADMIN, svc: true, app: true, own: 'id-for-admin', aud: 'id-for-admin' },
    { k: 'AUA', label: '使用者用途綁管理員', token: TOKEN_AU_ADMIN, svc: true, app: true, own: 'id-for-admin', aud: 'id-for-admin' },
    { k: 'AUM', label: '使用者用途綁一般使用者', token: TOKEN_AU_MEMBER, svc: false, app: false, own: 'id-for-peter', aud: null },
    { k: 'AS', label: '系統服務用途', token: TOKEN_AS, svc: true, app: true, own: null, aud: 'app:key-sys' },
]
const COMPAT = [
    { k: 'NF', label: 'isApp 未轉傳(AS 形狀, app: 前綴)', token: TOKEN_NOFLAG, svc: false, app: true, own: null, aud: 'app:key-noflag' },
    { k: 'NFV', label: '不在表之 sso 管理員自身使用者 token(未轉傳 isApp)', token: TOKEN_SSO_ADMIN, svc: false, app: true, own: null, aud: 'sso-admin-77' },
    { k: 'NFN', label: '不在表且 isAdmin n(未轉傳 isApp)', token: TOKEN_NOFLAG_N, svc: false, app: false, own: null, aud: null },
    { k: 'ASN', label: 'AS 形狀但 isAdmin n', token: TOKEN_AS_N, svc: false, app: false, own: null, aud: null },
    { k: 'AUD', label: '使用者用途綁停用之使用者', token: TOKEN_AU_DISABLED, svc: false, app: false, own: null, aud: null },
    { k: 'APP', label: '虛擬應用系統 TOKEN_APP(isApp y、isAdmin y、id 非 app: 開頭)', token: TOKEN_APP, svc: false, app: true, own: null, aud: 'id-for-application' },
    { k: 'AUX', label: '使用者用途綁不在表之 sso 管理員(isApp y、id 非 app: 開頭)', token: TOKEN_AU_SSO, svc: false, app: true, own: null, aud: 'sso-admin-77' },
    { k: 'AFN', label: 'app: 前綴、isAdmin y、isApp 明確 n、不在表', token: TOKEN_FLAG_N, svc: false, app: true, own: null, aud: 'app:key-flag-n' }, //外審 sol F1
    { k: 'AFO', label: 'app: 前綴、isAdmin y、isApp 為大寫 Y(非嚴格 y)、不在表', token: TOKEN_FLAG_ODD, svc: false, app: true, own: null, aud: 'app:key-flag-odd' }, //外審 sol F1
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
    describe('H 靜態檔與 hapi 路由(5 入口 × 15 呼叫者)', function() {

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

        it('MX-H2 GET /api/getUserByToken(後台登入檢查): 後端管理員服務等級(A／AUA／AS)通過並回該身分; 其餘一律拒、固定語系鍵、不回資料(含 id 非 app: 開頭之 APP／AUX)  [P-2: AS 放行; perm-run02②: AS 須 app: 前綴]', async function() {
            for (let c of ALL) {
                let r = await getJson(`/api/getUserByToken?token=${q(c.token)}`)
                if (c.svc) {
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
            //perm-run02②: 不在表、isApp y、isAdmin y 但 id 非 app: 開頭(APP／AUX)與不在表 sso 管理員自身使用者 token(NFV)、不在表一般使用者(NFN)皆非系統服務用途 → 同為「perm 查無此使用者」
            for (let [k, tk] of [['APP', TOKEN_APP], ['AUX', TOKEN_AU_SSO], ['NFV', TOKEN_SSO_ADMIN], ['NFN', TOKEN_NOFLAG_N]]) {
                A.equal((await getJson(`/api/getUserByToken?token=${q(tk)}`)).msg, 'cannotGetUserFromPerm', k)
            }
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

        it('MX-H4 GET /api/getPermUserInfor(查他人權限樹): 在表者以 perm 列(A／AUA 通過)、不在表者只看反查 isAdmin y(AS／NF／NFV／APP／AUX 通過, 不要求 isApp 與 app: 前綴); 其餘拒  [P-1 + perm-run02①: 相容]', async function() {
            for (let c of ALL) {
                let r = await getJson(`/api/getPermUserInfor?token=${q(c.token)}&userId=id-for-peter`)
                if (c.app) {
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
            //固定鍵: 在表一般使用者與 AU 綁一般使用者 userNotAdmin; 不在表且 isAdmin n(不論 isApp 是否給)userNotAdmin; 綁停用者 cannotGetUserFromPerm(在表者以列為準, 先於等級)
            A.equal((await getJson(`/api/getPermUserInfor?token=${q(TOKEN_MEMBER)}&userId=id-for-peter`)).msg, 'userNotAdmin')
            A.equal((await getJson(`/api/getPermUserInfor?token=${q(TOKEN_AU_MEMBER)}&userId=id-for-peter`)).msg, 'userNotAdmin')
            A.equal((await getJson(`/api/getPermUserInfor?token=${q(TOKEN_NOFLAG_N)}&userId=id-for-peter`)).msg, 'userNotAdmin')
            A.equal((await getJson(`/api/getPermUserInfor?token=${q(TOKEN_AS_N)}&userId=id-for-peter`)).msg, 'userNotAdmin')
            A.equal((await getJson(`/api/getPermUserInfor?token=${q(TOKEN_AU_DISABLED)}&userId=id-for-peter`)).msg, 'cannotGetUserFromPerm')
            A.equal((await getJson(`/api/getPermUserInfor?token=&userId=id-for-peter`)).msg, 'tokenNoPermission')
        })

        it('MX-H5 POST /syncAndReplaceTabs(整表覆寫): 通過應用系統路由等級者寫入(稽核欄 userId 在表者記 perm 列主鍵、不在表者記外部 id); 其餘拒且零寫入  [P-1; P-2 稽核欄記 app:…; perm-run02①相容]', async function() {
            for (let c of ALL) {
                let s0 = await snap4()
                let row = { srcKey: `sk-${c.k}`, order: 0, name: `n-${c.k}`, description: c.k, cpemis: '{}' }
                let url = urlSync.replace('{keyTable}', 'grups').replace('{token}', q(c.token))
                let res = await (await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ from: F_SYNC, rows: [row] }) })).json()
                if (c.app) {
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
    describe('C 通訊路由(ulctr／slc／dwgfn／dwgf／dw × 15 呼叫者): 同一連線閘, 後端管理員服務等級過閘, 其餘 permission denied', function() {
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
            it(`MX-C ${rt.name}: 非後端管理員服務等級之回應 ≡ 無效 token 之回應(permission denied); A／AUA／AS 已過閘; id 非 app: 開頭之 APP／AUX 與相容軸皆被擋`, async function() {
                let bad = await callRoute(rt, TOKEN_BAD)
                A.ok(bad.body.includes('permission denied'), `無效 token 應為 permission denied: ${bad.body.slice(0, 100)}`)
                for (let c of ALL) {
                    let r = await callRoute(rt, c.token)
                    if (c.svc) {
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
    describe('D 資料通道(/api/main)14 個函數 × 15 呼叫者 × 標頭／本體兩個身分來源', function() {
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
            it(`MX-D ${e.name}: 後端管理員服務等級(A／AUA／AS)成功, 其餘(含 id 非 app: 開頭之 APP／AUX)於連線閘 permission denied、於執行身分回固定語系鍵; 零寫入  [P-2; perm-run02②]`, async function() {
                for (let c of ALL) {
                    for (let src of (e.onlyHeader ? ['header'] : ['header', 'body'])) {
                        let s0 = await snap4()
                        let args = e.args ? await e.args(c) : null
                        let r = e.call ? await e.call(c, src) : ((src === 'header') ? await callRpc(e.fn, args, c.token) : await callRpc(e.fn, args, TOKEN_ADMIN, { sysToken: c.token }))
                        let tag = `${e.name} ${c.k} ${src}`
                        if (c.svc) {
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
            for (let bad of [TOKEN_MEMBER, TOKEN_AU_MEMBER, TOKEN_NOFLAG, TOKEN_APP, TOKEN_AU_SSO]) { //perm-run02②: APP／AUX(isApp y、isAdmin y 但 id 非 app: 開頭)亦非系統服務用途
                let g = await runAs(bad, TOKEN_AS, 'id-mx-p7x')
                A.equal(g.ok, false)
                A.equal(g.msg, 'permission denied', '標頭為非管理員等級: 連線閘')
                let b = await runAs(TOKEN_AS, bad, 'id-mx-p7y')
                A.equal(b.ok, false)
                A.ok(KEYS.has(b.msg), `本體為非管理員等級: 執行身分拒絕鍵 ${b.msg}`)
            }
            A.equal(await snap4(), s0, '零寫入')
            stat.cells += 21
        })

        it('MX-P5檢查之值即使用之值: verifyAppUser 改寫其收到之 user 物件(id→id-for-peter、isAdmin→n)後放行, 稽核欄與回傳身分仍為交給部署方之前取得者(app:key-mutate)', async function() {
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

                it(`MX-M1 [${mb}] 十五類呼叫者 × 後台登入檢查／應用路由查他人樹／資料通道(標頭、本體): 後台與資料通道看 svc 等級、應用路由看 app 等級, 與預設對應鍵(id)相同`, async function() {
                    for (let c of ALL) {
                        let r = await getJson(`/api/getUserByToken?token=${q(c.token)}`)
                        A.equal(r.state, c.svc ? 'success' : 'error', `${mb} ${c.k} getUserByToken: ${JSON.stringify(r).slice(0, 200)}`)
                        let p = await getJson(`/api/getPermUserInfor?token=${q(c.token)}&userId=id-for-peter`)
                        A.equal(p.state, c.app ? 'success' : 'error', `${mb} ${c.k} getPermUserInfor: ${JSON.stringify(p).slice(0, 200)}`)
                        let h = await callRpc('users.select', [], c.token)
                        A.equal(h.ok, c.svc, `${mb} ${c.k} users.select 標頭: ${JSON.stringify(h).slice(0, 200)}`)
                        let b = await callRpc('users.select', [], TOKEN_ADMIN, { sysToken: c.token })
                        A.equal(b.ok, c.svc, `${mb} ${c.k} users.select 本體: ${JSON.stringify(b).slice(0, 200)}`)
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

                it(`MX-M5 [${mb}] 主鍵同為服務身分 id 之**停用管理員**列(外審 sol F1: 嚴格系統服務形狀×停用列): 在表以列為準, 各入口一致被拒(不得因停用而落入系統服務用途), 零寫入`, async function() {
                    let users = [...(await rowsOf('users')), userRow('app:key-sys', 'collide', 'y', 'n', '{}')]
                    A.equal((await callRpc('updateUsers', [users], TOKEN_ADMIN)).ok, true)
                    let s0 = await snap4()
                    A.equal((await getJson(`/api/getUserByToken?token=${q(TOKEN_AS)}`)).state, 'error')
                    A.equal((await getJson(`/api/getPermUserInfor?token=${q(TOKEN_AS)}&userId=id-for-peter`)).state, 'error')
                    A.equal((await callRpc('users.select', [], TOKEN_AS)).ok, false, '標頭: 連線閘')
                    let rows = (await rowsOf('grups')).concat([{ id: 'id-mx-m5', order: 0, name: 'mx-m5', description: '', from: '', cpemis: '{}' }])
                    A.equal((await callRpc('updateGrups', [rows], TOKEN_ADMIN, { sysToken: TOKEN_AS })).ok, false, '本體: 執行身分')
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

            it('MX-M6 [外審 sol F3] 近期系統服務用途登錄不得被「經 perm 列通過驗證、其後該列於 requireAdmin 讀取前被刪」之請求沿用: AS(app:key-ghost)先登錄 → perm 建立主鍵同為 app:key-ghost 之管理員列(email 對應) → 一般 sso 管理員經該列通過身分驗證(部署方驗證等待約 2 秒) → 等待期間該列被刪 → 寫入函數須 userNotAdmin、零寫入', async function() {
                this.timeout(120000)
                A.equal((await callRpc('getWebInfor', [], TOKEN_AS_GHOST)).ok, true, '前置: AS 通過並登錄近期 id')
                let users = [...(await rowsOf('users')), { ...userRow('app:key-ghost', 'ghost', 'y', 'y', '{}'), email: 'ghost@example.com' }]
                A.equal((await callRpc('updateUsers', [users], TOKEN_ADMIN)).ok, true, '前置: 建立主鍵同為服務 id 之管理員列')
                let rows = (await rowsOf('grups')).concat([{ id: 'id-mx-m6', order: 0, name: 'mx-m6', description: '', from: '', cpemis: '{}' }])
                let mark = await markSrLog()
                let pending = callRpc('updateGrups', [rows], TOKEN_ADMIN, { sysToken: TOKEN_GHOST_USER })
                await sleep(1200) //身分驗證已過 perm 列、停在部署方 verifyClientUser 之等待中(srv.mjs 對 app:key-ghost 列等待約 4 秒; 1.2 秒起算給慢速環境留裕度, 刪列呼叫本身約 0.1～0.3 秒)
                let del = await callRpc('updateUsers', [(await rowsOf('users')).filter((u) => u.id !== 'app:key-ghost')], TOKEN_ADMIN)
                A.equal(del.ok, true, '等待期間刪列: ' + JSON.stringify(del).slice(0, 200))
                let w = await pending
                A.equal(w.ok, false, `寫入函數須被拒: ${JSON.stringify(w).slice(0, 300)}`)
                A.equal(w.msg, 'userNotAdmin')
                //拒絕須來自 requireAdmin(身分驗證已過列、其後列消失), 而非身分驗證階段即查無列(那會是 cannotGetUserFromPerm)
                await waitLines(mark, (l) => l.event === 'requireAdmin-error' && l.userId === 'app:key-ghost' && l.funcName === 'updateGrups', '拒絕應記 requireAdmin-error')
                A.ok(!(await rowsOf('grups')).some((g) => g.id === 'id-mx-m6'), '零寫入')
                stat.cells += 5
            })

            it('MX-M7 [mappingBy=email; 外審 sol 增量輪 G4] 嚴格系統服務形狀(app:key-email-alt、isApp y、isAdmin y)、外部 id 與列主鍵不同, 只靠 email／name 對應鍵命中 perm 停用列 → 在表, 以列為準: 後台登入、資料通道(標頭／本體)、兩條應用路由皆拒(不得因嚴格形狀而略過對應鍵查找), 零寫入', async function() {
                let users = [...(await rowsOf('users')), userRow('id-key-email2', 'key-email2', 'y', 'n', '{}')] //email＝key-email2@example.com, name＝key-email2, 主鍵 id-key-email2 ≠ app:key-email-alt
                A.equal((await callRpc('updateUsers', [users], TOKEN_ADMIN)).ok, true)
                let s0 = await snap4()
                A.equal((await getJson(`/api/getUserByToken?token=${q(TOKEN_AS_EMAIL_ALT)}`)).msg, 'cannotGetUserFromPerm')
                A.equal((await getJson(`/api/getPermUserInfor?token=${q(TOKEN_AS_EMAIL_ALT)}&userId=id-for-peter`)).msg, 'cannotGetUserFromPerm')
                let url = urlSync.replace('{keyTable}', 'grups').replace('{token}', q(TOKEN_AS_EMAIL_ALT))
                let res = await (await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ from: F_SYNC, rows: [{ srcKey: 'sk-m7', order: 0, name: 'n-m7', description: 'x', cpemis: '{}' }] }) })).json()
                A.equal(res.msg, 'cannotGetUserFromPerm')
                let h = await callRpc('users.select', [], TOKEN_AS_EMAIL_ALT)
                A.equal(h.ok, false)
                A.equal(h.msg, 'permission denied')
                let rows = (await rowsOf('grups')).concat([{ id: 'id-mx-m7', order: 0, name: 'mx-m7', description: '', from: '', cpemis: '{}' }])
                A.equal((await callRpc('updateGrups', [rows], TOKEN_ADMIN, { sysToken: TOKEN_AS_EMAIL_ALT })).ok, false, '本體: 執行身分')
                A.equal(await snap4(), s0, '零寫入')
                stat.cells += 7
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

        it('MX-Q1 未通過身分驗證者(無 token、無效 token、U、AUM、NFN、ASN、AUD)之回應與 srLog 皆與 keyTable 無關(有效表名／未知表名／空／未帶皆同一回應); 通過應用系統路由等級者才見 invalidKeyTable', async function() {
            let mark = await markSrLog()
            let unauth = [['N', ''], ['BAD', TOKEN_BAD], ['U', TOKEN_MEMBER], ['AUM', TOKEN_AU_MEMBER], ['NFN', TOKEN_NOFLAG_N], ['ASN', TOKEN_AS_N], ['AUD', TOKEN_AU_DISABLED]] //perm-run02①: NF 不在表且 isAdmin y, 現通過等級, 移至下方
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
            //通過應用系統路由等級者(管理員、AS、相容放行之 NF／NFV／APP／AUX): 才走到 keyTable 檢查
            for (let tk of [TOKEN_ADMIN, TOKEN_AS, TOKEN_NOFLAG, TOKEN_SSO_ADMIN, TOKEN_APP, TOKEN_AU_SSO]) {
                A.equal((await post('keyTable=zz-bogus-table&', tk)).msg, 'invalidKeyTable')
                A.equal((await post('keyTable=&', tk)).msg, 'tokenNoPermission')
                A.equal((await post('', tk)).msg, 'tokenNoPermission')
            }
            stat.cells += 18
        })
    })


    // ===== [R] perm-run02: ①應用系統路由相容(不在表只看 isAdmin y)、②系統服務用途須 id 以 app: 開頭 =====
    describe('R perm-run02: ①應用系統路由相容認定  ②系統服務用途須 app: 前綴', function() {
        let syncRow = async (token, sk) => {
            let url = urlSync.replace('{keyTable}', 'grups').replace('{token}', q(token))
            return await (await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ from: F_SYNC, rows: [{ srcKey: sk, order: 0, name: `n-${sk}`, description: sk, cpemis: '{}' }] }) })).json()
        }
        let setUsers = async (mut) => {
            let users = mut(await rowsOf('users'))
            let r = await callRpc('updateUsers', [users], TOKEN_ADMIN)
            A.equal(r.ok, true, JSON.stringify(r).slice(0, 300))
        }

        it('MX-R1 ①相容: 不在表且 isAdmin y 而未轉傳 isApp 者(NF／NFV)於兩條應用系統路由放行(舊版 sso 之應用系統身分即 isAdmin y, 升版不中斷), 稽核欄記其外部 id; isApp y 與否結果相同', async function() {
            for (let [k, tk, aud] of [['NF', TOKEN_NOFLAG, 'app:key-noflag'], ['NFV', TOKEN_SSO_ADMIN, 'sso-admin-77'], ['AUX', TOKEN_AU_SSO, 'sso-admin-77'], ['APP', TOKEN_APP, 'id-for-application']]) {
                let p = await getJson(`/api/getPermUserInfor?token=${q(tk)}&userId=id-for-peter`)
                A.equal(p.state, 'success', `${k}: ${JSON.stringify(p).slice(0, 200)}`)
                A.equal(p.msg.user.id, 'id-for-peter', k)
                let res = await syncRow(tk, `sk-r1-${k}`)
                A.equal(res.state, 'success', `${k}: ${JSON.stringify(res).slice(0, 300)}`)
                A.equal((await rowsOf('grups')).find((g) => g.from === F_SYNC && g.srcKey === `sk-r1-${k}`).userId, aud, `${k}: 稽核欄記外部 id`)
                await cleanExternalFixtures({ kts: ['grups'], froms: [F_SYNC] })
                stat.cells += 3
            }
            //isAdmin 非 'y' 之各種值一律拒(NFN＝'n')
            let s0 = await snap4()
            for (let tk of [TOKEN_NOFLAG_N, TOKEN_AS_N]) {
                A.equal((await getJson(`/api/getPermUserInfor?token=${q(tk)}&userId=id-for-peter`)).msg, 'userNotAdmin')
                A.equal((await syncRow(tk, 'sk-r1-n')).msg, 'userNotAdmin')
            }
            A.equal(await snap4(), s0, '零寫入')
            stat.cells += 4
        })

        it('MX-R2 ①在表者以 perm 列為準(不看反查之 isAdmin): 同一外部身分 sso-admin-77(反查 isAdmin y)不在表時放行; 建為一般使用者列 → userNotAdmin; 改為有效管理員 → 放行; 停用 → cannotGetUserFromPerm; 刪除列 → 回到不在表而放行', async function() {
            let probe = async (tk) => ({ p: await getJson(`/api/getPermUserInfor?token=${q(tk)}&userId=id-for-peter`), s: await syncRow(tk, 'sk-r2') })
            let okBoth = async (tk, label) => {
                let r = await probe(tk)
                A.equal(r.p.state, 'success', `${label} getPermUserInfor: ${JSON.stringify(r.p).slice(0, 200)}`)
                A.equal(r.s.state, 'success', `${label} sync: ${JSON.stringify(r.s).slice(0, 200)}`)
                await cleanExternalFixtures({ kts: ['grups'], froms: [F_SYNC] })
            }
            let key = async (tk, label, expect) => {
                let s0 = await snap4()
                let r = await probe(tk)
                A.equal(r.p.msg, expect, `${label} getPermUserInfor`)
                A.equal(r.s.msg, expect, `${label} sync`)
                A.equal(await snap4(), s0, `${label} 零寫入`)
            }
            for (let tk of [TOKEN_SSO_ADMIN, TOKEN_AU_SSO]) {
                await okBoth(tk, '不在表')
            }
            await setUsers((us) => [...us, userRow('sso-admin-77', 'sso-admin', 'n', 'y', '{}')])
            for (let tk of [TOKEN_SSO_ADMIN, TOKEN_AU_SSO]) {
                await key(tk, '在表一般使用者(反查 isAdmin y 不採信)', 'userNotAdmin')
            }
            await setUsers((us) => us.map((u) => (u.id === 'sso-admin-77' ? { ...u, isAdmin: 'y' } : u)))
            for (let tk of [TOKEN_SSO_ADMIN, TOKEN_AU_SSO]) {
                await okBoth(tk, '在表有效管理員')
            }
            await setUsers((us) => us.map((u) => (u.id === 'sso-admin-77' ? { ...u, isActive: 'n' } : u)))
            for (let tk of [TOKEN_SSO_ADMIN, TOKEN_AU_SSO]) {
                await key(tk, '在表但停用', 'cannotGetUserFromPerm')
            }
            await setUsers((us) => us.filter((u) => u.id !== 'sso-admin-77'))
            for (let tk of [TOKEN_SSO_ADMIN, TOKEN_AU_SSO]) {
                await okBoth(tk, '列刪除後回到不在表')
            }
            stat.cells += 22
        })

        it('MX-R3 ②系統服務用途須 id 以 app: 開頭: 同為不在表、isApp y、isAdmin y, 僅 id 前綴不同 → AS(app:key-sys)可用後端管理員服務、AUX(sso-admin-77)與 APP(id-for-application)不可; 後台登入、資料通道標頭／本體、寫入函數皆然, 零寫入', async function() {
            let s0 = await snap4()
            A.equal((await getJson(`/api/getUserByToken?token=${q(TOKEN_AS)}`)).state, 'success')
            A.equal((await callRpc('getWebInfor', [], TOKEN_AS)).ok, true, 'AS 標頭')
            A.equal((await callRpc('getWebInfor', [], TOKEN_ADMIN, { sysToken: TOKEN_AS })).ok, true, 'AS 本體')
            for (let [k, tk] of [['AUX', TOKEN_AU_SSO], ['APP', TOKEN_APP]]) {
                A.equal((await getJson(`/api/getUserByToken?token=${q(tk)}`)).state, 'error', `${k} 後台登入`)
                let h = await callRpc('getWebInfor', [], tk)
                A.equal(h.ok, false, `${k} 標頭`)
                A.equal(h.msg, 'permission denied', `${k} 標頭: 連線閘`)
                let b = await callRpc('getWebInfor', [], TOKEN_ADMIN, { sysToken: tk })
                A.equal(b.ok, false, `${k} 本體`)
                A.ok(KEYS.has(b.msg), `${k} 本體: 執行身分拒絕鍵 ${b.msg}`)
                let rows = (await rowsOf('grups')).concat([{ id: `id-mx-r3-${k}`, order: 0, name: `mx-r3-${k}`, description: '', from: '', cpemis: '{}' }])
                let w = await callRpc('updateGrups', [rows], tk)
                A.equal(w.ok, false, `${k} 寫入函數`)
                let wb = await callRpc('updateGrups', [rows], TOKEN_ADMIN, { sysToken: tk })
                A.equal(wb.ok, false, `${k} 寫入函數(本體)`)
            }
            A.equal(await snap4(), s0, '零寫入')
            stat.cells += 13
        })

        it('MX-R4 ②「二者一致」: 使用者用途綁不在表之 sso 管理員(AUX)的後端結果 ≡ 該管理員自身使用者 token(NFV)——後台登入、資料通道標頭／本體的拒絕鍵逐一相同; 兩者應用系統路由皆放行  [原則二之一: 使用者用途＝同綁定者]', async function() {
            let lgA = await getJson(`/api/getUserByToken?token=${q(TOKEN_AU_SSO)}`)
            let lgB = await getJson(`/api/getUserByToken?token=${q(TOKEN_SSO_ADMIN)}`)
            A.equal(lgA.state, 'error')
            A.deepEqual(lgA, lgB, '後台登入: 回應逐字相同')
            let hA = await callRpc('users.select', [], TOKEN_AU_SSO)
            let hB = await callRpc('users.select', [], TOKEN_SSO_ADMIN)
            A.equal(hA.ok, false)
            A.deepEqual({ ok: hA.ok, msg: hA.msg }, { ok: hB.ok, msg: hB.msg }, '資料通道標頭')
            let bA = await callRpc('users.select', [], TOKEN_ADMIN, { sysToken: TOKEN_AU_SSO })
            let bB = await callRpc('users.select', [], TOKEN_ADMIN, { sysToken: TOKEN_SSO_ADMIN })
            A.equal(bA.ok, false)
            A.deepEqual({ ok: bA.ok, msg: bA.msg }, { ok: bB.ok, msg: bB.msg }, '資料通道本體')
            for (let tk of [TOKEN_AU_SSO, TOKEN_SSO_ADMIN]) {
                A.equal((await getJson(`/api/getPermUserInfor?token=${q(tk)}&userId=id-for-peter`)).state, 'success')
            }
            stat.cells += 6
        })

        it('MX-R5 [外審 sol F1] 嚴格系統服務形狀(AS: app:key-sys、isApp y、isAdmin y)而 perm 有主鍵同為其 id 之停用列 → 在表, 不落入系統服務用途: 後台登入、資料通道(標頭／本體)、應用路由皆拒(固定語系鍵)、零寫入', async function() {
            //人造帶 email 之嚴格形狀(TOKEN_AS_EMAIL: app:key-email、isApp y、isAdmin y), perm 有主鍵同為其 id 之停用管理員列
            let setRow = async (patch) => setUsers((us) => us.map((u) => (u.id === 'app:key-email' ? { ...u, ...patch } : u)))
            await setUsers((us) => [...us, { ...userRow('app:key-email', 'key-email', 'y', 'n', '{}'), email: 'key-email@example.com' }])
            let s0 = await snap4()
            A.equal((await getJson(`/api/getUserByToken?token=${q(TOKEN_AS_EMAIL)}`)).msg, 'cannotGetUserFromPerm')
            A.equal((await getJson(`/api/getPermUserInfor?token=${q(TOKEN_AS_EMAIL)}&userId=id-for-peter`)).msg, 'cannotGetUserFromPerm')
            A.equal((await syncRow(TOKEN_AS_EMAIL, 'sk-r5')).msg, 'cannotGetUserFromPerm')
            let h = await callRpc('getWebInfor', [], TOKEN_AS_EMAIL)
            A.equal(h.ok, false)
            A.equal(h.msg, 'permission denied')
            let b = await callRpc('getWebInfor', [], TOKEN_ADMIN, { sysToken: TOKEN_AS_EMAIL })
            A.equal(b.ok, false)
            A.ok(KEYS.has(b.msg), `本體: 執行身分拒絕鍵 ${b.msg}`)
            A.equal(await snap4(), s0, '零寫入')
            //啟用且為管理員: 以列通過(回 perm 列, 不經 verifyAppUser 之系統服務用途); 降為一般使用者: 依列拒
            await setRow({ isActive: 'y' })
            let ok = await getJson(`/api/getUserByToken?token=${q(TOKEN_AS_EMAIL)}`)
            A.equal(ok.state, 'success', JSON.stringify(ok).slice(0, 200))
            A.equal((await callRpc('getWebInfor', [], TOKEN_AS_EMAIL)).ok, true, '啟用且為管理員後以列通過')
            await setRow({ isAdmin: 'n' })
            A.equal((await getJson(`/api/getUserByToken?token=${q(TOKEN_AS_EMAIL)}`)).msg, 'userNotAdmin')
            A.equal((await getJson(`/api/getPermUserInfor?token=${q(TOKEN_AS_EMAIL)}&userId=id-for-peter`)).msg, 'userNotAdmin', '在表以列為準, 反查之 isAdmin y 不採信')
            stat.cells += 11
        })

        it('MX-R6 [外審 sol F1] 不在表且 isAdmin n、而 verifyAppUser 因非角色因素否決 → 兩條應用系統路由皆先回 userNoPermission(部署方否決先於等級不足 userNotAdmin), 零寫入; 對照: 同為不在表之 isAdmin n 但未被否決(NFN)回 userNotAdmin', async function() {
            let s0 = await snap4()
            for (let tk of [TOKEN_APP_DENY_N, TOKEN_AS_DENY]) {
                A.equal((await getJson(`/api/getPermUserInfor?token=${q(tk)}&userId=id-for-peter`)).msg, 'userNoPermission')
                A.equal((await syncRow(tk, 'sk-r6')).msg, 'userNoPermission')
            }
            A.equal((await getJson(`/api/getPermUserInfor?token=${q(TOKEN_NOFLAG_N)}&userId=id-for-peter`)).msg, 'userNotAdmin')
            A.equal(await snap4(), s0, '零寫入')
            stat.cells += 5
        })

        it('MX-R8 [外審 sol 增量輪 G5] ①的權限面: 不在表之 sso 管理員(NFV 自身 token／AUX 綁定 token)可經 /syncAndReplaceTabs 匯入自己的 users 列(srcKey ≡ 外部 id、isAdmin y)——之後同一 token 以該 perm 列通過後台與資料通道, 稽核欄由外部 id 轉為 perm 內部 id; 此為既定政策(應用系統路由＝管理員等級, 1.1.15 起即可寫 users), 以測試固定其結果', async function() {
            for (let tk of [TOKEN_SSO_ADMIN, TOKEN_AU_SSO]) {
                A.equal((await getJson(`/api/getUserByToken?token=${q(tk)}`)).state, 'error', '匯入前: 不在表, 後台拒')
            }
            let url = urlSync.replace('{keyTable}', 'users').replace('{token}', q(TOKEN_SSO_ADMIN))
            let imp = await (await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ from: 'appMatrixSelf', rows: [{ srcKey: 'sso-admin-77', order: 0, name: 'sso-admin', email: 'sso-admin@example.com', description: 'self', cgrups: '{}', isAdmin: 'y', isActive: 'y' }] }) })).json()
            A.equal(imp.state, 'success', JSON.stringify(imp).slice(0, 300))
            let row = (await rowsOf('users')).find((r) => r.srcKey === 'sso-admin-77')
            A.ok(row, '自身列已匯入')
            A.equal(row.userId, 'sso-admin-77', '匯入當時不在表: 稽核欄記外部 id')
            for (let tk of [TOKEN_SSO_ADMIN, TOKEN_AU_SSO]) {
                let lg = await getJson(`/api/getUserByToken?token=${q(tk)}`)
                A.equal(lg.state, 'success', JSON.stringify(lg).slice(0, 200))
                A.equal(lg.msg.id, row.id, '匯入後: 以 perm 列通過, 回 perm 列')
                A.equal((await callRpc('getWebInfor', [], tk)).ok, true, '匯入後: 資料通道通過')
            }
            let rows = (await rowsOf('grups')).concat([{ id: 'id-mx-r8', order: 0, name: 'mx-r8', description: '', from: '', cpemis: '{}' }])
            A.equal((await callRpc('updateGrups', [rows], TOKEN_SSO_ADMIN)).ok, true)
            A.equal((await rowsOf('grups')).find((g) => g.id === 'id-mx-r8').userId, row.id, '匯入後: 稽核欄記 perm 內部 id')
            stat.cells += 9
        })

        it('MX-R7 [外審 sol F1] 外部列管理員(經匯入建立, srcKey ≡ 外部 id sso-ext-5, 內部 id 為系統配發): 後台登入、資料通道、兩條應用系統路由皆通過, 稽核欄一律記 perm 內部 id(≠ srcKey)', async function() {
            let imp = await (await fetch(urlSync.replace('{keyTable}', 'users').replace('{token}', q(TOKEN_ADMIN)), { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ from: 'appMatrixU', rows: [{ srcKey: 'sso-ext-5', order: 0, name: 'ext5', email: 'ext5@example.com', description: 'ext', cgrups: '{}', isAdmin: 'y', isActive: 'y' }] }) })).json()
            A.equal(imp.state, 'success', JSON.stringify(imp).slice(0, 300))
            let ur = (await rowsOf('users')).find((r) => r.srcKey === 'sso-ext-5')
            A.ok(ur, '外部列已建立')
            A.notEqual(ur.id, 'sso-ext-5', '內部 id 為系統配發, 不等於 srcKey')
            let lg = await getJson(`/api/getUserByToken?token=${q(TOKEN_EXT_ROW)}`)
            A.equal(lg.state, 'success', JSON.stringify(lg).slice(0, 200))
            A.equal(lg.msg.id, ur.id, '登入檢查回 perm 列')
            let rows = (await rowsOf('grups')).concat([{ id: 'id-mx-r7', order: 0, name: 'mx-r7', description: '', from: '', cpemis: '{}' }])
            let w = await callRpc('updateGrups', [rows], TOKEN_EXT_ROW)
            A.equal(w.ok, true, JSON.stringify(w).slice(0, 300))
            A.equal((await rowsOf('grups')).find((g) => g.id === 'id-mx-r7').userId, ur.id, '資料通道稽核欄: perm 內部 id')
            let p = await getJson(`/api/getPermUserInfor?token=${q(TOKEN_EXT_ROW)}&userId=id-for-peter`)
            A.equal(p.state, 'success', JSON.stringify(p).slice(0, 200))
            let res = await syncRow(TOKEN_EXT_ROW, 'sk-r7')
            A.equal(res.state, 'success', JSON.stringify(res).slice(0, 300))
            A.equal((await rowsOf('grups')).find((g) => g.from === F_SYNC && g.srcKey === 'sk-r7').userId, ur.id, '應用路由稽核欄: perm 內部 id')
            await cleanExternalFixtures({ kts: ['grups'], froms: [F_SYNC] })
            stat.cells += 7
        })
    })


    after(function() {
        console.log(`[api-callerMatrix] 已斷言格數(含相容軸): ${stat.cells}`)
    })
})
