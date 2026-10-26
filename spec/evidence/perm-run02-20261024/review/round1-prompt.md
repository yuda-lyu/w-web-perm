# 功能正確性審查(唯讀): w-web-perm perm-run02 兩項身分等級判定之調整

你是獨立審查者。目前工作目錄是 w-web-perm 的**快照副本**(僅含審查相關檔案; 無 node_modules, 不能跑測試)。請你**自行讀檔**審查, 不要依賴我的敘述。

限制: 不得修改、建立或刪除任何檔案, 不得執行測試或啟動服務。可使用唯讀查檔指令(rg 等)。讀含中文的檔案請用 `rg -n '^' -- <檔>`(需要限範圍時用 rg 自己的 -m/-A/-B/-C, 不要接 PowerShell 管線, 否則中文會失真)。

## 先做探測(回覆的第一段)

原文引用以下兩處, 逐字, 各一行:
1. `server/adminCheck.mjs` 中以 `const SYSTEM_APP_ID_PREFIX` 開頭的那一行;
2. `spec/流程_應用啟動與登入.md` 中含 `perm-run02②` 的那一行之前 20 個字。
引用不出表示讀檔失敗, 請直接回報讀檔失敗並結束。

## 背景(只供定位, 請以程式碼為準)

這是權限管理後端 `server/WWebPerm.mjs`。呼叫者由部署方函數 `getUserByToken(token)` 反查出一個外部使用者物件 `{ id, name, email, isAdmin, isApp }`(`isApp` 為選用: 'y' / 'n', 未給視同 'n'), 套件再依 perm 自己的 `users` 表(權威)決定等級。名詞:
- 在表 = 該外部身分在 perm `users` 表對得到列(不論 isActive; 見 `countPermRows`, 含「外部 id 等於某列主鍵」);
- 使用者用途 = 應用系統 token 綁定某使用者, 反查回該使用者實際資料(id 為該使用者主鍵)且 `isApp='y'`;
- 系統服務用途 = 應用系統本身(不綁使用者), 上游保證 id 恆為 `app:<金鑰主鍵>`, 且上游拒收以 `app:` 開頭的使用者主鍵。

本輪(perm-run02)要求的兩項調整:
**① 應用系統路由**(`/api/getPermUserInfor`、`/syncAndReplaceTabs`, 函數 `getAndVerifyAppUser`)的等級判定改為相容: 呼叫者在表者以 perm 列為準(有效且 isAdmin='y', 同現行); **不在表者只看反查之 `isAdmin==='y'`, 不要求 `isApp`**(也不要求 id 前綴)。理由: 舊版 sso 的應用系統身分就是 isAdmin='y', 未轉傳 `isApp` 的既有部署升版後不應中斷; 一般使用者(isAdmin='n')仍被拒。部署方 `verifyAppUser` 照舊, 拒絕鍵次序不變(先 userNoPermission 後 userNotAdmin)。
**② 系統服務用途之認定收緊**: 用於後台登入檢查、資料通道(連線閘與執行身分)與 `requireAdmin` 的「系統服務用途」須同時: 不在表、反查 `isApp==='y'`、`isAdmin==='y'`、**`id` 以 `app:` 開頭**。使用者用途綁定「不在表之 sso 系統管理者」者不再被當成系統服務用途(其自身使用者 token 同樣進不了後台, 二者一致)。判準以單一擁有者實作(`server/adminCheck.mjs`)。

不得改變: perm-run01 其餘行為(Bearer 檢查、先驗身分再驗參數、稽核欄記 perm 列主鍵、路由失敗只回語系鍵)、1.1.15 行為(後台與資料通道只限系統管理者等)。

變更全貌見 `diff.patch`(相對上一檢查點; 另有 `diff-stat.txt`)。主要檔: `server/adminCheck.mjs`(`isSystemAppUser` 加前綴條件、新增 `isExtAdminUser`)、`server/WWebPerm.mjs`(`getAndVerifyAppUser` 不在表分支改用 `isExtAdminUser`; 註解/JSDoc)、`srv.mjs`(新增三個測試權杖)、`test/api-callerMatrix.test.mjs`(矩陣)、`test/unit-appToken.test.mjs`、`README.md` Upgrade Notes、三份 spec。請同時閱讀未變更但相關的程式碼(`getAndVerifyAdminUser`、`getAndVerifyClientUser`、`getTokenUser`、`getExtUser`、`countPermRows`、`verifySystemApp`、`requireAdmin`、`getUserIdByToken`、`verifyConn`、兩條應用系統路由 handler, 均在 `server/WWebPerm.mjs`; `server/keyCheck.mjs:countLoginRows`)。

## 請依下列順序審查(最後才審方案)

**(一) 挑戰輸入空間表的完整性**: 呼叫者身分的軸至少有: 在表/不在表 × 列的 isActive × 列的 isAdmin × 反查的 isAdmin × 反查的 isApp(y/n/未給/其他值) × id 形狀(是否 `app:` 開頭、大小寫、空白、非字串、缺 id) × 外部 id 與某列主鍵相等與否 × mappingBy(id/email/name) × 部署方 verifyAppUser/verifyClientUser 結果 × 入口(後台登入檢查、資料通道標頭與本體兩個身分來源、四個寫入函數、兩條應用系統路由、/api/getPerm、通訊路由)。指出**缺的軸與缺的格**, 以及「格內現況不屬實」者, 附 `file:line` 與具體輸入→實際輸出。
**(二) 對稱性**: 同一個外部身分是否在不同入口被判成不同類(例如共同驗證階段與 `requireAdmin` 對「在表」的定義是否一致)? 使用者用途綁「不在表的 sso 系統管理者」與該系統管理者的自身使用者 token 在各入口的結果是否一致(應用系統路由兩者都放行; 後台與資料通道兩者都拒且拒絕鍵相同)? 系統服務用途的認定在 `getAndVerifyAdminUser`、`getAndVerifyAppUser`、`requireAdmin`、`getUserIdByToken` 之間是否一致、是否仍有第二處自行比對 `isApp`/`isAdmin`/`app:`?
**(三) 檢查之值即使用之值**: 判定等級所用的外部物件, 與其後交給部署方函數、寫入稽核欄、登錄 `kpSystemAppIds` 所用的是否同一份(淺層快照)? 部署方函數改寫其收到的物件是否影響判定?
**(四) 測試是否真能抓到**: 逐一思考下列變異是否會被 `test/api-callerMatrix.test.mjs` 或 `test/unit-appToken.test.mjs` 抓到, 抓不到者說明缺的斷言: ①應用系統路由不在表分支重新要求 `isApp`; ②`isSystemAppUser` 拿掉 `app:` 前綴條件; ③前綴比對改成 `includes('app:')`/不區分大小寫/先 trim; ④`isExtAdminUser` 改成恆真; ⑤不在表分支改成 `isSystemAppUser`; ⑥`requireAdmin` 對不在表者恆放行。另指出測試斷言是否有「現狀指紋」而非對應規則的句子。
**(五) 文件與程式碼是否一致**: `README.md`(Security 節與 Upgrade Notes 第 1 項)、`server/WWebPerm.mjs` 的 JSDoc、`spec/流程_*.md` 三份的新增/更正段落, 與程式碼行為逐句核對, 指出不一致或誇大之處。
**(六) 最後才審方案**: ① 的相容放行是否有未預期的權限擴張(例如以前被拒、現在放行的身分)? ② 的收緊是否有未預期的相容性損失(以前放行、現在被拒的身分; 注意 perm-run01 以前這些入口對「不在表」的身分一律拒絕)?

## 回報格式

最終回覆只放審查報告本文(它會被保存)。第一段為上面要求的兩處引用。其後每一條發現一個小節:
`F<編號> | 嚴重度(高/中/低; 高=會造成錯誤結果或權限判定錯誤, 中=契約缺陷/測試漏洞/邊界未處理, 低=文件/命名) | file:line | 情境(具體輸入) → 實際結果 vs 應有結果 | 建議`
只列你自行讀碼確認過的; 不確定者標「推測」並說明如何驗證。沒有發現就寫「無發現」。不要重述我已寫在背景裡的內容, 不要評價整體寫得好不好。
