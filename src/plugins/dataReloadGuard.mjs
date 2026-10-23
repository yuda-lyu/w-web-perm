//程式端資料載入/重載旗標(systemProcing)之守門核心(純邏輯, 不依賴 Vue／DOM, 可單元測試; mUI.markDataReload 即此; 規則帳本 R-RELOAD-GUARD-01)
//
//背景: 清單頁以旗標 systemProcing 標記「程式端剛重建 opt」, 使其後由 WTable／ag-grid 非同步觸發之 rowsChange 不被視為使用者編輯(isModified 不被誤設為真).
//旗標於「Vue 更新完成之 nextTick 後再過 1ms」解除(ag-grid 之 rowDataUpdated 事件於同一輪更新中以 setTimeout(0) 排程, 先於該 1ms 計時器觸發).
//
//缺陷(run12, AF-037 不穩定失敗之根因): 重載可重疊——一次儲存引起兩張表(如權限改名連帶更新群組之引用端)先後推播, 兩次重建相隔約 20ms, 而一次重建之渲染可超過此數.
//舊實作每次呼叫各自排一個「解除旗標」計時器, 第 1 次重建之計時器在第 2 次重建之 rowsChange 事件之前觸發而把旗標解除, 第 2 次之 rowsChange 因此被當成使用者編輯,
//isModified 變真、儲存鈕在儲存成功後殘留(並使其後之推播被當成「有未存編輯」而顯示過期橫幅).
//
//規則: 旗標只由「最後一次」呼叫所排之計時器解除; 較早呼叫之計時器於觸發時若已有較新之呼叫則不動旗標.

let seqs = new WeakMap() //vm → 最近一次呼叫之序號


/**
 * 標記接下來由程式端資料載入/重載(初始載入、store 推播、isEditable／語系切換等 genOpt 重建 opt)所觸發之 rowsChange 非使用者變更
 *
 * @param {Object} vm 輸入元件實例(須有 systemProcing 屬性與 $nextTick 函數)
 * @param {Function} [setTimeoutFn=setTimeout] 輸入計時器函數(供單元測試注入, 預設全域 setTimeout)
 */
function markDataReload(vm, setTimeoutFn = setTimeout) {
    let seq = (seqs.get(vm) || 0) + 1
    seqs.set(vm, seq)
    vm.systemProcing = true
    vm.$nextTick(() => {
        setTimeoutFn(() => {
            //已有較新之重載(其渲染與事件尚未完成)則不解除: 旗標交由最後一次呼叫所排之計時器
            if (seqs.get(vm) === seq) {
                vm.systemProcing = false
            }
        }, 1)
    })
}


export { markDataReload }
export default markDataReload
