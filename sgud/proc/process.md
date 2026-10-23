# 重要處理要點

本檔為特有之重要處理要點,為業務端之特化要求事項與處理流程,包含事項、關聯什麼、怎麼判斷與處理方式等,由agent自行編列、擴充與維護.

體例: 每一事項一節, 固定三欄——**關聯**(牽涉哪些檔案 / 機制 / 文件)、**判斷**(何時適用、怎麼分辨)、**處理**(照做的步驟與禁止事項). 指令與測試檔清單不重抄, 一律指向 `sgud/rule/rulebook.md`「測試配置」; 決策緣由指向 `spec/設計要點與取捨.md` 之 ADR 編號; 根因史指向 `sgud/exp/experience.md`; 服務 port 見 `CLAUDE_settings.md`.

## 資料初始化與測試 seed

- **關聯**: 正式資料 `g_initialData.mjs` 與測試 seed `g_initialTestData.mjs` 兩套, 皆寫 `./db`(lmdb); harness 之 `seedDb()`(`test/tools/e2e-setup.mjs`)與 `restartBackend(path, { reseed })`; `api-setup.mjs` 之 `getWoItems()` 為唯讀取用.
- **判斷**: 正式資料只在使用者明確要求時重跑. 測試 seed 由 harness 進場自動執行(hermetic: 先刪 `./db` 再跑, 偵測 stdout `finish.`), 不受前述限制. 刪 `./db` 靜默失敗的徵狀是「停用 / 刪除類狀態沒被還原」——lmdb 被行程持有時 rm 不會報錯, seed 退化為 upsert.
- **處理**: 刪 `./db` 前確認無行程持有 lmdb(11006 無人監聽、本進程未 `getWoItems()`); 會把資料弄到「任何 token 皆拒」的 api 測試(如 `api-verifyConn-auth` 停用 admin)以 `reseed:true` 於 port 釋放後、spawn 前重跑 seed 還原; 停用 / 刪除類案例於 `after` 回驗關鍵欄位, 不假設 seed 成功.

## 跑測試: 統一入口與自身驗證分流

- **關聯**: `package.json` scripts 之 `test`(唯一 script, 全域 §16.5 標準字串); 各層指令與 runner 見 rulebook「分層與執行指令」; 多檔合跑污染之根因見 experience「多檔合跑之後端狀態污染」(現行規則 R-E2E-ISO-01／ADR-030; 原誤標 ADR-017).
- **判斷**: `npm test` 是跨套件批次維護、確認套件能完整測試之統一入口, **字串固定不得改、不加 scripts 變體**; agent 自身要驗證什麼一律自編指令. e2e 檔可在同一 mocha 進程全跑(2026-10-20 起, 規則帳本 R-E2E-ISO-01／ADR-030): 每個用 `resetDb` 的 e2e 檔於每個語系 describe 的 `after` 以 `restoreDbOnce` 還原自己改過的表, `captureBaseSeedOnce` 以主鍵集合守門, 前檔遺留於檔案起點即以可讀訊息失敗. 此前「絕不塞進同一 mocha 進程」(experience「多檔合跑之後端狀態污染」, 原誤標 ADR-017: 前檔改過狀態的後端使列序與 solo 產的 baseline 相反)與第 89 項的 `e2e-users` 24 案失敗, 根因都是「前檔遺留狀態」而非行程共用本身. **新增會改動共用表的 e2e 檔必須對稱收尾**: 用 `resetDb` 者照上述(`unit-e2e-lifecycle` LC-002 守護); 其餘(如 `e2e-array-form`)自行 `before` 擷取、`after` 寫回——`<table>.select` 依主鍵排序而 `updateXxx` 以陣列位置重給 `order`, 寫回前須先依 `order` 排序, 且 `select` 失敗不得當成空表.
- **處理**: e2e 前端用獨立的 8090(`e2e-setup.mjs` 以 `--port` 顯式指定, 避開常駐 8080 之其他專案 dev server; 8080 只給手動開發), 可先手動起供各檔 reuse; 起跑前 `netstat` 看 11006 / 8090 是誰的, 非自己起的先回報不殺(harness 之 `restartBackend` 殺佔用 11006 者為 `CLAUDE.md` 明文例外); 全跑走 `npm test`(單一行程)、`node test/tools/run-e2e-isolated.mjs`(逐檔隔離)或單檔; 超過 2 分鐘 `run_in_background`; 同一時間只有一條鏈(重產與 mocha 共用後端與前端). 收尾判準不只綠: port 釋放、`test/_tmp/` 無殘留、`./testPending/` 本輪無新增或已分析、無殘留 chrome.

## 換設定之測試

- **關聯**: `genTempSettings(overrides)` → `test/_tmp/settings-e2e-<pid>-<seq>.json`; `restartBackend(path)`; e2e case 物件之 `settings:{...}`(如 `e2e-users` E2E-012 `modeEditUsers` 三態); `staEventMock`(統計頁確定性資料).
- **判斷**: 案例需要與 `./settings.json` 不同之設定(語系注入、`staEventMock`、`modeEditUsers`)才走此路; 只是換值不是換鍵——缺鍵啟動情境 `genTempSettings` 抓不到.
- **處理**: e2e 於 CASES 物件帶 `settings:{...}`, 由檔內框架於開 case page 前注入、`finally` 還原, regen 與 mocha 同管線; api 於 `before` 注入、`after` 還原 `./settings.json`. 臨時檔由 `cleanup()` 逐檔刪, 目錄空則移除; 絕不落 `./tmp/`.

## 標準圖重產

- **關聯**: `test/pics/<flow>/`(9 個 flow); 各 e2e 檔 `--baseline [--names a,b] [--langs eng,cht]`(截圖前 gate); 全域技能 §7.6 / §7.9; 六旗標之由來 ADR-020 與 experience「側欄 launch 級 1px 剛性位移」.
- **判斷**: UI 變更或缺陷修正使既有圖失效, 或新增案例需產圖. 先跑受影響 e2e 取失敗清單, 逐張確認可歸因——同一原因之 diff 值會一致(如儲存鈕消失恆 661 / 669px); 歸因不了的不是重產對象, 是待查的差異.
- **處理**: ①取得重產授權, 範圍限受影響案例(`--names` / `--langs`); ②備份 `test/pics`; ③**單鏈序列**重產, 前端 8090 可先手動起; ④重產後與備份逐張像素比對, 未變者還原備份(已審圖不動), 只保留真的變了的; ⑤紅框掃描(同色連續 ≥ 20px)無框者須為 0; ⑥逐張目視對照 spec「框住什麼」; ⑦agent 依下節審圖判定可凍結後, 即跑 mocha 比對與 `--grep` 單跑一致性(2026-09-28 起; 原為「交審, 業主認可後才跑」). 追加新案例只以 `--names` 產新案例, 產前記既有圖 mtime, 產後回驗未變.

## 標準圖之審查與判定由 agent 先行(2026-09-28 起)

- **關聯**: 業主 2026-09-27 於 w-web-sso 授權「e2e 標準圖皆由你先行檢查與做出判定與審查」; 2026-09-28 業主指示待決事項經三方獨立複審後定案實施, 定案將此委任擴及 sso / perm / api / task 四專案(紀錄: w-web-sso `spec/設計要點與取捨.md` ADR-072 決定 4⑧).
- **判斷**: 標準圖之逐張審查與「可否凍結為 baseline」之判定由 agent 負責, 審畢即可跑 mocha, 不必等業主審圖; 產圖本身(重產 / 新產)仍須授權(技能 §7.9). 業主裁示限於設計取捨或產品介面變更.
- **處理**: 以使用者視角判斷「照圖能否操作、畫面有無被改壞」: ①與 git HEAD 版逐像素比, 差異須落在預期區域; ②逐張目視對照 spec 框住句與操作順序; ③紅框掃描(同色連續 ≥ 20px; 極小目標如翻頁箭頭之框可能短於 20px, 須目視)、兩語系對稱; ④抽張重產逐位元比對(等價鏈之暫存重產即是); ⑤審圖紀錄落檔供業主隨時查閱, 需裁示者列首節.
- **已追認(2026-09-28)**: grups E2E-008/009 之 8 張(agent 審後寫入, rulebook「已知缺口」該條); layout 於審圖前已跑 mocha(2 張 `E2E-003-1-narrowed` 當時仍掛待審, 屬程序瑕疵, 同日補審通過); stainfor E2E-006~008 之 32 張與 layout 2 張之審圖結果見 rulebook「已知缺口」該條.

## 自有套件升版後之驗證

- **關聯**: `package.json` deps; `server/WWebPerm.mjs` 傳給 `WServHapiServer` 之 opt; `src/main.js` 傳給 `WServHapiClient` 之 opt; 全專案 `wsemi/src/*.mjs` import; experience「axios → 內建 fetch」.
- **判斷**: 自有套件無 CHANGELOG, 版號跳動不代表相容; **改名類變更傳舊名不報錯只靜默失效**(w-serv-hapi 1.0.87 之 `showLog`→`useShowLog`、`fnTableTags`→`fpTableTags` 為先例, 見 sso ADR-061), 測試綠燈抓不到, 必須比對 opt 鍵.
- **處理**: ①`npm pack <pkg>@<舊版>` 取舊碼與 `node_modules/<pkg>/src` 逐檔 diff, 或比對我方傳入之 opt 鍵與新版 JSDoc `@param [opt.xxx]` 宣告, 找改名 / 移除 / 新增(舊名有相容層者仍改用新名), **另比對下游之必填化**(2026-10-14: w-serv-webdata 1.1.7 起 `useDbOrm:true` 時 `authorizeExec` 必填, 未給後端無法啟動)與**新增之拒絕型**(w-serv-orm 1.1.8 起主鍵含標記整批拒絕)——後者須盤點本套件「先破壞後寫入」之路徑在第一個破壞步驟前有無同一判準之驗證; ②確認用到的 wsemi 函式於新版皆存在; ③**驗證範圍依差異決定**(業主 2026-09-29 兩度指正, 不預設全跑): 只動到後端函式 → 用到該函式之 unit / api; 動到前端元件或 DOM 偵測(如 wsemi `domDetect`、w-component-vue 元件) → 用到該元件之 e2e 案例, 遍及全站版面者即 e2e 全跑; 截圖用之 Chromium 換版(w-package-tools-e2e 之 playwright 依賴升版, 先比 `node_modules/playwright-core/browsers.json` 之 chromium revision)→ e2e 全跑; 無行為差異 → 載入檢查; ④有前端變更者加真瀏覽器探測: 登入態、四表同步筆數符合 seed、`webInfor` 取得、無 `pageerror`. 有行為變更者(如執行期產物檔名)記入 experience, 執行期產物加 `.gitignore`; 依賴問題由套件端統一改版, 不在專案端補裝或繞道(全域 §7).

## 整合者建議書之處理

- **關聯**: 部署方(如 `rddmanager_2_perm`)回報之 `建議*.md` 類文件; `spec/設計要點與取捨.md`(ADR); 全域 §8 真痛三條件; 先例見 experience「資料通道授權對稱與儲存鈕殘留」.
- **判斷**: 逐項對照原始碼核實 `file:line`, 有標準圖佐證者以實機重現; **動手前先查 ADR 是否已有決議**——既有決議可能已把該改動列為「預設不做」或「可選強化」, 已裁示者不重提.
- **處理**: ①依三條件分類成必修 / 待討論 / 設計限制 / 假痛四 list 交裁示; 核對建議書時**以 bash grep 另搜 `CLAUDE_*.md`**(列於 .gitignore, Grep 工具看不到; 2026-10-14 建議書因此漏列 R-TOK-1); ②只修裁示之項, 擴充設定一律 opt-in 且既有值行為不變; ③與既有 ADR 衝突者於該 ADR 加 Update 段記實作狀態與待裁示; ④建議書所有項目處理完、待裁示事項已移轉至版控文件後, 才刪除建議書.

## e2e 失敗證據之分析

- **關聯**: `./testPending/<label>__<ts>__{capture,baseline,diff}.png`; experience 之各根因史.
- **判斷**: 先開 `__diff.png` 定位差異區; 再分辨是 baseline 過期還是真回歸——以「換回舊版套件 / 舊 commit」做介入實驗, 不憑升版時序猜; 同 flow 多張 diff 值一致者屬同一原因.
- **處理**: 三聯組永不覆蓋、不自動刪, 分析後人工清; 不改測試或重產 baseline 遷就現狀; 修法依全域技能 §11.2(timing flake 自己修到具體 ready 訊號, 真問題才回報).

## 授權資料之編輯存檔: 授權不變、fail-closed(2026-10-20 起, 主控複審裁示; ADR-031)

- **關聯**: `sgud/rule/rulebook.md` R-AUTH-ORDER-01／R-AUTH-LOSSY-01／R-AUTH-LIST-01／R-SYNC-NAME-01; `spec/設計要點與取捨.md` ADR-030／031; experience「授權存檔不變」.
- **判準(業主／主控)**: w-web-perm 屬產品層, **授權正確性優先; 編輯器存檔「授權不變」, 不得靜默增權(亦不得靜默減權)**. 遇到「無法無損表示」之資料, 處置是**拒存並顯示固定訊息、庫內字串不動**, 不是選一邊寫出; 由資料來源(外部應用)修正.
- **處理**: ①任何新增的授權字串寫出站點(`JSON.stringify` 一份 `cgrups`／`cpemis`／`crules`)須經 `keepKeyOrder`(以對話框序重寫者)並對帶 mode 者先過 `getKpLossy`; ②判定函數之完備性以原函式 `getUserRules` 為真理窮舉(U ⊆ D、漏判 0), 改 `mergeRules` 或解碼時須重跑 `unit-cvKpToObj` 窮舉; ③清單頁顯示授權資料一律經 `cvKpToObj`(物件形式原樣回傳, 標準圖不變); ④外部同步入口與後台入口之名稱／id 檢查成對(`isestr`)且置於 `delAll` 之前.
