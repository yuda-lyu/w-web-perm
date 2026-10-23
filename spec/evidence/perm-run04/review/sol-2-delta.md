#1 [嚴重度:中] 確定（讀碼及判準探測）：登入識別未變的外部轉後台操作，仍漏擋新撞值 — 位置 server/procCore.mjs:439 — 失敗情境：兩筆有效外部列為 {id:'K',from:'A',srcKey:'K'}、{id:'p',from:'B',srcKey:'K'}，lockExternalRows=false 時將第一列 from 改成 '' → loginIdOf 前後皆為 'K'，兩列均被判為未觸及而放行，首次形成後台／外部撞值 → 應拒收 loginIdCollision、零變更；登入仍會因多筆而拒絕 — 建議：觸及判定也比較外部／後台類別，補測 srcKey===id 及舊列缺 srcKey 的轉換。

#2 [嚴重度:中] 確定（讀碼及變異判準探測）：UL-013 宣稱涵蓋歷史撞值，但夾具沒有撞值 — 位置 test/unit-procCore-loginId.test.mjs:250 — 失敗情境：UL-013 使用 swap 種子；若錯改成未鎖定模式下所有有效列皆算觸及，現有案例仍無法辨別 → 真正含歷史撞值的原樣存檔卻會被錯拒 → 應有案例攔住此回歸 — 建議：另以 hist 種子搭配 lockExternalRows=false，驗證原樣送回及無關欄位修改可存，並確認資料結果。

#3 [嚴重度:中] 確定（讀碼及變異判準探測）：LI-020c 尚未守護後台 id 的精確空白比對 — 位置 test/unit-loginId.test.mjs:167 — 失敗情境：把 loginIdOf 的 id 回傳值錯改為 row.id.trim() → LI-020c 現有夾具的結果不變，但後台列 id=' K ' 搭配 token id=' K ' 會從命中一筆變成零筆 → 預期仍命中該列 — 建議：新增後台含前後空白 id 的正向登入案例，及去空白後不命中的反向案例。

#4 [嚴重度:低] 確定（讀碼）：規則帳本仍記載修改前的後台錯誤優先序 — 位置 sgud/rule/rulebook_sync.md:74 — 失敗情境：庫內後台列 K 停用、外部列 srcKey='K' 有效，送回 K 為啟用且 _isNew=true → 實際先回 saveNewRowExists；文件所載「撞值檢查先於 saveNewRowExists」則會預期 loginIdCollision → 文件應反映目前順序 — 建議：更新為新增列存在檢查及外部列守門之後、寫入之前。

其餘已核對：from 的 null／缺漏／空白、後台殘留 srcKey、數字 id 正規化、pickKeysOnly、外部列順序還原及歷史修復。LI-020b、LI-038、SC-L11 的現有斷言具有實質守護；目前外部列守門先回 saveExternalRowChanged，可接受。README 的跨來源唯一限制及 getPermUserInfor 使用內部 id，與實作一致。

未執行專案測試；獨立探測僅建立於 probe/sol/，既有檔案未修改。副本未附離線工具及完整依賴，其寫入行為與重複 id 經 diff 合併後的效果未證實。
REVIEW-END