# perm-run05 變異驗證結果(凍結碼終版)

日期: 2026-10-24。做法: 對 `server/` 單點施加變異 → 跑對應測試 → 一律還原 → md5 回驗(harness: `mutation-raw/mutate.mjs`; 每個 `find` 須在目標檔恰命中 1 處否則 INVALID)。

- **unit 層**: 在 repo 內副本(`tmp/perm-run05/mut/`, 含 `server/`、`src/`、`test/tools/` 與 5 個單元測試檔; node_modules 由 repo 根解析)施加變異, 跑 `unit-loginId`、`unit-procCore-loginId`、`unit-syncCore`、`unit-nameDupReport`、`unit-keyCheck`(基準 194 條全綠)。
- **api 層**: 在 repo 本身(`quiet-run --lock`, 無其他測試鏈)施加變異, 跑 `api-mapKeyId`、`api-getPermUserInfor`(真後端; 基準 24 條全綠); 每輪結束 6 個 server 檔 md5 與變異前相同(`RESTORED-OK`)。
- 歷程: 外審 sol 第一輪／第二輪採納後有改碼與補測試, 故以凍結碼重跑全集(原始 JSON 在 `mutation-raw/final-*.json`; 早期輪次之 `mut-*.json` 為採納前之結果, 留作對照)。

## 結果: 33 個變異, 全部被至少一層測試抓到

| id | 變異(對應「修前口徑」或相鄰缺陷) | unit | api | 抓到之測試(節選) |
|---|---|---|---|---|
| K1 | 登入查找兩次 select 帶 `isActive:'y'`(**只計有效列**, 修前口徑) | 抓到 | 抓到 | LI-016b、LI-021; MI-012 |
| K7 | 多筆時僅一列有效則放行(`pickUniqueUser(hits.filter(active))`) | 抓到 | 抓到 | LI-016b; MI-012 |
| K8 | 恰 1 筆停用仍登入該列 | 抓到 | 抓到 | LI-014、LI-016c、LI-020c; MI-009 |
| K2 | 撞值只計有效列(修前口徑) | 抓到(9) | — | LI-033／035／036、UL-003／005、SC-L4 |
| K3 | 撞值不含他來源外部列(`otherFrom` 不判) | 抓到(9) | — | LI-034／035／035b、SC-L3／L4／L4b |
| K4 | 同一來源之兩外部列也算撞值 | 抓到(4) | — | LI-035、LI-035c、ND-005b |
| K5 | 兩後台列也算撞值 | 抓到(1) | — | LI-035 |
| K6 | 舊外部列(無 srcKey)不參與登入識別 | 抓到(7) | — | LI-003／013／034、SC-L4b、ND-005b |
| K9 | 所有列皆視為被觸及(歷史撞值也擋) | 抓到(14) | — | LI-030～036、UL-004／006／015 等 |
| K10 | 同一來源 claimTwice 形不算撞值(外審 #1 修前口徑) | 抓到(3) | — | LI-035c、UL-017 |
| K11 | claimTwice 形之 kind 誤標 | 抓到(2) | — | LI-035c |
| K12 | claimTwice 形只在雙方皆有效時算撞值(外審第二輪#2 改壞範例) | 抓到(2) | — | LI-035c、UL-017 |
| S1 | 匯入端不檢查登入識別撞值 | 抓到(10) | 抓到(3) | SC-L1／L3／L4／L4b、SITE-LI-002; MI-005／011／013 |
| S3 | 匯入端 reason 恆為 `srcKeyIsAdminId` | 抓到(1) | — | SC-L3 |
| S4 | 匯入端只與他 from 之有效列比對(修前口徑) | 抓到(1) | — | SC-L4 |
| P1 | 後台存檔不檢查登入識別撞值 | 抓到(10) | 抓到(3) | UL-001／003／005／007／008／009／017; MI-006／009／016 |
| P2 | 被觸及簽章不含來源 | 抓到(1) | — | UL-016(初跑倖存, 補測試後抓到) |
| P3 | 庫內舊列只取有效者(停用改啟用算被觸及) | 抓到(1) | — | UL-004 |
| P4 | 後台存檔所有列皆視為被觸及 | 抓到(5) | — | UL-004／006／009／014／015 |
| P5 | 後台存檔 reason 不分 `srcKeyClaimTwice` | 抓到(1) | — | UL-017 |
| W1 | `getPermUserInfor` 恢復只以內部 id 查找(**修前口徑**) | — | 抓到(3) | MI-014、API-getPermUserInfor-007／008 |
| W2 | `getPermUserInfor` 解析命中多筆不拒絕 | — | 抓到(1) | MI-014 |
| W3 | `getPermUserInfor` 於 email／name 模式亦解析 | — | 抓到(2) | MI-015 |
| W4 | `getPermUserInfor` 查無改 reject `userIdNoPermrules` | — | 抓到(2) | API-getPermUserInfor-005、MI-014 |
| W5 | `/api/getPerm` 亦經 `resolvePermUserId` | 抓到(1, 靜態) | 抓到(1) | SITE-LI-005; MI-001(補驗 `msg.user.id` 後) |
| W7 | `getTokenUser` 多筆不拒絕 | 倖存(接線在 api 層) | 抓到(2) | MI-007、MI-012 |
| W8 | `getPermUserInfor` 不採用已解析之列、改以內部 id 重讀 | 抓到(1, 靜態) | 倖存(行為等價, 僅競態才異) | SITE-LI-005 |
| W9 | `resolvePermUserId` 多筆時不記 srLog | — | 抓到(1) | MI-014(srLog 斷言) |
| W10 | `resolvePermUserId` 之 srLog 記查詢值 | — | 抓到(1) | MI-014(srLog 斷言) |
| W11 | `resolvePermUserId` 命中後再讀使用者(外審第二輪#1 改壞範例) | 抓到(1, 靜態) | 倖存(同 W8) | SITE-LI-005(`await` 計數、不得呼叫 getGenUser／select) |
| N1 | 離線稽核不列登入識別撞值 | 抓到(1) | — | ND-005b |
| N2 | 離線稽核只列有效列之撞值 | 抓到(1) | — | ND-005b |
| N3 | 離線稽核不列同一來源之重複(外審 #5 修前口徑) | 抓到(1) | — | ND-005b |

「本輪任務指定之兩項」: **還原『只計有效列』**(K1／K2／K7／S4 四種寫法)與 **`getPermUserInfor` 回到只認內部 id**(W1)皆被抓到。

倖存說明: W7 於 unit 層無接線測試(`getTokenUser` 在 `WWebPerm.mjs` 閉包內), 由 api 層 MI-007／MI-012 抓到; W8／W11 為「解析後以 id 重讀」之競態改壞, 循序行為與修正碼等價, api 層不可辨, 以 SITE-LI-005 靜態斷言(傳入解析出之列、`resolvePermUserId` 內恰一個 `await` 且不呼叫 `getGenUser*`／`select`)守護; 競態本身不易在行為層穩定重現(外審第二輪#1 建議之「可控制查詢交錯之 ORM 替身」因解析函數為 `WWebPerm` 閉包內函數而未做, 列為已知限制)。曾列之變異 W6(`getGenUserByUserId` 非字串守門)隨守門移除而作廢。

證據: 逐變異原始結果與 harness 存於 `spec/evidence/perm-run05/mutation-raw/`(`final-mut-unit.json`、`final-mut-api.json`、`final-mut-api-w14.json` 為凍結碼終版; `mut-*.json` 為採納外審前之早期輪次, `mutate.mjs` 為 harness). 重跑: 先以 `cp` 建 repo 內副本(unit)或在 `quiet-run --lock` 下對 repo(api), `node mutate.mjs <root> <unit|api> <輸出json> [id,...]`.
