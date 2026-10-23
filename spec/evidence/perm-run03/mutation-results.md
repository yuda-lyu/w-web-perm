# perm-run03 變異驗證結果(2026-10-23)

方法: 暫時改產品碼一處(標記 `MUTATION-*`), 跑對應測試, 確認被抓到, 再以備份還原(`cmp` 驗證與原檔逐位元相同, 備份在 `tmp/perm-run03/*.orig`)。測試皆在還原後的碼上通過。

| 編號 | 範圍 | 變異 | 受測檔 | 結果 |
|---|---|---|---|---|
| M3 | 三(執行身分完整驗證) | `server/WWebPerm.mjs:getUserIdByToken` 內 `getAndVerifyClientUser(token, 'main')` 退回 `getUserByToken(token)`(只取外部 id) | `test/api-callerIdentity.test.mjs`(真後端) | 16 案失敗(CI-G1×6、CI-G2×6、CI-G3、CI-G4、CI-G6、CI-G7 等) |
| M4 | 四(角色檢查) | `requireAdmin` 之條件改 `if (false)`(拿掉角色檢查) | `test/api-callerIdentity.test.mjs` | 5 案失敗(CI-A1×4 四個寫入函數、CI-A4 srLog) |
| M1 | 一(宣告強制必帶) | `src/js/refIdentity.mjs:checkRefIdentity` 拿掉「無宣告且 changed>0 → `saveIdentityRequired`」判斷(退回 perm-run02 的『未帶宣告就略過』) | `test/unit-refIdentity.test.mjs`＋`test/unit-procCore-identity.test.mjs` | 72 案失敗(必帶矩陣: 新增／移除／新列帶引用／subject 單獨宣告各格) |
| M5 | 二(外部匯入; 外審 sol#1) | `server/syncCore.mjs` 呼叫 `keepAssignOnMissing` 時 `mappingBy` 退回固定 `'id'`(email／name 換主移轉授權) | `test/unit-syncCore.test.mjs`＋`test/unit-syncKeep.test.mjs` | 4 案失敗(SC-K1 email 互換、SC-K2、SC-K3 name 被改、SITE-SK-001 靜態守護); 還原後 `cmp` 與原檔位元組相同, 164 過 |
| MI | 二(外部匯入) | `server/syncCore.mjs` 拿掉 `idNotAllowed` 檢查(`kId = -1`) | `test/unit-syncCore.test.mjs` | 6 案失敗(SC-I7 送 id 各形、SC-I7-all) |
| MS | 二(外部匯入) | `server/syncCore.mjs` 拿掉 `srcKey` 配對(`matched` 恆為新增＝退回整批取代, 舊列全刪、新列新 id) | `test/unit-syncCore.test.mjs` | 21 案失敗(I1 冪等、I2～I5、I6、I10、I11、I12、I15 等) |
