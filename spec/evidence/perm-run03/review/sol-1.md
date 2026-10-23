### 發現（依嚴重度由高到低）

**#1 [高] server/syncCore.mjs:277 — 固定以 id 保留指派，會讓 email/name 換主時移轉後台授權**

- **情境**：設定 `mappingBy='email'`。同來源使用者 A、B 分別有 `srcKey=a/b`、email `a@x/b@x`，A 有高權限群組。同步保持兩個 srcKey，互換兩人的 email，兩列皆不帶 `cgrups`；B 的有效 token 仍由 `getUserByToken` 回傳 `email='b@x'`，部署方允許一般使用者通過。
- **後果**：兩個 email 在批次內仍唯一，因此同步通過；A 的指派被保留在現在具有 `b@x` 的列上，B 登入便取得 A 的授權。`mappingBy='name'` 同型。這項風險不屬於本輪排除的 `mappingBy='id'` 待裁示事項。
- **依據**：第 277 行呼叫 `keepAssignOnMissing({ ..., mappingBy: 'id', ... })`，略過 `syncKeep.mjs:80–91` 原有的對應鍵變動／舊擁有者衝突檢查；登入仍於 `WWebPerm.mjs:464` 使用 `select({ [mappingBy]: vSelf, isActive: 'y' })`。測試 `SK-036` 只直接測 helper；`EX-030` 改成未被占用的新 email，沒有測登入鍵互換。
- **把握度**：`確定`，上述輸入的配對與授權移轉可由程式路徑證成。
- **建議**：依實際 `mappingBy` 檢查登入鍵的舊擁有者，遇到換主衝突時拒收或清除相關指派並提示，補上同步後登入的整合測試。

**#2 [中] server/syncCore.mjs:230 — srcKey 與 legacy id 的雙重主張只檢查批次出現的鍵**

- **情境**：同來源 grups 已有 `{id:'i1', srcKey:'k', name:'A'}`，以及無 srcKey 的 `{id:'k', name:'B'}`；送入合法批次 `{srcKey:'z', name:'C', ...}`，不含 `k`。
- **後果**：應依契約回 `srcKeyConflict`、零寫入，實作卻會新增 C、刪除 A/B，並清理其引用。
- **依據**：雙重主張的判定 `o !== undefined && legacyById.has(v.srcKey)` 位於 `rows.map(...)` 內，只走訪送入鍵；其後第 325 行把未配對舊列全部列為刪除。`SC-I15-claimTwice` 與 `API-sync-038` 的雙重主張案例都送入衝突鍵；「批次與衝突鍵無關」只測了庫內重複 srcKey。
- **把握度**：`確定`。
- **建議**：建立兩張索引後，先檢查 `oldBySrc` 與 `legacyById` 的鍵交集，再配對批次。

**#3 [中] server/syncCore.mjs:403 — 引用端還原失敗仍回 saveCascadePartial，違反同步的固定錯誤契約**

- **情境**：同步改名已寫入引用端，接著本表寫入失敗；本表 undo 成功，但引用端補償寫回失敗。
- **後果**：端點回 `saveCascadePartial`，而非本輪要求的 `saveWriteFail`；依新契約處理補償失敗的呼叫端會收到另一種錯誤鍵。
- **依據**：`cascadeWrite.mjs:113` 明確 reject `'saveCascadePartial'`；同步核心以 `toOutKey(err)` 轉出，而 `procCore.mjs:622` 會保留已存在於語系表的鍵。`SC-I12-undoFail` 使用 users 本表，沒有引用端補償，守不到這條路徑；README:116 卻宣告還原失敗也回 `saveWriteFail`。
- **把握度**：`確定`。
- **建議**：在同步入口將引用端補償失敗統一轉為 `saveWriteFail`，保留原始原因於 log，並補雙重故障案例。

**#4 [中] server/WWebPerm.mjs:605 — 空批次在路由先回舊錯誤鍵，核心的 invalidRows 無法生效**

- **情境**：以有效 app token 發送 `POST /syncAndReplaceTabs`，本文 `{from:'x', rows:[]}`。
- **後果**：實際回 `invalidRowsInPayload`，與指定的 `invalidRows` 不符；README 第一節也描述成後者。
- **依據**：`parsePayload` 第 605–608 行先拒收空陣列並回 `invalidRowsInPayload`，所以不會到 `syncCore.mjs:109–111`。`api-syncAndReplaceTabs.test.mjs:212` 明確斷言舊鍵，將這個契約落差固定為通過條件。
- **把握度**：`確定`。
- **建議**：將 HTTP 空批次的錯誤鍵統一為 `invalidRows`，同步修正 API 測試。

**#5 [中] test/api-callerIdentity.test.mjs:105 — 「驗證器拋錯」案例在呼叫驗證器之前就被拒收**

- **情境**：CI-G1／CI-G2 使用 `TOKEN_VERIFY_THROW`，但沒有建立其對應的 perm users 列。
- **後果**：案例只能守住「使用者不存在」，守不到 `verifyClientUser` 拋錯時的 fail-closed 行為；即使把驗證器拋錯的處理改成放行，這個案例仍會通過。
- **依據**：案例預期鍵是 `cannotGetUserFromPerm`；`getTokenUser` 在 `WWebPerm.mjs:475–480` 已拒收，無法走到第 500 行的 `verifyClientUser`。`srv.mjs:91–92` 的合成秘密拋錯分支因此也沒有執行。
- **把握度**：`確定`。
- **建議**：先建立有效的 `id-for-verify-throw` 使用者，再用有效管理員標頭與該本體 token，斷言拒收、零寫入及回應／log 不洩漏秘密。

### 已檢視而未發現問題的範圍

- `procCore.updateTabItems`：新增與移除引用皆納入檢查；整列刪除、純 mode 變更不要求宣告；subject 只涵蓋其名稱。
- `withRefLock`／`keyCheck.withTabLocks`／同步鎖呼叫：所附程式皆沿 `targets → pemis → grups → users` 取鎖，未見成環；無宣告分支不讀被引用表。
- `refIdentity`：已檢視新增／移除集合、數字 crules 名稱、原型鍵名、移除快照及宣告完整性判斷。
- `externalRows.checkExternalWrite` 與四表契約：srcKey 守門不受 `lockExternalRows` 關閉影響，四表 fields 均包含 srcKey。
- `WWebPerm`：執行身分成功路徑經完整驗證並回 perm id；四個寫入 RPC 都先經 `requireAdmin`，包含 `for:grups` 分支。
- 缺宣告測試：`unit-procCore-identity` 未套用 `autoDecl`；API 缺宣告案例明確傳入 `noDecl:true`，沒有被自動補宣告掩蓋。
- 同步的一般新增／修改／刪除／不變分類、targets 新增撞 id、防止新配 id 繼承舊指派，以及同名互換／改名鏈的引用規劃，未見額外問題。

### 未檢視或無法判定的範圍

- 遵照限制，未執行測試、變異測試、故障注入或啟動服務；不宣稱測試已通過。
- 副本缺少 ORM 實作與依賴原碼，無法確認實際型別轉換下，缺省或非標準表示的 `order` 是否造成持續 `nUpdate`。
- **不確定**：`syncCore.mjs:374` 沒有檢查 undo 用 `delAll` 的回傳結果；若 ORM 能以 fulfilled `ok:0` 表示未刪除，便會誤記還原成功。副本缺少 driver，無法確認此故障形狀是否可達。
- 副本未提供前端元件全文，只能核對 patch 中四個複製流程確有清空 srcKey；貼上、對話框及編輯器事件的完整接線未驗證。
- `api-mapKey`、授權解碼器及部分其他測試未包含於副本，無法判定全專案是否另有測試補足上述覆蓋缺口。
