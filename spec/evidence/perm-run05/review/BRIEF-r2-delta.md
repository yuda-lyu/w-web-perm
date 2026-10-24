# 增量審查簡報(perm-run05 第二輪: 採納第一輪意見後之改動)

你是獨立審查者。這是同一功能的**增量**審查:第一輪(你或另一位審查者)已提出 10 條意見,實作者採納後改了程式、測試與文件。請只審下列「第一輪之後的改動」是否正確、是否引入新問題,並檢查有沒有同類遺漏。
本資料夾是一份**可丟棄之副本**(已含改動後的檔案;`change.patch` 為相對於本功能開始前之完整差異,不是只有增量;增量範圍以下列檔案與符號為準)。不含 node_modules,無法也不需要執行測試。
**只用相對路徑**讀檔;不要讀本資料夾以外的路徑。不得修改、建立或刪除本資料夾內任何既有檔案(`probe/` 子資料夾可自建小腳本與夾具);不得執行測試或啟動服務;可用唯讀查檔指令(`rg`、`git diff`)。讀含中文的檔案請用 `rg -n '^' -- <檔>`(不要接 PowerShell 管線)。

## 背景(一句話)

`users` 表的後台列(`from` 空)以 `id`、外部列(`from` 非空)以 `srcKey`(遷移前舊外部列無 `srcKey` 者以 `id`)為「登入識別值」;`mappingBy='id'` 時此值須跨全表唯一(不論 `isActive`、含他來源),匯入／後台存檔／登入三處同口徑,`/api/getPermUserInfor` 的 `userId` 亦依此解析。完整說明見 `BRIEF-r1.md` 所述(若本資料夾無,見 `sgud/rule/rulebook_sync.md` 的 R-MAPKEY-05)。

## 第一輪意見之採納(請核對實作是否真的解決了該條,且未引入新問題)

1. **#1(高)** 同來源 claimTwice 形:`server/keyCheck.mjs:findLoginIdClashDetail` 新增 kind `sameFrom`——同一來源之兩外部列,一有 `srcKey`、一為舊形(無 `srcKey`,登入識別為其 `id`)而 `id` 等於對方 `srcKey` 時算撞值;同來源皆有 `srcKey` 或皆無 `srcKey` 仍不判。`server/procCore.mjs` 的 reason 對應新增 `srcKeyClaimTwice`。測試:`test/unit-loginId.test.mjs` LI-035c、`test/unit-procCore-loginId.test.mjs` UL-017。
   請特別檢查:(a) 此收窄後,**同步端**(`server/syncCore.mjs`,其比對對象 `others` 已排除同來源列)與**後台存檔**(整表)是否各自正確、有無誤擋合法情形(例如遷移:舊外部列的來源首次匯入時批次 `srcKey` 等於舊列 `id`);(b) 後台存檔「被觸及」簽章(`procCore.mjs` 的 `sigOf`)是否會讓某個合法的無關編修被誤擋。
2. **#2(高)** `getPermUserInfor` 競態:`server/WWebPerm.mjs:resolvePermUserId` 改回 `{ userId, userFind }`,`getGenUserAndRulesByUserId(userId, userPre)` 在 `userPre !== undefined`(含 `null`=查無)時直接採用解析出之列、不再以內部 id 重讀;`email`/`name` 模式回 `userFind: undefined` 照舊以 id 讀取;原加在 `getGenUserByUserId` 的非字串守門已移除。測試:`test/unit-loginId.test.mjs` SITE-LI-005(靜態)。請檢查 `/api/getPerm` 路徑與 `email`/`name` 路徑是否完全不受影響,以及 `userPre` 為 `null` 時下游(`getUserRules(null, …)`)是否與修正前查無使用者的回應相同。
3. **#5(中)** 離線稽核 `server/tools/nameDupReport.mjs`:`--mapping-by id` 改為凡同一登入識別值 ≥ 2 列皆列出,標 `scope`(`crossSource` 為 `findLoginIdClashDetail` 判為撞值者;其餘 `sameSource`)。測試 `test/unit-nameDupReport.test.mjs` ND-005b。
4. **#4、#6、#10(文件)** `README.md` Upgrade Notes 第 4 節、`sgud/rule/rulebook_sync.md`(R-MAPKEY-04 殘留更正、R-MAPKEY-05 規則 1/3/5/6、輸入空間表第 13/15/16/18/19 格、已知限制④⑤)、`spec/流程_查詢指定使用者權限.md`:請核對文件敘述與程式是否一致,README 的稽核與修復步驟是否可照做。
5. **#7、#8、#9(測試補強)** `test/unit-loginId.test.mjs` LI-016b(非標準 `isActive` 組合)、`test/api-authMerge.test.mjs`／`test/api-keyProp.test.mjs`(增 `user.srcKey` 斷言)、`test/api-mapKeyId.test.mjs`(MI-001 增 getPerm 本人斷言、MI-012 增登入拒絕 srLog 斷言、MI-014 增空權限筆數與 `api/getPermUserInfor-error` srLog 斷言)、`test/api-getPermUserInfor.test.mjs`(005 增 rules 非空)。請判斷這些斷言是否仍有「恆成立」的空洞,以及仍有哪些改壞程式的方式不會被抓到(請具體說明如何改壞)。
6. **#3 已判為範圍外**(後台整表寫入 `users` 含同 id 兩列會被併成一列,既有行為,已探測確證,見 `sgud/rule/rulebook_sync.md` R-MAPKEY-05 已知限制④)——不必再審,但若你認為它**影響本功能之判準**(例如使「兩後台列不算撞值」的前提失效),請指出。

## 輸出格式

直接把報告寫在最後一則回覆(純文字,繁體中文)。每個發現一條:
`#<序號> [嚴重度:高/中/低] <一句話> — 位置 <檔案:行號> — 失敗情境(具體輸入→實際結果→預期結果) — 建議`
- 嚴重度:高=會造成錯誤結果、資料遺失、登入到錯的人或發布後壞掉;中=契約缺陷、測試覆蓋缺口、邊界未處理;低=文件、命名、風格。
- 沒有發現時明說「無發現」並列出你檢查過的面向,不要湊數。
- 區分「確定(已讀碼)」與「推測(未證實)」。
- 最後一行寫 `REVIEW-END`。
