# 輸入空間統計(perm-run01 第三輪; 驗收依據 `C:\opensrcOper\dspec\w-web存取管控表.md` 第二節)

驗收測試: `test/api-callerMatrix.test.mjs`(真後端; 最終輪 api 全跑 474 過／0 敗, 計數器「已斷言格數(含相容軸)」＝589); 輔助: `test/unit-appToken.test.mjs`(判準真值表與站點)、`test/unit-routeResult.test.mjs`。

## 軸

| 軸 | 成員 | 數量 |
|---|---|---|
| 入口 | 靜態檔 1；hapi 路由 4(`/api/getUserByToken`、`/api/getPerm`、`/api/getPermUserInfor`、`/syncAndReplaceTabs`)；通訊路由 5(`ulctr`、`slc`、`dwgfn`、`dwgf`、`dw`)；資料通道函數 14(表 `select` ×4、`getWebInfor`、`updateTargets／Pemis／Grups／Users`、`getStaEvent`／`getStaEventTable`、系統函數 `[sys:getFuncList]`／`[sys:getTableTags]`／`[sys:polling]`) | 24(dspec 另列第 6 條通訊路由＝`/api/main` 本身, 其連線閘由 14 個函數格逐格經過, 不另設格) |
| 呼叫者(目標) | N 無 token、U 一般使用者、A 系統管理者、AUA 使用者用途綁系統管理者、AUM 使用者用途綁一般使用者、AS 系統服務用途(dspec 之 AU 一欄依綁定者拆為 AUA／AUM) | 6 |
| 呼叫者(相容) | NF `isApp` 未轉傳(AS 形狀)、ASN AS 形狀但 `isAdmin='n'`、AUD 使用者用途綁停用之使用者、APP 虛擬應用系統〔`TOKEN_APP` 現轉傳 `isApp`〕 | 4 |
| 身分來源(資料通道) | 標頭 `Authorization`(連線閘)、本體 `__sysToken__`(執行身分) | 2 |
| 對應鍵 | `mappingBy` ＝ `id`(預設)／`email`／`name` | 3 |

## 格數(目標表: 25 入口 × 6 類 = 150 格)

| 狀態 | 格數 | 說明 |
|---|---|---|
| 已測(有斷言) | 150 | 24 入口 × 6 類 = 144 格逐格斷言; 第 25 入口(`/api/main` 連線閘)6 格由 14 個函數格逐格經過; 資料通道函數另對標頭／本體兩個身分來源各斷言一次(13 個函數 ×2 ×6 類＋`[sys:polling]` 標頭 ×6 類＝162 次斷言) |
| 刻意允許 | 0 | — |
| 已知不修 | 6(`[sys:polling]` 本體 `__sysToken__` 身分來源 × 6 類) | 該檢查屬框架(w-serv-webdata ≥1.1.16 `verifyPolling`; 本機 w-serv-broadcast 1.1.10 無), 排程第 128 項; 輪詢標頭來源之連線閘 6 格已測 |
| 未填 | 0 | — |

相容軸: 4 類 × 24 入口 ＝ 96 格, 已測 96(資料通道同分標頭／本體)。`mappingBy` 變體(email、name): 10 類 × 4 檢查點(後台登入檢查、`getPermUserInfor`、`users.select` 標頭、`users.select` 本體) × 2 ＝ 80 次斷言, 另 MX-M2(外部 id 與 perm 主鍵衝突, 各入口一致被拒)×2、MX-M3(外部 id≠perm 主鍵之稽核 id)、MX-M4(綁停用者, 外部 id≠perm 主鍵)。

## 目標格與測試對照

| 目標格(dspec 第二節) | 測試 |
|---|---|
| 靜態檔 × 全部 | MX-H1 |
| `GET /api/getUserByToken` × {N✗, U✗, A✓, AUA✓, AUM✗, AS✓} | MX-H2(＋鍵: tokenNoPermission／userNotAdmin／cannotGetUserFromPerm／cannotGetUserEmail)、MX-P1、MX-P2、MX-M1 |
| `GET /api/getPerm` × {N✗, U✓本人, A✓本人, AUA✓所綁, AUM✓所綁, AS✗} | MX-H3(AUM 之樹 ≡ peter 之使用者 token 查得者) |
| `GET /api/getPermUserInfor` × {N✗, U✗, A✓, AUA✓, AUM✗, AS✓} | MX-H4(P-1)、MX-P1、MX-P3、MX-M1 |
| `POST /syncAndReplaceTabs` × 同上, 稽核欄記呼叫者 id | MX-H5、MX-P5、MX-M3、MX-Q1(先驗身分, P-5) |
| 通訊路由 ×5 × 6 類 | MX-C(回應 ≡ 無效 token／已過閘)、MX-B2 |
| 資料通道 14 函數 × 6 類(標頭／本體) | MX-D ×14、MX-P7(標頭×本體交叉)、MX-P6(AS 寫入與稽核) |
| 部署方否決／檢查之值即使用之值 | MX-P3、MX-P4、MX-P5 |
| Bearer 方案(P-3) | MX-B1、MX-B2 |
