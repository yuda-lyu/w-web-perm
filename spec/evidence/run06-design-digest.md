# run06 設計摘要(子代理必讀;主責 agent 撰寫,2026-10-22)

專案根:`C:/opensrc/開源-JS-411-8-w-web-perm/w-web-perm`(以下路徑皆相對於此)。

## 目標(使用者裁示)

1. **刪除連帶清理(適用表 n)**:刪除群組/權限/標的時,於**同一次寫入內**清理所有引用:`users.cgrups`(引用 `grups.name`)、`grups.cpemis`(引用 `pemis.name`)、`pemis.crules`(引用 `targets.id`)。效果等同舊版「找不到即忽略」。**不採**「被引用則禁止刪除」。刪除前確認框須說明「將自 N 位使用者／N 個群組移除此引用;其中以 AND 引用者,移除後限制解除、權限可能變多」。
2. **改名級聯(適用表 m,階段 1:群組＋權限;標的 id 改名為下一階段)**:群組/權限改名(同 id 異 name)時,引用字串於同一次寫入內連帶改名;預設開,伺服端 `opt.cascadeRename:false` 可關(只管改名)。外部同步(同一 `from` 內依穩定 id)同樣適用(同 id 改名＝級聯;舊 id 消失＝刪除並清理)。改名前頁面預覽受影響筆數;級聯會改寫外部 users 列之 `cgrups`,確認框須警示。
3. 拒絕條件(收嚴＋提示):新名撞「仍被啟用中引用而無任何實體」之懸空名(`renameCascadeNameInUse`);被改名者屬歷史同名組且該名稱仍被引用(`renameCascadeDupGroup`);容器內新名與另一既有項目相撞(`renameCascadeConflict`)。皆整次拒存、零變更。
4. 失敗回復:**引用端先寫、主體後寫;任一步例外 → 以寫入前原值補償還原引用端**(不依賴「重存即自癒」);補償也失敗 → `saveCascadePartial`。互換(A↔B)、鏈式(A→B,B→C)同時套用。
5. 鎖:單一階層與單一取鎖函數 `withTabLocks`(`targets < pemis < grups < users`,引用端階層恆高於被引用者);先取本表鎖,**僅在本表有改名或刪除時**才於內層再取引用端表之鎖(`held` 參數檢查階層);巢狀同鍵與相反次序皆死結(`pmKeyMutex` 非可重入)。

## 已實作之程式(請先讀,勿重寫)

- `src/js/refCascade.mjs`(純函數,前後端共用):
  - `REF_OF = { grups:{holder:'users',field:'cgrups',kind:'ref'}, pemis:{holder:'grups',field:'cpemis',kind:'ref'}, targets:{holder:'pemis',field:'crules',kind:'rule'} }`
  - `rewriteRefs(str, { kind, rename: Map(舊名→新名), del: Set(名稱) })` → `{ str, changed, nRename, nDel, conflict }`;未命中者同一字串原樣回傳;壞 JSON/空字串不動;物件形式輸出物件、陣列形式輸出陣列。
  - `diffRefTargets({ keyTable, rowsOld, rowsNew, opt })` → `{ renames:[{id,from,to}], rename:Map, delNames, del:Set, oldById, newById }`。
  - `planRefChanges({ keyTable, rowsOld, rowsNew, holdersOld, opt:{cascadeRename} })` → `{ err, keyTable, holder, field, renames, delNames, changes:[{id,field,before,after,nRename,nDel,from}], nHolders, nRenameHolders, nDelHolders, nExternal }`;`err` 為 `null` 或 `'renameCascadeDupGroup'|'renameCascadeNameInUse'|'renameCascadeConflict'`。
  - 規則:身分以主鍵 id;舊列 id 不在新表＝刪除,其名稱若仍有「同 id 同名」之存續列(歷史同名只刪其一)則不清理;刪除後以同名新增(新 id)者**不繼承**引用;targets 的 id 即名稱(改 id＝刪舊增新,不級聯)。
- `server/cascadeWrite.mjs`:`checkCascadePlan(plan)`(引用端改寫列之預檢)、`writeWithCascade({plan,holdersOld,woItems,procOrm,userId,srLog,writeMain})`(引用端先寫→主體→失敗補償)、`buildSyncRowsNew(keyTable, rowsOld, rows, from)`(外部同步之寫入後整表,供規劃;未帶 id 之列依名稱對應)。
- `server/keyCheck.mjs`:`withTabLocks(kmx, keyTables, fn, held=[])`、`tabWriteKey`。
- `server/procCore.mjs`:`updateTabItems` 於 `withTabLocks(kmx,[keyTable])` 內,有改名/刪除時內層再取引用端表鎖,`planRefChanges` → `writeWithCascade`;`proc(woItems, procOrm, { srLog, kmx, lockSave, mappingBy, cascadeRename=true })`。
- `server/WWebPerm.mjs`:`syncAndReplaceTabs` 同上;`opt.cascadeRename`。
- 語系鍵(`server/procLang.mjs`):`renameCascadeDupGroup`、`renameCascadeNameInUse`、`renameCascadeConflict`、`saveCascadePartial`。
- 前端既有:`src/js/getDelRefCount.mjs`(`getDelRefCount`／`getDelConfirmText`,文案鍵 `confirmDelAndRefsGrup/Pemi`、`confirmDelDupRefs*`、`confirmDelBothRefs*`)、`src/js/getAuthWarn.mjs`(`countAndRefs`、`fmtWarn`、`getRefWarns`)。

## 不變式(測試須守)

- 級聯後各使用者之最終授權(以真 `getUserRules`)與改名前逐使用者相等(含互換、鏈式、陣列形式、外部 users 列)。
- 未命中任何改名/刪除之引用字串逐字不動;被拒時四張表零變更(逐位元比對);無改名/刪除之寫入不得對引用端表寫入(`cnt.save`/`cnt.insert`/`cnt.del` 不增)。
- 補償後引用端列(含 `userIdUpdate`、`timeUpdate`)與寫入前逐位元相同。
- 取鎖次序一致,不死結(並行 `updateGrups ∥ updateUsers ∥ syncAndReplaceTabs(grups)`)。

## 守則(全域)

- 繁體中文回報;程式註解風格同周邊(繁中、密度高、說明 why)。
- 暫存檔只放 `C:/opensrc/開源-JS-411-8-w-web-perm/w-web-perm/tmp/run06/<你的名稱>/`,不用 `/tmp`、`$TMPDIR`、`$HOME`;測試程式之臨時檔放 `test/_tmp/<案名>/`。
- **不用 `cd`**(用絕對路徑或指令自帶目錄參數);**不用 heredoc/cat/echo 寫檔**,一律用 Write/Edit 工具;搜內容用 Grep、找檔名用 Glob(專案資料目錄龐大,Bash `grep -r`/`find` 會逾時)。
- 腳本用 `.mjs`;不用 PowerShell。
- 長輸出之指令一律經 `node C:/opensrcOper/tools/quiet-run.mjs --name <短名> -- <指令>`;要看更多以 Grep 搜其 log。
- 不得 git commit/push/tag/stash/checkout/reset;不得改 `CLAUDE.md`、`CLAUDE_settings.md`、`sgud/rule/rulebook.md`、`spec/`(除非任務明列);不得重產或改標準圖(`test/pics/**`);不得改其他套件 repo、`package.json` 版本。
- **不跑瀏覽器 e2e**(除非任務明列)、不跑全套。單元/API 測試:`npx mocha <檔> --timeout 60000`(經 quiet-run)。
- 完成後的最後回覆:列出新增/修改之檔(路徑)、執行之指令與結果(通過/失敗數)、未完成或有疑慮之處、需主責裁示之事項。
