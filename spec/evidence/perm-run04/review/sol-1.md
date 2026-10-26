已完成讀碼與獨立探測，未執行專案測試。既有檔案未變更，夾具僅位於 probe/sol/。已盤點同步、後台存檔、引用級聯、資料通道、getUserIdByToken、requireAdmin、getPermUserInfor；離線工具未隨副本提供。email/name 路徑及新增撞值訊息、srLog 未見本次回歸；並行夾具重現混合版本造成拒絕，未證實錯登。

#1 [嚴重度:高] 確定：表漏掉「跨來源同鍵、僅一列有效」，D3 可能登入成另一來源的系統管理者 — 位置 server/keyCheck.mjs:315、server/WWebPerm.mjs:452、sgud/rule/rulebook_sync.md:108 — 失敗情境：部署接受 A、B 兩來源 token；A 的 Alice 與 B 的 Bob 皆為 srcKey='shared'，Alice 停用、Bob 啟用且為系統管理者；Alice 的有效 token 回報 id='shared' → 系統登入為 Bob，requireAdmin 亦通過 → 應依 Alice 所屬來源拒絕登入。probe/sol/token-review.mjs:256 已重現 — 建議：把經驗證的來源納入登入識別；補上兩來源啟用、停用、刪除的交叉情境。內外主鍵分離符合 SCIM，但登入丟失來源作用域；可對照 [SCIM 第 3.1 節](https://www.rfc-editor.org/rfc/rfc7643.html#section-3.1)及 [OpenID Connect 第 5.7 節](https://openid.net/specs/openid-connect-core-1_0.html#ClaimStability)。

#2 [嚴重度:高] 確定：表缺少 lockExternalRows 關閉後的列類型轉換，會漏擋新增撞值 — 位置 server/procCore.mjs:376、src/js/externalRows.mjs:238、sgud/rule/rulebook_sync.md:74 — 失敗情境：lockExternalRows='n'，既有有效外部列分別為 {id:'K',srcKey:'A-key',from:'A'}、{id:'p',srcKey:'K',from:'B'}；將第一列 from 改為 '' → 兩列 id 都在 idsActOld，撞值檢查判為未觸及，外部列守門亦放行，登入 K 從成功變成 ambiguousUserFromPerm → 應整次 loginIdCollision、零變更。probe/sol/login-review.mjs:417 已重現 — 建議：以列類型及登入識別是否改變判斷觸及，保留原樣歷史撞值的豁免。

#3 [嚴重度:中] 確定：UL-010 只驗成功回應，無法守護缺 id 使用者確實新增 — 位置 test/unit-procCore-loginId.test.mjs:208、server/procCore.mjs:407 — 失敗情境：送入缺 id 的新使用者；若把 users 的 noId 追加移除 → 新列完全未入庫但仍回成功，UL-010 的唯一斷言仍成立 → 應因使用者未建立而測試失敗 — 建議：斷言新增筆數、生成的非空 id、完整欄位及既有列不變；此變異依所附測試讀碼未被其他斷言覆蓋。

#4 [嚴重度:中] 確定：ORM 失敗測試沒有覆蓋第二次 select — 位置 test/unit-loginId.test.mjs:153、server/keyCheck.mjs:315 — 失敗情境：第一次 id 查詢回傳後台使用者，第二次 srcKey 查詢拋錯；若把第二次錯誤吞成空陣列 → 系統會接受第一次結果，而 LI-020 的替身永遠在第一次查詢就拋錯，無法抓到此變異 → 應傳遞失敗、拒絕登入 — 建議：增加「第一次成功、第二次失敗」案例，並驗證 API／資料通道不執行後續動作。

#5 [嚴重度:中] 確定：新判準缺少精確空白及非標準啟用值的回歸斷言 — 位置 test/unit-loginId.test.mjs:41、test/unit-loginId.test.mjs:198、server/keyCheck.mjs:293、server/keyCheck.mjs:341 — 失敗情境：將登入識別回傳改成 row.srcKey.trim()，srcKey 與 token id 同為 ' K ' 時會由成功變成查無；或將撞值參與條件放寬為接受 'Y'，原本無效的列會阻擋存檔 → 所附相關案例均未覆蓋這些變異 → 應維持原值精確比對且僅 'y' 參與 — 建議：把這些輸入加入三個入口的測試；目前獨立邊界探測通過，但專案測試缺少守護。

#6 [嚴重度:中] 確定：輸入表與測試缺少撞值和其他錯誤共存的優先序 — 位置 test/unit-syncCore.test.mjs:782、server/syncCore.mjs:216、server/syncCore.mjs:229、spec/流程_外部應用同步權限資料.md:640 — 失敗情境：有效後台列 id='K'，來源 X 庫內另有重複 srcKey='old'，本批送入有效 srcKey='K' → 現行先回 loginIdCollision；若將撞值檢查移到庫內來源鍵檢查之後，會改回 srcKeyConflict，仍符合目前靜態測試的「寫入之前」條件，既有單一錯誤案例亦無法區分 → 應守住所載檢查順序 — 建議：增加混合錯誤案例，同時斷言優先錯誤鍵與零寫入。

#7 [嚴重度:低] 確定：README 仍宣稱預設 id 模式下外部 id 與內部 id 相同 — 位置 README.md:102、README.md:130 — 失敗情境：新匯入使用者 srcKey='external-7'、內部 id='generated-1' → 第 102 行仍說預設 mappingBy='id' 時兩者相同，與第 4 項及實作矛盾 → 文件應明確說明新外部列兩者不同 — 建議：更新呼叫者身分段落，並說明 getPermUserInfor 的 userId 仍是內部 id。

REVIEW-END