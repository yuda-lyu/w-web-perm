//後台導覽版面 e2e（導覽區收合／恢復與各頁標題讓位）。對應 spec/流程_後台導覽版面.md。
//雙模式：
//  - 產 baseline：node test/e2e-layout.test.mjs --baseline [--names <項,...>] [--langs eng,cht] [--write-mode missing|changed]（寫 test/pics/layout/）
//  - 驗證（mocha）：npx mocha test/e2e-layout.test.mjs --reporter list --timeout 300000（pixelmatch 反鋸齒感知 + maxDiffPixels 容差比對，非 byte-exact）
//  手術式重產（截圖前篩選 createBaselineGate，規格見 test/tools/e2eLib.mjs 所指之 w-package-tools-e2e 之 README.md §2.2）：
//    --names 每項可帶語系前綴（eng-/cht-），不帶則兩語系皆產；階段圖鍵（如 E2E-001-2-hidden）只寫該張，
//    案例鍵或其編號前綴（如 E2E-001-hide-menu、E2E-001）寫該案全部階段；不符任何鍵即報錯並列出可用鍵（於啟動服務之前）；
//    --langs 須完全等於已宣告語系（eng / cht）；--write-mode missing 只寫缺少者、changed 只寫與現行標準圖差異超過容差者（預設全寫）；
//    env E2E_BASELINE_OUT_DIR=<dir> 寫到暫存目錄（等價驗證用，不動 test/pics）。
//  產製端與比對端呼叫同一案例管線（runBaselineCase）：以案例設定重啟後端 → fresh browser → openApp → setLang → 流程與截圖
//    → 語意斷言（兩端皆於寫檔／比對前執行，不過即一張都不寫）→ 寫檔／比對 → 關瀏覽器 → 以 ./settings.json 還原後端。
//act 走 user-facing input（真點「隱藏選單」／「顯示選單」圓鈕、真點頁籤）；assert = 語意斷言（幾何：標題左緣 ≥ 圓鈕右緣）+ pixel baseline。
//統計頁為預設頁且圖表隨 log 變動 → 每 case 以 settings:{ staEventMock:true } 換後端（同 e2e-stainfor / e2e-users E2E-012 之 c.settings 管線）。
import fs from 'fs'
import assert from 'assert'
import { startServersOnce, cleanup, launchBrowser, openApp, setLang, captureStableWithBox, waitUntilExist, assertBaselineMatch, restartBackend, genTempSettings, clickNavItem, SEL_NAV, navBtn, waitNavSettled, waitStaLegendSettled, assertStaLegendLayout } from './tools/e2e-setup.mjs'
import { runBaselineCase, createBaselineGate } from './tools/e2eLib.mjs'

const PICS_DIR = './test/pics/layout'
const LANGS = ['eng', 'cht']
const isBaseline = process.argv.includes('--baseline')
const PAGE_KEYS = ['mmStaInfor', 'mmTargets', 'mmPemis', 'mmGrups', 'mmUsers']

function picPath(lang, name) { return `${PICS_DIR}/layout-${lang}-${name}.png` }

//設定語系 setLang（test setup 層，非 act-under-test；eng 不切但補等量 settle）取自 e2e-setup（原本檔內版本與之逐字相同，已收斂）。

//—— 「隱藏選單」／「顯示選單」圓鈕定位（navBtn，以 mdi path）與收合／展開落定等待（waitNavSettled，使用者可觀察之幾何）見 e2e-setup ——
const SEL_DRAWER_PANEL = SEL_NAV //WDrawer 平移面板 divDrawer（帶 v-domstable 之 ev-stable 屬性；展開時 x=0 寬 200、收合後 display:none）
const SEL_STA_TITLE = 'div[style*="font-size: 1.5rem"]'  //統計頁標題「統計資訊」（LayoutContentStaInfor.vue:19；Vue 2 會把靜態 style 正規化成含空白之 `font-size: 1.5rem`）
//導覽區收合 / 縮窄後「因此擴滿之內容區」（技能 §7.2 收合列：框整個內容區含頁面標題；不框反向操作之「顯示選單」圓鈕本身）：
//LayoutContent.vue 之 content slot 容器（inline style 含 position:relative、寬高隨版面），取含統計頁標題之最內層者。
//2026-09-28 改：原框統計頁標題列（block 撐滿整寬，標題右側約 1250px 空白一併框入，且非「擴滿之內容區」）
function contentArea(page) {
    return page.locator('div[style*="position: relative"]').filter({ has: page.locator(SEL_STA_TITLE) }).last()
}

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

//case 定義：run(page,lang) 走流程並回傳多階段截圖 [{name,buf}]；stages 為該案產出之全部圖鍵（與寫檔名、比對名一致，產出與宣告不符即報錯）；
//semantic 為截圖之後之語意斷言（產製端與比對端皆於寫檔／比對前執行）。順序＝mocha it 順序＝產製順序。
const CASES = [
    {
        //E2E-001：統計頁點「隱藏選單」→ 導覽收合、標題讓位於「顯示選單」圓鈕（spec E2E-001）。
        name: 'E2E-001-hide-menu',
        settings: { staEventMock: true },
        stages: ['E2E-001-1-click-hide', 'E2E-001-2-hidden'],
        run: async (page) => {
            await gotoPage(page, 'mmStaInfor')
            const s1 = await captureStableWithBox(page, navBtn(page, 'hide')) //E2E-001-1-click-hide：點擊前框住「隱藏選單」整顆圓鈕
            await clickHide(page)
            const s2 = await captureStableWithBox(page, contentArea(page)) //E2E-001-2-hidden：收合後框住因此擴滿至整寬之內容區（含統計頁標題；左上角為「顯示選單」圓鈕）
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
        stages: ['E2E-002-1-click-show', 'E2E-002-2-shown'],
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
        //語意斷言放在 run() 內：兩個寬度下之狀態皆為過程中之觀察（流程走完即不在畫面上），故於當下斷言；兩端皆在寫檔／比對前守門
        //（修復前拉回後導覽區浮在內容上並覆蓋遮罩、標題左緣 30，此處即紅；修復見 LayoutContent.vue autoSwitchToFix）。
        //統計頁事件圖隨內容區改寬：縮窄後圖例改單列捲動式、拉回後恢復一般式，兩處皆驗圖寬＝容器寬且圖例不壓最上方刻度
        //（2026-09-24 前 400 寬時一般式圖例 3 列壓到刻度，見 spec/流程_統計資訊事件展示.md〈已知落差〉）。
        name: 'E2E-003-resize-narrow-wide',
        settings: { staEventMock: true },
        stages: ['E2E-003-1-narrowed', 'E2E-003-2-widened'],
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
            const s1 = await captureStableWithBox(page, contentArea(page)) //E2E-003-1-narrowed：縮為 400 後導覽區自動收合, 框住擴滿至整寬之內容區（含統計頁標題；左上角為「顯示選單」圓鈕）

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

//單一案例管線（產製端與比對端共用）：prepare 以案例設定重啟後端（c.settings）→ fresh browser（每案 launch／close）→ openApp → setLang
//→ run（流程與多階段截圖）→ semantic（語意斷言）→ 寫檔／比對 → finally 關瀏覽器 → afterCase 以 ./settings.json 還原後端（同原兩端）
async function runCase(mode, lang, c, extra = {}) {
    return await runBaselineCase({
        mode,
        lang,
        name: c.name,
        run: c.run,
        stages: c.stages,
        launch: launchBrowser,
        openPage: async (browser) => {
            const page = await openApp(browser)
            await setLang(page, lang)
            return page
        },
        pathOf: picPath,
        labelOf: (lg, key) => `layout-${lg}-${key}`,
        match: assertBaselineMatch,
        prepare: async () => {
            if (c.settings) await restartBackend(genTempSettings(c.settings))
        },
        semantic: c.semantic ? (ctx) => c.semantic(ctx.page) : null,
        afterCase: async () => {
            if (c.settings) await restartBackend('./settings.json')
        },
        ...extra,
    })
}

//篩選（gate）通過、開始觸及服務後才設為 true；.catch 據此決定是否重啟後端還原。
//why：篩選報錯（如 --names 打錯）時尚未觸及任何服務，此時不得 restartBackend——無自建後端時它會殺 11006 之監聽者並另起後端（e2e-setup killForeignOnRestart）。
let servicesTouched = false

async function generateBaseline() {
    console.log('=== 產製 layout baseline 開始 ===')
    process.env.E2E_STRICT_CAPTURE = '1' //regen 端：captureStable 未 settle 即 throw
    //截圖前篩選（--names / --langs / --write-mode / E2E_BASELINE_OUT_DIR）；不符任何鍵即於此報錯（尚未啟動或重啟任何服務）
    const gate = createBaselineGate({ langs: LANGS, cases: CASES })
    console.log(gate.describe())
    servicesTouched = true
    await startServersOnce()
    fs.mkdirSync(PICS_DIR, { recursive: true })
    for (const lang of gate.langs) {
        for (const c of gate.casesFor(lang)) {
            console.log(`  ${lang}/${c.name}`)
            const r = await runCase('regen', lang, c, { gate })
            console.log(`  ✔ ${lang}/${c.name}（寫出 ${r.written.length} 張，略過 ${r.skipped.length}，保留 ${r.kept.length}）`)
        }
    }
    //--names 之任一項未產出即報錯（不靜默略過）
    gate.finalize()
    cleanup()
    console.log('=== 產製 layout baseline 完成 ===')
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
        describe(`e2e-layout (${lang})`, function() {
            this.timeout(240000)
            before(async function() {
                this.timeout(200000)
                await startServersOnce()
            })
            //per-case fresh browser、後端設定切換與還原、語意斷言（主）與像素比對（補）皆由 runCase 負責（與產製端同一管線）
            for (const c of CASES) {
                it(c.name, async function() {
                    if (c.settings) this.timeout(300000)
                    await runCase('compare', lang, c, { onKnownDefect: () => this.skip() }) //已知缺陷協定: 標 pending(提示框殘留已由 w-component-vue 2.5.24 修正, 其偵測改為直接失敗, 見 e2e-setup probeStuckTooltip)
                })
            }
        })
    }
}
