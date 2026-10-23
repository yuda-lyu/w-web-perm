//迭代使用端傳入之物件: 供伺服端寫入前驗證(server/validateRows.mjs)、權限評估(src/plugins/mShare.mjs)與前端清單元件解析 cgrups／cpemis／crules 後之物件共用
//規則見 sgud/rule/rulebook.md「迭代使用端傳入之物件」(R-OBJ-ITER-01)
//本檔無外部相依


/**
 * 迭代陣列或物件, 物件只依自有可列舉字串鍵(lodash each 對具非負整數 length 鍵之物件會改走索引 0..length-1, 真實鍵被略過且迭代次數即 length 之值)
 *
 * 真陣列(Array.isArray, 不用依 Object.prototype.toString 之 isarr: 可被 Symbol.toStringTag 偽稱)依索引由小到大迭代, 空洞以 undefined 迭代, 長度於開始時取一次, 同 lodash each;
 * 一般物件依 Object.keys 之順序迭代, length 與其他鍵同為一般鍵, 成本只依實際鍵數, 與 length 之值無關;
 * 其餘(null、undefined、字串、數字、布林、函數、Symbol)不迭代, 原樣回傳(lodash each 對字串會逐字元迭代, 本函數不做)
 *
 * @param {Array|Object} o 輸入陣列或物件
 * @param {Function} fn 輸入回呼函數(值, 鍵或索引, 原輸入), 回傳false時跳出, 其他回傳值(含undefined、true)皆繼續
 * @returns {Array|Object} 回傳原輸入
 * @example
 *
 * let ks = []
 * eachOwn({ id: 'a', length: 1, name: 'x' }, (v, k) => {
 *     ks.push(k)
 * })
 * console.log(ks)
 * // => ['id', 'length', 'name']
 *
 */
function eachOwn(o, fn) {
    if (Array.isArray(o)) {
        for (let k = 0, n = o.length; k < n; k++) { //長度於開始時取一次, 同 lodash each(回呼改動陣列長度時走訪範圍不變)
            if (fn(o[k], k, o) === false) {
                break
            }
        }
    }
    else if (o !== null && typeof o === 'object') {
        let ks = Object.keys(o)
        for (let i = 0; i < ks.length; i++) {
            let k = ks[i]
            if (fn(o[k], k, o) === false) {
                break
            }
        }
    }
    return o
}


export default eachOwn
