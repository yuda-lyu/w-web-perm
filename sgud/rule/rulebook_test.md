# 規則帳本:測試配置與測試輔助

本檔為 `sgud/rule/rulebook.md` 之分冊(2026-10-22 主控依使用者指示自原 312KB 之帳本依類型分拆;節之標題與內容不變).索引與其他分冊見 `rulebook.md`.

## 測試配置

### 分層與執行指令

| 層 | 前綴 | 判準 | 執行 |
|---|---|---|---|
| unit | `unit-` | 純函式 / 本機 http 模擬, 不起專案伺服器 | `npm test`(全域 §16.5 標準字串, 不可改動) |
| api | `api-` | 直打 11006 真後端(`startApi()` 只起後端), 不經 UI | 同上 |
| e2e | `e2e-` | Playwright 真瀏覽器 + 8090 dev server + 11006 後端; 語意斷言 + pixel baseline | 逐檔隔離全跑 `node test/tools/run-e2e-isolated.mjs`; 單檔 `npx mocha test/e2e-<flow>.test.mjs --reporter list --timeout 300000` |

- 指定檔或只跑 unit+api: 自行編寫指令, 不寫進 scripts. 如 `npx mocha test/unit-*.test.mjs test/api-*.test.mjs --timeout 180000`.
- 標準圖產製: `node test/e2e-<flow>.test.mjs --baseline [--names a,b] [--langs eng,cht] [--write-mode missing|changed]`(截圖前 gate; 產完先交審再跑比對, 依技能 §7.6). 2026-09-28 起 10 個產圖檔之篩選一律為共用 `createBaselineGate`: `--names` 每項可帶語系前綴(`eng-`/`cht-`), 給階段圖鍵只寫該張、給案例鍵或其**邊界**前綴(`E2E-005` 不命中 `E2E-0051-x`)寫該案全部階段、不符任何鍵即於啟動服務前報錯並列出可用鍵; `--langs` 須完全等於已宣告語系; env `E2E_BASELINE_OUT_DIR=<dir>` 把寫檔導到暫存目錄(改共用層或管線時之等價驗證, 不動 `test/pics`). 自檢: `node test/e2e-<flow>.test.mjs --baseline --names __none__` 須以非 0 結束並列出可用鍵.
- 超過 2 分鐘者 `run_in_background`; 跑完判準含 `test/_tmp/` 無殘留、`netstat` 無殘留 server、`./testPending/` 無本輪新增.
- 服務 port 與 seed 腳本見 `CLAUDE_settings.md`(agent 不改).

### 目錄配置(對應全域 §16.4)

| 路徑 | 本專案內容 |
|---|---|
| `test/*.test.mjs` | **〔run10 實數 2026-10-22: 78 檔 = unit 51／api 14／e2e 13; 本輪新增 unit 1 檔 `unit-srLogMark`(srLog 位置定位, R-SRLOG-MARK-01; 核心 `test/tools/srLogMark.mjs`)〕** **〔run09 實數 2026-10-22: 77 檔 = unit 50／api 14／e2e 13; 本輪新增 api 1 檔 `api-cleanExternal`(外部列夾具收尾單一入口之行為契約, R-TEST-EXT-CLEAN-01); 以下為 run07 紀錄〕** 72 檔(unit 46 / api 13 / e2e 13; 2026-10-22 07:36 run07 以 `ls test/*.test.mjs` 實數盤點, 其中 e2e 13 含 N 子代理撰寫中之新檔 `e2e-external-rows`、`e2e-ref-cascade`〔撰寫中, 檔數會變, 以 `ls` 為準; 本表之 e2e 檔數與 R-TEST-SCOPE-01 之「11 檔」由 N 於定案後維護〕; 原記「44 檔(unit 24 / api 9 / e2e 11)」已落後實數: run04～run06 新增之 unit／api 檔, 如 `unit-getAuthWarn`／`unit-editorRows`／`unit-refCascade`／`unit-procCore-refCascade`／`unit-refAudit`／`unit-getCascadePreview`／`api-refCascade`, 見各自帳本節, 下列歷次紀錄未逐一回補〕; **run07 新增 unit 8 檔**〔`unit-externalRows`／`unit-rowDigest`／`unit-syncKeep`／`unit-procCore-external`／`unit-externalUi`／`unit-getAddImpact`／`unit-relDialogs-baseline`／`unit-fromAudit`〕與 **api 1 檔**〔`api-externalRows`〕, 見下節 ADR-037 對照; 2026-10-21 第 101 項 run01 加 `unit-authMerge-characterize`、`api-authMerge-characterize`〔授權合併現況刻畫〕, run04 依使用者最終裁示改為規格並更名 `unit-authMerge`、`api-authMerge`(R-AUTH-MERGE-00／01; 檔數不變), run03～run04 另加 `unit-pairRowsToSnapshot`／`unit-getPropKey`／`unit-relDialogs`／`api-keyProp`、`unit-keyCheck`／`unit-procCore-nameUniq`／`unit-nameDupReport`／`api-mapKey`(見各自帳本節); 2026-10-20 run01 依 ADR-030 加 `unit-cvKpToObj`、`unit-e2e-lifecycle`〔unit 21→23〕與語意斷言 e2e `e2e-array-form`〔無標準圖; e2e 10→11〕; 同日依 ADR-029 加 `unit-eachOwn`, run02 再加 `unit-getOwn`、`unit-perm-active`, unit 18→21; 2026-10-14 依 ADR-027(X1)加 `unit-resolveShellWorker`, unit 17→18; 同日依 ADR-026 加 `unit-validateRows` / `unit-dataChannel` / `unit-procCore-writeValidate` / `unit-wwebperm-init` / `unit-seedChild`, unit 12→17; 以下為歷次: 2026-09-24 加 `unit-legendFit`; 2026-09-25 加 `unit-maskLog` / `unit-wrapInjected` / `unit-sdk-tokenSafety` / `api-tokenSafety`; 2026-09-28 `e2e-doubleclick` 依 ADR-017 Update 改名 `api-doubleclick`, api 7→8、e2e 11→10, 總數不變; 2026-09-29 依 ADR-025 加 `unit-submitGuard` / `unit-lockSave` / `unit-procCore-updateTabItems`, unit 9→12), 見下節對照 |
| `test/tools/` | **〔run08〕離線維運工具核心已不在本目錄**: `fromTools.mjs`／`authRefsClean.mjs`／`authRefsAudit.mjs`／`nameDupReport.mjs` 已搬至 `server/tools/`(npm 會出貨, R-SHIP-TOOLS-01); `fromTools.mjs` 為 `g_fixFromType.mjs`／`g_purgeFrom.mjs` 之執行核心(讀寫、備份、回驗、占用偵測 `checkDbNotInUse`〔Windows 資料夾改名再改回, 僅 `--apply` 偵測〕; 純函數在 `src/js/fromAudit.mjs`). **本目錄 run07 新增**: `dbHolder.mjs`(測試輔助: 開啟 lmdb 並持有以模擬後端占用, 供 `unit-fromAudit` 驗證「占用時拒絕寫入」)、`unitExt.mjs`(外部列／基準單元測試共用: 規格常數 `SPEC_*`、`mkRow`／`rowWith`、`deepFreeze`)、`api-setup.mjs` 增 `purgeExternalRows`(後台不得刪外部列, 測試框架之收尾／重置以 `woItems.delAll` 清外部夾具, `restoreTables` 於有待清外部列時先呼叫之; 見 R-EXT-OWN-01 測試對照); 其餘: `authMerge.mjs`／`authMergeStats.mjs`／`authMergeReport.mjs`／`authMergeGolden.json`(第 101 項, 2026-10-21 run04 改為規格工具: 資料建構、規格參考實作 `mergeSpec` 與舊規則複製 `mergeLegacy`〔皆不入 `src/`〕、窮舉掃描、報告產生器〔`--golden` 重產彙整、`--audit <json>` 部署前稽核「新規則 vs 舊規則」〕; 原 run01 候選語意 S1～S4 已結案移除), `e2eLib.mjs`(e2e 共用設施之**單一橋接檔**: 轉出 devDependency `w-package-tools-e2e`(`^1.0.6`; 2026-10-01 由 `^1.0.3` 升版, src 不變、依賴 playwright `^1.63.0` 使截圖之 Chromium 由 151 換為 153)之 `src/*.mjs` 53 個模組——2026-09-28 建立時指向姊妹專案 w-web-sso 之 `srcPack/src/`, 2026-09-29 srcPack 移入該套件發布 1.0.2 並刪除後改指套件, 2026-09-30 升 1.0.3(新增 `probeStuckTooltip`; 總紀錄見 w-web-sso ADR-078); 本檔他處之「srcPack `X`」即 `w-package-tools-e2e/src/X.mjs`(同名同行為); 共用層與測試檔一律自此或自 `e2e-setup.mjs` import, 不直接引用套件路徑; 套件依賴 sharp / pixelmatch / pngjs / playwright 自本專案 node_modules 解析)、`e2e-setup.mjs`(C1–C14 契約: 通用部分組裝自 srcPack, 本檔只留 port / spawn / 種子 / settle 組合 / 夾邊方式與 perm 專屬互動原語, 匯出名稱與簽章不變)、`api-setup.mjs`(token 常數、`startApi`、`getWoItems` 唯讀、`callRpc` 資料通道直打、`readSrLogSince` 讀本次後端 srLog; **〔run09〕`cleanExternalFixtures` 為外部列夾具收尾之單一入口、`purgeExternalRows` 增 `froms` 參數, 見 R-TEST-EXT-CLEAN-01**)、`srcScan.mjs`(原始碼靜態盤點, 站點不變式 SITE-* / WRAP-SITE-* 共用)、`run-e2e-isolated.mjs`(逐檔隔離 runner)、`seedChild.mjs`(種子子行程之完成判定 `runSeedChild`, R-SEED-01; 2026-10-14)、`unitOrm.mjs`(單元測試共用之 ORM 替身 `mkTable`(對齊 w-orm-lmdb 1.0.38)、`mkProcOrm`(getMapOrm → getProc 組真 procOrm)、`mkSrLog`; 2026-10-14, A-9 收斂)、`runChild.mjs`(`runChild(code, { timeoutMs, maxOldSpaceMb })` 以子行程執行一段 ESM 並設逾時與堆積上限, `fileUrl(rel)`／`describeChild(c)`: 巨大 `length`〔2**32-1〕案例修前空轉數十秒至崩潰且為同步迴圈, mocha 逾時中斷不了, 一律放子行程; 2026-10-20, ADR-029)、`wwebpermInitChild.mjs`(`unit-wwebperm-init` 之子行程: 於獨立行程建構 WWebPerm, 行程結束即關閉 srLog 之 pino transport, 測試資料夾才刪得掉; 2026-10-14)、`baseSeed.mjs`(`BASE_SEED_COUNT` 與 `assertPristineSeed`: 無副作用之純模組, `e2e-setup.captureBaseSeedOnce` 與 `unit-e2e-lifecycle` 共用; R-E2E-ISO-01; 2026-10-20 run01) |
| `test/pics/<flow>/` | 10 個 flow: grups / init / layout / pemis / rela-grup-pemi / rela-pemi-rule / rela-user-grup / stainfor / targets / users; 檔名 `<flow>-<lang>-E2E-NNN-<序>-<kebab>.png` |
| `test/staLogs-golden/` | 統計核心 golden fixture: `logs/`(173 檔)、`expected.json`(真理, 由 `legacy/` 舊實作於假時鐘產出, 不得手改)、產生器 `gen-expected.mjs` 與輔助 `setTz` / `fakeDate` / `exitWorker`(自足群組, 產物落本目錄) |
| `test/_tmp/` | 臨時 settings(`settings-e2e-<pid>-<seq>.json`)、unit fixture 副本; gitignore, 測完由 `cleanup()` / `after` 刪 |
| `./testPending/` | pixel 比對失敗三聯組; gitignore, 不自動刪 |

### 規格 → 測試檔對照

| 規格來源 | 案例 | 測試檔 | 層 |
|---|---|---|---|
| 流程_後台使用者清單 | E2E-001~012 | `e2e-users` | e2e |
| 流程_後台群組清單 | E2E-001~010 | `e2e-grups` | e2e |
| 流程_後台權限清單 | E2E-001~010 | `e2e-pemis` | e2e |
| 流程_後台標的清單 | E2E-001~011(E2E-011 2026-10-14 新增: 路徑含 HTML 標記被拒且資料不變) | `e2e-targets` | e2e |
| 流程_使用者群組關聯 | E2E-001~010 | `e2e-rela-user-grup` | e2e |
| 流程_群組權限關聯 | E2E-001~007 | `e2e-rela-grup-pemi` | e2e |
| 流程_權限規則關聯 | E2E-001~006 | `e2e-rela-pemi-rule` | e2e |
| 流程_應用啟動與登入 | E2E-001~005 | `e2e-init`(打後端 dist, 非 dev server) | e2e |
| 流程_統計資訊事件展示 | E2E-001~008 | `e2e-stainfor`(`staEventMock`; E2E-008 以 case `settings:{ staEventMock:'many' }` 換 13 事件) | e2e |
| 流程_後台導覽版面 | E2E-001~003 | `e2e-layout`(統計頁截圖以 `staEventMock` 定值; E2E-003 含統計圖圖例檢查) | e2e |
| 流程_查詢使用者權限 | E2E-001~006 | `api-getPerm` | api |
| 流程_查詢指定使用者權限 | E2E-001~006 | `api-getPermUserInfor` | api |
| 流程_外部應用同步權限資料 | E2E-001~018(007～009 2026-10-14 新增: 寫入前驗證; 010～011 同日 run05 新增: 數字主鍵存為字串、跨 from 同鍵拒絕, ADR-028; 012～018 2026-10-21 run03 校正補載〔實作與測試早於 spec: 名稱／標的 id 非空、`length` 鍵、非物件／空物件／空白列之守門〕; 非純量欄位 API-sync-018／019 見 R-FIELD-SCALAR-01, 尚無對應 spec 案例) | `api-syncAndReplaceTabs`(API-sync-001～022) | api |
| 流程_權限規則合併計算 | E2E-001~016(spec 自陳單元層級; 011 為孤兒不變式, 2026-10-21 run03 補載; 005／006 依 R-AUTH-MERGE-00 改寫, 012～016〔使用者之例四種組合、交換律、空 AND 項收回、同名重複規則、三項目窮舉〕2026-10-21 run04 新增) | `unit-getUserRules`(UNIT-005b／005c／005g、UNIT-AM-001～006)、`unit-authMerge`(SP-*)、`api-authMerge` | unit / api |
| 流程_後台使用者清單〈參數來源〉`modeEditUsers` 三態 | — | `api-updateUsers-forGrups`、`unit-procCore-mergePickKeysOnly` | api / unit |
| ADR-015 寫入通道授權契約(＋2026-10-14 Update: 資料通道只開 select) | — | `api-verifyConn-auth`(AUTH-000～004; DC-FUNCLIST-001、DC-WRITE-001、DC-SELECT-001)、`unit-dataChannel`(DCU-001～004) | api / unit |
| ADR-009 整表批次 diff 契約 | — | `api-updateTabs`(API-update*-001/002) | api |
| ADR-026 寫入前驗證與寫入失敗回語系鍵(R-ORM-01／02、R-KEY-01) | — | `unit-validateRows`(VR-001～008、VR-EQ-001／002)、`unit-procCore-writeValidate`(WV-001～008、WV-ERR-001～003、WV-PROTO-001)、`api-updateTabs`(API-updateTargets-003～005、API-updateGrups-003、API-updatePemis-003、API-updateUsers-003)、`api-syncAndReplaceTabs`(API-sync-007～009)、`e2e-targets` E2E-011 | unit / api / e2e |
| ADR-026 已移除設定 fail-fast、資料通道設定、建構錯誤入 srLog(R-ORM-03、R-WSD-01、R-INIT-01) | — | `unit-wwebperm-init`(INIT-001／002、SITE-OPT-001、SITE-WSD-001、SITE-INIT-001) | unit |
| ADR-026 種子子行程之完成判定(R-SEED-01) | — | `unit-seedChild`(SC-001～004、SC-SITE-001) | unit |
| ADR-028 數字主鍵以字串處置、外部同步跨 from 同鍵拒絕(R-ORM-04、R-SYNC-01) | — | `api-syncAndReplaceTabs`(API-sync-010／011)、`unit-procCore-updateTabItems`(UNIT-UTI-010)、`unit-validateRows`(VR-009、VR-EQ-003) | api / unit |
| ADR-027 打包後可用(X1; R-PKG-01) | — | `unit-resolveShellWorker`(RSW-001～007、RSW-REAL-001／002、SITE-X1-001／002)、`unit-staEvent-golden` WORKER-001／002、`e2e-stainfor`／`e2e-layout`(真後端之 worker) | unit / e2e |
| ADR-029 迭代使用端傳入之物件(R-OBJ-ITER-01)、整表寫入 rows 非陣列即拒絕(R-ORM-05) | — | `unit-eachOwn`(EO-001～008 走訪函數契約; SITE-OI-001／002 站點不變式)、`unit-validateRows`(VR-OI-001～006)、`unit-procCore-mergePickKeysOnly`(UNIT-PK-OI-001～004)、`unit-procCore-writeValidate`(WV-OI-001～004)、`unit-getUserRules`(UNIT-OI-001～007 含 004a／004b)、`api-updateTabs`(API-updateTargets-006～009)、`api-syncAndReplaceTabs`(API-sync-012／013)、`api-getPermUserInfor`(API-getPermUserInfor-007); 巨大 length 案例經 `test/tools/runChild.mjs` 於子行程(逾時＋堆積上限)執行; **run02(R-AUTH-PATH-01、R-ORM-05 外部同步、R-KEY-01 補漏)**: `unit-getOwn`(GO-001～005 函數契約; RE-001／002 `getRuleEnable`; SITE-GO-001～003 站點不變式)、`unit-perm-active`(PA-001～006, 外部 SDK `active`)、`unit-getUserRules`(UNIT-AP-001～006)、`unit-procCore-mergePickKeysOnly`(UNIT-PK-AP-001～003)、`unit-procCore-updateTabItems`(UNIT-UTI-011)、`unit-procCore-writeValidate`(WV-OI-006 `isRowObj`)、`api-syncAndReplaceTabs`(API-sync-014／015／016／017)、`api-getPermUserInfor`(API-getPermUserInfor-008, 真後端) | unit / api |
| ADR-030 單一行程全跑之 DB 收尾對稱(R-E2E-ISO-01) | — | `unit-e2e-lifecycle`(LC-001～003 站點不變式; BS-001～003 `assertPristineSeed`); 最小重現: `npx mocha --no-parallel test/e2e-rela-user-grup.test.mjs test/e2e-users.test.mjs --grep "E2E-010-same-name-users\|E2E-001-list-view"`(修前 2 敗, 修後全過); 全域驗證 `npm test` 單一行程全綠 | unit / e2e |
| ADR-030 授權資料共用解碼(R-AUTH-DECODE-01)、站點 35 | — | `unit-cvKpToObj`(CO-001～009、DF-001～006、PR-001～005〔PR-005 固定第三輪外審 sol#2 之已知限制〕、SITE-AD-001／002)、`e2e-array-form`(AF-000 對照組、AF-001～006 五元件; 真後端 `getPermUserInfor` 前後比對; 不產標準圖) | unit / e2e |
| ADR-031 授權存檔不變: ~~保序(R-AUTH-ORDER-01)~~〔run04 已被 R-AUTH-MERGE-00 取代〕、無法無損表示者 fail-closed(R-AUTH-LOSSY-01, run04 僅剩同名 OR+AND 一格)、清單頁共用解碼(R-AUTH-LIST-01) | — | `unit-cvKpToObj`(以 run04 後現況為準:CO-010 鍵序＝首次出現序; KL-001／002／004／005 `getKpLossy`; FM-001 `fmtLossyMsg`; JN-001; PR-001／001b／003／004 窮舉〔含幻影名稱空間〕存檔前後授權相等＋有損格皆被判定; PR-005 具體反例; PR-006; SITE-AD-001～003〔003 反向守護排序保護模組不得再出現〕;KO／GL／WL／KL-003 已隨模組移除)、`unit-eachOwn`(SITE-OI-001)、`e2e-array-form`(AF-007～009 清單頁; AF-010a～d 存檔後授權不變; AF-011a～d 有損 fail-closed; AF-012a 整數式名稱新啟用 AND 可存; AF-016a／b VeCrules 兩態; 語意斷言、不產標準圖) | unit / e2e |
| ADR-032 關聯對話框容錯(R-REL-PARSE-01)、以列身分配對存檔快照(R-REL-PAIR-01)、資料驅動名稱轉屬性鍵安全轉型(R-KEY-PROP-01) | — | `unit-pairRowsToSnapshot`(PR-ID-001～015)、`unit-getPropKey`(KP-001～006)、`unit-relDialogs`(SITE-RP-001～006、SITE-GK-001／002 靜態站點不變式)、`unit-getUserRules`(UNIT-KP-001～007)、`unit-cvKpToObj`(CO-KP-001～003)、`api-keyProp`(API-KP-000～002, 真後端)、`e2e-array-form`(AF-013a／b／c 新增列後開「所屬…」; AF-014a／b／c／d／e 開框後 store 重排／刪除、顯示不錯位、清單頁回填以 id; AF-015 批次按鈕; 語意斷言、不產標準圖); 變異驗證見 ADR-032 與修正報告 | unit / api / e2e |
| ADR-031 外部同步名稱／標的 id 須為非空字串(R-SYNC-NAME-01) | — | `api-syncAndReplaceTabs`(API-sync-020～022; API-sync-017 改以 users 驗 order:0) | api |
| ADR-033 授權合併規則(R-AUTH-MERGE-00／01;第 101 項 run04;**規格**——前身 run01 之現況刻畫 `unit-authMerge-characterize`／`api-authMerge-characterize` 已於 2026-10-21 依使用者最終裁示改寫並更名) | — | `unit-authMerge`(SP-MIN 最小例子含使用者之例、SP-SCAN 窮舉彙整〔9 組 223,384 格,GOLD 為 `test/tools/authMergeGolden.json`,以 `node test/tools/authMergeReport.mjs --golden` 重產〕、SP-PROP〔逐管理對象獨立、閉式、交換律窮舉、隨機重排、層同形、只收回〕、SP-PG、SP-DROP、SP-TGT、SP-FORM、SP-REAL〔種子資料、規格情境、啟用 AND 只收回、編輯器重存不撤權、刪除勾選＝n、後增管理對象〕、SP-AUDIT〔含稽核指令實跑〕)、`api-authMerge`(API-chm-000／099／13 個代表格, 真後端; 單元層與 API 層完整 rules 相等) | unit / api |
| ADR-030 schema 欄位值須為純量(R-FIELD-SCALAR-01)、站點 36 | — | `unit-validateRows`(VR-NS-001～005、SITE-NS-001)、`unit-procCore-writeValidate`(WV-NS-001～003)、`api-updateTabs`(API-updateTabs-NS-001～003)、`api-syncAndReplaceTabs`(API-sync-018／019) | unit / api |
| ADR-012 並行序列化(mutex; 2026-09-29 起限不同操作者) | — | `api-doubleclick` DC-01～04(2026-09-28 由 `e2e-doubleclick` 改名, 見 ADR-017 Update; API-level; 兩位操作者 `sys` / `{token-for-application}`) | api |
| ADR-025 按鈕雙擊防護(前端送出流程狀態 / 後端依操作者占位 / 新增列已存在即拒絕 / 標的新列重用本次刪除之 id 之正規化) | — | `unit-submitGuard`(SG-001～007)、`unit-lockSave`(LS-001～005)、`unit-procCore-updateTabItems`(UNIT-UTI-001～011, 14 案〔003 依四表展開〕; 008／009 為 `reuseDeletedIds`, 010／011 為數字主鍵與原型鍵名之 id)、`api-doubleclick` DC-05／06(四表各一) | unit / api |
| ADR-021 統計 log 掃描核心 | — | `unit-staEvent`、`unit-staEvent-golden`(GOLD / WORKER / SRLOG 系列) | unit |
| ADR-024 統計圖圖例混合式(`src/js/legendFit.mjs`) | — | `unit-legendFit`(瀏覽器空白頁載入 echarts 本體, 不起服務; 離屏量測對可見圖逐寬一致) | unit |
| SDK 四呼叫端之 fetch 語意 | — | `unit-fetchJson-sdk` | unit |
| ADR-023 M 契約(遮罩)與「印權杖只經 maskLog」站點不變式 | — | `unit-maskLog`(MASK-001~004 契約測資; SITE-001~003 靜態盤點) | unit |
| ADR-023 W 契約(注入函數包裝)與「注入函數只經 wrapInjected」站點不變式 | — | `unit-wrapInjected`(WRAP-001~009; WRAP-SITE-001/002) | unit |
| ADR-023 SDK 代入編碼 / 佔位符缺一即拒 / 轉換錯誤 key / fetchJson message | — | `unit-sdk-tokenSafety`(SDK-001~006) | unit |
| ADR-023 C1 回應與 C2 srLog 不含權杖(`{token-for-reject}` / `{token-for-verify-throw}`) | — | `api-tokenSafety`(TS-001~003) | api |
| ADR-037 外部列守門(R-EXT-OWN-01; F-23) | — | `unit-externalRows`(EX-S1～S7: 判別／鎖定欄／order 還原／`dropServerOnlyDiff`／`checkExternalWrite`／`hasExternalDiff`; EX-CELLS 格數核對)、`unit-procCore-external`(A 守門各違規×四表、B 指派欄與基準、D 舊客戶端、E 僅伺服器管理欄不同、F order、G `pickKeysOnly` 與用戶端 opt、H `lockExternalRows:false` 迴歸、I 歷史非字串 from、J 基準格式、K 引用連帶交互、L srLog、M 並行與鎖內比對、O 基準先於守門; N／SITE-EX-001～012 靜態站點)、`unit-syncKeep`(SK-S1～S4: 缺 `cgrups` 鍵保留／同名異 id 偵測; SK-CELLS)、`unit-syncKeepEntity`(KE-S1～S6〔run08〕: 缺 `cpemis`／`crules` 鍵保留之純函數與站點靜態斷言; KE-CELLS 62 格)、`unit-shipTools`(ST-001～003〔run08〕: 離線工具出貨完整性)、`unit-externalUi`(EU-1～4 橫幅／刪除過濾／`getExternalEdits`／`fmtVars`; SITE-EU-001～008 四頁接線)、`unit-fromAudit`(`auditFrom`／`planFixFromType`／`planPurgeFrom`／語意不變式〔真 `getUserRules`〕／`runFixFromType`／`runPurgeFrom`／`checkDbNotInUse`／CLI〔真 lmdb 臨時庫〕／站點不變式) | unit |
| ADR-037 Update(run12) 程式端重載旗標與自己存檔之推播(R-RELOAD-GUARD-01、R-DRAFT-KEEP-01 規則 9) | `e2e-external-rows` E2E-027(重疊兩筆推播)、E2E-028(推播先於回應)、E2E-029／030(兩對話框); `e2e-array-form` AF-037(原失敗案例) | `unit-dataReloadGuard`(RG-1～5、RG-W／W2 見證、SITE-RG-001／002)、`unit-draftSync`(DS-2 含 saving 軸 32 格＋DS-2c／2d、DS-4o)、`unit-externalUi` SITE-EU-008 | unit＋e2e |
| ADR-037 載入基準(R-BASELINE-01; F-26) | — | `unit-rowDigest`(RD-S1～S5: 指紋不變性／`makeBaseline`／`isBaselineValid`／`checkBaseline`／C-1 情境; RD-CELLS)、`unit-relDialogs-baseline`(RB-001～008 純函數與基準綁定、RB-SRV-001～011／101～103 兩對話框存檔〔S4、外審 B.1〕、SITE-RB-001～004 靜態)、`unit-procCore-external` 之 C 過期快照情境／D／J／M／O | unit |
| ADR-037 外部列與基準之真後端驗證 | — | `api-externalRows`(A 預設設定、B `mappingBy=email`、C `mappingBy=name`、D `lockExternalRows=n`、E `from` 為 `null` 之歷史列; 夾具收尾經 `test/tools/api-setup.mjs` 之 `purgeExternalRows`); 既有 `api-updateTabs`／`api-doubleclick`／`api-keyProp`／`api-mapKey`／`api-refCascade`／`api-syncAndReplaceTabs` 之夾具改為後台列(`from:''`)或收尾前先 `purgeExternalRows` | api |
| ADR-037 新增撞懸空名確認(決定 15) | — | `unit-getAddImpact`(AI-1 新增與懸空判定、AI-2 原型鍵名與壞輸入、AI-4 計入 ⇔ 授權確有改變〔真 `getUserRules`〕、AI-5 文案、SITE-AI-001～003 三頁接線與使用者頁不套用) | unit |

〔run08 實測 2026-10-22: `unit-*` 與 `api-*` 同一 mocha 行程 2966 passing／1 pending／0 failing〔含新增 `unit-syncKeepEntity` 23、`unit-shipTools` 10、`unit-syncKeep` +1、`unit-refAudit` +1、`api-externalRows` +3; 見 run08 報告〕; e2e 受影響集: `e2e-external-rows` 30、`e2e-ref-cascade` 16、`e2e-array-form` 83、`e2e-init --grep E2E-006-` 2〕 ADR-037 各檔案數(run07 主責彙整〔測試現況〕, **本帳本撰寫時未重跑**): unit 全部 2596 passing／1 pending; `unit-externalRows` 518、`unit-rowDigest` 257、`unit-syncKeep` 41、`unit-procCore-external` 291、`unit-externalUi` 27、`unit-getAddImpact` 29、`unit-relDialogs-baseline` 26、`unit-fromAudit` 68; api 全 13 檔同行程 230 passing／0 failing(含 `api-externalRows` 72 案). **ADR-037 之 e2e 語意案例與新 spec 案例由 N 子代理另撰, 本節撰寫時尚未完成, 完成後於此補列**; 既有標準圖 0 張改變(`test/pics` 不得重產).

每份流程 spec 之 `E2E-NNN` × 語系(eng / cht)為一個 `it()`; 案例編號與 `it()` 名 1:1, 新增案例先寫 spec 再寫測試.

### e2e 落地映射(對應全域技能[role-coder-for-test-e2e] §3 契約)

| 契約 | 本專案實名 / 模式 | 偏離與依據 |
|---|---|---|
| C1 launch wrapper | `launchBrowser()`(全專案唯一 `launchChromium`); 六旗標組; `launchChromium` 由 `w-package-tools-e2e` 提供, 缺 Playwright 指定版本之瀏覽器時首次啟動自動下載(與本機同版) | 依據 ADR-020(側欄 launch 級 1px 剛性位移; 根因史見 `sgud/exp/experience.md`) |
| C2 server lifecycle | `startServersOnce({ backendOnly })` / `cleanup()` = srcPack `createServiceManager`(沿用政策 reuse; 一次性狀態依服務分拆, `backendOnly` → `only:['backend']`; 探測判準 HTTP 狀態碼 < 500; 後端 `beforeSpawn` 於 port 無人而確定要 spawn 時先 `seedDb()`); `cleanup()` 同步殺自建樹(`killOwnTree`)、重置一次性狀態、刪臨時 settings; root `after` 與 exit / SIGINT / SIGTERM 由模組頂層 `registerCleanupHooks` 註冊 + 各檔 `generateBaseline()` 末尾 `cleanup()`; 前端於 Windows 以單一指令字串 `npm run serve -- --port 8090` 經 shell 啟動(2026-09-30 起; 原參數陣列 + `shell:true` 觸發 Node 24 DEP0190, 指令列相同), 其他平台不經 shell | 2026-09-28 前 cleanup 於 exit 處理器內以非同步 `spawn('cmd',…taskkill)` 殺(處理器內不會被等待)且不重置旗標, 已隨組裝 srcPack 修正 |
| C3 換設定重啟 | `restartBackend(pathSettings, { reseed })` / `genTempSettings(overrides)` → `test/_tmp/settings-e2e-<pid>-<seq>.json`(gitignore; `cleanup()` 逐檔刪除, 目錄空則移除; 絕不放 `./tmp/`); `reseed:true` 於 port 釋放後、spawn 前重跑 hermetic seed(供「資料弄到任何 token 皆拒」之 api 測試還原, 如 `api-verifyConn-auth` 停用 admin); e2e case 物件可帶 `settings:{...}` 由檔內框架於開 case page 前注入、`finally` 還原(`e2e-users` E2E-012、`e2e-layout` 全案例、`e2e-stainfor` E2E-008(`staEventMock:'many'`, 還原為檔內預設 `MOCK_SETTINGS`), regen 與 mocha 同管線) | 無 `envOverride`(尚無需求) |
| C4 DB 重置 | `resetDb(browser, key, seed)` / `captureBaseSeed(page, key)`(setup 共用泛型版, `key` 為 `'grups'\|'pemis'\|'targets'\|'users'`): **throwaway page** 以 `$fapi.update<Key>(seed)` 送回 base seed、等筆數符合後關 context; `captureBaseSeed` 於 `before` 取一次 | grups / pemis / rela-grup-pemi(key='grups') / rela-pemi-rule(key='pemis') / rela-user-grup(key='users') / targets / users 七檔共用同一組函式 |
| C5 進站與語系 | `openApp(browser)`(清 localStorage → `?token=sys` → 等 `csLogin` + `webInfor` + `syncState` + `$t` 就緒)/ `setLang(page, lang)`(eng 補 600ms 等量 buffer) | |
| C6 截圖 | `captureStable(page, { maxRetries 8, intervalMs 200, initialWaitMs 1500, strict })` = srcPack `captureStable` + settle `[waitColResizeOverlay, waitDrawerReady]` + beforeShots `[resetAgGridScroll]`(ag-grid 水平捲軸歸零並等 300ms); SMIL 凍結、fonts、`<img>` SMIL 填黑(2026-09-28 起座標與截圖同座標系: 全頁為頁面座標, 原為視窗座標, 頁面捲動時落錯位置); `strict`(未 settle 即 throw)由 `opts.strict` 顯式或 `process.env.E2E_STRICT_CAPTURE==='1'` 決定 | regen 端(各檔 `generateBaseline()` 迴圈前設 `E2E_STRICT_CAPTURE='1'`)啟用 strict；mocha 驗證端維持寬鬆 |
| C7 紅框 | `captureStableWithBox(page, target, opts)` = srcPack `captureStableWithBox`(`clampTo:'viewport'`、`guardSmall:false`, 同本專案原實作): **sharp 疊圖**(聯集 ±6、M=3、5px、圓角 4; 目標與捲動量皆於截圖前量); target 可為 selector / Locator / 視窗座標矩形 `{x,y,width,height}`(canvas 內無 DOM 之目標, 如圖例列、翻頁鈕, 取自 `readStaLegend`; 矩形不捲動)/ 混合陣列; `rowBoxSel(rowIndex)`(= srcPack `rowBoxSel` 之 `order:['center','pinned-left']`)、`dialogRowBoxSel(rowIndex)`(scope 到 modal); `opts` 透傳給 `captureStable`(含 `strict`); **框對東西**(2026-09-28): 表格一律 `gridContentBox(SEL_GRID)`(標頭∪可見資料列, 空表為標頭∪「無資料」; grups/pemis/targets/users 10 處; 空表之訊息為無邊界文字, 1.0.3 起其矩形外擴 `INK_PAD` 4px 後取聯集, 框不壓字)、工具列 `itemsUnionBox(SEL_TOOLBAR, { fit: true })`(工具列上項目之聯集; users E2E-012-1)、關閉編輯模式之反應橫跨工具列與表格者取 `[itemsUnionBox(SEL_TOOLBAR,{fit:true}), gridContentBox(SEL_GRID)]` 之聯集一框(四清單 E2E-002-2; 點擊前 E2E-002-1 框 `editSwitchLoc(page)` 開關整顆, 2026-09-28 E 試點由單張改兩張)、**框不壓字**(2026-09-28, 技能 §7.3-8: 無可見邊界且緊貼文字之目標經 `itemsUnionBox(目標, { fit: true })` 量可見內容(開關軌道、圖示與文字)並整體外擴 4px——E2E-002-1 開關、init `[data-fmid="conn-state"]`、stainfor E2E-008-1「全部加總」標籤; canvas 圖例矩形(`readStaLegend` 之圖例列、翻頁箭頭、圖例項)經 `inkRect` 外擴 4px)、**框線不蓋框外內容**(2026-09-28, 技能 §7.3-9, sso ADR-072 決定 6 P: `fit` 之框線中心置於與相鄰項目**可見範圍**之間隙正中(不取含透明內距之元素框——首版以元素框取中點, 編輯模式開關右側圖示鈕之內距把框線拉回「mode／模式」字上, 同日改正); `position:fixed` 浮層外之頁面內容以命中測試找, 框線置於目標內容與浮層外最近內容之間隙正中(浮層本身為目標時以其內容計、可退入浮層內距; 四周空白照常外擴——首版一律畫在浮層內側, 時間清單下緣 2px、模式清單左緣 1px 貼字, 同日改正); `inkRect` 之 `neighbors` 使圖例項／翻頁箭頭之框線不越過與鄰項間隙之正中——stainfor E2E-006-4 圖例項: 目標與鄰項先經 srcPack `canvasInkRects`(讀 canvas 像素)收斂到實際墨跡(`readStaLegend` 之 `whole`／文字矩形比字形寬約 3px), 鄰項取畫面上有墨跡之全部圖例項(含被捲動窗裁掉一部分者; 只取 inWindow 時緊鄰之半顯示項不算鄰項, 框線貼到其圖示 0px, 2026-09-28 改正); 翻頁箭頭以頁碼文字與上一頁箭頭為鄰; e2e-setup 之 clickMode／listOpen／clickItem／clickBtn／popupOpen 與 stainfor 時間／語系清單改 `fit`, 下拉清單框線置於清單內容與清單外內容之間隙正中、不壓背後標籤)、版面收合／縮窄後框擴滿之內容區 `contentArea(page)`(layout E2E-001-2、E2E-003-1); **被蓋住檢查**(srcPack, 盤查用 `E2E_COVER_CHECK=warn`) | 契約 canonical 實作 |
| C8 遮罩 | `<img>` SMIL: captureStable 內自動貼「去動畫之靜態影格」(2026-09-28 起, 原填黑; init E2E-001/002 之連線中轉圈) | 不適用: 統計頁以 `staEventMock` 使資料確定性, 不需貼圖 / 錨右緣 |
| C9 比對 | `assertBaselineMatch(buf, baselinePath, label, opts)` = srcPack(同判準、同證據檔名); pixelmatch `includeAA:false` `threshold 0.1` `maxDiffPixels 100`; fail-dump `./testPending/<label>__<ts>__{capture,baseline,diff}.png`; 全庫無 case 覆寫容差 | |
| C10 輸入 | `typeIntoCell(page, rowIndex, colId, value)`(setup 共用: dblclick → 800ms → End + Backspace → `insertText` → Enter) | grups / pemis / targets / users 四檔共用；無一般 input 版(表單皆 ag-grid) |
| C11 偵測等待 | `waitUntilExist(page, label, fn, { timeout 15000, arg })`(setup; = srcPack 並保留本專案預設逾時 15000; fn 為 async 時套件改以逐次 evaluate 輪詢——`page.waitForFunction` 會把 async 回傳之 Promise 當 truthy 立即放行); 瀏覽器外結果可用 e2eLib `pollUntil`(本專案目前無此需求). **固定等待規則**(2026-09-28, 技能 §4.4; w-web-sso ADR-072 決定 6 Q): 盤點 `node ../../開源-JS-411-8-w-web-sso/w-web-sso/srcPack/tools/auditWaits.mjs --only C,E,R .`, 候選逐一判讀前一動作到預期狀態之間有無非同步來源(伺服器往返、轉址、計時器、廣播、防抖), 有即改偵測. 2026-09-28 盤點 67 處, 改 2 處: `e2e-stainfor` `checkShowTotal`(勾「全部加總」後固定 5 秒 → 與同檔 E2E-008 同一 `waitSeries`(系列數＝事件數＋1、首條為加總線); 原為 debounce 300ms＋重算＋重繪之唯一同步, 同一動作兩處寫法不對稱)、`e2e-setup` `toggleEditMode`(固定 2 秒 → 工具列新增鈕消失＋`waitGridIdle`); 其餘 C 類為前端表格操作(複製／刪除列)後存檔前之截圖、點擊後「不應開啟」之負向觀察窗、偵測後 settle, 照留; 修改後全套 10 檔 **162 / 162** 綠(2026-09-28 22:52 起與 w-web-sso 全套刻意並行之高負載情境, `./testPending/` 零新增) | |
| C12 settle 訊號 | `waitDrawerReady`(`[state]`); `toggleEditMode` 之表格重排以 srcPack `waitGridIdle`(2026-09-28); 其餘 grid 操作為前端同步重繪後之固定 `waitForTimeout` 500–800ms(無非同步來源, 見 C11); `waitMutationSettled(page, { n, timeout })`(setup, 移植自 w-web-api, 簽章取 `.op-title` 文字/座標、`.ag-cell` 數、首列 HTML、`body.innerText.length`) | `waitMutationSettled` 已提供、尚未套用到任何既有 case(套用會改變截圖時序, 屬另案) |
| C13 regen 入口 | (a) 直跑 `node test/e2e-<flow>.test.mjs --baseline [--names …] [--langs …] [--write-mode …]`, 篩選 = srcPack `createBaselineGate`(截圖前、不符即報錯), `generateBaseline()` 末尾 `gate.finalize()` + `cleanup()`; **產製端與比對端呼叫同一個 `runBaselineCase`**(2026-09-28 起 10 個產圖檔全數): `launch: launchBrowser` → `openPage`(`resetDb` throwaway → `openApp` → `setLang`; stainfor 為 `run(browser, lang)` 故 openPage 回 null) → `run` → stages 檢查(產出圖鍵＝宣告) → `semantic` → **全部斷言通過才寫檔**(產製端補跑語意斷言, 原 10/10 檔產製端不呼叫 `c.semantic`) / 比對; 案例層設定切換(users E2E-012、layout、stainfor E2E-008)在兩端同位置同順序; setup 開頭 REGEN 診斷閘門(srcPack `getE2eMode`) | `api-doubleclick`(2026-09-28 由 `e2e-doubleclick` 改名, 見 ADR-017 Update)為 API-level 無 baseline(N/A) |
| C14 端點 | `baseUrl` = `http://127.0.0.1:8090`、`apiBaseUrl` = `http://127.0.0.1:11006`、`appUrl` = `${baseUrl}/?token=sys` | |

## 測試輔助之生命週期(2026-10-14, ADR-026)

- **R-E2E-SEED-01 取 base seed 之臨時瀏覽器一律經 `captureBaseSeedOnce`**: `test/tools/e2e-setup.mjs` 之 `captureBaseSeedOnce(key)` 於 try/finally 內 `launchBrowser` → `openApp` → `captureBaseSeed`, finally 必 `close`(openApp 拋錯時不遺留 Chrome; 原 14 處手寫 `const b = await launchBrowser(); const pp = await openApp(b); …; await b.close()` 無 try/finally, 2026-10-14 基準遺留 15 個 Chrome 使 mocha 不結束). 盤點指令: `rg -n "launchBrowser\(\); const pp = await openApp" test` 應零命中、`rg -n "captureBaseSeedOnce\(" test` 應 14 處(7 檔 × 產製端與比對端).
- **R-E2E-SPAWN-01 後端子行程之 stderr 保留尾段, 非預期結束即印出**: `spawnSrv` 保留 stdout／stderr 末 4 KB, 子行程非因 restartBackend／cleanup 而結束且離開碼非 0 時以 `[e2e-setup] child exited unexpectedly (code=…)` 印出尾段(後端啟動即崩潰時, 原只見 readiness 60 s 逾時之 `server not ready`). 盤點: `rg -n "function spawnSrv" -A12 test/tools/e2e-setup.mjs`. 驗證: 以壞設定啟動之實測(見 experience 2026-10-14).

## 測試輔助之規則: 外部列夾具之收尾與還原(2026-10-22 run09; 來源: 主控全套 `af43394` 之 12 敗同一根因〔`C:\opensrcOper\dnow\20261021095534\master-final.log`〕)

### R-TEST-EXT-CLEAN-01 外部列夾具只經單一入口 `cleanExternalFixtures` 移除並回驗; 收尾不得以管理者寫入、reseed 或各檔自寫 delAll 代之

軸: 夾具建立方式 { 經 `/syncAndReplaceTabs`〔外部列, `from` 非空字串〕, 管理者寫入 RPC〔後台列, `from` 為 `''`〕, `restartBackend` 之 `seedExtra` 旁路〔後台歷史列〕 } × 收尾手段 { 同步路徑重送、測試框架直接重置〔`purgeExternalRows`〕、管理者寫入 `updateXxx`、`restartBackend({ reseed:true })`、各檔自寫 `woItems[kt].delAll({ from })` } × 執行方式 { 逐檔隔離〔每檔重種 ./db〕, 單一 mocha 行程〔`npm test`, 後端與 ./db 共用〕 }。

- **根因(證據)**: 全套 `af43394`〔3199 過、12 敗〕: `e2e-init` E2E-006 經 `/syncAndReplaceTabs` 灌入 `id-mk-dup`(`from=appE2eInit006`), 收尾 `restartBackend('./settings.json', { reseed:true })` 在單一 mocha 行程內刪不掉 `./db`〔api 檔經 `getWoItems()` 使**本行程**持有 lmdb 映射, `wipeDbVerified(strict:false)` 退化為 upsert, 只補種子列、不移除多餘列〕, 於是退而以**管理者寫入** `updateUsers` 移除 → 回 `saveExternalRowChanged`(run07 起後台不得刪外部列, 產品正常運作)。`id-mk-dup` 殘留使其後 `e2e-ref-cascade`／`e2e-rela-user-grup`／`e2e-targets`／`e2e-users` 之 `captureBaseSeedOnce('users')` 擷取到 5 筆而失敗〔守門正常運作〕。**問題在測試收尾, 不在產品, 也不在前置檢查。**
- **規則**:
  1. **外部列(`from` 非空字串)夾具之移除只有兩條合規路徑**: ①**同步路徑**——同一 `from` 重送不含該列之批次(只在分區仍保留 ≥1 列時可用; 外部同步端點拒空 rows〔`isearr` 閘, ADR-008〕, 清空整個分區走不通); ②**測試框架之直接重置**——經單一入口 `cleanExternalFixtures`(`test/tools/api-setup.mjs`; 底層 `purgeExternalRows`, 直接刪庫內該 `from` 之列, 不經產品寫入入口, **產品 Lv1 守門與前置檢查皆不放寬**; 對照案 `api-cleanExternal` CE-003: 管理者寫入仍回 `saveExternalRowChanged`)。
  2. **禁止**: ①以管理者寫入(`updateUsers`／`updateGrups`／`updatePemis`／`updateTargets`)移除外部列; ②倚賴 `restartBackend({ reseed:true })` 移除夾具(逐檔隔離才會真重種; 單一行程只 upsert 種子列, 不移除多餘列, 見 `e2e-setup.mjs` `restartBackend` 註解); ③各檔自寫 `woItems[kt].delAll({ from })`; ④為過關放寬 `assertPristineSeed`／`captureBaseSeedOnce` 前置檢查或產品之外部列保護。
  3. **每個建立外部列夾具之測試檔須在收尾呼叫 `cleanExternalFixtures`**(或其同系底層 `restoreTables`／`purgeExternalRows`／`createIsolation`)並**回驗**: 函式內建①經資料通道 `select` 偵測〔無待清者不 import `g_mOrm`, 不使本行程新增 lmdb 映射〕②移除③再 `select` 確認無殘留; 整檔只動外部夾具者加 `pristine:true`(各表主鍵集合＝種子, 後台多餘列即拋錯)。只清自己專屬之 `from`(`froms`), 不動他人分區; 收尾快照本身含外部列者以 `keepIds` 保留。
  4. **夾具各用專屬 `from`(檔名可辨)**: `assertPristineSeed` 訊息於多出之外部列主鍵後註記 `(from=…)`(如 `id-mk-dup(from=appE2eInit006)`), 前置檢查失敗時即可指向遺留之檔。
  5. 後台列夾具(`from` 為 `''`, 管理者寫入 RPC 或 `seedExtra` 旁路建立)之收尾不在本規則: 仍走 `restoreTables`／`restoreDbOnce`／`editTableRows`(管理者寫入可刪後台列; `restoreTables` 內已先 `purgeExternalRows`)。
- **站點全集(2026-10-22 run09 盤點; `unit-e2e-lifecycle` LC-004 以靜態掃描釘住建立外部列夾具之檔〔2026-10-23 perm-run01 起 16 檔; 原 14 檔〕, 新增者須同步更新該清單與本表)**:

| 檔 | 外部列夾具之 `from` | 收尾 | 判定 |
|---|---|---|---|
| `e2e-init`(E2E-006) | `appE2eInit006` | `restartBackend(reseed)` 後 `cleanExternalFixtures({ kts:['users'], froms:[FROM_006], pristine:true })` | **本輪修正**(原: 管理者寫入 `updateUsers` 移除 → `saveExternalRowChanged`) |
| `api-authMerge` | `appTest-chm`／`appTest-chm2` | `cleanExternalFixtures({ froms })` | 本輪改走單一入口(原自寫 `delAll({ from })`) |
| `api-getPermUserInfor` | `appTest-oi`／`appTest-ap` | 同上 | 同上 |
| `api-tokenSafety` | `apiTokenSafety`／`apiTokenSafety-blocked` | 同上 | 同上 |
| `api-syncAndReplaceTabs` | `appTest-1`～`appTest-27b` | 同上 | 同上 |
| `api-mapKey` | `appMk-*` | `cleanExternalFixtures({ kts:['users'], froms })`; 旁路後台歷史列〔`from ''`〕仍以 id `delAll` | 同上(後台列刪除屬規則 5, 不動) |
| `api-keyProp` | `appKeyProp` | `restoreTables`(內含 `purgeExternalRows`) | 原已合規, 未動 |
| `api-externalRows` | `appExt`／`appKeep`／`appRenum` 等 | `restoreTables`＋`purgeExternalRows` | 原已合規, 未動 |
| `api-updateTabs` | `appTest-uk4`／`appTest-uk5` 等 | `restoreBaseSeed` → `purgeExternalRows` | 原已合規, 未動 |
| `api-refCascade` | `appRC`／`appRC-d`／`appRC1` 等 | `restoreAll` → `purgeExternalRows()`, 之後才 `restartBackend(reseed)` | 原已合規, 未動 |
| `e2e-array-form` | `appArrForm` | `restoreTables`; 旁路歷史同名列〔後台列〕段 `reseed` 後殘留則 `restoreTables` | 原已合規, 未動(本輪未擴大跑此檔: 未改其呼叫之任一函式之行為) |
| `e2e-external-rows`／`e2e-ref-cascade` | `appExtU`／`appExtG`／`appExtWarn`／`appExtLate`／`appRefCascade` | `createIsolation().restore()` → `restoreTables` | 原已合規, 未動 |
| `api-cleanExternal`(新) | `appCe-1`／`appCe-2` | 本入口之行為契約 CE-001～007 | 新增 |
| `api-baseline`(perm-run01 新) | `appAbSync` | `purgeExternalRows`(`froms:[F_SYNC]`; 全表以 `keepIds` 保留種子列)後依「targets → pemis → grups → users」以管理者寫入還原四表(同 `api-refCascade` 之 `restoreAll`; 不用 `restoreTables`——其次序 users→grups→pemis 在群組改名連帶之後會使 grups 改回原名被 `renameCascadeNameInUse` 拒收) | 新增(2026-10-23) |
| `e2e-concurrent-edit`(perm-run01 新) | `appCeX` | `createIsolation`(含本檔對 targets 表之擷取／還原: 共用快照只含 users／grups／pemis, 見 R-E2E-ISO-01) | 新增(2026-10-23) |

  其餘 `reseed` 站點: `api-verifyConn-auth` after(還原 admin `isActive`, 不建立多餘列, upsert 足夠)——不涉外部列。
- **盤點指令(可重跑; 期望為 2026-10-22 run09 實測)**:
  ```
  # 1) 各檔自寫 delAll({ from … }) 收尾. 期望: 0 命中(唯一入口在 test/tools/api-setup.mjs)
  rg -n "\.delAll\(\s*\{\s*from\b" test/api-*.test.mjs test/e2e-*.test.mjs
  # 2) 單一入口之使用點. 期望: api-authMerge 1／api-getPermUserInfor 2／api-mapKey 1／api-syncAndReplaceTabs 1／api-tokenSafety 1／e2e-init 1／api-cleanExternal 13(含註解)／unit-e2e-lifecycle 2／tools/api-setup.mjs 5(定義與註解)
  rg -c "cleanExternalFixtures\(" test
  # 3) e2e-init 不得以管理者寫入收尾. 期望: 0 命中
  rg -n "updateUsers" test/e2e-init.test.mjs
  # 4) reseed 站點(收尾不得倚賴其移除多餘列). 期望(含註解): api-mapKey 1／api-verifyConn-auth 1／api-refCascade 1／e2e-array-form 1／e2e-init 2／api-cleanExternal 1(註解)
  rg -c "reseed: ?true" test/*.test.mjs
  ```
- **測試**: `api-cleanExternal`(CE-001～007, 真後端: 限定分區、不限分區＋pristine、**管理者寫入仍刪不掉外部列〔不放寬產品〕**、`keepIds`、pristine 回驗不放寬且訊息含 `from`、`froms` 含 `''` 即拋錯、無外部列回 0)、`unit-e2e-lifecycle`(LC-004／004b 站點不變式與判定器自測、LC-005 e2e-init E2E-006 收尾形狀、BS-002b `(from=…)` 註記)。**修前紅**: 全套順序之單一 mocha 行程重現(見 run09 報告); 靜態不變式對 `af43394` 之檔亦會紅(LC-004: 5 檔自寫 `delAll({ from })`; LC-005: e2e-init 無 `cleanExternalFixtures`)。
- **驗證紀錄(2026-10-22 run09; 同一 mocha 行程、依全套相對順序)**: `api-*`(14 檔)→ `e2e-external-rows` → `e2e-init` → `e2e-ref-cascade` → `e2e-rela-user-grup` → `e2e-targets` → `e2e-users` → `unit-*`(50 檔): **修後 3105 passing／1 pending／0 failing(51 分 57 秒, 離開碼 0)**; 修前同順序(不含 unit、api 為 13 檔)**295 passing／12 failing**(失敗項與主控全套逐項相同: E2E-006×2、ref-cascade before／after all×4、rela-user-grup before all×2、targets run06 段 before／after all×2、users before all×2)。既有標準圖 0 張改變(`git status test/pics` 無輸出), `./testPending/` 無新增。未跑之 e2e 檔(array-form／grups／layout／pemis／rela-grup-pemi／rela-pemi-rule／stainfor)由主控收尾輪全套涵蓋。偶發註記: 修後第 2 輪曾有 `api-refCascade` API-RC-044 一案「srLog 30 秒內讀到 0 行」(同碼首輪與第 3 輪皆通過), 見 `sgud/exp/experience.md` run09 末條。

## 單一行程全跑之 DB 收尾對稱、授權資料共用解碼、欄位值純量(2026-10-20 run01, ADR-030; 來源: 主控第 89、92 項建議書 `建議w-web-perm修正.md`)

### R-E2E-ISO-01 e2e 檔須在檔尾還原自己改過的表, 擷取 base seed 須守門(第 89 項)

軸: 前檔最後一案是否遺留改動 × 後檔是否擷取同一張表為 base seed × 執行方式(單一 mocha 行程〔`npm test`〕/ 逐檔隔離 runner〔每檔重種 ./db〕).

- **規則**: ①每個以 `resetDb(browser, '<key>', BASE_SEED)` 在每案前還原 DB 的 e2e 檔, 其**每個語系 describe 之 `after`** 以獨立一行無條件之 `await restoreDbOnce('<key>', BASE_SEED)`(`test/tools/e2e-setup.mjs`)把該表還原為檔首擷取之 base seed(擷取 ↔ 還原對稱); ②`captureBaseSeedOnce(key)` 擷取後以 `assertPristineSeed(key, seed)`(`test/tools/baseSeed.mjs`)守門: **主鍵集合**須等於種子(取自各表 schema 之 `funTest`: users 4／grups 4／pemis 4／targets 22), 前檔遺留於檔案起點即以可讀訊息失敗(實得／應為筆數、多出與缺少之主鍵、各列名稱). 守門只比主鍵集合, 不比欄位內容(同主鍵之內容遺留由①防止, 見下「限制」). **注意**: 若前檔遺留的是「同主鍵、內容已變」, 守門不會擋, 後檔擷取後其檔尾還原會把該遺留當成 base seed 固化並延續到後續各檔(外審 minimax R2#4); 這類遺留的防線只有各檔自己的檔尾還原.
- **根因(證據)**: 單一 mocha 行程內各 e2e 檔共用同一後端與 `./db`; `e2e-rela-user-grup` 最後一案 E2E-010 以 `updateUsers` 加入同名使用者 `id-for-mary-dup`(`mary.dup@example.com`), 其還原只靠「下一案前的 `resetDb`」, 該檔最後一案之後無人還原; 下一個動 users 表的檔 `e2e-users` 於 `before` 以 `captureBaseSeedOnce('users')` 擷取到 5 筆, 把遺留凍結成 `BASE_SEED`(之後每案前 `resetDb` 都還原成 5 筆)——截圖多一列(diff 2911～15310 px)、「DB 仍為 4 筆 base seed」(實得 5)、結果 modal 筆數不符, 共 24 案. **逐檔隔離 runner 每檔重種 DB, 故看不到**. 證據鏈(`tmp/run89/`): ①`api-*` 全部＋`e2e-users` 同一行程 99/99 全綠(api 檔與 mocha 行程持有 lmdb 映射皆無罪); ②**最小重現**(無任何 api 檔、mocha 行程未開 lmdb): `npx mocha --no-parallel test/e2e-rela-user-grup.test.mjs test/e2e-users.test.mjs --grep "E2E-010-same-name-users|E2E-001-list-view"` 修前 2 過 2 敗, 敗者為 `users-eng-E2E-001-list-view` diff=15183px、`users-cht-E2E-001-list-view` diff=15310px(與基準全跑日誌同值), 跑後 `./db` users 5 筆含 `id-for-mary-dup`; ③修後同指令 4／4 過, 起點／下一檔起點／全部結束後之各表內容摘要相同.
- **「lmdb 映射」非主因**: 基準日誌 89 行之 `seedDb 無法刪除 ./db（仍有行程持有 lmdb 映射）EPERM` 警告為 `api-verifyConn-auth` after-hook 之 `reseed`(`strict:false`)路徑: mocha 行程因 `getWoItems()` 持有 lmdb 映射, Windows 刪不掉 `./db`, 改在既有 DB 上 upsert; 該段之後 api 各檔皆已自行還原(api 全部跑完後 users 表 4 筆), 且 ①顯示僅 api 前綴不致使 `e2e-users` 失敗, ②無 api 檔之最小重現仍失敗. 此警告為預期(同行程內無法解除自己的映射), **不是**本項之因; 若將來真需 hermetic reseed, 須把 `getWoItems` 改為不在 mocha 行程開 lmdb(如經資料通道 `select` 讀), 屬另案.
- **不以「改成每檔獨立行程」掩蓋**: `npm test` 字串固定不得改(全域 §16.5); 修法在 harness(檔尾還原＋擷取守門), 單一行程全跑可綠(見 ADR-030 與修正報告之全套結果).
- **限制**: ①還原走業務寫入 API(`$fapi.update<Key>(seed)` 整表 diff), `order` 會重編(全新種子為 0 起算, 任何 UI `updateXxx` 後為 1 起算)、稽核時間由伺服器重給——「還原」指業務欄位相同, 不是全欄位位元相同; 既有 e2e 皆如此, 斷言與標準圖不涉及這些欄位. ②`restoreDbOnce` 只還原該檔 `key` 那一張表; 檔內案例若改了他表須另行還原(目前 7 檔皆只改自己的表, 見站點全集). ③守門不比欄位內容.
- 站點全集(2026-10-20 `rg -l "resetDb\(browser" test`): `e2e-grups`(grups)、`e2e-pemis`(pemis)、`e2e-targets`(targets)、`e2e-users`(users)、`e2e-rela-grup-pemi`(grups)、`e2e-rela-pemi-rule`(pemis)、`e2e-rela-user-grup`(users)共 7 檔**皆已套**; 不改資料之 e2e(`e2e-init`、`e2e-layout`、`e2e-stainfor`)刻意不套(只換設定並於 finally 還原). `e2e-array-form`(不用 `resetDb`, 夾具為 `from='appArrForm'` 分區; **不受 LC-002 靜態不變式守護**——該不變式以 `resetDb(browser,…)` 為觸發, 將來新增同型〔不用 resetDb 卻改共用表〕之 e2e 檔須擴充不變式或自行對稱收尾; 外審 minimax#5、R2#6 接受之風險): `before` 以資料通道讀 users／grups／pemis 現況(依 `order` 排序並檢查 `r.ok`、非空: `select` 依主鍵排序而 `updateXxx` 以陣列位置重給 `order`, 不排序直接送回會使 users 列序反轉; select 失敗不得當成空表而送出整表清空), `after` 以 `updateXxx` 原樣寫回(`restoreTables`; 擷取 ↔ 還原對稱, 不留夾具列、不改 base 列原文).
- 盤點指令: `rg -c "restoreDbOnce\(" test/e2e-*.test.mjs`(7 檔各 1)、`rg -l "resetDb\(browser" test`; 可執行版 `unit-e2e-lifecycle` LC-001(盤點 7 檔)／LC-002(以括號配對解出每個語系 describe 與其 after 本體, 要求頂層獨立一行無條件之 `await restoreDbOnce(同一表, BASE_SEED)`; 條件包覆、單行 if、缺 after、不同表鍵、移到 describe 外皆不合格)／LC-002b(判定器自測)／LC-003(守門在 `captureBaseSeedOnce`)／BS-001～004(`assertPristineSeed` 契約, 含同筆數換一列).
- **LC-002 判定器之能力邊界(sol 第三輪#3, 讀碼屬實, 本輪未改)**: 判定器為「括號配對＋逐行正規式」, 非 AST. 能擋: 區塊 `if (…) {…}`、單行 `if`、缺 after、不同表鍵、移到 describe 外(LC-002b 自測). **擋不住**刻意構造者: ①`if (false)` 單獨成行、下一行才是 `await restoreDbOnce(…)`; ②把整個 `after(…)` 註冊包在 `if(false){…}` 內(語系 describe 本體內即不頂層); ③after 區塊放在未使用的模板字串內. 反向誤判: 原始碼含合法的 `/{/` 之類正規式字面值時括號配對失準, 會誤拒. 現有七檔皆不含上述形狀, LC-001／LC-002 目前正確; 要完整兌現須改為 AST 判定(**待裁示/另案**, 屬防誤用而非現況缺陷).
- 測試: `unit-e2e-lifecycle`; 全域驗證為 `npm test` 單一行程全綠(連跑兩次, 見修正報告).

### R-AUTH-DECODE-01 授權資料(cgrups／cpemis／crules)之解碼只有一個擁有者, 伺服端與五個編輯元件共用(第 92 項①, 站點 35)

軸: 資料形式(物件形式 `{ "名稱": 值 }` ／ 陣列形式 `[{ "name": "名稱", … }]`, 外部應用可直接寫入後者) × 資料種類(`cgrups`／`cpemis` 帶 mode ／ `crules` 不帶) × 讀取者(伺服端 `getUserRules` ／ 五個編輯元件) × 後果(顯示 ／ 存檔).

- **規則**: 授權資料之解碼唯一擁有者為 `src/js/cvKpToArr.mjs`(自 `getUserRules` 抽出, 語意逐行不變); 編輯元件以 `src/js/cvKpToObj.mjs` 統一為「以名稱為鍵之物件」後再依名稱查值(`getOwn`／`getRuleEnable`), 使**編輯器顯示啟用 ⇔ 該元素被伺服端採納(納入合併)**(等式指元素層級, 不是最終權限樹: 群組存在但其權限全停用時, 最終授權仍為空而編輯器仍顯示該群組啟用); **存檔輸出形式維持物件形式**(三個直接編輯器 `VeCgrups`／`VeCpemis`／`VeCrules` 一律寫 `{ 名稱: … }`; 兩個關聯對話框 `VeGrupBlngUsers`／`VePemiBlngGrups` 僅於「解碼後內容與欲寫出者不同」時改寫庫內字串, 內容相同則原字串〔含原陣列形式〕不動——契約是「授權不變」, 不保證轉成物件形式). `cvKpToObj(kp, { hasMode })`:
  - **陣列形式**: `hasMode: false`(`crules`): 鍵依 JS 屬性鍵轉型取得, 與伺服端 `kpRule[vv.name] = vv.isActive` 同(`name: 5`→`'5'`、`true`→`'true'`、`['T1']`→`'T1'`、非物件元素之索引→`'0'`), 同名後者覆蓋. `hasMode: true`(`cgrups`／`cpemis`): 伺服端 `arrFinder` 以 `===` 比對名稱, 非字串名稱與非物件元素不授權而略過; `isActive:'y'` 而 mode 缺漏或不合法(非 `OR`／`AND`)者伺服端不納入合併(**不授權**), 解碼改為 `isActive:'n'`(否則編輯器顯示啟用、存檔補預設 OR 而把「不授權」變成「授權」——外審 minimax#1); 同名重複以「有效啟用元素」(`y` 且 mode 合法)為準: 模式一致合為一個啟用項(與伺服端逐項合併等價), 無有效啟用元素為 `n`, **AND 與 OR 並存(物件形式無法無損表示)時保留 AND 支、捨 OR 支**——sol#4 夾具實測取末項與停用皆增權; 保留 AND 支則不增(只有一個 AND 群組/權限時: 捨去 OR 支使 OR 聯集變小, `objAND` 對不在 AND 支內之鍵不改動、對 AND 支獨有之鍵設 `n`, 結果不會變大——PR-001／PR-003 窮舉驗證; 理由不是「OR 聯集單調」一句話能涵蓋, 外審 minimax R2#3 指出, 兩支同屬一個群組/權限、內容相同是關鍵; ≥2 個 AND 者屬下述既有順序依賴).
  - **物件形式**: 值內 `name` 去掉(外層鍵為名, R-AUTH-PATH-01; 否則關聯對話框的 `grups.push({ name: k, ...v })`／`kpGrupNew[g.name]` 讓存檔把授權改指值內 name——外審 sol#5, HEAD 既有), `hasMode` 時另把 `y` 而 mode 不合法者改 `n`(物件形式之缺 mode 啟用顯示在 HEAD 即存在, 本輪一併收緊); 無需修改者仍回同一參考.
- **限制(run01 當時之已知限制; 2026-10-20 run02 已取代: ①由 R-AUTH-ORDER-01 保序解決、②由 R-AUTH-LOSSY-01 fail-closed 解決、③由 R-SYNC-NAME-01 入口拒收解決、④不變)**: ①**AND 合併依群組順序**(既有: `mergeRules` 的 `objAND` 對不含於後者之鍵不動、對後者獨有之鍵設 `n`, 結果因群組順序而異), 編輯器存檔依對話框(群組表)順序重寫鍵, 故兩個以上 AND 群組且規則集不同時, **任何**編輯器存檔(物件形式亦然)都可能改變授權, **方向可為增權也可為減權(換標的)**, 群組層(`cgrups`)與權限層(`cpemis`, 同一個 `mergeRules`)皆然——非本輪引入, `PR-001`／`PR-003` 窮舉略過此類組合(計數於斷言), `PR-004` 把「可增權」的方向固定成可重跑證據(外審 minimax R2#1、#2); ②同名 AND／OR 並存者見上——**僅在整組只有這一個 AND 名稱時**授權只會變小; 若同時另有 ≥1 個其他 AND 名稱(sol 第三輪#2), 捨去 OR 支會使 AND 合併之初值由 OR 聯集改為首個 AND 支, **不換序亦可能增權**(`PR-005` 固定: T1 由 n 變 y), `PR-001`／`PR-003` 窮舉略過此類組合; ③**空字串名稱**(sol 第三輪#1): 編輯器路徑 `updateTabItems` 之 `ckKey(rows,'name')` 以 `isestr` 拒收空名稱(`saveRowFieldInvalid`), 但外部同步 `syncAndReplaceTabs`(`WWebPerm.mjs:651` 前之 `validateRows`)只要求主鍵 `id` 非空, 不檢查 `name`, 故群組/權限可帶 `name:''` 入庫, 伺服端 `arrFinder` 以 `===` 比對而採納之; `cvKpToObj`(`isestr(r.name)`)與直接編輯器 `doSave`(`isestr(name)` 略過)皆視空名稱為無效, 故編輯器存檔會移除該授權(陣列/物件形式皆然, 既有行為, 方向可為增權=解除 AND 限制, 亦可為減權)——建議於同步入口對 grups／pemis 之 `name`、targets 之 `id` 要求非空(**待裁示, 本輪未改**); ④`cgrups`／`cpemis` 的 `mode` 預設值: 編輯器對缺 mode 的停用列顯示 OR(存檔寫 `{mode:'OR', isActive:'n'}`, 授權不變).
- 〔run02: 清單頁 5 處已全數套用, 見 R-AUTH-LIST-01; 下列為 run01 當時之盤點〕站點全集(2026-10-20 `rg -n "JSON5\.parse\(" src`, `unit-cvKpToObj` SITE-AD-001 逐檔計數): 五元件共 9 處**皆已套**〔run02 起現況為 11 處: `VeGrupBlngUsers` 與 `VePemiBlngGrups` 各 4——另含 `doSave` 有損檢查用之 `kpRaw` 一處, 見 `unit-cvKpToObj` SITE-AD-001 之 `SITES` 表〕(`VeCgrups` 1／`VeCpemis` 1／`VeCrules` 1／`VeGrupBlngUsers` 3／`VePemiBlngGrups` 3; 帶 mode 者傳 `{ hasMode: true }`); **未套(待裁示, 僅唯讀顯示、不寫回, 站點 37; `SITE-AD-001` 之 `SITES` 表把這三檔記為 `wrapped: 0` 只是「現況盤點」, 非既定事實——修正站點 37 時同步改該表)**: 清單頁 `LayoutContentGrups`(2)／`LayoutContentPemis`(2)／`LayoutContentUsers`(1)——外審實測較「顯示為空」更差: `LayoutContentUsers.getCgrupsText` 對陣列形式把**陣列索引當群組名**(「1 個群組(0)」); `LayoutContentPemis` 之 crules 計數直接比較值是否為 `'y'`, 套 `cvKpToObj` 後值為 `{isActive:'y'}` 仍計 0, 須同時改用 `getRuleEnable`(物件值形式 `{T1:{isActive:'y'}}` 於 HEAD 即誤顯示); 與五元件同源但超出第 92 項「五元件」範圍, 且須跑清單頁 e2e; 另 `mShare.mjs` 之 `cvStrToArr`(伺服端解碼入口)為預期保留.
- 盤點指令: `rg -n "JSON5\.parse\(" src`; 可執行版 `unit-cvKpToObj`(CO-001～009 函數契約; DF-001～006 與伺服端 `getUserRules` 差分; **PR-001 窮舉 4369 組 cgrups 陣列形式〔2 群組 × mode{OR,AND,缺,or} × isActive{y,n}, 長度 ≤ 3〕: 存檔後授權相等, 同名 AND／OR 並存者不增, ≥2 個 AND 群組者略過; PR-002 窮舉 259 組 crules; PR-003 權限層〔cpemis〕同型窮舉 4369 組; PR-004 固定「≥2 個 AND 群組存檔可增權」之既有限制方向**; SITE-AD-001 全站 `JSON5.parse(` 分類〔新增讀取點即紅〕、SITE-AD-002 `mShare` 不再內嵌解碼)、`unit-eachOwn` SITE-OI-001(解碼走訪仍 `eachOwn`).
- 測試: `unit-cvKpToObj`; `e2e-array-form`(AF-000 對照組＋AF-001～006: 真後端、真瀏覽器、真對話框; 夾具含缺 mode 之啟用元素〔M2／P2: 須顯示停用、存檔後授權不變且不得補成啟用〕與物件形式值內 name 指向 M2 之使用者〔AF-006〕; **語意斷言為主、不產標準圖**, 產圖須另行取得授權).

### R-FIELD-SCALAR-01 schema 欄位值須為純量, 非純量於破壞步驟之前整批拒絕(第 92 項②, 站點 36)

軸: 寫入路徑(後台整表寫入 `updateTabItems` ／ 外部同步 `syncAndReplaceTabs`) × 欄位值型別(字串／數字／布林／null／undefined ／ 物件／陣列／巢狀／函數／symbol／bigint).

- **盤點(schema 有無合法物件型欄位)**: `src/schema/tables/{users,grups,pemis,targets}.mjs` 之**有效**欄位(註解掉的 `isActive` 不計)型別只有 `STRING`(users 10／grups 7／pemis 7／targets 6)、`INTEGER`(各 1)、`TEXT`(users 2／grups 2／pemis 2／targets 1); `cgrups`／`cpemis`／`crules` 為 `TEXT` 存 **JSON 字串**; **無合法物件型欄位**.
- **規則**: `server/validateRows.mjs` 之 `validateRowsBeforeWrite` 對待寫入之列的每個欄位值要求純量(字串、數字、布林、null、undefined); 非純量回 `{ reason: 'fieldNotScalar', k, field }`. 兩條寫入路徑在第一個破壞步驟(`del`／`delAll`)之前呼叫它: 後台 → `saveRowFieldInvalid`、外部同步 → `invalidRows`(srLog 記 `reason:'fieldNotScalar'` 與欄名). `rowsIdOnly`(未寫入之既有列)不驗. 修前 `{ description: { value: '<標記>' } }` 避過預檢(預檢只看 `isestr(vv)`), 寫入時由 w-serv-orm 靜默改寫(非拒絕). **數字不限有限**: `NaN`／`±Infinity` 視為純量放行(型別為 INTEGER 的欄位由 ORM 處置; 與主鍵檢查把非有限數字視為「未給」是不同層的取捨, 外審 minimax#7 已知).
- 站點全集(2026-10-20 `rg -n "\.(insert|save|del|delAll|mix)\(|\bprocOrm\(" server`): 寫入呼叫共 2 處檔案——`server/procCore.mjs`(`del`／`insert`／`save`, 之前 :199 驗證)、`server/WWebPerm.mjs`(`delAll`／`insert`, 之前 :651 驗證); `server/dataChannel.mjs` 之 `procOrm` 為泛用轉呼叫且只放行 `select`(ADR-026), 非寫入站點. 可執行版: `unit-validateRows` SITE-NS-001(掃描器放寬為任意 `.insert(`／`.save(`／`.del(`／`.delAll(`／`.mix(`／`procOrm(` 呼叫並比對首個驗證與首個寫入之行序; 限制: 只比各檔首個呼叫, 不證明每條控制流程先驗後寫)／SITE-NS-001b(掃描器自測).
- 測試: `unit-validateRows`(VR-NS-001～005、SITE-NS-001／001b; VR-007／VR-OI-003 依新行為調整)、`unit-procCore-writeValidate`(WV-NS-001～003, 003 含庫內舊非純量列未變更不阻擋他列、變更後則拒絕)、`api-updateTabs`(API-updateTabs-NS-001～003, 四表 × 五種非純量〔含 `{value:'<script>…'}`〕經真後端)、`api-syncAndReplaceTabs`(API-sync-018／019, 三表; 先建立舊列, 拒收後該 from 分區與其他 from 之全部列逐位元不變).

## 測試讀後端 srLog: 以檔案位置定位, 不比對跨行程時鐘(2026-10-22 run10; 來源: 主控全套 `af43394` 之 API-RC-044 偶發失敗〔`C:\opensrcOper\dnow\20261021095534\master-final2.log`〕, run09 同案偶發)

### R-SRLOG-MARK-01 測試讀「某動作之後後端新增的 srLog 行」一律經 `markSrLog()`＋`readSrLogSince(mark)`; 不得以測試行程的 `Date.now()` 與 log 行的 `time` 比大小

軸: 比較的兩個時鐘 { 同一行程〔`Date.now() - t`〕, 跨行程〔測試行程 `Date.now()` vs 後端 pino 蓋的 `time`〕 } × 動作到記 log 的間隔 { 數十 ms 以上, 約 1～3 ms〔拒絕路徑: 前置檢查即拒、不寫庫〕 } × 配對 { 每個測試行程 × 後端行程組合各有固定時鐘偏差 }。

- **根因(證據)**: `readSrLogSince(t0)` 取 `o.time >= t0`, `t0` 是**測試行程**的 `Date.now()`、`o.time` 是**後端行程**的 `Date.now()`(pino 蓋印)。兩個 node 行程的 `Date.now()` 在本機實測彼此有 1～2 ms 的偏差(同一配對內短時間穩定、隨配對而異; 成因推測為各行程獨立校準高解析計時器與系統時間, **未查 V8 原始碼證實**, 但偏差本身已由 probe-clock／repro-clock 實測)。請求到記 log 僅隔約 1～2 ms 時, 偏差使目標行 `time < t0` 而被濾掉; 其後後端閒置, 不再有新行, `waitLines` 等滿 30 秒, 回報「30000 ms 內 srLog 未見預期之行(讀到 0 行)」。**不是**寫入延遲、**不是**檔案 mtime 落後、**不是**讀錯檔:
  1. 失敗當下該行確實在檔內: `logs/2026-10-22T14.log` 有 `14:57:41.641 syncAndReplaceTabs-error / renameCascadeNameInUse`(pid 6104, 前一行 `updateUsers-success` 在 .639, 兩行僅隔 2 ms), 且全部歷史 log 中「某 pid 於 renameCascade* 錯誤行後空窗 ≥ 25 秒」只有兩次: 13:04:35(run09 的偶發失敗)與 14:57:41(本次), 皆為 API-RC-044 第一個子案(NameInUse; 該案 `t0` 取在請求前一刻、後端前置檢查即拒, 間隔最短)。檢視指令: `node tmp/run10/scan-stall.mjs 25 1`。
  2. 排除寫入延遲: 旁觀者行程(`tmp/run10/observer.mjs`, 50 ms 輪詢)對 31611 行後端 log 量「pino time → 檔案可讀」最大 77 ms。
  3. 排除 mtime 落後: 他行程持有握把追加寫入時 `statSync().mtimeMs` 隨每次寫入即時更新(`tmp/run10/probe-mtime.mjs`, 落後約 −1 ms)。
  4. 時鐘偏差實測: `tmp/run10/probe-clock.mjs`——10 個子行程中 6 個出現「伺服端時間戳早於請求前所取的 t0」, 取樣 6384 次中 1907 次(29.87%)因果倒置, 最大 −2 ms。
  5. 真後端對照重現(`tmp/run10/repro-clock.mjs`, `tmp/run10/repro-clock.results.txt`): 9 組(測試行程, 後端行程)配對共 2600 次請求, 新式標記全部讀到(2600/2600); 舊式漏讀 451 次(17.3%), 集中在 2 組配對(236/300 與 215/300), 其餘 7 組 0 漏讀; 漏讀數恰等於負 margin 數。偏差為負且大於請求到記 log 的間隔時才失敗, 故自然失敗率低(已知僅 2 次, 一次在 run09 的 3 輪中、一次在主控 final2 全套; 本輪修前單檔 0/10、`api-*` 同行程 0/3 皆未重現)。
  6. **可控故障注入(修前紅/修後綠)**: 令測試行程 `Date.now()` 提前 10 ms(`mocha --require skew-preload.cjs`, `SKEW_MS=10`; 後端為另一行程不受影響)——修前讀法(git `af43394` 之 `api-refCascade`＋`api-setup`)7 敗/40, 含 API-RC-044, 錯誤訊息與主控全套的逐字相同(「NameInUse reason: 30000 ms 內 srLog 未見預期之行(讀到 0 行)」); 修後 `api-refCascade` 3 輪 0 敗(各 40 過); 真後端對照腳本 `SKEW_MS=10`／`3` 下舊式 0/200、新式 200/200。**日後改動 `readSrLogSince`／`markSrLog`／`waitLines` 者, 驗證須含此注入(任一偏差量, 後端時鐘不得影響讀取結果)。**
  證據腳本(`scan-stall.mjs`／`scan-logs.mjs`／`show-window.mjs`／`observer.mjs`／`probe-mtime.mjs`／`probe-clock.mjs`／`repro-clock.mjs`／`skew-preload.cjs`／`loop.mjs`)與原始輸出隨報告存於 `C:\opensrcOper\dnow\20261021095534\agent-out\run10-evidence\`(`./tmp/` 為暫存區會清除; 重跑須複製回本 repo 的 `./tmp/run10/`, 其中 `repro-clock.mjs` 以 `../../test/tools/api-setup.mjs` 相對路徑引用)。
- **規則**:
  1. 動作**之前**呼叫 `await markSrLog()`(`test/tools/api-setup.mjs`)取標記: 送一個不在白名單的 `keyTable` 哨兵請求(後端只記一行 `api/syncAndReplaceTabs-error` / `invalidKeyTable` 後拒絕, 不動資料)並等它落檔, 標記＝此刻各 log 檔位元組數。同一後端行程的 srLog 依呼叫序落檔, 見哨兵即其前各行已落檔, 故前一步驟仍在 pino 管線中的行不會落到標記之後。
  2. `readSrLogSince(mark)`(核心 `test/tools/srLogMark.mjs`)只讀標記之後新增的**完整行**(以位元組定位; 尾端殘行不計、不可解析之行略過; 標記之後才建立的新檔〔跨小時〕自頭讀; 只看最新 3 個 log 檔); **不看行內任何時間欄位**。傳入時間戳等非標記值拋 `TypeError`(fail-closed: 殘留的舊式呼叫立即失敗而非靜默退回比對時鐘)。
  3. 等 log 仍須以「預期的行」等待(`waitLines`), 不得讀到空集合即斷言「無外洩」; `waitLines` 之 30 秒上限不改、不放寬、不加重試。
  4. 同行程內的 `Date.now() - t` 計時(如 API-RC-070 的 30 秒內完成)不受影響; 跨行程比時鐘的新寫法一律禁止(不論是 log 行、`timeUpdate` 與測試端時間, 或其他後端蓋印時間)。
- **站點全集(2026-10-22 run10 盤點)**:

| 檔 | 標記站點 | 判定 |
|---|---|---|
| `api-refCascade` | 9(`waitLines` 呼叫處; `let mark = await markSrLog()`) | 已改; 第 1052 行 `tRun`〔同行程計時〕改名避開 |
| `api-externalRows` | 8(含 `expectStale`) | 已改 |
| `api-tokenSafety` | 1(`before` 取標記, 哨兵行用 pid＋Date.now 作唯一字串) | 已改 |
| 其他測試讀 srLog 者 | 無(`readSrLogSince` 僅此 3 檔使用) | — |

- **盤點指令(可重跑)**:
  ```
  # 1) 殘留的跨行程時鐘比較. 期望: 僅 srLogMark.mjs／api-setup.mjs 之說明註解與 unit-srLogMark SLM-001 之對照斷言
  rg -n "\.time\s*>=|time\s*>=\s*t0" test
  # 2) 標記站點數. 期望: api-refCascade 9／api-externalRows 8／api-tokenSafety 1
  rg -c "markSrLog\(\)" test/api-refCascade.test.mjs test/api-externalRows.test.mjs test/api-tokenSafety.test.mjs
  # 3) 讀取呼叫皆傳標記. 期望: 無 readSrLogSince(t0 / Date.now 形式
  rg -n "readSrLogSince\(" test
  # 4) 重現(對照): 真後端新舊讀法並列(腳本自證據夾複製到 ./tmp/run10/; 需 11006 空閒). 期望: 新式 N/N; 舊式漏讀數依配對而異(多數配對為 0, 約每 5 組有 1 組大量漏讀)
  node tmp/run10/repro-clock.mjs 300
  ```
- **測試**: `unit-srLogMark`(SLM-001～010: 時鐘偏差下仍讀到、標記前不讀、殘行、跨小時、位元組定位／CRLF／不可解析行、檔名篩選、哨兵〔管線中前序行、延遲落檔、新檔、等不到拋錯〕、非標記拋 TypeError); 端到端由 `api-refCascade` API-RC-044 等 17 個標記站點(refCascade 9＋externalRows 8)之案與 `api-tokenSafety`／`api-externalRows` 之 log 斷言經真後端驗證。
- **已知限制**: ①`markSrLog` 多一個哨兵 HTTP 請求(約數十 ms／次); ②哨兵順序保證假設單一後端行程單一 transport(現況成立; 若日後多行程共寫同一目錄須改以各行程哨兵); ③只看最新 3 個 log 檔(logNumKeep 上限 8760 檔, 不逐檔 stat); ④「測試端時鐘 vs 後端時鐘」之偏差本身是環境事實, 未修(也不需要修); 其他跨行程時間比較若新增須依本規則改寫。
