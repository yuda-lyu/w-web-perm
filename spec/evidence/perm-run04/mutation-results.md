# perm-run04 變異驗證(2026-10-24,**凍結碼**最終數字)

作法: `tmp/perm-run04/mutate.mjs`(收尾時已清;核心是「`find` 須在檔內恰出現 1 次 → 暫時改壞 → 跑對應測試 → `finally` 無條件還原 → 結束比對受測檔 md5」)。
- 單元層(M1～M21 之 `unit` 項)在**副本** `tmp/perm-run04/mutcopy`(repo 內、`node_modules` 由上層解析)上執行——e2e 鏈進行中不得暫時改動 repo 內 `server/`(每個 e2e 檔會重啟後端、載入被改壞之碼); 
- 真後端／e2e 層(M1b、M2b、M3b、M10e)在 repo 本體、`quiet-run --lock` 內、於凍結碼上執行。
- 全部 25 個變異(含 b／e 版)`failing > 0`;每批結束皆 `RESTORED-OK`(受測檔 md5 與變異前相同,`git diff --stat -- server` 與變異前一致)。

| # | 變異(暫時改壞之處) | 跑的測試 | 結果(敗/過) | 抓到的代表案例 |
|---|---|---|---|---|
| M1 | `syncCore.mjs`:拿掉匯入端撞值檢查(`if (false && …)`) | `unit-syncCore`＋`unit-loginId` | 7 敗／107 過 | SC-L1、L2、L4(後半)、L8、L9、L10、L11(c) |
| M1b | 同 M1(真後端) | `api-mapKeyId` | 1 敗／9 過 | MI-005 |
| M2 | `procCore.mjs`:拿掉後台存檔撞值檢查 | `unit-procCore-loginId`＋`unit-loginId` | 7 敗／41 過 | UL-001、004、007、008、009、012、014 |
| M2b | 同 M2(真後端) | `api-mapKeyId` | 1 敗／9 過 | MI-006 |
| M3 | `findLoginUsers`:id 模式改回只對 id(不查 srcKey) | `unit-loginId` | 9 敗／24 過 | LI-011、012、017… |
| M3b | 登入查找改回只以 `id` 查(真後端;**即「改回只對 id」**) | `api-mapKeyId` | 6 敗／4 過 | MI-001(外部使用者以 srcKey 無法登入)、MI-002、MI-006、MI-010… |
| M4 | `loginIdOf`:外部列也回 `id`(不看 `srcKey`) | `unit-loginId` | 9 敗／24 過 | LI-002、LI-011… |
| M5 | `findLoginIdClash`:停用列也參與 | `unit-loginId`＋`unit-syncCore`＋`unit-procCore-loginId` | 7 敗／122 過 | LI-033、SC-L4、UL-003… |
| M6 | `procCore`:所有列皆視為被觸及(歷史撞值也擋) | `unit-procCore-loginId` | 3 敗／12 過 | UL-006、UL-009、UL-015 |
| M7 | `findLoginUsers`:多筆取首筆(不拒絕) | `unit-loginId` | 3 敗／30 過 | LI-015、LI-016、LI-016b |
| M8 | `loginIdOf`:拿掉「遷移前舊外部列暫以 id」過渡規則 | `unit-loginId` | 2 敗／31 過 | LI-003、LI-013 |
| M9 | `findLoginUsers`:email／name 也走 id 路徑 | `unit-loginId` | 2 敗／31 過 | LI-018、LI-019 |
| M10 | `procLang`:橫幅文案退回舊口徑(重編 id) | `unit-externalUi` | 1 敗／28 過 | EU-405 |
| M10e | 同 M10(cht 文案),跑 e2e 比對模式 | `e2e-external-rows --grep E2E-010` | 1 敗／1 過(cht 失配、eng 未改) | 語意斷言(`LIT.warn`)與新標準圖皆失配 |
| M11 | `findLoginIdClash`:拿掉後台→外部方向 | `unit-loginId`＋`unit-procCore-loginId` | 15 敗／33 過 | LI-031、UL-001… |
| M12 | `findLoginUsers`:不以 `loginIdOf` 複判 | `unit-loginId` | 4 敗／29 過 | LI-011、LI-017… |
| M13 | `procCore`:被觸及判定退回「id 是否存在於庫內有效列」(外審 sol#2 修正前之寫法) | `unit-procCore-loginId` | 2 敗／13 過 | UL-012、UL-014 |
| M14 | `findLoginUsers`:第二次查詢失敗被吞成空結果(sol#4) | `unit-loginId` | 1 敗／32 過 | LI-020b |
| M15 | `loginIdOf`:`srcKey` 去前後空白(sol#5) | `unit-loginId` | 1 敗／32 過 | LI-020c |
| M16 | `findLoginIdClash`:啟用判準放寬為接受 `'Y'`(sol#5) | `unit-loginId` | 1 敗／32 過 | LI-038 |
| M17 | `syncCore`:撞值檢查移到依 `srcKey` 配對之後(sol#6) | `unit-syncCore` | 1 敗／80 過 | SC-L11 |
| M18 | `procCore`:users 缺 id 之新增列被丟棄(sol#3) | `unit-procCore-loginId` | 1 敗／14 過 | UL-010 |
| M19 | `procCore`:被觸及判定只比登入識別之值、不比類別(sol 第二輪#1) | `unit-procCore-loginId` | 1 敗／14 過 | UL-014 |
| M20 | `procCore`:`lockExternalRows` 為假時所有有效列皆視為被觸及(sol 第二輪#2) | `unit-procCore-loginId` | 1 敗／14 過 | UL-015 |
| M21 | `loginIdOf`:後台列 id 去前後空白(sol 第二輪#3) | `unit-loginId` | 1 敗／32 過 | LI-020d |

任務書要求的三組:「拿掉撞值檢查之任一處」＝匯入(M1／M1b)、後台存檔(M2／M2b)、登入多筆拒絕(M7;登入撞多筆之真後端案例為 MI-007,另有既有 `api-mapKey` MK-010);「改回只對 `id`」＝M3／M3b。皆被抓到。
