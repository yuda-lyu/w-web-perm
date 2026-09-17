//e2e 共用設施：啟動/重用 後端(11006)+前端(8080) 服務、DB 種子、cleanup、captureStable。
//設計對齊全域 CLAUDE.md §6.3「E2E lifecycle 對稱性」：
//  - startServersOnce(): port 已被佔用→reuse；沒人→spawn 並等 ready（內部 flag 只跑一次）。
//  - cleanup(): 只殺自己 spawn 的子進程樹（Windows taskkill /T）。
//  - 兩個觸發來源：mocha root after() hook（框架環境）+ 各直跑 baseline 腳本末顯式呼叫 cleanup()。
//連線採 Mode 2：前端 dev server(8080, vue.config proxy /api→11006) + 後端(11006)。
//瀏覽端點一律 127.0.0.1（§6.3 避 IPv6 happy-eyeballs）；登入帶 ?token=sys（w-ui-loginout 以 admin 驗證，不依賴 isDev）。

import { spawn, execSync } from 'child_process'
import http from 'http'
import JSON5 from 'json5'
import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'
import { chromium } from 'playwright'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

//REGEN 診斷閘門守則（全域技能 role-coder-for-test-e2e references/pixel-mismatch-diagnosis.md §6）：
//診斷 env（E2E_BARE / E2E_DIAG）生效時絕不可寫入正式 baseline，防止把診斷態誤凍結為標準圖。
if ((process.argv.includes('--baseline') || process.env.E2E_REGEN === '1') && (process.env.E2E_BARE || process.env.E2E_DIAG)) {
    throw new Error('拒絕在診斷 env (E2E_BARE / E2E_DIAG) 下寫入正式 baseline')
}

const __dir = dirname(fileURLToPath(import.meta.url)) //= test/tools
const fdTest = join(__dir, '..') //= test
const projRoot = join(__dir, '..', '..') //= 專案根

const BACKEND_PORT = 11006
//perm e2e 用獨立的 8090（避開常駐於 8080 的其他專案 dev server），以 --port 顯式指定確保確定性
const FRONTEND_PORT = 8090

export const apiBaseUrl = `http://127.0.0.1:${BACKEND_PORT}`
export const baseUrl = `http://127.0.0.1:${FRONTEND_PORT}`
//帶 ?token=sys 讓 w-ui-loginout 以系統管理者(admin)登入；dev/prod build 皆確定登入。
export const appUrl = `${baseUrl}/?token=sys`

const isWin = process.platform === 'win32'

let startedBackend = false //once 旗標依服務分拆, 理由見 startServersOnce 內註解
let startedFrontend = false
let spawned = [] //{ name, child }

function httpOk(url, timeoutMs = 2500) {
    return new Promise((resolve) => {
        const req = http.get(url, (res) => {
            res.resume()
            resolve(typeof res.statusCode === 'number' && res.statusCode > 0 && res.statusCode < 500)
        })
        req.on('error', () => resolve(false))
        req.setTimeout(timeoutMs, () => { req.destroy(); resolve(false) })
    })
}

async function waitPort(url, label, timeoutMs = 180000) {
    const t0 = Date.now()
    while (Date.now() - t0 < timeoutMs) {
        if (await httpOk(url)) return
        await new Promise(r => setTimeout(r, 1000))
    }
    throw new Error(`等待 ${label} (${url}) 逾時 ${timeoutMs}ms`)
}

//刪 ./db 並回驗真的沒了（全域 §12.6：Windows 對 lmdb 之 memory-mapped 檔, rm 可能因殘留行程持有映射而失敗；
//  且行程死亡後 OS 釋放檔案 handle 有延遲, 故重試數次而非一次定生死）。
//  刪不掉時「拋錯」而非退化：genTestData 為 upsert 不清表, 在髒 DB 上 seed 會產出非 hermetic 之 base seed,
//  據此產製的標準圖等於把污染狀態凍結為真理（§16.2 第 4 條）——大聲失敗遠優於安靜產出不可信的圖。
//  2026-09-16 實機兩度踩到：restartBackend 只以「監聽中」之 PID 殺後端, 卡住/未監聽之舊 srv.mjs 續持有 lmdb,
//  seedDb 靜默退化為 upsert, 使 captureBaseSeed 取到被前置探測污染之 users 表。
//  strict=false 之唯一正當場景：api 測試之 after-hook 還原（restartBackend）。該情境下持有 lmdb 映射的是
//  mocha 進程自己——api-setup 之 getWoItems 會 import g_mOrm.mjs 開 lmdb 做唯讀斷言（見 api-setup.mjs:48-49），
//  同進程內無法解除映射, 故刪除必然失敗；但該處只需把 admin 的 isActive 還原, upsert 即足夠, 且不產製標準圖。
function wipeDbVerified(strict = true) {
    const dbDir = join(projRoot, 'db')
    let lastErr = null
    for (let i = 0; i < 6; i++) {
        try { fs.rmSync(dbDir, { recursive: true, force: true }) }
        catch (e) { lastErr = e }
        if (!fs.existsSync(dbDir)) return
        execSync(isWin ? 'ping -n 2 127.0.0.1 >nul' : 'sleep 1', { stdio: 'ignore' })
    }
    const msg = `無法刪除 ./db（仍有行程持有 lmdb 映射）: ${lastErr ? lastErr.message : '目錄仍存在'}`
    if (strict) throw new Error(`seedDb: ${msg}；續行將產出非 hermetic 之 base seed, 故中止`)
    console.log(`警告: seedDb ${msg}；本次改在既有 DB 上 upsert（僅限 api after-hook 還原, 不得用於產製標準圖）`)
}

//種子 DB（base seed：peter/mary/john/admin + grups/pemis/targets）。g_initialTestData 刪舊重建，
//須在後端開啟 lmdb 之前完成。偵測 stdout 'finish.' 即視為完成並結束該子進程（避免 lmdb 卡 event loop）。
function seedDb(opts = {}) {
    const { strict = true } = opts
    return new Promise((resolve, reject) => {
        //先刪 ./db（lmdb）再重建，確保 hermetic base seed（genTestData 為 upsert 不清表）。
        try { wipeDbVerified(strict) }
        catch (e) { reject(e); return }
        const child = spawn('node', ['g_initialTestData.mjs'], { cwd: projRoot, stdio: ['ignore', 'pipe', 'pipe'] })
        let done = false
        const finish = () => { if (done) return; done = true; try { child.kill() } catch (e) {} ; resolve() }
        let buf = ''
        child.stdout.on('data', (d) => { buf += String(d); if (buf.includes('finish.')) finish() })
        child.stderr.on('data', () => {})
        child.on('exit', () => finish())
        child.on('error', reject)
        setTimeout(() => { if (!done) { try { child.kill() } catch (e) {} ; reject(new Error('seedDb 逾時 60s')) } }, 60000)
    })
}

function spawnSrv(name, cmd, args, opts = {}) {
    const child = spawn(cmd, args, { cwd: projRoot, stdio: ['ignore', 'pipe', 'pipe'], ...opts })
    child.stdout.on('data', () => {}) //保留管線避免 buffer 塞滿；需 debug 時改 process.stdout.write
    child.stderr.on('data', () => {})
    spawned.push({ name, child })
    return child
}

export async function startServersOnce(opts = {}) {
    //once 旗標依「服務」分拆：合併跑批（mocha 單進程載多檔, 如 npm test）時 api 檔先以
    //backendOnly 呼叫本函式——若用單一 started 旗標, 會被設為 true 而只起後端就返回,
    //後續 e2e 檔再呼叫時直接 return → 前端永遠沒被 spawn → openApp goto 連線失敗
    //（chrome-error://）→「Execution context was destroyed」連環失敗
    //（2026-07-10 以 api-getPerm + e2e-grups 兩檔合跑最小重現確證; 單檔跑不受影響）。
    const { backendOnly = false } = opts

    //後端：已起→reuse；沒人→先 seed 再 spawn（seed 須在後端開 lmdb 前）
    if (!startedBackend) {
        startedBackend = true
        const backendUp = await httpOk(`${apiBaseUrl}/`)
        if (!backendUp) {
            await seedDb()
            spawnSrv('backend', 'node', ['srv.mjs'])
            await waitPort(`${apiBaseUrl}/`, 'backend 11006', 60000)
        }
    }

    //API 契約測試（D 類）只需 backend，省去 frontend webpack 首編（~2 分）；e2e 不傳此旗標→照起前端
    if (backendOnly) return

    //前端 dev server：已起→reuse；沒人→spawn（webpack 首編較久）
    if (!startedFrontend) {
        startedFrontend = true
        const frontendUp = await httpOk(`${baseUrl}/`)
        if (!frontendUp) {
            //Windows 下 npm 為 npm.cmd，需 shell；顯式 --port 確保落在 FRONTEND_PORT
            spawnSrv('frontend', 'npm', ['run', 'serve', '--', '--port', String(FRONTEND_PORT)], { shell: isWin })
            await waitPort(`${baseUrl}/`, `frontend ${FRONTEND_PORT}`, 180000)
        }
    }
}

//—— init 等「需注入不同語系/設定」測試專用：genTempSettings + restartBackend（對齊 SSO）——
//產生臨時 settings：複製 ./settings.json(JSON5) + overrides → 寫 ./test/_tmp/ 回傳路徑。
//落點刻意用 test/_tmp/ 而非專案 ./tmp/：./tmp/ 為 AI 代理之暫存區, 隨時可能被整個清除,
//測試中介資料放該處會在執行途中被刪(如 restartBackend 讀不到臨時 settings)導致假失敗。
//測完即刪：本進程產生之臨時 settings 由 cleanup() 一併刪除（測試中介資料不得留在 ./test 內）。
let tmpSettingsSeq = 0
let tmpSettingsFiles = []
export function genTempSettings(overrides = {}) {
    const base = JSON5.parse(fs.readFileSync(join(projRoot, 'settings.json'), 'utf8'))
    const merged = { ...base, ...overrides }
    const tmpDir = join(fdTest, '_tmp')
    if (!fs.existsSync(tmpDir)) { fs.mkdirSync(tmpDir, { recursive: true }) }
    const p = join(tmpDir, `settings-e2e-${process.pid}-${tmpSettingsSeq++}.json`)
    fs.writeFileSync(p, JSON.stringify(merged, null, 2))
    tmpSettingsFiles.push(p)
    return p
}
function cleanupTempSettings() {
    for (const p of tmpSettingsFiles) {
        try { fs.rmSync(p, { force: true }) } catch (e) {}
    }
    tmpSettingsFiles = []
    try {
        const tmpDir = join(fdTest, '_tmp')
        if (fs.existsSync(tmpDir) && fs.readdirSync(tmpDir).length === 0) { fs.rmdirSync(tmpDir) }
    }
    catch (e) {}
}

//以指定 settings 重啟 backend（殺現有 backend → node srv.mjs <pathSettings> 重啟並等 ready）。
//用法：before restartBackend(genTempSettings({ language })), after restartBackend('./settings.json') 還原預設。
//opts.reseed=true：port 釋放後、spawn 前重跑 hermetic base seed（刪 ./db 重建），供「測試把資料弄到 UI/RPC 無法還原之狀態」
//（如 admin 自己 isActive='n' 後所有通道皆拒）的 api 測試還原用；seed 須在後端開 lmdb 前完成，故只能在此時機做。
export async function restartBackend(pathSettings = './settings.json', opts = {}) {
    const { reseed = false } = opts
    //殺 spawned 中 name==='backend' 者
    for (const s of spawned) {
        if (s.name === 'backend') {
            try {
                if (isWin) { spawn('cmd', ['/c', 'taskkill', '/F', '/T', '/PID', String(s.child.pid)], { stdio: 'ignore' }) }
                else { s.child.kill('SIGKILL') }
            }
            catch (e) {}
        }
    }
    spawned = spawned.filter((s) => s.name !== 'backend')
    //OS-level 確保 BACKEND_PORT 釋放（涵蓋 reuse / 外部啟動之 backend）
    if (await httpOk(`${apiBaseUrl}/`)) {
        if (isWin) {
            try {
                const out = execSync(`netstat -ano | findstr ":${BACKEND_PORT}"`, { encoding: 'utf8' })
                const pids = new Set()
                for (const line of out.split(/\r?\n/).filter((l) => /LISTENING/.test(l))) {
                    const m = line.match(/\s(\d+)\s*$/)
                    if (m) { pids.add(m[1]) }
                }
                for (const pid of pids) { try { execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' }) } catch (e) {} }
            }
            catch (e) {}
        }
        const t0 = Date.now()
        while (Date.now() - t0 < 5000) { if (!(await httpOk(`${apiBaseUrl}/`))) { break } await new Promise((r) => setTimeout(r, 200)) }
    }
    //reseed 前另以 CommandLine 比對殺盡所有 srv.mjs：上面兩段只涵蓋「spawned 記錄到的」與「當下在監聽的」，
    //  卡住/未監聽之舊實例會漏殺而續持有 lmdb 映射, 使 seedDb 刪不掉 ./db（全域 §12.6）。
    if (reseed && isWin) {
        try { execSync('powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"name=\'node.exe\'\\" | Where-Object { $_.CommandLine -match \'srv\\.mjs\' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"', { stdio: 'ignore' }) }
        catch (e) {}
    }
    if (reseed) {
        //strict:false——本路徑為 api 測試之 after-hook 還原, 持有 lmdb 者為 mocha 進程自身（見 wipeDbVerified 註解）,
        //  刪除必然失敗且 upsert 已足夠；不得把此寬鬆度帶到會產製標準圖的 startServersOnce 路徑。
        await seedDb({ strict: false })
    }
    spawnSrv('backend', 'node', ['srv.mjs', pathSettings])
    await waitPort(`${apiBaseUrl}/`, `backend ${BACKEND_PORT}(restart)`, 60000)
}

export function cleanup() {
    for (const { child } of spawned) {
        try {
            if (isWin) {
                spawn('cmd', ['/c', 'taskkill', '/F', '/T', '/PID', String(child.pid)], { stdio: 'ignore' })
            }
            else {
                try { process.kill(-child.pid, 'SIGKILL') } catch (e) { try { child.kill('SIGKILL') } catch (e2) {} }
            }
        }
        catch (e) {}
    }
    spawned = []
    cleanupTempSettings()
}

//確定性渲染組（對齊 w-web-api test/e2e-setup.mjs:28-39 實測組合：六旗標 self-consistency 5/5、裸 launch 僅 2/4）。
//why：2026-08 查得側欄選單（WListVertical→WPanelScrolly 捲動內容層）launch 級 1px 剛性位移 flake——
//DOM layout 整數穩定、同 launch 連拍位元級穩定、失敗時內容連 AA 色階原封不動整體左移 1px（testPending 四組
//現場逐像素驗證 capture(x,y)==baseline(x+1,y) 零失配）→ 誤差在 raster/compositing 層之 launch 級非決定性，
//非字形 subpixel 重畫、非 DOM/scrollLeft（scrollWidth==clientWidth 實測排除）。本專案原為三姊妹專案中唯一
//裸 launch 者。根因調查全文見 spec/設計要點與取捨.md。
const chromiumLaunchArgs = [
    '--disable-gpu', //關 GPU 硬體加速，raster 改走 CPU Skia
    '--force-color-profile=srgb', //固定色彩描述，不吃主機 ICC/HDR
    '--disable-lcd-text', //關 LCD/subpixel 字形 AA
    '--disable-font-subpixel-positioning', //關字形 subpixel 定位
    '--disable-skia-runtime-opts', //固定 Skia runtime 最佳化路徑
    '--disable-partial-raster', //關 partial raster/tile 重用（與本案剛性 bitmap 位移最直接相關）
]

export async function launchBrowser() {
    return await chromium.launch({ headless: true, args: chromiumLaunchArgs })
}

//開乾淨頁（清 localStorage token 後以 ?token=sys 進入），回傳已可互動的 page。
export async function openApp(browser, opts = {}) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...opts })
    const page = await context.newPage()
    //先到 origin 清 localStorage，再帶 token 進入，避免殘留 token 干擾
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 120000 }).catch(() => {})
    await page.evaluate(() => { try { localStorage.clear() } catch (e) {} })
    await page.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 120000 })
    //等登入完成 + 譯文就緒才回傳。kpText 在 UpdateWebInfor 後才由 ui.setLang(null) 重算（main.js），
    //故不能只等 webInfor truthy；直接等 $t 譯出非 key 值（且 syncState 完成）確保 kpText 已載入。
    await page.waitForFunction(() => {
        const vo = window.$vo
        const st = vo && vo.$store && vo.$store.state
        return !!(st && st.connState === 'csLogin' && st.webInfor && st.syncState === true && vo.$t && vo.$t('mmUsers') !== 'mmUsers')
    }, null, { timeout: 60000 })
    return page
}

//retry-until-stable 截圖（§6.3）：initialWait 等 setTimeout-based delayed reveal，再連兩張一致才回傳。
//對截圖 buffer 指定矩形填色（sharp composite）。【遮罩唯一合法用途】DOM 層凍不到的動態內容
//——主要是 <img> 內的 SVG SMIL 動畫（如載入階段 spinner）。預設黑色，一眼看出是刻意遮蔽動態內容。
//絕不用來遮 nav / grid 等「該被 e2e 偵測」的靜態 UI。對齊 sso test/e2e-setup.mjs 慣例。
async function maskRegions(buf, rects, color = { r: 0, g: 0, b: 0 }) {
    const composite = rects.filter((r) => r.w > 0 && r.h > 0).map((r) => ({
        input: { create: { width: Math.max(1, Math.round(r.w)), height: Math.max(1, Math.round(r.h)), channels: 3, background: color } },
        left: Math.max(0, Math.round(r.x)), top: Math.max(0, Math.round(r.y)),
    }))
    if (composite.length === 0) return buf
    return await sharp(buf).composite(composite).png().toBuffer()
}

//等 WDrawer 抽屜到達穩定態（opened/hidden）才放行——讀 WDrawer 元件根節點 [state]（w-component-vue
//WDrawer.vue 由平移 transitionend 決定性標記 hidden/opening/opened/hiding）。state='opened' = translateX
//動畫真的跑完、定位到最終位置；事件驅動、不受主執行緒負載影響，取代易被高負載「減速尾段/階段間 hold」騙
//而截到 mid-slide 的 nav-x 取樣啟發式。非 backstage 頁無 WDrawer → 無 [state] 元素 → 立即放行。對齊 sso。
async function waitDrawerReady(page) {
    await page.waitForFunction(() => {
        const states = Array.from(document.querySelectorAll('[state]'))
            .map((e) => e.getAttribute('state'))
            .filter((s) => ['hidden', 'opening', 'opened', 'hiding'].includes(s))
        if (states.length === 0) return true //無 WDrawer，放行
        return states.every((s) => s === 'opened' || s === 'hidden') //不可停在 opening/hiding 過渡
    }, null, { timeout: 10000, polling: 100 }).catch(() => {})
}

//pixel baseline 截圖統一 helper（對齊 sso test/e2e-setup.mjs 之 captureStable，UI 套件完全一致）。
//WDrawer 穩定態正解＝waitDrawerReady 讀 [state]='opened'/'hidden' + 等拖曳分隔條 overlay opacity=1，
//非「poll nav x 是否穩定」（後者高負載下會被騙、截到 mid-slide）。tooltip 殘留則主動 hide + 等消失。
export async function captureStable(page, opts = {}) {
    const { maxRetries = 8, intervalMs = 200, initialWaitMs = 1500 } = opts
    //strict：regen 端拒絕寫入未 settle 畫面（§7.4）。opts.strict 顯式優先；未給時吃 E2E_STRICT_CAPTURE
    //（各檔 generateBaseline() 於迴圈前設置），使 mocha 驗證端維持寬鬆（未 settle 回最後一張揭露 flake）而 regen 端變嚴。
    const strict = opts.strict ?? (process.env.E2E_STRICT_CAPTURE === '1')
    const shotOpts = { fullPage: true, animations: 'disabled' }

    //【park mouse + tooltip 處理原則 — 只用使用者可達操作】（各 agent 改 e2e 時依循）
    //w-component-vue 按鈕若帶 tooltip，點擊後 tooltip 彈出、滑鼠移出才消失。
    //  · 一般按鈕：park mouse（mouse.move(0,0)＝使用者真實移開游標）會觸發 mouseleave → tooltip 消失 → 截圖穩定。
    //  · 點擊「立即彈出 dialog」者：dialog 全屏背景遮蔽層擋住按鈕接收滑鼠移動訊息 → 該按鈕收不到 mouseleave
    //    → tooltip 不消失。此類 case 截圖會含 tooltip，視為可接受（使用者也只能看到此態）。
    //  · 絕不以合成事件（dispatchEvent mouseleave 等）強清 tooltip——那非使用者可達操作（L5），違反 e2e act 須 user-facing。
    await page.mouse.move(0, 0)
    //等 setTimeout-based delayed-reveal + hover-leave + chain animation settle（1500ms 涵蓋 300ms×3-5 連鎖）
    await page.waitForTimeout(initialWaitMs)

    //【WDrawer 拖曳分隔條 overlay opacity=1】overlay opacity 由 setTimeout(300ms) 控 0→1，CPU 忙/tab
    //unfocused 時可能被 throttle 超過 initialWait，故 polling 等到 opacity=1（無 WDrawer 則直接過）。
    await page.evaluate(async () => {
        const deadline = Date.now() + 5000
        while (Date.now() < deadline) {
            const bars = Array.from(document.querySelectorAll('[style*="cursor:col-resize"], [style*="cursor: col-resize"]'))
            if (bars.length === 0) return //無 WDrawer，直接過
            if (bars.every((b) => parseFloat(getComputedStyle(b).opacity) === 1)) return
            await new Promise((r) => setTimeout(r, 50))
        }
    })

    //【WDrawer 展開到位】讀 [state] 等所有 drawer 為 opened/hidden（取代 nav-x 啟發式，詳 waitDrawerReady 註解）
    await waitDrawerReady(page)

    //凍結 inline <svg> SMIL 動畫（animations:'disabled' 只凍 CSS、不影響 SVG <animate>）
    await page.evaluate(() => {
        document.querySelectorAll('svg').forEach((svg) => {
            if (typeof svg.pauseAnimations === 'function') { svg.pauseAnimations(); if (typeof svg.setCurrentTime === 'function') svg.setCurrentTime(0) }
        })
    })

    //等 web fonts（@mdi 等 icon glyph）載入，否則截圖缺 icon
    await page.evaluate(() => (document.fonts && typeof document.fonts.ready?.then === 'function') ? document.fonts.ready : Promise.resolve())

    //ag-grid 水平捲動歸 0：欄位 reflow（如 toggle 編輯模式）後捲動位置不定，歸零使視圖確定
    await page.evaluate(() => { document.querySelectorAll('.ag-body-horizontal-scroll-viewport, .ag-center-cols-viewport').forEach((e) => { e.scrollLeft = 0 }) }).catch(() => {})
    await page.waitForTimeout(300)

    //偵測 <img src="data:image/svg+xml...含 <animate>"> 區域——此類 SVG 在 <img> 內由 image pipeline
    //渲染、DOM 凍不到，唯一須後製遮黑的動態內容（載入 spinner 等）。靜態 UI 一律不遮。
    const animatedRects = await page.evaluate(() => {
        const rects = []
        document.querySelectorAll('img').forEach((img) => {
            const src = img.src || ''
            if (!src.startsWith('data:image/svg+xml')) return
            let decoded = ''
            try { decoded = src.startsWith('data:image/svg+xml;base64,') ? atob(src.slice('data:image/svg+xml;base64,'.length)) : decodeURIComponent(src) }
            catch (e) { decoded = '' }
            if (/<animate/i.test(decoded)) { const r = img.getBoundingClientRect(); rects.push({ x: r.left, y: r.top, w: r.width, h: r.height }) }
        })
        return rects
    })

    const shot = async () => {
        let b = await page.screenshot(shotOpts)
        if (animatedRects.length > 0) b = await maskRegions(b, animatedRects)
        return b
    }
    let prev = await shot()
    for (let i = 0; i < maxRetries; i++) {
        await page.waitForTimeout(intervalMs)
        const curr = await shot()
        if (curr.equals(prev)) return curr
        prev = curr
    }
    if (strict) throw new Error(`captureStable ${maxRetries} 次仍未 settle（regen 拒絕寫入未穩定畫面）`)
    return prev //未 settle 也回傳最後一張，後續 byte 比對失敗會揭露真實 flake
}

//整張全頁截圖 + 在「此 e2e 要比對/觀看的區塊」外圍畫紅框（#f26、5px）標注，讓報表/審查委員一眼看出本
//case 主要觀看哪一區，截圖仍為完整畫面、保留 UI 脈絡，不裁切成小片。移植自 w-web-api test/e2e-setup.mjs。
//target：CSS selector 字串 / 字串陣列 / Playwright Locator / 以上混合陣列（多個取聯集框成一個框）。
//  ——欄位列須依 label 文字定位時用 Locator（如 page.locator(...).filter({ hasText: '名稱' })）。
//fold 以下的目標會先把第一個 scrollIntoView 捲進視窗再框（同組目標應在同一捲動位置）。
//紅框為 DOM 注入（pointer-events:none、最高 z-index、不影響版面），captureStable 完成後即移除。
export async function captureStableWithBox(page, target, opts = {}) {
    const items = Array.isArray(target) ? target : [target]
    const isLoc = (x) => x && typeof x === 'object' && typeof x.boundingBox === 'function'
    //先把第一個目標捲進視窗（同組目標應在同一捲動位置）
    const firstLoc = isLoc(items[0]) ? items[0].first() : page.locator(items[0]).first()
    await firstLoc.scrollIntoViewIfNeeded({ timeout: 8000 }).catch(() => {})
    await page.waitForTimeout(300)
    await page.mouse.move(0, 0)
    //取每個目標的 viewport rect（Locator → boundingBox；CSS 字串 → querySelector）
    const rects = []
    for (const it of items) {
        if (isLoc(it)) {
            const bb = await it.first().boundingBox()
            if (bb) rects.push(bb)
        }
        else {
            const r = await page.evaluate((s) => {
                const e = document.querySelector(s)
                if (!e) return null
                const rc = e.getBoundingClientRect()
                return { x: rc.left, y: rc.top, width: rc.width, height: rc.height }
            }, it)
            if (r) rects.push(r)
        }
    }
    //畫紅框——改為「截圖後以 sharp 疊圖」，不再注入/移除 DOM。why：w-web-api 實測記載 headless Chromium
    //對「插入後移除的暫時 DOM」偶發整頁偏移 1px（api test/e2e-edit.test.mjs:37 toast 殷鑑）；本專案 2026-08
    //查得側欄 1px 剛性位移 flake（launch 級二態），紅框 DOM mutation 為可疑 invalidation 觸發源之一，
    //故量測工具自身不再改動被測頁之 DOM/layer tree。幾何與原 DOM 版一致：聯集 rect ±6 外擴、
    //四邊夾在視窗內（M=3）、5px #f26 框線、圓角 4px。疊圖在 captureStable 內建遮罩之後（框永遠可見）。
    const env = await page.evaluate(() => ({ vw: window.innerWidth, vh: window.innerHeight, sx: window.scrollX, sy: window.scrollY }))
    let buf = await captureStable(page, opts)
    if (rects.length > 0) {
        const M = 3
        //fullPage 截圖座標 = viewport rect + scroll offset（本專案頁高皆 <= 視窗，offset 通常為 0）
        const left = Math.min(...rects.map((r) => r.x)) + env.sx
        const top = Math.min(...rects.map((r) => r.y)) + env.sy
        const right = Math.max(...rects.map((r) => r.x + r.width)) + env.sx
        const bottom = Math.max(...rects.map((r) => r.y + r.height)) + env.sy
        const bl = Math.max(env.sx + M, left - 6)
        const bt = Math.max(env.sy + M, top - 6)
        const br = Math.min(env.sx + env.vw - M, right + 6)
        const bb = Math.min(env.sy + env.vh - M, bottom + 6)
        const meta = await sharp(buf).metadata()
        //SVG stroke 置中於路徑：外緣落在 bl..br / bt..bb，等效原 DOM 版 border-box 之 5px 內縮框線
        const svg = `<svg width="${meta.width}" height="${meta.height}" xmlns="http://www.w3.org/2000/svg">` +
            `<rect x="${bl + 2.5}" y="${bt + 2.5}" width="${br - bl - 5}" height="${bb - bt - 5}" fill="none" stroke="#f26" stroke-width="5" rx="4" ry="4"/>` +
            `</svg>`
        buf = await sharp(buf).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).png().toBuffer()
    }
    return buf
}

//框「整列」用 selector：ag-grid 一列跨 center + pinned-left 兩容器（勾選框欄在 pinned-left），
//回傳兩選擇器供 captureStableWithBox 取聯集，框出涵蓋整列（含勾選框）的紅框；單一 .ag-row 選擇器
//只會 querySelector 到其中一個容器、漏掉另一半（殷鑑：勾選框在 pinned-left）。
export function rowBoxSel(rowIndex) {
    return [
        `.ag-center-cols-container .ag-row[row-index="${rowIndex}"]`,
        `.ag-pinned-left-cols-container .ag-row[row-index="${rowIndex}"]`,
    ]
}

//框「對話框內某列」用 selector：對話框 grid 無 pinned 欄（pinned 容器為 ag-hidden、列為單一 center 元素），
//且主表與對話框 grid 之 .ag-row[row-index=N] 會撞名 → 必須 scope 到對話框（SEL_MODAL 範圍內的 center 容器），
//才能唯一框住「對話框內被操作的那一列」（如 toggle 權限P3 的是否使用 → 框 P3 列，而非整個 dialog）。
export function dialogRowBoxSel(rowIndex) {
    return `div[style*="overscroll-behavior"] div[tabindex="0"] > div .ag-center-cols-container .ag-row[row-index="${rowIndex}"]`
}

//關閉結果 modal（點「確認」鈕，文字為 $t('ok')）→ 等 modal（systemMessage 標題）消失，露出底層清單，
//供截「實際變更後的有意義數據」（如存檔後該實體摘要由『使用 2 項權限』變『使用 3 項權限』）。
export async function dismissResultModal(page) {
    const okText = await page.evaluate(() => window.$vo.$t('ok'))
    await page.getByText(okText, { exact: true }).first().click()
    await waitUntilExist(page, '結果 modal 關閉', () => {
        const vo = window.$vo
        return !(document.body.innerText || '').includes(vo.$t('systemMessage'))
    }, { timeout: 10000 })
    await page.waitForTimeout(600) //modal 退場 + grid 回穩
}

//—— Ve* 對話框（VeCgrups / VeCpemis / VeCrules / VeGrupBlngUsers / VePemiBlngGrups）互動原語共用層 ——
//收斂自 e2e-rela-user-grup / e2e-rela-grup-pemi / e2e-rela-pemi-rule 三檔各自一份之同名 helper（既有三份留待另案改 import；
//新 case 一律自此 import，不再複製）。Save 鈕 = WButtonCircle icon=mdiCheckCircle（僅 isEditable && isModified 才渲染）；
//Close 鈕 = mdiClose 恆渲染；皆為 div[role="button"] 內 svg path，以 mdi path 定位。
export const DLG_MDI = {
    save: 'M12 2C6.5 2 2 6.5 2 12S6.5 22 12 22 22 17.5 22 12 17.5 2 12 2M10 17L5 12L6.41 10.59L10 14.17L17.59 6.58L19 8L10 17Z',
    close: 'M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z',
}
export function dlgBtn(page, path) {
    return page.locator(`div[role="button"]:has(svg path[d="${path}"])`)
}
//等對話框內 ag-grid 列就緒（標題已偵測後再等表格列出現）
export async function waitDialogGrid(page) {
    await waitUntilExist(page, '對話框內 ag-grid 列', () => document.querySelectorAll('.ag-row').length > 0, { timeout: 15000 })
    await page.waitForTimeout(800)
}
//翻轉對話框內某列 enable checkbox（觸發 toggleItemEnableByName → isModified=true → Save 鈕現身）
export async function toggleDialogEnable(page, rowIndex) {
    await page.locator(`.ag-row[row-index="${rowIndex}"] .ag-cell[col-id="enable"] input[type="checkbox"]`).first().click()
    await page.waitForTimeout(800)
}
//點左側導覽項（selector 限定於導覽面板內）。
//why scope：主表欄序於 2026-09-16 對調後,「管控使用權限」欄表頭進入 DOM, 其 eng 文字 `Permissions` 與選單「管理權限」(mmPemis) 相同,
//  全頁 page.getByText(label,{exact:true}).first() 會誤點表頭（實測自群組頁切權限頁失敗, tmp/probe-relachip.mjs）。
//  `[ev-stable]` 為 WDrawer 平移面板（v-domstable 指令所加之屬性）, 導覽項皆在其內；導覽收合時該面板 display:none, 呼叫端須先展開。
export const SEL_NAV = '[ev-stable]'
export async function clickNavItem(page, labelText) {
    await page.locator(SEL_NAV).getByText(labelText, { exact: true }).first().click()
}
//切對話框內某列 mode 下拉為指定值（'OR' / 'AND'）。
//mode 欄為自製下拉 WTextSelect（2026-09-14 取代原生 select, 見建議書 §2 / 全域 §10.6.3）：
//  · 觸發區 = WTextSuggestCore select 模式之文字 div（帶靜態屬性 _tabindex="0", WTextSuggestCore.vue:26-31）；
//    不可用 `div[style*="cursor:pointer"]`（Vue 會把 style 正規化成 `cursor: pointer`, 含空白）。
//  · 清單 teleport 至 body 之 `.WPopperFix[wtlp="modeSelect"]`（labelContent 由四個對話框統一給 'modeSelect'），
//    項目為 `div[tabindex="0"]`, 以精確文字點選；選後 popup 自關（WTextSuggestCore clickItem → showPanel=false）。
//  · 唯讀（editable=false）時點擊不彈出, 呼叫端不應在唯讀對話框呼叫本函式。
export async function setDialogMode(page, rowIndex, mode) {
    await pickWTextSelect(page, `.ag-row[row-index="${rowIndex}"] .ag-cell[col-id="mode"]`, 'modeSelect', mode)
    await page.waitForTimeout(800)
}
//對話框內某列 enable checkbox 之 selector（供「點擊前框住 checkbox」截圖；enable 欄只存在於關聯對話框，主表無此欄故不需 scope 到 modal）
export function dialogEnableCheckboxSel(rowIndex) {
    return `.ag-row[row-index="${rowIndex}"] .ag-cell[col-id="enable"] input[type="checkbox"]`
}
//對話框內關聯標籤（RelationChip）之根元素 selector：有 title、inline-flex 且 align-items:stretch；
//溢出指示「+K」雖也帶 title 但為 align-items:center + cursor:pointer, 故不會被選到。
//  注意：收合時未顯示之標籤仍在 DOM（v-show, display:none），此 selector 會一併命中；要「可見者」請用 dialogChipsVisibleTargets。
export function dialogChipSel(rowIndex, colId) {
    return `.ag-row[row-index="${rowIndex}"] .ag-cell[col-id="${colId}"] div[title][style*="align-items: stretch"]`
}
//對話框內溢出指示「+K」之 selector（2026-09-17 起：只在該列標籤依實測寬度放不下時渲染, 與標籤數無關）
//  量測用之隱藏指示（RelationChips 之 indicatorMeasure）無 title 屬性, 不會被選到。
export function dialogChipsAllBtnSel(rowIndex, colId) {
    return `.ag-row[row-index="${rowIndex}"] .ag-cell[col-id="${colId}"] div[title][style*="cursor: pointer"]`
}
//某列標籤欄「可見之標籤 ∪ 溢出指示」之框選目標（Locator 陣列；未顯示者 boundingBox 為 null, captureStableWithBox 自動略過）
//  用於「收合／展開後框住該列標籤列之實際內容」：框實際可見之標籤與指示, 不框儲存格右側空白（全域技能 §7.3 第 2 條）
export async function dialogChipsVisibleTargets(page, rowIndex, colId) {
    const n = await page.locator(dialogChipSel(rowIndex, colId)).count()
    const t = []
    for (let i = 0; i < n; i++) t.push(page.locator(dialogChipSel(rowIndex, colId)).nth(i))
    //指示只在放不下時才渲染（v-if）；不存在時不可放入框選目標, 否則量測等待逾時
    if (await page.locator(dialogChipsAllBtnSel(rowIndex, colId)).count() > 0) t.push(page.locator(dialogChipsAllBtnSel(rowIndex, colId)).first())
    return t
}
//讀某列標籤欄之收合狀態：可見標籤之 title 陣列、可見指示之文字（無則 null）、各可見標籤模式段是否帶展開箭頭
export async function readDialogChipsRow(page, rowIndex, colId) {
    return page.evaluate(([cs, is]) => {
        const vis = (e) => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0
        const chips = [...document.querySelectorAll(cs)].filter(vis)
        const ind = [...document.querySelectorAll(is)].filter(vis)[0]
        return {
            titles: chips.map((e) => e.getAttribute('title')),
            modes: chips.map((e) => (e.children[0].textContent || '').trim()),
            editable: chips.map((e) => !!e.children[0].querySelector('svg')),
            ind: ind ? (ind.textContent || '').trim() : null,
            indTitle: ind ? ind.getAttribute('title') : null,
        }
    }, [dialogChipSel(rowIndex, colId), dialogChipsAllBtnSel(rowIndex, colId)])
}
//改變瀏覽器視窗寬度並等標籤列重算完成：以「目標列之溢出指示出現／消失」為就緒訊號（RelationChips 以 v-domresize 重算）
//  why 以視窗寬度而非拖曳欄寬：關聯對話框表格為 autoFitColumn, 最後一欄拖曳表頭把手不生效（2026-09-17 實測儲存格寬維持 319）,
//  使用者實際遇到之變窄路徑為視窗變小 → 對話框與表格隨之自動調整欄寬。
export async function resizeWindowForChips(page, width, rowIndex, colId, expectIndicator) {
    await page.setViewportSize({ width, height: 900 })
    await waitUntilExist(page, `標籤列重算（視窗 ${width}, 預期指示${expectIndicator ? '出現' : '消失'}）`, ([sel, exp]) => {
        const el = [...document.querySelectorAll(sel)].find((e) => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0)
        return exp ? !!el : !el
    }, { timeout: 15000, arg: [dialogChipsAllBtnSel(rowIndex, colId), expectIndicator] })
    await page.waitForTimeout(800) //對話框與表格版面 settle
}
//對話框合併模式控制項之「每步兩張」截圖版（供多階段 case 用）：點下拉前框住控制項（或本項標籤）→ 清單展開框住整份清單 → 點項目前框住該項目整顆 → 選取並等清單關閉。
//  opt.colId：控制項所在欄。'mode'（預設）為兩個「使用」對話框之獨立模式欄；
//    兩個「所屬」對話框（2026-09-16 起）無獨立 mode 欄, 模式併入標籤欄之本項標籤左段, 呼叫端須傳 'grupsNames' / 'pemisNames'。
//  回傳三張 { clickMode, listOpen, clickItem }；「選取後」之列態由呼叫端以 dialogRowBoxSel(rowIndex) 另拍。
export async function setDialogModeWithShots(page, rowIndex, mode, opt = {}) {
    const { colId = 'mode' } = opt
    const cell = `.ag-row[row-index="${rowIndex}"] .ag-cell[col-id="${colId}"]`
    //點擊前之框選目標一律為「模式控制項整顆」（56×22）：獨立欄框其外框；標籤欄框本項標籤之左段（模式段, ModeSelectChip 根元素）。
    //  why 框模式段而非整顆標籤：①慣例為「點擊前框要點」, 實際可點者只有模式段（名稱段無 handler）；
    //  ②與兩個「使用」對話框之 E2E-002 ⑤「框住該列之模式控制項整顆」對稱, 同一元件同一框法。
    //  施工單 S3(:77 框模式段) 與 S4(:92 框整顆) 互相矛盾, 依上述二理由取 S3, spec 之括號描述不動。
    const target = colId === 'mode' ? `${cell} div[style*="opacity"]` : `${dialogChipSel(rowIndex, colId)} > div:first-child`
    const clickMode = await captureStableWithBox(page, target)
    await page.locator(`${cell} div[_tabindex="0"]`).first().click()
    const popup = page.locator('.WPopperFix[wtlp="modeSelect"]:visible')
    await popup.first().waitFor({ state: 'visible', timeout: 10000 })
    await page.waitForTimeout(400)
    const listOpen = await captureStableWithBox(page, popup)
    const item = popup.locator('div[tabindex="0"]').filter({ hasText: new RegExp(`^\\s*${mode}\\s*$`) }).first()
    const clickItem = await captureStableWithBox(page, item)
    await item.click()
    await popup.first().waitFor({ state: 'hidden', timeout: 10000 })
    await page.waitForTimeout(800)
    return { clickMode, listOpen, clickItem }
}
//對話框內溢出指示「+K」之「每步兩張」截圖版：點擊前框住「+K」整顆 → 展開後框住整個浮層；**浮層保持開啟**交還呼叫端。
//  浮層 teleport 至 body 之 `.WPopperFix[wtlp="relationChipsAll"]`（RelationChips 之 labelContentAll）。
//  回傳 { clickBtn, popupOpen, info }；info 於浮層開啟時量得（供呼叫端語意斷言）：
//    nChip=浮層內標籤數、title=浮層首行標題文字、titles=各標籤名、editable=各標籤模式段是否帶展開箭頭、firstNameBg=首顆名稱段底色
//  2026-09-17 起不再由本函式關閉浮層：浮層之後續操作（於浮層內改模式）或案例結束即為終點；
//    舊版以點對話框標頭關閉之分支已無呼叫端而移除。
export async function openChipsAllWithShots(page, rowIndex, colId) {
    const btn = page.locator(dialogChipsAllBtnSel(rowIndex, colId)).first()
    const clickBtn = await captureStableWithBox(page, btn)
    await btn.click()
    const popup = page.locator('.WPopperFix[wtlp="relationChipsAll"]:visible')
    await popup.first().waitFor({ state: 'visible', timeout: 10000 })
    await page.waitForTimeout(500)
    const popupOpen = await captureStableWithBox(page, popup)
    const info = await page.evaluate(() => {
        //可見性不可用 offsetParent：WPopperFix 為 position:fixed, offsetParent 恆為 null（2026-09-16 實機踩到）。改以面積判定。
        const p = [...document.querySelectorAll('.WPopperFix[wtlp="relationChipsAll"]')]
            .find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 })
        if (!p) return null
        const chips = [...p.querySelectorAll('div[title][style*="align-items: stretch"]')]
        const f = chips[0]
        return {
            nChip: chips.length,
            //標題為標籤容器之前一個兄弟元素（RelationChips 浮層內容：標題 div + 標籤 flex-wrap div）；
            //不可用 textContent 取首行——模板空白是否保留換行隨編譯而異，實測會把標籤文字併入
            title: f && f.parentElement.previousElementSibling ? (f.parentElement.previousElementSibling.textContent || '').trim() : null,
            titles: chips.map((e) => e.getAttribute('title')),
            editable: chips.map((e) => !!e.children[0].querySelector('svg')),
            firstNameBg: f && f.children[1] ? getComputedStyle(f.children[1]).backgroundColor : null,
        }
    })
    return { clickBtn, popupOpen, info }
}
//於已開啟之「展開全部」浮層內, 改首顆（本項）標籤之合併模式——「每步兩張」截圖版：
//  點模式段前框住浮層內首顆標籤之模式段整顆 → 清單展開框住整份清單（疊在浮層之上）→ 點項目前框住該項目整顆 → 選取並等清單與浮層皆關閉。
//  選取後呼叫端之 *ToggleItemModeByName → revRows 重繪列, 浮層隨儲存格元件卸載而關閉, 故以「浮層與清單皆不可見」為完成訊號。
//  回傳 { clickMode, listOpen, clickItem, z }；z＝{ list, popup } 為清單與浮層之 z-index（供「清單疊在浮層之上」斷言）。
export async function setChipsAllModeWithShots(page, mode) {
    const popup = page.locator('.WPopperFix[wtlp="relationChipsAll"]:visible').first()
    const chip0 = popup.locator('div[title][style*="align-items: stretch"]').first()
    const modeSeg = chip0.locator('xpath=./div[1]')
    const clickMode = await captureStableWithBox(page, modeSeg)
    await chip0.locator('div[_tabindex="0"]').first().click()
    const list = page.locator('.WPopperFix[wtlp="modeSelect"]:visible')
    await list.first().waitFor({ state: 'visible', timeout: 10000 })
    await page.waitForTimeout(400)
    //點清單前確認浮層仍開著（清單位於浮層範圍外時, 開清單之點擊不得被判為「點浮層外」）
    const popupStill = await page.locator('.WPopperFix[wtlp="relationChipsAll"]:visible').count()
    if (popupStill !== 1) throw new Error(`setChipsAllModeWithShots: 開啟模式清單後浮層應仍開著（實得可見浮層 ${popupStill}）`)
    const z = await page.evaluate(() => {
        const zi = (sel) => { const e = [...document.querySelectorAll(sel)].find((x) => x.getBoundingClientRect().width > 0); return e ? Number(getComputedStyle(e).zIndex) : null }
        return { list: zi('.WPopperFix[wtlp="modeSelect"]'), popup: zi('.WPopperFix[wtlp="relationChipsAll"]') }
    })
    const listOpen = await captureStableWithBox(page, list)
    const item = list.locator('div[tabindex="0"]').filter({ hasText: new RegExp(`^\\s*${mode}\\s*$`) }).first()
    const clickItem = await captureStableWithBox(page, item)
    await item.click()
    await list.first().waitFor({ state: 'hidden', timeout: 10000 })
    await page.locator('.WPopperFix[wtlp="relationChipsAll"]:visible').first().waitFor({ state: 'hidden', timeout: 10000 })
    await page.waitForTimeout(800)
    return { clickMode, listOpen, clickItem, z }
}
//通用：以真點擊操作 WTextSelect（w-component-vue）——點觸發區文字 → 等 teleport 至 body 之清單可見 → 點指定文字之項目 → 等清單關閉。
//  containerSel：含該 WTextSelect 之容器 selector（觸發區為其內 div[_tabindex="0"]）；wtlp：該元件之 labelContent；itemText：項目顯示文字（精確比對, 前後空白忽略）。
//  各站點：對話框 mode 欄 wtlp='modeSelect'（setDialogMode）、統計頁時間分組 '#staTimeIntervalSel' / wtlp='staTimeIntervalSel'（e2e-stainfor）。
export async function pickWTextSelect(page, containerSel, wtlp, itemText) {
    await page.locator(`${containerSel} div[_tabindex="0"]`).first().click()
    const popup = page.locator(`.WPopperFix[wtlp="${wtlp}"]:visible`)
    await popup.first().waitFor({ state: 'visible', timeout: 10000 })
    const esc = String(itemText).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    await popup.locator('div[tabindex="0"]').filter({ hasText: new RegExp(`^\\s*${esc}\\s*$`) }).first().click()
    await popup.first().waitFor({ state: 'hidden', timeout: 10000 })
}
export async function clickDialogSave(page) {
    await dlgBtn(page, DLG_MDI.save).first().click()
}
export async function clickDialogClose(page) {
    await dlgBtn(page, DLG_MDI.close).first().click()
}
//等對話框關閉（Save resolve / Close reject 後 bShow=false），以標題 i18n 鍵之文字消失偵測
export async function waitDialogClosed(page, titleKey) {
    await waitUntilExist(page, '對話框關閉', (k) => {
        const vo = window.$vo
        return !(document.body.innerText || '').includes(vo.$t(k))
    }, { timeout: 15000, arg: titleKey })
    await page.waitForTimeout(800)
}

//等待 DOM 條件（每步驟先偵測再操作，取代 fixed sleep）。
export async function waitUntilExist(page, label, fn, opts = {}) {
    const { timeout = 15000, arg = null } = opts
    try {
        await page.waitForFunction(fn, arg, { timeout })
    }
    catch (err) {
        throw new Error(`waitUntilExist 超過 ${timeout}ms 仍找不到「${label}」`)
    }
}

//Pattern D：dblclick cell → 清空(Backspace) → insertText → Enter 提交（ag-grid Vue v-model）。
//收斂自 grups/pemis/targets/users 四檔原本各自重複定義之同名函式（逐位元組相同，僅欄位語意不同）。
export async function typeIntoCell(page, rowIndex, colId, value) {
    const cellSel = `.ag-row[row-index="${rowIndex}"] .ag-cell[col-id="${colId}"]`
    await page.locator(cellSel).first().dblclick()
    const inp = page.locator(`${cellSel} input`).first()
    await inp.waitFor({ state: 'visible', timeout: 5000 })
    await page.waitForTimeout(800) //editor mount / v-model binding settle
    await inp.click()
    const cur = await inp.inputValue()
    await page.keyboard.press('End')
    for (let k = 0; k < cur.length + 2; k++) await page.keyboard.press('Backspace')
    if (value) await page.keyboard.insertText(value)
    await page.waitForTimeout(200)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(500)
}

//—— DB 衛生共用 helper（收斂自 grups/pemis/rela-grup-pemi/rela-pemi-rule/rela-user-grup/targets/users
//七檔原本各自重複定義之同名函式；差異僅在 key（$store.state 表名，亦為 $fapi.updateXxx 之 Xxx 字首來源））——
//擷取 pristine base seed（含全欄位），每 case 前還原 DB，使跨 case／跨語系可重現。
//key 表資料經 recvData 廣播同步，較 syncState 晚到；須等載入後再讀，否則抓到空陣列。
export async function captureBaseSeed(page, key) {
    await page.waitForFunction((k) => (window.$vo.$store.state[k] || []).length > 0, key, { timeout: 30000 })
    await page.waitForTimeout(1500) //確保整批同步完成
    return await page.evaluate((k) => {
        const us = (window.$vo.$store.state[k] || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0))
        return JSON.parse(JSON.stringify(us))
    }, key)
}
//在獨立 throwaway page 還原 DB（diff：刪多餘/補缺漏），關閉後再開 case page。
//不可在 case page 上 reset：updateXxx 的 late 廣播(recvData)會在 clickAdd 後到、觸發 changeParams 重算
//把已新增列洗掉（曾導致 typeIntoCell 改到既有列）。test setup 層、非 act。
export async function resetDb(browser, key, seed) {
    if (!seed || seed.length === 0) throw new Error('resetDb: BASE_SEED 為空，拒絕還原（避免清空 DB）')
    const fname = 'update' + key[0].toUpperCase() + key.slice(1)
    const p = await openApp(browser)
    await p.evaluate(({ f, s }) => window.$vo.$fapi[f](s), { f: fname, s: seed })
    await p.waitForFunction(({ k, n }) => (window.$vo.$store.state[k] || []).length === n, { k: key, n: seed.length }, { timeout: 15000 })
    await p.waitForTimeout(800)
    await p.context().close()
}

//表格 mutation settle 訊號（連續 n 筆內容簽章全同才放行）；移植自 w-web-api test/e2e-setup.mjs 之
//waitMutationSettled，簽章取樣點泛化為 .op-title 文字/座標、.ag-cell 數、首列 HTML、body.innerText.length。
//本輪僅提供（技能契約 C12），尚未套用到任何既有 case（套用會改變該 case 的截圖時序，屬另案）。
export async function waitMutationSettled(page, opts = {}) {
    const { n = 10, timeout = 15000 } = opts
    await page.evaluate(() => {
        window.__sigs = []
    })
    await page.waitForFunction((need) => {
        const t = document.querySelector('.op-title')
        const r = t && t.getBoundingClientRect()
        const sig = [
            t ? t.textContent.slice(0, 60) : '',
            r ? `${r.x},${r.y}` : '',
            document.querySelectorAll('.ag-cell').length,
            (document.querySelector('.ag-row[row-index="0"]') || {}).outerHTML || '',
            document.body.innerText.length,
        ].join('|')
        const w = window
        w.__sigs.push(sig)
        if (w.__sigs.length > need) w.__sigs.shift()
        return w.__sigs.length === need && w.__sigs.every((s) => s === w.__sigs[0])
    }, n, { timeout, polling: 200 })
}

//端到端「解析後權限樹」查詢（權限系統核心不變式守護）：以 app token 經瀏覽器 fetch 打 getPermUserInfor 查指定
//userId，回其 resolved rules（getUserRules 合併 OR 聯集 / AND 交集 / isActive 過濾後的結果）中 isActive='y'
//的 target 名稱集合（排序）。這是**外部應用實際查到的權限樹**。用於斷言「UI 改權限 → 權限樹正確變化」，
//不是只驗關聯設定資料（cgrups/cpemis/crules）存對、而是驗其「解析後」的最終權限是否符合預期。
//token 'token-for-application' 由 srv.mjs getUserByToken 解為 app 使用者（過 verifyAppUser）；走前端 dev server
//proxy /api→backend。須在 UI 編輯 + 存檔（DB 持久化）之後呼叫。
export async function getResolvedActiveTargets(page, userId) {
    return await page.evaluate(async (uid) => {
        const url = `/api/getPermUserInfor?token=${encodeURIComponent('{token-for-application}')}&userId=${encodeURIComponent(uid)}`
        const res = await fetch(url)
        const data = await res.json()
        if (!data || data.state !== 'success') throw new Error('getPermUserInfor 失敗: ' + JSON.stringify(data))
        return (data.msg.rules || []).filter((r) => r.isActive === 'y').map((r) => r.name).sort()
    }, userId)
}

//baseline 比對 + fail 時保留證據到 ./testPending (不覆蓋), 供事後 pixel diff 定位 flake/破壞.
//
//比對採 pixelmatch (反鋸齒感知) + maxDiffPixels 容差, 取代舊的 buf.equals (byte-exact):
//- pixelmatch includeAA:false (預設) 會自動偵測並「忽略反鋸齒邊緣像素」(YIQ 感知色差 + AA slope 偵測),
//  專治 SVG icon / 字型邊緣之次像素 raster 差異 (跨 browser session 不決定性), 不再因此 flake.
//- maxDiffPixels: 允許之最大「真不同」像素數 (預設 100). 反鋸齒殘留遠低於此 (個位數~數十); 真 regression
//  (icon 換 / 版面位移 / 顏色變) 動輒數百~數千 px 遠超此 → 仍被抓到. 業界標準, 同 Playwright toHaveScreenshot.
//- 尺寸不同 = 必為真差異 (版面/裁切變) → 直接 fail.
//- pixel baseline 為補強層, 每 case 仍須語意斷言為主 (全域規範 §6.2): 容差只放輔助層, 主驗證仍嚴.
//
//pass: 靜默通過. fail: 將「當次 capture」「baseline」「diff 標紅圖」存檔 (帶 timestamp 不覆蓋) 後 throw.
//  (./testPending 帶 timestamp 保留, 任何 fail 當次證據都留存可 diff; 已 gitignore, 不進 repo.)
//label: 給檔名用之可讀標籤 (如 'users-cht-E2E-003-account-duplicate'); 省略則用 baseline 檔名.
//opts.maxDiffPixels / opts.threshold: 可由呼叫端覆寫 (預設 100 / 0.1), 供個別 case 需更嚴/更鬆時用.
export function assertBaselineMatch(buf, baselinePath, label, opts = {}) {
    let { maxDiffPixels = 100, threshold = 0.1 } = opts

    if (!fs.existsSync(baselinePath)) {
        throw new Error(`標準圖不存在: ${baselinePath} (請先執行對應 e2e --baseline 產製)`)
    }
    let baselineBuf = fs.readFileSync(baselinePath)

    //解碼 PNG → RGBA (pngjs 同步; 保持本函式同步, 不需動所有 caller 加 await)
    let capPng = PNG.sync.read(buf)
    let basePng = PNG.sync.read(baselineBuf)

    //fail: 保留 capture + baseline (+ diff 標紅圖) 到 ./testPending (不覆蓋, 帶 timestamp) 後 throw
    let dump = (reason, diffPng) => {
        let dir = './testPending'
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true })
        }
        let safe = (label || path.basename(baselinePath, '.png')).replace(/[^\w.-]/g, '_')
        //ms 精度 timestamp; 同 label 同毫秒撞檔機率近 0, 仍加 -N 後綴保證絕不覆蓋
        let ts = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 23)
        let stem = `${dir}/${safe}__${ts}`
        let n = 0
        while (fs.existsSync(`${stem}__capture.png`) || fs.existsSync(`${stem}__baseline.png`)) {
            n += 1
            stem = `${dir}/${safe}__${ts}-${n}`
        }
        fs.writeFileSync(`${stem}__capture.png`, buf)
        fs.writeFileSync(`${stem}__baseline.png`, baselineBuf)
        if (diffPng) {
            fs.writeFileSync(`${stem}__diff.png`, PNG.sync.write(diffPng))
        }
        throw new Error(`截圖與標準圖不一致 (${reason}): ${safe} — capture/baseline${diffPng ? '/diff' : ''} 已存 ${stem}__*.png 供 diff`)
    }

    //尺寸不同 = 必為真差異 (版面/裁切變); pixelmatch 要求同尺寸, 故直接 fail
    if (capPng.width !== basePng.width || capPng.height !== basePng.height) {
        dump(`尺寸不同 cap=${capPng.width}x${capPng.height} base=${basePng.width}x${basePng.height}`)
    }

    //pixelmatch: 反鋸齒感知比對, 回傳「真不同」像素數 (反鋸齒邊緣已被忽略)
    let { width, height } = basePng
    let diffPng = new PNG({ width, height })
    let numDiff = pixelmatch(capPng.data, basePng.data, diffPng.data, width, height, { threshold, includeAA: false })
    if (numDiff <= maxDiffPixels) {
        return //通過: 反鋸齒次像素已忽略, 殘留真差異在容差內
    }
    dump(`diff=${numDiff}px > maxDiffPixels=${maxDiffPixels}`, diffPng)
}


//mocha root teardown hook（框架環境自動觸發 cleanup）
if (typeof globalThis.after === 'function') {
    globalThis.after(function() {
        this.timeout(30000)
        cleanup()
    })
}
//非框架/中斷時備援
process.on('exit', cleanup)
process.on('SIGINT', () => { cleanup(); process.exit(130) })
process.on('SIGTERM', () => { cleanup(); process.exit(143) })
