//外部列守門與過期快照基準之真後端 API 測試(run07; F-23／F-26; R-PRINCIPLE-00 原則 3、5; 規則帳本 R-EXT-OWN-01、R-BASELINE-01; ADR-037)。
//
//規格句(來源: tmp/run07/design-digest.md、sgud/rule/rulebook.md R-EXT-OWN-01／R-BASELINE-01、src/js/externalRows.mjs 與 rowDigest.mjs 檔頭):
//  S1 外部列＝from 為非空字串者(經 /syncAndReplaceTabs 灌入); from 為 ''、缺欄、非字串者為後台列。lockExternalRows 預設 'y'(經 getWebInfor 帶給前端), 'n' 回到舊行為(僅保留 from 須為字串)。
//  S2 'y' 時後台整表寫入(updateUsers／updateGrups／updatePemis／updateTargets): 新增列 from 須為 ''(含複製繼承、手打、復活他來源之列); 外部列不得刪除、不得改 from、
//     不得改身分／結構欄(schema 全部欄位扣除 id、from、order、指派欄、伺服器管理欄); 指派欄(users.cgrups／grups.cpemis／pemis.crules)後台可寫; 後台列不得改成非空 from;
//     違規整次拒收(saveFromNotAllowed／saveExternalRowChanged)、零寫入、不靜默忽略。
//  S3 from 型別: 後台寫入起拒收非字串 from(null、0、false、123; 不論 lockExternalRows)——新增列與「改為非字串」之修改列; 歷史非字串(如 null)原樣送回之列不拒。
//  S4 外部列之 order 由外部擁有: 後台儲存(含重排)不重編, 後台列依陣列位置 k+1。外部列僅伺服器管理欄(建立者／時間)不同者(外部同步重寫後, 後台持舊快照送回)視為無變更, 不回退其建立者／時間。
//  S5 載入基準 baseline(第 3 參 { baseline }, 草稿開啟時由其所依據之列算 [[id, digest]]): 本次將寫入(新增／修改／刪除)之列, 其庫內版本須與基準相同, 否則整次拒收 saveStale
//     (修改／刪除之列不在基準或指紋不同; 新增之列主鍵已在基準內＝復活); 未異動之列不檢查, 故開框後他人新增而草稿原樣帶回之列、內容未變之外部列不使存檔作廢;
//     基準格式不合(非共用核心 h1 版 [[id, 'h1:…'], …]; perm-run01 起)→ saveBaselineFormat(原 saveRowFieldInvalid; 於任何讀寫之前)。
//     〔perm-run01〕基準改用 w-serv-orm 共用核心(h1): 序即名次, 他人只重排即不符(rowReordered); order 數值與伺服器專有欄不入摘要(系統重編號而名次不變不誤擋)。
//  S5b 〔run07 主責語意修訂, 以此二條為準, 不以現況碼為準〕(i) 修改列之內容指紋(排除 order 與伺服器管理欄)與庫內相同(僅 order／審計欄不同)者不檢查基準、不算過期(C-1: 開框後他人新增之列依 order 序帶回,
//     其 order 於本次依位置重編而異動, 但內容未覆蓋他人版本); (ii) 有基準者先比對基準(saveStale)再做外部列守門: 草稿已過期(外部同步於開啟後改了外部列內容、或移除該外部列)而使用者只編修後台列時
//     回 saveStale(提示重新載入), 不回 saveExternalRowChanged／saveFromNotAllowed; 基準新鮮而仍違規者由守門拒收; 無基準而改外部列指派欄仍 saveBaselineRequired。
//  S6 未帶基準: 後台列維持舊行為(成功); 但修改外部列之指派欄無基準 → saveBaselineRequired。
//  S7 kpFunExt 只採納用戶端 opt.baseline, 不採納 pickKeysOnly、lockExternalRows 等其他鍵。
//  S8 外部同步 users 列缺 cgrups 鍵 → 保留庫內同 from 同一 srcKey 列之值(含鍵〔含空字串〕則以外部為準; 新 srcKey〔含沿用舊列 email／name 者〕缺鍵為 '');
//     〔run08〕grups 列缺 cpemis 鍵、pemis 列缺 crules 鍵比照保留(三者同為後台可寫之指派欄; 主控依原則 3、5 定案): 實體身分依 srcKey(perm-run03 起;
//     原『依 id、無 id 者依名稱／email／name 對應』隨外部不再送 id 而不復存在; 同名異 srcKey＝刪舊增新＝新實體 '');
//     同 srcKey 改名: cascadeRename 預設 true → 保留(EX-021c); cascadeRename=false(引用不跟著改)→ 不保留並記 warn identityConflict(EX-021d, F 區); 含鍵者以外部為準。
//  S9 外部同步同一 from 同批「同名異 srcKey」(疑似來源鍵重編; grups／pemis)→ srLog warn syncAndReplaceTabs-srcKeyRenumber(只含表名、來源、筆數, 不含名稱／srcKey 值)並登錄 getWebInfor().syncWarns
//     [{keyTable, from, n, time}]; 之後同(表, from)之同步已無此情形即清除。
//  S11 〔perm-run03〕來源鍵 srcKey 為身分欄(與 from 同): 外部列之 srcKey 後台不可改(saveExternalRowChanged)、後台列不可帶入 srcKey、後台不可新增帶 srcKey 之列(saveFromNotAllowed); 不論 lockExternalRows(EX-004c／EX-045)。
//  〔perm-run03 夾具原則〕外部匯入改依 srcKey 差異同步(server/syncCore.mjs): 夾具列以 srcKey(標籤)識別、不送 id, 外部列之內部 id 由伺服端產生(targets 例外: id＝srcKey), 經 mustSync 後登錄 srcKey→id(rid／ext)供案例查詢;
//     差異同步下「內容相同之重送」為 nSame(零寫入), 不改寫外部列——需要「外部同步改寫了外部列」者(EX-005 c4、EX-009)改以外部僅更新 order 數值(名次不變)造出。
//  S10 後台列之引用端改寫不受守門: 後台群組／權限／標的改名或刪除時連帶改寫引用它之外部列(users.cgrups／grups.cpemis／pemis.crules); 外部群組被後台改名／刪除則拒。
//
//輸入空間(軸 × 格; 〔已測〕＝本檔有案例, 〔未測〕＝列明理由):
//  表 {users, grups, pemis, targets}
//   × 操作 { 新增非空 from〔已測 EX-001〕, 新增 from:''／缺欄〔EX-002〕, 刪外部列〔EX-003〕, 改外部列身分欄〔各表各鎖定欄 EX-004〕, 改外部列 id〔EX-004b〕,
//            改外部列指派欄〔users／grups／pemis; targets 無指派欄 EX-005〕, 改外部列 from〔EX-006〕, 後台列改成非空 from／非字串〔EX-007〕, 複製外部列〔EX-008〕,
//            僅送回外部列之舊審計欄〔EX-009〕, 外部列 order／後台列 k+1〔EX-010〕, 新增 from 非字串〔EX-011〕 }
//   × 基準 { 不帶〔已測〕, 正確〔已測〕, 過期〔已測: 他人改該列／外部同步改內容／開框後他人新增再刪／復活〕, 格式不合〔已測: 19 種, 含 perm-run01 新增之舊版指紋／h1 壞格式／重複 id〕, 空陣列〔已測〕 }
//   × lockExternalRows { 預設 'y'〔A 區〕, 'n'〔D 區: 舊行為迴歸, 含 from 非字串仍拒〕 }
//  基準 × 後台列修改(EX-006b)、基準 × 新增列(原樣帶回／刪除／復活, EX-007b); 指派欄 × 基準(EX-005)。
//  外部同步 × 缺 cgrups 鍵(EX-020〔srcKey 配對〕、B 區 mappingBy=email／C 區 mappingBy=name〔身分仍依 srcKey, 不依 email／name; 新 srcKey 沿用舊列 email／name 者不繼承〕)、grups.cpemis／pemis.crules 缺鍵(run08: EX-021〔srcKey 配對、含鍵、新實體、他分區、log〕／021b〔同名異 srcKey＝新實體〕／021c〔改名, cascadeRename 預設〕／021d〔F 區 cascadeRename=false 不保留＋warn〕)、
//  同名異 srcKey 警告(EX-022／023); kpFunExt opt 過濾(EX-013); 引用端改寫(EX-014); srcKey 身分欄鎖定(EX-004c／EX-045)。
//  〔run07 APIb 增量〕草稿過期 × 外部列守門之次序與 C-1(S5b), 四表各一:
//   × 開框後外部同步 { 改外部列內容〔EX-050〕, 撤銷外部列指派欄〔EX-050b; 舊草稿不得還原授權〕, 移除外部列〔EX-051〕 } × 使用者動作 { 只改後台列〔EX-050／051〕, 外部列另被改／刪／改 from／同批新增非空 from〔EX-054〕 } × 基準 { 舊〔saveStale〕, 無〔守門／saveBaselineRequired〕, 新〔守門／成功〕 }
//   × 基準新鮮 { 改外部列身分欄／刪／改 from〔EX-052〕, 新增非空 from／非字串 from／複製外部列〔EX-055〕, 正常新增 from ''〔EX-055 對照〕 }
//   × 開框後他人新增列 X × 帶回方式 { 依 order 序〔EX-007d〕, 置於他處／多筆〔EX-053〕, 帶回時改內容〔EX-053 saveStale〕, 他人另改別列〔EX-053 saveStale〕 }。
//  〔未測〕: ①users 同步 payload 之 cgrups 為 null 之值(非字串, 於入口 validateRows 之純量檢查拒收, 由 api-syncAndReplaceTabs API-sync-018／019 涵蓋);
//    ②from 為非字串之歷史列於 'y' 下之「改成他值」之組合(unit-externalRows 之函數層涵蓋); ③多操作者並行之外部列守門(見 api-refCascade API-RC-070／071／073); ④瀏覽器端逐列唯讀與基準綁定(UI 組負責, e2e)。
//
//真後端; DB 斷言一律 getWoItems() 唯讀 select, 寫入一律走後端 RPC／同步 API(例外: ①測試框架之重置 purgeExternalRows〔後台不得刪外部列, 同步端點拒空 rows〕; ②from 為 null 之歷史列
//  無任何現行寫入入口可造, 以 restartBackend 之 seedExtra 於後端停止期間旁路寫庫, 同 api-mapKey／api-refCascade)。換設定以 restartBackend(genTempSettings(...)) 並於 after 還原 './settings.json'。
//測試 token: 'sys'(id-for-admin, 後台 RPC)、'{token-for-application}'(外部同步)。
//跑法: node C:/opensrcOper/tools/quiet-run.mjs --name tapi --lock --timeout 1800 -- npx mocha test/api-externalRows.test.mjs --timeout 300000

import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import ds from '../src/schema/index.mjs'
import { makeBaseline } from '../src/js/rowDigest.mjs'
import procLang from '../server/procLang.mjs'
import { assertPristineSeed } from './tools/baseSeed.mjs'
import { startApi, TOKEN_ADMIN, TOKEN_APP, getWoItems, callRpc, urlSync, markSrLog, readSrLogSince, readTables, restoreTables, purgeExternalRows } from './tools/api-setup.mjs'
import { restartBackend, genTempSettings } from './tools/e2e-setup.mjs'


const A = assert.strict
const dirTmp = path.join(path.dirname(fileURLToPath(import.meta.url)), '_tmp', 'api-externalRows') //seed-extra.json, 收尾刪除
const F = 'appExt' //外部來源(夾具)
const KTS = ['users', 'grups', 'pemis', 'targets']
const ON = { mode: 'OR', isActive: 'y' }
const SERVER = ['userId', 'timeCreate', 'userIdUpdate', 'timeUpdate']

//各表: 寫入 RPC、指派欄、鎖定欄(身分／結構欄; 獨立於實作之預期, 見 SCHEMA 守門)
const T = {
    users: { fn: 'updateUsers', assign: 'cgrups', lock: ['name', 'email', 'description', 'isAdmin', 'isActive'] },
    grups: { fn: 'updateGrups', assign: 'cpemis', lock: ['name', 'description'] },
    pemis: { fn: 'updatePemis', assign: 'crules', lock: ['name', 'description'] },
    targets: { fn: 'updateTargets', assign: null, lock: ['description'] },
}
//外部夾具(經同步灌入 F; order 取大值, 以便與後台列 1…n 區分)。perm-run03: 外部只送 srcKey(來源鍵; 此處為夾具標籤), 不送 id; 內部 id 由伺服端產生(targets 例外: id＝srcKey), 以 ext()／rid() 查
const FX = {
    users: [
        { srcKey: 'sk-ex-u1', order: 70, name: 'exU1', email: 'ex-u1@ext.example.com', description: 'ex u1', cgrups: '{}', isAdmin: 'n', isActive: 'y' },
        { srcKey: 'sk-ex-u2', order: 80, name: 'exU2', email: 'ex-u2@ext.example.com', description: 'ex u2', cgrups: '{}', isAdmin: 'n', isActive: 'y' },
    ],
    grups: [
        { srcKey: 'sk-ex-g1', order: 70, name: 'exG1', description: 'ex g1', cpemis: '{}' },
        { srcKey: 'sk-ex-g2', order: 80, name: 'exG2', description: 'ex g2', cpemis: '{}' },
    ],
    pemis: [
        { srcKey: 'sk-ex-p1', order: 70, name: 'exP1', description: 'ex p1', crules: '{}' },
        { srcKey: 'sk-ex-p2', order: 80, name: 'exP2', description: 'ex p2', crules: '{}' },
    ],
    targets: [
        { srcKey: '專案EX/頁1/區塊A', order: 70, description: 'ex t1' },
        { srcKey: '專案EX/頁1/區塊B', order: 80, description: 'ex t2' },
    ],
}
//指派欄之新值(兩組)
const AV = {
    users: [JSON.stringify({ '權限群組M1': ON }), JSON.stringify({ '權限群組M2': ON }), JSON.stringify({ '權限群組M3': ON })],
    grups: [JSON.stringify({ '權限P1': ON }), JSON.stringify({ '權限P2': ON }), JSON.stringify({ '權限P3': ON })],
    pemis: [JSON.stringify({ '專案A/頁A/區塊A': 'y' }), JSON.stringify({ '專案A/頁A/區塊A/分析按鈕': 'y' }), JSON.stringify({ '專案A/頁A/區塊A/執行按鈕': 'y' })],
}
//後台列(base seed)之編修對象
const BO = { users: 'id-for-john', grups: 'id-for-權限群組M3', pemis: 'id-for-權限P3', targets: '專案A/頁A/區塊A' }
//格式不合之基準(perm-run01: 須為共用核心 h1 版 [[id, 'h1:'+14 位小寫 16 進位], …]、id 不重複; 不合者一律伺服端 saveBaselineFormat〔原 saveRowFieldInvalid〕, 於任何讀寫之前)
//  後 5 項為 perm-run01 新增: 套內舊版指紋(無 h1: 前綴)、h1 長度不足／大寫 16 進位／版本前綴大寫、重複 id——皆不得被當成合法基準放行或降級為不帶基準
const BAD_BASELINES = ['abc', '', 5, 0, true, false, {}, [['a']], [['a', 'b', 'c']], [[1, 'b']], [['a', 1]], [null], [['a', 'b'], 'x'], [[['a'], 'b']],
    [['a', 'b']], [['a', 'h1:0123456789ab']], [['a', 'h1:0123456789ABCD']], [['a', 'H1:0123456789abcd']], [['a', 'h1:0123456789abcd'], ['a', 'h1:0123456789abcd']]]
//非字串 from
const BAD_FROMS = [null, 0, false, 123]
//身分欄之變更函數(逐欄產生「必不同於原值」之新值; EX-004、EX-052、EX-054 共用)
const CHG = {
    name: (v) => `${v}-X`,
    email: (v) => `x-${v}`,
    description: (v) => `${v} X`,
    isAdmin: (v) => (v === 'y' ? 'n' : 'y'),
    isActive: (v) => (v === 'y' ? 'n' : 'y'),
}


// ===== 小工具 =====

let sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let clone = (o) => JSON.parse(JSON.stringify(o))
let byId = (a, b) => String(a.id).localeCompare(String(b.id))
let brief = (r) => ({ ok: r.ok, msg: r.msg }) //不印 raw(位元組亂碼)
let selectAll = async (kt) => (await getWoItems())[kt].select()
let rowsOf = async (kt) => (await selectAll(kt)).sort((a, b) => ((a.order || 0) - (b.order || 0)) || byId(a, b)).map(clone)
let snapKt = async (kt) => JSON.stringify((await selectAll(kt)).sort(byId))
let snap4 = async () => ({ users: await snapKt('users'), grups: await snapKt('grups'), pemis: await snapKt('pemis'), targets: await snapKt('targets') })
let extOf = async (kt, from = F) => (await selectAll(kt)).filter((r) => r.from === from).sort(byId).map(clone) //外部分區之全列
let rowOf = async (kt, id) => (await selectAll(kt)).find((r) => r.id === id)
let omit = (o, ks) => Object.fromEntries(Object.entries(o).filter(([k]) => !ks.includes(k)))
let patch = (rows, id, o) => rows.map((r) => (r.id === id ? { ...r, ...o } : r))
let baselineOf = (kt, rows) => makeBaseline(rows, kt) //測試端依表名算正確基準(perm-run01: 原 makeBaseline(rows, ds[kt].keys) 改傳表名字串)

//外部列之內部 id(perm-run03): 由伺服端產生(targets 例外: id＝srcKey), 夾具以 srcKey(標籤)識別。經 mustSync 後登錄 (表, from, srcKey)→id, 供 ext()／rid() 同步查詢;
//  登錄只增不刪(列被同步移除後仍可據舊 id 驗證「已不存在」), freshState／restoreBase 時清空(外部列被重置後 id 隨之改變)
let RID = new Map()
let ridKey = (kt, from, srcKey) => `${kt}\u0000${from}\u0000${srcKey}`
let refreshRid = async (kt) => {
    for (let r of await selectAll(kt)) {
        if (typeof r.srcKey === 'string' && r.srcKey !== '' && typeof r.from === 'string' && r.from !== '') {
            RID.set(ridKey(kt, r.from, r.srcKey), r.id)
        }
    }
}
let rid = (kt, srcKey, from = F) => {
    let v = RID.get(ridKey(kt, from, srcKey))
    A.ok(typeof v === 'string', `找不到 ${kt} 外部列(from=${from}, srcKey=${srcKey})之內部 id(夾具尚未經 mustSync 建立?)`)
    return v
}
let ext = (kt, k = 0) => rid(kt, FX[kt][k].srcKey) //外部夾具列之內部 id
//fxRows: 外部夾具列之複本; mut 為 { 夾具索引: 覆寫欄位 }(以索引指定第幾筆夾具列, 不依 id 比對)
let fxRows = (kt, mut = {}) => clone(FX[kt]).map((r, k) => (mut[k] === undefined ? r : { ...r, ...mut[k] }))
//新增列(from 預設 ''; targets 之 id 為路徑)
let nid = (kt, tag) => (kt === 'targets' ? `專案EX/新增/${tag}` : `id-ex-new-${tag}`)
let newRow = (kt, tag, o = {}) => {
    let id = nid(kt, tag)
    let base = {
        users: { id, order: 0, name: `n-${tag}`, email: `${tag}@new.example.com`, description: '', from: '', cgrups: '{}', isAdmin: 'n', isActive: 'y' },
        grups: { id, order: 0, name: `n-${tag}`, description: '', from: '', cpemis: '{}' },
        pemis: { id, order: 0, name: `n-${tag}`, description: '', from: '', crules: '{}' },
        targets: { id, order: 0, description: '', from: '' },
    }[kt]
    return { ...base, ...o }
}

//後台寫入(第 3 參 opt 缺省時不送, 同舊客戶端)
let write = (kt, rows, opt) => callRpc(T[kt].fn, opt === undefined ? [rows] : [rows, opt], TOKEN_ADMIN)
let mustWrite = async (label, kt, rows, opt) => {
    let r = await write(kt, rows, opt)
    A.ok(r.ok, `${label} 應成功，實得: ${JSON.stringify(brief(r))}`)
    return r
}
//expectReject: 應被拒且回 keys 之一、四表零寫入(逐位元)
let expectReject = async (label, kt, rows, keys, opt) => {
    let s0 = await snap4()
    let r = await write(kt, rows, opt)
    A.equal(r.ok, false, `${label} 應被拒，實得: ${JSON.stringify(brief(r))}`)
    let ks = Array.isArray(keys) ? keys : [keys]
    A.ok(ks.includes(r.msg), `${label} 應回 ${ks.join('／')}，實得: ${r.msg}`)
    A.deepEqual(await snap4(), s0, `${label} 須零寫入(四表逐位元不變)`)
    return r
}

//外部同步(操作者 id-for-application)
let postSync = async (kt, body, token = TOKEN_APP) => {
    let url = urlSync.replace('{keyTable}', kt).replace('{token}', token)
    let res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) })
    return await res.json()
}
let mustSync = async (kt, body) => {
    let r = await postSync(kt, body)
    A.equal(r.state, 'success', `同步 ${kt} 應成功，實得: ${JSON.stringify(r)}`)
    await refreshRid(kt) //登錄新外部列之內部 id(srcKey→id)
    return r
}

//等待 srLog(pino 非同步落檔)出現符合 pred 之行, 回傳標記(markSrLog, 動作之前取)之後新增之全部行(以檔案位置定位, 不比對測試與後端兩行程之時鐘; R-SRLOG-MARK-01)
let waitLines = async (mark, pred, label, ms = 30000) => {
    let tEnd = Date.now() + ms
    let lines = []
    while (Date.now() < tEnd) {
        lines = readSrLogSince(mark)
        if (lines.some(pred)) {
            await sleep(800)
            return readSrLogSince(mark)
        }
        await sleep(300)
    }
    throw new Error(`${label}: ${ms} ms 內 srLog 未見預期之行(讀到 ${lines.length} 行)`)
}

//expectStale: 應被拒 saveStale(S5b: 草稿過期先於外部列守門)、四表零寫入, 且 srLog 記 updateTabItems-stale-error 之原因屬 reasons、
//  並無 updateTabItems-external-error(證明回 saveStale 是因為過期檢查先觸發, 而非守門與過期並存而碰巧回此鍵)
let expectStale = async (label, kt, rows, reasons, opt) => {
    let mark = await markSrLog()
    await expectReject(label, kt, rows, 'saveStale', opt)
    let lines = await waitLines(mark, (l) => l.event === 'updateTabItems-stale-error' && l.msg === 'saveStale', label)
    let l = lines.filter((x) => x.event === 'updateTabItems-stale-error' && x.msg === 'saveStale').pop()
    A.equal(l.keyTable, kt, `${label} log 記表名`)
    A.ok(reasons.includes(l.reason), `${label} log 之原因應屬 ${reasons.join('／')}，實得 ${l.reason}`)
    A.ok(!lines.some((x) => x.event === 'updateTabItems-external-error'), `${label} 不得有外部列守門之 error log(過期先於守門)`)
}

//noLeakLine: srLog 一行不得含任何機敏值, 且除 pino 基本欄位與登記之事件欄位(event／keyTable／from／field／n／reason)外不得有額外欄位(run08 外審 sol #8):
//  授權值為 JSON 字串, 在 pino 原文中雙引號被跳脫, 只比對未跳脫形式會漏掉; 額外欄位(如 value)亦須擋下
const LOG_FIELDS = new Set(['level', 'time', 'pid', 'hostname', 'name', 'msg', 'v', 'event', 'keyTable', 'from', 'field', 'n', 'reason', '_raw'])
let noLeakLine = (l, secrets, label) => {
    for (let s of secrets) {
        A.ok(!l._raw.includes(s) && !l._raw.includes(JSON.stringify(s).slice(1, -1)), `${label} 不得含「${s}」: ${l._raw}`)
    }
    let extra = Object.keys(l).filter((k) => !LOG_FIELDS.has(k))
    A.deepEqual(extra, [], `${label} 不得有登記以外之欄位: ${l._raw}`)
}

//語系鍵須有 eng 與 cht 文字
let checkLangKey = (key) => {
    let lang = procLang({})
    A.ok(typeof lang.eng[key] === 'string' && lang.eng[key].length > 0, `procLang.eng 須有 ${key}`)
    A.ok(typeof lang.cht[key] === 'string' && lang.cht[key].length > 0, `procLang.cht 須有 ${key}`)
}

let getInfor = async () => {
    let r = await callRpc('getWebInfor', [], TOKEN_ADMIN)
    A.ok(r.ok, `getWebInfor 應成功，實得: ${JSON.stringify(brief(r))}`)
    return r.output
}


describe('api-externalRows (外部列守門與過期快照基準, 真後端)', function() {
    this.timeout(300000)

    let BASE = null //base seed 快照(users／grups／pemis 依 order; targets 依 order)

    //restoreBase: 移除外部列夾具(purgeExternalRows, 測試框架之重置)後以管理者寫入 RPC 把四表還原為 base seed(後台列)
    let restoreBase = async () => {
        RID.clear() //外部列將被移除重建, 內部 id 隨之改變
        await restoreTables(BASE)
        await purgeExternalRows(['targets'], { keepIds: { targets: BASE.targets.map((r) => r.id) } })
        let r = await callRpc('updateTargets', [clone(BASE.targets)], TOKEN_ADMIN)
        if (!r.ok) {
            throw new Error(`restoreBase updateTargets 失敗: ${JSON.stringify(brief(r))}`)
        }
    }
    //freshState: 還原 base seed 並以同步灌入四表之外部夾具(F)
    let freshState = async () => {
        await restoreBase()
        for (let kt of ['targets', 'pemis', 'grups', 'users']) {
            await mustSync(kt, { from: F, rows: clone(FX[kt]) })
        }
    }

    before(async function() {
        this.timeout(300000)
        await startApi() //預設 settings.json(lockExternalRows 預設 'y'、mappingBy 預設 'id')
        for (let kt of KTS) {
            assertPristineSeed(kt, await selectAll(kt)) //base seed 須為 pristine(前檔遺留即大聲失敗)
        }
        BASE = await readTables()
        BASE.targets = await rowsOf('targets')
    })

    after(async function() {
        this.timeout(300000)
        try {
            await restartBackend('./settings.json') //還原預設設定(DB 保留)
            await restoreBase()
        }
        finally {
            fs.rmSync(dirTmp, { recursive: true, force: true })
        }
        for (let kt of KTS) {
            let rs = await selectAll(kt)
            A.equal(rs.filter((r) => typeof r.from === 'string' && r.from !== '').length, 0, `收尾後 ${kt} 不得殘留外部列`)
            assertPristineSeed(kt, rs)
        }
        A.equal(fs.existsSync(dirTmp), false, 'test/_tmp/api-externalRows 須已清除')
    })


    // ===== A. 預設設定(lockExternalRows 預設 'y') =====

    describe('A. 預設設定', function() {

        it('EX-000 前提: 基準種子四表皆為後台列(from \'\')、四個新語系鍵有 eng／cht、鎖定欄預期與 schema 一致、getWebInfor 帶 lockExternalRows＝y 與空之 syncWarns', async function() {
            for (let kt of KTS) {
                let rs = await selectAll(kt)
                A.ok(rs.length > 0 && rs.every((r) => r.from === ''), `${kt} 基準種子之 from 應全為 ''(run07 起 peter／mary／john 由 teamA 改 '')`)
                //鎖定欄預期(獨立於實作)＋id／from／srcKey／order／指派欄／伺服器管理欄 = schema 全部欄位; schema 日後增欄須於此決定其屬性(鎖定或指派)
                //  srcKey(perm-run03): 外部匯入之來源鍵, 身分欄(與 from 同; 後台不可改, 見 EX-004c／EX-045), 故不列入 T.lock(其變更之斷言有專屬案例)
                let exp = [...T[kt].lock, 'id', 'from', 'srcKey', 'order', ...SERVER, ...(T[kt].assign ? [T[kt].assign] : [])].sort()
                A.deepEqual([...ds[kt].keys].sort(), exp, `${kt} schema 欄位須等於預期之鎖定欄＋id／from／srcKey／order／指派欄／伺服器管理欄`)
            }
            for (let key of ['saveFromNotAllowed', 'saveExternalRowChanged', 'saveStale', 'saveBaselineRequired']) {
                checkLangKey(key)
            }
            let infor = await getInfor()
            A.equal(infor.lockExternalRows, 'y', 'getWebInfor.lockExternalRows 預設應為 y')
            A.deepEqual(infor.syncWarns, [], '無同名異 srcKey 同步時 syncWarns 應為空陣列')
        })


        // ---------- 新增 ----------

        it('EX-001 新增非空 from(外部來源名／新來源名／空白字元／\'0\'; 含標示為新增 _isNew 之列): 四表皆 saveFromNotAllowed、零寫入', async function() {
            await freshState()
            for (let kt of KTS) {
                for (let from of [F, 'appNew', ' ', '0']) {
                    await expectReject(`${kt} 新增 from=${JSON.stringify(from)}`, kt, [...await rowsOf(kt), newRow(kt, 'a1', { from })], 'saveFromNotAllowed')
                }
                await expectReject(`${kt} 新增 _isNew 且 from=F`, kt, [...await rowsOf(kt), newRow(kt, 'a2', { from: F, _isNew: true })], 'saveFromNotAllowed')
                //新增非空 from 與同批合法編修並存: 整次拒收, 合法編修亦不落地
                let rows = await rowsOf(kt)
                await expectReject(`${kt} 新增非空 from＋同批後台列編修`, kt, [...patch(rows, BO[kt], { description: 'edited-in-bad-batch' }), newRow(kt, 'a3', { from: F })], 'saveFromNotAllowed')
            }
        })

        it('EX-002 新增 from 為 \'\' 或缺欄: 四表皆成功且落地為後台列; 外部列逐位元不變', async function() {
            await freshState()
            for (let kt of KTS) {
                let before = await extOf(kt)
                A.equal(before.length, 2, `前提: ${kt} 有 2 筆外部夾具`)
                let noFrom = newRow(kt, 'b2')
                delete noFrom.from
                await mustWrite(`${kt} 新增 from ''／缺欄`, kt, [...await rowsOf(kt), newRow(kt, 'b1', { from: '' }), noFrom])
                let rs = await selectAll(kt)
                for (let tag of ['b1', 'b2']) {
                    let r = rs.find((x) => x.id === nid(kt, tag))
                    A.ok(r, `${kt} 新增之 ${tag} 應落地`)
                    A.equal(r.from === undefined ? '' : r.from, '', `${kt} 新增之 ${tag} 應為後台列(from '')`)
                }
                A.deepEqual(await extOf(kt), before, `${kt} 外部列須逐位元不變(含建立者／時間)`)
            }
        })


        // ---------- 刪除 ----------

        it('EX-003 刪除外部列(單筆／全部外部列／同批併有合法新增): 四表皆 saveExternalRowChanged、零寫入; 刪除後台列則成功', async function() {
            await freshState()
            for (let kt of KTS) {
                let rows = await rowsOf(kt)
                await expectReject(`${kt} 刪一筆外部列`, kt, rows.filter((r) => r.id !== ext(kt, 0)), 'saveExternalRowChanged')
                await expectReject(`${kt} 刪全部外部列`, kt, rows.filter((r) => r.from !== F), 'saveExternalRowChanged')
                await expectReject(`${kt} 刪外部列＋同批合法新增`, kt, [...rows.filter((r) => r.id !== ext(kt, 1)), newRow(kt, 'c1')], 'saveExternalRowChanged')
                //對照: 後台列(新增一筆)可刪, 外部列不受影響
                await mustWrite(`${kt} 預置後台列`, kt, [...rows, newRow(kt, 'c2')])
                let rows2 = await rowsOf(kt)
                await mustWrite(`${kt} 刪後台列`, kt, rows2.filter((r) => r.id !== nid(kt, 'c2')))
                A.ok(!(await selectAll(kt)).some((r) => r.id === nid(kt, 'c2')), `${kt} 後台列應已刪除`)
                A.equal((await extOf(kt)).length, 2, `${kt} 外部列仍 2 筆`)
            }
        })


        // ---------- 改外部列之身分／結構欄 ----------

        for (let kt of KTS) {
            it(`EX-004 改外部列身分欄(${kt}: ${T[kt].lock.join('、')}; 逐欄、整批全改、並同批合法編修): saveExternalRowChanged、零寫入`, async function() {
                await freshState()
                let id = ext(kt, 0)
                for (let f of T[kt].lock) {
                    let rows = await rowsOf(kt)
                    let cur = rows.find((r) => r.id === id)
                    await expectReject(`${kt}.${f}`, kt, patch(rows, id, { [f]: CHG[f](cur[f]) }), 'saveExternalRowChanged')
                }
                //整批全改
                let rows = await rowsOf(kt)
                let cur = rows.find((r) => r.id === id)
                await expectReject(`${kt} 全部鎖定欄一併改`, kt, patch(rows, id, Object.fromEntries(T[kt].lock.map((f) => [f, CHG[f](cur[f])]))), 'saveExternalRowChanged')
                //外部列之變更與後台列之合法編修同批: 整次拒收, 後台列編修亦不落地
                await expectReject(`${kt} 外部列變更＋後台列編修同批`, kt, patch(patch(rows, id, { description: 'ext-edited' }), BO[kt], { description: 'bo-edited' }), 'saveExternalRowChanged')
                //外部列之第二筆亦同
                await expectReject(`${kt} 第二筆外部列`, kt, patch(rows, ext(kt, 1), { description: 'ext2-edited' }), 'saveExternalRowChanged')
            })
        }

        it('EX-004b 改外部列之主鍵 id(＝刪舊增新, 新列沿用外部 from): 四表皆被拒(saveFromNotAllowed 或 saveExternalRowChanged)、零寫入', async function() {
            await freshState()
            for (let kt of KTS) {
                let rows = await rowsOf(kt)
                await expectReject(`${kt} 改外部列 id`, kt, patch(rows, ext(kt, 0), { id: `${ext(kt, 0)}-renamed` }), ['saveFromNotAllowed', 'saveExternalRowChanged'])
            }
        })

        //〔perm-run03 S11〕來源鍵 srcKey 為身分欄(與 from 同): 只由外部匯入端點寫入, 後台不可改外部列之值、不可對後台列帶入值、不可新增帶值之列(缺欄／null／'' 同一空值)
        for (let kt of KTS) {
            it(`EX-004c 來源鍵 srcKey 為身分欄(${kt}): 改外部列之 srcKey(改值／清空; 有無基準皆然)→saveExternalRowChanged; 後台列帶入 srcKey、新增 from '' 而帶 srcKey 之列→saveFromNotAllowed; 零寫入; 原樣送回外部列之 srcKey 則成功`, async function() {
                await freshState()
                let id = ext(kt, 0)
                let rows = await rowsOf(kt)
                let B = baselineOf(kt, rows)
                let cur = rows.find((r) => r.id === id)
                A.equal(cur.srcKey, FX[kt][0].srcKey, `前提: ${kt} 外部列庫內 srcKey 為夾具標籤`)
                for (let v of ['sk-changed', '']) {
                    await expectReject(`${kt} 外部列 srcKey→${JSON.stringify(v)}(無基準)`, kt, patch(rows, id, { srcKey: v }), 'saveExternalRowChanged')
                    await expectReject(`${kt} 外部列 srcKey→${JSON.stringify(v)}(基準新鮮)`, kt, patch(rows, id, { srcKey: v }), 'saveExternalRowChanged', { baseline: B })
                }
                await expectReject(`${kt} 後台列帶入 srcKey`, kt, patch(rows, BO[kt], { srcKey: 'sk-forged' }), 'saveFromNotAllowed')
                await expectReject(`${kt} 後台列帶入 srcKey(基準新鮮)`, kt, patch(rows, BO[kt], { srcKey: 'sk-forged' }), 'saveFromNotAllowed', { baseline: B })
                await expectReject(`${kt} 新增 from '' 而帶 srcKey`, kt, [...rows, newRow(kt, 'sk1', { srcKey: 'sk-forged' })], 'saveFromNotAllowed')
                //對照: 外部列之 srcKey 原樣送回(後台列另有合法編修)→成功, srcKey 不變
                await mustWrite(`${kt} 外部列 srcKey 原樣送回＋後台列編修`, kt, patch(rows, BO[kt], { description: 'sk-keep-edit' }), { baseline: B })
                A.equal((await rowOf(kt, id)).srcKey, FX[kt][0].srcKey, `${kt} 外部列 srcKey 不變`)
            })
        }


        // ---------- 改外部列之指派欄 × 基準 ----------

        for (let kt of ['users', 'grups', 'pemis']) {
            it(`EX-005 改外部列指派欄(${kt}.${T[kt].assign}) × 基準{不帶、格式不合、正確、空陣列、過期}: 不帶→saveBaselineRequired; 格式不合→saveBaselineFormat; 正確→成功且僅指派欄變; 空陣列／過期→saveStale; 外部同步重寫(內容未變)不使基準作廢`, async function() {
                await freshState()
                let af = T[kt].assign
                let id = ext(kt, 0)
                let mk = (rows, v) => patch(rows, id, { [af]: v })

                //(a) 不帶基準: opt 省略／null／{}／只帶無關鍵／pickKeysOnly(不被採納)→ saveBaselineRequired; 與後台列之合法編修同批亦拒
                let rows = await rowsOf(kt)
                for (let opt of [undefined, null, {}, { foo: 1 }, { pickKeysOnly: [af] }, 'abc', 5, []]) {
                    await expectReject(`${kt} 指派欄無基準 opt=${JSON.stringify(opt)}`, kt, mk(rows, AV[kt][0]), 'saveBaselineRequired', opt)
                }
                await expectReject(`${kt} 指派欄無基準＋後台列編修`, kt, patch(mk(rows, AV[kt][0]), BO[kt], { description: 'bo-edit' }), 'saveBaselineRequired')

                //(d) 格式不合基準 → saveBaselineFormat(於任何讀寫之前; 即使其他一切合法; perm-run01: 原 saveRowFieldInvalid)
                for (let b of BAD_BASELINES) {
                    await expectReject(`${kt} 格式不合基準 ${JSON.stringify(b)}`, kt, mk(rows, AV[kt][0]), 'saveBaselineFormat', { baseline: b })
                }

                //(b) 正確基準 → 成功; 僅指派欄變, from／鎖定欄／order 不變
                let before = await rowOf(kt, id)
                await mustWrite(`${kt} 指派欄(正確基準)`, kt, mk(rows, AV[kt][0]), { baseline: baselineOf(kt, rows) })
                let after = await rowOf(kt, id)
                A.equal(after[af], AV[kt][0], `${kt} 指派欄新值應落地`)
                A.equal(after.from, F, `${kt} 外部列 from 不變`)
                A.equal(after.order, before.order, `${kt} 外部列 order 不變`)
                A.deepEqual(omit(after, [af, ...SERVER]), omit(before, [af, ...SERVER]), `${kt} 除指派欄與伺服器管理欄外逐欄不變`)
                A.equal(after.userIdUpdate, 'id-for-admin', `${kt} 指派欄之更新者記為操作者`)

                //(c1) 空陣列基準(合法格式, 但不含該列)→ saveStale
                rows = await rowsOf(kt)
                await expectReject(`${kt} 空陣列基準`, kt, mk(rows, AV[kt][1]), 'saveStale', { baseline: [] })

                //(c2) 過期: 持舊基準 B1, 另一路徑(管理者二)以正確基準改了同一列之指派欄後, 再以 B1 存檔 → saveStale
                let B1 = baselineOf(kt, rows)
                await mustWrite(`${kt} 另一路徑改同列指派欄`, kt, mk(rows, AV[kt][1]), { baseline: B1 })
                await expectReject(`${kt} 持過期基準(他人已改該列)`, kt, mk(await rowsOf(kt), AV[kt][2]), 'saveStale', { baseline: B1 })

                //(c3) 過期: 外部同步改了該外部列之內容(description)後, 持舊基準 → saveStale
                rows = await rowsOf(kt)
                let B2 = baselineOf(kt, rows)
                await mustSync(kt, { from: F, rows: fxRows(kt, { 0: { description: `${FX[kt][0].description} resync` } }) })
                await expectReject(`${kt} 持過期基準(外部同步已改內容)`, kt, mk(await rowsOf(kt), AV[kt][2]), 'saveStale', { baseline: B2 })

                //(c4) 外部同步改寫外部列(內容指紋未變)不使基準作廢: 指紋排除 order 與伺服器管理欄
                //  perm-run03: 差異同步下「內容相同之重送」為 nSame(零寫入), 不會改寫外部列; 故由外部僅更新該列 order 數值(名次不變)造出「列被外部同步改寫(更新者／更新時間異動)而內容指紋不變」
                rows = await rowsOf(kt)
                let B3 = baselineOf(kt, rows)
                let tu0 = (await rowOf(kt, id)).timeUpdate
                await sleep(30)
                await mustSync(kt, { from: F, rows: fxRows(kt, { 0: { description: `${FX[kt][0].description} resync`, order: FX[kt][0].order + 1 } }) })
                A.notEqual((await rowOf(kt, id)).timeUpdate, tu0, '前提: 外部同步已改寫該列(更新時間更新)')
                await mustWrite(`${kt} 持舊基準(外部同步僅改寫 order、內容指紋未變)`, kt, mk(await rowsOf(kt), AV[kt][2]), { baseline: B3 })
                A.equal((await rowOf(kt, id))[af], AV[kt][2], `${kt} 指派欄新值應落地`)
            })
        }

        it('EX-005b targets 無指派欄: 改外部標的之 description 無論有無基準皆 saveExternalRowChanged(基準不能使鎖定欄可寫)', async function() {
            await freshState()
            let rows = await rowsOf('targets')
            let id = ext('targets', 0)
            await expectReject('targets 無基準', 'targets', patch(rows, id, { description: 'x' }), 'saveExternalRowChanged')
            await expectReject('targets 正確基準', 'targets', patch(rows, id, { description: 'x' }), 'saveExternalRowChanged', { baseline: baselineOf('targets', rows) })
        })

        it('EX-005c 鎖定欄＋指派欄同批改外部列(即使附正確基準): saveExternalRowChanged、零寫入', async function() {
            await freshState()
            for (let kt of ['users', 'grups', 'pemis']) {
                let rows = await rowsOf(kt)
                await expectReject(`${kt} 鎖定欄＋指派欄`, kt, patch(rows, ext(kt, 0), { description: 'mix', [T[kt].assign]: AV[kt][0] }), 'saveExternalRowChanged', { baseline: baselineOf(kt, rows) })
            }
        })


        it('EX-005d 名次入基準、order 數值不入摘要(perm-run01 原則 10): 他人重排(只改 order 致名次改變, 內容不變)後持舊基準 → saveStale/rowReordered、零寫入, 重新載入(新基準)後編修成功; 外部同步僅重編外部列 order 數值而名次不變 → 持舊基準編修別列仍成功; 四表', async function() {
            //perm-run01: 原 EX-005d 預期「他人重排(只改 order)後持舊基準編修別列仍成功」(舊指紋排除 order 且不比名次); 共用核心 h1 基準把「序即名次」入基準, 他人只重排即不符(刻意語意變更, 規格原則 10),
            //  故 A 段改為 saveStale/rowReordered; 原意圖「order 數值不使草稿作廢」改以 B 段(數值變而名次不變)承接
            for (let kt of KTS) {
                //A. 他人重排 → 名次改變 → 持舊基準 saveStale(rowReordered)
                await freshState()
                let Y = BO[kt]
                let R0 = await rowsOf(kt)
                let B0 = baselineOf(kt, R0)
                //他人重排: 後台列反序(外部列原位), 只改 order 不改內容
                let exts = R0.filter((r) => r.from === F)
                let bos = R0.filter((r) => r.from !== F)
                await mustWrite(`${kt} 他人重排`, kt, [...[...bos].reverse(), ...exts])
                let afterRe = await rowsOf(kt)
                A.notEqual(afterRe.filter((r) => r.from !== F).map((r) => r.id).join(','), bos.map((r) => r.id).join(','), `前提(${kt}): 重排後後台列順序已改`)
                //持舊基準編修別列(以重排後之當前列為底) → saveStale(僅名次不同: reason rowReordered), 零寫入
                await expectStale(`${kt} 他人重排後持舊基準編修`, kt, patch(afterRe, Y, { description: 'reorder-edit' }), ['rowReordered'], { baseline: B0 })
                A.notEqual((await rowOf(kt, Y)).description, 'reorder-edit', `${kt} 編修未落地`)
                //重新載入(基準取自重排後之列)後 → 成功
                await mustWrite(`${kt} 重新載入後編修`, kt, patch(afterRe, Y, { description: 'reorder-edit' }), { baseline: baselineOf(kt, afterRe) })
                A.equal((await rowOf(kt, Y)).description, 'reorder-edit', `${kt} 編修落地`)

                //B. 外部同步僅重編外部列之 order 數值(名次不變: 仍排在後台列之後) → 持舊基準編修別列成功(order 數值與伺服器管理欄不入摘要)
                await freshState()
                R0 = await rowsOf(kt)
                B0 = baselineOf(kt, R0)
                let rs = clone(FX[kt]).map((r) => ({ ...r, order: r.order * 10 }))
                await mustSync(kt, { from: F, rows: rs })
                let afterRn = await rowsOf(kt)
                A.deepEqual(afterRn.filter((r) => r.from === F).map((r) => r.order), rs.map((r) => r.order), `前提(${kt}): 外部列 order 數值已重編`)
                A.deepEqual(afterRn.map((r) => r.id), R0.map((r) => r.id), `前提(${kt}): 名次不變`)
                await mustWrite(`${kt} 外部同步重編 order 數值後持舊基準編修別列`, kt, patch(afterRn, Y, { description: 'renumber-edit' }), { baseline: B0 })
                A.equal((await rowOf(kt, Y)).description, 'renumber-edit', `${kt} 編修落地`)
            }
        })


        // ---------- 後台列 × 基準 ----------

        it('EX-006b 改後台列(description) × 基準{不帶、正確、空陣列、格式不合、過期}: 不帶→成功(舊行為); 正確→成功; 空陣列／過期→saveStale; 格式不合→saveBaselineFormat; 過期＝表內任何列被他人改過(表級, 原則 7): 即使本次只改「未被他人改動」之別列亦 saveStale', async function() {
            for (let kt of KTS) {
                await freshState()
                let id = BO[kt]
                let mk = (rows, v) => patch(rows, id, { description: v })

                //不帶基準 → 成功(最後寫入者勝, ADR-013)
                let rows = await rowsOf(kt)
                await mustWrite(`${kt} 後台列無基準`, kt, mk(rows, 'nb-1'))
                A.equal((await rowOf(kt, id)).description, 'nb-1')

                //格式不合 → saveBaselineFormat(perm-run01: 原 saveRowFieldInvalid)
                rows = await rowsOf(kt)
                for (let b of BAD_BASELINES) {
                    await expectReject(`${kt} 後台列格式不合基準 ${JSON.stringify(b)}`, kt, mk(rows, 'nb-x'), 'saveBaselineFormat', { baseline: b })
                }

                //正確基準 → 成功
                await mustWrite(`${kt} 後台列正確基準`, kt, mk(rows, 'nb-2'), { baseline: baselineOf(kt, rows) })
                A.equal((await rowOf(kt, id)).description, 'nb-2')

                //空陣列基準 → saveStale(被改寫之列不在基準內)
                rows = await rowsOf(kt)
                await expectReject(`${kt} 後台列空陣列基準`, kt, mk(rows, 'nb-3'), 'saveStale', { baseline: [] })

                //過期: 他人(無基準之舊路徑)改了該列 → 持舊基準 → saveStale; 表級(run11, 原則 7): 他人改的是別列(本次不寫入之列)亦 saveStale
                let B1 = baselineOf(kt, rows)
                await mustWrite(`${kt} 他人改同列`, kt, mk(rows, 'nb-by-other'))
                await expectReject(`${kt} 後台列持過期基準`, kt, mk(await rowsOf(kt), 'nb-4'), 'saveStale', { baseline: B1 })
                let rows3 = await rowsOf(kt)
                let idOther = rows3.find((r) => r.id !== id && r.from === '').id //另一後台列(基準內、未被他人改動)
                await expectStale(`${kt} 舊基準存「未被他人改動」之別列(表內另有列已被他人改, 表級過期)`, kt, patch(rows3, idOther, { description: 'nb-other-row' }), ['rowChanged'], { baseline: B1 })
                await mustWrite(`${kt} 重新載入(新基準)後存別列`, kt, patch(rows3, idOther, { description: 'nb-other-row' }), { baseline: baselineOf(kt, rows3) })
            }
        })


        // ---------- 開框後他人新增／刪除之列 ----------

        for (let kt of KTS) {
            it(`EX-007b 開框後他人新增／刪除之列 × 舊基準(${kt}): 新增之列原樣帶回→saveStale(表級: 先動先贏, run07 版為成功); 重新載入(含新增列之新基準)後原樣帶回→成功(c0); 草稿未含該新增列而存檔(＝刪除該列)→saveStale; 已被他人刪除之列(基準內)復活→saveStale`, async function() {
                let Y = BO[kt]
                //c0: 開框後他人新增 X, 草稿(含 X 原樣帶回)編修別列 → 舊基準(無 X)表級過期 saveStale、零寫入; 以含 X 之新基準(重新載入)送出 → 成功
                //  此處 X 維持於陣列末端(其 order 於本次依位置重編後不變, 本無 diff); X 於其他位置帶回、order 因而異動者(C-1)見 EX-007d 與 EX-053
                await freshState()
                let R0 = await rowsOf(kt)
                let B0 = baselineOf(kt, R0)
                await mustWrite(`${kt} 他人新增 X`, kt, [...R0, newRow(kt, 'x1')])
                let cur = await rowsOf(kt)
                let xDb = cur.find((r) => r.id === nid(kt, 'x1'))
                A.ok(xDb, '前提: X 已新增')
                await expectStale(`${kt} c0: X 原樣帶回＋編修別列(舊基準, 表級過期)`, kt, [...patch(R0, Y, { description: 'c0-edit' }), xDb], ['rowAdded'], { baseline: B0 })
                await mustWrite(`${kt} c0: X 原樣帶回(維持末端位置)＋編修別列(重新載入之新基準)`, kt, [...patch(R0, Y, { description: 'c0-edit' }), xDb], { baseline: baselineOf(kt, cur) })
                A.equal((await rowOf(kt, Y)).description, 'c0-edit', 'c0: 編修落地')
                A.deepEqual(omit(await rowOf(kt, nid(kt, 'x1')), SERVER), omit(xDb, SERVER), 'c0: X 仍在且內容與 order 不變')

                //草稿未含 X(開框於 X 新增之前)而存檔 → X 被當刪除, 不在基準 → saveStale, 零寫入
                await freshState()
                R0 = await rowsOf(kt)
                B0 = baselineOf(kt, R0)
                await mustWrite(`${kt} 他人新增 X`, kt, [...R0, newRow(kt, 'x2')])
                await expectStale(`${kt} 草稿未含他人新增之 X 即存檔`, kt, patch(R0, Y, { description: 'del-x-edit' }), ['rowAdded'], { baseline: B0 })

                //復活: 基準內之後台列 Z 已被他人刪除, 草稿原樣帶回 Z → rowRemoved(saveStale)
                await freshState()
                await mustWrite(`${kt} 預置 Z`, kt, [...await rowsOf(kt), newRow(kt, 'z1')])
                R0 = await rowsOf(kt)
                B0 = baselineOf(kt, R0)
                await mustWrite(`${kt} 他人刪 Z`, kt, R0.filter((r) => r.id !== nid(kt, 'z1')))
                await expectStale(`${kt} 草稿帶回已被他人刪除之 Z`, kt, patch(R0, Y, { description: 'revive-edit' }), ['rowRemoved'], { baseline: B0 })

                //無基準之舊客戶端: 同樣情境(刪 X／復活 Z)維持舊行為(成功)
                await mustWrite(`${kt} 舊客戶端復活 Z(無基準)`, kt, patch(R0, Y, { description: 'old-client' }))
                A.ok(await rowOf(kt, nid(kt, 'z1')), '舊客戶端: Z 被復活(舊行為)')
            })
        }

        for (let kt of KTS) {
            it(`EX-007d 〔C-1, run11 表級改寫〕開框後他人新增之列 X 於草稿依 order 排序帶回(${kt}; X 之 order 值大於其排序後之位置, 因外部列之 order 較大而位於其後): 舊基準(無 X)→saveStale/rowAdded、零寫入(run07 版為成功); 重新載入(含 X 之新基準)後 → 成功(X 內容未變, order 因位置重編而異動不算內容變更), X 仍在且內容不變、編修落地、外部列逐位元不變`, async function() {
                //規格句: 原則 7(表級)——舊基準不含 X 即過期; 指紋排除 order——X 之 order 因位置重編而異動不算內容變更, 故以含 X 之新基準送出即成功
                let Y = BO[kt]
                await freshState()
                let R0 = await rowsOf(kt)
                let B0 = baselineOf(kt, R0)
                await mustWrite(`${kt} 他人新增 X`, kt, [...R0, newRow(kt, 'x1')])
                let cur = await rowsOf(kt) //草稿依 order 排序帶回(前端清單依 order 排列)
                let iX = cur.findIndex((r) => r.id === nid(kt, 'x1'))
                let xDb = cur[iX]
                A.ok(xDb, '前提: X 已新增')
                A.notEqual(xDb.order, iX + 1, `前提(${kt}): X 庫內 order(${xDb.order}) 須不等於其依 order 排序後之位置(${iX + 1}), 本次儲存才會使其 order 異動(C-1 情境)`)
                let extBefore = await extOf(kt)
                await expectStale(`${kt} C-1: X 依 order 序帶回＋編修別列(舊基準)`, kt, patch(cur, Y, { description: 'c0b-edit' }), ['rowAdded'], { baseline: B0 })
                await mustWrite(`${kt} C-1: X 依 order 序帶回＋編修別列(重新載入之新基準)`, kt, patch(cur, Y, { description: 'c0b-edit' }), { baseline: baselineOf(kt, cur) })
                A.equal((await rowOf(kt, Y)).description, 'c0b-edit', '編修落地')
                let xAfter = await rowOf(kt, nid(kt, 'x1'))
                A.ok(xAfter, 'X 仍在')
                A.deepEqual(omit(xAfter, [...SERVER, 'order']), omit(xDb, [...SERVER, 'order']), 'X 內容不變(order 除外)')
                A.equal(xAfter.order, iX + 1, 'X 之 order 依其送入位置重編')
                A.deepEqual(await extOf(kt), extBefore, '外部列逐位元不變(order 由外部擁有, 且未寫入)')
            })
        }

        it('EX-007c 外部同步已移除之外部列於持舊快照之後台寫入中復活(grups): 持舊基準→saveStale(S5b(ii) 過期先於守門; 修前為 saveFromNotAllowed); 無基準或持新基準→saveFromNotAllowed(守門仍拒復活); 零寫入', async function() {
            //規格句: S5b(ii) 有基準者先 checkBaseline 再外部列守門——草稿已過期(外部同步移除該外部列)時回 saveStale; 基準新鮮而仍違規(新增非空 from)者由守門拒收; 守門不依賴基準(無基準仍拒)
            //(本案原釘「守門先於基準」之舊次序, 依 run07 主責語意修訂改為上述)
            await freshState()
            let kt = 'grups'
            let R0 = await rowsOf(kt)
            let B0 = baselineOf(kt, R0)
            await mustSync(kt, { from: F, rows: [clone(FX[kt][0])] }) //外部同步不再推送第二筆
            let draft = patch(R0, BO[kt], { description: 'revive-ext' }) //草稿仍含已被移除之外部列(復活)
            await expectReject('復活外部列(持舊基準)', kt, draft, 'saveStale', { baseline: B0 })
            await expectReject('復活外部列(無基準)', kt, draft, 'saveFromNotAllowed')
            await expectReject('復活外部列(持同步後之新基準)', kt, draft, 'saveFromNotAllowed', { baseline: baselineOf(kt, await rowsOf(kt)) })
        })


        // ---------- 草稿過期先於外部列守門(S5b(ii))與基準新鮮時之守門 ----------

        for (let kt of KTS) {
            it(`EX-050 開框後外部同步改了外部列內容, 使用者以正確舊基準只改後台列(${kt}): saveStale(log 原因 rowChanged、無外部列守門之 error)、零寫入; 無基準之舊客戶端同樣送入則 saveExternalRowChanged; 重新載入(新基準)後存檔成功且不覆蓋外部之新內容`, async function() {
                //規格句: S5b(ii)——草稿已過期(外部同步於開啟後改了外部列內容)而使用者只編修後台列時回 saveStale, 不回 saveExternalRowChanged
                let Y = BO[kt]
                await freshState()
                let id = ext(kt, 0) //外部列之內部 id 由伺服端產生, 須在 freshState 建夾具之後取
                let R0 = await rowsOf(kt) //草稿所依據之列
                let B0 = baselineOf(kt, R0)
                let descOld = R0.find((r) => r.id === id).description
                await mustSync(kt, { from: F, rows: fxRows(kt, { 0: { description: `${FX[kt][0].description} resynced` } }) })
                let descNew = (await rowOf(kt, id)).description
                A.notEqual(descNew, descOld, '前提: 外部同步已改外部列內容')
                let draft = patch(R0, Y, { description: 'bo-edit-on-stale' })
                await expectStale(`${kt} 持舊基準只改後台列`, kt, draft, ['rowChanged'], { baseline: B0 })
                //無基準(舊客戶端): 外部列內容與庫內不同 → 視為改身分欄 → 守門拒收(此為既有行為, 非本次修訂之對象)
                await expectReject(`${kt} 無基準之舊客戶端`, kt, draft, 'saveExternalRowChanged')
                //重新載入: 以當前列與新基準存檔 → 成功; 外部列保持外部之新內容
                let R1 = await rowsOf(kt)
                await mustWrite(`${kt} 重新載入後存檔`, kt, patch(R1, Y, { description: 'bo-edit-reloaded' }), { baseline: baselineOf(kt, R1) })
                A.equal((await rowOf(kt, Y)).description, 'bo-edit-reloaded', `${kt} 編修落地`)
                A.equal((await rowOf(kt, id)).description, descNew, `${kt} 外部列保持外部之新內容, 不被舊草稿覆蓋`)
            })
        }

        for (let kt of ['users', 'grups', 'pemis']) {
            it(`EX-050b 外部同步撤銷了外部列之指派欄(${kt}.${T[kt].assign}), 舊草稿(持撤銷前之基準與指派)只改後台列: saveStale、庫內指派維持撤銷後之值(舊快照不得還原外部已撤銷之授權); 無基準者 saveBaselineRequired`, async function() {
                //規格句: 設計摘要 3(F-26 外審 B.2)——舊快照不得還原外部已撤銷之授權; S5b(ii) 過期回 saveStale
                let af = T[kt].assign
                let Y = BO[kt]
                await freshState()
                let id = ext(kt, 0) //外部列之內部 id 由伺服端產生, 須在 freshState 建夾具之後取
                let R0 = await rowsOf(kt)
                await mustWrite(`${kt} 後台指派外部列`, kt, patch(R0, id, { [af]: AV[kt][0] }), { baseline: baselineOf(kt, R0) })
                let R1 = await rowsOf(kt) //草稿所依據之列(外部列已被指派 V0)
                let B1 = baselineOf(kt, R1)
                A.equal(R1.find((r) => r.id === id)[af], AV[kt][0], '前提: 草稿所依據之外部列已被指派')
                await mustSync(kt, { from: F, rows: clone(FX[kt]) }) //外部以帶鍵之 '{}' 重送 → 以外部為準(撤銷)
                A.equal((await rowOf(kt, id))[af], '{}', '前提: 外部同步已撤銷指派')
                let draft = patch(R1, Y, { description: 'bo-edit-old-assign' })
                await expectStale(`${kt} 舊草稿只改後台列(外部列帶舊指派)`, kt, draft, ['rowChanged'], { baseline: B1 })
                A.equal((await rowOf(kt, id))[af], '{}', `${kt} 庫內外部列指派仍為撤銷後之值`)
                await expectReject(`${kt} 無基準之舊客戶端(外部列指派與庫內不同)`, kt, draft, 'saveBaselineRequired')
            })
        }

        for (let kt of KTS) {
            it(`EX-051 開框後外部同步移除了該外部列, 使用者以正確舊基準只改後台列(${kt}): 草稿仍帶該外部列→saveStale(log 原因 rowRemoved)、零寫入; 無基準或持新基準→saveFromNotAllowed; 草稿已不含該列(依當前列)但仍持舊基準→saveStale(表級), 持新基準→成功`, async function() {
                //規格句: S5b(ii)——草稿已過期(外部同步移除該外部列)而使用者只編修後台列時回 saveStale(基準之列已不在庫內＝rowRemoved)
                let Y = BO[kt]
                await freshState()
                let R0 = await rowsOf(kt)
                let B0 = baselineOf(kt, R0)
                await mustSync(kt, { from: F, rows: [clone(FX[kt][0])] }) //移除第二筆外部列
                A.equal(await rowOf(kt, ext(kt, 1)), undefined, '前提: 外部列已被同步移除')
                let draft = patch(R0, Y, { description: 'bo-edit-removed-ext' }) //草稿仍含已移除之外部列(＝送入時成為新增、from 為外部來源)
                await expectStale(`${kt} 持舊基準, 草稿仍帶已移除之外部列`, kt, draft, ['rowRemoved'], { baseline: B0 })
                await expectReject(`${kt} 無基準之舊客戶端`, kt, draft, 'saveFromNotAllowed')
                await expectReject(`${kt} 持同步後之新基準, 草稿仍帶已移除之外部列`, kt, draft, 'saveFromNotAllowed', { baseline: baselineOf(kt, await rowsOf(kt)) })
                //草稿已不含該列(如重新整理 store 後之列)但仍持舊基準(表級): 基準之外部列已不在庫內 → 仍 saveStale; 持新基準(重新載入)→ 成功
                let R1 = await rowsOf(kt)
                await expectStale(`${kt} 草稿不含已移除之外部列但持舊基準`, kt, patch(R1, Y, { description: 'bo-edit-reloaded' }), ['rowRemoved'], { baseline: B0 })
                await mustWrite(`${kt} 草稿不含已移除之外部列(重新載入之新基準)`, kt, patch(R1, Y, { description: 'bo-edit-reloaded' }), { baseline: baselineOf(kt, R1) })
                A.equal((await rowOf(kt, Y)).description, 'bo-edit-reloaded', `${kt} 編修落地`)
                A.equal(await rowOf(kt, ext(kt, 1)), undefined, `${kt} 已移除之外部列不得被復活`)
            })
        }

        for (let kt of KTS) {
            it(`EX-052 基準新鮮而違規改外部列(${kt}): 改身分欄(${T[kt].lock.join('、')})、刪除、改 from→saveExternalRowChanged; from 改為非字串→saveFromNotAllowed; 基準不使守門放行; 零寫入`, async function() {
                //規格句: S5b(ii)——基準新鮮而仍違規者由守門拒收(身分／結構欄不得改、不得刪、不得改 from; from 非字串拒)
                await freshState()
                let id = ext(kt, 0)
                let rows = await rowsOf(kt)
                let B = baselineOf(kt, rows) //新鮮基準(草稿所依據之列＝庫內現況)
                let cur = rows.find((r) => r.id === id)
                for (let f of T[kt].lock) {
                    await expectReject(`${kt}.${f} 基準新鮮`, kt, patch(rows, id, { [f]: CHG[f](cur[f]) }), 'saveExternalRowChanged', { baseline: B })
                }
                await expectReject(`${kt} 鎖定欄全改＋同批後台列編修(基準新鮮)`, kt, patch(patch(rows, id, Object.fromEntries(T[kt].lock.map((f) => [f, CHG[f](cur[f])]))), BO[kt], { description: 'bo-edit' }), 'saveExternalRowChanged', { baseline: B })
                await expectReject(`${kt} 刪外部列(基準新鮮)`, kt, rows.filter((r) => r.id !== id), 'saveExternalRowChanged', { baseline: B })
                await expectReject(`${kt} 刪全部外部列(基準新鮮)`, kt, rows.filter((r) => r.from !== F), 'saveExternalRowChanged', { baseline: B })
                for (let v of ['', 'appOther']) {
                    await expectReject(`${kt} 外部列 from→${JSON.stringify(v)}(基準新鮮)`, kt, patch(rows, id, { from: v }), 'saveExternalRowChanged', { baseline: B })
                }
                for (let v of BAD_FROMS) {
                    await expectReject(`${kt} 外部列 from→${JSON.stringify(v)}(基準新鮮)`, kt, patch(rows, id, { from: v }), 'saveFromNotAllowed', { baseline: B })
                }
                //對照: 同一新鮮基準, 只改後台列 → 成功(基準不是一律拒收)
                await mustWrite(`${kt} 基準新鮮只改後台列`, kt, patch(rows, BO[kt], { description: 'fresh-ok' }), { baseline: B })
                A.equal((await rowOf(kt, BO[kt])).description, 'fresh-ok', `${kt} 編修落地`)
            })
        }

        for (let kt of KTS) {
            it(`EX-054 草稿已過期且又有違規(${kt}): 外部同步改了外部列內容後, 舊草稿再改外部列身分欄／刪除／改 from／同批新增非空 from → 一律 saveStale(過期先於守門, log 無外部列守門之 error); 持新基準之同一動作則由守門拒收`, async function() {
                //規格句: S5b(ii) 有基準者先比對基準(saveStale)再外部列守門; 以此釘住次序(舊次序下此四動作皆回守門之鍵)
                await freshState()
                let id = ext(kt, 0)
                let R0 = await rowsOf(kt)
                let B0 = baselineOf(kt, R0)
                await mustSync(kt, { from: F, rows: fxRows(kt, { 0: { description: `${FX[kt][0].description} resynced` } }) })
                let cur0 = R0.find((r) => r.id === id)
                let f0 = T[kt].lock[0]
                //舊草稿: 外部列 id 之內容為舊(與庫內不同), 再疊加各種違規
                await expectStale(`${kt} 舊草稿＋改外部列身分欄`, kt, patch(R0, id, { [f0]: CHG[f0](cur0[f0]) }), ['rowChanged'], { baseline: B0 })
                await expectStale(`${kt} 舊草稿＋刪該外部列`, kt, R0.filter((r) => r.id !== id), ['rowChanged'], { baseline: B0 })
                await expectStale(`${kt} 舊草稿＋改該外部列 from`, kt, patch(R0, id, { from: '' }), ['rowChanged'], { baseline: B0 })
                await expectStale(`${kt} 舊草稿＋同批新增非空 from`, kt, [...R0, newRow(kt, 'p1', { from: F })], ['rowChanged'], { baseline: B0 })
                //對照: 持新基準(草稿所依據之列＝同步後之庫內列)之同一類動作 → 守門拒收(EX-052／EX-055 詳)
                let R1 = await rowsOf(kt)
                let B1 = baselineOf(kt, R1)
                let cur1 = R1.find((r) => r.id === id)
                await expectReject(`${kt} 新基準＋改外部列身分欄`, kt, patch(R1, id, { [f0]: CHG[f0](cur1[f0]) }), 'saveExternalRowChanged', { baseline: B1 })
                await expectReject(`${kt} 新基準＋同批新增非空 from`, kt, [...R1, newRow(kt, 'p2', { from: F })], 'saveFromNotAllowed', { baseline: B1 })
            })
        }

        for (let kt of KTS) {
            it(`EX-055 基準新鮮而新增列(${kt}): 非空 from(外部來源名／新來源名／空白字元／'0')、非字串 from(null／0／false／123)、標 _isNew 之外部列複製→saveFromNotAllowed、零寫入; 新增 from ''／缺欄→成功`, async function() {
                //規格句: S5b(ii) 基準新鮮而仍違規者由守門拒收; 設計摘要 1(後台新增列 from 須為 '', 含複製繼承、復活、手打)
                await freshState()
                let rows = await rowsOf(kt)
                let B = baselineOf(kt, rows)
                for (let from of [F, 'appNew', ' ', '0', ...BAD_FROMS]) {
                    await expectReject(`${kt} 新增 from=${JSON.stringify(from)}(基準新鮮)`, kt, [...rows, newRow(kt, 'q1', { from })], 'saveFromNotAllowed', { baseline: B })
                }
                let src = rows.find((r) => r.id === ext(kt, 0))
                let cp = { ...src, id: nid(kt, 'q2'), _isNew: true }
                if (kt === 'users') {
                    cp.email = 'q2@copy.example.com'
                }
                if (kt === 'grups' || kt === 'pemis') {
                    cp.name = `${src.name}-copy`
                }
                await expectReject(`${kt} 複製外部列(from 繼承, 基準新鮮)`, kt, [...rows, cp], 'saveFromNotAllowed', { baseline: B })
                //對照: 新增 from ''／缺欄 → 成功(新增列之主鍵不在基準內, 不算過期)
                let noFrom = newRow(kt, 'q4')
                delete noFrom.from
                await mustWrite(`${kt} 新增 from ''／缺欄(基準新鮮)`, kt, [...rows, newRow(kt, 'q3'), noFrom], { baseline: B })
                for (let tag of ['q3', 'q4']) {
                    let r = await rowOf(kt, nid(kt, tag))
                    A.ok(r, `${kt} 新增之 ${tag} 應落地`)
                    A.equal(r.from === undefined ? '' : r.from, '', `${kt} 新增之 ${tag} 為後台列`)
                }
            })
        }

        for (let kt of KTS) {
            it(`EX-053 開框後他人新增之列 X1、X2 (${kt}): 以舊基準(無 X)送出——不論 X 置於最前／夾於後台列之間／帶回時是否改其內容——一律 saveStale/rowAdded(表級: 先動先贏, 不部分變更; run07 版為成功／部分 saveStale)、零寫入; 重新載入(含 X 之新基準)後 X 置於最前／夾於後台列之間 → 成功(X 內容未變, order 依送入位置重編); 取得基準後他人再改別列 → saveStale/rowChanged`, async function() {
                //規格句: 原則 7(表級)——基準涵蓋載入時整表, 庫內多了 X1、X2 即過期; 指紋排除 order, 故新基準下 X 因位置重編而異動 order 不算內容變更
                let Y = BO[kt]
                await freshState()
                let R0 = await rowsOf(kt)
                let B0 = baselineOf(kt, R0)
                await mustWrite(`${kt} 他人新增 X1`, kt, [...R0, newRow(kt, 'x1')])
                await mustWrite(`${kt} 他人新增 X2`, kt, [...await rowsOf(kt), newRow(kt, 'x2')])
                let cur = await rowsOf(kt)
                let x1 = cur.find((r) => r.id === nid(kt, 'x1'))
                let x2 = cur.find((r) => r.id === nid(kt, 'x2'))
                A.ok(x1 && x2, '前提: X1、X2 已新增')
                let bos = cur.filter((r) => r.from !== F && r.id !== x1.id && r.id !== x2.id) //後台列(不含 X)
                let exts = cur.filter((r) => r.from === F)
                let extBefore = await extOf(kt)
                //各小節各編修不同之後台列(一旦成功存檔, 該列於庫內之內容即與先前取得之基準不同, 同一基準不得再用於改它): Y→(a)、Yb→(b)、Yc→(d)、Z→(d) 被他人改
                let others = bos.filter((r) => r.id !== Y).map((r) => r.id)
                A.ok(others.length >= 3, `前提(${kt}): 另有 ≥3 筆後台列`)
                let [Yb, Yc, Z] = others

                //(a0) 舊基準 B0(無 X) + X1 置於最前: saveStale/rowAdded、零寫入
                let a = [x1, ...patch([...bos, x2, ...exts], Y, { description: 'c0-front' })]
                A.notEqual(x1.order, 1, '前提: X1 庫內 order 不為 1')
                await expectStale(`${kt} X1 置於最前＋編修別列(舊基準)`, kt, a, ['rowAdded'], { baseline: B0 })

                //(a) 重新載入後(基準取自含 X1、X2 之現況): 成功; X1 之 order 依送入位置重編為 1
                let B1 = baselineOf(kt, cur)
                await mustWrite(`${kt} X1 置於最前＋編修別列(新基準)`, kt, a, { baseline: B1 })
                A.equal((await rowOf(kt, Y)).description, 'c0-front', `${kt} (a) 編修落地`)
                let got = Object.fromEntries((await selectAll(kt)).map((r) => [r.id, r]))
                a.forEach((r, k) => {
                    if (r.from !== F) {
                        A.equal(got[r.id].order, k + 1, `${kt} (a) 後台列 ${r.id} 之 order 為位置 ${k + 1}`)
                    }
                })
                A.deepEqual(omit(got[x1.id], [...SERVER, 'order']), omit(x1, [...SERVER, 'order']), `${kt} (a) X1 內容不變`)
                A.deepEqual(omit(got[x2.id], [...SERVER, 'order']), omit(x2, [...SERVER, 'order']), `${kt} (a) X2 內容不變`)
                A.deepEqual(await extOf(kt), extBefore, `${kt} (a) 外部列逐位元不變`)

                //(b) X2、X1 次序對調並夾於後台列之間: 取自(a)之後現況的新基準 → 成功; 沿用 B0 → saveStale
                let cur2 = await rowsOf(kt)
                let bos2 = cur2.filter((r) => r.from !== F && r.id !== x1.id && r.id !== x2.id)
                let b = [bos2[0], x2, bos2[1], x1, ...bos2.slice(2), ...cur2.filter((r) => r.from === F)]
                b = patch(b, Yb, { description: 'c0-between' })
                await expectStale(`${kt} X2、X1 夾於後台列之間(沿用舊基準 B0)`, kt, b, ['rowChanged', 'rowAdded'], { baseline: B0 })
                await mustWrite(`${kt} X2、X1 夾於後台列之間＋編修別列(新基準)`, kt, b, { baseline: baselineOf(kt, cur2) })
                A.equal((await rowOf(kt, Yb)).description, 'c0-between', `${kt} (b) 編修落地`)
                let got2 = Object.fromEntries((await selectAll(kt)).map((r) => [r.id, r]))
                b.forEach((r, k) => {
                    if (r.from !== F) {
                        A.equal(got2[r.id].order, k + 1, `${kt} (b) 後台列 ${r.id} 之 order 為位置 ${k + 1}`)
                    }
                })
                A.ok(got2[x1.id] && got2[x2.id], `${kt} (b) X1、X2 仍在`)

                //(c) 帶回時改了 X1 之內容, 持舊基準(X1 不在基準內)→ saveStale/rowAdded、零寫入
                let cur3 = await rowsOf(kt)
                await expectStale(`${kt} 帶回 X1 並改其內容(舊基準)`, kt, patch(cur3, x1.id, { description: 'x1-edited-by-draft' }), ['rowChanged', 'rowAdded'], { baseline: B0 })

                //(d) 草稿取得基準 B4 之後, 他人改了別列 Z 的內容 → 草稿(只改 Yc)持 B4 送出 → saveStale/rowChanged(Z 非本次寫入之列, 表級仍拒; run07 版 Z 以舊內容帶回才拒)
                let cur4 = await rowsOf(kt)
                let B4 = baselineOf(kt, cur4)
                await mustWrite(`${kt} 他人改 Z`, kt, patch(cur4, Z, { description: 'z-by-other' }))
                A.equal((await rowOf(kt, Z)).description, 'z-by-other', '前提: Z 已被他人改內容')
                let cur5 = await rowsOf(kt)
                await expectStale(`${kt} 只改 Yc、Z 已被他人改(持 B4)`, kt, patch(cur5, Yc, { description: 'c0-stale-z' }), ['rowChanged'], { baseline: B4 })
                await expectStale(`${kt} 只改 Yc、Z 以舊內容帶回(持 B4)`, kt, patch(patch(cur4, Z, { description: R0.find((r) => r.id === Z).description }), Yc, { description: 'c0-stale-z' }), ['rowChanged'], { baseline: B4 })
            })
        }


        // ---------- 改 from ----------

        it('EX-006 改外部列之 from: 改為 \'\'／他來源／缺欄→saveExternalRowChanged; 改為非字串(null／0／false／123)→saveFromNotAllowed; 零寫入', async function() {
            await freshState()
            for (let kt of KTS) {
                let rows = await rowsOf(kt)
                let id = ext(kt, 0)
                for (let v of ['', 'appOther']) {
                    await expectReject(`${kt} 外部列 from→${JSON.stringify(v)}`, kt, patch(rows, id, { from: v }), 'saveExternalRowChanged')
                }
                let noFrom = rows.map((r) => {
                    if (r.id !== id) {
                        return r
                    }
                    let x = { ...r }
                    delete x.from
                    return x
                })
                await expectReject(`${kt} 外部列 from 缺欄`, kt, noFrom, 'saveExternalRowChanged')
                for (let v of BAD_FROMS) {
                    await expectReject(`${kt} 外部列 from→${JSON.stringify(v)}`, kt, patch(rows, id, { from: v }), 'saveFromNotAllowed')
                }
            }
        })

        it('EX-007 後台列改成非空 from(外部來源名／新來源名)或非字串→saveFromNotAllowed、零寫入', async function() {
            await freshState()
            for (let kt of KTS) {
                let rows = await rowsOf(kt)
                for (let v of [F, 'appNew', ...BAD_FROMS]) {
                    await expectReject(`${kt} 後台列 from→${JSON.stringify(v)}`, kt, patch(rows, BO[kt], { from: v }), 'saveFromNotAllowed')
                }
            }
        })

        it('EX-011 新增列之 from 為非字串(null／0／false／123): 四表皆 saveFromNotAllowed、零寫入', async function() {
            await freshState()
            for (let kt of KTS) {
                for (let v of BAD_FROMS) {
                    await expectReject(`${kt} 新增 from=${JSON.stringify(v)}`, kt, [...await rowsOf(kt), newRow(kt, 'f1', { from: v })], 'saveFromNotAllowed')
                }
            }
        })


        // ---------- 複製 ----------

        it('EX-008 複製外部列(新主鍵與不衝突之名稱／email, from 繼承 F, 標為 _isNew): saveFromNotAllowed、零寫入; 前端複製後重置 from 為 \'\'(且清空繼承之 srcKey)者成功; 只重置 from 而仍繼承 srcKey 者 saveFromNotAllowed', async function() {
            await freshState()
            for (let kt of KTS) {
                let rows = await rowsOf(kt)
                let src = rows.find((r) => r.id === ext(kt, 0))
                let cp = { ...src, id: nid(kt, 'cp'), _isNew: true }
                if (kt === 'users') {
                    cp.email = 'cp@copy.example.com'
                }
                if (kt === 'grups' || kt === 'pemis') {
                    cp.name = `${src.name}-copy`
                }
                await expectReject(`${kt} 複製外部列(from 繼承)`, kt, [...rows, cp], 'saveFromNotAllowed')
                //perm-run03: 來源鍵 srcKey 與 from 同為身分欄, 複製列須一併清空繼承之 srcKey(前端複製動作即設 r.srcKey = ''), 只重置 from 者仍帶外部列之來源鍵 → 後台不可新增帶 srcKey 之列
                await expectReject(`${kt} 複製外部列只重置 from(仍繼承 srcKey)`, kt, [...rows, { ...cp, from: '' }], 'saveFromNotAllowed')
                await mustWrite(`${kt} 複製外部列並重置 from 與 srcKey`, kt, [...rows, { ...cp, from: '', srcKey: '' }])
                let got = (await selectAll(kt)).find((r) => r.id === nid(kt, 'cp'))
                A.ok(got, `${kt} 複製列應落地`)
                A.equal(got.from, '', `${kt} 複製列為後台列`)
                A.equal((await extOf(kt)).length, 2, `${kt} 原外部列仍在`)
            }
        })


        // ---------- 舊審計欄 ----------

        it('EX-009 僅送回外部列之舊審計欄(更新者／更新時間; 外部同步改寫外部列之後以舊快照存檔): 成功(視為無變更), 外部列之審計欄與 order 不回退為舊值; 四表', async function() {
            for (let kt of KTS) {
                for (let withBaseline of [false, true]) {
                    let tag = `${kt}${withBaseline ? '(有基準)' : '(無基準)'}`
                    await freshState()
                    let snapOld = await rowsOf(kt) //舊快照(含外部列之舊審計欄)
                    await sleep(30)
                    //perm-run03: 差異同步下「內容相同之重送」為 nSame(零寫入), 不會改寫外部列(原 delAll＋insert 之整批重寫已不存在); 故由外部僅更新兩筆外部列之 order 數值(名次不變、內容不變)
                    //  造出「外部同步改寫了外部列, 持舊快照者之審計欄(更新時間)較舊」: order 由外部擁有、不入內容指紋; 建立者／建立時間於修改時保留, 異動的是更新者／更新時間
                    await mustSync(kt, { from: F, rows: fxRows(kt, { 0: { order: FX[kt][0].order + 1 }, 1: { order: FX[kt][1].order + 1 } }) })
                    let extNew = await extOf(kt)
                    let oldExt = snapOld.filter((r) => r.from === F).sort(byId)
                    A.notEqual(extNew[0].timeUpdate, oldExt[0].timeUpdate, `前提(${tag}): 外部列之更新時間已因外部同步改寫而更新`)
                    A.ok(extNew.every((r, i) => r.order !== oldExt[i].order), `前提(${tag}): 外部列 order 數值已由外部更新`)
                    A.deepEqual(extNew.map((r) => omit(r, [...SERVER, 'order'])), oldExt.map((r) => omit(r, [...SERVER, 'order'])), `前提(${tag}): 外部列內容(扣除審計欄與 order)未變`)

                    //舊快照＋後台列編修 → 成功(外部列僅審計欄不同, 視為無變更, 不需基準; 有基準時指紋排除審計欄, 依舊快照算之基準仍有效)
                    await mustWrite(`${tag} 舊審計欄之外部列＋後台列編修`, kt, patch(snapOld, BO[kt], { description: 'audit-edit' }), withBaseline ? { baseline: baselineOf(kt, snapOld) } : undefined)
                    A.equal((await rowOf(kt, BO[kt])).description, 'audit-edit', `${tag} 後台列編修落地`)
                    A.deepEqual(await extOf(kt), extNew, `${tag} 外部列(含審計欄)須逐位元維持外部同步重寫後之值, 不回退為舊快照之值`)
                }
            }
        })


        // ---------- order ----------

        it('EX-010 後台儲存(含重排)後: 外部列 order 不變、後台列 order 為其於送入陣列之位置 k+1; 四表', async function() {
            await freshState()
            for (let kt of KTS) {
                let rows = await rowsOf(kt)
                let exts = rows.filter((r) => r.from === F)
                let bos = rows.filter((r) => r.from !== F)
                let orderBefore = Object.fromEntries(exts.map((r) => [r.id, r.order]))
                //重排: 後台列反序, 兩筆外部列夾在其間(第 2、第 4 個位置)
                let rev = [...bos].reverse()
                let sent = [rev[0], exts[0], rev[1], exts[1], ...rev.slice(2)]
                await mustWrite(`${kt} 重排`, kt, sent)
                let after = Object.fromEntries((await selectAll(kt)).map((r) => [r.id, r.order]))
                sent.forEach((r, k) => {
                    if (r.from === F) {
                        A.equal(after[r.id], orderBefore[r.id], `${kt} 外部列 ${r.id} 之 order 須不變`)
                    }
                    else {
                        A.equal(after[r.id], k + 1, `${kt} 後台列 ${r.id} 之 order 須為位置 ${k + 1}`)
                    }
                })
            }
        })


        // ---------- kpFunExt opt ----------

        it('EX-013 kpFunExt 只採納 opt.baseline: 夾帶 pickKeysOnly 之效果同未夾帶(身分欄變更仍採納); 夾帶 lockExternalRows／其他鍵不能解除守門; opt 非物件不致失敗', async function() {
            await freshState()
            //users: modeEditUsers='y' 下 pickKeysOnly(['cgrups'])若被採納, 身分欄(name)之變更將被忽略; 實際應採納
            for (let kt of ['users', 'grups', 'pemis', 'targets']) {
                let af = T[kt].assign
                let pk = af ? [af] : ['description']
                //三種夾帶(基準於每次寫入前依當下列重算, 免前一次寫入使基準過期): 帶基準＋pickKeysOnly、只帶 pickKeysOnly、帶基準＋不存在欄位之 pickKeysOnly
                let optMakers = [
                    async () => ({ baseline: baselineOf(kt, await rowsOf(kt)), pickKeysOnly: pk }),
                    async () => ({ pickKeysOnly: pk }),
                    async () => ({ baseline: baselineOf(kt, await rowsOf(kt)), pickKeysOnly: ['__none__'] }),
                ]
                for (let [k, mkOpt] of optMakers.entries()) {
                    let opt = await mkOpt()
                    let desc = `edit-${kt}-${k}`
                    let patchBo = kt === 'users' ? { name: `${desc}-name`, description: desc } : { description: desc }
                    await mustWrite(`${kt} 夾帶 pickKeysOnly opt=${JSON.stringify(Object.keys(opt))}`, kt, patch(await rowsOf(kt), BO[kt], patchBo), opt)
                    let got = await rowOf(kt, BO[kt])
                    A.equal(got.description, desc, `${kt} 夾帶 pickKeysOnly 時身分欄(description)之變更仍應採納(同未夾帶)`)
                    if (kt === 'users') {
                        A.equal(got.name, `${desc}-name`, 'users.name 之變更仍應採納')
                    }
                }
                //夾帶 lockExternalRows／skipLock 等: 不被採納, 外部列刪除仍被拒
                let rows = await rowsOf(kt)
                for (let opt of [{ lockExternalRows: 'n' }, { lockExternalRows: false, baseline: baselineOf(kt, rows) }, { skipExternalCheck: true }, { opt: { lockExternalRows: 'n' } }]) {
                    await expectReject(`${kt} 夾帶 ${JSON.stringify(Object.keys(opt))} 不得解除守門`, kt, rows.filter((r) => r.id !== ext(kt, 0)), 'saveExternalRowChanged', opt)
                }
                //opt 非物件(字串、數字、布林、陣列、null): 同未給, 不致失敗; 此時無外部列變更→成功
                for (let opt of ['abc', 5, true, [], null]) {
                    await mustWrite(`${kt} opt=${JSON.stringify(opt)}`, kt, await rowsOf(kt), opt)
                }
            }
        })


        // ---------- 引用端改寫不受守門 ----------

        it('EX-014 外部群組被後台改名／刪除→拒(外部使用者之引用不變); 後台群組改名／刪除→連帶改寫外部使用者之 cgrups 成功(from 與身分欄不變)', async function() {
            await freshState()
            //預置: 後台群組 exB1、外部使用者 u1 引用外部群組 exG1、u2 引用後台群組 exB1(外部同步以 cgrups 鍵帶值)
            await mustWrite('預置後台群組 exB1', 'grups', [...await rowsOf('grups'), { ...newRow('grups', 'b1'), name: 'exB1' }])
            let uRows = clone(FX.users)
            uRows[0].cgrups = JSON.stringify({ exG1: ON })
            uRows[1].cgrups = JSON.stringify({ exB1: ON })
            await mustSync('users', { from: F, rows: uRows })
            let uExtBefore = await extOf('users')

            //外部群組改名／刪除 → 拒; 引用者不變
            let gRows = await rowsOf('grups')
            await expectReject('外部群組 exG1 改名', 'grups', patch(gRows, ext('grups', 0), { name: 'exG1-renamed' }), 'saveExternalRowChanged')
            await expectReject('外部群組 exG1 刪除', 'grups', gRows.filter((r) => r.id !== ext('grups', 0)), 'saveExternalRowChanged')
            A.deepEqual(await extOf('users'), uExtBefore, '外部使用者之引用不得被改動')

            //後台群組改名 → 外部使用者 u2 之 cgrups 連帶改寫
            let bId = nid('grups', 'b1')
            await mustWrite('後台群組 exB1 改名', 'grups', patch(await rowsOf('grups'), bId, { name: 'exB1-renamed' }))
            let u2 = await rowOf('users', ext('users', 1))
            A.deepEqual(JSON.parse(u2.cgrups), { 'exB1-renamed': ON }, '外部使用者 u2 之 cgrups 應連帶改為新名')
            A.equal(u2.from, F, '外部使用者 from 不變')
            A.deepEqual(omit(u2, ['cgrups', ...SERVER]), omit(uExtBefore.find((r) => r.id === u2.id), ['cgrups', ...SERVER]), '外部使用者除 cgrups 與審計欄外不變')
            A.equal(u2.userIdUpdate, 'id-for-admin', '連帶改寫之外部使用者以操作者記為更新者')
            A.deepEqual(JSON.parse((await rowOf('users', ext('users', 0))).cgrups), { exG1: ON }, '未命中之外部使用者 u1 不變')

            //後台群組刪除 → 外部使用者 u2 之 cgrups 清理
            await mustWrite('後台群組 exB1-renamed 刪除', 'grups', (await rowsOf('grups')).filter((r) => r.id !== bId))
            let u2b = await rowOf('users', ext('users', 1))
            A.deepEqual(JSON.parse(u2b.cgrups), {}, '外部使用者 u2 之引用應被清理')
            A.equal(u2b.from, F, '外部使用者 from 不變')

            //權限: 後台權限 exBP 被外部群組 g2 引用; 改名／刪除連帶改寫外部群組之 cpemis
            await mustWrite('預置後台權限 exBP', 'pemis', [...await rowsOf('pemis'), { ...newRow('pemis', 'bp'), name: 'exBP' }])
            let gs = clone(FX.grups)
            gs[1].cpemis = JSON.stringify({ exBP: ON })
            await mustSync('grups', { from: F, rows: gs })
            let pId = nid('pemis', 'bp')
            await expectReject('外部權限 exP1 改名', 'pemis', patch(await rowsOf('pemis'), ext('pemis', 0), { name: 'exP1-renamed' }), 'saveExternalRowChanged')
            await mustWrite('後台權限 exBP 改名', 'pemis', patch(await rowsOf('pemis'), pId, { name: 'exBP-renamed' }))
            A.deepEqual(JSON.parse((await rowOf('grups', ext('grups', 1))).cpemis), { 'exBP-renamed': ON }, '外部群組 g2 之 cpemis 應連帶改為新名')
            A.equal((await rowOf('grups', ext('grups', 1))).from, F)
            await mustWrite('後台權限 exBP-renamed 刪除', 'pemis', (await rowsOf('pemis')).filter((r) => r.id !== pId))
            A.deepEqual(JSON.parse((await rowOf('grups', ext('grups', 1))).cpemis), {}, '外部群組 g2 之引用應被清理')

            //標的: 後台標的被外部權限 p2 引用; 刪除連帶清理外部權限之 crules
            let tId = nid('targets', 't1')
            await mustWrite('預置後台標的', 'targets', [...await rowsOf('targets'), newRow('targets', 't1')])
            let ps = clone(FX.pemis)
            ps[1].crules = JSON.stringify({ [tId]: 'y' })
            await mustSync('pemis', { from: F, rows: ps })
            await expectReject('外部標的刪除', 'targets', (await rowsOf('targets')).filter((r) => r.id !== ext('targets', 0)), 'saveExternalRowChanged')
            await mustWrite('後台標的刪除', 'targets', (await rowsOf('targets')).filter((r) => r.id !== tId))
            let p2 = await rowOf('pemis', ext('pemis', 1))
            A.deepEqual(JSON.parse(p2.crules), {}, '外部權限 p2 之引用應被清理')
            A.equal(p2.from, F, '外部權限 from 不變')
        })


        // ---------- srLog ----------

        it('EX-015 srLog: 外部列守門與基準之拒絕各記 err key 與原因(只記鍵、原因、筆數、來源名稱; 不記列主鍵／名稱／email／欄位值)', async function() {
            await freshState()
            //perm-run03: 列識別有兩種(內部 id 由伺服端產生、來源鍵 srcKey), 兩者皆不得入 log
            let secrets = [FX.users[0].srcKey, ext('users', 0), 'exU1', 'ex-u1@ext.example.com', 'LOGSECRET-VALUE', 'lg1@new.example.com', 'n-lg1']
            let rows = await rowsOf('users')
            let u1 = ext('users', 0)
            let isEv = (ev, reason) => (l) => l.event === ev && l.reason === reason
            let cases = [
                { label: 'fieldChanged', run: () => write('users', patch(rows, u1, { name: 'LOGSECRET-VALUE' })), ev: 'updateTabItems-external-error', reason: 'fieldChanged', msg: 'saveExternalRowChanged', n: 1, froms: [F] },
                { label: 'addFrom', run: () => write('users', [...rows, newRow('users', 'lg1', { from: F, description: 'LOGSECRET-VALUE' })]), ev: 'updateTabItems-external-error', reason: 'addFrom', msg: 'saveFromNotAllowed', n: 1, froms: [F] },
                { label: 'del', run: () => write('users', rows.filter((r) => r.id !== u1)), ev: 'updateTabItems-external-error', reason: 'del', msg: 'saveExternalRowChanged', n: 1, froms: [F] },
                { label: 'fromChanged', run: () => write('users', patch(rows, u1, { from: 'LOGSECRET-VALUE' })), ev: 'updateTabItems-external-error', reason: 'fromChanged', msg: 'saveExternalRowChanged', n: 1, froms: [F] },
                { label: 'fromType', run: () => write('users', [...rows, newRow('users', 'lg2', { from: null, description: 'LOGSECRET-VALUE' })]), ev: 'updateTabItems-external-error', reason: 'fromType', msg: 'saveFromNotAllowed', n: 1, froms: [] },
                { label: 'externalAssignNoBaseline', run: () => write('users', patch(rows, u1, { cgrups: AV.users[0] })), ev: 'updateTabItems-stale-error', reason: 'externalAssignNoBaseline', msg: 'saveBaselineRequired' },
                { label: 'rowAdded', run: () => write('users', patch(rows, u1, { cgrups: AV.users[0] }), { baseline: [] }), ev: 'updateTabItems-stale-error', reason: 'rowAdded', msg: 'saveStale', n: rows.length },
                //perm-run01: 原 ev updateTabItems-validate-error／reason baselineInvalid／msg saveRowFieldInvalid 改為 updateTabItems-stale-error／baselineFormat／saveBaselineFormat(n: 0)
                { label: 'baselineFormat', run: () => write('users', patch(rows, u1, { cgrups: AV.users[0] }), { baseline: 'LOGSECRET-VALUE' }), ev: 'updateTabItems-stale-error', reason: 'baselineFormat', msg: 'saveBaselineFormat', n: 0 },
            ]
            for (let c of cases) {
                let mark = await markSrLog()
                let r = await c.run()
                A.equal(r.ok, false, `${c.label} 應被拒，實得: ${JSON.stringify(brief(r))}`)
                A.equal(r.msg, c.msg, `${c.label} 回應鍵`)
                let lines = await waitLines(mark, isEv(c.ev, c.reason), c.label)
                let l = lines.find(isEv(c.ev, c.reason))
                A.equal(l.level, 50, `${c.label} 應為 error 層級`)
                A.equal(l.keyTable, 'users', `${c.label} 記表名`)
                A.equal(l.msg, c.msg, `${c.label} 記 err key`)
                if (c.n !== undefined) {
                    A.equal(l.n, c.n, `${c.label} 記筆數`)
                }
                if (c.froms !== undefined) {
                    A.deepEqual(l.froms, c.froms, `${c.label} 記來源名稱`)
                }
                for (let s of secrets) {
                    A.ok(!l._raw.includes(s), `${c.label} log 不得含列主鍵／名稱／email／欄位值「${s}」: ${l._raw}`)
                }
            }
        })


        // ---------- 外部同步 ----------

        it('EX-020 外部同步 users: payload 缺 cgrups 鍵→保留庫內值(含後台已指派者; 依 srcKey 配對; 名稱等其他欄位以外部為準); 帶鍵(含空字串)→以外部為準; 新使用者缺鍵→\'\'', async function() {
            await freshState()
            const F2 = 'appKeep'
            const V = AV.users
            let u = (srcKey, name, o = {}) => ({ srcKey, order: 0, name, email: `${srcKey}@keep.example.com`, description: 'keep', isAdmin: 'n', isActive: 'y', ...o })
            let idOf = (srcKey) => rid('users', srcKey, F2) //外部使用者之內部 id(伺服端產生), 經 mustSync 登錄
            //預置: 兩位外部使用者(cgrups '{}'), 由後台以正確基準指派 V0／V1; 後台列(from '')與他分區外部列(F)不應受影響
            await mustSync('users', { from: F2, rows: [u('sk-kp-1', 'kp1', { cgrups: '{}' }), u('sk-kp-2', 'kp2', { cgrups: '{}' })] })
            let rows = await rowsOf('users')
            await mustWrite('後台指派 cgrups', 'users', patch(patch(rows, idOf('sk-kp-1'), { cgrups: V[0] }), idOf('sk-kp-2'), { cgrups: V[1] }), { baseline: baselineOf('users', rows) })
            A.equal((await rowOf('users', idOf('sk-kp-1'))).cgrups, V[0], '前提: 後台已指派')
            let othersBefore = JSON.stringify((await selectAll('users')).filter((r) => r.from !== F2).sort(byId))

            //(1) 再同步一次且不帶 cgrups 鍵(含改名)＋新使用者缺鍵 → 保留庫內值(同 srcKey 配對, id 不變); 新使用者為 ''
            let id1 = idOf('sk-kp-1')
            let mark = await markSrLog()
            await mustSync('users', { from: F2, rows: [u('sk-kp-1', 'kp1-renamed'), u('sk-kp-2', 'kp2'), u('sk-kp-3', 'kp3')] })
            let got = Object.fromEntries((await extOf('users', F2)).map((r) => [r.srcKey, r]))
            A.equal(got['sk-kp-1'].id, id1, '(1) 同 srcKey 修改, 內部 id 不變')
            A.equal(got['sk-kp-1'].cgrups, V[0], '(1) sk-kp-1 缺鍵→保留 V0')
            A.equal(got['sk-kp-1'].name, 'kp1-renamed', '(1) 其他欄位以外部為準')
            A.equal(got['sk-kp-2'].cgrups, V[1], '(1) sk-kp-2 缺鍵→保留 V1')
            A.equal(got['sk-kp-3'].cgrups, '', '(1) 新使用者缺鍵→\'\'')
            A.equal(JSON.stringify((await selectAll('users')).filter((r) => r.from !== F2).sort(byId)), othersBefore, '(1) 他分區(後台列、F 外部列)逐位元不變')
            let lines = await waitLines(mark, (l) => l.event === 'syncAndReplaceTabs-keepAssign', 'keepAssign log')
            let ka = lines.find((l) => l.event === 'syncAndReplaceTabs-keepAssign')
            A.deepEqual({ keyTable: ka.keyTable, from: ka.from, field: ka.field, n: ka.n }, { keyTable: 'users', from: F2, field: 'cgrups', n: 2 }, `(1) keepAssign log 只記表名／來源／欄位／筆數(實得 ${ka._raw})`)
            A.ok(!ka._raw.includes('kp1') && !ka._raw.includes('@keep.example.com') && !ka._raw.includes(V[0]), '(1) keepAssign log 不得含使用者名稱／email／授權值')

            //(2) 帶 cgrups 鍵 → 以外部為準(含空字串、含 '{}'、含新值); 同批混合(kp-1 缺鍵、kp-2 帶鍵)
            await mustSync('users', { from: F2, rows: [u('sk-kp-1', 'kp1-renamed'), u('sk-kp-2', 'kp2', { cgrups: '' }), u('sk-kp-3', 'kp3', { cgrups: V[2] })] })
            got = Object.fromEntries((await extOf('users', F2)).map((r) => [r.srcKey, r]))
            A.equal(got['sk-kp-1'].cgrups, V[0], '(2) 同批缺鍵者仍保留 V0')
            A.equal(got['sk-kp-2'].cgrups, '', '(2) 帶鍵(空字串)→以外部為準')
            A.equal(got['sk-kp-3'].cgrups, V[2], '(2) 帶鍵(新值)→以外部為準')
            await mustSync('users', { from: F2, rows: [u('sk-kp-1', 'kp1-renamed', { cgrups: '{}' })] })
            A.equal((await rowOf('users', id1)).cgrups, '{}', '(2) 帶鍵(\'{}\')→以外部為準')

            //(3) 以 srcKey 配對: 缺鍵但 srcKey 改變(無法配對)→ ''(視為新使用者; 舊列依差異同步刪除, 不依 email／名稱繼承指派)
            await mustWrite('後台再指派', 'users', patch(await rowsOf('users'), id1, { cgrups: V[0] }), { baseline: baselineOf('users', await rowsOf('users')) })
            await mustSync('users', { from: F2, rows: [u('sk-kp-1x', 'kp1-renamed')] })
            A.equal((await rowOf('users', idOf('sk-kp-1x'))).cgrups, '', '(3) 缺鍵且 srcKey 無法配對(預設 mappingBy=id, 不依 email)→\'\'')
            A.equal(await rowOf('users', id1), undefined, '(3) 舊列(舊 srcKey)已隨差異同步刪除')
        })

        it('EX-021 外部同步 grups／pemis 缺 cpemis／crules 鍵 → 保留庫內值(比照 users.cgrups; 實體身分依 srcKey; 其他欄位以外部為準); 含鍵(含空字串)以外部為準; 新實體缺鍵為 \'\'; 他分區不變; info log 只記表名／來源／欄位／筆數', async function() {
            await freshState()
            for (let kt of ['grups', 'pemis']) {
                let af = T[kt].assign
                let rows = await rowsOf(kt)
                await mustWrite(`${kt} 後台指派`, kt, patch(patch(rows, ext(kt, 0), { [af]: AV[kt][0] }), ext(kt, 1), { [af]: AV[kt][1] }), { baseline: baselineOf(kt, rows) })
                A.equal((await rowOf(kt, ext(kt, 0)))[af], AV[kt][0], `前提: ${kt} 後台已指派 0`)
                A.equal((await rowOf(kt, ext(kt, 1)))[af], AV[kt][1], `前提: ${kt} 後台已指派 1`)
                let othersBefore = JSON.stringify((await selectAll(kt)).filter((r) => r.from !== F).sort(byId))
                let noKey = (x) => omit(x, [af])
                let fx = clone(FX[kt])
                let srcNew = `sk-ex-keep-${kt}`
                let id0 = ext(kt, 0)

                //(1) 缺鍵: 兩既有實體(第一列同批改描述)＋新實體 → 既有者保留(同 srcKey 配對, id 不變)、其他欄位以外部為準; 新實體為 ''
                let mark = await markSrLog()
                await mustSync(kt, { from: F, rows: [noKey({ ...fx[0], description: 'ext-desc-changed' }), noKey(fx[1]), noKey({ srcKey: srcNew, order: 90, name: `exNew-${kt}`, description: 'new' })] })
                let got = Object.fromEntries((await extOf(kt)).map((r) => [r.srcKey, r]))
                A.equal(got[fx[0].srcKey].id, id0, `(1) ${kt} 同 srcKey 修改, 內部 id 不變`)
                A.equal(got[fx[0].srcKey][af], AV[kt][0], `(1) ${kt} 缺 ${af} 鍵 → 保留後台指派 0`)
                A.equal(got[fx[0].srcKey].description, 'ext-desc-changed', `(1) ${kt} 其他欄位以外部為準`)
                A.equal(got[fx[1].srcKey][af], AV[kt][1], `(1) ${kt} 缺鍵 → 保留後台指派 1`)
                A.equal(got[srcNew][af], '', `(1) ${kt} 新實體缺鍵 → ''`)
                A.equal(JSON.stringify((await selectAll(kt)).filter((r) => r.from !== F).sort(byId)), othersBefore, `(1) ${kt} 他分區(後台列)逐位元不變`)
                let lines = await waitLines(mark, (l) => l.event === 'syncAndReplaceTabs-keepAssign' && l.keyTable === kt, `${kt} keepAssign log`)
                let ka = lines.find((l) => l.event === 'syncAndReplaceTabs-keepAssign' && l.keyTable === kt)
                A.deepEqual({ keyTable: ka.keyTable, from: ka.from, field: ka.field, n: ka.n }, { keyTable: kt, from: F, field: af, n: 2 }, `(1) ${kt} keepAssign log 只記表名／來源／欄位／筆數(實得 ${ka._raw})`)
                noLeakLine(ka, [fx[0].srcKey, id0, fx[0].name, 'ext-desc-changed', AV[kt][0], AV[kt][1]], `(1) ${kt} keepAssign log(列主鍵／來源鍵／名稱／描述／授權值)`)
                A.ok(!lines.some((l) => l.event === 'syncAndReplaceTabs-keepAssign-skip' && l.keyTable === kt), `(1) ${kt} 全數保留成功, 不得有 keepAssign-skip warn`)

                //(2) 含鍵 → 以外部為準(空字串／新值), 同批缺鍵者仍保留
                await mustSync(kt, { from: F, rows: [{ ...fx[0], [af]: '' }, noKey(fx[1]), { srcKey: srcNew, order: 90, name: `exNew-${kt}`, description: 'new', [af]: AV[kt][2] }] })
                got = Object.fromEntries((await extOf(kt)).map((r) => [r.srcKey, r]))
                A.equal(got[fx[0].srcKey][af], '', `(2) ${kt} 含鍵(空字串) → 以外部為準`)
                A.equal(got[fx[1].srcKey][af], AV[kt][1], `(2) ${kt} 同批缺鍵者仍保留`)
                A.equal(got[srcNew][af], AV[kt][2], `(2) ${kt} 含鍵(新值) → 以外部為準`)

                //(3) srcKey 對不到(換 srcKey → 視為新實體; 舊列依差異同步刪除)缺鍵 → ''
                await mustSync(kt, { from: F, rows: [noKey({ ...fx[1], srcKey: `${fx[1].srcKey}-x` })] })
                A.equal((await extOf(kt))[0][af], '', `(3) ${kt} 缺鍵但 srcKey 對不到 → ''`)
            }
        })

        //perm-run03: 原 EX-021b『缺鍵且無 id 之列依名稱對應庫內同 from 恰 1 筆 → 保留』已不存在——外部不再送 id(送 id 整批 idNotAllowed, 見 api-syncAndReplaceTabs API-sync-030), 身分只有 srcKey, 不依名稱對應;
        //  對應之新規則: 同名而 srcKey 不同＝刪舊增新＝新實體, 缺鍵 → ''(不依名稱繼承舊列之後台指派; 原則 6 新實體不繼承), 舊列被刪; 同 srcKey 者照常保留
        it('EX-021b 外部同步 grups／pemis 同名異 srcKey(來源鍵重編)且缺鍵: 視為新實體 → \'\'(不依名稱繼承舊列之後台指派), 舊列(舊 srcKey)被刪; 同 srcKey 之另一列缺鍵 → 保留', async function() {
            await freshState()
            for (let kt of ['grups', 'pemis']) {
                let af = T[kt].assign
                let rows = await rowsOf(kt)
                await mustWrite(`${kt} 後台指派`, kt, patch(rows, ext(kt, 0), { [af]: AV[kt][0] }), { baseline: baselineOf(kt, rows) })
                let oldId = ext(kt, 0)
                let srcRenum = `sk-ex-renum-${kt}`
                await mustSync(kt, { from: F, rows: [omit({ ...FX[kt][0], srcKey: srcRenum }, [af]), omit(FX[kt][1], [af])] })
                let got = Object.fromEntries((await extOf(kt)).map((r) => [r.srcKey, r]))
                A.deepEqual(Object.keys(got).sort(), [srcRenum, FX[kt][1].srcKey].sort(), `${kt} 舊 srcKey 之列已刪、新 srcKey 之列已增`)
                A.equal(await rowOf(kt, oldId), undefined, `${kt} 舊列(舊 srcKey)已刪除`)
                A.notEqual(got[srcRenum].id, oldId, `${kt} 同名異 srcKey 之列為新實體(新 id)`)
                A.equal(got[srcRenum].name, FX[kt][0].name, `${kt} 名稱沿用`)
                A.equal(got[srcRenum][af], '', `${kt} 同名異 srcKey、缺鍵 → '' (不依名稱繼承舊列之後台指派)`)
                A.equal(got[FX[kt][1].srcKey][af], FX[kt][1][af], `${kt} 同 srcKey 之另一列缺鍵 → 保留庫內值(夾具原值)`)
            }
        })

        it('EX-021c 外部同步 grups／pemis 同 srcKey 改名且缺鍵(cascadeRename 預設 true): 保留(同一實體, id 不變), 且引用它的後台使用者／群組之引用同時被級聯改寫為新名(保留的指派與引用一起跟著走, 授權仍連到同一實體)', async function() {
            await freshState()
            //引用端: grups 被後台使用者(BO.users)的 cgrups 引用; pemis 被後台群組(BO.grups)的 cpemis 引用
            const HOLD = { grups: { kt: 'users', id: BO.users, field: 'cgrups' }, pemis: { kt: 'grups', id: BO.grups, field: 'cpemis' } }
            for (let kt of ['grups', 'pemis']) {
                let af = T[kt].assign
                let h = HOLD[kt]
                let oldName = FX[kt][0].name
                let rows = await rowsOf(kt)
                await mustWrite(`${kt} 後台指派`, kt, patch(rows, ext(kt, 0), { [af]: AV[kt][0] }), { baseline: baselineOf(kt, rows) })
                let hrows = await rowsOf(h.kt)
                await mustWrite(`${h.kt} 引用外部 ${kt}`, h.kt, patch(hrows, h.id, { [h.field]: JSON.stringify({ [oldName]: ON }) }), { baseline: baselineOf(h.kt, hrows) })
                A.deepEqual(Object.keys(JSON.parse((await rowOf(h.kt, h.id))[h.field])), [oldName], `${kt} 前提: 引用端引用舊名`)
                let mark = await markSrLog()
                await mustSync(kt, { from: F, rows: [omit({ ...FX[kt][0], name: `${oldName}-renamed` }, [af]), omit(FX[kt][1], [af])] })
                let g = await rowOf(kt, ext(kt, 0))
                A.equal(g.name, `${oldName}-renamed`, `${kt} 改名以外部為準`)
                A.equal(g[af], AV[kt][0], `${kt} 同 srcKey 改名缺鍵 → 保留後台指派`)
                A.deepEqual(Object.keys(JSON.parse((await rowOf(h.kt, h.id))[h.field])), [`${oldName}-renamed`], `${kt} 引用端之引用已級聯改寫為新名(保留的指派與引用一起跟著走)`)
                let lines = await waitLines(mark, (l) => l.event === 'syncAndReplaceTabs-keepAssign' && l.keyTable === kt, `${kt} keepAssign log`)
                A.ok(!lines.some((l) => l.event === 'syncAndReplaceTabs-keepAssign-skip' && l.keyTable === kt), `${kt} 保留成功, 不得有 keepAssign-skip warn`)
            }
        })

        //perm-run03: 原『同名異 id』之 id 重編偵測，判定口徑隨差異同步改為『同名異 srcKey』(疑似外部來源鍵重編: 如目錄重建後 GUID 全換 → 每列等於刪舊增新、引用每次被清、後台指派被抹掉); 事件名 syncAndReplaceTabs-idRenumber → syncAndReplaceTabs-srcKeyRenumber
        it('EX-022 外部同步 grups／pemis 同一 from 同批同名異 srcKey: srLog warn syncAndReplaceTabs-srcKeyRenumber(只含表名、來源、筆數; 不含名稱／srcKey)、getWebInfor.syncWarns 登錄; 之後同步已無此情形即清除(兩表各自登錄、互不影響)', async function() {
            await freshState()
            const F3 = 'appRenum'
            let mk = (kt, srcKey, name) => (kt === 'grups' ? { srcKey, order: 0, name, description: 'rn', cpemis: '{}' } : { srcKey, order: 0, name, description: 'rn', crules: '{}' })
            for (let kt of ['grups', 'pemis']) {
                await mustSync(kt, { from: F3, rows: [mk(kt, `sk-rn-${kt}-1`, `rnA-${kt}`), mk(kt, `sk-rn-${kt}-2`, `rnB-${kt}`)] })
            }
            A.deepEqual((await getInfor()).syncWarns, [], '前提: 首次同步(庫內無同名異 srcKey)不登錄')

            //grups 發生 srcKey 重編: 同名 rnA 換新 srcKey、舊 srcKey 不在本批
            let mark = await markSrLog()
            await mustSync('grups', { from: F3, rows: [mk('grups', 'sk-rn-grups-3', 'rnA-grups'), mk('grups', 'sk-rn-grups-2', 'rnB-grups')] })
            let warns = (await getInfor()).syncWarns
            A.equal(warns.length, 1, `grups 重編後應登錄 1 筆，實得 ${JSON.stringify(warns)}`)
            A.deepEqual({ keyTable: warns[0].keyTable, from: warns[0].from, n: warns[0].n }, { keyTable: 'grups', from: F3, n: 1 }, '登錄之表名／來源／筆數')
            A.ok(typeof warns[0].time === 'string' && !Number.isNaN(Date.parse(warns[0].time)), `登錄之 time 應為可解析之時間字串，實得 ${warns[0].time}`)
            A.deepEqual(Object.keys(warns[0]).sort(), ['from', 'keyTable', 'n', 'time'], '登錄只含表名、來源、筆數、時間(不含個資)')
            let lines = await waitLines(mark, (l) => l.event === 'syncAndReplaceTabs-srcKeyRenumber', 'srcKeyRenumber log')
            let w = lines.filter((l) => l.event === 'syncAndReplaceTabs-srcKeyRenumber')
            A.equal(w.length, 1, '應記 1 筆 warn')
            A.equal(w[0].level, 40, '事件層級應為 warn(40)')
            A.deepEqual({ keyTable: w[0].keyTable, from: w[0].from, n: w[0].n }, { keyTable: 'grups', from: F3, n: 1 }, 'warn log 之表名／來源／筆數')
            for (let s of ['rnA', 'rnB', 'sk-rn-']) {
                A.ok(!w[0]._raw.includes(s), `warn log 不得含名稱／srcKey 值「${s}」: ${w[0]._raw}`)
            }

            //pemis 亦發生: 兩表各一筆登錄
            await mustSync('pemis', { from: F3, rows: [mk('pemis', 'sk-rn-pemis-3', 'rnA-pemis'), mk('pemis', 'sk-rn-pemis-2', 'rnB-pemis')] })
            warns = (await getInfor()).syncWarns
            A.deepEqual(warns.map((x) => `${x.keyTable}:${x.from}:${x.n}`).sort(), [`grups:${F3}:1`, `pemis:${F3}:1`], 'grups 與 pemis 各登錄 1 筆')

            //下一次 grups 同步已無此情形(同 srcKey 同名重送) → 清除 grups 之登錄, pemis 之登錄仍在
            await mustSync('grups', { from: F3, rows: [mk('grups', 'sk-rn-grups-3', 'rnA-grups'), mk('grups', 'sk-rn-grups-2', 'rnB-grups')] })
            warns = (await getInfor()).syncWarns
            A.deepEqual(warns.map((x) => `${x.keyTable}:${x.from}:${x.n}`), [`pemis:${F3}:1`], 'grups 之登錄應被清除, pemis 之登錄仍在')
            await mustSync('pemis', { from: F3, rows: [mk('pemis', 'sk-rn-pemis-3', 'rnA-pemis'), mk('pemis', 'sk-rn-pemis-2', 'rnB-pemis')] })
            A.deepEqual((await getInfor()).syncWarns, [], '兩表皆已無此情形後 syncWarns 應為空')
        })

        it('EX-023 外部同步 grups 不屬同名異 srcKey 之情形不登錄: 同 srcKey 改名、新增新名新 srcKey、只刪除、users／targets 同步', async function() {
            await freshState()
            const F4 = 'appRenum2'
            let g = (srcKey, name) => ({ srcKey, order: 0, name, description: 'rn', cpemis: '{}' })
            await mustSync('grups', { from: F4, rows: [g('sk-r2-1', 'r2A'), g('sk-r2-2', 'r2B')] })
            await mustSync('grups', { from: F4, rows: [g('sk-r2-1', 'r2A-renamed'), g('sk-r2-2', 'r2B')] }) //同 srcKey 改名
            A.deepEqual((await getInfor()).syncWarns, [], '同 srcKey 改名不登錄')
            await mustSync('grups', { from: F4, rows: [g('sk-r2-1', 'r2A-renamed'), g('sk-r2-3', 'r2C')] }) //sk-r2-2 被刪、新名新 srcKey
            A.deepEqual((await getInfor()).syncWarns, [], '刪除舊列＋新增新名新 srcKey 不登錄(名稱不同)')
            await mustSync('grups', { from: F4, rows: [g('sk-r2-1', 'r2A-renamed')] }) //只刪除
            A.deepEqual((await getInfor()).syncWarns, [], '只刪除不登錄')
            //users／targets 同步(同名異 srcKey 不適用)
            await mustSync('users', { from: F4, rows: [{ srcKey: 'sk-r2-u1', order: 0, name: 'same', email: 'r2u1@e.com', cgrups: '{}', isAdmin: 'n', isActive: 'y' }] })
            await mustSync('users', { from: F4, rows: [{ srcKey: 'sk-r2-u2', order: 0, name: 'same', email: 'r2u2@e.com', cgrups: '{}', isAdmin: 'n', isActive: 'y' }] })
            A.deepEqual((await getInfor()).syncWarns, [], 'users 之 name 可重複, 同名異 srcKey 不登錄')
        })

    })


    // ===== B. mappingBy=email: 外部同步缺 cgrups 鍵之對應 =====

    describe('B. mappingBy=email', function() {

        before(async function() {
            this.timeout(300000)
            await restartBackend(genTempSettings({ mappingBy: 'email' }))
        })
        after(async function() {
            this.timeout(300000)
            await restartBackend('./settings.json')
        })

        //perm-run03: 原 EX-030『缺 cgrups 鍵且無 id: 依 email 對應庫內同 from 恰 1 筆 → 保留; 有 id 但 email(對應鍵)已變 → 不保留並記 mapKeyConflict warn; 同 email 命中 2 筆 → 不保留』隨『外部不再送 id』而改為依 srcKey 認列:
        //  無 id 路徑(依 email 對到舊列)不復存在; 但『對應鍵(email)被改 → 不保留並記 warn』之收嚴保留(外審 sol#1: 登入以 email 找使用者, 保留指派會使新 email 之持有者取得原擁有者之授權——換主移轉)——
        //  mappingBy=email 下: 同 srcKey 同 email 缺鍵 → 保留; 同 srcKey 但 email 被外部改變 → ''(不保留並記 keepAssign-skip warn, reason identityConflict); 新 srcKey(含沿用舊列 email 者)→ ''(不依 email 繼承), 舊列刪除
        it('EX-030 缺 cgrups 鍵(mappingBy=email): 身分依 srcKey 配對, 不依 email——同 srcKey 同 email 缺鍵→保留; 同 srcKey 但 email(登入對應鍵)被外部改變→\'\'並記 keepAssign-skip warn; 新 srcKey(含沿用舊列 email 者)→\'\'; 舊列(含同 email 之啟用與停用列)依差異同步刪除', async function() {
            await freshState()
            const F2 = 'appKeepE'
            const V = AV.users
            let u = (o) => ({ order: 0, description: 'ke', isAdmin: 'n', isActive: 'y', ...o })
            await mustSync('users', { from: F2, rows: [
                u({ srcKey: 'sk-ke-1', name: 'ke1', email: 'ke1@keep.example.com', cgrups: '{}' }),
                u({ srcKey: 'sk-ke-2', name: 'ke2', email: 'ke2@keep.example.com', cgrups: '{}' }),
                u({ srcKey: 'sk-ke-3', name: 'ke3a', email: 'ke3@keep.example.com', cgrups: '{}' }), //與 ke-4 同 email: 一啟用一停用
                u({ srcKey: 'sk-ke-4', name: 'ke3b', email: 'ke3@keep.example.com', cgrups: '{}', isActive: 'n' }),
            ] })
            let idOf = (srcKey) => rid('users', srcKey, F2)
            let rows = await rowsOf('users')
            await mustWrite('後台指派', 'users', patch(patch(patch(rows, idOf('sk-ke-1'), { cgrups: V[0] }), idOf('sk-ke-2'), { cgrups: V[1] }), idOf('sk-ke-3'), { cgrups: V[2] }), { baseline: baselineOf('users', rows) })
            let id1 = idOf('sk-ke-1')
            let id2 = idOf('sk-ke-2')

            //全部缺 cgrups 鍵: ke1(同 srcKey 同 email→保留, 內容全同＝nSame)、ke2(同 srcKey、email 被外部改→不保留='', 計入修改)、新 srcKey 新 email(→'')、
            //  新 srcKey 沿用舊 ke-3 之 email(→'', 不依 email 繼承 V2; 舊 ke-3／ke-4 不在批次而刪除)
            let mark = await markSrLog()
            let r = await mustSync('users', { from: F2, rows: [
                u({ srcKey: 'sk-ke-1', name: 'ke1', email: 'ke1@keep.example.com' }),
                u({ srcKey: 'sk-ke-2', name: 'ke2', email: 'ke2-changed@keep.example.com' }),
                u({ srcKey: 'sk-ke-new', name: 'ke-new', email: 'ke-new@keep.example.com' }),
                u({ srcKey: 'sk-ke-5', name: 'ke3-new', email: 'ke3@keep.example.com' }),
            ] })
            A.deepEqual(r.msg, { nAdd: 2, nUpdate: 1, nDel: 2, nSame: 1 }, '計數: 新增 2(sk-ke-new、sk-ke-5)、修改 1(sk-ke-2 改 email)、刪除 2(舊 ke-3、ke-4)、不變 1(sk-ke-1)')
            let got = Object.fromEntries((await extOf('users', F2)).map((x) => [x.srcKey, x]))
            A.deepEqual(Object.keys(got).sort(), ['sk-ke-1', 'sk-ke-2', 'sk-ke-5', 'sk-ke-new'], '存續者為批次四列')
            A.equal(got['sk-ke-1'].id, id1, 'sk-ke-1 內部 id 不變')
            A.equal(got['sk-ke-1'].cgrups, V[0], '同 srcKey 缺鍵→保留')
            A.equal(got['sk-ke-2'].id, id2, 'sk-ke-2 內部 id 不變')
            A.equal(got['sk-ke-2'].cgrups, '', '同 srcKey、email(mappingBy 對應鍵)被外部改變、缺鍵→不保留(登入以 email 找使用者, 保留會使新 email 之持有者取得原擁有者之授權)')
            A.equal(got['sk-ke-2'].email, 'ke2-changed@keep.example.com', 'email 以外部為準')
            A.equal(got['sk-ke-new'].cgrups, '', '新 srcKey 新 email→\'\'')
            A.equal(got['sk-ke-5'].cgrups, '', '新 srcKey 沿用舊列 email→\'\'(不依 email 繼承舊列之指派)')

            //keepAssign info 記 n=1(ke1), keepAssign-skip warn 記 n=1 reason identityConflict(ke2; 收嚴須附提示), 皆不含個資值
            let lines = await waitLines(mark, (l) => l.event === 'syncAndReplaceTabs-keepAssign-skip', 'keepAssign-skip log')
            let ka = lines.find((l) => l.event === 'syncAndReplaceTabs-keepAssign')
            A.deepEqual({ keyTable: ka.keyTable, from: ka.from, field: ka.field, n: ka.n }, { keyTable: 'users', from: F2, field: 'cgrups', n: 1 }, `keepAssign log(實得 ${ka._raw})`)
            let sk = lines.find((l) => l.event === 'syncAndReplaceTabs-keepAssign-skip')
            A.deepEqual({ keyTable: sk.keyTable, from: sk.from, field: sk.field, n: sk.n, reason: sk.reason }, { keyTable: 'users', from: F2, field: 'cgrups', n: 1, reason: 'identityConflict' }, `keepAssign-skip log(實得 ${sk._raw})`)
            noLeakLine(ka, ['keep.example.com', 'ke1', 'ke2', 'ke3'], 'keepAssign log(email／名稱)')
            noLeakLine(sk, ['keep.example.com', 'ke1', 'ke2', 'ke3'], 'keepAssign-skip log(email／名稱)')
        })

    })


    // ===== C. mappingBy=name =====

    describe('C. mappingBy=name', function() {

        before(async function() {
            this.timeout(300000)
            await restartBackend(genTempSettings({ mappingBy: 'name' }))
        })
        after(async function() {
            this.timeout(300000)
            await restartBackend('./settings.json')
        })

        //perm-run03: 原 EX-031『缺鍵且無 id: 依 name 對應庫內同 from 恰 1 筆 → 保留; 對到 2 筆 → 不保留』隨外部不再送 id 而不復存在(理由見 EX-030); 改為對應之新規則——
        //  mappingBy=name 下缺鍵保留之身分是 srcKey: 同 srcKey 同 name(email 非對應鍵, 被外部改變)→保留; 新 srcKey 沿用舊列 name→''(不依 name 繼承), 舊列刪除; 同 srcKey 但 name(對應鍵)被改→不保留(見 EX-030 同理與 unit-syncCore SC-K*)
        it('EX-031 缺 cgrups 鍵(mappingBy=name): 身分依 srcKey 配對, 不依 name——同 srcKey 缺鍵→保留(email 以外部為準); 新 srcKey→\'\'; 新 srcKey 沿用舊列 name→\'\'(不依 name 繼承), 舊列(含同 name 之啟用與停用列)依差異同步刪除', async function() {
            await freshState()
            const F2 = 'appKeepN'
            const V = AV.users
            let u = (o) => ({ order: 0, description: 'kn', isAdmin: 'n', isActive: 'y', cgrups: '{}', ...o })
            await mustSync('users', { from: F2, rows: [
                u({ srcKey: 'sk-kn-1', name: 'kn1', email: 'kn1@keep.example.com' }),
                u({ srcKey: 'sk-kn-2', name: 'kn2', email: 'kn2a@keep.example.com' }), //與 kn-3 同 name: 一啟用一停用
                u({ srcKey: 'sk-kn-3', name: 'kn2', email: 'kn2b@keep.example.com', isActive: 'n' }),
            ] })
            let idOf = (srcKey) => rid('users', srcKey, F2)
            let rows = await rowsOf('users')
            await mustWrite('後台指派', 'users', patch(patch(rows, idOf('sk-kn-1'), { cgrups: V[0] }), idOf('sk-kn-2'), { cgrups: V[1] }), { baseline: baselineOf('users', rows) })
            let id1 = idOf('sk-kn-1')
            let noKey = omit(u({}), ['cgrups']) //不帶 cgrups 鍵
            let r = await mustSync('users', { from: F2, rows: [
                { ...noKey, srcKey: 'sk-kn-1', name: 'kn1', email: 'kn1-changed@keep.example.com' },
                { ...noKey, srcKey: 'sk-kn-new', name: 'kn-new', email: 'kn-new@keep.example.com' },
                { ...noKey, srcKey: 'sk-kn-5', name: 'kn2', email: 'kn2c@keep.example.com' }, //新 srcKey、沿用舊 kn-2 之 name
            ] })
            A.deepEqual(r.msg, { nAdd: 2, nUpdate: 1, nDel: 2, nSame: 0 }, '計數: 新增 2、修改 1(sk-kn-1 改 email)、刪除 2(舊 kn-2、kn-3)')
            let got = Object.fromEntries((await extOf('users', F2)).map((x) => [x.srcKey, x]))
            A.deepEqual(Object.keys(got).sort(), ['sk-kn-1', 'sk-kn-5', 'sk-kn-new'], '存續者為批次三列')
            A.equal(got['sk-kn-1'].id, id1, 'sk-kn-1 內部 id 不變')
            A.equal(got['sk-kn-1'].cgrups, V[0], '同 srcKey 缺鍵→保留')
            A.equal(got['sk-kn-1'].email, 'kn1-changed@keep.example.com', 'email 以外部為準')
            A.equal(got['sk-kn-new'].cgrups, '', '新 srcKey→\'\'')
            A.equal(got['sk-kn-5'].cgrups, '', '新 srcKey 沿用舊列 name→\'\'(不依 name 繼承舊列之指派)')
        })

    })


    // ===== D. lockExternalRows='n'(舊行為迴歸) =====

    describe('D. lockExternalRows=n', function() {

        let fpSeed = null

        before(async function() {
            this.timeout(300000)
            await restoreBase() //自乾淨之 base seed 起(C 區之夾具與外部列移除)
            //from 為 null 之歷史後台列(各表一筆; 現行任何寫入入口皆拒造出, 以 seedExtra 旁路寫庫); 其餘欄位承 base seed 列
            let pick = (kt, id) => BASE[kt].find((r) => r.id === id)
            let rows = {
                users: [{ ...pick('users', 'id-for-john'), id: 'id-nf-u', order: 91, name: 'nfU', email: 'nf-u@null.example.com', description: 'nf', from: null }],
                grups: [{ ...pick('grups', BO.grups), id: 'id-nf-g', order: 91, name: 'nfG', description: 'nf', from: null }],
                pemis: [{ ...pick('pemis', BO.pemis), id: 'id-nf-p', order: 91, name: 'nfP', description: 'nf', from: null }],
                targets: [{ ...pick('targets', BO.targets), id: '專案NF/頁/區塊', order: 91, description: 'nf', from: null }],
            }
            fs.mkdirSync(dirTmp, { recursive: true })
            fpSeed = path.join(dirTmp, 'seed-extra.json')
            fs.writeFileSync(fpSeed, JSON.stringify(rows), 'utf8')
            await restartBackend(genTempSettings({ lockExternalRows: 'n' }), { seedExtra: fpSeed })
        })
        after(async function() {
            this.timeout(300000)
            //還原預設設定; 並再次旁路寫入 null-from 列(EX-042 之 freshState 已把它們當後台列還原掉), 供 E 區於預設設定下驗證; 收尾由根 after 之 restoreBase 還原
            await restartBackend('./settings.json', { seedExtra: fpSeed })
        })

        let NF = { users: 'id-nf-u', grups: 'id-nf-g', pemis: 'id-nf-p', targets: '專案NF/頁/區塊' }

        it('EX-040 getWebInfor.lockExternalRows 為 n', async function() {
            A.equal((await getInfor()).lockExternalRows, 'n')
        })

        it('EX-041 from 為 null 之歷史列: 原樣送回(含編修其他欄位)→成功且 from 仍為 null; 改為非字串(0／false／123)或新增非字串 from→saveFromNotAllowed(不論 lockExternalRows)', async function() {
            for (let kt of KTS) {
                let rows = await rowsOf(kt)
                let nf = rows.find((r) => r.id === NF[kt])
                A.ok(nf && nf.from === null, `前提(${kt}): 歷史列存在且 from 為 null，實得 ${JSON.stringify(nf && nf.from)}`)
                await mustWrite(`${kt} null-from 原樣送回＋編修他欄`, kt, patch(rows, NF[kt], { description: 'nf-edited' }))
                let got = await rowOf(kt, NF[kt])
                A.equal(got.description, 'nf-edited', `${kt} 編修落地`)
                A.equal(got.from, null, `${kt} from 仍為 null(原樣保留)`)
                for (let v of [0, false, 123]) {
                    await expectReject(`${kt} null→${JSON.stringify(v)}`, kt, patch(await rowsOf(kt), NF[kt], { from: v }), 'saveFromNotAllowed')
                }
                for (let v of BAD_FROMS) {
                    await expectReject(`${kt} 新增 from=${JSON.stringify(v)}`, kt, [...await rowsOf(kt), newRow(kt, 'n1', { from: v })], 'saveFromNotAllowed')
                }
            }
        })

        it('EX-042 n 模式舊行為: 新增非空 from、刪除外部列、改外部列身分欄與 from、無基準改指派欄 皆成功(外部列視同一般列); 外部列 order 隨位置重編', async function() {
            await freshState()
            for (let kt of KTS) {
                let af = T[kt].assign
                //改身分欄 + 改 from + 無基準改指派欄 同批
                let rows = await rowsOf(kt)
                let o = { description: 'n-mode edit', from: 'appMoved' }
                if (af) {
                    o[af] = AV[kt][0]
                }
                await mustWrite(`${kt} n 模式改外部列`, kt, patch(rows, ext(kt, 0), o))
                let got = await rowOf(kt, ext(kt, 0))
                A.equal(got.description, 'n-mode edit', `${kt} 身分欄變更落地`)
                A.equal(got.from, 'appMoved', `${kt} from 變更落地`)
                if (af) {
                    A.equal(got[af], AV[kt][0], `${kt} 指派欄變更(無基準)落地`)
                }
                //新增非空 from
                await mustWrite(`${kt} n 模式新增非空 from`, kt, [...await rowsOf(kt), newRow(kt, 'n2', { from: 'appNew2' })])
                A.equal((await rowOf(kt, nid(kt, 'n2'))).from, 'appNew2', `${kt} 新增列 from 落地`)
                //刪除外部列
                await mustWrite(`${kt} n 模式刪外部列`, kt, (await rowsOf(kt)).filter((r) => r.id !== ext(kt, 1)))
                A.equal(await rowOf(kt, ext(kt, 1)), undefined, `${kt} 外部列已刪除`)
                //order 隨位置重編(外部列亦然)
                rows = await rowsOf(kt)
                let rev = [...rows].reverse()
                await mustWrite(`${kt} n 模式重排`, kt, rev)
                let after = Object.fromEntries((await selectAll(kt)).map((r) => [r.id, r.order]))
                rev.forEach((r, k) => A.equal(after[r.id], k + 1, `${kt} n 模式下各列(含外部列) order 為位置 ${k + 1}`))
            }
        })

        it('EX-043 n 模式下基準仍生效: 給基準時過期／空陣列→saveStale、格式不合→saveBaselineFormat; 外部列指派欄帶正確基準成功', async function() {
            await freshState()
            for (let kt of ['users', 'grups', 'pemis']) {
                let af = T[kt].assign
                let rows = await rowsOf(kt)
                let B = baselineOf(kt, rows)
                await expectReject(`${kt} n 模式空陣列基準`, kt, patch(rows, ext(kt, 0), { [af]: AV[kt][0] }), 'saveStale', { baseline: [] })
                await expectReject(`${kt} n 模式格式不合基準`, kt, patch(rows, ext(kt, 0), { [af]: AV[kt][0] }), 'saveBaselineFormat', { baseline: 'abc' }) //perm-run01: 原 saveRowFieldInvalid
                await mustWrite(`${kt} n 模式正確基準改外部列指派欄`, kt, patch(rows, ext(kt, 0), { [af]: AV[kt][0] }), { baseline: B })
                await expectReject(`${kt} n 模式過期基準`, kt, patch(await rowsOf(kt), ext(kt, 0), { [af]: AV[kt][1] }), 'saveStale', { baseline: B })
            }
        })

        //〔perm-run03 S11〕srcKey 為身分欄, 不受 lockExternalRows 影響(同 from 型別檢查之「不論 lockExternalRows」): n 模式下仍不可改外部列之 srcKey、不可對後台列帶入 srcKey、不可新增帶 srcKey 之列
        it('EX-045 n 模式下 srcKey 仍為身分欄: 改外部列 srcKey→saveExternalRowChanged; 後台列帶入 srcKey、新增 from \'\' 而帶 srcKey 之列→saveFromNotAllowed; 零寫入', async function() {
            await freshState()
            for (let kt of KTS) {
                let rows = await rowsOf(kt)
                await expectReject(`${kt} n 模式改外部列 srcKey`, kt, patch(rows, ext(kt, 0), { srcKey: 'sk-changed' }), 'saveExternalRowChanged')
                await expectReject(`${kt} n 模式後台列帶入 srcKey`, kt, patch(rows, BO[kt], { srcKey: 'sk-forged' }), 'saveFromNotAllowed')
                await expectReject(`${kt} n 模式新增帶 srcKey 之列`, kt, [...rows, newRow(kt, 'sk3', { srcKey: 'sk-forged' })], 'saveFromNotAllowed')
            }
        })

    })


    // ===== E. 預設設定下之 null-from 歷史列(承 D 區之旁路寫入列) =====

    describe('E. 預設設定: null-from 歷史列', function() {

        it('EX-044 lockExternalRows=y 下 from 為 null 之歷史後台列: getWebInfor 為 y; 原樣送回(含編修他欄)→成功且 from 仍為 null; 視為後台列(可刪除); 改成非空 from／非字串→saveFromNotAllowed', async function() {
            A.equal((await getInfor()).lockExternalRows, 'y', '前提: 已還原為預設設定')
            for (let kt of KTS) {
                let rows = await rowsOf(kt)
                let nf = rows.find((r) => r.id === NF_E[kt])
                A.ok(nf && nf.from === null, `前提(${kt}): D 區留下之 null-from 列仍在，實得 ${JSON.stringify(nf && nf.from)}`)
                await mustWrite(`${kt} y 模式 null-from 原樣送回＋編修他欄`, kt, patch(rows, NF_E[kt], { description: 'nf-y-edit' }))
                let got = await rowOf(kt, NF_E[kt])
                A.equal(got.description, 'nf-y-edit', `${kt} 編修落地`)
                A.equal(got.from, null, `${kt} from 仍為 null`)
                for (let v of ['appX', 0, false, 123]) {
                    await expectReject(`${kt} y 模式 null→${JSON.stringify(v)}`, kt, patch(await rowsOf(kt), NF_E[kt], { from: v }), 'saveFromNotAllowed')
                }
                await mustWrite(`${kt} y 模式刪除 null-from 列(後台列)`, kt, (await rowsOf(kt)).filter((r) => r.id !== NF_E[kt]))
                A.equal(await rowOf(kt, NF_E[kt]), undefined, `${kt} null-from 列已刪除`)
            }
        })

    })


    // ===== F. cascadeRename=false: 外部同步 grups／pemis 缺鍵保留之改名收嚴(run08) =====

    describe('F. cascadeRename=false', function() {

        before(async function() {
            this.timeout(300000)
            await restartBackend(genTempSettings({ cascadeRename: false }))
        })
        after(async function() {
            this.timeout(300000)
            await restartBackend('./settings.json')
        })

        it('EX-021d 引用不跟著改(cascadeRename=false)時, 同 srcKey 改名且缺鍵 → 不保留(名稱即授權身分, 不把舊名指派移轉給新名)並記 warn(keepAssign-skip, reason identityConflict; 只記表名／來源／欄位／筆數); 同名重送 → 保留', async function() {
            A.equal((await getInfor()).cascadeRename, false, '前提: cascadeRename 為 false')
            await freshState()
            for (let kt of ['grups', 'pemis']) {
                let af = T[kt].assign
                let rows = await rowsOf(kt)
                await mustWrite(`${kt} 後台指派`, kt, patch(patch(rows, ext(kt, 0), { [af]: AV[kt][0] }), ext(kt, 1), { [af]: AV[kt][1] }), { baseline: baselineOf(kt, rows) })
                let mark = await markSrLog()
                await mustSync(kt, { from: F, rows: [omit({ ...FX[kt][0], name: `${FX[kt][0].name}-renamed` }, [af]), omit(FX[kt][1], [af])] })
                let g0 = await rowOf(kt, ext(kt, 0))
                let g1 = await rowOf(kt, ext(kt, 1))
                A.equal(g0.name, `${FX[kt][0].name}-renamed`, `${kt} 改名以外部為準(不連帶)`)
                A.equal(g0[af], '', `${kt} 同 srcKey 改名且引用不跟著改 → 不保留(收嚴)`)
                A.equal(g1[af], AV[kt][1], `${kt} 名稱相同者 → 保留`)
                let lines = await waitLines(mark, (l) => l.event === 'syncAndReplaceTabs-keepAssign-skip' && l.keyTable === kt, `${kt} keepAssign-skip log`)
                let w = lines.filter((l) => l.event === 'syncAndReplaceTabs-keepAssign-skip' && l.keyTable === kt)
                A.equal(w.length, 1, `${kt} 應記 1 筆 warn`)
                A.equal(w[0].level, 40, `${kt} 事件層級應為 warn(40)`)
                A.deepEqual({ keyTable: w[0].keyTable, from: w[0].from, field: w[0].field, n: w[0].n, reason: w[0].reason }, { keyTable: kt, from: F, field: af, n: 1, reason: 'identityConflict' }, `${kt} warn 之表名／來源／欄位／筆數／原因(實得 ${w[0]._raw})`)
                noLeakLine(w[0], [FX[kt][0].srcKey, ext(kt, 0), FX[kt][0].name, 'renamed', AV[kt][0], AV[kt][1]], `${kt} warn(來源鍵／列主鍵／名稱／授權值)`)
                let info = lines.find((l) => l.event === 'syncAndReplaceTabs-keepAssign' && l.keyTable === kt)
                A.ok(info && info.n === 1 && info.field === af, `${kt} 名稱相同之另一列保留 → info log n=1，實得 ${info && info._raw}`)
            }
        })

    })

})

//E 區使用之 null-from 列主鍵(同 D 區 NF; describe 作用域獨立而於此重列)
const NF_E = { users: 'id-nf-u', grups: 'id-nf-g', pemis: 'id-nf-p', targets: '專案NF/頁/區塊' }
