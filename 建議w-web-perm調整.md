# 建議 w-web-perm 調整：主表關聯欄之欄序與欄名、關聯彈窗之 chip 與合併模式下拉

- 對象套件：`w-web-perm` 1.0.83（本專案 `rddmanager_2_perm/node_modules/w-web-perm`）；連帶用到 `w-component-vue` 2.5.15 之 `WTextSelect`／`WShellEllipse`／`WPopup`
- 提出日期：2026-09-15
- 提出者：主系統 `rddmanager` 之 agent（依業主 2026-09-15 之操作回饋盤查）
- 證據：主 cwd `tmp/perm_probe/`（量測 JSON `probe.json`、w-screenctl 截圖 `01`～`17`、Playwright DPR 3 局部放大圖 `zoom-*.png`、探測腳本 `tmp/zz_perm_probe.mjs`／`tmp/zz_perm_zoom.mjs`）
- 本檔性質：全部為套件端可自行決定之修正與設計調整，無需業主裁示之事項；第 9 節列出套件改版後主系統端要連動的事（由主系統端處理，不是套件端工作）
- **隨附修改版**：主專案根之 `w-web-perm隨附資料/`（第 7 節規格之完整實作：3 個新增元件、8 個修改檔、對 1.0.83 之 diff、以 vue-cli 建置並於真瀏覽器驗證第 8 節 27 項判準全數通過之截圖與量測，見其 `README.md`）；連帶查出之 `w-aggrid-vue` 缺陷另見 `建議w-aggrid-vue修正.md`

---

## 0. 摘要與變更清單

業主實際操作「管理權限群組」「管理權限」與四個關聯彈窗後指出六件事，經讀碼與實機量測全部成立，另盤查出兩件同類問題。建議清單如下（優先序 1 為必改，2 為建議一併改，3 為可選）。

| 編號 | 位置 | 類型 | 優先 | 一句話 |
|---|---|---|---|---|
| A1 | `LayoutContentGrups.vue` 主表欄序 | 設計調整 | 1 | 「管控使用權限」移到「管控所屬使用者」左邊 |
| A2 | `LayoutContentPemis.vue` 主表欄序 | 設計調整 | 1 | 「管控對象」移到「所屬權限群組」左邊 |
| A3 | `server/procLang.mjs` 之 `belongGrups.cht` | 文字錯誤 | 1 | 「所屬權限群組」改為「管控所屬權限群組」，與「管控所屬使用者」對稱 |
| B1 | 四個關聯彈窗之「合併…模式」下拉外框 | 缺陷 | 1 | 外框 29px 高塞在 27px 儲存格內被裁掉底部 3px、圓角 30px 呈膠囊、點擊後儲存格再套一圈藍色焦點框；改為與 chip 同語言的 22px 方角控制項 |
| B2 | 兩個「所屬」彈窗之 chip 列 | 缺陷 | 1 | chip 之間水平間距 0px、chip 外框 20px 但內層 22px；改為間距 4px、整顆 22px 且垂直置中 |
| B3 | 兩個「所屬」彈窗之 chip 溢出 | 缺陷 | 1 | 一列可達 94 顆 chip、儲存格 266px 只看得到 1 顆；加「展開全部」鈕以浮層列出全部 chip |
| B4 | 兩個「所屬」彈窗之當前項位置 | 缺陷 | 1 | 已勾選「是否使用」時，代表本項之醒目 chip 依儲存順序常排在最後而看不見；顯示時一律排第 1 顆 |
| B5 | 兩個「所屬」彈窗之合併模式欄 | 設計調整 | 2 | 模式下拉併入本項 chip 之左段（chip 即下拉），移除「合併…模式」欄；未勾選之列不再出現模式控制項 |
| B6 | 兩個「使用」彈窗之合併模式欄 | 設計調整 | 2 | 保留欄位但改用與 B5 同一顆控制項；未勾選之列淡化不可操作 |
| B7 | 四個彈窗之 `kpHeadFocusHighlight` | 設計調整 | 2 | 模式欄、是否使用欄、chip 欄關閉儲存格焦點框 |
| B8 | 四個彈窗共 4 份重複之 chip／下拉標記 | 補丁堆積 | 2 | 抽成套件內共用子元件（一個模式控制項、一個 chip 列表），四檔只留呼叫 |
| C1 | `WPopup` 展開中按 Escape 不關閉 | 知悉 | 3 | 屬 `w-component-vue` 層，本檔只記錄，不在本次範圍 |

---

## 1. 盤查範圍與方法

1. 讀碼：`src/components/LayoutContentGrups.vue`、`LayoutContentPemis.vue`、`LayoutContentUsers.vue`、`LayoutContentTargets.vue`、`VeGrupBlngUsers.vue`、`VePemiBlngGrups.vue`、`VeCgrups.vue`、`VeCpemis.vue`、`VeCrules.vue`、`server/procLang.mjs`、`src/plugins/mShare.mjs`（權限合併邏輯）、`w-component-vue` 之 `WTextSelect.vue`／`WShellEllipse.vue`／`WTextSuggestCore.vue`／`WPopup.vue`、`w-aggrid-vue` 之 `WAggridVue.vue`。
2. 實機量測：以 w-screenctl（7000）於 1600×900 開本專案（`http://localhost:11006/?token=…`，帳號 admin），逐頁讀表頭、逐彈窗以 `getBoundingClientRect` 與 `getComputedStyle` 量列高、儲存格、下拉外框、chip、浮層清單；以 Playwright（DPR 3、真滑鼠 hover）拍局部放大圖確認業主所見。
3. 覆蓋：主表 4 頁（管理權限、管理權限群組、管理使用者、現有功能清單）、關聯彈窗 5 個（含無模式欄之「編輯使用對象」，用於對稱檢查）。

---

## 2. 現況事實（全部為實測或 `檔案:行號`）

### 2.1 主表表頭順序與欄名

| 頁 | 實測表頭順序 | 來源 |
|---|---|---|
| 管理權限群組 | 名稱、說明、管控所屬使用者、管控使用權限 | `LayoutContentGrups.vue:309`～`:342`（`tabKeys` 之 `belongUsers` 在 `cpemis` 之前）；欄名 `procLang.mjs:261`～`:264`（`belongUsers.cht` 管控所屬使用者）、`:588`～`:591`（`grupCpemis.cht` 管控使用權限） |
| 管理權限 | 名稱、說明、所屬權限群組、管控對象 | `LayoutContentPemis.vue:309`～`:342`（`belongGrups` 在 `crules` 之前）；欄名 `procLang.mjs:265`～`:268`（`belongGrups.cht` 所屬權限群組，`eng` 為 `Use groups`）、`:448`～`:451`（`pemiCrules.cht` 管控對象） |
| 管理使用者 | 名稱、電子郵件、說明、管控使用權限群組、是否為系統管理員、是否有效 | `LayoutContentUsers.vue:314`～`:353`；只有一個關聯欄，無欄序問題 |
| 現有功能清單 | 對象名稱、說明 | 無關聯欄 |

欄名對稱性：群組頁之「管控所屬使用者」（`belongUsers`）與權限頁之「所屬權限群組」（`belongGrups`）是同一類欄（列出本項被哪些上層使用），英文皆為 `Use …`，中文卻一個有「管控」一個沒有，屬文字錯誤。

### 2.2 四個關聯彈窗之幾何（四個彈窗數值完全相同）

| 量測項 | 實測值 | 來源 |
|---|---|---|
| 表格列高／儲存格高 | 28px／27px（`--ag-row-height: calc(4px*7)`，儲存格 `line-height:27px`、`padding:0 11px`、`overflow:hidden`） | ag-grid balham 主題（`WAggridVue.vue:17`） |
| 下拉整顆（`WTextSelect` 根元素） | 72×29px | `VeGrupBlngUsers.vue:155`～`:167`、`VePemiBlngGrups.vue:155`～`:167`、`VeCgrups.vue:131`～`:143`、`VeCpemis.vue:131`～`:143`（`:style="width:${modeSelectWidth}px"`，`modeSelectWidth` 72 見各檔 `:249`／`:222`） |
| 下拉外框（`WShellEllipse` 內層 div） | `border-radius:30px`、`border:1px solid #fff`、`background:#fff`、`padding:0 10px`、內容高 27（繼承儲存格 `line-height`），連邊框 29px；儲存格 y 293～320，外框 y 294～323，**底部 3px 落在儲存格之外被 `overflow:hidden` 裁掉** | `WTextSelect.vue:182`～`:185`（`borderRadius` 預設 30）、`:295`～`:310`（背景與邊框預設 white）、`WShellEllipse.vue:11`～`:12`、`WTextSuggestCore.vue:27`（文字 div 無自身 line-height） |
| 下拉文字 | 13.6px（`WTextSelect` 預設 `0.85rem`），表格與 chip 皆 12px | `WTextSelect.vue:202`～`:205` |
| 列 hover 時 | 列底色 `#ecf0f1`（`--ag-row-hover-color`），白色膠囊外框在灰底上完整顯形且上下被裁（見 `zoom-pemiBlngGrups-hover.png`、`zoom-cgrups-hover.png`） | 實測 |
| 點下拉時 | 儲存格加 `ag-cell-focus`，`border:1px solid #0091ea` 整格藍框，框內再一顆白色膠囊（見 `zoom-cgrups-open.png`，即業主截圖之畫面） | `WAggridVue.vue:1584`～`:1586`（`kpHeadFocusHighlight` 為 false 才給 `no-border`）；四彈窗只對 chip 欄關閉（`VeGrupBlngUsers.vue:468`～`:470`），模式欄與是否使用欄未關閉 |
| 展開之清單浮層 | 55×66px，兩列各 33px（`itemPaddingStyle {v:8,h:10}`、字 12.8px），Teleport 至 body 不被表格裁切；按 Escape 不關閉，須點浮層外 | 實測；`WPopup.vue:122`～`:125`（`modeHide` 只有 click／mousedown） |
| chip（僅兩個「所屬」彈窗） | 外層 `span` `display:inline-block; height:20px; line-height:20px`，內層兩段 div 各高 22px（邊框 1px 上下），**內層比外層高 2px**；相鄰 chip **間距 0px**（六列全部量到 0）；字 12px；模式段 `padding:0 5px; border-radius:4px 0 0 4px`；名稱段 `background:#eee; color:#555; white-space:nowrap`；醒目（本項）chip 模式段 `#be295a`、名稱段 `#d22f64`、白字 | `VeGrupBlngUsers.vue:143`～`:154`、`VePemiBlngGrups.vue:143`～`:154` |
| chip 溢出 | 儲存格寬 266px、`overflow:hidden; white-space:nowrap; text-overflow:ellipsis`；「編輯所屬權限群組」之 `系統管理者編輯_權限群組` 列有 **94 顆** chip，末顆右緣在 x=25632，93 顆在儲存格外；`L2所有頁面閱覽_權限群組` 列 50 顆；名稱 `「區域地質描述模型建置及評估模式應用」案_公開閱覽_權限` 單顆即 363px，一顆都放不下 | 實測 `probe.json` 之 `pemiBlngGrups.dialog.chipRows` |
| 當前項 chip 之位置 | chip 順序＝該列 JSON 之鍵順序（`genItems` 逐鍵 `push`，`VePemiBlngGrups.vue:611`～`:643`）；勾選「是否使用」後本項被寫到鍵尾（`revRows`，`:709`～`:720`），故本項 chip 排最後。實測於 `L0公開頁面閱覽_權限群組` 列勾選後，本項為第 5 顆，儲存格內仍只看得到第 1 顆灰色 chip（`zoom-pemiBlngGrups-checked.png`） | 實測 |
| 文字墨跡寬（字型 `Microsoft JhengHei`） | 12px：OR 17.5、AND 27.0；13.6px：OR 19.8、AND 30.6 | canvas `measureText` |

### 2.3 資料與儲存邏輯之相關事實

1. **合併模式只在「已使用」時有意義**：`mShare.mjs:404`、`:411` 先以 `isActive === 'y'` 過濾，再取 `mode`；未使用之關係其 `mode` 不參與計算。
2. **兩個「所屬」彈窗連儲存都會丟掉未勾選列之模式**：`revRows` 只在 `enable === 'y'` 時寫 `{mode, isActive:'y'}`（`VeGrupBlngUsers.vue:709`～`:720`、`VePemiBlngGrups.vue` 同行號），`doSave` 亦只收 `isActive === 'y'` 之項（`:1062`～`:1073`）。因此目前「未勾選列仍可改模式」是可操作但無效之控制項（有承諾無行為）。
3. **兩個「使用」彈窗會把未勾選列之模式連同 `isActive:'n'` 一起存**（`VeCgrups.vue:787`～`:809`、`VeCpemis.vue` 同行號），存了也不用（見第 1 點）。
4. **chip 順序與權限結果無關**：`mergeRules`（`mShare.mjs:274`～`:389`）先把規則分成 OR 組與 AND 組（`:346`～`:347`），全部 OR 逐一聯集（`:362`～`:365`）後再全部 AND 逐一交集（`:369`～`:375`）；聯集與交集各自可交換，且 AND 一律在 OR 之後，故 JSON 鍵順序不影響結果。顯示端把本項排第 1 顆只改顯示順序、不改儲存字串，即使改了儲存順序結果也相同。
5. 四個彈窗之模式資料流：`props.row.mode` 進 `WTextSelect`，`@input` 呼叫 `showXxxToggleItemModeByName(name, item)`（各檔既有），兩個「所屬」彈窗再經 `revRows` 重算 chip；本文之調整都可沿用這些既有方法，不需動資料流。

---

## 3. 問題清單（每條附判定）

| 編號 | 症狀（使用者可觀察） | 成因（`檔案:行號`） | 判定 |
|---|---|---|---|
| P1 | 滑鼠移到列上，模式下拉顯形為白色膠囊，上下緣被列切掉；點下去整格再套藍框，框中框 | 外框 29px 高於儲存格 27px 且 `overflow:hidden`（2.2）；`borderRadius` 沿用 `WTextSelect` 預設 30；`kpHeadFocusHighlight` 未關閉模式欄 | 缺陷（尺寸未依容器計算、視覺語言與同格 chip 不一致） |
| P2 | chip 一顆貼一顆，沒有留白 | `VeGrupBlngUsers.vue:144`～`:153` 之 `span` 無 margin、容器非 flex 無 gap；同檔內層 22px 高於外層 20px | 缺陷（未經設計） |
| P3 | 一列 94 顆 chip 只看得到 1 顆加「…」，拉寬欄也看不完 | 儲存格 `overflow:hidden` 且無任何展開機制（2.2） | 缺陷（資訊不可達） |
| P4 | 勾選「是否使用」後，代表本項之醒目 chip 看不到 | 本項在鍵尾，`genItems` 依鍵序輸出（2.2、2.3 第 4 點） | 缺陷（狀態回饋不可見） |
| P5 | 未勾選之列也能切換模式，儲存後不見了 | 2.3 第 2 點 | 缺陷（有承諾無行為） |
| P6 | 模式文字 13.6px、chip 與表格 12px；下拉膠囊、chip 方角，同一格內兩種語言 | `WTextSelect` 預設值未覆寫 | 缺陷（同格元素樣式不一致） |
| P7 | 主表關聯欄「先抽象後具體」 | 2.1 | 設計調整（業主要求：本項自己管控的在左，由上層帶過來的在右） |
| P8 | 「所屬權限群組」與「管控所屬使用者」不對稱 | `procLang.mjs:265`～`:268` | 文字錯誤 |
| P9 | 同一段 chip 標記在兩檔各寫一份、同一段下拉設定在四檔各寫一份 | 2.2 來源欄 | 補丁堆積訊號（改一處要改四處，本次即是） |

---

## 4. 對標（同類成熟產品）與差異分類

| 事項 | 常規作法 | 本套件現況 | 分類 |
|---|---|---|---|
| 表格列內之下拉／選單 | ag-grid 內建 `agSelectCellEditor`、AntD Table 內嵌 `Select size="small"`：控制項高度小於列高（balham 28px 列配 22～24px 控制項）、方角或小圓角（2～4px）、不用膠囊 | 29px 膠囊塞 27px 格 | 缺陷 |
| 多值標籤（chip／tag）列 | AntD `Tag`、MUI `Chip`、GitHub label：固定高 20～24px、相鄰間距 4～8px、圓角 2～4px（AntD）或全圓（MUI）；同一畫面只用一種 | chip 方角 4px 但間距 0、內外高不一 | 缺陷 |
| 儲存格內標籤溢出 | AntD `Select maxTagCount="responsive"` 顯示「+N」、Jira 之「+N more」點開浮層、GitHub labels 溢出顯示計數 | 只有「…」 | 缺陷 |
| 布林運算子（AND／OR）之編輯 | Notion 篩選器、Jira JQL 建構器、Airtable：運算子以小型內嵌控制項貼在它所修飾的條件旁，點擊切換或下拉，不另設一欄 | 另設一欄，與 chip 上顯示之同一值重複 | 補丁（值在兩處顯示、只有一處可改） |
| 焦點回饋 | 儲存格內已有自己的控制項時不再疊儲存格焦點框（ag-grid 常規為 `suppressCellFocus` 或該欄 `cellClass`） | 框中框 | 缺陷 |
| 關聯欄排列 | 先列本實體自己的設定，再列反向參照（被誰使用） | 反向參照在前 | 設計調整（依業主要求） |

---

## 5. 全列舉矩陣與對稱檢查

軸一：對象（4 個主表頁、5 個關聯彈窗）。軸二：元件（欄序、欄名、下拉外框、下拉清單、chip 間距、chip 高度、chip 溢出、當前項位置、未勾選之模式、儲存格焦點框、唯讀態）。每格為「現況／應然／處置」。

| 對象 | 欄序 | 欄名 | 下拉外框 | chip 間距／高度 | chip 溢出／當前項 | 未勾選之模式 | 焦點框 | 唯讀態 |
|---|---|---|---|---|---|---|---|---|
| 管理權限群組（主表） | 所屬在前／使用在前／A1 | 兩欄皆有「管控」／同／不動 | 無此元件 | 無 | 無 | 無 | 按鈕欄已關（`:745`～`:748`）／同／不動 | 不涉 |
| 管理權限（主表） | 所屬在前／對象在前／A2 | 「所屬權限群組」缺「管控」／補上／A3 | 無 | 無 | 無 | 無 | 已關／同／不動 | 不涉 |
| 管理使用者（主表） | 單一關聯欄／同／不動 | 「管控使用權限群組」／同／不動 | 無 | 無 | 無 | 無 | 已關／同／不動 | 不涉 |
| 現有功能清單（主表） | 無關聯欄／同／不動 | 不動 | 無 | 無 | 無 | 無 | 不涉 | 不涉 |
| 編輯所屬使用者 `VeGrupBlngUsers` | 名稱、chip、模式、使用／名稱、使用、chip（含模式）／B5（欄序為建議） | 「所屬權限群組名稱」／同／不動 | 29px 膠囊被裁／22px 方角在 chip 內／B1、B5 | 0px、20 vs 22／4px、22px／B2 | 只見 1 顆、本項在尾／展開鈕、本項第 1 顆／B3、B4 | 可改但儲存即丟／不出現控制項／B5 | 模式與使用欄未關／關／B7 | 下拉淡化 0.6／chip 模式段無箭頭、淡化／7.7 |
| 編輯所屬權限群組 `VePemiBlngGrups` | 同上 | 「所屬權限名稱」／同／不動 | 同上 | 同上 | 同上（94 顆） | 同上 | 同上 | 同上 |
| 編輯使用權限群組 `VeCgrups` | 名稱、模式、使用／同／不動 | 不動 | 29px 膠囊被裁／22px 方角／B1、B6 | 無 chip | 無 | 可改且會存但不生效／淡化不可操作／B6 | 未關／關／B7 | 同上 |
| 編輯使用權限 `VeCpemis` | 同上 | 不動 | 同上 | 無 | 無 | 同上 | 同上 | 同上 |
| 編輯使用對象 `VeCrules` | 對象名稱、使用／同／不動 | 不動 | 無此欄（對象無模式，`VeCrules.vue:363`～`:366`） | 無 | 無 | 無 | 未關／關（僅為一致）／B7 | 勾選框 disabled／同／不動 |

對稱檢查結論：四個有模式欄之彈窗用同一顆 `WTextSelect` 且參數相同，問題與修法一致；兩個「所屬」彈窗之 chip 標記逐字相同；「編輯使用對象」無模式欄屬設計事實（對象只有 y／n）。主表之關聯欄按鈕為原生 `<button>`（`LayoutContentGrups.vue:222`、`:227`），非本次範圍，列為知悉。

---

## 6. 方案比較與建議

| 方案 | 作法 | 改動位置 | 優點 | 缺點 |
|---|---|---|---|---|
| A 只調 `WTextSelect` 參數 | 四檔對 `WTextSelect` 傳 `borderRadius 4`、`paddingStyle {v:0,h:5}`、`textFontSize '12px'`、`expansionIconSize 14`、外層給 `line-height:20px` | 四檔各數行 | 最小 | 四處重複照舊；chip 間距、溢出、當前項位置都沒解 |
| B 套件內抽兩個共用子元件（建議） | `ModeSelectChip.vue`（模式控制項，chip 段外觀）與 `RelationChips.vue`（chip 列表：間距、置首、展開全部）；四檔只留呼叫 | 新增 2 檔、四檔改 template | 一處定義、四處一致；B1～B8 一次收斂；`WTextSelect` 仍可作內核 | 改動量中等 |
| C 擴充 `w-component-vue` 之 `WTextSelect` 加 chip 外觀 prop | 在元件庫加 `variant:'chip'` | 元件庫 | 其他套件可共用 | 跨套件發版；chip 列表問題仍要在 w-web-perm 解 |
| D 以 `WButtonChip` 加 `WPopup` 組合 | 用元件庫既有 chip 按鈕當觸發、`WPopup` 放 OR／AND 兩項 | 四檔 | 全用既有元件 | `WButtonChip` 預設全圓角 30、內距 3×15、字 0.85rem，要覆寫的參數不比 A 少，且鍵盤行為要自己補 |
| E 模式段點擊直接切換 OR／AND（不下拉） | 兩值切換 | 四檔 | 一步完成 | 沒有清單就少了「有哪些值」的提示；與統計頁時間分組之下拉互動不一致；e2e 已依「展開清單、點選項」兩步立案 |

建議採 **B**，內核沿用 `WTextSelect`（保留 `labelContent`、Teleport 浮層與鍵盤 Enter），外觀改成 chip 段。理由：業主明確要求「跟儲存格內 chip 類似風格」，且四個彈窗必須長得一樣；B 同時解掉 P9。

關於業主提問「chip 本身提供成下拉、不再另設合併模式欄是否更好」：**在兩個「所屬」彈窗成立，建議採用**。依據：（一）模式修飾的是「本項與該列之關係」，而該關係在畫面上就是那顆醒目 chip，值放在它身上最直觀，也消除同一值在兩處顯示、只在一處可改之重複；（二）未勾選之列本來就不該有模式控制項（2.3 第 1、2 點），欄位一移除，P5 自然消失；（三）少一欄可讓 chip 欄多 133px；（四）顯示順序與權限結果無關（2.3 第 4 點），本項置首無副作用。兩個「使用」彈窗沒有 chip，該列本身就是關係，故保留欄位，但改用同一顆控制項且未勾選時淡化，四彈窗看起來仍是同一種東西。代價與對策：使用者要知道 chip 左段可點，故本項 chip 之模式段一律帶展開箭頭與手指游標，其他 chip 無箭頭；模式欄之過濾框隨欄消失，屬可接受之取捨（過濾 OR／AND 之需求極低）。

---

## 7. 建議規格（可直接施工；數字皆由第 2 節之量測推得）

### 7.1 主表欄序與欄名（A1～A3）

1. `LayoutContentGrups.vue:309`～`:342`：`tabKeys`／`tabKeysPick`／`tabKeysShow` 三處把 `'cpemis'` 移到 `'belongUsers'` 之前（`keys` 順序即欄序）。
2. `LayoutContentPemis.vue:309`～`:342`：同法把 `'crules'` 移到 `'belongGrups'` 之前。
3. `procLang.mjs:265`～`:268`：`belongGrups.cht` 改為 `管控所屬權限群組`（`eng` 維持 `Use groups`，與 `belongUsers` 之 `Use users` 對稱）。
4. `kpHeadWidth`、`kpHeadFilter`、`kpHeadSort`、`kpHeadFocusHighlight` 皆以鍵名設定，不受欄序影響，不用改。

### 7.2 共用模式控制項 `ModeSelectChip.vue`（B1、B6、B8）

外觀＝現行 chip 之模式段加一個展開箭頭，內核仍為 `WTextSelect`（`items ['OR','AND']`、`labelContent 'modeSelect'` 保留）。

| 項目 | 規格 | 推導 |
|---|---|---|
| 高度 | 22px（border-box；`line-height:20px` 加上下邊框各 1px），外層明給 `line-height:20px`，不再繼承儲存格之 27px | 儲存格 27px，上下各留 2～3px；與 chip 內層同高 |
| 寬度 | 固定 56px | AND 墨跡 27（12px）＋內距 5×2＋箭頭 14＋箭頭前間隙 2＋邊框 1×2＝55，取 56；固定寬使 OR／AND 切換時不跳動 |
| 圓角 | 4px（獨立使用時四角；嵌在 chip 左段時只左側，右側 0，與名稱段相接） | 沿用 chip 之 `border-radius:4px 0 0 4px` |
| 字 | 12px（與 chip、表格同） | `--ag-font-size: 12px` |
| 內距 | `0 5px` | 沿用 chip 模式段 |
| 箭頭 | 14px，收合朝下、展開朝上（沿用現行旋轉 180° 之行為），可用 `expansionIcon` 指定 `mdiMenuDown` | 現行 18px 對 22px 高之控制項偏大 |
| 色票（一般） | 底 `#fff`、邊 `#aaa`、字 `#555`；hover 底 `#f5f5f5`、邊 `#888`、字 `#333`（同色系加深，不翻轉） | 沿用 chip 未醒目態；hover 規則依主系統「按鈕 hover 只做對比加強」 |
| 色票（醒目，嵌在本項 chip 時） | 底 `#be295a`、邊 `#ac2451`、字 `#fff`；hover 底 `#ac2451` | 沿用 chip 醒目態 |
| 清單浮層 | `itemPaddingStyle {v:6,h:10}`、`itemTextFontSize '12px'`、`placementDistX -6`（浮層錨定於觸發文字，退回內距 5 與邊框 1 即與外框左緣對齊，實測 941 對 940.9）、`minWidth` 給整顆寬 56（`autoFitMinWidth` 只量觸發文字區，實測只有 49，會比外框窄） | 改後實測清單 56 寬、兩列各 28px |
| 陰影 | 無（`shadow false`，同現行） | |
| 唯讀（`editable false`） | 透明度 0.6、無箭頭、無手指游標、點擊不展開 | 沿用 `WShellEllipse` 現行唯讀規則（透明度）與 2.5.15 之游標規則；箭頭改為不渲染，因唯讀時箭頭是空承諾 |
| 未勾選（`enable !== 'y'`） | 兩個「使用」彈窗：`editable false`（外觀同唯讀）；兩個「所屬」彈窗：不渲染（因本項 chip 不存在） | 2.3 第 1、2 點 |

### 7.3 共用 chip 列表 `RelationChips.vue`（B2、B3、B4）

1. 容器：`display:flex; align-items:center; column-gap:4px; white-space:nowrap; overflow:hidden`（儲存格已 `overflow:hidden`，容器再設一次以免 flex 撐開）。
2. 單顆 chip：外層 `display:inline-flex; height:22px; line-height:20px`，內層兩段 `box-sizing:border-box; height:22px`，去掉現行 `span` 之 `height:20px`；名稱段加 `max-width:240px; overflow:hidden; text-overflow:ellipsis` 並以 `title` 給全名，讓超長名稱（單顆 363px）不再獨占整格。
3. 順序：`enable === 'y'` 之 chip（本項）永遠第 1 顆，其餘依原鍵序；只改顯示陣列，不改 `cgrups`／`cpemis` 字串（2.3 第 4 點）。
4. 展開全部：chip 數 ≥ 1 時在最左固定一顆 22px 高之小按鈕（方角 4px、邊 `#aaa`、底 `#fff`、字 `#555` 12px、內距 `0 6px`、內容為圖示 `mdiDotsHorizontal` 14px 加數量文字，例如「⋯ 94」，tooltip 為新語系鍵 `chipsShowAll`「展開全部」），點擊開 `WPopup`（`isolated`、`placement bottom-start`、`paddingStyle {v:8,h:10}`、`minWidth 320`、`maxWidth 560`，`labelContent 'relationChipsAll'`）；浮層內第一行為 12px `#666` 之說明（新語系鍵 `chipsPopupTitle`「{title}：共 {n} 項」），其下為 `display:flex; flex-wrap:wrap; gap:4px 6px; max-height:50vh; overflow:auto` 之同款 chip（本項同樣第 1 顆且醒目；實測 94 顆時浮層 560×488，於 900px 高之視窗自列位往下展開仍在視窗內）。`WPopup` 與 `WDialog` 共用 z-index 池且後開者在上（`WPopup.vue:27`），可疊在對話框上。唯讀態同樣可開（只看）。按鈕放最左而不放最右，是因為放右邊會跟 chip 一起被裁掉。注意 `WPopup`（`WTooltip`）之 `displayType` 命名與 CSS 相反：`'block'` 為 inline-block、`'line'` 為 block，此處須用 `'block'` 才能與其後之 chip 同列。
5. 隨附修改版以三個元件落實：`ModeSelectChip.vue`（模式控制項）、`RelationChip.vue`（單顆 chip）、`RelationChips.vue`（列表＋展開全部）。
5. 為 0 顆時維持現行（空白）。

### 7.4 兩個「所屬」彈窗（`VeGrupBlngUsers.vue`、`VePemiBlngGrups.vue`）（B5）

1. `genOpt` 之 `ks` 去掉 `'mode'`（`:418`～`:423`），`kpHead`／`kpHeadWidth`／`kpHeadFilterType` 之 `mode` 項一併移除；`items` 內仍保留 `mode` 欄位供 `revRows`／`doSave` 使用（`:694`～`:699`、`:1062`～`:1073`），資料流不動。
2. `cell-render` 之 chip 欄改用 `RelationChips`，把本項 chip 之左段換成 `ModeSelectChip`（`editable` 綁 `isEditable`），`@input` 沿用 `showXxxToggleItemModeByName(props.row.name, item)`（`:755`～`:800`）；其他 chip 之左段維持純文字、無箭頭、無游標。
3. 建議欄序改為「名稱、是否使用、所屬…名稱」：本列自己可改的在左，由其他上層帶來的在右，與主表 A1／A2 同一原則；勾選後本項 chip 出現在右鄰欄之第 1 顆，操作動線由左到右。此項為建議，不改也不影響其他條。
4. 「是否使用」勾選框維持原生 `<input type=checkbox>`。

### 7.5 兩個「使用」彈窗（`VeCgrups.vue`、`VeCpemis.vue`）（B6）

1. `cell-render` 之 `mode` 欄改用 `ModeSelectChip`，`editable` 綁 `isEditable && props.row.enable === 'y'`；`@input` 沿用既有方法（`:527`～`:572`）。
2. `kpHeadWidth.mode` 由 100 改為約 90（56px 控制項加儲存格內距 11×2 為 78，留餘裕）。
3. 資料寫入維持現行（`:787`～`:809`），不因淡化而改動儲存內容。

### 7.6 儲存格焦點框（B7）

四個有模式欄之彈窗於 `genOpt` 加 `kpHeadFocusHighlight: { mode:false, enable:false, grupsNames:false }`（或 `pemisNames:false`），「編輯使用對象」加 `enable:false`，避免點控制項時整格藍框（`WAggridVue.vue:1584`～`:1586`）。

實作時查出光靠這個設定不夠：`w-aggrid-vue` 2.0.86 對 `no-border` 之覆寫只寫 `:focus`（`WAggridVue.vue:2874`～`:2877`），而 ag-grid 31 之焦點框規則為 `:focus-within`（`ag-grid-community/styles/ag-grid.css:6230`），焦點落在儲存格內之控制項時覆寫不生效，實測點擊後仍為 `1px solid #0091ea`。根因修法寫於 `建議w-aggrid-vue修正.md`；隨附修改版先於 `src/App.vue` 全域樣式補一條 `.CompCssWAggridVue .no-border.ag-cell:focus-within { border-color:transparent !important; }`，該套件修正後可移除。

### 7.7 唯讀（展示）態

對話框標題為「展示…」時：chip 照常顯示，本項 chip 之模式段無箭頭、透明度 0.6，點擊不展開；展開全部之按鈕仍可用；勾選框 `disabled` 不變。判準與現行 e2e 之「勾選框看 `disabled`、下拉看透明度與點擊不展開」一致。

### 7.8 鍵盤（C1，知悉）

`WPopup` 之 `modeHide` 只有 click／mousedown，展開中按 Escape 不關閉；屬 `w-component-vue` 層，本次不改，記錄供日後。

---

## 8. 驗收判準（改版後於 1600×900 量測；隨附修改版之實測結果見 `w-web-perm隨附資料/README.md` 第 3 節，27 項全數通過）

1. 四個彈窗之模式控制項整顆高 22px、寬 56px，頂與底皆在儲存格 27px 之內（`getBoundingClientRect` 之 top ≥ cell.top、bottom ≤ cell.bottom）；計算樣式 `border-radius` 為 4px（獨立）或 `4px 0 0 4px`（嵌 chip）；字 12px。
2. 列 hover 與點擊控制項時，儲存格無 `ag-cell-focus` 之 1px `#0091ea` 邊框（該欄 class 含 `no-border`）。
3. 相鄰 chip 左緣減前一顆右緣恆為 4px；每顆 chip 外層與內層皆 22px。
4. 「編輯所屬權限群組」之 `系統管理者編輯_權限群組` 列：儲存格內第 1 個元素為展開鈕且文字含 94；點開後浮層內 chip 數 94、首顆為 `知識管理系統_操作編輯_權限`（醒目）或當時之「目前權限」。
5. 於任一未勾選列勾選「是否使用」後，該列 chip 欄第 1 顆即為本項且醒目，其模式段有箭頭；未勾選之列沒有任何模式控制項（所屬彈窗）或控制項為淡化不可展開（使用彈窗）。
6. 點本項 chip 之模式段展開清單，依序為 OR、AND，點 AND 後清單收起、chip 模式段文字為 AND，儲存後重開對話框仍為 AND。
7. 主表表頭：管理權限群組為「名稱、說明、管控使用權限、管控所屬使用者」；管理權限為「名稱、說明、管控對象、管控所屬權限群組」。
8. 唯讀態：模式段無箭頭、計算樣式 `cursor` 非 `pointer`、點擊不出現 `div[wtlp="modeSelect"]` 之可見浮層。

---

## 9. 影響範圍與後續（套件改版後由主系統端處理，列此供套件端知悉）

1. **e2e 量測 helper**：`rddmanager_2_perm/test/e2e-perm-shared.mjs:882` 以「儲存格內最外層帶行內寬度樣式之祖先」定位下拉整顆（依賴 `:style="width:72px"`），`:976`～`:983`、`:1014`、`:1037` 以 `div[wtlp="modeSelect"]` 定位浮層。隨附修改版保留 `labelContent 'modeSelect'`（整顆行內寬度改為 56px），展開全部之浮層另以 `wtlp="relationChipsAll"` 標記；helper 之寬度守門（< 40 即拋錯）仍成立，本項 chip 內之下拉改以 chip 為錨，皆由主系統端改。
2. **spec 與標準圖**：`spec/流程_權限管理系統_瀏覽.md` 與 `_編輯.md` 之表頭順序、「所屬權限群組」欄名、四彈窗之欄位清單與「合併…模式」操作描述、〈畫面元素對照〉之下拉列與 chip 列，以及凡拍到管理權限／管理權限群組主表或四個彈窗之標準圖，皆須改寫與重產（含瀏覽 E2E-005、008、010、013 與編輯 E2E-005、006、009、012、017，及主表相關案例）。
3. **操作手冊**：`_docs/B04.使用者操作手冊/各系統/C.權限管理系統` 之對應節隨標準圖重產後改寫。
4. **語系鍵**：`belongGrups.cht` 改字後，主系統 `test/tools/audit-lang-keys.mjs` 之語系稽核不受影響（鍵名不變）。

---

## 10. 證據附錄

| 檔案 | 內容 |
|---|---|
| `tmp/perm_probe/probe.json` | 四頁表頭、四彈窗之下拉／儲存格／chip／浮層量測（含 hover 後與展開後） |
| `tmp/perm_probe/03`～`16-*.png` | w-screenctl 全頁截圖：各彈窗靜態、hover、展開 |
| `tmp/perm_probe/zoom-pemiBlngGrups-hover.png` | DPR 3 放大：真滑鼠 hover 時白色膠囊在灰底上顯形且上下被裁 |
| `tmp/perm_probe/zoom-pemiBlngGrups-open.png`、`zoom-cgrups-open.png` | DPR 3 放大：展開時整格藍框加膠囊加浮層（即業主截圖之畫面） |
| `tmp/perm_probe/zoom-pemiBlngGrups-checked.png` | DPR 3 放大：勾選後本項 chip 不在可視範圍 |
| `tmp/perm_probe/zoom-pemiBlngGrups-rows.png` | DPR 3 放大：chip 零間距與「…」截斷 |
| `tmp/zz_perm_probe.mjs`、`tmp/zz_perm_zoom.mjs` | 量測與放大截圖腳本（w-screenctl／Playwright） |
| `w-web-perm隨附資料/` | 修改版原始檔、diff、建置與 lint 紀錄、修改後之驗證截圖（`驗證截圖/*.png`、`verify.json`）與驗證腳本 |
