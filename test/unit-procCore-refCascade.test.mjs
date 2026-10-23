//引用連帶(改名級聯與刪除連帶清理)之伺服端寫入單元測試(規則帳本 R-REF-CASCADE-01、R-WRITE-LOCK-02; ADR-036; run06)
//
//述語(規格句, 見規則帳本 R-REF-CASCADE-01 與 ADR-036; 期望由規格推導, 不照實作現況):
//  P1 改名級聯: grups／pemis 同 id 異名 → 引用它之授權字串(users.cgrups／grups.cpemis)於同一次寫入內連帶改名(含停用項、物件與陣列形式; 互換／鏈式同時套用), 各使用者之最終授權(真 getUserRules)與改名前逐位相等;
//     未命中者字串逐字不動; 無改名且無刪除之寫入不得對引用端表寫入(cnt.save／insert／del／delAll 皆不增); opt.cascadeRename:false 只關改名級聯(刪除連帶清理不受影響);
//     引用端被改寫之列以操作者／新時間記為更新者, 其餘欄位(email、from 等)不變, 未命中之列不寫.
//  P2 刪除連帶清理: grups／pemis／targets 刪列(舊 id 不在新表)→ users.cgrups／grups.cpemis／pemis.crules 內該名稱之項目(不論停用／物件／陣列)被移除; 清理後之授權＝把該項目自原字串移除後之授權;
//     刪除後以同名新增(新 id)者不繼承引用; 歷史同名只刪其一不清理; 其他引用字串逐字不動.
//  P3 三種拒絕(renameCascadeDupGroup／renameCascadeNameInUse／renameCascadeConflict)與引用端改寫列含標記(htmlMarkupNotAllowed): 整次拒存, 四表逐位元不變、cnt 不增, srLog 記 updateTabItems-refCascade-error 且不含個資值.
//  P4 失敗回復(引用端先寫、主體後寫; 任一步例外 → 以寫入前原值補償還原引用端, 逐位元含 userIdUpdate／timeUpdate; 補償亦失敗 → saveCascadePartial＋srLog refCascade-restore-error;
//     互換／鏈式／批內新增三形狀於補償後重送同一份資料須成功且結果正確; 主體 del → insert → save 之部分寫入為 ADR-013 既有限制, 補償不還原主體, 測試如實釘住); 成功時 srLog refCascade-done 計數正確且不含引用端 id 與個資.
//  P5 鎖(R-WRITE-LOCK-02; perm-run01 起鎖管理器為 w-serv-orm 實例之 withTabLocks／guardWrite, R-LOCK-CORE-01): 單一取鎖函數 keyCheck.withTabLocks(lockTabs, …), 階層 targets < pemis < grups < users 與輸入順序無關、去重、held 守門、失敗釋放、相反次序不死結; 分段取鎖(無改名／刪除不取引用端鎖; 有才取); 並行 updateGrups ∥ updateUsers ∥ updatePemis ∥ updateTargets 多輪隨機交錯不死結且終態等價於某一依序執行;
//     站點不變式: procCore.mjs 與 WWebPerm.mjs 不得自建鎖(pmKeyMutex／kmx( 皆不得出現; 取表鎖只經 keyCheck.withTabLocks 或 w-serv-orm 的 guardWrite／withTabLocks), 取引用端表鎖處須帶 held 參數 [keyTable].
//  P6 updateUsers: users 為引用鏈末端(引用端 = 無), 整表寫入(含 pickKeysOnly)不觸發任何級聯、不取其他表鎖、不寫其他表.
//
//受測: server/procCore.mjs 之 updateGrups／updatePemis／updateTargets／updateUsers(kpFunExt 之實際入口, 內走 updateTabItems)、server/cascadeWrite.mjs、server/keyCheck.mjs 之 withTabLocks.
//注入接縫: proc(woItems, procOrm, { srLog, withTabLocks, guardWrite, lockSave, cascadeRename })之 woItems(test/tools/unitOrm.mjs 之 mkTable 替身; 故障以包裝其方法注入: 第 k 次呼叫失敗), procOrm／withTabLocks／guardWrite 為真(mkCore: 真 WServOrm 包住替身表), 授權比對用真 getUserRules;
//  需記錄取鎖軌跡者以 traceLock 包裝真鎖(記錄後仍呼叫真的).
//跑法: npx mocha test/unit-procCore-refCascade.test.mjs --timeout 120000
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import cloneDeep from 'lodash-es/cloneDeep.js'
import JSON5 from 'json5'
import cacheSt from 'wsemi/src/cacheSt.mjs'
import clearXSS from 'wsemi/src/clearXSS.mjs'
import ds from '../src/schema/index.mjs'
import proc from '../server/procCore.mjs'
import createLockSave from '../server/lockSave.mjs'
import { withTabLocks } from '../server/keyCheck.mjs'
import { checkCascadePlan, writeWithCascade, buildSyncRowsNew } from '../server/cascadeWrite.mjs'
import planRefChanges, { fillIdlessIds } from '../src/js/refCascade.mjs'
import { getUserRules } from '../src/plugins/mShare.mjs'
import { mkTable, mkCore, mkSrLog } from './tools/unitOrm.mjs'
import { stripLineComment, takeParen } from './tools/srcScan.mjs'


const projRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

const PH = '{新增}' //前端新列之稽核欄位佔位字
const T0 = '2026-01-01T00:00:00.000+08:00'
const AUDIT = { userId: 'id-seed', timeCreate: T0, userIdUpdate: 'id-seed', timeUpdate: T0 }
const TABLE_KEYS = ['users', 'targets', 'grups', 'pemis']
const FN = { users: 'updateUsers', targets: 'updateTargets', grups: 'updateGrups', pemis: 'updatePemis' }
const OKR = { ok: true, v: 'saveTabItemsSuccess' }

const T1 = 'sysA/p1/b1'
const T2 = 'sysA/p1/b2'
const T3 = 'sysA/p2/b1'

let J = (o) => JSON.stringify(o)
let OR = { mode: 'OR', isActive: 'y' }
let AND = { mode: 'AND', isActive: 'y' }
let OR_OFF = { mode: 'OR', isActive: 'n' }
let ERR = (k) => ({ ok: false, v: k })


// =====================================================================
// 種子與輔助
// =====================================================================

//UNRELATED: 手寫 JSON5(註解、單引號、尾逗號、尾註解)且只含與測試無關之名稱 GX: 命中任何改名／刪除時皆不得被重新編碼(逐字不動)
const UNRELATED = `{ /* 手寫註解 */ 'GX': { mode: 'OR', isActive: 'y' }, } // tail`

//seedRows: 四表種子(稽核欄位為真值; 欄位順序同 schema, 使「未改之列」經 ltdtmapping 後與庫內列 JSON 相同而不被當成 diff)
//  targets: T1／T2／T3
//  pemis:   P1{T1 y, T2 n}／P2{T2 y, T3 y}／P3{T3 y}
//  grups:   G1{P1 OR, P2 OR}／G2{P2 OR, P3 AND}／G3(陣列形式){P1 OR, P3 OR 停用}
//  users:   u1{G1 OR, G2 AND}／u2(外部 appX, 陣列形式){G2 OR, G3 OR}／u3{G3 OR, G1 停用}／u4{}／u5{ 手寫 JSON5: 註解、單引號、懸空名 GX }
//  授權(手算, RW-100 釘住): u1 = G1(OR: T1 y, T2 y, T3 y) ∩ G2(AND: T2 n, T3 y) → T1 n, T2 n, T3 y; u2 = G2 ∪ G3 → T1 y, T2 n, T3 y; u3 = G3 → T1 y, T2 n, T3 n; u4／u5 全 n; 各使用者授權相異, 使「改名前後授權相等」非空洞
function seedRows() {
    let mk = (table, o) => ({ ...ds[table].funNew(), ...AUDIT, ...o })
    return {
        targets: [
            mk('targets', { id: T1, order: 1, description: 'd-t1', from: '' }),
            mk('targets', { id: T2, order: 2, description: 'd-t2', from: '' }),
            mk('targets', { id: T3, order: 3, description: 'd-t3', from: '' }),
        ],
        pemis: [
            mk('pemis', { id: 'id-p1', order: 1, name: 'P1', description: 'd-p1', from: '', crules: J({ [T1]: 'y', [T2]: 'n' }) }),
            mk('pemis', { id: 'id-p2', order: 2, name: 'P2', description: 'd-p2', from: '', crules: J({ [T2]: 'y', [T3]: 'y' }) }),
            mk('pemis', { id: 'id-p3', order: 3, name: 'P3', description: 'd-p3', from: '', crules: J({ [T3]: 'y' }) }),
        ],
        grups: [
            mk('grups', { id: 'id-g1', order: 1, name: 'G1', description: 'd-g1', from: '', cpemis: J({ P1: OR, P2: OR }) }),
            mk('grups', { id: 'id-g2', order: 2, name: 'G2', description: 'd-g2', from: '', cpemis: J({ P2: OR, P3: AND }) }),
            mk('grups', { id: 'id-g3', order: 3, name: 'G3', description: 'd-g3', from: '', cpemis: J([{ name: 'P1', mode: 'OR', isActive: 'y' }, { name: 'P3', mode: 'OR', isActive: 'n' }]) }),
        ],
        users: [
            mk('users', { id: 'id-u1', order: 1, name: 'pii-name-u1', email: 'pii-u1@example.com', description: 'd-u1', from: '', cgrups: J({ G1: OR, G2: AND }), isAdmin: 'n', isActive: 'y' }),
            mk('users', { id: 'id-u2', order: 2, name: 'pii-name-u2', email: 'pii-u2@example.com', description: 'd-u2', from: 'appX', cgrups: J([{ name: 'G2', mode: 'OR', isActive: 'y' }, { name: 'G3', mode: 'OR', isActive: 'y' }]), isAdmin: 'n', isActive: 'y' }),
            mk('users', { id: 'id-u3', order: 3, name: 'pii-name-u3', email: 'pii-u3@example.com', description: 'd-u3', from: '', cgrups: J({ G3: OR, G1: OR_OFF }), isAdmin: 'n', isActive: 'y' }),
            mk('users', { id: 'id-u4', order: 4, name: 'pii-name-u4', email: 'pii-u4@example.com', description: 'd-u4', from: '', cgrups: '{}', isAdmin: 'n', isActive: 'y' }),
            mk('users', { id: 'id-u5', order: 5, name: 'pii-name-u5', email: 'pii-u5@example.com', description: 'd-u5', from: '', cgrups: UNRELATED, isAdmin: 'n', isActive: 'y' }),
        ],
    }
}

//addUsers: 於種子 users 後追加(order 接續)
let addUsers = (seed, ...list) => {
    list.forEach((o, k) => {
        seed.users.push({ ...ds.users.funNew(), ...AUDIT, id: `id-x${k}`, order: seed.users.length + 1, name: `pii-name-x${k}`, email: `pii-x${k}@example.com`, description: `d-x${k}`, from: '', cgrups: '{}', isAdmin: 'n', isActive: 'y', ...o })
    })
    return seed
}
let addRows = (seed, table, ...list) => {
    list.forEach((o, k) => {
        seed[table].push({ ...ds[table].funNew(), ...AUDIT, order: seed[table].length + 1, description: `d-${table}-x${k}`, from: '', ...o })
    })
    return seed
}


//traceLock: 取鎖軌跡記錄器(perm-run01: 原注入假 kmx 記錄 `acq <tabWriteKey>`／`rel <tabWriteKey>`, 改包裝真鎖——記錄後仍呼叫真的, 互斥照常):
//  wrap(core) 回 { withTabLocks, guardWrite } 供展開進 proc 之選項; 記錄 `acq <表名>`／`rel <表名>`(同一次呼叫內之多表依真鎖之碼元序取、反序放).
//  兩條路徑都須包: procCore 本表鎖經 guardWrite(w-serv-orm 內部直接用其閉包內之 withTabLocks, 不經注入之 withTabLocks), 引用端表鎖經 keyCheck.withTabLocks(lockTabs, …) 呼叫注入之 withTabLocks
function traceLock() {
    let log = []
    let wrapRun = (tables, run) => {
        let ts = [...new Set(tables)].sort()
        ts.forEach((t) => log.push(`acq ${t}`))
        return run().finally(() => {
            ;[...ts].reverse().forEach((t) => log.push(`rel ${t}`))
        })
    }
    return {
        log,
        wrap: (core) => ({
            withTabLocks: (tableNames, fn) => wrapRun(tableNames, () => core.withTabLocks(tableNames, fn)),
            guardWrite: (p) => wrapRun(p.tables, () => core.guardWrite(p)),
        }),
    }
}

//createEnv: 每案一組全新之資料表替身、真鎖(mkCore: 真 WServOrm 包住替身表之 procOrm／withTabLocks／guardWrite)、占位與 procCore;
//  opt.lockOf(core) 回 { withTabLocks, guardWrite } 時改注入之(供 traceLock.wrap 記錄取鎖軌跡; perm-run01: 原 opt.proc.kmx 假鎖注入改此)
let envs = []
function createEnv(opt = {}) {
    let seed = opt.seed || seedRows()
    let woItems = {}
    for (let k of TABLE_KEYS) {
        woItems[k] = mkTable(seed[k])
    }
    let { srLog, logs } = mkSrLog()
    let cst = cacheSt()
    let core = mkCore(ds, woItems) //perm-run01: 原 mkProcOrm(ds, woItems)＋kmx: pmKeyMutex() 改 mkCore
    let lock = opt.lockOf ? opt.lockOf(core) : core.lock
    let pc = proc(woItems, core.procOrm, { srLog, ...lock, lockSave: createLockSave(cst), ...(opt.proc || {}) })
    let env = { seed, woItems, logs, cst, core, pc }
    envs.push(env)
    return env
}
let disposeEnvs = () => {
    envs.forEach((e) => e.cst.clear()) //停止 cacheSt 之 TTL 偵測 timer, 避免 mocha 不結束
    envs = []
}

let sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let flush = async (n = 20) => {
    for (let i = 0; i < n; i++) {
        await new Promise((resolve) => setImmediate(resolve))
    }
}
function withTimeout(p, ms, label) {
    let t = null
    let to = new Promise((resolve, reject) => {
        t = setTimeout(() => reject(new Error(`TIMEOUT(${label}) ${ms}ms: 疑似死結`)), ms)
    })
    return Promise.race([p, to]).finally(() => clearTimeout(t))
}

//noIdRow: 去掉主鍵 id(模擬 API 直打缺 id 之列)
let noIdRow = (r) => {
    let { id, ...rest } = r
    return rest
}
let rowsOf = async (woItems, table) => (await woItems[table].select()).sort((a, b) => a.order - b.order).map((v) => cloneDeep(v))
let edit = (rows, id, patch) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r))
let drop = (rows, ...ids) => rows.filter((r) => !ids.includes(r.id))

//newRow: 模擬清單頁 addItem 之新列(前端 funNew 產 id、稽核欄位為佔位字); isNew 為 true 時帶 transient _isNew(重送會被 saveNewRowExists 擋, ADR-025), 需「同一份資料重送」之案例用 false
function newRow(table, name, isNew = false, o = {}) {
    let r = ds[table].funNew()
    r.userId = PH
    r.timeCreate = PH
    r.userIdUpdate = PH
    r.timeUpdate = PH
    r.from = ''
    r.description = ''
    if (table === 'targets') {
        r.id = name
    }
    else if (table === 'users') {
        r.name = name
        r.email = `new-${name}@example.com`
        r.cgrups = '{}'
    }
    else {
        r.name = name
        r[table === 'grups' ? 'cpemis' : 'crules'] = '{}'
    }
    if (isNew) {
        r._isNew = true
    }
    return { ...r, ...o }
}

//run: 呼叫 kpFunExt 入口, 回 { ok, v }
let run = async (pc, table, rows, opt, userId = 'id-admin') => {
    try {
        return { ok: true, v: await pc[FN[table]](userId, rows, opt) }
    }
    catch (err) {
        return { ok: false, v: err }
    }
}

let writes = (t) => t.cnt.insert + t.cnt.save + t.cnt.del + t.cnt.delAll
let writesAll = (w) => TABLE_KEYS.reduce((a, k) => a + writes(w[k]), 0)
let snapAll = (w) => JSON.stringify(TABLE_KEYS.map((k) => w[k].snapshot()))
let zeroCnt = (t) => ({ insert: 0, save: 0, del: 0, delAll: 0 })
let cntOf = (t) => ({ ...t.cnt })

//spyTable: 記錄寫入呼叫(方法與各筆 id)
function spyTable(t) {
    let calls = []
    for (let m of ['insert', 'save', 'del', 'delAll']) {
        let f = t[m]
        t[m] = async (data, option) => {
            calls.push({ m, ids: m === 'delAll' ? [] : (Array.isArray(data) ? data : [data]).map((v) => (v ? v.id : undefined)), option })
            return f(data, option)
        }
    }
    t.calls = calls
    return calls
}

//injectFault: 包裝資料表替身之方法, 第 k 次呼叫(1 起算, 計入包裝後所有呼叫)依 spec 失敗; disarm 後恢復原行為(供「故障解除後重送」)
//  spec.on: 失敗之呼叫序數陣列; spec.mode: 'reject'(整批 reject, 不寫入) | 'ok0'(逐筆 ok:0; 其餘各筆照常寫入=部分寫入, 僅 save／del); spec.ids: ok0 時失敗之主鍵(預設全部)
function injectFault(t, method, spec) {
    let orig = t[method]
    let ctl = {
        n: 0,
        hit: 0,
        armed: true,
        calls: [],
        disarm: () => {
            ctl.armed = false
        },
    }
    t[method] = async (data, option) => {
        ctl.n++
        let ds0 = Array.isArray(data) ? data : [data]
        ctl.calls.push({ k: ctl.n, ids: ds0.map((v) => (v ? v.id : undefined)), option })
        if (!ctl.armed || !spec.on.includes(ctl.n)) {
            return orig(data, option)
        }
        ctl.hit++
        if (spec.mode === 'reject') {
            return Promise.reject(`simulated ${method} reject #${ctl.n}`)
        }
        let failIds = new Set(spec.ids || ds0.map((v) => v.id))
        let okItems = ds0.filter((v) => !failIds.has(v.id))
        let rsOk = okItems.length > 0 ? await orig(okItems, option) : []
        let it = 0
        return ds0.map((v) => (failIds.has(v.id) ? { n: 1, nInserted: 0, nModified: 0, nDeleted: 0, ok: 0, err: `simulated ${method} fail #${ctl.n}` } : rsOk[it++]))
    }
    return ctl
}

//authMap: 逐使用者之授權(真 getUserRules; 以現存之四表), { 使用者 id: { 標的 id: isActive } }
async function authMap(woItems, over = {}) {
    let [users, targets, grups, pemis] = await Promise.all(TABLE_KEYS.map((k) => woItems[k].select())) //次序同 TABLE_KEYS
    let kp = {}
    for (let u of (over.users || users)) {
        let { rules } = getUserRules(u, over.grups || grups, over.pemis || pemis, targets)
        let o = {}
        rules.forEach((r) => {
            o[r.name] = r.isActive
        })
        kp[u.id] = o
    }
    return kp
}

//oracleRewrite: 獨立於 src/js/refCascade.mjs 之預期改寫(規格句: 同時套用改名與刪除; 物件仍物件、陣列仍陣列; 其餘項目原樣), 回解析後之結構
let hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k)
function oracleRewrite(str, { rename = {}, del = [] }) {
    let kp = JSON5.parse(str)
    if (Array.isArray(kp)) {
        return kp
            .filter((el) => !del.includes(el.name))
            .map((el) => (hasOwn(rename, el.name) ? { ...el, name: rename[el.name] } : el))
    }
    let out = {}
    for (let k of Object.keys(kp)) {
        if (del.includes(k)) {
            continue
        }
        out[hasOwn(rename, k) ? rename[k] : k] = kp[k]
    }
    return out
}

let parseOf = (woItems, table, id, field) => JSON5.parse(woItems[table].get(id)[field])

//PII: 種子使用者之姓名與 email(個資); srLog 不得含
function assertNoPii(logs, seed) {
    let s = JSON.stringify(logs)
    for (let u of seed.users) {
        assert.strict.ok(!s.includes(u.email), `srLog 不得含個資 email: ${u.email}`)
        assert.strict.ok(!s.includes(u.name), `srLog 不得含個資 name: ${u.name}`)
    }
}

//WEIRD_IDS: 含 ']'／'[' 或換行之引用端(使用者)id; ORM 逐筆失敗訊息為 `failed to save data: id[<id>]`, 通則正則 /id\[[^\]]*\]/ 會在 id 內第一個 ']' 結束而殘留後半段(個資)
//secrets: 遮罩後 srLog 內不得出現之片段(id 內可能為 email 等個資之部分)
const WEIRD_IDS = [
    { id: 'prefix]private@example.com', secrets: ['private@example.com', 'prefix]'] },
    { id: 'a]b]c', secrets: ['a]b', 'b]c'] },
    { id: 'line1\nsecret-line2', secrets: ['secret-line2'] },
    { id: '[lead-private@example.com', secrets: ['private@example.com'] },
    { id: '[x]private@example.com', secrets: ['private@example.com', 'x]p'] },
]

//viewOf: 四表之正規化視圖(去時間欄位: timeUpdate／timeCreate 為墻鐘), 供「終態等價」比對
async function viewOf(woItems) {
    let o = {}
    for (let k of TABLE_KEYS) {
        let rs = await woItems[k].select()
        o[k] = rs.map((r) => {
            let { timeUpdate, timeCreate, ...rest } = r
            return rest
        }).sort((a, b) => String(a.id).localeCompare(String(b.id)))
    }
    return JSON.stringify(o)
}

//expectRejectZero: 被拒(三種拒絕／htmlMarkupNotAllowed 等): 回指定錯誤鍵、四表逐位元不變、四表 cnt 不增、srLog 記 updateTabItems-refCascade-error(msg 為該鍵)且不含個資、無 refCascade-done
async function expectRejectZero(env, table, rows, key, opt) {
    let before = snapAll(env.woItems)
    let cnt0 = TABLE_KEYS.map((k) => cntOf(env.woItems[k]))
    let r = await run(env.pc, table, rows, opt)
    assert.strict.deepEqual(r, ERR(key))
    assert.strict.equal(snapAll(env.woItems), before, '四表須逐位元不變')
    assert.strict.deepEqual(TABLE_KEYS.map((k) => cntOf(env.woItems[k])), cnt0, '四表 cnt 不得增(零寫入)')
    let le = env.logs.find((l) => l.event === 'updateTabItems-refCascade-error')
    assert.strict.ok(le, 'srLog 應記 updateTabItems-refCascade-error')
    assert.strict.equal(le.level, 'error')
    assert.strict.equal(le.msg, key)
    assert.strict.equal(le.keyTable, table)
    assert.strict.ok(env.logs.some((l) => l.event === `${FN[table]}-error` && l.msg === key), `集中 errLog 應記 ${FN[table]}-error`)
    assert.strict.ok(!env.logs.some((l) => l.event === 'refCascade-done'), '被拒不得記 refCascade-done')
    assertNoPii(env.logs, env.seed)
    return r
}


describe('unit-procCore-refCascade (引用連帶: 改名級聯與刪除連帶清理之伺服端寫入, R-REF-CASCADE-01／R-WRITE-LOCK-02)', function() {

    this.timeout(120000)

    afterEach(function() {
        disposeEnvs()
    })


    // =====================================================================
    // 族 1: 改名級聯(RW-1xx)
    // =====================================================================
    describe('族 1 改名級聯', function() {

        it('RW-100 種子授權之手算錨點(防「授權不變」之比對空洞: 比對函數須真的以四表求值, 且各使用者授權相異)', async function() {
            let { woItems } = createEnv()
            let a0 = await authMap(woItems)
            assert.strict.deepEqual(a0['id-u1'], { [T1]: 'n', [T2]: 'n', [T3]: 'y' })
            assert.strict.deepEqual(a0['id-u2'], { [T1]: 'y', [T2]: 'n', [T3]: 'y' })
            assert.strict.deepEqual(a0['id-u3'], { [T1]: 'y', [T2]: 'n', [T3]: 'n' })
            assert.strict.deepEqual(a0['id-u4'], { [T1]: 'n', [T2]: 'n', [T3]: 'n' })
            assert.strict.deepEqual(a0['id-u5'], { [T1]: 'n', [T2]: 'n', [T3]: 'n' })
        })

        it('RW-101updateGrups 同 id 改名 G1→G1x → users.cgrups 物件形式連帶改名(含停用項), 其餘項目值原樣; 各使用者授權不變', async function() {
            let { woItems, pc } = createEnv()
            let a0 = await authMap(woItems)
            let rows = edit(await rowsOf(woItems, 'grups'), 'id-g1', { name: 'G1x' })
            assert.strict.deepEqual(await run(pc, 'grups', rows), OKR)
            assert.strict.equal(woItems.grups.get('id-g1').name, 'G1x', '主體已改名')
            assert.strict.deepEqual(parseOf(woItems, 'users', 'id-u1', 'cgrups'), { G1x: OR, G2: AND }) //P1: 命中項改名, 值(mode／isActive)原樣, 他項不動
            assert.strict.deepEqual(parseOf(woItems, 'users', 'id-u3', 'cgrups'), { G3: OR, G1x: OR_OFF }, '停用項亦隨改名') //P1: 含停用項
            assert.strict.deepEqual(await authMap(woItems), a0, 'P1: 改名前後各使用者授權逐位相等')
        })

        it('RW-102 陣列形式引用: 改名 G3→G3x → 仍為陣列, 命中元素之 name 改名、其餘元素與值原樣、元素順序不變', async function() {
            let { woItems, pc } = createEnv()
            let a0 = await authMap(woItems)
            let rows = edit(await rowsOf(woItems, 'grups'), 'id-g3', { name: 'G3x' })
            assert.strict.deepEqual(await run(pc, 'grups', rows), OKR)
            let u2 = parseOf(woItems, 'users', 'id-u2', 'cgrups')
            assert.strict.ok(Array.isArray(u2), '陣列形式不得互轉為物件')
            assert.strict.deepEqual(u2, [{ name: 'G2', mode: 'OR', isActive: 'y' }, { name: 'G3x', mode: 'OR', isActive: 'y' }])
            assert.strict.deepEqual(parseOf(woItems, 'users', 'id-u3', 'cgrups'), { G3x: OR, G1: OR_OFF })
            assert.strict.deepEqual(await authMap(woItems), a0)
        })

        it('RW-103 updatePemis 改名 P1→P1x → grups.cpemis(物件與陣列形式)連帶改名; users 不被寫入; 授權不變', async function() {
            let { woItems, pc } = createEnv()
            let a0 = await authMap(woItems)
            let rows = edit(await rowsOf(woItems, 'pemis'), 'id-p1', { name: 'P1x' })
            assert.strict.deepEqual(await run(pc, 'pemis', rows), OKR)
            assert.strict.deepEqual(parseOf(woItems, 'grups', 'id-g1', 'cpemis'), { P1x: OR, P2: OR })
            assert.strict.deepEqual(parseOf(woItems, 'grups', 'id-g3', 'cpemis'), [{ name: 'P1x', mode: 'OR', isActive: 'y' }, { name: 'P3', mode: 'OR', isActive: 'n' }])
            assert.strict.equal(woItems.grups.get('id-g2').cpemis, seedRows().grups[1].cpemis, '未命中之 g2 不動')
            assert.strict.equal(writes(woItems.users), 0, '無傳遞性: pemis 之引用端為 grups, users 不寫')
            assert.strict.equal(writes(woItems.targets), 0)
            assert.strict.deepEqual(await authMap(woItems), a0)
        })

        it('RW-104 互換 G1↔G2(同一次儲存)→ 引用同時套用(各項值隨實體走, 不逐一套用而互相覆蓋); 授權不變', async function() {
            let { woItems, pc } = createEnv()
            let a0 = await authMap(woItems)
            let rows = await rowsOf(woItems, 'grups')
            rows = edit(edit(rows, 'id-g1', { name: 'G2' }), 'id-g2', { name: 'G1' })
            assert.strict.deepEqual(await run(pc, 'grups', rows), OKR)
            assert.strict.deepEqual(parseOf(woItems, 'users', 'id-u1', 'cgrups'), { G2: OR, G1: AND }, 'OR 項(原指 g1)改為 G2, AND 項(原指 g2)改為 G1')
            assert.strict.deepEqual(parseOf(woItems, 'users', 'id-u2', 'cgrups'), [{ name: 'G1', mode: 'OR', isActive: 'y' }, { name: 'G3', mode: 'OR', isActive: 'y' }])
            assert.strict.deepEqual(parseOf(woItems, 'users', 'id-u3', 'cgrups'), { G3: OR, G2: OR_OFF })
            assert.strict.deepEqual(await authMap(woItems), a0, '互換後授權不得對調')
        })

        it('RW-105 互換 P1↔P2(權限; 引用端 grups)→ 同時套用; 授權不變', async function() {
            let { woItems, pc } = createEnv()
            let a0 = await authMap(woItems)
            let rows = await rowsOf(woItems, 'pemis')
            rows = edit(edit(rows, 'id-p1', { name: 'P2' }), 'id-p2', { name: 'P1' })
            assert.strict.deepEqual(await run(pc, 'pemis', rows), OKR)
            assert.strict.deepEqual(parseOf(woItems, 'grups', 'id-g1', 'cpemis'), { P2: OR, P1: OR })
            assert.strict.deepEqual(parseOf(woItems, 'grups', 'id-g2', 'cpemis'), { P1: OR, P3: AND })
            assert.strict.deepEqual(parseOf(woItems, 'grups', 'id-g3', 'cpemis'), [{ name: 'P2', mode: 'OR', isActive: 'y' }, { name: 'P3', mode: 'OR', isActive: 'n' }])
            assert.strict.deepEqual(await authMap(woItems), a0)
        })

        it('RW-106 鏈式 G1→G2 且 G2→G9(同一次儲存)→ 同時套用(不可把 G1 之引用連推成 G9); 授權不變', async function() {
            let { woItems, pc } = createEnv()
            let a0 = await authMap(woItems)
            let rows = await rowsOf(woItems, 'grups')
            rows = edit(edit(rows, 'id-g1', { name: 'G2' }), 'id-g2', { name: 'G9' })
            assert.strict.deepEqual(await run(pc, 'grups', rows), OKR)
            assert.strict.deepEqual(parseOf(woItems, 'users', 'id-u1', 'cgrups'), { G2: OR, G9: AND })
            assert.strict.deepEqual(parseOf(woItems, 'users', 'id-u2', 'cgrups'), [{ name: 'G9', mode: 'OR', isActive: 'y' }, { name: 'G3', mode: 'OR', isActive: 'y' }])
            assert.strict.deepEqual(parseOf(woItems, 'users', 'id-u3', 'cgrups'), { G3: OR, G2: OR_OFF })
            assert.strict.deepEqual(await authMap(woItems), a0)
        })

        it('RW-107 鏈式 P1→P2 且 P2→P9(權限)→ 同時套用; 授權不變', async function() {
            let { woItems, pc } = createEnv()
            let a0 = await authMap(woItems)
            let rows = await rowsOf(woItems, 'pemis')
            rows = edit(edit(rows, 'id-p1', { name: 'P2' }), 'id-p2', { name: 'P9' })
            assert.strict.deepEqual(await run(pc, 'pemis', rows), OKR)
            assert.strict.deepEqual(parseOf(woItems, 'grups', 'id-g1', 'cpemis'), { P2: OR, P9: OR })
            assert.strict.deepEqual(parseOf(woItems, 'grups', 'id-g2', 'cpemis'), { P9: OR, P3: AND })
            assert.strict.deepEqual(await authMap(woItems), a0)
        })

        it('RW-108 批內另有新增列: 改名 G1→G1x 並新增 G1(舊名, 新 id)與 Gnew → 引用跟著被改名之實體走(G1x), 新增之同名列不繼承; 授權不變', async function() {
            let { woItems, pc } = createEnv()
            let a0 = await authMap(woItems)
            let rows = edit(await rowsOf(woItems, 'grups'), 'id-g1', { name: 'G1x' })
            let nOld = newRow('grups', 'G1', true) //以舊名新增之另一列(NU-021 之形狀)
            let nNew = newRow('grups', 'Gnew', true)
            assert.strict.deepEqual(await run(pc, 'grups', [...rows, nOld, nNew]), OKR)
            assert.strict.deepEqual(parseOf(woItems, 'users', 'id-u1', 'cgrups'), { G1x: OR, G2: AND })
            assert.strict.ok(!hasOwn(parseOf(woItems, 'users', 'id-u1', 'cgrups'), 'G1'), '新增之同名 G1 不繼承引用')
            assert.strict.equal(woItems.grups.get(nOld.id).name, 'G1')
            assert.strict.equal(woItems.grups.get(nNew.id).name, 'Gnew')
            let a1 = await authMap(woItems)
            assert.strict.deepEqual(a1, a0, '新列內容為空且無人引用, 各使用者授權不變')
        })

        it('RW-109 批內另有刪除列: 改名 G1→G1x 並刪除 G2 → 改名與清理同時套用(G2 項移除, G1 項改名); 與以獨立預期值推導之結構相等', async function() {
            let { woItems, pc } = createEnv()
            let before = Object.fromEntries((await woItems.users.select()).map((u) => [u.id, u.cgrups]))
            let rows = drop(edit(await rowsOf(woItems, 'grups'), 'id-g1', { name: 'G1x' }), 'id-g2')
            assert.strict.deepEqual(await run(pc, 'grups', rows), OKR)
            for (let id of ['id-u1', 'id-u2', 'id-u3', 'id-u4']) {
                assert.strict.deepEqual(parseOf(woItems, 'users', id, 'cgrups'), oracleRewrite(before[id], { rename: { G1: 'G1x' }, del: ['G2'] }), id)
            }
            assert.strict.equal(woItems.users.get('id-u5').cgrups, UNRELATED, 'u5 逐字不動')
            assert.strict.equal(woItems.grups.has('id-g2'), false)
        })

        it('RW-110 與其他欄位(description)同一次改: 改名並改 description → 兩者皆落地, 引用連帶改名', async function() {
            let { woItems, pc } = createEnv()
            let a0 = await authMap(woItems)
            let rows = edit(edit(await rowsOf(woItems, 'grups'), 'id-g1', { name: 'G1x', description: 'new-d1' }), 'id-g2', { description: 'new-d2' })
            assert.strict.deepEqual(await run(pc, 'grups', rows), OKR)
            assert.strict.equal(woItems.grups.get('id-g1').description, 'new-d1')
            assert.strict.equal(woItems.grups.get('id-g1').name, 'G1x')
            assert.strict.equal(woItems.grups.get('id-g2').description, 'new-d2')
            assert.strict.deepEqual(parseOf(woItems, 'users', 'id-u1', 'cgrups'), { G1x: OR, G2: AND })
            assert.strict.deepEqual(await authMap(woItems), a0)
        })

        it('RW-111 改名後再改回(兩次儲存)→ 引用隨之往返, 授權始終不變', async function() {
            let { woItems, pc } = createEnv()
            let a0 = await authMap(woItems)
            let rows = edit(await rowsOf(woItems, 'grups'), 'id-g1', { name: 'G1x' })
            assert.strict.deepEqual(await run(pc, 'grups', rows), OKR)
            assert.strict.deepEqual(await authMap(woItems), a0)
            let rows2 = edit(await rowsOf(woItems, 'grups'), 'id-g1', { name: 'G1' })
            assert.strict.deepEqual(await run(pc, 'grups', rows2, undefined, 'id-admin2'), OKR)
            assert.strict.deepEqual(parseOf(woItems, 'users', 'id-u1', 'cgrups'), { G1: OR, G2: AND })
            assert.strict.deepEqual(await authMap(woItems), a0)
        })

        //零寫入: 無改名且無刪除之儲存 → 引用端表 cnt 不增(P1: 「無改名／刪除之寫入不得對引用端表寫入」)
        let TAB_HOLDER = { grups: 'users', pemis: 'grups', targets: 'pemis' }
        let ID1 = { grups: 'id-g1', pemis: 'id-p1', targets: T1 }
        let ZERO = [
            { tag: 'description 變更', mk: (rows, table) => edit(rows, ID1[table], { description: 'changed' }), mainWritten: true },
            { tag: '新增一列', mk: (rows, table) => [...rows, newRow(table, table === 'targets' ? 'sysZ/new' : 'Znew')], mainWritten: true },
            { tag: '僅調整順序(order 變動, 無改名)', mk: (rows) => [...rows].reverse(), mainWritten: true },
            { tag: '原樣重送(無任何變更)', mk: (rows) => rows, mainWritten: false },
        ]
        for (let table of ['grups', 'pemis', 'targets']) {
            for (let z of ZERO) {
                it(`RW-112 無改名無刪除(${table}: ${z.tag})→ 引用端 ${TAB_HOLDER[table]} 之 cnt.save／insert／del／delAll 皆不增, 引用端逐位元不變`, async function() {
                    let { woItems, pc } = createEnv()
                    let h = woItems[TAB_HOLDER[table]]
                    let snapH = h.snapshot()
                    let rows = z.mk(await rowsOf(woItems, table), table)
                    assert.strict.deepEqual(await run(pc, table, rows), OKR)
                    assert.strict.deepEqual(cntOf(h), zeroCnt(h), '引用端 cnt 不增')
                    assert.strict.equal(h.snapshot(), snapH, '引用端逐位元不變')
                    for (let k of TABLE_KEYS) {
                        if (k !== table) {
                            assert.strict.equal(writes(woItems[k]), 0, `非本表之 ${k} 不得被寫`)
                        }
                    }
                    assert.strict.equal(writes(woItems[table]) > 0, z.mainWritten, '本表本身寫入與否(防測項空洞)')
                })
            }
        }

        it('RW-113 cascadeRename:false(伺服端 opt)→ 改名成功但引用不動(引用端零寫入、逐位元不變); 改名相關拒絕(新名撞懸空名)亦不做', async function() {
            let seed = addUsers(seedRows(), { cgrups: J({ Ghost: OR }) }) //u6 以啟用狀態引用懸空名 Ghost
            let { woItems, pc } = createEnv({ seed, proc: { cascadeRename: false } })
            let snapU = woItems.users.snapshot()
            //改名 G1→Ghost: 啟用中引用之懸空名, 預設為 renameCascadeNameInUse; 關閉級聯時不做該拒絕
            let rows = edit(await rowsOf(woItems, 'grups'), 'id-g1', { name: 'Ghost' })
            assert.strict.deepEqual(await run(pc, 'grups', rows), OKR)
            assert.strict.equal(woItems.grups.get('id-g1').name, 'Ghost', '主體改名成功')
            assert.strict.equal(woItems.users.snapshot(), snapU, '引用不動')
            assert.strict.equal(writes(woItems.users), 0, '引用端零寫入')
        })

        it('RW-114 cascadeRename:false 之 pemis 改名同樣不級聯; 刪除連帶清理不受影響(同一次儲存: 改名 P1→P1x 並刪除 P3 → P3 項被清、P1 項不改)', async function() {
            let { woItems, pc } = createEnv({ proc: { cascadeRename: false } })
            let rows = drop(edit(await rowsOf(woItems, 'pemis'), 'id-p1', { name: 'P1x' }), 'id-p3')
            assert.strict.deepEqual(await run(pc, 'pemis', rows), OKR)
            assert.strict.deepEqual(parseOf(woItems, 'grups', 'id-g1', 'cpemis'), { P1: OR, P2: OR }, 'P1 不改名(級聯關閉)')
            assert.strict.deepEqual(parseOf(woItems, 'grups', 'id-g2', 'cpemis'), { P2: OR }, 'P3 項被清理(刪除連帶清理不受 cascadeRename 影響)')
            assert.strict.deepEqual(parseOf(woItems, 'grups', 'id-g3', 'cpemis'), [{ name: 'P1', mode: 'OR', isActive: 'y' }], '陣列形式之 P3(停用)項被清理, P1 不改名')
        })

        it('RW-115 cascadeRename:false 之 grups: 改名 G1→G1x 並刪除 G2 → G2 項被清、G1 項不改名', async function() {
            let { woItems, pc } = createEnv({ proc: { cascadeRename: false } })
            let rows = drop(edit(await rowsOf(woItems, 'grups'), 'id-g1', { name: 'G1x' }), 'id-g2')
            assert.strict.deepEqual(await run(pc, 'grups', rows), OKR)
            assert.strict.deepEqual(parseOf(woItems, 'users', 'id-u1', 'cgrups'), { G1: OR })
            assert.strict.deepEqual(parseOf(woItems, 'users', 'id-u2', 'cgrups'), [{ name: 'G3', mode: 'OR', isActive: 'y' }])
        })

        it('RW-116 引用端被改寫之列: userIdUpdate／timeUpdate 變為操作者與新時間, 其餘欄位(name／email／from／description／order／isAdmin／isActive／userId／timeCreate)不變; 未命中之列整列不變且不寫', async function() {
            let { woItems, pc } = createEnv()
            let b = Object.fromEntries((await woItems.users.select()).map((u) => [u.id, u]))
            let calls = spyTable(woItems.users)
            let rows = edit(await rowsOf(woItems, 'grups'), 'id-g1', { name: 'G1x' })
            assert.strict.deepEqual(await run(pc, 'grups', rows, undefined, 'id-op-A'), OKR)
            //命中: u1、u3
            for (let id of ['id-u1', 'id-u3']) {
                let a = woItems.users.get(id)
                assert.strict.equal(a.userIdUpdate, 'id-op-A', `${id} 更新者為操作者`)
                assert.strict.equal(typeof a.timeUpdate, 'string')
                assert.strict.notEqual(a.timeUpdate, T0, `${id} 更新時間為新時間`)
                assert.strict.notEqual(a.timeUpdate, PH)
                let { cgrups: c1, userIdUpdate: x1, timeUpdate: y1, ...rest1 } = a
                let { cgrups: c0, userIdUpdate: x0, timeUpdate: y0, ...rest0 } = b[id]
                assert.strict.deepEqual(rest1, rest0, `${id} 其餘欄位(含 email、from)不變`)
            }
            //未命中: u2、u4、u5 整列不變
            for (let id of ['id-u2', 'id-u4', 'id-u5']) {
                assert.strict.deepEqual(woItems.users.get(id), b[id], `${id} 未命中, 整列不變`)
            }
            //寫入: 僅一次 save 且只含命中之列
            assert.strict.equal(calls.length, 1)
            assert.strict.equal(calls[0].m, 'save')
            assert.strict.deepEqual([...calls[0].ids].sort(), ['id-u1', 'id-u3'])
        })

        it('RW-117 外部來源之使用者列(from=appX)被級聯: cgrups 改寫, from／email 不變(外部列之指派欄後台可寫, 規則 6)', async function() {
            let { woItems, pc } = createEnv()
            let b = woItems.users.get('id-u2')
            let rows = edit(await rowsOf(woItems, 'grups'), 'id-g3', { name: 'G3x' })
            assert.strict.deepEqual(await run(pc, 'grups', rows), OKR)
            let a = woItems.users.get('id-u2')
            assert.strict.equal(a.from, 'appX')
            assert.strict.equal(a.email, b.email)
            assert.strict.equal(a.name, b.name)
            assert.strict.deepEqual(JSON5.parse(a.cgrups), [{ name: 'G2', mode: 'OR', isActive: 'y' }, { name: 'G3x', mode: 'OR', isActive: 'y' }])
        })

        it('RW-118 大量引用端: 60 位使用者引用 G1 → 改名後全部改寫, 引用端只一次 save(批次)、無 insert／del', async function() {
            let seed = seedRows()
            let extra = []
            for (let k = 0; k < 60; k++) {
                extra.push({ cgrups: J({ G1: OR, [`G-other-${k}`]: OR }) })
            }
            addUsers(seed, ...extra)
            let { woItems, pc } = createEnv({ seed })
            let rows = edit(await rowsOf(woItems, 'grups'), 'id-g1', { name: 'G1x' })
            assert.strict.deepEqual(await run(pc, 'grups', rows), OKR)
            for (let k = 0; k < 60; k++) {
                assert.strict.deepEqual(parseOf(woItems, 'users', `id-x${k}`, 'cgrups'), { G1x: OR, [`G-other-${k}`]: OR })
            }
            assert.strict.deepEqual(cntOf(woItems.users), { insert: 0, save: 1, del: 0, delAll: 0 })
        })

        it('RW-119 未命中之引用字串逐字不動: 手寫 JSON5(註解／單引號／尾逗號)、名稱僅大小寫或空白不同、舊式簡寫值 "y"; 命中之簡寫值保持簡寫', async function() {
            let seed = seedRows()
            let s1 = `{ 'g1': { mode: 'OR', isActive: 'y' } /* 大小寫不同 */ }`
            let s2 = J({ 'G1 ': OR, ' G1': OR }) //前後空白不同
            let s3 = J({ G1: 'y', G2: 'n' }) //舊式簡寫: 命中之 G1 保持簡寫值
            addUsers(seed, { cgrups: s1 }, { cgrups: s2 }, { cgrups: s3 })
            let { woItems, pc } = createEnv({ seed })
            let rows = edit(await rowsOf(woItems, 'grups'), 'id-g1', { name: 'G1x' })
            assert.strict.deepEqual(await run(pc, 'grups', rows), OKR)
            assert.strict.equal(woItems.users.get('id-x0').cgrups, s1, '大小寫不同者(精確 === 比對)逐字不動')
            assert.strict.equal(woItems.users.get('id-x1').cgrups, s2, '前後空白不同者逐字不動')
            assert.strict.equal(woItems.users.get('id-u5').cgrups, UNRELATED, '手寫 JSON5 且未命中者逐字不動')
            assert.strict.equal(woItems.users.get('id-u4').cgrups, '{}')
            assert.strict.deepEqual(parseOf(woItems, 'users', 'id-x2', 'cgrups'), { G1x: 'y', G2: 'n' }, '簡寫值原樣隨名改')
        })

        it('RW-120 引用端字串為壞 JSON／空字串／純量(視為空容器)→ 不動、不寫; 同批其餘命中之列照常改寫', async function() {
            let seed = seedRows()
            addUsers(seed, { cgrups: '' }, { cgrups: 'not json {' }, { cgrups: '5' }, { cgrups: 'null' })
            let { woItems, pc } = createEnv({ seed })
            let b = ['id-x0', 'id-x1', 'id-x2', 'id-x3'].map((id) => woItems.users.get(id))
            let calls = spyTable(woItems.users)
            let rows = edit(await rowsOf(woItems, 'grups'), 'id-g1', { name: 'G1x' })
            assert.strict.deepEqual(await run(pc, 'grups', rows), OKR)
            assert.strict.deepEqual(['id-x0', 'id-x1', 'id-x2', 'id-x3'].map((id) => woItems.users.get(id)), b, '壞字串之列整列不變')
            assert.strict.deepEqual(calls.map((c) => c.ids).flat().sort(), ['id-u1', 'id-u3'], '只寫命中之列')
            assert.strict.deepEqual(parseOf(woItems, 'users', 'id-u1', 'cgrups'), { G1x: OR, G2: AND })
        })

        it('RW-121 互換後以同一份資料再互換(兩次儲存)→ 回到原狀, 授權不變', async function() {
            let { woItems, pc } = createEnv()
            let a0 = await authMap(woItems)
            let swap = async (uid) => {
                let rows = await rowsOf(woItems, 'grups')
                let n1 = rows.find((r) => r.id === 'id-g1').name
                let n2 = rows.find((r) => r.id === 'id-g2').name
                rows = edit(edit(rows, 'id-g1', { name: n2 }), 'id-g2', { name: n1 })
                return run(pc, 'grups', rows, undefined, uid)
            }
            assert.strict.deepEqual(await swap('id-a'), OKR)
            assert.strict.deepEqual(await swap('id-b'), OKR)
            assert.strict.deepEqual(parseOf(woItems, 'users', 'id-u1', 'cgrups'), { G1: OR, G2: AND })
            assert.strict.deepEqual(await authMap(woItems), a0)
        })

    })

    // =====================================================================
    // 族 2: 刪除連帶清理(RW-2xx)
    // =====================================================================
    describe('族 2 刪除連帶清理', function() {

        let cgrupsBefore = async (woItems) => Object.fromEntries((await woItems.users.select()).map((u) => [u.id, u.cgrups]))
        let cpemisBefore = async (woItems) => Object.fromEntries((await woItems.grups.select()).map((u) => [u.id, u.cpemis]))
        let crulesBefore = async (woItems) => Object.fromEntries((await woItems.pemis.select()).map((u) => [u.id, u.crules]))

        it('RW-201 updateGrups 刪 G1 → users.cgrups 內 G1 項被移除(含停用項); 未命中之列整列不變且不寫; 清理後授權＝把該項目自原字串移除後之授權', async function() {
            let { woItems, pc } = createEnv()
            let before = await cgrupsBefore(woItems)
            let usersBefore = await woItems.users.select()
            let calls = spyTable(woItems.users)
            assert.strict.deepEqual(await run(pc, 'grups', drop(await rowsOf(woItems, 'grups'), 'id-g1')), OKR)
            assert.strict.equal(woItems.grups.has('id-g1'), false, '主體已刪')
            assert.strict.deepEqual(parseOf(woItems, 'users', 'id-u1', 'cgrups'), { G2: AND })
            assert.strict.deepEqual(parseOf(woItems, 'users', 'id-u3', 'cgrups'), { G3: OR }, '停用之 G1 項亦被移除')
            for (let id of ['id-u1', 'id-u2', 'id-u3', 'id-u4']) {
                assert.strict.deepEqual(parseOf(woItems, 'users', id, 'cgrups'), oracleRewrite(before[id], { del: ['G1'] }), id)
            }
            assert.strict.equal(woItems.users.get('id-u5').cgrups, UNRELATED, 'u5 逐字不動')
            assert.strict.deepEqual(calls.map((c) => c.ids).flat().sort(), ['id-u1', 'id-u3'], '只寫命中之列')
            //授權: 與「把 G1 自原字串移除」之使用者(以真 getUserRules 於刪除後之四表求值)相等
            let expectUsers = usersBefore.map((u) => ({ ...u, cgrups: J(oracleRewrite(before[u.id], { del: ['G1'] })) }))
            assert.strict.deepEqual(await authMap(woItems), await authMap(woItems, { users: expectUsers }))
        })

        it('RW-202 陣列形式引用: 刪 G3 → u2(陣列)仍為陣列且移除 G3 元素, u3(物件)移除 G3 項(停用之 G1 項保留); 其餘元素原樣', async function() {
            let { woItems, pc } = createEnv()
            assert.strict.deepEqual(await run(pc, 'grups', drop(await rowsOf(woItems, 'grups'), 'id-g3')), OKR)
            let u2 = parseOf(woItems, 'users', 'id-u2', 'cgrups')
            assert.strict.ok(Array.isArray(u2))
            assert.strict.deepEqual(u2, [{ name: 'G2', mode: 'OR', isActive: 'y' }])
            assert.strict.deepEqual(parseOf(woItems, 'users', 'id-u3', 'cgrups'), { G1: OR_OFF })
        })

        it('RW-203 updatePemis 刪 P2 → grups.cpemis(物件形式)P2 項被移除, 他項原樣; 未命中之 g3 逐字不動且不寫; users 不被寫', async function() {
            let { woItems, pc } = createEnv()
            let before = await cpemisBefore(woItems)
            let calls = spyTable(woItems.grups)
            assert.strict.deepEqual(await run(pc, 'pemis', drop(await rowsOf(woItems, 'pemis'), 'id-p2')), OKR)
            assert.strict.deepEqual(parseOf(woItems, 'grups', 'id-g1', 'cpemis'), { P1: OR })
            assert.strict.deepEqual(parseOf(woItems, 'grups', 'id-g2', 'cpemis'), { P3: AND })
            assert.strict.equal(woItems.grups.get('id-g3').cpemis, before['id-g3'], 'g3 未引用 P2, 逐字不動')
            assert.strict.deepEqual(calls.map((c) => c.ids).flat().sort(), ['id-g1', 'id-g2'])
            assert.strict.equal(writes(woItems.users), 0, '無傳遞性')
        })

        it('RW-203b updatePemis 刪 P2 → 清理後授權＝把 P2 自各群組 cpemis 原字串移除後之授權(以真 getUserRules 於刪除後之四表求值)', async function() {
            let { woItems, pc } = createEnv()
            let before = await cpemisBefore(woItems)
            let grupsBefore = await woItems.grups.select()
            assert.strict.deepEqual(await run(pc, 'pemis', drop(await rowsOf(woItems, 'pemis'), 'id-p2')), OKR)
            let expectGrups = grupsBefore.map((g) => ({ ...g, cpemis: J(oracleRewrite(before[g.id], { del: ['P2'] })) }))
            let a = await authMap(woItems)
            assert.strict.deepEqual(a, await authMap(woItems, { grups: expectGrups }))
            //手算錨點: u1 = G1(僅 P1: T1 y, T2 n) ∩ G2(僅 P3 AND: T3 y) → 全 n; u3 = G3 = P1 → T1 y
            assert.strict.deepEqual(a['id-u1'], { [T1]: 'n', [T2]: 'n', [T3]: 'n' })
            assert.strict.deepEqual(a['id-u3'], { [T1]: 'y', [T2]: 'n', [T3]: 'n' })
        })

        it('RW-204 updatePemis 刪 P3 → 物件形式(AND 項)與陣列形式(停用元素)皆被移除; 陣列仍為陣列', async function() {
            let { woItems, pc } = createEnv()
            assert.strict.deepEqual(await run(pc, 'pemis', drop(await rowsOf(woItems, 'pemis'), 'id-p3')), OKR)
            assert.strict.deepEqual(parseOf(woItems, 'grups', 'id-g2', 'cpemis'), { P2: OR })
            let g3 = parseOf(woItems, 'grups', 'id-g3', 'cpemis')
            assert.strict.ok(Array.isArray(g3))
            assert.strict.deepEqual(g3, [{ name: 'P1', mode: 'OR', isActive: 'y' }])
            assert.strict.equal(woItems.grups.get('id-g1').cpemis, seedRows().grups[0].cpemis, 'g1 未引用 P3 逐字不動')
        })

        it('RW-205 updateTargets 刪 T2 → pemis.crules 內 T2 鍵被移除, 他鍵值原樣; 未命中之 P3 逐字不動且不寫', async function() {
            let { woItems, pc } = createEnv()
            let before = await crulesBefore(woItems)
            let calls = spyTable(woItems.pemis)
            assert.strict.deepEqual(await run(pc, 'targets', drop(await rowsOf(woItems, 'targets'), T2)), OKR)
            assert.strict.deepEqual(parseOf(woItems, 'pemis', 'id-p1', 'crules'), { [T1]: 'y' })
            assert.strict.deepEqual(parseOf(woItems, 'pemis', 'id-p2', 'crules'), { [T3]: 'y' })
            assert.strict.equal(woItems.pemis.get('id-p3').crules, before['id-p3'], 'P3 未引用 T2 逐字不動')
            assert.strict.deepEqual(calls.map((c) => c.ids).flat().sort(), ['id-p1', 'id-p2'])
            assert.strict.equal(writes(woItems.grups) + writes(woItems.users), 0, '無傳遞性')
        })

        it('RW-206 updateTargets 改 id(T2→T2x, 即刪舊增新)→ T2 鍵被清, T2x 不繼承授權(各使用者對 T2x 為 n), 其餘標的授權不變', async function() {
            let { woItems, pc } = createEnv()
            let a0 = await authMap(woItems)
            let rows = edit(await rowsOf(woItems, 'targets'), T2, { id: 'sysA/p1/b2x' })
            assert.strict.deepEqual(await run(pc, 'targets', rows), OKR)
            assert.strict.deepEqual(parseOf(woItems, 'pemis', 'id-p1', 'crules'), { [T1]: 'y' })
            assert.strict.equal(hasOwn(parseOf(woItems, 'pemis', 'id-p2', 'crules'), 'sysA/p1/b2x'), false)
            let a1 = await authMap(woItems)
            for (let uid of Object.keys(a0)) {
                assert.strict.equal(a1[uid]['sysA/p1/b2x'], 'n', `${uid}: 新 id 不繼承授權`)
                assert.strict.equal(a1[uid][T1], a0[uid][T1], `${uid} T1`)
                assert.strict.equal(a1[uid][T3], a0[uid][T3], `${uid} T3`)
                assert.strict.equal(hasOwn(a1[uid], T2), false, `${uid}: 舊 id 已不存在`)
            }
        })

        it('RW-207 標的同 id 內容變更(身分以主鍵 id)→ 不是刪除, pemis.crules 不動(引用端零寫入)', async function() {
            let { woItems, pc } = createEnv()
            let snap = woItems.pemis.snapshot()
            let rows = edit(await rowsOf(woItems, 'targets'), T2, { description: 'changed' })
            assert.strict.deepEqual(await run(pc, 'targets', rows), OKR)
            assert.strict.equal(woItems.pemis.snapshot(), snap)
            assert.strict.equal(writes(woItems.pemis), 0)
        })

        it('RW-208 刪除後同一次儲存以同名新增(新 id): 刪 G1 並新增 G1 → 引用被清, 新列不繼承(users 不引用新 G1)', async function() {
            let { woItems, pc } = createEnv()
            let rows = [...drop(await rowsOf(woItems, 'grups'), 'id-g1'), newRow('grups', 'G1', true)]
            assert.strict.deepEqual(await run(pc, 'grups', rows), OKR)
            assert.strict.deepEqual(parseOf(woItems, 'users', 'id-u1', 'cgrups'), { G2: AND })
            assert.strict.deepEqual(parseOf(woItems, 'users', 'id-u3', 'cgrups'), { G3: OR })
            let gs = (await woItems.grups.select()).filter((g) => g.name === 'G1')
            assert.strict.equal(gs.length, 1)
            assert.strict.notEqual(gs[0].id, 'id-g1', '新列為新 id')
            for (let u of await woItems.users.select()) {
                assert.strict.ok(!JSON.stringify(JSON5.parse(u.cgrups)).includes('"G1"'), `${u.id}: 無任何使用者引用新 G1(不被同名新資料接管)`)
            }
        })

        it('RW-209 權限(pemis)與標的(targets)同形: 刪 P2 並新增 P2(新 id)→ grups.cpemis 之 P2 項被清、新 P2 不被繼承', async function() {
            let { woItems, pc } = createEnv()
            let rows = [...drop(await rowsOf(woItems, 'pemis'), 'id-p2'), newRow('pemis', 'P2', true)]
            assert.strict.deepEqual(await run(pc, 'pemis', rows), OKR)
            assert.strict.deepEqual(parseOf(woItems, 'grups', 'id-g1', 'cpemis'), { P1: OR })
            assert.strict.deepEqual(parseOf(woItems, 'grups', 'id-g2', 'cpemis'), { P3: AND })
            let a = await authMap(woItems)
            //u1 = G1(僅 P1: T1 y, T2 n)∩G2(僅 P3: T3 y; AND) → 全 n 之外: 新 P2(crules 為空)不貢獻
            assert.strict.deepEqual(a['id-u1'], { [T1]: 'n', [T2]: 'n', [T3]: 'n' })
        })

        it('RW-210 刪除後之後續儲存再新增同名(兩次儲存)→ 授權不因新增而恢復(引用已於刪除時清除, 不被同名新資料接管)', async function() {
            let { woItems, pc } = createEnv()
            assert.strict.deepEqual(await run(pc, 'grups', drop(await rowsOf(woItems, 'grups'), 'id-g2')), OKR)
            let aMid = await authMap(woItems)
            let rows = [...(await rowsOf(woItems, 'grups')), newRow('grups', 'G2', true, { cpemis: J({ P1: OR }) })]
            assert.strict.deepEqual(await run(pc, 'grups', rows, undefined, 'id-admin2'), OKR)
            assert.strict.deepEqual(await authMap(woItems), aMid, '新建同名 G2 不得被舊引用接管(u1／u2 之授權不變)')
            assert.strict.equal(hasOwn(parseOf(woItems, 'users', 'id-u1', 'cgrups'), 'G2'), false)
        })

        it('RW-211 AND 引用者被刪 → 清理後限制解除(權限變多): 刪 G2 後 u1 授權 = 僅 G1(T1 y、T2 y、T3 y); 刪前為 G1∩G2(T1 n、T2 n、T3 y)', async function() {
            let { woItems, pc } = createEnv()
            let a0 = await authMap(woItems)
            assert.strict.deepEqual(a0['id-u1'], { [T1]: 'n', [T2]: 'n', [T3]: 'y' })
            assert.strict.deepEqual(await run(pc, 'grups', drop(await rowsOf(woItems, 'grups'), 'id-g2')), OKR)
            let a1 = await authMap(woItems)
            assert.strict.deepEqual(a1['id-u1'], { [T1]: 'y', [T2]: 'y', [T3]: 'y' })
            assert.strict.deepEqual(parseOf(woItems, 'users', 'id-u1', 'cgrups'), { G1: OR })
            assert.strict.deepEqual(parseOf(woItems, 'users', 'id-u2', 'cgrups'), [{ name: 'G3', mode: 'OR', isActive: 'y' }])
        })

        it('RW-212 歷史同名只刪其一 → 該名稱仍有存續列, 引用不動(引用端零寫入、逐位元不變); 兩列都刪 → 引用被清', async function() {
            let seed = seedRows()
            //run07 U1 修正(外部列保護 R-EXT-OWN-01): 原 id-gd2 為外部列(appX), 後台不得刪外部列(saveExternalRowChanged); 本案述語為「歷史同名刪除連帶清理」, 與外部列無關, 同名兩列皆為後台列(from ''). 外部列不可刪之拒收見 unit-procCore-external
            addRows(seed, 'grups', { id: 'id-gd1', name: 'GD', from: '', cpemis: J({ P1: OR }) }, { id: 'id-gd2', name: 'GD', from: '', cpemis: J({ P2: OR }) })
            addUsers(seed, { cgrups: J({ GD: OR, G1: OR }) }, { cgrups: J([{ name: 'GD', mode: 'AND', isActive: 'n' }]) })
            let { woItems, pc } = createEnv({ seed })
            let snapU = woItems.users.snapshot()
            assert.strict.deepEqual(await run(pc, 'grups', drop(await rowsOf(woItems, 'grups'), 'id-gd2')), OKR)
            assert.strict.equal(woItems.grups.has('id-gd2'), false)
            assert.strict.equal(woItems.grups.has('id-gd1'), true)
            assert.strict.equal(woItems.users.snapshot(), snapU, '仍有同名存續列: 引用不動')
            assert.strict.equal(writes(woItems.users), 0)
            //再刪另一個
            assert.strict.deepEqual(await run(pc, 'grups', drop(await rowsOf(woItems, 'grups'), 'id-gd1'), undefined, 'id-admin2'), OKR)
            assert.strict.deepEqual(parseOf(woItems, 'users', 'id-x0', 'cgrups'), { G1: OR }, '兩列皆刪後 GD 項被清')
            assert.strict.deepEqual(parseOf(woItems, 'users', 'id-x1', 'cgrups'), [], '陣列形式之停用 GD 元素亦被清, 容器為空陣列')
        })

        it('RW-213 歷史同名兩列於同一次儲存一併刪除 → 引用被清', async function() {
            let seed = seedRows()
            //run07 U1 修正(外部列保護 R-EXT-OWN-01): 原 id-pd2 為外部列(appX)不可由後台刪除; 本案述語為「歷史同名兩列一併刪除之連帶清理」, 與外部列無關, 同名兩列皆為後台列(from '')
            addRows(seed, 'pemis', { id: 'id-pd1', name: 'PD', from: '', crules: '{}' }, { id: 'id-pd2', name: 'PD', from: '', crules: '{}' })
            addRows(seed, 'grups', { id: 'id-gp', name: 'GP', from: '', cpemis: J({ PD: OR, P1: OR }) })
            let { woItems, pc } = createEnv({ seed })
            assert.strict.deepEqual(await run(pc, 'pemis', drop(await rowsOf(woItems, 'pemis'), 'id-pd1', 'id-pd2')), OKR)
            assert.strict.deepEqual(parseOf(woItems, 'grups', 'id-gp', 'cpemis'), { P1: OR })
        })

        it('RW-214 刪除全部群組(rows=[])→ 所有使用者之群組引用被清, 容器形式不變(物件→{}、陣列→[]); 非群組名之引用(u5 之 GX)逐字不動', async function() {
            let { woItems, pc } = createEnv()
            assert.strict.deepEqual(await run(pc, 'grups', []), OKR)
            assert.strict.equal(woItems.grups.size(), 0)
            assert.strict.deepEqual(parseOf(woItems, 'users', 'id-u1', 'cgrups'), {})
            assert.strict.deepEqual(parseOf(woItems, 'users', 'id-u2', 'cgrups'), [])
            assert.strict.deepEqual(parseOf(woItems, 'users', 'id-u3', 'cgrups'), {})
            assert.strict.equal(woItems.users.get('id-u4').cgrups, '{}')
            assert.strict.equal(woItems.users.get('id-u5').cgrups, UNRELATED)
        })

        it('RW-215 引用端字串為壞 JSON／空字串／純量 → 刪除清理時不動、不寫; 命中之列照常清理', async function() {
            let seed = seedRows()
            addUsers(seed, { cgrups: '' }, { cgrups: 'not json {' }, { cgrups: '7' })
            let { woItems, pc } = createEnv({ seed })
            let b = ['id-x0', 'id-x1', 'id-x2'].map((id) => woItems.users.get(id))
            let calls = spyTable(woItems.users)
            assert.strict.deepEqual(await run(pc, 'grups', drop(await rowsOf(woItems, 'grups'), 'id-g1')), OKR)
            assert.strict.deepEqual(['id-x0', 'id-x1', 'id-x2'].map((id) => woItems.users.get(id)), b)
            assert.strict.deepEqual(calls.map((c) => c.ids).flat().sort(), ['id-u1', 'id-u3'])
        })

        it('RW-216 引用名稱與刪除者僅大小寫／空白不同 → 精確 === 比對, 不清理(逐字不動)', async function() {
            let seed = seedRows()
            let s1 = J({ 'g1': OR, 'G1 ': OR, ' G1': OR })
            addUsers(seed, { cgrups: s1 })
            let { woItems, pc } = createEnv({ seed })
            assert.strict.deepEqual(await run(pc, 'grups', drop(await rowsOf(woItems, 'grups'), 'id-g1')), OKR)
            assert.strict.equal(woItems.users.get('id-x0').cgrups, s1)
        })

        it('RW-217 標的 id 含「.」「[」數字樣／原型鍵名(a.b[0]、a、1、__proto__、constructor)→ 刪除只清理「精確同鍵」, 不誤傷相鄰鍵(資料驅動鍵非路徑)', async function() {
            let seed = seedRows()
            let ids = ['a.b[0]', 'a', '1', '__proto__', 'constructor']
            ids.forEach((id) => addRows(seed, 'targets', { id }))
            addRows(seed, 'pemis', { id: 'id-pw', name: 'PW', from: '', crules: '{"a":"y","a.b[0]":"y","1":"y","__proto__":"y","constructor":"y","sysA/p1/b1":"y"}' })
            let allKeys = ['a', 'a.b[0]', '1', '__proto__', 'constructor', T1]
            for (let del of ids) {
                let { woItems, pc, cst } = createEnv({ seed: cloneDeep(seed) })
                let rows = drop(await rowsOf(woItems, 'targets'), del)
                assert.strict.deepEqual(await run(pc, 'targets', rows), OKR, del)
                let keys = Object.keys(JSON.parse(woItems.pemis.get('id-pw').crules)).sort()
                assert.strict.deepEqual(keys, allKeys.filter((k) => k !== del).sort(), `刪 ${del}: 只移除該鍵`)
                cst.clear()
            }
        })

        it('RW-218 改名接手被刪除者之名: G1→G2 並刪除原 G2 → 原 G2 之引用被清、G1 之引用改為 G2(先判刪除、再判改名); u1 授權＝僅 G1 之內容', async function() {
            let { woItems, pc } = createEnv()
            let before = await cgrupsBefore(woItems)
            let rows = drop(edit(await rowsOf(woItems, 'grups'), 'id-g1', { name: 'G2' }), 'id-g2')
            assert.strict.deepEqual(await run(pc, 'grups', rows), OKR)
            for (let id of ['id-u1', 'id-u2', 'id-u3']) {
                assert.strict.deepEqual(parseOf(woItems, 'users', id, 'cgrups'), oracleRewrite(before[id], { rename: { G1: 'G2' }, del: ['G2'] }), id)
            }
            assert.strict.deepEqual(parseOf(woItems, 'users', 'id-u1', 'cgrups'), { G2: OR })
            assert.strict.deepEqual((await authMap(woItems))['id-u1'], { [T1]: 'y', [T2]: 'y', [T3]: 'y' })
        })

        it('RW-219 刪除同時連動清理且 cascadeRename:false 不受影響(刪除 G1, 預設關閉改名級聯仍清理)', async function() {
            let { woItems, pc } = createEnv({ proc: { cascadeRename: false } })
            assert.strict.deepEqual(await run(pc, 'grups', drop(await rowsOf(woItems, 'grups'), 'id-g1')), OKR)
            assert.strict.deepEqual(parseOf(woItems, 'users', 'id-u1', 'cgrups'), { G2: AND })
        })

        //缺 id 之送入列(API 直打): 寫入時 ORM 補隨機主鍵(舊列刪、新列增), 但身分改依「名稱」對應既有列(fillIdlessIds; 原則 3、6: 避免整表缺 id 時清空全部引用)——
        //同名即同一實體(不算刪除再新增, 引用不被清理); 名稱不同者視為新實體(舊名視為刪除而清理其引用, 新名不繼承); targets 之 id 必帶, 不適用.
        let noId = (rows, ...ids) => rows.map((r) => {
            if (ids.length > 0 && !ids.includes(r.id)) {
                return r
            }
            let { id, ...rest } = r
            return rest
        })

        it('RW-221a 整表缺 id 且名稱皆不變 → 引用保留(引用端逐位元不變且零寫入; 授權不變); 群組列換成新隨機 id(舊列被刪、新列被增), 不記 refCascade-done', async function() {
            let env = createEnv()
            let { woItems, pc, logs } = env
            let a0 = await authMap(woItems)
            let snapU = woItems.users.snapshot()
            let r = await run(pc, 'grups', noId(await rowsOf(woItems, 'grups')))
            assert.strict.deepEqual(r, OKR)
            assert.strict.equal(woItems.users.snapshot(), snapU, '引用不被清理')
            assert.strict.equal(writes(woItems.users), 0)
            let gs = await woItems.grups.select()
            assert.strict.equal(gs.length, 3)
            assert.strict.deepEqual(gs.map((g) => g.name).sort(), ['G1', 'G2', 'G3'])
            assert.strict.ok(gs.every((g) => !['id-g1', 'id-g2', 'id-g3'].includes(g.id)), '寫入後群組 id 為新的隨機 id(舊列刪除)')
            assert.strict.deepEqual(await authMap(woItems), a0, '各使用者授權不變')
            assert.strict.equal(logs.filter((l) => l.event === 'refCascade-done').length, 0)
        })

        it('RW-221b 僅一列缺 id 且名稱不變(其餘帶 id)→ 引用保留; 缺 id 之列對應同名既有列而非新實體', async function() {
            let { woItems, pc } = createEnv()
            let snapU = woItems.users.snapshot()
            assert.strict.deepEqual(await run(pc, 'grups', noId(await rowsOf(woItems, 'grups'), 'id-g1')), OKR)
            assert.strict.equal(woItems.users.snapshot(), snapU)
            assert.strict.equal(woItems.grups.has('id-g1'), false, '舊列(以 id 對應)被刪、新列為新 id')
            assert.strict.equal((await woItems.grups.select()).filter((g) => g.name === 'G1').length, 1)
        })

        it('RW-221c 缺 id 且改為另一名稱 → 視為新實體: 舊名(G1)之引用被清、新名(G1y)不繼承; 其餘名稱不變者引用保留', async function() {
            let { woItems, pc, logs } = createEnv()
            let rows = noId(edit(await rowsOf(woItems, 'grups'), 'id-g1', { name: 'G1y' }))
            assert.strict.deepEqual(await run(pc, 'grups', rows), OKR)
            assert.strict.deepEqual(parseOf(woItems, 'users', 'id-u1', 'cgrups'), { G2: AND }, 'G1 引用被清, G2 保留')
            assert.strict.deepEqual(parseOf(woItems, 'users', 'id-u3', 'cgrups'), { G3: OR })
            assert.strict.deepEqual(parseOf(woItems, 'users', 'id-u2', 'cgrups'), [{ name: 'G2', mode: 'OR', isActive: 'y' }, { name: 'G3', mode: 'OR', isActive: 'y' }], '未涉 G1 者不動')
            assert.strict.ok(!(await woItems.users.select()).some((u) => /G1y/.test(u.cgrups)), '新名不繼承')
            let l = logs.filter((x) => x.event === 'refCascade-done')
            assert.strict.equal(l.length, 1)
            assert.strict.deepEqual([l[0].nRename, l[0].nDelName], [0, 1], '視為刪除而非改名(缺 id 無從偵測改名)')
        })

        it('RW-221d 混合帶 id 與缺 id: g1 帶 id 改名 G1x、g2 缺 id 同名、g3 缺 id 改名 G3z → G1 改名級聯、G2 保留、G3 視為刪除(引用被清)、G3z 不繼承', async function() {
            let { woItems, pc } = createEnv()
            let rows = noId(edit(edit(await rowsOf(woItems, 'grups'), 'id-g1', { name: 'G1x' }), 'id-g3', { name: 'G3z' }), 'id-g2', 'id-g3')
            assert.strict.deepEqual(await run(pc, 'grups', rows), OKR)
            assert.strict.deepEqual(parseOf(woItems, 'users', 'id-u1', 'cgrups'), { G1x: OR, G2: AND })
            assert.strict.deepEqual(parseOf(woItems, 'users', 'id-u2', 'cgrups'), [{ name: 'G2', mode: 'OR', isActive: 'y' }], 'G3 項被清')
            assert.strict.deepEqual(parseOf(woItems, 'users', 'id-u3', 'cgrups'), { G1x: OR_OFF })
            assert.strict.equal(woItems.grups.get('id-g1').name, 'G1x')
            assert.strict.equal(woItems.grups.has('id-g2'), false, '缺 id 之 g2 換新 id')
        })

        it('RW-221e 缺 id 之新增列以舊名新增、同時帶 id 之舊列改名(NU-021 形狀): 引用隨舊列改名(G1x), 缺 id 之同名新列為新實體(不對應已被帶用之 id)、不繼承', async function() {
            let { woItems, pc } = createEnv()
            let rows = [...edit(await rowsOf(woItems, 'grups'), 'id-g1', { name: 'G1x' }), noId([newRow('grups', 'G1')])[0]]
            assert.strict.deepEqual(await run(pc, 'grups', rows), OKR)
            assert.strict.deepEqual(parseOf(woItems, 'users', 'id-u1', 'cgrups'), { G1x: OR, G2: AND })
            assert.strict.ok(!(await woItems.users.select()).some((u) => JSON.stringify(JSON5.parse(u.cgrups)).includes('"G1"')), '新增之 G1 不被引用')
        })

        it('RW-221f 歷史同名只刪其一(缺 id): 庫內 GD×2, 送入僅一列缺 id 之 GD → 對應其一, 另一被刪但名稱仍有存續列, 引用不動', async function() {
            let seed = seedRows()
            //run07 U1 修正(外部列保護 R-EXT-OWN-01): 原 id-gd2 為外部列(appX)不可由後台刪除; 述語與外部列無關, 同名兩列皆為後台列(from '')
            addRows(seed, 'grups', { id: 'id-gd1', name: 'GD', from: '', cpemis: '{}' }, { id: 'id-gd2', name: 'GD', from: '', cpemis: '{}' })
            addUsers(seed, { cgrups: J({ GD: OR }) })
            let { woItems, pc } = createEnv({ seed })
            let snapU = woItems.users.snapshot()
            let rows = [...drop(await rowsOf(woItems, 'grups'), 'id-gd1', 'id-gd2'), noId([newRow('grups', 'GD')])[0]]
            assert.strict.deepEqual(await run(pc, 'grups', rows), OKR)
            assert.strict.equal(woItems.users.snapshot(), snapU)
            assert.strict.equal((await woItems.grups.select()).filter((g) => g.name === 'GD').length, 1)
        })

        it('RW-221g 缺 id 且同名多列(兩列缺 id 之 GD)→ 屬「本次造成之重複」被 nameDuplicate 擋下(缺 id 之列非庫內同 id 同名之既有列), 四表零變更', async function() {
            let seed = seedRows()
            addRows(seed, 'grups', { id: 'id-gd1', name: 'GD', from: '', cpemis: '{}' }, { id: 'id-gd2', name: 'GD', from: 'appX', cpemis: '{}' })
            let { woItems, pc } = createEnv({ seed })
            let before = snapAll(woItems)
            let rows = noId(await rowsOf(woItems, 'grups'), 'id-gd1', 'id-gd2')
            assert.strict.deepEqual(await run(pc, 'grups', rows), ERR('nameDuplicate'))
            assert.strict.equal(snapAll(woItems), before)
        })

        it('RW-221h 權限(pemis)同形: 整表缺 id 且名稱不變 → grups.cpemis 保留(零寫入); 缺 id 改名為另一名稱 → 舊名引用被清', async function() {
            let env = createEnv()
            let snapG = env.woItems.grups.snapshot()
            assert.strict.deepEqual(await run(env.pc, 'pemis', noId(await rowsOf(env.woItems, 'pemis'))), OKR)
            assert.strict.equal(env.woItems.grups.snapshot(), snapG)
            assert.strict.equal(writes(env.woItems.grups), 0)
            let env2 = createEnv()
            assert.strict.deepEqual(await run(env2.pc, 'pemis', noId(edit(await rowsOf(env2.woItems, 'pemis'), 'id-p3', { name: 'P3z' }))), OKR)
            assert.strict.deepEqual(parseOf(env2.woItems, 'grups', 'id-g2', 'cpemis'), { P2: OR })
            assert.strict.deepEqual(parseOf(env2.woItems, 'grups', 'id-g3', 'cpemis'), [{ name: 'P1', mode: 'OR', isActive: 'y' }])
            assert.strict.deepEqual(parseOf(env2.woItems, 'grups', 'id-g1', 'cpemis'), { P1: OR, P2: OR })
        })

        it('RW-221i 取鎖軌跡: 整表缺 id 且名稱不變 → 無須改寫引用端, 只取本表鎖(grups); 缺 id 改名(視為刪除)→ 再取引用端鎖(grups → users)', async function() {
            //perm-run01: 原注入假 kmx 記 acq 鍵 tabWriteKey(表), 改以 traceLock 包裝真鎖(記 acq 表名; 本表經 guardWrite、引用端經 withTabLocks 皆記)
            let acq = (log) => log.filter((x) => x.startsWith('acq ')).map((x) => x.slice(4))
            let t1 = traceLock()
            let env = createEnv({ lockOf: t1.wrap })
            assert.strict.deepEqual(await run(env.pc, 'grups', noId(await rowsOf(env.woItems, 'grups'))), OKR)
            assert.strict.deepEqual(acq(t1.log), ['grups'])
            let t2 = traceLock()
            let env2 = createEnv({ lockOf: t2.wrap })
            assert.strict.deepEqual(await run(env2.pc, 'grups', noId(edit(await rowsOf(env2.woItems, 'grups'), 'id-g1', { name: 'G1y' }))), OKR)
            assert.strict.deepEqual(acq(t2.log), ['grups', 'users'])
        })

        it('RW-220 crules 之物件值形式與陣列形式: 刪標的 T1 → 物件形式移除 T1 鍵(值物件之他鍵不動)、陣列形式移除該元素且仍為陣列', async function() {
            let seed = seedRows()
            addRows(seed, 'pemis', { id: 'id-pw', name: 'PW', from: '', crules: J({ [T1]: { isActive: 'y' }, [T2]: { isActive: 'n', note: 'keep' } }) }, { id: 'id-pa', name: 'PA', from: '', crules: J([{ name: T1, isActive: 'y' }, { name: T3, isActive: 'y', note: 'keep' }]) })
            let { woItems, pc } = createEnv({ seed })
            assert.strict.deepEqual(await run(pc, 'targets', drop(await rowsOf(woItems, 'targets'), T1)), OKR)
            assert.strict.deepEqual(parseOf(woItems, 'pemis', 'id-pw', 'crules'), { [T2]: { isActive: 'n', note: 'keep' } })
            let pa = parseOf(woItems, 'pemis', 'id-pa', 'crules')
            assert.strict.ok(Array.isArray(pa))
            assert.strict.deepEqual(pa, [{ name: T3, isActive: 'y', note: 'keep' }])
        })

    })


    // =====================================================================
    // 族 3: 三種拒絕與預檢(RW-3xx)
    // =====================================================================
    describe('族 3 拒絕與預檢(整次拒存、四表零變更)', function() {

        //run07 U1 修正(外部列保護 R-EXT-OWN-01): 原 id-gd2 為外部列(appX), 後台不得改名外部列(saveExternalRowChanged, 先於級聯預檢); RW-301／302／303／316 之述語為歷史同名組之改名級聯預檢,
        //與外部列無關, 同名兩列皆為後台列(from ''), 拒收鍵 renameCascadeDupGroup 之斷言不變. 外部列改名被拒見 unit-procCore-external
        let seedDup = () => {
            let seed = seedRows()
            addRows(seed, 'grups', { id: 'id-gd1', name: 'GD', from: '', cpemis: '{}' }, { id: 'id-gd2', name: 'GD', from: '', cpemis: '{}' })
            return seed
        }

        it('RW-301 renameCascadeDupGroup: 歷史同名組(GD×2)中任一列被改名且該名稱仍被啟用中引用 → 整次拒存、四表零變更、srLog 無個資', async function() {
            for (let id of ['id-gd1', 'id-gd2']) {
                let seed = addUsers(seedDup(), { cgrups: J({ GD: OR }) })
                let env = createEnv({ seed })
                let rows = edit(await rowsOf(env.woItems, 'grups'), id, { name: 'GE' })
                await expectRejectZero(env, 'grups', rows, 'renameCascadeDupGroup')
                env.cst.clear()
            }
        })

        it('RW-302 renameCascadeDupGroup: 引用為停用項／陣列形式亦算「仍被引用」(含停用項)', async function() {
            for (let cg of [J({ GD: OR_OFF }), J([{ name: 'GD', mode: 'OR', isActive: 'n' }]), J({ GD: 'n' })]) {
                let seed = addUsers(seedDup(), { cgrups: cg })
                let env = createEnv({ seed })
                let rows = edit(await rowsOf(env.woItems, 'grups'), 'id-gd2', { name: 'GE' })
                await expectRejectZero(env, 'grups', rows, 'renameCascadeDupGroup')
                env.cst.clear()
            }
        })

        it('RW-303 歷史同名組之名稱無人引用 → 改名不擋(歷史同名之清理路徑), 且無引用可轉故引用端零寫入', async function() {
            let { woItems, pc } = createEnv({ seed: seedDup() })
            let rows = edit(await rowsOf(woItems, 'grups'), 'id-gd2', { name: 'GE' })
            assert.strict.deepEqual(await run(pc, 'grups', rows), OKR)
            assert.strict.equal(woItems.grups.get('id-gd2').name, 'GE')
            assert.strict.equal(writes(woItems.users), 0)
        })

        it('RW-304 renameCascadeDupGroup(權限): 歷史同名 PD×2 被 grups.cpemis 引用 → updatePemis 改名其一被拒; 無人引用則不擋', async function() {
            let mkSeed = (ref) => {
                let seed = seedRows()
                addRows(seed, 'pemis', { id: 'id-pd1', name: 'PD', from: '', crules: '{}' }, { id: 'id-pd2', name: 'PD', from: 'appX', crules: '{}' })
                if (ref) {
                    addRows(seed, 'grups', { id: 'id-gp', name: 'GP', from: '', cpemis: J({ PD: OR }) })
                }
                return seed
            }
            let env = createEnv({ seed: mkSeed(true) })
            await expectRejectZero(env, 'pemis', edit(await rowsOf(env.woItems, 'pemis'), 'id-pd1', { name: 'PE' }), 'renameCascadeDupGroup')
            env.cst.clear()
            let env2 = createEnv({ seed: mkSeed(false) })
            assert.strict.deepEqual(await run(env2.pc, 'pemis', edit(await rowsOf(env2.woItems, 'pemis'), 'id-pd1', { name: 'PE' })), OKR)
        })

        for (let cg of [J({ Ghost: OR }), J({ Ghost: 'y' }), J([{ name: 'Ghost', mode: 'OR', isActive: 'y' }])]) {
            it(`RW-305 renameCascadeNameInUse: 新名 Ghost 為「啟用中引用而無任何實體」之懸空名(${cg.slice(0, 40)})→ 整次拒存、四表零變更`, async function() {
                let seed = addUsers(seedRows(), { cgrups: cg })
                let env = createEnv({ seed })
                let rows = edit(await rowsOf(env.woItems, 'grups'), 'id-g1', { name: 'Ghost' })
                await expectRejectZero(env, 'grups', rows, 'renameCascadeNameInUse')
            })
        }

        it('RW-306 懸空名之引用為停用項 → 不擋(僅啟用中引用才拒), 改名級聯照常; 停用之懸空項保持原樣', async function() {
            let seed = addUsers(seedRows(), { cgrups: J({ Ghost: OR_OFF }) })
            let { woItems, pc } = createEnv({ seed })
            let rows = edit(await rowsOf(woItems, 'grups'), 'id-g1', { name: 'Ghost' })
            assert.strict.deepEqual(await run(pc, 'grups', rows), OKR)
            assert.strict.deepEqual(parseOf(woItems, 'users', 'id-u1', 'cgrups'), { Ghost: OR, G2: AND })
            assert.strict.deepEqual(parseOf(woItems, 'users', 'id-x0', 'cgrups'), { Ghost: OR_OFF })
        })

        it('RW-307 renameCascadeNameInUse(權限): 新名為 grups.cpemis 啟用中引用之懸空名 → 拒; 新增同名(非改名)不拒(外部先指派後定義為合法流程)', async function() {
            let seed = addRows(seedRows(), 'grups', { id: 'id-gp', name: 'GP', cpemis: J({ PGhost: OR }) })
            let env = createEnv({ seed })
            await expectRejectZero(env, 'pemis', edit(await rowsOf(env.woItems, 'pemis'), 'id-p1', { name: 'PGhost' }), 'renameCascadeNameInUse')
            env.cst.clear()
            let env2 = createEnv({ seed: addRows(seedRows(), 'grups', { id: 'id-gp', name: 'GP', cpemis: J({ PGhost: OR }) }) })
            let rows = [...(await rowsOf(env2.woItems, 'pemis')), newRow('pemis', 'PGhost', true)]
            assert.strict.deepEqual(await run(env2.pc, 'pemis', rows), OKR, '新增(非改名)同名撞懸空名不拒')
        })

        it('RW-308 renameCascadeConflict: 某容器內新名與另一(未被改走／刪除之)既有項目相撞(含停用項)→ 拒; 物件與陣列形式皆然', async function() {
            for (let cg of [J({ G1: OR, G1x: OR_OFF }), J([{ name: 'G1', mode: 'OR', isActive: 'y' }, { name: 'G1x', mode: 'OR', isActive: 'n' }])]) {
                let seed = addUsers(seedRows(), { cgrups: cg })
                let env = createEnv({ seed })
                let rows = edit(await rowsOf(env.woItems, 'grups'), 'id-g1', { name: 'G1x' })
                await expectRejectZero(env, 'grups', rows, 'renameCascadeConflict')
                env.cst.clear()
            }
        })

        it('RW-309 renameCascadeConflict(權限): grups.cpemis 內 P1 與停用之 P1x 並存, 改名 P1→P1x → 拒', async function() {
            let seed = addRows(seedRows(), 'grups', { id: 'id-gp', name: 'GP', cpemis: J({ P1: OR, P1x: OR_OFF }) })
            let env = createEnv({ seed })
            await expectRejectZero(env, 'pemis', edit(await rowsOf(env.woItems, 'pemis'), 'id-p1', { name: 'P1x' }), 'renameCascadeConflict')
        })

        it('RW-310 新名之容器內項目一併被改走或刪除者不算相撞(互換／鏈式／接手被刪者已由 RW-104／106／218 守)—— 此處: 容器內 G1 與停用之 G2 並存, G1→G2 且 G2→G9 → 不拒', async function() {
            let seed = addUsers(seedRows(), { cgrups: J({ G1: OR, G2: OR_OFF }) })
            let { woItems, pc } = createEnv({ seed })
            let rows = edit(edit(await rowsOf(woItems, 'grups'), 'id-g1', { name: 'G2' }), 'id-g2', { name: 'G9' })
            assert.strict.deepEqual(await run(pc, 'grups', rows), OKR)
            assert.strict.deepEqual(parseOf(woItems, 'users', 'id-x0', 'cgrups'), { G2: OR, G9: OR_OFF })
        })

        it('RW-311 htmlMarkupNotAllowed: 被改寫之引用端列(舊字串含 HTML 標記項)→ 零變更(改名路徑)', async function() {
            let mk = '<img src=x onerror=1>'
            assert.strict.ok(clearXSS(mk) !== mk, '前提: 標記會被 clearXSS 改寫')
            let seed = addUsers(seedRows(), { cgrups: J({ G1: OR, [mk]: OR }) })
            let env = createEnv({ seed })
            await expectRejectZero(env, 'grups', edit(await rowsOf(env.woItems, 'grups'), 'id-g1', { name: 'G1x' }), 'htmlMarkupNotAllowed')
        })

        it('RW-312 htmlMarkupNotAllowed: 刪除路徑(grups／pemis／targets 各一)之引用端改寫列含標記 → 零變更', async function() {
            let mk = '<img src=x onerror=1>'
            //grups 刪除 → users
            let env = createEnv({ seed: addUsers(seedRows(), { cgrups: J({ G1: OR, [mk]: OR }) }) })
            await expectRejectZero(env, 'grups', drop(await rowsOf(env.woItems, 'grups'), 'id-g1'), 'htmlMarkupNotAllowed')
            env.cst.clear()
            //pemis 刪除 → grups
            let env2 = createEnv({ seed: addRows(seedRows(), 'grups', { id: 'id-gp', name: 'GP', cpemis: J({ P1: OR, [mk]: OR }) }) })
            await expectRejectZero(env2, 'pemis', drop(await rowsOf(env2.woItems, 'pemis'), 'id-p1'), 'htmlMarkupNotAllowed')
            env2.cst.clear()
            //targets 刪除 → pemis
            let env3 = createEnv({ seed: addRows(seedRows(), 'pemis', { id: 'id-pw', name: 'PW', crules: J({ [T1]: 'y', [mk]: 'y' }) }) })
            await expectRejectZero(env3, 'targets', drop(await rowsOf(env3.woItems, 'targets'), T1), 'htmlMarkupNotAllowed')
        })

        it('RW-313 引用端含標記但未被改寫(未命中)→ 不阻擋儲存(舊資料不阻擋), 該列逐字不動', async function() {
            let mk = '<img src=x onerror=1>'
            let s = J({ GX: OR, [mk]: OR })
            let seed = addUsers(seedRows(), { cgrups: s })
            let { woItems, pc } = createEnv({ seed })
            assert.strict.deepEqual(await run(pc, 'grups', edit(await rowsOf(woItems, 'grups'), 'id-g1', { name: 'G1x' })), OKR)
            assert.strict.equal(woItems.users.get('id-x0').cgrups, s)
        })

        it('RW-314 saveRowFieldInvalid: 引用端被改寫列之主鍵超過 1978 B(LMDB 鍵長上限)→ 於任何寫入前拒, 零變更', async function() {
            let seed = addUsers(seedRows(), { id: 'id-' + 'x'.repeat(1980), cgrups: J({ G1: OR }) })
            let env = createEnv({ seed })
            await expectRejectZero(env, 'grups', edit(await rowsOf(env.woItems, 'grups'), 'id-g1', { name: 'G1x' }), 'saveRowFieldInvalid')
        })

        it('RW-315 被拒後占位即釋放: 同一操作者立即再送合法之改名 → 成功並級聯', async function() {
            let seed = addUsers(seedRows(), { cgrups: J({ Ghost: OR }) })
            let env = createEnv({ seed })
            await expectRejectZero(env, 'grups', edit(await rowsOf(env.woItems, 'grups'), 'id-g1', { name: 'Ghost' }), 'renameCascadeNameInUse')
            let r = await run(env.pc, 'grups', edit(await rowsOf(env.woItems, 'grups'), 'id-g1', { name: 'G1x' }))
            assert.strict.deepEqual(r, OKR)
            assert.strict.deepEqual(parseOf(env.woItems, 'users', 'id-u1', 'cgrups'), { G1x: OR, G2: AND })
        })

        //R2: 容器含 JSON5 非有限數值(Infinity／NaN)而命中須改寫 → JSON.stringify 會把它編成 null(作為規則名時改指別的規則『null』, 即靜默增權), 故整次拒存 renameCascadeUnsupported(改名與刪除皆然); 未命中該容器者不受影響
        it('RW-317 R2 updateTargets 只刪 gone, 留下 crules 含 name:Infinity 之容器(另有 target "null")→ renameCascadeUnsupported, 四表零變更', async function() {
            let seed = seedRows()
            addRows(seed, 'targets', { id: 'null' }, { id: 'gone' })
            addRows(seed, 'pemis', { id: 'id-pi', name: 'PI', from: '', crules: `[{ name: Infinity, isActive: 'y' }, { name: 'gone', isActive: 'y' }]` })
            let env = createEnv({ seed })
            await expectRejectZero(env, 'targets', drop(await rowsOf(env.woItems, 'targets'), 'gone'), 'renameCascadeUnsupported')
        })

        it('RW-318 R2 未命中該含 Infinity 之容器的刪除不受影響: 刪 T1(不在該容器內)→ 成功, 含 Infinity 之容器逐字不動, 命中之 P1 照常清理', async function() {
            let seed = seedRows()
            let s = `[{ name: Infinity, isActive: 'y' }, { name: 'gone', isActive: 'y' }]`
            addRows(seed, 'targets', { id: 'null' }, { id: 'gone' })
            addRows(seed, 'pemis', { id: 'id-pi', name: 'PI', from: '', crules: s })
            let { woItems, pc } = createEnv({ seed })
            assert.strict.deepEqual(await run(pc, 'targets', drop(await rowsOf(woItems, 'targets'), T1)), OKR)
            assert.strict.equal(woItems.pemis.get('id-pi').crules, s, '未命中之容器逐字不動')
            assert.strict.deepEqual(parseOf(woItems, 'pemis', 'id-p1', 'crules'), { [T2]: 'n' })
        })

        it('RW-319 R2 grups 改名與刪除: cgrups 容器含 NaN 值且命中 → renameCascadeUnsupported(改名、刪除皆然); 未命中該容器之改名成功且該列逐字不動', async function() {
            let hit = `{ G1: { mode: 'OR', isActive: 'y' }, GX: { mode: 'OR', isActive: 'y', w: NaN } }`
            let miss = `{ GY: { mode: 'OR', isActive: 'y', w: NaN } }`
            let env = createEnv({ seed: addUsers(seedRows(), { cgrups: hit }) })
            await expectRejectZero(env, 'grups', edit(await rowsOf(env.woItems, 'grups'), 'id-g1', { name: 'G1x' }), 'renameCascadeUnsupported')
            env.cst.clear()
            let env2 = createEnv({ seed: addUsers(seedRows(), { cgrups: hit }) })
            await expectRejectZero(env2, 'grups', drop(await rowsOf(env2.woItems, 'grups'), 'id-g1'), 'renameCascadeUnsupported')
            env2.cst.clear()
            let env3 = createEnv({ seed: addUsers(seedRows(), { cgrups: miss }) })
            assert.strict.deepEqual(await run(env3.pc, 'grups', edit(await rowsOf(env3.woItems, 'grups'), 'id-g1', { name: 'G1x' })), OKR)
            assert.strict.equal(env3.woItems.users.get('id-x0').cgrups, miss)
            assert.strict.deepEqual(parseOf(env3.woItems, 'users', 'id-u1', 'cgrups'), { G1x: OR, G2: AND })
        })

        it('RW-320 R2 pemis 改名與刪除: grups.cpemis 容器含 Infinity 值且命中 → renameCascadeUnsupported(改名、刪除皆然)', async function() {
            let seed = () => addRows(seedRows(), 'grups', { id: 'id-gp', name: 'GP', from: '', cpemis: `{ P1: { mode: 'OR', isActive: 'y' }, PX: { mode: 'OR', isActive: 'y', w: Infinity } }` })
            let env = createEnv({ seed: seed() })
            await expectRejectZero(env, 'pemis', edit(await rowsOf(env.woItems, 'pemis'), 'id-p1', { name: 'P1x' }), 'renameCascadeUnsupported')
            env.cst.clear()
            let env2 = createEnv({ seed: seed() })
            await expectRejectZero(env2, 'pemis', drop(await rowsOf(env2.woItems, 'pemis'), 'id-p1'), 'renameCascadeUnsupported')
        })

        it('RW-321 R2 renameCascadeUnsupported 為語系鍵(procLang eng／cht 皆有, 否則對外會被換成 saveWriteFail)', async function() {
            let procLang = (await import('../server/procLang.mjs')).default
            let kp = procLang({})
            for (let lang of ['eng', 'cht']) {
                assert.strict.ok(typeof kp[lang].renameCascadeUnsupported === 'string' && kp[lang].renameCascadeUnsupported !== '', lang)
            }
        })

        it('RW-316 拒絕先於寫入且不分入口: 以 cnt 逐表驗證——被拒時引用端與主體之 insert／save／del／delAll 皆為 0(四種鍵各一案以 expectRejectZero 逐項驗)', async function() {
            let cases = [
                ['renameCascadeDupGroup', () => addUsers(seedDup(), { cgrups: J({ GD: OR }) }), (r) => edit(r, 'id-gd2', { name: 'GE' })],
                ['renameCascadeNameInUse', () => addUsers(seedRows(), { cgrups: J({ Ghost: OR }) }), (r) => edit(r, 'id-g1', { name: 'Ghost' })],
                ['renameCascadeConflict', () => addUsers(seedRows(), { cgrups: J({ G1: OR, G1x: OR_OFF }) }), (r) => edit(r, 'id-g1', { name: 'G1x' })],
            ]
            for (let [key, mkSeed, mkRows] of cases) {
                let env = createEnv({ seed: mkSeed() })
                let rows = mkRows(await rowsOf(env.woItems, 'grups'))
                //同一包併入新增列與 description 變更, 使「若未被拒則主體必有 insert／save」
                rows = [...edit(rows, 'id-g2', { description: 'also-changed' }), newRow('grups', 'Zadd', true)]
                await expectRejectZero(env, 'grups', rows, key)
                assert.strict.equal(writesAll(env.woItems), 0)
                env.cst.clear()
            }
        })

    })

    // =====================================================================
    // 族 4: 失敗回復(引用端先寫、失敗補償還原; 逐故障點, RW-4xx)
    // =====================================================================
    describe('族 4 失敗回復(補償還原引用端; 主體部分寫入為 ADR-013 既有限制, 補償不還原主體)', function() {

        //mkShape: updateGrups 之送入整表(以種子建構一次, 供「同一份送入資料」之重送; 新列 id 固定)
        //  swap:  互換 G1↔G2        chain: 鏈式 G1→G2、G2→G9
        //  new:   批內新增(另名)    newOld: 批內新增(以舊名 G1 新增另一列, 同時 G1→G1x)
        //  renDel: 改名 G1→G1x 並刪 G2   renDelNew: renDel 再新增 Gnew
        //新列不帶 _isNew(否則重送被 saveNewRowExists 擋, ADR-025, 且非本族所測), 其建立者／更新者預填為操作者 id-admin(與伺服端新增時填入者相同), 使重送後之終態可與無故障基準逐欄比對
        let nr = (name) => newRow('grups', name, false, { userId: 'id-admin', userIdUpdate: 'id-admin' })
        let mkShape = (name) => {
            let g = seedRows().grups
            switch (name) {
            case 'swap':
                return edit(edit(g, 'id-g1', { name: 'G2' }), 'id-g2', { name: 'G1' })
            case 'chain':
                return edit(edit(g, 'id-g1', { name: 'G2' }), 'id-g2', { name: 'G9' })
            case 'new':
                return [...edit(g, 'id-g1', { name: 'G1x' }), nr('Gnew')]
            case 'newOld':
                return [...edit(g, 'id-g1', { name: 'G1x' }), nr('G1')]
            case 'renDel':
                return drop(edit(g, 'id-g1', { name: 'G1x' }), 'id-g2')
            case 'renDelNew':
                return [...drop(edit(g, 'id-g1', { name: 'G1x' }), 'id-g2'), nr('Gnew')]
            }
            throw new Error(`unknown shape ${name}`)
        }

        //cleanRun: 無故障時同一份資料之終態(正規化視圖與 users.cgrups), 供「重送後結果正確」之比對
        let cleanRun = async (rows) => {
            let env = createEnv()
            let r = await run(env.pc, 'grups', cloneDeep(rows))
            assert.strict.deepEqual(r, OKR, '無故障之基準應成功')
            let cg = Object.fromEntries((await env.woItems.users.select()).map((u) => [u.id, u.cgrups]))
            return { view: await viewOf(env.woItems), cg, auth: await authMap(env.woItems) }
        }

        let findLog = (logs, event) => logs.filter((l) => l.event === event)

        //(a)(d) 逐故障點 × 三(四)形狀: 補償後引用端逐位元還原、回 saveWriteFail、重送同一份資料成功且結果正確
        let SHAPES = ['swap', 'chain', 'new', 'newOld']
        let FAULTS = [
            { id: 'a1', tag: '(a) 引用端 save 整批 reject', mk: (w) => injectFault(w.users, 'save', { on: [1], mode: 'reject' }), main: 'untouched' },
            { id: 'a2', tag: '(a) 引用端 save 逐筆 ok:0(u3 失敗, u1／u2 已寫入=引用端部分寫入)', mk: (w) => injectFault(w.users, 'save', { on: [1], mode: 'ok0', ids: ['id-u3'] }), main: 'untouched' },
            { id: 'd1', tag: '(d) 主體 save(diff) 整批 reject', mk: (w) => injectFault(w.grups, 'save', { on: [1], mode: 'reject' }), main: 'afterInsert' },
            { id: 'c1', tag: '(c) 主體 insert 整批 reject', mk: (w) => injectFault(w.grups, 'insert', { on: [1], mode: 'reject' }), main: 'untouched', only: ['new', 'newOld'] },
        ]
        for (let shape of SHAPES) {
            for (let f of FAULTS) {
                if (f.only && !f.only.includes(shape)) {
                    continue
                }
                let o1 = (shape === 'newOld' && f.id === 'd1') ? ' [O1 結論: 屬 ADR-013 部分寫入限制之交互作用——insert 已寫入而 diff 失敗, 主體留有兩個 G1, 重送同一份資料被 renameCascadeDupGroup 守門 fail-closed 整次拒存(四表不變), 須人工清理多出之同名列後再存; 非補償缺陷]' : ''
                it(`RW-401 ${f.id} 形狀 ${shape} × ${f.tag} → 引用端逐位元還原(含 userIdUpdate／timeUpdate)、回 saveWriteFail、故障解除後重送同一份資料成功且結果正確${o1}`, async function() {
                    let rows = mkShape(shape)
                    let base = await cleanRun(rows)
                    let env = createEnv()
                    let { woItems, pc, logs } = env
                    let a0 = await authMap(woItems)
                    let snapU = woItems.users.snapshot()
                    let snapG = woItems.grups.snapshot()
                    let snapOther = [woItems.pemis.snapshot(), woItems.targets.snapshot()]
                    let ctl = f.mk(woItems)

                    //故障: 回 saveWriteFail(ORM 原文只入 srLog.raw, 不外送)
                    let r = await run(pc, 'grups', cloneDeep(rows))
                    assert.strict.deepEqual(r, ERR('saveWriteFail'))
                    assert.strict.equal(ctl.hit, 1, '故障確實被觸發一次')

                    //引用端: 逐位元還原為寫入前(含 userIdUpdate／timeUpdate); 其餘表未動
                    assert.strict.equal(woItems.users.snapshot(), snapU, '引用端須逐位元還原')
                    assert.strict.deepEqual([woItems.pemis.snapshot(), woItems.targets.snapshot()], snapOther)
                    let mainHasNewDup = f.main === 'afterInsert' && shape === 'newOld' //主體部分寫入後留有第二個 G1(歷史同名組, 授權取交集), 授權之變動來自主體而非引用端, 見下方限制說明
                    if (!mainHasNewDup) {
                        assert.strict.deepEqual(await authMap(woItems), a0, '還原後各使用者授權與寫入前相同')
                    }

                    //主體: 引用端先寫, 故引用端故障時主體零寫入; 主體故障時主體依步驟(ADR-013: del → insert → save 非交易)停在失敗步驟之前
                    if (f.main === 'untouched') {
                        assert.strict.equal(woItems.grups.snapshot(), snapG, '主體零寫入')
                        assert.strict.equal(writes(woItems.grups), 0)
                    }
                    else {
                        let hasNew = shape === 'new' || shape === 'newOld'
                        assert.strict.equal(woItems.grups.get('id-g1').name, 'G1', '主體之改名(diff)未寫入')
                        assert.strict.equal(woItems.grups.size(), hasNew ? 4 : 3, hasNew ? '[ADR-013 限制] 新增(insert)已寫入而 diff 失敗: 主體為部分寫入, 補償不還原主體' : '主體零寫入')
                    }

                    //srLog: 補償成功記 warn refCascade-restored; 原錯誤原文入 updateGrups-error.raw; 不得記 refCascade-done; 無個資
                    let lr = findLog(logs, 'refCascade-restored')
                    assert.strict.equal(lr.length, 1)
                    assert.strict.equal(lr[0].level, 'warn')
                    assert.strict.equal(lr[0].keyTable, 'grups')
                    assert.strict.equal(lr[0].holder, 'users')
                    assert.strict.ok(typeof lr[0].raw === 'string' && lr[0].raw.includes('failed to'), `refCascade-restored 須帶原錯誤原文 raw, 實得 ${lr[0].raw}`)
                    assert.strict.ok(!JSON.stringify(lr[0]).includes('id-u'), 'refCascade-restored 不記引用端 id(原文中之 id[…] 已遮罩)')
                    assert.strict.equal(findLog(logs, 'refCascade-done').length, 0)
                    assert.strict.equal(findLog(logs, 'refCascade-restore-error').length, 0)
                    let le = findLog(logs, 'updateGrups-error')
                    assert.strict.equal(le.length, 1)
                    assert.strict.equal(le[0].msg, 'saveWriteFail')
                    assert.strict.ok(typeof le[0].raw === 'string' && le[0].raw.includes('failed to'), `原錯誤須入 srLog.raw, 實得 ${le[0].raw}`)
                    assertNoPii(logs, env.seed)

                    //故障解除後重送同一份資料(同一操作者; 占位已釋放)
                    ctl.disarm()
                    let snapFail = snapAll(woItems)
                    let r2 = await run(pc, 'grups', cloneDeep(rows))
                    if (shape === 'newOld' && f.id === 'd1') {
                        //[ADR-013 限制之交互作用] 以舊名新增另一列之 insert 已成功而 diff 失敗 → 主體留有兩個 G1; 重送時 G1 仍被引用且屬歷史同名組,
                        //級聯之 renameCascadeDupGroup 守門(fail-closed)擋下: 容許成功(終態等同基準), 或被該守門整次拒存而四表逐位元不變; 不容許靜默寫出不一致之終態
                        if (r2.ok) {
                            assert.strict.equal(await viewOf(woItems), base.view)
                        }
                        else {
                            assert.strict.deepEqual(r2, ERR('renameCascadeDupGroup'))
                            assert.strict.equal(snapAll(woItems), snapFail, '被拒之重送不得改動任何表')
                        }
                        return
                    }
                    assert.strict.deepEqual(r2, OKR, `重送應成功, 實得 ${JSON.stringify(r2)}`)
                    assert.strict.equal(await viewOf(woItems), base.view, '重送後終態與無故障之基準相同(不是把引用換回舊名)')
                    assert.strict.deepEqual(Object.fromEntries((await woItems.users.select()).map((u) => [u.id, u.cgrups])), base.cg)
                    assert.strict.deepEqual(await authMap(woItems), a0, '互換／鏈式／新增後各使用者授權仍不變')
                })
            }
        }

        it('RW-402 (b) 刪除並改名: 主體 del 整批 reject → 引用端逐位元還原、主體零寫入、回 saveWriteFail; 重送成功且結果正確', async function() {
            let rows = mkShape('renDel')
            let base = await cleanRun(rows)
            let env = createEnv()
            let { woItems, pc } = env
            let snapU = woItems.users.snapshot()
            let snapG = woItems.grups.snapshot()
            let ctl = injectFault(woItems.grups, 'del', { on: [1], mode: 'reject' })
            assert.strict.deepEqual(await run(pc, 'grups', cloneDeep(rows)), ERR('saveWriteFail'))
            assert.strict.equal(woItems.users.snapshot(), snapU)
            assert.strict.equal(woItems.grups.snapshot(), snapG, 'del 為主體第一步, 失敗時主體零寫入')
            ctl.disarm()
            assert.strict.deepEqual(await run(pc, 'grups', cloneDeep(rows)), OKR)
            assert.strict.equal(await viewOf(woItems), base.view)
            assert.strict.deepEqual(parseOf(woItems, 'users', 'id-u1', 'cgrups'), { G1x: OR }, 'G1 改名、G2 清除')
        })

        it('RW-403 (b) 主體 del 逐筆 ok:0(目標列 id-g2 失敗)→ 同樣補償還原引用端、回 saveWriteFail; 重送成功且結果正確', async function() {
            let rows = mkShape('renDel')
            let base = await cleanRun(rows)
            let env = createEnv()
            let { woItems, pc } = env
            let snapU = woItems.users.snapshot()
            let ctl = injectFault(woItems.grups, 'del', { on: [1], mode: 'ok0', ids: ['id-g2'] })
            assert.strict.deepEqual(await run(pc, 'grups', cloneDeep(rows)), ERR('saveWriteFail'))
            assert.strict.equal(woItems.users.snapshot(), snapU)
            assert.strict.equal(woItems.grups.has('id-g2'), true)
            ctl.disarm()
            assert.strict.deepEqual(await run(pc, 'grups', cloneDeep(rows)), OKR)
            assert.strict.equal(await viewOf(woItems), base.view)
        })

        it('RW-404 (c) [ADR-013 限制] del 已成功而 insert 失敗 → 引用端已還原, 主體為部分寫入(g2 已刪、g1 未改名、新列未寫); 補償不還原主體; 回 saveWriteFail', async function() {
            let rows = mkShape('renDelNew')
            let env = createEnv()
            let { woItems, pc } = env
            let snapU = woItems.users.snapshot()
            let ctl = injectFault(woItems.grups, 'insert', { on: [1], mode: 'reject' })
            assert.strict.deepEqual(await run(pc, 'grups', cloneDeep(rows)), ERR('saveWriteFail'))
            assert.strict.equal(ctl.hit, 1)
            assert.strict.equal(woItems.users.snapshot(), snapU, '引用端已還原')
            assert.strict.equal(woItems.grups.has('id-g2'), false, '主體部分寫入: del 已生效')
            assert.strict.equal(woItems.grups.get('id-g1').name, 'G1', '主體部分寫入: 改名(diff)未生效')
            assert.strict.equal(woItems.grups.size(), 2, '主體部分寫入: 新列未寫')
        })

        it('RW-405 (c) [ADR-013 限制, 釘住現況] RW-404 之部分寫入後重送同一份資料: 成功, 但「已被部分刪除之 G2」之引用不再被偵測為刪除而殘留(懸空)——由稽核工具(authRefsAudit)列出, 非補償範圍', async function() {
            let rows = mkShape('renDelNew')
            let env = createEnv()
            let { woItems, pc } = env
            let ctl = injectFault(woItems.grups, 'insert', { on: [1], mode: 'reject' })
            assert.strict.deepEqual(await run(pc, 'grups', cloneDeep(rows)), ERR('saveWriteFail'))
            ctl.disarm()
            assert.strict.deepEqual(await run(pc, 'grups', cloneDeep(rows)), OKR)
            let u1 = parseOf(woItems, 'users', 'id-u1', 'cgrups')
            assert.strict.ok(hasOwn(u1, 'G1x'), 'G1 之改名級聯於重送時完成')
            assert.strict.ok(hasOwn(u1, 'G2'), '殘留之懸空引用(已知限制)')
        })

        it('RW-406 (d) [ADR-013 限制] 主體 save(diff) 逐筆 ok:0(g2 失敗而 g1 已寫入)→ 引用端已還原, 主體為部分寫入(g1 已改名 G1x、g2 未改); 回 saveWriteFail', async function() {
            let rows = edit(edit(seedRows().grups, 'id-g1', { name: 'G1x' }), 'id-g2', { name: 'G2x' })
            let env = createEnv()
            let { woItems, pc } = env
            let snapU = woItems.users.snapshot()
            let ctl = injectFault(woItems.grups, 'save', { on: [1], mode: 'ok0', ids: ['id-g2'] })
            assert.strict.deepEqual(await run(pc, 'grups', cloneDeep(rows)), ERR('saveWriteFail'))
            assert.strict.equal(ctl.hit, 1)
            assert.strict.equal(woItems.users.snapshot(), snapU, '引用端已還原')
            assert.strict.equal(woItems.grups.get('id-g1').name, 'G1x', '主體部分寫入: g1 已改名')
            assert.strict.equal(woItems.grups.get('id-g2').name, 'G2', '主體部分寫入: g2 未改名')
        })

        it('RW-407 引用端先寫、主體後寫之次序(P4): 主體 del 抵達之時, 引用端之 save 已完成(以呼叫序列釘住, 非僅終態)', async function() {
            let { woItems, pc } = createEnv()
            let order = []
            for (let [tab, m] of [['users', 'save'], ['grups', 'del'], ['grups', 'insert'], ['grups', 'save']]) {
                let f = woItems[tab][m]
                woItems[tab][m] = async (d, o) => {
                    order.push(`${tab}.${m}`)
                    return f(d, o)
                }
            }
            let rows = [...drop(edit(seedRows().grups, 'id-g1', { name: 'G1x' }), 'id-g2'), newRow('grups', 'Gnew')]
            assert.strict.deepEqual(await run(pc, 'grups', rows), OKR)
            assert.strict.deepEqual(order, ['users.save', 'grups.del', 'grups.insert', 'grups.save'], '引用端先寫, 再主體 del → insert → save')
        })

        //R4: 補償以寫入前整列整列覆寫(merge:false)還原, 歷史列若原無 userIdUpdate／timeUpdate, 寫入時新增之該二鍵亦被還原掉(合併寫入無法刪鍵)
        let stripAudit = (seed, ...ids) => {
            seed.users.forEach((u) => {
                if (ids.includes(u.id)) {
                    delete u.userIdUpdate
                    delete u.timeUpdate
                }
            })
            return seed
        }

        it('RW-412 R4 引用端歷史列原無 userIdUpdate／timeUpdate: 級聯寫入時新增該二鍵, 主體失敗補償成功後該列與寫入前逐位元相同(該二鍵仍不存在); 補償以整列覆寫(merge:false)', async function() {
            let env = createEnv({ seed: stripAudit(seedRows(), 'id-u1', 'id-u3') })
            let { woItems, pc } = env
            assert.strict.equal(hasOwn(woItems.users.get('id-u1'), 'userIdUpdate'), false, '前提: 歷史列原無稽核欄位')
            let before = snapAll(woItems)
            let calls = spyTable(woItems.users)
            let mid = null //主體失敗當下(補償前)之 u1: 證明級聯寫入確實新增了該二鍵(測項非空洞)
            woItems.grups.save = async () => {
                mid = woItems.users.get('id-u1')
                return Promise.reject('simulated main save reject')
            }
            assert.strict.deepEqual(await run(pc, 'grups', edit(await rowsOf(woItems, 'grups'), 'id-g1', { name: 'G1x' })), ERR('saveWriteFail'))
            assert.strict.equal(mid.userIdUpdate, 'id-admin', '補償前: 級聯寫入已新增 userIdUpdate')
            assert.strict.equal(typeof mid.timeUpdate, 'string')
            assert.strict.equal(snapAll(woItems), before, '四表(含 users)逐位元回到寫入前')
            for (let id of ['id-u1', 'id-u3']) {
                let u = woItems.users.get(id)
                assert.strict.ok(!hasOwn(u, 'userIdUpdate') && !hasOwn(u, 'timeUpdate'), `${id}: 補償後該二鍵仍不存在`)
            }
            //perm-run01: 第 1 次(級聯寫入)原 option 為 undefined(合併、可插入); 引用端 save 改帶 procOrm { mustExist: true }(只改不增, R-ONLYMOD-01), w-serv-orm 轉為 wo.save(data, { autoInsert: false })——仍是合併寫入(無 merge:false), 且禁止插入
            assert.strict.deepEqual(calls.map((c) => [c.m, c.option]), [['save', { autoInsert: false }], ['save', { merge: false }]], '第 1 次為級聯寫入(合併、只改不增)、第 2 次為補償(整列覆寫)')
        })

        it('RW-413 R4 兩位引用者皆缺稽核欄位, 第一次 save 一位成功一位 ok:0, 補償全成功 → 四表完整快照回到寫入前原值', async function() {
            let env = createEnv({ seed: stripAudit(seedRows(), 'id-u1', 'id-u3') })
            let { woItems, pc } = env
            let before = snapAll(woItems)
            let ctl = injectFault(woItems.users, 'save', { on: [1], mode: 'ok0', ids: ['id-u3'] })
            assert.strict.deepEqual(await run(pc, 'grups', edit(await rowsOf(woItems, 'grups'), 'id-g1', { name: 'G1x' })), ERR('saveWriteFail'))
            assert.strict.equal(ctl.hit, 1)
            assert.strict.deepEqual(ctl.calls.map((c) => c.ids.slice().sort()), [['id-u1', 'id-u3'], ['id-u1', 'id-u3']], '級聯寫入與補償各一次, 皆含兩位引用者')
            assert.strict.deepEqual(ctl.calls[1].option, { merge: false })
            assert.strict.equal(snapAll(woItems), before, '四表完整快照回到寫入前')
            assert.strict.equal(writes(woItems.grups), 0, '主體零寫入')
        })

        //R5: 引用端寫入階段之錯誤原文可能含引用端(使用者) id(ORM 逐筆失敗訊息 id[…]), 外層(procCore)會把 raw 記入 srLog, 故補償成功後重新拋出前遮罩; 主體階段之錯誤(群組／權限／標的主鍵, 非個資)原樣
        it('RW-414 R5 使用者 id 為 private-holder-id(引用 G1)、G1→G1x、users.save 第 1 次逐筆 ok:0 第 2 次(補償)成功 → 整份 srLog 不含 private-holder-id 字面(updateGrups-error.raw 與 refCascade-restored.raw 皆遮罩為 id[*])', async function() {
            let env = createEnv({ seed: addUsers(seedRows(), { id: 'private-holder-id', cgrups: J({ G1: OR }) }) })
            let { woItems, pc, logs } = env
            let ctl = injectFault(woItems.users, 'save', { on: [1], mode: 'ok0', ids: ['private-holder-id'] })
            assert.strict.deepEqual(await run(pc, 'grups', edit(await rowsOf(woItems, 'grups'), 'id-g1', { name: 'G1x' })), ERR('saveWriteFail'))
            assert.strict.equal(ctl.hit, 1)
            let s = JSON.stringify(logs)
            assert.strict.ok(!s.includes('private-holder-id'), `srLog 不得含引用端 id 字面: ${s.slice(0, 500)}`)
            assert.strict.equal(findLog(logs, 'updateGrups-error')[0].raw, 'failed to save data: id[*]', '外層 raw 為遮罩後之原錯誤')
            assert.strict.equal(findLog(logs, 'refCascade-restored')[0].raw, 'failed to save data: id[*]')
        })

        it('RW-415 R5 主體寫入階段之錯誤原樣(含群組 id): g2 之 save 逐筆 ok:0 → updateGrups-error.raw 含 id[id-g2]; 同一事件之 refCascade-restored.raw 仍遮罩(id[*]); [ADR-013 部分寫入: g1 已改名]', async function() {
            let env = createEnv()
            let { woItems, pc, logs } = env
            let rows = edit(edit(seedRows().grups, 'id-g1', { name: 'G1x' }), 'id-g2', { name: 'G2x' })
            injectFault(woItems.grups, 'save', { on: [1], mode: 'ok0', ids: ['id-g2'] })
            assert.strict.deepEqual(await run(pc, 'grups', cloneDeep(rows)), ERR('saveWriteFail'))
            assert.strict.ok(/id\[id-g2\]/.test(findLog(logs, 'updateGrups-error')[0].raw), `主體階段錯誤原樣(含群組 id), 實得 ${findLog(logs, 'updateGrups-error')[0].raw}`)
            assert.strict.ok(!/id\[id-g2\]/.test(findLog(logs, 'refCascade-restored')[0].raw), 'refCascade-restored.raw 恆遮罩')
        })

        //外審 sol 增量 D1: 引用端 id 含 ']' 時通則正則 /id\[[^\]]*\]/ 在 id 內第一個 ']' 即結束而殘留後半段個資; 須先以「已知引用端 id 之完整字面」id[<id>] → id[*] 遮罩
        let noSecret = (logs, w) => {
            let s = JSON.stringify(logs)
            for (let secret of w.secrets) {
                assert.strict.ok(!s.includes(JSON.stringify(secret).slice(1, -1)), `srLog 不得含 ${JSON.stringify(secret)}`)
            }
            assert.strict.ok(!s.includes(JSON.stringify(w.id).slice(1, -1)), `srLog 不得含引用端 id 字面 ${JSON.stringify(w.id)}`)
        }

        for (let w of WEIRD_IDS) {
            it(`RW-416 引用端 id 為 ${JSON.stringify(w.id)}(引用 G1)、G1→G1x、users.save 第 1 次逐筆 ok:0(ORM 錯誤 id[<原 id>])、補償成功 → 整份 srLog 不含 id 內之個資片段; refCascade-restored.raw 與 updateGrups-error.raw 皆為 failed to save data: id[*]`, async function() {
                let env = createEnv({ seed: addUsers(seedRows(), { id: w.id, cgrups: J({ G1: OR }) }) })
                let { woItems, pc, logs } = env
                let ctl = injectFault(woItems.users, 'save', { on: [1], mode: 'ok0', ids: [w.id] })
                assert.strict.deepEqual(await run(pc, 'grups', edit(await rowsOf(woItems, 'grups'), 'id-g1', { name: 'G1x' })), ERR('saveWriteFail'))
                assert.strict.equal(ctl.hit, 1)
                noSecret(logs, w)
                assert.strict.equal(findLog(logs, 'refCascade-restored')[0].raw, 'failed to save data: id[*]')
                assert.strict.equal(findLog(logs, 'updateGrups-error')[0].raw, 'failed to save data: id[*]')
            })
        }

        for (let w of WEIRD_IDS) {
            for (let kind of ['string', 'Error']) {
                it(`RW-417 雙重故障(補償亦失敗, 補償錯誤為${kind}且文字含 id[<原 id>]), 引用端 id 為 ${JSON.stringify(w.id)} → refCascade-restore-error.raw／rawRestore 皆遮罩; 回 saveCascadePartial; srLog 不含個資片段`, async function() {
                    let env = createEnv({ seed: addUsers(seedRows(), { id: w.id, cgrups: J({ G1: OR }) }) })
                    let { woItems, pc, logs } = env
                    let orig = woItems.users.save
                    let n = 0
                    woItems.users.save = async (data, option) => {
                        n++
                        if (n === 1) { //引用端寫入: 該列 ok:0(其餘已寫入)
                            let ds0 = Array.isArray(data) ? data : [data]
                            let rsOk = await orig(ds0.filter((v) => v.id !== w.id), option)
                            let it = 0
                            return ds0.map((v) => (v.id === w.id ? { n: 1, ok: 0, err: 'simulated save fail' } : rsOk[it++]))
                        }
                        let msg = `restore failed: id[${w.id}]` //補償亦失敗
                        return Promise.reject(kind === 'Error' ? new Error(msg) : msg)
                    }
                    assert.strict.deepEqual(await run(pc, 'grups', edit(await rowsOf(woItems, 'grups'), 'id-g1', { name: 'G1x' })), ERR('saveCascadePartial'))
                    let le = findLog(logs, 'refCascade-restore-error')
                    assert.strict.equal(le.length, 1)
                    assert.strict.equal(le[0].raw, 'failed to save data: id[*]')
                    assert.strict.equal(le[0].rawRestore, 'restore failed: id[*]')
                    noSecret(logs, w)
                })
            }
        }

        //外審 sol R7(run07): ORM 之逐筆失敗訊息(w-serv-orm getMapOrm.getMsgFail)把「超過 100 字元」之主鍵截斷為 99 字元加「…」(lodash truncate length:100 omission:'…')再包成 id[...];
        //截斷後之字面不等於完整 id, 故只以「完整 id 之字面」遮罩時含 ']' 之長 id 會殘留(通則正則只遮到第一個 ']'). 規格: R-REF-CASCADE-01 第 4、8 條「引用端 id 遮罩後才拋出／不記引用端 id」; 引用端 id 之任何片段不得出現於 srLog 與重新拋出之錯誤.
        //錯誤文字由真 procOrm(getMapOrm → getProc)於「users.save 逐筆 ok:0」時自行產生(非手寫字串), 故截斷行為以套件現況為準
        const LONG_IDS = [
            { tag: '含 ] 之長 id(前綴 15 字元 + 120 個 z)', id: `prefix]PRIVATE-${'z'.repeat(120)}`, secrets: ['PRIVATE', 'prefix]', 'z'.repeat(10)] },
            { tag: '純長 id(無 ], 138 字元)', id: `PRIVATE-${'z'.repeat(130)}`, secrets: ['PRIVATE', 'z'.repeat(10)] },
            { tag: '含 ] 且恰 100 字元(邊界: 不截斷)', id: `prefix]PRIVATE-${'z'.repeat(85)}`, secrets: ['PRIVATE', 'prefix]', 'z'.repeat(10)] },
            { tag: '含 ] 且 101 字元(邊界: 截斷為 99 字元加「…」)', id: `prefix]PRIVATE-${'z'.repeat(86)}`, secrets: ['PRIVATE', 'prefix]', 'z'.repeat(10)] },
        ]
        let noLeakLong = (x, w) => {
            let s = typeof x === 'string' ? x : JSON.stringify(x)
            for (let secret of [...w.secrets, w.id, w.id.slice(0, 30)]) {
                assert.strict.ok(!s.includes(secret), `不得含 ${JSON.stringify(secret.slice(0, 40))}: ${s.slice(0, 300)}`)
            }
        }
        it('RW-421p 前提: 夾具長 id 之字元數為 135／138／100／101(ORM 於超過 100 字元才截斷為 99 字元加「…」, 故前二者與第四者被截斷、第三者恰不截斷)', function() {
            assert.strict.deepEqual(LONG_IDS.map((w) => w.id.length), [135, 138, 100, 101])
        })

        for (let w of LONG_IDS) {
            it(`RW-421 引用端 id 為${w.tag}, 引用 G1、G1→G1x、users.save 第 1 次逐筆 ok:0(真 ORM 產生之錯誤含 id[<原 id 或其截斷形式>])、補償成功 → srLog 不含 id 任何片段; refCascade-restored.raw 與 updateGrups-error.raw 皆為 failed to save data: id[*]`, async function() {
                let env = createEnv({ seed: addUsers(seedRows(), { id: w.id, cgrups: J({ G1: OR }) }) })
                let { woItems, pc, logs } = env
                let ctl = injectFault(woItems.users, 'save', { on: [1], mode: 'ok0', ids: [w.id] })
                assert.strict.deepEqual(await run(pc, 'grups', edit(await rowsOf(woItems, 'grups'), 'id-g1', { name: 'G1x' })), ERR('saveWriteFail'))
                assert.strict.equal(ctl.hit, 1)
                noLeakLong(logs, w)
                assert.strict.equal(findLog(logs, 'refCascade-restored')[0].raw, 'failed to save data: id[*]')
                assert.strict.equal(findLog(logs, 'updateGrups-error')[0].raw, 'failed to save data: id[*]')
            })

            it(`RW-422 writeWithCascade 直接(真 procOrm 產生錯誤), 引用端 id 為${w.tag} → 重新拋出之錯誤(取其 message／字串)與 srLog 皆不含 id 任何片段, 且為 failed to save data: id[*]`, async function() {
                let env = createEnv({ seed: addUsers(seedRows(), { id: w.id, cgrups: J({ G1: OR }) }) })
                let { woItems, logs } = env
                injectFault(woItems.users, 'save', { on: [1], mode: 'ok0', ids: [w.id] })
                let holdersOld = await woItems.users.select()
                let rowsOld = await woItems.grups.select()
                let rowsNew = edit(rowsOld, 'id-g1', { name: 'G1x' })
                let plan = planRefChanges({ keyTable: 'grups', rowsOld, rowsNew, holdersOld })
                assert.strict.ok(plan.changes.some((c) => c.id === w.id), '前提: 該長 id 使用者為引用端改寫列')
                let { srLog, logs: logs2 } = mkSrLog()
                let e = await writeWithCascade({ plan, holdersOld, woItems, procOrm: env.core.procOrm, userId: 'id-op', srLog, writeMain: async () => 'MAIN' }).then(() => 'RESOLVED', (err) => err) //perm-run01: 原 mkProcOrm(ds, woItems) 改 env.core.procOrm(mkCore 之真 procOrm, 同一組替身表)
                assert.strict.notEqual(e, 'RESOLVED')
                let msg = (typeof e === 'string') ? e : e.message
                assert.strict.equal(msg, 'failed to save data: id[*]')
                noLeakLong(String(e), w)
                noLeakLong(e instanceof Error ? e.stack : '', w)
                noLeakLong(logs2, w)
                noLeakLong(logs, w)
            })
        }

        it('RW-423 兩位引用端 id 互為前綴且皆被截斷(長 id A 與 A+40 個 y 截斷後字面相同)同時失敗 → 兩個 id[...] 皆遮罩, 無片段殘留', async function() {
            let A = `prefix]PRIVATE-${'z'.repeat(120)}`
            let B = `${A}${'y'.repeat(40)}`
            let env = createEnv({ seed: addUsers(seedRows(), { id: A, cgrups: J({ G1: OR }) }, { id: B, cgrups: J({ G1: OR }) }) })
            let { woItems, pc, logs } = env
            let ctl = injectFault(woItems.users, 'save', { on: [1], mode: 'ok0', ids: [A, B] })
            assert.strict.deepEqual(await run(pc, 'grups', edit(await rowsOf(woItems, 'grups'), 'id-g1', { name: 'G1x' })), ERR('saveWriteFail'))
            assert.strict.equal(ctl.hit, 1)
            noLeakLong(logs, { id: A, secrets: ['PRIVATE', 'prefix]', 'y'.repeat(10), 'z'.repeat(10)] })
            assert.strict.equal(findLog(logs, 'refCascade-restored')[0].raw, 'failed to save data: id[*], id[*]')
        })

        it('RW-424 長 id 之截斷形式含 ] 而另一短 id 為其前綴(短 a]b 與長 a]bPRIVATE… 同時失敗)→ 兩個 id[...] 皆遮罩(只用通則正則會殘留 b]PRIVATE…)', async function() {
            let S = 'a]b'
            let L = `a]bPRIVATE-${'c'.repeat(120)}`
            let env = createEnv({ seed: addUsers(seedRows(), { id: S, cgrups: J({ G1: OR }) }, { id: L, cgrups: J({ G1: OR }) }) })
            let { woItems, pc, logs } = env
            let ctl = injectFault(woItems.users, 'save', { on: [1], mode: 'ok0', ids: [S, L] })
            assert.strict.deepEqual(await run(pc, 'grups', edit(await rowsOf(woItems, 'grups'), 'id-g1', { name: 'G1x' })), ERR('saveWriteFail'))
            assert.strict.equal(ctl.hit, 1)
            let s = JSON.stringify(logs)
            assert.strict.ok(!s.includes('PRIVATE') && !s.includes('c'.repeat(10)) && !s.includes('a]b'), `srLog 不得含任何 id 片段: ${s.slice(0, 300)}`)
            assert.strict.equal(findLog(logs, 'refCascade-restored')[0].raw, 'failed to save data: id[*], id[*]')
            assert.strict.equal(findLog(logs, 'updateGrups-error')[0].raw, 'failed to save data: id[*], id[*]')
        })

        //(e) 補償本身失敗(雙重故障)
        //rawRestore: 補償錯誤原文須入 srLog.rawRestore(e1／e3 為注入之 reject 字樣; e2 為逐筆 ok:0, 無例外文字, 只要求非空)
        let DOUBLE = [
            { id: 'e1', tag: '補償 save 整批 reject', mk: (w) => injectFault(w.users, 'save', { on: [2], mode: 'reject' }), cascaded: ['id-u1', 'id-u2', 'id-u3'], rawRestore: /simulated save reject #2/ },
            { id: 'e2', tag: '補償 save 逐筆 ok:0(u1 還原失敗, u2／u3 已還原)', mk: (w) => injectFault(w.users, 'save', { on: [2], mode: 'ok0', ids: ['id-u1'] }), cascaded: ['id-u1'], rawRestore: /./ },
            { id: 'e3', tag: '引用端寫入部分失敗(u3 ok:0, u1／u2 已寫)且補償 reject', mk: (w) => injectFault(w.users, 'save', { on: [1, 2], mode: 'mix' }), cascaded: ['id-u1', 'id-u2'], rawRestore: /simulated restore reject/ },
        ]
        //runDouble: 互換形狀(u1／u2／u3 三位引用端受影響); 引用端第 1 次 save 為級聯寫入、第 2 次為補償; 另令主體 save 失敗以觸發補償(e3 改以引用端寫入部分失敗觸發)
        let runDouble = async (f) => {
            let rows = mkShape('swap')
            let base = await cleanRun(rows)
            let env = createEnv()
            let { woItems, pc } = env
            let snapU = Object.fromEntries((await woItems.users.select()).map((u) => [u.id, u.cgrups]))
            let snapG = woItems.grups.snapshot()
            injectFault(woItems.grups, 'save', { on: [1], mode: 'reject' }) //主體失敗(觸發補償)
            if (f.id === 'e3') {
                //e3: 第 1 次(引用端寫入)u3 ok:0(u1／u2 已寫入)→ 以「引用端寫入失敗」觸發補償, 補償(第 2 次)reject; 主體不會被執行
                let orig = woItems.users.save
                let n = 0
                woItems.users.save = async (data) => {
                    n++
                    if (n === 1) {
                        let ds0 = Array.isArray(data) ? data : [data]
                        let okItems = ds0.filter((v) => v.id !== 'id-u3')
                        let rsOk = await orig(okItems)
                        let it = 0
                        return ds0.map((v) => (v.id === 'id-u3' ? { n: 1, ok: 0, err: 'simulated save fail' } : rsOk[it++]))
                    }
                    return Promise.reject('simulated restore reject')
                }
            }
            else {
                f.mk(woItems)
            }
            let r = await run(pc, 'grups', cloneDeep(rows))
            return { r, env, base, snapU, snapG }
        }
        for (let f of DOUBLE) {
            it(`RW-411 ${f.id} 雙重故障: 補償失敗不得吞掉原錯誤之記錄——引起補償之原錯誤(ORM 之 failed to save／insert／delete data)須仍可自 srLog 查得(規則帳本 R-REF-CASCADE-01 規則 4: 後重新拋出原錯誤; 對外雖為 saveCascadePartial, 但原文須入 srLog 供稽核)`, async function() {
                let { r, env } = await runDouble(f)
                assert.strict.deepEqual(r, ERR('saveCascadePartial'))
                let s = JSON.stringify(env.logs)
                assert.strict.ok(/failed to (save|insert|delete) data/.test(s), `原錯誤須記入 srLog(補償失敗不得吞掉原錯誤之記錄); srLog=${s.slice(0, 600)}`)
                //refCascade-restore-error: raw 含原錯誤(遮罩後: 原文之 id[…] 為引用端 id, 一律 id[*]), rawRestore 含補償錯誤
                let le = env.logs.find((l) => l.event === 'refCascade-restore-error')
                assert.strict.ok(le, '應有 refCascade-restore-error')
                assert.strict.ok(typeof le.raw === 'string' && /failed to (save|insert|delete) data/.test(le.raw), `raw 須含原錯誤, 實得 ${le.raw}`)
                assert.strict.ok(typeof le.rawRestore === 'string' && f.rawRestore.test(le.rawRestore), `rawRestore 須含補償錯誤, 實得 ${le.rawRestore}`)
                //不記引用端 id: log 內容(整份)不含引用端 id 字面(e3 之原錯誤文字本含 id[id-u3], 遮罩為 id[*])
                for (let id of ['id-u1', 'id-u2', 'id-u3']) {
                    assert.strict.ok(!s.includes(id), `srLog 不得含引用端 id ${id}`)
                }
                if (f.id === 'e3') {
                    assert.strict.ok(/id\[\*\]/.test(le.raw), `e3 之原錯誤含 id[…], 須遮罩為 id[*], 實得 ${le.raw}`)
                }
            })

            it(`RW-408 ${f.id} 雙重故障: 主體 save 失敗且${f.tag} → 回 saveCascadePartial、srLog 有 refCascade-restore-error(帶表名與列數、無個資與引用端 id)、引用端停在補償失敗之狀態、主體零寫入`, async function() {
                let { r, env, base, snapU, snapG } = await runDouble(f)
                let { woItems, logs } = env
                assert.strict.deepEqual(r, ERR('saveCascadePartial'))
                //srLog: refCascade-restore-error(error 級), 不得記 restored／done
                let lr = findLog(logs, 'refCascade-restore-error')
                assert.strict.equal(lr.length, 1)
                assert.strict.equal(lr[0].level, 'error')
                assert.strict.equal(lr[0].keyTable, 'grups')
                assert.strict.equal(lr[0].holder, 'users')
                assert.strict.equal(lr[0].nHolders, 3, '帶受影響列數')
                assert.strict.equal(findLog(logs, 'refCascade-restored').length, 0)
                assert.strict.equal(findLog(logs, 'refCascade-done').length, 0)
                assert.strict.ok(logs.some((l) => l.event === 'updateGrups-error' && l.msg === 'saveCascadePartial'), '集中 errLog 記 saveCascadePartial')
                assertNoPii(logs, env.seed)
                for (let id of ['id-u1', 'id-u2', 'id-u3']) {
                    assert.strict.ok(!JSON.stringify(lr[0]).includes(id), '不記引用端 id')
                }
                //引用端停在補償失敗之狀態(未還原者保有級聯後之值; 稽核工具 authRefsAudit 列出後人工處置); 主體零寫入
                let cg = Object.fromEntries((await woItems.users.select()).map((u) => [u.id, u.cgrups]))
                for (let id of ['id-u1', 'id-u2', 'id-u3']) {
                    assert.strict.equal(cg[id], f.cascaded.includes(id) ? base.cg[id] : snapU[id], `${id}: ${f.cascaded.includes(id) ? '補償失敗而留在級聯後之值' : '已還原或未寫'}`)
                }
                assert.strict.equal(woItems.grups.snapshot(), snapG)
            })
        }

        //(f) 成功 log
        let doneOf = (logs) => {
            let ls = logs.filter((l) => l.event === 'refCascade-done')
            assert.strict.equal(ls.length, 1, '成功應恰記一筆 refCascade-done')
            return ls[0]
        }
        let pickDone = (l) => ({ keyTable: l.keyTable, holder: l.holder, nRename: l.nRename, nDelName: l.nDelName, nHolders: l.nHolders, nRenameHolders: l.nRenameHolders, nDelHolders: l.nDelHolders, nExternal: l.nExternal })
        let DONE = [
            { tag: '改名 G1→G1x', table: 'grups', mk: (rs) => edit(rs, 'id-g1', { name: 'G1x' }), exp: { keyTable: 'grups', holder: 'users', nRename: 1, nDelName: 0, nHolders: 2, nRenameHolders: 2, nDelHolders: 0, nExternal: 0 } },
            { tag: '刪除 G2(u2 為外部來源)', table: 'grups', mk: (rs) => drop(rs, 'id-g2'), exp: { keyTable: 'grups', holder: 'users', nRename: 0, nDelName: 1, nHolders: 2, nRenameHolders: 0, nDelHolders: 2, nExternal: 1 } },
            { tag: '改名 G1→G1x 並刪除 G2', table: 'grups', mk: (rs) => drop(edit(rs, 'id-g1', { name: 'G1x' }), 'id-g2'), exp: { keyTable: 'grups', holder: 'users', nRename: 1, nDelName: 1, nHolders: 3, nRenameHolders: 2, nDelHolders: 2, nExternal: 1 } },
            { tag: '互換 G1↔G2', table: 'grups', mk: (rs) => edit(edit(rs, 'id-g1', { name: 'G2' }), 'id-g2', { name: 'G1' }), exp: { keyTable: 'grups', holder: 'users', nRename: 2, nDelName: 0, nHolders: 3, nRenameHolders: 3, nDelHolders: 0, nExternal: 1 } },
            { tag: '刪除權限 P3', table: 'pemis', mk: (rs) => drop(rs, 'id-p3'), exp: { keyTable: 'pemis', holder: 'grups', nRename: 0, nDelName: 1, nHolders: 2, nRenameHolders: 0, nDelHolders: 2, nExternal: 0 } },
            { tag: '改名權限 P1→P1x', table: 'pemis', mk: (rs) => edit(rs, 'id-p1', { name: 'P1x' }), exp: { keyTable: 'pemis', holder: 'grups', nRename: 1, nDelName: 0, nHolders: 2, nRenameHolders: 2, nDelHolders: 0, nExternal: 0 } },
            { tag: '刪除標的 T2', table: 'targets', mk: (rs) => drop(rs, T2), exp: { keyTable: 'targets', holder: 'pemis', nRename: 0, nDelName: 1, nHolders: 2, nRenameHolders: 0, nDelHolders: 2, nExternal: 0 } },
        ]
        for (let d of DONE) {
            it(`RW-409 成功時 srLog 記 refCascade-done 且計數正確: ${d.tag}; 不含引用端 id 與個資`, async function() {
                let env = createEnv()
                let { woItems, pc, logs } = env
                assert.strict.deepEqual(await run(pc, d.table, d.mk(await rowsOf(woItems, d.table))), OKR)
                let l = doneOf(logs)
                assert.strict.equal(l.level, 'info')
                assert.strict.deepEqual(pickDone(l), d.exp)
                assert.strict.equal(l.userId, 'id-admin')
                let s = JSON.stringify(l)
                assertNoPii([l], env.seed)
                for (let id of ['id-u1', 'id-u2', 'id-u3', 'id-u4', 'id-u5', 'id-g1', 'id-g2', 'id-g3', 'id-p1', 'id-p2', 'id-p3']) {
                    assert.strict.ok(!s.includes(`"${id}"`), `refCascade-done 不得含引用端 id ${id}`)
                }
                assert.strict.equal(logs.filter((x) => x.event === `${FN[d.table]}-success`).length, 1)
                assert.strict.equal(logs.filter((x) => x.event === 'refCascade-restored' || x.event === 'refCascade-restore-error').length, 0)
            })
        }

        it('RW-410 無改名無刪除之成功儲存 → 不記 refCascade-done(無引用連帶)', async function() {
            let { woItems, pc, logs } = createEnv()
            let rows = edit(await rowsOf(woItems, 'grups'), 'id-g1', { description: 'changed' })
            assert.strict.deepEqual(await run(pc, 'grups', rows), OKR)
            assert.strict.equal(logs.filter((l) => l.event === 'refCascade-done').length, 0)
        })

    })

    // =====================================================================
    // 族 5: 鎖(withTabLocks 單元、取鎖軌跡與分段取鎖、並行、站點不變式; RW-5xx)
    // =====================================================================
    describe('族 5 鎖(R-WRITE-LOCK-02)', function() {

        const RANK = { targets: 0, pemis: 1, grups: 2, users: 3 }
        const ORDER = ['targets', 'pemis', 'grups', 'users']
        //perm-run01: 原 K(t)＝tabWriteKey(t)(kmx 之鍵)與 traceKmx(假 kmx 記 `acq <鍵>`／`rel <鍵>`)——套內鎖鍵已移除, 鎖管理器改為 w-serv-orm 實例之 withTabLocks(tableNames, fn)(每表一鍵, 以表名取鎖):
        //  freshCore: 全新之真鎖(四表空替身); traceLockTabs(real): 記錄 `acq <表名>`／`rel <表名>` 之假 lockTabs(tableNames, fn)——real 給了則記錄後呼叫真的(互斥照常), 不給則直接執行 fn
        //  (供階層外表名之案例: 真鎖只認本實例之資料表, 拼錯表名即拋錯)
        let freshCore = () => mkCore(ds, Object.fromEntries(TABLE_KEYS.map((k) => [k, mkTable([])])))
        let traceLockTabs = (real = null) => {
            let log = []
            let lockTabs = async (tableNames, fn) => {
                tableNames.forEach((t) => log.push(`acq ${t}`))
                try {
                    return await (real !== null ? real(tableNames, fn) : fn())
                }
                finally {
                    ;[...tableNames].reverse().forEach((t) => log.push(`rel ${t}`))
                }
            }
            return { lockTabs, log }
        }
        let acqOf = (log) => log.filter((x) => x.startsWith('acq ')).map((x) => x.slice(4))

        let permutations = (arr) => {
            if (arr.length <= 1) {
                return [arr]
            }
            let rs = []
            arr.forEach((v, k) => {
                permutations([...arr.slice(0, k), ...arr.slice(k + 1)]).forEach((p) => rs.push([v, ...p]))
            })
            return rs
        }

        //expectViolation: held 守門須拋 tab lock order violation(同步拋或 reject 皆可), 且 fn 未被呼叫、未取任何鎖
        let expectViolation = async (keyTables, held) => {
            let { lockTabs, log } = traceLockTabs(freshCore().withTabLocks)
            let called = false
            let err = null
            try {
                await withTabLocks(lockTabs, keyTables, async () => {
                    called = true
                }, held)
            }
            catch (e) {
                err = e
            }
            assert.strict.ok(err instanceof Error && err.message === 'tab lock order violation', `held=${held} 再取 ${keyTables} 應拋 tab lock order violation, 實得 ${err}`)
            assert.strict.equal(called, false, 'fn 不得被呼叫')
            assert.strict.deepEqual(log, [], '不得取任何鎖')
        }

        describe('withTabLocks 單元', function() {

            it('RW-501 取鎖次序恆為 targets < pemis < grups < users, 與輸入順序無關(四表 24 種排列皆同)', async function() {
                for (let perm of permutations(ORDER)) {
                    let { lockTabs, log } = traceLockTabs(freshCore().withTabLocks)
                    await withTabLocks(lockTabs, perm, async () => {
                        log.push('fn')
                    })
                    assert.strict.deepEqual(acqOf(log), ORDER, `輸入 ${perm}`)
                    assert.strict.deepEqual(log, [...ORDER.map((t) => `acq ${t}`), 'fn', ...[...ORDER].reverse().map((t) => `rel ${t}`)], '由外而內巢狀: 先取者後放')
                }
            })

            it('RW-502 子集之次序同階層、表名去重(同一把鎖不重複取, 否則表鎖非可重入而死結)', async function() {
                let cases = [
                    [['users', 'grups'], ['grups', 'users']],
                    [['pemis', 'targets', 'pemis'], ['targets', 'pemis']],
                    [['users', 'users', 'users'], ['users']],
                    [['grups', 'grups'], ['grups']],
                    [['users', 'targets'], ['targets', 'users']],
                    [[], []],
                ]
                for (let [inp, exp] of cases) {
                    let { lockTabs, log } = traceLockTabs(freshCore().withTabLocks)
                    await withTimeout(withTabLocks(lockTabs, inp, async () => {}), 5000, `去重 輸入 ${JSON.stringify(inp)}`) //記錄器內仍呼叫真鎖: 未去重即同表巢狀取兩次而死結, 以 5 秒逾時偵測(而非拖到 mocha 逾時)
                    assert.strict.deepEqual(acqOf(log), exp, `輸入 ${JSON.stringify(inp)}`)
                }
                //真鎖: 重複表名不得死結(keyCheck 逐表巢狀呼叫真 withTabLocks([t]); 未去重即同一把鎖巢狀取兩次)
                let core = freshCore()
                await withTimeout(withTabLocks(core.withTabLocks, ['grups', 'grups', 'users', 'users'], async () => 'ok'), 5000, 'dedupe')
            })

            it('RW-503 階層外之表名排在階層內之後、彼此依字典序; 原型鍵名(constructor／__proto__／toString)不被誤判為階層內之表', async function() {
                //階層外表名真鎖不認(只認本實例資料表), 故此案用純記錄之 lockTabs(不呼叫真鎖), 只驗 keyCheck 的取鎖次序
                let { lockTabs, log } = traceLockTabs()
                await withTabLocks(lockTabs, ['zzz', 'constructor', 'users', '__proto__', 'aaa', 'toString', 'targets'], async () => {})
                assert.strict.deepEqual(acqOf(log), ['targets', 'users', '__proto__', 'aaa', 'constructor', 'toString', 'zzz'])
            })

            it('RW-504 回傳 fn 之結果; fn reject 之值原樣 bubble', async function() {
                let lockTabs = freshCore().withTabLocks
                assert.strict.equal(await withTabLocks(lockTabs, ['grups'], async () => 'RESULT'), 'RESULT')
                let sentinel = { x: 1 }
                let got = await withTabLocks(lockTabs, ['grups'], async () => Promise.reject(sentinel)).then(() => null, (e) => e)
                assert.strict.equal(got, sentinel)
            })

            //held 守門: held 之階層為上限, 其後再取者須階層全數更高(R-WRITE-LOCK-02)
            it('RW-505 held 守門(窮舉四表 × 四表): held 含階層 h 時, 再取 r 當 rank(r) <= rank(h) 即拋 tab lock order violation 且不取任何鎖; 否則取該表之鎖並執行 fn', async function() {
                for (let h of ORDER) {
                    for (let r of ORDER) {
                        if (RANK[r] <= RANK[h]) {
                            await expectViolation([r], [h])
                        }
                        else {
                            let { lockTabs, log } = traceLockTabs(freshCore().withTabLocks)
                            let v = await withTabLocks(lockTabs, [r], async () => 'ran', [h])
                            assert.strict.equal(v, 'ran')
                            assert.strict.deepEqual(acqOf(log), [r], `held=${h} 再取 ${r}`)
                        }
                    }
                }
            })

            it('RW-506 held 含 grups 時再取 pemis 或 grups 皆拋(明文情境); 再取 users 可; 多表請求中任一表階層不夠高即整體拒', async function() {
                await expectViolation(['pemis'], ['grups'])
                await expectViolation(['grups'], ['grups'])
                await expectViolation(['targets'], ['grups'])
                await expectViolation(['users', 'pemis'], ['grups']) //混入階層不夠高者
                await expectViolation(['users', 'grups'], ['grups'])
                await expectViolation(['users'], ['users']) //同鍵巢狀即死結, 守門須擋
                await expectViolation(['grups'], ['pemis', 'grups']) //多個 held 取最高者
                await expectViolation(['pemis', 'users'], ['pemis', 'grups'])
                let { lockTabs, log } = traceLockTabs(freshCore().withTabLocks)
                await withTabLocks(lockTabs, ['users'], async () => {}, ['pemis', 'grups'])
                assert.strict.deepEqual(acqOf(log), ['users'])
            })

            it('RW-507 held 為階層外之表名時: 階層外表視為最低階(Infinity)——再取任何表皆須更高, 而階層內之表皆不夠高 → 拋', async function() {
                //held=['zzz'](rank Infinity): 無任何表可「更高」, 一律違反階層(fail-closed)
                await expectViolation(['users'], ['zzz'])
                await expectViolation(['zzz'], ['zzz'])
            })

            it('RW-508 fn 同步拋錯／reject／拋非 Error 值之後鎖皆釋放: 後續呼叫可取(5 秒內完成, 否則視為死結)', async function() {
                let lockTabs = freshCore().withTabLocks
                let tables = ['grups', 'users', 'targets']
                let thrown = [
                    () => {
                        throw new Error('sync throw')
                    },
                    async () => {
                        throw new Error('async throw')
                    },
                    async () => Promise.reject('string reject'),
                    async () => Promise.reject(null),
                ]
                for (let f of thrown) {
                    let e = await withTabLocks(lockTabs, tables, f).then(() => 'RESOLVED', (err) => err)
                    assert.strict.notEqual(e, 'RESOLVED')
                    let ok = await withTimeout(withTabLocks(lockTabs, tables, async () => 'after'), 5000, '失敗後再取鎖')
                    assert.strict.equal(ok, 'after')
                }
            })

            it('RW-509 巢狀: 外層取本表、內層以 held 取引用端表(分段取鎖)可完成; 並行之另一任務僅取引用端表亦不死結', async function() {
                let lockTabs = freshCore().withTabLocks
                let seq = []
                let a = withTabLocks(lockTabs, ['grups'], async () => {
                    seq.push('A.outer')
                    await flush(3)
                    return await withTabLocks(lockTabs, ['users'], async () => {
                        seq.push('A.inner')
                        await flush(3)
                    }, ['grups'])
                })
                let b = withTabLocks(lockTabs, ['users'], async () => {
                    seq.push('B')
                    await flush(3)
                })
                await withTimeout(Promise.all([a, b]), 5000, '分段取鎖')
                assert.strict.equal(seq.length, 3)
            })

            it('RW-510 相反輸入順序之兩任務(withTabLocks([grups,users]) 與 ([users,grups]))並行 200 輪, 皆於 5 秒內完成(不死結)', async function() {
                let lockTabs = freshCore().withTabLocks
                let rand = mulberry32(510)
                let n = 0
                let task = (tabs) => withTabLocks(lockTabs, tabs, async () => {
                    await jitter(rand)
                    n++
                    await jitter(rand)
                })
                await withTimeout((async () => {
                    for (let k = 0; k < 200; k++) {
                        await Promise.all([task(['grups', 'users']), task(['users', 'grups'])])
                    }
                })(), 5000, '相反次序並行')
                assert.strict.equal(n, 400)
            })

            it('RW-511 四表全排列(24 任務)同時對同一真鎖管理器取鎖(各以不同輸入順序), 皆於 5 秒內完成且互斥(同一時刻每表至多一個持有者)', async function() {
                let lockTabs = freshCore().withTabLocks
                let rand = mulberry32(511)
                let holding = new Map()
                let violated = []
                let n = 0
                let task = (tabs) => withTabLocks(lockTabs, tabs, async () => {
                    for (let t of tabs) {
                        holding.set(t, (holding.get(t) || 0) + 1)
                        if (holding.get(t) > 1) {
                            violated.push(t)
                        }
                    }
                    await jitter(rand)
                    for (let t of tabs) {
                        holding.set(t, holding.get(t) - 1)
                    }
                    n++
                })
                await withTimeout(Promise.all(permutations(ORDER).map((p) => task(p))), 5000, '24 排列並行')
                assert.strict.equal(n, 24)
                assert.strict.deepEqual(violated, [], '不得有兩個任務同時持有同一表之鎖')
            })

            //perm-run01: 原直接以 kmx('A')／kmx('B') 相反次序巢狀取鎖; 改對真鎖管理器(w-serv-orm withTabLocks, 以表名 users／grups)直接相反次序巢狀取鎖, 同樣必死結(證明逾時偵測與死結成形條件有效)
            it('RW-512 對照(證明死結偵測有效): 兩任務以相反次序巢狀直接對真鎖管理器取鎖(不經 keyCheck.withTabLocks)→ 死結, 逾時被偵測', async function() {
                let lockTabs = freshCore().withTabLocks
                let gA = 0
                let barrier = () => flush(5)
                let t1 = lockTabs(['users'], async () => {
                    gA++
                    await barrier()
                    return lockTabs(['grups'], async () => 'x')
                })
                let t2 = lockTabs(['grups'], async () => {
                    gA++
                    await barrier()
                    return lockTabs(['users'], async () => 'y')
                })
                let err = await withTimeout(Promise.all([t1, t2]), 300, '對照死結').then(() => null, (e) => e)
                assert.strict.ok(err && /TIMEOUT/.test(err.message), '直接相反次序巢狀取鎖應死結(逾時)')
                assert.strict.equal(gA, 2)
            })

        })

        describe('procCore 之取鎖軌跡(分段取鎖: 先取本表, 僅本表有改名或刪除時才於內層再取引用端表)', function() {

            //traces: 各操作之預期取鎖序列(外層先、內層後); 無改名無刪除者只取本表
            let TRACE = [
                { tag: 'updateUsers 整表寫入', table: 'users', mk: (rs) => edit(rs, 'id-u1', { description: 'x' }), exp: ['users'] },
                { tag: 'updateUsers 刪使用者與改 name', table: 'users', mk: (rs) => edit(drop(rs, 'id-u5'), 'id-u1', { name: 'pii-renamed' }), exp: ['users'] },
                { tag: 'updateGrups 無改名無刪除', table: 'grups', mk: (rs) => edit(rs, 'id-g1', { description: 'x' }), exp: ['grups'] },
                { tag: 'updateGrups 新增列', table: 'grups', mk: (rs) => [...rs, newRow('grups', 'Gnew')], exp: ['grups'] },
                { tag: 'updateGrups 改名', table: 'grups', mk: (rs) => edit(rs, 'id-g1', { name: 'G1x' }), exp: ['grups', 'users'] },
                { tag: 'updateGrups 刪除', table: 'grups', mk: (rs) => drop(rs, 'id-g1'), exp: ['grups', 'users'] },
                { tag: 'updatePemis 無改名無刪除', table: 'pemis', mk: (rs) => edit(rs, 'id-p1', { description: 'x' }), exp: ['pemis'] },
                { tag: 'updatePemis 改名', table: 'pemis', mk: (rs) => edit(rs, 'id-p1', { name: 'P1x' }), exp: ['pemis', 'grups'] },
                { tag: 'updatePemis 刪除', table: 'pemis', mk: (rs) => drop(rs, 'id-p1'), exp: ['pemis', 'grups'] },
                { tag: 'updateTargets 無刪除', table: 'targets', mk: (rs) => edit(rs, T1, { description: 'x' }), exp: ['targets'] },
                { tag: 'updateTargets 刪除', table: 'targets', mk: (rs) => drop(rs, T1), exp: ['targets', 'pemis'] },
                { tag: 'updateTargets 改 id(刪舊增新)', table: 'targets', mk: (rs) => edit(rs, T1, { id: 'sysA/p1/b1x' }), exp: ['targets', 'pemis'] },
                { tag: 'updateGrups 改名但 cascadeRename:false(無刪除)→ 不須改寫引用端', table: 'grups', mk: (rs) => edit(rs, 'id-g1', { name: 'G1x' }), exp: ['grups'], proc: { cascadeRename: false } },
                { tag: 'updateGrups 被拒(NameInUse)時仍已取兩把鎖(拒絕發生於取齊之後, 預檢與寫入涵蓋同一版本)', table: 'grups', mk: (rs) => edit(rs, 'id-g1', { name: 'Ghost' }), exp: ['grups', 'users'], seed: () => addUsers(seedRows(), { cgrups: J({ Ghost: OR }) }), reject: true },
            ]
            for (let t of TRACE) {
                it(`RW-520 取鎖軌跡: ${t.tag} → ${t.exp.join(' → ')}`, async function() {
                    //perm-run01: 原注入假 kmx 改 traceLock 包裝真鎖(本表鎖經 guardWrite、引用端鎖經 withTabLocks; 記表名而非 tabWriteKey 鍵)
                    let tr = traceLock()
                    let env = createEnv({ lockOf: tr.wrap, proc: { ...(t.proc || {}) }, seed: t.seed ? t.seed() : undefined })
                    let log = tr.log
                    let r = await run(env.pc, t.table, t.mk(await rowsOf(env.woItems, t.table)))
                    assert.strict.equal(r.ok, !t.reject, `結果 ${JSON.stringify(r)}`)
                    assert.strict.deepEqual(acqOf(log), t.exp, '取鎖序列')
                    //巢狀釋放: 先取者後放
                    assert.strict.deepEqual(log.filter((x) => x.startsWith('rel ')).map((x) => x.slice(4)), [...t.exp].reverse())
                })
            }

        })

        describe('分段取鎖之實際互斥(他方持有某表鎖時, 無需該鎖之寫入不被擋、需要者被擋至釋放後才完成, 且被擋期間任何表不被寫)', function() {

            //perm-run01: 原 kmx(tabWriteKey(表), () => gate) 改對真鎖管理器以表名取鎖(env.core.withTabLocks([表], …), 與 guardWrite／引用端取鎖同一把)
            let hold = (core, tab) => {
                let release = null
                let gate = new Promise((resolve) => {
                    release = resolve
                })
                let held = core.withTabLocks([tab], () => gate)
                return { release: () => release(), held }
            }

            //expectNotBlocked: 持鎖期間操作完成
            let expectNotBlocked = async (env, holdTab, table, rows) => {
                let h = hold(env.core, holdTab)
                try {
                    let r = await withTimeout(run(env.pc, table, rows), 5000, `持有 ${holdTab} 時 ${FN[table]} 不應被擋`)
                    assert.strict.deepEqual(r, OKR)
                }
                finally {
                    h.release()
                    await h.held
                }
            }

            //expectBlocked: 持鎖期間不完成且四表零寫入, 釋放後完成
            let expectBlocked = async (env, holdTab, table, rows) => {
                let h = hold(env.core, holdTab)
                let done = false
                let p = run(env.pc, table, rows).then((r) => {
                    done = true
                    return r
                })
                await flush(40)
                assert.strict.equal(done, false, `持有 ${holdTab} 期間 ${FN[table]} 不得完成`)
                assert.strict.equal(writesAll(env.woItems), 0, '持鎖期間任何表不得被寫(引用端先寫須待取齊鎖)')
                h.release()
                await h.held
                let r = await withTimeout(p, 5000, '釋放後應完成')
                assert.strict.deepEqual(r, OKR)
            }

            it('RW-530 他方持有 grups 鎖: updatePemis 無改名無刪除(新增列＋description)不被擋', async function() {
                let env = createEnv()
                let rows = [...edit(await rowsOf(env.woItems, 'pemis'), 'id-p1', { description: 'x' }), newRow('pemis', 'Pnew')]
                await expectNotBlocked(env, 'grups', 'pemis', rows)
                assert.strict.equal(env.woItems.pemis.size(), 4)
            })

            it('RW-531 他方持有 grups 鎖: updatePemis 有刪除 → 被擋至釋放後才完成, 釋放後 grups.cpemis 已清理', async function() {
                let env = createEnv()
                await expectBlocked(env, 'grups', 'pemis', drop(await rowsOf(env.woItems, 'pemis'), 'id-p3'))
                assert.strict.deepEqual(parseOf(env.woItems, 'grups', 'id-g2', 'cpemis'), { P2: OR })
            })

            it('RW-532 他方持有 grups 鎖: updatePemis 有改名 → 被擋至釋放後才完成, 完成後引用已改名', async function() {
                let env = createEnv()
                await expectBlocked(env, 'grups', 'pemis', edit(await rowsOf(env.woItems, 'pemis'), 'id-p1', { name: 'P1x' }))
                assert.strict.deepEqual(parseOf(env.woItems, 'grups', 'id-g1', 'cpemis'), { P1x: OR, P2: OR })
            })

            it('RW-533 他方持有 users 鎖: updateGrups 有改名 → 被擋; 無改名(description／新增)→ 不被擋', async function() {
                let env = createEnv()
                await expectBlocked(env, 'users', 'grups', edit(await rowsOf(env.woItems, 'grups'), 'id-g1', { name: 'G1x' }))
                assert.strict.deepEqual(parseOf(env.woItems, 'users', 'id-u1', 'cgrups'), { G1x: OR, G2: AND })
                let env2 = createEnv()
                await expectNotBlocked(env2, 'users', 'grups', [...edit(await rowsOf(env2.woItems, 'grups'), 'id-g1', { description: 'x' }), newRow('grups', 'Gnew')])
            })

            it('RW-534 他方持有 users 鎖: updateGrups 有刪除 → 被擋至釋放後才完成', async function() {
                let env = createEnv()
                await expectBlocked(env, 'users', 'grups', drop(await rowsOf(env.woItems, 'grups'), 'id-g1'))
                assert.strict.deepEqual(parseOf(env.woItems, 'users', 'id-u1', 'cgrups'), { G2: AND })
            })

            it('RW-535 他方持有 users 鎖: updatePemis 有刪除 → 不被擋(其引用端為 grups, 不涉 users 鎖); updateTargets 有刪除亦不被擋', async function() {
                let env = createEnv()
                await expectNotBlocked(env, 'users', 'pemis', drop(await rowsOf(env.woItems, 'pemis'), 'id-p3'))
                let env2 = createEnv()
                await expectNotBlocked(env2, 'users', 'targets', drop(await rowsOf(env2.woItems, 'targets'), T3))
            })

            it('RW-536 他方持有 pemis 鎖: updateTargets 有刪除 → 被擋; 無刪除 → 不被擋; updateGrups 改名 → 不被擋(引用端為 users)', async function() {
                let env = createEnv()
                await expectBlocked(env, 'pemis', 'targets', drop(await rowsOf(env.woItems, 'targets'), T2))
                assert.strict.deepEqual(parseOf(env.woItems, 'pemis', 'id-p1', 'crules'), { [T1]: 'y' })
                let env2 = createEnv()
                await expectNotBlocked(env2, 'pemis', 'targets', edit(await rowsOf(env2.woItems, 'targets'), T1, { description: 'x' }))
                let env3 = createEnv()
                await expectNotBlocked(env3, 'pemis', 'grups', edit(await rowsOf(env3.woItems, 'grups'), 'id-g1', { name: 'G1x' }))
            })

            it('RW-537 他方持有 targets 鎖: updatePemis 改名／刪除 → 不被擋(targets 為被引用側, 階層最低且非 pemis 之引用端)', async function() {
                let env = createEnv()
                await expectNotBlocked(env, 'targets', 'pemis', drop(await rowsOf(env.woItems, 'pemis'), 'id-p3'))
            })

            for (let table of ['users', 'grups', 'pemis', 'targets']) {
                it(`RW-538 他方持有 ${table} 本表鎖: update${table} 任何寫入(無改名無刪除之 description 變更)皆被擋至釋放後才完成`, async function() {
                    let env = createEnv()
                    let id1 = { users: 'id-u1', grups: 'id-g1', pemis: 'id-p1', targets: T1 }[table]
                    await expectBlocked(env, table, table, edit(await rowsOf(env.woItems, table), id1, { description: 'changed' }))
                    assert.strict.equal(env.woItems[table].get(id1).description, 'changed')
                })
            }

        })

        //(b) 並行: updateGrups ∥ updateUsers ∥ updatePemis ∥ updateTargets 多輪隨機交錯
        describe('並行(隨機交錯, 於 ORM 呼叫點注入隨機讓出)', function() {

            //各操作之送入資料(自種子建構一次, 與是否並行無關: 整表寫入以送入之整表為準, 過時之欄位會覆寫(last-writer-wins), 故終態須等價於某一依序執行)
            //run07 U1 修正(外部列保護 F-23 / F-26, R-PRINCIPLE-00 原則 3、5): 種子 u2 為外部列(appX), 其 cgrups 會被先到之 G 級聯改寫; 後到之 U 若帶「種子時之舊 cgrups」送回,
            //依新規則屬「過期快照還原外部列指派」, 無基準即拒收 saveBaselineRequired(外審 B.2), 與本案述語(後台列之 last-writer-wins 下全部成功且終態等價於某一依序執行, 鎖階層不死結)無關,
            //故本段並行與其依序基準皆改用「users 全為後台列」之種子(seedAllBackend); 斷言未放寬. 外部列之過期快照拒收與並行序列化見 unit-procCore-external.
            let seedAllBackend = () => {
                let s = seedRows()
                s.users = s.users.map((u) => ({ ...u, from: '' }))
                return s
            }
            const SCEN = [
                { G: 'rename', P: 'del', T: 'del', U: 'cg' },
                { G: 'swap', P: 'rename', T: 'del2', U: 'cg' },
                { G: 'chain', P: 'delRen', T: 'del', U: 'desc' },
                { G: 'del', P: 'del', T: 'del2', U: 'cg' },
                { G: 'renDel', P: 'noop', T: 'noop', U: 'cg' },
                { G: 'rename', P: 'delRen', T: 'del', U: 'delUser' },
                { G: 'swap', P: 'del', T: 'del', U: 'desc' },
                { G: 'chain', P: 'rename', T: 'del2', U: 'cg' },
                { G: 'renDel', P: 'delRen', T: 'del', U: 'cg' },
                { G: 'del', P: 'rename', T: 'noop', U: 'delUser' },
                { G: 'rename', P: 'noop', T: 'del2', U: 'desc' },
                { G: 'swap', P: 'delRen', T: 'del2', U: 'delUser' },
            ]
            let buildOps = (sc) => {
                let s = seedAllBackend()
                let gs = {
                    rename: () => edit(s.grups, 'id-g1', { name: 'G1x' }),
                    swap: () => edit(edit(s.grups, 'id-g1', { name: 'G2' }), 'id-g2', { name: 'G1' }),
                    chain: () => edit(edit(s.grups, 'id-g1', { name: 'G2' }), 'id-g2', { name: 'G9' }),
                    del: () => drop(s.grups, 'id-g2'),
                    renDel: () => drop(edit(s.grups, 'id-g1', { name: 'G1x' }), 'id-g3'),
                }
                let ps = {
                    del: () => drop(s.pemis, 'id-p3'),
                    rename: () => edit(s.pemis, 'id-p1', { name: 'P1x' }),
                    delRen: () => drop(edit(s.pemis, 'id-p1', { name: 'P1x' }), 'id-p2'),
                    noop: () => edit(s.pemis, 'id-p1', { description: 'p-changed' }),
                }
                let ts = {
                    del: () => drop(s.targets, T3),
                    del2: () => drop(s.targets, T2),
                    noop: () => edit(s.targets, T1, { description: 't-changed' }),
                }
                let us = {
                    cg: () => edit(edit(s.users, 'id-u4', { cgrups: J({ G1: OR, G2: OR }) }), 'id-u1', { description: 'u-changed' }),
                    desc: () => edit(edit(s.users, 'id-u2', { description: 'u2-changed' }), 'id-u3', { description: 'u3-changed' }),
                    delUser: () => drop(s.users, 'id-u5'),
                }
                return [
                    { name: 'G', table: 'grups', userId: 'id-opG', rows: cloneDeep(gs[sc.G]()) },
                    { name: 'U', table: 'users', userId: 'id-opU', rows: cloneDeep(us[sc.U]()) },
                    { name: 'P', table: 'pemis', userId: 'id-opP', rows: cloneDeep(ps[sc.P]()) },
                    { name: 'T', table: 'targets', userId: 'id-opT', rows: cloneDeep(ts[sc.T]()) },
                ]
            }

            //fuzzTable: 於資料表替身之各方法前後注入隨機讓出, 製造多樣之交錯點(確定性 PRNG, 同種子同讓出序列)
            let fuzzTable = (t, rand) => {
                for (let m of ['select', 'insert', 'save', 'del', 'delAll']) {
                    let f = t[m]
                    t[m] = async (...a) => {
                        await jitter(rand)
                        let r = await f(...a)
                        await jitter(rand)
                        return r
                    }
                }
            }
            let shuffle = (arr, rand) => {
                let a = [...arr]
                for (let i = a.length - 1; i > 0; i--) {
                    let j = Math.floor(rand() * (i + 1))
                    ;[a[i], a[j]] = [a[j], a[i]]
                }
                return a
            }

            let baselineCache = new Map()
            //baselineOf: 該情境之所有依序執行(各排列)之 { results, view } 集合; 並回傳是否各排列皆全部成功
            let baselineOf = async (sc, ids) => {
                let key = JSON.stringify([sc, ids])
                if (baselineCache.has(key)) {
                    return baselineCache.get(key)
                }
                let ops = buildOps(sc).filter((o) => ids.includes(o.name))
                let set = new Set()
                let views = new Set()
                for (let perm of permutations(ops.map((o) => o.name))) {
                    let env = createEnv({ seed: seedAllBackend() })
                    let results = {}
                    for (let nm of perm) {
                        let o = ops.find((x) => x.name === nm)
                        results[nm] = await run(env.pc, o.table, cloneDeep(o.rows), undefined, o.userId)
                    }
                    let view = await viewOf(env.woItems)
                    let rs = ops.map((o) => results[o.name])
                    assert.strict.ok(rs.every((r) => r.ok), `依序執行(${perm})應全部成功: ${JSON.stringify(rs)}`)
                    set.add(`${JSON.stringify(rs)}|${view}`)
                    views.add(view)
                    env.cst.clear()
                }
                let b = { set, nViews: views.size }
                baselineCache.set(key, b)
                return b
            }

            let concurrentRound = async (sc, ids, seedNo) => {
                let rand = mulberry32(seedNo)
                let ops = buildOps(sc).filter((o) => ids.includes(o.name))
                let env = createEnv({ seed: seedAllBackend() })
                for (let k of TABLE_KEYS) {
                    fuzzTable(env.woItems[k], rand)
                }
                let order = shuffle(ops.map((o, i) => i), rand)
                let rs = []
                let ps = order.map((i) => (async () => {
                    await jitter(rand)
                    rs[i] = await run(env.pc, ops[i].table, cloneDeep(ops[i].rows), undefined, ops[i].userId)
                })())
                await withTimeout(Promise.all(ps), 10000, `情境 ${JSON.stringify(sc)} 種子 ${seedNo}`)
                let view = await viewOf(env.woItems)
                env.cst.clear()
                return { rs, view }
            }

            it('RW-540 updateGrups ∥ updateUsers ∥ updatePemis ∥ updateTargets(含改名／刪除)隨機交錯 60 輪(12 情境 × 5): 全部於 10 秒內完成(不死結)且全部成功、終態與各操作之結果等價於某一依序執行(無遺失更新、無半套之級聯)', async function() {
                let nViewsBySc = []
                for (let round = 0; round < 60; round++) {
                    let sc = SCEN[round % SCEN.length]
                    let ids = ['G', 'U', 'P', 'T']
                    let b = await baselineOf(sc, ids)
                    let { rs, view } = await concurrentRound(sc, ids, 1000 + round)
                    assert.strict.ok(rs.every((r) => r.ok), `第 ${round} 輪(情境 ${JSON.stringify(sc)}, 種子 ${1000 + round})應全部成功: ${JSON.stringify(rs)}`)
                    assert.strict.ok(b.set.has(`${JSON.stringify(rs)}|${view}`), `第 ${round} 輪(情境 ${JSON.stringify(sc)}, 種子 ${1000 + round})終態不等價於任何依序執行(遺失更新或半套級聯)\n實得 ${view}`)
                    if (round < SCEN.length) {
                        nViewsBySc.push(b.nViews)
                    }
                }
                //防空洞: 依序執行之終態因次序而異者(各情境之相異終態數 > 1)須占多數, 比對才具鑑別力
                assert.strict.ok(nViewsBySc.filter((n) => n > 1).length >= 8, `相異終態 > 1 之情境數不足: ${nViewsBySc}`)
            })

            it('RW-541 同一表之多操作者並行(updateGrups ×3: 改名／互換／刪除, 各自過時之整表)40 輪 → 不死結, 終態等價於某一依序執行', async function() {
                let mk = () => {
                    let s = seedRows()
                    return [
                        { name: 'A', table: 'grups', userId: 'id-opA', rows: cloneDeep(edit(s.grups, 'id-g1', { name: 'G1x' })) },
                        { name: 'B', table: 'grups', userId: 'id-opB', rows: cloneDeep(edit(edit(s.grups, 'id-g1', { name: 'G2' }), 'id-g2', { name: 'G1' })) },
                        { name: 'C', table: 'grups', userId: 'id-opC', rows: cloneDeep(drop(s.grups, 'id-g2')) },
                    ]
                }
                let ops = mk()
                let set = new Set()
                for (let perm of permutations(['A', 'B', 'C'])) {
                    let env = createEnv()
                    let results = {}
                    for (let nm of perm) {
                        let o = ops.find((x) => x.name === nm)
                        results[nm] = await run(env.pc, o.table, cloneDeep(o.rows), undefined, o.userId)
                    }
                    let rs = ops.map((o) => results[o.name])
                    set.add(`${JSON.stringify(rs)}|${await viewOf(env.woItems)}`)
                    env.cst.clear()
                }
                assert.strict.ok(set.size > 1, '各依序執行之結果應有差異(比對才有鑑別力)')
                for (let round = 0; round < 40; round++) {
                    let rand = mulberry32(2000 + round)
                    let env = createEnv()
                    for (let k of TABLE_KEYS) {
                        fuzzTable(env.woItems[k], rand)
                    }
                    let rs = []
                    let order = shuffle([0, 1, 2], rand)
                    await withTimeout(Promise.all(order.map((i) => (async () => {
                        await jitter(rand)
                        rs[i] = await run(env.pc, ops[i].table, cloneDeep(ops[i].rows), undefined, ops[i].userId)
                    })())), 10000, `同表並行 種子 ${2000 + round}`)
                    let view = await viewOf(env.woItems)
                    env.cst.clear()
                    assert.strict.ok(set.has(`${JSON.stringify(rs)}|${view}`), `同表並行第 ${round} 輪(種子 ${2000 + round})終態不等價於任何依序執行: ${JSON.stringify(rs)}`)
                }
            })

        })

        describe('站點不變式(靜態; 可參考 unit-keyCheck SITE-KC-007)', function() {

            let readCode = (rel) => fs.readFileSync(path.join(projRoot, rel), 'utf8').split(/\r?\n/).map((ln) => stripLineComment(ln)).join('\n')

            //withTabLocksCalls: 取得各 withTabLocks( 呼叫之引數字串(不含 import／函數定義行)
            let withTabLocksCalls = (code) => {
                let calls = []
                let re = /\bwithTabLocks\(/g
                let m
                while ((m = re.exec(code)) !== null) {
                    let ls = code.lastIndexOf('\n', m.index) + 1
                    let le = code.indexOf('\n', m.index)
                    let line = code.slice(ls, le < 0 ? code.length : le)
                    if (/^\s*import\b/.test(line) || /^\s*(async\s+)?function\b/.test(line)) {
                        continue
                    }
                    let args = takeParen(code, m.index + m[0].length)
                    assert.strict.ok(args !== null, `無法解析 withTabLocks( 呼叫(括號未閉合): ${line.trim()}`)
                    calls.push(args)
                }
                return calls
            }

            //perm-run01: 原 RW-550「不得直接 kmx( 取鎖」改為「不得自建鎖(pmKeyMutex／kmx( 皆不得出現; 取表鎖只經 keyCheck.withTabLocks 或 w-serv-orm 的 guardWrite／withTabLocks)」;
            //原 RW-551「withTabLocks( 恰兩處, 外層 withTabLocks(kmx, [keyTable], …)、內層 withTabLocks(kmx, [holder], …, [keyTable])」, 新碼:
            //  procCore.mjs: 本表鎖由 guardWrite({ tables: [keyTable], … }) 承擔(w-serv-orm 內部取鎖, 不再有外層 withTabLocks( 呼叫), 故僅內層一處 keyCheck.withTabLocks(lockTabs, [holder], …, [keyTable]);
            //  WWebPerm.mjs: 外部同步外層 withTabLocks(lockTabs, [keyTable], …)、內層 withTabLocks(lockTabs, [holder], …, [keyTable]) 共兩處.
            //  兩檔之內層(引用端表鎖)皆須帶 held 參數 [keyTable](階層守門, 防巢狀同鍵／反向).
            for (let rel of ['server/procCore.mjs', 'server/WWebPerm.mjs']) {
                it(`RW-550 ${rel}: 不得自建鎖(pmKeyMutex／kmx( 皆不得出現; 取表鎖只經 keyCheck.withTabLocks 或 w-serv-orm 的 guardWrite／withTabLocks, 否則可能違反階層而死結)`, function() {
                    let code = readCode(rel)
                    assert.strict.equal((code.match(/\bkmx\(/g) || []).length, 0, 'kmx( 不得出現')
                    assert.strict.equal((code.match(/\bpmKeyMutex\b/g) || []).length, 0, 'pmKeyMutex 不得出現(鎖管理器只有 w-serv-orm 實例一個)')
                    assert.strict.equal((code.match(/\btabWriteKey\b/g) || []).length, 0, 'tabWriteKey 不得復活')
                })
            }

            it('RW-551a server/procCore.mjs: 本表鎖只經 guardWrite({ tables: [keyTable], … }) 一處; 引用端表鎖 withTabLocks( 恰一處且帶 held 參數 [keyTable](階層守門, 防巢狀同鍵／反向)', function() {
                let code = readCode('server/procCore.mjs')
                assert.strict.equal((code.match(/\bguardWrite\(\{/g) || []).length, 1, 'guardWrite({ 呼叫恰一處')
                assert.strict.ok(/guardWrite\(\{\s*tables:\s*\[keyTable\]/.test(code), '本表鎖 guardWrite({ tables: [keyTable], … })')
                let calls = withTabLocksCalls(code)
                assert.strict.equal(calls.length, 1, 'procCore.mjs 之 withTabLocks( 呼叫數(僅引用端表鎖)')
                assert.strict.ok(/^\s*lockTabs,\s*\[holder\]\s*,/.test(calls[0]), '內層取引用端表鎖 withTabLocks(lockTabs, [holder], …)')
                assert.strict.ok(/,\s*\[keyTable\]\s*$/.test(calls[0]), '內層須帶 held 參數 [keyTable]')
                //引用端鎖在 guardWrite 的 write 回呼內(先持本表鎖才取引用端鎖)
                assert.strict.ok(code.indexOf('guardWrite({') < code.indexOf('withTabLocks(lockTabs, [holder]'), '引用端鎖須在 guardWrite 之後(write 回呼內)')
            })

            it('RW-551b server/WWebPerm.mjs: 全部 withTabLocks( 呼叫恰兩處——先取本表 [keyTable], 內層取引用端表 [holder] 時帶 held 參數 [keyTable](階層守門, 防巢狀同鍵／反向)', function() {
                let calls = withTabLocksCalls(readCode('server/WWebPerm.mjs'))
                assert.strict.equal(calls.length, 2, 'WWebPerm.mjs 之 withTabLocks( 呼叫數')
                let outer = calls.filter((a) => /^\s*lockTabs,\s*\[keyTable\]\s*,/.test(a))
                let inner = calls.filter((a) => /^\s*lockTabs,\s*\[holder\]\s*,/.test(a))
                assert.strict.equal(outer.length, 1, '外層取本表鎖 withTabLocks(lockTabs, [keyTable], …)')
                assert.strict.equal(inner.length, 1, '內層取引用端表鎖 withTabLocks(lockTabs, [holder], …)')
                assert.strict.ok(/,\s*\[keyTable\]\s*$/.test(inner[0]), '內層須帶 held 參數 [keyTable]')
            })

            it('RW-551c procCore.mjs 與 WWebPerm.mjs 之鎖來源: 皆取自注入之 w-serv-orm 實例(procCore 收 withTabLocks／guardWrite 注入; WWebPerm 取 WServOrm 回傳物件之 withTabLocks／guardWrite), 不自行建構', function() {
                let pcCode = readCode('server/procCore.mjs')
                assert.strict.ok(/function proc\(woItems, procOrm, \{[^}]*\bwithTabLocks: lockTabs\b[^}]*\bguardWrite\b[^}]*\}\)/.test(pcCode), 'proc 須收 withTabLocks(別名 lockTabs)／guardWrite 注入')
                let wpCode = readCode('server/WWebPerm.mjs')
                assert.strict.ok(/let lockTabs = wp\.withTabLocks/.test(wpCode) && /let guardWrite = wp\.guardWrite/.test(wpCode), 'WWebPerm 之鎖取自 WServOrm 回傳物件')
                assert.strict.ok(/procCore\(woItems,\s*procOrm,\s*\{[^}]*\bwithTabLocks: lockTabs\b[^}]*\bguardWrite\b[^}]*\}\)/.test(wpCode), 'WWebPerm 須把同一組 withTabLocks／guardWrite 注入 procCore(與外部同步共鎖)')
            })

            it('RW-552 引用端表之取得只經 REF_OF[keyTable].holder(單一對照表), 不另寫死表名', function() {
                for (let rel of ['server/procCore.mjs', 'server/WWebPerm.mjs']) {
                    let code = readCode(rel)
                    assert.strict.ok(/let holder = REF_OF\[keyTable\]\.holder/.test(code), `${rel} 之 holder 取自 REF_OF`)
                }
            })

            it('RW-553 引用鏈之階層與 REF_OF 一致: 每個「被引用表 → 引用端表」皆為階層由低到高(引用端恆高於被引用者); users 不在 REF_OF(引用鏈末端, 不取其他表鎖)', async function() {
                let { REF_OF } = await import('../src/js/refCascade.mjs')
                assert.strict.deepEqual(Object.keys(REF_OF).sort(), ['grups', 'pemis', 'targets'])
                for (let [k, v] of Object.entries(REF_OF)) {
                    assert.strict.ok(RANK[v.holder] > RANK[k], `${k} 之引用端 ${v.holder} 之階層須高於 ${k}`)
                }
            })

        })

    })


    // =====================================================================
    // 族 6: updateUsers 不觸發級聯、不取其他表鎖(RW-6xx)
    // =====================================================================
    describe('族 6 updateUsers(引用鏈末端)', function() {

        it('RW-601 users 整表寫入(新增、改 name／email／cgrups、刪除)→ 成功; 其他三表逐位元不變、零寫入; 無 refCascade 相關 log', async function() {
            let { woItems, pc, logs } = createEnv()
            let other = () => JSON.stringify(['targets', 'grups', 'pemis'].map((k) => woItems[k].snapshot()))
            let before = other()
            let rows = await rowsOf(woItems, 'users')
            rows = edit(rows, 'id-u1', { name: 'pii-name-u1-renamed', email: 'u1.renamed@example.com', cgrups: J({ G1: OR, GNEW: OR }) })
            rows = drop(rows, 'id-u5')
            rows = [...rows, newRow('users', 'new-user')]
            assert.strict.deepEqual(await run(pc, 'users', rows), OKR)
            assert.strict.equal(other(), before)
            for (let k of ['targets', 'grups', 'pemis']) {
                assert.strict.equal(writes(woItems[k]), 0, `${k} 零寫入`)
            }
            assert.strict.ok(!logs.some((l) => /refCascade/.test(l.event)), '無 refCascade 事件')
            assert.strict.equal(woItems.users.get('id-u1').cgrups, J({ G1: OR, GNEW: OR }), 'users 之 cgrups 為送入值(不被改寫)')
        })

        it('RW-602 pickKeysOnly[cgrups] 僅採納群組指派變更 → 成功; 其他三表零寫入; 無 refCascade 事件', async function() {
            let { woItems, pc, logs } = createEnv()
            let rows = edit(await rowsOf(woItems, 'users'), 'id-u4', { cgrups: J({ G1: OR }), name: 'ignored' })
            assert.strict.deepEqual(await run(pc, 'users', rows, { pickKeysOnly: ['cgrups'] }), OKR)
            assert.strict.equal(woItems.users.get('id-u4').cgrups, J({ G1: OR }))
            assert.strict.equal(woItems.users.get('id-u4').name, 'pii-name-u4', '非 pickKeys 欄位不採納')
            for (let k of ['targets', 'grups', 'pemis']) {
                assert.strict.equal(writes(woItems[k]), 0)
            }
            assert.strict.ok(!logs.some((l) => /refCascade/.test(l.event)))
        })

        it('RW-603 users 寫入時不取其他表鎖: 同時持有 targets／pemis／grups 三把鎖, updateUsers(整表與 pickKeysOnly)皆不被擋', async function() {
            let env = createEnv()
            let release = null
            let gate = new Promise((resolve) => {
                release = resolve
            })
            let helds = ['targets', 'pemis', 'grups'].map((t) => env.core.withTabLocks([t], () => gate)) //perm-run01: 原 env.kmx(tabWriteKey(t), …) 改對真鎖管理器以表名取鎖
            try {
                let r1 = await withTimeout(run(env.pc, 'users', edit(await rowsOf(env.woItems, 'users'), 'id-u1', { description: 'x' })), 5000, 'updateUsers 持他表鎖')
                assert.strict.deepEqual(r1, OKR)
                //run07 U1 修正: 原改外部列 id-u2(appX)之 cgrups, 無基準即拒收 saveBaselineRequired(外部列指派欄須附載入基準, R-EXT-OWN-01/R-BASELINE-01); 本案述語為取鎖階層, 與外部列無關, 改以後台列 id-u4 驗 pickKeysOnly 路徑(斷言未放寬)
                let r2 = await withTimeout(run(env.pc, 'users', edit(await rowsOf(env.woItems, 'users'), 'id-u4', { cgrups: J({ G1: OR }) }), { pickKeysOnly: ['cgrups'] }, 'id-admin2'), 5000, 'updateUsers(pickKeysOnly) 持他表鎖')
                assert.strict.deepEqual(r2, OKR)
            }
            finally {
                release()
                await Promise.all(helds)
            }
        })

        it('RW-604 users 之取鎖軌跡僅 users 一把(整表與 pickKeysOnly 皆然), 與是否刪除／改名使用者無關', async function() {
            //perm-run01: 原注入假 kmx 記鍵 tabWriteKey('users'), 改 traceLock 包裝真鎖, 記表名 'users'(本表鎖經 guardWrite; users 無引用端故不經 withTabLocks)
            let tr = traceLock()
            let log = tr.log
            let env = createEnv({ lockOf: tr.wrap })
            await run(env.pc, 'users', drop(edit(await rowsOf(env.woItems, 'users'), 'id-u1', { name: 'renamed' }), 'id-u5'))
            //run07 U1 修正: 原改外部列 id-u2 之 cgrups(無基準 → 被 saveBaselineRequired 拒收而本案未檢回傳值, 取鎖軌跡仍為一把而掩蓋了該次其實未成功); 改以後台列 id-u4 並斷言成功, 使「pickKeysOnly 路徑取一把鎖」確實走完寫入
            assert.strict.deepEqual(await run(env.pc, 'users', edit(await rowsOf(env.woItems, 'users'), 'id-u4', { cgrups: J({ G1: OR }) }), { pickKeysOnly: ['cgrups'] }, 'id-admin2'), OKR)
            assert.strict.deepEqual(log, ['acq users', 'rel users', 'acq users', 'rel users'], '兩次寫入(整表、pickKeysOnly)各只取 users 一把鎖、各自釋放')
        })

    })

    // =====================================================================
    // 族 7: cascadeWrite 純函數／介面單元(buildSyncRowsNew、checkCascadePlan、writeWithCascade; RW-7xx)
    // =====================================================================
    describe('族 7 cascadeWrite 單元', function() {

        describe('buildSyncRowsNew(外部同步之寫入後整表, 供規劃)', function() {

            let old = () => [
                { id: 'id-a', name: 'a', from: '' },
                { id: 'id-b', name: 'b', from: 'appX' },
                { id: 'id-c', name: 'c', from: 'appX' },
                { id: 'id-d', name: 'd', from: 'appY' },
            ]

            it('RW-701 他 from 之既有列原樣置前; 同 from 既有列未出現於本批者不在整表內(＝被刪除); 未帶 id 且同名者沿用同 from 既有列之 id; 新名為 __new__<k>', function() {
                let r = buildSyncRowsNew('grups', old(), [{ name: 'b', from: 'appX' }, { name: 'z', from: 'appX' }], 'appX')
                assert.strict.deepEqual(r, [
                    { id: 'id-a', name: 'a', from: '' },
                    { id: 'id-d', name: 'd', from: 'appY' },
                    { name: 'b', from: 'appX', id: 'id-b' },
                    { name: 'z', from: 'appX', id: '__new__1' },
                ])
            })

            it('RW-702 本批帶 id 者以其 id 為身分(同 id 異名＝改名)', function() {
                let r = buildSyncRowsNew('grups', old(), [{ id: 'id-b', name: 'b2', from: 'appX' }], 'appX')
                assert.strict.deepEqual(r.slice(2), [{ id: 'id-b', name: 'b2', from: 'appX' }])
                assert.strict.equal(r.length, 3)
            })

            it('RW-703 有限數字 id 取其字串形式; 空字串 id 與非有限數字(NaN／Infinity)視為未帶 id(依名稱對應)', function() {
                let r = buildSyncRowsNew('grups', old(), [{ id: 7, name: 'n7', from: 'appX' }, { id: '', name: 'c', from: 'appX' }, { id: Infinity, name: 'b', from: 'appX' }, { id: NaN, name: 'q', from: 'appX' }], 'appX')
                assert.strict.deepEqual(r.slice(2).map((v) => v.id), ['7', 'id-c', 'id-b', '__new__3'])
            })

            it('RW-704 同 from 同名多筆(歷史同名)依既有列順序一對一對應, 多出者為新實體', function() {
                let o = [{ id: 'd1', name: 'dup', from: 'appX' }, { id: 'd2', name: 'dup', from: 'appX' }]
                let r = buildSyncRowsNew('pemis', o, [{ name: 'dup', from: 'appX' }, { name: 'dup', from: 'appX' }, { name: 'dup', from: 'appX' }], 'appX')
                assert.strict.deepEqual(r.map((v) => v.id), ['d1', 'd2', '__new__2'])
            })

            it('RW-705 本批已帶用之 id 不被名稱對應重複佔用', function() {
                let o = [{ id: 'x1', name: 'x', from: 'appX' }]
                let r = buildSyncRowsNew('grups', o, [{ id: 'x1', name: 'x', from: 'appX' }, { name: 'x', from: 'appX' }], 'appX')
                assert.strict.deepEqual(r.map((v) => v.id), ['x1', '__new__1'])
            })

            it('RW-706 targets 無名稱對應(id 即名稱): 未帶 id 者一律為新實體 __new__<k>', function() {
                let r = buildSyncRowsNew('targets', [{ id: 't1', name: 'n', from: 'appX' }], [{ name: 'n', from: 'appX' }], 'appX')
                assert.strict.deepEqual(r.map((v) => v.id), ['__new__0'])
            })

            it('RW-707 既有列含非物件(null／數字／字串)不拋、忽略; 輸入之 rowsOld 與 rows 不被修改', function() {
                let o = [null, 5, 'x', ...old()]
                let rows = [{ name: 'b', from: 'appX' }]
                let o0 = cloneDeep(o)
                let rows0 = cloneDeep(rows)
                let r = buildSyncRowsNew('grups', o, rows, 'appX')
                assert.strict.deepEqual(r.map((v) => v.id), ['id-a', 'id-d', 'id-b'])
                assert.strict.deepEqual(o, o0)
                assert.strict.deepEqual(rows, rows0)
            })

            //與 planRefChanges 串接: 外部同步之「同名重送」不算刪除再新增(否則每次同步皆清空引用)
            let plan = (rowsNew) => planRefChanges({
                keyTable: 'grups',
                rowsOld: [{ id: 'g1', name: 'A', from: 'appX' }, { id: 'g2', name: 'B', from: 'appX' }, { id: 'g3', name: 'C', from: '' }],
                rowsNew,
                holdersOld: [{ id: 'u1', cgrups: J({ A: OR, B: OR, C: OR }), from: '' }],
            })
            let oldG = () => [{ id: 'g1', name: 'A', from: 'appX' }, { id: 'g2', name: 'B', from: 'appX' }, { id: 'g3', name: 'C', from: '' }]

            it('RW-708 串接規劃: 同一來源同名重送(未帶 id)→ 無改名無刪除、不改寫任何引用', function() {
                let p = plan(buildSyncRowsNew('grups', oldG(), [{ name: 'A', from: 'appX' }, { name: 'B', from: 'appX' }], 'appX'))
                assert.strict.deepEqual([p.err, p.renames, p.delNames, p.changes], [null, [], [], []])
            })

            it('RW-709 串接規劃: 帶 id 同 id 異名＝改名(引用隨之改名); 舊 id 不在本批＝刪除(引用被清)', function() {
                let p = plan(buildSyncRowsNew('grups', oldG(), [{ id: 'g1', name: 'A2', from: 'appX' }], 'appX'))
                assert.strict.deepEqual(p.renames, [{ id: 'g1', from: 'A', to: 'A2' }])
                assert.strict.deepEqual(p.delNames, ['B'])
                assert.strict.deepEqual(JSON.parse(p.changes[0].after), { A2: OR, C: OR })
            })

            it('RW-710 串接規劃 [已知限制②]: 未帶 id 且改名無從偵測為改名——視為舊名刪除＋新名新增(舊名引用被清, 新名不繼承)', function() {
                let p = plan(buildSyncRowsNew('grups', oldG(), [{ name: 'A', from: 'appX' }, { name: 'B2', from: 'appX' }], 'appX'))
                assert.strict.deepEqual(p.renames, [])
                assert.strict.deepEqual(p.delNames, ['B'])
                assert.strict.deepEqual(JSON.parse(p.changes[0].after), { A: OR, C: OR })
            })

        })

        describe('fillIdlessIds(未帶 id 之列依名稱對應既有列; 後台整表寫入以全表為 pool, 外部同步以同 from 之既有列為 pool)', function() {

            let pool = () => [
                { id: 'id-a', name: 'a' },
                { id: 'id-b', name: 'b' },
                { id: 'id-c', name: 'c' },
            ]

            it('RW-730 未帶 id 且同名 → 沿用既有列之 id(同名即同一實體); 名稱不同 → __new__<k>(不與任何既有主鍵相同); 帶 id 者原樣; 其餘欄位原樣、回傳為複本', function() {
                let rows = [{ name: 'a', description: 'da' }, { name: 'zz' }, { id: 'id-c', name: 'c2' }]
                let rows0 = cloneDeep(rows)
                let r = fillIdlessIds('grups', pool(), rows)
                assert.strict.deepEqual(r, [{ name: 'a', description: 'da', id: 'id-a' }, { name: 'zz', id: '__new__1' }, { id: 'id-c', name: 'c2' }])
                assert.strict.deepEqual(rows, rows0, '不修改輸入')
                assert.strict.notEqual(r[0], rows[0])
            })

            it('RW-731 pool 不含「id 已被本批帶用」之既有列: 帶 id 之列(即使改名)佔用其 id, 缺 id 之同名列不得對應到該既有列而為新實體', function() {
                let r = fillIdlessIds('grups', pool(), [{ id: 'id-a', name: 'a2' }, { name: 'a' }])
                assert.strict.deepEqual(r.map((v) => v.id), ['id-a', '__new__1'])
            })

            it('RW-732 同名多列依 pool 順序一對一對應, 多出者為新實體(同名多列不消耗＝全對到同一 id 即錯)', function() {
                let p = [{ id: 'd1', name: 'dup' }, { id: 'd2', name: 'dup' }, { id: 'x1', name: 'x' }]
                let r = fillIdlessIds('pemis', p, [{ name: 'dup' }, { name: 'x' }, { name: 'dup' }, { name: 'dup' }])
                assert.strict.deepEqual(r.map((v) => v.id), ['d1', 'x1', 'd2', '__new__3'])
            })

            it('RW-733 有限數字 id 取字串形式; 空字串／NaN／Infinity／非字串 id 視為未帶(依名稱對應)', function() {
                let r = fillIdlessIds('grups', pool(), [{ id: 7, name: 'n7' }, { id: '', name: 'a' }, { id: Infinity, name: 'b' }, { id: NaN, name: 'q' }, { id: true, name: 'c' }])
                assert.strict.deepEqual(r.map((v) => v.id), ['7', 'id-a', 'id-b', '__new__3', 'id-c'])
            })

            it('RW-734 targets 不適用名稱對應(id 即名稱, 必帶): 缺 id 者一律 __new__<k>', function() {
                let r = fillIdlessIds('targets', [{ id: 't1', name: 'n' }], [{ name: 'n' }, { id: 't2' }])
                assert.strict.deepEqual(r.map((v) => v.id), ['__new__0', 't2'])
            })

            it('RW-735 pool 內非物件／無字串 id／無字串 name 之項目忽略; 本批非物件之列不拋(以 {id} 輸出); 空 pool／空本批', function() {
                let r = fillIdlessIds('grups', [null, 5, 'x', { id: 9, name: 'a' }, { id: 'id-n' }, { id: 'id-a', name: 'a' }], [{ name: 'a' }])
                assert.strict.deepEqual(r.map((v) => v.id), ['id-a'])
                assert.strict.deepEqual(fillIdlessIds('grups', [], []), [])
                assert.strict.deepEqual(fillIdlessIds('grups', [], [{ name: 'a' }]).map((v) => v.id), ['__new__0'])
                assert.strict.doesNotThrow(() => fillIdlessIds('grups', pool(), [null, 5]))
            })

            it('RW-736 buildSyncRowsNew 之 pool 只含「同一 from」之既有列: 他 from 之同名列不被缺 id 之本批列對應(否則外部同步會接管他來源之實體 id)', function() {
                let o = [{ id: 'id-a', name: 'a', from: '' }, { id: 'id-b', name: 'b', from: 'appX' }]
                let r = buildSyncRowsNew('grups', o, [{ name: 'a', from: 'appX' }, { name: 'b', from: 'appX' }], 'appX')
                assert.strict.deepEqual(r.map((v) => v.id), ['id-a', '__new__0', 'id-b'], '他 from 之 a 原樣置前; 本批之 a 為新實體(__new__0), b 對應同 from 之 id-b')
            })

        })

        describe('R1 規劃用新實體 id 須避開既有主鍵(rowsAvoid: 外部同步之他 from 列)', function() {

            it('RW-737 fillIdlessIds: 新實體之規劃 id 避開 rowsPool、rowsAvoid 與本批已帶之 id, 且彼此不重複', function() {
                let r = fillIdlessIds('grups', [{ id: '__new__1', name: 'p' }], [{ name: 'N1' }, { name: 'N2' }, { id: '__new__2', name: 'g' }], [{ id: '__new__0', name: 'A', from: 'other' }])
                assert.strict.deepEqual(r.map((v) => v.id), ['__new__3', '__new__4', '__new__2'])
                assert.strict.equal(new Set(r.map((v) => v.id)).size, r.length)
                //未給 rowsAvoid(預設空)時只避開 pool 與本批已帶
                assert.strict.deepEqual(fillIdlessIds('grups', [], [{ name: 'N' }]).map((v) => v.id), ['__new__0'])
                //rowsAvoid 內非物件／無字串 id 者忽略, 不拋
                assert.strict.deepEqual(fillIdlessIds('grups', [], [{ name: 'N' }], [null, 5, { id: 9 }, { id: '__new__0' }]).map((v) => v.id), ['__new__1'])
            })

            it('RW-738 buildSyncRowsNew: 他 from 已有 id __new__0 之列, 本 from 推未帶 id 之新列 → 規劃整表無重複 id、他 from 列原樣; 規劃不把他 from 之 A 判成改名為新列(A→New)', function() {
                let old = [{ id: '__new__0', name: 'A', from: 'other' }]
                let old0 = cloneDeep(old)
                let r = buildSyncRowsNew('grups', old, [{ name: 'New', from: 'appX' }], 'appX')
                assert.strict.deepEqual(r.map((v) => v.id), ['__new__0', '__new__1'])
                assert.strict.deepEqual(r[0], old0[0], '他 from 列原樣')
                assert.strict.equal(new Set(r.map((v) => v.id)).size, r.length, '規劃整表無重複 id')
                let p = planRefChanges({ keyTable: 'grups', rowsOld: old, rowsNew: r, holdersOld: [{ id: 'u1', cgrups: J({ A: OR }), from: '' }] })
                assert.strict.deepEqual([p.err, p.renames, p.delNames, p.changes], [null, [], [], []], '無改名無刪除, 引用不動')
            })

            it('RW-739 後台整表寫入(procCore)之同形: 庫內群組 Zed 之主鍵恰為 __new__4, 另送入一列缺 id 之新群組 Fresh(第 5 列)→ 規劃 id 不撞 Zed 之主鍵: 引用 Zed 之使用者不被改成 Fresh, 無 refCascade-done', async function() {
                let seed = seedRows()
                addRows(seed, 'grups', { id: '__new__4', name: 'Zed', from: '', cpemis: '{}' })
                addUsers(seed, { cgrups: J({ Zed: OR }) })
                let env = createEnv({ seed })
                let { woItems, pc, logs } = env
                let rows = [...(await rowsOf(woItems, 'grups')), noIdRow(newRow('grups', 'Fresh'))]
                assert.strict.equal(rows.length, 5)
                assert.strict.deepEqual(await run(pc, 'grups', rows), OKR)
                assert.strict.equal(woItems.users.get('id-x0').cgrups, J({ Zed: OR }), '引用 Zed 者不變(未被判成 Zed→Fresh 改名)')
                assert.strict.equal(woItems.grups.get('__new__4').name, 'Zed')
                assert.strict.equal((await woItems.grups.select()).filter((g) => g.name === 'Fresh').length, 1)
                assert.strict.equal(logs.filter((l) => l.event === 'refCascade-done').length, 0)
            })

        })

        describe('checkCascadePlan(引用端改寫列之預檢)', function() {

            let mkPlan = (changes) => ({ keyTable: 'grups', holder: 'users', field: 'cgrups', changes })

            it('RW-711 無計畫／無改寫列 → null', function() {
                assert.strict.equal(checkCascadePlan(null), null)
                assert.strict.equal(checkCascadePlan(undefined), null)
                assert.strict.equal(checkCascadePlan(mkPlan([])), null)
            })

            it('RW-712 改寫後之欄位值含 HTML 標記 → htmlMarkupNotAllowed; 合法 → null(不修改 plan)', function() {
                let ok = mkPlan([{ id: 'u1', field: 'cgrups', before: '{}', after: J({ B: OR }) }])
                let ok0 = cloneDeep(ok)
                assert.strict.equal(checkCascadePlan(ok), null)
                assert.strict.deepEqual(ok, ok0)
                assert.strict.equal(checkCascadePlan(mkPlan([{ id: 'u1', field: 'cgrups', before: '{}', after: J({ '<img src=x onerror=1>': OR }) }])), 'htmlMarkupNotAllowed')
            })

            it('RW-713 其他不可寫入(主鍵超過 1978 B／改寫列主鍵重複)→ saveRowFieldInvalid', function() {
                assert.strict.equal(checkCascadePlan(mkPlan([{ id: 'x'.repeat(1979), field: 'cgrups', before: '{}', after: '{"B":1}' }])), 'saveRowFieldInvalid')
                assert.strict.equal(checkCascadePlan(mkPlan([{ id: 'u1', field: 'cgrups', before: '{}', after: '{"B":1}' }, { id: 'u1', field: 'cgrups', before: '{}', after: '{"B":1}' }])), 'saveRowFieldInvalid')
            })

        })

        describe('writeWithCascade(引用端先寫、主體後寫、失敗補償)', function() {

            //mk: 以替身記錄呼叫序列; opt.failProcOrm／opt.failMain 為拒絕值, opt.restore 為補償 save 之行為
            let mk = (opt = {}) => {
                let calls = []
                let { srLog, logs } = mkSrLog()
                let holdersOld = opt.holdersOld || [{ id: 'u1', cgrups: J({ A: OR }), userIdUpdate: 'u0', timeUpdate: 't0', email: 'e@x', from: '' }]
                let plan = opt.plan || planRefChanges({ keyTable: 'grups', rowsOld: [{ id: 'g1', name: 'A' }], rowsNew: [{ id: 'g1', name: 'B' }], holdersOld })
                let woItems = {
                    [plan.holder]: {
                        save: async (data, option) => {
                            calls.push(['restore', cloneDeep(data), cloneDeep(option)])
                            if (opt.restore) {
                                return opt.restore(data)
                            }
                            return data.map(() => ({ ok: 1 }))
                        },
                    },
                }
                let procOrm = async (userId, table, mode, data) => {
                    calls.push(['procOrm', userId, table, mode, cloneDeep(data)])
                    if (opt.failProcOrm !== undefined) {
                        return Promise.reject(opt.failProcOrm)
                    }
                }
                let writeMain = async () => {
                    calls.push(['main'])
                    if (opt.failMain !== undefined) {
                        return Promise.reject(opt.failMain)
                    }
                    return 'MAIN'
                }
                let go = () => writeWithCascade({ plan, holdersOld, woItems, procOrm, userId: 'id-op', srLog, writeMain })
                return { calls, logs, plan, go }
            }

            it('RW-720 無計畫或無改寫列 → 只執行 writeMain 並回其結果, 不寫引用端、不記 log', async function() {
                let t = mk({ plan: { keyTable: 'grups', holder: 'users', changes: [] } })
                assert.strict.equal(await t.go(), 'MAIN')
                assert.strict.deepEqual(t.calls, [['main']])
                assert.strict.deepEqual(t.logs, [])
                let calls = []
                let r = await writeWithCascade({ plan: null, holdersOld: [], woItems: {}, procOrm: async () => calls.push('procOrm'), userId: 'u', srLog: mkSrLog().srLog, writeMain: async () => 'M2' })
                assert.strict.equal(r, 'M2')
                assert.strict.deepEqual(calls, [])
            })

            it('RW-721 成功 → 先 procOrm(save 引用端之改寫欄位, 操作者為 userId)再 writeMain; 回 writeMain 之結果; 記 refCascade-done', async function() {
                let t = mk()
                assert.strict.equal(await t.go(), 'MAIN')
                assert.strict.deepEqual(t.calls, [['procOrm', 'id-op', 'users', 'save', [{ id: 'u1', cgrups: J({ B: OR }) }]], ['main']])
                let l = t.logs.filter((x) => x.event === 'refCascade-done')
                assert.strict.equal(l.length, 1)
                assert.strict.deepEqual([l[0].keyTable, l[0].holder, l[0].nRename, l[0].nDelName, l[0].nHolders], ['grups', 'users', 1, 0, 1])
            })

            it('RW-722 writeMain 失敗 → 以寫入前「整列」整列覆寫補償(payload 為 holdersOld 之整列含 email／from 等, 第 2 參數 { merge: false }; R4), 重新拋出「同一個」原錯誤, 記 refCascade-restored(warn)', async function() {
                let sentinel = { tag: 'ORIG' }
                let t = mk({ failMain: sentinel })
                let e = await t.go().then(() => 'RESOLVED', (err) => err)
                assert.strict.equal(e, sentinel, '主體階段之錯誤原樣拋出(同一物件)')
                assert.strict.deepEqual(t.calls.map((c) => c[0]), ['procOrm', 'main', 'restore'])
                assert.strict.deepEqual(t.calls[2][1], [{ id: 'u1', cgrups: J({ A: OR }), userIdUpdate: 'u0', timeUpdate: 't0', email: 'e@x', from: '' }], '補償 payload 為寫入前整列')
                assert.strict.deepEqual(t.calls[2][2], { merge: false }, '整列覆寫(w-orm-lmdb 選項), 合併寫入無法刪鍵')
                let l = t.logs.filter((x) => x.event === 'refCascade-restored')
                assert.strict.equal(l.length, 1)
                assert.strict.equal(l[0].level, 'warn')
                assert.strict.equal(t.logs.filter((x) => x.event === 'refCascade-done').length, 0)
            })

            it('RW-723 引用端 procOrm 失敗(可能已部分寫入)→ writeMain 不執行, 仍補償還原並重新拋出原錯誤', async function() {
                let t = mk({ failProcOrm: 'ORM-FAIL' })
                let e = await t.go().then(() => 'RESOLVED', (err) => err)
                assert.strict.equal(e, 'ORM-FAIL')
                assert.strict.deepEqual(t.calls.map((c) => c[0]), ['procOrm', 'restore'])
            })

            it('RW-724 補償 reject 或逐筆 ok:0 → 回 saveCascadePartial, 記 refCascade-restore-error(error; 帶 keyTable／holder／nHolders, 原錯誤 raw 與補償錯誤 rawRestore)', async function() {
                for (let [restore, rawRestore] of [[async () => Promise.reject('RESTORE-FAIL'), 'RESTORE-FAIL'], [async (d) => d.map(() => ({ ok: 0, err: 'x' })), null]]) {
                    let t = mk({ failMain: 'ORIG-ERR', restore })
                    let e = await t.go().then(() => 'RESOLVED', (err) => err)
                    assert.strict.equal(e, 'saveCascadePartial')
                    let l = t.logs.filter((x) => x.event === 'refCascade-restore-error')
                    assert.strict.equal(l.length, 1)
                    assert.strict.equal(l[0].level, 'error')
                    assert.strict.deepEqual([l[0].keyTable, l[0].holder, l[0].nHolders], ['grups', 'users', 1])
                    assert.strict.equal(l[0].raw, 'ORIG-ERR', '原錯誤原文入 raw(補償失敗不得吞掉原錯誤之記錄)')
                    if (rawRestore !== null) {
                        assert.strict.equal(l[0].rawRestore, rawRestore, '補償錯誤原文入 rawRestore')
                    }
                    else {
                        assert.strict.ok(typeof l[0].rawRestore === 'string' && l[0].rawRestore !== '', '補償逐筆 ok:0 亦須註記 rawRestore(非空)')
                    }
                    assert.strict.equal(t.logs.filter((x) => x.event === 'refCascade-restored').length, 0)
                }
            })

            it('RW-727 raw／rawRestore 遮罩: 原文中之 id[…](ORM 逐筆失敗訊息, 可能為引用端 id)一律記為 id[*], Error 取其 message, 其他值取 String(); refCascade-restored(warn)亦帶遮罩後之 raw', async function() {
                //補償失敗: 兩者皆遮罩
                let t = mk({ failProcOrm: new Error('failed to save data: id[u1], id[user-2]'), restore: async () => Promise.reject(new Error('restore failed: id[u1]')) })
                await t.go().then(() => null, () => null)
                let le = t.logs.find((x) => x.event === 'refCascade-restore-error')
                assert.strict.equal(le.raw, 'failed to save data: id[*], id[*]')
                assert.strict.equal(le.rawRestore, 'restore failed: id[*]')
                assert.strict.ok(!JSON.stringify(t.logs).includes('u1') && !JSON.stringify(t.logs).includes('user-2'), 'log 不含引用端 id 字面')
                //補償成功: warn 帶 raw
                let t2 = mk({ failMain: 'main failed: id[u1]' })
                await t2.go().then(() => null, () => null)
                let lw = t2.logs.find((x) => x.event === 'refCascade-restored')
                assert.strict.equal(lw.raw, 'main failed: id[*]')
                assert.strict.ok(!JSON.stringify(t2.logs).includes('u1'))
                //非字串非 Error: String()
                let t3 = mk({ failMain: 42, restore: async () => Promise.reject(null) })
                await t3.go().then(() => null, () => null)
                let l3 = t3.logs.find((x) => x.event === 'refCascade-restore-error')
                assert.strict.equal(l3.raw, '42')
                assert.strict.equal(l3.rawRestore, 'null')
            })

            //外審 sol 增量 D1: 引用端 id 含 ']' 者, 先以已知引用端 id 之完整字面遮罩再套通則
            for (let w of WEIRD_IDS) {
                it(`RW-418 writeWithCascade 直接單元: 引用端 id 為 ${JSON.stringify(w.id)} → 引用端階段之錯誤(字串與 Error 兩形)重新拋出前完整遮罩, 同一 id 出現多次皆遮罩, raw 亦遮罩, 整份 log 不含個資片段`, async function() {
                    let holdersOld = [{ id: w.id, cgrups: J({ A: OR }), userIdUpdate: 'u0', timeUpdate: 't0' }]
                    let noLeak = (x) => {
                        let s = JSON.stringify(x)
                        for (let secret of w.secrets) {
                            assert.strict.ok(!s.includes(JSON.stringify(secret).slice(1, -1)), `不得含 ${JSON.stringify(secret)}: ${s.slice(0, 300)}`)
                        }
                    }
                    //字串
                    let t1 = mk({ holdersOld, failProcOrm: `failed to save data: id[${w.id}]` })
                    let e1 = await t1.go().then(() => 'RESOLVED', (err) => err)
                    assert.strict.equal(e1, 'failed to save data: id[*]')
                    assert.strict.equal(t1.logs.find((x) => x.event === 'refCascade-restored').raw, 'failed to save data: id[*]')
                    //Error
                    let orig = new Error(`failed to save data: id[${w.id}]`)
                    let t2 = mk({ holdersOld, failProcOrm: orig })
                    let e2 = await t2.go().then(() => 'RESOLVED', (err) => err)
                    assert.strict.ok(e2 instanceof Error)
                    assert.strict.notEqual(e2, orig)
                    assert.strict.equal(e2.message, 'failed to save data: id[*]')
                    assert.strict.equal(String(e2.stack).includes(w.secrets[0]), false, '新 Error 之 stack 不含個資片段')
                    //同一 id 出現兩次(只遮罩第一個命中者會殘留)
                    let t3 = mk({ holdersOld, failProcOrm: `failed to save data: id[${w.id}], id[${w.id}]` })
                    assert.strict.equal(await t3.go().then(() => 'RESOLVED', (err) => err), 'failed to save data: id[*], id[*]')
                    //補償亦失敗: raw／rawRestore 皆遮罩
                    let t4 = mk({ holdersOld, failProcOrm: `failed to save data: id[${w.id}]`, restore: async () => Promise.reject(new Error(`restore failed: id[${w.id}]`)) })
                    assert.strict.equal(await t4.go().then(() => 'RESOLVED', (err) => err), 'saveCascadePartial')
                    let le = t4.logs.find((x) => x.event === 'refCascade-restore-error')
                    assert.strict.equal(le.raw, 'failed to save data: id[*]')
                    assert.strict.equal(le.rawRestore, 'restore failed: id[*]')
                    for (let t of [t1, t2, t3, t4]) {
                        noLeak(t.logs)
                    }
                    noLeak([e1, e2.message, e2.stack])
                })
            }

            let planA2B = (holdersOld) => planRefChanges({ keyTable: 'grups', rowsOld: [{ id: 'g1', name: 'A' }], rowsNew: [{ id: 'g1', name: 'B' }], holdersOld })

            it('RW-419 多個引用端 id 皆含 ]( a]b 與 c]d )同在一則錯誤 → 全部遮罩(只遮罩第一個已知 id 者會殘留)', async function() {
                let hs = [{ id: 'a]b', cgrups: J({ A: OR }) }, { id: 'c]d', cgrups: J({ A: OR }) }]
                let t1 = mk({ holdersOld: hs, plan: planA2B(hs), failProcOrm: 'failed to save data: id[a]b], id[c]d]' })
                assert.strict.equal(await t1.go().then(() => 'RESOLVED', (err) => err), 'failed to save data: id[*], id[*]')
                assert.strict.equal(t1.logs.find((x) => x.event === 'refCascade-restored').raw, 'failed to save data: id[*], id[*]')
            })

            //已知 id 互為前綴(a 與 a]b): 錯誤文字 id[a]b] 中, 較短之 id[a] 字面為其子字串; 若先以較短者遮罩則殘留 b](引用端 id 之後半段)——須先遮罩較長者
            for (let order of [['a', 'a]b'], ['a]b', 'a']]) {
                it(`RW-420 已知引用端 id 互為前綴(引用端次序 ${JSON.stringify(order)}), 錯誤文字 id[a]b] → 完整遮罩為 id[*](不殘留後半段 b])`, async function() {
                    let hp = order.map((id) => ({ id, cgrups: J({ A: OR }) }))
                    let t2 = mk({ holdersOld: hp, plan: planA2B(hp), failProcOrm: 'failed to save data: id[a]b]' })
                    let e2 = await t2.go().then(() => 'RESOLVED', (err) => err)
                    assert.strict.equal(e2, 'failed to save data: id[*]', `實得 ${e2}`)
                    assert.strict.equal(t2.logs.find((x) => x.event === 'refCascade-restored').raw, 'failed to save data: id[*]', 'log 之 raw 亦須完整遮罩')
                })
            }

            it('RW-728 writeWithCascade 自身再驗引用端改寫列(防禦): 含 HTML 標記之改寫列 → 拒 htmlMarkupNotAllowed, 於任何寫入之前(不呼叫 procOrm／writeMain／補償)', async function() {
                let plan = { keyTable: 'grups', holder: 'users', field: 'cgrups', renames: [], delNames: [], nHolders: 1, nRenameHolders: 0, nDelHolders: 0, nExternal: 0, changes: [{ id: 'u1', field: 'cgrups', before: '{}', after: J({ '<img src=x onerror=1>': OR }), nRename: 0, nDel: 0, from: '' }] }
                let t = mk({ plan })
                let e = await t.go().then(() => 'RESOLVED', (err) => err)
                assert.strict.equal(e, 'htmlMarkupNotAllowed')
                assert.strict.deepEqual(t.calls, [])
                assert.strict.deepEqual(t.logs, [])
            })

            it('RW-725 補償 payload: 引用端列無稽核欄位者整列原樣(不憑空補 userIdUpdate／timeUpdate 鍵); 有者整列含之; 已不在 holdersOld 之引用端列僅以 { id, 授權欄位 before } 還原; 皆 { merge: false }', async function() {
                let holdersAll = [{ id: 'u1', cgrups: J({ A: OR }) }, { id: 'u2', cgrups: J({ A: OR }), userIdUpdate: 'u0', timeUpdate: 't0', email: 'e2@x' }, { id: 'u9', cgrups: J({ A: AND }) }]
                let plan = planRefChanges({ keyTable: 'grups', rowsOld: [{ id: 'g1', name: 'A' }], rowsNew: [{ id: 'g1', name: 'B' }], holdersOld: holdersAll })
                let t = mk({ failMain: 'ORIG', holdersOld: holdersAll.slice(0, 2), plan }) //u9 已不在 holdersOld
                await t.go().then(() => null, () => null)
                let rs = t.calls.find((c) => c[0] === 'restore')
                assert.strict.deepEqual(rs[1], [
                    { id: 'u1', cgrups: J({ A: OR }) },
                    { id: 'u2', cgrups: J({ A: OR }), userIdUpdate: 'u0', timeUpdate: 't0', email: 'e2@x' },
                    { id: 'u9', cgrups: J({ A: AND }) },
                ])
                assert.strict.ok(!hasOwn(rs[1][0], 'userIdUpdate') && !hasOwn(rs[1][0], 'timeUpdate'), '原無稽核欄位者不憑空補鍵')
                assert.strict.deepEqual(rs[2], { merge: false })
            })

            it('RW-726 引用端為 pemis(刪除標的)時補償同樣以整列整列覆寫還原(crules 與其餘欄位)', async function() {
                let holdersOld = [{ id: 'p1', name: 'P1', crules: J({ [T1]: 'y', [T2]: 'n' }), userIdUpdate: 'u0', timeUpdate: 't0' }]
                let plan = planRefChanges({ keyTable: 'targets', rowsOld: [{ id: T1 }, { id: T2 }], rowsNew: [{ id: T2 }], holdersOld })
                let t = mk({ failMain: 'ORIG', holdersOld, plan })
                await t.go().then(() => null, () => null)
                assert.strict.deepEqual(t.calls.find((c) => c[0] === 'procOrm')[4], [{ id: 'p1', crules: J({ [T2]: 'n' }) }])
                let rs = t.calls.find((c) => c[0] === 'restore')
                assert.strict.deepEqual(rs[1], [{ id: 'p1', name: 'P1', crules: J({ [T1]: 'y', [T2]: 'n' }), userIdUpdate: 'u0', timeUpdate: 't0' }])
                assert.strict.deepEqual(rs[2], { merge: false })
            })

            it('RW-729 R5 引用端寫入階段之錯誤於重新拋出前遮罩 id[…]→id[*](字串遮罩; Error 以遮罩後 message 建新 Error; 非字串非 Error 原樣); 主體階段之錯誤原樣拋出(含群組 id)', async function() {
                //引用端階段: 字串
                let t1 = mk({ failProcOrm: 'failed to save data: id[private-holder-id]' })
                let e1 = await t1.go().then(() => 'RESOLVED', (err) => err)
                assert.strict.equal(e1, 'failed to save data: id[*]')
                //引用端階段: Error → 新 Error(不同物件、遮罩後 message)
                let orig = new Error('failed to save data: id[private-holder-id]')
                let t2 = mk({ failProcOrm: orig })
                let e2 = await t2.go().then(() => 'RESOLVED', (err) => err)
                assert.strict.ok(e2 instanceof Error)
                assert.strict.notEqual(e2, orig, '以遮罩後 message 建新 Error, 不外送含 id 之原物件')
                assert.strict.equal(e2.message, 'failed to save data: id[*]')
                assert.strict.ok(!String(e2.stack).includes('private-holder-id'), '新 Error 之 stack 亦不含引用端 id')
                //引用端階段: 非字串非 Error → 原樣
                let sentinel = { code: 7 }
                let t3 = mk({ failProcOrm: sentinel })
                assert.strict.equal(await t3.go().then(() => 'RESOLVED', (err) => err), sentinel)
                //主體階段: 原樣(群組 id 非個資)
                let t4 = mk({ failMain: 'failed to save data: id[id-g1]' })
                assert.strict.equal(await t4.go().then(() => 'RESOLVED', (err) => err), 'failed to save data: id[id-g1]')
                let orig4 = new Error('main: id[id-g1]')
                let t5 = mk({ failMain: orig4 })
                assert.strict.equal(await t5.go().then(() => 'RESOLVED', (err) => err), orig4, '主體階段之 Error 為同一物件')
                //log 之 raw 恆遮罩(兩階段皆然)
                assert.strict.equal(t4.logs.find((x) => x.event === 'refCascade-restored').raw, 'failed to save data: id[*]')
                assert.strict.ok(!JSON.stringify(t1.logs).includes('private-holder-id') && !JSON.stringify(t2.logs).includes('private-holder-id'))
            })

        })

    })

    //__NEXT__

})


//mulberry32: 確定性 PRNG(隨機交錯可重現; 失敗訊息帶種子)
function mulberry32(a) {
    return function() {
        a |= 0
        a = (a + 0x6D2B79F5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

//jitter: 隨機讓出事件迴圈(不讓出／微任務／setImmediate／1ms 計時器), 於並行測試製造交錯點
async function jitter(rand) {
    let x = rand()
    if (x < 0.35) {
        return
    }
    if (x < 0.7) {
        await Promise.resolve()
        return
    }
    if (x < 0.95) {
        await new Promise((resolve) => setImmediate(resolve))
        return
    }
    await sleep(1)
}
