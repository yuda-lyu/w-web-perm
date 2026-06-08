//e2e 共用設施：啟動/重用 後端(11006)+前端(8080) 服務、DB 種子、cleanup、captureStable。
//設計對齊全域 CLAUDE.md §6.3「E2E lifecycle 對稱性」：
//  - startServersOnce(): port 已被佔用→reuse；沒人→spawn 並等 ready（內部 flag 只跑一次）。
//  - cleanup(): 只殺自己 spawn 的子進程樹（Windows taskkill /T）。
//  - 兩個觸發來源：mocha root after() hook（框架環境）+ 各直跑 baseline 腳本末顯式呼叫 cleanup()。
//連線採 Mode 2：前端 dev server(8080, vue.config proxy /api→11006) + 後端(11006)。
//瀏覽端點一律 127.0.0.1（§6.3 避 IPv6 happy-eyeballs）；登入帶 ?token=sys（w-ui-loginout 以 admin 驗證，不依賴 isDev）。

import { spawn } from 'child_process'
import http from 'http'
import fs from 'fs'
import sharp from 'sharp'
import { chromium } from 'playwright'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dir = dirname(fileURLToPath(import.meta.url))
const projRoot = join(__dir, '..')

const BACKEND_PORT = 11006
//perm e2e 用獨立的 8090（避開常駐於 8080 的其他專案 dev server），以 --port 顯式指定確保確定性
const FRONTEND_PORT = 8090

export const apiBaseUrl = `http://127.0.0.1:${BACKEND_PORT}`
export const baseUrl = `http://127.0.0.1:${FRONTEND_PORT}`
//帶 ?token=sys 讓 w-ui-loginout 以系統管理者(admin)登入；dev/prod build 皆確定登入。
export const appUrl = `${baseUrl}/?token=sys`

const isWin = process.platform === 'win32'

let started = false
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

//種子 DB（base seed：peter/mary/john/admin + grups/pemis/targets）。g.initialTestData 刪舊重建，
//須在後端開啟 lmdb 之前完成。偵測 stdout 'finish.' 即視為完成並結束該子進程（避免 lmdb 卡 event loop）。
function seedDb() {
    return new Promise((resolve, reject) => {
        //先刪 ./db（lmdb）再重建，確保 hermetic base seed（genTestData 為 upsert 不清表）。
        //僅在 backend 未啟動時呼叫 seedDb，故無進程持有 lmdb，刪除安全。
        try { fs.rmSync(join(projRoot, 'db'), { recursive: true, force: true }) }
        catch (e) { console.log('警告: 無法刪除 ./db（可能被占用），改在既有 DB 上 seed:', e.message) }
        const child = spawn('node', ['g.initialTestData.mjs'], { cwd: projRoot, stdio: ['ignore', 'pipe', 'pipe'] })
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
    if (started) return
    started = true

    const { backendOnly = false } = opts

    //後端：已起→reuse；沒人→先 seed 再 spawn（seed 須在後端開 lmdb 前）
    const backendUp = await httpOk(`${apiBaseUrl}/`)
    if (!backendUp) {
        await seedDb()
        spawnSrv('backend', 'node', ['srv.mjs'])
        await waitPort(`${apiBaseUrl}/`, 'backend 11006', 60000)
    }

    //API 契約測試（D 類）只需 backend，省去 frontend webpack 首編（~2 分）；e2e 不傳此旗標→照起前端
    if (backendOnly) return

    //前端 dev server：已起→reuse；沒人→spawn（webpack 首編較久）
    const frontendUp = await httpOk(`${baseUrl}/`)
    if (!frontendUp) {
        //Windows 下 npm 為 npm.cmd，需 shell；顯式 --port 確保落在 FRONTEND_PORT
        spawnSrv('frontend', 'npm', ['run', 'serve', '--', '--port', String(FRONTEND_PORT)], { shell: isWin })
        await waitPort(`${baseUrl}/`, `frontend ${FRONTEND_PORT}`, 180000)
    }
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
}

export async function launchBrowser() {
    return await chromium.launch({ headless: true })
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

//pixel baseline 截圖統一 helper（移植 sso test/e2e-setup.mjs 之 captureStable，UI 套件完全一致）。
//WDrawer 雙穩態的正解＝主動等拖曳分隔條 overlay opacity→1，不是遮罩 nav。
export async function captureStable(page, opts = {}) {
    const { maxRetries = 10, intervalMs = 250, initialWaitMs = 1500 } = opts
    const shotOpts = { fullPage: true, animations: 'disabled' }

    //park mouse 到 (0,0) 消 hover 殘留（點擊後 mouse 留在元素上，hover state 命中與否不穩）
    await page.mouse.move(0, 0)
    //等 setTimeout-based delayed-reveal + hover-leave + chain animation settle
    await page.waitForTimeout(initialWaitMs)

    //【WDrawer 雙穩態：先等 nav 收斂回「展開態」】reflow（複製/編輯產生較長 id、切編輯模式、開 modal）可能誘發
    //autoSwitch 收合（cht 比 eng 易觸發，故僅部分 cht case 機率性 flake）；1440px viewport 的確定性穩定態為展開，
    //故截圖前被動等 nav 標籤重新展開且穩定（非遮蔽、非 drawer-force）。gen 一直是展開、flake 僅在 verify 偶 capture 收合。
    await waitNavExpanded(page)

    //【WDrawer nav 收斂偵測 — 非遮蔽】左側 nav 用 WDrawer（autoSwitchToHide/Show）。layout reflow（開
    //對話框 / 新增列 / 切編輯模式）後其 nav 文字 x 位置可能短暫擺盪；等 nav 區（x<205）文字葉節點的 x
    //位置指紋「連續 8×200ms=1.6s 完全不變」＝收斂到最終態才截圖（防收斂到 reflow 中途的偽穩定態）。
    //nav 完整入鏡並參與 byte 比對（非遮蔽）。
    await page.evaluate(async () => {
        const sample = () => [...document.querySelectorAll('*')]
            .filter((e) => {
                if (e.children.length !== 0 || !(e.textContent || '').trim()) return false
                const r = e.getBoundingClientRect()
                return r.width > 0 && r.left < 205 && r.top > 60
            })
            .map((e) => Math.round(e.getBoundingClientRect().left)).join(',')
        const deadline = Date.now() + 8000
        let prev = null, stable = 0
        while (Date.now() < deadline) {
            const s = sample()
            if (s && s === prev) { stable++; if (stable >= 8) return }
            else stable = 0
            prev = s
            await new Promise((r) => setTimeout(r, 200))
        }
    })

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
    return prev //未 settle 也回傳最後一張，後續 byte 比對失敗會揭露真實 flake
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

//等左側 WDrawer nav 收斂到「展開態」（防 layout reflow（如複製列產生較長 id 觸發欄寬重排）誘發 autoSwitch
//收合的雙穩態）。被動等待 nav 區（x<205）文字葉節點數 ≥ minLabels 且連續 stableMs 穩定——非遮蔽、非 drawer-force，
//僅在截圖前確保 nav 落在 1440px viewport 的確定性展開態。對齊 CLAUDE.md「WDrawer 雙穩態正解＝主動等收斂」。
//用於易觸發 reflow 的 case（如 copy）於 captureStable 前呼叫。
export async function waitNavExpanded(page, opts = {}) {
    const { timeout = 12000, minLabels = 4, stableMs = 1200 } = opts
    const navCount = () => page.evaluate(() => [...document.querySelectorAll('*')].filter((e) => {
        if (e.children.length !== 0 || !(e.textContent || '').trim()) return false
        const r = e.getBoundingClientRect()
        return r.width > 0 && r.left < 205 && r.top > 60
    }).length)
    const t0 = Date.now()
    let stableStart = null
    while (Date.now() - t0 < timeout) {
        const n = await navCount()
        if (n >= minLabels) {
            if (stableStart === null) stableStart = Date.now()
            if (Date.now() - stableStart >= stableMs) return
        }
        else { stableStart = null }
        await page.waitForTimeout(200)
    }
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
