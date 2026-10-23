//儲存格編輯器開啟中視為有草稿(第 115 項; R-PRINCIPLE-00 原則 10「有未存修改時收到推播不重建」; 規則帳本 R-DRAFT-KEEP-01 規則 10): 以 ag-grid 的 API 判定, 四清單頁與兩對話框共用.
//
//背景: 使用者在儲存格輸入了文字、尚未按 Enter(或尚未失焦)時, 輸入只在編輯器內, 還沒進 rows(rowsChange 尚未觸發, isModified 仍為假); 此時推播使清單重建(setRowData)會直接丟掉編輯器與輸入, 且不會有任何提示.
//故編輯器開啟中視同有草稿: 不重建、凍結基準、提示「資料已被更新」; 編輯器關閉後(Enter 提交→isModified 為真續保留; Esc 或無變更→無草稿)若 store 於期間已變新, 補上一次重建.
//
//cmp 為 WAggridVue 元件實例(含 getApi(): ag-grid GridApi; w-aggrid-vue 2.1.9). 純函數: 不依賴 Vue; 取不到 api(尚未掛載、已銷毀)一律視為「未在編輯」.


let apiOf = (cmp) => {
    try {
        let api = (cmp !== null && cmp !== undefined && typeof cmp.getApi === 'function') ? cmp.getApi() : null
        return (api !== null && api !== undefined && typeof api.getEditingCells === 'function') ? api : null
    }
    catch (err) {
        return null
    }
}


/**
 * 儲存格編輯器是否開啟中(ag-grid getEditingCells 非空)
 *
 * @param {Object} cmp 輸入 WAggridVue 元件實例(可為 null／undefined)
 * @returns {Boolean} 回傳是否有儲存格正在編輯
 */
function isCellEditing(cmp) {
    let api = apiOf(cmp)
    if (api === null) {
        return false
    }
    try {
        let cs = api.getEditingCells()
        return Array.isArray(cs) && cs.length > 0
    }
    catch (err) {
        return false
    }
}


let bound = new WeakSet()


/**
 * 對 ag-grid api 註冊一次「儲存格編輯結束」監聽(同一個 api 只註冊一次; 元件重建即換新 api, 需再呼叫)
 *
 * @param {Object} cmp 輸入 WAggridVue 元件實例
 * @param {Function} onStop 輸入編輯結束(提交、Esc、失焦)後之回呼
 * @returns {Boolean} 回傳是否已綁定(false 為 api 尚未可用, 呼叫端稍後重試)
 */
function bindCellEditingStop(cmp, onStop) {
    let api = apiOf(cmp)
    if (api === null || typeof api.addEventListener !== 'function') {
        return false
    }
    if (bound.has(api)) {
        return true
    }
    bound.add(api)
    api.addEventListener('cellEditingStopped', () => {
        try {
            onStop()
        }
        catch (err) {
            console.log('cellEditingStopped', err)
        }
    })
    return true
}


/**
 * 綁定編輯結束監聽, api 尚未可用時以短輪詢重試(元件於 v-if 內, 重建草稿後下一輪渲染才掛載)
 *
 * @param {Function} getCmp 輸入回傳 WAggridVue 元件實例之函數(每次重試重新取, 元件可能被重建)
 * @param {Function} onStop 輸入編輯結束後之回呼
 * @param {Number} [tries=30] 輸入最多重試次數(每次相隔 100 ms)
 * @returns {void} 無回傳
 */
function bindCellEditingStopRetry(getCmp, onStop, tries = 30) {
    if (bindCellEditingStop(getCmp(), onStop) || tries <= 0) {
        return
    }
    setTimeout(() => {
        bindCellEditingStopRetry(getCmp, onStop, tries - 1)
    }, 100)
}


export { isCellEditing, bindCellEditingStop, bindCellEditingStopRetry }
export default isCellEditing
