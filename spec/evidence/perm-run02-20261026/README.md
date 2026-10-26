# perm-run02 證據: 全 repo 角色用詞統一為「系統管理者」(2026-10-26, 任務 20261026143318)

使用者 2026-10-26 裁示: 全系統指系統管理者角色之詞一律為「系統管理者」(w-web-sso、w-web-perm、w-web-api、w-web-task 同步)。規則見規則帳本 R-ROLE-NAME-01(`sgud/rule/rulebook_security.md`)與 ADR-042(`spec/設計要點與取捨.md`)。

本目錄與本目錄之腳本不以字面值寫出舊稱(以「舊稱」「單獨之「管理＋者」」指稱), 否則自身即違反 `test/unit-roleName.test.mjs` 之 RN-S3。

## 規則(機械替換, 腳本 `scripts/unify.mjs`)

| 類 | 改前 | 改後 | 次數 |
|---|---|---|---|
| K1 | 「系統」+舊稱 | 系統管理者 | 169 |
| K2 | 單獨舊稱(前一字串非「系統」) | 系統管理者 | 1,515 |
| K3 | 單獨之「管理＋者」(前一字串非「系統」) | 系統管理者 | 335 |
| K4 | 「舊稱+者」連用(如「被升為…者」之「員者」) | 系統管理者(避免疊字「者者」) | 計入 K1／K2(原 2 處) |
| 合計 | | | 2,019 處／132 檔(git 追蹤之文字檔; 含建議書留存檔 6 處) |

各頂層目錄之處數: README 3、server 49、src 12、srv.mjs 15、test 250、spec 803、spec/evidence 641、sgud 143、docs 90、dist 7、建議書留存檔 6。

- 二進位判定之檔(含 NUL 位元組, 無法無損以 UTF-8 解碼者: `spec/evidence/perm-run02-20261024/red-old-api-full.log`、`spec/evidence/perm-run02-20261024/review/round2-delta.patch`)以 latin1 位元組樣式替換, 位元組外不動。
- 檔案之換行(LF／CRLF)與其他位元組不動: 改後 `git diff --numstat` 除新寫之 `test/unit-roleName.test.mjs` 外皆為增刪行數相等。
- 英文等其他語系、欄位鍵名 `isAdmin`、語系鍵名 `userNotAdmin`、程式識別字、資料(`db/`)、標準圖(`test/pics/`)不在替換範圍。

## 是否有「其他角色」之詞

盤點(`scripts/k3ctx.mjs` 對改前版本統計單獨之「管理＋者」之前後文; `scripts/prefix1.mjs` 統計前一字為漢字者以找複合詞): 335 處單獨之「管理＋者」全部指「能讀寫四表、進權限後台、呼叫寫入函數之人或身分」, 無其他角色。後文前列(改前): 「寫入 RPC」141、「無法存任何變更」10、「改動之限制項」9、「存檔即撤銷有效授權」7、「寫入移除外部列」7、「在對話框內…」6、「改過 mode」6、「…收尾」4、「無法停用…」4 等; 前文前列: 「未被」26、「經」(經…寫入 RPC)、「以」(以…寫入 RPC)、「後台」6、「一位／另一位」7 等。單獨舊稱之前一字複合詞候選(級、部、中、間、建、即、洽、台、權…)逐一檢視: 「函數級…檢查」「外部…(外部同步來源之系統管理者列)」「啟用中…」「後台…」「全權…」皆同指系統管理者。**列明為其他角色者: 無。**

## 逐行清單

- `replace-inventory.tsv`: 欄位 file／line／kinds(K1x次數+K2x次數+K3x次數)／after(改後之新形, 截 140 字; 二進位判定之兩檔不逐行)。
- `replace-inventory.per-file.json`: 逐檔 K1／K2／K3 次數與編碼。

## 重驗指令(皆期望 0 命中; 以 PCRE 碼點表示, 指令不含字面值)

```
git grep -nP "\x{7ba1}\x{7406}\x{54e1}"
git grep -nP "(?<!\x{7cfb}\x{7d71})\x{7ba1}\x{7406}\x{8005}"
git grep -nP "\x{7cfb}\x{7d71}\x{7cfb}\x{7d71}|\x{7ba1}\x{7406}\x{8005}\x{8005}"
```

另: 主控以字面值 `git grep -n "<舊稱>"` 重跑亦為 0。自動化: `npx mocha test/unit-roleName.test.mjs`(RN-S3)。

## 標準圖(2 張, 授權範圍: 差異僅為用詞文字)

機械替換連同測試檔中**輸入到 UI 之測試字串**(`test/e2e-external-rows.test.mjs` 之 `DRAFT`／`AFTER` 草稿文字)一併改字, 使 `external-rows` E2E-016-1 之 eng／cht 兩張首輪紅(diff 643 px > 100)。處置: 將該流程以 `E2E_BASELINE_OUT_DIR` 全產到暫存目錄(26 張, exit 0), 與 `test/pics` 逐像素比對(腳本沿用 `spec/evidence/perm-run01-20261026/scripts/cmpdirs.mjs`)——

| 類 | 張數 | 處置 |
|---|---|---|
| 位元相同 | 24 | 不動(含 perm-run01 已更新之表頭字形 cht 7 張, 此次仍同) |
| 差異外框僅為輸入框內該行文字: `external-rows-cht-E2E-016-1-stale-banner`(精確差異 1,056、pixelmatch 643、外框 x 721–852 y 319–329)、`external-rows-eng-E2E-016-1-stale-banner`(同數, y 337–347) | 2 | 覆蓋 |
| 其他差異 | 0 | — |

目視(`diff/*.diff.png` 三列放大: 上＝舊圖、中＝新圖、下＝差異): 舊圖為「A」＋舊稱＋「未儲存之說明」, 新圖為「A系統管理者未儲存之說明」, 輸入框、邊框、橫幅、表頭與其餘畫面位元相同。清單: `cmp-regen-external-rows-vs-pics.json`。覆蓋後 `e2e-external-rows` 全檔於更新後之標準圖上重跑(結果見報告)。

其他 e2e 流程之測試檔本輪替換僅及註解、標題與期望(0 行輸入資料變更): `e2e-users`、`e2e-init`、`e2e-rela-user-grup` 於替換後全綠且 `[baseline-headroom]` 為 0。

## 特殊處理

1. **建議書留存檔** `建議w-web-perm修正.md`(rddmanager 提出, perm-run01 之檢查點已追蹤): 機械改字後其「改為」前後同字, 已於檔首加留痕註記說明原意與原文所在(git 歷史); 未刪除、未改檔名。
2. **逐字引述之使用者 2026-10-24 裁示**(ADR-039、`流程_應用啟動與登入.md`、`rulebook_security.md`、審查者提示詞等): 稱呼處機械改字、其餘字句不動, ADR-042 決定 3 記載。
3. **`dist/`、`docs/`**: 文字替換(與重建等價, 見 ADR-042 決定 4)。

## 其他檔案

- `run-summaries/`: 本輪各測試之 `quiet-run` 摘要(unit＋api 全跑、`unit-roleName` 兩次、四個 e2e 檔、`external-rows` 暫存產圖)。目錄名避開被 `.gitignore` 忽略之 `logs`。
- `rolename-red-result.md`: `unit-roleName` 對 HEAD 舊碼副本之修前紅結果(原始摘要含舊稱逐字, 不入證據)。
- `diff/`、`cmp-regen-external-rows-vs-pics.json`: 標準圖 2 張之差異放大與全量比對。

## 腳本

- `scripts/unify.mjs <dry|apply> [tsv]`: 替換主體(以拆開之片段組出舊稱, 無字面值)。
- `scripts/k3ctx.mjs`: 單獨之「管理＋者」前後文統計(讀 HEAD 版本)。
- `scripts/prefix1.mjs`: 單獨舊稱與單獨之「管理＋者」之前一漢字統計。
