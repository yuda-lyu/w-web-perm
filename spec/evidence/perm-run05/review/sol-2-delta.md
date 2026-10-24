本次僅唯讀審查，未執行測試、服務或變異。未發現可確定的新增執行期錯誤；以下為測試與文件缺口。改壞範例均屬推測（未執行變異），並非現行程式已發生的結果。

#1 [嚴重度:中] 確定（已讀碼）：競態修正的靜態斷言仍容許重新讀取使用者 — 位置 test/unit-loginId.test.mjs:378、server/WWebPerm.mjs:673 — 失敗情境：將回傳欄位 userFind: user 改壞成 userFind: user && await getGenUserByUserId(user.id)，仍符合 includes('userFind: user')，其他新增接線斷言也仍成立；具體輸入為查詢 K，先解析到 {id:'S',from:'A',srcKey:'K'}，重讀前該列被刪除並由 {id:'S',from:'B',srcKey:'J'} 取代 → 改壞後會回傳 J 的權限，循序案例無法辨識 → 預期使用解析出的列，避免取得另一人的權限 — 建議增加可控制查詢順序的 ORM 替身案例，在解析後替換同 id 列，驗證結果仍採原列且沒有額外的使用者重讀。

#2 [嚴重度:中] 確定（已讀碼）：新增 sameFrom 測試未涵蓋停用與非標準 isActive — 位置 test/unit-loginId.test.mjs:292、test/unit-procCore-loginId.test.mjs:300、test/unit-nameDupReport.test.mjs:113 — 失敗情境：既有 {id:'S',from:'A',srcKey:'K',isActive:'n'}，保護關閉時新增 {id:'K',from:'A',srcKey:'',isActive:'y'}，兩列給不同 email；若在 server/keyCheck.mjs:386 前加入「任一方非 y 就 continue」 → 後台將放行 claimTwice，但上述新增案例的兩側皆為 y，斷言仍成立 → 預期不論 isActive 均拒絕 loginIdCollision，reason 為 srcKeyClaimTwice — 建議對 sameFrom 補雙方有效／停用及非標準值組合，並驗證整批零寫入。

#3 [嚴重度:中] 確定（已讀碼）：損壞 cgrups 案例仍有 rules=[] 的空洞斷言 — 位置 test/api-authMerge.test.mjs:140、test/api-authMerge.test.mjs:141 — 失敗情境：現有輸入 srcKey='sk-chm2-u0'、cgrups='not json'；若將解析失敗分支改壞成保留正確 user、直接回 rules:[] → every(isActive==='n') 為 true，新增的 user.srcKey 斷言也成立 → 預期列出全部標的且逐筆為 n — 建議保留本人斷言，另將 rules 的名稱集合及筆數與實際 targets 比對，避免空陣列或缺項通過。

#4 [嚴重度:低] 確定（已讀碼）：README 第4節仍混淆同來源衝突的排除規則與修復方式 — 位置 README.md:132、README.md:133；對照 server/keyCheck.mjs:381、server/syncCore.mjs:232、server/syncCore.mjs:243 — 失敗情境：同來源 A 已有 {id:'S',srcKey:'K'} 與無 srcKey 的 {id:'K'}，送更正批次 {from:'A',rows:[{srcKey:'K2',…}]} → 實際回 srcKeyConflict，且因庫內 claimTwice 預檢，改送新鍵仍無法清除異常；第4節卻籠統排除同來源列，並宣稱稽核列出的衝突下次匯入均回 loginIdCollision → 預期文件區分同來源混合新舊形與一般重複，說明各自的拒收鍵及可行處置 — 建議同步三種排除條件，並明列同來源庫內異常須人工清理或依第1節使用 g_purgeFrom.mjs 清源後重匯入。

REVIEW-END
