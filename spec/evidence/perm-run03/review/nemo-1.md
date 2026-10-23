# nemotron: 靜默逾時被終止(無最終報告)

- 第二次派工(第一次因絕對路徑被 external_directory 拒絕而重派一次, 依規則不再重派)
- 00:00:25 後無任何輸出, 10 分鐘靜默規則於 00:11 終止(taskkill /F /T, 已驗證 PID 消失)
- 以下為終止前的過程輸出(僅讀檔進度, 無發現):

我將先讀取最關鍵的檔案：補丁檔、新檔案（syncCore 與測試），以及核心伺服端實作。
繼續讀取核心伺服端與前端檔案。
繼續讀取前端身分相關檔案與 schema。
繼續讀取 schema、spec 與文件檔案。
現在讀取規格與文件檔案。
讀取 WWebPerm.mjs 關鍵段落與驗證相關函數，以及補丁其餘部分。
讀取 WWebPerm.mjs 的 getAndVerifyClientUser 與 getUserIdByToken 實作。
檢查 `getTokenUser` 是否正確驗證 `isActive='y'`。
檢查 `getTokenUser` 實作。
檢查 `checkUser` 是否驗證 `isActive='y'`。
讀取測試輔助 `api-setup.mjs` 和 `e2e-setup.mjs`，確認 `callRpc` 是否自動附宣告。
讀取 `srv.mjs` 的 token 夾具完整定義，驗證 CI-G1 各 case 的預期錯誤鍵是否正確。
讀取 `srv.mjs` `getUserByToken` 開頭，確認 `sys` 權杖回傳是否包含 `name`（`checkUser` 需要）。
檢查 wsemi `iseobj` 行為，確認 TOKEN_BAD (空物件 `{}`) 會否被 `checkUser` 攔截而導致 CI-G1 錯誤鍵不符。
