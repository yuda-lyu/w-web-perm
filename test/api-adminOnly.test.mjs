//權限後台與資料通道只限系統管理員(perm-run01; 使用者 2026-10-24 裁示「系統管理員才能讀寫 4 表, 一般使用者是沒法進權限後台的, 故只能用 token 查自己權限樹」; 真後端)。
//規格: C:\opensrcOper\dspec\使用者身分驗證原則.md 二.4(函數層級須另檢查角色, 不得只靠部署方之授權設定); 規則帳本 R-ADMIN-ONLY-01(sgud/rule/rulebook_security.md)。
//
//定義: 系統管理員＝perm users 表中 isAdmin='y' 且 isActive='y' 之列(perm 以自身表為權威, 不採 token 宣稱值); 一般使用者＝isAdmin='n' 者。
//角色軸: A 管理員(sys)、M 一般使用者(TOKEN_MEMBER: perm 列 isAdmin n 且啟用, srv.mjs 之 verifyClientUser 放行 → 「部署方放行」)、M+ 一般使用者被升為管理員(perm 為權威)、
//        D 停用之管理員(TOKEN_ADMIN2, isAdmin y 但 isActive n)、P 部署方放行之一般使用者(TOKEN_PETER; perm-run01 本輪 P-7 起 srv.mjs 之 verifyClientUser 不再以 isAdmin 否決)、
//        X 不在 perm 且 isApp 未轉傳(TOKEN_NOFLAG; 原 TOKEN_APP, 現屬系統服務用途, 見 api-callerMatrix)、B 無效 token。
//入口軸: 資料通道 RPC(唯讀 getWebInfor／getStaEvent／getStaEventTable、寫入 updateXxx ×4)、表 select ×4、系統函數([sys:getFuncList]／[sys:getTableTags])、
//        上傳下載入口(/api/ulctr、slc、dwgfn、dwgf、dw)、本體 __sysToken__(執行身分)、/api/getUserByToken(後台登入檢查)、/api/getPerm(查本人權限樹, 一般使用者照常開放)。
//[A] 連線閘: 一般使用者(部署方放行)經任何入口皆被拒(傳輸層 permission denied)、回應不含資料、記 srLog verifyConn-error msg userNotAdmin(不含 token); 管理員照常。
//[B] 執行身分: 標頭 token 為管理員、本體 __sysToken__ 為一般使用者 → reject userNotAdmin、函數不執行(零寫入、零資料)、記 srLog getUserIdByToken-error。
//[C] /api/getUserByToken: 一般使用者(部署方放行) → {state:'error', msg:'userNotAdmin'}; 管理員照常; 部署方拒絕者仍為 userNoPermission(不改既有鍵)。
//[D] /api/getPerm 與應用路由不變: 一般使用者取得本人權限樹(與同授權之既有使用者 getPermUserInfor 結果一致)、非本人不可查。
//跑法(需測試鎖): node C:/opensrcOper/tools/quiet-run.mjs --name tadmin --lock --timeout 1800 -- npx mocha test/api-adminOnly.test.mjs --timeout 300000
import assert from 'assert'
import { assertPristineSeed } from './tools/baseSeed.mjs'
import {
    startApi, apiBaseUrl, TOKEN_ADMIN, TOKEN_ADMIN2, TOKEN_MEMBER, TOKEN_PETER, TOKEN_APP, TOKEN_NOFLAG, TOKEN_DENY, TOKEN_BAD, TOKEN_MUTATE, TOKEN_SLOW, urlGetPerm, urlGetPermUserInfor,
    callRpc, readTables, selectAllRows, purgeExternalRows, markSrLog, readSrLogSince,
} from './tools/api-setup.mjs'
import { restartBackend } from './tools/e2e-setup.mjs'
import getPerm from '../src/getPerm.mjs'
import getPermUserInfor from '../src/getPermUserInfor.mjs'

const A = assert.strict
const KTS = ['users', 'grups', 'pemis', 'targets']
const FN = { users: 'updateUsers', grups: 'updateGrups', pemis: 'updatePemis', targets: 'updateTargets' }

let clone = (o) => JSON.parse(JSON.stringify(o))
let byId = (a, b) => String(a.id).localeCompare(String(b.id))
let byOrder = (a, b) => ((a.order || 0) - (b.order || 0)) || byId(a, b)
let rowsOf = async (kt) => (await selectAllRows(kt)).slice().sort(byOrder).map(clone)
let snapKt = async (kt) => JSON.stringify((await selectAllRows(kt)).slice().sort(byId))
let snap4 = async () => JSON.stringify(await Promise.all(KTS.map(snapKt)))
let sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

//perm users 夾具列(後台列, from ''): member 授權同 base seed 之 peter(權限群組M1), 使其權限樹非空
let userRow = (id, name, isAdmin, isActive, cgrups) => ({ id, order: 50, name, email: `${name}@example.com`, description: '', from: '', cgrups, isAdmin, isActive })

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

//getUserByTokenApi: 後台登入檢查(w-ui-loginout 呼叫之 /api/getUserByToken), 回 { state, msg }
let getUserByTokenApi = async (token) => {
    let r = await fetch(`${apiBaseUrl}/api/getUserByToken?token=${encodeURIComponent(token)}`)
    return await r.json()
}

//回應不得含之個資與資料特徵(base seed 之使用者 email／名稱; 管理員視角之資料)
const LEAK = ['admin@example.com', 'peter@example.com', 'mary@example.com', 'john@example.com', '權限群組M1', '權限群組M4']


describe('api-adminOnly (權限後台與資料通道只限系統管理員, perm-run01, 真後端)', function() {
    this.timeout(300000)

    let BASE = null
    let CGRUPS_PETER = ''

    //restoreBase: 四表還原為 base seed(次序: 被引用者先、引用端後), 夾具使用者(member／admin2)隨 users 還原而移除
    let restoreBase = async () => {
        await purgeExternalRows(KTS, { keepIds: Object.fromEntries(KTS.map((kt) => [kt, BASE[kt].map((r) => r.id)])) })
        for (let kt of ['targets', 'pemis', 'grups', 'users']) {
            let r = await callRpc(FN[kt], [clone(BASE[kt])], TOKEN_ADMIN)
            if (!r.ok) {
                throw new Error(`restoreBase ${FN[kt]} 失敗: ${JSON.stringify(r).slice(0, 200)}`)
            }
        }
    }

    //addUsers: 以管理員在 base seed 的 users 之上追加夾具使用者
    let addUsers = async (rows) => {
        let cur = await rowsOf('users')
        let r = await callRpc('updateUsers', [[...cur, ...rows]], TOKEN_ADMIN)
        A.ok(r.ok, `追加夾具使用者應成功: ${JSON.stringify(r).slice(0, 300)}`)
    }

    //member: 一般使用者(通過部署方 verifyClientUser, perm 列 isAdmin n 且啟用)
    let addMember = async (isAdmin = 'n', isActive = 'y') => addUsers([userRow('id-for-member', 'member', isAdmin, isActive, CGRUPS_PETER)])

    before(async function() {
        this.timeout(300000)
        await startApi()
        for (let kt of KTS) {
            assertPristineSeed(kt, await selectAllRows(kt))
        }
        BASE = await readTables()
        BASE.targets = await rowsOf('targets')
        CGRUPS_PETER = BASE.users.find((u) => u.id === 'id-for-peter').cgrups
        A.ok(typeof CGRUPS_PETER === 'string' && CGRUPS_PETER.length > 0, '前提: peter 有授權字串')
    })

    afterEach(async function() {
        this.timeout(120000)
        await restoreBase()
    })

    after(async function() {
        this.timeout(300000)
        await restartBackend('./settings.json')
        await restoreBase()
    })


    // ===== [A] 連線閘: 入口 × 一般使用者 =====
    describe('A 連線閘(checkToken): 一般使用者(部署方放行)經任何資料通道入口皆被拒', function() {

        let grupsAdd = async () => (await rowsOf('grups')).concat([{ id: 'id-ao-new', order: 0, name: 'ao-new', description: '', from: '', cpemis: '{}' }])
        //入口表: 名稱、函數、參數(函數回傳參數陣列)、管理員對照是否應成功
        let entries = [
            { name: 'RPC 唯讀 getWebInfor', fn: 'getWebInfor', args: async () => [] },
            { name: 'RPC 唯讀 getStaEventTable', fn: 'getStaEventTable', args: async () => [] },
            { name: 'RPC 唯讀 getStaEvent', fn: 'getStaEvent', args: async () => [7, 'hr'] },
            { name: '表 select users', fn: 'users.select', args: async () => [] },
            { name: '表 select grups', fn: 'grups.select', args: async () => [] },
            { name: '表 select pemis', fn: 'pemis.select', args: async () => [] },
            { name: '表 select targets', fn: 'targets.select', args: async () => [] },
            { name: '系統函數 [sys:getFuncList]', fn: '[sys:getFuncList]', args: async () => [] },
            { name: '系統函數 [sys:getTableTags]', fn: '[sys:getTableTags]', args: async () => [] },
            { name: '寫入 updateUsers', fn: 'updateUsers', args: async () => [(await rowsOf('users')).map((r, k) => (k === 0 ? { ...r, description: 'by-member' } : r))] },
            { name: '寫入 updateGrups', fn: 'updateGrups', args: async () => [await grupsAdd()] },
            { name: '寫入 updatePemis', fn: 'updatePemis', args: async () => [(await rowsOf('pemis')).map((r, k) => (k === 0 ? { ...r, description: 'by-member' } : r))] },
            { name: '寫入 updateTargets', fn: 'updateTargets', args: async () => [(await rowsOf('targets')).map((r, k) => (k === 0 ? { ...r, description: 'by-member' } : r))] },
        ]

        for (let e of entries) {
            it(`AO-A1 ${e.name}: 一般使用者被連線閘拒絕(permission denied)、回應無資料、零寫入; 管理員同一輸入照常  [使用者裁示: 一般使用者沒法進權限後台]`, async function() {
                await addMember()
                let before = await snap4()
                let args = await e.args()
                let r = await callRpc(e.fn, args, TOKEN_MEMBER)
                A.equal(r.ok, false, `一般使用者不得呼叫 ${e.fn}, 實得 ${JSON.stringify(r).slice(0, 200)}`)
                A.equal(r.msg, 'permission denied', `${e.fn} 應於連線閘被拒`)
                for (let s of LEAK) {
                    A.ok(!r.raw.includes(s), `被拒回應不得含資料特徵 ${s}`)
                }
                A.ok(!r.raw.includes(TOKEN_MEMBER), '回應不得回顯 token')
                A.equal(await snap4(), before, '零寫入')
                //對照: 管理員同一輸入成功(差別只在角色)
                let ok = await callRpc(e.fn, args, TOKEN_ADMIN)
                A.equal(ok.ok, true, `管理員照常 ${e.fn}: ${JSON.stringify(ok).slice(0, 200)}`)
            })
        }

        it('AO-A2 perm 為權威: 同一 token(TOKEN_MEMBER, token 宣稱 isAdmin n)之 perm 列為 isAdmin y 且啟用時可連線與寫入; 列降為 n 後即被拒  [WWebPerm.getTokenUser: 不採 token 宣稱值]', async function() {
            await addMember('y', 'y')
            let r1 = await callRpc('getWebInfor', [], TOKEN_MEMBER)
            A.equal(r1.ok, true, JSON.stringify(r1).slice(0, 200))
            let rows = (await rowsOf('grups')).concat([{ id: 'id-ao-a2', order: 0, name: 'ao-a2', description: '', from: '', cpemis: '{}' }])
            let w = await callRpc('updateGrups', [rows], TOKEN_MEMBER)
            A.equal(w.ok, true, JSON.stringify(w).slice(0, 300))
            A.ok((await rowsOf('grups')).some((g) => g.id === 'id-ao-a2'), '升為管理員後之寫入生效')
            //管理員(sys)把 member 降為一般使用者 → 立即被拒(每次請求新鮮讀 perm 列, 不快取)
            let users = (await rowsOf('users')).map((u) => (u.id === 'id-for-member' ? { ...u, isAdmin: 'n' } : u))
            let d = await callRpc('updateUsers', [users], TOKEN_ADMIN)
            A.equal(d.ok, true, JSON.stringify(d).slice(0, 300))
            let r2 = await callRpc('getWebInfor', [], TOKEN_MEMBER)
            A.equal(r2.ok, false)
            A.equal(r2.msg, 'permission denied')
        })

        it('AO-A3 停用之管理員(perm 列 isAdmin y、isActive n)被拒(permission denied), 與角色檢查無關的既有關卡不退讓', async function() {
            await addUsers([userRow('id-for-admin2', 'admin2', 'y', 'n', '{}')])
            let r = await callRpc('getWebInfor', [], TOKEN_ADMIN2)
            A.equal(r.ok, false)
            A.equal(r.msg, 'permission denied')
        })

        it('AO-A4 其餘角色皆拒(部署方拒絕者 P、不在 perm 者 X、無效 token B)且不含資料: 對照 M 同為 permission denied', async function() {
            await addMember()
            for (let [label, tk] of [['P peter', TOKEN_PETER], ['X 不在 perm〔isApp 未轉傳〕', TOKEN_NOFLAG], ['B bad', TOKEN_BAD]]) {
                let r = await callRpc('users.select', [], tk)
                A.equal(r.ok, false, label)
                A.equal(r.msg, 'permission denied', label)
                for (let s of LEAK) {
                    A.ok(!r.raw.includes(s), `${label}: 不得含 ${s}`)
                }
            }
        })

        it('AO-A5 被拒記 srLog: event verifyConn-error、msg userNotAdmin、apiType main; log 不含 token', async function() {
            await addMember()
            let mark = await markSrLog()
            let r = await callRpc('users.select', [], TOKEN_MEMBER)
            A.equal(r.msg, 'permission denied')
            let lines = await waitLines(mark, (l) => l.event === 'verifyConn-error' && l.msg === 'userNotAdmin', 'verifyConn-error userNotAdmin')
            let ev = lines.find((l) => l.event === 'verifyConn-error' && l.msg === 'userNotAdmin')
            A.equal(ev.apiType, 'main')
            A.ok(!JSON.stringify(lines).includes(TOKEN_MEMBER), 'log 不得含 token 值')
        })

        //上傳下載入口: 各路由先經同一連線閘(apiType 為 upload-controller／upload-slice／download-get-filename／download-get-file／download); 一般使用者之回應須與無效 token 之回應完全相同(permission denied), 且不同於管理員(管理員過閘後因缺參數得到另一種回應)
        let routes = [
            { name: '/api/ulctr(upload-controller)', path: '/api/ulctr', method: 'POST' },
            { name: '/api/slc(upload-slice)', path: '/api/slc', method: 'POST' },
            { name: '/api/dwgfn(download-get-filename)', path: '/api/dwgfn', method: 'POST' },
            { name: '/api/dwgf(download-get-file)', path: '/api/dwgf', method: 'GET' },
            { name: '/api/dw(download)', path: '/api/dw', method: 'POST' },
        ]
        let callRoute = async (rt, token) => {
            let url = `${apiBaseUrl}${rt.path}${rt.method === 'GET' ? `?token=${encodeURIComponent(token)}` : ''}`
            let r = await fetch(url, { method: rt.method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' }, body: rt.method === 'GET' ? undefined : Buffer.from('x') })
            let body = Buffer.from(await r.arrayBuffer()).toString('latin1')
            return { status: r.status, body }
        }
        for (let rt of routes) {
            it(`AO-A6 ${rt.name}: 一般使用者之回應 ≡ 無效 token 之回應(permission denied), ≢ 管理員之回應(已過閘)  [所有入口名皆經同一連線閘]`, async function() {
                await addMember()
                let rm = await callRoute(rt, TOKEN_MEMBER)
                let rb = await callRoute(rt, TOKEN_BAD)
                let ra = await callRoute(rt, TOKEN_ADMIN)
                A.equal(rm.status, rb.status, '一般使用者與無效 token 之 HTTP 狀態相同')
                A.equal(rm.body, rb.body, '一般使用者與無效 token 之回應本體相同(皆為 permission denied)')
                A.ok(rm.body.includes('permission denied'), `回應應為 permission denied: ${rm.body.slice(0, 120)}`)
                A.ok(!ra.body.includes('permission denied'), `管理員已過閘(回應為參數類錯誤, 非 permission denied): ${ra.body.slice(0, 120)}`)
            })
        }
    })


    // ===== [B] 執行身分: 本體 __sysToken__ =====
    describe('B 執行身分(getUserIdByToken): 標頭 token 為管理員、本體 token 為一般使用者', function() {

        it('AO-B1 本體 token 為一般使用者(部署方放行) → reject userNotAdmin; 寫入函數不執行(零寫入)、唯讀函數與表 select 亦不回資料  [框架對本體 token 反查即驗證身分]', async function() {
            await addMember()
            let before = await snap4()
            let rows = (await rowsOf('grups')).concat([{ id: 'id-ao-b1', order: 0, name: 'ao-b1', description: '', from: '', cpemis: '{}' }])
            for (let [fn, args] of [['updateGrups', [rows]], ['getWebInfor', []], ['users.select', []], ['grups.select', []], ['[sys:getFuncList]', []]]) {
                let r = await callRpc(fn, args, TOKEN_ADMIN, { sysToken: TOKEN_MEMBER })
                A.equal(r.ok, false, `${fn}: 本體 token 為一般使用者時不得執行, 實得 ${JSON.stringify(r).slice(0, 200)}`)
                A.equal(r.msg, 'userNotAdmin', fn)
                for (let s of LEAK) {
                    A.ok(!r.raw.includes(s), `${fn}: 被拒回應不得含 ${s}`)
                }
                A.ok(!r.raw.includes(TOKEN_MEMBER), `${fn}: 回應不得回顯 token`)
            }
            A.equal(await snap4(), before, '零寫入')
        })

        it('AO-B2 本體 token 之使用者被升為管理員(perm 列 isAdmin y) → 以其身分執行(對照: 差別只在 perm 角色)', async function() {
            await addMember('y', 'y')
            let rows = (await rowsOf('grups')).concat([{ id: 'id-ao-b2', order: 0, name: 'ao-b2', description: '', from: '', cpemis: '{}' }])
            let r = await callRpc('updateGrups', [rows], TOKEN_ADMIN, { sysToken: TOKEN_MEMBER })
            A.equal(r.ok, true, JSON.stringify(r).slice(0, 300))
            let row = (await rowsOf('grups')).find((g) => g.id === 'id-ao-b2')
            A.ok(row, '新列已寫入')
            A.equal(row.userId, 'id-for-member', '建立者為本體 token 之使用者')
        })

        it('AO-B3 被拒記 srLog: event getUserIdByToken-error、msg userNotAdmin; log 不含 token', async function() {
            await addMember()
            let mark = await markSrLog()
            let r = await callRpc('getWebInfor', [], TOKEN_ADMIN, { sysToken: TOKEN_MEMBER })
            A.equal(r.msg, 'userNotAdmin')
            let lines = await waitLines(mark, (l) => l.event === 'getUserIdByToken-error' && l.msg === 'userNotAdmin', 'getUserIdByToken-error userNotAdmin')
            A.ok(lines.length > 0)
            A.ok(!JSON.stringify(lines).includes(TOKEN_MEMBER), 'log 不得含 token 值')
        })
    })


    // ===== [C] /api/getUserByToken(後台登入檢查) =====
    describe('C 後台登入檢查(/api/getUserByToken): 非系統管理員一律拒絕', function() {

        it('AO-C1 一般使用者(部署方放行)登入檢查 → state error、msg userNotAdmin(固定錯誤鍵); 不回使用者資料; 管理員照常', async function() {
            await addMember()
            let r = await getUserByTokenApi(TOKEN_MEMBER)
            A.equal(r.state, 'error', JSON.stringify(r).slice(0, 200))
            A.equal(r.msg, 'userNotAdmin')
            let raw = JSON.stringify(r)
            for (let s of LEAK.concat(['member@example.com'])) {
                A.ok(!raw.includes(s), `被拒回應不得含 ${s}`)
            }
            let ok = await getUserByTokenApi(TOKEN_ADMIN)
            A.equal(ok.state, 'success', JSON.stringify(ok).slice(0, 200))
            A.equal(ok.msg.id, 'id-for-admin')
        })

        it('AO-C2 perm 為權威: member 之 perm 列升為管理員 → 登入檢查通過; 降回一般使用者 → 拒', async function() {
            await addMember('y', 'y')
            let r1 = await getUserByTokenApi(TOKEN_MEMBER)
            A.equal(r1.state, 'success', JSON.stringify(r1).slice(0, 200))
            let users = (await rowsOf('users')).map((u) => (u.id === 'id-for-member' ? { ...u, isAdmin: 'n' } : u))
            let d = await callRpc('updateUsers', [users], TOKEN_ADMIN)
            A.equal(d.ok, true, JSON.stringify(d).slice(0, 300))
            let r2 = await getUserByTokenApi(TOKEN_MEMBER)
            A.equal(r2.state, 'error')
            A.equal(r2.msg, 'userNotAdmin')
        })

        it('AO-C3 其餘角色之既有錯誤鍵不變: 部署方拒絕者 userNoPermission、不在 perm 者 cannotGetUserFromPerm、無效 token cannotFindUserFromToken、停用之管理員 cannotGetUserFromPerm', async function() {
            await addUsers([userRow('id-for-admin2', 'admin2', 'y', 'n', '{}'), userRow('id-for-deny', 'deny', 'y', 'y', '{}')])
            //perm-run01 本輪(P-7): srv.mjs 之 verifyClientUser 不再以 isAdmin 否決, peter 通過部署方後由本套件以 userNotAdmin 拒絕; 「部署方拒絕」改以非角色因素否決之 TOKEN_DENY 代表
            A.equal((await getUserByTokenApi(TOKEN_PETER)).msg, 'userNotAdmin')
            A.equal((await getUserByTokenApi(TOKEN_DENY)).msg, 'userNoPermission')
            A.equal((await getUserByTokenApi(TOKEN_NOFLAG)).msg, 'cannotGetUserFromPerm') //isApp 未轉傳(視同非應用系統): 不在 perm 表一律被拒; 轉傳 isApp 之系統服務用途見 api-callerMatrix
            A.equal((await getUserByTokenApi(TOKEN_BAD)).msg, 'cannotFindUserFromToken')
            A.equal((await getUserByTokenApi(TOKEN_ADMIN2)).msg, 'cannotGetUserFromPerm')
        })

        it('AO-C4 被拒記 srLog: event api/getUserByToken-error、msg userNotAdmin; log 不含 token', async function() {
            await addMember()
            let mark = await markSrLog()
            await getUserByTokenApi(TOKEN_MEMBER)
            let lines = await waitLines(mark, (l) => l.msg === 'userNotAdmin', 'userNotAdmin log')
            A.ok(lines.length > 0)
            A.ok(!JSON.stringify(lines).includes(TOKEN_MEMBER), 'log 不得含 token 值')
        })
    })


    // ===== [E] 檢查之值即使用之值(外審 sol#2、#3) =====
    describe('E 檢查之值即使用之值: 部署方回呼改寫 user 物件、驗證與取樹之間該列被改動', function() {

        it('AO-E1 部署方 verifyClientUser 改寫其收到之 user(id→id-for-peter、isAdmin→n)後放行: 套件只傳副本, 執行身分仍為 perm 列之 id-for-mutate、角色與登入檢查回傳亦以 perm 列為準  [外審 sol#2]', async function() {
            await addUsers([userRow('id-for-mutate', 'mutate', 'y', 'y', '{}')])
            //資料通道: 寫入以 perm 列之 id-for-mutate 執行(新列之建立者), 不是被改寫後之 id-for-peter(修前: 執行 id 變 id-for-peter → requireAdmin 拒 userNotAdmin)
            let rows = (await rowsOf('grups')).concat([{ id: 'id-ao-e1', order: 0, name: 'ao-e1', description: '', from: '', cpemis: '{}' }])
            let w = await callRpc('updateGrups', [rows], TOKEN_MUTATE)
            A.equal(w.ok, true, JSON.stringify(w).slice(0, 300))
            let row = (await rowsOf('grups')).find((g) => g.id === 'id-ao-e1')
            A.ok(row, '新列已寫入')
            A.equal(row.userId, 'id-for-mutate', '建立者為驗證當下之 perm 列, 不是被部署方回呼改寫後之 id')
            //後台登入檢查與 /api/getPerm 回的是 perm 列
            let lg = await getUserByTokenApi(TOKEN_MUTATE)
            A.equal(lg.state, 'success', JSON.stringify(lg).slice(0, 200))
            A.equal(lg.msg.id, 'id-for-mutate')
            A.equal(lg.msg.isAdmin, 'y')
            let pm = await getPerm(urlGetPerm, TOKEN_MUTATE)
            A.equal(pm.user.id, 'id-for-mutate')
        })

        it('AO-E2 /api/getPerm: 驗證(async verifyClientUser 等待約 1.5 秒)期間該列被改授權 → 回驗證當下之列與權限樹, 不以 id 重讀(重讀會回等待期間才改成的授權)  [外審 sol#3]', async function() {
            await addUsers([userRow('id-for-slow', 'slow', 'n', 'y', CGRUPS_PETER)]) //驗證當下之授權: 權限群組M1
            let pending = getPerm(urlGetPerm, TOKEN_SLOW)
            await sleep(500) //已進入 verifyClientUser 之等待
            let cgMary = BASE.users.find((u) => u.id === 'id-for-mary').cgrups //權限群組M2
            let users = (await rowsOf('users')).map((u) => (u.id === 'id-for-slow' ? { ...u, cgrups: cgMary } : u))
            let w = await callRpc('updateUsers', [users], TOKEN_ADMIN)
            A.equal(w.ok, true, JSON.stringify(w).slice(0, 300))
            let ur = await pending
            A.equal(ur.user.id, 'id-for-slow')
            A.equal(ur.user.grupsNames, '權限群組M1', '回驗證當下之授權(M1), 不是等待期間被改成之 M2')
            //等待結束後再查一次: 已是新授權(M2)——確認改動確實發生
            let ur2 = await getPerm(urlGetPerm, TOKEN_SLOW)
            A.equal(ur2.user.grupsNames, '權限群組M2')
        })
    })


    // ===== [D] 不變: /api/getPerm 與應用系統路由 =====
    describe('D /api/getPerm 與應用路由不變', function() {

        it('AO-D1 一般使用者(部署方放行)經 /api/getPerm 取得本人權限樹: user 為本人、grupsNames 為其授權群組、rules 與同授權之 peter(經 getPermUserInfor)一致  [一般使用者只能用 token 查自己權限樹]', async function() {
            await addMember()
            let ur = await getPerm(urlGetPerm, TOKEN_MEMBER)
            A.equal(ur.user.id, 'id-for-member')
            A.equal(ur.user.grupsNames, '權限群組M1')
            let up = await getPermUserInfor(urlGetPermUserInfor, TOKEN_APP, 'id-for-peter')
            A.equal(up.user.grupsNames, '權限群組M1')
            A.deepEqual(ur.rules, up.rules, '同授權(cgrups 相同)者之權限樹相同')
            A.ok(ur.rules.some((r) => r.isActive === 'y'), '權限樹非空(有 y 項)')
        })

        it('AO-D2 /api/getPerm 只回「token 所屬」之本人權限樹: 管理員 token 得管理員之樹(與 member 不同)', async function() {
            await addMember()
            let ua = await getPerm(urlGetPerm, TOKEN_ADMIN)
            A.equal(ua.user.id, 'id-for-admin')
            A.equal(ua.user.grupsNames, '權限群組M4')
            let um = await getPerm(urlGetPerm, TOKEN_MEMBER)
            A.notDeepEqual(ua.rules, um.rules, '不同授權者之權限樹不同')
        })

        it('AO-D3 應用路由不變: 應用系統 token(不在 perm users 表)仍可 getPermUserInfor 查指定使用者(含一般使用者 member)', async function() {
            await addMember()
            let up = await getPermUserInfor(urlGetPermUserInfor, TOKEN_APP, 'id-for-member')
            A.equal(up.user.id, 'id-for-member')
            A.equal(up.user.grupsNames, '權限群組M1')
        })
    })
})
