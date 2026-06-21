//
// E2E InitLang test — 初始畫面語系（server 注入, 非 UI 切換）。對應 spec/流程_應用啟動與登入.md。
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
//   2. 產標準圖: node test/e2e-initlang.test.mjs --baseline
//   3. 跑測試:   npx mocha test/e2e-initlang.test.mjs --timeout 120000 --reporter list
//
// 標準圖: test/pics/initlang/initlang-{lang}-{NNN-name}.png（同 SSO 命名）
//
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { chromium } from 'playwright'
import { cleanup, captureStableWithBox, apiBaseUrl, genTempSettings, restartBackend, assertBaselineMatch } from './e2e-setup.mjs'


const baselineDir = './test/pics/initlang'
const langs = ['eng', 'cht']
const isBaseline = process.argv.includes('--baseline')


//每語系: server 注入後連線中畫面應呈現之文字（來自 mUI kpFallback.csIng, mUI.mjs:51-54, 非現狀指紋）
const expectedText = {
    eng: { connecting: 'Connecting' },
    cht: { connecting: '連線中' },
}


function bp(lang, name) { return path.join(baselineDir, `initlang-${lang}-${name}.png`) }


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


const cases = [
    { name: 'E2E-001-connecting-screen', capture: captureConnecting },
]


//語意斷言: 確認 server 注入語系 + 連線中畫面呈現該語系文字, 且不含另一語系
function assertLang(lang, info) {
    const other = expectedText[lang === 'eng' ? 'cht' : 'eng']
    assert.strictEqual(info.winLang, lang, `window.___pmwperm___.language 應=${lang}, 實際: ${info.winLang}`)
    assert.ok(info.body.includes(expectedText[lang].connecting), `連線中畫面應含「${expectedText[lang].connecting}」, 實際: ${info.body.slice(0, 200)}`)
    assert.ok(!info.body.includes(other.connecting), `連線中畫面不應含另一語系「${other.connecting}」`)
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
    console.log('=== initlang 標準圖產生完成 ===')
    cleanup() //←【必】非 mocha 環境須顯式呼叫
}


if (isBaseline) {
    generateBaseline().catch((err) => { console.log('baseline 例外', err); cleanup(); process.exit(1) })
}
else {
    describe('InitLang E2E — 初始畫面語系（server 注入）', function() {
        this.timeout(120000)

        before(function() {
            ensureIndexTmpl()
        })

        after(async function() {
            this.timeout(30000)
            await restartBackend('./settings.json') //還原預設語系給後續測試
        })

        for (const lang of langs) {
            for (const { name, capture } of cases) {
                it(`${name} [${lang}]: 設定語系=${lang} → 連線中畫面呈現 ${lang}`, async function() {
                    const { buf, info } = await capture(lang)
                    assertLang(lang, info) //語意斷言
                    assertBaselineMatch(buf, bp(lang, name), `initlang-${lang}-${name}`) //像素斷言
                })
            }
        }
    })
}
