//使用者群組關聯 e2e（B 類關聯編輯）。對應 spec/流程_使用者群組關聯.md。
//鏡像 test/e2e-grups.test.mjs / e2e-users.test.mjs（canonical pilot）骨架，差異在於互動發生於對話框「內」
//（勾選 enable checkbox / 切 OR-AND 模式控制項 / 點對話框 Save 或 Close）。
//雙模式：
//  - 產 baseline：node test/e2e-rela-user-grup.test.mjs --baseline （寫 test/pics/rela-user-grup/）
//  - 驗證（mocha）：npx mocha test/e2e-rela-user-grup.test.mjs --reporter list （pixelmatch 反鋸齒感知 + maxDiffPixels 容差比對，非 byte-exact）
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
//base seed（g_initialTestData → src/schema/tables/*）：
//  users(order0-3): peter(cgrups:權限群組M1), mary(權限群組M2), john(權限群組M3), admin(權限群組M4,isAdmin=y)
//  grups(order0-3): 權限群組M1, 權限群組M2, 權限群組M3, 權限群組M4
import fs from 'fs'
import assert from 'assert'
import JSON5 from 'json5'
import { startServersOnce, cleanup, launchBrowser, openApp, captureStable, captureStableWithBox, rowBoxSel, dialogRowBoxSel, waitUntilExist, getResolvedActiveTargets, assertBaselineMatch, dismissResultModal, captureBaseSeed, resetDb, setDialogModeWithShots, dialogEnableCheckboxSel, clickNavItem, openChipsAllWithShots, dialogChipsAllBtnSel, dialogChipsVisibleTargets, readDialogChipsRow, resizeWindowForChips, setChipsAllModeWithShots } from './tools/e2e-setup.mjs'

const PICS_DIR = './test/pics/rela-user-grup'
const LANGS = ['eng', 'cht']
const isBaseline = process.argv.includes('--baseline')

function picPath(lang, name) { return `${PICS_DIR}/rela-user-grup-${lang}-${name}.png` }

//紅框標注目標（captureStableWithBox）：本 case 主要觀看區
const SEL_GRID = '.ag-root-wrapper'                                            //清單 / grid 內容區
const SEL_MODAL = 'div[style*="overscroll-behavior"] div[tabindex="0"] > div'  //WDialog 結果 modal / Ve 對話框

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
    await clickNavItem(page, usersLabel) //限定導覽面板內（見 e2e-setup clickNavItem 註解）
    await waitUntilExist(page, '使用者 ag-grid 列', () => document.querySelectorAll('.ag-row').length > 0, { timeout: 20000 })
    await page.waitForTimeout(500)
}

//導航至群組頁（user-facing：點左側「權限群組」導覽），等 ag-grid 載入。
async function gotoGrups(page) {
    const grupsLabel = await page.evaluate(() => window.$vo.$t('mmGrups'))
    await clickNavItem(page, grupsLabel) //限定導覽面板內：自使用者頁切換時, 該頁「管控使用權限群組」表頭之 eng 文字與本選單同字, 全頁定位會誤點表頭
    await waitUntilExist(page, '群組 ag-grid 列', () => document.querySelectorAll('.ag-row').length > 0, { timeout: 20000 })
    await page.waitForTimeout(500)
}

//切換清單頁編輯模式（點 WSwitch，以「Edit mode/編輯模式」標籤觸發其 click 區）。預設編輯模式 ON，故唯讀案例需切一次關閉。
//沿用 e2e-rela-grup-pemi / e2e-rela-pemi-rule 之同名 helper（本檔原無此 helper，唯讀案例需要，逐字沿用 sibling canonical）。
async function toggleEditMode(page) {
    const label = await page.evaluate(() => window.$vo.$t('modeEdit'))
    await page.getByText(label, { exact: true }).first().click()
    await page.waitForTimeout(2000) //toggle 觸發 grid 欄位 reflow（增/減拖曳·勾選欄），等其完全 settle
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
//setDialogModeWithShots（切對話框內某列之模式控制項；觸發 showVe*ToggleItemModeByName → isModified=true）收斂進 e2e-setup.mjs 共用：
//mode 欄已改自製下拉 WTextSelect（2026-09-14），須「點觸發 → 點清單項」兩步真點擊，本檔不再自留副本。
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
//captureBaseSeed(page,'users') / resetDb(browser,'users',seed) 收斂進 e2e-setup.mjs 共用
//（原本 grups/pemis/rela-grup-pemi/rela-pemi-rule/rela-user-grup/targets/users 七檔重複定義）。
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
            const s1 = await captureStableWithBox(page, rowBoxSel(0)) //E2E-001-1-source-row：開窗前來源列（peter，row 0）
            await openCgrupsDialog(page, 0) //row 0 = peter（cgrups: 權限群組M1）
            const s2 = await captureStableWithBox(page, SEL_MODAL) //E2E-001-2-dialog-open：VeCgrups 對話框初始開啟態
            return [
                { name: 'E2E-001-1-source-row', buf: s1 },
                { name: 'E2E-001-2-dialog-open', buf: s2 },
            ]
        },
        semantic: async (page) => {
            const label = await page.evaluate(() => window.$vo.$t('userEditCgrups'))
            const txt = await page.evaluate(() => document.body.innerText)
            assert.ok(txt.includes(label), `VeCgrups 對話框標題應顯示（${label}）`)
            //對話框以全部 grups 為列，故應見全部 4 個 group 名
            assert.ok(txt.includes('權限群組M1') && txt.includes('權限群組M4'), '對話框應逐群組列出 base seed grups')

            //對應 spec E2E-001 驗證1（B6，本次唯一之行為變更）：編輯模式下，未勾選列之模式控制項 editable=false
            //（透明度 0.6、無展開箭頭、點擊不展開）；已勾選列則可展開。唯讀案例（isEditable=false）全列皆淡化，
            //不論 `&& props.row.enable === 'y'` 在不在都會通過，故本條必須在「編輯模式」下驗才有守門力。
            const ed = await page.evaluate(() => {
                const rows = [...document.querySelectorAll('.ag-row[row-index]')]
                const out = []
                for (const r of rows) {
                    const cell = r.querySelector('.ag-cell[col-id="mode"]')
                    const chk = r.querySelector('.ag-cell[col-id="enable"] input[type="checkbox"]')
                    if (!cell || !chk) continue
                    const shell = cell.querySelector('[style*="opacity"]')
                    out.push({
                        idx: r.getAttribute('row-index'),
                        checked: chk.checked,
                        opacity: shell ? Number(getComputedStyle(shell).opacity) : null,
                        nArrow: cell.querySelectorAll('svg').length,
                    })
                }
                return out
            })
            const onRows = ed.filter((v) => v.checked)
            const offRows = ed.filter((v) => !v.checked)
            assert.ok(onRows.length > 0 && offRows.length > 0, `VeCgrups 應同時有已勾選與未勾選之列（實得 ${JSON.stringify(ed)}）`)
            assert.ok(offRows.every((v) => Math.abs(v.opacity - 0.6) < 0.01), `未勾選列之模式控制項應淡化為 0.6（實得 ${JSON.stringify(offRows)}）`)
            assert.ok(offRows.every((v) => v.nArrow === 0), `未勾選列之模式控制項不應渲染展開箭頭（實得 ${JSON.stringify(offRows)}）`)
            //對照組：已勾選列不淡化且渲染展開箭頭。不以「觸發區 div 是否存在」判別——該 div 兩態皆在,
            //  且其屬性為 `_tabindex`（前綴底線之惰性屬性, 非 HTML tabindex, 元件庫刻意不用真 tabindex：
            //  `WTextSuggestCore.vue:25-28` 註明用了會擋掉 windowMousedown/Up 而使 popup 無法自動取消）, 本就不可聚焦。
            assert.ok(onRows.every((v) => Math.abs(v.opacity - 1) < 0.01), `已勾選列之模式控制項不應淡化（實得 ${JSON.stringify(onRows)}）`)
            assert.ok(onRows.every((v) => v.nArrow === 1), `已勾選列之模式控制項應渲染展開箭頭（實得 ${JSON.stringify(onRows)}）`)
            //點未勾選列之模式控制項不應展開清單
            await page.locator(`.ag-row[row-index="${offRows[0].idx}"] .ag-cell[col-id="mode"] [style*="opacity"]`).first().click()
            await page.waitForTimeout(500)
            const nPopOff = await page.locator('.WPopperFix[wtlp="modeSelect"]:visible').count()
            assert.equal(nPopOff, 0, `編輯模式下點未勾選列之模式控制項不應展開清單（實得 ${nPopOff}）`)
        },
    },
    {
        //E2E-002：於 VeCgrups 勾選 權限群組M2 enable + 切其 mode→AND → 點對話框 Save → resolve 回填使用者列。
        //斷言（前端回填，無 DB 寫入）：peter 使用者列 cgrups 文字由 1→2 群組；對話框關閉。不可斷言 userSaveUsersSuccess。
        //多階段：E2E-002-1-dialog-toggled（toggle+mode 後、Save 前之對話框態）→ E2E-002-cgrups-saved（回到清單 grid，cgrups 已回填）。
        name: 'E2E-002-cgrups-saved',
        run: async (page) => {
            await gotoUsers(page)
            const s1 = await captureStableWithBox(page, rowBoxSel(0)) //E2E-002-1-source-row：開窗前來源列（peter，row 0）
            await openCgrupsDialog(page, 0) //row 0 = peter
            const s2 = await captureStableWithBox(page, SEL_MODAL) //E2E-002-2-dialog-open：VeCgrups 對話框初始態（第一個 toggle 前）
            //對話框內列＝全部 grups（依 order）：row0=M1, row1=M2, row2=M3, row3=M4。以下每步兩張（點擊前框要點、點擊後框反應元素）
            const s3 = await captureStableWithBox(page, dialogEnableCheckboxSel(1)) //E2E-002-3-click-enable：點擊前框住 權限群組M2 列之 enable checkbox
            await toggleDialogEnable(page, 1) //勾選 權限群組M2 enable（y）→ isModified=true → Save 鈕現身
            const s4 = await captureStableWithBox(page, dialogRowBoxSel(1)) //E2E-002-4-enable-checked：勾選後框住該列（checkbox 已勾、Save 鈕現身）
            const m = await setDialogModeWithShots(page, 1, 'AND') //E2E-002-5/6/7：點下拉前框觸發區 → 清單展開框整份清單 → 點「AND」前框該項目；選取後清單關閉
            const s8 = await captureStableWithBox(page, dialogRowBoxSel(1)) //E2E-002-8-row-toggled：切 AND 後框住該列（mode 顯示 AND）
            const s9 = await captureStableWithBox(page, dlgBtn(page, DLG_MDI.save)) //E2E-002-9-click-save：點擊前框住對話框 Save 鈕
            await clickDialogSave(page) //resolve cgrups 字串回填使用者列，對話框關閉
            await waitDialogClosed(page, 'userEditCgrups')
            const s10 = await captureStableWithBox(page, rowBoxSel(0)) //E2E-002-10-cgrups-saved：對話框已關閉，peter 列 cgrups 欄文字已由 1→2 群組回填
            return [
                { name: 'E2E-002-1-source-row', buf: s1 },
                { name: 'E2E-002-2-dialog-open', buf: s2 },
                { name: 'E2E-002-3-click-enable', buf: s3 },
                { name: 'E2E-002-4-enable-checked', buf: s4 },
                { name: 'E2E-002-5-click-mode', buf: m.clickMode },
                { name: 'E2E-002-6-list-open', buf: m.listOpen },
                { name: 'E2E-002-7-click-and', buf: m.clickItem },
                { name: 'E2E-002-8-row-toggled', buf: s8 },
                { name: 'E2E-002-9-click-save', buf: s9 },
                { name: 'E2E-002-10-cgrups-saved', buf: s10 },
            ]
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
            const s1 = await captureStableWithBox(page, rowBoxSel(0)) //E2E-003-1-source-row：開窗前來源列（peter，row 0）
            await openCgrupsDialog(page, 0) //row 0 = peter
            const s2 = await captureStableWithBox(page, SEL_MODAL) //E2E-003-2-dialog-open：VeCgrups 對話框初始態（第一個 toggle 前）
            await toggleDialogEnable(page, 1) //勾選 權限群組M2 enable（製造變更）
            const s3 = await captureStableWithBox(page, dialogRowBoxSel(1)) //E2E-003-3-row-toggled：對話框內 row1（M2）toggle 後、Close 前
            await clickDialogClose(page) //Close → reject，入口 A .catch 不回填
            await waitDialogClosed(page, 'userEditCgrups')
            //把原值掛到 page 供 semantic 取用
            await page.evaluate((b) => { window.__cgrupsBefore = b }, before)
            const s4 = await captureStableWithBox(page, rowBoxSel(0)) //E2E-003-4-cancelled-grid：對話框已關閉，peter 列 cgrups 欄文字維持原值未變
            return [
                { name: 'E2E-003-1-source-row', buf: s1 },
                { name: 'E2E-003-2-dialog-open', buf: s2 },
                { name: 'E2E-003-3-row-toggled', buf: s3 },
                { name: 'E2E-003-4-cancelled-grid', buf: s4 },
            ]
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
            const s1 = await captureStableWithBox(page, rowBoxSel(0)) //E2E-004-1-source-row：開窗前來源列（權限群組M1，row 0）
            await openBelongDialog(page, 0) //row 0 = 權限群組M1（peter 屬之）
            const s2 = await captureStableWithBox(page, SEL_MODAL) //E2E-004-2-dialog-open：VeGrupBlngUsers 對話框初始開啟態
            return [
                { name: 'E2E-004-1-source-row', buf: s1 },
                { name: 'E2E-004-2-dialog-open', buf: s2 },
            ]
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
            //spec 語意：表頭三欄（name / enable / grupsNames，無獨立 mode 欄）。
            //須 scope 到對話框（SEL_MODAL）：背景主表之表頭同在 DOM, 全頁查詢會把主表 name/cpemis/belongUsers 一併算入
            const heads = await page.evaluate((sel) => {
                const modal = document.querySelector(sel)
                if (!modal) return null
                return [...modal.querySelectorAll('.ag-header-cell[col-id]')].map((e) => e.getAttribute('col-id'))
            }, SEL_MODAL)
            assert.deepEqual(heads, ['name', 'enable', 'grupsNames'],
                `所屬對話框欄序應為 name / enable / grupsNames 且無 mode 欄（實得 ${JSON.stringify(heads)}）`)
            //spec E2E-004 驗證1：1440 寬下各列標籤皆完整可見，故不出現「+N」溢出指示（指示只在實測寬度放不下時出現，與標籤數無關）。
            //selector 沿用 helper 之 dialogChipsAllBtnSel（同一規則不得兩處手寫），以 SEL_MODAL 前綴 scope 至對話框
            const nBtnAll = await page.evaluate((sel) => document.querySelectorAll(sel).length, `${SEL_MODAL} ${dialogChipsAllBtnSel(0, 'grupsNames').replace(/^\.ag-row\[row-index="0"\] /, '')}`)
            assert.equal(nBtnAll, 0, `1440 寬下各列標籤皆放得下，不應出現「+N」溢出指示（實得 ${nBtnAll} 顆）`)
            //spec 語意（正向）：每列皆有標籤，且既屬本群組之列其第 1 顆標籤為醒目色並含可展開之模式段
            const chip = await page.evaluate((sel) => {
                const modal = document.querySelector(sel)
                if (!modal) return null
                const cells = [...modal.querySelectorAll('.ag-cell[col-id="grupsNames"]')]
                const first = cells.map((c) => c.querySelector('div[title][style*="align-items: stretch"]')).filter(Boolean)
                const cur = first.find((e) => e.querySelector('div[_tabindex="0"]'))
                if (!cur) return { nCell: cells.length, nChip: first.length, cur: null }
                const nameSeg = cur.children[1]
                return { nCell: cells.length, nChip: first.length, cur: cur.getAttribute('title'), nameBg: getComputedStyle(nameSeg).backgroundColor }
            }, SEL_MODAL)
            assert.ok(chip && chip.nChip === chip.nCell && chip.nCell > 0, `每列皆應有關聯標籤（實得 ${JSON.stringify(chip)}）`)
            assert.equal(chip.cur, '權限群組M1', `既屬本群組之列其第 1 顆標籤應為本群組（實得 ${chip && chip.cur}）`)
            assert.equal(chip.nameBg, 'rgb(210, 47, 100)', `本項標籤名稱段應為醒目色 #d22f64（實得 ${chip && chip.nameBg}）`)
        },
    },
    {
        //E2E-005：於 VeGrupBlngUsers 勾選 mary（原不屬 M1）enable + 切其 mode → 點對話框 Save → updateUsers 寫 DB + 成功 modal。
        //斷言（有 DB 寫入）：結果 modal 顯示 userSaveUsersSuccess；DB mary.cgrups 含 權限群組M1 鍵。
        //對話框內列＝全部 users（依 order）：row0=peter, row1=mary, row2=john, row3=admin。
        //多階段：E2E-005-1-dialog-toggled（toggle+mode 後、Save 前之對話框態）→ E2E-005-belong-saved（存檔成功 modal）。
        name: 'E2E-005-belong-saved',
        run: async (page) => {
            await gotoGrups(page)
            const s1 = await captureStableWithBox(page, rowBoxSel(0)) //E2E-005-1-source-row：開窗前來源列（權限群組M1，row 0）
            await openBelongDialog(page, 0) //row 0 = 權限群組M1
            const s2 = await captureStableWithBox(page, SEL_MODAL) //E2E-005-2-dialog-open：VeGrupBlngUsers 對話框初始態（第一個 toggle 前）
            //以下每步兩張（點擊前框要點、點擊後框反應元素）
            const s3 = await captureStableWithBox(page, dialogEnableCheckboxSel(1)) //E2E-005-3-click-enable：點擊前框住 mary 列之 enable checkbox
            await toggleDialogEnable(page, 1) //勾選 mary enable（y）→ 歸屬 M1 → isModified=true → Save 鈕現身
            const s4 = await captureStableWithBox(page, dialogRowBoxSel(1)) //E2E-005-4-enable-checked：勾選後框住該列（checkbox 已勾、代表 M1 之醒目標籤已插入為第 1 顆）
            //spec E2E-005 驗證1：勾選後該列 2 顆標籤皆完整可見且無「+N」溢出指示（1440 寬, 儲存格可用寬足以容納）——業主 2026-09-17 指出「已全部看得到卻出現展開鈕」之守門
            const r4 = await readDialogChipsRow(page, 1, 'grupsNames')
            assert.deepEqual(r4.titles, ['權限群組M1', '權限群組M2'], `勾選後 mary 列應可見 2 顆且本項排第 1 顆（實得 ${JSON.stringify(r4.titles)}）`)
            assert.equal(r4.ind, null, `兩顆放得下時不應出現「+N」溢出指示（實得 ${r4.ind}）`)
            //模式併入本項標籤左段（2026-09-16 起所屬對話框無獨立 mode 欄），故傳 colId:'grupsNames'
            const m = await setDialogModeWithShots(page, 1, 'AND', { colId: 'grupsNames' }) //E2E-005-5/6/7：點模式段前框住模式段整顆 → 清單展開框整份清單 → 點「AND」前框該項目
            const s8 = await captureStableWithBox(page, dialogRowBoxSel(1)) //E2E-005-8-row-toggled：切 AND 後框住該列（第 1 顆標籤之模式段顯示 AND）
            const s9 = await captureStableWithBox(page, dlgBtn(page, DLG_MDI.save)) //E2E-005-9-click-save：點擊前框住對話框 Save 鈕
            await saveBelongAndWaitModal(page) //updateUsers 寫 DB → 成功 modal
            const s10 = await captureStableWithBox(page, SEL_MODAL) //E2E-005-10-belong-saved：對話框 Save 後成功結果 modal
            await assertModalMsg(page, 'userSaveUsersSuccess') //關 modal 前斷言成功訊息（dismiss 後文字消失，故移此處）
            await dismissResultModal(page)
            const s11 = await captureStableWithBox(page, rowBoxSel(0)) //E2E-005-11-data-changed：關 modal 後、群組頁 M1 列「管控所屬使用者」已含 mary
            return [
                { name: 'E2E-005-1-source-row', buf: s1 },
                { name: 'E2E-005-2-dialog-open', buf: s2 },
                { name: 'E2E-005-3-click-enable', buf: s3 },
                { name: 'E2E-005-4-enable-checked', buf: s4 },
                { name: 'E2E-005-5-click-mode', buf: m.clickMode },
                { name: 'E2E-005-6-list-open', buf: m.listOpen },
                { name: 'E2E-005-7-click-and', buf: m.clickItem },
                { name: 'E2E-005-8-row-toggled', buf: s8 },
                { name: 'E2E-005-9-click-save', buf: s9 },
                { name: 'E2E-005-10-belong-saved', buf: s10 },
                { name: 'E2E-005-11-data-changed', buf: s11 },
            ]
        },
        semantic: async (page) => {
            //（成功 modal 文字斷言已移至 run() dismiss 前）
            //DB mary.cgrups 應含 權限群組M1 鍵，且 mode/isActive 符所選
            const cgrups = await readDbUserCgrups(page, 'mary@example.com')
            assert.ok(cgrups && typeof cgrups === 'object' && cgrups['權限群組M1'], 'mary.cgrups 應含 權限群組M1 鍵（已歸屬本群組）')
            assert.equal(cgrups['權限群組M1'].isActive, 'y', 'mary 對 權限群組M1 isActive 應為 y')
            assert.equal(cgrups['權限群組M1'].mode, 'AND', 'mary 對 權限群組M1 mode 應為所選 AND')
            //spec 語意：顯示端把本項標籤排第 1 顆只改顯示、不改儲存字串之鍵序（原有 M2 仍在 M1 之前）
            assert.deepEqual(Object.keys(cgrups), ['權限群組M2', '權限群組M1'],
                `儲存字串鍵序應維持原順序（實得 ${JSON.stringify(Object.keys(cgrups))}）`)
            //【端到端核心不變式：權限變更 → 解析後權限樹】mary 從 {M2(OR)} 變 {M2(OR), M1(AND)}，群組層 M2 聯集後與 M1 交集。
            //預期 active 4 個（getUserRules 算出）；驗 getPermUserInfor 回傳的 resolved 權限樹符合此合併結果。
            const tree = await getResolvedActiveTargets(page, 'id-for-mary')
            assert.deepEqual(tree, ['專案A/頁C', '專案B/頁A/區塊A', '專案B/頁A/區塊B', '專案B/頁A/區塊C'],
                `mary 解析後權限樹應反映 +=M1(AND) 之群組層合併（實得 ${JSON.stringify(tree)}）`)
        },
    },
    {
        //E2E-006：於 VeGrupBlngUsers 勾選 mary enable（變更）後改點 Close → reject('close window')、入口 B .catch 接住、未打 API。
        //斷言（取消路徑）：對話框關閉、無成功 modal；DB mary.cgrups 維持原值（不含 權限群組M1）。與 E2E-005 共覆蓋 Save/Close 分支。
        name: 'E2E-006-belong-cancel',
        run: async (page) => {
            await gotoGrups(page)
            const s1 = await captureStableWithBox(page, rowBoxSel(0)) //E2E-006-1-source-row：開窗前來源列（權限群組M1，row 0）
            await openBelongDialog(page, 0) //row 0 = 權限群組M1
            const s2 = await captureStableWithBox(page, SEL_MODAL) //E2E-006-2-dialog-open：VeGrupBlngUsers 對話框初始態（第一個 toggle 前）
            await toggleDialogEnable(page, 1) //勾選 mary enable（製造變更）
            const s3 = await captureStableWithBox(page, dialogRowBoxSel(1)) //E2E-006-3-row-toggled：對話框內 row1（mary）toggle 後、Close 前
            await clickDialogClose(page) //Close → reject，入口 B .catch 接住、未寫 DB
            await waitDialogClosed(page, 'grupBlngEditUsers')
            const s4 = await captureStableWithBox(page, rowBoxSel(0)) //E2E-006-4-cancelled-grid：對話框已關閉，M1 列摘要維持原值未變（DB 未寫入）
            return [
                { name: 'E2E-006-1-source-row', buf: s1 },
                { name: 'E2E-006-2-dialog-open', buf: s2 },
                { name: 'E2E-006-3-row-toggled', buf: s3 },
                { name: 'E2E-006-4-cancelled-grid', buf: s4 },
            ]
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

    //—————————————— 唯讀檢視（isEditable=false 守門，與可編輯案例共覆蓋兩分支）——————————————

    {
        //E2E-007：使用者頁關閉編輯模式後開 VeCgrups → 檢視版標題（userEditCgrupsForDisplay）、無 Save 鈕、模式控制項不可編輯、enable checkbox 皆 disabled。
        //對應 spec 流程_使用者群組關聯.md E2E-007。單階段截圖：唯讀檢視對話框開啟態。
        name: 'E2E-007-readonly-view',
        run: async (page) => {
            await gotoUsers(page)
            await toggleEditMode(page) //關閉編輯模式 → isEditable=false
            //關編輯模式後 cgrups 欄仍為按鈕（getCgrupsText），點之開檢視版對話框
            await page.locator(`.ag-row[row-index="0"] .ag-cell[col-id="cgrups"] button`).first().click()
            await waitUntilExist(page, 'VeCgrups 檢視版標題', () => {
                const vo = window.$vo
                return (document.body.innerText || '').includes(vo.$t('userEditCgrupsForDisplay'))
            }, { timeout: 15000 })
            await waitDialogGrid(page)
            return await captureStableWithBox(page, SEL_MODAL) //VeCgrups 唯讀檢視對話框開啟態
        },
        semantic: async (page) => {
            //對應 spec E2E-007 驗證1：標題為檢視版鍵。
            const dispLabel = await page.evaluate(() => window.$vo.$t('userEditCgrupsForDisplay'))
            const txt = await page.evaluate(() => document.body.innerText)
            assert.ok(txt.includes(dispLabel), `應顯示檢視版標題（${dispLabel}）`)
            //對應 spec E2E-007 驗證1：無對話框 Save 鈕（hasSaveBtn=isEditable && isModified，isEditable=false 恆不渲染）。
            //eng / cht 皆可由標題區分：userEditCgrups=Edit list of user / 編輯使用權限群組；
            //userEditCgrupsForDisplay=Permission groups of user / 展示使用權限群組（server/procLang.mjs:744-751）。
            const saveCnt = await dlgBtn(page, DLG_MDI.save).count()
            assert.equal(saveCnt, 0, '唯讀檢視不應出現對話框 Save 鈕')
            //對應 spec E2E-007 驗證1：模式控制項為不可編輯態（透明度 0.6、無展開箭頭、點擊不展開）、enable checkbox 皆 disabled（VeCgrups.vue:134,138）。
            const ro = await page.evaluate(() => {
                const chks = [...document.querySelectorAll('.ag-cell[col-id="enable"] input[type="checkbox"]')]
                const shells = [...document.querySelectorAll('.ag-cell[col-id="mode"] [style*="opacity"]')]
                const arrows = [...document.querySelectorAll('.ag-cell[col-id="mode"] svg')]
                return {
                    allChkDisabled: chks.length > 0 && chks.every((e) => e.disabled === true),
                    nShell: shells.length,
                    allFaded: shells.length > 0 && shells.every((e) => Math.abs(Number(getComputedStyle(e).opacity) - 0.6) < 0.01),
                    nArrow: arrows.length,
                }
            })
            assert.ok(ro.allChkDisabled, '唯讀檢視之 enable checkbox 應皆 disabled')
            assert.ok(ro.allFaded, `唯讀檢視之模式控制項應淡化為 0.6（實得 ${ro.nShell} 顆）`)
            assert.equal(ro.nArrow, 0, `唯讀檢視之模式控制項不應渲染展開箭頭（實得 ${ro.nArrow} 個）`)
            //點擊不展開：點第一個模式控制項後不應出現可見清單
            //不加 .catch 吞掉點擊失敗：點不到時「沒有清單」會空過, 斷言即失去守門力
            await page.locator('.ag-cell[col-id="mode"] [style*="opacity"]').first().click()
            await page.waitForTimeout(500)
            const nPop = await page.locator('.WPopperFix[wtlp="modeSelect"]:visible').count()
            assert.equal(nPop, 0, '唯讀檢視點模式控制項不應展開清單')
        },
    },
    {
        //E2E-008：群組頁關閉編輯模式後開 VeGrupBlngUsers → 檢視版標題（grupBlngEditUsersForDisplay）、無 Save 鈕、標籤模式段為純文字（本對話框自 2026-09-16 起無獨立 mode 欄）、enable checkbox 皆 disabled。
        //對應 spec 流程_使用者群組關聯.md E2E-008。單階段截圖：唯讀檢視對話框開啟態。
        name: 'E2E-008-readonly-view',
        run: async (page) => {
            await gotoGrups(page)
            await toggleEditMode(page) //關閉編輯模式 → isEditable=false
            //關編輯模式後 belongUsers 欄仍為按鈕，點之開檢視版對話框
            await page.locator(`.ag-row[row-index="0"] .ag-cell[col-id="belongUsers"] button`).first().click()
            await waitUntilExist(page, 'VeGrupBlngUsers 檢視版標題', () => {
                const vo = window.$vo
                return (document.body.innerText || '').includes(vo.$t('grupBlngEditUsersForDisplay'))
            }, { timeout: 15000 })
            await waitDialogGrid(page)
            return await captureStableWithBox(page, SEL_MODAL) //VeGrupBlngUsers 唯讀檢視對話框開啟態
        },
        semantic: async (page) => {
            //對應 spec E2E-008 驗證1：標題為檢視版鍵（grupBlngEditUsersForDisplay，eng/cht 皆與編輯版相異）。
            const dispLabel = await page.evaluate(() => window.$vo.$t('grupBlngEditUsersForDisplay'))
            const editLabel = await page.evaluate(() => window.$vo.$t('grupBlngEditUsers'))
            const txt = await page.evaluate(() => document.body.innerText)
            assert.ok(txt.includes(dispLabel), `應顯示檢視版標題（${dispLabel}）`)
            assert.ok(!txt.includes(editLabel) || dispLabel.includes(editLabel) === false, '不應為可編輯版標題')
            //對應 spec E2E-008 驗證1：無對話框 Save 鈕（hasSaveBtn=isEditable && isModified）。
            const saveCnt = await dlgBtn(page, DLG_MDI.save).count()
            assert.equal(saveCnt, 0, '唯讀檢視不應出現對話框 Save 鈕')
            //對應 spec E2E-008 驗證1：標籤之模式段為純文字（無下拉觸發區）、enable checkbox 皆 disabled（VeGrupBlngUsers.vue:152、RelationChip.vue:15）。
            const ro = await page.evaluate(() => {
                const chks = [...document.querySelectorAll('.ag-cell[col-id="enable"] input[type="checkbox"]')]
                const trigs = [...document.querySelectorAll('.ag-cell[col-id="grupsNames"] div[_tabindex="0"]')]
                return { nChk: chks.length, allChkDisabled: chks.length > 0 && chks.every((e) => e.disabled === true), nTrig: trigs.length }
            })
            assert.equal(ro.nTrig, 0, `唯讀檢視之標籤模式段應為純文字、無下拉觸發區（實得 ${ro.nTrig} 個）`)
            assert.ok(ro.allChkDisabled, `唯讀檢視之 enable checkbox 應皆 disabled（實得 ${ro.nChk} 顆）`)
            //正向斷言（避免「標籤根本沒渲染」時負向斷言恆真）：至少一顆本項標籤存在、其模式段為 OR/AND 純文字
            const pos = await page.evaluate((c) => {
                const chips = [...document.querySelectorAll(`.ag-cell[col-id="${c}"] div[title][style*="align-items: stretch"]`)]
                return chips.map((e) => ({ title: e.getAttribute('title'), mode: (e.children[0].textContent || '').trim() }))
            }, 'grupsNames')
            assert.ok(pos.length > 0, `唯讀檢視仍應渲染關聯標籤（實得 ${pos.length} 顆）`)
            assert.ok(pos.some((v) => v.title === '權限群組M1'), `應含代表本項之標籤 權限群組M1（實得 ${JSON.stringify(pos.slice(0, 4))}）`)
            assert.ok(pos.every((v) => v.mode === 'OR' || v.mode === 'AND'), `各標籤模式段應為 OR / AND 純文字（實得 ${JSON.stringify(pos.slice(0, 4))}）`)
        },
    },
    {
        //E2E-009：窄視窗下 mary 列標籤收合為「本項 + +1」→ 點「+1」開浮層 → 於浮層內改本項模式為 AND → 拉回寬視窗後指示消失。
        //對應 spec 流程_使用者群組關聯.md E2E-009；與 流程_群組權限關聯.md E2E-007 對稱。
        //6 步真實路徑：①群組頁 M1 列 ②點 belongUsers 按鈕開對話框 ③勾選 mary（該列 2 顆）④縮小瀏覽器視窗（對話框與表格隨之變窄, 標籤列收合）
        //  ⑤點「+1」開浮層、於浮層內點本項模式段選 AND ⑥浮層關閉、該列本項顯示 AND、對話框出現 Save 鈕；未按 Save, DB 不變
        //語意斷言放在 run() 內：收合、浮層內容與選取後狀態皆為過程中之觀察（事後不可再觀察）, 且 regen 端只跑 run(), 寫檔前即守門。
        //視窗寬 480：2026-09-17 以 2px 步距實測 mary 列勾選後於視窗寬 ≤672 時收合（672 時儲存格寬 268），eng/cht 相同。
        //編輯模式：settings.json 之 modeEditGrups='y', 進頁即編輯模式；openBelongDialog 以編輯版標題 grupBlngEditUsers 為就緒訊號, 等同守門。
        name: 'E2E-009-chips-collapse-edit',
        run: async (page) => {
            await gotoGrups(page)
            const s1 = await captureStableWithBox(page, rowBoxSel(0)) //E2E-009-1-source-row：開窗前來源列（權限群組M1，row 0）
            await openBelongDialog(page, 0)
            const s2 = await captureStableWithBox(page, SEL_MODAL) //E2E-009-2-dialog-open：VeGrupBlngUsers 對話框初始態
            const s3 = await captureStableWithBox(page, dialogEnableCheckboxSel(1)) //E2E-009-3-click-enable：點擊前框住 mary 列之 enable checkbox
            await toggleDialogEnable(page, 1)
            const s4 = await captureStableWithBox(page, dialogRowBoxSel(1)) //E2E-009-4-enable-checked：勾選後框住該列（兩顆標籤皆完整可見、無「+」按鈕）
            const r4 = await readDialogChipsRow(page, 1, 'grupsNames')
            assert.deepEqual(r4.titles, ['權限群組M1', '權限群組M2'], `1440 寬下 mary 列應可見 2 顆（實得 ${JSON.stringify(r4.titles)}）`)
            assert.equal(r4.ind, null, `1440 寬下不應出現「+N」（實得 ${r4.ind}）`)

            //④縮小視窗：無點擊目標故無點擊前之圖, 反應直接框收合後之標籤列（可見標籤 ∪ 指示）
            await resizeWindowForChips(page, 480, 1, 'grupsNames', true)
            const r5 = await readDialogChipsRow(page, 1, 'grupsNames')
            const showAll = await page.evaluate(() => window.$vo.$t('chipsShowAll'))
            assert.deepEqual(r5.titles, ['權限群組M1'], `480 寬下 mary 列應只見本項 1 顆（實得 ${JSON.stringify(r5.titles)}）`)
            assert.equal(r5.ind, '+1', `480 寬下指示應為「+1」（實得 ${r5.ind}）`)
            assert.equal(r5.indTitle, showAll, `指示之停留提示應為 chipsShowAll（實得 ${r5.indTitle}）`)
            const s5 = await captureStableWithBox(page, await dialogChipsVisibleTargets(page, 1, 'grupsNames')) //E2E-009-5-row-collapsed：框住可見之醒目 M1 標籤與「+1」之聯集

            //⑤開浮層（helper 內：點擊前框「+1」→ 展開後框整個浮層；浮層保持開啟）
            const c = await openChipsAllWithShots(page, 1, 'grupsNames') //E2E-009-6-click-more / E2E-009-7-popup-open
            //回歸守門：點「+1」時游標停在指示上（hover 態改變使標籤列重繪），被收合之標籤不得因重繪而重新顯示
            //  （2026-09-17 實測舊版以 v-show 隱藏時, 任何無關重繪都會使 Vue 2 style 模組寫回 display, 2 顆與「+1」同時可見）
            const r7 = await readDialogChipsRow(page, 1, 'grupsNames')
            assert.deepEqual(r7.titles, ['權限群組M1'], `開浮層後儲存格內仍應只見本項 1 顆（實得 ${JSON.stringify(r7.titles)}）`)
            const titleTpl = await page.evaluate(() => window.$vo.$t('chipsPopupTitle').replace('{title}', window.$vo.$t('belongGrupsNames')).replace('{n}', 2))
            assert.ok(c.info, '浮層應可量得內容')
            assert.equal(c.info.title, titleTpl, `浮層標題應為 chipsPopupTitle 代入欄名與數量（實得 ${c.info.title}）`)
            assert.deepEqual(c.info.titles, ['權限群組M1', '權限群組M2'], `浮層應列出全部 2 顆且本項排第 1 顆（實得 ${JSON.stringify(c.info.titles)}）`)
            assert.deepEqual(c.info.editable, [true, false], `浮層內本項應可改（帶展開箭頭）、他項唯讀（實得 ${JSON.stringify(c.info.editable)}）`)
            assert.equal(c.info.firstNameBg, 'rgb(210, 47, 100)', `浮層首顆名稱段應為醒目色 #d22f64（實得 ${c.info.firstNameBg}）`)

            //於浮層內改模式（helper 內：點模式段前框模式段 → 清單框整份 → 點 AND 前框該項 → 選取後等清單與浮層皆關閉）
            const pm = await setChipsAllModeWithShots(page, 'AND') //E2E-009-8-click-mode / 9-list-open / 10-click-and
            assert.ok(pm.z.list > pm.z.popup, `模式清單應疊在浮層之上（實得 ${JSON.stringify(pm.z)}）`)
            const r11 = await readDialogChipsRow(page, 1, 'grupsNames')
            assert.deepEqual(r11.titles, ['權限群組M1'], `選取後 480 寬下仍應只見本項 1 顆（實得 ${JSON.stringify(r11.titles)}）`)
            assert.equal(r11.modes[0], 'AND', `選取後本項標籤模式段應顯示 AND（實得 ${r11.modes[0]}）`)
            assert.equal(r11.ind, '+1', `選取後仍應接「+1」（實得 ${r11.ind}）`)
            assert.equal(await dlgBtn(page, DLG_MDI.save).count(), 1, '於浮層內改模式後對話框應出現 Save 鈕（已有未存變更）')
            const s11 = await captureStableWithBox(page, await dialogChipsVisibleTargets(page, 1, 'grupsNames')) //E2E-009-11-row-toggled：框住可見之醒目標籤（AND）與「+1」之聯集

            //⑥拉回寬視窗：指示消失、兩顆完整
            await resizeWindowForChips(page, 1440, 1, 'grupsNames', false)
            const r12 = await readDialogChipsRow(page, 1, 'grupsNames')
            assert.deepEqual(r12.titles, ['權限群組M1', '權限群組M2'], `拉回 1440 後 mary 列應可見 2 顆（實得 ${JSON.stringify(r12.titles)}）`)
            assert.equal(r12.modes[0], 'AND', `拉回後本項仍為 AND（實得 ${r12.modes[0]}）`)
            const s12 = await captureStableWithBox(page, await dialogChipsVisibleTargets(page, 1, 'grupsNames')) //E2E-009-12-row-expanded：框住兩顆標籤之聯集（「+1」已消失）
            return [
                { name: 'E2E-009-1-source-row', buf: s1 },
                { name: 'E2E-009-2-dialog-open', buf: s2 },
                { name: 'E2E-009-3-click-enable', buf: s3 },
                { name: 'E2E-009-4-enable-checked', buf: s4 },
                { name: 'E2E-009-5-row-collapsed', buf: s5 },
                { name: 'E2E-009-6-click-more', buf: c.clickBtn },
                { name: 'E2E-009-7-popup-open', buf: c.popupOpen },
                { name: 'E2E-009-8-click-mode', buf: pm.clickMode },
                { name: 'E2E-009-9-list-open', buf: pm.listOpen },
                { name: 'E2E-009-10-click-and', buf: pm.clickItem },
                { name: 'E2E-009-11-row-toggled', buf: s11 },
                { name: 'E2E-009-12-row-expanded', buf: s12 },
            ]
        },
        semantic: async (page) => {
            //spec E2E-009 清理：未按 Save, DB 不變——mary.cgrups 維持 base seed（不含 權限群組M1）
            const cgrups = await readDbUserCgrups(page, 'mary@example.com')
            assert.ok(cgrups && typeof cgrups === 'object' && !cgrups['權限群組M1'], 'E2E-009 未按 Save, mary.cgrups 不應含 權限群組M1')
        },
    },
    {
        //E2E-010：同名使用者各自勾選不互相影響（2026-09-17 Codex 審計 F-01 查出：舊版以 name 找列, 勾第二位 mary 會改到第一位）。
        //對應 spec 流程_使用者群組關聯.md E2E-010。
        //前置（全域技能 §4.5 setup 例外, 非本案操作）：以 updateUsers 寫入一位與 mary 同名之使用者；每案前 resetDb 還原 base seed 即移除。
        //6 步真實路徑：①群組頁 ②點 M1 列 belongUsers 開對話框（兩列 mary）③點第二位 mary 之 enable ④該列插入醒目 M1、第一位不變
        //  ⑤點 Save ⑥成功 modal；DB 只有第二位加入 M1
        name: 'E2E-010-same-name-users',
        run: async (page) => {
            await page.waitForFunction(() => (window.$vo.$store.state.users || []).length > 0, null, { timeout: 30000 })
            const nAll = await page.evaluate(async () => {
                const us = JSON.parse(JSON.stringify(window.$vo.$store.state.users)).sort((a, b) => (a.order || 0) - (b.order || 0))
                const mary = us.find((u) => u.email === 'mary@example.com')
                const dup = { ...mary, id: 'id-for-mary-dup', email: 'mary.dup@example.com', order: Math.max(...us.map((u) => u.order || 0)) + 1 }
                await window.$vo.$fapi.updateUsers([...us, dup])
                return us.length + 1
            })
            await page.waitForFunction((n) => (window.$vo.$store.state.users || []).length === n, nAll, { timeout: 15000 })
            await page.waitForTimeout(800)

            await gotoGrups(page)
            await openBelongDialog(page, 0)
            const s1 = await captureStableWithBox(page, SEL_MODAL) //E2E-010-1-dialog-open：對話框初始態（兩列同名 mary），框住整個對話框
            const maryRows = await page.evaluate((sd) => [...document.querySelectorAll(`${sd} .ag-row[row-index]`)]
                .filter((r) => ((r.querySelector('.ag-cell[col-id="name"]') || {}).textContent || '').trim() === 'mary')
                .map((r) => r.getAttribute('row-index')), SEL_MODAL)
            assert.equal(maryRows.length, 2, `對話框應有兩列名稱為 mary（實得 ${JSON.stringify(maryRows)}）`)
            const [first, second] = maryRows.map(Number)

            const s2 = await captureStableWithBox(page, dialogEnableCheckboxSel(second)) //E2E-010-2-click-enable：點擊前框住第二位 mary 列之 enable checkbox
            await toggleDialogEnable(page, second)
            const s3 = await captureStableWithBox(page, dialogRowBoxSel(second)) //E2E-010-3-enable-checked：勾選後框住該列（checkbox 已勾、醒目 M1 插入為第 1 顆）
            //spec E2E-010 驗證1：只有第二位被勾、標籤列多出本群組；第一位不變
            const chk = await page.evaluate(([sd, a, b]) => {
                const c = (i) => !!document.querySelector(`${sd} .ag-row[row-index="${i}"] .ag-cell[col-id="enable"] input[type="checkbox"]`).checked
                return { first: c(a), second: c(b) }
            }, [SEL_MODAL, first, second])
            assert.deepEqual(chk, { first: false, second: true }, `只有第二位 mary 應被勾選（實得 ${JSON.stringify(chk)}）`)
            const rSecond = await readDialogChipsRow(page, second, 'grupsNames')
            const rFirst = await readDialogChipsRow(page, first, 'grupsNames')
            assert.deepEqual(rSecond.titles, ['權限群組M1', '權限群組M2'], `第二位 mary 標籤列應為本群組＋M2（實得 ${JSON.stringify(rSecond.titles)}）`)
            assert.deepEqual(rFirst.titles, ['權限群組M2'], `第一位 mary 標籤列應維持只有 M2（實得 ${JSON.stringify(rFirst.titles)}）`)

            const s4 = await captureStableWithBox(page, dlgBtn(page, DLG_MDI.save)) //E2E-010-4-click-save：點擊前框住對話框 Save 鈕
            await saveBelongAndWaitModal(page)
            const s5 = await captureStableWithBox(page, SEL_MODAL) //E2E-010-5-belong-saved：存檔成功 modal
            await assertModalMsg(page, 'userSaveUsersSuccess')
            await dismissResultModal(page)
            return [
                { name: 'E2E-010-1-dialog-open', buf: s1 },
                { name: 'E2E-010-2-click-enable', buf: s2 },
                { name: 'E2E-010-3-enable-checked', buf: s3 },
                { name: 'E2E-010-4-click-save', buf: s4 },
                { name: 'E2E-010-5-belong-saved', buf: s5 },
            ]
        },
        semantic: async (page) => {
            //spec E2E-010 驗證1：DB 只有第二位（mary.dup）加入 M1, 第一位 mary 不含 M1
            const dup = await readDbUserCgrups(page, 'mary.dup@example.com')
            const orig = await readDbUserCgrups(page, 'mary@example.com')
            assert.ok(dup && typeof dup === 'object' && dup['權限群組M1'] && dup['權限群組M1'].isActive === 'y', `mary.dup.cgrups 應含 權限群組M1（實得 ${JSON.stringify(dup)}）`)
            assert.ok(orig && typeof orig === 'object' && !orig['權限群組M1'], `mary.cgrups 不應含 權限群組M1（實得 ${JSON.stringify(orig)}）`)
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
    process.env.E2E_STRICT_CAPTURE = '1' //regen 端：captureStable 未 settle 即 throw，拒絕寫入未穩定畫面
    //擷取 pristine base seed（DB 剛 fresh seed）——用臨時 browser
    { const b = await launchBrowser(); const pp = await openApp(b); BASE_SEED = await captureBaseSeed(pp, 'users'); await b.close() }
    for (const lang of LANGS) {
        if (onlyLangs && !nameMatch(onlyLangs, lang)) continue //§6.3 手術式：跳過未指定語系
        for (const c of CASES) {
            if (onlyNames && !nameMatch(onlyNames, c.name)) continue //§6.3 手術式：截圖前 gate，跳過未指定 case
            //per-case fresh browser（消除 GPU/font/CSS cache 跨 case 累積造成的 cold/warm 差異；對齊 sso）
            const browser = await launchBrowser()
            await resetDb(browser, 'users', BASE_SEED) //throwaway page 還原 DB 為 base seed，關閉後再開 case page
            const page = await openApp(browser)
            await setLang(page, lang) //eng 也切（symmetric）：補等同 cht setLang 的 re-render+settle 時間
            //run 回傳「單張 Buffer」或「多階段 [{name, buf}]」；統一正規化為陣列後逐張寫入
            let shots = await c.run(page, lang)
            if (Buffer.isBuffer(shots)) shots = [{ name: c.name, buf: shots }]
            for (const s of shots) {
                fs.writeFileSync(picPath(lang, s.name), s.buf)
                console.log('wrote', picPath(lang, s.name), s.buf.length, 'bytes')
            }
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
                if (!BASE_SEED) { const b = await launchBrowser(); const pp = await openApp(b); BASE_SEED = await captureBaseSeed(pp, 'users'); await b.close() }
            })
            //per-case fresh browser：每 case 全新 browser 進程（對齊 sso），消 cross-case GPU/font cache 累積
            beforeEach(async function() {
                this.timeout(90000)
                browser = await launchBrowser()
                await resetDb(browser, 'users', BASE_SEED) //throwaway page 還原 DB 為 base seed
            })
            afterEach(async function() { if (browser) { await browser.close(); browser = null } })
            for (const c of CASES) {
                it(c.name, async () => {
                    const page = await openApp(browser)
                    await setLang(page, lang)
                    let shots = await c.run(page, lang)
                    if (c.semantic) await c.semantic(page)
                    //run 回傳「單張 Buffer」或「多階段 [{name, buf}]」；統一正規化為陣列後逐張比對
                    if (Buffer.isBuffer(shots)) shots = [{ name: c.name, buf: shots }]
                    for (const s of shots) {
                        assertBaselineMatch(s.buf, picPath(lang, s.name), `rela-user-grup-${lang}-${s.name}`)
                    }
                })
            }
        })
    }
}
