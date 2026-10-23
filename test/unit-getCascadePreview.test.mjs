//清單頁「儲存」前之引用連帶預覽與成功訊息(src/js/getCascadePreview.mjs; 規則帳本 R-PRINCIPLE-00 原則 6、適用表 m／n; R-REF-CASCADE-01; ADR-036; run06 ui)
//
//述語(規格句):
//  GCP-1 群組頁／權限頁改名: plan.err 為 null、有改名且有引用端因改名被連帶更新 → 確認框(舊→新名單, 至多 5 個, 只列有人引用者; 引用端有外部應用來源者另加一句警示); 無影響不彈框;
//        plan.err 非 null 不彈框、不附筆數(伺服端以固定語系鍵拒存); 僅刪除所致之清理不重複確認(刪除時已確認)且成功訊息不變(既有案例刪除被引用列後儲存之成功彈窗標準圖不得改變); 確認框之數量為「因改名被更新之引用端數」, 不含僅因刪除被清理者;
//        成功訊息只在「有改名且有引用端因改名被更新」時附筆數(nRenameHolders, 不是 nHolders), 其餘維持原文字(successText 為空字串); cascadeRename:false(伺服端不做改名級聯)時不產改名確認框與附筆數成功訊息;
//  GCP-2 標的頁: 刪除或改 id(等同刪舊增新, 不級聯)使權限之規則被清理 → 確認框(被刪除或已改 id 之管控對象名單, 至多 5 個, 只列有人引用者); 無人引用不彈框; 成功訊息一律不變(successText 恆為空字串);
//  GCP-3 名單只列「真的有人引用」者(與 rewriteRefs 逐名探測之結果一致: 物件／陣列形式、數字名、含「.」與原型鍵名之標的); 名稱含 $&、{n}、{list} 等字樣原樣顯示(單趟代入);
//  GCP-4 fmtWarn 擴充之 {m}、{w}、{e}、{list} 單趟代入; GCP-5 「刪除被 AND 引用者之授權可能變多」之文案依據(真 getUserRules);
//  GCP-6 語系鍵齊備(eng／cht、佔位符); SITE-GCP 站點: 三個清單頁之 core() 接線(先預覽、確認框前釋放按鈕鎖、選否中止不送出、成功訊息無改名連帶時維持原文字; 標的頁不讀 successText; 群組頁／權限頁傳 cascadeRename).
//
//跑法: npx mocha test/unit-getCascadePreview.test.mjs --reporter list --timeout 30000
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import procLang from '../server/procLang.mjs'
import { getCascadePreview, getSavePreview, joinList } from '../src/js/getCascadePreview.mjs'
import { planRefChanges, rewriteRefs, diffRefTargets } from '../src/js/refCascade.mjs'
import { fmtWarn, getRefWarns } from '../src/js/getAuthWarn.mjs'
import { getDelImpact, getDelConfirmText } from '../src/js/getDelRefCount.mjs'
import { getUserRules } from '../src/plugins/mShare.mjs'
import submitGuard from '../src/plugins/submitGuard.mjs'
import { sourceLines } from './tools/srcScan.mjs'


const projRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const LANG = procLang({})
const LANGS = ['eng', 'cht']

//原型鍵名以變數取用(無原型容器之自有屬性; 避免 no-proto 規則誤判為存取原型)
const PROTO = '__proto__'
let tOf = (lang) => (key) => LANG[lang][key]

let OR = (n) => JSON.stringify({ [n]: { mode: 'OR', isActive: 'y' } })
let AND = (n) => JSON.stringify({ [n]: { mode: 'AND', isActive: 'y' } })

//render: 獨立於 fmtWarn 之範本代入(哨兵法): 先把各佔位符換成不會出現在值內之哨兵, 最後才換回值, 故值內之 {n}、$& 等字樣不被二次代入
let render = (tpl, kp) => {
    let ks = Object.keys(kp)
    let s = tpl
    ks.forEach((k, i) => {
        s = s.split(`{${k}}`).join(`\u0000${i}\u0000`)
    })
    ks.forEach((k, i) => {
        s = s.split(`\u0000${i}\u0000`).join(String(kp[k]))
    })
    return s
}

//頁面設定: kind、被引用表、引用端欄位、確認框／成功訊息之語系鍵
let PAGES = {
    Grup: { keyTable: 'grups', field: 'cgrups', confirm: 'confirmSaveRenameRefsGrup', confirmExt: 'confirmSaveRenameRefsExtGrup', success: 'grupSaveGrupsSuccessCascade' },
    Pemi: { keyTable: 'pemis', field: 'cpemis', confirm: 'confirmSaveRenameRefsPemi', confirmExt: 'confirmSaveRenameRefsExtPemi', success: 'pemiSavePemisSuccessCascade' },
}

let rows = (...names) => names.map((name, k) => ({ id: `id${k + 1}`, name }))
let renamed = (rs, kp) => rs.map((r) => (r.id in kp ? { ...r, name: kp[r.id] } : r))
let silent = (fn) => {
    let log = console.log
    console.log = () => {}
    try {
        return fn()
    }
    finally {
        console.log = log
    }
}


describe('unit-getCascadePreview (儲存前引用連帶預覽, R-REF-CASCADE-01)', function() {

    // ===== GCP-1: 群組頁／權限頁改名預覽 =====
    describe('GCP-1 群組頁／權限頁: 改名預覽與成功訊息', function() {

        it('GCP-001 有引用端被連帶更新 → 確認框(筆數、舊→新)與附筆數之成功訊息; 兩頁 × eng／cht', function() {
            for (let [kind, pg] of Object.entries(PAGES)) {
                for (let lang of LANGS) {
                    let $t = tOf(lang)
                    let old = rows('A', 'C')
                    let hs = [
                        { id: 'h1', [pg.field]: OR('A') },
                        { id: 'h2', [pg.field]: AND('A') },
                        { id: 'h3', [pg.field]: JSON.stringify({ A: { mode: 'OR', isActive: 'n' } }) }, //停用之引用亦被改寫
                        { id: 'h4', [pg.field]: OR('C') }, //引用未改名者: 不受影響
                    ]
                    let pv = getSavePreview({ kind, rowsOld: old, rowsNew: renamed(old, { id1: 'B' }), holdersOld: hs, $t })
                    assert.strictEqual(pv.plan.err, null)
                    assert.strictEqual(pv.plan.nRenameHolders, 3)
                    assert.strictEqual(pv.confirmText, render($t(pg.confirm), { n: 3, list: 'A→B' }), `${kind} ${lang}`)
                    assert.strictEqual(pv.successText, render($t(pg.success), { n: 3 }), `${kind} ${lang}`)
                    assert.ok(!pv.confirmText.includes('{') && !pv.successText.includes('{'), '佔位符皆已代入')
                    //非外部來源: 不含外部警示句(使用非 Ext 之鍵)
                    assert.ok(!$t(pg.confirm).includes('{e}'))
                }
            }
        })

        it('GCP-002 含外部應用來源之引用端(from 非空) → 使用 Ext 鍵並代入 {e}(只計因改名被更新者)', function() {
            for (let [kind, pg] of Object.entries(PAGES)) {
                for (let lang of LANGS) {
                    let $t = tOf(lang)
                    let old = rows('A', 'C')
                    let hs = [
                        { id: 'h1', from: 'app1', [pg.field]: OR('A') },
                        { id: 'h2', from: '', [pg.field]: OR('A') },
                        { id: 'h3', from: 'app2', [pg.field]: OR('C') }, //外部來源但未被改名影響: 不計入 e
                    ]
                    let pv = getSavePreview({ kind, rowsOld: old, rowsNew: renamed(old, { id1: 'B' }), holdersOld: hs, $t })
                    assert.strictEqual(pv.confirmText, render($t(pg.confirmExt), { n: 2, e: 1, list: 'A→B' }), `${kind} ${lang}`)
                    assert.ok(pv.confirmText.includes('A→B') && !pv.confirmText.includes('{'))
                    assert.notStrictEqual(pv.confirmText, render($t(pg.confirm), { n: 2, list: 'A→B' }))
                    assert.strictEqual(pv.plan.nExternal, 1)
                }
            }
        })

        it('GCP-003 無影響不彈框、成功訊息維持原文字(空字串): 無改名、改名但無人引用、不同名之引用', function() {
            for (let [kind, pg] of Object.entries(PAGES)) {
                for (let lang of LANGS) {
                    let $t = tOf(lang)
                    let old = rows('A', 'C')
                    let none = { confirmText: '', successText: '' }
                    let pick = (pv) => ({ confirmText: pv.confirmText, successText: pv.successText })
                    //無任何異動
                    assert.deepStrictEqual(pick(getSavePreview({ kind, rowsOld: old, rowsNew: old, holdersOld: [{ id: 'h1', [pg.field]: OR('A') }], $t })), none)
                    //改名但無人引用(引用者引用的是別的名稱)
                    assert.deepStrictEqual(pick(getSavePreview({ kind, rowsOld: old, rowsNew: renamed(old, { id1: 'B' }), holdersOld: [{ id: 'h1', [pg.field]: OR('C') }, { id: 'h2', [pg.field]: '' }, { id: 'h3', [pg.field]: '{}' }], $t })), none)
                    //只改 description 等其他欄位(名稱不變)
                    assert.deepStrictEqual(pick(getSavePreview({ kind, rowsOld: old, rowsNew: old.map((r) => ({ ...r, description: 'x' })), holdersOld: [{ id: 'h1', [pg.field]: OR('A') }], $t })), none)
                    //新增列(新 id)不算改名
                    assert.deepStrictEqual(pick(getSavePreview({ kind, rowsOld: old, rowsNew: [...old, { id: 'new', name: 'N' }], holdersOld: [{ id: 'h1', [pg.field]: OR('N') }], $t })), none)
                    //輸入不是陣列: 不拋錯、無影響
                    assert.deepStrictEqual(pick(getSavePreview({ kind, rowsOld: null, rowsNew: undefined, holdersOld: null, $t })), none)
                }
            }
        })

        it('GCP-004 plan.err 非 null(伺服端將以固定語系鍵拒存) → 不彈框、不附筆數(由呼叫端照常送出); 三個錯誤鍵皆有 eng／cht 供 $tErr 顯示', function() {
            for (let [kind, pg] of Object.entries(PAGES)) {
                for (let lang of LANGS) {
                    let $t = tOf(lang)
                    let none = { confirmText: '', successText: '' }
                    let pick = (pv) => ({ confirmText: pv.confirmText, successText: pv.successText })
                    //renameCascadeNameInUse: 新名為「仍被啟用中引用而無任何實體」之懸空名
                    let old = rows('A')
                    let pv1 = getSavePreview({ kind, rowsOld: old, rowsNew: renamed(old, { id1: 'B' }), holdersOld: [{ id: 'h1', [pg.field]: OR('A') }, { id: 'h2', [pg.field]: OR('B') }], $t })
                    assert.strictEqual(pv1.plan.err, 'renameCascadeNameInUse')
                    assert.deepStrictEqual(pick(pv1), none)
                    //renameCascadeDupGroup: 被改名者屬歷史同名組且該名稱仍被引用
                    let dup = rows('A', 'A')
                    let pv2 = getSavePreview({ kind, rowsOld: dup, rowsNew: renamed(dup, { id1: 'B' }), holdersOld: [{ id: 'h1', [pg.field]: OR('A') }], $t })
                    assert.strictEqual(pv2.plan.err, 'renameCascadeDupGroup')
                    assert.deepStrictEqual(pick(pv2), none)
                    //renameCascadeConflict: 某引用端同時含舊名與新名(新名之項目停用, 不屬懸空名檢查)
                    let two = rows('A', 'B')
                    let pv3 = getSavePreview({ kind, rowsOld: two, rowsNew: renamed(two, { id1: 'C' }), holdersOld: [{ id: 'h1', [pg.field]: JSON.stringify({ A: { mode: 'OR', isActive: 'y' }, C: { mode: 'OR', isActive: 'n' } }) }], $t })
                    assert.strictEqual(pv3.plan.err, 'renameCascadeConflict')
                    assert.deepStrictEqual(pick(pv3), none)
                    //plan.err 非 null 者, 即使 plan 內另有改名與引用端, getCascadePreview 亦回空
                    assert.deepStrictEqual(getCascadePreview({ ...pv1.plan, err: 'renameCascadeNameInUse', renames: [{ id: 'id1', from: 'A', to: 'B' }], nRenameHolders: 3, nHolders: 3 }, $t, kind), none)
                }
            }
            //錯誤鍵(伺服端 saveCascadePartial 等)之文字存在於兩語系, 供既有 showCheckYes(`${$t(Fail)}: ${$tErr(err)}`) 顯示
            for (let k of ['renameCascadeDupGroup', 'renameCascadeNameInUse', 'renameCascadeConflict', 'saveCascadePartial']) {
                for (let lang of LANGS) {
                    assert.ok(typeof LANG[lang][k] === 'string' && LANG[lang][k].length > 0, `${lang} ${k}`)
                }
            }
        })

        it('GCP-005 僅因刪除被清理(無人因改名被更新) → 不重複彈確認框(刪除時已確認)且成功訊息不變(successText 空, 既有案例之成功彈窗標準圖不得改變); 同時有改名與刪除 → 確認框與成功訊息之筆數皆為因改名被更新者(nRenameHolders), 不是全部被改寫者(nHolders)', function() {
            for (let [kind, pg] of Object.entries(PAGES)) {
                for (let lang of LANGS) {
                    let $t = tOf(lang)
                    let old = rows('A', 'C', 'D')
                    //只刪除 C
                    let pv1 = getSavePreview({ kind, rowsOld: old, rowsNew: [old[0], old[2]], holdersOld: [{ id: 'h1', [pg.field]: OR('C') }, { id: 'h2', [pg.field]: AND('C') }], $t })
                    assert.strictEqual(pv1.plan.nDelHolders, 2)
                    assert.strictEqual(pv1.plan.nHolders, 2)
                    assert.strictEqual(pv1.confirmText, '')
                    assert.strictEqual(pv1.successText, '', '只刪除: 成功訊息維持原文字')
                    //A 改名為 B(h1 引用)、C 刪除(h2 引用): 確認框與成功訊息之 n 皆為 1(nRenameHolders), 而非 nHolders(2)
                    let hs = [{ id: 'h1', [pg.field]: OR('A') }, { id: 'h2', [pg.field]: OR('C') }]
                    let pv2 = getSavePreview({ kind, rowsOld: old, rowsNew: [{ ...old[0], name: 'B' }, old[2]], holdersOld: hs, $t })
                    assert.strictEqual(pv2.plan.nHolders, 2)
                    assert.strictEqual(pv2.plan.nRenameHolders, 1)
                    assert.strictEqual(pv2.confirmText, render($t(pg.confirm), { n: 1, list: 'A→B' }))
                    assert.strictEqual(pv2.successText, render($t(pg.success), { n: 1 }), '改名＋刪除並存: 成功訊息筆數為 nRenameHolders')
                    assert.notStrictEqual(pv2.successText, render($t(pg.success), { n: 2 }))
                    //同一引用端同時引用改名者與被刪者: 計 1 位
                    let pv3 = getSavePreview({ kind, rowsOld: old, rowsNew: [{ ...old[0], name: 'B' }, old[2]], holdersOld: [{ id: 'h1', [pg.field]: JSON.stringify({ A: { mode: 'OR', isActive: 'y' }, C: { mode: 'AND', isActive: 'y' } }) }], $t })
                    assert.strictEqual(pv3.plan.nHolders, 1)
                    assert.strictEqual(pv3.confirmText, render($t(pg.confirm), { n: 1, list: 'A→B' }))
                    assert.strictEqual(pv3.successText, render($t(pg.success), { n: 1 }))
                }
            }
        })

        it('GCP-010 成功訊息只在「Grup／Pemi 有改名且有引用端因改名被更新」時產生(筆數 ＝ nRenameHolders): 只改名且有引用端 → 非空; 只刪除 → 空; 有改名但無人引用 → 空; plan.err 非 null → 空; Target → 空; 非空時以 $t(success) 之範本代入, 無殘留佔位符', function() {
            for (let [kind, pg] of Object.entries(PAGES)) {
                for (let lang of LANGS) {
                    let $t = tOf(lang)
                    let old = rows('A', 'C')
                    //只改名且有 3 個引用端(含停用項、外部來源): 非空, n = nRenameHolders
                    let hs = [{ id: 'h1', [pg.field]: OR('A') }, { id: 'h2', from: 'app', [pg.field]: AND('A') }, { id: 'h3', [pg.field]: JSON.stringify({ A: { mode: 'OR', isActive: 'n' } }) }, { id: 'h4', [pg.field]: OR('C') }]
                    let pv = getSavePreview({ kind, rowsOld: old, rowsNew: renamed(old, { id1: 'B' }), holdersOld: hs, $t })
                    assert.strictEqual(pv.plan.nRenameHolders, 3)
                    assert.strictEqual(pv.plan.nHolders, 3)
                    assert.notStrictEqual(pv.successText, '')
                    assert.strictEqual(pv.successText, render($t(pg.success), { n: pv.plan.nRenameHolders }))
                    assert.ok(!pv.successText.includes('{'))
                    //只刪除(有 nDelHolders): 空
                    let pvDel = getSavePreview({ kind, rowsOld: old, rowsNew: [old[0]], holdersOld: hs, $t })
                    assert.ok(pvDel.plan.nDelHolders > 0)
                    assert.strictEqual(pvDel.successText, '')
                    //有改名但無人引用: 空
                    assert.strictEqual(getSavePreview({ kind, rowsOld: old, rowsNew: renamed(old, { id1: 'B' }), holdersOld: [{ id: 'h4', [pg.field]: OR('C') }], $t }).successText, '')
                    //plan.err 非 null: 空
                    let pvErr = getSavePreview({ kind, rowsOld: old, rowsNew: renamed(old, { id1: 'B' }), holdersOld: [...hs, { id: 'h5', [pg.field]: OR('B') }], $t })
                    assert.strictEqual(pvErr.plan.err, 'renameCascadeNameInUse')
                    assert.strictEqual(pvErr.successText, '')
                }
            }
            //Target: 即使有權限之規則被清理, 成功訊息亦不變(KIND.Target 無 success 鍵; 被清理之權限數已於確認框告知)
            for (let lang of LANGS) {
                let $t = tOf(lang)
                let planT = planRefChanges({ keyTable: 'targets', rowsOld: [{ id: 'T1' }, { id: 'T2' }], rowsNew: [{ id: 'T2' }], holdersOld: [{ id: 'p1', crules: JSON.stringify({ T1: 'y' }) }] })
                assert.strictEqual(planT.nHolders, 1)
                let r = getCascadePreview(planT, $t, 'Target')
                assert.notStrictEqual(r.confirmText, '', '標的頁仍彈確認框')
                assert.strictEqual(r.successText, '')
            }
        })

        it('GCP-011 cascadeRename:false(伺服端 opt.cascadeRename:false; 前端由 webInfor.cascadeRename 傳入) → 無改名級聯: getSavePreview 不產改名確認框、不附筆數成功訊息、plan.renames 為空、不產改名相關 err; 預設／true 為級聯; 刪除連帶清理與標的頁不受影響', function() {
            for (let [kind, pg] of Object.entries(PAGES)) {
                for (let lang of LANGS) {
                    let $t = tOf(lang)
                    let old = rows('A', 'C')
                    let hs = [{ id: 'h1', from: 'app', [pg.field]: OR('A') }, { id: 'h2', [pg.field]: AND('A') }]
                    let nw = renamed(old, { id1: 'B' })
                    let off = getSavePreview({ kind, rowsOld: old, rowsNew: nw, holdersOld: hs, cascadeRename: false, $t })
                    assert.strictEqual(off.plan.err, null)
                    assert.deepStrictEqual(off.plan.renames, [])
                    assert.strictEqual(off.plan.nRenameHolders, 0)
                    assert.strictEqual(off.confirmText, '', `${kind} ${lang}: cascadeRename:false 不產改名確認框`)
                    assert.strictEqual(off.successText, '', `${kind} ${lang}: cascadeRename:false 不附筆數`)
                    //預設(未給)與 true: 照常級聯
                    for (let extra of [{}, { cascadeRename: true }, { cascadeRename: undefined }]) {
                        let on = getSavePreview({ kind, rowsOld: old, rowsNew: nw, holdersOld: hs, ...extra, $t })
                        assert.strictEqual(on.confirmText, render($t(pg.confirmExt), { n: 2, e: 1, list: 'A→B' }), `${kind} ${lang} ${JSON.stringify(extra)}`)
                        assert.strictEqual(on.successText, render($t(pg.success), { n: 2 }))
                    }
                    //cascadeRename:false 時不產生改名相關拒絕(伺服端亦同): 懸空名接管、歷史同名組改名
                    let ghost = getSavePreview({ kind, rowsOld: old, rowsNew: nw, holdersOld: [...hs, { id: 'h3', [pg.field]: OR('B') }], cascadeRename: false, $t })
                    assert.strictEqual(ghost.plan.err, null)
                    let dup = rows('A', 'A')
                    assert.strictEqual(getSavePreview({ kind, rowsOld: dup, rowsNew: renamed(dup, { id1: 'B' }), holdersOld: [{ id: 'h1', [pg.field]: OR('A') }], cascadeRename: false, $t }).plan.err, null)
                    //刪除連帶清理不受此設定影響: plan 仍有 nDelHolders(群組頁／權限頁於刪除時之確認走 getDelImpact, 與此設定無關)
                    let del = getSavePreview({ kind, rowsOld: old, rowsNew: [old[1]], holdersOld: hs, cascadeRename: false, $t })
                    assert.strictEqual(del.plan.nDelHolders, 2)
                }
            }
            //標的頁不受 cascadeRename 影響(標的 id 改名本即不級聯): 刪除被引用之標的仍彈確認框
            for (let lang of LANGS) {
                let $t = tOf(lang)
                let hs = [{ id: 'p1', crules: JSON.stringify({ T1: 'y' }) }]
                let a = getSavePreview({ kind: 'Target', rowsOld: [{ id: 'T1' }], rowsNew: [], holdersOld: hs, cascadeRename: false, $t })
                let b = getSavePreview({ kind: 'Target', rowsOld: [{ id: 'T1' }], rowsNew: [], holdersOld: hs, $t })
                assert.strictEqual(a.confirmText, b.confirmText)
                assert.notStrictEqual(a.confirmText, '')
            }
        })

        it('GCP-006 名單: 只列有人引用之改名; 引用端為陣列形式亦列; 超過 5 個只列前 5 個並附「共 N 個」; 恰 5 個不附', function() {
            for (let [kind, pg] of Object.entries(PAGES)) {
                for (let lang of LANGS) {
                    let $t = tOf(lang)
                    //g1 A→B 有人引用、g2 C→D 無人引用
                    let old = rows('A', 'C')
                    let pv = getSavePreview({ kind, rowsOld: old, rowsNew: renamed(old, { id1: 'B', id2: 'D' }), holdersOld: [{ id: 'h1', [pg.field]: JSON.stringify([{ name: 'A', mode: 'OR', isActive: 'y' }]) }], $t })
                    assert.strictEqual(pv.confirmText, render($t(pg.confirm), { n: 1, list: 'A→B' }), '陣列形式之引用亦列; 無人引用之 C→D 不列')
                    assert.ok(!pv.confirmText.includes('C→D'))

                    //7 個改名皆有人引用
                    let names = ['n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7']
                    let many = rows(...names)
                    let kpNew = {}
                    many.forEach((r, k) => {
                        kpNew[r.id] = `m${k + 1}`
                    })
                    let hs = names.map((n, k) => ({ id: `h${k}`, [pg.field]: OR(n) }))
                    let pv7 = getSavePreview({ kind, rowsOld: many, rowsNew: renamed(many, kpNew), holdersOld: hs, $t })
                    let list7 = `n1→m1, n2→m2, n3→m3, n4→m4, n5→m5 ${render($t('cascadeListMore'), { n: 7 })}`
                    assert.strictEqual(pv7.confirmText, render($t(pg.confirm), { n: 7, list: list7 }))
                    assert.ok(!pv7.confirmText.includes('n6→m6') && !pv7.confirmText.includes('n7→m7'), '第 6 個之後不列')
                    assert.ok(pv7.confirmText.includes('7'))

                    //恰 5 個: 不附「共 N 個」
                    let five = rows(...names.slice(0, 5))
                    let kp5 = {}
                    five.forEach((r, k) => {
                        kp5[r.id] = `m${k + 1}`
                    })
                    let pv5 = getSavePreview({ kind, rowsOld: five, rowsNew: renamed(five, kp5), holdersOld: hs.slice(0, 5), $t })
                    assert.strictEqual(pv5.confirmText, render($t(pg.confirm), { n: 5, list: 'n1→m1, n2→m2, n3→m3, n4→m4, n5→m5' }))
                }
            }
        })

        it('GCP-007 名稱含 $&、$$、{n}、{list}、{e}、{kind} 等字樣原樣顯示(單趟代入, 不被當佔位符或取代樣式); 空字串名稱顯示為 ""', function() {
            for (let [kind, pg] of Object.entries(PAGES)) {
                for (let lang of LANGS) {
                    let $t = tOf(lang)
                    let odd = ['A$&{n}', 'B{list}$$', '{e}', '{kind}', '', 'X$`Y']
                    let old = rows(odd[0], odd[2], '')
                    let nw = renamed(old, { id1: odd[1], id2: odd[3], id3: odd[5] })
                    let hs = [{ id: 'h1', from: 'app', [pg.field]: JSON.stringify([{ name: odd[0], mode: 'OR', isActive: 'y' }, { name: odd[2], mode: 'OR', isActive: 'y' }, { name: '', mode: 'OR', isActive: 'y' }]) }]
                    let pv = getSavePreview({ kind, rowsOld: old, rowsNew: nw, holdersOld: hs, $t })
                    assert.strictEqual(pv.plan.err, null, JSON.stringify(pv.plan.err))
                    let list = 'A$&{n}→B{list}$$, {e}→{kind}, ""→X$`Y'
                    assert.strictEqual(pv.confirmText, render($t(pg.confirmExt), { n: 1, e: 1, list }), `${kind} ${lang}`)
                    assert.ok(pv.confirmText.includes(list), '名單原樣')
                }
            }
        })

        it('GCP-008 防呆: 種類不明、plan 為 null／非物件／缺欄位／keyTable 與種類不符 → 全空; getSavePreview 內部拋例外(如 $t 出錯)不擋儲存(回傳全空)', function() {
            let $t = tOf('eng')
            let none = { confirmText: '', successText: '' }
            let plan = planRefChanges({ keyTable: 'grups', rowsOld: rows('A'), rowsNew: renamed(rows('A'), { id1: 'B' }), holdersOld: [{ id: 'h1', cgrups: OR('A') }] })
            assert.ok(plan.nRenameHolders === 1)
            assert.deepStrictEqual(getCascadePreview(plan, $t, 'Xxx'), none)
            assert.deepStrictEqual(getCascadePreview(plan, $t, 'Pemi'), none, 'keyTable 為 grups, 與 Pemi 不符')
            assert.deepStrictEqual(getCascadePreview(plan, $t, 'Target'), none)
            for (let bad of [null, undefined, 5, 'x', [], {}, { err: null }, { err: null, keyTable: 'grups' }, { err: null, keyTable: 'grups', changes: [], renames: 'x' }]) {
                assert.deepStrictEqual(getCascadePreview(bad, $t, 'Grup'), none, JSON.stringify(bad))
            }
            assert.notStrictEqual(getCascadePreview(plan, $t, 'Grup').confirmText, '')

            //getSavePreview: $t 拋例外 → 全空且 plan 為 null; kind 不明／p 為 null → 全空
            let $tBoom = () => {
                throw new Error('boom')
            }
            let thrown = silent(() => getSavePreview({ kind: 'Grup', rowsOld: rows('A'), rowsNew: renamed(rows('A'), { id1: 'B' }), holdersOld: [{ id: 'h1', cgrups: OR('A') }], $t: $tBoom }))
            assert.deepStrictEqual(thrown, { plan: null, confirmText: '', successText: '' })
            assert.deepStrictEqual(getSavePreview({ kind: 'Xxx', rowsOld: [], rowsNew: [], holdersOld: [], $t }), { plan: null, confirmText: '', successText: '' })
            assert.deepStrictEqual(getSavePreview(null), { plan: null, confirmText: '', successText: '' })
        })

        it('GCP-009 joinList: 至多 5 項以「, 」串接, 超過附 cascadeListMore(總數); 空陣列為空字串', function() {
            for (let lang of LANGS) {
                let $t = tOf(lang)
                assert.strictEqual(joinList([], $t), '')
                assert.strictEqual(joinList(['a'], $t), 'a')
                assert.strictEqual(joinList(['a', 'b', 'c', 'd', 'e'], $t), 'a, b, c, d, e')
                assert.strictEqual(joinList(['a', 'b', 'c', 'd', 'e', 'f'], $t), `a, b, c, d, e ${render($t('cascadeListMore'), { n: 6 })}`)
                assert.strictEqual(joinList(['a', 'b', 'c'], $t, 2), `a, b ${render($t('cascadeListMore'), { n: 3 })}`)
            }
        })

    })


    // ===== GCP-2: 標的頁 =====
    describe('GCP-2 標的頁: 刪除或改 id 使權限之規則被清理', function() {

        let tg = (...ids) => ids.map((id) => ({ id }))
        let pm = (id, kp) => ({ id, crules: JSON.stringify(kp) })

        it('GCP-020 刪除被權限規則引用之標的 → 確認框(權限數、名單); 成功訊息不變(successText 為空, 標的頁不讀); eng／cht', function() {
            for (let lang of LANGS) {
                let $t = tOf(lang)
                let pemis = [pm('p1', { T1: 'y', T2: 'n' }), pm('p2', { T1: 'n' }), pm('p3', { T2: 'y' })]
                let pv = getSavePreview({ kind: 'Target', rowsOld: tg('T1', 'T2', 'T3'), rowsNew: tg('T2', 'T3'), holdersOld: pemis, $t })
                assert.strictEqual(pv.plan.err, null)
                assert.strictEqual(pv.confirmText, render($t('confirmSaveDelRefsTarget'), { n: 2, list: 'T1' }), lang)
                assert.strictEqual(pv.successText, '', lang)
                assert.ok(!pv.confirmText.includes('{'))
            }
        })

        it('GCP-021 改 id(舊 id 消失、新 id 為新增列: 等同刪舊增新, 不級聯) → 同樣彈框列出舊 id; 刪除與改 id 並存、同一權限引用多個者權限數只計 1', function() {
            for (let lang of LANGS) {
                let $t = tOf(lang)
                let pemis = [pm('p1', { T1: 'y', T2: 'y' }), pm('p2', { T2: 'y' })]
                //T1 改 id 為 T9(id1 之列 id 變了), T2 被刪
                let pv = getSavePreview({ kind: 'Target', rowsOld: tg('T1', 'T2', 'T3'), rowsNew: tg('T9', 'T3'), holdersOld: pemis, $t })
                assert.strictEqual(pv.plan.renames.length, 0, '標的 id 改名不級聯')
                assert.strictEqual(pv.confirmText, render($t('confirmSaveDelRefsTarget'), { n: 2, list: 'T1, T2' }), lang)
                assert.strictEqual(pv.successText, '')
            }
        })

        it('GCP-022 新增列、修改 description、無人引用之刪除或改 id、全無異動 → 不彈框且成功訊息維持原文字(空字串)', function() {
            for (let lang of LANGS) {
                let $t = tOf(lang)
                let pemis = [pm('p1', { T1: 'y' }), { id: 'p2', crules: '' }, { id: 'p3', crules: '{}' }]
                let none = { confirmText: '', successText: '' }
                let pick = (pv) => ({ confirmText: pv.confirmText, successText: pv.successText })
                assert.deepStrictEqual(pick(getSavePreview({ kind: 'Target', rowsOld: tg('T1', 'T2'), rowsNew: tg('T1', 'T2'), holdersOld: pemis, $t })), none)
                assert.deepStrictEqual(pick(getSavePreview({ kind: 'Target', rowsOld: tg('T1', 'T2'), rowsNew: tg('T1', 'T2', 'T3'), holdersOld: pemis, $t })), none)
                assert.deepStrictEqual(pick(getSavePreview({ kind: 'Target', rowsOld: tg('T1', 'T2'), rowsNew: [{ id: 'T1', description: 'x' }, { id: 'T2' }], holdersOld: pemis, $t })), none)
                assert.deepStrictEqual(pick(getSavePreview({ kind: 'Target', rowsOld: tg('T1', 'T2'), rowsNew: tg('T1'), holdersOld: pemis, $t })), none, '刪 T2: 無人引用')
                assert.deepStrictEqual(pick(getSavePreview({ kind: 'Target', rowsOld: tg('T1', 'T2'), rowsNew: tg('T1', 'T9'), holdersOld: pemis, $t })), none, 'T2 改 id: 無人引用')
                assert.deepStrictEqual(pick(getSavePreview({ kind: 'Target', rowsOld: null, rowsNew: null, holdersOld: null, $t })), none)
            }
        })

        it('GCP-023 名單只列有人引用者(含停用之引用、陣列形式、數字名、含「.」之 id、原型鍵名); 超過 5 個附「共 N 個」', function() {
            for (let lang of LANGS) {
                let $t = tOf(lang)
                let ids = ['T1', '5', 'a.b', '__proto__', 'U9', 'U8', 'U7', 'unref']
                let olds = tg(...ids)
                let protoObj = Object.create(null)
                protoObj[PROTO] = 'y' //無原型容器之自有鍵 __proto__
                let pemis = [
                    pm('p1', { 'T1': 'y', 'a.b': 'n' }),
                    { id: 'p2', crules: JSON.stringify([{ name: 5, isActive: 'y' }, { name: 'U9', isActive: 'n' }]) }, //數字名: 轉為屬性鍵 '5'(R-KEY-PROP-01)
                    { id: 'p3', crules: JSON.stringify(protoObj) },
                    pm('p4', { U8: 'y', U7: 'y' }),
                ]
                let pv = getSavePreview({ kind: 'Target', rowsOld: olds, rowsNew: [], holdersOld: pemis, $t })
                assert.strictEqual(pv.plan.err, null)
                assert.strictEqual(pv.plan.nDelHolders, 4)
                //被引用者: T1、a.b、5、U9、__proto__、U8、U7 共 7 個(unref 無人引用不列), 依刪除順序(ids 之序)列前 5 個
                let list = `T1, 5, a.b, __proto__, U9 ${render($t('cascadeListMore'), { n: 7 })}`
                assert.strictEqual(pv.confirmText, render($t('confirmSaveDelRefsTarget'), { n: 4, list }), lang)
                assert.ok(!pv.confirmText.includes('unref'))
            }
        })

        it('GCP-024 id 含 $&、{n}、{list} 字樣原樣顯示; id 為空字串顯示為 ""', function() {
            for (let lang of LANGS) {
                let $t = tOf(lang)
                let ids = ['$&{n}', '{list}$$', '']
                let pemis = [{ id: 'p1', crules: JSON.stringify({ [ids[0]]: 'y', [ids[1]]: 'y', [ids[2]]: 'y' }) }]
                let pv = getSavePreview({ kind: 'Target', rowsOld: tg(...ids), rowsNew: [], holdersOld: pemis, $t })
                assert.strictEqual(pv.confirmText, render($t('confirmSaveDelRefsTarget'), { n: 1, list: '$&{n}, {list}$$, ""' }), lang)
            }
        })

        it('GCP-025 標的頁之 plan 不得借用群組頁／權限頁之 kind(keyTable 不符回空); 標的頁無改名確認', function() {
            let $t = tOf('eng')
            let planT = planRefChanges({ keyTable: 'targets', rowsOld: tg('T1'), rowsNew: [], holdersOld: [pm('p1', { T1: 'y' })] })
            assert.strictEqual(planT.nDelHolders, 1)
            assert.deepStrictEqual(getCascadePreview(planT, $t, 'Grup'), { confirmText: '', successText: '' })
            assert.deepStrictEqual(getCascadePreview(planT, $t, 'Pemi'), { confirmText: '', successText: '' })
            assert.notStrictEqual(getCascadePreview(planT, $t, 'Target').confirmText, '')
        })

    })


    // ===== GCP-3: 名單與 rewriteRefs 逐名探測一致 =====
    describe('GCP-3 名單與 rewriteRefs 逐名探測之結果一致(確認框列出之名稱＝確有引用端將被改寫者)', function() {

        //確定性偽亂數
        let seed = 20261022
        let rnd = (n) => {
            seed = (seed * 1103515245 + 12345) & 0x7fffffff
            return seed % n
        }

        //以多種形式產生一個授權字串
        let mkHolder = (pool, kind) => {
            let picks = pool.filter(() => rnd(3) === 0)
            let form = rnd(5)
            let mk = (name) => ({ mode: rnd(2) === 0 ? 'OR' : 'AND', isActive: rnd(4) === 0 ? 'n' : 'y', name })
            if (form === 0) {
                return JSON.stringify(Object.fromEntries(picks.map((n) => [n, { mode: 'OR', isActive: rnd(4) === 0 ? 'n' : 'y' }])))
            }
            if (form === 1) {
                return JSON.stringify(picks.map((n) => mk(n)))
            }
            if (form === 2) {
                return JSON.stringify([...picks.map((n) => mk(n)), 'y', { mode: 'OR', isActive: 'y' }]) //含非物件元素與無 name 之元素(以索引為名)
            }
            if (form === 3 && kind === 'rule') {
                return JSON.stringify(Object.fromEntries(picks.map((n) => [n, rnd(2) === 0 ? 'y' : 'n']))) //crules 之簡寫純量值
            }
            if (form === 3) {
                return '{ broken'
            }
            return ''
        }

        it('GCP-030 群組頁／權限頁: 隨機 60 組(物件／陣列／壞 JSON／空字串), 確認框名單 ＝ 逐名以 rewriteRefs 探測有改動者(皆無衝突之案例)', function() {
            let nChecked = 0
            for (let it = 0; it < 60; it++) {
                for (let [kind, pg] of Object.entries(PAGES)) {
                    let pool = ['a', 'b', 'c', 'd', 'e', 'f', '5', 'a.b']
                    let old = rows(...pool)
                    let kpNew = {}
                    let ren = []
                    old.forEach((r) => {
                        if (rnd(2) === 0) {
                            kpNew[r.id] = `x_${r.name}`
                            ren.push({ from: r.name, to: `x_${r.name}` })
                        }
                    })
                    let hs = Array.from({ length: 1 + rnd(5) }, (_, k) => ({ id: `h${k}`, [pg.field]: mkHolder(pool, 'ref') }))
                    let $t = tOf('eng')
                    let pv = getSavePreview({ kind, rowsOld: old, rowsNew: renamed(old, kpNew), holdersOld: hs, $t })
                    if (pv.plan.err !== null) {
                        continue //新名不與既有名相撞, 不應有錯誤; 以下斷言於無錯誤時進行
                    }
                    //期望: 逐名探測, 且該名稱確被某引用端字串改寫
                    let exp = ren.filter((rn) => hs.some((h) => rewriteRefs(h[pg.field], { kind: 'ref', rename: new Map([[rn.from, rn.to]]) }).changed))
                    let nRenH = hs.filter((h) => rewriteRefs(h[pg.field], { kind: 'ref', rename: new Map(ren.map((rn) => [rn.from, rn.to])) }).changed).length
                    assert.strictEqual(pv.plan.nRenameHolders, nRenH)
                    if (nRenH === 0) {
                        assert.strictEqual(pv.confirmText, '')
                        continue
                    }
                    let list = joinList(exp.map((rn) => `${rn.from}→${rn.to}`), $t)
                    assert.strictEqual(pv.confirmText, render($t(pg.confirm), { n: nRenH, list }), `${kind} #${it} holders=${JSON.stringify(hs)}`)
                    nChecked++
                }
            }
            assert.ok(nChecked >= 30, `有效隨機案例數 ${nChecked} 太少, 產生器失真`)
        })

        it('GCP-031 標的頁: 隨機 60 組, 確認框名單 ＝ 逐名以 rewriteRefs(rule) 探測有改動者(含數字名、含「.」、原型鍵名)', function() {
            let nChecked = 0
            for (let it = 0; it < 60; it++) {
                let pool = ['a', 'b', '5', 'a.b', '__proto__', 'constructor', 'e']
                let old = pool.map((id) => ({ id }))
                let delIds = pool.filter(() => rnd(2) === 0)
                let rowsNew = old.filter((r) => !delIds.includes(r.id))
                let hs = Array.from({ length: 1 + rnd(5) }, (_, k) => ({ id: `p${k}`, crules: mkHolder(pool, 'rule') }))
                let $t = tOf('cht')
                let pv = getSavePreview({ kind: 'Target', rowsOld: old, rowsNew, holdersOld: hs, $t })
                assert.strictEqual(pv.plan.err, null)
                let exp = delIds.filter((id) => hs.some((h) => rewriteRefs(h.crules, { kind: 'rule', del: new Set([id]) }).changed))
                let nDelH = hs.filter((h) => rewriteRefs(h.crules, { kind: 'rule', del: new Set(delIds) }).changed).length
                assert.strictEqual(pv.plan.nDelHolders, nDelH)
                if (nDelH === 0) {
                    assert.strictEqual(pv.confirmText, '')
                    continue
                }
                let list = joinList(exp, $t)
                assert.strictEqual(pv.confirmText, render($t('confirmSaveDelRefsTarget'), { n: nDelH, list }), `#${it} del=${delIds} holders=${JSON.stringify(hs)}`)
                nChecked++
            }
            assert.ok(nChecked >= 30, `有效隨機案例數 ${nChecked} 太少, 產生器失真`)
        })

    })


    // ===== GCP-4: fmtWarn 擴充 =====
    describe('GCP-4 fmtWarn 之 {m}、{w}、{e}、{list} 單趟代入', function() {

        it('GCP-040 新增佔位符代入; 值內含佔位符字樣／$& 原樣; 未給者保留; 既有 {names}／{kind}／{n} 行為不變', function() {
            assert.strictEqual(fmtWarn('{n}/{m}/{w}/{e}/{list}', { n: 1, m: 2, w: 3, e: 4, list: 'x' }), '1/2/3/4/x')
            assert.strictEqual(fmtWarn('{list}|{n}', { list: '{n}$&{m}', n: 7 }), '{n}$&{m}|7')
            assert.strictEqual(fmtWarn('{n} {m} {w}', { n: 1 }), '1 {m} {w}')
            assert.strictEqual(fmtWarn('{list}', {}), '{list}')
            assert.strictEqual(fmtWarn('{names}:{kind}:{n}', { names: ['a', 'b'], kind: 'K', n: 2 }), 'a, b:K:2')
            assert.strictEqual(fmtWarn('{m}{m}', { m: 0 }), '00', '數字 0 亦代入')
        })

    })


    // ===== GCP-5: 文案依據 =====
    describe('GCP-5 刪除確認文案之依據: 以 AND 引用者, 引用被清理後限制解除、授權可能變多(真 getUserRules)', function() {

        it('GCP-050 刪除被 AND 引用之群組: 清理後(planRefChanges 之 after)授權變多而非被收回; getDelImpact 之 nRefs／nAnd 對應該使用者', function() {
            let targets = [{ id: 'A' }, { id: 'B' }]
            let pemis = [
                { id: 'p1', name: 'P1', crules: JSON.stringify({ A: 'y', B: 'y' }) },
                { id: 'p2', name: 'P2', crules: JSON.stringify({ A: 'y' }) },
            ]
            let g1 = { id: 'g1', name: 'G1', cpemis: OR('P1') }
            let g2 = { id: 'g2', name: 'G2', cpemis: OR('P2') }
            let u = { id: 'u1', cgrups: JSON.stringify({ G1: { mode: 'OR', isActive: 'y' }, G2: { mode: 'AND', isActive: 'y' } }) }
            let ruleMap = (user, grups) => {
                let o = {}
                for (let r of getUserRules(user, grups, pemis, targets).rules) {
                    o[r.name] = r.isActive
                }
                return o
            }

            //刪前: G1 給 {A,B}, G2(AND)限制為 {A} → 只有 A
            assert.deepStrictEqual(ruleMap(u, [g1, g2]), { A: 'y', B: 'n' })

            //刪 G2: 影響 1 位使用者、其中 1 位以 AND 引用
            assert.deepStrictEqual(getDelImpact(['g2'], [g1, g2], [u], 'Grup', [g1]), { nRefs: 1, nAnd: 1, nWiden: 0 })

            //清理後(同一份計畫): 該使用者之 AND 引用被移除, 限制解除 → B 變 y(授權變多)
            let plan = planRefChanges({ keyTable: 'grups', rowsOld: [g1, g2], rowsNew: [g1], holdersOld: [u] })
            assert.strictEqual(plan.nDelHolders, 1)
            let after = { ...u, cgrups: plan.changes[0].after }
            assert.deepStrictEqual(ruleMap(after, [g1]), { A: 'y', B: 'y' }, '清理後授權變多(確認框所述「限制解除、授權可能變多」)')

            //對照: 若不清理(舊行為, AND 項變懸空), 授權被收回(全 n)——此即舊文案「授權將被收回」, 已與連帶清理互斥
            assert.deepStrictEqual(ruleMap(u, [g1]), { A: 'n', B: 'n' })
        })

    })


    // ===== GCP-7: getDelImpact 之存續列判準(外審 sol R6) =====
    describe('GCP-7 getDelImpact: 存續列＝同 id 同名之列(與伺服端 diffRefTargets 一致), AND 限制解除警示不漏報', function() {

        let PG7 = {
            Grup: { field: 'cgrups', keyTable: 'grups' },
            Pemi: { field: 'cpemis', keyTable: 'pemis' },
        }
        let AND_OR = JSON.stringify({ A: { mode: 'AND', isActive: 'y' }, B: { mode: 'OR', isActive: 'y' } })

        it('GCP-070 ①先新增同名之新 id 列(c:A)再刪舊列(a:A): 新列不繼承引用 → 名稱不算存續, 引用 {A:AND,B:OR} 計 nRefs 1、nAnd 1、nWiden 0, 確認文字含 AND 警示; 伺服端清理結果一致(A 被移除、B 保留); 群組頁／權限頁 × eng／cht', function() {
            for (let [kind, pg] of Object.entries(PG7)) {
                for (let lang of LANGS) {
                    let $t = tOf(lang)
                    let base = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]
                    let holders = [{ id: 'h1', [pg.field]: AND_OR }]
                    let remain = [{ id: 'b', name: 'B' }, { id: 'c', name: 'A', _isNew: true }] //刪 a 後, 清單另有同名之新 id 列 c
                    let imp = getDelImpact(['a'], base, holders, kind, remain)
                    assert.deepStrictEqual(imp, { nRefs: 1, nAnd: 1, nWiden: 0 }, `${kind} ${lang}`)
                    let text = getDelConfirmText(imp, $t, kind)
                    assert.strictEqual(text, render($t(`confirmDelRefsAnd${kind}`), { n: 1, m: 1 }), `${kind} ${lang} 含 AND 警示`)
                    assert.ok(text.includes('AND') && !text.includes('{'))
                    //伺服端儲存時之計畫(rowsNew 為目前清單): 新列 c 不繼承引用, A 之引用被清理
                    let plan = planRefChanges({ keyTable: pg.keyTable, rowsOld: base, rowsNew: remain, holdersOld: holders })
                    assert.strictEqual(plan.err, null)
                    assert.deepStrictEqual(plan.delNames, ['A'])
                    assert.deepStrictEqual(Object.keys(JSON.parse(plan.changes[0].after)), ['B'])
                }
            }
        })

        it('GCP-071 ②另一列改名為被刪名(d:D → A, 刪 a:A): 改名而來者不算存續、不繼承 → 同①(nRefs 1、nAnd 1、nWiden 0, 含 AND 警示); 群組頁／權限頁 × eng／cht', function() {
            for (let [kind, pg] of Object.entries(PG7)) {
                for (let lang of LANGS) {
                    let $t = tOf(lang)
                    let base = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'd', name: 'D' }]
                    let holders = [{ id: 'h1', [pg.field]: AND_OR }]
                    let remain = [{ id: 'b', name: 'B' }, { id: 'd', name: 'A' }] //d 尚未儲存地改名為 A
                    let imp = getDelImpact(['a'], base, holders, kind, remain)
                    assert.deepStrictEqual(imp, { nRefs: 1, nAnd: 1, nWiden: 0 }, `${kind} ${lang}`)
                    let text = getDelConfirmText(imp, $t, kind)
                    assert.strictEqual(text, render($t(`confirmDelRefsAnd${kind}`), { n: 1, m: 1 }), `${kind} ${lang}`)
                    assert.ok(text.includes('AND'))
                    //伺服端儲存時: a 刪除(A 被清理)、d 由 D 改名為 A(無人引用 D), 引用端之 A 項被清理而非轉給 d
                    let plan = planRefChanges({ keyTable: pg.keyTable, rowsOld: base, rowsNew: remain, holdersOld: holders })
                    assert.strictEqual(plan.err, null)
                    assert.deepStrictEqual(plan.delNames, ['A'])
                    assert.deepStrictEqual(Object.keys(JSON.parse(plan.changes[0].after)), ['B'])
                }
            }
        })

        it('GCP-072 ③歷史同名只刪其一(另一列同 id 同名存續): 名稱仍有實體, 不清理 → nRefs 0、nAnd 0, nWiden 依舊(任何 mode 之啟用引用皆計, 停用不計); 文案只有「歷史同名」句, 無 AND 警示; 兩筆都刪則名稱消失, 回到 nAnd 計入; 群組頁／權限頁 × eng／cht', function() {
            for (let [kind, pg] of Object.entries(PG7)) {
                for (let lang of LANGS) {
                    let $t = tOf(lang)
                    let base = [{ id: 'a', name: 'A' }, { id: 'b', name: 'A' }]
                    let holders = [
                        { id: 'h1', [pg.field]: AND_OR },
                        { id: 'h2', [pg.field]: OR('A') },
                        { id: 'h3', [pg.field]: JSON.stringify({ A: { mode: 'AND', isActive: 'n' } }) },
                    ]
                    let imp = getDelImpact(['a'], base, holders, kind, [base[1]])
                    assert.deepStrictEqual(imp, { nRefs: 0, nAnd: 0, nWiden: 2 }, `${kind} ${lang}: h1、h2 之啟用引用計 nWiden, 停用之 h3 不計`)
                    let text = getDelConfirmText(imp, $t, kind)
                    assert.strictEqual(text, render($t(`confirmDelDupRefs${kind}`), { n: 2 }), `${kind} ${lang}`)
                    assert.ok(!text.includes('AND'))
                    //兩筆都刪: 名稱消失 → h1(AND)計 nAnd; h1、h2、h3 皆被清理
                    assert.deepStrictEqual(getDelImpact(['a', 'b'], base, holders, kind, []), { nRefs: 3, nAnd: 1, nWiden: 0 })
                    //刪 a、b 尚未儲存地改名為 Z: b 不再同名 → A 不算存續(伺服端: A 被清理且 b 改名 A→Z 時 A 之引用屬歷史同名組, 伺服端會拒存〔DupGroup〕; 此處只驗 nAnd 之存續判準), nRefs 以「只算本次刪除」為準(b 於基準仍同名存續 → 0)
                    let imp2 = getDelImpact(['a'], base, holders, kind, [{ id: 'b', name: 'Z' }])
                    assert.deepStrictEqual(imp2, { nRefs: 0, nAnd: 0, nWiden: 0 }, 'nAnd 以 nRefs 為上限')
                }
            }
        })

        //隨機輸入: nAnd 與 nRefs ＝ 以 diffRefTargets.delNames 與 refCascade 之清理結果算出之「被清理之引用端列數」與其中「啟用且有效模式為 AND 且名稱被清理」者
        let seed = 61022
        let rnd = (n) => { //mulberry32(LCG 之低位元週期短, rnd(2) 會規律交替, 不用)
            seed = (seed + 0x6D2B79F5) | 0
            let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
            return (((t ^ (t >>> 14)) >>> 0) % n)
        }
        let POOL = ['A', 'B', 'C']
        let mkHolderStr = () => {
            let picks = ['A', 'B', 'C', 'Z'].filter(() => rnd(2) === 0)
            //body: 一個引用項目之內容(isActive、mode 可為 OR／AND／缺／非法)
            let body = () => {
                let e = { isActive: rnd(4) === 0 ? 'n' : 'y' }
                let m = ['OR', 'AND', 'AND', undefined, 'x'][rnd(5)]
                if (m !== undefined) {
                    e.mode = m
                }
                return e
            }
            let form = rnd(6)
            if (form === 0) {
                return JSON.stringify(Object.fromEntries(picks.map((n) => [n, body()]))) //物件形式
            }
            if (form === 1) {
                return JSON.stringify(picks.map((n) => ({ name: n, ...body() }))) //陣列形式
            }
            if (form === 2) {
                return JSON.stringify([...picks.map((n) => ({ name: n, ...body() })), 'y', body()]) //含非物件元素與無 name 元素
            }
            if (form === 3) {
                return '{ broken'
            }
            return form === 4 ? '' : JSON.stringify(Object.fromEntries(picks.map((n) => [n, 'y']))) //簡寫純量值(缺 mode 視為 AND)
        }

        it('GCP-073 ④隨機 400 組(歷史同名、同名新 id 列、他列改名為被刪名、前次未儲存之改名／新增; 物件／陣列／簡寫／壞 JSON 引用端; 群組頁／權限頁): getDelImpact.nRefs ＝ 被清理之引用端列數、nAnd ＝ 其中「啟用且有效模式為 AND 且名稱被清理」之列數(以 diffRefTargets.delNames 與 rewriteRefs 清理結果獨立算出), 清理結果與 planRefChanges 一致; 另證 nAnd ≤ nRefs 恆成立', function() {
            let nCase = 0
            let nAndPos = 0
            let nRetainedEdge = 0
            for (let it = 0; it < 400; it++) {
                for (let [kind, pg] of Object.entries(PG7)) {
                    //基準列: 2～5 列, 名稱取自小池(允許歷史同名)
                    let base = Array.from({ length: 2 + rnd(4) }, (_, k) => ({ id: `r${k}`, name: POOL[rnd(POOL.length)] }))
                    let delIds = base.filter(() => rnd(2) === 0).map((r) => r.id)
                    if (delIds.length === 0) {
                        delIds.push(base[0].id)
                    }
                    let delNamesBase = new Set(base.filter((r) => delIds.includes(r.id)).map((r) => r.name))
                    //目前清單(刪除後): 存續列; 其中基準名稱不屬被刪名稱者可能尚未儲存地改名(基準名稱屬被刪名稱之歷史同名組成員改名, 其「只算本次刪除」之 nRefs 與伺服端儲存時之判準本即不同, 不在此性質內);
                    //另可能有新增之新 id 列, 名稱可與被刪名稱相同(①)
                    let remain = base.filter((r) => !delIds.includes(r.id)).map((r) => {
                        if (!delNamesBase.has(r.name) && rnd(3) === 0) {
                            return { ...r, name: rnd(2) === 0 ? 'Z' : POOL[rnd(POOL.length)] } //他列改名(可能改為被刪名, ②)
                        }
                        return { ...r }
                    })
                    for (let k = rnd(3); k > 0; k--) {
                        remain.push({ id: `new${k}`, name: POOL[rnd(POOL.length)], _isNew: true })
                    }
                    let holders = Array.from({ length: 1 + rnd(5) }, (_, k) => ({ id: `h${k}`, [pg.field]: mkHolderStr() }))

                    //獨立算出之期望: 儲存時之 diff(基準 → 目前清單)之 delNames; 清理結果以 rewriteRefs(del) 判定
                    let d = diffRefTargets({ keyTable: pg.keyTable, rowsOld: base, rowsNew: remain })
                    let cleaned = holders.filter((h) => rewriteRefs(h[pg.field], { kind: 'ref', del: d.del }).changed)
                    let expAnd = cleaned.filter((h) => getRefWarns(h[pg.field], []).items.some((i) => i.active && i.effMode === 'AND' && typeof i.name === 'string' && d.del.has(i.name))).length

                    let imp = getDelImpact(delIds, base, holders, kind, remain)
                    assert.strictEqual(imp.nRefs, cleaned.length, `nRefs it=${it} ${kind} base=${JSON.stringify(base)} del=${delIds} remain=${JSON.stringify(remain)} holders=${JSON.stringify(holders)}`)
                    assert.strictEqual(imp.nAnd, expAnd, `nAnd it=${it} ${kind} base=${JSON.stringify(base)} del=${delIds} remain=${JSON.stringify(remain)} holders=${JSON.stringify(holders)}`)
                    assert.ok(imp.nAnd <= imp.nRefs)

                    //與 planRefChanges 一致: 計畫無錯誤時, 被清理之引用端 id 集合 ＝ plan.changes 中 nDel > 0 者
                    let plan = planRefChanges({ keyTable: pg.keyTable, rowsOld: base, rowsNew: remain, holdersOld: holders })
                    assert.deepStrictEqual([...d.del].sort(), [...plan.delNames].sort())
                    if (plan.err === null) {
                        assert.deepStrictEqual(plan.changes.filter((c) => c.nDel > 0).map((c) => c.id).sort(), cleaned.map((h) => h.id).sort(), `清理集合 it=${it}`)
                    }

                    nCase++
                    if (expAnd > 0) {
                        nAndPos++
                    }
                    //「名稱被清理而目前清單有同名之非存續列(新 id 或他列改名而來)」之案例: 舊判準(以目前清單任一同名列即視為存續)會漏報 nAnd
                    let isRetained = (r) => {
                        let b = base.find((x) => x.id === r.id)
                        return b !== undefined && b.name === r.name
                    }
                    let namesRetained = new Set(remain.filter(isRetained).map((r) => r.name))
                    let namesAny = new Set(remain.map((r) => r.name))
                    if ([...d.del].some((n) => namesAny.has(n) && !namesRetained.has(n)) && expAnd > 0) {
                        nRetainedEdge++
                    }
                }
            }
            assert.strictEqual(nCase, 800)
            assert.ok(nAndPos >= 100, `nAnd > 0 之案例 ${nAndPos} 太少, 產生器失真`)
            assert.ok(nRetainedEdge >= 10, `存續列判準之關鍵案例(目前清單有同名之非存續列且 AND 引用者被清理) ${nRetainedEdge} 太少`)
        })

    })


    // ===== GCP-6: 語系鍵 =====
    describe('GCP-6 語系鍵(server/procLang.mjs)', function() {

        let langSrc = fs.readFileSync(path.join(projRoot, 'server', 'procLang.mjs'), 'utf8')
        let getPair = (k) => {
            let m = langSrc.match(new RegExp(`\\n    ${k}: \\{[^\\n]*\\n\\s*eng: \`([^\`]+)\`,\\s*cht: \`([^\`]+)\`,`))
            return m ? [m[1], m[2]] : null
        }

        it('GCP-060 新增鍵皆有 eng／cht 且兩語系皆含應有之佔位符; 其餘佔位符不得出現', function() {
            let spec = {
                confirmSaveRenameRefsGrup: ['{n}', '{list}'],
                confirmSaveRenameRefsExtGrup: ['{n}', '{list}', '{e}'],
                confirmSaveRenameRefsPemi: ['{n}', '{list}'],
                confirmSaveRenameRefsExtPemi: ['{n}', '{list}', '{e}'],
                confirmSaveDelRefsTarget: ['{n}', '{list}'],
                cascadeListMore: ['{n}'],
                grupSaveGrupsSuccessCascade: ['{n}'],
                pemiSavePemisSuccessCascade: ['{n}'],
            }
            let all = ['{n}', '{m}', '{w}', '{e}', '{list}']
            //標的頁不改成功訊息: targetSaveTargetsSuccessCascade 已移除, 不得殘留
            assert.ok(!('targetSaveTargetsSuccessCascade' in LANG.eng) && !('targetSaveTargetsSuccessCascade' in LANG.cht), 'targetSaveTargetsSuccessCascade 不應存在')
            assert.ok(!langSrc.includes('targetSaveTargetsSuccessCascade'), 'procLang 不應殘留 targetSaveTargetsSuccessCascade')
            for (let [k, phs] of Object.entries(spec)) {
                let pr = getPair(k)
                assert.ok(pr, `${k} 須有 eng／cht`)
                for (let s of pr) {
                    for (let ph of all) {
                        assert.strictEqual(s.includes(ph), phs.includes(ph), `${k} ${ph}: ${s}`)
                    }
                }
            }
        })

        it('GCP-061 確認框為單一問句: 刪除確認結尾為「確定刪除？／Delete anyway?」、改名預覽為「是否繼續？／Continue?」、標的頁為「確定儲存？／Save anyway?」; 成功訊息無問句', function() {
            for (let [k, eng, cht] of [
                ['confirmSaveRenameRefsGrup', /Continue\?$/, /是否繼續？$/],
                ['confirmSaveRenameRefsExtGrup', /Continue\?$/, /是否繼續？$/],
                ['confirmSaveRenameRefsPemi', /Continue\?$/, /是否繼續？$/],
                ['confirmSaveRenameRefsExtPemi', /Continue\?$/, /是否繼續？$/],
                ['confirmSaveDelRefsTarget', /Save anyway\?$/, /確定儲存？$/],
            ]) {
                assert.ok(eng.test(LANG.eng[k]), `${k} eng`)
                assert.ok(cht.test(LANG.cht[k]), `${k} cht`)
                assert.strictEqual((LANG.eng[k].match(/\?/g) || []).length, 1, `${k} eng 只有一個問號`)
                assert.strictEqual((LANG.cht[k].match(/？/g) || []).length, 1, `${k} cht 只有一個問號`)
            }
            for (let k of ['grupSaveGrupsSuccessCascade', 'pemiSavePemisSuccessCascade']) {
                assert.ok(!/[?？]/.test(LANG.eng[k] + LANG.cht[k]), `${k} 成功訊息不含問句`)
            }
        })

        it('GCP-062 成功訊息之前半與原成功訊息相同(附帶筆數僅為在其後加句), 且只描述改名(引用被更新為新名稱), 不談刪除／移除', function() {
            for (let lang of LANGS) {
                let $t = tOf(lang)
                for (let [base, cascade] of [['grupSaveGrupsSuccess', 'grupSaveGrupsSuccessCascade'], ['pemiSavePemisSuccess', 'pemiSavePemisSuccessCascade']]) {
                    assert.ok($t(cascade).startsWith($t(base)), `${lang} ${cascade} 應以 ${base} 開頭: ${$t(cascade)}`)
                    assert.ok(lang === 'cht' ? /已改名/.test($t(cascade)) && /新名稱/.test($t(cascade)) : /new name/.test($t(cascade)), `${lang} ${cascade} 描述改名`)
                    assert.ok(!/刪除|移除|delet|remov/i.test($t(cascade).slice($t(base).length)), `${lang} ${cascade} 不談刪除／移除`)
                }
            }
        })

    })


    // ===== SITE-GCP: 站點 =====
    describe('SITE-GCP 三個清單頁之 core() 接線', function() {

        let code = (rel) => sourceLines(path.join(projRoot, rel), 'code').map((l) => l.text).join('\n')
        //run11: 預覽之「舊」為草稿所依據之那份 store 列(vo.baseRows; 有未存編輯時 store 可能已被推播更新, 不用 vo.<表>)
        //Grup／Pemi 傳 cascadeRename(伺服端 opt.cascadeRename 經 webInfor 帶給前端, 關閉時預覽不得說「將一併更新」); Target 不傳(標的 id 改名本即不級聯)
        let CR = `cascadeRename: get(vo, 'webInfor.cascadeRename', true)`
        let PAGES_SITE = [
            ['LayoutContentGrups', 'Grup', `rowsOld: vo.baseRows, rowsNew: rows, holdersOld: vo.users, ${CR}`, 'grupSaveGrupsSuccess'],
            ['LayoutContentPemis', 'Pemi', `rowsOld: vo.baseRows, rowsNew: rows, holdersOld: vo.grups, ${CR}`, 'pemiSavePemisSuccess'],
            ['LayoutContentTargets', 'Target', `rowsOld: vo.baseRows, rowsNew: rowsSend, holdersOld: vo.pemis`, 'targetSaveTargetsSuccess'],
        ]

        it('SITE-GCP-001 先預覽、確認框前 unlockBtn()、選否中止(不送出)、確認在開 loading 與打 API 之前; 只有改名連帶才附筆數(群組頁／權限頁), 否則原成功訊息; 標的頁不讀 successText; 群組頁／權限頁傳 cascadeRename; 確認框走專案 DOM 模態', function() {
            for (let [fn, kind, args, okKey] of PAGES_SITE) {
                let c = code(`src/components/${fn}.vue`)
                assert.ok(c.includes(`import { getSavePreview } from '../js/getCascadePreview.mjs'`), `${fn} import`)
                assert.ok(c.includes(`let pv = getSavePreview({ kind: '${kind}', ${args}, $t: (k) => vo.$t(k) })`), `${fn} 預覽輸入`)
                let re = /unlockBtn\(\)\s*let isGo = await vo\.\$dg\.showCheckYesNo\(pv\.confirmText\)\s*\.then\(\(\) => true\)\s*\.catch\(\(\) => false\)\s*if \(!isGo\) \{\s*return\s*\}/
                assert.ok(re.test(c), `${fn} 確認框: unlockBtn → showCheckYesNo → 選否 return`)
                assert.ok(/if \(pv\.confirmText !== ''\) \{\s*\n\s*unlockBtn\(\)/.test(c), `${fn} 僅有確認文字才彈框並釋放鎖`)
                let iPv = c.indexOf('getSavePreview({ kind')
                let iAsk = c.indexOf('showCheckYesNo(pv.confirmText)')
                let iLoad = c.indexOf('updateLoading(true)')
                let iApi = c.search(/\$fapi\.update(Grups|Pemis|Targets)\(/)
                assert.ok(iPv > 0 && iPv < iAsk && iAsk < iLoad && iLoad < iApi, `${fn} 順序: 預覽 < 確認框 < 開 loading < 打 API`)
                if (kind === 'Target') {
                    assert.ok(c.includes(`showCheckYes(vo.$t('${okKey}'), { type: 'success' })`), `${fn} 成功訊息維持原文字`)
                    assert.ok(!c.includes('pv.successText'), `${fn} 不讀 pv.successText`)
                    assert.ok(!c.includes('cascadeRename'), `${fn} 不傳 cascadeRename`)
                }
                else {
                    assert.ok(c.includes(`pv.successText !== '' ? pv.successText : vo.$t('${okKey}')`), `${fn} 成功訊息: 有改名連帶才附筆數, 否則原文字`)
                    assert.ok(c.includes(CR), `${fn} 傳 cascadeRename`)
                }
                assert.ok(!/(^|[^\w.$])(window\.)?(confirm|alert|prompt)\(/m.test(c), `${fn} 不得用原生 confirm／alert／prompt`)
                //錯誤顯示仍走 $tErr(伺服端固定語系鍵)
                assert.ok(/\$tErr\(err\)/.test(c), `${fn} 失敗訊息走 $tErr`)
            }
        })

        it('FLOW-GCP-001 確認框按「否」之鎖釋放(以真 submitGuard 模擬三頁 core() 之結構): 確認框前按鈕鎖已釋放、選否後不開 loading／不打 API、流程占位釋放而可再儲存; 選是則續送出, 占位保持至成功訊息框關閉; 確認框開啟中再觸發被略過且其按鈕鎖立即釋放; 確認框被取代(reject close)視同選否', async function() {
            let genPm = (await import('wsemi/src/genPm.mjs')).default
            let isSettled = async (pm) => {
                let st = 'pending'
                pm.then(() => {
                    st = 'resolved'
                }).catch(() => {
                    st = 'rejected'
                })
                await Promise.resolve()
                await Promise.resolve()
                return st
            }

            //sim: 與三頁 doSaveX 同結構(1 同步檢測 → 2 預覽與確認框〔unlockBtn → await 確認 → 選否 return〕→ 3 開 loading → 4 API → 成功訊息框); runSubmit 為真 submitGuard
            let mk = () => {
                let sg = submitGuard()
                let log = { loading: [], api: 0, msgs: [] }
                let dlg = { pm: null }
                let ask = () => {
                    dlg.pm = genPm()
                    return dlg.pm
                }
                let ok = genPm() //成功訊息框之關閉
                let doSave = (opt = {}) => {
                    let core = async (unlockBtn) => {
                        unlockBtn()
                        let isGo = await ask().then(() => true).catch(() => false)
                        if (!isGo) {
                            return
                        }
                        log.loading.push(true)
                        log.api++
                        log.loading.push(false)
                        log.msgs.push('success')
                        await ok
                    }
                    return sg.run('saveGrups', (unlockBtn) => {
                        return core(unlockBtn).finally(() => {
                            log.loading.push(false)
                        })
                    }, opt)
                }
                return { sg, log, dlg, ok, doSave }
            }

            //選否
            let a = mk()
            let pm1 = genPm()
            let r1 = a.doSave({ pm: pm1 })
            await Promise.resolve()
            await Promise.resolve()
            assert.strictEqual(await isSettled(pm1), 'resolved', '開確認框前按鈕鎖已釋放')
            assert.strictEqual(a.sg.isRunning('saveGrups'), true, '確認框開啟中流程占位仍在')
            //確認框開啟中再觸發(如焦點仍在儲存鈕時 Enter): 略過且其按鈕鎖立即釋放
            let pm2 = genPm()
            assert.strictEqual(await a.doSave({ pm: pm2 }), null)
            assert.strictEqual(await isSettled(pm2), 'resolved')
            a.dlg.pm.reject('close') //按「否」
            await r1
            assert.strictEqual(a.log.api, 0, '選否不打 API')
            assert.deepStrictEqual(a.log.loading, [false], '選否不開 loading(只有 finally 之關閉)')
            assert.deepStrictEqual(a.log.msgs, [])
            assert.strictEqual(a.sg.isRunning('saveGrups'), false, '選否後占位釋放')
            //可再儲存
            let r3 = a.doSave({ pm: genPm() })
            await Promise.resolve()
            assert.strictEqual(a.sg.isRunning('saveGrups'), true)
            a.dlg.pm.reject('close')
            await r3

            //選是: 續送出, 成功訊息框關閉前占位保持
            let b = mk()
            let r4 = b.doSave({ pm: genPm() })
            await Promise.resolve()
            b.dlg.pm.resolve()
            await new Promise((resolve) => setTimeout(resolve, 5))
            assert.strictEqual(b.log.api, 1)
            assert.deepStrictEqual(b.log.msgs, ['success'])
            assert.strictEqual(b.sg.isRunning('saveGrups'), true, '成功訊息框開啟期間占位仍在')
            b.ok.resolve()
            await r4
            assert.strictEqual(b.sg.isRunning('saveGrups'), false)

            //確認框被另一個單例 show() 取代(CheckYesNo.show 開頭 vo.pm.reject('close')): 視同選否
            let c = mk()
            let r5 = c.doSave({ pm: genPm() })
            await Promise.resolve()
            c.dlg.pm.reject('close')
            await r5
            assert.strictEqual(c.log.api, 0)
            assert.strictEqual(c.sg.isRunning('saveGrups'), false)
        })

        it('SITE-GCP-002 確認框為純前端流程: 不新增 RPC(不呼叫預覽用 API); 只有一處 runSubmit 且 key 不變', function() {
            for (let [fn] of PAGES_SITE) {
                let c = code(`src/components/${fn}.vue`)
                assert.strictEqual((c.match(/\$fapi\./g) || []).length, 1, `${fn} 只有一個 $fapi 呼叫(儲存)`)
                assert.strictEqual((c.match(/\$ui\.runSubmit\(/g) || []).length, 1, `${fn} 一處 runSubmit`)
            }
            assert.ok(code('src/components/LayoutContentGrups.vue').includes(`runSubmit('saveGrups'`))
            assert.ok(code('src/components/LayoutContentPemis.vue').includes(`runSubmit('savePemis'`))
            assert.ok(code('src/components/LayoutContentTargets.vue').includes(`runSubmit('saveTargets'`))
        })

    })

})
