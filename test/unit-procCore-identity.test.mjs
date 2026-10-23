//伺服端強制之「被引用實體身分」檢查單元測試(perm-run02 範圍一; 使用者 2026-10-23 裁示「正反關聯與主體身份檢查, 應該是前後端都要做」; 規則帳本草案 R-SUBJECT-ID-01 規則 4〔改為伺服端強制〕、R-REF-IDENTITY-01〔正向引用身分〕、R-LOCK-CORE-01、R-WRITE-LOCK-02; R-PRINCIPLE-00 原則 3、4、6)
//perm-run03 範圍一(使用者 2026-10-23 裁示「這本來就該強制必帶吧? 要不然怎麼確認與驗證調用者身份?」; R-REF-IDENTITY-01 規則 7、R-SUBJECT-ID-01 規則 5): 宣告改為強制必帶——存檔改變了引用(新增或移除啟用之引用項、新增列帶引用)而未附 refs／subject → saveIdentityRequired; 「移除引用」亦須宣告。
//  perm-run02 之「未帶者維持名稱引用原行為」相容已取消, 本檔對應案例(IDN-207 之移除舊引用、IDN-301、IDN-404 之首次存檔、IDN-501 對照)已依新語意改寫, 並新增 IDN-215～219、IDN-22x 逐軸矩陣。
//
//受測: server/procCore.mjs 之 updateUsers／updateGrups／updatePemis／updateTargets(kpFunExt 之實際入口, 內走 updateTabItems)與 pickClientOpt; 純函數判準 src/js/refIdentity.mjs（逐函數見 unit-refIdentity）。
//本檔刻意不用 test/tools/declHelper.mjs 之 autoDecl 包裝——它測的就是宣告本身（缺、空、漏報、多報、不符、格式）。
//  依賴一律真實——w-serv-orm 實例(test/tools/unitOrm.mjs 之 mkCore: 真 WServOrm 包住替身資料表 mkTable, 取得真 procOrm／withTabLocks／guardWrite)、server/lockSave.mjs＋wsemi cacheSt、src/js/rowDigest.mjs＋w-serv-orm baseline、
//  server/keyCheck.mjs 之 withTabLocks、server/cascadeWrite.mjs; 僅資料表以記憶體替身取代 w-orm-lmdb, 不起服務(沿用 unit-procCore-baseline 之 mkCore／替身表做法與 UB-7 人為延遲手法、unit-procCore-refCascade 之 traceLock 取鎖軌跡與 RW-540 隨機交錯手法)。
//斷言原則: 預期值獨立於實作——「拒收語系鍵」「寫了什麼」「零寫入」一律以替身資料表快照(snapshot)與呼叫計數(cnt／instrument)驗證, 預期之鍵／原因／筆數手寫於各格; 並行格以「序列等價」（先手算兩種依序執行之合法終態）驗證.
//
//規格句(本檔所翻譯者; 每條 assertion 之註解標明所對應之 [代號]; 出處: 使用者 2026-10-23 裁示、server/procCore.mjs updateTabItems 註解、server/procLang.mjs 語系鍵說明、規則帳本草案):
//  [I-FMT]    opt.subject／opt.refs 給了(非 undefined／null)但格式不合, 或該表無授權引用欄(targets) → reject saveIdentityFormat, 於任何讀寫(含取鎖)之前, 零寫入; srLog updateTabItems-identity-error { msg: saveIdentityFormat, reason: format, n: 0 }; 不降級為不帶
//  [I-SUBJ]   反向主體(users 表之主體為 grups、grups 表之主體為 pemis): 於被引用(主體)表鎖內新鮮讀取後驗證, 判準即 checkSubject; 非 ok → reject saveSubjectChanged(reason gone／renamed／taken)、零寫入; 刪除後同名重建〔id 不同〕且 saved:true → gone
//  [I-REF]    正向引用(users.cgrups→grups、grups.cpemis→pemis、pemis.crules→targets): 本次寫入改變之啟用引用名稱〔新增＋移除; perm-run03〕須全部宣告(refIncomplete), 且每個宣告名稱於新鮮讀取之被引用表所對應 id 陣列須與宣告相同(refChanged) → 否則 reject saveRefChanged、零寫入;
//             只改 mode／新增停用項／移除停用項／未變更之舊引用／只改名／整列刪除者不須宣告(不改變啟用引用)
//  [I-REQ]    perm-run03 必帶: 本次寫入改變了啟用引用(新增、移除、停用、停用改啟用、新增列帶引用、複製列帶引用; 名稱以集合計, 同名跨列只算一個)而 opt 未附 refs 與 subject(無第 3 參、{}、兩者 null／undefined、僅 baseline) → reject saveIdentityRequired(reason identityRequired, n＝改變之名稱數)、零寫入、不讀被引用表、不取其鎖(判定在本表鎖內的 write, 故本表鎖有取)
//  [I-RM]     perm-run03 移除亦須宣告: 被移除（或被停用）之啟用引用項, 其名稱在被引用表鎖內新鮮讀取所對應之 id 陣列須與宣告相同——宣告與新鮮讀取一致 → 成功; 被移除名稱之實體已被刪後同名重建(id 不同) → saveRefChanged; 懸空引用(查無實體)被移除且宣告 ids＝[] → 成功; 漏報 → refIncomplete
//  [I-SUBJ-SCOPE] perm-run03: opt.subject 只涵蓋其主體名稱(subject.name; 該名稱之新增或移除皆算已宣告); 另有其他名稱被改而未以 refs 宣告 → saveRefChanged／refIncomplete
//  [I-TGT-ID] targets 之 id 即名稱, 身分定義即 id: 檢查涵蓋「已被刪除」, 刪除後同 id 重建依定義是同一實體 → 成功(R-REF-IDENTITY-01 規則 5, 設計事實)
//  [I-COMPAT] 不改變啟用引用之存檔(只改名／其他欄／mode／整列刪除／新增或移除停用項)與 targets(無授權引用欄)不需宣告: 不驗身分、不取被引用表鎖、不讀被引用表、不擴權（perm-run02 之「改變引用而未帶亦照舊成功」已取消, 見 [I-REQ]）
//  [I-ORDER]  次序: 列格式 → 基準格式 → 身分宣告格式(以上皆在取鎖與占位之前) → 取鎖 → 被引用表新鮮讀取並驗 subject → 基準比對(saveStale) → … → 驗 refs(restoreServerFields 之後、checkExternalWrite 之前); 故 subject 被取代優先於 saveStale, refs 不符在 saveStale 之後
//  [I-LOCK]   取鎖階層: 被引用表鎖在外層、本表鎖在內層(targets → pemis → grups → users); 驗證用之被引用表讀取與本表寫入在同一段持鎖期間(原則 4: 檢查與寫入同一把鎖), 其間被引用表不被任何入口改動; 拒收與失敗皆釋放鎖
//  [I-LOG]    srLog 只記 { keyTable, userId, msg, reason, n }, 不含名稱／id 值(個資); 被拒時另有集中 errLog(<FN>-error)記 err key
//  [I-CLIENT] pickClientOpt 只採納 baseline、returnRows:true、subject、refs(原樣轉出, 不信任內容); 不採納 pickKeysOnly、mustExist、keepUserId、skipDup 等伺服端設定
//  [I-SITE]   靜態站點: getRefTarget／withRefLock／checkSubjectIdentity／checkRefIdentity 各恰一處; 取鎖與檢查之相對位置如下方 IDN-6xx
//
//輸入空間表(軸 × 格; 引用端 H ＝ users／grups／pemis 三表, 被引用表依序為 grups／pemis／targets; 案數為 mocha 實測, 見回報):
//  IDN-1xx 反向主體 [H ∈ users, grups] × 主體狀態 {原封不動, 刪除, 改名, 刪後同名重建, 開框時未儲存而現有同名他實體〔taken〕, 開框時未儲存且無同名〔沿用既有行為〕, 歷史同名多筆但 id 相符} ＋ 格式不合 {16 種} × H 2 ＋ targets 帶 subject／refs ＋ pemis 帶 subject
//  IDN-2xx 正向 refs [H ∈ users, grups, pemis] × {宣告相符, 實體刪除, 刪後同名〔pemis 為同 id〕重建, 另增同名, 懸空→出現, 漏報〔部分／全漏〕, 只改 mode／停用項／移除停用項／舊引用實體被替換不須宣告, 停用改啟用, 多報相符／不符, 不符＋漏報同時, 格式不合 18 種, subject＋refs 合用, 前端函數鏈}
//  IDN-215～219 perm-run03 移除與反向對話框 [H 3 或 2] × {移除引用〔宣告相符／漏報／不符／被移除名稱之實體刪後同名重建／懸空被移除宣告 []／懸空被移除宣告舊 id／懸空被移除而現已出現同名〕, 停用既有項, 同名跨列搬移與多列同名, 前端函數鏈〔移除〕, subject 路徑〔移除主體名稱／停用主體／另改他名未宣告／另改他名以 refs 宣告／主體被取代而本次無變更〕}
//  IDN-22x 逐軸矩陣 [H 3] × 變更型別 K 16 {新增啟用引用, 移除引用〔刪項〕, 停用既有項, 重新啟用, 新增列帶引用, 複製列帶引用, mode 變更, 僅改名, 整列刪除, 同時新增＋移除, 純量簡寫新增／移除, 陣列形式新增／移除, 移除停用項, 新增停用項} × 宣告狀態 D 12 {無第 3 參, 兩者 null, 僅 baseline, 空陣列, 完整, 漏報新增〔僅宣告移除〕, 漏報移除〔僅宣告新增〕, 多報相符, 多報不符, ids 不符, ids 空陣列, 格式不合} ＝ 576 格, 每格預期手寫於 EXPECT 表
//  IDN-3xx 必帶 [H 3] × 改變引用且不帶宣告之 7 種形式 → saveIdentityRequired ＋ 不改變引用之 7 種形式 → 成功 ＋ 次序(基準過期先於必帶)；皆不讀被引用表／不取其鎖
//  IDN-4xx 次序 {subject 先於基準比對〔H 2〕, refs 在基準之後〔H 3〕, 基準格式先於身分格式, 身分格式先於占位, 列格式先於身分格式}
//  IDN-5xx 鎖 {取鎖軌跡 H 3 × {成功,拒收,無宣告改變引用拒收,無宣告不改變引用成功}, 連帶改名之階層, 被引用表只讀一次, 拒收後釋放, V14 人為延遲併發 5 組 × 2 方向, 四表隨機併發 60 輪}
//  IDN-6xx 靜態與介面 {pickClientOpt, 站點計數與次序, 語系鍵〔含 saveIdentityRequired〕}
//未測(刻意): 前端元件如何組宣告（見元件與 e2e）、真後端 RPC（見 api-identity）、外部同步入口對被引用表之改動（本檔以替身表直接改動模擬「他人」, 並行格以 updateGrups／updatePemis／updateTargets 真入口模擬）.
//跑法: node C:/opensrcOper/tools/quiet-run.mjs --name idn -- node node_modules/mocha/bin/mocha.js --no-parallel test/unit-procCore-identity.test.mjs --timeout 180000 --exit
import assert from 'assert'
import path from 'path'
import { fileURLToPath } from 'url'
import cloneDeep from 'lodash-es/cloneDeep.js'
import cacheSt from 'wsemi/src/cacheSt.mjs'
import ds from '../src/schema/index.mjs'
import proc, { pickClientOpt } from '../server/procCore.mjs'
import procLang from '../server/procLang.mjs'
import createLockSave from '../server/lockSave.mjs'
import { makeBaseline } from '../src/js/rowDigest.mjs'
import { snapRefIds, recordPicks, buildRefDecl } from '../src/js/refIdentity.mjs'
import { mkTable, mkCore, mkSrLog } from './tools/unitOrm.mjs'
import { sourceLines } from './tools/srcScan.mjs'


const A = assert.strict
const projRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

const TABLES = ['users', 'grups', 'pemis', 'targets']
const FN = { users: 'updateUsers', grups: 'updateGrups', pemis: 'updatePemis', targets: 'updateTargets' }
const H3 = ['users', 'grups', 'pemis'] //引用端表
const H2 = ['users', 'grups'] //有反向主體之引用端表
const UID = 'id-admin'
const OKS = 'saveTabItemsSuccess'
const PH = '{新增}'
const OR = { mode: 'OR', isActive: 'y' }
const EVT = 'updateTabItems-identity-error'

//各表種子列之 id／名稱(同 unit-procCore-baseline: users／grups／pemis 以 id-xx; targets 之 id 即標的路徑)
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

//HOLD: 引用端表 → 被引用表與授權欄; 第 0、1 列各引用被引用表之第 0、1 個實體, 第 2 列（john／M3／P3）無引用, 為各格「新增引用」之編輯對象
const HOLD = {
    users: { ref: 'grups', field: 'cgrups' },
    grups: { ref: 'pemis', field: 'cpemis' },
    pemis: { ref: 'targets', field: 'crules' },
}
let entName = (h, k) => (h === 'pemis' ? IDS.targets[k] : NAMES[HOLD[h].ref][k]) //被引用表第 k 個實體之引用名稱
let entId = (h, k) => IDS[HOLD[h].ref][k] //被引用表第 k 個實體之 id

let J = (o) => JSON.stringify(o)
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

//authOf: 手建授權字串; items: [[名稱, 'y'|'n']]; users.cgrups／grups.cpemis 為 { 名稱: { mode, isActive } }, pemis.crules 為 { 標的: 'y'|'n' }
let authOf = (h, items) => J(Object.fromEntries(items.map(([n, a]) => [n, h === 'pemis' ? a : { mode: 'OR', isActive: a }])))
//altOf: 另一種合法表示形式(users.cgrups／grups.cpemis 之純量簡寫 { 名稱: 'y' }; pemis.crules 之物件形式 { 標的: { isActive } }); arrOf: 陣列形式 [{ name, isActive }]
let altOf = (h, items) => J(Object.fromEntries(items.map(([n, a]) => [n, h === 'pemis' ? { isActive: a } : a])))
let arrOf = (items) => J(items.map(([n, a]) => ({ name: n, isActive: a })))


// =====================================================================
// 種子與輔助(沿用 unit-procCore-baseline 之 seedRows／createEnv／run／snapAll／cntAll／instrument／assertNoLeak 做法)
// =====================================================================

function seedRows() {
    let audit = (t, k) => ({ userId: `id-seed-${t}-${k}`, timeCreate: `2026-01-0${k + 1}T00:00:00.000+08:00`, userIdUpdate: `id-seed-upd-${t}-${k}`, timeUpdate: `2026-01-0${k + 1}T01:00:00.000+08:00` })
    let mk = (t, k, o) => ({ ...ds[t].funNew(), ...audit(t, k), id: IDS[t][k], order: k + 1, from: '', description: `d-${t}-${k}`, ...o })
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

//entityRow: 「他人」直接寫入庫之被引用實體列(完整欄位; 同名新實體用不同 id)
function entityRow(ref, id, name) {
    let r = { ...ds[ref].funNew(), userId: 'id-other', timeCreate: '2026-02-01T00:00:00.000+08:00', userIdUpdate: 'id-other', timeUpdate: '2026-02-01T00:00:00.000+08:00', order: 4, from: '', description: `d-new-${id}`, id }
    if (ref === 'grups') {
        r.name = name
        r.cpemis = '{}'
    }
    else if (ref === 'pemis') {
        r.name = name
        r.crules = '{}'
    }
    return r
}

//clientEntity: 模擬清單頁 addItem 之被引用實體新列(稽核欄位為佔位字、transient _isNew), 供經真入口(updateGrups 等)新增
let clientEntity = (ref, id, name) => ({ ...entityRow(ref, id, name), userId: PH, timeCreate: PH, userIdUpdate: PH, timeUpdate: PH, _isNew: true })

//createEnv: 每案一組全新替身資料表、真鎖與 procOrm(mkCore)、占位與 procCore; opt.seedEdit(seed) 於建表前改種子; opt.lockOf(core) 回 { withTabLocks, guardWrite } 時改注入之(供 traceLock)
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
    let lock = opt.lockOf ? opt.lockOf(core) : core.lock
    let pc = proc(woItems, core.procOrm, { srLog, ...lock, lockSave: createLockSave(cst) })
    let env = { seed, woItems, logs, cst, core, pc }
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

let rowsSorted = (woItems, t) => JSON.parse(woItems[t].snapshot()).sort((a, b) => a.order - b.order)
let loadRows = rowsSorted //前端載入時所見之列
let snapAll = (w) => JSON.stringify(TABLES.map((t) => w[t].snapshot()))
let cntAll = (w) => JSON.stringify(TABLES.map((t) => w[t].cnt))
let writesOf = (w) => TABLES.reduce((a, t) => a + w[t].cnt.insert + w[t].cnt.save + w[t].cnt.del + w[t].cnt.delAll, 0)
let identityLogs = (logs) => logs.filter((l) => l.event === EVT)
let staleLogs = (logs) => logs.filter((l) => l.event === 'updateTabItems-stale-error')

//instrument: 包裝四表 select／insert／save／del／delAll 計次(供「在任何讀寫之前」與「是否讀被引用表」之斷言)
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

//recordEvents: 記錄四表寫入呼叫(`<表>:<方法>`), 供並行格驗證事件序
function recordEvents(woItems, ev) {
    for (let t of TABLES) {
        for (let m of ['insert', 'save', 'del', 'delAll']) {
            let f = woItems[t][m]
            woItems[t][m] = (...args) => {
                ev.push(`${t}:${m}`)
                return f(...args)
            }
        }
    }
}

//slow: 無參數 select（procCore 之新鮮讀取）先取當下快照再延遲回傳（仿 unit-procCore-baseline UB-7）, 拉長「讀取—驗證—寫入」窗口, 且使鎖外之讀取回傳過期快照
function slow(tbl, ms) {
    let orig = tbl.select
    tbl.select = async (find) => {
        let rs = await orig(find)
        if (find === undefined) {
            await sleep(ms)
        }
        return rs
    }
}

//assertNoLeak: srLog 不得含任何列 id／名稱／個資值([I-LOG])
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

//traceLock: 取鎖軌跡記錄器(仿 unit-procCore-refCascade 之 traceLock): 包裝真鎖, 記錄 `acq <表名>`／`rel <表名>` 後仍呼叫真的(互斥照常); 本表經 guardWrite、被引用／引用端表經 withTabLocks 皆記
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

//viewOf: 四表之正規化視圖(去墻鐘時間欄位), 供終態等價比對
async function viewOf(woItems) {
    let o = {}
    for (let t of TABLES) {
        let rs = await woItems[t].select()
        o[t] = rs.map((r) => {
            let { timeUpdate, timeCreate, ...rest } = r
            return rest
        }).sort((a, b) => String(a.id).localeCompare(String(b.id)))
    }
    return JSON.stringify(o)
}


// =====================================================================
// 情境夾具: 「他人」於使用者編輯期間改動被引用表; 使用者對引用端第 2 列新增引用
// =====================================================================

//editHolder: 把引用端第 row 列（預設第 2 列）之授權欄換成 str
let editHolder = (rows, h, str, row = 2) => rows.map((r, k) => (k === row ? { ...r, [HOLD[h].field]: str } : r))

//他人動作(經替身資料表直接改, 不經 procCore; 模擬「被引用表於我編輯期間被改動」之結果狀態)
async function delEnt(w, h, k) {
    await w[HOLD[h].ref].del([{ id: entId(h, k) }])
}
async function addEnt(w, h, k, id) {
    await w[HOLD[h].ref].insert([entityRow(HOLD[h].ref, id, entName(h, k))])
}
//replaceEnt: 刪除後以同名重建——users／grups 為不同 id; pemis 之 targets id 即名稱, 重建必為同 id
async function replaceEnt(w, h, k) {
    await delEnt(w, h, k)
    await addEnt(w, h, k, h === 'pemis' ? entId(h, k) : `${entId(h, k)}-NEW`)
}
async function renameEnt(w, h, k) {
    await w[HOLD[h].ref].save([{ id: entId(h, k), name: `${entName(h, k)}-改` }])
}

//declOf: 對「新增第 k 個實體為啟用引用」之手算宣告
let declOf = (h, ...ks) => ks.map((k) => ({ name: entName(h, k), ids: [entId(h, k)] }))

//expectIdentityReject: 被拒——回指定語系鍵、四表逐位元不變、四表 cnt 不增(零寫入)、srLog 記 identity-error 一筆(只含 level／event／keyTable／userId／msg／reason／n)、集中 errLog 記 err key、無 stale-error、srLog 不含名稱／id 值
//  opt.zeroIO 為真: 另斷言在任何讀寫之前拒收(四表 select／insert／save／del／delAll 皆為 0)
//  opt.refUntouched 為真(perm-run03 [I-REQ]): 另斷言被引用表(HOLD[h].ref)完全未被讀寫（無宣告者不讀被引用表）
//  opt.trace 為 { t, want }: 另斷言取鎖軌跡（traceLock 記錄）逐項等於 want
async function expectIdentityReject(env, h, rows, optClient, key, reason, n, ext = {}) {
    let { woItems, logs, pc, seed } = env
    let calls = (ext.zeroIO || ext.refUntouched) ? instrument(woItems) : null
    let snap0 = snapAll(woItems)
    let cnt0 = cntAll(woItems)
    let r = await run(pc, h, rows, optClient)
    A.deepEqual(r, { ok: false, v: key })
    A.equal(snapAll(woItems), snap0, '[I-SUBJ][I-REF] 被拒時四表須逐位元不變(零寫入)')
    A.equal(cntAll(woItems), cnt0, '被拒時不得有任何寫入呼叫')
    if (ext.zeroIO) {
        A.equal(sumCalls(calls), 0, `[I-FMT] 須在任何讀寫之前拒收, 實得 ${J(calls)}`)
    }
    if (ext.refUntouched) {
        let c = calls[HOLD[h].ref]
        A.equal(c.select + c.insert + c.save + c.del + c.delAll, 0, `[I-REQ] 被引用表 ${HOLD[h].ref} 不得被讀寫, 實得 ${J(c)}`)
    }
    if (ext.trace) {
        A.deepEqual(ext.trace.t.log, ext.trace.want, '[I-REQ][I-LOCK] 取鎖軌跡')
    }
    let ev = identityLogs(logs)
    A.equal(ev.length, 1, `srLog ${EVT} 應恰一筆`)
    A.deepEqual(Object.keys(ev[0]).sort(), ['event', 'keyTable', 'level', 'msg', 'n', 'reason', 'userId'], '[I-LOG] 只記錯誤鍵、原因、筆數')
    A.equal(ev[0].level, 'error')
    A.equal(ev[0].keyTable, h)
    A.equal(ev[0].msg, key)
    A.equal(ev[0].reason, reason)
    A.equal(ev[0].n, n)
    A.equal(ev[0].userId, UID)
    A.ok(logs.some((l) => l.level === 'error' && l.event === `${FN[h]}-error` && l.msg === key), '集中 errLog 記 err key')
    A.equal(staleLogs(logs).length, 0, '身分拒收不是基準過期, 不得記 stale-error')
    assertNoLeak(logs, seed, ext.extras || [])
    return r
}

//expectRequired(perm-run03 [I-REQ]): 改變引用而未附宣告 → saveIdentityRequired／identityRequired(n＝改變之名稱數)、零寫入、被引用表完全未被讀寫
let expectRequired = (env, h, rows, optClient, n, ext = {}) => expectIdentityReject(env, h, rows, optClient, 'saveIdentityRequired', 'identityRequired', n, { refUntouched: true, ...ext })

//expectOk: 成功——回 saveTabItemsSuccess、無 identity-error
async function expectOk(env, h, rows, optClient) {
    let r = await run(env.pc, h, rows, optClient)
    A.deepEqual(r, { ok: true, v: OKS })
    A.equal(identityLogs(env.logs).length, 0, '成功時不得記 identity-error')
    return r
}

//mkNewRow: 模擬清單頁 addItem 之引用端新列（稽核欄位為佔位字、transient _isNew）; auth 為其授權欄字串
function mkNewRow(h, auth, tag = 'NEW') {
    let r = { ...ds[h].funNew(), userId: PH, timeCreate: PH, userIdUpdate: PH, timeUpdate: PH, _isNew: true, from: '', description: `new-row-${tag}`, [HOLD[h].field]: auth }
    if (h === 'users') {
        r.name = `newbie${tag}`
        r.email = `newbie${tag}@example.com`
        r.isAdmin = 'n'
        r.isActive = 'y'
    }
    else {
        r.name = h === 'grups' ? `權限群組${tag}` : `權限${tag}`
    }
    return r
}
//mkCopyRow: 模擬清單頁 copyItem 之複製列（取庫內第 k 列複本, 換新 id／唯一名稱／唯一 email, 標 _isNew, 授權欄原樣帶過來）
function mkCopyRow(rows, h, k, tag = 'CPY') {
    let r = { ...cloneDeep(rows[k]), id: `id-copy-${h}-${tag}`, _isNew: true, userId: PH, timeCreate: PH, userIdUpdate: PH, timeUpdate: PH }
    r.name = `${r.name}-${tag}`
    if (h === 'users') {
        r.email = `${tag}-${r.email}`
    }
    return r
}

//authAt: 讀庫內引用端第 row 列授權欄解析後之物件
let authAt = (woItems, h, row = 2) => JSON.parse(woItems[h].get(IDS[h][row])[HOLD[h].field])


describe('unit-procCore-identity (伺服端強制之被引用實體身分: subject／refs)', function() {

    afterEach(function() {
        envs.forEach((e) => e.cst.clear()) //停止 cacheSt 之 TTL 偵測 timer, 避免 mocha 不結束
        envs = []
    })


    // =================================================================
    // IDN-1xx 反向主體 subject（users 表之主體為 grups、grups 表之主體為 pemis）
    // =================================================================
    describe('IDN-1 反向主體 subject', function() {
        for (let h of H2) {
            let ref = HOLD[h].ref
            let nm = entName(h, 2)
            let id = entId(h, 2)
            let subj = (o) => ({ id, name: nm, saved: true, ...o })
            let sendAdd = (rows) => editHolder(rows, h, authOf(h, [[nm, 'y']])) //反向對話框之效果: 把主體加進引用端第 2 列

            it(`IDN-101 [${h}] 主體原封不動(同 id 同名) → 成功寫入; 主體表不被寫入; 其他列不變`, async function() {
                let env = createEnv()
                let { woItems } = env
                let rows = loadRows(woItems, h)
                let before = rowsSorted(woItems, h)
                let snapRef = woItems[ref].snapshot()
                await expectOk(env, h, sendAdd(rows), { subject: subj() }) //[I-SUBJ] ok
                A.deepEqual(authAt(woItems, h), { [nm]: OR }, '授權已寫入')
                A.deepEqual(woItems[h].get(IDS[h][0]), before[0], '未改列不得被寫入')
                A.deepEqual(woItems[h].get(IDS[h][1]), before[1])
                A.equal(woItems[ref].snapshot(), snapRef, '[I-SUBJ] 主體表只讀不寫')
                A.deepEqual(woItems[ref].cnt, { insert: 0, save: 0, del: 0, delAll: 0 }, '[I-SUBJ] 主體表無任何寫入呼叫')
            })

            it(`IDN-102 [${h}] 主體被刪除 → saveSubjectChanged/gone, 零寫入`, async function() {
                let env = createEnv()
                let rows = loadRows(env.woItems, h)
                await delEnt(env.woItems, h, 2)
                await expectIdentityReject(env, h, sendAdd(rows), { subject: subj() }, 'saveSubjectChanged', 'gone', 1) //[I-SUBJ] gone
            })

            it(`IDN-103 [${h}] 主體被改名(同 id 異名) → saveSubjectChanged/renamed, 零寫入`, async function() {
                let env = createEnv()
                let rows = loadRows(env.woItems, h)
                await renameEnt(env.woItems, h, 2)
                await expectIdentityReject(env, h, sendAdd(rows), { subject: subj() }, 'saveSubjectChanged', 'renamed', 1) //[I-SUBJ] renamed
            })

            it(`IDN-104 [${h}] 主體被刪除後以同名重建(id 不同)且 saved:true → saveSubjectChanged/gone, 零寫入(授權不得被同名新實體接管)`, async function() {
                let env = createEnv()
                let rows = loadRows(env.woItems, h)
                await replaceEnt(env.woItems, h, 2)
                A.ok(env.woItems[ref].has(`${id}-NEW`) && !env.woItems[ref].has(id), '前提: 同名實體已換成新 id')
                await expectIdentityReject(env, h, sendAdd(rows), { subject: subj() }, 'saveSubjectChanged', 'gone', 1, { extras: [{ id: `${id}-NEW`, name: nm }] }) //[I-SUBJ] 刪後同名重建 → gone
            })

            it(`IDN-105 [${h}] 開框時未儲存(saved:false)而現有同名不同 id 之實體 → saveSubjectChanged/taken, 零寫入`, async function() {
                let env = createEnv()
                let rows = loadRows(env.woItems, h)
                let existing = entName(h, 0) //被引用表已有此名稱(id 為第 0 個實體)
                await expectIdentityReject(env, h, editHolder(rows, h, authOf(h, [[existing, 'y']])), { subject: { id: 'id-unsaved', name: existing, saved: false } }, 'saveSubjectChanged', 'taken', 1) //[I-SUBJ] taken
            })

            it(`IDN-106 [${h}] 開框時未儲存且被引用表無同名 → 成功(沿用既有行為: 引用先指向尚不存在之名稱)`, async function() {
                let env = createEnv()
                let rows = loadRows(env.woItems, h)
                await expectOk(env, h, editHolder(rows, h, authOf(h, [['尚未儲存之新名', 'y']])), { subject: { id: 'id-unsaved', name: '尚未儲存之新名', saved: false } }) //[I-SUBJ] 未儲存且無同名 → ok
                A.deepEqual(authAt(env.woItems, h), { 尚未儲存之新名: OR })
            })

            it(`IDN-107 [${h}] 主體表另有歷史同名之他實體但 id 相符 → 成功(以 id 認同一實體, 不因同名多筆誤拒)`, async function() {
                let env = createEnv()
                let rows = loadRows(env.woItems, h)
                await addEnt(env.woItems, h, 2, `${id}-DUP`)
                await expectOk(env, h, sendAdd(rows), { subject: subj() }) //[I-SUBJ] 同 id 同名 → ok
            })

            it(`IDN-108 [${h}] 主體被取代時, 原寫入內容（哪怕合法）亦不寫入: 引用端表逐位元不變`, async function() {
                let env = createEnv()
                let rows = loadRows(env.woItems, h)
                await delEnt(env.woItems, h, 2)
                let snapH = env.woItems[h].snapshot()
                let r = await run(env.pc, h, sendAdd(rows), { subject: subj() })
                A.deepEqual(r, { ok: false, v: 'saveSubjectChanged' })
                A.equal(env.woItems[h].snapshot(), snapH, '[I-SUBJ] 引用端表零寫入')
            })
        }

        //格式不合(皆不得降級為不帶): 在任何讀寫之前拒收
        const SUBJ_BAD = [
            ['false', false], ['0', 0], ['空字串', ''], ['字串', 'x'], ['數字', 5], ['空陣列', []], ['空物件', {}],
            ['缺 name 與 saved', { id: 'a' }], ['缺 saved', { id: 'a', name: 'b' }], ['缺 id', { name: 'b', saved: true }],
            ['id 空字串', { id: '', name: 'b', saved: true }], ['name 空字串', { id: 'a', name: '', saved: true }], ['id 為數字', { id: 5, name: 'b', saved: true }],
            ["saved 為 'true'", { id: 'a', name: 'b', saved: 'true' }], ['saved 為 1', { id: 'a', name: 'b', saved: 1 }], ['saved 為 null', { id: 'a', name: 'b', saved: null }],
        ]
        for (let h of H2) {
            SUBJ_BAD.forEach(([title, bad]) => {
                it(`IDN-109 [${h}] subject 格式不合「${title}」→ saveIdentityFormat/format, 在任何讀寫之前, 零寫入`, async function() {
                    let env = createEnv()
                    let rows = loadRows(env.woItems, h)
                    await expectIdentityReject(env, h, editHolder(rows, h, authOf(h, [[entName(h, 2), 'y']])), { subject: bad }, 'saveIdentityFormat', 'format', 0, { zeroIO: true }) //[I-FMT]
                })
            })
        }

        it('IDN-110 [targets] 無授權引用欄: 帶 subject（即使形狀合法）→ saveIdentityFormat/format, 在任何讀寫之前, 零寫入', async function() {
            let env = createEnv()
            let rows = loadRows(env.woItems, 'targets')
            let sent = rows.map((r, k) => (k === 0 ? { ...r, description: 'edited' } : r))
            await expectIdentityReject(env, 'targets', sent, { subject: { id: IDS.targets[0], name: IDS.targets[0], saved: true } }, 'saveIdentityFormat', 'format', 0, { zeroIO: true }) //[I-FMT] getRefTarget(targets) 為 null
        })

        it('IDN-111 [targets] 帶 refs（即使為空陣列）→ saveIdentityFormat/format, 在任何讀寫之前, 零寫入; subject＋refs 同帶亦同', async function() {
            for (let opt of [{ refs: [] }, { refs: [{ name: 'x', ids: [] }] }, { subject: { id: 'a', name: 'b', saved: true }, refs: [] }]) {
                let env = createEnv()
                let rows = loadRows(env.woItems, 'targets')
                let sent = rows.map((r, k) => (k === 0 ? { ...r, description: 'edited' } : r))
                await expectIdentityReject(env, 'targets', sent, opt, 'saveIdentityFormat', 'format', 0, { zeroIO: true }) //[I-FMT]
                env.cst.clear()
            }
        })

        it('IDN-112 [targets] 不帶宣告 / 帶 null → 與修正前同: 成功(targets 無引用身分可驗, 不擴權)', async function() {
            for (let opt of [undefined, {}, { subject: null }, { refs: null }, { subject: undefined, refs: undefined }]) {
                let env = createEnv()
                let rows = loadRows(env.woItems, 'targets')
                await expectOk(env, 'targets', rows.map((r, k) => (k === 0 ? { ...r, description: 'edited' } : r)), opt) //[I-COMPAT]
                A.equal(env.woItems.targets.get(IDS.targets[0]).description, 'edited')
                env.cst.clear()
            }
        })

        it('IDN-113 [pemis] 帶 subject: pemis 之被引用表為 targets（列無 name 欄）, 無對應之反向主體 → 於任何讀寫之前以格式錯誤拒收 saveIdentityFormat／format(n 0)、零寫入、零 I/O(外審 sol#2: 原只釘「不得寫入」, 拿掉 procCore 之 targets 分支仍會過; 現固定鍵與 reason)', async function() {
            let env = createEnv()
            let rows = loadRows(env.woItems, 'pemis')
            await expectIdentityReject(env, 'pemis', editHolder(rows, 'pemis', authOf('pemis', [[IDS.targets[2], 'y']])), { subject: { id: IDS.targets[2], name: IDS.targets[2], saved: true } }, 'saveIdentityFormat', 'format', 0, { zeroIO: true })
        })
    })


    // =================================================================
    // IDN-2xx 正向 refs
    // =================================================================
    describe('IDN-2 正向 refs（新增啟用引用之被引用實體身分宣告）', function() {
        for (let h of H3) {
            let ref = HOLD[h].ref
            let f = HOLD[h].field
            let n2 = entName(h, 2)
            let add2 = (rows) => editHolder(rows, h, authOf(h, [[n2, 'y']]))

            it(`IDN-201 [${h}→${ref}] 新增啟用引用且宣告相符(現況未變) → 成功寫入; 其他列與被引用表不變`, async function() {
                let env = createEnv()
                let { woItems } = env
                let rows = loadRows(woItems, h)
                let before = rowsSorted(woItems, h)
                let snapRef = woItems[ref].snapshot()
                await expectOk(env, h, add2(rows), { refs: declOf(h, 2) }) //[I-REF] 相符
                A.deepEqual(Object.keys(authAt(woItems, h)), [n2], '授權已寫入')
                A.equal(woItems[h].get(IDS[h][2]).userIdUpdate, UID)
                A.deepEqual(woItems[h].get(IDS[h][0]), before[0], '未改列不得被寫入')
                A.deepEqual(woItems[h].get(IDS[h][1]), before[1])
                A.equal(woItems[ref].snapshot(), snapRef, '被引用表只讀不寫')
            })

            it(`IDN-202 [${h}→${ref}] 被引用實體已被刪除 → saveRefChanged/refChanged(n 1), 零寫入`, async function() {
                let env = createEnv()
                let rows = loadRows(env.woItems, h)
                await delEnt(env.woItems, h, 2)
                await expectIdentityReject(env, h, add2(rows), { refs: declOf(h, 2) }, 'saveRefChanged', 'refChanged', 1) //[I-REF] 刪除 → ids [] ≠ 宣告
            })

            if (h !== 'pemis') {
                it(`IDN-203 [${h}→${ref}] 刪除後以同名重建(id 不同) → saveRefChanged/refChanged(n 1), 零寫入(授權不得被同名新實體接管)`, async function() {
                    let env = createEnv()
                    let rows = loadRows(env.woItems, h)
                    await replaceEnt(env.woItems, h, 2)
                    await expectIdentityReject(env, h, add2(rows), { refs: declOf(h, 2) }, 'saveRefChanged', 'refChanged', 1, { extras: [{ id: `${entId(h, 2)}-NEW`, name: n2 }] }) //[I-REF] 刪後同名重建
                })

                it(`IDN-204 [${h}→${ref}] 另新增了同名實體(原實體仍在, 同名對應兩個 id) → saveRefChanged/refChanged, 零寫入`, async function() {
                    let env = createEnv()
                    let rows = loadRows(env.woItems, h)
                    await addEnt(env.woItems, h, 2, `${entId(h, 2)}-DUP`)
                    await expectIdentityReject(env, h, add2(rows), { refs: declOf(h, 2) }, 'saveRefChanged', 'refChanged', 1) //[I-REF] 新增同名使 ids 變兩個
                })
            }
            else {
                it(`IDN-203 [${h}→${ref}] targets 刪除後以同 id 重建 → 依定義是同一實體, 成功寫入(設計事實, R-REF-IDENTITY-01 規則 5)`, async function() {
                    let env = createEnv()
                    let { woItems } = env
                    let rows = loadRows(woItems, h)
                    await replaceEnt(woItems, h, 2) //刪除後同 id 重建
                    A.ok(woItems.targets.has(entId(h, 2)), '前提: 同 id 之標的存在(已重建)')
                    A.equal(woItems.targets.get(entId(h, 2)).userId, 'id-other', '前提: 此列確為重建所得（建立者為他人）, 非原列')
                    await expectOk(env, h, add2(rows), { refs: declOf(h, 2) }) //[I-TGT-ID] targets 身分即 id → 相符 → 成功
                    A.deepEqual(Object.keys(authAt(woItems, h)), [n2])
                })
            }

            it(`IDN-205 [${h}→${ref}] 懸空: 選取當時查無(宣告 ids [])且仍查無 → 成功(沿用既有行為); 之後該名稱被他人建立 → saveRefChanged, 零寫入`, async function() {
                let env = createEnv()
                let rows = loadRows(env.woItems, h)
                await delEnt(env.woItems, h, 2) //選取當時被引用表無此名稱
                await expectOk(env, h, add2(rows), { refs: [{ name: n2, ids: [] }] }) //[I-REF] 宣告 [] 且仍查無
                A.deepEqual(Object.keys(authAt(env.woItems, h)), [n2])
                //同情境另一份: 送出前該名稱被他人建立
                let env2 = createEnv()
                let rows2 = loadRows(env2.woItems, h)
                await delEnt(env2.woItems, h, 2)
                await addEnt(env2.woItems, h, 2, h === 'pemis' ? entId(h, 2) : `${entId(h, 2)}-LATE`)
                await expectIdentityReject(env2, h, add2(rows2), { refs: [{ name: n2, ids: [] }] }, 'saveRefChanged', 'refChanged', 1) //[I-REF] 宣告查無而現已有 → 被新出現之實體接管
            })

            it(`IDN-206 [${h}→${ref}] 宣告不完整: 新增兩個啟用引用僅宣告一個 → saveRefChanged/refIncomplete(n 1); 空宣告 → refIncomplete(n 2); 零寫入`, async function() {
                let n1 = entName(h, 1)
                let add12 = (rows) => editHolder(rows, h, authOf(h, [[n1, 'y'], [n2, 'y']]))
                let env = createEnv()
                await expectIdentityReject(env, h, add12(loadRows(env.woItems, h)), { refs: declOf(h, 2) }, 'saveRefChanged', 'refIncomplete', 1) //[I-REF] 漏報一個
                let env2 = createEnv()
                await expectIdentityReject(env2, h, add12(loadRows(env2.woItems, h)), { refs: [] }, 'saveRefChanged', 'refIncomplete', 2) //[I-REF] 空宣告 → 漏報兩個
            })

            it(`IDN-207 [${h}→${ref}] 不須宣告: 只改 mode／新增停用項／移除停用項／舊引用之實體已被替換而引用未變 → 成功（refs: []; perm-run03: 原「移除舊引用」案已改列 IDN-215，移除啟用引用現須宣告）`, async function() {
                //第 1 列（mary／M2／P2）舊值引用第 1 個實體（啟用）
                let n1 = entName(h, 1)
                let modeOnly = h === 'pemis' ? J({ [n1]: { isActive: 'y', note: 'x' } }) : J({ [n1]: { mode: 'AND', isActive: 'y' } })
                let cases = [
                    ['只改 mode（仍啟用, 舊引用）', modeOnly, 1],
                    ['新增停用項（不授權）', authOf(h, [[n1, 'y'], [n2, 'n']]), 1],
                ]
                for (let [title, str, row] of cases) {
                    let env = createEnv()
                    let rows = loadRows(env.woItems, h)
                    await expectOk(env, h, editHolder(rows, h, str, row), { refs: [] }) //[I-REF] 啟用引用未變 → 免宣告
                    A.equal(env.woItems[h].get(IDS[h][row])[f], str, `${title}: 已寫入`)
                }
                //移除停用項: 種子第 2 列含停用項 n2, 本次移除之——啟用引用不變（停用項不授權, 移除它不是移除引用）→ 免宣告
                let envOff = createEnv({ seedEdit: (seed) => { seed[h][2][f] = authOf(h, [[n2, 'n']]) } })
                await expectOk(envOff, h, editHolder(loadRows(envOff.woItems, h), h, '{}', 2), { refs: [] }) //[I-REF][I-COMPAT]
                A.equal(envOff.woItems[h].get(IDS[h][2])[f], '{}', '移除停用項: 已寫入')
                //舊引用之實體已被替換／刪除，但該列引用字串未變更（已持久之關係）→ 不驗
                let env = createEnv()
                let rows = loadRows(env.woItems, h)
                await replaceEnt(env.woItems, h, 1)
                if (h === 'pemis') {
                    await delEnt(env.woItems, h, 1) //targets 同 id 重建無差別, 另直接刪除使其懸空
                }
                await expectOk(env, h, rows.map((r, k) => (k === 2 ? { ...r, description: 'only-desc' } : r)), { refs: [] }) //[I-REF] 未變更之舊引用不入
                A.equal(env.woItems[h].get(IDS[h][2]).description, 'only-desc')
            })

            it(`IDN-208 [${h}→${ref}] 停用項改啟用算新增: 未宣告 → refIncomplete(n 1), 零寫入; 宣告 → 成功`, async function() {
                let seedEdit = (seed) => {
                    seed[h][2][f] = authOf(h, [[n2, 'n']])
                }
                let env = createEnv({ seedEdit })
                let rows = loadRows(env.woItems, h)
                await expectIdentityReject(env, h, add2(rows), { refs: [] }, 'saveRefChanged', 'refIncomplete', 1) //[I-REF] 停用 → 啟用 ＝ 新增啟用引用
                let env2 = createEnv({ seedEdit })
                await expectOk(env2, h, add2(loadRows(env2.woItems, h)), { refs: declOf(h, 2) })
                A.deepEqual(Object.keys(authAt(env2.woItems, h)), [n2])
            })

            it(`IDN-209 [${h}→${ref}] 多報: 宣告了未新增之名稱——現況相符 → 成功; 宣告之 id 與現況不符 → saveRefChanged/refChanged(n 1)`, async function() {
                let env = createEnv()
                await expectOk(env, h, add2(loadRows(env.woItems, h)), { refs: declOf(h, 2, 1) }) //[I-REF] 多報而相符
                let env2 = createEnv()
                await expectIdentityReject(env2, h, add2(loadRows(env2.woItems, h)), { refs: [...declOf(h, 2), { name: entName(h, 1), ids: ['不存在之id'] }] }, 'saveRefChanged', 'refChanged', 1) //[I-REF] 多報而不符
            })

            it(`IDN-210 [${h}→${ref}] 同時有不符與漏報 → 先判不符: saveRefChanged/refChanged, n＝不符名稱數; 兩個皆不符 → n 2`, async function() {
                let n1 = entName(h, 1)
                let add12 = (rows) => editHolder(rows, h, authOf(h, [[n1, 'y'], [n2, 'y']]))
                let env = createEnv()
                let rows = loadRows(env.woItems, h)
                await delEnt(env.woItems, h, 2)
                await expectIdentityReject(env, h, add12(rows), { refs: declOf(h, 2) }, 'saveRefChanged', 'refChanged', 1) //[I-REF] 不符(第 2 個已刪)與漏報(第 1 個)並存 → refChanged
                let env2 = createEnv()
                let rows2 = loadRows(env2.woItems, h)
                await delEnt(env2.woItems, h, 1)
                await delEnt(env2.woItems, h, 2)
                await expectIdentityReject(env2, h, add12(rows2), { refs: declOf(h, 1, 2) }, 'saveRefChanged', 'refChanged', 2)
            })

            it(`IDN-211 [${h}→${ref}] 新增列（舊表無該 id）帶啟用引用亦須宣告: 未宣告 refIncomplete; 宣告相符成功`, async function() {
                let mkNew = () => {
                    let r = { ...ds[h].funNew(), userId: PH, timeCreate: PH, userIdUpdate: PH, timeUpdate: PH, _isNew: true, from: '', description: 'new-row', [f]: authOf(h, [[n2, 'y']]) }
                    if (h === 'users') {
                        r.name = 'newbie'
                        r.email = 'newbie@example.com'
                        r.isAdmin = 'n'
                        r.isActive = 'y'
                    }
                    else {
                        r.name = h === 'grups' ? '權限群組NEW' : '權限PNEW'
                    }
                    return r
                }
                let env = createEnv()
                await expectIdentityReject(env, h, [...loadRows(env.woItems, h), mkNew()], { refs: [] }, 'saveRefChanged', 'refIncomplete', 1) //[I-REF] 新增列之啟用引用亦算新增
                let env2 = createEnv()
                await expectOk(env2, h, [...loadRows(env2.woItems, h), mkNew()], { refs: declOf(h, 2) })
                A.equal(env2.woItems[h].size(), 4, '新增列已寫入')
            })
        }

        //格式不合: 在任何讀寫之前拒收
        const REFS_BAD = [
            ['false', false], ['0', 0], ['空字串', ''], ['字串', 'x'], ['數字', 5], ['物件', {}], ['類陣列物件', { length: 0 }],
            ['項為 null', [null]], ['項為陣列', [[]]], ['項為字串', ['x']], ['name 非字串', [{ name: 1, ids: [] }]], ['缺 name', [{ ids: [] }]],
            ['缺 ids', [{ name: 'a' }]], ['ids 非陣列', [{ name: 'a', ids: 'x' }]], ['ids 含非字串', [{ name: 'a', ids: [1] }]],
            ['名稱重複', [{ name: 'a', ids: [] }, { name: 'a', ids: [] }]],
            ['超量 5001 筆', Array.from({ length: 5001 }, (_, k) => ({ name: `n${k}`, ids: [] }))],
            ['單名稱 ids 超量 1001', [{ name: 'a', ids: Array.from({ length: 1001 }, (_, k) => `i${k}`) }]],
        ]
        for (let h of H3) {
            REFS_BAD.forEach(([title, bad]) => {
                it(`IDN-212 [${h}] refs 格式不合「${title}」→ saveIdentityFormat/format, 在任何讀寫之前, 零寫入`, async function() {
                    let env = createEnv()
                    let rows = loadRows(env.woItems, h)
                    await expectIdentityReject(env, h, editHolder(rows, h, authOf(h, [[entName(h, 2), 'y']])), { refs: bad }, 'saveIdentityFormat', 'format', 0, { zeroIO: true }) //[I-FMT]
                })
            })
        }
        it('IDN-212 [邊界] refs 5000 筆（多為無關名稱）與單名稱 1000 個 id 皆為合法格式: 不因格式被拒（結果依身分檢查）', async function() {
            let env = createEnv()
            let rows = loadRows(env.woItems, 'users')
            let big = [{ name: NAMES.grups[2], ids: [IDS.grups[2]] }, ...Array.from({ length: 4999 }, (_, k) => ({ name: `無關${k}`, ids: [] }))] //共 5000 筆: 首筆為真宣告, 其餘為查無之無關名稱（宣告 [] 與現況相符）
            A.equal(big.length, 5000)
            await expectOk(env, 'users', editHolder(rows, 'users', authOf('users', [[NAMES.grups[2], 'y']])), { refs: big }) //[I-FMT] 5000 為合法上限
            let env2 = createEnv()
            let ids1000 = Array.from({ length: 1000 }, (_, k) => `i${k}`)
            let r = await run(env2.pc, 'users', editHolder(loadRows(env2.woItems, 'users'), 'users', authOf('users', [[NAMES.grups[2], 'y']])), { refs: [{ name: NAMES.grups[2], ids: ids1000 }] })
            A.deepEqual(r, { ok: false, v: 'saveRefChanged' }, '1000 個 id 為合法格式, 但與現況不符 → refChanged（非 identityFormat）')
        })

        for (let h of H2) {
            let ref = HOLD[h].ref
            let n2 = entName(h, 2)
            let subj0 = { id: entId(h, 0), name: entName(h, 0), saved: true } //主體＝第 0 個實體（不動）
            let sendAdd = (rows) => editHolder(rows, h, authOf(h, [[n2, 'y']]))

            it(`IDN-213 [${h}] subject＋refs 合用: 兩者皆相符 → 成功, 被引用表只讀一次（共用同一份新鮮讀取）; 主體被取代 → saveSubjectChanged; 僅 refs 不符 → saveRefChanged; 任一格式不合 → saveIdentityFormat`, async function() {
                let env = createEnv()
                let calls = instrument(env.woItems)
                await expectOk(env, h, sendAdd(loadRows(env.woItems, h)), { subject: subj0, refs: declOf(h, 2) })
                A.equal(calls[ref].select, 1, '[I-LOCK] 被引用表於持鎖期間只新鮮讀取一次, subject 與 refs 共用')
                A.equal(calls[ref].insert + calls[ref].save + calls[ref].del + calls[ref].delAll, 0)
                //主體被取代 → saveSubjectChanged（先於 refs）
                let env2 = createEnv()
                let rows2 = loadRows(env2.woItems, h)
                await delEnt(env2.woItems, h, 0)
                await delEnt(env2.woItems, h, 2) //refs 亦不符，但 subject 先判
                await expectIdentityReject(env2, h, sendAdd(rows2), { subject: subj0, refs: declOf(h, 2) }, 'saveSubjectChanged', 'gone', 1)
                //僅 refs 不符
                let env3 = createEnv()
                let rows3 = loadRows(env3.woItems, h)
                await delEnt(env3.woItems, h, 2)
                await expectIdentityReject(env3, h, sendAdd(rows3), { subject: subj0, refs: declOf(h, 2) }, 'saveRefChanged', 'refChanged', 1)
                //格式: subject 合法＋refs 非法、subject 非法＋refs 合法
                let env4 = createEnv()
                await expectIdentityReject(env4, h, sendAdd(loadRows(env4.woItems, h)), { subject: subj0, refs: 'x' }, 'saveIdentityFormat', 'format', 0, { zeroIO: true })
                let env5 = createEnv()
                await expectIdentityReject(env5, h, sendAdd(loadRows(env5.woItems, h)), { subject: { id: 'a' }, refs: declOf(h, 2) }, 'saveIdentityFormat', 'format', 0, { zeroIO: true })
            })
        }

        //前端函數鏈: 開框快照 → 回填記錄 → 組宣告 → 送伺服端(宣告取「選取當時」)
        for (let h of H3) {
            let ref = HOLD[h].ref
            let n2 = entName(h, 2)
            it(`IDN-214 [${h}→${ref}] 前端函數鏈(snapRefIds → recordPicks → buildRefDecl)組出之宣告: 選取後無人動 → 成功; 選取後被引用實體被${h === 'pemis' ? '刪除' : '刪除後同名重建'} → saveRefChanged`, async function() {
                let build = (env) => {
                    let rows = loadRows(env.woItems, h)
                    let snap = snapRefIds(h, rowsSorted(env.woItems, ref)) //使用者開啟編輯器當下之被引用表
                    let strNew = authOf(h, [[n2, 'y']])
                    let picks = recordPicks({ keyTable: h, strOld: rows[2][HOLD[h].field], strNew, snap, picks: new Map() })
                    let sent = editHolder(rows, h, strNew)
                    return { rows, sent, picks }
                }
                let env = createEnv()
                let b1 = build(env)
                let decl1 = buildRefDecl({ keyTable: h, rowsNew: b1.sent, rowsOld: b1.rows, picks: b1.picks, refRows: rowsSorted(env.woItems, ref) })
                A.deepEqual(decl1, [{ name: n2, ids: [entId(h, 2)] }], '前提: 宣告為選取當時之 id')
                await expectOk(env, h, b1.sent, { refs: decl1 }) //[I-REF]
                let env2 = createEnv()
                let b2 = build(env2)
                await (h === 'pemis' ? delEnt(env2.woItems, h, 2) : replaceEnt(env2.woItems, h, 2)) //選取後、送出前被改動
                let decl2 = buildRefDecl({ keyTable: h, rowsNew: b2.sent, rowsOld: b2.rows, picks: b2.picks, refRows: rowsSorted(env2.woItems, ref) })
                A.deepEqual(decl2, decl1, '前提: 有選取記錄者宣告不隨送出當下之被引用表改變')
                await expectIdentityReject(env2, h, b2.sent, { refs: decl2 }, 'saveRefChanged', 'refChanged', 1)
            })
        }

        // ----- perm-run03: 移除引用亦須宣告(IDN-215～219; [I-RM][I-REQ]) -----
        for (let h of H3) {
            let ref = HOLD[h].ref
            let f = HOLD[h].field
            let n0 = entName(h, 0)
            let n1 = entName(h, 1)
            let n2 = entName(h, 2)
            let rm1 = (rows) => editHolder(rows, h, '{}', 1) //第 1 列（mary／M2／P2）移除其唯一啟用引用 n1

            it(`IDN-215 [${h}→${ref}] 移除引用: 宣告與鎖內新鮮讀取一致 → 成功（被引用表只讀不寫）; 無宣告 → saveIdentityRequired(n 1, 只取本表鎖, 不碰被引用表); 空宣告／漏報 → refIncomplete; ids 不符（亂 id／空陣列而實體仍在）→ refChanged; 被拒皆零寫入`, async function() {
                let env = createEnv()
                let { woItems } = env
                let snapRef = woItems[ref].snapshot()
                await expectOk(env, h, rm1(loadRows(woItems, h)), { refs: declOf(h, 1) }) //[I-RM] 宣告相符
                A.equal(woItems[h].get(IDS[h][1])[f], '{}', '引用已移除')
                A.equal(woItems[ref].snapshot(), snapRef, '被引用表只讀不寫')
                //無宣告
                let t = traceLock()
                let env2 = createEnv({ lockOf: t.wrap })
                await expectRequired(env2, h, rm1(loadRows(env2.woItems, h)), undefined, 1, { trace: { t, want: [`acq ${h}`, `rel ${h}`] } }) //[I-REQ] 移除亦須宣告
                //空宣告
                let env3 = createEnv()
                await expectIdentityReject(env3, h, rm1(loadRows(env3.woItems, h)), { refs: [] }, 'saveRefChanged', 'refIncomplete', 1) //[I-RM] 漏報
                //漏報: 同時移除第 0、1 兩列之引用, 僅宣告其一
                let env4 = createEnv()
                let both = editHolder(rm1(loadRows(env4.woItems, h)), h, '{}', 0)
                await expectIdentityReject(env4, h, both, { refs: declOf(h, 1) }, 'saveRefChanged', 'refIncomplete', 1)
                let env4b = createEnv()
                await expectOk(env4b, h, editHolder(rm1(loadRows(env4b.woItems, h)), h, '{}', 0), { refs: declOf(h, 0, 1) }) //兩個皆宣告 → 成功
                A.deepEqual([authAt(env4b.woItems, h, 0), authAt(env4b.woItems, h, 1)], [{}, {}])
                //ids 不符
                let env5 = createEnv()
                await expectIdentityReject(env5, h, rm1(loadRows(env5.woItems, h)), { refs: [{ name: n1, ids: ['ghost'] }] }, 'saveRefChanged', 'refChanged', 1)
                let env6 = createEnv()
                await expectIdentityReject(env6, h, rm1(loadRows(env6.woItems, h)), { refs: [{ name: n1, ids: [] }] }, 'saveRefChanged', 'refChanged', 1) //宣告查無而實體仍在
            })

            it(`IDN-216 [${h}→${ref}] 移除引用而被移除名稱之實體已${h === 'pemis' ? '被刪除 → saveRefChanged; 刪除後以同 id 重建依定義是同一實體 → 成功' : '被刪後同名重建(id 不同)／另增同名 → saveRefChanged'}; 零寫入（移除不得套到被同名新實體取代之位置）`, async function() {
                let env = createEnv()
                let rows = loadRows(env.woItems, h) //使用者開框時所見
                await (h === 'pemis' ? delEnt(env.woItems, h, 1) : replaceEnt(env.woItems, h, 1))
                await expectIdentityReject(env, h, rm1(rows), { refs: declOf(h, 1) }, 'saveRefChanged', 'refChanged', 1, { extras: [{ id: `${entId(h, 1)}-NEW`, name: n1 }] }) //[I-RM] 實體已被刪（後同名重建）
                if (h !== 'pemis') {
                    let env2 = createEnv()
                    let rows2 = loadRows(env2.woItems, h)
                    await addEnt(env2.woItems, h, 1, `${entId(h, 1)}-DUP`) //原實體仍在, 另增同名 → 同名對應兩個 id
                    await expectIdentityReject(env2, h, rm1(rows2), { refs: declOf(h, 1) }, 'saveRefChanged', 'refChanged', 1)
                }
                else {
                    let env2 = createEnv()
                    let rows2 = loadRows(env2.woItems, h)
                    await replaceEnt(env2.woItems, h, 1) //targets 刪後同 id 重建
                    await expectOk(env2, h, rm1(rows2), { refs: declOf(h, 1) }) //[I-TGT-ID][I-RM] 同一實體
                    A.equal(env2.woItems[h].get(IDS[h][1])[f], '{}')
                }
            })

            it(`IDN-217 [${h}→${ref}] 懸空引用（被引用實體已不存在）被移除: 宣告 ids [] → 成功; 宣告舊 id → saveRefChanged; 宣告 [] 但現已出現同名實體 → saveRefChanged; 無宣告 → saveIdentityRequired`, async function() {
                let mk = async () => {
                    let env = createEnv()
                    await delEnt(env.woItems, h, 1) //第 1 列之引用 n1 成為懸空
                    return env
                }
                let env = await mk()
                await expectOk(env, h, rm1(loadRows(env.woItems, h)), { refs: [{ name: n1, ids: [] }] }) //[I-RM] 懸空被移除, 宣告 [] 且仍查無
                A.equal(env.woItems[h].get(IDS[h][1])[f], '{}')
                let env2 = await mk()
                await expectIdentityReject(env2, h, rm1(loadRows(env2.woItems, h)), { refs: declOf(h, 1) }, 'saveRefChanged', 'refChanged', 1) //使用者所見有實體（舊 id）而現已查無
                let env3 = await mk()
                let rows3 = loadRows(env3.woItems, h)
                await addEnt(env3.woItems, h, 1, h === 'pemis' ? entId(h, 1) : `${entId(h, 1)}-LATE`) //送出前該名稱被他人建立
                await expectIdentityReject(env3, h, rm1(rows3), { refs: [{ name: n1, ids: [] }] }, 'saveRefChanged', 'refChanged', 1)
                let env4 = await mk()
                await expectRequired(env4, h, rm1(loadRows(env4.woItems, h)), undefined, 1) //[I-REQ] 懸空亦不例外: 移除仍須宣告
            })

            it(`IDN-218 [${h}→${ref}] 名稱以集合計: 同名在一列移除、另一列新增（搬移）只算 1 個名稱; 兩列各新增同一名稱只算 1 個 → 無宣告 n 為 1, 宣告該名稱一次即成功`, async function() {
                //搬移: 第 1 列移除 n1、第 2 列新增 n1
                let move = (rows) => editHolder(editHolder(rows, h, '{}', 1), h, authOf(h, [[n1, 'y']]), 2)
                let env = createEnv()
                await expectRequired(env, h, move(loadRows(env.woItems, h)), undefined, 1) //[I-REQ] 一個名稱
                let env2 = createEnv()
                await expectOk(env2, h, move(loadRows(env2.woItems, h)), { refs: declOf(h, 1) })
                A.deepEqual(authAt(env2.woItems, h, 1), {})
                A.deepEqual(Object.keys(authAt(env2.woItems, h, 2)), [n1])
                //兩列各新增 n0（第 1 列在原有 n1 之外加 n0; 第 2 列新增 n0; 第 0 列原已有 n0 不算）
                let dup = (rows) => editHolder(editHolder(rows, h, authOf(h, [[n1, 'y'], [n0, 'y']]), 1), h, authOf(h, [[n0, 'y']]), 2)
                let env3 = createEnv()
                await expectRequired(env3, h, dup(loadRows(env3.woItems, h)), undefined, 1)
                let env4 = createEnv()
                await expectOk(env4, h, dup(loadRows(env4.woItems, h)), { refs: declOf(h, 0) })
                let env5 = createEnv()
                await expectIdentityReject(env5, h, dup(loadRows(env5.woItems, h)), { refs: [] }, 'saveRefChanged', 'refIncomplete', 1)
            })

            it(`IDN-219 [${h}→${ref}] 前端函數鏈（移除: snapRefIds → recordPicks → buildRefDecl）: 移除後無人動 → 成功; 開框後、送出前被引用實體被${h === 'pemis' ? '刪除' : '刪後同名重建'} → saveRefChanged（宣告取開框當時, 不取送出當下）`, async function() {
                let build = (env) => {
                    let rows = loadRows(env.woItems, h)
                    let snap = snapRefIds(h, rowsSorted(env.woItems, ref)) //使用者開啟編輯器當下之被引用表
                    let picks = recordPicks({ keyTable: h, strOld: rows[1][f], strNew: '{}', snap, picks: new Map() }) //編輯器取消勾選 n1 後回填
                    return { rows, sent: rm1(rows), picks }
                }
                let env = createEnv()
                let b1 = build(env)
                let decl1 = buildRefDecl({ keyTable: h, rowsNew: b1.sent, rowsOld: b1.rows, picks: b1.picks, refRows: rowsSorted(env.woItems, ref) })
                A.deepEqual(decl1, [{ name: n1, ids: [entId(h, 1)] }], '前提: 宣告含被移除之名稱, ids 為開框當時之 id')
                await expectOk(env, h, b1.sent, { refs: decl1 }) //[I-RM]
                let env2 = createEnv()
                let b2 = build(env2)
                await (h === 'pemis' ? delEnt(env2.woItems, h, 1) : replaceEnt(env2.woItems, h, 1))
                let decl2 = buildRefDecl({ keyTable: h, rowsNew: b2.sent, rowsOld: b2.rows, picks: b2.picks, refRows: rowsSorted(env2.woItems, ref) })
                A.deepEqual(decl2, decl1, '前提: 有選取記錄者宣告不隨送出當下之被引用表改變')
                await expectIdentityReject(env2, h, b2.sent, { refs: decl2 }, 'saveRefChanged', 'refChanged', 1)
            })
        }

        // ----- perm-run03: 反向對話框 subject 路徑之範圍（IDN-220～222; [I-SUBJ-SCOPE]）-----
        for (let h of H2) {
            let ref = HOLD[h].ref
            let n0 = entName(h, 0)
            let n1 = entName(h, 1)
            let n2 = entName(h, 2)
            let subj = (k) => ({ id: entId(h, k), name: entName(h, k), saved: true })

            it(`IDN-220 [${h}] subject 涵蓋主體名稱之「移除」與「停用」: 反向對話框取消勾選主體（移除其引用／停用其引用）→ 成功; 無 subject 且無 refs → saveIdentityRequired`, async function() {
                let env = createEnv()
                await expectOk(env, h, editHolder(loadRows(env.woItems, h), h, '{}', 1), { subject: subj(1) }) //[I-SUBJ-SCOPE] 移除主體名稱
                A.deepEqual(authAt(env.woItems, h, 1), {})
                let env2 = createEnv()
                await expectOk(env2, h, editHolder(loadRows(env2.woItems, h), h, authOf(h, [[n1, 'n']]), 1), { subject: subj(1) }) //停用主體名稱
                A.deepEqual(authAt(env2.woItems, h, 1), JSON.parse(authOf(h, [[n1, 'n']])))
                let env3 = createEnv()
                await expectRequired(env3, h, editHolder(loadRows(env3.woItems, h), h, '{}', 1), undefined, 1) //對照: 不帶 subject 亦無 refs
            })

            it(`IDN-221 [${h}] subject 只涵蓋其主體名稱: 另有其他名稱被改（新增或移除）而未宣告 → saveRefChanged／refIncomplete; 以 refs 補宣告 → 成功; 主體名稱本次未出現而他名被改 → refIncomplete`, async function() {
                //主體 n2 加入第 2 列，同時第 2 列另加 n0（新增他名）
                let addOther = (rows) => editHolder(rows, h, authOf(h, [[n2, 'y'], [n0, 'y']]), 2)
                let env = createEnv()
                await expectIdentityReject(env, h, addOther(loadRows(env.woItems, h)), { subject: subj(2) }, 'saveRefChanged', 'refIncomplete', 1) //[I-SUBJ-SCOPE] 他名未宣告
                let env2 = createEnv()
                await expectOk(env2, h, addOther(loadRows(env2.woItems, h)), { subject: subj(2), refs: declOf(h, 0) }) //subject＋refs 合用
                A.deepEqual(Object.keys(authAt(env2.woItems, h, 2)).sort(), [n0, n2].sort())
                //主體 n2 沒有出現在本次改動中，另新增他名 n0 → 主體不能替他名背書
                let env3 = createEnv()
                await expectIdentityReject(env3, h, editHolder(loadRows(env3.woItems, h), h, authOf(h, [[n0, 'y']]), 2), { subject: subj(2) }, 'saveRefChanged', 'refIncomplete', 1)
                //移除他名: 主體 n1 取消勾選（第 1 列移除）同時第 0 列移除 n0 → n0 未宣告
                let env4 = createEnv()
                let rmBoth = editHolder(editHolder(loadRows(env4.woItems, h), h, '{}', 1), h, '{}', 0)
                await expectIdentityReject(env4, h, rmBoth, { subject: subj(1) }, 'saveRefChanged', 'refIncomplete', 1)
                let env5 = createEnv()
                await expectOk(env5, h, editHolder(editHolder(loadRows(env5.woItems, h), h, '{}', 1), h, '{}', 0), { subject: subj(1), refs: declOf(h, 0) })
                A.deepEqual(authAt(env5.woItems, h, 0), {})
                A.deepEqual(authAt(env5.woItems, h, 1), {})
            })

            it(`IDN-222 [${h}] subject 給了而本次不改變引用（只改說明）→ 成功; 主體已被取代 → 仍 saveSubjectChanged（主體驗證不因無變更而略過）`, async function() {
                let touch = (rows) => rows.map((r, k) => (k === 2 ? { ...r, description: 'only-desc' } : r))
                let env = createEnv()
                await expectOk(env, h, touch(loadRows(env.woItems, h)), { subject: subj(2) })
                A.equal(env.woItems[h].get(IDS[h][2]).description, 'only-desc')
                let env2 = createEnv()
                let rows2 = loadRows(env2.woItems, h)
                await replaceEnt(env2.woItems, h, 2)
                await expectIdentityReject(env2, h, touch(rows2), { subject: subj(2) }, 'saveSubjectChanged', 'gone', 1, { extras: [{ id: `${entId(h, 2)}-NEW`, name: n2 }] })
            })
        }
    })


    // =================================================================
    // IDN-22x 逐軸矩陣(perm-run03): 引用端表 H(3) × 變更型別 K(16) × 宣告狀態 D(12) ＝ 576 格, 每格預期手寫於 EXPECT 表
    // =================================================================
    describe('IDN-22 逐軸矩陣: 變更型別 × 宣告狀態', function() {
        //K: 變更型別. adds／rms: 本型別所改變之啟用引用名稱數所對應的被引用實體序（名稱 entName(h, k)）; seed(seed, h): 建表前改種子; send(rows, h): 由使用者所見之列組出送出之整表; verify(woItems, h): 成功後庫內終態
        //預設種子: 第 0、1 列各以 OR 啟用引用第 0、1 個實體, 第 2 列授權欄為 '{}'
        let setAt = (h, row, str) => (rows) => editHolder(rows, h, str, row)
        let authIs = (h, row, str) => (w) => A.deepEqual(JSON.parse(w[h].get(IDS[h][row])[HOLD[h].field]), JSON.parse(str), `第 ${row} 列授權欄`)
        let modeStr = (h) => (h === 'pemis' ? J({ [entName(h, 1)]: { isActive: 'y', note: 'x' } }) : J({ [entName(h, 1)]: { mode: 'AND', isActive: 'y' } }))
        let n1Of = (h) => entName(h, 1)
        let n2Of = (h) => entName(h, 2)
        const KINDS = [
            { id: 'add', title: '新增啟用引用', adds: [2], rms: [], send: (rows, h) => setAt(h, 2, authOf(h, [[n2Of(h), 'y']]))(rows), verify: (w, h) => authIs(h, 2, authOf(h, [[n2Of(h), 'y']]))(w) },
            { id: 'rm', title: '移除引用（刪項）', adds: [], rms: [1], send: (rows, h) => setAt(h, 1, '{}')(rows), verify: (w, h) => authIs(h, 1, '{}')(w) },
            { id: 'disable', title: '停用既有項（y→n）', adds: [], rms: [1], send: (rows, h) => setAt(h, 1, authOf(h, [[n1Of(h), 'n']]))(rows), verify: (w, h) => authIs(h, 1, authOf(h, [[n1Of(h), 'n']]))(w) },
            { id: 'reenable', title: '重新啟用（種子為停用項 n→y）', adds: [2], rms: [], seed: (seed, h) => { seed[h][2][HOLD[h].field] = authOf(h, [[n2Of(h), 'n']]) }, send: (rows, h) => setAt(h, 2, authOf(h, [[n2Of(h), 'y']]))(rows), verify: (w, h) => authIs(h, 2, authOf(h, [[n2Of(h), 'y']]))(w) },
            {
                id: 'newRow', title: '新增列帶引用', adds: [2], rms: [], send: (rows, h) => [...rows, mkNewRow(h, authOf(h, [[n2Of(h), 'y']]))],
                verify: (w, h) => {
                    let rs = JSON.parse(w[h].snapshot())
                    A.equal(rs.length, 4, '新增列已寫入')
                    A.deepEqual(rs.filter((r) => r.description === 'new-row-NEW').map((r) => JSON.parse(r[HOLD[h].field])), [JSON.parse(authOf(h, [[n2Of(h), 'y']]))])
                },
            },
            {
                id: 'copyRow', title: '複製列帶引用（複製第 1 列, 原列不動）', adds: [1], rms: [], send: (rows, h) => [...rows, mkCopyRow(rows, h, 1)],
                verify: (w, h) => {
                    A.equal(w[h].size(), 4, '複製列已寫入')
                    A.deepEqual(JSON.parse(w[h].get(`id-copy-${h}-CPY`)[HOLD[h].field]), JSON.parse(authOf(h, [[n1Of(h), 'y']])), '複製列帶有原列之引用')
                    authIs(h, 1, authOf(h, [[n1Of(h), 'y']]))(w)
                },
            },
            { id: 'mode', title: 'mode 變更（仍啟用）', adds: [], rms: [], send: (rows, h) => setAt(h, 1, modeStr(h))(rows), verify: (w, h) => authIs(h, 1, modeStr(h))(w) },
            { id: 'rename', title: '僅改名（引用端列名稱）', adds: [], rms: [], send: (rows, h) => rows.map((r, k) => (k === 1 ? { ...r, name: `${NAMES[h][1]}-改` } : r)), verify: (w, h) => A.equal(w[h].get(IDS[h][1]).name, `${NAMES[h][1]}-改`) },
            { id: 'delRow', title: '整列刪除（刪引用端之列）', adds: [], rms: [], send: (rows) => rows.filter((r, k) => k !== 1), verify: (w, h) => A.deepEqual([w[h].has(IDS[h][1]), w[h].size()], [false, 2]) },
            { id: 'double', title: '同時新增＋移除', adds: [2], rms: [1], send: (rows, h) => setAt(h, 1, '{}')(setAt(h, 2, authOf(h, [[n2Of(h), 'y']]))(rows)), verify: (w, h) => { authIs(h, 1, '{}')(w); authIs(h, 2, authOf(h, [[n2Of(h), 'y']]))(w) } },
            { id: 'scalarAdd', title: '純量簡寫／物件形式新增（另一種表示形式）', adds: [2], rms: [], send: (rows, h) => setAt(h, 2, altOf(h, [[n2Of(h), 'y']]))(rows), verify: (w, h) => authIs(h, 2, altOf(h, [[n2Of(h), 'y']]))(w) },
            { id: 'scalarRm', title: '純量簡寫／物件形式移除（種子即該形式）', adds: [], rms: [1], seed: (seed, h) => { seed[h][1][HOLD[h].field] = altOf(h, [[n1Of(h), 'y']]) }, send: (rows, h) => setAt(h, 1, '{}')(rows), verify: (w, h) => authIs(h, 1, '{}')(w) },
            { id: 'arrAdd', title: '陣列形式新增', adds: [2], rms: [], send: (rows, h) => setAt(h, 2, arrOf([[n2Of(h), 'y']]))(rows), verify: (w, h) => authIs(h, 2, arrOf([[n2Of(h), 'y']]))(w) },
            { id: 'arrRm', title: '陣列形式移除（種子即陣列形式）', adds: [], rms: [1], seed: (seed, h) => { seed[h][1][HOLD[h].field] = arrOf([[n1Of(h), 'y']]) }, send: (rows, h) => setAt(h, 1, '[]')(rows), verify: (w, h) => authIs(h, 1, '[]')(w) },
            { id: 'rmOff', title: '移除停用項（啟用引用不變）', adds: [], rms: [], seed: (seed, h) => { seed[h][2][HOLD[h].field] = authOf(h, [[n2Of(h), 'n']]) }, send: (rows, h) => setAt(h, 2, '{}')(rows), verify: (w, h) => authIs(h, 2, '{}')(w) },
            { id: 'addOff', title: '新增停用項（不授權）', adds: [], rms: [], send: (rows, h) => setAt(h, 2, authOf(h, [[n2Of(h), 'n']]))(rows), verify: (w, h) => authIs(h, 2, authOf(h, [[n2Of(h), 'n']]))(w) },
        ]

        //D: 宣告狀態. opt(h, K, rows) 組第 3 參; want(a, r) 回預期——'ok' 或 [語系鍵, reason, n]（a／r: 本型別新增／移除之名稱數）; ext 為 expectIdentityReject 之附加斷言
        //  預期表（手算, 不由被測函數推得）:
        //    無宣告三式（無第 3 參／兩者 null／僅 baseline）: 有改變(a+r>0) → saveIdentityRequired(n＝a+r)、被引用表不讀不寫; 無改變 → 成功
        //    空陣列: 有改變 → refIncomplete(n＝a+r); 無改變 → 成功
        //    完整: 成功
        //    漏報新增（僅宣告移除之名稱）: 未宣告者為新增之名稱 → 有新增(a>0) → refIncomplete(n＝a); 無新增 → 成功
        //    漏報移除（僅宣告新增之名稱）: 未宣告者為移除之名稱 → 有移除(r>0) → refIncomplete(n＝r); 無移除 → 成功
        //    多報相符（另宣告未改變且相符之第 0 個實體）: 成功; 多報不符: refChanged(n 1); ids 不符／ids 空陣列（實體皆存在）: 每個被改變之名稱不符 → refChanged(n＝a+r), 無改變時宣告為空 → 成功; 格式不合: saveIdentityFormat(n 0), 任何讀寫之前
        const REQ = (a, r) => (a + r > 0 ? ['saveIdentityRequired', 'identityRequired', a + r] : 'ok')
        const names = (h, K, which) => (which === 'adds' ? K.adds : (which === 'rms' ? K.rms : [...K.adds, ...K.rms]))
        const DECLS = [
            { id: 'none', title: '無第 3 參', opt: () => undefined, want: REQ, ext: { refUntouched: true } },
            { id: 'nullBoth', title: 'subject:null＋refs:null', opt: () => ({ subject: null, refs: null }), want: REQ, ext: { refUntouched: true } },
            { id: 'baselineOnly', title: '僅 baseline（舊客戶端形狀）', opt: (h, K, rows) => ({ baseline: makeBaseline(rows, h) }), want: REQ, ext: { refUntouched: true } },
            { id: 'empty', title: '空陣列 refs', opt: () => ({ refs: [] }), want: (a, r) => (a + r > 0 ? ['saveRefChanged', 'refIncomplete', a + r] : 'ok') },
            { id: 'full', title: '完整宣告', opt: (h, K) => ({ refs: declOf(h, ...names(h, K, 'all')) }), want: () => 'ok' },
            { id: 'onlyAdds', title: '漏報移除（僅宣告新增者）', opt: (h, K) => ({ refs: declOf(h, ...names(h, K, 'adds')) }), want: (a, r) => (r > 0 ? ['saveRefChanged', 'refIncomplete', r] : 'ok') },
            { id: 'onlyRms', title: '漏報新增（僅宣告移除者）', opt: (h, K) => ({ refs: declOf(h, ...names(h, K, 'rms')) }), want: (a, r) => (a > 0 ? ['saveRefChanged', 'refIncomplete', a] : 'ok') },
            { id: 'extraOk', title: '多報相符', opt: (h, K) => ({ refs: declOf(h, 0, ...names(h, K, 'all')) }), want: () => 'ok' },
            { id: 'extraBad', title: '多報不符', opt: (h, K) => ({ refs: [...declOf(h, ...names(h, K, 'all')), { name: entName(h, 0), ids: ['ghost'] }] }), want: () => ['saveRefChanged', 'refChanged', 1] },
            { id: 'idsBad', title: 'ids 不符（亂 id）', opt: (h, K) => ({ refs: names(h, K, 'all').map((k) => ({ name: entName(h, k), ids: ['ghost'] })) }), want: (a, r) => (a + r > 0 ? ['saveRefChanged', 'refChanged', a + r] : 'ok') },
            { id: 'idsEmpty', title: 'ids 空陣列（實體仍在）', opt: (h, K) => ({ refs: names(h, K, 'all').map((k) => ({ name: entName(h, k), ids: [] })) }), want: (a, r) => (a + r > 0 ? ['saveRefChanged', 'refChanged', a + r] : 'ok') },
            { id: 'fmt', title: '格式不合', opt: () => ({ refs: 'x' }), want: () => ['saveIdentityFormat', 'format', 0], ext: { zeroIO: true } },
        ]

        let runCell = async (h, K, D) => {
            let env = createEnv({ seedEdit: K.seed ? (seed) => K.seed(seed, h) : undefined })
            let rows = loadRows(env.woItems, h)
            let sent = K.send(rows, h)
            let a = K.adds.length
            let r = K.rms.length
            let want = D.want(a, r)
            let opt = D.opt(h, K, rows)
            try {
                if (want === 'ok') {
                    await expectOk(env, h, sent, opt)
                    K.verify(env.woItems, h)
                }
                else {
                    await expectIdentityReject(env, h, sent, opt, want[0], want[1], want[2], D.ext || {})
                }
            }
            catch (err) {
                err.message = `[格 ${h} × ${K.id}（${K.title}）× ${D.id}（${D.title}）, 預期 ${J(want)}] ${err.message}`
                throw err
            }
            finally {
                env.cst.clear()
            }
        }

        for (let h of H3) {
            for (let K of KINDS) {
                it(`IDN-220m [${h}→${HOLD[h].ref}] 變更型別「${K.title}」（改變 ${K.adds.length + K.rms.length} 個名稱）× 12 種宣告狀態: 各格預期見 EXPECT 表`, async function() {
                    for (let D of DECLS) {
                        await runCell(h, K, D)
                    }
                })
            }
        }

        it('IDN-229 矩陣格數統計（防表被悄悄縮減）: 3 引用端表 × 16 變更型別 × 12 宣告狀態 ＝ 576 格; 預期分佈 通過 246／saveIdentityRequired 99／refIncomplete 69／refChanged 114／saveIdentityFormat 48', function() {
            let tally = { ok: 0, saveIdentityRequired: 0, refIncomplete: 0, refChanged: 0, saveIdentityFormat: 0 }
            let n = 0
            for (let h of H3) {
                for (let K of KINDS) {
                    for (let D of DECLS) {
                        let w = D.want(K.adds.length, K.rms.length)
                        n++
                        if (w === 'ok') {
                            tally.ok++
                        }
                        else if (w[0] === 'saveIdentityRequired') {
                            tally.saveIdentityRequired++
                        }
                        else if (w[1] === 'refIncomplete') {
                            tally.refIncomplete++
                        }
                        else if (w[1] === 'refChanged') {
                            tally.refChanged++
                        }
                        else if (w[0] === 'saveIdentityFormat') {
                            tally.saveIdentityFormat++
                        }
                    }
                }
            }
            A.equal(KINDS.length, 16)
            A.equal(DECLS.length, 12)
            A.equal(n, 576)
            A.deepEqual(tally, { ok: 246, saveIdentityRequired: 99, refIncomplete: 69, refChanged: 114, saveIdentityFormat: 48 })
            //變更型別之名稱數（手算）: 有改變者 11 型（adds 6、rms 4、雙向 1）、無改變者 5 型
            A.equal(KINDS.filter((K) => K.adds.length + K.rms.length > 0).length, 11)
            A.equal(KINDS.filter((K) => K.adds.length > 0 && K.rms.length === 0).length, 6)
            A.equal(KINDS.filter((K) => K.adds.length === 0 && K.rms.length > 0).length, 4)
            A.equal(KINDS.filter((K) => K.adds.length > 0 && K.rms.length > 0).length, 1)
        })
    })


    // =================================================================
    // IDN-3xx 必帶（perm-run03; 原 perm-run02「相容」案已改寫）
    //   改變引用而未帶 subject／refs（含各種「看似未帶」形式）→ saveIdentityRequired; 不改變引用 → 不需宣告; 皆不讀被引用表、不取其鎖（不擴權）
    // =================================================================
    describe('IDN-3 必帶: 改變引用而未帶 subject／refs → saveIdentityRequired; 不改變引用 → 不需宣告', function() {
        const VARIANTS = [
            ['無第 3 參', () => undefined],
            ['空物件 {}', () => ({})],
            ['subject:null', () => ({ subject: null })],
            ['refs:null', () => ({ refs: null })],
            ['subject:null 與 refs:null', () => ({ subject: null, refs: null })],
            ['subject／refs 皆 undefined', () => ({ subject: undefined, refs: undefined })],
            ['僅 baseline（舊客戶端形狀）', (env, h) => ({ baseline: makeBaseline(loadRows(env.woItems, h), h) })],
        ]
        for (let h of H3) {
            let ref = HOLD[h].ref
            let n2 = entName(h, 2)
            it(`IDN-301 [${h}→${ref}] 改變引用（新增啟用引用）且不帶宣告 7 種形式 × 被引用實體${h === 'pemis' ? '已被刪除' : '已被刪後同名重建'} → 一律 saveIdentityRequired／identityRequired(n 1), 零寫入; 被引用表完全不讀不寫、不取其鎖（只取本表鎖）; 7 種形式之終態逐位相同（＝初始, 不再靜默接管同名新實體）`, async function() {
                let views = []
                for (let [title, mk] of VARIANTS) {
                    let t = traceLock()
                    let env = createEnv({ lockOf: t.wrap })
                    let { woItems } = env
                    let rows = loadRows(woItems, h)
                    await (h === 'pemis' ? delEnt(woItems, h, 2) : replaceEnt(woItems, h, 2)) //他人於我編輯期間替換被引用實體
                    let sent = editHolder(rows, h, authOf(h, [[n2, 'y']]))
                    await expectRequired(env, h, sent, mk(env, h), 1, { trace: { t, want: [`acq ${h}`, `rel ${h}`] }, extras: [{ id: `${entId(h, 2)}-NEW`, name: n2 }] }) //[I-REQ] perm-run02 此處為「照舊成功寫入、授權指向同名新實體」, perm-run03 取消該相容
                    A.deepEqual(authAt(woItems, h), {}, `${title}: 授權未寫入`)
                    views.push(await viewOf(woItems))
                    env.cst.clear()
                }
                for (let v of views) {
                    A.equal(v, views[0], '各形式之終態（去墻鐘時間欄位）須逐位相同')
                }
            })
        }
        for (let h of H3) {
            let ref = HOLD[h].ref
            it(`IDN-303 [${h}→${ref}] 不改變引用的存檔（只改說明）× 不帶宣告 7 種形式 × 被引用實體${h === 'pemis' ? '已被刪除' : '已被刪後同名重建'} → 一律成功; 不讀被引用表、不寫被引用表、不取其鎖; 7 種形式之終態逐位相同（[I-COMPAT] 不改變引用不需宣告）`, async function() {
                let views = []
                for (let [title, mk] of VARIANTS) {
                    let t = traceLock()
                    let env = createEnv({ lockOf: t.wrap })
                    let { woItems } = env
                    let rows = loadRows(woItems, h)
                    await (h === 'pemis' ? delEnt(woItems, h, 2) : replaceEnt(woItems, h, 2)) //他人於我編輯期間替換被引用實體
                    let calls = instrument(woItems)
                    await expectOk(env, h, rows.map((r, k) => (k === 2 ? { ...r, description: 'only-desc' } : r)), mk(env, h)) //[I-COMPAT] 只改說明, 啟用引用不變
                    A.equal(woItems[h].get(IDS[h][2]).description, 'only-desc', `${title}: 已寫入`)
                    A.equal(calls[ref].select, 0, `${title}: [I-COMPAT] 不讀被引用表`)
                    A.equal(calls[ref].insert + calls[ref].save + calls[ref].del + calls[ref].delAll, 0)
                    A.deepEqual(t.log, [`acq ${h}`, `rel ${h}`], `${title}: [I-COMPAT] 只取本表鎖, 不取被引用表鎖`)
                    A.equal(identityLogs(env.logs).length, 0)
                    views.push(await viewOf(woItems))
                    env.cst.clear()
                }
                for (let v of views) {
                    A.equal(v, views[0], '各形式之終態（去墻鐘時間欄位）須逐位相同')
                }
            })
        }
        it('IDN-302 次序: 基準比對先於必帶檢查——持舊基準且改變引用而未帶宣告 → saveStale（無 identity-error）; 對照: 基準新鮮 → saveIdentityRequired（既有拒收不因缺宣告而放行或改變錯誤鍵）', async function() {
            for (let h of H3) {
                let env = createEnv()
                let rows = loadRows(env.woItems, h)
                let bl = makeBaseline(rows, h)
                await env.woItems[h].save([{ id: IDS[h][0], description: 'by-other' }])
                let snap0 = snapAll(env.woItems)
                let r = await run(env.pc, h, editHolder(rows, h, authOf(h, [[entName(h, 2), 'y']])), { baseline: bl, subject: null, refs: null })
                A.deepEqual(r, { ok: false, v: 'saveStale' }) //[I-ORDER] 基準先於必帶
                A.equal(snapAll(env.woItems), snap0)
                A.equal(identityLogs(env.logs).length, 0)
                A.equal(staleLogs(env.logs).length, 1)
                let env2 = createEnv()
                let rows2 = loadRows(env2.woItems, h)
                await expectRequired(env2, h, editHolder(rows2, h, authOf(h, [[entName(h, 2), 'y']])), { baseline: makeBaseline(rows2, h) }, 1) //基準新鮮, 僅缺宣告
                env.cst.clear()
            }
        })
    })


    // =================================================================
    // IDN-4xx 次序
    // =================================================================
    describe('IDN-4 次序', function() {
        for (let h of H2) {
            it(`IDN-401 [${h}] subject 檢查先於基準比對: 同時「基準過期」與「主體被取代」→ saveSubjectChanged（srLog 為 identity-error, 無 stale-error）; 對照: 僅基準過期 → saveStale`, async function() {
                let nm = entName(h, 2)
                let subj = { id: entId(h, 2), name: nm, saved: true }
                let mkEnv = async (replaced) => {
                    let env = createEnv()
                    let rows = loadRows(env.woItems, h)
                    let bl = makeBaseline(rows, h)
                    await env.woItems[h].save([{ id: IDS[h][0], description: 'by-other' }]) //他人改引用端表 → 基準過期
                    if (replaced) {
                        await replaceEnt(env.woItems, h, 2)
                    }
                    return { env, rows, bl }
                }
                let a = await mkEnv(true)
                let snap0 = snapAll(a.env.woItems)
                let r = await run(a.env.pc, h, editHolder(a.rows, h, authOf(h, [[nm, 'y']])), { baseline: a.bl, subject: subj })
                A.deepEqual(r, { ok: false, v: 'saveSubjectChanged' }) //[I-ORDER] subject 先於基準比對
                A.equal(snapAll(a.env.woItems), snap0)
                A.equal(identityLogs(a.env.logs).length, 1)
                A.equal(identityLogs(a.env.logs)[0].reason, 'gone')
                A.equal(staleLogs(a.env.logs).length, 0, '基準尚未比對, 不得有 stale-error')
                let b = await mkEnv(false)
                let r2 = await run(b.env.pc, h, editHolder(b.rows, h, authOf(h, [[nm, 'y']])), { baseline: b.bl, subject: subj })
                A.deepEqual(r2, { ok: false, v: 'saveStale' }, '對照: 主體未被取代而僅基準過期')
                A.equal(identityLogs(b.env.logs).length, 0)
                A.equal(staleLogs(b.env.logs).length, 1)
            })
        }

        for (let h of H3) {
            it(`IDN-402 [${h}] refs 檢查在基準比對之後: 同時「基準過期」與「refs 不符」→ saveStale（無 identity-error）; 對照: 基準新鮮而 refs 不符 → saveRefChanged`, async function() {
                let n2 = entName(h, 2)
                let a = createEnv()
                let rows = loadRows(a.woItems, h)
                let bl = makeBaseline(rows, h)
                await a.woItems[h].save([{ id: IDS[h][0], description: 'by-other' }])
                await delEnt(a.woItems, h, 2)
                let r = await run(a.pc, h, editHolder(rows, h, authOf(h, [[n2, 'y']])), { baseline: bl, refs: declOf(h, 2) })
                A.deepEqual(r, { ok: false, v: 'saveStale' }) //[I-ORDER] refs 在基準之後
                A.equal(identityLogs(a.logs).length, 0)
                A.equal(staleLogs(a.logs).length, 1)
                let b = createEnv()
                let rowsB = loadRows(b.woItems, h)
                let blB = makeBaseline(rowsB, h)
                await delEnt(b.woItems, h, 2)
                await expectIdentityReject(b, h, editHolder(rowsB, h, authOf(h, [[n2, 'y']])), { baseline: blB, refs: declOf(h, 2) }, 'saveRefChanged', 'refChanged', 1)
            })
        }

        for (let h of H2) {
            it(`IDN-403 [${h}] 基準格式不合先於身分宣告格式: 兩者皆壞 → saveBaselineFormat（log 為 baselineFormat, 無 identity-error）`, async function() {
                let env = createEnv()
                let calls = instrument(env.woItems)
                let r = await run(env.pc, h, loadRows(env.woItems, h), { baseline: [['x', 'abc1x2y3']], subject: { id: 'a' }, refs: 'x' })
                A.deepEqual(r, { ok: false, v: 'saveBaselineFormat' }) //[I-ORDER]
                A.equal(sumCalls(calls), 0)
                A.equal(identityLogs(env.logs).length, 0)
                A.equal(staleLogs(env.logs)[0].reason, 'baselineFormat')
            })
        }

        for (let h of H3) {
            it(`IDN-404 [${h}] 身分宣告格式驗證早於占位／取鎖: 同一操作者前一次存檔等表鎖中(占位中), 合法宣告再送 → saveInProgress(前提); 格式不合 → 仍回 saveIdentityFormat`, async function() {
                let env = createEnv()
                let { woItems, core, pc } = env
                let rows = loadRows(woItems, h)
                let release = null
                let gate = new Promise((resolve) => {
                    release = resolve
                })
                let held = core.withTabLocks([h], () => gate) //他人持有本表鎖, 使本操作者之第 1 次存檔卡在 guardWrite（已占位）
                //perm-run03: 第 1 次存檔新增引用, 須附宣告（原不帶宣告, 不帶即 saveIdentityRequired）; 其卡在表鎖時尚未驗宣告, 釋放後才成功
                let p1 = run(pc, h, editHolder(rows, h, authOf(h, [[entName(h, 2), 'y']])), { refs: declOf(h, 2) }, 'op-same')
                await flush()
                await sleep(30)
                let goodOpt = h === 'pemis' ? { refs: declOf(h, 2) } : { subject: { id: entId(h, 2), name: entName(h, 2), saved: true } }
                let rDup = await run(pc, h, rows, goodOpt, 'op-same')
                A.deepEqual(rDup, { ok: false, v: 'saveInProgress' }) //前提: 占位確實存在
                let badOpt = h === 'pemis' ? { refs: 'x' } : { subject: 'x' }
                let rBad = await run(pc, h, rows, badOpt, 'op-same')
                A.deepEqual(rBad, { ok: false, v: 'saveIdentityFormat' }) //[I-ORDER] 格式驗證早於占位
                release()
                await held
                A.deepEqual(await p1, { ok: true, v: OKS })
            })
        }

        it('IDN-405 列格式不合先於身分宣告格式: rows 非陣列＋壞 subject → saveRowFieldInvalid（無 identity-error）', async function() {
            for (let h of H2) {
                let env = createEnv()
                let r = await run(env.pc, h, { length: 3 }, { subject: 'x' })
                A.deepEqual(r, { ok: false, v: 'saveRowFieldInvalid' }) //[I-ORDER]
                A.equal(identityLogs(env.logs).length, 0)
                env.cst.clear()
            }
        })
    })


    // =================================================================
    // IDN-5xx 鎖
    // =================================================================
    describe('IDN-5 鎖', function() {

        for (let h of H3) {
            let ref = HOLD[h].ref
            let n2 = entName(h, 2)
            let add2 = (rows) => editHolder(rows, h, authOf(h, [[n2, 'y']]))
            let okOpts = [['refs', { refs: declOf(h, 2) }]]
            if (h !== 'pemis') {
                okOpts.push(['subject', { subject: { id: entId(h, 2), name: n2, saved: true } }])
                okOpts.push(['subject＋refs', { subject: { id: entId(h, 2), name: n2, saved: true }, refs: declOf(h, 2) }])
            }
            for (let [tag, opt] of okOpts) {
                it(`IDN-501 [${h}] 取鎖軌跡（帶 ${tag}, 成功）: 被引用表 ${ref} 先、本表 ${h} 後; 釋放為內層先`, async function() {
                    let t = traceLock()
                    let env = createEnv({ lockOf: t.wrap })
                    await expectOk(env, h, add2(loadRows(env.woItems, h)), opt)
                    A.deepEqual(t.log, [`acq ${ref}`, `acq ${h}`, `rel ${h}`, `rel ${ref}`]) //[I-LOCK] 階層: 被引用者先、引用端後
                })
            }
            it(`IDN-501 [${h}] 取鎖軌跡（拒收）: 驗證在被引用表鎖內, 被拒時尚未取本表鎖; ${h !== 'pemis' ? 'subject 被取代' : 'refs 不符'}時 log 為 acq ${ref}／rel ${ref}`, async function() {
                let t = traceLock()
                let env = createEnv({ lockOf: t.wrap })
                let rows = loadRows(env.woItems, h)
                await delEnt(env.woItems, h, 2)
                if (h !== 'pemis') {
                    await expectIdentityReject(env, h, add2(rows), { subject: { id: entId(h, 2), name: n2, saved: true } }, 'saveSubjectChanged', 'gone', 1)
                    A.deepEqual(t.log, [`acq ${ref}`, `rel ${ref}`], '[I-LOCK] subject 先於本表鎖驗證, 被拒時未取本表鎖')
                }
                else {
                    await expectIdentityReject(env, h, add2(rows), { refs: declOf(h, 2) }, 'saveRefChanged', 'refChanged', 1)
                    A.deepEqual(t.log, [`acq ${ref}`, `acq ${h}`, `rel ${h}`, `rel ${ref}`], '[I-LOCK] refs 於本表鎖內（write 內）驗證')
                }
            })
            it(`IDN-501 [${h}] 對照（perm-run03）: 不帶宣告且不改變引用（只改說明）→ 成功, 只取本表鎖 [${h}]; 不帶宣告而改變引用 → saveIdentityRequired, 判定在本表鎖內的 write（log 為 acq ${h}／rel ${h}）、不取被引用表鎖 ${ref}、被引用表不讀不寫`, async function() {
                let t = traceLock()
                let env = createEnv({ lockOf: t.wrap })
                await expectOk(env, h, loadRows(env.woItems, h).map((r, k) => (k === 2 ? { ...r, description: 'only-desc' } : r)), undefined)
                A.deepEqual(t.log, [`acq ${h}`, `rel ${h}`]) //[I-COMPAT]
                let t2 = traceLock()
                let env2 = createEnv({ lockOf: t2.wrap })
                await expectRequired(env2, h, add2(loadRows(env2.woItems, h)), undefined, 1, { trace: { t: t2, want: [`acq ${h}`, `rel ${h}`] } }) //[I-REQ][I-LOCK]
            })

            it(`IDN-502 [${h}] 被拒或格式不合之後, 鎖與占位皆釋放: 同一操作者立即再存成功（5 秒內）`, async function() {
                let env = createEnv()
                let { woItems, pc } = env
                let rows = loadRows(woItems, h)
                await delEnt(woItems, h, 2)
                let bads = [{ refs: declOf(h, 2) }, { refs: 'x' }]
                if (h !== 'pemis') {
                    bads.push({ subject: { id: entId(h, 2), name: n2, saved: true } })
                }
                for (let bad of bads) {
                    let r = await run(pc, h, add2(rows), bad)
                    A.equal(r.ok, false)
                    let r2 = await withTimeout(run(pc, h, rows.map((r0, k) => (k === 0 ? { ...r0, description: `ok-after-${J(bad).length}` } : r0)), undefined), 5000, `IDN-502 ${J(bad)}`)
                    A.deepEqual(r2, { ok: true, v: OKS }, '[I-LOCK] 拒收後鎖釋放')
                    rows = loadRows(woItems, h)
                }
            })
        }

        it('IDN-503 連帶改名之階層: grups 存檔帶 refs（pemis）且改名一個群組（連帶改寫 users）→ 取鎖次序 pemis → grups → users; pemis 存檔帶 refs（targets）且改名（連帶改寫 grups）→ targets → pemis → grups', async function() {
            let acq = (log) => log.filter((x) => x.startsWith('acq ')).map((x) => x.slice(4))
            let rel = (log) => log.filter((x) => x.startsWith('rel ')).map((x) => x.slice(4))
            //grups: 改名 g1（users.cgrups 引用它）＋ g3 新增引用 P3
            let t1 = traceLock()
            let env1 = createEnv({ lockOf: t1.wrap })
            let g = loadRows(env1.woItems, 'grups').map((r, k) => (k === 0 ? { ...r, name: `${r.name}x` } : (k === 2 ? { ...r, cpemis: authOf('grups', [[NAMES.pemis[2], 'y']]) } : r)))
            await expectOk(env1, 'grups', g, { refs: declOf('grups', 2) })
            A.deepEqual(acq(t1.log), ['pemis', 'grups', 'users'], '[I-LOCK] 被引用者先、本表次、引用端後')
            A.deepEqual(rel(t1.log), ['users', 'grups', 'pemis'], '釋放為反序')
            A.ok(JSON.parse(env1.woItems.users.get(IDS.users[0]).cgrups)[`${NAMES.grups[0]}x`], '前提: 連帶改名確實發生')
            //pemis: 改名 p1（grups.cpemis 引用它）＋ p3 新增引用 T3
            let t2 = traceLock()
            let env2 = createEnv({ lockOf: t2.wrap })
            let p = loadRows(env2.woItems, 'pemis').map((r, k) => (k === 0 ? { ...r, name: `${r.name}x` } : (k === 2 ? { ...r, crules: authOf('pemis', [[IDS.targets[2], 'y']]) } : r)))
            await expectOk(env2, 'pemis', p, { refs: declOf('pemis', 2) })
            A.deepEqual(acq(t2.log), ['targets', 'pemis', 'grups'])
            A.deepEqual(rel(t2.log), ['grups', 'pemis', 'targets'])
        })

        // ----- V14 式人為延遲併發 -----
        //RACE: 一邊存檔 A（帶宣告）、一邊 B 以真入口「刪除被引用實體並以同名重建（或僅刪除）」; 被引用表與引用端表之無參數 select 皆延遲.
        //  合法終態僅二: ①A 先持鎖 → A 成功, 其後 B 才改被引用表（B 之引用連帶清理把 A 剛寫入之引用移除）; ②B 先持鎖 → B 完成後 A 才驗證 → A 被拒、零寫入.
        //  不得出現「A 成功但寫入之授權指向被替換後的新實體」（終態為 A 成功且該引用仍在, 而被引用表已換新實體）.
        const RACES = [
            { id: 'C1', h: 'users', kind: 'subject', B: 'updateGrups', mode: 'replace', key: 'saveSubjectChanged' },
            { id: 'C2', h: 'users', kind: 'refs', B: 'updateGrups', mode: 'replace', key: 'saveRefChanged' },
            { id: 'C3', h: 'grups', kind: 'subject', B: 'updatePemis', mode: 'replace', key: 'saveSubjectChanged' },
            { id: 'C4', h: 'grups', kind: 'refs', B: 'updatePemis', mode: 'replace', key: 'saveRefChanged' },
            { id: 'C5', h: 'pemis', kind: 'refs', B: 'updateTargets', mode: 'delete', key: 'saveRefChanged' },
        ]
        for (let rc of RACES) {
            for (let order of ['A先', 'B先']) {
                it(`IDN-510 ${rc.id} [${rc.h} ${rc.kind}] ${order}: A 存檔（帶 ${rc.kind}, 引用端表與被引用表讀取皆延遲）∥ B ${rc.B}（${rc.mode === 'replace' ? '刪除被引用實體並同名重建' : '刪除被引用實體'}）→ 終態等價於依序執行, 事件序不交錯`, async function() {
                    let h = rc.h
                    let ref = HOLD[h].ref
                    let f = HOLD[h].field
                    let n2 = entName(h, 2)
                    let env = createEnv()
                    let { woItems, logs, pc } = env
                    let rowsA = editHolder(loadRows(woItems, h), h, authOf(h, [[n2, 'y']]))
                    let optA = rc.kind === 'subject' ? { subject: { id: entId(h, 2), name: n2, saved: true } } : { refs: declOf(h, 2) }
                    let rowsRef0 = loadRows(woItems, ref)
                    let rowsB = rowsRef0.filter((r) => r.id !== entId(h, 2))
                    if (rc.mode === 'replace') {
                        rowsB.push(clientEntity(ref, `${entId(h, 2)}-NEW`, n2))
                    }
                    let ev = []
                    recordEvents(woItems, ev)
                    slow(woItems[ref], 60)
                    slow(woItems[h], 100)
                    let pA = null
                    let pB = null
                    if (order === 'A先') {
                        pA = run(pc, h, rowsA, optA, 'op-A')
                        await sleep(15)
                        pB = run(pc, ref, rowsB, undefined, 'op-B')
                    }
                    else {
                        pB = run(pc, ref, rowsB, undefined, 'op-B')
                        await sleep(15)
                        pA = run(pc, h, rowsA, optA, 'op-A')
                    }
                    let [rA, rB] = await withTimeout(Promise.all([pA, pB]), 10000, `IDN-510 ${rc.id} ${order}`)
                    A.deepEqual(rB, { ok: true, v: OKS }, 'B 恆成功（不帶宣告, 最後寫入者勝）')
                    let cur = await woItems[ref].select()
                    if (rc.mode === 'replace') {
                        A.ok(cur.some((r) => r.id === `${entId(h, 2)}-NEW`) && !cur.some((r) => r.id === entId(h, 2)), '前提: B 已把被引用實體換成新 id')
                    }
                    else {
                        A.ok(!cur.some((r) => r.id === entId(h, 2)), '前提: B 已刪除被引用實體')
                    }
                    let authA = JSON.parse(woItems[h].get(IDS[h][2])[f])
                    let iAwrite = ev.indexOf(`${h}:save`)
                    let iBwrite = ev.findIndex((e) => e === `${ref}:del`)
                    A.ok(iBwrite >= 0, '前提: B 有寫入被引用表')
                    if (order === 'A先') {
                        //①A 先持鎖（先於 B）: A 成功; B 之寫入發生在 A 寫入完成之後; B 之引用連帶清理把 A 剛寫入之引用移除
                        A.deepEqual(rA, { ok: true, v: OKS })
                        A.ok(iAwrite >= 0 && iAwrite < iBwrite, `[I-LOCK] B 對被引用表之寫入須在 A 之寫入之後（事件序不交錯）: ${ev.join(',')}`)
                        A.deepEqual(authA, {}, '[I-LOCK] 依序執行 A→B: B 之刪除連帶清理移除 A 寫入之引用（不留指向新實體或已刪實體之引用）')
                        A.equal(identityLogs(logs).length, 0)
                    }
                    else {
                        //②B 先持鎖: A 在 B 完成後才驗證 → 被拒; A 零寫入（引用端第 2 列授權維持 '{}'）
                        A.deepEqual(rA, { ok: false, v: rc.key })
                        A.equal(ev.filter((e) => e === `${h}:save`).length, 0, `[I-LOCK] A 零寫入: ${ev.join(',')}`)
                        A.deepEqual(authA, {}, 'A 被拒: 授權不得指向被替換後之新實體')
                        A.equal(identityLogs(logs).length, 1)
                    }
                })
            }
        }

        // ----- 四表隨機併發 -----
        describe('IDN-520 四表隨機併發（含帶 subject／refs 之存檔與引用連帶改名／刪除）', function() {
            //確定性 PRNG 與隨機讓出（同 unit-procCore-refCascade 之 mulberry32／jitter／fuzzTable／shuffle; 失敗訊息帶種子可重現）
            let mulberry32 = (a) => () => {
                a |= 0
                a = (a + 0x6D2B79F5) | 0
                let t = Math.imul(a ^ (a >>> 15), 1 | a)
                t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
                return ((t ^ (t >>> 14)) >>> 0) / 4294967296
            }
            let jitter = async (rand) => {
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

            //四個操作（G＝updateGrups、U＝updateUsers、P＝updatePemis、T＝updateTargets）之各變體; 送入之整表皆自種子建構（過時之欄位以整表寫入語意覆寫, 故終態須等價於某一依序執行）
            let buildOps = (sc) => {
                let s = seedRows()
                let ed = (rows, id, patch) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r))
                let rm = (rows, id) => rows.filter((r) => r.id !== id)
                let M = NAMES.grups
                let P = NAMES.pemis
                let T = IDS.targets
                let G = {
                    plain: () => ({ rows: ed(s.grups, 'id-g1', { description: 'g-plain' }) }),
                    rename: () => ({ rows: ed(s.grups, 'id-g1', { name: `${M[0]}x` }) }),
                    replace3: () => ({ rows: [...rm(s.grups, 'id-g3'), clientEntity('grups', 'id-g3-NEW', M[2])] }),
                    subjP3: () => ({ rows: ed(s.grups, 'id-g3', { cpemis: authOf('grups', [[P[2], 'y']]) }), opt: { subject: { id: 'id-p3', name: P[2], saved: true } } }),
                    refP3: () => ({ rows: ed(s.grups, 'id-g3', { cpemis: authOf('grups', [[P[2], 'y']]) }), opt: { refs: [{ name: P[2], ids: ['id-p3'] }] } }),
                    both: () => ({ rows: ed(s.grups, 'id-g3', { cpemis: authOf('grups', [[P[2], 'y']]) }), opt: { subject: { id: 'id-p1', name: P[0], saved: true }, refs: [{ name: P[2], ids: ['id-p3'] }] } }),
                }
                let U = {
                    plain: () => ({ rows: ed(s.users, 'id-u1', { description: 'u-plain' }) }),
                    subjM3: () => ({ rows: ed(s.users, 'id-u3', { cgrups: authOf('users', [[M[2], 'y']]) }), opt: { subject: { id: 'id-g3', name: M[2], saved: true } } }),
                    refM3: () => ({ rows: ed(s.users, 'id-u3', { cgrups: authOf('users', [[M[2], 'y']]) }), opt: { refs: [{ name: M[2], ids: ['id-g3'] }] } }),
                    refM2: () => ({ rows: ed(s.users, 'id-u3', { cgrups: authOf('users', [[M[1], 'y']]) }), opt: { refs: [{ name: M[1], ids: ['id-g2'] }] } }),
                }
                let Pm = {
                    plain: () => ({ rows: ed(s.pemis, 'id-p1', { description: 'p-plain' }) }),
                    rename: () => ({ rows: ed(s.pemis, 'id-p1', { name: `${P[0]}x` }) }),
                    replace3: () => ({ rows: [...rm(s.pemis, 'id-p3'), clientEntity('pemis', 'id-p3-NEW', P[2])] }),
                    refT3: () => ({ rows: ed(s.pemis, 'id-p3', { crules: authOf('pemis', [[T[2], 'y']]) }), opt: { refs: [{ name: T[2], ids: [T[2]] }] } }),
                }
                let Tg = {
                    plain: () => ({ rows: ed(s.targets, T[0], { description: 't-plain' }) }),
                    del3: () => ({ rows: rm(s.targets, T[2]) }),
                    del1: () => ({ rows: rm(s.targets, T[0]) }),
                }
                return [
                    { name: 'G', table: 'grups', userId: 'id-opG', ...cloneDeep(G[sc.G]()) },
                    { name: 'U', table: 'users', userId: 'id-opU', ...cloneDeep(U[sc.U]()) },
                    { name: 'P', table: 'pemis', userId: 'id-opP', ...cloneDeep(Pm[sc.P]()) },
                    { name: 'T', table: 'targets', userId: 'id-opT', ...cloneDeep(Tg[sc.T]()) },
                ]
            }
            //12 情境: 涵蓋 subject／refs 與「刪後同名重建」「連帶改名」「連帶刪除」之各種組合
            const SCEN = [
                { G: 'replace3', U: 'subjM3', P: 'plain', T: 'plain' },
                { G: 'replace3', U: 'refM3', P: 'replace3', T: 'del3' },
                { G: 'subjP3', U: 'plain', P: 'replace3', T: 'plain' },
                { G: 'refP3', U: 'refM3', P: 'rename', T: 'del1' },
                { G: 'rename', U: 'refM2', P: 'refT3', T: 'del3' },
                { G: 'both', U: 'subjM3', P: 'replace3', T: 'del3' },
                { G: 'replace3', U: 'refM2', P: 'refT3', T: 'del1' },
                { G: 'plain', U: 'subjM3', P: 'rename', T: 'del3' },
                { G: 'refP3', U: 'subjM3', P: 'replace3', T: 'plain' },
                { G: 'rename', U: 'refM3', P: 'refT3', T: 'del3' },
                { G: 'subjP3', U: 'refM3', P: 'rename', T: 'del1' },
                { G: 'replace3', U: 'subjM3', P: 'refT3', T: 'del3' },
            ]
            let baselineCache = new Map()
            //baselineOf: 該情境所有依序執行（24 種排列）之 `結果|終態` 集合
            let baselineOf = async (sc) => {
                let key = J(sc)
                if (baselineCache.has(key)) {
                    return baselineCache.get(key)
                }
                let ops = buildOps(sc)
                let set = new Set()
                let views = new Set()
                for (let perm of permutations(ops.map((o) => o.name))) {
                    let env = createEnv()
                    let results = {}
                    for (let nm of perm) {
                        let o = ops.find((x) => x.name === nm)
                        results[nm] = await run(env.pc, o.table, cloneDeep(o.rows), o.opt, o.userId)
                    }
                    let view = await viewOf(env.woItems)
                    set.add(`${J(ops.map((o) => results[o.name]))}|${view}`)
                    views.add(view)
                    env.cst.clear()
                }
                let b = { set, nViews: views.size, hasIdentityReject: [...set].some((v) => /saveSubjectChanged|saveRefChanged/.test(v)) }
                baselineCache.set(key, b)
                return b
            }
            let concurrentRound = async (sc, seedNo) => {
                let rand = mulberry32(seedNo)
                let ops = buildOps(sc)
                let env = createEnv()
                for (let t of TABLES) {
                    fuzzTable(env.woItems[t], rand)
                }
                let order = shuffle(ops.map((o, i) => i), rand)
                let rs = []
                await withTimeout(Promise.all(order.map((i) => (async () => {
                    await jitter(rand)
                    rs[i] = await run(env.pc, ops[i].table, cloneDeep(ops[i].rows), ops[i].opt, ops[i].userId)
                })())), 5000, `情境 ${J(sc)} 種子 ${seedNo}`)
                let view = await viewOf(env.woItems)
                env.cst.clear()
                return { rs, view }
            }

            it('IDN-520 四表（updateGrups∥updateUsers∥updatePemis∥updateTargets）隨機交錯 60 輪（12 情境 × 5 種子）: 每輪 5 秒內完成（不死結）, 結果與終態等價於某一依序執行（無遺失更新、無半套級聯、無「成功但指向被替換實體」）', async function() {
                this.timeout(300000)
                let nIdRej = 0 //併發結果中身分拒收之筆數
                let nIdOk = 0 //併發結果中帶宣告而成功之筆數
                let nScenWithReject = 0
                for (let round = 0; round < 60; round++) {
                    let sc = SCEN[round % SCEN.length]
                    let b = await baselineOf(sc)
                    if (round < SCEN.length && b.hasIdentityReject) {
                        nScenWithReject++
                    }
                    let { rs, view } = await concurrentRound(sc, 3000 + round)
                    A.ok(rs.every((r) => r !== undefined), `第 ${round} 輪每個操作皆應已結束`)
                    A.ok(rs.every((r) => r.ok || r.v !== 'saveWriteFail'), `第 ${round} 輪(情境 ${J(sc)}, 種子 ${3000 + round})不得出現 saveWriteFail: ${J(rs)}`)
                    A.ok(b.set.has(`${J(rs)}|${view}`), `第 ${round} 輪(情境 ${J(sc)}, 種子 ${3000 + round})結果／終態不等價於任何依序執行\n實得 ${J(rs)}\n${view}`) //[I-LOCK] 序列等價
                    for (let r of rs) {
                        if (!r.ok && (r.v === 'saveSubjectChanged' || r.v === 'saveRefChanged')) {
                            nIdRej++
                        }
                    }
                    let opts = buildOps(sc).map((o) => o.opt !== undefined)
                    rs.forEach((r, i) => {
                        if (opts[i] && r.ok) {
                            nIdOk++
                        }
                    })
                }
                console.log(`[unit-procCore-identity IDN-520] 60 輪併發結果中: 身分拒收 ${nIdRej} 筆、帶宣告成功 ${nIdOk} 筆; 依序執行即含身分拒收之情境 ${nScenWithReject}/${SCEN.length}`)
                //防空洞: 情境確有「依序執行即產生身分拒收」者, 且併發結果中兩種走向（拒收與成功）皆曾出現
                A.ok(nScenWithReject >= 6, `含身分拒收之情境數不足: ${nScenWithReject}`)
                A.ok(nIdRej >= 5, `併發結果中身分拒收筆數不足（${nIdRej}）, 比對缺鑑別力`)
                A.ok(nIdOk >= 5, `併發結果中帶宣告成功筆數不足（${nIdOk}）, 比對缺鑑別力`)
            })
        })
    })


    // =================================================================
    // IDN-6xx 靜態與介面
    // =================================================================
    describe('IDN-6 靜態站點與介面', function() {
        let readCode = (rel) => sourceLines(path.join(projRoot, rel), 'code').map((l) => l.text).join('\n')
        let countOf = (code, re) => (code.match(re) || []).length

        it('IDN-601 pickClientOpt 採納 baseline／returnRows:true／subject／refs（原樣轉出）, 不採納 pickKeysOnly／mustExist／keepUserId／skipDup 等其餘鍵', function() {
            let bl = [['a', 'h1:0123456789abcd']]
            let subject = { id: 'a', name: 'b', saved: true }
            let refs = [{ name: 'x', ids: ['1'] }]
            let out = pickClientOpt({ baseline: bl, returnRows: true, subject, refs, pickKeysOnly: ['cgrups'], mustExist: false, keepUserId: true, skipDup: true, cascadeRename: false, foo: 1 })
            A.deepEqual(Object.keys(out).sort(), ['baseline', 'refs', 'returnRows', 'subject']) //[I-CLIENT]
            A.equal(out.subject, subject, '原樣轉出（同一參照, 不信任內容、不在此正規化）')
            A.equal(out.refs, refs)
            A.equal(out.baseline, bl)
            A.equal(out.returnRows, true)
        })
        it('IDN-601 subject／refs 為 undefined／null 不轉出（視為未帶）; 其他 falsy 值（false／0／空字串）原樣轉出, 交 updateTabItems 驗格式; 非物件 opt → {}', function() {
            A.deepEqual(pickClientOpt({ subject: null, refs: null }), {}) //[I-CLIENT][I-COMPAT]
            A.deepEqual(pickClientOpt({ subject: undefined, refs: undefined }), {})
            A.deepEqual(pickClientOpt({ subject: false, refs: 0 }), { subject: false, refs: 0 }, '不降級為未帶')
            A.deepEqual(pickClientOpt({ subject: '', refs: [] }), { subject: '', refs: [] })
            for (let v of [null, undefined, 'x', 5, true, []]) {
                A.deepEqual(pickClientOpt(v), {})
            }
            A.deepEqual(pickClientOpt({ returnRows: 'true', baseline: null }), {}, 'returnRows 僅 true 才採納; baseline null 不採納')
        })
        it('IDN-601 不採納原型鏈或繼承來的 subject／refs 以外之鍵（__proto__ 汙染式輸入）', function() {
            let evil = JSON.parse('{"__proto__": {"pickKeysOnly": ["cgrups"], "mustExist": false}, "constructor": {"x": 1}}')
            A.deepEqual(pickClientOpt(evil), {}) //[I-CLIENT]
        })

        it('IDN-602 站點計數: server/procCore.mjs 內 getRefTarget( 呼叫、withRefLock( 呼叫、checkSubjectIdentity( 呼叫、checkRefIdentity( 呼叫、parseSubject( 呼叫、parseRefDecl( 呼叫各恰一處', function() {
            let code = readCode('server/procCore.mjs')
            for (let nm of ['getRefTarget', 'withRefLock', 'checkSubjectIdentity', 'checkRefIdentity', 'parseSubject', 'parseRefDecl']) {
                A.equal(countOf(code, new RegExp(`\\b${nm}\\(`, 'g')), 1, `${nm}( 須恰一處`) //[I-SITE]
            }
            A.equal(countOf(code, /guardWrite\(\{/g), 1, 'guardWrite 呼叫點仍恰一處')
            A.equal(countOf(code, /updateTabItems-identity-error/g), 3, 'identity-error 事件恰三處（格式、subject、refs）')
        })

        it('IDN-603 取鎖次序: lockSave( 為最外層, 其內 withRefLock( 再內 guardWrite({; withRefLock 之定義在被引用表鎖（withTabLocks(lockTabs, [refTarget.table]）內新鮮讀取、驗 subject, 最後才 fn()（進本表 guardWrite）', function() {
            let code = readCode('server/procCore.mjs')
            let iLock = code.indexOf('lockSave(`updateTabItems:')
            let iRef = code.indexOf('withRefLock(() => guardWrite({')
            let iGuard = code.indexOf('guardWrite({')
            A.ok(iLock > 0 && iRef > iLock, `lockSave( ${iLock} 須在 withRefLock( ${iRef} 之前`) //[I-SITE][I-LOCK]
            A.equal(iGuard, iRef + 'withRefLock(() => '.length, 'withRefLock 直接包住 guardWrite({（本表鎖在被引用表鎖之內）')
            let iDef = code.indexOf('let withRefLock = ')
            A.ok(iDef > 0 && iDef < iLock, 'withRefLock 定義在使用之前')
            let body = code.slice(iDef, iLock)
            let iTabs = body.indexOf('withTabLocks(lockTabs, [refTarget.table]')
            let iSel = body.indexOf('woItems[refTarget.table].select()')
            let iChk = body.indexOf('checkSubjectIdentity(')
            let iFn = body.lastIndexOf('await fn()')
            A.ok(iTabs >= 0 && iSel > iTabs && iChk > iSel && iFn > iChk, `次序須為 取被引用表鎖 < 新鮮讀取 < 驗 subject < fn(): ${[iTabs, iSel, iChk, iFn]}`)
            A.ok(!body.includes('guardWrite('), 'withRefLock 本體不得直接取本表鎖（由 fn 進入）')
            A.ok(!/\],\s*\[keyTable\]\)/.test(body.slice(iTabs, iFn)), '被引用表鎖為最外層, 不帶 held（外層取鎖）')
        })

        it('IDN-604 checkSubjectIdentity 在被引用表鎖內、基準比對（baseline: baseline === null）之前', function() {
            let code = readCode('server/procCore.mjs')
            let iDef = code.indexOf('let withRefLock = ')
            let iSubj = code.indexOf('checkSubjectIdentity(')
            let iBase = code.indexOf('baseline: baseline === null')
            let iLock = code.indexOf('lockSave(`updateTabItems:')
            A.ok(iDef > 0 && iSubj > iDef && iSubj < iLock, 'checkSubjectIdentity 在 withRefLock 定義內') //[I-SITE][I-ORDER]
            A.ok(iBase > iSubj, `checkSubjectIdentity( ${iSubj} 須在基準比對 ${iBase} 之前`)
        })

        it('IDN-605 checkRefIdentity 在 write 內、restoreServerFields( 之後、checkExternalWrite( 之前; 並使用鎖內新鮮讀取之 refRows 與 ltdtOld', function() {
            let code = readCode('server/procCore.mjs')
            let iWrite = code.indexOf('write: async (ltdtOld)')
            let iRestore = code.indexOf('restoreServerFields(')
            let iRef = code.indexOf('checkRefIdentity(')
            let iExt = code.indexOf('checkExternalWrite(')
            A.ok(iWrite > 0 && iRestore > iWrite && iRef > iRestore && iExt > iRef, `次序須為 write < restoreServerFields( < checkRefIdentity( < checkExternalWrite(, 實得 ${[iWrite, iRestore, iRef, iExt]}`) //[I-SITE][I-ORDER]
            A.ok(/checkRefIdentity\(\{[^}]*rowsOld: ltdtOld[^}]*refRows[^}]*\}\)/.test(code), 'checkRefIdentity 以鎖內讀取之 ltdtOld 與 refRows 為輸入')
            A.ok(/rowsNew: \[\.\.\.r\.add, \.\.\.r\.diff\]/.test(code), '本次寫入之列＝新增列＋改動列')
        })

        it('IDN-606 身分宣告格式驗證在基準格式驗證之後、lockSave( 之前（任何讀寫與取鎖之前拒收）; 被引用表只由 getRefTarget(keyTable) 伺服端自組, 不讀客戶端 opt 之表名', function() {
            let code = readCode('server/procCore.mjs')
            let iBase = code.indexOf('!isBaselineValid(')
            let iFmtKey = code.indexOf("return Promise.reject('saveIdentityFormat')")
            let iGet = code.indexOf('getRefTarget(')
            let iLock = code.indexOf('lockSave(`updateTabItems:')
            A.ok(iBase > 0 && iGet > iBase && iFmtKey > iGet && iFmtKey < iLock, `次序須為 isBaselineValid < getRefTarget < reject saveIdentityFormat < lockSave: ${[iBase, iGet, iFmtKey, iLock]}`) //[I-SITE][I-FMT][I-ORDER]
            A.ok(/getRefTarget\(keyTable\)/.test(code), 'getRefTarget 之引數為本函數之 keyTable（伺服端自組）')
            A.ok(!/get\(opt,\s*'(table|refTable|holder|lockTable|tables)'/.test(code), '不得由客戶端 opt 取表名')
            A.ok(!/opt\.(table|refTable|holder|lockTable|tables)\b/.test(code))
        })

        it('IDN-607 identity-error 的 srLog 呼叫不含名稱／id／宣告內容（只記 keyTable、userId、msg、reason、n）', function() {
            let code = readCode('server/procCore.mjs')
            let lines = code.split('\n').filter((l) => l.includes('updateTabItems-identity-error'))
            A.equal(lines.length, 3)
            for (let l of lines) {
                A.ok(!/\b(name|ids|subject|decl|refDecl|refRows|rows|email)\b/.test(l.replace(/'updateTabItems-identity-error'/, '')), `[I-LOG] ${l.trim()}`)
            }
        })

        it('IDN-608 語系鍵: saveSubjectChanged／saveRefChanged／saveIdentityFormat／saveIdentityRequired(perm-run03) 於 eng 與 cht 皆有非空固定訊息（不含 {name} 等變數）; 經 errLog 對外原樣輸出（非 saveWriteFail）', function() {
            let lang = procLang({})
            for (let k of ['saveSubjectChanged', 'saveRefChanged', 'saveIdentityFormat', 'saveIdentityRequired']) {
                for (let lg of ['eng', 'cht']) {
                    A.equal(typeof lang[lg][k], 'string', `${lg}.${k}`)
                    A.ok(lang[lg][k].length > 10)
                    A.ok(!lang[lg][k].includes('{'), `${lg}.${k} 須為固定訊息, 不含名稱變數（[I-LOG]）`)
                }
            }
        })
        it('IDN-609 必帶判定的站點（perm-run03）: server/procCore.mjs 之 checkRefIdentity 呼叫同時傳 decl（refDecl）與 subject, 且 srLog 的 identity-error 仍只有三處（格式、subject、refDecl／必帶共用一處）——不另有第四處必帶專用的 reject', function() {
            let code = readCode('server/procCore.mjs')
            A.ok(/checkRefIdentity\(\{ keyTable, decl: refDecl, subject, rowsNew: \[\.\.\.r\.add, \.\.\.r\.diff\], rowsOld: ltdtOld, refRows \}\)/.test(code), '[I-SITE] decl 與 subject 一併傳入, 由純函數判定必帶／不完整／不符') //[I-SITE]
            A.equal(countOf(code, /updateTabItems-identity-error/g), 3)
            A.equal(countOf(code, /saveIdentityRequired/g), 0, '必帶鍵由 refIdentity.checkRefIdentity 回傳（單一擁有者）, procCore 不重複字面')
        })
    })

})

//案數(perm-run02, mocha 實跑 2026-10-23): IDN-1 52、IDN-2 92、IDN-3 4（IDN-301 內含 7 種不帶宣告形式 × 3 引用端）、IDN-4 11、IDN-5 28、IDN-6 10, 共 197 案全綠.
//案數(perm-run03 測試遷移後, mocha 實跑 2026-10-23): IDN-1 52、IDN-2 92（IDN-207 改寫、其餘同前）、IDN-215～222 21（移除與 subject 路徑; 215～219 × 引用端 3、220～222 × 引用端 2）、IDN-22x 逐軸矩陣 49（48 個 H×K 格組 ＝ 576 格, ＋IDN-229 格數統計）、
//  IDN-3 7（301 改寫 ×3、303 新 ×3、302 改寫 ×1）、IDN-4 11（404 首次存檔補宣告）、IDN-5 28（501 對照改寫）、IDN-6 11（608 增鍵、新增 609）, 共 271 案全綠（上輪遷移前 12 敗: 207 ×3、301 ×3、404 ×3、501 對照 ×3, 皆已依新語意改寫）.
//perm-run03 變異驗證（對 repo 副本沙盒〔tmp/perm-run03/mut, 驗畢已刪〕內之產品碼逐一注入缺陷, 腳本 tmp/perm-run03/mutate-B.mjs; 跑本檔＋unit-refIdentity＋unit-refIdentityWiring）: M1 必帶判定拿掉 73 案紅、M2 collectChangedNames 不含移除 64、M3 removedActiveNames 恆空 79、M4 recordPicks 不記移除 11、M5 buildRefDecl 改用 collectNewNames 11、M6 subject 名稱不計入已宣告 16、
//  M7 漏報判定拿掉 93、M8 不符判定拿掉 150、M9 procCore 不傳 subject 16、M10 procCore 無 refs 時略過檢查 53、M11 procCore 只檢查新增列 55、M12 recordPicks 移除路徑繞過衝突語意 4、M13 新列舊值誤當有舊列 32; 13 個變異全被殺.
//變異驗證(對副本逐一注入缺陷, 確認會紅): 略過 refs／subject 驗證、被引用表不取鎖、檢查在鎖內但寫入在鎖外、pickClientOpt 不採 subject、targets 帶宣告不拒、壞 subject 當未帶、一律取被引用表鎖(相容破壞)、log 洩名稱、refs 不含新增列、refs 舊列視為空、格式拒收降級為不帶 等 13 個變異皆被殺（另 2 個為等價／空操作變異）.
