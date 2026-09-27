//src/js/legendFit.mjs 單元測試（瀏覽器空白頁載入 echarts 本體與本模組，不起專案服務）。
//why 用瀏覽器：圖例排版依 canvas 量字，須與圖表實際執行環境相同之字型與版面規則。
//對應 spec/流程_統計資訊事件展示.md〈補充〉之圖例排版規則與〈已知落差〉2026-09-24 修復紀錄；設計取捨見 spec/設計要點與取捨.md ADR-024。
//  1 離屏量測（measure）＝可見圖實際排版：列數相同、底緣差 < 0.5px（4 組名稱 × 圖寬 160～1400）
//  2 判定門檻：底緣 ≤ 57 為一般式、否則捲動式；量測失敗為捲動式
//  3 genLegend：一般式不帶 tooltip、捲動式帶；切換類型帶完整設定時圖例仍在頂端且保留隱藏事件（只帶 {type, selected} 則落到底部，為對照組）
//  4 異常輸入：寬 0、空名單回 null
import fs from 'fs'
import assert from 'assert'
import { launchBrowser } from './tools/e2e-setup.mjs'

const MOCK5 = ['api/getPerm-success', 'checkUser-error', 'getWebInfor-success', 'updateTargets-success', 'verifyConn']
const MANY13 = ['api/getPermUserInfor-success', 'api/getUserByToken-success', 'getStaEvent-success', 'getStaEventTable-success', 'getTokenUser-error', 'getWebInfor-success', 'updateGrups-success', 'updatePemis-success', 'updateTabItems-pickKeysOnly', 'updateTargets-success', 'updateUsers-success', 'verifyConn', 'verifyConn-error']
const NAME_SETS = {
    mock5: MOCK5,
    many13: MANY13,
    many13TotalEng: ['Total', ...MANY13],
    many13TotalCht: ['全部加總', ...MANY13],
}

//把 ESM 模組原始碼轉為可注入頁面之腳本：去掉 export 區塊並掛到 window.LF
function moduleForPage() {
    let src = fs.readFileSync('./src/js/legendFit.mjs', 'utf8')
    src = src.replace(/export\s*\{[\s\S]*?\}\s*$/, '')
    return `${src}\nwindow.LF = { GRID_TOP, LEGEND_MAX_BOTTOM, genLegend, decideLegendType, createLegendMeasurer }`
}

describe('unit-legendFit', function() {
    this.timeout(180000)
    let browser = null
    let page = null

    before(async function() {
        browser = await launchBrowser()
        page = await browser.newPage({ viewport: { width: 1600, height: 600 } })
        await page.setContent('<html><body style="margin:0"><div id="c" style="width:1300px;height:300px"></div></body></html>')
        await page.addScriptTag({ path: 'node_modules/echarts/dist/echarts.min.js' })
        await page.addScriptTag({ content: moduleForPage() })
        await page.evaluate(() => {
            //可見圖：同 LayoutContentStaInfor genOpt 之 grid 與 legend 設定
            window.chart = window.echarts.init(document.getElementById('c'))
            window.mkOpt = (names, legend) => ({
                animation: false,
                tooltip: { trigger: 'axis' },
                grid: { left: '3%', right: '4%', top: window.LF.GRID_TOP, bottom: '3%', containLabel: true },
                legend,
                xAxis: [{ type: 'category', boundaryGap: false, data: ['a', 'b', 'c'] }],
                yAxis: [{ type: 'value' }],
                series: names.map((n, k) => ({ name: n, type: 'line', data: [k, k + 3500, k] })),
            })
            //可見圖之實際圖例排版：setOption 後（已同步 flush）讀顯示列表
            window.visibleLegend = (names) => {
                const tops = []
                let bottom = 0
                let top = Infinity
                for (const el of window.chart.getZr().storage.getDisplayList(true)) {
                    const t = el.style && el.style.text
                    if (!t || !names.includes(t) || typeof el.transformCoordToGlobal !== 'function') continue
                    const r = el.getBoundingRect()
                    const a = el.transformCoordToGlobal(r.x, r.y)[1]
                    const b = el.transformCoordToGlobal(r.x, r.y + r.height)[1]
                    if (!tops.includes(Math.round(a))) tops.push(Math.round(a))
                    bottom = Math.max(bottom, b)
                    top = Math.min(top, a)
                }
                return { rows: tops.length, bottom, top }
            }
            window.measurer = window.LF.createLegendMeasurer(window.echarts)
        })
    })

    after(async function() {
        if (browser) await browser.close()
    })

    it('離屏量測與可見圖實際排版一致（4 組名稱 × 圖寬 160～1400 每 8px）', async function() {
        for (const [tag, names] of Object.entries(NAME_SETS)) {
            const r = await page.evaluate((names) => {
                const bad = []
                let n = 0
                for (let w = 160; w <= 1400; w += 8) {
                    document.getElementById('c').style.width = w + 'px'
                    window.chart.resize()
                    window.chart.setOption(window.mkOpt(names, window.LF.genLegend('plain')), { notMerge: true })
                    const v = window.visibleLegend(names)
                    const m = window.measurer.measure(names, w, 300)
                    n++
                    if (!m || m.rows !== v.rows || Math.abs(m.bottom - v.bottom) >= 0.5) bad.push({ w, visible: v, measured: m })
                }
                return { n, bad: bad.slice(0, 5), nBad: bad.length }
            }, names)
            assert.equal(r.nBad, 0, `${tag}：${r.n} 個寬度中有 ${r.nBad} 個不一致 ${JSON.stringify(r.bad)}`)
        }
    })

    it('判定門檻：底緣 ≤ 57 為一般式、否則捲動式；量測失敗為捲動式', async function() {
        const r = await page.evaluate(() => {
            const d = window.LF.decideLegendType
            return {
                max: window.LF.LEGEND_MAX_BOTTOM,
                nul: d(null),
                b39: d({ rows: 2, bottom: 39 }),
                b57: d({ rows: 2, bottom: 57 }),
                b57x: d({ rows: 3, bottom: 57.01 }),
                b60: d({ rows: 3, bottom: 60 }),
                bad: d({ rows: 1 }),
            }
        })
        assert.deepEqual(r, { max: 57, nul: 'scroll', b39: 'plain', b57: 'plain', b57x: 'scroll', b60: 'scroll', bad: 'scroll' })
    })

    it('量測之列數與底緣：2 列底 < 57（一般式）、3 列底 > 57（捲動式）', async function() {
        //mock5：圖寬 468 為 2 列、300 為 3 列（2026-09-24 實測列距 21、2 列底 39、3 列底 60）
        const r = await page.evaluate((names) => ({ w468: window.measurer.measure(names, 468), w300: window.measurer.measure(names, 300) }), MOCK5)
        assert.equal(r.w468.rows, 2)
        assert.ok(r.w468.bottom <= 57, `2 列底緣應 ≤ 57，實得 ${r.w468.bottom}`)
        assert.equal(r.w300.rows, 3)
        assert.ok(r.w300.bottom > 57, `3 列底緣應 > 57，實得 ${r.w300.bottom}`)
    })

    it('genLegend：一般式不帶 tooltip、捲動式帶；皆 top:0', async function() {
        const r = await page.evaluate(() => ({ p: window.LF.genLegend('plain'), s: window.LF.genLegend('scroll'), d: window.LF.genLegend() }))
        assert.deepEqual(r.p, { show: true, top: 0, type: 'plain' })
        assert.deepEqual(r.s, { show: true, top: 0, type: 'scroll', tooltip: { show: true } })
        assert.deepEqual(r.d, { show: true, top: 0, type: 'plain' })
    })

    it('切換類型帶完整設定：圖例仍在頂端且保留隱藏事件（對照：只帶 {type, selected} 落到底部）', async function() {
        const r = await page.evaluate((names) => {
            document.getElementById('c').style.width = '468px'
            window.chart.resize()
            const run = (full) => {
                window.chart.setOption(window.mkOpt(names, window.LF.genLegend('plain')), { notMerge: true })
                window.chart.dispatchAction({ type: 'legendUnSelect', name: names[2] })
                const sel = window.chart.getOption().legend[0].selected
                const legend = full ? { ...window.LF.genLegend('scroll'), selected: sel } : { type: 'scroll', selected: sel }
                window.chart.setOption({ legend })
                const toScroll = { top: window.visibleLegend(names).top, sel: window.chart.getOption().legend[0].selected[names[2]], type: window.chart.getOption().legend[0].type }
                const sel2 = window.chart.getOption().legend[0].selected
                const legend2 = full ? { ...window.LF.genLegend('plain'), selected: sel2 } : { type: 'plain', selected: sel2 }
                window.chart.setOption({ legend: legend2 })
                const toPlain = { top: window.visibleLegend(names).top, sel: window.chart.getOption().legend[0].selected[names[2]], type: window.chart.getOption().legend[0].type }
                return { toScroll, toPlain }
            }
            return { full: run(true), partial: run(false) }
        }, MANY13)
        assert.equal(r.full.toScroll.type, 'scroll')
        assert.ok(r.full.toScroll.top <= 10, `帶完整設定切為捲動式後圖例頂應 ≤ 10，實得 ${r.full.toScroll.top}`)
        assert.equal(r.full.toScroll.sel, false, '切為捲動式後被隱藏之事件應仍隱藏')
        assert.equal(r.full.toPlain.type, 'plain')
        assert.ok(r.full.toPlain.top <= 10, `帶完整設定切回一般式後圖例頂應 ≤ 10，實得 ${r.full.toPlain.top}`)
        assert.equal(r.full.toPlain.sel, false, '切回一般式後被隱藏之事件應仍隱藏')
        //對照組：只帶 {type, selected} 會重建圖例模型而遺失 top:0（證明 genLegend 單一來源之必要）
        assert.ok(r.partial.toScroll.top > 200, `對照組（只帶 type）應落到底部，實得頂 ${r.partial.toScroll.top}`)
    })

    it('異常輸入：寬 0、空名單回 null（判定為捲動式）', async function() {
        const r = await page.evaluate((names) => ({
            w0: window.measurer.measure(names, 0),
            empty: window.measurer.measure([], 500),
            notArr: window.measurer.measure(null, 500),
        }), MOCK5)
        assert.deepEqual(r, { w0: null, empty: null, notArr: null })
    })

    it('dispose 後可再量測（重新建立離屏實例）', async function() {
        const r = await page.evaluate((names) => {
            window.measurer.dispose()
            return window.measurer.measure(names, 468)
        }, MOCK5)
        assert.ok(r && r.rows === 2, `dispose 後再量應重新建立並得 2 列，實得 ${JSON.stringify(r)}`)
    })
})
