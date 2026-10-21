/**
 * 判斷是否為合法合併模式 'OR' 或 'AND'
 *
 * 用於偵測 mode 缺或不合法(頁面提示 getAuthWarn 之 modeInvalid). 伺服端 src/plugins/mShare.mjs 之 mergeRules 對 mode 非 OR／AND 之項
 * 不再略過而是視為 AND 限制項(規則帳本 R-AUTH-MERGE-00 第 5 條、R-PRINCIPLE-00 e), 有效值見 getEffMode.
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
