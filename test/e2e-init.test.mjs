//
// E2E Init test — 初始畫面語系（server 注入, 非 UI 切換）。對應 spec/流程_應用啟動與登入.md。
//
// 驗證: settings.json 指定 language 後, 後端 serve 的 dist 連線中初始畫面即呈現該語系
// (window.___pmwperm___.language 由 WWebPerm 啟動時把 dist index.tmp 模板的 {language} 佔位符注入, WWebPerm.mjs:738).
//
// 與 e2e-startup 的差異（關鍵）: 連線前狀態畫面（csIng）的文字走 mUI fallback → getLang() → ___pmwperm___.language,
//   不吃 UI setLang（store.lang）。故其語系由「server 注入」決定, 須打後端 dist 才測得到, 非 UI 可切。
//
// 三個必守陷阱（對齊 SSO e2e-initlang）:
//   1. 打後端 dist（apiBaseUrl 11006）, 不是 dev server（8090 不做注入 → 永遠 eng）。
//   2. 必須有 dist/index.tmp 不可變模板（{language} 被取代後即消失）; 本檔 setup 由 dist/index.html 還原重建。
//   3. URL 不可帶 ?lang=（URL 語系優先序最高會蓋掉 server 注入值）。
//
// 使用方式:
//   1. 先 npm run build 產 dist。
//   2. 產標準圖: node test/e2e-init.test.mjs --baseline
//   3. 跑測試:   npx mocha test/e2e-init.test.mjs --timeout 120000 --reporter list （pixelmatch 反鋸齒感知 + maxDiffPixels 容差比對，非 byte-exact）
//
// 標準圖: test/pics/init/init-{lang}-{NNN-name}.png（同 SSO 命名）
//
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { chromium } from 'playwright'
import { cleanup, captureStableWithBox, apiBaseUrl, genTempSettings, restartBackend, assertBaselineMatch } from './e2e-setup.mjs'


const baselineDir = './test/pics/init'
const langs = ['eng', 'cht']
const isBaseline = process.argv.includes('--baseline')


//每語系: server 注入後各連線狀態畫面應呈現之文字（來自 mUI kpFallback, src/plugins/mUI.mjs, 非現狀指紋）
//  connecting=csIng / login=csLogin / errLogin=csErrLogin / errConn=csErrConn
const expectedText = {
    eng: { connecting: 'Connecting', login: 'Logged in', errLogin: 'Login denied', errConn: 'Unable to connect' },
    cht: { connecting: '連線中', login: '已登入', errLogin: '拒絕登入', errConn: '無法連線' },
}


function bp(lang, name) { return path.join(baselineDir, `init-${lang}-${name}.png`) }


//確保 dist/index.tmp 不可變模板存在: 由 dist/index.html 以正規式把已注入的 language 值還原為 {language} 佔位符。
//冪等 — 不論 dist/index.html 目前是 'eng' / 'cht' / '{language}' 皆還原成模板。（陷阱 2）
function ensureIndexTmpl() {
    const distHtml = './dist/index.html'
    const distTmp = './dist/index.tmp'
    if (!fs.existsSync(distHtml)) {
        throw new Error('dist/index.html 不存在 — 請先 npm run build 產 dist')
    }
    let c = fs.readFileSync(distHtml, 'utf8')
    c = c.replace(/language: '[^']*'/, "language: '{language}'")
    fs.writeFileSync(distTmp, c, 'utf8')
}


//E2E-001: 連線中畫面（csIng）。restartBackend 注入語系 → 打後端 dist → routeHang 攔 converhp 主連線（apiName='api'）
//使其懸而不答 → connState 卡 csIng → 穩定呈現「連線中」。spinner SVG 由 captureStable 之 animatedRects 自動填黑遮蔽。
async function captureConnecting(lang) {
    await restartBackend(genTempSettings({ language: lang }))
    const browser = await chromium.launch({ headless: true })
    try {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
        const page = await context.newPage()
        //攔全部 converhp /api 連線（apiName='api'）使其懸而不答 → 登入(token 驗證)永久懸置 → connState 卡 csIng。
        //（perm 無 token 時 loginError 會即時重導 urlRedirect, 故帶 ?token=sys 走 token 驗證路徑再懸置, 而非無 token 短路報錯重導）
        await page.route('**/api/**', (route) => {})
        await page.goto(`${apiBaseUrl}/?token=sys`, { waitUntil: 'domcontentloaded', timeout: 20000 })
        //等「連線中」文字渲染（connState 卡 csIng）
        await page.waitForFunction(
            (t) => (document.body.innerText || '').includes(t),
            expectedText[lang].connecting,
            { timeout: 15000 }
        )
        await page.mouse.move(0, 0)
        const info = await page.evaluate(() => ({
            winLang: (window.___pmwperm___ || {}).language,
            body: (document.body.innerText || '').replace(/\s+/g, ' '),
        }))
        //觀看區 = LayoutState 連線中內容（data-fmid="conn-state"）: spinner + 連線中文字
        const buf = await captureStableWithBox(page, '[data-fmid="conn-state"]')
        return { buf, info }
    }
    finally {
        await browser.close()
    }
}


//連線前 fallback 狀態畫面（errLogin / errConn）的共用 capture：機制同 captureConnecting，差在多一步 forceConnState。
//restartBackend 注入語系 → 打後端 dist → routeHang 攔 /api 使連線懸置（卡在連線前、無 webInfor）→ 等 window.$vo 出現
//  → updateConnState(connState) 強制落到目標狀態（e2e-startup 同款狀態畫面測法）→ 等該狀態文字渲染。
//此時 $t 走 mUI fallback → getLang() → ___pmwperm___.language（注入語系）, 故畫面文字 = 注入語系。無需 DB / 無需真連線。
async function captureConnState(lang, connState, expectKey) {
    await restartBackend(genTempSettings({ language: lang }))
    const browser = await chromium.launch({ headless: true })
    try {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
        const page = await context.newPage()
        //攔全部 /api 連線使連線懸置 → 卡在連線前（webInfor 未回填）→ $t 走 fallback（注入語系）。
        await page.route('**/api/**', (route) => {})
        await page.goto(`${apiBaseUrl}/?token=sys`, { waitUntil: 'domcontentloaded', timeout: 20000 })
        //等 App mounted（window.$vo 出現, App.vue:123），不等 csLogin
        await page.waitForFunction(() => !!window.$vo, null, { timeout: 60000 })
        //強制 connState 落到目標狀態（LayoutState 切到對應分支）
        await page.evaluate((cs) => { window.$vo.$ui.updateConnState(cs) }, connState)
        //等目標狀態文字渲染（fallback → 注入語系）
        await page.waitForFunction(
            (t) => (document.body.innerText || '').includes(t),
            expectedText[lang][expectKey],
            { timeout: 15000 }
        )
        await page.mouse.move(0, 0)
        const info = await page.evaluate(() => ({
            winLang: (window.___pmwperm___ || {}).language,
            body: (document.body.innerText || '').replace(/\s+/g, ' '),
        }))
        //觀看區 = LayoutState 狀態畫面內容（data-fmid="conn-state"）: 圖示 + 狀態文字
        const buf = await captureStableWithBox(page, '[data-fmid="conn-state"]')
        return { buf, info }
    }
    finally {
        await browser.close()
    }
}


//E2E-004: 拒絕登入畫面（csErrLogin）。連線懸置 → 強制 connState='csErrLogin' → 穩定呈現「拒絕登入」/「Login denied」。
async function captureErrLogin(lang) {
    return await captureConnState(lang, 'csErrLogin', 'errLogin')
}


//E2E-005: 無法連線畫面（csErrConn）。連線懸置 → 強制 connState='csErrConn' → 穩定呈現「無法連線」/「Unable to connect」。
async function captureErrConn(lang) {
    return await captureConnState(lang, 'csErrConn', 'errConn')
}


//E2E-002: 已登入過場畫面（csLogin LayoutState）。登入成功但 webInfor 尚未回填（ready=false）時，LayoutState 以連線動畫圖加
//「已登入」文字呈現之過場態（此態之後 webInfor 回填、ready 轉真才切到四頁籤殼層 E2E-003-login-ok）。
//連線懸置 → 強制 connState='csLogin'（webInfor 未回填 → ready=false → LayoutState csLogin 分支）→ 穩定呈現「已登入」/「Logged in」。
async function captureLoggedIn(lang) {
    return await captureConnState(lang, 'csLogin', 'login')
}


//E2E-003: 登入成功後台四頁籤（golden 終態）。語系亦為 server 注入：後端以指定 language 啟動 → dist 注入該語系，
//且後端 getWebInfor 回傳 webInfor.language=該語系（WWebPerm.mjs:236,319），main.js 登入後 setLang(null) 只重刷不覆蓋
//→ 殼層四頁籤 / webName 以注入語系渲染（較 dev server + 前端 setLang 更貼近 production）。
//機制：restartBackend 注入語系 → 打後端 dist + ?token=sys（不攔截，走真實登入）→ 等 connState='csLogin' + webInfor 回填
//（ready 為真，四頁籤殼層渲染）→ 截頂列。需 base seed 之 sys token（持久種子，與其他 e2e 同源）。
async function captureLoginOk(lang) {
    await restartBackend(genTempSettings({ language: lang }))
    const browser = await chromium.launch({ headless: true })
    try {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
        const page = await context.newPage()
        await page.goto(`${apiBaseUrl}/?token=sys`, { waitUntil: 'domcontentloaded', timeout: 20000 })
        //等真實登入完成（ready=真：connState=csLogin 且 webInfor 為非空物件 → 四頁籤殼層渲染）
        await page.waitForFunction(() => {
            const vo = window.$vo
            if (!vo) return false
            const st = vo.$store && vo.$store.state
            return !!(st && st.connState === 'csLogin' && st.webInfor && Object.keys(st.webInfor).length > 0)
        }, null, { timeout: 60000 })
        await page.waitForTimeout(600) //殼層 + 四頁籤譯文 settle
        await page.mouse.move(0, 0)
        const info = await page.evaluate(() => {
            const vo = window.$vo
            return {
                winLang: (window.___pmwperm___ || {}).language,
                body: (document.body.innerText || '').replace(/\s+/g, ' '),
                tabs: ['mmTargets', 'mmPemis', 'mmGrups', 'mmUsers'].map((k) => vo.$t(k)),
                webName: vo.$t('webName'),
                csIng: vo.$t('csIng'),
            }
        })
        //觀看區 = Layout 頂部工具列（webName + 語言選單），四頁籤之渲染由語意斷言驗
        const buf = await captureStableWithBox(page, '[data-fmid="app-topbar"]')
        return { buf, info }
    }
    finally {
        await browser.close()
    }
}


const cases = [
    { name: 'E2E-001-connecting-screen', capture: captureConnecting, kind: 'connState', key: 'connecting' },
    { name: 'E2E-002-logged-in-screen', capture: captureLoggedIn, kind: 'connState', key: 'login' },
    { name: 'E2E-003-login-ok', capture: captureLoginOk, kind: 'loginOk' },
    { name: 'E2E-004-err-login-screen', capture: captureErrLogin, kind: 'connState', key: 'errLogin' },
    { name: 'E2E-005-err-conn-screen', capture: captureErrConn, kind: 'connState', key: 'errConn' },
]


//連線狀態畫面語意斷言: 確認 server 注入語系 + 該狀態畫面呈現該語系文字, 且不含另一語系該狀態之對應文字。
//  key = 該 case 之狀態文字鍵（connecting / errLogin / errConn），各自比對對應的注入/另一語系文字。
function assertConnLang(lang, info, key) {
    const otherLang = lang === 'eng' ? 'cht' : 'eng'
    const want = expectedText[lang][key]
    const otherWant = expectedText[otherLang][key]
    assert.strictEqual(info.winLang, lang, `window.___pmwperm___.language 應=${lang}, 實際: ${info.winLang}`)
    assert.ok(info.body.includes(want), `${key} 畫面應含「${want}」, 實際: ${info.body.slice(0, 200)}`)
    assert.ok(!info.body.includes(otherWant), `${key} 畫面不應含另一語系「${otherWant}」`)
}


//登入成功語意斷言: 注入語系正確 + 四頁籤（以注入語系）與 webName 呈現 + 連線過場文字已消失。
function assertLoginOk(lang, info) {
    assert.strictEqual(info.winLang, lang, `window.___pmwperm___.language 應=${lang}, 實際: ${info.winLang}`)
    for (const tab of info.tabs) {
        assert.ok(tab && info.body.includes(tab), `登入成功應顯示四頁籤文字（${tab}）`)
    }
    assert.ok(info.webName && info.body.includes(info.webName), '頂列應顯示 webName')
    assert.ok(!info.body.includes(info.csIng), '進入後台後不應再有連線中過場文字')
}


//依 case kind 分派語意斷言
function assertCase(lang, info, c) {
    if (c.kind === 'loginOk') assertLoginOk(lang, info)
    else assertConnLang(lang, info, c.key)
}


async function generateBaseline() {
    if (!fs.existsSync(baselineDir)) {
        fs.mkdirSync(baselineDir, { recursive: true })
    }
    ensureIndexTmpl()
    for (const lang of langs) {
        for (const { name, capture } of cases) {
            const { buf } = await capture(lang)
            fs.writeFileSync(bp(lang, name), buf)
            console.log(`  wrote ${lang}/${name} (${buf.length} bytes)`)
        }
    }
    await restartBackend('./settings.json') //還原預設語系
    console.log('=== init 標準圖產生完成 ===')
    cleanup() //←【必】非 mocha 環境須顯式呼叫
}


if (isBaseline) {
    generateBaseline().catch((err) => { console.log('baseline 例外', err); cleanup(); process.exit(1) })
}
else {
    describe('Init E2E — 應用啟動畫面（server 注入語系）', function() {
        this.timeout(120000)

        before(function() {
            ensureIndexTmpl()
        })

        after(async function() {
            this.timeout(30000)
            await restartBackend('./settings.json') //還原預設語系給後續測試
        })

        for (const lang of langs) {
            for (const c of cases) {
                const { name, capture } = c
                it(`${name} [${lang}]: 設定語系=${lang} → 畫面呈現 ${lang}`, async function() {
                    const { buf, info } = await capture(lang)
                    assertCase(lang, info, c) //語意斷言（依 kind 分派）
                    assertBaselineMatch(buf, bp(lang, name), `init-${lang}-${name}`) //像素斷言
                })
            }
        }
    })
}
