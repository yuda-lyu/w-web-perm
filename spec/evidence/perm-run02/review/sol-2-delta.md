### 發現

**找不到本次修正引入、可由原碼證成的功能錯誤或非預期誤拒。** 此結論依題述明訂的「異身分選取形成衝突，且不自行解除」契約作成。

### 已檢視而未發現問題的範圍

- **A：合法操作與快照邊界。** `recordPicks` 只處理 `!was.has(n)` 的最終新增啟用項；同一編輯器內啟用→停用→再啟用，只有一次回填，不會累積成多次選取。兩列的 id 集合相同時，排序後 `sameIds` 成立，包含歷史同名多筆的順序互換。空陣列與缺名稱都按 `[]` 比對；快照後才出現的新實體會造成不符，符合既有契約。依據：[refIdentity.mjs:191](C:/opensrc/開源-JS-411-8-w-web-perm/w-web-perm/tmp/perm-run02/review/repo/src/js/refIdentity.mjs:191)。

- **B：選取記錄的生命週期與後備路徑。** 三頁重建草稿都明確執行 `vo.refPicks = new Map()`；沒有找到保留舊草稿、卻單獨清空記錄的新路徑。`buildRefDecl` 仍只收集最終新增啟用名稱，沒有記錄時仍退回目前 store。依據：[Users:787](C:/opensrc/開源-JS-411-8-w-web-perm/w-web-perm/tmp/perm-run02/review/repo/src/components/LayoutContentUsers.vue:787)、[Grups:799](C:/opensrc/開源-JS-411-8-w-web-perm/w-web-perm/tmp/perm-run02/review/repo/src/components/LayoutContentGrups.vue:799)、[Pemis:799](C:/opensrc/開源-JS-411-8-w-web-perm/w-web-perm/tmp/perm-run02/review/repo/src/components/LayoutContentPemis.vue:799)、[buildRefDecl:226](C:/opensrc/開源-JS-411-8-w-web-perm/w-web-perm/tmp/perm-run02/review/repo/src/js/refIdentity.mjs:226)。

- **C：型別與 `null`。** `picks.get(n) === null || …` 會短路，避免展開衝突值；`buildRefDecl` 用 `v === null ? null : [...v]` 保護展開。非 Map 的 `picks` 也有既有守門／後備處理。衝突的拒收鏈可直接由原碼推得：
  ```js
  // buildRefDecl 產生 [{ name: 'G', ids: null }]
  parseRefDecl([{ name: 'G', ids: null }]) === null
  countRefMismatch({ keyTable: 'users', decl: null, refRows: [] }) === 1
  ```
  三頁均在此結果大於 0 時警告並 `return`，先於 API 呼叫。依據：[refIdentity.mjs:262](C:/opensrc/開源-JS-411-8-w-web-perm/w-web-perm/tmp/perm-run02/review/repo/src/js/refIdentity.mjs:262)、[Users:1454](C:/opensrc/開源-JS-411-8-w-web-perm/w-web-perm/tmp/perm-run02/review/repo/src/components/LayoutContentUsers.vue:1454)。

- **D：指定測試能抓到恢復覆蓋行為的回歸。** RI-7 兩案分別直接斷言 `picks.get('GC')`、`picks.get('G')` 為 `null`；改回新快照覆蓋後，會得到新 id 陣列，斷言必失敗。同名衝突案另驗證宣告、解析及自檢完整鏈。依據：[unit-refIdentity.test.mjs:442](C:/opensrc/開源-JS-411-8-w-web-perm/w-web-perm/tmp/perm-run02/review/repo/test/unit-refIdentity.test.mjs:442)。

  E2E-037 確實依序操作 **mary 與 john**，中間等待 store 滿足「舊 id 不存在、新 id 存在」。它核對警告框全文、`sentAll.length === 0`、庫內零寫入及草稿保留。恢復覆蓋後，宣告會採新 id 而通過前端比對，這些警告／零請求斷言便無法成立。依據：[e2e-concurrent-edit.test.mjs:903](C:/opensrc/開源-JS-411-8-w-web-perm/w-web-perm/tmp/perm-run02/review/repo/test/e2e-concurrent-edit.test.mjs:903)。

- **E：增量範圍。** 提供的 patch 除兩函數外只有註解變更。伺服端既有解析仍會將陣列內的 `ids: null` 判為格式錯誤，於讀寫前拒收。依據：[procCore.mjs:165](C:/opensrc/開源-JS-411-8-w-web-perm/w-web-perm/tmp/perm-run02/review/repo/server/procCore.mjs:165)。

### 未檢視或無法判定的範圍

遵照限制，未修改檔案、執行測試或啟動服務；上述「回歸會變紅」是原碼推演，並非實測結果。未擴大重審既有 ORM、鎖定機制及外部 E2E runner 套件。
