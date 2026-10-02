//後台「統計資訊」事件展示區 e2e。對應統計頁 src/components/LayoutContentStaInfor.vue 之事件發生頻率卡片。
//act 走 user-facing input（點左側「統計資訊」選單 / 點圖表圖例切換事件與翻頁 / 勾「全部加總」checkbox / 點導覽區圓鈕 / 點頂列語系下拉 / 改視窗寬）；
//assert = 語意斷言 + pixel baseline（§6.2 / §6.3）。
//
//雙模式：
//  - 產 baseline：node test/e2e-stainfor.test.mjs --baseline [--names <項,...>] [--langs eng,cht] [--write-mode missing|changed]（寫 test/pics/stainfor/）
//  - 驗證（mocha）：npx mocha test/e2e-stainfor.test.mjs --reporter list （pixelmatch 反鋸齒感知 + maxDiffPixels 容差比對，非 byte-exact）
//  手術式重產（截圖前篩選 createBaselineGate，規格見 test/tools/e2eLib.mjs 所指之 w-package-tools-e2e 之 README.md §2.2）：
//    --names 每項可帶語系前綴（eng-/cht-），不帶則兩語系皆產；階段圖鍵（如 E2E-006-3-next-page）只寫該張，
//    案例鍵或其編號前綴（如 E2E-006-legend-scroll-page、E2E-006）寫該案全部階段；不符任何鍵即報錯並列出可用鍵（於啟動服務之前）；
//    --langs 須完全等於已宣告語系（eng / cht）；--write-mode missing 只寫缺少者、changed 只寫與現行標準圖差異超過容差者（預設全寫）；
//    env E2E_BASELINE_OUT_DIR=<dir> 寫到暫存目錄（等價驗證用，不動 test/pics）。
//  產製端與比對端呼叫同一案例管線（runBaselineCase）：（帶 c.settings 者）換後端 → fresh browser → run（openApp → setLang → 進統計頁 → 流程與截圖）
//    → 語意斷言（兩端皆於寫檔／比對前執行，不過即一張都不寫）→ 寫檔／比對 → 關瀏覽器 →（帶 c.settings 者）還原 mock 後端。
//
//標準圖存放：test/pics/stainfor/stainfor-{lang}-{name}.png（8 cases；E2E-001~004 各 1 張、E2E-005 4 張、E2E-006 6 張、E2E-007 4 張、E2E-008 6 張
//  → 每語系 24 張、共 48 baselines）
//  E2E-001-event-all:      進頁預設 → 圖表每個事件各一條折線（5 條）。
//  E2E-002-event-selected: 點圖例關掉其餘 3 事件 → 僅該 2 條折線可見（圖例切換為事件篩選之唯一入口）。
//  E2E-003-event-total:    勾「全部加總」→ 圖表加入 Total 加總線（Total + 5 事件 = 6 條系列）。
//  E2E-004-event-table:    事件統計表 → 5 列、依最近1日降序、表頭含各時間窗欄位。
//  E2E-005-interval-day:   時間分組下拉（自製 WTextSelect）切「每日」→ 每步兩張（點下拉前 / 清單展開 / 點「每日」前 / 選後圖表 7 桶）。
//  E2E-006-legend-scroll-page:  窄視窗圖例改單列捲動式 → 翻下一頁 → 點該頁事件隱藏 → 再縮窄仍停留原頁 → 拉寬恢復一般式且仍隱藏。
//  E2E-007-legend-menu-toggle:  視窗 700 時點「隱藏選單」圖加寬、圖例恢復一般式 → 點「顯示選單」圖變窄、圖例改回捲動式。
//  E2E-008-legend-long-names:   13 個長名稱事件 → 勾全部加總 → 經頂列語系下拉切換語系；加總名稱長度隨語系不同，放得下與否跟著改變。
//圖例排版規則（一般式放得下維持、否則改捲動式；不壓最上方刻度）見 spec/流程_統計資訊事件展示.md〈補充〉與 spec/設計要點與取捨.md ADR-024；
//E2E-006~008 之語意斷言皆在 run() 內（各觀察點為流程中之暫時狀態，當下斷言；兩端皆於寫檔／比對前守門），每個觀察點皆驗 assertStaLegendLayout 不變條件。
//
//確定性來源：後端 staEventMock=true → getStaEvent 回固定資料集（48 桶、固定起點 2025-01-01、固定 sin 計數、5 個 event）。
//  event 名（mock）：verifyConn, updateTargets-success, checkUser-error, api/getPerm-success, getWebInfor-success
//  staEventMock='many'（僅 E2E-008，以 c.settings 換後端）→ 同形資料集改 13 個 event（server/procStaInfor.mjs MOCK_EVENTS_MANY）。
//  元件 allEvents 為 union 後排序 → 圖表系列與圖例顯示順序固定。
//  比對端每語系 describe 之 before restartBackend(genTempSettings(MOCK_SETTINGS)) 啟動 mock 後端、after restartBackend('./settings.json') 還原預設後端；
//  產製端於每語系之案例迴圈前後做同一件事（同層級同順序）。帶 c.settings 之 case（E2E-008）前後換後端再還原 MOCK_SETTINGS（兩端同在 runCase）。
//  因 mock 圖表確定性穩定 → 直接 pixel baseline，不需 driveActivity / overlayRegions 貼圖。
import fs from 'fs'
import assert from 'assert'
import { startServersOnce, cleanup, launchBrowser, openApp, setLang, captureStableWithBox, waitUntilExist, genTempSettings, restartBackend, assertBaselineMatch, clickNavItem, navBtn, waitNavSettled, readStaLegend, waitStaLegendSettled, assertStaLegendLayout, clickStaLegendItem, clickStaLegendPager } from './tools/e2e-setup.mjs'
import { runBaselineCase, createBaselineGate, itemsUnionBox, inkRect, canvasInkRects } from './tools/e2eLib.mjs'
//canvas 圖例之矩形(readStaLegend 回報之圖例列、翻頁箭頭、圖例項)緊貼墨跡, 直接框時紅框內緣距字僅約 1px(紅框壓字)
//→ 一律經 w-package-tools-e2e inkRect 外擴 INK_PAD(4) 再交 captureStableWithBox(2026-09-28, 技能 §7.3-8)

const PICS_DIR = './test/pics/stainfor'
const LANGS = ['eng', 'cht']
const isBaseline = process.argv.includes('--baseline')
const MOCK_SETTINGS = { staEventMock: true } //本檔預設後端（mock 5 事件）；case 帶 settings 者前後切換再還原為此

//mock 5 個 event；E2E-002 只保留此 2 個（以圖例關掉其餘 3 個），驗單一事件趨勢辨認功能。
const KEEP_EVENTS = ['verifyConn', 'checkUser-error']
//mock 之 5 個事件全集（元件 allEvents 排序後即此順序），供 E2E-002 逐一關閉非保留者。
const ALL_MOCK_EVENTS = ['api/getPerm-success', 'checkUser-error', 'getWebInfor-success', 'updateTargets-success', 'verifyConn']

function picPath(lang, name) { return `${PICS_DIR}/stainfor-${lang}-${name}.png` }

//設定語系 setLang（test setup 層，非 act-under-test；cht 走 $ui.setLang、eng 不切但補等量 settle）取自 e2e-setup（原本檔內版本與之逐字相同，已收斂）。

//導航至統計資訊頁（user-facing：點左側「統計資訊」導覽），等事件圖表 canvas 出現。
//openApp 已等到 csLogin+webInfor，故此處 $t 譯文已就緒（lang-aware 取標籤）。
async function gotoStaInfor(page) {
    const staLabel = await page.evaluate(() => window.$vo.$t('mmStaInfor'))
    await clickNavItem(page, staLabel) //限定導覽面板內（見 e2e-setup clickNavItem 註解）
    //等事件展示區標題 + 圖表 canvas 渲染（mock 後端確定有資料 → optEvent 非 null → WEchartsVue 掛 canvas）
    await waitUntilExist(page, '統計事件圖表 canvas', () => document.querySelector('canvas') !== null, { timeout: 30000 })
    //echarts 初始化 + resize debounce 充分 settle（給足 6-8s，圖表大量繪製）
    await page.waitForTimeout(7000)
}

//—— echarts 圖例（畫在 canvas 內、無 DOM 節點）之讀取與點擊：共用 e2e-setup 之 readStaLegend / clickStaLegendItem / clickStaLegendPager ——
//（由 zrender 顯示列表取視窗座標後真滑鼠點擊，L2；捲動式時只點可視窗內之項目）

//以圖例關掉不在 keepEvents 內的事件（user-facing：真滑鼠點該圖例文字）→ 等重繪 settle。
async function keepOnlyEventsByLegend(page, keepEvents, allEvents) {
    for (const ev of allEvents) {
        if (keepEvents.includes(ev)) continue
        await clickStaLegendItem(page, ev) //每次點擊前重取座標，點後離開圖例
    }
    await page.waitForTimeout(3000)
}

//讀圖例並驗排版不變條件（每個觀察點皆驗，見 e2e-setup assertStaLegendLayout）；expectType 為該點依 spec 應為之類型。
async function legendAt(page, tag, expectType) {
    const s = await waitStaLegendSettled(page)
    assertStaLegendLayout(s, tag)
    if (expectType) assert.equal(s.type, expectType, `${tag}：圖例應為${expectType === 'scroll' ? '捲動式' : '一般式'}（圖寬 ${s.chartW}），實得 ${s.type}`)
    return s
}

//改視窗寬（使用者拖曳視窗邊界；無 DOM 點擊目標，以 setViewportSize 模擬）→ 等導覽區與圖例落定。
//視窗寬 < 460 時導覽區自動收合（LayoutContent.vue WDrawer switchWidth），collapsed 為該寬度下之預期收合態。
async function resizeTo(page, width, collapsed) {
    await page.setViewportSize({ width, height: 900 })
    await waitNavSettled(page, collapsed)
}

//等事件圖重建完成（勾選加總、切換語系後 debounce 300ms 重算圖表設定）：系列數＝count，且首條系列名＝head（null 表不檢查）。
async function waitSeries(page, label, count, head) {
    await waitUntilExist(page, label, (a) => {
        const find = (vm) => {
            if (!vm) return null
            if (vm.optEvent !== undefined && vm.legendType !== undefined) return vm
            for (const c of (vm.$children || [])) {
                const r = find(c)
                if (r) return r
            }
            return null
        }
        const vm = find(window.$vo)
        const ss = vm && vm.optEvent && vm.optEvent.series
        return !!ss && ss.length === a.count && (a.head === null || ss[0].name === a.head)
    }, { timeout: 30000, arg: { count, head } })
}

//「全部加總」系列名（server/procLang.mjs staTotal）：長度隨語系不同，E2E-008 之圖例放得下與否跟著改變
const TOTAL_NAME = { eng: 'Total', cht: '全部加總' }
//頂列語系下拉之顯示文字（Layout.vue getLangText）
const LANG_TEXT = { eng: 'English', cht: '中文' }
//頂列語系下拉整顆（寬版時位於頂列右側；WTextSelect 根節點＝頂列內帶 v-domresize 且含觸發區者，寬 100、含外框與展開箭頭）
function langSelLoc(page) {
    return page.locator('[data-fmid="app-topbar"] div[ev-resize]').filter({ has: page.locator('div[_tabindex="0"]') }).first()
}

//勾選「全部加總」（user-facing：勾 #staShowTotal checkbox）→ 等圖表重建（首條系列為加總線、系列數＝事件數＋1）。
//原固定 5 秒（debounce 300ms＋重算＋重繪）為唯一同步，負載高時 debounce 延遲即截到未加總之圖；改與 E2E-008 同一偵測（waitSeries），
//重繪動畫由 captureStable 之穩定判定收斂（2026-09-28）
async function checkShowTotal(page, lang, nEvents) {
    await page.locator('#staShowTotal').check()
    await waitSeries(page, '加入加總線之圖表', nEvents + 1, TOTAL_NAME[lang])
}

//時間分組下拉（自製 WTextSelect，LayoutContentStaInfor.vue id="staTimeIntervalSel"，清單 teleport 至 body 之 .WPopperFix[wtlp="staTimeIntervalSel"]）
const SEL_INTERVAL = '#staTimeIntervalSel'

//—— E2E-005 時間分組切每日 語意斷言 ——
//驗：觸發區顯示「每日」；圖表 x 軸為 7 個每日分桶（mock day）且首桶為日期格式 YYYY-MM-DD；清單已關閉。
async function assertIntervalDaySpec(page, lang) {
    const dayText = await page.evaluate(() => window.$vo.$t('staTimeDay'))
    const trig = await page.evaluate((s) => { const e = document.querySelector(`${s} div[_tabindex="0"]`); return e ? (e.textContent || '').trim() : null }, SEL_INTERVAL)
    assert.equal(trig, dayText, `(E2E-005/${lang}) 觸發區應顯示「${dayText}」，實得「${trig}」`)
    const ax = await page.evaluate(() => {
        const find = (vm) => { if (!vm) return null; if (vm.chart && typeof vm.chart.getOption === 'function') return vm; for (const c of (vm.$children || [])) { const r = find(c); if (r) return r } return null }
        const vm = find(window.$vo); const o = vm && vm.chart.getOption()
        return o && o.xAxis && o.xAxis[0] ? { n: o.xAxis[0].data.length, first: String(o.xAxis[0].data[0]) } : null
    })
    assert.ok(ax && ax.n === 7, `(E2E-005/${lang}) 每日分組之 x 軸應為 7 桶，實得 ${JSON.stringify(ax)}`)
    assert.ok(/^\d{2}\/\d{2}$/.test(ax.first), `(E2E-005/${lang}) 每日分桶軸標籤應為 MM/DD（LayoutContentStaInfor.vue formatX），實得 ${ax.first}`)
    const popOpen = await page.locator('.WPopperFix[wtlp="staTimeIntervalSel"]:visible').count()
    assert.equal(popOpen, 0, `(E2E-005/${lang}) 選取後清單應關閉`)
}

//定位事件展示區卡片（含 staEventTitle 標題之 .bg-white 卡片），供紅框標注。
function eventCardLoc(page, title) {
    return page.locator('.bg-white').filter({ has: page.locator('span.text-lg', { hasText: title }) }).first()
}

//定位事件統計表卡片（含 staTableTitle 標題之 .bg-white 卡片），供紅框標注表格區。
function tableCardLoc(page, title) {
    return page.locator('.bg-white').filter({ has: page.locator('span.text-lg', { hasText: title }) }).first()
}

//讀取統計表各列第一個數字欄（last1Day）為數值陣列；逗號千分位字串轉回數字以供大小比較。
async function getTableLast1DayValues(page, tableTitle) {
    return await page.evaluate((t) => {
        const blocks = Array.from(document.querySelectorAll('.bg-white'))
        const blk = blocks.find((b) => {
            const sp = b.querySelector('span.text-lg')
            return sp && sp.textContent.includes(t)
        })
        if (!blk) return null
        const rows = Array.from(blk.querySelectorAll('table tbody tr'))
        return rows.map((tr) => {
            const cells = tr.querySelectorAll('td')
            const txt = cells.length >= 2 ? cells[1].textContent : '' //第 2 欄 = last1Day
            return Number((txt || '').replace(/,/g, '').trim())
        })
    }, tableTitle)
}

//讀取 StaInfor 元件實例之 optEvent.series 名單（echarts 圖例文字落在 canvas 內、DOM 讀不到 → 由元件 series 驗，仍為「圖表內容」之觀察點）。
async function getSeriesNames(page) {
    return await page.evaluate(() => {
        const findVm = (vm) => {
            if (!vm) return null
            if (vm.optEvent && Array.isArray(vm.optEvent.series)) return vm
            for (const c of (vm.$children || [])) {
                const r = findVm(c)
                if (r) return r
            }
            return null
        }
        const vm = findVm(window.$vo)
        if (!vm) return null
        return vm.optEvent.series.map((s) => s.name)
    })
}

//—— 語意斷言 helper ——
//驗：頁面含事件標題；事件展示卡片內 canvas 數 > 0（圖確實渲染）。
//E2E-001：進頁預設 → 系列為全部 mock event（5 條）。
//E2E-002：以圖例關掉其餘 3 事件 → 圖例僅 KEEP_EVENTS 為顯示中（驗事件篩選：留誰看誰）。
//E2E-003：勾全部加總 → 系列加入 Total（Total + 5 事件 = 6 條）。
async function assertSpecForCase(page, lang, name) {
    const title = await page.evaluate(() => window.$vo.$t('staEventTitle'))

    //語意 1：頁面含事件展示區標題
    const hasTitle = await page.evaluate((t) => (document.body.innerText || '').includes(t), title)
    assert.ok(hasTitle, `(${name}/${lang}) 應顯示事件展示區標題「${title}」`)

    //語意 2：事件展示卡片（含該標題之 .bg-white）內 canvas 數 > 0
    const canvasCount = await page.evaluate((t) => {
        const blocks = Array.from(document.querySelectorAll('.bg-white'))
        const blk = blocks.find((b) => {
            const sp = b.querySelector('span.text-lg')
            return sp && sp.textContent.includes(t)
        })
        if (!blk) return -1
        return blk.querySelectorAll('canvas').length
    }, title)
    assert.ok(canvasCount > 0, `(${name}/${lang}) 事件展示卡片內應有 canvas（圖確實渲染），實得 ${canvasCount}`)

    //語意 3：圖表系列名單對齊所選事件
    const seriesNames = await getSeriesNames(page)
    assert.ok(Array.isArray(seriesNames), `(${name}/${lang}) 應取得 optEvent.series 名單，實得 ${JSON.stringify(seriesNames)}`)

    if (name === 'E2E-001-event-all') {
        //進頁預設 → 5 個 mock event 各一條系列（showTotal 預設 false，無 Total 線）
        assert.ok(seriesNames.length === 5, `(${name}/${lang}) 全選應為 5 條事件系列，實得 series=${JSON.stringify(seriesNames)}`)
        for (const ev of ['verifyConn', 'updateTargets-success', 'checkUser-error', 'api/getPerm-success', 'getWebInfor-success']) {
            assert.ok(seriesNames.includes(ev), `(${name}/${lang}) 全選系列應含 mock event '${ev}'，實得 ${JSON.stringify(seriesNames)}`)
        }
    }
    else if (name === 'E2E-002-event-selected') {
        //以圖例關掉其餘 3 事件 → 圖例顯示中者恰為 KEEP_EVENTS，被關掉者為不顯示
        const info = await readStaLegend(page)
        const selected = info && info.selected
        assert.ok(selected && Object.keys(selected).length > 0, `(${name}/${lang}) 應取得圖例切換狀態，實得 ${JSON.stringify(selected)}`)
        for (const ev of KEEP_EVENTS) {
            assert.ok(selected[ev] === true, `(${name}/${lang}) 保留事件 '${ev}' 之圖例應為顯示中，實得 ${JSON.stringify(selected)}`)
        }
        for (const ev of ['updateTargets-success', 'api/getPerm-success', 'getWebInfor-success']) {
            assert.ok(selected[ev] === false, `(${name}/${lang}) 已由圖例關掉之事件 '${ev}' 不應顯示，實得 ${JSON.stringify(selected)}`)
        }
    }
    else if (name === 'E2E-003-event-total') {
        //勾「全部加總」→ 系列加入 Total 加總線（Total + 5 事件 = 6 條；Total 置首）
        const totalName = await page.evaluate(() => window.$vo.$t('staTotal'))
        assert.ok(seriesNames.length === 6, `(${name}/${lang}) 勾全部加總後系列數應為 6（Total + 5 事件），實得 series=${JSON.stringify(seriesNames)}`)
        assert.ok(seriesNames[0] === totalName, `(${name}/${lang}) 首條系列名應為全部加總「${totalName}」，實得 ${JSON.stringify(seriesNames)}`)
    }
}

//—— E2E-004 事件統計表 語意斷言 ——
//驗：表格 tbody 列數 = 5（mock 5 事件）；依最近1日降序（由上而下非遞增）；表頭含各時間窗欄位文字。
async function assertTableSpec(page, lang) {
    const tableTitle = await page.evaluate(() => window.$vo.$t('staTableTitle'))

    //語意 1：頁面含統計表標題
    const hasTitle = await page.evaluate((t) => (document.body.innerText || '').includes(t), tableTitle)
    assert.ok(hasTitle, `(E2E-004/${lang}) 應顯示統計表標題「${tableTitle}」`)

    //語意 2：表格 tbody 列數 = 5（mock 5 事件）
    const last1DayVals = await getTableLast1DayValues(page, tableTitle)
    assert.ok(Array.isArray(last1DayVals), `(E2E-004/${lang}) 應取得統計表列資料，實得 ${JSON.stringify(last1DayVals)}`)
    assert.ok(last1DayVals.length === 5, `(E2E-004/${lang}) mock 應有 5 個事件列，實得 ${last1DayVals.length} 列`)

    //語意 3：依最近1日降序（由上而下非遞增 rows[i] >= rows[i+1]）
    for (let i = 0; i + 1 < last1DayVals.length; i++) {
        assert.ok(last1DayVals[i] >= last1DayVals[i + 1], `(E2E-004/${lang}) 應依最近1日降序，第 ${i} 列(${last1DayVals[i]}) 應 >= 第 ${i + 1} 列(${last1DayVals[i + 1]})，實得 ${JSON.stringify(last1DayVals)}`)
    }

    //語意 4：表頭含各時間窗欄位文字（事件 / 最近1日 / 最近8小時 / 最近4小時 / 最近1小時）
    const headerKeys = ['staColEvent', 'staColLast1Day', 'staColLast8Hour', 'staColLast4Hour', 'staColLast1Hour']
    for (const k of headerKeys) {
        const colText = await page.evaluate((kk) => window.$vo.$t(kk), k)
        const hasHeader = await page.evaluate((args) => {
            const blocks = Array.from(document.querySelectorAll('.bg-white'))
            const blk = blocks.find((b) => {
                const sp = b.querySelector('span.text-lg')
                return sp && sp.textContent.includes(args.title)
            })
            if (!blk) return false
            const ths = Array.from(blk.querySelectorAll('table thead th'))
            return ths.some((th) => (th.textContent || '').includes(args.col))
        }, { title: tableTitle, col: colText })
        assert.ok(hasHeader, `(E2E-004/${lang}) 表頭應含欄位「${colText}」(${k})`)
    }
}

//case 定義：run(browser,lang) 走流程並回傳單張 { buf, page } 或多階段 { shots:[{name,buf}], page }；stages 為該案產出之全部圖鍵
//（與寫檔名、比對名一致，產出與宣告不符即報錯）；semantic(page,lang) 為截圖之後之語意斷言（產製端與比對端皆於寫檔／比對前執行）。
//順序＝mocha it 順序＝產製順序。
const CASES = [
    {
        //E2E-001：進統計資訊頁 → 每事件各一條折線（5 條）
        name: 'E2E-001-event-all',
        stages: ['E2E-001-event-all'],
        run: async (browser, lang) => {
            const page = await openApp(browser)
            await setLang(page, lang)
            await gotoStaInfor(page)
            const title = await page.evaluate(() => window.$vo.$t('staEventTitle'))
            const buf = await captureStableWithBox(page, eventCardLoc(page, title)) //觀看區：事件發生頻率卡片
            return { buf, page }
        },
        semantic: async (page, lang) => { await assertSpecForCase(page, lang, 'E2E-001-event-all') },
    },
    {
        //E2E-002：以圖例關掉其餘事件、只留 2 個 → 僅 2 條折線（展示單一事件趨勢辨認）
        name: 'E2E-002-event-selected',
        stages: ['E2E-002-event-selected'],
        run: async (browser, lang) => {
            const page = await openApp(browser)
            await setLang(page, lang)
            await gotoStaInfor(page)
            await keepOnlyEventsByLegend(page, KEEP_EVENTS, ALL_MOCK_EVENTS)
            const title = await page.evaluate(() => window.$vo.$t('staEventTitle'))
            const buf = await captureStableWithBox(page, eventCardLoc(page, title)) //觀看區：事件發生頻率卡片（圖例只留 2 個事件）
            return { buf, page }
        },
        semantic: async (page, lang) => { await assertSpecForCase(page, lang, 'E2E-002-event-selected') },
    },
    {
        //E2E-003：勾「全部加總」→ 圖表加入 Total 加總線（Total + 5 事件）
        name: 'E2E-003-event-total',
        stages: ['E2E-003-event-total'],
        run: async (browser, lang) => {
            const page = await openApp(browser)
            await setLang(page, lang)
            await gotoStaInfor(page)
            await checkShowTotal(page, lang, 5)   //勾「全部加總」#staShowTotal（5 個 mock event → 6 條系列）
            const title = await page.evaluate(() => window.$vo.$t('staEventTitle'))
            const buf = await captureStableWithBox(page, eventCardLoc(page, title)) //觀看區：事件發生頻率卡片（含 Total 線）
            return { buf, page }
        },
        semantic: async (page, lang) => { await assertSpecForCase(page, lang, 'E2E-003-event-total') },
    },
    {
        //E2E-004：事件統計表 → 5 列、依最近1日降序、表頭含各時間窗欄位
        name: 'E2E-004-event-table',
        stages: ['E2E-004-event-table'],
        run: async (browser, lang) => {
            const page = await openApp(browser)
            await setLang(page, lang)
            await gotoStaInfor(page)
            //等統計表卡片渲染（含 staTableTitle 之 .bg-white 卡片內 table tbody tr）
            const tableTitle = await page.evaluate(() => window.$vo.$t('staTableTitle'))
            await waitUntilExist(page, '統計表 tbody 列', (t) => {
                const blocks = Array.from(document.querySelectorAll('.bg-white'))
                const blk = blocks.find((b) => {
                    const sp = b.querySelector('span.text-lg')
                    return sp && sp.textContent.includes(t)
                })
                return blk && blk.querySelectorAll('table tbody tr').length > 0
            }, { timeout: 30000, arg: tableTitle })
            const buf = await captureStableWithBox(page, tableCardLoc(page, tableTitle)) //觀看區：事件統計表卡片
            return { buf, page }
        },
        semantic: async (page, lang) => { await assertTableSpec(page, lang) },
    },
    {
        //E2E-005：時間分組下拉（自製 WTextSelect）切「每日」→ 圖表改以每日分桶重取重繪（mock day = 7 桶）。
        //多階段（每步兩張）：點下拉前框住觸發區 → 清單展開框住整份清單 → 點「每日」前框住該項目 → 選後框住事件頻率卡片。
        name: 'E2E-005-interval-day',
        stages: ['E2E-005-1-click-interval', 'E2E-005-2-list-open', 'E2E-005-3-click-day', 'E2E-005-4-day-selected'],
        run: async (browser, lang) => {
            const page = await openApp(browser)
            await setLang(page, lang)
            await gotoStaInfor(page)
            const dayText = await page.evaluate(() => window.$vo.$t('staTimeDay'))
            const title = await page.evaluate(() => window.$vo.$t('staEventTitle'))
            const s1 = await captureStableWithBox(page, SEL_INTERVAL) //E2E-005-1-click-interval：點擊前框住時間分組觸發區整顆
            await page.locator(`${SEL_INTERVAL} div[_tabindex="0"]`).first().click()
            const popup = page.locator(`.WPopperFix[wtlp="staTimeIntervalSel"]:visible`)
            await popup.first().waitFor({ state: 'visible', timeout: 10000 })
            await page.waitForTimeout(500)
            //清單為 teleport 之浮層: 經 itemsUnionBox fit 框線置於清單內容(或項目)與清單外內容(觸發區)之間隙正中、項目間取間隙正中, 四周空白處照常外擴(2026-09-28)
            const s2 = await captureStableWithBox(page, itemsUnionBox(popup.first(), { fit: true })) //E2E-005-2-list-open：清單展開，框住整份清單（每小時 / 每日）
            const dayItem = popup.locator('div[tabindex="0"]').filter({ hasText: dayText }).first()
            const s3 = await captureStableWithBox(page, itemsUnionBox(dayItem, { fit: true })) //E2E-005-3-click-day：點擊前框住「每日」項目整顆
            await dayItem.click()
            await popup.first().waitFor({ state: 'hidden', timeout: 10000 })
            await waitUntilExist(page, '每日分桶圖表（xAxis 7 桶）', () => {
                const find = (vm) => { if (!vm) return null; if (vm.chart && typeof vm.chart.getOption === 'function') return vm; for (const c of (vm.$children || [])) { const r = find(c); if (r) return r } return null }
                const vm = find(window.$vo); const o = vm && vm.chart.getOption()
                return !!(o && o.xAxis && o.xAxis[0] && o.xAxis[0].data && o.xAxis[0].data.length === 7)
            }, { timeout: 30000 })
            await page.waitForTimeout(5000) //echarts 重繪 + resize debounce settle（對齊 checkShowTotal）
            const s4 = await captureStableWithBox(page, eventCardLoc(page, title)) //E2E-005-4-day-selected：選後框住事件頻率卡片（觸發區顯示「每日」、圖為 7 個每日分桶）
            return { shots: [
                { name: 'E2E-005-1-click-interval', buf: s1 },
                { name: 'E2E-005-2-list-open', buf: s2 },
                { name: 'E2E-005-3-click-day', buf: s3 },
                { name: 'E2E-005-4-day-selected', buf: s4 },
            ], page }
        },
        semantic: async (page, lang) => { await assertIntervalDaySpec(page, lang) },
    },
    {
        //E2E-006：窄視窗之捲動式圖例 → 翻下一頁 → 點該頁事件隱藏 → 再縮窄仍停留原頁 → 拉寬恢復一般式且事件仍隱藏。
        //6 步真實路徑：①登入點「統計資訊」（1440 並排）②縮窄視窗至 430（導覽區自動收合、圖寬 330：一般式需 3 列會壓到刻度 → 改單列捲動式）
        //  ③點圖例右側「下一頁」箭頭 ④點該頁第一個事件（隱藏其折線）⑤再縮至 420 ⑥拉回 1440；不寫入任何資料
        name: 'E2E-006-legend-scroll-page',
        stages: ['E2E-006-1-narrowed', 'E2E-006-2-click-next', 'E2E-006-3-next-page', 'E2E-006-4-click-event', 'E2E-006-5-event-hidden', 'E2E-006-6-widened'],
        run: async (browser, lang) => {
            const page = await openApp(browser)
            await setLang(page, lang)
            await gotoStaInfor(page)
            const title = await page.evaluate(() => window.$vo.$t('staEventTitle'))

            //②縮窄：無點擊目標故無點擊前之圖
            await resizeTo(page, 430, true)
            let s = await legendAt(page, '縮至 430', 'scroll')
            assert.equal(s.chartW, 330, `縮至 430 後圖寬應為 330（導覽區收合），實得 ${s.chartW}`)
            assert.ok(s.pager.next && s.pager.next.active, `捲動式應顯示可點之「下一頁」箭頭，實得 ${JSON.stringify(s.pager)}`)
            assert.ok(s.pager.prev && !s.pager.prev.active, `首頁時「上一頁」箭頭應為停用態，實得 ${JSON.stringify(s.pager)}`)
            assert.ok(/^1\/\d+$/.test(s.pager.text || ''), `頁次應為 1/N，實得 ${s.pager.text}`)
            const nPage = Number(s.pager.text.split('/')[1])
            assert.ok(nPage >= 2, `5 個事件於圖寬 330 應分成 ≥ 2 頁，實得 ${nPage}`)
            const firstP1 = s.items.find((o) => o.inWindow).name
            const s1 = await captureStableWithBox(page, inkRect(s.legendRect)) //E2E-006-1-narrowed：縮為 430 後框住圖例列（可視之事件、翻頁箭頭與頁次）
            const s2 = await captureStableWithBox(page, inkRect(s.pager.next.rect, { neighbors: [s.pager.textRect, s.pager.prev && s.pager.prev.rect].filter(Boolean) })) //E2E-006-2-click-next：點擊前框住「下一頁」箭頭

            //③翻下一頁
            await clickStaLegendPager(page, 'next')
            s = await legendAt(page, '翻下一頁', 'scroll')
            assert.equal(s.pager.text, `2/${nPage}`, `翻頁後頁次應為 2/${nPage}，實得 ${s.pager.text}`)
            assert.ok(s.pager.prev && s.pager.prev.active, '第 2 頁時「上一頁」箭頭應可點')
            const inWin = s.items.filter((o) => o.inWindow)
            assert.ok(inWin.length >= 1 && inWin[0].name !== firstP1, `翻頁後可視之事件應換成下一批，實得 ${JSON.stringify(inWin.map((o) => o.name))}（第 1 頁首項 ${firstP1}）`)
            const target = inWin[0]
            const s3 = await captureStableWithBox(page, inkRect(s.legendRect)) //E2E-006-3-next-page：框住圖例列（第 2 頁之事件與頁次 2/N）
            //圖例項緊鄰: 框線不越過與鄰項間隙之正中(inkRect neighbors; 原外擴後壓到下一項之圖示, 2026-09-28)。
            //可見範圍取項目之實際墨跡左右範圍(w-package-tools-e2e canvasInkRects 讀 canvas 像素): whole 與 zrender 之文字矩形右緣皆比字形多約 3px,
            //以之取中點會使框線偏向鄰項; 鄰項取畫面上有墨跡之其他項目(含被捲動窗裁掉一部分者——只算 inWindow 會漏掉緊鄰之半顯示項)
            //(同日審圖: 框線距自身文字 7px、貼下一項之綠色圖示 0px)
            const inks = await canvasInkRects(page, s.items.map((o) => o.whole))
            const visOf = (o, ink) => {
                const y0 = Math.min(o.whole.y, o.text.y)
                const y1 = Math.max(o.whole.y + o.whole.height, o.text.y + o.text.height)
                return { x: ink.x, y: y0, width: ink.width, height: y1 - y0 }
            }
            const ti = s.items.indexOf(target)
            assert.ok(inks[ti], `目標圖例項於畫布上應有墨跡，實得 ${JSON.stringify(inks[ti])}`)
            const others = s.items.map((o, i) => (i !== ti && inks[i] ? visOf(o, inks[i]) : null)).filter(Boolean)
            const s4 = await captureStableWithBox(page, inkRect(visOf(target, inks[ti]), { neighbors: others })) //E2E-006-4-click-event：點擊前框住該頁第一個事件整顆（圖示與名稱）

            //④點該頁第一個事件
            await clickStaLegendItem(page, target.name)
            s = await legendAt(page, '點事件', 'scroll')
            assert.deepEqual(s.hidden, [target.name], `點擊之事件應被隱藏，實得 ${JSON.stringify(s.hidden)}`)
            assert.equal(s.pager.text, `2/${nPage}`, `點事件後應仍停留第 2 頁，實得 ${s.pager.text}`)
            await page.waitForTimeout(2000) //折線移除之重繪動畫
            const s5 = await captureStableWithBox(page, eventCardLoc(page, title)) //E2E-006-5-event-hidden：框住事件發生頻率卡片（該事件折線已移除、圖例名稱轉灰）

            //⑤再縮至 420：仍停留原頁（剛隱藏之事件仍在可視範圍）
            const idx = s.scrollDataIndex
            await resizeTo(page, 420, true)
            s = await legendAt(page, '再縮至 420', 'scroll')
            assert.equal(s.scrollDataIndex, idx, `再縮窄後應停留原頁（scrollDataIndex ${idx}），實得 ${s.scrollDataIndex}`)
            const t420 = s.items.find((o) => o.name === target.name)
            assert.ok(t420 && t420.inWindow, `再縮窄後剛隱藏之事件應仍在可視範圍，實得 ${JSON.stringify(s.items.map((o) => [o.name, o.inWindow]))}`)
            assert.deepEqual(s.hidden, [target.name], `再縮窄後事件應仍隱藏，實得 ${JSON.stringify(s.hidden)}`)

            //⑥拉回 1440：恢復一般式，已隱藏之事件仍隱藏
            await resizeTo(page, 1440, false)
            s = await legendAt(page, '拉回 1440', 'plain')
            assert.equal(s.chartW, 1140, `拉回 1440 後圖寬應為 1140（導覽區展開並排），實得 ${s.chartW}`)
            assert.deepEqual(s.hidden, [target.name], `拉回後已隱藏之事件應仍隱藏，實得 ${JSON.stringify(s.hidden)}`)
            const s6 = await captureStableWithBox(page, inkRect(s.legendRect)) //E2E-006-6-widened：框住圖例列（一般式列出全部事件，已隱藏者名稱為灰）
            return {
                shots: [
                    { name: 'E2E-006-1-narrowed', buf: s1 },
                    { name: 'E2E-006-2-click-next', buf: s2 },
                    { name: 'E2E-006-3-next-page', buf: s3 },
                    { name: 'E2E-006-4-click-event', buf: s4 },
                    { name: 'E2E-006-5-event-hidden', buf: s5 },
                    { name: 'E2E-006-6-widened', buf: s6 },
                ],
                page,
            }
        },
    },
    {
        //E2E-007：視窗 700（導覽區並排、圖寬 400 → 捲動式）→ 點「隱藏選單」圖加寬至 600、圖例恢復一般式 → 點「顯示選單」圖回 400、圖例改回捲動式。
        //6 步真實路徑：①登入點「統計資訊」②視窗縮為 700 ③點「隱藏選單」④圖隨內容區加寬、圖例恢復一般式 ⑤點「顯示選單」⑥圖變窄、圖例改回捲動式；不寫入任何資料
        //（2026-09-24 前事件圖之 autoresize 若以模板字面值傳入，收合導覽區時圖不會跟著改寬；本案例守住「圖寬＝容器寬」）
        name: 'E2E-007-legend-menu-toggle',
        stages: ['E2E-007-1-click-hide', 'E2E-007-2-menu-hidden', 'E2E-007-3-click-show', 'E2E-007-4-menu-shown'],
        run: async (browser, lang) => {
            const page = await openApp(browser)
            await setLang(page, lang)
            await gotoStaInfor(page)
            const title = await page.evaluate(() => window.$vo.$t('staEventTitle'))

            //②視窗縮為 700（仍 ≥ 460，導覽區維持並排）
            await resizeTo(page, 700, false)
            let s = await legendAt(page, '視窗 700', 'scroll')
            assert.equal(s.chartW, 400, `視窗 700 導覽區並排時圖寬應為 400，實得 ${s.chartW}`)
            const s1 = await captureStableWithBox(page, navBtn(page, 'hide')) //E2E-007-1-click-hide：點擊前框住「隱藏選單」整顆圓鈕

            //③點「隱藏選單」
            await navBtn(page, 'hide').first().click()
            await waitNavSettled(page, true)
            s = await legendAt(page, '隱藏選單後', 'plain')
            assert.equal(s.chartW, 600, `隱藏選單後圖寬應加寬為 600，實得 ${s.chartW}`)
            const s2 = await captureStableWithBox(page, eventCardLoc(page, title)) //E2E-007-2-menu-hidden：框住事件發生頻率卡片（圖隨內容區加寬、圖例恢復一般式完整列出）
            const s3 = await captureStableWithBox(page, navBtn(page, 'show')) //E2E-007-3-click-show：點擊前框住「顯示選單」整顆圓鈕

            //⑤點「顯示選單」
            await navBtn(page, 'show').first().click()
            await waitNavSettled(page, false)
            s = await legendAt(page, '顯示選單後', 'scroll')
            assert.equal(s.chartW, 400, `顯示選單後圖寬應回到 400，實得 ${s.chartW}`)
            const s4 = await captureStableWithBox(page, eventCardLoc(page, title)) //E2E-007-4-menu-shown：框住事件發生頻率卡片（圖隨內容區變窄、圖例改回單列捲動式）
            return {
                shots: [
                    { name: 'E2E-007-1-click-hide', buf: s1 },
                    { name: 'E2E-007-2-menu-hidden', buf: s2 },
                    { name: 'E2E-007-3-click-show', buf: s3 },
                    { name: 'E2E-007-4-menu-shown', buf: s4 },
                ],
                page,
            }
        },
    },
    {
        //E2E-008：13 個長名稱事件（staEventMock='many'）於 1440（圖寬 1140）→ 勾「全部加總」→ 經頂列語系下拉切到另一語系。
        //加總系列名 eng「Total」、cht「全部加總」較寬：一般式恰好放得下兩列之最小圖寬，eng 為 1130、cht 為 1150（2026-09-25 逐 1px 實測，echarts 6.1.0／Windows 預設字型），
        //故 1140 時 eng 為一般式、cht 為捲動式；切換語系後跟著改變。
        //6 步真實路徑：①登入點「統計資訊」②看圖例（13 事件、一般式兩列）③勾「全部加總」④點頂列語系下拉 ⑤點另一語系 ⑥圖例依新語系之加總名稱重新判定；不寫入任何資料
        name: 'E2E-008-legend-long-names',
        settings: { staEventMock: 'many' },
        stages: ['E2E-008-1-check-total', 'E2E-008-2-total-shown', 'E2E-008-3-click-lang', 'E2E-008-4-lang-list', 'E2E-008-5-click-lang-item', 'E2E-008-6-lang-switched'],
        run: async (browser, lang) => {
            const other = lang === 'eng' ? 'cht' : 'eng'
            const typeWithTotal = { eng: 'plain', cht: 'scroll' }
            const page = await openApp(browser)
            await setLang(page, lang)
            await gotoStaInfor(page)

            //②13 事件：一般式兩列
            await waitSeries(page, '13 事件之圖表', 13, null)
            let s = await legendAt(page, '進頁 13 事件', 'plain')
            assert.equal(s.rows, 2, `13 事件於圖寬 ${s.chartW} 應為一般式兩列，實得 ${s.rows} 列`)
            const s1 = await captureStableWithBox(page, ['#staShowTotal', itemsUnionBox('label[for="staShowTotal"]', { fit: true })]) //E2E-008-1-check-total：點擊前框住「全部加總」勾選框與文字（標籤無可見邊界, 量墨跡並外擴）

            //③勾「全部加總」
            await page.locator('#staShowTotal').check()
            await waitSeries(page, '加入加總線之圖表', 14, TOTAL_NAME[lang])
            s = await legendAt(page, '勾全部加總', typeWithTotal[lang])
            if (s.type === 'plain') assert.equal(s.rows, 2, `加入加總後一般式應仍為兩列，實得 ${s.rows} 列`)
            const s2 = await captureStableWithBox(page, inkRect(s.legendRect)) //E2E-008-2-total-shown：框住圖例（加總名稱加在最前；eng 仍兩列一般式、cht 改單列捲動式）

            //④點頂列語系下拉
            const s3 = await captureStableWithBox(page, langSelLoc(page)) //E2E-008-3-click-lang：點擊前框住頂列語系下拉整顆
            await page.locator('[data-fmid="app-topbar"] div[_tabindex="0"]').filter({ hasText: LANG_TEXT[lang] }).first().click()
            const popup = page.locator('.WPopperFix:visible')
            await popup.first().waitFor({ state: 'visible', timeout: 10000 })
            await page.waitForTimeout(500)
            //清單緊接下拉下方: 經 itemsUnionBox fit(浮層規則)框線置於清單內容與清單外內容之間隙正中, 不蓋到清單外之下拉與頁面內容、也不貼清單內之字
            //(2026-09-28 取代原 frameBelow——只收上緣、左右下仍外擴 6px)
            const s4 = await captureStableWithBox(page, itemsUnionBox(popup.first(), { fit: true })) //E2E-008-4-lang-list：清單展開，框住整份語系清單（框線不蓋到清單外之下拉與頁面內容）
            const item = popup.locator('div[tabindex="0"]').filter({ hasText: LANG_TEXT[other] }).first()
            const s5 = await captureStableWithBox(page, itemsUnionBox(item, { fit: true })) //E2E-008-5-click-lang-item：點擊前框住另一語系項目整顆（框線在與相鄰項目之間隙正中）

            //⑤點另一語系 → ⑥圖例依新語系之加總名稱重新判定
            await item.click()
            await popup.first().waitFor({ state: 'hidden', timeout: 10000 })
            await waitSeries(page, '切換語系後之圖表', 14, TOTAL_NAME[other])
            s = await legendAt(page, '切換語系後', typeWithTotal[other])
            if (s.type === 'plain') assert.equal(s.rows, 2, `切換語系後一般式應為兩列，實得 ${s.rows} 列`)
            const s6 = await captureStableWithBox(page, inkRect(s.legendRect)) //E2E-008-6-lang-switched：框住圖例（切到 cht 改單列捲動式、切到 eng 恢復兩列一般式）
            return {
                shots: [
                    { name: 'E2E-008-1-check-total', buf: s1 },
                    { name: 'E2E-008-2-total-shown', buf: s2 },
                    { name: 'E2E-008-3-click-lang', buf: s3 },
                    { name: 'E2E-008-4-lang-list', buf: s4 },
                    { name: 'E2E-008-5-click-lang-item', buf: s5 },
                    { name: 'E2E-008-6-lang-switched', buf: s6 },
                ],
                page,
            }
        },
    },
]

//單一案例管線（產製端與比對端共用）：prepare（帶 c.settings 者）換後端 → fresh browser（每案 launch／close，消 GPU/font/CSS cache 跨 case 累積差異）
//→ run(browser, lang) 自行 openApp → setLang → 進統計頁 → 流程與截圖（故 openPage 不開頁，以本案之 browser 呼叫 run）→ semantic（以 run 回傳之 page）
//→ 寫檔／比對 → finally 關瀏覽器 → afterCase（帶 c.settings 者）還原本檔預設 mock 後端 MOCK_SETTINGS（同原兩端）
async function runCase(mode, lang, c, extra = {}) {
    return await runBaselineCase({
        mode,
        lang,
        name: c.name,
        openPage: async () => null,
        run: (page, lg, ctx) => c.run(ctx.browserRef.current, lg),
        stages: c.stages,
        launch: launchBrowser,
        pathOf: picPath,
        labelOf: (lg, key) => `stainfor-${lg}-${key}`,
        match: assertBaselineMatch,
        prepare: async () => {
            if (c.settings) await restartBackend(genTempSettings(c.settings)) //case 專用後端設定（兩端同）
        },
        semantic: c.semantic ? (ctx) => c.semantic(ctx.page, ctx.lang) : null,
        afterCase: async () => {
            if (c.settings) await restartBackend(genTempSettings(MOCK_SETTINGS)) //還原本檔預設 mock 後端
        },
        ...extra,
    })
}

//篩選（gate）通過、開始觸及服務後才設為 true；.catch 據此決定是否重啟後端還原。
//why：篩選報錯（如 --names 打錯）時尚未觸及任何服務，此時不得 restartBackend——無自建後端時它會殺 11006 之監聽者並另起後端（e2e-setup killForeignOnRestart）。
let servicesTouched = false

async function generateBaseline() {
    console.log('=== 產製 stainfor baseline 開始 ===')
    process.env.E2E_STRICT_CAPTURE = '1' //regen 端：captureStable 未 settle 即 throw，拒絕寫入未穩定畫面
    //截圖前篩選（--names / --langs / --write-mode / E2E_BASELINE_OUT_DIR）；不符任何鍵即於此報錯（尚未啟動或重啟任何服務）
    const gate = createBaselineGate({ langs: LANGS, cases: CASES })
    console.log(gate.describe())
    servicesTouched = true
    await startServersOnce()
    fs.mkdirSync(PICS_DIR, { recursive: true })
    for (const lang of gate.langs) {
        const cs = gate.casesFor(lang)
        if (cs.length === 0) continue //同 mocha：該語系 describe 無可跑之 it 時不執行 before／after
        //同比對端 describe（每語系）之 before／after：啟動 mock 後端（確定性事件資料集）→ 各案 → 還原預設後端
        await restartBackend(genTempSettings(MOCK_SETTINGS))
        try {
            for (const c of cs) {
                console.log(`  ${lang}/${c.name}`)
                const r = await runCase('regen', lang, c, { gate })
                console.log(`  ✔ ${lang}/${c.name}（寫出 ${r.written.length} 張，略過 ${r.skipped.length}，保留 ${r.kept.length}）`)
            }
        }
        finally {
            //還原預設後端
            await restartBackend('./settings.json')
        }
    }
    //--names 之任一項未產出即報錯（不靜默略過）
    gate.finalize()
    cleanup() //←【必】非 mocha 直跑須顯式呼叫，否則 process 不退
    console.log('=== 產製 stainfor baseline 完成 ===')
}

if (isBaseline) {
    generateBaseline().catch(async (err) => {
        console.log('baseline 例外', err)
        if (servicesTouched) {
            try {
                await restartBackend('./settings.json')
            }
            catch (e) {}
        }
        cleanup()
        process.exit(1)
    })
}
else {
    for (const lang of LANGS) {
        describe(`e2e-stainfor (${lang})`, function() {
            this.timeout(240000)
            before(async function() {
                this.timeout(200000)
                await startServersOnce()
                //啟動 mock 後端（確定性事件資料集）。before 對整 describe 一次，after 還原（產製端每語系同層級同順序）。
                await restartBackend(genTempSettings(MOCK_SETTINGS))
            })
            after(async function() {
                this.timeout(60000)
                //還原預設後端
                await restartBackend('./settings.json')
            })
            //per-case fresh browser、case 專用後端設定切換與還原、語意斷言（主）與像素比對（補）皆由 runCase 負責（與產製端同一管線）
            for (const c of CASES) {
                it(c.name, async function() {
                    this.timeout(c.settings ? 360000 : 240000)
                    await runCase('compare', lang, c, { onKnownDefect: () => this.skip() }) //已知缺陷協定: 標 pending(提示框殘留已由 w-component-vue 2.5.24 修正, 其偵測改為直接失敗, 見 e2e-setup probeStuckTooltip)
                })
            }
        })
    }
}
