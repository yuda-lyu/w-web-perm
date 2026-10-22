import { isExternalRow, getLockFields } from './externalRows.mjs'


//清單頁(標的／權限／群組／使用者)之外部列(from 為非空字串者)前端輔助純函數(F-23; R-PRINCIPLE-00 原則 3、5; 規則帳本 R-EXT-OWN-01; ADR-037): 不依賴 Vue／DOM／語系檔,
//判別外部列一律經 externalRows.isExternalRow(單一擁有者, 本檔不另寫判準); 伺服端為強制者, 本檔只供畫面提示與送出前擋下(不取代伺服端守門).


let isStr = (v) => typeof v === 'string'
let isObj = (v) => v !== null && typeof v === 'object'


//normV: 比對用正規化, 同 externalRows 之 checkExternalWrite(缺欄與 '' 視為同一; 其餘以 JSON 字串比對)
let normV = (v) => JSON.stringify(v === undefined ? '' : v)


/**
 * 把範本之 {key} 代入(單趟掃描: 代入之值不再解析, 名稱可含 {n}、{from} 等字樣原樣顯示; 未給之佔位符原樣保留)
 *
 * 與 getAuthWarn.fmtWarn 同設計, 但佔位符不限定名單(如 {from}、{name}); 值一律轉字串, 不特殊處理 $ 字樣.
 *
 * @param {String} tpl 輸入範本
 * @param {Object} [vars={}] 輸入 { 佔位符名: 值 }
 * @returns {String} 回傳代入後之文字
 * @example
 *
 * console.log(fmtVars('{from}: {n}', { from: 'teamA', n: 3 }))
 * // => 'teamA: 3'
 *
 */
function fmtVars(tpl, vars = {}) {
    let kp = Object.create(null)
    Object.keys(isObj(vars) ? vars : {}).forEach((k) => {
        kp[k] = String(vars[k])
    })
    return String(tpl).replace(/\{(\w+)\}/g, (hit, k) => (k in kp ? kp[k] : hit))
}


/**
 * 計算外部列(from 為非空字串者)之列數
 *
 * @param {Array} rows 輸入列陣列(非陣列視為空)
 * @returns {Number} 回傳外部列數
 */
function countExternalRows(rows) {
    if (!Array.isArray(rows)) {
        return 0
    }
    return rows.filter((r) => isExternalRow(r)).length
}


/**
 * 取出屬於某表之外部同步警示(getWebInfor().syncWarns: [{ keyTable, from, n, time }]; 外部同步疑似 id 重編)
 *
 * 只取 keyTable 與本頁表名相符、from 為非空字串、n 為正數者; 輸出為 { from, n }(次序同輸入); 非陣列或元素格式不符者略過.
 *
 * @param {Array} syncWarns 輸入 webInfor.syncWarns
 * @param {String} keyTable 輸入本頁表名(targets／pemis／grups／users)
 * @returns {Array} 回傳 [{ from, n }]
 */
function getSyncWarnLines(syncWarns, keyTable) {
    let rs = []
    if (!Array.isArray(syncWarns)) {
        return rs
    }
    syncWarns.forEach((w) => {
        if (isObj(w) && w.keyTable === keyTable && isStr(w.from) && w.from !== '' && typeof w.n === 'number' && w.n > 0) {
            rs.push({ from: w.from, n: w.n })
        }
    })
    return rs
}


/**
 * 產生清單上方橫幅之各行: 外部列提示(啟用外部列保護且外部列數 > 0 才有)＋本表之外部同步警示(每個來源一行); 皆無則回空陣列(頁面不渲染任何節點)
 *
 * 外部列提示用語系鍵 externalRowsNotice(群組／權限／使用者: 身分欄唯讀、不可刪除、指派可改)或 externalRowsNoticeTarget(標的無指派欄); 警示用 syncWarnIdRenumber({from}、{n}).
 *
 * @param {Object} p 輸入參數物件
 * @param {String} p.keyTable 輸入本頁表名
 * @param {String} p.kind 輸入頁面種類: 'Target'(標的頁)或其他
 * @param {Array} p.rows 輸入本頁之基準列(store 之該表列, 已儲存者; 外部列只可能由外部同步寫入)
 * @param {Boolean} p.lock 輸入是否啟用外部列保護(webInfor.lockExternalRows === 'y')
 * @param {Array} p.syncWarns 輸入 webInfor.syncWarns
 * @param {Function} p.$t 輸入語系函數(key → 文字)
 * @returns {Array} 回傳 [{ kind: 'ext'|'warn', text }]
 */
function getBannerLines({ keyTable, kind, rows, lock, syncWarns, $t }) {
    let rs = []
    let n = lock === true ? countExternalRows(rows) : 0
    if (n > 0) {
        rs.push({ kind: 'ext', text: fmtVars($t(kind === 'Target' ? 'externalRowsNoticeTarget' : 'externalRowsNotice'), { n }) })
    }
    getSyncWarnLines(syncWarns, keyTable).forEach((w) => {
        rs.push({ kind: 'warn', text: fmtVars($t('syncWarnIdRenumber'), { from: w.from, n: w.n }) })
    })
    return rs
}


/**
 * 把勾選列依外部列保護切成「可處理」與「被擋下」: 啟用外部列保護時外部列不得刪除(伺服端 saveExternalRowChanged), 先於前端過濾並計數供提示
 *
 * @param {Array} items 輸入勾選之項目(清單頁 vo.itemsCheck, 每項之 data 為該列資料)
 * @param {Boolean} lock 輸入是否啟用外部列保護
 * @returns {Object} 回傳 { rows, nBlocked }: rows 為可處理之項目(未啟用保護時為全部), nBlocked 為被擋下之外部列數
 */
function splitCheckedRows(items, lock) {
    let all = Array.isArray(items) ? items : []
    if (lock !== true) {
        return { rows: all, nBlocked: 0 }
    }
    let rows = all.filter((v) => !isExternalRow(isObj(v) ? v.data : undefined))
    return { rows, nBlocked: all.length - rows.length }
}


/**
 * 送出前檢查: 外部列(以基準列判定)是否被改動身分／結構欄、from 或被刪除(含改 id 致原 id 消失)——清單頁以逐列唯讀與刪除過濾擋下, 但貼上(Ctrl+V)等路徑可繞過逐列唯讀,
 * 故送出前再比對一次(判準同 externalRows.checkExternalWrite: 鎖定欄位＝getLockFields, 另含 from; 指派欄與 order／伺服器管理欄不比對), 有違規即不送出並提示(伺服端同樣整次拒收)
 *
 * @param {Object} p 輸入參數物件
 * @param {String} p.keyTable 輸入表名(targets／pemis／grups／users)
 * @param {Array} p.keys 輸入該表 schema 欄位名陣列(ds[keyTable].keys)
 * @param {Array} p.rowsNew 輸入欲送出之整表(清單目前之列)
 * @param {Array} p.rowsOld 輸入基準列(store 之該表列)
 * @returns {Object|null} 回傳 null 為無違規; 否則 { n, froms }: n 為違規之外部列數, froms 為涉及之來源(至多 5 個)
 */
function getExternalEdits({ keyTable, keys, rowsNew, rowsOld }) {
    let fields = [...getLockFields(keyTable, keys), 'from']
    let newById = new Map()
    ;(Array.isArray(rowsNew) ? rowsNew : []).forEach((r) => {
        if (isObj(r) && (isStr(r.id) || (typeof r.id === 'number' && Number.isFinite(r.id)))) {
            newById.set(String(r.id), r)
        }
    })
    let n = 0
    let froms = []
    ;(Array.isArray(rowsOld) ? rowsOld : []).forEach((o) => {
        if (!isExternalRow(o) || !isStr(o.id)) {
            return
        }
        let r = newById.get(o.id)
        if (r === undefined || fields.some((f) => normV(r[f]) !== normV(o[f]))) {
            n++
            if (froms.indexOf(o.from) < 0 && froms.length < 5) {
                froms.push(o.from)
            }
        }
    })
    return n > 0 ? { n, froms } : null
}


export { fmtVars, countExternalRows, getSyncWarnLines, getBannerLines, splitCheckedRows, getExternalEdits }
export default fmtVars
