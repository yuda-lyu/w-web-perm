# 多人同時編輯流程

### 發現(依嚴重度由高到低)

#1 [高] [server/procCore.mjs:83](C:/opensrc/開源-JS-411-8-w-web-perm/w-web-perm/tmp/perm-run01/review/repo/server/procCore.mjs:83) — 主體身分只在前端驗證，仍可能把授權寫給同名新實體（已知限制）

- **情境**：①A 開啟尚無使用者引用的群組 `G(id=g1)`，勾選使用者但未存。②B 刪除 g1，再建立同名群組 `G(id=g2)`；因原群組無引用，users 表不變。③主體推播尚未抵達 A，或 A 的請求已送出；A 存檔。
- **後果**：users 基準仍相符，伺服端接受寫入；新增的 `cgrups.G` 實際指向 g2，違反契約 7，造成錯誤授權。權限↔群組對話框亦同。
- **依據**：`VeGrupBlngUsers.vue:1199` 驗的是 `checkSubject({ subject, rows: vo.grups })`；`procCore.mjs:83–92` 僅採納 `baseline`／`returnRows`，`:262` 只鎖本次寫入表。README`:123` 已明列此前端限制。E2E`:369、396、419` 都先等主體推播抵達才存，未涵蓋此窗口；拿掉 `delay(300)` 後的第二次驗證，也不影響這些案例。
- **把握度**：`推演`（依賴上述請求與推播順序）。
- **建議**：傳入開框主體身分，伺服端依 `grups → users`／`pemis → grups` 巢狀取鎖，在鎖內驗證主體後才寫入。

#2 [中] [src/js/externalRows.mjs:225](C:/opensrc/開源-JS-411-8-w-web-perm/w-web-perm/tmp/perm-run01/review/repo/src/js/externalRows.mjs:225) — 外部列守門未採空值等價，合法存檔仍會被誤拒

- **情境**：①A 載入外部列 `from:'appX', description:''`。②外部同步只把該說明改成 `null`，其餘內容與名次相同。③A 修改另一筆後台列，帶原基準存整表。
- **後果**：核心基準比對通過，卻被後續守門回覆 `saveExternalRowChanged`，整次合法修改無法存檔，違反契約 2①。
- **依據**：核心 `canonField` 將 `undefined/null/''` 都轉為 `'null'`；但本檔`:24` 為 `JSON.stringify(v === undefined ? '' : v)`，`:110` 與`:225` 因此仍把 `null`、`''` 判為不同。`unit-procCore-baseline` UB-2③及 `api-baseline` AB-4 使用後台列，沒有走到外部列鎖定欄守門。
- **把握度**：`確定`。
- **建議**：讓外部列內容比較採用相同空值正規化，並補外部列空值表示改變的整表存檔案例，保留 `0`／`false` 非空值的對照。

#3 [中] [src/js/externalRows.mjs:148](C:/opensrc/開源-JS-411-8-w-web-perm/w-web-perm/tmp/perm-run01/review/repo/src/js/externalRows.mjs:148) — 庫內缺少建立稽核欄時，仍會採用客戶端偽造值

- **情境**：既有歷史列缺少 `userId` 或 `timeCreate`；客戶端修改其說明，同時送入偽造的建立者與建立時間，並帶合法基準。
- **後果**：偽造值被寫入，違反契約 2④「serverOnly 不採用客戶端值」。
- **依據**：`:147` 先做 `let out = { ...row }`，`:149–150` 只有 `hasOwn(o, k)` 時才覆蓋；庫內缺欄便留下客戶端值。`procCore.mjs:359` 雖傳 `all:true`，仍有此缺口；核心 `getMapOrm.mjs:1060、1097` 顯示 save 只重填更新者／更新時間，不重填建立欄。UB-4 的種子`:94–95` 固定具備全部稽核欄，測不到缺欄情形。
- **把握度**：`確定`。
- **建議**：先剝除客戶端全部 `serverOnly`，再回填庫內實際存在的欄位，並補缺欄歷史列測試。

#4 [中] [src/store/mutations.mjs:73](C:/opensrc/開源-JS-411-8-w-web-perm/w-web-perm/tmp/perm-run01/review/repo/src/store/mutations.mjs:73) — 晚到的舊推播可覆蓋存檔結果，使基準倒退（ADR 已記錄的限制）

- **情境**：①存檔前的整表讀取已取得舊快照 O，但延後送達。②存檔成功回傳 S，`applySavedRows` 已套用 S。③使用者尚無新草稿時 O 才抵達；畫面與基準重建成 O。④使用者立即再編輯、再存。
- **後果**：剛存好的畫面退回舊內容，下一次存檔被自己的前次寫入誤擋。
- **依據**：`src/main.js:78` 將推播直接 commit；mutation`:74` 無版本判斷，直接執行 `state[msg.tableName] = msg.data`。ADR-037`:1498` 已記錄此限制。E2E`:144–147` 放行推播後只檢查橫幅與儲存鈕，沒有確認畫面／store 仍為最後存檔內容；`:151–152` 檢查的是資料庫，無法發現畫面倒退。
- **把握度**：`推演`（舊快照實際晚到的順序未實測）。
- **建議**：淘汰存檔前啟動的舊讀取回應，或以快照版本拒絕倒退套用，並補延遲舊回應後立即再存的測試。

#5 [中] [test/api-baseline.test.mjs:179](C:/opensrc/開源-JS-411-8-w-web-perm/w-web-perm/tmp/perm-run01/review/repo/test/api-baseline.test.mjs:179) — AB-6 可在後台寫入全部失敗時通過，未守住宣稱的並行寫入結果

- **情境**：六輪後台存檔全部回 `saveWriteFail`，同步全部回 `error`；只留下測試開始前建立的列。
- **後果**：案例仍可能通過，掩蓋寫入失效及同鎖接線回歸。
- **依據**：`:179` 接受 `saveWriteFail` 等廣泛錯誤，`:180` 接受同步 `success` 或 `error`；`:183–185` 最後只驗主鍵唯一及原有列仍在，未驗 `ab6-*` 或同步說明。即使移除 `writeMain` 的主表 save，此案例也沒有斷言能發現後台修改未生效。
- **把握度**：`確定`。
- **建議**：固定交錯情境，依成功／合法拒收分別驗證實際欄位終態，並拒絕未注入故障時的 `saveWriteFail`。

### 已檢視而未發現問題的範圍

- `procCore.updateTabItems`：基準比對與寫入均在同一個 `guardWrite` 表鎖內，`lockSave` 位於外層。
- `keyCheck.withTabLocks`、`WWebPerm` 鎖接線：同一 ORM 鎖管理器、逐表依階層巢狀取鎖；未找到正常寫入入口形成死結環。
- `writeMain` 的 del/save 與引用端 save：皆帶伺服端自組的 `mustExist:true`。
- `mapGuardErr`／`toOutKey`：三種指定拒收鍵映射正確，基準差異列 id 未被寫入這些拒收 log。
- 四份契約與 `rowDigest`：欄位盤點完整，共用同一核心；名次、純基準空值等價、`0`／`false` 區別及舊格式拒收未發現其他問題。
- `draftSync` 決策、四頁草稿保留接線、兩對話框正常未編輯重建路徑，未發現其他可由讀碼證成的問題。
- UB-1／UB-6／UB-7b、AB-1／AB-2 的拒收、零寫入、並行勝負及回傳內容斷言有實際區辨力；文件的 24 案 × 2 語系計數相符。

### 未檢視或無法判定的範圍

- 依限制未執行測試、啟動服務、連網或修改檔案；以上沒有實測通過率。
- 副本未提供 ag-grid／`w-aggrid-vue`／`WDialog` 實作，無法確認 `cellEditingStopped` 與 `rowsChange` 的實際先後、Tab 切格、虛擬捲動及存檔中鍵盤再次編輯的行為；不能據此宣稱這些情境安全。
- `readAfter` 讀回失敗已讀碼確認會回成功字串並退回等推播，但未找到主表／引用端讀回失敗的故障注入測試。
- 權限合併演算法未重新全面審查；patch 未改動該實作。本輪核對的是相關寫入與引用連帶入口。
