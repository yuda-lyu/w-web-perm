# 建議 w-aggrid-vue 調整

> **結案與更正（2026-09-17，w-aggrid-vue 2.0.88 已發布）**
>
> - **建議二已採納**：`showKeys(keys, { applyOrder })` 已上線，預設仍為 `true`；另將傳入 `applyColumnState` 之狀態精簡為只帶 `colId` 與 `hide`，不再回灌 `getColumnState` 讀出之寬度、排序、固定等欄位（行為等價，且不再因查無欄位而拋錯）。本專案四個清單頁已改用 `applyOrder:false`，並以真實點擊驗收通過。
> - **建議一改以範例提供、不加 API**（`src/AppSlotCellRenderAlign.vue`）。經實測，**範例之作法本身即正確，本文原載兩處敘述有誤，特此更正**：
>   1. 原載「只做 ②（slot 內 wrapper）時 `height:100%` 無確定高度可解析，等於沒寫」**不成立**。實測只加 wrapper、不設 `opt.kpColStyle`，即得上 2.50／下 2.50（`tmp/probe-vcenter6.mjs`）。原因是 wrapper 為區塊級（flex），其百分比高度之包含塊為最近之區塊容器祖先 `.ag-cell`（`height:100%`，高度確定），而非元件庫那個行內 `<span>`。該敘述當時係推論、未實測。
>   2. 故原載「兩段缺一不可」、以及建議實作中「`CellSlotRenderer` 之 `<span>` 必須一併處理，否則設了選項毫無效果」**亦不成立**；`opt.kpColStyle` 非必要。
> - **範例未涵蓋、使用端須另注意之情形**（實測所得，供範例或文件補充參考）：wrapper 只對「wrapper 的直接子層」置中。若子層本身是行內容器、其內才是固定高度之控制項（本專案之標籤列即是），wrapper 置中的是那個容器，內部控制項仍偏下（實測 3.77／1.23）；須讓該容器本身成為 flex 置中容器才得 2.50／2.50。再往內若另有會繼承儲存格 27px 行高之區塊包裹層（本專案之 `WPopup` > `WTooltip` 觸發區即是），還會自成 27px 行框而再偏移，甚至溢出儲存格被裁切（實測「⋯ N」鈕上 6.03／下 −1.03），須於外層設 `line-height:0` 切斷繼承（`tmp/probe-vcenter9.mjs`）。
>
> 以下為原提案內文，保留原貌備查；與上列更正衝突之處以上列為準。

---

**提出者**：w-web-perm 專案（2026-09-16）
**對象版本**：`w-aggrid-vue` 2.0.87（`ag-grid-community` / `ag-grid-vue` ^31.3.4）
**性質**：兩項皆為**向後相容之 opt-in 擴充**，不改既有行為、不需呼叫端配合升級。

本文所有數字皆為實機量測（Playwright + `getBoundingClientRect`），探測腳本路徑一併列出，可重跑。
本文**不含**「在本專案已可繞過」之抱怨——兩項都已確認呼叫端今天就能自行解決；提出的理由是**樣板重複與失敗無聲**，見各節之〈為何值得做在套件層〉。

---

## 建議一：補上儲存格垂直對齊選項 `defCellAlignV` / `kpCellAlignV`

### 現象

儲存格內若放高度固定的自訂控制項（本專案為 56×22 的合併模式控制項），於 balham 27px 列高下**不會垂直置中**：

| 量測項 | 值 |
|---|---|
| 儲存格高 | 27.00 px（`line-height:27px`，上下 padding 皆 0） |
| 控制項高 | 22.00 px |
| 控制項上方留白 | **4.77 px** |
| 控制項下方留白 | **0.23 px** |

控制項幾乎貼齊儲存格底線。100% 縮放下未被裁切，但視覺上明顯偏下。

探測：`tmp/probe-vcenter.mjs`、`tmp/probe-vcenter5.mjs`（本專案 `tmp/` 下）。

### 成因（非使用者算錯尺寸）

1. `ag-grid.css` 之 `.ag-cell` 為 `display:inline-block; height:100%`，儲存格內容走**行內排版**。
2. `CellSlotRenderer` 把 `cell-render` slot 的內容包進一個**無 class、無 style 的 `<span>`**（`WAggridVue.vue:183`：`return h('span', vnodes)`），該 span 預設 `display:inline`，實測高度 16px。
3. 呼叫端的控制項是行內層級盒，慣用 `vertical-align:middle`；而 CSS 的 `middle` 是把盒中線對齊「**基線 + x 高一半**」，不是行框中線。字型 x 高愈小，偏移愈大。

因此這不是誰把尺寸算錯，而是**行內對齊語義**與「把固定高度控制項放進固定列高」這個需求本來就不合。

### 呼叫端目前唯一可行的自解（已實測成功，但需兩段樣板）

```js
// ① 欄位設定：使儲存格成為 flex 容器（align-items 保持預設 stretch）
//    → CellSlotRenderer 的 <span> 成為高度確定之 flex item（實測 25px）
opt.kpColStyle = {
    mode: () => ({ display: 'flex' }),
}
```

```html
<!-- ② cell-render slot 內層自行再包一個 wrapper，才有確定高度可解析 height:100% -->
<template v-slot:cell-render="props">
    <div v-if="props.key==='mode'" style="display:flex; align-items:center; height:100%;">
        <MyFixedHeightControl />
    </div>
</template>
```

實測結果（`tmp/probe-vcenter5.mjs`，真的在 DOM 插入該 wrapper 後量測）：**上 2.50 px／下 2.50 px**，精準置中。

**兩段缺一不可**，這正是問題所在：

| 只做 | 結果 |
|---|---|
| 只做 ①（儲存格 flex） | 控制項位置**完全不動**（仍 4.77／0.23）——span 被拉高了，但控制項在 span 內仍走行內對齊 |
| 只做 ①＋在儲存格上加 `align-items:center` | 3.77／1.23，**仍未置中**——置中的是 span，不是控制項 |
| 只做 ② | `height:100%` 無確定高度可解析，等於沒寫 |

另已排除兩種看似自然的修法：

- 控制項根部改 `inline-flex; align-items:center; height:27px; vertical-align:top` → 實測 top 1／bottom **−1**（盒溢出儲存格 1px）。
- 把 `vertical-align` 改成固定像素 → 需綁定字型度量，換字型或語系即失準。

### 為何值得做在套件層

1. **與既有 API 不對稱**：套件已有 `defHeadAlignH` / `kpHeadAlignH` / `defCellAlignH` / `kpCellAlignH`（宣告於 `WAggridVue.vue:428-429,450-451`，實作於 `1704-1712` 的 `cellStyle['text-align']`）。**有水平沒有垂直**，使用者自然會找 `AlignV`，找不到就各自土法煉鋼。
2. **失敗是無聲的**：偏 2.27px 不會報錯、不會破版、e2e 若只比對像素也照樣過（因為基準圖本身就是偏的）。本專案是在為新元件逐項量測時才發現。
3. **樣板會擴散**：上述兩段要**逐欄、逐呼叫端**重寫，且 ② 必須寫在 slot 內層——這是一個「知道就會、不知道就永遠偏」的隱知識。
4. **只影響有設 AlignV 的欄**：不設即維持現行行為，零風險。

### 建議實作

沿用既有 `AlignH` 的完整慣例（宣告 → data 預設 → `setobj` 解析 → 併入 `cellStyle`）：

```js
// 1) JSDoc（比照 450-451 行）
//  @vue-prop {String} [opt.defCellAlignV='center'] 輸入cell預設之上下對齊字串，預設為'center'
//  @vue-prop {Object} [opt.kpCellAlignV={}] 輸入key對應cell之上下對齊字串物件，預設各key值為defCellAlignV

// 2) data 預設（比照 544-545）
defCellAlignV: null,
kpCellAlignV: {},

// 3) 解析（比照 2008-2014 之 defCellAlignH）
vo.defCellAlignV = 'center'
if (arrHas(vo.opt.defCellAlignV, ['top', 'center', 'bottom'])) {
    vo.defCellAlignV = vo.opt.defCellAlignV
}
vo.kpCellAlignV = setobj(vo.keys, () => vo.defCellAlignV, vo.opt.kpCellAlignV)

// 4) 併入 cellStyle（比照 1704-1712）
let cellStyle = {
    'text-align': vo.kpCellAlignH[key],
}
let av = vo.kpCellAlignV[key]
if (av === 'top' || av === 'center' || av === 'bottom') {
    cellStyle = merge(cellStyle, {
        'display': 'flex',
        'align-items': av === 'top' ? 'flex-start' : (av === 'bottom' ? 'flex-end' : 'center'),
        //水平仍由既有 text-align 決定, 故 flex 主軸起點對齊, 不覆寫呼叫端的 kpCellAlignH 語義
        'justify-content': 'flex-start',
    })
}
```

**關鍵點：只改儲存格還不夠，`CellSlotRenderer` 的 `<span>` 必須一併處理**——否則就是上表「只做 ①」那一列，使用者設了 `AlignV` 卻毫無效果，比沒有這個選項更糟。最小改法是讓該 span 在 `AlignV` 生效時撐滿並自身置中：

```js
// WAggridVue.vue:183 附近
return h('span', { style: { display: 'flex', alignItems: 'inherit', height: '100%' } }, vnodes)
```

`alignItems: 'inherit'` 可直接沿用儲存格上由 `AlignV` 設好的值，不必再傳一次參數；`height:100%` 讓內層 `height:100%` 得以解析（本專案實測即靠這一點才拿到 2.50／2.50）。

> 若不想讓 `CellSlotRenderer` 預設帶樣式（顧慮既有使用者），可改為僅在該欄有設 `AlignV` 時才透過 `cellRendererParams` 傳旗標進去，維持預設路徑位元不變。

### 驗收建議

以「27px 列高 × 22px 固定高度控制項」量上下留白：未設 `AlignV` 時維持 4.77／0.23（確認向後相容），設 `center` 後為 2.50／2.50。

---

## 建議二：`showKeys` 增加「只切換顯示、不改欄序」的選項

### 現象

呼叫端以「顯示欄位挑選」勾選框控制欄位顯示時，**使用者把某欄取消勾選再重新勾選，該欄會跑到最右邊**，而不是回到原本的位置。本專案四個清單頁皆如此。

### 成因鏈（三段，皆可追）

1. `w-component-vue` 之 `WInputCheckbox.vue:379-381`：重新勾選時 `valueTrans.push(item.data)`，**一律追加到 v-model 陣列尾端**，不還原該項在 `items` 中的位置。
2. 呼叫端把該 v-model 陣列原樣交給 `showKeys()`。
3. `w-aggrid-vue` 之 `showKeys`（`WAggridVue.vue:2211` 起）依 **`keys_new` 的順序**組出 `csn`，再以 `applyColumnState({ state: csn, applyOrder: true })` 套用——註解明寫「要依照 csn 調整欄位順序」，所以欄序完全跟著勾選陣列走。

第 1 段是 `w-component-vue` 的事（勾選群組的值本質是集合，序列化順序理應沿用 `items` 宣告序，而非點擊序），已另行反映。**但第 3 段在本套件**：`showKeys` 把「顯示哪些」與「排成什麼順序」**綁成同一件事**，呼叫端沒有辦法只要前者。

### 建議實作

`applyOrder` 改為可由呼叫端決定，預設維持現行值以保向後相容：

```js
showKeys: function(keys_new, opt) {
    let applyOrder = get(opt, 'applyOrder', true) //預設 true, 與現行行為相同
    // …既有邏輯不變…
    vo.getApi().applyColumnState({
        state: csn,
        applyOrder,
    })
}
```

`applyOrder:false` 時，ag-grid 只套用 `hide`，欄序維持目前狀態；呼叫端即可把 `showKeys` 當成純粹的顯示開關，不必自己先依宣告序排序一次。

### 為何值得做在套件層

- 現行簽章讓呼叫端**無法表達「只切顯示」**這個最常見的意圖；每個呼叫端都得在外面自己排序一次（且要知道「為什麼要排」，否則永遠不會想到）。
- 預設值不變，既有呼叫端零影響。
- 與建議一同屬一類：**把隱知識收進套件**，而不是讓每個使用者各自踩一次。

---

## 附錄：本文引用之量測與程式位置

| 項目 | 位置 |
|---|---|
| 儲存格預設排版 | `node_modules/ag-grid-community/styles/ag-grid.css:1822`（`.ag-cell{display:inline-block;height:100%}`） |
| slot 包裹層 | `WAggridVue.vue:183`（`return h('span', vnodes)`） |
| 既有水平對齊 API | `WAggridVue.vue:428-429,450-451`（宣告）、`522-523,544-545`（預設）、`1836-1847,2008-2014`（解析）、`1704-1712`（併入 `cellStyle`） |
| 既有樣式逃生口 | `WAggridVue.vue:448`（`opt.kpColStyle`）、`1704-1712`（merge 進 `cellStyle`） |
| `showKeys` 與 `applyOrder` | `WAggridVue.vue:2211` 起 |
| 勾選陣列追加到尾端 | `w-component-vue` 之 `WInputCheckbox.vue:379-381` |
| 垂直置中量測（改前 4.77／0.23） | `tmp/probe-vcenter.mjs` |
| 候選方案排除（cell 層 flex 僅 3.77／1.23） | `tmp/probe-vcenter3.mjs` |
| 自解方案定案（2.50／2.50） | `tmp/probe-vcenter5.mjs` |
