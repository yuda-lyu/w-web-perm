# 規則帳本:名稱唯一、引用連帶與外部匯入

本檔為 `sgud/rule/rulebook.md` 之分冊(2026-10-22 主控依使用者指示自原 312KB 之帳本依類型分拆; 2026-10-23 perm-run01 再將 `rulebook_sync.md`〔73KB〕依類型拆為四冊, 節(###)之標題與內容不變, 依規則編號 `R-…` 查找者請用 `rulebook.md` 之索引).

## 分拆索引(2026-10-23 perm-run01)

| 規則 | 所在分冊 |
|---|---|
| R-NAME-UNIQ-01／02／03、R-MAPKEY-01／02、R-REF-CASCADE-01、R-IMPORT-01 | 本冊 `rulebook_sync.md` |
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
