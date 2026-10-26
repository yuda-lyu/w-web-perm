# 修前紅證據(perm-run01 第三輪, 任務 20261024182735)

做法: 以 `git show HEAD:server/WWebPerm.mjs` 取代工作樹之 `server/WWebPerm.mjs`(其餘新檔、`srv.mjs` 之新測試權杖、新測試檔皆保留), 於單一測試鎖內跑 `test/api-callerMatrix.test.mjs`、`test/unit-appToken.test.mjs`、`test/unit-routeResult.test.mjs`, 跑完立即還原並以 `cmp` 與備份比對(腳本 `run-evidence.mjs` 之 `old` 模式; 測試鎖內循序, 啟動前確認 11006 已釋放)。

結果: **43 敗／18 過**(16 秒)。

過的 18 案為「修前後行為相同」或「與被修函數無關」者: `MX-H1`(靜態檔公開)、`MX-H3`(`/api/getPerm` 不變)、`MX-P4`(部署方否決鍵不變)、`unit-routeResult` RR-001～006(新模組, 與舊 `WWebPerm.mjs` 無關)、`unit-appToken` AT-001a～c／AT-002a～d(新純函數)、AT-S7／AT-S8(範例與判準位置)。

註: Bearer 一案(`MX-B1`／`MX-B2`)之修前紅關鍵是 `Digest sys`——方案名 6 字元加空白恰 7 字元, 修前「截前 7 字元」得 `sys` 而通過; `Basic sys`／`Token sys` 因方案名僅 5 字元, 截完剩 `ys` 恰好被拒(巧合, 不是檢查), 故 `MX-B2` 專門加入 `Digest sys` 才有修前紅。

失敗案(修前紅, 逐案):

- MX-H2 GET /api/getUserByToken(後台登入檢查): 系統管理者等級(A／AUA／AS／APP)通過並回該身分; 其餘一律拒、固定語系鍵、不回資料  [P-2: AS 放行]
- MX-H4 GET /api/getPermUserInfor(查他人權限樹): 系統管理者等級(A／AUA／AS／APP)通過; 其餘拒  [P-1: 套件自行要求系統管理者等級]
- MX-H5 POST /syncAndReplaceTabs(整表覆寫): 系統管理者等級通過並寫入(稽核欄 userId 記呼叫者 id); 其餘拒且零寫入  [P-1; P-2 稽核欄記 app:…]
- MX-C /api/ulctr(upload-controller): 非系統管理者等級之回應 ≡ 無效 token 之回應(permission denied); 系統管理者等級已過閘
- MX-C /api/slc(upload-slice): 非系統管理者等級之回應 ≡ 無效 token 之回應(permission denied); 系統管理者等級已過閘
- MX-C /api/dwgfn(download-get-filename): 非系統管理者等級之回應 ≡ 無效 token 之回應(permission denied); 系統管理者等級已過閘
- MX-C /api/dwgf(download-get-file): 非系統管理者等級之回應 ≡ 無效 token 之回應(permission denied); 系統管理者等級已過閘
- MX-C /api/dw(download): 非系統管理者等級之回應 ≡ 無效 token 之回應(permission denied); 系統管理者等級已過閘
- MX-D getWebInfor: 系統管理者等級(A／AUA／AS／APP)成功, 其餘於連線閘 permission denied、於執行身分回固定語系鍵; 零寫入  [P-2]
- MX-D getStaEventTable: 系統管理者等級(A／AUA／AS／APP)成功, 其餘於連線閘 permission denied、於執行身分回固定語系鍵; 零寫入  [P-2]
- MX-D getStaEvent: 系統管理者等級(A／AUA／AS／APP)成功, 其餘於連線閘 permission denied、於執行身分回固定語系鍵; 零寫入  [P-2]
- MX-D users.select: 系統管理者等級(A／AUA／AS／APP)成功, 其餘於連線閘 permission denied、於執行身分回固定語系鍵; 零寫入  [P-2]
- MX-D grups.select: 系統管理者等級(A／AUA／AS／APP)成功, 其餘於連線閘 permission denied、於執行身分回固定語系鍵; 零寫入  [P-2]
- MX-D pemis.select: 系統管理者等級(A／AUA／AS／APP)成功, 其餘於連線閘 permission denied、於執行身分回固定語系鍵; 零寫入  [P-2]
- MX-D targets.select: 系統管理者等級(A／AUA／AS／APP)成功, 其餘於連線閘 permission denied、於執行身分回固定語系鍵; 零寫入  [P-2]
- MX-D [sys:getFuncList]: 系統管理者等級(A／AUA／AS／APP)成功, 其餘於連線閘 permission denied、於執行身分回固定語系鍵; 零寫入  [P-2]
- MX-D [sys:getTableTags]: 系統管理者等級(A／AUA／AS／APP)成功, 其餘於連線閘 permission denied、於執行身分回固定語系鍵; 零寫入  [P-2]
- MX-D [sys:polling]: 系統管理者等級(A／AUA／AS／APP)成功, 其餘於連線閘 permission denied、於執行身分回固定語系鍵; 零寫入  [P-2]
- MX-D updateUsers: 系統管理者等級(A／AUA／AS／APP)成功, 其餘於連線閘 permission denied、於執行身分回固定語系鍵; 零寫入  [P-2]
- MX-D updateGrups: 系統管理者等級(A／AUA／AS／APP)成功, 其餘於連線閘 permission denied、於執行身分回固定語系鍵; 零寫入  [P-2]
- MX-D updatePemis: 系統管理者等級(A／AUA／AS／APP)成功, 其餘於連線閘 permission denied、於執行身分回固定語系鍵; 零寫入  [P-2]
- MX-D updateTargets: 系統管理者等級(A／AUA／AS／APP)成功, 其餘於連線閘 permission denied、於執行身分回固定語系鍵; 零寫入  [P-2]
- MX-P1 AU 綁系統管理者: 該系統管理者被降為一般使用者 → AU 同步失去系統管理者服務(資料通道、後台登入、應用路由皆拒); 升回後恢復  [AU＝同綁定者, perm 列為權威]
- MX-P2 AU 綁停用之使用者: 不因「停用視同查無」落入系統服務用途; 該使用者啟用且為系統管理者後可用, 停用後又拒  [AU 在表者以 perm 列為準]
- MX-P3 AS 被部署方 verifyAppUser 因非角色因素否決: 後台登入、應用路由、資料通道(標頭 permission denied／本體 userNoPermission)皆拒且零寫入  [部署方可再收緊]
- MX-P7 標頭與本體為不同身分之組合(資料通道兩個身分來源各自完整驗證, 函數以本體身分執行): 服務身分／系統管理者交叉  [外審 sol F01]
- MX-P5 檢查之值即使用之值: verifyAppUser 改寫其收到之 user 物件(id→id-for-peter、isAdmin→n)後放行, 稽核欄與回傳身分仍為交給部署方之前取得者(app:key-mutate)
- MX-P6 AS 新增資料: 新列建立者與更新者皆為 app:…, 且可被系統管理者讀回; AS 之寫入與系統管理者同一契約(同批重複 id 仍整批拒收)
- MX-M1 [email] 十類呼叫者 × 後台登入檢查／應用路由查他人樹／資料通道(標頭、本體): 系統管理者等級才通過, 與預設對應鍵(id)相同
- MX-M2 [email] 外部 id 與 perm 主鍵衝突之服務身分(users 另有 id 同為 app:key-sys 之一般使用者列): 各入口一致被拒, 零寫入  [外審 sol F03]
- MX-M1 [name] 十類呼叫者 × 後台登入檢查／應用路由查他人樹／資料通道(標頭、本體): 系統管理者等級才通過, 與預設對應鍵(id)相同
- MX-M2 [name] 外部 id 與 perm 主鍵衝突之服務身分(users 另有 id 同為 app:key-sys 之一般使用者列): 各入口一致被拒, 零寫入  [外審 sol F03]
- MX-M3 外部 id(sso-admin-9)與 perm 主鍵(id-for-admin)不同之系統管理者: 資料通道與應用路由之稽核欄皆記 perm 內 id; 後台登入檢查回 perm 列  [外審 sol F02]
- MX-M4 使用者用途綁定之使用者在 perm 表但停用、外部 id(sso-appdis-9)與 perm 主鍵不同(只能靠對應鍵 email 找到該列): 不得因「停用視同查無」落入系統服務用途; 啟用後以該列為準  [P-2 核心: 在表含停用]
- MX-B1 Bearer 方案(大小寫不敏感、單一空白)通過; Basic／Token／無方案／多空白／Tab／缺憑證／無標頭 → 視同無 token(permission denied)
- MX-B2 通訊路由同一規則: Basic 方案帶系統管理者 token 亦視同無 token(回應 ≡ 無效 token)
- MX-Q1 未通過身分驗證者(無 token、無效 token、U、AUM、NF、ASN、AUD)之回應與 srLog 皆與 keyTable 無關(有效表名／未知表名／空／未帶皆同一回應); 系統管理者等級才見 invalidKeyTable
- AT-S1 P-2: getAndVerifyAdminUser 只在 isSystemAppUser 且不在 perm 表時走系統服務用途, 外部反查結果共用
- AT-S2 P-1: getAndVerifyAppUser 在表者以 perm 列、不在表者以 isSystemAppUser; 先部署方後等級; 回傳為交給部署方之前取得者
- AT-S3 P-3: verifyConn 以 reBearerAuth 取 token, 不得以固定長度截斷
- AT-S4 P-5: /syncAndReplaceTabs 先驗身分後讀 keyTable
- AT-S5 requireAdmin: 在表者(不論 isActive)以列為準, 不在表者須為已登錄之系統服務用途 id; 只對 verifySystemApp 產生之物件登錄
- AT-S6 R-ROUTE-MSG-01: 四條 hapi 路由皆經 routeResult, 不得再取 Error.message 原樣回傳
