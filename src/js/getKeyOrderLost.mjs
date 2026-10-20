import isAuthMode from './isAuthMode.mjs'


/**
 * 判定欲寫出之物件 kpOut 的鍵序(JS 屬性序: 整數式鍵先排、遞增)是否與預期序 seq 不同, 使有效 AND 名稱之相對順序易位, 回傳受影響之 AND 名稱
 *
 * 編輯器以 keepKeyOrder 讓「原字串已有之名稱維持原序、新增者附加於後」, 但 JS 物件的整數式鍵(如群組名 '1')恆排在前面,
 * 新增(或新啟用)的整數式 AND 名稱會排到既有 AND 名稱之前, 使伺服端 mergeRules 在沒有有效 OR 項時的「第一個 AND 項」易位而改變授權(規則帳本 R-AUTH-LOSSY-01);
 * 此為編輯器無法在不改變授權下寫出的格, 須拒存並顯示固定訊息(authLossyBlocked).
 * 只看有效 AND 項(isActive 'y' 且 mode 'AND')之「第一個」是否易位: 欲寫出之物件只含現存之群組／權限(編輯器列出之列, 無查無實體之名稱被丟棄的問題),
 * mergeRules 的結果對 AND 項順序的依賴只經第一個 AND 項(其餘 AND 項彼此可交換), 故第一個不變則其後之相對順序改變不影響授權, 不需拒存(輸入側 getKpLossy 因幻影名稱須比整個相對順序, 見其說明).
 *
 * @param {Object} kpOut 輸入欲寫出之物件 { 名稱: { mode, isActive } }
 * @param {Array} seq 輸入預期的名稱順序(keepKeyOrder 之 keyOrderOf 結果)
 * @returns {Array} 回傳受影響之 AND 名稱(依預期序), 無易位回傳空陣列; 不改動輸入
 * @example
 *
 * let seq = ['A', '1']
 * let kpOut = { '1': { mode: 'AND', isActive: 'y' }, A: { mode: 'AND', isActive: 'y' } } //JS 把 '1' 排到 A 前面
 * console.log(getKeyOrderLost(kpOut, seq))
 * // => ['A', '1']
 *
 */
function getKeyOrderLost(kpOut, seq) {
    if (kpOut === null || typeof kpOut !== 'object' || !Array.isArray(seq)) {
        return []
    }
    let isAnd = (n) => {
        let p = Object.prototype.hasOwnProperty.call(kpOut, n) ? kpOut[n] : null
        return p !== null && typeof p === 'object' && p.isActive === 'y' && isAuthMode(p.mode) && p.mode === 'AND'
    }
    //有任何有效 OR 項時, mergeRules 以 OR 聯集為基底、各 AND 項各鍵獨立相交, AND 項順序與授權無關(外審 minimax 第二輪#2: 否則多餘拒存)
    let hasOr = Object.keys(kpOut).some((n) => {
        let p = kpOut[n]
        return p !== null && typeof p === 'object' && p.isActive === 'y' && p.mode === 'OR'
    })
    if (hasOr) {
        return []
    }
    let want = seq.filter((n) => isAnd(n))
    if (want.length < 2) {
        return []
    }
    let got = Object.keys(kpOut).filter((n) => want.includes(n))
    return got[0] !== want[0] ? want : []
}


export default getKeyOrderLost
