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
    //base seed 既有 from：admin from=''、peter/mary/john from='teamA'、grups/pemis/targets from=''。
    //sync 測試用隔離 from（不撞 ''/'teamA'）：
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
export async function callRpc(funcName, args, token, opt = {}) {
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

//readSrLogSince：讀本專案後端 srLog 中 time ≥ t0 之各行（已 JSON.parse；解析失敗之行略過；_raw 為原始行文字）。
//  目錄＝settings.json 之 logFd（相對專案根＝後端 cwd；未給同 server/srLog.mjs 預設 './logs'）；只讀 mtime ≥ t0 − 2s 之檔。
//  srLog 經 pino transport 非同步落檔，呼叫端須以哨兵事件等待（見 api-tokenSafety），不得讀到空集合即斷言「無外洩」。
export function readSrLogSince(t0) {
    let st = {}
    try {
        st = JSON5.parse(fs.readFileSync(path.join(projRoot, 'settings.json'), 'utf8'))
    }
    catch (e) {}
    const fd = (typeof st.logFd === 'string' && st.logFd !== '') ? st.logFd : './logs'
    const dir = path.resolve(projRoot, fd)
    const out = []
    if (!fs.existsSync(dir)) {
        return out
    }
    for (const fn of fs.readdirSync(dir)) {
        const fp = path.join(dir, fn)
        const s = fs.statSync(fp)
        if (!s.isFile() || s.mtimeMs < t0 - 2000) {
            continue
        }
        for (const ln of fs.readFileSync(fp, 'utf8').split(/\r?\n/)) {
            if (!ln) {
                continue
            }
            let o = null
            try {
                o = JSON.parse(ln)
            }
            catch (e) {
                continue
            }
            if (o && typeof o.time === 'number' && o.time >= t0) {
                out.push({ ...o, _raw: ln })
            }
        }
    }
    return out
}
