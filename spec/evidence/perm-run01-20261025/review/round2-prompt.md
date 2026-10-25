# 功能正確性審查第二輪(增量,唯讀): w-web-perm 系統函數身分關卡——採納第一輪意見後之修改

你是獨立審查者(上一輪另有審查報告,你不必記得它)。目前工作目錄是 w-web-perm 的**快照副本**(僅含審查相關檔案與框架原始碼 `node_modules/w-serv-hapi|w-serv-webdata|w-serv-broadcast|w-converhp/src`; 不能跑測試)。請**自行讀檔**審查,不要依賴我的敘述。

限制: 不得修改、建立或刪除任何檔案,不得執行測試或啟動服務。可使用唯讀查檔指令(rg 等)。讀含中文的檔案請用 `rg -n '^' -- <檔>`(需要限範圍時用 rg 自己的 -m/-A/-B/-C,不要接 PowerShell 管線,否則中文會失真)。

## 先做探測(回覆的第一段)

原文引用以下兩處,逐字,各一行:
1. `test/api-sysFuncs.test.mjs` 中以 `const PROTOS` 開頭的那一行;
2. `test/unit-sysFuncsSite.test.mjs` 中以 `const RE_PUB` 開頭的那一行。
引用不出表示讀檔失敗,請直接回報讀檔失敗並結束。

## 背景(只供定位,請以程式碼為準)

這是權限管理後端 `server/WWebPerm.mjs`(建於 w-serv-hapi → w-serv-webdata → w-serv-broadcast 之上)與其 Vue 前端。框架選項 `sysFuncsPublic` 決定哪些系統函數(`[sys:getFuncList]`、`[sys:getTableTags]`、`[sys:polling]`)免身分;**預設三者皆公開**。本套件設定為只公開 `[sys:getFuncList]`,且 `getUserIdByToken` 對空 token/非管理員 reject、連線閘只放管理員,故能分辨『預設』與『嚴格設定』的行為只剩『標頭有效管理員、本體缺 `__sysToken__` 鍵之 `[sys:polling]`』。前端 `src/main.js` 以 `useWaitToken: true` 使登入前不連線。上一輪我請另一位審查者看過全部變更;本輪**產品程式碼沒有改動**(只有 `server/WWebPerm.mjs` 的一句 JSDoc),修改的是測試與 README。

上一輪採納的意見與我的處理(請檢查處理是否正確、完整,有無引入新問題):
- F1 測試缺格 → `test/api-sysFuncs.test.mjs` 新增四個「邊界」案: 本體 `__sysToken__` 非字串(`cstr` 把非字串/數字/符號/bigint 以外轉為空字串)、輪詢 `clientId` 缺失/非字串(`invalid clientId` 先於反查)、函數輸入封裝缺 `__sysInputArgs__`/型別錯(`invalid input`)與 input 本身非物件、函數名變體。
- F2 clientId 綁定案原本第二次請求缺 token 先被空身分檢查擋下 → 改測兩個「有效但 userId 不同」的呼叫者(管理員 id-for-admin、系統服務用途 app:key-sys)重用同一 clientId,以及同 userId 之 AUA token 續輪詢。
- F5 `test/unit-sysFuncsSite.test.mjs` SFS-002 改固定 `getToken` 的 `let token = get(…userToken…)`/`return token`,並固定 `updateUserToken` 呼叫點恰為 `App.vue` 兩處;F6 SFS-003 範圍限單純 `^/~/精確` 版本。
- F7 放行判斷強化: 輪詢須 `output` 為陣列、函數須內容正確;拒絕鍵逐呼叫者固定(`expectOf`);真前端元件案斷言四表 `recvData` 到齊。
- F8 開機逾時計時器隨 `stop()` 清除;固定 sleep 改為有截止期限的條件等待 `waitUntil`;「登入前零紀錄」與「輪詢輪數」用第二個 `markSrLog()` 哨兵確保窗口內紀錄已落檔後才讀。
- F9/F10/F11 README 文字修正(見 `delta-README.patch`)。
- F4(`useWaitToken` 只管首次啟動)屬實但本套件無啟動後清空 token 之路徑 → 以 SFS-002 固定呼叫點,未改前端;F3(框架 `clientLeave` 交錯,作者自標推測)屬框架層,本輪不處理。

增量全貌見 `delta-test.patch`、`delta-README.patch`、`delta-server.patch`(相對上一輪快照);完整檔案在 `test/`、`README.md`、`server/WWebPerm.mjs`。

## 請依下列順序審查

**(一) 採納是否正確、完整**: 逐項對照上列 F1/F2/F5/F6/F7/F8/F9/F10/F11,指出處理有誤、漏掉的情形、或與框架實際行為(`node_modules/w-serv-*/src`)不符的預期(例如 `expectOf` 的拒絕鍵、`outcomeOf`/`isAllowed` 對各回應形狀的判斷、邊界案預期的訊息),附 `file:line` 與具體輸入→實際輸出。
**(二) 新測試本身的缺陷**: 時序/flake(`waitUntil`、`markSrLog` 哨兵、輪詢輪數計算、clientId 重複、在線逾時約 10 秒)、可能永遠為綠的斷言、假設了環境(例如 srLog 事件名稱與欄位)、清理不完整(夾具使用者還原)、與 mocha 同行程跑其他檔案時之互相干擾。
**(三) README 增修之正確性**: 逐句核對框架行為與本套件程式碼;指出誇大、遺漏或與測試不一致者。
**(四) 其他**: 前一輪沒看到而你發現的缺陷(只列新發現,附 `file:line`)。

## 回報格式

最終回覆只放審查報告本文(它會被保存)。第一段為上面要求的兩處引用。其後每一條發現一個小節:
`G<編號> | 嚴重度(高/中/低; 高=會造成錯誤結果或權限判定錯誤, 中=契約缺陷/測試漏洞/邊界未處理, 低=文件/命名) | file:line | 情境(具體輸入) → 實際結果 vs 應有結果 | 建議`
只列你自行讀碼確認過的;不確定者標「推測」並說明如何驗證。沒有發現就寫「無發現」。不要重述我已寫在背景裡的內容,不要評價整體寫得好不好。
