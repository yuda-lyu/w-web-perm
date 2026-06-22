//後台「統計資訊」事件展示區 e2e。對應統計頁 src/components/LayoutContentStaInfor.vue 之事件發生頻率卡片。
//act 走 user-facing input（點左側「統計資訊」選單 / 勾取消事件 checklist 之 checkbox）；assert = 語意斷言 + pixel baseline（§6.2 / §6.3）。
//
//雙模式：
//  - 產 baseline：node test/e2e-stainfor.test.mjs --baseline （寫 test/pics/stainfor/）
//  - 驗證（mocha）：npx mocha test/e2e-stainfor.test.mjs --reporter list
//  --names <eng-E2E-001-event-all,...> 進行手術式 baseline 重產
//
//標準圖存放：test/pics/stainfor/stainfor-{lang}-{name}.png（4 cases × 2 lang = 8 baselines）
//  E2E-001-event-all:      預設全選 → 圖表每個事件各一條折線（5 條）。
//  E2E-002-event-selected: 只勾選特定 2 個事件（取消其餘）→ 僅該 2 條折線。
//  E2E-003-event-total:    清除所有事件 + 勾「全部加總」→ 圖表僅單一 Total 加總線。
//  E2E-004-event-table:    事件統計表 → 5 列、依最近1日降序、表頭含各時間窗欄位。
//
//確定性來源：後端 staEventMock=true → getStaEvent 回固定資料集（48 桶、固定起點 2025-01-01、固定 sin 計數、5 個 event）。
//  event 名（mock）：verifyConn, updateTargets-success, checkUser-error, api/getPerm-success, getWebInfor-success
//  元件 allEvents 為 union 後排序 → checklist 顯示順序固定。
//  before(整體) restartBackend(genTempSettings({ staEventMock: true })) 啟動 mock 後端；
//  after(整體) restartBackend('./settings.json') 還原預設後端。
//  因 mock 圖表確定性穩定 → 直接 pixel baseline，不需 driveActivity / overlayRegions 貼圖。
import fs from 'fs'
import assert from 'assert'
import { startServersOnce, cleanup, launchBrowser, openApp, captureStableWithBox, waitUntilExist, genTempSettings, restartBackend, assertBaselineMatch } from './e2e-setup.mjs'

const PICS_DIR = './test/pics/stainfor'
const LANGS = ['eng', 'cht']
const isBaseline = process.argv.includes('--baseline')

//mock 5 個 event；E2E-002 只保留此 2 個（取消其餘 3 個），驗單一事件趨勢辨認功能。
const KEEP_EVENTS = ['verifyConn', 'checkUser-error']

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
    //等事件展示區標題 + 圖表 canvas 渲染（mock 後端確定有資料 → optEvent 非 null → WEchartsVueDyn 掛 canvas）
    await waitUntilExist(page, '統計事件圖表 canvas', () => document.querySelector('canvas') !== null, { timeout: 30000 })
    //echarts 初始化 + resize debounce 充分 settle（給足 6-8s，圖表大量繪製）
    await page.waitForTimeout(7000)
}

//只保留指定事件（user-facing：取消其餘事件之 checkbox）→ 等圖表重繪 settle。
//updateChartsDebounce 為 300ms debounce，故取消後須等重繪完成。
async function keepOnlyEvents(page, keepEvents) {
    //取得目前 checklist 所有事件名（依 :value）
    const allEvents = await page.evaluate(() => {
        const inps = Array.from(document.querySelectorAll('.staEventList input[type="checkbox"]'))
        return inps.map((el) => el.value)
    })
    //取消不在 keepEvents 內的事件 checkbox（user-facing click/uncheck）
    for (const ev of allEvents) {
        if (!keepEvents.includes(ev)) {
            await page.locator(`.staEventList input[type="checkbox"][value="${ev}"]`).uncheck()
        }
    }
    //等 debounce(300) 觸發 + optEvent 重算 + echarts 重繪 settle
    await page.waitForTimeout(5000)
}

//清除所有事件（user-facing：點「清除」按鈕）→ 等圖表重繪 settle。清除後所有事件線移除（selectedEvents 清空）。
async function clearAllEvents(page) {
    const clearLabel = await page.evaluate(() => window.$vo.$t('staClear'))
    await page.getByRole('button', { name: clearLabel, exact: true }).first().click()
    await page.waitForTimeout(5000) //等 debounce(300) + optEvent 重算 + echarts 重繪 settle
}

//勾選「全部加總」（user-facing：勾 #staShowTotal checkbox）→ 等圖表重繪 settle。勾選後圖表加入單一 Total 加總線。
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
//E2E-001：預設全選 → 系列為全部 mock event（5 條）。
//E2E-002：只保留 KEEP_EVENTS → 系列恰為該 2 個事件（驗事件選擇功能：選誰畫誰）。
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
        //預設全選 → 5 個 mock event 各一條系列（showTotal 預設 false，無 Total 線）
        assert.ok(seriesNames.length === 5, `(${name}/${lang}) 全選應為 5 條事件系列，實得 series=${JSON.stringify(seriesNames)}`)
        for (const ev of ['verifyConn', 'updateTargets-success', 'checkUser-error', 'api/getPerm-success', 'getWebInfor-success']) {
            assert.ok(seriesNames.includes(ev), `(${name}/${lang}) 全選系列應含 mock event '${ev}'，實得 ${JSON.stringify(seriesNames)}`)
        }
    }
    else if (name === 'E2E-002-event-selected') {
        //只勾 2 個事件 → 系列恰為該 2 個（其餘已取消，不應出現）
        assert.ok(seriesNames.length === KEEP_EVENTS.length, `(${name}/${lang}) 只勾 ${KEEP_EVENTS.length} 個事件，系列數應為 ${KEEP_EVENTS.length}，實得 series=${JSON.stringify(seriesNames)}`)
        for (const ev of KEEP_EVENTS) {
            assert.ok(seriesNames.includes(ev), `(${name}/${lang}) 系列應含所選事件 '${ev}'，實得 ${JSON.stringify(seriesNames)}`)
        }
        //取消的事件不應殘留為系列
        assert.ok(!seriesNames.includes('updateTargets-success'), `(${name}/${lang}) 已取消事件 'updateTargets-success' 不應出現於系列，實得 ${JSON.stringify(seriesNames)}`)
    }
    else if (name === 'E2E-003-event-total') {
        //清除所有事件 + 勾「全部加總」→ 圖表僅單一 Total 加總線（系列恰 1 條、名為 $t('staTotal')）
        const totalName = await page.evaluate(() => window.$vo.$t('staTotal'))
        assert.ok(seriesNames.length === 1, `(${name}/${lang}) 清除事件後僅勾全部加總，系列數應為 1，實得 series=${JSON.stringify(seriesNames)}`)
        assert.ok(seriesNames[0] === totalName, `(${name}/${lang}) 唯一系列名應為全部加總「${totalName}」，實得 ${JSON.stringify(seriesNames)}`)
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
        //E2E-001：進統計資訊頁，預設全選 → 每事件各一條折線（5 條）
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
        //E2E-002：取消其餘事件、只保留 2 個 → 僅 2 條折線（展示單一事件趨勢辨認）
        name: 'E2E-002-event-selected',
        run: async (browser, lang) => {
            const page = await openApp(browser)
            await setLang(page, lang)
            await gotoStaInfor(page)
            await keepOnlyEvents(page, KEEP_EVENTS)
            const title = await page.evaluate(() => window.$vo.$t('staEventTitle'))
            const buf = await captureStableWithBox(page, eventCardLoc(page, title)) //觀看區：事件發生頻率卡片（只選 2 個事件）
            return { buf, page }
        },
        semantic: async (page, lang) => { await assertSpecForCase(page, lang, 'E2E-002-event-selected') },
    },
    {
        //E2E-003：清除所有事件 → 勾「全部加總」→ 圖表僅單一 Total 加總線
        name: 'E2E-003-event-total',
        run: async (browser, lang) => {
            const page = await openApp(browser)
            await setLang(page, lang)
            await gotoStaInfor(page)
            await clearAllEvents(page)   //點「清除」按鈕，移除所有事件線
            await checkShowTotal(page)   //勾「全部加總」#staShowTotal
            const title = await page.evaluate(() => window.$vo.$t('staEventTitle'))
            const buf = await captureStableWithBox(page, eventCardLoc(page, title)) //觀看區：事件發生頻率卡片（僅 Total 線）
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
