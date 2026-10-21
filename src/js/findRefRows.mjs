/**
 * 取得「名稱為 name」之表列(群組表／權限表), 授權引用(使用者 cgrups、群組 cpemis)以名稱字串查找實體之唯一判準,
 * 伺服端權限評估(src/plugins/mShare.mjs 之 getUserRules)與頁面提示(src/js/getAuthWarn.mjs)共用(規則帳本 R-AUTH-REF-01)
 *
 * 比對為精確 ===(不做大小寫／空白正規化); 列無 name 欄(undefined)視為空字串 '', 與引用名稱 '' 相符(沿用修正前 lodash get(row, 'name', '') 之行為).
 * 回傳全部符合之列(依表中順序): 0 筆＝引用查無實體(懸空), 1 筆＝正常, ≥ 2 筆＝歷史同名(僅外部同步可造成; 授權取各筆之交集, R-PRINCIPLE-00 d).
 *
 * @param {Array} rows 輸入表列陣列(非陣列視為空)
 * @param {*} name 輸入引用之名稱(以 === 比對, 不做型別轉換: 名稱與列名同為數字時相符,與修正前 arrFinder 相同; 實務上表列名稱為字串, 非字串名稱之引用視為懸空並由 getAuthWarn 提示 noName)
 * @returns {Array} 回傳符合之列陣列
 * @example
 *
 * console.log(findRefRows([{ name: 'A' }, { name: 'B' }, { name: 'A' }], 'A').length)
 * // => 2
 * console.log(findRefRows([{ name: 'A' }], 'X').length)
 * // => 0
 *
 */
function findRefRows(rows, name) {
    let rs = []
    if (!Array.isArray(rows)) {
        return rs
    }
    for (let k = 0; k < rows.length; k++) {
        let r = rows[k]
        let n = (r === null || r === undefined || r.name === undefined) ? '' : r.name
        if (n === name) {
            rs.push(r)
        }
    }
    return rs
}


export default findRefRows
