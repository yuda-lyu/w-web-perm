//清單頁「草稿」對 store 推播之處置(R-PRINCIPLE-00 原則 7, 使用者 2026-10-22 裁示; 規則帳本 R-BASELINE-01、R-DRAFT-KEEP-01; ADR-037 Update(run11)): 純函數(不依賴 Vue／DOM), 四個清單頁共用.
//
//背景: 清單頁以 computed(changeParams)監看 store, 資料推播(伺服器約 2 秒輪詢, 他人或外部同步改了表)使 store 變新時, 修改前一律重建 items 與基準, 使管理員尚未儲存之編輯被靜默丟棄,
//再存回「儲存成功」(verify01 情境 5 實證). 原則 7 要求: 有未存之編輯時收到推播, 保留草稿與其載入時之基準、提示「資料已被更新」, 存檔即被伺服端依表雜湊拒收並提示重新載入; 無未存編輯時照舊重建.
//
//changeParams 之重算另有其他觸發(genOpt 內讀取之反應式來源, 如語系切換使表頭文字重算): 那些觸發維持修改前之行為(重建), 只有「store 變新且有未存編輯」才保留草稿.

import { isBaselineStale } from './rowDigest.mjs'


/**
 * 判斷來源 store 資料(任一依賴表之列陣列)是否已更新: 逐一比對參照(Vuex 每次推播以新陣列取代整表, 同參照即未更新)
 *
 * @param {Array|null} prev 輸入上次建立草稿時之各表參照陣列(null 為尚未建立過)
 * @param {Array} now 輸入目前各表參照陣列
 * @returns {Boolean} 回傳是否有任一表參照改變(prev 為 null 或長度不同視為已更新)
 */
function refsChanged(prev, now) {
    if (!Array.isArray(prev) || !Array.isArray(now) || prev.length !== now.length) {
        return true
    }
    return now.some((r, k) => r !== prev[k])
}


/**
 * 決定清單頁對這次 changeParams 重算之處置
 *
 * - 'keep': 來源 store 變新(推播)而有未存編輯 → 保留草稿與其載入時之基準, 不重建(基準是否已過期由呼叫端以 isDraftStale 判定並提示)
 * - 'keepQuiet': 同 'keep'(保留草稿與基準, 不重建), 但此推播是「自己之存檔請求進行中」所致(伺服端已寫入、回應尚未抵達; run12)——不是他人更新, 呼叫端不得據以顯示過期提示:
 *   存檔成功即重建(草稿被捨棄、提示歸零), 存檔失敗由存檔流程依目前 store 重算提示
 * - 'rebuild': 其餘一律重建 items 與基準(同修改前)——首次載入; 使用者切換編輯模式(使用者自己的動作, 草稿隨之放棄); store 變新且無未存編輯; 其他反應式依賴觸發之重算(如語系切換)
 *
 * hasDraft、saving 以函數傳入、惰性求值: hasDraft 僅於 store 變新時才呼叫(非首次、編輯模式未變), saving 僅於確定要保留草稿時才呼叫。
 *
 * @param {Object} p 輸入參數物件
 * @param {Boolean} p.first 輸入是否尚未建立過草稿(首次)
 * @param {Boolean} p.editChanged 輸入編輯模式是否被切換
 * @param {Boolean} p.storeChanged 輸入來源 store 是否變新(見 refsChanged)
 * @param {Function} p.hasDraft 輸入回傳「是否有未存編輯」之函數
 * @param {Function} [p.saving] 輸入回傳「自己之存檔請求是否進行中」之函數(未給視為否)
 * @returns {String} 回傳 'rebuild'｜'keep'｜'keepQuiet'
 */
function planDraftSync({ first, editChanged, storeChanged, hasDraft, saving }) {
    if (first === true || editChanged === true || storeChanged !== true) {
        return 'rebuild'
    }
    if (!(typeof hasDraft === 'function' && hasDraft() === true)) {
        return 'rebuild'
    }
    return (typeof saving === 'function' && saving() === true) ? 'keepQuiet' : 'keep'
}


/**
 * 草稿所依據之基準相對於目前 store 整表是否已過期(供顯示「資料已被更新」提示; 判準同伺服端 checkBaseline, 單一擁有者 rowDigest.compareBaseline)
 *
 * @param {Object} p 輸入參數物件
 * @param {Array} p.keys 輸入該表 schema 欄位名陣列
 * @param {Array} p.rows 輸入目前 store 之該表列
 * @param {Array} p.baseline 輸入草稿載入時之基準
 * @returns {Boolean} 回傳是否過期(有任一列內容不同或列被增刪; 僅 order／伺服器管理欄不同不算)
 */
function isDraftStale({ keys, rows, baseline }) {
    return isBaselineStale({ keys, rows, baseline })
}


export { refsChanged, planDraftSync, isDraftStale }
export default planDraftSync
