/**
 * 判斷是否為合法合併模式 'OR' 或 'AND'
 *
 * 與伺服端 src/plugins/mShare.mjs 之 mergeRules 一致: mode 非 OR／AND 之群組／權限不納入合併(不授權).
 * 編輯器解碼(cvKpToObj)與無損表示判定(getKpLossy)共用, 單一擁有者.
 *
 * @param {*} m 輸入 mode
 * @returns {Boolean} 回傳是否為 'OR' 或 'AND'
 * @example
 *
 * console.log(isAuthMode('OR'), isAuthMode('or'), isAuthMode(undefined))
 * // => true false false
 *
 */
function isAuthMode(m) {
    return m === 'OR' || m === 'AND'
}


export default isAuthMode
