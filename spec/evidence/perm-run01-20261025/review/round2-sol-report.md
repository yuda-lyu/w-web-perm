```js
const PROTOS = ['new', 'body', 'old', 'empty']
const RE_PUB = /\bsysFuncsPublic\s*:\s*\[((?:\s*'[^']*'\s*,?)*)\s*\]/g //值須為單引號字串字面值之陣列
```

### G1 | 中 | test/api-sysFuncs.test.mjs:253、test/api-sysFuncs.test.mjs:268

情境：驗證「invalid clientId／invalid input 先於身分反查」的案例，本體皆使用有效管理員 token。→ 實際：即使實作錯將身分反查提前，反查成功後仍回相同錯誤，這些斷言會繼續通過；目前沒有守住宣稱的檢查次序。

具體缺格：標頭 `Bearer sys`，輪詢本體 `{clientId:null,__sysToken__:'nope-invalid'}`，現行框架回 `{error:'[sys:polling] invalid clientId'}`；函數本體 `{__sysInputArgs__:null,__sysToken__:'nope-invalid'}`，回 `output:{state:'error',msg:'invalid input'}`。依據為 `node_modules/w-serv-broadcast/src/WServBroadcastServer.mjs:213`、`node_modules/w-serv-webdata/src/WServWebdataServerExec.mjs:329`。

建議：補上「無效輸入＋無效本體 token」的交叉案例，固定上述回應，才能區分檢查次序被調換的回歸。

### G2 | 中 | test/api-sysFuncs.test.mjs:332、test/api-sysFuncs.test.mjs:416

情境：一般使用者案在 20 秒內尚未收到兩個 error，例如請求回覆延遲到第 22 秒。→ 實際：`st.ready` 在第 20 秒 reject，但本案完全沒有為它附加 rejection handler；`waitUntil` 卻允許繼續等待至 30 秒。此時已產生未處理的 rejection，之後 `finally` 才呼叫 `stop()`，無法撤銷它，並可能干擾同一 mocha 行程。

應有結果：等待期限內的延遲應由本案的等待與清理流程處理，不應另產生未處理的 rejection。

建議：建立 `st.ready` 時立即附加 rejection observer，保留原 promise 供成功案 `await`；或僅在需要開機成功的案例建立開機逾時計時器。此次移除原本的 `Promise.race` 也移除了原有的 rejection handler。

### G3 | 中 | test/api-sysFuncs.test.mjs:397

情境：4.5 秒窗口內，一次輪詢耗時超過兩秒。→ 實際：`WServBroadcastClient` 在 `execIng` 為 true 時跳過下一個兩秒 tick（`node_modules/w-serv-broadcast/src/WServBroadcastClient.mjs:174`），因此正常但較慢的服務可能只留下一次連線閘紀錄，造成誤紅。

反過來，第二次輪詢只要已通過標頭驗證，即使本體驗證或回覆仍懸置，也已被算入 `rounds`。`verifyConn` 成功紀錄寫於 `server/WWebPerm.mjs:1281`，早於輪詢處理；結尾 `stop()` 又會中止在途請求並抑制後續 error。因此兩筆紀錄與當下空的 `st.errs`，不足以證明兩輪成功完成。

應有結果：確認至少兩次輪詢取得合法陣列回覆，並容許合理的請求延遲。建議：觀察輪詢 `execute` 的成功結算，以有總截止期限的 `waitUntil` 等待成功次數；srLog 哨兵只負責確認記錄已落檔。

### G4 | 中 | README.md:138、test/unit-sysFuncsSite.test.mjs:105

情境：舊 lockfile 保留 `w-serv-broadcast@1.1.11`。→ 實際：README 表示這種安裝已有所需 polling hook，但 SFS-003 無條件要求至少 1.1.12，必定判失敗。`node_modules/w-serv-webdata/package.json:6` 所宣告的 `^1.1.11` 也容許此組合。

應有結果：文件、相依範圍與測試對最低支援版本有一致契約。

建議：若要求至少 1.1.12，明列舊 lockfile 須更新並確保依賴下限；若支援 1.1.11，確認其行為後調整 SFS-003。此處確認的是契約不一致，並未據現有快照斷言 1.1.11 的完整行為。

### G5 | 低 | README.md:135

情境：標頭 `Bearer sys`，呼叫 `[sys:polling]`，本體 `{clientId:null,__sysToken__:''}`。→ 實際：回 `{error:'[sys:polling] invalid clientId'}`，不反查本體 token，也不發 polling error 事件；`node_modules/w-serv-broadcast/src/WServBroadcastServer.mjs:213` 在呼叫鉤子前即返回。

文件卻將「已通過連線閘、缺少／空／無效本體 token」一概描述為固定回 `[sys:polling] permission denied` 並發 error，亦稱帶鍵者每輪都反查，漏了 `clientId` 檢查的優先次序，與新增邊界案不一致。

建議：上述敘述補上「`clientId` 有效」前提，並列明無效 `clientId` 的回應及不發事件行為。