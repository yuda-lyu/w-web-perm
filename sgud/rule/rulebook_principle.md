# 規則帳本:決策原則與授權合併

本檔為 `sgud/rule/rulebook.md` 之分冊(2026-10-22 主控依使用者指示自原 312KB 之帳本依類型分拆;節之標題與內容不變).索引與其他分冊見 `rulebook.md`.

## R-PRINCIPLE-00 決策原則(使用者裁示,2026-10-21;最高優先,不得改寫)

**用途**:設計或修改時遇到規則沒寫到、或多種做法都說得通的情形,先依本節原則決定;原則推不出唯一答案、要推翻使用者已裁示之條文、或會使既有授權變多(放寬)/刪除資料時,才停下請主控轉使用者裁示.原則正本在主控專案 `C:\opensrcOper\sgud\proc\process_principle.md`〈〇之一〉,本節為其在 w-web-perm 之適用.

**原則**:

1. **預設拒絕**:未給、未列＝`n`(R-AUTH-MERGE-00 第 1 條).
2. **結果與順序無關**(R-AUTH-MERGE-00 第 4 條).
3. **遇衝突或歧義:收嚴＋提示**(使用者原文:「遭遇有衝突那應該是收嚴(例如同時有有勾與沒勾視為沒勾)＋增加提示」):
   - **收嚴**:資料互相矛盾、引用對到多筆、對不到任何一筆、格式不合無法判讀時,取最嚴之解讀;有多種可能解讀時,授權取各解讀所得之**交集**.不靜默擇一(不取首筆、不以後者覆蓋前者、不靜默丟棄).
   - **提示**:頁面於該儲存格左側顯示**警告圖示(三角形驚嘆號)**,tooltip 寫明確切問題(哪一筆、與哪一筆衝突、系統採用了什麼結果);API／log 回固定錯誤鍵,不回顯值.
4. **所有入口一致**:同一條資料規則在後台、外部同步、API 都要擋;檢查與寫入在同一把鎖內(`tabWriteKey`,R-WRITE-LOCK-01).
5. **開了外部同步就以外部為主**:後台不得覆蓋外部來源提供之列;撞名/撞 id 依原則 3.
6. **引用要跟著改**:群組/權限/標的改名時,引用須連帶更新;**被刪除時,引用須連帶清理**(使用者 2026-10-21 裁示:刪除即表示要移除其效果;原設計 ADR-003「刪 target 不會回頭清掃 crules」、ADR-005「已刪群組仍被引用＝髒資料,找不到即忽略」皆因缺清理機制而於讀取端權宜處理);不得靜默失效或被同名新資料接管.
7. **多人同時編輯以表雜湊比對,先動先贏**(使用者 2026-10-22 裁示;正本為主控 `process_principle.md` 第 10 條):後台整表存檔時連同載入時之「表雜湊」送出,後端於表鎖內重算,**表內任何一列之內容(排除系統自動變更之欄位)或列之增刪與載入時不同即整次拒收**並提示重新載入;不部分變更、不上鎖;雜湊以內容計算(外部同步整批重寫但內容未變時雜湊不變);前端有未存之編輯時收到推播**不得靜默丟棄草稿**,保留草稿與其載入時之雜湊並提示「資料已被更新」.不帶雜湊之寫入(外部同步、舊客戶端之後台列)沿用「後者蓋前者」.

**在 w-web-perm 之適用**(主控依原則決定,2026-10-21;使用者可否決):

| # | 情形 | 收嚴 | 提示 | 狀態 |
|---|---|---|---|---|
| a | 同一項(陣列形式 `crules`)同一管理對象重複列且值衝突 | 所有列皆 `y` 才 `y` | 編輯器與清單該儲存格左側警告圖示＋tooltip | 收嚴已做(run04);提示已做(run05:清單 `crules` 儲存格與 `VeCrules` 該列名稱左側警告圖示＋tooltip,見 R-AUTH-WARN-01) |
| b | `cgrups`／`cpemis` 同名同時有 OR 與 AND | 編輯器拒存(`getKpLossy`) | 同上 | 拒存已做(run04);圖示已做(run05,R-AUTH-WARN-01) |
| c | 引用之群組/權限**查無**(懸空;有刪除連動清理〔n〕後只剩殘留:清理前之舊資料、異常寫入) | 該項以其 mode 參與、內容全 `n`(OR 不增加、AND 使結果為空) | 引用處警告圖示 | 已做(run05;原為「不計入」,會放寬;懸空仍參與、內容全 `n`;編輯器以額外列保留啟用中的懸空引用;引用處警告圖示;刪除前確認框提示影響人數〔文案描述「授權將被收回」,與適用表 n 之「連帶清理」設計衝突,見 R-AUTH-REF-01〕) |
| n | **刪除**群組/權限/標的(後台與外部同步) | 同一次寫入內連帶清理所有引用(`users.cgrups`／`grups.cpemis`／`pemis.crules`),效果等同舊版「找不到即忽略」;升級時提供一次性清理既有懸空引用之工具(先稽核列出) | 刪除前確認框列出受影響筆數,並註明「以 AND 引用者移除後限制解除、權限可能變多」 | 已做(run06;使用者 2026-10-21 裁示;**不採「被引用則禁止刪除」**——可能牽涉大量帳號,管理員須人工逐一處理):後台整表寫入與外部同步〔同一 `from` 內依穩定 id 判定:id 消失＝刪除並清理、同 id 改名＝改名級聯〕於同一次寫入內清理三種引用,引用端先寫、失敗補償還原,與 m 同一機制、同一鎖階層(見 R-REF-CASCADE-01、R-WRITE-LOCK-02);刪除前確認框與標的頁儲存前確認框列筆數及 AND 警示;升級用一次性清理工具 `g_authRefsClean.mjs`〔預設只列不改,`--apply` 才寫入並先備份〕;**〔run07 補記〕**外部列(`from` 非空字串)自 run07 起後台不得刪除(`saveExternalRowChanged`,R-EXT-OWN-01,`opt.lockExternalRows:'n'` 除外),其刪除只經外部同步(同一 `from` 內依穩定 id)或離線 `g_purgeFrom.mjs`(同一次清理引用,與本列同一純函數 `planRefChanges`) |
| d | 引用之名稱對到**多筆**(歷史同名) | 該項內容取各候選之交集 | 同上 | 已做(run05;原為取第一筆;群組層與權限層皆取各筆內容之交集;引用處警告圖示) |
| e | 項目 mode 缺或非 `OR`/`AND` | 只作限制項(只參與 AND 交集、不作基底;該層無合法 mode 之啟用項時全 `n`)＝各解讀之交集(主控 2026-10-22 核可) | 同上 | 已做(run05;原為不計入;**R-AUTH-MERGE-00 第 5 條之 mode 部分已由主控修改**,`isActive:'n'` 不計入維持;**實作細節——「視為 AND」只作限制項(交集項、不單獨當基底),該層沒有任何 mode 合法之啟用項時結果全 `n`**:若逕視為 AND,「該層唯一項 mode 非法」時會成為基底而授予其內容,比修正前多給,違反「只收回」;此取原則 3 之各解讀〔OR／AND／不計入〕交集,與第 5 條字面「視為 AND」僅在該一格不同,**請主控確認**;見 R-AUTH-REF-01) |
| f | 空字串名稱之群組/權限被引用 | 編輯器不得靜默丟棄:能原樣保留就保留,否則拒存 | 同上 | 已做(run05;名稱 `''` 原樣保留〔物件鍵 `''`〕,啟用而名稱非字串者 `getKpLossy` 判有損而拒存;圖示;R-EDIT-KEEP-01) |
| g | 後台存檔遇歷史同名列(非本次造成或觸及) | 只擋本次造成/觸及者(與伺服端一致) | 歷史同名列皆顯示警告圖示 | 已做(run05;前端 `getNameErrs` 與伺服端共用 `findTouchedDup`;R-DUP-UI-01) |
| h | 後台 users 存檔:`mappingBy` 為 `email`／`name` 時之對應鍵 | 伺服端對 active 列檢查非空/唯一(本次造成或觸及者),與外部同步 F-14 一致;`mappingBy='id'` 時歷史重複 email 不擋整表 | 同上 | 已做(run05;`keyCheck.checkUsersWrite`,R-MAPKEY-03) |
| i | 登入時對應鍵對到多筆使用者 | 拒絕(`ambiguousUserFromPerm`) | 固定錯誤鍵 | 已做(run04) |
| j | 群組/權限名稱重複寫入 | 後台與外部同步皆拒 | `nameDuplicate`／`invalidRows` | 已做(run04) |
| k | 過期快照覆蓋(F-26) | 以開啟編輯時之基準比對,不符即拒存;**2026-10-22 使用者裁示改為表級(原則 7):表內任何一列內容或列之增刪與基準不同即拒** | 提示重新載入;**前端有未存編輯時收到推播須保留草稿並提示「資料已被更新」**(verify01 實證:現行清單頁推播重建會靜默丟棄草稿並回「儲存成功」) | **已做(run11, 2026-10-22; 使用者裁示原則 7)**:伺服端改為**表級**——基準涵蓋載入時之整表(逐列內容指紋＋列集合,排除 order 與伺服器管理欄),表鎖內與庫內整表比對,任何一列內容不同或列增刪即整次拒收 `saveStale`(零寫入,不部分變更、不上鎖,先動先贏;`rowDigest.checkBaseline`,R-BASELINE-01);前端有未存編輯時收到推播**保留草稿與其載入時之基準**並提示「資料已被更新」(附「重新載入」鈕;`src/js/draftSync.mjs`,R-DRAFT-KEEP-01);原 run07(ADR-037; 主控依原則定案 Q7)之機制為:基準於**開啟編輯(建草稿)時**綁定、為逐列內容指紋(排除 order 與伺服器管理欄),隨 `updateXxx(rows, { baseline })` 第 3 參送出;伺服端於表鎖內只比對**本次將寫入之列**(已被 run11 取代);前端綁定點為四清單頁 `rebuildDraft`(原 `changeParams`)與兩對話框 `show()`,存檔不得重算;無基準之舊客戶端:後台列維持舊行為,修改外部列指派欄則拒收 `saveBaselineRequired`(外審 B.2,依原則 3 收嚴);實作與六站點見 R-BASELINE-01 |
| l | 外部列(F-23) | 後台不得改外部列之身分/結構欄 | 該列唯讀標示 | 已做(run07, ADR-037; 主控依原則定案 Q1～Q6、Q9、Q10):判別 `from` 非空字串＝外部列(`''`／缺欄／非字串＝後台列),`opt.lockExternalRows` 預設 `'y'`,伺服端 Lv1 強制(身分/結構欄不得改、不得刪、不得改 `from`、新增列 `from` 須 `''`;指派欄 `cgrups`／`cpemis`／`crules` 後台可寫但須附基準;外部列 `order` 由外部擁有),違規整次拒收 `saveFromNotAllowed`／`saveExternalRowChanged`;頁面逐列唯讀＋首欄鎖頭＋橫幅＋`from` 欄唯讀＋複製重置 `from`＋刪除過濾;種子 `teamA`→`''`;清源走離線 `g_purgeFrom.mjs`,不認領、不做本地停用覆蓋;單一擁有者 `src/js/externalRows.mjs`,見 R-EXT-OWN-01;**〔run08 補記, 主控依原則定案〕**外部同步缺鍵保留由 `users.cgrups` 擴及 `grups.cpemis`／`pemis.crules`(三個指派欄後台可寫, 每次同步清空即靜默丟棄管理者之指派; `server/syncKeep.mjs:keepAssignByEntity`,實體身分依 id,見 R-EXT-OWN-01 規則 6);離線工具核心自 `test/tools/` 搬至 `server/tools/`(R-SHIP-TOOLS-01) |
| m | 改名(F-07) | 伺服端連帶更新引用;歷史同名組改名、新名撞懸空引用→拒絕 | 改名前預覽受影響筆數 | 階段 1 已做(run06;群組＋權限;預設開、`opt.cascadeRename:false` 可關;拒絕鍵 `renameCascadeDupGroup`〔庫內同名多列且該名稱仍被引用〕／`renameCascadeNameInUse`／`renameCascadeConflict`;改名前預覽〔群組頁、權限頁儲存時確認框,含外部 users 列警示〕;見 R-REF-CASCADE-01);階段 2 標的 id 改名之級聯待做(目前改 id＝刪舊增新,引用被清理);**〔run07 補記〕**級聯改寫外部 users 列之 `cgrups` 後,外部同步之 payload 若**缺 `cgrups` 鍵**則保留庫內值(`server/syncKeep.mjs:keepAssignOnMissing`,R-EXT-OWN-01),含鍵者仍以外部為準 |

## R-AUTH-MERGE-00 授權合併規則(使用者裁示,2026-10-21;最高優先,不得改寫)

**來源**:使用者 2026-10-21 於主控 session 之最終裁示(第 101 項,`C:\opensrcOper\dnow\20261021095534\task.md`).**取代 ADR-001 之「AND 非對稱性(obj1 獨有的 key 保留原值)是刻意行為、不可順手對稱化」一條**及其凍結之測試期望;須新增 ADR 正式取代(ADR-001 改 Status: 部分被取代,不刪舊條).

**規則**(權限層〔群組內合併各權限之 `crules`〕與群組層〔使用者合併各群組之結果〕同一函數、同一規則):

1. **每一項之值**:有勾＝`y`;給 `n` 或**未給**(未列)一律視同 `n`.不存在「未列＝不約束」.
2. **起點**:全部管理對象皆為 `n`(ADR-002).
3. **先 OR 後 AND,與排列順序無關**:
   - 先將**所有** OR 項做**聯集**;
   - 若該層沒有任何 OR 項,以第一個 AND 項為基底(因第 1 條,任何 AND 項當基底結果皆相同);
   - 再依序與**所有** AND 項做**交集**(交集時,AND 項未列之對象視同 `n`).
4. 結果須滿足交換律:同一組項目不論儲存順序、物件鍵序、陣列元素序,結果相同.
5. `isActive:'n'` 之項不參與合併(ADR-004 原有處理不變).〔主控依 R-PRINCIPLE-00 原則 3 修改,2026-10-21;原為「mode 非 `OR`/`AND` 之項亦不參與合併」〕mode 缺或非 `OR`/`AND` 之項**只作限制項**:只參與 AND 交集、不作基底;該層沒有任何 mode 合法之啟用項時結果全 `n`(＝OR／AND／不計入三種解讀之交集;主控 2026-10-22 核可 run05 之實作,原寫「視為 AND」在「該層唯一啟用項 mode 非法」一格會多給);引用之群組/權限**查無**者以其 mode 參與、內容全 `n`;引用名稱**對到多筆**者內容取各候選之交集(R-PRINCIPLE-00 適用表 c、d、e;皆只收回,並須於頁面提示).

**例**(管理對象 a～e;x = {a:y, b:y, c:n, d:未給},y = {b:y, c:未給, d:y, e:y}):

| 組合 | 依本規則 | 舊實作(ADR-001 非對稱,2026-10-21 實測) |
|---|---|---|
| x OR、y OR(任一順序) | a,b,d,e | a,b,d,e |
| x AND、y AND(任一順序) | b | x 先:a,b;y 先:b,d,e |
| x OR + y AND / y OR + x AND | b | a,b / b,d,e |

**連帶**:
- 實作單一擁有者:`src/plugins/mShare.mjs` 之 `mergeRules`/`objAND`(`objAND` 對 obj2 未列之鍵改為 `n`).
- 須同步改:ADR-001(Supersede)、`spec/流程_權限規則合併計算.md` E2E-005/006、`unit-getUserRules` UNIT-005b/005c、`unit-authMerge-characterize` 與 `test/tools/authMergeGolden.json` 之期望(依新規則重產)、`unit-cvKpToObj` PR-001/001b/003/004/005/006 之順序前提、README Upgrade Notes(只會收回、不會多給;附稽核指令 `node test/tools/authMergeReport.mjs --audit <匯出檔>`).
- 編輯器:`VeCrules` 兩態(勾/不勾)即與本規則一致,**不做三態**;「刪除勾選對象」等同 `n`.
- run02(第 89/92 項)之排序保護(`keepKeyOrder`、`getKeyOrderLost`、`getKpWriteLost`、`getKpLossy` 之順序部分、`authLossyBlocked` 之順序部分、`e2e-array-form` AF-010/011/012)於本規則下非必要,可精簡;**同名同時有 OR 與 AND 之有損判定保留**(物件形式一個名稱只有一個 mode).
- 狀態:**規則已定、程式已改**(2026-10-21 第 101 項 run04;ADR-033).`mergeRules`／`objAND` 對稱化、排序保護已移除/簡化、`unit-authMerge`／`api-authMerge`／`e2e-array-form` AF-016 等測試已依本規則;實作細節、站點、盤點指令與測試對照見下節 `R-AUTH-MERGE-01`.進度:全套 `npm test` 結果見 run04 報告.

## R-AUTH-MERGE-01 授權合併規則之實作與守護(對應 R-AUTH-MERGE-00;ADR-033)

- **單一擁有者**:`src/plugins/mShare.mjs` 的 `getUserRules` 內 `mergeRules`／`objOR`／`objAND`(權限層與群組層共用同一個 `mergeRules`).`objAND(obj1, obj2)`:結果之鍵為兩方自有鍵之聯集,`kp[k] = (getOwn(obj1,k)==='y' && getOwn(obj2,k)==='y') ? 'y' : 'n'`(任一方未列＝`n`).同一項(陣列形式 `crules`)重複列同名規則:`kpRule[k]` 於重複時取「所有列皆 `y` 才 `y`」(與列序無關);編輯器解碼 `cvKpToObj(hasMode:false)` 同口徑.**測試端另有獨立的集合式參考實作** `test/tools/authMerge.mjs` 的 `mergeSpec`(不入 `src/`),與舊規則複製 `mergeLegacy`(僅供「新舊差異」稽核).
- **判準(已套／未套／刻意不套)**:①`mergeRules` 內不得再出現「以第一個 AND 項為唯一基底且其餘 AND 只約束提及之鍵」之寫法(`rg -n "objAND" src` 應只有 `mShare.mjs` 一處定義與一處呼叫);②src／server 的**可執行碼**不得再引用 `keepKeyOrder`／`getKeyOrderLost`／`getKpWriteLost`／`keyOrderOf`(`rg -n "keepKeyOrder|getKeyOrderLost|getKpWriteLost|keyOrderOf" src server` 除註解中的歷史說明〔如 `getKpLossy.mjs` JSDoc〕外應為 0;`unit-cvKpToObj` SITE-AD-003 以略過註解的方式反向守護);③`getKpLossy` 只判「同名有效啟用元素同時為 OR 與 AND」(`rg -n "andOrder|probe" src/js/getKpLossy.mjs` 應為 0);④`VeCrules` 為兩態(`rg -n "indeterminate|三態" src/components/VeCrules.vue` 應為 0);⑤`authLossyBlocked` 兩語系文字不含「順序」「order」.
- **盤點指令(可重跑)**:`node test/tools/authMergeReport.mjs --golden > test/tools/authMergeGolden.json` 重產窮舉彙整(改規則後須重產並確認差異為預期;`unit-authMerge` SP-SCAN 逐列比對);`node test/tools/authMergeReport.mjs` 產各窮舉總表／最小例子／逐鍵真值表;**部署前稽核**:`node test/tools/authMergeReport.mjs --audit <匯出檔.json>`(匯出檔 `{ users, grups, pemis, targets }`,各為列陣列),逐使用者列出新規則收回之管理對象(`lost`)、多給(`gained`,依規則推導恆為空)、舊規則是否順序相依.
- **窮舉依據**(`test/tools/authMergeStats.mjs` 的 `goldScanDefs`):9 組共 223,384 格(權限層 3 管理對象 2、3 項;群組層 2 項;1 管理對象 2～4 項;兩層 1 管理對象 2、3 群組;兩層 3 管理對象 F5 規則集),每格:真函數＝規格參考實作(fidelity 0)、新規則為 `y` 者舊規則必為 `y`(retract 0)、同一組項目所有儲存順序結果相同(新規則 dependent 0);舊規則之順序相依 combo 數與新舊差異量固定於 GOLD.
- **測試對照**:`unit-authMerge`(SP-MIN 最小例子含使用者之例;SP-SCAN 窮舉彙整;SP-PROP〔逐管理對象獨立、閉式、交換律窮舉、層同形〕;SP-PG;SP-DROP;SP-TGT;SP-FORM;SP-REAL〔種子資料、規格情境 peter 3→2／mary 4→3、啟用 AND 只會收回、編輯器重存不撤權、刪除勾選＝n、後增管理對象〕;SP-AUDIT〔含稽核指令實跑〕)、`unit-getUserRules`(UNIT-005b／005c／005g、UNIT-AM-001～006)、`unit-cvKpToObj`(PR-*、KL-*、SITE-AD-003)、`api-authMerge`(真後端 13 代表格)、`e2e-array-form`(AF-010a～d、AF-012a、AF-016a／b)、`e2e-rela-grup-pemi`／`e2e-rela-user-grup`(語意斷言:peter 解析後 2 個、mary 3 個;標準圖未變動)。
- **變更紀錄**:取代 ADR-001「AND 非對稱」「初值選取」;簡化 ADR-031 保序(R-AUTH-ORDER-01)與有損之順序部分(R-AUTH-LOSSY-01 ②③).升版行為變更見 README Upgrade Notes.

## 遇衝突收嚴＋提示:引用解析(c／d／e)、衝突提示、編輯器不丟引用、歷史同名、後台 users 對應鍵(2026-10-21 run05, ADR-035; 來源:使用者「遭遇衝突就收嚴＋增加提示」, `R-PRINCIPLE-00` 適用表 a～h)

### R-AUTH-REF-01 引用以名稱查找實體之唯一判準;懸空／同名多筆／mode 非法一律收嚴(c、d、e)

- **規則**:使用者 `cgrups`、群組 `cpemis` 中 `isActive==='y'` 之引用(`isActive` 非 `'y'` 者不參與,不變)逐一以 `name` 精確 `===` 比對群組表／權限表之列(`src/js/findRefRows.mjs`:列無 `name` 欄視為 `''`,與引用名稱 `''` 相符,沿用修正前行為):①**0 筆(懸空)**——該項仍以其 mode 參與、內容為空集合(全 `n`):OR 項聯集貢獻 0 但使「有 OR 項」→ 基底為 OR 聯集;AND 項使交集為空;②**≥2 筆(歷史同名,僅外部同步可造成)**——該項內容取各筆內容之**交集**(群組層:各候選群組各自合併其權限之結果再交集;權限層:各候選 `crules`〔陣列形式同名重複列所有列皆 y 才 y〕交集);③**mode 缺或非 `'OR'`／`'AND'`**——「限制項」:只當 AND 之交集項、**不單獨當基底**,該層沒有任何 mode 合法之啟用項時結果全 `n`(`mergeRules` 之 `lim`／`tsBase`).③是對 `R-AUTH-MERGE-00` 第 5 條字面「視為 AND」於**「該層唯一啟用項 mode 非法」一格**之收嚴(逕視為 AND 會成為基底而授予其內容,比 run04／1.1.12 多給;取 OR／AND／不計入三解讀之交集即限制項;依 R-PRINCIPLE-00 原則 3 決定,**請主控確認**;其餘格與「視為 AND」相同).c／d／e 相對 run04 與 1.1.12 皆**只收回、不會多給**,且結果與順序無關(`unit-authMerge` SP-CDE 窮舉＋隨機證明).
- **單一擁有者**:`src/js/findRefRows.mjs`(找列)、`src/js/getEffMode.mjs`／`isAuthMode.mjs`(mode 有效值／合法性)、`src/plugins/mShare.mjs` 之 `getUserRules`(`evalGroup`、`andAll`、`mergeRules`);前端提示 `getAuthWarn.mjs` 與編輯器 `cvKpToObj`／`getKpLossy`／`editorRefRows` 共用同一組判準,不複製.`getUserRules` 不再就地寫入輸入之表列(舊版會對輸入列寫 `_pemis`／`_rules`;回傳之 `grups` 為複本,只含查得之群組,供 `grupsNames`).
- **盤點指令**:`rg -n "findRefRows|getEffMode|isAuthMode" src server`(站點須只在 mShare／getAuthWarn／cvKpToObj／getKpLossy／editorRefRows);`rg -n "arrFinder" src server` 應為 0(`unit-authMerge` SITE-AM 靜態守護);`node test/tools/authMergeReport.mjs --audit <匯出檔>`(逐使用者列出相對 1.1.12 之收回、相對 run04 因 c／d／e 額外收回及原因〔`dangling`／`ambiguous`／`modeInvalid`〕).
- **與後續階段之關係**:適用表 n(刪除連帶清理,run06 已做,見 R-REF-CASCADE-01)實作後,刪除不再產生懸空引用,c 僅處理清理前之舊資料與異常寫入(升級時以 `g_authRefsClean.mjs` 一次性清理);**刪除前確認框文案**已於 run06 由「授權將被收回」(描述 c 現況)改為 n 之文案(「將自 N 位使用者／N 個群組移除此引用;其中以 AND 引用者,移除後限制解除、權限可能變多」),以下「`countAndRefs` 之 `n` 只計 AND 引用」等敘述中之 run05 文案鍵(`confirmDelAndRefs*`)為歷史紀錄.`countAndRefs` 之 `n` 只計 AND 引用(OR 引用被刪僅使聯集縮小,屬原有行為;但 OR 懸空 ＋ AND 並存時基底變空,該情形不在提示人數內,已知);外審後新增 `nWiden`:刪除歷史同名之一列(刪後該名稱仍有 ≥1 筆剩餘列但比刪除前少)會使 d 規則之交集變寬,任何 mode 之啟用引用者皆計入,確認框改文案為 `confirmDelDupRefs*`／`confirmDelBothRefs*`(兩者皆有時併為單一框).
- **測試**:`unit-authMerge`(SP-CDE 保真／只收回／順序無關／逐旗標歸因,SP-DROP,SP-AUDIT,SITE-AM)、`unit-getUserRules`(UNIT-CDE-*)、`unit-getAuthWarn`(含 `findRefRows`／`getEffMode`)、`api-authMerge`.

### R-AUTH-WARN-01 衝突提示:警告圖示(三角形驚嘆號)＋tooltip,偵測單一擁有者 `getAuthWarn`(a、b、c、d、e、f)

- **規則**:有衝突之處顯示 `$ui.getIcon('warning')`(16px)於該儲存格／該列名稱**左側**,`title` 寫明問題(哪個名稱、系統採用什麼結果);**沒有衝突之資料畫面／DOM 與修正前完全相同**(不預留空間、不改欄寬、無警告那支 `v-else` 與原 DOM 逐字相同;既有標準圖 0 張改變).警告碼:引用清單 `dangling`／`ambiguous`／`modeInvalid`／`bothModes`／`emptyName`／`noName`(`getRefWarns`,僅 `isActive==='y'` 之項),規則清單 `ruleConflict`(`getRuleWarns`:同一管理對象重複列且有勾有不勾).tooltip 文字語系鍵 `warnRef*`／`warnRuleConflict`／`warnKind*`／`warnNameHistDup`(eng＋cht,`server/procLang.mjs`).
- **單一擁有者**:`src/js/getAuthWarn.mjs`(純函數,不依賴 Vue／DOM).站點:`VeCgrups`／`VeCpemis`(名稱格左側;頂端提示列僅在有 `noName` 時)、`VeCrules`(`col-id="id"`)、`VeGrupBlngUsers`／`VePemiBlngGrups`(chips 欄外層 flex)、`LayoutContentUsers`(`cgrups`)／`LayoutContentGrups`(`cpemis`)／`LayoutContentPemis`(`crules`)儲存格.
- **盤點指令**:`rg -n "getRefWarns|getRuleWarns|getRefWarnText|getItemWarnText|getRuleWarnText" src`;`rg -n "getIcon\('warning'\)" src`.
- **測試**:`unit-getAuthWarn`(全警告碼×eng／cht);e2e 見 run05 報告(語意斷言,不產標準圖).

### R-EDIT-KEEP-01 編輯器存檔不得放寬授權:啟用中之引用不得丟棄,無法原樣保留則拒存(c、e、f)

- **規則**:編輯器存檔不改任何值時,伺服端算出之授權前後相同(或被拒存).①`VeCgrups`／`VeCpemis` 之列＝表列＋**額外列**(啟用中而名稱查無表列之引用〔含名稱 `''`〕,名稱唯讀、mode／enable 可改,管理者可改為停用以解除);存檔寫出所有字串名稱之列(含 `''`),停用之懸空引用無授權影響故不產生額外列;②mode 缺／非法之啟用項解碼為 `mode:'AND'` 顯示(`cvKpToObj`),**未被管理者改動時存檔原樣寫回其原始 mode**(見下方方案 A);舊式簡寫純量值 `{"G1":"y"}` 解為 `{isActive:'y',mode:'AND'}`);③`getKpLossy` 判有損(拒存,庫內字串逐字不動)**兩格**:同名同時有效 OR 與 AND、啟用而名稱非字串(以 `#序號`); ~~第三格「該層啟用項皆 mode 缺／非法」~~ **已於 2026-10-22 run06 放寬(使用者裁示)**——方案 A(下)使未改動之限制項原樣寫回、不會成為基底而多給,拒存只會使管理者無法存任何變更;改為允許存檔、保留警告圖示(`warnRefModeInvalid`); 放寬以 `unit-editorRows` RT-LOSSY3-001～009(對真 `getUserRules`、窮舉＋隨機,無任何一格多給)與 EX-LOSSY3-001～008 證明,仰賴方案 A(`getRawModeMap` 等),變異驗證 13 個非等價缺陷全紅; ADR-035 Update(2026-10-22);④表中同名多列(歷史同名)各列 `(mode, enable)` 不全相同者拒存(`warnDupRowsInconsistent`),全相同寫出一次;⑤反向關聯對話框改寫他人字串時只改本項(`putRefEntry`),其餘項(含懸空、`''`、停用)原樣保留,目標狀態與現值相同則不重寫字串.
- **方案 A(外審後採納,2026-10-22)**:未被管理者改動的 mode 缺／非法啟用項,存檔時**原樣還原其原始 mode**(`getRawModeMap` 記該名稱所有啟用元素皆 mode 缺／非法者;`putRowsToKp(…, rawModeMap)` 對仍為開啟時狀態〔AND、啟用〕之列寫回原值〔原值缺則不寫 mode 鍵〕;`putRefEntry(…, rawModeMap)` 複製其餘項時還原),否則管理者於同一次編輯把唯一合法項停用時,限制項會被升格為唯一基底而多給(sol／minimax 外審,`unit-editorRows` RT-001 等五案修前紅).直接編輯器之單列切換與批次操作以精確 `r.name === name` 比對並對所有同名列一併套用(`getRowIdxs`);`VePemiBlngGrups` 以群組 id 定位.
- **已知限制(方案 A 之取捨,未處理)**:①限制項列被管理者改成 OR 再改回 AND,視為未改而寫回原始 mode(無法由編輯器把限制項明確轉成合法 AND;須由資料來源或先改 OR);②原為停用且 mode 缺／非法之項被管理者勾選啟用時,寫出對話框顯示之 mode(預設 OR,既有行為,管理者可見);③`unparsable`(整串損壞)只在三個清單頁 tooltip 提示,兩個直接編輯器對話框尚未顯示;④批次操作取自 ag-grid 投影之列,表列缺 `name` 欄時被投影為 `''`,若同時有引用名稱 `''` 之額外列,「全部停用」可能誤作用於額外列(需表列缺 name 與空名引用並存,屬外部直寫畸形資料);⑤直接編輯器之垃圾桶可整列刪除啟用中的 AND 引用(管理者明確操作,既有設計).
- **單一擁有者**:`src/js/editorRefRows.mjs`(`getRefState`、`getRefRowsExtra`、`getDupRowsInconsistent`、`getRawModeMap`、`getRowIdxs`、`putRowsToKp`、`putRefEntry`)、`cvKpToObj`、`getKpLossy`.**測試**:`unit-editorRows`(往返不變式:直接編輯器群組層／權限層、反向對話框,窮舉＋隨機＋變異)、`unit-cvKpToObj`(PR-*、KL-*、CO-*)、e2e 見 run05 報告.

### R-DUP-UI-01 前端與伺服端以同一判準處理歷史同名(g);後台 users 對應鍵(h,見 R-MAPKEY-03)

- **規則**:「本次造成或觸及之同名」判準單一擁有者 `src/js/findTouchedDup.mjs`(`server/keyCheck.mjs` 轉出,`procCore.updateTabItems` 呼叫);前端 `src/js/getNameErrs.mjs`(`LayoutContentGrups`／`Pemis`／`Users` 之 `errItemsByName`／`errItemsByEmail`)對每個重複名稱呼叫同一函數:本次造成或觸及者→擋存(既有橘色名稱＋圖示,`grupNameDuplicate` 等,**既有標準圖外觀不變**),歷史同名→同樣圖示但不擋存(`warnNameHistDup`;使用者頁 `warnUser*HistDup`).基準列＝store 最近一次由伺服端載入之列,新增未儲存之列視為本次造成.`src/js/getDelRefCount.mjs` 供刪除前確認(群組頁／權限頁;`n`〔AND 引用將被收回〕與 `nWiden`〔歷史同名候選減少而變寬〕皆為 0 時不彈框,有任一則彈單一確認框).
- **測試**:`unit-getNameErrs`(對真 `procCore.updateGrups`／`updatePemis` 比對「前端判擋存 ⇔ 伺服端回 `nameDuplicate`」)、`unit-keyCheck`、`unit-procCore-nameUniq`.

### R-MAPKEY-03 後台 users 整表寫入:email 與對應鍵只擋「本次造成或觸及」者(h)

- **規則**:`server/keyCheck.mjs:checkUsersWrite(rowsNew, rowsOld, mappingBy)`,由 `procCore.updateTabItems`(users)於 `kmx(tabWriteKey)` 內、任何破壞性寫入之前呼叫.①一般 email(任何 `mappingBy`、全表含停用列):非空字串只檢查新增列與 email 異於庫內同 id 列者;不得重複(`findTouchedDup`);歷史空值／重複原樣送回不拒.②`mappingBy` 為 `email`／`name` 時另對 active 列(兩側先過濾)之對應鍵:`trim` 後非空且唯一,同樣只擋本次造成或觸及者;**停用列改為啟用視為觸及**(空值→`saveRowFieldInvalid`,撞值→`saveRowFieldDuplicate`).錯誤鍵沿用 `saveRowFieldInvalid`／`saveRowFieldDuplicate`;srLog `reason`＝`emailInvalid`／`emailDuplicate`／`mapKeyInvalid`／`mapKeyDuplicate`,**不記 email／name 值**.`mappingBy` 取自 `WWebPerm.mjs` 正規化後之值(預設 `id`)經 `procCore(…, { mappingBy })` 傳入.`pickKeysOnly`(`modeEditUsers='for:grups'`)在歷史重複庫可成功.外部同步(F-14)不變.本節取代 R-NAME-UNIQ-02／R-MAPKEY-01 中「後台 `ckKey('email')` 全表」「後台不檢查 name」之敘述.
- **前端**:`LayoutContentUsers` 的 email／name 檢查同為只擋本次造成或觸及(前端不知 `mappingBy`,伺服端依 `mappingBy` 更嚴時以其錯誤鍵經 `showCheckYes` 顯示).
- **測試**:`unit-procCore-usersKey`(76 情境×3 `mappingBy`＋窮舉)、`api-updateTabs`(API-updateUsers-004／005)、`api-mapKey`(MK-020／021).
