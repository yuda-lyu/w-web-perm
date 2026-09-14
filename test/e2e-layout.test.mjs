//後台導覽版面 e2e（導覽區收合／恢復與各頁標題讓位）。對應 spec/流程_後台導覽版面.md。
//雙模式：
//  - 產 baseline：node test/e2e-layout.test.mjs --baseline [--names E2E-001,...] [--langs eng,cht]（寫 test/pics/layout/）
//  - 驗證（mocha）：npx mocha test/e2e-layout.test.mjs --reporter list --timeout 300000（pixelmatch 反鋸齒感知 + maxDiffPixels 容差比對，非 byte-exact）
//act 走 user-facing input（真點「隱藏選單」／「顯示選單」圓鈕、真點頁籤）；assert = 語意斷言（幾何：標題左緣 ≥ 圓鈕右緣）+ pixel baseline。
//統計頁為預設頁且圖表隨 log 變動 → 每 case 以 settings:{ staEventMock:true } 換後端（同 e2e-stainfor / e2e-users E2E-012 之 c.settings 管線）。
import fs from 'fs'
import assert from 'assert'
import { startServersOnce, cleanup, launchBrowser, openApp, captureStableWithBox, waitUntilExist, assertBaselineMatch, restartBackend, genTempSettings } from './tools/e2e-setup.mjs'

const PICS_DIR = './test/pics/layout'
const LANGS = ['eng', 'cht']
const isBaseline = process.argv.includes('--baseline')
const PAGE_KEYS = ['mmStaInfor', 'mmTargets', 'mmPemis', 'mmGrups', 'mmUsers']

function picPath(lang, name) { return `${PICS_DIR}/layout-${lang}-${name}.png` }

//設定語系（test setup 層，非 act-under-test）；沿用各 perm e2e 之對稱 buffer 慣例（eng 不切但補等量 settle）。
async function setLang(page, lang) {
    if (lang !== 'eng') {
        await page.evaluate((l) => { window.$vo.$ui.setLang(l, 'e2e-setLang') }, lang)
    }
    await page.waitForTimeout(600)
}

//—— 圓鈕定位：WButtonCircle 無 title/aria 且本二鈕 tooltip 已停用（LayoutContent.vue:56,112），以 mdi path 定位 ——
const MDI = {
    hide: 'M7,12L12,7V10H16V14H12V17L7,12M21,16.5C21,16.88 20.79,17.21 20.47,17.38L12.57,21.82C12.41,21.94 12.21,22 12,22C11.79,22 11.59,21.94 11.43,21.82L3.53,17.38C3.21,17.21 3,16.88 3,16.5V7.5C3,7.12 3.21,6.79 3.53,6.62L11.43,2.18C11.59,2.06 11.79,2 12,2C12.21,2 12.41,2.06 12.57,2.18L20.47,6.62C20.79,6.79 21,7.12 21,7.5V16.5M12,4.15L5,8.09V15.91L12,19.85L19,15.91V8.09L12,4.15Z', //mdiArrowLeftBoldHexagonOutline（隱藏選單）
    show: 'M17,12L12,17V14H8V10H12V7L17,12M21,16.5C21,16.88 20.79,17.21 20.47,17.38L12.57,21.82C12.41,21.94 12.21,22 12,22C11.79,22 11.59,21.94 11.43,21.82L3.53,17.38C3.21,17.21 3,16.88 3,16.5V7.5C3,7.12 3.21,6.79 3.53,6.62L11.43,2.18C11.59,2.06 11.79,2 12,2C12.21,2 12.41,2.06 12.57,2.18L20.47,6.62C20.79,6.79 21,7.12 21,7.5V16.5M12,4.15L5,8.09V15.91L12,19.85L19,15.91V8.09L12,4.15Z', //mdiArrowRightBoldHexagonOutline（顯示選單）
}
function iconBtn(page, path) {
    return page.locator(`div[role="button"]:has(svg path[d="${path}"])`)
}
const SEL_DRAWER_PANEL = '[ev-stable]'                   //WDrawer 平移面板 divDrawer（帶 v-domstable 之 ev-stable 屬性；展開時 x=0 寬 200、收合後 display:none）
const SEL_STA_TITLE = 'div[style*="font-size: 1.5rem"]'  //統計頁標題「統計資訊」（LayoutContentStaInfor.vue:19；Vue 2 會把靜態 style 正規化成含空白之 `font-size: 1.5rem`）

//等導覽區收合／展開落定——採「使用者可觀察之幾何」：目標圓鈕已出現 + 面板與內容區 rect 連續 3 次取樣不變。
//不用 WDrawer 根節點 [state]（hidden/opened）：實測（tmp/probe-state.mjs, 2026-09-14）同頁先 page.screenshot 再收合時，
//v-domstable（wsemi domIsStable：getAnimations().finished + rect 比對）會停在未穩定、[state] 卡在 hiding/opening 直到
//WDrawer 之 200s 兜底逾時，視覺早已落定；屬截圖手段造成之測試端現象，非產品缺陷（記於 CLAUDE_experience.md）。
async function waitDrawerSettled(page, collapsed) {
    await iconBtn(page, collapsed ? MDI.show : MDI.hide).first().waitFor({ state: 'visible', timeout: 15000 })
    const snap = () => page.evaluate((sel) => {
        const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)] }
        const panel = document.querySelector(sel)
        const content = document.querySelector('canvas') || document.querySelector('.ag-root-wrapper')
        return JSON.stringify({ panel: r(panel), panelDisp: panel ? getComputedStyle(panel).display : null, content: r(content) })
    }, SEL_DRAWER_PANEL)
    const t0 = Date.now()
    let last = null; let same = 0
    while (Date.now() - t0 < 15000) {
        const cur = await snap()
        const o = JSON.parse(cur)
        const atRest = collapsed ? (o.panelDisp === 'none' || (o.panel && o.panel[2] === 0)) : (o.panel && o.panel[0] === 0 && o.panel[2] > 0 && o.panelDisp !== 'none')
        if (atRest && cur === last) { if (++same >= 3) { await page.waitForTimeout(300); return } }
        else { same = 0; last = cur }
        await page.waitForTimeout(200)
    }
    throw new Error(`導覽區${collapsed ? '收合' : '展開'}未於 15s 內落定（last=${last}）`)
}
async function clickHide(page) {
    await iconBtn(page, MDI.hide).first().click()
    await waitDrawerSettled(page, true)
}
async function clickShow(page) {
    await iconBtn(page, MDI.show).first().click()
    await waitDrawerSettled(page, false)
}

//導航至指定頁籤（user-facing：點左側導覽項）；統計頁等圖表 canvas（mock 後端確定有資料），資料頁等 ag-grid 列。
async function gotoPage(page, key) {
    const label = await page.evaluate((k) => window.$vo.$t(k), key)
    await page.getByText(label, { exact: true }).first().click()
    if (key === 'mmStaInfor') {
        await waitUntilExist(page, '統計事件圖表 canvas', () => document.querySelector('canvas') !== null, { timeout: 30000 })
        await page.waitForTimeout(7000) //echarts 初始化 + resize debounce settle（對齊 e2e-stainfor gotoStaInfor）
    }
    else {
        await waitUntilExist(page, `${key} ag-grid 列`, () => document.querySelectorAll('.ag-row').length > 0, { timeout: 20000 })
        await page.waitForTimeout(800)
    }
    return label
}

//頁面標題左緣：內容區內「文字恰為頁籤名、字級最大」之葉節點（排除導覽區同名項；spec 備註）。
async function titleLeft(page, label) {
    return await page.evaluate((lb) => {
        const cands = Array.from(document.querySelectorAll('div')).filter((e) => (e.textContent || '').trim() === lb && e.children.length === 0)
        let best = null; let bestFs = 0
        for (const e of cands) {
            const fs = parseFloat(getComputedStyle(e).fontSize)
            if (fs > bestFs) { bestFs = fs; best = e }
        }
        return best ? Math.round(best.getBoundingClientRect().left) : null
    }, label)
}
//「顯示選單」圓鈕右緣（收合態才存在）
async function showBtnRight(page) {
    const bb = await iconBtn(page, MDI.show).first().boundingBox()
    return bb ? Math.round(bb.x + bb.width) : null
}

//case 定義：run(page,lang) 走流程並回傳多階段截圖 [{name,buf}]；mocha 模式再加 semantic 語意斷言。
const CASES = [
    {
        //E2E-001：統計頁點「隱藏選單」→ 導覽收合、標題讓位於「顯示選單」圓鈕（spec E2E-001）。
        name: 'E2E-001-hide-menu',
        settings: { staEventMock: true },
        run: async (page) => {
            await gotoPage(page, 'mmStaInfor')
            const s1 = await captureStableWithBox(page, iconBtn(page, MDI.hide)) //E2E-001-1-click-hide：點擊前框住「隱藏選單」整顆圓鈕
            await clickHide(page)
            const s2 = await captureStableWithBox(page, SEL_STA_TITLE) //E2E-001-2-hidden：收合後框住統計頁標題整行（其左側為「顯示選單」圓鈕，不重疊）
            return [
                { name: 'E2E-001-1-click-hide', buf: s1 },
                { name: 'E2E-001-2-hidden', buf: s2 },
            ]
        },
        semantic: async (page) => {
            //spec 語意 1：「顯示選單」存在、「隱藏選單」消失；統計頁標題左緣 ≥ 圓鈕右緣
            assert.equal(await iconBtn(page, MDI.show).count(), 1, '收合後應有「顯示選單」圓鈕')
            assert.equal(await iconBtn(page, MDI.hide).count(), 0, '收合後不應有「隱藏選單」圓鈕')
            const staLabel = await page.evaluate(() => window.$vo.$t('mmStaInfor'))
            const btnR = await showBtnRight(page)
            const staL = await titleLeft(page, staLabel)
            assert.ok(btnR !== null && staL !== null, `應量得圓鈕右緣（${btnR}）與統計頁標題左緣（${staL}）`)
            assert.ok(staL >= btnR, `統計頁標題左緣（${staL}）應 ≥「顯示選單」圓鈕右緣（${btnR}），不得重疊`)
            //spec 語意 2：其餘四頁逐頁「顯示 → 點頁籤 → 隱藏」後量測，標題左緣 ≥ 圓鈕右緣
            for (const key of PAGE_KEYS.slice(1)) {
                await clickShow(page)
                const label = await gotoPage(page, key)
                await clickHide(page)
                const r = await showBtnRight(page)
                const l = await titleLeft(page, label)
                assert.ok(r !== null && l !== null, `${key} 應量得圓鈕右緣（${r}）與標題左緣（${l}）`)
                assert.ok(l >= r, `${key} 標題左緣（${l}）應 ≥「顯示選單」圓鈕右緣（${r}），不得重疊`)
            }
        },
    },
    {
        //E2E-002：收合後點「顯示選單」→ 導覽展開、五頁籤列出、標題回位（spec E2E-002）。
        name: 'E2E-002-show-menu',
        settings: { staEventMock: true },
        run: async (page) => {
            await gotoPage(page, 'mmStaInfor')
            await clickHide(page)
            const s1 = await captureStableWithBox(page, iconBtn(page, MDI.show)) //E2E-002-1-click-show：點擊前框住「顯示選單」整顆圓鈕
            await clickShow(page)
            const s2 = await captureStableWithBox(page, SEL_DRAWER_PANEL) //E2E-002-2-shown：展開後框住整個左側導覽區面板（含五頁籤）
            return [
                { name: 'E2E-002-1-click-show', buf: s1 },
                { name: 'E2E-002-2-shown', buf: s2 },
            ]
        },
        semantic: async (page) => {
            //spec 語意：導覽面板可見且貼齊左緣（x=0、寬 200）；「隱藏選單」存在、「顯示選單」消失；五頁籤文字皆在；統計頁標題左緣回到 230（1440×900 實測）
            const panel = await page.evaluate((sel) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.left), w: Math.round(b.width), disp: getComputedStyle(e).display } }, SEL_DRAWER_PANEL)
            assert.ok(panel && panel.disp !== 'none' && panel.x === 0 && panel.w === 200, `導覽面板應可見且 x=0 寬 200（實得 ${JSON.stringify(panel)}）`)
            assert.equal(await iconBtn(page, MDI.hide).count(), 1, '展開後應有「隱藏選單」圓鈕')
            assert.equal(await iconBtn(page, MDI.show).count(), 0, '展開後不應有「顯示選單」圓鈕')
            const labels = await page.evaluate((ks) => ks.map((k) => window.$vo.$t(k)), PAGE_KEYS)
            const txt = await page.evaluate(() => document.body.innerText)
            for (const lb of labels) assert.ok(txt.includes(lb), `導覽區應列出頁籤「${lb}」`)
            const staL = await titleLeft(page, labels[0])
            assert.equal(staL, 230, `統計頁標題左緣應回到 230（實得 ${staL}）`)
        },
    },
]

//手術式重產：--names a,b 只產指定 case（前綴匹配）；--langs eng,cht 只產指定語系。截圖前 gate。
function argList(flag) {
    const i = process.argv.indexOf(flag)
    if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1].split(',').map((s) => s.trim()).filter(Boolean)
    return null
}
function nameMatch(list, caseName) { return list.some((nm) => caseName === nm || caseName.startsWith(nm)) }
async function generateBaseline() {
    console.log('=== 產製 layout baseline 開始 ===')
    const onlyNames = argList('--names')
    const onlyLangs = argList('--langs')
    await startServersOnce()
    fs.mkdirSync(PICS_DIR, { recursive: true })
    process.env.E2E_STRICT_CAPTURE = '1' //regen 端：captureStable 未 settle 即 throw
    for (const lang of LANGS) {
        if (onlyLangs && !nameMatch(onlyLangs, lang)) continue
        for (const c of CASES) {
            if (onlyNames && !nameMatch(onlyNames, c.name)) continue
            const browser = await launchBrowser() //per-case fresh browser（對齊其他 perm e2e）
            if (c.settings) await restartBackend(genTempSettings(c.settings))
            try {
                const page = await openApp(browser)
                await setLang(page, lang)
                const shots = await c.run(page, lang)
                for (const s of shots) {
                    fs.writeFileSync(picPath(lang, s.name), s.buf)
                    console.log('wrote', picPath(lang, s.name), s.buf.length, 'bytes')
                }
            }
            finally {
                await browser.close()
                if (c.settings) await restartBackend('./settings.json')
            }
        }
    }
    cleanup()
    console.log('=== 產製 layout baseline 完成 ===')
}

if (isBaseline) {
    generateBaseline().catch(async (err) => { console.log('baseline 例外', err); try { await restartBackend('./settings.json') } catch (e) {} ; cleanup(); process.exit(1) })
}
else {
    for (const lang of LANGS) {
        describe(`e2e-layout (${lang})`, function() {
            this.timeout(240000)
            let browser = null
            before(async function() {
                this.timeout(200000)
                await startServersOnce()
            })
            beforeEach(async function() {
                this.timeout(90000)
                browser = await launchBrowser()
            })
            afterEach(async function() { if (browser) { await browser.close(); browser = null } })
            for (const c of CASES) {
                it(c.name, async function() {
                    if (c.settings) { this.timeout(300000); await restartBackend(genTempSettings(c.settings)) }
                    try {
                        const page = await openApp(browser)
                        await setLang(page, lang)
                        const shots = await c.run(page, lang)
                        if (c.semantic) await c.semantic(page)
                        for (const s of shots) {
                            assertBaselineMatch(s.buf, picPath(lang, s.name), `layout-${lang}-${s.name}`)
                        }
                    }
                    finally {
                        if (c.settings) await restartBackend('./settings.json')
                    }
                })
            }
        })
    }
}
