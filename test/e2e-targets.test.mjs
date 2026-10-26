//後台標的清單 e2e。對應 spec/流程_後台標的清單.md。鏡像 test/e2e-users.test.mjs（canonical pilot）。
//雙模式：
//  - 產 baseline：node test/e2e-targets.test.mjs --baseline （寫 test/pics/targets/）
//  - 驗證（mocha）：npx mocha test/e2e-targets.test.mjs --reporter list （pixelmatch 反鋸齒感知 + maxDiffPixels 容差比對，非 byte-exact）
//  手術式重產（截圖前篩選，規格詳 w-package-tools-e2e 之 README.md §2.2；不符任何鍵即於啟動服務前報錯並列出可用鍵）：
//    --names <項,...>  每項可帶語系前綴（eng-/cht-），不帶則兩語系皆產；階段圖鍵（如 eng-E2E-003-2-row-filled）只寫該張；
//                      案例鍵或其編號前綴（如 E2E-003-add-ok、E2E-003）寫該案全部階段
//    --langs <eng,cht> 限語系（須完全等於已宣告語系）
//    --write-mode missing|changed  只寫標準圖缺少者（追加案例）／只寫與現行標準圖差異超過容差者（預設 all 全寫）
//    env E2E_BASELINE_OUT_DIR=<dir>  寫到暫存目錄（等價驗證用，不動 test/pics）
//  產製端與比對端呼叫同一案例管線（runBaselineCase，見 runCase）：每案 fresh browser → throwaway page 還原 DB 為 base seed →
//  開頁切語系 → 流程截圖 → 語意斷言（兩端皆於寫檔／比對之前；不過則該案一張都不寫）→ 產製端依篩選寫檔／比對端比對標準圖。
//act 走 user-facing input；assert = 語意斷言 + pixel baseline（§6.2 / §6.3）。
//run06(引用連帶, ADR-036、R-REF-CASCADE-01; spec 流程_後台標的清單 E2E-005／E2E-011／E2E-012／E2E-013): 標的刪除或改 id 而有權限規則引用時, 儲存前先彈確認框(E2E-005／011 按「是」才送出)、儲存後 pemis.crules 被連帶清理;
//  每案前連同引用端 pemis 表一併還原(resetDbTables); 檔尾新增 describe「run06 引用連帶」: E2E-012(有引用: 按否中止、按是送出、清理與授權樹)、E2E-013(無引用: 不彈框)——語意斷言、不產標準圖;
//  既有標準圖 0 張重產、確認框不入圖(依派工不新增標準圖). 確認框互動原語見 e2e-setup.mjs(answerConfirm、saveConfirmYesAndWaitModal 等).
//targets 與 users 差異：主鍵為 id（路徑式字串）、無 name / email / isActive / 關聯欄；
//checkbox 與警告 icon 皆在 col-id="id"；save 結果走 $dg.showCheckYes 持久 modal。
import fs from 'fs'
import assert from 'assert'
import JSON5 from 'json5'
import { startServersOnce, cleanup, launchBrowser, openApp, captureStableWithBox, rowBoxSel, waitUntilExist, getResolvedActiveTargets, assertBaselineMatch, typeIntoCell, captureBaseSeedOnce, resetDb, restoreDbOnce, resetDbTables, restoreDbTablesOnce, clickNavItem, setLang, MDI, iconBtn, checkRow, toggleEditMode, editSwitchLoc, clickAdd, cellHasWarn, clickSave, saveAndWaitModal, assertModalMsg, expTemplate, expectConfirmBox, expectResultBox, saveConfirmYesAndWaitModal, clickModalBtn, waitModalGone, topModalLines, rowIndexByCell, pageSaveShown, dismissResultModal } from './tools/e2e-setup.mjs'
import { callRpc, TOKEN_ADMIN, readTables, restoreTables, selectAllRows, editTableRows } from './tools/api-setup.mjs'
import { runBaselineCase, createBaselineGate, gridContentBox, itemsUnionBox } from './tools/e2eLib.mjs'

const PICS_DIR = './test/pics/targets'
const LANGS = ['eng', 'cht']
const isBaseline = process.argv.includes('--baseline')

//紅框標注目標（captureStableWithBox）：本 case 主要觀看區
//框實際有內容者（技能 §7.2、§7.3-2；2026-09-28 改：原框表格外框與整條工具列，列少時框進大片空白、工具列右側約 1000px 空白）：
//表格經 gridContentBox 取標頭＋可見資料列（空表為標頭＋「無資料」訊息）；工具列經 itemsUnionBox fit 取其上項目之聯集
const SEL_GRID = '.ag-root-wrapper'                                            //清單 / grid 內容區
const SEL_MODAL = 'div[style*="overscroll-behavior"] div[tabindex="0"] > div'  //WDialog 結果 modal / Ve 對話框
const SEL_TOOLBAR = '[data-fmid="targets-toolbar"]'                            //功能區工具列
const SEL_ID_CHK = '.ag-row .ag-cell[col-id="id"] input[type="checkbox"]'      //id 欄列勾選框（編輯模式才有）
const SEL_ID_DRAG = '.ag-row .ag-cell[col-id="id"] .ag-row-drag:visible'       //id 欄拖曳握把（ag-grid rowDrag，編輯模式才有）

function picPath(lang, name) { return `${PICS_DIR}/targets-${lang}-${name}.png` }

//設定語系（test setup 層，非 act-under-test；對齊雙語覆蓋維度）：setLang 自 e2e-setup.mjs import（原本檔內一份，與 setup 版
//token 逐字相同、僅排版不同，2026-09-28 收斂）。cht 走語系切換；eng 為預設不切，但補等同的 settle buffer（600ms），
//治 eng-vs-cht 收斂不對稱（sso e2e-adduser 殷鑑）。

//導航至標的頁（user-facing：點左側「管理對象」導覽），等 ag-grid 載入。
//openApp 已等到 csLogin+webInfor，故此處 $t 譯文已就緒（lang-aware 取標籤）
async function gotoTargets(page) {
    const targetsLabel = await page.evaluate(() => window.$vo.$t('mmTargets'))
    await clickNavItem(page, targetsLabel) //限定導覽面板內（見 e2e-setup clickNavItem 註解）
    await waitUntilExist(page, '標的 ag-grid 列', () => document.querySelectorAll('.ag-row').length > 0, { timeout: 20000 })
    await page.waitForTimeout(500)
}

//全選（點 id 欄 header 的全選 checkbox），勾選所有列——本檔專有，未收斂（僅本檔使用）。
async function checkAll(page) {
    await page.locator(`.ag-header-cell[col-id="id"] input[type="checkbox"]`).first().click()
    await page.waitForTimeout(500)
}
//checkRow（本頁主鍵欄為 id，呼叫處傳 colId='id'）／toggleEditMode／clickAdd／cellHasWarn／clickSave／
//saveAndWaitModal／assertModalMsg：本檔原各自一份，與 e2e-setup.mjs 匯出版逐字相同，2026-09-28 收斂並改 import
//（見檔頭 import 清單）。icon 按鈕（MDI＋iconBtn）與 typeIntoCell／captureBaseSeed／resetDb 之收斂見下方既有註解。

//—— DB 衛生 helpers ——
//pristine base seed（含全欄位），每 case 前還原 DB，使跨 case／跨語系可重現
let BASE_SEED = null
//run06(ADR-036): 刪除標的(或改 id)於同一次寫入內連帶清理 pemis.crules 之引用(E2E-005 刪 專案A/頁A/區塊A → P1 之 crules 被移除該項), 故每案前須連同引用端 pemis 表一併還原(resetDbTables, 引用端在前), 否則清理遺留給後續案例
let BASE_PEMIS = null
//captureBaseSeed(page,'targets') / resetDb(browser,'targets',seed) 收斂進 e2e-setup.mjs 共用
//（原本 grups/pemis/rela-grup-pemi/rela-pemi-rule/rela-user-grup/targets/users 七檔重複定義）。

//case 定義（順序＝產製順序＝mocha it 順序）：stages 為該案產出之全部圖鍵（與寫檔名、比對名一致，產出與宣告不符即報錯；
//單張案例＝[name]）；run(page,lang) 走流程並回傳截圖 buffer；semantic(page) 為語意斷言，產製端與比對端皆於寫檔／比對之前執行
const CASES = [
    {
        //E2E-001：進入標的頁顯示初始清單（預設編輯模式 ON，比照 users pilot 之 list-view 截預設態）
        name: 'E2E-001-list-view',
        stages: ['E2E-001-list-view'],
        run: async (page) => {
            await gotoTargets(page)
            return await captureStableWithBox(page, gridContentBox(SEL_GRID)) //觀看區：標的清單 grid
        },
        semantic: async (page) => {
            const txt = await page.evaluate(() => document.body.innerText)
            assert.ok(txt.includes('專案A/頁A/區塊A'), '應顯示 base seed 路徑式 id 專案A/頁A/區塊A')
            assert.ok(txt.includes('專案A/頁C') && txt.includes('專案B/頁A/區塊A'), '應顯示多筆 base seed targets')
            //spec E2E-001：預設編輯模式下工具列顯示新增按鈕（2026-09-28 補斷言）
            assert.ok(await iconBtn(page, MDI.plus).count() > 0, '預設編輯模式工具列應顯示新增按鈕')
            //spec E2E-001「id 欄具勾選框」「id 欄具勾選與拖曳控制」（2026-09-28 補拖曳；亦為 E2E-002 反向斷言之選擇器正向校驗）
            assert.ok(await page.locator(SEL_ID_CHK).count() > 0, '預設編輯模式 id 欄應有勾選框')
            assert.ok(await page.locator(SEL_ID_DRAG).count() > 0, '預設編輯模式 id 欄應有拖曳握把')
        },
    },
    {
        //E2E-002：關閉編輯模式 → 工具列新增/複製/刪除/儲存按鈕隱藏、id 欄勾選框與拖曳握把收起（唯讀檢視）
        //一次使用者操作＝點擊前／點擊後兩張（技能 §7.1；2026-09-28 E 試點，原單張 E2E-002-edit-mode）
        name: 'E2E-002-edit-mode',
        stages: ['E2E-002-1-click-edit-mode', 'E2E-002-2-edit-mode'],
        run: async (page) => {
            await gotoTargets(page)
            //點擊前: 「編輯模式」開關(框住開關與標籤文字整顆; 開關列無可見邊界且緊貼標籤, 經 itemsUnionBox fit 外擴文字墨跡, 免紅框壓字)
            const s1 = await captureStableWithBox(page, itemsUnionBox(await editSwitchLoc(page), { fit: true }))
            await toggleEditMode(page)
            //結果: 工具列新增鈕消失、id 欄勾選框與拖曳握把收起(框住工具列上之項目與表格之標頭與各列; 反應橫跨兩處, 相鄰取聯集一框)
            const s2 = await captureStableWithBox(page, [itemsUnionBox(SEL_TOOLBAR, { fit: true }), gridContentBox(SEL_GRID)])
            return [
                { name: 'E2E-002-1-click-edit-mode', buf: s1 },
                { name: 'E2E-002-2-edit-mode', buf: s2 },
            ]
        },
        semantic: async (page) => {
            const cnt = await iconBtn(page, MDI.plus).count()
            assert.equal(cnt, 0, '非編輯模式不應出現新增按鈕')
            //spec E2E-002「id 欄勾選框收起」「勾選與拖曳控制收起」（2026-09-28 補：原未斷言）
            assert.equal(await page.locator(SEL_ID_CHK).count(), 0, '非編輯模式 id 欄不應有勾選框')
            assert.equal(await page.locator(SEL_ID_DRAG).count(), 0, '非編輯模式 id 欄不應有拖曳握把')
        },
    },
    {
        //E2E-003：新增列 → 填唯一路徑式 id + description → 儲存成功 → 寫入 DB（store 同步）
        name: 'E2E-003-add-ok',
        stages: ['E2E-003-1-row-blank', 'E2E-003-2-row-filled', 'E2E-003-3-add-ok'],
        run: async (page) => {
            await gotoTargets(page)
            await clickAdd(page)
            const s1 = await captureStableWithBox(page, rowBoxSel(0))  //階段1：新增空列（填入前）
            await typeIntoCell(page, 0, 'id', 'e2eTest/E003/區塊')
            await typeIntoCell(page, 0, 'description', 'desc-e003')
            const s2 = await captureStableWithBox(page, rowBoxSel(0))  //階段2：填妥 id+description（存檔前）
            await saveAndWaitModal(page)
            const s3 = await captureStableWithBox(page, SEL_MODAL) //階段3：儲存成功結果 modal
            return [
                { name: 'E2E-003-1-row-blank', buf: s1 },
                { name: 'E2E-003-2-row-filled', buf: s2 },
                { name: 'E2E-003-3-add-ok', buf: s3 },
            ]
        },
        semantic: async (page) => {
            await assertModalMsg(page, 'targetSaveTargetsSuccess') //結果 modal 顯示儲存成功
            const t = await page.evaluate(() => (window.$vo.$store.state.targets || []).find((x) => x.id === 'e2eTest/E003/區塊'))
            assert.ok(t, '新標的應寫入 DB（store 同步）')
            //userId / timeCreate 已由後端補為實值（非 {待自動給予} 佔位符）
            assert.ok(t && t.userId && !String(t.userId).startsWith('{'), 'userId 應由後端補實值')
            assert.ok(t && t.timeCreate && !String(t.timeCreate).startsWith('{'), 'timeCreate 應由後端補實值')
            const n = await page.evaluate(() => (window.$vo.$store.state.targets || []).length)
            assert.equal(n, BASE_SEED.length + 1, `DB 應為 base+1（${BASE_SEED.length + 1}）筆`)
        },
    },
    {
        //E2E-004：勾選一既有列 → 複製（複製列 id 自動帶「複製」後綴避重）→ 儲存成功
        name: 'E2E-004-copy-ok',
        stages: ['E2E-004-1-row-checked', 'E2E-004-2-copied', 'E2E-004-3-copy-ok'],
        run: async (page) => {
            await gotoTargets(page)
            await checkRow(page, 0, 'id') //勾選 base seed 第一列（targets 主鍵欄為 id）
            const s1 = await captureStableWithBox(page, rowBoxSel(0))   //階段1：勾選來源列（按複製前）
            await iconBtn(page, MDI.copy).first().click() //複製，複製列插入最首 row 0
            await page.waitForTimeout(700)
            const s2 = await captureStableWithBox(page, rowBoxSel(0))  //階段2：複製出新列（存檔前）
            await saveAndWaitModal(page)
            const s3 = await captureStableWithBox(page, SEL_MODAL) //階段3：儲存成功結果 modal（內已含 waitDrawerReady WDrawer 穩定態防護）
            return [
                { name: 'E2E-004-1-row-checked', buf: s1 },
                { name: 'E2E-004-2-copied', buf: s2 },
                { name: 'E2E-004-3-copy-ok', buf: s3 },
            ]
        },
        semantic: async (page) => {
            await assertModalMsg(page, 'targetSaveTargetsSuccess') //結果 modal 顯示儲存成功
            const n = await page.evaluate(() => (window.$vo.$store.state.targets || []).length)
            assert.equal(n, BASE_SEED.length + 1, `DB 應為 base+1（${BASE_SEED.length + 1}）筆`)
            //複製出的列 id 與來源不同（帶「複製」後綴避重）
            const srcId = BASE_SEED[0].id
            const ids = await page.evaluate(() => (window.$vo.$store.state.targets || []).map((x) => x.id))
            const dup = ids.filter((id) => id !== srcId && id.includes(srcId))
            assert.ok(dup.length >= 1, '應有一列為來源 id 帶後綴的複製列')
        },
    },
    {
        //E2E-005：勾選某列 → 刪除 → 儲存（被權限規則引用者先彈確認框, 按「是」）→ DB 該列消失、權限規則連帶清理（next case 的 resetDb 還原）
        //比照 users pilot E2E-005：直接刪 base seed row 0，靠每 case 前 resetDb 還原（最簡穩）。
        //run06(ADR-036、R-REF-CASCADE-01; spec 流程_後台標的清單 E2E-005): 被刪之 base seed row 0(專案A/頁A/區塊A)為權限 P1 之規則所引用(P1.crules 含該對象之 'y'), 故按儲存後先彈確認框
        //  (confirmSaveDelRefsTarget: 將自 1 個權限的規則移除對該管控對象之設定; n=1 由 base seed 推導: 僅 P1 之 crules 含該對象, 名單為該對象之路徑), 按「是」才送出;
        //  確認框為本輪新增之流程步驟, 標準圖 0 張改變(依派工不重產; 確認框不入圖, 三張圖之畫面皆與舊流程相同: 確認框於 s2 之後、s3 之前開關). 儲存成功之彈窗為原文字(標的頁不改成功訊息), 儲存後 P1 之 crules 被連帶清理(見 semantic)
        name: 'E2E-005-delete-ok',
        stages: ['E2E-005-1-row-checked', 'E2E-005-2-deleted', 'E2E-005-3-delete-ok'],
        run: async (page, lang) => {
            await gotoTargets(page)
            await checkRow(page, 0, 'id') //勾選 base seed 第一列（targets 主鍵欄為 id）
            const s1 = await captureStableWithBox(page, rowBoxSel(0))   //階段1：勾選列（按刪除前）
            await iconBtn(page, MDI.trash).first().click()
            await page.waitForTimeout(500)
            const s2 = await captureStableWithBox(page, gridContentBox(SEL_GRID))  //階段2：刪除後（列已移除、存檔前）
            //儲存前確認框(單一框、否／是): 範本代入 n=1、名單為被刪對象之路徑; 字面片段各語系各給一組(擋範本佔位符對調或筆數寫錯); 按「是」→ 送出, 結果 modal 出現才返回
            await saveConfirmYesAndWaitModal(page, 'E2E-005 儲存確認框', await expTemplate(page, 'confirmSaveDelRefsTarget', { n: 1, list: BASE_SEED[0].id }), lang === 'eng' ? ['from the rules of 1 permission(s)', BASE_SEED[0].id] : ['自 1 個權限的規則', BASE_SEED[0].id])
            const s3 = await captureStableWithBox(page, SEL_MODAL) //階段3：儲存成功結果 modal
            return [
                { name: 'E2E-005-1-row-checked', buf: s1 },
                { name: 'E2E-005-2-deleted', buf: s2 },
                { name: 'E2E-005-3-delete-ok', buf: s3 },
            ]
        },
        semantic: async (page) => {
            await assertModalMsg(page, 'targetSaveTargetsSuccess') //結果 modal 顯示儲存成功
            const delId = BASE_SEED[0].id
            const has = await page.evaluate((id) => (window.$vo.$store.state.targets || []).some((x) => x.id === id), delId)
            assert.ok(!has, `base seed 第一列（${delId}）應已刪除`)
            const n = await page.evaluate(() => (window.$vo.$store.state.targets || []).length)
            assert.equal(n, BASE_SEED.length - 1, `DB 應為 base-1（${BASE_SEED.length - 1}）筆`)
            //spec E2E-005「引用連帶清理」(run06; ADR-036): 刪該標的之同一次寫入內, 引用它之權限 P1 其 crules 被移除該對象之設定, 只剩另兩項('專案A/頁B/區塊A'、'專案A/頁C', 皆 'n', 鍵次序不變;
            //  以資料通道 select 直讀庫, 不依前端同步時序)
            const p1 = (await page.evaluate(async () => await window.$vo.$fapi.pemis.select())).find((x) => x.name === '權限P1')
            assert.ok(p1, '權限P1 應仍在資料庫')
            assert.deepEqual(JSON5.parse(p1.crules), { '專案A/頁B/區塊A': 'n', '專案A/頁C': 'n' }, `刪除 ${delId} 後 P1 之 crules 應已移除該對象之設定（實得 ${p1.crules}）`)
            assert.deepEqual(Object.keys(JSON5.parse(p1.crules)), ['專案A/頁B/區塊A', '專案A/頁C'], '其餘項目之鍵次序不變')
            //—— 權限樹核心不變式（孤兒 target 回歸守護；本專案為權限系統，此為不可省之核心驗證）——
            //delId（BASE_SEED[0] = 專案A/頁A/區塊A）原經 P1.crules 'y' → M1 → peter 而在 peter 解析權限樹內。
            //刪除該 target 後，P1.crules 對它之引用已被連帶清理（ADR-036；舊版為殘留之孤兒引用），getPermUserInfor 解析出的
            //權限樹須只反映「現存 targets」、不含已刪標的——守護 getUserRules expand 段「以當前 targets 為
            //輸出主軸」之修正（讀取端容錯仍適用於清理前之舊資料），防回歸到「已刪 target 仍授權於外部應用」的權限漏洞。
            const peterTree = await getResolvedActiveTargets(page, 'id-for-peter')
            assert.ok(!peterTree.includes(delId), `刪除的 target（${delId}）不應再殘留於 peter 解析權限樹（孤兒不變式）`)
            assert.deepEqual(peterTree, ['專案A/頁C', '專案B/頁A/區塊A', '專案B/頁A/區塊B'], 'peter 樹應只剩刪除後現存的授權標的')
        },
    },
    {
        //E2E-006：就地編輯某列 description → 儲存成功 → DB 該欄更新
        //比照 users pilot E2E-006：直接改 base seed row 0，靠每 case 前 resetDb 還原（最簡穩）。
        name: 'E2E-006-edit-ok',
        stages: ['E2E-006-1-before', 'E2E-006-2-edited', 'E2E-006-3-edit-ok'],
        run: async (page) => {
            await gotoTargets(page)
            const s1 = await captureStableWithBox(page, rowBoxSel(0))  //階段1：就地編輯前（原始狀態）
            await typeIntoCell(page, 0, 'description', 'desc-edited-e006')
            const s2 = await captureStableWithBox(page, rowBoxSel(0))  //階段2：填入新 description 後（存檔前）
            await saveAndWaitModal(page)
            const s3 = await captureStableWithBox(page, SEL_MODAL) //階段3：儲存成功結果 modal
            return [
                { name: 'E2E-006-1-before', buf: s1 },
                { name: 'E2E-006-2-edited', buf: s2 },
                { name: 'E2E-006-3-edit-ok', buf: s3 },
            ]
        },
        semantic: async (page) => {
            await assertModalMsg(page, 'targetSaveTargetsSuccess') //結果 modal 顯示儲存成功
            const editId = BASE_SEED[0].id
            const t = await page.evaluate((id) => (window.$vo.$store.state.targets || []).find((x) => x.id === id), editId)
            assert.ok(t && t.description === 'desc-edited-e006', `${editId} 的 description 應更新為新值`)
        },
    },
    {
        //E2E-007：新增列後清空 id → id 欄警告 icon；Save 時前端 isError 攔截（不送後端）→ errInIds modal。後端 ckKey('id') 為縱深防禦、UI 流程不會觸及
        name: 'E2E-007-id-empty',
        stages: ['E2E-007-1-row-added', 'E2E-007-2-id-empty', 'E2E-007-3-fail-modal'],
        run: async (page) => {
            await gotoTargets(page)
            await clickAdd(page)
            const s1 = await captureStableWithBox(page, rowBoxSel(0)) //階段1：新增列、自動帶入名
            await typeIntoCell(page, 0, 'id', '') //清空 id（清掉自動帶入的「新對象」名）
            assert.ok(await cellHasWarn(page, 0, 'id'), 'id 空應顯示警告 icon（Save 前）')
            const s2 = await captureStableWithBox(page, rowBoxSel(0)) //階段2：id 清空警告、存檔前
            await saveAndWaitModal(page)
            const s3 = await captureStableWithBox(page, SEL_MODAL) //階段3：前端 isError 攔截 modal（errInIds）
            return [
                { name: 'E2E-007-1-row-added', buf: s1 },
                { name: 'E2E-007-2-id-empty', buf: s2 },
                { name: 'E2E-007-3-fail-modal', buf: s3 },
            ]
        },
        semantic: async (page) => {
            await assertModalMsg(page, 'errInIds') //T04 後前端 isError 偵測 id 錯誤（空/重複），存檔前攔截、不送後端，改顯示 errInIds
            const n = await page.evaluate(() => (window.$vo.$store.state.targets || []).length)
            assert.equal(n, BASE_SEED.length, '前端攔截未送出，DB 仍為 base seed 筆數')
        },
    },
    {
        //E2E-008：新增列 id 取既有 target id（重複）→ id 欄警告 icon；Save 時前端 isError 攔截（不送後端）→ errInIds modal。後端 ckKey('id') 為縱深防禦、UI 流程不會觸及
        name: 'E2E-008-id-dup',
        stages: ['E2E-008-1-row-added', 'E2E-008-2-id-dup', 'E2E-008-3-fail-modal'],
        run: async (page) => {
            await gotoTargets(page)
            await clickAdd(page)
            const s1 = await captureStableWithBox(page, rowBoxSel(0)) //階段1：新增列、自動帶入名
            await typeIntoCell(page, 0, 'id', '專案A/頁C') //取 base seed 既有 target id（重複）
            assert.ok(await cellHasWarn(page, 0, 'id'), 'id 重複應顯示警告 icon（Save 前）')
            const s2 = await captureStableWithBox(page, rowBoxSel(0)) //階段2：id 重複警告、存檔前
            await saveAndWaitModal(page)
            const s3 = await captureStableWithBox(page, SEL_MODAL) //階段3：前端 isError 攔截 modal（errInIds）
            return [
                { name: 'E2E-008-1-row-added', buf: s1 },
                { name: 'E2E-008-2-id-dup', buf: s2 },
                { name: 'E2E-008-3-fail-modal', buf: s3 },
            ]
        },
        semantic: async (page) => {
            await assertModalMsg(page, 'errInIds') //T04 後前端 isError 偵測 id 錯誤（空/重複），存檔前攔截、不送後端，改顯示 errInIds
            const n = await page.evaluate(() => (window.$vo.$store.state.targets || []).length)
            assert.equal(n, BASE_SEED.length, '前端攔截未送出，DB 仍為 base seed 筆數')
        },
    },
    {
        //E2E-009：全選所有列 → 刪除使 opt.rows 空 → Save 被前端 core() 擋下（targetAddEmpty）→ 未送後端
        name: 'E2E-009-rows-empty',
        stages: ['E2E-009-1-all-checked', 'E2E-009-2-all-deleted', 'E2E-009-3-empty-modal'],
        run: async (page) => {
            await gotoTargets(page)
            await checkAll(page) //header 全選 checkbox 勾選所有列
            const s1 = await captureStableWithBox(page, gridContentBox(SEL_GRID)) //階段1：全選所有列、刪除前
            await iconBtn(page, MDI.trash).first().click() //刪除全部 → opt.rows 空
            await page.waitForTimeout(500)
            const s2 = await captureStableWithBox(page, gridContentBox(SEL_GRID)) //階段2：清單已空、存檔前
            await saveAndWaitModal(page)
            const s3 = await captureStableWithBox(page, SEL_MODAL) //階段3：targetAddEmpty modal
            return [
                { name: 'E2E-009-1-all-checked', buf: s1 },
                { name: 'E2E-009-2-all-deleted', buf: s2 },
                { name: 'E2E-009-3-empty-modal', buf: s3 },
            ]
        },
        semantic: async (page) => {
            await assertModalMsg(page, 'targetAddEmpty') //前端 core() 擋下，未送後端
            const n = await page.evaluate(() => (window.$vo.$store.state.targets || []).length)
            assert.equal(n, BASE_SEED.length, 'DB 未刪（前端擋存），仍為 base seed 筆數')
        },
    },
    {
        //E2E-010：新增列填妥 → 令 token 失效 → 儲存失敗（DB 不變、未存列仍在前端）
        name: 'E2E-010-save-fail',
        stages: ['E2E-010-1-row-filled', 'E2E-010-2-fail-modal'],
        run: async (page) => {
            await gotoTargets(page)
            await clickAdd(page)
            await typeIntoCell(page, 0, 'id', 'e2eTest/E010/區塊')
            await typeIntoCell(page, 0, 'description', 'desc-e010')
            const s1 = await captureStableWithBox(page, rowBoxSel(0)) //階段1：填妥合法值、token 失效前
            await page.evaluate(() => { window.$vo.$ui.updateUserToken('invalid-token-e010') }) //setup：模擬 token 失效
            await saveAndWaitModal(page) //儲存失敗 → 顯示 CheckYes 失敗 modal（DB 不變）
            const s2 = await captureStableWithBox(page, SEL_MODAL) //階段2：儲存失敗結果 modal
            return [
                { name: 'E2E-010-1-row-filled', buf: s1 },
                { name: 'E2E-010-2-fail-modal', buf: s2 },
            ]
        },
        semantic: async (page) => {
            await assertModalMsg(page, 'targetSaveTargetsFail') //結果 modal 顯示儲存失敗（前綴）
            const has = await page.evaluate(() => (window.$vo.$store.state.targets || []).some((x) => x.id === 'e2eTest/E010/區塊'))
            assert.ok(!has, 'token 失效，標的不應寫入 DB')
            const n = await page.evaluate(() => (window.$vo.$store.state.targets || []).length)
            assert.equal(n, BASE_SEED.length, 'DB 仍為 base seed 筆數')
        },
    },
    {
        //E2E-011：既有標的之路徑(id)就地改為含 HTML 標記者 → Save → 後端寫入前驗證於刪除舊列之前拒絕(htmlMarkupNotAllowed, ADR-026) → 儲存失敗訊息框; 資料庫不變
        //6 步真實路徑: ①管理對象頁(進場路徑見 E2E-001; 預設即編輯模式) ②雙擊第 1 列之路徑儲存格 ③清除後輸入「原路徑<x」並按 Enter
        //  ④點工具列 Save 鈕 ⑤看到儲存失敗訊息框, 原因為不允許之 HTML 標記 ⑥後端: 寫入前驗證於 del 之前拒絕, 原標的仍在、新路徑未寫入
        //修正前(2026-10-14 V7 實測): 訊息框為「Failed to save targets: Cannot connect to server」, 且原標的已被刪除、新路徑被拒(重新進站後 22 → 21 筆)
        //run06(ADR-036; spec 流程_後台標的清單 E2E-011): 改 id 對伺服端等同刪舊增新, 舊 id 為權限 P1 之規則所引用, 故步驟④按儲存後先彈確認框(confirmSaveDelRefsTarget, n=1、名單為舊 id), 按「是」才送出、再被後端拒絕;
        //  確認框為本輪新增之流程步驟, 標準圖 0 張改變(確認框不入圖: 於 s3 之後、s4 之前開關); 被拒時引用端零變更(寫入前驗證先於引用連帶, 見 semantic)
        name: 'E2E-011-markup-id-rejected',
        stages: ['E2E-011-1-type-id', 'E2E-011-2-id-edited', 'E2E-011-3-click-save', 'E2E-011-4-fail-modal'],
        run: async (page, lang) => {
            await gotoTargets(page)
            //點擊前: 要改路徑之第 1 列(框住該列整列, 顯示原路徑)
            const s1 = await captureStableWithBox(page, rowBoxSel(0))
            await typeIntoCell(page, 0, 'id', `${BASE_SEED[0].id}<x`)
            //結果: 第 1 列之路徑已改為原路徑接「<x」(框住該列整列; 尚未儲存)
            const s2 = await captureStableWithBox(page, rowBoxSel(0))
            //點擊前: 工具列 Save 鈕(框住整顆)
            const s3 = await captureStableWithBox(page, iconBtn(page, MDI.upload))
            //儲存前確認框(單一框、否／是; 舊 id＝BASE_SEED[0].id 為 P1 之規則所引用 → n=1、名單為舊 id): 按「是」→ 送出, 結果 modal(此處為失敗訊息框)出現才返回
            await saveConfirmYesAndWaitModal(page, 'E2E-011 儲存確認框', await expTemplate(page, 'confirmSaveDelRefsTarget', { n: 1, list: BASE_SEED[0].id }), lang === 'eng' ? ['from the rules of 1 permission(s)', BASE_SEED[0].id] : ['自 1 個權限的規則', BASE_SEED[0].id])
            //結果: 儲存失敗訊息框(框住訊息框面板, 含訊息與 OK 鈕)
            const s4 = await captureStableWithBox(page, SEL_MODAL)
            return [
                { name: 'E2E-011-1-type-id', buf: s1 },
                { name: 'E2E-011-2-id-edited', buf: s2 },
                { name: 'E2E-011-3-click-save', buf: s3 },
                { name: 'E2E-011-4-fail-modal', buf: s4 },
            ]
        },
        semantic: async (page) => {
            //spec E2E-011「訊息框顯示儲存失敗, 原因為不允許之 HTML 標記」: 前綴 targetSaveTargetsFail + 原因 htmlMarkupNotAllowed(非「無法連線至伺服器」)
            await assertModalMsg(page, 'targetSaveTargetsFail')
            await assertModalMsg(page, 'htmlMarkupNotAllowed')
            //spec E2E-011「原標的仍在、新路徑未寫入」: 以資料通道之 select 直讀資料庫(不依前端同步之時序)
            const ids = await page.evaluate(async () => (await window.$vo.$fapi.targets.select()).map((x) => x.id))
            assert.ok(ids.includes(BASE_SEED[0].id), `原標的 ${BASE_SEED[0].id} 應仍在資料庫`)
            assert.ok(!ids.includes(`${BASE_SEED[0].id}<x`), '含 HTML 標記之新路徑不應寫入')
            assert.equal(ids.length, BASE_SEED.length, '資料庫仍為 base seed 筆數')
            //spec E2E-011「本次之所有變更都不會寫入」(含引用端): 寫入前驗證先於引用連帶之預檢與寫入, 被拒時 P1 之 crules 仍引用原標的(未被連帶清理)
            const p1 = (await page.evaluate(async () => await window.$vo.$fapi.pemis.select())).find((x) => x.name === '權限P1')
            assert.ok(p1 && Object.keys(JSON5.parse(p1.crules)).includes(BASE_SEED[0].id), `被拒時 P1 之 crules 應仍含原標的 ${BASE_SEED[0].id}（引用端零變更）, 實得 ${p1 && p1.crules}`)
        },
    },
]

//單一案例管線（產製端與比對端呼叫同一函數；w-package-tools-e2e runBaselineCase）：
//  launch：每案全新 browser 進程（消除 GPU/font/CSS cache 跨 case 累積造成的 cold/warm 差異；對齊 sso 之 per-case launch）
//  openPage：throwaway page 還原 DB 為 base seed（關閉後再開 case page）→ openApp → setLang（eng 也補等量 settle，治 eng-vs-cht 收斂不對稱）
//  run：流程截圖，回傳「單張 Buffer」或「多階段 [{name, buf}]」，由 runBaselineCase 正規化並核對 stages
//  semantic：語意斷言，寫檔／比對之前執行 → 產製端依 gate 寫檔／比對端 assertBaselineMatch → finally 關瀏覽器
async function runCase(mode, lang, c, extra = {}) {
    return await runBaselineCase({
        mode,
        lang,
        name: c.name,
        run: c.run,
        stages: c.stages,
        launch: launchBrowser,
        openPage: async (browser) => {
            await resetDbTables(browser, [{ key: 'pemis', seed: BASE_PEMIS }]) //引用端先還原(連帶清理之遺留)
            await resetDb(browser, 'targets', BASE_SEED)
            const page = await openApp(browser)
            await setLang(page, lang)
            return page
        },
        semantic: c.semantic ? (ctx) => c.semantic(ctx.page) : null,
        pathOf: picPath,
        labelOf: (lg, key) => `targets-${lg}-${key}`,
        match: assertBaselineMatch,
        ...extra,
    })
}

async function generateBaseline() {
    console.log('=== 產製 targets baseline 開始 ===')
    //截圖前篩選（--names / --langs / --write-mode / E2E_BASELINE_OUT_DIR，見檔頭）；不符任何鍵即於此報錯（啟動服務之前）
    const gate = createBaselineGate({ langs: LANGS, cases: CASES })
    console.log(gate.describe())
    await startServersOnce()
    fs.mkdirSync(PICS_DIR, { recursive: true })
    process.env.E2E_STRICT_CAPTURE = '1' //regen 端：captureStable 未 settle 即 throw，拒絕寫入未穩定畫面
    //擷取 pristine base seed（DB 剛 fresh seed）——用臨時 browser
    { BASE_SEED = await captureBaseSeedOnce('targets'); BASE_PEMIS = await captureBaseSeedOnce('pemis') }
    for (const lang of gate.langs) {
        console.log(`=== 產生標準圖（${lang}）===`)
        for (const c of gate.casesFor(lang)) {
            console.log(`  ${c.name}`)
            await runCase('regen', lang, c, { gate })
        }
    }
    //--names 之任一項未產出即報錯（不靜默略過）
    gate.finalize()
    cleanup()
    console.log('=== 產製 targets baseline 完成 ===')
}

if (isBaseline) {
    generateBaseline().catch((err) => { console.log('baseline 例外', err); cleanup(); process.exit(1) })
}
else {
    for (const lang of LANGS) {
        describe(`e2e-targets (${lang})`, function() {
            this.timeout(180000)
            before(async function() {
                this.timeout(200000)
                await startServersOnce()
                //擷取 BASE_SEED 一次（用臨時 browser）
                if (!BASE_SEED) { BASE_SEED = await captureBaseSeedOnce('targets') }
                if (!BASE_PEMIS) { BASE_PEMIS = await captureBaseSeedOnce('pemis') }
            })
            //檔尾還原 targets 為檔首 base seed(R-E2E-ISO-01): 單一 mocha 行程全跑時最後一案之改動不遺留給下一個檔; 連同引用端 pemis 表(刪除標的之連帶清理, 見 BASE_PEMIS 註解)
            after(async function() {
                this.timeout(120000)
                await restoreDbTablesOnce([{ key: 'pemis', seed: BASE_PEMIS }])
                await restoreDbOnce('targets', BASE_SEED)
            })
            //每案 fresh browser、DB 還原、開頁切語系、語意斷言、關瀏覽器皆在 runCase 內（與產製端同管線；--grep 單跑亦完整）
            for (const c of CASES) {
                it(c.name, async function() {
                    await runCase('compare', lang, c, { onKnownDefect: () => this.skip() }) //已知缺陷協定: 標 pending(提示框殘留已由 w-component-vue 2.5.24 修正, 其偵測改為直接失敗, 見 e2e-setup probeStuckTooltip)
                })
            }
        })
    }

    // =====================================================================================================================
    // run06 引用連帶(ADR-036、規則帳本 R-REF-CASCADE-01): 標的刪除／改 id 之儲存前確認——語意斷言, 不產標準圖(spec 流程_後台標的清單 E2E-012、E2E-013)
    //
    // 標的 id 即名稱, 改 id 對伺服端等同刪舊增新(不級聯): 引用它之權限(pemis.crules)項目於同一次寫入內被連帶清理(刪除亦同); 儲存前若有權限之規則將被清理, 先彈確認框
    //   (confirmSaveDelRefsTarget: {n}＝將被清理之權限數、{list}＝被刪除或改 id 之管控對象, 至多 5 個), 按「否」中止儲存(不送出、編輯與儲存鈕保留), 按「是」才送出; 成功彈窗為原文字(標的頁不改成功訊息).
    // 資料前置以系統管理者寫入 RPC(editTableRows; 夾具標的置於清單最上方——清單頁為虛擬捲動, 只渲染可見列), 每案後還原四表並回驗筆數(R-E2E-ISO-01);
    //   期望之授權樹由 base seed 規則集依 R-AUTH-MERGE-00 推導(OR 聯集、AND 交集), 不抄實測值.
    // =====================================================================================================================
    const T_DEL = '專案R/頁A/區塊D' //夾具: 將被刪除之標的(被 ref-p1 之規則以 'y' 引用)
    const T_KEEP = '專案R/頁A/區塊K' //夾具: 將被改 id 之標的(被 ref-p1 以 'y'、ref-p2 以 'n' 引用)
    const T_KEEP_NEW = '專案R/頁A/區塊K改' //T_KEEP 之新 id(新 id 不繼承舊 id 之引用)
    const T_C = '專案A/頁C' //base seed 標的(P2、P3 以 'y'、P1 以 'n' 引用)
    const T_BB = '專案B/頁A/區塊B' //base seed 標的
    const BASE_UIDS = ['id-for-peter', 'id-for-mary', 'id-for-john', 'id-for-admin']
    const AUDIT = ['userIdUpdate', 'timeUpdate'] //寫入時由伺服器改寫之更新者欄位
    const srt = (a) => a.slice().sort()
    const ON = { mode: 'OR', isActive: 'y' }
    const omitKeys = (o, ks) => Object.fromEntries(Object.entries(o).filter(([k]) => !ks.includes(k)))

    //夾具(依序: 標的 → 權限 → 群組 → 使用者): 標的 T_DEL、T_KEEP; 權限 ref-p1(crules: T_DEL y、T_KEEP y、專案A/頁C y)、ref-p2(crules: T_KEEP n、專案B/頁A/區塊B y)、
    //  ref-p3(crules: 專案A/頁C y; 不引用 T_DEL／T_KEEP, 供「未命中者整列逐位元不動」); 群組 ref-g(OR 引用 ref-p1、ref-p2); 使用者 ref-u(OR 引用 ref-g)——以 ref-u 之授權樹觀察端到端結果
    async function seedRefs() {
        await editTableRows('targets', (rows) => [
            { id: T_DEL, order: 0, description: '引用連帶夾具: 將被刪除', from: '' },
            { id: T_KEEP, order: 0, description: '引用連帶夾具: 將被改 id', from: '' },
            ...rows,
        ])
        await editTableRows('pemis', (rows) => [...rows,
            { id: 'id-ref-p1', order: 0, name: 'ref-p1', description: '', from: '', crules: JSON.stringify({ [T_DEL]: 'y', [T_KEEP]: 'y', [T_C]: 'y' }) },
            { id: 'id-ref-p2', order: 0, name: 'ref-p2', description: '', from: '', crules: JSON.stringify({ [T_KEEP]: 'n', [T_BB]: 'y' }) },
            { id: 'id-ref-p3', order: 0, name: 'ref-p3', description: '', from: '', crules: JSON.stringify({ [T_C]: 'y' }) },
        ])
        await editTableRows('grups', (rows) => [...rows,
            { id: 'id-ref-g', order: 0, name: 'ref-g', description: '', from: '', cpemis: JSON.stringify({ 'ref-p1': ON, 'ref-p2': ON }) },
        ])
        await editTableRows('users', (rows) => [...rows,
            { id: 'id-ref-u', order: 0, name: 'ref-u', email: 'ref-u@example.com', description: '', from: '', cgrups: JSON.stringify({ 'ref-g': ON }), isAdmin: 'n', isActive: 'y' },
        ])
    }

    //四表現況快照(依 id 排序之整列, 含 order／更新者／時間欄; 經資料通道 select, 不經瀏覽器), 供「零變更」與「未命中之列逐位元不動」比對
    async function snapDb() {
        const out = {}
        for (const kt of ['targets', 'pemis', 'grups', 'users']) {
            out[kt] = (await selectAllRows(kt)).slice().sort((a, b) => String(a.id).localeCompare(String(b.id)))
        }
        return out
    }
    function rowOf(rows, id) {
        const r = rows.find((v) => v.id === id)
        assert.ok(r, `應有 ${id}`)
        return r
    }
    //清單主表是否有某 id 之列(id 欄顯示文字)
    async function hasIdCell(page, id) {
        return await page.evaluate((t) => [...document.querySelectorAll('.ag-row[row-index] .ag-cell[col-id="id"]')].some((c) => (c.textContent || '').trim() === t), id)
    }
    //各使用者之端到端授權(外部應用實際查到之啟用標的, 排序後陣列): { userId: [標的…] }
    async function resolvedOf(page, userIds) {
        const out = {}
        for (const id of userIds) {
            out[id] = await getResolvedActiveTargets(page, id)
        }
        return out
    }
    //案例: 開瀏覽器 → 進頁 → 切語系 → fn(page) → finally 關閉
    async function withPageLang(lang, fn) {
        const browser = await launchBrowser()
        try {
            const page = await openApp(browser)
            await setLang(page, lang)
            return await fn(page)
        }
        finally {
            await browser.close().catch(() => {})
        }
    }

    describe('e2e-targets run06 引用連帶: 標的刪除／改 id 之儲存前確認 (ADR-036; 語意斷言, 不產標準圖)', function() {
        this.timeout(300000)

        let snapTables = null

        //案後還原四表並回驗筆數: users／grups／pemis 還原為本段開頭之現況(readTables ↔ restoreTables 對稱), targets 還原為檔首 base seed
        async function restoreAndVerify() {
            await restoreTables(snapTables)
            const res = await callRpc('updateTargets', [BASE_SEED], TOKEN_ADMIN)
            assert.ok(res.ok, `收尾 updateTargets 應成功, 實得 ${JSON.stringify(res).slice(0, 200)}`)
            const t = await readTables()
            assert.deepEqual([t.users.length, t.grups.length, t.pemis.length, (await selectAllRows('targets')).length], [4, 4, 4, BASE_SEED.length], '收尾後四表筆數須回到 base seed')
        }

        before(async function() {
            this.timeout(400000)
            await startServersOnce()
            if (!BASE_SEED) { BASE_SEED = await captureBaseSeedOnce('targets') }
            snapTables = await readTables()
            assert.deepEqual([snapTables.users.length, snapTables.grups.length, snapTables.pemis.length], [4, 4, 4], '前提: 本段開頭為 base seed(前段已還原)')
        })

        after(async function() {
            this.timeout(120000)
            if (snapTables && BASE_SEED) {
                await restoreAndVerify()
            }
        })

        // ----- E2E-012: 刪除 T_DEL 並把 T_KEEP 改 id → 儲存前確認(按否中止、按是送出) -----
        for (const lang of LANGS) {
            it(`E2E-012-save-confirm [${lang}]: (spec 流程_後台標的清單 E2E-012) 刪除被兩個權限規則引用之 T-del 並把 T-keep 改 id 後按儲存 → 確認框(confirmSaveDelRefsTarget: 2 個權限、名單含 T-del 與 T-keep 舊 id); 按否不送出(DB 零變更、編輯與儲存鈕保留); 再儲存按是 → 成功彈窗為原文字(targetSaveTargetsSuccess)、兩權限之 crules 已移除 T-del 與舊 id 項目(其餘項目逐字不動)、授權樹只失去這兩個標的、新 id 不繼承`, async function() {
                await seedRefs()
                try {
                    await withPageLang(lang, async (page) => {
                        //6 步 user path: ①標的頁(進場路徑見 E2E-001; 預設即編輯模式) ②勾選 T-del 列、點「刪除勾選對象」 ③雙擊 T-keep 之 id 儲存格改為新 id(Enter) ④按儲存 ⑤看到確認框(權限數、名單) → 按否/再儲存按是 ⑥看到成功彈窗, DB 與授權符合
                        const want0 = srt([T_DEL, T_KEEP, T_C, T_BB]) //ref-u = ref-g(OR: ref-p1 ∪ ref-p2); ref-p1 啟用 {T_DEL, T_KEEP, T_C}、ref-p2 啟用 {T_BB}(T_KEEP 為 'n')
                        assert.deepEqual(await getResolvedActiveTargets(page, 'id-ref-u'), want0, '儲存前 ref-u 之授權(由夾具規則集推導)')
                        const auth0 = await resolvedOf(page, BASE_UIDS)
                        const db0 = await snapDb()
                        assert.strict.equal(db0.targets.length, BASE_SEED.length + 2, '前提: 夾具標的 2 筆已寫入')
                        await gotoTargets(page)
                        //刪除 T-del(清單最上方第 1 列; 刪除當下不彈框, 要按儲存才送出)
                        await checkRow(page, await rowIndexByCell(page, 'id', T_DEL), 'id')
                        await iconBtn(page, MDI.trash).first().click()
                        await page.waitForTimeout(500)
                        assert.strict.equal(await hasIdCell(page, T_DEL), false, '刪除後清單已無 T-del 列')
                        //改 T-keep 之 id(刪除後該列上移, 依顯示文字重找列)
                        await typeIntoCell(page, await rowIndexByCell(page, 'id', T_KEEP), 'id', T_KEEP_NEW)
                        assert.strict.equal(await hasIdCell(page, T_KEEP_NEW), true, 'T-keep 之 id 已改為新 id')
                        assert.strict.equal(await pageSaveShown(page), true, '刪除與改 id 後清單頁出現儲存鈕(已修改)')
                        await clickSave(page)
                        //確認框: 受影響之權限為 ref-p1、ref-p2 共 2 個(ref-p3 未引用而不計; ref-p2 以 'n' 引用亦計入); 名單為被刪除之 T-del 與被改 id 之 T-keep(舊 id)——兩者之排列次序不是本案要驗之事, 任一次序皆可
                        const cands = [await expTemplate(page, 'confirmSaveDelRefsTarget', { n: 2, list: `${T_DEL}, ${T_KEEP}` }), await expTemplate(page, 'confirmSaveDelRefsTarget', { n: 2, list: `${T_KEEP}, ${T_DEL}` })]
                        const frags = lang === 'eng' ? ['from the rules of 2 permission(s)', T_DEL, T_KEEP] : ['自 2 個權限的規則', T_DEL, T_KEEP]
                        const msg = await expectConfirmBox(page, '儲存確認框', cands, frags)
                        assert.ok(!msg.includes(T_KEEP_NEW), '名單列舊 id, 不列新 id')
                        //按否: 中止儲存、不送出; 資料與已修改狀態保留
                        await clickModalBtn(page, 'no')
                        await waitModalGone(page, '確認框(否)關閉', msg)
                        assert.deepEqual(await topModalLines(page), [], '按否後無任何彈窗(未送出, 無成功／失敗訊息)')
                        assert.deepEqual(await snapDb(), db0, '按否: 不送出, 四表零變更')
                        assert.strict.equal(await hasIdCell(page, T_DEL), false, '按否後清單仍無 T-del 列(刪除保留)')
                        assert.strict.equal(await hasIdCell(page, T_KEEP_NEW), true, '按否後清單仍為已改之新 id')
                        assert.strict.equal(await pageSaveShown(page), true, '按否後儲存鈕仍在(isModified 保留)')
                        //再儲存、按是: 送出
                        const msg2 = await saveConfirmYesAndWaitModal(page, '儲存確認框(第二次)', cands, frags)
                        assert.strict.equal(msg2, msg, '兩次確認框文字相同')
                        //成功彈窗為原文字(單一訊息＋確認鈕; 標的頁不改成功訊息, 被清理之權限數已於確認框告知)
                        await expectResultBox(page, '成功彈窗', await page.evaluate(() => window.$vo.$t('targetSaveTargetsSuccess')))
                        await dismissResultModal(page)
                        assert.strict.equal(await pageSaveShown(page), false, '儲存成功後儲存鈕消失')
                        const after = await snapDb()
                        //標的: T-del、T-keep 已消失, 新 id 已寫入(沿用該列之說明), 筆數 = 夾具後 24 − 1(刪除)= 23; 其餘 base seed 標的內容不動(整表寫入依新位置重給 order 並改寫更新時間, 故不比這兩類欄位)
                        const ids = after.targets.map((v) => v.id)
                        assert.ok(!ids.includes(T_DEL) && !ids.includes(T_KEEP), 'DB: T-del 與 T-keep(舊 id)已消失')
                        assert.ok(ids.includes(T_KEEP_NEW), 'DB: 新 id 已寫入')
                        assert.strict.equal(after.targets.length, db0.targets.length - 1, 'DB: 標的筆數 = 儲存前 − 1')
                        assert.strict.equal(rowOf(after.targets, T_KEEP_NEW).description, rowOf(db0.targets, T_KEEP).description, '新 id 之列沿用原列之說明')
                        for (const b of BASE_SEED) {
                            assert.deepEqual(omitKeys(rowOf(after.targets, b.id), ['order', ...AUDIT]), omitKeys(rowOf(db0.targets, b.id), ['order', ...AUDIT]), `base seed 標的 ${b.id} 內容不動`)
                        }
                        //引用連帶清理: ref-p1 之 crules 移除 T-del 與 T-keep(舊 id)兩項, 只剩 專案A/頁C; ref-p2 移除 T-keep(舊 id; 以 'n' 引用者亦被清理), 只剩 專案B/頁A/區塊B; 其餘項目與鍵次序不變
                        assert.deepEqual(JSON.parse(rowOf(after.pemis, 'id-ref-p1').crules), { [T_C]: 'y' }, 'ref-p1 之 crules 只剩 專案A/頁C')
                        assert.deepEqual(JSON.parse(rowOf(after.pemis, 'id-ref-p2').crules), { [T_BB]: 'y' }, 'ref-p2 之 crules 只剩 專案B/頁A/區塊B')
                        //未命中者整列逐位元不動(含 crules 字串與更新時間): ref-p3 與 base seed 四個權限; grups／users 兩表整表不動
                        for (const p of after.pemis.filter((v) => !['id-ref-p1', 'id-ref-p2'].includes(v.id))) {
                            assert.deepEqual(p, rowOf(db0.pemis, p.id), `權限 ${p.name} 未引用被刪或改 id 之標的: 整列逐位元不動`)
                        }
                        assert.deepEqual(after.grups, db0.grups, 'grups 表不動')
                        assert.deepEqual(after.users, db0.users, 'users 表不動')
                        //端到端不變式(外部應用實際查到之授權樹): ref-u 只失去 T-del 與 T-keep 兩個標的, 新 id 不繼承舊 id 之引用; 與本次無關之 base seed 四位使用者逐位相同
                        const treeU = await getResolvedActiveTargets(page, 'id-ref-u')
                        assert.deepEqual(treeU, srt([T_C, T_BB]), '儲存後 ref-u 之授權只剩 專案A/頁C、專案B/頁A/區塊B')
                        assert.ok(!treeU.includes(T_KEEP_NEW), '新 id 不繼承舊 id 之引用, 不在 ref-u 之授權樹內')
                        assert.deepEqual(await resolvedOf(page, BASE_UIDS), auth0, '儲存前後 base seed 使用者之授權逐位相同')
                    })
                }
                finally {
                    await restoreAndVerify()
                }
            })
        }

        // ----- E2E-013: 無權限引用之標的刪除／改 id → 儲存不彈確認框 -----
        for (const lang of LANGS) {
            it(`E2E-013-save-noconfirm [${lang}]: (spec 流程_後台標的清單 E2E-013) 刪除無權限引用之標的並把另一個無引用之標的改 id 後按儲存 → 不彈確認框、直接顯示原成功彈窗(targetSaveTargetsSuccess); 該二標的之變更寫入、權限／群組／使用者三表逐位元不動(未引用者不被連帶改寫)、授權不變`, async function() {
                //夾具: 不另造資料, 取 base seed 中無任何權限規則引用之兩個標的(前提於下以規則集斷言, 免種子漂移使本案失去「無引用」之意義)
                const T_FREE_DEL = '專案A/頁A/區塊A/執行按鈕'
                const T_FREE_REN = '專案A/頁A/區塊A/分析按鈕'
                const T_FREE_NEW = `${T_FREE_REN}改`
                try {
                    await withPageLang(lang, async (page) => {
                        //6 步 user path: ①標的頁 ②勾選 T-free-del 列、點「刪除勾選對象」 ③雙擊 T-free-ren 之 id 儲存格改為新 id(Enter) ④按儲存 ⑤看到成功彈窗(沒有確認框) ⑥DB 與授權符合
                        const db0 = await snapDb()
                        for (const p of db0.pemis) {
                            const keys = Object.keys(JSON5.parse(p.crules))
                            assert.ok(!keys.includes(T_FREE_DEL) && !keys.includes(T_FREE_REN), `前提: 權限 ${p.name} 之規則不引用 ${T_FREE_DEL}／${T_FREE_REN}`)
                        }
                        const auth0 = await resolvedOf(page, BASE_UIDS)
                        await gotoTargets(page)
                        await checkRow(page, await rowIndexByCell(page, 'id', T_FREE_DEL), 'id')
                        await iconBtn(page, MDI.trash).first().click()
                        await page.waitForTimeout(500)
                        await typeIntoCell(page, await rowIndexByCell(page, 'id', T_FREE_REN), 'id', T_FREE_NEW)
                        assert.strict.equal(await pageSaveShown(page), true, '刪除與改 id 後清單頁出現儲存鈕(已修改)')
                        await clickSave(page)
                        //不點任何鈕即出現成功彈窗 ⇒ 未彈確認框(確認框會停住儲存流程直到按鈕); 彈窗形狀為單一訊息＋確認鈕(非否／是), 訊息逐字為原成功文字
                        await expectResultBox(page, '成功彈窗(無確認框)', await page.evaluate(() => window.$vo.$t('targetSaveTargetsSuccess')))
                        await dismissResultModal(page)
                        assert.strict.equal(await pageSaveShown(page), false, '儲存成功後儲存鈕消失')
                        const after = await snapDb()
                        const ids = after.targets.map((v) => v.id)
                        assert.ok(!ids.includes(T_FREE_DEL) && !ids.includes(T_FREE_REN), 'DB: 被刪之標的與被改 id 之舊 id 已消失')
                        assert.ok(ids.includes(T_FREE_NEW), 'DB: 新 id 已寫入')
                        assert.strict.equal(after.targets.length, db0.targets.length - 1, 'DB: 標的筆數 = 儲存前 − 1')
                        //無權限引用 ⇒ 引用端三表整表逐位元不動(含更新者與更新時間: 未引用者不被連帶改寫)
                        assert.deepEqual(after.pemis, db0.pemis, 'pemis 表不動')
                        assert.deepEqual(after.grups, db0.grups, 'grups 表不動')
                        assert.deepEqual(after.users, db0.users, 'users 表不動')
                        assert.deepEqual(await resolvedOf(page, BASE_UIDS), auth0, '儲存前後各使用者之授權逐位相同')
                    })
                }
                finally {
                    await restoreAndVerify()
                }
            })
        }
    })
}
