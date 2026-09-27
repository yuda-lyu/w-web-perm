//後台導覽版面 e2e（導覽區收合／恢復與各頁標題讓位）。對應 spec/流程_後台導覽版面.md。
//雙模式：
//  - 產 baseline：node test/e2e-layout.test.mjs --baseline [--names E2E-001,...] [--langs eng,cht]（寫 test/pics/layout/）
//  - 驗證（mocha）：npx mocha test/e2e-layout.test.mjs --reporter list --timeout 300000（pixelmatch 反鋸齒感知 + maxDiffPixels 容差比對，非 byte-exact）
//act 走 user-facing input（真點「隱藏選單」／「顯示選單」圓鈕、真點頁籤）；assert = 語意斷言（幾何：標題左緣 ≥ 圓鈕右緣）+ pixel baseline。
//統計頁為預設頁且圖表隨 log 變動 → 每 case 以 settings:{ staEventMock:true } 換後端（同 e2e-stainfor / e2e-users E2E-012 之 c.settings 管線）。
import fs from 'fs'
import assert from 'assert'
import { startServersOnce, cleanup, launchBrowser, openApp, captureStableWithBox, waitUntilExist, assertBaselineMatch, restartBackend, genTempSettings, clickNavItem, SEL_NAV, navBtn, waitNavSettled, waitStaLegendSettled, assertStaLegendLayout } from './tools/e2e-setup.mjs'

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

//—— 「隱藏選單」／「顯示選單」圓鈕定位（navBtn，以 mdi path）與收合／展開落定等待（waitNavSettled，使用者可觀察之幾何）見 e2e-setup ——
const SEL_DRAWER_PANEL = SEL_NAV //WDrawer 平移面板 divDrawer（帶 v-domstable 之 ev-stable 屬性；展開時 x=0 寬 200、收合後 display:none）
const SEL_STA_TITLE = 'div[style*="font-size: 1.5rem"]'  //統計頁標題「統計資訊」（LayoutContentStaInfor.vue:19；Vue 2 會把靜態 style 正規化成含空白之 `font-size: 1.5rem`）

async function clickHide(page) {
    await navBtn(page, 'hide').first().click()
    await waitNavSettled(page, true)
}
async function clickShow(page) {
    await navBtn(page, 'show').first().click()
    await waitNavSettled(page, false)
}

//導航至指定頁籤（user-facing：點左側導覽項）；統計頁等圖表 canvas（mock 後端確定有資料），資料頁等 ag-grid 列。
async function gotoPage(page, key) {
    const label = await page.evaluate((k) => window.$vo.$t(k), key)
    await clickNavItem(page, label) //限定導覽面板內（見 e2e-setup clickNavItem 註解）；本檔呼叫時導覽皆為展開態
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
    const bb = await navBtn(page, 'show').first().boundingBox()
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
            const s1 = await captureStableWithBox(page, navBtn(page, 'hide')) //E2E-001-1-click-hide：點擊前框住「隱藏選單」整顆圓鈕
            await clickHide(page)
            const s2 = await captureStableWithBox(page, SEL_STA_TITLE) //E2E-001-2-hidden：收合後框住統計頁標題整行（其左側為「顯示選單」圓鈕，不重疊）
            return [
                { name: 'E2E-001-1-click-hide', buf: s1 },
                { name: 'E2E-001-2-hidden', buf: s2 },
            ]
        },
        semantic: async (page) => {
            //spec 語意 1：「顯示選單」存在、「隱藏選單」消失；統計頁標題左緣 ≥ 圓鈕右緣
            assert.equal(await navBtn(page, 'show').count(), 1, '收合後應有「顯示選單」圓鈕')
            assert.equal(await navBtn(page, 'hide').count(), 0, '收合後不應有「隱藏選單」圓鈕')
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
            const s1 = await captureStableWithBox(page, navBtn(page, 'show')) //E2E-002-1-click-show：點擊前框住「顯示選單」整顆圓鈕
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
            assert.equal(await navBtn(page, 'hide').count(), 1, '展開後應有「隱藏選單」圓鈕')
            assert.equal(await navBtn(page, 'show').count(), 0, '展開後不應有「顯示選單」圓鈕')
            const labels = await page.evaluate((ks) => ks.map((k) => window.$vo.$t(k)), PAGE_KEYS)
            const txt = await page.evaluate(() => document.body.innerText)
            for (const lb of labels) assert.ok(txt.includes(lb), `導覽區應列出頁籤「${lb}」`)
            const staL = await titleLeft(page, labels[0])
            assert.equal(staL, 230, `統計頁標題左緣應回到 230（實得 ${staL}）`)
        },
    },
    {
        //E2E-003：視窗縮為 400 → 導覽自動收合；拉回 1440 → 導覽自動展開並恢復並排（spec E2E-003）。
        //6 步真實路徑：①登入停在統計頁 ②等導覽展開落定 ③縮窄視窗（使用者拖視窗邊界；無 DOM 點擊目標，以 setViewportSize 模擬）
        //  ④導覽收合、「顯示選單」圓鈕出現 ⑤拉寬視窗 ⑥導覽展開並排、標題回位、無灰色遮罩；不寫入任何資料
        //語意斷言放在 run() 內：兩個寬度下之狀態皆為過程中之觀察，且 regen 端只跑 run()，寫檔前即守門
        //（修復前拉回後導覽區浮在內容上並覆蓋遮罩、標題左緣 30，此處即紅；修復見 LayoutContent.vue autoSwitchToFix）。
        //統計頁事件圖隨內容區改寬：縮窄後圖例改單列捲動式、拉回後恢復一般式，兩處皆驗圖寬＝容器寬且圖例不壓最上方刻度
        //（2026-09-24 前 400 寬時一般式圖例 3 列壓到刻度，見 spec/流程_統計資訊事件展示.md〈已知落差〉）。
        name: 'E2E-003-resize-narrow-wide',
        settings: { staEventMock: true },
        run: async (page) => {
            await gotoPage(page, 'mmStaInfor')
            await waitNavSettled(page, false) //縮窄前先等展開落定：元件庫於導覽區掛載後約 250ms 內之收合會被掛載展開覆蓋（spec〈已知落差〉）
            const staLabel = await page.evaluate(() => window.$vo.$t('mmStaInfor'))
            assert.equal(await titleLeft(page, staLabel), 230, '縮窄前統計頁標題左緣應為 230（導覽區並排）')

            //③縮窄：無點擊目標故無點擊前之圖
            await page.setViewportSize({ width: 400, height: 900 })
            await waitNavSettled(page, true)
            //spec E2E-003 驗證 1：「顯示選單」存在、「隱藏選單」消失；統計頁標題左緣 ≥ 圓鈕右緣
            assert.equal(await navBtn(page, 'show').count(), 1, '縮窄後應有「顯示選單」圓鈕')
            assert.equal(await navBtn(page, 'hide').count(), 0, '縮窄後不應有「隱藏選單」圓鈕')
            const btnR = await showBtnRight(page)
            const l1 = await titleLeft(page, staLabel)
            assert.ok(btnR !== null && l1 !== null && l1 >= btnR, `縮窄後統計頁標題左緣（${l1}）應 ≥「顯示選單」圓鈕右緣（${btnR}）`)
            //spec E2E-003 驗證 1（事件圖）：圖寬＝容器寬；圖例改單列捲動式並留在圖頂、不壓最上方刻度
            const lg1 = await waitStaLegendSettled(page)
            assertStaLegendLayout(lg1, '縮窄後事件圖')
            assert.equal(lg1.type, 'scroll', `縮窄後（圖寬 ${lg1.chartW}）事件圖例應為捲動式`)
            const s1 = await captureStableWithBox(page, SEL_STA_TITLE) //E2E-003-1-narrowed：縮為 400 後框住統計頁標題「統計資訊」整行（其左側為「顯示選單」圓鈕）

            //⑤拉寬
            await page.setViewportSize({ width: 1440, height: 900 })
            await waitNavSettled(page, false)
            //spec E2E-003 驗證 2：導覽面板 x=0 寬 200；「隱藏選單」存在、「顯示選單」消失；標題回到 230；標題位置之最上層元素為標題本身（未被遮罩覆蓋）
            const panel = await page.evaluate((sel) => {
                const e = document.querySelector(sel)
                if (!e) return null
                const b = e.getBoundingClientRect()
                return { x: Math.round(b.left), w: Math.round(b.width), disp: getComputedStyle(e).display }
            }, SEL_DRAWER_PANEL)
            assert.ok(panel && panel.disp !== 'none' && panel.x === 0 && panel.w === 200, `拉回後導覽面板應可見且 x=0 寬 200（實得 ${JSON.stringify(panel)}）`)
            assert.equal(await navBtn(page, 'hide').count(), 1, '拉回後應有「隱藏選單」圓鈕')
            assert.equal(await navBtn(page, 'show').count(), 0, '拉回後不應有「顯示選單」圓鈕')
            const l2 = await titleLeft(page, staLabel)
            assert.equal(l2, 230, `拉回後統計頁標題左緣應回到 230（實得 ${l2}；導覽區若浮在內容上則為 30）`)
            const onTop = await page.evaluate((sel) => {
                const t = document.querySelector(sel)
                if (!t) return null
                const b = t.getBoundingClientRect()
                const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)
                return !!hit && (hit === t || t.contains(hit))
            }, SEL_STA_TITLE)
            assert.equal(onTop, true, '拉回後統計頁標題應為其位置之最上層元素（未被灰色遮罩覆蓋）')
            //spec E2E-003 驗證 2（事件圖）：圖寬＝容器寬；圖例恢復一般式、留在圖頂、不壓最上方刻度
            const lg2 = await waitStaLegendSettled(page)
            assertStaLegendLayout(lg2, '拉回後事件圖')
            assert.equal(lg2.type, 'plain', `拉回後（圖寬 ${lg2.chartW}）事件圖例應恢復一般式`)
            const s2 = await captureStableWithBox(page, SEL_DRAWER_PANEL) //E2E-003-2-widened：拉回 1440 後框住整個左側導覽區面板含五個頁籤
            return [
                { name: 'E2E-003-1-narrowed', buf: s1 },
                { name: 'E2E-003-2-widened', buf: s2 },
            ]
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
