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
 * @param {String} p.keyTable 輸入表名(targets／pemis／grups／users; 依其寫入契約計算)
 * @param {Array} p.rows 輸入目前 store 之該表列
 * @param {Array} p.baseline 輸入草稿載入時之基準
 * @returns {Boolean} 回傳是否過期(有任一列內容摘要不同、列被增刪或名次不同; 僅 order 數值改變而名次不變、或僅伺服器專有欄不同不算)
 */
function isDraftStale({ keyTable, rows, baseline }) {
    return isBaselineStale({ keyTable, rows, baseline })
}


/**
 * 是否有未存之草稿: 已提交之未存修改(isModified), 或**儲存格編輯器開啟中**(已輸入、未按 Enter 或未失焦——編輯器內的輸入尚未進 rows, 但重建清單會直接丟棄它; 第 115 項, R-DRAFT-KEEP-01 規則 10)
 *
 * 四清單頁(changeParams 的 hasDraft)與兩對話框(planDialogSync)共用, 口徑單一.
 *
 * @param {Object} p 輸入參數物件
 * @param {Boolean} p.dirty 輸入是否有已提交之未存修改(isModified 鏡像)
 * @param {Boolean} p.editing 輸入儲存格編輯器是否開啟中(ag-grid getEditingCells 非空)
 * @returns {Boolean} 回傳是否視為有草稿
 */
function hasDraftNow({ dirty, editing }) {
    return dirty === true || editing === true
}


/**
 * 反向關聯對話框(開著時)收到 store 推播之處置(第 114／115 項、修 (b); R-PRINCIPLE-00 原則 10「無未存修改時照舊重建」; 規則帳本 R-DRAFT-KEEP-01 規則 10～12)
 *
 * - 'none': 不須處置——未顯示、store 未變、表內容未異於載入基準(推播內容與載入時相同)、或此推播是自己存檔所致(saving)而無草稿
 * - 'rebuild': 無未存修改(含無開啟中之儲存格編輯器)且表已異於載入基準 → 以新資料重建對話框內容並更新基準(對話框開而未編輯時不應停在過期的資料上)
 * - 'keep': 有未存修改或開啟中之編輯器 → 保留草稿、凍結基準; 呼叫端依 stale 顯示「資料已被更新」提示
 * - 'keepQuiet': 自己之存檔進行中(伺服端已寫入、回應未到)所致之推播, 不是他人更新 → 保留、不提示
 *
 * @param {Object} p 輸入參數物件
 * @param {Boolean} p.show 輸入對話框是否顯示中
 * @param {Boolean} p.storeChanged 輸入來源 store 是否變新(參照改變)
 * @param {Boolean} p.stale 輸入表是否已異於對話框載入時之基準(isDraftStale)
 * @param {Boolean} p.dirty 輸入是否有已提交之未存修改
 * @param {Boolean} p.editing 輸入儲存格編輯器是否開啟中
 * @param {Boolean} p.saving 輸入自己之存檔是否進行中
 * @returns {String} 回傳 'none'｜'rebuild'｜'keep'｜'keepQuiet'
 */
function planDialogSync({ show, storeChanged, stale, dirty, editing, saving }) {
    if (show !== true || storeChanged !== true) {
        return 'none'
    }
    if (saving === true) {
        return 'keepQuiet'
    }
    if (stale !== true) {
        return 'none'
    }
    return hasDraftNow({ dirty, editing }) ? 'keep' : 'rebuild'
}


/**
 * 驗證關聯對話框之主體(被編輯其歸屬之群組／權限)於存檔當下仍是開框時那一個實體(第 114 項; R-PRINCIPLE-00 原則 3、6; 規則帳本 R-SUBJECT-ID-01)
 *
 * 反向對話框以**名稱**引用主體(使用者 cgrups／群組 cpemis 的鍵是名稱), 不驗主體身分: 開框後主體被刪除並以同名重建(id 不同), 引用會靜默指向新實體(原則 6: 不得讓引用被同名新資料接管);
 * 故以主體 id 與開框時之摘要(id、名稱、開框時是否已儲存)比對存檔當下的主體表: id 仍在、名稱未變才算同一實體. 不符一律拒收(收嚴, 原則 3), 提示重新載入.
 * 開框時主體尚未儲存(store 查無該 id; 清單頁新增列未存即開對話框)者沿用既有行為(引用先指向尚不存在之名稱), 但其後 store 出現「同名而 id 不同」之另一實體時亦拒收(引用會被該實體接管).
 *
 * @param {Object} p 輸入參數物件
 * @param {Object} p.subject 輸入開框時之主體摘要 { id, name, saved }(saved: 開框時 store 已有該 id)
 * @param {Array} p.rows 輸入存檔當下之主體表列(store 的 grups 或 pemis)
 * @returns {String} 回傳 'ok'｜'gone'(開框時已儲存之 id 現已不在: 已刪除或以同名重建)｜'renamed'(id 仍在但名稱不同)｜'taken'(開框時未儲存之主體, 現有同名而 id 不同之另一實體)｜'noSubject'(未提供有效之開框摘要, 收嚴拒收)
 */
function checkSubject({ subject, rows }) {
    let id = (subject !== null && typeof subject === 'object') ? subject.id : undefined
    let name = (subject !== null && typeof subject === 'object') ? subject.name : undefined
    if (typeof id !== 'string' || id === '' || typeof name !== 'string' || name === '') {
        return 'noSubject'
    }
    let list = (Array.isArray(rows) ? rows : []).filter((r) => r !== null && typeof r === 'object')
    let hit = list.find((r) => r.id === id)
    if (hit !== undefined) {
        return hit.name === name ? 'ok' : 'renamed'
    }
    if (subject.saved === true) {
        return 'gone'
    }
    return list.some((r) => r.name === name) ? 'taken' : 'ok'
}


export { refsChanged, planDraftSync, isDraftStale, hasDraftNow, planDialogSync, checkSubject }
export default planDraftSync
