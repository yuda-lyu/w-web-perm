//陣列形式授權資料之編輯器讀取與存檔(第 92 項①, 站點 35; 規則帳本 R-AUTH-DECODE-01)
//
//外部應用經 /syncAndReplaceTabs 直接寫入「陣列形式」之授權資料(cgrups／cpemis／crules 為 [{ "name": "A", "isActive": "y", "mode": "OR" }]),
//伺服端 getUserRules 相容並授權(UNIT-OI-006a); 修正前五個編輯元件(VeCgrups／VeCpemis／VeCrules／VeGrupBlngUsers／VePemiBlngGrups)
//依名稱為鍵查值, 查不到陣列元素 → 顯示停用 → 管理者存檔即撤銷有效授權.
//本檔經真後端、真瀏覽器、真 UI 驗: ①對話框顯示與伺服端授權一致(啟用者顯示啟用) ②存檔後「外部應用實際查到的權限樹」不變(getPermUserInfor) ③存出形式為物件形式.
//
//語意斷言為主, 不產標準圖(此檔驗授權語意, 不是外觀; 標準圖產製須另行取得授權): 每案 fresh browser + 以同步端點重寫陣列形式夾具(from=appArrForm).
//夾具鏈(全為新列, 不動 base seed): 使用者 arr-u.cgrups → 群組 arr-g.cpemis → 權限 arr-p.crules → 標的(base seed 之前三個標的).
//run02(複審 R1／R3／R4): AF-007～009 清單頁唯讀顯示經共用解碼(R-AUTH-LIST-01); AF-010a～e 存檔保留原鍵序(R-AUTH-ORDER-01, 對話框序 ≠ 資料序之兩個 AND 項);
//  AF-011a～d 無法無損表示者 fail-closed(R-AUTH-LOSSY-01: 固定訊息、庫內字串逐字元不動)——四個帶 mode 的編輯器皆涵蓋.
//跑法: npx mocha test/e2e-array-form.test.mjs --timeout 300000
import assert from 'assert'
import { startServersOnce, launchBrowser, openApp, saveAndWaitModal, assertModalMsg, dismissResultModal, gotoUsers, gotoGrups, gotoPemis, toggleDialogEnable, clickDialogSave, waitDialogClosed, openBelongDialog, saveBelongAndWaitModal, getResolvedActiveTargets, setDialogMode, apiBaseUrl } from './tools/e2e-setup.mjs'
import { callRpc, TOKEN_ADMIN, TOKEN_APP } from './tools/api-setup.mjs'

const FROM = 'appArrForm'
const U_ID = 'id-arr-u'
const U2_ID = 'id-arr-u2'
const SEL_MODAL = 'div[style*="overscroll-behavior"] div[tabindex="0"] > div' //WDialog 結果 modal / Ve 對話框(同 e2e-users)

//授權鏈之夾具(陣列形式; 'n' 者用來驗「停用者仍顯示停用」)
const T_ON1 = '專案A/頁A/區塊A'
const T_ON2 = '專案A/頁A/區塊A/分析按鈕'
const T_OFF = '專案A/頁A/區塊A/執行按鈕'
//夾具含「缺 mode 之啟用元素」(M2／P2): 伺服端 mergeRules 不納入合併(不授權); 編輯器須顯示停用, 存檔不得補預設 OR 而增權(外審 minimax#1)
//u2 為物件形式且值內 name 指向 M2: 伺服端以外層鍵 arr-g 為名; 關聯對話框須同(外審 sol#5; 否則存檔把授權改指 M2)
const FIX = {
    users: [
        { id: U_ID, order: 100, name: 'arr-u', email: 'arr-u@example.com', isAdmin: 'n', isActive: 'y', cgrups: JSON.stringify([{ name: 'arr-g', mode: 'OR', isActive: 'y' }, { name: '權限群組M1', mode: 'OR', isActive: 'n' }, { name: '權限群組M2', isActive: 'y' }]) },
        { id: U2_ID, order: 101, name: 'arr-u2', email: 'arr-u2@example.com', isAdmin: 'n', isActive: 'y', cgrups: JSON.stringify({ 'arr-g': { name: '權限群組M2', mode: 'OR', isActive: 'y' } }) },
    ],
    grups: [{ id: 'id-arr-g', order: 100, name: 'arr-g', cpemis: JSON.stringify([{ name: 'arr-p', mode: 'OR', isActive: 'y' }, { name: '權限P1', mode: 'OR', isActive: 'n' }, { name: '權限P2', isActive: 'y' }]) }],
    pemis: [{ id: 'id-arr-p', order: 100, name: 'arr-p', crules: JSON.stringify([{ name: T_ON1, isActive: 'y' }, { name: T_ON2, isActive: 'y' }, { name: T_OFF, isActive: 'n' }]) }],
}

//順序與有損夾具(R-AUTH-ORDER-01／R-AUTH-LOSSY-01): ord-p1 規則 {T_ON1,T_ON2}、ord-p2 規則 {T_ON2}、ord-p3 的 crules 鍵序為 T_ON2 先於 T_ON1;
//ord-g1／ord-g2 各含 ord-p1／ord-p2(OR); ord-g3 的 cpemis 為陣列 [ord-p1 AND 停用, ord-p2 AND, ord-p1 AND, P3 停用]; lossy-g3 的 cpemis 為 [ord-p1 OR, ord-p1 AND, P3 停用](同名並存; 停用項使 isEqual 為假——關聯對話框若未跳過有損列即會重寫字串);
//ord-u 的 cgrups 為陣列 [ord-g1 AND 停用, ord-g2 AND, ord-g1 AND, M3 停用](伺服端以首個有效 AND 項 ord-g2 為準 → 授權僅 T_ON2; 停用在前使「任何元素首次出現之序」≠「有效元素首次出現之序」); ord-u3 以 OR 引用 ord-g3;
//lossy-u 的 cgrups 為 [ord-g1 AND, ord-g2 AND, ord-g2 OR, M3 停用](同名 AND／OR 並存且另有 AND 名稱, sol 第三輪#2); lossy-v／lossy-h 為無損對照(空設定)
const ON = (mode = 'OR') => ({ mode, isActive: 'y' })
const MAIL = (n) => `${n}@example.com`
FIX.pemis.push(
    { id: 'id-ord-p1', order: 101, name: 'ord-p1', crules: JSON.stringify({ [T_ON1]: 'y', [T_ON2]: 'y' }) },
    { id: 'id-ord-p2', order: 102, name: 'ord-p2', crules: JSON.stringify({ [T_ON2]: 'y' }) },
    { id: 'id-ord-p3', order: 103, name: 'ord-p3', crules: JSON.stringify({ [T_ON2]: 'y', [T_ON1]: 'y' }) },
)
FIX.grups.push(
    { id: 'id-ord-g1', order: 101, name: 'ord-g1', cpemis: JSON.stringify({ 'ord-p1': ON() }) },
    { id: 'id-ord-g2', order: 102, name: 'ord-g2', cpemis: JSON.stringify({ 'ord-p2': ON() }) },
    { id: 'id-ord-g3', order: 103, name: 'ord-g3', cpemis: JSON.stringify([{ name: 'ord-p1', mode: 'AND', isActive: 'n' }, { name: 'ord-p2', ...ON('AND') }, { name: 'ord-p1', ...ON('AND') }, { name: '權限P3', mode: 'OR', isActive: 'n' }]) },
    { id: 'id-lossy-g3', order: 104, name: 'lossy-g3', cpemis: JSON.stringify([{ name: 'ord-p1', ...ON('OR') }, { name: 'ord-p1', ...ON('AND') }, { name: '權限P3', mode: 'OR', isActive: 'n' }]) },
    { id: 'id-lossy-h', order: 105, name: 'lossy-h', cpemis: '{}' },
)
FIX.users.push(
    { id: 'id-ord-u', order: 102, name: 'ord-u', email: MAIL('ord-u'), isAdmin: 'n', isActive: 'y', cgrups: JSON.stringify([{ name: 'ord-g1', mode: 'AND', isActive: 'n' }, { name: 'ord-g2', ...ON('AND') }, { name: 'ord-g1', ...ON('AND') }, { name: '權限群組M3', mode: 'OR', isActive: 'n' }]) },
    { id: 'id-ord-u3', order: 103, name: 'ord-u3', email: MAIL('ord-u3'), isAdmin: 'n', isActive: 'y', cgrups: JSON.stringify({ 'ord-g3': ON() }) },
    { id: 'id-lossy-u', order: 104, name: 'lossy-u', email: MAIL('lossy-u'), isAdmin: 'n', isActive: 'y', cgrups: JSON.stringify([{ name: 'ord-g1', ...ON('AND') }, { name: 'ord-g2', ...ON('AND') }, { name: 'ord-g2', ...ON('OR') }, { name: '權限群組M3', mode: 'OR', isActive: 'n' }]) },
    { id: 'id-lossy-v', order: 105, name: 'lossy-v', email: MAIL('lossy-v'), isAdmin: 'n', isActive: 'y', cgrups: '{}' },
)

//整數式名稱夾具(外審 minimax#2): 群組 '1'(JS 屬性序使整數式鍵恆排前面); int-u 的 cgrups 為 { ord-g1: AND }(單一 AND 項)
FIX.grups.push({ id: 'id-int-g1', order: 106, name: '1', cpemis: JSON.stringify({ 'ord-p2': ON() }) })
FIX.users.push({ id: 'id-int-u', order: 106, name: 'int-u', email: MAIL('int-u'), isAdmin: 'n', isActive: 'y', cgrups: JSON.stringify({ 'ord-g1': ON('AND') }) })

//經外部同步端點寫入陣列形式夾具(app token; 以 from 為界全量取代, 每案前重寫即還原)
async function seedArrayForm() {
    for (const kt of ['pemis', 'grups', 'users']) {
        const url = `${apiBaseUrl}/syncAndReplaceTabs?keyTable=${kt}&token=${encodeURIComponent(TOKEN_APP)}`
        const res = await (await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ from: FROM, rows: FIX[kt].map((v) => ({ ...v, from: FROM })) }) })).json()
        assert.ok(res.state === 'success', `夾具 ${kt} 寫入應成功, 實得 ${JSON.stringify(res)}`)
    }
}

//讀三表現況(經資料通道 select), 依 order 排序: select 依主鍵排序(users 為 admin／john／mary／peter), 而 updateXxx 以陣列位置重給 order,
//直接送 select 順序會使 users 列序反轉(base seed 為 peter／mary／john／admin), 後續 e2e 檔擷取到的 BASE_SEED 列序與標準圖相反(ADR-017 之「列序相反」現象)
const TABLE_FN = [['users', 'updateUsers'], ['grups', 'updateGrups'], ['pemis', 'updatePemis']]
async function readTables() {
    const out = {}
    for (const [kt] of TABLE_FN) {
        const r = await callRpc(`${kt}.select`, [], TOKEN_ADMIN)
        //select 失敗(r.ok 為 false)時不得當成空表而於收尾送出整表清空(外審 sol#3)
        assert.ok(r.ok && Array.isArray(r.output) && r.output.length > 0, `${kt}.select 應成功且非空, 實得 ${JSON.stringify(r).slice(0, 200)}`)
        out[kt] = r.output.slice().sort((a, b) => (a.order || 0) - (b.order || 0))
    }
    return out
}

//收尾(與 before 擷取對稱): 把三表還原為檔首現況(含夾具以外各列之原文欄位), 不留夾具列, 也不改動 base seed 列之序與原文(
//經管理者寫入 RPC, 與 api-updateTabs 之 restoreBaseSeed 同法; sync 端點拒絕空 rows 故不能用它清)
async function restoreTables(snap) {
    for (const [kt, fn] of TABLE_FN) {
        const res = await callRpc(fn, [snap[kt]], TOKEN_ADMIN)
        assert.ok(res.ok, `收尾 ${fn} 應成功, 實得 ${JSON.stringify(res)}`)
    }
}

//主表中名稱為 name 之列 row-index
async function rowIndexByName(page, name) {
    const k = await page.evaluate((n) => {
        const rs = [...document.querySelectorAll('.ag-row[row-index]')]
        for (const r of rs) {
            const c = r.querySelector('.ag-cell[col-id="name"]')
            if (c && (c.textContent || '').trim() === n) return r.getAttribute('row-index')
        }
        return null
    }, name)
    assert.ok(k !== null, `主表應有名稱為 ${name} 之列`)
    return Number(k)
}

//對話框內各列(以 nameCol 為名稱欄)之啟用狀態: { 名稱: { idx, enable, text } }
async function readDlgRows(page, nameCol) {
    return await page.evaluate(([sd, nc]) => {
        const out = {}
        for (const r of document.querySelectorAll(`${sd} .ag-row[row-index]`)) {
            const n = ((r.querySelector(`.ag-cell[col-id="${nc}"]`) || {}).textContent || '').trim()
            const chk = r.querySelector('.ag-cell[col-id="enable"] input[type="checkbox"]')
            if (n && chk) out[n] = { idx: Number(r.getAttribute('row-index')), enable: !!chk.checked, text: (r.textContent || '').trim() }
        }
        return out
    }, [SEL_MODAL, nameCol])
}

//讀庫內某表某 id 之欄位(經資料通道 select; 不經瀏覽器狀態)
async function readDbField(kt, id, field) {
    const r = await callRpc(`${kt}.select`, [], TOKEN_ADMIN)
    const row = (r.output || []).find((v) => v.id === id)
    assert.ok(row, `${kt} 應有 ${id}`)
    return row[field]
}

//清單頁主表某列某欄之顯示文字
async function cellText(page, rowIndex, colId) {
    return await page.evaluate(([k, c]) => ((document.querySelector(`.ag-row[row-index="${k}"] .ag-cell[col-id="${c}"]`) || {}).textContent || '').trim(), [rowIndex, colId])
}

const ACTIVE_BEFORE = [T_ON1, T_ON2].sort()


//案例: 開瀏覽器 → 進頁 → fn(page) → finally 關閉
async function withPage(fn) {
    const browser = await launchBrowser()
    try {
        const page = await openApp(browser)
        await page.waitForTimeout(600)
        return await fn(page)
    }
    finally {
        await browser.close().catch(() => {})
    }
}

//開某頁某列的某欄按鈕(對話框)並等標題
async function openColDialog(page, rowIndex, colId, titleKey) {
    await openBelongDialog(page, rowIndex, { colId, titleKey, label: `對話框 ${titleKey}` })
}

//把某「無關」列切開再切回(使 isModified=true 讓 Save 鈕現身, 淨內容不變)
async function touchUnrelatedRow(page, idx) {
    await toggleDialogEnable(page, idx)
    await toggleDialogEnable(page, idx)
}

//讀庫內授權字串中啟用中之名稱; objectForm 為真時(三個直接編輯器: 存檔一律寫物件形式)另斷言存出為物件形式。
//兩個關聯對話框僅於「解碼後內容有變」時改寫庫內字串(isEqual 為真則原字串不動), 故其存出可為原陣列形式或物件形式, 契約是「授權不變」(外審 minimax#3、sol#7)
function activeNamesOf(text, label, { objectForm }) {
    const o = JSON.parse(text)
    if (objectForm) {
        assert.ok(o && typeof o === 'object' && !Array.isArray(o), `${label}: 直接編輯器存出須為物件形式, 實得 ${text}`)
    }
    const names = []
    if (Array.isArray(o)) {
        for (const e of o) {
            if (e && e.isActive === 'y') names.push(e.name)
        }
    }
    else {
        for (const [k, v] of Object.entries(o)) {
            if ((v && typeof v === 'object' ? v.isActive : v) === 'y') names.push(k)
        }
    }
    return names
}
function assertEnabled(text, name, label, opt) {
    const names = activeNamesOf(text, label, opt)
    assert.ok(names.includes(name), `${label}: ${name} 須仍為啟用, 實得 ${text}`)
    return names
}

describe('e2e-array-form (陣列形式授權資料: 編輯器顯示與存檔, 規則帳本 R-AUTH-DECODE-01)', function() {
    this.timeout(300000)

    let snap0 = null

    before(async function() {
        this.timeout(400000)
        await startServersOnce()
        snap0 = await readTables() //檔首現況(夾具尚未寫入), after 還原之依據
    })

    beforeEach(async function() {
        await seedArrayForm()
    })

    after(async function() {
        this.timeout(120000)
        if (snap0) {
            await restoreTables(snap0) //服務之收尾由 e2e-setup 註冊之 root after 負責(此處不 cleanup: 單一行程全跑時後續 e2e 檔沿用同一服務)
        }
    })

    it('AF-000-fixture-authorizes: 夾具(陣列形式)經真後端 getPermUserInfor 授權 T_ON1／T_ON2、不授權 T_OFF(對照組, 證明陣列形式確被伺服端授權)', async function() {
        await withPage(async (page) => {
            const act = await getResolvedActiveTargets(page, U_ID)
            assert.deepEqual(act, ACTIVE_BEFORE)
        })
    })

    it('AF-001-VeCgrups: 使用者頁 cgrups 對話框顯示 arr-g 啟用(OR)、M1 停用; 切開再切回無關列後存檔 → 授權不變、存出物件形式', async function() {
        await withPage(async (page) => {
            await gotoUsers(page)
            const k = await rowIndexByName(page, 'arr-u')
            await openColDialog(page, k, 'cgrups', 'userEditCgrups')
            const rows = await readDlgRows(page, 'name')
            assert.strict.equal(rows['arr-g']?.enable, true, `arr-g 應顯示啟用(陣列形式), 實得 ${JSON.stringify(rows['arr-g'])}`)
            assert.ok(/OR/.test(rows['arr-g'].text), `arr-g 模式應顯示 OR, 實得 ${rows['arr-g'].text}`)
            assert.strict.equal(rows['權限群組M1']?.enable, false, 'M1 於夾具為 n, 應顯示停用')
            assert.strict.equal(rows['權限群組M2']?.enable, false, 'M2 於夾具為 y 但缺 mode(伺服端不授權), 應顯示停用')
            await touchUnrelatedRow(page, rows['權限群組M3'].idx)
            await clickDialogSave(page)
            await waitDialogClosed(page, 'userEditCgrups')
            await saveAndWaitModal(page)
            await assertModalMsg(page, 'userSaveUsersSuccess')
            assert.deepEqual(await getResolvedActiveTargets(page, U_ID), ACTIVE_BEFORE, '存檔後權限樹須不變')
            const names = assertEnabled(await readDbField('users', U_ID, 'cgrups'), 'arr-g', 'users.cgrups', { objectForm: true })
            assert.deepEqual(names, ['arr-g'], '存檔不得把缺 mode 之 M2 補成啟用')
        })
    })

    it('AF-002-VeCpemis: 群組頁 cpemis 對話框顯示 arr-p 啟用(OR)、P1 停用; 存檔 → 授權不變、存出物件形式', async function() {
        await withPage(async (page) => {
            await gotoGrups(page)
            const k = await rowIndexByName(page, 'arr-g')
            await openColDialog(page, k, 'cpemis', 'grupEditCpemis')
            const rows = await readDlgRows(page, 'name')
            assert.strict.equal(rows['arr-p']?.enable, true, `arr-p 應顯示啟用(陣列形式), 實得 ${JSON.stringify(rows['arr-p'])}`)
            assert.ok(/OR/.test(rows['arr-p'].text), `arr-p 模式應顯示 OR, 實得 ${rows['arr-p'].text}`)
            assert.strict.equal(rows['權限P1']?.enable, false, 'P1 於夾具為 n, 應顯示停用')
            assert.strict.equal(rows['權限P2']?.enable, false, 'P2 於夾具為 y 但缺 mode(伺服端不授權), 應顯示停用')
            await touchUnrelatedRow(page, rows['權限P3'].idx)
            await clickDialogSave(page)
            await waitDialogClosed(page, 'grupEditCpemis')
            await saveAndWaitModal(page)
            await assertModalMsg(page, 'grupSaveGrupsSuccess')
            assert.deepEqual(await getResolvedActiveTargets(page, U_ID), ACTIVE_BEFORE, '存檔後權限樹須不變')
            const names = assertEnabled(await readDbField('grups', 'id-arr-g', 'cpemis'), 'arr-p', 'grups.cpemis', { objectForm: true })
            assert.deepEqual(names, ['arr-p'], '存檔不得把缺 mode 之 P2 補成啟用')
        })
    })

    it('AF-003-VeCrules: 權限頁 crules 對話框顯示兩個標的啟用、一個停用; 存檔 → 授權不變、存出物件形式', async function() {
        await withPage(async (page) => {
            await gotoPemis(page)
            const k = await rowIndexByName(page, 'arr-p')
            await openColDialog(page, k, 'crules', 'pemiEditCrules')
            const rows = await readDlgRows(page, 'id')
            assert.strict.equal(rows[T_ON1]?.enable, true, `${T_ON1} 應顯示啟用(陣列形式), 實得 ${JSON.stringify(rows[T_ON1])}`)
            assert.strict.equal(rows[T_ON2]?.enable, true, `${T_ON2} 應顯示啟用(陣列形式), 實得 ${JSON.stringify(rows[T_ON2])}`)
            assert.strict.equal(rows[T_OFF]?.enable, false, `${T_OFF} 於夾具為 n, 應顯示停用`)
            const other = Object.entries(rows).find(([n]) => ![T_ON1, T_ON2, T_OFF].includes(n))
            assert.ok(other, '對話框應有其他無關標的列')
            await touchUnrelatedRow(page, other[1].idx)
            await clickDialogSave(page)
            await waitDialogClosed(page, 'pemiEditCrules')
            await saveAndWaitModal(page)
            await assertModalMsg(page, 'pemiSavePemisSuccess')
            assert.deepEqual(await getResolvedActiveTargets(page, U_ID), ACTIVE_BEFORE, '存檔後權限樹須不變')
            const o = JSON.parse(await readDbField('pemis', 'id-arr-p', 'crules'))
            assert.ok(o && typeof o === 'object' && !Array.isArray(o), '存出須為物件形式')
            assert.strict.equal(o[T_ON1], 'y')
            assert.strict.equal(o[T_ON2], 'y')
            assert.notStrictEqual(o[T_OFF], 'y')
        })
    })

    it('AF-004-VeGrupBlngUsers: 群組頁「所屬使用者」對話框顯示 arr-u 屬於 arr-g(啟用, OR); 切開再切回無關列後存檔(對話框自行寫庫) → 授權不變、存出物件形式', async function() {
        await withPage(async (page) => {
            await gotoGrups(page)
            const k = await rowIndexByName(page, 'arr-g')
            await openColDialog(page, k, 'belongUsers', 'grupBlngEditUsers')
            const rows = await readDlgRows(page, 'name')
            assert.strict.equal(rows['arr-u']?.enable, true, `arr-u 應顯示屬於 arr-g(陣列形式), 實得 ${JSON.stringify(rows['arr-u'])}`)
            assert.strict.equal(rows['peter']?.enable, false, 'peter 不屬於 arr-g')
            await touchUnrelatedRow(page, rows['peter'].idx)
            await saveBelongAndWaitModal(page)
            await assertModalMsg(page, 'userSaveUsersSuccess')
            await dismissResultModal(page)
            assert.deepEqual(await getResolvedActiveTargets(page, U_ID), ACTIVE_BEFORE, '存檔後權限樹須不變')
            const names = assertEnabled(await readDbField('users', U_ID, 'cgrups'), 'arr-g', 'users.cgrups', { objectForm: false })
            assert.deepEqual(names, ['arr-g'], '存檔不得把缺 mode 之 M2 補成啟用')
        })
    })

    it('AF-005-VePemiBlngGrups: 權限頁「所屬群組」對話框顯示 arr-g 含 arr-p(啟用, OR); 切開再切回無關列後存檔(對話框自行寫庫) → 授權不變、存出物件形式', async function() {
        await withPage(async (page) => {
            await gotoPemis(page)
            const k = await rowIndexByName(page, 'arr-p')
            await openColDialog(page, k, 'belongGrups', 'pemiBlngEditGrups')
            const rows = await readDlgRows(page, 'name')
            assert.strict.equal(rows['arr-g']?.enable, true, `arr-g 應顯示含 arr-p(陣列形式), 實得 ${JSON.stringify(rows['arr-g'])}`)
            assert.strict.equal(rows['權限群組M1']?.enable, false, 'M1 不含 arr-p')
            await touchUnrelatedRow(page, rows['權限群組M1'].idx)
            await saveBelongAndWaitModal(page)
            await assertModalMsg(page, 'grupSaveGrupsSuccess')
            await dismissResultModal(page)
            assert.deepEqual(await getResolvedActiveTargets(page, U_ID), ACTIVE_BEFORE, '存檔後權限樹須不變')
            const names = assertEnabled(await readDbField('grups', 'id-arr-g', 'cpemis'), 'arr-p', 'grups.cpemis', { objectForm: false })
            assert.deepEqual(names, ['arr-p'], '存檔不得把缺 mode 之 P2 補成啟用')
        })
    })

    it('AF-006-VeGrupBlngUsers-inner-name: 物件形式值內 name 指向 M2、外層鍵為 arr-g: 開 M2 的「所屬使用者」對話框, arr-u2 顯示不屬於 M2; 存檔後 arr-u2 之授權仍來自 arr-g(不被改指 M2)', async function() {
        await withPage(async (page) => {
            const before = await getResolvedActiveTargets(page, U2_ID)
            assert.deepEqual(before, ACTIVE_BEFORE, '對照組: 伺服端以外層鍵 arr-g 為名授權(值內 name 不改名)')
            await gotoGrups(page)
            const k = await rowIndexByName(page, '權限群組M2')
            await openColDialog(page, k, 'belongUsers', 'grupBlngEditUsers')
            const rows = await readDlgRows(page, 'name')
            assert.strict.equal(rows['arr-u2']?.enable, false, `arr-u2 之授權鍵為 arr-g, 不屬於 M2, 實得 ${JSON.stringify(rows['arr-u2'])}`)
            await touchUnrelatedRow(page, rows['peter'].idx)
            await saveBelongAndWaitModal(page)
            await assertModalMsg(page, 'userSaveUsersSuccess')
            await dismissResultModal(page)
            assert.deepEqual(await getResolvedActiveTargets(page, U2_ID), ACTIVE_BEFORE, '存檔後 arr-u2 權限樹須不變(修前: 值內 name 使存檔把授權改指 M2)')
            const names = assertEnabled(await readDbField('users', U2_ID, 'cgrups'), 'arr-g', 'users2.cgrups', { objectForm: false })
            assert.ok(!names.includes('權限群組M2'), `不得出現 M2: ${names.join()}`)
        })
    })


    // ===== R1(複審, R-AUTH-LIST-01): 清單頁唯讀顯示經共用解碼 =====
    //修前: Users 清單把陣列索引當群組名(「Has 2 permission group(s)」實為索引 0／2 的啟用元素, 其中 M2 缺 mode 伺服端不授權);
    //Grups 清單的 cpemis 計數與「所屬使用者」對陣列形式為 0／漏計; Pemis 清單的 crules 計數為 0、「所屬群組」為空.

    it('AF-007-list-users: 使用者清單「cgrups」欄對陣列形式顯示 1 項權限群組(arr-g); 缺 mode 之 M2 不計(伺服端不授權)', async function() {
        await withPage(async (page) => {
            await gotoUsers(page)
            const k = await rowIndexByName(page, 'arr-u')
            const t = await cellText(page, k, 'cgrups')
            assert.ok(/\b1\b/.test(t) && t.includes('(arr-g)'), `arr-u 應顯示 1 項(arr-g), 實得「${t}」`)
            const k2 = await rowIndexByName(page, 'arr-u2')
            const t2 = await cellText(page, k2, 'cgrups')
            assert.ok(/\b1\b/.test(t2) && t2.includes('(arr-g)'), `物件形式 arr-u2 應顯示 1 項(arr-g)(對照組, 值內 name 不改名), 實得「${t2}」`)
        })
    })

    it('AF-008-list-grups: 群組清單 arr-g 的「cpemis」欄顯示 1 項權限(arr-p)、「所屬使用者」欄顯示 2 位(arr-u 陣列形式與 arr-u2 物件形式)', async function() {
        await withPage(async (page) => {
            await gotoGrups(page)
            const k = await rowIndexByName(page, 'arr-g')
            const t = await cellText(page, k, 'cpemis')
            assert.ok(/\b1\b/.test(t) && t.includes('(arr-p)'), `arr-g 應顯示 1 項(arr-p), 實得「${t}」`)
            const tu = await cellText(page, k, 'belongUsers')
            assert.ok(/\b2\b/.test(tu), `arr-g 所屬使用者應為 2 位(陣列與物件形式皆計), 實得「${tu}」`)
        })
    })

    it('AF-009-list-pemis: 權限清單 arr-p 的「crules」欄顯示 2 項對象(T_ON1／T_ON2 啟用, T_OFF 停用)、「所屬群組」欄顯示 arr-g', async function() {
        await withPage(async (page) => {
            await gotoPemis(page)
            const k = await rowIndexByName(page, 'arr-p')
            const t = await cellText(page, k, 'crules')
            assert.ok(/\b2\b/.test(t), `arr-p 應顯示 2 項對象, 實得「${t}」`)
            const tg = await cellText(page, k, 'belongGrups')
            assert.ok(tg.includes('(arr-g)'), `arr-p 所屬群組應為 arr-g(陣列形式), 實得「${tg}」`)
        })
    })

    // ===== R3(複審, R-AUTH-ORDER-01): 存檔保留原鍵序 =====
    //夾具: ord-p1 規則 {T_ON1,T_ON2}、ord-p2 規則 {T_ON2}; ord-u 的 cgrups 為陣列 [ord-g1 AND 停用, ord-g2 AND, ord-g1 AND, M3 停用], 伺服端以首個有效 AND 項 ord-g2 為準 → 授權 {T_ON2};
    //對話框(群組表)序為 ord-g1 先於 ord-g2, 修前依對話框序重寫(或依「任何元素首次出現之序」解碼) → 第一個 AND 項變 ord-g1 → 授權增為 {T_ON1,T_ON2}.
    //ord-g3 的 cpemis 為陣列 [ord-p1 AND 停用, ord-p2 AND, ord-p1 AND, P3 停用](權限層同構); ord-u3 以 OR 引用 ord-g3.
    //直接編輯器(VeCgrups／VeCpemis／VeCrules)靠 keepKeyOrder 保序; 兩個關聯對話框之鍵序由解碼序構成(無重排), 靠解碼序正確(有效啟用元素首次出現之序).
    const ORD_BEFORE = [T_ON2]
    const keyOrderOf = (text) => Object.keys(JSON.parse(text))

    it('AF-010a-VeCgrups-order: 兩個 AND 群組、對話框序 ≠ 資料序: 切開再切回無關列後存檔 → 授權不變, 鍵序維持 ord-g2 先於 ord-g1', async function() {
        await withPage(async (page) => {
            assert.deepEqual(await getResolvedActiveTargets(page, 'id-ord-u'), ORD_BEFORE, '對照組: 伺服端以第一個 AND 項 ord-g2 為準 → 僅 T_ON2')
            await gotoUsers(page)
            const k = await rowIndexByName(page, 'ord-u')
            await openColDialog(page, k, 'cgrups', 'userEditCgrups')
            const rows = await readDlgRows(page, 'name')
            assert.ok(rows['ord-g1'].idx < rows['ord-g2'].idx, '前置: 對話框序 ord-g1 先於 ord-g2(與資料序相反)')
            assert.strict.equal(rows['ord-g1']?.enable && rows['ord-g2']?.enable, true)
            await touchUnrelatedRow(page, rows['權限群組M3'].idx)
            await clickDialogSave(page)
            await waitDialogClosed(page, 'userEditCgrups')
            await saveAndWaitModal(page)
            await assertModalMsg(page, 'userSaveUsersSuccess')
            assert.deepEqual(await getResolvedActiveTargets(page, 'id-ord-u'), ORD_BEFORE, '存檔後授權須不變(修前: 依對話框序重寫使第一個 AND 項變 ord-g1 → 增權)')
            const ko = keyOrderOf(await readDbField('users', 'id-ord-u', 'cgrups'))
            assert.ok(ko.indexOf('ord-g2') >= 0 && ko.indexOf('ord-g2') < ko.indexOf('ord-g1'), `鍵序須維持 ord-g2 先於 ord-g1, 實得 ${ko.join()}`)
        })
    })

    it('AF-010b-VeCpemis-order: 兩個 AND 權限、對話框序 ≠ 資料序: 存檔後授權不變, 鍵序維持 ord-p2 先於 ord-p1', async function() {
        await withPage(async (page) => {
            assert.deepEqual(await getResolvedActiveTargets(page, 'id-ord-u3'), ORD_BEFORE, '對照組: 群組 ord-g3 以第一個 AND 權限 ord-p2 為準 → 僅 T_ON2')
            await gotoGrups(page)
            const k = await rowIndexByName(page, 'ord-g3')
            await openColDialog(page, k, 'cpemis', 'grupEditCpemis')
            const rows = await readDlgRows(page, 'name')
            assert.ok(rows['ord-p1'].idx < rows['ord-p2'].idx, '前置: 對話框序 ord-p1 先於 ord-p2(與資料序相反)')
            await touchUnrelatedRow(page, rows['權限P3'].idx)
            await clickDialogSave(page)
            await waitDialogClosed(page, 'grupEditCpemis')
            await saveAndWaitModal(page)
            await assertModalMsg(page, 'grupSaveGrupsSuccess')
            assert.deepEqual(await getResolvedActiveTargets(page, 'id-ord-u3'), ORD_BEFORE, '存檔後授權須不變')
            const ko = keyOrderOf(await readDbField('grups', 'id-ord-g3', 'cpemis'))
            assert.ok(ko.indexOf('ord-p2') >= 0 && ko.indexOf('ord-p2') < ko.indexOf('ord-p1'), `鍵序須維持 ord-p2 先於 ord-p1, 實得 ${ko.join()}`)
        })
    })

    it('AF-010c-VeGrupBlngUsers-order: 在 ord-g2 的「所屬使用者」把 ord-u 切開再切回(重新加入會移到尾端)並存檔 → 授權不變, 鍵序維持 ord-g2 先於 ord-g1', async function() {
        await withPage(async (page) => {
            await gotoGrups(page)
            const k = await rowIndexByName(page, 'ord-g2')
            await openColDialog(page, k, 'belongUsers', 'grupBlngEditUsers')
            const rows = await readDlgRows(page, 'name')
            assert.strict.equal(rows['ord-u']?.enable, true, 'ord-u 屬於 ord-g2')
            await touchUnrelatedRow(page, rows['ord-u'].idx) //off → on: revRows 先刪鍵再加回(尾端); ord-u 另有停用之 M3 → isEqual 為假而改寫字串
            await saveBelongAndWaitModal(page)
            await assertModalMsg(page, 'userSaveUsersSuccess')
            await dismissResultModal(page)
            assert.deepEqual(await getResolvedActiveTargets(page, 'id-ord-u'), ORD_BEFORE, '存檔後授權須不變(修前: ord-g2 被移到尾端 → 第一個 AND 項變 ord-g1)')
            const ko = keyOrderOf(await readDbField('users', 'id-ord-u', 'cgrups'))
            assert.ok(ko.indexOf('ord-g2') >= 0 && ko.indexOf('ord-g2') < ko.indexOf('ord-g1'), `鍵序須維持 ord-g2 先於 ord-g1, 實得 ${ko.join()}`)
        })
    })

    it('AF-010d-VePemiBlngGrups-order: 在 ord-p2 的「所屬群組」把 ord-g3 切開再切回並存檔 → 授權不變, 鍵序維持 ord-p2 先於 ord-p1', async function() {
        await withPage(async (page) => {
            await gotoPemis(page)
            const k = await rowIndexByName(page, 'ord-p2')
            await openColDialog(page, k, 'belongGrups', 'pemiBlngEditGrups')
            const rows = await readDlgRows(page, 'name')
            assert.strict.equal(rows['ord-g3']?.enable, true, 'ord-g3 含 ord-p2')
            await touchUnrelatedRow(page, rows['ord-g3'].idx)
            await saveBelongAndWaitModal(page)
            await assertModalMsg(page, 'grupSaveGrupsSuccess')
            await dismissResultModal(page)
            assert.deepEqual(await getResolvedActiveTargets(page, 'id-ord-u3'), ORD_BEFORE, '存檔後授權須不變')
            const ko = keyOrderOf(await readDbField('grups', 'id-ord-g3', 'cpemis'))
            assert.ok(ko.indexOf('ord-p2') >= 0 && ko.indexOf('ord-p2') < ko.indexOf('ord-p1'), `鍵序須維持 ord-p2 先於 ord-p1, 實得 ${ko.join()}`)
        })
    })

    it('AF-010e-VeCrules-order: crules 存檔保留原鍵序(對話框序 ≠ 資料序; crules 的合併與順序無關, 統一套用)', async function() {
        await withPage(async (page) => {
            await gotoPemis(page)
            const k = await rowIndexByName(page, 'ord-p3')
            await openColDialog(page, k, 'crules', 'pemiEditCrules')
            const rows = await readDlgRows(page, 'id')
            assert.ok(rows[T_ON1].idx < rows[T_ON2].idx, '前置: 對話框序 T_ON1 先於 T_ON2')
            const other = Object.entries(rows).find(([n]) => ![T_ON1, T_ON2].includes(n))
            await touchUnrelatedRow(page, other[1].idx)
            await clickDialogSave(page)
            await waitDialogClosed(page, 'pemiEditCrules')
            await saveAndWaitModal(page)
            await assertModalMsg(page, 'pemiSavePemisSuccess')
            const ko = keyOrderOf(await readDbField('pemis', 'id-ord-p3', 'crules'))
            assert.ok(ko.indexOf(T_ON2) >= 0 && ko.indexOf(T_ON2) < ko.indexOf(T_ON1), `鍵序須維持 T_ON2 先於 T_ON1, 實得 ${ko.join()}`)
        })
    })

    // ===== R4(複審, R-AUTH-LOSSY-01): 無法無損表示者 fail-closed =====
    //lossy-u 的 cgrups 為 [ord-g1 AND, ord-g2 AND, ord-g2 OR](同名 AND／OR 並存且另有 AND 名稱): 物件形式無法無損表示, 硬寫(保留 AND 支)會增權(sol 第三輪#2).
    //編輯器須拒存並顯示固定訊息(authLossyBlocked, 點名受影響之名稱), 庫內字串不動; 未變更者回傳原字串(不重寫).

    //固定訊息: 範本 authLossyBlocked 在 {names} 之前的固定文字 + 受影響名稱
    //完整訊息比對(外審 sol#3: 名稱本已出現在底下的對話框列, 只驗前綴與 includes(名稱) 會漏掉 {names} 沒被代入的錯誤): 範本以受影響名稱代入後之整句須出現在畫面上
    async function assertLossyMsg(page, ...names) {
        const shown = names.length > 5 ? names.slice(0, 5).join(', ') + ' …' : names.join(', ') //同 joinNames: 至多 5 個, 超過加省略號
        const expected = await page.evaluate((ns) => window.$vo.$t('authLossyBlocked').split('{names}').join(ns), shown)
        const txt = await page.evaluate(() => document.body.innerText)
        assert.ok(expected.length > 20 && !expected.includes('{names}') && txt.includes(expected), `應顯示完整固定訊息 authLossyBlocked(「${expected}」)`)
    }
    async function dialogOpen(page, titleKey) {
        return await page.evaluate((k) => (document.body.innerText || '').includes(window.$vo.$t(k)), titleKey)
    }

    it('AF-011a-VeCgrups-lossy: 有損使用者: 有變更 → 拒存並顯示固定訊息(對話框不關、庫內字串不動); 未變更 → 回傳原字串(不重寫)', async function() {
        await withPage(async (page) => {
            const orig = await readDbField('users', 'id-lossy-u', 'cgrups')
            await gotoUsers(page)
            const k = await rowIndexByName(page, 'lossy-u')
            await openColDialog(page, k, 'cgrups', 'userEditCgrups')
            let rows = await readDlgRows(page, 'name')
            await toggleDialogEnable(page, rows['權限群組M3'].idx) //真變更: 啟用 M3
            await clickDialogSave(page)
            await page.waitForTimeout(1500)
            await assertLossyMsg(page, 'ord-g2')
            await dismissResultModal(page)
            assert.ok(await dialogOpen(page, 'userEditCgrups'), '被拒存後對話框須仍開著')
            assert.strict.equal(await readDbField('users', 'id-lossy-u', 'cgrups'), orig, '庫內字串不動')
            await toggleDialogEnable(page, rows['權限群組M3'].idx) //還原: 淨內容未變
            await clickDialogSave(page)
            await waitDialogClosed(page, 'userEditCgrups')
            await saveAndWaitModal(page)
            await assertModalMsg(page, 'userSaveUsersSuccess')
            assert.strict.equal(await readDbField('users', 'id-lossy-u', 'cgrups'), orig, '未變更 → 原字串逐字元不動(不被重寫成物件形式)')
        })
    })

    it('AF-011b-VeCpemis-lossy: 有損群組(cpemis 同名 OR／AND 並存): 有變更 → 拒存並顯示固定訊息; 庫內字串不動', async function() {
        await withPage(async (page) => {
            const orig = await readDbField('grups', 'id-lossy-g3', 'cpemis')
            await gotoGrups(page)
            const k = await rowIndexByName(page, 'lossy-g3')
            await openColDialog(page, k, 'cpemis', 'grupEditCpemis')
            const rows = await readDlgRows(page, 'name')
            await toggleDialogEnable(page, rows['權限P3'].idx)
            await clickDialogSave(page)
            await page.waitForTimeout(1500)
            await assertLossyMsg(page, 'ord-p1')
            await dismissResultModal(page)
            assert.ok(await dialogOpen(page, 'grupEditCpemis'), '被拒存後對話框須仍開著')
            assert.strict.equal(await readDbField('grups', 'id-lossy-g3', 'cpemis'), orig, '庫內字串不動')
        })
    })

    it('AF-011c-VeGrupBlngUsers-lossy: 有損使用者列: 變更該列 → 整次儲存拒絕並點名 lossy-u(其餘列亦不寫); 還原該列並改另一位使用者 → 成功, lossy-u 字串逐字元不動', async function() {
        await withPage(async (page) => {
            const orig = await readDbField('users', 'id-lossy-u', 'cgrups')
            const origV = await readDbField('users', 'id-lossy-v', 'cgrups')
            await gotoGrups(page)
            const k = await rowIndexByName(page, 'ord-g2')
            await openColDialog(page, k, 'belongUsers', 'grupBlngEditUsers')
            const rows = await readDlgRows(page, 'name')
            assert.strict.equal(rows['lossy-u']?.enable, true, 'lossy-u 屬於 ord-g2')
            await toggleDialogEnable(page, rows['lossy-u'].idx) //變更有損列
            await toggleDialogEnable(page, rows['lossy-v'].idx) //另一位無損使用者亦變更
            await clickDialogSave(page)
            await page.waitForTimeout(1500)
            await assertLossyMsg(page, 'lossy-u')
            await dismissResultModal(page)
            assert.ok(await dialogOpen(page, 'grupBlngEditUsers'), '被拒存後對話框須仍開著')
            assert.strict.equal(await readDbField('users', 'id-lossy-u', 'cgrups'), orig, 'lossy-u 字串不動')
            assert.strict.equal(await readDbField('users', 'id-lossy-v', 'cgrups'), origV, '原子: 其餘列(lossy-v)亦不寫')
            await toggleDialogEnable(page, rows['lossy-u'].idx) //還原有損列(lossy-v 維持已變更)
            await saveBelongAndWaitModal(page)
            await assertModalMsg(page, 'userSaveUsersSuccess')
            await dismissResultModal(page)
            assert.strict.equal(await readDbField('users', 'id-lossy-u', 'cgrups'), orig, '未變更之有損列 → 原字串逐字元不動')
            assertEnabled(await readDbField('users', 'id-lossy-v', 'cgrups'), 'ord-g2', 'lossy-v.cgrups', { objectForm: false })
        })
    })

    it('AF-011d-VePemiBlngGrups-lossy: 有損群組列: 變更該列 → 整次儲存拒絕並點名 lossy-g3; 還原並改另一個群組 → 成功, lossy-g3 字串逐字元不動', async function() {
        await withPage(async (page) => {
            const orig = await readDbField('grups', 'id-lossy-g3', 'cpemis')
            const origH = await readDbField('grups', 'id-lossy-h', 'cpemis')
            await gotoPemis(page)
            const k = await rowIndexByName(page, 'ord-p1')
            await openColDialog(page, k, 'belongGrups', 'pemiBlngEditGrups')
            const rows = await readDlgRows(page, 'name')
            assert.strict.equal(rows['lossy-g3']?.enable, true, 'lossy-g3 含 ord-p1')
            await toggleDialogEnable(page, rows['lossy-g3'].idx)
            await toggleDialogEnable(page, rows['lossy-h'].idx)
            await clickDialogSave(page)
            await page.waitForTimeout(1500)
            await assertLossyMsg(page, 'lossy-g3')
            await dismissResultModal(page)
            assert.ok(await dialogOpen(page, 'pemiBlngEditGrups'), '被拒存後對話框須仍開著')
            assert.strict.equal(await readDbField('grups', 'id-lossy-g3', 'cpemis'), orig, 'lossy-g3 字串不動')
            assert.strict.equal(await readDbField('grups', 'id-lossy-h', 'cpemis'), origH, '原子: 其餘列(lossy-h)亦不寫')
            await toggleDialogEnable(page, rows['lossy-g3'].idx)
            await saveBelongAndWaitModal(page)
            await assertModalMsg(page, 'grupSaveGrupsSuccess')
            await dismissResultModal(page)
            assert.strict.equal(await readDbField('grups', 'id-lossy-g3', 'cpemis'), orig, '未變更之有損列 → 原字串逐字元不動')
            assertEnabled(await readDbField('grups', 'id-lossy-h', 'cpemis'), 'ord-p1', 'lossy-h.cpemis', { objectForm: false })
        })
    })


    // ===== 欲寫出之鍵序被 JS 屬性序改變(外審 minimax#2) =====
    //int-u 的 cgrups 為 { ord-g1: AND }(單一 AND 項). 在 VeCgrups 新啟用整數式名稱之群組 '1' 且為 AND 時, JS 物件屬性序把 '1' 排在既有 ord-g1 前面,
    //伺服端 mergeRules 之「第一個 AND 項」從 ord-g1 變成 '1' → 授權改變; 編輯器須拒存(同無法無損表示), 改為 OR 則不影響第一個 AND 項而照常存檔.
    it('AF-012a-VeCgrups-int-name: 新啟用整數式名稱之 AND 群組 → 拒存並顯示完整固定訊息(庫內字串不動); 同一群組改為 OR → 照常存檔', async function() {
        await withPage(async (page) => {
            const orig = await readDbField('users', 'id-int-u', 'cgrups')
            await gotoUsers(page)
            const k = await rowIndexByName(page, 'int-u')
            await openColDialog(page, k, 'cgrups', 'userEditCgrups')
            const rows = await readDlgRows(page, 'name')
            const idx = rows['1'].idx
            await toggleDialogEnable(page, idx)
            await setDialogMode(page, idx, 'AND')
            await clickDialogSave(page)
            await page.waitForTimeout(1500)
            await assertLossyMsg(page, 'ord-g1', '1')
            await dismissResultModal(page)
            assert.ok(await dialogOpen(page, 'userEditCgrups'), '被拒存後對話框須仍開著')
            assert.strict.equal(await readDbField('users', 'id-int-u', 'cgrups'), orig, '庫內字串不動')
            await setDialogMode(page, idx, 'OR') //改為 OR: 只有一個 AND 項, 第一個 AND 項不變
            await clickDialogSave(page)
            await waitDialogClosed(page, 'userEditCgrups')
            await saveAndWaitModal(page)
            await assertModalMsg(page, 'userSaveUsersSuccess')
            const o = JSON.parse(await readDbField('users', 'id-int-u', 'cgrups'))
            assert.strict.equal(o['1']?.mode, 'OR')
            assert.strict.equal(o['ord-g1']?.mode, 'AND')
            //授權(外審 minimax 第二輪#6): 存檔前僅 ord-g1(AND)=[T_ON1,T_ON2]; 管理者新增 '1'(OR, 規則 {T_ON2}) 是明確變更, 伺服端語意為 OR 聯集 {T_ON2} 為基底、AND 項只約束其含有之鍵 → [T_ON2]
            assert.deepEqual(await getResolvedActiveTargets(page, 'id-int-u'), [T_ON2], '改為 OR 後之授權依伺服端 mergeRules 語意(OR 聯集為基底、AND 項取交集)')
        })
    })

})
