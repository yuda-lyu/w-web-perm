//外部列保護(F-23)與過期快照(F-26)e2e(run07; 使用者 2026-10-21 裁示「開了外部同步就以外部為主」)。對應 spec/流程_外部列保護與過期快照.md(E2E-001～026; 案號與本檔 CASES 之 E2E-NNN 一一對應; run11 改寫 E2E-012、新增 E2E-016～026; perm-run02 2026-10-23 改寫 E2E-011～013 為「先於對話框勾選形成草稿 → 他人改表 → 等過期提示 → 存檔被拒」, 因 perm-run01 起對話框無未存修改時推播即重建並更新基準, 原「不編輯即等他人改表再勾選存檔」會成功而非被拒)。
//雙模式：
//  - 產 baseline：node test/e2e-external-rows.test.mjs --baseline （寫 test/pics/external-rows/; 2026-10-22 run07 N2 已產製 6 案 × 2 語系 × 11 張並逐張目視審畢; 產製端單案失敗不中斷整批, 結尾彙整失敗案例並以非 0 結束）
//  - 驗證（mocha）：npx mocha test/e2e-external-rows.test.mjs --reporter list --timeout 300000
//  手術式重產（截圖前篩選; 規格同 e2e-grups 檔頭）：--names <項,...>（可帶 eng-／cht- 前綴；階段圖鍵只寫該張；案例鍵或其編號前綴寫該案全部階段）／--langs <eng,cht>／--write-mode missing|changed／env E2E_BASELINE_OUT_DIR=<dir>
//  產製端與比對端呼叫同一案例管線（test/tools/e2eExt.mjs:makeRunner → runBaselineCase）：夾具（開瀏覽器前; 外部列經真 /syncAndReplaceTabs 建立）→ fresh browser →（需特殊 settings 者換後端設定）開頁切語系 →
//  流程截圖與流程中語意斷言 → 結尾語意斷言（兩端皆於寫檔／比對之前；不過則該案一張都不寫）→ 產製端依篩選寫檔／比對端比對標準圖 → 還原預設 settings → 還原資料（restoreTables）。
//
//本檔原則：語意斷言為主, 標準圖為輔——只在「真有新畫面」之步驟宣告圖鍵(E2E-001／004／006／007／010／011 共 6 案、每語系 11 張; 其餘 9 案 stages 為空, 純語意)。
//
//【輸入空間表】(軸 × 格數; 已測／刻意不測／未測)
//  軸 A 頁面(4 格): users、grups 已測(2); pemis、targets 未測(2; 派工範圍只指定 users／grups 之 e2e——四頁共用同一套外部列實作, 判定性由 unit-externalUi／unit-externalRows／api-externalRows 涵蓋, 但真瀏覽器端之 pemis／targets 頁無 e2e; 見 spec 已知落差「pemis／targets 頁未設 e2e」)
//  軸 B 外部列保護之使用者可觀察面(10 格): 鎖頭＋tooltip(001、007)、橫幅(001、007)、name／email／description 不可編(002、007)、isAdmin／isActive 核選方塊 disabled(002)、from 欄不可編(003)、
//        勾選含外部列之刪除過濾提示(004、009)、全為外部列之刪除(005)、複製外部列之 from 重置(006)、指派欄可改(008、013)、與外部來源撞名之提示(015) → 10 格全測
//  軸 C 同步警示橫幅(3 格): 有警示(010)、重新同步後消失(010)、無警示時不渲染(001、007 之 warn 橫幅為 0) → 全測
//  軸 D 過期快照(F-26)對話框路徑(5 格; perm-run02 起三案皆須先勾選形成草稿, 才會「保留草稿、凍結基準、存檔被拒」): 後台列被他人改而拒存(011)、外部列被同步改而拒存(013)、拒存後保留對話框且可再按(011)、重開框以新基準可存(013)、開框後新增之外部列／後台列使存檔被拒、重開框後存檔仍在(012) → 全測;
//        清單頁(非對話框)之過期快照路徑由軸 G(run11)涵蓋
//  軸 E 設定 lockExternalRows(2 格): 'y' 預設(001～013、015)、'n'(014) → 全測
//  軸 F 語系(2 格): eng、cht → 全測(每案兩語系)
//  軸 G 多人同時編輯(R-PRINCIPLE-00 原則 7; run11 新增, 9 格): 四清單頁各一(016 users 同列／017 grups 他列／018 pemis 他人新增列／019 targets 他人刪除列)、兩反向對話框各一(020、021)、外部同步內容未變不擋(022)、無草稿照舊重建(023)、語系切換後表頭仍更新(024); 全測。
//  已測案例 26 × 語系 2 = 52 個 it(標準圖 8 案: run07 6 案 ＋ run11 E2E-016、020 各 1 張／語系)。
//
//夾具(皆以外部來源 from 為界之真同步端點建立; 外部列 id 標籤／名稱前綴 xr／ext-, 不撞他檔夾具): 使用者 ext-u1(cgrups 引用 權限群組M2)、ext-u2、ext-u3(引用 ext-g1); 群組 ext-g1(cpemis 含 權限P1)、ext-g2;
//  後台列夾具由管理者寫入 RPC(editTableRows)先於外部列建立。收尾 restoreTables(purgeExternalRows 直刪外部列夾具 → 整表寫回快照)並回驗筆數與無外部列殘留(R-E2E-ISO-01)。
//perm-run03(外部匯入改依來源鍵 srcKey 差異同步, R-IMPORT-01): 外部列夾具之 id 標籤(id-xr-u1 等)是送入同步端點之 srcKey(syncRows 改送 srcKey 並丟掉 id), 庫內外部列之真實 id 由伺服端產生、不等於標籤;
//  凡以 id 運作者(getPermUserInfor 查授權、store 欄位等待)先經 idOfSrc 取真實 id; 比對庫內外部列依 srcKey(rowOf／hasRow、PICK_UX／PICK_GX); 後台列夾具(editTableRows)id 不變。
//授權樹期望值由 base seed 規則集依 R-AUTH-MERGE-00 推導(見 test/tools/e2eExt.mjs 之 TREE), 不抄實測值。
//
//跑法註記：本檔所有時序等待皆為偵測式(waitUntilExist／waitStoreCount／expectResultBox 等), 固定 waitForTimeout 只用於前端同步重繪後之短暫 settle(同既有 e2e 檔慣例)。
import fs from 'fs'
import assert from 'assert'
import JSON5 from 'json5'
import {
    startServersOnce, cleanup, openApp, setLang, captureStableWithBox, rowBoxSel, waitUntilExist, getResolvedActiveTargets, typeIntoCell,
    MDI, iconBtn, gotoGrups, gotoPemis, checkRow, clickAdd, clickSave, saveAndWaitModal, assertModalMsg, dismissResultModal, clickModalBtn, waitModalGone, topModalLines,
    expectResultBox, rowIndexByCell, pageSaveShown, openBelongDialog, toggleDialogEnable, clickDialogSave, clickDialogClose, waitDialogClosed, waitDialogGrid, DLG_MDI, dlgBtn, dialogEnableCheckboxSel,
} from './tools/e2e-setup.mjs'
import { editTableRows, selectAllRows } from './tools/api-setup.mjs'
import { createBaselineGate, itemsUnionBox } from './tools/e2eLib.mjs'
import {
    TREE, ON, mkU, mkG, pickRow, PICK_U, PICK_G, fmtT, tOf, syncRows, idOfSrc, clearSyncWarn, snapTables, rowOf, hasRow, createIsolation, makeRunner,
    waitStoreCount, waitStoreField, bannerTexts, lockTitles, lockCount, cellText, checkboxState, dblclickEditorCount, assertEditableControl, cellWarnTitle, topModalBox, showFromColumn, expectResultBoxAbove,
    hasName, waitNameGone, enterPage, gotoTargets, T,
} from './tools/e2eExt.mjs'

const FLOW = 'external-rows'
const PICS_DIR = `./test/pics/${FLOW}`
const LANGS = ['eng', 'cht']
const isBaseline = process.argv.includes('--baseline')

//外部來源名稱(from; 各分區互不影響, 以 from 為界依 srcKey 差異同步)
const F_U = 'appExtU' //外部使用者
const F_G = 'appExtG' //外部群組
const F_W = 'appExtWarn' //同步警示(同名異 srcKey)
const F_LATE = 'appExtLate' //開對話框後才同步進來之外部使用者

const BELONG_USERS = { colId: 'belongUsers', titleKey: 'grupBlngEditUsers', label: 'VeGrupBlngUsers 對話框標題' } //群組頁開「所屬使用者」對話框(同 e2e-rela-user-grup 之 BELONG_DIALOG_OPT)

//—— 夾具 ——
const X_U1 = mkU('id-xr-u1', 'ext-u1', { '權限群組M2': ON() }, { description: '外部使用者一', order: 100 })
const X_U2 = mkU('id-xr-u2', 'ext-u2', {}, { description: '外部使用者二', order: 101 })
const X_U3 = mkU('id-xr-u3', 'ext-u3', { 'ext-g1': ON() }, { description: '外部使用者三(引用 ext-g1)', order: 102 })
const X_G1 = mkG('id-xr-g1', 'ext-g1', { '權限P1': ON() }, { description: '外部群組一', order: 100 })
const X_G2 = mkG('id-xr-g2', 'ext-g2', {}, { description: '外部群組二', order: 101 })
const fxUsers = async () => { await syncRows('users', [X_U1, X_U2], F_U) }
const fxGrups = async () => { await syncRows('grups', [X_G1, X_G2], F_G) }
//比對夾具與庫內外部列(來源由同步端點蓋上)。perm-run03(外部匯入改依 srcKey 差異同步, R-IMPORT-01): 夾具列之 id 標籤是送入同步端點之 srcKey, 庫內外部列之真實 id 由伺服端產生(不等於標籤),
//  故夾具列轉為「srcKey＝標籤」之期望列, 並以 PICK_UX／PICK_GX(PICK_U／PICK_G 之 id 換成 srcKey)取比對欄——除原有各欄外另驗庫內 srcKey 等於夾具標籤(比原本只驗 id 更強)
const asExt = (r, from) => {
    const { id, ...rest } = r
    return { ...rest, srcKey: id, from }
}
const PICK_UX = PICK_U.map((k) => (k === 'id' ? 'srcKey' : k))
const PICK_GX = PICK_G.map((k) => (k === 'id' ? 'srcKey' : k))
//各語系字面片段(擋範本佔位符對調; 期望全由範本代入時範本錯誤無從察覺)
const LIT = {
    eng: {
        notice: (n) => `${n} row(s) are synchronized from an external source`,
        lock: (from) => `Synchronized from external source "${from}"`,
        delBlocked: (n) => `${n} selected row(s) are synchronized from an external source and cannot be deleted here`,
        warn: (from, n) => `The external source "${from}" appears to have renumbered ids (${n} item(s)`,
        usedBy: (name, from) => `External source "${from}" already uses the name "${name}"`,
        stale: 'Not saved: the data changed',
        staleDraft: 'The data was updated by someone else or by an external synchronization after you started editing',
        staleDialog: 'The data was updated by someone else or by an external synchronization after this window was opened',
    },
    cht: {
        notice: (n) => `有 ${n} 筆資料由外部來源同步`,
        lock: (from) => `由外部來源「${from}」同步`,
        delBlocked: (n) => `所選資料中有 ${n} 筆由外部來源同步，無法在此刪除`,
        warn: (from, n) => `外部來源「${from}」疑似重編 id（有 ${n} 筆項目`,
        usedBy: (name, from) => `外部來源「${from}」已使用此名稱「${name}」`,
        stale: '未儲存：載入此頁面後資料已被他人或外部同步更新',
        staleDraft: '資料已被他人或外部同步更新。您尚未儲存的編輯仍保留於此',
        staleDialog: '資料已被他人或外部同步更新，本視窗內的資料已過期',
    },
}

//進入清單頁並等 store 載入夾具後之筆數: 本檔簡稱 enter(同 e2eExt.enterPage)
const enter = enterPage

//—— run11(R-PRINCIPLE-00 原則 7): 「資料已被更新」提示 ——
//清單頁橫幅 data-fmid="<表>-banner-stale"(附 "<表>-banner-stale-reload" 鈕); 反向關聯對話框提示 data-fmid="grup-blng-users-banner-stale"／"pemi-blng-grups-banner-stale"
const waitStale = (page, fmid) => waitUntilExist(page, `提示 ${fmid} 出現`, (id) => !!document.querySelector(`[data-fmid="${id}"]`), { arg: fmid, timeout: 20000 })
const waitStaleGone = (page, fmid) => waitUntilExist(page, `提示 ${fmid} 消失`, (id) => !document.querySelector(`[data-fmid="${id}"]`), { arg: fmid, timeout: 20000 })
const staleTexts = (page, fmid) => page.evaluate((id) => [...document.querySelectorAll(`[data-fmid="${id}"]`)].map((e) => ((e.querySelector('span') || e).textContent || '').trim()), fmid)
const staleCount = (page, fmid) => page.evaluate((id) => document.querySelectorAll(`[data-fmid="${id}"]`).length, fmid)
//perm-run02(E2E-011～013 共用): 群組頁「所屬使用者」對話框(VeGrupBlngUsers)已有未存勾選(草稿)、他人改表之後, 以對話框內過期提示出現作為「推播已到達」之同步訊號(偵測式, 不用固定等待;
//提示以 v-for 渲染, 無則不存在節點), 再核對提示恰一條、文字＝staleDraftNoticeDialog(並含各語系字面片段)
const FM_BLNG_USERS_STALE = 'grup-blng-users-banner-stale'
async function expectUsersDialogStale(page, lang) {
    await waitStale(page, FM_BLNG_USERS_STALE)
    const texts = await staleTexts(page, FM_BLNG_USERS_STALE)
    assert.deepEqual(texts, [await tOf(page, 'staleDraftNoticeDialog')], '對話框內過期提示應恰一條且文字為 staleDraftNoticeDialog')
    assert.ok(texts[0].includes(LIT[lang].staleDialog), `提示應含字面片段「${LIT[lang].staleDialog}」`)
}
//store 某表陣列之參照(推播以新陣列取代整表): 先記下、再等參照改變——用於「外部同步內容未變之整批重寫」(無欄位值可等)
const markStoreRef = (page, kt) => page.evaluate((k) => { window.__xrRef = window.$vo.$store.state[k] }, kt)
const waitStoreRefChanged = (page, kt) => waitUntilExist(page, `store ${kt} 已被推播更新(參照改變)`, (k) => window.$vo.$store.state[k] !== window.__xrRef, { arg: kt, timeout: 30000 })

//—— run12(自己儲存引起之推播; 規則帳本 R-RELOAD-GUARD-01、R-DRAFT-KEEP-01): 人為固定推播與儲存回應抵達之時刻 ——
//以下為 setup 手段(模擬網路時序, 不是使用者動作): 推播本身是真實的(伺服端寫入後約 2 秒輪詢送來之整表), 只是攔住或延後套用, 使「窗口」必然命中而不靠碰運氣。
//holdPushes: 攔住 store 之資料推播(整表以新陣列取代)而不套用, 緩存於 window.__heldPushes
const holdPushes = (page) => page.evaluate(() => {
    const st = window.$vo.$store
    window.__heldPushes = []
    window.__pairDone = false
    window.__origCommit = st.commit
    st.commit = function(type, payload, ...rest) {
        if (payload && typeof payload.tableName === 'string' && Array.isArray(payload.data)) {
            window.__heldPushes.push({ type, payload })
            return undefined
        }
        return window.__origCommit.call(st, type, payload, ...rest)
    }
})
//releasePushes: 停止攔截並放行: 先依序套用全部被攔住之推播, 再套用一筆「內容相同、陣列為新參照」之 kt 表推播——兩次重建相隔不到 20ms(實測 AF-037 之失敗時序:
//權限改名連帶更新群組引用端, grups 與 pemis 兩張表先後推播相隔約 17ms)。第二筆之時刻要點(對應實測時序: ag-grid 對第一次重建之 rowDataUpdated 事件已派發、第一次重建的 1ms 解除計時器尚未觸發):
//先 Promise.resolve().then(…) 讓第一次重建之 Vue 更新(微任務)跑完, 再於其中登記 setTimeout(0)——該計時器的到期早於「第一次重建之 nextTick 回呼所登記的 1ms 計時器」(後者於微任務末段才登記、再 +1ms),
//且晚於 ag-grid 在更新中登記的事件派發計時器; 第二次重建之渲染耗時遠大於 1ms, 故舊實作之第 1 次計時器必於第二次重建之事件之前觸發而提早解除旗標
const releasePushes = (page, kt) => page.evaluate((k) => {
    const st = window.$vo.$store
    st.commit = window.__origCommit
    const held = window.__heldPushes
    window.__heldPushes = []
    for (const h of held) {
        st.commit(h.type, h.payload)
    }
    const last = held.filter((h) => h.payload.tableName === k).pop()
    Promise.resolve().then(() => {
        setTimeout(() => {
            st.commit(last.type, { ...last.payload, data: last.payload.data.slice() })
            window.__pairDone = true
        }, 0)
    })
}, kt)
//holdSaveResponse: 包裝 $fapi.<fn>(如 updateUsers): 請求照常送出、伺服端照常寫入, 但把回應扣住直到 releaseSaveResponse(模擬回應較慢; 其間輪詢推播必然抵達)
const holdSaveResponse = (page, fn) => page.evaluate((f) => {
    const api = window.$vo.$fapi
    const orig = api[f]
    window.__saveHold = { written: false, release: null }
    api[f] = function(...a) {
        return orig.apply(this, a).then((r) => new Promise((resolve) => {
            window.__saveHold.written = true
            window.__saveHold.release = () => resolve(r)
        }))
    }
}, fn)
const waitSaveWritten = (page) => waitUntilExist(page, '儲存請求已由伺服端寫入(回應被扣住)', () => !!window.__saveHold && window.__saveHold.written === true, { timeout: 30000 })
const releaseSaveResponse = (page) => page.evaluate(() => window.__saveHold.release())
const BELONG_GRUPS = { colId: 'belongGrups', titleKey: 'pemiBlngEditGrups', label: 'VePemiBlngGrups 對話框標題' } //權限頁開「所屬群組」對話框(同 e2e-rela-grup-pemi 之 BELONG_DIALOG_OPT)

//case 定義（順序＝產製順序＝mocha it 順序）：stages 為該案產出之全部圖鍵（空陣列＝純語意案例）；fixture 於開瀏覽器前建夾具；settings 為該案需之後端設定覆寫；
//run(page,lang) 走流程並回傳截圖（可含流程中語意斷言）；semantic(page,lang) 為結尾語意斷言，產製端與比對端皆於寫檔／比對之前執行
const CASES = [
    {
        //E2E-001(spec 流程_外部列保護與過期快照 E2E-001): 使用者頁含外部使用者列 → 清單上方出現「N 筆資料由外部來源同步」橫幅、外部列名稱欄帶鎖頭(tooltip 含來源名)、後台列無鎖頭。
        //6 步 user path: ①(進場路徑見 e2e-users E2E-001)使用者頁 ②看到橫幅(筆數＝外部列數) ③看到外部列名稱欄之鎖頭 ④(tooltip 為原生 title, 無法截圖, 以屬性語意斷言) ⑤對照後台列無鎖頭 ⑥無同步警示橫幅
        //圖: 兩張皆為「進入頁面後之反應」(觀察步驟, 無點擊前圖): ①框住橫幅 ②框住外部列名稱儲存格(鎖頭與名稱)
        name: 'E2E-001-users-lock-banner',
        stages: ['E2E-001-1-banner', 'E2E-001-2-lock-cell'],
        fixture: fxUsers,
        run: async (page) => {
            await enter(page, 'users', 6) //base 4 + 外部 2
            await waitUntilExist(page, '外部列橫幅', () => !!document.querySelector('[data-fmid="users-banner-ext"]'), { timeout: 20000 })
            const s1 = await captureStableWithBox(page, itemsUnionBox('[data-fmid="users-banner-ext"]', { fit: true })) //結果: 清單上方出現外部列提示橫幅(框住橫幅整條; 緊貼上方工具列與下方表頭, 經 fit 取間隙)
            const k = await rowIndexByCell(page, 'name', 'ext-u1')
            const s2 = await captureStableWithBox(page, itemsUnionBox(page.locator(`.ag-row[row-index="${k}"] .ag-cell[col-id="name"]`).first(), { fit: true })) //結果: 外部列名稱欄帶鎖頭(框住該儲存格之鎖頭與名稱)
            return [
                { name: 'E2E-001-1-banner', buf: s1 },
                { name: 'E2E-001-2-lock-cell', buf: s2 },
            ]
        },
        semantic: async (page, lang) => {
            //spec E2E-001 驗證1: 橫幅文字＝externalRowsNotice 代入外部列數 2(單一橫幅; 無警示橫幅)
            const banners = await bannerTexts(page, 'users', 'ext')
            assert.deepEqual(banners, [await fmtT(page, 'externalRowsNotice', { n: 2 })], '使用者頁應有一條外部列橫幅, 文字為 externalRowsNotice(n=2)')
            assert.ok(banners[0].includes(LIT[lang].notice(2)), `橫幅文字應含字面片段「${LIT[lang].notice(2)}」(實得 ${banners[0]})`)
            assert.deepEqual(await bannerTexts(page, 'users', 'warn'), [], '無同步警示時不得渲染警示橫幅')
            //spec E2E-001 驗證2: 外部列(ext-u1、ext-u2)名稱欄恰有一個鎖頭, tooltip＝externalRowLocked 代入來源名; 後台列無鎖頭
            const wantTitle = await fmtT(page, 'externalRowLocked', { from: F_U })
            assert.ok(wantTitle.includes(LIT[lang].lock(F_U)), `鎖頭 tooltip 應含字面片段「${LIT[lang].lock(F_U)}」(實得 ${wantTitle})`)
            for (const nm of ['ext-u1', 'ext-u2']) {
                assert.deepEqual(await lockTitles(page, await rowIndexByCell(page, 'name', nm)), [wantTitle], `${nm} 名稱欄應有一個鎖頭且 tooltip 含來源名`)
            }
            for (const nm of ['peter', 'mary', 'john', 'admin']) {
                assert.deepEqual(await lockTitles(page, await rowIndexByCell(page, 'name', nm)), [], `後台列 ${nm} 不得有鎖頭`)
            }
            assert.equal(await lockCount(page), 2, '全頁鎖頭總數＝外部列數 2')
        },
    },
    {
        //E2E-002: 外部使用者列之 name／email／description 儲存格雙擊後不進入編輯、isAdmin／isActive 核選方塊 disabled、指派欄(權限群組按鈕)仍可點; 後台列照常可編(對照組)。純語意。
        //6 步 user path: ①使用者頁 ②雙擊外部列 name／email／description 儲存格 ③看不到編輯框 ④看到外部列 isAdmin／isActive 核選方塊為灰(disabled) ⑤後台列(peter)雙擊 name 可編、核選方塊可點 ⑥外部列「權限群組」按鈕可點(指派欄後台可改); 全程無修改, 儲存鈕不出現
        name: 'E2E-002-users-readonly-cells',
        stages: [],
        fixture: fxUsers,
        run: async (page) => {
            await enter(page, 'users', 6)
            const k1 = await rowIndexByCell(page, 'name', 'ext-u1')
            const k2 = await rowIndexByCell(page, 'name', 'ext-u2')
            const kp = await rowIndexByCell(page, 'name', 'peter')
            //spec E2E-002 驗證1「外部列 name／email／description 不可編」: 真滑鼠雙擊後, 該儲存格內無編輯器輸入框(排除列勾選框)
            for (const col of ['name', 'email', 'description']) {
                assert.equal(await dblclickEditorCount(page, k1, col), 0, `外部列 ext-u1 之 ${col} 雙擊後不得進入編輯`)
            }
            assert.equal(await dblclickEditorCount(page, k2, 'name'), 0, '外部列 ext-u2 之 name 雙擊後不得進入編輯')
            //spec E2E-002 驗證2「後台列照常可編」: peter 之 name 雙擊可進入編輯(對照組, 證明上列「無編輯器」非選擇器失靈)
            await assertEditableControl(page, kp, 'name', 'peter.name')
            //spec E2E-002 驗證3「isAdmin／isActive 核選方塊 disabled(外部列)、可點(後台列)」
            for (const k of [k1, k2]) {
                for (const col of ['isAdmin', 'isActive']) {
                    const st = await checkboxState(page, k, col)
                    assert.ok(st && st.disabled === true, `外部列(row ${k})之 ${col} 核選方塊應 disabled(實得 ${JSON.stringify(st)})`)
                }
            }
            for (const col of ['isAdmin', 'isActive']) {
                const st = await checkboxState(page, kp, col)
                assert.ok(st && st.disabled === false, `後台列 peter 之 ${col} 核選方塊應可點(實得 ${JSON.stringify(st)})`)
            }
            //spec E2E-002 驗證4「指派欄後台可改」: 外部列之 cgrups 欄按鈕存在且可點
            const btn = page.locator(`.ag-row[row-index="${k1}"] .ag-cell[col-id="cgrups"] button`)
            assert.equal(await btn.count(), 1, 'ext-u1 之 cgrups 欄應有一個按鈕')
            assert.equal(await btn.first().isDisabled(), false, 'ext-u1 之 cgrups 欄按鈕應可點(指派欄後台可寫)')
            //全程無修改: 清單頁不出現儲存鈕
            assert.equal(await pageSaveShown(page), false, '只做唯讀檢查, 清單頁不應出現儲存鈕')
            return null
        },
        semantic: async () => {
            //庫內夾具未被動到(逐欄等於夾具)
            const us = await selectAllRows('users')
            assert.deepEqual(pickRow(rowOf(us, 'id-xr-u1'), PICK_UX), pickRow(asExt(X_U1, F_U), PICK_UX), 'ext-u1 庫內不變')
            assert.deepEqual(pickRow(rowOf(us, 'id-xr-u2'), PICK_UX), pickRow(asExt(X_U2, F_U), PICK_UX), 'ext-u2 庫內不變')
        },
    },
    {
        //E2E-003: 經欄位挑選顯示「來源」(from)欄 → 外部列之來源欄顯示來源名、後台列為空; 該欄對所有列皆不可編(雙擊不進入編輯)。純語意。
        //6 步 user path: ①使用者頁 ②點工具列「顯示欄位」鈕 ③勾「來源」④看到來源欄(外部列顯示來源名) ⑤雙擊外部列／後台列之來源儲存格 ⑥看不到編輯框
        name: 'E2E-003-users-from-col-readonly',
        stages: [],
        fixture: fxUsers,
        run: async (page) => {
            await enter(page, 'users', 6)
            assert.equal(await page.locator('.ag-header-cell[col-id="from"]').count(), 0, '前提: 來源欄預設隱藏')
            await showFromColumn(page, 'users')
            const k1 = await rowIndexByCell(page, 'name', 'ext-u1')
            const kp = await rowIndexByCell(page, 'name', 'peter')
            //spec E2E-003 驗證1: 外部列之來源欄顯示來源名、後台列為空(儲存格須已渲染, 否則下列「無編輯器」會空轉)
            assert.equal(await cellText(page, k1, 'from'), F_U, 'ext-u1 之來源欄應顯示來源名')
            assert.equal(await cellText(page, kp, 'from'), '', '後台列 peter 之來源欄應為空')
            //spec E2E-003 驗證2: 來源欄對所有列皆不可編(後台新增列之 from 恆為空, 外部列之 from 由外部擁有)
            assert.equal(await dblclickEditorCount(page, k1, 'from'), 0, '外部列之來源欄雙擊不得進入編輯')
            assert.equal(await dblclickEditorCount(page, kp, 'from'), 0, '後台列之來源欄雙擊亦不得進入編輯')
            assert.equal(await pageSaveShown(page), false, '只做唯讀檢查, 清單頁不應出現儲存鈕')
            return null
        },
        semantic: async () => {
            const us = await selectAllRows('users')
            assert.equal(rowOf(us, 'id-xr-u1').from, F_U, 'ext-u1 之來源庫內不變')
            assert.equal(rowOf(us, 'id-for-peter').from, '', 'peter 之來源庫內不變')
        },
    },
    {
        //E2E-004: 使用者頁同時勾選外部列(ext-u1)與後台列(bk-u1)後按「刪除勾選」→ 先彈警告框(externalRowDelBlocked, n=1, 單一訊息＋確認鈕) → 按確認 → 僅後台列自清單移除、外部列仍在 → 按儲存 → 資料庫僅後台列被刪。
        //6 步 user path: ①使用者頁 ②勾選 bk-u1 與 ext-u1 兩列 ③點「刪除勾選」鈕 ④看到警告框(已略過 1 筆外部列) ⑤按確認, bk-u1 自清單移除、ext-u1 仍在、出現儲存鈕 ⑥按儲存, 成功後庫內無 bk-u1、外部列不變
        //圖: ①點擊前框住刪除鈕 ②框住警告框(整個彈窗面板)
        name: 'E2E-004-users-delete-mixed',
        stages: ['E2E-004-1-click-delete', 'E2E-004-2-blocked-box'],
        fixture: async () => {
            await editTableRows('users', (rows) => [...rows, mkU('id-xr-bk1', 'bk-u1', {}, { description: '後台列', from: '', order: 0 })]) //後台列先建
            await fxUsers()
        },
        run: async (page, lang) => {
            await enter(page, 'users', 7) //base 4 + bk-u1 + 外部 2
            const kb = await rowIndexByCell(page, 'name', 'bk-u1')
            const kx = await rowIndexByCell(page, 'name', 'ext-u1')
            await checkRow(page, kb)
            await checkRow(page, kx)
            const s1 = await captureStableWithBox(page, iconBtn(page, MDI.trash).first()) //點擊前: 框住刪除鈕
            await iconBtn(page, MDI.trash).first().click()
            const msg = await fmtT(page, 'externalRowDelBlocked', { n: 1 })
            await expectResultBox(page, '外部列刪除警告框', msg) //單一訊息＋確認鈕(showCheckYes 警告, 非否／是之確認框)
            assert.ok(msg.includes(LIT[lang].delBlocked(1)), `警告框文字應含字面片段「${LIT[lang].delBlocked(1)}」(實得 ${msg})`)
            const s2 = await captureStableWithBox(page, topModalBox) //結果: 警告框(框住整個彈窗面板)
            await clickModalBtn(page, 'ok')
            await waitModalGone(page, '警告框關閉', msg)
            //spec E2E-004 驗證2: 按確認後僅後台列被移除(只自清單; 尚未寫入), 外部列仍在, 出現儲存鈕, 無確認框
            await waitNameGone(page, 'bk-u1')
            assert.equal(await hasName(page, 'ext-u1'), true, '外部列 ext-u1 仍在清單')
            assert.equal(await hasName(page, 'ext-u2'), true, '外部列 ext-u2 仍在清單')
            assert.deepEqual(await topModalLines(page), [], '警告框關閉後不應再出現確認框(後台列未被任何引用, 直接移除)')
            assert.equal(await pageSaveShown(page), true, '刪除後清單頁出現儲存鈕(已修改)')
            const us0 = await selectAllRows('users')
            assert.ok(hasRow(us0, 'id-xr-bk1'), '未按儲存前庫內仍有 bk-u1(只自清單移除)')
            //spec E2E-004 驗證3: 按儲存成功; 庫內僅後台列被刪, 外部列逐欄不變
            await saveAndWaitModal(page)
            await assertModalMsg(page, 'userSaveUsersSuccess')
            await dismissResultModal(page)
            return [
                { name: 'E2E-004-1-click-delete', buf: s1 },
                { name: 'E2E-004-2-blocked-box', buf: s2 },
            ]
        },
        semantic: async () => {
            const us = await selectAllRows('users')
            assert.ok(!hasRow(us, 'id-xr-bk1'), '庫內 bk-u1 應已刪除')
            assert.deepEqual(pickRow(rowOf(us, 'id-xr-u1'), PICK_UX), pickRow(asExt(X_U1, F_U), PICK_UX), '外部列 ext-u1 逐欄不變')
            assert.deepEqual(pickRow(rowOf(us, 'id-xr-u2'), PICK_UX), pickRow(asExt(X_U2, F_U), PICK_UX), '外部列 ext-u2 逐欄不變')
            assert.equal(us.length, 6, '庫內 base 4 + 外部 2')
        },
    },
    {
        //E2E-005: 使用者頁只勾選外部列(ext-u1、ext-u2)後按「刪除勾選」→ 彈警告框(n=2) → 按確認 → 無任何列被刪除、不出現確認框、不出現儲存鈕。純語意。
        name: 'E2E-005-users-delete-external-only',
        stages: [],
        fixture: fxUsers,
        run: async (page) => {
            await enter(page, 'users', 6)
            await checkRow(page, await rowIndexByCell(page, 'name', 'ext-u1'))
            await checkRow(page, await rowIndexByCell(page, 'name', 'ext-u2'))
            await iconBtn(page, MDI.trash).first().click()
            const msg = await fmtT(page, 'externalRowDelBlocked', { n: 2 })
            await expectResultBox(page, '外部列刪除警告框', msg)
            await clickModalBtn(page, 'ok')
            await waitModalGone(page, '警告框關閉', msg)
            await page.waitForTimeout(800)
            //spec E2E-005 驗證: 全為外部列 → 僅提示、不刪除任何列、不進入刪除流程(無確認框)、不出現儲存鈕
            assert.deepEqual(await topModalLines(page), [], '警告框關閉後不應出現任何彈窗')
            assert.equal(await hasName(page, 'ext-u1'), true, 'ext-u1 仍在清單')
            assert.equal(await hasName(page, 'ext-u2'), true, 'ext-u2 仍在清單')
            assert.equal(await pageSaveShown(page), false, '無任何變更, 清單頁不應出現儲存鈕')
            return null
        },
        semantic: async () => {
            const us = await selectAllRows('users')
            assert.equal(us.length, 6, '庫內筆數不變(base 4 + 外部 2)')
            assert.ok(hasRow(us, 'id-xr-u1') && hasRow(us, 'id-xr-u2'), '外部列皆在庫內')
        },
    },
    {
        //E2E-006: 使用者頁勾選外部列(ext-u1)後按「複製」→ 新列(最首)名稱帶「複製」後綴、無鎖頭(from 為空, 屬後台新增列)、來源列仍有鎖頭 → 改唯一 email 後儲存成功 → 庫內新列 from 為空、外部列不變。
        //6 步 user path: ①使用者頁 ②勾選 ext-u1 ③點「複製」鈕 ④看到新列插於最首, 無鎖頭(來源列仍有鎖頭) ⑤雙擊新列 email 改為唯一值(避免與來源 email 重複) ⑥按儲存, 成功; 庫內新列 from 為空
        //圖: ①點擊前框住複製鈕 ②框住新列(最首列)
        name: 'E2E-006-users-copy-external',
        stages: ['E2E-006-1-click-copy', 'E2E-006-2-copied'],
        fixture: fxUsers,
        run: async (page) => {
            await enter(page, 'users', 6)
            const kx = await rowIndexByCell(page, 'name', 'ext-u1')
            await checkRow(page, kx)
            const s1 = await captureStableWithBox(page, iconBtn(page, MDI.copy).first()) //點擊前: 框住複製鈕(僅勾選一列時才出現)
            await iconBtn(page, MDI.copy).first().click()
            await page.waitForTimeout(700)
            //spec E2E-006 驗證1: 新列插於最首、名稱含來源名稱且不同(複製後綴)、無鎖頭; 來源列(下移一列)仍有鎖頭
            const name0 = await cellText(page, 0, 'name')
            assert.ok(name0 && name0.includes('ext-u1') && name0 !== 'ext-u1', `新列名稱應為來源名稱加複製後綴(實得 ${name0})`)
            assert.deepEqual(await lockTitles(page, 0), [], '複製出之新列為後台新增列, 不得有鎖頭')
            const kx2 = await rowIndexByCell(page, 'name', 'ext-u1')
            assert.equal((await lockTitles(page, kx2)).length, 1, '來源之外部列仍有鎖頭')
            const s2 = await captureStableWithBox(page, rowBoxSel(0)) //結果: 新列(最首列; 無鎖頭)
            //改唯一 email(複製列 email 與來源同, 使用者頁 email 重複為擋存之錯誤, 見 e2e-users E2E-004)
            await typeIntoCell(page, 0, 'email', 'ext-u1-copy@example.com')
            await saveAndWaitModal(page)
            await assertModalMsg(page, 'userSaveUsersSuccess')
            await dismissResultModal(page)
            return [
                { name: 'E2E-006-1-click-copy', buf: s1 },
                { name: 'E2E-006-2-copied', buf: s2 },
            ]
        },
        semantic: async () => {
            //spec E2E-006 驗證2: 庫內多出一列後台列(from 為空; 沿用來源之說明與授權), 外部列 ext-u1 逐欄不變
            const us = await selectAllRows('users')
            const copies = us.filter((r) => r.srcKey !== 'id-xr-u1' && r.description === X_U1.description) //排除來源之外部列(依 srcKey: 其真實 id 由伺服端產生, 不等於標籤)
            assert.equal(copies.length, 1, '庫內應恰有一列由 ext-u1 複製而來之新列')
            assert.equal(copies[0].from, '', '複製出之新列 from 應為空(後台列, 非外部列)')
            assert.equal(copies[0].srcKey || '', '', '複製出之新列 srcKey 應為空(來源鍵屬外部身分欄, 後台列恆空, 不繼承外部列之來源鍵; 否則伺服端 saveFromNotAllowed)')
            assert.equal(copies[0].cgrups, X_U1.cgrups, '複製列沿用來源之授權設定')
            assert.deepEqual(pickRow(rowOf(us, 'id-xr-u1'), PICK_UX), pickRow(asExt(X_U1, F_U), PICK_UX), '外部列 ext-u1 逐欄不變')
            assert.equal(us.length, 7, '庫內 base 4 + 外部 2 + 新列 1')
        },
    },
    {
        //E2E-007: 群組頁含外部群組 → 橫幅(N 筆, externalRowsNotice)、外部群組名稱欄鎖頭(tooltip 含來源名)、name／description 不可編、後台群組照常可編; 外部群組之 cpemis／belongUsers 按鈕仍可點。
        //6 步 user path: ①(進場路徑見 e2e-grups E2E-001)群組頁 ②看到橫幅 ③看到外部群組之鎖頭 ④雙擊外部群組 name／description 無編輯框 ⑤後台群組(M1)雙擊 name 可編 ⑥外部群組之兩個關聯欄按鈕可點; 全程無修改
        //圖: 同 E2E-001(①框住橫幅 ②框住外部群組名稱儲存格)
        name: 'E2E-007-grups-lock-banner',
        stages: ['E2E-007-1-banner', 'E2E-007-2-lock-cell'],
        fixture: fxGrups,
        run: async (page, lang) => {
            await enter(page, 'grups', 6) //base 4 + 外部 2
            await waitUntilExist(page, '外部列橫幅', () => !!document.querySelector('[data-fmid="grups-banner-ext"]'), { timeout: 20000 })
            const s1 = await captureStableWithBox(page, itemsUnionBox('[data-fmid="grups-banner-ext"]', { fit: true })) //結果: 外部群組提示橫幅
            const k1 = await rowIndexByCell(page, 'name', 'ext-g1')
            const s2 = await captureStableWithBox(page, itemsUnionBox(page.locator(`.ag-row[row-index="${k1}"] .ag-cell[col-id="name"]`).first(), { fit: true })) //結果: 外部群組名稱欄之鎖頭與名稱
            //spec E2E-007 驗證2「不可改名／說明」: 外部群組 name／description 雙擊後無編輯器; 後台群組(對照組)可編
            assert.equal(await dblclickEditorCount(page, k1, 'name'), 0, '外部群組 ext-g1 之 name 雙擊後不得進入編輯(不可改名)')
            assert.equal(await dblclickEditorCount(page, k1, 'description'), 0, '外部群組 ext-g1 之 description 雙擊後不得進入編輯')
            const km = await rowIndexByCell(page, 'name', '權限群組M1')
            await assertEditableControl(page, km, 'name', '權限群組M1.name')
            //spec E2E-007 驗證3「指派欄與關聯入口仍可點」: 外部群組 cpemis／belongUsers 欄各有一個可點之按鈕
            for (const col of ['cpemis', 'belongUsers']) {
                const btn = page.locator(`.ag-row[row-index="${k1}"] .ag-cell[col-id="${col}"] button`)
                assert.equal(await btn.count(), 1, `ext-g1 之 ${col} 欄應有一個按鈕`)
                assert.equal(await btn.first().isDisabled(), false, `ext-g1 之 ${col} 欄按鈕應可點`)
            }
            assert.equal(await pageSaveShown(page), false, '只做唯讀檢查, 清單頁不應出現儲存鈕')
            return [
                { name: 'E2E-007-1-banner', buf: s1 },
                { name: 'E2E-007-2-lock-cell', buf: s2 },
            ]
        },
        semantic: async (page, lang) => {
            //spec E2E-007 驗證1: 橫幅 externalRowsNotice(n=2); 外部群組鎖頭 tooltip＝externalRowLocked(來源 F_G); 後台群組無鎖頭
            const banners = await bannerTexts(page, 'grups', 'ext')
            assert.deepEqual(banners, [await fmtT(page, 'externalRowsNotice', { n: 2 })], '群組頁應有一條外部列橫幅, 文字為 externalRowsNotice(n=2)')
            assert.ok(banners[0].includes(LIT[lang].notice(2)), `橫幅文字應含字面片段「${LIT[lang].notice(2)}」(實得 ${banners[0]})`)
            assert.deepEqual(await bannerTexts(page, 'grups', 'warn'), [], '無同步警示時不得渲染警示橫幅')
            const wantTitle = await fmtT(page, 'externalRowLocked', { from: F_G })
            assert.ok(wantTitle.includes(LIT[lang].lock(F_G)), `鎖頭 tooltip 應含字面片段「${LIT[lang].lock(F_G)}」(實得 ${wantTitle})`)
            for (const nm of ['ext-g1', 'ext-g2']) {
                assert.deepEqual(await lockTitles(page, await rowIndexByCell(page, 'name', nm)), [wantTitle], `${nm} 名稱欄應有一個鎖頭且 tooltip 含來源名`)
            }
            for (const nm of ['權限群組M1', '權限群組M2', '權限群組M3', '權限群組M4']) {
                assert.deepEqual(await lockTitles(page, await rowIndexByCell(page, 'name', nm)), [], `後台群組 ${nm} 不得有鎖頭`)
            }
            assert.equal(await lockCount(page), 2, '全頁鎖頭總數＝外部群組數 2')
            const gs = await selectAllRows('grups')
            assert.deepEqual(pickRow(rowOf(gs, 'id-xr-g1'), PICK_GX), pickRow(asExt(X_G1, F_G), PICK_GX), 'ext-g1 庫內不變')
        },
    },
    {
        //E2E-008: 外部群組 ext-g1 之 cpemis 經「使用權限」對話框(VeCpemis)改指派 → 回填後按儲存成功(指派欄後台可寫, 清單頁自動附載入基準) → 庫內 cpemis 含新權限、名稱與來源不變;
        //引用 ext-g1 之外部使用者 ext-u3 之授權樹(getPermUserInfor)由 P1 變為 P1∪P2。純語意。
        //6 步 user path: ①群組頁 ②點 ext-g1「管控使用權限」按鈕開對話框 ③勾選 權限P2 ④按對話框儲存(回填、對話框關閉、清單頁出現儲存鈕) ⑤按清單頁儲存 ⑥看到成功訊息; 庫內與授權樹符合
        name: 'E2E-008-grups-ext-cpemis-save',
        stages: [],
        fixture: async () => {
            await fxGrups()
            await syncRows('users', [X_U3], F_U) //引用 ext-g1 之外部使用者(以其授權樹觀察端到端結果)
        },
        run: async (page) => {
            const idU3 = await idOfSrc('users', 'id-xr-u3') //ext-u3 之真實 id(外部列 id 由伺服端產生; 標籤 id-xr-u3 是 srcKey)
            assert.ok(idU3 !== null && idU3 !== 'id-xr-u3', `ext-u3 應已經同步建立且真實 id 不等於 srcKey 標籤(實得 ${JSON.stringify(idU3)})`)
            assert.deepEqual(await getResolvedActiveTargets(page, idU3), TREE.P1, '改指派前 ext-u3 之授權＝ext-g1 之 P1')
            await enter(page, 'grups', 6)
            const k1 = await rowIndexByCell(page, 'name', 'ext-g1')
            await page.locator(`.ag-row[row-index="${k1}"] .ag-cell[col-id="cpemis"] button`).first().click()
            await waitUntilExist(page, 'VeCpemis 對話框標題', () => (document.body.innerText || '').includes(window.$vo.$t('grupEditCpemis')), { timeout: 15000 })
            await waitDialogGrid(page)
            await toggleDialogEnable(page, 1) //對話框內列＝全部權限(依 order): row0=P1, row1=P2 → 勾選 權限P2(新勾選項預設模式 OR)
            await clickDialogSave(page)
            await waitDialogClosed(page, 'grupEditCpemis')
            assert.equal(await pageSaveShown(page), true, '對話框回填後清單頁出現儲存鈕(已修改)')
            await saveAndWaitModal(page)
            await assertModalMsg(page, 'grupSaveGrupsSuccess') //指派欄為後台可寫: 外部群組之 cpemis 變更不被外部列保護拒收, 成功訊息為原文字
            await dismissResultModal(page)
            return null
        },
        semantic: async (page) => {
            //spec E2E-008 驗證1: 庫內 ext-g1 之 cpemis 含 權限P1 與 權限P2(皆啟用); 名稱、說明、來源不變
            const gs = await selectAllRows('grups')
            const g = rowOf(gs, 'id-xr-g1')
            const kp = JSON5.parse(g.cpemis)
            assert.equal(kp['權限P1'] && kp['權限P1'].isActive, 'y', 'ext-g1 仍含 權限P1(啟用)')
            assert.deepEqual(kp['權限P2'], { mode: 'OR', isActive: 'y' }, 'ext-g1 新增 權限P2(OR, 啟用)')
            assert.equal(g.name, 'ext-g1')
            assert.equal(g.description, X_G1.description)
            assert.equal(g.from, F_G, '外部群組之來源不變')
            //spec E2E-008 驗證2(端到端不變式): 引用 ext-g1 之 ext-u3 實際查到之授權樹 = P1 ∪ P2(＝M1 之授權集)
            assert.deepEqual(await getResolvedActiveTargets(page, await idOfSrc('users', 'id-xr-u3')), TREE.M1, '改指派後 ext-u3 之授權樹應含 P2 之標的')
        },
    },
    {
        //E2E-009: 群組頁勾選外部群組(ext-g1)後按「刪除勾選」→ 彈警告框(n=1)→ 按確認 → 該列不被刪除、不出現確認框／儲存鈕。純語意(外部群組不可刪除; 不可改名見 E2E-007)。
        name: 'E2E-009-grups-ext-delete-blocked',
        stages: [],
        fixture: fxGrups,
        run: async (page, lang) => {
            await enter(page, 'grups', 6)
            await checkRow(page, await rowIndexByCell(page, 'name', 'ext-g1'))
            await iconBtn(page, MDI.trash).first().click()
            const msg = await fmtT(page, 'externalRowDelBlocked', { n: 1 })
            await expectResultBox(page, '外部群組刪除警告框', msg)
            assert.ok(msg.includes(LIT[lang].delBlocked(1)), `警告框文字應含字面片段「${LIT[lang].delBlocked(1)}」(實得 ${msg})`)
            await clickModalBtn(page, 'ok')
            await waitModalGone(page, '警告框關閉', msg)
            await page.waitForTimeout(800)
            assert.deepEqual(await topModalLines(page), [], '警告框關閉後不應出現任何彈窗(全為外部列, 不進入刪除流程)')
            assert.equal(await hasName(page, 'ext-g1'), true, 'ext-g1 仍在清單')
            assert.equal(await pageSaveShown(page), false, '無任何變更, 清單頁不應出現儲存鈕')
            return null
        },
        semantic: async () => {
            const gs = await selectAllRows('grups')
            assert.ok(hasRow(gs, 'id-xr-g1') && hasRow(gs, 'id-xr-g2'), '外部群組皆在庫內')
            assert.equal(gs.length, 6, '庫內 base 4 + 外部 2')
        },
    },
    {
        //E2E-010(perm-run03 改寫判定口徑: 由「同名異 id」改為「同名異 srcKey」, countSrcKeyRenumber): 外部來源對 grups 同步一批後, 再送同一來源「同名異 srcKey」之一批(舊 srcKey 消失＝刪舊, 新 srcKey 同名＝增新; 疑似外部來源鍵重編) → 重新載入頁面後群組頁出現同步警示橫幅(syncWarnIdRenumber, 含來源名與筆數); 再送無此情形之一批(同 srcKey 同名＝不變) → 重新載入後橫幅消失。
        //警示登錄於伺服端記憶體, 前端於連線時取一次(webInfor.syncWarns), 故須重新載入(新開頁面)才反映。夾具標籤 id-xr-wa／id-xr-wb 即 srcKey(syncRows 改送 srcKey); 「同 srcKey 改名」是改名級聯、不警示(由 api-externalRows／api-syncAndReplaceTabs 涵蓋, 本案不重複)。
        //6 步 user path: ①外部來源同步第一批(夾具) ②外部來源同步同名異 srcKey 之第二批 ③重新載入進入群組頁 ④看到警示橫幅(來源名、1 筆) ⑤外部來源同步無重編之第三批 ⑥重新載入, 警示橫幅消失(外部列橫幅仍在)
        //圖: 警示橫幅出現(框住警示橫幅; 觀察步驟); 橫幅消失之畫面不另設圖
        name: 'E2E-010-sync-warn-banner',
        stages: ['E2E-010-1-warn-banner'],
        fixture: async () => { await syncRows('grups', [mkG('id-xr-wa', 'wg-renum', {}, { order: 100 })], F_W) },
        cleanup: async () => { await clearSyncWarn('grups', F_W) },
        run: async (page, lang) => {
            const browser = page.context().browser()
            //②同一來源同名(wg-renum)異 srcKey(id-xr-wa → id-xr-wb)之第二批: 回傳之伺服端結果＝刪舊 1、增新 1(身分是 srcKey, 非同名配對)
            assert.deepEqual(await syncRows('grups', [mkG('id-xr-wb', 'wg-renum', {}, { order: 100 })], F_W), { nAdd: 1, nUpdate: 0, nDel: 1, nSame: 0 }, '同名異 srcKey: 舊來源鍵之列被刪、新來源鍵之列被新增(不依名稱配對)')
            //③重新載入(新開 context 即重新連線取 webInfor)
            const p2 = await openApp(browser)
            await setLang(p2, lang)
            await gotoGrups(p2)
            await waitStoreCount(p2, 'grups', 5)
            await waitUntilExist(p2, '同步警示橫幅', () => !!document.querySelector('[data-fmid="grups-banner-warn"]'), { timeout: 20000 })
            const wantWarn = await fmtT(p2, 'syncWarnIdRenumber', { from: F_W, n: 1 })
            assert.ok(wantWarn.includes(LIT[lang].warn(F_W, 1)), `警示文字應含字面片段「${LIT[lang].warn(F_W, 1)}」(實得 ${wantWarn})`)
            assert.deepEqual(await bannerTexts(p2, 'grups', 'warn'), [wantWarn], '應有一條同步警示橫幅(來源名、筆數 1)')
            assert.deepEqual(await bannerTexts(p2, 'grups', 'ext'), [await fmtT(p2, 'externalRowsNotice', { n: 1 })], '外部列橫幅(外部群組 1 筆)同時存在')
            const s1 = await captureStableWithBox(p2, itemsUnionBox('[data-fmid="grups-banner-warn"]', { fit: true })) //結果: 同步警示橫幅(框住警示橫幅; 緊貼外部列橫幅, 經 fit 取間隙)
            //⑤再送無重編之第三批(同 srcKey 同名＝不變, 零寫入; 此次同步使伺服端登錄之警示清除)並重新載入
            assert.deepEqual(await syncRows('grups', [mkG('id-xr-wb', 'wg-renum', {}, { order: 100 })], F_W), { nAdd: 0, nUpdate: 0, nDel: 0, nSame: 1 }, '同 srcKey 同名重送: 不變(零寫入)')
            const p3 = await openApp(browser)
            await setLang(p3, lang)
            await gotoGrups(p3)
            await waitStoreCount(p3, 'grups', 5)
            return { shots: [{ name: 'E2E-010-1-warn-banner', buf: s1 }], page: p3 }
        },
        semantic: async (page) => {
            //spec E2E-010 驗證: 無重編之同步後重新載入, 警示橫幅消失(外部列橫幅仍在); 前端取得之 syncWarns 不含本來源
            assert.deepEqual(await bannerTexts(page, 'grups', 'warn'), [], '警示橫幅應已消失')
            assert.deepEqual(await bannerTexts(page, 'grups', 'ext'), [await fmtT(page, 'externalRowsNotice', { n: 1 })], '外部列橫幅仍在')
            const warns = await page.evaluate(() => (window.$vo.$store.state.webInfor.syncWarns || []).filter((w) => w.keyTable === 'grups'))
            assert.deepEqual(warns, [], '前端 webInfor.syncWarns 不應含 grups 之警示')
        },
    },
    {
        //E2E-011(F-26; perm-run02 2026-10-23 改寫): 開「所屬使用者」對話框(VeGrupBlngUsers)後, 先於對話框勾選 mary(未存草稿), 他人經 updateUsers 改了 mary 之列(說明) → 等對話框內過期提示出現(推播已到達; 有草稿故保留、凍結基準) →
        //按對話框儲存 → 彈 saveStale 訊息框(userSaveUsersFail 接 saveStale)、資料庫維持他人版本(零寫入)、對話框不關閉、儲存鈕可再按(再按仍被擋)。
        //〔原載 → 改為 2026-10-23: 原流程「開框不編輯 → 他人改 → 才勾選存檔 → 被拒」不成立, perm-run01 起無未存修改時推播即重建並更新基準(syncStore → rebuildDialog; R-DRAFT-KEEP-01 規則 11), 其後勾選存檔成功。〕
        //6 步 user path: ①群組頁開 M1「管控所屬使用者」對話框 ②勾選 mary(未存) ③(他人於此時改了 mary 之列) ④看到對話框內過期提示、mary 仍已勾選 ⑤按對話框儲存鈕 ⑥看到未儲存之訊息框, 按確認後對話框仍開著、儲存鈕仍在, 再按一次仍被擋
        //圖(鍵與檔名不變, 畫面內容因對話框內多一則過期提示而改變, 已授權重產): ①點擊前框住對話框儲存鈕(此時提示已在、mary 已勾選) ②框住訊息框(整個彈窗面板; 疊在對話框之上, 取最上層)
        name: 'E2E-011-stale-dialog-reject',
        stages: ['E2E-011-1-click-save', 'E2E-011-2-stale-box'],
        run: async (page, lang) => {
            await gotoGrups(page)
            await openBelongDialog(page, 0, BELONG_USERS) //row 0 = 權限群組M1(對話框列＝全部使用者依 order: row0=peter, row1=mary, row2=john, row3=admin)
            await toggleDialogEnable(page, 1) //勾選 mary(原不屬 M1) → 形成未存草稿、儲存鈕現身
            //spec E2E-011 驗證1(前提): 勾選後、他人改動前, 對話框內過期提示為 0 節點; mary 已勾選
            assert.equal(await staleCount(page, FM_BLNG_USERS_STALE), 0, '前提: 尚無過期提示')
            assert.equal(await page.locator(dialogEnableCheckboxSel(1)).first().isChecked(), true, '前提: mary 已勾選')
            //他人改了 mary 之列(說明): 經管理者寫入 RPC; 前端 store 隨廣播更新, 對話框有草稿故保留草稿與開框時之基準
            const OTHER = '他人於對話框開啟後改過之說明'
            await editTableRows('users', (rows) => {
                rows.find((r) => r.id === 'id-for-mary').description = OTHER
                return rows
            })
            await waitStoreField(page, 'users', 'id-for-mary', 'description', OTHER)
            //spec E2E-011 驗證1: 推播抵達後提示恰一條(文字＝staleDraftNoticeDialog); mary 仍已勾選(草稿保留, 對話框未重建)、儲存鈕仍在
            await expectUsersDialogStale(page, lang)
            assert.equal(await page.locator(dialogEnableCheckboxSel(1)).first().isChecked(), true, '推播後 mary 仍已勾選(草稿保留, 不重建)')
            assert.ok(await dlgBtn(page, DLG_MDI.save).first().isVisible(), '推播後對話框儲存鈕仍在')
            const dbBefore = await snapTables(['users'])
            const s1 = await captureStableWithBox(page, dlgBtn(page, DLG_MDI.save)) //點擊前: 框住對話框儲存鈕(畫面含過期提示)
            await clickDialogSave(page)
            const t = { fail: await tOf(page, 'userSaveUsersFail'), stale: await tOf(page, 'saveStale') }
            const expText = `${t.fail}: ${t.stale}`
            //spec E2E-011 驗證2: 第一次儲存出現單一訊息＋確認鈕之失敗框, 文字＝userSaveUsersFail、「: 」與 saveStale 串接(疊在對話框之上)
            await expectResultBoxAbove(page, 'saveStale 訊息框', expText)
            assert.ok(t.stale.includes(LIT[lang].stale), `saveStale 文字應含字面片段「${LIT[lang].stale}」(實得 ${t.stale})`)
            const s2 = await captureStableWithBox(page, topModalBox) //結果: 未儲存訊息框(最上層; 背後之對話框含過期提示)
            //spec E2E-011 驗證3: 零寫入(庫內 users 逐位元不變, 仍為他人版本)
            assert.deepEqual(await snapTables(['users']), dbBefore, '被拒: users 零寫入')
            await dismissResultModal(page)
            //spec E2E-011 驗證4: 點「確認」後對話框仍開著、儲存鈕仍在、過期提示仍為恰一條、mary 仍已勾選
            assert.ok(await page.evaluate((k) => (document.body.innerText || '').includes(window.$vo.$t(k)), 'grupBlngEditUsers'), '被拒後對話框仍開著')
            assert.ok(await dlgBtn(page, DLG_MDI.save).first().isVisible(), '被拒後對話框儲存鈕仍在')
            assert.equal(await staleCount(page, FM_BLNG_USERS_STALE), 1, '被拒後過期提示仍在(恰一條)')
            assert.equal(await page.locator(dialogEnableCheckboxSel(1)).first().isChecked(), true, '被拒後 mary 仍已勾選(草稿保留)')
            //spec E2E-011 驗證4: 儲存鈕可再按: 再按一次, 基準仍為開框時, 仍被拒(流程未被鎖死), 庫內仍零寫入
            await clickDialogSave(page)
            await expectResultBoxAbove(page, 'saveStale 訊息框(第二次)', expText)
            await dismissResultModal(page)
            assert.deepEqual(await snapTables(['users']), dbBefore, '再按一次仍被拒: users 零寫入')
            return [
                { name: 'E2E-011-1-click-save', buf: s1 },
                { name: 'E2E-011-2-stale-box', buf: s2 },
            ]
        },
        semantic: async () => {
            //spec E2E-011 驗證3: 庫內 mary 維持他人版本: 說明為他人所改、授權設定未被改寫(仍只含 權限群組M2)
            const mary = rowOf(await selectAllRows('users'), 'id-for-mary')
            assert.equal(mary.description, '他人於對話框開啟後改過之說明', 'mary 之說明應維持他人版本')
            assert.ok(!JSON5.parse(mary.cgrups)['權限群組M1'], 'mary 之授權設定不得被本次被拒之儲存改寫')
        },
    },
    {
        //E2E-012(F-26, S4; run11 改寫為表級: R-PRINCIPLE-00 原則 7「先動先贏」; perm-run02 2026-10-23 再改寫): 開「所屬使用者」對話框後, 先於對話框勾選 john(未存草稿), 他人新增一位後台使用者(late-b)、外部來源同步進一位外部使用者(late-x)
        //→ 等對話框內過期提示出現(推播已到達; 有草稿故保留、凍結基準) → 按對話框儲存 → 被拒(saveStale, 表內多了開框時沒有的兩列), 庫內零寫入、兩位新增之使用者仍在; 關閉對話框重新開啟(載入含兩位新增者之新基準; 提示歸零、john 回到未勾選)後
        //再勾選 john 存檔 → 成功, 兩位新增之使用者存檔後仍在(未被整表 diff 刪除)。純語意。
        //〔原載 → 改為 2026-10-23: 原流程「開框不編輯 → 他人新增列 → 才勾選存檔 → 被拒」不成立, perm-run01 起無未存修改時推播即重建並更新基準(R-DRAFT-KEEP-01 規則 11), 其後勾選存檔成功。〕
        //6 步 user path: ①群組頁開 M1 對話框 ②勾選 john(未存) ③(他人新增後台使用者、外部同步新增外部使用者) ④看到對話框內過期提示、john 仍已勾選 ⑤按對話框儲存, 看到未儲存訊息框 ⑥關閉對話框、重新開啟(提示消失、john 未勾選)、勾選 john、按儲存, 看到成功訊息, 對話框關閉; 庫內 john 已屬 M1, late-b 與 late-x 仍在且不變
        name: 'E2E-012-dialog-new-rows-stale-reload',
        stages: [],
        run: async (page, lang) => {
            await gotoGrups(page)
            await openBelongDialog(page, 0, BELONG_USERS) //開框時 users 為 base 4 筆
            await toggleDialogEnable(page, 2) //勾選 john(row2; 原不屬 M1) → 形成未存草稿
            //spec E2E-012 驗證1(前提): 勾選後、他人新增前, 過期提示為 0 節點; john 已勾選
            assert.equal(await staleCount(page, FM_BLNG_USERS_STALE), 0, '前提: 尚無過期提示')
            assert.equal(await page.locator(dialogEnableCheckboxSel(2)).first().isChecked(), true, '前提: john 已勾選')
            await editTableRows('users', (rows) => [...rows, mkU('id-xr-lb', 'late-b', {}, { description: '開框後他人新增之後台列', from: '', order: 0 })]) //後台列先建
            await syncRows('users', [mkU('id-xr-lx', 'late-x', {}, { description: '開框後外部同步新增之外部列', order: 120 })], F_LATE)
            await waitStoreCount(page, 'users', 6)
            //spec E2E-012 驗證1: 推播抵達後(store 的 users 為 6 筆)提示恰一條(文字＝staleDraftNoticeDialog); john 仍已勾選(草稿保留)
            await expectUsersDialogStale(page, lang)
            assert.equal(await page.locator(dialogEnableCheckboxSel(2)).first().isChecked(), true, '推播後 john 仍已勾選(草稿保留, 不重建)')
            const dbBefore = await snapTables(['users'])
            await clickDialogSave(page)
            const t = { fail: await tOf(page, 'userSaveUsersFail'), stale: await tOf(page, 'saveStale') }
            //spec E2E-012 驗證2: 第一次儲存出現失敗框(userSaveUsersFail、「: 」與 saveStale 串接), 庫內 users 逐位元零變更
            await expectResultBoxAbove(page, 'saveStale 訊息框', `${t.fail}: ${t.stale}`)
            assert.ok(t.stale.includes(LIT[lang].stale), `saveStale 文字應含字面片段「${LIT[lang].stale}」(實得 ${t.stale})`)
            assert.deepEqual(await snapTables(['users']), dbBefore, '被拒: users 零寫入(兩位新增之使用者仍在、john 未歸屬)')
            await dismissResultModal(page)
            //關閉對話框、重新開啟(show() 以最新 store 重算基準), 再勾選存檔 → 成功
            await clickDialogClose(page)
            await waitDialogClosed(page, 'grupBlngEditUsers')
            await openBelongDialog(page, 0, BELONG_USERS) //列: row0=peter, row1=mary, row2=john, row3=admin, row4=late-b(後台列 order 於整表寫入重給)…
            //spec E2E-012 驗證3: 重新開啟後過期提示為 0 節點(show() 歸零)、john 為未勾選(以最新資料為準, 被拒之草稿隨重開捨棄)
            assert.equal(await staleCount(page, FM_BLNG_USERS_STALE), 0, '重新開啟後過期提示歸零')
            assert.equal(await page.locator(dialogEnableCheckboxSel(2)).first().isChecked(), false, '重新開啟後 john 為未勾選(以最新資料為準)')
            await toggleDialogEnable(page, 2)
            await clickDialogSave(page)
            //spec E2E-012 驗證3: 重開後勾選 john 再儲存出現 userSaveUsersSuccess, 確認後對話框關閉
            await expectResultBoxAbove(page, '成功彈窗', await tOf(page, 'userSaveUsersSuccess'))
            await dismissResultModal(page)
            await waitDialogClosed(page, 'grupBlngEditUsers')
            return null
        },
        semantic: async () => {
            const us = await selectAllRows('users')
            //spec E2E-012 驗證4: 開框後新增之兩列(後台列、外部列)重新開框存檔後仍在、內容不變; john 之授權設定已含 M1
            assert.ok(hasRow(us, 'id-xr-lb') && hasRow(us, 'id-xr-lx'), '開框後新增之後台列與外部列存檔後須仍在')
            assert.equal(rowOf(us, 'id-xr-lb').from, '', 'late-b 仍為後台列')
            assert.equal(rowOf(us, 'id-xr-lx').from, F_LATE, 'late-x 仍為外部列, 來源不變')
            assert.equal(rowOf(us, 'id-xr-lx').description, '開框後外部同步新增之外部列', 'late-x 內容不變')
            assert.equal(JSON5.parse(rowOf(us, 'id-for-john').cgrups)['權限群組M1'].isActive, 'y', 'john 應已歸屬 權限群組M1')
            assert.equal(us.length, 6, '庫內 base 4 + 後台 1 + 外部 1')
        },
    },
    {
        //E2E-013(F-23＋F-26; perm-run02 2026-10-23 改寫): 開「所屬使用者」對話框後, 先於對話框勾選 ext-u1(未存草稿), 外部來源同步改了外部使用者 ext-u1 之列(說明) → 等對話框內過期提示出現(推播已到達; 有草稿故保留、凍結基準)
        //→ 按對話框儲存 → 彈 saveStale 訊息框、庫內不變; 關閉對話框重新開啟(載入新基準; 提示歸零、ext-u1 回到未勾選)後再勾選存檔 → 成功, 庫內 ext-u1 之授權設定含 M1、說明為外部新值、來源不變。純語意。
        //〔原載 → 改為 2026-10-23: 原流程「開框不編輯 → 外部同步改 → 才勾選存檔 → 被拒」不成立, perm-run01 起無未存修改時推播即重建並更新基準(R-DRAFT-KEEP-01 規則 11), 其後勾選存檔成功。〕
        //6 步 user path: ①群組頁開 M1 對話框 ②勾選 ext-u1(未存) ③(外部來源同步改了 ext-u1 之說明) ④看到對話框內過期提示、ext-u1 仍已勾選 ⑤按儲存, 看到未儲存訊息框 ⑥關閉對話框、重新開啟(提示消失、ext-u1 未勾選)、勾選 ext-u1、按儲存, 看到成功訊息; 庫內符合
        name: 'E2E-013-stale-external-row-dialog',
        stages: [],
        fixture: fxUsers,
        run: async (page, lang) => {
            await gotoGrups(page)
            await waitStoreCount(page, 'users', 6)
            await openBelongDialog(page, 0, BELONG_USERS) //對話框列: row0=peter, row1=mary, row2=john, row3=admin, row4=ext-u1, row5=ext-u2(依 order: 外部列 order 為 100 以上)
            await toggleDialogEnable(page, 4) //勾選 ext-u1(列次 4) → 形成未存草稿
            //spec E2E-013 驗證1(前提): 勾選後、同步前, 過期提示為 0 節點; ext-u1 已勾選
            assert.equal(await staleCount(page, FM_BLNG_USERS_STALE), 0, '前提: 尚無過期提示')
            assert.equal(await page.locator(dialogEnableCheckboxSel(4)).first().isChecked(), true, '前提: ext-u1 已勾選')
            //外部來源同步改了 ext-u1 之說明(同分區依 srcKey 差異同步: ext-u1 修改〔id 不變〕、ext-u2 不變; 其餘欄位同夾具)
            const NEW_DESC = '外部來源改過之說明'
            const idU1 = await idOfSrc('users', 'id-xr-u1') //ext-u1 之真實 id(同步前後不變: 修改保留 id)
            assert.deepEqual(await syncRows('users', [{ ...X_U1, description: NEW_DESC }, X_U2], F_U), { nAdd: 0, nUpdate: 1, nDel: 0, nSame: 1 }, '外部同步只改 ext-u1 之說明: 修改 1、不變 1')
            assert.equal(await idOfSrc('users', 'id-xr-u1'), idU1, '依 srcKey 修改: ext-u1 之 id 不變')
            await waitStoreField(page, 'users', idU1, 'description', NEW_DESC)
            //spec E2E-013 驗證1: 推播抵達後提示恰一條(文字＝staleDraftNoticeDialog); ext-u1 仍已勾選(草稿保留)
            await expectUsersDialogStale(page, lang)
            assert.equal(await page.locator(dialogEnableCheckboxSel(4)).first().isChecked(), true, '推播後 ext-u1 仍已勾選(草稿保留, 不重建)')
            const dbBefore = await snapTables(['users'])
            await clickDialogSave(page)
            const t = { fail: await tOf(page, 'userSaveUsersFail'), stale: await tOf(page, 'saveStale') }
            const expText = `${t.fail}: ${t.stale}`
            //spec E2E-013 驗證2: 第一次儲存出現失敗框(userSaveUsersFail、「: 」與 saveStale 串接), 庫內 users 逐位元零變更
            await expectResultBoxAbove(page, 'saveStale 訊息框', expText)
            assert.ok(t.stale.includes(LIT[lang].stale), `saveStale 文字應含字面片段「${LIT[lang].stale}」(實得 ${t.stale})`)
            assert.deepEqual(await snapTables(['users']), dbBefore, '被拒: users 零寫入')
            await dismissResultModal(page)
            //關閉對話框、重新開啟(show() 以最新 store 重算基準), 再勾選存檔 → 成功
            await clickDialogClose(page)
            await waitDialogClosed(page, 'grupBlngEditUsers')
            await openBelongDialog(page, 0, BELONG_USERS)
            //spec E2E-013 驗證3: 重新開啟後過期提示為 0 節點(show() 歸零)、ext-u1 為未勾選(以最新資料為準, 被拒之草稿隨重開捨棄)
            assert.equal(await staleCount(page, FM_BLNG_USERS_STALE), 0, '重新開啟後過期提示歸零')
            assert.equal(await page.locator(dialogEnableCheckboxSel(4)).first().isChecked(), false, '重新開啟後 ext-u1 為未勾選(以最新資料為準)')
            await toggleDialogEnable(page, 4)
            await clickDialogSave(page)
            //spec E2E-013 驗證3: 重開後勾選 ext-u1 再儲存出現 userSaveUsersSuccess, 確認後對話框關閉
            await expectResultBoxAbove(page, '成功彈窗', await tOf(page, 'userSaveUsersSuccess'))
            await dismissResultModal(page)
            await waitDialogClosed(page, 'grupBlngEditUsers')
            return null
        },
        semantic: async () => {
            const us = await selectAllRows('users')
            const u = rowOf(us, 'id-xr-u1')
            //spec E2E-013 驗證4: 外部列之授權設定(指派欄)經基準通過後可寫(含 M1 與原 M2); 其餘欄位維持外部新值、來源不變
            const kp = JSON5.parse(u.cgrups)
            assert.equal(kp['權限群組M1'] && kp['權限群組M1'].isActive, 'y', 'ext-u1 應已歸屬 權限群組M1')
            assert.equal(kp['權限群組M2'] && kp['權限群組M2'].isActive, 'y', 'ext-u1 原有之 權限群組M2 歸屬不變')
            assert.equal(u.description, '外部來源改過之說明', 'ext-u1 之說明維持外部新值')
            assert.equal(u.from, F_U, 'ext-u1 之來源不變')
            assert.deepEqual(pickRow(rowOf(us, 'id-xr-u2'), PICK_UX), pickRow(asExt(X_U2, F_U), PICK_UX), 'ext-u2 逐欄不變')
        },
    },
    {
        //E2E-014: 後端設定 lockExternalRows:'n'(回到舊行為)下, 使用者頁之外部列無鎖頭、無外部列橫幅、身分欄可編(雙擊 name 可進入編輯並可儲存改名)、核選方塊可點。純語意。
        //6 步 user path: ①部署方已設 lockExternalRows 為 n, 管理員登入點「使用者」 ②看不到橫幅與鎖頭 ③外部列 isAdmin／isActive 核選方塊可點 ④雙擊外部列 name 可編輯並改名 ⑤按儲存 ⑥看到成功訊息, 庫內改名、來源不變
        name: 'E2E-014-lock-off',
        stages: [],
        settings: { lockExternalRows: 'n' },
        fixture: fxUsers,
        run: async (page) => {
            assert.equal(await page.evaluate(() => window.$vo.$store.state.webInfor.lockExternalRows), 'n', '前提: 前端取得之 webInfor.lockExternalRows 為 n(後端已以 lockExternalRows:n 重啟)')
            await enter(page, 'users', 6)
            const k1 = await rowIndexByCell(page, 'name', 'ext-u1')
            //spec E2E-014 驗證1: 無橫幅、無鎖頭
            assert.deepEqual(await bannerTexts(page, 'users', 'ext'), [], '關閉外部列保護後不得有外部列橫幅')
            assert.equal(await lockCount(page), 0, '關閉外部列保護後不得有任何鎖頭')
            //spec E2E-014 驗證2: 外部列核選方塊可點、name 可進入編輯
            for (const col of ['isAdmin', 'isActive']) {
                const st = await checkboxState(page, k1, col)
                assert.ok(st && st.disabled === false, `外部列 ext-u1 之 ${col} 核選方塊應可點(實得 ${JSON.stringify(st)})`)
            }
            await typeIntoCell(page, k1, 'name', 'ext-u1-edited')
            assert.equal(await pageSaveShown(page), true, '改名後清單頁出現儲存鈕')
            await saveAndWaitModal(page)
            await assertModalMsg(page, 'userSaveUsersSuccess')
            await dismissResultModal(page)
            return null
        },
        semantic: async () => {
            const u = rowOf(await selectAllRows('users'), 'id-xr-u1')
            assert.equal(u.name, 'ext-u1-edited', '關閉保護下外部列可被後台改名')
            assert.equal(u.from, F_U, '來源不變')
        },
    },
    {
        //E2E-015(原則 6): 群組頁新增一列, 名稱取外部群組 ext-g1 之名稱 → 名稱儲存格出現警告圖示, tooltip 為 nameUsedByExternal(含來源名與名稱); 按儲存被前端擋下(errInNames)、庫內不變。純語意。
        //6 步 user path: ①群組頁 ②點「新增」 ③於新列名稱欄輸入 ext-g1 ④看到警告圖示(tooltip 說明外部來源已使用此名稱) ⑤按儲存 ⑥看到名稱錯誤訊息框(errInNames), 未寫入
        name: 'E2E-015-grups-name-used-by-external',
        stages: [],
        fixture: fxGrups,
        run: async (page, lang) => {
            await enter(page, 'grups', 6)
            await clickAdd(page)
            await typeIntoCell(page, 0, 'name', 'ext-g1')
            const want = await fmtT(page, 'nameUsedByExternal', { name: 'ext-g1', from: F_G })
            assert.ok(want.includes(LIT[lang].usedBy('ext-g1', F_G)), `提示文字應含字面片段「${LIT[lang].usedBy('ext-g1', F_G)}」(實得 ${want})`)
            assert.equal(await cellWarnTitle(page, 0, 'name'), want, '新列名稱儲存格之警告 tooltip 應為 nameUsedByExternal(外部來源名稱與名稱)')
            await saveAndWaitModal(page)
            await assertModalMsg(page, 'errInNames') //前端攔截(isError), 不送後端
            return null
        },
        semantic: async () => {
            const gs = await selectAllRows('grups')
            assert.equal(gs.length, 6, '被擋: 庫內筆數不變(base 4 + 外部 2)')
            assert.equal(gs.filter((g) => g.name === 'ext-g1').length, 1, '庫內仍只有一個 ext-g1')
        },
    },
    {
        //E2E-016(R-PRINCIPLE-00 原則 7, 使用者 2026-10-22「前端有未存編輯時收到推播不得靜默丟棄草稿」; verify01 情境 5 之 FAIL): 使用者頁有未存編輯(mary 之說明)時, 他人改了同一列(mary 之 email),
        //約 2 秒後推播抵達 → 草稿(說明欄之編輯、儲存鈕)保留、清單上方出現「資料已被更新」橫幅(附「重新載入」鈕) → 按儲存被拒(saveStale 訊息框; 庫內零寫入, mary 仍為他人版本) →
        //按「重新載入」→ 橫幅消失、草稿放棄、清單回到最新資料(email 為他人版本)、儲存鈕消失 → 重新編輯後存檔成功。
        //6 步 user path: ①使用者頁 ②雙擊 mary 之說明欄輸入新說明(未存) ③(他人改了 mary 之 email) ④看到橫幅、草稿與儲存鈕仍在 ⑤按儲存, 看到未儲存訊息框 ⑥按「重新載入」, 清單回到最新資料; 再編輯、儲存, 看到成功訊息
        //圖: 觀察步驟(推播抵達後之反應, 無點擊前圖): 框住橫幅整條(含文字與「重新載入」鈕)
        name: 'E2E-016-users-stale-draft-kept',
        stages: ['E2E-016-1-stale-banner'],
        run: async (page, lang) => {
            await enter(page, 'users', 4)
            const k = await rowIndexByCell(page, 'name', 'mary')
            const emailOld = await cellText(page, k, 'email')
            const descOld = await cellText(page, k, 'description')
            const DRAFT = 'A管理員未儲存之說明'
            await typeIntoCell(page, k, 'description', DRAFT)
            assert.equal(await pageSaveShown(page), true, '前提: 有未存編輯, 儲存鈕現身')
            assert.equal(await staleCount(page, 'users-banner-stale'), 0, '前提: 尚無過期提示')
            //他人改了 mary 之 email(同一列; 經管理者寫入 RPC); 前端 store 隨推播更新
            const OTHER = 'mary-by-other@example.com'
            await editTableRows('users', (rows) => {
                rows.find((r) => r.id === 'id-for-mary').email = OTHER
                return rows
            })
            await waitStoreField(page, 'users', 'id-for-mary', 'email', OTHER)
            await waitStale(page, 'users-banner-stale')
            //spec E2E-016 驗證1: 橫幅文字＝staleDraftNotice(單一橫幅); 草稿保留(說明欄仍為 A 之編輯、email 欄仍為載入時之版本——不被推播覆蓋)、儲存鈕仍在
            assert.deepEqual(await staleTexts(page, 'users-banner-stale'), [await tOf(page, 'staleDraftNotice')], '應有一條過期橫幅, 文字為 staleDraftNotice')
            assert.ok((await staleTexts(page, 'users-banner-stale'))[0].includes(LIT[lang].staleDraft), `橫幅應含字面片段「${LIT[lang].staleDraft}」`)
            assert.equal(await cellText(page, k, 'description'), DRAFT, '草稿未被丟棄: 說明欄仍為 A 之編輯')
            assert.equal(await cellText(page, k, 'email'), emailOld, '草稿未被重建: email 欄仍為載入時之版本(他人之新值不蓋掉草稿)')
            assert.equal(await pageSaveShown(page), true, '儲存鈕仍在')
            const s1 = await captureStableWithBox(page, itemsUnionBox('[data-fmid="users-banner-stale"]', { fit: true })) //結果: 清單上方出現過期橫幅(框住橫幅整條)
            //spec E2E-016 驗證2: 按儲存 → 伺服端以表雜湊拒收(saveStale 訊息框), 庫內零寫入(仍為他人版本)
            const dbBefore = await snapTables(['users'])
            await clickSave(page)
            await expectResultBox(page, 'saveStale 訊息框', `${await tOf(page, 'userSaveUsersFail')}: ${await tOf(page, 'saveStale')}`)
            await dismissResultModal(page)
            assert.deepEqual(await snapTables(['users']), dbBefore, '被拒: users 零寫入')
            assert.equal(await staleCount(page, 'users-banner-stale'), 1, '被拒後橫幅與草稿仍在')
            assert.equal(await cellText(page, k, 'description'), DRAFT, '被拒後草稿仍在')
            //spec E2E-016 驗證3: 按「重新載入」→ 橫幅消失、草稿放棄、清單回到最新資料、儲存鈕消失
            await page.locator('[data-fmid="users-banner-stale-reload"]').first().click()
            await waitStaleGone(page, 'users-banner-stale')
            await page.waitForTimeout(800) //清單重建 settle
            assert.equal(await cellText(page, k, 'description'), descOld, '重新載入: 說明欄回到最新資料(草稿已放棄)')
            assert.equal(await cellText(page, k, 'email'), OTHER, '重新載入: email 欄為他人之版本')
            assert.equal(await pageSaveShown(page), false, '重新載入: 無未存編輯, 儲存鈕消失')
            //spec E2E-016 驗證4: 重新載入後(新基準)再編輯、存檔 → 成功
            const AFTER = 'A管理員重新載入後之說明'
            await typeIntoCell(page, k, 'description', AFTER)
            await saveAndWaitModal(page)
            await assertModalMsg(page, 'userSaveUsersSuccess')
            await dismissResultModal(page)
            return [{ name: 'E2E-016-1-stale-banner', buf: s1 }]
        },
        semantic: async () => {
            const mary = rowOf(await selectAllRows('users'), 'id-for-mary')
            assert.equal(mary.email, 'mary-by-other@example.com', '他人之 email 版本保留(被拒之儲存未覆蓋)')
            assert.equal(mary.description, 'A管理員重新載入後之說明', '重新載入後之編輯已存')
        },
    },
    {
        //E2E-017(原則 7): 群組頁有未存編輯(M1 之說明)時, 外部來源同步改了「同表另一列」(外部群組 ext-g2 之說明)——與 A 編輯之列無關——→ 草稿保留、出現過期橫幅 → 按儲存被拒(表級: 先動先贏, 不部分變更), 庫內零寫入。純語意。
        //6 步 user path: ①群組頁 ②雙擊 M1 之說明欄輸入新說明(未存) ③(外部同步改了 ext-g2 之說明) ④看到橫幅、草稿與儲存鈕仍在 ⑤按儲存, 看到未儲存訊息框 ⑥庫內 M1 未被改、ext-g2 為外部新值
        name: 'E2E-017-grups-stale-other-row',
        stages: [],
        fixture: fxGrups,
        run: async (page, lang) => {
            await enter(page, 'grups', 6)
            const k = await rowIndexByCell(page, 'name', '權限群組M1')
            const DRAFT = 'A管理員未儲存之群組說明'
            await typeIntoCell(page, k, 'description', DRAFT)
            assert.equal(await pageSaveShown(page), true, '前提: 有未存編輯')
            const NEW = '外部來源改過之說明(別列)'
            await syncRows('grups', [X_G1, { ...X_G2, description: NEW }], F_G) //依 srcKey 差異同步: ext-g2 修改(id 不變)、ext-g1 不變
            await waitStoreField(page, 'grups', await idOfSrc('grups', 'id-xr-g2'), 'description', NEW)
            await waitStale(page, 'grups-banner-stale')
            assert.deepEqual(await staleTexts(page, 'grups-banner-stale'), [await tOf(page, 'staleDraftNotice')])
            assert.ok((await staleTexts(page, 'grups-banner-stale'))[0].includes(LIT[lang].staleDraft), `橫幅應含字面片段「${LIT[lang].staleDraft}」`)
            assert.equal(await cellText(page, k, 'description'), DRAFT, '草稿未被丟棄')
            assert.equal(await pageSaveShown(page), true, '儲存鈕仍在')
            const dbBefore = await snapTables(['grups'])
            await clickSave(page)
            await expectResultBox(page, 'saveStale 訊息框', `${await tOf(page, 'grupSaveGrupsFail')}: ${await tOf(page, 'saveStale')}`)
            await dismissResultModal(page)
            assert.deepEqual(await snapTables(['grups']), dbBefore, '被拒: grups 零寫入(A 編輯之列與外部另一列皆不變)')
            return null
        },
        semantic: async () => {
            const gs = await selectAllRows('grups')
            assert.notEqual(rowOf(gs, 'id-for-權限群組M1').description, 'A管理員未儲存之群組說明', 'M1 之說明未被被拒之儲存寫入')
            assert.equal(rowOf(gs, 'id-xr-g2').description, '外部來源改過之說明(別列)', 'ext-g2 維持外部新值')
        },
    },
    {
        //E2E-018(原則 7): 權限頁有未存編輯(P1 之說明)時, 他人新增了一個權限(表內多一列)→ 草稿保留、出現過期橫幅 → 按儲存被拒(列增減亦使表雜湊改變), 庫內零寫入、他人新增之權限仍在。純語意。
        //6 步 user path: ①權限頁 ②雙擊 P1 之說明欄輸入新說明(未存) ③(他人新增權限) ④看到橫幅、草稿與儲存鈕仍在 ⑤按儲存, 看到未儲存訊息框 ⑥庫內 P1 未被改、他人新增之權限仍在
        name: 'E2E-018-pemis-stale-other-added',
        stages: [],
        run: async (page, lang) => {
            await enter(page, 'pemis', 4)
            const k = await rowIndexByCell(page, 'name', '權限P1')
            const DRAFT = 'A管理員未儲存之權限說明'
            await typeIntoCell(page, k, 'description', DRAFT)
            assert.equal(await pageSaveShown(page), true, '前提: 有未存編輯')
            await editTableRows('pemis', (rows) => [...rows, { id: 'id-xr-p9', order: 99, name: 'xr-late-pemi', description: '他人新增之權限', from: '', crules: '{}' }])
            await waitStoreCount(page, 'pemis', 5)
            await waitStale(page, 'pemis-banner-stale')
            assert.deepEqual(await staleTexts(page, 'pemis-banner-stale'), [await tOf(page, 'staleDraftNotice')])
            assert.ok((await staleTexts(page, 'pemis-banner-stale'))[0].includes(LIT[lang].staleDraft), `橫幅應含字面片段「${LIT[lang].staleDraft}」`)
            assert.equal(await cellText(page, k, 'description'), DRAFT, '草稿未被丟棄')
            assert.equal(await hasName(page, 'xr-late-pemi'), false, '草稿未被重建: 清單不含他人新增之權限(保留載入時之版本)')
            const dbBefore = await snapTables(['pemis'])
            await clickSave(page)
            await expectResultBox(page, 'saveStale 訊息框', `${await tOf(page, 'pemiSavePemisFail')}: ${await tOf(page, 'saveStale')}`)
            await dismissResultModal(page)
            assert.deepEqual(await snapTables(['pemis']), dbBefore, '被拒: pemis 零寫入')
            return null
        },
        semantic: async () => {
            const ps = await selectAllRows('pemis')
            assert.ok(hasRow(ps, 'id-xr-p9'), '他人新增之權限仍在(未被草稿整表 diff 刪除)')
            assert.notEqual(rowOf(ps, 'id-for-權限P1').description, 'A管理員未儲存之權限說明', 'P1 之說明未被被拒之儲存寫入')
        },
    },
    {
        //E2E-019(原則 7): 標的頁有未存編輯(「專案A/頁A/區塊A」之說明)時, 他人刪除了一個標的(表內少一列)→ 草稿保留、出現過期橫幅 → 按儲存被拒, 庫內零寫入(被他人刪除之標的維持已刪、A 之編輯未寫入)。純語意。
        //6 步 user path: ①標的頁 ②雙擊首列之說明欄輸入新說明(未存) ③(他人刪除一個標的) ④看到橫幅、草稿與儲存鈕仍在、清單仍含被刪標的(保留載入時之版本) ⑤按儲存, 看到未儲存訊息框 ⑥庫內該標的維持已刪
        name: 'E2E-019-targets-stale-other-deleted',
        stages: [],
        fixture: async () => { await editTableRows('targets', (rows) => [...rows, { id: 'zz-xr/t1', order: 999, description: 'xr暫存標的', from: '' }]) },
        run: async (page, lang) => {
            await gotoTargets(page)
            await waitStoreCount(page, 'targets', 23)
            const k = await rowIndexByCell(page, 'id', T.A)
            const DRAFT = 'A管理員未儲存之標的說明'
            await typeIntoCell(page, k, 'description', DRAFT)
            assert.equal(await pageSaveShown(page), true, '前提: 有未存編輯')
            await editTableRows('targets', (rows) => rows.filter((r) => r.id !== 'zz-xr/t1'))
            await waitStoreCount(page, 'targets', 22)
            await waitStale(page, 'targets-banner-stale')
            assert.deepEqual(await staleTexts(page, 'targets-banner-stale'), [await tOf(page, 'staleDraftNotice')])
            assert.ok((await staleTexts(page, 'targets-banner-stale'))[0].includes(LIT[lang].staleDraft), `橫幅應含字面片段「${LIT[lang].staleDraft}」`)
            assert.equal(await cellText(page, k, 'description'), DRAFT, '草稿未被丟棄')
            const dbBefore = await snapTables(['targets'])
            await clickSave(page)
            await expectResultBox(page, 'saveStale 訊息框', `${await tOf(page, 'targetSaveTargetsFail')}: ${await tOf(page, 'saveStale')}`)
            await dismissResultModal(page)
            assert.deepEqual(await snapTables(['targets']), dbBefore, '被拒: targets 零寫入')
            return null
        },
        semantic: async () => {
            const ts = await selectAllRows('targets')
            assert.ok(!hasRow(ts, 'zz-xr/t1'), '他人刪除之標的維持已刪(被拒之草稿未使其復活)')
            assert.notEqual(rowOf(ts, T.A).description, 'A管理員未儲存之標的說明', '首列之說明未被被拒之儲存寫入')
        },
    },
    {
        //E2E-020(原則 7, 反向關聯對話框): 群組頁開「所屬使用者」對話框並勾選 john(未存編輯)後, 他人改了 mary 之列 → 對話框草稿與基準維持開框時之版本、出現「資料已被更新」提示(本視窗已過期) →
        //按對話框儲存被拒(saveStale 訊息框), 庫內零寫入, 對話框仍開著。
        //6 步 user path: ①群組頁開 M1 對話框 ②勾選 john(未存) ③(他人改了 mary 之說明) ④看到對話框內之過期提示 ⑤按對話框儲存鈕, 看到未儲存訊息框 ⑥按確認後對話框仍開著、提示仍在
        //圖: 觀察步驟(推播抵達後之反應, 無點擊前圖): 框住對話框內之提示整條
        name: 'E2E-020-users-dialog-stale-notice',
        stages: ['E2E-020-1-stale-banner'],
        run: async (page, lang) => {
            await gotoGrups(page)
            await openBelongDialog(page, 0, BELONG_USERS) //row 0 = 權限群組M1(對話框列: row0=peter, row1=mary, row2=john, row3=admin)
            await toggleDialogEnable(page, 2) //勾選 john(原不屬 M1) → 儲存鈕現身
            assert.equal(await staleCount(page, 'grup-blng-users-banner-stale'), 0, '前提: 尚無過期提示')
            const OTHER = '他人於對話框編輯中改過之說明'
            await editTableRows('users', (rows) => {
                rows.find((r) => r.id === 'id-for-mary').description = OTHER
                return rows
            })
            await waitStoreField(page, 'users', 'id-for-mary', 'description', OTHER)
            await waitStale(page, 'grup-blng-users-banner-stale')
            //spec E2E-020 驗證1: 提示文字＝staleDraftNoticeDialog(單一提示)
            assert.deepEqual(await staleTexts(page, 'grup-blng-users-banner-stale'), [await tOf(page, 'staleDraftNoticeDialog')])
            assert.ok((await staleTexts(page, 'grup-blng-users-banner-stale'))[0].includes(LIT[lang].staleDialog), `提示應含字面片段「${LIT[lang].staleDialog}」`)
            const s1 = await captureStableWithBox(page, itemsUnionBox('[data-fmid="grup-blng-users-banner-stale"]', { fit: true })) //結果: 對話框內出現過期提示(框住提示整條)
            //spec E2E-020 驗證2: 按儲存被拒、零寫入、對話框不關閉、提示仍在
            const dbBefore = await snapTables(['users'])
            await clickDialogSave(page)
            await expectResultBoxAbove(page, 'saveStale 訊息框', `${await tOf(page, 'userSaveUsersFail')}: ${await tOf(page, 'saveStale')}`)
            await dismissResultModal(page)
            assert.deepEqual(await snapTables(['users']), dbBefore, '被拒: users 零寫入')
            assert.ok(await page.evaluate((k) => (document.body.innerText || '').includes(window.$vo.$t(k)), 'grupBlngEditUsers'), '被拒後對話框仍開著')
            assert.equal(await staleCount(page, 'grup-blng-users-banner-stale'), 1, '被拒後提示仍在')
            return [{ name: 'E2E-020-1-stale-banner', buf: s1 }]
        },
        semantic: async () => {
            const us = await selectAllRows('users')
            assert.equal(rowOf(us, 'id-for-mary').description, '他人於對話框編輯中改過之說明', 'mary 維持他人版本')
            assert.ok(!JSON5.parse(rowOf(us, 'id-for-john').cgrups)['權限群組M1'], 'john 之授權設定不得被本次被拒之儲存改寫')
        },
    },
    {
        //E2E-021(原則 7, 反向關聯對話框): 權限頁開「所屬群組」對話框並勾選一個群組(未存編輯)後, 他人改了另一個群組 → 出現「資料已被更新」提示 → 按對話框儲存被拒(saveStale), 庫內零寫入, 對話框仍開著。純語意。
        //6 步 user path: ①權限頁開 P1「所屬群組」對話框 ②勾選一個群組(未存) ③(他人改了另一群組之說明) ④看到對話框內之過期提示 ⑤按對話框儲存鈕, 看到未儲存訊息框 ⑥按確認後對話框仍開著
        name: 'E2E-021-grups-dialog-stale-notice',
        stages: [],
        run: async (page, lang) => {
            await gotoPemis(page)
            await openBelongDialog(page, 0, BELONG_GRUPS) //row 0 = 權限P1; 對話框列依群組 order: row0=M1, row1=M2, row2=M3, row3=M4
            await toggleDialogEnable(page, 1) //勾選 M2(原不屬 P1) → 儲存鈕現身
            assert.equal(await staleCount(page, 'pemi-blng-grups-banner-stale'), 0, '前提: 尚無過期提示')
            const OTHER = '他人於對話框編輯中改過之群組說明'
            await editTableRows('grups', (rows) => {
                rows.find((r) => r.id === 'id-for-權限群組M3').description = OTHER
                return rows
            })
            await waitStoreField(page, 'grups', 'id-for-權限群組M3', 'description', OTHER)
            await waitStale(page, 'pemi-blng-grups-banner-stale')
            assert.deepEqual(await staleTexts(page, 'pemi-blng-grups-banner-stale'), [await tOf(page, 'staleDraftNoticeDialog')])
            assert.ok((await staleTexts(page, 'pemi-blng-grups-banner-stale'))[0].includes(LIT[lang].staleDialog), `提示應含字面片段「${LIT[lang].staleDialog}」`)
            const dbBefore = await snapTables(['grups'])
            await clickDialogSave(page)
            await expectResultBoxAbove(page, 'saveStale 訊息框', `${await tOf(page, 'grupSaveGrupsFail')}: ${await tOf(page, 'saveStale')}`)
            await dismissResultModal(page)
            assert.deepEqual(await snapTables(['grups']), dbBefore, '被拒: grups 零寫入')
            assert.ok(await page.evaluate((k) => (document.body.innerText || '').includes(window.$vo.$t(k)), 'pemiBlngEditGrups'), '被拒後對話框仍開著')
            assert.equal(await staleCount(page, 'pemi-blng-grups-banner-stale'), 1, '被拒後提示仍在')
            return null
        },
        semantic: async () => {
            const gs = await selectAllRows('grups')
            assert.equal(rowOf(gs, 'id-for-權限群組M3').description, '他人於對話框編輯中改過之群組說明', 'M3 維持他人版本')
            assert.ok(!JSON5.parse(rowOf(gs, 'id-for-權限群組M2').cpemis)['權限P1'], 'M2 之授權設定不得被本次被拒之儲存改寫')
        },
    },
    {
        //E2E-022(原則 7: 表雜湊以內容計算, 排除系統自動變更之欄位與 order 數值〔只看名次〕; perm-run03 改寫夾具): 使用者頁有未存編輯(mary 之說明)時, 外部來源對同一批外部使用者做「整批重寫但內容未變」之同步
        //(每列之建立者／更新時間等伺服器管理欄皆重寫、order 值整批重編而名次不變)→ 推播抵達, 但表內容(雜湊)未變: 不出現過期橫幅、草稿保留 → 按儲存成功(不被誤擋), 外部列內容逐欄不變。純語意。
        //〔perm-run03 改寫原因: 外部匯入改依 srcKey 差異同步後, 「逐欄完全相同」之重送為 nSame 零寫入(無推播、伺服器管理欄不重寫), 原夾具(原樣重送)不再造成「整批重寫」;
        //  改以 order 值重編(100/101 → 110/111, 名次不變; order 屬外部擁有欄位, 差異同步會改寫該 2 列並重寫其伺服器管理欄)代表之, 仍驗同一規則(伺服器管理欄與 order 數值之改變不使草稿作廢); 另先驗原樣重送回 nSame=2。〕
        //6 步 user path: ①使用者頁(含 2 位外部使用者) ②雙擊 mary 之說明欄輸入新說明(未存) ③(外部來源原樣再同步一次: 零寫入; 再同步一次 order 重編而名次不變之整批重寫) ④看不到過期橫幅、草稿與儲存鈕仍在 ⑤按儲存, 看到成功訊息 ⑥庫內 mary 已存、外部列內容不變
        name: 'E2E-022-users-external-rewrite-unchanged',
        stages: [],
        fixture: fxUsers,
        run: async (page) => {
            await enter(page, 'users', 6)
            const k = await rowIndexByCell(page, 'name', 'mary')
            const DRAFT = 'A管理員未儲存之說明'
            await typeIntoCell(page, k, 'description', DRAFT)
            assert.equal(await pageSaveShown(page), true, '前提: 有未存編輯')
            assert.deepEqual(await syncRows('users', [X_U1, X_U2], F_U), { nAdd: 0, nUpdate: 0, nDel: 0, nSame: 2 }, '原樣重送(內容與夾具逐欄相同): 差異同步全為不變(零寫入, 冪等)')
            await markStoreRef(page, 'users')
            assert.deepEqual(await syncRows('users', [{ ...X_U1, order: 110 }, { ...X_U2, order: 111 }], F_U), { nAdd: 0, nUpdate: 2, nDel: 0, nSame: 0 }, 'order 重編而名次不變(100/101 → 110/111): 2 列皆被改寫(order 屬外部擁有欄位)')
            await waitStoreRefChanged(page, 'users')
            await page.waitForTimeout(1500) //清單 computed 重算 settle
            assert.equal(await staleCount(page, 'users-banner-stale'), 0, '外部同步內容未變: 不得出現過期橫幅')
            assert.equal(await cellText(page, k, 'description'), DRAFT, '草稿保留')
            assert.equal(await pageSaveShown(page), true, '儲存鈕仍在')
            await saveAndWaitModal(page)
            await assertModalMsg(page, 'userSaveUsersSuccess') //以載入時之基準存檔不被誤擋
            await dismissResultModal(page)
            return null
        },
        semantic: async () => {
            const us = await selectAllRows('users')
            assert.equal(rowOf(us, 'id-for-mary').description, 'A管理員未儲存之說明', 'mary 之編輯已存')
            assert.deepEqual(pickRow(rowOf(us, 'id-xr-u1'), PICK_UX), pickRow(asExt(X_U1, F_U), PICK_UX), 'ext-u1 逐欄不變')
            assert.deepEqual(pickRow(rowOf(us, 'id-xr-u2'), PICK_UX), pickRow(asExt(X_U2, F_U), PICK_UX), 'ext-u2 逐欄不變')
        },
    },
    {
        //E2E-023(原則 7: 無未存編輯時照舊重建): 使用者頁沒有未存編輯時, 他人改了 mary 之 email → 推播抵達後清單自行更新為最新資料, 不出現過期橫幅、無儲存鈕。純語意。
        //6 步 user path: ①使用者頁(未編輯) ②(他人改了 mary 之 email) ③看到 mary 之 email 欄已更新為他人版本 ④看不到過期橫幅 ⑤看不到儲存鈕
        name: 'E2E-023-users-no-draft-rebuild',
        stages: [],
        run: async (page) => {
            await enter(page, 'users', 4)
            const k = await rowIndexByCell(page, 'name', 'mary')
            assert.equal(await pageSaveShown(page), false, '前提: 無未存編輯')
            const OTHER = 'mary-by-other-23@example.com'
            await editTableRows('users', (rows) => {
                rows.find((r) => r.id === 'id-for-mary').email = OTHER
                return rows
            })
            await waitStoreField(page, 'users', 'id-for-mary', 'email', OTHER)
            await waitUntilExist(page, 'mary 之 email 欄更新', (a) => { const c = document.querySelector(`.ag-row[row-index="${a.k}"] .ag-cell[col-id="email"]`); return !!c && (c.textContent || '').trim() === a.v }, { arg: { k, v: OTHER }, timeout: 20000 })
            assert.equal(await staleCount(page, 'users-banner-stale'), 0, '無未存編輯: 不得出現過期橫幅')
            assert.equal(await pageSaveShown(page), false, '無未存編輯: 無儲存鈕')
            return null
        },
        semantic: async () => {
            assert.equal(rowOf(await selectAllRows('users'), 'id-for-mary').email, 'mary-by-other-23@example.com', '他人之版本維持')
        },
    },
    {
        //E2E-024(原則 7 之回歸守護): 清單頁以 computed 監看 store 與 genOpt 讀取之反應式來源; 草稿保留機制不得使「其他反應式來源之變動」(如頂列切換語系)失效——使用者頁於執行中切換語系後, 表頭文字隨之更新。純語意。
        //6 步 user path: ①使用者頁 ②記下「名稱」欄之表頭文字 ③於頂列語系下拉切換為另一語系 ④看到表頭文字改為另一語系 ⑤無過期橫幅、無儲存鈕
        name: 'E2E-024-users-lang-switch-headers',
        stages: [],
        run: async (page, lang) => {
            await enter(page, 'users', 4)
            const hdr = () => page.evaluate(() => ((document.querySelector('.ag-header-cell[col-id="name"]') || {}).textContent || '').trim())
            const h0 = await hdr()
            assert.ok(h0 !== '', '前提: 名稱欄表頭有文字')
            await page.evaluate((l) => { window.$vo.$ui.setLang(l, 'e2e-lang-switch') }, lang === 'eng' ? 'cht' : 'eng') //e2e 之 setLang 對 eng 不動作(預設語系), 故直接呼叫前端切換語系
            await waitUntilExist(page, '表頭文字隨語系更新', (a) => { const e = document.querySelector('.ag-header-cell[col-id="name"]'); const t = e ? (e.textContent || '').trim() : ''; return t !== '' && t !== a.h0 }, { arg: { h0 }, timeout: 20000 })
            assert.notEqual(await hdr(), h0, '切換語系後表頭文字應改變')
            assert.equal(await staleCount(page, 'users-banner-stale'), 0, '無過期橫幅')
            assert.equal(await pageSaveShown(page), false, '無儲存鈕')
            return null
        },
        semantic: async () => {
            assert.equal((await selectAllRows('users')).length, 4, '庫內 users 不變')
        },
    },
    {
        //E2E-025(原則 7 之回歸守護; 外審 sol 第 4 點): 保留草稿(keep)期間 changeParams 不呼叫 genOpt, 其對語系等來源的反應式依賴會收縮; 「重新載入」須在 computed 內重建以恢復依賴——
        //使用者頁有未存編輯、他人改了別列(出現過期橫幅)→ 按「重新載入」→ 於頂列切換語系 → 表頭文字仍隨語系更新。純語意。
        //6 步 user path: ①使用者頁編輯 mary 說明(未存) ②他人改了 mary 之 email、出現過期橫幅 ③按「重新載入」④記下「名稱」欄表頭文字 ⑤切換語系 ⑥看到表頭文字改為另一語系
        name: 'E2E-025-users-reload-then-lang-switch',
        stages: [],
        run: async (page, lang) => {
            await enter(page, 'users', 4)
            const k = await rowIndexByCell(page, 'name', 'mary')
            await typeIntoCell(page, k, 'description', 'A管理員未儲存之說明(025)')
            assert.equal(await pageSaveShown(page), true, '前提: 有未存編輯')
            const OTHER = 'mary-by-other-25@example.com'
            await editTableRows('users', (rows) => {
                rows.find((r) => r.id === 'id-for-mary').email = OTHER
                return rows
            })
            await waitStoreField(page, 'users', 'id-for-mary', 'email', OTHER)
            await waitStale(page, 'users-banner-stale')
            await page.locator('[data-fmid="users-banner-stale-reload"]').first().click()
            await waitStaleGone(page, 'users-banner-stale')
            await waitUntilExist(page, '重新載入後 mary 之 email 為他人版本', (a) => { const c = document.querySelector(`.ag-row[row-index="${a.k}"] .ag-cell[col-id="email"]`); return !!c && (c.textContent || '').trim() === a.v }, { arg: { k, v: OTHER }, timeout: 20000 })
            assert.equal(await pageSaveShown(page), false, '重新載入: 草稿已放棄')
            const hdr = () => page.evaluate(() => ((document.querySelector('.ag-header-cell[col-id="name"]') || {}).textContent || '').trim())
            const h0 = await hdr()
            assert.ok(h0 !== '', '前提: 名稱欄表頭有文字')
            await page.evaluate((l) => { window.$vo.$ui.setLang(l, 'e2e-lang-switch-025') }, lang === 'eng' ? 'cht' : 'eng') //e2e 之 setLang 對 eng 不動作(預設語系), 故直接呼叫前端切換語系
            await waitUntilExist(page, '重新載入後切換語系, 表頭文字隨之更新', (a) => { const e = document.querySelector('.ag-header-cell[col-id="name"]'); const t = e ? (e.textContent || '').trim() : ''; return t !== '' && t !== a.h0 }, { arg: { h0 }, timeout: 20000 })
            assert.notEqual(await hdr(), h0, '重新載入後切換語系, 表頭文字應改變(依賴已恢復)')
            assert.equal(await staleCount(page, 'users-banner-stale'), 0, '無過期橫幅')
            assert.equal(await pageSaveShown(page), false, '無儲存鈕')
            return null
        },
        semantic: async () => {
            const mary = rowOf(await selectAllRows('users'), 'id-for-mary')
            assert.equal(mary.email, 'mary-by-other-25@example.com', '他人之版本維持(本案未存檔)')
        },
    },
    {
        //E2E-026(原則 7; 外審 sol 第 1 點): 使用者頁父頁無未存編輯時開啟某列之「所屬群組」編輯器(VeCgrups)並勾選(編輯尚未回填父頁), 此時他人改了別列(john 之說明)→ 父頁因無草稿而重建並換新基準;
        //按編輯器儲存(回填)時, 草稿所依據之整表已異於開框時之基準 → 放棄回填並提示 saveStale(舊寫法只比被編輯列之指紋而放行, 之後存檔會以新基準繞過「同表別列已被改動」之整表比對)。
        //對照: 無他人變更時同一操作回填成功、出現儲存鈕。純語意。
        //6 步 user path: ①使用者頁 ②開 mary 之所屬群組編輯器並勾選一列 ③(他人改了 john 之說明)④按編輯器儲存 ⑤看到 saveStale 提示、mary 之群組欄未變、無儲存鈕 ⑥(對照)重開編輯器勾選並儲存 → 群組欄改變、儲存鈕現身
        name: 'E2E-026-users-editor-backfill-table-stale',
        stages: [],
        run: async (page) => {
            await enter(page, 'users', 4)
            const k = await rowIndexByCell(page, 'name', 'mary')
            const kJ = await rowIndexByCell(page, 'name', 'john')
            const CG = { colId: 'cgrups', titleKey: 'userEditCgrups', label: 'VeCgrups 對話框標題' }
            const t0 = await cellText(page, k, 'cgrups')
            assert.equal(await pageSaveShown(page), false, '前提: 父頁無未存編輯')
            await openBelongDialog(page, k, CG)
            await toggleDialogEnable(page, 3) //勾選(或取消)一個群組列 → 編輯器儲存鈕現身(編輯尚未回填)
            const OTHER = '他人於編輯器開啟中改過john之說明(026)'
            await editTableRows('users', (rows) => {
                rows.find((r) => r.id === 'id-for-john').description = OTHER
                return rows
            })
            await waitStoreField(page, 'users', 'id-for-john', 'description', OTHER)
            await waitUntilExist(page, '父頁已重建(john 之說明為他人版本)', (a) => { const c = document.querySelector(`.ag-row[row-index="${a.k}"] .ag-cell[col-id="description"]`); return !!c && (c.textContent || '').trim() === a.v }, { arg: { k: kJ, v: OTHER }, timeout: 20000 })
            await clickDialogSave(page)
            await waitDialogClosed(page, CG.titleKey)
            //spec E2E-026 驗證1: 放棄回填——mary 之群組欄未變、父頁仍無未存編輯; 出現 saveStale 提示
            await waitUntilExist(page, 'saveStale 提示', () => (document.body.innerText || '').includes(window.$vo.$t('saveStale')), { timeout: 10000 })
            assert.equal(await cellText(page, k, 'cgrups'), t0, '放棄回填: mary 之群組欄未變')
            assert.equal(await pageSaveShown(page), false, '放棄回填: 父頁仍無未存編輯(未標記為已修改)')
            //spec E2E-026 驗證2(對照): 無他人變更時同一操作回填成功
            await waitUntilExist(page, 'saveStale 提示淡出', () => !(document.body.innerText || '').includes(window.$vo.$t('saveStale')), { timeout: 20000 })
            await openBelongDialog(page, k, CG)
            await toggleDialogEnable(page, 3)
            await clickDialogSave(page)
            await waitDialogClosed(page, CG.titleKey)
            assert.notEqual(await cellText(page, k, 'cgrups'), t0, '對照: 無他人變更時回填成功, 群組欄改變')
            assert.equal(await pageSaveShown(page), true, '對照: 回填後父頁有未存編輯, 儲存鈕現身')
            return null
        },
        semantic: async () => {
            const us = await selectAllRows('users')
            assert.equal(rowOf(us, 'id-for-john').description, '他人於編輯器開啟中改過john之說明(026)', '他人之版本維持(本案未存檔)')
        },
    },
    {
        //E2E-027(R-RELOAD-GUARD-01; run12, AF-037 不穩定失敗之根因): 自己儲存成功並關閉結果框之後, 伺服端對自己這次寫入的推播(整表)才抵達, 且可能兩筆相隔不到 20ms(權限改名連帶更新群組引用端時為兩張表; 此處以內容相同之第二筆代表)——
        //清單頁先後重建兩次; 修正前第 1 次重建之「程式端重載旗標」計時器在第 2 次重建之 rowsChange 事件之前把旗標解除, 該事件被當成使用者編輯, 儲存成功後儲存鈕殘留(並使其後之推播被當成「有未存編輯」)。
        //人為固定推播時刻: 攔住真實推播, 待儲存成功且結果框關閉後才放行(先一筆; 第一次重建之 Vue 更新跑完後立即再一筆內容相同者, 見 releasePushes), 使窗口必然命中、不靠碰運氣。純語意。
        //6 步 user path: ①使用者頁雙擊 mary 之說明輸入新說明(未存) ②按儲存, 看到成功訊息 ③按確認關閉 ④(自己存檔所致之推播於此後抵達, 兩筆相隔不到 20ms) ⑤看到 mary 之說明為剛存內容 ⑥看不到儲存鈕、過期橫幅
        name: 'E2E-027-users-own-save-late-double-push',
        stages: [],
        run: async (page) => {
            await enter(page, 'users', 4)
            const k = await rowIndexByCell(page, 'name', 'mary')
            const DRAFT = 'A管理員自己儲存之說明(027)'
            await typeIntoCell(page, k, 'description', DRAFT)
            assert.equal(await pageSaveShown(page), true, '前提: 有未存編輯')
            await holdPushes(page)
            await saveAndWaitModal(page)
            await assertModalMsg(page, 'userSaveUsersSuccess')
            await dismissResultModal(page)
            assert.equal(await pageSaveShown(page), false, '儲存成功並關閉結果框: 儲存鈕消失(推播尚未套用)')
            await waitUntilExist(page, '自己存檔所致之推播已抵達(被攔住)', () => (window.__heldPushes || []).some((h) => h.payload.tableName === 'users'), { timeout: 30000 })
            await releasePushes(page, 'users')
            await waitUntilExist(page, '兩筆推播皆已套用', () => window.__pairDone === true, { timeout: 20000 })
            await page.waitForTimeout(1500) //負向觀察窗: 重建後 ag-grid 之 rowsChange 事件非同步抵達, 若被誤當成使用者編輯則儲存鈕於此期間現身
            //spec E2E-027 驗證1: 清單為剛存內容、儲存鈕不出現、無過期橫幅
            assert.equal(await cellText(page, k, 'description'), DRAFT, '清單為剛存之內容')
            assert.equal(await pageSaveShown(page), false, '自己存檔所致之延遲推播(兩筆)不得使儲存鈕殘留或再現')
            assert.equal(await staleCount(page, 'users-banner-stale'), 0, '無過期橫幅')
            return null
        },
        semantic: async () => {
            assert.equal(rowOf(await selectAllRows('users'), 'id-for-mary').description, 'A管理員自己儲存之說明(027)', 'mary 之編輯已存')
        },
    },
    {
        //E2E-028(R-DRAFT-KEEP-01; run12): 自己按儲存、伺服端已寫入但回應尚未抵達時, 約 2 秒輪詢之推播(自己這次寫入所致)先到——此時 isModified 仍為真, 修正前被當成「有未存編輯時他人更新」而保留草稿並顯示過期橫幅
        //(回應抵達後才被重建清除); 自己存檔所致之推播不是他人更新, 全程不得出現橫幅。以扣住儲存回應固定「推播先於回應」之次序。純語意。
        //6 步 user path: ①使用者頁雙擊 mary 之說明輸入新說明(未存) ②按儲存(伺服端已寫入、回應被扣住) ③(自己存檔所致之推播於回應之前抵達) ④看不到過期橫幅 ⑤回應抵達, 看到成功訊息, 按確認 ⑥看不到儲存鈕、過期橫幅
        name: 'E2E-028-users-own-save-push-before-response',
        stages: [],
        run: async (page) => {
            await enter(page, 'users', 4)
            const k = await rowIndexByCell(page, 'name', 'mary')
            const DRAFT = 'A管理員自己儲存之說明(028)'
            await typeIntoCell(page, k, 'description', DRAFT)
            assert.equal(await pageSaveShown(page), true, '前提: 有未存編輯')
            await holdSaveResponse(page, 'updateUsers')
            await markStoreRef(page, 'users')
            await clickSave(page)
            await waitSaveWritten(page)
            await waitStoreRefChanged(page, 'users') //自己這次寫入所致之推播先於回應抵達
            await page.waitForTimeout(800) //負向觀察窗: 清單 computed 重算 settle
            //spec E2E-028 驗證1: 回應尚未抵達、推播已套用, 不得出現過期橫幅
            assert.equal(await staleCount(page, 'users-banner-stale'), 0, '自己存檔進行中所致之推播不是他人更新: 不得出現過期橫幅')
            await releaseSaveResponse(page)
            await waitUntilExist(page, '成功訊息框', () => (document.body.innerText || '').includes(window.$vo.$t('userSaveUsersSuccess')), { timeout: 20000 })
            await assertModalMsg(page, 'userSaveUsersSuccess')
            await dismissResultModal(page)
            await page.waitForTimeout(1000)
            //spec E2E-028 驗證2: 儲存成功後儲存鈕消失、無橫幅、清單為剛存內容
            assert.equal(await pageSaveShown(page), false, '儲存成功後儲存鈕消失')
            assert.equal(await staleCount(page, 'users-banner-stale'), 0, '儲存成功後無過期橫幅')
            assert.equal(await cellText(page, k, 'description'), DRAFT, '清單為剛存之內容')
            return null
        },
        semantic: async () => {
            assert.equal(rowOf(await selectAllRows('users'), 'id-for-mary').description, 'A管理員自己儲存之說明(028)', 'mary 之編輯已存')
        },
    },
    {
        //E2E-029(R-DRAFT-KEEP-01; run12, 反向關聯對話框): 群組頁開「所屬使用者」對話框勾選 john 後按儲存, 伺服端已寫入、回應尚未抵達時, 自己這次寫入所致之推播先到 → 對話框不得顯示「資料已被更新」提示(自己存檔所致之推播不是他人更新);
        //回應抵達後出現成功訊息、對話框關閉。以扣住儲存回應固定「推播先於回應」之次序。純語意。
        //6 步 user path: ①群組頁開 M1 對話框 ②勾選 john(未存) ③按對話框儲存(伺服端已寫入、回應被扣住) ④(自己存檔所致之推播於回應之前抵達) ⑤看不到對話框內之過期提示 ⑥回應抵達, 看到成功訊息, 按確認, 對話框關閉
        name: 'E2E-029-users-dialog-own-save-push-before-response',
        stages: [],
        run: async (page) => {
            await gotoGrups(page)
            await openBelongDialog(page, 0, BELONG_USERS) //row 0 = 權限群組M1(對話框列: row0=peter, row1=mary, row2=john, row3=admin)
            await toggleDialogEnable(page, 2) //勾選 john(原不屬 M1) → 儲存鈕現身
            assert.equal(await staleCount(page, 'grup-blng-users-banner-stale'), 0, '前提: 尚無過期提示')
            await holdSaveResponse(page, 'updateUsers')
            await markStoreRef(page, 'users')
            await clickDialogSave(page)
            await waitSaveWritten(page)
            await waitStoreRefChanged(page, 'users')
            await page.waitForTimeout(800)
            assert.equal(await staleCount(page, 'grup-blng-users-banner-stale'), 0, '自己存檔進行中所致之推播不是他人更新: 對話框不得顯示過期提示')
            await releaseSaveResponse(page)
            await waitUntilExist(page, '成功訊息框', () => (document.body.innerText || '').includes(window.$vo.$t('userSaveUsersSuccess')), { timeout: 20000 })
            await dismissResultModal(page)
            await waitDialogClosed(page, BELONG_USERS.titleKey)
            return null
        },
        semantic: async () => {
            assert.ok(JSON5.parse(rowOf(await selectAllRows('users'), 'id-for-john').cgrups)['權限群組M1'], 'john 已屬於 M1')
        },
    },
    {
        //E2E-030(R-DRAFT-KEEP-01; run12, 反向關聯對話框): 權限頁開「所屬群組」對話框勾選 M2 後按儲存, 伺服端已寫入、回應尚未抵達時, 自己這次寫入所致之推播先到 → 對話框不得顯示過期提示; 回應抵達後出現成功訊息、對話框關閉。純語意。
        //6 步 user path: ①權限頁開 P1「所屬群組」對話框 ②勾選 M2(未存) ③按對話框儲存(伺服端已寫入、回應被扣住) ④(自己存檔所致之推播於回應之前抵達) ⑤看不到對話框內之過期提示 ⑥回應抵達, 看到成功訊息, 按確認, 對話框關閉
        name: 'E2E-030-grups-dialog-own-save-push-before-response',
        stages: [],
        run: async (page) => {
            await gotoPemis(page)
            await openBelongDialog(page, 0, BELONG_GRUPS) //row 0 = 權限P1; 對話框列依群組 order: row0=M1, row1=M2, row2=M3, row3=M4
            await toggleDialogEnable(page, 1) //勾選 M2(原不屬 P1) → 儲存鈕現身
            assert.equal(await staleCount(page, 'pemi-blng-grups-banner-stale'), 0, '前提: 尚無過期提示')
            await holdSaveResponse(page, 'updateGrups')
            await markStoreRef(page, 'grups')
            await clickDialogSave(page)
            await waitSaveWritten(page)
            await waitStoreRefChanged(page, 'grups')
            await page.waitForTimeout(800)
            assert.equal(await staleCount(page, 'pemi-blng-grups-banner-stale'), 0, '自己存檔進行中所致之推播不是他人更新: 對話框不得顯示過期提示')
            await releaseSaveResponse(page)
            await waitUntilExist(page, '成功訊息框', () => (document.body.innerText || '').includes(window.$vo.$t('grupSaveGrupsSuccess')), { timeout: 20000 })
            await dismissResultModal(page)
            await waitDialogClosed(page, BELONG_GRUPS.titleKey)
            return null
        },
        semantic: async () => {
            assert.ok(JSON5.parse(rowOf(await selectAllRows('grups'), 'id-for-權限群組M2').cpemis)['權限P1'], 'M2 已含 P1')
        },
    },
]

//檔級收尾對稱(R-E2E-ISO-01): 擷取三表現況(須為 pristine base seed 且無外部列) ↔ 每案 afterCase 與 after 還原並回驗
const iso = createIsolation()
const { runCase } = makeRunner({ flow: FLOW, iso })

async function generateBaseline() {
    console.log(`=== 產製 ${FLOW} baseline 開始 ===`)
    //截圖前篩選（--names / --langs / --write-mode / E2E_BASELINE_OUT_DIR，見檔頭）；不符任何鍵即於此報錯（啟動服務之前）
    const gate = createBaselineGate({ langs: LANGS, cases: CASES })
    console.log(gate.describe())
    await startServersOnce()
    fs.mkdirSync(PICS_DIR, { recursive: true })
    process.env.E2E_STRICT_CAPTURE = '1' //regen 端：captureStable 未 settle 即 throw，拒絕寫入未穩定畫面
    await iso.capture()
    //單案失敗不中斷整批(該案寫檔前之語意斷言未過即一張都不寫; 失敗彙整於結尾並使行程以非 0 結束), 供一次跑完即得全部失敗案例
    const fails = []
    for (const lang of gate.langs) {
        console.log(`=== 產生標準圖（${lang}）===`)
        for (const c of gate.casesFor(lang)) {
            console.log(`  ${c.name}`)
            try {
                await runCase('regen', lang, c, { gate })
            }
            catch (err) {
                console.log(`  [FAIL] ${lang}-${c.name}: ${err && err.message ? err.message : err}`)
                fails.push(`${lang}-${c.name}`)
            }
        }
    }
    try {
        await iso.restore()
    }
    catch (err) {
        console.log(`  [FAIL] 檔尾還原: ${err && err.message ? err.message : err}`)
        fails.push('iso.restore')
    }
    cleanup()
    if (fails.length > 0) {
        console.log(`=== 產製 ${FLOW} baseline 失敗 ${fails.length} 案: ${fails.join(', ')} ===`)
        process.exit(1)
    }
    //--names 之任一項未產出即報錯（不靜默略過）
    gate.finalize()
    console.log(`=== 產製 ${FLOW} baseline 完成 ===`)
}

if (isBaseline) {
    generateBaseline().catch((err) => { console.log('baseline 例外', err); cleanup(); process.exit(1) })
}
else {
    for (const lang of LANGS) {
        describe(`e2e-external-rows (${lang})`, function() {
            this.timeout(300000)
            before(async function() {
                this.timeout(400000)
                await startServersOnce()
                await iso.capture() //擷取三表現況為還原依據(須為 pristine base seed 且無外部列)
            })
            //檔尾還原(R-E2E-ISO-01): 單一 mocha 行程全跑時最後一案之改動(含外部列夾具)不遺留給下一個檔
            after(async function() {
                this.timeout(120000)
                await iso.restore()
            })
            //每案 fresh browser、夾具、換／還原 settings、開頁切語系、語意斷言、還原資料皆在 runCase 內（與產製端同管線；--grep 單跑亦完整）
            for (const c of CASES) {
                it(c.name, async function() {
                    if (c.settings) {
                        this.timeout(420000) //含兩次 restartBackend(換設定與還原)
                    }
                    await runCase('compare', lang, c, { onKnownDefect: () => this.skip() })
                })
            }
        })
    }
}
