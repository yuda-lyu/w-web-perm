//後台「統計資訊」事件展示區 e2e。對應統計頁 src/components/LayoutContentStaInfor.vue 之事件發生頻率卡片。
//act 走 user-facing input（點左側「統計資訊」選單 / 點圖表圖例切換事件 / 勾「全部加總」checkbox）；assert = 語意斷言 + pixel baseline（§6.2 / §6.3）。
//
//雙模式：
//  - 產 baseline：node test/e2e-stainfor.test.mjs --baseline （寫 test/pics/stainfor/）
//  - 驗證（mocha）：npx mocha test/e2e-stainfor.test.mjs --reporter list （pixelmatch 反鋸齒感知 + maxDiffPixels 容差比對，非 byte-exact）
//  --names <eng-E2E-001-event-all,...> 進行手術式 baseline 重產
//
//標準圖存放：test/pics/stainfor/stainfor-{lang}-{name}.png（4 cases × 2 lang = 8 baselines）
//  E2E-001-event-all:      進頁預設 → 圖表每個事件各一條折線（5 條）。
//  E2E-002-event-selected: 點圖例關掉其餘 3 事件 → 僅該 2 條折線可見（圖例切換為事件篩選之唯一入口）。
//  E2E-003-event-total:    勾「全部加總」→ 圖表加入 Total 加總線（Total + 5 事件 = 6 條系列）。
//  E2E-004-event-table:    事件統計表 → 5 列、依最近1日降序、表頭含各時間窗欄位。
//
//確定性來源：後端 staEventMock=true → getStaEvent 回固定資料集（48 桶、固定起點 2025-01-01、固定 sin 計數、5 個 event）。
//  event 名（mock）：verifyConn, updateTargets-success, checkUser-error, api/getPerm-success, getWebInfor-success
//  元件 allEvents 為 union 後排序 → 圖表系列與圖例顯示順序固定。
//  before(整體) restartBackend(genTempSettings({ staEventMock: true })) 啟動 mock 後端；
//  after(整體) restartBackend('./settings.json') 還原預設後端。
//  因 mock 圖表確定性穩定 → 直接 pixel baseline，不需 driveActivity / overlayRegions 貼圖。
import fs from 'fs'
import assert from 'assert'
import { startServersOnce, cleanup, launchBrowser, openApp, captureStableWithBox, waitUntilExist, genTempSettings, restartBackend, assertBaselineMatch } from './e2e-setup.mjs'

const PICS_DIR = './test/pics/stainfor'
const LANGS = ['eng', 'cht']
const isBaseline = process.argv.includes('--baseline')

//mock 5 個 event；E2E-002 只保留此 2 個（以圖例關掉其餘 3 個），驗單一事件趨勢辨認功能。
const KEEP_EVENTS = ['verifyConn', 'checkUser-error']
//mock 之 5 個事件全集（元件 allEvents 排序後即此順序），供 E2E-002 逐一關閉非保留者。
const ALL_MOCK_EVENTS = ['api/getPerm-success', 'checkUser-error', 'getWebInfor-success', 'updateTargets-success', 'verifyConn']

function picPath(lang, name) { return `${PICS_DIR}/stainfor-${lang}-${name}.png` }

//設定語系（test setup 層，非 act-under-test；對齊雙語覆蓋維度）。
//對齊其他 perm e2e：cht 走語系切換（等同 UI 語言選單的 $ui.setLang）；eng 為預設不切，但補等同 settle buffer。
async function setLang(page, lang) {
    if (lang !== 'eng') {
        await page.evaluate((l) => { window.$vo.$ui.setLang(l, 'e2e-setLang') }, lang)
    }
    await page.waitForTimeout(600)
}

//導航至統計資訊頁（user-facing：點左側「統計資訊」導覽），等事件圖表 canvas 出現。
//openApp 已等到 csLogin+webInfor，故此處 $t 譯文已就緒（lang-aware 取標籤）。
async function gotoStaInfor(page) {
    const staLabel = await page.evaluate(() => window.$vo.$t('mmStaInfor'))
    await page.getByText(staLabel, { exact: true }).first().click()
    //等事件展示區標題 + 圖表 canvas 渲染（mock 後端確定有資料 → optEvent 非 null → WEchartsVue 掛 canvas）
    await waitUntilExist(page, '統計事件圖表 canvas', () => document.querySelector('canvas') !== null, { timeout: 30000 })
    //echarts 初始化 + resize debounce 充分 settle（給足 6-8s，圖表大量繪製）
    await page.waitForTimeout(7000)
}

//—— echarts 圖例（畫在 canvas 內、無 DOM 節點）之定位與點擊 ——
//圖例是事件顯示切換之唯一入口，DOM 選不到 → 由圖表實例之 zrender 顯示列表取出各圖例文字的視窗座標，
//再以真滑鼠點擊該座標（L2 絕對座標，屬 selector 不可得時之合法層級），非 dispatchAction 之程式直呼。
const EVAL_LEGEND_INFO = `(() => {
    const findVm = (vm) => {
        if (!vm) return null
        if (vm.chart && typeof vm.chart.getOption === 'function') return vm
        for (const c of (vm.$children || [])) { const r = findVm(c); if (r) return r }
        return null
    }
    const vm = findVm(window.$vo)
    if (!vm) return null
    const inst = vm.chart
    const box = inst.getDom().getBoundingClientRect()
    const items = []
    for (const el of inst.getZr().storage.getDisplayList()) {
        const t = el.style && el.style.text
        if (!t) continue
        if (typeof el.transformCoordToGlobal !== 'function') continue
        const r = el.getBoundingRect()
        const g = el.transformCoordToGlobal(r.x + r.width / 2, r.y + r.height / 2)
        items.push({ text: t, x: box.left + g[0], y: box.top + g[1] })
    }
    const opt = inst.getOption()
    return { items, selected: (opt.legend && opt.legend[0]) ? opt.legend[0].selected : null }
})()`

//取圖例狀態：{ items:[{text,x,y}], selected:{事件名:是否顯示} }；selected 為 {} 表全部顯示（尚未切換過）。
async function getLegendInfo(page) {
    return await page.evaluate(EVAL_LEGEND_INFO)
}

//以圖例關掉不在 keepEvents 內的事件（user-facing：真滑鼠點該圖例文字）→ 等重繪 settle。
async function keepOnlyEventsByLegend(page, keepEvents, allEvents) {
    for (const ev of allEvents) {
        if (keepEvents.includes(ev)) continue
        const info = await getLegendInfo(page) //每次點擊後圖例不位移，仍逐次重取以免受重繪影響
        const it = (info && info.items || []).find((o) => o.text === ev)
        assert.ok(it, `圖例應可定位到事件「${ev}」`)
        await page.mouse.click(it.x, it.y)
        await page.waitForTimeout(1200) //等圖例切換動畫與折線移除重繪
    }
    await page.mouse.move(0, 0) //離開圖例, 消 hover 高亮
    await page.waitForTimeout(3000)
}

//勾選「全部加總」（user-facing：勾 #staShowTotal checkbox）→ 等圖表重繪 settle。勾選後圖表加入 Total 加總線。
async function checkShowTotal(page) {
    await page.locator('#staShowTotal').check()
    await page.waitForTimeout(5000) //等 debounce(300) + optEvent 重算 + echarts 重繪 settle
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
        const info = await getLegendInfo(page)
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

//case 定義：run(browser,lang) 走流程並回傳 { buf, page }；mocha 模式再加語意斷言。
const CASES = [
    {
        //E2E-001：進統計資訊頁 → 每事件各一條折線（5 條）
        name: 'E2E-001-event-all',
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
        run: async (browser, lang) => {
            const page = await openApp(browser)
            await setLang(page, lang)
            await gotoStaInfor(page)
            await checkShowTotal(page)   //勾「全部加總」#staShowTotal
            const title = await page.evaluate(() => window.$vo.$t('staEventTitle'))
            const buf = await captureStableWithBox(page, eventCardLoc(page, title)) //觀看區：事件發生頻率卡片（含 Total 線）
            return { buf, page }
        },
        semantic: async (page, lang) => { await assertSpecForCase(page, lang, 'E2E-003-event-total') },
    },
    {
        //E2E-004：事件統計表 → 5 列、依最近1日降序、表頭含各時間窗欄位
        name: 'E2E-004-event-table',
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
]

//手術式重產（§6.3）：--names a,b,c 只產指定 case；--langs eng,cht 只產指定語系。截圖「前」就 gate（省截圖成本）。
function argList(flag) {
    const i = process.argv.indexOf(flag)
    if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1].split(',').map((s) => s.trim()).filter(Boolean)
    return null
}
//前綴或完整匹配：傳 'E2E-001' 即可匹配 'E2E-001-event-all'
function nameMatch(list, caseName) { return list.some((nm) => caseName === nm || caseName.startsWith(nm)) }

async function generateBaseline() {
    console.log('=== 產製 stainfor baseline 開始 ===')
    const onlyNames = argList('--names')
    const onlyLangs = argList('--langs')
    await startServersOnce()
    //啟動 mock 後端（確定性事件資料集）
    await restartBackend(genTempSettings({ staEventMock: true }))
    fs.mkdirSync(PICS_DIR, { recursive: true })
    process.env.E2E_STRICT_CAPTURE = '1' //regen 端：captureStable 未 settle 即 throw，拒絕寫入未穩定畫面
    try {
        for (const lang of LANGS) {
            if (onlyLangs && !nameMatch(onlyLangs, lang)) continue //§6.3 手術式：跳過未指定語系
            for (const c of CASES) {
                if (onlyNames && !nameMatch(onlyNames, c.name)) continue //§6.3 手術式：截圖前 gate
                //per-case fresh browser（每 case 全新進程，消 GPU/font/CSS cache 跨 case 累積差異；對齊其他 perm e2e）
                const browser = await launchBrowser()
                const { buf } = await c.run(browser, lang)
                fs.writeFileSync(picPath(lang, c.name), buf)
                console.log('wrote', picPath(lang, c.name), buf.length, 'bytes')
                await browser.close()
            }
        }
    }
    finally {
        //還原預設後端
        await restartBackend('./settings.json')
    }
    cleanup() //←【必】非 mocha 直跑須顯式呼叫，否則 process 不退
    console.log('=== 產製 stainfor baseline 完成 ===')
}

if (isBaseline) {
    generateBaseline().catch(async (err) => { console.log('baseline 例外', err); try { await restartBackend('./settings.json') } catch (e) {} ; cleanup(); process.exit(1) })
}
else {
    for (const lang of LANGS) {
        describe(`e2e-stainfor (${lang})`, function() {
            this.timeout(240000)
            before(async function() {
                this.timeout(200000)
                await startServersOnce()
                //啟動 mock 後端（確定性事件資料集）。before 對整 describe 一次，after 還原。
                await restartBackend(genTempSettings({ staEventMock: true }))
            })
            after(async function() {
                this.timeout(60000)
                //還原預設後端
                await restartBackend('./settings.json')
            })
            for (const c of CASES) {
                it(c.name, async function() {
                    this.timeout(240000)
                    //per-case fresh browser（每 case 全新進程，對齊其他 perm e2e）
                    const browser = await launchBrowser()
                    try {
                        const { buf, page } = await c.run(browser, lang)
                        if (c.semantic) await c.semantic(page, lang)
                        assertBaselineMatch(buf, picPath(lang, c.name), `stainfor-${lang}-${c.name}`)
                    }
                    finally {
                        await browser.close()
                    }
                })
            }
        })
    }
}
