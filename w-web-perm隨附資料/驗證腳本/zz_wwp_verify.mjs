// 驗證修改後之 w-web-perm(建置於 tmp/wwp_build, 由 tmp/wwp_srv 之後端 11016 提供): 依「建議w-web-perm調整.md」第 8 節之判準逐條量測並截圖
// 用法: node tmp/zz_wwp_verify.mjs ; 產物: w-web-perm隨附資料/驗證截圖/*.png 與 verify.json
import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'

let require = createRequire('C:/prrdd/最終處置計畫資料庫系統/rddmanager_2_perm/package.json')
let { chromium } = require('playwright')

let SSO = 'http://localhost:11007'
let PERM = 'http://localhost:11016'
let fdOut = path.resolve('./w-web-perm隨附資料/驗證截圖')
fs.mkdirSync(fdOut, { recursive: true })
let sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let out = {}
let fails = []
function check(name, ok, detail) {
    out[name] = { ok: !!ok, detail }
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${JSON.stringify(detail)}`)
    if (!ok) {
        fails.push(name)
    }
}

//頁內共用函式(字串注入)
let H = `
let rc = (el) => { let b = el.getBoundingClientRect(); return { x: +b.left.toFixed(1), y: +b.top.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1), r: +b.right.toFixed(1), btm: +b.bottom.toFixed(1) } };
let cs = (el, ks) => { let s = getComputedStyle(el); let o = {}; ks.forEach((k) => { o[k] = s.getPropertyValue(k) }); return o };
let leaf = (t) => [...document.querySelectorAll('*')].filter((el) => el.children.length === 0 && (el.innerText || '').trim() === t);
let gridOf = (headText) => { let hs = [...document.querySelectorAll('.ag-header-cell-text')].filter((e) => e.textContent.trim() === headText); return hs.length ? hs[hs.length - 1].closest('.ag-root-wrapper') : null };
let heads = (g) => [...g.querySelectorAll('.ag-header-cell-text')].map((e) => e.textContent.trim());
let rowsOf = (g) => [...g.querySelectorAll('.ag-center-cols-container .ag-row')].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
let rowByText = (g, t) => { let hit = [...g.querySelectorAll('.ag-row')].find((r) => (r.innerText || '').includes(t)); if (!hit) return null; let idx = hit.getAttribute('row-index'); return g.querySelector('.ag-center-cols-container .ag-row[row-index="' + idx + '"]') || hit };
//本項 chip 之模式控制項: 帶行內寬度 56px 之 WTextSelect 根元素
let modeRoots = (el) => [...el.querySelectorAll('div[style*="width:56px"], div[style*="width: 56px"]')];
//chip: RelationChip 根元素(inline-flex + align-items:stretch, 帶 title); 展開全部鈕亦帶 title 但為 align-items:center
let chipsOf = (cell) => [...cell.querySelectorAll('div[title]')].filter((d) => /align-items:\\s*stretch/.test(d.getAttribute('style') || ''));
let btnAllOf = (cell) => [...cell.querySelectorAll('div[title]')].find((d) => /align-items:\\s*center/.test(d.getAttribute('style') || ''));
//「是否使用」勾選框: 以欄 col-id 定位(VeCgrups/VeCpemis 之 name 欄另有列勾選框, 不可取列內第一個 checkbox)
let enableChk = (row) => row.querySelector('.ag-cell[col-id="enable"] input[type=checkbox]');
`

async function evalH(page, body) {
    return page.evaluate(`(() => { ${H} ${body} })()`)
}

async function main() {
    let browser = await chromium.launch({ headless: true, args: ['--disable-gpu', '--force-color-profile=srgb', '--disable-lcd-text', '--disable-font-subpixel-positioning'] })

    async function openPerm(dpr) {
        let context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: dpr })
        let page = await context.newPage()
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
        return { context, page }
    }

    async function nav(page, t) {
        let r = await evalH(page, `let ls = leaf('${t}').filter((el) => el.getBoundingClientRect().left < 200); return ls.length ? rc(ls[0]) : null`)
        await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2)
        await page.waitForFunction((t) => [...document.querySelectorAll('*')].some((el) => el.children.length === 0 && (el.innerText || '').trim() === t && el.getBoundingClientRect().left > 200), t)
        await page.waitForFunction(() => !document.body.innerText.includes('等待數據中'), null, { timeout: 90000 })
        await page.waitForFunction(() => document.querySelectorAll('.ag-center-cols-container .ag-row').length > 0)
        await sleep(1200)
    }

    async function openDialog(page, rowText, btnText, title) {
        let r = await evalH(page, `let g = gridOf('名稱'); let row = rowByText(g, '${rowText}'); if (!row) return null; let b = [...row.querySelectorAll('button')].find((b) => (b.innerText || '').includes('${btnText}')); return b ? rc(b) : null`)
        if (!r) {
            throw new Error(`找不到 ${rowText} 之按鈕 ${btnText}`)
        }
        await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2)
        await page.waitForFunction((t) => [...document.querySelectorAll('*')].some((el) => el.children.length === 0 && (el.innerText || '').trim() === t && el.getBoundingClientRect().width > 0), title)
        await page.waitForFunction(() => { let hs = [...document.querySelectorAll('.ag-root-wrapper')]; return hs.length >= 2 && hs[hs.length - 1].querySelectorAll('.ag-center-cols-container .ag-row').length > 0 })
        await sleep(1500)
    }

    async function closeDialog(page) {
        let r = await page.evaluate(() => {
            let d = 'M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z'
            let ps = [...document.querySelectorAll('svg path')].filter((p) => p.getAttribute('d') === d && p.getBoundingClientRect().width > 0)
            let b = ps[ps.length - 1].closest('svg').getBoundingClientRect()
            return { x: b.left, y: b.top, w: b.width, h: b.height }
        })
        await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2)
        await sleep(800)
    }

    async function shot(page, name, clip) {
        let fp = path.join(fdOut, `${name}.png`)
        await page.screenshot({ path: fp, clip })
        console.log('[shot]', fp)
    }

    //================ A. 主表欄序與欄名 ================
    let { page } = await openPerm(1)
    await nav(page, '管理權限群組')
    let hg = await evalH(page, `return heads(gridOf('名稱'))`)
    check('A1.管理權限群組欄序', JSON.stringify(hg) === JSON.stringify(['名稱', '說明', '管控使用權限', '管控所屬使用者']), hg)
    await shot(page, 'A-管理權限群組主表')
    await nav(page, '管理權限')
    let hp = await evalH(page, `return heads(gridOf('名稱'))`)
    check('A2A3.管理權限欄序與欄名', JSON.stringify(hp) === JSON.stringify(['名稱', '說明', '管控對象', '管控所屬權限群組']), hp)
    await shot(page, 'A-管理權限主表')

    //================ B. 編輯所屬權限群組(VePemiBlngGrups) ================
    await openDialog(page, '知識管理系統_操作編輯_權限', '權限群組', '編輯所屬權限群組')
    let d1 = await evalH(page, `
        let g = gridOf('權限群組名稱'); let rows = rowsOf(g);
        let row0 = rowByText(g, '系統管理者編輯_權限群組');
        let cellChips = [...row0.querySelectorAll('.ag-cell')].find((c) => chipsOf(c).length > 0);
        let chips = chipsOf(cellChips);
        let gaps = chips.slice(1).map((c, i) => +(rc(c).x - rc(chips[i]).r).toFixed(1)).slice(0, 5);
        let btnAll = btnAllOf(cellChips);
        let mr = modeRoots(chips[0])[0];
        let shell = mr ? mr.querySelector('div[style*="border-radius"]') : null;
        let cell = mr ? mr.closest('.ag-cell') : null;
        return {
            heads: heads(g), nRows: rows.length, rowH: rc(rows[0]).h,
            nChips: chips.length, firstChipName: chips[0].getAttribute('title'), gaps, chipH: chips.slice(0, 3).map((c) => rc(c).h),
            innerH: [...chips[0].children].map((c) => rc(c).h),
            btnAllText: btnAll ? btnAll.innerText.trim() : null, btnAllRect: btnAll ? rc(btnAll) : null,
            mode: mr ? { root: rc(mr), shell: rc(shell), cell: rc(cell), shellStyle: cs(shell, ['border-radius', 'border', 'background-color', 'opacity']), rootStyle: cs(mr.parentElement, ['border-radius', 'overflow']), txt: mr.innerText.trim(), cellClass: cell.className } : null,
            rowsEnabled: rows.map((r) => enableChk(r) ? enableChk(r).checked : null).slice(0, 6),
            row1HasMode: modeRoots(rows[1]).length,
        }
    `)
    check('B.對話框欄序', JSON.stringify(d1.heads) === JSON.stringify(['權限群組名稱', '是否使用', '所屬權限名稱']), d1.heads)
    check('B.本項chip排第1', d1.firstChipName === '知識管理系統_操作編輯_權限', { first: d1.firstChipName, n: d1.nChips })
    check('B.chip間距4px', d1.gaps.every((g) => Math.abs(g - 4) < 0.6), d1.gaps)
    check('B.chip高22', d1.chipH.every((h) => Math.abs(h - 22) < 0.6) && d1.innerH.every((h) => Math.abs(h - 22) < 0.6), { chipH: d1.chipH, innerH: d1.innerH })
    check('B.展開鈕在最左且帶數量', d1.btnAllText === String(d1.nChips) && d1.btnAllRect && d1.mode && d1.btnAllRect.x < d1.mode.root.x, { btnAllText: d1.btnAllText, nChips: d1.nChips, btnAllRect: d1.btnAllRect })
    check('B.模式控制項22x56且在儲存格內', d1.mode && Math.abs(d1.mode.shell.h - 22) < 0.6 && Math.abs(d1.mode.root.w - 56) < 0.6 && d1.mode.shell.y >= d1.mode.cell.y - 0.5 && d1.mode.shell.btm <= d1.mode.cell.btm + 0.5, d1.mode)
    if (!d1.mode) {
        throw new Error('本項 chip 無模式控制項, 後續量測無法進行')
    }
    check('B.未勾選列無模式控制項', d1.row1HasMode === 0, { row1HasMode: d1.row1HasMode })
    await shot(page, 'B1-編輯所屬權限群組-對話框')

    //hover 本項 chip 之模式段(真滑鼠)
    let m0 = d1.mode.root
    await page.mouse.move(m0.x + m0.w / 2, m0.y + m0.h / 2)
    await sleep(500)
    let hv = await evalH(page, `let g = gridOf('權限群組名稱'); let row0 = rowByText(g, '系統管理者編輯_權限群組'); let mr = modeRoots(row0)[0]; let shell = mr.querySelector('div[style*="border-radius"]'); let cell = mr.closest('.ag-cell'); return { shellHover: cs(shell, ['background-color', 'border', 'cursor']), cellClass: cell.className, cellBorder: cs(cell, ['border'])['border'] }`)
    check('B.hover無儲存格焦點框', !hv.cellClass.includes('ag-cell-focus') || hv.cellClass.includes('no-border'), hv)
    await shot(page, 'B2-編輯所屬權限群組-hover本項chip', { x: 401, y: m0.y - 40, width: 798, height: 28 * 4 })

    //點開本項 chip 之模式清單
    await page.mouse.click(m0.x + m0.w / 2, m0.y + m0.h / 2)
    await page.waitForFunction(() => [...document.querySelectorAll('div[wtlp="modeSelect"]')].some((p) => p.getBoundingClientRect().width > 0), null, { timeout: 5000 })
    await sleep(500)
    let op = await evalH(page, `
        let p = [...document.querySelectorAll('div[wtlp="modeSelect"]')].filter((p) => p.getBoundingClientRect().width > 0)[0];
        let items = [...p.querySelectorAll('[tabindex="0"]')].filter((d) => /^(OR|AND)$/.test((d.innerText || '').trim()));
        let g = gridOf('權限群組名稱'); let row0 = rowByText(g, '系統管理者編輯_權限群組'); let mr = modeRoots(row0)[0]; let cell = mr.closest('.ag-cell');
        return { popup: rc(p), items: items.map((d) => ({ t: d.innerText.trim(), r: rc(d) })), trigger: rc(mr), cellClass: cell.className, cellBorder: cs(cell, ['border'])['border'] }
    `)
    check('B.清單依序OR、AND', op.items.map((i) => i.t).join(',') === 'OR,AND', op.items.map((i) => [i.t, i.r.h]))
    check('B.清單左緣對齊控制項', Math.abs(op.popup.x - op.trigger.x) <= 1.5, { popupX: op.popup.x, triggerX: op.trigger.x })
    check('B.清單不窄於控制項', op.popup.w >= op.trigger.w - 0.5, { popupW: op.popup.w, triggerW: op.trigger.w })
    check('B.點擊後無儲存格藍框', !op.cellBorder.includes('rgb(0, 145, 234)'), { cellBorder: op.cellBorder, cellClass: op.cellClass })
    await shot(page, 'B3-編輯所屬權限群組-展開本項chip清單', { x: 401, y: m0.y - 40, width: 798, height: 28 * 6 })
    //點 AND
    let andItem = op.items.find((i) => i.t === 'AND')
    await page.mouse.click(andItem.r.x + andItem.r.w / 2, andItem.r.y + andItem.r.h / 2)
    await sleep(800)
    let afterAnd = await evalH(page, `let g = gridOf('權限群組名稱'); let row0 = rowByText(g, '系統管理者編輯_權限群組'); let mr = modeRoots(row0)[0]; let open = [...document.querySelectorAll('div[wtlp="modeSelect"]')].some((p) => p.getBoundingClientRect().width > 0); let hasSave = [...document.querySelectorAll('svg path')].some((p) => p.getAttribute('d') && p.getAttribute('d').startsWith('M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2M11,16.5L18,9.5L16.59,8.09L11,13.67L7.91,10.59L6.5,12L11,16.5Z') && p.getBoundingClientRect().width > 0); return { txt: mr.innerText.trim(), open, hasSave }`)
    check('B.點AND後本項chip顯示AND且清單收起', afterAnd.txt === 'AND' && !afterAnd.open, afterAnd)
    await shot(page, 'B4-編輯所屬權限群組-本項chip已為AND', { x: 401, y: m0.y - 40, width: 798, height: 28 * 4 })

    //展開全部
    let ba = d1.btnAllRect
    await page.mouse.click(ba.x + ba.w / 2, ba.y + ba.h / 2)
    await page.waitForFunction(() => [...document.querySelectorAll('div[wtlp="relationChipsAll"]')].some((p) => p.getBoundingClientRect().width > 0), null, { timeout: 5000 })
    await sleep(600)
    let pa = await evalH(page, `
        let p = [...document.querySelectorAll('div[wtlp="relationChipsAll"]')].filter((p) => p.getBoundingClientRect().width > 0)[0];
        let chips = chipsOf(p);
        let title = p.innerText.split('\\n')[0];
        return { popup: rc(p), n: chips.length, first: chips[0].getAttribute('title'), firstMode: chips[0].innerText.trim().split('\\n')[0], title, wrap: cs(chips[0].parentElement, ['flex-wrap', 'gap']) }
    `)
    check('B.展開全部浮層列出94顆且本項第1', pa.n === 94 && pa.first === '知識管理系統_操作編輯_權限', pa)
    await shot(page, 'B5-編輯所屬權限群組-展開全部浮層')
    //關閉浮層(點對話框標題區)
    let ttl = await evalH(page, `let ls = leaf('目前權限'); return ls.length ? rc(ls[0]) : null`)
    await page.mouse.click(ttl.x + 5, ttl.y + 5)
    await sleep(500)

    //未勾選列勾選後, 本項 chip 出現在第 1 顆且可下拉
    let chk = await evalH(page, `let g = gridOf('權限群組名稱'); let row = rowByText(g, 'L0公開頁面閱覽_權限群組'); return rc(enableChk(row))`)
    await page.mouse.click(chk.x + chk.w / 2, chk.y + chk.h / 2)
    await sleep(900)
    let ck = await evalH(page, `let g = gridOf('權限群組名稱'); let row = rowByText(g, 'L0公開頁面閱覽_權限群組'); let cell = [...row.querySelectorAll('.ag-cell')].find((c) => chipsOf(c).length > 0); let chips = chipsOf(cell); let mr = modeRoots(chips[0])[0]; return { first: chips[0].getAttribute('title'), hasMode: !!mr, n: chips.length, firstBg: cs(chips[0].children[0].querySelector('div[style*="border-radius"]') || chips[0].children[0], ['background-color'])['background-color'] }`)
    check('B.勾選後本項chip成第1顆且帶下拉', ck.first === '知識管理系統_操作編輯_權限' && ck.hasMode, ck)
    await shot(page, 'B6-編輯所屬權限群組-勾選後本項chip在首位', { x: 401, y: chk.y - 60, width: 798, height: 28 * 4 })
    await page.mouse.click(chk.x + chk.w / 2, chk.y + chk.h / 2) //還原(不儲存)
    await sleep(500)
    await closeDialog(page)

    //================ C. 編輯使用權限(VeCpemis) ================
    await nav(page, '管理權限群組')
    await openDialog(page, 'L0公開頁面閱覽_權限群組', '權限', '編輯使用權限')
    let c1 = await evalH(page, `
        let g = gridOf('權限名稱'); let rows = rowsOf(g);
        let info = rows.slice(0, 8).map((r) => { let mr = modeRoots(r)[0]; let shell = mr.querySelector('div[style*="border-radius"]'); let svg = mr.querySelector('svg'); return { chk: enableChk(r).checked, txt: mr.innerText.trim(), h: rc(shell).h, w: rc(mr).w, op: cs(shell, ['opacity'])['opacity'], hasArrow: !!svg, cursor: cs(mr.querySelector('[style*="white-space"]') || mr, ['cursor'])['cursor'], cell: rc(mr.closest('.ag-cell')), shell: rc(shell) } });
        return { heads: heads(g), info }
    `)
    let enabledRows = c1.info.filter((i) => i.chk)
    let disabledRows = c1.info.filter((i) => !i.chk)
    check('C.欄序不變', JSON.stringify(c1.heads) === JSON.stringify(['權限名稱', '合併權限模式', '是否使用']), c1.heads)
    check('C.控制項22x56且在儲存格內', c1.info.every((i) => Math.abs(i.h - 22) < 0.6 && Math.abs(i.w - 56) < 0.6 && i.shell.y >= i.cell.y - 0.5 && i.shell.btm <= i.cell.btm + 0.5), c1.info.map((i) => [i.chk, i.h, i.w]))
    check('C.已勾選列可操作(不透明、有箭頭)', enabledRows.length > 0 && enabledRows.every((i) => i.op === '1' && i.hasArrow), enabledRows.map((i) => [i.txt, i.op, i.hasArrow]))
    check('C.未勾選列淡化無箭頭', disabledRows.length > 0 && disabledRows.every((i) => i.op === '0.6' && !i.hasArrow), disabledRows.slice(0, 3).map((i) => [i.txt, i.op, i.hasArrow]))
    await shot(page, 'C1-編輯使用權限-對話框')
    let en0 = await evalH(page, `let g = gridOf('權限名稱'); let r = rowsOf(g).find((r) => enableChk(r).checked); let mr = modeRoots(r)[0]; return rc(mr)`)
    await page.mouse.move(en0.x + en0.w / 2, en0.y + en0.h / 2)
    await sleep(400)
    await shot(page, 'C2-編輯使用權限-hover已勾選列控制項', { x: 401, y: en0.y - 40, width: 798, height: 28 * 4 })
    await page.mouse.click(en0.x + en0.w / 2, en0.y + en0.h / 2)
    await page.waitForFunction(() => [...document.querySelectorAll('div[wtlp="modeSelect"]')].some((p) => p.getBoundingClientRect().width > 0), null, { timeout: 5000 })
    await sleep(500)
    let cop = await evalH(page, `let p = [...document.querySelectorAll('div[wtlp="modeSelect"]')].filter((p) => p.getBoundingClientRect().width > 0)[0]; let items = [...p.querySelectorAll('[tabindex="0"]')].filter((d) => /^(OR|AND)$/.test((d.innerText || '').trim())); return { popup: rc(p), items: items.map((d) => d.innerText.trim()) }`)
    check('C.已勾選列點開清單', cop.items.join(',') === 'OR,AND', cop)
    await shot(page, 'C3-編輯使用權限-展開清單', { x: 401, y: en0.y - 40, width: 798, height: 28 * 6 })
    let t2 = await evalH(page, `let ls = leaf('權限名稱'); return rc(ls[0])`)
    await page.mouse.click(t2.x + 5, t2.y - 30) //點對話框標頭以外之空白處關閉清單(點表頭)
    await sleep(500)
    let dis0 = await evalH(page, `let g = gridOf('權限名稱'); let r = rowsOf(g).find((r) => !enableChk(r).checked); let mr = modeRoots(r)[0]; return rc(mr)`)
    await page.mouse.click(dis0.x + dis0.w / 2, dis0.y + dis0.h / 2)
    await sleep(500)
    let disOpen = await page.evaluate(() => [...document.querySelectorAll('div[wtlp="modeSelect"]')].some((p) => p.getBoundingClientRect().width > 0))
    check('C.未勾選列點擊不展開', !disOpen, { disOpen })
    await closeDialog(page)

    //================ D. 編輯所屬使用者(VeGrupBlngUsers) ================
    await openDialog(page, 'L0公開頁面閱覽_權限群組', '使用者', '編輯所屬使用者')
    let dd = await evalH(page, `
        let g = gridOf('使用者名稱'); let rows = rowsOf(g);
        let r1 = rows.find((r) => enableChk(r).checked);
        let cell = [...r1.querySelectorAll('.ag-cell')].find((c) => chipsOf(c).length > 0); let chips = chipsOf(cell);
        return { heads: heads(g), nRows: rows.length, first: chips[0].getAttribute('title'), hasMode: modeRoots(chips[0]).length, n: chips.length, gaps: chips.slice(1).map((c, i) => +(rc(c).x - rc(chips[i]).r).toFixed(1)) }
    `)
    check('D.編輯所屬使用者之欄序與本項chip', JSON.stringify(dd.heads) === JSON.stringify(['使用者名稱', '是否使用', '所屬權限群組名稱']) && dd.first === 'L0公開頁面閱覽_權限群組' && dd.hasMode === 1, dd)
    await shot(page, 'D1-編輯所屬使用者-對話框')
    await closeDialog(page)

    //================ E. 編輯使用權限群組(VeCgrups) ================
    await nav(page, '管理使用者')
    await openDialog(page, '王小明', '權限群組', '編輯使用權限群組')
    let e1 = await evalH(page, `let g = gridOf('權限群組名稱'); let rows = rowsOf(g); let r = rows.find((r) => enableChk(r).checked); let mr = modeRoots(r)[0]; let shell = mr.querySelector('div[style*="border-radius"]'); return { heads: heads(g), enabledRowTxt: mr.innerText.trim(), shell: rc(shell), cell: rc(mr.closest('.ag-cell')), root: rc(mr) }`)
    check('E.編輯使用權限群組控制項在儲存格內', Math.abs(e1.shell.h - 22) < 0.6 && e1.shell.y >= e1.cell.y - 0.5 && e1.shell.btm <= e1.cell.btm + 0.5, e1)
    await page.mouse.move(e1.root.x + e1.root.w / 2, e1.root.y + e1.root.h / 2)
    await sleep(400)
    await shot(page, 'E1-編輯使用權限群組-hover', { x: 401, y: e1.root.y - 60, width: 798, height: 28 * 5 })
    await page.mouse.click(e1.root.x + e1.root.w / 2, e1.root.y + e1.root.h / 2)
    await page.waitForFunction(() => [...document.querySelectorAll('div[wtlp="modeSelect"]')].some((p) => p.getBoundingClientRect().width > 0), null, { timeout: 5000 })
    await sleep(500)
    await shot(page, 'E2-編輯使用權限群組-展開清單', { x: 401, y: e1.root.y - 60, width: 798, height: 28 * 7 })
    let t3 = await evalH(page, `let ls = leaf('權限群組名稱'); return rc(ls[0])`)
    await page.mouse.click(t3.x + 5, t3.y - 30)
    await sleep(400)
    await closeDialog(page)

    //================ F. 唯讀(展示)態: 關閉編輯模式後開「展示所屬權限群組」 ================
    await nav(page, '管理權限')
    let sw = await evalH(page, `let ls = leaf('編輯模式'); return rc(ls[0])`)
    await page.mouse.click(sw.x + sw.w / 2, sw.y + sw.h / 2)
    await sleep(800)
    await openDialog(page, '知識管理系統_操作編輯_權限', '權限群組', '展示所屬權限群組')
    let f1 = await evalH(page, `
        let g = gridOf('權限群組名稱'); let row0 = rowByText(g, '系統管理者編輯_權限群組');
        let cell = [...row0.querySelectorAll('.ag-cell')].find((c) => chipsOf(c).length > 0); let chips = chipsOf(cell);
        let seg = chips[0].children[0];
        let btnAll = btnAllOf(cell);
        return { first: chips[0].getAttribute('title'), hasMode: modeRoots(chips[0]).length, segText: seg.innerText.trim(), segBg: cs(seg, ['background-color'])['background-color'], segCursor: cs(seg, ['cursor'])['cursor'], hasSvg: !!chips[0].querySelector('svg'), chkDisabled: enableChk(row0).disabled, btnAllText: btnAll ? btnAll.innerText.trim() : null }
    `)
    check('F.唯讀態本項chip為純文字段(無下拉、無箭頭)且勾選框disabled', f1.hasMode === 0 && !f1.hasSvg && f1.chkDisabled && f1.segText === 'OR', f1)
    await shot(page, 'F1-展示所屬權限群組-唯讀態')
    let fb = await evalH(page, `let g = gridOf('權限群組名稱'); let row0 = rowByText(g, '系統管理者編輯_權限群組'); let cell = [...row0.querySelectorAll('.ag-cell')].find((c) => chipsOf(c).length > 0); return rc(btnAllOf(cell))`)
    await page.mouse.click(fb.x + fb.w / 2, fb.y + fb.h / 2)
    await page.waitForFunction(() => [...document.querySelectorAll('div[wtlp="relationChipsAll"]')].some((p) => p.getBoundingClientRect().width > 0), null, { timeout: 5000 })
    await sleep(500)
    let fp2 = await evalH(page, `let p = [...document.querySelectorAll('div[wtlp="relationChipsAll"]')].filter((p) => p.getBoundingClientRect().width > 0)[0]; return { n: chipsOf(p).length }`)
    check('F.唯讀態展開全部仍可看', fp2.n === 94, fp2)
    await shot(page, 'F2-展示所屬權限群組-展開全部')
    await closeDialog(page)

    //================ G. DPR 3 放大圖(對照修改前之 zoom-*.png) ================
    let z = await openPerm(3)
    await nav(z.page, '管理權限')
    await openDialog(z.page, '知識管理系統_操作編輯_權限', '權限群組', '編輯所屬權限群組')
    let zm = await evalH(z.page, `let g = gridOf('權限群組名稱'); let row0 = rowByText(g, '系統管理者編輯_權限群組'); let mr = modeRoots(row0)[0]; let vp = g.querySelector('.ag-body-viewport'); return { m: rc(mr), vp: rc(vp), row: rc(row0) }`)
    await z.page.mouse.move(5, 5)
    await sleep(300)
    await shot(z.page, 'G1-zoom-編輯所屬權限群組-前六列', { x: zm.vp.x, y: zm.vp.y - 60, width: zm.vp.w, height: 60 + 28 * 6 })
    await z.page.mouse.move(zm.m.x + zm.m.w / 2, zm.m.y + zm.m.h / 2)
    await sleep(500)
    await shot(z.page, 'G2-zoom-編輯所屬權限群組-hover本項chip', { x: zm.vp.x, y: zm.row.y - 30, width: zm.vp.w, height: 28 * 4 })
    await z.page.mouse.click(zm.m.x + zm.m.w / 2, zm.m.y + zm.m.h / 2)
    await z.page.waitForFunction(() => [...document.querySelectorAll('div[wtlp="modeSelect"]')].some((p) => p.getBoundingClientRect().width > 0), null, { timeout: 5000 })
    await sleep(500)
    await shot(z.page, 'G3-zoom-編輯所屬權限群組-展開清單', { x: zm.vp.x, y: zm.row.y - 30, width: zm.vp.w, height: 28 * 6 })
    await z.context.close()

    fs.writeFileSync(path.join(fdOut, 'verify.json'), JSON.stringify(out, null, 2))
    await browser.close()
    console.log(`\n[done] fails=${fails.length} ${JSON.stringify(fails)}`)
}

main().catch((err) => {
    console.error('[fail]', err)
    process.exitCode = 1
    //不留孤兒瀏覽器
    process.exit(1)
})
