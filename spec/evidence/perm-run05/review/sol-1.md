本次依序完成表完整性、對標與對稱性、實作與測試的靜態審查。未修改檔案、未執行測試、未啟動服務。「確定」表示可由已附程式或斷言直接判定；「推測」表示仍有未確認的相依實作或執行條件。

#1 [嚴重度:高] 確定：D3 排除同來源撞值，但後台入口沒有承接檢查 — 位置 server/keyCheck.mjs:375、server/procCore.mjs:443、src/js/externalRows.mjs:208、sgud/rule/rulebook_sync.md:132 — 失敗情境：mappingBy='id'、lockExternalRows=false，既有 {id:'S',from:'A',srcKey:'K',email:'a@x',isActive:'y'}；updateUsers 保留原表，再新增 {id:'K',from:'A',srcKey:'',email:'b@x',name:'B',cgrups:'{}',isActive:'y'} → 外部列守門允許新增，loginIdOf 新列回退為 'K'，撞值檢查因同來源跳過，存檔成功；其後登入 K 被拒，來源 A 同步亦因 claimTwice 回 srcKeyConflict → 預期新增撞值時整次拒收、零寫入 — 建議補上後台同來源登入識別唯一檢查，保留歷史未觸及資料的修復例外；表新增「後台新增舊形狀外部列」一格。

#2 [嚴重度:高] 確定：解析後再以內部 id 重讀，可能取得重建後另一人的權限 — 位置 server/WWebPerm.mjs:671、server/WWebPerm.mjs:684、server/WWebPerm.mjs:962 — 失敗情境：原列 A={id:'S',from:'appA',srcKey:'K',isActive:'y'}；查詢 userId=K 已解析出 S 後暫停；來源 appA 同步另一份非空清單刪除 A，系統管理者再新增後台列 B={id:'S',from:'',email:'b@x',isActive:'y',cgrups:指向GB}；查詢恢復 → getGenUserByKV 讀到 B，回傳 B 的身分與 GB 權限 → 預期查詢重試、拒絕或使用原列的一致快照，不能讓 K 取得登入識別為 S 的另一人權限 — 建議讓兩次登入查找與後續使用者讀取具有一致版本，或直接用已解析的列計算權限；補入可控制查詢交錯的案例。這個風險超過暫時查無或多筆。

#3 [嚴重度:高] 推測：D3 所稱「兩後台列主鍵重複另拒」可能在差異計算前就失效 — 位置 server/procCore.mjs:271、server/procCore.mjs:394、server/procCore.mjs:454、sgud/rule/rulebook_sync.md:132 — 失敗情境：整表請求追加兩個後台列，皆 id='U'，但分別為 name='A'/email='a@x'、name='B'/email='b@x'，其餘欄位合法且不帶 _isNew → users 沒有差異計算前的主鍵去重；依本檔記載的 ltdtDiffByKey Map 語意，兩列可能先合併，後面的驗證只看見一列，最後回成功而遺失另一列 → 預期 saveRowFieldDuplicate、零寫入 — 建議把數字 id 正規化後的重複主鍵預檢擴及 users，並新增同 id、不同 email 的案例。副本未附 ltdtDiffByKey 原始碼，此項未證實實際合併結果。

#4 [嚴重度:中] 確定：表第 13、14 格將錯誤種類的查詢鍵一律寫成查無，承諾過強 — 位置 sgud/rule/rulebook_sync.md:154、sgud/rule/rulebook_sync.md:155、README.md:130、spec/流程_查詢指定使用者權限.md:87、test/api-mapKeyId.test.mjs:320 — 失敗情境：合法外部列 A={id:'IA',srcKey:'alice',from:'A'}、B={id:'IB',srcKey:'IA',from:'B'}，兩列皆有效；舊呼叫仍傳 A 的內部 id='IA' → 現行解析唯一命中 B，取得 B 的權限，並非文件宣稱的空權限；遷移後 srcKey===id 的列也會命中自己。email/name 模式下，srcKey 若等於另一列內部 id，同樣不會查無 → 預期表與文件明列這些交叉命中情況 — 建議將回空條件限定為「該值未命中任何目前對應鍵」，補充升級風險與交叉值案例。依新登入對應返回 B 本身符合裁示，缺陷在文件保證及缺格。

#5 [嚴重度:中] 確定：離線稽核可能報零組，但使用者仍因同來源重複而不能登入 — 位置 server/tools/nameDupReport.mjs:125、sgud/rule/rulebook_sync.md:157、test/unit-nameDupReport.test.mjs:112 — 失敗情境：users=[{id:'S1',from:'A',srcKey:'K',isActive:'y'},{id:'S2',from:'A',srcKey:'K',isActive:'n'}] → --mapping-by id 的撞值組為零，登入 K 卻回 ambiguousUserFromPerm，來源 A 同步回 srcKeyConflict → 預期升級稽核能列出這組無法登入、無法同步的資料 — 建議稽核另列同來源重複及「srcKey 與舊列 id 同時主張」問題，不必沿用匯入撞值檢查的排除規則；修訂表第 16 格與 ND-005b 的預期。

#6 [嚴重度:中] 推測：照修復步驟只改 srcKey 或刪除一方，仍可能讓舊 token 對到剩下的人 — 位置 README.md:133、README.md:134、server/WWebPerm.mjs:452、server/keyCheck.mjs:325 — 失敗情境：來源 A、B 的不同使用者原皆為 srcKey='7'，getUserByToken(tA) 與 getUserByToken(tB) 仍回 id='7'；僅將 A 的 srcKey 改為 'A|7'，或清除 A 的列 → 稽核零組，但 tA 現在唯一登入到 B → 預期修復後 A 的 token 只能對到 A 或被拒絕 — 建議把跨來源唯一的前提落成明確修復步驟：匯入鍵、getUserByToken 回報值及權限查詢鍵同步切換，處理仍可驗證的舊 token；可參照 [Auth0 官方文件的來源前綴作法](https://tus.auth0.com/docs/manage-users/user-accounts/identify-users)。此項以部署方尚未調整回報值為條件，未確認實際部署。

#7 [嚴重度:中] 推測：非標準 isActive 與有效列撞值的登入回歸可漏測 — 位置 test/unit-loginId.test.mjs:170、test/unit-loginId.test.mjs:193、server/keyCheck.mjs:325 — 失敗情境：將 hits 額外篩成只保留 isActive==='y' 或 'n'；輸入兩來源同 srcKey='K'，一列 isActive='Y'、另一列 'y' → 變異碼錯誤登入有效列；現有非標準值案例只驗單列查無，撞值組合只使用 y/n，兩類斷言均無法區分這項變異 → 預期此回歸被測試抓到 — 建議加入 'Y'、true、1、空字串及缺漏值與有效列同鍵的組合，涵蓋登入及 getPermUserInfor。現行程式在此輸入的判準正確；未執行變異驗證。

#8 [嚴重度:中] 確定：部分全停用斷言仍會把查無使用者或空陣列當成成功守護 — 位置 test/api-authMerge.test.mjs:139、test/api-authMerge.test.mjs:140、test/api-mapKeyId.test.mjs:323、test/api-getPermUserInfor.test.mjs:124 — 失敗情境：API-chm-099 的既有使用者 cgrups='not json'，若查詢誤傳其內部 id 而查無 → 回全 n 仍通過；若未知使用者分支被改為 rules=[]，every(isActive==='n') 亦為真 → 預期分別驗到「確實命中既有使用者且授權降級」及「完整標的皆停用」 — 建議既有使用者案例核對 user.id/srcKey；全 n 案例核對完整標的名稱與筆數。改傳 srcKey 是正確修正，但尚未消除此類空洞斷言。

#9 [嚴重度:中] 確定：新查詢路由的碰撞日誌與不回顯查詢值契約沒有對應斷言 — 位置 test/api-mapKeyId.test.mjs:333、test/unit-loginId.test.mjs:350、spec/流程_查詢指定使用者權限.md:105、server/WWebPerm.mjs:668 — 失敗情境：沿用 MI-014 的後台 id 與外部 srcKey 同為 id-for-admin2；刪除 resolvePermUserId 的 srLog.error，或在該事件加入 userId:userIdFind → HTTP 仍回 ambiguousUserFromPerm，已附測試沒有讀取該事件，因此無法辨識漏記或洩漏識別值；MI-012 觀察的是另一個 getTokenUser-error 事件 → 預期此變異被測試抓到 — 建議 MI-014 仿照 MI-012 標記並等待日誌，驗 event、mappingBy、count 及不含查詢值。此為確定的斷言缺口，變異未執行。

#10 [嚴重度:低] 確定：修訂後 R-MAPKEY-04 仍保留與現況相反的停用列判準 — 位置 sgud/rule/rulebook_sync.md:116、sgud/rule/rulebook_sync.md:121 — 失敗情境：既有後台列 id='K'、isActive='y'，匯入 from='A'、srcKey='K'、isActive='Y' → 程式回 loginIdCollision；若兩列已存在，登入 K 回 ambiguousUserFromPerm；表第 34 格卻寫「不撞、不匹配，只有 y 參與」，判準段亦仍列停用列與他來源同 srcKey 為刻意不套 → 預期文件與 R-MAPKEY-05 一致 — 建議拆開「精確鍵值比對」與「非標準啟用值」的結果，更新這兩處，而非只靠節首取代聲明。

入口盤點已涵蓋 procCore 整表與 pickKeysOnly、syncCore 差異寫入及補償、cascadeWrite 引用端寫入；查找已追至 getTokenUser、getGenUserByKV、requireAdmin、getUserIdByToken、resolvePermUserId 與權限查詢。資料通道僅開 select；引用級聯的可見寫入只改指派欄及稽核欄。副本未含 g_*.mjs，未對離線修改工具的實作作已驗證結論。

REVIEW-END
