//後台使用者清單 e2e（pilot）。對應 spec/流程_後台使用者清單.md。
//雙模式：
//  - 產 baseline：node test/e2e-users.test.mjs --baseline （寫 test/pics/users/）
//  - 驗證（mocha）：npx mocha test/e2e-users.test.mjs --reporter list （pixelmatch 反鋸齒感知 + maxDiffPixels 容差比對，非 byte-exact）
//  手術式重產（截圖前篩選，規格詳 w-package-tools-e2e 之 README.md §2.2；不符任何鍵即於啟動服務前報錯並列出可用鍵）：
//    --names <項,...>  每項可帶語系前綴（eng-/cht-），不帶則兩語系皆產；階段圖鍵（如 eng-E2E-003-2-row-filled）只寫該張；
//                      案例鍵或其編號前綴（如 E2E-003-add-save、E2E-003）寫該案全部階段
//    --langs <eng,cht> 限語系（須完全等於已宣告語系）
//    --write-mode missing|changed  只寫標準圖缺少者（追加案例）／只寫與現行標準圖差異超過容差者（預設 all 全寫）
//    env E2E_BASELINE_OUT_DIR=<dir>  寫到暫存目錄（等價驗證用，不動 test/pics）
//  產製端與比對端呼叫同一案例管線（runBaselineCase，見 runCase）：每案 fresh browser → throwaway page 還原 DB 為 base seed →
//  （需特殊 settings 之案例換後端設定）→ 開頁切語系 → 流程截圖 → 語意斷言（兩端皆於寫檔／比對之前；不過則該案一張都不寫）→
//  產製端依篩選寫檔／比對端比對標準圖 → 還原預設 settings。
//act 走 user-facing input；assert = 語意斷言 + pixel baseline（§6.2 / §6.3）。
import fs from 'fs'
import assert from 'assert'
import { startServersOnce, cleanup, launchBrowser, openApp, captureStableWithBox, rowBoxSel, dialogRowBoxSel, waitUntilExist, assertBaselineMatch, typeIntoCell, captureBaseSeed, resetDb, restartBackend, genTempSettings, toggleDialogEnable, clickDialogSave, waitDialogGrid, waitDialogClosed, setLang, MDI, iconBtn, gotoUsers, checkRow, toggleEditMode, editSwitchLoc, clickAdd, cellHasWarn, clickSave, saveAndWaitModal, assertModalMsg } from './tools/e2e-setup.mjs'
import { runBaselineCase, createBaselineGate, gridContentBox, itemsUnionBox } from './tools/e2eLib.mjs'

const PICS_DIR = './test/pics/users'
const LANGS = ['eng', 'cht']
const isBaseline = process.argv.includes('--baseline')

//紅框標注目標（captureStableWithBox）：本 case 主要觀看區
//框實際有內容者（技能 §7.2、§7.3-2；2026-09-28 改：原框表格外框與整條工具列，列少時框進大片空白、工具列右側約 1000px 空白）：
//表格經 gridContentBox 取標頭＋可見資料列；工具列經 itemsUnionBox fit 取其上項目（編輯開關、欄位挑選等）之聯集
const SEL_GRID = '.ag-root-wrapper'                                            //清單 / grid 內容區
const SEL_MODAL = 'div[style*="overscroll-behavior"] div[tabindex="0"] > div'  //WDialog 結果 modal / Ve 對話框
const SEL_TOOLBAR = '[data-fmid="users-toolbar"]'                              //功能區工具列
const SEL_NAME_CHK = '.ag-row .ag-cell[col-id="name"] input[type="checkbox"]'  //名稱欄列勾選框（可編身分時才有）
const SEL_NAME_DRAG = '.ag-row .ag-cell[col-id="name"] .ag-row-drag:visible'   //名稱欄拖曳握把（ag-grid rowDrag，可編身分時才有）
//各列 isAdmin／isActive 勾選框（Users.vue 以 :disabled="!isEditableIdentity" 控制；同 E2E-012 語意斷言之選擇器）
const SEL_ROLE_CHKS = '.ag-row .ag-cell[col-id="isAdmin"] input[type="checkbox"], .ag-row .ag-cell[col-id="isActive"] input[type="checkbox"]'

function picPath(lang, name) { return `${PICS_DIR}/users-${lang}-${name}.png` }

//設定語系（test setup 層，非 act-under-test；對齊雙語覆蓋維度）：setLang 自 e2e-setup.mjs import（原本檔內一份，與 setup 版
//token 逐字相同、僅排版不同，2026-09-28 收斂）。
//對齊 sso：cht 走語系切換（等同 perm UI 語言選單的 $ui.setLang）；eng 為預設不切，但**補等同的 settle
//buffer**（600ms），使 eng/cht 在 captureStable 前有對稱的 layout settle 時間 → 治 eng-vs-cht 收斂不對稱（sso
//e2e-adduser 殷鑑「eng 補 buffer 對稱 cht setLang 時間」）。NOT setLang('eng')（那會多觸發一次 re-render，非 sso 做法）。

//gotoUsers／checkRow（colId 預設 'name'）／toggleEditMode／clickAdd／cellHasWarn／clickSave／saveAndWaitModal／
//assertModalMsg：本檔原各自一份，與 e2e-setup.mjs 匯出版逐字相同，2026-09-28 收斂並改 import（見檔頭 import 清單）。
//icon 按鈕（MDI＋iconBtn）與 typeIntoCell／captureBaseSeed／resetDb 之收斂見下方沿用之既有註解。

//—— DB 衛生 helpers ——
//pristine 4 筆 base seed（含全欄位），每 case 前還原 DB，使跨 case／跨語系可重現
let BASE_SEED = null
//captureBaseSeed(page,'users') / resetDb(browser,'users',seed) 收斂進 e2e-setup.mjs 共用
//（原本 grups/pemis/rela-grup-pemi/rela-pemi-rule/rela-user-grup/targets/users 七檔重複定義）。

//case 定義（順序＝產製順序＝mocha it 順序；非編號序，照原檔）：stages 為該案產出之全部圖鍵（與寫檔名、比對名一致，產出與宣告
//不符即報錯；單張案例＝[name]）；settings 為該案需之後端設定覆寫（見 runCase）；run(page,lang) 走流程並回傳截圖 buffer；
//semantic(page) 為語意斷言，產製端與比對端皆於寫檔／比對之前執行
const CASES = [
    {
        name: 'E2E-001-list-view',
        stages: ['E2E-001-list-view'],
        run: async (page) => {
            await gotoUsers(page)
            return await captureStableWithBox(page, gridContentBox(SEL_GRID)) //觀看區：使用者清單 grid
        },
        semantic: async (page) => {
            const txt = await page.evaluate(() => document.body.innerText)
            assert.ok(txt.includes('admin'), '應顯示 seed 使用者 admin')
            assert.ok(txt.includes('peter') && txt.includes('mary') && txt.includes('john'), '應顯示 4 筆 base seed 使用者')
            //spec E2E-001：預設編輯模式下工具列顯示新增按鈕（2026-09-28 補：spec 原載相反敘述而本案未斷言）
            assert.ok(await iconBtn(page, MDI.plus).count() > 0, '預設編輯模式工具列應顯示新增按鈕')
            //spec E2E-001「name 欄具勾選與拖曳控制」（2026-09-28 補；亦為 E2E-002 反向斷言之選擇器正向校驗）
            assert.ok(await page.locator(SEL_NAME_CHK).count() > 0, '預設編輯模式名稱欄應有勾選框')
            assert.ok(await page.locator(SEL_NAME_DRAG).count() > 0, '預設編輯模式名稱欄應有拖曳握把')
            //E2E-002「isAdmin / isActive checkbox 轉為 disabled」之對照：預設編輯模式下皆可點（2026-09-28 補）
            const roleChks = await page.locator(SEL_ROLE_CHKS).evaluateAll((es) => es.map((e) => e.disabled))
            assert.ok(roleChks.length > 0 && roleChks.every((d) => !d), `預設編輯模式 isAdmin / isActive 勾選應皆可點（實得 disabled=${JSON.stringify(roleChks)}）`)
        },
    },
    {
        //E2E-011：點某列 cgrups 欄按鈕開啟群組關聯對話框（VeCgrups）。僅驗本流程可觀察事實：對話框出現。
        name: 'E2E-011-cgrups-dialog',
        stages: ['E2E-011-1-source-row', 'E2E-011-2-dialog-open'],
        run: async (page) => {
            await gotoUsers(page)
            const s1 = await captureStableWithBox(page, rowBoxSel(0)) //階段1：來源列（點按鈕前）
            //點第 1 列 cgrups 欄按鈕（結構 selector：ag-grid col-id）
            await page.locator('.ag-row[row-index="0"] .ag-cell[col-id="cgrups"] button').first().click()
            //等 VeCgrups 對話框（以其標題 userEditCgrups 偵測）
            await waitUntilExist(page, 'VeCgrups 對話框標題', () => {
                const vo = window.$vo
                const label = vo.$t('userEditCgrups')
                return (document.body.innerText || '').includes(label)
            }, { timeout: 15000 })
            await page.waitForTimeout(800)
            const s2 = await captureStableWithBox(page, SEL_MODAL) //階段2：對話框開啟
            return [
                { name: 'E2E-011-1-source-row', buf: s1 },
                { name: 'E2E-011-2-dialog-open', buf: s2 },
            ]
        },
        semantic: async (page) => {
            const label = await page.evaluate(() => window.$vo.$t('userEditCgrups'))
            const txt = await page.evaluate(() => document.body.innerText)
            assert.ok(txt.includes(label), `對話框標題應顯示 (${label})`)
        },
    },
    {
        //E2E-002：關閉編輯模式 → 工具列新增/刪除/儲存按鈕隱藏、名稱欄勾選框與拖曳握把消失、isAdmin/isActive 勾選禁用（唯讀檢視）
        //一次使用者操作＝點擊前／點擊後兩張（技能 §7.1；2026-09-28 E 試點，原單張 E2E-002-edit-mode-off）
        name: 'E2E-002-edit-mode-off',
        stages: ['E2E-002-1-click-edit-mode', 'E2E-002-2-edit-mode-off'],
        run: async (page) => {
            await gotoUsers(page)
            //點擊前: 「編輯模式」開關(框住開關與標籤文字整顆; 開關列無可見邊界且緊貼標籤, 經 itemsUnionBox fit 外擴文字墨跡, 免紅框壓字)
            const s1 = await captureStableWithBox(page, itemsUnionBox(await editSwitchLoc(page), { fit: true }))
            await toggleEditMode(page)
            //結果: 工具列新增鈕消失、名稱欄勾選框與拖曳握把消失、isAdmin/isActive 勾選轉灰(框住工具列上之項目與表格之標頭與各列; 反應橫跨兩處, 相鄰取聯集一框)
            const s2 = await captureStableWithBox(page, [itemsUnionBox(SEL_TOOLBAR, { fit: true }), gridContentBox(SEL_GRID)])
            return [
                { name: 'E2E-002-1-click-edit-mode', buf: s1 },
                { name: 'E2E-002-2-edit-mode-off', buf: s2 },
            ]
        },
        semantic: async (page) => {
            const cnt = await iconBtn(page, MDI.plus).count()
            assert.equal(cnt, 0, '非編輯模式不應出現新增按鈕')
            //spec E2E-002「name 欄轉為唯讀」「isAdmin / isActive checkbox 轉為 disabled」（2026-09-28 補：原未斷言）
            assert.equal(await page.locator(SEL_NAME_CHK).count(), 0, '非編輯模式名稱欄不應有勾選框')
            assert.equal(await page.locator(SEL_NAME_DRAG).count(), 0, '非編輯模式名稱欄不應有拖曳握把')
            const roleChks = await page.locator(SEL_ROLE_CHKS).evaluateAll((es) => es.map((e) => e.disabled))
            assert.ok(roleChks.length > 0 && roleChks.every((d) => d), `非編輯模式 isAdmin / isActive 勾選應皆 disabled（實得 ${JSON.stringify(roleChks)}）`)
        },
    },
    {
        //E2E-007：新增列後清空 name → name 欄警告 icon（email 給合法值以隔離為 name 錯誤）
        name: 'E2E-007-name-empty',
        stages: ['E2E-007-1-row-added', 'E2E-007-2-name-empty'],
        run: async (page) => {
            await gotoUsers(page)
            await clickAdd(page)
            const s1 = await captureStableWithBox(page, rowBoxSel(0)) //階段1：新增列、自動帶入名、填入前
            await typeIntoCell(page, 0, 'email', 'newuser-e007@test.com')
            await typeIntoCell(page, 0, 'name', '') //清空 name
            const s2 = await captureStableWithBox(page, rowBoxSel(0)) //階段2：email 合法 + name 清空警告
            return [
                { name: 'E2E-007-1-row-added', buf: s1 },
                { name: 'E2E-007-2-name-empty', buf: s2 },
            ]
        },
        semantic: async (page) => {
            assert.ok(await cellHasWarn(page, 0, 'name'), 'name 空應顯示警告 icon')
            const n = await page.evaluate(() => (window.$vo.$store.state.users || []).length)
            assert.equal(n, 4, '未儲存，DB 仍為 4 筆 base seed')
        },
    },
    {
        //E2E-008：新增列 email 填非法格式 → email 欄警告 icon
        name: 'E2E-008-email-format',
        stages: ['E2E-008-1-row-added', 'E2E-008-2-email-format'],
        run: async (page) => {
            await gotoUsers(page)
            await clickAdd(page)
            const s1 = await captureStableWithBox(page, rowBoxSel(0)) //階段1：新增列、填入前
            await typeIntoCell(page, 0, 'email', 'notanemail')
            const s2 = await captureStableWithBox(page, rowBoxSel(0)) //階段2：email 非法格式警告
            return [
                { name: 'E2E-008-1-row-added', buf: s1 },
                { name: 'E2E-008-2-email-format', buf: s2 },
            ]
        },
        semantic: async (page) => {
            assert.ok(await cellHasWarn(page, 0, 'email'), 'email 格式錯應顯示警告 icon')
        },
    },
    {
        //E2E-009：新增列 email 填既有 email → email 欄警告 icon（重複）
        name: 'E2E-009-email-dup',
        stages: ['E2E-009-1-row-added', 'E2E-009-2-email-dup'],
        run: async (page) => {
            await gotoUsers(page)
            await clickAdd(page)
            const s1 = await captureStableWithBox(page, rowBoxSel(0)) //階段1：新增列、填入前
            await typeIntoCell(page, 0, 'email', 'peter@example.com')
            const s2 = await captureStableWithBox(page, rowBoxSel(0)) //階段2：email 重複警告
            return [
                { name: 'E2E-009-1-row-added', buf: s1 },
                { name: 'E2E-009-2-email-dup', buf: s2 },
            ]
        },
        semantic: async (page) => {
            assert.ok(await cellHasWarn(page, 0, 'email'), 'email 重複應顯示警告 icon')
        },
    },
    {
        //E2E-003：新增列 → 填唯一 name + 合法唯一 email → 儲存成功 → 寫入 DB（store 同步）
        name: 'E2E-003-add-save',
        stages: ['E2E-003-1-row-blank', 'E2E-003-2-row-filled', 'E2E-003-3-add-save'],
        run: async (page) => {
            await gotoUsers(page)
            await clickAdd(page)
            const s1 = await captureStableWithBox(page, rowBoxSel(0))  //階段1：新增空列（填入前）
            await typeIntoCell(page, 0, 'name', 'NewUserE003')
            await typeIntoCell(page, 0, 'email', 'newuser-e003@test.com')
            const s2 = await captureStableWithBox(page, rowBoxSel(0))  //階段2：填妥 name+email（存檔前）
            await saveAndWaitModal(page)
            const s3 = await captureStableWithBox(page, SEL_MODAL) //階段3：儲存成功結果 modal
            return [
                { name: 'E2E-003-1-row-blank', buf: s1 },
                { name: 'E2E-003-2-row-filled', buf: s2 },
                { name: 'E2E-003-3-add-save', buf: s3 },
            ]
        },
        semantic: async (page) => {
            await assertModalMsg(page, 'userSaveUsersSuccess') //結果 modal 顯示儲存成功
            const has = await page.evaluate(() => (window.$vo.$store.state.users || []).some((u) => u.email === 'newuser-e003@test.com'))
            assert.ok(has, '新使用者應寫入 DB（store 同步）')
            const n = await page.evaluate(() => (window.$vo.$store.state.users || []).length)
            assert.equal(n, 5, 'DB 應為 5 筆（4 base + 新增）')
        },
    },
    {
        //E2E-006：點某列 isActive checkbox 切換 → 儲存成功 → DB 該欄更新
        name: 'E2E-006-toggle-isactive-save',
        stages: ['E2E-006-1-toggled', 'E2E-006-2-toggle-isactive-save'],
        run: async (page) => {
            await gotoUsers(page)
            await page.locator('.ag-row[row-index="0"] .ag-cell[col-id="isActive"] input[type="checkbox"]').first().click()
            await page.waitForTimeout(500)
            const s1 = await captureStableWithBox(page, rowBoxSel(0))  //階段1：toggle isActive 後（存檔前）
            await saveAndWaitModal(page)
            const s2 = await captureStableWithBox(page, SEL_MODAL) //階段2：儲存成功結果 modal
            return [
                { name: 'E2E-006-1-toggled', buf: s1 },
                { name: 'E2E-006-2-toggle-isactive-save', buf: s2 },
            ]
        },
        semantic: async (page) => {
            await assertModalMsg(page, 'userSaveUsersSuccess') //結果 modal 顯示儲存成功
            //row 0 = peter（依 order 排序最前）；isActive 由 y 切為 n
            const peter = await page.evaluate(() => (window.$vo.$store.state.users || []).find((u) => u.email === 'peter@example.com'))
            assert.equal(peter && peter.isActive, 'n', 'peter isActive 應切為 n')
        },
    },
    {
        //E2E-005：勾選某列 → 刪除 → 儲存 → DB 該列消失（next case 的 resetDb 還原）
        name: 'E2E-005-delete-save',
        stages: ['E2E-005-1-row-checked', 'E2E-005-2-deleted', 'E2E-005-3-delete-save'],
        run: async (page) => {
            await gotoUsers(page)
            await checkRow(page, 0) //勾選 peter（row 0）
            const s1 = await captureStableWithBox(page, rowBoxSel(0))   //階段1：勾選列（按刪除前）
            await iconBtn(page, MDI.trash).first().click()
            await page.waitForTimeout(500)
            const s2 = await captureStableWithBox(page, gridContentBox(SEL_GRID))  //階段2：刪除後（列已移除、存檔前）
            await saveAndWaitModal(page)
            const s3 = await captureStableWithBox(page, SEL_MODAL) //階段3：儲存成功結果 modal
            return [
                { name: 'E2E-005-1-row-checked', buf: s1 },
                { name: 'E2E-005-2-deleted', buf: s2 },
                { name: 'E2E-005-3-delete-save', buf: s3 },
            ]
        },
        semantic: async (page) => {
            await assertModalMsg(page, 'userSaveUsersSuccess') //結果 modal 顯示儲存成功
            const has = await page.evaluate(() => (window.$vo.$store.state.users || []).some((u) => u.email === 'peter@example.com'))
            assert.ok(!has, 'peter 應已刪除')
            const n = await page.evaluate(() => (window.$vo.$store.state.users || []).length)
            assert.equal(n, 3, 'DB 應為 3 筆')
        },
    },
    {
        //E2E-004：勾選某列 → 複製（複製列含同 email→重複，須改唯一 email）→ 儲存成功
        name: 'E2E-004-copy-save',
        stages: ['E2E-004-1-row-checked', 'E2E-004-2-copied', 'E2E-004-3-filled', 'E2E-004-4-copy-save'],
        run: async (page) => {
            await gotoUsers(page)
            await checkRow(page, 0) //勾選 peter
            const s1 = await captureStableWithBox(page, rowBoxSel(0))   //階段1：勾選來源列（按複製前）
            await iconBtn(page, MDI.copy).first().click() //複製，複製列插入最首 row 0
            await page.waitForTimeout(700)
            const s2 = await captureStableWithBox(page, rowBoxSel(0))  //階段2：複製出新列（改 email 前）
            await typeIntoCell(page, 0, 'email', 'peter-copy-e004@test.com') //改唯一 email（避免與來源重複）
            const s3 = await captureStableWithBox(page, rowBoxSel(0))  //階段3：改妥唯一 email（存檔前）
            await saveAndWaitModal(page)
            const s4 = await captureStableWithBox(page, SEL_MODAL) //階段4：儲存成功結果 modal
            return [
                { name: 'E2E-004-1-row-checked', buf: s1 },
                { name: 'E2E-004-2-copied', buf: s2 },
                { name: 'E2E-004-3-filled', buf: s3 },
                { name: 'E2E-004-4-copy-save', buf: s4 },
            ]
        },
        semantic: async (page) => {
            await assertModalMsg(page, 'userSaveUsersSuccess') //結果 modal 顯示儲存成功
            const has = await page.evaluate(() => (window.$vo.$store.state.users || []).some((u) => u.email === 'peter-copy-e004@test.com'))
            assert.ok(has, '複製出的使用者應寫入 DB')
            const n = await page.evaluate(() => (window.$vo.$store.state.users || []).length)
            assert.equal(n, 5, 'DB 應為 5 筆')
        },
    },
    {
        //E2E-010：新增列填妥 → 令 token 失效 → 儲存失敗（DB 不變、未存列仍在前端）
        name: 'E2E-010-save-token-fail',
        stages: ['E2E-010-1-row-filled', 'E2E-010-2-fail-modal'],
        run: async (page) => {
            await gotoUsers(page)
            await clickAdd(page)
            await typeIntoCell(page, 0, 'name', 'TokenFailUser')
            await typeIntoCell(page, 0, 'email', 'tokenfail-e010@test.com')
            const s1 = await captureStableWithBox(page, rowBoxSel(0)) //階段1：填妥合法值、token 失效前
            await page.evaluate(() => { window.$vo.$ui.updateUserToken('invalid-token-e010') }) //setup：模擬 token 失效
            await saveAndWaitModal(page) //儲存失敗 → 顯示 CheckYes 失敗 modal（isModified 不重設、DB 不變）
            const s2 = await captureStableWithBox(page, SEL_MODAL) //階段2：儲存失敗結果 modal
            return [
                { name: 'E2E-010-1-row-filled', buf: s1 },
                { name: 'E2E-010-2-fail-modal', buf: s2 },
            ]
        },
        semantic: async (page) => {
            await assertModalMsg(page, 'userSaveUsersFail') //結果 modal 顯示儲存失敗（前綴；字尾為後端 errTemp 確定字串）
            const has = await page.evaluate(() => (window.$vo.$store.state.users || []).some((u) => u.email === 'tokenfail-e010@test.com'))
            assert.ok(!has, 'token 失效，使用者不應寫入 DB')
            const n = await page.evaluate(() => (window.$vo.$store.state.users || []).length)
            assert.equal(n, 4, 'DB 仍為 4 筆 base seed')
        },
    },
    {
        //E2E-012：settings.modeEditUsers='for:grups'（使用者身分由外部單一登入系統同步之部署）→ 進頁即編輯模式但僅能調整群組指派。
        //6 步 user path：①部署方已設 for:grups，管理員登入後點「使用者」 ②看到工具列只有編輯開關與欄位挑選（無新增鈕）、
        //  身分儲存格不可編、isAdmin/isActive 勾選 disabled ③點 peter 列「權限群組」按鈕開對話框（可編） ④勾選 權限群組M2 是否使用 →
        //  點對話框儲存 → 回填、peter 列顯示 2 群組、工具列出現儲存鈕 ⑤點儲存 → 看到「儲存成功」 ⑥DB peter.cgrups 含 M2、name/email 不變。
        //settings 由 runCase 依 c.settings 於 openPage 內（resetDb 之後、開 case page 之前）restartBackend 注入，
        //afterCase（關瀏覽器之後）還原 './settings.json'。
        name: 'E2E-012-for-grups-mode',
        stages: ['E2E-012-1-toolbar-for-grups', 'E2E-012-2-click-cgrups', 'E2E-012-3-dialog-open', 'E2E-012-4-row-toggled', 'E2E-012-5-cgrups-filled', 'E2E-012-6-click-save', 'E2E-012-7-save-ok'],
        settings: { modeEditUsers: 'for:grups' },
        run: async (page) => {
            await gotoUsers(page)
            const s1 = await captureStableWithBox(page, itemsUnionBox(SEL_TOOLBAR, { fit: true })) //結果: 進頁即編輯模式, 工具列只有編輯開關與欄位挑選、無新增鈕(框住工具列上之項目: 編輯開關與欄位挑選)
            const s2 = await captureStableWithBox(page, '.ag-row[row-index="0"] .ag-cell[col-id="cgrups"] button') //點擊前: peter 列「權限群組」按鈕(框住整顆按鈕)
            await page.locator('.ag-row[row-index="0"] .ag-cell[col-id="cgrups"] button').first().click()
            await waitUntilExist(page, 'VeCgrups 對話框標題', () => (document.body.innerText || '').includes(window.$vo.$t('userEditCgrups')), { timeout: 15000 })
            await waitDialogGrid(page)
            const s3 = await captureStableWithBox(page, SEL_MODAL) //結果: 群組對話框開啟, 為可編輯版(標題「編輯使用權限群組」)(框住整個對話框)
            await toggleDialogEnable(page, 1) //勾選 權限群組M2 是否使用（對話框內列＝全部 grups 依 order：row1=M2）
            const s4 = await captureStableWithBox(page, dialogRowBoxSel(1)) //結果: M2 列已勾選、對話框儲存鈕現身(框住對話框內 M2 列)
            await clickDialogSave(page)
            await waitDialogClosed(page, 'userEditCgrups')
            const s5 = await captureStableWithBox(page, rowBoxSel(0)) //結果: 對話框關閉, peter 列「權限群組」文字回填為 2 群組(框住 peter 列)
            const s6 = await captureStableWithBox(page, `div[role="button"]:has(svg path[d="${MDI.upload}"])`) //點擊前: 工具列出現「儲存變更」鈕(框住整顆儲存鈕)
            await saveAndWaitModal(page)
            const s7 = await captureStableWithBox(page, SEL_MODAL) //結果: 儲存成功結果 modal(框住 modal)
            return [
                { name: 'E2E-012-1-toolbar-for-grups', buf: s1 },
                { name: 'E2E-012-2-click-cgrups', buf: s2 },
                { name: 'E2E-012-3-dialog-open', buf: s3 },
                { name: 'E2E-012-4-row-toggled', buf: s4 },
                { name: 'E2E-012-5-cgrups-filled', buf: s5 },
                { name: 'E2E-012-6-click-save', buf: s6 },
                { name: 'E2E-012-7-save-ok', buf: s7 },
            ]
        },
        semantic: async (page) => {
            //spec: 「新增 / 複製 / 刪除鈕不出現」
            assert.equal(await iconBtn(page, MDI.plus).count(), 0, 'for:grups 下工具列不得有新增鈕')
            //spec: 「儲存成功」
            await assertModalMsg(page, 'userSaveUsersSuccess')
            //spec: 「後端 updateUsers 於 for:grups 亦只採納既有使用者之 cgrups 變更」→ DB(store 同步) peter.cgrups 含 M2, 身分欄不變
            const peter = await page.evaluate(() => (window.$vo.$store.state.users || []).find((u) => u.id === 'id-for-peter'))
            assert.ok(peter, 'store 應有 peter')
            assert.ok(String(peter.cgrups).includes('權限群組M2'), `peter.cgrups 應含 權限群組M2, 實得 ${peter.cgrups}`)
            assert.equal(peter.name, 'peter')
            assert.equal(peter.email, 'peter@example.com')
            //spec: 「isAdmin / isActive 勾選 disabled」（關閉 modal 後檢查主表）
            const okText = await page.evaluate(() => window.$vo.$t('ok'))
            await page.getByText(okText, { exact: true }).first().click()
            await page.waitForTimeout(800)
            const allDisabled = await page.evaluate(() => {
                const chks = [...document.querySelectorAll('.ag-row .ag-cell[col-id="isAdmin"] input[type="checkbox"], .ag-row .ag-cell[col-id="isActive"] input[type="checkbox"]')]
                return chks.length > 0 && chks.every((c) => c.disabled)
            })
            assert.ok(allDisabled, 'for:grups 下 isAdmin / isActive 勾選應皆 disabled')
            //spec: 「name / email / description / from 儲存格唯讀」→ 真滑鼠雙擊 name 儲存格不得出現編輯器
            await page.locator('.ag-row[row-index="0"] .ag-cell[col-id="name"]').first().dblclick()
            await page.waitForTimeout(800)
            const editorCnt = await page.locator('.ag-row[row-index="0"] .ag-cell[col-id="name"] input').count()
            assert.equal(editorCnt, 0, 'for:grups 下雙擊 name 儲存格不得進入編輯')
        },
    },
]

//單一案例管線（產製端與比對端呼叫同一函數；w-package-tools-e2e runBaselineCase）：
//  launch：每案全新 browser 進程（消除 GPU/font/CSS cache 跨 case 累積造成的 cold/warm 差異；對齊 sso 之 per-case launch）
//  openPage：throwaway page 還原 DB 為 4 筆 base seed（關閉後再開 case page）→ c.settings 者換後端設定 → openApp →
//    setLang（eng 也補等量 settle，治 eng-vs-cht 收斂不對稱）
//  run：流程截圖，回傳「單張 Buffer」或「多階段 [{name, buf}]」，由 runBaselineCase 正規化並核對 stages
//  semantic：語意斷言，寫檔／比對之前執行 → 產製端依 gate 寫檔／比對端 assertBaselineMatch → finally 關瀏覽器 → afterCase 還原 settings
//c.settings（E2E-012 for:grups）之換設定刻意不放 prepare（開瀏覽器前）而照原檔順序放在 resetDb 之後：for:grups 下後端 updateUsers
//只採納既有使用者之 cgrups 變更（server/WWebPerm.mjs:1143-1145），resetDb 若落在換設定之後，前一案之增刪列與身分欄皆還原不回。
async function runCase(mode, lang, c, extra = {}) {
    return await runBaselineCase({
        mode,
        lang,
        name: c.name,
        run: c.run,
        stages: c.stages,
        launch: launchBrowser,
        openPage: async (browser) => {
            await resetDb(browser, 'users', BASE_SEED)
            if (c.settings) await restartBackend(genTempSettings(c.settings))
            const page = await openApp(browser)
            await setLang(page, lang)
            return page
        },
        semantic: c.semantic ? (ctx) => c.semantic(ctx.page) : null,
        //finally 內（關瀏覽器之後）還原預設 settings；換設定或流程拋錯亦還原
        afterCase: async () => {
            if (c.settings) await restartBackend('./settings.json')
        },
        pathOf: picPath,
        labelOf: (lg, key) => `users-${lg}-${key}`,
        match: assertBaselineMatch,
        ...extra,
    })
}

async function generateBaseline() {
    console.log('=== 產製 users baseline 開始 ===')
    //截圖前篩選（--names / --langs / --write-mode / E2E_BASELINE_OUT_DIR，見檔頭）；不符任何鍵即於此報錯（啟動服務之前）
    const gate = createBaselineGate({ langs: LANGS, cases: CASES })
    console.log(gate.describe())
    await startServersOnce()
    fs.mkdirSync(PICS_DIR, { recursive: true })
    process.env.E2E_STRICT_CAPTURE = '1' //regen 端：captureStable 未 settle 即 throw，拒絕寫入未穩定畫面
    //擷取 pristine base seed（DB 剛 fresh seed，4 筆）——用臨時 browser
    { const b = await launchBrowser(); const pp = await openApp(b); BASE_SEED = await captureBaseSeed(pp, 'users'); await b.close() }
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
    console.log('=== 產製 users baseline 完成 ===')
}

if (isBaseline) {
    generateBaseline().catch((err) => { console.log('baseline 例外', err); cleanup(); process.exit(1) })
}
else {
    for (const lang of LANGS) {
        describe(`e2e-users (${lang})`, function() {
            this.timeout(180000)
            before(async function() {
                this.timeout(200000)
                await startServersOnce()
                //擷取 BASE_SEED 一次（用臨時 browser）
                if (!BASE_SEED) { const b = await launchBrowser(); const pp = await openApp(b); BASE_SEED = await captureBaseSeed(pp, 'users'); await b.close() }
            })
            //每案 fresh browser、DB 還原、換／還原 settings、開頁切語系、語意斷言、關瀏覽器皆在 runCase 內（與產製端同管線；--grep 單跑亦完整）
            for (const c of CASES) {
                it(c.name, async function() {
                    //c.settings 之案例含兩次 restartBackend（換設定與還原），放寬逾時（同原檔）
                    if (c.settings) {
                        this.timeout(240000)
                    }
                    await runCase('compare', lang, c, { onKnownDefect: () => this.skip() }) //已知缺陷協定: 標 pending(提示框殘留已由 w-component-vue 2.5.24 修正, 其偵測改為直接失敗, 見 e2e-setup probeStuckTooltip)
                })
            }
        })
    }
}
