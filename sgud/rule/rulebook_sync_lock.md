# 規則帳本:寫入取鎖與表鎖階層

本檔為 `sgud/rule/rulebook.md` 之分冊(2026-10-22 主控依使用者指示自原 312KB 之帳本依類型分拆; 2026-10-23 perm-run01 再將 `rulebook_sync.md`〔73KB〕依類型拆為四冊, 節(###)之標題與內容不變, 依規則編號 `R-…` 查找者請用 `rulebook.md` 之索引).

## 寫入取鎖(自 `rulebook_sync.md`「名稱唯一與對應鍵檢查」一節搬入; R-WRITE-LOCK-01／02 之標題與內容不變)

### R-WRITE-LOCK-01 外部同步與後台整表寫入對同一張表共用互斥鍵(外審 sol R10; F-02／F-14 之前提; D2 設計稿 (a) 之最小版)

軸: 寫入入口(外部同步 `syncAndReplaceTabs`／後台整表寫入 `updateTabItems`) × 表(`targets`／`pemis`／`grups`／`users`) × 檢查與寫入之間是否可被他方插入.

- **規則**: 兩個入口各自「先檢查名稱／對應鍵唯一、後寫入」, 若取不同的 `kmx` 鍵, 檢查後、寫入前對方已完成寫入, F-02／F-14 之全域唯一性被略過(終態同名兩列, 授權取決於列序; 外審 sol 以確定性閘門重現, 無 sleep). 故兩者對同一張表**必須取同一個鍵**: `server/keyCheck.mjs:tabWriteKey(keyTable)`(= `'tabWrite:' + keyTable`), `WWebPerm.mjs:syncAndReplaceTabs` 與 `procCore.mjs:updateTabItems` 皆 `kmx(tabWriteKey(keyTable), …)`. 不同表不同鍵(並行不變). `pmKeyMutex` 非可重入: 兩條路徑內都不得再取同一個鍵(`syncAndReplaceTabs` 內只呼叫 `procOrm`／`woItems`, 不呼叫 `updateTabItems`). 操作者占位 `lockSave`(ADR-025)仍在 `kmx` 之外層, 與本規則無關.
- 站點全集: `rg -n "kmx\(" server` 兩處(`WWebPerm.mjs`、`procCore.mjs`); `rg -n "pmKeyMutex\(\)" server` 恰一處(`WWebPerm.mjs`, 且 `procCore(...)` 之 `kmx` 引數即該實例; 增量外審 mmd-N2: 兩處鍵字面不變而實例不同時互斥即失效). 判準: 已套(兩處、單一實例); 不得保留各自字面鍵.
- **無逾時(取捨, 增量外審 mmd-N3／sold-R1)**: `pmKeyMutex` 無等待上限, `lockSave` 之占位由 `cacheSt()`(`WWebPerm.mjs`, 未另設 `timeExpire`)預設 TTL 30 分鐘後失效. 同步持鎖期間(`select` + 驗證 + `delAll` + `insert`)後台同表存檔排隊等候, 同步若因 I/O 或資料庫異常不返回, 後台同表存檔將持續等待(呼叫端先逾時不會取消已排隊之寫入, 釋放鎖後仍會寫入). 未加有界等待係刻意(加了須回固定錯誤 key 並決定逾時後是否仍寫入); 待裁示.
- **範圍外(仍待 D2 設計稿 (c0)(c1)(b) 裁示)**: 本規則只解決「兩個伺服端入口之交錯」; 後台以過期快照整表存檔復活/覆蓋他人變更(F-26)、外部列受保護(F-23)皆未做. **〔run07 更新, ADR-037〕** (c0)(c1)(b) 已裁示並實作: 載入基準與兩對話框以存檔當下 store 為底見 R-BASELINE-01, 外部列受保護見 R-EXT-OWN-01; 兩者之守門與比對皆在 `updateTabItems` 之既有表鎖內, 未新增取鎖路徑.
- 測試: `unit-keyCheck` SITE-KC-007(兩處皆 `kmx(tabWriteKey(keyTable)`、WWebPerm.mjs 內 `kmx(` 僅一處以免與此鍵巢狀死結、`pmKeyMutex()` 於 server 內恰一處且 `procCore(` 之 `kmx` 引數為該實例)、`unit-procCore-updateTabItems` UNIT-UTI-013(他方持有 `tabWriteKey('grups')` 期間 `updateGrups` 不寫入、釋放後才完成, 他表不受影響).
- **〔run06 更新, ADR-036〕** 取鎖寫法改為經單一取鎖函數 `withTabLocks`(見 R-WRITE-LOCK-02): 兩處皆 `withTabLocks(kmx, [keyTable], …)`(其內才 `kmx(tabWriteKey(表), …)`), `WWebPerm.mjs`／`procCore.mjs` 不得直接 `kmx(`; 上列「`rg -n "kmx\(" server` 兩處」改為「`rg -n "\bkmx\(" server` 只有 `keyCheck.mjs:withTabLocks` 一處」, SITE-KC-007 與 SITE-UK-001 之字面已同步; 「同一把鍵不巢狀」不變, 另允許**依階層**之不同表鎖巢狀.
- **〔perm-run01 更新, R-LOCK-CORE-01〕** 鎖管理器改為 **w-serv-orm 實例之 `withTabLocks`／`guardWrite`**（每表一鍵, 碼元序, 不可重入; `WWebPerm.mjs` 取自 `WServOrm(...)` 回傳物件並注入 `procCore`）: 套內**不再有** `pmKeyMutex()`／`kmx`／`tabWriteKey`. 後台整表存檔改 `lockSave → guardWrite({ tables:[本表], … })`（取鎖→新鮮讀取→基準比對→`write` 於同一把鎖）, 外部同步 `withTabLocks(lockTabs, [本表], …)`, 兩者**共用同一個鎖管理器**（本規則「必須取同一個鍵」之要求由此達成）. 上列 `rg -n "kmx\(" server`、`pmKeyMutex\(\)` 站點全集改為: `rg -n "pmKeyMutex|kmx|tabWriteKey" server` ＝ 0（`unit-keyCheck` SITE-KC-007、`unit-procCore-refCascade` RW-550）；`unit-procCore-updateTabItems` UNIT-UTI-013 改以 `core.withTabLocks(['grups'], …)` 持鎖.

### R-WRITE-LOCK-02 表鎖取鎖階層與單一取鎖函數(外審 A.3／A.4; run06, ADR-036; F-23／F-26 之前提)

軸: 持鎖之表集合(單表／被引用表＋引用端表) × 取鎖次序 × 讀取、預檢、寫入是否都在持鎖之內.

- **階層**: 引用鏈序「被引用者先、引用端後」`targets` → `pemis` → `grups` → `users`(`server/keyCheck.mjs:TAB_LOCK_RANK`); 引用端之階層恆高於被引用者. **單一取鎖函數** `withTabLocks(kmx, keyTables, fn, held = [])`: 表名去重並依階層排序後由外而內巢狀取 `kmx(tabWriteKey(表))`; `held` 為呼叫端已持有鎖之表, 內層分段取鎖時 `keyTables` 之階層須全數高於 `held`, 否則拋 `Error('tab lock order violation')`(不嘗試取鎖). 所有需持多把表鎖之路徑(後台整表寫入、外部同步、日後之 F-23 外部列保護／清源／批次入口)**只能經此函數**, 不得自行巢狀 `kmx(`; D1 設計稿(引用鏈序)與 D2 設計稿(字母序 `grups < pemis < targets < users`)之階層衝突(外審 A.4, 兩稿並存會成環)統一為本階層, 下一輪 F-23 沿用. **〔run07 更新〕** F-23／F-26 已沿用: 外部列守門與基準比對皆在 `updateTabItems` 持本表鎖之內(`procCore.mjs` 之 `withTabLocks(kmx, [keyTable]` 之後、引用端分段取鎖之前), 無新增取鎖函數或取鎖次序.
- **分段取鎖**: 先取本表鎖並讀取本表, 本表有改名或刪除(`diffRefTargets` 之 `renames`／`delNames` 非空, **只依本表新舊列判定**,與引用端無關)而須改寫引用端時, 才於內層以 `held:[本表]` 取引用端表鎖; 其後才讀引用端、規劃與預檢、寫入——取齊鎖之後才預檢, 預檢與寫入涵蓋同一版本(外審 A.3: 原稿「預檢後才在 `users` 鎖內重新 `select`」之空檔使新增之 `late` 引用被新名接管). 無改名／刪除之寫入(最常見, 如改描述)只取本表鎖, 不被引用端表鎖擋住(`unit-procCore-updateTabItems` UNIT-UTI-013 之第二段).
- **實測依據**: `pmKeyMutex` 非可重入——巢狀同鍵與相反次序皆死結(D1 `probe-mutex`); 階層一致時巢狀不同鍵完成. `lockSave`(操作者占位,不排隊)仍在最外層, 級聯內層不經 `lockSave`.
- **站點全集**: `rg -n "withTabLocks\(" server`(`procCore.mjs` 兩處:本表、引用端; `WWebPerm.mjs` 兩處:同);`rg -n "\bkmx\(" server` 只有 `keyCheck.mjs`(`withTabLocks` 內)一處. 判準: 已套; 不得直接 `kmx(`.
- **測試**: `unit-keyCheck` SITE-KC-007;`unit-procCore-refCascade`(鎖族:次序與輸入順序無關、`held` 守門、例外後釋放、相反輸入順序不死結、四表隨機併發 ≥ 50 輪、分段取鎖〔無改名／刪除不被引用端鎖擋住、有則擋〕).
- **〔perm-run01 更新, R-LOCK-CORE-01〕** `withTabLocks(lockTabs, keyTables, fn, held = [])` 第 1 參改為 **w-serv-orm 實例之 `withTabLocks(tableNames, fn)`**：階層排序、去重、`held` 守門（違反拋 `tab lock order violation`）與「由外而內巢狀、每層一次一張表」不變, 每層取鎖改為 `lockTabs([t], inner)`; **不使用核心之多表一次宣告**（其碼元序與階層序不同, 混用成環）. 站點全集: `rg -n "withTabLocks\(" server` ＝ `procCore.mjs` 引用端 1 ＋ `WWebPerm.mjs` 本表 1、引用端 1 ＋ `keyCheck.mjs` 定義; 本表鎖在 `procCore` 由 `guardWrite` 取. `lockSave`（操作者占位）仍在最外層. 測試: `unit-keyCheck` KC-LK-001～005（階層、去重、`held`、失敗後釋放、與 `guardWrite` 共鎖）、`unit-procCore-refCascade` 鎖族（取鎖軌跡改記表名、`traceLock` 同時包 `withTabLocks` 與 `guardWrite`）.
- **〔perm-run02 更新, R-LOCK-CORE-01 規則 2a〕** 上列站點全集之 `procCore.mjs` 由「引用端 1」改為「被引用表 1＋引用端 1」: 客戶端 `opt` 帶 `subject`／`refs` 時, `updateTabItems` 於 `lockSave` 之內、本表 `guardWrite` 之外層先以 `withTabLocks(lockTabs, [refTarget.table], …)` 取**被引用表**鎖（不帶 `held`, 為最外層; 被引用表由伺服端依 `keyTable` 自組）並新鮮讀取, 供主體身分與正向引用身分驗證; 階層仍為 `targets → pemis → grups → users`（被引用者階層恆低於本表, 本表之引用端又高於本表, 同一方向不成環）. 不帶宣告者不取此鎖. 驗證: `unit-procCore-identity` IDN-501／503／510／520（取鎖軌跡、連帶改名階層、並發、四表隨機 60 輪不死結）、`unit-procCore-refCascade` RW-551a（`withTabLocks(` 呼叫數 1 → 2）. 規則見 `rulebook_concurrent.md` 之 R-SUBJECT-ID-01 規則 4、R-REF-IDENTITY-01.
