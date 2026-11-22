//前端瀏覽器 console 不印資料值之使用者視角驗收(排程第 206 項; 規則帳本 R-CONSOLE-NOVAL-01 之前端站點; 靜態不變式見 unit-consoleNoValuesFront)
//E2E-CN-001: 真瀏覽器以系統管理者登入(?token=sys)並逐頁瀏覽統計、標的、權限、群組、使用者五頁, 收集瀏覽器 console 之全部訊息(含物件引數之內容),
//  斷言: ①登入成功之 console 為摘要 `login success (keys: …)`(只列鍵名); ②全部訊息不含基準種子之使用者資料(email、使用者 id、名稱); ③不含權杖參數.
//  修前: App.vue 印出 cloneDeep(data.user)——email、id、名稱、授權字串皆在 console.
//純語意斷言(無標準圖; 只收集 console, 不改畫面、不截圖、不寫資料庫).
//act 走 user-facing input(真點左側導覽); 起點為帶 token 之網址(與 openApp 同, 登入由 w-ui-loginout 自動完成).
//跑法: npx mocha test/e2e-consoleNoValues.test.mjs --reporter list --timeout 300000
import assert from 'assert'
import { startServersOnce, launchBrowser, appUrl, clickNavItem, waitUntilExist } from './tools/e2e-setup.mjs'

const A = assert.strict

//基準種子之使用者資料(g_initialTestData.mjs 之 users 表): 任何一筆出現在 console 即為印出使用者資料
const SEED_VALUES = ['admin@example.com', 'peter@example.com', 'mary@example.com', 'john@example.com', 'id-for-admin', 'id-for-peter', 'id-for-mary', 'id-for-john']

describe('e2e-consoleNoValues (前端 console 不印資料值, 排程第 206 項)', function() {
    this.timeout(240000)

    before(async function() {
        this.timeout(200000)
        await startServersOnce()
    })

    it('E2E-CN-001 登入並逐頁瀏覽後, 瀏覽器 console 只有摘要(鍵名、型別、筆數), 不含使用者資料與權杖', async function() {
        let browser = await launchBrowser()
        try {
            let context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
            let page = await context.newPage()
            //console 收集(含物件引數之內容: msg.text() 對物件只回 JSHandle@object, 須另取 jsonValue)
            let texts = []
            let pending = []
            page.on('console', (msg) => {
                pending.push((async () => {
                    let parts = [msg.text()]
                    for (let a of msg.args()) {
                        try {
                            parts.push(JSON.stringify(await a.jsonValue()))
                        }
                        catch (err) {
                            parts.push('(unserializable)')
                        }
                    }
                    texts.push(parts.join(' | '))
                })())
            })

            //①起點: 帶 token 之網址(登入由 w-ui-loginout 自動完成), 等登入與譯文就緒(同 openApp)
            await page.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 120000 })
            await page.waitForFunction(() => {
                const vo = window.$vo
                const st = vo && vo.$store && vo.$store.state
                return !!(st && st.connState === 'csLogin' && st.webInfor && st.syncState === true && vo.$t && vo.$t('mmUsers') !== 'mmUsers')
            }, null, { timeout: 60000 })

            //②逐頁瀏覽(真點導覽; 各頁 ag-grid 列出現即該頁已載入)
            for (let [key, what] of [['mmTargets', '標的'], ['mmPemis', '權限'], ['mmGrups', '群組'], ['mmUsers', '使用者']]) {
                let label = await page.evaluate((k) => window.$vo.$t(k), key)
                await clickNavItem(page, label)
                await waitUntilExist(page, `${what} ag-grid 列`, () => document.querySelectorAll('.ag-row').length > 0, { timeout: 20000 })
                await page.waitForTimeout(500)
            }
            let labelSta = await page.evaluate(() => window.$vo.$t('mmStaInfor'))
            await clickNavItem(page, labelSta)
            await waitUntilExist(page, '統計頁圖表 canvas', () => document.querySelector('canvas') !== null, { timeout: 30000 })
            await page.waitForTimeout(1500)
            await Promise.all(pending)

            //③斷言
            A.ok(texts.length > 0, '應收集到 console 訊息(至少登入流程之 login...／login success)')
            //登入成功之摘要(App.vue loginSuccess): 只列使用者物件之鍵名
            let ls = texts.filter((t) => t.startsWith('login success'))
            A.equal(ls.length, 1, `應恰有 1 則 login success, 實得 ${ls.length}: ${JSON.stringify(texts.slice(0, 5))}`)
            A.match(ls[0], /^login success \| "\(keys: [^)]*\)"$|^login success \(keys: [^)]*\)/, `login success 應為鍵名摘要, 實得 ${ls[0].slice(0, 200)}`)
            //全部訊息不含基準種子之使用者資料
            for (let t of texts) {
                for (let v of SEED_VALUES) {
                    A.ok(!t.includes(v), `console 訊息含使用者資料 ${v}: ${t.slice(0, 200)}`)
                }
                A.ok(!/token=/.test(t), `console 訊息含權杖參數: ${t.slice(0, 200)}`)
            }
        }
        finally {
            await browser.close()
        }
    })
})
