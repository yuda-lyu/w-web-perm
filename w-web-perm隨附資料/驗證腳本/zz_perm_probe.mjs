// 探測權限管理系統各關聯彈窗之 chip 間距、合併模式下拉幾何與裁切(經 w-screenctl 7000; 只量測不改資料)
// 用法: node tmp/zz_perm_probe.mjs
// 產物: tmp/perm_probe/*.png(截圖) 與 stdout(量測 JSON)
import fs from 'fs'
import path from 'path'

let HOST = 'http://127.0.0.1:7000'
let SSO = 'http://localhost:11007'
let PERM = 'http://localhost:11006'
let fdOut = path.resolve('./tmp/perm_probe')
fs.mkdirSync(fdOut, { recursive: true })
let MDI_CLOSE = 'M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z'

let sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function api(p, body, method = 'POST') {
    let r = await fetch(HOST + p, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    return r.json()
}
async function ev(script) {
    let r = await api('/chrome/evaluate', { script })
    if (!r.ok) {
        throw new Error(`evaluate 失敗: ${r.error} :: ${script.slice(0, 160)}`)
    }
    return r.result
}
async function waitFor(script, timeout = 60000, poll = 300) {
    let t0 = Date.now()
    while (Date.now() - t0 < timeout) {
        let v = await ev(script)
        if (v) {
            return v
        }
        await sleep(poll)
    }
    throw new Error(`waitFor 逾時: ${script.slice(0, 120)}`)
}
async function click(x, y) {
    let r = await api('/chrome/mouse/click', { x: Math.round(x), y: Math.round(y) })
    if (!r.ok) {
        throw new Error(`click 失敗: ${r.error}`)
    }
    await sleep(400)
}
async function type(text) {
    let r = await api('/chrome/keyboard/type', { text })
    if (!r.ok) {
        throw new Error(`type 失敗: ${r.error}`)
    }
}
async function key(keys) {
    let r = await api('/chrome/keyboard/key', { keys })
    if (!r.ok) {
        throw new Error(`key 失敗: ${r.error}`)
    }
}
let nShot = 0
async function shot(name) {
    let r = await api('/chrome/screenshot', {})
    if (!r.ok) {
        throw new Error(`screenshot 失敗: ${r.error}`)
    }
    nShot += 1
    let fp = path.join(fdOut, `${String(nShot).padStart(2, '0')}-${name}.png`)
    fs.writeFileSync(fp, Buffer.from(r.image, 'base64'))
    console.log(`[shot] ${fp}`)
}
let out = {}
function log(k, v) {
    out[k] = v
    console.log(`\n=== ${k} ===\n${JSON.stringify(v, null, 1)}`)
}

//頁面內共用函式(以字串注入, 每次 evaluate 都重新定義)
let H = `
let rc = (el) => { let b = el.getBoundingClientRect(); return { x: +b.left.toFixed(1), y: +b.top.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1), r: +b.right.toFixed(1), btm: +b.bottom.toFixed(1) } };
let leaf = (t, pred) => [...document.querySelectorAll('*')].filter((el) => el.children.length === 0 && (el.innerText || '').trim() === t && (!pred || pred(el)));
let cs = (el, ks) => { let s = getComputedStyle(el); let o = {}; ks.forEach((k) => { o[k] = s.getPropertyValue(k) }); return o };
let gridOf = (headText) => { let hs = [...document.querySelectorAll('.ag-header-cell-text')].filter((e) => e.textContent.trim() === headText); return hs.length ? hs[hs.length - 1].closest('.ag-root-wrapper') : null };
let heads = (g) => [...g.querySelectorAll('.ag-header-cell-text')].map((e) => e.textContent.trim());
let rowsOf = (g) => [...g.querySelectorAll('.ag-center-cols-container .ag-row')].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
let rowByText = (g, t) => { let hit = [...g.querySelectorAll('.ag-row')].find((r) => (r.innerText || '').includes(t)); if (!hit) return null; let idx = hit.getAttribute('row-index'); return g.querySelector('.ag-center-cols-container .ag-row[row-index="' + idx + '"]') || hit };
`

async function login() {
    let r = await api('/chrome/open', { url: `${SSO}/?view=user`, mode: 'replace', viewport: { width: 1600, height: 900 }, opt: { headless: true } })
    console.log('[open]', JSON.stringify(r))
    //共用 user data 內可能已有登入態(直接落在使用者資訊頁), 兩種情形都接受
    let st = await waitFor(`(() => { let ins = [...document.querySelectorAll('input')].filter((i) => i.getBoundingClientRect().width > 0); if (ins.length >= 2) return 'form'; let t = document.body.innerText || ''; if (t.includes('使用者資訊') && t.includes('登出')) return 'user'; return '' })()`)
    console.log('[sso state]', st)
    if (st === 'form') {
        await sleep(600)
        let ins = await ev(`(() => { ${H} return [...document.querySelectorAll('input')].filter((i) => i.getBoundingClientRect().width > 0).slice(0, 2).map(rc) })()`)
        await click(ins[0].x + ins[0].w / 2, ins[0].y + ins[0].h / 2)
        await type('admin')
        await click(ins[1].x + ins[1].w / 2, ins[1].y + ins[1].h / 2)
        await type('admin@example.com')
        await key('Enter')
        await waitFor(`(document.body.innerText.includes('使用者資訊') && document.body.innerText.includes('登出'))`)
    }
    let token = await ev(`localStorage.getItem('rddmanager_main:userToken')`)
    if (!token) {
        throw new Error('取不到主系統權杖')
    }
    let r2 = await api('/chrome/navigate', { url: `${PERM}/?token=${token}` })
    console.log('[navigate perm]', JSON.stringify(r2))
    await waitFor(`(() => { ${H} let ls = leaf('管理使用者'); return ls.some((el) => { let b = el.getBoundingClientRect(); return b.width > 0 && b.left >= 0 && b.left < 200 }) })()`, 90000)
    await waitFor(`(!document.body.innerText.includes('等待數據中'))`, 90000)
    await sleep(1500)
}

async function gotoNav(t) {
    let r = await ev(`(() => { ${H} let ls = leaf('${t}').filter((el) => el.getBoundingClientRect().left < 200); return ls.length ? rc(ls[0]) : null })()`)
    if (!r) {
        throw new Error(`找不到導覽項 ${t}`)
    }
    await click(r.x + r.w / 2, r.y + r.h / 2)
    await waitFor(`(() => { ${H} return leaf('${t}').some((el) => el.getBoundingClientRect().left > 200) })()`)
    await waitFor(`(!document.body.innerText.includes('等待數據中'))`, 90000)
    await waitFor(`(document.querySelectorAll('.ag-center-cols-container .ag-row').length > 0)`)
    await sleep(1200)
}

//主表: 表頭順序與關聯欄按鈕
async function probeMainTable(tag, nameHead) {
    let r = await ev(`(() => { ${H} let g = gridOf('${nameHead}'); return { heads: heads(g), nRows: rowsOf(g).length, rowH: rowsOf(g)[0] ? rc(rowsOf(g)[0]).h : null } })()`)
    log(`${tag}.main.heads`, r)
    return r
}

//於主表點某列某欄之按鈕(按鈕文字含 btnText)
async function openDialogFromRow(rowText, btnText, dialogTitle) {
    let r = await ev(`(() => { ${H} let g = gridOf('名稱'); let row = rowByText(g, '${rowText}'); if (!row) return null; let bs = [...row.querySelectorAll('button')].filter((b) => (b.innerText || '').includes('${btnText}')); return bs.length ? { btn: rc(bs[0]), txt: bs[0].innerText } : null })()`)
    if (!r) {
        throw new Error(`找不到列 ${rowText} 之按鈕 ${btnText}`)
    }
    console.log('[open dialog]', rowText, r.txt)
    await click(r.btn.x + r.btn.w / 2, r.btn.y + r.btn.h / 2)
    await waitFor(`(() => { ${H} return leaf('${dialogTitle}').some((el) => el.getBoundingClientRect().width > 0) })()`)
    await waitFor(`(() => { ${H} let hs = [...document.querySelectorAll('.ag-root-wrapper')]; return hs.length >= 2 && hs[hs.length - 1].querySelectorAll('.ag-center-cols-container .ag-row').length > 0 })()`)
    await sleep(1500)
}

//彈窗表格之幾何: 表頭、列高、儲存格 overflow、下拉外框(WShellEllipse)之圓角/邊框/高度、chip 間距
async function probeDialogGrid(tag, nameHead, chipHead) {
    let r = await ev(`(() => { ${H}
        let g = gridOf('${nameHead}');
        let rows = rowsOf(g);
        let row0 = rows[0];
        let o = { heads: heads(g), nRows: rows.length, rowH: rc(row0).h, rowsBox: rc(g.querySelector('.ag-body-viewport')) };
        //下拉整顆: 儲存格內帶行內寬度之最外層祖先(w-web-perm 之 :style width:72px)
        let sels = rows.slice(0, 3).map((row) => {
            let root = [...row.querySelectorAll('div[style*="width:72px"], div[style*="width: 72px"]')][0];
            if (!root) return null;
            let cell = root.closest('.ag-cell');
            let shell = root.querySelector('div[style*="border-radius"]');
            let txt = [...root.querySelectorAll('div')].find((d) => d.children.length === 0 && /^(OR|AND)$/.test((d.innerText || '').trim()));
            let svg = root.querySelector('svg');
            return {
                root: rc(root), cell: rc(cell), cellOverflow: cs(cell, ['overflow', 'overflow-x', 'overflow-y', 'padding-left', 'padding-right', 'line-height']),
                shell: rc(shell), shellStyle: cs(shell, ['border-radius', 'border', 'background-color', 'padding', 'opacity', 'box-shadow', 'height']),
                txt: txt ? rc(txt) : null, txtStyle: txt ? cs(txt, ['font-size', 'line-height', 'color']) : null,
                svg: svg ? rc(svg) : null,
                rowOfCell: rc(row),
            }
        });
        o.selects = sels;
        //chip: 每列之 chip 外框 span(height:20px)
        if ('${chipHead}') {
            let chipRows = rows.slice(0, 6).map((row) => {
                let cell = [...row.querySelectorAll('.ag-cell')].find((c) => c.querySelector('span[style*="height:20px"], span[style*="height: 20px"]'));
                if (!cell) return null;
                let chips = [...cell.querySelectorAll('span[style*="height:20px"], span[style*="height: 20px"]')].map((s) => {
                    let ds = s.querySelectorAll('div');
                    return { box: rc(s), modeBox: rc(ds[1]), nameBox: rc(ds[2]), mode: ds[1].innerText.trim(), name: ds[2].innerText.trim(), nameStyle: cs(ds[2], ['font-size', 'padding', 'border-radius', 'background-color', 'color', 'white-space']), modeStyle: cs(ds[1], ['padding', 'border-radius', 'background-color', 'color', 'border-left']) };
                });
                let gaps = chips.slice(1).map((c, i) => +(c.box.x - chips[i].box.r).toFixed(1));
                let cellR = rc(cell);
                let nCut = chips.filter((c) => c.box.r > cellR.r + 0.5).length;
                return { row: (row.querySelector('.ag-cell') || row).innerText.trim().slice(0, 30), cell: cellR, cellStyle: cs(cell, ['overflow', 'white-space', 'padding-left', 'padding-right', 'text-overflow']), nChips: chips.length, gaps, nChipsBeyondCell: nCut, chips: chips.slice(0, 4), lastChipRight: chips.length ? chips[chips.length - 1].box.r : null };
            });
            o.chipRows = chipRows;
        }
        return o;
    })()`)
    log(`${tag}.dialog`, r)
    return r
}

//滑鼠移到列上(真滑鼠, 以 drag 零距離不可行, 改以頁面內派發 mouseenter/mouseover 讓 ag-grid 與 WShellEllipse 進入 hover 態), 量 hover 態樣式並截圖
async function probeHover(tag, nameHead, rowIdx = 1) {
    let r = await ev(`(() => { ${H}
        let g = gridOf('${nameHead}');
        let row = rowsOf(g)[${rowIdx}];
        let root = [...row.querySelectorAll('div[style*="width:72px"], div[style*="width: 72px"]')][0];
        let shell = root.querySelector('div[style*="border-radius"]');
        //ag-grid 之列 hover 以 mouseenter/mouseover 觸發(ag-row-hover class); WShellEllipse 監聽 mouseenter
        [row, ...row.querySelectorAll('.ag-cell')].forEach((el) => { el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false })); el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true })); });
        shell.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
        return true
    })()`)
    await sleep(500)
    let r2 = await ev(`(() => { ${H}
        let g = gridOf('${nameHead}');
        let row = rowsOf(g)[${rowIdx}];
        let root = [...row.querySelectorAll('div[style*="width:72px"], div[style*="width: 72px"]')][0];
        let shell = root.querySelector('div[style*="border-radius"]');
        let cell = root.closest('.ag-cell');
        return { rowClass: row.className, rowBg: cs(row, ['background-color']), cellBg: cs(cell, ['background-color']), shellHover: cs(shell, ['border-radius', 'border', 'background-color', 'height']), shell: rc(shell), row: rc(row), cell: rc(cell), clipTop: +(rc(row).y - rc(shell).y).toFixed(1), clipBottom: +(rc(shell).btm - rc(row).btm).toFixed(1) }
    })()`)
    log(`${tag}.hover`, r2)
    await shot(`${tag}-hover`)
    return r2
}

//點開下拉, 量浮層與選項, 截圖, 再關閉
async function probeOpenSelect(tag, nameHead, rowIdx = 1) {
    let r = await ev(`(() => { ${H}
        let g = gridOf('${nameHead}');
        let row = rowsOf(g)[${rowIdx}];
        let root = [...row.querySelectorAll('div[style*="width:72px"], div[style*="width: 72px"]')][0];
        return rc(root)
    })()`)
    await click(r.x + r.w / 2, r.y + r.h / 2)
    await waitFor(`(() => { let ps = [...document.querySelectorAll('div[wtlp="modeSelect"]')].filter((p) => p.getBoundingClientRect().width > 0); return ps.length === 1 })()`)
    await sleep(500)
    let r2 = await ev(`(() => { ${H}
        let p = [...document.querySelectorAll('div[wtlp="modeSelect"]')].filter((p) => p.getBoundingClientRect().width > 0)[0];
        let items = [...p.querySelectorAll('div')].filter((d) => d.children.length === 1 && /^(OR|AND)$/.test((d.innerText || '').trim()) && d.getAttribute('tabindex') === '0');
        let g = gridOf('${nameHead}');
        let row = rowsOf(g)[${rowIdx}];
        let root = [...row.querySelectorAll('div[style*="width:72px"], div[style*="width: 72px"]')][0];
        let shell = root.querySelector('div[style*="border-radius"]');
        let cell = root.closest('.ag-cell');
        return { popup: rc(p), popupStyle: cs(p, ['border-radius', 'box-shadow', 'padding', 'background-color', 'border']), items: items.map((d) => ({ box: rc(d), t: d.innerText.trim(), style: cs(d, ['padding', 'font-size']) })), trigger: rc(root), shellOpen: cs(shell, ['border-radius', 'border', 'background-color']), cellFocus: cs(cell, ['border', 'border-color', 'outline']), cellClass: cell.className, viewport: rc(g.querySelector('.ag-body-viewport')), dlg: rc(root.closest('[role="dialog"]') || document.body) }
    })()`)
    log(`${tag}.open`, r2)
    await shot(`${tag}-open`)
    await key('Escape')
    await sleep(400)
    let still = await ev(`([...document.querySelectorAll('div[wtlp="modeSelect"]')].filter((p) => p.getBoundingClientRect().width > 0).length)`)
    if (still > 0) {
        //Escape 不關則點對話框標題區
        let t = await ev(`(() => { ${H} let ls = leaf('目前權限群組').concat(leaf('目前權限')); return ls.length ? rc(ls[0]) : null })()`)
        if (t) {
            await click(t.x + 5, t.y + 5)
        }
    }
    await sleep(400)
    log(`${tag}.open.closedByEscape`, still === 0)
    return r2
}

async function closeDialog() {
    let r = await ev(`(() => { ${H} let ps = [...document.querySelectorAll('svg path')].filter((p) => p.getAttribute('d') === '${MDI_CLOSE}' && p.getBoundingClientRect().width > 0); if (!ps.length) return null; let p = ps[ps.length - 1]; return rc(p.closest('svg')) })()`)
    if (!r) {
        throw new Error('找不到關閉圖示')
    }
    await click(r.x + r.w / 2, r.y + r.h / 2)
    await sleep(800)
}

async function main() {
    await login()
    await shot('perm-home')

    //一、管理權限群組
    await gotoNav('管理權限群組')
    await probeMainTable('grups', '名稱')
    await shot('grups-main')
    //1. 編輯所屬使用者(VeGrupBlngUsers): 列 L1源項…
    await openDialogFromRow('L1源項資料庫系統頁面閱覽_權限群組', '使用者', '編輯所屬使用者')
    await probeDialogGrid('grupBlngUsers', '使用者名稱', '所屬權限群組名稱')
    await shot('grupBlngUsers-dialog')
    await probeHover('grupBlngUsers', '使用者名稱', 1)
    await probeOpenSelect('grupBlngUsers', '使用者名稱', 1)
    await closeDialog()
    //2. 編輯使用權限(VeCpemis): 列 L1源項…
    await openDialogFromRow('L1源項資料庫系統頁面閱覽_權限群組', '權限', '編輯使用權限')
    await probeDialogGrid('cpemis', '權限名稱', '')
    await shot('cpemis-dialog')
    await probeHover('cpemis', '權限名稱', 1)
    await probeOpenSelect('cpemis', '權限名稱', 1)
    await closeDialog()

    //二、管理權限
    await gotoNav('管理權限')
    await probeMainTable('pemis', '名稱')
    await shot('pemis-main')
    //3. 編輯所屬權限群組(VePemiBlngGrups): 列 知識管理系統_操作編輯_權限(E2E-009 同列)
    await openDialogFromRow('知識管理系統_操作編輯_權限', '權限群組', '編輯所屬權限群組')
    await probeDialogGrid('pemiBlngGrups', '權限群組名稱', '所屬權限名稱')
    await shot('pemiBlngGrups-dialog')
    await probeHover('pemiBlngGrups', '權限群組名稱', 1)
    await probeOpenSelect('pemiBlngGrups', '權限群組名稱', 1)
    await closeDialog()

    //三、管理使用者
    await gotoNav('管理使用者')
    await probeMainTable('users', '名稱')
    await shot('users-main')
    //4. 編輯使用權限群組(VeCgrups): 列 王小明
    await openDialogFromRow('王小明', '權限群組', '編輯使用權限群組')
    await probeDialogGrid('cgrups', '權限群組名稱', '')
    await shot('cgrups-dialog')
    await probeHover('cgrups', '權限群組名稱', 1)
    await probeOpenSelect('cgrups', '權限群組名稱', 1)
    await closeDialog()

    //四、管理對象(現有功能清單)之表頭
    await gotoNav('現有功能清單')
    await probeMainTable('targets', '對象名稱').catch((e) => log('targets.main.err', e.message))
    await shot('targets-main')

    fs.writeFileSync(path.join(fdOut, 'probe.json'), JSON.stringify(out, null, 2))
    console.log('\n[done] 量測 JSON 已寫入', path.join(fdOut, 'probe.json'))
}

main().catch((err) => {
    console.error('[fail]', err)
    process.exitCode = 1
})
