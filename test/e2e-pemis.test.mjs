//後台權限清單 e2e。對應 spec/流程_後台權限清單.md。鏡像 test/e2e-grups.test.mjs / e2e-targets.test.mjs（canonical pilot）。
//雙模式：
//  - 產 baseline：node test/e2e-pemis.test.mjs --baseline （寫 test/pics/pemis/）
//  - 驗證（mocha）：npx mocha test/e2e-pemis.test.mjs --reporter list （pixelmatch 反鋸齒感知 + maxDiffPixels 容差比對，非 byte-exact）
//  手術式重產（截圖前篩選，規格詳 w-package-tools-e2e 之 README.md §2.2；不符任何鍵即於啟動服務前報錯並列出可用鍵）：
//    --names <項,...>  每項可帶語系前綴（eng-/cht-），不帶則兩語系皆產；階段圖鍵（如 eng-E2E-003-2-row-filled）只寫該張；
//                      案例鍵或其編號前綴（如 E2E-003-add-ok、E2E-003）寫該案全部階段
//    --langs <eng,cht> 限語系（須完全等於已宣告語系）
//    --write-mode missing|changed  只寫標準圖缺少者（追加案例）／只寫與現行標準圖差異超過容差者（預設 all 全寫）
//    env E2E_BASELINE_OUT_DIR=<dir>  寫到暫存目錄（等價驗證用，不動 test/pics）
//  產製端與比對端呼叫同一案例管線（runBaselineCase，見 runCase）：每案 fresh browser → throwaway page 還原 DB 為 base seed →
//  開頁切語系 → 流程截圖 → 語意斷言（兩端皆於寫檔／比對之前；不過則該案一張都不寫）→ 產製端依篩選寫檔／比對端比對標準圖。
//act 走 user-facing input；assert = 語意斷言 + pixel baseline（§6.2 / §6.3）。
//pemis 結構最接近 grups：主鍵為 id（funNew 自動產生、清單隱藏），列鍵以 name 去重；
//name 空 / 重複為「前端 errItemsByName 攔截」（isError 引用 errItemsByName，非空→errInNames 擋存、不送後端，
//對齊 grups / users；異於 targets 之 isError 引用未定義變數恆空而走後端 ckKey）；另有 crules / belongGrups 兩個關聯欄按鈕；
//save 結果（成功 / 失敗 / 空 / errInNames）皆走 $dg.showCheckYes 持久 modal。
import fs from 'fs'
import assert from 'assert'
import { startServersOnce, cleanup, launchBrowser, openApp, captureStableWithBox, rowBoxSel, waitUntilExist, getResolvedActiveTargets, assertBaselineMatch, typeIntoCell, captureBaseSeed, resetDb, setLang, MDI, iconBtn, gotoPemis, checkRow, toggleEditMode, editSwitchLoc, clickAdd, cellHasWarn, clickSave, saveAndWaitModal, assertModalMsg } from './tools/e2e-setup.mjs'
import { runBaselineCase, createBaselineGate, gridContentBox, itemsUnionBox } from './tools/e2eLib.mjs'

const PICS_DIR = './test/pics/pemis'
const LANGS = ['eng', 'cht']
const isBaseline = process.argv.includes('--baseline')

//紅框標注目標（captureStableWithBox）：本 case 主要觀看區
//框實際有內容者（技能 §7.2、§7.3-2；2026-09-28 改：原框表格外框與整條工具列，列少時框進大片空白、工具列右側約 1000px 空白）：
//表格經 gridContentBox 取標頭＋可見資料列；工具列經 itemsUnionBox fit 取其上項目（編輯開關、欄位挑選等）之聯集
const SEL_GRID = '.ag-root-wrapper'                                            //清單 / grid 內容區
const SEL_MODAL = 'div[style*="overscroll-behavior"] div[tabindex="0"] > div'  //WDialog 結果 modal / Ve 對話框
const SEL_TOOLBAR = '[data-fmid="pemis-toolbar"]'                              //功能區工具列
const SEL_NAME_CHK = '.ag-row .ag-cell[col-id="name"] input[type="checkbox"]'  //名稱欄列勾選框（編輯模式才有）
const SEL_NAME_DRAG = '.ag-row .ag-cell[col-id="name"] .ag-row-drag:visible'   //名稱欄拖曳握把（ag-grid rowDrag，編輯模式才有）

function picPath(lang, name) { return `${PICS_DIR}/pemis-${lang}-${name}.png` }

//設定語系（test setup 層，非 act-under-test；對齊雙語覆蓋維度）：setLang 自 e2e-setup.mjs import（原本檔內一份，與 setup 版
//token 逐字相同、僅排版不同，2026-09-28 收斂）。cht 走語系切換；eng 為預設不切，但補等同的 settle buffer（600ms），
//治 eng-vs-cht 收斂不對稱（sso e2e-adduser 殷鑑）。

//gotoPemis／checkRow（colId 預設 'name'）／toggleEditMode／clickAdd／cellHasWarn／clickSave／saveAndWaitModal／
//assertModalMsg：本檔原各自一份，與 e2e-setup.mjs 匯出版逐字相同，2026-09-28 收斂並改 import（見檔頭 import 清單）。
//icon 按鈕（MDI＋iconBtn）與 typeIntoCell／captureBaseSeed／resetDb 之收斂見下方沿用之既有註解。

//—— DB 衛生 helpers ——
//pristine base seed（含全欄位），每 case 前還原 DB，使跨 case／跨語系可重現
let BASE_SEED = null
//captureBaseSeed(page,'pemis') / resetDb(browser,'pemis',seed) 收斂進 e2e-setup.mjs 共用
//（原本 grups/pemis/rela-grup-pemi/rela-pemi-rule/rela-user-grup/targets/users 七檔重複定義）。

//case 定義（順序＝產製順序＝mocha it 順序）：stages 為該案產出之全部圖鍵（與寫檔名、比對名一致，產出與宣告不符即報錯；
//單張案例＝[name]）；run(page,lang) 走流程並回傳截圖 buffer；semantic(page) 為語意斷言，產製端與比對端皆於寫檔／比對之前執行
const CASES = [
    {
        //E2E-001：進入權限頁顯示初始清單（預設編輯模式 ON，比照 pilot 之 list-view 截預設態）
        name: 'E2E-001-list-view',
        stages: ['E2E-001-list-view'],
        run: async (page) => {
            await gotoPemis(page)
            return await captureStableWithBox(page, gridContentBox(SEL_GRID)) //觀看區：權限清單 grid
        },
        semantic: async (page) => {
            const txt = await page.evaluate(() => document.body.innerText)
            assert.ok(txt.includes('權限P1'), '應顯示 base seed pemi 名稱 權限P1')
            assert.ok(txt.includes('權限P2') && txt.includes('權限P4'), '應顯示多筆 base seed pemis')
            //spec E2E-001：編輯模式檢視態下工具列顯示新增按鈕（2026-09-28 補斷言）
            assert.ok(await iconBtn(page, MDI.plus).count() > 0, '預設編輯模式工具列應顯示新增按鈕')
            //spec E2E-001「名稱欄左側也帶有勾選框與拖曳握把」（2026-09-28 補；亦為 E2E-002 反向斷言之選擇器正向校驗）
            assert.ok(await page.locator(SEL_NAME_CHK).count() > 0, '預設編輯模式名稱欄應有勾選框')
            assert.ok(await page.locator(SEL_NAME_DRAG).count() > 0, '預設編輯模式名稱欄應有拖曳握把')
            //對應 spec 語意（A1/A2/A3 欄序與欄名）：可見欄位順序須為「使用欄在所屬欄之前」。
            //以 ag-grid 表頭之 col-id 讀實際顯示序（本頁無對話框開啟，故不需另行 scope）
            const heads = await page.evaluate(() => [...document.querySelectorAll('.ag-header-cell[col-id]')].map((e) => e.getAttribute('col-id')))
            const ks = heads.filter((k) => ["name","description","crules","belongGrups"].includes(k))
            assert.deepEqual(ks, ["name","description","crules","belongGrups"],
                `主表可見欄序應為 ${["name","description","crules","belongGrups"].join(' / ')}（實得 ${JSON.stringify(ks)}）`)
            //對應 spec 語意（A3 欄名）：該欄中文表頭為「管控所屬權限群組」
            const hdr = await page.evaluate((k) => {
                const c = document.querySelector(`.ag-header-cell[col-id="${k}"]`)
                return c ? (c.textContent || '').trim() : null
            }, 'belongGrups')
            const want = await page.evaluate((k) => window.$vo.$t(k), 'belongGrups')
            assert.ok(hdr && hdr.includes(want), `${'belongGrups'} 欄表頭應為語系鍵之文字「${want}」（實得「${hdr}」）`)
        },
    },
    {
        //E2E-002：關閉編輯模式 → 工具列新增/複製/刪除/儲存按鈕隱藏、名稱欄勾選框與拖曳握把消失（唯讀檢視）
        //一次使用者操作＝點擊前／點擊後兩張（技能 §7.1；2026-09-28 E 試點，原單張 E2E-002-edit-mode）
        name: 'E2E-002-edit-mode',
        stages: ['E2E-002-1-click-edit-mode', 'E2E-002-2-edit-mode'],
        run: async (page) => {
            await gotoPemis(page)
            //點擊前: 「編輯模式」開關(框住開關與標籤文字整顆; 開關列無可見邊界且緊貼標籤, 經 itemsUnionBox fit 外擴文字墨跡, 免紅框壓字)
            const s1 = await captureStableWithBox(page, itemsUnionBox(await editSwitchLoc(page), { fit: true }))
            await toggleEditMode(page)
            //結果: 工具列新增鈕消失、名稱欄勾選框與拖曳握把消失(框住工具列上之項目與表格之標頭與各列; 反應橫跨兩處, 相鄰取聯集一框)
            const s2 = await captureStableWithBox(page, [itemsUnionBox(SEL_TOOLBAR, { fit: true }), gridContentBox(SEL_GRID)])
            return [
                { name: 'E2E-002-1-click-edit-mode', buf: s1 },
                { name: 'E2E-002-2-edit-mode', buf: s2 },
            ]
        },
        semantic: async (page) => {
            const cnt = await iconBtn(page, MDI.plus).count()
            assert.equal(cnt, 0, '非編輯模式不應出現新增按鈕')
            //spec E2E-002「name 欄取消勾選與拖曳」（2026-09-28 補：原未斷言）
            assert.equal(await page.locator(SEL_NAME_CHK).count(), 0, '非編輯模式名稱欄不應有勾選框')
            assert.equal(await page.locator(SEL_NAME_DRAG).count(), 0, '非編輯模式名稱欄不應有拖曳握把')
        },
    },
    {
        //E2E-003：新增列 → 填唯一 name → 儲存成功 → 寫入 DB（store 同步）
        name: 'E2E-003-add-ok',
        stages: ['E2E-003-1-row-blank', 'E2E-003-2-row-filled', 'E2E-003-3-add-ok'],
        run: async (page) => {
            await gotoPemis(page)
            await clickAdd(page)
            const s1 = await captureStableWithBox(page, rowBoxSel(0))  //階段1：新增空列（填入前）
            await typeIntoCell(page, 0, 'name', 'E2ePemiE003')
            const s2 = await captureStableWithBox(page, rowBoxSel(0))  //階段2：填妥 name（存檔前）
            await saveAndWaitModal(page)
            const s3 = await captureStableWithBox(page, SEL_MODAL) //階段3：儲存成功結果 modal
            return [
                { name: 'E2E-003-1-row-blank', buf: s1 },
                { name: 'E2E-003-2-row-filled', buf: s2 },
                { name: 'E2E-003-3-add-ok', buf: s3 },
            ]
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
        stages: ['E2E-004-1-row-checked', 'E2E-004-2-copied', 'E2E-004-3-copy-ok'],
        run: async (page) => {
            await gotoPemis(page)
            await checkRow(page, 0) //勾選 base seed 第一列
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
        stages: ['E2E-005-1-row-checked', 'E2E-005-2-deleted', 'E2E-005-3-delete-ok'],
        run: async (page) => {
            await gotoPemis(page)
            await checkRow(page, 0) //勾選 base seed 第一列
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
            await assertModalMsg(page, 'pemiSavePemisSuccess') //結果 modal 顯示儲存成功
            const delName = BASE_SEED[0].name
            const has = await page.evaluate((nm) => (window.$vo.$store.state.pemis || []).some((x) => x.name === nm), delName)
            assert.ok(!has, `base seed 第一列（${delName}）應已刪除`)
            const n = await page.evaluate(() => (window.$vo.$store.state.pemis || []).length)
            assert.equal(n, BASE_SEED.length - 1, `DB 應為 base-1（${BASE_SEED.length - 1}）筆`)
            //【端到端不變式：刪 permission → 受影響 user 權限樹】base seed row 0 = 權限P1（peter 之群組 M1 使用 P1+P2）；
            //刪 P1 後 M1 僅剩 P2 → peter 解析後權限樹失去 P1 獨有的 專案A/頁A/區塊A，剩 P2 的 3 個 target。
            //驗 getPermUserInfor 回傳的 resolved 權限樹，守護「刪權限 → 受影響使用者權限正確縮減」。
            const tree = await getResolvedActiveTargets(page, 'id-for-peter')
            assert.deepEqual(tree, ['專案A/頁C', '專案B/頁A/區塊A', '專案B/頁A/區塊B'],
                `刪除 ${delName} 後，peter 解析後權限樹應只剩 P2 之 target（實得 ${JSON.stringify(tree)}）`)
        },
    },
    {
        //E2E-006：新增列後清空 name → name 欄警告 icon（tooltip pemiNameEmpty）；
        //Save 時前端 isError 彙整 errInNames 擋下、不送後端、DB 不變
        name: 'E2E-006-name-empty',
        stages: ['E2E-006-1-row-added', 'E2E-006-2-name-empty', 'E2E-006-3-errinnames-modal'],
        run: async (page) => {
            await gotoPemis(page)
            await clickAdd(page)
            const s1 = await captureStableWithBox(page, rowBoxSel(0)) //階段1：新增列、自動帶入名（typeIntoCell 前）
            await typeIntoCell(page, 0, 'name', '') //清空 name（清掉自動帶入的「新權限」名）
            assert.ok(await cellHasWarn(page, 0, 'name'), 'name 空應顯示警告 icon（Save 前）')
            const s2 = await captureStableWithBox(page, rowBoxSel(0)) //階段2：name 清空、警告 icon、存檔前
            await saveAndWaitModal(page)
            const s3 = await captureStableWithBox(page, SEL_MODAL) //階段3：errInNames 擋存 modal
            return [
                { name: 'E2E-006-1-row-added', buf: s1 },
                { name: 'E2E-006-2-name-empty', buf: s2 },
                { name: 'E2E-006-3-errinnames-modal', buf: s3 },
            ]
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
        stages: ['E2E-007-1-row-added', 'E2E-007-2-name-dup', 'E2E-007-3-errinnames-modal'],
        run: async (page) => {
            await gotoPemis(page)
            await clickAdd(page)
            const s1 = await captureStableWithBox(page, rowBoxSel(0)) //階段1：新增列、自動帶入名（typeIntoCell 前）
            await typeIntoCell(page, 0, 'name', '權限P1') //取 base seed 既有 pemi name（重複）
            assert.ok(await cellHasWarn(page, 0, 'name'), 'name 重複應顯示警告 icon（Save 前）')
            const s2 = await captureStableWithBox(page, rowBoxSel(0)) //階段2：name 重複、警告 icon、存檔前
            await saveAndWaitModal(page)
            const s3 = await captureStableWithBox(page, SEL_MODAL) //階段3：errInNames 擋存 modal
            return [
                { name: 'E2E-007-1-row-added', buf: s1 },
                { name: 'E2E-007-2-name-dup', buf: s2 },
                { name: 'E2E-007-3-errinnames-modal', buf: s3 },
            ]
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
        stages: ['E2E-008-1-source-row', 'E2E-008-2-dialog-open'],
        run: async (page) => {
            await gotoPemis(page)
            const s1 = await captureStableWithBox(page, rowBoxSel(0)) //階段1：來源列（點按鈕前）
            //點第 1 列 crules 欄按鈕（結構 selector：ag-grid col-id）
            await page.locator('.ag-row[row-index="0"] .ag-cell[col-id="crules"] button').first().click()
            //等 VeCrules 對話框（以其標題 pemiEditCrules 偵測；isEditable 預設 ON → 編輯態標題）
            await waitUntilExist(page, 'VeCrules 對話框標題', () => {
                const vo = window.$vo
                const label = vo.$t('pemiEditCrules')
                return (document.body.innerText || '').includes(label)
            }, { timeout: 15000 })
            await page.waitForTimeout(800)
            const s2 = await captureStableWithBox(page, SEL_MODAL) //階段2：VeCrules 管控規則編輯對話框開啟
            return [
                { name: 'E2E-008-1-source-row', buf: s1 },
                { name: 'E2E-008-2-dialog-open', buf: s2 },
            ]
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
        stages: ['E2E-009-1-source-row', 'E2E-009-2-dialog-open'],
        run: async (page) => {
            await gotoPemis(page)
            const s1 = await captureStableWithBox(page, rowBoxSel(0)) //階段1：來源列（點按鈕前）
            //點第 1 列 belongGrups 欄按鈕（結構 selector：ag-grid col-id）
            await page.locator('.ag-row[row-index="0"] .ag-cell[col-id="belongGrups"] button').first().click()
            //等 VePemiBlngGrups 對話框（以其標題 pemiBlngEditGrups 偵測；isEditable 預設 ON → 編輯態標題）
            await waitUntilExist(page, 'VePemiBlngGrups 對話框標題', () => {
                const vo = window.$vo
                const label = vo.$t('pemiBlngEditGrups')
                return (document.body.innerText || '').includes(label)
            }, { timeout: 15000 })
            await page.waitForTimeout(800)
            const s2 = await captureStableWithBox(page, SEL_MODAL) //階段2：VePemiBlngGrups 所屬權限群組對話框開啟
            return [
                { name: 'E2E-009-1-source-row', buf: s1 },
                { name: 'E2E-009-2-dialog-open', buf: s2 },
            ]
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
        stages: ['E2E-010-1-row-filled', 'E2E-010-2-fail-modal'],
        run: async (page) => {
            await gotoPemis(page)
            await clickAdd(page)
            await typeIntoCell(page, 0, 'name', 'E2ePemiE010')
            const s1 = await captureStableWithBox(page, rowBoxSel(0)) //階段1：填妥合法 name、token 失效前
            await page.evaluate(() => { window.$vo.$ui.updateUserToken('invalid-token-e010') }) //setup：模擬 token 失效
            await saveAndWaitModal(page) //儲存失敗 → 顯示 CheckYes 失敗 modal（DB 不變）
            const s2 = await captureStableWithBox(page, SEL_MODAL) //階段2：儲存失敗結果 modal
            return [
                { name: 'E2E-010-1-row-filled', buf: s1 },
                { name: 'E2E-010-2-fail-modal', buf: s2 },
            ]
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
            await resetDb(browser, 'pemis', BASE_SEED)
            const page = await openApp(browser)
            await setLang(page, lang)
            return page
        },
        semantic: c.semantic ? (ctx) => c.semantic(ctx.page) : null,
        pathOf: picPath,
        labelOf: (lg, key) => `pemis-${lg}-${key}`,
        match: assertBaselineMatch,
        ...extra,
    })
}

async function generateBaseline() {
    console.log('=== 產製 pemis baseline 開始 ===')
    //截圖前篩選（--names / --langs / --write-mode / E2E_BASELINE_OUT_DIR，見檔頭）；不符任何鍵即於此報錯（啟動服務之前）
    const gate = createBaselineGate({ langs: LANGS, cases: CASES })
    console.log(gate.describe())
    await startServersOnce()
    fs.mkdirSync(PICS_DIR, { recursive: true })
    process.env.E2E_STRICT_CAPTURE = '1' //regen 端：captureStable 未 settle 即 throw，拒絕寫入未穩定畫面
    //擷取 pristine base seed（DB 剛 fresh seed）——用臨時 browser
    { const b = await launchBrowser(); const pp = await openApp(b); BASE_SEED = await captureBaseSeed(pp, 'pemis'); await b.close() }
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
    console.log('=== 產製 pemis baseline 完成 ===')
}

if (isBaseline) {
    generateBaseline().catch((err) => { console.log('baseline 例外', err); cleanup(); process.exit(1) })
}
else {
    for (const lang of LANGS) {
        describe(`e2e-pemis (${lang})`, function() {
            this.timeout(180000)
            before(async function() {
                this.timeout(200000)
                await startServersOnce()
                //擷取 BASE_SEED 一次（用臨時 browser）
                if (!BASE_SEED) { const b = await launchBrowser(); const pp = await openApp(b); BASE_SEED = await captureBaseSeed(pp, 'pemis'); await b.close() }
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
