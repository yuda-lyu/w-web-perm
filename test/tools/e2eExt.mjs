//run07 外部列保護(F-23)／過期快照(F-26)／引用連帶確認框之新 e2e 檔共用輔助(test/e2e-external-rows.test.mjs、test/e2e-ref-cascade.test.mjs)。
//
//為何另立新檔: e2e-setup.mjs 為全部 e2e 檔共用(改它會擴大全部 e2e 之受影響範圍, 規則帳本 R-TEST-SCOPE-01 表三), 新輔助一律寫於本檔; 本檔只 import e2e-setup／api-setup／baseSeed／e2eLib, 不被既有檔引用。
//e2e 不得 import src／server(R-TEST-SCOPE-01 盤點指令 4), 故範本代入(fillTpl)等純函數於此自寫, 語意同 src/js/externalUi.mjs:fmtVars(單趟掃描, 代入結果不再解析, 未給之佔位符原樣保留)。
//本檔刻意不含 resetDb(browser, '<表>', …) 字樣: unit-e2e-lifecycle LC-001 以該字樣盤點「用 resetDb 之 e2e 檔」, 新檔改走 readTables／restoreTables 對稱收尾(同 e2e-array-form, R-E2E-ISO-01)。
//
//夾具原則(外部列一律經真 /syncAndReplaceTabs 建立, 後台整表寫入 updateXxx 不得新增／改／刪外部列):
//  ①後台列(from 為 '')以 api-setup 之 editTableRows 經管理者寫入 RPC 建立; ②外部列以 syncRows 經真同步端點建立(以 from 為界全量取代該分區);
//  ③先建後台列、再建外部列(editTableRows 為整表寫入, 外部列尚未存在時不涉及外部列守門); ④收尾以 restoreTables 還原(先 purgeExternalRows 直接刪外部列, 再整表寫回快照)並回驗。

import assert from 'assert'
import {
    apiBaseUrl,
    launchBrowser,
    openApp,
    setLang,
    waitUntilExist,
    assertBaselineMatch,
    restartBackend,
    genTempSettings,
    clickNavItem,
    iconBtn,
    gotoUsers,
    gotoGrups,
    gotoPemis,
    getResolvedActiveTargets,
} from './e2e-setup.mjs'
import { TOKEN_APP, readTables, restoreTables, selectAllRows } from './api-setup.mjs'
import { assertPristineSeed } from './baseSeed.mjs'
import { runBaselineCase } from './e2eLib.mjs'


//—— 授權樹期望值(由 base seed 規則集依 R-AUTH-MERGE-00 推導: OR 聯集、AND 交集; 不抄實測值) ——
//  base seed: P1 啟用 { A }; P2 啟用 { C, BA, BB }; P3 啟用 { C, BB, BC }(A＝專案A/頁A/區塊A、C＝專案A/頁C、BA＝專案B/頁A/區塊A、BB＝專案B/頁A/區塊B、BC＝專案B/頁A/區塊C);
//  M1＝P1(OR)∪P2(OR)。數字隨種子變動, 種子改動時此處須同步。
export const T = {
    A: '專案A/頁A/區塊A',
    C: '專案A/頁C',
    BA: '專案B/頁A/區塊A',
    BB: '專案B/頁A/區塊B',
    BC: '專案B/頁A/區塊C',
}
export const srt = (a) => a.slice().sort()
export const TREE = {
    P1: srt([T.A]), //P1
    M1: srt([T.A, T.C, T.BA, T.BB]), //M1 = P1 ∪ P2(peter 之授權)
    P1P3: srt([T.A, T.C, T.BB, T.BC]), //P1 ∪ P3
    M1_OR_P3: srt([T.A, T.C, T.BA, T.BB, T.BC]), //M1 ∪ P3
    M1_AND_P3: srt([T.C, T.BB]), //M1 ∩ P3
    M1_AND_P1P3: srt([T.A, T.C, T.BB]), //M1 ∩ (P1 ∪ P3)
    EMPTY: [],
}
export const BASE_UIDS = ['id-for-peter', 'id-for-mary', 'id-for-john', 'id-for-admin']
export const ON = (mode = 'OR') => ({ mode, isActive: 'y' })

//列夾具(users／grups): 授權欄(cgrups／cpemis)給物件即以 JSON.stringify 存字串; 後台列須自行帶 from: ''(editTableRows 用), 外部列由 syncRows 以 from 參數蓋上
export const mkU = (id, name, cgrups, extra = {}) => ({ id, order: 200, name, email: `${name}@example.com`, description: '', isAdmin: 'n', isActive: 'y', cgrups: typeof cgrups === 'string' ? cgrups : JSON.stringify(cgrups), ...extra })
export const mkG = (id, name, cpemis, extra = {}) => ({ id, order: 200, name, description: `${name}說明`, cpemis: typeof cpemis === 'string' ? cpemis : JSON.stringify(cpemis), ...extra })

//比對夾具與庫內列用: 取使用者／群組列之內容欄(排除 order 與伺服器管理欄)
export const pickRow = (r, keys) => Object.fromEntries(keys.map((k) => [k, r[k]]))
export const PICK_U = ['id', 'name', 'email', 'description', 'from', 'cgrups', 'isAdmin', 'isActive']
export const PICK_G = ['id', 'name', 'description', 'from', 'cpemis']

//工具列圖示鈕之 mdi path(e2e-setup 之 MDI 慣例: 以 path 定位 WButtonCircle; 取自 @mdi/js 之 mdiTableHeadersEye, 欄位挑選鈕)。
//  不 import @mdi/js(其由 w-component-vue 統一提供, 非自家直接依賴); 版本更動時以 `rg -o "mdiTableHeadersEye = \"[^\"]*\"" node_modules/@mdi/js/mdi.js` 複驗, 錯誤時 showFromColumn 之 click 會逾時而非靜默通過。
export const MDI_EXT = {
    tableHeadersEye: 'M1 6V19A2 2 0 0 0 3 21H9V11H21V6A2 2 0 0 0 19 4H3A2 2 0 0 0 1 6M3 6H7V9H3M7 19H3V16H7M7 14H3V11H7M9 9V6H13V9M19 9H15V6H19M17 16A1 1 0 1 1 16 17A1 1 0 0 1 17 16M17 13A6.45 6.45 0 0 1 23 17A6.5 6.5 0 0 1 11 17A6.45 6.45 0 0 1 17 13M17 14.5A2.5 2.5 0 1 0 19.5 17A2.5 2.5 0 0 0 17 14.5',
}


//—— 語系範本 ——

//範本代入(單趟掃描; {key} → vars[key], 值不再解析, 未給之佔位符原樣保留)
export function fillTpl(tpl, vars = {}) {
    const kp = Object.create(null)
    for (const k of Object.keys(vars)) {
        kp[k] = String(vars[k])
    }
    return String(tpl).replace(/\{(\w+)\}/g, (hit, k) => (k in kp ? kp[k] : hit))
}
//以頁面語系之範本代入(範本文字一律經頁面 $t 取得, 不寫死整句; 另由呼叫端以各語系之字面片段擋範本佔位符對調)
export async function fmtT(page, key, vars = {}) {
    const tpl = await page.evaluate((k) => String(window.$vo.$t(k)), key)
    return fillTpl(tpl, vars)
}
//頁面語系之單一語系鍵文字
export async function tOf(page, key) {
    return await page.evaluate((k) => String(window.$vo.$t(k)), key)
}


//—— 夾具: 經外部同步端點(真 /syncAndReplaceTabs; app token; 以 from 為界全量取代該分區) ——

//perm-run03（外部匯入改依來源鍵 srcKey 差異同步, R-IMPORT-01）：同步端點不收 id（送 id 整批拒收 idNotAllowed），每列須帶 srcKey。
//  為使既有夾具寫法（mkU('ren-ext', …)、mkG('del-ge', …) 以 id 當夾具標籤）不必逐案改寫，本函式把夾具列之 `id` 標籤改送為 `srcKey`（列已自帶 srcKey 者不動），並丟掉 id；
//  外部列之真實 id 由伺服端產生（targets 例外：id＝srcKey），其後以 rowOf／hasRow／idOfSrc 依 srcKey（夾具標籤）找列。回傳伺服端結果 { nAdd, nUpdate, nDel, nSame }。
//  本函式為「以 from 為界的差異同步」：同一分區再送一批 → 依 srcKey 新增／修改／刪除／不變（不再整批取代）。
export async function syncRows(kt, rows, from) {
    const url = `${apiBaseUrl}/syncAndReplaceTabs?keyTable=${kt}&token=${encodeURIComponent(TOKEN_APP)}`
    const body = rows.map((v) => {
        const { id, ...rest } = v
        return { ...rest, srcKey: (typeof v.srcKey === 'string' && v.srcKey !== '') ? v.srcKey : id, from }
    })
    const res = await (await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ from, rows: body }) })).json()
    assert.ok(res.state === 'success', `夾具 ${kt}(${from}) 同步應成功, 實得 ${JSON.stringify(res)}`)
    return res.msg
}

//idOfSrc: 夾具標籤（srcKey）→ 庫內真實 id（外部列之 id 由伺服端產生; targets 之 id 即 srcKey）；找不到回 null
export async function idOfSrc(kt, srcKey) {
    const r = (await selectAllRows(kt)).find((v) => v.srcKey === srcKey)
    return r ? r.id : null
}

//清除某(表, 來源)之外部同步警示(syncWarns 為伺服端記憶體登錄, 最近一次同步無「同名異 srcKey」即清除): 以庫內該分區現有各列原樣再同步一次(同 srcKey 同名, 無重編), 供案例收尾——
//  警示殘留會使後續案例之清單頁多一條橫幅而改變版面; 無該分區之列則不動作。只適用 grups／pemis(users／targets 無偵測)
export async function clearSyncWarn(kt, from) {
    const rows = (await selectAllRows(kt)).filter((r) => r.from === from)
    if (rows.length === 0) {
        return
    }
    const SRV = ['id', 'from', 'userId', 'timeCreate', 'userIdUpdate', 'timeUpdate']
    await syncRows(kt, rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !SRV.includes(k)))), from)
}


//—— 資料庫快照與收尾(R-E2E-ISO-01) ——

//三表(users／grups／pemis; 可加 targets)現況快照: 依 id 排序之整列(含 order／更新者／時間欄), 經資料通道 select(不經瀏覽器), 供「零寫入」與「未命中之列逐位元不動」比對
export async function snapTables(kts = ['users', 'grups', 'pemis']) {
    const out = {}
    for (const kt of kts) {
        out[kt] = (await selectAllRows(kt)).slice().sort((a, b) => String(a.id).localeCompare(String(b.id)))
    }
    return out
}
//rowOf／hasRow: 以 id 找列; 外部列夾具之標籤是 srcKey（perm-run03: 外部列 id 由伺服端產生）, 故 id 找不到時再以 srcKey 找（後台列 srcKey 恆空, 不會誤中）
export function rowOf(rows, id) {
    const r = rows.find((v) => v.id === id) || rows.find((v) => v.srcKey === id)
    assert.ok(r, `應有 ${id}`)
    return r
}
export function hasRow(rows, id) {
    return rows.some((v) => v.id === id || v.srcKey === id)
}

//檔級收尾對稱: capture() 於 before 擷取三表現況(須為 pristine base seed 且無外部列), restore() 於每案 afterCase 與 after 還原並回驗筆數
//  (restoreTables: 先以 purgeExternalRows 直接刪外部列夾具, 再經管理者寫入 RPC 整表寫回快照; 見 api-setup.mjs)
export function createIsolation() {
    let snap = null
    return {
        async capture() {
            snap = await readTables()
            for (const kt of ['users', 'grups', 'pemis']) {
                assertPristineSeed(kt, snap[kt]) //主鍵集合須等於種子(前檔遺留於檔案起點即以可讀訊息失敗)
                assert.ok(snap[kt].every((r) => r.from === ''), `前提: ${kt} 之 base seed 列 from 皆為空字串(無外部列)`)
            }
            return snap
        },
        async restore() {
            if (!snap) {
                return
            }
            await restoreTables(snap)
            const t = await readTables()
            assert.deepEqual([t.users.length, t.grups.length, t.pemis.length], [snap.users.length, snap.grups.length, snap.pemis.length], '收尾後三表筆數須回到 base seed')
            assert.ok(![...t.users, ...t.grups, ...t.pemis].some((r) => typeof r.from === 'string' && r.from !== ''), '收尾後不得殘留外部列')
        },
    }
}


//—— 單一案例管線(產製端與比對端呼叫同一函數; 同 e2e-grups／e2e-users 之 runCase, 抽成共用以免各檔複製) ——
//案例宣告: { name, stages, fixture?(), settings?, run(page, lang, ctx), semantic?(page, lang), cleanup?() }
//  stages: 該案產出之全部圖鍵; 空陣列＝只驗語意不產標準圖(allowEmpty); settings: 該案需之後端設定覆寫(換設定／還原皆在本管線: 夾具建於預設後端, openPage 換設定重啟, afterCase 先還原預設再還原資料);
//  fixture: 開瀏覽器前建夾具(prepare); cleanup: afterCase 內還原資料之前之額外收尾(如清同步警示)。
export function makeRunner({ flow, iso }) {
    const picPath = (lang, name) => `./test/pics/${flow}/${flow}-${lang}-${name}.png`
    async function runCase(mode, lang, c, extra = {}) {
        return await runBaselineCase({
            mode,
            lang,
            name: c.name,
            run: (page, lg, ctx) => c.run(page, lg, ctx),
            stages: c.stages,
            allowEmpty: c.stages.length === 0,
            launch: launchBrowser,
            prepare: async () => {
                if (c.fixture) {
                    await c.fixture()
                }
            },
            openPage: async (browser) => {
                if (c.settings) {
                    await restartBackend(genTempSettings(c.settings))
                }
                const page = await openApp(browser)
                await setLang(page, lang)
                return page
            },
            semantic: c.semantic ? (ctx) => c.semantic(ctx.page, lang) : null,
            afterCase: async () => {
                try {
                    if (c.settings) {
                        await restartBackend('./settings.json') //先還原預設設定(資料庫保留), 再還原資料
                    }
                    if (c.cleanup) {
                        await c.cleanup()
                    }
                }
                finally {
                    await iso.restore()
                }
            },
            pathOf: picPath,
            labelOf: (lg, key) => `${flow}-${lg}-${key}`,
            match: assertBaselineMatch,
            ...extra,
        })
    }
    return { picPath, runCase }
}


//—— 頁面讀取 ——

//等 store 某表筆數(夾具之外部列隨資料通道廣播到前端, 較 syncState 晚到)
export async function waitStoreCount(page, key, n) {
    await waitUntilExist(page, `store ${key} 筆數為 ${n}`, (a) => ((window.$vo.$store.state[a.k] || []).length === a.n), { arg: { k: key, n }, timeout: 30000 })
    await page.waitForTimeout(500) //清單依 store 重建後 settle
}
//等 store 某表某 id 之欄位等於 value(他人／外部同步之變更推播到前端)
export async function waitStoreField(page, key, id, field, value) {
    await waitUntilExist(page, `store ${key}.${id}.${field} 已同步`, (a) => { const r = (window.$vo.$store.state[a.k] || []).find((x) => x.id === a.id); return !!r && r[a.f] === a.v }, { arg: { k: key, id, f: field, v: value }, timeout: 30000 })
    await page.waitForTimeout(300)
}

//清單頁橫幅(data-fmid="<表>-banner-<ext|warn>")各節點之文字(橫幅內唯一之 span 為文字本體; 無橫幅回 [])
export async function bannerTexts(page, kt, kind) {
    return await page.evaluate(([t, k]) => [...document.querySelectorAll(`[data-fmid="${t}-banner-${k}"]`)].map((e) => {
        const sp = e.querySelector('span')
        return ((sp ? sp.textContent : e.textContent) || '').trim()
    }), [kt, kind])
}
//某列名稱欄內鎖頭之 tooltip(span[title] 內含 svg; 無鎖頭回 []; 該列名稱欄未渲染回 null)
export async function lockTitles(page, rowIndex) {
    return await page.evaluate((k) => {
        const cell = document.querySelector(`.ag-row[row-index="${k}"] .ag-cell[col-id="name"]`)
        if (!cell) {
            return null
        }
        return [...cell.querySelectorAll('span[title]')].filter((s) => s.querySelector('svg')).map((s) => s.getAttribute('title'))
    }, rowIndex)
}
//全頁(渲染中之各列)名稱欄內鎖頭總數
export async function lockCount(page) {
    return await page.evaluate(() => [...document.querySelectorAll('.ag-row[row-index] .ag-cell[col-id="name"] span[title]')].filter((s) => s.querySelector('svg')).length)
}
//主表某列某欄之顯示文字(去首尾空白; 欄未渲染回 null)
export async function cellText(page, rowIndex, colId) {
    return await page.evaluate(([k, c]) => {
        const cell = document.querySelector(`.ag-row[row-index="${k}"] .ag-cell[col-id="${c}"]`)
        return cell ? (cell.textContent || '').trim() : null
    }, [rowIndex, colId])
}
//主表某列某欄之核選方塊狀態(無核選方塊回 null)
export async function checkboxState(page, rowIndex, colId) {
    return await page.evaluate(([k, c]) => {
        const e = document.querySelector(`.ag-row[row-index="${k}"] .ag-cell[col-id="${c}"] input[type="checkbox"]`)
        return e ? { disabled: !!e.disabled, checked: !!e.checked } : null
    }, [rowIndex, colId])
}
//真滑鼠雙擊某儲存格後, 該儲存格內之編輯器輸入框(排除列勾選框)數量: 0＝無法進入編輯。呼叫者若得 > 0 須自行按 Escape 取消(不留下編輯狀態)
export async function dblclickEditorCount(page, rowIndex, colId) {
    const sel = `.ag-row[row-index="${rowIndex}"] .ag-cell[col-id="${colId}"]`
    await page.locator(sel).first().dblclick()
    await page.waitForTimeout(800) //編輯器 mount settle(同 typeIntoCell)
    return await page.locator(`${sel} input:not([type="checkbox"])`).count()
}
export async function cancelEdit(page) {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
}
//後台列(對照組)雙擊可進入編輯: 證明「外部列雙擊無編輯器」非選擇器失靈; 驗後按 Escape 取消(不留下編輯狀態)
export async function assertEditableControl(page, rowIndex, colId, label) {
    assert.ok(await dblclickEditorCount(page, rowIndex, colId) > 0, `${label}: 後台列(對照組)雙擊應可進入編輯`)
    await cancelEdit(page)
}
//清單內某欄(以顯示文字比對, 去首尾空白)是否有等於 text 之儲存格; 名稱欄含勾選框與鎖頭, textContent 為名稱本身
export async function hasCell(page, colId, text) {
    return await page.evaluate(([c, t]) => [...document.querySelectorAll(`.ag-row[row-index] .ag-cell[col-id="${c}"]`)].some((e) => (e.textContent || '').trim() === t), [colId, text])
}
export async function waitCellGone(page, colId, text) {
    await waitUntilExist(page, `${colId}＝${text} 之列自清單移除`, (a) => ![...document.querySelectorAll(`.ag-row[row-index] .ag-cell[col-id="${a.c}"]`)].some((e) => (e.textContent || '').trim() === a.t), { arg: { c: colId, t: text }, timeout: 20000 })
    await page.waitForTimeout(500)
}
export const hasName = (page, name) => hasCell(page, 'name', name)
export const waitNameGone = (page, name) => waitCellGone(page, 'name', name)
//進入清單頁(users／grups／pemis)並等 store 載入夾具後之筆數(夾具之外部列隨資料通道廣播, 較 syncState 晚到, 只等 .ag-row 不足以保證夾具已入清單)
export async function enterPage(page, kt, n) {
    if (kt === 'users') {
        await gotoUsers(page)
    }
    else if (kt === 'grups') {
        await gotoGrups(page)
    }
    else if (kt === 'pemis') {
        await gotoPemis(page)
    }
    else {
        throw new Error(`enterPage: 未知的頁面「${kt}」`)
    }
    await waitStoreCount(page, kt, n)
}
//某儲存格(scope 內 row-index＝k、col-id＝c)之警告圖示 tooltip: 圖示為 $ui.getIcon('warning')(base64 png), title 在圖示本身或其外層; 無圖示回 null
export async function cellWarnTitle(page, k, c, scope = '') {
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
//各使用者之端到端授權(外部應用實際查到之啟用標的, 排序後陣列): { userId: [標的…] }
export async function resolvedOf(page, userIds) {
    const out = {}
    for (const id of userIds) {
        out[id] = await getResolvedActiveTargets(page, id)
    }
    return out
}


//—— 導覽與對話框 ——

//導航至標的頁(user-facing: 點左側「管理對象」導覽; e2e-targets.test.mjs 內另有一份私有版, 未收斂進 e2e-setup 以免擴大共用層範圍)
export async function gotoTargets(page) {
    const label = await page.evaluate(() => window.$vo.$t('mmTargets'))
    await clickNavItem(page, label)
    await waitUntilExist(page, '標的 ag-grid 列', () => document.querySelectorAll('.ag-row').length > 0, { timeout: 20000 })
    await page.waitForTimeout(500)
}

//最上層彈窗(確認框／結果框／對話框)之面板矩形(量測型紅框目標): 取 div[style*="overscroll-behavior"] 彈窗根中「內容(innerText)最短」者內之面板(SEL_MODAL 為其面板選擇器);
//  彈窗疊在對話框之上時(如對話框存檔失敗之訊息框)結果框之彈窗根巢狀於對話框之彈窗根內(2026-10-22 實測), 取 DOM 尾端者會是含整個對話框之外層, 故取內容最短之最內層; 只有單一彈窗時即為該彈窗。回 null(無彈窗)時 captureStableWithBox 於截圖前拋錯
export const topModalBox = {
    label: 'topModalPanel',
    measure: async (page) => await page.evaluate(() => {
        //對話框開著時, 結果框之彈窗根巢狀於對話框之彈窗根內(2026-10-22 實測: 取 DOM 尾端者會是含整個對話框之外層), 故取內容(innerText)最短之彈窗根(最內層之結果框);
        //只有單一彈窗(確認框／結果框疊在頁面上)時即為該唯一彈窗, 與取尾端相同
        const roots = [...document.querySelectorAll('div[style*="overscroll-behavior"]')].filter((r) => (r.innerText || '').trim() !== '')
        const root = roots.slice().sort((a, b) => (a.innerText || '').length - (b.innerText || '').length)[0]
        const e = root ? root.querySelector('div[tabindex="0"] > div') : null
        if (!e) {
            return null
        }
        const r = e.getBoundingClientRect()
        return { x: r.left, y: r.top, width: r.width, height: r.height }
    }),
}

//疊在對話框之上之結果框(showCheckYes: [標題, 單一訊息, 確認])之文字: 彈窗根(div[style*="overscroll-behavior"])依 DOM 序列出各自之逐行文字, 失敗時一併印出供診斷
export async function allModalRoots(page) {
    return await page.evaluate(() => [...document.querySelectorAll('div[style*="overscroll-behavior"]')].map((e) => (e.innerText || '').split('\n').map((s) => s.trim()).filter((s) => s !== '')))
}

//對話框開著時之結果框(showCheckYes 疊在對話框之上): 等訊息文字出現後, 於「含該訊息之彈窗根」中取內容最短者(巢狀時為最內層之結果框, 不取含整個對話框之外層)斷言為 [標題, 單一訊息, 確認]; 失敗訊息附各彈窗根之逐行文字
export async function expectResultBoxAbove(page, label, expText) {
    await waitUntilExist(page, label, (t) => (document.body.innerText || '').includes(t), { timeout: 20000, arg: expText })
    await page.waitForTimeout(500)
    const t = await page.evaluate(() => ({ sys: window.$vo.$t('systemMessage'), ok: window.$vo.$t('ok') }))
    const roots = await allModalRoots(page)
    const hits = roots.filter((ls) => ls.includes(expText))
    assert.ok(hits.length > 0, `${label}: 找不到含訊息之彈窗根, 各彈窗根=${JSON.stringify(roots)}`)
    const inner = hits.slice().sort((a, b) => a.join('').length - b.join('').length)[0]
    assert.deepEqual(inner, [t.sys, expText, t.ok], `${label}: 結果框應為單一訊息＋確認鈕, 各彈窗根=${JSON.stringify(roots)}`)
}

//經欄位挑選(工具列「顯示欄位」鈕之彈窗)顯示「來源」(from)欄: 點挑選鈕 → 點「來源」項 → 等欄出現 → 點工具列右側空白關彈窗(WPopup 點外部關閉); 清單頁預設隱藏 from 欄
export async function showFromColumn(page, kt) {
    const label = await tOf(page, 'from')
    await iconBtn(page, MDI_EXT.tableHeadersEye).first().click()
    const item = page.getByText(label, { exact: true })
    await item.first().waitFor({ state: 'visible', timeout: 10000 })
    await item.first().click()
    await waitUntilExist(page, 'from 欄表頭出現', () => !!document.querySelector('.ag-header-cell[col-id="from"]'), { timeout: 15000 })
    await page.waitForTimeout(500)
    const box = await page.locator(`[data-fmid="${kt}-toolbar"]`).first().boundingBox()
    await page.mouse.click(box.x + box.width - 24, box.y + box.height / 2)
    await page.waitForTimeout(600)
}
