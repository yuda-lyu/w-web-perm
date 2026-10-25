# 輸入空間表(perm-run01, 任務 20261025161334; R-SYSFUNCS-01)

每格填「現況(實測)／應然／處置」。軸成員皆由系統取得(框架原始碼 `node_modules/w-serv-webdata/src/WServWebdataServerExec.mjs:296-362`、`genPollingGate.mjs`、`WServBroadcastServer.mjs:141-230`; 本套件 `server/WWebPerm.mjs` 之 `verifyConn`／`getUserIdByToken`; 前端 `src/main.js`、`src/App.vue`)。

## 軸

| 軸 | 成員 | 取得方式 |
|---|---|---|
| 系統函數(3) | `[sys:getFuncList]`、`[sys:getTableTags]`、`[sys:polling]` | `WServWebdataServerExec.mjs` 之 `sysFuncs` 全集 |
| 呼叫者(7) | N 無 token、U 一般使用者(perm 列 isAdmin n、部署方放行)、A 系統管理員、AUA 使用者用途綁管理員、AUM 使用者用途綁一般使用者、AS 系統服務用途、BAD 未知 token | 同 `api-callerMatrix` 之 svc 分類(管理員服務等級＝A／AUA／AS) |
| 協定(4) | new(標頭與本體同為呼叫者 token)、body(標頭管理員、本體為呼叫者)、old(本體缺 `__sysToken__` 鍵＝已發布之舊前端建置檔之輪詢形狀)、empty(本體 `__sysToken__` 為 '') | 框架 `haskey(input,'__sysToken__')` 分支 |
| 標頭形式(4) | 缺 Authorization、`Basic sys`、`Bearer`(空)、`Bearer  sys`(雙空白) | `reBearerAuth` |
| 設定值(7) | 預設(未設)、`[getFuncList]`、`+polling`、`+getTableTags`、`[]`、鍵名打錯、三者 | 框架 `parseOpt` |
| 登入狀態(前端) | 無 token 進站、無效 token、一般使用者、有效管理員、舊建置檔 | `src/App.vue` loginSuccess／loginError、`useWaitToken` |

## 表 A: 84 格 = 系統函數 × 呼叫者 × 協定(`test/api-sysFuncs.test.mjs`, 每格已斷言)

應然: 只有(A／AUA／AS)×(new／body)放行; 其餘一律拒——標頭非管理員等級於連線閘(`permission denied`); 標頭有效而本體缺鍵: 函數回 `invalid token`(框架封裝鍵先於身分關卡)、輪詢回 `[sys:polling] permission denied`; 本體為空/非管理員: 函數回執行身分之固定語系鍵、輪詢回 `[sys:polling] permission denied`。被拒回應不含函數名稱清單與同步表時間戳。

| 函數＼協定 | new | body | old | empty |
|---|---|---|---|---|
| `[sys:getFuncList]` | 7 格: A／AUA／AS 放行, 其餘連線閘拒 | 7 格: A／AUA／AS 放行; N／BAD `cannotFindUserFromToken`; U／AUM `userNotAdmin` | 7 格: 標頭有效者(A／AUA／AS)`invalid token`, 其餘連線閘拒 | 7 格: A／AUA／AS `cannotFindUserFromToken`, 其餘連線閘拒 |
| `[sys:getTableTags]` | 同上 | 同上 | 同上 | 同上 |
| `[sys:polling]` | 同上 | A／AUA／AS 放行; 其餘 `[sys:polling] permission denied` | A／AUA／AS **應拒**(修前: 預設公開而放行 ← 修前紅 3 格); 其餘連線閘拒 | A／AUA／AS `[sys:polling] permission denied`; 其餘連線閘拒 |

修前(框架預設)實測: 81 格符合、3 格不符(`[sys:polling]`×{A,AUA,AS}×old 放行); 修後 84／84 符合(證據 `red-api-sysFuncs-default.summary.txt`〔初版〕、`red-api-sysFuncs-default-final.summary.txt`〔最終版測試〕、`green-final.summary.txt`)。

## 表 B: 其他格

| # | 格 | 現況(實測) | 應然 | 處置 |
|---|---|---|---|---|
| B1 | 標頭 4 形式 × 3 函數(本體有效管理員) | 12 格皆連線閘 `permission denied` | 同左 | 已測(api-sysFuncs) |
| B2 | clientId 綁定: 新協定輪詢後同 clientId 改舊協定 | 被拒; 原身分續輪詢放行 | 同左 | 已測 |
| B3 | 被拒之舊協定輪詢不綁定空身分 | 之後新協定管理員首次輪詢放行 | 同左 | 已測 |
| B4 | 真前端元件(`WServHapiClient`, `useWaitToken:true`), getToken 先 '' 後管理員 token | 等待期間後端零 verifyConn 紀錄; token 出現後開機、輪詢兩輪以上無 error 事件 | 同左 | 已測 |
| B5 | 真前端元件持一般使用者 token | 開機被拒, error 事件為 `permission denied` | 同左 | 已測 |
| B6 | `api-callerMatrix` `[sys:polling]` × 15 呼叫者 × 標頭／本體兩個身分來源 | 30 格(原只測標頭 15 格) | 管理員服務等級放行, 其餘拒、零寫入 | 已測(格數 950→965) |
| B7 | 設定值 7 種 | 見 `mutation-results.json`: 預設／鍵名打錯／三者／＋polling → API 與 unit 皆抓到; ＋getTableTags／空陣列 → 行為上不可分辨, 由 unit SFS-001 抓到 | 同左 | 已測; 不可分辨者註明 |
| B8 | 前端 `useWaitToken` 改 false(登入前即連線) | unit SFS-002 抓到; 真瀏覽器變異見 `browser-probe-mut-useWaitToken.json` | 同左 | 已測 |
| B9 | `package.json`／已安裝版本低於 1.1.8／1.1.16／1.1.12; 範圍為 `<=1.1.8`／`||` 等複合形 | unit SFS-003(範圍須為單純 `^／~／精確`; 外審 F6) | 同左 | 已測 |
| B10 | 本體 `__sysToken__` 非字串(null、123、true、{}、[]、['sys']、['nope-invalid']) × 3 函數(標頭有效管理員) | 21 格皆拒(函數 `cannotFindUserFromToken`、輪詢 `[sys:polling] permission denied`): `cstr` 把非字串／數字／符號／bigint 以外轉為 '' 、數字轉 '123' | 同左 | 已測(外審 F1) |
| B11 | 輪詢 `clientId` 缺失／''／null／123／{}／[]／['c'] | 7 格皆 `[sys:polling] invalid clientId`(先於身分反查, 不發 error 事件、不寫佇列); 其後有效輪詢放行 | 同左 | 已測(外審 F1) |
| B12 | 函數輸入封裝: 缺 `__sysInputArgs__`／型別錯(字串、null、物件)4 形 × 2 函數; input 本身為 null、字串、數字、陣列 5 形 × 2 函數 | 前者 `invalid input`, 後者皆不放行、不含資料 | 同左 | 已測(外審 F1) |
| B13 | 函數名變體(大小寫、前後空白、缺方括號、未知 `[sys:xxx]`)8 種 × 兩種輸入形狀 | 16 格皆不放行、不含資料 | 同左 | 已測(外審 F1) |
| B14 | clientId 過長(如一百萬字元) | 框架只檢查非空字串(`WServBroadcastServer.mjs:213`), 有效管理員才可建立在線狀態; 未測 | 框架資源邊界 | 備查(範圍外, 框架) |
| B15 | 延後送達之 `clientLeave` 與同一 clientId 重新在線之交錯(`WServWebdataServer.mjs:529-531` 無條件 `gate.release`) | 未重現(外審 F3, 作者自標推測; 讀碼窗口約 1 ms) | 框架層 | 待裁示／備查 |

## 表 C: 真瀏覽器登入狀態(`browser-probe.json`)

| 狀態 | 現況(實測) | 應然 | 判定 |
|---|---|---|---|
| S0 無 token 進站 | 約 2.2 秒轉址 urlRedirect; `/api/` 請求 0 個; 無 console 錯誤 | 轉址 SSO 登入, 不連資料通道 | 照常 |
| S1 帶已發 token(sys)進站 | 4.4 秒 ready, 四表載入; 五頁籤逐一切換; `[sys:polling]` 6 輪全成功且本體 `__sysToken__` ＝標頭 token; 另一用戶改 grups 後 2.2 秒推播到達; 無 console 錯誤 | 照常 | 照常 |
| S2 一般使用者(部署方放行) | `csErrNotAdmin`「No permission to enter the permission console」; 不轉址; token 清空; 僅 `GET /api/getUserByToken` 1 個請求 | 「無權進入」畫面 | 照常 |
| S3 無效 token | 約 2.2 秒轉址; 僅 `GET /api/getUserByToken` 1 個請求 | 轉址 | 照常 |
| S4 舊前端建置檔＋升版後端 | 輪詢 7 輪全被拒(`[sys:polling] permission denied`); 畫面停在「Logged in」, 四表未載入 | 重新載入頁面後恢復(README Upgrade Notes) | 如預期(已文件) |
