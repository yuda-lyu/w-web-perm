# 多人同時編輯流程

### 發現(依嚴重度由高到低)

#1 [中] src/js/cellEditing.mjs:41-69 — `bindCellEditingStop` 的 `bound` WeakSet 僅以 ag-grid `api` 為鍵，不納入 `onStop` 回呼；同一個 api 實例第二次以不同回呼綁定時會被視為已綁定而略過，且 `setTimeout` 重試計時器從不取消。
- **情境**:元件重建但仍重用同一個 grid api 實例（或卸載後計時器繼續執行），新閉包的 `onStop`（例如 `afterEditing`）未被註冊，編輯結束時仍呼叫舊閉包。
- **後果**:推播期間保留的草稿在編輯器關閉後可能不補做重建，畫面與基準不同步（中度：需特定時序才觸發）。
- **依據**:`let bound = new WeakSet()`（第 41 行）；`if (bound.has(api)) { return true }`（第 56 行）；`bindCellEditingStopRetry` 用 `setTimeout`（第 84 行）無清理。
- **把握度**:`推演`
- **建議**:改為 `Map<api, onStop>` 或在綁定時比對回呼；卸載時清除計時器。

#2 [中] server/procCore.mjs:596-606 — `updateUsers` 與其他三表不同，未在 procCore 內套用 `pickClientOpt`，直接把 `opt` 傳入 `updateTabItems`（含 `pickKeysOnly` 等伺服端設定鍵）。
- **情境**:bundled 路徑由 WWebPerm.mjs 先過濾（第 1428-1434 行），故正常 API 不受影響；但直接呼叫 procCore（測試、未來外部呼叫者）若送入任意 opt，`pickKeysOnly`／`baseline` 等鍵會被直接採納。
- **後果**:契約「procOrm 之 opt 只能由伺服端程式自組」在 `updateUsers` 這條路徑的防線只在 WWebPerm，procCore 本身不守（與 `updateTargets/Pemis/Grups` 不一致）。
- **依據**:第 593-606 行 `updateUsers` 直接 `updateTabItems('users', userId, rows, 'id', opt)` 與 `outOf(rowsAfter, opt)`；其他三表第 549-590 行皆有 `let optc = pickClientOpt(opt)`。
- **把握度**:`確定`
- **建議**:在 `updateUsers` 內先 `let optc = pickClientOpt(opt)`，再由呼叫端（WWebPerm）於外層合併 `pickKeysOnly`（或把 pickKeysOnly 改為 procCore 內部依 mode 判斷），避免雙重責任。

#3 [低] src/js/draftSync.mjs:101-112 — `planDialogSync` 的 `storeChanged` 由呼叫端固定傳 `true`（VeGrupBlngUsers.vue 第 1056-1063 行），未比較 store 參照；若 watcher 因非 store 變化而觸發，可能把「未變」誤判為「已變」並嘗試重建。
- **情境**:對話框開啟期間，非 store 依賴（如語系）觸發 watcher 路徑時，`planDialogSync` 仍以 `storeChanged: true` 計算。
- **後果**:多一次無效的 `isDraftStale` 計算與可能的 `subjectNotice` 提示；不致資料遺失（`stale` 為 false 時回 `'none'`）。
- **依據**:第 1056-1063 行固定 `storeChanged: true`；`planDialogSync` 第 101-112 行 `if (show !== true || storeChanged !== true) return 'none'`。
- **把握度**:`推演`
- **建議**:呼叫端傳入 `refsChanged(vo.syncMark.refs, vo.curRefs())` 結果，與清單頁一致。

#4 [低] src/js/rowDigest.mjs:42-49 — `makeBaseline` 在 `buildBaseline` 拋錯時回傳 `[]`，但 `[]` 是合法空表基準；前端若因主鍵缺漏/重複而得到 `[]`，會被當成「空表基準」而非錯誤，存檔時一律被伺服端以 `saveStale` 拒收（fail-closed，不遺失資料）但錯誤被靜默。
- **情境**:store 列出現主鍵缺漏或重複（資料異常）時。
- **後果**:使用者只能看到 `saveStale`，無法區分「他人改過」與「本頁資料異常」。
- **依據**:第 42-49 行 `catch (err) { return [] }`；`isBaselineValid([])` 為 true（核心 baseline.mjs 第 407-424 行）。
- **把握度**:`確定`
- **建議**:前端 `makeBaseline` 失敗時回傳 `null` 或由呼叫端標記為不可存，與伺服端 `rowsInvalid` 語意對齊。

### 已檢視而未發現問題的範圍
- server/procCore.mjs：guardWrite 取鎖→新鮮讀取→比對→寫入順序；`baseline === null ? undefined : baseline`；mapGuardErr 拒收鍵轉換；readAfter 讀回失敗回 null。
- server/keyCheck.mjs：`withTabLocks` 階層排序與 held 檢查；TAB_LOCK_RANK 順序。
- server/WWebPerm.mjs：syncAndReplaceTabs 與 procCore 共用 `lockTabs`；引用連帶內層取 holder 鎖。
- src/schema/contracts/*.mjs：四表 fields/serverOnly/orderKey 設定與 schema 欄位一致。
- src/js/applySaved.mjs：getSavedTables 驗證 rows；others 白名單。
- src/js/draftSync.mjs：planDraftSync 決策表；checkSubject 四種結果；hasDraftNow。
- src/js/externalRows.mjs：dropServerOnlyDiff/restoreServerFields 的 all:true 路徑。

### 未檢視或無法判定的範圍
- e2e 測試（test/e2e-concurrent-edit.test.mjs）未執行，無法判定其等待條件是否在事件發生前即成立。
- 四個 LayoutContent*.vue 的完整 computed/watch 鏈與 markDataReload 計時窗口未逐一追蹤。
- node_modules/w-serv-orm 的 pmKeyMutex 可重入性與 guardWrite 失敗釋放鎖僅讀說明，未實測。
- 對話框 VeGrupBlngUsers/VePemiBlngGrups 的 show()/subject 生命週期未完整追蹤（僅 spot-check）。
