//多人同時編輯之寫入契約: 伺服端存檔(procCore.updateGrups／updatePemis／updateTargets／updateUsers)之基準比對、鎖、只改不增、伺服器專有欄位、存檔回傳之單元測試(perm-run01; 規則帳本 R-BASELINE-01、R-CONTRACT-01、R-LOCK-CORE-01、R-ONLYMOD-01)
//
//受測: server/procCore.mjs(真), 依賴一律真實——w-serv-orm 實例(test/tools/unitOrm.mjs 之 mkCore: 真 WServOrm 包住替身資料表 mkTable, 取得真 procOrm／withTabLocks／guardWrite)、
//  server/lockSave.mjs＋wsemi cacheSt(真)、src/js/rowDigest.mjs＋w-serv-orm/src/baseline.mjs(真, 版本 h1)、src/schema/contracts(真); 僅資料表以記憶體替身取代 w-orm-lmdb, 不起服務.
//斷言原則: 預期值獨立於實作——「是否被拒」「寫了什麼」一律以替身資料表之快照(snapshot)與呼叫計數(cnt／instrument)驗證; 基準以 makeBaseline(rows, 表) 建(前端同函數, 規格 §8), 但不以被測函數算預期結果.
//
//規格依據: C:\opensrcOper\dspec\多人同時編輯之寫入契約.md(以下簡稱「規格」)第 3～8、13 節.
//規格句(本檔所翻譯者; 每條 assertion 之註解標明所對應者):
//  [S6-ATOMIC]  規格 §6「原子: 讀取、比對、diff、寫入在同一表鎖內(guardWrite)」
//  [S6-WHOLE]   規格 §6「整表存檔: 刪除集合＝基準內(且在 scope 內)之 id − 送出之 id, 不得以『庫內全部 − 送出』」「只寫客戶端欄位與雙方欄位; 伺服器專有欄位取庫內值」
//  [S6-MOD]     規格 §6「修改: 只改不增(autoInsert:false); 列已不存在 → rowNotFound」
//  [S6-DEL]     規格 §6「刪除: 檢查存在或實際刪除筆數; 未命中 → rowNotFound(不帶基準者亦同)」
//  [S6-OPT]     規格 §6「procOrm 之第 5 參數 opt(mustExist、keepUserId)只能由伺服端程式自組, 不得把客戶端傳入之參數原樣展開給 procOrm」
//  [S6-KEYS]    規格 §6「拒收鍵固定英文 baselineMismatch／rowNotFound／baselineFormat, 各套件轉為自身語系鍵, 一律提示重新載入; rowsInvalid 屬伺服端資料錯誤, 回伺服端錯誤鍵並記 log」
//  [S4-SERVER]  規格 §4「伺服器專有(userId／timeCreate／userIdUpdate／timeUpdate): 不入基準, 存檔不採用客戶端值(保留庫內值)」
//  [S5-DIGEST]  規格 §5「undefined／null／'' → 同一空值」「基準之序即名次: 他人重排會被偵測, 系統重編號(名次不變)不會」「不識之格式或版本一律拒收 baselineFormat, 不得降級為不帶基準」
//  [S7-LOCK]    規格 §7「每表一鍵; 須取表鎖者: 後台存檔、逐列 RPC、外部同步(delAll＋insert 整段)、系統直寫」「逐列實體之業務鎖與表鎖並用時先表鎖後實體鎖」
//  [S8-RET]     規格 §8「存檔成功後之新基準取自伺服端, 且須立即取得: 存檔 API 回傳寫入後之列(鎖內新鮮讀取)」「不得以自己送出之值當新基準」
//  V1  A、B 載入同一表, A 存, B 以舊基準存 → 整次拒收、零寫入      V3  外部同步改變內容 → 後台以舊基準被拒      V5  系統寫伺服器專有欄位後後台可存且該欄維持系統所寫之值
//  V6  修改時該列已被刪 → rowNotFound, 列不復活      V7  刪除已不存在之列(帶或不帶基準) → rowNotFound      V9  他人重排被拒／系統重編號可存
//  V12 清單頁多列提交其中一列過期 → 零寫入      V13 格式或版本不識之基準 → baselineFormat, 不當作未帶基準      V14 並行: 比對與寫入間不可能插入他人寫入(同鎖), 測試以人為延遲驗證
//
//輸入空間表(軸 × 格; 案數為 mocha 實測, 見檔尾「案數」註記; 表軸 T ＝ users／grups／pemis／targets 四表, 逐表以迴圈產生 it, 標題帶表名):
//  UB-1  他人動作 {改任一列×3, 刪任一列×3, 增一列, 只重排, 清空} 9 × T 4 ＝ 36(已測: 全部; 持舊基準存檔 → saveStale, reason 依序 rowChanged／rowRemoved／rowAdded／rowReordered／rowRemoved, 零寫入, srLog 無列 id 與個資)
//        ＋ UB-1b V12 多列提交其中一列過期 × T 4 ＋ UB-1c 對照(無人動過可存) × T 4 ＝ 8
//  UB-2  不誤擋 {外部同步式整批重寫, 系統重編號, 空值不同表示(欄 description／from × 形式 null／缺欄)4} 6 × T 4 ＝ 24(已測: 全部)
//  UB-3  名次(V9) × T 4(他人只重排 → 被拒 saveStale/rowReordered 零寫入; 重新載入以新基準送出成功)
//  UB-4  伺服器專有欄 {後台列內容改動, 外部列指派欄改動〔targets 無指派欄, 刻意不測〕, 僅偽造四欄不寫入(有基準／無基準)} × T 4 ＝ 15
//  UB-5  只改不增／刪除未命中(V6／V7) {改幽靈列, 刪幽靈列} × {無基準, 有基準} × T 4 ＝ 16
//  UB-6  基準格式(V13) 壞基準 17 種 × T 4 ＝ 68; 未帶基準(省略／null 2 形) × T 4 ＝ 8(沿用既有政策, 可存); 核心層拒收鍵轉換(baselineFormat／baselineMismatch×4 細因／rowNotFound／rowsInvalid 共 7 格) × T 4 ＝ 28;
//        庫內讀回重複主鍵(rowsInvalid) × T 4 ＝ 4; 格式驗證早於占位(UB-6d) × T 4 ＝ 4; 小計 112
//  UB-7  並行(V14) {grups 事件交錯＋序列等價 1, 同基準並行恰一成功 × T 4, 外部 guardWrite 與存檔共鎖 × T 4} ＝ 9
//  UB-8  引用連帶與引用端鎖 {grups 改名→users, pemis 改名→grups, targets 刪除→pemis} × {先持引用端鎖則等待, 引用端寫入時持鎖, 回傳 others} 3 × 3 ＝ 9
//  UB-9  存檔回傳 × T 4 × {returnRows 回 rows＋others 並以回傳 rows 建新基準立即再存〔舊基準對照被拒〕, 新增列置首, 非 true 值回字串, 失敗不回 rows} ＝ 16
//  UB-10 客戶端 opt 過濾 × T 4(含 users 伺服端 pickKeysOnly 對照 1) ＋ 重複仍被拒 × T 4 ＝ 9
//  UB-11 整表存檔之刪除集合 × T 4 ＋ 載入後再存只刪被刪之列 × T 4 ＝ 8
//  UB-12 靜態站點不變式(procCore／cascadeWrite 原始碼) 6
//  未測(刻意): 多行程部署(規格 §12 不在支援範圍)、前端草稿保護 V11(見 unit-draftSync／unit-dataReloadGuard)、V10 前後端基準同值(見 unit-rowDigest)、外部匯入 srcKey 差異同步(V2, 本套件另案)、
//        pickKeysOnly 模式之 mustExist 細節(見 unit-procCore-external EXT-G)、不帶基準之既有政策(見 unit-procCore-updateTabItems／external).
//跑法: node C:/opensrcOper/tools/quiet-run.mjs --name ub -- node node_modules/mocha/bin/mocha.js --no-parallel test/unit-procCore-baseline.test.mjs --timeout 120000 --exit
import assert from 'assert'
import path from 'path'
import { fileURLToPath } from 'url'
import cloneDeep from 'lodash-es/cloneDeep.js'
import cacheSt from 'wsemi/src/cacheSt.mjs'
import ds from '../src/schema/index.mjs'
import proc, { pickClientOpt } from '../server/procCore.mjs'
import { autoDecl } from './tools/declHelper.mjs'
import createLockSave from '../server/lockSave.mjs'
import { makeBaseline } from '../src/js/rowDigest.mjs'
import { mkTable, mkCore, mkSrLog } from './tools/unitOrm.mjs'
import { sourceLines } from './tools/srcScan.mjs'


const A = assert.strict
const projRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

const TABLES = ['users', 'grups', 'pemis', 'targets']
const FN = { users: 'updateUsers', grups: 'updateGrups', pemis: 'updatePemis', targets: 'updateTargets' }
const ASSIGN = { users: 'cgrups', grups: 'cpemis', pemis: 'crules', targets: null } //授權指派欄(外部列後台可寫之唯一欄)
const UID = 'id-admin'
const OKS = 'saveTabItemsSuccess'
const PH = '{新增}' //前端新列之稽核欄位佔位字
const OR = { mode: 'OR', isActive: 'y' }

//各表種子列之 id(users／grups／pemis 以 id-xx; targets 之 id 即標的路徑)
const IDS = {
    users: ['id-u1', 'id-u2', 'id-u3'],
    grups: ['id-g1', 'id-g2', 'id-g3'],
    pemis: ['id-p1', 'id-p2', 'id-p3'],
    targets: ['專案A/頁1/區塊1', '專案A/頁1/區塊2', '專案A/頁1/區塊3'],
}
const NAMES = {
    users: ['peter', 'mary', 'john'],
    grups: ['權限群組M1', '權限群組M2', '權限群組M3'],
    pemis: ['權限P1', '權限P2', '權限P3'],
}

let J = (o) => JSON.stringify(o)
let sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let flush = async (n = 20) => {
    for (let i = 0; i < n; i++) {
        await new Promise((resolve) => setImmediate(resolve))
    }
}


// =====================================================================
// 種子與輔助
// =====================================================================

//seedRows: 各表 3 列(order 1～3; 稽核欄位逐列相異, 使「回退為舊值／串到別列」可被辨識); 第 2 列 description 為 ''(供空值等價案);
//  引用關係(供 UB-8): users[0].cgrups 引用 grups[0]; grups[0].cpemis 引用 pemis[0]; pemis[0].crules 引用 targets[0]; 其餘 '{}'
function seedRows() {
    let audit = (t, k) => ({ userId: `id-seed-${t}-${k}`, timeCreate: `2026-01-0${k + 1}T00:00:00.000+08:00`, userIdUpdate: `id-seed-upd-${t}-${k}`, timeUpdate: `2026-01-0${k + 1}T01:00:00.000+08:00` })
    let mk = (t, k, o) => ({ ...ds[t].funNew(), ...audit(t, k), id: IDS[t][k], order: k + 1, from: '', description: k === 1 ? '' : `d-${t}-${k}`, ...o })
    return {
        users: [
            mk('users', 0, { name: NAMES.users[0], email: 'peter@example.com', cgrups: J({ [NAMES.grups[0]]: OR }), isAdmin: 'n', isActive: 'y' }),
            mk('users', 1, { name: NAMES.users[1], email: 'mary@example.com', cgrups: J({ [NAMES.grups[1]]: OR }), isAdmin: 'n', isActive: 'y' }),
            mk('users', 2, { name: NAMES.users[2], email: 'john@example.com', cgrups: '{}', isAdmin: 'n', isActive: 'y' }),
        ],
        grups: [
            mk('grups', 0, { name: NAMES.grups[0], cpemis: J({ [NAMES.pemis[0]]: OR }) }),
            mk('grups', 1, { name: NAMES.grups[1], cpemis: J({ [NAMES.pemis[1]]: OR }) }),
            mk('grups', 2, { name: NAMES.grups[2], cpemis: '{}' }),
        ],
        pemis: [
            mk('pemis', 0, { name: NAMES.pemis[0], crules: J({ [IDS.targets[0]]: 'y' }) }),
            mk('pemis', 1, { name: NAMES.pemis[1], crules: J({ [IDS.targets[1]]: 'y' }) }),
            mk('pemis', 2, { name: NAMES.pemis[2], crules: '{}' }),
        ],
        targets: [
            mk('targets', 0, {}),
            mk('targets', 1, {}),
            mk('targets', 2, {}),
        ],
    }
}

//extraRow: 「他人」直接寫入庫之新列(完整欄位, 名稱／email 唯一, order 接續為 4)
function extraRow(t, tag, o = {}) {
    let r = { ...ds[t].funNew(), userId: 'id-other', timeCreate: '2026-02-01T00:00:00.000+08:00', userIdUpdate: 'id-other', timeUpdate: '2026-02-01T00:00:00.000+08:00', order: 4, from: '', description: `d-extra-${tag}` }
    r.id = (t === 'targets') ? `專案X/${tag}` : `id-x-${t}-${tag}`
    if (t === 'users') {
        r.name = `x-${tag}`
        r.email = `x-${tag}@example.com`
        r.cgrups = '{}'
    }
    else if (t === 'grups') {
        r.name = `群組X-${tag}`
        r.cpemis = '{}'
    }
    else if (t === 'pemis') {
        r.name = `權限X-${tag}`
        r.crules = '{}'
    }
    return { ...r, ...o }
}

//newRowClient: 模擬清單頁 addItem 之新列(稽核欄位為佔位字、transient _isNew)
function newRowClient(t, tag, o = {}) {
    return { ...extraRow(t, tag), userId: PH, timeCreate: PH, userIdUpdate: PH, timeUpdate: PH, _isNew: true, ...o }
}

//createEnv: 每案一組全新之替身資料表、真鎖與 procOrm(mkCore)、占位與 procCore
//  opt.seedEdit(seed) 於建表前改種子; opt.spy 為真時 procOrm 以記錄呼叫引數之包裝代之(env.calls: [[userId, 表, mode, 資料, opt], ...]); opt.proc 展開進 proc 之選項(可覆蓋 guardWrite 做接縫注入)
let envs = []
function createEnv(opt = {}) {
    let seed = seedRows()
    if (opt.seedEdit) {
        opt.seedEdit(seed)
    }
    let woItems = {}
    for (let t of TABLES) {
        woItems[t] = mkTable(seed[t])
    }
    let { srLog, logs } = mkSrLog()
    let cst = cacheSt()
    let core = mkCore(ds, woItems)
    let calls = []
    let procOrm = opt.spy ? async (...args) => {
        calls.push(args)
        return core.procOrm(...args)
    } : core.procOrm
    let pc = autoDecl(proc(woItems, procOrm, { srLog, ...core.lock, lockSave: createLockSave(cst), ...(opt.proc || {}) }), woItems)
    let env = { seed, woItems, logs, cst, core, pc, calls }
    envs.push(env)
    return env
}

//run: 模擬 kpFunExt 入口(users 與 WWebPerm 之 kpFunExt 相同, 先經 pickClientOpt 過濾客戶端 opt; 其餘三表由 procCore 自身過濾), 回 { ok, v }
async function run(pc, t, rows, optClient, userId = UID) {
    try {
        let opt = (t === 'users') ? pickClientOpt(optClient) : optClient
        return { ok: true, v: await pc[FN[t]](userId, cloneDeep(rows), opt) }
    }
    catch (err) {
        return { ok: false, v: err }
    }
}

//rowsSorted: 庫內現況(依 order), 取自替身快照(不經任何被包裝之 select, 亦不計入呼叫計數)
let rowsSorted = (woItems, t) => JSON.parse(woItems[t].snapshot()).sort((a, b) => a.order - b.order)
let loadRows = rowsSorted //前端載入時所見之列
let editFirst = (rows, patch) => rows.map((r, k) => (k === 0 ? { ...r, ...patch } : r))
let snapAll = (w) => JSON.stringify(TABLES.map((t) => w[t].snapshot()))
let cntAll = (w) => JSON.stringify(TABLES.map((t) => w[t].cnt)) //四表 insert／save／del／delAll 次數
let writesOf = (w) => TABLES.reduce((a, t) => a + w[t].cnt.insert + w[t].cnt.save + w[t].cnt.del + w[t].cnt.delAll, 0)
let staleLogs = (logs) => logs.filter((l) => l.event === 'updateTabItems-stale-error')

//instrument: 包裝四表 select／insert／save／del／delAll 計次(供「在任何讀寫之前」之斷言; mkTable.cnt 不計 select)
function instrument(woItems) {
    let calls = {}
    for (let t of TABLES) {
        calls[t] = { select: 0, insert: 0, save: 0, del: 0, delAll: 0 }
        for (let m of Object.keys(calls[t])) {
            let f = woItems[t][m]
            woItems[t][m] = (...args) => {
                calls[t][m]++
                return f(...args)
            }
        }
    }
    return calls
}
let sumCalls = (calls) => TABLES.reduce((a, t) => a + Object.values(calls[t]).reduce((x, y) => x + y, 0), 0)

//assertNoLeak: srLog 不得含任何列 id 與個資值(規則帳本「srLog 只記錯誤鍵、原因、筆數」; EXT-S6)
function assertNoLeak(logs, seed, extras = []) {
    let s = JSON.stringify(logs)
    for (let t of TABLES) {
        for (let r of [...seed[t], ...extras]) {
            for (let k of ['id', 'name', 'email', 'description']) {
                if (typeof r[k] === 'string' && r[k] !== '') {
                    A.ok(!s.includes(r[k]), `srLog 不得含 ${t}.${k} 之值: ${r[k]}`)
                }
            }
        }
    }
}


describe('unit-procCore-baseline (多人同時編輯之寫入契約: 基準／鎖／只改不增／專有欄位／存檔回傳)', function() {

    afterEach(function() {
        envs.forEach((e) => e.cst.clear()) //停止 cacheSt 之 TTL 偵測 timer, 避免 mocha 不結束
        envs = []
    })


    // =================================================================
    // UB-1 先動先贏未削弱(V1／V3)
    // =================================================================

    //ACTS: 「他人」於我載入之後直接改庫(經替身資料表, 不經 procCore); reason 為規格 §6 比對不符之細因, 依 rowChanged→rowRemoved→rowAdded→rowReordered 之序取第一個成立者
    const ACTS = [
        ...[0, 1, 2].map((k) => ({ name: `他人改第 ${k + 1} 列`, reason: 'rowChanged', act: async (w, t, rows) => { await w[t].save([{ id: rows[k].id, description: `by-other-${k}` }]) } })),
        ...[0, 1, 2].map((k) => ({ name: `他人刪第 ${k + 1} 列`, reason: 'rowRemoved', act: async (w, t, rows) => { await w[t].del([{ id: rows[k].id }]) } })),
        { name: '他人增一列', reason: 'rowAdded', act: async (w, t) => { await w[t].insert([extraRow(t, 'u1')]) } },
        { name: '他人只重排(名次改變)', reason: 'rowReordered', act: async (w, t, rows) => { await w[t].save([{ id: rows[0].id, order: rows[1].order }, { id: rows[1].id, order: rows[0].order }]) } },
        { name: '他人清空整表', reason: 'rowRemoved', act: async (w, t) => { await w[t].delAll() } },
    ]

    describe('UB-1 先動先贏(V1／V3): 持舊基準存檔一律 saveStale、零寫入', function() {
        for (let t of TABLES) {
            for (let a of ACTS) {
                it(`UB-1 [${t}] ${a.name} → 持舊基準存檔 reject saveStale(reason ${a.reason}), 零寫入, srLog 無列 id／個資`, async function() {
                    let env = createEnv()
                    let { woItems, logs, pc, seed } = env
                    let rows = loadRows(woItems, t)
                    let bl = makeBaseline(rows, t) //我載入時之基準
                    await a.act(woItems, t, rows) //他人先動
                    let snap0 = snapAll(woItems)
                    let cnt0 = cntAll(woItems)
                    let r = await run(pc, t, editFirst(rows, { description: 'edited-by-A' }), { baseline: bl }) //我帶舊基準、改第 1 列
                    //[V1／V3] 以舊基準存檔 → 整次拒收(語系鍵 saveStale)
                    A.deepEqual(r, { ok: false, v: 'saveStale' })
                    //[V1／S6-ATOMIC] 零寫入: 四表快照逐位元不變, insert／save／del／delAll 次數皆不增
                    A.equal(snapAll(woItems), snap0, '被拒時資料表須逐位元不變')
                    A.equal(cntAll(woItems), cnt0, '被拒時不得有任何寫入呼叫')
                    //[S6-KEYS] srLog: stale-error 一筆, msg saveStale, reason 依 比對不符細因; 另有集中 errLog
                    let st = staleLogs(logs)
                    A.equal(st.length, 1)
                    A.equal(st[0].level, 'error')
                    A.equal(st[0].keyTable, t)
                    A.equal(st[0].msg, 'saveStale')
                    A.equal(st[0].reason, a.reason)
                    A.equal(st[0].userId, UID)
                    A.ok(typeof st[0].n === 'number' && st[0].n >= 1, 'n 為差異筆數(>=1)')
                    A.ok(logs.some((l) => l.level === 'error' && l.event === `${FN[t]}-error` && l.msg === 'saveStale'), 'errLog 記 err key saveStale')
                    //srLog 不含列 id 與個資(他人新增之列亦然)
                    assertNoLeak(logs, seed, [extraRow(t, 'u1')])
                })
            }
        }
    })

    //V12: 清單頁多列提交, 其中一列過期 → 零寫入(未過期之列亦不寫入, 不部分變更)
    describe('UB-1b 多列提交其中一列過期(V12)', function() {
        for (let t of TABLES) {
            it(`UB-1b [${t}] 我改第 1、2 列, 他人改第 3 列 → 整次 saveStale, 第 1、2 列亦未寫入`, async function() {
                let { woItems, pc } = createEnv()
                let rows = loadRows(woItems, t)
                let bl = makeBaseline(rows, t)
                await woItems[t].save([{ id: rows[2].id, description: 'by-other-2' }])
                let snap0 = snapAll(woItems)
                let cnt0 = cntAll(woItems)
                let sent = rows.map((r, k) => (k < 2 ? { ...r, description: `edited-${k}` } : r))
                let r = await run(pc, t, sent, { baseline: bl })
                A.deepEqual(r, { ok: false, v: 'saveStale' }) //[V12] 其中一列過期 → 整次拒收
                A.equal(snapAll(woItems), snap0, '[V12] 零寫入: 未過期之第 1、2 列亦不得寫入')
                A.equal(cntAll(woItems), cnt0)
                A.notEqual(woItems[t].get(rows[0].id).description, 'edited-0')
                A.notEqual(woItems[t].get(rows[1].id).description, 'edited-1')
            })
        }
    })

    //對照: 無人動過 → 舊基準(即最新)可存, 證明上列之拒收來自「他人動過」而非測試環境本身
    describe('UB-1c 對照: 無人動過', function() {
        for (let t of TABLES) {
            it(`UB-1c [${t}] 無人動過 → 帶載入基準存檔成功, 只第 1 列被寫入`, async function() {
                let { woItems, pc } = createEnv()
                let rows = loadRows(woItems, t)
                let bl = makeBaseline(rows, t)
                let before = rowsSorted(woItems, t)
                let r = await run(pc, t, editFirst(rows, { description: 'edited-by-A' }), { baseline: bl })
                A.deepEqual(r, { ok: true, v: OKS })
                A.equal(woItems[t].get(rows[0].id).description, 'edited-by-A')
                A.deepEqual(woItems[t].get(rows[1].id), before[1], '未改之列不得被寫入')
                A.deepEqual(woItems[t].get(rows[2].id), before[2], '未改之列不得被寫入')
            })
        }
    })


    // =================================================================
    // UB-2 不誤擋(規格 §14「內容摘要」取捨: 外部同步整批重寫而內容未變不可誤擋)
    // =================================================================

    describe('UB-2 不誤擋: 舊基準仍可存', function() {
        const T_SYNC = '2026-06-01T00:00:00.000+08:00'
        for (let t of TABLES) {
            //①外部同步式整批重寫: 所有列伺服器專有四欄與 timeUpdate 全變、order 重編號但名次不變、內容不變
            it(`UB-2① [${t}] 外部同步式整批重寫(四個專有欄與 timeUpdate 全變、order 重編號名次不變、內容不變) → 舊基準可存; 專有欄位維持系統(同步)所寫之值`, async function() {
                let { woItems, pc } = createEnv()
                let rows = loadRows(woItems, t)
                let bl = makeBaseline(rows, t)
                for (let k = 0; k < rows.length; k++) {
                    await woItems[t].save([{ id: rows[k].id, userId: 'id-sync', timeCreate: T_SYNC, userIdUpdate: 'id-sync', timeUpdate: `2026-06-01T00:00:0${k}.000+08:00`, order: (k + 1) * 10 }])
                }
                let r = await run(pc, t, editFirst(rows, { description: 'edited-by-A' }), { baseline: bl })
                A.deepEqual(r, { ok: true, v: OKS }, '[S14] 內容未變之整批重寫不得誤擋')
                let after = rowsSorted(woItems, t)
                A.deepEqual(after.map((v) => v.id), rows.map((v) => v.id), '[V9] 名次不變')
                A.equal(after[0].description, 'edited-by-A', '編修已寫入')
                A.equal(after[1].description, rows[1].description)
                A.equal(after[2].description, rows[2].description)
                for (let v of after) {
                    //[V5／S4-SERVER] 專有欄位維持系統(同步)所寫之值, 不被客戶端持舊之值回寫
                    A.equal(v.userId, 'id-sync', `${v.id} userId 不得被舊畫面回寫`)
                    A.equal(v.timeCreate, T_SYNC, `${v.id} timeCreate 不得被舊畫面回寫`)
                }
                A.equal(after[0].userIdUpdate, UID, '被寫入之列更新者為操作者')
            })

            //②系統重編號: order 全變、名次不變(V9 後半)
            it(`UB-2② [${t}] 系統重編號(order 全變、名次不變) → 舊基準可存(V9 後半)`, async function() {
                let { woItems, pc } = createEnv()
                let rows = loadRows(woItems, t)
                let bl = makeBaseline(rows, t)
                for (let k = 0; k < rows.length; k++) {
                    await woItems[t].save([{ id: rows[k].id, order: (k + 1) * 100 }])
                }
                let r = await run(pc, t, editFirst(rows, { description: 'edited-by-A' }), { baseline: bl })
                A.deepEqual(r, { ok: true, v: OKS })
                let after = rowsSorted(woItems, t)
                A.deepEqual(after.map((v) => v.id), rows.map((v) => v.id), '名次不變')
                A.equal(after[0].description, 'edited-by-A')
            })

            //③空值不同表示: DB 為 null／缺欄, 基準建立時為 ''(規格 §5: undefined／null／'' 同一空值)
            for (let field of ['description', 'from']) {
                for (let form of ['null', 'missing']) {
                    it(`UB-2③ [${t}] 庫內第 2 列 ${field} 為 ${form}、基準建立時為 '' → 可存(空值等價, 已知缺口 (d))`, async function() {
                        let { woItems, pc } = createEnv()
                        let rows = loadRows(woItems, t)
                        A.equal(rows[1][field], '', '前提: 載入時第 2 列該欄為空字串')
                        let bl = makeBaseline(rows, t)
                        let alt = cloneDeep(rows[1])
                        if (form === 'null') {
                            alt[field] = null
                        }
                        else {
                            delete alt[field]
                        }
                        await woItems[t].save([alt], { merge: false }) //整筆覆寫為另一種空值表示
                        let r = await run(pc, t, editFirst(rows, { description: 'edited-by-A' }), { baseline: bl })
                        A.deepEqual(r, { ok: true, v: OKS }, '[S5-DIGEST] 空值不同表示不得誤擋')
                        A.equal(woItems[t].get(rows[0].id).description, 'edited-by-A')
                        A.equal(woItems[t].get(rows[1].id).id, rows[1].id, '第 2 列仍在')
                    })
                }
            }
        }
    })


    // =================================================================
    // UB-3 名次(V9)
    // =================================================================

    describe('UB-3 名次(V9)', function() {
        for (let t of TABLES) {
            it(`UB-3 [${t}] 他人只重排 → 持舊基準被拒 saveStale/rowReordered 零寫入; 重新載入以新基準送出成功`, async function() {
                let { woItems, logs, pc } = createEnv()
                let rows = loadRows(woItems, t)
                let bl = makeBaseline(rows, t)
                //他人只改 order 值使名次改變(第 1、2 列對調), 其餘內容不動
                await woItems[t].save([{ id: rows[0].id, order: rows[1].order }, { id: rows[1].id, order: rows[0].order }])
                let snap0 = snapAll(woItems)
                let cnt0 = cntAll(woItems)
                let r = await run(pc, t, editFirst(rows, { description: 'edited-by-A' }), { baseline: bl })
                A.deepEqual(r, { ok: false, v: 'saveStale' }, '[V9] 他人重排(名次改變)須被拒')
                A.equal(snapAll(woItems), snap0)
                A.equal(cntAll(woItems), cnt0)
                A.equal(staleLogs(logs)[0].reason, 'rowReordered')
                //重新載入: 取最新列與新基準後再送出
                let rows2 = loadRows(woItems, t)
                A.deepEqual(rows2.map((v) => v.id), [rows[1].id, rows[0].id, rows[2].id], '前提: 載入之名次為重排後')
                let bl2 = makeBaseline(rows2, t)
                A.notDeepEqual(bl2, bl, '新舊基準不同(名次入基準)')
                let r2 = await run(pc, t, editFirst(rows2, { description: 'edited-after-reload' }), { baseline: bl2 })
                A.deepEqual(r2, { ok: true, v: OKS })
                A.equal(woItems[t].get(rows2[0].id).description, 'edited-after-reload')
            })
        }
    })


    // =================================================================
    // UB-4 伺服器專有欄位(V5／規格 §4、§6): 存檔不採用客戶端值
    // =================================================================

    describe('UB-4 伺服器專有欄位(V5): 存檔不採用客戶端值', function() {
        const FORGED = { userId: 'forged-owner', timeCreate: '1999-01-01T00:00:00.000+08:00', userIdUpdate: 'forged-updater', timeUpdate: '1999-01-01T00:00:01.000+08:00' }
        let forgeAll = (rows) => rows.map((r) => ({ ...r, ...FORGED }))
        //第 2 列為外部列(from appX), 其餘為後台列
        let seedEdit = (seed) => {
            for (let t of TABLES) {
                seed[t][1].from = 'appX'
            }
        }

        for (let t of TABLES) {
            it(`UB-4a [${t}] 後台列內容改動且客戶端送偽造之四個專有欄 → 庫內 userId／timeCreate 維持原值, userIdUpdate／timeUpdate 為操作者與現在; 僅偽造欄不同之列不被寫入`, async function() {
                let { woItems, pc, seed } = createEnv({ seedEdit })
                let rows = loadRows(woItems, t)
                let bl = makeBaseline(rows, t)
                let before = rowsSorted(woItems, t)
                let sent = forgeAll(editFirst(rows, { description: 'changed-by-A' }))
                let r = await run(pc, t, sent, { baseline: bl })
                A.deepEqual(r, { ok: true, v: OKS })
                let a0 = woItems[t].get(rows[0].id)
                A.equal(a0.description, 'changed-by-A', '內容改動已寫入')
                //[S4-SERVER／V5] userId／timeCreate 取庫內原值, 不採客戶端偽造值
                A.equal(a0.userId, seed[t][0].userId)
                A.equal(a0.timeCreate, seed[t][0].timeCreate)
                //userIdUpdate／timeUpdate 由 procOrm 以操作者與現在時間覆寫
                A.equal(a0.userIdUpdate, UID)
                A.ok(a0.timeUpdate !== FORGED.timeUpdate && a0.timeUpdate !== seed[t][0].timeUpdate, `timeUpdate 應為現在, 實得 ${a0.timeUpdate}`)
                //僅專有欄不同之列(含外部列)視為無變更, 不寫入
                A.deepEqual(woItems[t].get(rows[1].id), before[1], '外部列(僅偽造欄不同)不得被寫入')
                A.deepEqual(woItems[t].get(rows[2].id), before[2], '後台列(僅偽造欄不同)不得被寫入')
            })

            if (ASSIGN[t] !== null) {
                it(`UB-4b [${t}] 外部列改指派欄(${ASSIGN[t]})且客戶端送偽造之四個專有欄 → 庫內 userId／timeCreate 維持原值, from 不變; 其餘僅偽造欄不同之列不被寫入`, async function() {
                    let { woItems, pc, seed } = createEnv({ seedEdit })
                    let rows = loadRows(woItems, t)
                    let bl = makeBaseline(rows, t)
                    let before = rowsSorted(woItems, t)
                    let newAssign = (t === 'users') ? J({ [NAMES.grups[2]]: OR }) : (t === 'grups' ? J({ [NAMES.pemis[2]]: OR }) : J({ [IDS.targets[2]]: 'y' }))
                    let sent = forgeAll(rows.map((r, k) => (k === 1 ? { ...r, [ASSIGN[t]]: newAssign } : r)))
                    let r = await run(pc, t, sent, { baseline: bl }) //外部列改指派欄須附基準
                    A.deepEqual(r, { ok: true, v: OKS })
                    let a1 = woItems[t].get(rows[1].id)
                    A.equal(a1[ASSIGN[t]], newAssign, '指派欄改動已寫入')
                    A.equal(a1.from, 'appX', '外部列 from 不變')
                    A.equal(a1.userId, seed[t][1].userId, '[S4-SERVER／V5] 外部列 userId 維持庫內原值')
                    A.equal(a1.timeCreate, seed[t][1].timeCreate, '[S4-SERVER／V5] 外部列 timeCreate 維持庫內原值')
                    A.equal(a1.userIdUpdate, UID)
                    A.deepEqual(woItems[t].get(rows[0].id), before[0], '後台列(僅偽造欄不同)不得被寫入')
                    A.deepEqual(woItems[t].get(rows[2].id), before[2], '後台列(僅偽造欄不同)不得被寫入')
                })
            }

            for (let withBl of [true, false]) {
                it(`UB-4c [${t}] 全部列僅四個專有欄不同(後台列與外部列, ${withBl ? '帶基準' : '未帶基準'}) → 成功但零寫入, 資料逐位元不變`, async function() {
                    let { woItems, pc } = createEnv({ seedEdit })
                    let rows = loadRows(woItems, t)
                    let bl = makeBaseline(rows, t)
                    let snap0 = snapAll(woItems)
                    let cnt0 = cntAll(woItems)
                    let r = await run(pc, t, forgeAll(rows), withBl ? { baseline: bl } : undefined)
                    A.deepEqual(r, { ok: true, v: OKS })
                    //[S6-WHOLE／V5] 專有欄位取庫內值 → 僅專有欄不同不產生寫入
                    A.equal(cntAll(woItems), cnt0, '不得有任何 insert／save／del 呼叫')
                    A.equal(snapAll(woItems), snap0, '資料不得被偽造值覆寫')
                })
            }
        }
    })


    // =================================================================
    // UB-5 只改不增、刪除未命中(V6／V7): 故障注入「讀到的列在寫入時已不存在」
    // =================================================================

    //injectGhost: 包裝替身表 select——無參數呼叫(procCore 之 read)回含一筆「幽靈列」(庫內已不存在)之列表; 帶條件(如 mustExist 之 { id: { $in } })之呼叫回真實庫內狀態
    function injectGhost(tbl, ghost) {
        let orig = tbl.select
        tbl.select = async (find) => {
            let rs = await orig(find)
            return find === undefined ? [...rs, cloneDeep(ghost)] : rs
        }
    }

    describe('UB-5 只改不增、刪除未命中(V6／V7)', function() {
        for (let t of TABLES) {
            for (let withBl of [false, true]) {
                let tag = withBl ? '帶基準' : '不帶基準'
                it(`UB-5 [${t}] 修改幽靈列(${tag}) → reject saveStale(rowNotFound 轉), 庫內不出現該列(不復活), 同批其他列亦不寫入`, async function() {
                    let { woItems, logs, pc } = createEnv()
                    let rows = loadRows(woItems, t)
                    let ghost = extraRow(t, 'ghost')
                    injectGhost(woItems[t], ghost)
                    let bl = makeBaseline([...rows, ghost], t) //基準含幽靈列(我讀到它時它還在)
                    let snap0 = snapAll(woItems)
                    let cnt0 = cntAll(woItems)
                    let sent = [...editFirst(rows, { description: 'edited-by-A' }), { ...ghost, description: 'ghost-edited' }]
                    let r = await run(pc, t, sent, withBl ? { baseline: bl } : undefined)
                    //[V6／S6-MOD] 修改時該列已不存在 → rowNotFound(轉本套件 saveStale), 不復活
                    A.deepEqual(r, { ok: false, v: 'saveStale' })
                    A.equal(woItems[t].has(ghost.id), false, '[V6] 已不存在之列不得因修改而復活(autoInsert:false)')
                    A.equal(snapAll(woItems), snap0, '其他列(含同批之第 1 列編修)亦不得寫入')
                    A.equal(cntAll(woItems), cnt0)
                    let st = staleLogs(logs)
                    A.equal(st.length, 1)
                    A.equal(st[0].msg, 'saveStale')
                    A.equal(st[0].reason, 'rowNotFound')
                })

                it(`UB-5 [${t}] 刪除幽靈列(${tag}) → reject saveStale(rowNotFound 轉), 同批其他列不寫入`, async function() {
                    let { woItems, logs, pc } = createEnv()
                    let rows = loadRows(woItems, t)
                    let ghost = extraRow(t, 'ghost')
                    injectGhost(woItems[t], ghost)
                    let bl = makeBaseline([...rows, ghost], t)
                    let snap0 = snapAll(woItems)
                    let cnt0 = cntAll(woItems)
                    let sent = editFirst(rows, { description: 'edited-by-A' }) //送出不含幽靈列 → 對庫讀到的列而言是刪除它
                    let r = await run(pc, t, sent, withBl ? { baseline: bl } : undefined)
                    //[V7／S6-DEL] 刪除已不存在之列(帶或不帶基準)→ rowNotFound
                    A.deepEqual(r, { ok: false, v: 'saveStale' })
                    A.equal(woItems[t].has(ghost.id), false)
                    A.equal(snapAll(woItems), snap0, '第 1 列編修亦不得寫入')
                    A.equal(cntAll(woItems), cnt0)
                    A.equal(staleLogs(logs)[0].reason, 'rowNotFound')
                })
            }
        }
    })


    // =================================================================
    // UB-6 基準格式(V13)
    // =================================================================

    //badBaselines: 各種格式或版本不識之基準(皆不得降級為未帶基準)
    function badBaselines(rows, t) {
        let ids = rows.map((r) => r.id)
        let good = makeBaseline(rows, t)
        return [
            ['套內舊版指紋形狀 [[id,abc1x2y3]]', ids.map((id) => [id, 'abc1x2y3'])],
            ['h2 版本前綴', ids.map((id) => [id, 'h2:0123456789abcd'])],
            ['h1 前綴但摘要長度不足', ids.map((id) => [id, 'h1:0123'])],
            ['h1 大寫十六進位', ids.map((id) => [id, 'h1:0123456789ABCD'])],
            ['非陣列: 字串', 'h1:0123456789abcd'],
            ['非陣列: 物件', { [ids[0]]: good[0][1] }],
            ['非陣列: 數字', 123],
            ['非陣列: false', false],
            ['非陣列: 空字串', ''],
            ['類陣列物件 {length,0}', { length: 1, 0: good[0] }],
            ['重複 id', [good[0], good[0], good[1], good[2]]],
            ['項目長度不符(3 元)', good.map((e) => [...e, 'x'])],
            ['項目長度不符(1 元)', good.map((e) => [e[0]])],
            ['項目非陣列', good.map((e) => e[0])],
            ['id 為空字串', [['', good[0][1]], ...good.slice(1)]],
            ['摘要非字串', good.map((e) => [e[0], 123])],
            ['id 非字串', good.map((e) => [123, e[1]])],
        ]
    }

    describe('UB-6 基準格式(V13)', function() {
        for (let t of TABLES) {
            let names = badBaselines(seedRows()[t], t).map((v) => v[0])
            names.forEach((nm, ib) => {
                it(`UB-6 [${t}] 壞基準「${nm}」→ reject saveBaselineFormat, 在任何讀寫之前, 不降級為未帶基準`, async function() {
                    let { woItems, logs, pc } = createEnv()
                    let rows = loadRows(woItems, t)
                    let bad = badBaselines(rows, t)[ib][1]
                    let calls = instrument(woItems)
                    let snap0 = snapAll(woItems)
                    let r = await run(pc, t, editFirst(rows, { description: 'edited-by-A' }), { baseline: bad })
                    //[V13／S5-DIGEST] 格式不識 → baselineFormat(本套件語系鍵 saveBaselineFormat), 不當作未帶基準
                    A.deepEqual(r, { ok: false, v: 'saveBaselineFormat' })
                    //在任何讀寫之前: 四表 select／insert／save／del／delAll 呼叫皆為 0
                    A.equal(sumCalls(calls), 0, `須在任何讀寫之前拒收, 實得 ${JSON.stringify(calls)}`)
                    //不降級: 若被當成未帶基準則第 1 列編修會被寫入
                    A.equal(snapAll(woItems), snap0, '不得降級為未帶基準而寫入')
                    A.equal(woItems[t].get(rows[0].id).description, rows[0].description)
                    let st = staleLogs(logs)
                    A.equal(st.length, 1)
                    A.equal(st[0].keyTable, t)
                    A.equal(st[0].msg, 'saveBaselineFormat')
                    A.equal(st[0].reason, 'baselineFormat')
                    A.ok(logs.some((l) => l.level === 'error' && l.event === `${FN[t]}-error` && l.msg === 'saveBaselineFormat'), 'errLog 記 err key')
                })
            })

            for (let form of ['省略', 'null']) {
                it(`UB-6 [${t}] 未帶基準(${form})仍可存(本 major 沿用既有政策; 規格 §8「現行 major 對未送者沿用各套件既有政策」)`, async function() {
                    let { woItems, pc } = createEnv()
                    let rows = loadRows(woItems, t)
                    let r = await run(pc, t, editFirst(rows, { description: 'edited-no-baseline' }), form === '省略' ? undefined : { baseline: null })
                    A.deepEqual(r, { ok: true, v: OKS })
                    A.equal(woItems[t].get(rows[0].id).description, 'edited-no-baseline')
                })
            }
        }
    })

    //UB-6b 核心層(guardWrite)拒收鍵轉本套件語系鍵(規格 §6): 以接縫注入模擬核心回報, 驗 procCore 之轉換與 log
    describe('UB-6b 核心層拒收鍵轉換', function() {
        let errCore = (key, extra = {}) => Object.assign(new Error(key), { key, added: [], removed: [], changed: [], reordered: false, ...extra })
        const CASES = [
            { name: 'baselineFormat', mk: () => errCore('baselineFormat'), v: 'saveBaselineFormat', event: 'updateTabItems-stale-error', reason: 'baselineFormat' },
            { name: 'baselineMismatch(changed)', mk: () => errCore('baselineMismatch', { changed: ['x'] }), v: 'saveStale', event: 'updateTabItems-stale-error', reason: 'rowChanged' },
            { name: 'baselineMismatch(removed)', mk: () => errCore('baselineMismatch', { removed: ['x'] }), v: 'saveStale', event: 'updateTabItems-stale-error', reason: 'rowRemoved' },
            { name: 'baselineMismatch(added)', mk: () => errCore('baselineMismatch', { added: ['x'] }), v: 'saveStale', event: 'updateTabItems-stale-error', reason: 'rowAdded' },
            { name: 'baselineMismatch(reordered)', mk: () => errCore('baselineMismatch', { reordered: true }), v: 'saveStale', event: 'updateTabItems-stale-error', reason: 'rowReordered' },
            { name: 'rowNotFound(字串, 同 procOrm mustExist)', mk: () => 'rowNotFound', v: 'saveStale', event: 'updateTabItems-stale-error', reason: 'rowNotFound' },
            { name: 'rowsInvalid(庫內主鍵缺漏或重複)', mk: () => errCore('rowsInvalid'), v: 'saveWriteFail', event: 'updateTabItems-rows-invalid', reason: 'rowsInvalid' },
        ]
        for (let t of TABLES) {
            for (let c of CASES) {
                it(`UB-6b [${t}] 核心回報 ${c.name} → ${c.v}, srLog ${c.event}/${c.reason}`, async function() {
                    let { woItems, logs, pc } = createEnv({ proc: { guardWrite: async () => { throw c.mk() } } })
                    let rows = loadRows(woItems, t)
                    let cnt0 = cntAll(woItems)
                    let r = await run(pc, t, editFirst(rows, { description: 'edited-by-A' }), undefined)
                    A.deepEqual(r, { ok: false, v: c.v }) //[S6-KEYS] 拒收鍵轉語系鍵, 不洩出原錯誤
                    A.equal(cntAll(woItems), cnt0)
                    let hit = logs.filter((l) => l.event === c.event)
                    A.equal(hit.length, 1)
                    A.equal(hit[0].keyTable, t)
                    A.equal(hit[0].msg, c.v)
                    A.equal(hit[0].reason, c.reason)
                })
            }
        }
    })

    //UB-6c 庫內讀回之列主鍵重複(伺服端資料錯誤, 規格 §6 rowsInvalid): 真核心 compareBaseline 拋 rowsInvalid → 回 saveWriteFail 並記 log, 零寫入
    describe('UB-6c 庫內主鍵重複(rowsInvalid)', function() {
        for (let t of TABLES) {
            it(`UB-6c [${t}] 新鮮讀取回傳重複主鍵之列 → reject saveWriteFail(非 saveStale／saveBaselineFormat), srLog updateTabItems-rows-invalid, 零寫入`, async function() {
                let { woItems, logs, pc } = createEnv()
                let rows = loadRows(woItems, t)
                let bl = makeBaseline(rows, t)
                let orig = woItems[t].select
                woItems[t].select = async (find) => {
                    let rs = await orig(find)
                    return find === undefined ? [...rs, cloneDeep(rs[0])] : rs
                }
                let snap0 = snapAll(woItems)
                let cnt0 = cntAll(woItems)
                let r = await run(pc, t, editFirst(rows, { description: 'edited-by-A' }), { baseline: bl })
                A.deepEqual(r, { ok: false, v: 'saveWriteFail' })
                A.equal(snapAll(woItems), snap0)
                A.equal(cntAll(woItems), cnt0)
                let hit = logs.filter((l) => l.event === 'updateTabItems-rows-invalid')
                A.equal(hit.length, 1)
                A.equal(hit[0].reason, 'rowsInvalid')
                A.equal(staleLogs(logs).length, 0, 'rowsInvalid 不是客戶端過期, 不得記為 stale-error')
            })
        }
    })


    //UB-6d 基準格式驗證早於取鎖與雙擊占位(任何讀寫與取鎖之前拒收, 規格 §13 V13): 同一操作者前一次存檔仍處理中(占位中、等表鎖)時, 格式不識之基準仍立即回 saveBaselineFormat, 而非 saveInProgress
    describe('UB-6d 格式驗證早於占位／取鎖', function() {
        for (let t of TABLES) {
            it(`UB-6d [${t}] 同一操作者前一次存檔等表鎖中: 合法基準再送 → saveInProgress(前提); 格式不識之基準 → 仍回 saveBaselineFormat(驗證早於占位)`, async function() {
                let { woItems, core, pc } = createEnv()
                let rows = loadRows(woItems, t)
                let release = null
                let gate = new Promise((resolve) => {
                    release = resolve
                })
                let held = core.withTabLocks([t], () => gate) //他人持有表鎖, 使本操作者之第 1 次存檔卡在 guardWrite(已占位)
                let p1 = run(pc, t, editFirst(rows, { description: 'first' }), undefined, 'op-same')
                await flush()
                await sleep(30)
                let rDup = await run(pc, t, editFirst(rows, { description: 'second' }), { baseline: makeBaseline(rows, t) }, 'op-same')
                A.deepEqual(rDup, { ok: false, v: 'saveInProgress' }) //前提: 占位確實存在
                let rBad = await run(pc, t, editFirst(rows, { description: 'second' }), { baseline: [['x', 'abc1x2y3']] }, 'op-same')
                A.deepEqual(rBad, { ok: false, v: 'saveBaselineFormat' })
                release()
                await held
                A.deepEqual(await p1, { ok: true, v: OKS })
                A.equal(woItems[t].get(rows[0].id).description, 'first')
            })
        }
    })


    // =================================================================
    // UB-7 原子／同鎖(V14): 以人為延遲驗證
    // =================================================================

    describe('UB-7 原子／同鎖(V14)', function() {

        //UB-7a: grups; 延遲 select(80ms) 並行 ①updateGrups(A) ②外部同步(core.withTabLocks(['grups']) 內改表)(S) ③第二操作者 updateGrups(B)
        it('UB-7a [grups] 並行 updateGrups ∥ 外部同步(withTabLocks) ∥ 第二操作者 updateGrups → 臨界區不交錯, 終態等價於某一依序執行', async function() {
            let { woItems, core, pc } = createEnv()
            let rows = loadRows(woItems, 'grups')
            let d = rows.map((r) => r.description)
            let events = []
            let tbl = woItems.grups
            let origSelect = tbl.select
            let origSave = tbl.save
            tbl.select = async (find) => {
                let isFind = find !== undefined
                events.push(isFind ? 'exist:begin' : 'read:begin') //無條件 select ＝ procCore 之新鮮讀取; 帶條件 ＝ mustExist 之存在檢查
                let rs = await origSelect(find) //先讀(取讀取當下之快照)
                if (!isFind) {
                    await sleep(80) //再延遲回傳: 拉長「讀取—比對—寫入」窗口, 且使鎖外之讀取回傳過期快照
                }
                events.push(isFind ? 'exist:end' : 'read:end')
                return rs
            }
            tbl.save = async (data, option) => {
                events.push('write')
                return origSave(data, option)
            }
            let rowsA = editFirst(rows, { description: 'by-A' })
            let rowsB = rows.map((r, k) => (k === 1 ? { ...r, description: 'by-B' } : r))
            let pA = run(pc, 'grups', rowsA, undefined, 'op-A')
            let pS = core.withTabLocks(['grups'], async () => { //外部同步之整段寫入
                events.push('sync-in')
                await sleep(20)
                await origSave([{ id: rows[2].id, description: 'by-sync' }]) //經原始 save(不記為 updateGrups 之 write)
                events.push('sync-out')
            })
            let pB = run(pc, 'grups', rowsB, undefined, 'op-B')
            let [rA, , rB] = await Promise.all([pA, pS, pB])
            A.deepEqual(rA, { ok: true, v: OKS })
            A.deepEqual(rB, { ok: true, v: OKS })

            //[S6-ATOMIC／S7-LOCK／V14] 事件序列: updateGrups 之「讀取—比對—寫入」(read:begin→write)整段期間, 不得有外部同步之 in／out, 亦不得有另一個 updateGrups 之讀寫; 外部同步 in／out 之間無任何其他事件
            let open = false
            let inSync = false
            for (let ev of events) {
                if (ev === 'read:begin') {
                    A.ok(!open && !inSync, `read:begin 時不得有其他臨界區開啟: ${events.join(',')}`)
                    open = true
                }
                else if (ev === 'write') {
                    A.ok(open && !inSync, `write 須在 updateGrups 臨界區內且不在外部同步內: ${events.join(',')}`)
                    open = false
                }
                else if (ev === 'sync-in') {
                    A.ok(!open && !inSync, `外部同步不得落在 updateGrups 讀取—寫入之間: ${events.join(',')}`)
                    inSync = true
                }
                else if (ev === 'sync-out') {
                    A.ok(inSync, 'sync-out 須對應 sync-in')
                    inSync = false
                }
                else {
                    A.ok(open && !inSync, `${ev} 須在 updateGrups 臨界區內: ${events.join(',')}`)
                }
            }
            A.ok(!open && !inSync, '事件須成對收束')
            A.equal(events.filter((e) => e === 'read:begin').length, 2)
            A.equal(events.filter((e) => e === 'write').length, 2)
            A.equal(events.filter((e) => e === 'sync-in').length, 1)

            //終態等價於 A、B、S 之某一依序執行(整表寫入語意: A 把描述向量設為 [by-A,d1,d2], B 設為 [d0,by-B,d2], S 把第 3 列設為 by-sync)
            let opsF = { A: () => ['by-A', d[1], d[2]], B: () => [d[0], 'by-B', d[2]], S: (s) => [s[0], s[1], 'by-sync'] }
            let perms = [['A', 'B', 'S'], ['A', 'S', 'B'], ['B', 'A', 'S'], ['B', 'S', 'A'], ['S', 'A', 'B'], ['S', 'B', 'A']]
            let cands = perms.map((p) => {
                let s = d.slice()
                for (let o of p) {
                    s = opsF[o](s)
                }
                return JSON.stringify(s)
            })
            let fin = JSON.stringify(rowsSorted(woItems, 'grups').map((r) => r.description))
            A.ok(cands.includes(fin), `終態須等價於某一依序執行, 實得 ${fin}, 候選 ${cands.join(' | ')}`)
        })

        //UB-7b: 同基準並行——A、B 以同一載入基準各改不同列; 延遲 select 使兩者皆在對方寫入前讀取(無鎖時皆通過比對而 lost update)
        for (let t of TABLES) {
            it(`UB-7b [${t}] 兩操作者以同一基準並行存檔(讀取有人為延遲) → 恰一成功一 saveStale, 敗者零寫入, 終態僅勝者之編修(V1／V14)`, async function() {
                let { woItems, logs, pc } = createEnv()
                let rows = loadRows(woItems, t)
                let bl = makeBaseline(rows, t)
                let orig = woItems[t].select
                woItems[t].select = async (find) => {
                    let rs = await orig(find) //先讀(取讀取當下之快照), 再延遲回傳: 若讀取在鎖外, 兩者皆會拿到載入時之舊快照而都通過比對
                    if (find === undefined) {
                        await sleep(40)
                    }
                    return rs
                }
                let sentA = editFirst(rows, { description: 'by-A' })
                let sentB = rows.map((r, k) => (k === 1 ? { ...r, description: 'by-B' } : r))
                let [rA, rB] = await Promise.all([run(pc, t, sentA, { baseline: bl }, 'op-A'), run(pc, t, sentB, { baseline: bl }, 'op-B')])
                let oks = [rA, rB].filter((r) => r.ok)
                let ngs = [rA, rB].filter((r) => !r.ok)
                A.equal(oks.length, 1, `恰一成功: ${JSON.stringify([rA, rB])}`)
                A.deepEqual(oks[0], { ok: true, v: OKS })
                A.deepEqual(ngs[0], { ok: false, v: 'saveStale' }) //敗者在鎖內重讀比對, 見勝者之寫入而被拒
                let fin = rowsSorted(woItems, t).map((r) => r.description)
                let winnerA = rA.ok
                A.deepEqual(fin, winnerA ? ['by-A', rows[1].description, rows[2].description] : [rows[0].description, 'by-B', rows[2].description], '終態僅勝者之編修(無 lost update)')
                A.equal(woItems[t].cnt.save, 1, '敗者零寫入: 只有勝者一次 save')
                let st = staleLogs(logs)
                A.equal(st.length, 1)
                A.equal(st[0].reason, 'rowChanged')
            })
        }

        //UB-7c: core.guardWrite 與 updateXxx 共鎖(外部或其他寫入者經 guardWrite 持鎖期間, updateXxx 不讀不寫)
        for (let t of TABLES) {
            it(`UB-7c [${t}] 他方持有 core.guardWrite({ tables:['${t}'] }) 期間 updateXxx 不讀不寫, 釋放後才完成(共鎖, 規格 §7)`, async function() {
                let { woItems, core, pc } = createEnv()
                let rows = loadRows(woItems, t)
                let calls = instrument(woItems)
                let release = null
                let gate = new Promise((resolve) => {
                    release = resolve
                })
                let held = core.guardWrite({ tables: [t], read: () => woItems[t].select(), write: async () => { await gate } })
                await flush()
                A.equal(calls[t].select, 1, '前提: 持有者自己之讀取')
                let done = false
                let p = run(pc, t, editFirst(rows, { description: 'edited-by-A' }), undefined).then((r) => {
                    done = true
                    return r
                })
                await flush()
                await sleep(60)
                A.equal(done, false, '持鎖期間不得完成')
                A.equal(calls[t].select, 1, '持鎖期間 updateXxx 不得讀取(臨界區之讀取在鎖內)')
                A.equal(writesOf(woItems), 0, '持鎖期間不得寫入')
                release()
                await held
                let r = await p
                A.deepEqual(r, { ok: true, v: OKS })
                A.equal(woItems[t].get(rows[0].id).description, 'edited-by-A')
            })
        }
    })


    // =================================================================
    // UB-8 引用連帶與引用端鎖(規格 §7 先表鎖後; 規則帳本 R-WRITE-LOCK-02)
    // =================================================================

    //REF_CASES: 被引用表動作(改名／刪除)→ 引用端表與欄位
    const REF_CASES = [
        { t: 'grups', holder: 'users', field: 'cgrups', act: 'rename' },
        { t: 'pemis', holder: 'grups', field: 'cpemis', act: 'rename' },
        { t: 'targets', holder: 'pemis', field: 'crules', act: 'delete' },
    ]
    //refRows: 依動作取送出列(改名: 第 1 列 name 加後綴; 刪除: 去掉第 1 列)與預期之引用端字串(解析後)
    function refSend(c, rows) {
        if (c.act === 'rename') {
            return rows.map((r, k) => (k === 0 ? { ...r, name: `${r.name}-新` } : r))
        }
        return rows.slice(1)
    }
    function refExpect(c, rows) {
        if (c.act === 'rename') {
            return { [`${rows[0].name}-新`]: OR }
        }
        return {}
    }

    describe('UB-8 引用連帶與引用端鎖', function() {
        for (let c of REF_CASES) {
            let label = `${c.t}${c.act === 'rename' ? '改名' : '刪除'} → ${c.holder}.${c.field}`

            it(`UB-8a ${label}: 他方先持有 ${c.holder} 表鎖 → updateXxx 等待(不完成、${c.holder} 不寫入), 釋放後完成且引用已連帶更新`, async function() {
                let { woItems, core, pc } = createEnv()
                let rows = loadRows(woItems, c.t)
                let hrows = loadRows(woItems, c.holder)
                let bl = makeBaseline(rows, c.t)
                let release = null
                let gate = new Promise((resolve) => {
                    release = resolve
                })
                let held = core.withTabLocks([c.holder], () => gate) //他人(如外部同步)持有引用端表鎖
                let done = false
                let p = run(pc, c.t, refSend(c, rows), { baseline: bl }).then((r) => {
                    done = true
                    return r
                })
                await flush()
                await sleep(60)
                A.equal(done, false, '[S7-LOCK] 引用端表鎖被持有期間不得完成')
                A.equal(woItems[c.holder].cnt.save + woItems[c.holder].cnt.insert + woItems[c.holder].cnt.del, 0, `${c.holder} 在他方持鎖期間不得被寫入`)
                release()
                await held
                let r = await p
                A.deepEqual(r, { ok: true, v: OKS })
                //引用已連帶更新(預期值獨立算出: 改名 → 鍵換新名、值不變; 刪除 → 該項移除)
                A.deepEqual(JSON.parse(woItems[c.holder].get(hrows[0].id)[c.field]), refExpect(c, rows))
                A.deepEqual(woItems[c.holder].get(hrows[1].id), hrows[1], '未命中之引用端列不得被寫入')
                A.deepEqual(woItems[c.holder].get(hrows[2].id), hrows[2], '未命中之引用端列不得被寫入')
                A.equal(woItems[c.holder].get(hrows[0].id).userIdUpdate, UID, '被連帶改寫之列記操作者為更新者')
            })

            it(`UB-8b ${label}: 引用端 ${c.holder} 之寫入發生在持有 ${c.holder} 表鎖期間(探針: 寫入當下另取該鎖進不去)`, async function() {
                let { woItems, core, pc } = createEnv()
                let rows = loadRows(woItems, c.t)
                let bl = makeBaseline(rows, c.t)
                let tbl = woItems[c.holder]
                let origSave = tbl.save
                let probes = []
                let held = []
                tbl.save = async (data, option) => {
                    let entered = false
                    probes.push(core.withTabLocks([c.holder], async () => {
                        entered = true
                    }))
                    await sleep(40) //若 ${c.holder} 鎖由本次存檔持有, 探針取不到鎖(entered 仍為 false)
                    held.push(!entered)
                    return origSave(data, option)
                }
                let r = await run(pc, c.t, refSend(c, rows), { baseline: bl })
                await Promise.all(probes)
                A.deepEqual(r, { ok: true, v: OKS })
                A.equal(held.length, 1, '引用端 save 恰一次')
                A.deepEqual(held, [true], `[S7-LOCK] 引用端寫入時須持有 ${c.holder} 表鎖`)
            })

            it(`UB-8c ${label}: returnRows 時回傳 others.${c.holder} ＝ 寫入後引用端全部列(含已更新之引用字串), rows ＝ 寫入後本表全部列`, async function() {
                let { woItems, pc } = createEnv()
                let rows = loadRows(woItems, c.t)
                let bl = makeBaseline(rows, c.t)
                let r = await run(pc, c.t, refSend(c, rows), { baseline: bl, returnRows: true })
                A.equal(r.ok, true)
                A.deepEqual(Object.keys(r.v).sort(), ['msg', 'others', 'rows'])
                A.equal(r.v.msg, OKS)
                A.deepEqual(r.v.rows, rowsSorted(woItems, c.t), '[S8-RET] rows ＝ 寫入後本表(依 order)')
                A.deepEqual(Object.keys(r.v.others), [c.holder])
                A.deepEqual(r.v.others[c.holder], rowsSorted(woItems, c.holder), '[S8-RET] others ＝ 寫入後引用端表(依 order)')
                A.deepEqual(JSON.parse(r.v.others[c.holder][0][c.field]), refExpect(c, rows), '含已更新之引用字串')
            })
        }
    })


    // =================================================================
    // UB-9 存檔回傳寫入後之列(規格 §8)
    // =================================================================

    describe('UB-9 存檔回傳寫入後之列(規格 §8)', function() {
        for (let t of TABLES) {
            it(`UB-9 [${t}] returnRows:true 成功 → { msg, rows, others }, rows 等於寫入後替身表內容(依 order); 以回傳 rows 建新基準立即再存成功, 舊基準對照被拒`, async function() {
                let { woItems, logs, pc } = createEnv()
                let rows = loadRows(woItems, t)
                let bl = makeBaseline(rows, t)
                let r = await run(pc, t, editFirst(rows, { description: 'v1' }), { baseline: bl, returnRows: true })
                A.equal(r.ok, true)
                A.deepEqual(Object.keys(r.v).sort(), ['msg', 'others', 'rows'])
                A.equal(r.v.msg, OKS)
                A.deepEqual(r.v.rows, rowsSorted(woItems, t), '[S8-RET] rows ＝ 寫入後該表全部列(依 order), 取自鎖內新鮮讀取')
                A.deepEqual(r.v.others, {}, '無引用連帶時 others 為空物件')
                A.equal(r.v.rows[0].description, 'v1')
                A.equal(r.v.rows[0].userIdUpdate, UID, 'rows 為伺服端寫入後之列(含伺服端填入之更新者)')
                //對照: 舊基準(第 1 次載入之基準)再存 → 被拒(第 1 次存檔已改變該表)
                let snap1 = snapAll(woItems)
                let rOld = await run(pc, t, editFirst(r.v.rows, { description: 'v2-old-baseline' }), { baseline: bl })
                A.deepEqual(rOld, { ok: false, v: 'saveStale' }, '舊基準須被拒(對照)')
                A.equal(snapAll(woItems), snap1, '被拒時零寫入')
                //[S8-RET／已知缺口 (a) 伺服端部分] 以回傳之 rows 建新基準, 不重新載入, 立刻再存 → 成功(自己不被自己上一次之存檔誤擋)
                let bl2 = makeBaseline(r.v.rows, t)
                let r2 = await run(pc, t, editFirst(r.v.rows, { description: 'v2' }), { baseline: bl2 })
                A.deepEqual(r2, { ok: true, v: OKS })
                A.equal(woItems[t].get(rows[0].id).description, 'v2')
                A.equal(staleLogs(logs).length, 1, '全程僅舊基準對照那一次 stale')
            })

            it(`UB-9 [${t}] 新增列置首(存檔重編全表 order) → returnRows 之 rows 含新列與重編後之 order; 以之建新基準立即再存成功`, async function() {
                let { woItems, pc } = createEnv()
                let rows = loadRows(woItems, t)
                let bl = makeBaseline(rows, t)
                let nr = newRowClient(t, 'u9')
                let r = await run(pc, t, [nr, ...rows], { baseline: bl, returnRows: true })
                A.equal(r.ok, true)
                A.deepEqual(r.v.rows, rowsSorted(woItems, t))
                A.equal(r.v.rows.length, 4)
                A.equal(r.v.rows[0].id, nr.id, '新列在首')
                A.deepEqual(r.v.rows.map((v) => v.order), [1, 2, 3, 4], 'order 由存檔重編')
                A.equal(r.v.rows[0].userId, UID, '新列建立者為伺服端填入之操作者, 非佔位字')
                A.equal('_isNew' in r.v.rows[0], false)
                let r2 = await run(pc, t, editFirst(r.v.rows, { description: 'v2' }), { baseline: makeBaseline(r.v.rows, t) })
                A.deepEqual(r2, { ok: true, v: OKS }, '以回傳之列建基準, 不被自己上一次之存檔誤擋')
            })

            it(`UB-9 [${t}] 未帶 returnRows 或非 true 值(false／'true'／1／null) → 仍回字串 saveTabItemsSuccess`, async function() {
                for (let rr of [undefined, false, 'true', 1, null]) {
                    let { woItems, pc } = createEnv()
                    let rows = loadRows(woItems, t)
                    let opt = rr === undefined ? { baseline: makeBaseline(rows, t) } : { baseline: makeBaseline(rows, t), returnRows: rr }
                    let r = await run(pc, t, editFirst(rows, { description: 'v1' }), opt)
                    A.deepEqual(r, { ok: true, v: OKS }, `returnRows=${String(rr)} 仍回字串`)
                }
            })

            it(`UB-9 [${t}] 失敗(舊基準 saveStale／格式不識／列已不存在)時不回 rows: reject 值為語系鍵字串`, async function() {
                let { woItems, pc } = createEnv()
                let rows = loadRows(woItems, t)
                let bl = makeBaseline(rows, t)
                await woItems[t].save([{ id: rows[2].id, description: 'by-other' }])
                let r1 = await run(pc, t, editFirst(rows, { description: 'v1' }), { baseline: bl, returnRows: true })
                A.deepEqual(r1, { ok: false, v: 'saveStale' })
                let r2 = await run(pc, t, editFirst(rows, { description: 'v1' }), { baseline: [['x', 'bad']], returnRows: true })
                A.deepEqual(r2, { ok: false, v: 'saveBaselineFormat' })
                A.equal(typeof r1.v, 'string')
                A.equal(typeof r2.v, 'string')
            })
        }
    })


    // =================================================================
    // UB-10 客戶端 opt 過濾(規格 §6: procOrm 之 opt 只能由伺服端自組)
    // =================================================================

    describe('UB-10 客戶端 opt 過濾', function() {
        //客戶端惡意／多餘之 opt: 僅 baseline／returnRows 應被採納
        let clientOpt = (bl, pick) => ({ baseline: bl, returnRows: true, mustExist: false, keepUserId: true, pickKeysOnly: pick, skipDup: true, foo: 1 })

        for (let t of TABLES) {
            it(`UB-10 [${t}] 客戶端 opt{ baseline, returnRows, mustExist:false, keepUserId:true, pickKeysOnly, skipDup, foo } → 只採 baseline／returnRows; procOrm 之 save／del 恆 { mustExist:true }, insert 無第 5 參; 整表 diff 照常; 新列 userId 為操作者`, async function() {
                let { woItems, logs, pc, calls } = createEnv({ spy: true })
                let rows = loadRows(woItems, t)
                let bl = makeBaseline(rows, t)
                let nr = newRowClient(t, 'u10', { userId: 'client-owner-forged' }) //keepUserId 若被採納, 新列 userId 會保留此偽造值
                let sent = [{ ...rows[0], description: 'edited-u10' }, rows[1], nr] //改第 1 列、刪第 3 列、新增 nr
                let r = await run(pc, t, sent, clientOpt(bl, ['name']))
                A.equal(r.ok, true, JSON.stringify(r))
                //returnRows 被採納(回物件)
                A.equal(r.v.msg, OKS)
                A.deepEqual(r.v.rows.map((v) => v.id), [rows[0].id, rows[1].id, nr.id])
                //[S6-OPT] 所有 procOrm 呼叫之第 5 參: save／del 恆為 { mustExist: true }, insert 無第 5 參
                let modes = new Set()
                for (let args of calls) {
                    let [, woName, mode, , opt] = args
                    A.equal(woName, t, '此案無引用連帶, 只應寫本表')
                    modes.add(mode)
                    if (mode === 'save' || mode === 'del') {
                        A.deepEqual(opt, { mustExist: true }, `${mode} 之 opt 須由伺服端自組`)
                    }
                    else {
                        A.equal(mode, 'insert')
                        A.equal(opt, undefined, 'insert 不得帶 opt(keepUserId 等不由客戶端決定)')
                    }
                }
                A.deepEqual([...modes].sort(), ['del', 'insert', 'save'], '三種寫入皆發生(整表 diff 照常, pickKeysOnly 未被採納)')
                //寫入結果: 整表 diff
                A.equal(woItems[t].get(rows[0].id).description, 'edited-u10', '修改已寫入(非 pickKeysOnly 之只採指定欄)')
                A.equal(woItems[t].has(rows[2].id), false, '刪除已寫入(pickKeysOnly 模式不會刪列)')
                let n1 = woItems[t].get(nr.id)
                A.ok(n1, '新增已寫入(pickKeysOnly 模式不會新增列)')
                A.equal(n1.userId, UID, 'keepUserId 不被採納: 新列 userId 為操作者')
                A.equal(logs.filter((l) => l.event === 'updateTabItems-pickKeysOnly').length, 0, '客戶端之 pickKeysOnly 不得生效')
            })

            it(`UB-10 [${t}] 客戶端帶 skipDup:true 時重複仍被拒(重複檢查不受客戶端 opt 影響), 零寫入`, async function() {
                let { woItems, pc } = createEnv()
                let rows = loadRows(woItems, t)
                let bl = makeBaseline(rows, t)
                let dup = (t === 'users') ? { ...newRowClient(t, 'dup'), email: rows[0].email } : { ...rows[0], order: 99 } //users: 新增列 email 與既有列重複; 其餘: 同 id 兩列
                let cnt0 = cntAll(woItems)
                let r = await run(pc, t, [...rows, dup], { baseline: bl, skipDup: true })
                A.deepEqual(r, { ok: false, v: 'saveRowFieldDuplicate' })
                A.equal(cntAll(woItems), cnt0)
                if (t === 'grups' || t === 'pemis') {
                    //名稱重複(不同 id 同名)由 findTouchedDup 判: nameDuplicate
                    let dn = { ...newRowClient(t, 'dupn'), name: rows[0].name }
                    let r2 = await run(pc, t, [...rows, dn], { baseline: bl, skipDup: true })
                    A.deepEqual(r2, { ok: false, v: 'nameDuplicate' })
                    A.equal(cntAll(woItems), cnt0)
                }
            })
        }

        //users: pickKeysOnly 僅由伺服端傳入才生效(WWebPerm 之 modeEditUsers='for:grups'; 直接呼叫 pc.updateUsers(uid, rows, { pickKeysOnly })), 且其 procOrm 呼叫仍帶 { mustExist:true }
        it('UB-10 [users] 伺服端傳入 pickKeysOnly:[cgrups] → 只採 cgrups 變更(身分欄、新增、缺列皆以庫內為準); procOrm save 帶 { mustExist:true }; 對照: 同一客戶端 opt 經 pickClientOpt 不帶入 pickKeysOnly', async function() {
            let { woItems, logs, pc, calls } = createEnv({ spy: true })
            let rows = loadRows(woItems, 'users')
            let newCg = J({ [NAMES.grups[1]]: OR })
            let sent = [{ ...rows[0], name: 'peter-NAME', cgrups: newCg }, rows[1], newRowClient('users', 'u10b')] //改第 1 列(身分欄＋cgrups)、刪第 3 列、新增一列
            let r = await pc.updateUsers(UID, cloneDeep(sent), { pickKeysOnly: ['cgrups'] }) //伺服端自組之 opt
            A.equal(r, OKS)
            let u0 = woItems.users.get(rows[0].id)
            A.equal(u0.cgrups, newCg, 'cgrups 採納')
            A.equal(u0.name, rows[0].name, '身分欄不採納')
            A.equal(woItems.users.has(rows[2].id), true, '缺列不刪')
            A.equal(woItems.users.has(newRowClient('users', 'u10b').id), false, '新增列不採納')
            A.deepEqual(calls.map((a) => [a[1], a[2]]), [['users', 'save']])
            A.deepEqual(calls[0][4], { mustExist: true })
            A.equal(logs.filter((l) => l.event === 'updateTabItems-pickKeysOnly').length, 1, '伺服端 pickKeysOnly 生效且有 info log')
            //對照: 客戶端 opt 帶 pickKeysOnly 經 pickClientOpt 過濾後不含 pickKeysOnly
            A.deepEqual(pickClientOpt({ pickKeysOnly: ['cgrups'], baseline: [['a', 'h1:0123456789abcd']], returnRows: true, mustExist: false }), { baseline: [['a', 'h1:0123456789abcd']], returnRows: true })
        })
    })


    // =================================================================
    // UB-11 整表存檔之刪除集合(V8)
    // =================================================================

    describe('UB-11 整表存檔之刪除集合(V8)', function() {
        for (let t of TABLES) {
            it(`UB-11 [${t}] 載入後他人新增一列 → 持舊基準存檔被拒, 他人新增之列不被刪、不被改, 零寫入`, async function() {
                let { woItems, logs, pc } = createEnv()
                let rows = loadRows(woItems, t)
                let bl = makeBaseline(rows, t)
                let ex = extraRow(t, 'u11')
                await woItems[t].insert([ex]) //他人新增
                let exBefore = woItems[t].get(ex.id)
                let snap0 = snapAll(woItems)
                let cnt0 = cntAll(woItems)
                let r = await run(pc, t, editFirst(rows, { description: 'edited-by-A' }), { baseline: bl }) //送出不含他人新增之列
                A.deepEqual(r, { ok: false, v: 'saveStale' })
                A.equal(woItems[t].has(ex.id), true, '[V8／S6-WHOLE] 他人新增之列不得被刪')
                A.deepEqual(woItems[t].get(ex.id), exBefore)
                A.equal(snapAll(woItems), snap0)
                A.equal(cntAll(woItems), cnt0)
                A.equal(staleLogs(logs)[0].reason, 'rowAdded')
            })

            it(`UB-11 [${t}] 重新載入(基準含他人新增之列)後刪第 3 列 → 刪除集合只含被刪之列, 他人新增之列保留(基準內 − 送出)`, async function() {
                let { woItems, pc } = createEnv()
                let ex = extraRow(t, 'u11b')
                await woItems[t].insert([ex])
                let rows = loadRows(woItems, t) //重新載入: 含他人新增之列(order 4)
                A.equal(rows.length, 4)
                let bl = makeBaseline(rows, t)
                let sent = rows.filter((r) => r.id !== rows[2].id) //刪第 3 列
                let r = await run(pc, t, sent, { baseline: bl })
                A.deepEqual(r, { ok: true, v: OKS })
                A.deepEqual(rowsSorted(woItems, t).map((v) => v.id).sort(), [rows[0].id, rows[1].id, ex.id].sort(), '只刪被刪之列')
                A.equal(woItems[t].cnt.del, 1, '恰一次 del')
            })
        }
    })


    // =================================================================
    // UB-12 站點不變式(靜態; 仿 unit-procCore-usersKey SITE-UK-001)
    // =================================================================

    describe('UB-12 站點不變式(靜態)', function() {
        let readCode = (rel) => sourceLines(path.join(projRoot, rel), 'code').map((l) => l.text).join('\n')

        it('SITE-UB-001 基準比對只經 guardWrite 的 baseline／contract 參數(取鎖 → 新鮮讀取 → 比對 → write), 在 write 之前; procCore 不自行比對', function() {
            let code = readCode('server/procCore.mjs')
            A.equal((code.match(/guardWrite\(\{/g) || []).length, 1, 'guardWrite 呼叫點恰一處')
            let iGuard = code.indexOf('guardWrite({')
            let iTables = code.indexOf('tables: [keyTable]')
            let iRead = code.indexOf('read: () => woItems[keyTable].select()')
            let iBase = code.indexOf('baseline: baseline === null ? undefined : baseline')
            let iContract = code.indexOf('contract: getContract(keyTable)')
            let iWrite = code.indexOf('write: async (ltdtOld)')
            A.ok(iGuard > 0 && iTables > iGuard && iRead > iTables && iBase > iRead && iContract > iBase && iWrite > iContract,
                `次序須為 guardWrite < tables < read < baseline < contract < write 回呼, 實得 ${[iGuard, iTables, iRead, iBase, iContract, iWrite]}`)
            A.ok(!/\b(checkBaseline|compareBaseline|isBaselineStale)\(/.test(code), '比對只經 guardWrite(核心), procCore 不得另行比對(否則可能脫離表鎖)')
            A.ok(!/let ltdtOld = await woItems\[keyTable\]\.select\(\)/.test(code), 'ltdtOld 須由 guardWrite 的 read 提供')
        })

        it('SITE-UB-002 基準格式驗證(isBaselineValid)在 lockSave(／guardWrite( 之前(任何讀寫與取鎖之前拒收 saveBaselineFormat)', function() {
            let code = readCode('server/procCore.mjs')
            let iValid = code.indexOf('!isBaselineValid(')
            let iLockSave = code.indexOf('lockSave(')
            let iGuard = code.indexOf('guardWrite({')
            A.ok(iValid > 0 && iLockSave > 0 && iGuard > 0, '三處皆須存在')
            A.ok(iValid < iLockSave && iValid < iGuard, `isBaselineValid(${iValid}) 須在 lockSave(${iLockSave})／guardWrite(${iGuard}) 之前`)
            A.ok(/'saveBaselineFormat'/.test(code.slice(iValid, iLockSave)), '格式不合之拒收須緊接在驗證處')
        })

        it('SITE-UB-003 mustExist 在 procCore 恰出現在 writeMain 的 del 與 save 兩處(insert 無), 且不讀客戶端 opt', function() {
            let code = readCode('server/procCore.mjs')
            A.equal((code.match(/mustExist/g) || []).length, 2, 'mustExist 全檔恰 2 處')
            let i0 = code.indexOf('let writeMain = async () => {')
            let i1 = code.indexOf('let readAfter = async')
            A.ok(i0 > 0 && i1 > i0)
            let body = code.slice(i0, i1)
            A.ok(/procOrm\(userId, keyTable, 'del', r\.del, \{ mustExist: true \}\)/.test(body), 'del 帶 { mustExist: true }')
            A.ok(/procOrm\(userId, keyTable, 'save', r\.diff, \{ mustExist: true \}\)/.test(body), 'save 帶 { mustExist: true }')
            A.ok(/procOrm\(userId, keyTable, 'insert', r\.add\)/.test(body), 'insert 無第 5 參')
            A.ok(!/get\(opt,\s*'mustExist'|opt\.mustExist|keepUserId/.test(code), 'procOrm 之 opt 不得取自客戶端 opt(也不用 keepUserId)')
        })

        it('SITE-UB-004 procCore 不自建鎖: 不含 kmx／pmKeyMutex／tabWriteKey; 引用端表鎖經 keyCheck.withTabLocks(lockTabs, [holder], …, [keyTable])', function() {
            let code = readCode('server/procCore.mjs')
            A.ok(!/\bkmx\b|pmKeyMutex|tabWriteKey/.test(code), 'procCore 不得自建鎖')
            A.ok(/withTabLocks\(lockTabs,\s*\[holder\],\s*async \(\) => \{/.test(code), '引用端表鎖由 withTabLocks(lockTabs, [holder], …) 取得')
            A.ok(/\},\s*\[keyTable\]\)/.test(code), '取引用端鎖時須帶 held 參數 [keyTable](階層守門)')
        })

        it('SITE-UB-005 cascadeWrite 之引用端 save 帶 { mustExist: true }(只改不增, 不復活已刪之引用端列), 且不自建鎖', function() {
            let code = readCode('server/cascadeWrite.mjs')
            A.equal((code.match(/mustExist/g) || []).length, 1)
            A.ok(/procOrm\(userId, plan\.holder, 'save', post, \{ mustExist: true \}\)/.test(code))
            A.ok(!/\bkmx\b|pmKeyMutex|withTabLocks\(|guardWrite\(/.test(code), 'cascadeWrite 不取鎖(呼叫端已持有)')
        })

        it('SITE-UB-006 伺服器專有欄位不採用客戶端值: dropServerOnlyDiff／restoreServerFields 一律以 all: true 呼叫(不分外部列或後台列)', function() {
            let code = readCode('server/procCore.mjs')
            A.ok(/dropServerOnlyDiff\(\{[^}]*\ball:\s*true\b[^}]*\}\)/.test(code), 'dropServerOnlyDiff 帶 all: true')
            A.ok(/restoreServerFields\(\{[^}]*\ball:\s*true\b[^}]*\}\)/.test(code), 'restoreServerFields 帶 all: true')
        })
    })

})
