`const SYSTEM_APP_ID_PREFIX = 'app:'`  
`- **設計事實（記錄備查）** 202`

F1 | 中 | test/api-callerMatrix.test.mjs:43、387、541、569 | 身分欄位固定耦合於少數夾具 → 缺少會進入不同驗證分支的交叉格，而非完整涵蓋所列身分軸 | 建議：補下列具體入口案例。

- **嚴格系統服務形狀 × 停用列**：外部 `{id:'app:k',name:'svc',email:'svc@x',isApp:'y',isAdmin:'y'}`，perm 有對應但停用之列，分別以主鍵、email、name 命中。現行會轉入 `getTokenUser`，回 `cannotGetUserFromPerm`；應斷言不會取得系統服務權限。現有 AUD 的 id 沒有 `app:`，在後台／資料通道根本不會進入系統服務候選分支；MX-M2 則只測有效的一般使用者列。
- **明確 `isApp='n'`／其他值 × 不在表系統管理者**：例如上述外部物件改為 `isApp:'Z'`、perm 無匹配列、部署方放行。現行兩條應用系統路由放行，後台與資料通道拒絕。API 矩陣只有 `'y'` 與未給；單元測試雖涵蓋其他值，沒有驗證其入口組合。
- **外部列來源與登入鍵**：`mappingBy='id'`，perm 列 `{id:'perm-u',srcKey:'sso-u',from:'teamA',isActive:'y',isAdmin:'y',…}`，外部 id 為 `sso-u`。現行放行且稽核欄記 `perm-u`；矩陣沒有這種呼叫者。`mappingBy='name'` 且外部 id 不等於 perm 主鍵的寫入稽核亦未覆蓋；MX-M3 只測 email。
- **不在表分支 × 部署方否決 × 等級不足**：外部 `{id:'u',name:'u',email:'u@x',isAdmin:'n'}`、`verifyAppUser=false`，現行應先回 `userNoPermission`。MX-P4 的雙重拒絕原因只測在表分支，沒有守住本輪修改分支的拒絕鍵次序。

F2 | 中 | server/WWebPerm.mjs:642、1067、1071、1158 | 不在表，反查回 `{id:5,name:'svc',email:'svc@x',isAdmin:'y'}`，部署方放行 → 查他人權限成功、同步回 `tokenNoPermission`，vs 共同拒絕不符合身分契約的呼叫者 | 建議：在等級與部署方驗證完成後，共同檢查呼叫者 id 為非空字串。

`isExtAdminUser` 不檢查 id 是刻意設計，但 `/api/getPermUserInfor` 後續只檢查使用者物件，沒有補查呼叫者 id；缺 id 時亦會放行。`/syncAndReplaceTabs` 則有補查。這使新分支相較上一檢查點，額外接受原本會被拒絕的非完整身分查詢他人權限，超出單純放寬 `isApp`／前綴的效果，也與 JSDoc `server/WWebPerm.mjs:63` 的必要欄位契約不一致。

`spec/流程_外部應用同步權限資料.md:9` 的「不要求 id 形狀」亦過廣；同步端點仍要求非空字串，應限定為「不要求 `app:` 前綴」。

F3 | 高 | server/WWebPerm.mjs:479、772、1305 | 系統服務 id 的近期登錄被後來的 perm 使用者請求沿用 → 刪列後仍可寫入，vs `userNotAdmin` 且零寫入 | 建議：讓系統服務憑據綁定本次執行身分，避免僅憑跨請求共用的 id／時間授權。

沿用程式存在以下競態，並非本輪新引入：

1. `mappingBy='email'`，系統服務 `app:k` 成功執行一次資料通道請求，登錄 `kpSystemAppIds`。
2. 60 秒內建立有效系統管理者列 `{id:'app:k',email:'u@x',…}`。本套件沒有禁止這種 perm 主鍵；MX-M2 本身也建立 `app:` 主鍵列。
3. 一般使用者 token 反查 `{id:'u',name:'u',email:'u@x',isAdmin:'y'}`，經該 perm 列完成本體身分驗證，取得執行 id `app:k`。
4. 該列在 `requireAdmin` 讀取前被另一請求刪除。

第 3 步沒有清除先前的系統服務登錄；第 4 步查無列後，`requireAdmin` 直接採用先前請求留下的近期登錄而放行。此 token 的外部 id 沒有前綴，也沒有 `isApp='y'`，卻在函數層被當成系統服務。TTL 僅限制發生時間，不能保證憑據屬於本次請求。`server/WWebPerm.mjs:767` 宣稱 perm 系統管理者刪列後不會因此退化成系統服務，於此輸入順序不成立。

可用受控 ORM 讀取時序重現，固定在身分解析完成後、`requireAdmin` 查列前刪列，斷言四個寫入函數均拒絕且零寫入。

F4 | 中 | test/unit-appToken.test.mjs:233、268；test/api-callerMatrix.test.mjs:332 | 變異⑥以提前回傳實作 → 現有斷言無法可靠抓到，vs 應直接驗證未登錄身分遭拒 | 建議：增加可執行的函數層授權測試，將原始碼字樣檢查限於必要的站點守護。

逐項核對斷言內容如下；未執行變異測試：

| 變異 | 現有斷言 |
|---|---|
| ① 不在表分支重新要求 `isApp` | MX-H4、MX-H5、MX-R1 的 NF／NFV 成功斷言可抓到。 |
| ② 拿掉前綴條件 | AT-001b，以及 MX-H2／MX-R3 的 APP／AUX 拒絕斷言可抓到。 |
| ③ 改成 includes／不分大小寫／先 trim | AT-001b 的 `xapp:k`、`App:k`／`APP:k`、` app:k` 分別可抓到；API 矩陣沒有這些近似形。 |
| ④ `isExtAdminUser` 恆真 | AT-003b／c、MX-R1 的 NFN／ASN 拒絕斷言可抓到。 |
| ⑤ 不在表改用 `isSystemAppUser` | MX-R1 的 NF／NFV 成功斷言及 AT-S2 可抓到。 |
| ⑥ `requireAdmin` 對不在表者恆放行 | 若直接改寫三元式，AT-S5 會失敗；但在查列後加入 `if (u === null) return true`、保留原三元式，AT-S5 仍符合。API 矩陣的未登錄身分均先被上游拒絕，不會揭露這個變異。 |

AT-S2 要求完整的 `let userUse = …` 字串，AT-S5 要求特定三元式，都是現狀指紋：等價重構會失敗，保留字串並提前繞過卻可能通過。缺少的行為斷言至少包括：查無列且未登錄、登錄已過期、查無列且本次確為系統服務，以及已有停用列時不能借用登錄。

F5 | 中 | test/api-callerMatrix.test.mjs:12、319、329；README.md:111 | `[sys:polling]` 使用有效系統管理者標頭、NFV／AUX 本體 token → 此格未送出、未斷言，vs 文件宣稱每個函數均驗證本體執行身分 | 建議：明列此入口例外，並補獨立的標頭／本體交叉驗證。

`onlyHeader:true` 明確跳過 `[sys:polling]` 的全部 13 個本體來源格；其自訂呼叫還將標頭與本體固定成同一 token。因此「資料通道每格另分兩個身分來源」不屬實，也不能支持 README 的無條件敘述。

**推測**：有效標頭搭配不合格本體可能仍被 polling 接受；測試註解承認當前框架沒有該檢查，但快照不含框架實作，無法確認執行結果。驗證方式是在完整環境讀取實際安裝版本的 polling 派送程式，再測上述不同 token 組合。

F6 | 低 | README.md:119；server/WWebPerm.mjs:147；srv.mjs:30；sgud/rule/rulebook_security.md:80、85、91 | AUX 或非前綴虛擬帳號 → 文件仍宣稱完全無服務／屬系統服務／等待收緊，vs 現行程式已採分入口判定 | 建議：同步更正仍保留的舊規則句。

具體不一致：

- README 說綁定使用者不在表就「gets nothing」；`sso-admin-77` 的 AUX 實際可用兩條應用系統路由。
- JSDoc 範例仍將應用路由等級概括成「有效 perm 系統管理者，或系統服務用途 token」，漏掉相容分支。
- `srv.mjs:30` 仍把 `id-for-application` 稱為系統服務用途；它實際只能通過應用系統路由，後台與資料通道遭拒。
- 規則帳本仍規定應用路由不在表者使用 `isSystemAppUser`、未轉傳 `isApp` 者拒絕，且把前綴條件列為待裁示；均與本輪程式及三份流程 spec 的更正互斥。

F7 | 低 | README.md:133、134、139 | 外部反查 `isAdmin='y'`，但匹配到有效且 `isAdmin='n'` 的 perm 列，部署方放行 → `userNotAdmin`，vs 升版說明宣稱只有外部 `isAdmin` 非 `'y'` 才會中斷 | 建議：將相容承諾限定於「不在表且外部 `isAdmin='y'`」者，並修正稽核解讀。

程式依 `server/WWebPerm.mjs:637`、639、663 正確拒絕此輸入，但 Upgrade Notes 的標題與「未修改 `getUserByToken` 的部署會繼續運作」承諾過廣。第 139 行又說每筆 `userNotAdmin` 都代表外部反查未宣稱 `'y'`，同樣被此案例反證；盤點時應同時檢查匹配到的 perm 列角色。