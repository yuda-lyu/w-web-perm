//api-sysFuncs.test.mjs — 框架系統函數之身分關卡: `[sys:getFuncList]` / `[sys:getTableTags]` / `[sys:polling]` × 呼叫者 × 新／舊協定(perm-run01 本輪, 任務 20261025161334; R-SYSFUNCS-01)
//
// 規格: C:\opensrcOper\dspec\使用者身分驗證原則.md 二.7、二.8(系統函數依作用分類: 只回名稱等公開資訊者可公開, 其餘須身分; 框架預設三者公開〔相容〕, 使用方於前端改用新元件之同一版本顯式設定);
//       規則帳本 R-SYSFUNCS-01(sgud/rule/rulebook_security.md); 先例 w-web-task 1.0.37(只公開 getFuncList)。
// 本套件設定: `sysFuncsPublic: ['[sys:getFuncList]']`(server/WWebPerm.mjs); `getUserIdByToken` 為真實反查(與 task 同型)且對空 token / 非系統管理者 fail-closed——
//   故「公開 getFuncList」在本套件只是設定之表述, 實際仍須有效系統管理者身分(連線閘 verifyConn 先擋; 本體 token 再經 getUserIdByToken)。登入前不連線: src/main.js 之 `useWaitToken: true`
//   使前端元件在有 token 之前不輪詢、不呼叫任何系統函數(unit-sysFuncsSite 守護; 真瀏覽器見 spec/evidence/perm-run01-20261025/)。
//
// 呼叫者軸(7): N 無 token、U 一般使用者(perm 列 isAdmin n, 部署方放行)、A 系統管理者、AUA 使用者用途之應用系統綁系統管理者、AUM 使用者用途綁一般使用者、AS 系統服務用途、BAD 未知 token。
//   「通過」＝系統管理者服務等級(A／AUA／AS; 與 api-callerMatrix 之 svc 同); 其餘於連線閘(標頭)或執行身分(本體)被拒。
// 協定軸(4):
//   new   新協定(w-serv-hapi ≥1.1.8 之前端元件): 標頭 Authorization 與本體 `__sysToken__` 皆為呼叫者 token(輪詢本體為 { clientId, __sysToken__ }, 函數為 { __sysInputArgs__, __sysToken__ });
//   body  本體來源: 標頭為有效系統管理者, 本體 `__sysToken__` 為呼叫者 token(兩個身分來源各自完整驗證, 框架不比對);
//   old   舊協定(已發布之舊前端建置檔的輪詢): 本體不帶 `__sysToken__` 鍵(輪詢輸入恰為 { clientId }; 函數輸入恰為 { __sysInputArgs__ }), 標頭為呼叫者 token;
//   empty 本體 `__sysToken__` 為空字串(未登入但連上之前端), 標頭為呼叫者 token。
// 預期: 只有 (通過者 × new／body) 放行且回應內容正確(函數名稱清單含 getWebInfor／updateUsers／users.select; 同步表時間戳含四表; 輪詢回陣列); old／empty 對任何呼叫者皆拒、被拒回應不含資料,
//   且拒絕鍵固定(一般使用者本體 → userNotAdmin; 其餘 → cannotFindUserFromToken; 輪詢 → 框架固定訊息 [sys:polling] permission denied)。
//   框架預設(三者公開)下 [sys:polling] × 通過者 × old 會因「缺鍵視同無身分且公開」而放行——本檔修前紅之所在。
// 邊界(外審 sol F1): 本體 token 非字串(cstr 轉為空字串或數字字串, 一律被拒)、輪詢 clientId 缺失／非字串、函數輸入封裝缺鍵或型別錯、函數名大小寫／空白／未知名稱——皆不得放行。
// 已知範圍外(框架): clientId 過長之資源邊界(w-serv-broadcast 只檢查非空字串)、clientLeave 延後送達與重新在線之交錯(外審 sol F3 推測), 見報告備查。
//
// 跑法(需測試鎖): node C:/opensrcOper/tools/quiet-run.mjs --name tsysf --lock --timeout 1800 -- npx mocha --no-parallel test/api-sysFuncs.test.mjs --timeout 300000
import assert from 'assert'
import obj2u8arr from 'wsemi/src/obj2u8arr.mjs'
import u8arr2obj from 'wsemi/src/u8arr2obj.mjs'
import WServHapiClient from 'w-serv-hapi/src/WServHapiClient.mjs'
import { assertPristineSeed } from './tools/baseSeed.mjs'
import {
    startApi, apiBaseUrl,
    TOKEN_ADMIN, TOKEN_MEMBER, TOKEN_AS, TOKEN_AU_ADMIN, TOKEN_AU_MEMBER, TOKEN_BAD,
    callRpc, selectAllRows, markSrLog, readSrLogSince
} from './tools/api-setup.mjs'
import procLang from '../server/procLang.mjs'

const A = assert.strict
const KEYS = new Set(Object.keys(procLang({}).eng)) //語系鍵全集: 被拒之 msg 一律須在其內
const FUNCS = ['[sys:getFuncList]', '[sys:getTableTags]', '[sys:polling]']
const PROTOS = ['new', 'body', 'old', 'empty']
const POLL_DENIED = '[sys:polling] permission denied' //輪詢被拒時前端只見此固定訊息(原因只經 error 事件)
//回應不得含之資料特徵: 函數名稱清單(getFuncList)、同步表時間戳(getTableTags)
const LEAK = ['updateUsers', 'getWebInfor', 'syncKpTable', 'users.select']

//ok: 是否為系統管理者服務等級(通過連線閘與執行身分); 其餘皆拒
const CALLERS = [
    { k: 'N', label: '無 token', token: '', ok: false },
    { k: 'U', label: '一般使用者', token: TOKEN_MEMBER, ok: false },
    { k: 'A', label: '系統管理者', token: TOKEN_ADMIN, ok: true },
    { k: 'AUA', label: '使用者用途之應用系統(綁系統管理者)', token: TOKEN_AU_ADMIN, ok: true },
    { k: 'AUM', label: '使用者用途之應用系統(綁一般使用者)', token: TOKEN_AU_MEMBER, ok: false },
    { k: 'AS', label: '系統服務用途', token: TOKEN_AS, ok: true },
    { k: 'BAD', label: '未知 token', token: TOKEN_BAD, ok: false }
]

let clone = (o) => JSON.parse(JSON.stringify(o))
let sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let seq = 0

//rawRpc: 直打 POST /api/main(同前端元件之編碼); hdrToken 為 null 時不帶 Authorization; 回 { obj, raw }
let rawRpc = async (func, input, hdrToken) => {
    let headers = { 'Content-Type': 'application/octet-stream' }
    if (hdrToken !== null) {
        headers['Authorization'] = `Bearer ${hdrToken}`
    }
    let res = await fetch(`${apiBaseUrl}/api/main`, { method: 'POST', headers, body: Buffer.from(obj2u8arr({ func, input })) })
    let u8a = new Uint8Array(await res.arrayBuffer())
    return { obj: u8arr2obj(u8a), raw: Buffer.from(u8a).toString('utf8') }
}

//sendOf: 依 (函數, 呼叫者, 協定) 組出標頭 token 與本體輸入
let sendOf = (func, c, proto) => {
    let hdr = (proto === 'body') ? TOKEN_ADMIN : (c.token === '' ? null : c.token)
    let tok = (proto === 'new') ? c.token : (proto === 'body') ? c.token : ''
    let input = (func === '[sys:polling]') ? { clientId: `sf-${c.k}-${proto}-${++seq}` } : { __sysInputArgs__: [] }
    if (proto !== 'old') {
        input.__sysToken__ = tok
    }
    return { hdr, input }
}

//contentOk: 放行時回應內容須為該函數應有者(不只 state 為 success; 外審 sol F7)
let contentOk = (func, msg) => {
    if (func === '[sys:getFuncList]') {
        return Array.isArray(msg) && ['getWebInfor', 'updateUsers', 'users.select'].every((n) => msg.includes(n))
    }
    if (func === '[sys:getTableTags]') {
        return !!msg && msg.mode === 'syncKpTable' && !!msg.data && ['users', 'grups', 'pemis', 'targets'].every((k) => k in msg.data)
    }
    return false
}

//outcomeOf: 'allow' | 'gate'(連線閘 permission denied) | 'body:<msg>'(框架／執行身分拒) | 'shape:…'(回應形狀不符協定)
//  輪詢放行＝success 外殼內 output 為陣列(廣播訊息佇列); 函數放行＝output.state 為 success 且內容正確
let outcomeOf = (func, r) => {
    let o = r.obj
    if (o && typeof o === 'object' && 'error' in o) {
        let e = String(o.error)
        return (e === 'permission denied') ? 'gate' : `body:${e}`
    }
    if (o && o.success && o.success.func === func) {
        let out = o.success.output
        if (func === '[sys:polling]') {
            return Array.isArray(out) ? 'allow' : `shape:${JSON.stringify(out).slice(0, 80)}`
        }
        if (out && out.state === 'success') {
            return contentOk(func, out.msg) ? 'allow' : `shape:${JSON.stringify(out.msg).slice(0, 80)}`
        }
        return `body:${out && out.msg}`
    }
    return `unparseable:${r.raw.slice(0, 120)}`
}

//isAllowed: 任意函數名之通用判斷(邊界格用; 未知名稱的回應形狀不同, 只問「有沒有放行」)
let isAllowed = (o) => {
    if (!o || typeof o !== 'object' || 'error' in o || !o.success) {
        return false
    }
    let out = o.success.output
    return Array.isArray(out) || !!(out && out.state === 'success')
}

//expectOf: 預期結果之類別
let expectOf = (func, c, proto) => {
    if (c.ok && (proto === 'new' || proto === 'body')) {
        return { kind: 'allow' }
    }
    //標頭為呼叫者 token 且非系統管理者等級(含無 token、未知 token): 連線閘
    if (proto !== 'body' && !c.ok) {
        return { kind: 'gate' }
    }
    //標頭有效(A／AUA／AS 之 old／empty; 或 body 協定之標頭為系統管理者而本體為非系統管理者／空): 框架或執行身分拒
    if (proto === 'old' && func !== '[sys:polling]') {
        return { kind: 'body', msg: 'invalid token' } //函數必須帶 __sysToken__ 鍵(框架封裝鍵, 先於身分關卡)
    }
    if (func === '[sys:polling]') {
        return { kind: 'body', msg: POLL_DENIED } //輪詢身分關卡之固定訊息(前端只見此訊息)
    }
    //函數: 執行身分(getUserIdByToken)拒絕之固定語系鍵——一般使用者(在表、非系統管理者)本體 → userNotAdmin; 空／未知／無 token → cannotFindUserFromToken
    return { kind: 'body', msg: (proto === 'body' && (c.k === 'U' || c.k === 'AUM')) ? 'userNotAdmin' : 'cannotFindUserFromToken' }
}


describe('api-sysFuncs (系統函數 × 呼叫者 × 新舊協定, perm-run01 R-SYSFUNCS-01, 真後端)', function() {
    this.timeout(600000)

    let USERS0 = null
    let cells = 0
    let table = [] //每格實際結果(供報告引用)

    before(async function() {
        this.timeout(300000)
        await startApi()
        for (let kt of ['users', 'grups', 'pemis', 'targets']) {
            assertPristineSeed(kt, await selectAllRows(kt))
        }
        let cur = (await selectAllRows('users')).slice().sort((a, b) => (a.order || 0) - (b.order || 0)).map(clone)
        USERS0 = cur
        //夾具: id-for-member(perm 列 isAdmin n; srv.mjs 之 verifyClientUser 放行 → 通過部署方但非系統管理者)
        let peter = cur.find((u) => u.id === 'id-for-peter')
        let member = { id: 'id-for-member', order: 50, name: 'member', email: 'member@example.com', description: '', from: '', cgrups: peter.cgrups, isAdmin: 'n', isActive: 'y' }
        let r = await callRpc('updateUsers', [[...cur, member]], TOKEN_ADMIN)
        A.ok(r.ok, `夾具使用者應建立成功: ${JSON.stringify(r).slice(0, 300)}`)
    })

    after(async function() {
        this.timeout(300000)
        let r = await callRpc('updateUsers', [clone(USERS0)], TOKEN_ADMIN)
        A.ok(r.ok, `收尾還原 users 應成功: ${JSON.stringify(r).slice(0, 300)}`)
        console.log(`[api-sysFuncs] 已斷言格數: ${cells}`)
        console.log(`[api-sysFuncs] 格表: ${JSON.stringify(table)}`)
    })

    //函數 × 協定一個 it, 內含 7 類呼叫者之格
    for (let func of FUNCS) {
        for (let proto of PROTOS) {
            it(`${func} × 協定 ${proto}: 系統管理者服務等級(A／AUA／AS)只在 new／body 放行(內容正確), 其餘一律拒(固定鍵)、不回資料`, async function() {
                let fails = []
                for (let c of CALLERS) {
                    let { hdr, input } = sendOf(func, c, proto)
                    let r = await rawRpc(func, input, hdr)
                    let got = outcomeOf(func, r)
                    let ex = expectOf(func, c, proto)
                    table.push(`${func}|${c.k}|${proto}|${got}`)
                    let okCell = false
                    if (ex.kind === 'allow') {
                        okCell = got === 'allow'
                    }
                    else if (ex.kind === 'gate') {
                        okCell = got === 'gate'
                    }
                    else {
                        okCell = got === `body:${ex.msg}`
                    }
                    if (!okCell) {
                        fails.push(`${c.k}: 預期 ${ex.kind}${ex.msg ? `(${ex.msg})` : ''}, 實得 ${got}`)
                    }
                    if (ex.kind !== 'allow') {
                        for (let s of LEAK) {
                            if (r.raw.includes(s)) {
                                fails.push(`${c.k}: 被拒回應含 ${s}`)
                            }
                        }
                    }
                    cells++
                }
                A.deepStrictEqual(fails, [], `${func}/${proto} 有 ${fails.length} 格不符`)
            })
        }
    }

    it('標頭缺失／Basic 方案／空 Bearer／雙空白: 三個系統函數(本體帶有效系統管理者 token)一律於連線閘被拒', async function() {
        for (let func of FUNCS) {
            for (let hdrRaw of [null, 'Basic sys', 'Bearer', 'Bearer  sys']) {
                let input = (func === '[sys:polling]') ? { clientId: `sf-hdr-${++seq}`, __sysToken__: TOKEN_ADMIN } : { __sysInputArgs__: [], __sysToken__: TOKEN_ADMIN }
                let headers = { 'Content-Type': 'application/octet-stream' }
                if (hdrRaw !== null) {
                    headers['Authorization'] = hdrRaw
                }
                let res = await fetch(`${apiBaseUrl}/api/main`, { method: 'POST', headers, body: Buffer.from(obj2u8arr({ func, input })) })
                let o = u8arr2obj(new Uint8Array(await res.arrayBuffer()))
                A.equal(o && o.error, 'permission denied', `${func} 標頭 ${hdrRaw}: ${JSON.stringify(o).slice(0, 200)}`)
                cells++
            }
        }
    })

    //邊界(外審 sol F1): 標頭為有效系統管理者; 以下輸入皆不得放行
    it('邊界: 本體 __sysToken__ 非字串(null、數字、布林、物件、陣列、含有效 token 之陣列)→ 經 cstr 轉為空字串或數字字串, 三個系統函數一律不放行', async function() {
        let toks = [null, 123, true, {}, [], ['sys'], ['nope-invalid']]
        let fails = []
        for (let func of FUNCS) {
            for (let tok of toks) {
                let input = (func === '[sys:polling]') ? { clientId: `sf-ty-${++seq}`, __sysToken__: tok } : { __sysInputArgs__: [], __sysToken__: tok }
                let r = await rawRpc(func, input, TOKEN_ADMIN)
                let got = outcomeOf(func, r)
                let want = (func === '[sys:polling]') ? `body:${POLL_DENIED}` : 'body:cannotFindUserFromToken'
                if (got !== want) {
                    fails.push(`${func} token=${JSON.stringify(tok)}: 預期 ${want}, 實得 ${got}`)
                }
                for (let s of LEAK) {
                    if (r.raw.includes(s)) {
                        fails.push(`${func} token=${JSON.stringify(tok)}: 被拒回應含 ${s}`)
                    }
                }
                cells++
            }
        }
        A.deepStrictEqual(fails, [])
    })

    it('邊界: 輪詢 clientId 缺失／空字串／null／數字／物件／陣列 → 於身分反查之前即拒(invalid clientId), 且不影響其後有效輪詢', async function() {
        let ids = [undefined, '', null, 123, {}, [], ['c']]
        //本體 token 取有效與無效兩種: 無效 token 時若檢查次序被調換(先反查), 回應會變成 permission denied 而非 invalid clientId(外審 sol 第二輪 G1)
        for (let tok of [TOKEN_ADMIN, 'nope-invalid']) {
            for (let id of ids) {
                let input = { __sysToken__: tok }
                if (id !== undefined) {
                    input.clientId = id
                }
                let r = await rawRpc('[sys:polling]', input, TOKEN_ADMIN)
                A.equal(isAllowed(r.obj), false, `clientId=${JSON.stringify(id)} token=${tok} 不得放行: ${r.raw.slice(0, 120)}`)
                A.ok(String(r.obj && r.obj.error).includes('invalid clientId'), `clientId=${JSON.stringify(id)} token=${tok} 應回 invalid clientId(先於身分反查), 實得 ${JSON.stringify(r.obj).slice(0, 160)}`)
                cells++
            }
        }
        let ok = await rawRpc('[sys:polling]', { clientId: `sf-id-${++seq}`, __sysToken__: TOKEN_ADMIN }, TOKEN_ADMIN)
        A.equal(outcomeOf('[sys:polling]', ok), 'allow')
    })

    it('邊界: 函數輸入封裝缺 __sysInputArgs__ 或型別錯 → invalid input(先於身分反查), 整個 input 為 null／字串／數字／陣列亦不放行', async function() {
        for (let func of ['[sys:getFuncList]', '[sys:getTableTags]']) {
            //本體 token 取有效與無效兩種: 檢查次序被調換(先反查)時, 無效 token 會回 cannotFindUserFromToken 而非 invalid input(外審 sol 第二輪 G1)
            for (let tok of [TOKEN_ADMIN, 'nope-invalid']) {
                for (let bad of [{ __sysToken__: tok }, { __sysInputArgs__: 'x', __sysToken__: tok }, { __sysInputArgs__: null, __sysToken__: tok }, { __sysInputArgs__: {}, __sysToken__: tok }]) {
                    let r = await rawRpc(func, bad, TOKEN_ADMIN)
                    A.equal(outcomeOf(func, r), 'body:invalid input', `${func} ${JSON.stringify(bad)}`)
                    cells++
                }
            }
            for (let whole of [null, 'sys', 5, [], [TOKEN_ADMIN]]) {
                let r = await rawRpc(func, whole, TOKEN_ADMIN)
                A.equal(isAllowed(r.obj), false, `${func} input=${JSON.stringify(whole)} 不得放行: ${r.raw.slice(0, 120)}`)
                for (let s of LEAK) {
                    A.ok(!r.raw.includes(s), `${func} input=${JSON.stringify(whole)}: 被拒回應含 ${s}`)
                }
                cells++
            }
        }
    })

    it('邊界: 函數名大小寫／前後空白／缺方括號／未知 [sys:xxx](兩種輸入形狀)→ 一律不放行、不回資料', async function() {
        let names = ['[sys:Polling]', '[sys:polling] ', ' [sys:getFuncList]', '[sys:getfunclist]', '[SYS:getFuncList]', 'sys:getFuncList', '[sys:unknown]', '[sys:getTableTags ]']
        for (let name of names) {
            for (let input of [{ __sysInputArgs__: [], __sysToken__: TOKEN_ADMIN }, { clientId: `sf-nm-${++seq}`, __sysToken__: TOKEN_ADMIN }]) {
                let r = await rawRpc(name, input, TOKEN_ADMIN)
                A.equal(isAllowed(r.obj), false, `${JSON.stringify(name)} ${Object.keys(input).join(',')} 不得放行: ${r.raw.slice(0, 120)}`)
                for (let s of LEAK) {
                    A.ok(!r.raw.includes(s), `${JSON.stringify(name)}: 被拒回應含 ${s}`)
                }
                cells++
            }
        }
    })

    //clientId 與身分綁定(外審 sol F2): 兩個「有效但身分不同」的呼叫者之間的轉換, 才分得出所有權檢查是否存在
    it('輪詢之 clientId 與身分綁定: 系統管理者(userId id-for-admin)綁定後, 系統服務用途(app:key-sys)重用同一 clientId 被拒但其函數呼叫照常放行; 同 userId 之 AUA token 續輪詢放行; 舊協定重用亦被拒', async function() {
        let id = `sf-bind-${++seq}`
        let poll = (tok, withKey = true) => rawRpc('[sys:polling]', withKey ? { clientId: id, __sysToken__: tok } : { clientId: id }, tok)
        A.equal(outcomeOf('[sys:polling]', await poll(TOKEN_ADMIN)), 'allow', '首次輪詢綁定 id-for-admin')
        A.equal(outcomeOf('[sys:polling]', await poll(TOKEN_AS)), `body:${POLL_DENIED}`, '另一個有效 userId(app:key-sys)重用同 clientId 應被拒')
        let tags = await rawRpc('[sys:getTableTags]', { __sysInputArgs__: [], __sysToken__: TOKEN_AS }, TOKEN_AS)
        A.equal(outcomeOf('[sys:getTableTags]', tags), 'allow', '函數呼叫無 clientId 綁定, AS token 照常放行')
        A.equal(outcomeOf('[sys:polling]', await poll(TOKEN_AU_ADMIN)), 'allow', 'AUA 反查為同一 userId(id-for-admin), 續輪詢放行')
        A.equal(outcomeOf('[sys:polling]', await poll(TOKEN_ADMIN)), 'allow', '原 token 續輪詢仍放行')
        A.equal(outcomeOf('[sys:polling]', await poll(TOKEN_ADMIN, false)), `body:${POLL_DENIED}`, '舊協定(缺 token 鍵)重用已綁定之 clientId 被拒')
        //反向: 先由 AS 綁定, 系統管理者重用被拒
        let id2 = `sf-bind-${++seq}`
        let poll2 = (tok) => rawRpc('[sys:polling]', { clientId: id2, __sysToken__: tok }, tok)
        A.equal(outcomeOf('[sys:polling]', await poll2(TOKEN_AS)), 'allow')
        A.equal(outcomeOf('[sys:polling]', await poll2(TOKEN_ADMIN)), `body:${POLL_DENIED}`)
        A.equal(outcomeOf('[sys:polling]', await poll2(TOKEN_AS)), 'allow', '原身分續輪詢仍放行')
        cells += 9
    })

    it('被拒者零副作用: 舊協定輪詢被拒後, 該 clientId 不綁定空身分(之後以新協定系統管理者身分首次輪詢仍可綁定)', async function() {
        let id = `sf-nobind-${++seq}`
        let r1 = await rawRpc('[sys:polling]', { clientId: id }, TOKEN_ADMIN)
        A.equal(outcomeOf('[sys:polling]', r1), `body:${POLL_DENIED}`)
        let r2 = await rawRpc('[sys:polling]', { clientId: id, __sysToken__: TOKEN_ADMIN }, TOKEN_ADMIN)
        A.equal(outcomeOf('[sys:polling]', r2), 'allow', '被拒之輪詢不得綁定空身分, 否則此處會因 clientId 歸屬他人而被拒')
        cells += 2
    })

    //真前端元件(WServHapiClient, 與 src/main.js 同款選項: useWaitToken true)
    describe('真前端元件(w-serv-hapi 1.1.8 之 WServHapiClient, 與 src/main.js 同款 useWaitToken: true)', function() {

        let bootClient = (getToken) => {
            let st = { inst: null, errs: [], f: null, ready: null, timer: null, tables: {} }
            st.ready = new Promise((resolve, reject) => {
                let timer = setTimeout(() => reject(new Error('client 開機逾時 20s errs=' + JSON.stringify(st.errs).slice(0, 300))), 20000)
                st.timer = timer
                st.inst = WServHapiClient({
                    useShowLog: false,
                    url: apiBaseUrl,
                    useWaitToken: true,
                    apiName: 'api',
                    tokenType: 'Bearer',
                    getToken,
                    getServerMethods: (f) => {
                        clearTimeout(timer)
                        st.f = f
                        resolve(f)
                    },
                    recvData: (r) => {
                        st.tables[r.tableName] = r.data
                    },
                })
                st.inst.on('error', (err) => {
                    st.errs.push(err)
                })
            })
            st.ready.catch(() => {}) //立即附加 rejection 觀察者(原 promise 仍供成功案 await): 等待期限內的延遲不得另產生未處理的 rejection(外審 sol 第二輪 G2)
            st.stop = () => {
                clearTimeout(st.timer) //開機逾時計時器(未開機者, 如一般使用者案)隨停止清除, 免其後才 reject
                try {
                    st.inst.clearBroadcast()
                    st.inst.clearSync()
                }
                catch (err) { /* 停止失敗不得遮蔽測試結果 */ }
            }
            return st
        }

        //waitUntil: 有截止期限的條件等待(免固定 sleep 造成假綠或偶發失敗)
        let waitUntil = async (pred, ms, label) => {
            let tEnd = Date.now() + ms
            while (Date.now() < tEnd) {
                if (await pred()) {
                    return
                }
                await sleep(100)
            }
            throw new Error(`${label}: ${ms} ms 內條件未成立`)
        }

        //gateLines: 自標記起之連線閘紀錄(markSrLog 於動作前取、動作後再取一次以確保窗口內各行已落檔)
        let gateLines = (mark) => readSrLogSince(mark).filter((l) => l.event === 'verifyConn' || l.event === 'verifyConn-error' || l.event === 'getUserIdByToken-error')

        it('登入前(getToken 回空字串)不連線: 等待期間後端零連線閘紀錄; 取得系統管理者 token 後才開機、四表同步完成, 其後輪詢至少兩輪且無 error 事件', async function() {
            this.timeout(120000)
            let tok = ''
            let mark0 = await markSrLog()
            let st = bootClient(() => tok)
            try {
                await sleep(3500) //等待期間(useWaitToken 每 100 ms 檢查 getToken, 無 token 不建立資料同步)
                await markSrLog() //哨兵: 其前各行已落檔
                A.deepStrictEqual(gateLines(mark0).map((l) => `${l.event}:${l.apiType || ''}`), [], '登入前不得有任何連線閘／執行身分紀錄(前端未輪詢、未取函數清單)')
                A.equal(st.f, null, '登入前不得開機')
                A.equal(st.errs.length, 0, '登入前不得有 error 事件')
                tok = TOKEN_ADMIN //登入完成
                await st.ready
                let wi = await st.f.getWebInfor()
                A.ok(wi && typeof wi === 'object', 'getWebInfor 可用')
                await waitUntil(() => ['users', 'grups', 'pemis', 'targets'].every((k) => Array.isArray(st.tables[k])), 20000, '四表同步(recvData)')
                //輪詢輪數: 開機流程結束後, 在截止期限內等到連線閘至少再收到 2 個 main 請求(預設每 2 秒一輪輪詢, 此時別無其他呼叫; 輪詢較慢時下一個 tick 會被略過, 故以有截止期限之條件等待取代固定窗口, 外審 sol 第二輪 G3);
                //  輪詢「成功」另由: error 事件為空、期間無任何拒絕紀錄(verifyConn-error／getUserIdByToken-error)、矩陣 new 協定各格(輪詢回陣列)與真瀏覽器 browser-probe(6 輪成功)佐證
                let mA = await markSrLog()
                await waitUntil(async () => {
                    await markSrLog() //哨兵: 其前各行已落檔
                    return gateLines(mA).filter((l) => l.event === 'verifyConn' && l.apiType === 'main' && l.ok === true).length >= 2
                }, 30000, '輪詢至少 2 輪通過連線閘')
                A.deepStrictEqual(gateLines(mA).filter((l) => l.event !== 'verifyConn').map((l) => l.event), [], '期間不得有連線閘或執行身分拒絕紀錄')
                A.deepStrictEqual(st.errs, [], `error 事件須為空(輪詢帶 token 通過、[sys:getTableTags] 通過), 實得 ${JSON.stringify(st.errs).slice(0, 300)}`)
                cells += 6
            }
            finally {
                st.stop()
            }
        })

        it('一般使用者 token(通過部署方、非系統管理者)交給前端元件: 不開機、不取得資料——error 事件皆為連線閘之 permission denied', async function() {
            this.timeout(120000)
            let st = bootClient(() => TOKEN_MEMBER)
            try {
                await waitUntil(() => st.errs.length >= 2, 30000, '一般使用者之 error 事件(輪詢與函數清單各被拒)')
                A.equal(st.f, null, '一般使用者不得開機取得函數表')
                A.deepStrictEqual(Object.keys(st.tables), [], '一般使用者不得收到任何同步表資料')
                for (let e of st.errs) {
                    A.ok(JSON.stringify(e).includes('permission denied'), `error 事件應為 permission denied, 實得 ${JSON.stringify(e).slice(0, 200)}`)
                }
                cells += 3
            }
            finally {
                st.stop()
            }
        })
    })
})
