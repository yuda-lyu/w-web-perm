//群組權限關聯 e2e（B 類關聯編輯）。對應 spec/流程_群組權限關聯.md。
//鏡像 test/e2e-rela-user-grup.test.mjs（B 類關聯 canonical）骨架，差異在於 user↔grup 換成 grup↔pemi、
//且 VeCpemis（群組頁入口）Save 不打 API 只 resolve 回填、DB 寫入延到「群組頁工具列存檔」一步。
//雙模式：
//  - 產 baseline：node test/e2e-rela-grup-pemi.test.mjs --baseline （寫 test/pics/rela-grup-pemi/）
//  - 驗證（mocha）：npx mocha test/e2e-rela-grup-pemi.test.mjs --reporter list （pixelmatch 反鋸齒感知 + maxDiffPixels 容差比對，非 byte-exact）
//act 走 user-facing input；assert = 語意斷言 + pixel baseline（§6.2 / §6.3）。
//
//兩入口（spec 重要流程）：
//  入口 A（E2E-001~002）VeCpemis（群組視角）：自群組頁某列 cpemis 按鈕開啟，列＝全部 pemis。
//    對話框 Save 僅 resolve 一個 cpemis 字串「回填前端群組列」、**不打 API、無結果 modal**；DB 寫入延到
//    群組頁工具列存檔（saveGrups → updateGrups → showCheckYes 結果 modal grupSaveGrupsSuccess）。
//    E2E-002 斷言＝結果 modal ＋ DB 該群組 cpemis（grups.cpemis）含新權限鍵。
//  入口 B（E2E-003~004）VePemiBlngGrups（權限視角）：自權限頁某列 belongGrups 按鈕開啟，列＝全部 grups。
//    對話框 Save 於對話框內**自行** $fapi.updateGrups 即時寫 DB ＋ showCheckYes 結果 modal（grupSaveGrupsSuccess）；
//    斷言＝DB 被勾選群組 grups.cpemis（$store.state.grups）含本權限鍵 ＋ 結果 modal。
//  唯讀（E2E-005）：清單頁未開編輯模式（isEditable=false）即開對話框，標題為檢視版、無 Save 鈕、下拉 / checkbox 皆 disabled。
//
//base seed（g.initialTestData → src/schema/tables/*）：
//  grups(order0-3): 權限群組M1(cpemis P1=OR/y,P2=OR/y), M2(P2=OR/y,P3=OR/y), M3(P2=OR/y,P3=AND/y), M4(P3=OR/y,P4=OR/y)
//  pemis(order0-3): 權限P1, 權限P2, 權限P3, 權限P4
import fs from 'fs'
import assert from 'assert'
import JSON5 from 'json5'
import { startServersOnce, cleanup, launchBrowser, openApp, captureStable, captureStableWithBox, rowBoxSel, dialogRowBoxSel, waitUntilExist, getResolvedActiveTargets, assertBaselineMatch, dismissResultModal } from './e2e-setup.mjs'

const PICS_DIR = './test/pics/rela-grup-pemi'
const LANGS = ['eng', 'cht']
const isBaseline = process.argv.includes('--baseline')

function picPath(lang, name) { return `${PICS_DIR}/rela-grup-pemi-${lang}-${name}.png` }

//紅框標注目標（captureStableWithBox）：本 case 主要觀看區
const SEL_GRID = '.ag-root-wrapper'                                            //清單 / grid 內容區
const SEL_MODAL = 'div[style*="overscroll-behavior"] div[tabindex="0"] > div'  //WDialog 結果 modal / Ve 對話框

//設定語系（test setup 層，非 act-under-test；對齊雙語覆蓋維度）。沿用 e2e-grups / e2e-rela-user-grup 之對稱 buffer 慣例：
//cht 走語系切換；eng 為預設不切，但補等同的 settle buffer，治 eng-vs-cht 收斂不對稱（sso e2e-adduser 殷鑑）。
async function setLang(page, lang) {
    if (lang !== 'eng') {
        await page.evaluate((l) => { window.$vo.$ui.setLang(l, 'e2e-setLang') }, lang)
    }
    await page.waitForTimeout(600)
}

//導航至群組頁（user-facing：點左側「權限群組」導覽），等 ag-grid 載入。
async function gotoGrups(page) {
    const grupsLabel = await page.evaluate(() => window.$vo.$t('mmGrups'))
    await page.getByText(grupsLabel, { exact: true }).first().click()
    await waitUntilExist(page, '群組 ag-grid 列', () => document.querySelectorAll('.ag-row').length > 0, { timeout: 20000 })
    await page.waitForTimeout(500)
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
//Close 鈕=mdiClose（恆渲染）。群組頁工具列存檔鈕=mdiCloudUploadOutline（僅 isEditable && isModified 才渲染）。
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

//—— 對話框內 grid 互動原語（列以 row-index 定位；enable=checkbox、mode=select）——
//等對話框內 ag-grid 列就緒。
async function waitDialogGrid(page) {
    await waitUntilExist(page, '對話框內 ag-grid 列', () => document.querySelectorAll('.ag-row').length > 0, { timeout: 15000 })
    await page.waitForTimeout(800)
}
//翻轉對話框內某列 enable checkbox（觸發 toggleItemEnableByName → isModified=true → Save 鈕現身）。
//locator 限定 .ag-cell[col-id="enable"] 內 checkbox，避開頁面主表的 isActive checkbox。
async function toggleDialogEnable(page, rowIndex) {
    await page.locator(`.ag-row[row-index="${rowIndex}"] .ag-cell[col-id="enable"] input[type="checkbox"]`).first().click()
    await page.waitForTimeout(800) //revRows / refresh settle
}
//切對話框內某列 mode 下拉為指定值（觸發 toggleItemModeByName → isModified=true）。
async function setDialogMode(page, rowIndex, mode) {
    await page.locator(`.ag-row[row-index="${rowIndex}"] .ag-cell[col-id="mode"] select`).first().selectOption(mode)
    await page.waitForTimeout(800)
}
//點對話框 Save 鈕（需 isModified=true 才渲染；呼叫前須已 toggle 過）。
async function clickDialogSave(page) {
    await pathBtn(page, DLG_MDI.save).first().click()
}
//點對話框 Close 鈕（恆渲染）。
async function clickDialogClose(page) {
    await pathBtn(page, DLG_MDI.close).first().click()
}

//—— 入口 A（VeCpemis）開啟 + 群組頁工具列存檔 helpers ——
//開啟群組頁某列的 cpemis 對話框（VeCpemis）。
async function openCpemisDialog(page, rowIndex) {
    await page.locator(`.ag-row[row-index="${rowIndex}"] .ag-cell[col-id="cpemis"] button`).first().click()
    await waitUntilExist(page, 'VeCpemis 對話框標題', () => {
        const vo = window.$vo
        return (document.body.innerText || '').includes(vo.$t('grupEditCpemis'))
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
//點群組頁工具列存檔鈕 → 等 CheckYes 結果 modal 出現（systemMessage 標題）→ 停在 modal 顯示態供截圖。
//VeCpemis resolve 回填群組列後，DB 寫入延到此處：saveGrups → $fapi.updateGrups → showCheckYes（成功 grupSaveGrupsSuccess）。
async function saveGrupsAndWaitModal(page) {
    await pathBtn(page, TOOLBAR_MDI.upload).first().click()
    await waitUntilExist(page, 'CheckYes 結果 modal（systemMessage 標題）', () => {
        const vo = window.$vo
        return (document.body.innerText || '').includes(vo.$t('systemMessage'))
    }, { timeout: 20000 })
    await page.waitForTimeout(800) //modal 進場 settle
}

//—— 入口 B（VePemiBlngGrups）開啟 + 結果 modal helpers ——
//開啟權限頁某列的 belongGrups 對話框（VePemiBlngGrups）。
async function openBelongDialog(page, rowIndex) {
    await page.locator(`.ag-row[row-index="${rowIndex}"] .ag-cell[col-id="belongGrups"] button`).first().click()
    await waitUntilExist(page, 'VePemiBlngGrups 對話框標題', () => {
        const vo = window.$vo
        return (document.body.innerText || '').includes(vo.$t('pemiBlngEditGrups'))
    }, { timeout: 15000 })
    await waitDialogGrid(page)
}
//點對話框 Save → 等 CheckYes 結果 modal 出現（systemMessage 標題）→ 停在 modal 顯示態供截圖。
//入口 B 自帶 API：core → saveGrups → $fapi.updateGrups → showCheckYes（成功 grupSaveGrupsSuccess / 失敗 grupSaveGrupsFail）。
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

//—— DB 衛生 helpers（每 case 前還原 grups 表為 base seed）——
//兩入口最終都寫 grups.cpemis；為一致性與隔離每 case 還原 grups。
let BASE_SEED = null
async function captureBaseSeed(page) {
    await page.waitForFunction(() => (window.$vo.$store.state.grups || []).length > 0, null, { timeout: 30000 })
    await page.waitForTimeout(1500) //確保整批同步完成
    return await page.evaluate(() => {
        const gs = (window.$vo.$store.state.grups || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0))
        return JSON.parse(JSON.stringify(gs))
    })
}
//在獨立 throwaway page 還原 grups（$fapi.updateGrups 帶整批 base seed → 後端 diff 對齊）。關閉後再開 case page。
async function resetDb(browser, seed) {
    if (!seed || seed.length === 0) throw new Error('resetDb: BASE_SEED 為空，拒絕還原（避免清空 DB）')
    const p = await openApp(browser)
    await p.evaluate((s) => window.$vo.$fapi.updateGrups(s), seed)
    await p.waitForFunction((n) => (window.$vo.$store.state.grups || []).length === n, seed.length, { timeout: 15000 })
    await p.waitForTimeout(800)
    await p.context().close()
}
//讀 DB（store 同步）某 name grup 的 cpemis（原始 JSON5 字串），於 node 端以 JSON5 解析後回傳物件，供斷言。
//（JSON5 為 node 端 import，不可於 page.evaluate browser context 使用，故只取原字串出來再 node 端解析。）
async function readDbGrupCpemis(page, grupName) {
    const raw = await page.evaluate((nm) => {
        const g = (window.$vo.$store.state.grups || []).find((x) => x.name === nm)
        return g ? (g.cpemis || '') : null
    }, grupName)
    if (raw === null) return null
    try { return JSON5.parse(raw) }
    catch (e) { return raw } //fallback 回原字串
}

//case 定義：run(page,lang) 走流程並回傳截圖 buffer；mocha 模式再加語意斷言
const CASES = [

    //—————————————— 入口 A：VeCpemis（群組視角，resolve 回填、DB 寫入延到群組頁工具列存檔）——————————————

    {
        //E2E-001：自群組列 cpemis 按鈕開啟 VeCpemis 對話框（golden 起點）。僅驗開啟態：標題 + 逐權限列。
        name: 'E2E-001-cpemis-open',
        run: async (page) => {
            await gotoGrups(page)
            const s1 = await captureStableWithBox(page, rowBoxSel(0)) //階段1：來源列（點 cpemis 按鈕前）
            await openCpemisDialog(page, 0) //row 0 = 權限群組M1（cpemis: P1,P2）
            const s2 = await captureStableWithBox(page, SEL_MODAL) //階段2：VeCpemis 對話框初始開啟態
            return [
                { name: 'E2E-001-1-source-row', buf: s1 },
                { name: 'E2E-001-2-dialog-open', buf: s2 },
            ]
        },
        semantic: async (page) => {
            const label = await page.evaluate(() => window.$vo.$t('grupEditCpemis'))
            const txt = await page.evaluate(() => document.body.innerText)
            assert.ok(txt.includes(label), `VeCpemis 對話框標題應顯示（${label}）`)
            //對話框以全部 pemis 為列，故應見全部 4 個權限名
            assert.ok(txt.includes('權限P1') && txt.includes('權限P4'), '對話框應逐權限列出 base seed pemis')
        },
    },
    {
        //E2E-002：於 VeCpemis 勾選 權限P3 enable + 切其 mode→AND → 點對話框 Save（resolve 回填群組列）
        //→ 再點群組頁工具列存檔 → updateGrups 寫 DB + 成功 modal。
        //斷言（有 DB 寫入）：結果 modal 顯示 grupSaveGrupsSuccess；DB M1.cpemis 含 權限P3 鍵 = { mode:'AND', isActive:'y' }。
        //對話框內列＝全部 pemis（依 order）：row0=P1, row1=P2, row2=P3, row3=P4（M1 原無 P3）。
        //多階段：E2E-002-1-dialog-toggled（toggle+mode 後、Save 前之對話框態）→ E2E-002-cpemis-save-ok（存檔成功 modal）。
        name: 'E2E-002-cpemis-save-ok',
        run: async (page) => {
            await gotoGrups(page)
            const s1 = await captureStableWithBox(page, rowBoxSel(0)) //階段1：來源列（點 cpemis 按鈕前）
            await openCpemisDialog(page, 0) //row 0 = 權限群組M1
            const s2 = await captureStableWithBox(page, SEL_MODAL) //階段2：對話框初始態（toggleDialogEnable 前）
            await toggleDialogEnable(page, 2) //勾選 權限P3 enable（y）→ isModified=true → Save 鈕現身
            await setDialogMode(page, 2, 'AND') //將 權限P3 mode 切為 AND
            const s3 = await captureStableWithBox(page, dialogRowBoxSel(2)) //階段3：對話框內被切的 row2（權限P3），toggle+mode 後 Save 前
            await clickDialogSave(page) //resolve cpemis 字串回填群組列、isModified=true，對話框關閉
            await waitDialogClosed(page, 'grupEditCpemis')
            await saveGrupsAndWaitModal(page) //群組頁工具列存檔 → updateGrups 寫 DB → 成功 modal
            const s4 = await captureStableWithBox(page, SEL_MODAL) //階段4：群組頁存檔成功結果 modal
            await assertModalMsg(page, 'grupSaveGrupsSuccess') //關 modal 前斷言成功訊息（dismiss 後文字消失，故移此處）
            await dismissResultModal(page)
            const s5 = await captureStableWithBox(page, rowBoxSel(0)) //階段5 data-changed：關 modal 後、主清單 M1 列摘要已變更（由『使用 2 項權限』→『使用 3 項權限』）
            return [
                { name: 'E2E-002-1-source-row', buf: s1 },
                { name: 'E2E-002-2-dialog-open', buf: s2 },
                { name: 'E2E-002-3-row-toggled', buf: s3 },
                { name: 'E2E-002-4-cpemis-save-ok', buf: s4 },
                { name: 'E2E-002-5-data-changed', buf: s5 },
            ]
        },
        semantic: async (page) => {
            //（成功 modal 文字斷言已移至 run() dismiss 前）
            //DB M1.cpemis 應含 權限P3 鍵，且 mode/isActive 符所選
            const cpemis = await readDbGrupCpemis(page, '權限群組M1')
            assert.ok(cpemis && typeof cpemis === 'object' && cpemis['權限P3'], 'M1.cpemis 應含 權限P3 鍵（新勾選）')
            assert.equal(cpemis['權限P3'].isActive, 'y', 'M1 對 權限P3 isActive 應為 y')
            assert.equal(cpemis['權限P3'].mode, 'AND', 'M1 對 權限P3 mode 應為所選 AND')
            //【端到端核心不變式：權限變更 → 解析後權限樹】驗的是外部應用 getPermUserInfor 實際查到的 resolved 權限，
            //非只驗 cpemis 設定存對。peter 屬 M1；M1 加 P3(AND) 後，peter 樹反映 AND 交集：baseline (P1∪P2)=4 個
            //（A/頁A/區塊A,A/頁C,B/頁A/區塊A,B/頁A/區塊B）∩ P3 → B/頁A/區塊A 被交集掉，剩 3 個（A/頁A/區塊A 不在 P3 故保留）。
            //預期值由 getUserRules 演算法算出（見 tmp/calc-trees 心得）；若 AND 交集邏輯或 UI→DB→解析任一環壞掉，此斷言會抓到。
            const tree = await getResolvedActiveTargets(page, 'id-for-peter')
            assert.deepEqual(tree, ['專案A/頁A/區塊A', '專案A/頁C', '專案B/頁A/區塊B'],
                `peter 解析後權限樹應反映 M1+=P3(AND) 之交集效果（baseline 4→3；實得 ${JSON.stringify(tree)}）`)
        },
    },

    //—————————————— 入口 B：VePemiBlngGrups（權限視角，自帶 updateGrups 即時寫 DB）——————————————

    {
        //E2E-003：自權限列 belongGrups 按鈕開啟 VePemiBlngGrups 對話框（golden 起點）。
        //僅驗開啟態：標題 + 當前權限名標籤 + 逐群組列。
        name: 'E2E-003-blnggrups-open',
        run: async (page) => {
            await gotoPemis(page)
            const s1 = await captureStableWithBox(page, rowBoxSel(0)) //階段1：來源列（點 belongGrups 按鈕前）
            await openBelongDialog(page, 0) //row 0 = 權限P1（僅 M1 使用之）
            const s2 = await captureStableWithBox(page, SEL_MODAL) //階段2：VePemiBlngGrups 對話框初始開啟態
            return [
                { name: 'E2E-003-1-source-row', buf: s1 },
                { name: 'E2E-003-2-dialog-open', buf: s2 },
            ]
        },
        semantic: async (page) => {
            const label = await page.evaluate(() => window.$vo.$t('pemiBlngEditGrups'))
            const now = await page.evaluate(() => window.$vo.$t('pemiBlngPemiNow'))
            const txt = await page.evaluate(() => document.body.innerText)
            assert.ok(txt.includes(label), `VePemiBlngGrups 對話框標題應顯示（${label}）`)
            assert.ok(txt.includes(now), `對話框頂部應顯示當前權限標籤（${now}）`)
            assert.ok(txt.includes('權限P1'), '對話框頂部應顯示當前權限名 權限P1')
            //列＝全部 grups，應見 M1/M2/M3/M4
            assert.ok(txt.includes('權限群組M1') && txt.includes('權限群組M4'), '對話框應逐群組列出 base seed grups')
        },
    },
    {
        //E2E-004：於 VePemiBlngGrups 勾選 權限群組M2（原無 P1）enable + 切其 mode → 點對話框 Save → updateGrups 寫 DB + 成功 modal。
        //斷言（有 DB 寫入）：結果 modal 顯示 grupSaveGrupsSuccess；DB M2.cpemis 含 權限P1 鍵 = { mode:'AND', isActive:'y' }。
        //對話框內列＝全部 grups（依 order）：row0=M1, row1=M2, row2=M3, row3=M4。
        //多階段：E2E-004-1-dialog-toggled（toggle+mode 後、Save 前之對話框態）→ E2E-004-blnggrups-save-ok（存檔成功 modal）。
        name: 'E2E-004-blnggrups-save-ok',
        run: async (page) => {
            await gotoPemis(page)
            const s1 = await captureStableWithBox(page, rowBoxSel(0)) //階段1：來源列（點 belongGrups 按鈕前）
            await openBelongDialog(page, 0) //row 0 = 權限P1
            const s2 = await captureStableWithBox(page, SEL_MODAL) //階段2：對話框初始態（toggleDialogEnable 前）
            await toggleDialogEnable(page, 1) //勾選 權限群組M2 enable（y）→ 將 P1 掛入 M2 → isModified=true → Save 鈕現身
            await setDialogMode(page, 1, 'AND') //切 M2 對 P1 之 mode 為 AND
            const s3 = await captureStableWithBox(page, dialogRowBoxSel(1)) //階段3：對話框內被切的 row1（權限群組M2），toggle+mode 後 Save 前
            await saveBelongAndWaitModal(page) //updateGrups 寫 DB → 成功 modal
            const s4 = await captureStableWithBox(page, SEL_MODAL) //階段4：對話框 Save 後成功結果 modal
            await assertModalMsg(page, 'grupSaveGrupsSuccess') //關 modal 前斷言成功訊息（dismiss 後文字消失，故移此處）
            await dismissResultModal(page)
            const s5 = await captureStableWithBox(page, rowBoxSel(0)) //階段5 data-changed：關 modal 後、權限頁 P1 列摘要已變更（所屬群組含 M2）
            return [
                { name: 'E2E-004-1-source-row', buf: s1 },
                { name: 'E2E-004-2-dialog-open', buf: s2 },
                { name: 'E2E-004-3-row-toggled', buf: s3 },
                { name: 'E2E-004-4-blnggrups-save-ok', buf: s4 },
                { name: 'E2E-004-5-data-changed', buf: s5 },
            ]
        },
        semantic: async (page) => {
            //（成功 modal 文字斷言已移至 run() dismiss 前）
            //DB M2.cpemis 應含 權限P1 鍵，且 mode/isActive 符所選
            const cpemis = await readDbGrupCpemis(page, '權限群組M2')
            assert.ok(cpemis && typeof cpemis === 'object' && cpemis['權限P1'], 'M2.cpemis 應含 權限P1 鍵（已掛入本權限）')
            assert.equal(cpemis['權限P1'].isActive, 'y', 'M2 對 權限P1 isActive 應為 y')
            assert.equal(cpemis['權限P1'].mode, 'AND', 'M2 對 權限P1 mode 應為所選 AND')
        },
    },

    //—————————————— 唯讀檢視（isEditable=false 守門，與可編輯案例共覆蓋兩分支）——————————————

    {
        //E2E-005：群組頁關閉編輯模式後開 VeCpemis → 檢視版標題（grupEditCpemisForDisplay）、無 Save 鈕、下拉 / checkbox 皆 disabled。
        name: 'E2E-005-readonly-view',
        run: async (page) => {
            await gotoGrups(page)
            await toggleEditMode(page) //關閉編輯模式 → isEditable=false
            const s1 = await captureStableWithBox(page, rowBoxSel(0)) //階段1：來源列（toggleEditMode 後、點 cpemis 按鈕前）
            //關編輯模式後 cpemis 欄仍為按鈕（getCpemisText），點之開檢視版對話框
            await page.locator(`.ag-row[row-index="0"] .ag-cell[col-id="cpemis"] button`).first().click()
            await waitUntilExist(page, 'VeCpemis 檢視版標題', () => {
                const vo = window.$vo
                return (document.body.innerText || '').includes(vo.$t('grupEditCpemisForDisplay'))
            }, { timeout: 15000 })
            await waitDialogGrid(page)
            const s2 = await captureStableWithBox(page, SEL_MODAL) //階段2：VeCpemis 唯讀檢視對話框開啟態
            return [
                { name: 'E2E-005-1-source-row', buf: s1 },
                { name: 'E2E-005-2-dialog-open', buf: s2 },
            ]
        },
        semantic: async (page) => {
            const dispLabel = await page.evaluate(() => window.$vo.$t('grupEditCpemisForDisplay'))
            const editLabel = await page.evaluate(() => window.$vo.$t('grupEditCpemis'))
            const txt = await page.evaluate(() => document.body.innerText)
            assert.ok(txt.includes(dispLabel), `應顯示檢視版標題（${dispLabel}）`)
            assert.ok(!txt.includes(editLabel) || dispLabel.includes(editLabel) === false, '不應為可編輯版標題')
            //無對話框 Save 鈕（mdiCheckCircle）
            const saveCnt = await pathBtn(page, DLG_MDI.save).count()
            assert.equal(saveCnt, 0, '唯讀檢視不應出現對話框 Save 鈕')
            //對話框內 select / checkbox 皆 disabled
            const allDisabled = await page.evaluate(() => {
                const sels = [...document.querySelectorAll('.ag-cell[col-id="mode"] select')]
                const chks = [...document.querySelectorAll('.ag-cell[col-id="enable"] input[type="checkbox"]')]
                const els = [...sels, ...chks]
                return els.length > 0 && els.every((e) => e.disabled === true)
            })
            assert.ok(allDisabled, '唯讀檢視之 mode 下拉與 enable checkbox 應皆 disabled')
        },
    },
    {
        //E2E-006：權限頁關閉編輯模式後開 VePemiBlngGrups（入口 B）→ 檢視版標題（pemiBlngEditGrupsForDisplay）、無 Save 鈕、下拉 / checkbox 皆 disabled。
        //對應 spec 流程_群組權限關聯.md E2E-006（補權限頁入口唯讀；E2E-005 已涵蓋群組頁入口 VeCpemis 唯讀）。單階段截圖：唯讀檢視對話框開啟態。
        name: 'E2E-006-readonly-view',
        run: async (page) => {
            await gotoPemis(page)
            await toggleEditMode(page) //關閉編輯模式 → isEditable=false
            //關編輯模式後 belongGrups 欄仍為按鈕，點之開檢視版對話框
            await page.locator(`.ag-row[row-index="0"] .ag-cell[col-id="belongGrups"] button`).first().click()
            await waitUntilExist(page, 'VePemiBlngGrups 檢視版標題', () => {
                const vo = window.$vo
                return (document.body.innerText || '').includes(vo.$t('pemiBlngEditGrupsForDisplay'))
            }, { timeout: 15000 })
            await waitDialogGrid(page)
            return await captureStableWithBox(page, SEL_MODAL) //VePemiBlngGrups 唯讀檢視對話框開啟態
        },
        semantic: async (page) => {
            //對應 spec E2E-006 驗證1：標題為檢視版鍵（pemiBlngEditGrupsForDisplay，eng/cht 皆與編輯版相異）。
            const dispLabel = await page.evaluate(() => window.$vo.$t('pemiBlngEditGrupsForDisplay'))
            const editLabel = await page.evaluate(() => window.$vo.$t('pemiBlngEditGrups'))
            const txt = await page.evaluate(() => document.body.innerText)
            assert.ok(txt.includes(dispLabel), `應顯示檢視版標題（${dispLabel}）`)
            assert.ok(!txt.includes(editLabel) || dispLabel.includes(editLabel) === false, '不應為可編輯版標題')
            //對應 spec E2E-006 驗證1：無對話框 Save 鈕（hasSaveBtn=isEditable && isModified，isEditable=false 恆不渲染）。
            const saveCnt = await pathBtn(page, DLG_MDI.save).count()
            assert.equal(saveCnt, 0, '唯讀檢視不應出現對話框 Save 鈕')
            //對應 spec E2E-006 驗證1：mode 下拉與 enable checkbox 皆 disabled（VePemiBlngGrups.vue:155,159）。
            const allDisabled = await page.evaluate(() => {
                const sels = [...document.querySelectorAll('.ag-cell[col-id="mode"] select')]
                const chks = [...document.querySelectorAll('.ag-cell[col-id="enable"] input[type="checkbox"]')]
                const els = [...sels, ...chks]
                return els.length > 0 && els.every((e) => e.disabled === true)
            })
            assert.ok(allDisabled, '唯讀檢視之 mode 下拉與 enable checkbox 應皆 disabled')
        },
    },
]

//手術式重產（§6.3）：--names a,b,c 只產指定 case；--langs eng,cht 只產指定語系。截圖「前」就 gate（省截圖成本）。
function argList(flag) {
    const i = process.argv.indexOf(flag)
    if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1].split(',').map((s) => s.trim()).filter(Boolean)
    return null
}
//前綴或完整匹配：傳 'E2E-002' 即可匹配 'E2E-002-cpemis-save-ok'（避免 §6.3 殷鑑「--names 只認字面」陷阱）
function nameMatch(list, caseName) { return list.some((nm) => caseName === nm || caseName.startsWith(nm)) }

async function generateBaseline() {
    console.log('=== 產製 rela-grup-pemi baseline 開始 ===')
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
    console.log('=== 產製 rela-grup-pemi baseline 完成 ===')
}

if (isBaseline) {
    generateBaseline().catch((err) => { console.log('baseline 例外', err); cleanup(); process.exit(1) })
}
else {
    for (const lang of LANGS) {
        describe(`e2e-rela-grup-pemi (${lang})`, function() {
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
                        assertBaselineMatch(s.buf, picPath(lang, s.name), `rela-grup-pemi-${lang}-${s.name}`)
                    }
                })
            }
        })
    }
}
