//外部列保護與過期快照基準之伺服端寫入整合單元測試(F-23／F-26; R-PRINCIPLE-00 原則 3、5; 規則帳本 R-EXT-OWN-01、R-BASELINE-01; ADR-037; run07 U1)
//
//受測: server/procCore.mjs 之 updateTargets／updatePemis／updateGrups／updateUsers(kpFunExt 之實際入口, 內走 updateTabItems; 真 proc、真 procOrm／withTabLocks／guardWrite〔w-serv-orm 實例, 測試輔助 mkCore; perm-run01: 原 getMapOrm→getProc＋真 kmx〔pmKeyMutex〕〕、真 lockSave),
//僅資料表以 test/tools/unitOrm.mjs 之 mkTable 替身取代 w-orm-lmdb(其 cnt 計 insert／save／del／delAll, 供斷言「被拒時零寫入」), 不起服務.
//純函數之窮舉見 unit-externalRows／unit-rowDigest／unit-syncKeep; 本檔驗「接線」: 守門於何時、何序、何鎖內生效, 與四表零寫入、log、級聯、並行。
//
//規格來源(期望由規格推導, 不抄實作):
//  EXT-S1 外部列(from 為非空字串)之身分／結構欄後台不得改、不得刪、不得改 from; 指派欄(users.cgrups／grups.cpemis／pemis.crules)後台可寫; 後台新增列 from 須為 '';
//         非字串 from 後台一律拒收(不論 lockExternalRows; 歷史 null 原樣送回不拒); 外部列 order 由外部擁有(後台儲存不重編; 後台列 order 仍 k+1).
//         違規整次拒收(saveFromNotAllowed／saveExternalRowChanged)、四表零寫入、不靜默忽略.(設計摘要 §要解決什麼 1、2)
//  EXT-S2 過期快照基準(run11 改寫為表級; 使用者 2026-10-22 裁示 R-PRINCIPLE-00 原則 7「以表雜湊比對, 先動先贏」, run07 版「只比對本次將寫入之列」之案作廢或重寫): 草稿開啟時之整表逐列內容指紋隨 RPC 第 3 參 { baseline } 帶入;
//         於表鎖內比對整表——庫內任何一列內容(排除 order 與伺服器管理欄)與基準不同、或有列增刪、或名次(order 排序)不同〔perm-run01 原則 10: 名次入基準, 僅 order 數值改變而名次不變仍相符〕, 不論是否為本次將寫入之列, 一律整次拒收 saveStale(reason rowChanged／rowRemoved／rowAdded／rowReordered)、零寫入;
//         未帶基準之舊客戶端: 後台列維持舊行為; 但修改外部列之指派欄無基準即拒收 saveBaselineRequired(外審 B.2); 基準格式不識(h1 以外之版本、套內舊版指紋、重複 id、壞結構)→ saveBaselineFormat(零寫入, 不降級為不帶基準; perm-run01: 原 saveRowFieldInvalid／validate-error baselineInvalid).(設計摘要 §3)
//  EXT-S3 外部列僅伺服器管理欄(建立者／建立時間／更新者／更新時間)不同之舊快照視為無變更, 不寫入、不把建立者與建立時間回退為舊值;
//         perm-run01(寫入契約 serverOnly)起不分外部列或後台列、亦不論 lockExternalRows, 伺服器專有欄位存檔一律不採用客戶端值(取庫內值; 見 EXT-E04、EXT-H08).
//  EXT-S4 守門順序(run11 修訂: 表級基準不需 diff 結果, 提前至 select 之後第一個檢查; run07: 依 U1 觀察 1 與 API 子代理 C-1 缺陷, 基準先於外部列守門; perm-run01: 基準比對改由 w-serv-orm guardWrite 於同一表鎖內 read 之後、write 之前執行):
//         guardWrite〔取鎖 → read(新鮮讀取) → 有基準者比對(saveStale)〕→ write〔還原外部列 order → 重複檢查 →
//         ltdtDiffByKey → 外部列僅伺服器欄不同者移入 same → 外部列守門(saveFromNotAllowed／saveExternalRowChanged) → 無基準且 lock 且有外部列 diff 才 saveBaselineRequired → 寫入前驗證 → 引用連帶 → 寫入〕;
//         全在表鎖內; 比對於鎖內(鎖前之他人寫入須被看見). 有基準而草稿已過期(外部同步於開啟後改了外部列內容或移除之)而使用者只編修後台列 → 回 saveStale(而非誤導之外部列不可修改); 基準新鮮而仍違規 → 仍由守門拒收.
//  EXT-S8 (run11 取代 run07 同編號「內容同庫內之 diff 不計」: 表級比對下不再有 diff 跳過規則) 他人在草稿之後新增 X, 草稿帶原基準(無 X)送出——即使原樣帶回 X、只編修一個後台列, 亦 saveStale/rowAdded(先動先贏, 不部分變更);
//         重新載入(基準含 X)後重送則成功, X 內容不變、建立者沿用. 見 O 區段.
//  EXT-S5 引用連帶(群組／權限改名與刪除)由伺服端發動, 引用端(含外部 users 列之 cgrups)改寫不受守門影響; 外部列之群組／權限／標的不可被後台改名或刪除(整次拒收, 引用端零寫入).
//  EXT-S6 srLog: 事件 updateTabItems-external-error(含 keyTable、userId、msg、reason、n、froms)與 updateTabItems-stale-error(含 keyTable、userId、msg、reason[、n]);
//         不含任何列 id、名稱、email 之值(只記鍵、原因、筆數、來源名稱).
//  EXT-S7 用戶端 opt 只採納 baseline 與 returnRows(updateTargets／Pemis／Grups 經 pickClientOpt; updateUsers 經 WWebPerm 之 kpFunExt 亦經 pickClientOpt, 再加伺服端之 pickKeysOnly).
//
//輸入空間表(軸 × 案數; 案數為 mocha 實測, 共 334 案〔run07 U1b 修訂: 238 → 291, +A02b 4、+SITE-EX-003b 1、+O 區段 48; run07 U1c 修訂: 291 → 307, +J 區段 EXT-J03 重複 id 基準 12、+EXT-J03b 對照 4;
//  perm-run01 修訂: 307 → 334〔含重新點算前即已存在而未入表之差 +6〕, +C05b 名次改變 4、+J01 三種 h1 形似壞基準 12、+J04 舊版指紋基準 4、+G11 pickClientOpt 1〕; perm-run03 修訂: +SITE-EX-013 requireAdmin 先於 pc.updateXxx 1; 軸與格之展開見各 describe):
//  A 守門拒收    22 項(A01 逐表×違規種類: 新增非空 from／複製繼承 from／非字串 from×3(null,123,true)／刪外部列／改外部 from×2(''、pz)／改鎖定欄 description／改身分欄 name|email／後台改成外部 pz, 共 11 種 × 表 4, targets 無身分欄故 43 案)＋ A02 復活(未帶基準 → 守門)4 ＋ A02b 復活(附基準 → saveStale/rowRemoved)4 ＋ A03 多違規 froms ＋ A04 整次拒收不靜默 ＋ A05 指派欄可寫 = 54; 每案斷言 key、四表逐位元不變且零寫入、集中 errLog、external-error 欄位(keyTable／userId／msg／reason／n／froms)
//  B 指派欄      表 3(users／grups／pemis)× {有基準可寫, 無基準 saveBaselineRequired, 基準過期 saveStale, 後台列無基準舊行為} 12 ＋ targets 無指派欄 ＋ 外部指派與後台編修並行寫入 ＋ 無外部 diff 無須基準 = 15
//  C B.1 過期    表 4 × {他人改同列, 他人新增列而草稿將其刪除, 草稿原樣帶回他人新增列(舊基準 → saveStale/rowAdded; 重新載入後成功), 復活他人已刪列, 同版與外部同步重寫伺服器欄／order 數值(名次不變, 不作廢)} 20 ＋ [perm-run01] C05b 外部同步使外部列名次改變 → saveStale/rowReordered 4 ＋ 表 3 外部指派被他人改後送回舊值 3 ＋ 基準先於守門(C07 外部說明被同步改、C08 外部列被同步移除; 原為「守門先於基準」之舊語意, 已重寫)2 ＋ 表 4 空基準 [](≠未帶基準)4 = 33
//  D B.2         無基準舊指派送回(整表／pickKeysOnly)2 ＋ 重新載入後可存 1 = 3
//  E 僅伺服器欄  表 4 ×{有基準,無基準} 8 ＋ 無實質編修零寫入 1 ＋ [run11 外審 sol 第 3 點] EXT-E03 外部列持舊管理欄改指派欄(users／grups／pemis)3 ＋ EXT-E04 後台列亦取庫內伺服器專有欄(perm-run01; 原為後台列維持舊行為) 1 = 13
//  F order       表 4 ×{外部列移前不重編且不致成 diff, lockExternalRows:false 重編, 外部列居中} = 12
//  G pickKeysOnly／opt  users × {基準通過且身分欄被忽略／缺列不刪／新增不採納, 無基準, 基準過期, 後台列與基準缺列項, 僅被忽略欄位之變更} 5 ＋ 表 3 用戶端 opt 只採 baseline 3 ＋ [perm-run01] G11 pickClientOpt 只採 baseline／returnRows 1 = 9
//  H 舊行為迴歸  lockExternalRows:false × 表 4 × {改身分欄, 刪除, 新增非空 from, 改 from, 非字串 from 仍拒} 20 ＋ 無基準外部指派放行 ＋ 基準仍檢(過期／壞格式 → saveBaselineFormat)＋ H08 關閉後仍不採用客戶端伺服器專有欄(perm-run01; 原為「不做僅伺服器欄不同之移除, 舊快照照寫」)= 23
//  I from 型別   歷史 null 之列 {原樣送回改他欄 × lock{真,假}} 8 ＋ 表 4 ×{改成 ''／改成 pz(拒), 缺 from 視為 '', 可被刪除} 12 = 20
//  J 基準格式    壞基準 13 種(原 10 種＋perm-run01 增 h2 版本前綴／h1 長度不足／h1 大寫十六進位 3 種)× 表 4 = 52(EXT-J01: saveBaselineFormat、stale-error/baselineFormat/n 0、零寫入) ＋ null／未給視為舊客戶端 × 表 4 = 56 ＋ [perm-run01] EXT-J04 套內舊版指紋(base36)基準結構正確仍拒收、不降級 × 表 4 = 60 ＋
//                [run07 外審 sol R8] 同 id 重複之基準 {同指紋, 舊前現後, 現前舊後} × 表 4 = 12(EXT-J03: saveBaselineFormat、零寫入; 另 EXT-J03b 對照 × 表 4 = 4, 基準不重複則成功) = 76
//  K 級聯×守門   後台群組改名／刪除連帶改寫外部 users 2 ＋ 外部群組改名／刪除被拒且引用端零寫入 2 ＋ 外部權限改名／刪除、外部標的刪除被拒 1 ＋ 級聯使舊基準失效 1 = 6
//  L srLog       external／stale／級聯等路徑之鍵集合與無個資 4
//  M 並行        同表兩操作者同基準(後台列、外部指派)2 ＋ 跨表 1 ＋ 鎖內比對(等待鎖期間他人已改／已納為外部列)2 = 5
//  O 基準先於守門(run07 修訂; run11 表級改寫: C-1 他人新增 X 後以舊基準送出即 saveStale/rowAdded, 重新載入後成功)  表 4 ×{C-1 舊基準 saveStale 後重新載入成功, X 被再改而帶舊版 saveStale/rowAdded, 基準含 X 舊版而庫內已變 saveStale/rowChanged, 列新基準舊 saveStale 後新基準成功} 16 ＋ lockExternalRows:false 之 C-1 1 ＋
//                表 4 ×{外部同步改外部列 → saveStale, 外部同步移除外部列 → saveStale/rowRemoved, 新鮮基準改外部身分欄／新增非空 from／刪外部列／帶回已移除外部列 → 守門, 過期且違規 → saveStale} 28 ＋ 無基準且違規 → 守門(users／grups／pemis)3 = 48
//  N 靜態站點    updateTabItems 之呼叫位置／次序(基準先於守門; perm-run01: 以 guardWrite 之 read:／baseline:／write: 與 .catch(mapGuardErr)、引用端 withTabLocks(lockTabs, [holder] 釘住)／鎖內／單點／lock 守護 9 ＋ WWebPerm kpFunExt 簽名與 opt 採納 3 ＋ [perm-run03] SITE-EX-013 requireAdmin 先於 pc.updateXxx 1 = 13; 另 EXT-999 區段存在核對 1
//  刻意不測: 真後端端到端(api 層); 外部同步入口(api-syncAndReplaceTabs 與 unit-syncKeep); 前端唯讀／橫幅(e2e); 前端 baseline 之建立時機(UI1／UI2 之測試).
//  未測: 無.
//跑法: npx mocha test/unit-procCore-external.test.mjs --reporter list --timeout 120000
import assert from 'assert'
import fs from 'fs'
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
import { SPEC_DIGEST } from './tools/unitExt.mjs'
import { stripLineComment } from './tools/srcScan.mjs'


const projRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const PH = '{新增}' //前端新列之稽核欄位佔位字
const T0 = '2026-01-01T00:00:00.000+08:00'
const AUDIT = { userId: 'rid-seed', timeCreate: T0, userIdUpdate: 'rid-seed', timeUpdate: T0 }
const TABLE_KEYS = ['users', 'targets', 'grups', 'pemis']
const FN = { users: 'updateUsers', targets: 'updateTargets', grups: 'updateGrups', pemis: 'updatePemis' }
const OKR = { ok: true, v: 'saveTabItemsSuccess' }
let ERR = (k) => ({ ok: false, v: k })
let J = (o) => JSON.stringify(o)
const OR = { mode: 'OR', isActive: 'y' }

//列 id／名稱／email／標的路徑皆帶哨兵字串(rid-／pii-), 供 srLog 無個資之斷言
const T1 = 'pii-sys/p1/b1'
const T2 = 'pii-sys/p1/b2'
const T3 = 'pii-sys/p2/b1'

//IDS: 各表之「後台列 b1、外部列 ext(from pd)、後台列 b2」
const IDS = {
    targets: { b1: T1, ext: T2, b2: T3 },
    pemis: { b1: 'rid-p1', ext: 'rid-p2', b2: 'rid-p3' },
    grups: { b1: 'rid-g1', ext: 'rid-g2', b2: 'rid-g3' },
    users: { b1: 'rid-u1', ext: 'rid-u2', b2: 'rid-u4' },
}
const ASSIGN = { users: 'cgrups', grups: 'cpemis', pemis: 'crules', targets: null }
const SENTINELS = ['rid-', 'pii-']

//seedRows: 四表種子(order 與位置一致 1..n)
//  targets: T1(後台)／T2(外部 pd)／T3(後台)
//  pemis:   P1(後台){T1 y}／P2(外部 pd){T2 y}／P3(後台){}
//  grups:   G1(後台){P1 OR}／G2(外部 pd){P2 OR}／G3(後台){P3 OR}
//  users:   u1(後台){G1}／u2(外部 pd){G1, G2}／u3(外部 pe){}／u4(後台){}
function seedRows() {
    let mk = (table, o) => ({ ...ds[table].funNew(), ...AUDIT, ...o })
    return {
        targets: [
            mk('targets', { id: T1, order: 1, description: 'pii-desc-t1', from: '' }),
            mk('targets', { id: T2, order: 2, description: 'pii-desc-t2', from: 'pd' }),
            mk('targets', { id: T3, order: 3, description: 'pii-desc-t3', from: '' }),
        ],
        pemis: [
            mk('pemis', { id: 'rid-p1', order: 1, name: 'pii-P1', description: 'pii-desc-p1', from: '', crules: J({ [T1]: 'y' }) }),
            mk('pemis', { id: 'rid-p2', order: 2, name: 'pii-P2', description: 'pii-desc-p2', from: 'pd', crules: J({ [T2]: 'y' }) }),
            mk('pemis', { id: 'rid-p3', order: 3, name: 'pii-P3', description: 'pii-desc-p3', from: '', crules: '{}' }),
        ],
        grups: [
            mk('grups', { id: 'rid-g1', order: 1, name: 'pii-G1', description: 'pii-desc-g1', from: '', cpemis: J({ 'pii-P1': OR }) }),
            mk('grups', { id: 'rid-g2', order: 2, name: 'pii-G2', description: 'pii-desc-g2', from: 'pd', cpemis: J({ 'pii-P2': OR }) }),
            mk('grups', { id: 'rid-g3', order: 3, name: 'pii-G3', description: 'pii-desc-g3', from: '', cpemis: J({ 'pii-P3': OR }) }),
        ],
        users: [
            mk('users', { id: 'rid-u1', order: 1, name: 'pii-name-u1', email: 'pii-u1@example.com', description: 'pii-desc-u1', from: '', cgrups: J({ 'pii-G1': OR }), isAdmin: 'n', isActive: 'y' }),
            mk('users', { id: 'rid-u2', order: 2, name: 'pii-name-u2', email: 'pii-u2@example.com', description: 'pii-desc-u2', from: 'pd', cgrups: J({ 'pii-G1': OR, 'pii-G2': OR }), isAdmin: 'n', isActive: 'y' }),
            mk('users', { id: 'rid-u3', order: 3, name: 'pii-name-u3', email: 'pii-u3@example.com', description: 'pii-desc-u3', from: 'pe', cgrups: '{}', isAdmin: 'n', isActive: 'y' }),
            mk('users', { id: 'rid-u4', order: 4, name: 'pii-name-u4', email: 'pii-u4@example.com', description: 'pii-desc-u4', from: '', cgrups: '{}', isAdmin: 'n', isActive: 'y' }),
        ],
    }
}

//newRow: 模擬清單頁 addItem 之新列(前端 funNew 產 id、稽核欄位為佔位字、transient _isNew); 名稱／email 逐呼叫互異
let seq = 0
function newRow(table, o = {}) {
    seq++
    let r = ds[table].funNew()
    r.userId = PH
    r.timeCreate = PH
    r.userIdUpdate = PH
    r.timeUpdate = PH
    r.from = ''
    r.description = ''
    if (table === 'targets') {
        r.id = `pii-new/t${seq}`
    }
    else if (table === 'users') {
        r.name = `pii-new-${seq}`
        r.email = `pii-new-${seq}@example.com`
        r.cgrups = '{}'
    }
    else {
        r.name = `pii-new-${seq}`
        r[ASSIGN[table]] = '{}'
    }
    r._isNew = true
    return { ...r, ...o }
}


describe('unit-procCore-external (外部列保護與過期快照基準之伺服端寫入, F-23／F-26)', function() {

    this.timeout(120000)

    let envs = []

    //createEnv: 每案一組全新之資料表替身、w-serv-orm 實例(mkCore: procOrm／withTabLocks／guardWrite)、占位與 procCore
    //perm-run01: 原 kmx = pmKeyMutex() ＋ mkProcOrm 改為 mkCore(env.core.withTabLocks 供測試模擬他人持有表鎖)
    function createEnv(opt = {}) {
        let seed = opt.seed ? opt.seed(seedRows()) : seedRows()
        let woItems = {}
        for (let k of TABLE_KEYS) {
            woItems[k] = mkTable(seed[k])
        }
        let { srLog, logs } = mkSrLog()
        let cst = cacheSt()
        let core = mkCore(ds, woItems)
        let pc = autoDecl(proc(woItems, core.procOrm, { srLog, ...core.lock, lockSave: createLockSave(cst), ...(opt.proc || {}) }), woItems)
        let env = { seed, woItems, logs, cst, core, pc }
        envs.push(env)
        return env
    }

    afterEach(function() {
        envs.forEach((e) => e.cst.clear()) //停止 cacheSt 之 TTL 偵測 timer, 避免 mocha 不結束
        envs = []
    })

    let run = async (pc, table, rows, opt, userId = 'id-admin') => {
        try {
            return { ok: true, v: await pc[FN[table]](userId, rows, opt) }
        }
        catch (err) {
            return { ok: false, v: err }
        }
    }
    let rowsOf = async (woItems, table) => (await woItems[table].select()).sort((a, b) => a.order - b.order).map((v) => cloneDeep(v))
    let edit = (rows, id, patch) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r))
    let drop = (rows, ...ids) => rows.filter((r) => !ids.includes(r.id))
    let writes = (t) => t.cnt.insert + t.cnt.save + t.cnt.del + t.cnt.delAll
    let writesAll = (w) => TABLE_KEYS.reduce((a, k) => a + writes(w[k]), 0)
    let snapAll = (w) => JSON.stringify(TABLE_KEYS.map((k) => w[k].snapshot()))
    let blOf = (table, rows) => makeBaseline(rows, table) //perm-run01: 原 makeBaseline(rows, ds[table].keys) 之第 2 參改為表名
    let findLog = (logs, event) => logs.find((l) => l.event === event)
    let subset = (log, exp) => Object.fromEntries(Object.keys(exp).map((k) => [k, log[k]]))

    //expectReject: 被拒 → 回指定鍵; 四表逐位元不變且零寫入; srLog 記集中 errLog(update<Table>-error)
    async function expectReject(env, table, rows, opt, key, msg) {
        let before = snapAll(env.woItems)
        let r = await run(env.pc, table, rows, opt)
        assert.strict.deepEqual(r, ERR(key), msg)
        assert.strict.equal(snapAll(env.woItems), before, `${msg}: 四表須逐位元不變`)
        assert.strict.equal(writesAll(env.woItems), 0, `${msg}: 被拒時四表 insert／save／del／delAll 皆須為 0`)
        assert.strict.ok(env.logs.some((l) => l.level === 'error' && l.event === `${FN[table]}-error` && l.msg === key), `${msg}: 集中 errLog 應記 ${FN[table]}-error/${key}`)
        return r
    }


    // =====================================================================
    // A. 外部列守門: 各違規之整次拒收、四表零寫入、log(EXT-S1、EXT-S6)
    // =====================================================================
    describe('A 外部列守門各違規種類 × 四表', function() {

        //[標籤, key, reason, froms, 適用表, 構造送入整表之函數(table, rows, ids, env)]
        const VIOLATIONS = [
            ['新增列帶非空 from(pd)', 'saveFromNotAllowed', 'addFrom', ['pd'], TABLE_KEYS, (t, rows) => [...rows, newRow(t, { from: 'pd' })]],
            ['複製外部列繼承 from(新 id、from 仍為 pd)', 'saveFromNotAllowed', 'addFrom', ['pd'], TABLE_KEYS, (t, rows, ids) => {
                let src = rows.find((r) => r.id === ids.ext)
                return [...rows, newRow(t, { description: src.description, from: src.from })]
            }],
            ['新增列 from 為 null', 'saveFromNotAllowed', 'fromType', [], TABLE_KEYS, (t, rows) => [...rows, newRow(t, { from: null })]],
            ['新增列 from 為數字 123', 'saveFromNotAllowed', 'fromType', [], TABLE_KEYS, (t, rows) => [...rows, newRow(t, { from: 123 })]],
            ['新增列 from 為布林 true', 'saveFromNotAllowed', 'fromType', [], TABLE_KEYS, (t, rows) => [...rows, newRow(t, { from: true })]],
            ['刪除外部列', 'saveExternalRowChanged', 'del', ['pd'], TABLE_KEYS, (t, rows, ids) => drop(rows, ids.ext)],
            ['外部列 from 改為空字串', 'saveExternalRowChanged', 'fromChanged', ['pd'], TABLE_KEYS, (t, rows, ids) => edit(rows, ids.ext, { from: '' })],
            ['外部列 from 改為另一來源 pz', 'saveExternalRowChanged', 'fromChanged', ['pd'], TABLE_KEYS, (t, rows, ids) => edit(rows, ids.ext, { from: 'pz' })],
            ['外部列改說明(鎖定欄 description)', 'saveExternalRowChanged', 'fieldChanged', ['pd'], TABLE_KEYS, (t, rows, ids) => edit(rows, ids.ext, { description: 'changed-by-backend' })],
            ['外部列改身分欄(users.email／grups.name／pemis.name)', 'saveExternalRowChanged', 'fieldChanged', ['pd'], ['users', 'grups', 'pemis'], (t, rows, ids) => edit(rows, ids.ext, t === 'users' ? { email: 'pii-changed@example.com' } : { name: 'pii-renamed' })],
            ['後台列 from 改為外部來源 pz', 'saveFromNotAllowed', 'fromChanged', ['pz'], TABLE_KEYS, (t, rows, ids) => edit(rows, ids.b1, { from: 'pz' })],
        ]

        for (let t of TABLE_KEYS) {
            for (let [title, key, reason, froms, tables, mut] of VIOLATIONS) {
                if (!tables.includes(t)) {
                    continue
                }
                it(`EXT-A01 ${t}: ${title} → ${key}/${reason}, 四表零寫入`, async function() {
                    let env = createEnv()
                    let rows = mut(t, await rowsOf(env.woItems, t), IDS[t])
                    await expectReject(env, t, rows, undefined, key, title)
                    let lg = findLog(env.logs, 'updateTabItems-external-error')
                    assert.strict.ok(lg, '應記 updateTabItems-external-error')
                    assert.strict.deepEqual(subset(lg, { keyTable: 1, userId: 1, msg: 1, reason: 1, n: 1, froms: 1 }), { keyTable: t, userId: 'id-admin', msg: key, reason, n: 1, froms })
                })
            }
        }

        //EXT-A02／A02b 為 run07 修訂: 原 A02 之期望(附基準而復活外部列 → saveFromNotAllowed「守門先於基準」)為舊語意; 新規格(EXT-S4)有基準者基準先於守門——
        //草稿所依據之版本含該外部列而庫內已無(被外部同步移除)= 草稿已過期 → saveStale/rowRemoved; 無基準者無從證明過期, 由守門擋下 saveFromNotAllowed/addFrom
        for (let t of TABLE_KEYS) {
            it(`EXT-A02 ${t}: 復活外部同步已移除之外部列(庫內已無、草稿仍有且 from 為 pd), 未帶基準 → saveFromNotAllowed/addFrom(外部列守門), 零寫入`, async function() {
                let env = createEnv()
                let rows = await rowsOf(env.woItems, t)
                await env.woItems[t].del([{ id: IDS[t].ext }]) //外部同步已移除該列
                env.woItems[t].cnt.del = 0
                let r = await run(env.pc, t, rows)
                assert.strict.deepEqual(r, ERR('saveFromNotAllowed'))
                assert.strict.equal(env.woItems[t].has(IDS[t].ext), false, '不得被復活')
                assert.strict.equal(writesAll(env.woItems), 0)
                let lg = findLog(env.logs, 'updateTabItems-external-error')
                assert.strict.deepEqual(subset(lg, { msg: 1, reason: 1, froms: 1 }), { msg: 'saveFromNotAllowed', reason: 'addFrom', froms: ['pd'] })
            })

            it(`EXT-A02b ${t}: 同上而附載入基準(草稿開啟時含該外部列)→ saveStale/rowRemoved(有基準者基準先於守門: 草稿已過期), 零寫入, 不得被復活`, async function() {
                let env = createEnv()
                let rows = await rowsOf(env.woItems, t)
                await env.woItems[t].del([{ id: IDS[t].ext }])
                env.woItems[t].cnt.del = 0
                let r = await run(env.pc, t, rows, { baseline: blOf(t, rows) })
                assert.strict.deepEqual(r, ERR('saveStale'))
                assert.strict.equal(env.woItems[t].has(IDS[t].ext), false, '不得被復活')
                assert.strict.equal(writesAll(env.woItems), 0)
                assert.strict.equal(findLog(env.logs, 'updateTabItems-stale-error').reason, 'rowRemoved')
                assert.strict.equal(findLog(env.logs, 'updateTabItems-external-error'), undefined, '基準先拒收, 未走到外部列守門')
            })
        }

        it('EXT-A03 多違規於同一整表: 刪除兩個外部列(來源 pd、pe)→ 一次回 saveExternalRowChanged, log n=2、froms=[pd, pe]', async function() {
            let env = createEnv()
            let rows = drop(await rowsOf(env.woItems, 'users'), 'rid-u2', 'rid-u3')
            await expectReject(env, 'users', rows, undefined, 'saveExternalRowChanged', '刪二外部使用者')
            let lg = findLog(env.logs, 'updateTabItems-external-error')
            assert.strict.deepEqual(subset(lg, { reason: 1, n: 1, froms: 1 }), { reason: 'del', n: 2, froms: ['pd', 'pe'] })
        })

        it('EXT-A04 整次拒收不靜默忽略: 同一整表含「合法之後台列編修」與「外部列改身分欄」→ 整次拒收, 合法之編修亦不寫入', async function() {
            let env = createEnv()
            let rows = edit(edit(await rowsOf(env.woItems, 'grups'), IDS.grups.b1, { description: 'legit-edit' }), IDS.grups.ext, { name: 'pii-renamed' })
            await expectReject(env, 'grups', rows, undefined, 'saveExternalRowChanged', '混合')
            assert.strict.equal(env.woItems.grups.get(IDS.grups.b1).description, 'pii-desc-g1', '後台列編修未落地')
        })

        it('EXT-A05 外部列之指派欄、order、伺服器管理欄之變更不構成違規(有基準): users.cgrups、order 以外之欄位未動 → 可寫', async function() {
            let env = createEnv()
            let rows0 = await rowsOf(env.woItems, 'users')
            let rows = edit(rows0, 'rid-u2', { cgrups: J({ 'pii-G1': OR }) })
            assert.strict.deepEqual(await run(env.pc, 'users', rows, { baseline: blOf('users', rows0) }), OKR)
            assert.strict.equal(env.woItems.users.get('rid-u2').cgrups, J({ 'pii-G1': OR }))
        })

    })


    // =====================================================================
    // B. 外部列指派欄: 有基準可寫、無基準 saveBaselineRequired、基準過期、後台列舊行為(EXT-S1、EXT-S2)
    // =====================================================================
    describe('B 外部列指派欄與載入基準', function() {

        //各表指派欄之新值(不致觸發級聯: 非改名／刪除)
        const NEW_ASSIGN = { users: J({ 'pii-G1': OR }), grups: J({ 'pii-P1': OR, 'pii-P3': OR }), pemis: J({ [T1]: 'y', [T3]: 'y' }) }

        for (let t of ['users', 'grups', 'pemis']) {
            let col = ASSIGN[t]

            it(`EXT-B01 ${t}: 外部列改指派欄 ${col}, 附載入基準 → 成功; 僅該列寫入, from／身分欄不變、建立者與建立時間沿用、更新者為操作者`, async function() {
                let env = createEnv()
                let rows0 = await rowsOf(env.woItems, t)
                let before = env.woItems[t].get(IDS[t].ext)
                let rows = edit(rows0, IDS[t].ext, { [col]: NEW_ASSIGN[t] })
                assert.strict.deepEqual(await run(env.pc, t, rows, { baseline: blOf(t, rows0) }), OKR)
                let after = env.woItems[t].get(IDS[t].ext)
                assert.strict.equal(after[col], NEW_ASSIGN[t])
                for (let f of ['id', 'from', 'name', 'description', 'userId', 'timeCreate']) {
                    if (f in before) {
                        assert.strict.equal(after[f], before[f], `${t}.${f} 不得變動`)
                    }
                }
                assert.strict.equal(after.userIdUpdate, 'id-admin', '更新者為操作者')
                assert.strict.equal(env.woItems[t].cnt.save, 1, '只有一次 save')
                assert.strict.equal(env.woItems[t].cnt.insert + env.woItems[t].cnt.del + env.woItems[t].cnt.delAll, 0)
            })

            it(`EXT-B02 ${t}: 外部列改指派欄 ${col}, 未帶基準(舊客戶端)→ saveBaselineRequired, 四表零寫入, log=stale-error/externalAssignNoBaseline`, async function() {
                let env = createEnv()
                let rows = edit(await rowsOf(env.woItems, t), IDS[t].ext, { [col]: NEW_ASSIGN[t] })
                await expectReject(env, t, rows, undefined, 'saveBaselineRequired', `${t} 無基準`)
                let lg = findLog(env.logs, 'updateTabItems-stale-error')
                assert.strict.ok(lg)
                assert.strict.deepEqual(subset(lg, { keyTable: 1, userId: 1, msg: 1, reason: 1 }), { keyTable: t, userId: 'id-admin', msg: 'saveBaselineRequired', reason: 'externalAssignNoBaseline' })
            })

            it(`EXT-B03 ${t}: 外部列改指派欄 ${col}, 基準之該列為過期(庫內該列已被他人改過)→ saveStale/rowChanged, 零寫入`, async function() {
                let env = createEnv()
                let rows0 = await rowsOf(env.woItems, t)
                let bl = blOf(t, rows0)
                //他人(或級聯)已改該列之指派欄
                await env.woItems[t].save([{ ...rows0.find((r) => r.id === IDS[t].ext), [col]: '{"someone-else":1}' }])
                env.woItems[t].cnt.save = 0
                let rows = edit(rows0, IDS[t].ext, { [col]: NEW_ASSIGN[t] })
                await expectReject(env, t, rows, { baseline: bl }, 'saveStale', `${t} 基準過期`)
                let lg = findLog(env.logs, 'updateTabItems-stale-error')
                assert.strict.deepEqual(subset(lg, { msg: 1, reason: 1, n: 1 }), { msg: 'saveStale', reason: 'rowChanged', n: 1 })
            })

            it(`EXT-B04 ${t}: 後台列改指派欄 ${col}, 未帶基準 → 舊行為: 成功(最後寫入者勝, 不要求基準)`, async function() {
                let env = createEnv()
                let rows = edit(await rowsOf(env.woItems, t), IDS[t].b1, { [col]: NEW_ASSIGN[t] })
                assert.strict.deepEqual(await run(env.pc, t, rows), OKR)
                assert.strict.equal(env.woItems[t].get(IDS[t].b1)[col], NEW_ASSIGN[t])
            })
        }

        it('EXT-B05 targets 無指派欄: 外部標的列任何內容變更(說明)皆拒, 即使附基準; 僅後台列變更不涉外部列時無須基準', async function() {
            let env = createEnv()
            let rows0 = await rowsOf(env.woItems, 'targets')
            await expectReject(env, 'targets', edit(rows0, T2, { description: 'x' }), { baseline: blOf('targets', rows0) }, 'saveExternalRowChanged', '外部標的改說明')
            let env2 = createEnv()
            assert.strict.deepEqual(await run(env2.pc, 'targets', edit(await rowsOf(env2.woItems, 'targets'), T1, { description: 'x' })), OKR)
        })

        it('EXT-B06 外部列改指派欄且同整表亦編修後台列(附基準)→ 兩者皆寫入', async function() {
            let env = createEnv()
            let rows0 = await rowsOf(env.woItems, 'users')
            let rows = edit(edit(rows0, 'rid-u2', { cgrups: J({ 'pii-G1': OR }) }), 'rid-u1', { description: 'b1-edit' })
            assert.strict.deepEqual(await run(env.pc, 'users', rows, { baseline: blOf('users', rows0) }), OKR)
            assert.strict.equal(env.woItems.users.get('rid-u2').cgrups, J({ 'pii-G1': OR }))
            assert.strict.equal(env.woItems.users.get('rid-u1').description, 'b1-edit')
        })

        it('EXT-B07 外部列指派欄「無基準」之判定只看有無外部列 diff: 只改後台列且外部列原樣 → 成功(舊行為); 外部列僅送入重編 order 亦不誤判需基準', async function() {
            let env = createEnv()
            let rows = edit(await rowsOf(env.woItems, 'users'), 'rid-u1', { description: 'only-backend' })
            assert.strict.deepEqual(await run(env.pc, 'users', rows), OKR)
        })

    })


    // =====================================================================
    // C. 外審 B.1: 草稿基準 = 舊版, 庫內已被他人改動(EXT-S2、EXT-S4)
    // =====================================================================
    describe('C 外審 B.1 過期快照情境(草稿開啟後庫內被他人改動)', function() {

        for (let t of TABLE_KEYS) {
            let ids = IDS[t]

            it(`EXT-C01 ${t}: 草稿基準=舊版, 他人已改同一後台列; 以舊內容存檔 → saveStale/rowChanged, 零寫入, 他人之改動仍在`, async function() {
                let env = createEnv()
                let rows0 = await rowsOf(env.woItems, t)
                let bl = blOf(t, rows0)
                await env.woItems[t].save([{ ...rows0.find((r) => r.id === ids.b1), description: 'by-other-admin' }])
                env.woItems[t].cnt.save = 0
                let rows = edit(rows0, ids.b1, { description: 'client-edit' })
                await expectReject(env, t, rows, { baseline: bl }, 'saveStale', `${t} B.1`)
                assert.strict.equal(env.woItems[t].get(ids.b1).description, 'by-other-admin')
                let lg = findLog(env.logs, 'updateTabItems-stale-error')
                assert.strict.deepEqual(subset(lg, { reason: 1, n: 1 }), { reason: 'rowChanged', n: 1 })
            })

            it(`EXT-C02 ${t}: 另一端新增列後, 以舊基準(無該列)存檔而其整表不含該新列(將被刪除)→ saveStale/rowAdded, 該新列仍在`, async function() {
                let env = createEnv()
                let rows0 = await rowsOf(env.woItems, t)
                let bl = blOf(t, rows0)
                let n = newRow(t)
                delete n._isNew
                n.userId = 'rid-other'
                await env.woItems[t].insert([{ ...n, order: 9 }])
                env.woItems[t].cnt.insert = 0
                let rows = edit(rows0, ids.b1, { description: 'client-edit' })
                await expectReject(env, t, rows, { baseline: bl }, 'saveStale', `${t} 刪除他人新增之列`)
                assert.strict.equal(env.woItems[t].has(n.id), true)
                let lg = findLog(env.logs, 'updateTabItems-stale-error')
                assert.strict.equal(lg.reason, 'rowAdded')
            })

            it(`EXT-C03 ${t}: 他人在草稿之後新增之列, 草稿原樣帶回(未異動)→ 仍 saveStale/rowAdded(表級: 先動先贏, 不部分變更; run07 版為通過), 零寫入, 該列保留`, async function() {
                let env = createEnv()
                let rows0 = await rowsOf(env.woItems, t)
                let bl = blOf(t, rows0)
                let n = newRow(t)
                delete n._isNew
                n.userId = 'rid-other'
                await env.woItems[t].insert([{ ...n, order: rows0.length + 1 }]) //接在末尾(送入時依位置重給 order 後與庫內相同, 才是「原樣帶回」)
                env.woItems[t].cnt.insert = 0 //他人之寫入不計入本次存檔之寫入數
                let withN = [...rows0, (await rowsOf(env.woItems, t)).find((r) => r.id === n.id)]
                let rows = edit(withN, ids.b1, { description: 'client-edit' })
                await expectReject(env, t, rows, { baseline: bl }, 'saveStale', `${t} 他人新增列(草稿原樣帶回)`)
                assert.strict.equal(findLog(env.logs, 'updateTabItems-stale-error').reason, 'rowAdded')
                assert.strict.equal(env.woItems[t].has(n.id), true)
                assert.strict.notEqual(env.woItems[t].get(ids.b1).description, 'client-edit', '草稿之編修未落地')
            })

            it(`EXT-C04 ${t}: 復活他人已刪之後台列(草稿仍帶該列且基準有)→ saveStale/rowRemoved, 該列仍為已刪`, async function() {
                let env = createEnv()
                let rows0 = await rowsOf(env.woItems, t)
                let bl = blOf(t, rows0)
                await env.woItems[t].del([{ id: ids.b2 }]) //他人已刪後台列 b2
                env.woItems[t].cnt.del = 0
                let rows = edit(rows0, ids.b1, { description: 'client-edit' }) //草稿仍含 b2(原樣)
                await expectReject(env, t, rows, { baseline: bl }, 'saveStale', `${t} 復活`)
                assert.strict.equal(env.woItems[t].has(ids.b2), false)
                assert.strict.equal(findLog(env.logs, 'updateTabItems-stale-error').reason, 'rowRemoved')
            })

            //perm-run01: 原 order: 20 使外部列(原居第 2 位)移到最末, 名次改變——新基準把名次納入(orderKey, 原則 10), 該情境改由 EXT-C05b 釘住為 saveStale/rowReordered;
            //本案改 order 為 2.5(僅數值改變、名次不變: 仍介於 order 1 與 3 之間), 保有原意「外部同步重寫伺服器欄與 order 數值(內容未變、名次未變)不使草稿作廢」
            it(`EXT-C05 ${t}: 基準與庫內同版 → 編修成功; 外部同步重寫外部列之伺服器欄與 order 數值(內容未變、名次不變)不使草稿作廢`, async function() {
                let env = createEnv()
                let rows0 = await rowsOf(env.woItems, t)
                let bl = blOf(t, rows0)
                let ext = rows0.find((r) => r.id === ids.ext)
                await env.woItems[t].save([{ ...ext, userId: 'rid-sync', timeCreate: 'tc-new', userIdUpdate: 'rid-sync', timeUpdate: 'tu-new', order: 2.5 }]) //外部同步整來源重寫(order 數值變、名次不變)
                env.woItems[t].cnt.save = 0
                let rows = edit(rows0, ids.b1, { description: 'client-edit' }) //外部列仍帶舊伺服器欄
                assert.strict.deepEqual(await run(env.pc, t, rows, { baseline: bl }), OKR)
                assert.strict.equal(env.woItems[t].get(ids.b1).description, 'client-edit')
            })

            //perm-run01 新增(刻意語意變更, 原則 10「名次入基準」): 外部同步重寫使外部列名次改變(order 20, 移到最末)而內容未變, 持舊基準之草稿存檔 → saveStale/rowReordered, 零寫入(舊版指紋不含名次而相符)
            it(`EXT-C05b ${t}: 外部同步重寫使外部列名次改變(內容未變)→ 持舊基準之草稿 saveStale/rowReordered n=1, 零寫入, 編修未落地`, async function() {
                let env = createEnv()
                let rows0 = await rowsOf(env.woItems, t)
                let bl = blOf(t, rows0)
                let ext = rows0.find((r) => r.id === ids.ext)
                await env.woItems[t].save([{ ...ext, order: 20 }]) //外部列從第 2 位移到最末
                env.woItems[t].cnt.save = 0
                let rows = edit(rows0, ids.b1, { description: 'client-edit' })
                await expectReject(env, t, rows, { baseline: bl }, 'saveStale', `${t} 名次改變`)
                let lg = findLog(env.logs, 'updateTabItems-stale-error')
                assert.strict.deepEqual(subset(lg, { msg: 1, reason: 1, n: 1 }), { msg: 'saveStale', reason: 'rowReordered', n: 1 })
                assert.strict.notEqual(env.woItems[t].get(ids.b1).description, 'client-edit', '草稿之編修未落地')
                //對照: 以重新載入(名次已變)之基準重送 → 成功
                let fresh = await rowsOf(env.woItems, t)
                assert.strict.deepEqual(await run(env.pc, t, edit(fresh, ids.b1, { description: 'client-edit' }), { baseline: blOf(t, fresh) }, 'id-admin2'), OKR)
                assert.strict.equal(env.woItems[t].get(ids.b1).description, 'client-edit')
            })
        }

        for (let t of ['users', 'grups', 'pemis']) {
            let col = ASSIGN[t]
            it(`EXT-C06 ${t}: 草稿未動外部列、但庫內該外部列之 ${col} 已被他人改過; 草稿原樣送回(其舊值將覆寫新值)→ → 表級過期 saveStale/rowChanged(不靜默還原授權)`, async function() {
                let env = createEnv()
                let rows0 = await rowsOf(env.woItems, t)
                let bl = blOf(t, rows0)
                await env.woItems[t].save([{ ...rows0.find((r) => r.id === IDS[t].ext), [col]: '{"revoked-by-other":1}' }])
                env.woItems[t].cnt.save = 0
                let rows = edit(rows0, IDS[t].b1, { description: 'client-edit' })
                await expectReject(env, t, rows, { baseline: bl }, 'saveStale', `${t} 外部指派被他人改後送回舊值`)
                assert.strict.equal(env.woItems[t].get(IDS[t].ext)[col], '{"revoked-by-other":1}', '庫內授權不被還原')
            })
        }

        for (let t of TABLE_KEYS) {
            it(`EXT-C09 ${t}: 空基準 [](草稿開啟時無任何列; 與「未帶基準」不同)→ 表內已有列, 故編修既有列、刪除既有列、僅新增列皆 saveStale/rowAdded(表級); 空表 × 空基準則通過`, async function() {
                let env = createEnv()
                let rows0 = await rowsOf(env.woItems, t)
                await expectReject(env, t, edit(rows0, IDS[t].b1, { description: 'e' }), { baseline: [] }, 'saveStale', `${t} 空基準編修`)
                assert.strict.equal(findLog(env.logs, 'updateTabItems-stale-error').reason, 'rowAdded')
                let env2 = createEnv()
                await expectReject(env2, t, drop(await rowsOf(env2.woItems, t), IDS[t].b2), { baseline: [] }, 'saveStale', `${t} 空基準刪除`)
                assert.strict.equal(findLog(env2.logs, 'updateTabItems-stale-error').reason, 'rowAdded')
                let env3 = createEnv()
                let n = newRow(t)
                await expectReject(env3, t, [...(await rowsOf(env3.woItems, t)), n], { baseline: [] }, 'saveStale', `${t} 空基準僅新增(表內已有列)`)
                assert.strict.equal(env3.woItems[t].has(n.id), false)
                let env4 = createEnv({ seed: (sd) => ({ ...sd, [t]: [] }) })
                let n4 = newRow(t)
                assert.strict.deepEqual(await run(env4.pc, t, [n4], { baseline: [] }), OKR, `${t} 空表 × 空基準`)
                assert.strict.equal(env4.woItems[t].has(n4.id), true)
            })
        }

        //EXT-C07／C08 為 run07 修訂(U1 觀察 1; 原標題「守門先於基準」、原期望 saveExternalRowChanged／saveFromNotAllowed 為舊語意, 對使用者誤導):
        //草稿已過期(外部同步於開啟後改了外部列之內容, 或移除了該外部列)而使用者只編修後台列、基準正確 → 回 saveStale(資料已更新, 請重新載入), 零寫入
        it('EXT-C07 基準先於守門: 外部同步已改外部列之說明, 草稿以舊說明送回(使用者只編修後台列、基準正確)→ 回 saveStale/rowChanged(非 saveExternalRowChanged), 零寫入, 庫內保留同步之說明', async function() {
            let env = createEnv()
            let rows0 = await rowsOf(env.woItems, 'grups')
            let bl = blOf('grups', rows0)
            await env.woItems.grups.save([{ ...rows0.find((r) => r.id === 'rid-g2'), description: 'changed-by-sync' }])
            env.woItems.grups.cnt.save = 0
            await expectReject(env, 'grups', edit(rows0, 'rid-g1', { description: 'e' }), { baseline: bl }, 'saveStale', '外部列內容被同步改後之舊快照')
            assert.strict.equal(env.woItems.grups.get('rid-g2').description, 'changed-by-sync')
            assert.strict.equal(findLog(env.logs, 'updateTabItems-stale-error').reason, 'rowChanged')
        })

        it('EXT-C08 基準先於守門: 草稿含已被外部同步移除之外部列(使用者只編修後台列、基準正確)→ saveStale/rowRemoved(非 saveFromNotAllowed), 零寫入, 該外部列不被復活', async function() {
            let env = createEnv()
            let rows0 = await rowsOf(env.woItems, 'users')
            let bl = blOf('users', rows0)
            await env.woItems.users.del([{ id: 'rid-u3' }])
            env.woItems.users.cnt.del = 0
            await expectReject(env, 'users', edit(rows0, 'rid-u1', { description: 'e' }), { baseline: bl }, 'saveStale', '復活外部使用者')
            assert.strict.equal(env.woItems.users.has('rid-u3'), false)
            assert.strict.equal(findLog(env.logs, 'updateTabItems-stale-error').reason, 'rowRemoved')
        })

    })


    // =====================================================================
    // D. 外審 B.2: 舊客戶端無基準送回外部列之舊指派
    // =====================================================================
    describe('D 外審 B.2 舊客戶端無基準', function() {

        let revoked = async (env) => {
            //外部系統(同步)或級聯已把 u2 之群組指派收回為 {}
            let rows0 = await rowsOf(env.woItems, 'users')
            await env.woItems.users.save([{ ...rows0.find((r) => r.id === 'rid-u2'), cgrups: '{}' }])
            env.woItems.users.cnt.save = 0
            return rows0 //舊客戶端持有之舊快照(u2 仍帶舊指派)
        }

        it('EXT-D01 整表: 無基準送回外部列之舊指派(另編修後台列)→ saveBaselineRequired, 零寫入, 庫內授權(已收回)不被還原', async function() {
            let env = createEnv()
            let rows0 = await revoked(env)
            await expectReject(env, 'users', edit(rows0, 'rid-u1', { description: 'client-edit' }), undefined, 'saveBaselineRequired', 'B.2 整表')
            assert.strict.equal(env.woItems.users.get('rid-u2').cgrups, '{}')
        })

        it('EXT-D02 pickKeysOnly(modeEditUsers=for:grups): 無基準送回外部使用者之舊 cgrups → saveBaselineRequired, 庫內授權不被還原', async function() {
            let env = createEnv()
            let rows0 = await revoked(env)
            await expectReject(env, 'users', rows0, { pickKeysOnly: ['cgrups'] }, 'saveBaselineRequired', 'B.2 pickKeysOnly')
            assert.strict.equal(env.woItems.users.get('rid-u2').cgrups, '{}')
        })

        it('EXT-D03 重新載入後(以庫內現況為基底)再存 → 成功(新資料不再有外部指派差異, 無須基準)', async function() {
            let env = createEnv()
            await revoked(env)
            let fresh = await rowsOf(env.woItems, 'users')
            assert.strict.deepEqual(await run(env.pc, 'users', edit(fresh, 'rid-u1', { description: 'client-edit' })), OKR)
            assert.strict.equal(env.woItems.users.get('rid-u2').cgrups, '{}')
            assert.strict.equal(env.woItems.users.get('rid-u1').description, 'client-edit')
        })

    })


    // =====================================================================
    // E. 外部列僅伺服器管理欄不同之舊快照 → 視為無變更(EXT-S3)
    // =====================================================================
    describe('E 外部列僅伺服器管理欄不同(外部同步重寫後之舊快照)', function() {

        //外部同步整來源重寫: 外部列之建立者／建立時間／更新者／更新時間皆為較新
        let rewritten = async (env, t) => {
            let rows0 = await rowsOf(env.woItems, t) //舊快照
            let ext = rows0.find((r) => r.id === IDS[t].ext)
            await env.woItems[t].save([{ ...ext, userId: 'rid-sync', timeCreate: '2026-02-02T00:00:00.000+08:00', userIdUpdate: 'rid-sync', timeUpdate: '2026-02-02T00:00:00.000+08:00' }])
            env.woItems[t].cnt.save = 0
            return rows0
        }

        for (let t of TABLE_KEYS) {
            for (let withBaseline of [false, true]) {
                it(`EXT-E01 ${t}: 舊快照原樣送回外部列(僅伺服器欄較舊)並編修後台列, ${withBaseline ? '有' : '無'}基準 → 成功; 外部列不被改寫(建立者／建立時間／更新時間維持外部同步之新值)`, async function() {
                    let env = createEnv()
                    let rows0 = await rewritten(env, t)
                    let extBefore = env.woItems[t].get(IDS[t].ext)
                    let rows = edit(rows0, IDS[t].b1, { description: 'client-edit' })
                    let opt = withBaseline ? { baseline: blOf(t, rows0) } : undefined
                    assert.strict.deepEqual(await run(env.pc, t, rows, opt), OKR)
                    assert.strict.deepEqual(env.woItems[t].get(IDS[t].ext), extBefore, '外部列逐位元不變(含 userId／timeCreate／timeUpdate)')
                    assert.strict.equal(extBefore.userId, 'rid-sync')
                    assert.strict.equal(env.woItems[t].get(IDS[t].b1).description, 'client-edit')
                    assert.strict.equal(env.woItems[t].cnt.save, 1, '只寫後台列一次')
                })
            }
        }

        it('EXT-E02 舊快照原樣送回、無任何實質編修 → 成功且該表零寫入(外部列僅伺服器欄不同不構成寫入)', async function() {
            let env = createEnv()
            let rows0 = await rewritten(env, 'users')
            assert.strict.deepEqual(await run(env.pc, 'users', rows0), OKR)
            assert.strict.equal(writes(env.woItems.users), 0)
        })

        //run11 外審 sol 第 3 點: 前端保留未存編輯(draftSync keep)期間外部同步重寫了該外部列(內容未變、建立者／時間較新), 草稿仍持舊伺服器管理欄;
        //此時改外部列之指派欄存檔, 基準(排除伺服器管理欄)通過, 但原樣寫入會把較新之建立者／建立時間回退為舊值(同 S2). 修後: 改動之外部列改帶庫內之伺服器管理欄.
        const NEW_ASSIGN_E = { users: J({ 'pii-G1': OR }), grups: J({ 'pii-P1': OR, 'pii-P3': OR }), pemis: J({ [T1]: 'y', [T3]: 'y' }) }
        for (let t of ['users', 'grups', 'pemis']) {
            let col = ASSIGN[t]
            it(`EXT-E03 ${t}: 外部列內容未變被外部同步重寫(伺服器欄較新)後, 持舊草稿改其指派欄 ${col}(附基準)→ 成功; 指派欄為新值, 建立者／建立時間／更新者維持外部同步之新值(不回退), 更新者欄為操作者`, async function() {
                let env = createEnv()
                let rows0 = await rewritten(env, t)
                let rows = edit(rows0, IDS[t].ext, { [col]: NEW_ASSIGN_E[t] }) //rows0 之外部列仍持舊 userId／timeCreate
                assert.strict.notEqual(rows.find((r) => r.id === IDS[t].ext).userId, 'rid-sync', '前提: 草稿持舊建立者')
                assert.strict.deepEqual(await run(env.pc, t, rows, { baseline: blOf(t, rows0) }), OKR)
                let after = env.woItems[t].get(IDS[t].ext)
                assert.strict.equal(after[col], NEW_ASSIGN_E[t])
                assert.strict.equal(after.userId, 'rid-sync', '建立者不回退')
                assert.strict.equal(after.timeCreate, '2026-02-02T00:00:00.000+08:00', '建立時間不回退')
                assert.strict.equal(after.userIdUpdate, 'id-admin', '更新者為操作者(procOrm save 覆寫)')
                assert.strict.equal(env.woItems[t].cnt.save, 1)
            })
        }

        //perm-run01(寫入契約 serverOnly, 規格第 4、6 節): 原本為「後台列持舊伺服器管理欄改內容 → 以送入之列為準寫入(不介入)」, 舊行為已作廢——
        //伺服器專有欄位存檔不再採用客戶端值, 後台列亦一律取庫內值(不分外部列或後台列, 見 EXT-E03 同理); 本案改釘「後台列不回退」
        it('EXT-E04 後台列亦不採用客戶端之伺服器專有欄(perm-run01): 後台列持舊伺服器管理欄改內容 → 內容照寫, 但建立者／建立時間維持庫內較新之值(不回退為草稿之舊值)', async function() {
            let env = createEnv()
            let rows0 = await rowsOf(env.woItems, 'grups')
            let b1 = rows0.find((r) => r.id === IDS.grups.b1)
            await env.woItems.grups.save([{ ...b1, userId: 'rid-other', timeCreate: '2026-03-03T00:00:00.000+08:00' }]) //後台列之建立者被他人改(模擬庫內較新)
            env.woItems.grups.cnt.save = 0
            let rows = edit(rows0, IDS.grups.b1, { description: 'client-edit' }) //草稿持舊 userId／timeCreate
            assert.strict.notEqual(rows.find((r) => r.id === IDS.grups.b1).userId, 'rid-other', '前提: 草稿持舊建立者')
            assert.strict.deepEqual(await run(env.pc, 'grups', rows, { baseline: blOf('grups', rows0) }), OKR)
            let after = env.woItems.grups.get(IDS.grups.b1)
            assert.strict.equal(after.description, 'client-edit')
            assert.strict.equal(after.userId, 'rid-other', '後台列之建立者取庫內值(不回退為草稿之舊值)')
            assert.strict.equal(after.timeCreate, '2026-03-03T00:00:00.000+08:00', '後台列之建立時間取庫內值(不回退)')
            assert.strict.equal(after.userIdUpdate, 'id-admin', '更新者為操作者(procOrm save 覆寫)')
        })

    })


    // =====================================================================
    // F. 外部列 order 由外部擁有, 後台列 k+1(EXT-S1)
    // =====================================================================
    describe('F order', function() {

        //外部列之 order 與位置脫鉤(外部給 20／30), 後台列為 1、3…
        let seedOrder = (s) => {
            for (let t of TABLE_KEYS) {
                s[t].forEach((r) => {
                    if (r.from !== '') {
                        r.order = 20 + s[t].indexOf(r) * 10
                    }
                })
            }
            return s
        }

        //expectedOrder: 規格 —— 庫內外部列維持庫內 order; 其餘列 order = 送入位置 + 1
        let expectedOrder = (sent, dbBefore) => Object.fromEntries(sent.map((r, k) => {
            let o = dbBefore.get(r.id)
            return [r.id, (o && o.from !== '') ? o.order : k + 1]
        }))

        for (let t of TABLE_KEYS) {
            it(`EXT-F01 ${t}: 外部列移到清單最前再存 → 外部列 order 維持庫內值(不重編、不被寫入、不須基準), 後台列 order = 位置 + 1`, async function() {
                let env = createEnv({ seed: seedOrder })
                let db = new Map((await rowsOf(env.woItems, t)).map((r) => [r.id, r]))
                let rows = await rowsOf(env.woItems, t)
                let sent = [...rows.filter((r) => r.from !== ''), ...rows.filter((r) => r.from === '')] //外部列們在前
                assert.strict.deepEqual(await run(env.pc, t, cloneDeep(sent)), OKR, '外部列之 order 不得被視為 diff(否則須基準)')
                let exp = expectedOrder(sent, db)
                for (let r of sent) {
                    assert.strict.equal(env.woItems[t].get(r.id).order, exp[r.id], `${t}.${r.id} order`)
                }
                for (let r of sent.filter((x) => x.from !== '')) {
                    assert.strict.deepEqual(env.woItems[t].get(r.id), db.get(r.id), `外部列 ${r.id} 逐位元不變(未被寫入)`)
                }
            })

            it(`EXT-F02 ${t}: lockExternalRows:false(舊行為)外部列亦被重編為位置 + 1`, async function() {
                let env = createEnv({ seed: seedOrder, proc: { lockExternalRows: false } })
                let rows = await rowsOf(env.woItems, t)
                let sent = [...rows.filter((r) => r.from !== ''), ...rows.filter((r) => r.from === '')]
                assert.strict.deepEqual(await run(env.pc, t, cloneDeep(sent)), OKR)
                sent.forEach((r, k) => {
                    assert.strict.equal(env.woItems[t].get(r.id).order, k + 1, `${t}.${r.id} 舊行為重編`)
                })
            })

            it(`EXT-F03 ${t}: 外部列居中、後台列前後各一 → 外部列維持原 order, 前後後台列 = 位置 + 1(原位置即不變者不被寫入)`, async function() {
                let env = createEnv({ seed: seedOrder })
                let rows = await rowsOf(env.woItems, t) //依 order: 後台列們在前(1、3…), 外部列(20…)在後
                let db = new Map(rows.map((r) => [r.id, r]))
                let ext = rows.filter((r) => r.from !== '')
                let bk = rows.filter((r) => r.from === '')
                let sent = [bk[0], ...ext, ...bk.slice(1)]
                assert.strict.deepEqual(await run(env.pc, t, cloneDeep(sent)), OKR)
                let exp = expectedOrder(sent, db)
                for (let r of sent) {
                    assert.strict.equal(env.woItems[t].get(r.id).order, exp[r.id])
                }
            })
        }

    })


    // =====================================================================
    // G. modeEditUsers(pickKeysOnly)路徑與用戶端 opt 之採納(EXT-S7)
    // =====================================================================
    describe('G pickKeysOnly 與用戶端 opt', function() {

        it('EXT-G01 pickKeysOnly + 基準: 外部使用者改 cgrups → 成功; 同列之 name／email／from 變更不被採納(資料庫為準)、新增列不採納、缺列不刪除', async function() {
            let env = createEnv()
            let rows0 = await rowsOf(env.woItems, 'users')
            let rows = edit(drop(rows0, 'rid-u4'), 'rid-u2', { cgrups: J({ 'pii-G1': OR }), name: 'pii-ignored', email: 'pii-ignored@example.com', from: 'pz' })
            rows = [...rows, newRow('users')]
            assert.strict.deepEqual(await run(env.pc, 'users', rows, { pickKeysOnly: ['cgrups'], baseline: blOf('users', rows0) }), OKR)
            let u2 = env.woItems.users.get('rid-u2')
            assert.strict.equal(u2.cgrups, J({ 'pii-G1': OR }))
            assert.strict.equal(u2.name, 'pii-name-u2')
            assert.strict.equal(u2.email, 'pii-u2@example.com')
            assert.strict.equal(u2.from, 'pd')
            assert.strict.equal(env.woItems.users.has('rid-u4'), true, '缺列不刪除')
            assert.strict.equal(env.woItems.users.size(), 4, '新增列不採納')
        })

        it('EXT-G02 pickKeysOnly 無基準: 外部使用者改 cgrups → saveBaselineRequired, 零寫入', async function() {
            let env = createEnv()
            let rows = edit(await rowsOf(env.woItems, 'users'), 'rid-u2', { cgrups: J({ 'pii-G1': OR }) })
            await expectReject(env, 'users', rows, { pickKeysOnly: ['cgrups'] }, 'saveBaselineRequired', 'G02')
        })

        it('EXT-G03 pickKeysOnly + 過期基準(庫內該外部使用者已被改)→ saveStale/rowChanged, 零寫入', async function() {
            let env = createEnv()
            let rows0 = await rowsOf(env.woItems, 'users')
            let bl = blOf('users', rows0)
            await env.woItems.users.save([{ ...rows0.find((r) => r.id === 'rid-u2'), cgrups: '{"x":1}' }])
            env.woItems.users.cnt.save = 0
            let rows = edit(rows0, 'rid-u2', { cgrups: J({ 'pii-G1': OR }) })
            await expectReject(env, 'users', rows, { pickKeysOnly: ['cgrups'], baseline: bl }, 'saveStale', 'G03')
            assert.strict.equal(findLog(env.logs, 'updateTabItems-stale-error').reason, 'rowChanged')
        })

        it('EXT-G04 pickKeysOnly: 後台使用者改 cgrups 無基準 → 成功(舊行為); 基準缺該列之項(基準由過濾後之清單產生)而該列有 diff → saveStale', async function() {
            let env = createEnv()
            assert.strict.deepEqual(await run(env.pc, 'users', edit(await rowsOf(env.woItems, 'users'), 'rid-u4', { cgrups: J({ 'pii-G1': OR }) }), { pickKeysOnly: ['cgrups'] }), OKR)
            let env2 = createEnv()
            let rows0 = await rowsOf(env2.woItems, 'users')
            let bl = blOf('users', drop(rows0, 'rid-u2'))
            await expectReject(env2, 'users', edit(rows0, 'rid-u2', { cgrups: '{}' }), { pickKeysOnly: ['cgrups'], baseline: bl }, 'saveStale', 'G04')
        })

        it('EXT-G05 pickKeysOnly: 無任何 cgrups 差異(只動被忽略之欄位)→ 成功且零寫入(外部列之身分欄變更被忽略而非拒收, 屬 modeEditUsers 之既有設計)', async function() {
            let env = createEnv()
            let rows = edit(await rowsOf(env.woItems, 'users'), 'rid-u2', { name: 'pii-ignored', isAdmin: 'y' })
            assert.strict.deepEqual(await run(env.pc, 'users', rows, { pickKeysOnly: ['cgrups'] }), OKR)
            assert.strict.equal(writes(env.woItems.users), 0)
            assert.strict.equal(env.woItems.users.get('rid-u2').isAdmin, 'n')
        })

        //EXT-G11(perm-run01 新增; 取代原 SITE-EX-011 對 `{ baseline: optClient.baseline }` 之字面釘住): 用戶端 opt 只採納 baseline 與 returnRows(=== true), 其餘鍵一律不採納(pickClientOpt 為 kpFunExt 與 procCore 共用之單點)
        it('EXT-G11 pickClientOpt: 只採 baseline(非 null／undefined)與 returnRows(僅 true); pickKeysOnly／mustExist／lockExternalRows／cascadeRename／mappingBy 等鍵與非 true 之 returnRows 一律不採納', function() {
            let bl = [['a', 'h1:0123456789abcd']]
            assert.strict.deepEqual(pickClientOpt({ baseline: bl, returnRows: true, pickKeysOnly: ['x'], mustExist: true, lockExternalRows: false, cascadeRename: false, mappingBy: 'name', merge: false }), { baseline: bl, returnRows: true })
            assert.strict.deepEqual(pickClientOpt({ baseline: null, returnRows: 'true', pickKeysOnly: ['x'] }), {}, 'baseline null 視同未給; returnRows 非布林 true 不採納')
            assert.strict.deepEqual(pickClientOpt({ returnRows: 1 }), {})
            for (let bad of [undefined, null, 'x', 0, [], () => 1]) {
                assert.strict.deepEqual(pickClientOpt(bad), {}, `opt 非物件(${typeof bad})視同空`)
            }
        })

        for (let t of ['targets', 'pemis', 'grups']) {
            it(`EXT-G10 ${t}: 用戶端 opt 只採納 baseline——即使給 pickKeysOnly／lockExternalRows:false／cascadeRename:false, 仍為整表 diff 且守門照常`, async function() {
                let env = createEnv()
                let rows0 = await rowsOf(env.woItems, t)
                let hostile = { baseline: blOf(t, rows0), pickKeysOnly: ['x'], lockExternalRows: false, cascadeRename: false, mappingBy: 'name' }
                //①外部列改說明仍被拒(lockExternalRows:false 不被採納)
                await expectReject(env, t, edit(rows0, IDS[t].ext, { description: 'x' }), hostile, 'saveExternalRowChanged', `${t} hostile opt`)
                //②缺列仍為刪除(pickKeysOnly 不被採納, 否則缺列會被忽略)
                let env2 = createEnv()
                let rows1 = await rowsOf(env2.woItems, t)
                assert.strict.deepEqual(await run(env2.pc, t, drop(rows1, IDS[t].b2), { baseline: blOf(t, rows1), pickKeysOnly: ['x'] }), OKR)
                assert.strict.equal(env2.woItems[t].has(IDS[t].b2), false)
            })
        }

    })


    // =====================================================================
    // H. lockExternalRows:false 之舊行為迴歸(EXT-S1: 僅保留 from 型別檢查)
    // =====================================================================
    describe('H lockExternalRows:false 迴歸(舊行為)', function() {

        const OFF = { proc: { lockExternalRows: false } }

        for (let t of TABLE_KEYS) {
            it(`EXT-H01 ${t}: 可改外部列之身分欄(說明)`, async function() {
                let env = createEnv(OFF)
                assert.strict.deepEqual(await run(env.pc, t, edit(await rowsOf(env.woItems, t), IDS[t].ext, { description: 'changed-by-backend' })), OKR)
                assert.strict.equal(env.woItems[t].get(IDS[t].ext).description, 'changed-by-backend')
            })

            it(`EXT-H02 ${t}: 可刪除外部列(含連帶清理)`, async function() {
                let env = createEnv(OFF)
                assert.strict.deepEqual(await run(env.pc, t, drop(await rowsOf(env.woItems, t), IDS[t].ext)), OKR)
                assert.strict.equal(env.woItems[t].has(IDS[t].ext), false)
            })

            it(`EXT-H03 ${t}: 可新增 from 為非空字串之列`, async function() {
                let env = createEnv(OFF)
                let n = newRow(t, { from: 'pd' })
                assert.strict.deepEqual(await run(env.pc, t, [...(await rowsOf(env.woItems, t)), n]), OKR)
                assert.strict.equal(env.woItems[t].get(n.id).from, 'pd')
            })

            it(`EXT-H04 ${t}: 可改外部列之 from(含改為空字串)與後台列改為外部來源`, async function() {
                let env = createEnv(OFF)
                let rows = edit(edit(await rowsOf(env.woItems, t), IDS[t].ext, { from: '' }), IDS[t].b1, { from: 'pz' })
                assert.strict.deepEqual(await run(env.pc, t, rows), OKR)
                assert.strict.equal(env.woItems[t].get(IDS[t].ext).from, '')
                assert.strict.equal(env.woItems[t].get(IDS[t].b1).from, 'pz')
            })

            it(`EXT-H05 ${t}: 非字串 from 之新增仍拒(saveFromNotAllowed, 零寫入; from 型別檢查不論 lockExternalRows)`, async function() {
                let env = createEnv(OFF)
                let rows = [...(await rowsOf(env.woItems, t)), newRow(t, { from: 123 })]
                await expectReject(env, t, rows, undefined, 'saveFromNotAllowed', `${t} OFF 非字串 from`)
                assert.strict.equal(findLog(env.logs, 'updateTabItems-external-error').reason, 'fromType')
            })
        }

        it('EXT-H06 無基準而改外部列指派欄 → 成功(saveBaselineRequired 屬守門之一, 舊行為不要求)', async function() {
            let env = createEnv(OFF)
            assert.strict.deepEqual(await run(env.pc, 'users', edit(await rowsOf(env.woItems, 'users'), 'rid-u2', { cgrups: '{}' })), OKR)
            assert.strict.equal(env.woItems.users.get('rid-u2').cgrups, '{}')
        })

        //perm-run01(寫入契約 serverOnly): 原本為「關閉後不做外部列僅伺服器管理欄不同視為無變更 → 舊快照送回之外部列照舊被寫入(建立者／建立時間回退為快照值)」,
        //該舊行為已作廢: dropServerOnlyDiff／restoreServerFields 改為不分外部列或後台列、亦不論 lockExternalRows 一律套用(all: true), 伺服器專有欄位不採用客戶端值
        it('EXT-H08 伺服器專有欄位不採用客戶端值與 lockExternalRows 開關無關(perm-run01): 關閉後舊快照送回之外部列(僅伺服器管理欄較舊)仍視為無變更 → 零寫入, 建立者／建立時間維持庫內較新之值(不回退)', async function() {
            let env = createEnv(OFF)
            let rows0 = await rowsOf(env.woItems, 'grups') //舊快照
            let ext = rows0.find((r) => r.id === 'rid-g2')
            await env.woItems.grups.save([{ ...ext, userId: 'rid-sync', timeCreate: '2026-02-02T00:00:00.000+08:00' }]) //外部同步之後, 庫內建立者／建立時間較新
            env.woItems.grups.cnt.save = 0
            assert.strict.deepEqual(await run(env.pc, 'grups', rows0), OKR)
            assert.strict.equal(env.woItems.grups.cnt.save, 0, '僅伺服器專有欄不同之列視為無變更, 不寫入')
            assert.strict.equal(env.woItems.grups.get('rid-g2').userId, 'rid-sync', '建立者維持庫內值(不回退為舊快照之值)')
            assert.strict.equal(env.woItems.grups.get('rid-g2').timeCreate, '2026-02-02T00:00:00.000+08:00', '建立時間維持庫內值(不回退)')
        })

        it('EXT-H07 基準仍被檢查(與守門開關無關): 過期基準 → saveStale; 壞格式基準 → saveBaselineFormat(perm-run01: 原 saveRowFieldInvalid)', async function() {
            let env = createEnv(OFF)
            let rows0 = await rowsOf(env.woItems, 'grups')
            let bl = blOf('grups', rows0)
            await env.woItems.grups.save([{ ...rows0[0], description: 'by-other' }])
            env.woItems.grups.cnt.save = 0
            await expectReject(env, 'grups', edit(rows0, 'rid-g1', { description: 'mine' }), { baseline: bl }, 'saveStale', 'OFF 過期')
            await expectReject(env, 'grups', rows0, { baseline: 'garbage' }, 'saveBaselineFormat', 'OFF 壞基準')
        })

    })


    // =====================================================================
    // I. from 型別: 歷史非字串 from 之列(EXT-S1)
    // =====================================================================
    describe('I 歷史非字串 from', function() {

        let seedNull = (s) => {
            for (let t of TABLE_KEYS) {
                s[t].find((r) => r.id === IDS[t].b2).from = null //歷史資料: from 為 null(後台寫入; 非字串 from 必為後台列)
            }
            return s
        }

        for (let lock of [true, false]) {
            for (let t of TABLE_KEYS) {
                it(`EXT-I01 ${t}: 歷史 from:null 之列原樣送回並改他欄 → 不拒(lockExternalRows:${lock}), 編修落地`, async function() {
                    let env = createEnv({ seed: seedNull, proc: { lockExternalRows: lock } })
                    let rows = edit(await rowsOf(env.woItems, t), IDS[t].b2, { description: 'edited' })
                    assert.strict.equal(rows.find((r) => r.id === IDS[t].b2).from, null, '前提: 送入列之 from 為 null')
                    assert.strict.deepEqual(await run(env.pc, t, rows), OKR)
                    assert.strict.equal(env.woItems[t].get(IDS[t].b2).description, 'edited')
                })
            }
        }

        for (let t of TABLE_KEYS) {
            it(`EXT-I02 ${t}: 歷史 from:null 之列改成 ''(正規化)→ 不拒, 庫內 from 變為 ''; 改成非空 pz → saveFromNotAllowed(後台列不得改成外部)`, async function() {
                let env = createEnv({ seed: seedNull })
                assert.strict.deepEqual(await run(env.pc, t, edit(await rowsOf(env.woItems, t), IDS[t].b2, { from: '' })), OKR)
                assert.strict.equal(env.woItems[t].get(IDS[t].b2).from, '')
                let env2 = createEnv({ seed: seedNull })
                await expectReject(env2, t, edit(await rowsOf(env2.woItems, t), IDS[t].b2, { from: 'pz' }), undefined, 'saveFromNotAllowed', `${t} null→pz`)
            })

            it(`EXT-I03 ${t}: 新增列缺 from 欄 → 視為 ''(成功, 庫內 from 為 '')`, async function() {
                let env = createEnv()
                let n = newRow(t)
                delete n.from
                assert.strict.deepEqual(await run(env.pc, t, [...(await rowsOf(env.woItems, t)), n]), OKR)
                assert.strict.equal(env.woItems[t].get(n.id).from, '')
            })

            it(`EXT-I04 ${t}: 歷史 from:null 之列可被刪除(非字串 from 屬後台列, 外部列保護不適用)`, async function() {
                let env = createEnv({ seed: seedNull })
                assert.strict.deepEqual(await run(env.pc, t, drop(await rowsOf(env.woItems, t), IDS[t].b2)), OKR)
                assert.strict.equal(env.woItems[t].has(IDS[t].b2), false)
            })
        }

    })


    // =====================================================================
    // J. 基準格式不合
    // =====================================================================
    describe('J 基準格式', function() {

        const BAD = [
            ['字串', 'garbage'],
            ['空字串', ''],
            ['數字 0', 0],
            ['布林 false', false],
            ['空物件', {}],
            ['元素非陣列', ['a']],
            ['元素長度 1', [['a']]],
            ['元素長度 3', [['a', 'b', 'c']]],
            ['id 為數字', [[1, 'x']]],
            ['含 null 元素', [['a', 'b'], null]],
            //perm-run01 新增: 格式形似而非 h1 者(isBaselineValid: 'h1:' 加 14 位小寫 16 進位)
            ['摘要為不識之版本前綴(h2:)', [['a', 'h2:0123456789abcd']]],
            ['摘要為 h1: 但十六進位長度不足', [['a', 'h1:abc']]],
            ['摘要為 h1: 但為大寫十六進位', [['a', 'h1:0123456789ABCD']]],
        ]
        //perm-run01: 基準格式不識改回 saveBaselineFormat(原 saveRowFieldInvalid), srLog 事件由 updateTabItems-validate-error/baselineInvalid
        //改為 updateTabItems-stale-error(msg saveBaselineFormat, reason baselineFormat, n 0; 無 row 欄); 仍於任何讀寫之前拒收、四表零寫入
        let expectBadFormat = (lg, t) => {
            assert.strict.ok(lg, '應記 updateTabItems-stale-error')
            assert.strict.deepEqual(subset(lg, { keyTable: 1, userId: 1, msg: 1, reason: 1, n: 1 }), { keyTable: t, userId: 'id-admin', msg: 'saveBaselineFormat', reason: 'baselineFormat', n: 0 })
        }
        for (let t of TABLE_KEYS) {
            for (let [title, bl] of BAD) {
                it(`EXT-J01 ${t}: 壞基準(${title})→ saveBaselineFormat, 四表零寫入, log stale-error reason=baselineFormat`, async function() {
                    let env = createEnv()
                    let rows = edit(await rowsOf(env.woItems, t), IDS[t].b1, { description: 'e' })
                    await expectReject(env, t, rows, { baseline: bl }, 'saveBaselineFormat', `${t} 壞基準 ${title}`)
                    expectBadFormat(findLog(env.logs, 'updateTabItems-stale-error'), t)
                    assert.strict.equal(findLog(env.logs, 'updateTabItems-validate-error'), undefined, '不再記 validate-error/baselineInvalid')
                })
            }

            //EXT-J04(perm-run01 新增, 舊格式基準專案): 套內舊版指紋(base36 字串, 無 'h1:' 前綴)之基準, 結構完全正確([[id, 指紋]], 每列一項、id 不重複、與庫內整表一一對應)——
            //一律拒收 saveBaselineFormat(提示重新載入), 不得降級為「未帶基準」(降級則外部列指派欄/後台列編修會被放行為最後寫入者勝)、不得誤判為 saveStale 或 saveRowFieldInvalid; 零寫入、編修未落地
            it(`EXT-J04 ${t}: 舊版指紋基準(結構正確、摘要為 base36 無 h1: 前綴)→ saveBaselineFormat, 不降級為不帶基準, 零寫入, log reason=baselineFormat`, async function() {
                let env = createEnv()
                let rows0 = await rowsOf(env.woItems, t)
                let legacy = blOf(t, rows0).map(([id, d]) => [id, parseInt(d.slice(3), 16).toString(36)]) //新基準逐項改寫成舊版 base36 形狀
                assert.strict.ok(legacy.length === rows0.length && legacy.every((e) => /^[0-9a-z]+$/.test(e[1])), '前提: 每列一項、摘要為 base36')
                let rows = edit(rows0, IDS[t].b1, { description: 'e-legacy' })
                await expectReject(env, t, rows, { baseline: legacy }, 'saveBaselineFormat', `${t} 舊版指紋基準`)
                expectBadFormat(findLog(env.logs, 'updateTabItems-stale-error'), t)
                assert.strict.notEqual(env.woItems[t].get(IDS[t].b1).description, 'e-legacy', '編修未落地(未降級為不帶基準)')
            })

            it(`EXT-J02 ${t}: baseline 為 null 或未給 → 視為舊客戶端(不拒; 後台列編修成功)`, async function() {
                let env = createEnv()
                assert.strict.deepEqual(await run(env.pc, t, edit(await rowsOf(env.woItems, t), IDS[t].b1, { description: 'e1' }), { baseline: null }), OKR)
                assert.strict.deepEqual(await run(env.pc, t, edit(await rowsOf(env.woItems, t), IDS[t].b1, { description: 'e2' }), {}, 'id-admin2'), OKR)
                assert.strict.equal(env.woItems[t].get(IDS[t].b1).description, 'e2')
            })

            //EXT-J03(run07 外審 sol R8): 同 id 於基準重複出現 = 矛盾之基準, 不論指紋同異與次序, 一律拒收、四表零寫入(perm-run01: 鍵改為 saveBaselineFormat, reason baselineFormat; 原 saveRowFieldInvalid/baselineInvalid);
            //修正前 isBaselineValid 接受, checkBaseline 之 Map 取最後一項, 故 [[id,舊版],[id,現版]] 通過、次序交換後卻回 saveStale(結果由次序決定)
            for (let [title, mk] of [
                ['同指紋重複', (id, d0, d1) => [[id, d1], [id, d1]]],
                ['異指紋(舊版在前、庫內現版在後; 修正前會通過)', (id, d0, d1) => [[id, d0], [id, d1]]],
                ['異指紋(庫內現版在前、舊版在後; 修正前回 saveStale)', (id, d0, d1) => [[id, d1], [id, d0]]],
            ]) {
                it(`EXT-J03 ${t}: 基準同 id 重複(${title})→ saveBaselineFormat, 四表零寫入, log stale-error reason=baselineFormat, 後台列合法編修亦不寫入`, async function() {
                    let env = createEnv()
                    let rows0 = await rowsOf(env.woItems, t)
                    let row = rows0.find((v) => v.id === IDS[t].b1)
                    let d1 = blOf(t, [row])[0][1]
                    let d0 = blOf(t, [{ ...row, description: 'older-description' }])[0][1]
                    assert.strict.notEqual(d0, d1, '前提: 舊版與現版指紋相異')
                    let others = blOf(t, rows0.filter((v) => v.id !== IDS[t].b1))
                    let bl = [...others, ...mk(IDS[t].b1, d0, d1)]
                    let rows = edit(rows0, IDS[t].b1, { description: 'e-dup' })
                    await expectReject(env, t, rows, { baseline: bl }, 'saveBaselineFormat', `${t} 基準同 id 重複 ${title}`)
                    expectBadFormat(findLog(env.logs, 'updateTabItems-stale-error'), t)
                    assert.strict.equal(env.woItems[t].get(IDS[t].b1).description, row.description, '後台列未被寫入')
                })
            }

            it(`EXT-J03b ${t}: 對照: 同一情境基準 id 不重複(每列一項, 現版指紋)→ 成功(證明 EXT-J03 之拒收確由「重複」而來, 非夾具本身不合法)`, async function() {
                let env = createEnv()
                let rows0 = await rowsOf(env.woItems, t)
                let rows = edit(rows0, IDS[t].b1, { description: 'e-ok' })
                assert.strict.deepEqual(await run(env.pc, t, rows, { baseline: blOf(t, rows0) }), OKR)
                assert.strict.equal(env.woItems[t].get(IDS[t].b1).description, 'e-ok')
            })
        }

    })


    // =====================================================================
    // K. 引用連帶 × 守門(EXT-S5)
    // =====================================================================
    describe('K 引用連帶與守門之交互', function() {

        it('EXT-K01 後台群組(g1)改名 → 級聯改寫引用它之外部使用者(u2)之 cgrups: 成功; u2 之 from／name／email 不變, 引用端改寫不受守門影響', async function() {
            let env = createEnv()
            let rows = edit(await rowsOf(env.woItems, 'grups'), 'rid-g1', { name: 'pii-G1x' })
            assert.strict.deepEqual(await run(env.pc, 'grups', rows), OKR)
            let u2 = env.woItems.users.get('rid-u2')
            assert.strict.deepEqual(JSON.parse(u2.cgrups), { 'pii-G1x': OR, 'pii-G2': OR })
            assert.strict.equal(u2.from, 'pd')
            assert.strict.equal(u2.name, 'pii-name-u2')
            assert.strict.equal(u2.email, 'pii-u2@example.com')
            assert.strict.equal(u2.userId, 'rid-seed', '建立者沿用')
            assert.strict.equal(u2.userIdUpdate, 'id-admin', '更新者為操作者')
            assert.strict.deepEqual(JSON.parse(env.woItems.users.get('rid-u1').cgrups), { 'pii-G1x': OR })
        })

        it('EXT-K02 後台群組(g1)刪除 → 連帶清理外部使用者(u2)之引用: 成功, u2 之 G2 引用保留', async function() {
            let env = createEnv()
            assert.strict.deepEqual(await run(env.pc, 'grups', drop(await rowsOf(env.woItems, 'grups'), 'rid-g1')), OKR)
            assert.strict.deepEqual(JSON.parse(env.woItems.users.get('rid-u2').cgrups), { 'pii-G2': OR })
            assert.strict.equal(env.woItems.users.get('rid-u2').from, 'pd')
        })

        it('EXT-K03 外部群組(g2)被後台改名 → saveExternalRowChanged; 引用端(users)零寫入、u2 引用仍為舊名', async function() {
            let env = createEnv()
            await expectReject(env, 'grups', edit(await rowsOf(env.woItems, 'grups'), 'rid-g2', { name: 'pii-G2x' }), undefined, 'saveExternalRowChanged', 'K03')
            assert.strict.equal(writes(env.woItems.users), 0)
            assert.strict.deepEqual(JSON.parse(env.woItems.users.get('rid-u2').cgrups), { 'pii-G1': OR, 'pii-G2': OR })
        })

        it('EXT-K04 外部群組(g2)被後台刪除 → saveExternalRowChanged; 引用端零寫入、引用不被清理', async function() {
            let env = createEnv()
            await expectReject(env, 'grups', drop(await rowsOf(env.woItems, 'grups'), 'rid-g2'), undefined, 'saveExternalRowChanged', 'K04')
            assert.strict.equal(JSON.parse(env.woItems.users.get('rid-u2').cgrups)['pii-G2'] !== undefined, true)
        })

        it('EXT-K05 外部權限(p2)改名／刪除、外部標的(T2)刪除 → 皆 saveExternalRowChanged, 引用端(grups／pemis)零寫入', async function() {
            let env = createEnv()
            await expectReject(env, 'pemis', edit(await rowsOf(env.woItems, 'pemis'), 'rid-p2', { name: 'pii-P2x' }), undefined, 'saveExternalRowChanged', 'K05 改名')
            await expectReject(env, 'pemis', drop(await rowsOf(env.woItems, 'pemis'), 'rid-p2'), undefined, 'saveExternalRowChanged', 'K05 刪權限')
            await expectReject(env, 'targets', drop(await rowsOf(env.woItems, 'targets'), T2), undefined, 'saveExternalRowChanged', 'K05 刪標的')
        })

        it('EXT-K06 級聯改寫外部使用者之 cgrups 後, 級聯前開啟之 users 草稿(舊基準)再存該使用者之指派 → saveStale(基準因級聯而失效); 級聯後重開之草稿可存', async function() {
            let env = createEnv()
            let rowsBefore = await rowsOf(env.woItems, 'users')
            let blOld = blOf('users', rowsBefore)
            assert.strict.deepEqual(await run(env.pc, 'grups', edit(await rowsOf(env.woItems, 'grups'), 'rid-g1', { name: 'pii-G1x' })), OKR, '前提: 他人改群組名(級聯改寫 u1／u2)')
            let stale = edit(rowsBefore, 'rid-u2', { cgrups: J({ 'pii-G2': OR }) })
            let before = snapAll(env.woItems)
            assert.strict.deepEqual(await run(env.pc, 'users', stale, { baseline: blOld }, 'id-admin2'), ERR('saveStale'))
            assert.strict.equal(snapAll(env.woItems), before)
            let fresh = await rowsOf(env.woItems, 'users')
            assert.strict.deepEqual(await run(env.pc, 'users', edit(fresh, 'rid-u2', { cgrups: J({ 'pii-G2': OR }) }), { baseline: blOf('users', fresh) }, 'id-admin3'), OKR)
        })

    })


    // =====================================================================
    // L. srLog 內容(EXT-S6)
    // =====================================================================
    describe('L srLog', function() {

        let allowed = ['level', 'event', 'keyTable', 'userId', 'msg', 'reason', 'n', 'froms']
        let hasSentinel = (logs) => {
            let s = JSON.stringify(logs)
            return SENTINELS.filter((x) => s.includes(x))
        }

        it('EXT-L01 external-error: 鍵集合限定為 keyTable／userId／msg／reason／n／froms(含 level／event); froms 為來源名稱; 不含列 id、名稱、email、說明之值', async function() {
            for (let t of TABLE_KEYS) {
                let env = createEnv()
                await run(env.pc, t, edit(await rowsOf(env.woItems, t), IDS[t].ext, { description: 'pii-desc-leak-check' }))
                let lg = findLog(env.logs, 'updateTabItems-external-error')
                assert.strict.ok(lg, t)
                assert.strict.deepEqual(Object.keys(lg).filter((k) => !allowed.includes(k)), [], `${t} 不應有其他鍵`)
                assert.strict.deepEqual(lg.froms, ['pd'])
                assert.strict.deepEqual(hasSentinel(env.logs), [], `${t} srLog 不得含列 id／名稱／email／說明之值`)
            }
        })

        it('EXT-L02 stale-error: 鍵集合限定; 不含個資(含 saveStale 與 saveBaselineRequired 兩種)', async function() {
            let env = createEnv()
            let rows0 = await rowsOf(env.woItems, 'users')
            let bl = blOf('users', rows0)
            await env.woItems.users.save([{ ...rows0[0], description: 'by-other' }])
            await run(env.pc, 'users', edit(rows0, 'rid-u1', { description: 'mine' }), { baseline: bl })
            await run(env.pc, 'users', edit(rows0, 'rid-u2', { cgrups: '{}' }), undefined, 'id-admin2')
            let logs = env.logs.filter((l) => l.event === 'updateTabItems-stale-error')
            assert.strict.equal(logs.length, 2)
            assert.strict.deepEqual(logs.map((l) => l.msg), ['saveStale', 'saveBaselineRequired'])
            for (let lg of logs) {
                assert.strict.deepEqual(Object.keys(lg).filter((k) => !allowed.includes(k)), [], '不應有其他鍵')
            }
            assert.strict.deepEqual(hasSentinel(env.logs), [])
        })

        it('EXT-L03 baselineFormat(perm-run01: 原 baselineInvalid)／守門／級聯各路徑之全部 srLog(含 info)皆不含列 id、名稱、email 之值', async function() {
            let env = createEnv()
            await run(env.pc, 'grups', edit(await rowsOf(env.woItems, 'grups'), 'rid-g2', { name: 'x' }))
            await run(env.pc, 'grups', await rowsOf(env.woItems, 'grups'), { baseline: 'bad' })
            await run(env.pc, 'users', edit(await rowsOf(env.woItems, 'users'), 'rid-u2', { cgrups: '{}' }), { pickKeysOnly: ['cgrups'] })
            assert.strict.ok(env.logs.length >= 3)
            assert.strict.deepEqual(hasSentinel(env.logs), [])
        })

        it('EXT-L04 守門被拒之 errLog 事件(update<Table>-error)只含 userId 與錯誤鍵', async function() {
            let env = createEnv()
            await run(env.pc, 'pemis', drop(await rowsOf(env.woItems, 'pemis'), 'rid-p2'))
            let lg = findLog(env.logs, 'updatePemis-error')
            assert.strict.deepEqual(lg, { level: 'error', event: 'updatePemis-error', userId: 'id-admin', msg: 'saveExternalRowChanged' })
        })

    })


    // =====================================================================
    // M. 並行: 比對於表鎖內(EXT-S4)
    // =====================================================================
    describe('M 並行與鎖內比對', function() {

        it('EXT-M01 同表兩操作者以同一基準並行編修同一後台列 → 恰一次成功、另一次 saveStale; 終態為成功者之內容', async function() {
            let env = createEnv()
            let rows0 = await rowsOf(env.woItems, 'grups')
            let bl = blOf('grups', rows0)
            let [a, b] = await Promise.all([
                run(env.pc, 'grups', edit(rows0, 'rid-g1', { description: 'from-A' }), { baseline: bl }, 'id-opA'),
                run(env.pc, 'grups', edit(rows0, 'rid-g1', { description: 'from-B' }), { baseline: bl }, 'id-opB'),
            ])
            let oks = [a, b].filter((r) => r.ok)
            let bad = [a, b].filter((r) => !r.ok)
            assert.strict.equal(oks.length, 1, `恰一次成功: ${JSON.stringify([a, b])}`)
            assert.strict.deepEqual(bad[0], ERR('saveStale'))
            assert.strict.equal(env.woItems.grups.get('rid-g1').description, a.ok ? 'from-A' : 'from-B')
        })

        it('EXT-M02 同表兩操作者以同一基準並行改同一外部使用者之 cgrups(經 updateUsers)→ 恰一次成功、另一次 saveStale', async function() {
            let env = createEnv()
            let rows0 = await rowsOf(env.woItems, 'users')
            let bl = blOf('users', rows0)
            let [a, b] = await Promise.all([
                run(env.pc, 'users', edit(rows0, 'rid-u2', { cgrups: J({ A: OR }) }), { baseline: bl }, 'id-opA'),
                run(env.pc, 'users', edit(rows0, 'rid-u2', { cgrups: J({ B: OR }) }), { baseline: bl }, 'id-opB'),
            ])
            assert.strict.equal([a, b].filter((r) => r.ok).length, 1, JSON.stringify([a, b]))
            assert.strict.deepEqual([a, b].find((r) => !r.ok), ERR('saveStale'))
            assert.strict.equal(env.woItems.users.get('rid-u2').cgrups, J(a.ok ? { A: OR } : { B: OR }))
        })

        it('EXT-M03 不同表之並行各依自己之基準, 互不使對方過期(updateGrups ∥ updateUsers 皆成功)', async function() {
            let env = createEnv()
            let g0 = await rowsOf(env.woItems, 'grups')
            let u0 = await rowsOf(env.woItems, 'users')
            let [a, b] = await Promise.all([
                run(env.pc, 'grups', edit(g0, 'rid-g1', { description: 'g-edit' }), { baseline: blOf('grups', g0) }, 'id-opA'),
                run(env.pc, 'users', edit(u0, 'rid-u1', { description: 'u-edit' }), { baseline: blOf('users', u0) }, 'id-opB'),
            ])
            assert.strict.deepEqual([a, b], [OKR, OKR])
        })

        it('EXT-M04 比對於表鎖內: 呼叫端於持鎖者尚未釋放時進入等待, 其間他人已改該列 → 取得鎖後須看見最新庫內版本而回 saveStale(非鎖外以舊讀值比對)', async function() {
            let env = createEnv()
            let rows0 = await rowsOf(env.woItems, 'grups')
            let bl = blOf('grups', rows0)
            let release = null
            let gate = new Promise((resolve) => {
                release = resolve
            })
            let held = env.core.withTabLocks(['grups'], () => gate) //持有 grups 表鎖(模擬他人寫入進行中; perm-run01: 原 env.kmx(tabWriteKey('grups'), () => gate))
            let p = run(env.pc, 'grups', edit(rows0, 'rid-g1', { description: 'mine' }), { baseline: bl })
            await new Promise((resolve) => setTimeout(resolve, 50)) //使 p 進入等待
            await env.woItems.grups.save([{ ...rows0[0], description: 'by-other-before-release' }]) //他人於鎖釋放前完成寫入
            env.woItems.grups.cnt.save = 0
            release()
            await held
            assert.strict.deepEqual(await p, ERR('saveStale'))
            assert.strict.equal(env.woItems.grups.get('rid-g1').description, 'by-other-before-release')
            assert.strict.equal(writesAll(env.woItems), 0)
        })

        it('EXT-M05 守門亦於表鎖內判定: 等待鎖期間後台列被外部同步改成外部列 → 取得鎖後回 saveExternalRowChanged', async function() {
            let env = createEnv()
            let rows0 = await rowsOf(env.woItems, 'targets')
            let release = null
            let gate = new Promise((resolve) => {
                release = resolve
            })
            let held = env.core.withTabLocks(['targets'], () => gate) //perm-run01: 原 env.kmx(tabWriteKey('targets'), () => gate)
            let p = run(env.pc, 'targets', edit(rows0, T1, { description: 'mine' }))
            await new Promise((resolve) => setTimeout(resolve, 50))
            await env.woItems.targets.save([{ ...rows0[0], from: 'pz' }]) //同步把 T1 納為外部列
            env.woItems.targets.cnt.save = 0
            release()
            await held
            assert.strict.deepEqual(await p, ERR('saveExternalRowChanged'))
            assert.strict.equal(env.woItems.targets.get(T1).description, 'pii-desc-t1')
        })

    })


    // =====================================================================
    // O. 基準先於守門、內容同於庫內之 diff 不計(EXT-S4、EXT-S8; run07 修訂: API 子代理 C-1 缺陷與 U1 觀察 1)
    // =====================================================================
    describe('O 基準先於守門與內容同則跳過(C-1／U1 觀察 1)', function() {

        //c1Rows: 後台 4 列(bo1～bo4, order 1～4)＋外部 2 列(ext1: order 70、from pd; ext2: order 80、from pe); 四表同形, 名稱／email 互異
        const C1_BO = ['bo1', 'bo2', 'bo3', 'bo4']
        const C1_EXT = ['ext1', 'ext2']
        let c1Id = (t, k) => (t === 'targets' ? `pii-c1/${k}` : `rid-c1-${k}`)
        let c1Ids = (t, ks) => ks.map((k) => c1Id(t, k))
        let c1Rows = (t) => [...C1_BO, ...C1_EXT].map((k, i) => {
            let isExt = i >= 4
            let o = { id: c1Id(t, k), order: isExt ? 70 + (i - 4) * 10 : i + 1, description: `pii-desc-${k}`, from: isExt ? (i === 4 ? 'pd' : 'pe') : '' }
            if (t !== 'targets') {
                o.name = `pii-c1-${k}`
            }
            if (t === 'users') {
                Object.assign(o, { email: `pii-c1-${k}@example.com`, cgrups: '{}', isAdmin: 'n', isActive: 'y' })
            }
            else if (t !== 'targets') {
                o[ASSIGN[t]] = '{}'
            }
            return { ...ds[t].funNew(), ...AUDIT, ...o }
        })
        let seedC1 = (t) => (s) => ({ ...s, [t]: c1Rows(t) })

        //pickC: 列之內容欄(SPEC_DIGEST 逐表手列, 不含 order 與伺服器管理欄)
        let pickC = (t, row) => Object.fromEntries(SPEC_DIGEST[t].map((f) => [f, row[f]]))
        let resetCnt = (env) => {
            for (let k of TABLE_KEYS) {
                for (let f of ['insert', 'save', 'del', 'delAll']) {
                    env.woItems[k].cnt[f] = 0
                }
            }
        }

        //setupC1: 草稿開啟於 R0(後台 4＋外部 2, 基準 bl 取自 R0); 之後另一操作者以 API 新增 X(其列表為 R0＋X 接在末尾 → X 之 order = 7, 在外部列 70／80 之前)
        async function setupC1(t, opt = {}) {
            let env = createEnv({ seed: seedC1(t), ...opt })
            let R0 = await rowsOf(env.woItems, t)
            assert.strict.deepEqual(R0.map((r) => r.id), c1Ids(t, [...C1_BO, ...C1_EXT]), '前提: R0 依 order 序為 bo1..bo4, ext1, ext2')
            let bl = blOf(t, R0)
            let x = newRow(t)
            assert.strict.deepEqual(await run(env.pc, t, [...R0, x], { baseline: bl }, 'id-other'), OKR, '前提: 他人新增 X 成功')
            let afterOther = await rowsOf(env.woItems, t)
            let X = afterOther.find((r) => r.id === x.id)
            assert.strict.equal(X.order, 7, '前提: X 之 order 為 7(接在 R0 末尾)')
            resetCnt(env)
            return { env, R0, bl, x, X, afterOther }
        }

        for (let t of TABLE_KEYS) {
            let bo2 = c1Id(t, 'bo2')

            it(`EXT-O01 ${t}: C-1 情境(run11 表級改寫)——他人新增 X 後, 草稿以原基準(無 X)帶回 [bo1..bo4, X, ext1, ext2] 只編修 bo2 → saveStale/rowAdded, 零寫入(表內多了基準沒有的 X; 原則 7 先動先贏, run07 版為成功); 以重新載入之基準(含 X)重送則成功且 X 內容不變、X 建立者沿用、外部列逐位元不變、X 不被刪除重建`, async function() {
                let { env, bl, x, afterOther } = await setupC1(t)
                assert.strict.deepEqual(afterOther.map((r) => r.id), c1Ids(t, [...C1_BO]).concat([x.id], c1Ids(t, C1_EXT)), '前提: 依 order 序 X 在 ext1／ext2 之前')
                let before = new Map(afterOther.map((r) => [r.id, cloneDeep(r)]))
                await expectReject(env, t, edit(cloneDeep(afterOther), bo2, { description: 'bo2-edit' }), { baseline: bl }, 'saveStale', `${t} C-1 舊基準`)
                assert.strict.equal(findLog(env.logs, 'updateTabItems-stale-error').reason, 'rowAdded')
                //重新載入(基準取自含 X 之整表)後重送: 成功
                let rows = edit(cloneDeep(afterOther), bo2, { description: 'bo2-edit' })
                assert.strict.deepEqual(await run(env.pc, t, rows, { baseline: blOf(t, afterOther) }, 'id-adminA'), OKR)
                let after = new Map((await rowsOf(env.woItems, t)).map((r) => [r.id, r]))
                assert.strict.equal(after.size, 7, '列數不變')
                assert.strict.equal(after.get(bo2).description, 'bo2-edit', '被編修之後台列落地')
                for (let [id, b] of before) {
                    if (id !== bo2) {
                        assert.strict.deepEqual(pickC(t, after.get(id)), pickC(t, b), `${id} 內容不變`)
                    }
                }
                for (let id of c1Ids(t, C1_EXT)) {
                    assert.strict.deepEqual(after.get(id), before.get(id), `外部列 ${id} 逐位元不變(未被寫入)`)
                }
                assert.strict.equal(after.get(x.id).userId, before.get(x.id).userId, 'X 建立者沿用')
                assert.strict.equal(after.get(x.id).timeCreate, before.get(x.id).timeCreate, 'X 建立時間沿用')
                assert.strict.equal(env.woItems[t].cnt.del + env.woItems[t].cnt.insert, 0, 'X 不被刪除重建')
                assert.strict.equal(after.get(x.id).order, 5, '後台列 order = 位置 + 1(X 在第 5 位)')
                assert.strict.equal(after.get(c1Id(t, 'ext1')).order, 70, '外部列 order 維持庫內值')
            })

            it(`EXT-O02 ${t}: C-1 但 X 於草稿取得之後又被他人改了內容(草稿帶回舊版 X)→ saveStale/rowAdded n=1(X 不在基準), 零寫入, 他人之改動仍在`, async function() {
                let { env, bl, x, afterOther } = await setupC1(t)
                let Xold = afterOther.find((r) => r.id === x.id)
                await env.woItems[t].save([{ ...Xold, description: 'X-changed-by-other' }])
                resetCnt(env)
                let rows = edit(cloneDeep(afterOther), bo2, { description: 'bo2-edit' }) //仍帶舊版 X
                await expectReject(env, t, rows, { baseline: bl }, 'saveStale', `${t} 帶回舊版 X`)
                assert.strict.equal(env.woItems[t].get(x.id).description, 'X-changed-by-other')
                let lg = findLog(env.logs, 'updateTabItems-stale-error')
                assert.strict.deepEqual(subset(lg, { msg: 1, reason: 1, n: 1 }), { msg: 'saveStale', reason: 'rowAdded', n: 1 })
            })

            it(`EXT-O03 ${t}: 草稿開啟時已含 X(基準有 X 之舊版), 之後他人改了 X 之內容, 草稿帶回舊版 X → saveStale/rowChanged n=1, 零寫入`, async function() {
                let { env, x, afterOther } = await setupC1(t)
                let blX = blOf(t, afterOther) //草稿開啟於「含 X」之版本
                let Xold = afterOther.find((r) => r.id === x.id)
                await env.woItems[t].save([{ ...Xold, description: 'X-changed-by-other' }])
                resetCnt(env)
                await expectReject(env, t, edit(cloneDeep(afterOther), bo2, { description: 'bo2-edit' }), { baseline: blX }, 'saveStale', `${t} 基準含 X 舊版`)
                let lg = findLog(env.logs, 'updateTabItems-stale-error')
                assert.strict.deepEqual(subset(lg, { reason: 1, n: 1 }), { reason: 'rowChanged', n: 1 })
            })

            it(`EXT-O04 ${t}: 草稿之列已含他人最新之 X(內容=庫內)而基準為舊(無 X)——列新、基準舊(client 自行混用, 例如存檔當下才取列)→ 仍 saveStale/rowAdded(表級只看基準對庫內整表), 零寫入; 基準與列皆取自最新 → 成功且 X 維持他人之內容`, async function() {
                let { env, bl, x, afterOther } = await setupC1(t)
                let Xold = afterOther.find((r) => r.id === x.id)
                await env.woItems[t].save([{ ...Xold, description: 'X-changed-by-other' }])
                resetCnt(env)
                let latest = await rowsOf(env.woItems, t)
                await expectReject(env, t, edit(cloneDeep(latest), bo2, { description: 'bo2-edit' }), { baseline: bl }, 'saveStale', `${t} 列新基準舊`)
                assert.strict.equal(findLog(env.logs, 'updateTabItems-stale-error').reason, 'rowAdded')
                assert.strict.deepEqual(await run(env.pc, t, edit(cloneDeep(latest), bo2, { description: 'bo2-edit' }), { baseline: blOf(t, latest) }, 'id-adminA'), OKR)
                assert.strict.equal(env.woItems[t].get(x.id).description, 'X-changed-by-other')
                assert.strict.equal(env.woItems[t].get(bo2).description, 'bo2-edit')
            })
        }

        it('EXT-O05 users: lockExternalRows:false 時亦然(基準比對與外部列保護開關無關)——X 移至外部列之前原樣帶回、以含 X 之基準 → 成功, 各列依位置重編 order 1～7, 內容不變; 以原基準(無 X)→ saveStale/rowAdded', async function() {
            let t = 'users'
            let { env, bl: bl0, x, afterOther } = await setupC1(t, { proc: { lockExternalRows: false } })
            let bl = blOf(t, afterOther)
            let before = new Map(afterOther.map((r) => [r.id, cloneDeep(r)]))
            let rows = [...afterOther.filter((r) => C1_BO.some((k) => r.id === c1Id(t, k))), afterOther.find((r) => r.id === x.id), ...afterOther.filter((r) => C1_EXT.some((k) => r.id === c1Id(t, k)))]
            rows = edit(cloneDeep(rows), c1Id(t, 'bo2'), { description: 'bo2-edit' })
            await expectReject(env, t, rows, { baseline: bl0 }, 'saveStale', 'lock=false 原基準')
            assert.strict.equal(findLog(env.logs, 'updateTabItems-stale-error').reason, 'rowAdded')
            assert.strict.deepEqual(await run(env.pc, t, rows, { baseline: bl }, 'id-adminA'), OKR)
            rows.forEach((r, k) => {
                assert.strict.equal(env.woItems[t].get(r.id).order, k + 1, `${r.id} 舊行為依位置重編`)
            })
            for (let [id, b] of before) {
                if (id !== c1Id(t, 'bo2')) {
                    assert.strict.deepEqual(pickC(t, env.woItems[t].get(id)), pickC(t, b), `${id} 內容不變`)
                }
            }
        })

        // ---- U1 觀察 1: 草稿已過期而使用者只編修後台列 → saveStale(非誤導之外部列守門訊息); 基準新鮮而仍違規 → 守門 ----
        for (let t of TABLE_KEYS) {
            let ids = IDS[t]

            it(`EXT-O10 ${t}: 外部同步於草稿開啟後改了外部列之說明; 使用者只編修後台列、基準為開啟時之版本 → saveStale/rowChanged n=1(非 saveExternalRowChanged), 零寫入, 庫內保留同步之說明`, async function() {
                let env = createEnv()
                let rows0 = await rowsOf(env.woItems, t)
                let bl = blOf(t, rows0)
                await env.woItems[t].save([{ ...rows0.find((r) => r.id === ids.ext), description: 'changed-by-sync' }])
                env.woItems[t].cnt.save = 0
                await expectReject(env, t, edit(rows0, ids.b1, { description: 'e' }), { baseline: bl }, 'saveStale', `${t} 外部列被同步改`)
                assert.strict.equal(env.woItems[t].get(ids.ext).description, 'changed-by-sync')
                let lg = findLog(env.logs, 'updateTabItems-stale-error')
                assert.strict.deepEqual(subset(lg, { msg: 1, reason: 1, n: 1 }), { msg: 'saveStale', reason: 'rowChanged', n: 1 })
                assert.strict.equal(findLog(env.logs, 'updateTabItems-external-error'), undefined, '基準先拒收, 未走到外部列守門')
            })

            it(`EXT-O11 ${t}: 外部同步於草稿開啟後移除了外部列; 使用者只編修後台列、基準為開啟時之版本(仍含該外部列)→ saveStale/rowRemoved(非 saveFromNotAllowed), 零寫入, 該外部列不被復活`, async function() {
                let env = createEnv()
                let rows0 = await rowsOf(env.woItems, t)
                let bl = blOf(t, rows0)
                await env.woItems[t].del([{ id: ids.ext }])
                env.woItems[t].cnt.del = 0
                await expectReject(env, t, edit(rows0, ids.b1, { description: 'e' }), { baseline: bl }, 'saveStale', `${t} 外部列被同步移除`)
                assert.strict.equal(env.woItems[t].has(ids.ext), false)
                assert.strict.equal(findLog(env.logs, 'updateTabItems-stale-error').reason, 'rowRemoved')
                assert.strict.equal(findLog(env.logs, 'updateTabItems-external-error'), undefined)
            })

            it(`EXT-O12 ${t}: 基準新鮮(開啟後無人改動)而編修外部列之身分欄 → 仍 saveExternalRowChanged/fieldChanged(守門), 零寫入, 無 stale-error`, async function() {
                let env = createEnv()
                let rows0 = await rowsOf(env.woItems, t)
                let patch = t === 'targets' ? { description: 'changed-by-backend' } : { name: 'pii-renamed' }
                await expectReject(env, t, edit(rows0, ids.ext, patch), { baseline: blOf(t, rows0) }, 'saveExternalRowChanged', `${t} 新鮮基準改外部身分欄`)
                let lg = findLog(env.logs, 'updateTabItems-external-error')
                assert.strict.deepEqual(subset(lg, { msg: 1, reason: 1, n: 1, froms: 1 }), { msg: 'saveExternalRowChanged', reason: 'fieldChanged', n: 1, froms: ['pd'] })
                assert.strict.equal(findLog(env.logs, 'updateTabItems-stale-error'), undefined)
            })

            it(`EXT-O13 ${t}: 基準新鮮而新增 from 非空之列 → 仍 saveFromNotAllowed/addFrom(守門), 零寫入, 無 stale-error`, async function() {
                let env = createEnv()
                let rows0 = await rowsOf(env.woItems, t)
                await expectReject(env, t, [...rows0, newRow(t, { from: 'pd' })], { baseline: blOf(t, rows0) }, 'saveFromNotAllowed', `${t} 新鮮基準新增非空 from`)
                let lg = findLog(env.logs, 'updateTabItems-external-error')
                assert.strict.deepEqual(subset(lg, { msg: 1, reason: 1, n: 1, froms: 1 }), { msg: 'saveFromNotAllowed', reason: 'addFrom', n: 1, froms: ['pd'] })
                assert.strict.equal(findLog(env.logs, 'updateTabItems-stale-error'), undefined)
            })

            it(`EXT-O14 ${t}: 基準新鮮而刪除外部列 → 仍 saveExternalRowChanged/del(守門), 零寫入, 無 stale-error`, async function() {
                let env = createEnv()
                let rows0 = await rowsOf(env.woItems, t)
                await expectReject(env, t, drop(rows0, ids.ext), { baseline: blOf(t, rows0) }, 'saveExternalRowChanged', `${t} 新鮮基準刪外部列`)
                assert.strict.equal(findLog(env.logs, 'updateTabItems-external-error').reason, 'del')
                assert.strict.equal(findLog(env.logs, 'updateTabItems-stale-error'), undefined)
            })

            it(`EXT-O15 ${t}: 基準取自外部同步移除該外部列「之後」(基準無該列), 草稿又把該外部列(同 id、from 為 pd)帶回 → 基準通過、守門拒收 saveFromNotAllowed/addFrom, 零寫入, 不被復活`, async function() {
                let env = createEnv()
                let rows0 = await rowsOf(env.woItems, t)
                let extRow = rows0.find((r) => r.id === ids.ext)
                await env.woItems[t].del([{ id: ids.ext }])
                env.woItems[t].cnt.del = 0
                let fresh = await rowsOf(env.woItems, t)
                await expectReject(env, t, [...fresh, cloneDeep(extRow)], { baseline: blOf(t, fresh) }, 'saveFromNotAllowed', `${t} 新鮮基準帶回已移除之外部列`)
                assert.strict.equal(env.woItems[t].has(ids.ext), false)
                assert.strict.equal(findLog(env.logs, 'updateTabItems-external-error').reason, 'addFrom')
                assert.strict.equal(findLog(env.logs, 'updateTabItems-stale-error'), undefined)
            })

            it(`EXT-O16 ${t}: 草稿已過期(後台列被他人改)且同時違規(新增 from 非空之列)→ 基準先: saveStale(非 saveFromNotAllowed), 零寫入, 無 external-error`, async function() {
                let env = createEnv()
                let rows0 = await rowsOf(env.woItems, t)
                let bl = blOf(t, rows0)
                await env.woItems[t].save([{ ...rows0.find((r) => r.id === ids.b1), description: 'by-other-admin' }])
                env.woItems[t].cnt.save = 0
                let rows = [...edit(rows0, ids.b1, { description: 'client-edit' }), newRow(t, { from: 'pd' })]
                await expectReject(env, t, rows, { baseline: bl }, 'saveStale', `${t} 過期且違規`)
                assert.strict.equal(findLog(env.logs, 'updateTabItems-external-error'), undefined)
            })
        }

        //無基準: 外部列守門先於 saveBaselineRequired(守門違規者不回「須基準」之提示)
        for (let t of ['users', 'grups', 'pemis']) {
            it(`EXT-O17 ${t}: 未帶基準, 外部列改指派欄(本須 saveBaselineRequired)且同時新增 from 非空之列 → saveFromNotAllowed(外部列守門先於無基準分支), 零寫入, 無 stale-error`, async function() {
                let env = createEnv()
                let col = ASSIGN[t]
                let rows = [...edit(await rowsOf(env.woItems, t), IDS[t].ext, { [col]: '{"x":1}' }), newRow(t, { from: 'pd' })]
                await expectReject(env, t, rows, undefined, 'saveFromNotAllowed', `${t} 無基準且違規`)
                assert.strict.equal(findLog(env.logs, 'updateTabItems-stale-error'), undefined)
            })
        }

    })


    // =====================================================================
    // N. 靜態站點守護
    // =====================================================================
    describe('N 靜態站點守護', function() {

        let readCode = (rel) => fs.readFileSync(path.join(projRoot, rel), 'utf8').split(/\r?\n/).map((ln) => stripLineComment(ln)).join('\n')
        let count = (code, re) => (code.match(re) || []).length

        describe('procCore.updateTabItems(EXT-S4)', function() {

            let code = readCode('server/procCore.mjs')
            let iFn = code.indexOf('let updateTabItems = async')
            let body = code.slice(iFn)
            let at = (re) => body.search(re)

            //perm-run01: 基準比對由套內自呼 checkBaseline(...)(於 withTabLocks(kmx, [keyTable]) 內、select 之後)改為交由 w-serv-orm 實例之 guardWrite 宣告式執行——
            //guardWrite({ tables: [keyTable], read, baseline, contract, write }) 於同一把表鎖內「read(新鮮讀取)→ 有 baseline 者 compareBaseline → write(ltdtOld)」, 比對不符即 throw(帶 key)而不進 write, 由 .catch(mapGuardErr) 轉語系鍵.
            //故以下原「checkBaseline( 位置」之釘住, 一律改釘 guardWrite 的 read:／baseline:／write: 三鍵之相對位置(baseline 在 read 之後、write 之前即在 write 內一切檢查之前); 原意不變.
            //站點正規式(本區共用): 位置以 body.search 取字元索引, 註解已由 readCode 剝除
            const RE_GUARD = /\bguardWrite\(\{\s*tables:\s*\[keyTable\]/
            const RE_READ = /\bread:\s*\(\)\s*=>\s*woItems\[keyTable\]\.select\(\)/
            const RE_BASE = /\bbaseline:\s*baseline === null \? undefined : baseline/
            const RE_WRITE = /\bwrite:\s*async \(ltdtOld\)\s*=>/

            it('SITE-EX-001 外部列守門／基準各呼叫恰一處(單一站點, 不分散)', function() {
                assert.strict.ok(iFn > 0)
                for (let name of ['restoreExternalOrder', 'dropServerOnlyDiff', 'restoreServerFields', 'checkExternalWrite', 'hasExternalDiff']) {
                    assert.strict.equal(count(body, new RegExp(`\\b${name}\\(`, 'g')), 1, `${name}( 呼叫數`)
                }
                //perm-run01: 原 checkBaseline( 恰一處 → guardWrite( 恰一處, 其 baseline／contract 各一處(基準比對之單一站點)
                assert.strict.equal(count(body, /\bguardWrite\(/g), 1, 'guardWrite( 呼叫數')
                assert.strict.equal(count(body, new RegExp(RE_BASE.source, 'g')), 1, 'baseline: 傳入 guardWrite 之站點數')
                assert.strict.equal(count(body, /\bcontract:\s*getContract\(keyTable\)/g), 1, 'contract: 傳入 guardWrite 之站點數')
                assert.strict.equal(count(body, /\bisBaselineValid\(/g), 1)
            })

            it('SITE-EX-002 checkExternalWrite／hasExternalDiff／dropServerOnlyDiff 之呼叫位於 ltdtDiffByKey 之後、第一個 procOrm( 寫入之前; 基準比對(guardWrite 之 baseline:, 表級, run11)位於 read: 之後、write: 之前即 ltdtDiffByKey 與第一個 procOrm( 之前', function() {
                let iDiff = at(/\bltdtDiffByKey\(/)
                let iOrm = at(/\bprocOrm\(/)
                let [iRead, iBase, iWrite] = [RE_READ, RE_BASE, RE_WRITE].map((re) => at(re))
                assert.strict.ok(iDiff > 0 && iOrm > 0 && iRead > 0 && iBase > 0 && iWrite > 0, JSON.stringify([iDiff, iOrm, iRead, iBase, iWrite]))
                assert.strict.ok(iRead < iBase && iBase < iWrite && iWrite < iDiff && iBase < iOrm, 'guardWrite 之 baseline: 須在 read: 之後、write: 之前(即 ltdtDiffByKey 與 procOrm( 之前)')
                for (let name of ['dropServerOnlyDiff', 'checkExternalWrite', 'hasExternalDiff']) {
                    let i = at(new RegExp(`\\b${name}\\(`))
                    assert.strict.ok(i > iDiff, `${name} 須在 ltdtDiffByKey 之後`)
                    assert.strict.ok(i < iOrm, `${name} 須在第一個 procOrm( 寫入之前`)
                }
            })

            //SITE-EX-003 為 run11 修訂(原 run07: dropServerOnlyDiff → checkBaseline → checkExternalWrite; 表級基準不需要 diff 結果 r, 提前至 select 之後): 基準最先(select 之後、還原 order 與 ltdtDiffByKey 之前), 其後守門、無基準分支, 皆在寫入前驗證與第一個 procOrm( 之前
            //perm-run01: 「select → checkBaseline」改為 guardWrite 之「read: → baseline: → write:」(比對發生在 read 之後、write 之前); 另補 restoreServerFields( 於 dropServerOnlyDiff 之後
            it('SITE-EX-003 次序: guardWrite → read: → baseline:(基準比對) → write: → restoreExternalOrder → ltdtDiffByKey → dropServerOnlyDiff → restoreServerFields → checkExternalWrite → hasExternalDiff(無基準分支) → validateRowsBeforeWrite → 第一個 procOrm( (基準最先; 外部列守門其次, 兩者皆先於寫入前驗證)', function() {
                let order = [RE_GUARD, RE_READ, RE_BASE, RE_WRITE, ...['restoreExternalOrder', 'ltdtDiffByKey', 'dropServerOnlyDiff', 'restoreServerFields', 'checkExternalWrite', 'hasExternalDiff', 'validateRowsBeforeWrite', 'procOrm'].map((n) => new RegExp(`\\b${n}\\(`))].map((re) => at(re))
                assert.strict.ok(order.every((i) => i > 0), JSON.stringify(order))
                for (let k = 1; k < order.length; k++) {
                    assert.strict.ok(order[k] > order[k - 1], `次序錯: ${JSON.stringify(order)}`)
                }
            })

            //perm-run01: 原「checkBaseline 僅在有基準時呼叫(if (baseline !== null) 區塊內, 被拒回 ck.key)」改為: 僅在有基準時把 baseline 交給 guardWrite(null 已於上方轉 undefined 跳過比對, 見 guardWrite: useBaseline = baseline !== undefined),
            //且 contract 緊隨其後; guardWrite 的拒絕(帶 key 之 Error)經 .catch(mapGuardErr(keyTable, userId)) 轉本套件語系鍵(kpRejectKey: baselineMismatch／rowNotFound → saveStale, baselineFormat → saveBaselineFormat)後 reject
            it('SITE-EX-003b 僅在有基準時把 baseline 交給 guardWrite(null → undefined 跳過比對), 被拒經 mapGuardErr 轉語系鍵; checkExternalWrite 之被拒回 ex.key', function() {
                assert.strict.ok(/\bbaseline:\s*baseline === null \? undefined : baseline,\s*contract:\s*getContract\(keyTable\),\s*write:/.test(body), 'baseline 須為 null → undefined 轉換並與 contract 一併傳入 guardWrite')
                assert.strict.ok(/\bguardWrite\(\{[\s\S]*\}\)\.catch\(mapGuardErr\(keyTable, userId\)\)/.test(body), 'guardWrite 之拒絕須經 .catch(mapGuardErr(keyTable, userId))')
                let pcode = readCode('server/procCore.mjs')
                assert.strict.ok(/let kpRejectKey = \{\s*baselineMismatch:\s*'saveStale',\s*rowNotFound:\s*'saveStale',\s*baselineFormat:\s*'saveBaselineFormat',?\s*\}/.test(pcode), 'kpRejectKey: baselineMismatch／rowNotFound → saveStale, baselineFormat → saveBaselineFormat')
                assert.strict.ok(/if \(ex !== null\) \{[\s\S]*?Promise\.reject\(ex\.key\)/.test(body), 'checkExternalWrite 被拒須 reject ex.key')
            })

            //perm-run01: 原 `r = restoreServerFields({ r, ltdtOld })` 與 dropServerOnlyDiff「同受 if (lockExternalRows) 守護」之舊行為已作廢——伺服器專有欄位存檔不再採用客戶端值(寫入契約 serverOnly), 後台列亦然,
            //二者改為 all: true 且不論 lockExternalRows 一律套用(見 EXT-E04、EXT-H08); 本案改釘「緊接、同為 all: true、同一區塊層級、不受 if (lockExternalRows) 守護」
            it('SITE-EX-005 restoreServerFields 緊接 dropServerOnlyDiff 之後、在 checkExternalWrite 之前; 二者皆 all: true 且與 keysTab 同一區塊層級(不受 if (lockExternalRows) 等條件守護)', function() {
                let a = body.indexOf('r = dropServerOnlyDiff(')
                let b = body.indexOf('r = restoreServerFields({ r, ltdtOld, all: true })')
                let c = body.indexOf('checkExternalWrite({')
                assert.strict.ok(a > 0 && b > a && c > b, 'restoreServerFields 須在 dropServerOnlyDiff 之後、checkExternalWrite 之前')
                assert.strict.ok(/\bdropServerOnlyDiff\(\{[^\n]*\ball: true\b[^\n]*\}\)/.test(body), 'dropServerOnlyDiff 須 all: true')
                assert.strict.ok(/^( *)let keysTab = ds\[keyTable\]\.keys\n\1r = dropServerOnlyDiff\([^\n]*\n\1r = restoreServerFields\(/m.test(body), '二者與 keysTab 同縮排(同一區塊層級, 非條件式內)')
                assert.strict.ok(!/if \([^)]*lockExternalRows[^)]*\) \{\s*r = dropServerOnlyDiff\(/.test(body), 'dropServerOnlyDiff 不得受 lockExternalRows 守護')
            })

            it('SITE-EX-004 restoreExternalOrder 位於 order=k+1 重給與鎖內新鮮讀取(write: async (ltdtOld))之後、ltdtDiffByKey 之前; 且受 if (lockExternalRows) 守護(dropServerOnlyDiff 已不受守護, 見 SITE-EX-005)', function() {
                let iOrder = at(/r\.order\s*=\s*k\s*\+\s*1/)
                let iWrite = at(RE_WRITE) //perm-run01: 原 ltdtOld = await woItems[keyTable].select() 改為 guardWrite 傳入 write 之 ltdtOld(同一表鎖內 read 之結果)
                let iRest = at(/\brestoreExternalOrder\(/)
                let iDiff = at(/\bltdtDiffByKey\(/)
                assert.strict.ok(iOrder > 0 && iWrite > 0 && iRest > 0 && iDiff > 0, JSON.stringify([iOrder, iWrite, iRest, iDiff]))
                assert.strict.ok(iOrder < iRest && iWrite < iRest && iRest < iDiff)
                assert.strict.ok(/if \(lockExternalRows\) \{\s*rows = restoreExternalOrder\(/.test(body))
            })

            //SITE-EX-007 (run11 新增): 表級基準比對是 select 之後的第一個檢查——先於 findTouchedDup(撞名)、checkUsersWrite(email／對應鍵)、saveNewRowExists(新增列已存在),
            //使草稿過期時回「請重新載入」(saveStale), 而不是以過期畫面為前提的其他錯誤(R-PRINCIPLE-00 原則 7)
            //perm-run01: 基準比對由 guardWrite 於 write 回呼之前執行, 故上列各檢查(皆在 write 回呼內)必在其後; 釘 read: → baseline: → write: → 各檢查之序
            it('SITE-EX-007 基準比對(guardWrite 之 baseline:)為 read 之後的第一個檢查: 先於 write 回呼內之 findTouchedDup、checkUsersWrite、saveNewRowExists、restoreExternalOrder、ltdtDiffByKey', function() {
                let order = [RE_READ, RE_BASE, RE_WRITE, ...['restoreExternalOrder', 'findTouchedDup', 'checkUsersWrite', 'saveNewRowExists', 'ltdtDiffByKey'].map((n) => new RegExp(`\\b${n}\\b`))].map((re) => at(re))
                assert.strict.ok(order.every((i) => i > 0), JSON.stringify(order))
                for (let k = 1; k < order.length; k++) {
                    assert.strict.ok(order[k] > order[k - 1], `次序錯: ${JSON.stringify(order)}`)
                }
            })

            //perm-run01: 原「withTabLocks(kmx, [keyTable] 之後」改為 guardWrite({ tables: [keyTable] 之後(w-serv-orm 於同一把表鎖內執行 read → 比對 → write); 基準格式驗證仍在取鎖與任何讀寫之前;
            //另釘引用端表鎖: 於 write 內以 withTabLocks(lockTabs, [holder], fn, [keyTable]) 依階層再取(held 帶本表鎖, 防反向／重入死鎖)
            it('SITE-EX-005 守門與基準比對皆在表鎖內(guardWrite({ tables: [keyTable] 之 write 回呼與 baseline 比對); 基準格式驗證在取鎖與任何讀寫之前(lockSave( 與 guardWrite( 之前); 引用端表鎖於 write 內經 withTabLocks(lockTabs, [holder] 取得並帶 held [keyTable]', function() {
                let iLock = at(RE_GUARD)
                let iBase = at(RE_BASE)
                let iWrite = at(RE_WRITE)
                assert.strict.ok(iLock > 0 && iBase > iLock && iWrite > iBase, JSON.stringify([iLock, iBase, iWrite]))
                for (let name of ['checkExternalWrite', 'hasExternalDiff', 'restoreExternalOrder', 'dropServerOnlyDiff', 'restoreServerFields', 'findTouchedDup', 'checkUsersWrite']) {
                    assert.strict.ok(at(new RegExp(`\\b${name}\\(`)) > iWrite, `${name} 須在 guardWrite 之 write 回呼(表鎖內)`)
                }
                let iValid = at(/\bisBaselineValid\(/)
                let iSave = at(/\blockSave\(/)
                assert.strict.ok(iValid > 0 && iSave > 0 && iValid < iSave, 'isBaselineValid 須在 lockSave( 之前')
                assert.strict.ok(iSave < iLock, 'lockSave( 占位須包在 guardWrite 表鎖之外層')
                assert.strict.ok(iValid < at(/\.select\(\)/), 'isBaselineValid 須在第一個 select() 之前')
                let iHolder = at(/\bwithTabLocks\(lockTabs,\s*\[holder\]/)
                assert.strict.ok(iHolder > iWrite, '引用端表鎖須在 write 回呼內取得')
                assert.strict.ok(/\bwithTabLocks\(lockTabs,\s*\[holder\],\s*async \(\) => \{[\s\S]*?\},\s*\[keyTable\]\)/.test(body), '引用端表鎖須帶 held [keyTable]')
            })

            //SITE-EX-006 為 run07 修訂: 原無基準分支寫成 `else if (lockExternalRows && hasExternalDiff(...))`(接在 if (baseline !== null) 之後)為舊結構; 新結構: 基準與守門之後獨立一支 if (baseline === null && lockExternalRows && hasExternalDiff(...))
            it('SITE-EX-006 被拒皆經 Promise.reject 且記 srLog(external／stale 兩事件名), 無基準分支僅在 baseline === null 且 lockExternalRows 且 hasExternalDiff 時', function() {
                assert.strict.ok(/updateTabItems-external-error/.test(body))
                assert.strict.ok(/updateTabItems-stale-error/.test(body))
                assert.strict.ok(/if \(baseline === null && lockExternalRows && hasExternalDiff\(\{ r, ltdtOld \}\)\)/.test(body))
                assert.strict.ok(/Promise\.reject\('saveBaselineRequired'\)/.test(body))
                assert.strict.equal(count(body, /Promise\.reject\('saveBaselineRequired'\)/g), 1, 'saveBaselineRequired 僅此一處')
            })

        })

        describe('WWebPerm.kpFunExt 與 procCore 之 opt 採納(EXT-S7)', function() {

            let wcode = readCode('server/WWebPerm.mjs')
            let pcode = readCode('server/procCore.mjs')
            let iK = wcode.indexOf('kpFunExt: {')

            //perm-run03: 四個 updateXxx 由 `(userId, rows, opt) => pc.updateXxx(...)` 改為 `async (userId, rows, opt) => { await requireAdmin(userId, 'updateXxx'); return await pc.updateXxx(...) }`
            //(函數層級角色檢查); 簽名(3 參)與 opt 採納規則不變, 只多 async 與函數本體
            it('SITE-EX-010 kpFunExt 四個 updateXxx 皆為 async 3 參簽名 (userId, rows, opt／optClient)', function() {
                assert.strict.ok(iK > 0)
                let seg = wcode.slice(iK, iK + 3000)
                for (let [fn, p3] of [['updateTargets', 'opt'], ['updatePemis', 'opt'], ['updateGrups', 'opt'], ['updateUsers', 'optClient']]) {
                    let re = new RegExp(`${fn}:\\s*async\\s*\\(userId,\\s*rows,\\s*${p3}\\)\\s*=>`)
                    assert.strict.ok(re.test(seg), `${fn} 簽名`)
                }
            })

            //perm-run01: 原 `{ baseline: optClient.baseline }` 逐鍵組裝之釘住, 改為經共用單點 pickClientOpt(optClient) 過濾(只採 baseline 與 returnRows; 行為見 EXT-G11), 其後才由伺服端加 pickKeysOnly
            it('SITE-EX-011 updateUsers 不把用戶端 optClient 整包傳入 pc.updateUsers(經 pickClientOpt 過濾, 只採 baseline／returnRows; pickKeysOnly 由伺服端 modeEditUsers 決定)', function() {
                let seg = wcode.slice(iK, iK + 3000)
                let m = /updateUsers:\s*async\s*\(userId,\s*rows,\s*optClient\)\s*=>\s*\{([\s\S]*?)\n            \},/.exec(seg)
                assert.strict.ok(m, '應能取得 updateUsers 函數本體')
                let b = m[1]
                assert.strict.ok(!/pc\.updateUsers\([^)]*optClient/.test(b), '不得把 optClient 傳入 pc.updateUsers')
                assert.strict.ok(/pc\.updateUsers\(userId,\s*rows,\s*opt\)/.test(b))
                assert.strict.ok(/let opt = pickClientOpt\(optClient\)/.test(b), 'opt 須由 pickClientOpt(optClient) 取得(只採 baseline／returnRows)')
                assert.strict.ok(/modeEditUsers === 'for:grups'[\s\S]*opt\.pickKeysOnly\s*=\s*\['cgrups'\]/.test(b), 'pickKeysOnly 由伺服端 modeEditUsers 設定')
                assert.strict.ok(b.indexOf('pickClientOpt(optClient)') < b.indexOf('opt.pickKeysOnly'), '先過濾用戶端 opt, 再由伺服端加 pickKeysOnly(順序反了則用戶端可蓋掉)')
            })

            //perm-run01: procCore 之 updateTargets／Pemis／Grups 由「updateTabItems(..., pickClientOpt(opt))」改為先 `let optc = pickClientOpt(opt)`(同函式內, 供成功回傳 outOf 讀 returnRows 共用同一份已過濾之 opt)再傳 optc 給 updateTabItems
            it('SITE-EX-012 procCore 之 updateTargets／Pemis／Grups 以 pickClientOpt(opt) 過濾用戶端 opt(只採 baseline／returnRows)後傳入 updateTabItems; procCore 之 lockExternalRows 預設 true 並由 WWebPerm 帶入', function() {
                for (let [fn, tb] of [['updateTargets', 'targets'], ['updatePemis', 'pemis'], ['updateGrups', 'grups']]) {
                    let re = new RegExp(`let ${fn} = async \\(userId, rows, opt = \\{\\}\\) => \\{[\\s\\S]*?let optc = pickClientOpt\\(opt\\)[\\s\\S]*?updateTabItems\\('${tb}',\\s*userId,\\s*rows,\\s*'\\w+',\\s*optc\\)`)
                    assert.strict.ok(re.test(pcode), `${fn} 須以 pickClientOpt(opt) 過濾後呼叫 updateTabItems`)
                }
                assert.strict.ok(/lockExternalRows = true\s*\}\)/.test(pcode), 'proc 之 lockExternalRows 預設 true')
                assert.strict.ok(/procCore\(woItems,\s*procOrm,\s*\{[^}]*\blockExternalRows\b[^}]*\}\)/.test(wcode), 'WWebPerm 須把 lockExternalRows 帶入 procCore')
                assert.strict.ok(/lockExternalRows:\s*lockExternalRows \? 'y' : 'n'/.test(wcode), 'getWebInfor 須帶 lockExternalRows 供前端')
            })

            //perm-run03 範圍四(函數層級角色檢查; dspec/使用者身分驗證原則.md 二.4): 四個寫入函數的第一個敘述即 `await requireAdmin(userId, '<自身函數名>')`, 其後才可呼叫 pc.updateXxx(
            //(先於 pickClientOpt、lockSave、表鎖與任何讀庫——非管理員零寫入、零讀庫); requireAdmin 本體以 perm users 表之 isAdmin==='y' 為準, 不符 reject 固定鍵 userNotAdmin(行為面見 api 層)
            it('SITE-EX-013 kpFunExt 四個 updateXxx 皆先 await requireAdmin(userId, 自身函數名) 再呼叫 pc.updateXxx(; requireAdmin 不符即 reject userNotAdmin', function() {
                assert.strict.ok(iK > 0)
                let seg = wcode.slice(iK, iK + 3000)
                for (let [fn, p3] of [['updateTargets', 'opt'], ['updatePemis', 'opt'], ['updateGrups', 'opt'], ['updateUsers', 'optClient']]) {
                    let m = new RegExp(`${fn}:\\s*async\\s*\\(userId,\\s*rows,\\s*${p3}\\)\\s*=>\\s*\\{([\\s\\S]*?)\\n            \\},`).exec(seg)
                    assert.strict.ok(m, `${fn} 應能取得函數本體`)
                    let b = m[1]
                    assert.strict.ok(b.trim().startsWith(`await requireAdmin(userId, '${fn}')`), `${fn} 之第一個敘述須為 await requireAdmin(userId, '${fn}')`)
                    assert.strict.equal(count(b, /\brequireAdmin\(/g), 1, `${fn} 內 requireAdmin( 恰一處`)
                    let iPc = b.indexOf(`pc.${fn}(`)
                    assert.strict.ok(iPc > b.indexOf('requireAdmin('), `${fn}: pc.${fn}( 須在 requireAdmin 之後`)
                    assert.strict.equal(count(b, new RegExp(`\\bpc\\.${fn}\\(`, 'g')), 1, `${fn} 內 pc.${fn}( 恰一處`)
                    assert.strict.ok(/return await pc\./.test(b), `${fn} 須 await 並回傳 pc.${fn} 之結果(拒絕原樣傳出)`)
                }
                //kpFunExt 內除這四個外不得有其他改變狀態之函數未經 requireAdmin: requireAdmin( 於整檔恰 4 個呼叫站點 ＋ 1 個定義
                assert.strict.equal(count(wcode, /\bawait requireAdmin\(/g), 4, 'WWebPerm.mjs 內 await requireAdmin( 恰 4 處(四個 updateXxx)')
                let mDef = /let requireAdmin = async \(userId, funcName\) => \{([\s\S]*?)\n    \}\n/.exec(wcode)
                assert.strict.ok(mDef, '應有 requireAdmin 定義')
                assert.strict.ok(/isAdmin !== 'y'/.test(mDef[1]) && /Promise\.reject\('userNotAdmin'\)/.test(mDef[1]), 'requireAdmin 須以 isAdmin 判定並 reject userNotAdmin')
                assert.strict.ok(/catch \(err\) \{\s*u = null\s*\}/.test(mDef[1]), '讀取失敗須視同不符(fail-closed)')
            })

        })

    })


    //區段存在核對(防止整段 describe 被意外刪除而不自知; 案數見檔頭「輸入空間表」)
    describe('EXT-CELLS', function() {

        it('EXT-999 本檔 describe 區段皆存在(A～O)', function() {
            let src = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8')
            for (let tag of ['A 外部列守門', 'B 外部列指派欄', 'C 外審 B.1', 'D 外審 B.2', 'E 外部列僅伺服器管理欄', 'F order', 'G pickKeysOnly', 'H lockExternalRows:false', 'I 歷史非字串', 'J 基準格式', 'K 引用連帶', 'L srLog', 'M 並行', 'O 基準先於守門', 'N 靜態站點']) {
                assert.strict.ok(src.includes(`describe('${tag}`), tag)
            }
        })

    })

})
