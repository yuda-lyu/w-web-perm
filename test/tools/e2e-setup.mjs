//e2e 共用設施：啟動/重用 後端(11006)+前端(8090) 服務、DB 種子、cleanup、captureStable。
//2026-09-28 起通用部分組裝自 e2e 共用設施（當時為 w-web-sso 之 srcPack；2026-09-29 起為 devDependency w-package-tools-e2e 1.0.2，同名同行為，2026-09-30 起 1.0.3，下文「套件」即指它；一律經 ./e2eLib.mjs 引用）：
//  服務生命週期 createServiceManager、截圖 captureStable / captureStableWithBox、比對 assertBaselineMatch、等待 waitUntilExist、
//  臨時設定 createTempSettings、收尾註冊 registerCleanupHooks、啟動 launchBrowser。本檔只保留本專案之組態（port、spawn、DB 種子、
//  settle 組合、夾邊方式）與 perm 專屬互動原語；匯出名稱與簽章與遷移前相同，測試檔與 api-setup.mjs 不必改 import。
//設計對齊全域技能 role-coder-for-test-e2e §9「lifecycle 對稱性」：
//  - startServersOnce(): port 已被佔用→reuse；沒人→spawn 並等 ready（一次性狀態依服務分拆）。
//  - cleanup(): 同步、只殺自己 spawn 的子進程樹（Windows taskkill /T）、重置一次性狀態、刪臨時 settings。
//  - 兩個觸發來源：mocha root after() hook（框架環境）+ 各直跑 baseline 腳本末顯式呼叫 cleanup()；exit / SIGINT / SIGTERM 為備援。
//連線採 Mode 2：前端 dev server(8090, vue.config proxy /api→11006) + 後端(11006)。
//瀏覽端點一律 127.0.0.1（§6.3 避 IPv6 happy-eyeballs）；登入帶 ?token=sys（w-ui-loginout 以 admin 驗證，不依賴 isDev）。

import assert from 'assert'
import { spawn, execSync } from 'child_process'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import {
    getE2eMode,
    launchBrowser as pkgLaunchBrowser,
    captureStable as pkgCaptureStable,
    captureStableWithBox as pkgCaptureStableWithBox,
    waitColResizeOverlay,
    waitDrawerReady,
    resetAgGridScroll,
    rowBoxSel as pkgRowBoxSel,
    assertBaselineMatch as pkgAssertBaselineMatch,
    waitUntilExist as pkgWaitUntilExist,
    probeHttp,
    createTempSettings,
    createServiceManager,
    registerCleanupHooks,
    itemsUnionBox,
    waitGridIdle,
    probeStuckTooltip as pkgProbeStuckTooltip
} from './e2eLib.mjs'

//REGEN 診斷閘門守則（全域技能 role-coder-for-test-e2e references/pixel-mismatch-diagnosis.md §6）：
//診斷 env（E2E_BARE / E2E_DIAG）生效時絕不可寫入正式 baseline，防止把診斷態誤凍結為標準圖（getE2eMode 於此拋錯）。
getE2eMode()

const __dir = dirname(fileURLToPath(import.meta.url)) //= test/tools
const fdTest = join(__dir, '..') //= test
const projRoot = join(__dir, '..', '..') //= 專案根
//本專案後端一律以絕對路徑啟動, 使行程命令列可辨識為本 repo 所屬(reseed 前只殺本 repo 之殘留後端, 見 killOwnSrvProcesses)
const SRV_PATH = join(projRoot, 'srv.mjs')

const BACKEND_PORT = 11006
//perm e2e 用獨立的 8090（避開常駐於 8080 的其他專案 dev server），以 --port 顯式指定確保確定性
const FRONTEND_PORT = 8090

export const apiBaseUrl = `http://127.0.0.1:${BACKEND_PORT}`
export const baseUrl = `http://127.0.0.1:${FRONTEND_PORT}`
//帶 ?token=sys 讓 w-ui-loginout 以系統管理者(admin)登入；dev/prod build 皆確定登入。
export const appUrl = `${baseUrl}/?token=sys`

const isWin = process.platform === 'win32'

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

function spawnSrv(cmd, args, opts = {}) {
    const child = spawn(cmd, args, { cwd: projRoot, stdio: ['ignore', 'pipe', 'pipe'], ...opts })
    child.stdout.on('data', () => {}) //保留管線避免 buffer 塞滿；需 debug 時改 process.stdout.write
    child.stderr.on('data', () => {})
    return child
}

//—— init 等「需注入不同語系/設定」測試專用：genTempSettings + restartBackend（對齊 SSO）——
//產生臨時 settings：複製 ./settings.json(JSON5) + overrides → 寫 ./test/_tmp/ 回傳路徑。
//落點刻意用 test/_tmp/ 而非專案 ./tmp/：./tmp/ 為 AI 代理之暫存區, 隨時可能被整個清除,
//測試中介資料放該處會在執行途中被刪(如 restartBackend 讀不到臨時 settings)導致假失敗。
//測完即刪：本進程產生之臨時 settings 由 cleanup() 一併刪除（測試中介資料不得留在 ./test 內）。
const { genTempSettings, cleanupTempSettings } = createTempSettings({
    basePath: join(projRoot, 'settings.json'),
    tmpDir: join(fdTest, '_tmp'),
})
export { genTempSettings }

//服務生命週期（沿用政策 reuse；套件 createServiceManager）：
//  - 後端：port 沒人 → 先 seed（beforeSpawn phase=start；seed 須在後端開 lmdb 前）再 spawn；restart 帶 hookArg.reseed 時於 port 釋放後、spawn 前重跑 seed。
//  - 前端：dev server 以 --port 8090 顯式指定（Windows 下 npm 為 npm.cmd 需 shell；webpack 首編較久）。
//  - 探測：HTTP 狀態碼 < 500 視為就緒（沿用本專案原 httpOk 判準）。
//  - 11006 專屬本專案：restart 遇非自建之監聽者得殺之（CLAUDE.md 明文例外, killForeignOnRestart）。
const services = createServiceManager({
    services: [
        {
            name: 'backend',
            port: BACKEND_PORT,
            readyTimeoutMs: 60000,
            beforeSpawn: async ({ phase, hookArg }) => {
                if (phase === 'start') {
                    await seedDb()
                }
                else if (hookArg && hookArg.reseed) {
                    //reseed 前另殺本 repo 之殘留後端(只比對本 repo srv.mjs 絕對路徑, 不及他 repo; 見 killOwnSrvProcesses)
                    killOwnSrvProcesses()
                    //strict:false——本路徑為 api 測試之 after-hook 還原, 持有 lmdb 者為 mocha 進程自身（見 wipeDbVerified 註解）,
                    //  刪除必然失敗且 upsert 已足夠；不得把此寬鬆度帶到會產製標準圖的 startServersOnce 路徑。
                    await seedDb({ strict: false })
                }
            },
            spawn: ({ args, env }) => spawnSrv('node', [SRV_PATH, ...args], { env }),
        },
        {
            name: 'frontend',
            port: FRONTEND_PORT,
            readyTimeoutMs: 180000,
            startNote: 'webpack 首編較久',
            //Windows 須經 shell 解析 npm.cmd; shell:true 時以單一指令字串傳入: 帶參數陣列會觸發 Node 24 DEP0190(參數只被串接、不跳脫; 2026-09-30 改, 指令列相同)
            spawn: () => (isWin
                ? spawnSrv(`npm run serve -- --port ${FRONTEND_PORT}`, [], { shell: true })
                : spawnSrv('npm', ['run', 'serve', '--', '--port', String(FRONTEND_PORT)])),
        },
    ],
    probe: (svc) => probeHttp(svc.url, { timeoutMs: 2500, accept: (st) => st > 0 && st < 500 }),
    killForeignOnRestart: true,
    onCleanup: () => cleanupTempSettings(),
})

export async function startServersOnce(opts = {}) {
    //一次性狀態依「服務」分拆：合併跑批（mocha 單進程載多檔, 如 npm test）時 api 檔先以
    //backendOnly 呼叫本函式——若用單一 started 旗標, 會被設為 true 而只起後端就返回,
    //後續 e2e 檔再呼叫時直接 return → 前端永遠沒被 spawn → openApp goto 連線失敗
    //（chrome-error://）→「Execution context was destroyed」連環失敗
    //（2026-07-10 以 api-getPerm + e2e-grups 兩檔合跑最小重現確證; 單檔跑不受影響）。
    //API 契約測試（D 類）只需 backend，省去 frontend webpack 首編（~2 分）；e2e 不傳此旗標→照起前端
    const { backendOnly = false } = opts
    await services.startServersOnce({ only: backendOnly ? ['backend'] : null })
}

//殺本 repo 之殘留後端(Windows): 命令列含本 repo srv.mjs 絕對路徑之 node 行程, 連同子行程樹。
//why: restartBackend 前兩段只涵蓋「spawned 記錄到的」與「當下監聽 11006 的」, 卡住/未監聽之舊實例會漏殺而續持有 lmdb 映射,
//  使 seedDb 刪不掉 ./db(全域 §12.6); 但不得擴及他 repo——w-web-sso / w-web-api / w-web-task 之後端亦為 `node srv.mjs`,
//  舊寫法以 CommandLine 含 `srv.mjs` 殺全機, 2026-09-25 曾殺掉 sso 11007 之後端(違反專案 CLAUDE.md「只重啟自己創建的 PID」)。
//  故後端改以絕對路徑啟動(SRV_PATH), 此處只比對該路徑。路徑含非 ASCII(「開源」), 不放進命令列: PowerShell 以 UTF-8 輸出 JSON(-EncodedCommand 免跳脫), 在 node 端比對。
//  以相對路徑手動啟動之本 repo 後端不在比對範圍; 其若監聽 11006 則由 restartBackend 之監聽者段處理, 否則 seedDb 刪不掉 ./db 時照常拋錯或警告。
function killOwnSrvProcesses() {
    if (!isWin) return []
    const script = '[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-CimInstance Win32_Process -Filter "name=\'node.exe\'" | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress'
    let rows = []
    try {
        const out = execSync(`powershell -NoProfile -EncodedCommand ${Buffer.from(script, 'utf16le').toString('base64')}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
        rows = out ? [].concat(JSON.parse(out)) : []
    }
    catch (e) {
        return []
    }
    const target = SRV_PATH.toLowerCase()
    const pids = rows.filter((r) => r && typeof r.CommandLine === 'string' && r.CommandLine.toLowerCase().includes(target) && r.ProcessId !== process.pid).map((r) => r.ProcessId)
    for (const pid of pids) {
        try {
            execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' })
        }
        catch (e) {}
    }
    return pids
}

//以指定 settings 重啟 backend（殺現有 backend → node <SRV_PATH> <pathSettings> 重啟並等 ready）。
//用法：before restartBackend(genTempSettings({ language })), after restartBackend('./settings.json') 還原預設。
//opts.reseed=true：port 釋放後、spawn 前重跑 hermetic base seed（刪 ./db 重建），供「測試把資料弄到 UI/RPC 無法還原之狀態」
//（如 admin 自己 isActive='n' 後所有通道皆拒）的 api 測試還原用；seed 須在後端開 lmdb 前完成，故只能在此時機做。
export async function restartBackend(pathSettings = './settings.json', opts = {}) {
    //殺自建後端樹並等 port 釋放；無自建而 11006 被佔用（reuse / 外部啟動之同專案後端）→ 殺其監聽者並等釋放（明文例外）；
    //reseed 於 spawn 前執行（見 services.backend.beforeSpawn）
    const { reseed = false } = opts
    await services.restart('backend', { args: [pathSettings], hookArg: { reseed } })
}

export function cleanup() {
    services.cleanup()
}

//確定性渲染組六旗標（套件 chromiumLaunchArgs，與本專案原組逐項相同，依據見 spec/設計要點與取捨.md ADR-020）。
//why：2026-08 查得側欄選單（WListVertical→WPanelScrolly 捲動內容層）launch 級 1px 剛性位移 flake——
//DOM layout 整數穩定、同 launch 連拍位元級穩定、失敗時內容連 AA 色階原封不動整體左移 1px（testPending 四組
//現場逐像素驗證 capture(x,y)==baseline(x+1,y) 零失配）→ 誤差在 raster/compositing 層之 launch 級非決定性，
//非字形 subpixel 重畫、非 DOM/scrollLeft（scrollWidth==clientWidth 實測排除）。本專案原為三姊妹專案中唯一
//裸 launch 者。根因調查全文見 spec/設計要點與取捨.md。
export async function launchBrowser() {
    return await pkgLaunchBrowser()
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

//切語系（非 eng 才切；預設語系亦補等量 settle 600ms，治 eng-vs-cht layout 收斂不對稱，sso 殷鑑）。
//收斂自 9 個測試檔各自一份之逐字相同副本（2026-09-28）。
export async function setLang(page, lang) {
    if (lang !== 'eng') {
        await page.evaluate((l) => {
            window.$vo.$ui.setLang(l, 'e2e-setLang')
        }, lang)
    }
    await page.waitForTimeout(600)
}

//主表工具列圖示鈕之 mdi path（mdiPlus / mdiCloudUploadOutline / mdiContentCopy / mdiTrashCanOutline），以 path 定位 WButtonCircle。
//收斂自 grups / pemis / targets / users 之 MDI＋iconBtn 與三個 rela-* 之 TOOLBAR_MDI＋pathBtn（逐字相同，2026-09-28）。
export const MDI = {
    plus: 'M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z',
    upload: 'M6.5 20Q4.22 20 2.61 18.43 1 16.85 1 14.58 1 12.63 2.17 11.1 3.35 9.57 5.25 9.15 5.88 6.85 7.75 5.43 9.63 4 12 4 14.93 4 16.96 6.04 19 8.07 19 11 20.73 11.2 21.86 12.5 23 13.78 23 15.5 23 17.38 21.69 18.69 20.38 20 18.5 20H13Q12.18 20 11.59 19.41 11 18.83 11 18V12.85L9.4 14.4L8 13L12 9L16 13L14.6 14.4L13 12.85V18H18.5Q19.55 18 20.27 17.27 21 16.55 21 15.5 21 14.45 20.27 13.73 19.55 13 18.5 13H17V11Q17 8.93 15.54 7.46 14.08 6 12 6 9.93 6 8.46 7.46 7 8.93 7 11H6.5Q5.05 11 4.03 12.03 3 13.05 3 14.5 3 15.95 4.03 17 5.05 18 6.5 18H9V20M12 13Z',
    copy: 'M19,21H8V7H19M19,5H8A2,2 0 0,0 6,7V21A2,2 0 0,0 8,23H19A2,2 0 0,0 21,21V7A2,2 0 0,0 19,5M16,1H4A2,2 0 0,0 2,3V17H4V3H16V1Z',
    trash: 'M9,3V4H4V6H5V19A2,2 0 0,0 7,21H17A2,2 0 0,0 19,19V6H20V4H15V3H9M7,6H17V19H7V6M9,8V17H11V8H9M13,8V17H15V8H13Z',
}
export function iconBtn(page, path) {
    return page.locator(`div[role="button"]:has(svg path[d="${path}"])`)
}

//—— 四個 CRUD 清單頁（grups/pemis/targets/users）與三個 rela-* 關聯頁共用之互動原語（2026-09-28 收斂）——
//逐字相同後刪除本地定義、改自本檔 import：toggleEditMode／assertModalMsg（grups/pemis/targets/users +
//rela-grup-pemi/rela-pemi-rule/rela-user-grup 共 7 檔）、saveAndWaitModal／clickSave／clickAdd／cellHasWarn
//（grups/pemis/targets/users 4 檔）、gotoUsers（users/rela-user-grup 2 檔，body 亦逐字相同）。
//近似後參數化：checkRow 原 grups/pemis/users 之 col-id 為 'name'、targets 為 'id'，改 colId 參數（預設 'name'，
//targets 呼叫處傳 'id'）；gotoGrups／gotoPemis 原三檔僅 clickNavItem 後之行內註解不同（本體逐字相同），
//各收斂為一份、註解合併為 clickNavItem 之 why-scope 摘要（見該函式之完整說明）。

//導航至群組頁（user-facing：點左側「權限群組」導覽），等 ag-grid 載入。openApp 已等到 csLogin+webInfor，
//故此處 $t 譯文已就緒（lang-aware 取標籤）。clickNavItem 已限定於導覽面板內（why-scope 見該函式註解：
//欄序改版後某些欄表頭之 eng 文字與導覽選單同字，全頁定位會誤點表頭；自群組/使用者頁切過來時尤其容易命中）。
export async function gotoGrups(page) {
    const grupsLabel = await page.evaluate(() => window.$vo.$t('mmGrups'))
    await clickNavItem(page, grupsLabel)
    await waitUntilExist(page, '群組 ag-grid 列', () => document.querySelectorAll('.ag-row').length > 0, { timeout: 20000 })
    await page.waitForTimeout(500)
}
//導航至權限頁（user-facing：點左側「權限」導覽），等 ag-grid 載入；why-scope 同 gotoGrups。
export async function gotoPemis(page) {
    const pemisLabel = await page.evaluate(() => window.$vo.$t('mmPemis'))
    await clickNavItem(page, pemisLabel)
    await waitUntilExist(page, '權限 ag-grid 列', () => document.querySelectorAll('.ag-row').length > 0, { timeout: 20000 })
    await page.waitForTimeout(500)
}
//導航至使用者頁（user-facing：點左側「使用者」導覽），等 ag-grid 載入；why-scope 同 gotoGrups。
export async function gotoUsers(page) {
    const usersLabel = await page.evaluate(() => window.$vo.$t('mmUsers'))
    await clickNavItem(page, usersLabel)
    await waitUntilExist(page, '使用者 ag-grid 列', () => document.querySelectorAll('.ag-row').length > 0, { timeout: 20000 })
    await page.waitForTimeout(500)
}
//切換編輯模式（點 WSwitch，以「Edit mode/編輯模式」標籤觸發其 click 區）。預設編輯模式 ON，唯讀案例需切一次關閉（各呼叫處皆為關閉）。
//偵測工具列新增鈕消失（編輯模式已關、工具列已重繪）後，等表格欄位重排（增/減拖曳·勾選欄）靜止（waitGridIdle），
//取代固定 2 秒（2026-09-28；固定秒數於負載高時可能截到重排中之表格）
export async function toggleEditMode(page) {
    const label = await page.evaluate(() => window.$vo.$t('modeEdit'))
    await page.getByText(label, { exact: true }).first().click()
    await iconBtn(page, MDI.plus).first().waitFor({ state: 'hidden', timeout: 60000 })
    await waitGridIdle(page, { timeout: 60000 })
}
//「編輯模式」開關整顆（WSwitch 之可點根：開關與標籤文字）之 Locator，供點擊前截圖之紅框目標（2026-09-28 E 第 1 期試點）。
//與 toggleEditMode 點的是同一個標籤；取其最近之 inline style 帶 `cursor: pointer` 之祖先（同 w-web-sso e2e-tokens editSwitchLoc）。
export async function editSwitchLoc(page) {
    const label = await page.evaluate(() => window.$vo.$t('modeEdit'))
    return page.getByText(label, { exact: true }).first().locator('xpath=ancestor::div[contains(@style,"cursor: pointer")][1]')
}
//勾選某列（col-id 欄的 row-select checkbox），使 copy/delete 工具列按鈕出現。
//colId：grups/pemis/users 為 'name'（預設），targets 為 'id'（呼叫處顯式傳入）。
export async function checkRow(page, rowIndex, colId = 'name') {
    await page.locator(`.ag-row[row-index="${rowIndex}"] .ag-cell[col-id="${colId}"] input[type="checkbox"]`).first().click()
    await page.waitForTimeout(500)
}
//點新增（mdiPlus），新列插入最首 row-index 0。
export async function clickAdd(page) {
    await iconBtn(page, MDI.plus).first().click()
    await page.waitForTimeout(600)
}
//點工具列存檔鈕（mdiCloudUploadOutline）。
export async function clickSave(page) {
    await iconBtn(page, MDI.upload).first().click()
}
//該 cell 是否出現警告 icon（errItemsByXxx → <img warning>）。
export async function cellHasWarn(page, rowIndex, colId) {
    return await page.evaluate(({ r, c }) => {
        return !!document.querySelector(`.ag-row[row-index="${r}"] .ag-cell[col-id="${c}"] img`)
    }, { r: rowIndex, c: colId })
}
//按 save → 等 CheckYes 結果 modal 出現（System Message 標題 + OK 鈕）→ 停在 modal 顯示態供截圖。
//系統以持久 CheckYes modal 呈現「操作主要結果」：成功 / 失敗 / errInNames（前端擋存）/ 空皆 showCheckYes，
//故統一以 systemMessage 標題偵測 modal 出現。
export async function saveAndWaitModal(page) {
    await clickSave(page)
    await waitUntilExist(page, 'CheckYes 結果 modal（systemMessage 標題）', () => {
        const vo = window.$vo
        return (document.body.innerText || '').includes(vo.$t('systemMessage'))
    }, { timeout: 20000 })
    await page.waitForTimeout(800) //modal 進場 settle（captureStable 再 retry-until-stable 收斂）
}
//語意斷言：結果 modal 顯示指定 i18n 訊息（lang-aware，eng/cht 皆適用）。對 fail 類只斷言前綴鍵，不含動態字尾。
export async function assertModalMsg(page, i18nKey) {
    const msg = await page.evaluate((k) => window.$vo.$t(k), i18nKey)
    const txt = await page.evaluate(() => document.body.innerText)
    assert.ok(txt.includes(msg), `結果 modal 應顯示 ${i18nKey}（${msg}）`)
}

//pixel baseline 截圖統一 helper（套件 captureStable，與 sso 同一實作）。順序：park mouse → 初始等待 1500ms →
//settle：WDrawer 拖曳分隔條 overlay opacity=1（waitColResizeOverlay）、抽屜 [state] 皆為 opened/hidden（waitDrawerReady）→
//凍結 inline SVG SMIL → 等字型 → 連拍前 ag-grid 水平捲動歸零並等 300ms（resetAgGridScroll，本專案原第⑦步）→
//<img> 內 SVG 動畫區截圖後貼去動畫之靜態影格（套件 imgSmilFill 預設 'static'，2026-09-28 起；頁面座標，同日修正原視窗座標之錯位）→ 連拍至相鄰兩張相同。
//strict：opts.strict 為布林值時依之，否則讀 E2E_STRICT_CAPTURE（各檔 generateBaseline() 於迴圈前設 '1'，regen 端拒絕寫入未 settle 畫面）。
//【park mouse + tooltip 處理原則 — 只用使用者可達操作】（各 agent 改 e2e 時依循）
//w-component-vue 按鈕若帶 tooltip，點擊後 tooltip 彈出、滑鼠移出才消失。
//  · park mouse（mouse.move(0,0)＝使用者真實移開游標）會觸發 mouseleave → tooltip 消失 → 截圖穩定；單純出現 dialog 遮罩時亦同（最小重現）。
//  · park 後提示框仍在即缺陷，不是可接受狀態（2026-09-29 更正原載「dialog 全屏遮蔽層擋住 mouseleave，此類 case 截圖會含 tooltip，視為可接受」）。
//    曾見成因：w-component-vue ≤2.5.23 之 WButtonCircle 於點擊時以 v-if 換掉游標下之圖示（promiseUnlock 載入圖示），接著出現 dialog 遮罩時
//    mouseleave 未送達觸發區（清單頁 Save 鈕、所屬對話框標題列 Save 鈕）；2.5.24 起圖示層與停用遮罩 pointer-events:none 已修正（ADR-025）。
//    截圖前以 probeStuckTooltip 守門：再出現即拋錯使該案失敗（不凍結為標準圖）。
//  · 絕不以合成事件（dispatchEvent mouseleave 等）強清 tooltip——那非使用者可達操作（L5），違反 e2e act 須 user-facing。
export async function captureStable(page, opts = {}) {
    return await pkgCaptureStable(page, { settle: [waitColResizeOverlay, waitDrawerReady], ...opts, beforeShots: [probeStuckTooltip, ...(opts.beforeShots || [resetAgGridScroll])] })
}

//probeStuckTooltip: 提示框殘留之回歸守門（技能 role-coder-for-test-e2e §10〈提示框／hover 殘留〉）。captureStable 已將游標移至 (0,0)
//並等待 ≥1.5 秒，此時仍顯示之 hover 型提示框（WTooltip mode='tooltip'，文字不限）必為殘留，拋錯使該案失敗（2026-09-30 起；元件修正前為只認
//saveChanges 之 knownDefect pending——因此漏掉所屬對話框標題列 Save 鈕之殘留，6 張標準圖被凍結）。點開型浮層（mode='popup'：WPopup、下拉清單）
//為刻意開啟，不在此列。判斷由套件 probeStuckTooltip 執行（1.0.3 起；原四專案各自手寫之同一實作收斂至套件，未給 rootSel 時頁內邏輯與原實作相同）：
//以 WTooltip 內部結構辨識（$refs.divTrigger／divContent、props.mode、data.valueTrans），根實例取 window.$vo（App.vue 掛上），無則取 body 直屬元素之 __vue__。
//元件改寫會使其找不到提示框而一律通過（靜默失效），升級 w-component-vue 時須以真元件頁複驗（規則帳本）。本檔只注入錯誤訊息（指出成因與先查何處）。
async function probeStuckTooltip(page) {
    return await pkgProbeStuckTooltip(page, {
        createError: (texts) => new Error(`游標已移開，提示框「${texts.join('」「')}」仍顯示（提示框殘留；w-component-vue 2.5.24 已修正 WButtonCircle 之成因，再現即回歸，先確認已安裝之 WButtonCircle.vue 圖示層仍帶 pointer-events:none）`),
    })
}

//整張全頁截圖 + 在「此 e2e 要比對/觀看的區塊」外圍畫紅框（#f26、5px）標注，讓報表/審查委員一眼看出本
//case 主要觀看哪一區，截圖仍為完整畫面、保留 UI 脈絡，不裁切成小片。移植自 w-web-api test/e2e-setup.mjs。
//target：CSS selector 字串 / 字串陣列 / Playwright Locator / 視窗座標矩形 {x,y,width,height} / 以上混合陣列（多個取聯集框成一個框）。
//  ——欄位列須依 label 文字定位時用 Locator（如 page.locator(...).filter({ hasText: '名稱' })）。
//  ——canvas 內無 DOM 節點之目標（echarts 圖例項目、翻頁鈕）以矩形給定（見 readStaLegend 之 rect 欄位）。
//fold 以下的目標會先把第一個 scrollIntoView 捲進視窗再框（同組目標應在同一捲動位置；矩形為已量得之視窗座標，不捲動）。
//紅框於截圖後以 sharp 疊圖，不改動被測頁 DOM（套件 captureStableWithBox）。why：w-web-api 實測記載 headless Chromium
//對「插入後移除的暫時 DOM」偶發整頁偏移 1px（api test/e2e-edit.test.mjs:37 toast 殷鑑）；本專案 2026-08
//查得側欄 1px 剛性位移 flake（launch 級二態），紅框 DOM mutation 為可疑 invalidation 觸發源之一，
//故量測工具自身不改動被測頁之 DOM/layer tree。幾何：聯集 rect ±6 外擴、四邊夾在截圖當下之視窗內（M=3，clampTo:'viewport'，
//本專案原實作即如此，與技能 §8.3 一致）、5px #f26 框線、圓角 4px、不做過小守門（guardSmall:false，同原實作）。
//目標與捲動量皆在截圖「之前」量；疊圖在 captureStable 內建遮罩之後（框永遠可見）。
export async function captureStableWithBox(page, target, opts = {}) {
    return await pkgCaptureStableWithBox(page, target, { clampTo: 'viewport', guardSmall: false, ...opts, capture: captureStable })
}

//框「整列」用 selector：ag-grid 一列跨 center + pinned-left 兩容器（勾選框欄在 pinned-left），
//回傳兩選擇器供 captureStableWithBox 取聯集，框出涵蓋整列（含勾選框）的紅框；單一 .ag-row 選擇器
//只會 querySelector 到其中一個容器、漏掉另一半（殷鑑：勾選框在 pinned-left）。
//順序不中性（captureStableWithBox 只把第一個目標捲入視窗）：本專案為 center 在前（套件 rowBoxSel 之 order 指定）。
export function rowBoxSel(rowIndex) {
    return pkgRowBoxSel(rowIndex, { order: ['center', 'pinned-left'] })
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

//導覽區「隱藏選單」／「顯示選單」圓鈕（LayoutContent.vue:59,114）：WButtonCircle 無 title/aria 且本二鈕 tooltip 已停用，以 mdi path 定位。
//收斂自 e2e-layout 原本檔內之 MDI / iconBtn / waitDrawerSettled（e2e-stainfor 之導覽收合案例亦用）。
export const NAV_MDI = {
    hide: 'M7,12L12,7V10H16V14H12V17L7,12M21,16.5C21,16.88 20.79,17.21 20.47,17.38L12.57,21.82C12.41,21.94 12.21,22 12,22C11.79,22 11.59,21.94 11.43,21.82L3.53,17.38C3.21,17.21 3,16.88 3,16.5V7.5C3,7.12 3.21,6.79 3.53,6.62L11.43,2.18C11.59,2.06 11.79,2 12,2C12.21,2 12.41,2.06 12.57,2.18L20.47,6.62C20.79,6.79 21,7.12 21,7.5V16.5M12,4.15L5,8.09V15.91L12,19.85L19,15.91V8.09L12,4.15Z', //mdiArrowLeftBoldHexagonOutline（隱藏選單）
    show: 'M17,12L12,17V14H8V10H12V7L17,12M21,16.5C21,16.88 20.79,17.21 20.47,17.38L12.57,21.82C12.41,21.94 12.21,22 12,22C11.79,22 11.59,21.94 11.43,21.82L3.53,17.38C3.21,17.21 3,16.88 3,16.5V7.5C3,7.12 3.21,6.79 3.53,6.62L11.43,2.18C11.59,2.06 11.79,2 12,2C12.21,2 12.41,2.06 12.57,2.18L20.47,6.62C20.79,6.79 21,7.12 21,7.5V16.5M12,4.15L5,8.09V15.91L12,19.85L19,15.91V8.09L12,4.15Z', //mdiArrowRightBoldHexagonOutline（顯示選單）
}
export function navBtn(page, which) {
    return page.locator(`div[role="button"]:has(svg path[d="${NAV_MDI[which]}"])`)
}
//等導覽區收合／展開落定——採「使用者可觀察之幾何」：目標圓鈕已出現 + 面板與內容區 rect 連續 3 次取樣不變。
//不用 WDrawer 根節點 [state]（hidden/opened）：w-component-vue 2.5.13 於負載高時 [state] 偶發卡在 hiding/opening 直到 200s 兜底
//（wsemi domIsStable core() 丟棄 await 前的動畫、v-domstable 只在翻轉時 emit），2.5.14 + wsemi 1.8.94 已修（transitionend 為主訊號、兜底 1.3s）；
//幾何訊號為使用者可觀察之終態，故沿用。根因史見 CLAUDE_experience.md。
export async function waitNavSettled(page, collapsed) {
    await navBtn(page, collapsed ? 'show' : 'hide').first().waitFor({ state: 'visible', timeout: 15000 })
    const snap = () => page.evaluate((sel) => {
        const r = (e) => {
            if (!e) return null
            const b = e.getBoundingClientRect()
            return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]
        }
        const panel = document.querySelector(sel)
        const content = document.querySelector('canvas') || document.querySelector('.ag-root-wrapper')
        return JSON.stringify({ panel: r(panel), panelDisp: panel ? getComputedStyle(panel).display : null, content: r(content) })
    }, SEL_NAV)
    const t0 = Date.now()
    let last = null
    let same = 0
    while (Date.now() - t0 < 15000) {
        const cur = await snap()
        const o = JSON.parse(cur)
        const atRest = collapsed ? (o.panelDisp === 'none' || (o.panel && o.panel[2] === 0)) : (o.panel && o.panel[0] === 0 && o.panel[2] > 0 && o.panelDisp !== 'none')
        if (atRest && cur === last) {
            if (++same >= 3) {
                await page.waitForTimeout(300)
                return
            }
        }
        else {
            same = 0
            last = cur
        }
        await page.waitForTimeout(200)
    }
    throw new Error(`導覽區${collapsed ? '收合' : '展開'}未於 15s 內落定（last=${last}）`)
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
    //框線不壓框外內容(2026-09-28, 業主: 亂框亂壓遮蔽有效資訊即缺陷): 一律經 itemsUnionBox fit——模式段與緊鄰之名稱段: 框線在兩者可見內容之間隙正中、
    //teleport 之清單(position:fixed 浮層)與其項目: 框線置於清單內容(或項目)與清單外內容(觸發晶片、背後晶片)之間隙正中、項目間取間隙正中, 四周空白處照常外擴(原框線外擴 6px 蓋到背後晶片與鄰段文字)
    const clickMode = await captureStableWithBox(page, itemsUnionBox(page.locator(target).first(), { fit: true }))
    await page.locator(`${cell} div[_tabindex="0"]`).first().click()
    const popup = page.locator('.WPopperFix[wtlp="modeSelect"]:visible')
    await popup.first().waitFor({ state: 'visible', timeout: 10000 })
    await page.waitForTimeout(400)
    const listOpen = await captureStableWithBox(page, itemsUnionBox(popup.first(), { fit: true }))
    const item = popup.locator('div[tabindex="0"]').filter({ hasText: new RegExp(`^\\s*${mode}\\s*$`) }).first()
    const clickItem = await captureStableWithBox(page, itemsUnionBox(item, { fit: true }))
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
    //框線不壓框外內容: 「+K」與緊鄰之標籤: 框線在兩者可見內容之間隙正中; 浮層框線置於浮層內容與背後表格列之間隙正中(同 setDialogModeWithShots, 2026-09-28)
    const clickBtn = await captureStableWithBox(page, itemsUnionBox(btn, { fit: true }))
    await btn.click()
    const popup = page.locator('.WPopperFix[wtlp="relationChipsAll"]:visible')
    await popup.first().waitFor({ state: 'visible', timeout: 10000 })
    await page.waitForTimeout(500)
    const popupOpen = await captureStableWithBox(page, itemsUnionBox(popup.first(), { fit: true }))
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
    //框線不壓框外內容(同 setDialogModeWithShots, 2026-09-28)
    const clickMode = await captureStableWithBox(page, itemsUnionBox(modeSeg, { fit: true }))
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
    const listOpen = await captureStableWithBox(page, itemsUnionBox(list.first(), { fit: true }))
    const item = list.locator('div[tabindex="0"]').filter({ hasText: new RegExp(`^\\s*${mode}\\s*$`) }).first()
    const clickItem = await captureStableWithBox(page, itemsUnionBox(item, { fit: true }))
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

//開啟「所屬」關聯對話框（VePemiBlngGrups／VeGrupBlngUsers）：col-id、偵測用之標題 i18n 鍵、waitUntilExist 之
//除錯標籤皆依對話框而異（rela-grup-pemi 用 colId:'belongGrups'／titleKey:'pemiBlngEditGrups'；rela-user-grup
//用 colId:'belongUsers'／titleKey:'grupBlngEditUsers'），故參數化；除此三值外兩檔原各自一份之同名函式本體
//逐字相同（2026-09-28 收斂）。titleKey 以 waitUntilExist 之 arg 傳遞（fn 跨 process 序列化不可 closure）。
export async function openBelongDialog(page, rowIndex, { colId, titleKey, label }) {
    await page.locator(`.ag-row[row-index="${rowIndex}"] .ag-cell[col-id="${colId}"] button`).first().click()
    await waitUntilExist(page, label, (k) => {
        const vo = window.$vo
        return (document.body.innerText || '').includes(vo.$t(k))
    }, { timeout: 15000, arg: titleKey })
    await waitDialogGrid(page)
}
//點對話框 Save → 等 CheckYes 結果 modal 出現（systemMessage 標題）→ 停在 modal 顯示態供截圖。
//收斂自 e2e-rela-grup-pemi／e2e-rela-user-grup 兩檔逐字相同之同名函式（2026-09-28）。
export async function saveBelongAndWaitModal(page) {
    await clickDialogSave(page)
    await waitUntilExist(page, 'CheckYes 結果 modal（systemMessage 標題）', () => {
        const vo = window.$vo
        return (document.body.innerText || '').includes(vo.$t('systemMessage'))
    }, { timeout: 20000 })
    await page.waitForTimeout(800) //modal 進場 settle
}

//等待 DOM 條件（每步驟先偵測再操作，取代 fixed sleep）；套件 waitUntilExist，本專案預設逾時 15000ms（沿用原值）。
export async function waitUntilExist(page, label, fn, opts = {}) {
    await pkgWaitUntilExist(page, label, fn, { timeout: 15000, ...opts })
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

//—— 統計頁「事件發生頻率」圖例共用 helper（e2e-stainfor、e2e-layout 共用；圖例畫在 canvas 內、無 DOM 節點）——
//圖例是事件顯示切換之唯一入口；一般式放不下時改捲動式（單列＋翻頁鈕，src/js/legendFit.mjs）。DOM 選不到 →
//由圖表實例之 zrender 顯示列表取各元素之視窗矩形，再以真滑鼠點擊（L2，selector 不可得時之合法層級），非 dispatchAction 程式直呼。
//元素結構（echarts 6.1.0 / zrender 6，皆以公開之 parent / getClipPath / transformCoordToGlobal 讀取）：
//  圖例文字＝TSpan（parent 為 ZRText，其 parent 為含圖示之項目群組）；翻頁鈕＝名為 pagePrev / pageNext 之 Path；
//  頁次＝名為 pageText 之 ZRText（文字在其 TSpan）；捲動式之可視窗＝項目上層群組之 clipPath（ScrollableLegendView.js:213-225）。
//  放得下時翻頁鈕仍在但設 invisible（同檔 :226-233），故以 invisible 判定是否顯示；窗外項目仍在顯示列表只是被裁掉，須以 inWindow 區分。
//座標一律於 getDisplayList(true) 更新後讀取（echarts resize 不 flush，resize 後直接讀會拿到上一個寬度之排版）。
const EVAL_STA_LEGEND = `(() => {
    const find = (vm) => { if (!vm) return null; if (vm.optEvent !== undefined && vm.legendType !== undefined && vm.$refs && vm.$refs.chartEvent) return vm; for (const c of (vm.$children || [])) { const r = find(c); if (r) return r } return null }
    const vm = find(window.$vo)
    if (!vm || !vm.optEvent || !vm.$refs.chartEvent) return null
    const chart = vm.$refs.chartEvent.getChart()
    if (!chart) return null
    const box = chart.getDom().getBoundingClientRect()
    const names = (vm.optEvent.series || []).map((s) => s.name)
    const view = (el, r) => {
        const a = el.transformCoordToGlobal(r.x, r.y)
        const b = el.transformCoordToGlobal(r.x + r.width, r.y + r.height)
        return { x: box.left + Math.min(a[0], b[0]), y: box.top + Math.min(a[1], b[1]), width: Math.abs(b[0] - a[0]), height: Math.abs(b[1] - a[1]) }
    }
    const clipOf = (el) => {
        for (let p = el; p; p = p.parent) {
            const c = typeof p.getClipPath === 'function' ? p.getClipPath() : null
            if (c) return view(c, c.getBoundingRect())
        }
        return null
    }
    const items = []
    const pager = { prev: null, next: null, text: null, textRect: null }
    for (const el of chart.getZr().storage.getDisplayList(true)) {
        if (typeof el.transformCoordToGlobal !== 'function') continue
        if (el.name === 'pagePrev' || el.name === 'pageNext') {
            pager[el.name === 'pagePrev' ? 'prev' : 'next'] = el.invisible ? null : { rect: view(el, el.getBoundingRect()), active: el.cursor === 'pointer' }
            continue
        }
        if (el.parent && el.parent.name === 'pageText') {
            if (!el.invisible) { pager.text = el.style ? el.style.text : null; pager.textRect = view(el, el.getBoundingRect()) }
            continue
        }
        const t = el.style && el.style.text
        if (!t || !names.includes(t)) continue
        const text = view(el, el.getBoundingRect())
        const grp = el.parent && el.parent.parent
        const whole = grp && typeof grp.getBoundingRect === 'function' ? view(grp, grp.getBoundingRect()) : text
        const clip = clipOf(el)
        const inWindow = !clip || (whole.x >= clip.x - 0.5 && whole.x + whole.width <= clip.x + clip.width + 0.5)
        items.push({ name: t, text, whole, inWindow })
    }
    const tops = []
    let top = Infinity
    let bottom = -Infinity
    for (const it of items) {
        const a = it.text.y - box.top
        if (!tops.includes(Math.round(a))) tops.push(Math.round(a))
        top = Math.min(top, a)
        bottom = Math.max(bottom, a + it.text.height)
    }
    const parts = items.filter((it) => it.inWindow).map((it) => it.whole)
        .concat([pager.prev && pager.prev.rect, pager.textRect, pager.next && pager.next.rect].filter(Boolean))
    const legendRect = parts.length === 0 ? null : (() => {
        const x = Math.min(...parts.map((r) => r.x))
        const y = Math.min(...parts.map((r) => r.y))
        return { x, y, width: Math.max(...parts.map((r) => r.x + r.width)) - x, height: Math.max(...parts.map((r) => r.y + r.height)) - y }
    })()
    const lg = chart.getOption().legend[0] || {}
    const selected = lg.selected || {}
    return {
        vw: window.innerWidth,
        chartW: chart.getWidth(),
        contW: chart.getDom().clientWidth,
        type: lg.type,
        legendType: vm.legendType,
        names,
        found: items.length,
        rows: tops.length,
        top: Math.round(top * 10) / 10,
        bottom: Math.round(bottom * 10) / 10,
        items,
        pager,
        scrollDataIndex: lg.scrollDataIndex,
        selected,
        hidden: names.filter((n) => selected[n] === false),
        legendRect,
    }
})()`

//讀統計圖圖例狀態：{ vw, chartW, contW, type（圖上）, legendType（元件判定）, names, found, rows, top/bottom（圖例文字相對圖頂之 px）,
//  items:[{ name, text（文字矩形）, whole（含圖示之項目矩形；比實際墨跡寬約 3px，框線夾邊前以套件 canvasInkRects 收斂）, inWindow }], pager:{ prev/next:{rect,active}|null, text, textRect },
//  scrollDataIndex, selected, hidden（被隱藏之事件）, legendRect（可視項目＋翻頁鈕之聯集，供紅框框住圖例列）}；圖表未就緒回 null。
export async function readStaLegend(page) {
    return await page.evaluate(EVAL_STA_LEGEND)
}

//等圖例落定（連續 3 次取樣之狀態全同）：改寬、切類型、翻頁（平移動畫 800ms）、切換事件之後使用。
export async function waitStaLegendSettled(page, opts = {}) {
    const { timeout = 15000, interval = 250, n = 3 } = opts
    const t0 = Date.now()
    let prev = null
    let same = 0
    while (Date.now() - t0 < timeout) {
        await page.waitForTimeout(interval)
        const cur = JSON.stringify(await readStaLegend(page))
        if (cur !== 'null' && cur === prev) {
            if (++same >= n - 1) return JSON.parse(cur)
        }
        else {
            same = 0
            prev = cur
        }
    }
    throw new Error(`統計圖圖例未於 ${timeout}ms 內落定（last=${prev}）`)
}

//圖例排版不變條件（spec/流程_統計資訊事件展示.md〈補充〉圖例排版規則）：圖寬＝容器寬；每個事件皆有圖例；圖例在圖頂（頂 ≤ 10）；
//圖上類型＝元件判定；一般式時圖例底 ≤ 57（繪圖區頂 65、最上方刻度文字頂 59，再留白 2）；捲動式時單列且底 ≤ 57。違反即 throw 並列出全部違反項。
export function assertStaLegendLayout(s, tag) {
    if (!s) throw new Error(`${tag} 取不到統計圖圖例狀態`)
    const bad = []
    if (s.chartW !== s.contW) bad.push(`圖寬 ${s.chartW} ≠ 容器寬 ${s.contW}`)
    if (s.found !== s.names.length) bad.push(`圖例項目數 ${s.found} ≠ 事件數 ${s.names.length}`)
    if (!(s.top <= 10)) bad.push(`圖例頂 ${s.top} > 10（不在圖頂）`)
    if (s.type !== s.legendType) bad.push(`圖上類型 ${s.type} ≠ 元件判定 ${s.legendType}`)
    if (!(s.bottom <= 57)) bad.push(`圖例底 ${s.bottom} > 57（壓到最上方刻度或繪圖區）`)
    if (s.type === 'scroll' && s.rows !== 1) bad.push(`捲動式應為單列，實得 ${s.rows} 列`)
    if (bad.length > 0) throw new Error(`${tag} 圖例排版不符：${bad.join('；')}`)
}

//點圖例中某事件（切換顯示／隱藏）。只點可視窗內者：捲動式時窗外項目雖在顯示列表但被裁掉，點其座標會落在翻頁鈕或空白。
export async function clickStaLegendItem(page, name) {
    const s = await readStaLegend(page)
    const it = s && s.items.find((o) => o.name === name && o.inWindow)
    if (!it) throw new Error(`圖例中找不到可點之事件「${name}」（捲動式時須先翻到該頁）：${JSON.stringify(s && s.items.map((o) => [o.name, o.inWindow]))}`)
    await page.mouse.click(it.text.x + it.text.width / 2, it.text.y + it.text.height / 2)
    await page.waitForTimeout(1200) //圖例切換與折線移除重繪
    await page.mouse.move(0, 0) //離開圖例，消 hover 高亮與全名提示
}

//點捲動式圖例之翻頁鈕（which：'next' | 'prev'）。停用態（已在首頁／末頁）或未顯示時 throw。
export async function clickStaLegendPager(page, which) {
    const s = await readStaLegend(page)
    const b = s && s.pager && s.pager[which]
    if (!b) throw new Error(`圖例翻頁鈕 ${which} 未顯示（非捲動式或一列放得下）`)
    if (!b.active) throw new Error(`圖例翻頁鈕 ${which} 為停用態（已在首頁或末頁）`)
    await page.mouse.click(b.rect.x + b.rect.width / 2, b.rect.y + b.rect.height / 2)
    await page.waitForTimeout(1200) //平移動畫 800ms（echarts legend animationDurationUpdate）
    await page.mouse.move(0, 0)
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
//pass: 靜默通過. fail: 將「當次 capture」「baseline」「diff 標紅圖」存檔 (帶 ms timestamp、撞檔加 -N, 永不覆蓋) 後 throw.
//  (./testPending 帶 timestamp 保留, 任何 fail 當次證據都留存可 diff; 已 gitignore, 不進 repo.)
//label: 給檔名用之可讀標籤 (如 'users-cht-E2E-003-account-duplicate'); 省略則用 baseline 檔名.
//opts.maxDiffPixels / opts.threshold: 可由呼叫端覆寫 (預設 100 / 0.1), 供個別 case 需更嚴/更鬆時用.
//套件 assertBaselineMatch (同步函數, 與原實作同判準、同證據檔名格式).
export function assertBaselineMatch(buf, baselinePath, label, opts = {}) {
    return pkgAssertBaselineMatch(buf, baselinePath, label, opts)
}


//收尾兩條觸發來源：mocha root after（框架環境）＋ exit / SIGINT / SIGTERM 備援（直跑 --baseline 由各檔主函式末尾顯式呼叫 cleanup）。
//模組頂層註冊：本檔被 api-setup.mjs 先 import，root after 因而排在其後之 hook 之前。cleanup 同步（exit 處理器內非同步不會被等待）。
registerCleanupHooks(cleanup, { afterTimeoutMs: 30000 })
