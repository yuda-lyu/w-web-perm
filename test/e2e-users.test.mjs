//後台使用者清單 e2e（pilot）。對應 spec/流程_後台使用者清單.md。
//雙模式：
//  - 產 baseline：node test/e2e-users.test.mjs --baseline （寫 test/pics/users/）
//  - 驗證（mocha）：npx mocha test/e2e-users.test.mjs --reporter list （pixelmatch 反鋸齒感知 + maxDiffPixels 容差比對，非 byte-exact）
//act 走 user-facing input；assert = 語意斷言 + pixel baseline（§6.2 / §6.3）。
import fs from 'fs'
import assert from 'assert'
import { startServersOnce, cleanup, launchBrowser, openApp, captureStable, captureStableWithBox, rowBoxSel, waitUntilExist, assertBaselineMatch } from './e2e-setup.mjs'

const PICS_DIR = './test/pics/users'
const LANGS = ['eng', 'cht']
const isBaseline = process.argv.includes('--baseline')

//紅框標注目標（captureStableWithBox）：本 case 主要觀看區
const SEL_GRID = '.ag-root-wrapper'                                            //清單 / grid 內容區
const SEL_MODAL = 'div[style*="overscroll-behavior"] div[tabindex="0"] > div'  //WDialog 結果 modal / Ve 對話框
const SEL_TOOLBAR = '[data-fmid="users-toolbar"]'                              //功能區工具列

function picPath(lang, name) { return `${PICS_DIR}/users-${lang}-${name}.png` }

//設定語系（test setup 層，非 act-under-test；對齊雙語覆蓋維度）。
//對齊 sso：cht 走語系切換（等同 perm UI 語言選單的 $ui.setLang）；eng 為預設不切，但**補等同的 settle
//buffer**，使 eng/cht 在 captureStable 前有對稱的 layout settle 時間 → 治 eng-vs-cht 收斂不對稱（sso
//e2e-adduser 殷鑑「eng 補 buffer 對稱 cht setLang 時間」）。NOT setLang('eng')（那會多觸發一次 re-render，非 sso 做法）。
async function setLang(page, lang) {
    if (lang !== 'eng') {
        await page.evaluate((l) => { window.$vo.$ui.setLang(l, 'e2e-setLang') }, lang)
    }
    await page.waitForTimeout(600)
}

//導航至使用者頁（user-facing：點左側「使用者」導覽），等 ag-grid 載入。
//openApp 已等到 csLogin+webInfor，故此處 $t 譯文已就緒（lang-aware 取標籤）
async function gotoUsers(page) {
    const usersLabel = await page.evaluate(() => window.$vo.$t('mmUsers'))
    await page.getByText(usersLabel, { exact: true }).first().click()
    await waitUntilExist(page, '使用者 ag-grid 列', () => document.querySelectorAll('.ag-row').length > 0, { timeout: 20000 })
    await page.waitForTimeout(500)
}

//—— 互動原語 helpers ——
//icon 按鈕（WButtonCircle 無 title/aria，以 mdi icon path 定位）
const MDI = {
    plus: 'M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z',
    upload: 'M6.5 20Q4.22 20 2.61 18.43 1 16.85 1 14.58 1 12.63 2.17 11.1 3.35 9.57 5.25 9.15 5.88 6.85 7.75 5.43 9.63 4 12 4 14.93 4 16.96 6.04 19 8.07 19 11 20.73 11.2 21.86 12.5 23 13.78 23 15.5 23 17.38 21.69 18.69 20.38 20 18.5 20H13Q12.18 20 11.59 19.41 11 18.83 11 18V12.85L9.4 14.4L8 13L12 9L16 13L14.6 14.4L13 12.85V18H18.5Q19.55 18 20.27 17.27 21 16.55 21 15.5 21 14.45 20.27 13.73 19.55 13 18.5 13H17V11Q17 8.93 15.54 7.46 14.08 6 12 6 9.93 6 8.46 7.46 7 8.93 7 11H6.5Q5.05 11 4.03 12.03 3 13.05 3 14.5 3 15.95 4.03 17 5.05 18 6.5 18H9V20M12 13Z',
    copy: 'M19,21H8V7H19M19,5H8A2,2 0 0,0 6,7V21A2,2 0 0,0 8,23H19A2,2 0 0,0 21,21V7A2,2 0 0,0 19,5M16,1H4A2,2 0 0,0 2,3V17H4V3H16V1Z',
    trash: 'M9,3V4H4V6H5V19A2,2 0 0,0 7,21H17A2,2 0 0,0 19,19V6H20V4H15V3H9M7,6H17V19H7V6M9,8V17H11V8H9M13,8V17H15V8H13Z',
}
function iconBtn(page, path) {
    return page.locator(`div[role="button"]:has(svg path[d="${path}"])`)
}
//勾選某列（name 欄的 row-select checkbox），使 copy/delete 工具列按鈕出現
async function checkRow(page, rowIndex) {
    await page.locator(`.ag-row[row-index="${rowIndex}"] .ag-cell[col-id="name"] input[type="checkbox"]`).first().click()
    await page.waitForTimeout(500)
}
//切換編輯模式（點 WSwitch，以「Edit mode/編輯模式」標籤觸發其 click 區）
async function toggleEditMode(page) {
    const label = await page.evaluate(() => window.$vo.$t('modeEdit'))
    await page.getByText(label, { exact: true }).first().click()
    await page.waitForTimeout(2000) //toggle 觸發 grid 欄位 reflow（增/減拖曳·勾選欄），等其完全 settle
}
//點新增（mdiPlus），新列插入最首 row-index 0
async function clickAdd(page) {
    await iconBtn(page, MDI.plus).first().click()
    await page.waitForTimeout(600)
}
//Pattern D：dblclick cell → 清空(Backspace) → insertText → Enter 提交（ag-grid Vue v-model）
async function typeIntoCell(page, rowIndex, colId, value) {
    const cellSel = `.ag-row[row-index="${rowIndex}"] .ag-cell[col-id="${colId}"]`
    await page.locator(cellSel).first().dblclick()
    const inp = page.locator(`${cellSel} input`).first()
    await inp.waitFor({ state: 'visible', timeout: 5000 })
    await page.waitForTimeout(800) //editor mount / v-model binding settle
    await inp.click()
    const cur = await inp.inputValue()
    await page.keyboard.press('End')
    for (let k = 0; k < cur.length + 2; k++) await page.keyboard.press('Backspace')
    if (value) await page.keyboard.insertText(value)
    await page.waitForTimeout(200)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(500)
}
//該 cell 是否出現警告 icon（errItemsByName/Email → <img warning>）
async function cellHasWarn(page, rowIndex, colId) {
    return await page.evaluate(({ r, c }) => {
        return !!document.querySelector(`.ag-row[row-index="${r}"] .ag-cell[col-id="${c}"] img`)
    }, { r: rowIndex, c: colId })
}

//—— DB 衛生 + 儲存 helpers ——
//pristine 4 筆 base seed（含全欄位），每 case 前還原 DB，使跨 case／跨語系可重現
let BASE_SEED = null
async function captureBaseSeed(page) {
    //users 表資料經 recvData 廣播同步，較 syncState 晚到；須等載入後再讀，否則抓到空陣列
    await page.waitForFunction(() => (window.$vo.$store.state.users || []).length > 0, null, { timeout: 30000 })
    await page.waitForTimeout(1500) //確保整批同步完成
    return await page.evaluate(() => {
        const us = (window.$vo.$store.state.users || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0))
        return JSON.parse(JSON.stringify(us))
    })
}
//在獨立 throwaway page 還原 DB（diff：刪多餘/補缺漏），關閉後再開 case page。
//不可在 case page 上 reset：updateUsers 的 late 廣播(recvData)會在 clickAdd 後到、觸發 changeParams 重算
//把已新增列洗掉（曾導致 typeIntoCell 改到既有列）。test setup 層、非 act。
async function resetDb(browser, seed) {
    if (!seed || seed.length === 0) throw new Error('resetDb: BASE_SEED 為空，拒絕還原（避免清空 DB）')
    const p = await openApp(browser)
    await p.evaluate((s) => window.$vo.$fapi.updateUsers(s), seed)
    await p.waitForFunction((n) => (window.$vo.$store.state.users || []).length === n, seed.length, { timeout: 15000 })
    await p.waitForTimeout(800)
    await p.context().close()
}
async function clickSave(page) {
    await iconBtn(page, MDI.upload).first().click()
}
//按 save → 等 CheckYes 結果 modal 出現（System Message 標題 + OK 鈕）→ 停在 modal 顯示態供截圖。
//系統已改用持久 CheckYes modal 呈現「操作主要結果」（取代舊 toast）：成功路徑 isModified=false 在 modal 前設、
//失敗路徑 isModified 不重設，但兩者都會 showCheckYes，故統一以 systemMessage 標題偵測 modal 出現（成功/失敗皆適用）。
async function saveAndWaitModal(page) {
    await clickSave(page)
    await waitUntilExist(page, 'CheckYes 結果 modal（systemMessage 標題）', () => {
        const vo = window.$vo
        return (document.body.innerText || '').includes(vo.$t('systemMessage'))
    }, { timeout: 20000 })
    await page.waitForTimeout(800) //modal 進場 settle（captureStable 再 retry-until-stable 收斂）
}
//語意斷言：CheckYes 結果 modal 顯示指定 i18n 訊息（lang-aware，eng/cht 皆適用）。
//對 fail 類只斷言前綴鍵（userSaveUsersFail），不含動態 errTemp 字尾。
async function assertModalMsg(page, i18nKey) {
    const msg = await page.evaluate((k) => window.$vo.$t(k), i18nKey)
    const txt = await page.evaluate(() => document.body.innerText)
    assert.ok(txt.includes(msg), `結果 modal 應顯示 ${i18nKey}（${msg}）`)
}

//case 定義：run(page,lang) 走流程並回傳截圖 buffer；mocha 模式再加語意斷言
const CASES = [
    {
        name: 'E2E-001-list-view',
        run: async (page) => {
            await gotoUsers(page)
            return await captureStableWithBox(page, SEL_GRID) //觀看區：使用者清單 grid
        },
        semantic: async (page) => {
            const txt = await page.evaluate(() => document.body.innerText)
            assert.ok(txt.includes('admin'), '應顯示 seed 使用者 admin')
            assert.ok(txt.includes('peter') && txt.includes('mary') && txt.includes('john'), '應顯示 4 筆 base seed 使用者')
        },
    },
    {
        //E2E-011：點某列 cgrups 欄按鈕開啟群組關聯對話框（VeCgrups）。僅驗本流程可觀察事實：對話框出現。
        name: 'E2E-011-cgrups-dialog',
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
        //E2E-002：關閉編輯模式 → 工具列新增/刪除/儲存按鈕隱藏、checkbox 禁用（唯讀檢視）
        name: 'E2E-002-edit-mode-off',
        run: async (page) => {
            await gotoUsers(page)
            await toggleEditMode(page)
            return await captureStableWithBox(page, SEL_TOOLBAR) //觀看區：功能區工具列（按鈕隱藏）
        },
        semantic: async (page) => {
            const cnt = await iconBtn(page, MDI.plus).count()
            assert.equal(cnt, 0, '非編輯模式不應出現新增按鈕')
        },
    },
    {
        //E2E-007：新增列後清空 name → name 欄警告 icon（email 給合法值以隔離為 name 錯誤）
        name: 'E2E-007-name-empty',
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
        run: async (page) => {
            await gotoUsers(page)
            await checkRow(page, 0) //勾選 peter（row 0）
            const s1 = await captureStableWithBox(page, rowBoxSel(0))   //階段1：勾選列（按刪除前）
            await iconBtn(page, MDI.trash).first().click()
            await page.waitForTimeout(500)
            const s2 = await captureStableWithBox(page, SEL_GRID)  //階段2：刪除後（列已移除、存檔前）
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
]

//手術式重產（§6.3）：--names a,b,c 只產指定 case；--langs eng,cht 只產指定語系。截圖「前」就 gate（省截圖成本）。
function argList(flag) {
    const i = process.argv.indexOf(flag)
    if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1].split(',').map((s) => s.trim()).filter(Boolean)
    return null
}
//前綴或完整匹配：傳 'E2E-003' 即可匹配 'E2E-003-add-save'（避免 §6.3 殷鑑「--names 只認字面」陷阱）
function nameMatch(list, caseName) { return list.some((nm) => caseName === nm || caseName.startsWith(nm)) }
async function generateBaseline() {
    console.log('=== 產製 users baseline 開始 ===')
    const onlyNames = argList('--names')
    const onlyLangs = argList('--langs')
    await startServersOnce()
    fs.mkdirSync(PICS_DIR, { recursive: true })
    //擷取 pristine base seed（DB 剛 fresh seed，4 筆）——用臨時 browser
    { const b = await launchBrowser(); const pp = await openApp(b); BASE_SEED = await captureBaseSeed(pp); await b.close() }
    for (const lang of LANGS) {
        if (onlyLangs && !nameMatch(onlyLangs, lang)) continue //§6.3 手術式：跳過未指定語系
        for (const c of CASES) {
            if (onlyNames && !nameMatch(onlyNames, c.name)) continue //§6.3 手術式：截圖前 gate，跳過未指定 case
            //per-case fresh browser（每 case 全新 browser 進程，消除 GPU/font/CSS cache 跨 case 累積造成
            //的 cold/warm 差異；對齊 sso e2e-adduser 之 per-case chromium.launch，確保 gen 與 mocha 收斂同態）
            const browser = await launchBrowser()
            await resetDb(browser, BASE_SEED) //throwaway page 還原 DB 為 4 筆 base seed，關閉後再開 case page
            const page = await openApp(browser)
            await setLang(page, lang) //eng 也切（symmetric）：補等同 cht setLang 的 re-render+settle 時間，治 eng-vs-cht layout 收斂不對稱（sso 殷鑑）
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
    console.log('=== 產製 users baseline 完成 ===')
}

if (isBaseline) {
    generateBaseline().catch((err) => { console.log('baseline 例外', err); cleanup(); process.exit(1) })
}
else {
    for (const lang of LANGS) {
        describe(`e2e-users (${lang})`, function() {
            this.timeout(180000)
            let browser = null
            before(async function() {
                this.timeout(200000)
                await startServersOnce()
                //擷取 BASE_SEED 一次（用臨時 browser）
                if (!BASE_SEED) { const b = await launchBrowser(); const pp = await openApp(b); BASE_SEED = await captureBaseSeed(pp); await b.close() }
            })
            //per-case fresh browser：每 case 全新 browser 進程（對齊 sso），消 cross-case GPU/font cache 累積
            beforeEach(async function() {
                this.timeout(90000)
                browser = await launchBrowser()
                await resetDb(browser, BASE_SEED) //throwaway page 還原 DB 為 4 筆 base seed
            })
            afterEach(async function() { if (browser) { await browser.close(); browser = null } })
            for (const c of CASES) {
                it(c.name, async () => {
                    const page = await openApp(browser)
                    await setLang(page, lang) //eng 也切（symmetric，治 eng marathon flake）
                    let shots = await c.run(page, lang)
                    if (c.semantic) await c.semantic(page)
                    //run 回傳「單張 Buffer」或「多階段 [{name, buf}]」；統一正規化為陣列後逐張比對
                    if (Buffer.isBuffer(shots)) shots = [{ name: c.name, buf: shots }]
                    for (const s of shots) {
                        assertBaselineMatch(s.buf, picPath(lang, s.name), `users-${lang}-${s.name}`)
                    }
                })
            }
        })
    }
}
