# 規則帳本: 多人同時編輯——寫入契約、共用鎖、存檔回傳列、主體身分、被引用實體身分（perm-run01／perm-run02, 2026-10-23）

本冊收「多人同時編輯共用核心（w-serv-orm 1.1.17）」在本套件之落地規則. 來源: 使用者 2026-10-22 裁示原則 10（`C:\opensrcOper\sgud\proc\process_principle.md` 第 10 條）、共用規格 `C:\opensrcOper\dspec\多人同時編輯之寫入契約.md`（規格 1, 基準版本 `h1`）、主控第 101 項 perm-run01 派工. 與基準、草稿處置直接相關之 `R-BASELINE-01`、`R-DRAFT-KEEP-01`（改寫）在 `rulebook_sync_baseline.md`; 取鎖階層 `R-WRITE-LOCK-01／02` 在 `rulebook_sync_lock.md`. ADR 見 `spec/設計要點與取捨.md` ADR-037 Update(perm-run01)、Update(perm-run02).

**perm-run02（2026-10-23, 範圍一）**: 使用者裁示「正反關聯與主體身份檢查,應該是前後端都要做」, 主控依 `R-PRINCIPLE-00` 原則 4（檢查與寫入同一把鎖）、6（引用不得被同名新資料接管）定案——`R-SUBJECT-ID-01` 規則 4 由「伺服端不知主體」改為「伺服端強制」, 並新增 `R-REF-IDENTITY-01`（清單頁指派欄之正向引用身分宣告）. 兩者共用 `src/js/refIdentity.mjs`; 取鎖多一層「被引用表鎖」（`R-LOCK-CORE-01` 規則 2a）. ADR 見 ADR-037 Update(perm-run02).

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
| W1 | 後台整表存檔 | `procCore.updateTabItems`（RPC `updateXxx`） | `lockSave`（操作者占位）→ `guardWrite({tables:[本表]})`；引用端於內層 `withTabLocks`（階層）；帶 `subject`／`refs` 時被引用表鎖在 `guardWrite` 外層（`withRefLock`, perm-run02, 規則 2a） | `fields`＋`order`（`order=k+1`，外部列還原庫內值）；專有欄取庫內值 | `procOrm del/save` 帶 `{ mustExist:true }`，未命中 `rowNotFound`→`saveStale` |
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
2a. **被引用表鎖在本表 `guardWrite` 外層**（perm-run02, `R-SUBJECT-ID-01` 規則 4、`R-REF-IDENTITY-01` 規則 4）: 客戶端 `opt` 帶 `subject` 或 `refs` 時, `updateTabItems` 於 `lockSave` 之內、本表 `guardWrite` 之外層以 `withRefLock` 先取**被引用表**（users→grups、grups→pemis、pemis→targets; 由伺服端依 `keyTable` 以 `refIdentity.getRefTarget` 自組, 客戶端不得指定）的表鎖並新鮮 `select()`, 主體身分於此驗, 其後才進本表 `guardWrite`; 正向 `refs` 於 `write` 內以同一份鎖內讀取驗證. 階層「被引用者先、引用端後」與 `TAB_LOCK_RANK`（`targets:0, pemis:1, grups:2, users:3`）一致: 被引用表階層恆低於本表, 本表之引用端（改名／刪除連帶）又高於本表, 三者同一方向, 不成環. 不帶 `subject`／`refs` 者**不取被引用表鎖**, 與修正前逐步相同（`unit-procCore-identity` IDN-501 對照格）.
3. **外部同步**（W2）與**引用端**: `keyCheck.withTabLocks(lockTabs, keyTables, fn, held)` 依階層 `targets`→`pemis`→`grups`→`users` 由外而內巢狀、**每層一次只宣告一張表**呼叫 `lockTabs([t], inner)`；`held` 守門不變（違反階層拋 `tab lock order violation`）. 不使用核心「一次宣告多表」: 其碼元序（`grups<pemis<targets<users`）與階層序不同，混用即成環。引用端表鎖僅在本表有改名／刪除（`diffRefTargets` 之 `renames／delNames` 非空）時於 `write` 內才取（R-WRITE-LOCK-02）.
4. 站點全集: `rg -n "guardWrite\(" server` ＝ `procCore.mjs` 1 處（updateTabItems）；`rg -n "withTabLocks\(" server` ＝ `procCore.mjs`（被引用表 1〔perm-run02 增, `withRefLock` 內〕、引用端 1）、`WWebPerm.mjs`（本表 1、引用端 1）、`keyCheck.mjs` 定義（上列為可執行處; 命中行另含註解行, 以 `rg -n "withTabLocks\(lockTabs, \[(refTarget\.table|holder)\]" server` 取可執行處 ＝ 3 行: `procCore.mjs` 2〔被引用表、引用端〕＋`WWebPerm.mjs` 1〔引用端; 本表 1 處寫成 `withTabLocks(lockTabs, [keyTable]` 不在此式〕）. 判準: 已套；W4 離線工具不在服務內，不適用. `unit-procCore-refCascade` RW-551a 之 `withTabLocks(` 計數隨之由 1 改 2.
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

## R-SUBJECT-ID-01 反向關聯對話框存檔時以主體 id 驗主體未被替換（第 114 項; perm-run02 增伺服端強制）

軸: 對話框（`VeGrupBlngUsers` 主體＝群組、`VePemiBlngGrups` 主體＝權限）× 主體狀態（原封不動／其他欄位改／改名／刪除／刪除後同名重建〔id 不同〕／開框時尚未儲存）× 時點（開框中推播／存檔當下／等待後送出前／伺服端鎖內）× 驗證層（前端對 store／伺服端對新鮮讀取）× 宣告情形（相符／格式不合／未帶）.

**規則**（原則 3 收嚴＋提示、原則 6 引用不得被同名新資料接管）
1. 對話框以**名稱**引用主體（使用者 `cgrups` 的鍵＝群組名稱、群組 `cpemis` 的鍵＝權限名稱），原不驗主體身分. 開框時記主體摘要 `subject = { id, name, saved }`（`saved`: 開框時 store 已有該 id）.
2. `src/js/draftSync.mjs:checkSubject({ subject, rows })`（`rows`＝存檔當下主體表 store）: 同 id 同名 → `ok`；同 id 異名 → `renamed`；`saved` 且 id 不在 → `gone`（刪除或刪除後同名重建）；未儲存之主體現有同名而 id 不同之另一實體 → `taken`；摘要無效 → `noSubject`. 非 `ok` 一律拒收（收嚴）.
3. **存檔**: `doSave` 流程開頭與 `await delay(300)` 之後各驗一次；不符 → 不送出（零寫入）、`showCheckYes(relSubjectChangedGrup／relSubjectChangedPemi, {name})`、對話框保持開啟. **開框中**: `syncStore` 以同函數判定，非 `ok` → `subjectNotice` 為真（顯示 `staleDraftNoticeDialog` 提示）且不重建.
4. **伺服端強制**（perm-run02, 2026-10-23; 使用者裁示「正反關聯與主體身份檢查,應該是前後端都要做」; 原則 4 檢查與寫入同一把鎖、原則 6 引用不得被同名新資料接管. **取代 perm-run01 原「驗證在前端、伺服端不知主體、列待裁示」之範圍界定**——原界定留下「推播未抵達之窗口」: 前端只對 store 驗, store 至多落後一個推播間隔, 窗口內他人刪除並同名重建主體, 對話框仍判 `ok` 而把授權寫到同名新實體）:
   - **送出**: 兩對話框存檔 RPC 的 `opt`（`updateUsers`／`updateGrups` 的第 2 個客戶端參數, 即伺服端 `kpFunExt` 第 3 參）加 `subject = { id, name, saved }`——與前端自檢同一份摘要; 前端自檢（規則 3）**保留**: 先擋、免一次往返, 且與伺服端同判準.
   - **驗證**: `server/procCore.mjs:updateTabItems` 於 `lockSave` 之內、本表 `guardWrite` 外層以 `withRefLock` 先取**主體表**表鎖（users→grups、grups→pemis, 階層被引用者先、引用端後; 主體表由伺服端依 `keyTable` 以 `refIdentity.getRefTarget` 自組, 客戶端不得指定）並新鮮 `select()`, 以 `refIdentity.checkSubjectIdentity`（內即 `draftSync.checkSubject`, 前後端單一判準）驗; 非 `ok` → reject `saveSubjectChanged`（零寫入, 固定訊息、不含名稱）, srLog `updateTabItems-identity-error`（`reason`＝`gone`／`renamed`／`taken`, `n:1`; `checkSubject` 之 `noSubject` 在伺服端不可達——`parseSubject` 已先以 `format` 攔下無效摘要, 屬防禦分支）. **先於基準比對**: 使「主體已被取代」優先於泛稱之 `saveStale`（`unit-procCore-identity` IDN-401）. 檢查與本表寫入在同一段持鎖期間, 其間主體表不被任何入口改動（`R-LOCK-CORE-01`）.
   - **格式**: `subject` 須為 `{ id:非空字串, name:非空字串, saved:布林 }`; 缺欄、空字串、`saved` 非布林、非物件, 或 pemis 帶 `subject`（pemis 之被引用表為 targets, 列無 `name` 欄、無反向對話框）、targets 帶 `subject` → `saveIdentityFormat`（reason `format`, 在基準格式驗證之後、`lockSave` 與任何讀寫之前; **不降級為不帶**）.
   - **相容**: 不帶 `subject`（`undefined`／`null`）者維持原行為（名稱引用、不驗身分、不取主體表鎖; 外部應用、舊客戶端）; 不比原行為多放行任何寫入.
   - **已知限制**: 主體表在「前端自檢」與「請求抵達」之間被改, 現由伺服端鎖內驗證擋下（原範圍外之窗口已關閉）; 但不帶 `subject` 之外部呼叫端（直打 RPC、舊客戶端）不受此保護, 仍是名稱引用語意（見 `R-REF-IDENTITY-01` 規則 6; 強制必帶列「下版再議」）.
5. 站點: `rg -n "checkSubject\(" src server` ＝ 7 筆（`draftSync.mjs` 定義 1; 兩對話框各 2〔存檔 `isSubjectOk`、`syncStore`〕共 4; `refIdentity.mjs` 呼叫 1＋註解 1）; 伺服端 `rg -n "checkSubjectIdentity\(" server src` ＝ `procCore.mjs` 1 ＋ `refIdentity.mjs` 定義 1; 送出端 `rg -n "returnRows: true, subject\b" src/components` ＝ 2（`VeGrupBlngUsers`、`VePemiBlngGrups`）. 判準: 兩對話框皆已套; 清單頁不送 `subject`（清單頁之引用走 `R-REF-IDENTITY-01`）.

**測試**: `unit-draftSync` DS-7（`checkSubject` 15 格）、DS-5s（`syncStore` 主體被取代不重建）、`e2e-concurrent-edit` E2E-014～016（刪除後同名重建 → 存檔被拒、使用者表／群組表零寫入; 前端自檢）. perm-run02: `unit-refIdentity` RI-9（`parseSubject`）／RI-13（`checkSubjectIdentity` 與 `checkSubject` 6 主體 × 5 表況格網一致）、`unit-procCore-identity` IDN-101～113、IDN-401、IDN-501／510／520、IDN-601～608、`api-identity`（真後端）AI-1a～c、AI-4、AI-5a／5c（`subject` 並發）、`e2e-concurrent-edit` 反向對話框伺服端強制 2 案（屬 E2E-025～035; 編號與內容以實際檔為準）.

## R-REF-IDENTITY-01 清單頁指派欄之正向引用須附被引用實體身分宣告，伺服端於被引用表鎖內驗證（perm-run02 範圍一, 2026-10-23）

軸: 引用端表（users→grups、grups→pemis、pemis→targets; targets 無授權引用欄）× 被引用實體狀態（存在且未動／被刪除／刪除後同名重建〔id 不同〕／另新增同名實體〔原實體仍在〕／歷史同名多筆／懸空〔選取當時查無〕）× 宣告情形（相符／漏報／多報／格式不合／未帶）× 時點（編輯器選取 → 存檔前〔前端對 store〕→ 伺服端鎖內〔新鮮讀取〕）× 路徑（編輯器回填〔有選取記錄〕／複製、貼上〔無選取記錄〕）× 呼叫端（三清單頁／兩反向對話框〔走 `R-SUBJECT-ID-01`〕／外部應用與舊客戶端〔不帶〕）.

來源: 使用者 2026-10-23 裁示「正反關聯與主體身份檢查,應該是前後端都要做」; 主控依 `R-PRINCIPLE-00` 原則 4（檢查與寫入同一把鎖）、6（引用不得被同名新資料接管）、3（歧義收嚴）定案. ADR-037 Update(perm-run02).

**規則**
1. **問題**: 授權以**名稱**引用他表實體（`users.cgrups` 的鍵＝`grups.name`、`grups.cpemis` 的鍵＝`pemis.name`、`pemis.crules` 的鍵＝`targets.id`）. 使用者在編輯器勾選引用後、存檔前, 被引用實體若被刪除再以同名重建（id 不同）, 存檔會把授權靜默指向另一個實體（被同名新資料接管）. 本規則令前端先擋、伺服端於被引用表鎖內強制（不信任前端）; 判準為同一份純函數, 單一擁有者 `src/js/refIdentity.mjs`.
2. **宣告範圍＝「新增之啟用引用項」**: 列的授權字串（`cgrups`／`cpemis`／`crules`, JSON5）內 `isActive==='y'` 之項, 其名稱不在該列舊值之啟用項內（新增列＝全部啟用項; 停用改啟用算新增）. **不計**: 停用項（不授權）、未變更之舊引用（已持久之關係, 刪除時引用連帶已清理, `R-REF-CASCADE-01`; 故舊引用之實體被替換不使存檔被拒）、被移除之引用、只改 mode. 壞 JSON／空字串／非容器不計; `cgrups`／`cpemis`（kind `ref`）之非字串名稱不計, `crules`（kind `rule`）之名稱依屬性鍵轉型（`getPropKey`, 如數字 `5` → `'5'`）計入, 與伺服端 `mergeRules` 比對鍵同口徑（外審 sol#4 更正原「非字串名稱不計」之籠統敘述）. （`activeNames`／`newActiveNames`／`collectNewNames`; `unit-refIdentity` RI-2～RI-4.）
3. **前端（選取當時快照＋存檔前自檢）**:
   - 開啟編輯器當下 `snapRefIds(keyTable, 被引用表 store 列)` 建「名稱 → 對應之實體 id 陣列」快照（歷史同名則多個 id）; 編輯器回填時 `recordPicks` 就地記下本次新增之啟用引用名稱 → 開啟當下之 id 陣列（快照無此名稱記 `[]`＝選取當時懸空; 已啟用之名稱第二次回填不重記, 保留首次選取當時之 id）; 選取記錄 `vo.refPicks`（非響應式 `Map`）於草稿重建時歸零（重建即放棄未存編輯）.
   - **以選取當時、而非載入當時為準**: 載入後他人新建、我才指派的實體, 其 id 在我選取當時已在 store, 宣告含之, 不被誤擋（ADR 否決方案 b）.
   - 存檔: `parseRefDecl(buildRefDecl({ keyTable, rowsNew, rowsOld: vo.baseRows, picks: vo.refPicks, refRows: 被引用表 store }))`, 再 `countRefMismatch` 對 store 驗; 不符（> 0）→ **不送出**（零寫入）、`unlockBtn()` 後 `showCheckYes($t('saveRefChanged'), { type: 'warning' })`; 通過則隨存檔送 `updateXxx(rows, { baseline, returnRows: true, refs })`, `refs = [{ name, ids }]`（依名稱排序）. 檢查位置在外部列自檢（`saveExternalRowChanged`）之後、`updateLoading(true)` 之前.
   - 無選取記錄之名稱（複製列、貼上等未經編輯器回填之路徑）退回以**送出當下**之被引用表 store 為準, 只涵蓋「送出到寫入」之窗口（已知限制 ①）.
4. **伺服端（被引用表鎖內新鮮讀取; 不信任客戶端內容）**:
   - `server/procCore.mjs:pickClientOpt` 原樣轉出 `subject`／`refs`; `updateTabItems` 於 rows 格式與基準格式驗證之後、`lockSave` 與任何讀寫之前以 `parseRefDecl`／`parseSubject` 驗格式（規則 6）.
   - 被引用表與鎖皆由伺服端依 `keyTable` 以 `getRefTarget` 自組, 客戶端不得指定表名; `withRefLock` 先取被引用表鎖並新鮮 `select()` 一次, `subject` 與 `refs` 共用此份 `refRows`（`R-LOCK-CORE-01` 規則 2a）.
   - **位置**: `write` 回呼內 `dropServerOnlyDiff`／`restoreServerFields` 之後、`checkExternalWrite` 之前, `checkRefIdentity({ keyTable, decl, rowsNew: [...r.add, ...r.diff], rowsOld: 鎖內新鮮之本表舊列, refRows })`. 位於本表 `guardWrite` 之基準比對**之後**: 基準過期時先回泛稱之 `saveStale`（IDN-402）.
   - **判準**: ①宣告之每個名稱, 其目前對應之 id 陣列（`idsOfName`: 被引用表中以該名稱鍵比對之列 id, 排序去重）須與宣告相同——被刪除（現為 `[]`）、刪除後同名重建（id 不同）、另新增了同名實體（多一個 id）、歷史同名少報一個, 皆不符 → `saveRefChanged`（reason `refChanged`, `n`＝不符名稱數）; ②宣告須完整——本次寫入之列相對庫內舊列新增之啟用引用名稱, 每個都須在宣告內, 漏報 → `saveRefChanged`（reason `refIncomplete`, `n`＝漏報名稱數）; 先判不符再判漏報（IDN-210）. 多報（宣告了未新增之名稱）現況相符則通過（多報只增加檢查, 不放寬）.
   - 被拒一律零寫入（本表、引用端表、被引用表皆不變）.
5. **targets 的身分定義＝id（主鍵＝標的名稱）**: `pemis.crules` 之引用鍵即 `targets.id`, 且外部同步每次以同 id 重寫列（`delAll({from})`＋`insert`）, targets 沒有獨立於名稱之穩定身分. 故 `crules` 欄只檢查「已被刪除」（宣告 `[id]` 而現況查無 → 不符）; **刪除後以同 id 重建依定義是同一實體, 通過**（設計事實, 非缺陷）. 若業主要求以建立時間區分, 須另案——且外部同步每次重寫使 `timeCreate` 不穩定（ADR 否決方案 c）. （`unit-refIdentity` RI-12 targets 格、`unit-procCore-identity` IDN-203 targets 格、`api-identity` AI-2c 標的格.）
6. **相容與不擴權（原則 1、8）**: 不帶 `refs`／`subject`（`undefined`／`null`）者維持原行為——名稱引用、不驗身分、不取被引用表鎖、不讀被引用表（IDN-301: 7 種不帶形式之終態逐位相同; IDN-302: 不帶宣告時既有拒收照舊，如持舊基準 `saveStale`）; **不比原行為多放行任何寫入**. 帶了但格式不合 → `saveIdentityFormat`（reason `format`, 在任何讀寫與取鎖之前, **不降級為不帶**）: `refs` 非陣列、宣告 > 5000 筆、單名稱 > 1000 個 id、名稱非字串、重複名稱、`ids` 非字串陣列; `subject` 見 `R-SUBJECT-ID-01` 規則 4; 引用端表無授權引用欄（targets）帶任一者亦然（即使 `refs: []`）. 宣告內容不被信任: 驗證用之表、鎖、舊列皆由伺服端自組. 強制所有寫入必帶宣告（`requireSubject`／`requireRefIds`, 比照 `requireBaseline`）列「下版再議」（ADR 否決方案 d）.
7. **錯誤鍵與 log**: 語系鍵 `saveSubjectChanged`／`saveRefChanged`／`saveIdentityFormat`（`server/procLang.mjs`, eng＋cht, 固定訊息、不含名稱; 後端回 key, 前端 `$t` 換算）. srLog 事件 `updateTabItems-identity-error`: 欄位 `keyTable`、`userId`、`msg`（鍵）、`reason`、`n`; `reason` ∈ `gone`／`renamed`／`taken`（subject）、`refChanged`／`refIncomplete`（refs）、`format`（格式）; **不記名稱、id 值與宣告內容**（IDN-607）. 兩處防禦分支不會出現在此事件: `checkSubject` 之 `noSubject`（`parseSubject` 已先以 `format` 攔下無效摘要）、`checkRefIdentity` 內之 `refNoTarget`（引用端表無被引用表; 經 `updateTabItems` 時已先被格式驗證以 `format` 攔下）.
8. **次序**（由先到後）: rows 格式（`saveRowFieldInvalid`）→ 基準格式（`saveBaselineFormat`）→ 身分宣告格式（`saveIdentityFormat`）→ `lockSave` 占位（`saveInProgress`）→ 被引用表鎖＋主體身分（`saveSubjectChanged`）→ 本表 `guardWrite` 基準比對（`saveStale`）→ `write` 內專有欄處理 → 正向 `refs`（`saveRefChanged`）→ 外部列守門（`saveExternalRowChanged`）→ 其後既有檢查與寫入. （IDN-401～405.）
9. **取鎖與死結**: 被引用表鎖在 `lockSave` 之內、本表 `guardWrite` 之外層, 階層低於本表, 與外部同步／引用連帶（本表 → 引用端）同一階層序（`server/keyCheck.mjs:TAB_LOCK_RANK` ＝ `targets:0, pemis:1, grups:2, users:3`; `R-LOCK-CORE-01` 規則 2a、`R-WRITE-LOCK-02`）. 被拒或格式不合之後鎖與占位皆釋放（IDN-502: 同一操作者 5 秒內立即再存成功）. 驗證: IDN-501（取鎖軌跡: 被引用表先、本表後; 不帶宣告只取本表鎖）、IDN-503（連帶改名之階層 pemis → grups → users、targets → pemis → grups）、IDN-510（存檔 ∥ 刪除或同名重建被引用實體，終態等價依序執行）、IDN-520（四表隨機交錯 60 輪〔12 情境 × 5 種子〕，每輪 5 秒內完成〔不死結〕，終態等價於某一依序執行）.

**站點全集與判準**（盤點指令與期望筆數均於 2026-10-23 以 Grep 實測）

| 站點 | 角色 | 判準 |
|---|---|---|
| `src/js/refIdentity.mjs` | 單一擁有者（純函數, 不依賴 Vue／DOM／ORM） | 已套 |
| `server/procCore.mjs:updateTabItems`／`pickClientOpt` | 伺服端強制（格式 → 被引用表鎖 → 主體／正向身分） | 已套 |
| `LayoutContentUsers`／`LayoutContentGrups`／`LayoutContentPemis` | 快照、回填記錄、組宣告、存檔前自檢、送 `refs` | 已套（3／3） |
| `VeGrupBlngUsers`／`VePemiBlngGrups` | 送 `subject`（走 `R-SUBJECT-ID-01`, 不送 `refs`: 對話框只改主體一個實體之引用） | 已套（2／2） |
| `LayoutContentTargets` | targets 無授權引用欄, 不送 `refs`／`subject`（帶了反被 `saveIdentityFormat` 拒收） | 刻意不套 |
| 外部同步 `syncAndReplaceTabs`、離線工具 | 外部端為主（原則 5）、無「使用者在編輯器選取」之時點; 離線工具不在服務內 | 不適用 |
| 不帶宣告之外部呼叫端（直打 RPC、舊客戶端） | 名稱引用語意, 相容保留（規則 6） | 刻意不套（下版再議） |

盤點指令（期望為 2026-10-23 實測）:
- `rg -n "checkRefIdentity\(|checkSubjectIdentity\(|getRefTarget\(" server src` ＝ 12 行: `server/procCore.mjs` 3（`getRefTarget(`、`checkSubjectIdentity(`、`checkRefIdentity(` 各 1 處呼叫）＋`src/js/refIdentity.mjs` 9（`getRefTarget` 定義 1 ＋內部呼叫 6、`checkRefIdentity` 定義 1、`checkSubjectIdentity` 定義 1）.
- `rg -n "returnRows: true, (refs|subject)\b" src/components` ＝ 5（三清單頁 `refs`、兩對話框 `subject`）; 對照 `rg -n "returnRows: true" src/components` ＝ 6, 多出者為 `LayoutContentTargets.vue`（刻意不套）. （`returnRows` 在前, 故不用 `refs\b.*returnRows` 之寫法, 該式無命中.）
- `rg -n "from '\.\./js/refIdentity\.mjs'" src/components` ＝ 3（三清單頁; 兩對話框不 import, 其主體判準走 `draftSync.checkSubject`）.
- `rg -n "snapRefIds\(|recordPicks\(|buildRefDecl\(|countRefMismatch\(|parseRefDecl\(" src/components` ＝ 12（三清單頁各 4 行: 快照 1、回填記錄 1、組宣告＋解析〔`buildRefDecl(` 與 `parseRefDecl(` 同一行〕1、自檢 1）.
- `rg -n "updateTabItems-identity-error" server` ＝ 3（`procCore.mjs`: 格式、主體、正向各 1）; `rg -n "withTabLocks\(lockTabs, \[refTarget\.table\]" server` ＝ 1.

**已知限制**
1. 未經編輯器回填之路徑（複製列、貼上）無選取記錄, 宣告以送出當下之被引用表 store 為準——只擋「送出到寫入」之窗口, 不擋「複製或貼上當時到送出」之間的替換.
2. 前端自檢對 store（至多落後一個推播間隔）, 伺服端鎖內讀取為最終裁決.
3. 不帶宣告之外部呼叫端與舊客戶端仍是名稱引用, 不受保護（相容保留; `requireSubject`／`requireRefIds` 下版再議）.
4. targets 以 id 為身分（規則 5）, 「刪除後同 id 重建」依定義不被視為替換.
5. 歷史同名收嚴: 選取當時對應兩個以上同名實體者, 其後刪除其中任一個亦不符（宣告 id 集合須與現況逐一相同, 原則 3）.
6. 每次帶宣告之存檔多讀一次被引用表整表（`select()`）並多持其表鎖; 宣告上限 5000 筆、單名稱 1000 個 id（防濫用, 正常使用遠小於此）.

**測試對照**
- `unit-refIdentity`（純函數 RI-1～RI-14; 2026-10-23 實跑 280 passing）: `getRefTarget`、`activeNames`、`newActiveNames`、`collectNewNames`、`idsOfName`、`snapRefIds`、`recordPicks`、`buildRefDecl`、`parseSubject`、`parseRefDecl`、`countRefMismatch`、`checkRefIdentity`（RI-12）、`checkSubjectIdentity`（RI-13）、全流程串接（RI-14）.
- `unit-procCore-identity`（伺服端強制, 真 `procCore`＋替身表; 2026-10-23 實跑 197 passing）: IDN-1 `subject`（IDN-101～113）、IDN-2 `refs`（IDN-201～214）、IDN-3 相容（IDN-301～302）、IDN-4 次序（IDN-401～405）、IDN-5 鎖（IDN-501～503、510、520）、IDN-6 靜態站點與介面（IDN-601～608）.
- `api-identity`（真後端; 檔頭自述 47 案: AI-1 6、AI-2 15、AI-3 6、AI-4 14、AI-5 5〔各 6 輪並發〕、AI-6 1; 該檔撰寫時僅以行程內替身乾跑全綠, **真後端實跑結果以實測為準**）.
- `e2e-concurrent-edit` E2E-025～037（反向對話框伺服端強制 025～026、正向伺服端強制 027～029、正向前端自檢 030～032、正常路徑 033～035、設計事實 036〔targets 刪後同 id 重建通過〕、同名跨列選取衝突 037, 共 13 案, 每案 × eng／cht 兩語系; 2026-10-23 實跑 24 個 it〔025～036〕全過, 037 另跑 2／2 過）.
- `unit-refIdentityWiring`（RIW-1～5, 12 案: 三清單頁與兩對話框之接線靜態守護）、`unit-refIdentity` RI-7（`recordPicks` 同名衝突）.
- **同名跨列選取衝突**（外審 sol#1, 2026-10-23）: 選取記錄以名稱為鍵、跨列共用; 同名先後被選取而選取當時之 id 陣列不同（兩次選取之間被引用實體被刪除後同名重建）→ `recordPicks` 記為衝突（`null`）, `buildRefDecl` 令該名稱之 `ids` 為 `null`, `parseRefDecl` 判不合法（`null`）、`countRefMismatch` 視為不符, 前端自檢不放行（不得以後一列之新快照覆蓋前一列之記錄, 否則前一列之授權被同名新實體接管而宣告仍相符）; id 陣列相同之重複選取不是衝突; 衝突於草稿重建前不自行解除（收嚴, 原則 3）. 測試 `unit-refIdentity` RI-7、`e2e-concurrent-edit` E2E-037; 變異（拿掉衝突判定）被抓.
- `unit-procCore-refCascade` RW-551a（procCore 之 `withTabLocks(` 呼叫 1 → 2 處: 被引用表鎖＋引用端表鎖）.
