`function isSystemAppUser(user) {`

讀取位置：`server/adminCheck.mjs:31`。本報告為唯讀靜態審查；未修改檔案、執行測試或啟動服務。以下輸出與變異存活均由原始碼推導，並非實測結果。

**① 輸入空間表之完整性**

新矩陣確實列出十類呼叫者與二十四個入口，但尚不足以代表題目要求的完整輸入空間。`AT-002` 的三種對應方式是 helper 測試，不能替代入口層的分類驗證。

| 編號 | 一句話 | file:line | 具體場景：輸入 → 實際輸出 → 應有輸出 | 嚴重度 | 是否改變不得改變之行為 |
|---|---|---|---|---|---|
| F01 | 新矩陣缺少對應方式、資料列形狀及不同類型標頭／本體身分的交叉格。 | `test/api-callerMatrix.test.mjs:36`、`:98`、`:306`；`test/unit-appToken.test.mjs:102` | 標頭 AS、本體 A → 程式應以 A 執行，但矩陣沒有該格；其「header」測 `(c,c)`，「body」測 `(A,c)`。矩陣也沒有切換 `mappingBy`，呼叫者夾具皆為後台列，未涵蓋以 `srcKey` 登入的外部呼叫者、重複命中，以及缺／錯型別之 email、name → 應加入這些入口層案例，驗身分、拒絕鍵及稽核值。 | 中 | 否 |

格內另有下列具體不一致，依要求放在後續對稱性與實作段落說明，而不重複計列：不同內外部 id 的稽核值（F02）、AS id 衝突（F03）、失效對應鍵造成改類（F04）。

**② 對標與五個入口的對稱性**

| 成熟產品作法 | 與本實作的對照 |
|---|---|
| Microsoft Entra 分別授權使用者代理與應用程式自身；代理存取受使用者權限限制，應用程式存取使用獨立的應用程式權限。[官方說明](https://learn.microsoft.com/en-us/entra/identity-platform/permissions-consent-overview) | AU 跟隨所綁使用者符合這個方向；本案主要缺口是用途與執行身分未完整保留到後續檢查。 |
| Auth0 的 Client Credentials 驗證與授權應用程式自身，沒有登入使用者。[官方說明](https://auth0.com/docs/get-started/authentication-and-authorization-flow/client-credentials-flow) | AS 不必建立一般 users 列合理；但其身分不能因 email、name 或另一種 id 查找方式而變成使用者。 |
| Keycloak 為 client 提供服務帳號，權限取服務帳號角色與 client scope mappings 的交集。[官方說明](https://www.keycloak.org/docs/latest/server_admin/index.html#_service_accounts) | 本輪將 AS 授予完整系統管理者能力是明訂政策；仍須保留「這次經驗證的是服務身分」的憑據，不能只剩程序歷史中的字串 id。 |

| 編號 | 一句話 | file:line | 具體場景：輸入 → 實際輸出 → 應有輸出 | 嚴重度 | 是否改變不得改變之行為 |
|---|---|---|---|---|---|
| F02 | 應用路由檢查 perm 列的角色，卻丟棄該列，以外部 id 寫入稽核欄。 | `server/WWebPerm.mjs:608`、`:616`、`:1124`、`:1159`；`server/syncCore.mjs:376` | `mappingBy='id'`；外部使用者 `id='sso-7'` 對到 `{id:'perm-42',srcKey:'sso-7',from:'hr',isActive:'y',isAdmin:'y'}` → 登入回 `perm-42`，資料通道與四個 update 以 `perm-42` 執行；同步路由卻把 `sso-7` 傳給 `procOrm`，稽核記成另一套 id → 使用者用途及使用者 token 應採已驗證的 perm 主鍵；AS 才採其外部 id。email／name 對應同樣會發生。 | 高 | 是 |
| F03 | 「在 users 表」於共同驗證和 `requireAdmin` 採不同定義，造成同一身分部分入口放行、部分拒絕。 | `server/WWebPerm.mjs:458`、`:588`、`:607`、`:740`、`:741` | `mappingBy='email'`；AS 為 `{id:'app:k',email:'',name:'k',isApp:'y',isAdmin:'y'}`，users 另有 `{id:'app:k',email:'u@x',isActive:'y',isAdmin:'n'}` → `countPermRows=0`，登入、連線閘、執行身分、應用路由皆放行；四個 update 按 id 找到非系統管理者列，回 `userNotAdmin` → 應在共同驗證階段處理 id 衝突，統一拒絕並維持 users 列權威，不能直到部分寫入入口才採另一種身分判準。 | 高 | 是 |

**③ 實作與規定之符合**

| 編號 | 一句話 | file:line | 具體場景：輸入 → 實際輸出 → 應有輸出 | 嚴重度 | 是否改變不得改變之行為 |
|---|---|---|---|---|---|
| F04 | 無可用對應鍵被當成「已確認不在表」，使失效的 AU 輸入升為 AS。 | `server/keyCheck.mjs:345`；`server/WWebPerm.mjs:458`、`:588`、`:607` | `mappingBy='email'`；users 存在停用系統管理者 `id='u'`；其 AU 反查為 `{id:'u',email:0,name:'U',isApp:'y',isAdmin:'y'}` → helper 未查庫直接回 0，跳過 `checkUser`，登入／讀取／同步皆可取得系統管理者服務；拿掉 `isApp` 則回 `cannotGetUserEmail` → AU 應以固定鍵拒絕，不能因對應欄位失效改類。這比 ADR 所列「綁定者不在表」更廣；較佳處置是轉傳明確用途，區分「使用者對應鍵無效」與「AS 可省 email/name」，避免以查找失敗推導用途。 | 高 | 是 |
| F05 | 外部反查物件直到非同步查庫後仍使用原引用，檢查與使用之間可換身分。 | `server/WWebPerm.mjs:452`、`:469`、`:588`、`:616` | `getUserByToken` 回傳並保留物件 `u`，初值為合法 `app:k`；`countPermRows` 已用 `app:k` 查詢、尚未完成時，部署端將 `u.id` 改成一般使用者 id → 查詢仍回 0，但 `verifySystemApp` 回傳新 id 並固定 `isAdmin:'y'`；應用路由也可用新 id 同步寫入 → 應在外部反查邊界取得穩定的純量身分快照，後續查找、判角色、回呼與執行皆用該快照。 | 高 | 是 |
| F06 | 永久的 AS id 登錄會把後來的使用者身分誤當成服務憑據。 | `server/WWebPerm.mjs:466`、`:741`、`:1275` | ① AS id `x` 曾執行 RPC，登錄於集合；② 後來 users 建立 id `x` 的系統管理者，使用者 token 通過執行身分驗證；③ 該列在 `requireAdmin` 前被另一請求刪除 → fresh read 得 null，但集合仍含 `x`，寫入放行 → 此次使用者 token 應回 `userNotAdmin`、零寫入。集合只增不減，無法證明「這一次」是 AS；應採本次執行的身分類型憑據。 | 高 | 是 |
| F07 | 同步路由仍在驗身分之前，把包含 `keyTable` 的整包 query 交入記錄流程。 | `server/WWebPerm.mjs:1105`；`test/unit-appToken.test.mjs:195` | `POST /syncAndReplaceTabs?keyTable=users&token=` → 回 `tokenNoPermission` 前已執行 `maskQuery(get(req,'query'))` 並傳給 `console.log` → 驗證前應只處理 token 與固定診斷鍵，不應先讀取整包參數。`AT-S4` 只找字面 `keyTable`，看不見此間接讀取；遮罩後究竟印出哪些欄位，無法由未附的 `maskLog.mjs` 確認。 | 中 | 否 |
| F08 | `routeResult` 的診斷字串化可以再次拋錯，跳出固定錯誤鍵收斂。 | `server/routeResult.mjs:24`、`:27`、`:30` | 拒絕值為 `Object.create(null)`，或 `{toString:0}` → `String(raw)` 拋 `TypeError`，到不了 `r.msg=key`；而 `routeResult` 位於 `pm2resolve` 外 → 應仍回 `{state:'error',msg:'anUnexpectedErrorOccurred'}`，診斷轉換失敗不得取代既定回應。 | 中 | 否 |

其餘核對結果：

| 規定／檢查點 | 結果 |
|---|---|
| P-1、P-2 基本路徑 | 正常且穩定的輸入已要求 perm 系統管理者或 AS，部署方驗證仍套用；例外為 F02～F06。 |
| 停用列與登入查找 | 有效對應鍵下，`countLoginRows` 保留停用列，正常 AU 不會因登入查無而直接變 AS；ORM 讀取失敗也沒有吞成 0。 |
| 外部反查次數 | 每次認證流程一次；一般 RPC 的標頭與本體分別認證，各一次。後者符合兩個身分來源的契約。 |
| 回呼改寫收到的物件 | 直接改寫 `verifyClientUser`／`verifyAppUser` 所收的純量欄位，已有副本隔離；原始反查引用仍有 F05。 |
| 拒絕鍵次序 | 現碼為 `userNoPermission` 先於 `userNotAdmin`；測試缺口見 F09。 |
| P-3 | **無發現。** 單一 ASCII 空白與大小寫規則符合要求；`\S+` 接受示例的大括號及非空白 token 字元。沒有 `m` 的 `$` 要求輸入結尾，不存在尾端換行放行問題。[ECMAScript 定義](https://tc39.es/ecma262/2025/multipage/text-processing.html#sec-compileassertion) 未見巢狀重複造成的指數回溯。 |
| P-5 | core 的身分驗證已先於 `keyTable` 白名單與 payload 檢查；未驗證者的回應及所見 srLog 路徑不依表名分流。另有 F07 的提早 query 記錄流程。 |
| P-7 | **無發現。** `srv.mjs:132`、`:157` 未以角色否決；非角色否決仍走 `userNoPermission`。 |
| 路由失敗訊息 | 四條路由皆經 `routeResult`；所見明文固定拒絕鍵均有語系定義。一般 Error／TypeError、字串、數字、null、undefined 的收斂無另發現；特殊物件有 F08。 |
| 同批重複 id、本人樹、`srcKey` 與多人寫入 | 除上述身分／稽核問題外，**無額外發現**。重複 id 拒收、`/api/getPerm` 採驗證所得本人列、匯入配對、基準與共用表鎖路徑仍保留。 |

**④ 測試是否真的守住規定**

以下按斷言群對應；夾具建立、還原及迴圈計數斷言屬測試設施驗證。

| 測試／斷言群 | 對應規定及實際守護範圍 |
|---|---|
| `MX-H1` | 靜態檔公開；驗 HTTP 200。 |
| `MX-H2` | 後台系統管理者界線、P-2、固定拒絕鍵、拒絕時無資料；成功身分只驗 id、isAdmin。 |
| `MX-H3` | 一般使用者可查本人樹、AU 等同綁定者、AS 無本人樹。AU 與 peter 的 rules 比較確實有驗預期值。 |
| `MX-H4` | P-1：一般使用者、綁一般使用者、未轉傳 isApp 等拒絕；成功查指定對象。 |
| `MX-H5` | P-1、P-2：同步放行／拒絕、零寫入及建立者；但 fixtures 內外部 id 相同，守不到 F02。 |
| `MX-C`、`MX-D` | P-2：各入口的角色界線、標頭／本體拒絕及四個 update 的稽核值；受 F01 的組合限制。 |
| `MX-P1`、`MX-P2` | perm 角色／啟用狀態為權威，AU 隨之升降；有實際狀態切換與結果斷言。 |
| `MX-P3`、`MX-P4` | 部署方否決及 P-7 固定鍵；角色都為系統管理者，守不到兩種拒絕原因同時成立的次序。 |
| `MX-P5` | 驗證回呼改寫收到的物件不影響身分與稽核；未涵蓋原始反查引用在等待期間改變。 |
| `MX-P6` | AS 建立者／更新者及同批重複 id 拒收；重複 id 案只用 grups。 |
| `MX-B1`、`MX-B2` | P-3 的方案、大小寫、單一空白與缺憑證。 |
| `MX-Q1` | P-5 的回應一致及 srLog 未記特定未知表名；不觀察 stdout。 |
| `AT-001a/b/c` | AS 形狀、嚴格值、缺欄及自有屬性。`AT-001b:59` 每格都有 `A.equal(r,expect)`，2,028 格並未空過。 |
| `AT-002a/b/c/d` | 三種對應、停用列、無效鍵與讀取失敗；`:121` 測到「無效鍵回 0」，卻未驗其被授權呼叫端誤解的後果。 |
| `AT-S1`、`AT-S2` | P-2／P-1 的呼叫站點、共用反查與副本；屬來源字串檢查，未證明整個資料流的身分一致。 |
| `AT-S3`、`AT-S4` | P-3 正規式存在、P-5 字面讀取順序；後者漏間接 query 讀取。 |
| `AT-S5`、`AT-S6` | requireAdmin 與四條 routeResult 的站點；未驗歷史登錄重用、刪列競態或實際 I/O 故障路由。 |
| `AT-S7`、`AT-S8` | P-7 範例與判準集中位置；不是額外的授權行為驗證。 |
| `RR-001～004` | 一般拒絕值、固定鍵、原文紀錄及長度；未涵蓋無法字串化的物件。 |
| `RR-005` | 實際只驗 fallback 鍵的兩語文字，沒有呼叫 `routeResult` 驗證新增鍵。 |

改寫的 `api-adminOnly`、`api-callerIdentity`、`api-verifyConn-auth`、`api-tokenSafety` 確有守住一般使用者拒絕、獨立本體驗證、稽核身分及上游秘密不外洩。`CI-G7` 另補普通系統管理者的 email 對應，但沒有補上新 AS／AU 分流的上述交叉案例。

| 編號 | 一句話 | file:line | 具體場景：輸入 → 實際輸出 → 應有輸出 | 嚴重度 | 是否改變不得改變之行為 |
|---|---|---|---|---|---|
| F09 | 沒有同時觸發「部署方否決＋非系統管理者」，拒絕鍵次序可以退化而不被攔截。 | `test/unit-appToken.test.mjs:169`；`test/unit-adminOnlySite.test.mjs:128`；`test/api-callerMatrix.test.mjs:379`、`:395` | 將產品的角色拒絕移至部署方否決之前 → 現有拒絕夾具角色皆為 y，測試仍可全綠；靜態斷言也只要求角色檢查在回呼呼叫之後 → 應加入有效、非系統管理者且回呼 false／throw 的使用者，固定驗 `userNoPermission` 優先。 | 中 | 否 |
| F10 | AS 部署方否決測試未驗必要的拒絕紀錄。 | `test/api-callerMatrix.test.mjs:377`；`server/WWebPerm.mjs:480` | 刪除 `verifySystemApp` 的 `srLog.error` → AS 後台登入仍回 `userNoPermission`，但已知鍵不會由 `routeResult` 補記；`MX-P3` 的鍵與零寫入斷言照常通過 → 應驗該次拒絕有對應 event、msg、from，且不含 token／使用者資料。 | 中 | 否 |

可由靜態推導存活的具體變異如下；未執行變異測試，因此不宣稱其他未提供測試也會通過。

| 對應發現 | 產品變異 | 退化的具體輸出 | 預期應攔截的測試名 |
|---|---|---|---|
| F01 | 刪除 `server/WWebPerm.mjs:424` 的 `cannotGetUserName` reject。 | 有效系統管理者 id／email、缺 name 的外部結果由拒絕變登入成功；現有固定 token 都有 name。 | `MX-H2`、`AT-S1`，需補缺 name 入口案例。 |
| F01 | 刪除 `server/WWebPerm.mjs:470` 的正規化 name 欄位。 | 合法 AS 原有 `name:'key-sys'`，登入結果卻缺 name；目前成功斷言只驗 id、isAdmin。 | `MX-H2`，應核對完整服務身分。 |
| F09 | 互換 `server/WWebPerm.mjs:561` 與 `:568` 的拒絕分支；應用路由 `:625`、`:632` 同理。 | 同時遭部署方否決與角色拒絕時，錯回 `userNotAdmin`。 | `AT-S2`、`AOS-S5`、`MX-P3/P4`，需補雙原因同時成立案例。 |
| F10 | 刪除 `server/WWebPerm.mjs:480`。 | AS 後台登入被部署方否決卻沒有該次拒絕紀錄。 | `MX-P3`。 |