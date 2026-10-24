## 功能正確性審查:w-web-perm「應用系統 token 之配合、應用系統路由等級、Bearer 方案、路由失敗訊息」

你是獨立的程式碼審查者。工作目錄是一份**唯讀快照副本**(根目錄即你的工作目錄),內含待審之原始碼、測試與文件。請**自己讀檔**審查,不要要求我貼內容。審查範圍是功能正確性(輸入是否被正確分類、檢查之值是否即使用之值、拒絕鍵與次序是否合規定、測試是否真的守住規定),不是風格。

### 副本內檔案(相對路徑)
- `server/WWebPerm.mjs`(主體;重點函數:`getExtUser`、`countPermRows`、`verifySystemApp`、`getTokenUser`、`getAndVerifyClientUser`、`getAndVerifyAdminUser`、`getAndVerifyAppUser`、`requireAdmin`、`kpSystemAppUser`/`kpSystemAppIds`、`reBearerAuth`、`verifyConn`、`getUserIdByToken`、四條 hapi 路由與 `/syncAndReplaceTabs` 之次序)
- `server/adminCheck.mjs`(`isAdminRow`、`isSystemAppUser`)、`server/keyCheck.mjs`(`findLoginUsers`、`countLoginRows`)、`server/routeResult.mjs`(新)、`server/procLang.mjs`、`server/procCore.mjs`、`server/dataChannel.mjs`、`server/syncCore.mjs`
- `srv.mjs`(範例部署,含測試用權杖)
- 測試:`test/api-callerMatrix.test.mjs`(新;呼叫者×入口矩陣)、`test/unit-appToken.test.mjs`(新)、`test/unit-routeResult.test.mjs`(新)、被改寫之 `test/api-adminOnly.test.mjs`、`api-callerIdentity`、`api-verifyConn-auth`、`api-tokenSafety`、`unit-adminOnlySite`、`test/tools/api-setup.mjs`
- 文件:`README.md`、`spec/ADR-040.md`(本輪決策)、`spec/流程_應用啟動與登入.md`、`spec/流程_查詢指定使用者權限.md`、`sgud/rule/rulebook_security.md`
- 規格:`dspec/w-web存取管控表.md`(**第二節**為本輪驗收之目標表)、`dspec/使用者身分驗證原則.md`(二之一為 token 種類與用途)

### 規定(本輪要求,以此為準)
token 種類:使用者 token(一般使用者/管理員)代表登入者;應用系統 token(部署方 `getUserByToken` 回傳 `isApp='y'`)分兩種用途:
- **使用者用途**:以 `userId` 綁定使用者;上游反查回所綁使用者之**實際資料**加 `isApp='y'`(`isAdmin` 依該使用者);能用之服務=所綁使用者以自己之使用者 token 能用者。perm 以所綁使用者在自身 users 表之列判定,**不需特別處理**。
- **系統服務用途**:不綁使用者,代表外部應用系統本身;上游反查回 `id='app:<金鑰主鍵>'`、名稱為金鑰名稱、`isApp='y'`、`isAdmin='y'`(email 可為空);能用管理員之服務。
perm 自身 users 表中 `isActive='y'` 且 `isAdmin='y'` 之列為管理員(權威)。需求:
1. **P-1** `/api/getPermUserInfor`、`/syncAndReplaceTabs` 由套件自行要求呼叫者為管理員等級:呼叫者在 users 表者以該列為準(`isAdmin='y'` 且啟用);不在表者須反查結果 `isApp='y'` 且 `isAdmin='y'`。部署方 `verifyAppUser` 照舊套用(只能再收緊)。一般使用者、使用者用途綁一般使用者皆拒(固定鍵)。
2. **P-2** 系統服務用途可用管理員之後端服務:後台登入檢查、資料通道各入口(含四表 `select`、四個 `update*` 之 `requireAdmin`)對系統服務用途(不在 users 表、反查 `isApp='y'` 且 `isAdmin='y'`)放行;寫入之稽核欄記其 `id`(`app:…`)。`getUserByToken` 契約增選用欄位 `isApp`(未給視同 `'n'`,行為同修正前)。
3. **P-3** 連線閘之 `Authorization` 須為 `Bearer` 方案(大小寫不敏感、單一空白分隔),其餘視同無 token。
4. **P-5** `/syncAndReplaceTabs` 先驗身分再驗 `keyTable` 等參數,未驗證者不得由錯誤鍵差異探測。
5. **P-7** 範例 `srv.mjs` 之 `verifyClientUser` 不以 `isAdmin` 判斷,非管理員一律看到「無權進入權限後台」;部署方否決者(非角色因素)維持 `userNoPermission`。
6. 路由失敗時不回 ORM/I-O 原文,改回固定語系鍵,原文只入 srLog。
不得改變:1.1.15 之行為(後台與資料通道只限 users 表之管理員、同批重複 id 拒收、`/api/getPerm` 供一般使用者查本人樹)、`srcKey` 匯入、多人同時編輯之寫入契約。

### 審查順序(依序做,報告也依序寫)
**①先審「輸入空間表」之完整性**:本輪之矩陣=呼叫者(無 token、一般使用者、管理員、使用者用途綁管理員、使用者用途綁一般使用者、系統服務用途;相容:isApp 未轉傳、AS 形狀但 isAdmin n、使用者用途綁停用之使用者、虛擬應用系統)× 入口(靜態檔、4 條 hapi 路由、5 條通訊路由、14 個資料通道函數;資料通道另分標頭/本體兩個身分來源)。請挑戰:缺軸、缺格、格內之「現況/應然」與原始碼不符者(附 `file:line` 與具體輸入→實際輸出)。尤其注意:`mappingBy` 為 `id`/`email`/`name` 三種;users 表之列為後台列/外部列(有 `srcKey`)/停用列/重複命中;系統服務用途之 `email`/`name` 缺漏;外部 `getUserByToken` 回傳形狀之各種缺欄或型別錯誤;同一請求內標頭 token 與本體 `__sysToken__` 為不同身分之組合。
**②審對標與對稱性**:同類成熟產品對「服務帳號/機器對機器 token」與「使用者代理 token」之通行作法與本實作之差異;`/api/getUserByToken`、資料通道連線閘、執行身分(`getUserIdByToken`)、`requireAdmin`、應用系統路由,五個入口對同一身分之判定是否一致(不對稱即缺陷)。
**③審實作與規定之符合**:逐項核對 P-1/P-2/P-3/P-5/P-7/路由失敗訊息。重點自問:(a)「在 users 表」之判定(`countLoginRows`,不論 isActive)與登入反查(`findLoginUsers`)之差異是否留下缺口(例如停用之管理員綁定之使用者用途 token 是否落入系統服務用途);(b)檢查之值是否即使用之值(部署方函數改寫其收到之物件、`getUserByToken` 被呼叫幾次、檢查與使用之間資料是否可能被改);(c)`requireAdmin` 之「不在表者須為已登錄之系統服務用途 id」是否有退化或誤放行之路徑(例如 perm 管理員之列被刪除、同 id 衝突、登錄集合之成長);(d)拒絕鍵次序(`userNoPermission` 先於 `userNotAdmin`)與 srLog 內容(不得含 token 與使用者資料);(e)Bearer 正規式是否有邊界問題(換行、全形空白、極長輸入、`\S+` 與 token 內合法字元);(f)`/syncAndReplaceTabs` 在身分驗證前是否仍有任何讀取/記錄 `keyTable` 之處;(g)`routeResult` 對各種拒絕值(Error 子類、字串、物件、null、數字)之處理,以及 `toOutKey` 之語系鍵集合是否涵蓋路由實際可能 reject 之所有鍵;(h)與不得改變之行為有無衝突。
**④審測試是否真的守住規定**:`test/api-callerMatrix.test.mjs` 與 `test/unit-appToken.test.mjs` 之每條斷言對應規定哪一句?有哪些「恆真/空過」的斷言(例如迴圈裡未驗證預期值、條件寫錯導致分支永不命中)?列出你認為「拿掉某行產品程式碼卻仍全綠」的變異(附行號與預期應失敗之測試名)。

### 回報格式
最後的回覆**只含**一份 markdown 審查報告,不要寫其他檔案。每一條發現:`編號 | 一句話 | file:line | 具體場景(輸入→實際輸出→應有輸出) | 嚴重度(高=錯誤結果/安全或資料問題;中=契約缺陷/測試漏洞/邊界;低=文件命名) | 是否改變不得改變之行為(是/否)`。沒有發現就明寫「無」,不要為湊數而列。對「我自己已在文件列為已知限制/待裁示」之項目(見 `spec/ADR-040.md` Consequences),只在你認為有更好處置時才寫。


### 作業限制
- 這是**唯讀審查**:不得修改、建立或刪除任何檔案,不得執行測試、啟動服務或安裝套件。可使用唯讀查檔指令(例如 `rg`)。
- 讀含中文之檔案時請用 `rg -n '^' -- <檔>`(限範圍用 `rg` 自己的 `-m`/`-A`/`-B`/`-C`),不要用 `Get-Content` 接管線(編碼會失真)。
- 先做最小探測:讀 `server/adminCheck.mjs` 並原文引用其中 `function isSystemAppUser` 那一行,放在報告第一行(確認能讀檔)。
