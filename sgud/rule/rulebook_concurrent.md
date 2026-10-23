# 規則帳本: 多人同時編輯——寫入契約、共用鎖、存檔回傳列、主體身分（perm-run01, 2026-10-23）

本冊收「多人同時編輯共用核心（w-serv-orm 1.1.17）」在本套件之落地規則. 來源: 使用者 2026-10-22 裁示原則 10（`C:\opensrcOper\sgud\proc\process_principle.md` 第 10 條）、共用規格 `C:\opensrcOper\dspec\多人同時編輯之寫入契約.md`（規格 1, 基準版本 `h1`）、主控第 101 項 perm-run01 派工. 與基準、草稿處置直接相關之 `R-BASELINE-01`、`R-DRAFT-KEEP-01`（改寫）在 `rulebook_sync_baseline.md`; 取鎖階層 `R-WRITE-LOCK-01／02` 在 `rulebook_sync_lock.md`. ADR 見 `spec/設計要點與取捨.md` ADR-037 Update(perm-run01).

## R-CONTRACT-01 每表一份寫入契約（前後端同一來源）與欄位三分類盤點

**規則**
1. 四表各一份契約 `src/schema/contracts/{users,grups,pemis,targets}.mjs`（純資料、零 import）, 集合 `src/schema/contracts/index.mjs`; 欄位 `table`、`pk:'id'`、`fields`（入基準之白名單, **明列不以排除推得**）、`serverOnly`、`orderKey:'order'`. 伺服端（`procCore`）與前端（`rowDigest.getContract`）取同一份物件; 通過核心 `checkContract`.
2. **盤點表**（規格第 9 節; 每個 schema 欄位恰歸一類, `unit-rowDigest` RD-C2 以 schema 全集守護，新增欄位未歸類即紅）:

| 表 | 主鍵 | `fields`（客戶端／雙方欄位，入基準，存檔採用客戶端值） | `serverOnly`（只由伺服端寫，不入基準，存檔不採用客戶端值） | 名次欄 |
|---|---|---|---|---|
| users | id | name、email、description、from、cgrups、isAdmin、isActive | userId、timeCreate、userIdUpdate、timeUpdate | order |
| grups | id | name、description、from、cpemis | 同上 | order |
| pemis | id | name、description、from、crules | 同上 | order |
| targets | id（標的名稱） | description、from | 同上 | order |

   - `from` 為外部列身分（外部同步擁有，後台不得改, R-EXT-OWN-01）, 入 `fields`: 外部同步改變它，持舊畫面者過期（以外部為主, 原則 5）.
   - `cgrups／cpemis／crules`（授權指派欄）是**雙方欄位**: 後台可改（Lv1）, 外部同步亦會寫（含鍵時以外部為準）, 入基準; 引用連帶（改名／刪除）亦由系統改寫之——故引用端寫入須取其表鎖（R-LOCK-CORE-01）.
   - 無「缺 `userIdUpdate` 之表」（四表皆有）.
3. **寫入者全集**（規格第 9 節; 每個寫入者之取鎖、寫入欄位、刪除回報）:

| # | 寫入者 | 位置 | 取鎖 | 寫哪些欄 | 刪除／未命中 |
|---|---|---|---|---|---|
| W1 | 後台整表存檔 | `procCore.updateTabItems`（RPC `updateXxx`） | `lockSave`（操作者占位）→ `guardWrite({tables:[本表]})`；引用端於內層 `withTabLocks`（階層） | `fields`＋`order`（`order=k+1`，外部列還原庫內值）；專有欄取庫內值 | `procOrm del/save` 帶 `{ mustExist:true }`，未命中 `rowNotFound`→`saveStale` |
| W2 | 外部同步 | `WWebPerm.syncAndReplaceTabs`（`/syncAndReplaceTabs`） | `withTabLocks(lockTabs,[本表])`；引用端內層 | 外部擁有欄（缺指派欄鍵者保留庫內值）；語意 `delAll({from})`＋`insert` 本輪不變（R-IMPORT-01 待另輪） | 不帶基準，以外部為主 |
| W3 | 引用連帶引用端寫入 | `cascadeWrite.writeWithCascade` | 已持引用端表鎖（呼叫端取） | 僅引用欄（`cgrups／cpemis／crules`）；補償還原以 `woItems.save(pre,{merge:false})` | `procOrm save` 帶 `mustExist`；補償失敗 `saveCascadePartial` |
| W4 | 離線工具 | `g_*.mjs`、`server/tools/*` | **不在服務內**（獨立行程，須先停後端，README Upgrade steps）；無法與服務共鎖 | 依工具 | 依工具（備份、回驗） |
| W5 | 資料通道 `operOrm` | `WWebPerm` `methodsExec:['select']` | — | 只開 `select`，無寫入 | — |

   - ORM 實例: `WWebPerm` 內單一 `WServOrm(ds, WOrm, url, db)`，未開 `useCache`（不帶 opt）；鎖管理器即其 `withTabLocks`／`guardWrite`.
   - 外部同步之穩定來源識別: 現為 `from`＋`id`（未帶 `id` 者依名稱對應）；`srcKey` 差異同步為 R-IMPORT-01（本輪不動）.
4. **伺服器專有欄位存檔不採用客戶端值**（規格第 4、6 節、V5）: `server/procCore.mjs:updateTabItems` 對 `ltdtDiffByKey` 之結果一律以 `dropServerOnlyDiff({ ..., all:true })`（僅專有欄不同之 diff 視為無變更不寫入）與 `restoreServerFields({ ..., all:true })`（確有改動之列改帶庫內之四個專有欄）處理，**不分外部列與後台列、不論 `lockExternalRows`**（`all:true` 為 perm-run01 增; 原只處理外部列）. 新增列之專有欄由 `procOrm insert` 補值.
   - **庫內缺專有欄（歷史列）時, 客戶端送入之值同樣不採用**（外審 sol#3, 2026-10-23）: `restoreServerFields` 對庫內無該欄者**刪除**送入列之該欄（保留庫內值＝仍無該欄）, 而非保留客戶端值（原「庫內無該欄者不補、草稿值原樣」會讓持有後台權限者偽造歷史列之建立者／建立時間）. 測試 `unit-externalRows` EX-051／051b／051c.
4a. **空值等價在「外部列守門」亦適用**（外審 sol#2, 2026-10-23）: `src/js/externalRows.mjs` 以 `normC(v, k)` 比對內容欄——`null`／`''`／缺欄為同一空值（與基準 `digestRow` 同口徑）, `0`／`false` 仍異於空值; `from` 欄不適用（`null` 與 `''` 之 `from` 有別, 歷史後台列）, 沿用 `normV`. 用於 `dropServerOnlyDiff`（僅伺服器欄／等價空值之差異視為無變更、不重寫, 庫內原表示不被改成 `''`）與 `checkExternalWrite`（鎖定欄異動判定）. 否則基準因空值等價而通過後, 守門仍回 `saveExternalRowChanged`, 合法存檔被誤拒. 前端送出前守門 `externalUi.getExternalEdits` 與之**同一比較器**（自 `externalRows` 匯入 `normC`; 增量外審 sol#2: 否則伺服端接受而前端先擋, 破壞「前端判違規 ⇔ 伺服端回 saveExternalRowChanged」之一致性）. 測試 `unit-externalRows` EX-044b（`null`／`''`／缺欄互換 6 格, 僅 grups）／044c／044d、EX-081（等價互換 4 格 × 表 4、異於空值 4 格 × 表 4）、`unit-externalUi` EU-305（前後端一致, 四表 × 〔等價 6 ＋ 非等價 8 ＋ from 2〕）. 盤點: `rg -n -o "normV\(|normC\(" src/js/externalRows.mjs` 期望 5 筆——`normV(` 1（僅 `normC` 之 `from` 分支）、`normC(` 4（`dropServerOnlyDiff` 一行 2 處、`checkExternalWrite` 一行 2 處; 定義行不含 `(` 緊接名稱）; 內容欄比對不得再直接用 `normV`.
5. **站點／盤點指令**: `rg -n "contracts|getContract" src server` ＝ 契約定義 5 檔＋`rowDigest.mjs`＋`procCore.mjs`；`rg -n "^\s*import" src/schema/contracts` ＝ 僅 `index.mjs` 有 import.

**測試**: `unit-rowDigest`（RD-C 盤點、RD-V 凍結向量）、`unit-procCore-baseline`（UB-4 專有欄）、`unit-procCore-external`（EXT-E04／H08 專有欄不回退）、`unit-externalRows`（EX-044b～d、EX-051／051b／051c、EX-081 空值格; 修前 16 敗、修後全過）.

## R-LOCK-CORE-01 所有寫入入口取同一個 w-serv-orm 鎖管理器（withTabLocks／guardWrite），不再自建 pmKeyMutex

軸: 寫入入口（W1～W3）× 表 × 取鎖層級（本表／引用端表）× 讀取—比對—寫入是否同一把鎖.

**規則**
1. `WWebPerm.mjs` 由 `WServOrm(...)` 回傳物件取 `withTabLocks`（別名 `lockTabs`）與 `guardWrite`，注入 `procCore(woItems, procOrm, { srLog, withTabLocks, guardWrite, lockSave, … })`；**整個 server 目錄不得有 `pmKeyMutex()`、`kmx`、`tabWriteKey`**（`unit-keyCheck` SITE-KC-007、`unit-procCore-refCascade` RW-550 靜態守護）. 核心鎖不可重入、每表一鍵、碼元序取鎖。
2. **後台整表存檔**（W1）: `lockSave(…, () => guardWrite({ tables:[keyTable], read: () => woItems[keyTable].select(), baseline, contract, write }))`——取鎖 → 新鮮讀取 → 基準比對 → `write`（撞名／對應鍵／外部列守門／diff／引用連帶／寫入）**在同一把表鎖內**（V14）；純函式前處理（`prepRows`: ltdtmapping、重給 order、空值／重複檢查、主鍵正規化）在取鎖之前，`pickKeysOnly`（users 的 `for:grups`）須以鎖內新鮮讀取為底合併後再前處理。
3. **外部同步**（W2）與**引用端**: `keyCheck.withTabLocks(lockTabs, keyTables, fn, held)` 依階層 `targets`→`pemis`→`grups`→`users` 由外而內巢狀、**每層一次只宣告一張表**呼叫 `lockTabs([t], inner)`；`held` 守門不變（違反階層拋 `tab lock order violation`）. 不使用核心「一次宣告多表」: 其碼元序（`grups<pemis<targets<users`）與階層序不同，混用即成環。引用端表鎖僅在本表有改名／刪除（`diffRefTargets` 之 `renames／delNames` 非空）時於 `write` 內才取（R-WRITE-LOCK-02）.
4. 站點全集: `rg -n "guardWrite\(" server` ＝ `procCore.mjs` 1 處（updateTabItems）；`rg -n "withTabLocks\(" server` ＝ `procCore.mjs`（引用端 1）、`WWebPerm.mjs`（本表 1、引用端 1）、`keyCheck.mjs` 定義. 判準: 已套；W4 離線工具不在服務內，不適用.
5. **V14 以人為延遲驗證**: `unit-procCore-baseline` UB-7（替身表 `select` 加延遲、並行外部同步／第二操作者，事件序不交錯，終態等價依序執行）、`unit-procCore-refCascade` RW-5xx（取鎖軌跡、階層、held、四表隨機併發 ≥ 50 輪不死結）.
6. 已知限制: 鎖管理器無逾時（沿用 R-WRITE-LOCK-01 取捨）；多行程部署不在支援範圍（規格第 12 節: 單一行程、同表同一 ORM 實例）.

## R-SAVED-ROWS-01 存檔成功後立即以伺服端回傳之「寫入後之列」更新畫面與基準

軸: 站點（四清單頁／兩反向對話框）× 回傳形狀（`{msg,rows,others}`／字串）× 其後同內容推播 × 使用者在推播前再編輯再存.

**規則**
1. 客戶端第 3 參 `{ baseline, returnRows:true }`；伺服端 `updateTabItems` 於**同一把表鎖內**（含引用端鎖）寫入後 `select` 讀回本表（依 `order` 排序），有改寫引用端時一併讀回引用端表（`others[表名]`）；成功回 `{ msg:'saveTabItemsSuccess', rows, others }`，未帶 `returnRows` 回字串（既有呼叫端不變）. 讀回失敗（寫入已生效）→ 回字串、記 srLog `updateTabItems-readBack-error`，前端退回等推播. **不以自己送出之值當新基準**（寫入時 clearXSS 等會改寫字串）.
2. 前端 `src/js/applySaved.mjs:applySavedRows(keyTable, res, commit)`：回傳形狀、表名白名單、每列主鍵為非空字串皆通過才 commit（`UpdateTableData`，payload 帶 `source:'savedRows'` 供 e2e 區分網路推播），否則回 false（退回等推播，不拋錯）. 清單頁在 `isModified=false` 且 `syncMark.dirty=false` **之後**同步 commit，使其引起之 `changeParams` 視為「無草稿」而重建（以回傳列為新資料與新基準）；對話框存檔成功後 commit（對話框隨即關閉），再開時基準即為最新。
3. 其後抵達之同內容網路推播：摘要相同（`isDraftStale` 假），不視為他人更新；run12 之 `dataReloadGuard` 與自己存檔中推播不誤報（`saveMark.saving`／`ownSaving`）不削弱。
4. 站點／盤點: `rg -n "applySavedRows\(" src` ＝ 定義 1 ＋ 六個元件各 1；`rg -n "returnRows: true" src/components` ＝ 6.

**測試**: `unit-applySaved`、`unit-procCore-baseline` UB-9（回傳列形狀；以回傳列建基準立即再存成功、舊基準被拒對照）、`e2e-concurrent-edit` E2E-001～006（推播被攔住時，四清單頁與兩對話框存檔後立即再存成功）.

## R-SUBJECT-ID-01 反向關聯對話框存檔時以主體 id 驗主體未被替換（第 114 項）

軸: 對話框（`VeGrupBlngUsers` 主體＝群組、`VePemiBlngGrups` 主體＝權限）× 主體狀態（原封不動／其他欄位改／改名／刪除／刪除後同名重建〔id 不同〕／開框時尚未儲存）× 時點（開框中推播／存檔當下／等待後送出前）.

**規則**（原則 3 收嚴＋提示、原則 6 引用不得被同名新資料接管）
1. 對話框以**名稱**引用主體（使用者 `cgrups` 的鍵＝群組名稱、群組 `cpemis` 的鍵＝權限名稱），原不驗主體身分. 開框時記主體摘要 `subject = { id, name, saved }`（`saved`: 開框時 store 已有該 id）.
2. `src/js/draftSync.mjs:checkSubject({ subject, rows })`（`rows`＝存檔當下主體表 store）: 同 id 同名 → `ok`；同 id 異名 → `renamed`；`saved` 且 id 不在 → `gone`（刪除或刪除後同名重建）；未儲存之主體現有同名而 id 不同之另一實體 → `taken`；摘要無效 → `noSubject`. 非 `ok` 一律拒收（收嚴）.
3. **存檔**: `doSave` 流程開頭與 `await delay(300)` 之後各驗一次；不符 → 不送出（零寫入）、`showCheckYes(relSubjectChangedGrup／relSubjectChangedPemi, {name})`、對話框保持開啟. **開框中**: `syncStore` 以同函數判定，非 `ok` → `subjectNotice` 為真（顯示 `staleDraftNoticeDialog` 提示）且不重建.
4. 範圍界定: 驗證在前端（對 store，與當下伺服端至多一個推播間隔之差）；伺服端不知「主體」，其基準比對只涵蓋被寫入之表（users／grups）。主體表之瞬間競態（存檔請求送出與寫入之間主體被同名重建）不在本規則（機率極低；若要伺服端強制，須另設 `opt.subject` 並於伺服端對主體表取鎖驗證，列為待裁示）.
5. 站點: `rg -n "checkSubject\(" src` ＝ 定義 1 ＋ 兩對話框各 2（存檔 `isSubjectOk`、`syncStore`）.

**測試**: `unit-draftSync` DS-7（`checkSubject` 15 格）、DS-5s（`syncStore` 主體被取代不重建）、`e2e-concurrent-edit` E2E-014～016（刪除後同名重建 → 存檔被拒、使用者表／群組表零寫入）.
