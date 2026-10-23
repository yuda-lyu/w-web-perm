我會先讀取最關鍵的檔案，開始審查。
第一行已確認。接著讀取伺服端鎖機制與相關模組。
續讀伺服端核心與測試檔。
繼續讀測試檔與 WWebPerm.mjs。
繼續讀取其餘測試與文件。
繼續讀取 unit-procCore-identity 剩餘段落與 e2e 檔。
讀取 E2E 新增案例與 spec 流程文件。
我需要檢查反向對話框如何捕獲並傳遞 `subject`。讀取對話框元件與清單頁開框方法。
讀取 `getPropKey.mjs`（影響 `rule` 種比對鍵）與搜尋 `mergeRules`。
讀取規則帳本與 ADR 以比對文件一致性。
讀取 README 相關段落與檢查文件一致性。
我已完成對核心程式碼與測試的細讀。綜合來看，伺服端與前端的判準、`withRefLock` 鎖層次、身分判準、`parseSubject/parseRefDecl` 格式防禦，與契約大致一致；測試也涵蓋了主體/正向/相容/次序/鎖/靜態站點。以下是誠實的審查回報，未發現會導致錯誤結果、資料遺失或死結的高危實作缺陷。

---

### 發現（依嚴重度由高到低）

#1 [中] `test/api-identity.test.mjs` — 真後端 RPC/鎖契約未實證
- **情境**：該檔檔頭自述「本檔由 agent 撰寫後未對真後端實跑」，47 案全綠僅來自「以行程內真 procCore＋替身資料表」乾跑，未對真實 `w-serv-orm`/`WServOrm` 的 `withTabLocks`/`guardWrite` 及真實併發執行。
- **後果**：`saveSubjectChanged`/`saveRefChanged` 在真後端、尤其是多操作者併發與鎖釋放路徑下，是否與替身表行為一致（IDN-5xx 的死結/序列化/零寫入契約），缺乏實證；若真 ORM 鎖行為與替身不同，契約可能在發布後於真併發場景失守。
- **依據**：`test/api-identity.test.mjs:15-16` 檔頭註解（僅語法檢查與乾跑全綠，不等於真後端實跑；跑法需 `--lock` 與真後端）。
- **把握度**：確定（文件自述即可證成）。
- **建議**：在真後端執行 `api-identity`（`--lock`），並回驗 `saveSubjectChanged`/`saveRefChanged` 的拒收、零寫入與鎖釋放。

#2 [低] `sgud/state/state.md:32` — 狀態文件尚未反映 perm-run02 伺服端強制
- **情境**：`state.md` 仍記 perm-run01 現況：「反向對話框主體身分之驗證在前端、不在伺服端……伺服端不知『主體』。若要伺服端強制,須另設 opt.subject 並對主體表取鎖驗證」。
- **後果**：與已實作的伺服端強制（`server/procCore.mjs` `withRefLock` + `checkSubjectIdentity`，於 `guardWrite` 外層、基準比對之前驗證）不符，接續工作以 `state.md` 為據會判斷錯誤。
- **依據**：`sgud/state/state.md:32` 與 `server/procCore.mjs:294-311`、`refIdentity.mjs:326-329`。
- **把握度**：確定（讀碼即可證成；`state.md` 文字與實作明顯矛盾）。
- **建議**：更新 `state.md`，將反向主體身分驗證標註為已於伺服端強制（opt.subject + 主體表鎖）。

#3 [低／已知限制] 複製／貼上路徑的殘餘風險窗口（文件已列為限制）
- **情境**：未經編輯器回填之路徑（複製列、貼上）無 `picks` 選取記錄，`buildRefDecl` 退回以「送出當下」之被引用表 store 為準（`refIdentity.mjs:223`、`rulebook_concurrent.md` 已知限制 ①、`README` Known limitations (1)）。
- **後果**：僅擋「送出到寫入」之窗口，不擋「複製/貼上當時到送出」之間的被引用實體刪除後同名重建；極端情況下授權可能靜默指向同名新實體（原則 6 殘餘風險）。
- **依據**：`src/js/refIdentity.mjs:215-225`、`sgud/rule/rulebook_concurrent.md:131`、`README.md` Known limitations。
- **把握度**：確定（程式碼與文件皆明文為此行為；屬已知有意設計，非新缺陷）。
- **建議**：保持現狀，僅在回報時標明此為已文件化之已知限制，不需修改。

---

### 已檢視而未發現問題的範圍
- `src/js/refIdentity.mjs` 全部 13 匯出：`getRefTarget`、`activeNames`、`newActiveNames`、`collectNewNames`、`idsOfName`、`snapRefIds`、`recordPicks`、`buildRefDecl`、`parseSubject`、`parseRefDecl`、`countRefMismatch`、`checkRefIdentity`、`checkSubjectIdentity`（判準與格式防禦與契約一致）。
- `src/js/draftSync.mjs:checkSubject` 與 `checkSubjectIdentity` 的 `gone/renamed/taken/noSubject/ok` 格網一致。
- `server/procCore.mjs`：`pickClientOpt` 只採 `baseline/returnRows/subject/refs`；`withRefLock` 取被引用表鎖於 `guardWrite` 外層；`checkSubjectIdentity` 先於基準比對；`checkRefIdentity` 於 `write` 內 `restoreServerFields` 之後、`checkExternalWrite` 之前；失敗路徑皆於 `lockSave`/`withTabLocks`/`guardWrite` 之 `finally` 釋放。
- `server/keyCheck.mjs:withTabLocks` 與 `TAB_LOCK_RANK`（targets→pemis→grups→users）階層巢狀，無成環；引用連帶以 `held` 守門。
- 三清單頁 `LayoutContent{Users,Grups,Pemis}.vue` 的 `snapRefIds`/`recordPicks`/`buildRefDecl`/`countRefMismatch`/`refs` 接線；兩對話框 `Ve{GrupBlngUsers,PemiBlngGrups}` 的 `subject` 捕獲（`show()`）與傳遞（`doSave`→`saveUsers/saveGrups`→`$fapi.updateXxx(..., subject)`）。
- `server/procLang.mjs` 新增 `saveSubjectChanged/saveRefChanged/saveIdentityFormat` eng/cht 固定訊息。
- `test/unit-refIdentity.test.mjs`（280 案）、`test/unit-procCore-identity.test.mjs`（197 案，含 IDN-1xx/2xx/3xx/4xx/5xx/6xx）斷言具鑑別力（變異多被殺）。
- `test/e2e-concurrent-edit.test.mjs` E2E-025～036 結構與斷言（伺服端強制、前端自檢、正常路徑、targets 同 id 重建）與契約對應。

### 未檢視或無法判定的範圍
- `test/e2e-concurrent-edit.test.mjs` 需真實瀏覽器（Playwright）與後端執行，本次僅讀碼未實測；`api-identity.test.mjs` 同上（未於真後端跑）。
- 外部同步 `server/WWebPerm.mjs:syncAndReplaceTabs` 對 `subject/refs` 的相容（其不帶宣告，理應維持名稱引用，但未在本次檢視中以真 RPC 實證）。
- `node_modules/w-serv-orm` 內之 `withTabLocks`/`guardWrite` 真實行為（非審查對象，僅供對照）。
- `getPropKey` 與 `mergeRules`（`mShare.mjs`）的 `rule` 種比對鍵口徑：讀碼顯示皆用 `${name}`（`getPropKey.mjs:29`），一致，但未以真資料逐一實證所有邊界字串。

---

結論：審查未找出會造成錯誤結果、資料遺失或死結的高危實作缺陷；核心實作與契約大致相符，測試亦具守門能力。主要缺口為測試未在真後端實證（#1）與狀態文件未更新（#2），以及已文件化之複製/貼上殘餘窗口（#3）。
