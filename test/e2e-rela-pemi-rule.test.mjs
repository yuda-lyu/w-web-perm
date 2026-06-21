//權限規則關聯 e2e（B 類關聯編輯，單一編輯器 VeCrules）。對應 spec/流程_權限規則關聯.md。
//鏡像 test/e2e-rela-grup-pemi.test.mjs（B 類第 2 flow）之 resolve 型部分，差異：
//  - 本 flow 僅單一編輯器 VeCrules（無第二入口）；對話框列＝store 全部 targets（id + enable 兩欄，無 mode 欄）。
//  - crules JSON5 值為純字串 'y'/'n'（非 {mode,isActive} 物件），故無 mode 下拉互動。
//  - VeCrules.clickSave 為 **resolve 型**：core() 序列化各 target enable 為 {targetId:'y'|'n'} JSON 字串 → pm.resolve（VeCrules.vue:723,734），
//    **不打 API、無結果 modal**；DB 寫入延到權限頁工具列存檔（savePemis → $fapi.updatePemis → showCheckYes pemiSavePemisSuccess，
//    LayoutContentPemis.vue:1211,1228）。
//雙模式：
//  - 產 baseline：node test/e2e-rela-pemi-rule.test.mjs --baseline （寫 test/pics/rela-pemi-rule/）
//  - 驗證（mocha）：npx mocha test/e2e-rela-pemi-rule.test.mjs --reporter list （buf.equals 比對）
//act 走 user-facing input；assert = 語意斷言 + pixel baseline（§6.2 / §6.3）。
//
//base seed（g.initialTestData → src/schema/tables/*）：
//  pemis(order0-3): 權限P1(crules: 專案A/頁A/區塊A=y, 專案A/頁B/區塊A=n, 專案A/頁C=n),
//                   權限P2, 權限P3, 權限P4
//  targets(order0-22): 路徑式 id（如 專案A/頁A/區塊A），row0=專案A/頁A/區塊A, row1=專案A/頁A/區塊A/執行按鈕,
//                      row2=專案A/頁A/區塊A/分析按鈕, row3=專案A/頁B/區塊A ...（依 order）
import fs from 'fs'
import assert from 'assert'
import JSON5 from 'json5'
import { startServersOnce, cleanup, launchBrowser, openApp, captureStable, captureStableWithBox, rowBoxSel, dialogRowBoxSel, waitUntilExist, getResolvedActiveTargets, assertBaselineMatch, dismissResultModal } from './e2e-setup.mjs'

const PICS_DIR = './test/pics/rela-pemi-rule'
const LANGS = ['eng', 'cht']
const isBaseline = process.argv.includes('--baseline')

function picPath(lang, name) { return `${PICS_DIR}/rela-pemi-rule-${lang}-${name}.png` }

//紅框標注目標（captureStableWithBox）：本 case 主要觀看區
const SEL_GRID = '.ag-root-wrapper'                                            //清單 / grid 內容區
const SEL_MODAL = 'div[style*="overscroll-behavior"] div[tabindex="0"] > div'  //WDialog 結果 modal / Ve 對話框

//設定語系（test setup 層，非 act-under-test；對齊雙語覆蓋維度）。沿用 e2e-grups / e2e-rela-* 之對稱 buffer 慣例：
//cht 走語系切換；eng 為預設不切，但補等同的 settle buffer，治 eng-vs-cht 收斂不對稱（sso e2e-adduser 殷鑑）。
async function setLang(page, lang) {
    if (lang !== 'eng') {
        await page.evaluate((l) => { window.$vo.$ui.setLang(l, 'e2e-setLang') }, lang)
    }
    await page.waitForTimeout(600)
}

//導航至權限頁（user-facing：點左側「權限」導覽），等 ag-grid 載入。
async function gotoPemis(page) {
    const pemisLabel = await page.evaluate(() => window.$vo.$t('mmPemis'))
    await page.getByText(pemisLabel, { exact: true }).first().click()
    await waitUntilExist(page, '權限 ag-grid 列', () => document.querySelectorAll('.ag-row').length > 0, { timeout: 20000 })
    await page.waitForTimeout(500)
}

//切換清單頁編輯模式（點 WSwitch，以「Edit mode/編輯模式」標籤觸發其 click 區）。預設編輯模式 ON，故唯讀案例需切一次關閉。
async function toggleEditMode(page) {
    const label = await page.evaluate(() => window.$vo.$t('modeEdit'))
    await page.getByText(label, { exact: true }).first().click()
    await page.waitForTimeout(2000) //toggle 觸發 grid 欄位 reflow（增/減拖曳·勾選欄），等其完全 settle
}

//—— 對話框 / 工具列 icon 按鈕定位（WButtonCircle 渲染為 div[role=button] 內含 <svg><path d=...>，以 mdi path 定位）——
//WDialog template（w-component-vue WDialog.vue）：Save 鈕=mdiCheckCircle（僅 isEditable && isModified 才渲染）、
//Close 鈕=mdiClose（恆渲染）。權限頁工具列存檔鈕=mdiCloudUploadOutline（僅 isEditable && isModified 才渲染）。
const DLG_MDI = {
    save: 'M12 2C6.5 2 2 6.5 2 12S6.5 22 12 22 22 17.5 22 12 17.5 2 12 2M10 17L5 12L6.41 10.59L10 14.17L17.59 6.58L19 8L10 17Z',
    close: 'M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z',
}
const TOOLBAR_MDI = {
    upload: 'M6.5 20Q4.22 20 2.61 18.43 1 16.85 1 14.58 1 12.63 2.17 11.1 3.35 9.57 5.25 9.15 5.88 6.85 7.75 5.43 9.63 4 12 4 14.93 4 16.96 6.04 19 8.07 19 11 20.73 11.2 21.86 12.5 23 13.78 23 15.5 23 17.38 21.69 18.69 20.38 20 18.5 20H13Q12.18 20 11.59 19.41 11 18.83 11 18V12.85L9.4 14.4L8 13L12 9L16 13L14.6 14.4L13 12.85V18H18.5Q19.55 18 20.27 17.27 21 16.55 21 15.5 21 14.45 20.27 13.73 19.55 13 18.5 13H17V11Q17 8.93 15.54 7.46 14.08 6 12 6 9.93 6 8.46 7.46 7 8.93 7 11H6.5Q5.05 11 4.03 12.03 3 13.05 3 14.5 3 15.95 4.03 17 5.05 18 6.5 18H9V20M12 13Z',
}
function pathBtn(page, path) {
    return page.locator(`div[role="button"]:has(svg path[d="${path}"])`)
}

//—— 對話框內 grid 互動原語（列以 row-index 定位；enable=checkbox；本對話框無 mode 欄）——
//等對話框內 ag-grid 列就緒。
async function waitDialogGrid(page) {
    await waitUntilExist(page, '對話框內 ag-grid 列', () => document.querySelectorAll('.ag-row').length > 0, { timeout: 15000 })
    await page.waitForTimeout(800)
}
//翻轉對話框內某列 enable checkbox（觸發 toggleItemEnableById → isModified=true → Save 鈕現身）。
//locator 限定 .ag-cell[col-id="enable"] 內 checkbox，避開頁面主表的其他 checkbox。
async function toggleDialogEnable(page, rowIndex) {
    await page.locator(`.ag-row[row-index="${rowIndex}"] .ag-cell[col-id="enable"] input[type="checkbox"]`).first().click()
    await page.waitForTimeout(800) //refresh settle
}
//讀對話框內某列 enable checkbox 是否勾選。
async function readDialogEnableChecked(page, rowIndex) {
    return await page.evaluate((r) => {
        const el = document.querySelector(`.ag-row[row-index="${r}"] .ag-cell[col-id="enable"] input[type="checkbox"]`)
        return el ? !!el.checked : null
    }, rowIndex)
}
//點對話框 Save 鈕（需 isModified=true 才渲染；呼叫前須已 toggle 過）。
async function clickDialogSave(page) {
    await pathBtn(page, DLG_MDI.save).first().click()
}
//點對話框 Close 鈕（恆渲染）。
async function clickDialogClose(page) {
    await pathBtn(page, DLG_MDI.close).first().click()
}

//—— VeCrules 開啟 + 權限頁工具列存檔 helpers ——
//開啟權限頁某列的 crules 對話框（VeCrules，可編輯版）。
async function openCrulesDialog(page, rowIndex) {
    await page.locator(`.ag-row[row-index="${rowIndex}"] .ag-cell[col-id="crules"] button`).first().click()
    await waitUntilExist(page, 'VeCrules 對話框標題', () => {
        const vo = window.$vo
        return (document.body.innerText || '').includes(vo.$t('pemiEditCrules'))
    }, { timeout: 15000 })
    await waitDialogGrid(page)
}
//等對話框關閉（Save resolve / Close reject 後 bShow=false）。以標題消失偵測。
async function waitDialogClosed(page, titleKey) {
    await waitUntilExist(page, '對話框關閉', (k) => {
        const vo = window.$vo
        return !(document.body.innerText || '').includes(vo.$t(k))
    }, { timeout: 15000, arg: titleKey })
    await page.waitForTimeout(800)
}
//讀權限頁某列 crules 欄 button 顯示文字（getCrulesText 結果，反映回填後的啟用數）。
async function readPemiRowCrulesText(page, rowIndex) {
    return await page.evaluate((r) => {
        const btn = document.querySelector(`.ag-row[row-index="${r}"] .ag-cell[col-id="crules"] button`)
        return btn ? (btn.textContent || '').trim() : ''
    }, rowIndex)
}
//點權限頁工具列存檔鈕 → 等 CheckYes 結果 modal 出現（systemMessage 標題）→ 停在 modal 顯示態供截圖。
//VeCrules resolve 回填權限列後，DB 寫入延到此處：savePemis → $fapi.updatePemis → showCheckYes（成功 pemiSavePemisSuccess）。
async function savePemisAndWaitModal(page) {
    await pathBtn(page, TOOLBAR_MDI.upload).first().click()
    await waitUntilExist(page, 'CheckYes 結果 modal（systemMessage 標題）', () => {
        const vo = window.$vo
        return (document.body.innerText || '').includes(vo.$t('systemMessage'))
    }, { timeout: 20000 })
    await page.waitForTimeout(800) //modal 進場 settle
}
//語意斷言：結果 modal 顯示指定 i18n 訊息（lang-aware）。
async function assertModalMsg(page, i18nKey) {
    const msg = await page.evaluate((k) => window.$vo.$t(k), i18nKey)
    const txt = await page.evaluate(() => document.body.innerText)
    assert.ok(txt.includes(msg), `結果 modal 應顯示 ${i18nKey}（${msg}）`)
}

//—— DB 衛生 helpers（每 case 前還原 pemis 表為 base seed）——
//E2E-004 會寫 DB（updatePemis）；其餘 case 雖不寫 DB 但為一致性與隔離仍每 case 還原。
let BASE_SEED = null
async function captureBaseSeed(page) {
    await page.waitForFunction(() => (window.$vo.$store.state.pemis || []).length > 0, null, { timeout: 30000 })
    await page.waitForTimeout(1500) //確保整批同步完成
    return await page.evaluate(() => {
        const ps = (window.$vo.$store.state.pemis || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0))
        return JSON.parse(JSON.stringify(ps))
    })
}
//在獨立 throwaway page 還原 pemis（$fapi.updatePemis 帶整批 base seed → 後端 diff 對齊）。關閉後再開 case page。
async function resetDb(browser, seed) {
    if (!seed || seed.length === 0) throw new Error('resetDb: BASE_SEED 為空，拒絕還原（避免清空 DB）')
    const p = await openApp(browser)
    await p.evaluate((s) => window.$vo.$fapi.updatePemis(s), seed)
    await p.waitForFunction((n) => (window.$vo.$store.state.pemis || []).length === n, seed.length, { timeout: 15000 })
    await p.waitForTimeout(800)
    await p.context().close()
}
//讀 DB（store 同步）某 name pemi 的 crules（原始 JSON5 字串），於 node 端以 JSON5 解析後回傳物件，供斷言。
//（JSON5 為 node 端 import，不可於 page.evaluate browser context 使用，故只取原字串出來再 node 端解析。）
async function readDbPemiCrules(page, pemiName) {
    const raw = await page.evaluate((nm) => {
        const p = (window.$vo.$store.state.pemis || []).find((x) => x.name === nm)
        return p ? (p.crules || '') : null
    }, pemiName)
    if (raw === null) return null
    try { return JSON5.parse(raw) }
    catch (e) { return raw } //fallback 回原字串
}

//—— base seed 對 權限P1 之 crules 規則（用於選定要切換的 target 列）——
//權限P1 crules: { "專案A/頁A/區塊A": 'y', "專案A/頁B/區塊A": 'n', "專案A/頁C": 'n' }
//targets（依 order）：row0=專案A/頁A/區塊A('y'), row3=專案A/頁B/區塊A('n')
const TARGET_Y_FOR_P1 = '專案A/頁A/區塊A'   //P1 原為 'y'（dialog row 0）→ 供 y→n 反向切換
const TARGET_N_FOR_P1 = '專案A/頁B/區塊A'   //P1 原為 'n'（dialog row 3）→ 供 n→y 啟用切換
const TARGET_Y_ROW = 0
const TARGET_N_ROW = 3

//case 定義：run(page,lang) 走流程並回傳截圖 buffer；mocha 模式再加語意斷言
const CASES = [

    //—————————————— VeCrules：開啟態（golden 起點）——————————————

    {
        //E2E-001：自權限列 crules 欄按鈕開啟 VeCrules 對話框（golden 起點）。
        //僅驗開啟態：標題 pemiEditCrules + 逐 target 列（id + enable checkbox）+ 既有 'y' 之 target 列勾選。
        name: 'E2E-001-open-dialog',
        run: async (page) => {
            await gotoPemis(page)
            const s1 = await captureStableWithBox(page, rowBoxSel(0)) //來源列：導航後、開窗前
            await openCrulesDialog(page, 0) //row 0 = 權限P1
            const s2 = await captureStableWithBox(page, SEL_MODAL) //對話框初始態：開窗後
            return [
                { name: 'E2E-001-1-source-row', buf: s1 },
                { name: 'E2E-001-2-dialog-open', buf: s2 },
            ]
        },
        semantic: async (page) => {
            const label = await page.evaluate(() => window.$vo.$t('pemiEditCrules'))
            const txt = await page.evaluate(() => document.body.innerText)
            assert.ok(txt.includes(label), `VeCrules 對話框標題應顯示（${label}）`)
            //對話框以全部 targets 為列，故應見起首 / 末尾 target 路徑式 id
            assert.ok(txt.includes('專案A/頁A/區塊A'), '對話框應逐 target 列出 base seed targets（首列）')
            assert.ok(txt.includes('專案B/頁B/區塊B/轉跳主站按鈕'), '對話框應逐 target 列出 base seed targets（末列）')
            //P1 原為 'y' 之 target（dialog row 0）checkbox 應勾選；原為 'n' 之 target（row 3）應未勾選
            const yChecked = await readDialogEnableChecked(page, TARGET_Y_ROW)
            const nChecked = await readDialogEnableChecked(page, TARGET_N_ROW)
            assert.equal(yChecked, true, `P1 原 'y' 之 target（${TARGET_Y_FOR_P1}）checkbox 應勾選`)
            assert.equal(nChecked, false, `P1 原 'n' 之 target（${TARGET_N_FOR_P1}）checkbox 應未勾選`)
        },
    },

    //—————————————— VeCrules：enable 雙向切換（n→y / y→n，皆不點儲存）——————————————

    {
        //E2E-002：於對話框點某列原為停用（'n'）的 target enable checkbox → 轉啟用（'y'）→ isModified 轉真、Save 鈕現身、該列勾選。
        //不點儲存、不關閉前截圖；屬「將管控對象設為啟用」就地切換案例。
        name: 'E2E-002-check-yes',
        run: async (page) => {
            await gotoPemis(page)
            const s1 = await captureStableWithBox(page, rowBoxSel(0)) //來源列：導航後、開窗前
            await openCrulesDialog(page, 0) //row 0 = 權限P1
            const s2 = await captureStableWithBox(page, SEL_MODAL) //對話框初始態：開窗後、toggle 前
            await toggleDialogEnable(page, TARGET_N_ROW) //專案A/頁B/區塊A：n→y → isModified=true → Save 鈕現身
            const s3 = await captureStableWithBox(page, dialogRowBoxSel(TARGET_N_ROW)) //操作中：toggle 後該列（row 3）
            return [
                { name: 'E2E-002-1-source-row', buf: s1 },
                { name: 'E2E-002-2-dialog-open', buf: s2 },
                { name: 'E2E-002-3-row-toggled', buf: s3 },
            ]
        },
        semantic: async (page) => {
            //該 target 列 checkbox 由未勾選轉為勾選
            const checked = await readDialogEnableChecked(page, TARGET_N_ROW)
            assert.equal(checked, true, `${TARGET_N_FOR_P1} 切換後 checkbox 應為勾選`)
            //出現對話框 Save 鈕（isModified 為真）
            const saveCnt = await pathBtn(page, DLG_MDI.save).count()
            assert.ok(saveCnt > 0, 'isModified 轉真後應出現對話框 Save 鈕')
        },
    },
    {
        //E2E-003：於對話框點某列原為啟用（'y'）的 target enable checkbox → 切回停用（'n'）→ isModified 轉真、該列未勾選。
        //與 E2E-002 共同覆蓋 enable 雙向切換；不點儲存、不關閉前截圖。
        name: 'E2E-003-check-no',
        run: async (page) => {
            await gotoPemis(page)
            const s1 = await captureStableWithBox(page, rowBoxSel(0)) //來源列：導航後、開窗前
            await openCrulesDialog(page, 0) //row 0 = 權限P1
            const s2 = await captureStableWithBox(page, SEL_MODAL) //對話框初始態：開窗後、toggle 前
            await toggleDialogEnable(page, TARGET_Y_ROW) //專案A/頁A/區塊A：y→n → isModified=true
            const s3 = await captureStableWithBox(page, dialogRowBoxSel(TARGET_Y_ROW)) //操作中：toggle 後該列（row 0）
            return [
                { name: 'E2E-003-1-source-row', buf: s1 },
                { name: 'E2E-003-2-dialog-open', buf: s2 },
                { name: 'E2E-003-3-row-toggled', buf: s3 },
            ]
        },
        semantic: async (page) => {
            //該 target 列 checkbox 由勾選轉為未勾選
            const checked = await readDialogEnableChecked(page, TARGET_Y_ROW)
            assert.equal(checked, false, `${TARGET_Y_FOR_P1} 切換後 checkbox 應為未勾選`)
            //出現對話框 Save 鈕（isModified 為真）
            const saveCnt = await pathBtn(page, DLG_MDI.save).count()
            assert.ok(saveCnt > 0, 'isModified 轉真後應出現對話框 Save 鈕')
        },
    },

    //—————————————— VeCrules：儲存回填 → 權限頁工具列存檔（resolve 型，DB 寫入延到此）——————————————

    {
        //E2E-004：於對話框切換某 target enable 後點對話框儲存（resolve crules 字串回填權限列）
        //→ 再點權限頁工具列存檔 → updatePemis 寫 DB + 成功 modal。
        //斷言（有 DB 寫入）：結果 modal 顯示 pemiSavePemisSuccess；DB P1.crules 含 專案A/頁B/區塊A=y（新啟用）。
        //本案啟用 1 個原為 'n' 的 target，P1 啟用數由 1→2，crules 欄摘要 N 隨之變動。
        //多階段：E2E-004-1-dialog-toggled（toggle enable 後、Save 前之對話框態）→ E2E-004-save-back（存檔成功 modal）。
        name: 'E2E-004-save-back',
        run: async (page) => {
            await gotoPemis(page)
            const s1 = await captureStableWithBox(page, rowBoxSel(0)) //來源列：導航後、開窗前
            await openCrulesDialog(page, 0) //row 0 = 權限P1
            const s2 = await captureStableWithBox(page, SEL_MODAL) //對話框初始態：開窗後、toggle 前
            await toggleDialogEnable(page, TARGET_N_ROW) //專案A/頁B/區塊A：n→y（啟用數 1→2）
            const s3 = await captureStableWithBox(page, dialogRowBoxSel(TARGET_N_ROW)) //操作中：toggle 後該列（row 3）
            await clickDialogSave(page) //resolve crules 字串回填權限列、權限頁 isModified=true，對話框關閉
            await waitDialogClosed(page, 'pemiEditCrules')
            await savePemisAndWaitModal(page) //權限頁工具列存檔 → updatePemis 寫 DB → 成功 modal
            const s4 = await captureStableWithBox(page, SEL_MODAL) //最終階段：權限頁存檔成功結果 modal
            await assertModalMsg(page, 'pemiSavePemisSuccess') //關 modal 前斷言成功訊息（dismiss 後文字消失，故移此處）
            await dismissResultModal(page)
            const s5 = await captureStableWithBox(page, rowBoxSel(0)) //data-changed：關 modal 後、權限頁該權限列摘要已反映規則變更
            return [
                { name: 'E2E-004-1-source-row', buf: s1 },
                { name: 'E2E-004-2-dialog-open', buf: s2 },
                { name: 'E2E-004-3-row-toggled', buf: s3 },
                { name: 'E2E-004-4-save-back', buf: s4 },
                { name: 'E2E-004-5-data-changed', buf: s5 },
            ]
        },
        semantic: async (page) => {
            //（成功 modal 文字斷言已移至 run() dismiss 前）
            //DB P1.crules 應含 專案A/頁B/區塊A=y（新啟用），且原 'y' 之 專案A/頁A/區塊A 仍 y
            const crules = await readDbPemiCrules(page, '權限P1')
            assert.ok(crules && typeof crules === 'object', 'P1.crules 應為物件')
            assert.equal(crules[TARGET_N_FOR_P1], 'y', `P1 對 ${TARGET_N_FOR_P1} 應為新啟用 y`)
            assert.equal(crules[TARGET_Y_FOR_P1], 'y', `P1 對 ${TARGET_Y_FOR_P1} 原 y 應維持`)
            //【端到端核心不變式：權限變更 → 解析後權限樹】P1 新啟用 專案A/頁B/區塊A；peter 屬 M1、M1 用 P1，
            //故 peter 樹應「新增」此 target（baseline 4 → 5，P1∪P2 聯集）。驗 getPermUserInfor 回傳的 resolved 權限樹。
            const tree = await getResolvedActiveTargets(page, 'id-for-peter')
            assert.deepEqual(tree, ['專案A/頁A/區塊A', '專案A/頁B/區塊A', '專案A/頁C', '專案B/頁A/區塊A', '專案B/頁A/區塊B'],
                `peter 解析後權限樹應因 P1 新啟用 專案A/頁B/區塊A 而新增該 target（baseline 4→5；實得 ${JSON.stringify(tree)}）`)
        },
    },

    //—————————————— VeCrules：取消（Close 不回填，與 E2E-004 共覆蓋儲存 / 取消分支）——————————————

    {
        //E2E-005：於對話框切換某 target enable 後點關閉（取消）→ reject('close window')、權限頁 .catch 吞掉、不回填。
        //斷言（取消路徑）：對話框關閉；權限列 crules 欄摘要文字與開啟前相同（未回填）。與 E2E-004 共覆蓋儲存 / 取消分支。
        name: 'E2E-005-cancel',
        run: async (page) => {
            await gotoPemis(page)
            //先記錄開啟前 權限P1 crules 欄摘要文字（原值）
            const before = await readPemiRowCrulesText(page, 0)
            const s1 = await captureStableWithBox(page, rowBoxSel(0)) //來源列：導航後、開窗前
            await openCrulesDialog(page, 0) //row 0 = 權限P1
            const s2 = await captureStableWithBox(page, SEL_MODAL) //對話框初始態：開窗後、toggle 前
            await toggleDialogEnable(page, TARGET_N_ROW) //製造變更（n→y）
            const s3 = await captureStableWithBox(page, dialogRowBoxSel(TARGET_N_ROW)) //操作中：toggle 後該列（row 3）、Close 前
            await clickDialogClose(page) //Close → reject，權限頁 .catch 不回填
            await waitDialogClosed(page, 'pemiEditCrules')
            //把原值掛到 page 供 semantic 取用
            await page.evaluate((b) => { window.__crulesBefore = b }, before)
            const s4 = await captureStableWithBox(page, rowBoxSel(0)) //結果：對話框已關閉，該權限列摘要維持原值未變（證明取消放棄變更）
            return [
                { name: 'E2E-005-1-source-row', buf: s1 },
                { name: 'E2E-005-2-dialog-open', buf: s2 },
                { name: 'E2E-005-3-row-toggled', buf: s3 },
                { name: 'E2E-005-4-cancelled-grid', buf: s4 },
            ]
        },
        semantic: async (page) => {
            const after = await readPemiRowCrulesText(page, 0)
            const before = await page.evaluate(() => window.__crulesBefore || '')
            assert.equal(after, before, `Close 後 權限P1 crules 摘要文字應維持原值（before「${before}」/ after「${after}」）`)
            //對話框已關閉
            const open = await page.evaluate(() => (document.body.innerText || '').includes(window.$vo.$t('pemiEditCrules')))
            assert.ok(!open, 'VeCrules 對話框應已關閉')
        },
    },
]

//手術式重產（§6.3）：--names a,b,c 只產指定 case；--langs eng,cht 只產指定語系。截圖「前」就 gate（省截圖成本）。
function argList(flag) {
    const i = process.argv.indexOf(flag)
    if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1].split(',').map((s) => s.trim()).filter(Boolean)
    return null
}
//前綴或完整匹配：傳 'E2E-002' 即可匹配 'E2E-002-check-yes'（避免 §6.3 殷鑑「--names 只認字面」陷阱）
function nameMatch(list, caseName) { return list.some((nm) => caseName === nm || caseName.startsWith(nm)) }

async function generateBaseline() {
    console.log('=== 產製 rela-pemi-rule baseline 開始 ===')
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
    console.log('=== 產製 rela-pemi-rule baseline 完成 ===')
}

if (isBaseline) {
    generateBaseline().catch((err) => { console.log('baseline 例外', err); cleanup(); process.exit(1) })
}
else {
    for (const lang of LANGS) {
        describe(`e2e-rela-pemi-rule (${lang})`, function() {
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
                    let shots = await c.run(page, lang)
                    if (c.semantic) await c.semantic(page)
                    //run 回傳「單張 Buffer」或「多階段 [{name, buf}]」；統一正規化為陣列後逐張比對
                    if (Buffer.isBuffer(shots)) shots = [{ name: c.name, buf: shots }]
                    for (const s of shots) {
                        assertBaselineMatch(s.buf, picPath(lang, s.name), `rela-pemi-rule-${lang}-${s.name}`)
                    }
                })
            }
        })
    }
}
