# 功能正確性審查:w-web-perm「權限後台與資料通道只限系統管理者」+「後台整表寫入同批重複 id」+「isSameFile 精度」

你是獨立的功能正確性審查者。被審對象是一份 Node.js(ESM)套件 w-web-perm 的工作樹副本,位於:

    C:\opensrc\開源-JS-411-8-w-web-perm\w-web-perm\tmp\perm-run01\review\repo

(副本不含 node_modules 與 dist,不能執行測試或啟動服務;請以閱讀原始碼為主。)

## 讀檔與限制(重要)

- 你可以執行唯讀查檔指令(例如 `rg`)。含中文的檔案請用 `rg -n '^' -- <檔>` 讀,不要用 `Get-Content`(會亂碼);要限範圍用 rg 自己的 `-m`、`-A`、`-B`、`-C` 參數,不要接 `| Select-Object`。
- 不得修改被審副本內的任何檔案。需要寫檔時,只能寫在你的輸出目錄:`C:\opensrc\開源-JS-411-8-w-web-perm\w-web-perm\tmp\perm-run01\review\out\`。任何探測腳本都放在輸出目錄,以輸出目錄內自建的夾具為對象;不得以副本內既有檔案作為刪除、合併、搬移、覆寫類函數的對象。
- 你的最終報告寫入 `...\review\out\sol-report.md`(UTF-8),並在最後回覆中只簡述條數。報告內每個發現須附 `檔案:行號` 與你實際讀到的程式碼片段,不要只引用我的說明。

## 背景(使用者 2026-10-24 裁示)

「數據傳輸都要通過 token 識別身份,也都要按權限設定產製對應權限樹;系統管理者才能讀寫 4 表,一般使用者是沒法進權限後台的,故只能用 token 查自己權限樹。」

定義:系統管理者＝perm 自己的 `users` 表中 `isAdmin='y'` 且 `isActive='y'` 之列(以 perm 自身的表為權威,不採外部 token 回報的 isAdmin 值);一般使用者＝`isAdmin='n'` 者。

## 本輪變更(請用 `rg` 在副本內自行定位,以下僅為導覽)

範圍一(主要):
1. `server/adminCheck.mjs`:`isAdminRow(row)`,判準單一擁有者。
2. `server/WWebPerm.mjs`:`getAndVerifyClientUser(token, from, { adminOnly })`、`getAndVerifyAdminUser`;連線閘 `checkToken`(經 `verifyConn`,涵蓋 main 與上傳下載各 apiType)、執行身分 `getUserIdByToken`、後台登入檢查 `/api/getUserByToken` 三處改經 `getAndVerifyAdminUser`;`/api/getPerm`(一般使用者查本人權限樹)與應用系統路由(`/api/getPermUserInfor`、`/syncAndReplaceTabs`)刻意不變;`requireAdmin` 保留為縱深防禦。
3. 前端:`src/App.vue` 的 `loginError` 對後端回 `userNotAdmin` 時顯示「無權進入權限後台」並停留(不轉址);`src/components/LayoutState.vue`、`src/plugins/mUI.mjs`(kpFallback)、`server/procLang.mjs`。
4. 測試:`test/api-adminOnly.test.mjs`、`test/unit-adminOnlySite.test.mjs`、`test/api-callerIdentity.test.mjs`(A 組改寫)、`test/e2e-init.test.mjs`(E2E-007)。

範圍二:`server/procCore.mjs` 後台整表寫入(`updateUsers`/`updateGrups`/`updatePemis`/`updateTargets`)同批重複 `id` 整批拒收(`saveRowFieldDuplicate`、零寫入),含 users 的 `pickKeysOnly`(`modeEditUsers='for:grups'`)模式的預檢;測試 `test/unit-procCore-writeValidate.test.mjs` WV-DUPID-*、`test/api-batchIdDup.test.mjs`。

範圍三:`server/tools/authRefsAudit.mjs` 的 `isSameFile`(以 bigint 取 inode,避免 NTFS 檔案識別碼超過 2**53 時不同檔被判成同一檔);測試 `test/unit-refAudit.test.mjs` RA-037b/c。

框架行為請以 `node_modules` 之外的事實為準:副本不含 node_modules,關於 w-serv-webdata / w-converhp 的行為(例如框架在執行任何函數前會呼叫 `getUserIdByToken` 反查本體 `__sysToken__`;`verifyConn` 於每條 `/api/*` 資料通道路由先被呼叫;`[sys:getFuncList]` 等系統函數也在 `getUserIdByToken` 之後執行),我已在原環境核對,請當作已知前提,但若你從 `server/WWebPerm.mjs` 的註解與用法看出矛盾,請指出。

## 請依序做三件事(順序很重要)

### 一、先挑戰「輸入空間表」的完整性(最重要)

下表是我自己列的「入口 × 角色」表。**我的表一定有洞**,請找出我漏的軸、漏的格、以及格內現況不屬實的地方(附 `file:line`):

- 入口軸(我列的):`/api/main` 的 RPC 唯讀(`getWebInfor`/`getStaEvent`/`getStaEventTable`)、寫入(`updateTargets/Pemis/Grups/Users`)、表 `select`(四表)、系統函數(`[sys:getFuncList]`/`[sys:getTableTags]`/`[sys:polling]`)、上傳下載五條路由(ulctr/slc/dwgfn/dwgf/dw)、本體 `__sysToken__`(執行身分)、`/api/getUserByToken`、`/api/getPerm`、`/api/getPermUserInfor`、`/syncAndReplaceTabs`、靜態檔。
- 角色軸(我列的):系統管理者、部署方放行之一般使用者、被升為系統管理者、停用之系統管理者、部署方拒絕者、不在 perm 表者(應用系統 token)、無效 token。
- 驗證關軸:外部 `getUserByToken` → perm users 存在且啟用 → 部署方 `verifyClientUser` → 角色。

請特別檢查:(a) 是否還有任何「一般使用者可讀到 4 表資料或權限管理資料」的路徑未經 `getAndVerifyAdminUser`(包含 hapi 其他路由、`WServHapiServer` 選項、`kpFunExt`、事件監聽、輪詢/廣播、`provideTabs`、`g_*.mjs`)?(b) 角色判定的「檢查之值」與「使用之值」是否同一個(例如 `getTokenUser` 回傳的列、`mappingBy` 為 `id`/`email`/`name` 時的對應、同一請求內兩個 token)?(c) 角色在連線後被降級的競態,`requireAdmin` 是否真的能補上?(d) 各 `from`/`apiType` 值是否都走到同一道閘?

### 二、審對標與對稱性

與同類成熟系統(例如 RBAC 後台:登入即做角色檢查、資料 API 伺服端做授權、一般使用者只能取得自己的權限)相比,本實作有哪些差異?同型元素(`checkToken`、`getUserIdByToken`、`/api/getUserByToken`、`/api/getPerm`、`/api/getPermUserInfor`、`/syncAndReplaceTabs`)的處理是否對稱,不對稱處是刻意的還是缺陷?

### 三、最後才審方案與步驟

- 範圍一的程式與測試:錯誤處理順序(拒絕鍵 `userNoPermission` 先於 `userNotAdmin`)、srLog 是否外洩 token 或使用者資料、前端「停留不轉址」的取捨、`isAdminRow` 的嚴格性、測試是否真能抓到「拿掉角色檢查」的變異(請想像三種變異:連線閘改回 `getAndVerifyClientUser`、執行身分改回、登入檢查改回;逐一判斷哪些測試會失敗)。
- 範圍二:同批重複 id 的判定是否涵蓋 users/grups/pemis/targets 四表與 `pickKeysOnly` 模式、數字與字串同值 id、缺 id 之列;是否有「兩列被併成一列」的其他路徑(例如 `ltdtDiffByKey`、`mergePickKeysOnly`、外部匯入以外的寫入路徑)。
- 範圍三:`isSameFile` 的修正是否完整(`a.ino !== 0n`、`dev` 型別、符號連結別名、不存在檔的處理);同類寫法是否還有其他站點。

## 報告格式

在 `sol-report.md` 先寫三段標題(一、輸入空間表挑戰;二、對標與對稱;三、方案與步驟),每個發現一條:

    #N [嚴重度:高/中/低] 一句話內容
    - 位置:檔案:行號(與你讀到的程式片段)
    - 失敗情境:具體輸入(角色/入口/請求)→ 預期結果 vs 實際結果
    - 建議:最小修法

沒有發現的區域也請明寫「已檢查、未發現」並列出你檢查了哪些檔案與行號範圍。嚴重度:高＝會造成錯誤結果、資料外洩或發布後壞掉;中＝契約缺陷、測試漏洞、邊界未處理;低＝文件、命名、風格。
