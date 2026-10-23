### 發現(依嚴重度由高到低)

#1 [中] server/syncCore.mjs:370-393 — 寫入中途失敗之本表補償：`woItems[keyTable].save(back, { merge: false })` 的結果只有在 `Array.isArray(rs)` 才檢查 `ok:0`；若 ORM 回傳非陣列（單一物件／undefined），即使部分還原失敗也會被視為成功，之後拋出原錯誤但資料可能仍處部分寫入狀態。
- **情境**：del／insert／save 任一步拋錯後進入 catch，呼叫 undo，ORM 的 save 回傳非陣列型別。
- **後果**：應該回 `saveWriteFail` 的雙重故障被誤判為已還原，稽核工具不會被觸發，留下不一致資料。
- **依據**：`let rs = await woItems[keyTable].save(back, { merge: false }); if (Array.isArray(rs) && rs.some(...)) { okUndo = false }`。
- **把握度**：推演（取決於 w-serv-orm 之 save 回傳型別；單元測試替身若回陣列則不會暴露）。
- **建議**：改為 `if (rs && (Array.isArray(rs) ? rs.some(v=>v&&v.ok===0) : rs.ok===0))` 或一律以 try/catch + 事後 select 驗證。

#2 [中] server/syncCore.mjs:216-237 — 一次性遷移配對使用 `legacyById` Map（以 id 為鍵），若同一 from 內有兩筆舊列 id 相同（資料異常），後者覆寫前者，`claimTwice` 偵測不到，配對可能指向錯誤列且整批仍通過。
- **情境**：庫內同 from 有重複 id 之 legacy 列（主鍵應唯一，屬資料異常）。
- **後果**：遷移配對錯列，srcKey 被寫到非預期實體；契約要求「庫內同 from 重複 srcKey → srcKeyConflict」，但對重複 id 之 legacy 列無對應保護。
- **依據**：`legacyById.set(r.id, r)` 覆寫；`matched` 只檢查 `oldBySrc.has && legacyById.has` 同時成立。
- **把握度**：推演。
- **建議**：建 `legacyById` 前先偵測同 id 重複，若有則回 `srcKeyConflict`（或 `invalidRows`）。

#3 [中] server/syncCore.mjs:246-269 — targets 新增時以 `usedIds`（含所有既有列 id，含將被刪除之同 from 列）判定 `idTaken`；若新 srcKey 剛好等於一個「本批正在刪除」之舊標的 id，仍被拒收，無法完成「刪舊增新且新名沿用舊 id」之合法操作。
- **情境**：外部來源改名後新標的名稱等於某個被刪標的之舊 id（即 srcKey 重用）。
- **後果**：合法的差異同步被誤拒 `invalidRows`，需人工清源；契約「該 id 已被庫內其他列占用 → 整批 invalidRows」未界定是否包含本批將刪除者，實作採最嚴。
- **依據**：`let usedIds = new Set(objs.map((r) => r.id))` 包含 dels；`if (usedIds.has(rows[k].id))`。
- **把握度**：不確定（契約用語「其他列」可解讀為不含本批刪除者；需使用者裁示）。
- **建議**：若契約允許重用，`usedIds` 應排除 `dels` 之 id；否則於 README/帳本明列。

#4 [中] server/procCore.mjs:416-422 — 引用身分檢查 `checkRefIdentity` 在 `refInfo !== null` 時才呼叫，但 `refInfo` 於函式開頭計算；若請求帶了 refs/subject 但 `keyTable` 無授權引用欄（targets），parse 階段已拒（`saveIdentityFormat`），故不影響。真正的風險：`refRows` 在 `withRefLock` 內讀取，但 `checkRefIdentity` 的 `countRefMismatch` 對宣告中「多報」的名稱（不在 changed 集合）仍會驗 id，若那些名稱在被引用表已變動，整次拒收 `saveRefChanged`，即使本次寫入未涉及該名稱。
- **情境**：客戶端宣告包含一個與本次寫入無關、但已被同名重建的名稱。
- **後果**：合法存檔被拒（收嚴）；非資料遺失，但可能造成操作者困惑。
- **依據**：`let n = countRefMismatch({ keyTable, decl: declList, refRows })` 檢查宣告中所有名稱，含未變更者。
- **把握度**：推演（契約「宣告須完整」未明確是否允許多報；多報在 buildRefDecl 路徑不會發生，但直打 API 可）。
- **建議**：明定宣告僅須涵蓋 changed 集合，多報名稱可忽略或直接拒收，文件化即可。

#5 [低] server/WWebPerm.mjs:637-651 — `requireAdmin` 依賴 `getGenUserByKV('id', userId)` 已過濾 `isActive='y'`，自身只檢查 `isAdmin !== 'y'`；若 ORM 的 `select({isActive:'y'})` 對缺欄／null 值處理不一致（歷史列 `isActive` 為 null），可能把非啟用者放行。實測 `getGenUserByKV` 用精確比對，null 不等於 'y'，故安全。
- **情境**：無。
- **後果**：無（已由 ORM 過濾）。
- **依據**：`userRs = await woItems.users.select({ [keyUser]: valueUser, isActive: 'y' })`。
- **把握度**：確定（無缺陷，列為已檢視）。
- **建議**：無。

### 已檢視而未發現問題的範圍

- `server/syncCore.mjs` 配對／分類／寫入主流程（srcKey 配對、legacy 遷移、keepAssign、引用連帶、回傳計數）：邏輯與契約一致，冪等路徑正確。
- `server/syncCore.mjs` 取鎖階層（本表 → holder）與 `procCore` 之 `withRefLock`（被引用表 → 本表）：無成環，held 檢查正確。
- `server/procCore.mjs` 宣告必帶：`collectChangedNames` 含新增與移除；無宣告且 changed>0 → `saveIdentityRequired`；不改變引用者不需宣告。
- `server/procCore.mjs` `requireAdmin` 包裝於 `WWebPerm` 四個 updateXxx，順序在 lockSave 之前。
- `server/WWebPerm.mjs` `getUserIdByToken`：完整驗證、fail-closed、回 perm id、from='main'、srLog 不含 token。
- `src/js/externalRows.mjs` `checkExternalWrite`：srcKey 身分欄守門（新增帶值拒、既有列改值拒），不論 lockExternalRows。
- `src/schema/contracts/*.mjs`：srcKey 已列入 fields。
- `server/provideTabs.mjs`：只送 srcKey，不送 id。
- 測試 `test/api-callerIdentity.test.mjs`：覆蓋執行身分六種無效情形 × 寫入/唯讀、requireAdmin 四函數、perm 權威、srLog。

### 未檢視或無法判定的範圍

- `test/unit-syncCore.test.mjs`、`test/unit-refIdentity.test.mjs`、`test/unit-procCore-identity.test.mjs`、`test/unit-externalRows.test.mjs`、`test/api-syncAndReplaceTabs.test.mjs`、`test/api-identity.test.mjs`、`test/api-externalRows.test.mjs`：未逐條審查斷言品質，無法判定「拿掉實作是否變紅」；declHelper 的 autoDecl 只在宣告非空時附上，測試若需驗 `saveIdentityRequired` 必須明示 `noDecl`，此點請測試作者自行確認。
- 前端 `src/js/refIdentity.mjs` 之 `recordPicks`／`buildRefDecl` 與伺服端判準的一致性：僅讀碼，未跑前端測試。
- `src/js/externalRows.mjs` 前端複製/貼上/對話框對 srcKey 欄位之處理：未讀完整前端元件。
- `server/syncKeep.mjs` 之 `keepAssignOnMissing`/`keepAssignByEntity` 在 syncCore 新身分（srcKey 配對、mappingBy 固定 'id'）下的互動：讀碼未發現問題，但未跑替身測試。
- `g_provide*.mjs`、schema tables 其餘欄位：未檢視。
- `spec-dspec/*` 與 `sgud/*`：已對照契約摘要，未逐字比對實作細節。
