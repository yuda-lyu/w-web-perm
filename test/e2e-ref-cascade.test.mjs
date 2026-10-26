//引用連帶確認框 e2e(run07; run06 之 B.1／B.3 缺口與新確認框: 主控已授權為「新案例」產標準圖)。對應 spec/流程_引用連帶確認框.md(E2E-001～008; 案號與本檔 CASES 之 E2E-NNN 一一對應)。
//既有 e2e-grups／e2e-pemis／e2e-targets／e2e-array-form 之引用連帶案例(E2E-005、AF-026／027／036～042 等)不動、不產圖; 本檔另立新 flow ref-cascade, 以全新夾具補其「確認框入圖」之缺口與「新增撞懸空名」(F-23 原則 7)。
//雙模式：
//  - 產 baseline：node test/e2e-ref-cascade.test.mjs --baseline （寫 test/pics/ref-cascade/; 2026-10-22 run07 N2 已產製 5 案 × 2 語系 × 10 張並逐張目視審畢; 產製端單案失敗不中斷整批, 結尾彙整失敗案例並以非 0 結束）
//  - 驗證（mocha）：npx mocha test/e2e-ref-cascade.test.mjs --reporter list --timeout 300000
//  手術式重產（截圖前篩選）：--names <項,...>／--langs <eng,cht>／--write-mode missing|changed／env E2E_BASELINE_OUT_DIR=<dir>（規格同 e2e-grups 檔頭）
//  產製端與比對端呼叫同一案例管線（test/tools/e2eExt.mjs:makeRunner → runBaselineCase）：夾具（開瀏覽器前）→ fresh browser →（需特殊 settings 者換後端設定）開頁切語系 → 流程截圖與流程中語意斷言 →
//  結尾語意斷言（兩端皆於寫檔／比對之前）→ 產製端依篩選寫檔／比對端比對標準圖 → 還原預設 settings → 還原資料（restoreTables）。
//
//本檔原則：語意斷言為主, 標準圖為輔——只在「真有新畫面」之步驟宣告圖鍵(E2E-001／003／004／005／006 共 5 案、每語系 10 張; 其餘 3 案 stages 為空, 純語意)。
//  依主控指示: 成功訊息框之文字維持原文字, 本檔不為成功框產圖(避免與既有 grups／pemis／targets 之成功框圖混淆); 圖只取「儲存前之確認框／被拒訊息框」與其點擊前之目標。
//
//【輸入空間表】(軸 × 格數; 已測／刻意不測／未測)
//  軸 A 被引用表之動作(7 格): 群組刪除被引用者(001)、群組刪除無引用者(002)、群組改名被引用者(003)、權限改名撞懸空名(004)、標的刪除被引用者(005)、群組新增撞懸空名(006)、群組新增無懸空引用(007) → 全測;
//        權限刪除被引用／權限新增撞懸空名／標的新增撞懸空名／標的改 id 之 e2e 不在本輪派工(對稱路徑見 e2e-array-form AF-039、e2e-targets E2E-012; 權限新增與標的新增撞懸空名之判定性由 unit-getAddImpact 涵蓋)——未測 4 格
//  軸 B 使用者在確認框之回應(2 格): 否(001、005、006)、是(001、003、006) → 全測(004 為被拒訊息框, 002／007 無確認框)
//  軸 C 引用端類別(2 格): 後台列引用端(001、003)、外部列引用端(001 之 AND 引用者、003 之外部使用者; 外部列之指派欄經引用連帶被改寫, 屬後台可寫之指派欄) → 全測
//  軸 D 設定 cascadeRename(2 格): true 預設(001～007)、false(008) → 全測
//  軸 E 引用模式(2 格): OR(001 之 rc-del-uo、003 之 rc-ren-u)、AND(001 之 rc-del-ua、003 之 rc-ren-ext、006 之 rc-dg-u2) → 全測
//  軸 F 語系(2 格): eng、cht → 全測(每案兩語系)
//  已測案例 8 × 語系 2 = 16 個 it。
//
//夾具(後台列由系統管理者寫入 RPC(editTableRows)先建, 外部列經真 /syncAndReplaceTabs 後建): 群組 rc-del-g／rc-lone／rc-ren-g; 使用者 rc-del-uo(後台)、rc-del-ua(外部)、rc-ren-u(後台)、rc-ren-ext(外部)、
//  rc-dg-u1／rc-dg-u2(外部, 引用不存在之群組 rc-ghost-g); 外部群組 rc-dang-g(引用不存在之權限 rc-ghost-p)。收尾 restoreTables(purgeExternalRows 直刪外部列夾具 → 整表寫回快照)並回驗(R-E2E-ISO-01)。
//授權樹期望值由 base seed 規則集依 R-AUTH-MERGE-00 推導(見 test/tools/e2eExt.mjs 之 TREE), 不抄實測值。
//perm-run03(外部匯入改依 srcKey 差異同步, R-IMPORT-01): 外部列夾具之標籤(id-rc-ua／id-rc-rx／id-rc-dg1／id-rc-dg2 等)是送入同步端點之 srcKey, 其真實 id 由伺服端產生(不等於標籤);
//  以使用者查端到端授權(getPermUserInfor)者: perm-run05 起 mappingBy 為 id 時 userId 依登入對應解析, 外部列傳其 srcKey(即夾具標籤; 不是 idOfSrc 取得之內部 id)、後台列傳 id; 以 rowOf／hasRow 比對庫內列者依 srcKey 找列(後台列仍以 id)。
import fs from 'fs'
import assert from 'assert'
import JSON5 from 'json5'
import {
    startServersOnce, cleanup, captureStableWithBox, waitUntilExist, getResolvedActiveTargets, typeIntoCell, MDI, iconBtn, checkRow, clickAdd, clickSave,
    dismissResultModal, clickModalBtn, waitModalGone, topModalLines, expectConfirmBox, expectResultBox, answerConfirm, rowIndexByCell, pageSaveShown,
} from './tools/e2e-setup.mjs'
import { editTableRows, selectAllRows } from './tools/api-setup.mjs'
import { createBaselineGate } from './tools/e2eLib.mjs'
import {
    TREE, T, BASE_UIDS, ON, mkU, mkG, fmtT, tOf, syncRows, snapTables, rowOf, hasRow, createIsolation, makeRunner,
    waitCellGone, waitNameGone, hasName, hasCell, enterPage, gotoTargets, cellWarnTitle, topModalBox,
} from './tools/e2eExt.mjs'

const FLOW = 'ref-cascade'
const PICS_DIR = `./test/pics/${FLOW}`
const LANGS = ['eng', 'cht']
const isBaseline = process.argv.includes('--baseline')

const F_RC = 'appRefCascade' //本檔之外部來源名稱
const enter = enterPage

//流程中取得之資料(run 之儲存前快照等)供同案之 semantic 使用(案例依序執行, 逐案覆寫)
const ST = {}

//各語系之字面片段(擋範本佔位符對調或筆數寫錯; 期望若全由範本代入, 範本錯誤無從察覺)
const LIT = {
    eng: {
        delConfirm: ['from 2 user(s)', '1 user(s) that refer to it with AND'],
        renameConfirm: ['2 user(s)', 'rc-ren-g→rc-ren-g-new', 'The source of 1 of them is an external application'],
        renameOk: 'The group references of 2 user(s) were updated to the new name(s).',
        inUse: 'a new name is still referenced by settings of items that no longer exist',
        addConfirm: ['Adding the group(s) "rc-ghost-g": 2 user(s) already refer to the name', '1 of them refer to it with AND'],
        delTarget: (n) => [`from the rules of ${n} permission(s)`, T.A],
    },
    cht: {
        delConfirm: ['自 2 位使用者', '其中 1 位以 AND 引用'],
        renameConfirm: ['2 位使用者', 'rc-ren-g→rc-ren-g-new', '其中 1 位來源為外部應用'],
        renameOk: '已將 2 位使用者對已改名群組的引用一併更新為新名稱',
        inUse: '新名稱仍被已不存在之項目的授權設定引用',
        addConfirm: ['新增群組「rc-ghost-g」後，將有 2 位使用者（其中 1 位以 AND 引用）'],
        delTarget: (n) => [`自 ${n} 個權限的規則`, T.A],
    },
}
const M1_OR = { '權限群組M1': ON() }

//—— 夾具 ——
//刪除被引用群組(001): 後台群組 rc-del-g(cpemis: P3)、後台使用者 rc-del-uo(OR 引用 M1 與 rc-del-g)、外部使用者 rc-del-ua(OR 引用 M1、AND 引用 rc-del-g)
//  授權(由規則集推導): rc-del-uo = M1 ∪ P3、rc-del-ua = M1 ∩ P3; 刪除後兩者之 rc-del-g 引用被清理, 皆為 M1(AND 限制解除, 授權變多)
async function fxDel() {
    await editTableRows('grups', (rows) => [...rows, mkG('id-rc-delg', 'rc-del-g', { '權限P3': ON() }, { from: '', order: 0 })])
    await editTableRows('users', (rows) => [...rows, mkU('id-rc-uo', 'rc-del-uo', { ...M1_OR, 'rc-del-g': ON() }, { from: '', order: 0 })])
    await syncRows('users', [mkU('id-rc-ua', 'rc-del-ua', { ...M1_OR, 'rc-del-g': ON('AND') }, { order: 110 })], F_RC)
}
//改名被引用群組(003、008): 後台群組 rc-ren-g(cpemis: P3 與 P1)、後台使用者 rc-ren-u(OR 引用 rc-ren-g)、外部使用者 rc-ren-ext(OR 引用 M1、AND 引用 rc-ren-g)
//  授權: rc-ren-u = P1 ∪ P3、rc-ren-ext = M1 ∩ (P1 ∪ P3)
async function fxRen() {
    await editTableRows('grups', (rows) => [...rows, mkG('id-rc-reng', 'rc-ren-g', { '權限P3': ON(), '權限P1': ON() }, { from: '', order: 0 })])
    await editTableRows('users', (rows) => [...rows, mkU('id-rc-ru', 'rc-ren-u', { 'rc-ren-g': ON() }, { from: '', order: 0 })])
    await syncRows('users', [mkU('id-rc-rx', 'rc-ren-ext', { ...M1_OR, 'rc-ren-g': ON('AND') }, { order: 110 })], F_RC)
}

//case 定義（順序＝產製順序＝mocha it 順序）：stages 為該案產出之全部圖鍵（空陣列＝純語意案例）；fixture 於開瀏覽器前建夾具；settings 為該案需之後端設定覆寫；
//run(page,lang) 走流程並回傳截圖（含流程中語意斷言）；semantic(page,lang) 為結尾語意斷言，產製端與比對端皆於寫檔／比對之前執行
const CASES = [
    {
        //E2E-001(spec 流程_引用連帶確認框 E2E-001; 對稱既有 e2e-grups E2E-005／014): 群組頁勾選被 2 位使用者引用之 rc-del-g(其中 1 位為外部使用者且以 AND 引用)後按「刪除勾選」→ 確認框(confirmDelRefsAndGrup: n=2、m=1)
        //→ 按取消: 列仍在、無儲存鈕、庫內零變更 → 再刪除按確定: 列自清單移除、出現儲存鈕、庫內仍零變更 → 按儲存 → 成功訊息(原文字) → 庫內兩位引用者之 cgrups 已移除 rc-del-g、授權依 AND 限制解除重算。
        //6 步 user path: ①(進場路徑見 e2e-grups E2E-001)群組頁 ②勾選 rc-del-g 列、點「刪除勾選」③看到確認框(2 位使用者、其中 1 位以 AND 引用) ④按取消, 列仍在 ⑤再刪除、按確定, 列移除、出現儲存鈕 ⑥按儲存, 看到成功訊息; 授權樹符合
        //圖: ①點擊前框住刪除鈕 ②框住確認框(整個彈窗面板, 含標題、訊息與否／是鈕; 訊息文字即受影響筆數之說明); 不為成功訊息框產圖
        name: 'E2E-001-grup-delete-referenced',
        stages: ['E2E-001-1-click-delete', 'E2E-001-2-confirm-box'],
        fixture: fxDel,
        run: async (page, lang) => {
            assert.deepEqual(await getResolvedActiveTargets(page, 'id-rc-uo'), TREE.M1_OR_P3, '刪除前 rc-del-uo 之授權 = M1 ∪ P3')
            assert.deepEqual(await getResolvedActiveTargets(page, 'id-rc-ua'), TREE.M1_AND_P3, '刪除前 rc-del-ua 之授權 = M1 ∩ P3')
            ST.db0 = await snapTables()
            await enter(page, 'grups', 5) //base 4 + rc-del-g
            await checkRow(page, await rowIndexByCell(page, 'name', 'rc-del-g'))
            const s1 = await captureStableWithBox(page, iconBtn(page, MDI.trash).first()) //點擊前: 框住刪除鈕
            await iconBtn(page, MDI.trash).first().click()
            //確認框(單一框、否／是): n＝將被移除引用之使用者數(2: rc-del-uo 之 OR 與 rc-del-ua 之 AND 皆計)、m＝其中以 AND 引用者(1: rc-del-ua)
            const expConfirm = await fmtT(page, 'confirmDelRefsAndGrup', { n: 2, m: 1 })
            await expectConfirmBox(page, '刪除確認框', expConfirm, LIT[lang].delConfirm)
            const s2 = await captureStableWithBox(page, topModalBox) //結果: 刪除確認框(框住整個彈窗面板)
            //按取消: 確認框消失、列仍在、無儲存鈕、庫內零變更
            await clickModalBtn(page, 'no')
            await waitModalGone(page, '刪除確認框(否)關閉', expConfirm)
            assert.equal(await hasName(page, 'rc-del-g'), true, '按取消後 rc-del-g 列仍在')
            assert.equal(await pageSaveShown(page), false, '按取消後清單頁不出現儲存鈕')
            assert.deepEqual(await snapTables(), ST.db0, '按取消: 庫內零變更')
            //再刪除、按確定: 只自清單移除(尚未寫入)
            await iconBtn(page, MDI.trash).first().click()
            await answerConfirm(page, '刪除確認框(第二次)', expConfirm, 'yes', LIT[lang].delConfirm)
            await waitNameGone(page, 'rc-del-g')
            assert.equal(await pageSaveShown(page), true, '按確定後清單頁出現儲存鈕')
            assert.deepEqual(await snapTables(), ST.db0, '按確定只自清單移除, 未按儲存前庫內零變更')
            //儲存 → 成功訊息為原文字(不附筆數; 刪除所致之清理筆數已於確認框告知)
            await clickSave(page)
            await expectResultBox(page, '成功彈窗', await tOf(page, 'grupSaveGrupsSuccess'))
            await dismissResultModal(page)
            return [
                { name: 'E2E-001-1-click-delete', buf: s1 },
                { name: 'E2E-001-2-confirm-box', buf: s2 },
            ]
        },
        semantic: async (page) => {
            const after = await snapTables()
            //spec E2E-001 驗證: 庫內 rc-del-g 已刪除; 兩位引用者(含外部使用者)之 cgrups 同一次寫入內已移除該引用(其餘項目不變); 外部使用者之來源不變
            assert.ok(!hasRow(after.grups, 'id-rc-delg'), 'DB grups 無 rc-del-g')
            assert.equal(after.grups.length, 4, 'DB grups 回到 base 4 筆')
            assert.deepEqual(JSON.parse(rowOf(after.users, 'id-rc-uo').cgrups), M1_OR, 'rc-del-uo(後台, OR 引用者)之 cgrups 只剩 M1')
            assert.deepEqual(JSON.parse(rowOf(after.users, 'id-rc-ua').cgrups), M1_OR, 'rc-del-ua(外部, AND 引用者)之 cgrups 只剩 M1')
            assert.equal(rowOf(after.users, 'id-rc-ua').from, F_RC, 'rc-del-ua 之來源不變(仍為外部列)')
            for (const id of BASE_UIDS) {
                assert.deepEqual(rowOf(after.users, id), rowOf(ST.db0.users, id), `${id} 未引用 rc-del-g: 整列逐位元不動`)
            }
            assert.deepEqual(after.pemis, ST.db0.pemis, 'pemis 表不動')
            //端到端不變式: 刪除後兩位引用者之授權皆為 M1(AND 限制解除者授權變多)
            assert.deepEqual(await getResolvedActiveTargets(page, 'id-rc-uo'), TREE.M1, '刪除後 rc-del-uo 之授權 = M1')
            assert.deepEqual(await getResolvedActiveTargets(page, 'id-rc-ua'), TREE.M1, '刪除後 rc-del-ua 之授權 = M1(AND 限制解除, 由 M1 ∩ P3 變為 M1)')
        },
    },
    {
        //E2E-002(spec E2E-002; 對稱既有 e2e-grups 之直刪路徑, 該路徑原由 E2E-005 兼任、現無 e2e): 群組頁刪除沒有任何使用者引用之 rc-lone → 不彈確認框: 點刪除後該列直接自清單移除、出現儲存鈕 → 按儲存 → 成功訊息(原文字)、庫內該群組消失, 使用者表不動。純語意。
        //6 步 user path: ①群組頁 ②勾選 rc-lone 列、點「刪除勾選」③沒有確認框, 列直接移除 ④出現儲存鈕 ⑤按儲存 ⑥看到成功訊息; 庫內無 rc-lone, 其他表不動
        name: 'E2E-002-grup-delete-unreferenced',
        stages: [],
        fixture: async () => {
            await editTableRows('grups', (rows) => [...rows, mkG('id-rc-lone', 'rc-lone', { '權限P4': ON() }, { from: '', order: 0 })])
        },
        run: async (page) => {
            await enter(page, 'grups', 5)
            ST.db0 = await snapTables()
            await checkRow(page, await rowIndexByCell(page, 'name', 'rc-lone'))
            await iconBtn(page, MDI.trash).first().click()
            await waitNameGone(page, 'rc-lone') //直接為已刪狀態
            //spec E2E-002 驗證: 不彈任何框(確認框會停住刪除直到按鈕, 此處列已移除且無彈窗); 出現儲存鈕; 尚未寫入
            assert.deepEqual(await topModalLines(page), [], '無任何引用者之群組刪除不彈確認框')
            assert.equal(await pageSaveShown(page), true, '刪除後清單頁出現儲存鈕')
            assert.deepEqual(await snapTables(), ST.db0, '未按儲存前庫內零變更')
            await clickSave(page)
            await expectResultBox(page, '成功彈窗', await tOf(page, 'grupSaveGrupsSuccess'))
            await dismissResultModal(page)
            assert.equal(await pageSaveShown(page), false, '儲存成功後儲存鈕消失')
            return null
        },
        semantic: async () => {
            const after = await snapTables()
            assert.ok(!hasRow(after.grups, 'id-rc-lone'), 'DB grups 無 rc-lone')
            assert.equal(after.grups.length, 4, 'DB grups 回到 base 4 筆')
            assert.deepEqual(after.users, ST.db0.users, 'users 表不動(無人引用 rc-lone, 不連帶改寫)')
            assert.deepEqual(after.pemis, ST.db0.pemis, 'pemis 表不動')
        },
    },
    {
        //E2E-003(spec E2E-003; 對稱既有 e2e-array-form AF-036): 群組頁把被 2 位使用者引用之 rc-ren-g(其中 1 位為外部使用者且以 AND 引用)改名為 rc-ren-g-new 後按儲存 → 改名預覽確認框(confirmSaveRenameRefsExtGrup:
        //n=2、e=1、名單 rc-ren-g→rc-ren-g-new) → 按確定 → 成功訊息(grupSaveGrupsSuccessCascade, 附已更新 2 位) → 兩位引用者之 cgrups 已改為新名稱(外部使用者之引用亦被同步改寫、來源不變)、各使用者授權不變。
        //6 步 user path: ①群組頁 ②雙擊 rc-ren-g 名稱儲存格改名(Enter) ③按儲存 ④看到改名確認框(2 位使用者、名單、1 位來源為外部應用) ⑤按確定 ⑥看到成功訊息(附筆數); 引用端已改寫, 授權樹不變
        //圖: ①點擊前框住儲存鈕 ②框住改名確認框(整個彈窗面板); 不為成功訊息框產圖
        name: 'E2E-003-grup-rename-referenced',
        stages: ['E2E-003-1-click-save', 'E2E-003-2-rename-confirm'],
        fixture: fxRen,
        run: async (page, lang) => {
            assert.deepEqual(await getResolvedActiveTargets(page, 'id-rc-ru'), TREE.P1P3, '改名前 rc-ren-u 之授權 = P1 ∪ P3')
            assert.deepEqual(await getResolvedActiveTargets(page, 'id-rc-rx'), TREE.M1_AND_P1P3, '改名前 rc-ren-ext 之授權 = M1 ∩ (P1 ∪ P3)')
            ST.db0 = await snapTables()
            await enter(page, 'grups', 5) //base 4 + rc-ren-g
            await typeIntoCell(page, await rowIndexByCell(page, 'name', 'rc-ren-g'), 'name', 'rc-ren-g-new')
            assert.equal(await pageSaveShown(page), true, '改名後清單頁出現儲存鈕(已修改)')
            const s1 = await captureStableWithBox(page, iconBtn(page, MDI.upload)) //點擊前: 框住儲存鈕
            await clickSave(page)
            //改名確認框: 引用 rc-ren-g 者為 rc-ren-u 與 rc-ren-ext 共 2 位(base seed 四位未引用), 其中來源非空者 1 位(rc-ren-ext) → e=1
            const expConfirm = await fmtT(page, 'confirmSaveRenameRefsExtGrup', { n: 2, e: 1, list: 'rc-ren-g→rc-ren-g-new' })
            await expectConfirmBox(page, '改名確認框', expConfirm, LIT[lang].renameConfirm)
            const s2 = await captureStableWithBox(page, topModalBox) //結果: 改名確認框(框住整個彈窗面板)
            await clickModalBtn(page, 'yes')
            await waitModalGone(page, '改名確認框(是)關閉', expConfirm)
            //成功訊息附已更新之使用者數(n=2)
            const expOk = await fmtT(page, 'grupSaveGrupsSuccessCascade', { n: 2 })
            await expectResultBox(page, '成功彈窗', expOk)
            assert.ok(expOk.includes(LIT[lang].renameOk), `成功訊息應含字面片段「${LIT[lang].renameOk}」(實得 ${expOk})`)
            await dismissResultModal(page)
            return [
                { name: 'E2E-003-1-click-save', buf: s1 },
                { name: 'E2E-003-2-rename-confirm', buf: s2 },
            ]
        },
        semantic: async (page) => {
            const after = await snapTables()
            //spec E2E-003 驗證: 庫內群組已改名(cpemis 不變); 兩位引用者之引用已改為新名稱(OR／AND 與 M1 項不變); 外部使用者之來源不變; 其餘表列整列不動
            assert.equal(rowOf(after.grups, 'id-rc-reng').name, 'rc-ren-g-new', 'DB: rc-ren-g 已更名')
            assert.equal(rowOf(after.grups, 'id-rc-reng').cpemis, rowOf(ST.db0.grups, 'id-rc-reng').cpemis, 'DB: rc-ren-g 之 cpemis 不變')
            assert.deepEqual(JSON.parse(rowOf(after.users, 'id-rc-ru').cgrups), { 'rc-ren-g-new': ON() }, 'rc-ren-u(後台)之引用已改為 rc-ren-g-new')
            assert.deepEqual(JSON.parse(rowOf(after.users, 'id-rc-rx').cgrups), { ...M1_OR, 'rc-ren-g-new': ON('AND') }, 'rc-ren-ext(外部)之 AND 引用已改為 rc-ren-g-new(M1 項不變)')
            assert.equal(rowOf(after.users, 'id-rc-rx').from, F_RC, 'rc-ren-ext 之來源不變(仍為外部列)')
            for (const id of BASE_UIDS) {
                assert.deepEqual(rowOf(after.users, id), rowOf(ST.db0.users, id), `${id} 未引用 rc-ren-g: 整列逐位元不動`)
            }
            assert.deepEqual(after.pemis, ST.db0.pemis, 'pemis 表不動')
            //端到端不變式: 改名前後各使用者之授權不變(連帶更新引用)
            assert.deepEqual(await getResolvedActiveTargets(page, 'id-rc-ru'), TREE.P1P3, '改名後 rc-ren-u 之授權不變')
            assert.deepEqual(await getResolvedActiveTargets(page, 'id-rc-rx'), TREE.M1_AND_P1P3, '改名後 rc-ren-ext 之授權不變')
        },
    },
    {
        //E2E-004(spec E2E-004; 對稱既有 e2e-array-form AF-040): 權限頁把權限P4 改名為 rc-ghost-p——該名稱正被外部群組 rc-dang-g 啟用引用、卻在權限清單中查無實體(懸空名) → 按儲存 → 不彈確認框、直接出現失敗訊息框
        //(pemiSavePemisFail 接 renameCascadeNameInUse); 庫內零變更、清單仍為已改名並保留儲存鈕。
        //6 步 user path: ①權限頁 ②雙擊 權限P4 名稱儲存格改為 rc-ghost-p(Enter) ③按儲存 ④沒有確認框, 直接看到失敗訊息(新名稱仍被已不存在之項目的授權設定引用) ⑤按確認 ⑥清單仍為已改名、儲存鈕仍在, 庫內不變
        //圖: ①點擊前框住儲存鈕 ②框住失敗訊息框(整個彈窗面板)
        name: 'E2E-004-pemi-rename-ghost-rejected',
        stages: ['E2E-004-1-click-save', 'E2E-004-2-reject-box'],
        fixture: async () => {
            await syncRows('grups', [mkG('id-rc-dg', 'rc-dang-g', { '權限P1': ON(), 'rc-ghost-p': ON('AND') }, { order: 110 })], F_RC) //引用不存在之權限 rc-ghost-p(懸空)
        },
        run: async (page, lang) => {
            ST.db0 = await snapTables()
            await enter(page, 'pemis', 4)
            const k = await rowIndexByCell(page, 'name', '權限P4')
            await typeIntoCell(page, k, 'name', 'rc-ghost-p')
            assert.equal(await pageSaveShown(page), true, '改名後清單頁出現儲存鈕(已修改)')
            const s1 = await captureStableWithBox(page, iconBtn(page, MDI.upload)) //點擊前: 框住儲存鈕
            await clickSave(page)
            //不點任何鈕即出現失敗訊息框 ⇒ 未彈確認框(確認框會停住儲存流程直到按鈕); 彈窗形狀為單一訊息＋確認鈕, 訊息 = 儲存失敗前綴 + 拒絕原因
            const t = { fail: await tOf(page, 'pemiSavePemisFail'), why: await tOf(page, 'renameCascadeNameInUse') }
            await expectResultBox(page, '改名被拒訊息框', `${t.fail}: ${t.why}`)
            assert.ok(t.why.includes(LIT[lang].inUse), `拒絕原因應含字面片段「${LIT[lang].inUse}」(實得 ${t.why})`)
            const s2 = await captureStableWithBox(page, topModalBox) //結果: 改名被拒之失敗訊息框(框住整個彈窗面板)
            await dismissResultModal(page)
            //零變更; 清單仍為已改名、儲存鈕仍在(資料保留, 可修正後再存)
            assert.deepEqual(await snapTables(), ST.db0, '被拒: 庫內零變更')
            assert.equal(await hasCell(page, 'name', 'rc-ghost-p'), true, '被拒後清單仍為已改名(rc-ghost-p)')
            assert.equal(await pageSaveShown(page), true, '被拒後儲存鈕仍在')
            return [
                { name: 'E2E-004-1-click-save', buf: s1 },
                { name: 'E2E-004-2-reject-box', buf: s2 },
            ]
        },
        semantic: async () => {
            const after = await snapTables()
            assert.equal(rowOf(after.pemis, 'id-for-權限P4').name, '權限P4', '庫內 權限P4 名稱不變')
            assert.ok(!after.pemis.some((p) => p.name === 'rc-ghost-p'), '庫內不得出現 rc-ghost-p 權限')
        },
    },
    {
        //E2E-005(spec E2E-005; 對稱既有 e2e-targets E2E-005／012): 標的頁刪除被權限規則引用之標的 專案A/頁A/區塊A(base seed 中僅 權限P1 之規則含它)後按儲存 → 儲存前確認框(confirmSaveDelRefsTarget: 1 個權限、名單為該標的)
        //→ 按取消: 不送出、清單仍為已刪除狀態並保留儲存鈕、四表零變更。純「按否」路徑(按是之連帶清理由 e2e-targets E2E-005／012 覆蓋)。
        //6 步 user path: ①標的頁 ②勾選該標的列、點「刪除勾選」(列直接移除, 不彈框) ③按儲存 ④看到確認框(將自 1 個權限的規則移除對該管控對象之設定) ⑤按取消 ⑥清單仍已刪除、儲存鈕仍在, 庫內不變
        //圖: ①點擊前框住儲存鈕 ②框住確認框(整個彈窗面板)
        name: 'E2E-005-target-delete-confirm-cancel',
        stages: ['E2E-005-1-click-save', 'E2E-005-2-confirm-box'],
        run: async (page, lang) => {
            //前提: 引用該標的之權限數(由庫內規則集計得, 不寫死; base seed 為 權限P1 一個)
            const nRefs = (await selectAllRows('pemis')).filter((p) => Object.prototype.hasOwnProperty.call(JSON5.parse(p.crules), T.A)).length
            assert.ok(nRefs >= 1, `前提: ${T.A} 被至少一個權限之規則引用`)
            ST.db0 = await snapTables(['users', 'grups', 'pemis', 'targets'])
            await gotoTargets(page)
            await checkRow(page, await rowIndexByCell(page, 'id', T.A), 'id') //標的頁主鍵欄為 id
            await iconBtn(page, MDI.trash).first().click()
            await waitCellGone(page, 'id', T.A) //標的頁刪除當下不彈框, 列直接移除
            assert.equal(await pageSaveShown(page), true, '刪除後清單頁出現儲存鈕(已修改)')
            const s1 = await captureStableWithBox(page, iconBtn(page, MDI.upload)) //點擊前: 框住儲存鈕
            await clickSave(page)
            const expConfirm = await fmtT(page, 'confirmSaveDelRefsTarget', { n: nRefs, list: T.A })
            await expectConfirmBox(page, '儲存確認框', expConfirm, LIT[lang].delTarget(nRefs))
            const s2 = await captureStableWithBox(page, topModalBox) //結果: 標的刪除之儲存前確認框(框住整個彈窗面板)
            //按取消: 中止儲存、不送出; 刪除狀態與儲存鈕保留
            await clickModalBtn(page, 'no')
            await waitModalGone(page, '儲存確認框(否)關閉', expConfirm)
            assert.deepEqual(await topModalLines(page), [], '按取消後無任何彈窗(未送出, 無成功／失敗訊息)')
            assert.equal(await hasCell(page, 'id', T.A), false, '按取消後清單仍為已刪除狀態(刪除保留於編輯中)')
            assert.equal(await pageSaveShown(page), true, '按取消後儲存鈕仍在(已修改保留)')
            assert.deepEqual(await snapTables(['users', 'grups', 'pemis', 'targets']), ST.db0, '按取消: 不送出, 四表零變更')
            return [
                { name: 'E2E-005-1-click-save', buf: s1 },
                { name: 'E2E-005-2-confirm-box', buf: s2 },
            ]
        },
        semantic: async () => {
            const ts = await selectAllRows('targets')
            assert.ok(hasRow(ts, T.A), '庫內標的仍在(按取消未送出)')
        },
    },
    {
        //E2E-006(spec E2E-006; F-23 原則 7): 群組頁新增一個名稱為 rc-ghost-g 之群組——該名稱正被 2 位外部使用者啟用引用(其中 1 位以 AND 引用)卻查無實體(懸空名) → 按儲存 → 新增確認框(confirmAddRefsAndGrup: n=2、m=1、名單 rc-ghost-g)
        //→ 按取消: 不送出、保留編輯與儲存鈕、庫內零變更 → 再儲存按確定 → 成功訊息(原文字)、群組寫入、兩位使用者之授權設定不被改寫(授權不變: 新群組尚無指派)。
        //6 步 user path: ①群組頁 ②點「新增」③新列名稱改為 rc-ghost-g ④按儲存 ⑤看到新增確認框(2 位使用者已引用此名稱、其中 1 位以 AND) ⑥按取消保留編輯; 再儲存、按確定, 看到成功訊息
        //圖: ①點擊前框住儲存鈕 ②框住新增確認框(整個彈窗面板)
        name: 'E2E-006-grup-add-dangling-confirm',
        stages: ['E2E-006-1-click-save', 'E2E-006-2-add-confirm'],
        fixture: async () => {
            await syncRows('users', [
                mkU('id-rc-dg1', 'rc-dg-u1', { 'rc-ghost-g': ON() }, { order: 110 }), //OR 引用懸空名
                mkU('id-rc-dg2', 'rc-dg-u2', { ...M1_OR, 'rc-ghost-g': ON('AND') }, { order: 111 }), //M1 之 OR 與懸空名之 AND
            ], F_RC)
        },
        run: async (page, lang) => {
            //前提: 兩位使用者之授權皆為空(OR 引用懸空名不增加授權; AND 引用懸空名使結果為空)
            assert.deepEqual(await getResolvedActiveTargets(page, 'id-rc-dg1'), TREE.EMPTY, '新增前 rc-dg-u1 之授權為空(OR 引用懸空名)')
            assert.deepEqual(await getResolvedActiveTargets(page, 'id-rc-dg2'), TREE.EMPTY, '新增前 rc-dg-u2 之授權為空(AND 引用懸空名)')
            ST.db0 = await snapTables()
            await enter(page, 'grups', 4)
            await clickAdd(page)
            await typeIntoCell(page, 0, 'name', 'rc-ghost-g')
            assert.equal(await pageSaveShown(page), true, '新增後清單頁出現儲存鈕')
            const s1 = await captureStableWithBox(page, iconBtn(page, MDI.upload)) //點擊前: 框住儲存鈕
            await clickSave(page)
            const expConfirm = await fmtT(page, 'confirmAddRefsAndGrup', { n: 2, m: 1, list: 'rc-ghost-g' })
            await expectConfirmBox(page, '新增確認框', expConfirm, LIT[lang].addConfirm)
            const s2 = await captureStableWithBox(page, topModalBox) //結果: 新增撞懸空名之確認框(框住整個彈窗面板)
            //按取消: 不送出; 新列與儲存鈕保留; 庫內零變更
            await clickModalBtn(page, 'no')
            await waitModalGone(page, '新增確認框(否)關閉', expConfirm)
            assert.deepEqual(await topModalLines(page), [], '按取消後無任何彈窗(未送出)')
            assert.equal(await hasCell(page, 'name', 'rc-ghost-g'), true, '按取消後新列仍在清單')
            assert.equal(await pageSaveShown(page), true, '按取消後儲存鈕仍在')
            assert.deepEqual(await snapTables(), ST.db0, '按取消: 不送出, 庫內零變更')
            //再儲存、按確定: 送出並成功
            await clickSave(page)
            await answerConfirm(page, '新增確認框(第二次)', expConfirm, 'yes', LIT[lang].addConfirm)
            await expectResultBox(page, '成功彈窗', await tOf(page, 'grupSaveGrupsSuccess'))
            await dismissResultModal(page)
            return [
                { name: 'E2E-006-1-click-save', buf: s1 },
                { name: 'E2E-006-2-add-confirm', buf: s2 },
            ]
        },
        semantic: async (page) => {
            const after = await snapTables()
            //spec E2E-006 驗證: 庫內多一個 rc-ghost-g(後台列); 兩位引用者之 cgrups 逐字不變、來源不變; 授權不變(新群組尚無指派)
            const gs = after.grups.filter((g) => g.name === 'rc-ghost-g')
            assert.equal(gs.length, 1, '庫內應恰有一個 rc-ghost-g')
            assert.equal(gs[0].from, '', '新增之群組為後台列(from 為空)')
            for (const id of ['id-rc-dg1', 'id-rc-dg2']) {
                assert.deepEqual(rowOf(after.users, id), rowOf(ST.db0.users, id), `${id} 之列整列逐位元不動(新增群組不改寫引用端)`)
            }
            assert.deepEqual(await getResolvedActiveTargets(page, 'id-rc-dg1'), TREE.EMPTY, '新增後 rc-dg-u1 之授權仍為空(新群組尚無指派)')
            assert.deepEqual(await getResolvedActiveTargets(page, 'id-rc-dg2'), TREE.EMPTY, '新增後 rc-dg-u2 之授權仍為空')
        },
    },
    {
        //E2E-007(spec E2E-007): 群組頁新增一個名稱為 rc-fresh-g 之群組——沒有任何使用者之授權設定引用此名稱 → 按儲存 → 不彈新增確認框、直接出現成功訊息(原文字)、群組寫入。純語意(E2E-006 之對照)。
        //6 步 user path: ①群組頁 ②點「新增」③新列名稱改為 rc-fresh-g ④按儲存 ⑤沒有確認框, 直接看到成功訊息 ⑥庫內多一個 rc-fresh-g
        name: 'E2E-007-grup-add-fresh-noconfirm',
        stages: [],
        run: async (page) => {
            await enter(page, 'grups', 4)
            await clickAdd(page)
            await typeIntoCell(page, 0, 'name', 'rc-fresh-g')
            await clickSave(page)
            //不點任何鈕即出現成功訊息 ⇒ 未彈確認框(確認框為否／是四行, 會使成功訊息之等待逾時); 彈窗形狀為單一訊息＋確認鈕
            await expectResultBox(page, '成功彈窗(無確認框)', await tOf(page, 'grupSaveGrupsSuccess'))
            await dismissResultModal(page)
            assert.equal(await pageSaveShown(page), false, '儲存成功後儲存鈕消失')
            return null
        },
        semantic: async () => {
            const gs = (await selectAllRows('grups')).filter((g) => g.name === 'rc-fresh-g')
            assert.equal(gs.length, 1, '庫內應恰有一個 rc-fresh-g')
            assert.equal(gs[0].from, '', '新增之群組為後台列(from 為空)')
        },
    },
    {
        //E2E-008(spec E2E-008; 對稱既有 e2e-array-form AF-041): 後端設定 cascadeRename:false 下, 群組頁把被引用之 rc-ren-g 改名為 rc-ren-g-new 後按儲存 → 不彈改名預覽確認框、直接出現成功訊息(原文字, 不附筆數);
        //庫內引用端未被改寫(仍引用舊名稱)而成為懸空 → 授權依懸空收嚴(rc-ren-u 與 rc-ren-ext 皆為空); 使用者頁該兩位之 cgrups 儲存格出現懸空警告圖示。純語意。
        //6 步 user path: ①部署方已設 cascadeRename 為 false, 系統管理者登入點「權限群組」②雙擊 rc-ren-g 名稱儲存格改名(Enter) ③按儲存 ④沒有確認框, 直接看到成功訊息 ⑤按確認, 點「使用者」⑥看到兩位引用者之「權限群組」欄出現警告圖示(tooltip 說明在清單中找不到 rc-ren-g)
        name: 'E2E-008-cascade-off-rename',
        stages: [],
        settings: { cascadeRename: false },
        fixture: fxRen,
        run: async (page) => {
            assert.equal(await page.evaluate(() => window.$vo.$store.state.webInfor.cascadeRename), false, '前提: 前端取得之 webInfor.cascadeRename 為 false(後端已以 cascadeRename:false 重啟)')
            assert.deepEqual(await getResolvedActiveTargets(page, 'id-rc-ru'), TREE.P1P3, '改名前 rc-ren-u 之授權 = P1 ∪ P3')
            assert.deepEqual(await getResolvedActiveTargets(page, 'id-rc-rx'), TREE.M1_AND_P1P3, '改名前 rc-ren-ext 之授權 = M1 ∩ (P1 ∪ P3)')
            ST.db0 = await snapTables()
            await enter(page, 'grups', 5)
            await typeIntoCell(page, await rowIndexByCell(page, 'name', 'rc-ren-g'), 'name', 'rc-ren-g-new')
            await clickSave(page)
            //不點任何鈕即出現成功訊息 ⇒ 未彈改名確認框; 訊息逐字為原成功文字(不附筆數)
            await expectResultBox(page, '成功彈窗(無確認框)', await tOf(page, 'grupSaveGrupsSuccess'))
            await dismissResultModal(page)
            //授權(R-AUTH-MERGE-00; 引用名稱查無實體 ⇒ 懸空, 以其 mode 參與、內容全 n): rc-ren-u(OR 引用懸空名)→ 空; rc-ren-ext(M1 之 OR 與懸空名之 AND)→ 空
            assert.deepEqual(await getResolvedActiveTargets(page, 'id-rc-ru'), TREE.EMPTY, '改名後 rc-ren-u 之引用成為懸空 → 授權為空')
            assert.deepEqual(await getResolvedActiveTargets(page, 'id-rc-rx'), TREE.EMPTY, '改名後 rc-ren-ext 之 AND 引用懸空 → 授權為空(收嚴)')
            //使用者頁: 兩位引用者之 cgrups 儲存格出現懸空警告圖示, base seed 四位無圖示
            await enter(page, 'users', 6) //base 4 + rc-ren-u + rc-ren-ext
            const expDang = await fmtT(page, 'warnRefDangling', { names: 'rc-ren-g', kind: await tOf(page, 'warnKindGrup') })
            for (const nm of ['rc-ren-u', 'rc-ren-ext']) {
                const k = await rowIndexByCell(page, 'name', nm)
                await waitUntilExist(page, `${nm} 警告圖示`, (a) => !!document.querySelector(`.ag-row[row-index="${a.k}"] .ag-cell[col-id="cgrups"] img[src^="data:image/png;base64"]`), { arg: { k }, timeout: 20000 })
                assert.equal(await cellWarnTitle(page, k, 'cgrups'), expDang, `${nm} 之 cgrups 儲存格警告 tooltip 為 warnRefDangling(rc-ren-g)`)
            }
            for (const nm of ['peter', 'mary', 'john', 'admin']) {
                assert.equal(await cellWarnTitle(page, await rowIndexByCell(page, 'name', nm), 'cgrups'), null, `base seed 使用者 ${nm} 之 cgrups 不應有警告圖示`)
            }
            return null
        },
        semantic: async () => {
            const after = await snapTables()
            //spec E2E-008 驗證: 庫內群組已改名、使用者之引用未改寫(users 表整表逐位元不動)、pemis 不動
            assert.equal(rowOf(after.grups, 'id-rc-reng').name, 'rc-ren-g-new', 'DB: rc-ren-g 已更名')
            assert.deepEqual(after.users, ST.db0.users, 'DB: 使用者之引用未改寫(cgrups 仍為 rc-ren-g; users 表逐位元不動)')
            assert.deepEqual(after.pemis, ST.db0.pemis, 'pemis 表不動')
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
        describe(`e2e-ref-cascade (${lang})`, function() {
            this.timeout(300000)
            before(async function() {
                this.timeout(400000)
                await startServersOnce()
                await iso.capture() //擷取三表現況為還原依據(須為 pristine base seed 且無外部列)
            })
            //檔尾還原(R-E2E-ISO-01): 單一 mocha 行程全跑時最後一案之改動(含夾具)不遺留給下一個檔
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
