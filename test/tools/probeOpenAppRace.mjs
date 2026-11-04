//openApp 開頁競爭之重現與回歸探針(wp70, 2026-11-04; 規則帳本 R-TEST-OPENAPP-NOPREVISIT-01)。
//用法: node C:/opensrcOper/tools/quiet-run.mjs --lock --name probe-openapp -- node test/tools/probeOpenAppRace.mjs [--stall 0,3000,6000] [--reps 2]
//      (自起後端與前端 dev server 並於結束時 cleanup; 非測試案例, 不在 npm test 之範圍。)
//
//背景: 舊版 openApp 先 goto 無 token 之 baseUrl 再 evaluate 清 localStorage。無 token 之頁面 w-ui-loginout 等 timeWaitAnimation(2000 ms)後
//  走 App.vue:loginError → window.location.href = urlRedirect(dev server 之模板佔位未代換, 目標為 /%7BurlRedirect%7D, 頁面每約 2.8 s 自我重載),
//  故 goto 解決後 2 s 內若 evaluate 尚未被處理(測試行程被搶佔/卡頓), 即與導覽提交相撞 → `Execution context was destroyed`。
//手段: 於每次 page.goto 解決後以同步忙等阻塞「測試行程(node)事件迴圈」stallMs(Playwright 在行程恢復前讀不到瀏覽器已送出之
//  execution-context-destroyed 事件, 隨後送出之 evaluate 仍打向舊 context); 不加任何重試與等待於受測碼。
//三段:
//  ① real   = e2e-setup 之 openApp(受測對象): 每個 stall 都須通過。
//  ② legacy = 舊版 openApp 之逐字副本(wp70 修前 HEAD acc4bbe; 負對照): stall 0 須通過、stall ≥ 3000 須出現 DESTROYED
//             ——證明本探針仍有能力重現該競爭(探針自檢; 若 legacy 不再轉紅, 代表前提已變, 須重新查證而非當作通過)。
//  ③ fresh  = 全新 browser.newContext 之同源儲存為空(對照組: 同 browser 之 context A 寫入後, 另開 context B 讀為空)。
//離開碼: 0＝三段皆符合預期; 1＝任一不符。

import { startServersOnce, cleanup, launchBrowser, openApp, baseUrl, appUrl } from './e2e-setup.mjs'

const argv = process.argv.slice(2)
const arg = (k, d) => {
    const i = argv.indexOf(k)
    return i >= 0 ? argv[i + 1] : d
}
const stalls = String(arg('--stall', '0,3000,6000')).split(',').map(Number)
const reps = Number(arg('--reps', '2'))

//舊版 openApp 之逐字副本(去註解): test/tools/e2e-setup.mjs @ HEAD acc4bbe, 修正前。勿修改(負對照)。
async function openAppLegacy(browser, opts = {}) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...opts })
    const page = await context.newPage()
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 120000 }).catch(() => {})
    await page.evaluate(() => { try { localStorage.clear() } catch (e) {} })
    await page.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await page.waitForFunction(() => {
        const vo = window.$vo
        const st = vo && vo.$store && vo.$store.state
        return !!(st && st.connState === 'csLogin' && st.webInfor && st.syncState === true && vo.$t && vo.$t('mmUsers') !== 'mmUsers')
    }, null, { timeout: 60000 })
    return page
}

function sleepSync(ms) {
    const end = Date.now() + ms
    while (Date.now() < end) { /* 同步忙等: 模擬測試行程停滯 */ }
}

//接縫: page.goto 解決後同步阻塞 stallMs; 其餘方法原樣轉發
function seamBrowser(browser, stallMs) {
    const bind = (t, k) => {
        const v = t[k]
        return typeof v === 'function' ? v.bind(t) : v
    }
    return new Proxy(browser, {
        get(bt, bk) {
            if (bk !== 'newContext') {
                return bind(bt, bk)
            }
            return async (...a) => {
                const ctx = await bt.newContext(...a)
                return new Proxy(ctx, {
                    get(ct, ck) {
                        if (ck !== 'newPage') {
                            return bind(ct, ck)
                        }
                        return async (...b) => {
                            const page = await ct.newPage(...b)
                            return new Proxy(page, {
                                get(pt, pk) {
                                    if (pk !== 'goto') {
                                        return bind(pt, pk)
                                    }
                                    return async (...c) => {
                                        const r = await pt.goto(...c)
                                        if (stallMs > 0) {
                                            sleepSync(stallMs)
                                        }
                                        return r
                                    }
                                },
                            })
                        }
                    },
                })
            }
        },
    })
}

async function runOne(impl, stallMs) {
    const browser = await launchBrowser()
    try {
        await impl(seamBrowser(browser, stallMs))
        return { outcome: 'PASS', err: null }
    }
    catch (e) {
        const err = String(e.message).split('\n')[0]
        return { outcome: /Execution context was destroyed/.test(err) ? 'DESTROYED' : 'OTHER', err }
    }
    finally {
        await browser.close().catch(() => {})
    }
}

async function checkFresh() {
    const blank = `${baseUrl}/__probe_blank__`
    const html = '<!DOCTYPE html><html><body>blank</body></html>'
    const browser = await launchBrowser()
    try {
        const a = await browser.newContext()
        await a.route(blank, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: html }))
        const pa = await a.newPage()
        await pa.goto(blank)
        const written = await pa.evaluate(() => {
            localStorage.setItem('wperm:userToken', 'stale-token')
            return localStorage.length
        })
        await a.close()
        const b = await browser.newContext({ viewport: { width: 1440, height: 900 } })
        const st0 = await b.storageState()
        await b.route(blank, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: html }))
        const pb = await b.newPage()
        await pb.goto(blank)
        const read = await pb.evaluate(() => ({ lsLen: localStorage.length, cookie: document.cookie }))
        await b.close()
        return { written, cookies: st0.cookies.length, origins: st0.origins.length, ...read, ok: written === 1 && st0.cookies.length === 0 && st0.origins.length === 0 && read.lsLen === 0 && read.cookie === '' }
    }
    finally {
        await browser.close().catch(() => {})
    }
}

let failed = 0
try {
    await startServersOnce()
    console.log(`probeOpenAppRace stalls=${stalls.join(',')} reps=${reps}`)
    for (const [name, impl] of [['real', openApp], ['legacy', openAppLegacy]]) {
        for (const stallMs of stalls) {
            for (let r = 1; r <= reps; r++) {
                const x = await runOne(impl, stallMs)
                //期望: real 恆 PASS; legacy 於 stall 0 PASS、stall ≥ 3000 為 DESTROYED(之間之 stall 不判定)
                let expect = null
                if (name === 'real') {
                    expect = 'PASS'
                }
                else if (stallMs === 0) {
                    expect = 'PASS'
                }
                else if (stallMs >= 3000) {
                    expect = 'DESTROYED'
                }
                const ok = expect === null || x.outcome === expect
                if (!ok) {
                    failed++
                }
                console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} stall=${stallMs} rep=${r} => ${x.outcome}${expect ? ` (expect ${expect})` : ''}${x.err ? ` ${x.err}` : ''}`)
            }
        }
    }
    const f = await checkFresh()
    if (!f.ok) {
        failed++
    }
    console.log(`${f.ok ? 'ok  ' : 'FAIL'} fresh-context storage empty: ${JSON.stringify(f)}`)
}
finally {
    cleanup()
}
console.log(failed === 0 ? 'RESULT PASS' : `RESULT FAIL (${failed})`)
process.exitCode = failed === 0 ? 0 : 1
