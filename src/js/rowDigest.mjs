//載入基準(多人同時編輯之過期保護, 先動先贏; R-PRINCIPLE-00 原則 3、使用者 2026-10-22 裁示原則 10; 規則帳本 R-BASELINE-01、R-CONTRACT-01; ADR-037 Update(perm-run01)):
//本檔為套內轉接層, 摘要、基準與比對一律由 w-serv-orm 共用核心(w-serv-orm/src/baseline.mjs, 零 import 之同構純函數, 版本 h1)計算, 套內不再自帶指紋演算法:
//  - 摘要 digestRow: 依寫入契約(src/schema/contracts)之 fields 白名單; undefined／null／'' 同一空值; 數字與字串不互轉; 物件鍵序無關.
//  - 基準 buildBaseline: 有序 [[id, 摘要]], 序即名次(order 數值, 主鍵碼元); 他人重排被偵測, 系統重編號(名次不變)不誤擋.
//  - 比對 compareBaseline: 增、刪、改、名次任一不同即不符.
//基準＝「編輯草稿所依據之那一版資料」之基準, 於開啟編輯(建立草稿)時由草稿所依據之整表計算並綁定, 之後即使 store 變新, 舊草稿仍帶舊基準.
//伺服端於表鎖內以新鮮讀取之庫內整表比對(先動先贏, 零寫入, 不部分變更、不上鎖); 前端用同一組函數判定草稿是否已過期(提示「資料已被更新」).
//舊格式(套內版, 無 'h1:' 前綴)或不識版本之基準一律拒收 baselineFormat, 提示重新載入, 不降級為「未帶基準」.
//
//未帶基準之舊客戶端: 後台列維持舊行為(最後寫入者勝, ADR-013); 但**修改外部列之指派欄**無從證明快照新舊(Lv1 放行之指派欄不得因舊快照還原外部已撤銷之授權, 外審 B.2), 依原則 3 收嚴拒收(saveBaselineRequired).

import { buildBaseline, compareBaseline as compareCore, isBaselineValid, digestRow } from 'w-serv-orm/src/baseline.mjs'
import contracts from '../schema/contracts/index.mjs'


let hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k)


/**
 * 取得表之寫入契約(表名須為 targets／pemis／grups／users)
 *
 * @param {String} keyTable 輸入表名
 * @returns {Object} 回傳寫入契約
 */
function getContract(keyTable) {
    if (typeof keyTable !== 'string' || !hasOwn(contracts, keyTable)) {
        throw new Error(`invalid keyTable of contract: ${String(keyTable)}`)
    }
    return contracts[keyTable]
}


/**
 * 由草稿所依據之整表列計算載入基準(核心 buildBaseline; 前端以畫面所見之同一快照自算, 不向後端取雜湊)
 *
 * 主鍵缺漏或重複(資料異常, 正常不會發生)時不拋錯, 回傳空基準: 與非空之庫內整表比對必不符, 存檔被拒並提示重新載入(fail-closed).
 *
 * @param {Array} rows 輸入草稿所依據之那份列(開啟編輯時之 store 快照, 非存檔當下)
 * @param {String} keyTable 輸入表名
 * @returns {Array} 回傳 [[id, 'h1:…'], ...](依名次)
 */
function makeBaseline(rows, keyTable) {
    try {
        return buildBaseline(Array.isArray(rows) ? rows : [], getContract(keyTable))
    }
    catch (err) {
        return []
    }
}


/**
 * 表級比對: 目前整表與載入基準(草稿所依據之整表)之差異
 *
 * 前端(判定草稿是否過期、顯示提示)與伺服端(checkBaseline)共用, 口徑單一(核心 compareBaseline).
 *
 * @param {Object} p 輸入參數物件
 * @param {String} p.keyTable 輸入表名
 * @param {Array} p.rows 輸入目前整表之列(伺服端為表鎖內新鮮讀取之全部列, 前端為 store 之該表列)
 * @param {Array} p.baseline 輸入載入基準
 * @returns {Object} 回傳 { nChanged, nRemoved, nAdded, reordered, reason }: 內容摘要不同之列數／基準有而現已不在之列數／基準無而現在才有之列數／名次是否不同／核心拒收鍵(相符為空字串);
 *   基準格式不合時 reason 為 baselineFormat; 目前列之主鍵缺漏或重複(rowsInvalid)時拋錯(key 為 rowsInvalid)
 */
function compareBaseline({ keyTable, rows, baseline }) {
    let c = compareCore(Array.isArray(rows) ? rows : [], baseline, getContract(keyTable))
    if (c.ok) {
        return { nChanged: 0, nRemoved: 0, nAdded: 0, reordered: false, reason: '' }
    }
    return { nChanged: c.changed.length, nRemoved: c.removed.length, nAdded: c.added.length, reordered: c.reordered === true, reason: c.reason }
}


/**
 * 判斷載入基準相對於目前整表是否已過期(供前端提示用)
 *
 * 前端容錯: 基準格式不合或目前列主鍵異常皆視為過期(fail-closed, 提示重新載入).
 *
 * @param {Object} p 輸入參數物件(同 compareBaseline)
 * @returns {Boolean} 回傳 true 為過期(有任何一列內容不同、列被增刪或名次不同)
 */
function isBaselineStale(p) {
    try {
        return compareBaseline(p).reason !== ''
    }
    catch (err) {
        return true
    }
}


/**
 * 以載入基準做表級過期檢查(伺服端, 須在表鎖內以新鮮讀取之整表呼叫; 不符整次拒收、零寫入)
 *
 * 規則: 載入時之整表與目前整表有任何差異(列內容、列增刪、名次)即過期, 不論差異是否落在「本次將寫入之列」——不部分變更, 先動先贏;
 * 外部同步整批重寫但內容未變(含時間／建立者改變、order 重編而名次不變)不使草稿作廢.
 * 基準格式或版本不識(含套內舊版指紋)→ saveBaselineFormat(提示重新載入, 不降級為未帶基準).
 *
 * @param {Object} p 輸入參數物件
 * @param {String} p.keyTable 輸入表名
 * @param {Array} p.ltdtOld 輸入該表庫內全部列(表鎖內新鮮讀取)
 * @param {Array} p.baseline 輸入客戶端載入基準(任何值; 格式不合由核心判定)
 * @returns {Object|null} 回傳 null 為通過; 否則 { key, reason, n }: key 為語系鍵(saveStale／saveBaselineFormat), reason 為核心拒收鍵(baselineMismatch／rowNotFound／baselineFormat)加細節
 *   (baselineMismatch 時為 rowChanged／rowRemoved／rowAdded／rowReordered, 依序取第一個成立者; rowNotFound／baselineFormat 原樣), n 為差異列數(格式不合為 0, 僅名次不同為 1)
 */
function checkBaseline({ keyTable, ltdtOld, baseline }) {
    let c = compareBaseline({ keyTable, rows: ltdtOld, baseline })
    if (c.reason === '') {
        return null
    }
    if (c.reason === 'baselineFormat') {
        return { key: 'saveBaselineFormat', reason: 'baselineFormat', n: 0 }
    }
    let n = c.nChanged + c.nRemoved + c.nAdded
    if (c.reason === 'rowNotFound') {
        return { key: 'saveStale', reason: 'rowNotFound', n }
    }
    let reason = c.nChanged > 0 ? 'rowChanged' : (c.nRemoved > 0 ? 'rowRemoved' : (c.nAdded > 0 ? 'rowAdded' : 'rowReordered'))
    return { key: 'saveStale', reason, n: n > 0 ? n : 1 }
}


export { getContract, makeBaseline, isBaselineValid, digestRow, compareBaseline, isBaselineStale, checkBaseline }
export default makeBaseline
