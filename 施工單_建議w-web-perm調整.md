# 施工單：落實 `建議w-web-perm調整.md`（A1～A3、B1～B8）

- 讀者：受委派執行本案之 agent（Opus 5）。本檔是規劃與驗收文件，逐步照做並於每個檢查點回驗；讀完本檔再動工。
- 立案日：2026-09-16。業主已裁示，本檔第 1 節之決定為定稿，不重問。
- 來源文件：`./建議w-web-perm調整.md`（問題盤查、對標、矩陣、規格）、`./w-web-perm隨附資料/`（部署方依規格做好的三個新元件、八個修改檔、diff、驗證截圖與腳本）。兩者已由 Fable 逐項核實（見第 2 節），本檔只寫「怎麼併入、要改哪裡、怎麼驗」。

## 0. 必讀與守則

1. 先讀 `CLAUDE.md`、`CLAUDE_process.md`（尤其「標準圖重產」「跑測試」「整合者建議書之處理」）、`CLAUDE_rulebook.md`「測試配置」、`CLAUDE_experience.md` 最後三節（2026-09-14 與 09-16 之經驗，含本案相關陷阱）。`CLAUDE_settings.md` 只讀不改。
2. 依全域規範載入技能：改 Vue 元件前 `role-coder-for-vue-ui`；改 spec 前 `role-writer-e2e-spec`；改 e2e 或產標準圖前 `role-coder-for-test-e2e`；宣告完成前 `role-coder-for-validate`。
3. 檔案 I/O 一律用 Read／Write／Edit／Glob／Grep 工具，不用 `cat`、heredoc、`sed -i`、`grep -r`；暫存檔一律 `./tmp/`；測試中介檔一律 `./test/_tmp/`。
4. 服務 port：後端 11006、e2e 前端 8090（`test/tools/e2e-setup.mjs` 之 `startServersOnce()` 會自起）；同一時間只跑一條鏈（探測、重產、mocha 共用服務，不可並行）。超過 2 分鐘的作業用 `run_in_background`，完成會收到通知，不輪詢。
5. 不做的事：不發布套件、不重建 `dist/` 當待辦（`dist/` 由業主流程產製；本案不需要 build）、不動 `package.json` 之 scripts、不改 `CLAUDE_settings.md`、不刪 `./testPending/`（人工清）、不 commit（業主自行 commit）。

## 1. 業主裁示（定稿）

| 項 | 決定 |
|---|---|
| 方案 | 採建議書方案 B：抽 `ModeSelectChip.vue`、`RelationChip.vue`、`RelationChips.vue` 三個共用元件；A1～A3、B1～B8 全做 |
| 所屬彈窗欄序（B5） | 改為「名稱、是否使用、所屬…名稱」（隨附版已如此） |
| 「⋯ N」展開鈕（B3） | 只在 chip 數 **n ≥ 2** 時顯示（隨附版為 n ≥ 1，須改） |
| C1 Escape 關閉 WPopup | 不做（w-component-vue 尚未支援按鍵，以後再說） |
| 隨附版之 `src/App.vue` 全域樣式 | **不併入**：其目的（`.no-border.ag-cell:focus-within`）已由 w-aggrid-vue 2.0.87 內建（本專案已升版並全量回歸通過） |
| 唯讀（展示）態之本項 chip | 依隨附實作：模式段為純文字、無箭頭、無下拉（建議書 §7.7 之「透明度 0.6」一句以實作為準） |

## 2. 現況基準（動工前先確認一致）

- 工作樹：`package.json` 版本 1.0.83；`w-component-vue` 2.5.15、`w-aggrid-vue` 2.0.87、`wsemi` 1.8.94。隨附檔之基準版即 1.0.83，與現行 tree 只差本專案 09-16 對五個元件 `kpHeadFocusHighlight` 註解之改寫（已 commit），故隨附 diff 之該 hunk 會失敗，**以手動併入為準，不可整檔覆蓋**。
- 標準圖：`test/pics/` 共 10 個 flow、406 張，全數於 2026-09-16 以 w-aggrid-vue 2.0.87 回歸為綠（unit/api 113、e2e 11 檔）。
- Fable 已核實建議書之事實：B1 之 3px 裁切（儲存格 y 239～266、外框 240～269）、B2 之 0px 間距與 20/22 高、B3／B4 之資料流（`revRows` 只寫 `enable==='y'`，`mergeRules` 先聯集 OR 再交集 AND 故顯示序無關）、B6 之「使用彈窗會存 `isActive:'n'` 之模式但合併不用」皆屬實；無 ADR 牴觸（`spec/設計要點與取捨.md` 無欄序、chip、模式欄之決議）。
- 隨附元件用到的 `WTextSelect`／`WPopup` 屬性（`showExpansionIcon`、`minWidth`、`placementDistX`、`isolated`、`placement`、`labelContent` 等）於 2.5.15 皆存在。

## 3. 施工步驟（依序；每步末之「檢查點」不過不得進下一步）

### S1 併入程式碼（8 個既有檔 + 3 個新檔）

以 `./w-web-perm隨附資料/diff/*.diff` 為對照、`./w-web-perm隨附資料/src/` 為內容來源，逐檔以 Edit 併入：

| 檔 | 要做的 | 與隨附版之差異 |
|---|---|---|
| `src/components/ModeSelectChip.vue` | 新增，內容照隨附 | **`itemPaddingStyle` 改 `{v:6,h:6}`**（隨附為 `{v:6,h:10}` 配 `placementDistX -6`，清單左緣貼外框但項目文字比觸發文字右偏 4px，違反全域 §10.6.6；改 h:6 後兩者皆貼齊，S2 要量） |
| `src/components/RelationChip.vue` | 新增，內容照隨附 | 無 |
| `src/components/RelationChips.vue` | 新增，內容照隨附 | **展開鈕條件 `v-if="n > 0"` 改 `v-if="n > 1"`**，並把註解「chip 數 ≥ 1」改為「≥ 2」 |
| `src/components/VeGrupBlngUsers.vue` | 依 diff：`grupsNames` 欄改 `RelationChips`（`:items="props.row.grups"`、`:editable="isEditable"`、`:popupTitle="$t('belongGrupsNames')"`、`:tooltipAll="$t('chipsShowAll')"`、`:labelContent="'modeSelect'"`、`@input` 沿用 `showVeGrupBlngUsersToggleItemModeByName(props.row.name, item)`）；刪 `mode` 欄之 `WTextSelect`、`modeItems`、`modeSelectWidth`、import 與 components 註冊；`ks` 改 `['name','enable','grupsNames']`；`kpHead`／`kpHeadWidth`／`kpHeadFilterType` 移除 `mode` | `kpHeadFocusHighlight` 只加 `'enable': false`，**保留現行註解**（09-16 版，勿換成隨附的） |
| `src/components/VePemiBlngGrups.vue` | 同上，對象為 `pemisNames`／`belongPemisNames`／`showVePemiBlngGrupsToggleItemModeByName` | 同上 |
| `src/components/VeCgrups.vue` | 依 diff：`mode` 欄改 `ModeSelectChip`（`:value="props.row.mode"`、`:editable="isEditable && props.row.enable === 'y'"`、`:labelContent="'modeSelect'"`、`@input` 沿用）；`kpHeadWidth.mode` 100→90；加 `kpHeadFocusHighlight { mode:false, enable:false }`；刪 `WTextSelect`、`modeItems`、`modeSelectWidth` | 無 |
| `src/components/VeCpemis.vue` | 同上 | 無 |
| `src/components/VeCrules.vue` | 加 `kpHeadFocusHighlight { enable:false }` | 無 |
| `src/components/LayoutContentGrups.vue` | `tabKeys`／`tabKeysPick`／`tabKeysShow` 三處把 `'cpemis'` 移到 `'belongUsers'` 之前 | 其餘不動（`kpHeadFocusHighlight` 註解維持 09-16 版） |
| `src/components/LayoutContentPemis.vue` | 三處把 `'crules'` 移到 `'belongGrups'` 之前 | 同上 |
| `server/procLang.mjs` | `belongGrups.cht` 改「管控所屬權限群組」；新增 `chipsShowAll`（eng `Show all`／cht `展開全部`）、`chipsPopupTitle`（eng `{title} ({n} in total)`／cht `{title}：共 {n} 項`） | 無 |
| `src/App.vue` | **不改** | 隨附之全域 CSS 已由 w-aggrid-vue 2.0.87 取代 |

檢查點 S1：`git diff --stat` 只含上列 11 檔（3 新 8 改）；`grep -rn "WTextSelect\|modeSelectWidth\|modeItems" src/components/Ve*.vue` 為 0（統計頁 `LayoutContentStaInfor.vue` 之 `WTextSelect` 不在此範圍，保留）；`npx eslint --ext .vue,.mjs src/components server/procLang.mjs` 無新增錯誤（既有 `brace-style` 4 筆為原檔所有，不動）；`npm run serve` 可編譯（或 `startServersOnce` 起 8090 無編譯錯誤）。

### S2 實機探測（Playwright，腳本落 `tmp/probe-*.mjs`，沿用 `test/tools/e2e-setup.mjs` 之 `launchBrowser`／`openApp`）

量測並記錄（eng、cht 各一輪；帳號 `sys`，種子為 `g_initialTestData.mjs`）：

1. 四個彈窗之模式控制項：`getBoundingClientRect` 整顆 56×22，且 `top ≥ cell.top`、`bottom ≤ cell.bottom`（儲存格 27px）；`border-radius` 獨立 4px、嵌 chip 為 `4px 0 0 4px`；字 12px。
2. 清單對齊（§10.6.6）：點觸發區（`div[_tabindex="0"]`）後，`.WPopperFix[wtlp="modeSelect"]` 左緣 = 控制項外框左緣（誤差 ≤ 0.5px），且清單項目文字左緣（以 `Range.selectNodeContents` 量文字節點）= 觸發區文字左緣（誤差 ≤ 0.5px）。不合則調 `itemPaddingStyle.h`／`placementDistX`，量到合為止，並把最終值與量測寫進 `ModeSelectChip.vue` 註解。
3. chip：相鄰 chip 間距 4px；每顆外層與內層皆 22px；本項（`enable==='y'`）永遠第 1 顆且醒目；名稱段超長時省略號且 `title` 為全名。
4. 展開鈕：chip 數 1 的列**無**「⋯」鈕；chip 數 ≥ 2 的列有，鈕在最左、22px 高、文字為數量；點開 `.WPopperFix[wtlp="relationChipsAll"]` 列出全部 chip、標題為「所屬…名稱：共 N 項」（eng `… (N in total)`）；唯讀對話框亦可開。種子若無 ≥ 2 顆之列，先於使用者彈窗勾第二個群組製造（peter 預設 1 群組，勾 M2 後為 2）。
5. 焦點框：hover 與點擊控制項、勾選框、chip 後，該儲存格 `getComputedStyle(cell).borderColor` 為透明且 class 含 `no-border`（四個彈窗之 mode／enable／chip 欄，VeCrules 之 enable 欄）。
6. 未勾選列：所屬彈窗無任何模式控制項；使用彈窗之控制項透明度 0.6、無箭頭、點擊不出現可見之 `[wtlp="modeSelect"]`。
7. 唯讀態（關閉編輯模式再開窗）：本項 chip 模式段為純文字、無箭頭、無下拉；勾選框 `disabled`。
8. 主表：群組頁表頭序「名稱、說明、管控使用權限、管控所屬使用者」；權限頁「名稱、說明、管控對象、管控所屬權限群組」（eng 分別為 `Permissions`、`Use users`／`Rules of permission`、`Use groups`）。
9. 資料流：所屬彈窗勾選 + 切 AND + Save 後，DB 之 `cgrups`／`cpemis` 對本項為 `{mode:'AND', isActive:'y'}`（可沿用 `test/e2e-rela-user-grup.test.mjs` 之 `readDbUserCgrups` 作法）；顯示序置首不得改變儲存字串之鍵序。
10. `pageerror` 為 0。

檢查點 S2：以上 10 項全部有數字或布林紀錄（落 `tmp/probe-relachip-結果.md`），不合者先修元件再量，不得帶著不合進 S3。

### S3 改 spec（先改 spec 再改測試；受眾規則依 `role-writer-e2e-spec`）

1. `spec/流程_使用者群組關聯.md`、`spec/流程_群組權限關聯.md`：
   - 〈觸發〉與各案例 description：所屬彈窗（`VeGrupBlngUsers`／`VePemiBlngGrups`）改為三欄「名稱、是否使用、所屬…名稱」，合併模式改為「本項 chip 左段之下拉」；chip 列規則（本項置首、間距、「⋯ N」僅 ≥ 2 顆、展開浮層）；使用彈窗（`VeCgrups`／`VeCpemis`）之模式欄改「chip 樣式控制項，未勾選列淡化不可操作」。
   - E2E-002／005（使用者群組）與 E2E-002／004（群組權限）之視覺清單：所屬彈窗的「點下拉前框觸發區」改為「框住本項 chip 之模式段」、「清單展開」不變、「點 AND 前」不變；使用彈窗不變。新增每張圖之括號描述須到元素。
   - 唯讀案例（使用者群組 E2E-007／008、群組權限 E2E-005／006）語意：所屬彈窗改「本項 chip 模式段為純文字、無下拉」；使用彈窗維持「控制項淡化、點擊不彈出」。
   - 〈畫面元素對照〉：`mode` 欄列改寫（所屬彈窗刪該欄、併入 chip 欄；使用彈窗改 `ModeSelectChip`）；chip 欄列加「⋯ N」鈕與浮層；`檔案:行號` 全部重取。
   - 序列圖之 `檔案:行號` 重取（`showXxxToggleItemModeByName` 等函式行號會因刪除 data 而位移）。
   - 〈已知落差〉各加一條 **已修復（附修復紀錄）2026-09-16**：B1（29px 控制項於 27px 格被裁 3px、膠囊圓角、框中框）、B2（chip 間距 0、20/22）、B3（溢出只見 1 顆）、B4（本項在鍵尾）、B5／B6（未勾選列之模式可改但無效），證據引 `建議w-web-perm調整.md` §2.2～2.3 之量測與本次 S2 紀錄。
2. `spec/流程_後台群組清單.md`、`spec/流程_後台權限清單.md`：〈觸發〉與 E2E-001 description 之欄位列舉順序改為新序；權限頁凡寫「所屬權限群組」欄名處改「管控所屬權限群組」（注意：對話框標題 `pemiBlngEditGrups`「編輯所屬權限群組」是另一個鍵，不改）；〈畫面元素對照〉之 `belongGrups` 列補「表頭 `belongGrups` cht 已改字（2026-09-16）」；〈已知落差〉各加一條已修復（A1／A2 欄序、A3 欄名）。
3. `spec/流程_後台使用者清單.md`：E2E-011／012 若其 description 提到對話框之「mode 下拉」，同步改字（使用彈窗仍有模式欄，只是外觀）。
4. 機械掃描每個 description：`本案例|驗證|截圖|stage[0-9]|E2E-\d|src/|\*\*|（[^）]{12,}）|\{[^}]*\}|→` 零命中。

檢查點 S3：`grep -n "所屬權限群組" spec/流程_後台權限清單.md` 只剩對話框標題語意處；`grep -n "'mode'\|mode 欄" spec/流程_使用者群組關聯.md spec/流程_群組權限關聯.md` 每一處都已對應新設計；`檔案:行號` 抽 10 處回查皆正確。

### S4 改 e2e（`test/tools/e2e-setup.mjs` 與各測試檔）

1. `e2e-setup.mjs`：
   - `pickWTextSelect(page, containerSel, wtlp, itemText)` 保留。
   - `setDialogModeWithShots(page, rowIndex, mode)` 改成能用於兩種容器：新增參數或另一函式 `setDialogModeWithShots(page, rowIndex, mode, { colId = 'mode' })`；所屬彈窗呼叫時傳 `colId: 'grupsNames'`／`'pemisNames'`（本項 chip 之 `ModeSelectChip` 在該欄且每列唯一）。「點下拉前」框住 `${cell} div[style*="opacity"]`（WShellEllipse 外框）改為框住整顆本項 chip（`${cell} div[title]` 第一顆，即 `RelationChip` 根元素）於所屬彈窗；使用彈窗維持框住控制項外框。
   - 新增 `openChipsAllWithShots(page, rowIndex, colId)`：點「⋯ N」鈕（`${cell} div[title="展開全部|Show all"]`，以 `$t('chipsShowAll')` 取字）→ 等 `.WPopperFix[wtlp="relationChipsAll"]:visible` → 回傳兩張（點擊前框鈕、展開後框整個浮層）→ 點浮層外關閉並等 hidden。
   - `dialogEnableCheckboxSel`、`dialogRowBoxSel`、`rowBoxSel` 不變。
2. `test/e2e-rela-user-grup.test.mjs`、`test/e2e-rela-grup-pemi.test.mjs`：
   - 所屬彈窗案例（使用者群組 E2E-004～008、群組權限 E2E-003～006）依 S3 之視覺清單改截圖序與名稱；其中一個可編輯案例（建議使用者群組 E2E-005：勾 mary 後 peter／mary 皆 ≥ 2 群組）加「⋯ N」展開浮層兩張與語意（浮層 chip 數 = 該列 chip 數、首顆為本項）；`E2E-004`（開窗初始態）之語意加「chip 數 1 之列無展開鈕」。
   - 唯讀案例語意改為 S3 所定（所屬：本項 chip 模式段無 `div[_tabindex="0"]`；使用：控制項 opacity 0.6 且點擊後無可見 `[wtlp="modeSelect"]`）。
   - 主表相關 shot（`*-source-row`、`*-data-changed`、`cpemis-filled`）不需改程式，但欄序改變後圖會變（S5 重產）。
3. `test/e2e-grups.test.mjs`、`test/e2e-pemis.test.mjs`：E2E-001 若有斷言表頭順序或 `belongGrups` 表頭文字，依新序／新字改；其餘不動。
4. `test/e2e-users.test.mjs` E2E-011／012：使用彈窗仍為 `mode` 欄，helper 不變；若 E2E-012（for:grups）有斷言下拉可操作，維持。
5. 每條新斷言註解對應 spec 句（`role-coder-for-test-e2e` §5）。`node --check` 全部改過的檔。

檢查點 S4：語法檢查通過；`grep -n "setDialogMode(" test/*.mjs` 為 0（舊 helper 已於 09-14 收斂）；受影響案例之 `run()` 回傳之 shot 名稱與 spec 視覺清單逐字一致。

### S5 重產標準圖（單鏈序列；流程依 `CLAUDE_process.md`「標準圖重產」）

1. 先跑一次受影響五檔 mocha 取失敗清單（`npx mocha test/e2e-<flow>.test.mjs --reporter list --timeout 300000`，逐檔背景執行）：grups、pemis、rela-user-grup、rela-grup-pemi、rela-pemi-rule；預期失敗全部可歸因（欄序／欄名／彈窗改版）；不可歸因者先查再說。
2. 備份 `test/pics` 至 `tmp/pics-backup/`。
3. 重產（`node test/e2e-<flow>.test.mjs --baseline [--names …]`，逐檔序列）：
   - `e2e-grups`、`e2e-pemis`、`e2e-rela-grup-pemi`、`e2e-rela-user-grup`、`e2e-rela-pemi-rule`：全案例（主表欄序或欄名皆變）。
   - `e2e-users`：`--names E2E-011,E2E-012`（使用彈窗控制項外觀變）。
   - `e2e-targets`、`e2e-init`、`e2e-layout`、`e2e-stainfor`、`e2e-doubleclick`：不重產。
   - 改名之舊圖（所屬彈窗案例之 shot 序號變動者）先刪再產，整案重產。
4. 重產後與備份逐張 pixelmatch（threshold 0.1、includeAA false）：diff ≤ 100 者自備份還原（已審圖不動），只保留真的變了的；列出新增與消失之檔名。
5. 紅框掃描：每張變更或新增之圖須含 `#f26` 連續 ≥ 20px 之框線，無框者為 0。
6. 目視：每個變更案例至少開一張裁切圖核對「框住的是 spec 寫的元素」，重點看：本項 chip 置首與醒目、「⋯ N」只在 ≥ 2 顆、清單與觸發文字對齊、唯讀態無箭頭、主表新欄序與「管控所屬權限群組」表頭。裁切／拼圖工具可仿 09-14 之 `tmp/crop-review.mjs`／`tmp/montage.mjs`（已清，需重寫）。
7. 交業主審圖（回報附拼圖路徑與變更清單），**認可後**才跑 mocha 比對。
8. 預估規模：grups 46、pemis 46、rela-grup-pemi 62、rela-user-grup 70、rela-pemi-rule 36、users 約 12，合計約 270 張進入比對，其中未變者會自備份還原。

檢查點 S5：變更清單每張都能講出原因；紅框無框數 0；`test/_tmp/` 無殘留；`./testPending/` 本輪新增之三聯組皆已歸因。

### S6 全量驗證

1. `npx mocha --no-parallel "test/unit-*.test.mjs" "test/api-*.test.mjs" --timeout 180000` 全綠。
2. `node test/tools/run-e2e-isolated.mjs` 11 檔全綠（背景執行約 60 分鐘）。
3. e2e-init 打後端 `dist/`：本案不動統計頁與登入畫面，**不需 build**；若 e2e-init 報 `dist/index.html 不存在`，是因 `dist/index.html` 為後端啟動時由 `dist/index.tmp` 產生之執行期檔（`server/WWebPerm.mjs` 約 :710），先起一次後端（任一 api 測試或 `node srv.mjs` 數秒）再單跑 `npx mocha test/e2e-init.test.mjs --reporter list --timeout 300000`。不要 `npm run build`（會清掉受版控之 `dist/w-web-perm.umd.js`）。
4. 收尾：11006／8090 釋放、`tmp/` 清空（保留者說明）、`git status` 只剩本案應有之變更。

### S7 文件與收尾

1. `CLAUDE_rulebook.md`「規格 → 測試檔對照」：案例範圍若有增減（如使用者群組關聯新增展開浮層之圖）更新；「專案特有機制」可加一行「關聯彈窗 chip／模式控制項共用元件 `ModeSelectChip`／`RelationChip`／`RelationChips`」。
2. `CLAUDE_experience.md` 加一節「關聯彈窗 chip 化（2026-09-16）」：併入時的差異（App.vue 不併、n ≥ 2、清單對齊值）、e2e helper 之容器分支、重產規模與時間。
3. 全部完成且業主認可標準圖後，刪除 `建議w-web-perm調整.md` 與 `w-web-perm隨附資料/`（依 `CLAUDE_process.md`「整合者建議書之處理」④；證據已併入 spec〈已知落差〉與 experience）。
4. 不 commit；回報時列出 `git status --short` 摘要供業主 commit。

## 4. 驗收判準（全部成立才算完成；每條附證據落點）

1. S2 之 10 項量測全部合格，紀錄在 `tmp/probe-relachip-結果.md`（或回報內文）。
2. `src/App.vue` 未變更；`src/components/Ve*.vue` 無 `WTextSelect` 直接引用；三個新元件存在且被四個彈窗引用。
3. `server/procLang.mjs` 之 `belongGrups.cht`、`chipsShowAll`、`chipsPopupTitle` 三鍵存在且 eng／cht 齊。
4. spec 六份改寫完成，description 機械掃描零命中，〈已知落差〉之已修復條目有日期與證據。
5. e2e 測試檔與 spec 視覺清單之圖名四處一致（圖鍵、`run()` 回傳名、寫檔名、比對名）。
6. 標準圖：變更清單經業主認可；紅框無框 0；未變者為備份位元級原檔。
7. unit／api 113 以上全綠；e2e 隔離 11 檔全綠。
8. 工作樹：`tmp/` 空、`test/_tmp/` 空、port 釋放；`建議w-web-perm調整.md` 與 `w-web-perm隨附資料/` 已刪（業主認可後）。

## 5. 陷阱（皆已實際踩過，見 `CLAUDE_experience.md`）

- Vue 2 會把 style 正規化成含空白（`cursor: pointer`、`font-size: 1.5rem`），selector 不可用無空白寫法；WTextSelect 觸發區以靜態屬性 `div[_tabindex="0"]` 定位，清單在 body 之 `.WPopperFix[wtlp=…]`。
- WTextSelect 清單左緣錨定「觸發區文字左緣」，`placementDistX` 之絕對值須等於「邊框 + 左內距」才貼外框，項目文字對齊另看 `itemPaddingStyle.h`；一律量測後定值。
- 對話框 mode 欄之 pill 點擊要點觸發元素本身，點儲存格中心會落在控制項外。
- 導覽收合／展開之就緒訊號用幾何，不用 WDrawer `[state]`（本案不涉及，但 `captureStable` 內建之 `waitDrawerReady` 已處理）。
- `npm run build` 會清掉受版控之 `dist/` 檔；本案不 build。若不得已 build，測完 `git checkout -- dist` 且 `git clean -fq dist/css dist/js`（保留未受版控之 `dist/index.html`）。
- 每步兩張不可跳步：點擊前框要點、點擊後框反應元素；所屬彈窗之「點下拉前」要框本項 chip 而不是舊的 mode 儲存格。
- 重產標準圖是換掉真理：只產受影響案例，未變者自備份還原，交審後才比對。
- 只勾 checkbox 之案例（users E2E-012、rela-* E2E-003／005／006、grups／pemis E2E-009 等）目前為「開窗 → 勾選後」兩張，業主尚未裁示是否展開為每步兩張；本案**不**擴大到這些案例，只改因本案而變的圖。

## 6. 回報格式（結案時）

1. 併入差異表：11 檔各改了什麼、與隨附版差在哪（App.vue 不併、n ≥ 2、對齊值）。
2. S2 量測表（10 項 × eng／cht）。
3. spec 改寫清單（檔、節、案例）與〈已知落差〉新增條目。
4. 標準圖：變更／新增／消失清單與張數、拼圖路徑、紅框掃描結果；待業主審。
5. 測試結果：unit／api、e2e 11 檔逐檔。
6. 未做與待裁示：C1（不做）、checkbox-only 案例展開（待裁示）、其他發現。
7. `git status --short` 摘要。
