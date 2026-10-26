# perm-run04 修前紅證據(2026-10-24)

新測試先寫、先在**未改產品碼**的狀態下跑一次(`git` 工作樹的 `server/` 為 perm-run03 提交狀態),再實作、再跑。下表為修前結果(quiet-run 日誌 `tmp/quiet-run/20261024-0158*` ,收尾時已清,摘要保存於此)。

| 測試檔 | 修前 | 修後 | 修前紅的案例(代表) |
|---|---|---|---|
| `test/unit-loginId.test.mjs`(新) | 載入失敗: `SyntaxError: The requested module '../server/keyCheck.mjs' does not provide an export named 'findLoginIdClash'` | 全過 | 三個純函數不存在 |
| `test/unit-procCore-loginId.test.mjs`(新) | 11 案中 5 敗: UL-001、UL-004、UL-007、UL-008、UL-009 | 11 過 | 後台存檔未檢查撞值,回 `saveTabItemsSuccess`(期望 `loginIdCollision`);UL-009 無 `updateTabItems-ckKey-error` log |
| `test/unit-syncCore.test.mjs` SC-L1～L10(新) | 10 案中 6 敗(SC-L1、L2、L4〔後半〕、L8〔首拒〕、L9、L10) | 全過 | 匯入未檢查撞值,批次被接受(`{"nAdd":1,…}`)或 log 缺 |
| `test/api-mapKeyId.test.mjs`(新,真後端) | 10 案中 7 敗(MI-001、002、005、006、007、009、010);3 過(MI-003、004、008: 遷移前舊列、後台列、email／name 模式——不應被改變的行為,守護不被過度拒收) | 10 過 | MI-001 `cannotGetUserFromPerm`(外部使用者以 srcKey 登入失敗);MI-002 外部列以內部 id 反而登入成功(應查無);MI-005／006 撞值未被拒;MI-007 命中 2 筆卻取首筆登入成功;MI-010 外部系統管理者資料通道 `permission denied` |

「修前綠」的案例(SC-L3、L5、L6、L7、MI-003、004、008、UL-002、003、005、006、010、011)是**不應被改變的行為**(邊界、不變、不過度拒收),修前後皆綠屬預期。

範圍二(橫幅文案)的修前紅:`unit-externalUi` EU-405 於舊文案(`git show HEAD:server/procLang.mjs` 之 `syncWarnIdRenumber`)下不成立——舊 eng 含 `renumbered ids`、`omit ids`,舊 cht 含 `保持 id 穩定或不帶 id`,且不含 `srcKey`／`來源鍵`;變異 M10(把新文案改回舊口徑)被 EU-405 抓到(見 `mutation-results.md`)。
