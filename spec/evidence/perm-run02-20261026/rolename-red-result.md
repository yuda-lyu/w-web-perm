# `unit-roleName` 修前紅實證(2026-10-26 perm-run02)

原始摘要因斷言訊息逐字含舊稱, 不入證據(否則違反 RN-S3); 此處只記結果。

- 副本: `git archive HEAD`(檢查點 `432bca6`)完整解到 `./tmp/perm-run02/head/`, 放入本輪之 `test/unit-roleName.test.mjs`。
- 指令: `GIT_DIR=C:/nonexistent-gitdir node C:/opensrcOper/tools/quiet-run.mjs --lock --name perm-run02-rolename-red -- npx mocha --no-parallel tmp/perm-run02/head/test/unit-roleName.test.mjs --reporter dot --timeout 60000`(設 `GIT_DIR` 為不存在路徑, 使 RN-S3 之 `git ls-files` 失敗而走檔案列舉退路)。
- 結果: exit 4, 耗時 1 秒, **4 passing／4 failing**。

| 案 | 結果 | 原因(HEAD 舊碼) |
|---|---|---|
| RN-001、RN-002、RN-003 | 綠 | perm-run01 已改欄位名與 `userNotAdmin`(該檢查點已含) |
| RN-003b | 紅 | 語系鍵 `anUnexpectedErrorOccurred`、`srcKeyConflict` 之 cht 文字含舊稱 |
| RN-003c | 紅 | `anUnexpectedErrorOccurred` 之 cht 尾字串仍為「請洽」+舊稱 |
| RN-S1 | 紅 | src／server／srv.mjs 之可執行碼命中舊稱 |
| RN-S2 | 綠 | 掃描器自測(不依賴 repo 內容) |
| RN-S3 | 紅 | git 追蹤之文字檔(退路列舉)仍含舊稱與單獨之「管理＋者」 |

修後(現行工作樹): 8 passing／0 failing(摘要 `run-summaries/*rolename.summary.txt`、`*final-rolename.summary.txt`)。
