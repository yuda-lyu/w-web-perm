# 功能正確性審查:w-web-perm「被引用實體身分檢查(反向對話框主體＋清單頁指派欄)」改動

你是獨立審查者。目標:找出這批改動中**會造成錯誤結果、資料遺失、死結、或與下列契約不符**的地方,並檢查**測試是否真的守得住這些契約**。請誠實回報:找不到就說找不到,不確定就標「不確定」,不要為了湊數而提不重要的意見。

## 0. 工作目錄與檔案

工作目錄是一份**副本**(不是正式 repo),所有路徑皆相對於工作目錄:

- `DIFF-prod.patch`:`server/`、`src/` 中**已追蹤檔**相對於改動前版本(HEAD)的差異(本次改動為 `server/procCore.mjs`、`server/procLang.mjs`、三個清單頁 `src/components/LayoutContent{Users,Grups,Pemis}.vue`、兩個對話框 `src/components/Ve{GrupBlngUsers,PemiBlngGrups}.vue`)。
- **全新檔案**(不在 patch 內,請直接讀檔):`src/js/refIdentity.mjs`(新增之純函式模組,前後端共用)、`test/unit-refIdentity.test.mjs`、`test/unit-procCore-identity.test.mjs`、`test/api-identity.test.mjs`;`test/e2e-concurrent-edit.test.mjs` 內 E2E-025～036 為新增案例(該檔其餘案例為既有)。
- 既有且相關:`src/js/draftSync.mjs`(`checkSubject`)、`src/js/refCascade.mjs`(`REF_OF`、`decodeKp`、`listEntries`、`entName`、`keyOf`)、`server/keyCheck.mjs`(`withTabLocks` 取鎖階層)、`server/lockSave.mjs`、`server/WWebPerm.mjs`(`kpFunExt` 之 `updateXxx` 與外部同步 `syncAndReplaceTabs`)、`node_modules/w-serv-orm/src/WServOrm.mjs`(共用核心的 `withTabLocks`、`guardWrite`;**核心不是審查對象**,只供對照)。
- 文件:`README.md`(Upgrade Notes、Known limitations)、`spec/設計要點與取捨.md`(ADR-037 Update(perm-run02))、`sgud/rule/rulebook_concurrent.md`(R-SUBJECT-ID-01、R-REF-IDENTITY-01)、`spec/流程_多人同時編輯.md`(E2E-025～036)。

## 1. 要審的契約(摘要;以此為準)

背景:授權以**名稱**引用他表實體(`users.cgrups`→`grups.name`、`grups.cpemis`→`pemis.name`、`pemis.crules`→`targets.id`)。被引用實體在使用者編輯期間被刪除、再以同名重建(id 不同)時,存檔會把授權寫到同名的新實體(原則 6:引用不得被同名新資料接管)。使用者裁示:「正反關聯與主體身份檢查,前後端都要做」;原則 4:檢查與寫入同一把鎖。

1. **反向關聯對話框主體**(`VeGrupBlngUsers` 主體=群組、`VePemiBlngGrups` 主體=權限):前端存檔前以 `checkSubject` 對 store 驗(既有)。**新增**:RPC 第 3 參 `opt.subject={id,name,saved}`;伺服端 `updateTabItems` 於 `lockSave` 之內、本表 `guardWrite` 外層先取**被引用表鎖**(`withRefLock`),新鮮 `select()`,以同判準驗主體;不符→reject `saveSubjectChanged`,零寫入;**先於基準比對**。
2. **清單頁指派欄的正向引用**:使用者在編輯器回填時,前端記下「**本次新增之啟用(`isActive==='y'`)引用項**名稱 → 編輯器開啟當下被引用表中對應之實體 id 陣列」(`snapRefIds`/`recordPicks`);存檔前前端先以 store 驗(`countRefMismatch`;不符→不送出、彈 `saveRefChanged`),通過則 `opt.refs=[{name,ids}]` 隨存檔送出;伺服端於被引用表鎖內新鮮讀取,逐名稱比對 id 陣列(被刪除、刪除後同名重建、新增同名實體皆不符),且**宣告須完整**(本次寫入之列相對庫內舊列新增的啟用引用名稱都須在宣告內,漏報即拒)→ reject `saveRefChanged`,零寫入。檢查位置:`write` 回呼內 `restoreServerFields` 之後、`checkExternalWrite` 之前。「新增之啟用引用項」＝新值啟用項減舊值啟用項;未變更的舊引用與停用項不計。
3. **targets 的 id 即名稱**(主鍵=標的名稱;外部同步每次以同 id 重寫列),故其身分定義即 id:crules 欄只檢查「已被刪除」;刪除後同 id 重建依定義是同一實體(設計事實)。
4. **相容與不擴權**:不帶 `subject`/`refs`(undefined/null)的呼叫(外部應用、舊客戶端)維持原行為;帶了但格式不合或不符一律拒收(`saveIdentityFormat` / `saveSubjectChanged` / `saveRefChanged`),不降級為不帶。`subject`/`refs` 的內容不被信任;驗證用的表與鎖皆由伺服端依 `keyTable` 自組(`getRefTarget`),用戶端不得指定。`pemis` 帶 `subject` 為格式錯誤(其被引用表 targets 無 `name`)。
5. **鎖階層**(`keyCheck.TAB_LOCK_RANK`:targets→pemis→grups→users,被引用者先、引用端後,逐表巢狀):被引用表鎖在最外層且階層低於本表;與外部同步、引用連帶(本表→引用端)同序;不得成環死結。不使用核心「一次宣告多表」(其碼元序與階層序不同)。
6. **不得改變**:perm-run01 之其他行為(先動先贏基準、存檔回傳列、草稿保護、空值等價、名次)、R-AUTH-MERGE-00、刪除連帶與改名級聯、外部列保護、外部同步匯入語意。

## 2. 請特別檢視(依重要性)

A. **伺服端鎖與次序**(`server/procCore.mjs` 的 `updateTabItems`:`withRefLock`、`refRows`、subject 事前驗證、`checkRefIdentity` 位置):驗證所用的被引用表讀取與本表寫入是否真在同一段持鎖期間?在所有寫入入口(後台整表存檔、外部同步、引用連帶)下,取鎖次序是否可能成環?`pickKeysOnly`(users 的 `for:grups` 模式)、`returnRows`、引用連帶改寫引用端表時,新增的外層鎖是否造成死結或重入?失敗路徑是否一律釋放鎖?
B. **身分判準的完整性**(`src/js/refIdentity.mjs`):`activeNames`/`newActiveNames`/`collectNewNames` 對授權字串各形式(物件形式、陣列形式、純量、壞 JSON、`mode`、`isActive` 非 `'y'`、名稱含 `__proto__`/`constructor`、數字名稱之 `crules`)是否有漏掉或誤判?`idsOfName` 對歷史同名多筆、`entName`/`keyOf` 與伺服端 `mergeRules` 之比對鍵口徑是否一致?宣告完整性檢查會不會**誤拒合法存檔**(例:外部列指派欄、複製列、只改 `mode`、`pickKeysOnly` 之 users)?
C. **前端接線**(三清單頁 `showVeCxxxById`→`recordPicks`、`doSave*` 之 `buildRefDecl`/`countRefMismatch`;兩對話框 `saveUsers`/`saveGrups` 帶 `subject`):`refPicks` 在草稿重建、推播保留草稿、編輯器回填被放棄、複製列、貼上等路徑下是否會與實際送出之列脫節(造成誤拒或漏報)?前端自檢的 `refRows` 取自 store 是否與「選取當時」口徑一致?
D. **相容性與不擴權**:不帶宣告的呼叫是否真的與修正前逐位元同行為?`pickClientOpt` 新採之鍵是否可能被用來影響 `procOrm` 之 opt 或其他伺服端設定?`subject`/`refs` 大小與形狀驗證(`parseSubject`/`parseRefDecl`)是否有可被利用之缺口(巨量、原型鍵、非字串)?
E. **測試是否守得住契約**:`test/unit-refIdentity.test.mjs`、`test/unit-procCore-identity.test.mjs`、`test/api-identity.test.mjs`、`test/e2e-concurrent-edit.test.mjs` E2E-025～036。請用「若把某行實作拿掉/改壞,這條測試會不會變紅」的角度檢查:有沒有看似在測、實際上不論實作對錯都會通過的斷言(斷言太寬、等待條件在尚未發生時就成立、只驗不變的一側、V14 式並發測試其實沒有真的交錯)?契約中有哪些格子沒有任何測試?
F. **文件與實作是否一致**:README、ADR-037 Update(perm-run02)、`rulebook_concurrent.md` R-REF-IDENTITY-01、`spec/流程_多人同時編輯.md` 的陳述與程式是否相符(符號錨、筆數、行為描述)?

## 3. 回報格式

用繁體中文,Markdown。結構固定如下:

### 發現(依嚴重度由高到低)
每一條:
`#<序號> [高|中|低] <檔案>:<行號> — <一句話描述>`
- **情境**:讓問題發生的具體輸入/操作順序(能寫出「第一步…第二步…」最佳)。
- **後果**:錯誤結果/資料遺失/死結/誤導使用者。
- **依據**:你讀到的程式碼片段或測試斷言(貼關鍵行即可)。
- **把握度**:`確定`(讀碼即可證成)/`推演`(依賴你推演的執行順序)/`不確定`(需要實測才能判定)。
- **建議**:最小修法一句話。

嚴重度:高=會造成錯誤結果、資料遺失、死結、安全問題或發布後壞掉;中=契約缺陷、測試漏洞、邊界未處理;低=文件、命名、風格。

### 已檢視而未發現問題的範圍
列出你實際讀過並認為沒問題的檔案/函式(簡短,每項一行)。

### 未檢視或無法判定的範圍
老實列出沒讀到或無法判定的部分及原因。

## 4. 注意事項

- 不要重述改動內容;只報**問題**。已被 README「已知限制」明文列為限制的項目,若你認為限制本身造成實質風險可以提,但請標明那是已知限制。
- 每一條發現請**自己用程式碼證成後才寫**,不要只依註解或文件的說法。
- 請不要提出需要大幅重寫架構的意見,除非它是正確性問題的唯一解。
- **探測一律在副本內進行**:不得修改、建立或刪除副本內既有檔案;不得啟動服務;若要驗證純函式行為,可用唯讀查檔指令(`rg` 等)閱讀,不需執行。
- 控制在約 30 分鐘內完成。最終的完整回報就是你的最後一則回覆(輸出到標準輸出);不要把回報寫成檔案。
