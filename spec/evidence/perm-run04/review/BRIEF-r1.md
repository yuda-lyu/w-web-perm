# 功能正確性審查簡報(perm-run04: users 登入對應 mappingBy='id' 之 O1 規則)

你是獨立審查者。目的:找出「我(實作者)漏掉的格」與實作中的功能正確性問題,不是替我背書。
本資料夾是一份**可丟棄之副本**(已含實作者的改動;`change.patch` 為相對於改動前的差異〔伺服端、測試、文件〕,另有 3 個新測試檔 `test/unit-loginId.test.mjs`、`test/unit-procCore-loginId.test.mjs`、`test/api-mapKeyId.test.mjs` 不在 patch 內)。本副本只含被審的相關檔案,不含 node_modules,無法也不需要執行測試。
**只用相對路徑**(相對於目前資料夾)讀檔;不要讀本資料夾以外的路徑。不得修改、建立或刪除本資料夾內任何既有檔案;
若要做探測,請在 `probe/` 子資料夾自建夾具(自己寫的小腳本與資料),不得以既有檔案為刪除、合併、搬移、覆寫類函數之對象。不需要也不必安裝套件或執行完整測試。
可用唯讀查檔指令(例如 `rg`、`git diff`、`git status`)。讀含中文的檔案時請直接用 `rg -n '^' -- <檔>`(不要接 PowerShell 管線,否則中文會亂碼)。

## 一、被審的功能

權限系統(w-web-perm)的 `users` 表有兩種列:
- **後台列**(`from` 為空字串):由系統管理者在後台建立,`id` 是列的主鍵,也是該使用者在外部系統的使用者代號。
- **外部列**(`from` 非空):由外部應用透過 `POST /syncAndReplaceTabs` 匯入。每列帶外部自訂的來源鍵 `srcKey`(只在同一個 `from` 內唯一);`id` 是本系統配發的內部主鍵(uuid),**外部不得提供**。

登入時,外部系統(`getUserByToken`)回報該 token 的使用者 `id`;權限系統依部署設定 `mappingBy`(`'id'`〔預設〕｜`'email'`｜`'name'`)到 `users` 表找對應的列(只找 `isActive==='y'` 者,恰 1 筆才登入,0 筆回 `cannotGetUserFromPerm`,多於 1 筆回 `ambiguousUserFromPerm`,不取首筆)。

主控裁示(O1):`mappingBy='id'` 時——
1. 外部列以外部 token 之使用者 id 對 **`srcKey`**,後台列對 **`id`**。
2. **撞值**:某(有效)外部列的 `srcKey` 與某(有效)後台列的 `id` 相同(登入會同時符合兩位使用者)。三處皆須拒絕:
   - 匯入批次:整批拒收(固定錯誤鍵 `loginIdCollision`)、零寫入;
   - 後台存檔(`updateUsers`):新增或改變之後台列 `id` 與既有外部列 `srcKey` 相同 → 整次拒收、零變更;
   - 登入:對應結果多於 1 筆 → 拒絕(`ambiguousUserFromPerm`),不取首筆。
3. `mappingBy` 為 `'email'`／`'name'` 時行為不變。
4. 遷移:升版前外部列沒有 `srcKey`(其 `id` 就是外部給的值);首次匯入時批次 `srcKey` 等於其 `id` 者視為同一列並補上 `srcKey`。遷移後既有外部使用者照常登入;升版後新匯入者以其 `srcKey` 登入。

實作者的設計決定(請挑戰,不是既定事實):
- (D1)遷移前、尚無 `srcKey` 的舊外部列,在首次匯入補上 `srcKey` 之前**暫以 `id` 登入**(規格未明載;目的:升版後至首次推送前不致所有舊外部使用者登入失敗)。
- (D2)撞值只計**有效**(`isActive==='y'`)列;匯入批次的**全部列**皆視為「被觸及」;後台存檔只擋「新增之後台列」與「停用改啟用之後台列」,**歷史既有(未被觸及)的撞值原樣送回不擋**(與既有的 email/name 對應鍵規則 R-MAPKEY-01／03 同口徑)。
- (D3)他來源外部列彼此 `srcKey` 相同(`srcKey` 只在 `from` 內唯一)**不**在匯入端拒收,登入命中多筆才拒。
- (D4)登入查找以兩次帶條件的 `select`(`{id, isActive:'y'}`、`{srcKey, isActive:'y'}`)合併去重後,再以 `loginIdOf` 複判。
- 另有一項純文案變更:警示橫幅語系字串 `syncWarnIdRenumber` 的口徑由「重編 id」改為「重編來源鍵(srcKey)」。

## 二、請依序做(順序很重要)

**(1)先挑戰「表」的完整性**(最重要):下列輸入空間表是我列的(來源:`sgud/rule/rulebook_sync.md` 的 R-MAPKEY-04)。
請找出**缺的軸、缺的格、或格內「現況/結果」與程式不符者**,每一項附 `檔案:行號` 與具體輸入。
軸:入口(外部匯入／後台存檔／登入) × 列形狀(後台有效/停用、外部有效/停用、遷移前舊外部列、他來源同 srcKey) × 被觸及者 × `mappingBy`。
也請自己用 `rg` 列舉:有哪些程式位置會建立/修改/刪除 `users` 列、哪些會以 `id`/`srcKey`/`mappingBy` 查找 `users`,看是否有我未覆蓋的入口(例如離線工具、`getPermUserInfor`、`getUserIdByToken`、`requireAdmin` 等)。

**(2)審對標與對稱性**:同類成熟系統(例如以來源鍵/外部 id 對應內部使用者的 SSO/目錄同步)的作法,與本設計的差異;三個入口(匯入、後台存檔、登入)的判準是否一致;`email`/`name` 路徑是否真的不變。

**(3)最後才審實作與測試**:
- `server/keyCheck.mjs` 的 `loginIdOf`／`findLoginUsers`／`findLoginIdClash`;`server/WWebPerm.mjs` 的 `getTokenUser`;`server/syncCore.mjs` 的撞值檢查位置;`server/procCore.mjs` 的撞值檢查(「被觸及」判定);`server/procLang.mjs` 的 `loginIdCollision`。
- 邊界:`isActive` 取值非 `'y'`/`'n'`(例如 `'Y'`、布林、缺漏)、`srcKey`/`id` 大小寫與前後空白(本系統一律精確 `===`)、`from` 為 `null`/缺漏/純空白字串、數字型 id、原型鍵名(`__proto__`、`constructor`)、同一請求內同時出現撞值與其他錯誤時的優先序。
- 並行:登入查找不取表鎖,匯入與後台存檔各取同一把表鎖;兩次 `select` 之間表被改動是否會讓登入結果錯誤(登入到錯的人 vs 只是暫時查不到/多筆)?
- 測試:`test/unit-loginId.test.mjs`、`test/unit-procCore-loginId.test.mjs`、`test/api-mapKeyId.test.mjs`、`test/unit-syncCore.test.mjs` 的 SC-L1～L10:是否有「看似守護、實際對現行碼恆成立」的空洞斷言?哪些改動(請具體說明如何改壞程式)不會被任何測試抓到?
- log/訊息:新錯誤鍵 `loginIdCollision` 與 srLog 是否可能洩漏 `id`/`srcKey` 值?
- 文件與實作是否一致:`README.md`(Upgrade Notes 第 4 項)、`server/WWebPerm.mjs` 的 JSDoc `opt.mappingBy`、`sgud/rule/rulebook_sync.md` R-MAPKEY-04、`spec/流程_外部應用同步權限資料.md` E2E-041／042。

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
- 某外部列之 `srcKey` 與某後台列之 `id` 相同即為撞值:匯入批次整批拒收(固定錯誤鍵)、零寫入;後台存檔新增或改變之後台列 `id` 與既有外部列 `srcKey` 相同 → 整次拒收;登入對應結果多於 1 筆 → 拒絕,不取首筆。
- `mappingBy` 為 `email`／`name` 時不變。
- 遷移後既有外部使用者(`srcKey` 等於舊 `id`)照常登入;升版後新匯入之外部使用者以其 `srcKey` 可登入。
