# 功能正確性審查簡報(perm-run05: 登入識別值跨全表唯一〔不論 isActive、含他來源〕、getPermUserInfor 之 userId 依登入對應解析)

你是獨立審查者。目的:找出「我(實作者)漏掉的格」與實作中的功能正確性問題,不是替我背書。
本資料夾是一份**可丟棄之副本**(已含實作者的改動;`change.patch` 為相對於改動前的差異〔伺服端、測試、文件〕;本副本只含被審的相關檔案,不含 node_modules,無法也不需要執行測試)。
**只用相對路徑**(相對於目前資料夾)讀檔;不要讀本資料夾以外的路徑。不得修改、建立或刪除本資料夾內任何既有檔案;
若要做探測,請在 `probe/` 子資料夾自建夾具(自己寫的小腳本與資料),不得以既有檔案為刪除、合併、搬移、覆寫類函數之對象。不需要也不必安裝套件或執行完整測試。
可用唯讀查檔指令(例如 `rg`、`git diff`、`git status`)。讀含中文的檔案時請直接用 `rg -n '^' -- <檔>`(不要接 PowerShell 管線,否則中文會亂碼)。

## 一、被審的功能

權限系統(w-web-perm)的 `users` 表有兩種列:
- **後台列**(`from` 為空字串):由系統管理者在後台建立,`id` 是列的主鍵,也是該使用者在外部系統的使用者代號。
- **外部列**(`from` 非空):由外部應用透過 `POST /syncAndReplaceTabs` 匯入。每列帶外部自訂的來源鍵 `srcKey`(只在同一個 `from` 內唯一);`id` 是本系統配發的內部主鍵,外部不得提供。遷移前舊外部列沒有 `srcKey`。

登入時,外部系統(`getUserByToken`)回報該 token 的使用者 `id`;權限系統依部署設定 `mappingBy`(`'id'`〔預設〕｜`'email'`｜`'name'`)到 `users` 表找對應的列。`mappingBy='id'` 時的「登入識別值」(`loginIdOf`):後台列=`id`;外部列=`srcKey`;遷移前舊外部列(無 `srcKey`)暫=`id`。

上一輪(perm-run04)的狀態:撞值只計**有效**(`isActive==='y'`)列,只比「外部列 srcKey ↔ 後台列 id」;他來源外部列彼此同 `srcKey` 不在匯入端拒收,登入時「只有一列有效則登入到該列」。

主控本輪裁示(perm-run05):
1. `mappingBy='id'` 時,登入識別值須**跨全表唯一,不論 `isActive`、含他來源**(理由:不同外部系統的使用者代號碰撞常見而非同一人;停用列可被重新啟用)。匯入撞值 → 整批拒收固定錯誤鍵 `loginIdCollision`、零寫入、提示部署方改用可唯一對應之鍵;登入命中多於 1 筆(不論有效與否)一律拒絕 `ambiguousUserFromPerm`,不得「只有一列有效則放行」;既有跨來源重複之歷史資料:登入拒絕(並有 srLog 記錄),README 載稽核與處置。`email`／`name` 模式不變。
2. `/api/getPermUserInfor` 的 `userId` 於 `mappingBy='id'` 時依同一登入對應解析(外部列→`srcKey`、後台列→`id`、撞值拒絕);其他模式維持內部 id。
3. 遷移前舊外部列以 id 登入已核可。

實作者的設計決定(請挑戰,不是既定事實):
- (D1)後台列↔外部列之撞值**也**改為不論 `isActive`(主控字面只談「srcKey 跨來源唯一」;我擴及後台↔外部,理由:若仍只計有效列,匯入會放行停用列之撞值,其後轉為有效即造成登入永久拒絕)。
- (D2)舊外部列(無 `srcKey`)以其 `id` 為登入識別而**參與**撞值比對。
- (D3)撞值組合=同一登入識別值出現在兩列,且該對**不是**「兩後台列」與「同一來源之兩外部列」(後兩者由別處拒:主鍵重複、`srcKeyDuplicate`/`srcKeyConflict`)。外部列的內部 `id`(有 `srcKey` 者)不是登入識別,不參與。
- (D4)後台存檔「被觸及」=新增之列,或簽章(類別 `a`/`x:<from>` + 登入識別值)與庫內同 id 列不同者;停用↔啟用不改簽章,**不算被觸及**(歷史撞值不因啟用而新擋,但登入時照拒);歷史既有撞值原樣送回/群組指派/刪其中一列皆可存。
- (D5)登入查找 id 模式兩次 `select`(`{id}`、`{srcKey}`,**不帶 `isActive`**)合併去重後以 `loginIdOf` 複判;多於 1 筆 → 拒;恰 1 筆有效 → 登入;恰 1 筆停用 → 視同查無(`cannotGetUserFromPerm`)。
- (D6)`getPermUserInfor` 的解析(`WWebPerm.mjs:resolvePermUserId`)只用於 `/api/getPermUserInfor`;**查無或恰 1 筆停用 → 維持回「全停用的空權限」(不 reject)**——因既有 spec(E2E-005)與測試明訂查無使用者之 fail-safe 回應,屬先前輪次行為;多筆 → HTTP 回 `ambiguousUserFromPerm`。`/api/getPerm` 的 `userIdSelf` 已是 `getTokenUser` 回傳之內部 id,**不**經解析。
- (D7)離線稽核 `server/tools/nameDupReport.mjs --mapping-by id` 列撞值組。

## 二、請依序做(順序很重要)

**(1)先挑戰「表」的完整性**(最重要):輸入空間表是 `sgud/rule/rulebook_sync.md` 的 R-MAPKEY-05(17 格;並參見 R-MAPKEY-04 修訂後的表)。
請找出**缺的軸、缺的格、或格內「現況/結果」與程式不符者**,每一項附 `檔案:行號` 與具體輸入。
軸:入口(外部匯入／後台存檔／登入／getPermUserInfor／離線稽核) × 列形狀(後台有效/停用、外部有效/停用、遷移前舊外部列、他來源同 srcKey) × `isActive` 取值 × 被觸及者 × `mappingBy`。
也請自己用 `rg` 列舉:有哪些程式位置會建立/修改/刪除 `users` 列(例如 `modeEditUsers='for:grups'` 的 `pickKeysOnly` 路徑、`cascadeWrite` 引用連帶改寫、離線工具 `g_*.mjs`),哪些會以 `id`/`srcKey`/`mappingBy` 查找 `users`(`getTokenUser`、`getGenUserByKV`、`requireAdmin`、`getUserIdByToken`、`getPermUserInfor`…),看是否有我未覆蓋的入口。

**(2)審對標與對稱性**:同類成熟系統(以來源鍵/外部 id 對應內部使用者的 SSO/目錄同步)的作法與本設計的差異;匯入、後台存檔、登入、getPermUserInfor 四處的判準是否一致;`email`/`name` 路徑是否真的不變。

**(3)最後才審實作與測試**:
- `server/keyCheck.mjs` 的 `loginIdOf`／`findLoginUsers`／`findLoginIdClashDetail`;`server/WWebPerm.mjs` 的 `getTokenUser`、`resolvePermUserId`、`/api/getPermUserInfor` handler、`getGenUserByUserId`;`server/syncCore.mjs` 的撞值檢查;`server/procCore.mjs` 的撞值檢查(「被觸及」簽章);`server/procLang.mjs` 的 `loginIdCollision`;`server/tools/nameDupReport.mjs`。
- 邊界:`isActive` 取值非 `'y'`/`'n'`(例如 `'Y'`、布林、缺漏)、`srcKey`/`id` 大小寫與前後空白(本系統一律精確 `===`)、`from` 為 `null`/缺漏/純空白字串、數字型 id、原型鍵名(`__proto__`、`constructor`)、同一請求內同時出現撞值與其他錯誤時的優先序、`mappingBy` 為不合法值。
- 並行:登入查找與 `getPermUserInfor` 解析不取表鎖,兩次 `select` 之間表被改動,結果是「暫時查不到/多筆」還是可能「對到錯的人」?
- 測試:`test/unit-loginId.test.mjs`、`test/unit-procCore-loginId.test.mjs`、`test/unit-syncCore.test.mjs`(SC-L3/L4/L4b)、`test/api-mapKeyId.test.mjs`(MI-009、MI-011～016)、`test/unit-nameDupReport.test.mjs`(ND-005b):是否有「看似守護、實際對現行碼恆成立」的空洞斷言?哪些改動(請具體說明如何改壞程式)不會被任何測試抓到?
- 既有測試夾具改動(`api-getPermUserInfor` 007/008、`api-keyProp`、`api-authMerge`、`api-refCascade`、`e2e-external-rows`、`e2e-ref-cascade`、`e2e-array-form`):外部使用者查授權改傳 `srcKey`,是否削弱了原本的斷言?
- log/訊息:`loginIdCollision` 新文案、新 reason(`srcKeyOtherFrom`)與 srLog 是否可能洩漏 `id`/`srcKey` 值?
- 文件與實作是否一致:`README.md`(Upgrade Notes 第 4 項:稽核與處置步驟是否可照做)、`server/WWebPerm.mjs` 的 JSDoc `opt.mappingBy`、`src/getPermUserInfor.mjs` 的 JSDoc、`sgud/rule/rulebook_sync.md` R-MAPKEY-05、`spec/` 相關流程文件。

## 三、輸出格式

直接把報告寫在最後一則回覆(純文字,繁體中文)。每個發現一條:
`#<序號> [嚴重度:高/中/低] <一句話> — 位置 <檔案:行號> — 失敗情境(具體輸入→實際結果→預期結果) — 建議`
- 嚴重度:高=會造成錯誤結果、資料遺失、登入到錯的人或發布後壞掉;中=契約缺陷、測試覆蓋缺口、邊界未處理;低=文件、命名、風格。
- 沒有發現時明說「無發現」並列出你檢查過的面向,不要湊數。
- 區分「確定(已讀碼/已探測證實)」與「推測(未證實)」。
- 最後一行寫 `REVIEW-END`。

## 四、規格摘要(真理源之相關句)

(完整規格見 `SPEC-外部匯入之定義與機制.md`。)
- 外部列(`from` 非空)以外部 token 之使用者 id 對 `srcKey`;後台列(`from` 為空)對 `id`。
- 本輪裁示:登入識別值須跨全表唯一、不論 `isActive`、含他來源;匯入撞值整批拒收並提示;登入命中多筆一律拒絕;`getPermUserInfor` 之 `userId` 依同一登入對應解析(僅 `mappingBy='id'`);舊外部列以 id 登入核可;`mappingBy` 為 `email`／`name` 時不變。
