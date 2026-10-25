//D 類查詢 API 契約測試共用設施。對應 spec/流程_查詢使用者權限.md、流程_查詢指定使用者權限.md、流程_外部應用同步權限資料.md。
//
//【關鍵】perm 的 4 個查詢 API 全是「裸 fetch(內建, 2026-09-07 起不再依賴 axios) 打真實 HTTP URL」（src/getPerm.mjs / src/getPermUserInfor.mjs /
//src/perm.mjs / server/provideTabs.mjs），非 WServHapiClient/RPC。故契約測試直接 import 並呼叫 client SDK 函式，
//url 給真實 http://127.0.0.1:11006/...，無需 sso 的 callFapi / force-exit hack（fetch 無常駐連線、無 polling）。
//
//服務啟動/重用、DB 種子、cleanup 全沿用 e2e-setup.mjs（§6.3 lifecycle 對稱：startServersOnce↔cleanup，
//mocha root after hook + process 備援兩觸發來源）。API 測試只需 backend，故傳 backendOnly 省前端 webpack 首編。
//
//token 機制（srv.mjs getUserByToken）：寫死三個有效 token、verifyClientUser/verifyAppUser = isAdmin==='y'：
//  'sys'                    → {id:'id-for-admin',  email:'admin@example.com',       isAdmin:'y'}（client+app 皆過）
//  '{token-for-application}'→ {id:'id-for-application', email:'application@...',     isAdmin:'y'}（app 過；不在 perm users 表 → client 通道拒；注意字面含大括號）
//  '{token-for-peter}'      → {id:'id-for-peter',  email:'peter@example.com',       isAdmin:'n'}（在 perm users 表、有效、但 verifyClientUser 拒 → 供資料通道授權測試）
//  '{token-for-reject}'     → reject 舊版 w-web-sso helper 形狀之字串（含合成秘密 SYNTH-SYS-SECRET-FOR-TEST 與所送權杖；非 production 才有, 見 ADR-023）
//  '{token-for-verify-throw}'→ {id:'id-for-verify-throw', ...}, verifyClientUser / verifyAppUser 對其 throw Error('SYNTH-VERIFY-SECRET-FOR-TEST')（同上）
//  其他                      → {}（→ 守門 reject 'cannotFindUserFromToken'）

import fs from 'fs'
import path from 'path'
import JSON5 from 'json5'
import { fileURLToPath } from 'url'
import obj2u8arr from 'wsemi/src/obj2u8arr.mjs'
import u8arr2obj from 'wsemi/src/u8arr2obj.mjs'
import { startServersOnce, cleanup, apiBaseUrl } from './e2e-setup.mjs'
import { assertPristineSeed } from './baseSeed.mjs'
import { markAfterSentinel, readLinesAfter } from './srLogMark.mjs'
import { buildDecl } from './declHelper.mjs'

export { startServersOnce, cleanup, apiBaseUrl }

const projRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..') //= 專案根(後端 cwd)

//API 契約測試啟動：只起 backend（11006），省前端 webpack。suite before 呼叫。
export async function startApi() {
    await startServersOnce({ backendOnly: true })
}

//token 常數
export const TOKEN_ADMIN = 'sys'                       // → id-for-admin（client 使用者，過 verifyClientUser）
export const TOKEN_APP = '{token-for-application}'     // → id-for-application（app 使用者，過 verifyAppUser；不在 perm users 表）
export const TOKEN_PETER = '{token-for-peter}'         // → id-for-peter（在表、有效、isAdmin='n' → verifyClientUser 拒）
export const TOKEN_ADMIN2 = '{token-for-admin2}'       // → id-for-admin2（perm-run03 範圍三：第二位管理員；其 perm users 列由測試自建／停用，過 verifyClientUser 需該列 isAdmin='y'）
export const TOKEN_MEMBER = '{token-for-member}'       // → id-for-member（perm-run03 範圍四：perm users 列〔測試自建〕isAdmin='n'，但 srv.mjs 之 verifyClientUser 放行 → 通過連線閘之非管理員）
export const TOKEN_MUTATE = '{token-for-mutate}'       // → id-for-mutate（perm-run01 外審 sol#2：perm 列〔測試自建〕為管理員, 但 srv.mjs 之 verifyClientUser 會改寫其收到之 user 物件〔id→id-for-peter、isAdmin→n〕後放行；套件傳副本, 改寫不得影響執行身分與角色）
export const TOKEN_SLOW = '{token-for-slow}'           // → id-for-slow（perm-run01 外審 sol#3：perm 列〔測試自建〕isAdmin='n', verifyClientUser 為 async 並等待約 1.5 秒, 供 /api/getPerm「驗證後該列被改動」案例）
//應用系統 token 測試權杖(perm-run01 本輪, R-APP-TOKEN-01; 對照 dspec/w-web存取管控表.md 第二節 AU／AS)。TOKEN_APP 即系統服務用途(isApp='y'、isAdmin='y'、不在 perm users 表)。
export const TOKEN_AS = '{token-for-app-system}'              // → id 'app:key-sys'、email 空、isApp y、isAdmin y（系統服務用途真實形狀, 不在 perm users 表）
export const TOKEN_AS_N = '{token-for-app-system-n}'          // → 同上但 isAdmin n（不屬系統服務用途）
export const TOKEN_NOFLAG = '{token-for-app-noflag}'          // → AS 形狀但 getUserByToken 未轉傳 isApp（視同 n; 舊版 TOKEN_APP 之語意: 不在 perm users 表、非應用系統; perm-run02: 資料通道／後台登入拒, 應用系統路由因 isAdmin y 放行）
export const TOKEN_NOFLAG_N = '{token-for-noflag-n}'          // → perm-run02: 不在 perm users 表、isAdmin n、未轉傳 isApp（各入口皆拒）
export const TOKEN_SSO_ADMIN = '{token-for-sso-admin}'        // → perm-run02: 不在 perm users 表之 sso 管理員以自身使用者 token（id 'sso-admin-77'、未轉傳 isApp）
export const TOKEN_AU_SSO = '{token-for-app-bind-sso}'        // → perm-run02: 使用者用途綁「不在 perm users 表之 sso 管理員」（同上 id＋isApp y; id 非 'app:' 開頭, 不是系統服務用途）
export const TOKEN_FLAG_N = '{token-for-app-flag-n}'          // → perm-run02 外審 F1: 'app:key-flag-n'、isAdmin y、isApp 明確 'n'（非系統服務用途; 應用系統路由只看 isAdmin 而放行）
export const TOKEN_FLAG_ODD = '{token-for-app-flag-odd}'      // → perm-run02 外審 F1: 'app:key-flag-odd'、isAdmin y、isApp 'Y'（非嚴格 'y'）
export const TOKEN_APP_DENY_N = '{token-for-app-deny-n}'      // → perm-run02 外審 F1: id 'app:key-deny'（verifyAppUser 否決）、isAdmin n、不在表: 拒絕鍵次序（部署方否決先於等級不足）
export const TOKEN_EXT_ROW = '{token-for-ext-row}'            // → perm-run02 外審 F1: 外部 id 'sso-ext-5'（對應 perm 外部列之 srcKey; 列由測試經 /syncAndReplaceTabs 建立）
export const TOKEN_AS_EMAIL = '{token-for-app-email}'         // → perm-run02 外審 F1: 'app:key-email'、email 非空、isApp y、isAdmin y（嚴格系統服務形狀; 人造帶 email, 供停用列案例）
export const TOKEN_AS_EMAIL_ALT = '{token-for-app-email-alt}' // → perm-run02 增量外審 G4: 嚴格系統服務形狀（app:key-email-alt）, email／name 同 perm 某停用列而主鍵不同（僅 mappingBy=email／name 以對應鍵命中）
export const TOKEN_AS_GHOST = '{token-for-app-ghost}'       // → perm-run02 外審 F3: 系統服務用途 'app:key-ghost'（登錄近期系統服務用途 id）
export const TOKEN_GHOST_USER = '{token-for-ghost-user}'      // → perm-run02 外審 F3: 一般 sso 管理員（email ghost@example.com）, 經 perm 列（主鍵 'app:key-ghost', mappingBy=email）通過驗證; srv.mjs 之 verifyClientUser 對該列等待約 2 秒
export const TOKEN_AU_ADMIN = '{token-for-app-bind-admin}'    // → 使用者用途綁管理員（base seed admin 之實際資料 + isApp y）
export const TOKEN_AU_MEMBER = '{token-for-app-bind-member}'  // → 使用者用途綁一般使用者（base seed peter 之實際資料 + isApp y）
export const TOKEN_AU_DISABLED = '{token-for-app-bind-disabled}' // → 使用者用途綁定之使用者在 perm users 表但停用（列由測試自建; 上游 isAdmin y）
export const TOKEN_DENY = '{token-for-deny}'                  // → perm 列〔測試自建〕為管理員, 但 srv.mjs 之 verifyClientUser 因非角色因素否決
export const TOKEN_AU_DISABLED_ALT = '{token-for-app-bind-disabled-alt}' // → 使用者用途綁停用之使用者, 外部 id 'sso-appdis-9'≠perm 主鍵 id-for-appdis（僅 mappingBy=email 以 email 找到該列; 停用之列也算在表中）
export const TOKEN_ALT_ADMIN = '{token-for-alt-admin}'        // → 外部 id 'sso-admin-9'、email 同 admin（僅 mappingBy=email 時對應 perm 列 id-for-admin; 外審 sol F02: 稽核欄須記 perm 內之 id）
export const TOKEN_AS_DENY = '{token-for-app-deny}'           // → 系統服務用途, 但 srv.mjs 之 verifyAppUser 因非角色因素否決
export const TOKEN_AS_MUTATE = '{token-for-app-mutate}'       // → 系統服務用途, verifyAppUser 會改寫其收到之 user 物件（id→id-for-peter、isAdmin→n）後放行
export const TOKEN_BAD = 'nope-invalid'               // → getUserByToken 回 {} → 守門 reject
export const TOKEN_REJECT = '{token-for-reject}' // → getUserByToken reject 上游原文(含合成秘密)；W 契約視同查無
export const TOKEN_VERIFY_THROW = '{token-for-verify-throw}' // → verifyClientUser / verifyAppUser 拋錯；W 契約視同無權限

//URL helper（含佔位符，供 client SDK 內部 replace；getPerm 用 token={token}、getPermUserInfor 用 token={sysToken}&userId={userId}）
export const urlGetPerm = `${apiBaseUrl}/api/getPerm?token={token}`
export const urlGetPermUserInfor = `${apiBaseUrl}/api/getPermUserInfor?token={sysToken}&userId={userId}`
//注意：/syncAndReplaceTabs 為根路徑、無 /api 前綴（WWebPerm.mjs:1056 自訂 route，非 WServHapiClient RPC 通道）
export const urlSync = `${apiBaseUrl}/syncAndReplaceTabs?keyTable={keyTable}&token={token}`

//base seed 參考值（由 genTestData 動態產生、實測 discovery 確認；ids 為確定性 'id-for-<name>'）。
//測試以這些值斷言；如需更穩健可於 before 內以 getWoItems() 唯讀 select 交叉核對。
export const SEED = {
    adminId: 'id-for-admin', adminEmail: 'admin@example.com', adminGrup: '權限群組M4',
    peterId: 'id-for-peter', peterEmail: 'peter@example.com', peterGrup: '權限群組M1',
    userCount: 4, grupCount: 4, pemiCount: 4, targetCount: 22,
    //base seed 之 from：四表全部為 ''（run07〔F-23〕起 peter/mary/john 由 'teamA' 改 ''，與 admin 一致，故基準種子已無外部列；
    //外部列〔from 為非空字串者〕一律由測試以 /syncAndReplaceTabs 自行建立，後台 updateXxx 不得新增／改／刪外部列）。
    //sync 測試用隔離 from（不撞 ''）：
    SYNC_FROM: 'appTest',
}

//lazy 取 woItems（唯讀斷言用）：必須在 startApi() 之後才 import g_mOrm.mjs，否則其 constructor 開 lmdb 會與
//seedDb 的 fs.rmSync('./db') 衝突。跨進程唯讀 select 已實測可行（backend 同開 lmdb，讀不寫風險低）。
let _woItems = null
export async function getWoItems() {
    if (!_woItems) {
        const m = await import('../../g_mOrm.mjs')
        _woItems = m.woItems
    }
    return _woItems
}

//callRpc：直打資料通道 POST /api/main（w-converhp 協定, obj2u8arr 編碼）；傳輸層拒絕時回 { ok:false, msg:'permission denied' }。
//  opt.sysToken：本體 __sysToken__（預設同 Authorization 之 token；供 getUserIdByToken 路徑另給）；opt.headers：附加標頭（如 Referer）。
//  回 { ok, state, msg, output, raw }，raw 為回應位元組之 utf8 文字（供權杖外洩掃描）。
//  註（2026-09-28 收斂）：api-verifyConn-auth / api-updateTabs / api-doubleclick（原 e2e-doubleclick，見
//  spec/設計要點與取捨.md ADR-017 Update）三檔原各有一份近似實作，逐呼叫點核對回傳形狀後確認斷言不受影響，
//  已直接改 import 本函式；api-updateUsers-forGrups 因原呼叫慣例省略第 3 參（依賴預設 TOKEN_ADMIN，本函式
//  token 為必填）故於該檔內以薄封裝補回預設值，不改本函式行為。
//  perm-run03 範圍一（宣告強制必帶）：直打 updateUsers／updateGrups／updatePemis 者，未帶 refs／subject 時自動附上「合規客戶端」宣告（同清單頁 buildRefDecl，讀送出當下之庫內資料；見 test/tools/declHelper.mjs），
//    使各案例的意圖不變（測各自的規則，不是宣告本身）；要測「未附宣告被拒」請傳 opt.noDecl:true。更新函式的第 3 參以後與 args[1] 之其餘鍵（baseline、returnRows）原樣保留。
const AUTO_DECL = { updateUsers: 'users', updateGrups: 'grups', updatePemis: 'pemis' }
export async function callRpc(funcName, args, token, opt = {}) {
    if (Object.prototype.hasOwnProperty.call(AUTO_DECL, funcName) && opt.noDecl !== true && Array.isArray(args) && Array.isArray(args[0])) {
        const o2 = (args[1] !== null && typeof args[1] === 'object') ? args[1] : {}
        if (o2.refs === undefined && o2.subject === undefined) {
            const decl = await buildDecl(AUTO_DECL[funcName], args[0], async (t) => {
                const r = await callRpcRaw(`${t}.select`, [], TOKEN_ADMIN)
                return (r.ok && Array.isArray(r.output)) ? r.output : null
            })
            if (decl !== null) {
                args = [args[0], { ...o2, refs: decl }, ...args.slice(2)]
            }
        }
    }
    return await callRpcRaw(funcName, args, token, opt)
}
async function callRpcRaw(funcName, args, token, opt = {}) {
    const sysToken = ('sysToken' in opt) ? opt.sysToken : token
    const payload = { func: funcName, input: { __sysInputArgs__: args, __sysToken__: sysToken } }
    const r = await fetch(`${apiBaseUrl}/api/main`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/octet-stream', ...(opt.headers || {}) },
        body: Buffer.from(obj2u8arr(payload)),
    })
    const u8a = new Uint8Array(await r.arrayBuffer())
    const raw = Buffer.from(u8a).toString('utf8')
    const respObj = u8arr2obj(u8a)
    if (respObj && typeof respObj === 'object') {
        if ('error' in respObj) {
            return { ok: false, state: 'error', msg: String(respObj.error), raw }
        }
        if ('success' in respObj) {
            //kpFunExt 回傳包成 { state, msg }; msg 為回傳值本體(getWebInfor 為物件, updateXxx 為 key 字串)
            const out = respObj.success?.output
            if (out && typeof out === 'object' && 'state' in out) {
                return { ok: out.state === 'success', state: out.state, msg: typeof out.msg === 'string' ? out.msg : JSON.stringify(out.msg), output: out.msg, raw }
            }
            return { ok: true, state: 'success', output: out, raw }
        }
    }
    return { ok: false, state: 'error', msg: `unparseable response: ${JSON.stringify(respObj)}`, raw }
}

//readTables／restoreTables：讀三表(users／grups／pemis)現況並於收尾原樣寫回(供不用 resetDb 的 e2e／api 檔做「擷取 ↔ 還原」對稱收尾; 規則帳本 R-E2E-ISO-01)。
//  收斂自 e2e-array-form 原本檔內的一份(2026-10-21 run03: api-keyProp 與 e2e-array-form 共用, 不複製第二份)。
//  讀三表現況(經資料通道 select), 依 order 排序: select 依主鍵排序(users 為 admin／john／mary／peter), 而 updateXxx 以陣列位置重給 order,
//  直接送 select 順序會使 users 列序反轉(base seed 為 peter／mary／john／admin), 後續 e2e 檔擷取到的 BASE_SEED 列序與標準圖相反(多檔合跑後端污染之「列序相反」現象, 見規則帳本 R-E2E-ISO-01、ADR-030)
const TABLE_FN = [['users', 'updateUsers'], ['grups', 'updateGrups'], ['pemis', 'updatePemis']]
export async function readTables() {
    const out = {}
    for (const [kt] of TABLE_FN) {
        const r = await callRpc(`${kt}.select`, [], TOKEN_ADMIN)
        //select 失敗(r.ok 為 false)時不得當成空表而於收尾送出整表清空(外審 sol#3)
        if (!(r.ok && Array.isArray(r.output) && r.output.length > 0)) {
            throw new Error(`${kt}.select 應成功且非空, 實得 ${JSON.stringify(r).slice(0, 200)}`)
        }
        out[kt] = r.output.slice().sort((a, b) => (a.order || 0) - (b.order || 0))
    }
    return out
}
//收尾(與 readTables 對稱): 把三表還原為擷取時之現況(含夾具以外各列之原文欄位), 不留測試加入的列, 也不改動 base seed 列之序與原文
//(經管理者寫入 RPC, 與 api-updateTabs 之 restoreBaseSeed 同法; sync 端點拒絕空 rows 故不能用它清)
//purgeExternalRows(run07, F-23): 測試框架之收尾／重置工具——刪除「外部列」(from 為非空字串者; 經 /syncAndReplaceTabs 灌入之夾具)。
//  why: 後台整表寫入 updateXxx 自 run07 起不得刪除外部列(saveExternalRowChanged), 故「以整表寫入把表還原為 base seed」之收尾無法移除測試以同步灌入之夾具列;
//  外部同步端點又拒絕空 rows(isearr 安全閘), 亦不能用它清。與 api-syncAndReplaceTabs／api-mapKey 之 after 同法, 由測試行程直接以 woItems.delAll 刪除(測試框架之重置, 非測試中手動改寫資料庫)。
//  只刪外部列, 後台列(from '')不動; 直接刪除不經引用連帶, 故呼叫端須於其後以整表寫入還原引用端表(被引用者先、引用端後)。
//  kts: 要清理之表名陣列(預設四表); opt.keepIds: { 表名: [id] }——這些 id 之外部列不刪(收尾快照本身若含外部列);
//  opt.froms: 字串陣列(run09)——只刪這些 from 分區之外部列(測試檔只清自己專屬之 from, 不動他人之分區); 未給則不限分區。回傳 { 表名: 刪除筆數 }。
//  外部列夾具之收尾請走 cleanExternalFixtures(單一入口, 規則帳本 R-TEST-EXT-CLEAN-01), 本函式為其底層, 各檔不再自寫 woItems[kt].delAll({ from })。
export async function purgeExternalRows(kts = ['users', 'grups', 'pemis', 'targets'], opt = {}) {
    const keep = (opt && opt.keepIds) || {}
    const froms = (opt && Array.isArray(opt.froms)) ? opt.froms.map((v) => String(v)) : null
    if (froms !== null && froms.includes('')) {
        throw new Error('purgeExternalRows: froms 不得含空字串(from 為空字串者是後台列, 不是外部列)')
    }
    const woItems = await getWoItems()
    const out = {}
    for (const kt of kts) {
        const keepSet = new Set((keep[kt] || []).map((v) => String(v)))
        const ids = (await woItems[kt].select())
            .filter((r) => typeof r.from === 'string' && r.from !== '' && (froms === null || froms.includes(r.from)) && !keepSet.has(String(r.id)))
            .map((r) => String(r.id))
        out[kt] = ids.length
        if (ids.length > 0) {
            await woItems[kt].delAll({ id: { $in: ids } })
            const left = (await woItems[kt].select({ id: { $in: ids } })).length
            if (left !== 0) {
                throw new Error(`purgeExternalRows(${kt}): 刪除後仍有 ${left} 筆外部列`)
            }
        }
    }
    return out
}

//cleanExternalFixtures(run09, 規則帳本 R-TEST-EXT-CLEAN-01): 外部列夾具(from 為非空字串者; 經 /syncAndReplaceTabs 灌入)收尾之「單一入口」, 各測試檔不得自寫收尾。
//  why: 外部列受產品保護(R-EXT-OWN-01 Lv1: 後台整表寫入不得刪, 回 saveExternalRowChanged), 外部同步端點又拒空 rows(isearr 閘, ADR-008), 故
//    「同一 from 重送不含該列之批次」只在分區仍保留 ≥1 列時可用, 要清空整個分區只剩測試框架之直接重置(purgeExternalRows);
//    restartBackend({ reseed:true }) 在單一 mocha 行程內亦不能指望: api 檔已使本行程持有 lmdb 映射, 刪不掉 ./db 而退化為 upsert(只補種子列, 不移除多餘列)。
//    (2026-10-22 全套: e2e-init E2E-006 收尾退而以管理者寫入移除 id-mk-dup → saveExternalRowChanged, 夾具殘留, 其後 4 個檔 12 案失敗。)
//  不放寬產品: 本函式只動測試資料庫, 產品之 Lv1 守門不變(對照: api-cleanExternal CE-003 驗管理者寫入仍刪不掉外部列)。
//  步驟: ①經資料通道 select 偵測(無待清者不 import g_mOrm, 不使本行程新增 lmdb 映射) ②有則 purgeExternalRows(只清 opt.froms 之分區) ③再經 select 回驗無殘留;
//    opt.pristine 時並以 assertPristineSeed 回驗各表主鍵集合＝種子(整檔只動外部夾具之收尾用; 後台列有多餘則拋錯, 不放寬)。
//  opt.kts: 要清理之表名陣列(預設四表); opt.froms: 只清這些 from 分區(預設不限分區); opt.keepIds: 同 purgeExternalRows; opt.pristine: 預設 false。回傳 { 表名: 移除筆數 }。
export async function cleanExternalFixtures(opt = {}) {
    const kts = Array.isArray(opt.kts) ? opt.kts : ['users', 'grups', 'pemis', 'targets']
    const keepIds = opt.keepIds || {}
    const froms = Array.isArray(opt.froms) ? opt.froms.map((v) => String(v)) : null
    if (froms !== null && froms.includes('')) {
        throw new Error('cleanExternalFixtures: froms 不得含空字串(from 為空字串者是後台列, 不是外部列)')
    }
    const isFixture = (kt, r) => typeof r.from === 'string' && r.from !== '' && (froms === null || froms.includes(r.from)) && !(keepIds[kt] || []).map((v) => String(v)).includes(String(r.id))
    const pending = {}
    for (const kt of kts) {
        const n = (await selectAllRows(kt)).filter((r) => isFixture(kt, r)).length
        if (n > 0) {
            pending[kt] = n
        }
    }
    if (Object.keys(pending).length > 0) {
        await purgeExternalRows(Object.keys(pending), { keepIds, froms })
    }
    for (const kt of kts) {
        const rows = await selectAllRows(kt)
        const left = rows.filter((r) => isFixture(kt, r))
        if (left.length > 0) {
            throw new Error(`cleanExternalFixtures(${kt}): 移除後仍有 ${left.length} 筆外部列 [${left.map((r) => `${r.id}(from=${r.from})`).join(', ')}]`)
        }
        if (opt.pristine === true) {
            try {
                assertPristineSeed(kt, rows)
            }
            catch (err) {
                throw new Error(`cleanExternalFixtures(${kt}): 移除外部夾具後仍不是 pristine base seed: ${err.message}`)
            }
        }
    }
    return Object.fromEntries(kts.map((kt) => [kt, pending[kt] || 0]))
}

export async function restoreTables(snap) {
    //run07: 先移除收尾快照之外的外部列夾具(後台寫入不得刪外部列, 見 purgeExternalRows)
    //(先經資料通道 select 判斷有無待清之外部列; 無則不 import g_mOrm——該 import 於 mocha 行程內持有 lmdb 映射, 會使後續 reseed 刪不掉 ./db, 見 e2e-setup wipeDbVerified)
    const keepIds = {}
    const ktsExt = []
    for (const [kt] of TABLE_FN) {
        keepIds[kt] = (snap[kt] || []).map((r) => String(r.id))
        const cur = await callRpc(`${kt}.select`, [], TOKEN_ADMIN)
        if (!(cur.ok && Array.isArray(cur.output))) {
            throw new Error(`${kt}.select 應成功, 實得 ${JSON.stringify(cur).slice(0, 200)}`)
        }
        if (cur.output.some((r) => typeof r.from === 'string' && r.from !== '' && !keepIds[kt].includes(String(r.id)))) {
            ktsExt.push(kt)
        }
    }
    if (ktsExt.length > 0) {
        await purgeExternalRows(ktsExt, { keepIds })
    }
    for (const [kt, fn] of TABLE_FN) {
        const res = await callRpc(fn, [snap[kt]], TOKEN_ADMIN)
        if (!res.ok) {
            throw new Error(`收尾 ${fn} 應成功, 實得 ${JSON.stringify(res)}`)
        }
    }
}

//selectAllRows／editTableRows(run06 引用連帶): 與 e2e-array-form 檔內 selectAll／editTable 等價(該檔本輪不改、其本地副本待下輪收斂至本檔), 另含 targets 表(updateTargets).
//  selectAllRows: 經資料通道 select 讀某表全部列(不經瀏覽器); 失敗即拋錯(不得把失敗當空表)
export async function selectAllRows(kt) {
    const r = await callRpc(`${kt}.select`, [], TOKEN_ADMIN)
    if (!(r.ok && Array.isArray(r.output))) {
        throw new Error(`${kt}.select 應成功, 實得 ${JSON.stringify(r).slice(0, 200)}`)
    }
    return r.output
}
//  editTableRows: 以管理者寫入 RPC 在某表現況之上追加(或改)列: fn(依 order 排序之現況列複本) → 新整表(回傳 undefined 視為就地修改); 失敗即拋錯。
//  整表寫入會依陣列位置重給 order(供案例把夾具列置於最上方, 免虛擬捲動未渲染)
const EDIT_FN = { users: 'updateUsers', grups: 'updateGrups', pemis: 'updatePemis', targets: 'updateTargets' }
export async function editTableRows(kt, fn) {
    if (!Object.prototype.hasOwnProperty.call(EDIT_FN, kt)) {
        throw new Error(`editTableRows: 未知的表名「${kt}」`)
    }
    const rows = (await selectAllRows(kt)).slice().sort((a, b) => (a.order || 0) - (b.order || 0)).map((v) => JSON.parse(JSON.stringify(v)))
    const res = await callRpc(EDIT_FN[kt], [fn(rows) || rows], TOKEN_ADMIN)
    if (!res.ok) {
        throw new Error(`夾具 ${EDIT_FN[kt]} 應成功, 實得 ${JSON.stringify(res).slice(0, 300)}`)
    }
}

//srLog 讀取（第 101 項 run10，R-SRLOG-MARK-01）：以「檔案位置」定位某動作之後新增的行，不比對測試行程與後端行程兩個時鐘。
//  舊式 readSrLogSince(t0) 取 time ≥ t0 之行，t0 是測試行程的 Date.now()、time 是後端行程的 Date.now()（pino 蓋印）；兩個 node 行程的時鐘在本機實測有 1~2 ms 偏差（隨行程配對而異），
//  請求到記 log 僅隔約 2 ms 時目標行被濾掉，其後後端閒置、waitLines 等滿 30 秒回報「讀到 0 行」（2026-10-22 13:04:35、14:57:41 兩次 API-RC-044 偶發失敗）。
//  markSrLog()：在動作「之前」呼叫，回傳標記＝送一個哨兵請求並等它落檔後各 log 檔的位元組數（同一後端行程的 srLog 依呼叫序落檔，見哨兵即其前各行已落檔，
//    故前一步驟仍在 pino 管線中的行不會落到標記之後）。哨兵為不在白名單的 keyTable，後端只記一行 api/syncAndReplaceTabs-error 後拒絕，不動資料。
//  readSrLogSince(mark)：標記之後新增的各行（已 JSON.parse；解析失敗之行略過；_raw 為原始行文字）；傳入時間戳等非標記值拋 TypeError。
//  目錄＝settings.json 之 logFd（相對專案根＝後端 cwd；未給同 server/srLog.mjs 預設 './logs'）。
//  srLog 經 pino transport 非同步落檔，呼叫端須以「預期的行」等待（見 api-refCascade waitLines、api-tokenSafety 哨兵），不得讀到空集合即斷言「無外洩」。
const srLogDir = () => {
    let st = {}
    try {
        st = JSON5.parse(fs.readFileSync(path.join(projRoot, 'settings.json'), 'utf8'))
    }
    catch (e) {}
    const fd = (typeof st.logFd === 'string' && st.logFd !== '') ? st.logFd : './logs'
    return path.resolve(projRoot, fd)
}
let markSeq = 0
export async function markSrLog() {
    const sentinel = `srMark${process.pid}x${Date.now()}x${++markSeq}` //Date.now() 僅作唯一字串, 不與後端時間比對
    return await markAfterSentinel({
        dir: srLogDir(),
        send: async () => {
            //應用系統路由先驗身分再驗參數(perm-run01 P-5): 哨兵須帶有效之管理員等級 token 才會走到 keyTable 檢查並記 srLog(event api/syncAndReplaceTabs-error、keyTable 為哨兵)
            const r = await fetch(`${apiBaseUrl}/syncAndReplaceTabs?keyTable=${sentinel}&token=${encodeURIComponent(TOKEN_APP)}`, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: '{}' })
            await r.text()
        },
        isSentinel: (o) => o.keyTable === sentinel,
    })
}
export function readSrLogSince(mark) {
    return readLinesAfter(srLogDir(), mark)
}
