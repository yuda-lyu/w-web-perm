# 變異驗證(perm-run01 第三輪)

做法: `run-evidence.mjs` 於單一測試鎖內循序對 `server/WWebPerm.mjs`／`server/keyCheck.mjs`／`server/routeResult.mjs`／`srv.mjs` 各套一個最小文字變異(錨點須恰命中 1 次), 跑 `api-callerMatrix`＋`unit-appToken`＋`unit-routeResult`(`--bail`, 取第一個失敗案), 還原後再套下一個; 結束以 `cmp`／`git diff --stat` 驗證工作樹與開始時一致。

結果: **24／24 被抓到**。

| 變異 | 內容 | 檔 | 結果 | 第一個失敗案 |
|---|---|---|---|---|
| M1a | P-1 拿掉等級檢查(!isLevel 永不成立) | `server/WWebPerm.mjs` | 被抓到 | MX-H4 GET /api/getPermUserInfor(查他人權限樹): 管理員等級(A／AUA／AS／APP)通過; 其餘拒  [P-1: 套件自行要求管理員等級] |
| M1b | P-1 在表者不判 isAdminRow(isLevel 恆真) | `server/WWebPerm.mjs` | 被抓到 | MX-H4 GET /api/getPermUserInfor(查他人權限樹): 管理員等級(A／AUA／AS／APP)通過; 其餘拒  [P-1: 套件自行要求管理員等級] |
| M1c | P-1 不在表者不判 isSystemAppUser(isLevel 恆真) | `server/WWebPerm.mjs` | 被抓到 | MX-H4 GET /api/getPermUserInfor(查他人權限樹): 管理員等級(A／AUA／AS／APP)通過; 其餘拒  [P-1: 套件自行要求管理員等級] |
| M2a | P-2 拿掉系統服務用途放行 | `server/WWebPerm.mjs` | 被抓到 | MX-H2 GET /api/getUserByToken(後台登入檢查): 管理員等級(A／AUA／AS／APP)通過並回該身分; 其餘一律拒、固定語系鍵、不回資料  [P-2: AS 放行] |
| M2b | P-2 系統服務用途不要求「不在表」 | `server/WWebPerm.mjs` | 被抓到 | MX-H2 GET /api/getUserByToken(後台登入檢查): 管理員等級(A／AUA／AS／APP)通過並回該身分; 其餘一律拒、固定語系鍵、不回資料  [P-2: AS 放行] |
| M2c | P-2 countLoginRows 只計有效列(停用者視同不在表)(補跑(錨點更新或新增測試後)) | `server/keyCheck.mjs` | 被抓到 | AT-002a mappingBy=id: 後台列對 id、外部列對 srcKey、舊外部列對 id; 停用之列也算在表中 |
| M2d | P-2 requireAdmin 不認系統服務用途登錄 | `server/WWebPerm.mjs` | 被抓到 | MX-D updateUsers: 管理員等級(A／AUA／AS／APP)成功, 其餘於連線閘 permission denied、於執行身分回固定語系鍵; 零寫入  [P-2] |
| M2e | P-2 getUserIdByToken 不登錄系統服務用途 id | `server/WWebPerm.mjs` | 被抓到 | MX-D updateUsers: 管理員等級(A／AUA／AS／APP)成功, 其餘於連線閘 permission denied、於執行身分回固定語系鍵; 零寫入  [P-2] |
| M10 | F03 「在表」不含外部 id 等於表中某列主鍵 | `server/WWebPerm.mjs` | 被抓到 | MX-M2 [email] 外部 id 與 perm 主鍵衝突之服務身分(users 另有 id 同為 app:key-sys 之一般使用者列): 各入口一致被拒, 零寫入  [外審 sol F03] |
| M11 | F05 getExtUser 不回淺層快照 | `server/WWebPerm.mjs` | 被抓到 | AT-S1 P-2: getAndVerifyAdminUser 只在 isSystemAppUser 且不在 perm 表時走系統服務用途, 外部反查結果共用 |
| M12 | F06 系統服務用途 id 登錄無 TTL(永久) | `server/WWebPerm.mjs` | 被抓到 | AT-S5 requireAdmin: 在表者(不論 isActive)以列為準, 不在表者須為已登錄之系統服務用途 id; 只對 verifySystemApp 產生之物件登錄 |
| M13 | F02 應用路由稽核 id 取外部 id 而非 perm 主鍵 | `server/WWebPerm.mjs` | 被抓到 | MX-M3 外部 id(sso-admin-9)與 perm 主鍵(id-for-admin)不同之管理員: 資料通道與應用路由之稽核欄皆記 perm 內 id; 後台登入檢查回 perm 列  [外審 sol F02] |
| M14 | F08 routeResult 診斷字串化拋錯不攔截 | `server/routeResult.mjs` | 被抓到 | RR-006 診斷字串化本身拋錯(null 原型物件、toString 非函數、會拋錯之 toString)時仍回固定鍵, srLog 記 [unprintable]  [外審 sol F08] |
| M2f | P-2 系統服務用途不套用部署方 verifyAppUser | `server/WWebPerm.mjs` | 被抓到 | MX-P3 AS 被部署方 verifyAppUser 因非角色因素否決: 後台登入、應用路由、資料通道(標頭 permission denied／本體 userNoPermission)皆拒且零寫入  [部署方可再收緊] |
| M3a | P-3 還原舊作法(固定截前 7 字元) | `server/WWebPerm.mjs` | 被抓到 | MX-B1 Bearer 方案(大小寫不敏感、單一空白)通過; Basic／Token／無方案／多空白／Tab／缺憑證／無標頭 → 視同無 token(permission denied) |
| M3b | P-3 Bearer 正規式改為大小寫敏感 | `server/WWebPerm.mjs` | 被抓到 | MX-B1 Bearer 方案(大小寫不敏感、單一空白)通過; Basic／Token／無方案／多空白／Tab／缺憑證／無標頭 → 視同無 token(permission denied) |
| M3c | P-3 Bearer 正規式容許多個空白 | `server/WWebPerm.mjs` | 被抓到 | MX-B1 Bearer 方案(大小寫不敏感、單一空白)通過; Basic／Token／無方案／多空白／Tab／缺憑證／無標頭 → 視同無 token(permission denied) |
| M3d | P-3 Bearer 正規式去掉結尾錨(後接多餘字元仍通過) | `server/WWebPerm.mjs` | 被抓到 | MX-B1 Bearer 方案(大小寫不敏感、單一空白)通過; Basic／Token／無方案／多空白／Tab／缺憑證／無標頭 → 視同無 token(permission denied) |
| M5 | P-5 在身分驗證前先驗 keyTable | `server/WWebPerm.mjs` | 被抓到 | MX-P3 AS 被部署方 verifyAppUser 因非角色因素否決: 後台登入、應用路由、資料通道(標頭 permission denied／本體 userNoPermission)皆拒且零寫入  [部署方可再收緊] |
| M6 | sol#5 /api/getPerm 路由改回取 Error.message 原樣 | `server/WWebPerm.mjs` | 被抓到 | AT-S6 R-ROUTE-MSG-01: 四條 hapi 路由皆經 routeResult, 不得再取 Error.message 原樣回傳 |
| M7 | sol#5 routeResult 不收斂(key = raw) | `server/routeResult.mjs` | 被抓到 | RR-002 ORM／I/O 原文(Error 或字串)一律改回 anUnexpectedErrorOccurred, 原文只入 srLog  [修前: r.msg = r.msg.message 回原文] |
| M8 | 檢查之值即使用之值: getAndVerifyAppUser 把原物件交部署方並回傳原物件(補跑(錨點更新或新增測試後)) | `server/WWebPerm.mjs` | 被抓到 | MX-P5 檢查之值即使用之值: verifyAppUser 改寫其收到之 user 物件(id→id-for-peter、isAdmin→n)後放行, 稽核欄與回傳身分仍為交給部署方之前取得者(app:key-mutate) |
| M9 | P-7 範例 verifyClientUser 還原以 isAdmin 否決 | `srv.mjs` | 被抓到 | MX-H2 GET /api/getUserByToken(後台登入檢查): 管理員等級(A／AUA／AS／APP)通過並回該身分; 其餘一律拒、固定語系鍵、不回資料  [P-2: AS 放行] |
| M15 | P-2 countLoginRows(email／name 路徑)只計有效列(停用者視同不在表)(補跑(錨點更新或新增測試後)) | `server/keyCheck.mjs` | 被抓到 | MX-M4 使用者用途綁定之使用者在 perm 表但停用、外部 id(sso-appdis-9)與 perm 主鍵不同(只能靠對應鍵 email 找到該列): 不得因「停用視同查無」落入系統服務用途; 啟用後以該列為準  [P-2 核心:  |

備註: M2c(`countLoginRows` id 路徑只計有效列)在 API 層被 id 等於列主鍵之「在表」判定(外審 sol F03 修正)遮蔽——該路徑下停用之使用者用途 token 仍因外部 id 等於列主鍵而視為在表; 故只由單元測試 `AT-002a` 抓到。其 email／name 路徑之同型變異 M15 由 API 層 `MX-M4` 抓到(外部 id 與 perm 主鍵不同、只能靠 email 找到停用之列)。
