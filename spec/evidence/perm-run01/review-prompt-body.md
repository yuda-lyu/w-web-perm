# 功能正確性審查:w-web-perm「多人同時編輯寫入契約」改動

你是獨立審查者。目標:找出這批改動中**會造成錯誤結果、資料遺失、死結、或與下列契約不符**的地方,並檢查**測試是否真的守得住這些契約**。請誠實回報:找不到就說找不到,不確定就標「不確定」,不要為了湊數而提不重要的意見。

## 0. 工作目錄與檔案

工作目錄是一份**副本**(不是正式 repo),結構如下;所有路徑皆相對於工作目錄:

- `DIFF-prod.patch`:`server/`、`src/`、`package.json` 中**已追蹤檔**相對於改動前版本(HEAD)的差異。
- 以下為**全新檔案**(不在 patch 內,請直接讀檔):`src/schema/contracts/*.mjs`、`src/js/applySaved.mjs`、`src/js/cellEditing.mjs`、`test/api-baseline.test.mjs`、`test/e2e-concurrent-edit.test.mjs`、`test/unit-applySaved.test.mjs`、`test/unit-cellEditing.test.mjs`、`test/unit-procCore-baseline.test.mjs`、`spec/流程_多人同時編輯.md`、`sgud/rule/rulebook_concurrent.md`。
- `node_modules/w-serv-orm/src/`:共用核心(被本專案採用的函式庫)原始碼,其中 `baseline.mjs` 為前後端共用的純函式;`WServOrm.mjs` 內有 `withTabLocks`、`guardWrite`、`procOrm`。**這個核心不是本次審查對象**,只供對照契約。
- 專案說明:`README.md`(含「升級注意」「已知限制」)、`spec/設計要點與取捨.md`(ADR-037 為本次主題)、`sgud/state/state.md`。

## 1. 要審的契約(摘要;以此為準)

1. **先動先贏**:前端載入某表時取得該表「基準」(每列內容指紋 + 列名次)。存檔時,伺服端在**該表的鎖內**重新讀庫、與基準比對;只要**他人**在載入後改了任一列、新增任一列、刪除任一列、或重排了列順序,整次存檔被拒(`saveStale`),且**零寫入**。比對與寫入必須在同一個鎖內(不可先比後鎖)。
2. **不該被拒的情形**:①空值等價(`undefined`/`null`/`''` 視為相同);②系統自己重新編號 `order` 的數值不算他人變更(但他人改變列的**相對順序**要被偵測,這是「名次」);③外部同步列(`from` 非空)的 `order` 由外部擁有;④伺服端專有欄位(`serverOnly`)不進基準、不採用客戶端值。
3. **鎖階層**:`targets → pemis → grups → users`,每層一張表、巢狀取鎖,不可死結。操作者雙擊防護(`lockSave`)在表鎖之外。引用連帶(刪除/改名時改寫引用端表)須在持有自己表鎖的前提下,再依階層取引用端表鎖。刻意**不使用**核心的多表一次宣告(其排序依字碼,與階層不同,混用會成環)。
4. **只改不增**:後台整表存檔寫入走 `mustExist`(列已不存在 → `rowNotFound` → 對外視為 `saveStale`),不得「復活」已被他人刪除的列。
5. **存檔成功後立即更新基準**:存檔 API(`opt.returnRows === true`)回傳在鎖內新鮮讀回的寫入後整表;四個清單頁與兩個對話框立刻用它更新畫面與基準;隨後抵達的「同內容推播」不得被當成他人更新(不得誤報)。
6. **草稿保護**:使用者有未存修改(含「儲存格編輯器已開啟、已輸入、尚未按 Enter」)時,推播到達**不得重建清單**(會丟掉輸入),而是凍結基準並顯示提示;無草稿時照舊重建並更新基準。
7. **對話框**:反向關聯對話框(群組↔使用者、權限↔群組)開啟但**未編輯**時收到推播 → 以新資料重建並更新基準;對話框以「主體名稱」開啟,存檔時須驗證主體 `id` 與開啟時一致(主體被刪除後以同名重建 → 拒絕並提示重新載入)。
8. **舊格式基準**:不帶 `h1:` 前綴的舊版基準 → 回 `baselineFormat`(提示使用者重新載入頁面),不得降級成「無基準」而放行。**未帶基準**(省略或 null)則維持可存(與舊行為一致)。
9. **不得改變**:權限合併規則 R-AUTH-MERGE-00、刪除/改名的引用連帶、外部列保護、名稱唯一、對應鍵(mapping key)、外部同步(`syncAndReplaceTabs`)的匯入語意(只改其取鎖方式)。

## 2. 請特別檢視(依重要性)

A. **伺服端寫入路徑**(`server/procCore.mjs` 的 `updateTabItems`、`writeMain`、`readAfter`、`outOf`、`mapGuardErr`;`server/keyCheck.mjs` 的 `withTabLocks`;`server/cascadeWrite.mjs`;`server/WWebPerm.mjs` 的鎖接線與 `syncAndReplaceTabs`):比對與寫入是否真的在同一個鎖內?取鎖順序是否可能成環(含:改名/刪除連帶 + 外部同步 + 後台存檔並行)?失敗路徑是否一律釋放鎖?`rowNotFound`、`saveStale`、`baselineFormat` 的映射是否正確且不洩漏列 id/個資到 log?`returnRows` 在讀回失敗時的行為是否安全?
B. **基準的前後端同構**(`src/schema/contracts/*.mjs`、`src/js/rowDigest.mjs`、`node_modules/w-serv-orm/src/baseline.mjs`):前端算出的基準與伺服端用同一份契約重新讀庫所得是否逐位元等價?`fields` 白名單、`serverOnly`、`orderKey` 的設定在四張表是否正確且完整(有沒有漏列會被使用者編輯、卻不在白名單的欄位)?空值等價是否有漏洞(例如 `0`/`false`/空陣列)?
C. **前端存檔後套用與草稿保護**(`src/js/applySaved.mjs`、`src/js/draftSync.mjs`、`src/js/cellEditing.mjs`,以及四個 `src/components/LayoutContent*.vue`):存檔成功 → 套用回傳列 → 重設草稿旗標 → 基準更新 的順序是否有競態(例如套用前先到的推播、套用期間再次編輯、儲存失敗路徑)?編輯器開啟的判定在 ag-grid 各種狀態下是否可靠(多列、已按 Esc、已按 Tab 切到下一格、虛擬捲動下的列)?`cellEditingStopped` 綁定是否可能漏綁或重複綁?
D. **對話框**(`src/components/VeGrupBlngUsers.vue`、`VePemiBlngGrups.vue`、`src/js/draftSync.mjs` 的 `checkSubject`/`planDialogSync`):主體身分檢查的時機(開啟時、儲存前、儲存延遲後)是否完整?「已改名」「已刪除」「同名重建」「同名被他人佔用」四種結果的處置是否正確?重建對話框時是否可能丟掉使用者尚未察覺的修改?
E. **測試是否守得住契約**:`test/unit-procCore-baseline.test.mjs`、`test/api-baseline.test.mjs`、`test/e2e-concurrent-edit.test.mjs`、`test/unit-rowDigest.test.mjs`、`test/unit-draftSync.test.mjs`。請用「若把某行實作拿掉/改壞,這條測試會不會變紅」的角度檢查:有沒有看似在測、實際上不論實作對錯都會通過的斷言(例如斷言太寬、等待條件在尚未發生時就成立、只驗了不變的一側)?有沒有契約中的格子沒有任何測試?
F. **文件與實作是否一致**:`README.md`「升級注意」「已知限制」、`spec/流程_多人同時編輯.md`、`sgud/rule/rulebook_concurrent.md` 的陳述是否與程式相符(含 `file:line` 引用、筆數、行為描述)?

## 3. 回報格式

用繁體中文,Markdown。結構固定如下:

### 發現(依嚴重度由高到低)
每一條:
`#<序號> [高|中|低] <檔案>:<行號> — <一句話描述>`
- **情境**:讓問題發生的具體輸入/操作順序(越具體越好,能寫出「第一步…第二步…」最佳)。
- **後果**:錯誤結果/資料遺失/死結/誤導使用者。
- **依據**:你讀到的程式碼片段或測試斷言(貼關鍵行即可)。
- **把握度**:`確定`(讀碼即可證成)/`推演`(依賴你推演的執行順序)/`不確定`(需要實測才能判定)。
- **建議**:最小修法一句話。

嚴重度:高=會造成錯誤結果、資料遺失、死結、安全問題或發布後壞掉;中=契約缺陷、測試漏洞、邊界未處理;低=文件、命名、風格。

### 已檢視而未發現問題的範圍
列出你實際讀過並認為沒問題的檔案/函式(簡短,每項一行)。

### 未檢視或無法判定的範圍
老實列出沒讀到或無法判定的部分及原因。

## 4. 注意事項

- 不要重述改動內容;只報**問題**。已被 README「已知限制」明文列為限制的項目,若你認為限制本身造成實質風險可以提,但請標明那是已知限制。
- 每一條發現請**自己用程式碼證成後才寫**,不要只依註解或文件的說法。註解/文件可能與程式不一致,那本身也是值得回報的發現。
- 請不要提出需要大幅重寫架構的意見,除非它是正確性問題的唯一解。
- 控制在約 45 分鐘內完成。最終的完整回報就是你的最後一則回覆(輸出到標準輸出);不要把回報寫成檔案。
