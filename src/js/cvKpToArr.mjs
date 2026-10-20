import iseobj from 'wsemi/src/iseobj.mjs'
import eachOwn from './eachOwn.mjs'


/**
 * 解碼授權資料(JSON5.parse(cgrups／cpemis／crules) 之結果)為 [{ name, … }] 陣列, 伺服端權限評估(src/plugins/mShare.mjs 之 getUserRules)與編輯對話框(經 cvKpToObj)共用之唯一解碼
 *
 * 授權資料為使用者(含外部應用)寫入, 鍵為群組／權限／規則名, 一律以 eachOwn 依自有鍵走訪(規則帳本 R-OBJ-ITER-01):
 * lodash each 對含非負整數 length 鍵之物件改走索引 0..length-1, 真實鍵被略過(權限靜默評估為 n), length 極大時空轉或耗盡記憶體(每次 getPerm／getPermUserInfor 皆走此路徑).
 * eachOwn 對陣列依索引、對物件依自有鍵, 對字串與其他原始值不迭代.
 * 名稱: 物件形式(以名稱為鍵)以外層鍵為名, 值內 name 不得改名(編輯器依外層鍵顯示與存檔, 授權若依值內 name 則顯示與授權不一致; 規則帳本 R-AUTH-PATH-01);
 * 陣列形式([{ name, … }])元素之 name 即名稱(元素無 name 或非物件時名稱為索引數字, 不會對應任何群組／權限／規則名)
 *
 * @param {Object|Array} kp 輸入 JSON5.parse(cgrups／cpemis／crules) 之結果, 物件形式 { 名稱: 值 } 或陣列形式 [{ name, … }]
 * @returns {Array} 回傳 [{ name, … }] 陣列; 值為物件(iseobj)時展開其欄位(如 mode、isActive), 否則以值為 isActive
 * @example
 *
 * console.log(cvKpToArr({ A: 'y', B: { mode: 'OR', isActive: 'y' } }))
 * // => [{ name: 'A', isActive: 'y' }, { name: 'B', mode: 'OR', isActive: 'y' }]
 * console.log(cvKpToArr([{ name: 'A', isActive: 'y' }]))
 * // => [{ name: 'A', isActive: 'y' }]
 *
 */
function cvKpToArr(kp) {
    let rs = []
    let isArr = Array.isArray(kp)
    eachOwn(kp, (v, k) => {
        // console.log(k, v)
        let r = {
            name: k,
        }
        if (iseobj(v)) {
            r = {
                ...r,
                ...v,
            }
            if (!isArr) {
                r.name = k
            }
        }
        else {
            r = {
                ...r,
                isActive: v,
            }
        }
        rs.push(r)
    })
    return rs
}


export default cvKpToArr
