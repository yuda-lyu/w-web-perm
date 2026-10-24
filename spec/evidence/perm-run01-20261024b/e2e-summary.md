# e2e 選測結果(perm-run01 第三輪)

依規則帳本 R-TEST-SCOPE-01 表二「連線閘／登入流程／應用系統 token」列選測, 單一測試鎖內循序, 每個 mocha 為獨立行程(腳本 `tmp/perm-run01/run-e2e.mjs`)。標準圖一律比對模式, `git status --short test/pics` 為空(0 張改變)。

| 檔 | grep | 理由 | 過 | 敗 | 秒 |
|---|---|---|---|---|---|
| `test/e2e-init.test.mjs` | (全檔) | 登入流程／連線狀態畫面(E2E-007 含 peter 變體、E2E-008 部署方否決; 其餘標準圖比對) | 20 | 0 | 126 |
| `test/e2e-layout.test.mjs` | (全檔) | 版面煙霧(S3) | 6 | 0 | 210 |
| `test/e2e-grups.test.mjs` | `E2E-00[135]-` | S1 CRUD 煙霧 | 6 | 0 | 222 |
| `test/e2e-pemis.test.mjs` | `E2E-00[135]-` | S1 CRUD 煙霧 | 6 | 0 | 222 |
| `test/e2e-targets.test.mjs` | `E2E-00[135]-` | S1 CRUD 煙霧 | 6 | 0 | 221 |
| `test/e2e-users.test.mjs` | (全檔) | 使用者清單頁全檔(users 寫入; 登入識別) | 24 | 0 | 599 |
| `test/e2e-grups.test.mjs` | `E2E-005-` | 授權樹載體(getPermUserInfor 經應用系統 token) | 2 | 0 | 116 |
| `test/e2e-pemis.test.mjs` | `E2E-005-` | 授權樹載體 | 2 | 0 | 113 |
| `test/e2e-targets.test.mjs` | `E2E-005-` | 授權樹載體 | 2 | 0 | 109 |
| `test/e2e-rela-user-grup.test.mjs` | `E2E-005-` | 授權樹載體(對話框自行 updateUsers) | 2 | 0 | 120 |
| `test/e2e-external-rows.test.mjs` | `E2E-00[1-3]-` | 夾具經 /syncAndReplaceTabs(應用系統 token) | 6 | 0 | 79 |
| 合計 | | | 82 | 0 | |
