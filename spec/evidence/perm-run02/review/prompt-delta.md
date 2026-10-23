# 功能正確性審查(增量):w-web-perm「被引用實體身分檢查」採納外審後之修正

你是獨立審查者。上一輪外審指出:前端「選取記錄」以名稱為鍵、跨列共用,兩列先後選取同名群組而選取之間該群組被刪除並以同名重建(id 不同)時,後一列之選取以新快照**覆蓋**前一列之記錄,使前一列之授權被同名新實體接管而宣告仍「相符」。本次修正即針對此點。請只審**這次修正**及其測試,找出會造成錯誤結果或誤拒合法操作之處。誠實回報:找不到就說找不到。

## 檔案(工作目錄為副本,路徑相對於工作目錄)

- `DIFF-delta.patch`:`src/js/refIdentity.mjs` 相對修正前之差異(`recordPicks`、`buildRefDecl` 兩函數與註解)。
- `src/js/refIdentity.mjs`(完整檔,含 `parseRefDecl`、`countRefMismatch`、`sameIds`)。
- 測試:`test/unit-refIdentity.test.mjs` 內 `RI-7` 兩案(連續回填、同名衝突);`test/e2e-concurrent-edit.test.mjs` 內 E2E-037(搜尋 `E2E-037` 或 `same-name-two-rows`)。
- 呼叫端(未改,供對照):`LayoutContentUsers.vue`、`LayoutContentGrups.vue`、`LayoutContentPemis.vue` 之 `showVeC*ById`(呼叫 `recordPicks`)與 `doSave*`(呼叫 `parseRefDecl(buildRefDecl(...))` 與 `countRefMismatch`);伺服端 `server/procCore.mjs`(`parseRefDecl`、`checkRefIdentity`)。

## 修正內容(摘要)

1. `recordPicks`:同一名稱先後被選取(不同列,或同列取消後重選)而選取當時之 id 陣列(排序比對)不同 → 該名稱記為衝突(Map 值 `null`),且衝突不自行解除;id 陣列相同則不是衝突。
2. `buildRefDecl`:衝突名稱之宣告 `ids` 為 `null`(其餘不變)。
3. `parseRefDecl(宣告)` 遇 `ids` 非字串陣列 → 回 `null`;前端 `countRefMismatch({ decl: null })` 回 1 → 前端自檢不放行(警告框 `saveRefChanged`、請求不送出)。伺服端對此類宣告亦以格式不合拒收。

## 請特別檢視

A. 衝突判定是否會**誤拒合法操作**:例如同一列在同一個編輯器開啟期間內啟用→停用→再啟用(只有最終狀態被回填)、兩列選取同一實體而快照相同、歷史同名多筆(id 陣列有多個)、懸空名稱(空陣列)、`snap` 缺名稱(視為空陣列)與快照之後才新建之名稱。
B. 衝突是否**漏判**:是否仍有路徑讓兩次選取對應不同實體而宣告相符(例如 picks 在草稿重建時是否一定歸零〔`rebuildDraft`〕;複製列、貼上等無記錄之路徑退回送出當下之 store 是否與修正前一致)。
C. `sameIds`、排序、`null` 值之處理是否有型別或邊界錯誤(例如 `picks.get(n)` 為 `null` 時之 `[...]` 展開、`buildRefDecl` 對 `picks` 非 Map)。
D. 測試是否守得住:若把 `recordPicks` 之衝突判定拿掉,`RI-7` 與 E2E-037 是否會變紅?E2E-037 之流程是否真的構成「兩列、同名、選取之間被取代」且前端自檢攔下(請求未送出)?
E. 不得改變:除上述外,`refIdentity.mjs` 之其餘行為與伺服端行為不變。

## 回報格式

用繁體中文,Markdown;`### 發現`(每條:`#<序號> [高|中|低] <檔>:<行> — 一句話`;情境、後果、依據、把握度〔確定/推演/不確定〕、建議)、`### 已檢視而未發現問題的範圍`、`### 未檢視或無法判定的範圍`。每一條自己用程式碼證成。最終完整回報就是你最後一則回覆;不要寫成檔案。控制在 15 分鐘內。
