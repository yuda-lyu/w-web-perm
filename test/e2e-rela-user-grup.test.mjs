//使用者群組關聯 e2e（B 類關聯編輯）。對應 spec/流程_使用者群組關聯.md。
//鏡像 test/e2e-grups.test.mjs / e2e-users.test.mjs（canonical pilot）骨架，差異在於互動發生於對話框「內」
//（勾選 enable checkbox / 切 OR-AND mode select / 點對話框 Save 或 Close）。
//雙模式：
//  - 產 baseline：node test/e2e-rela-user-grup.test.mjs --baseline （寫 test/pics/rela-user-grup/）
//  - 驗證（mocha）：npx mocha test/e2e-rela-user-grup.test.mjs --reporter list （buf.equals 比對）
//act 走 user-facing input；assert = 語意斷言 + pixel baseline（§6.2 / §6.3）。
//
//兩入口（spec 重要流程）：
//  入口 A（E2E-001~003）VeCgrups（使用者視角）：自使用者頁某列 cgrups 按鈕開啟，列＝全部 grups。
//    對話框 Save 僅 resolve 一個 cgrups 字串「回填前端使用者列」、**不打 API、無結果 modal**；
//    斷言＝前端使用者列 cgrups 文字（DOM button）/ 該列 cgrups 值改變（回填），不可斷言 userSaveUsersSuccess。
//  入口 B（E2E-004~006）VeGrupBlngUsers（群組視角）：自群組頁某列 belongUsers 按鈕開啟，列＝全部 users。
//    對話框 Save 於對話框內**自行** $fapi.updateUsers 直接寫 DB ＋ showCheckYes 結果 modal（userSaveUsersSuccess/Fail）；
//    斷言＝DB 對應 user.cgrups（$store.state.users）改變 ＋ 結果 modal 訊息。
//
//base seed（g.initialTestData → src/schema/tables/*）：
//  users(order0-3): peter(cgrups:權限群組M1), mary(權限群組M2), john(權限群組M3), admin(權限群組M4,isAdmin=y)
//  grups(order0-3): 權限群組M1, 權限群組M2, 權限群組M3, 權限群組M4
import fs from 'fs'
import assert from 'assert'
import JSON5 from 'json5'
import { startServersOnce, cleanup, launchBrowser, openApp, captureStable, waitUntilExist } from './e2e-setup.mjs'

const PICS_DIR = './test/pics/rela-user-grup'
const LANGS = ['eng', 'cht']
const isBaseline = process.argv.includes('--baseline')

function picPath(lang, name) { return `${PICS_DIR}/rela-user-grup-${lang}-${name}.png` }

//設定語系（test setup 層，非 act-under-test；對齊雙語覆蓋維度）。沿用 e2e-users / e2e-grups 之對稱 buffer 慣例：
//cht 走語系切換；eng 為預設不切，但補等同的 settle buffer，治 eng-vs-cht 收斂不對稱（sso e2e-adduser 殷鑑）。
async function setLang(page, lang) {
    if (lang !== 'eng') {
        await page.evaluate((l) => { window.$vo.$ui.setLang(l, 'e2e-setLang') }, lang)
    }
    await page.waitForTimeout(600)
}

//導航至使用者頁（user-facing：點左側「使用者」導覽），等 ag-grid 載入。
async function gotoUsers(page) {
    const usersLabel = await page.evaluate(() => window.$vo.$t('mmUsers'))
    await page.getByText(usersLabel, { exact: true }).first().click()
    await waitUntilExist(page, '使用者 ag-grid 列', () => document.querySelectorAll('.ag-row').length > 0, { timeout: 20000 })
    await page.waitForTimeout(500)
}

//導航至群組頁（user-facing：點左側「權限群組」導覽），等 ag-grid 載入。
async function gotoGrups(page) {
    const grupsLabel = await page.evaluate(() => window.$vo.$t('mmGrups'))
    await page.getByText(grupsLabel, { exact: true }).first().click()
    await waitUntilExist(page, '群組 ag-grid 列', () => document.querySelectorAll('.ag-row').length > 0, { timeout: 20000 })
    await page.waitForTimeout(500)
}

//—— 對話框 Save / Close 鈕定位（WDialog header 之 WButtonCircle）——
//WDialog template（node_modules/w-component-vue/src/components/WDialog.vue:187-224）：
//  Save 鈕 = WButtonCircle icon=mdiCheckCircle，僅 hasSaveBtn=(isEditable && isModified) 為真才渲染（:187,203）；
//  Close 鈕 = WButtonCircle icon=mdiClose，hasCloseBtn 預設 true 恆渲染（:207-224）。
//WButtonCircle 渲染為 div[role="button"]，內含 <svg><path d="..."/>，故以 mdi path 定位（同工具列 icon 按鈕慣例）。
//mdi path 由 @mdi/js 取得（mdiCheckCircle / mdiClose）。
const DLG_MDI = {
    save: 'M12 2C6.5 2 2 6.5 2 12S6.5 22 12 22 22 17.5 22 12 17.5 2 12 2M10 17L5 12L6.41 10.59L10 14.17L17.59 6.58L19 8L10 17Z',
    close: 'M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z',
}
function dlgBtn(page, path) {
    return page.locator(`div[role="button"]:has(svg path[d="${path}"])`)
}

//—— 對話框內 grid 互動原語（列以 row-index 定位；enable=checkbox、mode=select）——
//等對話框內 ag-grid 列就緒（標題已偵測，再等對話框內表格列出現）。
async function waitDialogGrid(page) {
    //對話框內表格列以 ag-row 呈現（與頁面主表共用 class）；對話框開啟後列數應 >0
    await waitUntilExist(page, '對話框內 ag-grid 列', () => document.querySelectorAll('.ag-row').length > 0, { timeout: 15000 })
    await page.waitForTimeout(800)
}
//翻轉對話框內某列 enable checkbox（觸發 showVe*ToggleItemEnableByName → isModified=true → Save 鈕現身）。
//locator 限定 .ag-cell[col-id="enable"] 內 checkbox，避開頁面主表的 isActive checkbox。
async function toggleDialogEnable(page, rowIndex) {
    await page.locator(`.ag-row[row-index="${rowIndex}"] .ag-cell[col-id="enable"] input[type="checkbox"]`).first().click()
    await page.waitForTimeout(800) //revRows / refresh settle
}
//切對話框內某列 mode 下拉為指定值（觸發 showVe*ToggleItemModeByName → isModified=true）。
async function setDialogMode(page, rowIndex, mode) {
    await page.locator(`.ag-row[row-index="${rowIndex}"] .ag-cell[col-id="mode"] select`).first().selectOption(mode)
    await page.waitForTimeout(800)
}
//點對話框 Save 鈕（需 isModified=true 才渲染；呼叫前須已 toggle 過）。
async function clickDialogSave(page) {
    await dlgBtn(page, DLG_MDI.save).first().click()
}
//點對話框 Close 鈕（恆渲染）。
async function clickDialogClose(page) {
    await dlgBtn(page, DLG_MDI.close).first().click()
}

//—— 入口 A（VeCgrups）開啟 + 讀回填值 helpers ——
//開啟 peter（使用者頁 row 0）的 cgrups 對話框（VeCgrups）。
async function openCgrupsDialog(page, rowIndex) {
    await page.locator(`.ag-row[row-index="${rowIndex}"] .ag-cell[col-id="cgrups"] button`).first().click()
    await waitUntilExist(page, 'VeCgrups 對話框標題', () => {
        const vo = window.$vo
        return (document.body.innerText || '').includes(vo.$t('userEditCgrups'))
    }, { timeout: 15000 })
    await waitDialogGrid(page)
}
//讀使用者頁某列 cgrups 欄 button 顯示文字（getCgrupsText 結果，反映回填後的群組數）。
async function readUserRowCgrupsText(page, rowIndex) {
    return await page.evaluate((r) => {
        const btn = document.querySelector(`.ag-row[row-index="${r}"] .ag-cell[col-id="cgrups"] button`)
        return btn ? (btn.textContent || '').trim() : ''
    }, rowIndex)
}

//等對話框關閉（Save resolve / Close reject 後 bShow=false）。以標題消失偵測。
async function waitDialogClosed(page, titleKey) {
    await waitUntilExist(page, '對話框關閉', (k) => {
        const vo = window.$vo
        return !(document.body.innerText || '').includes(vo.$t(k))
    }, { timeout: 15000, arg: titleKey })
    await page.waitForTimeout(800)
}

//—— 入口 B（VeGrupBlngUsers）開啟 + 結果 modal helpers ——
//開啟權限群組M1（群組頁 row 0）的 belongUsers 對話框（VeGrupBlngUsers）。
async function openBelongDialog(page, rowIndex) {
    await page.locator(`.ag-row[row-index="${rowIndex}"] .ag-cell[col-id="belongUsers"] button`).first().click()
    await waitUntilExist(page, 'VeGrupBlngUsers 對話框標題', () => {
        const vo = window.$vo
        return (document.body.innerText || '').includes(vo.$t('grupBlngEditUsers'))
    }, { timeout: 15000 })
    await waitDialogGrid(page)
}
//點對話框 Save → 等 CheckYes 結果 modal 出現（systemMessage 標題）→ 停在 modal 顯示態供截圖。
//入口 B 自帶 API：saveUsers → $fapi.updateUsers → showCheckYes（成功 userSaveUsersSuccess / 失敗 userSaveUsersFail）。
async function saveBelongAndWaitModal(page) {
    await clickDialogSave(page)
    await waitUntilExist(page, 'CheckYes 結果 modal（systemMessage 標題）', () => {
        const vo = window.$vo
        return (document.body.innerText || '').includes(vo.$t('systemMessage'))
    }, { timeout: 20000 })
    await page.waitForTimeout(800) //modal 進場 settle
}
//語意斷言：結果 modal 顯示指定 i18n 訊息（lang-aware；fail 類只斷言前綴鍵）。
async function assertModalMsg(page, i18nKey) {
    const msg = await page.evaluate((k) => window.$vo.$t(k), i18nKey)
    const txt = await page.evaluate(() => document.body.innerText)
    assert.ok(txt.includes(msg), `結果 modal 應顯示 ${i18nKey}（${msg}）`)
}

//—— DB 衛生 helpers（每 case 前還原 users 表為 base seed）——
//入口 B 會寫 DB（updateUsers），入口 A 雖不寫 DB 但為一致性與隔離仍每 case 還原。
let BASE_SEED = null
async function captureBaseSeed(page) {
    await page.waitForFunction(() => (window.$vo.$store.state.users || []).length > 0, null, { timeout: 30000 })
    await page.waitForTimeout(1500) //確保整批同步完成
    return await page.evaluate(() => {
        const us = (window.$vo.$store.state.users || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0))
        return JSON.parse(JSON.stringify(us))
    })
}
//在獨立 throwaway page 還原 users（$fapi.updateUsers 帶整批 base seed → 後端 diff 對齊）。關閉後再開 case page。
async function resetDb(browser, seed) {
    if (!seed || seed.length === 0) throw new Error('resetDb: BASE_SEED 為空，拒絕還原（避免清空 DB）')
    const p = await openApp(browser)
    await p.evaluate((s) => window.$vo.$fapi.updateUsers(s), seed)
    await p.waitForFunction((n) => (window.$vo.$store.state.users || []).length === n, seed.length, { timeout: 15000 })
    await p.waitForTimeout(800)
    await p.context().close()
}
//讀 DB（store 同步）某 email user 的 cgrups（原始 JSON5 字串），於 node 端以 JSON5 解析後回傳物件，供入口 B 斷言。
//（JSON5 為 node 端 import，不可於 page.evaluate browser context 使用，故只取原字串出來再 node 端解析。）
async function readDbUserCgrups(page, email) {
    const raw = await page.evaluate((em) => {
        const u = (window.$vo.$store.state.users || []).find((x) => x.email === em)
        return u ? (u.cgrups || '') : null
    }, email)
    if (raw === null) return null
    try { return JSON5.parse(raw) }
    catch (e) { return raw } //fallback 回原字串
}

//case 定義：run(page,lang) 走流程並回傳截圖 buffer；mocha 模式再加語意斷言
const CASES = [

    //—————————————— 入口 A：VeCgrups（使用者視角，resolve 回填，不打 API）——————————————

    {
        //E2E-001：自使用者列 cgrups 按鈕開啟 VeCgrups 對話框（golden 起點）。僅驗開啟態：標題 + 逐群組列。
        name: 'E2E-001-cgrups-open',
        run: async (page) => {
            await gotoUsers(page)
            await openCgrupsDialog(page, 0) //row 0 = peter（cgrups: 權限群組M1）
            return await captureStable(page)
        },
        semantic: async (page) => {
            const label = await page.evaluate(() => window.$vo.$t('userEditCgrups'))
            const txt = await page.evaluate(() => document.body.innerText)
            assert.ok(txt.includes(label), `VeCgrups 對話框標題應顯示（${label}）`)
            //對話框以全部 grups 為列，故應見全部 4 個 group 名
            assert.ok(txt.includes('權限群組M1') && txt.includes('權限群組M4'), '對話框應逐群組列出 base seed grups')
        },
    },
    {
        //E2E-002：於 VeCgrups 勾選 權限群組M2 enable + 切其 mode→AND → 點對話框 Save → resolve 回填使用者列。
        //斷言（前端回填，無 DB 寫入）：peter 使用者列 cgrups 文字由 1→2 群組；對話框關閉。不可斷言 userSaveUsersSuccess。
        name: 'E2E-002-cgrups-saved',
        run: async (page) => {
            await gotoUsers(page)
            await openCgrupsDialog(page, 0) //row 0 = peter
            //對話框內列＝全部 grups（依 order）：row0=M1, row1=M2, row2=M3, row3=M4
            await toggleDialogEnable(page, 1) //勾選 權限群組M2 enable（y）→ isModified=true → Save 鈕現身
            await setDialogMode(page, 1, 'AND') //將 權限群組M2 mode 切為 AND
            await clickDialogSave(page) //resolve cgrups 字串回填使用者列，對話框關閉
            await waitDialogClosed(page, 'userEditCgrups')
            return await captureStable(page)
        },
        semantic: async (page) => {
            //回填後 peter 使用者列 cgrups button 文字應反映 2 個群組（原 M1 + 新增 M2）。
            //getCgrupsText 對 n>1 產出 userRnderCgrupsHasNGroups（'Has {n} permission group(s){nms}'，n>1 時 {nms} 為空）。
            const txt = await readUserRowCgrupsText(page, 0)
            const expected2 = await page.evaluate(() => window.$vo.$t('userRnderCgrupsHasNGroups').replace('{n}', '2').replace('{nms}', ''))
            assert.equal(txt, expected2, `peter cgrups 文字應反映 2 群組（預期「${expected2}」實得「${txt}」）`)
            //對話框已關閉
            const open = await page.evaluate(() => (document.body.innerText || '').includes(window.$vo.$t('userEditCgrups')))
            assert.ok(!open, 'VeCgrups 對話框應已關閉')
        },
    },
    {
        //E2E-003：於 VeCgrups 勾選 權限群組M2 enable（變更）後改點 Close → reject('close window')、入口 A .catch 不回填。
        //斷言（取消路徑）：peter 使用者列 cgrups 文字維持原值（仍 1 群組 M1）；對話框關閉。與 E2E-002 共覆蓋 Save/Close 分支。
        name: 'E2E-003-cgrups-cancel',
        run: async (page) => {
            await gotoUsers(page)
            //先記錄開啟前 peter cgrups 文字（原值）
            const before = await readUserRowCgrupsText(page, 0)
            await openCgrupsDialog(page, 0) //row 0 = peter
            await toggleDialogEnable(page, 1) //勾選 權限群組M2 enable（製造變更）
            await clickDialogClose(page) //Close → reject，入口 A .catch 不回填
            await waitDialogClosed(page, 'userEditCgrups')
            //把原值掛到 page 供 semantic 取用
            await page.evaluate((b) => { window.__cgrupsBefore = b }, before)
            return await captureStable(page)
        },
        semantic: async (page) => {
            const after = await readUserRowCgrupsText(page, 0)
            const before = await page.evaluate(() => window.__cgrupsBefore || '')
            assert.equal(after, before, `Close 後 peter cgrups 文字應維持原值（before「${before}」/ after「${after}」）`)
            //對話框已關閉
            const open = await page.evaluate(() => (document.body.innerText || '').includes(window.$vo.$t('userEditCgrups')))
            assert.ok(!open, 'VeCgrups 對話框應已關閉')
        },
    },

    //—————————————— 入口 B：VeGrupBlngUsers（群組視角，自帶 updateUsers 寫 DB）——————————————

    {
        //E2E-004：自群組列 belongUsers 按鈕開啟 VeGrupBlngUsers 對話框（golden 起點）。僅驗開啟態：標題 + 群組名 + 逐使用者列。
        name: 'E2E-004-belong-open',
        run: async (page) => {
            await gotoGrups(page)
            await openBelongDialog(page, 0) //row 0 = 權限群組M1（peter 屬之）
            return await captureStable(page)
        },
        semantic: async (page) => {
            const label = await page.evaluate(() => window.$vo.$t('grupBlngEditUsers'))
            const now = await page.evaluate(() => window.$vo.$t('grupBlngGrupNow'))
            const txt = await page.evaluate(() => document.body.innerText)
            assert.ok(txt.includes(label), `VeGrupBlngUsers 對話框標題應顯示（${label}）`)
            assert.ok(txt.includes(now), `對話框頂部應顯示當前群組標籤（${now}）`)
            assert.ok(txt.includes('權限群組M1'), '對話框頂部應顯示當前群組名 權限群組M1')
            //列＝全部 users，應見 peter/mary/john/admin
            assert.ok(txt.includes('peter') && txt.includes('mary') && txt.includes('admin'), '對話框應逐使用者列出 base seed users')
        },
    },
    {
        //E2E-005：於 VeGrupBlngUsers 勾選 mary（原不屬 M1）enable + 切其 mode → 點對話框 Save → updateUsers 寫 DB + 成功 modal。
        //斷言（有 DB 寫入）：結果 modal 顯示 userSaveUsersSuccess；DB mary.cgrups 含 權限群組M1 鍵。
        //對話框內列＝全部 users（依 order）：row0=peter, row1=mary, row2=john, row3=admin。
        name: 'E2E-005-belong-saved',
        run: async (page) => {
            await gotoGrups(page)
            await openBelongDialog(page, 0) //row 0 = 權限群組M1
            await toggleDialogEnable(page, 1) //勾選 mary enable（y）→ 歸屬 M1 → isModified=true → Save 鈕現身
            await setDialogMode(page, 1, 'AND') //切 mary 對 M1 之 mode 為 AND
            await saveBelongAndWaitModal(page) //updateUsers 寫 DB → 成功 modal
            return await captureStable(page)
        },
        semantic: async (page) => {
            await assertModalMsg(page, 'userSaveUsersSuccess')
            //DB mary.cgrups 應含 權限群組M1 鍵，且 mode/isActive 符所選
            const cgrups = await readDbUserCgrups(page, 'mary@example.com')
            assert.ok(cgrups && typeof cgrups === 'object' && cgrups['權限群組M1'], 'mary.cgrups 應含 權限群組M1 鍵（已歸屬本群組）')
            assert.equal(cgrups['權限群組M1'].isActive, 'y', 'mary 對 權限群組M1 isActive 應為 y')
            assert.equal(cgrups['權限群組M1'].mode, 'AND', 'mary 對 權限群組M1 mode 應為所選 AND')
        },
    },
    {
        //E2E-006：於 VeGrupBlngUsers 勾選 mary enable（變更）後改點 Close → reject('close window')、入口 B .catch 接住、未打 API。
        //斷言（取消路徑）：對話框關閉、無成功 modal；DB mary.cgrups 維持原值（不含 權限群組M1）。與 E2E-005 共覆蓋 Save/Close 分支。
        name: 'E2E-006-belong-cancel',
        run: async (page) => {
            await gotoGrups(page)
            await openBelongDialog(page, 0) //row 0 = 權限群組M1
            await toggleDialogEnable(page, 1) //勾選 mary enable（製造變更）
            await clickDialogClose(page) //Close → reject，入口 B .catch 接住、未寫 DB
            await waitDialogClosed(page, 'grupBlngEditUsers')
            return await captureStable(page)
        },
        semantic: async (page) => {
            //無成功 modal（systemMessage 未出現於本流程）
            const hasSuccess = await page.evaluate(() => (document.body.innerText || '').includes(window.$vo.$t('userSaveUsersSuccess')))
            assert.ok(!hasSuccess, 'Close 路徑不應出現 userSaveUsersSuccess')
            //DB mary.cgrups 維持原值（base seed: 僅 權限群組M2，不含 權限群組M1）
            const cgrups = await readDbUserCgrups(page, 'mary@example.com')
            assert.ok(cgrups && typeof cgrups === 'object' && !cgrups['權限群組M1'], 'mary.cgrups 不應含 權限群組M1（Close 未寫 DB）')
            assert.ok(cgrups['權限群組M2'], 'mary.cgrups 應維持 base seed 之 權限群組M2')
        },
    },
]

//手術式重產（§6.3）：--names a,b,c 只產指定 case；--langs eng,cht 只產指定語系。截圖「前」就 gate（省截圖成本）。
function argList(flag) {
    const i = process.argv.indexOf(flag)
    if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1].split(',').map((s) => s.trim()).filter(Boolean)
    return null
}
//前綴或完整匹配：傳 'E2E-002' 即可匹配 'E2E-002-cgrups-saved'（避免 §6.3 殷鑑「--names 只認字面」陷阱）
function nameMatch(list, caseName) { return list.some((nm) => caseName === nm || caseName.startsWith(nm)) }

async function generateBaseline() {
    console.log('=== 產製 rela-user-grup baseline 開始 ===')
    const onlyNames = argList('--names')
    const onlyLangs = argList('--langs')
    await startServersOnce()
    fs.mkdirSync(PICS_DIR, { recursive: true })
    //擷取 pristine base seed（DB 剛 fresh seed）——用臨時 browser
    { const b = await launchBrowser(); const pp = await openApp(b); BASE_SEED = await captureBaseSeed(pp); await b.close() }
    for (const lang of LANGS) {
        if (onlyLangs && !nameMatch(onlyLangs, lang)) continue //§6.3 手術式：跳過未指定語系
        for (const c of CASES) {
            if (onlyNames && !nameMatch(onlyNames, c.name)) continue //§6.3 手術式：截圖前 gate，跳過未指定 case
            //per-case fresh browser（消除 GPU/font/CSS cache 跨 case 累積造成的 cold/warm 差異；對齊 sso）
            const browser = await launchBrowser()
            await resetDb(browser, BASE_SEED) //throwaway page 還原 DB 為 base seed，關閉後再開 case page
            const page = await openApp(browser)
            await setLang(page, lang) //eng 也切（symmetric）：補等同 cht setLang 的 re-render+settle 時間
            const buf = await c.run(page, lang)
            fs.writeFileSync(picPath(lang, c.name), buf)
            console.log('wrote', picPath(lang, c.name), buf.length, 'bytes')
            await browser.close()
        }
    }
    cleanup()
    console.log('=== 產製 rela-user-grup baseline 完成 ===')
}

if (isBaseline) {
    generateBaseline().catch((err) => { console.log('baseline 例外', err); cleanup(); process.exit(1) })
}
else {
    for (const lang of LANGS) {
        describe(`e2e-rela-user-grup (${lang})`, function() {
            this.timeout(180000)
            let browser = null
            before(async function() {
                this.timeout(200000)
                await startServersOnce()
                if (!BASE_SEED) { const b = await launchBrowser(); const pp = await openApp(b); BASE_SEED = await captureBaseSeed(pp); await b.close() }
            })
            //per-case fresh browser：每 case 全新 browser 進程（對齊 sso），消 cross-case GPU/font cache 累積
            beforeEach(async function() {
                this.timeout(90000)
                browser = await launchBrowser()
                await resetDb(browser, BASE_SEED) //throwaway page 還原 DB 為 base seed
            })
            afterEach(async function() { if (browser) { await browser.close(); browser = null } })
            for (const c of CASES) {
                it(c.name, async () => {
                    const page = await openApp(browser)
                    await setLang(page, lang)
                    const buf = await c.run(page, lang)
                    if (c.semantic) await c.semantic(page)
                    const p = picPath(lang, c.name)
                    assert.ok(fs.existsSync(p), `baseline 不存在: ${p}（先跑 --baseline 產製）`)
                    if (!buf.equals(fs.readFileSync(p))) {
                        fs.writeFileSync(`./tmp/${lang}-${c.name}-actual.png`, buf) //供 diff
                        assert.fail(`pixel 不一致: ${p}（當次截圖存 ./tmp/${lang}-${c.name}-actual.png）`)
                    }
                })
            }
        })
    }
}
