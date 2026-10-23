//反向關聯對話框(VeGrupBlngUsers／VePemiBlngGrups)之「列 ↔ 資料快照」身分配對
//規則見 sgud/rule/rulebook.md「關聯對話框容錯、以身分配對、資料驅動屬性鍵」之 R-REL-PAIR-01
//本檔無外部相依


//toId: 身分值正規化——非空字串，或有限數字(ADR-028: 數字主鍵以其字串形式處置)；其餘(空字串、NaN、物件、null、undefined)視為無身分
function toId(v) {
    if (typeof v === 'string' && v !== '') {
        return v
    }
    if (typeof v === 'number' && Number.isFinite(v)) {
        return String(v)
    }
    return null
}


/**
 * 把對話框之列以「列身分」配對到存檔當下取得之資料快照(不用列索引)
 *
 * 反向關聯對話框(群組頁「所屬使用者」、權限頁「所屬群組」)開啟時依 store 當時的列序產生對話框的列; 存檔時重新取 store 快照.
 * 兩者以列索引配對時, store 於開框期間被更新(另一位管理者增刪列或改 order)即錯位, 關聯寫到另一個使用者／群組(規則帳本 R-REL-PAIR-01).
 * 本函數以身分欄位(預設 id)配對: 每列配到快照中身分相同(且 verifyKeys 欄位值全相等)的列; 配不到者列入 missing,
 * 由呼叫端整次拒存並提示重新整理, 不得退而配到其他列.
 *
 * @param {Array} rows 輸入對話框之列, 每列帶身分欄位(opt.idKey); 非陣列時回傳空結果
 * @param {Array} snapshot 輸入存檔當下取得之資料表快照(列物件陣列); 缺身分欄位之快照列不參與配對, 身分重複者取第一筆
 * @param {Object} [opt={}] 輸入設定物件
 * @param {String} [opt.idKey='id'] 輸入身分欄位名稱, 預設'id'
 * @param {Array} [opt.verifyKeys=[]] 輸入除身分外另須與快照相等之欄位名稱陣列(如群組之 'name': 改名視為過期), 預設[]
 * @returns {Object} 回傳 { pairs, missing, krs, matched }; pairs 與 rows 等長, pairs[kr] 為配到之快照列(同一個物件參考)，配不到為 null;
 *   missing 為配不到之列(原物件)陣列; krs 為配得到之列的列索引(依列序), matched[i] 為 krs[i] 那一列配到之快照列(兩者等長、同序, 供「只處理配得到者」之顯示重算用, 免呼叫端自行壓縮索引)
 * @example
 *
 * let snapshot = [{ id: 'u2', name: 'b' }, { id: 'u1', name: 'a' }]
 * let rows = [{ id: 'u1', name: 'a' }, { id: 'u3', name: 'c' }]
 * let { pairs, missing, krs } = pairRowsToSnapshot(rows, snapshot)
 * console.log(pairs[0].name, pairs[1], missing.length, krs)
 * // => 'a' null 1 [0]
 *
 */
function pairRowsToSnapshot(rows, snapshot, opt = {}) {
    let pairs = []
    let missing = []
    let krs = []
    let matched = []
    if (!Array.isArray(rows)) {
        return { pairs, missing, krs, matched }
    }
    let idKey = (opt !== null && typeof opt === 'object' && typeof opt.idKey === 'string' && opt.idKey !== '') ? opt.idKey : 'id'
    let verifyKeys = (opt !== null && typeof opt === 'object' && Array.isArray(opt.verifyKeys)) ? opt.verifyKeys : []

    //kp: 身分 → 快照列(Map: 身分為 __proto__／constructor 等字串時亦精確)
    let kp = new Map()
    if (Array.isArray(snapshot)) {
        for (let it of snapshot) {
            let id = (it !== null && typeof it === 'object') ? toId(it[idKey]) : null
            if (id !== null && !kp.has(id)) {
                kp.set(id, it)
            }
        }
    }

    for (let kr = 0; kr < rows.length; kr++) { //索引迴圈(不用 forEach: 稀疏陣列之空洞須視為無身分列入 missing, pairs 與 rows 等長)
        let r = rows[kr]
        let id = (r !== null && typeof r === 'object') ? toId(r[idKey]) : null
        let it = (id === null) ? undefined : kp.get(id)
        if (it !== undefined && verifyKeys.every((k) => r[k] === it[k])) {
            pairs.push(it)
            krs.push(kr)
            matched.push(it)
        }
        else {
            pairs.push(null)
            missing.push(r)
        }
    }

    return { pairs, missing, krs, matched }
}


export { toId }
export default pairRowsToSnapshot
