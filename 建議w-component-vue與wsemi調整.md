# 建議 w-component-vue 與 wsemi 調整

**提出者**：w-web-perm 專案（2026-09-17）
**對象版本**：本專案 `node_modules` 內之 `w-component-vue`、`wsemi`（2026-09-17 安裝版）
**來源**：本專案關聯對話框標籤重做後之外部複審（GPT-5.6 Sol），經逐條對照源碼確認後提出。

共兩項，性質不同：

| # | 套件 | 性質 | 本專案現況 |
|---|---|---|---|
| 一 | w-component-vue | **缺陷**：卸載時少移除一個監聽，一行即可修 | 無法在專案端繞過 |
| 二 | wsemi | **行為限制**：緩慢連續變化偵測不到 | 本專案標籤收合已改用 `ResizeObserver` 繞過；其他使用者（含 `w-aggrid-vue`）仍受影響 |

---

## 建議一：`buildPopper` 卸載時移除 scroll 監聽用錯函式

### 位置與現象

`src/js/buildPopper.mjs`：

```js
//mounted（第 70 行起）
window.addEventListener('scroll', _vo.windowScroll, false)      //第 228 行

//destroy（第 232 行起）
window.removeEventListener('mousemove', _vo.windowMousemove, false)
window.removeEventListener('mousedown', _vo.windowMousedown, false)
window.removeEventListener('mouseup', _vo.windowMouseup, false)
window.removeEventListener('scroll', _vo.windowMouseup, false)  //第 238 行：應為 _vo.windowScroll
```

`removeEventListener` 須傳入與掛上時同一個函式才會移除；第 238 行傳的是 `windowMouseup`，而 scroll 從未以此函式掛上，故該行實際不移除任何東西。

### 後果

- `WTooltip.vue` 每次掛載即經 `buildPopper` 掛上 scroll 監聽，`beforeDestroy`（第 255～264 行）呼叫 `bp.destroy()` 卻留下它。**每個 `WTooltip`／`WPopup`（及內含它們之 `WTextSuggestCore` 等）掛載一次，window 上就永久多一個 scroll 處理器**，且該處理器之閉包持有已卸載元件之 `vo`，元件無法被回收。
- 使用者畫面上看不到（處理器內以 `vo[keyShow]` 判斷，已隱藏者走「不處理」分支），主控台亦無錯誤；後果是長時間操作後每次捲動要執行的失效處理器與保留之記憶體逐次增加。
- 在表格儲存格內大量使用者特別明顯：本專案關聯對話框每列一個模式控制項、每列一個溢出指示，每開關一次對話框、每次視窗寬度變化導致標籤重排，都會建立並卸載一批。

### 建議修正

```js
window.removeEventListener('scroll', _vo.windowScroll, false)
```

### 驗收方式

以 Chrome DevTools Protocol `DOMDebugger.getEventListeners`（目標 `window`）計數 `scroll` 監聽數：反覆掛載／卸載同一個 `WTooltip` N 次，修正前計數增加 N，修正後維持不變。

---

## 建議二：`domDetect` 以前一次取樣為基準，連續小幅變化永不觸發

### 位置與現象

`src/domDetect.mjs`（`w-component-vue` 之 `v-domresize` 指令即以此實作，`src/js/domResize.mjs:23`；`w-aggrid-vue` 之 `WAggridVue.vue:629` 亦直接使用）：

- 每 `timeInterval`（預設 20ms）取樣一次（第 202 行）。
- 與基準 `sd` 比較寬高差，差值須 **大於** `tolerancePixel`（預設 1）才觸發（第 225～226 行）。
- **每次取樣後不論是否觸發，一律 `sd = snew`**（第 275 行）。

故基準每 20ms 跟著移動。元素寬度若以每次取樣 ≤ 1px 的速度變化（緩慢拖曳視窗邊緣、父層動畫、逐步調整），每次比較的差都 ≤ 1，**累積變化再大也永遠不觸發**；停下後也不會補觸發。

### 實測

本專案以 Playwright 逐步改變視窗寬度：每步 1px 時 `w-aggrid-vue` 之欄寬自動填滿不重算（欄位總寬與表格寬度持續偏離），每步 2px 時才重算。本專案關聯對話框之標籤收合原以 `v-domresize` 重算，同樣受影響，已改用原生 `ResizeObserver`。

### 建議修正（二擇一，皆不改既有觸發時機以外之行為）

1. **只在觸發時更新基準**：把第 274～275 行移入 `if (bw || bh)` 區塊內（未觸發時保留舊基準），累積變化超過容差即觸發一次。`sold` 語意變為「上次觸發時之尺寸」，對使用端較直觀。
2. **改以 `ResizeObserver` 為主、輪詢為後備**：瀏覽器支援時以 `ResizeObserver` 觀察元素（非同步、無輪詢成本、無容差問題），保留 `resizeWithWindow` 之既有事件形狀；不支援時退回現行輪詢並套用第 1 項。可一併省去每實例每 20ms 之計時器（表格內大量使用時效益明顯）。

### 驗收方式

以每步 1px 連續改變元素寬度共 10px：修正前 `resize` 事件 0 次；修正後至少 1 次，且最後一次事件之 `snew.offsetWidth` 等於最終寬度。
