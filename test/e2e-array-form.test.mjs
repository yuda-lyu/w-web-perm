//陣列形式授權資料之編輯器讀取與存檔(第 92 項①, 站點 35; 規則帳本 R-AUTH-DECODE-01)
//
//外部應用經 /syncAndReplaceTabs 直接寫入「陣列形式」之授權資料(cgrups／cpemis／crules 為 [{ "name": "A", "isActive": "y", "mode": "OR" }]),
//伺服端 getUserRules 相容並授權(UNIT-OI-006a); 修正前五個編輯元件(VeCgrups／VeCpemis／VeCrules／VeGrupBlngUsers／VePemiBlngGrups)
//依名稱為鍵查值, 查不到陣列元素 → 顯示停用 → 管理者存檔即撤銷有效授權.
//本檔經真後端、真瀏覽器、真 UI 驗: ①對話框顯示與伺服端授權一致(啟用者顯示啟用) ②存檔後「外部應用實際查到的權限樹」不變(getPermUserInfor) ③存出形式為物件形式.
//
//語意斷言為主, 不產標準圖(此檔驗授權語意, 不是外觀; 標準圖產製須另行取得授權): 每案 fresh browser + 以同步端點重寫陣列形式夾具(from=appArrForm).
//夾具鏈(全為新列, 不動 base seed): 使用者 arr-u.cgrups → 群組 arr-g.cpemis → 權限 arr-p.crules → 標的(base seed 之前三個標的).
//run02(複審 R1／R3／R4): AF-007～009 清單頁唯讀顯示經共用解碼(R-AUTH-LIST-01); AF-010a～d 存檔後授權不變(對話框序 ≠ 資料序之兩個 AND 項);
//  AF-011a～d 無法無損表示者 fail-closed(R-AUTH-LOSSY-01: 固定訊息、庫內字串逐字元不動)——四個帶 mode 的編輯器皆涵蓋.
//run04(R-AUTH-MERGE-00, ADR-033): 合併結果與項目之儲存順序、物件鍵序、陣列元素序無關, 故原 R-AUTH-ORDER-01 之「鍵序保留」斷言(AF-010a～e 之 keyOrderOf)與 AF-012a 之「整數式名稱易位拒存」隨 keepKeyOrder／getKeyOrderLost／getKpWriteLost 移除;
//  AF-010a～d 簡化為只驗「授權不變」(端到端不變式仍有迴歸價值; 原 AF-010e 之 crules 鍵序斷言改由 AF-016 取代)、AF-012a 改為「新啟用整數式名稱之 AND 群組可照常存檔、授權符合新規則」;
//  AF-016a／b: VeCrules 兩態(勾／不勾)——重存稀疏 AND 權限(把「未列」寫成顯式 n)授權不變、取消勾選(顯式 n)≡ 該鍵未列.
//run03(F-22／F-24): AF-013a／b 新增使用者／群組(cgrups／cpemis 預設為空字串)→ 儲存 → 開「所屬…」對話框須能開啟(R-REL-PARSE-01);
//  AF-014 對話框開啟後 store 被另一端重排／刪除列: a／b 反向對話框存檔寫到正確的使用者／群組(其餘之有效歸屬〔排序後比較; 授權與順序無關〕與端到端授權不變)、c 對應列被刪除則整次拒存、d 配不到之列夾在中間時顯示不錯位、
//  e 清單頁直接編輯器(VeCgrups)回填以 id 重找列(R-REL-PAIR-01)。「其餘不變」以有效歸屬(保序)比對: 關聯對話框存檔會把含停用項／缺 mode 項之陣列形式正規化為最小物件形式, 字串可變而授權不變。
//  本檔為單語(預設語系)例外: 驗的是授權資料形狀(陣列形式、空字串)與列配對的語意, 與語系無關, 不產標準圖(ADR-011 Update)。
//run05(R-PRINCIPLE-00 c～h「遇衝突收嚴＋提示」; ADR-035; 2026-10-21): ①缺 mode 之啟用項由「不計入」改為「AND 限制項」(e), AF-000～008 之夾具與斷言隨之改寫(見 FIX 註解; 原斷言凍結舊語意);
//  AF-014e 之 effectiveList 同步(缺 mode 視為 AND). ②檔尾新增 describe「run05 衝突提示」: AF-017～ 為各 spec 本輪新增之 E2E 案例之語意斷言(不產標準圖; 案名註明對應之 spec 與 E2E 編號),
//  tooltip 文字有語系差異者各語系各跑一次(setLang), 期望文字一律由頁面 $t 取範本代入, 不寫死整句。歷史同名(g、d)以 restartBackend 之 seedExtra 於後端停止期間旁路寫庫, 收尾 reseed。
//跑法: npx mocha test/e2e-array-form.test.mjs --timeout 300000
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import JSON5 from 'json5'
import { startServersOnce, launchBrowser, openApp, saveAndWaitModal, assertModalMsg, dismissResultModal, gotoUsers, gotoGrups, gotoPemis, toggleDialogEnable, clickDialogSave, clickDialogClose, waitDialogClosed, openBelongDialog, saveBelongAndWaitModal, getResolvedActiveTargets, setDialogMode, apiBaseUrl, clickAdd, typeIntoCell, waitUntilExist, setLang, checkRow, iconBtn, MDI, DLG_MDI, dlgBtn, readDialogChipsRow, restartBackend, genTempSettings } from './tools/e2e-setup.mjs'
import { callRpc, TOKEN_ADMIN, TOKEN_APP, readTables, restoreTables } from './tools/api-setup.mjs'

const FROM = 'appArrForm'
const U_ID = 'id-arr-u'
const U2_ID = 'id-arr-u2'
const SEL_MODAL = 'div[style*="overscroll-behavior"] div[tabindex="0"] > div' //WDialog 結果 modal / Ve 對話框(同 e2e-users)

//授權鏈之夾具(陣列形式; 'n' 者用來驗「停用者仍顯示停用」)
const T_ON1 = '專案A/頁A/區塊A'
const T_ON2 = '專案A/頁A/區塊A/分析按鈕'
const T_OFF = '專案A/頁A/區塊A/執行按鈕'
//夾具含「缺 mode 之啟用元素」(使用者層 M2、權限層 P1): run05 起(R-PRINCIPLE-00 e; R-AUTH-MERGE-00 第 5 條修訂; ADR-035)伺服端視為 AND 限制項(只交集、不單獨授予),
//  編輯器顯示為啟用之 AND 並於名稱左側出警告圖示(warnRefModeInvalid), 存檔時該項原樣保留(mode 仍缺漏; 主責 2026-10-21 通知: 編輯器還原原始 mode), 授權不變;
//  不得丟棄或顯示停用(放寬)、不得補成 OR(增權)(外審 minimax#1 之原意「存檔不得增權」不變).
//  run05 前此二元素「不計入」(編輯器顯示停用); 新語意下原夾具 arr-g 之缺 mode 元素為 P2(與 arr-p 無共同管理對象)會使整條授權為空、看不出限制是否保留,
//  故權限層改為 P1(規則 {T_ON1}: 與 arr-p {T_ON1,T_ON2} 部分重疊, 保留／丟棄／補成 OR 三者之授權皆不同), 原 P1(停用)改為 P2(停用)
//u2 為物件形式且值內 name 指向 M2: 伺服端以外層鍵 arr-g 為名; 關聯對話框須同(外審 sol#5; 否則存檔把授權改指 M2)
const FIX = {
    users: [
        { id: U_ID, order: 100, name: 'arr-u', email: 'arr-u@example.com', isAdmin: 'n', isActive: 'y', cgrups: JSON.stringify([{ name: 'arr-g', mode: 'OR', isActive: 'y' }, { name: '權限群組M1', mode: 'OR', isActive: 'n' }, { name: '權限群組M2', isActive: 'y' }]) },
        { id: U2_ID, order: 101, name: 'arr-u2', email: 'arr-u2@example.com', isAdmin: 'n', isActive: 'y', cgrups: JSON.stringify({ 'arr-g': { name: '權限群組M2', mode: 'OR', isActive: 'y' } }) },
    ],
    grups: [{ id: 'id-arr-g', order: 100, name: 'arr-g', cpemis: JSON.stringify([{ name: 'arr-p', mode: 'OR', isActive: 'y' }, { name: '權限P2', mode: 'OR', isActive: 'n' }, { name: '權限P1', isActive: 'y' }]) }],
    pemis: [{ id: 'id-arr-p', order: 100, name: 'arr-p', crules: JSON.stringify([{ name: T_ON1, isActive: 'y' }, { name: T_ON2, isActive: 'y' }, { name: T_OFF, isActive: 'n' }]) }],
}

//順序與有損夾具(原 R-AUTH-ORDER-01 已由 R-AUTH-MERGE-00 取代: 授權與順序無關; R-AUTH-LOSSY-01 仍適用): ord-p1 規則 {T_ON1,T_ON2}、ord-p2 規則 {T_ON2}、ord-p3 的 crules 鍵序為 T_ON2 先於 T_ON1;
//ord-g1／ord-g2 各含 ord-p1／ord-p2(OR); ord-g3 的 cpemis 為陣列 [ord-p1 AND 停用, ord-p2 AND, ord-p1 AND, P3 停用]; lossy-g3 的 cpemis 為 [ord-p1 OR, ord-p1 AND, P3 停用](同名並存; 停用項使 isEqual 為假——關聯對話框若未跳過有損列即會重寫字串);
//ord-u 的 cgrups 為陣列 [ord-g1 AND 停用, ord-g2 AND, ord-g1 AND, M3 停用](有效 AND 項 ord-g2 {T_ON2} 與 ord-g1 {T_ON1,T_ON2} 之交集 → 授權僅 T_ON2); ord-u3 以 OR 引用 ord-g3;
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

//VeCrules 兩態夾具(run04, R-AUTH-MERGE-00 第 1 條「未給＝n」; AF-016): rs-g 含 rs-po(OR, 規則 {T_ON1,T_ON2})與 rs-pa(AND, 規則只列 T_ON2——稀疏, T_ON1 未列);
//新規則: OR 聯集 {T_ON1,T_ON2} ∩ AND {T_ON2} = {T_ON2}(舊規則「未列＝不約束」得 {T_ON1,T_ON2}, 重存 rs-pa 把 T_ON1 寫成顯式 n 後才變 {T_ON2}: 靜默撤權).
//rs-g2 以 rs-po2(OR, 規則只列 T_ON1: T_ON2 未列)與 rs-pa 組成, 供 AF-016b 對照「取消勾選(顯式 n)≡ 未列」
FIX.pemis.push(
    { id: 'id-rs-po', order: 107, name: 'rs-po', crules: JSON.stringify({ [T_ON1]: 'y', [T_ON2]: 'y' }) },
    { id: 'id-rs-pa', order: 108, name: 'rs-pa', crules: JSON.stringify({ [T_ON2]: 'y' }) },
    { id: 'id-rs-po2', order: 109, name: 'rs-po2', crules: JSON.stringify({ [T_ON1]: 'y' }) },
)
FIX.grups.push(
    { id: 'id-rs-g', order: 107, name: 'rs-g', cpemis: JSON.stringify({ 'rs-po': ON(), 'rs-pa': ON('AND') }) },
    { id: 'id-rs-g2', order: 108, name: 'rs-g2', cpemis: JSON.stringify({ 'rs-po2': ON(), 'rs-pa': ON('AND') }) },
)
FIX.users.push(
    { id: 'id-rs-u', order: 107, name: 'rs-u', email: MAIL('rs-u'), isAdmin: 'n', isActive: 'y', cgrups: JSON.stringify({ 'rs-g': ON() }) },
    { id: 'id-rs-u2', order: 108, name: 'rs-u2', email: MAIL('rs-u2'), isAdmin: 'n', isActive: 'y', cgrups: JSON.stringify({ 'rs-g2': ON() }) },
)

//經外部同步端點寫入陣列形式夾具(app token; 以 from 為界全量取代, 每案前重寫即還原)
async function seedArrayForm() {
    for (const kt of ['pemis', 'grups', 'users']) {
        const url = `${apiBaseUrl}/syncAndReplaceTabs?keyTable=${kt}&token=${encodeURIComponent(TOKEN_APP)}`
        const res = await (await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ from: FROM, rows: FIX[kt].map((v) => ({ ...v, from: FROM })) }) })).json()
        assert.ok(res.state === 'success', `夾具 ${kt} 寫入應成功, 實得 ${JSON.stringify(res)}`)
    }
}

//另一個 from 分區的同步寫入(app token; 以 from 為界全量取代該分區, 不動夾具分區 FROM): 供「壞 JSON 列」等一次性夾具(run03 AF-013c); 收尾同樣由 restoreTables 還原
async function syncRows(kt, rows, from) {
    const url = `${apiBaseUrl}/syncAndReplaceTabs?keyTable=${kt}&token=${encodeURIComponent(TOKEN_APP)}`
    const res = await (await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ from, rows: rows.map((v) => ({ ...v, from })) }) })).json()
    assert.ok(res.state === 'success', `夾具 ${kt}(${from}) 寫入應成功, 實得 ${JSON.stringify(res)}`)
}

//庫內某表名稱為 name 之列的 id(經資料通道 select; 不經瀏覽器狀態)
async function findIdByName(kt, name) {
    const r = await callRpc(`${kt}.select`, [], TOKEN_ADMIN)
    const row = (r.output || []).find((v) => v.name === name)
    assert.ok(row, `${kt} 應有名稱為 ${name} 之列`)
    return row.id
}

//readTables／restoreTables(讀三表現況並依 order 排序／收尾原樣寫回; 擷取 ↔ 還原對稱)收斂於 test/tools/api-setup.mjs(2026-10-21 run03: 與 api-keyProp 共用), 說明見該處

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

//夾具之端到端授權(getPermUserInfor; run05 新語意, 種子 P1 規則 {T_ON1}、M2 = P2 ∪ P3 = {專案A/頁C, 專案B/頁A/區塊A, 專案B/頁A/區塊B, 專案B/頁A/區塊C}):
//  arr-g = arr-p(OR) {T_ON1,T_ON2} ∩ P1(缺 mode → AND 限制項) {T_ON1} = {T_ON1}
//  arr-u2(物件形式, 外層鍵 arr-g) = arr-g = {T_ON1}(對照組: 陣列形式之 crules／cpemis 確被伺服端授權)
//  arr-u = arr-g(OR) {T_ON1} ∩ M2(缺 mode → AND 限制項) = ∅
//  編輯器若丟棄或停用缺 mode 之元素: arr-g → {T_ON1,T_ON2}、arr-u → {T_ON1}; 若補成 OR: arr-g → {T_ON1,T_ON2}、arr-u → {T_ON1} ∪ M2——三種錯誤皆使授權改變而被斷言抓到
const ARR_U_BEFORE = []
const ARR_U2_BEFORE = [T_ON1]
//兩位夾具使用者之授權皆須不變(存檔後; 使用者層與權限層之缺 mode 限制項各由 arr-u／arr-u2 觀察)
async function assertArrAuthUnchanged(page, label) {
    assert.deepEqual(await getResolvedActiveTargets(page, U_ID), ARR_U_BEFORE, `${label}: arr-u 權限樹須不變(M2 缺 mode 之 AND 限制須保留)`)
    assert.deepEqual(await getResolvedActiveTargets(page, U2_ID), ARR_U2_BEFORE, `${label}: arr-u2 權限樹須不變(P1 缺 mode 之 AND 限制須保留)`)
}

//某儲存格(scope 內 row-index＝k、col-id＝c)之警告圖示的 tooltip: 圖示為 $ui.getIcon('warning')(base64 png), title 在圖示本身或其外層; 無圖示回 null(run05, R-PRINCIPLE-00 原則 3「提示」)
async function cellWarnTitle(page, k, c, scope = '') {
    return await page.evaluate(([sc, kk, cc]) => {
        const cells = [...document.querySelectorAll(`${sc} .ag-row[row-index="${kk}"] .ag-cell[col-id="${cc}"]`)]
        for (const cell of cells) {
            const img = cell.querySelector('img[src^="data:image/png;base64"]')
            if (img) {
                const t = img.closest('[title]')
                return t ? t.getAttribute('title') : ''
            }
        }
        return null
    }, [scope, k, c])
}
//對話框內某列某欄之警告圖示 tooltip(無則 null)
async function dlgWarnTitle(page, k, c = 'name') {
    return await cellWarnTitle(page, k, c, SEL_MODAL)
}
//期望之提示文字: 以頁面語系之範本代入(同 src/js/getAuthWarn.mjs:fmtWarn; 名稱以「, 」串接), 不寫死整句(兩語系皆可)
async function expWarn(page, key, vars = {}) {
    return await page.evaluate(([k, v]) => {
        const $t = window.$vo.$t
        let s = String($t(k))
        if (v.names) s = s.split('{names}').join(v.names.join(', '))
        if (v.kindKey) s = s.split('{kind}').join($t(v.kindKey))
        if ('n' in v) s = s.split('{n}').join(String(v.n))
        return s
    }, [key, vars])
}
//解析某名稱於授權字串中之有效模式(啟用者: mode 為 OR 才是 OR, 缺或非法視為 AND; 停用或查無回 null)——run05 新語意(R-AUTH-MERGE-00 第 5 條修訂)
function effModeOf(text, name) {
    const o = JSON5.parse(text)
    let hit = null
    const visit = (n, v) => {
        if (hit !== null || n !== name) return
        const act = (v && typeof v === 'object') ? v.isActive === 'y' : v === 'y'
        if (act) hit = (v && typeof v === 'object' && v.mode === 'OR') ? 'OR' : 'AND'
    }
    if (Array.isArray(o)) o.forEach((e) => visit(e && e.name, e))
    else Object.entries(o).forEach(([k, v]) => visit(k, v))
    return hit
}


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
//(註: run05 起 mode 缺或非 OR／AND 之啟用項伺服端視為 AND 限制項〔R-PRINCIPLE-00 e〕, 與 activeNamesOf 之「isActive 為 y」口徑一致; 其有效模式以 effModeOf 斷言; run05 前「不納入合併」之註記已不成立)
//有效歸屬之比較鍵: 「有效啟用」元素(isActive 為 y)之「名稱:有效 mode」(排序後回傳)、同名取第一個(物件／陣列形式皆可).
//  run05(R-PRINCIPLE-00 e; R-AUTH-MERGE-00 第 5 條修訂): mode 缺或非 OR／AND 之啟用元素視為 AND(限制項), 純量 'y'(如 {"G":"y"})亦為啟用 AND——
//  原「mode 非 OR／AND 者不計」凍結舊語意: 編輯器把缺 mode 之 M2 存成顯式 AND 時(run05 當時之實作), 授權不變而比較鍵卻多出一項(AF-014e 首輪實跑 2026-10-21 即因此紅);
//  不論存檔寫出顯式 AND 或原樣保留缺漏之 mode, 本比較鍵皆為「M2:AND」.
//why: 關聯對話框存檔時, 凡解碼後內容與欲寫出者不同(如陣列形式含停用項、缺 mode 項)即改寫為最小的物件形式並丟棄停用項, 字串會變而授權不變(R-AUTH-DECODE-01),
//故「其他列未被改寫」不以字串逐字相同判定(AF-013c 之壞 JSON 列因解碼失敗視為空容器且歸屬未變, 才以逐字判定); run04 起本函數不再保序比較(AF-014 首輪實跑: 關聯對話框改寫字串時依解碼序〔名稱首次出現序〕輸出, 與資料序不同但授權相同; 保序比較屬 run02 舊規則之指紋),
//另以端到端授權結果(getResolvedActiveTargets)補強(AF-014a)
function effectiveList(text) {
    const o = JSON5.parse(text) //base seed 之授權字串為 JSON5(多行、鍵不加引號)
    const out = []
    const seen = new Set()
    const add = (name, v) => {
        const act = (v && typeof v === 'object') ? v.isActive === 'y' : v === 'y'
        if (act && typeof name === 'string' && !seen.has(name)) {
            seen.add(name)
            out.push(`${name}:${(v && typeof v === 'object' && v.mode === 'OR') ? 'OR' : 'AND'}`)
        }
    }
    if (Array.isArray(o)) {
        o.forEach((e) => add(e && e.name, e))
    }
    else {
        Object.entries(o).forEach(([k, v]) => add(k, v))
    }
    return out.sort() //排序後比較: 授權與順序無關(R-AUTH-MERGE-00 第 4 條), 解碼序（名稱首次出現序）與資料序不同不算變動; 端到端授權另以 getResolvedActiveTargets 補強
}
//所有使用者各自之端到端授權結果(外部應用實際查到之啟用標的, 排序後陣列): { id: [標的…] }
async function resolvedTargetsOf(page, userIds) {
    const out = {}
    for (const id of userIds) {
        out[id] = await getResolvedActiveTargets(page, id)
    }
    return out
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

    it('AF-000-fixture-authorizes: 夾具(陣列形式)經真後端 getPermUserInfor: arr-u2 得 T_ON1(陣列形式確被授權; P1 缺 mode 為 AND 限制項)、arr-u 為空(M2 缺 mode 為 AND 限制項), 皆不授權 T_OFF(對照組; run05 新語意)', async function() {
        await withPage(async (page) => {
            //run05(R-PRINCIPLE-00 e): 原期望 arr-u 得 {T_ON1,T_ON2}(缺 mode 之 M2／P2 不計入)凍結舊語意; 新語意見 ARR_U_BEFORE／ARR_U2_BEFORE 之推導
            assert.deepEqual(await getResolvedActiveTargets(page, U2_ID), ARR_U2_BEFORE, 'arr-u2 = arr-p {T_ON1,T_ON2} ∩ P1 {T_ON1}')
            assert.deepEqual(await getResolvedActiveTargets(page, U_ID), ARR_U_BEFORE, 'arr-u = arr-g {T_ON1} ∩ M2(與 T_ON1 無交集)')
        })
    })

    it('AF-001-VeCgrups: 使用者頁 cgrups 對話框顯示 arr-g 啟用(OR)、M1 停用、缺 mode 之 M2 為啟用 AND 並帶警告圖示; 切開再切回無關列後存檔 → 授權不變、存出物件形式且 M2 原樣保留(mode 仍缺漏)', async function() {
        await withPage(async (page) => {
            await gotoUsers(page)
            const k = await rowIndexByName(page, 'arr-u')
            await openColDialog(page, k, 'cgrups', 'userEditCgrups')
            const rows = await readDlgRows(page, 'name')
            assert.strict.equal(rows['arr-g']?.enable, true, `arr-g 應顯示啟用(陣列形式), 實得 ${JSON.stringify(rows['arr-g'])}`)
            assert.ok(/OR/.test(rows['arr-g'].text), `arr-g 模式應顯示 OR, 實得 ${rows['arr-g'].text}`)
            assert.strict.equal(rows['權限群組M1']?.enable, false, 'M1 於夾具為 n, 應顯示停用')
            //run05(spec 流程_使用者群組關聯 E2E-012; ADR-035 e): 缺 mode 之啟用項 = 伺服端之 AND 限制項 → 編輯器顯示啟用、模式 AND、名稱左側警告圖示(原斷言「顯示停用」凍結舊語意: 存檔即丟掉此 AND 限制而放寬)
            assert.strict.equal(rows['權限群組M2']?.enable, true, 'M2 於夾具為 y 但缺 mode: 應顯示啟用(視為 AND)')
            assert.ok(/AND/.test(rows['權限群組M2'].text), `M2 模式應顯示 AND, 實得 ${rows['權限群組M2'].text}`)
            assert.strict.equal(await dlgWarnTitle(page, rows['權限群組M2'].idx), await expWarn(page, 'warnRefModeInvalid', { names: ['權限群組M2'] }), 'M2 名稱左側警告圖示之 tooltip 為 warnRefModeInvalid')
            assert.strict.equal(await dlgWarnTitle(page, rows['arr-g'].idx), null, '無衝突之列(arr-g)不出警告圖示')
            await touchUnrelatedRow(page, rows['權限群組M3'].idx)
            await clickDialogSave(page)
            await waitDialogClosed(page, 'userEditCgrups')
            await saveAndWaitModal(page)
            await assertModalMsg(page, 'userSaveUsersSuccess')
            await assertArrAuthUnchanged(page, '存檔後')
            const text = await readDbField('users', U_ID, 'cgrups')
            const names = assertEnabled(text, 'arr-g', 'users.cgrups', { objectForm: true })
            assert.deepEqual(names.slice().sort(), ['arr-g', '權限群組M2'].sort(), '存檔須保留 M2 之啟用(不得丟棄)')
            //run05(主責 2026-10-21 通知: 編輯器存檔時對 mode 缺／非法之啟用項還原原始 mode): 缺 mode 之 M2 原樣保留(mode 仍缺漏, 不補成 AND 亦不補成 OR), 有效模式仍為 AND(限制項)
            assert.strict.equal(JSON.parse(text)['權限群組M2'].mode, undefined, `缺 mode 之 M2 存檔後 mode 仍缺漏(原樣保留), 實得 ${text}`)
            assert.strict.equal(effModeOf(text, '權限群組M2'), 'AND', 'M2 之有效模式仍為 AND')
        })
    })

    it('AF-002-VeCpemis: 群組頁 cpemis 對話框顯示 arr-p 啟用(OR)、P2 停用、缺 mode 之 P1 為啟用 AND 並帶警告圖示; 存檔 → 授權不變、存出物件形式且 P1 原樣保留(mode 仍缺漏)', async function() {
        await withPage(async (page) => {
            await gotoGrups(page)
            const k = await rowIndexByName(page, 'arr-g')
            await openColDialog(page, k, 'cpemis', 'grupEditCpemis')
            const rows = await readDlgRows(page, 'name')
            assert.strict.equal(rows['arr-p']?.enable, true, `arr-p 應顯示啟用(陣列形式), 實得 ${JSON.stringify(rows['arr-p'])}`)
            assert.ok(/OR/.test(rows['arr-p'].text), `arr-p 模式應顯示 OR, 實得 ${rows['arr-p'].text}`)
            assert.strict.equal(rows['權限P2']?.enable, false, 'P2 於夾具為 n, 應顯示停用')
            //run05(spec 流程_群組權限關聯 E2E-008 備註; ADR-035 e): 同 AF-001 之權限層
            assert.strict.equal(rows['權限P1']?.enable, true, 'P1 於夾具為 y 但缺 mode: 應顯示啟用(視為 AND)')
            assert.ok(/AND/.test(rows['權限P1'].text), `P1 模式應顯示 AND, 實得 ${rows['權限P1'].text}`)
            assert.strict.equal(await dlgWarnTitle(page, rows['權限P1'].idx), await expWarn(page, 'warnRefModeInvalid', { names: ['權限P1'] }), 'P1 名稱左側警告圖示之 tooltip 為 warnRefModeInvalid')
            assert.strict.equal(await dlgWarnTitle(page, rows['arr-p'].idx), null, '無衝突之列(arr-p)不出警告圖示')
            await touchUnrelatedRow(page, rows['權限P3'].idx)
            await clickDialogSave(page)
            await waitDialogClosed(page, 'grupEditCpemis')
            await saveAndWaitModal(page)
            await assertModalMsg(page, 'grupSaveGrupsSuccess')
            await assertArrAuthUnchanged(page, '存檔後')
            const text = await readDbField('grups', 'id-arr-g', 'cpemis')
            const names = assertEnabled(text, 'arr-p', 'grups.cpemis', { objectForm: true })
            assert.deepEqual(names.slice().sort(), ['arr-p', '權限P1'].sort(), '存檔須保留 P1 之啟用(不得丟棄)')
            //run05(同 AF-001): 缺 mode 之 P1 原樣保留(mode 仍缺漏), 有效模式仍為 AND
            assert.strict.equal(JSON.parse(text)['權限P1'].mode, undefined, `缺 mode 之 P1 存檔後 mode 仍缺漏(原樣保留), 實得 ${text}`)
            assert.strict.equal(effModeOf(text, '權限P1'), 'AND', 'P1 之有效模式仍為 AND')
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
            await assertArrAuthUnchanged(page, '存檔後') //run05: 原以 ACTIVE_BEFORE {T_ON1,T_ON2} 比對 arr-u(舊語意), 改為兩位夾具使用者之新語意授權
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
            //run05(spec 流程_使用者群組關聯 E2E-015 之同型; ADR-035 e): arr-u 之 cgrups 含缺 mode 之 M2 → 「所屬權限群組名稱」儲存格最左警告圖示, tooltip 同清單頁; 無衝突之列不出圖示
            assert.strict.equal(await dlgWarnTitle(page, rows['arr-u'].idx, 'grupsNames'), await expWarn(page, 'warnRefModeInvalid', { names: ['權限群組M2'] }), 'arr-u 列之警告 tooltip 為 warnRefModeInvalid(M2)')
            assert.strict.equal(await dlgWarnTitle(page, rows['peter'].idx, 'grupsNames'), null, 'peter 列無警告圖示')
            await touchUnrelatedRow(page, rows['peter'].idx)
            await saveBelongAndWaitModal(page)
            await assertModalMsg(page, 'userSaveUsersSuccess')
            await dismissResultModal(page)
            await assertArrAuthUnchanged(page, '存檔後')
            const text = await readDbField('users', U_ID, 'cgrups')
            const names = assertEnabled(text, 'arr-g', 'users.cgrups', { objectForm: false })
            //run05: 原「names 只有 arr-g(不得把缺 mode 之 M2 補成啟用)」凍結舊語意; 新語意 M2 為 AND 限制項, 須保留啟用且有效模式為 AND(不得丟棄、不得補成 OR)
            assert.deepEqual(names.slice().sort(), ['arr-g', '權限群組M2'].sort(), 'M2 之啟用須保留')
            assert.strict.equal(effModeOf(text, '權限群組M2'), 'AND', 'M2 之有效模式須為 AND')
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
            //run05(spec 流程_群組權限關聯 E2E-009 之同型): arr-g 之 cpemis 含缺 mode 之 P1 → 「所屬權限名稱」儲存格最左警告圖示
            assert.strict.equal(await dlgWarnTitle(page, rows['arr-g'].idx, 'pemisNames'), await expWarn(page, 'warnRefModeInvalid', { names: ['權限P1'] }), 'arr-g 列之警告 tooltip 為 warnRefModeInvalid(P1)')
            assert.strict.equal(await dlgWarnTitle(page, rows['權限群組M1'].idx, 'pemisNames'), null, 'M1 列無警告圖示')
            await touchUnrelatedRow(page, rows['權限群組M1'].idx)
            await saveBelongAndWaitModal(page)
            await assertModalMsg(page, 'grupSaveGrupsSuccess')
            await dismissResultModal(page)
            await assertArrAuthUnchanged(page, '存檔後')
            const text = await readDbField('grups', 'id-arr-g', 'cpemis')
            const names = assertEnabled(text, 'arr-p', 'grups.cpemis', { objectForm: false })
            //run05: 同 AF-004 之權限層(原「names 只有 arr-p」凍結舊語意)
            assert.deepEqual(names.slice().sort(), ['arr-p', '權限P1'].sort(), 'P1 之啟用須保留')
            assert.strict.equal(effModeOf(text, '權限P1'), 'AND', 'P1 之有效模式須為 AND')
        })
    })

    it('AF-006-VeGrupBlngUsers-inner-name: 物件形式值內 name 指向 M2、外層鍵為 arr-g: 開 M2 的「所屬使用者」對話框, arr-u2 顯示不屬於 M2; 存檔後 arr-u2 之授權仍來自 arr-g(不被改指 M2)', async function() {
        await withPage(async (page) => {
            const before = await getResolvedActiveTargets(page, U2_ID)
            assert.deepEqual(before, ARR_U2_BEFORE, '對照組: 伺服端以外層鍵 arr-g 為名授權(值內 name 不改名)')
            await gotoGrups(page)
            const k = await rowIndexByName(page, '權限群組M2')
            await openColDialog(page, k, 'belongUsers', 'grupBlngEditUsers')
            const rows = await readDlgRows(page, 'name')
            assert.strict.equal(rows['arr-u2']?.enable, false, `arr-u2 之授權鍵為 arr-g, 不屬於 M2, 實得 ${JSON.stringify(rows['arr-u2'])}`)
            await touchUnrelatedRow(page, rows['peter'].idx)
            await saveBelongAndWaitModal(page)
            await assertModalMsg(page, 'userSaveUsersSuccess')
            await dismissResultModal(page)
            assert.deepEqual(await getResolvedActiveTargets(page, U2_ID), ARR_U2_BEFORE, '存檔後 arr-u2 權限樹須不變(修前: 值內 name 使存檔把授權改指 M2)')
            const names = assertEnabled(await readDbField('users', U2_ID, 'cgrups'), 'arr-g', 'users2.cgrups', { objectForm: false })
            assert.ok(!names.includes('權限群組M2'), `不得出現 M2: ${names.join()}`)
        })
    })


    // ===== R1(複審, R-AUTH-LIST-01): 清單頁唯讀顯示經共用解碼 =====
    //修前: Users 清單把陣列索引當群組名(「Has 2 permission group(s)」實為索引 0／2 的啟用元素, 其中 M2 缺 mode 伺服端不授權);
    //Grups 清單的 cpemis 計數與「所屬使用者」對陣列形式為 0／漏計; Pemis 清單的 crules 計數為 0、「所屬群組」為空.

    it('AF-007-list-users: 使用者清單「cgrups」欄對陣列形式顯示 2 項權限群組(arr-g＋缺 mode 視為 AND 之 M2)並於按鈕左側出警告圖示; 物件形式 arr-u2 顯示 1 項(arr-g)、無圖示', async function() {
        await withPage(async (page) => {
            await gotoUsers(page)
            const k = await rowIndexByName(page, 'arr-u')
            const t = await cellText(page, k, 'cgrups')
            //run05(spec 流程_後台使用者清單 E2E-013; ADR-035 e): 原「缺 mode 之 M2 不計(1 項)」凍結舊語意; 缺 mode 之啟用項為 AND 限制項而計入, 並提示
            assert.ok(/\b2\b/.test(t) && !t.includes('(arr-g)'), `arr-u 應顯示 2 項(不列名稱), 實得「${t}」`)
            assert.strict.equal(await cellWarnTitle(page, k, 'cgrups'), await expWarn(page, 'warnRefModeInvalid', { names: ['權限群組M2'] }), 'arr-u 之 cgrups 儲存格警告 tooltip 為 warnRefModeInvalid(M2)')
            const k2 = await rowIndexByName(page, 'arr-u2')
            const t2 = await cellText(page, k2, 'cgrups')
            assert.ok(/\b1\b/.test(t2) && t2.includes('(arr-g)'), `物件形式 arr-u2 應顯示 1 項(arr-g)(對照組, 值內 name 不改名), 實得「${t2}」`)
            assert.strict.equal(await cellWarnTitle(page, k2, 'cgrups'), null, 'arr-u2 無衝突, 不出警告圖示')
        })
    })

    it('AF-008-list-grups: 群組清單 arr-g 的「cpemis」欄顯示 2 項權限(arr-p＋缺 mode 視為 AND 之 P1)並出警告圖示、「所屬使用者」欄顯示 2 位(arr-u 陣列形式與 arr-u2 物件形式)', async function() {
        await withPage(async (page) => {
            await gotoGrups(page)
            const k = await rowIndexByName(page, 'arr-g')
            const t = await cellText(page, k, 'cpemis')
            //run05(spec 流程_後台群組清單 E2E-013): 原「1 項(arr-p)」凍結舊語意(缺 mode 之元素不計)
            assert.ok(/\b2\b/.test(t) && !t.includes('(arr-p)'), `arr-g 應顯示 2 項, 實得「${t}」`)
            assert.strict.equal(await cellWarnTitle(page, k, 'cpemis'), await expWarn(page, 'warnRefModeInvalid', { names: ['權限P1'] }), 'arr-g 之 cpemis 儲存格警告 tooltip 為 warnRefModeInvalid(P1)')
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

    // ===== run03 F-22(R-REL-PARSE-01): 新增列(cgrups／cpemis 預設為空字串)不得使「所屬…」關聯對話框打不開 =====
    //修前: users.funNew().cgrups／grups.funNew().cpemis 皆為 ''; 兩個關聯對話框的 genItems 對「全部」使用者／群組逐一 cvKpToObj(JSON5.parse(…)),
    //JSON5.parse('') 拋 SyntaxError → 只要表內有一筆新建尚未指派的列, 所有群組／權限的「所屬…」按鈕都打不開(頁面錯誤 Vue warn: Error in v-on handler)。
    //此二案走完整真實路徑: 清單頁新增(真滑鼠鍵盤)→ 儲存 → 結果訊息框 → 切到另一頁 → 點「所屬…」→ 對話框開啟且列出新列(未歸屬)。
    //收尾以 restoreTables(snap0) 還原三表(夾具列由下一案的 beforeEach 重寫), 使本案新增的列不影響其他案。

    it('AF-013a-new-user-then-belong-users: 使用者頁新增使用者並儲存後, 群組頁「所屬使用者」對話框仍能開啟, 且列出新使用者(未歸屬 arr-g)、arr-u 仍歸屬(修前對話框打不開)', async function() {
        try {
            await withPage(async (page) => {
                await gotoUsers(page)
                await clickAdd(page)
                await typeIntoCell(page, 0, 'name', 'kp-new-u')
                await typeIntoCell(page, 0, 'email', 'kp-new-u@example.com')
                await saveAndWaitModal(page)
                await assertModalMsg(page, 'userSaveUsersSuccess')
                await dismissResultModal(page)
                //資料通道之推播晚於成功訊息, 且對話框以「開啟當下」之 store 列出各列: 先等新列進入前端 store, 否則高負載下對話框列不到新列(run04 全套 AF-013b 曾因此失敗; 此為同步點, 不是被測行為)
                await waitUntilExist(page, '新使用者已同步進前端 store', (nm) => (window.$vo.$store.state.users || []).some((x) => x.name === nm), { timeout: 20000, arg: 'kp-new-u' })
                const dbCgrups = await readDbField('users', (await findIdByName('users', 'kp-new-u')), 'cgrups')
                assert.strict.equal(dbCgrups, '', `前提: 新增使用者之 cgrups 預設為空字串(funNew), 實得 ${JSON.stringify(dbCgrups)}`)
                await gotoGrups(page)
                const k = await rowIndexByName(page, 'arr-g')
                await openColDialog(page, k, 'belongUsers', 'grupBlngEditUsers') //修前: 此處等不到對話框標題而逾時
                const rows = await readDlgRows(page, 'name')
                assert.strict.equal(rows['kp-new-u']?.enable, false, `新使用者應列出且未歸屬 arr-g, 實得 ${JSON.stringify(rows['kp-new-u'])}`)
                assert.strict.equal(rows['arr-u']?.enable, true, 'arr-u 仍歸屬 arr-g(陣列形式照常顯示)')
                await clickDialogClose(page)
                await waitDialogClosed(page, 'grupBlngEditUsers')
            })
        }
        finally {
            await restoreTables(snap0)
        }
    })

    it('AF-013b-new-grup-then-belong-grups: 群組頁新增群組並儲存後, 權限頁「所屬群組」對話框仍能開啟, 且列出新群組(未含 arr-p)、arr-g 仍含 arr-p(修前對話框打不開)', async function() {
        try {
            await withPage(async (page) => {
                await gotoGrups(page)
                await clickAdd(page)
                await typeIntoCell(page, 0, 'name', 'kp-new-g')
                await saveAndWaitModal(page)
                await assertModalMsg(page, 'grupSaveGrupsSuccess')
                await dismissResultModal(page)
                //同 AF-013a: 先等新列進入前端 store 再開對話框(資料通道之推播晚於成功訊息; 此為同步點, 不是被測行為)
                await waitUntilExist(page, '新群組已同步進前端 store', (nm) => (window.$vo.$store.state.grups || []).some((x) => x.name === nm), { timeout: 20000, arg: 'kp-new-g' })
                const dbCpemis = await readDbField('grups', (await findIdByName('grups', 'kp-new-g')), 'cpemis')
                assert.strict.equal(dbCpemis, '', `前提: 新增群組之 cpemis 預設為空字串(funNew), 實得 ${JSON.stringify(dbCpemis)}`)
                await gotoPemis(page)
                const k = await rowIndexByName(page, 'arr-p')
                await openColDialog(page, k, 'belongGrups', 'pemiBlngEditGrups') //修前: 此處等不到對話框標題而逾時
                const rows = await readDlgRows(page, 'name')
                assert.strict.equal(rows['kp-new-g']?.enable, false, `新群組應列出且未含 arr-p, 實得 ${JSON.stringify(rows['kp-new-g'])}`)
                assert.strict.equal(rows['arr-g']?.enable, true, 'arr-g 仍含 arr-p(陣列形式照常顯示)')
                await clickDialogClose(page)
                await waitDialogClosed(page, 'pemiBlngEditGrups')
            })
        }
        finally {
            await restoreTables(snap0)
        }
    })

    it('AF-013c-garbage-cgrups-row: 另一端寫入 cgrups 為壞 JSON 的使用者列(同步端點)後, 「所屬使用者」對話框仍能開啟, 該列視為未歸屬; 在對話框內只切換其他列並儲存, 壞 JSON 列之字串逐字不動', async function() {
        const GARBAGE = '{oops'
        await syncRows('users', [{ id: 'id-kp-bad-u', order: 120, name: 'kp-bad-u', email: 'kp-bad-u@example.com', isAdmin: 'n', isActive: 'y', cgrups: GARBAGE }], 'appArrFormBad')
        try {
            await withPage(async (page) => {
                await gotoGrups(page)
                const k = await rowIndexByName(page, 'arr-g')
                await openColDialog(page, k, 'belongUsers', 'grupBlngEditUsers')
                const rows = await readDlgRows(page, 'name')
                assert.strict.equal(rows['kp-bad-u']?.enable, false, `壞 JSON 列應列出且視為未歸屬, 實得 ${JSON.stringify(rows['kp-bad-u'])}`)
                await toggleDialogEnable(page, rows['peter'].idx) //peter 改為歸屬 arr-g(使儲存內容有實質變更)
                await saveBelongAndWaitModal(page)
                await assertModalMsg(page, 'userSaveUsersSuccess')
                await dismissResultModal(page)
                assert.strict.equal(await readDbField('users', 'id-kp-bad-u', 'cgrups'), GARBAGE, '壞 JSON 列之 cgrups 逐字不動(本對話框所管歸屬未變)')
                assertEnabled(await readDbField('users', 'id-for-peter', 'cgrups'), 'arr-g', 'peter.cgrups', { objectForm: false })
            })
        }
        finally {
            await restoreTables(snap0)
        }
    })

    // ===== run03 F-24(R-REL-PAIR-01): 反向關聯對話框以列身分(id／name)配對存檔快照, 不以開框時的列索引 =====
    //修前: 開框時 store 為 [..a,b..]; 另一端把 order 重排(或增刪列)後, 對話框內切換一列並儲存, 存檔快照 vo.users 的索引與對話框的列索引錯位,
    //get(users, kr) 取到另一個使用者 → 關聯寫到錯的使用者(授權由 {a:[],b:[T]} 變 {b:[],a:[T]} 一類)。revRows 的 rows[ku] ↔ users[ku] 同型。
    //本案: 開「所屬使用者」對話框 → 另一端(資料通道)把 users 整表反序 → 等 store 更新 → 切換 peter 為歸屬 arr-g → 儲存 → 庫內僅 peter 的有效歸屬多了 arr-g, 其餘使用者之有效歸屬不變(以授權等價 effectiveSet 比對)。

    it('AF-014a-reorder-while-open-users: 「所屬使用者」對話框開啟期間 users 被另一端反序, 切換 peter 並儲存 → 只有 peter 多歸屬 arr-g, 其他使用者之有效歸屬不變(修前寫到錯位的使用者)', async function() {
        try {
            await withPage(async (page) => {
                await gotoGrups(page)
                const k = await rowIndexByName(page, 'arr-g')
                await openColDialog(page, k, 'belongUsers', 'grupBlngEditUsers')
                const rows = await readDlgRows(page, 'name')
                assert.strict.equal(rows['peter']?.enable, false, '前提: peter 尚未歸屬 arr-g')
                //另一端重排: 把現有 users 反序後整表寫回(updateXxx 以陣列位置重給 order)
                const cur = (await readTables()).users
                const reversed = cur.slice().reverse()
                const resp = await callRpc('updateUsers', [reversed], TOKEN_ADMIN)
                assert.ok(resp.ok, `另一端重排 updateUsers 應成功, 實得 ${JSON.stringify(resp)}`)
                const expectIds = reversed.map((v) => v.id).join(',')
                await waitUntilExist(page, 'store 內 users 已依新 order 重排', (ids) => {
                    const us = (window.$vo.$store.state.users || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0))
                    return us.map((v) => v.id).join(',') === ids
                }, { timeout: 30000, arg: expectIds })
                const before = (await readTables()).users
                const tBefore = await resolvedTargetsOf(page, before.map((v) => v.id))
                await toggleDialogEnable(page, rows['peter'].idx)
                await saveBelongAndWaitModal(page)
                await assertModalMsg(page, 'userSaveUsersSuccess')
                await dismissResultModal(page)
                const after = (await readTables()).users
                const tAfter = await resolvedTargetsOf(page, after.map((v) => v.id))
                assert.strict.equal(after.length, before.length, '使用者筆數不變')
                for (const u of after) {
                    const b = before.find((v) => v.id === u.id)
                    assert.ok(b, `存檔後不應多出使用者 ${u.id}`)
                    if (u.id === 'id-for-peter') {
                        assertEnabled(u.cgrups, 'arr-g', 'peter.cgrups', { objectForm: false })
                        assert.deepStrictEqual(effectiveList(u.cgrups), [...effectiveList(b.cgrups), 'arr-g:OR'].sort(), 'peter 只多了 arr-g(OR), 其餘有效歸屬不變')
                    }
                    else {
                        assert.deepStrictEqual(effectiveList(u.cgrups), effectiveList(b.cgrups), `${u.name} 之有效歸屬須不變(修前被寫到錯位的使用者)`)
                        assert.deepStrictEqual(tAfter[u.id], tBefore[u.id], `${u.name} 端到端授權結果(getPermUserInfor)須不變(修前被寫到錯位的使用者)`)
                    }
                }
            })
        }
        finally {
            await restoreTables(snap0)
        }
    })

    it('AF-014b-reorder-while-open-grups: 「所屬群組」對話框開啟期間 grups 被另一端反序, 切換 M1 並儲存 → 只有 M1 的 cpemis 多了 arr-p, 其他群組之有效權限不變', async function() {
        try {
            await withPage(async (page) => {
                await gotoPemis(page)
                const k = await rowIndexByName(page, 'arr-p')
                await openColDialog(page, k, 'belongGrups', 'pemiBlngEditGrups')
                const rows = await readDlgRows(page, 'name')
                assert.strict.equal(rows['權限群組M1']?.enable, false, '前提: M1 不含 arr-p')
                const cur = (await readTables()).grups
                const reversed = cur.slice().reverse()
                const resp = await callRpc('updateGrups', [reversed], TOKEN_ADMIN)
                assert.ok(resp.ok, `另一端重排 updateGrups 應成功, 實得 ${JSON.stringify(resp)}`)
                const expectIds = reversed.map((v) => v.id).join(',')
                await waitUntilExist(page, 'store 內 grups 已依新 order 重排', (ids) => {
                    const gs = (window.$vo.$store.state.grups || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0))
                    return gs.map((v) => v.id).join(',') === ids
                }, { timeout: 30000, arg: expectIds })
                const before = (await readTables()).grups
                await toggleDialogEnable(page, rows['權限群組M1'].idx)
                await saveBelongAndWaitModal(page)
                await assertModalMsg(page, 'grupSaveGrupsSuccess')
                await dismissResultModal(page)
                const after = (await readTables()).grups
                assert.strict.equal(after.length, before.length, '群組筆數不變')
                for (const g of after) {
                    const b = before.find((v) => v.id === g.id)
                    assert.ok(b, `存檔後不應多出群組 ${g.id}`)
                    if (g.name === '權限群組M1') {
                        assertEnabled(g.cpemis, 'arr-p', 'M1.cpemis', { objectForm: false })
                        assert.deepStrictEqual(effectiveList(g.cpemis), [...effectiveList(b.cpemis), 'arr-p:OR'].sort(), 'M1 只多了 arr-p(OR), 其餘有效權限不變')
                    }
                    else {
                        assert.deepStrictEqual(effectiveList(g.cpemis), effectiveList(b.cpemis), `${g.name} 之有效權限須不變(修前被寫到錯位的群組)`)
                    }
                }
            })
        }
        finally {
            await restoreTables(snap0)
        }
    })

    it('AF-014c-row-deleted-while-open: 對話框開啟期間 peter 被另一端刪除, 切換 peter 並儲存 → 整次拒存(relationRowsStale), 沒有任何使用者被改寫', async function() {
        try {
            await withPage(async (page) => {
                await gotoGrups(page)
                const k = await rowIndexByName(page, 'arr-g')
                await openColDialog(page, k, 'belongUsers', 'grupBlngEditUsers')
                const rows = await readDlgRows(page, 'name')
                const cur = (await readTables()).users
                const without = cur.filter((v) => v.id !== 'id-for-peter')
                const resp = await callRpc('updateUsers', [without], TOKEN_ADMIN)
                assert.ok(resp.ok, `另一端刪除 peter 應成功, 實得 ${JSON.stringify(resp)}`)
                await waitUntilExist(page, 'store 內已無 peter', () => !(window.$vo.$store.state.users || []).some((v) => v.id === 'id-for-peter'), { timeout: 30000 })
                const before = (await readTables()).users
                await toggleDialogEnable(page, rows['peter'].idx)
                await clickDialogSave(page)
                await waitUntilExist(page, '結果 modal 出現', () => (document.body.innerText || '').includes(window.$vo.$t('systemMessage')), { timeout: 20000 })
                await page.waitForTimeout(500)
                const txt = await page.evaluate(() => document.body.innerText)
                const stale = await page.evaluate(() => window.$vo.$t('relationRowsStale'))
                const parts = stale.split('{names}')
                assert.ok(parts.length === 2 && parts.every((p) => txt.includes(p)), `應顯示 relationRowsStale 訊息(範本: ${stale}), 實得頁面文字片段: ${txt.slice(0, 300)}`)
                assert.ok(txt.includes(`${parts[0]}peter${parts[1]}`), '訊息應點名受影響的使用者 peter')
                const after = (await readTables()).users
                assert.deepStrictEqual(after.map((v) => [v.id, v.cgrups]), before.map((v) => [v.id, v.cgrups]), '拒存時任何使用者之 cgrups 皆不得被改寫')
            })
        }
        finally {
            await restoreTables(snap0)
        }
    })

    //第二輪外審 minimax2 R1／R2: 「所屬使用者」對話框三顆批次按鈕(全選／全取消／反選)以使用者 id 定位列; 修前(以 name)同名使用者時改到另一位, 第一版以 id 但取資料來源為 getDisplayData(不含 id)而三顆按鈕完全失效——
    //此二者靜態不變式都抓不到, 須真瀏覽器點按鈕. 夾具: 另一個 from 分區同步寫入兩位同名使用者(dup-same, 不同 id／email).
    it('AF-015-bulk-toggle-buttons-by-id: 「所屬使用者」對話框之全選／全取消／反選對全部列生效, 含兩位同名使用者(以 id 定位, 不以 name)', async function() {
        await syncRows('users', [
            { id: 'id-dup-1', order: 130, name: 'dup-same', email: 'dup1@example.com', isAdmin: 'n', isActive: 'y', cgrups: '{}' },
            { id: 'id-dup-2', order: 131, name: 'dup-same', email: 'dup2@example.com', isAdmin: 'n', isActive: 'y', cgrups: '{}' },
        ], 'appArrFormDup')
        const BTN_ALL_YES = 'M22,16A2,2 0 0,1 20,18H8C6.89,18 6,17.1 6,16V4C6,2.89 6.89,2 8,2H20A2,2 0 0,1 22,4V16M16,20V22H4A2,2 0 0,1 2,20V7H4V20H16M13,14L20,7L18.59,5.59L13,11.17L9.91,8.09L8.5,9.5L13,14Z' //mdiCheckboxMultipleMarked(@mdi/js 7.4.47)
        const BTN_ALL_NO = 'M20,16V4H8V16H20M22,16A2,2 0 0,1 20,18H8C6.89,18 6,17.1 6,16V4C6,2.89 6.89,2 8,2H20A2,2 0 0,1 22,4V16M16,20V22H4A2,2 0 0,1 2,20V7H4V20H16Z' //mdiCheckboxMultipleBlankOutline
        const BTN_INV = 'M6.59,3.41L2,8L6.59,12.6L8,11.18L4.82,8L8,4.82L6.59,3.41M12.41,3.41L11,4.82L14.18,8L11,11.18L12.41,12.6L17,8L12.41,3.41M21.59,11.59L13.5,19.68L9.83,16L8.42,17.41L13.5,22.5L23,13L21.59,11.59Z' //mdiCodeTagsCheck
        try {
            await withPage(async (page) => {
                await gotoGrups(page)
                const k = await rowIndexByName(page, 'arr-g')
                await openColDialog(page, k, 'belongUsers', 'grupBlngEditUsers')
                //對話框內全部列(依列序; 同名者不被 readDlgRows 之 name 鍵覆蓋)
                const list = async () => await page.evaluate((sd) => [...document.querySelectorAll(`${sd} .ag-row[row-index]`)].map((r) => ({
                    name: ((r.querySelector('.ag-cell[col-id="name"]') || {}).textContent || '').trim(),
                    idx: Number(r.getAttribute('row-index')),
                    enable: !!(r.querySelector('.ag-cell[col-id="enable"] input[type="checkbox"]') || {}).checked,
                })).sort((a, b) => a.idx - b.idx), SEL_MODAL)
                const click = async (path) => {
                    await page.locator(`${SEL_MODAL} div[role="button"]:has(svg path[d="${path}"])`).first().click()
                    await page.waitForTimeout(800)
                }
                const before = await list()
                assert.ok(before.filter((v) => v.name === 'dup-same').length === 2, `前提: 對話框應有兩列同名使用者 dup-same, 實得 ${JSON.stringify(before.map((v) => v.name))}`)
                assert.ok(before.length >= 6 && before.every((v) => v.enable === false || v.name === 'arr-u' || v.name === 'arr-u2'), '前提: 除 arr-u／arr-u2 外皆未歸屬')
                await click(BTN_ALL_YES)
                const allYes = await list()
                assert.ok(allYes.every((v) => v.enable), `全選後每一列(含兩位 dup-same)皆應勾選, 實得 ${JSON.stringify(allYes)}`)
                await click(BTN_ALL_NO)
                const allNo = await list()
                assert.ok(allNo.every((v) => !v.enable), `全取消後每一列皆應未勾選, 實得 ${JSON.stringify(allNo)}`)
                await toggleDialogEnable(page, before.find((v) => v.name === 'dup-same').idx) //只勾第一位 dup-same
                await click(BTN_INV)
                const inv = await list()
                const dups = inv.filter((v) => v.name === 'dup-same')
                assert.deepStrictEqual(dups.map((v) => v.enable), [false, true], `反選後兩位 dup-same 應為 [false, true](以 id 定位; 以 name 定位時兩者會互相覆蓋), 實得 ${JSON.stringify(dups)}`)
                assert.ok(inv.filter((v) => v.name !== 'dup-same').every((v) => v.enable), '反選後其餘各列(原皆未勾選)皆應勾選')
            })
        }
        finally {
            await restoreTables(snap0)
        }
    })

    //外審 sol R4: 配不到之列夾在中間時, revRows 之索引還原(krs)須正確——孤兒列之後的列, 其標籤顯示不得錯位到別列(靜態不變式抓不到 `let kr = k` 之類的接線錯誤)
    it('AF-014d-deleted-row-in-the-middle-display: 對話框開啟期間第 1 列之使用者被另一端刪除, 切換其後第 2 列之使用者 → 第 2 列自己的標籤列更新、已被刪除之第 1 列之顯示不變(不得錯位)', async function() {
        try {
            await withPage(async (page) => {
                await gotoGrups(page)
                const k = await rowIndexByName(page, 'arr-g')
                await openColDialog(page, k, 'belongUsers', 'grupBlngEditUsers')
                const rows = await readDlgRows(page, 'name')
                const byIdx = Object.entries(rows).sort((a, b) => a[1].idx - b[1].idx)
                const [victimName, victim] = byIdx[0]
                const [targetName, target] = byIdx[1]
                assert.ok(victim.enable === false && target.enable === false, `前提: 第 1、2 列(${victimName}、${targetName})皆未歸屬 arr-g`)
                const cur = (await readTables()).users
                const victimId = cur.find((v) => v.name === victimName)?.id
                assert.ok(victimId, `庫內應有 ${victimName}`)
                const resp = await callRpc('updateUsers', [cur.filter((v) => v.id !== victimId)], TOKEN_ADMIN)
                assert.ok(resp.ok, `另一端刪除 ${victimName} 應成功, 實得 ${JSON.stringify(resp)}`)
                await waitUntilExist(page, `store 內已無 ${victimName}`, (id) => !(window.$vo.$store.state.users || []).some((v) => v.id === id), { timeout: 30000, arg: victimId })
                await toggleDialogEnable(page, target.idx)
                const after = await readDlgRows(page, 'name')
                assert.strict.equal(after[targetName].enable, true, `${targetName} 應已勾選`)
                assert.notStrictEqual(after[targetName].text, target.text, `${targetName} 之標籤列應更新(多了本群組之標籤)`)
                assert.strict.equal(after[victimName].text, victim.text, `已被刪除之 ${victimName} 列之顯示不得被改動(修前/索引錯位時會顯示成 ${targetName} 的標籤列)`)
            })
        }
        finally {
            await restoreTables(snap0)
        }
    })

    //外審 sol R1: 三個清單頁開直接編輯器(VeCgrups／VeCpemis／VeCrules)後, .then 以開框時之列索引回填; 對話框開啟期間 store 更新會重建 opt.rows, 索引錯位 → 回填到另一個使用者
    it('AF-014e-parent-page-fill-by-id: 使用者頁開 arr-u 之「cgrups」對話框後, 另一端把 users 整表反序, 於對話框勾選 M1 並儲存、再存使用者頁 → 只有 arr-u 多了 M1, 其他使用者之有效歸屬(含順序)不變(修前回填到錯位的使用者)', async function() {
        try {
            await withPage(async (page) => {
                await gotoUsers(page)
                const k = await rowIndexByName(page, 'arr-u')
                await openColDialog(page, k, 'cgrups', 'userEditCgrups')
                const rows = await readDlgRows(page, 'name')
                assert.strict.equal(rows['權限群組M1']?.enable, false, '前提: arr-u 之 M1 為停用')
                const cur = (await readTables()).users
                const reversed = cur.slice().reverse()
                const resp = await callRpc('updateUsers', [reversed], TOKEN_ADMIN)
                assert.ok(resp.ok, `另一端重排 updateUsers 應成功, 實得 ${JSON.stringify(resp)}`)
                const expectIds = reversed.map((v) => v.id).join(',')
                await waitUntilExist(page, 'store 內 users 已依新 order 重排', (ids) => {
                    const us = (window.$vo.$store.state.users || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0))
                    return us.map((v) => v.id).join(',') === ids
                }, { timeout: 30000, arg: expectIds })
                const before = (await readTables()).users
                await toggleDialogEnable(page, rows['權限群組M1'].idx)
                await clickDialogSave(page)
                await waitDialogClosed(page, 'userEditCgrups')
                await saveAndWaitModal(page)
                await assertModalMsg(page, 'userSaveUsersSuccess')
                await dismissResultModal(page)
                const after = (await readTables()).users
                assert.strict.equal(after.length, before.length, '使用者筆數不變')
                for (const u of after) {
                    const b = before.find((v) => v.id === u.id)
                    assert.ok(b, `存檔後不應多出使用者 ${u.id}`)
                    if (u.id === U_ID) {
                        assert.deepStrictEqual(effectiveList(u.cgrups), [...effectiveList(b.cgrups), '權限群組M1:OR'].sort(), 'arr-u 只多了 M1(OR)')
                    }
                    else {
                        assert.deepStrictEqual(effectiveList(u.cgrups), effectiveList(b.cgrups), `${u.name} 之有效歸屬須不變(修前回填到錯位的使用者)`)
                    }
                }
            })
        }
        finally {
            await restoreTables(snap0)
        }
    })

    // ===== R3(複審; run04 簡化): 對話框序 ≠ 資料序之兩個 AND 項, 存檔後授權不變 =====
    //夾具: ord-p1 規則 {T_ON1,T_ON2}、ord-p2 規則 {T_ON2}; ord-u 的 cgrups 為陣列 [ord-g1 AND 停用, ord-g2 AND, ord-g1 AND, M3 停用], 有效 AND 項 ord-g2 {T_ON2} ∩ ord-g1 {T_ON1,T_ON2} → 授權 {T_ON2}.
    //run02 時(R-AUTH-ORDER-01)授權取決於「第一個 AND 項」, 編輯器須保留原鍵序(keepKeyOrder)並斷言鍵序; R-AUTH-MERGE-00 起授權與順序無關, 鍵序斷言與 keepKeyOrder 一併移除, 此處只保留端到端不變式「存檔後授權不變」.
    //ord-g3 的 cpemis 為陣列 [ord-p1 AND 停用, ord-p2 AND, ord-p1 AND, P3 停用](權限層同構); ord-u3 以 OR 引用 ord-g3.
    const ORD_BEFORE = [T_ON2]

    it('AF-010a-VeCgrups-resave: 兩個 AND 群組、對話框序 ≠ 資料序: 切開再切回無關列後存檔 → 授權不變(鍵序無關, R-AUTH-MERGE-00 第 4 條)', async function() {
        await withPage(async (page) => {
            assert.deepEqual(await getResolvedActiveTargets(page, 'id-ord-u'), ORD_BEFORE, '對照組: 兩個有效 AND 群組 ord-g2 {T_ON2} ∩ ord-g1 {T_ON1,T_ON2} → 僅 T_ON2')
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
            assert.deepEqual(await getResolvedActiveTargets(page, 'id-ord-u'), ORD_BEFORE, '存檔後授權須不變')
        })
    })

    it('AF-010b-VeCpemis-resave: 兩個 AND 權限、對話框序 ≠ 資料序: 存檔後授權不變', async function() {
        await withPage(async (page) => {
            assert.deepEqual(await getResolvedActiveTargets(page, 'id-ord-u3'), ORD_BEFORE, '對照組: 群組 ord-g3 之兩個有效 AND 權限 ord-p2 {T_ON2} ∩ ord-p1 {T_ON1,T_ON2} → 僅 T_ON2')
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
        })
    })

    it('AF-010c-VeGrupBlngUsers-resave: 在 ord-g2 的「所屬使用者」把 ord-u 切開再切回(重新加入會移到尾端)並存檔 → 授權不變', async function() {
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
            assert.deepEqual(await getResolvedActiveTargets(page, 'id-ord-u'), ORD_BEFORE, '存檔後授權須不變(ord-g2 被移到尾端不影響授權)')
        })
    })

    it('AF-010d-VePemiBlngGrups-resave: 在 ord-p2 的「所屬群組」把 ord-g3 切開再切回並存檔 → 授權不變', async function() {
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
        })
    })

    //原 AF-010e(VeCrules 存檔保留 crules 鍵序)隨 keepKeyOrder 移除(2026-10-21, ADR-033): crules 的鍵序從來不影響授權, 其保序只是「統一套用」; 兩態重存之授權不變由 AF-016 取代

    // ===== run04(R-AUTH-MERGE-00 第 1 條「未給＝n」; 規格 §編輯器): VeCrules 兩態(勾／不勾), 不做三態 =====
    //夾具(見檔首 rs-*): rs-g = rs-po(OR {T_ON1,T_ON2}) + rs-pa(AND, 只列 T_ON2); rs-g2 = rs-po2(OR, 只列 T_ON1) + rs-pa(AND).
    it('AF-016a-VeCrules-resave-sparse: 重存稀疏 AND 權限 rs-pa(對話框把未列之管理對象寫成顯式 n, 筆數由 1 變為全部管理對象) → rs-u 之授權不變(新規則下「未列」＝ n, 重存不再靜默撤權; 舊規則: 重存前 {T_ON1,T_ON2}、重存後 {T_ON2})', async function() {
        await withPage(async (page) => {
            assert.deepEqual(await getResolvedActiveTargets(page, 'id-rs-u'), [T_ON2], '前提: OR {T_ON1,T_ON2} ∩ AND {T_ON2}(rs-pa 未列 T_ON1 ＝ n) = {T_ON2}')
            await gotoPemis(page)
            const k = await rowIndexByName(page, 'rs-pa')
            await openColDialog(page, k, 'crules', 'pemiEditCrules')
            const rows = await readDlgRows(page, 'id')
            assert.strict.equal(rows[T_ON2]?.enable, true, 'rs-pa 勾選 T_ON2')
            assert.strict.equal(rows[T_ON1]?.enable, false, 'rs-pa 未列之 T_ON1 顯示為不勾(兩態: 未列＝不勾)')
            const other = Object.entries(rows).find(([n]) => ![T_ON1, T_ON2].includes(n))
            await touchUnrelatedRow(page, other[1].idx) //切開再切回: 淨內容不變而讓儲存鈕現身
            await clickDialogSave(page)
            await waitDialogClosed(page, 'pemiEditCrules')
            await saveAndWaitModal(page)
            await assertModalMsg(page, 'pemiSavePemisSuccess')
            const saved = JSON.parse(await readDbField('pemis', 'id-rs-pa', 'crules'))
            assert.strict.equal(saved[T_ON2], 'y', '勾選者存為 y')
            assert.strict.equal(saved[T_ON1], 'n', '未列者重存為顯式 n(兩態)')
            //重存後 crules 列出全部現存管理對象(外審 sol R3: 只驗 > 1 個鍵會放行「漏存第三個以後的管理對象」之缺陷——該缺鍵在新規則下不改授權, 授權前後相等抓不到)
            const tgIds = ((await callRpc('targets.select', [], TOKEN_ADMIN)).output || []).map((v) => v.id).sort()
            assert.ok(tgIds.length > 2, `前提: 現存管理對象多於 2 個(實得 ${tgIds.length})`)
            assert.deepEqual(Object.keys(saved).sort(), tgIds, '重存後 crules 之鍵須等於全部現存管理對象')
            assert.deepEqual(await getResolvedActiveTargets(page, 'id-rs-u'), [T_ON2], '重存後授權不變(顯式 n ≡ 未列)')
        })
    })

    it('AF-016b-VeCrules-uncheck-equals-unlisted: 取消勾選 rs-po 之 T_ON2(存為顯式 n) → rs-u 與 rs-u2 之授權相同且皆為空(rs-po2 本就未列 T_ON2): 顯式 n ≡ 未列', async function() {
        await withPage(async (page) => {
            assert.deepEqual(await getResolvedActiveTargets(page, 'id-rs-u'), [T_ON2], '前提 rs-u')
            assert.deepEqual(await getResolvedActiveTargets(page, 'id-rs-u2'), [], '前提 rs-u2: OR {T_ON1} ∩ AND {T_ON2} = ∅')
            await gotoPemis(page)
            const k = await rowIndexByName(page, 'rs-po')
            await openColDialog(page, k, 'crules', 'pemiEditCrules')
            const rows = await readDlgRows(page, 'id')
            assert.strict.equal(rows[T_ON2]?.enable, true, 'rs-po 勾選 T_ON2')
            await toggleDialogEnable(page, rows[T_ON2].idx) //取消勾選
            await clickDialogSave(page)
            await waitDialogClosed(page, 'pemiEditCrules')
            await saveAndWaitModal(page)
            await assertModalMsg(page, 'pemiSavePemisSuccess')
            const saved = JSON.parse(await readDbField('pemis', 'id-rs-po', 'crules'))
            assert.strict.equal(saved[T_ON2], 'n', '取消勾選存為顯式 n')
            assert.strict.equal(saved[T_ON1], 'y', '其餘勾選不變')
            const a = await getResolvedActiveTargets(page, 'id-rs-u')
            const b = await getResolvedActiveTargets(page, 'id-rs-u2')
            assert.deepEqual(a, [], 'rs-u: OR {T_ON1} ∩ AND {T_ON2} = ∅')
            assert.deepEqual(a, b, '顯式 n(rs-po)與未列(rs-po2)的授權相同')
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


    // ===== 整數式名稱(原:欲寫出之鍵序被 JS 屬性序改變而拒存, 外審 minimax#2; run04 起不再拒存) =====
    //int-u 的 cgrups 為 { ord-g1: AND }(單一 AND 項). 在 VeCgrups 新啟用整數式名稱之群組 '1' 且為 AND 時, JS 物件屬性序把 '1' 排在既有 ord-g1 前面;
    //run02 時伺服端以「第一個 AND 項」為基底而使授權取決於鍵序, 編輯器須拒存. R-AUTH-MERGE-00 起 AND 為所有項之交集、與順序無關, 故照常存檔, 授權 = ord-g1 {T_ON1,T_ON2} ∩ '1' {T_ON2} = {T_ON2}.
    it('AF-012a-VeCgrups-int-name: 新啟用整數式名稱之 AND 群組 → 照常存檔(不再拒存、無固定訊息); 授權為兩個 AND 項之交集 [T_ON2]; 改為 OR 後授權亦為 [T_ON2]', async function() {
        await withPage(async (page) => {
            assert.deepEqual(await getResolvedActiveTargets(page, 'id-int-u'), [T_ON1, T_ON2].sort(), '前提: 僅 ord-g1(AND) = {T_ON1,T_ON2}')
            await gotoUsers(page)
            const k = await rowIndexByName(page, 'int-u')
            await openColDialog(page, k, 'cgrups', 'userEditCgrups')
            const rows = await readDlgRows(page, 'name')
            const idx = rows['1'].idx
            await toggleDialogEnable(page, idx)
            await setDialogMode(page, idx, 'AND')
            await clickDialogSave(page)
            await waitDialogClosed(page, 'userEditCgrups')
            await saveAndWaitModal(page)
            await assertModalMsg(page, 'userSaveUsersSuccess')
            const o = JSON.parse(await readDbField('users', 'id-int-u', 'cgrups'))
            assert.strict.equal(o['1']?.mode, 'AND')
            assert.strict.equal(o['ord-g1']?.mode, 'AND')
            assert.deepEqual(await getResolvedActiveTargets(page, 'id-int-u'), [T_ON2], "AND ∩ AND: ord-g1 {T_ON1,T_ON2} ∩ '1' {T_ON2} = {T_ON2}(與兩者之鍵序無關)")
            //再改為 OR: OR 聯集 '1' {T_ON2} ∩ AND ord-g1 {T_ON1,T_ON2} = {T_ON2}
            await dismissResultModal(page)
            await openColDialog(page, k, 'cgrups', 'userEditCgrups')
            const rows2 = await readDlgRows(page, 'name')
            await setDialogMode(page, rows2['1'].idx, 'OR')
            await clickDialogSave(page)
            await waitDialogClosed(page, 'userEditCgrups')
            await saveAndWaitModal(page)
            await assertModalMsg(page, 'userSaveUsersSuccess')
            const o2 = JSON.parse(await readDbField('users', 'id-int-u', 'cgrups'))
            assert.strict.equal(o2['1']?.mode, 'OR')
            assert.strict.equal(o2['ord-g1']?.mode, 'AND')
            assert.deepEqual(await getResolvedActiveTargets(page, 'id-int-u'), [T_ON2], 'OR 聯集 {T_ON2} ∩ AND {T_ON1,T_ON2} = {T_ON2}')
        })
    })

})


// =====================================================================================================================
// run05: 授權資料衝突之收嚴與提示(R-PRINCIPLE-00 a～h、R-AUTH-MERGE-00 第 5 條修訂; ADR-035; 2026-10-21)——各 spec 本輪新增案例之語意斷言
// 不產標準圖(spec 各案之視覺項待授權產製); 每案 fresh browser; 資料前置以外部同步端點推入本段專屬分區(from=appRun05; 非使用者操作),
// 案後以 restoreTables 還原三表並回驗 base seed 筆數. tooltip 文字有語系差異者各語系各跑一次; 期望文字以頁面 $t 取範本代入(不寫死整句).
// 本段不套上一段之 beforeEach 陣列形式夾具(各案自備前置), 故清單與對話框之列只有 base seed 與本案推入者.
// =====================================================================================================================

const F5 = 'appRun05'
const LANGS = ['eng', 'cht']
const BASE_USERS = ['peter', 'mary', 'john', 'admin']
const BASE_GRUPS = ['權限群組M1', '權限群組M2', '權限群組M3', '權限群組M4']
const BASE_PEMIS = ['權限P1', '權限P2', '權限P3', '權限P4']
const T_A = '專案A/頁A/區塊A'
const T_C = '專案A/頁C'
const PETER_TREE = ['專案A/頁A/區塊A', '專案A/頁C', '專案B/頁A/區塊A', '專案B/頁A/區塊B'] //M1 = P1 ∪ P2(種子; 數字隨種子變動)
const M1_AND_M2 = ['專案A/頁C', '專案B/頁A/區塊A', '專案B/頁A/區塊B'] //M1 ∩ M2
const JOHN_TREE = ['專案A/頁C', '專案B/頁A/區塊B'] //M3 = P2(OR) ∩ P3(AND)
const ON5 = (mode) => ({ mode, isActive: 'y' })
const mkU = (id, name, cgrups, extra = {}) => ({ id, order: 200, name, email: `${name}@example.com`, isAdmin: 'n', isActive: 'y', cgrups: typeof cgrups === 'string' ? cgrups : JSON.stringify(cgrups), ...extra })
//夾具(各案所需者見案例; 名稱與內容依各 spec 之「測試資料」)
const DANG_U = mkU('id-dang-u', 'dang-u', { '權限群組M1': ON5('OR'), '權限群組MX': ON5('AND') }) //權限群組MX 不存在於 grups
const MODE_U = mkU('id-mode-u', 'mode-u', { '權限群組M1': ON5('OR'), '權限群組M2': { isActive: 'y' } }) //M2 無 mode
const BOTH_U = mkU('id-both-u', 'both-u', [{ name: '權限群組M1', mode: 'OR', isActive: 'y' }, { name: '權限群組M1', mode: 'AND', isActive: 'y' }])
const NONAME_U = mkU('id-noname-u', 'noname-u', [{ name: '權限群組M1', mode: 'OR', isActive: 'y' }, { mode: 'AND', isActive: 'y' }]) //第 2 個元素無 name
const AND_U = mkU('id-and-u', 'and-u', { '權限群組M1': ON5('OR'), '權限群組M2': ON5('AND') })
const DANG_G = { id: 'id-dang-g', order: 200, name: 'dang-g', cpemis: JSON.stringify({ '權限P1': ON5('OR'), '權限PX': ON5('AND') }) } //權限PX 不存在於 pemis
const DANG_GU = mkU('id-dang-gu', 'dang-gu', { 'dang-g': ON5('OR') })
const DUP_P = { id: 'id-dup-p', order: 200, name: 'dup-p', crules: JSON.stringify([{ name: T_A, isActive: 'y' }, { name: T_A, isActive: 'n' }, { name: T_C, isActive: 'y' }]) }
const SAME_P = { id: 'id-same-p', order: 201, name: 'same-p', crules: JSON.stringify([{ name: T_C, isActive: 'y' }, { name: T_C, isActive: 'y' }]) } //重複列全為勾選: 不算衝突
const DUP_PG = { id: 'id-dup-pg', order: 200, name: 'dup-pg', cpemis: JSON.stringify({ 'dup-p': ON5('OR') }) }
const DUP_PU = mkU('id-dup-pu', 'dup-pu', { 'dup-pg': ON5('OR') })

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
//清單儲存格之摘要文字期望值(同 LayoutContentUsers.getCgrupsText 等: 範本之 {n}、{nms} 以 String.replace 代入)
async function expSummary(page, key, n, nms = '') {
    return await page.evaluate(([k, nn, s]) => String(window.$vo.$t(k)).replace('{n}', nn).replace('{nms}', s), [key, n, nms])
}
//主表中名稱為 name 之全部列 row-index(同名多列; 依 row-index 排序, 去除 pinned／center 兩容器之重複)
async function rowIndexesByName(page, name) {
    return await page.evaluate((n) => {
        const out = new Set()
        for (const r of document.querySelectorAll('.ag-row[row-index]')) {
            const c = r.querySelector('.ag-cell[col-id="name"]')
            if (c && (c.textContent || '').trim() === n) out.add(Number(r.getAttribute('row-index')))
        }
        return [...out].sort((a, b) => a - b)
    }, name)
}
//對話框內全部列(依列序; 同名列各自一筆): [{ name, idx, enable, text }]
async function dlgList(page, nameCol = 'name') {
    return await page.evaluate(([sd, nc]) => {
        const kp = new Map()
        for (const r of document.querySelectorAll(`${sd} .ag-row[row-index]`)) {
            const n = ((r.querySelector(`.ag-cell[col-id="${nc}"]`) || {}).textContent || '').trim()
            const chk = r.querySelector('.ag-cell[col-id="enable"] input[type="checkbox"]')
            if (n && chk) kp.set(Number(r.getAttribute('row-index')), { name: n, idx: Number(r.getAttribute('row-index')), enable: !!chk.checked, text: (r.textContent || '').trim() })
        }
        return [...kp.values()].sort((a, b) => a.idx - b.idx)
    }, [SEL_MODAL, nameCol])
}
//對話框某列之模式控制項透明度(ModeSelectChip: 唯讀 0.6、可編 1; 同 e2e-rela-user-grup E2E-001 之量法)
async function dlgModeOpacity(page, idx) {
    return await page.evaluate(([sd, k]) => {
        const e = document.querySelector(`${sd} .ag-row[row-index="${k}"] .ag-cell[col-id="mode"] [style*="opacity"]`)
        return e ? Number(getComputedStyle(e).opacity) : null
    }, [SEL_MODAL, idx])
}
//對話框儲存鈕／清單頁工具列儲存鈕是否出現(兩者皆只在有變更時渲染)
async function dlgSaveShown(page) {
    const loc = dlgBtn(page, DLG_MDI.save)
    return (await loc.count()) > 0 && await loc.first().isVisible()
}
async function pageSaveShown(page) {
    const loc = iconBtn(page, MDI.upload)
    return (await loc.count()) > 0 && await loc.first().isVisible()
}
//等頁面出現某段文字(訊息框、確認框之內容)
async function waitText(page, label, text) {
    await waitUntilExist(page, label, (t) => (document.body.innerText || '').includes(t), { timeout: 20000, arg: text })
    await page.waitForTimeout(500)
}
async function bodyHas(page, text) {
    return await page.evaluate((t) => (document.body.innerText || '').includes(t), text)
}
//點最上層彈窗(確認框)之按鈕: 以語系鍵之文字精確比對, 取最後一個可見者(彈窗後掛載、位於 DOM 尾端; 避免命中背後頁面之同字元素)
async function clickModalBtn(page, key) {
    const txt = await page.evaluate((k) => window.$vo.$t(k), key)
    const loc = page.getByText(txt, { exact: true })
    for (let i = (await loc.count()) - 1; i >= 0; i--) {
        if (await loc.nth(i).isVisible()) {
            await loc.nth(i).click()
            return
        }
    }
    throw new Error(`找不到可見之「${txt}」鈕`)
}
//主表某列某欄之勾選框(使用者頁 isActive 等)
async function clickCellCheckbox(page, k, c) {
    await page.locator(`.ag-row[row-index="${k}"] .ag-cell[col-id="${c}"] input[type="checkbox"]`).first().click()
    await page.waitForTimeout(500)
}
//base seed 各列之某欄皆無警告圖示
async function assertNoWarnRows(page, names, colId, label) {
    for (const nm of names) {
        for (const k of await rowIndexesByName(page, nm)) {
            assert.strict.equal(await cellWarnTitle(page, k, colId), null, `${label}: ${nm} 列之 ${colId} 不應有警告圖示`)
        }
    }
}
//讀庫內某表全部列(資料通道 select; 不經瀏覽器)
async function selectAll(kt) {
    const r = await callRpc(`${kt}.select`, [], TOKEN_ADMIN)
    assert.ok(r.ok && Array.isArray(r.output), `${kt}.select 應成功, 實得 ${JSON.stringify(r).slice(0, 200)}`)
    return r.output
}

describe('e2e-array-form run05 衝突之收嚴與提示 (R-PRINCIPLE-00; 語意斷言, 不產標準圖)', function() {
    this.timeout(300000)

    let snap = null

    //案後還原三表為本段開頭之 base seed 並回驗筆數(spec 各案〈清理〉: 回驗筆數為 4)
    async function restoreAndVerify() {
        await restoreTables(snap)
        const t = await readTables()
        assert.deepEqual([t.users.length, t.grups.length, t.pemis.length], [snap.users.length, snap.grups.length, snap.pemis.length], '收尾後三表筆數須回到 base seed')
    }

    before(async function() {
        this.timeout(400000)
        await startServersOnce()
        snap = await readTables()
        assert.deepEqual([snap.users.length, snap.grups.length, snap.pemis.length], [4, 4, 4], '前提: 本段開頭為 base seed(上一段已還原)')
    })

    after(async function() {
        this.timeout(120000)
        if (snap) {
            await restoreTables(snap)
        }
    })

    // ----- c 懸空引用(使用者層): spec 流程_使用者群組關聯 E2E-011、流程_後台使用者清單 E2E-013 之 dang-u -----
    for (const lang of LANGS) {
        it(`AF-017-dangling-cgrups [${lang}]: (spec 流程_使用者群組關聯 E2E-011) 清單 cgrups 儲存格警告圖示＋tooltip; VeCgrups 多一列查無之 MX(名稱唯讀、警告圖示、AND 已勾); 取消勾選並存檔 → 引用存為停用、授權回到 M1`, async function() {
            await syncRows('users', [DANG_U], F5)
            try {
                await withPageLang(lang, async (page) => {
                    //解析後權限樹(儲存前): M1 之聯集與查無的 AND 引用(內容全 n)取交集 = 空(spec 驗證 2)
                    assert.deepEqual(await getResolvedActiveTargets(page, 'id-dang-u'), [], '儲存前 dang-u 權限樹為空')
                    assert.deepEqual(await getResolvedActiveTargets(page, 'id-for-peter'), PETER_TREE, '對照: peter(只有 M1)')
                    await gotoUsers(page)
                    const k = await rowIndexByName(page, 'dang-u')
                    const expDang = await expWarn(page, 'warnRefDangling', { names: ['權限群組MX'], kindKey: 'warnKindGrup' })
                    //清單: 按鈕左側警告圖示, title 為 warnRefDangling 代入 MX 與種類(spec 驗證 1)
                    assert.strict.equal(await cellWarnTitle(page, k, 'cgrups'), expDang, 'dang-u 之 cgrups 儲存格警告 tooltip')
                    await assertNoWarnRows(page, BASE_USERS, 'cgrups', '其餘使用者')
                    assert.strict.equal(await cellText(page, k, 'cgrups'), await expSummary(page, 'userRnderCgrupsHasNGroups', 2, ''), '按鈕文字為使用 2 項權限群組(查無之 MX 亦計入)')
                    await openColDialog(page, k, 'cgrups', 'userEditCgrups')
                    const list = await dlgList(page)
                    //對話框共 5 列: M1～M4 之後接 MX 額外列(spec 驗證 1)
                    assert.deepEqual(list.map((v) => v.name), [...BASE_GRUPS, '權限群組MX'], '對話框列: 全部權限群組之後接查無之 MX')
                    const mx = list[4]
                    assert.strict.equal(mx.enable, true, 'MX 列「是否使用」已勾選')
                    assert.ok(/AND/.test(mx.text), `MX 列模式為 AND, 實得 ${mx.text}`)
                    assert.strict.equal(await dlgWarnTitle(page, mx.idx), expDang, 'MX 名稱左側警告圖示, tooltip 與清單相同')
                    assert.strict.equal(list[0].enable, true, 'M1 勾選')
                    assert.ok(/OR/.test(list[0].text), 'M1 模式 OR')
                    for (const v of list.slice(0, 4)) {
                        assert.strict.equal(await dlgWarnTitle(page, v.idx), null, `${v.name} 列無警告圖示`)
                    }
                    assert.deepEqual(list.slice(1, 4).map((v) => v.enable), [false, false, false], 'M2～M4 未勾選')
                    //名稱唯讀: 雙擊名稱儲存格不進入編輯(無輸入框)
                    const nameCell = page.locator(`${SEL_MODAL} .ag-row[row-index="${mx.idx}"] .ag-cell[col-id="name"]`).first()
                    await nameCell.dblclick()
                    await page.waitForTimeout(800)
                    assert.strict.equal(await nameCell.locator('input:not([type="checkbox"]), textarea').count(), 0, 'MX 名稱雙擊後不應出現編輯框(唯讀; 名稱欄本有之列勾選框不算)')
                    assert.strict.equal(await dlgModeOpacity(page, mx.idx), 1, '前提: MX 勾選時模式控制項可點')
                    //取消勾選 MX → 模式控制項淡色、Save 鈕現身
                    await toggleDialogEnable(page, mx.idx)
                    assert.ok(Math.abs((await dlgModeOpacity(page, mx.idx)) - 0.6) < 0.01, '取消勾選後 MX 模式控制項淡色不可點')
                    assert.strict.equal(await dlgSaveShown(page), true, '對話框出現 Save 鈕')
                    await clickDialogSave(page)
                    await waitDialogClosed(page, 'userEditCgrups')
                    //回填後: 警告圖示消失、摘要為使用 1 項(M1)、清單頁儲存鈕現身; 未點清單頁儲存前 DB 不變
                    assert.strict.equal(await cellWarnTitle(page, k, 'cgrups'), null, '回填後 dang-u 警告圖示消失')
                    assert.strict.equal(await cellText(page, k, 'cgrups'), await expSummary(page, 'userRnderCgrupsHasNGroups', 1, '(權限群組M1)'), '摘要為使用 1 項權限群組(權限群組M1)')
                    assert.strict.equal(await pageSaveShown(page), true, '清單頁出現儲存鈕')
                    assert.strict.equal(await readDbField('users', 'id-dang-u', 'cgrups'), DANG_U.cgrups, '未點清單頁儲存前 DB 不變')
                    await saveAndWaitModal(page)
                    await assertModalMsg(page, 'userSaveUsersSuccess')
                    const o = JSON5.parse(await readDbField('users', 'id-dang-u', 'cgrups'))
                    assert.deepEqual(o['權限群組MX'], { mode: 'AND', isActive: 'n' }, 'MX 引用存為停用(保留 AND)')
                    assert.deepEqual(o['權限群組M1'], { mode: 'OR', isActive: 'y' }, 'M1 不變')
                    //解析後權限樹(儲存後) = peter 之權限樹(spec 驗證 2)
                    assert.deepEqual(await getResolvedActiveTargets(page, 'id-dang-u'), PETER_TREE, '儲存後 dang-u 權限樹等於 peter')
                })
            }
            finally {
                await restoreAndVerify()
            }
        })
    }

    it('AF-018a-dangling-cgrups-unchanged-save: (R-PRINCIPLE-00 c; spec 流程_使用者群組關聯 E2E-011 備註) VeCgrups 不動 MX 列、只切換無關列後存檔 → 查無之 AND 引用原樣保留(啟用 AND)、授權不變(仍為空)', async function() {
        await syncRows('users', [DANG_U], F5)
        try {
            await withPageLang('eng', async (page) => {
                await gotoUsers(page)
                const k = await rowIndexByName(page, 'dang-u')
                await openColDialog(page, k, 'cgrups', 'userEditCgrups')
                const list = await dlgList(page)
                await touchUnrelatedRow(page, list.find((v) => v.name === '權限群組M3').idx)
                await clickDialogSave(page)
                await waitDialogClosed(page, 'userEditCgrups')
                await saveAndWaitModal(page)
                await assertModalMsg(page, 'userSaveUsersSuccess')
                const o = JSON5.parse(await readDbField('users', 'id-dang-u', 'cgrups'))
                assert.deepEqual(o['權限群組MX'], { mode: 'AND', isActive: 'y' }, '查無之 AND 引用原樣保留(修前: 無額外列, 存檔即丟棄而放寬)')
                assert.deepEqual(await getResolvedActiveTargets(page, 'id-dang-u'), [], '授權不變(仍為空)')
            })
        }
        finally {
            await restoreAndVerify()
        }
    })

    // ----- c 懸空引用於「所屬使用者」對話框: spec 流程_使用者群組關聯 E2E-015 -----
    for (const lang of LANGS) {
        it(`AF-019-dangling-belong-users [${lang}]: (spec 流程_使用者群組關聯 E2E-015) M2 之「所屬使用者」對話框 dang-u 列最左警告圖示; 勾選 dang-u 並存檔 → 只改本群組一項, MX 原樣保留、授權仍為空`, async function() {
            await syncRows('users', [DANG_U], F5)
            try {
                await withPageLang(lang, async (page) => {
                    assert.deepEqual(await getResolvedActiveTargets(page, 'id-dang-u'), [], '儲存前 dang-u 權限樹為空')
                    const before = await selectAll('users')
                    await gotoGrups(page)
                    const k = await rowIndexByName(page, '權限群組M2')
                    await openColDialog(page, k, 'belongUsers', 'grupBlngEditUsers')
                    const rows = await readDlgRows(page, 'name')
                    const expDang = await expWarn(page, 'warnRefDangling', { names: ['權限群組MX'], kindKey: 'warnKindGrup' })
                    assert.strict.equal(await dlgWarnTitle(page, rows['dang-u'].idx, 'grupsNames'), expDang, 'dang-u 列之警告 tooltip 與清單頁相同')
                    for (const nm of BASE_USERS) {
                        assert.strict.equal(await dlgWarnTitle(page, rows[nm].idx, 'grupsNames'), null, `${nm} 列無警告圖示`)
                    }
                    assert.strict.equal(rows['dang-u'].enable, false, '前提: dang-u 未歸屬 M2')
                    await toggleDialogEnable(page, rows['dang-u'].idx)
                    const chips = await readDialogChipsRow(page, rows['dang-u'].idx, 'grupsNames')
                    assert.deepEqual(chips.titles, ['權限群組M2', '權限群組M1'], `勾選後標籤: 本群組排第 1 顆並保留 M1, 查無之 MX 不顯示為標籤(實得 ${JSON.stringify(chips.titles)})`)
                    await saveBelongAndWaitModal(page)
                    await assertModalMsg(page, 'userSaveUsersSuccess')
                    await dismissResultModal(page)
                    const o = JSON5.parse(await readDbField('users', 'id-dang-u', 'cgrups'))
                    assert.deepEqual(o['權限群組MX'], { mode: 'AND', isActive: 'y' }, 'MX 仍為啟用 AND(不得丟棄)')
                    assert.deepEqual(o['權限群組M1'], { mode: 'OR', isActive: 'y' }, 'M1 不變')
                    assert.strict.equal(o['權限群組M2']?.isActive, 'y', '新增 M2 之啟用項')
                    const after = await selectAll('users')
                    for (const u of after.filter((v) => v.id !== 'id-dang-u')) {
                        assert.strict.equal(u.cgrups, before.find((v) => v.id === u.id).cgrups, `${u.name} 之 cgrups 不變`)
                    }
                    assert.deepEqual(await getResolvedActiveTargets(page, 'id-dang-u'), [], '儲存後仍為空(MX 之 AND 限制保留; 修前丟棄而變為非空)')
                })
            }
            finally {
                await restoreAndVerify()
            }
        })
    }

    // ----- c 懸空引用(權限層): spec 流程_群組權限關聯 E2E-008(含群組清單之按鈕警告)、E2E-009 -----
    for (const lang of LANGS) {
        it(`AF-020-dangling-cpemis [${lang}]: (spec 流程_群組權限關聯 E2E-008) 群組清單 cpemis 儲存格警告; VeCpemis 多一列查無之 PX; 取消勾選並存檔 → 引用存為停用、dang-gu 授權回到 P1`, async function() {
            await syncRows('grups', [DANG_G], F5)
            await syncRows('users', [DANG_GU], F5)
            try {
                await withPageLang(lang, async (page) => {
                    assert.deepEqual(await getResolvedActiveTargets(page, 'id-dang-gu'), [], '儲存前 dang-gu 權限樹為空(P1 聯集 ∩ 查無之 AND)')
                    await gotoGrups(page)
                    const k = await rowIndexByName(page, 'dang-g')
                    const expDang = await expWarn(page, 'warnRefDangling', { names: ['權限PX'], kindKey: 'warnKindPemi' })
                    assert.strict.equal(await cellWarnTitle(page, k, 'cpemis'), expDang, 'dang-g 之 cpemis 儲存格警告 tooltip')
                    await assertNoWarnRows(page, BASE_GRUPS, 'cpemis', '其餘群組')
                    //群組清單之摘要只計權限表中查得者(fltKpPemi), 查無的 PX 不計入(spec 驗證 1)
                    const sum1 = await expSummary(page, 'grupRnderCpemisHasNPermissions', 1, '(權限P1)')
                    assert.strict.equal(await cellText(page, k, 'cpemis'), sum1, '按鈕文字為使用 1 項權限(權限P1)')
                    await openColDialog(page, k, 'cpemis', 'grupEditCpemis')
                    const list = await dlgList(page)
                    assert.deepEqual(list.map((v) => v.name), [...BASE_PEMIS, '權限PX'], '對話框列: 全部權限之後接查無之 PX')
                    const px = list[4]
                    assert.strict.equal(px.enable, true, 'PX 列已勾選')
                    assert.ok(/AND/.test(px.text), `PX 列模式為 AND, 實得 ${px.text}`)
                    assert.strict.equal(await dlgWarnTitle(page, px.idx), expDang, 'PX 名稱左側警告圖示, tooltip 與清單相同')
                    assert.ok(list[0].enable && /OR/.test(list[0].text), 'P1 勾選且 OR')
                    for (const v of list.slice(0, 4)) {
                        assert.strict.equal(await dlgWarnTitle(page, v.idx), null, `${v.name} 列無警告圖示`)
                    }
                    assert.deepEqual(list.slice(1, 4).map((v) => v.enable), [false, false, false], 'P2～P4 未勾選')
                    const nameCell = page.locator(`${SEL_MODAL} .ag-row[row-index="${px.idx}"] .ag-cell[col-id="name"]`).first()
                    await nameCell.dblclick()
                    await page.waitForTimeout(800)
                    assert.strict.equal(await nameCell.locator('input:not([type="checkbox"]), textarea').count(), 0, 'PX 名稱雙擊後不應出現編輯框(唯讀; 名稱欄本有之列勾選框不算)')
                    await toggleDialogEnable(page, px.idx)
                    assert.ok(Math.abs((await dlgModeOpacity(page, px.idx)) - 0.6) < 0.01, '取消勾選後 PX 模式控制項淡色不可點')
                    assert.strict.equal(await dlgSaveShown(page), true, '對話框出現 Save 鈕')
                    await clickDialogSave(page)
                    await waitDialogClosed(page, 'grupEditCpemis')
                    assert.strict.equal(await cellWarnTitle(page, k, 'cpemis'), null, '回填後 dang-g 警告圖示消失')
                    assert.strict.equal(await cellText(page, k, 'cpemis'), sum1, '摘要仍為使用 1 項權限(權限P1)')
                    assert.strict.equal(await pageSaveShown(page), true, '清單頁出現儲存鈕')
                    assert.strict.equal(await readDbField('grups', 'id-dang-g', 'cpemis'), DANG_G.cpemis, '未點清單頁儲存前 DB 不變')
                    await saveAndWaitModal(page)
                    await assertModalMsg(page, 'grupSaveGrupsSuccess')
                    const o = JSON5.parse(await readDbField('grups', 'id-dang-g', 'cpemis'))
                    assert.deepEqual(o['權限PX'], { mode: 'AND', isActive: 'n' }, 'PX 引用存為停用(保留 AND)')
                    assert.deepEqual(o['權限P1'], { mode: 'OR', isActive: 'y' }, 'P1 不變')
                    assert.deepEqual(await getResolvedActiveTargets(page, 'id-dang-gu'), [T_A], '儲存後 dang-gu 權限樹為 P1 所給')
                })
            }
            finally {
                await restoreAndVerify()
            }
        })
    }

    it('AF-018b-dangling-cpemis-unchanged-save: (R-PRINCIPLE-00 c) VeCpemis 不動 PX 列、只切換無關列後存檔 → 查無之 AND 引用原樣保留、dang-gu 授權不變(仍為空)', async function() {
        await syncRows('grups', [DANG_G], F5)
        await syncRows('users', [DANG_GU], F5)
        try {
            await withPageLang('eng', async (page) => {
                await gotoGrups(page)
                const k = await rowIndexByName(page, 'dang-g')
                await openColDialog(page, k, 'cpemis', 'grupEditCpemis')
                const list = await dlgList(page)
                await touchUnrelatedRow(page, list.find((v) => v.name === '權限P3').idx)
                await clickDialogSave(page)
                await waitDialogClosed(page, 'grupEditCpemis')
                await saveAndWaitModal(page)
                await assertModalMsg(page, 'grupSaveGrupsSuccess')
                const o = JSON5.parse(await readDbField('grups', 'id-dang-g', 'cpemis'))
                assert.deepEqual(o['權限PX'], { mode: 'AND', isActive: 'y' }, '查無之 AND 引用原樣保留')
                assert.deepEqual(await getResolvedActiveTargets(page, 'id-dang-gu'), [], '授權不變(仍為空)')
            })
        }
        finally {
            await restoreAndVerify()
        }
    })

    for (const lang of LANGS) {
        it(`AF-021-dangling-belong-grups [${lang}]: (spec 流程_群組權限關聯 E2E-009) P2 之「所屬權限群組」對話框 dang-g 列最左警告圖示; 勾選 dang-g 並存檔 → 只改本權限一項, PX 原樣保留、dang-gu 授權仍為空`, async function() {
            await syncRows('grups', [DANG_G], F5)
            await syncRows('users', [DANG_GU], F5)
            try {
                await withPageLang(lang, async (page) => {
                    assert.deepEqual(await getResolvedActiveTargets(page, 'id-dang-gu'), [], '儲存前 dang-gu 權限樹為空')
                    const before = await selectAll('grups')
                    await gotoPemis(page)
                    const k = await rowIndexByName(page, '權限P2')
                    await openColDialog(page, k, 'belongGrups', 'pemiBlngEditGrups')
                    const rows = await readDlgRows(page, 'name')
                    const expDang = await expWarn(page, 'warnRefDangling', { names: ['權限PX'], kindKey: 'warnKindPemi' })
                    assert.strict.equal(await dlgWarnTitle(page, rows['dang-g'].idx, 'pemisNames'), expDang, 'dang-g 列之警告 tooltip 與群組清單頁相同')
                    for (const nm of BASE_GRUPS) {
                        assert.strict.equal(await dlgWarnTitle(page, rows[nm].idx, 'pemisNames'), null, `${nm} 列無警告圖示`)
                    }
                    assert.strict.equal(rows['dang-g'].enable, false, '前提: dang-g 未使用 P2')
                    await toggleDialogEnable(page, rows['dang-g'].idx)
                    const chips = await readDialogChipsRow(page, rows['dang-g'].idx, 'pemisNames')
                    assert.deepEqual(chips.titles, ['權限P2', '權限P1'], `勾選後標籤: 本權限排第 1 顆並保留 P1, 查無之 PX 不顯示為標籤(實得 ${JSON.stringify(chips.titles)})`)
                    await saveBelongAndWaitModal(page)
                    await assertModalMsg(page, 'grupSaveGrupsSuccess')
                    await dismissResultModal(page)
                    const o = JSON5.parse(await readDbField('grups', 'id-dang-g', 'cpemis'))
                    assert.deepEqual(o['權限PX'], { mode: 'AND', isActive: 'y' }, 'PX 仍為啟用 AND(不得丟棄)')
                    assert.deepEqual(o['權限P1'], { mode: 'OR', isActive: 'y' }, 'P1 不變')
                    assert.strict.equal(o['權限P2']?.isActive, 'y', '新增 P2 之啟用項')
                    const after = await selectAll('grups')
                    for (const g of after.filter((v) => v.id !== 'id-dang-g')) {
                        assert.strict.equal(g.cpemis, before.find((v) => v.id === g.id).cpemis, `${g.name} 之 cpemis 不變`)
                    }
                    assert.deepEqual(await getResolvedActiveTargets(page, 'id-dang-gu'), [], '儲存後仍為空(PX 之 AND 限制保留)')
                })
            }
            finally {
                await restoreAndVerify()
            }
        })
    }

    // ----- a 權限規則重複列有勾有不勾: spec 流程_權限規則關聯 E2E-007、流程_後台權限清單 E2E-013 -----
    for (const lang of LANGS) {
        it(`AF-022-rule-conflict [${lang}]: (spec 流程_權限規則關聯 E2E-007、流程_後台權限清單 E2E-013) 清單 crules 儲存格警告(same-p 全勾之重複不算); VeCrules 該列未勾＋警告; 勾選並存檔 → 合併為單一勾選, dup-pu 取得該對象`, async function() {
            await syncRows('pemis', [DUP_P, SAME_P], F5)
            await syncRows('grups', [DUP_PG], F5)
            await syncRows('users', [DUP_PU], F5)
            try {
                await withPageLang(lang, async (page) => {
                    assert.deepEqual(await getResolvedActiveTargets(page, 'id-dup-pu'), [T_C], '儲存前 dup-pu: 重複列〔勾、不勾〕取不勾選 → 只有 專案A/頁C')
                    await gotoPemis(page)
                    const k = await rowIndexByName(page, 'dup-p')
                    const expConf = await expWarn(page, 'warnRuleConflict', { names: [T_A] })
                    assert.strict.equal(await cellWarnTitle(page, k, 'crules'), expConf, 'dup-p 之 crules 儲存格警告 tooltip')
                    await assertNoWarnRows(page, [...BASE_PEMIS, 'same-p'], 'crules', '其餘權限(含全勾之重複 same-p)')
                    assert.strict.equal(await cellText(page, k, 'crules'), await expSummary(page, 'pemiRnderCrulesHasNRule', 1, ''), '按鈕文字為使用共 1 項對象')
                    await openColDialog(page, k, 'crules', 'pemiEditCrules')
                    const rows = await readDlgRows(page, 'id')
                    assert.strict.equal(rows[T_A]?.enable, false, `${T_A} 列未勾選(收嚴)`)
                    assert.strict.equal(await dlgWarnTitle(page, rows[T_A].idx, 'id'), expConf, `${T_A} 列名稱左側警告圖示, tooltip 與清單相同`)
                    assert.strict.equal(rows[T_C]?.enable, true, `${T_C} 列已勾選`)
                    for (const [id, v] of Object.entries(rows)) {
                        if (id === T_A) continue
                        assert.strict.equal(await dlgWarnTitle(page, v.idx, 'id'), null, `${id} 列無警告圖示`)
                        if (id !== T_C) assert.strict.equal(v.enable, false, `${id} 列未勾選`)
                    }
                    await toggleDialogEnable(page, rows[T_A].idx)
                    assert.strict.equal(await dlgWarnTitle(page, rows[T_A].idx, 'id'), expConf, '勾選後圖示仍保留(提示反映開啟時之資料)')
                    await clickDialogSave(page)
                    await waitDialogClosed(page, 'pemiEditCrules')
                    assert.strict.equal(await cellWarnTitle(page, k, 'crules'), null, '回填後 dup-p 警告圖示消失')
                    assert.strict.equal(await cellText(page, k, 'crules'), await expSummary(page, 'pemiRnderCrulesHasNRule', 2, ''), '按鈕文字為使用共 2 項對象')
                    assert.strict.equal(await pageSaveShown(page), true, '清單頁出現儲存鈕')
                    assert.strict.equal(await readDbField('pemis', 'id-dup-p', 'crules'), DUP_P.crules, '未點清單頁儲存前 DB 不變')
                    await saveAndWaitModal(page)
                    await assertModalMsg(page, 'pemiSavePemisSuccess')
                    const o = JSON.parse(await readDbField('pemis', 'id-dup-p', 'crules'))
                    assert.ok(o && typeof o === 'object' && !Array.isArray(o), '存出為物件形式')
                    assert.strict.equal(o[T_A], 'y')
                    assert.strict.equal(o[T_C], 'y')
                    assert.deepEqual(await getResolvedActiveTargets(page, 'id-dup-pu'), [T_A, T_C].sort(), '儲存後 dup-pu 取得兩個對象')
                })
            }
            finally {
                await restoreAndVerify()
            }
        })
    }

    it('AF-022b-rule-conflict-unchanged-save: (R-PRINCIPLE-00 a) VeCrules 不動衝突列、只切換無關列後存檔 → 衝突列存為顯式 n(與收嚴解讀一致)、dup-pu 授權不變', async function() {
        await syncRows('pemis', [DUP_P], F5)
        await syncRows('grups', [DUP_PG], F5)
        await syncRows('users', [DUP_PU], F5)
        try {
            await withPageLang('eng', async (page) => {
                await gotoPemis(page)
                const k = await rowIndexByName(page, 'dup-p')
                await openColDialog(page, k, 'crules', 'pemiEditCrules')
                const rows = await readDlgRows(page, 'id')
                await touchUnrelatedRow(page, rows['專案B/頁B/區塊A'].idx)
                await clickDialogSave(page)
                await waitDialogClosed(page, 'pemiEditCrules')
                await saveAndWaitModal(page)
                await assertModalMsg(page, 'pemiSavePemisSuccess')
                const o = JSON.parse(await readDbField('pemis', 'id-dup-p', 'crules'))
                assert.strict.equal(o[T_A], 'n', '衝突列存為顯式 n')
                assert.strict.equal(o[T_C], 'y')
                assert.deepEqual(await getResolvedActiveTargets(page, 'id-dup-pu'), [T_C], '授權不變')
            })
        }
        finally {
            await restoreAndVerify()
        }
    })

    // ----- 使用者清單之警告種類(c／e／b／f): spec 流程_後台使用者清單 E2E-013 -----
    for (const lang of LANGS) {
        it(`AF-023-users-list-warn-kinds [${lang}]: (spec 流程_後台使用者清單 E2E-013) dang-u／mode-u／both-u／noname-u 之 cgrups 儲存格各出其警告 tooltip, base seed 四列無圖示; both-u 對話框 M1 列 warnRefBothModes`, async function() {
            await syncRows('users', [DANG_U, MODE_U, BOTH_U, NONAME_U], F5)
            try {
                await withPageLang(lang, async (page) => {
                    await gotoUsers(page)
                    const exp = {
                        'dang-u': await expWarn(page, 'warnRefDangling', { names: ['權限群組MX'], kindKey: 'warnKindGrup' }),
                        'mode-u': await expWarn(page, 'warnRefModeInvalid', { names: ['權限群組M2'] }),
                        'both-u': await expWarn(page, 'warnRefBothModes', { names: ['權限群組M1'] }),
                        'noname-u': await expWarn(page, 'warnRefNoName', { names: ['#2'] }),
                    }
                    for (const [nm, t] of Object.entries(exp)) {
                        assert.strict.equal(await cellWarnTitle(page, await rowIndexByName(page, nm), 'cgrups'), t, `${nm} 之 cgrups 警告 tooltip`)
                    }
                    await assertNoWarnRows(page, BASE_USERS, 'cgrups', 'base seed')
                    //無警告之列: 該欄與修改前相同(按鈕占滿儲存格寬度, 無警告圖示之 flex 容器)
                    const kp = await rowIndexByName(page, 'peter')
                    const full = await page.evaluate((k) => {
                        const c = document.querySelector(`.ag-row[row-index="${k}"] .ag-cell[col-id="cgrups"]`)
                        const b = c && c.querySelector('button')
                        return b ? b.getAttribute('style') : null
                    }, kp)
                    assert.ok(full && /width:\s*100%/.test(full), `無警告之列按鈕仍占滿寬度, 實得 style=${full}`)
                    const kb = await rowIndexByName(page, 'both-u')
                    await openColDialog(page, kb, 'cgrups', 'userEditCgrups')
                    const rows = await readDlgRows(page, 'name')
                    assert.strict.equal(await dlgWarnTitle(page, rows['權限群組M1'].idx), exp['both-u'], 'both-u 對話框 M1 列之警告 tooltip 為 warnRefBothModes')
                })
            }
            finally {
                await restoreAndVerify()
            }
        })
    }

    // ----- e 模式缺漏: spec 流程_使用者群組關聯 E2E-012 -----
    for (const lang of LANGS) {
        it(`AF-024-mode-missing-as-and [${lang}]: (spec 流程_使用者群組關聯 E2E-012) mode-u 之 M2(無 mode)於 VeCgrups 顯示為已勾、AND(可展開)＋警告; 只切換無關列後存檔 → M2 原樣保留(mode 仍缺漏)、授權不變(M1 ∩ M2, 3 個), 警告仍在`, async function() {
            await syncRows('users', [MODE_U], F5)
            try {
                await withPageLang(lang, async (page) => {
                    assert.deepEqual(await getResolvedActiveTargets(page, 'id-mode-u'), M1_AND_M2, '儲存前: M1 OR ∩ M2(視為 AND)')
                    await gotoUsers(page)
                    const k = await rowIndexByName(page, 'mode-u')
                    const expMode = await expWarn(page, 'warnRefModeInvalid', { names: ['權限群組M2'] })
                    assert.strict.equal(await cellWarnTitle(page, k, 'cgrups'), expMode, '清單 mode-u 之警告 tooltip 為 warnRefModeInvalid')
                    await openColDialog(page, k, 'cgrups', 'userEditCgrups')
                    const rows = await readDlgRows(page, 'name')
                    assert.strict.equal(rows['權限群組M2'].enable, true, 'M2 已勾選')
                    assert.ok(/AND/.test(rows['權限群組M2'].text), 'M2 模式 AND')
                    assert.strict.equal(await dlgModeOpacity(page, rows['權限群組M2'].idx), 1, 'M2 模式控制項可展開')
                    assert.strict.equal(await dlgWarnTitle(page, rows['權限群組M2'].idx), expMode, 'M2 名稱左側警告 tooltip 相同')
                    assert.ok(rows['權限群組M1'].enable && /OR/.test(rows['權限群組M1'].text), 'M1 勾選、OR')
                    assert.strict.equal(await dlgWarnTitle(page, rows['權限群組M1'].idx), null, 'M1 無圖示')
                    await touchUnrelatedRow(page, rows['權限群組M3'].idx) //勾選 M3 後再取消(使 Save 鈕現身, 淨內容不變)
                    await clickDialogSave(page)
                    await waitDialogClosed(page, 'userEditCgrups')
                    await saveAndWaitModal(page)
                    await assertModalMsg(page, 'userSaveUsersSuccess')
                    await dismissResultModal(page)
                    const o = JSON5.parse(await readDbField('users', 'id-mode-u', 'cgrups'))
                    //run05(主責 2026-10-21 通知: 編輯器存檔時對 mode 缺／非法之啟用項還原原始 mode; spec 原載「M2 存為 { mode:'AND', isActive:'y' }、警告圖示消失」隨之改寫):
                    //  M2 原樣保留(仍啟用、mode 仍缺漏, 不補成 AND／OR), 故清單警告仍在
                    assert.strict.equal(o['權限群組M2']?.isActive, 'y', 'M2 仍啟用')
                    assert.strict.equal(o['權限群組M2']?.mode, undefined, `M2 之 mode 原樣缺漏, 實得 ${JSON.stringify(o['權限群組M2'])}`)
                    assert.deepEqual(o['權限群組M1'], { mode: 'OR', isActive: 'y' }, 'M1 不變')
                    assert.strict.equal(await cellWarnTitle(page, await rowIndexByName(page, 'mode-u'), 'cgrups'), expMode, '儲存後清單警告仍在(資料仍缺 mode)')
                    assert.deepEqual(await getResolvedActiveTargets(page, 'id-mode-u'), M1_AND_M2, '儲存後授權不變')
                })
            }
            finally {
                await restoreAndVerify()
            }
        })
    }

    // ----- f 無名稱項目: spec 流程_使用者群組關聯 E2E-013 -----
    for (const lang of LANGS) {
        it(`AF-025-noname-blocked [${lang}]: (spec 流程_使用者群組關聯 E2E-013) noname-u 之 VeCgrups 最上方提示列(警告圖示＋warnRefNoName, title 為 authLossyBlocked); 改動後存檔 → 拒存訊息、對話框不關、DB 逐字不變; 無此類項目者不渲染提示列`, async function() {
            await syncRows('users', [NONAME_U], F5)
            try {
                await withPageLang(lang, async (page) => {
                    assert.deepEqual(await getResolvedActiveTargets(page, 'id-noname-u'), [], '伺服端: 無名稱元素視為懸空 AND → 權限樹為空(spec 備註)')
                    await gotoUsers(page)
                    //對照: 無此類項目之使用者(peter)開啟之對話框不渲染提示列
                    await openColDialog(page, await rowIndexByName(page, 'peter'), 'cgrups', 'userEditCgrups')
                    const hint0 = await page.evaluate((sd) => !!document.querySelector(`${sd} div[title] > img[src^="data:image/png;base64"]`), SEL_MODAL)
                    assert.strict.equal(hint0, false, 'peter 之對話框無提示列')
                    await clickDialogClose(page)
                    await waitDialogClosed(page, 'userEditCgrups')
                    const k = await rowIndexByName(page, 'noname-u')
                    await openColDialog(page, k, 'cgrups', 'userEditCgrups')
                    const hint = await page.evaluate((sd) => {
                        const img = document.querySelector(`${sd} div[title] > img[src^="data:image/png;base64"]`)
                        const d = img && img.parentElement
                        return d ? { title: d.getAttribute('title'), text: (d.textContent || '').trim() } : null
                    }, SEL_MODAL)
                    const expHint = await expWarn(page, 'warnRefNoName', { names: ['#2'] })
                    const expLossy = await expWarn(page, 'authLossyBlocked', { names: ['#2'] })
                    assert.ok(hint, '對話框內容區最上方應有提示列')
                    assert.strict.equal(hint.text, expHint, '提示列文字為 warnRefNoName 代入 #2')
                    assert.strict.equal(hint.title, expLossy, '提示列 title 為 authLossyBlocked 代入 #2')
                    const list = await dlgList(page)
                    for (const v of list) {
                        assert.strict.equal(await dlgWarnTitle(page, v.idx), null, `${v.name} 列無警告圖示(無名稱之項目無列可掛)`)
                    }
                    const m1 = list.find((v) => v.name === '權限群組M1')
                    assert.ok(m1.enable && /OR/.test(m1.text), 'M1 勾選、OR')
                    await toggleDialogEnable(page, list.find((v) => v.name === '權限群組M3').idx)
                    await clickDialogSave(page)
                    await waitText(page, '拒存訊息', expLossy)
                    await dismissResultModal(page)
                    assert.ok(await bodyHas(page, await page.evaluate(() => window.$vo.$t('userEditCgrups'))), '訊息關閉後對話框仍開啟')
                    assert.strict.equal(await pageSaveShown(page), false, '清單頁不出現儲存鈕')
                    assert.strict.equal(await readDbField('users', 'id-noname-u', 'cgrups'), NONAME_U.cgrups, 'DB 字串逐字元不變')
                })
            }
            finally {
                await restoreAndVerify()
            }
        })
    }

    // ----- 刪除被 AND 引用者前確認: spec 流程_後台群組清單 E2E-014、流程_後台權限清單 E2E-014 -----
    for (const lang of LANGS) {
        it(`AF-026-delete-grup-confirm [${lang}]: (spec 流程_後台群組清單 E2E-014) 刪除被 and-u 以 AND 引用之 M2 → 確認框(confirmDelAndRefsGrup, n=1); 取消則不刪; 確定後存檔 → M2 刪除、and-u 字串不變、授權為空`, async function() {
            await syncRows('users', [AND_U], F5)
            try {
                await withPageLang(lang, async (page) => {
                    assert.deepEqual(await getResolvedActiveTargets(page, 'id-and-u'), M1_AND_M2, '刪除前 and-u: M1 ∩ M2')
                    await gotoGrups(page)
                    const expConfirm = await expWarn(page, 'confirmDelAndRefsGrup', { n: 1 })
                    await checkRow(page, await rowIndexByName(page, '權限群組M2'))
                    await iconBtn(page, MDI.trash).first().click()
                    await waitText(page, '確認框', expConfirm)
                    assert.ok(await bodyHas(page, await page.evaluate(() => window.$vo.$t('systemMessage'))), '確認框標題為 systemMessage')
                    await clickModalBtn(page, 'no')
                    await waitUntilExist(page, '確認框關閉', (t) => !(document.body.innerText || '').includes(t), { arg: expConfirm })
                    await page.waitForTimeout(500)
                    assert.strict.equal((await rowIndexesByName(page, '權限群組M2')).length, 1, '取消後 M2 列仍在')
                    assert.strict.equal(await pageSaveShown(page), false, '取消後清單頁不出現儲存鈕')
                    await iconBtn(page, MDI.trash).first().click()
                    await waitText(page, '確認框(第二次)', expConfirm)
                    await clickModalBtn(page, 'yes')
                    await waitUntilExist(page, 'M2 自清單移除', () => ![...document.querySelectorAll('.ag-row[row-index] .ag-cell[col-id="name"]')].some((c) => (c.textContent || '').trim() === '權限群組M2'))
                    await page.waitForTimeout(500)
                    assert.strict.equal(await pageSaveShown(page), true, '確定後清單頁出現儲存鈕')
                    await saveAndWaitModal(page)
                    await assertModalMsg(page, 'grupSaveGrupsSuccess')
                    assert.ok(!(await selectAll('grups')).some((g) => g.name === '權限群組M2'), 'DB grups 無 M2')
                    assert.strict.equal(await readDbField('users', 'id-and-u', 'cgrups'), AND_U.cgrups, 'and-u 之 cgrups 字串不變')
                    assert.deepEqual(await getResolvedActiveTargets(page, 'id-and-u'), [], '刪除後 and-u 授權為空(AND 引用之群組查無, 內容全 n)')
                })
            }
            finally {
                await restoreAndVerify()
            }
        })
    }

    for (const lang of LANGS) {
        it(`AF-027-delete-pemi-confirm [${lang}]: (spec 流程_後台權限清單 E2E-014) 刪除被 M3 以 AND 引用之 P3 → 確認框(confirmDelAndRefsPemi, n=1); 取消則不刪; 確定後存檔 → P3 刪除、M3 字串不變、john 授權為空`, async function() {
            try {
                await withPageLang(lang, async (page) => {
                    assert.deepEqual(await getResolvedActiveTargets(page, 'id-for-john'), JOHN_TREE, '刪除前 john: P2 ∩ P3')
                    const m3Before = snap.grups.find((g) => g.name === '權限群組M3').cpemis
                    await gotoPemis(page)
                    const expConfirm = await expWarn(page, 'confirmDelAndRefsPemi', { n: 1 })
                    await checkRow(page, await rowIndexByName(page, '權限P3'))
                    await iconBtn(page, MDI.trash).first().click()
                    await waitText(page, '確認框', expConfirm)
                    await clickModalBtn(page, 'no')
                    await waitUntilExist(page, '確認框關閉', (t) => !(document.body.innerText || '').includes(t), { arg: expConfirm })
                    await page.waitForTimeout(500)
                    assert.strict.equal((await rowIndexesByName(page, '權限P3')).length, 1, '取消後 P3 列仍在')
                    assert.strict.equal(await pageSaveShown(page), false, '取消後清單頁不出現儲存鈕')
                    await iconBtn(page, MDI.trash).first().click()
                    await waitText(page, '確認框(第二次)', expConfirm)
                    await clickModalBtn(page, 'yes')
                    await waitUntilExist(page, 'P3 自清單移除', () => ![...document.querySelectorAll('.ag-row[row-index] .ag-cell[col-id="name"]')].some((c) => (c.textContent || '').trim() === '權限P3'))
                    await page.waitForTimeout(500)
                    assert.strict.equal(await pageSaveShown(page), true, '確定後清單頁出現儲存鈕')
                    await saveAndWaitModal(page)
                    await assertModalMsg(page, 'pemiSavePemisSuccess')
                    assert.ok(!(await selectAll('pemis')).some((p) => p.name === '權限P3'), 'DB pemis 無 P3')
                    assert.strict.equal((await selectAll('grups')).find((g) => g.name === '權限群組M3').cpemis, m3Before, 'M3 之 cpemis 字串不變')
                    assert.deepEqual(await getResolvedActiveTargets(page, 'id-for-john'), [], '刪除後 john 授權為空')
                })
            }
            finally {
                await restoreAndVerify()
            }
        })
    }

    // ----- g／h 使用者歷史重複與空值: spec 流程_後台使用者清單 E2E-014、E2E-015(預設 mappingBy='id' 時同步允許) -----
    for (const lang of LANGS) {
        it(`AF-028-users-hist-dup [${lang}]: (spec 流程_後台使用者清單 E2E-014) 兩位同名同 Email 之使用者: 名稱與 Email 儲存格警告(warnUserNameHistDup／warnUserEmailHistDup, n=2); 修改 peter 說明後存檔成功`, async function() {
            const dupA = mkU('id-dup-a', 'dup-n', '{}', { email: 'dup-shared@example.com' })
            const dupB = mkU('id-dup-b', 'dup-n', '{}', { email: 'dup-shared@example.com' })
            await syncRows('users', [dupA, dupB], F5)
            try {
                await withPageLang(lang, async (page) => {
                    await gotoUsers(page)
                    const ks = await rowIndexesByName(page, 'dup-n')
                    assert.strict.equal(ks.length, 2, '兩列 dup-n')
                    const expN = await expWarn(page, 'warnUserNameHistDup', { n: 2 })
                    const expE = await expWarn(page, 'warnUserEmailHistDup', { n: 2 })
                    for (const k of ks) {
                        assert.strict.equal(await cellWarnTitle(page, k, 'name'), expN, '名稱儲存格警告 tooltip')
                        assert.strict.equal(await cellWarnTitle(page, k, 'email'), expE, 'Email 儲存格警告 tooltip')
                    }
                    await assertNoWarnRows(page, BASE_USERS, 'name', 'base seed 名稱')
                    await assertNoWarnRows(page, BASE_USERS, 'email', 'base seed Email')
                    const desc = `run05-desc-${lang}`
                    await typeIntoCell(page, await rowIndexByName(page, 'peter'), 'description', desc)
                    await saveAndWaitModal(page)
                    await assertModalMsg(page, 'userSaveUsersSuccess')
                    for (const key of ['errInNames', 'errInEmails']) {
                        assert.ok(!(await bodyHas(page, await page.evaluate((kk) => window.$vo.$t(kk), key))), `不出現 ${key}`)
                    }
                    const us = await selectAll('users')
                    assert.strict.equal(us.find((u) => u.id === 'id-for-peter').description, desc, 'peter 之說明已更新')
                    for (const id of ['id-dup-a', 'id-dup-b']) {
                        const u = us.find((v) => v.id === id)
                        assert.ok(u && u.name === 'dup-n' && u.email === 'dup-shared@example.com', `${id} 仍在且 name／email 不變`)
                    }
                })
            }
            finally {
                await restoreAndVerify()
            }
        })
    }

    for (const lang of LANGS) {
        it(`AF-029-users-hist-empty-email [${lang}]: (spec 流程_後台使用者清單 E2E-015) 既有空 Email 之使用者: Email 儲存格警告(warnUserEmailHistEmpty)、修改他列存檔成功; 新增列不填 Email 仍擋存(errInEmails)`, async function() {
            await syncRows('users', [mkU('id-noemail-u', 'noemail-u', '{}', { email: '' })], F5)
            try {
                await withPageLang(lang, async (page) => {
                    await gotoUsers(page)
                    assert.strict.equal(await cellWarnTitle(page, await rowIndexByName(page, 'noemail-u'), 'email'), await page.evaluate(() => window.$vo.$t('warnUserEmailHistEmpty')), 'noemail-u 之 Email 儲存格警告 tooltip')
                    const desc = `run05-desc-${lang}`
                    await typeIntoCell(page, await rowIndexByName(page, 'peter'), 'description', desc)
                    await saveAndWaitModal(page)
                    await assertModalMsg(page, 'userSaveUsersSuccess')
                    await dismissResultModal(page)
                    let us = await selectAll('users')
                    assert.strict.equal(us.find((u) => u.id === 'id-for-peter').description, desc, 'peter 之說明已更新')
                    assert.strict.equal(us.find((u) => u.id === 'id-noemail-u').email, '', 'noemail-u 之 email 仍為空字串')
                    const n0 = us.length
                    await clickAdd(page)
                    await typeIntoCell(page, 0, 'name', 'run05-new-u')
                    if (await cellText(page, 0, 'email') !== '') {
                        await typeIntoCell(page, 0, 'email', '') //新列預設若有 Email 則清空(spec: Email 留空)
                    }
                    assert.strict.equal(await cellWarnTitle(page, 0, 'email'), await page.evaluate(() => window.$vo.$t('userEmailEmpty')), '新列 Email 儲存格為擋存之 userEmailEmpty')
                    await saveAndWaitModal(page)
                    await assertModalMsg(page, 'errInEmails')
                    us = await selectAll('users')
                    assert.strict.equal(us.length, n0, 'DB users 無新增列')
                })
            }
            finally {
                await restoreAndVerify()
            }
        })
    }

    // ----- g／d 歷史同名(旁路寫庫): spec 流程_後台群組清單 E2E-011／012、流程_後台權限清單 E2E-011／012、流程_使用者群組關聯 E2E-014 -----
    //歷史同名無法經任何現行寫入入口造出(ADR-034), 以 restartBackend 之 seedExtra 於後端停止期間寫入(test/tools/seedExtraRows.mjs); 段尾 reseed 重建 base seed 並回驗.
    describe('run05 歷史同名(旁路寫庫; R-PRINCIPLE-00 d／g)', function() {
        this.timeout(300000)

        const fdTmp = path.join(path.dirname(fileURLToPath(import.meta.url)), '_tmp', 'e2e-array-form-run05') //測試中介資料(R: test/_tmp/<案名>/, 段尾刪除)
        let snapHist = null

        before(async function() {
            this.timeout(400000)
            const g0 = snap.grups.find((g) => g.name === '權限群組M1')
            const p0 = snap.pemis.find((p) => p.name === '權限P1')
            const u0 = snap.users.find((u) => u.name === 'peter')
            const extra = {
                grups: [
                    { ...g0, id: 'id-dup-g1', order: 10, name: 'dup-g', description: 'dup-g 1', cpemis: JSON.stringify({ '權限P1': ON5('OR') }) },
                    { ...g0, id: 'id-dup-g2', order: 11, name: 'dup-g', description: 'dup-g 2', cpemis: JSON.stringify({ '權限P2': ON5('OR') }) },
                ],
                pemis: [
                    { ...p0, id: 'id-dup-pm1', order: 10, name: 'dup-pm', description: 'dup-pm 1', crules: JSON.stringify({ [T_A]: 'y' }) },
                    { ...p0, id: 'id-dup-pm2', order: 11, name: 'dup-pm', description: 'dup-pm 2', crules: JSON.stringify({ [T_C]: 'y' }) },
                ],
                users: [
                    { ...u0, id: 'id-dup-u', order: 10, name: 'dup-u', email: 'dup-u@example.com', description: '', cgrups: JSON.stringify({ 'dup-g': ON5('OR') }) },
                ],
            }
            fs.mkdirSync(fdTmp, { recursive: true })
            const fp = path.join(fdTmp, 'seed-extra.json')
            fs.writeFileSync(fp, JSON.stringify(extra), 'utf8')
            await restartBackend('./settings.json', { seedExtra: fp })
            snapHist = await readTables()
            assert.deepEqual(snapHist.grups.filter((g) => g.name === 'dup-g').map((g) => g.id), ['id-dup-g1', 'id-dup-g2'], '前提: 庫內兩列同名 dup-g(旁路寫入)')
            assert.deepEqual(snapHist.pemis.filter((p) => p.name === 'dup-pm').map((p) => p.id), ['id-dup-pm1', 'id-dup-pm2'], '前提: 庫內兩列同名 dup-pm')
            assert.ok(snapHist.users.some((u) => u.id === 'id-dup-u'), '前提: dup-u')
        })

        after(async function() {
            this.timeout(400000)
            try {
                //收尾: 重建 base seed(spec〈清理〉: 資料庫由種子重建)並回驗——不得留下同名列
                await restartBackend('./settings.json', { reseed: true })
                let t = await readTables()
                //單一 mocha 行程全跑(npm test)時, 持有 lmdb 映射者為 mocha 行程自身, reseed 之刪庫失敗而退化為 upsert, 旁路寫入之同名列不會被移除
                //(2026-10-22 全套實測 after-hook 失敗): 仍有殘留則以 restoreTables(base 快照, 管理者寫入 RPC)還原
                if (t.grups.some((g) => g.name === 'dup-g') || t.pemis.some((p) => p.name === 'dup-pm') || t.users.some((u) => u.id === 'id-dup-u')) {
                    await restoreTables(snap)
                    t = await readTables()
                }
                assert.deepEqual([t.users.length, t.grups.length, t.pemis.length], [4, 4, 4], '收尾後三表筆數須為 base seed')
                assert.ok(!t.grups.some((g) => g.name === 'dup-g') && !t.pemis.some((p) => p.name === 'dup-pm'), '收尾後不得留下同名列')
            }
            finally {
                fs.rmSync(fdTmp, { recursive: true, force: true })
            }
        })

        //案後還原為「含歷史同名」之現況(歷史同名原樣送回不擋, R-NAME-UNIQ-02), 使下一語系之同案前提相同
        async function restoreHist() {
            await restoreTables(snapHist)
        }

        for (const lang of LANGS) {
            it(`AF-030-grups-hist-dup-save [${lang}]: (spec 流程_後台群組清單 E2E-011) 兩列同名 dup-g 之名稱儲存格橘字＋警告(warnNameHistDup, n=2); 修改 M1 說明後存檔成功, 同名兩列不變`, async function() {
                try {
                    await withPageLang(lang, async (page) => {
                        await gotoGrups(page)
                        const ks = await rowIndexesByName(page, 'dup-g')
                        assert.strict.equal(ks.length, 2)
                        const exp = await expWarn(page, 'warnNameHistDup', { n: 2 })
                        for (const k of ks) {
                            assert.strict.equal(await cellWarnTitle(page, k, 'name'), exp, '名稱儲存格警告 tooltip')
                            const color = await page.evaluate((kk) => {
                                const s = document.querySelector(`.ag-row[row-index="${kk}"] .ag-cell[col-id="name"] [title] span`)
                                return s ? getComputedStyle(s).color : null
                            }, k)
                            assert.strict.equal(color, 'rgb(245, 124, 0)', '名稱為橘色文字(#F57C00)')
                        }
                        await assertNoWarnRows(page, BASE_GRUPS, 'name', 'base seed')
                        const desc = `run05-desc-${lang}`
                        await typeIntoCell(page, await rowIndexByName(page, '權限群組M1'), 'description', desc)
                        await saveAndWaitModal(page)
                        await assertModalMsg(page, 'grupSaveGrupsSuccess')
                        assert.ok(!(await bodyHas(page, await page.evaluate(() => window.$vo.$t('errInNames')))), '不出現 errInNames')
                        const gs = await selectAll('grups')
                        assert.strict.equal(gs.find((g) => g.name === '權限群組M1').description, desc, 'M1 之說明已更新')
                        for (const id of ['id-dup-g1', 'id-dup-g2']) {
                            const g = gs.find((v) => v.id === id)
                            assert.ok(g && g.name === 'dup-g' && g.cpemis === snapHist.grups.find((v) => v.id === id).cpemis, `${id} 仍在且 cpemis 不變`)
                        }
                    })
                }
                finally {
                    await restoreHist()
                }
            })

            it(`AF-031-grups-hist-dup-add-blocked [${lang}]: (spec 流程_後台群組清單 E2E-012) 新增第三個 dup-g → 三列名稱儲存格為 grupNameDuplicate, 存檔被擋(errInNames), 筆數維持 6`, async function() {
                try {
                    await withPageLang(lang, async (page) => {
                        await gotoGrups(page)
                        await clickAdd(page)
                        await typeIntoCell(page, 0, 'name', 'dup-g')
                        const ks = await rowIndexesByName(page, 'dup-g')
                        assert.strict.equal(ks.length, 3)
                        const exp = await page.evaluate(() => window.$vo.$t('grupNameDuplicate'))
                        for (const k of ks) {
                            assert.strict.equal(await cellWarnTitle(page, k, 'name'), exp, '三列皆為擋存之 grupNameDuplicate(非 warnNameHistDup)')
                        }
                        await saveAndWaitModal(page)
                        await assertModalMsg(page, 'errInNames')
                        assert.strict.equal((await selectAll('grups')).length, 6, 'DB grups 筆數維持 6(base 4 ＋ dup-g 2)')
                    })
                }
                finally {
                    await restoreHist()
                }
            })

            it(`AF-032-pemis-hist-dup-save [${lang}]: (spec 流程_後台權限清單 E2E-011) 兩列同名 dup-pm 之名稱儲存格警告(warnNameHistDup, n=2); 修改 P1 說明後存檔成功, 同名兩列不變`, async function() {
                try {
                    await withPageLang(lang, async (page) => {
                        await gotoPemis(page)
                        const ks = await rowIndexesByName(page, 'dup-pm')
                        assert.strict.equal(ks.length, 2)
                        const exp = await expWarn(page, 'warnNameHistDup', { n: 2 })
                        for (const k of ks) {
                            assert.strict.equal(await cellWarnTitle(page, k, 'name'), exp, '名稱儲存格警告 tooltip')
                        }
                        await assertNoWarnRows(page, BASE_PEMIS, 'name', 'base seed')
                        const desc = `run05-desc-${lang}`
                        await typeIntoCell(page, await rowIndexByName(page, '權限P1'), 'description', desc)
                        await saveAndWaitModal(page)
                        await assertModalMsg(page, 'pemiSavePemisSuccess')
                        assert.ok(!(await bodyHas(page, await page.evaluate(() => window.$vo.$t('errInNames')))), '不出現 errInNames')
                        const ps = await selectAll('pemis')
                        assert.strict.equal(ps.find((p) => p.name === '權限P1').description, desc, 'P1 之說明已更新')
                        for (const id of ['id-dup-pm1', 'id-dup-pm2']) {
                            const p = ps.find((v) => v.id === id)
                            assert.ok(p && p.name === 'dup-pm' && p.crules === snapHist.pemis.find((v) => v.id === id).crules, `${id} 仍在且 crules 不變`)
                        }
                    })
                }
                finally {
                    await restoreHist()
                }
            })

            it(`AF-033-pemis-hist-dup-add-blocked [${lang}]: (spec 流程_後台權限清單 E2E-012) 新增第三個 dup-pm → 三列名稱儲存格為 pemiNameDuplicate, 存檔被擋(errInNames), 筆數維持 6`, async function() {
                try {
                    await withPageLang(lang, async (page) => {
                        await gotoPemis(page)
                        await clickAdd(page)
                        await typeIntoCell(page, 0, 'name', 'dup-pm')
                        const ks = await rowIndexesByName(page, 'dup-pm')
                        assert.strict.equal(ks.length, 3)
                        const exp = await page.evaluate(() => window.$vo.$t('pemiNameDuplicate'))
                        for (const k of ks) {
                            assert.strict.equal(await cellWarnTitle(page, k, 'name'), exp, '三列皆為擋存之 pemiNameDuplicate')
                        }
                        await saveAndWaitModal(page)
                        await assertModalMsg(page, 'errInNames')
                        assert.strict.equal((await selectAll('pemis')).length, 6, 'DB pemis 筆數維持 6')
                    })
                }
                finally {
                    await restoreHist()
                }
            })

            it(`AF-034-ambiguous-ref-dup-rows [${lang}]: (spec 流程_使用者群組關聯 E2E-014) dup-u 引用同名 dup-g: 清單與對話框兩列皆 warnRefAmbiguous; 取消一列 → 同名兩列一併取消; 存檔 → dup-g 只寫一次(OR, 停用)`, async function() {
                try {
                    await withPageLang(lang, async (page) => {
                        assert.deepEqual(await getResolvedActiveTargets(page, 'id-dup-u'), [], '儲存前: 兩列同名之內容 P1 與 P2 無共同管理對象, 交集為空(d)')
                        await gotoUsers(page)
                        const k = await rowIndexByName(page, 'dup-u')
                        const expAmb = await expWarn(page, 'warnRefAmbiguous', { names: ['dup-g'], kindKey: 'warnKindGrup' })
                        assert.strict.equal(await cellWarnTitle(page, k, 'cgrups'), expAmb, '清單 dup-u 之警告 tooltip')
                        await openColDialog(page, k, 'cgrups', 'userEditCgrups')
                        const dups = (await dlgList(page)).filter((v) => v.name === 'dup-g')
                        assert.strict.equal(dups.length, 2, '對話框含兩個 dup-g 列')
                        for (const v of dups) {
                            assert.ok(v.enable && /OR/.test(v.text), 'dup-g 列初始皆勾選、OR')
                            assert.strict.equal(await dlgWarnTitle(page, v.idx), expAmb, 'dup-g 列名稱左側警告 tooltip')
                        }
                        //run05(主責 2026-10-22 00:1x 通知: U1 改為「同名列一併切換」): 取消勾選第一個 dup-g 列時, 同名之第二列隨之取消 → 兩列恆一致,
                        //  spec 原載「只取消第一列後點 Save → warnDupRowsInconsistent 拒存」之路徑已無法由 UI 造出(拒存分支仍在 VeCgrups.doSave, 由 unit 層涵蓋), 改斷言一併切換
                        await toggleDialogEnable(page, dups[0].idx)
                        const after1 = (await dlgList(page)).filter((v) => v.name === 'dup-g')
                        assert.deepEqual(after1.map((v) => v.enable), [false, false], '取消勾選一列 → 同名兩列一併取消(恆一致)')
                        await clickDialogSave(page)
                        await waitDialogClosed(page, 'userEditCgrups')
                        await saveAndWaitModal(page)
                        await assertModalMsg(page, 'userSaveUsersSuccess')
                        const text = await readDbField('users', 'id-dup-u', 'cgrups')
                        assert.strict.equal(text.split('"dup-g"').length - 1, 1, `dup-g 只寫一次, 實得 ${text}`)
                        assert.deepEqual(JSON5.parse(text)['dup-g'], { mode: 'OR', isActive: 'n' })
                        assert.deepEqual(await getResolvedActiveTargets(page, 'id-dup-u'), [], '儲存後(引用停用)為空')
                    })
                }
                finally {
                    await restoreHist()
                }
            })
        }
    })

    // ----- h 對應鍵為名稱: spec 流程_後台使用者清單 E2E-016(需特殊後端設定) -----
    describe('run05 對應鍵為名稱(mappingBy=name; R-PRINCIPLE-00 h)', function() {
        this.timeout(300000)

        let snapMk = null

        before(async function() {
            this.timeout(400000)
            //預設對應鍵(id)下同步允許停用之同名使用者; 再以臨時設定重啟後端為 mappingBy='name'(DB 保留)
            await syncRows('users', [mkU('id-john-off', 'john', '{}', { email: 'john-off@example.com', isActive: 'n' })], F5)
            await restartBackend(genTempSettings({ mappingBy: 'name' }))
            snapMk = await readTables()
        })

        after(async function() {
            this.timeout(400000)
            await restoreTables(snap)
            await restartBackend('./settings.json')
            const t = await readTables()
            assert.deepEqual([t.users.length, t.grups.length, t.pemis.length], [4, 4, 4], '收尾後三表筆數須為 base seed')
        })

        for (const lang of LANGS) {
            it(`AF-035-mapkey-name-reactivate-blocked [${lang}]: (spec 流程_後台使用者清單 E2E-016) 兩列 john 名稱儲存格警告(既有重複不擋存); 只改 john-off 說明可存; 把 john-off 改啟用存檔 → 後端拒(userSaveUsersFail＋saveRowFieldDuplicate), DB 仍停用`, async function() {
                try {
                    await withPageLang(lang, async (page) => {
                        await gotoUsers(page)
                        const ks = await rowIndexesByName(page, 'john')
                        assert.strict.equal(ks.length, 2, '兩列 john')
                        const exp = await expWarn(page, 'warnUserNameHistDup', { n: 2 })
                        for (const k of ks) {
                            assert.strict.equal(await cellWarnTitle(page, k, 'name'), exp, '名稱儲存格警告(既有重複)')
                        }
                        const offIdx = async () => {
                            for (const k of await rowIndexesByName(page, 'john')) {
                                if (await cellText(page, k, 'email') === 'john-off@example.com') return k
                            }
                            throw new Error('找不到 john-off 列')
                        }
                        //對照: 停用列只改說明 → 成功(停用列不參與對應鍵檢查)
                        const desc = `run05-desc-${lang}`
                        await typeIntoCell(page, await offIdx(), 'description', desc)
                        await saveAndWaitModal(page)
                        await assertModalMsg(page, 'userSaveUsersSuccess')
                        await dismissResultModal(page)
                        assert.strict.equal((await selectAll('users')).find((u) => u.id === 'id-john-off').description, desc, 'john-off 之說明已更新')
                        //停用改啟用且撞名(本次造成) → 前端不攔、後端拒
                        await clickCellCheckbox(page, await offIdx(), 'isActive')
                        await saveAndWaitModal(page)
                        assert.ok(!(await bodyHas(page, await page.evaluate(() => window.$vo.$t('errInNames')))), '前端不攔截(無 errInNames)')
                        await assertModalMsg(page, 'userSaveUsersFail')
                        await assertModalMsg(page, 'saveRowFieldDuplicate')
                        assert.strict.equal((await selectAll('users')).find((u) => u.id === 'id-john-off').isActive, 'n', 'DB john-off 仍為停用')
                    })
                }
                finally {
                    await restoreTables(snapMk)
                }
            })
        }
    })

})
