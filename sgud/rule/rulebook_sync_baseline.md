# 規則帳本:載入基準、草稿保留與重載旗標

本檔為 `sgud/rule/rulebook.md` 之分冊(2026-10-22 主控依使用者指示自原 312KB 之帳本依類型分拆; 2026-10-23 perm-run01 再將 `rulebook_sync.md`〔73KB〕依類型拆為四冊, 節(###)之標題與內容不變, 依規則編號 `R-…` 查找者請用 `rulebook.md` 之索引).多人同時編輯之寫入契約落地(鎖共用、存檔回傳列、對話框主體身分等)另見 `rulebook_concurrent.md`.

## 外部列受保護與過期快照基準(續: 載入基準、草稿保留與重載旗標; 自 `rulebook_sync.md` 搬入, 原一節之後三條; 2026-10-22 run07／run11／run12, 2026-10-23 perm-run01 改寫 R-BASELINE-01、R-DRAFT-KEEP-01)

### R-BASELINE-01 載入基準: 基準於草稿建立時綁定、以共用核心 h1 基準（名次入基準）、伺服端表鎖內整表比對、先動先贏; 單一擁有者 `src/js/rowDigest.mjs` 轉接 `w-serv-orm/src/baseline.mjs`(k; 2026-10-22 run11 表級; **2026-10-23 perm-run01 改用共用核心**, ADR-037 Update(perm-run01))

軸: 基準綁定時機(開啟編輯〔建草稿〕／存檔當下) × 站點(四清單頁 `rebuildDraft`／兩對話框 `show()`、`rebuildDialog()`) × 表內差異類別(列內容異／基準之列已不在／多出基準沒有之列／名次不同／僅 `order` 數值或僅伺服器專有欄／空值不同表示) × 基準格式(h1／套內舊版指紋／壞格式) × 有無基準 × 列類別(後台列／外部列) × 本次是否寫入該列(表級下無關).

- **規則**:
  1. **基準**＝草稿所依據之**整表**之共用核心基準 `[[id, 'h1:' + 14 位小寫十六進位]]`(`w-serv-orm/src/baseline.mjs:buildBaseline`, 規格 `C:\opensrcOper\dspec\多人同時編輯之寫入契約.md` 第 5 節; **陣列之序即名次**: `order` 數值〔可比較者精確比較〕，同值依主鍵碼元序). 摘要 `digestRow(row, contract)` 只取**寫入契約** `fields`(R-CONTRACT-01)依宣告之序: `undefined`／`null`／`''` 同一空值(已知缺口 (d) 修)、數字與字串不互轉、物件鍵序無關、`Date`→ISO、非 JSON 值拋錯. `order` 本身與四個伺服器專有欄不入摘要; **名次入基準**(已知缺口 (e) 修): 他人只拖曳排序(名次改變)→ 基準不符(`rowReordered`)；系統重編號(存檔重給 `order=k+1`、外部同步平移其外部列之 `order`)而名次不變 → 相符. 外部列之 `order` 屬外部(R-EXT-OWN-01), 其排名口徑與後台列同一(`order` 數值, 主鍵碼元). `from`、users 之 `isAdmin／isActive` 屬 `fields`. 前端 `makeBaseline(rows, keyTable)` 為核心 `buildBaseline` 之薄轉接; 主鍵缺漏／重複(資料異常)時回空基準(與非空整表必不符, fail-closed).
  2. **綁定時機(外審 B.1, 決定性; 不變)**: 於建立編輯草稿之同處由「草稿所依據之整表」計算並綁定(清單頁於 `rebuildDraft`, 對話框於 `show()` 與 `rebuildDialog()`), **存檔函式內不得重新計算**; 各存檔流程於開頭(與 `rows` 同一刻、任何 `await` 之前)以 `cloneDeep(vo.baseline)` 擷取副本並以區域變數持有; 對話框之 `saveUsers`／`saveGrups` 以參數取基準, 不讀 `vo.baseline`. 清單頁有未存編輯(含開啟中之儲存格編輯器)時推播**不更新**基準(R-DRAFT-KEEP-01); **自己存檔成功後之新基準取自伺服端回傳之寫入後之列**(R-SAVED-ROWS-01), 不是自己送出之值.
  3. **伺服端判準(表級; `procCore.updateTabItems` 以 `guardWrite({ tables: [keyTable], read, baseline, contract, write })` 於表鎖內新鮮讀取後、`write` 之前比對)**: 核心 `compareBaseline(rowsNow, baseline, contract)`——任一列摘要不同(`rowChanged`)、基準之列已不在庫內(`rowRemoved`)、庫內多出基準沒有之列(`rowAdded`)、兩邊共有之列名次不同(`rowReordered`)即整次拒收 `saveStale`(零寫入, 提示重新載入; `procCore.mapGuardErr` 轉語系鍵並記 srLog 事件 `updateTabItems-stale-error`, 只記 reason 與差異筆數, 不記列 id 與值), **與該列是否為本次將寫入者無關**(不部分變更、不上鎖, 先動先贏). 核心 `rowNotFound`(基準只含一列而該列已不在) 與 `procOrm` 之 `mustExist` 未命中皆轉 `saveStale`. 庫內主鍵缺漏／重複(`rowsInvalid`)屬伺服端資料錯誤, 回 `saveWriteFail` 並記 log. **不快取**(離線工具直接寫 LMDB, 快取會 fail-open; 規格第 12 節).
  4. **基準格式不識**(規格第 5、6 節, V13): 非陣列、元素形狀不合、重複 id、版本非 `h1`、**套內舊版指紋**(無 `h1:` 前綴之 base36 字串)一律拒收 `saveBaselineFormat`(提示重新載入; 文字見 `procLang`), 於任何讀寫之前(`procCore` 以核心 `isBaselineValid` 於 `lockSave`／`guardWrite` 之前驗證), **不得降級為「未帶基準」**. 升級當下已開啟之頁面須重新載入一次(README Upgrade Notes).
  5. **無基準**(依原則 3 收嚴, 外審 B.2; 本 major 沿用既有政策, 下一 major 改必帶): `baseline` 缺或為 `null`(自寫客戶端、外部應用)→ 後台列維持最後寫入者勝(ADR-013); **修改外部列之指派欄**拒收 `saveBaselineRequired`. 客戶端 opt 只採 `baseline` 與 `returnRows`(`procCore.pickClientOpt`), 其餘一律不採納、更不轉給 `procOrm`(規格第 6 節: `procOrm` 之 `opt` 只能由伺服端自組). 強制所有寫入必帶基準(`requireBaseline`)下版再議.
  6. **兩個反向關聯對話框(c0; 不變)**: 開框時另記各列歸屬狀態(`makeRowStates`), 存檔時送出之整表＝存檔當下 store 快照之全部列, 只有使用者有變更之列(`getChangedIdx`)才以 `putRefEntry` 只改本項, 其餘列為快照同一物件原樣帶回(`src/js/relDialogSend.mjs:buildRowsSend`); 無法證明未變更者視為有變更. 對話框開著且無未存修改時, 推播使表異於基準 → 重建並更新基準(R-DRAFT-KEEP-01 規則 11); 有未存修改 → 保留並提示, 存檔由伺服端拒收.
- **單一擁有者**: 摘要、基準、比對之演算法在 `w-serv-orm/src/baseline.mjs`(零 import 同構純函數); 套內 `src/js/rowDigest.mjs`(`getContract`／`makeBaseline`／`compareBaseline`／`isBaselineStale`／`checkBaseline`, 前後端同一份轉接層; **不得自帶指紋演算法**, `unit-rowDigest` RD-X1／X2 靜態守護); 契約 `src/schema/contracts/*.mjs`(R-CONTRACT-01); 對話框整表組裝 `src/js/relDialogSend.mjs`; 前端草稿處置 `src/js/draftSync.mjs`(R-DRAFT-KEEP-01).
- **站點全集**(2026-10-23 perm-run01 實測, 綁定 8／8、送出 6／6 已套):

| # | 元件 | 綁定點(`makeBaseline(rows, '表')`) | 送出點(`$fapi.update*(…, { baseline, returnRows: true })`) |
|---|---|---|---|
| 1 | `LayoutContentTargets.vue` | `rebuildDraft` | `doSaveTargets` → `updateTargets(rowsSend, …)` |
| 2 | `LayoutContentPemis.vue` | `rebuildDraft` | `doSavePemis` → `updatePemis` |
| 3 | `LayoutContentGrups.vue` | `rebuildDraft` | `doSaveGrups` → `updateGrups` |
| 4 | `LayoutContentUsers.vue` | `rebuildDraft` | `doSaveUsers` → `updateUsers` |
| 5 | `VeGrupBlngUsers.vue` | `show()`、`rebuildDialog()` | `saveUsers` → `updateUsers` |
| 6 | `VePemiBlngGrups.vue` | `show()`、`rebuildDialog()` | `saveGrups` → `updateGrups` |

- **盤點指令(可重跑; 期望為 2026-10-23 perm-run01 實測)**:

```
rg -n "makeBaseline\(" src
# 期望: src/js/rowDigest.mjs 定義 1 + 綁定點 8(四頁 rebuildDraft 各 1、兩對話框 show()／rebuildDialog() 各 2); 存檔函式(doSave*／saveUsers／saveGrups)內 0
rg -n "returnRows: true" src/components
# 期望: 恰 6 處(上表送出點), 皆帶 { baseline, returnRows: true }
rg -n "guardWrite\(|isBaselineValid\(" server
# 期望: server/procCore.mjs 各 1 處(updateTabItems); isBaselineValid 在 lockSave／guardWrite 之前
rg -n "cyrb53|Math\.imul" src server
# 期望: 0(套內不自帶指紋演算法; 核心在 node_modules/w-serv-orm)
```

- **測試**: `unit-rowDigest`(RD-C 契約盤點、RD-B 基準建立、RD-F 逐欄摘要含空值等價、RD-S 比對與拒收鍵含舊版指紋／壞格式、RD-T JSON 往返、RD-V 凍結向量、RD-X 站點)、`unit-draftSync`(DS-3 isDraftStale 表 4 × 9 情境含名次與空值、DS-5／6／7 對話框處置)、`unit-procCore-baseline`(UB 系列: 先動先贏、名次、專有欄位、只改不增、舊格式、同鎖、回傳列)、`unit-procCore-external`(C 過期快照情境、J 基準格式、M 並行與鎖內比對、SITE-EX)、`unit-relDialogs-baseline`(RB-SRV-010／012 名次)、`api-externalRows`(真後端; EX-005d 名次、EX-043 格式)、`api-baseline`(V10 資料通道往返、舊格式、返回列)、`e2e-concurrent-edit`(E2E-017～024: 重排、重編號、舊格式、前端基準與伺服端同構)、`e2e-external-rows`(E2E-011～013／016～026，本輪不改).
- **已知限制**: ①誤拒面(使用者 2026-10-22 裁示接受): 他人或外部同步對同表任何一列之內容改動、列之增刪、重排，皆使持舊畫面之存檔被拒, 須重新載入再編; ②未帶基準之客戶端對後台列不受保護(最後寫入者勝); ③摘要為 53 位元非密碼學雜湊, 用途為一致性比對而非安全邊界; ④外部端不帶 `id` 之列每次同步取得新隨機主鍵, 列集合改變即使開著之舊畫面過期(須保持 `id` 穩定; R-IMPORT-01 `srcKey` 差異同步後解); ⑤存檔回傳之列讀回失敗時(寫入已生效)回字串、前端退回等推播, 此時「自己存檔後立即再存」之窗口仍在(機率極低, 讀回與寫入同一表鎖內); ⑥網路推播若恰在自己存檔後以「存檔前之舊內容」抵達(請求於存檔前發出而晚到), store 會短暫回到舊內容至下一輪推播(未實測、機率低).

### R-DRAFT-KEEP-01 有未存編輯（含開啟中之儲存格編輯器）時收到推播: 保留草稿與其載入時之基準, 提示「資料已被更新」, 不得靜默丟棄; 無未存修改時照舊重建（使用者裁示原則 7、10; 2026-10-22 run11; **2026-10-23 perm-run01 增編輯器草稿與對話框重建**; 單一擁有者 `src/js/draftSync.mjs`）

軸: 站點(四清單頁／兩反向關聯對話框) × 觸發(首次載入／使用者切換編輯模式／store 變新／store 未變而旗標切換) × 草稿種類(無／已提交之未存修改〔`isModified`〕／儲存格編輯器開啟中〔已輸入、未提交〕) × 表內容是否已異於基準(內容／列增刪／名次／僅 order 數值與伺服器專有欄) × 自己存檔進行中與否 × 使用者動作(存檔／按「重新載入」／Esc／Enter).

- **規則**:
  1. **清單頁**(`LayoutContent{Targets,Pemis,Grups,Users}.vue`): computed `changeParams` 以 `planDraftSync({ first, editChanged, storeChanged, hasDraft, saving })` 決定: 首次、編輯模式被使用者切換、或按「重新載入」(`syncTick` 遞增)→ `rebuild`(放棄草稿, 同修改前); store(本表, 群組頁另含使用者表、權限頁另含群組表之顯示來源)未變(重算由其他反應式依賴觸發, 如語系切換使 `genOpt` 之依賴變動)→ `rebuild`(同修改前, 表頭等隨之更新; 未存編輯旗標切換不觸發重算: `changeParams` 以非響應式鏡像 `syncMark.dirty` 讀取); store 變新且**無草稿** → `rebuild`(同修改前, 他人變更即時可見); store 變新且**有草稿** → `keep`(自己存檔進行中者 `keepQuiet`): **不重建 `items`／`opt`／`baseline`／`baseRows`**, 只以 `isDraftStale({ keyTable, rows, baseline })` 更新 `staleNotice`(本表整表已異於基準才為真: 內容、列增刪、**名次**; 僅 `order` 數值改變而名次不變、伺服器專有欄不同、空值不同表示、外部同步內容未變者為假).
  2. `hasDraft` 以函數惰性傳入, 僅於 store 變新時才求值(computed 不因旗標切換而在 store 未變時依賴它); `keep` 時**不更新** `syncMark`, 使存檔成功(`isModified` 歸零)後之重算能依最新 store 重建.
  3. `rebuildDraft` 一律: 以同一份來源列產生 `items` 與 `baseline`、記 `baseRows`、`isModified=false`、`staleNotice=false`、更新 `syncMark`、再 `genOpt`、`$nextTick` 後綁定編輯結束監聽(規則 10). 存檔前之預覽(`getSavePreview／getAddImpact／getDelImpact／reuseDeletedIds`)與外部列守門(`getExternalEdits`)以 `baseRows`(草稿所依據之列)為「舊」, 不用已變新之 store.
  4. **提示 UI**: 橫幅 `data-fmid="<表>-banner-stale"`(以 `v-for` 渲染, 無提示不渲染任何節點; 淡橘底沿用 `getBannerStyle('warn')`、警告圖示、文字 `staleDraftNotice`)與「重新載入」鈕(`<表>-banner-stale-reload`, `@click="reloadDraft"`: 放棄草稿; **`reloadDraft` 只遞增響應式 `syncTick`, 由 `changeParams` 重算並於 computed 內重建**, 使 `genOpt` 讀取之反應式來源〔語系等〕的依賴重新收集〔外審 sol 第 4 點; e2e E2E-025〕); 鈕樣式 `.staleReloadBtn`. 存檔被拒之訊息仍為 `saveStale`(文字不改).
  5. **對話框提示**(`VeGrupBlngUsers／VePemiBlngGrups`): 提示 `data-fmid="grup-blng-users-banner-stale"／"pemi-blng-grups-banner-stale"`(`v-for` 渲染; 文字 `staleDraftNoticeDialog`)於 `staleNotice`(有草稿而表已異於基準)或 `subjectNotice`(主體被取代, R-SUBJECT-ID-01)為真時顯示; 每次 `show()` 歸零. **自己存檔所致之推播不提示**: `syncStore` 之 `saving` 取 `vo.ownSaving`(存檔 API 呼叫前設真、失敗時歸零、`show()` 歸零; 否則成功訊息框顯示期間自己之寫入被判成他人更新).
  6. **直接指派編輯器之回填比對整表**(外審 sol 第 1 點; `LayoutContent{Users,Grups,Pemis}.vue` 之 `showVeCgrupsById／showVeCpemisById／showVeCrulesById`): 開窗前記下整表基準 `baseline0 = cloneDeep(vo.baseline)`, 回填前以 `isDraftStale({ keyTable, rows: vo.baseRows, baseline: baseline0 })` 比對, 有異即放棄回填並提示 `saveStale`.
  7. **名稱(／email)唯一檢查以草稿所依據之列為「舊」**(外審 sol 第 6 點): 三頁 `getNameErrs(opt.rows, vo.baseRows, …)`.
  8. **改動之外部列改帶庫內之伺服器管理欄**(外審 sol 第 3 點; 伺服端 `restoreServerFields`, perm-run01 起不分外部列與後台列一律套用, 見 R-CONTRACT-01 規則 4).
  9. **自己存檔進行中所致之推播不是他人更新(run12)**: 清單頁存檔請求送出前設非響應式 `saveMark.saving = true`, 回應〔成功或失敗〕一到與 `finally` 歸零; `planDraftSync` 於「store 變新且有草稿」且 `saving` 為真時回 `'keepQuiet'`(保留草稿與基準, 不更新 `staleNotice`); 失敗(含 `saveStale`)時 `.catch` 內依目前 store 重算 `staleNotice`. 兩對話框為 `ownSaving`(規則 5).
  10. **儲存格編輯器開啟中視為有草稿(第 115 項; perm-run01, 修已知缺口 (c))**: 使用者在儲存格輸入了文字、尚未按 Enter 或失焦時, 輸入只在編輯器內(`rowsChange` 未觸發, `isModified` 仍假), 重建清單(`setRowData`)會直接丟掉編輯器與輸入而無任何提示. 故 `hasDraft` ＝ `hasDraftNow({ dirty: syncMark.dirty, editing: isCellEditing($refs.rftable) })`(`src/js/cellEditing.mjs:isCellEditing` ＝ ag-grid `getEditingCells()` 非空; 取不到 api 一律視為未編輯, 不阻擋重建); 編輯器開啟中收到推播 → `keep`: 不重建、凍結基準、`staleNotice` 依基準判定並顯示橫幅. 編輯結束(`cellEditingStopped`: Enter 提交 → `rowsChange` 先設 `isModified` 為真續保留; Esc 或無變更 → 無草稿)後 `afterEditing()`: `isModified` 為假而 store 於期間已變新者補一次 `reloadDraft`. 監聽由 `bindCellEditingStopRetry` 於每次重建後綁定（同一 api 只綁一次; api 尚未可用時 100 ms 輪詢至多 30 次）. 兩對話框無可編輯儲存格(勾選框與 chip 即時提交), 但 `syncStore` 仍以同一函數求值，日後加入編輯儲存格時自動適用.
  11. **對話框開而未編輯時收到推播: 照舊重建並更新基準(perm-run01, 修已知缺口 (b); 原則 10「無未存修改時照舊重建」)**: `syncStore()`(watch 本表與主體表一律呼叫)以 `planDialogSync({ show, storeChanged, stale, dirty, editing, saving })` 決定: 未顯示或 store 未變 → `none`; 自己存檔中 → `keepQuiet`; 表未異於基準 → `none`; 異於基準且無草稿 → `rebuild`(`rebuildDialog()`: 以目前 store 重生 `items`、`baseline`、`rowStates`、主體列, `markDataReload` 後 `genOpt`, 歸零 `isModified`／`staleNotice`); 異於基準且有草稿(`isModified` 或編輯器開啟) → `keep`(`staleNotice`＝真). 唯讀檢視亦照此重建(無草稿可言). 對話框 `rowsChange` 守門含 `systemProcing`(重建後 ag-grid 非同步事件不視為使用者編輯).
  12. **主體被取代時不重建、顯示提示**: `syncStore` 先以 `checkSubject` 比對主體(R-SUBJECT-ID-01), 非 `ok` → `subjectNotice` 為真且不執行 `rebuildDialog`(無從續編).
- **站點全集**(6／6): 四清單頁(`changeParams`／`rebuildDraft`／`reloadDraft`／`bindEditing`／`afterEditing`／橫幅／`.staleReloadBtn`)與兩對話框(watch→`syncStore`／`rebuildDialog`／`bindEditing`／`afterEditing`／提示)皆已套; `unit-draftSync` DS-4a～4o 以靜態斷言守護、DS-5 以原始碼取出 `syncStore` 動態執行、DS-6／7 純函數決策表; `unit-cellEditing` CE-S 站點.
- **盤點指令(可重跑)**:

```
rg -n "planDraftSync\(|planDialogSync\(" src
# 期望: src/js/draftSync.mjs 定義各 1 + 四清單頁 changeParams 各 1 planDraftSync + 兩對話框 syncStore 各 1 planDialogSync
rg -n "isCellEditing\(" src
# 期望: src/js/cellEditing.mjs 定義 1 + 四清單頁 hasDraft 各 1 + 兩對話框 syncStore 各 1
rg -n "rowsOld: vo\.(targets|pemis|grups|users)\b" src/components
# 期望: 0(存檔前預覽與外部列守門以 vo.baseRows 為舊)
```

- **測試**: `unit-draftSync`(refsChanged 5、planDraftSync 決策表＋惰性、isDraftStale 4 表 × 9 情境、站點 DS-4、對話框 syncStore 動態 DS-5 共 36、`hasDraftNow`／`planDialogSync` 決策表 DS-6 共 70、`checkSubject` DS-7 共 15)、`unit-cellEditing`(ag-grid api 替身驅動: 編輯器開啟判定、監聽只綁一次、輪詢重試)、`e2e-concurrent-edit`(E2E-007／008 對話框開而未編輯 → 重建; E2E-009～012 四清單頁編輯器開啟中 → 不重建、輸入保留、橫幅、存檔被拒; E2E-013 Esc 後補重建)、`e2e-external-rows` E2E-016～030(本輪不改, 回歸).
- **已知限制**: ①保留草稿期間「所屬使用者／所屬群組」等取自他表之顯示欄不隨推播更新; ②對話框之提示於「有草稿且表已異於基準」時出現, 無草稿者直接重建而不提示; ③保留草稿(keep)之重算不呼叫 `genOpt`, 保留草稿期間切換語系不會更新表頭文字, 按「重新載入」或存檔成功後恢復; ④編輯器草稿僅限 ag-grid 儲存格編輯器; 其他尚未提交之輸入（如對話框內 chip 的模式下拉彈窗開啟中）重建時會被關閉——chip 選擇為即時提交, 彈窗無輸入內容, 視為可接受.

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
