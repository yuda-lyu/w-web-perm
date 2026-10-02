//權限規則關聯 e2e（B 類關聯編輯，單一編輯器 VeCrules）。對應 spec/流程_權限規則關聯.md。
//鏡像 test/e2e-rela-grup-pemi.test.mjs（B 類第 2 flow）之 resolve 型部分，差異：
//  - 本 flow 僅單一編輯器 VeCrules（無第二入口）；對話框列＝store 全部 targets（id + enable 兩欄，無 mode 欄）。
//  - crules JSON5 值為純字串 'y'/'n'（非 {mode,isActive} 物件），故無 mode 下拉互動。
//  - VeCrules.clickSave 為 **resolve 型**：core() 序列化各 target enable 為 {targetId:'y'|'n'} JSON 字串 → pm.resolve（VeCrules.vue:723,734），
//    **不打 API、無結果 modal**；DB 寫入延到權限頁工具列存檔（savePemis → $fapi.updatePemis → showCheckYes pemiSavePemisSuccess，
//    LayoutContentPemis.vue:1211,1228）。
//使用方式（以專案根為工作目錄）：
//  - 產 baseline：node test/e2e-rela-pemi-rule.test.mjs --baseline （寫 test/pics/rela-pemi-rule/）
//  - 驗證（mocha）：npx mocha test/e2e-rela-pemi-rule.test.mjs --reporter list （pixelmatch 反鋸齒感知 + maxDiffPixels 容差比對，非 byte-exact）
//  - 手術式重產（截圖前篩選；規格詳 w-package-tools-e2e 之 README.md §2.2）：
//      --names <項,...>   每項可帶語系前綴（eng-／cht-），不帶則兩語系皆產；階段圖鍵（如 eng-E2E-004-4-save-back）只寫該張；
//                         案例鍵或其編號前綴（如 E2E-004-save-back、E2E-004）寫該案全部階段；不符任何鍵即報錯並列出可用鍵
//      --langs <eng,cht>  限語系（須完全等於已宣告語系）；--write-mode missing|changed  只寫缺少者／只寫與現行標準圖差異超過容差者（預設 all）
//      env E2E_BASELINE_OUT_DIR=<dir>  寫到該目錄（等價驗證用，不動 test/pics；比對端讀取之標準圖路徑不受影響）
//  - 產製端與比對端呼叫同一案例管線（runBaselineCase）：每案 fresh browser → DB 還原 → 開頁 → 語系 → 各階段截圖 → 語意斷言 → 寫檔／比對；斷言不過該案一張都不寫。
//act 走 user-facing input；assert = 語意斷言 + pixel baseline（§6.2 / §6.3）。
//
//base seed（g_initialTestData → src/schema/tables/*）：
//  pemis(order0-3): 權限P1(crules: 專案A/頁A/區塊A=y, 專案A/頁B/區塊A=n, 專案A/頁C=n),
//                   權限P2, 權限P3, 權限P4
//  targets(order0-22): 路徑式 id（如 專案A/頁A/區塊A），row0=專案A/頁A/區塊A, row1=專案A/頁A/區塊A/執行按鈕,
//                      row2=專案A/頁A/區塊A/分析按鈕, row3=專案A/頁B/區塊A ...（依 order）
import fs from 'fs'
import assert from 'assert'
import JSON5 from 'json5'
import { startServersOnce, cleanup, launchBrowser, openApp, captureStableWithBox, rowBoxSel, dialogRowBoxSel, waitUntilExist, getResolvedActiveTargets, assertBaselineMatch, dismissResultModal, captureBaseSeed, resetDb, setLang, MDI, iconBtn, DLG_MDI, dlgBtn, waitDialogGrid, toggleDialogEnable, clickDialogSave, clickDialogClose, waitDialogClosed, gotoPemis, toggleEditMode, assertModalMsg } from './tools/e2e-setup.mjs'
//產製端與比對端同一案例管線（runBaselineCase）與截圖前篩選（createBaselineGate），規格詳 w-package-tools-e2e 之 README.md §2.1-2.2
import { runBaselineCase, createBaselineGate } from './tools/e2eLib.mjs'

const PICS_DIR = './test/pics/rela-pemi-rule'
const LANGS = ['eng', 'cht']
const isBaseline = process.argv.includes('--baseline')

function picPath(lang, name) { return `${PICS_DIR}/rela-pemi-rule-${lang}-${name}.png` }

//紅框標注目標（captureStableWithBox）：本 case 主要觀看區
const SEL_GRID = '.ag-root-wrapper'                                            //清單 / grid 內容區
const SEL_MODAL = 'div[style*="overscroll-behavior"] div[tabindex="0"] > div'  //WDialog 結果 modal / Ve 對話框

//設定語系 setLang（test setup 層，非 act-under-test；eng 不切但補等量 600ms settle）自 e2e-setup.mjs import（本檔原副本與之語法樹及去空白註解之 token 序列皆相同，2026-09-28 收斂）。

//gotoPemis／toggleEditMode：本檔原各自一份，與 e2e-setup.mjs 匯出版逐字相同，2026-09-28 收斂並改 import
//（見檔頭 import 清單）。

//—— 對話框 / 工具列 icon 按鈕與對話框內 grid 互動原語：自 e2e-setup.mjs import（本檔原副本與之語法樹及去空白註解之 token 序列皆相同，2026-09-28 收斂）——
//WDialog Save 鈕＝DLG_MDI.save（mdiCheckCircle，僅 isEditable && isModified 才渲染）、Close 鈕＝DLG_MDI.close（mdiClose，恆渲染），以 dlgBtn 定位；
//權限頁工具列存檔鈕＝MDI.upload（mdiCloudUploadOutline，僅 isEditable && isModified 才渲染），以 iconBtn 定位（原本地 TOOLBAR_MDI.upload＋pathBtn，字串與本體相同）。
//waitDialogGrid / toggleDialogEnable（列以 row-index 定位；enable=checkbox；本對話框無 mode 欄）/ clickDialogSave / clickDialogClose / waitDialogClosed 同上。
//讀對話框內某列 enable checkbox 是否勾選。
async function readDialogEnableChecked(page, rowIndex) {
    return await page.evaluate((r) => {
        const el = document.querySelector(`.ag-row[row-index="${r}"] .ag-cell[col-id="enable"] input[type="checkbox"]`)
        return el ? !!el.checked : null
    }, rowIndex)
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
//等對話框關閉 waitDialogClosed（Save resolve / Close reject 後 bShow=false，以標題消失偵測）自 e2e-setup.mjs import。
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
    await iconBtn(page, MDI.upload).first().click()
    await waitUntilExist(page, 'CheckYes 結果 modal（systemMessage 標題）', () => {
        const vo = window.$vo
        return (document.body.innerText || '').includes(vo.$t('systemMessage'))
    }, { timeout: 20000 })
    await page.waitForTimeout(800) //modal 進場 settle
}
//assertModalMsg：本檔原一份，與 e2e-setup.mjs 匯出版逐字相同，2026-09-28 收斂並改 import。

//—— DB 衛生 helpers（每 case 前還原 pemis 表為 base seed）——
//E2E-004 會寫 DB（updatePemis）；其餘 case 雖不寫 DB 但為一致性與隔離仍每 case 還原。
let BASE_SEED = null
//captureBaseSeed(page,'pemis') / resetDb(browser,'pemis',seed) 收斂進 e2e-setup.mjs 共用
//（原本 grups/pemis/rela-grup-pemi/rela-pemi-rule/rela-user-grup/targets/users 七檔重複定義）。
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

//案例宣告（產製端與比對端共用；順序＝mocha it 順序＝產製順序）：run(page, lang) 走流程並回傳截圖（單張 Buffer 或多階段 [{ name, buf }]）；
//semantic(page) 為語意斷言，兩端皆於寫檔／比對之前執行（runBaselineCase）；stages＝該案實際產出之全部圖鍵（與寫檔名、比對名一致，產出與宣告不符即報錯）。
const cases = [

    //—————————————— VeCrules：開啟態（golden 起點）——————————————

    {
        //E2E-001：自權限列 crules 欄按鈕開啟 VeCrules 對話框（golden 起點）。
        //僅驗開啟態：標題 pemiEditCrules + 逐 target 列（id + enable checkbox）+ 既有 'y' 之 target 列勾選。
        name: 'E2E-001-open-dialog',
        stages: ['E2E-001-1-source-row', 'E2E-001-2-dialog-open'],
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
        stages: ['E2E-002-1-source-row', 'E2E-002-2-dialog-open', 'E2E-002-3-row-toggled'],
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
            const saveCnt = await dlgBtn(page, DLG_MDI.save).count()
            assert.ok(saveCnt > 0, 'isModified 轉真後應出現對話框 Save 鈕')
        },
    },
    {
        //E2E-003：於對話框點某列原為啟用（'y'）的 target enable checkbox → 切回停用（'n'）→ isModified 轉真、該列未勾選。
        //與 E2E-002 共同覆蓋 enable 雙向切換；不點儲存、不關閉前截圖。
        name: 'E2E-003-check-no',
        stages: ['E2E-003-1-source-row', 'E2E-003-2-dialog-open', 'E2E-003-3-row-toggled'],
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
            const saveCnt = await dlgBtn(page, DLG_MDI.save).count()
            assert.ok(saveCnt > 0, 'isModified 轉真後應出現對話框 Save 鈕')
        },
    },

    //—————————————— VeCrules：儲存回填 → 權限頁工具列存檔（resolve 型，DB 寫入延到此）——————————————

    {
        //E2E-004：於對話框切換某 target enable 後點對話框儲存（resolve crules 字串回填權限列）
        //→ 再點權限頁工具列存檔 → updatePemis 寫 DB + 成功 modal。
        //斷言（有 DB 寫入）：結果 modal 顯示 pemiSavePemisSuccess；DB P1.crules 含 專案A/頁B/區塊A=y（新啟用）。
        //本案啟用 1 個原為 'n' 的 target，P1 啟用數由 1→2，crules 欄摘要 N 隨之變動。
        //多階段 5 張（圖鍵見 stages）：來源列 → 對話框初始態 → toggle 後該列 → 權限頁存檔成功 modal → 關 modal 後該權限列摘要。
        name: 'E2E-004-save-back',
        stages: ['E2E-004-1-source-row', 'E2E-004-2-dialog-open', 'E2E-004-3-row-toggled', 'E2E-004-4-save-back', 'E2E-004-5-data-changed'],
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
        stages: ['E2E-005-1-source-row', 'E2E-005-2-dialog-open', 'E2E-005-3-row-toggled', 'E2E-005-4-cancelled-grid'],
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

    //—————————————— 唯讀檢視（isEditable=false 守門，與可編輯案例共覆蓋兩分支）——————————————

    {
        //E2E-006：權限頁關閉編輯模式後開 VeCrules → 展示模式標題（pemiEditCrulesForDisplay）、無儲存鈕、enable checkbox 皆 disabled。
        //本對話框無 mode 下拉欄（crules 值為純 'y'/'n' 字串），故 disabled 斷言僅檢查 enable checkbox。
        //對應 spec 流程_權限規則關聯.md E2E-006。單階段截圖：唯讀檢視對話框開啟態。
        name: 'E2E-006-readonly-view',
        stages: ['E2E-006-readonly-view'], //單張案例：圖鍵即案例鍵
        run: async (page) => {
            await gotoPemis(page)
            await toggleEditMode(page) //關閉編輯模式 → isEditable=false
            //關編輯模式後 crules 欄仍為按鈕（getCrulesText），點之開展示模式對話框
            await page.locator(`.ag-row[row-index="0"] .ag-cell[col-id="crules"] button`).first().click()
            await waitUntilExist(page, 'VeCrules 展示模式標題', () => {
                const vo = window.$vo
                return (document.body.innerText || '').includes(vo.$t('pemiEditCrulesForDisplay'))
            }, { timeout: 15000 })
            await waitDialogGrid(page)
            return await captureStableWithBox(page, SEL_MODAL) //VeCrules 唯讀檢視對話框開啟態
        },
        semantic: async (page) => {
            //對應 spec E2E-006 驗證1：標題為展示模式鍵（pemiEditCrulesForDisplay，eng/cht 皆與編輯版相異）。
            const dispLabel = await page.evaluate(() => window.$vo.$t('pemiEditCrulesForDisplay'))
            const editLabel = await page.evaluate(() => window.$vo.$t('pemiEditCrules'))
            const txt = await page.evaluate(() => document.body.innerText)
            assert.ok(txt.includes(dispLabel), `應顯示展示模式標題（${dispLabel}）`)
            assert.ok(!txt.includes(editLabel) || dispLabel.includes(editLabel) === false, '不應為可編輯版標題')
            //對應 spec E2E-006 驗證1：無對話框儲存鈕（hasSaveBtn=isEditable && isModified，isEditable=false 恆不渲染）。
            const saveCnt = await dlgBtn(page, DLG_MDI.save).count()
            assert.equal(saveCnt, 0, '唯讀檢視不應出現對話框儲存鈕')
            //對應 spec E2E-006 驗證1：各 target 列 enable checkbox 皆 disabled（VeCrules.vue:131；本對話框無 mode 下拉欄）。
            const allDisabled = await page.evaluate(() => {
                const chks = [...document.querySelectorAll('.ag-cell[col-id="enable"] input[type="checkbox"]')]
                return chks.length > 0 && chks.every((e) => e.disabled === true)
            })
            assert.ok(allDisabled, '唯讀檢視之 enable checkbox 應皆 disabled')
        },
    },
]

//單一案例管線（產製端與比對端共用，runBaselineCase）：per-case fresh browser（每案 launch／close，消除 GPU/font/CSS cache 跨 case 累積；對齊 sso）
//→ throwaway page 還原 DB 為 base seed → 開 case page → 設語系 → run（各階段截圖）→ 語意斷言 → 產製端依 gate 寫檔／比對端逐張比對標準圖 → 關瀏覽器。
async function runCase(mode, lang, c, extra = {}) {
    return await runBaselineCase({
        mode,
        lang,
        name: c.name,
        run: c.run,
        stages: c.stages,
        semantic: c.semantic ? async (ctx) => c.semantic(ctx.page) : null,
        launch: launchBrowser,
        openPage: async (browser) => {
            await resetDb(browser, 'pemis', BASE_SEED) //throwaway page 還原 DB 為 base seed，關閉後再開 case page
            const page = await openApp(browser)
            await setLang(page, lang) //eng 也切（symmetric）：補等同 cht setLang 的 re-render+settle 時間
            return page
        },
        pathOf: picPath,
        labelOf: (lg, key) => `rela-pemi-rule-${lg}-${key}`,
        match: assertBaselineMatch,
        ...extra,
    })
}

async function generateBaseline() {
    console.log('=== 產製 rela-pemi-rule baseline 開始 ===')
    //截圖前篩選（--names / --langs / --write-mode / E2E_BASELINE_OUT_DIR）；不符任何鍵即於此報錯（不啟動服務）
    const gate = createBaselineGate({ langs: LANGS, cases })
    console.log(gate.describe())
    await startServersOnce()
    fs.mkdirSync(PICS_DIR, { recursive: true })
    process.env.E2E_STRICT_CAPTURE = '1' //regen 端：captureStable 未 settle 即 throw，拒絕寫入未穩定畫面
    //擷取 pristine base seed（DB 剛 fresh seed）——用臨時 browser
    { const b = await launchBrowser(); const pp = await openApp(b); BASE_SEED = await captureBaseSeed(pp, 'pemis'); await b.close() }
    for (const lang of gate.langs) {
        for (const c of gate.casesFor(lang)) {
            console.log(`  ${lang}-${c.name}`)
            await runCase('regen', lang, c, { gate })
        }
    }
    //--names 之任一項未產出即報錯（不靜默略過）
    gate.finalize()
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
            before(async function() {
                this.timeout(200000)
                await startServersOnce()
                if (!BASE_SEED) { const b = await launchBrowser(); const pp = await openApp(b); BASE_SEED = await captureBaseSeed(pp, 'pemis'); await b.close() }
            })
            //per-case fresh browser + DB 還原 + 開頁 + 語系由 runCase 負責（確保單 case --grep 也能跑）；語意斷言於比對標準圖之前（pixel baseline 為補強層）
            for (const c of cases) {
                it(c.name, async function() { //function(非箭頭): onKnownDefect 需 mocha 之 this.skip()
                    await runCase('compare', lang, c, { onKnownDefect: () => this.skip() }) //已知缺陷協定: 標 pending(提示框殘留已由 w-component-vue 2.5.24 修正, 其偵測改為直接失敗, 見 e2e-setup probeStuckTooltip)
                })
            }
        })
    }
}
