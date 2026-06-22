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

//—— init 等「需注入不同語系/設定」測試專用：genTempSettings + restartBackend（對齊 SSO）——
//產生臨時 settings：複製 ./settings.json(JSON5) + overrides → 寫 ./tmp/ 回傳路徑。
let tmpSettingsSeq = 0
export function genTempSettings(overrides = {}) {
    const base = JSON5.parse(fs.readFileSync(join(projRoot, 'settings.json'), 'utf8'))
    const merged = { ...base, ...overrides }
    const tmpDir = join(projRoot, 'tmp')
    if (!fs.existsSync(tmpDir)) { fs.mkdirSync(tmpDir, { recursive: true }) }
    const p = join(tmpDir, `settings-e2e-${process.pid}-${tmpSettingsSeq++}.json`)
    fs.writeFileSync(p, JSON.stringify(merged, null, 2))
    return p
}

//以指定 settings 重啟 backend（殺現有 backend → node srv.mjs <pathSettings> 重啟並等 ready）。
//用法：before restartBackend(genTempSettings({ language })), after restartBackend('./settings.json') 還原預設。
export async function restartBackend(pathSettings = './settings.json') {
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
    //畫紅框（多個取聯集；四邊夾在視窗內避免貼邊元素框線跑出畫面而少邊）
    await page.evaluate((rs) => {
        const M = 3
        const vw = window.innerWidth
        const vh = window.innerHeight
        if (rs.length > 0) {
            const left = Math.min(...rs.map((r) => r.x))
            const top = Math.min(...rs.map((r) => r.y))
            const right = Math.max(...rs.map((r) => r.x + r.width))
            const bottom = Math.max(...rs.map((r) => r.y + r.height))
            const bl = Math.max(M, left - 6)
            const bt = Math.max(M, top - 6)
            const br = Math.min(vw - M, right + 6)
            const bb = Math.min(vh - M, bottom + 6)
            const box = document.createElement('div')
            box.id = '__e2e_box__'
            box.style.cssText = `position:fixed; left:${bl}px; top:${bt}px; width:${br - bl}px; height:${bb - bt}px; border:5px solid #f26; box-sizing:border-box; z-index:2147483647; pointer-events:none; border-radius:4px;`
            document.body.appendChild(box)
        }
    }, rects)
    await page.waitForTimeout(150)
    const buf = await captureStable(page, opts)
    await page.evaluate(() => {
        const b = document.getElementById('__e2e_box__')
        if (b) b.remove()
    })
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
