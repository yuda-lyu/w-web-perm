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
//targets 與 users 差異：主鍵為 id（路徑式字串）、無 name / email / isActive / 關聯欄；
//checkbox 與警告 icon 皆在 col-id="id"；save 結果走 $dg.showCheckYes 持久 modal。
import fs from 'fs'
import assert from 'assert'
import { startServersOnce, cleanup, launchBrowser, openApp, captureStableWithBox, rowBoxSel, waitUntilExist, getResolvedActiveTargets, assertBaselineMatch, typeIntoCell, captureBaseSeed, resetDb, clickNavItem, setLang, MDI, iconBtn, checkRow, toggleEditMode, editSwitchLoc, clickAdd, cellHasWarn, clickSave, saveAndWaitModal, assertModalMsg } from './tools/e2e-setup.mjs'
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
        //E2E-005：勾選某列 → 刪除 → 儲存 → DB 該列消失（next case 的 resetDb 還原）
        //比照 users pilot E2E-005：直接刪 base seed row 0，靠每 case 前 resetDb 還原（最簡穩）。
        name: 'E2E-005-delete-ok',
        stages: ['E2E-005-1-row-checked', 'E2E-005-2-deleted', 'E2E-005-3-delete-ok'],
        run: async (page) => {
            await gotoTargets(page)
            await checkRow(page, 0, 'id') //勾選 base seed 第一列（targets 主鍵欄為 id）
            const s1 = await captureStableWithBox(page, rowBoxSel(0))   //階段1：勾選列（按刪除前）
            await iconBtn(page, MDI.trash).first().click()
            await page.waitForTimeout(500)
            const s2 = await captureStableWithBox(page, gridContentBox(SEL_GRID))  //階段2：刪除後（列已移除、存檔前）
            await saveAndWaitModal(page)
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
            //—— 權限樹核心不變式（孤兒 target 回歸守護；本專案為權限系統，此為不可省之核心驗證）——
            //delId（BASE_SEED[0] = 專案A/頁A/區塊A）原經 P1.crules 'y' → M1 → peter 而在 peter 解析權限樹內。
            //刪除該 target 後，即使 P1.crules 仍殘留對它的引用（未連動清除），getPermUserInfor 解析出的
            //權限樹須只反映「現存 targets」、剔除此孤兒——守護 getUserRules expand 段「以當前 targets 為
            //輸出主軸」之修正，防回歸到「已刪 target 仍授權於外部應用」的權限漏洞。
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
    { const b = await launchBrowser(); const pp = await openApp(b); BASE_SEED = await captureBaseSeed(pp, 'targets'); await b.close() }
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
                if (!BASE_SEED) { const b = await launchBrowser(); const pp = await openApp(b); BASE_SEED = await captureBaseSeed(pp, 'targets'); await b.close() }
            })
            //每案 fresh browser、DB 還原、開頁切語系、語意斷言、關瀏覽器皆在 runCase 內（與產製端同管線；--grep 單跑亦完整）
            for (const c of CASES) {
                it(c.name, async function() {
                    await runCase('compare', lang, c, { onKnownDefect: () => this.skip() }) //已知缺陷協定: 標 pending(提示框殘留已由 w-component-vue 2.5.24 修正, 其偵測改為直接失敗, 見 e2e-setup probeStuckTooltip)
                })
            }
        })
    }
}
