//後台權限清單 e2e。對應 spec/流程_後台權限清單.md。鏡像 test/e2e-grups.test.mjs / e2e-targets.test.mjs（canonical pilot）。
//雙模式：
//  - 產 baseline：node test/e2e-pemis.test.mjs --baseline （寫 test/pics/pemis/）
//  - 驗證（mocha）：npx mocha test/e2e-pemis.test.mjs --reporter list （buf.equals 比對）
//act 走 user-facing input；assert = 語意斷言 + pixel baseline（§6.2 / §6.3）。
//pemis 結構最接近 grups：主鍵為 id（funNew 自動產生、清單隱藏），列鍵以 name 去重；
//name 空 / 重複為「前端 errItemsByName 攔截」（isError 引用 errItemsByName，非空→errInNames 擋存、不送後端，
//對齊 grups / users；異於 targets 之 isError 引用未定義變數恆空而走後端 ckKey）；另有 crules / belongGrups 兩個關聯欄按鈕；
//save 結果（成功 / 失敗 / 空 / errInNames）皆走 $dg.showCheckYes 持久 modal。
import fs from 'fs'
import assert from 'assert'
import { startServersOnce, cleanup, launchBrowser, openApp, captureStable, waitUntilExist } from './e2e-setup.mjs'

const PICS_DIR = './test/pics/pemis'
const LANGS = ['eng', 'cht']
const isBaseline = process.argv.includes('--baseline')

function picPath(lang, name) { return `${PICS_DIR}/pemis-${lang}-${name}.png` }

//設定語系（test setup 層，非 act-under-test；對齊雙語覆蓋維度）。沿用 e2e-grups / e2e-targets 之對稱 buffer 慣例：
//cht 走語系切換；eng 為預設不切，但補等同的 settle buffer，治 eng-vs-cht 收斂不對稱（sso e2e-adduser 殷鑑）。
async function setLang(page, lang) {
    if (lang !== 'eng') {
        await page.evaluate((l) => { window.$vo.$ui.setLang(l, 'e2e-setLang') }, lang)
    }
    await page.waitForTimeout(600)
}

//導航至權限頁（user-facing：點左側「權限設定」導覽），等 ag-grid 載入。
//openApp 已等到 csLogin+webInfor，故此處 $t 譯文已就緒（lang-aware 取標籤）
async function gotoPemis(page) {
    const pemisLabel = await page.evaluate(() => window.$vo.$t('mmPemis'))
    await page.getByText(pemisLabel, { exact: true }).first().click()
    await waitUntilExist(page, '權限 ag-grid 列', () => document.querySelectorAll('.ag-row').length > 0, { timeout: 20000 })
    await page.waitForTimeout(500)
}

//—— 互動原語 helpers（沿用 e2e-grups / e2e-targets，僅欄位 col-id 改為 pemis 的 name/description/crules/belongGrups）——
//icon 按鈕（WButtonCircle 無 title/aria，以 mdi icon path 定位）。
//pemis 之 plus/copy/trash/upload mdi path 與 grups / users / targets 完全相同（mdiPlus / mdiContentCopy /
//mdiTrashCanOutline / mdiCloudUploadOutline），故直接沿用同一份 MDI 表。
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
//該 cell 是否出現警告 icon（errItemsByName → <img warning>）
async function cellHasWarn(page, rowIndex, colId) {
    return await page.evaluate(({ r, c }) => {
        return !!document.querySelector(`.ag-row[row-index="${r}"] .ag-cell[col-id="${c}"] img`)
    }, { r: rowIndex, c: colId })
}

//—— DB 衛生 + 儲存 helpers ——
//pristine base seed（含全欄位），每 case 前還原 DB，使跨 case／跨語系可重現
let BASE_SEED = null
async function captureBaseSeed(page) {
    //pemis 表資料經 recvData 廣播同步，較 syncState 晚到；須等載入後再讀，否則抓到空陣列
    await page.waitForFunction(() => (window.$vo.$store.state.pemis || []).length > 0, null, { timeout: 30000 })
    await page.waitForTimeout(1500) //確保整批同步完成
    return await page.evaluate(() => {
        const us = (window.$vo.$store.state.pemis || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0))
        return JSON.parse(JSON.stringify(us))
    })
}
//在獨立 throwaway page 還原 DB（diff：刪多餘/補缺漏），關閉後再開 case page。
//不可在 case page 上 reset：updatePemis 的 late 廣播(recvData)會在 clickAdd 後到、觸發 changeParams 重算
//把已新增列洗掉（曾導致 typeIntoCell 改到既有列）。test setup 層、非 act。
async function resetDb(browser, seed) {
    if (!seed || seed.length === 0) throw new Error('resetDb: BASE_SEED 為空，拒絕還原（避免清空 DB）')
    const p = await openApp(browser)
    await p.evaluate((s) => window.$vo.$fapi.updatePemis(s), seed)
    await p.waitForFunction((n) => (window.$vo.$store.state.pemis || []).length === n, seed.length, { timeout: 15000 })
    await p.waitForTimeout(800)
    await p.context().close()
}
async function clickSave(page) {
    await iconBtn(page, MDI.upload).first().click()
}
//按 save → 等 CheckYes 結果 modal 出現（System Message 標題 + OK 鈕）→ 停在 modal 顯示態供截圖。
//系統以持久 CheckYes modal 呈現「操作主要結果」：成功 / 失敗 / errInNames（前端擋存）/ 空（pemiAddEmpty）皆 showCheckYes，
//故統一以 systemMessage 標題偵測 modal 出現。
async function saveAndWaitModal(page) {
    await clickSave(page)
    await waitUntilExist(page, 'CheckYes 結果 modal（systemMessage 標題）', () => {
        const vo = window.$vo
        return (document.body.innerText || '').includes(vo.$t('systemMessage'))
    }, { timeout: 20000 })
    await page.waitForTimeout(800) //modal 進場 settle（captureStable 再 retry-until-stable 收斂）
}
//語意斷言：CheckYes 結果 modal 顯示指定 i18n 訊息（lang-aware，eng/cht 皆適用）。
//對 fail 類只斷言前綴鍵（pemiSavePemisFail），不含動態 errTemp 字尾。
async function assertModalMsg(page, i18nKey) {
    const msg = await page.evaluate((k) => window.$vo.$t(k), i18nKey)
    const txt = await page.evaluate(() => document.body.innerText)
    assert.ok(txt.includes(msg), `結果 modal 應顯示 ${i18nKey}（${msg}）`)
}

//case 定義：run(page,lang) 走流程並回傳截圖 buffer；mocha 模式再加語意斷言
const CASES = [
    {
        //E2E-001：進入權限頁顯示初始清單（預設編輯模式 ON，比照 pilot 之 list-view 截預設態）
        name: 'E2E-001-list-view',
        run: async (page) => {
            await gotoPemis(page)
            return await captureStable(page)
        },
        semantic: async (page) => {
            const txt = await page.evaluate(() => document.body.innerText)
            assert.ok(txt.includes('權限P1'), '應顯示 base seed pemi 名稱 權限P1')
            assert.ok(txt.includes('權限P2') && txt.includes('權限P4'), '應顯示多筆 base seed pemis')
        },
    },
    {
        //E2E-002：關閉編輯模式 → 工具列新增/複製/刪除/儲存按鈕隱藏（唯讀檢視）
        name: 'E2E-002-edit-mode',
        run: async (page) => {
            await gotoPemis(page)
            await toggleEditMode(page)
            return await captureStable(page)
        },
        semantic: async (page) => {
            const cnt = await iconBtn(page, MDI.plus).count()
            assert.equal(cnt, 0, '非編輯模式不應出現新增按鈕')
        },
    },
    {
        //E2E-003：新增列 → 填唯一 name → 儲存成功 → 寫入 DB（store 同步）
        name: 'E2E-003-add-ok',
        run: async (page) => {
            await gotoPemis(page)
            await clickAdd(page)
            await typeIntoCell(page, 0, 'name', 'E2ePemiE003')
            await saveAndWaitModal(page)
            return await captureStable(page)
        },
        semantic: async (page) => {
            await assertModalMsg(page, 'pemiSavePemisSuccess') //結果 modal 顯示儲存成功
            const p = await page.evaluate(() => (window.$vo.$store.state.pemis || []).find((x) => x.name === 'E2ePemiE003'))
            assert.ok(p, '新權限應寫入 DB（store 同步）')
            //userId / timeCreate 已由後端補為實值（非 {待自動給予} 佔位符）
            assert.ok(p && p.userId && !String(p.userId).startsWith('{'), 'userId 應由後端補實值')
            assert.ok(p && p.timeCreate && !String(p.timeCreate).startsWith('{'), 'timeCreate 應由後端補實值')
            const n = await page.evaluate(() => (window.$vo.$store.state.pemis || []).length)
            assert.equal(n, BASE_SEED.length + 1, `DB 應為 base+1（${BASE_SEED.length + 1}）筆`)
        },
    },
    {
        //E2E-004：勾選一既有列 → 複製（複製列 name 自動帶「複製」後綴避重）→ 儲存成功
        name: 'E2E-004-copy-ok',
        run: async (page) => {
            await gotoPemis(page)
            await checkRow(page, 0) //勾選 base seed 第一列
            await iconBtn(page, MDI.copy).first().click() //複製，複製列插入最首 row 0
            await page.waitForTimeout(700)
            await saveAndWaitModal(page)
            return await captureStable(page) //captureStable 內已含 waitNavExpanded（WDrawer 雙穩態防護，對所有 case 生效）
        },
        semantic: async (page) => {
            await assertModalMsg(page, 'pemiSavePemisSuccess') //結果 modal 顯示儲存成功
            const n = await page.evaluate(() => (window.$vo.$store.state.pemis || []).length)
            assert.equal(n, BASE_SEED.length + 1, `DB 應為 base+1（${BASE_SEED.length + 1}）筆`)
            //複製出的列 name 與來源不同（帶「複製」後綴避重）、id 亦不同（非覆蓋原列）
            const srcName = BASE_SEED[0].name
            const srcId = BASE_SEED[0].id
            const pemis = await page.evaluate(() => (window.$vo.$store.state.pemis || []).map((x) => ({ id: x.id, name: x.name })))
            const dup = pemis.filter((p) => p.name !== srcName && p.name.includes(srcName) && p.id !== srcId)
            assert.ok(dup.length >= 1, '應有一列為來源 name 帶後綴、id 獨立的複製列')
        },
    },
    {
        //E2E-005：勾選某列 → 刪除 → 儲存 → DB 該列消失（next case 的 resetDb 還原）
        //比照 grups pilot E2E-005：直接刪 base seed row 0，靠每 case 前 resetDb 還原（最簡穩）。
        name: 'E2E-005-delete-ok',
        run: async (page) => {
            await gotoPemis(page)
            await checkRow(page, 0) //勾選 base seed 第一列
            await iconBtn(page, MDI.trash).first().click()
            await page.waitForTimeout(500)
            await saveAndWaitModal(page)
            return await captureStable(page)
        },
        semantic: async (page) => {
            await assertModalMsg(page, 'pemiSavePemisSuccess') //結果 modal 顯示儲存成功
            const delName = BASE_SEED[0].name
            const has = await page.evaluate((nm) => (window.$vo.$store.state.pemis || []).some((x) => x.name === nm), delName)
            assert.ok(!has, `base seed 第一列（${delName}）應已刪除`)
            const n = await page.evaluate(() => (window.$vo.$store.state.pemis || []).length)
            assert.equal(n, BASE_SEED.length - 1, `DB 應為 base-1（${BASE_SEED.length - 1}）筆`)
        },
    },
    {
        //E2E-006：新增列後清空 name → name 欄警告 icon（tooltip pemiNameEmpty）；
        //Save 時前端 isError 彙整 errInNames 擋下、不送後端、DB 不變
        name: 'E2E-006-name-empty',
        run: async (page) => {
            await gotoPemis(page)
            await clickAdd(page)
            await typeIntoCell(page, 0, 'name', '') //清空 name（清掉自動帶入的「新權限」名）
            assert.ok(await cellHasWarn(page, 0, 'name'), 'name 空應顯示警告 icon（Save 前）')
            await saveAndWaitModal(page)
            return await captureStable(page)
        },
        semantic: async (page) => {
            await assertModalMsg(page, 'errInNames') //前端 errItemsByName 攔截 → errInNames 擋存（未送後端）
            const n = await page.evaluate(() => (window.$vo.$store.state.pemis || []).length)
            assert.equal(n, BASE_SEED.length, '未儲存（前端擋），DB 仍為 base seed 筆數')
        },
    },
    {
        //E2E-007：新增列 name 取既有 pemi name（重複）→ name 欄警告 icon（tooltip pemiNameDuplicate）；
        //Save 時前端 isError 彙整 errInNames 擋下、不送後端、DB 不變
        name: 'E2E-007-name-dup',
        run: async (page) => {
            await gotoPemis(page)
            await clickAdd(page)
            await typeIntoCell(page, 0, 'name', '權限P1') //取 base seed 既有 pemi name（重複）
            assert.ok(await cellHasWarn(page, 0, 'name'), 'name 重複應顯示警告 icon（Save 前）')
            await saveAndWaitModal(page)
            return await captureStable(page)
        },
        semantic: async (page) => {
            await assertModalMsg(page, 'errInNames') //前端 errItemsByName 攔截 → errInNames 擋存（未送後端）
            const n = await page.evaluate(() => (window.$vo.$store.state.pemis || []).length)
            assert.equal(n, BASE_SEED.length, '未儲存（前端擋），DB 仍為 base seed 筆數')
        },
    },
    {
        //E2E-008：點某列 crules 欄按鈕 → 開啟管控規則編輯對話框（VeCrules）。僅驗本流程可觀察事實：對話框出現。
        name: 'E2E-008-crules-dialog',
        run: async (page) => {
            await gotoPemis(page)
            //點第 1 列 crules 欄按鈕（結構 selector：ag-grid col-id）
            await page.locator('.ag-row[row-index="0"] .ag-cell[col-id="crules"] button').first().click()
            //等 VeCrules 對話框（以其標題 pemiEditCrules 偵測；isEditable 預設 ON → 編輯態標題）
            await waitUntilExist(page, 'VeCrules 對話框標題', () => {
                const vo = window.$vo
                const label = vo.$t('pemiEditCrules')
                return (document.body.innerText || '').includes(label)
            }, { timeout: 15000 })
            await page.waitForTimeout(800)
            return await captureStable(page)
        },
        semantic: async (page) => {
            const label = await page.evaluate(() => window.$vo.$t('pemiEditCrules'))
            const txt = await page.evaluate(() => document.body.innerText)
            assert.ok(txt.includes(label), `管控規則編輯對話框標題應顯示（${label}）`)
        },
    },
    {
        //E2E-009：點某列 belongGrups 欄按鈕 → 開啟所屬權限群組檢視對話框（VePemiBlngGrups）。僅驗本流程可觀察事實：對話框出現。
        name: 'E2E-009-blnggrups-dialog',
        run: async (page) => {
            await gotoPemis(page)
            //點第 1 列 belongGrups 欄按鈕（結構 selector：ag-grid col-id）
            await page.locator('.ag-row[row-index="0"] .ag-cell[col-id="belongGrups"] button').first().click()
            //等 VePemiBlngGrups 對話框（以其標題 pemiBlngEditGrups 偵測；isEditable 預設 ON → 編輯態標題）
            await waitUntilExist(page, 'VePemiBlngGrups 對話框標題', () => {
                const vo = window.$vo
                const label = vo.$t('pemiBlngEditGrups')
                return (document.body.innerText || '').includes(label)
            }, { timeout: 15000 })
            await page.waitForTimeout(800)
            return await captureStable(page)
        },
        semantic: async (page) => {
            const label = await page.evaluate(() => window.$vo.$t('pemiBlngEditGrups'))
            const txt = await page.evaluate(() => document.body.innerText)
            assert.ok(txt.includes(label), `所屬權限群組檢視對話框標題應顯示（${label}）`)
        },
    },
    {
        //E2E-010：新增列填妥 → 令 token 失效 → 儲存失敗（DB 不變、未存列仍在前端）
        name: 'E2E-010-save-fail',
        run: async (page) => {
            await gotoPemis(page)
            await clickAdd(page)
            await typeIntoCell(page, 0, 'name', 'E2ePemiE010')
            await page.evaluate(() => { window.$vo.$ui.updateUserToken('invalid-token-e010') }) //setup：模擬 token 失效
            await saveAndWaitModal(page) //儲存失敗 → 顯示 CheckYes 失敗 modal（DB 不變）
            return await captureStable(page)
        },
        semantic: async (page) => {
            await assertModalMsg(page, 'pemiSavePemisFail') //結果 modal 顯示儲存失敗（前綴）
            const has = await page.evaluate(() => (window.$vo.$store.state.pemis || []).some((x) => x.name === 'E2ePemiE010'))
            assert.ok(!has, 'token 失效，權限不應寫入 DB')
            const n = await page.evaluate(() => (window.$vo.$store.state.pemis || []).length)
            assert.equal(n, BASE_SEED.length, 'DB 仍為 base seed 筆數')
        },
    },
]

//手術式重產（§6.3）：--names a,b,c 只產指定 case；--langs eng,cht 只產指定語系。截圖「前」就 gate（省截圖成本）。
function argList(flag) {
    const i = process.argv.indexOf(flag)
    if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1].split(',').map((s) => s.trim()).filter(Boolean)
    return null
}
//前綴或完整匹配：傳 'E2E-003' 即可匹配 'E2E-003-add-ok'（避免 §6.3 殷鑑「--names 只認字面」陷阱）
function nameMatch(list, caseName) { return list.some((nm) => caseName === nm || caseName.startsWith(nm)) }
async function generateBaseline() {
    console.log('=== 產製 pemis baseline 開始 ===')
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
            //per-case fresh browser（每 case 全新 browser 進程，消除 GPU/font/CSS cache 跨 case 累積造成
            //的 cold/warm 差異；對齊 sso e2e-adduser 之 per-case chromium.launch，確保 gen 與 mocha 收斂同態）
            const browser = await launchBrowser()
            await resetDb(browser, BASE_SEED) //throwaway page 還原 DB 為 base seed，關閉後再開 case page
            const page = await openApp(browser)
            await setLang(page, lang) //eng 也切（symmetric）：補等同 cht setLang 的 re-render+settle 時間，治 eng-vs-cht layout 收斂不對稱（sso 殷鑑）
            const buf = await c.run(page, lang)
            fs.writeFileSync(picPath(lang, c.name), buf)
            console.log('wrote', picPath(lang, c.name), buf.length, 'bytes')
            await browser.close()
        }
    }
    cleanup()
    console.log('=== 產製 pemis baseline 完成 ===')
}

if (isBaseline) {
    generateBaseline().catch((err) => { console.log('baseline 例外', err); cleanup(); process.exit(1) })
}
else {
    for (const lang of LANGS) {
        describe(`e2e-pemis (${lang})`, function() {
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
                await resetDb(browser, BASE_SEED) //throwaway page 還原 DB 為 base seed
            })
            afterEach(async function() { if (browser) { await browser.close(); browser = null } })
            for (const c of CASES) {
                it(c.name, async () => {
                    const page = await openApp(browser)
                    await setLang(page, lang) //eng 也切（symmetric，治 eng marathon flake）
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
