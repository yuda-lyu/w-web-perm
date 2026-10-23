//引用連帶純函數(src/js/refCascade.mjs 之 rewriteRefs／diffRefTargets／planRefChanges)規格測試(run06)
//
//【受測規格句】(測試是規格之翻譯: 每條斷言之註解標明所依之規格句代號)
//  來源: sgud/rule/rulebook.md 之 R-PRINCIPLE-00(原則 3、6、適用表 m、n)與 R-AUTH-MERGE-00; spec/evidence/run06-design-digest.md; src/js/refCascade.mjs 之 JSDoc
//  P6  原則 6: 群組/權限/標的改名時, 引用須連帶更新; 被刪除時, 引用須連帶清理(效果等同舊版「找不到即忽略」); 不得靜默失效或被同名新資料接管. 不採「被引用則禁止刪除」
//  P3  原則 3: 遇衝突或歧義 → 收嚴＋提示, 不靜默擇一(不取首筆、不靜默丟棄)
//  M   適用表 m: 伺服端連帶更新引用; 歷史同名組改名、新名撞懸空引用 → 拒絕(整次拒存、零變更)
//  N   適用表 n: 同一次寫入內連帶清理 users.cgrups／grups.cpemis／pemis.crules; 以 AND 引用者清理後限制解除(授權可能變多)屬預期
//  AM  R-AUTH-MERGE-00 第 4、5 條: 結果與排列順序無關; isActive 非 'y' 不參與; 引用查無實體以其 mode 參與內容全 n; 同名多列內容取交集
//  D1  rewriteRefs: 同時套用所有改名與刪除(互換、鏈式皆正確); 先判刪除再判改名; 物件形式仍輸出物件、陣列形式仍輸出陣列; 其餘項目(含值內 mode／isActive／額外欄位)原樣;
//      未命中者「同一字串原樣回傳」; 壞 JSON／空字串／非容器不動; conflict(新名與容器內未被改走或刪除之同名項目相撞)→ 不改寫並回報; 'rule' 以屬性鍵轉型比對(同 mergeRules), 'ref' 只認字串
//  D2  diffRefTargets: 身分以主鍵 id; 同 id 且名稱不同＝改名(僅 grups／pemis, opt.cascadeRename 非 false); 舊列 id 不在新表＝刪除; 刪除之名稱若仍有「同 id 同名之存續列」(歷史同名只刪其一)則不清理;
//      刪除後以同名新增(新 id)者不繼承引用; targets 之 id 即名稱(改 id＝刪舊增新, 不級聯); 缺 id／id 非字串之列不對應既有列
//  D3  planRefChanges: 三表對映(grups→users.cgrups、pemis→grups.cpemis、targets→pemis.crules); 三種拒絕 renameCascadeDupGroup／NameInUse／Conflict(整次不寫入);
//      cascadeRename:false 不做改名級聯與改名相關拒絕, 刪除連帶清理不受影響; nHolders 為須改寫之引用端列數, nRenameHolders／nDelHolders 為受改名／刪除影響之列數, nExternal 為其中 from 非空字串之列數
//  D4  不變式: 改名級聯後各使用者最終授權(真 getUserRules)與改名前逐位相等; 刪除清理後授權＝把被刪名稱之項目自原字串移除之結果; 未被命中之引用字串逐字不動; 無改名無刪除時不碰引用端
//  D5  (主責裁示, 修 tpure 回報之 D-1) kind:'rule' 之陣列形式刪除後, 排在第一個被刪除項目之索引之後、且為索引名之元素(非物件元素, 或物件但無自有 name 欄; wsemi iseobj({}) 為 false 故 {} 視為非物件)
//      具名化為其原索引(物件元素 { ...el, name: 原索引(數字) }, 非物件元素 { name: 原索引, isActive: 原值 }), 使解碼結果(cvKpToArr／getUserRules 之規則名)不因索引前移而改變; kind:'ref' 不具名化
//  D6  (主責裁示, 修 tpure 回報之 D-2) 被拒(err 非 null)之計畫, changes 為空且 nHolders／nRenameHolders／nDelHolders／nExternal 皆 0
//  D7  fillIdlessIds(keyTable, rowsPool, rows): 為未帶 id 之列(grups／pemis)依名稱對應 rowsPool 中 id 未被本批帶用之既有列(同名＝同一實體, 不算刪除再新增; 同名多列依序對應); 名稱不同者視為新實體(給不與任何既有主鍵相同之規劃 id);
//      有限數字之 id 取其字串形式; targets 不做名稱對應; 不改輸入
//  D8  (外審 R2) rewriteRefs 回傳多一欄 unsafe: 容器內含 JSON5 非有限數值(Infinity／-Infinity／NaN／1e999, 在 name、值或巢狀內)而命中改名／刪除須重新編碼時, 不改寫(str 為原字串同一參考、changed:false、計數 0)並回報 unsafe:true
//      (JSON.stringify 會把非有限數值編成 null, 作為 crules 規則名時改指規則 'null' 而改變授權); 未命中者(不須重編碼)不受影響(同一字串、unsafe:false);
//      planRefChanges 遇 unsafe → err:'renameCascadeUnsupported', changes 為空且四個計數歸零(同 conflict)
//  D10 (外審 R6) planRefChanges: 同批兩個改名映射到同一新名(plan.renames 內有兩筆 to 相同)→ err:'renameCascadeConflict'、changes 為空、四計數歸零, 於解碼引用端之前判定(不論引用端有無引用者); 互換／鏈式／循環置換之 to 皆互異不誤拒; cascadeRename:false 時 renames 為空不拒
//  D9  (外審 R1) fillIdlessIds 第 4 參數 rowsAvoid(預設 []): 規劃 id 須避開 rowsPool、rowsAvoid 與本批已帶 id 之全部主鍵(新實體連續避撞); 外部同步 buildSyncRowsNew 把他 from 之列傳為 rowsAvoid, 他來源之列與其引用不得因規劃 id 撞號而被誤判為改名
//
//【測試的組成】
//  RC-1xx  rewriteRefs      單一授權字串之改寫(物件／陣列形式; 改名、刪除、同批互換／鏈式／刪＋改; 未命中同一字串; 壞輸入; 原型鍵名; 屬性鍵轉型; conflict; rule 陣列索引名元素具名化)
//  RC-2xx  diffRefTargets   以 id 判定改名與刪除(歷史同名、刪後同名新增、cascadeRename:false、targets)
//  RC-3xx  planRefChanges   三表級聯、三種拒絕、外部列計數、計數一致性、容錯、無異動不解碼引用端、真 getUserRules 之端到端例
//  RC-4xx  語意不變式       固定種子隨機宇宙(各 3200 組): 改名後授權不變、刪除後授權＝參考結果、字串級參考比對(rule 陣列以解碼後規則名比對)、未受影響字串逐字不動、拒絕與獨立判定一致; RC-410 rule 陣列索引名元素刪除前後授權不變(800 組)
//  RC-5xx  站點不變式       server／src 不得自寫另一套引用改寫(靜態掃描)
//  RC-6xx  fillIdlessIds    未帶 id 之列補規劃 id(混合、同名多列、新實體、targets、數字 id、非物件列、不改輸入、與 planRefChanges 端到端)
//輸入空間: 見各 describe 之註解; 若有缺陷待修案例, 以標題「[缺陷待修]」標示(測試依規格斷言正確行為, 現況為紅, 見 run06 tpure 回報).
//跑法: node node_modules/mocha/bin/mocha.js test/unit-refCascade.test.mjs --timeout 120000

import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import JSON5 from 'json5'
import planRefChangesDefault, { REF_OF, rewriteRefs, diffRefTargets, planRefChanges, fillIdlessIds } from '../src/js/refCascade.mjs'
import getPropKey from '../src/js/getPropKey.mjs'
import { getUserRules } from '../src/plugins/mShare.mjs'
import { buildSyncRowsNew } from '../server/cascadeWrite.mjs'
import procLang from '../server/procLang.mjs'
import { sourceLines, blankStrings } from './tools/srcScan.mjs'


// ---------------------------------------------------------------
// helpers
// ---------------------------------------------------------------

//原型鍵名以變數取用(無原型容器之自有屬性; 避免 no-proto 規則誤判為存取原型)
let PROTO = '__proto__'
let hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k)
let js = (o) => JSON.stringify(o)
let clone = (o) => JSON.parse(JSON.stringify(o))
let MP = (pairs) => new Map(pairs)
let ST = (...a) => new Set(a)
let OR = { mode: 'OR', isActive: 'y' }
let AND = { mode: 'AND', isActive: 'y' }
let OFF = { mode: 'OR', isActive: 'n' }

/** 靜音 getUserRules 對損壞字串之 console.log */
let quiet = (f) => {
    let log = console.log
    console.log = () => {}
    try {
        return f()
    }
    finally {
        console.log = log
    }
}

//objStr: 物件形式授權字串(無原型容器: 名稱可為 __proto__／constructor 等)
let objStr = (pairs) => {
    let o = Object.create(null)
    pairs.forEach(([k, v]) => {
        o[k] = v
    })
    return JSON.stringify(o)
}
//arrStr: 陣列形式授權字串 [{ name, …值 }](值非物件者為 isActive)
let arrStr = (pairs) => JSON.stringify(pairs.map(([name, v]) => ({ name, ...((v !== null && typeof v === 'object') ? v : { isActive: v }) })))
let FORMS = { obj: objStr, arr: arrStr }

//pairsOf: 解析結果轉可比較之陣列(物件形式 → [[鍵, 值], …] 依鍵序; 陣列形式 → [[name, 其餘欄位], …]), 不比較原型
let pairsOf = (s) => {
    let kp = JSON5.parse(s)
    if (Array.isArray(kp)) {
        return kp.map((el) => {
            let { name, ...rest } = el
            return [name, rest]
        })
    }
    return Object.keys(kp).map((k) => [k, kp[k]])
}
//kvOf: 同上但陣列形式保留元素原貌(含無 name／非物件元素)
let kvOf = (s) => {
    let kp = JSON5.parse(s)
    return Array.isArray(kp) ? kp : Object.keys(kp).map((k) => [k, kp[k]])
}

//世界: 一位使用者(u1)→群組 G1→權限 P1→crules; 供以真 getUserRules 驗證端到端授權
let worldOf = (o = {}) => ({
    users: o.users || [{ id: 'u1', name: 'user1', cgrups: objStr([['G1', OR]]) }],
    grups: o.grups || [{ id: 'g1', name: 'G1', cpemis: objStr([['P1', OR]]) }],
    pemis: o.pemis || [{ id: 'p1', name: 'P1', crules: objStr([['T1', 'y']]) }],
    targets: o.targets || [{ id: 'T1' }, { id: 'T2' }, { id: 'T3' }],
})
//authOf: 每位使用者之最終授權字串陣列, 如 ['T1=y T2=n']
let authOf = (W) => quiet(() => W.users.map((u) => getUserRules(u, clone(W.grups), clone(W.pemis), W.targets).rules.map((x) => `${x.name}=${x.isActive}`).join(' ')))
//applyChanges: 把 plan.changes 套到引用端列(依 id)
let applyChanges = (rows, changes) => {
    let by = new Map(changes.map((c) => [c.id, c]))
    return rows.map((r) => (by.has(r.id) ? { ...r, [by.get(r.id).field]: by.get(r.id).after } : r))
}
let G = (id, name, cpemis) => ({ id, name, cpemis })
//H: 依被引用表產生引用端列(grups → users.cgrups; pemis → grups.cpemis)
let H = (tbl, id, str, extra = {}) => (tbl === 'pemis' ? { id, name: id, cpemis: str, ...extra } : { id, name: id, cgrups: str, ...extra })
let U = (id, cgrups, extra = {}) => ({ id, name: id, cgrups, ...extra })
let gp = (rowsOld, rowsNew, holdersOld, opt, keyTable = 'grups') => planRefChanges({ keyTable, rowsOld, rowsNew, holdersOld, opt })
let dt = (keyTable, rowsOld, rowsNew, opt) => diffRefTargets({ keyTable, rowsOld, rowsNew, opt })
let ids = (changes) => changes.map((c) => c.id).sort()


describe('unit-refCascade (引用連帶純函數: 改名級聯與刪除清理, R-PRINCIPLE-00 原則 6、適用表 m／n)', function() {
    this.timeout(180000)

    // ---------------------------------------------------------------
    // RC-1xx rewriteRefs
    // 輸入空間: 形式(物件／陣列) × 操作(改名／刪除／改名＋刪除／互換／鏈式／刪 A 且 B 改名為 A) × 命中(命中／未命中) × 輸入(合法 JSON5／壞輸入) × 名稱(一般／原型鍵名) × kind(ref／rule)
    // ---------------------------------------------------------------
    describe('rewriteRefs(單一授權字串之改寫)', function() {

        it('RC-101 物件形式改名(D1): 外層鍵改名、值原樣(含額外欄位／簡寫值／null／數字)、鍵序不變、仍輸出物件形式; 回傳 { str, changed, nRename, nDel, conflict }', function() {
            let s = objStr([['A', { mode: 'OR', isActive: 'y', memo: 'keep' }], ['X', 'y'], ['Y', null], ['Z', 5]])
            let r = rewriteRefs(s, { rename: MP([['A', 'B']]) })
            assert.deepStrictEqual(Object.keys(r).sort(), ['changed', 'conflict', 'nDel', 'nRename', 'str', 'unsafe'])
            assert.strictEqual(r.unsafe, false, '一般命中改寫不是 unsafe')
            assert.strictEqual(r.changed, true)
            assert.strictEqual(r.nRename, 1)
            assert.strictEqual(r.nDel, 0)
            assert.strictEqual(r.conflict, false)
            assert.ok(!Array.isArray(JSON5.parse(r.str)), '物件形式仍輸出物件')
            assert.deepStrictEqual(pairsOf(r.str), [['B', { mode: 'OR', isActive: 'y', memo: 'keep' }], ['X', 'y'], ['Y', null], ['Z', 5]])
        })

        it('RC-102 陣列形式改名(D1): 元素 name 改名、元素額外欄位保留、元素順序不變、仍輸出陣列形式', function() {
            let s = js([{ name: 'A', mode: 'OR', isActive: 'y', memo: 'keep', extra: { k: 1 } }, { name: 'X', isActive: 'y' }, { name: 'A', mode: 'AND', isActive: 'n' }])
            let r = rewriteRefs(s, { rename: MP([['A', 'B']]) })
            assert.strictEqual(r.changed, true)
            assert.strictEqual(r.nRename, 2, '陣列形式同名重複項皆改名')
            assert.strictEqual(r.conflict, false)
            assert.ok(Array.isArray(JSON5.parse(r.str)), '陣列形式仍輸出陣列')
            assert.deepStrictEqual(JSON5.parse(r.str), [{ name: 'B', mode: 'OR', isActive: 'y', memo: 'keep', extra: { k: 1 } }, { name: 'X', isActive: 'y' }, { name: 'B', mode: 'AND', isActive: 'n' }])
        })

        it('RC-103 刪除(D1、N): 物件／陣列形式皆移除該項(不論 isActive), nDel 計數; 全刪後仍為空物件／空陣列', function() {
            let po = rewriteRefs(objStr([['A', OR], ['B', OFF], ['C', AND]]), { del: ST('A', 'B') })
            assert.deepStrictEqual([po.changed, po.nDel, po.nRename, po.conflict], [true, 2, 0, false])
            assert.deepStrictEqual(pairsOf(po.str), [['C', AND]])
            let pa = rewriteRefs(arrStr([['A', OR], ['B', OFF], ['C', AND]]), { del: ST('A', 'B') })
            assert.deepStrictEqual([pa.changed, pa.nDel, pa.nRename, pa.conflict], [true, 2, 0, false])
            assert.deepStrictEqual(JSON5.parse(pa.str), [{ name: 'C', ...AND }])
            assert.deepStrictEqual(kvOf(rewriteRefs(objStr([['A', OR]]), { del: ST('A') }).str), [])
            assert.deepStrictEqual(JSON5.parse(rewriteRefs(arrStr([['A', OR]]), { del: ST('A') }).str), [])
        })

        it('RC-104 改名＋刪除＋未動並存(D1): 各項互不影響, 其餘項目順序與內容原樣', function() {
            for (let [fm, mk] of Object.entries(FORMS)) {
                let r = rewriteRefs(mk([['K1', AND], ['A', OR], ['D', OFF], ['K2', 'y'], ['E', AND]]), { rename: MP([['A', 'A2'], ['E', 'E2']]), del: ST('D') })
                assert.deepStrictEqual([r.changed, r.nRename, r.nDel, r.conflict], [true, 2, 1, false], fm)
                let exp = (fm === 'obj') ? [['K1', AND], ['A2', OR], ['K2', 'y'], ['E2', AND]] : [['K1', AND], ['A2', OR], ['K2', { isActive: 'y' }], ['E2', AND]]
                assert.deepStrictEqual(pairsOf(r.str), exp, fm)
            }
        })

        it('RC-105 互換 A↔B(D1: 同時套用, 不逐一套用): 兩項互換名稱而各保留原值, 不塌縮成單一項', function() {
            for (let [fm, mk] of Object.entries(FORMS)) {
                let r = rewriteRefs(mk([['A', OR], ['B', AND]]), { rename: MP([['A', 'B'], ['B', 'A']]) })
                assert.deepStrictEqual([r.changed, r.nRename, r.nDel, r.conflict], [true, 2, 0, false], `${fm} 互換不算 conflict`)
                assert.deepStrictEqual(pairsOf(r.str), [['B', OR], ['A', AND]], `${fm} 原 A(OR) 改名為 B, 原 B(AND) 改名為 A`)
            }
        })

        it('RC-106 鏈式 A→B 且 B→C(D1): 同時套用, 容器同含 A、B 時為 B(原A)、C(原B); 只含 A 或只含 B 亦各改一步', function() {
            for (let [fm, mk] of Object.entries(FORMS)) {
                let ren = MP([['A', 'B'], ['B', 'C']])
                let r = rewriteRefs(mk([['A', OR], ['B', AND]]), { rename: ren })
                assert.deepStrictEqual([r.changed, r.nRename, r.conflict], [true, 2, false], fm)
                assert.deepStrictEqual(pairsOf(r.str), [['B', OR], ['C', AND]], fm)
                assert.deepStrictEqual(pairsOf(rewriteRefs(mk([['A', OR]]), { rename: ren }).str), [['B', OR]], `${fm} 只含 A: 只改一步(A→B, 不連跳為 C)`)
                assert.deepStrictEqual(pairsOf(rewriteRefs(mk([['B', AND]]), { rename: ren }).str), [['C', AND]], `${fm} 只含 B`)
            }
        })

        it('RC-107 刪 A 且 B 改名為 A(D1、D2 之 rewrite 端): 原 A 之項被刪、原 B 之項改名為 A, 不算 conflict', function() {
            for (let [fm, mk] of Object.entries(FORMS)) {
                for (let order of [[['A', OR], ['B', AND]], [['B', AND], ['A', OR]]]) {
                    let r = rewriteRefs(mk(order), { rename: MP([['B', 'A']]), del: ST('A') })
                    assert.deepStrictEqual([r.changed, r.nRename, r.nDel, r.conflict], [true, 1, 1, false], fm)
                    assert.deepStrictEqual(pairsOf(r.str), [['A', AND]], `${fm} 只剩原 B 之值(AND), 不繼承原 A 之 OR`)
                }
            }
        })

        it('RC-108 同名同在 rename 與 del(D1: 先判刪除、再判改名): 以刪除處理', function() {
            for (let [fm, mk] of Object.entries(FORMS)) {
                let r = rewriteRefs(mk([['A', OR], ['C', AND]]), { rename: MP([['A', 'B']]), del: ST('A') })
                assert.deepStrictEqual([r.changed, r.nRename, r.nDel, r.conflict], [true, 0, 1, false], fm)
                assert.deepStrictEqual(pairsOf(r.str).map((x) => x[0]), ['C'], fm)
            }
        })

        it('RC-109 改名後另一端被刪(D1): A→B 而 B 同批被刪 → 不算 conflict, 結果為 B(原 A)', function() {
            for (let [fm, mk] of Object.entries(FORMS)) {
                let r = rewriteRefs(mk([['A', OR], ['B', AND]]), { rename: MP([['A', 'B']]), del: ST('B') })
                assert.deepStrictEqual([r.changed, r.nRename, r.nDel, r.conflict], [true, 1, 1, false], fm)
                assert.deepStrictEqual(pairsOf(r.str), [['B', OR]], fm)
            }
        })

        it('RC-110 未命中者「同一字串原樣回傳」(D1: ===, 不重新編碼): 含 JSON5 註解／單引號／尾逗號／無引號鍵/空白排版', function() {
            let strs = [
                '{ /*c*/ \'X\': { mode: \'OR\', isActive: \'y\', }, // tail\n }',
                '[ { name: \'X\', mode: \'AND\', isActive: \'y\', }, ]',
                '// head\n{ X: \'y\', Y: { mode: "OR", isActive: "n" } }',
                '{\n  "X": {"mode":"OR","isActive":"y"}, // trailing comment\n}',
                '  {"X":1}  ',
                '{}',
                '[]',
                '[1, 2, 3]', //純量元素陣列(元素以索引為名, ref 不命中)
                objStr([['X', OR], ['Y', AND]]),
                arrStr([['X', OR], ['Y', AND]]),
            ]
            strs.forEach((s) => {
                let r = rewriteRefs(s, { rename: MP([['A', 'B']]), del: ST('C') })
                assert.strictEqual(r.str, s, `未命中須同一字串: ${s}`)
                assert.deepStrictEqual([r.changed, r.nRename, r.nDel, r.conflict, r.unsafe], [false, 0, 0, false, false], s)
                //無任何改名／刪除: 亦同一字串
                let r0 = rewriteRefs(s, { rename: new Map(), del: new Set() })
                assert.strictEqual(r0.str, s)
                assert.strictEqual(r0.changed, false)
                assert.strictEqual(rewriteRefs(s).str, s, '無 opt')
                assert.strictEqual(rewriteRefs(s, {}).str, s, '空 opt')
            })
        })

        it('RC-111 命中者以 JSON.stringify 重新編碼(D1: 註解／單引號不保留), 輸出為嚴格 JSON 且其餘項目內容保留', function() {
            let s = '{ /*c*/ \'A\': { mode: \'OR\', isActive: \'y\', }, // c2\n \'X\': 1, }'
            let r = rewriteRefs(s, { rename: MP([['A', 'B']]) })
            assert.strictEqual(r.changed, true)
            assert.notStrictEqual(r.str, s)
            let strict = JSON.parse(r.str) //嚴格 JSON 可解析
            assert.deepStrictEqual(Object.keys(strict), ['B', 'X'])
            assert.deepStrictEqual(strict.B, OR)
            assert.strictEqual(strict.X, 1)
            assert.ok(!/\/\*|\/\//.test(r.str), '註解不保留')
        })

        it('RC-112 壞輸入不動不拋(D1): 壞 JSON／空字串／純量／"null"／非字串 → 原值原樣、changed false', function() {
            let bad = ['', '   ', '\n', '{', '{"A":', '[1,', 'not json', '{a:}', '"A"', '123', 'true', 'null', 'undefined', 'NaN']
            let nonStr = [undefined, null, 5, true, {}, [], { A: OR }, [{ name: 'A' }]]
            ;[...bad, ...nonStr].forEach((x) => {
                let r
                assert.doesNotThrow(() => {
                    r = rewriteRefs(x, { rename: MP([['A', 'B']]), del: ST('C') })
                }, `不得拋: ${String(x)}`)
                assert.ok(Object.is(r.str, x), `原值原樣(同一參考): ${String(x)}`)
                assert.deepStrictEqual([r.changed, r.nRename, r.nDel, r.conflict, r.unsafe], [false, 0, 0, false, false], String(x))
            })
            //空容器有操作亦不動
            for (let s of ['{}', '[]']) {
                assert.strictEqual(rewriteRefs(s, { rename: MP([['A', 'B']]), del: ST('C') }).str, s)
            }
        })

        it('RC-113 原型鍵名當舊名／新名／被刪名(D1、P3; R-KEY-01): __proto__、constructor、toString、length、hasOwnProperty、valueOf 皆為一般名稱, 不污染 Object.prototype', function() {
            let names = [PROTO, 'constructor', 'toString', 'length', 'hasOwnProperty', 'valueOf']
            for (let kind of ['ref', 'rule']) {
                for (let [fm, mk] of Object.entries(FORMS)) {
                    for (let n of names) {
                        let lbl = `${kind}/${fm}/${n}`
                        //(a) 當舊名
                        let a = rewriteRefs(mk([[n, OR], ['X', AND]]), { kind, rename: MP([[n, 'Z']]) })
                        assert.deepStrictEqual([a.changed, a.nRename, a.conflict], [true, 1, false], `舊名 ${lbl}`)
                        assert.deepStrictEqual(pairsOf(a.str), [['Z', OR], ['X', AND]], `舊名 ${lbl}`)
                        //(b) 當新名: 輸出須有同名自有鍵(物件形式)／元素 name(陣列形式)
                        let b = rewriteRefs(mk([['X', OR], ['Y', AND]]), { kind, rename: MP([['X', n]]) })
                        assert.deepStrictEqual([b.changed, b.nRename, b.conflict], [true, 1, false], `新名 ${lbl}`)
                        assert.deepStrictEqual(pairsOf(b.str), [[n, OR], ['Y', AND]], `新名 ${lbl}`)
                        if (fm === 'obj') {
                            assert.ok(hasOwn(JSON5.parse(b.str), n), `新名須為自有鍵 ${lbl}`)
                        }
                        //(c) 當被刪名
                        let c = rewriteRefs(mk([[n, OR], ['X', AND]]), { kind, del: ST(n) })
                        assert.deepStrictEqual([c.changed, c.nDel, c.conflict], [true, 1, false], `刪除 ${lbl}`)
                        assert.deepStrictEqual(pairsOf(c.str), [['X', AND]], `刪除 ${lbl}`)
                        //(d) 與一般名互換
                        let d = rewriteRefs(mk([[n, OR], ['X', AND]]), { kind, rename: MP([[n, 'X'], ['X', n]]) })
                        assert.deepStrictEqual([d.changed, d.nRename, d.conflict], [true, 2, false], `互換 ${lbl}`)
                        assert.deepStrictEqual(pairsOf(d.str), [['X', OR], [n, AND]], `互換 ${lbl}`)
                        //(e) 容器內沒有該名而其他項含繼承屬性名的情形: 未命中同一字串(原型鍵名不得被誤判為命中)
                        let s = mk([['X', OR]])
                        assert.strictEqual(rewriteRefs(s, { kind, rename: MP([[n, 'Z']]), del: ST(n) }).str, s, `未命中 ${lbl}`)
                    }
                }
            }
            //不污染
            assert.strictEqual(({}).mode, undefined)
            assert.strictEqual(({}).isActive, undefined)
            assert.strictEqual(Object.prototype.mode, undefined)
            assert.strictEqual(hasOwn(Object.prototype, 'isActive'), false)
        })

        it('RC-114 物件形式值內 name 欄不改(D1; R-AUTH-PATH-01: 物件形式依外層鍵為名, 值內 name 不得改名)', function() {
            let s = objStr([['A', { name: 'Z', mode: 'OR', isActive: 'y' }], ['K', AND]])
            //以值內 name(Z)為目標: 不命中, 同一字串
            let r0 = rewriteRefs(s, { rename: MP([['Z', 'Q']]), del: ST('Z') })
            assert.strictEqual(r0.str, s)
            assert.strictEqual(r0.changed, false)
            //以外層鍵(A)為目標: 外層鍵改名, 值內 name 原樣
            let r = rewriteRefs(s, { rename: MP([['A', 'B']]) })
            assert.deepStrictEqual(pairsOf(r.str), [['B', { name: 'Z', mode: 'OR', isActive: 'y' }], ['K', AND]])
        })

        it('RC-115 陣列元素非物件／無 name(索引名), kind:"ref"(D1: ref 只認字串名): 不命中、原位保留; 非字串 name 亦不命中', function() {
            let els = [{ name: 'A', ...OR }, 'y', 5, null, { mode: 'OR', isActive: 'y' }, {}, { name: 1, isActive: 'y' }, { name: true, isActive: 'y' }]
            let s = js(els)
            //索引字串／數字字串／非字串 name 之字串形式皆不得命中
            let r = rewriteRefs(s, { kind: 'ref', rename: MP([['A', 'B']]), del: ST('0', '1', '2', '3', '4', '5', '6', '7', 'true', 'null') })
            assert.deepStrictEqual([r.changed, r.nRename, r.nDel], [true, 1, 0])
            assert.deepStrictEqual(JSON5.parse(r.str), [{ name: 'B', ...OR }, ...els.slice(1)], '只有 A 被改名, 其餘元素同序同內容')
            //全無字串名者: 同一字串
            let s2 = js(els.slice(1))
            assert.strictEqual(rewriteRefs(s2, { kind: 'ref', rename: MP([['A', 'B']]), del: ST('0', '1', '2', '3', '4', '5', '6') }).str, s2)
            //kind:'ref' 刪除一個字串名元素後, 其後之索引名元素原樣(不具名化: ref 之索引名為非字串, 不對應任何實體, 前移無影響; D5)
            let s3 = js([{ name: 'A', ...OR }, 'y', { name: 'D', ...AND }, 5, {}, { isActive: 'n' }, null])
            let r3 = rewriteRefs(s3, { kind: 'ref', del: ST('D') })
            assert.deepStrictEqual([r3.changed, r3.nDel], [true, 1])
            assert.deepStrictEqual(JSON5.parse(r3.str), [{ name: 'A', ...OR }, 'y', 5, {}, { isActive: 'n' }, null], 'ref: 刪除後其後之索引名元素原樣, 不具名化')
        })

        it('RC-116 kind:"rule" 名稱取屬性鍵轉型(D1; R-KEY-PROP-01, 對照 getPropKey 與真 getUserRules): 數字／布林／null／陣列 name 依轉型後字串比對; 轉型必拋者不對應任何標的、不拋、不影響其他元素', function() {
            let names = [5, 0, 1.5, true, false, null, ['T1'], ['T1', 'T2'], {}, { toString: null }, 'T1']
            names.forEach((name, i) => {
                let s = js([{ name, isActive: 'y' }, { name: 'KEEP', isActive: 'y' }])
                let key = getPropKey(name)
                let lbl = `name#${i}=${JSON.stringify(name)}`
                if (key === null) {
                    //轉型必拋: 不對應任何標的, 略過而不拋; 其他元素照常處理
                    let r = rewriteRefs(s, { kind: 'rule', del: ST('KEEP') })
                    assert.deepStrictEqual(JSON5.parse(r.str), [{ name, isActive: 'y' }], lbl)
                    let r2 = rewriteRefs(s, { kind: 'rule', del: ST('[object Object]', 'undefined', 'null', 'NaN') })
                    assert.strictEqual(r2.str, s, `${lbl} 轉型必拋者不得被其他字串命中`)
                    //真函數亦不拋, 且不影響 KEEP 之授權
                    assert.deepStrictEqual(authOf(worldOf({ pemis: [{ id: 'p1', name: 'P1', crules: s }], targets: [{ id: 'KEEP' }] })), ['KEEP=y'], `${lbl} 真函數略過該元素`)
                    return
                }
                //轉型後字串即為規則鍵: 被刪該鍵者, 該元素移除、其他元素保留
                let r = rewriteRefs(s, { kind: 'rule', del: ST(key) })
                assert.deepStrictEqual([r.changed, r.nDel], [true, 1], lbl)
                assert.deepStrictEqual(JSON5.parse(r.str), [{ name: 'KEEP', isActive: 'y' }], lbl)
                //與真 getUserRules 之鍵一致: 刪前該鍵標的為 y、刪後為 n, KEEP 不變(以真函數驗證「屬性鍵轉型」口徑)
                let W = worldOf({ pemis: [{ id: 'p1', name: 'P1', crules: s }], targets: [{ id: key }, { id: 'KEEP' }] })
                if (key !== 'KEEP') {
                    assert.deepStrictEqual(authOf(W), [`${key}=y KEEP=y`], `${lbl} 真函數: 該鍵對應標的`)
                    let W2 = { ...W, pemis: [{ ...W.pemis[0], crules: r.str }] }
                    assert.deepStrictEqual(authOf(W2), [`${key}=n KEEP=y`], `${lbl} 刪除後`)
                }
                //kind:'ref' 只認字串: 非字串 name 不命中
                if (typeof name !== 'string') {
                    assert.strictEqual(rewriteRefs(s, { kind: 'ref', del: ST(key) }).str, s, `${lbl} ref 不命中非字串 name`)
                }
            })
        })

        it('RC-117 kind:"rule" 陣列內無 name／非物件元素以索引為名(D1、同 cvKpToArr): 刪除該索引名之標的時移除該元素; kind:"ref" 不動', function() {
            let s = js(['y', 'y', 'y'])
            let r = rewriteRefs(s, { kind: 'rule', del: ST('1') })
            assert.deepStrictEqual([r.changed, r.nDel], [true, 1])
            assert.strictEqual(JSON5.parse(r.str).length, 2, '移除索引 1 之元素')
            assert.strictEqual(rewriteRefs(s, { kind: 'ref', del: ST('1') }).str, s, 'ref 不以索引為名')
            //kind:'rule' 刪除索引名元素, 其後之索引名元素具名化(D5), 其前者原樣
            let rs = rewriteRefs(s, { kind: 'rule', del: ST('1') })
            assert.deepStrictEqual(JSON5.parse(rs.str), ['y', { name: 2, isActive: 'y' }], '索引 2 之元素具名化為其原索引, 索引 0 原樣')
            //無 name 之物件元素同理(索引名)
            let s2 = js([{ name: 'T1', isActive: 'y' }, { isActive: 'y' }])
            let r2 = rewriteRefs(s2, { kind: 'rule', del: ST('1') })
            assert.deepStrictEqual(JSON5.parse(r2.str), [{ name: 'T1', isActive: 'y' }])
        })

        it('RC-117b kind:"rule" 陣列內索引名元素: 刪除其中一個標的後, 其他標的之授權(真 getUserRules)不變(P6「不得靜默失效或被同名新資料接管」、D4、D5; 原缺陷 D-1 已修)', function() {
            //crules 為陣列 ['y','y','y'] ⇒ 規則名為索引 '0','1','2'(cvKpToArr/getUserRules); 刪除標的 '1' 時只應移除「標的 1」之授權, 標的 '0'、'2' 之授權不變
            let s = js(['y', 'y', 'y'])
            let W = worldOf({ pemis: [{ id: 'p1', name: 'P1', crules: s }], targets: [{ id: '0' }, { id: '1' }, { id: '2' }] })
            assert.deepStrictEqual(authOf(W), ['0=y 1=y 2=y'], '前提: 真函數以索引為規則名')
            let plan = planRefChanges({ keyTable: 'targets', rowsOld: W.targets, rowsNew: [{ id: '0' }, { id: '2' }], holdersOld: W.pemis })
            assert.strictEqual(plan.err, null)
            let W2 = { ...W, targets: [{ id: '0' }, { id: '2' }], pemis: applyChanges(W.pemis, plan.changes) }
            assert.deepStrictEqual(authOf(W2), ['0=y 2=y'], '刪除標的 1 後, 標的 0、2 之授權不變')
            //被刪除之標的 1 不得被後續同 id 之新標的接管(P6)
            let W3 = { ...W2, targets: [{ id: '0' }, { id: '1' }, { id: '2' }] }
            assert.deepStrictEqual(authOf(W3), ['0=y 1=n 2=y'], '重建標的 1 不繼承原授權')
        })

        it('RC-117c 具名化之輸出形狀(D5 主責裁示): 第一個被刪項目之索引之後、為索引名之元素(非物件／無自有 name 之物件／{}) 具名化為其原索引; 其前者與有 name 者原樣; 只有改名無刪除則不具名化', function() {
            //['y', T1(刪), 'n', {isActive:'y',mode:'OR'}, {}, 5, null]
            let s = js(['y', { name: 'T1', isActive: 'y' }, 'n', { isActive: 'y', mode: 'OR' }, {}, 5, null])
            let r = rewriteRefs(s, { kind: 'rule', del: ST('T1') })
            assert.deepStrictEqual([r.changed, r.nDel], [true, 1])
            assert.deepStrictEqual(JSON5.parse(r.str), ['y', { name: 2, isActive: 'n' }, { isActive: 'y', mode: 'OR', name: 3 }, { name: 4, isActive: {} }, { name: 5, isActive: 5 }, { name: 6, isActive: null }])
            //多個刪除: 以第一個被刪除項目之索引為界, 其後(含兩刪除項之間)之索引名元素皆具名化; 有 name 者原樣
            let s2 = js(['y', 'y', 'y', { name: 'K', isActive: 'y' }, 'y', 'y'])
            let r2 = rewriteRefs(s2, { kind: 'rule', del: ST('1', '4') })
            assert.deepStrictEqual([r2.nDel], [2])
            assert.deepStrictEqual(JSON5.parse(r2.str), ['y', { name: 2, isActive: 'y' }, { name: 'K', isActive: 'y' }, { name: 5, isActive: 'y' }])
            //刪第一個元素: 其後之索引名元素皆具名化
            let r3 = rewriteRefs(js(['y', 'n', 'y']), { kind: 'rule', del: ST('0') })
            assert.deepStrictEqual(JSON5.parse(r3.str), [{ name: 1, isActive: 'n' }, { name: 2, isActive: 'y' }])
            //刪最後一個元素: 其後無元素, 其餘原樣
            let r4 = rewriteRefs(js(['y', 'n', 'y']), { kind: 'rule', del: ST('2') })
            assert.deepStrictEqual(JSON5.parse(r4.str), ['y', 'n'])
            //只有改名無刪除: 不具名化(改名不使索引前移)
            let r5 = rewriteRefs(js(['y', { name: 'T1', isActive: 'y' }, 'n']), { kind: 'rule', rename: MP([['T1', 'T9']]) })
            assert.deepStrictEqual(JSON5.parse(r5.str), ['y', { name: 'T9', isActive: 'y' }, 'n'])
            //解碼語意不變: 以真 getUserRules, 刪除標的 T1 前後其餘標的(索引名 '0'、'2'、'3'…)授權相同
            let W = worldOf({ pemis: [{ id: 'p1', name: 'P1', crules: s2 }], targets: [{ id: '0' }, { id: '1' }, { id: '2' }, { id: 'K' }, { id: '4' }, { id: '5' }] })
            let plan = planRefChanges({ keyTable: 'targets', rowsOld: W.targets, rowsNew: W.targets.filter((t) => t.id !== '1' && t.id !== '4'), holdersOld: W.pemis })
            let Wk = { ...W, targets: W.targets.filter((t) => t.id !== '1' && t.id !== '4') }
            let before = authOf(Wk)
            assert.deepStrictEqual(authOf({ ...Wk, pemis: applyChanges(W.pemis, plan.changes) }), before)
            assert.deepStrictEqual(before, ['0=y 2=y K=y 5=y'])
        })

        it('RC-118 conflict(D1): 新名與容器內未被改走／未被刪之既有項目相撞(含停用項、物件／陣列形式、kind:"rule") → 不改寫(同一字串)、conflict:true、計數 0', function() {
            for (let kind of ['ref', 'rule']) {
                for (let [fm, mk] of Object.entries(FORMS)) {
                    for (let other of [AND, OFF, 'y', 'n']) {
                        let s = mk([['A', OR], ['B', other], ['K', AND]])
                        let r = rewriteRefs(s, { kind, rename: MP([['A', 'B']]) })
                        assert.strictEqual(r.conflict, true, `${kind}/${fm}/${JSON.stringify(other)}`)
                        assert.strictEqual(r.str, s, '不改寫: 同一字串')
                        assert.deepStrictEqual([r.changed, r.nRename, r.nDel, r.unsafe], [false, 0, 0, false])
                    }
                    //同批另有刪除亦不改寫(整個容器不改寫, 不部分套用)
                    let s2 = mk([['A', OR], ['B', AND], ['D', OR]])
                    let r2 = rewriteRefs(s2, { kind, rename: MP([['A', 'B']]), del: ST('D') })
                    assert.deepStrictEqual([r2.conflict, r2.changed, r2.nRename, r2.nDel], [true, false, 0, 0], `${kind}/${fm} conflict 時刪除亦不套用`)
                    assert.strictEqual(r2.str, s2)
                }
            }
        })

        it('RC-119 非 conflict(D1): 容器只含舊名／新名在容器內不存在／新名為被改走者(互換、鏈式)／新名被刪 → 正常改寫', function() {
            for (let [fm, mk] of Object.entries(FORMS)) {
                assert.strictEqual(rewriteRefs(mk([['A', OR]]), { rename: MP([['A', 'B']]) }).conflict, false, `${fm} 只含舊名`)
                assert.strictEqual(rewriteRefs(mk([['A', OR], ['B', OFF]]), { rename: MP([['A', 'B'], ['B', 'C']]) }).conflict, false, `${fm} 新名被改走(鏈)`)
                assert.strictEqual(rewriteRefs(mk([['A', OR], ['B', OFF]]), { rename: MP([['A', 'B']]), del: ST('B') }).conflict, false, `${fm} 新名被刪`)
                //容器內已有新名但舊名不在容器內: 不是該容器之改名, 不算 conflict
                let s = mk([['B', AND], ['K', OR]])
                let r = rewriteRefs(s, { rename: MP([['A', 'B']]) })
                assert.deepStrictEqual([r.conflict, r.changed], [false, false], `${fm} 舊名不在容器`)
                assert.strictEqual(r.str, s)
            }
        })

        it('RC-120 陣列形式同名重複項(歷史資料)改名: 兩項皆改名且不算 conflict(新名在容器內原不存在)', function() {
            let r = rewriteRefs(js([{ name: 'A', ...OR }, { name: 'A', ...AND }]), { rename: MP([['A', 'B']]) })
            assert.deepStrictEqual([r.changed, r.nRename, r.conflict], [true, 2, false])
            assert.deepStrictEqual(JSON5.parse(r.str).map((e) => e.name), ['B', 'B'])
        })

        it('RC-121 opt 容錯與輸入不被改動(D1): 無 opt／kind 非 rule 視為 ref／rename 非 Map 與 del 非 Set 忽略; 傳入之 Map／Set 不被改動', function() {
            let s = objStr([['A', OR], ['X', AND]])
            assert.strictEqual(rewriteRefs(s).changed, false)
            assert.strictEqual(rewriteRefs(s, { rename: { A: 'B' }, del: ['A'] }).str, s, '非 Map／Set 忽略')
            assert.strictEqual(rewriteRefs(s, { rename: [['A', 'B']] }).str, s)
            let r = rewriteRefs(s, { kind: 'weird', rename: MP([['A', 'B']]) })
            assert.deepStrictEqual(pairsOf(r.str), [['B', OR], ['X', AND]], '未知 kind 視為 ref')
            let ren = MP([['A', 'B'], ['X', 'Y']])
            let del = ST('Q')
            rewriteRefs(s, { rename: ren, del })
            assert.deepStrictEqual([...ren.entries()], [['A', 'B'], ['X', 'Y']])
            assert.deepStrictEqual([...del], ['Q'])
        })

        //非有限數值夾具(JSON5 才寫得出, 以字串字面值給): 名稱(含陣列名、巢狀名)、值、巢狀值、元素本身、被刪項目自身
        let NF_CASES = [
            ['陣列 name:Infinity', '[{name:\'gone\',isActive:\'y\'},{name:Infinity,isActive:\'y\'}]', 'rule'],
            ['陣列 name:-Infinity', '[{name:\'gone\',isActive:\'y\'},{name:-Infinity,isActive:\'y\'}]', 'rule'],
            ['陣列 name:NaN', '[{name:\'gone\',isActive:\'y\'},{name:NaN,isActive:\'y\'}]', 'rule'],
            ['陣列 name:[Infinity](陣列名)', '[{name:\'gone\',isActive:\'y\'},{name:[Infinity],isActive:\'y\'}]', 'rule'],
            ['陣列 name:{k:NaN}(巢狀物件名)', '[{name:\'gone\',isActive:\'y\'},{name:{k:NaN},isActive:\'y\'}]', 'rule'],
            ['陣列 isActive:Infinity(值)', '[{name:\'gone\',isActive:\'y\'},{name:\'K\',isActive:Infinity}]', 'rule'],
            ['陣列 巢狀值 deep:[1,{x:-Infinity}]', '[{name:\'gone\',isActive:\'y\'},{name:\'K\',isActive:\'y\',extra:{deep:[1,{x:-Infinity}]}}]', 'ref'],
            ['陣列 元素本身為 Infinity', '[{name:\'gone\',isActive:\'y\'},Infinity]', 'rule'],
            ['陣列 1e999(解析為 Infinity)', '[{name:\'gone\',isActive:\'y\'},{name:\'K\',isActive:1e999}]', 'ref'],
            ['陣列 被刪項目自身含 NaN', '[{name:\'gone\',isActive:NaN}]', 'ref'],
            ['物件 值 Infinity', '{gone:{isActive:\'y\'},K:{isActive:Infinity}}', 'rule'],
            ['物件 mode:NaN', '{gone:{isActive:\'y\'},K:{mode:NaN,isActive:\'y\'}}', 'ref'],
            ['物件 巢狀 memo:{a:[NaN]}', '{gone:{isActive:\'y\'},K:{memo:{a:[NaN]}}}', 'ref'],
            ['物件 被刪項目自身含 Infinity', '{gone:{isActive:\'y\',memo:Infinity},K:{isActive:\'y\'}}', 'ref'],
        ]

        it('RC-122 unsafe(D8; 外審 R2): 容器內含 JSON5 非有限數值而命中改名／刪除須重新編碼 → 不改寫(同一字串)、changed:false、unsafe:true、計數 0(name／值／巢狀／陣列名／元素本身; 物件與陣列形式; ref 與 rule)', function() {
            NF_CASES.forEach(([lbl, s, kind]) => {
                //刪除
                let r = rewriteRefs(s, { kind, del: ST('gone') })
                assert.deepStrictEqual([r.changed, r.nRename, r.nDel, r.conflict, r.unsafe], [false, 0, 0, false, true], `${lbl} 刪除`)
                assert.strictEqual(r.str, s, `${lbl}: str 為原字串(同一參考)`)
                //改名
                let r2 = rewriteRefs(s, { kind, rename: MP([['gone', 'gone2']]) })
                assert.deepStrictEqual([r2.changed, r2.nRename, r2.nDel, r2.conflict, r2.unsafe], [false, 0, 0, false, true], `${lbl} 改名`)
                assert.strictEqual(r2.str, s)
                //改名＋刪除
                let r3 = rewriteRefs(s, { kind, rename: MP([['K', 'K2']]), del: ST('gone') })
                assert.deepStrictEqual([r3.changed, r3.unsafe], [false, true], `${lbl} 改名＋刪除`)
                assert.strictEqual(r3.str, s)
            })
        })

        it('RC-123 含非有限數值但未命中(不須重新編碼)者不受影響(D8): 同一字串、changed:false、unsafe:false; 無任何改名／刪除亦同', function() {
            NF_CASES.forEach(([lbl, s, kind]) => {
                let r = rewriteRefs(s, { kind, rename: MP([['absent', 'x']]), del: ST('absent2') })
                assert.deepStrictEqual([r.changed, r.nRename, r.nDel, r.conflict, r.unsafe], [false, 0, 0, false, false], lbl)
                assert.strictEqual(r.str, s, `${lbl}: 同一字串`)
                let r0 = rewriteRefs(s, { kind })
                assert.deepStrictEqual([r0.changed, r0.unsafe], [false, false], `${lbl} 無操作`)
                assert.strictEqual(r0.str, s)
            })
            //有限之極端數值(大整數、小數、指數、-0)不是 unsafe: 照常改寫
            let r1 = rewriteRefs('[{name:\'gone\',isActive:\'y\'},{name:\'K\',isActive:\'y\',n:[1e300,-1e-300,9007199254740992,0xFF,.5]}]', { kind: 'ref', del: ST('gone') })
            assert.deepStrictEqual([r1.changed, r1.unsafe], [true, false])
            assert.deepStrictEqual(JSON5.parse(r1.str), [{ name: 'K', isActive: 'y', n: [1e300, -1e-300, 9007199254740992, 255, 0.5] }])
        })

        it('RC-124 為何須拒(D8): 照舊 JSON.stringify 重編碼會使授權改變, 而 unsafe 之規劃被拒使授權不變(自寫舊式 stringify 參考模型 + 真 getUserRules)', function() {
            let s = '[{name:\'gone\',isActive:\'y\'},{name:Infinity,isActive:\'y\'}]'
            let W = worldOf({ pemis: [{ id: 'p1', name: 'P1', crules: s }], targets: [{ id: 'gone' }, { id: 'Infinity' }, { id: 'null' }] })
            assert.deepStrictEqual(authOf(W), ['gone=y Infinity=y null=n'], '前提: name:Infinity 之規則名為 "Infinity"(屬性鍵轉型)')
            //舊式參考模型(照舊做法): 解析 → 移除被刪項目 → JSON.stringify
            let naive = JSON.stringify(JSON5.parse(s).filter((e) => e.name !== 'gone'))
            assert.strictEqual(naive, '[{"name":null,"isActive":"y"}]', 'JSON.stringify 把 Infinity 編成 null')
            let Wn = { ...W, targets: [{ id: 'Infinity' }, { id: 'null' }], pemis: [{ ...W.pemis[0], crules: naive }] }
            assert.deepStrictEqual(authOf(Wn), ['Infinity=n null=y'], '舊式做法: 未被刪除之標的 Infinity 被靜默收回, 且標的 null 被靜默授權(改指別的規則)')
            //實際: rewriteRefs 不改寫; planRefChanges 整次拒絕, 無任何寫入 → 授權不變
            let plan = planRefChanges({ keyTable: 'targets', rowsOld: W.targets, rowsNew: [{ id: 'Infinity' }, { id: 'null' }], holdersOld: W.pemis })
            assert.strictEqual(plan.err, 'renameCascadeUnsupported')
            assert.deepStrictEqual([plan.changes, plan.nHolders, plan.nRenameHolders, plan.nDelHolders, plan.nExternal], [[], 0, 0, 0, 0])
            assert.deepStrictEqual(authOf({ ...W, targets: [{ id: 'Infinity' }, { id: 'null' }], pemis: applyChanges(W.pemis, plan.changes) }), ['Infinity=y null=n'], '被拒不套用: 未被刪除之標的授權不變')
        })
    })


    // ---------------------------------------------------------------
    // RC-2xx diffRefTargets
    // 輸入空間: 表(grups／pemis／targets／非引用表) × 事件(同 id 異名／互換／鏈式／刪除／歷史同名只刪其一／全刪／刪後同名新增(新 id)／刪 A 且他列改名為 A／缺 id／id 非字串／缺 name)
    //           × opt.cascadeRename(預設／false)
    // ---------------------------------------------------------------
    describe('diffRefTargets(以主鍵 id 判定改名與須清理之名稱)', function() {

        it('RC-201 改名以 id 判定(D2): 同 id 異名＝改名; 同名不算; 非名稱欄位改動不算; grups／pemis 皆適用', function() {
            for (let tbl of ['grups', 'pemis']) {
                let d = dt(tbl, [{ id: 'g1', name: 'A', memo: 'x' }, { id: 'g2', name: 'K' }], [{ id: 'g1', name: 'B', memo: 'x' }, { id: 'g2', name: 'K', memo: 'changed' }])
                assert.deepStrictEqual(d.renames, [{ id: 'g1', from: 'A', to: 'B' }], tbl)
                assert.strictEqual(d.rename.size, 1)
                assert.strictEqual(d.rename.get('A'), 'B')
                assert.deepStrictEqual(d.delNames, [])
                assert.strictEqual(d.del.size, 0)
            }
            //名稱不變之同 id: 無改名
            assert.deepStrictEqual(dt('grups', [{ id: 'g1', name: 'A' }], [{ id: 'g1', name: 'A' }]).renames, [])
        })

        it('RC-202 互換(D2): 同 id 兩列名稱對調 → 兩筆改名, rename Map 兩筆, 無刪除', function() {
            let d = dt('grups', [{ id: 'g1', name: 'A' }, { id: 'g2', name: 'B' }], [{ id: 'g1', name: 'B' }, { id: 'g2', name: 'A' }])
            assert.deepStrictEqual([...d.rename.entries()].sort(), [['A', 'B'], ['B', 'A']])
            assert.deepStrictEqual(d.renames.map((x) => `${x.id}:${x.from}>${x.to}`).sort(), ['g1:A>B', 'g2:B>A'])
            assert.deepStrictEqual(d.delNames, [])
        })

        it('RC-203 鏈式(D2): g1 A→B 且 g2 B→C → rename Map A→B、B→C, 無刪除', function() {
            let d = dt('pemis', [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }], [{ id: 'p1', name: 'B' }, { id: 'p2', name: 'C' }])
            assert.deepStrictEqual([...d.rename.entries()].sort(), [['A', 'B'], ['B', 'C']])
            assert.deepStrictEqual(d.delNames, [])
        })

        it('RC-204 opt.cascadeRename:false(D2、D3): renames 空、rename Map 空, 刪除之名稱仍在 delNames; 預設與 true 同', function() {
            let rowsOld = [{ id: 'g1', name: 'A' }, { id: 'g2', name: 'B' }, { id: 'g3', name: 'C' }]
            let rowsNew = [{ id: 'g1', name: 'A2' }, { id: 'g2', name: 'B' }]
            let off = dt('grups', rowsOld, rowsNew, { cascadeRename: false })
            assert.deepStrictEqual(off.renames, [])
            assert.strictEqual(off.rename.size, 0)
            assert.deepStrictEqual(off.delNames, ['C'])
            for (let opt of [undefined, {}, { cascadeRename: true }]) {
                let on = dt('grups', rowsOld, rowsNew, opt)
                assert.deepStrictEqual(on.renames, [{ id: 'g1', from: 'A', to: 'A2' }], JSON.stringify(opt))
                assert.deepStrictEqual(on.delNames, ['C'])
            }
        })

        it('RC-205 targets(D2): id 即名稱; 改 id＝刪舊增新(不產 renames, 舊 id 進 delNames, 新 id 不繼承); 同 id 之其他欄位改動無影響', function() {
            let d = dt('targets', [{ id: 'T1', memo: 'a' }, { id: 'T2' }], [{ id: 'T9' }, { id: 'T2', memo: 'changed' }])
            assert.deepStrictEqual(d.renames, [])
            assert.strictEqual(d.rename.size, 0)
            assert.deepStrictEqual(d.delNames, ['T1'])
            //cascadeRename:false 對 targets 無差別
            assert.deepStrictEqual(dt('targets', [{ id: 'T1' }], [{ id: 'T9' }], { cascadeRename: false }).delNames, ['T1'])
        })

        it('RC-206 缺 id 之新列視為新增; 新列 id 非字串者忽略; 舊列 id 非字串者忽略(D2)', function() {
            //新列缺 id(即使名稱相同)不對應既有列: 舊列 g1 視為被刪
            let d1 = dt('grups', [{ id: 'g1', name: 'A' }], [{ name: 'A' }])
            assert.deepStrictEqual(d1.renames, [])
            assert.deepStrictEqual(d1.delNames, ['A'])
            //新列 id 非字串(數字／null／物件／陣列): 忽略, 舊列視為被刪
            let d2 = dt('grups', [{ id: 'g1', name: 'A' }], [{ id: 1, name: 'B' }, { id: null, name: 'C' }, { id: {}, name: 'D' }, { id: ['g1'], name: 'E' }])
            assert.strictEqual(d2.newById.size, 0)
            assert.deepStrictEqual(d2.renames, [])
            assert.deepStrictEqual(d2.delNames, ['A'])
            //舊列 id 非字串: 無法對應, 不產生刪除或改名
            let d3 = dt('grups', [{ id: 5, name: 'A' }, { name: 'B' }, { id: null, name: 'C' }], [])
            assert.strictEqual(d3.oldById.size, 0)
            assert.deepStrictEqual(d3.delNames, [])
            assert.deepStrictEqual(d3.renames, [])
        })

        it('RC-207 歷史同名只刪其一(D2、N): 名稱仍有同 id 同名之存續列 → 該名稱不進 delNames(引用仍解得出)', function() {
            for (let tbl of ['grups', 'pemis']) {
                let d = dt(tbl, [{ id: 'g1', name: 'A' }, { id: 'g2', name: 'A' }, { id: 'g3', name: 'B' }], [{ id: 'g1', name: 'A' }, { id: 'g3', name: 'B' }])
                assert.deepStrictEqual(d.delNames, [], tbl)
                assert.strictEqual(d.del.size, 0)
                //刪的是另一筆亦同
                assert.deepStrictEqual(dt(tbl, [{ id: 'g1', name: 'A' }, { id: 'g2', name: 'A' }], [{ id: 'g2', name: 'A' }]).delNames, [])
            }
        })

        it('RC-207b 歷史同名之另一筆已改名者不算「同 id 同名之存續列」(D2): 刪其一、另一筆改名 → 名稱仍進 delNames 且 renames 含該改名; 是否拒絕由 planRefChanges 之 DupGroup 判定(M)', function() {
            let rowsOld = [{ id: 'g1', name: 'A' }, { id: 'g2', name: 'A' }]
            let rowsNew = [{ id: 'g2', name: 'B' }]
            let d = dt('grups', rowsOld, rowsNew)
            assert.deepStrictEqual(d.delNames, ['A'])
            assert.deepStrictEqual(d.renames, [{ id: 'g2', from: 'A', to: 'B' }])
            //cascadeRename:false: 無改名, 但名稱 A 已無同 id 同名之存續列 → 仍須清理
            let off = dt('grups', rowsOld, rowsNew, { cascadeRename: false })
            assert.deepStrictEqual([off.renames, off.delNames], [[], ['A']])
            //plan: 名稱 A 被引用 → 被改名者屬歷史同名組 → DupGroup; 不級聯時只做刪除清理
            let holders = [U('u1', objStr([['A', OR], ['K', AND]]))]
            let p1 = gp(rowsOld, rowsNew, holders)
            assert.deepStrictEqual([p1.err, p1.changes], ['renameCascadeDupGroup', []])
            let p2 = gp(rowsOld, rowsNew, holders, { cascadeRename: false })
            assert.deepStrictEqual([p2.err, p2.delNames, p2.nDelHolders], [null, ['A'], 1])
            assert.deepStrictEqual(pairsOf(p2.changes[0].after), [['K', AND]])
        })

        it('RC-208 歷史同名全刪(D2): 名稱進 delNames(僅一次); 另刪其他名稱者各自進', function() {
            let d = dt('grups', [{ id: 'g1', name: 'A' }, { id: 'g2', name: 'A' }, { id: 'g3', name: 'B' }, { id: 'g4', name: 'C' }], [{ id: 'g4', name: 'C' }])
            assert.deepStrictEqual([...d.delNames].sort(), ['A', 'B'])
            assert.deepStrictEqual([...d.del].sort(), ['A', 'B'])
        })

        it('RC-209 刪除後以同名新增(新 id)者不繼承(D2、P6): 該名稱仍進 delNames, renames 為空', function() {
            for (let tbl of ['grups', 'pemis']) {
                let d = dt(tbl, [{ id: 'g1', name: 'A' }], [{ id: 'g9', name: 'A' }])
                assert.deepStrictEqual(d.delNames, ['A'], tbl)
                assert.deepStrictEqual(d.renames, [])
                //缺 id 之新列同名亦同
                assert.deepStrictEqual(dt(tbl, [{ id: 'g1', name: 'A' }], [{ name: 'A' }]).delNames, ['A'])
            }
        })

        it('RC-210 刪 A(id1) 且 id2 由 B 改名為 A(D2): delNames 含 A 且 renames 含 B→A(與 rewriteRefs 先刪後改之語意一致)', function() {
            let d = dt('grups', [{ id: 'g1', name: 'A' }, { id: 'g2', name: 'B' }], [{ id: 'g2', name: 'A' }])
            assert.deepStrictEqual(d.delNames, ['A'])
            assert.deepStrictEqual(d.renames, [{ id: 'g2', from: 'B', to: 'A' }])
            assert.strictEqual(d.rename.get('B'), 'A')
            //套到引用字串: 原 A 之項被清, 原 B 之項改名為 A(不繼承原 A 之值)
            let r = rewriteRefs(objStr([['A', OR], ['B', AND]]), { rename: d.rename, del: d.del })
            assert.deepStrictEqual(pairsOf(r.str), [['A', AND]])
        })

        it('RC-211 缺 name 欄視為 ""(D2; 同 findRefRows 之「列無 name 欄視為空字串」): 缺名稱列被刪 → delNames 含 ""; 缺名稱列補名稱 → 改名 ""→X; 非字串名稱不產生改名／刪除且不拋', function() {
            assert.deepStrictEqual(dt('grups', [{ id: 'g1' }], []).delNames, [''])
            assert.deepStrictEqual(dt('grups', [{ id: 'g1' }], [{ id: 'g1', name: 'X' }]).renames, [{ id: 'g1', from: '', to: 'X' }])
            //非字串名稱(表欄位實為 STRING, 此為防禦): 不改名不刪除
            let d = dt('grups', [{ id: 'g1', name: 5 }, { id: 'g2', name: null }, { id: 'g3', name: 'A' }], [{ id: 'g1', name: 'X' }, { id: 'g3', name: 7 }])
            assert.deepStrictEqual(d.renames, [])
            assert.deepStrictEqual(d.delNames, [])
        })

        it('RC-212 非引用表／缺參數／非陣列列／陣列內 null 項(D2): 回傳空結果不拋', function() {
            let empty = (d) => {
                assert.deepStrictEqual([d.renames, d.delNames, d.rename.size, d.del.size], [[], [], 0, 0])
            }
            empty(dt('users', [{ id: 'u1', name: 'A' }], []))
            empty(dt('', [{ id: 'u1', name: 'A' }], []))
            empty(dt('toString', [{ id: 'u1', name: 'A' }], []))
            empty(dt(PROTO, [{ id: 'u1', name: 'A' }], []))
            empty(diffRefTargets(undefined))
            empty(diffRefTargets({}))
            empty(dt('grups', undefined, undefined))
            empty(dt('grups', null, 'x'))
            empty(dt('grups', [null, undefined, 5, 'x'], [null, 7]))
        })

        it('RC-213 回傳 oldById／newById 為以字串主鍵建立之列 Map(D2: 文件化之回傳欄位)', function() {
            let a = { id: 'g1', name: 'A' }
            let b = { id: 'g1', name: 'B' }
            let d = dt('grups', [a, { name: 'noid' }], [b, { id: 3 }])
            assert.strictEqual(d.oldById.get('g1'), a)
            assert.strictEqual(d.newById.get('g1'), b)
            assert.strictEqual(d.oldById.size, 1)
            assert.strictEqual(d.newById.size, 1)
        })
    })


    // ---------------------------------------------------------------
    // RC-3xx planRefChanges
    // 輸入空間: 表(grups／pemis／targets／未知) × 事件(改名／刪除／改名＋刪除／無異動) × 拒絕(DupGroup／NameInUse／Conflict／無) × cascadeRename(預設／false)
    //           × 引用端列(命中／未命中／from 各型／缺 id／欄位非字串／非陣列 holders)
    // ---------------------------------------------------------------
    describe('planRefChanges(級聯計畫)', function() {

        it('RC-301 三表對映(D3): grups→users.cgrups、pemis→grups.cpemis、targets→pemis.crules; 未知／缺參數回傳空計畫', function() {
            assert.deepStrictEqual(REF_OF, {
                grups: { holder: 'users', field: 'cgrups', kind: 'ref' },
                pemis: { holder: 'grups', field: 'cpemis', kind: 'ref' },
                targets: { holder: 'pemis', field: 'crules', kind: 'rule' },
            })
            let exp = { grups: ['users', 'cgrups'], pemis: ['grups', 'cpemis'], targets: ['pemis', 'crules'] }
            Object.entries(exp).forEach(([tbl, [holder, field]]) => {
                let p = gp([], [], [], undefined, tbl)
                assert.deepStrictEqual([p.keyTable, p.holder, p.field, p.err], [tbl, holder, field, null])
            })
            let empty = {
                err: null, renames: [], delNames: [], changes: [], nHolders: 0, nRenameHolders: 0, nDelHolders: 0, nExternal: 0,
            }
            for (let kt of ['users', '', 'toString', PROTO, undefined, null, 5]) {
                let p = planRefChanges({ keyTable: kt, rowsOld: [{ id: 'x', name: 'A' }], rowsNew: [], holdersOld: [U('u1', objStr([['A', OR]]))] })
                assert.deepStrictEqual(p, { ...empty, keyTable: kt, holder: '', field: '' }, `keyTable=${String(kt)}`)
            }
            assert.deepStrictEqual(planRefChanges(undefined), { ...empty, keyTable: '', holder: '', field: '' })
            assert.strictEqual(planRefChangesDefault, planRefChanges, 'default export 即 planRefChanges')
        })

        it('RC-302 群組改名 → users.cgrups(M、P6): 命中列有 before／after／nRename／nDel／from, 未命中列不在 changes; 物件／陣列形式皆適用', function() {
            let holders = [
                U('u1', objStr([['A', OR], ['K', AND]])),
                U('u2', arrStr([['A', AND], ['K', OR]])),
                U('u3', objStr([['K', OR]])),
                U('u4', ''),
            ]
            let p = gp([G('g1', 'A', ''), G('g2', 'K', '')], [G('g1', 'B', ''), G('g2', 'K', '')], holders)
            assert.strictEqual(p.err, null)
            assert.deepStrictEqual(p.renames, [{ id: 'g1', from: 'A', to: 'B' }])
            assert.deepStrictEqual(p.delNames, [])
            assert.deepStrictEqual(ids(p.changes), ['u1', 'u2'])
            let c1 = p.changes.find((c) => c.id === 'u1')
            assert.deepStrictEqual([c1.field, c1.nRename, c1.nDel, c1.from], ['cgrups', 1, 0, ''])
            assert.strictEqual(c1.before, holders[0].cgrups, 'before 為原字串(同一參考)')
            assert.deepStrictEqual(pairsOf(c1.after), [['B', OR], ['K', AND]])
            let c2 = p.changes.find((c) => c.id === 'u2')
            assert.ok(Array.isArray(JSON5.parse(c2.after)), '陣列形式仍輸出陣列')
            assert.deepStrictEqual(pairsOf(c2.after), [['B', { mode: 'AND', isActive: 'y' }], ['K', { mode: 'OR', isActive: 'y' }]])
            assert.deepStrictEqual([p.nHolders, p.nRenameHolders, p.nDelHolders, p.nExternal], [2, 2, 0, 0])
        })

        it('RC-303 權限改名 → grups.cpemis(M、P6)', function() {
            let holders = [{ id: 'g1', name: 'G1', cpemis: objStr([['P1', OR], ['P2', AND]]) }, { id: 'g2', name: 'G2', cpemis: arrStr([['P1', OFF]]) }, { id: 'g3', name: 'G3', cpemis: objStr([['P2', OR]]) }]
            let p = gp([G('p1', 'P1'), G('p2', 'P2')], [G('p1', 'P1x'), G('p2', 'P2')], holders, undefined, 'pemis')
            assert.deepStrictEqual([p.err, p.holder, p.field], [null, 'grups', 'cpemis'])
            assert.deepStrictEqual(ids(p.changes), ['g1', 'g2'])
            assert.deepStrictEqual(pairsOf(p.changes[0].after), [['P1x', OR], ['P2', AND]])
            assert.deepStrictEqual(pairsOf(p.changes[1].after), [['P1x', { mode: 'OR', isActive: 'n' }]], '停用項亦隨改名(身分不變, 日後重新啟用仍指向同一實體)')
        })

        it('RC-304 標的刪除 → pemis.crules(N、P6): targets 只有刪除; 物件／陣列形式; 改 id＝刪舊增新(新 id 不繼承、不級聯)', function() {
            let holders = [
                { id: 'p1', name: 'P1', crules: objStr([['T1', 'y'], ['T2', 'n']]) },
                { id: 'p2', name: 'P2', crules: arrStr([['T1', 'y'], ['T2', 'y']]) },
                { id: 'p3', name: 'P3', crules: objStr([['T2', 'y']]) },
            ]
            //刪 T1
            let p = gp([{ id: 'T1' }, { id: 'T2' }], [{ id: 'T2' }], holders, undefined, 'targets')
            assert.deepStrictEqual([p.err, p.holder, p.field, p.renames, p.delNames], [null, 'pemis', 'crules', [], ['T1']])
            assert.deepStrictEqual(ids(p.changes), ['p1', 'p2'])
            assert.deepStrictEqual(pairsOf(p.changes[0].after), [['T2', 'n']])
            assert.deepStrictEqual(JSON5.parse(p.changes[1].after), [{ name: 'T2', isActive: 'y' }])
            assert.deepStrictEqual([p.nHolders, p.nRenameHolders, p.nDelHolders], [2, 0, 2])
            //改 id T1→T9: T1 之引用被清, T9 不被賦予任何引用
            let p2 = gp([{ id: 'T1' }, { id: 'T2' }], [{ id: 'T9' }, { id: 'T2' }], holders, undefined, 'targets')
            assert.deepStrictEqual([p2.renames, p2.delNames], [[], ['T1']])
            assert.ok(p2.changes.every((c) => !c.after.includes('T9')))
        })

        it('RC-304b 標的刪除後以同 id 重建不繼承授權(P6、N; 真 getUserRules): 物件／陣列／數字 name 元素皆然', function() {
            for (let [lbl, crules, tid] of [
                ['obj', objStr([['T1', 'y']]), 'T1'],
                ['arr', arrStr([['T1', 'y']]), 'T1'],
                ['數字name', js([{ name: 5, isActive: 'y' }]), '5'],
            ]) {
                let W = worldOf({ pemis: [{ id: 'p1', name: 'P1', crules }], targets: [{ id: tid }, { id: 'T2' }] })
                assert.deepStrictEqual(authOf(W), [`${tid}=y T2=n`], `${lbl} 前提`)
                //批次 1: 刪標的
                let p = planRefChanges({ keyTable: 'targets', rowsOld: W.targets, rowsNew: [{ id: 'T2' }], holdersOld: W.pemis })
                assert.strictEqual(p.err, null)
                assert.strictEqual(p.nHolders, 1, lbl)
                let W2 = { ...W, targets: [{ id: 'T2' }], pemis: applyChanges(W.pemis, p.changes) }
                assert.deepStrictEqual(authOf(W2), ['T2=n'], `${lbl} 刪後`)
                //批次 2: 以同 id 新增標的 → 不得被原授權接管
                let p2 = planRefChanges({ keyTable: 'targets', rowsOld: W2.targets, rowsNew: [{ id: 'T2' }, { id: tid }], holdersOld: W2.pemis })
                assert.deepStrictEqual([p2.err, p2.changes], [null, []], `${lbl} 純新增不需改寫`)
                let W3 = { ...W2, targets: [{ id: 'T2' }, { id: tid }] }
                assert.deepStrictEqual(authOf(W3), [`T2=n ${tid}=n`], `${lbl} 重建後不繼承`)
            }
        })

        it('RC-305 群組／權限刪除 → 連帶清理引用(N、P6): 不論 isActive／mode 皆清; delNames; renames 空', function() {
            let holders = [U('u1', objStr([['A', AND], ['K', OR]])), U('u2', arrStr([['A', OFF], ['K', OR]])), U('u3', objStr([['K', OR]]))]
            let p = gp([G('g1', 'A', ''), G('g2', 'K', '')], [G('g2', 'K', '')], holders)
            assert.deepStrictEqual([p.err, p.renames, p.delNames], [null, [], ['A']])
            assert.deepStrictEqual(ids(p.changes), ['u1', 'u2'])
            p.changes.forEach((c) => {
                assert.deepStrictEqual([c.nRename, c.nDel], [0, 1])
                assert.deepStrictEqual(pairsOf(c.after).map((x) => x[0]), ['K'])
            })
            assert.deepStrictEqual([p.nHolders, p.nRenameHolders, p.nDelHolders], [2, 0, 2])
            //權限刪除 → grups.cpemis
            let ph = gp([G('p1', 'P1'), G('p2', 'P2')], [G('p2', 'P2')], [{ id: 'g1', cpemis: objStr([['P1', OR], ['P2', AND]]) }], undefined, 'pemis')
            assert.deepStrictEqual([ph.holder, ph.field, ph.delNames, ph.nDelHolders], ['grups', 'cpemis', ['P1'], 1])
        })

        it('RC-305b 刪除群組: 以 AND 引用者清理後限制解除、授權變多屬預期, 且等同舊版「找不到即忽略」(N; 真 getUserRules)', function() {
            let W = worldOf({
                users: [U('u1', objStr([['G1', OR], ['G2', AND]]))],
                grups: [G('g1', 'G1', objStr([['P1', OR]])), G('g2', 'G2', objStr([['P2', OR]]))],
                pemis: [{ id: 'p1', name: 'P1', crules: objStr([['T1', 'y'], ['T2', 'y']]) }, { id: 'p2', name: 'P2', crules: objStr([['T2', 'y'], ['T3', 'y']]) }],
            })
            assert.deepStrictEqual(authOf(W), ['T1=n T2=y T3=n'], '前提: G1(OR) ∩ G2(AND) = {T2}')
            let p = planRefChanges({ keyTable: 'grups', rowsOld: W.grups, rowsNew: [W.grups[0]], holdersOld: W.users })
            assert.deepStrictEqual([p.err, p.delNames, p.nDelHolders], [null, ['G2'], 1])
            let W2 = { ...W, grups: [W.grups[0]], users: applyChanges(W.users, p.changes) }
            assert.deepStrictEqual(authOf(W2), ['T1=y T2=y T3=n'], 'AND 引用被清理後限制解除: T1 變為 y(提示於確認框)')
            //等同舊版「找不到即忽略」: 未清理而引用懸空時舊版不計入 → 與清理後相同(以獨立參考: 自原字串移除該項)
            let ref = { ...W, grups: [W.grups[0]], users: [U('u1', objStr([['G1', OR]]))] }
            assert.deepStrictEqual(authOf(W2), authOf(ref))
        })

        it('RC-306 改名＋刪除同批(D1、D2、D3): 同一引用端列兩者皆計(nRenameHolders、nDelHolders 各 +1, nHolders 只 +1); 互換同批亦然', function() {
            let holders = [U('u1', objStr([['A', OR], ['B', AND], ['C', OR]]))]
            let p = gp([G('g1', 'A', ''), G('g2', 'B', ''), G('g3', 'C', '')], [G('g1', 'B', ''), G('g2', 'A', '')], holders)
            assert.strictEqual(p.err, null)
            assert.deepStrictEqual(p.delNames, ['C'])
            assert.deepStrictEqual(p.renames.map((x) => `${x.from}>${x.to}`).sort(), ['A>B', 'B>A'])
            assert.deepStrictEqual([p.nHolders, p.nRenameHolders, p.nDelHolders], [1, 1, 1])
            assert.deepStrictEqual([p.changes[0].nRename, p.changes[0].nDel], [2, 1])
            assert.deepStrictEqual(pairsOf(p.changes[0].after), [['B', OR], ['A', AND]])
        })

        it('RC-307 刪除後以同名新增(新 id)不繼承引用(P6、D2): 原引用被清, 新同名群組之授權不被舊引用接管(真 getUserRules)', function() {
            let W = worldOf({
                users: [U('u1', objStr([['G1', OR]]))],
                grups: [G('g1', 'G1', objStr([['P1', OR]]))],
                pemis: [{ id: 'p1', name: 'P1', crules: objStr([['T1', 'y'], ['T2', 'y']]) }],
            })
            assert.deepStrictEqual(authOf(W), ['T1=y T2=y T3=n'])
            let gNew = [G('g9', 'G1', objStr([['P1', OR]]))] //刪 g1, 以同名新增 g9(內容相同)
            let p = planRefChanges({ keyTable: 'grups', rowsOld: W.grups, rowsNew: gNew, holdersOld: W.users })
            assert.deepStrictEqual([p.err, p.delNames, p.renames], [null, ['G1'], []])
            assert.strictEqual(p.nHolders, 1)
            let W2 = { ...W, grups: gNew, users: applyChanges(W.users, p.changes) }
            assert.deepStrictEqual(authOf(W2), ['T1=n T2=n T3=n'], '使用者不再屬於 G1, 新 G1 不得接管')
        })

        it('RC-308 外部列計數 nExternal(D3): from 為非空字串才算; null／數字／空字串／缺欄皆不算; 未被改寫之外部列不算; changes[].from 為字串(非外部為 "")', function() {
            let a = objStr([['A', OR]])
            let holders = [
                U('e1', a, { from: 'ext' }),
                U('e2', a, { from: 'x' }),
                U('n1', a, { from: null }),
                U('n2', a, { from: 5 }),
                U('n3', a, { from: '' }),
                U('n4', a),
                U('n5', a, { from: {} }),
                U('n6', a, { from: [] }),
                U('e3', objStr([['K', OR]]), { from: 'ext' }), //外部但未命中
            ]
            let p = gp([G('g1', 'A', '')], [G('g1', 'B', '')], holders)
            assert.strictEqual(p.nHolders, 8, '8 列命中(e3 未命中)')
            assert.strictEqual(p.nExternal, 2)
            let fromOf = (id) => p.changes.find((c) => c.id === id).from
            assert.deepStrictEqual(['e1', 'e2', 'n1', 'n2', 'n3', 'n4', 'n5', 'n6'].map(fromOf), ['ext', 'x', '', '', '', '', '', ''])
            assert.strictEqual(p.changes.find((c) => c.id === 'e3'), undefined)
            //刪除計入外部
            let pd = gp([G('g1', 'A', '')], [], [U('e1', a, { from: 'ext' }), U('n1', a)])
            assert.deepStrictEqual([pd.nHolders, pd.nDelHolders, pd.nRenameHolders, pd.nExternal], [2, 2, 0, 1])
        })

        it('RC-309 計數一致性(D3): nHolders＝changes 數; nRenameHolders／nDelHolders＝有改名／刪除之列數; 一列兩者皆有各計一次; nExternal ≤ nHolders', function() {
            let holders = [
                U('u1', objStr([['A', OR]])), //改名
                U('u2', objStr([['C', AND]])), //刪除
                U('u3', objStr([['A', OR], ['C', AND]])), //兩者
                U('u4', objStr([['D', OR]])), //無
                U('u5', objStr([['A', OR]]), { from: 'ext' }), //改名＋外部
                U('u6', objStr([['D', OR]]), { from: 'ext' }), //外部但無影響
                U('u7', ''), //空
            ]
            let p = gp([G('g1', 'A', ''), G('g2', 'C', ''), G('g3', 'D', '')], [G('g1', 'B', ''), G('g3', 'D', '')], holders)
            assert.strictEqual(p.err, null)
            assert.deepStrictEqual(ids(p.changes), ['u1', 'u2', 'u3', 'u5'])
            assert.deepStrictEqual([p.nHolders, p.nRenameHolders, p.nDelHolders, p.nExternal], [4, 3, 2, 1])
            let by = Object.fromEntries(p.changes.map((c) => [c.id, [c.nRename, c.nDel]]))
            assert.deepStrictEqual(by, { u1: [1, 0], u2: [0, 1], u3: [1, 1], u5: [1, 0] })
            assert.strictEqual(p.nHolders, p.changes.length)
            assert.ok(p.nRenameHolders <= p.nHolders && p.nDelHolders <= p.nHolders && p.nExternal <= p.nHolders)
            assert.ok(p.nHolders <= p.nRenameHolders + p.nDelHolders)
        })

        it('RC-310 引用端列容錯(D3): 缺 id／id 非字串／欄位缺或非字串／壞 JSON／空字串／null 列／非物件列 → 不納入、不拋; holders 非陣列 → 無 changes', function() {
            let a = objStr([['A', OR]])
            let garbage = [null, undefined, 'str', 5, true, [], {}, { cgrups: a }, { id: 7, cgrups: a }, { id: null, cgrups: a }, { id: 'x' }, { id: 'y', cgrups: 123 }, { id: 'z', cgrups: { A: OR } }, { id: 'w', cgrups: '{bad' }, { id: 'v', cgrups: '' }, { id: 'q', cgrups: null }, { id: 'ok', cgrups: a }]
            let p
            assert.doesNotThrow(() => {
                p = gp([G('g1', 'A', '')], [G('g1', 'B', '')], garbage)
            })
            assert.strictEqual(p.err, null)
            assert.deepStrictEqual(ids(p.changes), ['ok'], '缺字串 id 之列無從寫回, 不納入')
            assert.strictEqual(p.nHolders, 1)
            for (let h of [undefined, null, {}, 'str', 5, { 0: U('u1', a), length: 1 }]) {
                let p2
                assert.doesNotThrow(() => {
                    p2 = gp([G('g1', 'A', '')], [G('g1', 'B', '')], h)
                })
                assert.deepStrictEqual([p2.err, p2.changes, p2.nHolders], [null, [], 0], `holders=${String(h)}`)
                assert.deepStrictEqual(p2.renames, [{ id: 'g1', from: 'A', to: 'B' }], 'renames 與引用端無關')
            }
            //rowsOld／rowsNew 非陣列
            assert.doesNotThrow(() => planRefChanges({ keyTable: 'grups', holdersOld: [U('u1', a)] }))
        })

        it('RC-311 無改名無刪除 → 空計畫, 且不讀取引用端(D3、D4): 以 getter 計數證明(同一 id／欄位皆未被讀取); 有改名之對照組讀取數 > 0', function() {
            let spy = { reads: 0 }
            let h = {
                get id() {
                    spy.reads++
                    return 'u1'
                },
                get cgrups() {
                    spy.reads++
                    return objStr([['A', OR]])
                },
                get from() {
                    spy.reads++
                    return 'ext'
                },
            }
            let thrower = {
                get id() {
                    throw new Error('引用端 id 不得被讀取')
                },
                get cgrups() {
                    throw new Error('引用端欄位不得被讀取')
                },
            }
            let base = [{ id: 'g1', name: 'A', memo: 'm' }, { id: 'g2', name: 'K' }]
            let noops = {
                '列相同': base.map((r) => ({ ...r })),
                '只換順序': [base[1], base[0]],
                '只改非名稱欄位': [{ ...base[0], memo: 'changed' }, { ...base[1], x: 1 }],
                '只新增列': [...base, { id: 'g9', name: 'NEW' }],
                '只新增列(缺 id)': [...base, { name: 'NEW2' }],
            }
            Object.entries(noops).forEach(([lbl, rowsNew]) => {
                spy.reads = 0
                let p = gp(base, rowsNew, [h, thrower])
                assert.deepStrictEqual([p.err, p.renames, p.delNames, p.changes, p.nHolders, p.nRenameHolders, p.nDelHolders, p.nExternal], [null, [], [], [], 0, 0, 0, 0], lbl)
                assert.strictEqual(spy.reads, 0, `${lbl}: 引用端不得被讀取`)
            })
            //cascadeRename:false 且只有改名 ＝ 無操作
            spy.reads = 0
            let p0 = gp(base, [{ id: 'g1', name: 'B' }, base[1]], [h, thrower], { cascadeRename: false })
            assert.deepStrictEqual([p0.err, p0.changes, p0.renames], [null, [], []])
            assert.strictEqual(spy.reads, 0, 'cascadeRename:false 之純改名: 引用端不得被讀取')
            //targets／pemis 同理
            spy.reads = 0
            gp([{ id: 'T1' }], [{ id: 'T1', memo: 'x' }, { id: 'T2' }], [h, thrower], undefined, 'targets')
            gp(base, base, [h, thrower], undefined, 'pemis')
            assert.strictEqual(spy.reads, 0)
            //對照組: 有改名 → 引用端被讀取(證明 getter 計數有效, 而非恆為 0)
            spy.reads = 0
            let p1 = gp(base, [{ id: 'g1', name: 'B' }, base[1]], [h])
            assert.ok(spy.reads > 0, '有改名時須讀取引用端')
            assert.strictEqual(p1.nHolders, 1)
            spy.reads = 0
            gp(base, [base[1]], [h])
            assert.ok(spy.reads > 0, '有刪除時須讀取引用端')
        })

        it('RC-312 opt.cascadeRename:false(D3): 不做改名級聯(引用成為懸空)與改名相關拒絕; 刪除連帶清理仍執行; 預設／true 為級聯', function() {
            let rowsOld = [G('g1', 'A', ''), G('g2', 'B', ''), G('g3', 'C', '')]
            let rowsNew = [G('g1', 'A2', ''), G('g3', 'C', '')] //g1 改名、g2 刪除
            let holders = [U('u1', objStr([['A', OR], ['B', AND]])), U('u2', objStr([['A', OR]])), U('u3', objStr([['B', OR]]))]
            let off = gp(rowsOld, rowsNew, holders, { cascadeRename: false })
            assert.deepStrictEqual([off.err, off.renames, off.delNames], [null, [], ['B']])
            assert.deepStrictEqual(ids(off.changes), ['u1', 'u3'], 'u2 只含被改名者, 不連動')
            assert.deepStrictEqual(pairsOf(off.changes[0].after), [['A', OR]], 'A 不改名(成為懸空), B 清理')
            assert.deepStrictEqual([off.nRenameHolders, off.nDelHolders], [0, 2])
            for (let opt of [undefined, {}, { cascadeRename: true }]) {
                let on = gp(rowsOld, rowsNew, holders, opt)
                assert.deepStrictEqual(ids(on.changes), ['u1', 'u2', 'u3'], JSON.stringify(opt))
                assert.deepStrictEqual(pairsOf(on.changes[0].after), [['A2', OR]])
            }
            //改名相關拒絕皆不做
            //DupGroup 情境
            let dup = gp([G('g1', 'A', ''), G('g2', 'A', '')], [G('g1', 'B', ''), G('g2', 'A', '')], [U('u1', objStr([['A', OR]]))], { cascadeRename: false })
            assert.deepStrictEqual([dup.err, dup.changes], [null, []])
            //NameInUse 情境
            let inuse = gp([G('g1', 'A', '')], [G('g1', 'B', '')], [U('u1', objStr([['A', OR]])), U('u2', objStr([['B', OR]]))], { cascadeRename: false })
            assert.deepStrictEqual([inuse.err, inuse.changes], [null, []])
            //Conflict 情境
            let conf = gp([G('g1', 'A', '')], [G('g1', 'B', '')], [U('u1', objStr([['A', OR], ['B', OFF]]))], { cascadeRename: false })
            assert.deepStrictEqual([conf.err, conf.changes], [null, []])
            //targets 不受影響
            let t = gp([{ id: 'T1' }], [], [{ id: 'p1', crules: objStr([['T1', 'y']]) }], { cascadeRename: false }, 'targets')
            assert.deepStrictEqual([t.err, t.delNames, t.nHolders], [null, ['T1'], 1])
        })

        // ---- 拒絕 ----

        it('RC-320 DupGroup(M、P3): 被改名者屬歷史同名組(庫內同名多列)且該名稱仍被引用 → renameCascadeDupGroup; 無人引用則放行; 停用項／陣列形式之引用亦算被引用; 壞字串不算', function() {
            let rowsOld = [G('g1', 'A', ''), G('g2', 'A', ''), G('g3', 'K', '')]
            let rowsNew = [G('g1', 'B', ''), G('g2', 'A', ''), G('g3', 'K', '')]
            for (let [lbl, cg] of [['啟用物件', objStr([['A', OR]])], ['停用物件', objStr([['A', OFF]])], ['陣列', arrStr([['A', AND]])], ['缺 isActive', objStr([['A', { mode: 'OR' }]])]]) {
                let p = gp(rowsOld, rowsNew, [U('u1', objStr([['K', OR]])), U('u2', cg)])
                assert.strictEqual(p.err, 'renameCascadeDupGroup', lbl)
                assert.deepStrictEqual(p.changes, [], lbl)
            }
            //無人引用 A: 放行(歷史同名之清理路徑), 無須改寫任何引用
            let ok = gp(rowsOld, rowsNew, [U('u1', objStr([['K', OR]])), U('u2', '{bad'), U('u3', ''), U('u4', objStr([['Z', OR]]))])
            assert.deepStrictEqual([ok.err, ok.changes], [null, []])
            //對照: 非歷史同名之改名且被引用 → 正常級聯(不誤擋)
            let single = gp([G('g1', 'A', ''), G('g3', 'K', '')], [G('g1', 'B', ''), G('g3', 'K', '')], [U('u2', objStr([['A', OR]]))])
            assert.deepStrictEqual([single.err, single.nHolders], [null, 1])
            //同名多列但被改名者之舊名非該組(改的是 K): 不擋
            let other = gp(rowsOld, [G('g1', 'A', ''), G('g2', 'A', ''), G('g3', 'K2', '')], [U('u1', objStr([['A', OR], ['K', OR]]))])
            assert.deepStrictEqual([other.err, other.nHolders], [null, 1])
            //pemis 表同理
            let pm = gp([G('p1', 'P', ''), G('p2', 'P', '')], [G('p1', 'Q', ''), G('p2', 'P', '')], [{ id: 'g1', cpemis: objStr([['P', OR]]) }], undefined, 'pemis')
            assert.strictEqual(pm.err, 'renameCascadeDupGroup')
        })

        it('RC-321 NameInUse(M、P3): 新名為「仍被啟用中引用而無任何實體」之懸空名 → renameCascadeNameInUse; 停用／缺 isActive 之懸空引用不拒; 新名有實體者不是懸空名', function() {
            let rowsOld = [G('g1', 'A', '')]
            let rowsNew = [G('g1', 'B', '')]
            for (let [lbl, ent] of [['啟用 OR', OR], ['啟用 AND', AND], ['啟用缺 mode', { isActive: 'y' }]]) {
                let p = gp(rowsOld, rowsNew, [U('u1', objStr([['A', OR]])), U('u2', arrStr([['B', ent]]))])
                assert.strictEqual(p.err, 'renameCascadeNameInUse', lbl)
                assert.deepStrictEqual(p.changes, [], lbl)
            }
            //停用或缺 isActive 之懸空引用(在他列): 不拒, 照常級聯
            for (let [lbl, ent] of [['停用', OFF], ['缺 isActive', { mode: 'OR' }], ['isActive 為 yes', { mode: 'OR', isActive: 'yes' }]]) {
                let p = gp(rowsOld, rowsNew, [U('u1', objStr([['A', OR]])), U('u2', objStr([['B', ent]]))])
                assert.strictEqual(p.err, null, lbl)
                assert.deepStrictEqual(ids(p.changes), ['u1'], lbl)
                assert.deepStrictEqual(pairsOf(p.changes[0].after), [['B', OR]])
            }
            //新名在庫內有實體(被一併改走: 互換／鏈式): 不是懸空名
            let swap = gp([G('g1', 'A', ''), G('g2', 'B', '')], [G('g1', 'B', ''), G('g2', 'A', '')], [U('u1', objStr([['A', OR], ['B', AND]])), U('u2', objStr([['B', OR]]))])
            assert.strictEqual(swap.err, null)
            //新名為同批被刪之舊實體: 不是懸空名
            let del = gp([G('g1', 'A', ''), G('g2', 'B', '')], [G('g1', 'B', '')], [U('u1', objStr([['B', AND]])), U('u2', objStr([['A', OR]]))])
            assert.strictEqual(del.err, null)
            assert.deepStrictEqual(pairsOf(del.changes.find((c) => c.id === 'u2').after), [['B', OR]])
            assert.deepStrictEqual(pairsOf(del.changes.find((c) => c.id === 'u1').after), [], 'B(原 g2)被刪 → 其引用被清')
            //pemis 表同理
            let pm = gp([G('p1', 'P', '')], [G('p1', 'Q', '')], [{ id: 'g1', cpemis: objStr([['P', OR]]) }, { id: 'g2', cpemis: objStr([['Q', AND]]) }], undefined, 'pemis')
            assert.strictEqual(pm.err, 'renameCascadeNameInUse')
        })

        it('RC-322 Conflict(M、D1): 某引用端列容器內新名與另一既有項目相撞 → renameCascadeConflict, changes 為空(含先前命中之列不寫); 互換／鏈式／刪除不算', function() {
            let rowsOld = [G('g1', 'A', ''), G('g2', 'K', '')]
            let rowsNew = [G('g1', 'B', ''), G('g2', 'K', '')]
            //懸空 B 之停用項與 A 同在一個容器(B 無實體 → 不是 NameInUse, 屬容器內相撞)
            let p = gp(rowsOld, rowsNew, [U('u1', objStr([['A', OR]])), U('u2', objStr([['A', OR], ['B', OFF]]))])
            assert.strictEqual(p.err, 'renameCascadeConflict')
            assert.deepStrictEqual(p.changes, [], '先前命中之 u1 亦不寫入')
            //同容器同含新名之有實體項目(另一列未改名, 屬上游同名檢查之範圍, 此處只驗容器相撞偵測)
            let p2 = gp([G('g1', 'A', ''), G('g2', 'B', '')], [G('g1', 'B', ''), G('g2', 'B', '')], [U('u1', arrStr([['A', OR], ['B', AND]]))])
            assert.deepStrictEqual([p2.err, p2.changes], ['renameCascadeConflict', []])
            //不算 conflict: 互換、鏈式、新名被刪
            let swap = gp([G('g1', 'A', ''), G('g2', 'B', '')], [G('g1', 'B', ''), G('g2', 'A', '')], [U('u1', objStr([['A', OR], ['B', AND]]))])
            assert.deepStrictEqual([swap.err, swap.nHolders], [null, 1])
            let chain = gp([G('g1', 'A', ''), G('g2', 'B', '')], [G('g1', 'B', ''), G('g2', 'C', '')], [U('u1', objStr([['A', OR], ['B', AND]]))])
            assert.deepStrictEqual([chain.err, pairsOf(chain.changes[0].after)], [null, [['B', OR], ['C', AND]]])
            let gone = gp([G('g1', 'A', ''), G('g2', 'B', '')], [G('g1', 'B', '')], [U('u1', objStr([['A', OR], ['B', AND]]))])
            assert.deepStrictEqual([gone.err, pairsOf(gone.changes[0].after)], [null, [['B', OR]]])
        })

        it('RC-323a 被拒時整次零變更(M、D4): DupGroup／NameInUse／Conflict 皆 changes 為空, 即使同批另有刪除亦不產生清理', function() {
            let holders = [U('u1', objStr([['A', OR], ['D', AND]])), U('u2', objStr([['B', OR]]))]
            //g1 A→B(B 為被引用之懸空名 → NameInUse), g2 D 被刪
            let p = gp([G('g1', 'A', ''), G('g2', 'D', '')], [G('g1', 'B', '')], holders)
            assert.strictEqual(p.err, 'renameCascadeNameInUse')
            assert.deepStrictEqual(p.changes, [])
            assert.deepStrictEqual(p.delNames, ['D'], '規劃結果仍如實報告 delNames')
            //DupGroup + 刪除
            let p2 = gp([G('g1', 'A', ''), G('g2', 'A', ''), G('g3', 'D', '')], [G('g1', 'B', ''), G('g2', 'A', '')], holders)
            assert.deepStrictEqual([p2.err, p2.changes], ['renameCascadeDupGroup', []])
        })

        it('RC-323b 被拒之計畫計數歸零(M、D3、D6; 原缺陷 D-2 已修): Conflict 拒絕時 changes 為空, nHolders／nRenameHolders／nDelHolders／nExternal 亦須為 0(JSDoc: nRenameHolders 等為 nHolders 之子集計數)', function() {
            //u1(外部列)先命中改名, u2 後發生容器相撞 → err 並清空 changes; 計數不得殘留 u1 之累計
            let p = gp([G('g1', 'A', '')], [G('g1', 'B', '')], [U('u1', objStr([['A', OR]]), { from: 'ext' }), U('u2', objStr([['A', OR], ['B', OFF]]))])
            assert.strictEqual(p.err, 'renameCascadeConflict')
            assert.deepStrictEqual(p.changes, [])
            assert.deepStrictEqual([p.nHolders, p.nRenameHolders, p.nDelHolders, p.nExternal], [0, 0, 0, 0], `計數殘留: ${JSON.stringify([p.nHolders, p.nRenameHolders, p.nDelHolders, p.nExternal])}`)
        })

        it('RC-323c 被拒之計畫計數歸零(DupGroup／NameInUse): 於改寫前即拒絕, 計數皆 0', function() {
            let dup = gp([G('g1', 'A', ''), G('g2', 'A', '')], [G('g1', 'B', ''), G('g2', 'A', '')], [U('u1', objStr([['A', OR]]), { from: 'ext' })])
            let inuse = gp([G('g1', 'A', '')], [G('g1', 'B', '')], [U('u1', objStr([['A', OR]]), { from: 'ext' }), U('u2', objStr([['B', OR]]))])
            ;[dup, inuse].forEach((p) => {
                assert.ok(p.err)
                assert.deepStrictEqual([p.changes, p.nHolders, p.nRenameHolders, p.nDelHolders, p.nExternal], [[], 0, 0, 0, 0])
            })
        })

        it('RC-324 前端預覽與伺服端同一規劃(D3): 計畫為純函數, 輸入(rowsOld／rowsNew／holdersOld)不被改動, 重複呼叫結果相同', function() {
            let rowsOld = [G('g1', 'A', ''), G('g2', 'K', '')]
            let rowsNew = [G('g1', 'B', ''), G('g3', 'N', '')]
            let holders = [U('u1', objStr([['A', OR], ['K', AND]]), { from: 'ext' }), U('u2', arrStr([['K', OR]]))]
            let snap = js([rowsOld, rowsNew, holders])
            let p1 = gp(rowsOld, rowsNew, holders)
            let p2 = gp(rowsOld, rowsNew, holders)
            assert.strictEqual(js([rowsOld, rowsNew, holders]), snap)
            assert.deepStrictEqual(p1, p2)
        })

        it('RC-325 拒絕鍵皆有語系文字(D3、D8; 專案規則: 系統回應文字須有 key 與 eng＋cht): renameCascadeDupGroup／NameInUse／Conflict／Unsupported 於 eng 與 cht 皆為非空字串', function() {
            let LANG = procLang({})
            for (let key of ['renameCascadeDupGroup', 'renameCascadeNameInUse', 'renameCascadeConflict', 'renameCascadeUnsupported']) {
                for (let lang of ['eng', 'cht']) {
                    assert.ok(typeof LANG[lang][key] === 'string' && LANG[lang][key].trim() !== '', `${lang}.${key} 缺語系文字`)
                }
                assert.notStrictEqual(LANG.eng[key], LANG.cht[key], `${key}: eng 與 cht 不應為同一文字`)
            }
        })

        it('RC-326 unsafe 之規劃(D8): err:renameCascadeUnsupported, changes 為空且四個計數歸零(同 conflict; 含先前命中之外部列不殘留計數); 未命中之含非有限數值引用端不擋; 改名與刪除、三表皆適用', function() {
            let zero = (p) => assert.deepStrictEqual([p.changes, p.nHolders, p.nRenameHolders, p.nDelHolders, p.nExternal], [[], 0, 0, 0, 0])
            let nf = '{A:{mode:\'OR\',isActive:\'y\'},K:{isActive:Infinity}}'
            let ok = objStr([['A', OR]])
            //改名: 先命中之外部列 u1 → 後遇 unsafe 之 u2
            let p1 = gp([G('g1', 'A', '')], [G('g1', 'B', '')], [U('u1', ok, { from: 'ext' }), U('u2', nf)])
            assert.strictEqual(p1.err, 'renameCascadeUnsupported')
            zero(p1)
            //順序相反: unsafe 之列在前
            let p2 = gp([G('g1', 'A', '')], [G('g1', 'B', '')], [U('u2', nf), U('u1', ok, { from: 'ext' })])
            assert.strictEqual(p2.err, 'renameCascadeUnsupported')
            zero(p2)
            //刪除
            let p3 = gp([G('g1', 'A', '')], [], [U('u1', ok), U('u2', nf)])
            assert.strictEqual(p3.err, 'renameCascadeUnsupported')
            zero(p3)
            //pemis 表與 targets 表(陣列名為 Infinity)
            let p4 = gp([G('p1', 'P', '')], [G('p1', 'Q', '')], [{ id: 'g1', cpemis: '{P:{isActive:\'y\'},Z:{mode:NaN}}' }], undefined, 'pemis')
            assert.strictEqual(p4.err, 'renameCascadeUnsupported')
            zero(p4)
            let p5 = gp([{ id: 'gone' }, { id: 'T2' }], [{ id: 'T2' }], [{ id: 'p1', crules: '[{name:\'gone\',isActive:\'y\'},{name:-Infinity,isActive:\'y\'}]' }], undefined, 'targets')
            assert.strictEqual(p5.err, 'renameCascadeUnsupported')
            zero(p5)
            //未命中者不擋: u3 含 Infinity 但不含被改名／刪除者 → 不在 changes、字串逐字不動; 其他命中列照常改寫
            let p6 = gp([G('g1', 'A', '')], [G('g1', 'B', '')], [U('u1', ok), U('u3', '{K:{isActive:Infinity}}')])
            assert.deepStrictEqual([p6.err, ids(p6.changes), p6.nHolders], [null, ['u1'], 1])
            assert.deepStrictEqual(pairsOf(p6.changes[0].after), [['B', OR]])
            //cascadeRename:false 且只有改名: 無須改寫 → 不檢查 unsafe
            let p7 = gp([G('g1', 'A', '')], [G('g1', 'B', '')], [U('u2', nf)], { cascadeRename: false })
            assert.deepStrictEqual([p7.err, p7.changes], [null, []])
            //無改名無刪除: 不碰引用端
            let p8 = gp([G('g1', 'A', '')], [G('g1', 'A', '')], [U('u2', nf)])
            assert.deepStrictEqual([p8.err, p8.changes], [null, []])
        })

        it('RC-327 同批兩個改名映射到同一新名被拒(M、P3、D10 外審 R6): 兩舊名→同新名 → renameCascadeConflict、changes 為空、四計數歸零; 物件與陣列形式、grups 與 pemis、引用端含／不含引用者皆同樣拒(在解碼引用端之前判定)', function() {
            let zero = (p) => assert.deepStrictEqual([p.changes, p.nHolders, p.nRenameHolders, p.nDelHolders, p.nExternal], [[], 0, 0, 0, 0])
            let rowsOld = [G('g1', 'A', ''), G('g2', 'B', ''), G('g3', 'K', '')]
            let rowsNew = [G('g1', 'C', ''), G('g2', 'C', ''), G('g3', 'K', '')]
            let holderSets = (tbl) => ({
                '物件形式含引用者': [H(tbl, 'u1', objStr([['A', OR], ['B', OR]]), { from: 'ext' }), H(tbl, 'u2', objStr([['A', AND]]))],
                '陣列形式含引用者': [H(tbl, 'u1', arrStr([['A', OR], ['B', OR]]))],
                '僅引用其一': [H(tbl, 'u1', objStr([['B', OR]]))],
                '不含引用者': [H(tbl, 'u1', objStr([['K', OR]]))],
                '無引用端列': [],
                '引用端字串壞或空': [H(tbl, 'u1', '{bad'), H(tbl, 'u2', '')],
            })
            for (let tbl of ['grups', 'pemis']) {
                Object.entries(holderSets(tbl)).forEach(([lbl, holders]) => {
                    let p = gp(rowsOld, rowsNew, holders, undefined, tbl)
                    assert.strictEqual(p.err, 'renameCascadeConflict', `${tbl}/${lbl}`)
                    zero(p)
                    assert.deepStrictEqual(p.renames.map((x) => `${x.from}>${x.to}`).sort(), ['A>C', 'B>C'], `${tbl}/${lbl}: renames 如實報告`)
                })
            }
            //重複之舊名不相鄰: A→C、B→D、K→C
            let far = gp(rowsOld, [G('g1', 'C', ''), G('g2', 'D', ''), G('g3', 'C', '')], [U('u1', objStr([['A', OR]]))])
            assert.strictEqual(far.err, 'renameCascadeConflict', '重複之新名不相鄰亦拒')
            zero(far)
            //在解碼引用端之前判定: 引用端欄位不被讀取
            let spy = { reads: 0 }
            let h = {
                get id() {
                    spy.reads++
                    return 'u1'
                },
                get cgrups() {
                    spy.reads++
                    return objStr([['A', OR]])
                },
            }
            let ps = gp(rowsOld, rowsNew, [h])
            assert.strictEqual(ps.err, 'renameCascadeConflict')
            assert.strictEqual(spy.reads, 0, '以計畫之 renames 判定, 不讀取引用端')
            //優先於需解碼引用端才能判定之拒絕(DupGroup／NameInUse)
            let both = gp([G('g1', 'A', ''), G('g2', 'B', ''), G('g3', 'B', '')], [G('g1', 'C', ''), G('g2', 'C', ''), G('g3', 'B', '')], [U('u1', objStr([['B', OR]]))])
            assert.strictEqual(both.err, 'renameCascadeConflict')
        })

        it('RC-328 互換／鏈式／三列循環置換之新名皆互異, 不誤拒(M、D10): 正常級聯, 引用跟著實體', function() {
            let cases = {
                '互換 A↔B': [[G('g1', 'A', ''), G('g2', 'B', '')], [G('g1', 'B', ''), G('g2', 'A', '')], [['A', OR], ['B', AND]], [['B', OR], ['A', AND]]],
                '鏈式 A→B,B→C': [[G('g1', 'A', ''), G('g2', 'B', '')], [G('g1', 'B', ''), G('g2', 'C', '')], [['A', OR], ['B', AND]], [['B', OR], ['C', AND]]],
                '三列循環 A→B,B→C,C→A': [[G('g1', 'A', ''), G('g2', 'B', ''), G('g3', 'C', '')], [G('g1', 'B', ''), G('g2', 'C', ''), G('g3', 'A', '')], [['A', OR], ['B', AND], ['C', OFF]], [['B', OR], ['C', AND], ['A', OFF]]],
                '四列循環': [[G('g1', 'A', ''), G('g2', 'B', ''), G('g3', 'C', ''), G('g4', 'D', '')], [G('g1', 'B', ''), G('g2', 'C', ''), G('g3', 'D', ''), G('g4', 'A', '')], [['A', OR], ['B', AND], ['C', OFF], ['D', OR]], [['B', OR], ['C', AND], ['D', OFF], ['A', OR]]],
            }
            for (let tbl of ['grups', 'pemis']) {
                Object.entries(cases).forEach(([lbl, [rowsOld, rowsNew, before, after]]) => {
                    for (let mk of [objStr, arrStr]) {
                        let p = gp(rowsOld, rowsNew, [H(tbl, 'u1', mk(before))], undefined, tbl)
                        assert.strictEqual(p.err, null, `${tbl}/${lbl}`)
                        assert.deepStrictEqual(pairsOf(p.changes[0].after), pairsOf(mk(after)), `${tbl}/${lbl}`)
                        //引用端不含引用者亦不誤拒
                        let q = gp(rowsOld, rowsNew, [H(tbl, 'u1', objStr([['Z', OR]]))], undefined, tbl)
                        assert.deepStrictEqual([q.err, q.changes], [null, []], `${tbl}/${lbl} 不含引用者`)
                    }
                })
            }
        })

        it('RC-329 cascadeRename:false 時不做此拒絕(renames 為空, M、D10): 兩列改為同名亦不拒; 同批刪除仍清理', function() {
            let rowsOld = [G('g1', 'A', ''), G('g2', 'B', ''), G('g3', 'D', '')]
            let rowsNew = [G('g1', 'C', ''), G('g2', 'C', '')] //g3 刪除
            let holders = [U('u1', objStr([['A', OR], ['B', OR], ['D', AND]]))]
            let p = gp(rowsOld, rowsNew, holders, { cascadeRename: false })
            assert.deepStrictEqual([p.err, p.renames, p.delNames], [null, [], ['D']])
            assert.deepStrictEqual(pairsOf(p.changes[0].after), [['A', OR], ['B', OR]], '不級聯(A、B 不改名), 刪除 D 照清')
            //預設級聯時同一輸入被拒
            assert.strictEqual(gp(rowsOld, rowsNew, holders).err, 'renameCascadeConflict')
        })

        it('RC-329b 反例(M、D10; 真 getUserRules): 若不拒, 引用端 cgrups={A:OR,B:OR} 照寫會併為 {C} 單項而使授權塌縮', function() {
            let W = {
                users: [U('u1', objStr([['A', OR], ['B', OR]]))],
                grups: [G('g1', 'A', objStr([['P1', OR]])), G('g2', 'B', objStr([['P2', OR]]))],
                pemis: [{ id: 'p1', name: 'P1', crules: objStr([['T1', 'y']]) }, { id: 'p2', name: 'P2', crules: objStr([['T2', 'y']]) }],
                targets: [{ id: 'T1' }, { id: 'T2' }, { id: 'T3' }],
            }
            assert.deepStrictEqual(authOf(W), ['T1=y T2=y T3=n'], '前提: A 授 T1、B 授 T2, OR 聯集')
            let gNew = [{ ...W.grups[0], name: 'C' }, { ...W.grups[1], name: 'C' }]
            //舊式參考模型(照舊做法): 依改名對映換鍵後重編碼, 兩鍵併為一鍵
            let ren = new Map([['A', 'C'], ['B', 'C']])
            let kp = JSON5.parse(W.users[0].cgrups)
            let o = {}
            Object.keys(kp).forEach((k) => {
                o[ren.has(k) ? ren.get(k) : k] = kp[k]
            })
            let naive = JSON.stringify(o)
            assert.deepStrictEqual(Object.keys(JSON.parse(naive)), ['C'], '照寫得單項 {C}')
            assert.deepStrictEqual(authOf({ ...W, grups: gNew, users: [{ ...W.users[0], cgrups: naive }] }), ['T1=n T2=n T3=n'], '單項 C 對到兩列同名群組 → 取各筆之交集, 授權塌縮(原 T1、T2 皆被收回)')
            //實際: 計畫被拒, 無任何寫入
            let plan = planRefChanges({ keyTable: 'grups', rowsOld: W.grups, rowsNew: gNew, holdersOld: W.users })
            assert.strictEqual(plan.err, 'renameCascadeConflict')
            assert.deepStrictEqual([plan.changes, plan.nHolders, plan.nRenameHolders], [[], 0, 0])
            assert.deepStrictEqual(authOf({ ...W, users: applyChanges(W.users, plan.changes) }), ['T1=y T2=y T3=n'], '被拒不套用, 授權不變')
        })

        it('RC-330 端到端(D4、M): 兩層級聯(權限 P1→PX 改名)與群組互換 G1↔G2, 真 getUserRules 授權逐位不變', function() {
            let W = {
                users: [U('u1', objStr([['G1', OR], ['G2', AND]])), U('u2', arrStr([['G2', OR]]))],
                grups: [G('g1', 'G1', objStr([['P1', OR], ['P2', OR]])), G('g2', 'G2', arrStr([['P1', AND], ['P3', OFF]]))],
                pemis: [{ id: 'p1', name: 'P1', crules: objStr([['T1', 'y'], ['T2', 'y']]) }, { id: 'p2', name: 'P2', crules: objStr([['T2', 'y'], ['T3', 'y']]) }, { id: 'p3', name: 'P3', crules: objStr([['T1', 'y']]) }],
                targets: [{ id: 'T1' }, { id: 'T2' }, { id: 'T3' }],
            }
            let before = authOf(W)
            //權限 P1→PX
            let pm = planRefChanges({ keyTable: 'pemis', rowsOld: W.pemis, rowsNew: W.pemis.map((r) => (r.id === 'p1' ? { ...r, name: 'PX' } : r)), holdersOld: W.grups })
            assert.deepStrictEqual([pm.err, pm.nHolders], [null, 2])
            let W2 = { ...W, pemis: W.pemis.map((r) => (r.id === 'p1' ? { ...r, name: 'PX' } : r)), grups: applyChanges(W.grups, pm.changes) }
            assert.deepStrictEqual(authOf(W2), before)
            //群組互換 G1↔G2
            let gnew = W2.grups.map((r) => ({ ...r, name: r.name === 'G1' ? 'G2' : 'G1' }))
            let pg = planRefChanges({ keyTable: 'grups', rowsOld: W2.grups, rowsNew: gnew, holdersOld: W2.users })
            assert.deepStrictEqual([pg.err, pg.nHolders, pg.nRenameHolders], [null, 2, 2])
            let W3 = { ...W2, grups: gnew, users: applyChanges(W2.users, pg.changes) }
            assert.deepStrictEqual(authOf(W3), before, '互換後授權不變')
            assert.deepStrictEqual(pairsOf(W3.users[0].cgrups), [['G2', OR], ['G1', AND]], 'u1 之引用跟著實體互換')
        })
    })


    // ---------------------------------------------------------------
    // RC-4xx 語意不變式(固定種子隨機宇宙; 真 getUserRules 為真理)
    // 輸入空間: 宇宙(使用者 3 × 群組 3～5(含歷史同名 12%) × 權限 3～5(含歷史同名 12%) × 標的 4; 授權字串之形式 物件／陣列(35%) × 書寫 JSON／JSON5／註解 × mode OR／AND／缺／非法
    //           × isActive y／n／缺 × 簡寫值／額外欄位／無名稱元素 × 懸空引用 × 原型鍵名 25%)
    //           × 批次類型(rename: 同批 1～3 個改名含互換／鏈式／循環／新名撞懸空 ghost; delete: 刪 1～3 列含刪後同名新增(新 id); mixed: 改名＋刪除) × 表(grups／pemis／targets 依類型)
    //           × cascadeRename(預設 88%／false 12%) × 引用端列(含垃圾列 20%) × rowsNew 順序(打亂 50%)
    // ---------------------------------------------------------------
    describe('語意不變式(隨機宇宙)', function() {
        let N_SEEDS = 3200

        let mkRng = (seed) => {
            let a = seed >>> 0
            let f = () => {
                a = (a + 0x6D2B79F5) >>> 0
                let t = a
                t = Math.imul(t ^ (t >>> 15), t | 1)
                t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
                return ((t ^ (t >>> 14)) >>> 0) / 4294967296
            }
            return {
                f,
                int: (n) => Math.floor(f() * n),
                chance: (p) => f() < p,
                pick: (arr) => arr[Math.floor(f() * arr.length)],
                shuffle: (arr) => {
                    let b = arr.slice()
                    for (let i = b.length - 1; i > 0; i--) {
                        let j = Math.floor(f() * (i + 1))
                        ;[b[i], b[j]] = [b[j], b[i]]
                    }
                    return b
                },
            }
        }

        let TGT = ['T1', 'T2', 'T3', 'T4']
        let SPECIAL = [PROTO, 'constructor', 'length', 'toString']
        let FROMS = ['', undefined, 'ext1', null, 5, 'ext2']
        //獨立之表對映(與 REF_OF 由 RC-301 對照, 此處不 import 內部)
        let REFS = {
            grups: { holder: 'users', field: 'cgrups', kind: 'ref' },
            pemis: { holder: 'grups', field: 'cpemis', kind: 'ref' },
            targets: { holder: 'pemis', field: 'crules', kind: 'rule' },
        }

        //---- 授權字串之產生 ----
        let genEntry = (R, dangling) => {
            let e = {}
            let m = R.f()
            if (m < 0.4) {
                e.mode = 'OR'
            }
            else if (m < 0.8) {
                e.mode = 'AND'
            }
            else if (m >= 0.9) {
                e.mode = R.pick(['or', 'XOR', 1, null])
            }
            let a = R.f()
            if (dangling) {
                if (a < 0.5) {
                    e.isActive = 'y'
                }
                else if (a < 0.9) {
                    e.isActive = 'n'
                }
            }
            else if (a < 0.8) {
                e.isActive = 'y'
            }
            else if (a < 0.95) {
                e.isActive = 'n'
            }
            if (R.chance(0.1)) {
                e.memo = 'x'
            }
            return e
        }
        let genRule = (R) => ({ isActive: R.chance(0.55) ? 'y' : 'n' })
        let ser = (R, v) => {
            let st = R.int(4)
            if (st <= 1) {
                return JSON.stringify(v)
            }
            if (st === 2) {
                return JSON5.stringify(v)
            }
            return '/*c*/ ' + JSON.stringify(v, null, 1) + ' // tail'
        }
        //mkStr: pairs [[名稱, 值]] → 授權字串(物件或陣列形式; 陣列形式可含同名重複項與無名稱元素)
        let mkStr = (R, pairs, isRule) => {
            let form = R.chance(0.35) ? 'arr' : 'obj'
            let v
            if (form === 'obj') {
                v = Object.create(null)
                pairs.forEach(([k, e]) => {
                    let short = Object.keys(e).length === 1 && e.isActive !== undefined && (isRule ? R.chance(0.5) : R.chance(0.08))
                    v[k] = short ? e.isActive : e
                })
            }
            else {
                v = pairs.map(([k, e]) => ({ name: k, ...e }))
                if (R.chance(0.15) && pairs.length > 0) {
                    v.splice(R.int(v.length + 1), 0, { name: R.pick(pairs)[0], ...(isRule ? genRule(R) : genEntry(R, false)) })
                }
                if (R.chance(0.12)) {
                    v.splice(R.int(v.length + 1), 0, R.pick(['y', 5, null, {}, { mode: 'OR', isActive: 'y' }]))
                }
            }
            //非有限數值夾具(D8; 4%): JSON5 之 Infinity／-Infinity／NaN 置於值、陣列元素之名稱(含陣列名)或元素本身; 此類字串以 JSON5 書寫(JSON.stringify 會把它編成 null)
            if (R.chance(0.04)) {
                let x = R.pick([Infinity, -Infinity, NaN])
                if (form === 'obj') {
                    let ks = Object.keys(v)
                    if (ks.length > 0) {
                        let k = R.pick(ks)
                        v[k] = (v[k] !== null && typeof v[k] === 'object') ? { ...v[k], memo: x } : { isActive: v[k], memo: x }
                    }
                }
                else {
                    v.splice(R.int(v.length + 1), 0, R.pick([x, { memo: x }, { name: x, isActive: 'y' }, { name: [x], isActive: 'y' }]))
                }
                return JSON5.stringify(v)
            }
            return ser(R, v)
        }
        let genRefStr = (R, existing, dangling) => {
            if (R.chance(0.04)) {
                return ''
            }
            let pool = R.shuffle(existing)
            let n = Math.min(pool.length, 1 + R.int(4))
            let pairs = pool.slice(0, n).map((k) => [k, genEntry(R, false)])
            if (R.chance(0.35)) {
                pairs.splice(R.int(pairs.length + 1), 0, [R.pick(dangling), genEntry(R, true)])
            }
            return mkStr(R, pairs, false)
        }
        let genRulesStr = (R) => {
            let pool = R.shuffle(TGT)
            let n = R.int(TGT.length + 1)
            let pairs = pool.slice(0, n).map((k) => [k, genRule(R)])
            if (R.chance(0.15)) {
                pairs.push(['T9', genRule(R)])
            }
            return mkStr(R, pairs, true)
        }
        let pickNames = (R, pool) => {
            let names = R.shuffle(pool).slice(0, 3 + R.int(3))
            if (R.chance(0.25)) {
                names[R.int(names.length)] = R.pick(SPECIAL)
            }
            return names
        }
        let uniq = (a) => [...new Set(a)]

        let genUniverse = (R) => {
            let W = { targets: TGT.map((id) => ({ id })), pemis: [], grups: [], users: [] }
            let pNames = pickNames(R, ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'])
            pNames.forEach((name, i) => {
                W.pemis.push({ id: `p${i}`, name, crules: genRulesStr(R), memo: 'm' })
                if (R.chance(0.12)) {
                    W.pemis.push({ id: `p${i}b`, name, crules: genRulesStr(R) })
                }
            })
            let gNames = pickNames(R, ['G1', 'G2', 'G3', 'G4', 'G5', 'G6'])
            gNames.forEach((name, i) => {
                W.grups.push({ id: `g${i}`, name, cpemis: genRefStr(R, pNames, ['P8', 'P9']), memo: 'm' })
                if (R.chance(0.12)) {
                    W.grups.push({ id: `g${i}b`, name, cpemis: genRefStr(R, pNames, ['P8', 'P9']) })
                }
            })
            for (let i = 0; i < 3; i++) {
                W.users.push({ id: `u${i}`, name: `user${i}`, cgrups: genRefStr(R, gNames, ['G8', 'G9']), from: R.pick(FROMS) })
            }
            return W
        }

        //---- 獨立之解析／參考實作(只用 JSON5.parse 與簡單走訪, 不引用 refCascade 之內部) ----
        let tryParse = (s) => {
            if (typeof s !== 'string' || s.trim() === '') {
                return undefined
            }
            try {
                return JSON5.parse(s)
            }
            catch (err) {
                return undefined
            }
        }
        let isNamed = (el) => el !== null && typeof el === 'object' && !Array.isArray(el) && hasOwn(el, 'name') && typeof el.name === 'string'
        //entriesOf: 容器內可被引用之項目 [{ name, active }](物件形式以外層鍵、陣列形式以字串 name; 其餘元素不可被引用)
        let entriesOf = (s) => {
            let kp = tryParse(s)
            if (kp === undefined || kp === null || typeof kp !== 'object') {
                return []
            }
            if (Array.isArray(kp)) {
                return kp.filter(isNamed).map((el) => ({ name: el.name, active: el.isActive }))
            }
            return Object.keys(kp).map((k) => {
                let v = kp[k]
                return { name: k, active: (v !== null && typeof v === 'object') ? v.isActive : v }
            })
        }
        //decRuleArr: 獨立之解碼(語意同 cvKpToArr; D5): kind:'rule' 陣列形式之元素 → [{ key: 屬性鍵轉型後之規則名, rest: 規則名以外之內容 }];
        //  元素為物件(非 null、非陣列、至少一個鍵; 即 wsemi iseobj)且有自有 name 欄者以 name 為名, 否則(無 name 之物件、{}、非物件)以索引為名, 非物件元素之內容視為 { isActive: 元素 }
        let toKey = (name) => {
            try {
                return `${name}`
            }
            catch (err) {
                return null
            }
        }
        let isObjEl = (el) => el !== null && typeof el === 'object' && !Array.isArray(el) && Object.keys(el).length > 0
        let decRuleArr = (kp) => kp.map((el, i) => {
            let obj = isObjEl(el)
            let rest = obj ? { ...el } : { isActive: el }
            if (obj) {
                delete rest.name
            }
            return { key: toKey((obj && hasOwn(el, 'name')) ? el.name : i), rest }
        })
        //refRewrite: 規格參考(P6、D1、D5): 刪除者移除, 改名者換名, 其餘原樣; 回傳 { hit, out, nRen, nDel }.
        //  kind:'rule' 之陣列形式改以「解碼後之規則名→內容」為比對基準(dec): 刪除後索引名元素之位置可因具名化而改變, 但解碼結果(規則名與內容)須與「自解碼結果移除被刪規則」相同
        let refRewrite = (s, ren, del, kind = 'ref') => {
            let kp = tryParse(s)
            if (kp === undefined || kp === null || typeof kp !== 'object') {
                return { hit: false }
            }
            let nRen = 0
            let nDel = 0
            let out = []
            if (kind === 'rule' && Array.isArray(kp)) {
                let dec = []
                decRuleArr(kp).forEach((e) => {
                    if (e.key !== null && del.has(e.key)) {
                        nDel++
                    }
                    else if (e.key !== null && ren.has(e.key)) {
                        nRen++
                        dec.push({ ...e, key: ren.get(e.key) })
                    }
                    else {
                        dec.push(e)
                    }
                })
                return { hit: nRen + nDel > 0, dec, nRen, nDel, isArr: true }
            }
            if (Array.isArray(kp)) {
                kp.forEach((el) => {
                    if (!isNamed(el)) {
                        out.push(el)
                    }
                    else if (del.has(el.name)) {
                        nDel++
                    }
                    else if (ren.has(el.name)) {
                        nRen++
                        out.push({ ...el, name: ren.get(el.name) })
                    }
                    else {
                        out.push(el)
                    }
                })
            }
            else {
                Object.keys(kp).forEach((k) => {
                    if (del.has(k)) {
                        nDel++
                    }
                    else if (ren.has(k)) {
                        nRen++
                        out.push([ren.get(k), kp[k]])
                    }
                    else {
                        out.push([k, kp[k]])
                    }
                })
            }
            return { hit: nRen + nDel > 0, out, nRen, nDel, isArr: Array.isArray(kp) }
        }
        //strOf: 參考結果之字串(供參考世界之授權計算)
        let strOf = (x) => {
            if (x.dec) {
                return JSON.stringify(x.dec.map((e) => ({ ...e.rest, name: e.key }))) //全具名之陣列(解碼後等價)
            }
            if (x.isArr) {
                return JSON.stringify(x.out)
            }
            let o = Object.create(null)
            x.out.forEach(([k, v]) => {
                o[k] = v
            })
            return JSON.stringify(o)
        }
        let nameOfRow = (tbl, r) => (tbl === 'targets' ? r.id : (r.name === undefined ? '' : r.name))
        //oracleOps: 獨立判定之改名(同 id 異名)與須清理名稱(舊列該名稱之所有列之 id 皆不在新表; 刪後同名新增不算存續)
        let oracleOps = (tbl, rowsOld, rowsNew, cascade) => {
            let newIds = new Map()
            rowsNew.forEach((r) => {
                if (typeof r.id === 'string') {
                    newIds.set(r.id, r)
                }
            })
            let renames = []
            if (tbl !== 'targets' && cascade) {
                rowsOld.forEach((ro) => {
                    let rn = newIds.get(ro.id)
                    if (rn !== undefined && nameOfRow(tbl, rn) !== nameOfRow(tbl, ro)) {
                        renames.push({ id: ro.id, from: nameOfRow(tbl, ro), to: nameOfRow(tbl, rn) })
                    }
                })
            }
            //須清理之名稱(D2): 有舊列被刪(id 不在新表), 且該名稱不再有「同 id 同名之存續列」(歷史同名只刪其一則仍有; 刪後同名新增(新 id)不算存續)
            let kept = new Set()
            rowsOld.forEach((ro) => {
                let rn = newIds.get(ro.id)
                if (rn !== undefined && nameOfRow(tbl, rn) === nameOfRow(tbl, ro)) {
                    kept.add(nameOfRow(tbl, ro))
                }
            })
            let cleaned = new Set(rowsOld.filter((r) => !newIds.has(r.id)).map((r) => nameOfRow(tbl, r)).filter((n) => !kept.has(n)))
            let ren = new Map(renames.map((x) => [x.from, x.to]))
            return { renames, ren, cleaned }
        }
        //hasNF: 解析結果內是否有非有限數值(獨立實作)
        let hasNF = (v) => {
            if (typeof v === 'number') {
                return !Number.isFinite(v)
            }
            return (v !== null && typeof v === 'object') ? Object.keys(v).some((k) => hasNF(v[k])) : false
        }
        //oracleErrs: 獨立判定應拒絕之種類集合(M: 歷史同名組改名且仍被引用／新名撞被啟用引用之懸空名／容器內新名相撞; D8: 須改寫(依獨立參考實作判定命中)之容器含非有限數值 → 不支援)
        let oracleErrs = (tbl, rowsOld, ops, holders, field, cascade, kind) => {
            let errs = new Set()
            holders.filter((h) => h !== null && typeof h === 'object' && typeof h.id === 'string').forEach((h) => {
                let kp = tryParse(h[field])
                if (kp !== undefined && kp !== null && typeof kp === 'object' && hasNF(kp) && refRewrite(h[field], cascade ? ops.ren : new Map(), ops.cleaned, kind).hit) {
                    errs.add('renameCascadeUnsupported')
                }
            })
            if (!cascade || ops.renames.length === 0) {
                return errs
            }
            let conts = holders.filter((h) => h !== null && typeof h === 'object' && typeof h.id === 'string').map((h) => entriesOf(h[field]))
            ops.renames.forEach((rn) => {
                let nSame = rowsOld.filter((r) => nameOfRow(tbl, r) === rn.from).length
                if (nSame >= 2 && conts.some((c) => c.some((e) => e.name === rn.from))) {
                    errs.add('renameCascadeDupGroup')
                }
            })
            let ghosts = new Set(ops.renames.map((rn) => rn.to).filter((to) => !rowsOld.some((r) => nameOfRow(tbl, r) === to)))
            conts.forEach((c) => c.forEach((e) => {
                if (ghosts.has(e.name) && e.active === 'y') {
                    errs.add('renameCascadeNameInUse')
                }
            }))
            let isRen = (n) => ops.ren.has(n) && !ops.cleaned.has(n)
            conts.forEach((c) => {
                let names = new Set(c.map((e) => e.name))
                names.forEach((f) => {
                    if (isRen(f)) {
                        let to = ops.ren.get(f)
                        if (names.has(to) && !isRen(to) && !ops.cleaned.has(to)) {
                            errs.add('renameCascadeConflict')
                        }
                    }
                })
            })
            return errs
        }

        //---- 批次之產生 ----
        let GARBAGE = (field) => [null, undefined, 'x', 5, [], {}, { id: 'gx1' }, { id: 'gx2', [field]: 123 }, { id: 'gx3', [field]: '{bad' }, { id: 7, [field]: '{"G1":{"mode":"OR","isActive":"y"}}' }]
        let withGarbage = (R, rows, field) => {
            let out = rows.slice()
            if (R.chance(0.2)) {
                let n = 1 + R.int(3)
                for (let i = 0; i < n; i++) {
                    out.splice(R.int(out.length + 1), 0, R.pick(GARBAGE(field)))
                }
            }
            return out
        }
        let genBatch = (R, type, tbl, W) => {
            let rows = W[tbl]
            let ref = REFS[tbl]
            let wantDel = type === 'delete' || type === 'mixed'
            let wantRen = (type === 'rename' || type === 'mixed') && tbl !== 'targets'
            let noCascade = R.chance(0.12)
            let delIds = new Set()
            if (wantDel) {
                let k = 1 + R.int(Math.min(3, rows.length))
                R.shuffle(rows).slice(0, k).forEach((r) => delIds.add(r.id))
            }
            let remain = rows.filter((r) => !delIds.has(r.id))
            let moved = new Map()
            if (wantRen && remain.length > 0) {
                //ghost: 引用端容器內被引用而庫內無實體之名稱
                let have = new Set(rows.map((r) => nameOfRow(tbl, r)))
                let ghosts = uniq(W[ref.holder].flatMap((h) => entriesOf(h[ref.field]).map((e) => e.name))).filter((n) => !have.has(n))
                let fresh = (tbl === 'grups' ? ['GN1', 'GN2', 'GN3'] : ['PN1', 'PN2', 'PN3']).concat(SPECIAL)
                for (let attempt = 0; attempt < 8 && moved.size === 0; attempt++) {
                    let k = 1 + R.int(Math.min(3, remain.length))
                    let pick = R.shuffle(remain).slice(0, k)
                    let olds = pick.map((r) => nameOfRow(tbl, r))
                    let cand = new Map()
                    if (pick.length >= 2 && R.chance(0.3) && uniq(olds).length === pick.length) {
                        pick.forEach((r, i) => cand.set(r.id, olds[(i + 1) % pick.length])) //循環(k=2 為互換)
                    }
                    else {
                        let used = new Set()
                        pick.forEach((r, i) => {
                            let pool = []
                            let x = R.f()
                            if (x < 0.25 && ghosts.length > 0) {
                                pool = ghosts
                            }
                            else if (x < 0.55) {
                                pool = olds.filter((_, j) => j !== i)
                            }
                            if (pool.length === 0) {
                                pool = fresh
                            }
                            let nm = R.pick(pool)
                            if (nm !== olds[i] && !used.has(nm)) {
                                used.add(nm)
                                cand.set(r.id, nm)
                            }
                        })
                    }
                    //上游之同名檢查(nameDuplicate)之等價條件: 新名不得與未改名之存續列同名
                    let stay = new Set(remain.filter((r) => !cand.has(r.id)).map((r) => nameOfRow(tbl, r)))
                    let nn = [...cand.values()]
                    if (cand.size > 0 && uniq(nn).length === nn.length && nn.every((n) => !stay.has(n))) {
                        moved = cand
                    }
                }
            }
            //rowsNew
            let rowsNew = remain.map((r) => {
                let x = { ...r }
                if (moved.has(r.id)) {
                    x.name = moved.get(r.id)
                }
                if (R.chance(0.3)) {
                    x.memo = 'edited'
                }
                return x
            })
            //新增列: 只取「被刪／被改走而空出之名稱」或全新名稱(不取懸空名: 新增列接管既有懸空引用不在本規劃範圍)
            let taken = new Set(rowsNew.map((r) => nameOfRow(tbl, r)))
            let addRow = (name, idPre) => {
                if (taken.has(name)) {
                    return
                }
                taken.add(name)
                let id = `${idPre}${R.int(1e6)}`
                if (tbl === 'targets') {
                    rowsNew.push({ id: name })
                }
                else if (tbl === 'grups') {
                    rowsNew.push({ id, name, cpemis: genRefStr(R, W.pemis.map((p) => p.name), ['P8']) })
                }
                else {
                    rowsNew.push({ id, name, crules: genRulesStr(R) })
                }
            }
            if (tbl !== 'targets') {
                rows.filter((r) => delIds.has(r.id)).forEach((r) => {
                    if (R.chance(0.4)) {
                        addRow(nameOfRow(tbl, r), 'nd')
                    }
                })
                rows.filter((r) => moved.has(r.id)).forEach((r) => {
                    if (R.chance(0.25)) {
                        addRow(nameOfRow(tbl, r), 'nf')
                    }
                })
                if (R.chance(0.2)) {
                    addRow('ZN1', 'nz')
                }
            }
            else if (R.chance(0.3)) {
                addRow('T7', 'nt')
            }
            if (R.chance(0.5)) {
                rowsNew = R.shuffle(rowsNew)
            }
            return { rowsNew, noCascade }
        }

        //---- 模擬: 一個種子 ----
        let simulate = (seed, type, st, viol) => {
            let R = mkRng(seed * 1009 + (type === 'rename' ? 1 : type === 'delete' ? 2 : 3) * 104729 + 17)
            let v = (cat, msg) => {
                if (!viol[cat]) {
                    viol[cat] = []
                }
                if (viol[cat].length < 6) {
                    viol[cat].push(`seed=${seed}/${type}: ${msg}`)
                }
                st['viol_' + cat] = (st['viol_' + cat] || 0) + 1
            }
            let inc = (k, n = 1) => {
                st[k] = (st[k] || 0) + n
            }
            let W = genUniverse(R)
            let refW = clone(W) //參考世界: 以獨立參考實作改寫之字串
            let authBefore = authOf(W)
            let authValid = true //cascadeRename:false 而實際有改名者(引用成為懸空, 授權依設計改變)之後, 與改名前之比對不再成立
            let steps = (type === 'delete') ? ['targets', 'pemis', 'grups'] : ['grups', 'pemis']
            R.shuffle(steps).forEach((tbl) => {
                let ref = REFS[tbl]
                let b = genBatch(R, type, tbl, W)
                let cascade = !b.noCascade
                let opt = cascade ? (R.chance(0.5) ? {} : { cascadeRename: true }) : { cascadeRename: false }
                let holdersIn = withGarbage(R, W[ref.holder], ref.field)
                let snap = JSON.stringify([W[tbl], b.rowsNew, holdersIn])
                let plan
                try {
                    plan = planRefChanges({ keyTable: tbl, rowsOld: W[tbl], rowsNew: b.rowsNew, holdersOld: holdersIn, opt })
                }
                catch (err) {
                    v('throw', `${tbl}: ${err && err.message}`)
                    return
                }
                inc('steps')
                if (JSON.stringify([W[tbl], b.rowsNew, holdersIn]) !== snap) {
                    v('pure', `${tbl}: 輸入被改動`)
                }
                let ops = oracleOps(tbl, W[tbl], b.rowsNew, cascade)
                let errs = oracleErrs(tbl, W[tbl], ops, holdersIn, ref.field, cascade, ref.kind)
                let info = `old=[${W[tbl].map((r) => `${r.id}:${nameOfRow(tbl, r)}`).join(',')}] new=[${b.rowsNew.map((r) => `${r.id}:${nameOfRow(tbl, r)}`).join(',')}] ren=${js(ops.renames)} cleaned=${js([...ops.cleaned])} plan.ren=${js(plan.renames)} plan.del=${js(plan.delNames)}`
                //(M) 拒絕與獨立判定一致: 有應拒之情形必拒(且為其中一種); 無應拒之情形必不拒
                if (errs.size === 0 ? plan.err !== null : !errs.has(plan.err)) {
                    v('err', `${tbl}: 預期 ${[...errs].join('|') || 'null'}, 實得 ${plan.err} ${info}`)
                }
                if (plan.err !== null) {
                    inc('err_' + plan.err)
                    if (plan.changes.length !== 0) {
                        v('errChanges', `${tbl}: 被拒但 changes 非空`)
                    }
                    if (plan.nHolders !== 0 || plan.nRenameHolders !== 0 || plan.nDelHolders !== 0 || plan.nExternal !== 0) {
                        v('errCounts', `${tbl}: err=${plan.err} 計數殘留 [${plan.nHolders},${plan.nRenameHolders},${plan.nDelHolders},${plan.nExternal}]`)
                    }
                    return //整次拒存: 四表零變更
                }
                inc('ok')
                //renames／delNames 與獨立判定一致(歷史同名組之改名與刪除並存者只比 renames)
                let sortR = (a) => a.map((x) => `${x.id}:${x.from}>${x.to}`).sort()
                if (js(sortR(plan.renames)) !== js(sortR(ops.renames))) {
                    v('ids', `${tbl}: renames 不符`)
                }
                if (js([...plan.delNames].sort()) !== js([...ops.cleaned].sort())) {
                    v('ids', `${tbl}: delNames 預期 ${js([...ops.cleaned].sort())} 實得 ${js([...plan.delNames].sort())} ${info}`)
                }
                if (ops.renames.length > 0) {
                    inc('hasRename')
                    let fr = new Set(ops.renames.map((x) => x.from))
                    if (ops.renames.some((x) => fr.has(x.to) && ops.ren.get(x.to) === x.from)) {
                        inc('swap')
                    }
                    if (ops.renames.some((x) => fr.has(x.to) && ops.ren.get(x.to) !== x.from)) {
                        inc('chain')
                    }
                    if (ops.renames.length >= 2) {
                        inc('multiRename')
                    }
                    if (ops.renames.some((x) => W[tbl].filter((r) => nameOfRow(tbl, r) === x.from).length >= 2)) {
                        inc('dupMoved')
                    }
                }
                if (ops.cleaned.size > 0) {
                    inc('hasDel')
                }
                //各引用端列: 與參考實作逐列比對(strings), 未命中者不在 changes(unaffected)
                let by = new Map(plan.changes.map((c) => [c.id, c]))
                if (by.size !== plan.changes.length) {
                    v('counts', `${tbl}: changes id 重複`)
                }
                let validIds = new Set(W[ref.holder].map((h) => h.id))
                plan.changes.forEach((c) => {
                    if (!validIds.has(c.id)) {
                        v('unaffected', `${tbl}: changes 含非引用端列 ${c.id}`)
                    }
                })
                let refStrs = new Map()
                W[ref.holder].forEach((h) => {
                    let str = h[ref.field]
                    let exp = refRewrite(str, cascade ? ops.ren : new Map(), ops.cleaned, ref.kind)
                    let ch = by.get(h.id)
                    if (exp.hit) {
                        inc('hitHolders')
                        if (exp.isArr) {
                            inc('hitArr')
                        }
                        if (/__proto__|constructor|length|toString/.test(str)) {
                            inc('hitSpecial')
                        }
                        if (/\/\*c\*\/|[a-z]+:\{|'/.test(str)) {
                            inc('hitJson5')
                        }
                        if (ch === undefined) {
                            v('strings', `${tbl}/${h.id}: 應改寫而無 change`)
                        }
                        else {
                            if (ch.field !== ref.field || ch.before !== str) {
                                v('strings', `${tbl}/${h.id}: field／before 不符`)
                            }
                            let got
                            try {
                                got = exp.dec ? decRuleArr(JSON5.parse(ch.after)) : kvOf(ch.after)
                            }
                            catch (err) {
                                v('strings', `${tbl}/${h.id}: after 無法解析 ${ch.after}`)
                                return
                            }
                            try {
                                assert.deepStrictEqual(got, exp.dec ? exp.dec : exp.out)
                            }
                            catch (err) {
                                v('strings', `${tbl}/${h.id}: after 與參考不同 before=${str} after=${ch.after} ${info}`)
                            }
                            if (ch.nRename !== exp.nRen || ch.nDel !== exp.nDel) {
                                v('counts', `${tbl}/${h.id}: nRename／nDel 預期 ${exp.nRen}/${exp.nDel} 實得 ${ch.nRename}/${ch.nDel}`)
                            }
                            let fromExp = (typeof h.from === 'string' && h.from !== '') ? h.from : ''
                            if (ch.from !== fromExp) {
                                v('counts', `${tbl}/${h.id}: from 預期 ${fromExp} 實得 ${ch.from}`)
                            }
                            if (fromExp !== '') {
                                inc('hitExternal')
                            }
                        }
                        refStrs.set(h.id, strOf(exp))
                    }
                    else {
                        if (ch !== undefined) {
                            v('unaffected', `${tbl}/${h.id}: 未受影響卻被改寫 before=${str} after=${ch.after} ${info}`)
                        }
                        //未命中者以 rewriteRefs 直接檢查: 同一字串(逐字不動, 含 JSON5 註解／單引號)
                        let r = rewriteRefs(str, { kind: ref.kind, rename: cascade ? ops.ren : new Map(), del: ops.cleaned })
                        if (r.str !== str || r.changed) {
                            v('unaffected', `${tbl}/${h.id}: rewriteRefs 未命中卻改動字串`)
                        }
                        inc('verbatimHolders')
                        let kpv = tryParse(str)
                        if (kpv !== undefined && kpv !== null && typeof kpv === 'object' && hasNF(kpv)) {
                            inc('nfVerbatim') //含非有限數值但未命中: 不受影響(D8)
                        }
                        if (/\/\*c\*\/|'/.test(str)) {
                            inc('verbatimJson5')
                        }
                    }
                })
                //計數一致性
                let chs = plan.changes
                if (plan.nHolders !== chs.length || plan.nRenameHolders !== chs.filter((c) => c.nRename > 0).length || plan.nDelHolders !== chs.filter((c) => c.nDel > 0).length || plan.nExternal !== chs.filter((c) => c.from !== '').length) {
                    v('counts', `${tbl}: 計數與 changes 不一致 [${plan.nHolders},${plan.nRenameHolders},${plan.nDelHolders},${plan.nExternal}] vs ${chs.length}`)
                }
                if (chs.some((c) => c.nRename + c.nDel === 0 || c.before === c.after)) {
                    v('counts', `${tbl}: changes 含未改寫之列`)
                }
                if (plan.nRenameHolders > plan.nHolders || plan.nDelHolders > plan.nHolders || plan.nExternal > plan.nHolders || plan.nHolders > plan.nRenameHolders + plan.nDelHolders) {
                    v('counts', `${tbl}: 計數關係不成立`)
                }
                if (plan.nRenameHolders > 0 && plan.nDelHolders > 0) {
                    inc('bothKinds')
                }
                if (plan.nExternal > 0) {
                    inc('external')
                }
                if (chs.length === 0) {
                    inc('noChange')
                }
                //套用: 寫入後之世界(被引用表之新列＋引用端改寫); 參考世界以參考實作之字串
                let prevAuth = authOf(W)
                if (!cascade && oracleOps(tbl, W[tbl], b.rowsNew, true).renames.length > 0) {
                    authValid = false
                }
                W[ref.holder] = applyChanges(W[ref.holder], plan.changes)
                W[tbl] = clone(b.rowsNew)
                refW[ref.holder] = refW[ref.holder].map((h) => (refStrs.has(h.id) ? { ...h, [ref.field]: refStrs.get(h.id) } : h))
                refW[tbl] = clone(b.rowsNew)
                //授權
                if (type === 'rename' && authValid) {
                    let a = authOf(W)
                    if (js(a) !== js(authBefore)) {
                        v('auth', `${tbl}: 改名後授權改變 ${js(authBefore)} → ${js(a)} 改名=${js(plan.renames)}`)
                    }
                    else {
                        inc('authKept')
                    }
                }
                if (type === 'delete') {
                    let a = authOf(W)
                    let ar = authOf(refW)
                    if (js(a) !== js(ar)) {
                        v('auth', `${tbl}: 刪除後授權≠參考(自字串移除被刪項目) 實得 ${js(a)} 參考 ${js(ar)} 刪=${js(plan.delNames)}`)
                    }
                    else {
                        inc('authMatched')
                    }
                    if (js(a) !== js(prevAuth)) {
                        inc('deleteChangedAuth')
                    }
                }
            })
        }

        //每種批次類型各跑 N_SEEDS 組(惰性、快取)
        let CACHE = {}
        let runType = (type) => {
            if (!CACHE[type]) {
                let st = {}
                let viol = {}
                for (let seed = 1; seed <= N_SEEDS; seed++) {
                    simulate(seed, type, st, viol)
                }
                CACHE[type] = { st, viol }
            }
            return CACHE[type]
        }
        let expectClean = (types, cat, hint) => {
            types.forEach((t) => {
                let { viol, st } = runType(t)
                let n = st['viol_' + cat] || 0
                assert.strictEqual(n, 0, `${t}: ${hint} 違反 ${n} 次, 例:\n  ${(viol[cat] || []).join('\n  ')}`)
            })
        }

        it('RC-401 改名級聯後各使用者最終授權與改名前逐位相等(P6、M、D4; 真 getUserRules; 含互換／鏈式／循環／同批多個／物件與陣列混用／懸空／停用／mode 缺非法／歷史同名／原型鍵名)', function() {
            expectClean(['rename'], 'auth', '改名後授權不變')
            let { st } = runType('rename')
            assert.ok((st.authKept || 0) >= 2000, `改名且被接受並逐使用者比對之步驟數不足: ${st.authKept}`)
        })

        it('RC-402 刪除連帶清理後授權＝「把被刪名稱之項目自原字串移除、其餘不動」之參考結果(N、P6; 含刪後同名新增不繼承、歷史同名只刪其一、標的／權限／群組三表)', function() {
            expectClean(['delete'], 'auth', '刪除後授權＝參考')
            let { st } = runType('delete')
            assert.ok((st.authMatched || 0) >= 3000, `比對步驟數不足: ${st.authMatched}`)
            //靈敏度: 參考結果與刪除前授權確有不同者(AND 限制解除等), 證明比較不是恆等式
            assert.ok((st.deleteChangedAuth || 0) >= 100, `刪除改變授權之步驟過少(比較缺乏靈敏度): ${st.deleteChangedAuth}`)
        })

        it('RC-403 字串級參考比對(P6、D1): 改名／刪除／混合批次, 被命中之引用字串之解析結果＝參考實作(同形式、鍵序、值內欄位原樣), nRename／nDel／from 正確', function() {
            expectClean(['rename', 'delete', 'mixed'], 'strings', '字串級參考比對')
            expectClean(['rename', 'delete', 'mixed'], 'counts', '計數與 from')
        })

        it('RC-404 未被改名／刪除影響之引用字串逐字不動(D4): 不在 changes、rewriteRefs 回同一字串(含 JSON5 註解／單引號／簡寫排版)', function() {
            expectClean(['rename', 'delete', 'mixed'], 'unaffected', '未受影響字串逐字不動')
            for (let t of ['rename', 'delete', 'mixed']) {
                let { st } = runType(t)
                assert.ok((st.verbatimHolders || 0) >= 1500, `${t}: 未受影響之引用端列數不足 ${st.verbatimHolders}`)
                assert.ok((st.verbatimJson5 || 0) >= 200, `${t}: 未受影響且為 JSON5／註解書寫之列數不足 ${st.verbatimJson5}`)
            }
        })

        it('RC-405 拒絕與獨立判定一致(M、P3、D8): DupGroup／NameInUse／Conflict／Unsupported(須改寫之容器含非有限數值)之成立條件以獨立程式判定, 應拒必拒、不應拒必不拒', function() {
            expectClean(['rename', 'delete', 'mixed'], 'err', '拒絕判定')
        })

        it('RC-406 被拒時整次零變更(M、D4): changes 為空(被拒之步驟不套用, 四表維持原狀)', function() {
            expectClean(['rename', 'delete', 'mixed'], 'errChanges', '被拒時 changes 為空')
        })

        it('RC-407 被拒時計數歸零(M、D3、D6; 原缺陷 D-2 已修): err 非 null 之計畫 nHolders／nRenameHolders／nDelHolders／nExternal 皆 0', function() {
            expectClean(['rename', 'mixed'], 'errCounts', '被拒時計數歸零')
        })

        it('RC-408 renames／delNames 與以 id 獨立判定者一致(D2); 規劃過程不拋(含垃圾引用端列)、輸入不被改動(純函數)', function() {
            expectClean(['rename', 'delete', 'mixed'], 'ids', 'renames／delNames')
            expectClean(['rename', 'delete', 'mixed'], 'throw', '規劃不拋')
            expectClean(['rename', 'delete', 'mixed'], 'pure', '輸入不被改動')
        })

        it('RC-409 輸入空間覆蓋統計: 隨機宇宙確實涵蓋互換／鏈式／同批多個／DupGroup／NameInUse／Conflict／陣列形式／原型鍵名／JSON5 書寫／外部列／改名＋刪除並存／歷史同名成員改名', function() {
            let sum = (k) => ['rename', 'delete', 'mixed'].reduce((a, t) => a + (runType(t).st[k] || 0), 0)
            if (process.env.RC_STATS) {
                ['rename', 'delete', 'mixed'].forEach((t) => console.log(`[RC_STATS] ${t}`, JSON.stringify(runType(t).st)))
            }
            let need = {
                steps: 9000,
                ok: 5000,
                hasRename: 1500,
                swap: 100,
                chain: 100,
                multiRename: 300,
                hasDel: 2000,
                err_renameCascadeDupGroup: 30,
                err_renameCascadeNameInUse: 30,
                err_renameCascadeConflict: 15,
                hitHolders: 5000,
                hitArr: 600,
                hitSpecial: 200,
                hitJson5: 400,
                external: 200,
                bothKinds: 50,
                dupMoved: 30,
                err_renameCascadeUnsupported: 30,
                nfVerbatim: 100,
            }
            Object.entries(need).forEach(([k, n]) => {
                assert.ok(sum(k) >= n, `覆蓋不足 ${k}: ${sum(k)} < ${n}`)
            })
        })

        it('RC-410 rule 陣列含索引名元素: 刪除標的前後, 未被刪除之標的之授權(真 getUserRules)逐位不變(P6、D4、D5; 800 組, 含非物件元素／無 name 物件／{}／數字 name／字串 name／物件形式 crules)', function() {
            let N = 800
            let st = { universes: 0, withNonObj: 0, withNamelessObj: 0, shifted: 0, multiDel: 0, changed: 0 }
            let bad = []
            for (let seed = 1; seed <= N; seed++) {
                let R = mkRng(seed * 31 + 7777)
                let tids = ['0', '1', '2', '3', ...R.shuffle(['4', '5', '6', 'T1', 'T2']).slice(0, 1 + R.int(3))]
                let genEl = () => {
                    let x = R.f()
                    if (x < 0.25) {
                        return R.pick(['y', 'n'])
                    }
                    if (x < 0.32) {
                        return R.pick([5, null, true])
                    }
                    if (x < 0.45) {
                        return { isActive: R.pick(['y', 'n']) }
                    }
                    if (x < 0.5) {
                        return { isActive: 'y', mode: 'OR', memo: 'x' }
                    }
                    if (x < 0.55) {
                        return {}
                    }
                    if (x < 0.85) {
                        return { name: R.pick(tids), isActive: R.pick(['y', 'y', 'n']) }
                    }
                    return { name: Number(R.pick(['0', '1', '2', '3'])), isActive: 'y' }
                }
                let genCrules = () => {
                    if (R.chance(0.15)) {
                        return objStr(R.shuffle(tids).slice(0, 2 + R.int(3)).map((t) => [t, R.pick(['y', 'n'])]))
                    }
                    let els = []
                    let n = 3 + R.int(5)
                    for (let i = 0; i < n; i++) {
                        els.push(genEl())
                    }
                    return JSON.stringify(els)
                }
                let pemis = [{ id: 'p1', name: 'P1', crules: genCrules() }, { id: 'p2', name: 'P2', crules: genCrules() }]
                let W = {
                    users: [U('u0', objStr([['G1', OR]]))],
                    grups: [G('g1', 'G1', objStr([['P1', { mode: R.pick(['OR', 'AND']), isActive: 'y' }], ['P2', { mode: R.pick(['OR', 'AND']), isActive: 'y' }]]))],
                    pemis,
                    targets: tids.map((id) => ({ id })),
                }
                let els = pemis.flatMap((p) => {
                    let kp = JSON.parse(p.crules)
                    return Array.isArray(kp) ? kp : []
                })
                st.universes++
                if (els.some((e) => !isObjEl(e))) {
                    st.withNonObj++
                }
                if (els.some((e) => isObjEl(e) && !hasOwn(e, 'name'))) {
                    st.withNamelessObj++
                }
                let del = R.shuffle(tids).slice(0, 1 + R.int(3))
                if (del.length >= 2) {
                    st.multiDel++
                }
                let remain = tids.filter((t) => !del.includes(t))
                let plan = planRefChanges({ keyTable: 'targets', rowsOld: W.targets, rowsNew: remain.map((id) => ({ id })), holdersOld: W.pemis })
                if (plan.err !== null) {
                    bad.push(`seed=${seed}: err=${plan.err}`)
                    continue
                }
                if (plan.changes.length > 0) {
                    st.changed++
                }
                if (plan.changes.some((c) => (c.after.match(/"name":\d/g) || []).length > (c.before.match(/"name":\d/g) || []).length)) {
                    st.shifted++
                }
                let Wk = { ...W, targets: remain.map((id) => ({ id })) }
                let a0 = authOf(Wk)
                let a1 = authOf({ ...Wk, pemis: applyChanges(W.pemis, plan.changes) })
                if (js(a0) !== js(a1)) {
                    bad.push(`seed=${seed}: 刪 ${js(del)} 後授權 ${js(a0)} → ${js(a1)} crules=${js(pemis.map((p) => p.crules))} after=${js(plan.changes.map((c) => c.after))}`)
                }
            }
            assert.strictEqual(bad.length, 0, `未被刪除之標的授權改變 ${bad.length} 組, 例:\n  ${bad.slice(0, 5).join('\n  ')}`)
            assert.ok(st.universes >= 500, `宇宙數不足 ${st.universes}`)
            assert.ok(st.withNonObj >= 500 && st.withNamelessObj >= 500, `含非物件元素／無 name 物件之宇宙不足: ${js(st)}`)
            assert.ok(st.shifted >= 150, `實際發生具名化之宇宙不足(缺乏靈敏度): ${js(st)}`)
            assert.ok(st.multiDel >= 300, `多重刪除之宇宙不足: ${js(st)}`)
        })
    })


    // ---------------------------------------------------------------
    // RC-5xx 站點不變式(靜態掃描; 原則 4「所有入口一致」: 引用改寫只經 src/js/refCascade.mjs)
    // 輸入空間: 範圍(src／server) × 站點種類(定義／匯入／JSON.stringify 寫回授權欄位／直接賦值授權欄位／JSON5 解析)
    // ---------------------------------------------------------------
    describe('站點不變式(引用改寫只經共用純函數)', function() {
        let ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
        let walk = (dir) => {
            let out = []
            if (!fs.existsSync(dir)) {
                return out
            }
            fs.readdirSync(dir, { withFileTypes: true }).forEach((d) => {
                let fp = path.join(dir, d.name)
                if (d.isDirectory()) {
                    if (d.name !== 'node_modules') {
                        out.push(...walk(fp))
                    }
                }
                else if (/\.(mjs|js|vue)$/.test(d.name)) {
                    out.push(fp)
                }
            })
            return out
        }
        let SRC = walk(path.join(ROOT, 'src'))
        let SERVER = walk(path.join(ROOT, 'server'))
        let rel = (fp) => path.relative(ROOT, fp).split(path.sep).join('/')
        let isCascade = (fp) => rel(fp) === 'src/js/refCascade.mjs'
        //code(): 可執行碼行(略過註解行與行尾註解)
        let codeOf = (fp) => sourceLines(fp, 'code')
        //掃描: 回傳 [{ file, no, text }]; keepStr 為 true 時保留字串字面值(匯入路徑之比對), 否則先把字串字面值清空(避免訊息文字被當成識別字)
        let scan = (files, re, keepStr = false) => {
            let out = []
            files.forEach((fp) => {
                codeOf(fp).forEach(({ no, text }) => {
                    if (re.test(keepStr ? text : blankStrings(text))) {
                        out.push({ file: rel(fp), no, text: text.trim() })
                    }
                })
            })
            return out
        }
        let fmt = (hits) => hits.map((h) => `${h.file}:${h.no} ${h.text}`).join('\n  ')

        //編輯對話框(VeCgrups／VeCpemis／VeCrules／VeGrupBlngUsers／VePemiBlngGrups)為使用者以視覺編輯器產生授權字串之既有站點(非「被引用者改名／刪除」之連帶改寫), 列入白名單
        let WHITE = {
            'src/components/VeCgrups.vue': 1,
            'src/components/VeCpemis.vue': 1,
            'src/components/VeCrules.vue': 1,
            'src/components/VeGrupBlngUsers.vue': 2,
            'src/components/VePemiBlngGrups.vue': 2,
        }
        let reStringifyAuth = /(cgrups|cpemis|crules)\b[^\n]*JSON5?\.stringify\(|JSON5?\.stringify\([^\n]*\b(cgrups|cpemis|crules)\b/
        let reAssignAuth = /\.(cgrups|cpemis|crules)\s*=[^=]/

        it('RC-501 rewriteRefs／diffRefTargets／planRefChanges／fillIdlessIds 只在 src/js/refCascade.mjs 定義(單一擁有者, R-REF-CASCADE-01)', function() {
            let defs = scan([...SRC, ...SERVER], /\b(function\s+(rewriteRefs|diffRefTargets|planRefChanges|fillIdlessIds)\b|(let|const|var)\s+(rewriteRefs|diffRefTargets|planRefChanges|fillIdlessIds)\s*=)/)
            assert.deepStrictEqual(defs.map((h) => h.file), ['src/js/refCascade.mjs', 'src/js/refCascade.mjs', 'src/js/refCascade.mjs', 'src/js/refCascade.mjs'], `定義站點:\n  ${fmt(defs)}`)
        })

        it('RC-502 server 端引用規劃之呼叫站點限於 procCore.mjs／WWebPerm.mjs／cascadeWrite.mjs, 且匯入 refCascade 者亦限於此三檔', function() {
            let allowed = new Set(['server/procCore.mjs', 'server/WWebPerm.mjs', 'server/cascadeWrite.mjs'])
            let calls = scan(SERVER, /\b(rewriteRefs|planRefChanges|diffRefTargets|fillIdlessIds)\b/)
            let bad = calls.filter((h) => !allowed.has(h.file))
            assert.strictEqual(bad.length, 0, `白名單外之呼叫站點:\n  ${fmt(bad)}`)
            let imps = scan(SERVER, /from\s+['"][^'"]*refCascade(\.mjs)?['"]/, true)
            let bad2 = imps.filter((h) => !allowed.has(h.file))
            assert.strictEqual(bad2.length, 0, `白名單外之匯入站點:\n  ${fmt(bad2)}`)
            //靈敏度: 掃描確實抓得到既有站點(非空轉)
            assert.ok(calls.length >= 2, `server 端應至少有 planRefChanges 之呼叫站點, 實得 ${calls.length}`)
        })

        it('RC-503 server 端不得自行解析／序列化授權欄位: 無 JSON5 匯入; 無同一行同時出現 cgrups／cpemis／crules 與 JSON.parse／JSON.stringify／JSON5; 無直接賦值授權欄位', function() {
            //server/tools/nameDupReport.mjs(run08 自 test/tools 搬入, 隨套件出貨之離線唯讀稽核, R-SHIP-TOOLS-01)以 JSON5 解碼引用字串列出同名組之引用處, 為其本質且不改寫任何授權欄位; 此為唯一登記之例外(其餘檔案仍不得出現 JSON5)
            let j5 = scan(SERVER.filter((fp) => rel(fp) !== 'server/tools/nameDupReport.mjs'), /\bJSON5\b/)
            assert.strictEqual(j5.length, 0, `server 端出現 JSON5:\n  ${fmt(j5)}`)
            assert.ok(scan(SERVER.filter((fp) => rel(fp) === 'server/tools/nameDupReport.mjs'), /\bJSON5\b/).length >= 1, '登記之例外確實使用 JSON5(例外過期即應移除)')
            let both = scan(SERVER, /(cgrups|cpemis|crules)[^\n]*JSON\.(parse|stringify)|JSON\.(parse|stringify)[^\n]*(cgrups|cpemis|crules)/)
            assert.strictEqual(both.length, 0, `server 端自寫授權欄位序列化:\n  ${fmt(both)}`)
            let asg = scan(SERVER, reAssignAuth)
            assert.strictEqual(asg.length, 0, `server 端直接賦值授權欄位:\n  ${fmt(asg)}`)
        })

        it('RC-504 src 端對 cgrups／cpemis／crules 做 JSON.stringify 寫回之站點限於白名單(編輯對話框), 白名單外為 0; 且不得有另一套引用改寫(白名單外直接賦值授權欄位為 0)', function() {
            let hits = scan(SRC.filter((fp) => !isCascade(fp)), reStringifyAuth)
            let counts = {}
            hits.forEach((h) => {
                counts[h.file] = (counts[h.file] || 0) + 1
            })
            let out = hits.filter((h) => !hasOwn(WHITE, h.file))
            assert.strictEqual(out.length, 0, `白名單外之 JSON.stringify 授權欄位站點:\n  ${fmt(out)}`)
            //靈敏度: 白名單內之站點確被掃描規則抓到(規則非空轉); 站點數不超過白名單所載(新增站點須審視後再入白名單)
            Object.entries(WHITE).forEach(([f, n]) => {
                assert.ok((counts[f] || 0) >= 1, `掃描規則未抓到白名單站點 ${f}`)
                assert.ok((counts[f] || 0) <= n, `${f} 之站點數 ${counts[f]} 超過白名單所載 ${n}`)
            })
            //直接賦值授權欄位: 僅 VeGrupBlngUsers／VePemiBlngGrups(編輯對話框之既有站點)
            let asg = scan(SRC.filter((fp) => !isCascade(fp)), reAssignAuth)
            let okAsg = new Set(['src/components/VeGrupBlngUsers.vue', 'src/components/VePemiBlngGrups.vue'])
            let outAsg = asg.filter((h) => !okAsg.has(h.file))
            assert.strictEqual(outAsg.length, 0, `白名單外之直接賦值授權欄位:\n  ${fmt(outAsg)}`)
        })

        it('RC-505 refCascade.mjs 為純函數檔(前後端共用): 只匯入 json5、wsemi/src/iseobj.mjs、./getPropKey.mjs(不依賴 Vue／DOM／ORM／fs)', function() {
            let fp = path.join(ROOT, 'src/js/refCascade.mjs')
            let imps = codeOf(fp).filter((x) => /^\s*import\b/.test(x.text)).map((x) => /from\s+['"]([^'"]+)['"]/.exec(x.text)[1]).sort()
            assert.deepStrictEqual(imps, ['./getPropKey.mjs', 'json5', 'wsemi/src/iseobj.mjs'])
        })

        it('RC-506 規劃用 id 之命名(__new__ 前綴)只在 refCascade.mjs(單一擁有者: server／其他 src 不得自行為未帶 id 之列補 id), 且 server 端寫入路徑確有呼叫 fillIdlessIds', function() {
            let hits = scan([...SRC, ...SERVER], /__new__/, true).filter((h) => h.file !== 'src/js/refCascade.mjs')
            assert.strictEqual(hits.length, 0, `refCascade.mjs 以外出現規劃 id 前綴:\n  ${fmt(hits)}`)
            let uses = scan(SERVER, /\bfillIdlessIds\s*\(/).map((h) => h.file)
            assert.ok(uses.includes('server/procCore.mjs') && uses.includes('server/cascadeWrite.mjs'), `server 端寫入路徑應呼叫 fillIdlessIds: ${js(uses)}`)
        })
    })


    // ---------------------------------------------------------------
    // RC-6xx fillIdlessIds(未帶 id 之列補規劃 id; D7)
    // 輸入空間: 表(grups／pemis／targets) × 列(帶字串 id／帶數字 id／NaN‧Infinity‧空字串‧null‧物件 id／缺 id／非物件) × 名稱(命中 pool／不在 pool／同名多列／名稱已被本批他列以 id 帶用)
    //           × rowsPool(正常／含非物件、缺 id、id 非字串、缺 name、name 非字串之列) × 輸入不被改動
    // ---------------------------------------------------------------
    describe('fillIdlessIds(未帶 id 之列補規劃 id)', function() {
        let fill = (...args) => fillIdlessIds(...args)

        it('RC-601 帶 id／不帶 id 混合(D7): 帶 id 者保持其 id; 不帶 id 者依名稱對應 rowsPool 中 id 未被本批帶用之既有列(同名＝同一實體)', function() {
            let pool = [{ id: 'g1', name: 'A' }, { id: 'g2', name: 'B' }, { id: 'g3', name: 'C' }]
            let rows = [{ id: 'g1', name: 'A2' }, { name: 'B' }, { name: 'C', memo: 'x' }]
            for (let tbl of ['grups', 'pemis']) {
                let out = fill(tbl, pool, rows)
                assert.deepStrictEqual(out, [{ id: 'g1', name: 'A2' }, { name: 'B', id: 'g2' }, { name: 'C', memo: 'x', id: 'g3' }], tbl)
            }
            //全部不帶 id 且全部同名: 皆對應回原列(整表寫入不改任何資料時, 不得被當成全部刪除再新增)
            let out2 = fill('grups', pool, [{ name: 'C' }, { name: 'A' }, { name: 'B' }])
            assert.deepStrictEqual(out2.map((r) => [r.name, r.id]), [['C', 'g3'], ['A', 'g1'], ['B', 'g2']])
        })

        it('RC-601b 名稱已被本批他列以 id 帶用者不對應(D7: 只對應 id 未被本批帶用之既有列): g1 帶 id 改名為 X, 另一不帶 id 之 A 不得對應 g1, 視為新實體', function() {
            let pool = [{ id: 'g1', name: 'A' }]
            let out = fill('grups', pool, [{ id: 'g1', name: 'X' }, { name: 'A' }])
            assert.strictEqual(out[0].id, 'g1')
            assert.notStrictEqual(out[1].id, 'g1', '不得與本批已帶之 id 重複')
            assert.strictEqual(typeof out[1].id, 'string')
            //端到端: 規劃上為 g1 改名 A→X(引用跟著改), 另新增一個同名 A(不繼承引用)
            let p = planRefChanges({ keyTable: 'grups', rowsOld: pool, rowsNew: out, holdersOld: [U('u1', objStr([['A', OR]]))] })
            assert.deepStrictEqual([p.err, p.renames, p.delNames], [null, [{ id: 'g1', from: 'A', to: 'X' }], []])
            assert.deepStrictEqual(pairsOf(p.changes[0].after), [['X', OR]])
        })

        it('RC-602 同名多列依序對應(D7): rowsPool 中同名之既有列依其在 rowsPool 之順序, 對應本批同名之未帶 id 列; 超出者為新實體', function() {
            let pool = [{ id: 'g1', name: 'A' }, { id: 'g2', name: 'A' }, { id: 'g3', name: 'B' }]
            let out = fill('grups', pool, [{ name: 'A' }, { name: 'A' }, { name: 'A' }, { name: 'B' }])
            assert.deepStrictEqual(out.slice(0, 2).map((r) => r.id), ['g1', 'g2'])
            assert.strictEqual(out[3].id, 'g3')
            assert.ok(!['g1', 'g2', 'g3'].includes(out[2].id), '第三個 A 無既有列可對應 → 新實體')
            //本批只帶一個 A: 對應 rowsPool 中第一個同名列
            assert.strictEqual(fill('grups', pool, [{ name: 'A' }])[0].id, 'g1')
            //同名之既有列之一已被本批以 id 帶用: 未帶 id 者對應其餘者
            assert.strictEqual(fill('grups', pool, [{ id: 'g1', name: 'A' }, { name: 'A' }])[1].id, 'g2')
            assert.strictEqual(fill('grups', pool, [{ id: 'g2', name: 'A' }, { name: 'A' }])[1].id, 'g1')
        })

        it('RC-603 名稱不同視為新實體(D7): 不對應任何既有列; 多個新實體之規劃 id 彼此不同、且不與 rowsPool 之既有主鍵及本批已帶 id 相同; 原列順序與其他欄位保留', function() {
            let pool = [{ id: 'g1', name: 'A' }, { id: 'g2', name: 'B' }]
            let rows = [{ name: 'Z1', memo: 'a' }, { id: 'g2', name: 'B' }, { name: 'Z2' }, { name: 'Z1' }, { name: 'a' }, { name: ' A' }]
            let out = fill('grups', pool, rows)
            assert.deepStrictEqual(out.map((r) => r.name), ['Z1', 'B', 'Z2', 'Z1', 'a', ' A'], '順序保留(名稱精確 ===, 大小寫／空白不同者非同名)')
            assert.strictEqual(out[0].memo, 'a')
            let newIds = [0, 2, 3, 4, 5].map((k) => out[k].id)
            newIds.forEach((id) => assert.strictEqual(typeof id, 'string'))
            assert.strictEqual(new Set(newIds).size, newIds.length, '新實體之規劃 id 彼此不同')
            newIds.forEach((id) => assert.ok(!['g1', 'g2'].includes(id), '不與既有主鍵相同'))
            //端到端: g1(A) 無對應列 → 視為被刪; 其引用被清理
            let p = planRefChanges({ keyTable: 'grups', rowsOld: pool, rowsNew: out, holdersOld: [U('u1', objStr([['A', OR], ['B', AND]]))] })
            assert.deepStrictEqual([p.err, p.delNames], [null, ['A']])
            assert.deepStrictEqual(pairsOf(p.changes[0].after), [['B', AND]])
        })

        it('RC-603b 規劃 id 不與 rowsPool 之既有主鍵相同(D7: 給不與任何既有主鍵相同之規劃 id; 對抗輸入: 既有列之 id 恰為規劃 id 之慣用形 __new__0; 原缺陷 D-3 已修)', function() {
            //既有列之 id 為 __new__0: 未帶 id 且無對應之列不得取得與其相同之 id(否則規劃上會被當成該既有列之改名, 引用被改名而非清理)
            let pool = [{ id: '__new__0', name: 'A' }]
            let out1 = fill('grups', pool, [{ name: 'Z' }])
            assert.notStrictEqual(out1[0].id, '__new__0', '不得與 rowsPool 之既有主鍵相同')
            let p = planRefChanges({ keyTable: 'grups', rowsOld: pool, rowsNew: out1, holdersOld: [U('u1', objStr([['A', OR]]))] })
            assert.deepStrictEqual(p.renames, [], '新實體 Z 不得被誤判為 A 之改名')
            assert.deepStrictEqual(p.delNames, ['A'], 'A 被刪除而非改名')
        })

        it('RC-603c 規劃 id 不與本批他列已帶之 id 相同、且各新實體之規劃 id 彼此不同(D7; 對抗輸入: 本批已帶 id 恰為 __new__k; 原缺陷 D-3 已修)', function() {
            //本批他列已帶之 id 為 __new__1: 位於索引 1 之未帶 id 列不得與之重複(否則整表中兩列同 id, 以 id 建 Map 時後者覆蓋前者)
            let out2 = fill('grups', [], [{ id: '__new__1', name: 'Y' }, { name: 'Z' }])
            assert.notStrictEqual(out2[1].id, out2[0].id, '不得與本批已帶 id 重複')
            //本批各列之規劃 id 不得重複
            let out3 = fill('grups', [], [{ name: 'Z1' }, { name: 'Z2' }, { id: '__new__0', name: 'Z3' }])
            assert.strictEqual(new Set(out3.map((r) => r.id)).size, 3, `規劃 id 重複: ${js(out3.map((r) => r.id))}`)
        })

        it('RC-604 targets 不做名稱對應(D7): id 即名稱, 必帶; 未帶 id 之 targets 列不依 name 對應既有列(給新規劃 id)', function() {
            let pool = [{ id: 'T1', name: 'T1' }, { id: 'T2' }]
            let out = fill('targets', pool, [{ name: 'T1' }, { id: 'T2' }, { id: 5 }])
            assert.notStrictEqual(out[0].id, 'T1', 'targets 不以 name 對應 pool')
            assert.strictEqual(typeof out[0].id, 'string')
            assert.strictEqual(out[1].id, 'T2')
            assert.strictEqual(out[2].id, '5', '數字 id 取字串形式')
            //對照: 同樣輸入於 grups 則依名稱對應
            assert.strictEqual(fill('grups', [{ id: 'g1', name: 'T1' }], [{ name: 'T1' }])[0].id, 'g1')
        })

        it('RC-605 數字／非法 id(D7): 有限數字 → 字串形式(視為本批已帶用, 其對應之既有列不再被名稱對應); NaN／Infinity／空字串／null／物件／陣列／布林 id 視同未帶', function() {
            let pool = [{ id: '5', name: 'A' }, { id: 'g2', name: 'B' }]
            let out = fill('grups', pool, [{ id: 5, name: 'B' }, { name: 'A' }, { name: 'B' }])
            assert.strictEqual(out[0].id, '5', '數字 id 取字串形式')
            assert.strictEqual(out[2].id, 'g2', '名稱 B 對應 g2(g2 未被本批帶用)')
            assert.ok(out[1].id !== '5' && out[1].id !== 'g2', '名稱 A 之既有列 id 5 已被本批帶用 → A 為新實體')
            assert.strictEqual(fill('grups', [], [{ id: 0, name: 'Z' }])[0].id, '0', '數字 0 亦為有效 id')
            assert.strictEqual(fill('grups', [], [{ id: -3, name: 'Z' }])[0].id, '-3')
            //視同未帶 id: 依名稱對應
            let bad = [NaN, Infinity, -Infinity, '', null, undefined, {}, [], true, false]
            bad.forEach((id, k) => {
                let o = fill('grups', [{ id: 'g9', name: 'Q' }], [{ id, name: 'Q' }])
                assert.strictEqual(o[0].id, 'g9', `id=${String(id)} 視同未帶 → 依名稱對應`)
            })
        })

        it('RC-606 非物件列／異常之 rowsPool(D7): 不拋; 每個輸出列皆有字串 id; 輸出長度同 rows; rowsPool 中非物件、缺字串 id、缺名稱、名稱非字串之列不參與對應; rows 非陣列之 rowsPool 以外輸入', function() {
            let pool = [null, 5, 'x', [], { id: 5, name: 'A' }, { id: 'g1' }, { id: 'g2', name: 7 }, { id: 'g3', name: 'A' }]
            let rows = [null, undefined, 5, 'xy', [], { name: 'A' }, { name: 7 }, { id: 'g1', name: 'Q' }, true]
            let out
            assert.doesNotThrow(() => {
                out = fill('grups', pool, rows)
            })
            assert.strictEqual(out.length, rows.length)
            out.forEach((r, k) => assert.strictEqual(typeof r.id, 'string', `rows[${k}] 應有字串 id`))
            assert.strictEqual(out[5].id, 'g3', '名稱 A 只對應合格之既有列 g3(id 5 為數字、g1 缺名稱、g2 名稱非字串)')
            assert.strictEqual(out[7].id, 'g1')
            assert.strictEqual(new Set(out.map((r) => r.id)).size, out.length, '各列規劃 id 互不相同')
            //rowsPool 非陣列: 以例外拋出者為呼叫端錯誤(不在規格內); 空 rowsPool 與空 rows 正常
            assert.deepStrictEqual(fill('grups', [], []), [])
            assert.strictEqual(fill('grups', [], [{ name: 'A' }]).length, 1)
        })

        it('RC-607 不改輸入(D7): rows／rowsPool 之內容與參考不變; 回傳為複本(帶 id 之列亦為新物件)', function() {
            let pool = [{ id: 'g1', name: 'A', cpemis: '{}' }, { id: 'g2', name: 'B' }]
            let rows = [{ name: 'A' }, { id: 'g2', name: 'B2' }, { id: 7, name: 'C' }, { name: 'Z' }]
            let snap = js([pool, rows])
            let out = fill('grups', pool, rows)
            assert.strictEqual(js([pool, rows]), snap, '輸入不被改動')
            assert.ok(!('id' in rows[0]), '未帶 id 之輸入列不被補 id')
            assert.strictEqual(rows[2].id, 7, '數字 id 之輸入列不被改為字串')
            out.forEach((o, k) => assert.notStrictEqual(o, rows[k], `rows[${k}] 之回傳不得為同一物件`))
            out[0].memo = 'changed'
            assert.ok(!('memo' in rows[0]), '改回傳不影響輸入')
        })

        it('RC-608 與 planRefChanges 端到端(D7、N、P6): 整表寫入且全部不帶 id 而名稱不變 → 無改名無刪除(不清理引用); 少一列 → 該名稱被清理; 名稱改變(不帶 id) → 視為刪舊增新, 引用被清理而新名無引用; 帶 id 改名 → 級聯', function() {
            let pool = [{ id: 'g1', name: 'A' }, { id: 'g2', name: 'B' }, { id: 'g3', name: 'B' }]
            let holders = [U('u1', objStr([['A', OR], ['B', AND]])), U('u2', objStr([['B', OR]]))]
            let plan = (rows) => planRefChanges({ keyTable: 'grups', rowsOld: pool, rowsNew: fill('grups', pool, rows), holdersOld: holders })
            //名稱不變、全不帶 id(含歷史同名 B 兩列): 無任何異動
            let p1 = plan([{ name: 'B' }, { name: 'A' }, { name: 'B' }])
            assert.deepStrictEqual([p1.err, p1.renames, p1.delNames, p1.changes], [null, [], [], []])
            //少一列 A: 清理 A
            let p2 = plan([{ name: 'B' }, { name: 'B' }])
            assert.deepStrictEqual([p2.err, p2.delNames, ids(p2.changes)], [null, ['A'], ['u1']])
            //歷史同名 B 只少一列: B 仍有存續列 → 不清理
            let p3 = plan([{ name: 'A' }, { name: 'B' }])
            assert.deepStrictEqual([p3.err, p3.delNames, p3.changes], [null, [], []])
            //名稱改變且不帶 id: 視為刪舊增新(A 被清理, 新名 A2 無引用)
            let p4 = plan([{ name: 'A2' }, { name: 'B' }, { name: 'B' }])
            assert.deepStrictEqual([p4.err, p4.renames, p4.delNames], [null, [], ['A']])
            assert.ok(p4.changes.every((c) => !c.after.includes('A2')))
            //帶 id 改名: 級聯
            let p5 = plan([{ id: 'g1', name: 'A2' }, { name: 'B' }, { name: 'B' }])
            assert.deepStrictEqual([p5.err, p5.renames, p5.delNames], [null, [{ id: 'g1', from: 'A', to: 'A2' }], []])
            assert.deepStrictEqual(pairsOf(p5.changes.find((c) => c.id === 'u1').after), [['A2', OR], ['B', AND]])
        })

        it('RC-609 rowsAvoid(D9; 外審 R1): 規劃 id 須避開 rowsPool、rowsAvoid 與本批已帶 id 之全部主鍵; pool 與 avoid 並存; 多個新實體連續避撞; __new__ 前綴被占用至 k+3', function() {
            let isDistinct = (a) => new Set(a).size === a.length
            //a) avoid 單獨: 他來源之列 id 恰為 __new__0
            let o1 = fill('grups', [], [{ name: 'Z' }], [{ id: '__new__0', name: 'A', from: 'other' }])
            assert.notStrictEqual(o1[0].id, '__new__0', '不得與 rowsAvoid 之主鍵相同')
            assert.strictEqual(typeof o1[0].id, 'string')
            //b) pool 與 avoid 並存, 多個新實體連續避撞
            let pool = [{ id: '__new__0', name: 'P' }]
            let avoid = [{ id: '__new__1', name: 'Q', from: 'other' }]
            let o2 = fill('grups', pool, [{ name: 'Z1' }, { name: 'Z2' }, { name: 'Z3' }, { name: 'P' }], avoid)
            let ids2 = o2.map((r) => r.id)
            assert.ok(isDistinct(ids2), `規劃 id 重複: ${js(ids2)}`)
            assert.strictEqual(ids2[3], '__new__0', '名稱 P 對應 pool 之既有列')
            ;[0, 1, 2].forEach((k) => assert.ok(!['__new__0', '__new__1'].includes(ids2[k]), `新實體 ${k} 撞號: ${ids2[k]}`))
            //c) 前綴被占用至 k+3: 索引 0、1 之新實體, avoid 占用 __new__0 ~ __new__6
            let occ = [0, 1, 2, 3, 4, 5, 6].map((n) => ({ id: `__new__${n}`, name: `occ${n}`, from: 'other' }))
            let o3 = fill('grups', [], [{ name: 'Z1' }, { name: 'Z2' }], occ)
            let ids3 = o3.map((r) => r.id)
            assert.ok(isDistinct(ids3), `規劃 id 重複: ${js(ids3)}`)
            ids3.forEach((id) => assert.ok(!occ.some((x) => x.id === id), `撞號: ${id}`))
            //   索引 k 之新實體, 占用 __new__k ~ __new__(k+3)
            let o3b = fill('grups', [], [{ name: 'a' }, { name: 'b' }, { name: 'c' }], [2, 3, 4, 5].map((n) => ({ id: `__new__${n}`, name: `o${n}` })))
            let ids3b = o3b.map((r) => r.id)
            assert.ok(isDistinct(ids3b), `規劃 id 重複: ${js(ids3b)}`)
            ids3b.forEach((id) => assert.ok(!['__new__2', '__new__3', '__new__4', '__new__5'].includes(id), `撞號: ${id}`))
            //   avoid、pool、本批已帶 id 三者合計占用
            let o3c = fill('grups', [{ id: '__new__0', name: 'P' }], [{ id: '__new__1', name: 'G' }, { name: 'Z1' }, { name: 'Z2' }], [{ id: '__new__2', name: 'Q' }, { id: '__new__3', name: 'R' }])
            let ids3c = o3c.map((r) => r.id)
            assert.ok(isDistinct(ids3c), `規劃 id 重複: ${js(ids3c)}`)
            assert.strictEqual(ids3c[0], '__new__1')
            ;[1, 2].forEach((k) => assert.ok(!['__new__0', '__new__1', '__new__2', '__new__3'].includes(ids3c[k]), `撞號: ${ids3c[k]}`))
            //d) avoid 之名稱不參與名稱對應(只用於避撞): 他來源同名之列不得被當成既有列對應
            let o4 = fill('grups', [{ id: 'g1', name: 'A' }], [{ name: 'A' }, { name: 'B' }], [{ id: 'x1', name: 'B', from: 'other' }])
            assert.strictEqual(o4[0].id, 'g1')
            assert.notStrictEqual(o4[1].id, 'x1', '名稱 B 在 avoid(非 pool): 視為新實體')
            //e) 預設 rowsAvoid 為 []
            let rows = [{ name: 'Z' }, { id: 'g9', name: 'Y' }]
            assert.deepStrictEqual(fill('grups', pool, rows), fill('grups', pool, rows, []))
            //f) avoid 內不合格之列(非物件、缺 id、id 非字串)略過、不拋; avoid 不被改動
            let bad = [null, 5, 'x', [], {}, { id: 7 }, { name: 'A' }, { id: null }]
            let snap = js(bad)
            assert.doesNotThrow(() => fill('grups', [], [{ name: 'Z' }], bad))
            assert.strictEqual(js(bad), snap, 'rowsAvoid 不被改動')
            assert.strictEqual(js(occ), js([0, 1, 2, 3, 4, 5, 6].map((n) => ({ id: `__new__${n}`, name: `occ${n}`, from: 'other' }))))
        })

        it('RC-610 buildSyncRowsNew＋planRefChanges 端到端(D9; 外審 R1 之原缺陷): 他 from 之 A(id 恰為 __new__0)被使用者引用, 同步 from:"app" 推未帶 id 之新群組 New → plan.renames／delNames 為空, 他來源之 A 與其引用逐字不動', function() {
            let rowsOld = [{ id: '__new__0', name: 'A', cpemis: '{}', from: 'ext' }]
            let refStr = '/*keep*/ { \'A\': { mode: \'OR\', isActive: \'y\', }, } '
            let holders = [U('u1', refStr, { from: 'ext2' })]
            let snap = js([rowsOld, holders])
            let rowsNew = buildSyncRowsNew('grups', rowsOld, [{ name: 'New', cpemis: '{}', from: 'app' }], 'app')
            assert.strictEqual(rowsNew.length, 2)
            assert.deepStrictEqual(rowsNew[0], rowsOld[0], '他 from 之列原樣')
            assert.notStrictEqual(rowsNew[1].id, '__new__0', '新實體之規劃 id 避開他 from 之主鍵')
            let p = planRefChanges({ keyTable: 'grups', rowsOld, rowsNew, holdersOld: holders })
            assert.deepStrictEqual([p.err, p.renames, p.delNames, p.changes, p.nHolders], [null, [], [], [], 0], '不得把新群組誤判為 A→New 改名')
            assert.strictEqual(holders[0].cgrups, refStr, '他來源之引用逐字不動')
            assert.strictEqual(js([rowsOld, holders]), snap, '輸入不被改動')
            //進一步: 本批含同 from 之既有列(依名稱對應)與多個新實體, 他 from 之列占用 __new__0 ~ __new__3
            let ext = [0, 1, 2, 3].map((n) => ({ id: `__new__${n}`, name: `E${n}`, cpemis: '{}', from: 'ext' }))
            let old2 = [...ext, { id: 'gK', name: 'K', cpemis: '{}', from: 'app' }]
            let hs = [U('u1', objStr([['E0', OR], ['E3', AND], ['K', OR]]))]
            let batch = [{ name: 'K', from: 'app' }, { name: 'N1', from: 'app' }, { name: 'N2', from: 'app' }]
            let rn2 = buildSyncRowsNew('grups', old2, batch, 'app')
            let newIds = rn2.slice(4).map((r) => r.id)
            assert.strictEqual(newIds[0], 'gK', '同 from 同名之列依名稱對應')
            assert.ok(new Set(rn2.map((r) => r.id)).size === rn2.length, `整表主鍵重複: ${js(rn2.map((r) => r.id))}`)
            let p2 = planRefChanges({ keyTable: 'grups', rowsOld: old2, rowsNew: rn2, holdersOld: hs })
            assert.deepStrictEqual([p2.err, p2.renames, p2.delNames, p2.changes], [null, [], [], []], '名稱不變(K)＋新增(N1、N2): 他來源之 E0～E3 與引用不動')
            //本批不再含 K: 只清理 K 之引用, E0、E3 之引用不動
            let rn3 = buildSyncRowsNew('grups', old2, [{ name: 'N1', from: 'app' }], 'app')
            let p3 = planRefChanges({ keyTable: 'grups', rowsOld: old2, rowsNew: rn3, holdersOld: hs })
            assert.deepStrictEqual([p3.err, p3.renames, p3.delNames], [null, [], ['K']])
            assert.deepStrictEqual(pairsOf(p3.changes[0].after), [['E0', OR], ['E3', AND]])
        })
    })
})
