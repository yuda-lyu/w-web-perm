//多人同時編輯共用核心(w-serv-orm 1.1.17)之使用者視角 e2e(perm-run01; 使用者 2026-10-22 裁示原則 10、規格 dspec/多人同時編輯之寫入契約.md 第 5、6、8 節; 對應 spec/流程_多人同時編輯.md E2E-001～038; E2E-025～037 為 perm-run02 範圍一「被引用實體身分」, E2E-038 為 perm-run03 範圍一「移除引用亦須宣告」)。
//雙模式與管線同 test/e2e-external-rows.test.mjs（makeRunner → runBaselineCase）；本檔全為語意案例（stages 空陣列、不產標準圖）——本輪所修缺口皆為「資料／狀態是否正確」，無新畫面。
//  驗證（mocha）：npx mocha test/e2e-concurrent-edit.test.mjs --reporter list --timeout 300000
//
//【要驗的缺口（皆為 1.1.13 之已知缺口，修前紅、修後綠）】
//  (a) 自己存檔成功後立即再編輯再存，不被自己上一次之存檔誤擋（存檔 API 回傳寫入後之列，前端立即以之更新畫面與基準；四清單頁 E2E-001～004、兩對話框 E2E-005～006）
//  (b) 對話框開而未編輯時收到推播：以新資料重建並更新基準（E2E-007～008）
//  (c) 儲存格編輯器開啟中（已輸入、未按 Enter）視為有草稿：不重建、凍結基準、提示（四清單頁 E2E-009～012，Esc 後補重建 E2E-013）。兩個反向對話框無可編輯儲存格（勾選框／chip 即時提交），此項只有單元與靜態涵蓋
//  第 114 項 反向對話框主體（群組／權限）被刪除後以同名重建：存檔拒收並提示重新載入（E2E-014～016）
//  (e) 名次入基準：他人只重排被偵測（E2E-017～018）；系統重編號（名次不變）不誤擋（E2E-019）
//  舊格式（套內版、無 h1: 前綴）基準：拒收並提示重新載入（E2E-020）
//  同構（V10）：前端打包後算出之基準，與伺服端新鮮讀取（經實際資料通道）之列同 id 序、同格式，且被伺服端接受（E2E-021～024）
//  perm-run02 範圍一 被引用實體身分（使用者 2026-10-23 裁示「正反關聯與主體身份檢查,應該是前後端都要做」; 規則帳本 R-SUBJECT-ID-01、R-REF-IDENTITY-01）:
//    反向對話框主體被同名取代、推播尚未抵達（前端自檢看不到）→ 請求送出, 伺服端於主體表鎖內拒收 saveSubjectChanged（E2E-025～026）
//    清單頁新指派之引用（users.cgrups→群組、grups.cpemis→權限、pemis.crules→對象）被同名取代／刪除:
//      伺服端強制 saveRefChanged（E2E-027～029, 推播被攔住, 請求確實送出）; 前端自檢先擋、不送出（E2E-030～032, 推播已抵達 store）
//    引用相符之正常路徑端到端可寫, 且請求帶 opt.refs（E2E-033～035）; 對象之 id 即名稱, 刪除後同 id 重建依定義是同一實體（E2E-036; R-REF-IDENTITY-01 規則 5）
//  (d) 空值等價為單元／API 層（unit-rowDigest RD-F4、unit-draftSync DS-3、api-baseline），e2e 無法造出「同一列兩種空值表示」之真實畫面，不設 e2e 案
//  先動先贏未削弱：他人改任一列、增列、刪列之 e2e 見 test/e2e-external-rows.test.mjs E2E-016～019（本輪不改）；本檔 E2E-017～018 補「只重排」
//
//【輸入空間表】
//  軸 A 頁面（4）：users、grups、pemis、targets（a、c、V10 各四案；e 取 users、grups）
//  軸 B 對話框（2）：VeGrupBlngUsers（群組頁）、VePemiBlngGrups（權限頁）（a、b、114 各取之）
//  軸 C 他人之變更種類（改列／增列／刪列／重排／同名重建／外部重編號）：改列（c、b）、重排（e）、同名重建（114）、重編號（e）；增刪列見 external-rows 檔
//  軸 D 語系（2）：eng、cht 每案兩輪
//  軸 E（perm-run02）被引用實體身分: 反向對話框 2 × {主體原封不動、同名重建且推播已抵達〔前端自檢〕、同名重建且推播尚未抵達〔伺服端強制〕、刪除未重建／改名／開框時未儲存者之同名、格式不合或未帶} ＝ 10 格, 已設 6（E2E-005／006 之成功路徑 2、014／015 2、025／026 2）、未設 4;
//    清單頁正向引用 3 × 8 項能力 ＝ 24 格, 不適用 4（對象無同名重建、users／grups 無同 id 重建）, 適用 20 格已設 10（相符 033～035、同名重建前端 030～031／伺服端 027～028、對象刪除前端 032／伺服端 029、對象同 id 重建 036）、未設 10（被刪除未重建〔users／grups〕前端／伺服端各 2、宣告不完整或格式不合 3、新增停用項不須宣告 3; 由 test/api-identity.test.mjs 與 unit-refIdentity／unit-procCore-identity 涵蓋）。
//  已測案例 37 × 語系 2 = 74 個 it（E2E-001～024 為 24 案 48 個 it; perm-run02 新增 E2E-025～036 共 12 案 24 個 it, 外審 sol#1 補 E2E-037〔同名跨列選取衝突, users 頁, 前端攔下〕1 案 2 個 it）。
//  perm-run03 範圍一（宣告強制必帶＋移除亦須宣告）: 新增 E2E-038（users 頁取消勾選既有引用後存檔 → 請求 opt.refs 含被移除之名稱、存檔成功）1 案 2 個 it ⇒ 共 38 案 76 個 it。
//    既有 E2E-001～037 的意圖不變且不倚賴「不帶宣告」: 清單頁（瀏覽器）本來就送 refs、兩反向對話框本來就送 subject; wrapFapi 只記錄後照原 opt 轉呼叫（不改 refs／subject）; 他人變更／夾具／還原皆經 editTableRows（api-setup.callRpc 自動附宣告）。
//    E2E-005～008／014～016／025～026 之反向對話框存檔只改動主體名稱本身之引用（含取消勾選之移除）, 由 opt.subject 涵蓋（subject 只涵蓋其主體名稱）。
//
//手段說明（setup，非使用者動作）：「他人」＝經管理者寫入 RPC（editTableRows）或外部同步端點；「推播尚未抵達」＝攔住網路推播（holdNetPushes：store.commit 攔下 tableName+data 之 payload，
//  但放行 payload.source==='savedRows'——頁面套用自己存檔回傳列之 commit），模擬「存檔成功後約 2 秒輪詢尚未送達」之窗口；e2e 不 import src／server（R-TEST-SCOPE-01 盤點指令 4），故 V10 以黑箱比對（id 序、格式、伺服端接受）。
//  perm-run02: wrapFapi 另記每次呼叫之 opt.refs／opt.subject 與累計次數（window.__sentAll; 只讀取）, 供 E2E-025～036 斷言「請求確實送出 1 次」「前端攔下故為 0 次」與宣告內容;
//  「推播已抵達但被攔住」以 window.__heldPushes 計數增加偵測（waitHeldMore）, 確認前端 store 看不到變動是因被攔住而非推播根本未發生;
//  E2E-027／028／030／031 於開瀏覽器前追加一個無人引用之群組／權限（fixture）, 理由: 被他人刪除之被引用實體若已被別列引用, 引用連帶清理會改動本頁存檔之表, 伺服端基準比對先於引用宣告比對而回 saveStale（spec〈已知落差〉檢查次序條）。
import assert from 'assert'
import JSON5 from 'json5'
import {
    startServersOnce, cleanup, rowIndexByCell, waitUntilExist, gotoGrups, gotoPemis, typeIntoCell, clickSave, saveAndWaitModal, assertModalMsg, dismissResultModal, pageSaveShown,
    openBelongDialog, toggleDialogEnable, clickDialogSave, waitDialogClosed, expectResultBox, waitDialogGrid,
} from './tools/e2e-setup.mjs'
import { editTableRows, selectAllRows } from './tools/api-setup.mjs'
import {
    ON, snapTables, rowOf, syncRows, createIsolation, makeRunner, waitStoreCount, waitStoreField, cellText, enterPage, gotoTargets, tOf, T, mkU, expectResultBoxAbove,
    pickRow, PICK_U, PICK_G,
} from './tools/e2eExt.mjs'

const FLOW = 'concurrent-edit'
const LANGS = ['eng', 'cht']
const REPEAT = Math.max(1, parseInt(process.env.CE_REPEAT || '1', 10) || 1)

const BELONG_USERS = { colId: 'belongUsers', titleKey: 'grupBlngEditUsers', label: 'VeGrupBlngUsers 對話框標題' }
const BELONG_GRUPS = { colId: 'belongGrups', titleKey: 'pemiBlngEditGrups', label: 'VePemiBlngGrups 對話框標題' }
const F_X = 'appCeX' //E2E-019 之外部來源分區

//—— 四清單頁之組態（base seed：users 4、grups 4、pemis 4、targets 22；description 欄四頁皆可編輯） ——
const PAGES = [
    { kt: 'users', enter: (p) => enterPage(p, 'users', 4), nameCol: 'name', rowName: 'mary', otherId: 'id-for-john', saveOk: 'userSaveUsersSuccess', saveFail: 'userSaveUsersFail', fapi: 'updateUsers', fmid: 'users-banner-stale' },
    { kt: 'grups', enter: (p) => enterPage(p, 'grups', 4), nameCol: 'name', rowName: '權限群組M1', otherId: 'id-for-權限群組M2', saveOk: 'grupSaveGrupsSuccess', saveFail: 'grupSaveGrupsFail', fapi: 'updateGrups', fmid: 'grups-banner-stale' },
    { kt: 'pemis', enter: (p) => enterPage(p, 'pemis', 4), nameCol: 'name', rowName: '權限P1', otherId: 'id-for-權限P2', saveOk: 'pemiSavePemisSuccess', saveFail: 'pemiSavePemisFail', fapi: 'updatePemis', fmid: 'pemis-banner-stale' },
    { kt: 'targets', enter: async (p) => { await gotoTargets(p); await waitStoreCount(p, 'targets', 22) }, nameCol: 'id', rowName: T.A, otherId: T.C, saveOk: 'targetSaveTargetsSuccess', saveFail: 'targetSaveTargetsFail', fapi: 'updateTargets', fmid: 'targets-banner-stale' },
]

//—— 手段：攔住網路推播（放行自己存檔回傳列之 commit） ——
const holdNetPushes = (page) => page.evaluate(() => {
    const st = window.$vo.$store
    window.__heldPushes = []
    window.__origCommit = st.commit
    st.commit = function(type, payload, ...rest) {
        if (payload && typeof payload.tableName === 'string' && Array.isArray(payload.data) && payload.source !== 'savedRows') {
            window.__heldPushes.push({ type, payload })
            return undefined
        }
        return window.__origCommit.call(st, type, payload, ...rest)
    }
})
const releaseNetPushes = (page) => page.evaluate(() => {
    const st = window.$vo.$store
    st.commit = window.__origCommit
    const held = window.__heldPushes || []
    window.__heldPushes = []
    for (const h of held) {
        st.commit(h.type, h.payload)
    }
})
//store 某表某列之欄位值
const storeField = (page, kt, id, f) => page.evaluate(([k, i, ff]) => { const r = (window.$vo.$store.state[k] || []).find((x) => x.id === i); return r ? r[ff] : undefined }, [kt, id, f])
const waitStale = (page, fmid) => waitUntilExist(page, `提示 ${fmid} 出現`, (id) => !!document.querySelector(`[data-fmid="${id}"]`), { arg: fmid, timeout: 30000 })
const waitStaleGone = (page, fmid) => waitUntilExist(page, `提示 ${fmid} 消失`, (id) => !document.querySelector(`[data-fmid="${id}"]`), { arg: fmid, timeout: 30000 })
const staleCount = (page, fmid) => page.evaluate((id) => document.querySelectorAll(`[data-fmid="${id}"]`).length, fmid)
const staleTexts = (page, fmid) => page.evaluate((id) => [...document.querySelectorAll(`[data-fmid="${id}"]`)].map((e) => ((e.querySelector('span') || e).textContent || '').trim()), fmid)
const waitSuccessText = (page, key) => waitUntilExist(page, '成功訊息框', (k) => (document.body.innerText || '').includes(window.$vo.$t(k)), { arg: key, timeout: 30000 })
//對話框內某列「是否使用」核選方塊狀態（對話框 grid 才有 col-id="enable"）
const dlgChecked = (page, k) => page.evaluate((i) => { const e = document.querySelector(`.ag-row[row-index="${i}"] .ag-cell[col-id="enable"] input[type="checkbox"]`); return e ? e.checked : null }, k)
const waitDlgChecked = (page, k, want) => waitUntilExist(page, `對話框第 ${k} 列核選狀態為 ${want}`, (a) => { const e = document.querySelector(`.ag-row[row-index="${a.k}"] .ag-cell[col-id="enable"] input[type="checkbox"]`); return !!e && e.checked === a.want }, { arg: { k, want }, timeout: 30000 })
//perm-run02: 被 holdNetPushes 攔住之某表推播累計數, 及等其增加（他人之變更已隨推播抵達前端、但被攔住而未進 store; 偵測式等待, 免固定秒數）
const heldCount = (page, kt) => page.evaluate((k) => (window.__heldPushes || []).filter((h) => h.payload.tableName === k).length, kt)
const waitHeldMore = (page, kt, n0) => waitUntilExist(page, `推播(${kt})已抵達並被攔住`, (a) => (window.__heldPushes || []).filter((h) => h.payload.tableName === a.k).length > a.n, { arg: { k: kt, n: n0 }, timeout: 30000 })
//wrapFapi 累計之送出紀錄（每次呼叫一筆 { n, baseline, refs, subject }）
const sentAll = (page) => page.evaluate(() => window.__sentAll || [])
//指派欄編輯器／對話框內某列（含 col-id="enable" 者, 以別於主表同 row-index 之列）之文字, 供開窗後核對所點之列確為預期之實體（列次由 store 以 order 推導, 守門免勾錯列）
const dlgRowText = (page, k) => page.evaluate((i) => { const r = [...document.querySelectorAll(`.ag-row[row-index="${i}"]`)].find((e) => e.querySelector('.ag-cell[col-id="enable"]')); return r ? (r.textContent || '') : null }, k)
//指派欄編輯器操作: 於清單頁某列開指派欄編輯器(VeCgrups／VeCpemis／VeCrules) → 核對 pick.row 為預期實體 → 勾選 → 按編輯器儲存鈕(回填, 不打 API) → 等編輯器關閉 → 清單頁出現儲存鈕(已修改)
async function assignViaEditor(page, P, pick) {
    const k = await rowIndexByCell(page, P.nameCol, P.rowName)
    await page.locator(`.ag-row[row-index="${k}"] .ag-cell[col-id="${P.refCol}"] button`).first().click()
    await waitUntilExist(page, `${P.dlgKey} 編輯器標題`, (key) => (document.body.innerText || '').includes(window.$vo.$t(key)), { arg: P.dlgKey, timeout: 15000 })
    await waitDialogGrid(page)
    await waitUntilExist(page, `編輯器第 ${pick.row} 列已渲染`, (i) => [...document.querySelectorAll(`.ag-row[row-index="${i}"]`)].some((e) => !!e.querySelector('.ag-cell[col-id="enable"]')), { arg: pick.row, timeout: 15000 })
    const txt = await dlgRowText(page, pick.row)
    assert.ok(txt !== null && txt.includes(pick.name), `編輯器第 ${pick.row} 列應為「${pick.name}」, 實得 ${JSON.stringify(txt)}`)
    //perm-run03: pick.expectChecked 有給時, 守門「開窗時該列之勾選狀態」與「點擊後翻轉」（移除案用: 開窗時須已勾選, 點擊＝取消勾選; 未給者行為不變）
    if (pick.expectChecked !== undefined) {
        assert.equal(await dlgChecked(page, pick.row), pick.expectChecked, `編輯器第 ${pick.row} 列（${pick.name}）開窗時勾選狀態應為 ${pick.expectChecked}`)
    }
    await toggleDialogEnable(page, pick.row)
    if (pick.expectChecked !== undefined) {
        assert.equal(await dlgChecked(page, pick.row), !pick.expectChecked, `點擊後編輯器第 ${pick.row} 列（${pick.name}）勾選狀態應翻為 ${!pick.expectChecked}`)
    }
    await clickDialogSave(page)
    await waitDialogClosed(page, P.dlgKey)
    assert.equal(await pageSaveShown(page), true, '編輯器回填後清單頁出現儲存鈕(已修改)')
}
//開啟儲存格編輯器並輸入、但不按 Enter（編輯器維持開啟）：與 typeIntoCell 同樣之 user-facing 操作（雙擊→清空→輸入），差別在不提交
async function openEditorTyped(page, rowIndex, colId, value) {
    const cellSel = `.ag-row[row-index="${rowIndex}"] .ag-cell[col-id="${colId}"]`
    await page.locator(cellSel).first().dblclick()
    const inp = page.locator(`${cellSel} input`).first()
    await inp.waitFor({ state: 'visible', timeout: 5000 })
    await page.waitForTimeout(800) //editor mount settle
    await inp.click()
    const cur = await inp.inputValue()
    await page.keyboard.press('End')
    for (let k = 0; k < cur.length + 2; k++) await page.keyboard.press('Backspace')
    await page.keyboard.insertText(value)
    await page.waitForTimeout(300)
}
const editorValues = (page, rowIndex, colId) => page.evaluate(([r, c]) => [...document.querySelectorAll(`.ag-row[row-index="${r}"] .ag-cell[col-id="${c}"] input:not([type="checkbox"])`)].map((e) => e.value), [rowIndex, colId])
//攔 $fapi.<fn>：記錄送出之 rows 數與 baseline（深拷貝）後照常呼叫（V10）；mode 'legacy' 時把 baseline 改寫成套內舊版指紋形狀再送
//perm-run02: 另記每次呼叫之 opt.refs／opt.subject（未帶為 null）於 window.__sentAll（累計, 供斷言送出次數與宣告內容; 只讀取）
const wrapFapi = (page, fn, mode) => page.evaluate(([f, m]) => {
    const api = window.$vo.$fapi
    const orig = api[f]
    window.__sent = null
    window.__sentAll = []
    const cl = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)))
    api[f] = function(rows, opt) {
        const o = { ...(opt || {}) }
        window.__sent = { n: rows.length, baseline: JSON.parse(JSON.stringify(o.baseline)) }
        window.__sentAll.push({ n: rows.length, baseline: cl(o.baseline), refs: cl(o.refs), subject: cl(o.subject) })
        if (m === 'legacy') {
            o.baseline = o.baseline.map((e) => [e[0], 'abc123xyz789'])
        }
        return orig.call(this, rows, o)
    }
}, [fn, mode || 'capture'])

const CASES = []
let seq = 0
const nm = (s) => `E2E-${String(++seq).padStart(3, '0')}-${s}`

//—— (a) 四清單頁：自己存檔成功後立即再編輯再存（推播尚未抵達）——
for (const P of PAGES) {
    CASES.push({
        //6 步 user path: ①進入清單頁 ②雙擊目標列說明欄輸入新說明 ③按儲存, 看到成功訊息 ④按確認 ⑤（推播尚未抵達）立即再雙擊同列輸入第二個說明 ⑥按儲存, 看到成功訊息（不是未儲存/資料已被更新）
        name: nm(`${P.kt}-resave-immediately-after-own-save`),
        stages: [],
        run: async (page) => {
            await P.enter(page)
            await holdNetPushes(page) //模擬約 2 秒輪詢之推播尚未送達
            let k = await rowIndexByCell(page, P.nameCol, P.rowName)
            const D1 = `CE-a1-${P.kt}`
            await typeIntoCell(page, k, 'description', D1)
            await saveAndWaitModal(page)
            await assertModalMsg(page, P.saveOk)
            await dismissResultModal(page)
            //spec E2E-001～004 驗證1: 回傳之寫入後之列已立即更新 store（網路推播仍被攔住）, 清單為剛存內容、儲存鈕消失、無過期橫幅
            assert.equal(await storeField(page, P.kt, await idOf(page, P), 'description'), D1, 'store 已為伺服端回傳之寫入後之列（不待推播）')
            assert.equal(await pageSaveShown(page), false)
            assert.equal(await staleCount(page, P.fmid), 0)
            //spec E2E-001～004 驗證2: 立即再編輯再存 → 成功（修前：以存檔前之基準送出, 被自己上一次之存檔誤擋 saveStale）
            k = await rowIndexByCell(page, P.nameCol, P.rowName)
            const D2 = `CE-a2-${P.kt}`
            await typeIntoCell(page, k, 'description', D2)
            await saveAndWaitModal(page)
            await assertModalMsg(page, P.saveOk)
            await dismissResultModal(page)
            await releaseNetPushes(page)
            await page.waitForTimeout(1500) //負向觀察窗: 推播（同內容）放行後不得出現橫幅或儲存鈕
            assert.equal(await staleCount(page, P.fmid), 0, '其後抵達之同內容推播不視為他人更新')
            assert.equal(await pageSaveShown(page), false)
            return null
        },
        semantic: async () => {
            const rows = await selectAllRows(P.kt)
            assert.equal(rows.find((r) => r[P.nameCol] === P.rowName).description, `CE-a2-${P.kt}`, '第二次存檔已寫入')
        },
    })
}
//目標列之 id（store 內以名稱欄找）
async function idOf(page, P) {
    return await page.evaluate(([k, c, n]) => (window.$vo.$store.state[k] || []).find((r) => r[c] === n).id, [P.kt, P.nameCol, P.rowName])
}

//—— (a) 兩反向對話框：存檔成功後（推播尚未抵達）立即再開同一視窗再存 ——
CASES.push({
    //6 步 user path: ①群組頁開 M1「所屬使用者」對話框 ②勾選 john, 按儲存, 看到成功訊息, 按確認, 對話框關閉 ③（推播尚未抵達）立即再開同一對話框, 看到 john 已勾選 ④勾選 mary ⑤按儲存, 看到成功訊息
    name: nm('users-dialog-reopen-after-own-save'),
    stages: [],
    run: async (page) => {
        await gotoGrups(page)
        await holdNetPushes(page)
        await openBelongDialog(page, 0, BELONG_USERS) //row 0 = 權限群組M1; 對話框列: row0=peter, row1=mary, row2=john, row3=admin
        await toggleDialogEnable(page, 2)
        await clickDialogSave(page)
        await waitSuccessText(page, 'userSaveUsersSuccess')
        await dismissResultModal(page)
        await waitDialogClosed(page, BELONG_USERS.titleKey)
        //spec E2E-005 驗證1: 重開對話框時資料即為剛存內容（store 已由回傳列更新, 不待推播）
        await openBelongDialog(page, 0, BELONG_USERS)
        assert.equal(await dlgChecked(page, 2), true, 'john 已勾選（剛存內容）')
        //spec E2E-005 驗證2: 立即再存成功（修前：以舊 store 建基準, 被自己上一次之存檔誤擋）
        await toggleDialogEnable(page, 1)
        await clickDialogSave(page)
        await waitSuccessText(page, 'userSaveUsersSuccess')
        await dismissResultModal(page)
        await waitDialogClosed(page, BELONG_USERS.titleKey)
        await releaseNetPushes(page)
        return null
    },
    semantic: async () => {
        const us = await selectAllRows('users')
        assert.ok(JSON5.parse(rowOf(us, 'id-for-john').cgrups)['權限群組M1'], 'john 屬於 M1')
        assert.ok(JSON5.parse(rowOf(us, 'id-for-mary').cgrups)['權限群組M1'], 'mary 屬於 M1')
    },
})
CASES.push({
    //6 步 user path: ①權限頁開 P1「所屬群組」對話框 ②勾選 M2, 按儲存, 看到成功訊息, 按確認, 對話框關閉 ③（推播尚未抵達）立即再開同一對話框, 看到 M2 已勾選 ④勾選 M3 ⑤按儲存, 看到成功訊息
    name: nm('grups-dialog-reopen-after-own-save'),
    stages: [],
    run: async (page) => {
        await gotoPemis(page)
        await holdNetPushes(page)
        await openBelongDialog(page, 0, BELONG_GRUPS) //row 0 = 權限P1; 對話框列依群組 order: row0=M1, row1=M2, row2=M3, row3=M4
        await toggleDialogEnable(page, 1)
        await clickDialogSave(page)
        await waitSuccessText(page, 'grupSaveGrupsSuccess')
        await dismissResultModal(page)
        await waitDialogClosed(page, BELONG_GRUPS.titleKey)
        await openBelongDialog(page, 0, BELONG_GRUPS)
        assert.equal(await dlgChecked(page, 1), true, 'M2 已勾選（剛存內容）')
        await toggleDialogEnable(page, 2)
        await clickDialogSave(page)
        await waitSuccessText(page, 'grupSaveGrupsSuccess')
        await dismissResultModal(page)
        await waitDialogClosed(page, BELONG_GRUPS.titleKey)
        await releaseNetPushes(page)
        return null
    },
    semantic: async () => {
        const gs = await selectAllRows('grups')
        assert.ok(JSON5.parse(rowOf(gs, 'id-for-權限群組M2').cpemis)['權限P1'], 'M2 含 P1')
        assert.ok(JSON5.parse(rowOf(gs, 'id-for-權限群組M3').cpemis)['權限P1'], 'M3 含 P1')
    },
})

//—— (b) 對話框開而未編輯時收到推播：以新資料重建並更新基準 ——
CASES.push({
    //6 步 user path: ①群組頁開 M1「所屬使用者」對話框（不勾選任何項目） ②（他人把 john 加入 M1） ③看到對話框內 john 變成已勾選（重建）、無「資料已被更新」提示 ④勾選 mary ⑤按儲存, 看到成功訊息（基準已更新, 不被擋）⑥john 之他人變更仍在
    name: nm('users-dialog-rebuild-when-unmodified'),
    stages: [],
    run: async (page) => {
        await gotoGrups(page)
        await openBelongDialog(page, 0, BELONG_USERS)
        assert.equal(await dlgChecked(page, 2), false, '前提: john 原不屬 M1')
        const OTHER = await (async () => {
            const us = await selectAllRows('users')
            const old = JSON5.parse(rowOf(us, 'id-for-john').cgrups || '{}')
            return JSON.stringify({ ...old, 權限群組M1: ON() })
        })()
        await editTableRows('users', (rows) => {
            rows.find((r) => r.id === 'id-for-john').cgrups = OTHER
            return rows
        })
        //spec E2E-007 驗證1: 推播抵達後對話框重建（john 變已勾選）; 未編輯故不顯示過期提示
        await waitDlgChecked(page, 2, true)
        assert.equal(await staleCount(page, 'grup-blng-users-banner-stale'), 0, '無未存修改: 重建而非提示')
        //spec E2E-007 驗證2: 其後勾選 mary 並存檔成功（基準已更新; 修前: 停在過期資料, 存檔被伺服端以 saveStale 拒收）
        await toggleDialogEnable(page, 1)
        await clickDialogSave(page)
        await waitSuccessText(page, 'userSaveUsersSuccess')
        await dismissResultModal(page)
        await waitDialogClosed(page, BELONG_USERS.titleKey)
        return null
    },
    semantic: async () => {
        const us = await selectAllRows('users')
        assert.ok(JSON5.parse(rowOf(us, 'id-for-john').cgrups)['權限群組M1'], '他人把 john 加入 M1 之變更保留（未被對話框之舊資料覆蓋）')
        assert.ok(JSON5.parse(rowOf(us, 'id-for-mary').cgrups)['權限群組M1'], 'mary 已加入 M1')
    },
})
CASES.push({
    //6 步 user path: ①權限頁開 P1「所屬群組」對話框（不勾選） ②（他人讓 M2 含 P1） ③看到對話框內 M2 變成已勾選（重建）、無過期提示 ④勾選 M3 ⑤按儲存, 看到成功訊息 ⑥M2 之他人變更仍在
    name: nm('grups-dialog-rebuild-when-unmodified'),
    stages: [],
    run: async (page) => {
        await gotoPemis(page)
        await openBelongDialog(page, 0, BELONG_GRUPS)
        assert.equal(await dlgChecked(page, 1), false, '前提: M2 原不含 P1')
        const OTHER = JSON.stringify({ ...JSON5.parse(rowOf(await selectAllRows('grups'), 'id-for-權限群組M2').cpemis || '{}'), 權限P1: ON() })
        await editTableRows('grups', (rows) => {
            rows.find((r) => r.id === 'id-for-權限群組M2').cpemis = OTHER
            return rows
        })
        await waitDlgChecked(page, 1, true)
        assert.equal(await staleCount(page, 'pemi-blng-grups-banner-stale'), 0, '無未存修改: 重建而非提示')
        await toggleDialogEnable(page, 2)
        await clickDialogSave(page)
        await waitSuccessText(page, 'grupSaveGrupsSuccess')
        await dismissResultModal(page)
        await waitDialogClosed(page, BELONG_GRUPS.titleKey)
        return null
    },
    semantic: async () => {
        const gs = await selectAllRows('grups')
        assert.ok(JSON5.parse(rowOf(gs, 'id-for-權限群組M2').cpemis)['權限P1'], '他人讓 M2 含 P1 之變更保留')
        assert.ok(JSON5.parse(rowOf(gs, 'id-for-權限群組M3').cpemis)['權限P1'], 'M3 含 P1')
    },
})

//—— (c) 儲存格編輯器開啟中（已輸入、未按 Enter）視為有草稿 ——
for (const P of PAGES) {
    CASES.push({
        //6 步 user path: ①進入清單頁 ②雙擊目標列說明欄輸入文字、不按 Enter ③（他人改了同表另一列之說明） ④看到編輯器仍開著且輸入保留、清單上方出現過期橫幅（草稿未被重建丟棄） ⑤按 Enter 提交、按儲存, 看到未儲存訊息框（先動先贏） ⑥庫內零寫入
        name: nm(`${P.kt}-open-editor-is-draft`),
        stages: [],
        run: async (page, lang) => {
            await P.enter(page)
            const k = await rowIndexByCell(page, P.nameCol, P.rowName)
            const TYPED = `CE-c-typed-${P.kt}`
            await openEditorTyped(page, k, 'description', TYPED)
            assert.deepEqual(await editorValues(page, k, 'description'), [TYPED], '前提: 編輯器開啟中且已輸入')
            assert.equal(await pageSaveShown(page), false, '前提: 尚未提交, 無已提交之未存修改（儲存鈕不出現）')
            const OTHER = `CE-c-other-${P.kt}`
            await editTableRows(P.kt, (rows) => {
                rows.find((r) => r.id === P.otherId).description = OTHER
                return rows
            })
            await waitStoreField(page, P.kt, P.otherId, 'description', OTHER)
            await waitStale(page, P.fmid)
            //spec E2E-009～012 驗證1: 不重建——編輯器仍開著且輸入保留; 凍結基準——橫幅出現（單一橫幅, 文字為 staleDraftNotice）
            assert.deepEqual(await editorValues(page, k, 'description'), [TYPED], '編輯器未被重建丟棄, 輸入保留（修前: 推播重建清單, 編輯器消失、輸入遺失且無任何提示）')
            assert.deepEqual(await staleTexts(page, P.fmid), [await tOf(page, 'staleDraftNotice')])
            //spec E2E-009～012 驗證2: 按 Enter 提交 → 儲存鈕出現; 按儲存 → 伺服端以基準比對拒收（saveStale）, 零寫入
            await page.keyboard.press('Enter')
            await page.waitForTimeout(600)
            assert.equal(await pageSaveShown(page), true, '提交後出現儲存鈕')
            assert.equal(await cellText(page, k, 'description'), TYPED)
            const dbBefore = await snapTables([P.kt])
            await clickSave(page)
            await expectResultBox(page, 'saveStale 訊息框', `${await tOf(page, P.saveFail)}: ${await tOf(page, 'saveStale')}`)
            await dismissResultModal(page)
            assert.deepEqual(await snapTables([P.kt]), dbBefore, '被拒: 零寫入')
            return null
        },
        semantic: async () => {
            const rows = await selectAllRows(P.kt)
            assert.equal(rows.find((r) => r.id === P.otherId).description, `CE-c-other-${P.kt}`, '他人之變更保留')
            assert.notEqual(rows.find((r) => r[P.nameCol] === P.rowName).description, `CE-c-typed-${P.kt}`, '被拒之輸入未寫入')
        },
    })
}
CASES.push({
    //6 步 user path: ①使用者頁雙擊 mary 說明欄輸入文字、不按 Enter ②（他人改了 john 之說明）③看到編輯器仍開著、出現過期橫幅 ④按 Esc 放棄輸入 ⑤橫幅消失、清單重建為最新資料（john 之說明為他人版本）、無儲存鈕
    name: nm('users-open-editor-escape-then-rebuild'),
    stages: [],
    run: async (page) => {
        await enterPage(page, 'users', 4)
        const k = await rowIndexByCell(page, 'name', 'mary')
        await openEditorTyped(page, k, 'description', 'CE-c-escape-typed')
        const OTHER = 'CE-c-escape-other'
        await editTableRows('users', (rows) => {
            rows.find((r) => r.id === 'id-for-john').description = OTHER
            return rows
        })
        await waitStoreField(page, 'users', 'id-for-john', 'description', OTHER)
        await waitStale(page, 'users-banner-stale')
        assert.deepEqual(await editorValues(page, k, 'description'), ['CE-c-escape-typed'], '編輯器仍開著')
        await page.keyboard.press('Escape')
        //spec E2E-013 驗證: 編輯結束且無未存修改 → 補上保留期間跳過之重建: 橫幅消失、john 之說明為他人版本、無儲存鈕
        await waitStaleGone(page, 'users-banner-stale')
        await page.waitForTimeout(800)
        const kj = await rowIndexByCell(page, 'name', 'john')
        assert.equal(await cellText(page, kj, 'description'), OTHER, '清單重建為最新資料')
        assert.equal(await pageSaveShown(page), false)
        return null
    },
    semantic: async () => {
        assert.equal(rowOf(await selectAllRows('users'), 'id-for-john').description, 'CE-c-escape-other')
    },
})

//—— 第 114 項：反向對話框主體被刪除後以同名重建 ——
CASES.push({
    //6 步 user path: ①群組頁開 M1「所屬使用者」對話框 ②勾選 john（未存） ③（他人刪除 M1 並以同名重建, id 不同） ④看到對話框內出現「資料已被更新」提示 ⑤按儲存, 看到未儲存訊息框（點名 M1 已被刪除/改名/取代） ⑥庫內使用者零寫入, 對話框仍開著
    name: nm('users-dialog-subject-replaced'),
    stages: [],
    run: async (page) => {
        await gotoGrups(page)
        await openBelongDialog(page, 0, BELONG_USERS)
        await toggleDialogEnable(page, 2)
        await editTableRows('grups', (rows) => [...rows.filter((r) => r.id !== 'id-for-權限群組M1'), { id: 'id-ce-m1-new', order: 99, name: '權限群組M1', description: '同名重建之群組', from: '', cpemis: '{}' }])
        await waitUntilExist(page, '群組表已含重建之 M1', () => (window.$vo.$store.state.grups || []).some((r) => r.id === 'id-ce-m1-new') && !(window.$vo.$store.state.grups || []).some((r) => r.id === 'id-for-權限群組M1'), { timeout: 30000 })
        await waitStale(page, 'grup-blng-users-banner-stale')
        assert.deepEqual(await staleTexts(page, 'grup-blng-users-banner-stale'), [await tOf(page, 'staleDraftNoticeDialog')])
        const dbBefore = await snapTables(['users'])
        await clickDialogSave(page)
        const msg = (await tOf(page, 'relSubjectChangedGrup')).split('{name}').join('權限群組M1')
        await expectResultBoxAbove(page, '主體被取代訊息框', msg)
        await dismissResultModal(page)
        assert.deepEqual(await snapTables(['users']), dbBefore, '被拒: users 零寫入（不會讓使用者之授權指向同名之新群組）')
        assert.ok(await page.evaluate((k) => (document.body.innerText || '').includes(window.$vo.$t(k)), 'grupBlngEditUsers'), '被拒後對話框仍開著')
        return null
    },
    semantic: async () => {
        const us = await selectAllRows('users')
        assert.ok(!JSON5.parse(rowOf(us, 'id-for-john').cgrups)['權限群組M1'], 'john 之授權設定不得被本次被拒之儲存改寫')
        assert.ok(rowOf(await selectAllRows('grups'), 'id-ce-m1-new'), '他人重建之群組仍在')
    },
})
CASES.push({
    //6 步 user path: ①權限頁開 P1「所屬群組」對話框 ②勾選 M2（未存）③（他人刪除 P1 並以同名重建, id 不同）④看到對話框內出現過期提示 ⑤按儲存, 看到未儲存訊息框（點名 P1）⑥庫內群組零寫入
    name: nm('grups-dialog-subject-replaced'),
    stages: [],
    run: async (page) => {
        await gotoPemis(page)
        await openBelongDialog(page, 0, BELONG_GRUPS)
        await toggleDialogEnable(page, 1)
        await editTableRows('pemis', (rows) => [...rows.filter((r) => r.id !== 'id-for-權限P1'), { id: 'id-ce-p1-new', order: 99, name: '權限P1', description: '同名重建之權限', from: '', crules: '{}' }])
        await waitUntilExist(page, '權限表已含重建之 P1', () => (window.$vo.$store.state.pemis || []).some((r) => r.id === 'id-ce-p1-new') && !(window.$vo.$store.state.pemis || []).some((r) => r.id === 'id-for-權限P1'), { timeout: 30000 })
        await waitStale(page, 'pemi-blng-grups-banner-stale')
        const dbBefore = await snapTables(['grups'])
        await clickDialogSave(page)
        const msg = (await tOf(page, 'relSubjectChangedPemi')).split('{name}').join('權限P1')
        await expectResultBoxAbove(page, '主體被取代訊息框', msg)
        await dismissResultModal(page)
        assert.deepEqual(await snapTables(['grups']), dbBefore, '被拒: grups 零寫入')
        return null
    },
    semantic: async () => {
        const gs = await selectAllRows('grups')
        assert.ok(!JSON5.parse(rowOf(gs, 'id-for-權限群組M2').cpemis)['權限P1'], 'M2 之授權設定不得被本次被拒之儲存改寫')
    },
})
CASES.push({
    //6 步 user path: ①群組頁開 M1「所屬使用者」對話框（不勾選）②（他人刪除 M1 並以同名重建）③看到對話框內出現過期提示（主體已被取代; 因無未存修改, 不重建舊資料）④勾選 john ⑤按儲存, 看到未儲存訊息框 ⑥庫內使用者零寫入
    name: nm('users-dialog-subject-replaced-then-edit'),
    stages: [],
    run: async (page) => {
        await gotoGrups(page)
        await openBelongDialog(page, 0, BELONG_USERS)
        await editTableRows('grups', (rows) => [...rows.filter((r) => r.id !== 'id-for-權限群組M1'), { id: 'id-ce-m1-new2', order: 99, name: '權限群組M1', description: '同名重建之群組', from: '', cpemis: '{}' }])
        await waitUntilExist(page, '群組表已含重建之 M1', () => (window.$vo.$store.state.grups || []).some((r) => r.id === 'id-ce-m1-new2'), { timeout: 30000 })
        await waitStale(page, 'grup-blng-users-banner-stale') //主體被取代: 即使未編輯也提示
        await toggleDialogEnable(page, 2)
        const dbBefore = await snapTables(['users'])
        await clickDialogSave(page)
        const msg = (await tOf(page, 'relSubjectChangedGrup')).split('{name}').join('權限群組M1')
        await expectResultBoxAbove(page, '主體被取代訊息框', msg)
        await dismissResultModal(page)
        assert.deepEqual(await snapTables(['users']), dbBefore, '被拒: users 零寫入')
        return null
    },
    semantic: async () => {
        assert.ok(!JSON5.parse(rowOf(await selectAllRows('users'), 'id-for-john').cgrups)['權限群組M1'])
    },
})

//—— (e) 名次入基準 ——
for (const P of PAGES.filter((q) => q.kt === 'users' || q.kt === 'grups')) {
    CASES.push({
        //6 步 user path: ①進入清單頁 ②雙擊目標列說明欄輸入新說明（未存）③（他人只把前兩列對調, 內容不變）④看到過期橫幅（名次不同）⑤按儲存, 看到未儲存訊息框, 庫內順序維持他人之重排（不被我的舊順序蓋回）
        name: nm(`${P.kt}-reorder-by-other-detected`),
        stages: [],
        run: async (page) => {
            await P.enter(page)
            const k = await rowIndexByCell(page, P.nameCol, P.rowName)
            await typeIntoCell(page, k, 'description', `CE-e-draft-${P.kt}`)
            const before = (await selectAllRows(P.kt)).slice().sort((a, b) => a.order - b.order).map((r) => r.id)
            await editTableRows(P.kt, (rows) => {
                const t = rows[0]
                rows[0] = rows[1]
                rows[1] = t
                return rows
            })
            const swapped = [before[1], before[0], ...before.slice(2)]
            await waitUntilExist(page, 'store 已為重排後之順序', (a) => { const ids = (window.$vo.$store.state[a.k] || []).slice().sort((x, y) => x.order - y.order).map((r) => r.id); return JSON.stringify(ids) === JSON.stringify(a.want) }, { arg: { k: P.kt, want: swapped }, timeout: 30000 })
            //spec E2E-017～018 驗證1: 名次不同 → 草稿保留且出現過期橫幅（修前: order 不入基準, 無橫幅）
            await waitStale(page, P.fmid)
            //spec E2E-017～018 驗證2: 按儲存被拒（saveStale）, 庫內順序仍為他人重排後之順序
            const dbBefore = await snapTables([P.kt])
            await clickSave(page)
            await expectResultBox(page, 'saveStale 訊息框', `${await tOf(page, P.saveFail)}: ${await tOf(page, 'saveStale')}`)
            await dismissResultModal(page)
            assert.deepEqual(await snapTables([P.kt]), dbBefore, '被拒: 零寫入')
            const after = (await selectAllRows(P.kt)).slice().sort((a, b) => a.order - b.order).map((r) => r.id)
            assert.deepEqual(after, swapped, '庫內順序維持他人之重排')
            return null
        },
    })
}
CASES.push({
    //6 步 user path: ①使用者頁雙擊 mary 說明欄輸入新說明（未存）②（外部來源把其外部使用者之 order 全部平移, 相對名次不變）③看到無過期橫幅 ④按儲存, 看到成功訊息（系統重編號不誤擋）
    name: nm('users-external-order-shift-not-blocked'),
    stages: [],
    fixture: async () => {
        await syncRows('users', [mkU('id-ce-x1', 'ce-x1', {}, { order: 100, description: 'ce外部一' }), mkU('id-ce-x2', 'ce-x2', {}, { order: 101, description: 'ce外部二' })], F_X)
    },
    run: async (page) => {
        await enterPage(page, 'users', 6)
        const k = await rowIndexByCell(page, 'name', 'mary')
        await typeIntoCell(page, k, 'description', 'CE-e-renumber-draft')
        //perm-run03(外部匯入改依 srcKey 差異同步): 夾具標籤 id-ce-x1／id-ce-x2 是 srcKey, 真實 id 由伺服端產生; 平移 order 為依 srcKey 修改(id 不變), 故先取 ce-x1 之真實 id 供 store 等待
        const idX1 = (await selectAllRows('users')).find((r) => r.srcKey === 'id-ce-x1').id
        assert.deepEqual(await syncRows('users', [mkU('id-ce-x1', 'ce-x1', {}, { order: 200, description: 'ce外部一' }), mkU('id-ce-x2', 'ce-x2', {}, { order: 201, description: 'ce外部二' })], F_X), { nAdd: 0, nUpdate: 2, nDel: 0, nSame: 0 }, 'order 全部平移: 依 srcKey 修改 2 列')
        await waitUntilExist(page, 'store 已含平移後之 order', (a) => (window.$vo.$store.state.users || []).some((r) => r.id === a.id && r.order === 200), { timeout: 30000, arg: { id: idX1 } })
        await page.waitForTimeout(1200)
        //spec E2E-019 驗證: 外部列 order 數值全變而相對名次不變 → 不是他人重排: 無橫幅, 儲存成功
        assert.equal(await staleCount(page, 'users-banner-stale'), 0)
        await saveAndWaitModal(page)
        await assertModalMsg(page, 'userSaveUsersSuccess')
        await dismissResultModal(page)
        return null
    },
    semantic: async () => {
        const us = await selectAllRows('users')
        assert.equal(rowOf(us, 'id-for-mary').description, 'CE-e-renumber-draft')
        assert.equal(rowOf(us, 'id-ce-x1').order, 200, '外部列 order 維持外部給的值（後台儲存不重編外部列）')
    },
})

//—— 舊格式（套內版、無 h1: 前綴）基準：拒收並提示重新載入 ——
CASES.push({
    //6 步 user path: ①使用者頁雙擊 mary 說明欄輸入新說明（未存）②（此頁是升級前載入的舊頁面: 送出的基準為套內舊版指紋形狀）③按儲存, 看到未儲存訊息框（無法辨識資料版本, 請重新整理）④庫內零寫入, 草稿仍在
    name: nm('users-legacy-baseline-rejected'),
    stages: [],
    run: async (page) => {
        await enterPage(page, 'users', 4)
        const k = await rowIndexByCell(page, 'name', 'mary')
        await typeIntoCell(page, k, 'description', 'CE-legacy-draft')
        await wrapFapi(page, 'updateUsers', 'legacy')
        const dbBefore = await snapTables(['users'])
        await clickSave(page)
        //spec E2E-020 驗證: 拒收鍵 saveBaselineFormat（不降級為不帶基準而寫入）
        await expectResultBox(page, 'saveBaselineFormat 訊息框', `${await tOf(page, 'userSaveUsersFail')}: ${await tOf(page, 'saveBaselineFormat')}`)
        await dismissResultModal(page)
        assert.deepEqual(await snapTables(['users']), dbBefore, '被拒: 零寫入')
        assert.equal(await cellText(page, k, 'description'), 'CE-legacy-draft', '草稿仍在')
        assert.equal(await pageSaveShown(page), true)
        return null
    },
    semantic: async () => {
        assert.notEqual(rowOf(await selectAllRows('users'), 'id-for-mary').description, 'CE-legacy-draft')
    },
})

//—— V10 同構：前端打包後算出之基準 ＝ 伺服端新鮮讀取（經實際資料通道）之列 ——
for (const P of PAGES) {
    CASES.push({
        //6 步 user path: ①進入清單頁 ②雙擊目標列說明欄輸入新說明 ③按儲存（頁面把前端算出之基準隨請求送出）④看到成功訊息（伺服端以自己新鮮讀取之列重算, 與前端送來之基準相符）
        name: nm(`${P.kt}-frontend-baseline-equals-server`),
        stages: [],
        run: async (page) => {
            await P.enter(page)
            const k = await rowIndexByCell(page, P.nameCol, P.rowName)
            await wrapFapi(page, P.fapi, 'capture')
            await typeIntoCell(page, k, 'description', `CE-v10-${P.kt}`)
            const rowsServer = await selectAllRows(P.kt) //經實際資料通道讀伺服端現況
            await saveAndWaitModal(page)
            await assertModalMsg(page, P.saveOk) //伺服端接受＝其鎖內新鮮讀取算出之基準與前端送來者逐項相等（compareBaseline 嚴格比對 id 序與每列摘要）
            await dismissResultModal(page)
            const sent = await page.evaluate(() => window.__sent)
            assert.ok(sent && Array.isArray(sent.baseline), '應攔到送出之基準')
            //spec E2E-021～024: 基準之 id 序＝伺服端列依 (order, id) 排名; 格式為 h1 版（'h1:' + 14 位小寫十六進位）; 列數相同
            const want = rowsServer.slice().sort((a, b) => (a.order - b.order) || (a.id < b.id ? -1 : (a.id > b.id ? 1 : 0))).map((r) => r.id)
            assert.deepEqual(sent.baseline.map((e) => e[0]), want, '前端基準之 id 序＝伺服端名次')
            assert.ok(sent.baseline.every((e) => /^h1:[0-9a-f]{14}$/.test(e[1])), '前端基準之摘要為 h1 格式')
            assert.equal(sent.n, rowsServer.length)
            return null
        },
        semantic: async () => {
            const rows = await selectAllRows(P.kt)
            assert.equal(rows.find((r) => r[P.nameCol] === P.rowName).description, `CE-v10-${P.kt}`)
        },
    })
}

//—— perm-run02 範圍一: 被引用實體身分（使用者 2026-10-23 裁示「正反關聯與主體身份檢查,應該是前後端都要做」; R-SUBJECT-ID-01、R-REF-IDENTITY-01）——
//各語系鍵之字面片段（擋「$t 回 key 本身或語系對調」; 期望全文另由頁面 $t 取得）
const LIT = {
    eng: { subject: 'has been deleted, renamed or replaced by another one since then', refChanged: 'has been deleted or replaced by another one with the same name' },
    cht: { subject: '自開啟後已被刪除、改名或被另一個取代', refChanged: '已被刪除，或被同名的另一個取代' },
}
const T_X = '專案A/頁A/區塊A/執行按鈕' //targets order 1（編輯器 row1）; base seed 四個權限之 crules 皆未引用, 故其被刪除不經引用連帶改動 pemis（spec〈已知落差〉檢查次序條）
const FX_G = { name: '權限群組M9', id: 'id-ce-m9', newId: 'id-ce-m9-new' } //案前追加之無人引用群組（base seed 之 M1～M4 各被一位使用者引用）
const FX_P = { name: '權限P9', id: 'id-ce-p9', newId: 'id-ce-p9-new' } //案前追加之無人引用權限（base seed 之 P1～P4 各被至少一個群組引用）
const mkFxG = (id, desc) => ({ id, order: 99, name: FX_G.name, description: desc, from: '', cpemis: '{}' })
const mkFxP = (id, desc) => ({ id, order: 99, name: FX_P.name, description: desc, from: '', crules: '{}' })
const PICK_P = ['id', 'name', 'description', 'from', 'crules']
const isOn = (v) => v === 'y' || (v !== null && typeof v === 'object' && v.isActive === 'y')
//三清單頁之指派欄組態:
//  refCol／dlgKey: 指派欄 col-id 與編輯器標題鍵; refKt: 被引用表; refField: 授權欄; pick: 內容欄清單;
//  ok: 正常路徑所選之既存被引用實體（row 為編輯器列次）; fx: 被他人取代／刪除之被引用實體（id 為案前或 base seed 之 id, newId 為同名重建後之 id, 無則為刪除）;
//  mkFixture: 開瀏覽器前追加 fx（pemis 頁之 fx 為 base seed 既有對象, 不須追加）; other: 他人取代／刪除 fx（經管理者寫入 RPC）
const REF_PAGES = [
    {
        kt: 'users', enter: PAGES[0].enter, nameCol: 'name', rowName: 'mary', refCol: 'cgrups', dlgKey: 'userEditCgrups', refKt: 'grups', refField: 'cgrups', pick: PICK_U,
        saveOk: 'userSaveUsersSuccess', saveFail: 'userSaveUsersFail', fapi: 'updateUsers',
        ok: { name: '權限群組M1', id: 'id-for-權限群組M1', row: 0 },
        fx: { name: FX_G.name, id: FX_G.id, newId: FX_G.newId, row: 4 },
        mkFixture: async () => { await editTableRows('grups', (rows) => [...rows, mkFxG(FX_G.id, '案前追加之群組')]) },
        other: async () => { await editTableRows('grups', (rows) => [...rows.filter((r) => r.id !== FX_G.id), mkFxG(FX_G.newId, '同名重建之群組')]) },
    },
    {
        kt: 'grups', enter: PAGES[1].enter, nameCol: 'name', rowName: '權限群組M1', refCol: 'cpemis', dlgKey: 'grupEditCpemis', refKt: 'pemis', refField: 'cpemis', pick: PICK_G,
        saveOk: 'grupSaveGrupsSuccess', saveFail: 'grupSaveGrupsFail', fapi: 'updateGrups',
        ok: { name: '權限P3', id: 'id-for-權限P3', row: 2 },
        fx: { name: FX_P.name, id: FX_P.id, newId: FX_P.newId, row: 4 },
        mkFixture: async () => { await editTableRows('pemis', (rows) => [...rows, mkFxP(FX_P.id, '案前追加之權限')]) },
        other: async () => { await editTableRows('pemis', (rows) => [...rows.filter((r) => r.id !== FX_P.id), mkFxP(FX_P.newId, '同名重建之權限')]) },
    },
    {
        kt: 'pemis', enter: PAGES[2].enter, nameCol: 'name', rowName: '權限P1', refCol: 'crules', dlgKey: 'pemiEditCrules', refKt: 'targets', refField: 'crules', pick: PICK_P,
        saveOk: 'pemiSavePemisSuccess', saveFail: 'pemiSavePemisFail', fapi: 'updatePemis',
        ok: { name: T_X, id: T_X, row: 1 },
        fx: { name: T_X, id: T_X, newId: null, row: 1 }, //對象之 id 即名稱, 被取代＝被刪除（不重建）
        mkFixture: null,
        other: async () => { await editTableRows('targets', (rows) => rows.filter((r) => r.id !== T_X)) },
    },
]

//E2E-025～026 伺服端強制（反向對話框）: 攔住網路推播 → 前端 store 與前端自檢（checkSubject）都看不到他人之變動 → 請求仍送出 → 伺服端於主體表鎖內新鮮讀取後拒收 saveSubjectChanged
CASES.push({
    //6 步 user path: ①群組頁開 M1「所屬使用者」對話框 ②勾選 john（未存）③（推播被攔住; 他人刪除 M1 並以同名重建, id 不同）④對話框內沒有過期提示（前端看不到）⑤按儲存, 請求送出, 看到失敗框（伺服端拒收, 固定訊息）⑥庫內使用者零寫入, 對話框仍開著
    name: nm('users-dialog-subject-replaced-server'),
    stages: [],
    run: async (page, lang) => {
        await gotoGrups(page)
        await holdNetPushes(page) //推播尚未抵達: 前端 store 不更新
        await openBelongDialog(page, 0, BELONG_USERS) //row 0 = 權限群組M1; 對話框列: row0=peter, row1=mary, row2=john, row3=admin
        await toggleDialogEnable(page, 2)
        const n0 = await heldCount(page, 'grups')
        await editTableRows('grups', (rows) => [...rows.filter((r) => r.id !== 'id-for-權限群組M1'), { id: 'id-ce-m1-new3', order: 99, name: '權限群組M1', description: '同名重建之群組', from: '', cpemis: '{}' }])
        await waitHeldMore(page, 'grups', n0) //推播已抵達前端、被攔住
        //spec E2E-025 驗證1: 前端 store 仍是舊的, 對話框內無過期提示（前端自檢看不到變動）
        assert.equal(await storeField(page, 'grups', 'id-for-權限群組M1', 'id'), 'id-for-權限群組M1', '前提: store 內 grups 仍含原 M1')
        assert.equal(await storeField(page, 'grups', 'id-ce-m1-new3', 'id'), undefined, '前提: store 內 grups 不含同名重建之新 M1')
        assert.equal(await staleCount(page, 'grup-blng-users-banner-stale'), 0, '前提: 對話框內無過期提示')
        await wrapFapi(page, 'updateUsers', 'capture')
        const dbBefore = await snapTables(['users'])
        await clickDialogSave(page)
        //spec E2E-025 驗證3: 失敗框＝userSaveUsersFail + ': ' + saveSubjectChanged（伺服端固定訊息, 非 saveStale、非含名稱之 relSubjectChangedGrup）
        const msg = `${await tOf(page, 'userSaveUsersFail')}: ${await tOf(page, 'saveSubjectChanged')}`
        await expectResultBoxAbove(page, '伺服端主體被取代訊息框', msg)
        assert.ok(msg.includes(LIT[lang].subject), `訊息應含字面片段「${LIT[lang].subject}」, 實得 ${msg}`)
        await dismissResultModal(page)
        //spec E2E-025 驗證2: 請求確實送出 1 次, opt.subject＝開框時之主體摘要
        const sent = await sentAll(page)
        assert.equal(sent.length, 1, '前端自檢放行, 請求確實送出 1 次')
        assert.deepEqual(sent[0].subject, { id: 'id-for-權限群組M1', name: '權限群組M1', saved: true })
        //spec E2E-025 驗證4: users 零寫入, 對話框仍開著
        assert.deepEqual(await snapTables(['users']), dbBefore, '被拒: users 零寫入（不會讓使用者之授權指向同名之新群組）')
        assert.ok(await page.evaluate((k) => (document.body.innerText || '').includes(window.$vo.$t(k)), 'grupBlngEditUsers'), '被拒後對話框仍開著')
        return null
    },
    semantic: async () => {
        //spec E2E-025 驗證5
        const us = await selectAllRows('users')
        assert.ok(!JSON5.parse(rowOf(us, 'id-for-john').cgrups)['權限群組M1'], 'john 之授權設定不得被本次被拒之儲存改寫')
        const gs = await selectAllRows('grups')
        assert.ok(rowOf(gs, 'id-ce-m1-new3'), '他人重建之群組仍在')
        assert.ok(!gs.some((r) => r.id === 'id-for-權限群組M1'), '原 M1 已被他人刪除')
    },
})
CASES.push({
    //6 步 user path: ①權限頁開 P1「所屬群組」對話框 ②勾選 M2（未存）③（推播被攔住; 他人刪除 P1 並以同名重建）④對話框內沒有過期提示 ⑤按儲存, 請求送出, 看到失敗框（伺服端拒收）⑥庫內群組零寫入, 對話框仍開著
    name: nm('grups-dialog-subject-replaced-server'),
    stages: [],
    run: async (page, lang) => {
        await gotoPemis(page)
        await holdNetPushes(page)
        await openBelongDialog(page, 0, BELONG_GRUPS) //row 0 = 權限P1; 對話框列依群組 order: row0=M1, row1=M2, row2=M3, row3=M4
        await toggleDialogEnable(page, 1)
        const n0 = await heldCount(page, 'pemis')
        await editTableRows('pemis', (rows) => [...rows.filter((r) => r.id !== 'id-for-權限P1'), { id: 'id-ce-p1-new2', order: 99, name: '權限P1', description: '同名重建之權限', from: '', crules: '{}' }])
        await waitHeldMore(page, 'pemis', n0)
        //spec E2E-026 驗證1
        assert.equal(await storeField(page, 'pemis', 'id-for-權限P1', 'id'), 'id-for-權限P1', '前提: store 內 pemis 仍含原 P1')
        assert.equal(await storeField(page, 'pemis', 'id-ce-p1-new2', 'id'), undefined, '前提: store 內 pemis 不含同名重建之新 P1')
        assert.equal(await staleCount(page, 'pemi-blng-grups-banner-stale'), 0, '前提: 對話框內無過期提示')
        await wrapFapi(page, 'updateGrups', 'capture')
        const dbBefore = await snapTables(['grups'])
        await clickDialogSave(page)
        //spec E2E-026 驗證3
        const msg = `${await tOf(page, 'grupSaveGrupsFail')}: ${await tOf(page, 'saveSubjectChanged')}`
        await expectResultBoxAbove(page, '伺服端主體被取代訊息框', msg)
        assert.ok(msg.includes(LIT[lang].subject), `訊息應含字面片段「${LIT[lang].subject}」, 實得 ${msg}`)
        await dismissResultModal(page)
        //spec E2E-026 驗證2
        const sent = await sentAll(page)
        assert.equal(sent.length, 1, '前端自檢放行, 請求確實送出 1 次')
        assert.deepEqual(sent[0].subject, { id: 'id-for-權限P1', name: '權限P1', saved: true })
        //spec E2E-026 驗證4
        assert.deepEqual(await snapTables(['grups']), dbBefore, '被拒: grups 零寫入')
        assert.ok(await page.evaluate((k) => (document.body.innerText || '').includes(window.$vo.$t(k)), 'pemiBlngEditGrups'), '被拒後對話框仍開著')
        return null
    },
    semantic: async () => {
        //spec E2E-026 驗證5
        const gs = await selectAllRows('grups')
        assert.ok(!JSON5.parse(rowOf(gs, 'id-for-權限群組M2').cpemis)['權限P1'], 'M2 之授權設定不得被本次被拒之儲存改寫')
        const ps = await selectAllRows('pemis')
        assert.ok(rowOf(ps, 'id-ce-p1-new2'), '他人重建之權限仍在')
        assert.ok(!ps.some((r) => r.id === 'id-for-權限P1'), '原 P1 已被他人刪除')
    },
})

//E2E-027～029 伺服端強制（清單頁正向引用）: 攔住推播 → 前端 store 與前端自檢（countRefMismatch）看不到 → 請求送出, 帶 opt.refs → 伺服端於被引用表鎖內新鮮讀取, 宣告之 id 陣列不符 → saveRefChanged
for (const P of REF_PAGES) {
    CASES.push({
        //6 步 user path: ①進入清單頁 ②開指派欄編輯器勾選一個無人引用之被引用實體, 按編輯器儲存（回填, 清單頁出現儲存鈕）③（推播被攔住; 他人刪除它並以同名重建〔對象為刪除〕）④按「儲存變更」, 請求送出（帶宣告）, 看到失敗框（伺服端拒收）⑤庫內零寫入
        name: nm(`${P.kt}-ref-replaced-server`),
        stages: [],
        fixture: P.mkFixture === null ? undefined : P.mkFixture,
        run: async (page, lang) => {
            await P.enter(page)
            await holdNetPushes(page)
            await assignViaEditor(page, P, P.fx) //spec E2E-027～029 驗證1: 編輯器列文字為預期實體, 回填後出現儲存鈕
            const n0 = await heldCount(page, P.refKt)
            await P.other()
            await waitHeldMore(page, P.refKt, n0)
            //spec E2E-027～029 驗證1: 推播已抵達但被攔住, 前端 store 仍含原被引用實體（前端自檢看不到變動）
            assert.equal(await storeField(page, P.refKt, P.fx.id, 'id'), P.fx.id, `前提: store 內 ${P.refKt} 仍含原實體`)
            if (P.fx.newId) {
                assert.equal(await storeField(page, P.refKt, P.fx.newId, 'id'), undefined, `前提: store 內 ${P.refKt} 不含同名重建之新實體`)
            }
            await wrapFapi(page, P.fapi, 'capture')
            const dbBefore = await snapTables([P.kt])
            await clickSave(page)
            //spec E2E-027～029 驗證3: 失敗框＝各表 Fail 鍵 + ': ' + saveRefChanged
            const msg = `${await tOf(page, P.saveFail)}: ${await tOf(page, 'saveRefChanged')}`
            await expectResultBox(page, 'saveRefChanged 伺服端訊息框', msg)
            assert.ok(msg.includes(LIT[lang].refChanged), `訊息應含字面片段「${LIT[lang].refChanged}」, 實得 ${msg}`)
            await dismissResultModal(page)
            //spec E2E-027～029 驗證2: 請求確實送出 1 次, opt.refs＝選取當時之 id 宣告, 清單頁不送 subject
            const sent = await sentAll(page)
            assert.equal(sent.length, 1, '前端自檢放行, 請求確實送出 1 次')
            assert.deepEqual(sent[0].refs, [{ name: P.fx.name, ids: [P.fx.id] }])
            assert.equal(sent[0].subject, null, '清單頁不送主體摘要')
            //spec E2E-027～029 驗證4: 零寫入
            assert.deepEqual(await snapTables([P.kt]), dbBefore, '被拒: 零寫入（授權不會被寫到同名新實體或已刪除之實體）')
            return null
        },
        semantic: async () => {
            //spec E2E-027～029 驗證5
            const row = (await selectAllRows(P.kt)).find((r) => r[P.nameCol] === P.rowName)
            assert.equal(JSON5.parse(row[P.refField] || '{}')[P.fx.name], undefined, `被拒之指派（${P.fx.name}）未寫入`)
            const refRows = await selectAllRows(P.refKt)
            assert.equal(refRows.some((r) => r.id === P.fx.id), false, '原被引用實體已被他人刪除')
            if (P.fx.newId) {
                assert.equal(refRows.some((r) => r.id === P.fx.newId), true, '他人重建之同名實體仍在')
            }
            else {
                assert.equal(refRows.length, targetsSnap.length - 1, '對象被刪除後 targets 為 base seed 筆數減 1（21 筆）')
            }
        },
    })
}

//E2E-030～032 前端自檢（清單頁正向引用）: 同上情境但推播抵達 store → 按儲存即彈 saveRefChanged 警告框, 不送出（$fapi 計數 0）
for (const P of REF_PAGES) {
    CASES.push({
        //6 步 user path: ①進入清單頁 ②開指派欄編輯器勾選一個無人引用之被引用實體, 按編輯器儲存（回填）③（他人刪除它並以同名重建〔對象為刪除〕; 推播抵達 store）④按「儲存變更」, 立即看到警告框（前端攔下）⑤請求未送出, 庫內零寫入, 草稿仍在（儲存鈕仍在）
        name: nm(`${P.kt}-ref-replaced-frontend-check`),
        stages: [],
        fixture: P.mkFixture === null ? undefined : P.mkFixture,
        run: async (page, lang) => {
            await P.enter(page)
            await assignViaEditor(page, P, P.fx) //spec E2E-030～032 驗證1: 回填後出現儲存鈕
            await P.other()
            //spec E2E-030～032 驗證1: 推播抵達 store（原被引用實體消失; 同名重建者新實體出現）——偵測式等待
            await waitUntilExist(page, `store ${P.refKt} 已反映他人之變更`, (a) => {
                const rs = window.$vo.$store.state[a.k] || []
                return !rs.some((r) => r.id === a.id) && (!a.nid || rs.some((r) => r.id === a.nid))
            }, { arg: { k: P.refKt, id: P.fx.id, nid: P.fx.newId }, timeout: 30000 })
            await page.waitForTimeout(500) //清單依 store 更新後 settle
            await wrapFapi(page, P.fapi, 'capture')
            const dbBefore = await snapTables([P.kt])
            await clickSave(page)
            //spec E2E-030～032 驗證2: 單一警告框, 文字＝saveRefChanged 原文（無 Fail 前綴）
            const msg = await tOf(page, 'saveRefChanged')
            await expectResultBox(page, 'saveRefChanged 前端警告框', msg)
            assert.ok(msg.includes(LIT[lang].refChanged), `訊息應含字面片段「${LIT[lang].refChanged}」, 實得 ${msg}`)
            await dismissResultModal(page)
            await page.waitForTimeout(1000) //負向觀察窗: 前端已攔下, 其後亦無請求送出
            //spec E2E-030～032 驗證3: 請求未送出
            assert.equal((await sentAll(page)).length, 0, '前端先擋, $fapi 攔截計數為 0')
            //spec E2E-030～032 驗證4: 零寫入, 草稿仍在
            assert.deepEqual(await snapTables([P.kt]), dbBefore, '被攔: 零寫入')
            assert.equal(await pageSaveShown(page), true, '草稿保留: 儲存鈕仍在')
            return null
        },
        semantic: async () => {
            //spec E2E-030～032 驗證4（庫內側）: 被攔之指派未寫入
            const row = (await selectAllRows(P.kt)).find((r) => r[P.nameCol] === P.rowName)
            assert.equal(JSON5.parse(row[P.refField] || '{}')[P.fx.name], undefined, `被攔之指派（${P.fx.name}）未寫入`)
        },
    })
}

//E2E-033～035 正常路徑（清單頁正向引用）: 勾選一個存在且未被替換之被引用實體 → 儲存成功, 庫內授權欄含新增項, 其餘內容欄不變; 請求帶 opt.refs
for (const P of REF_PAGES) {
    let before = null
    CASES.push({
        //6 步 user path: ①進入清單頁 ②開指派欄編輯器勾選一個存在之被引用實體, 按編輯器儲存（回填）③按「儲存變更」④看到成功訊息, 按確認 ⑤庫內該列授權欄含新增項, 其餘欄位與他列不變 ⑥請求帶 opt.refs
        name: nm(`${P.kt}-ref-ok-save`),
        stages: [],
        run: async (page) => {
            await P.enter(page)
            before = await snapTables([P.kt])
            await wrapFapi(page, P.fapi, 'capture')
            await assignViaEditor(page, P, P.ok) //spec E2E-033～035 驗證1
            await saveAndWaitModal(page)
            await assertModalMsg(page, P.saveOk) //spec E2E-033～035 驗證2: 成功訊息（伺服端 checkRefIdentity 比對相符）
            await dismissResultModal(page)
            //spec E2E-033～035 驗證3: 請求送出 1 次, opt.refs 含新增項與其當時 id 陣列, 不帶 subject
            const sent = await sentAll(page)
            assert.equal(sent.length, 1, '請求送出 1 次')
            assert.ok(Array.isArray(sent[0].refs) && sent[0].refs.length >= 1, 'opt.refs 長度至少 1')
            const d = sent[0].refs.find((x) => x.name === P.ok.name)
            assert.ok(d, `opt.refs 應含 ${P.ok.name}, 實得 ${JSON.stringify(sent[0].refs)}`)
            assert.deepEqual(d.ids, [P.ok.id], '宣告之 ids 為該實體當時之 id 陣列')
            assert.equal(sent[0].subject, null, '清單頁不送主體摘要')
            return null
        },
        semantic: async () => {
            //spec E2E-033～035 驗證4: 該列授權欄含新增項且原啟用項仍啟用, 其餘內容欄與他列內容欄不變（order／更新者／更新時間欄不比: 整表存檔依陣列位置重給 order）
            const after = await selectAllRows(P.kt)
            assert.equal(after.length, before[P.kt].length, '列數不變')
            const keys = P.pick.filter((k) => k !== P.refField)
            for (const b of before[P.kt]) {
                const a = rowOf(after, b.id)
                if (b[P.nameCol] === P.rowName) {
                    assert.deepEqual(pickRow(a, keys), pickRow(b, keys), `編輯列 ${P.rowName} 之其餘內容欄不變`)
                    const kpB = JSON5.parse(b[P.refField] || '{}')
                    const kpA = JSON5.parse(a[P.refField] || '{}')
                    assert.ok(isOn(kpA[P.ok.name]), `新增項 ${P.ok.name} 已啟用`)
                    for (const k of Object.keys(kpB)) {
                        if (isOn(kpB[k])) {
                            assert.ok(isOn(kpA[k]), `原啟用項 ${k} 仍為啟用`)
                        }
                    }
                }
                else {
                    assert.deepEqual(pickRow(a, P.pick), pickRow(b, P.pick), `他列 ${b.id} 之內容欄不變`)
                }
            }
        },
    })
}

//E2E-036 設計事實斷言（獨立前置; 與 E2E-029 同情境, 差別只在他人刪除對象後有無以同 id 重建）: 對象之 id 即名稱, 身分定義即 id, 刪除後同 id 重建依定義是同一實體 → 存檔成功（R-REF-IDENTITY-01 規則 5）
CASES.push({
    //6 步 user path: ①權限頁 ②開 P1 之「管控對象」編輯器勾選 T_X, 按編輯器儲存（回填）③（推播被攔住; 他人先刪除 T_X、再以同路徑新增回）④按「儲存變更」⑤看到成功訊息（不被 saveRefChanged 擋）⑥庫內 P1 之 crules 含 T_X
    name: nm('pemis-ref-target-recreated-same-id'),
    stages: [],
    run: async (page) => {
        const P = REF_PAGES[2]
        await P.enter(page)
        await holdNetPushes(page)
        await assignViaEditor(page, P, P.fx)
        const n0 = await heldCount(page, 'targets')
        await editTableRows('targets', (rows) => rows.filter((r) => r.id !== T_X)) //他人先刪除
        await editTableRows('targets', (rows) => [...rows, { id: T_X, order: 99, description: '同路徑重建之對象', from: '' }]) //再以同 id 新增回
        await waitHeldMore(page, 'targets', n0)
        //spec E2E-036 驗證1: 庫內該對象存在且為重建後之列
        assert.equal(rowOf(await selectAllRows('targets'), T_X).description, '同路徑重建之對象', '前提: 他人兩次寫入完成後庫內該對象為重建後之列')
        await wrapFapi(page, 'updatePemis', 'capture')
        await saveAndWaitModal(page)
        await assertModalMsg(page, 'pemiSavePemisSuccess') //spec E2E-036 驗證2: 依定義是同一實體, 不被擋
        await dismissResultModal(page)
        //spec E2E-036 驗證3: 請求送出 1 次, 宣告之 ids 為選取當時之對象 id（＝路徑）
        const sent = await sentAll(page)
        assert.equal(sent.length, 1, '請求送出 1 次')
        assert.deepEqual(sent[0].refs, [{ name: T_X, ids: [T_X] }])
        return null
    },
    semantic: async () => {
        //spec E2E-036 驗證4
        const p1 = rowOf(await selectAllRows('pemis'), 'id-for-權限P1')
        assert.ok(isOn(JSON5.parse(p1.crules)[T_X]), '權限P1 之 crules 含該對象（啟用）')
        assert.ok(rowOf(await selectAllRows('targets'), T_X), '對象仍在')
    },
})

//E2E-037 同名跨列選取之衝突（外審 sol#1, 2026-10-23）: 兩列各在不同時點選取同名群組, 而選取之間該群組被他人刪除並同名重建（id 不同）→ 前一列之選取已指向舊實體,
//  不得因後一列之選取以新快照覆蓋而「相符」放行（否則前一列之授權被同名新群組接管）→ 前端自檢攔下: 警告框 saveRefChanged、請求未送出、零寫入（R-REF-IDENTITY-01 規則 3）
CASES.push({
    //6 步 user path: ①使用者頁 ②開 mary 之「所屬群組」編輯器勾選 M9, 按編輯器儲存（回填）③他人刪除 M9 並以同名重建（推播抵達 store）④開 john 之「所屬群組」編輯器勾選（新）M9, 按編輯器儲存 ⑤按「儲存變更」, 立即看到警告框（前端攔下）⑥請求未送出, 庫內零寫入, 草稿仍在
    name: nm('users-ref-same-name-two-rows-replaced-between'),
    stages: [],
    fixture: REF_PAGES[0].mkFixture,
    run: async (page, lang) => {
        const P = REF_PAGES[0]
        await P.enter(page)
        await assignViaEditor(page, P, P.fx) //mary 選取 M9(舊 id)
        await P.other() //他人刪除 M9 並以同名重建(新 id)
        await waitUntilExist(page, 'store grups 已反映 M9 被取代', (a) => {
            const rs = window.$vo.$store.state.grups || []
            return !rs.some((r) => r.id === a.id) && rs.some((r) => r.id === a.nid)
        }, { arg: { id: P.fx.id, nid: P.fx.newId }, timeout: 30000 })
        await page.waitForTimeout(500) //清單依 store 更新後 settle
        await assignViaEditor(page, { ...P, rowName: 'john' }, P.fx) //john 選取新 M9(新 id; 同一列次 row 4)
        await wrapFapi(page, P.fapi, 'capture')
        const dbBefore = await snapTables([P.kt])
        await clickSave(page)
        //spec E2E-037 驗證1: 單一警告框, 文字＝saveRefChanged 原文（前端攔下; 無 Fail 前綴）
        const msg = await tOf(page, 'saveRefChanged')
        await expectResultBox(page, 'saveRefChanged 前端警告框', msg)
        assert.ok(msg.includes(LIT[lang].refChanged), `訊息應含字面片段「${LIT[lang].refChanged}」, 實得 ${msg}`)
        await dismissResultModal(page)
        await page.waitForTimeout(1000) //負向觀察窗: 前端已攔下, 其後亦無請求送出
        //spec E2E-037 驗證2: 請求未送出; 零寫入; 草稿仍在
        assert.equal((await sentAll(page)).length, 0, '前端先擋, $fapi 攔截計數為 0')
        assert.deepEqual(await snapTables([P.kt]), dbBefore, '被攔: 零寫入')
        assert.equal(await pageSaveShown(page), true, '草稿保留: 儲存鈕仍在')
        return null
    },
    semantic: async () => {
        //spec E2E-037 驗證2（庫內側）: mary、john 皆未被寫入 M9
        const us = await selectAllRows('users')
        for (const n of ['mary', 'john']) {
            const row = us.find((r) => r.name === n)
            assert.equal(JSON5.parse(row.cgrups || '{}')[FX_G.name], undefined, `${n} 之 ${FX_G.name} 指派未寫入`)
        }
    },
})

//E2E-038 移除引用亦須宣告（perm-run03 範圍一; 使用者 2026-10-23 裁示宣告強制必帶; R-REF-IDENTITY-01 規則 7）: 使用者在指派欄編輯器「取消勾選」既有引用後存檔 →
//  前端 buildRefDecl 把被移除之名稱納入 opt.refs（附編輯器開啟當時之 id）, 伺服端以強制必帶＋鎖內新鮮讀取比對相符 → 存檔成功; 庫內該列之引用不再啟用, 他列不變。
//  spec 對應: spec/流程_多人同時編輯.md E2E-038（perm-run03 補入）。
CASES.push({
    //6 步 user path: ①進入使用者頁 ②開 mary 之「所屬群組」編輯器, 看到 M2 已勾選, 取消勾選, 按編輯器儲存（回填, 清單頁出現儲存鈕）③按「儲存變更」④看到成功訊息, 按確認 ⑤請求送出 1 次, opt.refs 含被移除之 M2 與其開框當時之 id, 不帶 subject ⑥庫內 mary 之 M2 不再啟用, 他列之授權不變
    name: nm('users-ref-remove-declared'),
    stages: [],
    run: async (page) => {
        const P = REF_PAGES[0]
        await P.enter(page)
        await wrapFapi(page, P.fapi, 'capture')
        await assignViaEditor(page, P, { name: '權限群組M2', id: 'id-for-權限群組M2', row: 1, expectChecked: true }) //spec E2E-038 驗證1: 開窗已勾選 → 取消勾選 → 回填後出現儲存鈕
        await saveAndWaitModal(page)
        await assertModalMsg(page, P.saveOk) //spec E2E-038 驗證2: 成功訊息（伺服端強制必帶之宣告齊備且與鎖內新鮮讀取相符）
        await dismissResultModal(page)
        const sent = await sentAll(page)
        assert.equal(sent.length, 1, '請求送出 1 次')
        assert.deepEqual(sent[0].refs, [{ name: '權限群組M2', ids: ['id-for-權限群組M2'] }]) //spec E2E-038 驗證3: 宣告含被移除之名稱, ids 為開框當時之 id
        assert.equal(sent[0].subject, null, '清單頁不送主體摘要')
        return null
    },
    semantic: async () => {
        //spec E2E-038 驗證4: mary 之 M2 不再啟用; 他列（peter→M1、john→M3）之授權不變
        const us = await selectAllRows('users')
        assert.equal(isOn(JSON5.parse(rowOf(us, 'id-for-mary').cgrups || '{}')['權限群組M2']), false, 'mary 之 M2 已不再啟用')
        assert.ok(isOn(JSON5.parse(rowOf(us, 'id-for-peter').cgrups)['權限群組M1']), 'peter 之 M1 不變')
        assert.ok(isOn(JSON5.parse(rowOf(us, 'id-for-john').cgrups)['權限群組M3']), 'john 之 M3 不變')
    },
})

//檔級收尾對稱（R-E2E-ISO-01）
//共用 createIsolation 之快照只含 users／grups／pemis 三表（api-setup TABLE_FN），不含 targets; 本檔 E2E-009～016 之 targets 輪會改標的列說明，
//  若不還原，同案第二輪（另一語系或重複）寫入之內容與庫內相同 → 無變更、不產生推播 → 橫幅永不出現（2026-10-23 重複量測 11/12 失敗之根因: 測試隔離缺口, 非產品問題）。
//  故於本檔加 targets 之擷取／還原（經管理者寫入 RPC 整表寫回, 與 restoreTables 同法; 還原後逐列回驗）。
const isoBase = createIsolation()
const byOrder = (a, b) => (a.order || 0) - (b.order || 0)
const clone = (v) => JSON.parse(JSON.stringify(v))
//perm-run02: E2E-014～016、025～036 有「他人刪除被引用實體並以同名重建」或「刪除對象」: 引用連帶清理(R-REF-CASCADE-01)會改動引用端表之授權欄;
//  共用還原次序為 users→grups→pemis(引用端先、被引用端後), 被引用端寫回快照(移除同名重建列、復原原列)時連帶清理又改動已寫回之引用端表, 使引用端授權欄殘留被清理後之值。
//  故於共用還原與 targets 還原之後, 依階層(targets→pemis→grups→users, 被引用者先、引用端後)再以快照整表寫回 pemis、grups、users, 並回驗三表授權欄逐列等於快照(以 JSON5 解析後比對)。
let baseSnap = null
let targetsSnap = null
const AUTH_FIELD = { users: 'cgrups', grups: 'cpemis', pemis: 'crules' }
const iso = {
    async capture() {
        const snap = await isoBase.capture()
        baseSnap = snap
        targetsSnap = (await selectAllRows('targets')).slice().sort(byOrder).map(clone)
        assert.equal(targetsSnap.length, 22, '前提: targets 為 base seed 22 列')
        assert.ok(targetsSnap.every((r) => r.from === ''), '前提: targets base seed 列 from 皆為空字串(無外部列)')
        return snap
    },
    async restore() {
        await isoBase.restore()
        if (!targetsSnap) {
            return
        }
        await editTableRows('targets', () => targetsSnap.map(clone))
        const cur = await selectAllRows('targets')
        assert.equal(cur.length, targetsSnap.length, '收尾後 targets 筆數須回到 base seed')
        const curDesc = Object.fromEntries(cur.map((r) => [r.id, r.description]))
        const snapDesc = Object.fromEntries(targetsSnap.map((r) => [r.id, r.description]))
        assert.deepEqual(curDesc, snapDesc, '收尾後 targets 各列說明須回到 base seed')
        //依階層補寫一輪並回驗授權欄(見上方說明)
        for (const kt of ['pemis', 'grups', 'users']) {
            await editTableRows(kt, () => baseSnap[kt].map(clone))
        }
        for (const kt of ['users', 'grups', 'pemis']) {
            const f = AUTH_FIELD[kt]
            const parse = (v) => JSON5.parse(v || '{}')
            const curAuth = Object.fromEntries((await selectAllRows(kt)).map((r) => [r.id, parse(r[f])]))
            const snapAuth = Object.fromEntries(baseSnap[kt].map((r) => [r.id, parse(r[f])]))
            assert.deepEqual(curAuth, snapAuth, `收尾後 ${kt} 各列 ${f} 須回到 base seed`)
        }
    },
}
const { runCase } = makeRunner({ flow: FLOW, iso })

for (const lang of LANGS) {
    describe(`e2e-concurrent-edit (${lang})`, function() {
        this.timeout(300000)
        before(async function() {
            this.timeout(400000)
            await startServersOnce()
            await iso.capture()
        })
        after(async function() {
            this.timeout(120000)
            await iso.restore()
        })
        //env CE_REPEAT=N: 每案重複 N 次(不穩定失敗之失敗率量測用; 預設 1, 原則 9 要求以失敗率而非單次成敗判斷)
        for (const c of CASES) {
            for (let rep = 0; rep < REPEAT; rep++) {
                it(rep === 0 ? c.name : `${c.name} [重複 ${rep + 1}]`, async function() {
                    await runCase('compare', lang, c, { onKnownDefect: () => this.skip() })
                })
            }
        }
    })
}

//此檔無標準圖、無 --baseline 模式；直跑時顯式提示
if (process.argv.includes('--baseline')) {
    console.log('e2e-concurrent-edit 為純語意案例, 無標準圖可產製')
    cleanup()
}
