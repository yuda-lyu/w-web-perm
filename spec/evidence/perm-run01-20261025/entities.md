# 實體帳冊(L0d, perm-run01 本輪): 新碼用到之 API／選項／鍵是否存在於已安裝版本

版本以 `node_modules/<套件>/package.json` 為準: w-serv-hapi 1.1.8、w-serv-webdata 1.1.16、w-serv-broadcast 1.1.12、w-converhp 2.1.10、w-serv-orm 1.1.17。查證方式: Grep 原始碼(2026-10-25)。

| 實體 | 用於 | 查證位置 | 結果 |
|---|---|---|---|
| 選項 `sysFuncsPublic`(陣列, 元素須為三個系統函數名之一) | `server/WWebPerm.mjs` | `w-serv-webdata/src/WServWebdataServerExec.mjs:172-185`(parseOpt; 未給取預設三者、非陣列拋 `invalid opt.sysFuncsPublic`)、`WServWebdataServer.mjs:88,127,159`; `w-serv-hapi/src/WServHapiServer.mjs` 整包轉傳 | 存在 |
| 預設 `sysFuncsPublic` ＝ `[getFuncList, polling, getTableTags]` | 修前紅依據 | `WServWebdataServerExec.mjs:175-177` | 存在 |
| `genPollingGate`(輪詢身分關卡; 缺 `__sysToken__` 鍵視為空身分、不反查) | 預期行為 | `w-serv-webdata/src/genPollingGate.mjs:33-70` | 存在 |
| `verifyPolling` 鉤子(拒絕固定訊息 `[sys:polling] permission denied`、鉤子拋錯 `[sys:polling] verifyPolling error`) | 預期訊息 | `w-serv-broadcast/src/WServBroadcastServer.mjs:141-161,206-240` | 存在 |
| `invalid clientId`、`invalid token`、`invalid input`、`permission denied`(系統函數未列公開且無身分) | 邊界案預期 | `WServBroadcastServer.mjs:211-214`; `WServWebdataServerExec.mjs:297-361` | 存在 |
| `cstr`(非字串／數字／符號／bigint 轉空字串) | 非字串 token 案 | `wsemi/src/cstr.mjs` | 存在 |
| 前端選項 `useWaitToken`、`getToken`、`getServerMethods`、`recvData`、`apiName`、`tokenType`、`url`、`useShowLog`; 實例方法 `clearBroadcast`、`clearSync`、`on('error')` | `src/main.js`、`api-sysFuncs` 真前端元件案 | `w-serv-hapi/src/WServHapiClient.mjs`(JSDoc 與實作; `useWaitToken` 每 100 ms 取 `getToken`) | 存在 |
| 測試輔助 `markSrLog`、`readSrLogSince`、`selectAllRows`、`callRpc`、`TOKEN_ADMIN／MEMBER／AS／AU_ADMIN／AU_MEMBER／BAD` | 新測試 | `test/tools/api-setup.mjs` | 存在 |
| `assertPristineSeed`(`./tools/baseSeed.mjs`)、`stripLineComment`(`./tools/srcScan.mjs`)、`procLang`(`../server/procLang.mjs`, 呼叫後取語系鍵全集) | 新測試 | 各檔 | 存在 |
| 建置指令 `npm run build`、`node toolg/genEntry.mjs`、`node toolg/gDistRollup.mjs` | 重建 dist／umd | `package.json` scripts、`script.txt`、`toolg/` | 存在; 重建具決定性(同源碼兩次建置 dist／umd 雜湊相同) |
| 三個架構事實: srLog 事件名 `verifyConn`／`verifyConn-error`／`getUserIdByToken-error`(欄位 `apiType`、`ok`) | 真前端元件案 | `server/WWebPerm.mjs`(`verifyConn` 內 `srLog.info/error`、`getUserIdByToken` 內 `srLog.error`) | 存在 |
