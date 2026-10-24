# perm-run01(2026-10-24 輪)變異驗證

方法: `mutate.mjs` 暫時整串取代一處原始碼(須恰命中 1 處) → 經 `quiet-run --lock` 跑指定測試 → 無論結果必還原並以 SHA1 回驗(`restored: true`)。腳本與原始 JSON 在本目錄(`mutate.mjs`、`runMutations.mjs`、`feMutations.mjs`、`mutation-results*.json`)。「被抓到」＝測試離開碼非 0。

## 後端(`runMutations.mjs`)

| # | 變異 | 跑的測試 | 結果 |
|---|---|---|---|
| M1 | 拿掉連線閘之角色檢查(`checkToken` 改回 `getAndVerifyClientUser`) | api-adminOnly＋unit-adminOnlySite | 抓到(22 敗) |
| M2 | 拿掉反查之角色檢查(`getUserIdByToken` 改回 `getAndVerifyClientUser`) | 同上 | 抓到(4 敗) |
| M3 | 拿掉後台登入之角色檢查(`/api/getUserByToken` 改回 `getAndVerifyClientUser`) | 同上 | 抓到(5 敗) |
| M4 | 核心關卡不檢查角色(`adminOnly && !isAdmin` 恆假) | 同上 | 抓到(26 敗) |
| M5 | 角色恆為管理員(`let isAdmin = true`) | 同上 | 抓到(26 敗) |
| M6 | 過度收緊: `/api/getPerm` 也要求管理員 | 同上 | 抓到(3 敗) |
| M7 | `requireAdmin` 恆通過 | unit-adminOnlySite | 抓到(AOS-S6) |
| M8 | `isAdminRow` 不檢查 `isActive` | unit-adminOnlySite | 抓到(AOS-001) |
| M9 | `isAdminRow` 改認繼承屬性 | unit-adminOnlySite | 抓到(AOS-001c) |
| M10 | 角色改於部署方之後才判定 | unit-adminOnlySite | 抓到(AOS-S5) |
| M11 | 範圍二: users 不檢查同批重複 id | WV-DUPID＋api-batchIdDup | 抓到(6 敗) |
| M12 | 範圍二: pickKeysOnly 不預檢送入列 | 同上 | 抓到(2 敗) |
| M13 | 範圍二: 預檢不做數字／字串同值正規化 | 同上 | 抓到(1 敗) |
| M14 | 範圍三: `isSameFile` 退回 Number inode | unit-refAudit RA-037 | 抓到(2 敗) |
| M15 | 範圍三: `isSameFile` 不比 `dev` | 同上 | **初版倖存**(`mutation-results.json` 記 `caught:false`); 補 RA-037b 之 dev 斷言後抓到(`mutation-results-M14M15.json`) |
| M16 | `requireAdmin` 改回不判角色 | unit-procCore-external SITE-EX-013 | 抓到 |
| M17 | 外審 sol#3: `/api/getPerm` 驗證後以 id 重讀 | api-adminOnly＋unit-adminOnlySite | 抓到(2 敗: AOS-S4、AO-E2) |
| M18 | 外審 sol#2: 部署方收到原物件而非副本 | 同上 | 抓到(2 敗: AOS-S5、AO-E1) |
| M19 | 外審 sol#6: `isSameFile` 路徑比對所有平台不分大小寫 | unit-refAudit RA-037 | 抓到(RA-037d) |
| M20 | 外審 sol#7: `isSameFile` 拿掉 realpath 判定 | 同上 | 抓到(RA-037e; 以目錄 junction 驗證, 此環境檔案符號連結 EPERM) |

## 前端(`feMutations.mjs`; 每個變異重建 dist 後跑 e2e-init E2E-007 ×2 語系, 結束後以還原之原始碼重建 dist)

| # | 變異 | 結果 |
|---|---|---|
| F1 | `App.vue:loginError` 拿掉 `userNotAdmin` 時之 `return`(仍轉址) | 抓到(2 敗) |
| F2 | `mUI.mjs:kpFallback` 之 `csErrNotAdmin` 英文文字為空 | 抓到(1 敗, eng) |
| F3 | `loginError` 不辨識 `userNotAdmin`(一律 `csErrLogin`＋轉址) | 抓到(2 敗) |

## 修前紅(對應完成條件 1)

`api-adminOnly` 修前 25 敗／7 過、`WV-DUPID` 修前 users 5 敗、`RA-037b／c` 修前 2 敗, 見 `red-evidence.md`。
