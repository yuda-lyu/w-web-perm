//存檔成功後立即以伺服端回傳之「寫入後之列」更新前端 store(多人同時編輯規格第 8 節; R-PRINCIPLE-00 原則 10; 規則帳本 R-SAVED-ROWS-01; ADR-037 Update(perm-run01)): 純函數(不依賴 Vue／DOM／ORM).
//
//背景: 存檔成功後新基準須取自伺服端、且須立即取得——若只等推播／輪詢(約 2 秒)才更新 store 與基準, 使用者存檔成功後立即再編輯再存, 會被自己上一次之存檔誤擋(api-verify01 實測 8 次中 7 次; perm run12 同見).
//不得以「自己送出之值」當新基準: 寫入時 clearXSS 等會改寫部分字串(例 a<b 存為 a&lt;b), 以送出值當基準, 下次存檔會被自己之基準誤拒. 故 updateXxx 於成功時(客戶端帶 returnRows:true)回傳 { msg, rows, others }:
//rows 為鎖內新鮮讀取之該表全部列, others 為引用連帶有改寫之引用端表(鍵為表名)之全部列. 前端把它們 commit 進 store(同 main.js recvData 之 UpdateTableData), 清單頁與對話框的重建照既有流程即以之為新資料與新基準; 其後抵達之同內容推播, 摘要相同, 不視為他人更新.

let TABLES = ['targets', 'pemis', 'grups', 'users']
let hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k)


//isRows: 須為陣列且每列為物件、主鍵 id 為非空字串(正常資料恆是; 否則視為異常回傳而不套用, 退回等推播)
let isRows = (rs) => Array.isArray(rs) && rs.every((r) => r !== null && typeof r === 'object' && typeof r.id === 'string' && r.id !== '')


/**
 * 取出存檔回傳中可套用之表資料: [{ tableName, data }, ...]; 回傳不是 { rows, others } 形狀(舊伺服端回字串、讀回失敗)或資料異常者回空陣列(呼叫端退回等推播)
 *
 * @param {String} keyTable 輸入本次存檔之表名(targets／pemis／grups／users)
 * @param {*} res 輸入 updateXxx 之回傳(成功 msg key 字串, 或 { msg, rows, others })
 * @returns {Array} 回傳 [{ tableName, data }, ...](本表在前, 引用端表在後; 表名不在白名單或資料異常者略過)
 */
function getSavedTables(keyTable, res) {
    let out = []
    if (res === null || typeof res !== 'object' || TABLES.indexOf(keyTable) < 0 || !isRows(res.rows)) {
        return out
    }
    out.push({ tableName: keyTable, data: res.rows })
    let others = (res.others !== null && typeof res.others === 'object') ? res.others : {}
    Object.keys(others).forEach((t) => {
        if (t !== keyTable && TABLES.indexOf(t) >= 0 && hasOwn(others, t) && isRows(others[t])) {
            out.push({ tableName: t, data: others[t] })
        }
    })
    return out
}


/**
 * 存檔成功後以回傳之寫入後之列更新 store
 *
 * @param {String} keyTable 輸入本次存檔之表名
 * @param {*} res 輸入 updateXxx 之回傳
 * @param {Function} commitTable 輸入 (tableName, data) => void, 實際 commit UpdateTableData 之函數(同 main.js recvData)
 * @returns {Boolean} 回傳是否已套用(false 為回傳不含可用之列, 前端退回等推播)
 */
function applySavedRows(keyTable, res, commitTable) {
    let ts = getSavedTables(keyTable, res)
    ts.forEach((t) => {
        commitTable(t.tableName, t.data)
    })
    return ts.length > 0
}


export { getSavedTables, applySavedRows }
export default applySavedRows
