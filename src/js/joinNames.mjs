/**
 * 把名稱陣列以「, 」串接供訊息顯示, 超過上限者截斷並加省略號
 *
 * @param {Array} names 輸入名稱陣列, 非陣列回傳空字串, 元素非字串者轉字串
 * @param {Number} [max=5] 輸入最多列出幾個名稱, 預設5
 * @returns {String} 回傳字串, 如 'a, b, c' 或 'a, b, c, d, e …'
 * @example
 *
 * console.log(joinNames(['a', 'b']))
 * // => 'a, b'
 * console.log(joinNames(['a', 'b', 'c'], 2))
 * // => 'a, b …'
 *
 */
function joinNames(names, max = 5) {
    if (!Array.isArray(names)) {
        return ''
    }
    let s = names.slice(0, max).map((v) => String(v)).join(', ')
    return names.length > max ? `${s} …` : s
}


export default joinNames
