### 發現

找不到會造成錯誤結果或誤拒合法操作之處。

### 已檢視而未發現問題的範圍

- `recordPicks` 衝突判定(`src/js/refIdentity.mjs:199-206`): `picks.get(n) === null` 短路保護 `[...picks.get(n)].sort()` 展開, 不會拋錯; `null`/陣列兩分支正確; 同 ids 不衝突、異 ids/`null` 衝突、未有鍵則記錄; 空陣列與缺名稱皆視為 `[]`。RI-7 兩案(連續回填、同名衝突)與 E2E-037 皆守得住(移除判定即變紅)。
- `buildRefDecl`(`:226-239`): `picks` 非 `Map` 回退送出當下 `idsOfName`; `v === null` → `ids: null`; 陣列拷貝; RI-8 全綠。
- `parseRefDecl`/`countRefMismatch`(`:262-297`): `ids` 非字串陣列(含 `null`) → `null`, `countRefMismatch({decl:null})` → 1, 前端自檢攔下; 伺服端共用同一份 `refIdentity.mjs`, 亦拒收。
- 合法操作不誤拒: 同列編輯器內啟用→停用→再啟用只回填最終狀態(單次 `recordPicks`, 不衝突); 兩列同快照不衝突; 歷史同名多筆、懸空 `[]`、snap 缺名稱、快照後新建名稱皆 handled。
- `rebuildDraft` 於三 Vue 頁(`LayoutContentUsers/Grups/Pemis.vue`)皆 `vo.refPicks = new Map()` 歸零; 複製/貼上無記錄路徑回退送出當下 store, 與修正前一致。
- `sameIds`/排序/`null` 邊界: 比對前雙方皆 `.sort()`; `null` 值不展開; 原型鍵名以 `Map` 為鍵不誤判。

### 未檢視或無法判定的範圍

- 實機 E2E-037 之 `assignViaEditor` 是否每次都觸發 `recordPicks`(本次僅依程式碼與測試流程推演, 未跑測試)。
- `picks` 內若混入非本模組產出的 `undefined` 值之防禦性(推演層級, 輸入在正常流程受控)。
