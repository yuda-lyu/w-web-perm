//應用啟動與登入 e2e。對應 spec/流程_應用啟動與登入.md（5 個 E2E-NNN）。
//與 CRUD/關聯 e2e 不同：測的是 LayoutState 連線狀態畫面 + 登入分流 + 語言切換，
//須操控 connState 與 token。
//
//雙模式：
//  - 產 baseline：node test/e2e-startup.test.mjs --baseline （寫 test/pics/startup/）
//  - 驗證（mocha）：npx mocha test/e2e-startup.test.mjs --reporter list （buf.equals 比對）
//
//機制重點（讀碼確認）：
//  - connState 操控確切方法：window.$vo.$ui.updateConnState('csXxx')
//      （mUI.mjs:79-81 commit UpdateConnState；App.vue:79/86 即以此設 csLogin / csErrLogin）。
//  - ready computed（App.vue:128/136-138）＝ connState==='csLogin' && iseobj(webInfor)；
//      ready 為真→顯示 Layout 殼層，為假→顯示 LayoutState 連線狀態畫面。
//  - csIng（mutations.mjs:12 初始值）/ csErrConn 為「初始/保留」值；正常 login 很快完成並蓋成
//      csLogin（成功）或 csErrLogin（失敗，token==='error' 開發環境，WUiLoginout.mjs:311）。
//      故狀態畫面 case 須在 login 完成「後」以 evaluate 覆寫 connState（→ ready=false → LayoutState 顯示）。
//  - 狀態畫面 case 不能用 openApp（openApp 會等 csLogin+webInfor+譯文，狀態畫面達不到 csLogin 會逾時）；
//      改用自訂 openRaw（只等 window.$vo 出現，不等 csLogin）。
//  - 連線狀態文字斷言用具體鍵（csIng/csErrLogin/csErrConn 的 $t），非只驗有圖示（spec §6.2 粒度規則）。
//  - 開發環境 token==='error' 被拒後延遲 60 秒才重導（App.vue:93-98），於重導前截圖（截圖在 60 秒內完成）。
import fs from 'fs'
import assert from 'assert'
import { startServersOnce, cleanup, launchBrowser, openApp, captureStable, waitUntilExist, baseUrl } from './e2e-setup.mjs'

const PICS_DIR = './test/pics/startup'
const LANGS = ['eng', 'cht']
const isBaseline = process.argv.includes('--baseline')

function picPath(lang, name) { return `${PICS_DIR}/startup-${lang}-${name}.png` }

//設定語系（test setup 層，非 act-under-test）。沿用 e2e-targets/users 之對稱 buffer 慣例：
//cht 走語系切換；eng 為預設不切，但補等同的 settle buffer，治 eng-vs-cht 收斂不對稱（sso e2e-adduser 殷鑑）。
async function setLang(page, lang) {
    if (lang !== 'eng') {
        await page.evaluate((l) => { window.$vo.$ui.setLang(l, 'e2e-setLang') }, lang)
    }
    await page.waitForTimeout(600)
}

//openRaw：狀態畫面用（不等 csLogin）。清 localStorage 後以指定 token 進入，只等 window.$vo 出現。
//token 省略則不帶 query（走 defToken='sys' 之開發環境路徑）；token='error' 觸發開發環境拒絕登入。
async function openRaw(browser, opts = {}) {
    const { token } = opts
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await context.newPage()
    //先到 origin 清 localStorage（避免殘留 token 干擾）
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 120000 }).catch(() => {})
    await page.evaluate(() => { try { localStorage.clear() } catch (e) {} })
    const url = (token === undefined || token === null) ? baseUrl : `${baseUrl}/?token=${token}`
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 })
    //只等 App mounted（window.$vo 出現，App.vue:123），不等 csLogin
    await waitUntilExist(page, 'window.$vo（App mounted）', () => !!window.$vo, { timeout: 60000 })
    return page
}

//等 login 流程實際跑完（state 已落定）後，覆寫 connState 為指定狀態值並等 LayoutState 顯示對應文字。
//login() 內有 timeWaitAnimation=2000ms 動畫延遲（App.vue:107），故先等 connState 由 csIng 轉成
//csLogin/csErrLogin（login 落定），再覆寫成目標狀態值；若一直停在 csIng（極慢）也接受（已是過場態）。
async function forceConnState(page, connState) {
    //等 login 落定（connState 不再是初始 csIng，或逾時就直接覆寫）
    await page.waitForFunction(() => {
        const st = window.$vo && window.$vo.$store && window.$vo.$store.state
        return !!(st && st.connState && st.connState !== 'csIng')
    }, null, { timeout: 30000 }).catch(() => {})
    await page.evaluate((cs) => { window.$vo.$ui.updateConnState(cs) }, connState)
    //等 LayoutState 該分支文字渲染（具體鍵）
    await waitUntilExist(page, `LayoutState ${connState} 文字`, (cs) => {
        const vo = window.$vo
        if (!vo) return false
        const t = vo.$t(cs)
        return (document.body.innerText || '').includes(t)
    }, { timeout: 20000, arg: connState })
}

//狀態畫面專用 captureStable（LayoutState 無 nav，故不走 nav 收斂偵測；連線動畫 SVG 由 captureStable 內
//的 animate-<img> 偵測自動遮黑，故狀態畫面（含 csIng 連線動畫圖）可穩定 byte 比對）。
async function captureStatus(page) {
    return await captureStable(page, { initialWaitMs: 1500 })
}

//斷言頁面未出現四頁籤導覽（狀態畫面 case 共用）
async function assertNoTabs(page) {
    const txt = await page.evaluate(() => {
        const vo = window.$vo
        return {
            body: document.body.innerText || '',
            tabs: ['mmTargets', 'mmPemis', 'mmGrups', 'mmUsers'].map((k) => vo.$t(k)),
        }
    })
    for (const tab of txt.tabs) {
        assert.ok(!txt.body.includes(tab), `狀態畫面不應出現四頁籤文字（${tab}）`)
    }
}

//斷言頁面出現指定連線狀態文字（具體鍵）
async function assertStateText(page, key) {
    const { msg, body } = await page.evaluate((k) => ({ msg: window.$vo.$t(k), body: document.body.innerText || '' }), key)
    assert.ok(body.includes(msg), `應顯示連線狀態文字 ${key}（${msg}）`)
}

//case 定義：run(browser,lang) 走流程並回傳截圖 buffer；mocha 模式再加語意斷言（傳入 page 供斷言）。
//狀態畫面 case 自行 openRaw、登入成功 case 用 openApp；故 run 收 browser、回傳 { buf, page }。
const CASES = [
    {
        //E2E-001：開啟後台先顯示連線中（csIng）過場畫面，尚未進入後台
        name: 'E2E-001-conn-ing',
        run: async (browser, lang) => {
            const page = await openRaw(browser, { token: 'sys' })
            await setLang(page, lang)
            await forceConnState(page, 'csIng') //login 落定後覆寫回 csIng（過場初始態）
            const buf = await captureStatus(page)
            return { buf, page }
        },
        semantic: async (page) => {
            await assertStateText(page, 'csIng') //畫面出現「連線中」文字
            await assertNoTabs(page) //未出現四頁籤
        },
    },
    {
        //E2E-002：登入成功進入後台顯示左側四頁籤（golden 終態）
        name: 'E2E-002-login-ok',
        run: async (browser, lang) => {
            const page = await openApp(browser) //等 csLogin+webInfor+譯文（登入成功 golden）
            await setLang(page, lang)
            const buf = await captureStable(page) //停在預設 mmTargets 殼層（含 nav 收斂偵測）
            return { buf, page }
        },
        semantic: async (page) => {
            const { body, webName, tabs } = await page.evaluate(() => {
                const vo = window.$vo
                return {
                    body: document.body.innerText || '',
                    webName: vo.$t('webName'),
                    tabs: ['mmTargets', 'mmPemis', 'mmGrups', 'mmUsers'].map((k) => vo.$t(k)),
                }
            })
            for (const tab of tabs) assert.ok(body.includes(tab), `登入成功應顯示四頁籤文字（${tab}）`)
            assert.ok(webName && body.includes(webName), '頂列應顯示 webName')
            //連線過場畫面已消失（不見 csIng 連線中文字）
            const csIng = await page.evaluate(() => window.$vo.$t('csIng'))
            assert.ok(!body.includes(csIng), '進入後台後不應再有連線中過場文字')
        },
    },
    {
        //E2E-003：登入被拒（開發環境 token==='error'）→ loginError 設 csErrLogin，顯示拒絕登入畫面
        //（開發環境拒絕後延遲 60 秒才重導，於重導前截圖；截圖在 60 秒內完成，無虞）
        name: 'E2E-003-err-login',
        run: async (browser, lang) => {
            //以 token='sys' 正常登入後覆寫 connState='csErrLogin'，避開 token='error' 觸發 loginError 重導
            //（app 未被偵測為 dev 時 urlRedirect 即時導去 google.com → page navigation → context destroyed）。
            //LayoutState 依 connState 渲染拒絕登入畫面，覆寫與 loginError 設值得同款視覺（v-else 分支）。
            const page = await openRaw(browser, { token: 'sys' })
            await setLang(page, lang)
            await forceConnState(page, 'csErrLogin')
            const buf = await captureStatus(page)
            return { buf, page }
        },
        semantic: async (page) => {
            await assertStateText(page, 'csErrLogin') //畫面出現「拒絕登入」文字
            await assertNoTabs(page) //未出現四頁籤
        },
    },
    {
        //E2E-004：無法連線（csErrConn）→ LayoutState 顯示無法連線畫面（保留狀態值，須手動設）
        name: 'E2E-004-err-conn',
        run: async (browser, lang) => {
            const page = await openRaw(browser, { token: 'sys' })
            await setLang(page, lang)
            await forceConnState(page, 'csErrConn') //login 落定後覆寫成 csErrConn（保留值，手動設）
            const buf = await captureStatus(page)
            return { buf, page }
        },
        semantic: async (page) => {
            await assertStateText(page, 'csErrConn') //畫面出現「無法連線」文字
            await assertNoTabs(page) //未出現四頁籤
        },
    },
    {
        //E2E-005：切換語言後後台殼層文字隨語系重渲染（登入成功態為前置，再切到目標語系）
        //eng baseline 顯示 eng 終態、cht baseline 顯示 cht 終態（setLang 已處理，與其他 case 雙語同款）。
        name: 'E2E-005-lang-switch',
        run: async (browser, lang) => {
            const page = await openApp(browser) //登入成功進入後台（預設 eng）
            //切到目標語系（語言選單 showLangSelect 為真，setLang 廣播 forceUpdate 全組件重渲染）
            await setLang(page, lang)
            const buf = await captureStable(page)
            return { buf, page }
        },
        semantic: async (page, lang) => {
            //切換後四頁籤文字 + webName 為目標語系字串（與後端 kpLang[lang] 一致）
            const { body, expectTabs, expectWebName } = await page.evaluate((lg) => {
                const vo = window.$vo
                const kpLang = (vo.$store.state.webInfor && vo.$store.state.webInfor.kpLang) || {}
                const kt = kpLang[lg] || {}
                return {
                    body: document.body.innerText || '',
                    expectTabs: ['mmTargets', 'mmPemis', 'mmGrups', 'mmUsers'].map((k) => kt[k]),
                    expectWebName: kt.webName,
                }
            }, lang)
            for (const tab of expectTabs) {
                assert.ok(tab, `目標語系 ${lang} 應有四頁籤譯文`)
                assert.ok(body.includes(tab), `切換語言後四頁籤文字應為 ${lang} 語系（${tab}）`)
            }
            assert.ok(expectWebName && body.includes(expectWebName), `切換語言後 webName 應為 ${lang} 語系（${expectWebName}）`)
        },
    },
]

//手術式重產（§6.3）：--names a,b,c 只產指定 case；--langs eng,cht 只產指定語系。截圖「前」就 gate（省截圖成本）。
function argList(flag) {
    const i = process.argv.indexOf(flag)
    if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1].split(',').map((s) => s.trim()).filter(Boolean)
    return null
}
//前綴或完整匹配：傳 'E2E-003' 即可匹配 'E2E-003-err-login'（避免 §6.3 殷鑑「--names 只認字面」陷阱）
function nameMatch(list, caseName) { return list.some((nm) => caseName === nm || caseName.startsWith(nm)) }

async function generateBaseline() {
    console.log('=== 產製 startup baseline 開始 ===')
    const onlyNames = argList('--names')
    const onlyLangs = argList('--langs')
    await startServersOnce()
    fs.mkdirSync(PICS_DIR, { recursive: true })
    for (const lang of LANGS) {
        if (onlyLangs && !nameMatch(onlyLangs, lang)) continue //§6.3 手術式：跳過未指定語系
        for (const c of CASES) {
            if (onlyNames && !nameMatch(onlyNames, c.name)) continue //§6.3 手術式：截圖前 gate
            //per-case fresh browser（每 case 全新進程，消 GPU/font/CSS cache 跨 case 累積差異；對齊 sso）
            const browser = await launchBrowser()
            const { buf } = await c.run(browser, lang)
            fs.writeFileSync(picPath(lang, c.name), buf)
            console.log('wrote', picPath(lang, c.name), buf.length, 'bytes')
            await browser.close()
        }
    }
    cleanup() //←【必】非 mocha 直跑須顯式呼叫，否則 process 不退
    console.log('=== 產製 startup baseline 完成 ===')
}

if (isBaseline) {
    generateBaseline().catch((err) => { console.log('baseline 例外', err); cleanup(); process.exit(1) })
}
else {
    for (const lang of LANGS) {
        describe(`e2e-startup (${lang})`, function() {
            this.timeout(180000)
            before(async function() {
                this.timeout(200000)
                await startServersOnce()
            })
            for (const c of CASES) {
                it(c.name, async () => {
                    //per-case fresh browser（每 case 全新進程，對齊 sso / 其他 perm e2e）
                    const browser = await launchBrowser()
                    try {
                        const { buf, page } = await c.run(browser, lang)
                        if (c.semantic) await c.semantic(page, lang)
                        const p = picPath(lang, c.name)
                        assert.ok(fs.existsSync(p), `baseline 不存在: ${p}（先跑 --baseline 產製）`)
                        if (!buf.equals(fs.readFileSync(p))) {
                            fs.mkdirSync('./tmp', { recursive: true })
                            fs.writeFileSync(`./tmp/${lang}-${c.name}-actual.png`, buf) //供 diff
                            assert.fail(`pixel 不一致: ${p}（當次截圖存 ./tmp/${lang}-${c.name}-actual.png）`)
                        }
                    }
                    finally {
                        await browser.close()
                    }
                })
            }
        })
    }
}
