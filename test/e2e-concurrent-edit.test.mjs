//多人同時編輯共用核心(w-serv-orm 1.1.17)之使用者視角 e2e(perm-run01; 使用者 2026-10-22 裁示原則 10、規格 dspec/多人同時編輯之寫入契約.md 第 5、6、8 節; 對應 spec/流程_多人同時編輯.md E2E-001～024)。
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
//  (d) 空值等價為單元／API 層（unit-rowDigest RD-F4、unit-draftSync DS-3、api-baseline），e2e 無法造出「同一列兩種空值表示」之真實畫面，不設 e2e 案
//  先動先贏未削弱：他人改任一列、增列、刪列之 e2e 見 test/e2e-external-rows.test.mjs E2E-016～019（本輪不改）；本檔 E2E-017～018 補「只重排」
//
//【輸入空間表】
//  軸 A 頁面（4）：users、grups、pemis、targets（a、c、V10 各四案；e 取 users、grups）
//  軸 B 對話框（2）：VeGrupBlngUsers（群組頁）、VePemiBlngGrups（權限頁）（a、b、114 各取之）
//  軸 C 他人之變更種類（改列／增列／刪列／重排／同名重建／外部重編號）：改列（c、b）、重排（e）、同名重建（114）、重編號（e）；增刪列見 external-rows 檔
//  軸 D 語系（2）：eng、cht 每案兩輪
//  已測案例 24 × 語系 2 = 48 個 it。
//
//手段說明（setup，非使用者動作）：「他人」＝經管理者寫入 RPC（editTableRows）或外部同步端點；「推播尚未抵達」＝攔住網路推播（holdNetPushes：store.commit 攔下 tableName+data 之 payload，
//  但放行 payload.source==='savedRows'——頁面套用自己存檔回傳列之 commit），模擬「存檔成功後約 2 秒輪詢尚未送達」之窗口；e2e 不 import src／server（R-TEST-SCOPE-01 盤點指令 4），故 V10 以黑箱比對（id 序、格式、伺服端接受）。
import assert from 'assert'
import JSON5 from 'json5'
import {
    startServersOnce, cleanup, rowIndexByCell, waitUntilExist, gotoGrups, gotoPemis, typeIntoCell, clickSave, saveAndWaitModal, assertModalMsg, dismissResultModal, pageSaveShown,
    openBelongDialog, toggleDialogEnable, clickDialogSave, waitDialogClosed, expectResultBox,
} from './tools/e2e-setup.mjs'
import { editTableRows, selectAllRows } from './tools/api-setup.mjs'
import {
    ON, snapTables, rowOf, syncRows, createIsolation, makeRunner, waitStoreCount, waitStoreField, cellText, enterPage, gotoTargets, tOf, T, mkU, expectResultBoxAbove,
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
const wrapFapi = (page, fn, mode) => page.evaluate(([f, m]) => {
    const api = window.$vo.$fapi
    const orig = api[f]
    window.__sent = null
    api[f] = function(rows, opt) {
        const o = { ...(opt || {}) }
        window.__sent = { n: rows.length, baseline: JSON.parse(JSON.stringify(o.baseline)) }
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
        await syncRows('users', [mkU('id-ce-x1', 'ce-x1', {}, { order: 200, description: 'ce外部一' }), mkU('id-ce-x2', 'ce-x2', {}, { order: 201, description: 'ce外部二' })], F_X)
        await waitUntilExist(page, 'store 已含平移後之 order', () => (window.$vo.$store.state.users || []).some((r) => r.id === 'id-ce-x1' && r.order === 200), { timeout: 30000 })
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

//檔級收尾對稱（R-E2E-ISO-01）
//共用 createIsolation 之快照只含 users／grups／pemis 三表（api-setup TABLE_FN），不含 targets; 本檔 E2E-009～016 之 targets 輪會改標的列說明，
//  若不還原，同案第二輪（另一語系或重複）寫入之內容與庫內相同 → 無變更、不產生推播 → 橫幅永不出現（2026-10-23 重複量測 11/12 失敗之根因: 測試隔離缺口, 非產品問題）。
//  故於本檔加 targets 之擷取／還原（經管理者寫入 RPC 整表寫回, 與 restoreTables 同法; 還原後逐列回驗）。
const isoBase = createIsolation()
const byOrder = (a, b) => (a.order || 0) - (b.order || 0)
const clone = (v) => JSON.parse(JSON.stringify(v))
let targetsSnap = null
const iso = {
    async capture() {
        const snap = await isoBase.capture()
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
