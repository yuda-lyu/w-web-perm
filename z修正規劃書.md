# w-web-perm 修正規劃書

## ✅ 覆核(2026-07-11 主代理派獨立子代理逐項查證)

> 逐項讀碼 + 實跑複驗本書宣稱: **全數屬實, 無待修項, 未動任何檔案**。
>
> - **A-C1 已落地**: no-op「複寫isAdmin」死碼已刪(`WWebPerm.mjs:457-460` 現為說明註解, `isAdminSrc`/`isAdminSelf` 僅餘註解內歷史記載, 無孤兒變數);JSDoc(`:43`)已改「token 之 isAdmin 僅供識別, 權限系統以自身 users 表為權威」語意。
> - **測試管線結構屬實**: `test/run-e2e-isolated.mjs` 以 `readdirSync` 動態列舉 `^e2e-.*\.test\.mjs$`(非寫死清單);`package.json` `test` = `test:apiunit && test:e2e`, `test:apiunit` 為 mocha glob 白名單;`e2e-setup.mjs:35-36` `startedBackend`/`startedFrontend` 雙旗標分拆, `backendOnly` 不污染前端 once 語意。
> - **實跑**: unit-staEvent **6 passing**(UNIT-001~006, 含 `UNIT-006-procStaInfor-reject-keys-on-failure`;舊 `server/staLogs/test_staEvent.mjs` 已刪)/ api-getPerm **6 passing** 且編號 001~006 ≡ spec bullet(含新補 E2E-006)。
> - **M-5/M-6 屬實**: getUserRules 46 個 it 中 38 個帶 UNIT-NNN 錨點;4 條唯讀檢視 spec bullet + 4 個 e2e readonly case + 8 張 readonly baseline(eng/cht)皆在;`procLang.mjs:741` 為 `Permission groups of user`。
> - **未重跑部分(非否證)**: M-6 三支 e2e suite 之 16/12/12 passing 因單支 4-9 分鐘僅做靜態結構查證, 未實跑覆驗。

## 🔍 稽核追加(2026-07-11 codex+opus 三維度稽核 → 主代理逐項查核濾誤報)

> 本輪為「架構一致性 / 函數風格一致性 / 程式碼弱點」三維度稽核。codex 因未認證未跑, 本輪僅 opus 半邊 + 主代理讀碼複查。**共發現 1 項實質待修(A-C1, 待業主裁決授權方向)**, 其餘皆命中既有 ADR / 凍結區。

### A-C1 [程式碼弱點 / 契約矛盾] `getTokenUser` 之 isAdmin 覆寫為 no-op, 與 JSDoc 契約互斥

- **位置**: `server/WWebPerm.mjs:457-462`
  ```js
  //複寫isAdmin
  let isAdminSrc = get(userSelf, 'isAdmin', '')   //token(getUserByToken)提供
  let isAdminSelf = get(userFind, 'isAdmin', '')  //perm users 表既存值
  if (isAdminSrc !== isAdminSelf) {
      userFind.isAdmin = isAdminSelf               //把自己指派給自己 → 恆為 no-op
  }
  ```
- **靜態控制流確證(§4 規則 6)**: `isAdminSelf` 即 `userFind.isAdmin`, 故 if 內之指派恆為 no-op。主代理已讀碼確認, 100% 確定。
- **契約矛盾**: JSDoc(`WWebPerm.mjs:43`)明載「`getUserByToken`…isAdmin 輸入 'y' 時**會複寫**權限系統該使用者之 isAdmin 欄位值」。意圖應為 `userFind.isAdmin = isAdminSrc`(typo: `isAdminSelf` 應為 `isAdminSrc`)。現行 code 達不到文件語意。
- **觸發路徑**: `getTokenUser` 回傳之 user → `getAndVerifyClientUser`(:490)→ `verifyClientUser`(srv.mjs:58 判 `isAdmin==='y'`)。當「token 解析 isAdmin='y' 但 perm users 表該筆 isAdmin='n'」時, 依 JSDoc 應放行為 admin, 實際卻 reject。
- **真痛三條件**: ①在合約內=**是**(JSDoc 為套件公開契約);②已被觀察=**否**(參考部署 srv.mjs 中 token 與 seed admin 皆 isAdmin='y' → 分支不進, 缺陷被遮蔽, 無 ticket / 重現);③後果具體=**條件式是**(僅整合情境觸發, 後果為授權判定與文件相反)。
- **⚠️ 授權語意決策(2026-07-11 業主裁決: 採 (b) 保守解)**:
  - (a) code 對齊文件 `userFind.isAdmin = isAdminSrc` —— 啟用「token 可提權為 admin」, 屬授權擴大。**未採用。**
  - **(b) 文件對齊 code(✅ 已執行)** —— perm users 表為 isAdmin 權威、忽略 token 宣稱。
- **✅ 已執行(2026-07-11, 業主裁決 (b))**:
  - 刪除 `WWebPerm.mjs:457-462` 之 no-op「複寫isAdmin」死碼(含孤兒變數 `isAdminSrc`/`isAdminSelf`), 改為註解說明「isAdmin 權威為 perm users 表, 不以 token 複寫」。
  - 修正 JSDoc(`:43`)`getUserByToken` 之 isAdmin 描述: 由「輸入'y'時會複寫權限系統該使用者之 isAdmin」改為「token 之 isAdmin 僅供識別, 權限系統一律以自身 users 表之 isAdmin 為權威, 不被 token 宣稱值複寫」。
  - **不擴大授權**(維持實際運行行為 = perm 表為權威)、爆炸半徑最小。
  - **驗證**: 功能等價(no-op 移除);`node --check` 通過;`api-getPerm` + `api-getPermUserInfor` **12 passing / 0 failing**(直接行使 getTokenUser → verifyClientUser 之 isAdmin 路徑, 無迴歸)。

### A 其他(非缺陷, 已查核歸檔)
- (觀察)`mShare.mjs` 群組層 `arrFinder→filter`(:400,404)與權限層 `filter→arrFinder`(:411,412)順序相反, 因 name-match 與 isActive 為互斥獨立述詞, 結果集恆等, 屬凍結演算法(ADR-001/004/005 測試守護)—— 不動。
- verifyConn 對無效 token reject 而非 return false(fail-closed, 四姊妹共用慣例)、token 經 URL query、前端 4 清單頁/5 對話框樣板重複(重構凍結)、死碼(procLang 16 死鍵 / deleteItemsCheck, ADR-014)、測試命名三例外(ADR-017)—— 皆命中既有決策, 不列待修。

---

> ## ✅ M-1 ~ M-7 執行狀態: **全部完成**(2026-07-10, 主代理 + opus 子代理分工)
>
> | 項 | 處置 | 結果 |
> |---|---|---|
> | M-1+M-2+M-3 | `test_staEvent` 重寫為 `test/unit-staEvent.test.mjs`(fixture-based 真斷言, 涵蓋 staEvent 語意/窗外排除/staEventTable 巢狀窗/filterVpfsByWindow 粒度自適應/day 檔整合);`test:unit` 改指 mocha;舊 demo script 刪除 | ✔ 6 passing;`npm run test:unit` exit 0, **短路解除** |
> | M-4 | api-getPerm 編號對齊 spec(006→002, 002→003, 003→004, 004→006)+ spec 補 E2E-006 bullet | ✔ 6 passing, 編號 ≡ spec bullet |
> | M-5 | getUserRules 46 個 it 之 38 個加 UNIT-NNN(+a/b/c 子編號)錨點, 8 個純擴充不加 | ✔ 46 passing |
> | M-6 | 4 對話框唯讀檢視: spec 補 4 bullet + e2e 補 4 case(×2 語系)+ 8 張 baseline 手術式產製(`--names`) | ✔ 三支 suite 正常比對模式全綠: rela-user-grup **16** / rela-pemi-rule **12** / rela-grup-pemi **12** |
> | M-7 | 子代理調研訂正前提(WWebPerm wrapper 為 log+rethrow, reject 源頭在 procStaInfor:83/:109);api-level RPC 觸發需自建 client+專屬後端(不成比例)→ 裁決採 unit 層直測源頭 | ✔ `UNIT-006-procStaInfor-reject-keys-on-failure` 綠(fdLog 指向檔案觸發真實 reject key) |
> | 附帶 | **production i18n 缺陷修復**: `procLang.mjs:741` `userEditCgrupsForDisplay.eng` 原與編輯版同值 `Edit list of user`(唯讀對話框標題顯示 Edit、e2e 無法以標題辨模式), 已改 `Permission groups of user`(比照姊妹鍵去 Edit 動詞), 於 baseline 產製前修正故新圖即正確版 | ✔ |
>
> **驗收(單檔/分層, 全綠)**: unit-staEvent 6 / getUserRules 46 / api-getPerm 6 / 8 原 suite(2026-07-10 上午: targets 20/pemis 20/grups 20/users 22/rela×3/init 10)/ 3 修改 suite 16+12+12。
>
> ### ✅ 已破案並修復(2026-07-10 深度調研): 合併式 `npm test` 之 e2e 失敗 —— **兩層獨立既有 bug**
>
> 最小重現二分(`npx mocha test/api-getPerm.test.mjs test/e2e-grups.test.mjs` 60 秒重現)逐層剝開, 發現**兩個獨立的既有 bug**, 皆因 M-1 修好 `test:unit` 短路後、mocha 合併相史上首次執行才曝光(「修好水管才發現牆裡兩處漏水」), 與本輪各項改動無關。
>
> **第一層 — `startServersOnce` 單一 once 旗標被 `backendOnly` 污染 → 前端永不 spawn**
> - 偵察證據: openApp 失敗當下 `page.url()` = `chrome-error://chromewebdata/`(goto 連不上前端, 非 reload race)。
> - 根因: `startServersOnce(opts)` 用**單一** `started` 旗標;api 測試經 `api-setup.mjs:21` 以 `{ backendOnly: true }` 先呼叫 → 旗標 true、只起後端即返回 → 後續 e2e 檔呼叫直接 `return` → **前端 dev server 永不 spawn** → 全 e2e 之 openApp 連線失敗連環倒(before-all cascade)。
> - **修法**: once 旗標依服務分拆為 `startedBackend`/`startedFrontend`(`e2e-setup.mjs:35-36` + startServersOnce 內), backendOnly 只跳過前端段、不再毒化前端 once 語意。
> - 驗證: 最小重現修復後 **26 passing / 0 failing**。
>
> **第二層 — 合併模式下 e2e 繼承 api 相之後端, 對話框 grid 列序(`sortBy order`)被 api 還原 RPC 正規化 → pixel mismatch**
> - 第一層修好後, before-all cascade 消失, 但浮現 64 顆**對話框類 case 之 pixel mismatch**(grups E2E-008、pemis E2E-008-crules、rela-pemi-rule 整支等)。
> - **§4 規則 3 紀律: 讀 diff 圖不臆測** —— grups E2E-008 之 diff/capture/baseline 三圖顯示: **同一份資料、grid 列序相反**(baseline `peter,mary,john,admin` vs capture `admin,john,mary,peter`), 非渲染雜訊。
> - 根因(讀碼+實驗): 對話框 grid 依 `sortBy(rs, 'order')` 排序;合併模式下 e2e 檔**重用 api 相先 spawn 的後端**, 而 `api-updateTabs`(32 處寫入)與 `api-syncAndReplaceTabs` 之 suite-after 以 `updateXxx` RPC 整表寫回還原, 該 RPC **重給 `order` 欄位** → 還原後 order 值序與 `g.initialTestData` 原始不同 → 對話框列序遂與「solo 自產 baseline」不符。**e2e 之 `resetDb` 僅還原 grups 表, 不還原 users/pemis/targets**, 故窗外汙染殘留。
> - **既有性確證**: 這批 case **單檔跑全綠**(solo 各自 spawn 全新後端 = 純 g.initialTestData 種子);僅合併模式失敗。本專案 e2e 檔本就設計為逐檔獨立(自 seedDb + 自 spawn 後端 + --baseline 直跑入口), 塞進單一 mocha 進程共用後端才是錯誤執行模型。對照組: w-web-sso 之 `resetToBaseSeed` 以 `delAll`+程式常數**重建全表**, 故其合併 e2e 可綠。
> - **修法(零改 baseline / 零改 production)**: 新增 `test/run-e2e-isolated.mjs` —— 每個 browser e2e 檔以獨立 mocha 進程執行, 每檔前只殺後端(11006)使其重 seed+spawn 全新後端、前端(8090)保持暖機共用。`package.json` 之 `test` 改為 `test:apiunit`(unit+api+e2e-doubleclick 合跑)`&& test:e2e`(逐檔隔離)。
> - 驗證: 先前失敗之 grups **20/0**、rela-pemi-rule **12/0** 於隔離機制下轉綠。**全量 `npm test`(新結構)終驗(2026-07-10 22:47)**: 階段一 `test:apiunit` **82 passing** / 階段二 `test:e2e` **9 個 e2e 檔逐檔 exit 0** = **全綠 0 failing**。
> - **2026-07-11 審計輪補強(pattern 化)**: 初版 `test:apiunit` 與 runner 用**寫死檔名清單**, 未來新增測試檔會被靜默漏跑(違反全域 §14.3「納入規則用 pattern 白名單」)。已改: `test:apiunit` 用 mocha glob(`test/unit-*.test.mjs test/api-*.test.mjs test/getUserRules.test.mjs`), runner 以 `readdirSync` 動態列舉 `^e2e-.*\.test\.mjs$`(e2e-doubleclick 一併納入隔離跑, 換取零遺漏)。**pattern 化後全量終驗(2026-07-11 01:35)**: 階段一 78 passing + 階段二 **10 個 e2e 檔全 exit 0**(doubleclick 4 + 原 9 檔)= **全綠**。
>
> 📌 **操作面教訓**: 先前數次合併跑批的百餘顆混亂失敗, 另摻雜「中斷 mocha 留下殭屍進程互搶埠 + Windows LMDB 記憶體映射殘留」之環境污染(調研時在 perm 抓到 4 隻同型殭屍)。§11.4「kill 後須回驗」再次應驗——被污染的觀測不可作為結論依據。

> **最後更新**: 2026-07-09(主代理獨立複核 + spec/test 全面盤查後改寫)
> **行號基準**: 2026-07-09 之工作區狀態。**動手前務必先 grep 確認行號**, 勿盲信本文行號。

---

## 零、執行紀律(動工前必讀)

1. **這是「套件」專案**。附帶範例資料(`db/*.mdb`)、`settings.json` 保存方式、部署安全、token 傳輸方式、整合者接線(`getUserByToken` / `verifyConn` / `verifyClientUser`)**皆屬整合者責任**, 不是本套件缺陷, 一律不要報成問題。
2. **真痛三條件**(全滿足才動手): ①在合約內 ②已被觀察 ③後果具體。「不夠優雅 / 不對稱 / DRY / 業界最佳實踐」不是後果, 屬鍍金型假痛。
3. **資料規模認知**: 權限管理後台, `targets` / `pemis` / `grups` / `users` 實際筆數為**數十~低百筆**。以「資料量成長到數千筆會卡頓」為前提的效能提案, 在此領域前提不成立。
4. **e2e pixel baseline 是硬約束**。動到 `src/components/*.vue` 之 template 或渲染輸出者, 都可能造成 baseline drift。現行 **8 個 e2e suite 全綠**, 動手後**必須全數重跑驗證**;重產 baseline 須**先經業主授權**。
5. **既有死碼不主動刪**(ADR-014)。`procLang.mjs` 內 16 個已註解之死語系鍵, **不要再報, 也不要刪**。`VePemiBlngGrups` / `VeGrupBlngUsers` 之 `deleteItemsCheck` 死功能是**刻意停用**, **不要「修好」它**。
6. **已定案的設計取捨不要重複「發現」**: 見 `spec/設計要點與取捨.md` 之 **ADR-017**(測試命名三例外)、**ADR-018**(token 失效模擬例外)、**ADR-019**(語系切換 e2e 之移除決定)。盤查 agent 命中這些請直接引 ADR 跳過。
7. 暫存檔一律落 `C:\opensrc\w-web-perm\tmp\`;探索用 Glob/Grep/Read, 禁止 dump-to-disk。
8. 不主動 commit。
9. **只做本規劃書明列之項目**。凍結區(§四)一律不碰。

---

# 第一部 · 待修正

> 依嚴重度排序。**M-1 阻斷整條測試管線, 應最優先。**

## M-1 |【嚴重】`npm test` 完全失效 —— mocha 從未執行

**現況(實測鐵證)**:

```
$ node server/staLogs/test_staEvent.mjs ; echo $?
Error: fd[./_logs] is not a folder
1
```

`package.json:44` 定義 `"test": "npm run test:unit && mocha --timeout 300000"`。`test:unit`(`package.json:43` = `node server/staLogs/test_staEvent.mjs`)**exit=1** → `&&` 短路 → **mocha 一次都沒跑過**。而 mocha 那段涵蓋 `test/*.mjs` 全部 **208 個 case**(4 支 api + 1 支 unit + 10 支 e2e;專案無 `.mocharc`, 走 mocha 預設 spec glob)。

**根因(逐層追到底)**:

| 層 | 事實 | file:line |
|---|---|---|
| 1 | `test_staEvent.mjs` 呼叫 `staEvent(7, 'hr')`, **未傳 `fdLog`** | `server/staLogs/test_staEvent.mjs:6` |
| 2 | `staEvent.mjs` 取不到 `fdLog` → 走硬編 fallback `'./_logs'` | `server/staLogs/staEvent.mjs:19-22` |
| 3 | `./_logs` 已依業主指示更名為 `./logs`(對齊 `settings.json:40` 之 `logFd: './logs'`) | 目錄現況 |
| 4 | `fsTreeFolder('./_logs')` → `Error: fd[./_logs] is not a folder` | `staEvent.mjs:43` |

**修法(擇一, 建議 A)**:

- **A(建議)**: 讓 `test_staEvent.mjs` 與 production 走同一設定來源 —— 讀 `settings.json` 的 `logFd` 傳入 `staEvent(7, 'hr', { fdLog })`。**不要**去改四處 fallback 常數(見下方「不要這樣修」)。
- B: 把四處 fallback `'./_logs'` 一律改為 `'./logs'`。**風險**: `'./_logs'` 是 w-syslog 套件自身的預設值, 四處 fallback(`srLog.mjs:10` / `procStaInfor.mjs:52` / `staEvent.mjs:21` / `staEventTable.mjs:18`)目前**彼此一致**——寫入端與讀取端同時 fallback 到同一目錄, 語意自洽。單方面改讀取端會破壞此一致性。

> **不要這樣修**: 不要只把 `test_staEvent.mjs` 從 `test:unit` 拿掉了事 —— 那會掩蓋 M-2。

**驗收**: `npm test` 須完整跑完 208 case 且 exit=0。

---

## M-2 |【嚴重】`test_staEvent.mjs` 根本不是測試, 卻被綁為 `test:unit`

**現況**: 全檔 22 行, **零個 `assert`**, 只有 `console.log(JSON.stringify(rs, null, 2))`(`server/staLogs/test_staEvent.mjs:1-22`)。它是一支給人肉眼核對輸出的 demo script, 無法自動判定 pass/fail —— 只要不拋例外就「通過」。

違反全域 §14.2「測試是規格的可執行翻譯, 不是現狀的指紋」。

**連帶**: 它同時是**三重命名/定位偏離** —— ①不在 `test/` 目錄下 ②用 `test_` 前綴而非專案慣例的 `.test.mjs` 後綴 ③被 `package.json:43` 當正式測試跑。

**修法**: 改寫為真正的 unit test:
1. 移至 `test/unit-staEvent.test.mjs`(或沿用專案既有 unit 命名, 見 M-4)。
2. 於 `tmp/` 自造 log fixture(含窗內/窗外/邊界/非 ISO 檔名), 明確傳入 `fdLog`。
3. 對 `staEvent` 回傳值下**語意斷言**(時間桶數量、事件計數、窗外資料未被計入), 而非 `console.log`。
4. 一併補 `staEventTable` 的 unit test(目前**零測試覆蓋**, 見 M-3)。
5. 更新 `package.json` 的 `test:unit`。

---

## M-3 |【中】`staEventTable` 零單元測試覆蓋

**現況**: `server/staLogs/staEventTable.mjs`(100 行, 含 1hr⊂4hr⊂8hr⊂24hr 巢狀時間窗累計邏輯)無任何自動化測試。前一輪批 B 修改它時, 執行者只能自造一次性 fixture 手動對照, 未留下回歸守護。

**修法**: 併入 M-2 的 unit test 檔一起補。斷言重點: 巢狀窗的包含關係(1hr 的計數必 ≤ 4hr ≤ 8hr ≤ 24hr)、窗外資料被排除、`filterVpfsByWindow` 的 25h buffer 未漏讀邊界檔。

---

## M-4 |【中】`api-getPerm.test.mjs` 的編號與 spec 的 `E2E-NNN` 交叉錯位

**現況**(逐一比對, 全部實證):

| spec bullet(`流程_查詢使用者權限.md`) | title | 實際對應的 test it() |
|---|---|---|
| `E2E-001`(:15) | 持有效 token 查自身權限 | `API-getPerm-001-success-admin-self`(:28) ✅ |
| `E2E-002`(:27) | perm() 工廠 conn 後用 active 查單一規則 | `API-getPerm-**006**-perm-factory-accessors`(:137) ❌ |
| `E2E-003`(:39) | token 無效時查詢被拒 | `API-getPerm-**002**-invalid-token-reject`(:66) ❌ |
| `E2E-004`(:51) | url 缺 token 佔位符時前端即拒 | `API-getPerm-**003**-missing-placeholder-reject`(:79) ❌ |
| `E2E-005`(:63) | 提供 funConvertPerm 時回傳值經轉換 | `API-getPerm-005-funConvertPerm`(:112) ✅ |
| **(無對應 bullet)** | — | `API-getPerm-**004**-invalid-args-reject`(:91) ⚠️ 額外 |

違反全域 e2e 技能之「**編號錨點 ≡ spec bullet 順序**」原則(fail 時無法直接定位 spec bullet)。

> **對照組**: `api-getPermUserInfor.test.mjs`(001-006)與 `api-syncAndReplaceTabs.test.mjs`(001-006)**皆 1:1 對齊**, 證明本專案的慣例確實是對齊的, `api-getPerm` 是唯一偏離者。

**修法(擇一, 建議 A)**:
- **A(建議)**: 把 test 的編號改對齊 spec(002↔003, 003↔004, 006→002 重排), 並為 `004-invalid-args-reject` 於 spec 補一條 `E2E-006` bullet(它驗 `getPerm.mjs:15` 的 `invalidUrl` / `invalidTokenTar` 前端前置攔截, 是真實的獨立情境, 值得列為正式 case)。
- B: 反過來改 spec 編號對齊 test。**不建議** —— spec 是真理, 應讓測試對齊 spec(全域 §14.1)。

**注意**: 這四支 api test 無 pixel baseline, 故**重編號不影響任何標準圖**, 風險為零。

---

## M-5 |【中】`getUserRules.test.mjs` 的 46 個 `it()` 完全沒有 spec 編號錨點

**現況**: `spec/流程_權限規則合併計算.md` 有 `E2E-001` ~ `E2E-010` 十個 bullet;但 `test/getUserRules.test.mjs` 的 46 個 `it()` **一個都沒帶 `E2E-NNN` / `UNIT-NNN` 編號**, 全以主題式 describe 命名。

**後果具體**: 測試 fail 時無法從 case 名反查它守護的是 spec 哪一條規則;spec 改動時也無法機械式檢查「哪些 case 需要跟著改」。

> 覆蓋度本身沒問題 —— 46 個 case 確實涵蓋了 10 條 bullet(且有大量合理的邊界/巢狀擴充)。**缺的是可追溯性, 不是覆蓋率。**

**修法**: 為對應 spec bullet 的那些 `it()` 加上編號前綴(如 `UNIT-003-or-merge-permissions`), 擴充的邊界 case 可不編號或用 `UNIT-003a` 之類子編號。**不需要**把 46 個全部編號。

---

## M-6 |【中】5 個關聯對話框皆有「唯讀檢視」模式, 只有 1 個被測

**現況**(實證): 5 個對話框全數支援 `isEditable=false` 唯讀檢視, 各有專屬 i18n 標題鍵:

| 對話框 | 唯讀標題 i18n 鍵 | procLang | 測試覆蓋 |
|---|---|---|---|
| VeCpemis | `grupEditCpemisForDisplay` | :604 | ✅ `e2e-rela-grup-pemi.test.mjs:337` E2E-005 |
| VePemiBlngGrups | `pemiBlngEditGrupsForDisplay` | :506 | ❌ **零覆蓋** |
| VeCgrups | `userEditCgrupsForDisplay` | :740 | ❌ **零覆蓋** |
| VeGrupBlngUsers | `grupBlngEditUsersForDisplay` | :638 | ❌ **零覆蓋** |
| VeCrules | `pemiEditCrulesForDisplay` | :464 | ❌ **零覆蓋** |

`grep -rn "userEditCgrupsForDisplay\|grupBlngEditUsersForDisplay\|pemiEditCrulesForDisplay" test/` → **零命中**。

**後果具體**: 唯讀模式的守門(隱藏 Save 鈕、checkbox/下拉 `disabled`、顯示檢視版標題)是**權限系統的安全邊界** —— 若某次重構讓 `isEditable=false` 時 Save 鈕仍可點, 4 個對話框的這個 regression 不會被任何測試抓到。`e2e-rela-grup-pemi` 的 E2E-005 已證明此 case 完全可測且有既成範本。

**修法**: 比照 `e2e-rela-grup-pemi.test.mjs:337-360`(E2E-005-readonly-view)的作法, 為另外 4 個對話框各補一條唯讀檢視 case:
- `spec/流程_使用者群組關聯.md` 補 2 條(VeCgrups / VeGrupBlngUsers)
- `spec/流程_權限規則關聯.md` 補 1 條(VeCrules)
- `spec/流程_群組權限關聯.md` 補 1 條(VePemiBlngGrups;該檔 `:11` 已在散文提及此模式, 但只有 VeCpemis 有 case)

每條 case 須含: 語意斷言(檢視版標題文字存在、Save 鈕不存在、checkbox `disabled`)+ eng/cht 兩份 pixel baseline。**新增 baseline 須先經業主授權**。

---

## M-7 |【低】統計資訊事件展示只覆蓋成功路徑

**現況**: `spec/流程_統計資訊事件展示.md` 的 4 條 case 皆假設 `getStaEvent` / `getStaEventTable` 成功回傳。這兩支 RPC 的 **reject 分支**(`WWebPerm.mjs:1139,1151` 有 try/catch + `srLog.error` + 回 `cannotGetStaEvent` / `cannotGetStaEventTable`)無任何 e2e/api 覆蓋。

**修法**: 補一條 API-level case 驗證 reject 時回傳正確的 i18n key。此項**不需 pixel baseline**(無 UI 終態需求時), 成本低。

---

## M-8 |【文件】規劃書前一版的「📌 執行中發現之既有問題」診斷錯誤, 已於本版更正

前一版聲稱:

> `srv.mjs` **未傳** `logFd` 給 `WWebPerm`, 故 `WWebPerm.mjs:302-304` fallback 為 `'./_logs'` …… 而 `settings.json:40` 明訂 `logFd: './logs'`。**`settings.json` 的 `logFd` 實際未生效。**

**此診斷為假, 已實證推翻**:

```
$ node -e "…讀 settings.json 依 srv.mjs 邏輯組 opt…"
srv.mjs 組出的 opt.logFd = "./logs"
```

`srv.mjs:26` 的 `...appSt` 展開已把 `settings.json` 全部鍵(含 `logFd: './logs'`)傳入 `opt`;`WWebPerm.mjs:302-304` 的 `get(opt,'logFd','')` 因此取到 `'./logs'`, **fallback 從未觸發, production 路徑完全生效**(前輪已實機驗證: 啟動後端後 log 確實寫入 `./logs/`, 且未重建 `./_logs`)。

真正壞掉的**只有** `test_staEvent.mjs` 這一支未傳 `fdLog` 的 script(見 M-1)。**不要**因這條錯誤診斷去動 `srv.mjs` 或 `WWebPerm.mjs`。

---

## M-9 |【流程】批 B 的驗收條件從未達成, 驗收把關失效

前一版 §三 明訂 B-1 驗收為:

```bash
node server/staLogs/test_staEvent.mjs      # 既有 unit test, 必須全綠
```

但該指令**在動手前後皆 exit=1**(見 M-1), 執行者自承跳過、改用自造 fixture。§六 驗收總表要求的 `npm test` 亦因短路而**從未真正跑過 mocha**。

**結論**: 批 B 的程式碼修改本身**經我獨立複驗為正確**(見第二部 B), 但規劃書所訂的驗收機制是失效的 —— 通過與否無從由該指令判定。日後訂驗收指令前, **須先確認該指令在動手前處於已知良好狀態(green baseline)**, 否則無法區分「我改壞了」與「它本來就壞」。

---

# 第二部 · 已修正(經主代理獨立複核, 非採信執行者回報)

> 複核方式: 親自 Read 程式碼 / 親自 `diff` / 親自跑函式驗證邊界行為。

## ✅ 批 A|e2e baseline 比對機制之文件一致性(doc-only)

| 項 | 複核結果 |
|---|---|
| A-1 `CLAUDE.md:115` 改寫為契約語意 | ✅ 已落地。`grep -n "非逐位元精確" CLAUDE.md` 命中 `:115`, 不再點名 API 呼叫形式, 與 `:105`/`:124` 之「flow 內絕對不寫 API」立場不再矛盾 |
| A-2 新增「e2e baseline 比對落地映射」節 | ✅ 已落地。`grep -c` 命中 2 處 |
| A-3 README 不改 | ✅ 判斷正確。`README.md` 為 npm 套件說明(Documentation / Installation / Example), 無測試章節;防誤判所需之正面陳述已由 A-2 落地映射節(位於 agent 必讀之 `CLAUDE.md`)覆蓋 |

**事實基準複驗**(此為前一版反覆被外部 agent 誤判之處, 於此固化):

- baseline 比對函式 = `assertBaselineMatch(buf, baselinePath, label, opts?)` — `test/e2e-setup.mjs:430`
- 機制 = **pixelmatch 反鋸齒感知容差**(`includeAA:false` / `threshold:0.1` / `maxDiffPixels` 預設 100 — `:431`, `:473-474`), **非 byte-exact**
- 專案內唯一之 `.equals()` 在 `test/e2e-setup.mjs:294`, 屬 `captureStable` 判斷連續兩張截圖是否 settle 的**真 byte 比較**, **與 baseline 比對無關, 刻意如此**
- `package.json:31` 有 `"pixelmatch": "^7.2.0"`, 實際安裝版本 7.2.0

## ✅ 批 B|統計 log 檔全量掃描(效能)

**落地確認**: 已抽共用模組 `server/staLogs/filterVpfsByWindow.mjs`, 兩支 import 使用(`staEvent.mjs:12,44` / `staEventTable.mjs:8,30`), 未各貼一份。

**硬規則遵守確認**(逐條親驗):

| 硬規則 | 複核結果 |
|---|---|
| 不得移除 per-line 時間判斷 | ✅ `staEvent.mjs:63` 之 `t.isAfter(tStart)` 保留;`staEventTable.mjs:52` 之 `dh > 24` 保留 |
| 不得改動 sync 列舉 / 串流讀取模型 | ✅ 未動 |
| 輸出語意零改變 | ✅ 見下方獨立驗證 |
| 變數名對接既有命名 | ✅ 沿用 `tStart` / `fdLog` / `fmt` |
| 兩支各自沿用自己的時間窗 | ✅ `staEvent` 用 `tStart`(近 7 天);`staEventTable` 用 `now.subtract(25,'hour')`(刻意用 25h 而非 24h, 因 `diff('hour')` 取整, 最舊可能到 now-25h) |

**我的獨立邊界驗證**(直接呼叫該函式, 非採信執行者說法):

```
tStart = 2026-07-08T21:30
fmt=hr  → 保留: T21(邊界檔)、T22、2026-07-08(day 粒度)、readme.txt(fail-open)
          剔除: T20(窗前)、2026-06-01T10、2026-07-07
fmt=day → 保留: 全部 2026-07-08*(day 粒度比對)
          剔除: 2026-07-07
```

全部符合預期。

**執行者的實作優於規劃書 snippet**: 規劃書原 snippet 直接 `bn >= keyStart` 比較。實作改為 `bn >= keyStart.slice(0, bn.length)`(`filterVpfsByWindow.mjs:22`), 額外處理了「srLog 的 `logInterval`(決定檔名粒度) 與 staLogs 的 `timeInterval`(決定 fmt) 是兩個獨立設定」的陷阱 —— 若檔名為 day 粒度(10 字元)而 fmt 為 hr 粒度(13 字元), 直接比較會把當天檔誤判為窗外(`'2026-07-08' < '2026-07-08T21'`)→ **漏讀整天資料**。此為規劃書未預見之真實缺陷, 執行者正確發現並修補。

## ✅ 批 C|canonical 五段結構偏離(loading 閃爍)

| 檔 | 複核結果 |
|---|---|
| `VePemiBlngGrups.vue` | ✅ 空清單檢查已上移至 `core()` 第 1 段(`:1016`), 早於 `updateLoading(true)`(`:1022`);`errTemp` 已改為 `okSave` 旗標(`:962,964,969`) |
| `VeGrupBlngUsers.vue` | ✅ 同上(`:1016` / `:1022` / `:962,964,969`), 兩檔改動一致 |

**保留不動之項確認**: 外層 `core().catch().finally()` 結構仍在, 未被重寫。template / style 段未動(故不影響 pixel baseline)。

**e2e 回歸**: 執行者回報 8 suite 全綠(`targets 20 / pemis 20 / grups 20 / users 22 / rela-grup-pemi 10 / rela-user-grup 12 / rela-pemi-rule 10 / init 10`), `testPending/` 無本次新增 drift。此為執行者回報, 我未重跑(約 50 分鐘);但批 C 只動 `<script>` 段, 且我已確認 template 未動, 與「無 drift」之回報一致。

---

# 第三部 · spec 與 test 盤查結論

## 3.1 spec 覆蓋度 —— 整體極高, 3 項缺口已列入第一部

**能力全集 vs spec 覆蓋**(逐一實證):

| 能力 | 對應 spec |
|---|---|
| 4 支 REST API(`getUserByToken` / `getPerm` / `getPermUserInfor` / `syncAndReplaceTabs`) | 全數有 spec |
| 7 支 kpFunExt(`getWebInfor` / `update{Targets,Pemis,Grups,Users}` / `getStaEvent` / `getStaEventTable`) | 全數有 spec |
| 4 個 CRUD 清單頁 | 各一份 spec, 每份 10-11 案含新增/複製/刪除/驗證失敗/token 失效 |
| 5 個關聯對話框 | 3 份 spec 覆蓋, **唯讀模式 4/5 未覆蓋 → M-6** |
| `getUserRules` 合併演算法 | `流程_權限規則合併計算.md` 10 案(單元層級) |
| `Layout.vue` 語言下拉切換 | **零 e2e 覆蓋 → 已定案為刻意(ADR-019), 非缺口** |
| `getStaEvent`/`getStaEventTable` reject 分支 | **無覆蓋 → M-7** |

**中間細部流程**: 13 份 spec 皆含「觸發條件 / 前置狀態 → 使用者操作 → 中間驗證與錯誤分支 → UI 可觀察 outcome」四要素, 且多數附逐行 trace(`[file:line]`)。評等「有」11 份、「有(小缺口)」2 份(缺口即 M-6)、「部分」1 份(即 M-7)。

## 3.2 test 合規度 —— 骨幹紮實, 問題集中在 unit 層與編號錨點

**✅ 已合規(逐項實證, 不需動)**:

| 維度 | 結果 |
|---|---|
| Case 對齊 | 13 份 spec 之 E2E-NNN bullet **全數**有對應 `it()` 覆蓋, 無缺漏 |
| Act 真實性 | 全 e2e 檔 `.fill(` 0 筆、`vm.method()` 0 筆。文字輸入走 Pattern B(`typeIntoCell`: dblclick → clear → `keyboard.insertText` → Enter), 各檔沿用同一 helper |
| Assert 完整 | 9 支 UI e2e 皆同時具備 UI 語意斷言 + pixel baseline, 無「只驗其中一種」者 |
| 多語覆蓋 | 9 支 UI e2e 全數 `LANGS = ['eng','cht']` 雙語各跑一輪 |
| Baseline 完整 | 9 個 `test/pics/*/` 資料夾, eng/cht 張數**逐資料夾相等**(23/23、5/5、23/23、16/16、17/17、21/21、4/4、25/25、24/24), 三位補零、編號連續無缺號、無孤兒檔、無缺檔 |
| Lifecycle 對稱 | `test/e2e-setup.mjs:482-487` 有 mocha root teardown hook;9 支含 `--baseline` 分支之檔**全數**有 `cleanup()` 呼叫(audit 指令零命中) |
| 截圖慣例 | 測試本體零裸 `page.screenshot()`;9 支 UI e2e 全走 `captureStableWithBox`(紅框 `#f26` / 5px, 實作於 `e2e-setup.mjs:347`) |
| DB hermetic | `beforeEach` 內 `resetDb(browser, BASE_SEED)`, per-case 重置 |

**⚠️ 已列入第一部之問題**: M-1(npm test)、M-2(test_staEvent 非測試)、M-3(staEventTable 零覆蓋)、M-4(getPerm 編號錯位)、M-5(getUserRules 無編號錨點)、M-6(唯讀模式覆蓋)、M-7(統計 reject 分支)。

**📄 已定案為刻意設計, 不再列為缺陷**(見 `spec/設計要點與取捨.md`):

| 觀察 | ADR |
|---|---|
| `e2e-doubleclick.test.mjs` 檔名帶 `e2e-` 卻無瀏覽器(API-level) | ADR-017 |
| `api-updateTabs.test.mjs` 無對應 `流程_*.md` | ADR-017 |
| `getUserRules.test.mjs` 無 `unit-` 前綴 | ADR-017 |
| `updateUserToken` 於 act 階段注入無效 token(E2E-010 × 4 檔) | ADR-018 |
| `Layout.vue` 語言下拉切換零 e2e 覆蓋 | ADR-019 |

**🔸 風格不一致(非缺陷, 不強制收斂)**: per-case fresh browser 有兩種寫法並存 —— 7 支用 `beforeEach`/`afterEach` launch/close, `e2e-stainfor` 與 `e2e-init` 改在每個 case 函式內自行 `launchBrowser()` + `finally browser.close()`。**兩者語意皆合規**(確實每 case 全新 browser), 僅風格不同。

---

# 第四部 · 凍結區(**本次不執行**)

## 4.1 前端重構提案 P-01 ~ P-05 —— 業主已指示重構凍結

| 項 | 內容 | 凍結理由 |
|---|---|---|
| P-01 | 四清單頁工具列/標題區 template 92% 相同 → 抽 `LayoutContentListToolbar.vue` | 動 template, baseline drift 風險最高;且專案偏好「爆炸半徑最小化」 |
| P-02 | 四頁 store computed getters 逐字元相同 → 抽 mixin | low risk 但引入專案尚未採用之新慣例(全庫零 mixin), 屬決策點 |
| P-03 | `addItem`/`copyItem` CRUD 骨架四頁 74% 相同 → 抽 `listCrudMixin` | medium risk, 需設計 `extendRow` callback |
| P-04 | `VeCpemis.vue` ≡ `VeCgrups.vue`(95% 逐行相同, sed 式複本)→ 參數化合併 | medium risk, 須參數化 `$dg` 全域掛載名否則實例互相覆蓋 |
| P-05 | 5 個對話框共用「全選/全不選/反選 + resize + fullscreen」樣板 → 抽 mixin | low risk, 但須順帶改 4 檔 template 之 `@click` 綁定名 |

> 若業主日後解凍, 建議順序: **P-02 → P-05 → P-03 → P-01 → P-04**(風險 × CP 值), **每完成一項就跑一次完整 8 suite 驗證**。

## 4.2 已明確駁回(對抗式覆核判為鍍金/推測型 — **勿再報**)

R-01 四頁瑣碎黏合方法抽 mixin ／ R-02 `genOpt` callback 四頁相同 ／ R-03 `saveXxx` 五段結構四頁相同(**這是專案刻意的 canonical-template 複製**)／ R-04 `deleteItemsCheck` 空選取行為不同步(dead 防禦碼)／ R-05 `VePemiBlngGrups` vs `VeGrupBlngUsers` 87.5% 相同 ／ R-06 `getUserRules` 雙層迴圈無 cache ／ R-07 `changeParams` cloneDeep 全表 ／ R-08 `errItemsByName` 每按鍵 O(n)(**事實錯誤**)／ R-09 `useUsers` computed 鏈 ／ R-10 `console.log`+`srLog.error`+`reject` 樣板重複 32 次 ／ R-11 4 支 REST handler 尾端 `pm2resolve` 樣板 ／ R-12 `updateTargets/Pemis/Grups/Users` 四支同構 ／ R-13 `LayoutContentStaInfor.vue` 宣告 `drawer` prop 未使用(**推論錯誤**)

## 4.3 死碼

- `procLang.mjs` 內 16 個已註解之死語系鍵 —— 業主決議保留, **不報不刪**(ADR-014)。
- `VePemiBlngGrups` / `VeGrupBlngUsers` 之 `deleteItemsCheck` —— **刻意停用**(ADR-014), **不要修好它**。

---

# 第五部 · 驗收

## 建議執行順序

| 順位 | 項目 | 風險 | 理由 |
|---|---|---|---|
| 1 | **M-1 + M-2 + M-3** | low | 一併處理(同一支檔案)。修好才有可信的驗收基準線 |
| 2 | **M-4** | 零 | 無 baseline, 純重編號 + 補一條 spec bullet |
| 3 | **M-5** | 零 | 純加編號前綴 |
| 4 | **M-7** | low | 補 API-level reject case, 無 baseline |
| 5 | **M-6** | medium | 需新增 8 張 baseline(4 對話框 × eng/cht), **須先經業主授權** |

> **M-1 必須最先做** —— 在 `npm test` 修好之前, 任何「測試全綠」的宣稱都是不可信的(因為 mocha 根本沒跑)。

## 驗收指令

```bash
cd C:\opensrc\w-web-perm

# 語法
node --check server/WWebPerm.mjs
node --check server/staLogs/staEvent.mjs
node --check server/staLogs/staEventTable.mjs
node --check server/staLogs/filterVpfsByWindow.mjs

# build(改前端必跑)
npm run build

# unit + api + e2e(修好 M-1 後, 這行才會真正跑完 208 case)
npm test

# e2e 個別跑(改前端必跑;每個約 4-9 分鐘, 建議 detached 執行)
npx mocha test/e2e-targets.test.mjs --reporter list
npx mocha test/e2e-pemis.test.mjs --reporter list
npx mocha test/e2e-grups.test.mjs --reporter list
npx mocha test/e2e-users.test.mjs --reporter list
npx mocha test/e2e-rela-grup-pemi.test.mjs --reporter list
npx mocha test/e2e-rela-user-grup.test.mjs --reporter list
npx mocha test/e2e-rela-pemi-rule.test.mjs --reporter list
npx mocha test/e2e-init.test.mjs --reporter list
```

> **基準線(必須維持)**: `targets 20 / pemis 20 / grups 20 / users 22 / rela-grup-pemi 10 / rela-user-grup 12 / rela-pemi-rule 10 / init 10` = **全綠 0 failing**
>
> 失敗時 `./testPending/` 會留下 `__capture.png` / `__baseline.png` / `__diff.png` 三張圖供定位(不覆蓋、帶 timestamp)。

## 回報要求

1. 逐項 before/after 之 `file:line` 與實際 diff。
2. **驗收指令之實際輸出**(不要只寫「通過」)。特別是 `npm test` 的完整尾段, 須看得到 mocha 的 `NNN passing`。
3. 新增測試須附「這條斷言對應 spec 哪一句」之註解(全域 §14.2)。
4. 若出現 baseline drift **一律停下回報**, 不得自行重產。
5. 任何**與本規劃書描述不符**之現況(行號飄移、程式碼已被他人改動)—— **停下回報**, 不要自行推測修改。
