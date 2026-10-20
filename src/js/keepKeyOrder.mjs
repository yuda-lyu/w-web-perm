import eachOwn from './eachOwn.mjs'


/**
 * 以 kpRef 之鍵序重排 kpNew: 參考中已有之名稱維持參考序, 新增名稱附加於後(依 kpNew 序), kpNew 沒有之名稱(已刪除)不出現
 *
 * 編輯器寫出授權字串(cgrups／cpemis／crules)時使用(規則帳本 R-AUTH-ORDER-01): 伺服端 mergeRules 在沒有任何有效 OR 項時以「第一個 AND 項」為 AND 合併之起始,
 * 結果因鍵序而異, 編輯器若依對話框(群組表)順序重寫, 未改動之授權也會被改變(可增權可減權); 保留原鍵序使「存檔後授權不變」.
 * 值一律取 kpNew; 鍵為使用者資料(含 __proto__、constructor 等原型鍵名), 回傳無原型物件, 不改動輸入.
 * JS 物件屬性序使整數式鍵(如 '1'、'2')恆排在前面且遞增, 本函數無法改變(此類資料由 getKpLossy 判定, 見規則帳本 R-AUTH-LOSSY-01).
 *
 * @param {Object} kpRef 輸入參考物件(通常為 cvKpToObj 解碼後之原授權資料), 非物件(null、undefined、陣列、字串、數字)視為無參考
 * @param {Object} kpNew 輸入欲寫出之物件, 鍵為名稱
 * @returns {Object} 回傳無原型物件, 鍵序為參考序在前、新增在後
 * @example
 *
 * console.log(Object.keys(keepKeyOrder({ B: 1, A: 2 }, { A: 'a', C: 'c', B: 'b' })))
 * // => ['B', 'A', 'C']
 *
 */
function keepKeyOrder(kpRef, kpNew) {
    let o = Object.create(null)
    eachOwn(keyOrderOf(kpRef, kpNew), (k) => {
        o[k] = kpNew[k]
    })
    return o
}


/**
 * keepKeyOrder 的預期名稱順序: 參考中已有之名稱依參考序在前, kpNew 新增之名稱依 kpNew 序附加於後; 以陣列回傳(不受 JS 屬性序影響)
 *
 * 輸出物件(keepKeyOrder)之鍵序受 JS 屬性序影響(整數式鍵恆先排), 與本函數的預期序可能不同, 差異影響有效 AND 項之相對順序者由 getKeyOrderLost 判定(編輯器拒存).
 *
 * @param {Object} kpRef 輸入參考物件, 非物件視為無參考
 * @param {Object} kpNew 輸入欲寫出之物件, 非物件回傳空陣列
 * @returns {Array} 回傳名稱陣列
 * @example
 *
 * console.log(keyOrderOf({ B: 1, A: 2 }, { A: 'a', C: 'c', B: 'b' }))
 * // => ['B', 'A', 'C']
 *
 */
function keyOrderOf(kpRef, kpNew) {
    let isOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k)
    let names = []
    if (kpNew === null || typeof kpNew !== 'object' || Array.isArray(kpNew)) {
        return names
    }
    if (kpRef !== null && typeof kpRef === 'object' && !Array.isArray(kpRef)) {
        eachOwn(kpRef, (v, k) => {
            if (isOwn(kpNew, k)) {
                names.push(k)
            }
        })
    }
    eachOwn(kpNew, (v, k) => {
        if (!names.includes(k)) {
            names.push(k)
        }
    })
    return names
}


export { keyOrderOf }
export default keepKeyOrder
