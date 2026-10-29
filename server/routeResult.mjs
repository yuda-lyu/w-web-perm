import isErr from 'wsemi/src/isErr.mjs'
import { toOutKey } from './procCore.mjs'
import { checkRawSecrets, maskRaw } from './maskRaw.mjs'


//hapi 路由失敗結果之收斂(R-ROUTE-MSG-01; perm-run01 本輪, 外審 sol#5; 對照資料通道之 wrapOperOrm: ORM 拒絕之原文只入 srLog、對前端回 anUnexpectedErrorOccurred):
//  四條 hapi 路由(/api/getUserByToken、/api/getPerm、/api/getPermUserInfor、/syncAndReplaceTabs)以 pm2resolve 包裝核心函數, 失敗時結果為 { state:'error', msg: 拒絕值 }.
//  修正前 Error 一律改取 msg.message(`r.msg = r.msg.message`), ORM／I/O 原文(如 lmdb、檔案系統錯誤訊息)隨之回給外部應用與瀏覽器; 非 Error 之字串拒絕值亦原樣回傳.
//  本函數: 拒絕值(Error 取 message)為已知語系鍵(procLang 之鍵)者原樣回傳, 前端與外部應用以鍵顯示文字; 其餘一律改回固定鍵 anUnexpectedErrorOccurred, 原文只入 srLog.


/**
 * 建立 hapi 路由失敗結果之收斂函數
 *
 * @param {Object} p 輸入物件
 * @param {Object} p.srLog 輸入 srLog(須有 error 方法)
 * @param {Object} p.secrets 輸入 maskRaw.getRawSecrets(url) 之結果(必帶, 缺即 TypeError): 路由核心函數直接呼叫 woItems 之 ORM(getPerm 之 woItems.*.select 等)之錯誤原文可能回顯連線字串, 入 srLog 之 raw 前先移除連線憑證(R-ORM-DIAG-02)
 * @returns {Function} 回傳 (r, event) => r: r 為 pm2resolve 結果 { state, msg }, event 為記 srLog 用之事件名(如 'api/getPerm-error');
 *   state 非 'error'(成功、取消)原樣回傳; 為 'error' 時 r.msg 改為語系鍵(已知鍵原樣, 其餘 anUnexpectedErrorOccurred 並於 srLog 記 { event, msg:'anUnexpectedErrorOccurred', raw: 移除連線憑證後之原文前 500 字 })
 */
function createRouteResult({ srLog, secrets }) {
    checkRawSecrets(secrets, 'createRouteResult')
    return (r, event) => {
        if (r === null || typeof r !== 'object' || r.state !== 'error') {
            return r
        }
        let raw = isErr(r.msg) ? r.msg.message : r.msg
        let key = toOutKey(raw, 'anUnexpectedErrorOccurred')
        if (key !== raw) {
            //診斷字串化本身不得拋錯而取代既定回應(null 原型物件、toString 非函數等會使 String() 拋 TypeError; 外審 sol F08)
            let rawStr = ''
            try {
                rawStr = (typeof raw === 'string') ? raw : String(raw)
            }
            catch (err) {
                rawStr = '[unprintable]'
            }
            //先遮罩再截斷: 先截斷會把跨在第 500 字之憑證切成殘片而不再命中秘密清單
            srLog.error({ event, msg: 'anUnexpectedErrorOccurred', raw: maskRaw(rawStr, secrets).slice(0, 500) })
        }
        r.msg = key
        return r
    }
}


export default createRouteResult
