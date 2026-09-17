// 以 Playwright(真滑鼠 hover)拍權限管理系統關聯彈窗之局部放大圖, 供目視確認 chip 間距與下拉裁切
// 用法: node tmp/zz_perm_zoom.mjs ; 產物: tmp/perm_probe/zoom-*.png(DPR 3)
import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'

let require = createRequire('C:/prrdd/最終處置計畫資料庫系統/rddmanager_2_perm/package.json')
let { chromium } = require('playwright')

let SSO = 'http://localhost:11007'
let PERM = 'http://localhost:11006'
let fdOut = path.resolve('./tmp/perm_probe')
fs.mkdirSync(fdOut, { recursive: true })
let sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function leafRect(page, t, pred) {
    return page.evaluate(({ t, pred }) => {
        let ls = [...document.querySelectorAll('*')].filter((el) => el.children.length === 0 && (el.innerText || '').trim() === t)
        if (pred === 'nav') {
            ls = ls.filter((el) => el.getBoundingClientRect().left < 200)
        }
        if (!ls.length) {
            return null
        }
        let b = ls[0].getBoundingClientRect()
        return { x: b.left, y: b.top, w: b.width, h: b.height }
    }, { t, pred })
}

async function gridOf(page, headText) {
    return page.evaluateHandle((headText) => {
        let hs = [...document.querySelectorAll('.ag-header-cell-text')].filter((e) => e.textContent.trim() === headText)
        return hs.length ? hs[hs.length - 1].closest('.ag-root-wrapper') : null
    }, headText)
}

async function main() {
    let browser = await chromium.launch({ headless: true, args: ['--disable-gpu', '--force-color-profile=srgb', '--disable-lcd-text', '--disable-font-subpixel-positioning'] })
    let context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 3 })
    let page = await context.newPage()

    //login via sso ui
    await page.goto(`${SSO}/?view=user`, { waitUntil: 'domcontentloaded' })
    let inputs = page.locator('input')
    await inputs.first().waitFor({ state: 'visible', timeout: 30000 })
    await inputs.nth(0).click()
    await page.keyboard.type('admin')
    await inputs.nth(1).click()
    await page.keyboard.type('admin@example.com')
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => document.body.innerText.includes('使用者資訊') && document.body.innerText.includes('登出'), null, { timeout: 60000 })
    let token = await page.evaluate(() => localStorage.getItem('rddmanager_main:userToken'))
    await page.goto(`${PERM}/?token=${token}`, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => {
        let ls = [...document.querySelectorAll('*')].filter((el) => el.children.length === 0 && (el.innerText || '').trim() === '管理使用者')
        return ls.some((el) => { let b = el.getBoundingClientRect(); return b.width > 0 && b.left >= 0 && b.left < 200 })
    }, null, { timeout: 90000 })
    await page.waitForFunction(() => !document.body.innerText.includes('等待數據中'), null, { timeout: 90000 })
    await sleep(1500)

    async function nav(t) {
        let r = await leafRect(page, t, 'nav')
        await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2)
        await page.waitForFunction((t) => [...document.querySelectorAll('*')].some((el) => el.children.length === 0 && (el.innerText || '').trim() === t && el.getBoundingClientRect().left > 200), t)
        await page.waitForFunction(() => !document.body.innerText.includes('等待數據中'), null, { timeout: 90000 })
        await page.waitForFunction(() => document.querySelectorAll('.ag-center-cols-container .ag-row').length > 0)
        await sleep(1200)
    }

    async function openDialog(rowText, btnText, title) {
        let r = await page.evaluate(({ rowText, btnText }) => {
            let hs = [...document.querySelectorAll('.ag-header-cell-text')].filter((e) => e.textContent.trim() === '名稱')
            let g = hs[hs.length - 1].closest('.ag-root-wrapper')
            let hit = [...g.querySelectorAll('.ag-row')].find((r) => (r.innerText || '').includes(rowText))
            let idx = hit.getAttribute('row-index')
            let row = g.querySelector('.ag-center-cols-container .ag-row[row-index="' + idx + '"]')
            let b = [...row.querySelectorAll('button')].find((b) => (b.innerText || '').includes(btnText))
            let bb = b.getBoundingClientRect()
            return { x: bb.left, y: bb.top, w: bb.width, h: bb.height }
        }, { rowText, btnText })
        await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2)
        await page.waitForFunction((t) => [...document.querySelectorAll('*')].some((el) => el.children.length === 0 && (el.innerText || '').trim() === t && el.getBoundingClientRect().width > 0), title)
        await page.waitForFunction(() => { let hs = [...document.querySelectorAll('.ag-root-wrapper')]; return hs.length >= 2 && hs[hs.length - 1].querySelectorAll('.ag-center-cols-container .ag-row').length > 0 })
        await sleep(1500)
    }

    async function selectRect(nameHead, rowIdx) {
        return page.evaluate(({ nameHead, rowIdx }) => {
            let hs = [...document.querySelectorAll('.ag-header-cell-text')].filter((e) => e.textContent.trim() === nameHead)
            let g = hs[hs.length - 1].closest('.ag-root-wrapper')
            let rows = [...g.querySelectorAll('.ag-center-cols-container .ag-row')].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
            let row = rows[rowIdx]
            let root = [...row.querySelectorAll('div[style*="width:72px"], div[style*="width: 72px"]')][0]
            let b = root.getBoundingClientRect()
            let rb = row.getBoundingClientRect()
            let vb = g.querySelector('.ag-body-viewport').getBoundingClientRect()
            return { x: b.left, y: b.top, w: b.width, h: b.height, row: { x: rb.left, y: rb.top, w: rb.width, h: rb.height }, vp: { x: vb.left, y: vb.top, w: vb.width, h: vb.height } }
        }, { nameHead, rowIdx })
    }

    async function closeDialog() {
        let r = await page.evaluate(() => {
            let d = 'M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z'
            let ps = [...document.querySelectorAll('svg path')].filter((p) => p.getAttribute('d') === d && p.getBoundingClientRect().width > 0)
            let b = ps[ps.length - 1].closest('svg').getBoundingClientRect()
            return { x: b.left, y: b.top, w: b.width, h: b.height }
        })
        await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2)
        await sleep(800)
    }

    //一、管理權限: 編輯所屬權限群組(多 chip)
    await nav('管理權限')
    await openDialog('知識管理系統_操作編輯_權限', '權限群組', '編輯所屬權限群組')
    let s = await selectRect('權限群組名稱', 1)
    //(a) 靜態: 前六列
    await page.mouse.move(5, 5)
    await sleep(300)
    await page.screenshot({ path: path.join(fdOut, 'zoom-pemiBlngGrups-rows.png'), clip: { x: s.vp.x, y: s.vp.y - 60, width: s.vp.w, height: 60 + 28 * 6 } })
    //(b) 真滑鼠 hover 在合併模式儲存格上
    await page.mouse.move(s.x + s.w / 2, s.y + s.h / 2)
    await sleep(600)
    await page.screenshot({ path: path.join(fdOut, 'zoom-pemiBlngGrups-hover.png'), clip: { x: s.vp.x, y: s.row.y - 30, width: s.vp.w, height: 28 * 4 } })
    //(c) 點開下拉
    await page.mouse.click(s.x + s.w / 2, s.y + s.h / 2)
    await page.waitForFunction(() => [...document.querySelectorAll('div[wtlp="modeSelect"]')].some((p) => p.getBoundingClientRect().width > 0))
    await sleep(600)
    await page.screenshot({ path: path.join(fdOut, 'zoom-pemiBlngGrups-open.png'), clip: { x: s.vp.x, y: s.row.y - 30, width: s.vp.w, height: 28 * 6 } })
    //(d) 選 AND 後, chip 之當前項會變紅並顯示 AND: 先關清單, 勾選該列「是否使用」再看 chip
    await page.mouse.click(s.vp.x + 20, s.vp.y - 70) //點對話框標題區關閉清單
    await sleep(500)
    let chk = await page.evaluate(({ rowIdx }) => {
        let hs = [...document.querySelectorAll('.ag-header-cell-text')].filter((e) => e.textContent.trim() === '權限群組名稱')
        let g = hs[hs.length - 1].closest('.ag-root-wrapper')
        let rows = [...g.querySelectorAll('.ag-center-cols-container .ag-row')].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
        let ib = rows[rowIdx].querySelector('input[type=checkbox]').getBoundingClientRect()
        return { x: ib.left, y: ib.top, w: ib.width, h: ib.height }
    }, { rowIdx: 1 })
    await page.mouse.click(chk.x + chk.w / 2, chk.y + chk.h / 2)
    await sleep(800)
    await page.mouse.move(5, 5)
    await sleep(300)
    await page.screenshot({ path: path.join(fdOut, 'zoom-pemiBlngGrups-checked.png'), clip: { x: s.vp.x, y: s.row.y - 30, width: s.vp.w, height: 28 * 4 } })
    //取消勾選還原(不儲存, 關閉即棄)
    await page.mouse.click(chk.x + chk.w / 2, chk.y + chk.h / 2)
    await sleep(500)
    await closeDialog()
    console.log('[zoom] pemiBlngGrups done')

    //二、管理使用者: 編輯使用權限群組(使用者截圖之彈窗)
    await nav('管理使用者')
    await openDialog('王小明', '權限群組', '編輯使用權限群組')
    let s2 = await selectRect('權限群組名稱', 0)
    await page.mouse.move(s2.x + s2.w / 2, s2.y + s2.h / 2)
    await sleep(600)
    await page.screenshot({ path: path.join(fdOut, 'zoom-cgrups-hover.png'), clip: { x: s2.vp.x, y: s2.row.y - 60, width: s2.vp.w, height: 28 * 5 } })
    await page.mouse.click(s2.x + s2.w / 2, s2.y + s2.h / 2)
    await page.waitForFunction(() => [...document.querySelectorAll('div[wtlp="modeSelect"]')].some((p) => p.getBoundingClientRect().width > 0))
    await sleep(600)
    await page.screenshot({ path: path.join(fdOut, 'zoom-cgrups-open.png'), clip: { x: s2.vp.x, y: s2.row.y - 60, width: s2.vp.w, height: 28 * 6 } })
    await page.mouse.click(s2.vp.x + 20, s2.vp.y - 30)
    await sleep(500)
    await closeDialog()
    console.log('[zoom] cgrups done')

    await browser.close()
    console.log('[done]')
}

main().catch((err) => {
    console.error('[fail]', err)
    process.exitCode = 1
})
