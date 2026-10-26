# 功能正確性審查(唯讀, 增量): w-web-perm perm-run02 採納第一輪意見後之修改

你是獨立審查者(上一輪你的同儕已審過第一版)。目前工作目錄是 w-web-perm 的**第二版快照副本**(僅含審查相關檔案; 無 node_modules, 不能跑測試)。請你**自行讀檔**審查。

限制: 不得修改、建立或刪除任何檔案, 不得執行測試或啟動服務。可使用唯讀查檔指令(rg 等)。讀含中文的檔案請用 `rg -n '^' -- <檔>`(需要限範圍時用 rg 自己的 -m/-A/-B/-C, 不要接 PowerShell 管線)。

## 先做探測(回覆的第一段)

原文引用以下兩處, 逐字, 各一行: ① `server/WWebPerm.mjs` 中以 `let clearSystemAppId` 開頭的那一行; ② `delta.patch` 的第一行。引用不出表示讀檔失敗, 請直接回報讀檔失敗並結束。

## 背景

本輪(perm-run02)要求: **① 應用系統路由**(`/api/getPermUserInfor`、`/syncAndReplaceTabs`; `server/WWebPerm.mjs:getAndVerifyAppUser`)對『不在 perm users 表』之呼叫者改為只看部署方 `getUserByToken` 反查之 `isAdmin==='y'`(不要求 `isApp`、不要求 id 前綴; `server/adminCheck.mjs:isExtAdminUser`), 在表者仍以 perm 列為準; **② 系統服務用途**(後台登入檢查、資料通道、`requireAdmin`)須同時: 不在表、`isApp==='y'`、`isAdmin==='y'`、`id` 以 `app:` 開頭(`isSystemAppUser`)。完整變更在 `diff.patch`(第一版快照時), 本次增量在 `delta.patch`(第一版快照 → 第二版快照之差異, 含程式、測試、文件)。

第一輪審查意見與我的處置(請你獨立驗證處置是否妥當, 不要照單接受):
- F1(測試缺格): 補了 MX-R5(嚴格系統服務形狀而 perm 有主鍵同為其 id 之停用列)、MX-R6(不在表且 isAdmin n 而被 verifyAppUser 否決 → 拒絕鍵次序)、MX-R7(外部列系統管理者 srcKey 登入, 稽核欄記 perm 內部 id)、MX-M5(email／name 對應鍵下之停用列)、呼叫者軸新增 isApp 明確 'n' 與 'Y'。
- F2(`/api/getPermUserInfor` 不檢查呼叫者 id, 缺 id 之不在表系統管理者宣稱者放行): **不改行為**(1.1.15 行為; `getUserByToken` 契約本就要求 id; 主控裁示『不在表只看 isAdmin』), 只更正文件過廣之敘述。請你評估此處置。
- F3(系統服務用途近期登錄被同 id 之 perm 列請求沿用): 採納最小修——`getUserIdByToken` 對以 perm 列通過者清除同 id 之登錄(`clearSystemAppId`), 並以確定性競態測試 MX-M6(srv.mjs 對 `app:key-ghost` 列的 `verifyClientUser` 等待 2 秒, 測試於等待中刪列)守護。請審這個修正有無引入新缺陷、有無遺漏之情境。
- F4(`requireAdmin` 提前放行之變異抓不到): 由 MX-M6 行為測試補抓; 站點字串守護保留。
- F5(`[sys:polling]` 本體來源未測): 屬框架(排程第 128 項), README 補註例外。
- F6／F7(文件與程式不一致、升版說明承諾過廣): 已更正 README／JSDoc／srv.mjs 註解。

## 請審查

(一) **F3 修正本身**: `clearSystemAppId` 的位置(`getUserIdByToken` 的 else 分支)、與 `markSystemAppId`／`isSystemAppIdRecent`／`requireAdmin` 的互動; 兩個同 id 請求交錯時是否可能誤清除合法登錄而使合法的系統服務用途請求被誤拒(以『系統服務用途請求 A 已登錄、perm 同 id 列存在與否』的各種時序列舉); 是否有『以 perm 列通過但 id 不是列的主鍵』之路徑使清除對象錯誤。
(二) **新測試是否真測到所宣稱之事**: MX-M6(時序假設: 600ms 刪列、verifyClientUser 等待 2000ms; 是否有可能因 ORM／鎖而 flake 或假通過)、MX-R5／R6／R7／M5; 以及 `srv.mjs` 新增之測試權杖與鉤子是否可能影響既有測試(特別是 `verifyClientUser` 對 `app:key-ghost` 的等待、`verifyAppUser` 對 `app:key-deny` 的否決對 `{token-for-app-deny-n}` 的影響)。
(三) **你仍認為遺漏的格或變異**: 針對 `delta.patch` 之外, 若你在第一輪之後有新想法(尤其是 ① 的『不在表只看 isAdmin』相對上一版之權限擴張面), 請列; 沒有就寫『無』。
(四) 文件與程式碼之一致性(僅限 `delta.patch` 內之文件變動)。

## 回報格式

最終回覆只放審查報告本文。第一段為探測引用。其後每條: `G<編號> | 嚴重度(高/中/低) | file:line | 情境(具體輸入或時序) → 實際 vs 應有 | 建議`。只列你自行讀碼確認過的; 不確定者標『推測』並說明驗證方法。沒有發現就寫『無發現』。不要重述背景, 不要評價整體。
