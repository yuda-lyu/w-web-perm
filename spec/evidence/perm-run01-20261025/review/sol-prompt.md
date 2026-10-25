# 功能正確性審查(唯讀): w-web-perm 系統函數身分關卡之設定(sysFuncsPublic)

你是獨立審查者。目前工作目錄是 w-web-perm 的**快照副本**(僅含審查相關檔案與框架原始碼 `node_modules/w-serv-hapi|w-serv-webdata|w-serv-broadcast/src`; 不能跑測試)。請**自行讀檔**審查, 不要依賴我的敘述。

限制: 不得修改、建立或刪除任何檔案, 不得執行測試或啟動服務。可使用唯讀查檔指令(rg 等)。讀含中文的檔案請用 `rg -n '^' -- <檔>`(需要限範圍時用 rg 自己的 -m/-A/-B/-C, 不要接 PowerShell 管線, 否則中文會失真)。

## 先做探測(回覆的第一段)

原文引用以下兩處, 逐字, 各一行:
1. `server/WWebPerm.mjs` 中以 `sysFuncsPublic:` 開頭(去前導空白後)的那一行;
2. `test/api-sysFuncs.test.mjs` 中以 `const PROTOS` 開頭的那一行。
引用不出表示讀檔失敗, 請直接回報讀檔失敗並結束。

## 背景(只供定位, 請以程式碼為準)

這是權限管理後端 `server/WWebPerm.mjs`(建於 w-serv-hapi → w-serv-webdata → w-serv-broadcast 之上)與其 Vue 前端 `src/`。框架提供三個系統函數 `[sys:getFuncList]`(函數名稱清單)、`[sys:getTableTags]`(同步表名與時間戳)、`[sys:polling]`(輪詢, 取走廣播與時間戳)。框架選項 `sysFuncsPublic` 決定哪些系統函數免身分: **預設三者皆公開(相容)**; 使用方須顯式設定。本輪(perm-run01)要求:

1. 升 `w-serv-hapi` 至 `^1.1.8`(連帶 w-serv-webdata 1.1.16、w-serv-broadcast 1.1.12), 後端設 `sysFuncsPublic: ['[sys:getFuncList]']`; 重建前端 `dist/` 與後端 umd。
2. 前端新元件的輪詢於本體帶 `__sysToken__`; 輪詢經 `getUserIdByToken` 每輪反查(`genPollingGate.mjs`)。**缺 `__sysToken__` 鍵之輪詢(已發布之舊前端建置檔)被框架當成無身分: 預設公開時放行, 嚴格設定時拒絕。**
3. 本套件的 `getUserIdByToken`(`server/WWebPerm.mjs`)為真實反查且對空 token/非管理員 fail-closed(reject), 連線閘 `verifyConn` 亦只放行管理員。因此在本套件, 「列為公開」的 `[sys:getFuncList]` 實際仍須管理員身分; 可分辨『預設』與『嚴格設定』的行為只剩『標頭有效、本體缺 `__sysToken__` 鍵的輪詢』。
4. 前端 `src/main.js` 以 `useWaitToken: true` 建立 `WServHapiClient`, 登入成功(token 寫入 store)前不輪詢、不呼叫任何系統函數。我已用真瀏覽器確認: 無 token 進站、無效 token、一般使用者「無權進入」三種登入前畫面零 `/api/main` 請求; 登入後輪詢六輪皆帶 token 成功; 舊建置檔(重建前 dist)升版後輪詢每輪被拒(畫面停在「已登入」)。證據 `spec/evidence/perm-run01-20261025/browser-probe.json`。

不得改變: 1.1.16 既有存取規則與行為(後台與資料通道限系統管理員、`/api/getPerm`、應用系統路由等級、系統服務用途之認定)。

主要變更檔: `server/WWebPerm.mjs`(`sysFuncsPublic` 一行與註解/JSDoc)、`package.json`、`test/api-sysFuncs.test.mjs`(新)、`test/unit-sysFuncsSite.test.mjs`(新)、`test/api-callerMatrix.test.mjs`(`[sys:polling]` 入口改兩個身分來源皆測)、`README.md`(Security 入口表、Upgrade Notes 第一節)。全貌見 `diff.patch`(相對上一檢查點, 不含 dist 與 node_modules)。

## 請依下列順序審查(最後才審方案)

**(一) 挑戰輸入空間表的完整性**: 本輪的表為 呼叫者(無 token、一般使用者、系統管理員、使用者用途之應用系統綁管理員/綁一般使用者、系統服務用途、未知 token) × 協定(new: 標頭與本體同 token; body: 標頭管理員、本體為呼叫者; old: 本體缺 `__sysToken__` 鍵; empty: 本體 `__sysToken__` 為 '') × 三個系統函數, 共 84 格(`test/api-sysFuncs.test.mjs`)。指出**缺的軸與缺的格**, 以及「預期與框架實際行為不符」者, 附 `file:line` 與具體輸入→實際輸出。請特別思考: `__sysToken__` 為非字串(null、數字、物件、陣列)時 `cstr` 的轉換; `clientId` 為空/非字串/過長; 輸入本身非物件或缺 `__sysInputArgs__`; 函數名大小寫/前後空白/未知 `[sys:xxx]`; `Authorization` 的各種變體; 同一請求兩個 `__sysToken__`; 輪詢與一般函數呼叫之間身分判定是否對稱(例如輪詢通過、同 token 之 `[sys:getTableTags]` 卻被拒或反之); `getUserIdByToken` 拋錯 vs reject 的處理。
**(二) 前提是否成立**: 我主張『本套件前端在 token 存在前不呼叫任何系統函數』(`src/main.js` 之 `useWaitToken: true`)。請讀 `node_modules/w-serv-hapi/src/WServHapiClient.mjs`、`w-serv-webdata/src/WServWebdataClient.mjs`、`src/main.js`、`src/App.vue`, 找出任何在登入成功前就會呼叫資料通道/系統函數的路徑(含 token 被清空/登出/登入失敗後是否停止輪詢、換 token 後 clientId 綁定被拒的情境), 以及 `src/`、`server/` 內其他會用到 `[sys:` 的站點。
**(三) 測試是否真能抓到**: 逐一思考下列變異是否會被 `test/api-sysFuncs.test.mjs` 或 `test/unit-sysFuncsSite.test.mjs` 抓到, 抓不到者說明缺的斷言: ①拿掉 `sysFuncsPublic`(退回預設); ②多列 `[sys:polling]`; ③多列 `[sys:getTableTags]`; ④改空陣列; ⑤鍵名打錯; ⑥明列三者; ⑦`getUserIdByToken` 對空 token 改回空字串(fail-open); ⑧`useWaitToken` 改 false; ⑨`package.json` 之 w-serv-hapi 範圍退回 ^1.1.7。另指出測試斷言是否有「現狀指紋」而非對應規則的句子, 以及可能的 flake(時序、clientId 重複、在線逾時)。
**(四) 文件與程式碼是否一致**: `README.md`(Security 入口表新增列、Public entries 段、Upgrade Notes 第一節)與 `server/WWebPerm.mjs` 的註解/JSDoc, 與程式碼及框架實際行為逐句核對, 指出不一致、誇大或遺漏之處(例如 error 事件的描述是否正確)。
**(五) 最後才審方案**: 只公開 `[sys:getFuncList]` 是否有未預期的相容性損失(以前可用、現在被拒的使用情境, 例如其他 SDK、外部應用、監控、舊前端分頁)? 是否有該一併處理而沒處理的站點?

## 回報格式

最終回覆只放審查報告本文(它會被保存)。第一段為上面要求的兩處引用。其後每一條發現一個小節:
`F<編號> | 嚴重度(高/中/低; 高=會造成錯誤結果或權限判定錯誤, 中=契約缺陷/測試漏洞/邊界未處理, 低=文件/命名) | file:line | 情境(具體輸入) → 實際結果 vs 應有結果 | 建議`
只列你自行讀碼確認過的; 不確定者標「推測」並說明如何驗證。沒有發現就寫「無發現」。不要重述我已寫在背景裡的內容, 不要評價整體寫得好不好。
