//D 類查詢 API 契約測試共用設施。對應 spec/流程_查詢使用者權限.md、流程_查詢指定使用者權限.md、流程_外部應用同步權限資料.md。
//
//【關鍵】perm 的 4 個查詢 API 全是「裸 axios.get/post 打真實 HTTP URL」（src/getPerm.mjs / src/getPermUserInfor.mjs /
//src/perm.mjs / server/provideTabs.mjs），非 WServHapiClient/RPC。故契約測試直接 import 並呼叫 client SDK 函式，
//url 給真實 http://127.0.0.1:11006/...，無需 sso 的 callFapi / force-exit hack（axios 無常駐連線、無 polling）。
//
//服務啟動/重用、DB 種子、cleanup 全沿用 e2e-setup.mjs（§6.3 lifecycle 對稱：startServersOnce↔cleanup，
//mocha root after hook + process 備援兩觸發來源）。API 測試只需 backend，故傳 backendOnly 省前端 webpack 首編。
//
//token 機制（srv.mjs:56-92）：getUserByToken 寫死兩個有效 token、verifyClientUser/verifyAppUser = isAdmin==='y'：
//  'sys'                    → {id:'id-for-admin',  email:'admin@example.com',       isAdmin:'y'}（client+app 皆過）
//  '{token-for-application}'→ {id:'id-for-application', email:'application@...',     isAdmin:'y'}（app 過；注意字面含大括號）
//  其他                      → {}（→ 守門 reject 'can not find the user from token'）

import { startServersOnce, cleanup, apiBaseUrl } from './e2e-setup.mjs'

export { startServersOnce, cleanup, apiBaseUrl }

//API 契約測試啟動：只起 backend（11006），省前端 webpack。suite before 呼叫。
export async function startApi() {
    await startServersOnce({ backendOnly: true })
}

//token 常數
export const TOKEN_ADMIN = 'sys'                       // → id-for-admin（client 使用者，過 verifyClientUser）
export const TOKEN_APP = '{token-for-application}'     // → id-for-application（app 使用者，過 verifyAppUser）
export const TOKEN_BAD = 'nope-invalid'               // → getUserByToken 回 {} → 守門 reject

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

//lazy 取 woItems（唯讀斷言用）：必須在 startApi() 之後才 import g.mOrm.mjs，否則其 constructor 開 lmdb 會與
//seedDb 的 fs.rmSync('./db') 衝突。跨進程唯讀 select 已實測可行（backend 同開 lmdb，讀不寫風險低）。
let _woItems = null
export async function getWoItems() {
    if (!_woItems) {
        const m = await import('../g.mOrm.mjs')
        _woItems = m.woItems
    }
    return _woItems
}
