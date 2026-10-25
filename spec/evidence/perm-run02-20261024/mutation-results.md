# perm-run02 變異驗證與修前紅(2026-10-24; 凍結碼最終輪)

腳本: `run-evidence.mjs`(同目錄; 單一測試鎖內循序執行, 原地改檔、結束還原, 以 `cmp` 驗證 `server/WWebPerm.mjs`、`server/adminCheck.mjs`、`srv.mjs` 與備份相同)。
原始結果: `mutation-results.json`、`old-code-results.json`(皆為凍結碼最終輪); 執行摘要 `evidence-final-run.summary.txt`; 修前紅整份 log: `red-old-api-full.log`。
受測檔: `test/api-callerMatrix.test.mjs`(52 案)＋`test/unit-appToken.test.mjs`(20 案), 每個變異 `--bail` 取首敗。

## 一、修前紅

| 方式 | 受測 | 結果 |
|---|---|---|
| A. 測試先於實作先跑(`red-api-callerMatrix.summary.txt`, 2026-10-24 20:55; 當時 44 案) | `api-callerMatrix` | **30 敗／14 過**: MX-H2、MX-H4、MX-H5、MX-C×5、MX-D×14、MX-P7、MX-M1×2、MX-Q1、MX-R1～R4 |
| B. 凍結碼最終輪: 以 `git show HEAD:` 取代 `server/WWebPerm.mjs`＋`server/adminCheck.mjs` 後重跑(`old-code-results.json`) | `api-callerMatrix`(52 案) | **32 敗／20 過**(含外審後補之案: MX-R5～R8、MX-M5～M7 中對舊碼為紅者) |
| 同上 | `unit-appToken` | 整檔於 import 即失敗(`isExtAdminUser` 尚無匯出, `importFail:true`); 另以探針(單次執行、未保留)逐項確認修前 `isSystemAppUser({id:'sso-admin-77',isApp:'y',isAdmin:'y'})`、`{id:'id-for-application',…}`、`{id:'x',…}`、`{id:' ',…}` 皆回 `true`(應為 `false`) |

## 二、變異(21 個, 21／21 被抓到)

| id | 變異 | 被誰抓到(首敗) |
|---|---|---|
| MA1 | ①應用系統路由不在表分支重新要求 `isApp` | `api-callerMatrix` MX-H4 |
| MA2 | ①不在表分支改回嚴格認定 `isSystemAppUser` | MX-H4 |
| MA3 | ①不在表分支不判等級(恆真) | MX-H4(一般使用者 NFN／ASN 被放行) |
| MA4 | ①`isExtAdminUser` 另要求 `app:` 前綴 | MX-H4 |
| MA5 | ①`isExtAdminUser` 恆真 | MX-H4 |
| MA6 | ①在表者改採反查之 `isAdmin`(不以 perm 列為準) | MX-P1(AU 綁管理員降級後仍放行) |
| MB1 | ②系統服務用途拿掉 `app:` 前綴條件 | MX-H2 |
| MB2 | ②前綴比對不分大小寫 | `unit-appToken` AT-001b(輸入空間含 `App:k`／`APP:k`) |
| MB3 | ②前綴比對改 `includes` | AT-001b(`xapp:k`) |
| MB4 | ②前綴比對先 `trim` | AT-001b(` app:k`) |
| MB5 | ②前綴常數改 `'app'`(無冒號) | AT-001b(`app-k`／`app`) |
| MB6 | ②系統服務用途不要求 `isApp` | MX-H2(NF 被當成系統服務用途) |
| MC1 | ②後台／資料通道閘門改用 `isExtAdminUser` | MX-H2 |
| MC2 | ②閘門不要求不在表 | MX-M2 |
| MC3 | ②`requireAdmin` 對不在表者恆放行 | **MX-M6**(外審後新增之確定性競態測試; 原版只由站點守護 AT-S5 抓到) |
| MC4 | ②`getUserIdByToken` 對任何身分登錄系統服務用途 id | MX-M6 |
| MD1 | 外審 F3: 以 perm 列通過者不清除同 id 之近期登錄 | MX-M6 |
| MD2 | 外審 F4: `requireAdmin` 查無列時提前放行(保留原三元式, 避開字串守護) | MX-M6 |
| MD3 | 外審 F3: `clearSystemAppId` 變成空操作 | MX-M6 |
| MD4 | 外審增量 G4: 嚴格系統服務形狀略過對應鍵查找(只留主鍵相等檢查) | MX-M7 |
| MD5 | 外審 F1: 應用系統路由先判等級再判部署方否決(不在表 isAdmin n 且被否決者回 `userNotAdmin`) | MX-P4 |

**誠實註記**: ①MB2～MB5(前綴比對的細微變形)只由單元層 AT-001b 抓到——API 層測試權杖只有少數 id, 不含大小寫、空白、`includes` 型態之 id; 單元層的輸入空間(22 個 id × 13 × 13)負責該軸。②MC3／MC4 在 API 層原不可達(連線閘與執行身分先擋下不合格者), 原版由站點守護 AT-S5 抓到; 外審 sol F4 指出字串守護是現狀指紋(保留原三元式而提前放行即可躲過), 故補 MX-M6——以 `srv.mjs` 部署方鉤子(對 `app:key-ghost` 列等待 4 秒)撐開窗口、測試於等待中刪列, 才由行為層抓到。③MD5 由既有 MX-P4(在表分支)首先抓到; 不在表分支之同型守護為 MX-R6——以 `MUT_NOBAIL=1`(不在首敗即停)重跑 MD5 實測: 兩案皆失敗(MX-P4、MX-R6)。④MD5、MA 系列之錨點驗證恰命中 1 次(腳本自帶檢查)。

## 三、完成條件 2 對照

「應用系統路由重新要求 `isApp`」= MA1(及 MA2): 被抓到。「系統服務用途拿掉 `app:` 前綴條件」= MB1: 被抓到。
