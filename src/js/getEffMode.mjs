/**
 * 取得合併模式之有效值: 'OR' 為 'OR', 其餘(缺、非字串、'or'、'XOR' 等無法判讀者)一律視為 'AND'
 *
 * 規則帳本 R-AUTH-MERGE-00 第 5 條、R-PRINCIPLE-00 e: 無法判讀時取最嚴之解讀. 略過該項會使 AND 限制消失而放寬, 故改視為 AND(mergeRules 中為「限制項」:只當交集項、不單獨當基底,該層無合法 mode 之啟用項時全 n,否則唯一項成基底而比修正前多給).
 * 伺服端 mergeRules(src/plugins/mShare.mjs)、編輯器解碼(cvKpToObj)、無損表示判定(getKpLossy)與頁面提示(getAuthWarn)共用, 單一擁有者.
 *
 * @param {*} m 輸入 mode
 * @returns {String} 回傳 'OR' 或 'AND'
 * @example
 *
 * console.log(getEffMode('OR'), getEffMode('AND'), getEffMode('or'), getEffMode(undefined))
 * // => OR AND AND AND
 *
 */
function getEffMode(m) {
    return m === 'OR' ? 'OR' : 'AND'
}


export default getEffMode
