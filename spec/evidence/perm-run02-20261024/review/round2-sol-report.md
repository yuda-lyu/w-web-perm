```text
    let clearSystemAppId = (id) => {
diff -ru -x diff.patch -x diff-stat.txt tmp/perm-run02/review-copy/README.md tmp/perm-run02/review-copy2/README.md
```

G1 | 高 | server/WWebPerm.mjs:778 | `mappingBy=email`，請求 B 經 `app:key-ghost` 管理員列驗證，該列隨後被刪；B 執行 `clearSystemAppId` 後、`requireAdmin` 判定前，合法系統服務請求 A 又登錄同 id → B 查無列，卻沿用 A 的近期登錄而獲准寫入；應回 `userNotAdmin`。F3 清除無法阻止後續請求重新填入共用 Map | 將用途證明綁定本次呼叫並傳給 `requireAdmin`；補「B 清除 → A 登錄 → B 判定」案例，以可控制完成時點的 ORM Promise 固定順序。

G2 | 中 | server/WWebPerm.mjs:1315 | B 已取得同 id 的有效管理員列，停在非同步 `verifyClientUser`；刪列後，合法系統服務請求 A 驗證、登錄，並開始 `requireAdmin` 查詢；B 此時完成驗證並清除登錄，A 隨後取得查無列結果 → A 被誤拒 `userNotAdmin`。若 A 判定時仍有有效管理員列則通過；若列停用或非管理員則本來就應拒；誤拒發生於查無列且登錄被另一請求清除時 | 採每次呼叫獨立的驗證上下文，補上述交錯及列仍存在的對照案例。

G3 | 中 | test/api-callerMatrix.test.mjs:607 | MX-M6 的 600ms 從 `callRpc` 開始計時，但工具會先執行 `buildDecl` 的兩次讀取，未確認後端已進入 2000ms 等待。推測：慢速 ORM／排程可使刪列早於身分讀取，得到 `cannotGetUserFromPerm`；或晚於 `requireAdmin`，造成成功寫入，兩者均使正確實作偶發失敗。前置操作若超過登錄的 60 秒 TTL，移除清除功能的變異也可能因登錄自然過期而假通過 | 預先組好宣告，以進入訊號及可釋放的 Promise 同步；刪列完成才放行驗證，並確認拒絕來自 `requireAdmin-error`。用延遲 ORM 替身驗證上述時序及 TTL 邊界。

G4 | 低 | test/api-callerMatrix.test.mjs:559 | MX-M5 使用的 TOKEN_AS 為 `email=''`、`name='key-sys'`，新增列卻是 `collide@example.com`／`collide`；兩種對應鍵均未命中，只靠相同主鍵攔住。MX-R5 也保留相同主鍵 → 尚未覆蓋「嚴格系統服務形狀，外部 id 與列主鍵不同，只靠 email／name 命中停用列」。只對嚴格形狀略過對應鍵查找、仍保留主鍵檢查的變異缺少此格守護 | 補合法 email／name 相同、主鍵不同的停用列，驗證登入、標頭、本體與兩條應用路由皆拒。

G5 | 低 | test/api-callerMatrix.test.mjs:721 | 不在表的 NFV／AUX 可用 `/syncAndReplaceTabs?keyTable=users` 匯入 `srcKey='sso-admin-77'`、`isAdmin='y'`、`isActive='y'` 的自身列，之後同一 token 即可依 perm 列通過後台與資料通道 → ① 的權限擴張包含自行建立後台管理員身分；現有相容測試只同步 `grups`，MX-R7 建立 users 列使用的是 TOKEN_ADMIN | 補這條權限轉換案例，明確固定依既定政策由拒絕轉為通過，以及稽核 id 由外部 id 轉為 perm 主鍵的結果。

G6 | 低 | sgud/rule/rulebook_security.md:119 | 外部反查 `isAdmin='y'`，但命中停用列或有效的一般使用者列 → 實際分別拒絕 `cannotGetUserFromPerm`／`userNotAdmin`；新增「相容性結論」仍宣稱僅反查 `isAdmin` 非 `'y'` 的身分被拒，第 92 行也有相同過廣敘述 | 比照 README 第 133 行，補上命中非有效管理員列亦可能中斷的條件。