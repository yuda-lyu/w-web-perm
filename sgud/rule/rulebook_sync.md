# 規則帳本:名稱唯一、引用連帶與外部匯入

本檔為 `sgud/rule/rulebook.md` 之分冊(2026-10-22 主控依使用者指示自原 312KB 之帳本依類型分拆; 2026-10-23 perm-run01 再將 `rulebook_sync.md`〔73KB〕依類型拆為四冊, 節(###)之標題與內容不變, 依規則編號 `R-…` 查找者請用 `rulebook.md` 之索引).

## 分拆索引(2026-10-23 perm-run01)

| 規則 | 所在分冊 |
|---|---|
| R-NAME-UNIQ-01／02／03、R-MAPKEY-01／02／04、R-REF-CASCADE-01、R-IMPORT-01 | 本冊 `rulebook_sync.md` |
| R-WRITE-LOCK-01／02(表鎖取鎖階層) | `rulebook_sync_lock.md` |
| R-EXT-OWN-01(外部列守門)、R-SHIP-TOOLS-01(離線維運工具出貨) | `rulebook_sync_external.md` |
| R-BASELINE-01(載入基準)、R-DRAFT-KEEP-01(草稿保留)、R-RELOAD-GUARD-01(程式端重載旗標) | `rulebook_sync_baseline.md` |
| 多人同時編輯之落地規則(perm-run01 新增: 寫入契約、鎖共用、存檔回傳列、對話框主體身分等) | `rulebook_concurrent.md` |

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

### R-MAPKEY-04 users 登入對應 `mappingBy='id'`: 外部列對 `srcKey`、後台列對 `id`, 撞值於匯入／後台存檔／登入三處皆拒(O1; perm-run04, 2026-10-24; ADR-038 Update)

> **perm-run05 修訂(2026-10-24, 主控收件裁示①②③)**: 本節規則 2～4 之「只計有效列」「他來源外部列不在匯入端拒收」及下表標 **[05 改]** 之列已被 **R-MAPKEY-05**(跨全表、不論 isActive、含他來源; `getPermUserInfor` 同口徑)取代, **以 R-MAPKEY-05 為準**; 其餘(O1 登入識別值定義、歷史撞值不擋之原則、檢查位置、固定錯誤鍵、`email`／`name` 不變)沿用.

來源: 規格 `C:\opensrcOper\dspec\外部匯入之定義與機制.md` 第 9 節末(主控 2026-10-24 對 perm-run03 待裁示 1 採 O1; 不採「新增 `mappingBy='srcKey'`」〔O3〕, 因升版後以 `id` 模式部署者新匯入之使用者將靜默無法登入); 上位 R-PRINCIPLE-00 原則 3(衝突收嚴＋提示)、4(所有入口一致).

軸: 入口(外部匯入／後台存檔／登入) × 列形狀(後台列〔from 空〕有效／停用、外部列〔from 非空〕有效／停用、遷移前舊外部列〔無 srcKey〕、他 from 外部列同 srcKey) × 被觸及者(批次列／新增或停用改啟用之後台列／歷史既有未觸及) × `mappingBy`(`id`〔含省略與不合法值〕／`email`／`name`).

- **規則**:
  1. **登入識別值** `keyCheck.loginIdOf(row)`: 後台列(from 空)＝`id`; 外部列(from 非空)＝`srcKey`(其 `id` 是本系統配發之內部主鍵,**不是登入識別**); 遷移前之舊外部列(無 `srcKey`)暫以 `id`(同升版前,首次匯入補上 `srcKey` 後即改以 `srcKey`; 否則升版後至首次推送前所有舊外部使用者無法登入). 判斷**僅對 `mappingBy` 為 `id`**(含省略與不合法值); `email`／`name` 不變(從不看 `srcKey`).
  2. **登入查找** `keyCheck.findLoginUsers(woItems.users, mappingBy, vSelf)`(`getTokenUser` 唯一呼叫點): `id` 模式以兩次帶條件之 `select`(`{id}`、`{srcKey}`; **[05 改]** perm-run05 起不帶 `isActive`〔不論有效與否計筆〕,不做全表讀取)合併去重後以 `loginIdOf` 複判——**多於 1 筆〔不論有效與否〕`ambiguousUserFromPerm`(不取首筆)**、恰 1 筆有效登入、恰 1 筆停用或 0 筆 `cannotGetUserFromPerm`(見 R-MAPKEY-05); ORM 讀取失敗原樣拋出. 登入回的是 perm 內之列(`id` 為內部 id),`getUserIdByToken`／稽核欄位／`requireAdmin` 皆用該內部 id.
  3. **撞值** `keyCheck.findLoginIdClashDetail(rowsAfter, isTouched)`(`findLoginIdClash` 為其索引版): 外部列之 `srcKey` 等於後台列之 `id`〔kind `adminId`〕**[05 改]** 或他來源外部列之 `srcKey`〔kind `otherFrom`〕, 不論 `isActive`(perm-run04 原為「只有有效列參與」; 見 R-MAPKEY-05). 只擋「被本次觸及」者. **匯入批次**(`syncCore.mjs`,於配對／寫入之前,表鎖內新鮮讀取之「他 from 之列＋本批」上判斷,本批列皆視為被觸及,同 R-MAPKEY-01 批次全列參與): 撞值 → 整批 `loginIdCollision`、零寫入,srLog `syncAndReplaceTabs-error`(reason `srcKeyIsAdminId`〔對後台列〕／`srcKeyOtherFrom`〔對他來源外部列; 05 新增〕、`from`、`row`、`field:'srcKey'`). **後台存檔**(`procCore.updateTabItems`,位於**外部列守門〔`checkExternalWrite`〕與基準檢查之後、寫入前驗證〔`validateRowsBeforeWrite`〕之前**——不改變 perm-run03 既有拒收之優先序: 例如 `saveNewRowExists`、`saveExternalRowChanged`、`saveBaselineRequired` 皆先於撞值檢查; `guardWrite` 表鎖內): 被觸及＝新增之列、或**登入識別(類別〔後台／外部＋來源 `from`〕＋值〔`loginIdOf`〕)與庫內不同之列**〔**[05 改]** 停用改啟用不算被觸及: 登入識別未變; 簽章含來源，外部列換 `from` 即被觸及〕(外審 sol#2: `lockExternalRows` 為假時後台可改 `from`,外部列改為後台列即換了登入識別而可能撞到他列; 外部列守門啟用時 `from`／`srcKey` 不可改,由 `checkExternalWrite` 另拒); 撞值 → 整次 `loginIdCollision`、零變更,srLog `updateTabItems-ckKey-error`(`key:'id'`、reason `adminIdIsSrcKey`／`srcKeyOtherFrom`〔05 新增〕、`row`). **歷史既有(未被觸及)撞值不擋**(否則已有歷史資料之庫無法在後台修復; 同 R-MAPKEY-03): 原樣送回、`pickKeysOnly` 群組指派、刪除其中一列皆可存. 兩處 log 皆不記 `id`／`srcKey` 之值.
  4. **不在匯入端拒收**: 批次 `srcKey` 等於他來源外部列之內部 `id`(有 `srcKey` 者; 內部 id 不是登入識別). **[05 改]** 原載「他來源外部列彼此同 `srcKey` 不在匯入端拒收、登入時才拒」已**不成立**: 主控 2026-10-24 裁示①(不同外部系統之使用者 id 碰撞常見而非同一人)改為匯入端整批拒收 `loginIdCollision`(見 R-MAPKEY-05); 遷移前舊外部列(無 `srcKey`)以 `id` 為登入識別而參與比對(裁示③).
  5. 固定錯誤鍵 `loginIdCollision`(`procLang.mjs`,eng／cht,不含佔位符、不回顯值); 前端不知 `mappingBy`(伺服端選項),後台存檔被拒時以伺服端回的鍵經 `showCheckYes` 顯示.
- **輸入空間表(36 格,逐格對應測試; 外審 sol 補 33～36)**:

| # | 入口 | 情境(對向列〔既有〕／被觸及列) | 結果 | 測試 |
|---|---|---|---|---|
| 1 | 匯入 | 批次列有效 srcKey＝有效後台列 id | 拒 `loginIdCollision`、零寫入 | SC-L1、MI-005 |
| 2 | 匯入 | 批次列停用 srcKey＝有效後台列 id | **[05 改]** 拒 `loginIdCollision`、零寫入(原: 過) | SC-L4 |
| 3 | 匯入 | 批次列有效 srcKey＝停用後台列 id | **[05 改]** 拒(原: 過) | SC-L4(後半) |
| 4 | 匯入 | 同列由停用重送為有效(後台列有效) | **[05 改]** 首次停用推送即已拒(見 2), 無「放行後轉有效」之狀態 | SC-L4 |
| 5 | 匯入 | `mappingBy` 為 email／name,srcKey＝後台 id | 過(不變) | SC-L5、MI-008 |
| 6 | 匯入 | srcKey＝他來源外部列之內部 id 或其 srcKey | 內部 id(該列有 srcKey): 過(內部 id 不是登入識別); **[05 改]** 其 srcKey: 拒 `loginIdCollision`(含該列停用; 原: 過、登入時 2 筆才拒) | SC-L3、MI-011 |
| 7 | 匯入 | 遷移(舊外部列,srcKey＝舊 id) | 過、nUpdate=1、id 不變 | SC-L6、MI-003 |
| 8 | 匯入 | 歷史撞值存在,批次含該 srcKey | 拒(批次全列參與)；不含該列之批次過(該歷史列依差異同步刪除) | SC-L10 |
| 9 | 匯入 | 其他表(grups／pemis)srcKey＝後台 id | 不適用、過 | SC-L7 |
| 10 | 匯入 | 多列批次僅一列撞值 | 整批拒、其餘列亦不寫 | SC-L2、MI-005 |
| 11 | 後台存檔 | 新增有效後台列 id＝有效外部列 srcKey | 拒、零變更 | UL-001、MI-006 |
| 12 | 後台存檔 | 新增停用後台列 id＝有效外部列 srcKey | **[05 改]** 拒(原: 過) | UL-003、MI-009 |
| 13 | 後台存檔 | 歷史撞值之後台停用列改啟用,id＝有效外部列 srcKey | **[05 改]** 過: 停用改啟用不改登入識別, 不算被觸及(原: 拒; 登入時照拒) | UL-004 |
| 14 | 後台存檔 | 同上但外部列亦停用 | 過(同 13) | UL-004 |
| 15 | 後台存檔 | 新增有效後台列 id＝停用外部列 srcKey | **[05 改]** 拒(原: 過) | UL-005、MI-016 |
| 16 | 後台存檔 | 歷史撞值原樣送回／群組指派／刪其一 | 過(可修復) | UL-006、MI-007 |
| 17 | 後台存檔 | 歷史撞值存在,另新增撞另一外部列 | 拒(不被歷史遮蔽) | UL-007 |
| 18 | 後台存檔 | `mappingBy` 為 email／name | 過(不變) | UL-002 |
| 19 | 後台存檔 | 多列僅一列撞值 | 整次拒、零寫入 | UL-008 |
| 20 | 後台存檔 | 新增列缺 id(ORM 補隨機主鍵) | 過(無從比對) | UL-010 |
| 21 | 登入 | 後台列 id＝token id | 1 筆、登入 | LI-010、MI-004 |
| 22 | 登入 | 外部列 srcKey＝token id | 1 筆、登入(回內部 id 之列) | LI-011、MI-001 |
| 23 | 登入 | 外部列內部 id＝token id、srcKey 不同 | 0 筆 `cannotGetUserFromPerm` | LI-011、MI-002 |
| 24 | 登入 | 遷移後外部列(srcKey＝id) | 1 筆(去重) | LI-012、MI-003 |
| 25 | 登入 | 遷移前舊外部列(無 srcKey) | 暫以 id、1 筆 | LI-013、MI-003 |
| 26 | 登入 | 停用列 | 恰 1 筆且停用 → 視同查無 `cannotGetUserFromPerm`; **[05 改]** 與他列同值(不論他列有效與否)→ 2 筆 `ambiguousUserFromPerm` | LI-014、LI-016b、MI-009、MI-012 |
| 27 | 登入 | 後台 id 與外部 srcKey 同時符合(歷史資料) | 2 筆 `ambiguousUserFromPerm` | LI-015、MI-007 |
| 28 | 登入 | 兩來源外部列同 srcKey(歷史資料) | 2 筆 `ambiguousUserFromPerm`(匯入端 **[05 改]** 已拒收, 見 6) | LI-016 |
| 29 | 登入 | 外部列內部 id＝另一外部列 srcKey | 只符合 srcKey 那列 | LI-017 |
| 30 | 登入 | `mappingBy` 為 email／name | 不變(以該欄位;與 srcKey 無關) | LI-018、MI-008 |
| 31 | 登入 | `mappingBy` 不合法值 | 視同 id | LI-019 |
| 32 | 登入 | ORM 讀取失敗(第一次或第二次查詢) | 原樣拋出(不吞成 0 筆或採信第一次) | LI-020、LI-020b、LI-021(條件含 isActive) |
| 33 | 後台存檔 | `lockExternalRows` 為假,外部列改 `from` 為空使登入識別由 srcKey 變為 id 而撞他來源有效外部列 srcKey | 拒 `loginIdCollision`、零變更(含 srcKey 恰等於 id 而只有類別改變者); 識別改變而無撞值、歷史撞值原樣送回／無關欄位修改／刪其一 → 過 | UL-012、UL-013、UL-014、UL-015 |
| 34 | 匯入／後台／登入 | 精確比對: `srcKey`／`id` 前後空白、大小寫不同 | 不撞、不匹配(值原樣 `===`) | LI-020c、LI-038 |
| 34b | 匯入／後台／登入 | **[05 改]** `isActive` 為 `'Y'`／`true`／`1`／`''`／缺漏(非標準值) | 撞值檢查不論 `isActive` 故**仍撞**(LI-033); 登入單獨命中恰 1 筆且 `isActive` 非 `'y'` 視同查無(LI-020c), 與有效列同值則 2 筆拒(LI-016b) | LI-020c、LI-033、LI-016b |
| 35 | 匯入 | 撞值與其他拒收並存 | 先到先拒: `idNotAllowed` → `srcKeyInvalid` → `srcKeyDuplicate` → …名稱／對應鍵 → 讀庫 → 跨來源 → **`loginIdCollision`** → 依 `srcKey` 配對(`srcKeyConflict`);庫內異常且本批無撞值者仍回 `srcKeyConflict` | SC-L11 |
| 36 | 登入 | 兩來源外部列同 `srcKey` 且僅一列有效 | **[05 改]** 2 筆 `ambiguousUserFromPerm`, 不放行(原「設計限制」: 登入到該有效列; 主控裁示①: 已停用者之 token 不得對到他來源之有效列); 兩列皆有效／皆停用 → 亦 2 筆拒 | LI-016、LI-016b、MI-012 |

- **站點全集(盤點指令)**: `git grep -nE "findLoginUsers|findLoginIdClash|loginIdOf" -- server`(`keyCheck.mjs` 定義; `WWebPerm.mjs:getTokenUser`、`syncCore.mjs:syncAndReplaceTabs`、`procCore.mjs:updateTabItems` 各一呼叫點); `git grep -n "woItems.users.select(" -- server` 須只剩 `getGenUserByKV`(以內部 id 反查,恆 ≤ 1 筆)——可執行版 `unit-keyCheck` SITE-KC-004、`unit-loginId` SITE-LI-001～004. 其他以 `mappingBy` 取 users 之處(`procCore`／`syncCore` 之 email／name 檢查、`nameDupReport` 離線工具)不屬登入識別,不變.
- **判準**: 已套(三個入口); 刻意不套(`email`／`name` 模式; 歷史未觸及). 〔**[05 改]** 原載「停用列」「他來源外部列同 `srcKey`〔登入時拒〕」為刻意不套——perm-run05 起兩者皆已套用(R-MAPKEY-05)。〕
- **測試**: `unit-loginId`(純函數 LI-001～038＋LI-016b／020b／020c＋SITE-LI)、`unit-procCore-loginId`(UL-001～015)、`unit-syncCore` SC-L1～L11、`api-mapKeyId`(真後端 MI-001～010)、`unit-keyCheck` SITE-KC-004; 變異驗證見報告與 `spec/evidence/perm-run04/mutation-results.md`. 〔perm-run05 更新見 R-MAPKEY-05。〕
- **已知限制**: ①〔原載「他來源外部列彼此同 `srcKey` 不在匯入端拒收,登入時才拒」——**perm-run05 起不成立**,見 R-MAPKEY-05〕; ②〔原載「`nameDupReport --mapping-by id` 仍只報告 id 缺漏」——**perm-run05 起不成立**,已列登入識別撞值組,見 R-MAPKEY-05〕; ③舊外部列(無 `srcKey`)暫以 `id` 登入是過渡規則,首次匯入補上 `srcKey` 後失效(其 `id` 在失效前仍參與撞值比對).

### R-MAPKEY-05 登入識別值須跨全表唯一(不論 isActive、含他來源); `getPermUserInfor` 的 userId 依登入對應解析(perm-run05, 2026-10-24; ADR-038 Update)

來源: 主控 2026-10-24 對 perm-run04 收件裁示——①`mappingBy='id'` 時 `srcKey` 須跨全部來源唯一(不論 isActive)且不得等於後台列 `id`, 匯入撞值整批拒收並提示部署方改用可唯一對應之鍵, 登入命中多筆(有效與否)一律拒絕、不得「只有一列有效則放行」, 既有跨來源重複之歷史資料登入拒絕＋srLog, README Upgrade Notes 載稽核與處置; ②`/api/getPermUserInfor` 的 `userId` 於 `mappingBy='id'` 時依同一登入對應解析(外部列→`srcKey`、後台列→`id`、撞值拒絕), 其他模式維持內部 id, JSDoc／README 註明並入 Upgrade Notes; ③遷移前舊外部列(無 `srcKey`)以 id 登入核可. 理由: 不同外部系統之使用者 id 碰撞常見而非同一人; 停用列可被重新啟用, 若匯入放行停用列之撞值, 其後轉有效即造成登入永久拒絕; 登入識別是身分, 衝突就收嚴(R-PRINCIPLE-00 原則 3、4).

軸: 入口(匯入／後台存檔／登入／`getPermUserInfor`／離線稽核) × 列形狀(後台列、外部列有 `srcKey`、舊外部列無 `srcKey`) × `isActive`(有效／停用／非標準值) × 來源關係(同 `from`／不同 `from`／後台對外部) × 被觸及者 × `mappingBy`(`id`〔含省略與不合法值〕／`email`／`name`).

- **規則**:
  1. **撞值組合**(`keyCheck.findLoginIdClashDetail`, 單一擁有者): 同一登入識別值(`loginIdOf`)出現在兩列, 且該對**不是**下列三種不屬登入識別撞值者——「兩後台列」(登入識別值＝主鍵 id, 同一主鍵於表中不可並存)、「同一來源〔`from` 相同〕皆有 `srcKey` 之兩外部列」(同步端 `srcKeyDuplicate`／`srcKeyConflict` 另拒)、「同一來源皆無 `srcKey` 之兩舊外部列」(同一主鍵); 其餘皆撞——後台↔外部(kind `adminId`)、外部↔他來源外部(kind `otherFrom`)、**同一來源一有 `srcKey` 一為舊形而其 id 等於對方 `srcKey`(claimTwice 形, kind `sameFrom`; 外審 sol 第一輪#1: 後台於 `lockExternalRows` 為假時可新增此形, 登入命中兩筆、同步端回 `srcKeyConflict`)**. **不論 `isActive`**(含非標準值)、不論有無被停用. 外部列之內部 `id`(有 `srcKey` 者)不是登入識別, 不參與; 舊外部列(無 `srcKey`)以 `id` 參與(裁示③).
  2. **匯入**(`syncCore`, 位置不變: 跨 from 檢查之後、依 `srcKey` 配對之前, 表鎖內新鮮讀取): 本批列皆視為被觸及, 與他 `from` 任一既有列撞 → 整批 `loginIdCollision`、零寫入, srLog `syncAndReplaceTabs-error` reason `srcKeyIsAdminId`／`srcKeyOtherFrom`、`from`、`row`、`field:'srcKey'`(不記值). 固定訊息提示「改用可唯一對應使用者的值, 或請部署方改以其他可唯一對應的鍵〔例如 email〕」.
  3. **後台存檔**(`procCore.updateTabItems`, 位置不變: `checkExternalWrite`／基準檢查之後、`validateRowsBeforeWrite` 之前, perm-run03 錯誤優先序不變): 被觸及＝新增之列, 或簽章〔類別 `a`／`x:<from>` ＋ `loginIdOf`〕與庫內同 id 列不同之列(庫內舊列**不再只取有效者**); 停用↔啟用不改簽章, 不算被觸及. 歷史撞值原樣送回／群組指派／刪其一皆可存(可修復). reason `adminIdIsSrcKey`／`srcKeyOtherFrom`／`srcKeyClaimTwice`(同來源 claimTwice 形).
  4. **登入**(`findLoginUsers`; `getTokenUser`): `id` 模式的兩次 `select` 不帶 `isActive`, 合併去重、`loginIdOf` 複判後**不論有效與否計筆**: 多於 1 筆 → `ambiguousUserFromPerm`(srLog 只記 `mappingBy` 與筆數); 恰 1 筆有效 → 登入; 恰 1 筆停用或 0 筆 → `cannotGetUserFromPerm`. `email`／`name` 不變.
  5. **`getPermUserInfor`**(`WWebPerm.mjs:resolvePermUserId`, 僅 `/api/getPermUserInfor` 路由使用): `mappingBy` 為 `id` 時 `userId` 以 `findLoginUsers` 解析——多筆 → HTTP 回 `ambiguousUserFromPerm`(SDK 對外 reject `cannotGetUserDataByUrl`)、srLog `api/getPermUserInfor-error`; 恰 1 筆有效 → **以解析出之列直接算權限, 不再以內部 id 重讀**(外審 sol 第一輪#2: 解析與重讀之間該列可被刪除、同 id 被另一人佔用, 重讀會取得另一人之權限; `resolvePermUserId` 回 `{ userId, userFind }`, `getGenUserAndRulesByUserId(userId, userPre)` 在 `userPre` 非 undefined 時採用); 其餘(查無／恰 1 筆停用)→ 與修正前查無使用者相同, 回全停用之空權限(E2E-005, 不改為 reject). **傳入值未命中任何登入識別才是空權限; 若傳入之內部 id 恰等於另一列之登入識別, 則命中該另一列**(外審 sol 第一輪#4: 升級風險, 見 README). `email`／`name` 時 `userId` 維持 perm 內部 id(`userFind` 為 undefined, 照舊以 id 讀取). `/api/getPerm` 之 `userIdSelf` 為 `getTokenUser` 回傳之內部 id, **不經解析**.
  6. **離線稽核**(`server/tools/nameDupReport.mjs --mapping-by id`): 列出每一組「同一登入識別值有 ≥ 2 列」者(與登入同口徑: 命中多筆即拒; 不論 isActive、含他來源與同一來源), 標 `scope`: `crossSource`＝匯入／後台存檔會擋之撞值組合(判準 `findLoginIdClashDetail`)、`sameSource`＝同一來源之重複(同步端本就拒絕; 外審 sol 第一輪#5: 否則升級稽核會報零組而使用者仍不能登入), 供 README Upgrade Notes 之盤點與處置.
- **輸入空間表(逐格對應測試)**:

| # | 入口 | 情境 | 結果 | 測試 |
|---|---|---|---|---|
| 1 | 匯入 | 批次 srcKey＝他來源外部列 srcKey(該列有效／停用; 批次列有效／停用) | 拒 `loginIdCollision`、零寫入(含批次中不撞之列)、不回顯值 | SC-L3、MI-011 |
| 2 | 匯入 | 同來源重送自己之列(同 srcKey) | 不算(nSame) | SC-L3、MI-011 |
| 3 | 匯入 | 批次 srcKey＝他來源遷移前舊外部列之 id | 拒 | SC-L4b、MI-013 |
| 4 | 匯入 | 該舊外部列所屬來源首次匯入(srcKey＝舊 id) | 過、nUpdate=1 | SC-L4b、MI-003、MI-013 |
| 5 | 匯入 | srcKey＝後台列 id(後台列有效／停用) | 拒 | SC-L1、SC-L4、MI-005 |
| 6 | 後台存檔 | 新增後台列 id＝外部列 srcKey(外部列有效／停用; 新列有效／停用) | 拒、零變更 | UL-001、UL-003、UL-005、MI-006、MI-009、MI-016 |
| 7 | 後台存檔 | 外部列換 from(lockExternalRows 為假)致與他來源撞 | 拒(簽章含來源) | UL-012 |
| 8 | 後台存檔 | 歷史撞值原樣送回／群組指派／刪其一／停用改啟用 | 過 | UL-004、UL-006、UL-015、MI-007 |
| 9 | 登入 | 兩列同值(有效＋停用／皆有效／皆停用; 後台＋外部／兩來源外部) | 2 筆 `ambiguousUserFromPerm`, 不放行 | LI-016b、MI-007、MI-012 |
| 10 | 登入 | 恰 1 筆有效／恰 1 筆停用／0 筆 | 登入／`cannotGetUserFromPerm`／同 | LI-016c、LI-014、MI-009 |
| 11 | 登入 | 清掉其一後恰 1 筆有效 | 恢復登入 | MI-012 |
| 12 | 登入 | `id` 模式查詢條件 | 只帶 `id`／`srcKey` 之一(不帶 `isActive`)、不做全表讀取; email／name 仍帶 `isActive` | LI-021 |
| 13 | `getPermUserInfor` | 外部列傳 srcKey／傳內部 id／後台列傳 id／停用列／多筆 | 命中該列／**未命中任何登入識別時**空權限(列出全部標的且皆 n; 若該內部 id 恰等於另一列之登入識別則命中另一列, 見 LI-017)／命中／空權限／`ambiguousUserFromPerm`(srLog `api/getPermUserInfor-error` 只記 mappingBy 與筆數) | MI-014、API-getPermUserInfor-005／007／008、LI-017 |
| 14 | `getPermUserInfor` | `mappingBy` 為 email／name | `userId` 維持內部 id(傳 srcKey 查無) | MI-015 |
| 15 | `getPermUserInfor` | 接線 | `resolvePermUserId` 先於 `getGenUserAndRulesByUserId` 且傳入解析出之列; `/api/getPerm` 不經 | SITE-LI-005、MI-001(getPerm 本人) |
| 16 | 離線稽核 | 撞值組(adminId／otherFrom／claimTwice／舊外部列)／同來源同 srcKey(含其一停用)／內部 id 與他列同值 | 前者標 `crossSource`、同來源標 `sameSource`、內部 id 與他列同值不列 | ND-005b |
| 17 | 匯入／後台／登入 | `mappingBy` 為 email／name | 不檢查、不變 | SC-L5、UL-002、LI-018、MI-008 |
| 18 | 後台存檔 | `lockExternalRows` 為假: 新增外部形列(from 非空、無 srcKey)其 id 等於同來源既有外部列之 srcKey(claimTwice 形) | 拒 `loginIdCollision`、零變更(reason `srcKeyClaimTwice`); 預設(保護啟用)由外部列守門先拒 `saveFromNotAllowed` | LI-035c、UL-017 |
| 19 | 登入 | 非標準 `isActive`(`'Y'`、`true`、`1`、`''`、缺漏)之列與標準有效列同值 | 2 筆拒(不因「唯一標準有效列」而放行) | LI-016b |

- **站點全集(盤點指令)**: `git grep -nE "findLoginUsers|findLoginIdClash|loginIdOf" -- server`(`keyCheck.mjs` 定義; `WWebPerm.mjs:getTokenUser`／`resolvePermUserId`、`syncCore.mjs`、`procCore.mjs`、`server/tools/nameDupReport.mjs` 各呼叫); `git grep -n "woItems.users.select(" -- server` 須只剩 `getGenUserByKV`(內部 id 反查,恆 ≤ 1 筆). 可執行版 `unit-loginId` SITE-LI-001～005、`unit-keyCheck` SITE-KC-004.
- **判準**: 已套(匯入／後台存檔／登入／getPermUserInfor／稽核); 刻意不套(`email`／`name` 模式; `/api/getPerm`; 歷史未觸及者之存檔).
- **測試**: `unit-loginId`、`unit-procCore-loginId`、`unit-syncCore`(SC-L3／L4／L4b)、`unit-nameDupReport` ND-005b、`api-mapKeyId`(MI-001～016); 既有以內部 id 傳 `getPermUserInfor` 之外部列夾具改傳 srcKey(`api-getPermUserInfor` 007／008、`api-keyProp`、`api-authMerge`、`api-refCascade`、`e2e-external-rows`、`e2e-ref-cascade`、`e2e-array-form`); 變異驗證見 `spec/evidence/perm-run05/mutation-results.md`.
- **已知限制**: ①升版前已存在之跨來源重複 `srcKey` 不被阻擋存檔, 但該登入值一律被拒(`ambiguousUserFromPerm`)且重新匯入同值被拒——須依 README Upgrade Notes 以 `nameDupReport --mapping-by id` 盤點並處置; ②`getPermUserInfor` 之 userId 語意改變對既有以內部 id 呼叫者為行為變更(外部列傳內部 id 現回空權限), 已入 README Upgrade Notes; ③本輪不新增亦不重產任何標準圖(e2e 後以 `git status --short test/pics` 須為空回驗); ④**範圍外, 未修**(外審 sol 第一輪#3, 已探測確證): 後台整表寫入 `users` 時, 送入之整表含兩列**相同 id**(不同 name／email)會被併成一列、靜默遺失其一且回成功——`prepRows` 的整表 id 重複預檢只涵蓋 `pemis`／`grups`(`procCore.mjs:271`), `users` 沒有(單元層 `tmp` 探測與真後端 `updateUsers` 皆重現: 送 `probeA`／`probeB` 同 id 後只剩 `probeB`)。前端不會產生(新列 id 為隨機); 僅 API 直打可達; 屬既有行為、非本輪引入, 本輪不改; 建議另案把重複預檢擴及 `users`(錯誤鍵 `saveRowFieldDuplicate`)——登入識別唯一性之『兩後台列』排除以「同一主鍵於表中不可並存」為前提, 該缺口不影響本規則之判準; ⑤**部署前提**(外審 sol 第一輪#6): 兩個來源原用同一值時, 只改一方的 `srcKey` 不夠——部署方 `getUserByToken` 回報之使用者代號須同步改為新 `srcKey`(例如加來源前綴), 否則舊代號之令牌仍會登入到仍持有該值的另一人; README Upgrade Notes 已載。

## 引用連帶:改名級聯與刪除連帶清理(2026-10-22 run06, ADR-036; 來源: 使用者 2026-10-21「刪除須連帶清理引用」裁示、主控定案 F-07、`R-PRINCIPLE-00` 原則 6、適用表 m／n)

### R-REF-CASCADE-01 引用要跟著改: 群組／權限改名與群組／權限／標的刪除, 於同一次寫入內連帶更新／清理引用(m、n)

軸: 被寫入之表(`grups`／`pemis`／`targets`) × 事件(改名〔同 id 異名〕／刪除〔舊 id 不在新表〕／刪後同名新增／歷史同名只刪其一／互換／鏈式) × 入口(後台整表寫入／外部同步同一 `from` 內) × 引用端字串形狀(物件／陣列／舊式簡寫／壞 JSON／空字串) × 失敗點(引用端寫入／主體 del／insert／save／補償).

- **規則**:
  1. **身分以主鍵 id**(`src/js/refCascade.mjs:diffRefTargets`): 同 id 且名稱皆為字串而不同＝改名(僅 `grups`／`pemis`; 互換與鏈式**同時套用**, 不逐一套用); 舊列 id 不在新表＝刪除(`targets` 之 id 即名稱, 改 id＝刪舊增新, 標的 id 改名之級聯為階段 2, 先收嚴為清理). 刪除之名稱若仍有「同 id 同名」之存續列(歷史同名只刪其一)則**不清理**(引用仍解得出, 授權變寬由刪除前確認框提示, 見 R-AUTH-REF-01); **刪除後以同名新增(新 id)者不繼承引用**(原則 6: 不被同名新資料接管).
  2. **改寫**(`rewriteRefs`): 只動命中之項目; 物件形式仍物件、陣列形式仍陣列(不互轉, 免有損), 值內 `mode`／`isActive`／額外欄位原樣; **未命中者同一字串原樣回傳**(保留註解與排版), 命中者 `JSON.stringify` 重新編碼; 壞 JSON／空字串／純量視為空容器不動(同伺服端 `cvStrToArr` 容錯). 刪除不論 `isActive` 皆移除該項.
  3. **拒絕(收嚴＋提示, 整次拒存、四表零變更, 固定語系鍵)**: `renameCascadeDupGroup`(被改名者屬歷史同名組且該名稱仍被某引用端引用〔含停用項〕——級聯會把原綁「各筆交集」之引用轉給被改名者, 外審 A.1; 無人引用則不擋, 為歷史同名之清理路徑)、`renameCascadeNameInUse`(新名無任何舊實體而仍被**啟用中**引用〔懸空名〕,Q4; 停用之懸空引用不擋, 但容器內相撞見下)、`renameCascadeConflict`(某容器內新名與另一個未被改走／刪除之既有項目相撞,含停用項)、`renameCascadeUnsupported`(命中而須改寫之容器含無法安全重新編碼之內容——JSON5 之 Infinity／NaN 數值經 `JSON.stringify` 會變 null, 作為 `crules` 規則名時改指別的規則 'null' 而改變授權〔外審 sol R2〕; 刪除連帶清理與稽核工具同: 稽核工具列入 `unsafe` 須人工處理). **新增**同名撞懸空名**不拒**(外部先指派、後於後台定義同名群組為合法流程; 引用於定義後生效為預期, 頁面已有 c 之懸空警告圖示).
  4. **失敗回復(外審 A.2; 依原則決定, 見 ADR-036)**: 引用端先寫、主體後寫; 預檢(含引用端改寫列之 `validateRowsBeforeWrite`)於任何寫入之前. 任一步例外 → 以**寫入前整列補償還原引用端**(`server/cascadeWrite.mjs:writeWithCascade`, 以 holdersOld 之整列經 `woItems[引用端].save(pre, { merge: false })` 覆寫〔w-orm-lmdb 選項,其他後端退回合併〕, 使歷史列原無 `userIdUpdate`／`timeUpdate` 者亦逐位元還原〔外審 sol R4〕)後重新拋出原錯誤(**引用端寫入階段之錯誤原文先把 `id[…]` 遮罩為 `id[*]` 才拋出**, 外層 srLog 不得記引用端 id〔外審 sol R5〕); 補償亦失敗 → `saveCascadePartial`＋srLog `refCascade-restore-error`, 以稽核工具處置. **不採「重存即自癒」**(互換／鏈式／批內新增三形狀不成立, 外審 A.2); 重新操作從還原後之一致狀態開始. 主體 `del → insert → save` 之部分寫入為既有 ADR-013 限制, 補償不還原主體(測試如實釘住). 行程於引用端寫入後、主體寫入前崩潰不在補償範圍(記憶體內無日誌), 以稽核工具處置.
  5. **未帶 id 之列(後台整表寫入)與外部同步**(2026-10-23 perm-run03 改寫;〔原載〕外部同步亦依名稱對應未帶 id 之列、`buildSyncRowsNew`、「帶 id 而 id 於外部端不穩定者被判為刪舊增新」——**原載不成立於外部同步**:外部匯入改依 `srcKey` 差異同步,送 `id` 整批拒收、`srcKey` 必填,已無「未帶 id 之列」,見 R-IMPORT-01):`src/js/refCascade.mjs:fillIdlessIds` 為**後台整表寫入**中未帶 id 之列(`grups`／`pemis`;API 直打缺 id 之列,ORM 每次補隨機主鍵,即舊列刪、新列增)補規劃用 id——**依名稱對應** pool 中 id 未被本批帶用之既有列(同名即同一實體,不算刪除再新增;同名多列依序對應;名稱不同視為新實體;規劃用,不改寫入之列),否則 API 直打缺 id 之整表會清空全部引用;後台整表寫入以該表全部既有列為 pool(`procCore.updateTabItems`).帶 id 者依 id:同 id 異名＝改名級聯;舊 id 不在本批＝刪除並清理.**外部同步**(`server/syncCore.mjs`)的身分是 `srcKey`:同 `srcKey` 改名＝改名級聯(`id` 不變)、`srcKey` 消失＝刪除並清理、名稱同而 `srcKey` 不同＝刪舊增新(新實體不繼承引用);「寫入後整表」由 syncCore 以配對結果直接組出(他 from 之列＋同 from 存續者含修改後＋新增者),不經 `fillIdlessIds`.外部應用只收固定鍵 `invalidRows`／`htmlMarkupNotAllowed`(R-ORM-02),動態原因入 srLog `reason`.
  6. **指派欄屬後台(Q8)**: 級聯可改寫 `from` 為外部之 users 列之 `cgrups`(F-23 Lv1 指派欄後台可寫); 預覽確認框警示「其中 N 位來源為外部應用,下次外部同步時可能被外部資料覆寫」. 寫入以操作者記為更新者(`userIdUpdate`／`timeUpdate`).
  7. **opt**: `opt.cascadeRename`(預設 `true`, `false` 關閉改名級聯及其拒絕; 刪除連帶清理不受此設定影響, 使用者裁示刪除即移除其效果).
  8. **log**: 成功 `refCascade-done`(`keyTable`／`holder`／`nRename`／`nDelName`／`nHolders`／`nRenameHolders`／`nDelHolders`／`nExternal`, **不記個資值與引用端 id**); 預檢被拒 `updateTabItems-refCascade-error`／`syncAndReplaceTabs-error`(帶 `reason`); 補償 `refCascade-restored`(warn)／`refCascade-restore-error`.
- **單一擁有者**: 規劃 `src/js/refCascade.mjs`(`planRefChanges`／`diffRefTargets`／`rewriteRefs`, 純函數, **前端預覽與伺服端計畫同一份**); 寫入 `server/cascadeWrite.mjs`(`checkCascadePlan`／`writeWithCascade`／`buildSyncRowsNew`); 呼叫 `procCore.updateTabItems`、`WWebPerm.syncAndReplaceTabs`; 取鎖見 R-WRITE-LOCK-02.
- **站點全集(盤點指令)**: `rg -n "planRefChanges|diffRefTargets|rewriteRefs" src server`(伺服端只 `procCore.mjs`／`WWebPerm.mjs`／`cascadeWrite.mjs`; 前端為三個清單頁之預覽); `rg -n "JSON\.stringify" src/components/Ve*.vue`(五個編輯對話框自產授權字串,與本規則無關,為既有站點). 引用端字串之伺服端改寫**只經 `rewriteRefs`**, 不得另寫.
- **前端**: 刪除前確認框(群組頁／權限頁)與標的頁儲存前確認框列「將自 N 位使用者／N 個群組(權限)移除此引用; 其中 M 位以 AND 引用者,移除後限制解除、權限可能變多」, 計數沿用 `getDelRefCount`／`countAndRefs`; 群組頁／權限頁儲存時改名預覽確認框; 儲存成功訊息附連帶筆數(預覽值, 以伺服端實際為準, 不另開 RPC).
- **升級**: 既有懸空引用以 `node g_authRefsClean.mjs`(預設只列不改)稽核, 明確加 `--apply` 才寫入(先備份), 效果等同舊版「找不到即忽略」; 殘留之懸空引用維持 c(收嚴＋提示). 見 README Upgrade Notes.
- **測試**: `unit-refCascade`(純函數: 邊界／語意不變式〔以真 `getUserRules` 比對改名前後授權逐位相等〕／變異)、`unit-procCore-refCascade`(伺服端: 改名、刪除、拒絕零變更、逐故障點補償、鎖)、`unit-refAudit`(稽核與清理工具)、`api-refCascade`(真後端: 後台與外部同步)、e2e(語意斷言, 不產標準圖): `e2e-array-form` AF-026～027、AF-036～042, `e2e-targets` E2E-012～013, `e2e-grups`／`e2e-pemis`／`e2e-targets` 之 E2E-005 與 targets E2E-011 依新確認框改流程(刪除連帶清理會遺留給後續案例, 三檔每案前另還原引用端表 users／grups／pemis; 共用輔助見 `test/tools/e2e-setup.mjs` 之 `answerConfirm`／`expectConfirmBox`／`saveConfirmYesAndWaitModal`／`resetDbTables` 等); 變異驗證結果見報告. **儲存後 rowsChange 保護**: 刪除連帶清理使一次儲存更新兩張表, store 先後推播兩次重建清單, `markDataReload` 之 1ms 窗口可能短於 ag-grid 渲染而使儲存鈕殘留(E2E-005-3 間歇失配, run06 e2e 子代理發現), 故群組頁／權限頁於儲存成功至成功訊息框關閉後 300ms 以 `postSaving` 排除 rowsChange. **站點不變式之登記**(新增讀取／寫入站點須同步登記, 否則即紅): `unit-cvKpToObj` SITE-AD-001 登記 `src/js/refCascade.mjs`、`src/js/refAudit.mjs` 各一處 `JSON5.parse`(解碼後依 `cvKpToArr` 同一名稱規則走訪); `unit-authMerge` SITE-AM-003 登記 `src/js/refAudit.mjs`(mode 比對僅 `getEffMode(m) === 'OR'`); `unit-validateRows` SITE-NS-001 登記 `server/cascadeWrite.mjs` 為第三個寫入站點(`checkCascadePlan` 之 `validateRowsBeforeWrite` 先於其寫入呼叫, `writeWithCascade` 另防禦性再驗一次); `unit-keyCheck` SITE-KC-007／`unit-procCore-usersKey` SITE-UK-001 見 R-WRITE-LOCK-02.
- **已知限制**: ①標的 id 改名無級聯(階段 2); ②外部同步「未帶 id 且改名」無從偵測為改名(視為刪除＋新增,清理舊名引用); ③補償不還原主體部分寫入; ④外部 users 列被級聯後, 外部下次同步若不含該 `cgrups`(或含舊名)會覆蓋(F-23 下一輪處理 payload 缺鍵保留後台指派)〔**run07 更新**: payload 缺 `cgrups` 鍵者現保留庫內值(`server/syncKeep.mjs:keepAssignOnMissing`, R-EXT-OWN-01), 含鍵(含舊名)者仍覆蓋〕; ⑤引用端 `users` 之 `userIdUpdate`／`timeUpdate` 變為操作者(稽核可追蹤, 清單「最後更新」會變); ⑥刪除確認框為**預覽語意**: `nRefs` 只算「本次刪除」, 歷史同名分次未儲存刪除、或 `cascadeRename:false` 下有未儲存改名時最後一次刪除可能少計/不警示(儲存時伺服端仍正確清理; 外審 sol 增量 D3, 未修); ⑦`postSaving` 窗口(儲存成功至成功框關閉後 300ms)內使用者的編輯提交會被 rowsChange 排除(人為幾乎不可能, D4); ⑧`rewriteRefs` 重編碼會把 `-0` 變 `0`(授權算法不依賴, D5); ⑨w-serv-orm 自身於寫入失敗時 `console.log` 失敗列 id／錯誤原文(套件既有行為, 非 srLog; D2, 建議向 w-serv-orm 提 issue); ⑩編輯器對限制項(mode 缺/非法)重選 AND 視為未改而寫回原值, 無法由編輯器轉為合法 AND(第三格放寬之代價, minimax R2).

## 外部匯入(原則 11;2026-10-22 主控依使用者裁示寫入;2026-10-23 perm-run03 落實 `srcKey` 差異同步,使用者裁示不提供呼叫端相容)

### R-IMPORT-01 外部匯入:本系統只提供匯入管道,依外部自訂之來源鍵 `srcKey` 差異同步

- **規格(真理源)**:`C:\opensrcOper\dspec\外部匯入之定義與機制.md`(第 3～10 節);上位原則 `C:\opensrcOper\sgud\proc\process_principle.md` 第 11 條.
- **站點(單一擁有者)**:`server/syncCore.mjs`(`syncCore({ woItems, procOrm, lockTabs, srLog, mappingBy, cascadeRename })` → `{ syncAndReplaceTabs, getSyncWarns }`).`server/WWebPerm.mjs` 只組裝並由 `POST /syncAndReplaceTabs` 呼叫(原內嵌於 WWebPerm 閉包之實作已移出,以便注入 ORM 替身單元測試).外部端輔助 `server/provideTabs.mjs`(`ks_*` 欄位白名單:`srcKey` 取代 `id`,**不送 id**).
- **規則**:
  1. 入口 `POST /syncAndReplaceTabs?keyTable=&token=`;可匯入之表 targets、pemis、grups、users;app 權杖須具 `syncAndReplaceTabs` 權限(`getAndVerifyAppUser`);本文 `{ from, rows }`,`rows`＝該 `from` 之完整清單.回傳 `{ nAdd, nUpdate, nDel, nSame }`.
  2. **`srcKey` 即刻必填,不提供呼叫端相容**(使用者 2026-10-23):任一列缺、空白、非字串、UTF-8 > 1978 B、含會被 `clearXSS` 改寫之標記 → `srcKeyInvalid`;同批重複(精確 `===`)→ `srcKeyDuplicate`;**任一列帶 `id` 鍵(含空值)→ `idNotAllowed`**,先於 srcKey 檢查(仍送 id 多為舊呼叫方式);空批次 → `invalidRows`;皆整批拒收、零寫入.
  3. 於表鎖內(R-WRITE-LOCK-01/02)**新鮮讀取庫內全表**(一次),依 `srcKey` 配對該 `from` 之庫內列,分四類:新增(配新 `id`,`genIDSeq` 且不撞庫內任何 id)、修改(保留 `id`)、刪除(庫有批次無)、不變(零寫入).**不再 `delAll({ from })`＋insert**.
  4. **`targets` 例外**:其 `id` 即標的名稱(被 `pemis.crules` 以名稱引用),無法由系統配隨機 `id`;外部不送 `id`,新增時 **`id＝srcKey`**;該 `id` 已被庫內任何其他列(他來源或後台列)占用 → 整批 `invalidRows`(reason `idTaken`;免 `insert` 對既有主鍵靜默略過).因 `id＝srcKey`,標的「改名」只能是刪舊增新(R-REF-CASCADE-01 已知限制①不變).〔此為規格(dspec 第 9 節「外部送 id 整批拒收」)對 targets 之缺口,主責 agent 依原則 1／4 擇最小改動,列報告備查.〕
  5. **欄位歸屬**(規格第 4 節):外部擁有＝批次提供之欄位(`order`、`name`、`description`、`email`、`isAdmin`、`isActive` 等;缺鍵視為空值;`order` 屬外部,後台儲存不重編);外部可選＝指派欄 `users.cgrups`／`grups.cpemis`／`pemis.crules`(沿用 F-23、`server/syncKeep.mjs`:有帶鍵才寫,缺鍵保留庫內值;**users 另依實際 `mappingBy` 驗登入對應鍵矛盾**〔外審 sol#1〕:`mappingBy` 為 `email`／`name` 時,同 `srcKey` 之對應鍵值被改成別值、或新值為庫內同 `from` 別列所持有,保留指派會使該登入值取得原擁有者之授權〔兩人互換 email 即可移轉,增權〕,一律不保留〔`cgrups` 維持空〕並記 warn `syncAndReplaceTabs-keepAssign-skip`〔reason `identityConflict`,不含個資值〕;`mappingBy='id'` 不檢查.測試 `unit-syncCore` SC-K1～K4、`api-externalRows` EX-030／031〕);本系統擁有＝伺服器管理欄 `userId`／`timeCreate`／`userIdUpdate`／`timeUpdate`(一律不採批次值,新增列為匯入者與現在時間,修改列保留建立者／建立時間、更新者記匯入者).`id`、`srcKey`、`from` 為身分欄.比較以 `eqV`(缺欄／null／'' 同一空值,純量以字串形式比)為準,使冪等不受 ORM 型別轉換影響.
  6. **整批驗證**(任一不過 → 整批拒收、零寫入;保留並移入 `syncCore`):R-SYNC-NAME-01(grups／pemis 名稱非空字串)、R-NAME-UNIQ-01(批內與他 from／後台列不得同名)、R-MAPKEY-01(users `mappingBy` 為 email／name 時 active 列之對應鍵非空且批內／跨來源唯一)、R-ORM-01(寫入前驗證:標記、純量)、R-SYNC-01 之 targets 版(見 4).
  7. **引用連帶**(R-REF-CASCADE-01):以「寫入後整表」(他 from 之列＋同 from 存續者含修改後＋新增者)與寫入前整表比對——同 `id` 異名＝改名級聯(同 `srcKey` 改名即此)、舊 `id` 不在寫入後整表＝刪除而連帶清理;預檢(`checkCascadePlan`)於任何寫入之前.**名稱相同而 `srcKey` 不同＝刪舊增新,新實體不繼承引用**(原則 6).
  8. **一次性資料遷移**(非呼叫端相容,規格第 9 節):庫內既有外部列無 `srcKey`(舊同步寫入)者,首次匯入時批次 `srcKey` 等於其 `id` 者視為同一列,於鎖內補上 `srcKey`(計入 `nUpdate`,`id` 不變);其後只認 `srcKey`;對不上者依差異同步刪舊增新(引用連帶清理).庫內同 `from` 有重複 `srcKey`,或同一 `srcKey` 被兩個庫內列主張(一個已有 `srcKey`、一個以 `id` 主張)→ 無法唯一配對,整批 `srcKeyConflict`,以 `g_purgeFrom.mjs` 清源後重匯入.兩種庫內資料異常皆**不看本批是否含該鍵**一律拒收(外審 sol#2;`unit-syncCore` SC-I15-claimTwice／-claimTwice-unrelated／-dupInDb).
  9. **寫入中途失敗**(規格第 5 節 6):預檢攔下可預見之失敗;寫入順序刪除 → 新增 → 修改(同後台整表寫入,procOrm 帶 `mustExist`);任一步失敗 → 引用端由 `writeWithCascade` 還原,**本表由 `writeMain` 之 undo 以鎖內讀取之舊列還原**(新增者以 `delAll({ id: { $in } })` 刪除、被刪者與被改者以 `save(整列, { merge: false })` 寫回;逐步冪等,不論做到哪一步皆可無條件全做),還原成功重新拋出原錯誤(對外 `saveWriteFail`,srLog `syncAndReplaceTabs-restored`);**還原亦失敗** → `saveWriteFail`＋srLog `syncAndReplaceTabs-restore-error`(只記表名／來源／筆數),人工處置;**引用端補償失敗**(`writeWithCascade` 之 `saveCascadePartial`)於同步端點亦對外固定轉為 `saveWriteFail`(外審 sol#3;引用端懸空仍由 srLog `refCascade-restore-error` 供稽核,`unit-syncCore` SC-I12-cascadeUndoFail).
  10. **後台列(`from` 為空)與他 `from` 之列永不被觸及**;後台對外部列受 Lv1 守門(R-EXT-OWN-01),`srcKey` 為鎖定欄:後台新增帶值之列、改既有列之 `srcKey` → `saveFromNotAllowed`(後台列)／`saveExternalRowChanged`(外部列),reason `addSrcKey`／`srcKeyChanged`,**不論 `lockExternalRows`**(`src/js/externalRows.mjs:checkExternalWrite`);四表寫入契約 `fields` 含 `srcKey`(外部補上或改變使持舊畫面者存檔被拒);清單頁複製列重置 `srcKey`(同 `from`).
  11. **srcKey 重編警示**(原「同名異 id 重編偵測」之評估結果:**不移除,判定口徑改為 srcKey**):同一 `from` 同批內出現「同名異 srcKey」(新來源鍵列與將被刪除列同名)→ srLog warn `syncAndReplaceTabs-srcKeyRenumber`(只記表名／來源／筆數),並登錄 `getWebInfor().syncWarns`(`countSrcKeyRenumber`;理由:外部來源重編來源鍵＝刪舊增新,引用每次被連帶清理而抹掉後台指派);同 `srcKey` 改名是改名級聯,不警示.**已移除**:`buildSyncRowsNew`(`server/cascadeWrite.mjs`;專供舊同步之「未帶 id 依名稱對應」規劃)、`countIdRenumber`、同步端之 `idOtherFrom` 檢查(targets 以 `idTaken` 取代).`fillIdlessIds` 仍供**後台**整表寫入(API 直打缺 id 之列)使用,不刪(R-REF-CASCADE-01 規則 5).
  12. **users 之登入對應 `mappingBy='id'`(規格第 9 節末):已於 perm-run04 實作,採 O1**(主控 2026-10-24 對 perm-run03 待裁示 1 之決定):外部列對 `srcKey`、後台列對 `id`,撞值於匯入批次、後台存檔、登入三處皆拒——見 **R-MAPKEY-04**(規則、32 格輸入空間表、站點與測試).〔原載(perm-run03):本輪未實作,列待裁示 O1～O4;升版後新匯入之外部使用者其 `id` 為系統配的值而無法以 `mappingBy='id'` 登入——**原載不成立**,現以其 `srcKey` 登入.〕
- **刪除防護**:本條為預期功能;外部端輔助 `provideTabs` 不是死碼,不得以「無引用」刪除(opensrcOper 帳本 G8).
- **狀態:已做**(第 12 點於 perm-run04 完成,R-MAPKEY-04).
- **驗收**(規格第 10 節 I1～I15):`test/unit-syncCore.test.mjs`(64 案:SC-I1…SC-I15、SC-W1 警示、SC-R1～5 形狀與記錄;I14〔無權限權杖、未列 keyTable〕屬路由層,由 `api-syncAndReplaceTabs` 承擔);真後端 `api-syncAndReplaceTabs`、`api-externalRows`、`api-mapKey`、`api-refCascade`;e2e 夾具經 `test/tools/e2eExt.mjs:syncRows`(`id` 標籤改送 `srcKey`).
- **盤點**:`git grep -nE "srcKey" -- server`(`syncCore.mjs` 配對與驗證、`externalRows` 守門、`provideTabs` 白名單);`git grep -n "delAll({ from" -- server` 須 0 筆(2026-10-23 實得見報告);`git grep -nE "buildSyncRowsNew|countIdRenumber" -- server src` 須 0 筆.
