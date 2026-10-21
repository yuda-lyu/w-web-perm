import eachOwn from './eachOwn.mjs'
import { countAndRefs, fmtWarn } from './getAuthWarn.mjs'


//群組頁／權限頁按「刪除」前, 計算刪除對引用者授權的影響, 並產生確認框文字(規則帳本 R-PRINCIPLE-00 c、d):
//  c: 以 AND 引用被刪名稱且刪除後該名稱完全消失者 → 其授權將被收回(AND 項變懸空, 內容全 n);
//  d: 引用的名稱有多筆同名(歷史同名)而只刪其一 → 取各候選之交集, 候選變少則交集變寬, 其授權可能變多(任何 mode).
//兩頁共用: 群組頁 holders 為 users(欄位 cgrups)、權限頁 holders 為 grups(欄位 cpemis). 純函數, 不依賴 Vue／DOM.


/**
 * 計算刪除所選列對引用者授權的影響
 *
 * 被刪名稱只取「基準(store 之已儲存列)中存在」之列的名稱: 尚未儲存的新增列(id 不在基準)刪除不影響他人;
 * 以基準名稱為準(引用者所寫的是已儲存的名稱, 未儲存的改名不影響其引用). 「刪除後」以刪除後的剩餘列(含未儲存的新增與改名)判斷,
 * 「刪除前」之同名筆數以基準列計.
 *
 * @param {Array} delIds 輸入被刪列的 id 陣列
 * @param {Array} rowsBase 輸入基準列(store 之 grups 或 pemis)
 * @param {Array} holders 輸入引用者列(store 之 users 或 grups)
 * @param {String} field 輸入引用欄位名('cgrups' 或 'cpemis')
 * @param {Array} rowsRemain 輸入刪除後剩餘之列(目前清單剔除被刪列)
 * @returns {Object} 回傳 { n, nWiden }: n 為授權將被收回之引用者數(AND 引用且名稱完全消失), nWiden 為授權可能變多之引用者數(歷史同名只刪其一)
 * @example
 *
 * let users = [{ cgrups: '{"G1":{"mode":"AND","isActive":"y"}}' }]
 * console.log(getDelRefCount(['g1'], [{ id: 'g1', name: 'G1' }], users, 'cgrups', []))
 * // => { n: 1, nWiden: 0 }
 *
 */
function getDelRefCount(delIds, rowsBase, holders, field, rowsRemain) {
    let setIds = new Set(Array.isArray(delIds) ? delIds : [])
    let delNames = []
    eachOwn(rowsBase, (r) => {
        if (r !== null && typeof r === 'object' && setIds.has(r.id)) {
            delNames.push(r.name === undefined ? '' : r.name)
        }
    })
    if (delNames.length === 0) {
        return { n: 0, nWiden: 0 }
    }
    let res = countAndRefs(holders, field, delNames, rowsRemain, rowsBase)
    return { n: res.n, nWiden: res.nWiden }
}


/**
 * 刪除確認框文字: 兩種影響任一大於 0 才有文字(單一框); 兩者皆大於 0 時併入同一框、同一個問句; 皆為 0 回空字串(不彈框)
 *
 * @param {Object} impact 輸入 getDelRefCount 之結果 { n, nWiden }
 * @param {Function} $t 輸入語系函數(key → 文字)
 * @param {String} kind 輸入被刪者種類: 'Grup'(群組頁) 或 'Pemi'(權限頁), 組成語系鍵 confirmDelAndRefs／confirmDelDupRefs／confirmDelBothRefs 之尾碼
 * @returns {String} 回傳確認框文字, 無影響為空字串
 */
function getDelConfirmText(impact, $t, kind) {
    let n = impact && impact.n > 0 ? impact.n : 0
    let m = impact && impact.nWiden > 0 ? impact.nWiden : 0
    if (n > 0 && m > 0) {
        return fmtWarn($t(`confirmDelBothRefs${kind}`), { n }).split('{m}').join(String(m))
    }
    if (n > 0) {
        return fmtWarn($t(`confirmDelAndRefs${kind}`), { n })
    }
    if (m > 0) {
        return fmtWarn($t(`confirmDelDupRefs${kind}`), { n: m })
    }
    return ''
}


export { getDelRefCount, getDelConfirmText }
export default getDelRefCount
