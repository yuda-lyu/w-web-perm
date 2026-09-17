# w-web-perm 隨附資料：依「建議w-web-perm調整.md」實作之修改版原始檔、差異檔與驗證證據

- 基準版本：`w-web-perm` 1.0.83（取自 `rddmanager_2_perm/node_modules/w-web-perm`）；建置與驗證所用之相依：`vue` 2.7.16、`w-component-vue` 2.5.15、`w-aggrid-vue` 2.0.86、`ag-grid-community` 31.3.4、`@vue/cli-service` 5.0.9
- 產出日期：2026-09-15
- 對應建議書：主專案根之 `建議w-web-perm調整.md`（問題盤查、對標、矩陣、方案與規格）；另有 `建議w-aggrid-vue修正.md`（本次連帶查出之 w-aggrid-vue 缺陷）
- 本資料夾內之檔案皆為**可直接覆蓋至套件對應路徑**之完整檔（非片段），`diff/` 另附對 1.0.83 之差異供審閱

## 1. 檔案清單與各檔改了什麼

| 路徑（對應套件內路徑） | 性質 | 內容 |
|---|---|---|
| `src/components/ModeSelectChip.vue` | 新增 | 合併模式（OR／AND）控制項：內核 `WTextSelect`（`labelContent` 仍為 `modeSelect`），外觀為 chip 模式段（56×22、方角 4px、字 12px、內距 0 5、箭頭 14），`highlight`（醒目色）與 `attached`（右側無圓角，嵌於 chip 左段）兩個外觀開關；唯讀時透明度 0.6、無箭頭、不展開；清單 `minWidth` 給整顆寬使清單不窄於控制項、`placementDistX -6` 使清單左緣對齊外框 |
| `src/components/RelationChip.vue` | 新增 | 單顆關聯 chip（模式段＋名稱段，整顆 22px）；`isCurrent` 為本項時用醒目色；`editable && isCurrent` 時模式段即 `ModeSelectChip`（chip 即下拉），其餘 chip 之模式段為純文字；名稱段 `max-width 240px` 省略號截斷、全名放 `title` |
| `src/components/RelationChips.vue` | 新增 | chip 列表：本項永遠排第 1 顆（只改顯示順序）、相鄰間距 4px；最左固定「⋯ N」展開鈕（`title` 為 `$t('chipsShowAll')`），點開 `WPopup`（`labelContent` 為 `relationChipsAll`、寬 320～560、內容 `flex-wrap` 且最大高 50vh 可捲）列出全部 chip；標題文字用 `$t('chipsPopupTitle')` 之 `{title}`／`{n}` 佔位 |
| `src/components/VeGrupBlngUsers.vue` | 修改 | `grupsNames` 欄改用 `RelationChips`（`@input` 沿用 `showVeGrupBlngUsersToggleItemModeByName`）；移除 `mode` 欄與 `WTextSelect`、`modeItems`、`modeSelectWidth`；`ks` 改為 `name`、`enable`、`grupsNames`（本列自己可改的在左）；`kpHeadFocusHighlight` 加 `enable:false`。`genItems`／`revRows`／`doSave` 之資料流不動 |
| `src/components/VePemiBlngGrups.vue` | 修改 | 同上，對象為 `pemisNames`／`showVePemiBlngGrupsToggleItemModeByName` |
| `src/components/VeCgrups.vue` | 修改 | `mode` 欄改用 `ModeSelectChip`，`editable` 綁 `isEditable && props.row.enable === 'y'`（未勾選列淡化不可操作）；`kpHeadWidth.mode` 100 改 90；加 `kpHeadFocusHighlight { mode:false, enable:false }`；移除 `WTextSelect`、`modeItems`、`modeSelectWidth` |
| `src/components/VeCpemis.vue` | 修改 | 同上 |
| `src/components/VeCrules.vue` | 修改 | 只加 `kpHeadFocusHighlight { enable:false }`（與其餘關聯對話框一致） |
| `src/components/LayoutContentGrups.vue` | 修改 | `tabKeys`／`tabKeysPick`／`tabKeysShow` 之 `cpemis` 移到 `belongUsers` 之前（主表欄序：管控使用權限、管控所屬使用者） |
| `src/components/LayoutContentPemis.vue` | 修改 | 同上，`crules` 移到 `belongGrups` 之前（管控對象、管控所屬權限群組） |
| `src/App.vue` | 修改 | 全域樣式加一條 `.CompCssWAggridVue .no-border.ag-cell:focus-within { border-color:transparent !important; }`，補 w-aggrid-vue 2.0.86 只覆寫 `:focus` 之缺口（詳 `建議w-aggrid-vue修正.md`），該套件修正後可移除 |
| `server/procLang.mjs` | 修改 | `belongGrups.cht` 改「管控所屬權限群組」；新增 `chipsShowAll`（展開全部）與 `chipsPopupTitle`（`{title}：共 {n} 項`）兩鍵，eng 同步 |
| `diff/*.diff` | 差異 | 對 1.0.83 原檔之 unified diff（`git diff --no-index`）；三個新檔為 `*.new.diff`（`diff -u /dev/null`） |
| `驗證截圖/*.png`、`驗證截圖/verify.json` | 證據 | 修改版於真瀏覽器之量測與截圖（見第 3 節） |
| `驗證腳本/zz_wwp_verify.mjs` | 工具 | Playwright 驗證腳本（27 項判準）；`zz_perm_probe.mjs`／`zz_perm_zoom.mjs` 為修改前之量測腳本（w-screenctl／Playwright） |
| `驗證腳本/build.log`、`lint.log` | 證據 | vue-cli 建置與 eslint 輸出 |

未隨附：`dist/`（請依套件自身流程 `npm run build` 再 `toolg/genEntry.mjs` 產 `index.tmp`）、`docs/`、`w-web-perm.umd.js`（`src/perm.mjs`／`getPerm.mjs` 未動，umd 不受影響）。

## 2. 建置與驗證方式（可重現）

1. 把 1.0.83 之 `src/`、`public/`、`babel.config.js`、`vue.config.js`、`package.json`、`.eslintrc.js` 複製到主專案 `tmp/wwp_build/`，覆蓋本資料夾之 `src/`，以主專案之 `@vue/cli-service` 5.0.9 建置（相依皆自主專案 `node_modules` 解析，版本與 `rddmanager_2_perm` 相同）：`vue-cli-service build`，12 秒完成，無錯誤。
2. `vue-cli-service lint --no-fix` 掃上列 11 檔：新增之三檔與本次改動之行皆無錯誤；剩餘 8 筆 `brace-style` 全在原檔既有之 `.then(() => { okSave = true })` 一行寫法（`LayoutContentGrups.vue:1224`、`LayoutContentPemis.vue:1226`、`VeGrupBlngUsers.vue:956`、`VePemiBlngGrups.vue:956`），非本次改動，未動。
3. 以 `rddmanager_2_perm/test/e2e-srv.mjs` 於另一 cwd（含建置後之 `dist/`）啟動第二個後端於埠 11016，資料庫為 e2e 種子快照之複本，設定檔以 `kpLangExt` 帶入 `belongGrups`／`chipsShowAll`／`chipsPopupTitle`（效果同 `server/procLang.mjs` 之修改，因後端仍載入 node_modules 內之原版 procLang）。
4. `驗證腳本/zz_wwp_verify.mjs`：Playwright 1600×900（放大圖 DPR 3），自單一登入系統以真實 UI 登入取得權杖後開 `http://localhost:11016/?token=…`，真滑鼠 hover／點擊，逐條量測。

## 3. 驗證結果（27 項判準全數通過，`驗證截圖/verify.json`）

| 判準（對應建議書第 8 節） | 實測 |
|---|---|
| 主表欄序 | 管理權限群組：名稱、說明、管控使用權限、管控所屬使用者；管理權限：名稱、說明、管控對象、管控所屬權限群組（`A-*.png`） |
| 模式控制項幾何 | 整顆 56×22（外框 `border-radius` 獨立 4px、嵌 chip `4px 0 0 4px`），落在 27px 儲存格內（y 297.8～319.8 對 293～320），四個對話框皆同（`B1`、`C1`、`D1`、`E1`） |
| 儲存格焦點框 | hover 與點擊後儲存格 `border` 皆為透明，class 含 `no-border`（`B2`、`B3`、`G2`、`G3`） |
| 清單浮層 | 56 寬、兩列各 28px、依序 OR、AND，左緣與控制項對齊（941 對 940.9）；點 AND 後 chip 顯示 AND 且清單收起（`B3`、`B4`、`C3`、`E2`、`G3`） |
| chip | 相鄰間距 4px、整顆與內層皆 22px（`G1`）；`系統管理者編輯_權限群組` 列 94 顆時儲存格內第 1 個元素為「⋯ 94」鈕、第 2 個為本項醒目 chip（`B1`、`G1`） |
| 展開全部 | 浮層 560×488（位於視窗內），列出 94 顆、本項第 1 顆且醒目，標題「所屬權限名稱：共 94 項」（`B5`）；唯讀態仍可開（`F2`） |
| 未勾選列 | 所屬對話框：無任何模式控制項；勾選後本項 chip 立即成為第 1 顆並帶下拉（`B6`）。使用對話框：控制項透明度 0.6、無箭頭、點擊不展開（`C1`～`C3`） |
| 唯讀（展示）態 | 本項 chip 之模式段為純文字、無箭頭、無下拉；勾選框 `disabled`（`F1`） |

## 4. 已知事項與未涵蓋

1. 儲存格焦點框之根因在 `w-aggrid-vue`（`WAggridVue.vue:2874` 只寫 `:focus`），本修改版於 `App.vue` 先行覆寫，見 `建議w-aggrid-vue修正.md`。
2. `WPopup` 展開中按 Escape 不關閉（`w-component-vue` 之 `modeHide` 只有 click／mousedown），本次未動。
3. 只驗證 `cht`；`eng` 之字串已同步但未開畫面看。
4. 套件自身之測試（若有）未執行；`dist/` 未重建。
5. 兩個「所屬」對話框之欄序改為「名稱、是否使用、所屬…名稱」，若不採用，只需把 `genOpt` 之 `ks` 順序改回並保留其餘改動。
6. 主系統端後續（非套件端工作）：套件發版後重寫 `rddmanager_2_perm/spec` 之相關案例、重產標準圖、改 e2e helper（原以 `width:72px` 行內樣式定位下拉整顆，改後為 `width:56px`，且本項 chip 之下拉須以 chip 為錨）、改操作手冊 C 冊。
