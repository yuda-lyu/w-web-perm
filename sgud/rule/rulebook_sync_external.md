# 規則帳本:外部列受保護與離線維運工具

本檔為 `sgud/rule/rulebook.md` 之分冊(2026-10-22 主控依使用者指示自原 312KB 之帳本依類型分拆; 2026-10-23 perm-run01 再將 `rulebook_sync.md`〔73KB〕依類型拆為四冊, 節(###)之標題與內容不變, 依規則編號 `R-…` 查找者請用 `rulebook.md` 之索引).本冊收自 `rulebook_sync.md` 之「外部列受保護與過期快照基準」一節的 R-EXT-OWN-01、R-SHIP-TOOLS-01; 同節之 R-BASELINE-01、R-DRAFT-KEEP-01、R-RELOAD-GUARD-01 在 `rulebook_sync_baseline.md`.

## 外部列受保護與過期快照基準(2026-10-22 run07, ADR-037; 來源: 使用者 2026-10-21「以外部同步為主」裁示、主控依原則定案 F-23／F-26〔`C:\opensrcOper\dnow\20261021095534\主控依原則定案-F07-F23.md`〕、`R-PRINCIPLE-00` 原則 3／5 與適用表 k、l)

### R-EXT-OWN-01 外部列守門: 後台整表寫入不得改動外部列之身分／結構欄, 單一擁有者 `src/js/externalRows.mjs`(l)

軸: 表(`targets`／`pemis`／`grups`／`users`) × 列類別(外部列〔`from` 為非空字串〕／後台列〔`''`、缺欄、`null`／數字／布林〕) × 動作(新增／改身分結構欄／改指派欄／改 `from`／改 `order`／刪除) × `opt.lockExternalRows`(`'y'` 預設／`'n'`) × 基準(有／無) × 入口(後台整表寫入／`modeEditUsers='for:grups'` 之 `pickKeysOnly`／外部同步／離線工具).

- **規則**:
  1. **判別(D1)**: `isExternalRow(row)`＝`from` 為非空字串. 外部同步入口只收非空字串 `from`(`parsePayload`: `invalidFromInPayload`), 故 `''` 可證非外部同步、非字串必為後台寫入; 不採宣告式白名單(未宣告來源 fail-open). 種子 users `teamA`→`''`(`g_initialData.mjs`、`src/schema/tables/users.mjs`).
  2. **強制點唯一**: `server/procCore.mjs:updateTabItems`(四表共用), 於表鎖內、任何寫入之前, 次序(run11 後): select → [有基準]`checkBaseline`(R-BASELINE-01, 表級) → [lock]`restoreExternalOrder` → … → `ltdtDiffByKey` → [lock]`dropServerOnlyDiff` → [lock]`restoreServerFields`(改動之外部列改帶庫內伺服器管理欄, run11 外審 sol 第 3 點) → `checkExternalWrite` → [無基準且外部列有 diff]`saveBaselineRequired` → `validateRowsBeforeWrite` → 引用連帶 → 寫入. **基準先於外部列守門**(草稿過期時應回「請重新載入」而非誤導之「外部列不可修改」, run07 U1 觀察 1). **〔perm-run01 更新〕** 上列次序中 select 與 `checkBaseline` 改由 `guardWrite`（`read` → 核心 `compareBaseline` → `write`）承擔, 其後 `restoreExternalOrder` → … 皆在 `write` 內; `dropServerOnlyDiff`／`restoreServerFields` 改為 `all:true`（**不分外部列與後台列、不論 `lockExternalRows`** 一律套用: 伺服器專有欄存檔不採用客戶端值, R-CONTRACT-01 規則 4）.
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

### R-TOOL-SAMEFILE-01 判斷「兩路徑是否同一檔」須以 bigint 取 inode(2026-10-24 perm-run01 範圍三; `unit-refAudit` RA-037 偶發失敗之根因)

- **規則**: 以 `fs.statSync` 之 `ino` 判斷同一檔(硬連結別名)時一律傳 `{ bigint: true }` 並以 BigInt 比對(`a.ino !== 0n && a.ino === b.ino && a.dev === b.dev`). 預設 Number 只有 53 位元精度, NTFS 檔案識別碼＝序號(高 16 位元)＜＜48＋記錄號(低 48 位元), 序號 ≥ 32 即超過 2**53; 相鄰 MFT 記錄(同序號、記錄號差 1)之不同檔轉成 Number 後相同 → 被誤判為同一檔 → `authRefsAudit.mjs --clean-out` 拒絕寫出(離開碼 2, `失敗: --clean-out 不得與輸入匯出檔為同一檔`). 判準單一擁有者 `server/tools/authRefsAudit.mjs:isSameFile(fpA, fpB, statFn)`(`statFn` 為單元測試注入接縫).
- **外審 sol 補強(#6／#7, 2026-10-24)**: ①路徑字串比對僅 `win32` 不分大小寫(`isSameFile(…, platform = process.platform)`), 其他平台大小寫敏感——`in.json` 與 `IN.json` 在大小寫敏感檔案系統可為不同檔, 原一律轉小寫會誤拒(RA-037d); ②兩者皆存在時先比 `fs.realpathSync.native`(解開符號連結與父目錄別名), 再比 BigInt inode＋dev——檔案系統不提供可用 inode(`ino=0n`)時符號連結別名仍被辨識, 不致被當成不同檔而覆寫輸入匯出檔(RA-037e: 以目錄 junction 驗證, 此環境檔案符號連結需特權〔EPERM〕, RA-036e 亦因此略過).
- **根因證據(2026-10-24, Windows 11 / NTFS / Node 24)**: ①未改碼重跑 `unit-refAudit` 8 次失敗 1 次(12.5%), 失敗為 RA-037「不同路徑正常」之第三次 `--clean-out out1`(`in.json` 與已存在之 `in.json.clean`); ②`tmp/perm-run01/inoProbe2.mjs` 批量建立／刪除 6000 個檔: 293 對「不同檔、`statSync().ino` Number 相同而 BigInt 不同」(例: `12384898979555387` 與 `…388`), 全部 ino 皆 > 2**53; ③修後同檔案 30 次全綠(50 passing/次).
- **站點全集**: `rg -n "\.ino\b" server src g_*.mjs`(期望: 只有 `authRefsAudit.mjs:isSameFile`); 其他「同一檔」判定(`authRefsClean` 的 `--backup` 與資料庫檔別名)走 `wx` 旗標與路徑正規化, 不比 inode(RA-057／058).
- **測試**: `unit-refAudit` RA-037b(注入 `statFn` 之相鄰 inode 單元, 修前紅)、RA-037c(真實檔案系統找出 Number 相同而 BigInt 不同之檔對, 以 CLI 實跑 `--clean-out`, 修前紅〔離開碼 2〕; 此環境找不到這類檔對則略過).
