# 規則帳本

本檔為套件設計與開發階段之規則帳本,為要求程式碼須長成什麼樣,或由規格產出之測試(項目/說明/流程)有哪些,包含軸、單一擁有者、已知限制、破壞性變更紀錄,以及對應是哪些測試檔案或指令等,由agent自行編列、擴充與維護.

- **2026-10-22 分拆**:原帳本 312KB,依類型拆為下列分冊(節之標題與內容不變,依規則編號 `R-…` 查找者請用下表找分冊);「已知缺口 / 待辦」屬現況,移至 `sgud/state/state.md`.新規則寫入對應分冊,某分冊再過長時依同規則續拆並更新本表.
- **2026-10-23 再分拆**:`rulebook_sync.md` 已達 73KB,依類型拆為 `rulebook_sync.md`(名稱唯一／引用連帶／外部匯入)、`rulebook_sync_lock.md`、`rulebook_sync_external.md`、`rulebook_sync_baseline.md` 四冊(只搬移不刪,14 個 `###` 節逐字不變,節號與標題不變;驗證:搬前後 `###` 節之位元組集合相等 72,219 B);多人同時編輯之新規則另立 `rulebook_concurrent.md`.
- **2026-10-23 perm-run03 站點變遷(各分冊通用,逐處不改原文)**:外部匯入核心自 `server/WWebPerm.mjs` 移至 `server/syncCore.mjs`,且改為依 `srcKey` 差異同步(R-IMPORT-01).各分冊中凡寫「`WWebPerm.syncAndReplaceTabs`」「`WWebPerm.mjs:syncAndReplaceTabs`」者,站點讀作 `syncCore.mjs:syncAndReplaceTabs`;凡描述「`delAll({ from })`＋insert」「`idOtherFrom`(跨 from 同 id,僅 targets 以 `idTaken` 保留)」「`rowBlank`(R-ORM-05 外部同步部分,srcKey 必填後不可達)」「未帶 id 依名稱對應／`buildSyncRowsNew`」「`countIdRenumber`(改 `countSrcKeyRenumber`)」之外部同步行為,一律以 R-IMPORT-01 為準,原文為歷史紀錄.後台整表寫入(`procCore.updateTabItems`)之規則不受影響.被引用實體身分宣告改強制必帶(R-REF-IDENTITY-01 規則 10),資料通道執行身分與寫入函數角色檢查見 R-CALLER-ID-01.
- **2026-10-24 perm-run04**:users 登入對應 `mappingBy='id'` 採 O1(外部列對 `srcKey`、後台列對 `id`,撞值三處拒; **R-MAPKEY-04** 在 `rulebook_sync.md`,R-IMPORT-01 規則 12 已結案); 警示橫幅 `syncWarnIdRenumber` 文案改為「同名異來源鍵」口徑.
- **2026-10-24 perm-run05**:登入識別值跨全表唯一、不論 isActive、含他來源(`server/keyCheck.mjs:findLoginIdClashDetail`; 匯入／後台存檔／登入同口徑),`getPermUserInfor` 之 `userId` 於 `mappingBy='id'` 依登入對應解析(外部列傳 srcKey; **R-MAPKEY-05** 在 `rulebook_sync.md`,取代 R-MAPKEY-04 規則 2～4 之「只計有效列」「他來源不在匯入端拒收」); `nameDupReport --mapping-by id` 列撞值組。
- **最上方之最高優先規則**:`R-PRINCIPLE-00`(決策原則)與 `R-AUTH-MERGE-00`(授權合併規則)在 `rulebook_principle.md`,動工前必讀.

## 分冊索引

| 類型 | 檔 | 所含之節 |
|---|---|---|
| 決策原則與授權合併 | `rulebook_principle.md` | R-PRINCIPLE-00 決策原則(使用者裁示,2026-10-21;最高優;R-AUTH-MERGE-00 授權合併規則(使用者裁示,2026-10-21;;R-AUTH-MERGE-01 授權合併規則之實作與守護(對應 R-AUTH-M;遇衝突收嚴＋提示:引用解析(c／d／e)、衝突提示、編輯器不丟引用、歷史同名、後 |
| 測試配置與測試輔助 | `rulebook_test.md` | 測試配置;測試輔助之生命週期(2026-10-14, ADR-026);測試輔助之規則: 外部列夾具之收尾與還原(2026-10-22 run09; 來;單一行程全跑之 DB 收尾對稱、授權資料共用解碼、欄位值純量(2026-10-20 run01); 測試讀後端 srLog 以檔案位置定位、不比對跨行程時鐘(2026-10-22 run10, R-SRLOG-MARK-01) |
| 改動範圍 → e2e 檔對照(中間輪選測) | `rulebook_testscope.md` | R-TEST-SCOPE-01 改動範圍 → e2e 檔對照表(2026-10- |
| 專案特有機制、打包與跨套件規格 | `rulebook_mechanism.md` | 專案特有機制;打包後之可用性(2026-10-14, X1; 對應 w-syslog 審計方案;〔跨套件規格〕(主控 2026-10-16 依使用者交辦寫入) |
| 權杖、寫入路徑與使用端物件 | `rulebook_security.md` | 權杖不外洩(2026-09-25, ADR-023; 對應 w-web-sso ;寫入路徑與資料通道(2026-10-14, ADR-026; w-serv-or;**呼叫者身分驗證: 資料通道執行身分完整驗證與寫入函數角色檢查(2026-10-23 perm-run03, R-CALLER-ID-01)**;迭代使用端傳入之物件(2026-10-20, R-OBJ-ITER-01; 對應 |
| 授權存檔與關聯對話框 | `rulebook_editor.md` | 授權存檔不變、無損表示、清單頁解碼、同步入口名稱(2026-10-20 run0;關聯對話框容錯、以身分配對、資料驅動屬性鍵(2026-10-21 run03,  |
| 名稱唯一、引用連帶與外部匯入 | `rulebook_sync.md` | R-NAME-UNIQ-01／02／03、R-MAPKEY-01／02(名稱唯一與對應鍵檢查; F-02／F-14; ADR-034)、R-MAPKEY-04(`mappingBy='id'` 外部列對 srcKey、後台列對 id; perm-run04)、R-MAPKEY-05(登入識別值跨全表唯一不論 isActive、`getPermUserInfor` userId 依登入對應; perm-run05)、R-REF-CASCADE-01(引用連帶:改名級聯與刪除連帶清理; run06, ADR-036)、R-IMPORT-01(外部匯入;**2026-10-23 perm-run03 起依 `srcKey` 差異同步,`server/syncCore.mjs`**);另有「分拆索引」指向下列三冊 |
| 寫入取鎖與表鎖階層 | `rulebook_sync_lock.md` | R-WRITE-LOCK-01(外部同步與後台整表寫入共用互斥)、R-WRITE-LOCK-02(取鎖階層與單一取鎖函數; 2026-10-23 perm-run01 改共用核心之鎖) |
| 外部列受保護與離線維運工具 | `rulebook_sync_external.md` | R-EXT-OWN-01(外部列守門; run07, ADR-037)、R-SHIP-TOOLS-01(離線維運工具核心須在出貨位置; run08) |
| 載入基準、草稿保留與重載旗標 | `rulebook_sync_baseline.md` | R-BASELINE-01(載入基準; run07／run11, 2026-10-23 perm-run01 改用共用核心 h1)、R-DRAFT-KEEP-01(草稿保留; 增編輯器草稿與對話框重建)、R-RELOAD-GUARD-01(程式端重載旗標; 2026-10-23 run12) |
| 多人同時編輯之落地規則 | `rulebook_concurrent.md` | 2026-10-23 perm-run01 新增: 寫入契約(欄位白名單、名次、空值等價)、全部寫入入口共用同一鎖、存檔回傳列即時更新基準、對話框主體身分驗證(R-SUBJECT-ID-01; perm-run02 起伺服端強制)等; perm-run02 增: 被引用實體身分(R-REF-IDENTITY-01: 清單頁指派欄之正向引用宣告 `opt.refs`、被引用表鎖在本表外層、targets 以 id 為身分) |
