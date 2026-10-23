//資料驅動之名稱轉屬性鍵: 供權限評估(src/plugins/mShare.mjs mergeRules)與編輯對話框(經 cvKpToObj)共用
//規則見 sgud/rule/rulebook.md「關聯對話框容錯、以身分配對、資料驅動屬性鍵」之 R-KEY-PROP-01
//本檔無外部相依


/**
 * 把資料驅動之名稱轉為屬性鍵字串(與 `obj[name] = …` 之屬性鍵轉型相同), 轉不了者回 null
 *
 * 外部應用可直接寫入陣列形式授權資料([{ "name": …, "isActive": … }]), 元素 name 為任意 JSON 值; 以之當屬性鍵時,
 * JS 先將物件轉為字串(ToPrimitive → toString／valueOf), 遇 `{ "toString": null }`、`[{ "toString": 1 }]` 等值必拋 TypeError
 * (Cannot convert object to primitive value), 若不接住會使整個權限查詢失敗. 本函數與屬性鍵轉型取同一個 ToString:
 * 可轉者回同一字串(5 → '5'、true → 'true'、null → 'null'、['T1'] → 'T1'、{} → '[object Object]'), 轉不了者回 null, 呼叫端略過該元素(不對應任何標的／規則, 等同不存在).
 * 例外(Symbol, JSON 不會產生): 屬性鍵轉型可用(建立 symbol 鍵, 不被 Object.keys／eachOwn 走訪), 本函數回 null; 兩者效果相同(該元素不對應任何字串名稱之標的／規則).
 *
 * @param {*} name 輸入名稱(任意值)
 * @returns {String|null} 回傳屬性鍵字串; 轉型會拋錯者回傳 null
 * @example
 *
 * console.log(getPropKey('T1'))
 * // => 'T1'
 * console.log(getPropKey(5))
 * // => '5'
 * console.log(getPropKey({ toString: null }))
 * // => null
 *
 */
function getPropKey(name) {
    try {
        return `${name}`
    }
    catch (err) {
        return null
    }
}


export default getPropKey
