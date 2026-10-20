import joinNames from './joinNames.mjs'


/**
 * 把拒存訊息範本(authLossyBlocked)之 {names} 代入受影響之名稱
 *
 * 名稱為使用者／外部應用寫入之資料, 可含 $&、$$、$' 等字樣; 以 split／join 代入(不用 String.replace, 其替換字串中的 $ 樣式會被展開), 名稱原樣顯示.
 *
 * @param {String} tpl 輸入訊息範本, 含 {names}
 * @param {Array} names 輸入受影響之名稱陣列(至多列出 5 個, 超過加省略號, 見 joinNames)
 * @returns {String} 回傳代入後之訊息
 * @example
 *
 * console.log(fmtLossyMsg('Not saved: {names}', ['a', '$&']))
 * // => 'Not saved: a, $&'
 *
 */
function fmtLossyMsg(tpl, names) {
    return String(tpl).split('{names}').join(joinNames(names))
}


export default fmtLossyMsg
