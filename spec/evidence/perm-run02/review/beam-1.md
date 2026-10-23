# 審查結論

我已讀過 `src/js/refIdentity.mjs`（第 1 行 `import { REF_OF, keyOf, entName, decodeKp, listEntries } from './refCascade.mjs'`）、`server/procCore.mjs`、`server/keyCheck.mjs`、`server/lockSave.mjs`、`src/js/draftSync.mjs`、`src/js/refCascade.mjs`、`server/WWebPerm.mjs`（updateUsers wrapper）、三個清單頁與兩個對話框的 patch、以及 `test/unit-refIdentity.test.mjs`、`test/unit-procCore-identity.test.mjs`、`test/api-identity.test.mjs`。

## 發現(依嚴重度)

未發現高嚴重度之正確性問題。程式碼與契約一致：鎖階層（refTarget.table → keyTable → holder）嚴格遞增、refRows 在持鎖期間單次讀取並共用、subject 先於基準比對、refs 在 restoreServerFields 之後、宣告完整性檢查使用鎖內 ltdtOld、pickClientOpt 不降級、targets 帶 subject/refs 拒收。測試（IDN-1xx～6xx、RI-1～14）對「拿掉實作即變紅」有 mutation 註記，覆蓋完整。

中/低 minor 觀察（非阻斷、未改 code）：

1. **[低] `src/js/refIdentity.mjs:249-254` `recordPicks` 不清除已停用名稱的舊 picks** — 若同一編輯 session 內「啟用→停用→再啟用」同一名稱，picks 保留首次快照 id；buildRefDecl 仍取 picks，宣告為首次 id。在極端「停用期間該實體被刪除後同名重建」情境下可能以舊 id 送出，但伺服端比對會拒收（refChanged），故不造成資料遺失，僅多一次 round-trip。把握度：推演。

2. **[低] `server/procCore.mjs:590-593` `updateUsers` 本身不呼叫 `pickClientOpt`** — 但 WWebPerm wrapper（line 1429）已過濾，且測試 run() 也過濾；直接呼叫 `pc.updateUsers` 的測試路徑傳入已過濾 opt。契約「不信任內容」在 wrapper 層成立，procCore 層未獨立防護。把握度：確定（讀碼）。屬已知架構（users 路徑需 pickKeysOnly 伺服端注入）。

3. **[低] `src/js/refIdentity.mjs:44-50` `toId` 對空字串 id 回傳 `''`**（isStr 為真） — 空 id 實體會被 collectNewNames/byId 計入；但 normal flow 中 id 為空的列視為新增，行為與契約「新增列全部啟用項皆新增」一致，未造成誤拒。把握度：確定。

## 已檢視而未發現問題的範圍

- `withRefLock` 取鎖順序與 held 驗證（keyCheck.withTabLocks）；cascade 的 `held=[keyTable]` 驗證。
- `checkRefIdentity` 次序（countRefMismatch → collectNewNames）與 reason 映射。
- `parseSubject`/`parseRefDecl` 原型鍵名、超量、重複、非字串 id。
- `activeNames`/`newActiveNames` 對 mode、isActive 非 'y'、壞 JSON、非容器。
- 前端 `refPicks` 初始化/重建歸零、recordPicks 就地更新、buildRefDecl fallback。
- `pickClientOpt` 原樣轉出 subject/refs、不採納伺服端設定。
- procLang 三鍵 eng/cht 固定訊息。
- ADR-037 Update(perm-run02) 與 rulebook R-REF-IDENTITY-01 描述與程式一致（符號錨、筆數、行為）。

## 未檢視或無法判定的範圍

- `test/e2e-concurrent-edit.test.mjs` E2E-025～036：未讀全檔（體積大），僅抽查 refs 相關段；無法判定 V14 式交錯是否真的交錯（需實跑）。
- 真後端 RPC / 前端元件呼叫路徑（showVeCxxxById → recordPicks）未實機驗證，僅讀 patch。

未發現需大幅重寫架構之問題。
