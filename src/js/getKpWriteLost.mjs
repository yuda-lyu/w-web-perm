import keepKeyOrder, { keyOrderOf } from './keepKeyOrder.mjs'
import getKeyOrderLost from './getKeyOrderLost.mjs'


/**
 * 判定欲寫出之授權物件 kpNew 以 keepKeyOrder(kpRef, kpNew) 寫出時, 鍵序是否被 JS 屬性序(整數式鍵恆先排)改變而使第一個有效 AND 項易位, 回傳受影響之 AND 名稱
 *
 * 四個帶 mode 的編輯器(VeCgrups／VeCpemis／VeGrupBlngUsers／VePemiBlngGrups)寫出前共用此函數(規則帳本 R-AUTH-LOSSY-01 ③): 預期序一律由「參考(解碼後之原資料)」與「欲寫出之物件」
 * 在此函數內導出, 呼叫端不得自行傳入預期序——外審 minimax 第二輪指出關聯對話框曾以「已套用 JS 屬性序之物件序」當預期序, 守門恆等而形同虛設.
 * kpRef 須為解碼後之原授權資料(cvKpToObj 之結果, 鍵序即伺服端序); kpNew 為欲寫出之物件(名稱 → { mode, isActive }).
 *
 * @param {Object} kpRef 輸入解碼後之原授權資料
 * @param {Object} kpNew 輸入欲寫出之物件
 * @returns {Array} 回傳受影響之 AND 名稱(依預期序), 無易位回傳空陣列; 不改動輸入
 * @example
 *
 * let kpRef = { A: { mode: 'AND', isActive: 'y' } }
 * let kpNew = { A: { mode: 'AND', isActive: 'y' }, 1: { mode: 'AND', isActive: 'y' } } //新啟用整數式名稱 1 為 AND
 * console.log(getKpWriteLost(kpRef, kpNew))
 * // => ['A', '1']
 *
 */
function getKpWriteLost(kpRef, kpNew) {
    return getKeyOrderLost(keepKeyOrder(kpRef, kpNew), keyOrderOf(kpRef, kpNew))
}


export default getKpWriteLost
