//真瀏覽器探測(perm-run01 本輪, 任務 20261025161334): sysFuncsPublic 收緊為 ['[sys:getFuncList]'] 後, 未登入／登入前各畫面與登入後是否照常。
//作法: 後端(11006, 現行原始碼)serve 重建後之 dist; headless Chromium(launchBrowser)走五種進站狀態, 擷取每個 /api/ 請求(解碼 w-converhp 封包: func、本體是否帶 __sysToken__、回應 success/error)與畫面連線狀態(store.connState)。
//  S0 無 token 進站(127.0.0.1, 非 localhost 不自動給 sys) / S1 帶已發 token(?token=sys) 進站, 登入後各頁籤與推播 / S2 一般使用者(部署方放行之非系統管理者)進站「無權進入」/ S3 無效 token 進站 / S4 舊前端建置檔(重建前之 dist)+ 升版後後端。
//  urlRedirect(https://www.google.com/)以 context.route 攔下回空頁, 不連外。
//用法: node spec/evidence/perm-run01-20261025/scripts/probe-browser.mjs [--out <json>] (以專案根為 cwd; 需測試鎖)
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import u8arr2obj from 'wsemi/src/u8arr2obj.mjs'
import { startServersOnce, cleanup, launchBrowser, apiBaseUrl } from '../../../../test/tools/e2e-setup.mjs'
import { callRpc, TOKEN_ADMIN, selectAllRows } from '../../../../test/tools/api-setup.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const projRoot = path.resolve(here, '..', '..', '..', '..')
const outIdx = process.argv.indexOf('--out')
const outFile = outIdx >= 0 ? process.argv[outIdx + 1] : path.join(here, '..', 'browser-probe.json')
const oldDistDir = path.join(projRoot, 'tmp', 'perm-run01', 'old-dist') //git archive HEAD dist 解出(重建前之前端建置檔)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const out = { when: new Date().toISOString(), apiBaseUrl, scenarios: {} }

//攔 /api/ 請求與回應: 解碼 w-converhp 封包
function attachTap(page, rec) {
    const byReq = new Map()
    page.on('request', (req) => {
        const url = req.url()
        if (!url.includes('/api/')) {
            return
        }
        const item = { t: Date.now() - rec.t0, method: req.method(), path: new URL(url).pathname, func: null, hasSysTokenKey: null, sysTokenIsString: null, auth: null, status: null, result: null }
        item.auth = (req.headers()['authorization'] || '').replace(/^(\w+)\s+.*$/, '$1 <token>') || null
        if (item.path === '/api/main' && req.method() === 'POST') {
            try {
                const o = u8arr2obj(new Uint8Array(req.postDataBuffer()))
                item.func = o && o.func
                const inp = o && o.input
                item.hasSysTokenKey = !!(inp && Object.prototype.hasOwnProperty.call(inp, '__sysToken__'))
                item.sysTokenIsString = item.hasSysTokenKey ? (typeof inp.__sysToken__ === 'string' && inp.__sysToken__ !== '') : null
                item.sysTokenSameAsHeader = item.hasSysTokenKey ? (inp.__sysToken__ === rec.token) : null
            }
            catch (e) {
                item.func = `decode-error:${e.message}`
            }
        }
        byReq.set(req, item)
        rec.api.push(item)
    })
    page.on('response', async (res) => {
        const item = byReq.get(res.request())
        if (!item) {
            return
        }
        item.status = res.status()
        if (item.path === '/api/main') {
            try {
                const o = u8arr2obj(new Uint8Array(await res.body()))
                if (o && typeof o === 'object' && 'error' in o) {
                    item.result = `error:${String(o.error).slice(0, 80)}`
                }
                else if (o && o.success && o.success.output && typeof o.success.output === 'object' && 'state' in o.success.output) {
                    item.result = o.success.output.state === 'success' ? 'success' : `error:${String(o.success.output.msg).slice(0, 80)}`
                }
                else if (o && o.success) {
                    item.result = 'success'
                }
                else {
                    item.result = `unknown:${JSON.stringify(o).slice(0, 80)}`
                }
            }
            catch (e) {
                item.result = `body-error:${e.message}`
            }
        }
    })
}

//summary: 依 func 彙整
function summarize(api) {
    const s = {}
    for (const it of api) {
        const k = it.path === '/api/main' ? `main:${it.func}` : `${it.method} ${it.path}`
        s[k] = s[k] || { n: 0, success: 0, error: 0, errors: {}, withSysTokenKey: 0, withTokenString: 0, tokenEqualsHeader: 0 }
        s[k].n++
        if (it.result === 'success') {
            s[k].success++
        }
        else if (it.result && it.result.startsWith('error')) {
            s[k].error++
            s[k].errors[it.result] = (s[k].errors[it.result] || 0) + 1
        }
        if (it.hasSysTokenKey) {
            s[k].withSysTokenKey++
        }
        if (it.sysTokenIsString) {
            s[k].withTokenString++
        }
        if (it.sysTokenSameAsHeader) {
            s[k].tokenEqualsHeader++
        }
    }
    return s
}

async function newPage(browser, rec, opts = {}) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    //urlRedirect: 攔下回空頁(不連外)
    rec.redirects = []
    await context.route('https://www.google.com/**', (route) => {
        rec.redirects.push(route.request().url())
        route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>stub redirect target</body></html>' })
    })
    if (opts.oldDist) {
        //舊前端建置檔: 以重建前之 app／chunk-vendors 內容取代現行 dist 同名請求(index.html 仍是現行的, 腳本內容為舊元件)
        const cur = fs.readdirSync(path.join(projRoot, 'dist', 'js')).filter((f) => /\.js$/.test(f))
        const old = fs.readdirSync(path.join(oldDistDir, 'dist', 'js')).filter((f) => /\.js$/.test(f))
        const pick = (arr, re) => arr.find((f) => re.test(f))
        const map = [[/^app\.[0-9a-f]+\.js$/, /^app\.[0-9a-f]+\.js$/], [/^chunk-vendors\.[0-9a-f]+\.js$/, /^chunk-vendors\.[0-9a-f]+\.js$/]]
        for (const [reCur, reOld] of map) {
            const fc = pick(cur, reCur)
            const fo = pick(old, reOld)
            rec.swapped = rec.swapped || []
            rec.swapped.push(`${fc} <- ${fo}`)
            const body = fs.readFileSync(path.join(oldDistDir, 'dist', 'js', fo))
            await context.route(`**/js/${fc}`, (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body }))
        }
    }
    const page = await context.newPage()
    rec.consoleErrors = []
    page.on('console', (m) => {
        if (m.type() === 'error') {
            rec.consoleErrors.push(m.text().slice(0, 200))
        }
    })
    page.on('pageerror', (e) => rec.consoleErrors.push(`pageerror:${String(e.message).slice(0, 200)}`))
    attachTap(page, rec)
    return { context, page }
}

const connStateOf = (page) => page.evaluate(() => (window.$vo && window.$vo.$store.state.connState) || null)
const bodyOf = (page) => page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 120))

async function main() {
    await startServersOnce({ backendOnly: true })
    const browser = await launchBrowser()
    try {
        //S0 無 token 進站
        {
            const rec = { t0: Date.now(), api: [], token: '' }
            const { context, page } = await newPage(browser, rec)
            await page.goto(`${apiBaseUrl}/`, { waitUntil: 'domcontentloaded', timeout: 20000 })
            //無 token: w-ui-loginout 無 token 可驗 → loginError → App.vue 即轉址 urlRedirect(非開發環境判定下立即; 開發環境判定下 60 秒後), 以 urlRedirect 被請求判定
            const t1 = Date.now()
            while (rec.redirects.length === 0 && Date.now() - t1 < 75000) {
                await sleep(300)
            }
            rec.redirectedToUrlRedirect = rec.redirects.length > 0
            rec.redirectAfterMs = Date.now() - t1
            await sleep(3000)
            await context.close()
            out.scenarios.S0_noToken = { redirectedToUrlRedirect: rec.redirectedToUrlRedirect, redirectAfterMs: rec.redirectAfterMs, apiSummary: summarize(rec.api), apiCount: rec.api.length, consoleErrors: rec.consoleErrors }
        }

        //S1 帶已發 token 進站(sys: 系統管理者), 登入後各頁籤與推播
        {
            const rec = { t0: Date.now(), api: [], token: 'sys' }
            const { context, page } = await newPage(browser, rec)
            await page.goto(`${apiBaseUrl}/?token=sys`, { waitUntil: 'domcontentloaded', timeout: 20000 })
            await page.waitForFunction(() => {
                const vo = window.$vo
                const st = vo && vo.$store && vo.$store.state
                return !!(st && st.connState === 'csLogin' && st.webInfor && Object.keys(st.webInfor).length > 0 && Array.isArray(st.users) && Array.isArray(st.grups) && Array.isArray(st.pemis) && Array.isArray(st.targets))
            }, null, { timeout: 60000 })
            rec.readyAtMs = Date.now() - rec.t0
            rec.tables = await page.evaluate(() => { const s = window.$vo.$store.state; return { users: s.users.length, grups: s.grups.length, pemis: s.pemis.length, targets: s.targets.length } })
            rec.bodyAfterReady = await bodyOf(page)
            //逐頁籤切換(殼層五頁籤文字: 取 $t 譯文後點選), 確認登入後各頁照常
            const tabs = await page.evaluate(() => ['mmStaInfor', 'mmTargets', 'mmPemis', 'mmGrups', 'mmUsers'].map((k) => window.$vo.$t(k)))
            rec.tabsVisited = []
            for (const t of tabs) {
                const loc = page.getByText(t, { exact: true }).first()
                await loc.click({ timeout: 10000 })
                await sleep(700)
                rec.tabsVisited.push({ tab: t, bodyHas: (await page.evaluate(() => document.body.innerText || '')).includes(t) })
            }
            //推播: 另一個用戶(API, 系統管理者)改 grups 第 1 列 description → 瀏覽器 store 於輪詢內收到
            const before = await selectAllRows('grups')
            const sorted = before.slice().sort((a, b) => (a.order || 0) - (b.order || 0)).map((r) => JSON.parse(JSON.stringify(r)))
            const marker = `probe-${Date.now()}`
            const edited = sorted.map((r, k) => (k === 0 ? { ...r, description: marker } : r))
            const w = await callRpc('updateGrups', [edited], TOKEN_ADMIN)
            rec.pushWriteOk = w.ok
            const tPush = Date.now()
            let got = false
            while (Date.now() - tPush < 20000) {
                got = await page.evaluate((m) => (window.$vo.$store.state.grups || []).some((g) => g.description === m), marker)
                if (got) {
                    break
                }
                await sleep(300)
            }
            rec.pushReceived = got
            rec.pushLatencyMs = got ? Date.now() - tPush : null
            //還原
            const back = await callRpc('updateGrups', [sorted], TOKEN_ADMIN)
            rec.pushRestoreOk = back.ok
            await sleep(4500)
            rec.connStateEnd = await connStateOf(page)
            await context.close()
            out.scenarios.S1_validToken = { readyAtMs: rec.readyAtMs, tables: rec.tables, bodyAfterReady: rec.bodyAfterReady, tabsVisited: rec.tabsVisited, pushWriteOk: rec.pushWriteOk, pushReceived: rec.pushReceived, pushLatencyMs: rec.pushLatencyMs, pushRestoreOk: rec.pushRestoreOk, connStateEnd: rec.connStateEnd, apiSummary: summarize(rec.api), consoleErrors: rec.consoleErrors }
        }

        //S2 一般使用者(部署方放行之非系統管理者): 「無權進入」
        {
            const users = (await selectAllRows('users')).slice().sort((a, b) => (a.order || 0) - (b.order || 0)).map((r) => JSON.parse(JSON.stringify(r)))
            const base = users
            const peter = users.find((u) => u.id === 'id-for-peter')
            const member = { id: 'id-for-member', order: 50, name: 'member', email: 'member@example.com', description: '', from: '', cgrups: peter.cgrups, isAdmin: 'n', isActive: 'y' }
            const w = await callRpc('updateUsers', [[...users, member]], TOKEN_ADMIN)
            if (!w.ok) {
                throw new Error(`夾具 member 建立失敗 ${JSON.stringify(w).slice(0, 200)}`)
            }
            try {
                const tok = '{token-for-member}'
                const rec = { t0: Date.now(), api: [], token: tok }
                const { context, page } = await newPage(browser, rec)
                await page.goto(`${apiBaseUrl}/?token=${encodeURIComponent(tok)}`, { waitUntil: 'domcontentloaded', timeout: 20000 })
                rec.reachedNotAdmin = await page.waitForFunction(() => window.$vo && window.$vo.$store.state.connState === 'csErrNotAdmin', null, { timeout: 30000 }).then(() => true, () => false)
                await sleep(6000)
                rec.connState = await connStateOf(page)
                rec.body = await bodyOf(page)
                rec.tokenInStore = await page.evaluate(() => window.$vo.$store.state.userToken)
                rec.redirected = rec.redirects.length > 0
                await context.close()
                out.scenarios.S2_ordinaryUser = { reachedNotAdmin: rec.reachedNotAdmin, connState: rec.connState, body: rec.body, tokenInStore: rec.tokenInStore, redirected: rec.redirected, apiSummary: summarize(rec.api), consoleErrors: rec.consoleErrors }
            }
            finally {
                const back = await callRpc('updateUsers', [base], TOKEN_ADMIN)
                out.scenarios.S2_cleanupOk = back.ok
            }
        }

        //S3 無效 token 進站
        {
            const tok = 'nope-invalid'
            const rec = { t0: Date.now(), api: [], token: tok }
            const { context, page } = await newPage(browser, rec)
            await page.goto(`${apiBaseUrl}/?token=${tok}`, { waitUntil: 'domcontentloaded', timeout: 20000 })
            //登入被拒(csErrLogin)後 App.vue loginError 即轉址 urlRedirect(非開發環境判定下立即; 轉址後頁面已離開, store 不可讀), 以 urlRedirect 被請求判定
            const t1 = Date.now()
            while (rec.redirects.length === 0 && Date.now() - t1 < 75000) {
                await sleep(300)
            }
            rec.redirectedToUrlRedirect = rec.redirects.length > 0
            rec.redirectAfterMs = Date.now() - t1
            await sleep(3000)
            await context.close()
            out.scenarios.S3_badToken = { redirectedToUrlRedirect: rec.redirectedToUrlRedirect, redirectAfterMs: rec.redirectAfterMs, apiSummary: summarize(rec.api), apiCount: rec.api.length, consoleErrors: rec.consoleErrors }
        }

        //S4 舊前端建置檔(重建前 dist 之 app／chunk-vendors) + 升版後後端: 登入後輪詢不帶 token 被拒(README Upgrade Notes: 需重新載入頁面)
        if (fs.existsSync(path.join(oldDistDir, 'dist', 'js'))) {
            const rec = { t0: Date.now(), api: [], token: 'sys' }
            const { context, page } = await newPage(browser, rec, { oldDist: true })
            await page.goto(`${apiBaseUrl}/?token=sys`, { waitUntil: 'domcontentloaded', timeout: 20000 })
            await sleep(15000)
            rec.connState = await connStateOf(page)
            rec.body = await bodyOf(page)
            rec.tables = await page.evaluate(() => { const s = window.$vo && window.$vo.$store.state; return s ? { users: s.users && s.users.length, grups: s.grups && s.grups.length } : null })
            await context.close()
            out.scenarios.S4_oldBundle = { swapped: rec.swapped, connState: rec.connState, body: rec.body, tables: rec.tables, apiSummary: summarize(rec.api), consoleErrors: rec.consoleErrors }
        }
        else {
            out.scenarios.S4_oldBundle = { skipped: `無 ${oldDistDir}(先 git archive HEAD dist 解出)` }
        }
    }
    finally {
        await browser.close()
        cleanup()
    }
    fs.writeFileSync(outFile, JSON.stringify(out, null, 2), 'utf8')
    console.log(`probe done -> ${outFile}`)
}

main().then(() => process.exit(0)).catch((err) => {
    console.log('probe error', err)
    try {
        cleanup()
    }
    catch (e) {}
    process.exit(1)
})
