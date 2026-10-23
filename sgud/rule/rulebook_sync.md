# 規則帳本:名稱唯一、引用連帶與外部同步

本檔為 `sgud/rule/rulebook.md` 之分冊(2026-10-22 主控依使用者指示自原 312KB 之帳本依類型分拆;節之標題與內容不變).索引與其他分冊見 `rulebook.md`.

## 名稱唯一與對應鍵檢查(F-02／F-14; ADR-034; 2026-10-21 run04 子任務 BC)

使用者 2026-10-21 核可之兩項(主責簡報「任務 BC」). 兩者共同點: 授權以**名稱字串**(`grups.name`／`pemis.name`)或**使用者對應鍵**(`mappingBy` 指定之 `id`／`email`／`name`)查找, 查找鍵不唯一時「取哪一筆」成為隱性授權決定. 純函數集中於 `server/keyCheck.mjs`(單一擁有者, 站點只呼叫不複製).

### R-NAME-UNIQ-01 外部同步: grups／pemis 之 name 不得重複(批內／他 from)

軸: 表(`grups`／`pemis` 以 `name`; `targets` 之 `id` 為主鍵本就唯一; `users` 之 name 允許重複, 不在範圍) × 入口(外部同步／後台整表寫入／資料通道〔只開 select〕) × 名稱形狀(唯一／批內重複／他 from 已用／同 from 已用／歷史既有重複／空／非字串／僅大小寫或空白不同).

- **規則**: `syncAndReplaceTabs` 於 `kmx` 內、「名稱須非空字串」(R-SYNC-NAME-01)之後、`delAll` 之前: ①本批 rows 內 `name` 精確 `===` 重複 → `invalidRows`(srLog `reason:'nameDuplicate'`, 帶 `keyTable`／`from`／`row`〔第一個重複列索引〕／`field:'name'`); ②該表既有列中 `from` **不等於**本 `from` 者已使用此 `name` → `invalidRows`(`reason:'nameOtherFrom'`); **同 `from` 之既有列不算衝突**(隨後 `delAll` 重寫). 外部應用只收固定語系鍵 `invalidRows`(R-ORM-02, 不外送引擎原文). 比對為**精確 `===`**(與伺服端 `arrFinder` 一致; 不做大小寫／空白正規化——正規化後比對會與實際授權查找的鍵不一致, 反而放行伺服端視為不同的名稱, 見 ADR-034).
- **根因**: 授權以名稱字串為鍵(`users.cgrups`／`grups.cpemis` 為名稱→模式之映射), 伺服端 `arrFinder` 取**第一個**同名列; 同名列並存時授權取決於表列順序(`getUserRules` 的結果隨資料庫列序而變). 後台 `ckKey` 早已拒絕同名, 外部同步入口不拒(ADR-031 決定 4 明載「不比照 ckKey 之重複偵測」), 兩入口不對稱.
- 站點全集(2026-10-21): 寫入 `grups`／`pemis` 之入口僅二——`/syncAndReplaceTabs`(`WWebPerm.mjs:syncAndReplaceTabs`)與 kpFunExt 之 `updateGrups`／`updatePemis`(`procCore.mjs:updateTabItems`); 資料通道 `methodsExec: ['select']`(ADR-026), 裸寫入不可達.
- 盤點指令: `rg -n "woItems(\.|\[)(grups|pemis|keyTable)|procOrm\(" server --glob "*.mjs"` 之寫入類命中(`delAll`／`insert`／`save`／`del`)須只在上列兩個函數內; `rg -n "methodsExec" server/WWebPerm.mjs` 須為 `['select']`. 可執行版: `unit-keyCheck` SITE-KC-001(同步檢查呼叫位於 `delAll` 之前)、SITE-KC-002(`methodsExec` 只含 select).
- 判準: 已套(同步 `grups`／`pemis`; 後台見 R-NAME-UNIQ-02); 刻意不套(`targets.id` 主鍵; `users.name` 允許重複〔對應鍵為 name 時見 R-MAPKEY-01〕).
- 測試: `unit-keyCheck`(KC-DUP-*、KC-OF-*, 純函數形狀全集)、`api-syncAndReplaceTabs` API-sync-023～026(真後端: 批內重複／他 from／同 from 重送／大小寫與空白變體; 被拒時該 from 與他 from 全列逐位元不變).

### R-NAME-UNIQ-02 後台整表寫入: 以「寫入後名稱集合」驗唯一, 只拒本次造成或觸及之同名; pemis／grups 差異一律以 id 對應(run04 主責補強: 原僅庫內已有同名時才以 id)

軸: 名稱形狀(唯一／本次新增列撞名／本次改名撞名／歷史既有重複原樣送回／歷史重複中一列改名／歷史重複中刪一列／歷史重複中再加一列) × 表(`grups`／`pemis`) × 差異鍵(~~`name`〔ADR-009〕~~／`id`——run04 起 grups／pemis 恆為 `id`: 以 name 為鍵時單次存檔「改名並以舊名新增」「刪舊列以同名新增」「鏈式改名」會回成功卻使庫內與送入不同、留下同名兩列〔D1 設計稿 §1.5 實測, `unit-procCore-nameUniq` NU-040～045 守護〕).

- **規則**: `updateTabItems`(`grups`／`pemis`)——寫入後之名稱集合 ＝ 送入之整表(含他 `from` 之外部同步列, 前端整表送回). ①空／非字串名稱 → `saveRowFieldInvalid`(`ckKey`, 不變); ②名稱重複: 該名稱於送入列出現 ≥ 2 次, 且**不是**「庫內已有同名 ≥ 2 列, 且送入列中該名稱之每一列皆為庫內同 id 同名之既有列, 且筆數不多於庫內」→ `nameDuplicate`(新語系鍵, 於任何寫入之前; 後端 srLog `updateTabItems-ckKey-error` 帶 `msg:'nameDuplicate'`／`row`). 即**歷史既有重複原樣存在不致使所有存檔失敗**(才能在後台修復), 但新增第三個同名列、把他列改成該名、把重複中之一列改成已被他列使用之名稱皆拒. ③庫內任一名稱已有 ≥ 2 列(僅外部同步可造成)時, 差異改以 `id` 對應(`ltdtDiffByKey(…, 'id')`; 缺 `id` 之送入列視為新增): `ltdtDiffByKey` 以 `Map(name → 列)` 對應, 同名兩列會被併成一列——改名其中先出現之一列時, 新名稱之列走 `add` 而其 `id` 已存在, `insert` 對既有主鍵略過, **改名靜默遺失仍回成功**(2026-10-21 `unit-procCore-nameUniq` NU-005 修前實測).
- **根因(證據)**: 見 NU-004／NU-005 修前紅(報告 `tmp/run04/bc/report.md` §修前紅證據). 「歷史重複使所有存檔失敗」另有前端一半: `LayoutContentGrups`／`LayoutContentPemis` 之 `errItemsByName` 標出重複並擋存(`isError`), 本任務**未改前端**(`src/components` 為主責併行修改範圍), 故 UI 層仍須先改名／刪除重複列才能存; 伺服端與 API 直呼已容忍.
- 站點全集: `procCore.mjs:updateTabItems` 之 `ckKey('name')`(僅空值檢查)＋`checkNameUniq`(唯一, 呼叫 `keyCheck.findTouchedDup`)＋差異鍵選擇(run04 起 `if (isNameKeyTable) { … ltdtDiffByKey(ltdtOld, withId, 'id') }` 無條件, 並先以 `findDupIndex(rows, 'id')` 拒送入整表內重複之 id). `users`／`targets` 之 `ckKey('email'／'id')` 不變(`saveRowFieldDuplicate`).
- 盤點指令: `rg -n "ckKey\(|findTouchedDup|hasDupKey" server/procCore.mjs`; 可執行版 `unit-keyCheck` SITE-KC-003(`updateTabItems` 於第一個 `procOrm(` 破壞步驟之前呼叫 `findTouchedDup`).
- 判準: 已套(`grups`／`pemis`); 刻意不套(`users` 以 email 去重〔ADR-009〕、`targets` 以 id).
- 測試: `unit-procCore-nameUniq` NU-001～013(撞名拒收且零寫入／歷史重複原樣送回可存且他列編修生效／歷史重複中改任一列名稱皆生效／刪一列／再加第三列拒收／他列改名併入拒收／缺 id 列／`users`·`targets` 之 `saveRowFieldDuplicate` 不變); `api-updateTabs` API-updateGrups-002／API-updatePemis-002(鍵由 `saveRowFieldDuplicate` 改 `nameDuplicate`).

### R-NAME-UNIQ-03 已存在同名資料之清理: 唯讀稽核工具, 不提供自動刪除

- **規則**: `server/tools/nameDupReport.mjs`(唯讀; 輸入 `{ users, grups, pemis, targets }` 匯出檔)列出 `grups`／`pemis` 同名組(各筆 `id`／`from`／`isActive`／`order`、被哪些 `users.cgrups`／`grups.cpemis` 以該名引用)以及 F-14 之 users 對應鍵空值／重複; 引用解碼用 `src/js/cvKpToArr.mjs`(壞 JSON 容錯, 不拋). 清理一律由管理者於後台改名／刪除並逐一確認授權(**引用以名稱比對, F-07 改名級聯尚未實作**: 改名或刪除其一會使引用該名者全部指向剩下的那一筆或失效), 見 README Upgrade Notes.
- 測試: `unit-nameDupReport`(小型夾具: 同名組、引用解碼含壞 JSON／陣列形式、`--mapping-by` 三態).

### R-MAPKEY-01 外部同步 users: 對應鍵（mappingBy）須非空且唯一（僅 active 列）

軸: `mappingBy`(`id`／`email`／`name`) × users 列形狀(對應鍵 空／空白／非字串／批內重複／他 from 已用／同 from 已用／`isActive` 非 `'y'`).

- **規則**: `syncAndReplaceTabs`(`keyTable==='users'`)於 `delAll` 之前依 `mappingBy` 檢查——`'id'`(預設): **不另檢查**(主鍵, 既有 `idOtherFrom` 已涵蓋跨 from); `'email'`／`'name'`: 每個 `isActive==='y'` 之列, 該欄位須為**非空字串**(判空以 `trim()` 後長度 > 0, 比對唯一時用原值精確 `===`, 與 `getTokenUser` 之 `select({[mappingBy]: v})` 精確比對一致)、且在〔本批 active 列〕∪〔他 `from` 之既有 active 列〕內唯一. 違規整批 `invalidRows`, srLog `reason:'mapKeyInvalid'`(空／非字串)／`'mapKeyDuplicate'`(批內重複)／`'mapKeyOtherFrom'`(他 from 已有), `field: mappingBy`. `isActive!=='y'` 之列不參與(`getTokenUser` 只匹配 active); 同 `from` 之既有列不算衝突.
- **取捨**: 不一律檢查 email——預設 `mappingBy='id'` 之既有部署其 email 可空／可重複, 新規則不應使其外部同步全部失敗; 只有「對應鍵」才是登入查找的鍵, 其唯一性才是安全前提(ADR-034).
- 站點全集: `WWebPerm.mjs:syncAndReplaceTabs`(寫入前檢查)——**後台 `updateUsers` 不檢查 `name`**(`ckKey('email')` 只擋 email; `mappingBy='name'` 時後台可造出同名 active 使用者, 由 R-MAPKEY-02 於登入時擋下, 屬範圍外觀察, 見 ADR-034).
- 盤點指令: `rg -n "mappingBy" server/WWebPerm.mjs`(每個命中須屬: 建構時正規化、`checkSyncKeys` 呼叫、`getTokenUser`); 可執行版 `unit-keyCheck` SITE-KC-004.
- 判準: 已套(`email`／`name`); 刻意不套(`id`; inactive 列).
- 測試: `unit-keyCheck`(KC-MK-*: 三種 `mappingBy` × 空／空白／非字串／批內重複／他 from／同 from／inactive 全集), `api-mapKey`(真後端以 `restartBackend(genTempSettings({ mappingBy }))` 切換設定; MK-001～).

### R-MAPKEY-02 登入查找: 對應鍵命中多筆即拒絕, 不取首筆

- **規則**: `getTokenUser` 以 `select({[mappingBy]: v, isActive:'y'})` 查找 perm users: 0 筆 → `cannotGetUserFromPerm`(不變); 恰 1 筆 → 該列; **多於 1 筆 → `Promise.reject('ambiguousUserFromPerm')`**(新語系鍵), srLog `{ event:'getTokenUser-error', msg:'ambiguousUserFromPerm', mappingBy, count }`——**不記使用者的對應值**(email／name 為個資). 判定單一擁有者 `keyCheck.pickUniqueUser(rs)`(`getGenUserByKV` 亦經之: 多筆回 `null`, 不取首筆).
- 兩條路徑皆經 `getTokenUser`: 登入入口 `api/getUserByToken`／`api/getPerm`(`getAndVerifyClientUser`)與資料通道 `verifyConn`(`p.checkToken` → `getAndVerifyClientUser`); `getAndVerifyAppUser`(`getPermUserInfor`／`syncAndReplaceTabs`)不查 perm users, 不涉及. **前端顯示**: 登入被拒時 `App.vue:loginError` 只轉址至 `urlRedirect`, 不顯示語系鍵文字; 資料通道被拒回傳輸層 `permission denied`; 語系鍵文字僅在 srLog／`/api/getUserByToken` 回傳之 `msg` 可見.
- 站點全集(2026-10-21 `rg -n "users\.select\(" server src`): `getTokenUser`(以 `[mappingBy]` 查, 經 `pickUniqueUser`)、`getGenUserByKV`(以 `id` 查, 經 `pickUniqueUser`)、`procCore.mjs:updateTabItems`(`pickKeysOnly` 之整表 `select()`, 與對應鍵無關)——無其他以 email／name 反查 users 之站點.
- 判準: 已套(兩個反查站點); 刻意不套(`procCore` 整表讀取).
- 測試: `unit-keyCheck` KC-PU-*(0／1／2／3 筆, 不取首筆)、SITE-KC-005(`getTokenUser` 與 `getGenUserByKV` 皆呼叫 `pickUniqueUser`, 不得再有 `get(userFind, 0` 取首筆); `api-mapKey` MK-010／011(真後端: 同步時 `mappingBy='id'` 允許之重複 email, 切換為 `email` 後登入 `ambiguousUserFromPerm`、資料通道 `permission denied`; 移除重複後登入恢復).

### R-WRITE-LOCK-01 外部同步與後台整表寫入對同一張表共用互斥鍵(外審 sol R10; F-02／F-14 之前提; D2 設計稿 (a) 之最小版)

軸: 寫入入口(外部同步 `syncAndReplaceTabs`／後台整表寫入 `updateTabItems`) × 表(`targets`／`pemis`／`grups`／`users`) × 檢查與寫入之間是否可被他方插入.

- **規則**: 兩個入口各自「先檢查名稱／對應鍵唯一、後寫入」, 若取不同的 `kmx` 鍵, 檢查後、寫入前對方已完成寫入, F-02／F-14 之全域唯一性被略過(終態同名兩列, 授權取決於列序; 外審 sol 以確定性閘門重現, 無 sleep). 故兩者對同一張表**必須取同一個鍵**: `server/keyCheck.mjs:tabWriteKey(keyTable)`(= `'tabWrite:' + keyTable`), `WWebPerm.mjs:syncAndReplaceTabs` 與 `procCore.mjs:updateTabItems` 皆 `kmx(tabWriteKey(keyTable), …)`. 不同表不同鍵(並行不變). `pmKeyMutex` 非可重入: 兩條路徑內都不得再取同一個鍵(`syncAndReplaceTabs` 內只呼叫 `procOrm`／`woItems`, 不呼叫 `updateTabItems`). 操作者占位 `lockSave`(ADR-025)仍在 `kmx` 之外層, 與本規則無關.
- 站點全集: `rg -n "kmx\(" server` 兩處(`WWebPerm.mjs`、`procCore.mjs`); `rg -n "pmKeyMutex\(\)" server` 恰一處(`WWebPerm.mjs`, 且 `procCore(...)` 之 `kmx` 引數即該實例; 增量外審 mmd-N2: 兩處鍵字面不變而實例不同時互斥即失效). 判準: 已套(兩處、單一實例); 不得保留各自字面鍵.
- **無逾時(取捨, 增量外審 mmd-N3／sold-R1)**: `pmKeyMutex` 無等待上限, `lockSave` 之占位由 `cacheSt()`(`WWebPerm.mjs`, 未另設 `timeExpire`)預設 TTL 30 分鐘後失效. 同步持鎖期間(`select` + 驗證 + `delAll` + `insert`)後台同表存檔排隊等候, 同步若因 I/O 或資料庫異常不返回, 後台同表存檔將持續等待(呼叫端先逾時不會取消已排隊之寫入, 釋放鎖後仍會寫入). 未加有界等待係刻意(加了須回固定錯誤 key 並決定逾時後是否仍寫入); 待裁示.
- **範圍外(仍待 D2 設計稿 (c0)(c1)(b) 裁示)**: 本規則只解決「兩個伺服端入口之交錯」; 後台以過期快照整表存檔復活/覆蓋他人變更(F-26)、外部列受保護(F-23)皆未做. **〔run07 更新, ADR-037〕** (c0)(c1)(b) 已裁示並實作: 載入基準與兩對話框以存檔當下 store 為底見 R-BASELINE-01, 外部列受保護見 R-EXT-OWN-01; 兩者之守門與比對皆在 `updateTabItems` 之既有表鎖內, 未新增取鎖路徑.
- 測試: `unit-keyCheck` SITE-KC-007(兩處皆 `kmx(tabWriteKey(keyTable)`、WWebPerm.mjs 內 `kmx(` 僅一處以免與此鍵巢狀死結、`pmKeyMutex()` 於 server 內恰一處且 `procCore(` 之 `kmx` 引數為該實例)、`unit-procCore-updateTabItems` UNIT-UTI-013(他方持有 `tabWriteKey('grups')` 期間 `updateGrups` 不寫入、釋放後才完成, 他表不受影響).
- **〔run06 更新, ADR-036〕** 取鎖寫法改為經單一取鎖函數 `withTabLocks`(見 R-WRITE-LOCK-02): 兩處皆 `withTabLocks(kmx, [keyTable], …)`(其內才 `kmx(tabWriteKey(表), …)`), `WWebPerm.mjs`／`procCore.mjs` 不得直接 `kmx(`; 上列「`rg -n "kmx\(" server` 兩處」改為「`rg -n "\bkmx\(" server` 只有 `keyCheck.mjs:withTabLocks` 一處」, SITE-KC-007 與 SITE-UK-001 之字面已同步; 「同一把鍵不巢狀」不變, 另允許**依階層**之不同表鎖巢狀.

### R-WRITE-LOCK-02 表鎖取鎖階層與單一取鎖函數(外審 A.3／A.4; run06, ADR-036; F-23／F-26 之前提)

軸: 持鎖之表集合(單表／被引用表＋引用端表) × 取鎖次序 × 讀取、預檢、寫入是否都在持鎖之內.

- **階層**: 引用鏈序「被引用者先、引用端後」`targets` → `pemis` → `grups` → `users`(`server/keyCheck.mjs:TAB_LOCK_RANK`); 引用端之階層恆高於被引用者. **單一取鎖函數** `withTabLocks(kmx, keyTables, fn, held = [])`: 表名去重並依階層排序後由外而內巢狀取 `kmx(tabWriteKey(表))`; `held` 為呼叫端已持有鎖之表, 內層分段取鎖時 `keyTables` 之階層須全數高於 `held`, 否則拋 `Error('tab lock order violation')`(不嘗試取鎖). 所有需持多把表鎖之路徑(後台整表寫入、外部同步、日後之 F-23 外部列保護／清源／批次入口)**只能經此函數**, 不得自行巢狀 `kmx(`; D1 設計稿(引用鏈序)與 D2 設計稿(字母序 `grups < pemis < targets < users`)之階層衝突(外審 A.4, 兩稿並存會成環)統一為本階層, 下一輪 F-23 沿用. **〔run07 更新〕** F-23／F-26 已沿用: 外部列守門與基準比對皆在 `updateTabItems` 持本表鎖之內(`procCore.mjs` 之 `withTabLocks(kmx, [keyTable]` 之後、引用端分段取鎖之前), 無新增取鎖函數或取鎖次序.
- **分段取鎖**: 先取本表鎖並讀取本表, 本表有改名或刪除(`diffRefTargets` 之 `renames`／`delNames` 非空, **只依本表新舊列判定**,與引用端無關)而須改寫引用端時, 才於內層以 `held:[本表]` 取引用端表鎖; 其後才讀引用端、規劃與預檢、寫入——取齊鎖之後才預檢, 預檢與寫入涵蓋同一版本(外審 A.3: 原稿「預檢後才在 `users` 鎖內重新 `select`」之空檔使新增之 `late` 引用被新名接管). 無改名／刪除之寫入(最常見, 如改描述)只取本表鎖, 不被引用端表鎖擋住(`unit-procCore-updateTabItems` UNIT-UTI-013 之第二段).
- **實測依據**: `pmKeyMutex` 非可重入——巢狀同鍵與相反次序皆死結(D1 `probe-mutex`); 階層一致時巢狀不同鍵完成. `lockSave`(操作者占位,不排隊)仍在最外層, 級聯內層不經 `lockSave`.
- **站點全集**: `rg -n "withTabLocks\(" server`(`procCore.mjs` 兩處:本表、引用端; `WWebPerm.mjs` 兩處:同);`rg -n "\bkmx\(" server` 只有 `keyCheck.mjs`(`withTabLocks` 內)一處. 判準: 已套; 不得直接 `kmx(`.
- **測試**: `unit-keyCheck` SITE-KC-007;`unit-procCore-refCascade`(鎖族:次序與輸入順序無關、`held` 守門、例外後釋放、相反輸入順序不死結、四表隨機併發 ≥ 50 輪、分段取鎖〔無改名／刪除不被引用端鎖擋住、有則擋〕).

## 引用連帶:改名級聯與刪除連帶清理(2026-10-22 run06, ADR-036; 來源: 使用者 2026-10-21「刪除須連帶清理引用」裁示、主控定案 F-07、`R-PRINCIPLE-00` 原則 6、適用表 m／n)

### R-REF-CASCADE-01 引用要跟著改: 群組／權限改名與群組／權限／標的刪除, 於同一次寫入內連帶更新／清理引用(m、n)

軸: 被寫入之表(`grups`／`pemis`／`targets`) × 事件(改名〔同 id 異名〕／刪除〔舊 id 不在新表〕／刪後同名新增／歷史同名只刪其一／互換／鏈式) × 入口(後台整表寫入／外部同步同一 `from` 內) × 引用端字串形狀(物件／陣列／舊式簡寫／壞 JSON／空字串) × 失敗點(引用端寫入／主體 del／insert／save／補償).

- **規則**:
  1. **身分以主鍵 id**(`src/js/refCascade.mjs:diffRefTargets`): 同 id 且名稱皆為字串而不同＝改名(僅 `grups`／`pemis`; 互換與鏈式**同時套用**, 不逐一套用); 舊列 id 不在新表＝刪除(`targets` 之 id 即名稱, 改 id＝刪舊增新, 標的 id 改名之級聯為階段 2, 先收嚴為清理). 刪除之名稱若仍有「同 id 同名」之存續列(歷史同名只刪其一)則**不清理**(引用仍解得出, 授權變寬由刪除前確認框提示, 見 R-AUTH-REF-01); **刪除後以同名新增(新 id)者不繼承引用**(原則 6: 不被同名新資料接管).
  2. **改寫**(`rewriteRefs`): 只動命中之項目; 物件形式仍物件、陣列形式仍陣列(不互轉, 免有損), 值內 `mode`／`isActive`／額外欄位原樣; **未命中者同一字串原樣回傳**(保留註解與排版), 命中者 `JSON.stringify` 重新編碼; 壞 JSON／空字串／純量視為空容器不動(同伺服端 `cvStrToArr` 容錯). 刪除不論 `isActive` 皆移除該項.
  3. **拒絕(收嚴＋提示, 整次拒存、四表零變更, 固定語系鍵)**: `renameCascadeDupGroup`(被改名者屬歷史同名組且該名稱仍被某引用端引用〔含停用項〕——級聯會把原綁「各筆交集」之引用轉給被改名者, 外審 A.1; 無人引用則不擋, 為歷史同名之清理路徑)、`renameCascadeNameInUse`(新名無任何舊實體而仍被**啟用中**引用〔懸空名〕,Q4; 停用之懸空引用不擋, 但容器內相撞見下)、`renameCascadeConflict`(某容器內新名與另一個未被改走／刪除之既有項目相撞,含停用項)、`renameCascadeUnsupported`(命中而須改寫之容器含無法安全重新編碼之內容——JSON5 之 Infinity／NaN 數值經 `JSON.stringify` 會變 null, 作為 `crules` 規則名時改指別的規則 'null' 而改變授權〔外審 sol R2〕; 刪除連帶清理與稽核工具同: 稽核工具列入 `unsafe` 須人工處理). **新增**同名撞懸空名**不拒**(外部先指派、後於後台定義同名群組為合法流程; 引用於定義後生效為預期, 頁面已有 c 之懸空警告圖示).
  4. **失敗回復(外審 A.2; 依原則決定, 見 ADR-036)**: 引用端先寫、主體後寫; 預檢(含引用端改寫列之 `validateRowsBeforeWrite`)於任何寫入之前. 任一步例外 → 以**寫入前整列補償還原引用端**(`server/cascadeWrite.mjs:writeWithCascade`, 以 holdersOld 之整列經 `woItems[引用端].save(pre, { merge: false })` 覆寫〔w-orm-lmdb 選項,其他後端退回合併〕, 使歷史列原無 `userIdUpdate`／`timeUpdate` 者亦逐位元還原〔外審 sol R4〕)後重新拋出原錯誤(**引用端寫入階段之錯誤原文先把 `id[…]` 遮罩為 `id[*]` 才拋出**, 外層 srLog 不得記引用端 id〔外審 sol R5〕); 補償亦失敗 → `saveCascadePartial`＋srLog `refCascade-restore-error`, 以稽核工具處置. **不採「重存即自癒」**(互換／鏈式／批內新增三形狀不成立, 外審 A.2); 重新操作從還原後之一致狀態開始. 主體 `del → insert → save` 之部分寫入為既有 ADR-013 限制, 補償不還原主體(測試如實釘住). 行程於引用端寫入後、主體寫入前崩潰不在補償範圍(記憶體內無日誌), 以稽核工具處置.
  5. **未帶 id 之列與外部同步**(同一 `from` 內): `src/js/refCascade.mjs:fillIdlessIds` 為未帶 id 之列(`grups`／`pemis`; ORM 每次補隨機主鍵,即舊列刪、新列增)補規劃用 id——**依名稱對應** pool 中 id 未被本批帶用之既有列(同名即同一實體,不算刪除再新增; 同名多列依序對應; 名稱不同視為新實體; 規劃用,不改寫入之列),否則 API 直打缺 id 之整表會清空全部引用. 後台整表寫入以該表全部既有列為 pool(`procCore.updateTabItems`), 外部同步以**同一 `from` 之既有列**為 pool(`server/cascadeWrite.mjs:buildSyncRowsNew` 另保留他 `from` 之列原樣). 帶 id 者依 id: 同 id 異名＝改名級聯; 舊 id 不在本批＝刪除並清理. 外部應用只收固定鍵 `invalidRows`／`htmlMarkupNotAllowed`(R-ORM-02), 動態原因入 srLog `reason`. 帶 id 而 id 於外部端不穩定者(每次同步重編流水號)會被判為「舊 id 刪除＋新 id 新增」而清理引用——依使用者「依同一來源內之穩定 id 判定」裁示, 部署須知列於 README Upgrade Notes.
  6. **指派欄屬後台(Q8)**: 級聯可改寫 `from` 為外部之 users 列之 `cgrups`(F-23 Lv1 指派欄後台可寫); 預覽確認框警示「其中 N 位來源為外部應用,下次外部同步時可能被外部資料覆寫」. 寫入以操作者記為更新者(`userIdUpdate`／`timeUpdate`).
  7. **opt**: `opt.cascadeRename`(預設 `true`, `false` 關閉改名級聯及其拒絕; 刪除連帶清理不受此設定影響, 使用者裁示刪除即移除其效果).
  8. **log**: 成功 `refCascade-done`(`keyTable`／`holder`／`nRename`／`nDelName`／`nHolders`／`nRenameHolders`／`nDelHolders`／`nExternal`, **不記個資值與引用端 id**); 預檢被拒 `updateTabItems-refCascade-error`／`syncAndReplaceTabs-error`(帶 `reason`); 補償 `refCascade-restored`(warn)／`refCascade-restore-error`.
- **單一擁有者**: 規劃 `src/js/refCascade.mjs`(`planRefChanges`／`diffRefTargets`／`rewriteRefs`, 純函數, **前端預覽與伺服端計畫同一份**); 寫入 `server/cascadeWrite.mjs`(`checkCascadePlan`／`writeWithCascade`／`buildSyncRowsNew`); 呼叫 `procCore.updateTabItems`、`WWebPerm.syncAndReplaceTabs`; 取鎖見 R-WRITE-LOCK-02.
- **站點全集(盤點指令)**: `rg -n "planRefChanges|diffRefTargets|rewriteRefs" src server`(伺服端只 `procCore.mjs`／`WWebPerm.mjs`／`cascadeWrite.mjs`; 前端為三個清單頁之預覽); `rg -n "JSON\.stringify" src/components/Ve*.vue`(五個編輯對話框自產授權字串,與本規則無關,為既有站點). 引用端字串之伺服端改寫**只經 `rewriteRefs`**, 不得另寫.
- **前端**: 刪除前確認框(群組頁／權限頁)與標的頁儲存前確認框列「將自 N 位使用者／N 個群組(權限)移除此引用; 其中 M 位以 AND 引用者,移除後限制解除、權限可能變多」, 計數沿用 `getDelRefCount`／`countAndRefs`; 群組頁／權限頁儲存時改名預覽確認框; 儲存成功訊息附連帶筆數(預覽值, 以伺服端實際為準, 不另開 RPC).
- **升級**: 既有懸空引用以 `node g_authRefsClean.mjs`(預設只列不改)稽核, 明確加 `--apply` 才寫入(先備份), 效果等同舊版「找不到即忽略」; 殘留之懸空引用維持 c(收嚴＋提示). 見 README Upgrade Notes.
- **測試**: `unit-refCascade`(純函數: 邊界／語意不變式〔以真 `getUserRules` 比對改名前後授權逐位相等〕／變異)、`unit-procCore-refCascade`(伺服端: 改名、刪除、拒絕零變更、逐故障點補償、鎖)、`unit-refAudit`(稽核與清理工具)、`api-refCascade`(真後端: 後台與外部同步)、e2e(語意斷言, 不產標準圖): `e2e-array-form` AF-026～027、AF-036～042, `e2e-targets` E2E-012～013, `e2e-grups`／`e2e-pemis`／`e2e-targets` 之 E2E-005 與 targets E2E-011 依新確認框改流程(刪除連帶清理會遺留給後續案例, 三檔每案前另還原引用端表 users／grups／pemis; 共用輔助見 `test/tools/e2e-setup.mjs` 之 `answerConfirm`／`expectConfirmBox`／`saveConfirmYesAndWaitModal`／`resetDbTables` 等); 變異驗證結果見報告. **儲存後 rowsChange 保護**: 刪除連帶清理使一次儲存更新兩張表, store 先後推播兩次重建清單, `markDataReload` 之 1ms 窗口可能短於 ag-grid 渲染而使儲存鈕殘留(E2E-005-3 間歇失配, run06 e2e 子代理發現), 故群組頁／權限頁於儲存成功至成功訊息框關閉後 300ms 以 `postSaving` 排除 rowsChange. **站點不變式之登記**(新增讀取／寫入站點須同步登記, 否則即紅): `unit-cvKpToObj` SITE-AD-001 登記 `src/js/refCascade.mjs`、`src/js/refAudit.mjs` 各一處 `JSON5.parse`(解碼後依 `cvKpToArr` 同一名稱規則走訪); `unit-authMerge` SITE-AM-003 登記 `src/js/refAudit.mjs`(mode 比對僅 `getEffMode(m) === 'OR'`); `unit-validateRows` SITE-NS-001 登記 `server/cascadeWrite.mjs` 為第三個寫入站點(`checkCascadePlan` 之 `validateRowsBeforeWrite` 先於其寫入呼叫, `writeWithCascade` 另防禦性再驗一次); `unit-keyCheck` SITE-KC-007／`unit-procCore-usersKey` SITE-UK-001 見 R-WRITE-LOCK-02.
- **已知限制**: ①標的 id 改名無級聯(階段 2); ②外部同步「未帶 id 且改名」無從偵測為改名(視為刪除＋新增,清理舊名引用); ③補償不還原主體部分寫入; ④外部 users 列被級聯後, 外部下次同步若不含該 `cgrups`(或含舊名)會覆蓋(F-23 下一輪處理 payload 缺鍵保留後台指派)〔**run07 更新**: payload 缺 `cgrups` 鍵者現保留庫內值(`server/syncKeep.mjs:keepAssignOnMissing`, R-EXT-OWN-01), 含鍵(含舊名)者仍覆蓋〕; ⑤引用端 `users` 之 `userIdUpdate`／`timeUpdate` 變為操作者(稽核可追蹤, 清單「最後更新」會變); ⑥刪除確認框為**預覽語意**: `nRefs` 只算「本次刪除」, 歷史同名分次未儲存刪除、或 `cascadeRename:false` 下有未儲存改名時最後一次刪除可能少計/不警示(儲存時伺服端仍正確清理; 外審 sol 增量 D3, 未修); ⑦`postSaving` 窗口(儲存成功至成功框關閉後 300ms)內使用者的編輯提交會被 rowsChange 排除(人為幾乎不可能, D4); ⑧`rewriteRefs` 重編碼會把 `-0` 變 `0`(授權算法不依賴, D5); ⑨w-serv-orm 自身於寫入失敗時 `console.log` 失敗列 id／錯誤原文(套件既有行為, 非 srLog; D2, 建議向 w-serv-orm 提 issue); ⑩編輯器對限制項(mode 缺/非法)重選 AND 視為未改而寫回原值, 無法由編輯器轉為合法 AND(第三格放寬之代價, minimax R2).

## 外部列受保護與過期快照基準(2026-10-22 run07, ADR-037; 來源: 使用者 2026-10-21「以外部同步為主」裁示、主控依原則定案 F-23／F-26〔`C:\opensrcOper\dnow\20261021095534\主控依原則定案-F07-F23.md`〕、`R-PRINCIPLE-00` 原則 3／5 與適用表 k、l)

### R-EXT-OWN-01 外部列守門: 後台整表寫入不得改動外部列之身分／結構欄, 單一擁有者 `src/js/externalRows.mjs`(l)

軸: 表(`targets`／`pemis`／`grups`／`users`) × 列類別(外部列〔`from` 為非空字串〕／後台列〔`''`、缺欄、`null`／數字／布林〕) × 動作(新增／改身分結構欄／改指派欄／改 `from`／改 `order`／刪除) × `opt.lockExternalRows`(`'y'` 預設／`'n'`) × 基準(有／無) × 入口(後台整表寫入／`modeEditUsers='for:grups'` 之 `pickKeysOnly`／外部同步／離線工具).

- **規則**:
  1. **判別(D1)**: `isExternalRow(row)`＝`from` 為非空字串. 外部同步入口只收非空字串 `from`(`parsePayload`: `invalidFromInPayload`), 故 `''` 可證非外部同步、非字串必為後台寫入; 不採宣告式白名單(未宣告來源 fail-open). 種子 users `teamA`→`''`(`g_initialData.mjs`、`src/schema/tables/users.mjs`).
  2. **強制點唯一**: `server/procCore.mjs:updateTabItems`(四表共用), 於表鎖內、任何寫入之前, 次序(run11 後): select → [有基準]`checkBaseline`(R-BASELINE-01, 表級) → [lock]`restoreExternalOrder` → … → `ltdtDiffByKey` → [lock]`dropServerOnlyDiff` → [lock]`restoreServerFields`(改動之外部列改帶庫內伺服器管理欄, run11 外審 sol 第 3 點) → `checkExternalWrite` → [無基準且外部列有 diff]`saveBaselineRequired` → `validateRowsBeforeWrite` → 引用連帶 → 寫入. **基準先於外部列守門**(草稿過期時應回「請重新載入」而非誤導之「外部列不可修改」, run07 U1 觀察 1).
  3. **`checkExternalWrite` 判準**(違規整次拒收、零寫入、不靜默忽略; 回第一個違規之鍵, `reason` 只入 srLog):

| 動作 | `lockExternalRows:'y'` | `'n'` | 鍵／reason |
|---|---|---|---|
| 新增列 `from` 為非字串(缺欄視 `''`) | 拒 | 拒 | `saveFromNotAllowed`／`fromType` |
| 新增列 `from` 為非空字串(含複製繼承、復活他來源之列、手打) | 拒 | 放行 | `saveFromNotAllowed`／`addFrom` |
| 刪除外部列 | 拒 | 放行 | `saveExternalRowChanged`／`del` |
| 改外部列之 `from` | 拒 | 放行 | `saveExternalRowChanged`／`fromChanged` |
| 改外部列之鎖定欄(schema 欄位扣除 `id`、`from`、`order`、指派欄、伺服器管理欄; `getLockFields`) | 拒 | 放行 | `saveExternalRowChanged`／`fieldChanged` |
| 後台列改成非空 `from` | 拒 | 放行 | `saveFromNotAllowed`／`fromChanged` |
| 既有列之 `from` 改為非字串且異於庫內值(歷史 `null` 原樣送回不拒) | 拒 | 拒 | `saveFromNotAllowed`／`fromType` |
| 改外部列之指派欄(`users.cgrups`／`grups.cpemis`／`pemis.crules`; targets 無) | 放行, 但無基準→`saveBaselineRequired` | 放行 | 外審 B.2, 依原則 3 收嚴 |
| 外部列之 `order`／僅伺服器管理欄(`userId`／`timeCreate`／`userIdUpdate`／`timeUpdate`)不同 | 不比對: `order` 還原庫內值(`restoreExternalOrder`)、僅管理欄不同視為無變更(`dropServerOnlyDiff`); 內容有改動(指派欄)之外部列改帶庫內管理欄寫入, 持舊草稿不回退較新之建立者／時間(`restoreServerFields`, run11) | 不處理 | 外部擁有順序、免舊快照回退建立者／時間(S2) |

  4. **用戶端 opt 只採 `baseline`**: `procCore.pickClientOpt`、`WWebPerm.kpFunExt` 之四個 `updateXxx(userId, rows, opt)` 不採納 `pickKeysOnly`／`lockExternalRows`／`cascadeRename` 等任何其他鍵(`pickKeysOnly` 由伺服端 `modeEditUsers` 決定).
  5. **log／鍵**: 語系鍵 `saveFromNotAllowed`／`saveExternalRowChanged`／`saveStale`／`saveBaselineRequired`(eng＋cht, `server/procLang.mjs`; 新鍵須先入 procLang, 否則被 `toOutKey` 轉成 `saveWriteFail`); srLog 事件 `updateTabItems-external-error`／`updateTabItems-stale-error` 只記鍵、reason、筆數、來源名稱(`froms` 至多 5 個), **不記列 id 與個資**.
  6. **外部同步**(`WWebPerm.syncAndReplaceTabs`; 外部同步本身是外部列之擁有者, 不受上列守門, 其守門鏈〔ADR-008／028／034〕不變): users 列缺 `cgrups` 鍵時保留庫內同一 `from` 對應列之值(`server/syncKeep.mjs:keepAssignOnMissing`: 先依 `id`, 無 `id` 者於 `mappingBy` 為 `email`／`name` 時依該欄位須恰命中 1 筆, 對不到不保留; 含鍵〔含 `''`〕以外部為準); **〔run08 更新, 主控依原則 3、5 定案: 三個指派欄同為後台可寫〕`grups` 列缺 `cpemis` 鍵、`pemis` 列缺 `crules` 鍵者亦保留庫內同一 `from` 同一實體之值**(`server/syncKeep.mjs:keepAssignByEntity`; 群組／權限無登入對應鍵, 實體身分依 `id`: 有 `id` 者依 `id` 對到庫內同一 `from` 之列、對不到＝新實體 `''`; 無 `id` 者〔ORM 補隨機主鍵〕依名稱, 與 `refCascade.fillIdlessIds` 同口徑——庫內同一 `from` 中 `id` 未被本批帶用、名稱 `===` 相同者須恰 1 筆, 同名多筆不取首筆; 含鍵〔含 `''`〕以外部為準; 保留值須通過 `validateRowsBeforeWrite`〔不過者不保留, `reason: notKeepable`〕; **改名收嚴〔依原則 3〕**: 同 `id` 異名且 `cascadeRename` 為假〔引用不跟著改, 名稱即授權身分〕→ 不保留、`reason: identityConflict`, `cascadeRename` 預設真時改名後保留〔引用由級聯改寫, 同一實體〕, **但新舊名稱有一方非字串〔歷史資料, 缺欄視 `''`, 同 `refCascade.entName`〕時級聯無從處理, 亦不保留〔外審 sol #1: 否則舊列之指派會帶給原指向新名之懸空引用者〕**; users 無 `id` 而對應鍵命中同來源多筆時不取首筆、不保留並計入 `nConflict`〔`mapKeyConflict` warn, 外審 sol #3〕; 不保留者記 srLog warn `syncAndReplaceTabs-keepAssign-skip`〔只記表、來源、欄位、筆數、原因, 不含值〕; 保留成功記 info `syncAndReplaceTabs-keepAssign`); 營運後果〔主控 run08 裁示接受〕: 對應鍵〔users 之 email／name〕變更而缺 `cgrups` 鍵時後台指派被清空並記 warn; 同一 `from` 同批 `grups`／`pemis`「同名異 id」(`countIdRenumber`)記 srLog warn `syncAndReplaceTabs-idRenumber`(只記表、來源、筆數)並登錄 `getWebInfor().syncWarns`(`[{ keyTable, from, n, time }]`, 記憶體, 重啟即清, 同(表, 來源)後一次同步無此情形即清除).
  7. **前端**(只提示與協助, 強制者為伺服端; 沒有外部列、沒有警示時畫面／DOM 與修前逐字相同, 既有標準圖 0 張改變): 四清單頁 `from` 欄一律唯讀、外部列身分欄逐列唯讀(`editable` 為函式 `(params) => !isExternalRow(params.data)`, 僅 `isLockExternal`〔`webInfor.lockExternalRows === 'y'`〕時)、users 之 `isAdmin`／`isActive` 核選方塊 `disabled`、首欄鎖頭(`mdiLock`)、橫幅(`data-fmid="<表>-banner-ext|warn"`)、`deleteItemsCheck` 以 `splitCheckedRows` 過濾外部列並警告、`copyItem` 重置 `from=''`(不論是否啟用保護)、名稱撞外部列之提示(`nameUsedByExternal`)、送出前 `getExternalEdits` 守門(貼上缺口之配套).
  8. **離線工具**(後台不得刪外部列＋ADR-008 禁以空 rows 清源 ⇒ 須有逃生口; **〔run08〕執行核心在 `server/tools/`〔npm 會出貨〕, 見 R-SHIP-TOOLS-01**): `g_fixFromType.mjs`(預設只列非字串 `from`; `--apply` 正規化為 `''`, 先備份、寫後回驗)、`g_purgeFrom.mjs`(預設只列 (表, from) 筆數; `--table <t|all> --from <來源>` 為 dry-run; `--apply` 才寫: 先備份、引用端先寫後刪列、同一次清理引用〔`refCascade.planRefChanges`〕、寫後回驗; `--from ''` 拒絕; 不認領; 資料庫被占用即拒絕〔`checkDbNotInUse`, 僅 Windows 可偵測〕).
- **單一擁有者**: 判別／鎖定欄／守門／order 還原／僅管理欄不同／指派欄 diff 判定 `src/js/externalRows.mjs`(前後端共用); 同步保留與警示計數 `server/syncKeep.mjs`; 前端輔助(橫幅、刪除過濾、`getExternalEdits`、`fmtVars`) `src/js/externalUi.mjs`; 名稱撞外部提示 `src/js/getNameErrs.mjs`(`dupExternal`); 離線稽核／規劃 `src/js/fromAudit.mjs`、執行 `server/tools/fromTools.mjs`(run08 自 `test/tools/` 搬出, R-SHIP-TOOLS-01); 缺指派欄鍵保留 `server/syncKeep.mjs` 之 `keepAssignOnMissing`(users)／`keepAssignByEntity`(grups／pemis, run08).
- **判準與站點全集**(2026-10-22 實測; 已套／未套／刻意不套):

| 站點 | 判準 | 狀態 |
|---|---|---|
| `procCore.updateTabItems` | 上列次序; 於 `withTabLocks(kmx, [keyTable]` 之內 | 已套(唯一強制點) |
| `WWebPerm.kpFunExt` 四個 `updateXxx` | 只採納 `baseline`(`updateUsers` 另依 `modeEditUsers` 加 `pickKeysOnly:['cgrups']`) | 已套 |
| `WWebPerm.syncAndReplaceTabs` | 守門鏈不變; 另套缺指派欄鍵保留(users.cgrups／grups.cpemis〔run08〕／pemis.crules〔run08〕: `keyAssign`＋`markHasKey`＋`keepAssignOnMissing`／`keepAssignByEntity`)、同名異 id 警示 | 守門: 刻意不套(外部擁有者); 保留／警示: 已套(三個指派欄) |
| 資料通道(`methodsExec:['select']`) | 不可寫 | 刻意不套(ADR-026) |
| 四清單頁(`LayoutContent{Targets,Pemis,Grups,Users}.vue`) | `from` 欄唯讀、逐列 `editable` 函式、鎖頭／橫幅、刪除過濾、`copyItem` 重置、`getExternalEdits`、撞外部提示; users 另 `isAdmin`／`isActive` `disabled` | 已套(4／4) |
| 兩個反向關聯對話框(`VeGrupBlngUsers`／`VePemiBlngGrups`) | 外部列之歸屬(指派)可改(Lv1), 附基準; 不新增／刪除列 | 逐列唯讀: 刻意不套(指派欄後台可寫) |
| 三個直接編輯器(`VeCgrups`／`VeCpemis`／`VeCrules`) | 只編指派欄, 結果回填清單頁再隨清單頁存檔 | 刻意不套(同上) |
| `modeEditUsers='for:grups'` 之 `pickKeysOnly` 路徑 | 以資料庫為底只採 `cgrups`; 外部使用者身分欄之變更**靜默忽略**(不拒收, 資料不寫入, 既有設計; `unit-procCore-external` EXT-G05); 改外部使用者 `cgrups` 仍須基準(EXT-G01／G02) | 刻意不套拒收 |
| 離線 `g_fixFromType.mjs`／`g_purgeFrom.mjs`／測試框架 `purgeExternalRows` | 不經 `updateTabItems`; 前者為唯一合法清源路徑, 後者僅供測試收尾(`woItems.delAll`) | 刻意不套 |

- **盤點指令(可重跑; 期望為 2026-10-22 實測, 失配即本節須維護)**:

```
rg -n "checkExternalWrite\(|checkBaseline\(|hasExternalDiff\(|dropServerOnlyDiff\(|restoreExternalOrder\(" server src
# 期望: 呼叫只在 server/procCore.mjs, 各一處(restoreExternalOrder 215／dropServerOnlyDiff 280／checkBaseline 283／checkExternalWrite 289／hasExternalDiff 294); 其餘為 src/js/externalRows.mjs、rowDigest.mjs 之定義與 externalUi.mjs:12 之註解
rg -c "isExternalRow" server src
# 期望: server 無命中; src: LayoutContentGrups 3／Pemis 3／Users 3／Targets 4／js/externalUi 5／js/externalRows 11／js/fromAudit 5／js/getNameErrs 3
rg -n "'from': true" src/components
# 期望: 0(from 欄一律唯讀; 修前四頁皆有)
rg -n "r\.from = ''" src/components
# 期望: 4 處(Grups 1032／Pemis 1033／Targets 846／Users 1091), 皆在 copyItem 內 let r = cloneDeep(row) 之後
rg -n "pickClientOpt|optClient" server
# 期望: procCore.mjs 之 pickClientOpt 定義與三處 updateTargets／Pemis／Grups 呼叫; WWebPerm.mjs 之 updateUsers 以 optClient 只取 baseline
```

- **測試**: `unit-externalRows`(EX-S1～S7、EX-CELLS)、`unit-procCore-external`(A～O、SITE-EX-001～012、EXT-CELLS; 含 EXT-G05 `pickKeysOnly` 靜默忽略)、`unit-syncKeep`(SK-S1～S4)、`unit-syncKeepEntity`(KE-S1～S6、KE-CELLS 62 格; run08 grups.cpemis／pemis.crules 缺鍵保留的純函數＋站點靜態斷言)、`unit-shipTools`(ST-001～005; 離線工具出貨完整性與入口判斷, R-SHIP-TOOLS-01)、`unit-externalUi`(EU-1～4、SITE-EU-001～008)、`unit-fromAudit`、`unit-getNameErrs`(外部撞名提示)、`api-externalRows`(真後端; A 預設設定〔含 run08 之 EX-021 id 對應／含鍵／新實體／他分區／log、EX-021b 無 id 依名稱、EX-021c 改名〕、B／C `mappingBy`、D `lockExternalRows=n`、E `null` from、F `cascadeRename=false`〔run08 EX-021d 不保留＋warn〕)、既有 `api-*` 之夾具改寫; **變異驗證**(主控彙整, 本帳本撰寫時未重跑): U1 96 個(95 紅、1 等價)、U1b 22／22、API 39＋11、UI1 58／58、UI2 22／22、TOOLS 45／45(＋1 對照).
- **已知限制**: ①w-aggrid-vue 貼上路徑對函式型 `editable` 恆為真(`WAggridVue.vue` 之 `kpEditable` 以真值判斷), Ctrl+V 可寫入逐列唯讀之儲存格, 前端 `getExternalEdits` 與伺服端兜底(不構成繞過), 根治待向上游提 issue; ②`syncWarns` 非即時(連線時取一次 `getWebInfor`); ③〔run08 已解決〕`grups.cpemis`／`pemis.crules` 外部缺鍵原仍清空, 現比照 `users.cgrups` 保留(見規則 6); 仍有之邊界: 外部給了新 `id`(id 重編)而同名舊列之 `id` 不在本批者視為新實體而不保留(已由 `syncAndReplaceTabs-idRenumber` 警示與 `syncWarns` 橫幅提示, 見 README), 同 `id` 改名而 `cascadeRename:false` 不保留並記 warn; ④後台管理者無法停用或刪除外部使用者(C-3 政策; `isActive`／`isAdmin` 屬身分欄), 緊急停用走來源端或離線 purge, 不提供本地覆蓋; ⑤前端以 `webInfor.lockExternalRows` 判斷逐列唯讀, 舊伺服端無此鍵視為未啟用(新伺服端仍強制); ⑥〔run08 已解決〕離線工具原依賴 `test/tools/`(`.npmignore` 排除 `test`), 現核心已搬至 `server/tools/`(R-SHIP-TOOLS-01); 唯 `test/tools/authMergeReport.mjs`(建於測試夾具與黃金資料)仍不出貨, README 註明自原始碼 checkout 執行; ⑦既有 e2e 夾具待改寫見〈已知缺口／待辦〉⑥.

### R-SHIP-TOOLS-01 離線維運工具之核心須在 npm 會出貨之位置, 不得依賴 `test/`(2026-10-22 run08; 主控定案 3: 發布後須能自安裝後之套件路徑執行)

- **規則**: 部署端可能要執行的離線工具(`g_fixFromType.mjs`／`g_purgeFrom.mjs`／`g_authRefsClean.mjs` 與其核心 `server/tools/{fromTools,authRefsClean,authRefsAudit,nameDupReport,isMain}.mjs`)之相對 import 閉包內每個檔案都必須在 `npm pack` 之出貨清單內; 核心不得放在 `test/`(`.npmignore` 排除 `test`、`spec`、`CLAUDE*.md`). 純函數在 `src/js/`、執行核心在 `server/tools/`, 單元測試自 `../server/tools/` 引用(不留重複實作).
- **範圍界線**: 只搬「只依賴 `src/js`／套件依賴」者. `test/tools/authMergeReport.mjs` 依賴 `authMerge.mjs`(`src/plugins/mShare.mjs` 之模型與黃金資料)與 `authMergeStats.mjs`, 為測試夾具之一部分, **不搬、不出貨**(README 註明自原始碼 checkout 執行).
- **執行方式(README 同步)**: 工作目錄＝部署端專案根, 以 `node node_modules/w-web-perm/g_<name>.mjs` 執行; 資料夾 `./db`(`g_getSettings.mjs` 之 `dbUrl`)與備份檔皆為 cwd 相對; `--db <資料夾>` 覆寫(資料夾須已存在, 不憑空建庫); `w-orm-lmdb`／`w-serv-orm`／`wsemi` 由安裝後之套件位置向上解析.
- **CLI 入口判斷(外審 sol #5)**: 離線稽核 CLI(`authRefsAudit.mjs`／`nameDupReport.mjs`)以 `server/tools/isMain.mjs` 判斷是否為入口——套件經 symlink／junction 安裝(npm link、pnpm、workspaces)時 node 以真實路徑載入入口而 `process.argv[1]` 維持命令列路徑, 字串比對會使 CLI 靜默不執行; 兩邊取 `realpath` 再比對.
- **備份保真(外審 sol #2)**: `authRefsClean.runClean` 與 `fromTools.backupBefore` 共用 `fromTools.isJsonLossy`(JSON 往返須嚴格相等), 備份(JSON)不保真者於任何備份與寫入前中止(stage `backupFidelity`).
- **守護測試**: `unit-shipTools`(ST-001 出貨清單含 8 個工具檔〔含 `isMain.mjs`〕與其所需之 `g_getSettings`／`g_mOrm`／`src/js/{refAudit,fromAudit,cvKpToArr}`; ST-002 出貨清單不含 `test/`、`spec/`、`CLAUDE*.md` 且 `test/tools/` 不留四個舊檔; ST-003 五個入口之相對 import 閉包皆在出貨清單內且閉包內無無法靜態解析之載入〔非字面 `import()`、`require`、`createRequire`〕; ST-004 掃描器負向對照; ST-005a／b `isMain` 與以 junction 安裝時兩個 CLI 仍有輸出); `unit-fromAudit` FA-190(工具不得匯入 `server/` 之後端模組, 僅 `server/tools/` 例外, 且 `server/tools/*` 不得匯入 `../x.mjs`).
- **盤點指令(可重跑)**:

```
rg -n "test/tools|from '\./test|from '\.\./test" g_*.mjs server src
# 期望: 0(出貨碼不得引用 test/)
npm pack --dry-run --json  (輸出於新版 npm 為以套件名為鍵之物件; unit-shipTools 已兩種形狀皆處理)
# 期望: files 含 server/tools/ 四檔與 g_authRefsClean／g_purgeFrom／g_fixFromType; 無 test/ 開頭之路徑(2026-10-22 實測 195 項, 其中 test/ 0 項)
```

- **已知限制**: ①`建議w-web-perm修正.md`(主控之建議書, 位於 repo 根且未被 `.npmignore` 排除)在 `npm pack` 清單內, 發布前由主控處理(本輪不動建議書); ②`test/tools/authMergeReport.mjs` 不出貨(見上); ③三個 `g_*.mjs` 只檢查 `<db>/wperm` 資料夾存在, 資料夾存在但為空時 ORM 仍會建立空表並報告零筆(外審 sol #6, 以空 `wperm` 夾實測屬實; 既有行為, 本輪只把 README 改為不誇稱「不建立空庫」, 未改程式).

### R-BASELINE-01 載入基準: 基準於草稿建立時綁定、伺服端以表級(整表雜湊)比對、先動先贏; 單一擁有者 `src/js/rowDigest.mjs`(k; 2026-10-22 run11 依使用者裁示原則 7 由逐列改為表級)

軸: 基準綁定時機(開啟編輯〔建草稿〕／存檔當下) × 站點(四清單頁 `rebuildDraft`／兩對話框 `show()`) × 表內差異類別(列內容異／基準之列已不在／多出基準沒有之列／僅 `order`／僅伺服器管理欄) × 有無基準 × 列類別(後台列／外部列) × 本次是否寫入該列(表級下無關).

- **規則**:
  1. **基準**＝草稿所依據之**整表**之逐列內容指紋 `[[id, digest]]`(只含主鍵為字串之列; 格式: 陣列, 每項為兩個字串之陣列, `isBaselineValid`; 同 id 不得出現兩次). `rowDigest(row, keys)`＝`cyrb53(JSON.stringify([依 schema 序之各欄值, 缺欄為 null]))` 轉 base36; **欄位為 schema 欄位扣除 `order` 與伺服器管理欄**(`userId`／`timeCreate`／`userIdUpdate`／`timeUpdate`). **「系統自動變更之欄位」之判定(run11, 使用者授權依各表實際系統行為判定; 四表同一口徑)**: ①伺服器管理欄: 外部同步每次重寫使整來源每列之建立者／時間皆變, 內容未變者不得使草稿作廢(完成條件 2); ②`order`: 儲存依送入列序重給後台列 `order`(ADR-009, `k+1`)、外部列 `order` 由外部擁有(R-EXT-OWN-01 規則 3 末列), 庫內 `order` 與位置不一致時(外部列之 `order` 與後台列交錯)任一存檔即重編他列 `order`, 納入雜湊則無內容變更之存檔會誤擋他人; 故排除. 代價: 他人只拖曳排序(只改 `order`)後, 持舊畫面存檔不被拒, 順序以後者為準. `from`、users 之 `isAdmin／isActive` 屬內容. `keys` 為 `ds[keyTable].keys`.
  2. **綁定時機(外審 B.1, 決定性)**: 於建立編輯草稿之同處由「草稿所依據之整表」計算並綁定(清單頁於 `rebuildDraft`, 對話框於 `show()`), **存檔函式內不得重新計算**; 各存檔流程於開頭(與 `rows` 同一刻、任何 `await` 之前)以 `cloneDeep(vo.baseline)` 擷取副本並以區域變數持有; 對話框之 `saveUsers`／`saveGrups` 以參數取基準, 不讀 `vo.baseline`. 清單頁有未存編輯時推播**不更新**基準(R-DRAFT-KEEP-01).
  3. **伺服端判準(表級; `checkBaseline({ keys, ltdtOld, baseline })`, 表鎖內, `updateTabItems` 於 `select` 之後之第一個檢查)**: `compareBaseline` 逐 id 比庫內整表與基準——任一列指紋不同(`rowChanged`)、基準之列已不在庫內(`rowRemoved`)、庫內多出基準沒有之列(`rowAdded`)即整次拒收 `saveStale`(零寫入, 提示重新載入; reason 依序取第一個成立者, n 為差異列總數; srLog 事件 `updateTabItems-stale-error` 只記 reason 與筆數, 不記列 id 與值), **與該列是否為本次將寫入者無關**(不部分變更、不上鎖, 先動先贏). 不快取雜湊(離線工具直接寫 LMDB, 快取會 fail-open). run07 之 `diffStale／delStale／addExisted`、「修改列內容同庫內不檢查」「未異動列不檢查」「新增列 id 在基準內才算復活」皆取消.
  4. **無基準**(依原則 3 收嚴, 外審 B.2): 後台列維持舊行為(最後寫入者勝, ADR-013; 自寫客戶端不破壞); **修改外部列之指派欄**拒收 `saveBaselineRequired`. 基準格式不合 → `saveRowFieldInvalid`(reason `baselineInvalid`), 於任何讀寫之前. 強制所有寫入必帶基準(`requireBaseline`)下版再議. 舊版(run07)客戶端送出之基準本就是整表, 故自動得到表級行為.
  5. **兩個反向關聯對話框(c0)**: 開框時另記各列歸屬狀態(`makeRowStates`), 存檔時送出之整表＝存檔當下 store 快照之全部列, 只有使用者有變更之列(`getChangedIdx`)才以 `putRefEntry` 只改本項, 其餘列為快照同一物件原樣帶回(`src/js/relDialogSend.mjs:buildRowsSend`); 無法證明未變更者視為有變更. 表級下開框後表內任何變動即過期(須關閉重開, E2E-012／013／020／021), 原樣帶回仍使「成功路徑(重新開框後)」不刪他人新增之列.
- **單一擁有者**: `src/js/rowDigest.mjs`(`rowDigest`／`makeBaseline`／`isBaselineValid`／`compareBaseline`／`isBaselineStale`／`checkBaseline`, 前後端同一份); 對話框整表組裝 `src/js/relDialogSend.mjs`; 前端草稿處置 `src/js/draftSync.mjs`(R-DRAFT-KEEP-01).
- **站點全集**(2026-10-22 run11 實測, 6／6 已套):

| # | 元件 | 綁定點(`makeBaseline`) | 送出點(`$fapi.update*(…, { baseline })`) |
|---|---|---|---|
| 1 | `LayoutContentTargets.vue` | `rebuildDraft`(647) | `doSaveTargets` → `updateTargets(rowsSend, { baseline })`(1070) |
| 2 | `LayoutContentPemis.vue` | `rebuildDraft`(766) | `doSavePemis` → `updatePemis`(1500) |
| 3 | `LayoutContentGrups.vue` | `rebuildDraft`(766) | `doSaveGrups` → `updateGrups`(1498) |
| 4 | `LayoutContentUsers.vue` | `rebuildDraft`(757) | `doSaveUsers` → `updateUsers`(1405) |
| 5 | `VeGrupBlngUsers.vue` | `show()`(1307) | `saveUsers` → `updateUsers`(1048) |
| 6 | `VePemiBlngGrups.vue` | `show()`(1301) | `saveGrups` → `updateGrups`(1044) |

- **盤點指令(可重跑; 期望為 2026-10-22 run11 實測)**:

```
rg -n "makeBaseline\(" src
# 期望: src/js/rowDigest.mjs 定義 1 + 6 站點(上表綁定點); 存檔函式(doSave*／saveUsers／saveGrups)內 0
rg -n "vo\.baseline" src/components
# 期望: 賦值 6 處(rebuildDraft×4／show×2); 讀取只有 `let baseline = cloneDeep(vo.baseline)` 6 處(Grups 1438／Pemis 1440／Targets 1006／Users 1379／VeGrupBlngUsers 1109／VePemiBlngGrups 1105); 另 keep 分支之 `isDraftStale({ ..., baseline: vo.baseline })` 與對話框 watch 各取讀; 其餘為註解
rg -n "\$fapi\.update(Targets|Pemis|Grups|Users)\(" src
# 期望: 恰 6 處(上表送出點), 皆帶第 2 參 { baseline }
rg -n "checkBaseline\(" server src
# 期望: server/procCore.mjs 1 處呼叫(updateTabItems 內 select 之後); src/js/rowDigest.mjs 定義
```

- **測試**: `unit-rowDigest`(RD-S4 表級: 整表情境 11×4 表、逐欄 17、order／伺服器欄／重排不使過期 10、隨機 400 預言、isBaselineStale／前後端同判準、229 案)、`unit-procCore-external`(C 過期快照情境、D 舊客戶端、J 基準格式、M 並行與鎖內比對、O 基準先於守門〔EXT-O01 等已改寫為表級: 他人新增 X 即 rowAdded, 重新載入後成功〕、SITE-EX-003／007 次序)、`unit-relDialogs-baseline`(RB-SRV-002／003／009／101／103 已改寫: 他人改別列或增列亦 saveStale, 重新開框後成功)、`unit-draftSync`(新: R-DRAFT-KEEP-01)、`unit-getAddImpact` SITE-AI-003、`unit-externalUi` SITE-EU-007／008、`api-externalRows`(真後端; EX-006b／007b／007d／050／050b／051／053／054／015 已改寫)、`e2e-external-rows`(E2E-011～013 對話框、E2E-016～019 四清單頁、E2E-020／021 對話框提示、E2E-022 內容未變之外部同步不擋、E2E-023 無草稿照舊重建、E2E-024 語系切換後表頭仍更新).
- **已知限制**: ①誤拒面(使用者 2026-10-22 裁示接受): 他人或外部同步對同表任何一列之內容改動、列之增刪, 皆使持舊畫面之存檔被拒, 須重新載入再編; ②他人只改 `order`(拖曳排序)不使存檔被拒, 順序以後者為準; ③未帶基準之客戶端對後台列不受保護; ④儲存成功後至推播重建前再存之窗口(ADR-025 Consequences): 新增列由 `saveNewRowExists` 先擋之前, 表級基準先比對, 自己剛寫入之列即使基準過期回 `saveStale`(依控制流讀碼; 成功訊息框為停留 modal, 推播多已先到; 無專屬測試、未實跑); ⑤指紋為 53 位元非密碼學雜湊, 用途為一致性比對而非安全邊界; ⑥外部端不帶 `id` 之列每次同步取得新隨機主鍵, 列集合改變即使開著之舊畫面過期(須保持 `id` 穩定); ⑦S10 已解(run11, R-DRAFT-KEEP-01: 有未存編輯時推播不丟棄草稿).

### R-DRAFT-KEEP-01 有未存編輯時收到推播: 保留草稿與其載入時之基準, 提示「資料已被更新」, 不得靜默丟棄(使用者裁示原則 7; 2026-10-22 run11; 單一擁有者 `src/js/draftSync.mjs`)

軸: 站點(四清單頁／兩反向關聯對話框) × 觸發(首次載入／使用者切換編輯模式／store 變新／store 未變而旗標切換) × 有無未存編輯 × 表內容是否已異於基準(內容／列增刪／僅 order 與伺服器管理欄) × 使用者動作(存檔／按「重新載入」).

- **規則**:
  1. **清單頁**(`LayoutContent{Targets,Pemis,Grups,Users}.vue`): computed `changeParams` 以 `planDraftSync({ first, editChanged, storeChanged, hasDraft })` 決定: 首次、編輯模式被使用者切換、或按「重新載入」(`syncTick` 遞增)→ `rebuild`(放棄草稿, 同修改前); store(本表, 群組頁另含使用者表、權限頁另含群組表之顯示來源)未變(重算由其他反應式依賴觸發, 如語系切換使 `genOpt` 之依賴變動)→ `rebuild`(同修改前, 表頭等隨之更新; 未存編輯旗標切換不觸發重算: `changeParams` 以非響應式鏡像 `syncMark.dirty` 讀取); store 變新且無未存編輯 → `rebuild`(同修改前, 他人變更即時可見); store 變新且有未存編輯(`vo.isModified`)→ `keep`: **不重建 `items`／`opt`／`baseline`／`baseRows`**, 只以 `isDraftStale` 更新 `staleNotice`(本表整表內容已異於基準才為真; 僅 `order`／伺服器管理欄不同、外部同步內容未變者為假).
  2. `hasDraft` 以函數惰性傳入, 僅於 store 變新時才讀取 `isModified`(computed 不因旗標切換而在 store 未變時依賴它); `keep` 時**不更新** `syncMark`, 使存檔成功(`isModified` 歸零)後之重算能依最新 store 重建.
  3. `rebuildDraft` 一律: 以同一份來源列產生 `items` 與 `baseline`、記 `baseRows`、`isModified=false`、`staleNotice=false`、更新 `syncMark`、再 `genOpt`. 存檔前之預覽(`getSavePreview／getAddImpact／getDelImpact／reuseDeletedIds`)與外部列守門(`getExternalEdits`)以 `baseRows`(草稿所依據之列)為「舊」, 不用已變新之 store.
  4. **提示 UI**: 橫幅 `data-fmid="<表>-banner-stale"`(以 `v-for` 渲染, 無提示不渲染任何節點; 淡橘底沿用 `getBannerStyle('warn')`、警告圖示、文字 `staleDraftNotice`)與「重新載入」鈕(`<表>-banner-stale-reload`, `@click="reloadDraft"`: 放棄草稿; **`reloadDraft` 只遞增響應式 `syncTick`, 由 `changeParams` 重算並於 computed 內重建**, 使 `genOpt` 讀取之反應式來源〔語系等〕的依賴重新收集——keep 期間 `changeParams` 不呼叫 `genOpt`, 依賴已收縮, 若在 computed 外直接 `rebuildDraft`, 重新載入後再切換語系表頭將停留舊值〔外審 sol 第 4 點; e2e E2E-025〕); 鈕樣式 `.staleReloadBtn`(`#fff` 底、hover `#f2f2f2`、邊線 `#ddd`、文字 `#444`). 存檔被拒之訊息仍為 `saveStale`(文字不改).
  5. **對話框**(`VeGrupBlngUsers／VePemiBlngGrups`): 不隨推播重建(`show()` 綁定); watch 該表(整表以新陣列取代即觸發): 開啟中、可編輯、`isModified` 且 `isDraftStale` 為真才閂鎖 `staleNotice`(提示 `data-fmid="grup-blng-users-banner-stale"／"pemi-blng-grups-banner-stale"`, 文字 `staleDraftNoticeDialog`), 每次 `show()` 歸零; **自己存檔所致之推播不提示**: watcher 守門含 `vo.ownSaving`(存檔 API 呼叫前設真、失敗時歸零、`show()` 歸零; 否則成功訊息框顯示期間自己之寫入被判成他人更新, 在 e2e-rela-user-grup E2E-005／010 等既有標準圖多出提示列). 推播先於任何編輯者維持原行為(靜默, 存檔時由伺服端拒收; E2E-011／013 既有標準圖不變).
  6. **直接指派編輯器之回填比對整表**(外審 sol 第 1 點; `LayoutContent{Users,Grups,Pemis}.vue` 之 `showVeCgrupsById／showVeCpemisById／showVeCrulesById`): 開窗前記下整表基準 `baseline0 = cloneDeep(vo.baseline)`, 回填前以 `isDraftStale({ keys, rows: vo.baseRows, baseline: baseline0 })` 比對「草稿現所依據之那份表」與開框時之基準, 有異即放棄回填並提示 `saveStale`(取代 run07 只比被編輯列指紋之寫法: 父頁無未存編輯時他人改了別列, 推播會重建 items 與基準, 舊寫法放行回填並以新基準存檔而繞過整表比對). 父頁已有未存編輯時推播只保留草稿與其基準(`baseRows` 不變), 此比對不誤擋, 存檔時由伺服端拒收.
  7. **名稱(／email)唯一檢查以草稿所依據之列為「舊」**(外審 sol 第 6 點): 三頁 `getNameErrs(opt.rows, vo.baseRows, …)`, 不用可能已被推播更新之 store(歷史同名且載入後他人改名時, 保留草稿不被誤判為「本次造成之重複」而在送出前被擋, 應走 `saveStale` 重新載入處置).
  8. **改動之外部列改帶庫內之伺服器管理欄**(外審 sol 第 3 點; 伺服端 `restoreServerFields`, 見 R-EXT-OWN-01): 保留草稿期間外部同步重寫了該外部列(內容未變、建立者／時間較新), 草稿仍持舊值; 改其指派欄存檔時, 基準(排除管理欄)通過, 若原樣寫入會把較新之建立者／建立時間回退為舊值.
  9. **自己存檔進行中所致之推播不是他人更新(run12)**: 清單頁存檔請求送出前設非響應式 `saveMark.saving = true`(`created` 建立; changeParams 不依賴它), 回應〔成功或失敗〕一到(`.then`／`.catch`)與 `finally` 歸零; `planDraftSync({ …, saving: () => vo.saveMark.saving === true })` 於「store 變新且有未存編輯」且 `saving` 為真時回 `'keepQuiet'`(保留草稿與基準, **不更新** `staleNotice`; 惰性求值, 僅確定要保留草稿時才呼叫 `saving`)。成功: `isModified` 歸零 → watch 重建(提示歸零, 同修改前); 失敗(含 `saveStale` 被拒): `.catch` 內立即依目前 store 重算 `staleNotice = isDraftStale({ keys, rows: vo.<表>, baseline: vo.syncMark.baseline })`, 使請求進行中被安靜保留之真正他人更新不被漏掉。兩對話框早有同義之 `ownSaving`(規則 5)。修正前此情境於回應抵達前短暫顯示橫幅(回應抵達後被重建清除; 全頁 loading 遮罩下), 見 e2e-external-rows E2E-028～030。
- **站點全集**(6／6): 四清單頁(`changeParams`／`rebuildDraft`／`reloadDraft`／橫幅／`.staleReloadBtn`)與兩對話框(watch／`staleNotice`／提示)皆已套; `unit-draftSync` DS-4a～4m 以靜態斷言守護、DS-5 以原始碼取出 watcher 動態執行.
- **盤點指令(可重跑)**:

```
rg -n "planDraftSync\(" src
# 期望: src/js/draftSync.mjs 定義 1 + 四清單頁 changeParams 各 1
rg -n "rowsOld: vo\.(targets|pemis|grups|users)\b" src/components
# 期望: 0(存檔前預覽與外部列守門以 vo.baseRows 為舊)
rg -n "staleNotice" src/components -c
# 期望: 四清單頁各 5 處以上(data／rebuildDraft／changeParams／v-for), 兩對話框各 4 處以上
```

- **測試**: `unit-draftSync`(refsChanged 5、planDraftSync 決策表 16＋惰性 3、isDraftStale 4 表×7、站點 DS-4a～4n 共 46、對話框 watcher 動態 DS-5 共 22、格數核對, 122 案)、`e2e-external-rows` E2E-016(使用者頁: 同列; 草稿保留、橫幅、存檔被拒、重新載入、再存成功; 標準圖 1 張／語系)、E2E-017(群組頁: 外部同步改別列)、E2E-018(權限頁: 他人新增列)、E2E-019(標的頁: 他人刪除列)、E2E-020(使用者對話框; 標準圖 1 張／語系)、E2E-021(群組對話框)、E2E-022(外部同步內容未變: 無橫幅、存檔成功)、E2E-023(無草稿: 照舊重建)、E2E-024(語系切換後表頭仍更新: 其他反應式依賴觸發之重算維持重建)、E2E-025(保留草稿並按「重新載入」後再切換語系, 表頭仍更新)、E2E-026(直接指派編輯器開著、他人改別列後回填被放棄; 對照無他人變更時回填成功); 另 `unit-sitesStale` SITE-ST-R1(表級回填比對)、`unit-externalRows` EX-047～053 與 `unit-procCore-external` EXT-E03／E04、SITE-EX-005(`restoreServerFields`).
- **已知限制**: ①保留草稿期間「所屬使用者／所屬群組」等取自他表之顯示欄不隨推播更新; ②~~`isModified` 偶有殘留(既有 `markDataReload` 窗口缺口)時, 一次無實質草稿之推播會被當成有草稿而顯示橫幅~~ **已消除(run12, R-RELOAD-GUARD-01)**: 根因為 `markDataReload` 之重疊重載(一次儲存使兩張表先後推播, 第 1 次重建之解除計時器在第 2 次重建之 rowsChange 事件之前把旗標解除, `isModified` 被誤設為真), 現旗標只由最後一次呼叫所排之計時器解除; 另「自己存檔進行中所致之推播」不再被當成他人更新(規則 9); ③對話框之提示僅於推播當下有未存編輯時出現(見規則 5); ④保留草稿(keep)之重算不呼叫 `genOpt`(重呼叫會重建 opt 而打斷進行中之儲存格編輯、清空列勾選), 故該次重算後 computed 之依賴收縮至 store 與編輯模式: 保留草稿期間切換語系不會更新表頭文字, 按「重新載入」(E2E-025)或存檔成功後恢復(無草稿時語系切換仍重建, 見 E2E-024).

### R-RELOAD-GUARD-01 程式端重載旗標(`systemProcing`)只由最後一次 `markDataReload` 所排之計時器解除; 單一擁有者 `src/plugins/dataReloadGuard.mjs`(2026-10-23 run12; AF-037 不穩定失敗之根因)

軸: 站點(四清單頁; 兩對話框不隨推播重建, 不適用) × 重載次數(1 次／重疊 2 次／重疊 3 次) × 推播相對於自己存檔之時刻(T1 確認框期間／T2 請求進行中〔回應前〕／T3 回應後至成功框關閉＋300ms〔Pemis／Grups 另有 `postSaving`〕／T4 之後任意晚) × 重建之 rowsChange 事件落點(旗標有效期間內／已解除後)。

- **規則**:
  1. 清單頁 `genOpt` 於 `vo.opt = opt` 前呼叫 `vo.$ui.markDataReload(vo)`(= `dataReloadGuard.markDataReload`): 旗標 `systemProcing` 設真, 於 `$nextTick` 後再過 1ms 解除; rowsChange 守門讀 `vo.systemProcing`(ag-grid 之 `rowDataUpdated` 於同一輪更新中以 `setTimeout(0)` 排程, 先於該 1ms 計時器觸發)。
  2. **旗標只由最後一次呼叫所排之計時器解除**: 每次呼叫遞增該元件之序號(`WeakMap<vm, seq>`), 計時器觸發時序號已非自己者不動旗標。理由: 重載可重疊——一次儲存使兩張表先後推播(權限改名連帶更新群組之引用端: grups 與 pemis 相隔約 17ms), 清單頁重建兩次, 渲染本身可超過此數; 舊實作每次呼叫各排一個無條件解除之計時器, 第 1 次之計時器在第 2 次重建之 rowsChange 事件之前觸發並把旗標解除, 該事件被當成使用者編輯, `isModified` 變真、儲存成功後儲存鈕殘留(並使其後之推播被當成「有未存編輯」而走保留草稿分支、顯示過期橫幅)。
  3. 不得在四頁或他處另行寫入 `systemProcing`(僅 `data()` 宣告與守門核心)。
- **實測證據(2026-10-23)**: 帶觀測預載(`spec/evidence/run12/probe-patch.mjs`, 不改產品碼; 失敗時序見同夾 `probe-11.log`、結果 `probe-result-11.txt`、修後 `fixA-result-31.txt`)連跑 AF-037 10 次, 9 次失敗(基準線未觀測時 6 次中 2 次); 失敗時序一致: 儲存回應後 `postSaving` 於 +300ms 解除, 之後 grups、pemis 兩張表推播相隔約 17ms 重建兩次, 第二次重建時 `systemProcing` 仍為真(第 1 次之計時器未到), 隨即被第 1 次之計時器解除, 再有 `isModified false → true`(`staleNotice` 全程為假, 與「保留草稿分支」無關)。修正後同條件連跑 10 次(20 案)全過。
- **站點全集**(4／4 清單頁): Targets／Pemis／Grups／Users 之 `genOpt` 各 1 處 `vo.$ui.markDataReload(vo)`, rowsChange 守門皆讀 `vo.systemProcing`; Pemis／Grups 另有 `postSaving`(儲存成功至成功框關閉後 300ms 排除 rowsChange; ADR-036)——Targets／Users 無此旗標(既有行為不改, 刻意不套): 旗標窗口修正後已涵蓋重疊重載, `postSaving` 之 300ms 緩衝是對同一缺陷之補丁式緩解, 不擴散到另兩頁。
- **盤點指令(可重跑)**:

```
rg -n "markDataReload" src
# 期望: mUI.mjs 匯入並匯出各 1; dataReloadGuard.mjs 定義 1; 四清單頁 genOpt 各 1 處 vo.$ui.markDataReload(vo)
rg -n "systemProcing\s*=" src
# 期望: 僅 src/plugins/dataReloadGuard.mjs 兩處(= true／= false); 四頁 data() 之宣告為 systemProcing: false,(冒號形式)
```

- **測試**: `unit-dataReloadGuard`(RG-1 單次、RG-2 AF-037 之重疊次序、RG-W 舊實作見證〔舊實作於 RG-2 次序旗標被提早解除〕、RG-3 n=2／3 呼叫之全部事件排列〔10／280 種, 每個前綴旗標＝「最近一次呼叫之計時器尚未觸發」〕、RG-W2 舊實作於全排列之違反見證、RG-3b 排列數解析核對、RG-4 實例互不影響、RG-5 真實計時器、SITE-RG-001／002 站點靜態)、`e2e-external-rows` E2E-027(自己存檔之推播待結果框關閉後放行兩筆相隔不到 20ms: 儲存鈕不得殘留)、`e2e-array-form` AF-037(權限改名連帶, 原失敗案例; 連跑 20 次)。變異: 還原舊計時器邏輯 → E2E-027 紅(見報告)。
- **已知限制**: ①單次重載之 rowsChange 仍倚賴「ag-grid 事件早於 1ms 計時器」之排程次序(同一輪更新中先登記者先觸發; 實測 14ms 餘裕, 帶觀測預載放大渲染時間後 20 案仍全過), 非協定保證; 若 w-aggrid-vue／ag-grid 改變事件派發時機須重驗(E2E-027 與 AF-037 為回歸守護); ②「自己儲存成功後至推播抵達前再編輯再存」(R-BASELINE-01 已知限制 ④)之窗口本輪未改, 見 state.md。

## 外部匯入(原則 11;2026-10-22 主控依使用者裁示寫入)

### R-IMPORT-01 外部匯入:本系統只提供匯入管道,依外部自訂之來源鍵差異同步

- **規格(真理源)**:`C:\opensrcOper\dspec\外部匯入之定義與機制.md`;上位原則 `C:\opensrcOper\sgud\proc\process_principle.md` 第 11 條.
- **規則**:
  - 入口 `POST /syncAndReplaceTabs?keyTable=&token=`.
    - 可匯入之表:targets、pemis、grups、users.
    - app 權杖須具 `syncAndReplaceTabs` 權限.
  - 本文 `{ from, rows }`,`rows`＝該 `from` 之完整清單.
    - 每列帶外部自訂之來源鍵 `srcKey`,於 `from` 內唯一且穩定.
    - 內部 `id` 由本系統產生.
  - 於表鎖內(R-WRITE-LOCK-01/02)以 `srcKey` 比對庫內該 `from`:
    - 新增:配新 `id`.
    - 刪除:引用連帶(R-REF-CASCADE-01).
    - 修改:保留 `id`;改名之引用跟著改.
    - 不變:不寫.
    - 不再 `delAll`＋`insert`.
  - **欄位歸屬**:
    - 外部可選:指派欄 `users.cgrups`、`grups.cpemis`、`pemis.crules`.沿用 F-23、`syncKeep.mjs`:有帶鍵才寫,缺鍵保留.
    - 外部擁有:其餘外部提供之欄位.
    - 本系統擁有:系統欄位.
  - **整批驗證**:
    - 既有驗證保留,移入整批驗證:R-SYNC-01、R-NAME-UNIQ-01、R-MAPKEY-01、R-SYNC-NAME-01.
    - 缺/空/重複 `srcKey`、觸及他 `from`、空批次 → 拒收、零寫入.
  - **改用 `srcKey` 後之連帶**:
    - 「同名異 id 之重編偵測」與「未帶 id 依名稱對應」失去必要,屆時評估移除.
    - users 之 `mappingBy='id'` 登入對應改對 `srcKey`(待設計).
  - 回 `{ nAdd, nUpdate, nDel, nSame }`.
  - **相容**(主控建議,待使用者確認):
    - 現行 major 以 `id` 代替 `srcKey`.
    - 兩者皆無者沿用現行並記警告.
    - 下一 major `srcKey` 必填.
- **刪除防護**:本條為預期功能;未完成之匯入程式與外部端輔助 `provideTabs` 不是死碼,不得以「無引用」刪除(opensrcOper 帳本 G8).
- **狀態:部分**.
  - 已有:入口、權杖、表鎖、整批驗證、引用連帶、失敗補償.
  - **未做**:`srcKey` 差異同步.現為 `delAll({ from })`＋insert(`server/WWebPerm.mjs` 約 866-867),未帶 id 者每次換新 id.
  - 排程:perm 改用 w-serv-orm 共用核心之輪.
- **驗收**:規格第 10 節 I1–I14.
- 盤點:`git grep -nE "srcKey|delAll\(\{ from" -- server`(完成後 `srcKey` 有比對、`delAll({ from` 0 筆).
