import getOwn from './getOwn.mjs'


/**
 * 取得規則(標的)於 JSON5 解析結果(crules)中之啟用狀態
 *
 * 與 getUserRules 之解碼一致: 名稱為資料不是路徑(僅以自有屬性精確查值, 規則帳本 R-AUTH-PATH-01),
 * 值為物件(如 { isActive: 'y' })時取其 isActive, 其餘取值本身; 僅 'y' 為啟用, 其餘(含缺漏、非字串、物件值無 isActive)皆為 'n'.
 * 使編輯對話框顯示之狀態與實際授權結果一致, 存檔時不致把有效授權靜默改成 n
 *
 * @param {Object} kp 輸入 JSON5.parse(crules) 之結果, 鍵為規則(標的)名稱
 * @param {String} name 輸入規則(標的)名稱
 * @returns {String} 回傳 'y' 或 'n'
 */
function getRuleEnable(kp, name) {
    let v = getOwn(kp, name, '')
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
        v = getOwn(v, 'isActive', '')
    }
    return v === 'y' ? 'y' : 'n'
}


export default getRuleEnable
