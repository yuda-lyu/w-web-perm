//正反向關聯之「被引用實體身分」純函數單元測試(perm-run02 範圍一; 使用者 2026-10-23 裁示「正反關聯與主體身份檢查, 應該是前後端都要做」; 規則帳本草案 R-SUBJECT-ID-01 規則 4〔伺服端強制〕、R-REF-IDENTITY-01; R-PRINCIPLE-00 原則 3、4、6; R-KEY-01 原型鍵名)
//
//受測: src/js/refIdentity.mjs 全部 13 個匯出(getRefTarget／activeNames／newActiveNames／collectNewNames／idsOfName／snapRefIds／recordPicks／buildRefDecl／parseSubject／parseRefDecl／countRefMismatch／checkRefIdentity／checkSubjectIdentity);
//  依賴一律真實(src/js/refCascade.mjs 之 REF_OF／keyOf／entName／decodeKp／listEntries、src/js/draftSync.mjs 之 checkSubject、json5), 不起 server、不碰 ORM.
//斷言原則: 預期值獨立於實作——一律由下列「規格句」手算於測試內(字面量或手建字串), 不以被測函數(或其內部 helper)算預期值; 同一純函數前後端共用, 故此處之判準即前端自檢與伺服端強制之共同判準.
//
//規格句(本檔所翻譯者; 每條 assertion 之註解標明所對應之 [代號]; 出處: src/js/refIdentity.mjs 檔頭與各函數 JSDoc、spec 裁示、規則帳本草案):
//  [R-TGT]    引用端表 → 被引用表與授權欄: users→grups(cgrups, 種類 ref)、grups→pemis(cpemis, ref)、pemis→targets(crules, rule); targets 無授權引用欄; 表名不識(含原型鍵名)回 null
//  [R-ACT]    「啟用中之引用名稱」＝授權字串內 isActive 嚴格為 'y' 之項目(物件形式以外層鍵為名、陣列形式以元素 name 為名; crules 之值為字串時其值即 isActive); 壞 JSON、空字串、非容器、非字串名稱(ref 種類)皆不計
//  [R-NEW]    「新增之啟用引用項」＝新值啟用項 − 舊值啟用項(停用項不入、未變更之舊引用不入、只改 mode 不入; 舊值為 null〔新增列〕時為新值全部啟用項; 舊值內停用而新值啟用者算新增)
//  [R-COL]    多列新增集合: 新列以 id 對應舊表之列, 無對應舊列者視為新增列
//  [R-IDS]    名稱 → 被引用表內 id 陣列(排序、去重; 空陣列＝查無; 歷史同名多列則多個); targets 之名稱即 id
//  [R-SNAP]   宣告之 ids ＝使用者「選取當時」(編輯器開啟當下)該名稱對應之 id 陣列, 空陣列＝選取當時查無(懸空); 編輯器回填時只記本次新增之啟用名稱
//  [R-DECL]   送出之宣告: 本次新增之啟用引用名稱各附選取記錄之 ids(依名稱排序); 無選取記錄者(複製、貼上)退回送出當下之被引用表
//  [R-FMT-S]  opt.subject 格式 { id, name, saved }: id／name 為非空字串、saved 為布林; 否則 null
//  [R-FMT-R]  opt.refs 格式 [{ name, ids }]: 陣列且 ≤ 5000 筆、各項為純物件、name 為字串且不重複、ids 為字串陣列且 ≤ 1000(去重排序); 否則 null
//  [R-CHK1]   宣告之每個名稱, 被引用表目前對應之 id 陣列須與宣告相同(被刪除、刪除後同名重建〔id 不同〕、新增了同名實體皆不符) → saveRefChanged／refChanged, n＝不符名稱數
//  [R-CHK2]   宣告須完整: 本次寫入之列相對舊表新增之啟用引用名稱, 每個都須在宣告內 → saveRefChanged／refIncomplete, n＝漏報名稱數(先判 [R-CHK1], 再判 [R-CHK2])
//  [R-TGT-ID] targets 之 id 即名稱, 故其身分定義即 id: 檢查涵蓋「已被刪除」, 刪除後同 id 重建依定義是同一實體(R-REF-IDENTITY-01 規則 5)
//  [R-NOTGT]  引用端表無授權引用欄(targets)或表名不識: checkRefIdentity 回 saveIdentityFormat／refNoTarget; countRefMismatch 視為全部不符
//  [R-SUBJ]   主體判準即 draftSync.checkSubject: 同 id 同名 ok; 同 id 異名 renamed; saved 且 id 不在 gone(刪除或刪後同名重建); 未儲存之主體現有同名而 id 不同 taken; 摘要無效 noSubject; 非 ok 一律 saveSubjectChanged
//  [R-PROTO]  使用者資料作為鍵時, 原型鍵名(__proto__／constructor／toString／hasOwnProperty…)不得出錯或誤判(R-KEY-01)
//
//輸入空間表(軸 × 格; 案數為 mocha 實測, 見檔尾「案數」註記):
//  RI-1 getRefTarget: 表名 {users, grups, pemis, targets, 不識名, 5 個原型鍵名, 6 種非字串} → 14＋1(與 REF_OF 單一擁有者一致)
//  RI-2 activeNames: 授權字串形式 F {物件, 陣列, JSON5 手寫, 壞 JSON, 空／空白, 純量 4 種, 非字串 4 種} × isActive V {'y','n',缺,'Y',true,1} × 種類 {ref, rule}(rule 之值為字串之形式另列)
//  RI-3 newActiveNames: 舊值 O {無該名, 啟用, 停用, 舊列為 null, 舊值壞 JSON} × 新值 N {無該名, 啟用, 停用} × 引用端表 {users, grups, pemis} ＋ 只改 mode ＋ 順序去重 ＋ 非法輸入(表名不識／targets／新列非物件)
//  RI-4 collectNewNames: 列對應 {id 同、id 不在舊表、缺 id、數字 id}× 舊表形狀 {陣列, 非陣列} × 新列形狀 {陣列, 非陣列} ＋ 跨列去重
//  RI-5 idsOfName: 名稱在被引用表之狀態 S {唯一, 不存在, 歷史同名 2 筆〔輸入亂序〕, 3 筆, id 為數字, id 缺, name 缺, name 非字串, 原型鍵名, 輸入非陣列} × 表 {grups, pemis, targets}
//  RI-6 snapRefIds／RI-7 recordPicks／RI-8 buildRefDecl: picks {有, 無, 非 Map, 覆蓋} × 名稱 {新增啟用, 未變更舊引用, 停用項, 懸空} × snap {有, 缺, 非 Map} ＋ 前端流程(開框快照 → 回填 → 組宣告)與伺服端判準串接
//  RI-9 parseSubject: 有效 2 ＋ 非法 {非物件 6, 缺欄 3, saved 非布林 4, id／name 空字串或非字串 5}
//  RI-10 parseRefDecl: 有效 {排序去重, 空陣列, 邊界 5000／1000} ＋ 非法 {非陣列 6, 超量 2, 項非純物件 4, name 非字串 3, 名稱重複 2, ids 缺或非陣列 3, ids 含非字串 4}
//  RI-11 countRefMismatch ／ RI-12 checkRefIdentity: 宣告 D {完整相符, 空, 漏報, 多報相符, 多報不符, 同時不符且漏報} × 被引用狀態 S {不變, 刪除, 刪後同名重建, 新增同名, 懸空→出現, 歷史同名多筆} × 引用端表 {users, grups, pemis} ＋ targets／不識表名
//  RI-13 checkSubjectIdentity: 5 種結果 ＋ 與 checkSubject 之格網一致性(6 主體 × 5 表況)
//  RI-14 原型鍵名全流程: 6 個原型鍵名 × 引用端 {users, grups}(快照 → 回填 → 組宣告 → 解析 → 檢查 → 刪後同名重建被拒)
//未測(刻意): 伺服端取鎖與寫入(見 unit-procCore-identity)、前端元件如何呼叫(見元件與 e2e)、JSON5 解析器本身.
//跑法: node C:/opensrcOper/tools/quiet-run.mjs --name ri -- node node_modules/mocha/bin/mocha.js --no-parallel test/unit-refIdentity.test.mjs --timeout 180000 --exit
import assert from 'assert'
import { REF_OF } from '../src/js/refCascade.mjs'
import { checkSubject } from '../src/js/draftSync.mjs'
import {
    getRefTarget, activeNames, newActiveNames, collectNewNames, idsOfName, snapRefIds, recordPicks, buildRefDecl,
    parseSubject, parseRefDecl, countRefMismatch, checkRefIdentity, checkSubjectIdentity,
} from '../src/js/refIdentity.mjs'


const A = assert.strict

let J = (o) => JSON.stringify(o)
const OR = { mode: 'OR', isActive: 'y' }
const AND = { mode: 'AND', isActive: 'y' }
const OFF = { mode: 'OR', isActive: 'n' }
const PROTO_NAMES = ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf', '__defineGetter__']

//sorted: Set 轉排序陣列(比較集合內容, 不依賴插入序)
let sorted = (set) => [...set].sort()

//authStr: 手建授權字串(users.cgrups／grups.cpemis 物件形式 { 名稱: { mode, isActive } }; pemis.crules 物件形式 { 標的: 'y'|'n' }); items: [[名稱, 'y'|'n']]
//  以 Object.fromEntries 建物件(含 __proto__ 者為自有鍵, 見 [R-PROTO])
let authStr = (h, items) => J(Object.fromEntries(items.map(([n, a]) => [n, h === 'pemis' ? a : { mode: 'OR', isActive: a }])))

//HOLD: 引用端表 → 被引用表之測試夾具(名稱與 id 為手寫字面量; pemis 之被引用表 targets 以 id 為名)
const HOLD = {
    users: { ref: 'grups', field: 'cgrups', N: ['GA', 'GB', 'GC'], I: ['g1', 'g2', 'g3'], withName: true },
    grups: { ref: 'pemis', field: 'cpemis', N: ['PA', 'PB', 'PC'], I: ['p1', 'p2', 'p3'], withName: true },
    pemis: { ref: 'targets', field: 'crules', N: ['sys/a', 'sys/b', 'sys/c'], I: ['sys/a', 'sys/b', 'sys/c'], withName: false },
}
let entRow = (h, id, name) => (HOLD[h].withName ? { id, name } : { id })
let refRowsOf = (h) => HOLD[h].N.map((n, k) => entRow(h, HOLD[h].I[k], n))
let hrow = (h, id, items) => ({ id, [HOLD[h].field]: authStr(h, items) })


describe('unit-refIdentity (正反向關聯之被引用實體身分: 純函數)', function() {

    // =================================================================
    // RI-1 getRefTarget
    // =================================================================
    describe('RI-1 getRefTarget', function() {
        const WANT = {
            users: { table: 'grups', field: 'cgrups', kind: 'ref' },
            grups: { table: 'pemis', field: 'cpemis', kind: 'ref' },
            pemis: { table: 'targets', field: 'crules', kind: 'rule' },
        }
        for (let t of Object.keys(WANT)) {
            it(`RI-1 [${t}] → 被引用表 ${WANT[t].table}, 授權欄 ${WANT[t].field}, 種類 ${WANT[t].kind}`, function() {
                A.deepEqual(getRefTarget(t), WANT[t]) //[R-TGT]
            })
        }
        it('RI-1 [targets] 無授權引用欄 → null', function() {
            A.equal(getRefTarget('targets'), null) //[R-TGT]
        })
        it('RI-1 表名不識(空字串、大小寫不同、帶空白) → null', function() {
            for (let v of ['', 'user', 'Users', 'users ', 'grup', 'other']) {
                A.equal(getRefTarget(v), null, `「${v}」`) //[R-TGT]
            }
        })
        for (let p of PROTO_NAMES.slice(0, 5)) {
            it(`RI-1 原型鍵名「${p}」→ null(不得命中原型鏈上之屬性而誤回非 null)`, function() {
                A.equal(getRefTarget(p), null) //[R-TGT][R-PROTO]
            })
        }
        it('RI-1 非字串(null／undefined／數字／物件／陣列／布林) → null', function() {
            for (let v of [null, undefined, 5, {}, [], true, ['users']]) {
                A.equal(getRefTarget(v), null) //[R-TGT]
            }
        })
        it('RI-1 與 refCascade.REF_OF 單一擁有者一致: 每個被引用表 t 之 holder 以 getRefTarget 反查必得 t', function() {
            let tabs = Object.keys(REF_OF)
            A.deepEqual(tabs.sort(), ['grups', 'pemis', 'targets']) //前提: 引用鏈三段
            for (let t of tabs) {
                let r = getRefTarget(REF_OF[t].holder)
                A.equal(r.table, t) //[R-TGT]
                A.equal(r.field, REF_OF[t].field)
                A.equal(r.kind, REF_OF[t].kind)
            }
        })
    })


    // =================================================================
    // RI-2 activeNames
    // =================================================================
    describe('RI-2 activeNames', function() {
        //CASES: [標題, 授權字串, 種類, 預期啟用名稱(排序)]
        const CASES = [
            ['物件形式 isActive y', J({ A: OR }), 'ref', ['A']],
            ['物件形式 isActive n', J({ A: OFF }), 'ref', []],
            ['物件形式 isActive 缺', J({ A: { mode: 'OR' } }), 'ref', []],
            ["物件形式 isActive 'Y'(大小寫須嚴格)", J({ A: { mode: 'OR', isActive: 'Y' } }), 'ref', []],
            ['物件形式 isActive true(布林不算)', J({ A: { isActive: true } }), 'ref', []],
            ['物件形式 isActive 1(數字不算)', J({ A: { isActive: 1 } }), 'ref', []],
            ['物件形式混合', J({ A: OR, B: OFF, C: AND, D: { mode: 'OR' } }), 'ref', ['A', 'C']],
            ['物件形式 mode 不影響啟用判定', J({ A: AND, B: OR }), 'ref', ['A', 'B']],
            ['陣列形式 name＋isActive', J([{ name: 'A', isActive: 'y' }, { name: 'B', isActive: 'n' }, { name: 'C' }]), 'ref', ['A']],
            ['陣列形式元素無 name(ref 種類之名稱為索引〔非字串〕→ 不計)', J([{ isActive: 'y' }, 'y']), 'ref', []],
            ['陣列形式 name 為數字(ref 種類非字串名稱 → 不計)', J([{ name: 5, isActive: 'y' }]), 'ref', []],
            ['JSON5 手寫(註解、單引號、尾逗號)', "{ /* 註解 */ 'A': { isActive: 'y' }, 'B': { isActive: 'n' }, } // tail", 'ref', ['A']],
            ['壞 JSON', '{bad', 'ref', []],
            ['空字串', '', 'ref', []],
            ['純空白', '   ', 'ref', []],
            ['純量: 數字', '123', 'ref', []],
            ['純量: 字串', '"x"', 'ref', []],
            ['純量: null', 'null', 'ref', []],
            ['純量: true', 'true', 'ref', []],
            ['crules 物件形式值為字串 y／n', J({ 'sys/a': 'y', 'sys/b': 'n' }), 'rule', ['sys/a']],
            ['crules 物件形式值為物件 isActive', J({ 'sys/a': { isActive: 'y' }, 'sys/b': { isActive: 'n' }, 'sys/c': {} }), 'rule', ['sys/a']],
            ['crules 物件形式值 Y／true 不算', J({ a: 'Y', b: true, c: 1 }), 'rule', []],
            ['crules 陣列形式 name＋isActive', J([{ name: 'sys/a', isActive: 'y' }, { name: 'sys/b', isActive: 'n' }]), 'rule', ['sys/a']],
            ['crules 陣列形式索引名元素(非物件/無 name 者名稱為其索引)', J(['y', { isActive: 'y' }, 'n', 5]), 'rule', ['0', '1']],
            ['crules 陣列形式 name 為數字(rule 種類以屬性鍵轉型 → 字串)', J([{ name: 5, isActive: 'y' }]), 'rule', ['5']],
            ['crules 數字鍵名(屬性鍵本即字串)', J({ 1: 'y', 2: 'n' }), 'rule', ['1']],
        ]
        for (let [title, str, kind, want] of CASES) {
            it(`RI-2 [${kind}] ${title} → ${J(want)}`, function() {
                A.deepEqual(sorted(activeNames(str, kind)), want) //[R-ACT]
            })
        }
        it('RI-2 非字串輸入(null／undefined／數字／物件／陣列) → 空集合', function() {
            for (let v of [null, undefined, 5, {}, [], true]) {
                A.deepEqual(sorted(activeNames(v, 'ref')), [], `輸入 ${String(v)}`) //[R-ACT]
                A.deepEqual(sorted(activeNames(v, 'rule')), [])
            }
        })
        it('RI-2 回傳為 Set(供 has 查詢), 且每次回傳新集合(不共用可變狀態)', function() {
            let s1 = activeNames(J({ A: OR }), 'ref')
            let s2 = activeNames(J({ A: OR }), 'ref')
            A.ok(s1 instanceof Set)
            A.notEqual(s1, s2)
            s1.add('ZZ')
            A.deepEqual(sorted(s2), ['A'])
        })
        for (let p of PROTO_NAMES) {
            it(`RI-2 原型鍵名「${p}」作為群組名稱(物件形式／陣列形式)可被正確列為啟用名稱`, function() {
                A.deepEqual(sorted(activeNames(authStr('users', [[p, 'y'], ['other', 'n']]), 'ref')), [p]) //[R-PROTO][R-ACT]
                A.deepEqual(sorted(activeNames(J([{ name: p, isActive: 'y' }]), 'ref')), [p])
            })
        }
    })


    // =================================================================
    // RI-3 newActiveNames
    // =================================================================
    describe('RI-3 newActiveNames', function() {
        //TRUTH: 同一名稱 A 於舊值／新值之狀態 → 是否為「新增之啟用引用項」(手寫真值表; 舊值 'null' 為舊列 null＝新增列)
        //  O: 舊值狀態 none／on／off／nullrow／badjson; N: 新值狀態 none／on／off
        const TRUTH = [
            ['none', 'none', false], ['none', 'on', true], ['none', 'off', false],
            ['on', 'none', false], ['on', 'on', false], ['on', 'off', false],
            ['off', 'none', false], ['off', 'on', true], ['off', 'off', false],
            ['nullrow', 'none', false], ['nullrow', 'on', true], ['nullrow', 'off', false],
            ['badjson', 'none', false], ['badjson', 'on', true], ['badjson', 'off', false],
        ]
        let rowOf = (h, state, active) => {
            if (state === 'nullrow') {
                return null
            }
            if (state === 'badjson') {
                return { id: 'h1', [HOLD[h].field]: '{bad' }
            }
            if (state === 'none') {
                return hrow(h, 'h1', [['OTHER', 'y']])
            }
            return hrow(h, 'h1', [['OTHER', 'y'], ['A', state === 'on' ? 'y' : 'n']])
        }
        for (let h of ['users', 'grups', 'pemis']) {
            for (let [o, n, want] of TRUTH) {
                it(`RI-3 [${h}] 舊值 ${o} → 新值 ${n}: 名稱 A ${want ? '算' : '不算'}新增之啟用引用項`, function() {
                    let got = newActiveNames(h, rowOf(h, o), rowOf(h, n === 'none' ? 'none' : n, n))
                    //未變更之舊引用 OTHER(舊值啟用)恆不入; A 依真值表 [R-NEW]
                    A.deepEqual(got.includes('A'), want)
                    A.equal(got.includes('OTHER'), o === 'nullrow' || o === 'badjson', 'OTHER: 舊列為 null 或舊值壞 JSON 時舊值無啟用項, 新值之 OTHER 全算新增; 否則為未變更之舊引用不入') //[R-NEW]
                })
            }
        }
        it('RI-3 只改 mode(OR→AND, 兩邊皆啟用) → 不算新增', function() {
            let got = newActiveNames('users', { cgrups: J({ A: OR }) }, { cgrups: J({ A: AND }) })
            A.deepEqual(got, []) //[R-NEW]
        })
        it('RI-3 新增停用項、移除舊引用 → 皆不算新增', function() {
            let got = newActiveNames('grups', { cpemis: J({ A: OR, B: OR }) }, { cpemis: J({ A: OR, C: OFF }) })
            A.deepEqual(got, []) //[R-NEW]
        })
        it('RI-3 多個新增: 依新值內之次序回傳、去重; 舊值啟用者不入', function() {
            let got = newActiveNames('users', { cgrups: J({ A: OR }) }, { cgrups: J({ C: OR, A: OR, B: OR, D: OFF }) })
            A.deepEqual(got, ['C', 'B']) //[R-NEW] 次序＝新值內次序
        })
        it('RI-3 新列(舊列 null)全部啟用項皆新增; 新列授權欄缺 → 無', function() {
            A.deepEqual(newActiveNames('users', null, { cgrups: J({ A: OR, B: OFF, C: OR }) }), ['A', 'C']) //[R-NEW]
            A.deepEqual(newActiveNames('users', null, { id: 'x' }), [])
            A.deepEqual(newActiveNames('users', undefined, { cgrups: '' }), [])
        })
        it('RI-3 舊列為非物件(字串／陣列)視同無舊列; 新列非物件(null／陣列／字串) → []', function() {
            A.deepEqual(newActiveNames('users', 'x', { cgrups: J({ A: OR }) }), ['A']) //[R-NEW]
            A.deepEqual(newActiveNames('users', [], { cgrups: J({ A: OR }) }), ['A'])
            for (let v of [null, undefined, [], 'x', 5]) {
                A.deepEqual(newActiveNames('users', null, v), [])
            }
        })
        it('RI-3 引用端表無授權引用欄(targets)或表名不識(含原型鍵名) → []', function() {
            for (let t of ['targets', 'zzz', '__proto__', 'constructor', null, undefined, 5]) {
                A.deepEqual(newActiveNames(t, null, { cgrups: J({ A: OR }), cpemis: J({ A: OR }), crules: J({ A: 'y' }) }), [], String(t)) //[R-TGT]
            }
        })
        it('RI-3 pemis.crules 字串值形式(y／n)與陣列形式', function() {
            A.deepEqual(newActiveNames('pemis', { crules: J({ 'sys/a': 'y' }) }, { crules: J({ 'sys/a': 'y', 'sys/b': 'y', 'sys/c': 'n' }) }), ['sys/b']) //[R-NEW]
            A.deepEqual(newActiveNames('pemis', { crules: J([{ name: 'sys/a', isActive: 'n' }]) }, { crules: J([{ name: 'sys/a', isActive: 'y' }]) }), ['sys/a'])
        })
        for (let p of PROTO_NAMES) {
            it(`RI-3 原型鍵名「${p}」: 舊值無、新值啟用 → 算新增; 舊值已啟用 → 不算`, function() {
                A.deepEqual(newActiveNames('users', { cgrups: '{}' }, { cgrups: authStr('users', [[p, 'y']]) }), [p]) //[R-PROTO][R-NEW]
                A.deepEqual(newActiveNames('users', { cgrups: authStr('users', [[p, 'y']]) }, { cgrups: authStr('users', [[p, 'y']]) }), [])
            })
        }
    })


    // =================================================================
    // RI-4 collectNewNames
    // =================================================================
    describe('RI-4 collectNewNames', function() {
        const OLD = [hrow('users', 'u1', [['A', 'y']]), hrow('users', 'u2', [['B', 'n']]), hrow('users', 'u3', [])]
        it('RI-4 新列以 id 對應舊列: 各列只算相對自己舊列之新增(跨列同名去重)', function() {
            let rowsNew = [
                hrow('users', 'u1', [['A', 'y'], ['C', 'y']]), //相對 u1: 新增 C
                hrow('users', 'u2', [['B', 'y']]), //相對 u2: B 由停用改啟用 → 新增 B
                hrow('users', 'u3', [['C', 'y']]), //相對 u3: 新增 C(與 u1 之 C 去重)
            ]
            A.deepEqual(sorted(collectNewNames({ keyTable: 'users', rowsNew, rowsOld: OLD })), ['B', 'C']) //[R-COL][R-NEW]
        })
        it('RI-4 無對應舊列(id 不在舊表、缺 id、id 為 null)者視為新增列: 全部啟用項皆新增', function() {
            let rowsNew = [
                hrow('users', 'u-new', [['X', 'y'], ['Y', 'n']]),
                { cgrups: authStr('users', [['Z', 'y']]) }, //缺 id
                { id: null, cgrups: authStr('users', [['W', 'y']]) },
            ]
            A.deepEqual(sorted(collectNewNames({ keyTable: 'users', rowsNew, rowsOld: OLD })), ['W', 'X', 'Z']) //[R-COL]
        })
        it('RI-4 數字 id 與字串 id 視為同一(伺服端寫入前之主鍵正規化)', function() {
            let rowsOld = [hrow('grups', '5', [['P', 'y']])]
            let rowsNew = [{ id: 5, cpemis: authStr('grups', [['P', 'y'], ['Q', 'y']]) }]
            A.deepEqual(sorted(collectNewNames({ keyTable: 'grups', rowsNew, rowsOld })), ['Q']) //[R-COL]
        })
        it('RI-4 舊表非陣列(null／undefined／物件／字串)視為空表: 新列全部啟用項皆新增', function() {
            let rowsNew = [hrow('users', 'u1', [['A', 'y']])]
            for (let v of [null, undefined, {}, 'x', 5]) {
                A.deepEqual(sorted(collectNewNames({ keyTable: 'users', rowsNew, rowsOld: v })), ['A']) //[R-COL]
            }
        })
        it('RI-4 新表非陣列 → 空集合; 新表為空陣列 → 空集合', function() {
            for (let v of [null, undefined, {}, 'x', 5, []]) {
                A.deepEqual(sorted(collectNewNames({ keyTable: 'users', rowsNew: v, rowsOld: OLD })), [])
            }
        })
        it('RI-4 無變更(新列＝舊列)→ 空集合; 引用端表為 targets／不識 → 空集合', function() {
            A.deepEqual(sorted(collectNewNames({ keyTable: 'users', rowsNew: OLD, rowsOld: OLD })), []) //[R-NEW]
            for (let t of ['targets', 'zzz', '__proto__']) {
                A.deepEqual(sorted(collectNewNames({ keyTable: t, rowsNew: [hrow('users', 'u1', [['Q', 'y']])], rowsOld: [] })), []) //[R-TGT]
            }
        })
        it('RI-4 舊表含非物件列／缺 id 列 → 略過不當對應來源', function() {
            let rowsOld = [null, 'x', { cgrups: authStr('users', [['A', 'y']]) }, hrow('users', 'u1', [])]
            A.deepEqual(sorted(collectNewNames({ keyTable: 'users', rowsNew: [hrow('users', 'u1', [['A', 'y']])], rowsOld })), ['A']) //[R-COL]
        })
    })


    // =================================================================
    // RI-5 idsOfName
    // =================================================================
    describe('RI-5 idsOfName', function() {
        it('RI-5 [grups] 唯一 → [id]; 不存在 → []', function() {
            let rows = [{ id: 'g1', name: 'GA' }, { id: 'g2', name: 'GB' }]
            A.deepEqual(idsOfName(rows, 'grups', 'GA'), ['g1']) //[R-IDS]
            A.deepEqual(idsOfName(rows, 'grups', 'GZ'), [])
        })
        it('RI-5 [grups] 歷史同名 2 筆、3 筆(輸入亂序、含重複 id 列) → id 陣列排序去重', function() {
            let rows = [{ id: 'g9', name: 'GA' }, { id: 'g1', name: 'GA' }, { id: 'g5', name: 'GA' }, { id: 'g1', name: 'GA' }, { id: 'g2', name: 'GB' }]
            A.deepEqual(idsOfName(rows, 'grups', 'GA'), ['g1', 'g5', 'g9']) //[R-IDS]
            A.deepEqual(idsOfName(rows.slice(0, 2), 'grups', 'GA'), ['g1', 'g9'])
        })
        it('RI-5 [grups] 名稱比對為精確 ===(大小寫、前後空白皆不同)', function() {
            let rows = [{ id: 'g1', name: 'GA' }]
            for (let v of ['ga', 'GA ', ' GA', 'G A']) {
                A.deepEqual(idsOfName(rows, 'grups', v), [], `「${v}」`) //[R-IDS]
            }
        })
        it('RI-5 [grups] id 為數字 → 取其字串形式; id 為 NaN／null／缺 → 該列不計; name 缺欄視為 \'\'; name 非字串 → 該列不計', function() {
            let rows = [{ id: 5, name: 'X' }, { id: NaN, name: 'X' }, { id: null, name: 'X' }, { name: 'X' }, { id: 'a', name: 'X' }, { id: 'b' }, { id: 'c', name: 7 }]
            A.deepEqual(idsOfName(rows, 'grups', 'X'), ['5', 'a']) //[R-IDS]
            A.deepEqual(idsOfName(rows, 'grups', ''), ['b'], '缺 name 欄視為空字串名稱') //entName: 缺欄視為 ''
            A.deepEqual(idsOfName(rows, 'grups', '7'), [], 'name 為數字之列不計')
        })
        it('RI-5 [pemis] 同 grups 之規則(name 為名)', function() {
            let rows = [{ id: 'p1', name: 'PA' }, { id: 'p2', name: 'PA' }]
            A.deepEqual(idsOfName(rows, 'pemis', 'PA'), ['p1', 'p2']) //[R-IDS]
        })
        it('RI-5 [targets] 名稱即 id: 以 id 比對, name 欄不參與; 不存在 → []', function() {
            let rows = [{ id: 'sys/a', name: 'ignored' }, { id: 'sys/b' }, { name: 'sys/c' }]
            A.deepEqual(idsOfName(rows, 'targets', 'sys/a'), ['sys/a']) //[R-IDS][R-TGT-ID]
            A.deepEqual(idsOfName(rows, 'targets', 'sys/c'), [], '只有 name 欄、無 id 者不計')
            A.deepEqual(idsOfName(rows, 'targets', 'ignored'), [])
            A.deepEqual(idsOfName(rows, 'targets', 'sys/zzz'), [])
        })
        it('RI-5 輸入非陣列(null／undefined／字串／物件) → []; 列含非物件(null／字串) → 略過', function() {
            for (let v of [null, undefined, 'abc', {}, 5]) {
                A.deepEqual(idsOfName(v, 'grups', 'x'), []) //[R-IDS]
            }
            A.deepEqual(idsOfName([null, 'x', undefined, { id: 'g1', name: 'x' }], 'grups', 'x'), ['g1'])
        })
        for (let p of PROTO_NAMES) {
            it(`RI-5 原型鍵名「${p}」作為名稱: 查得其 id, 其他名稱不誤中`, function() {
                let rows = [{ id: 'g1', name: p }, { id: 'g2', name: 'normal' }]
                A.deepEqual(idsOfName(rows, 'grups', p), ['g1']) //[R-PROTO][R-IDS]
                A.deepEqual(idsOfName(rows.slice(1), 'grups', p), [])
            })
        }
    })


    // =================================================================
    // RI-6 snapRefIds
    // =================================================================
    describe('RI-6 snapRefIds', function() {
        it('RI-6 回 Map(名稱 → id 陣列): 唯一名稱單一 id、歷史同名多筆排序去重、列內無字串名稱者略過', function() {
            let rows = [{ id: 'g3', name: 'GC' }, { id: 'g1', name: 'GA' }, { id: 'g2', name: 'GA' }, { id: 'g4', name: 5 }, { id: 'g5' }, null, { id: 'g6', name: 'GF' }]
            let m = snapRefIds('users', rows)
            A.ok(m instanceof Map)
            A.deepEqual(m.get('GA'), ['g1', 'g2']) //[R-SNAP][R-IDS]
            A.deepEqual(m.get('GC'), ['g3'])
            A.deepEqual(m.get('GF'), ['g6'])
            A.deepEqual(m.get(''), ['g5'], '缺 name 欄之列名稱視為空字串(同 findRefRows)')
            A.equal(m.has(5), false)
            A.equal(m.has('missing'), false)
            A.equal(m.size, 4)
        })
        it('RI-6 [pemis → targets] 名稱即 id', function() {
            let m = snapRefIds('pemis', [{ id: 'sys/a' }, { id: 'sys/b', description: 'x' }])
            A.deepEqual([...m.entries()].sort(), [['sys/a', ['sys/a']], ['sys/b', ['sys/b']]]) //[R-SNAP][R-TGT-ID]
        })
        it('RI-6 引用端為 targets／不識 → 空 Map; 被引用表列非陣列 → 空 Map', function() {
            for (let t of ['targets', 'zzz', '__proto__', null]) {
                A.equal(snapRefIds(t, [{ id: 'g1', name: 'GA' }]).size, 0) //[R-TGT]
            }
            for (let v of [null, undefined, 'x', {}]) {
                A.equal(snapRefIds('users', v).size, 0)
            }
        })
        for (let p of PROTO_NAMES) {
            it(`RI-6 原型鍵名「${p}」: Map 以之為鍵可查得、has 為真; 其餘原型鍵名不誤中`, function() {
                let m = snapRefIds('users', [{ id: 'g1', name: p }, { id: 'g2', name: 'normal' }, { id: 'g3', name: p }])
                A.deepEqual(m.get(p), ['g1', 'g3']) //[R-PROTO][R-SNAP]
                for (let q of PROTO_NAMES.filter((v) => v !== p)) {
                    A.equal(m.has(q), false, q)
                }
            })
        }
        it('RI-6 快照是開框當下之凍結值: 之後被引用表陣列內容改變, 已建之 Map 不變', function() {
            let rows = [{ id: 'g1', name: 'GA' }]
            let m = snapRefIds('users', rows)
            rows.push({ id: 'g9', name: 'GA' })
            rows[0].id = 'gX'
            A.deepEqual(m.get('GA'), ['g1']) //[R-SNAP]
        })
    })


    // =================================================================
    // RI-7 recordPicks
    // =================================================================
    describe('RI-7 recordPicks', function() {
        const SNAP = () => new Map([['GA', ['g1']], ['GB', ['g2']], ['GC', ['g3']], ['GD', ['g4', 'g5']]])
        it('RI-7 就地更新並回傳同一個 Map; 只記本次新增之啟用名稱(未變更舊引用、停用項、移除項皆不記)', function() {
            let picks = new Map()
            let ret = recordPicks({
                keyTable: 'users',
                strOld: authStr('users', [['GA', 'y'], ['GB', 'n']]),
                strNew: authStr('users', [['GA', 'y'], ['GB', 'y'], ['GC', 'y'], ['GD', 'n']]),
                snap: SNAP(),
                picks,
            })
            A.equal(ret, picks, '回傳同一個 Map(就地更新)') //[R-SNAP]
            A.deepEqual([...picks.entries()].sort(), [['GB', ['g2']], ['GC', ['g3']]], 'GA 為未變更舊引用不記; GB 由停用改啟用算新增; GD 停用不記')
        })
        it('RI-7 快照查無(編輯器開啟當下被引用表無此名稱) → 記空陣列(懸空引用, 伺服端須仍查無)', function() {
            let picks = new Map()
            recordPicks({ keyTable: 'users', strOld: '{}', strNew: authStr('users', [['GZ', 'y']]), snap: SNAP(), picks })
            A.deepEqual([...picks.entries()], [['GZ', []]]) //[R-SNAP]
        })
        it('RI-7 歷史同名多筆 → 記全部 id', function() {
            let picks = new Map()
            recordPicks({ keyTable: 'users', strOld: '{}', strNew: authStr('users', [['GD', 'y']]), snap: SNAP(), picks })
            A.deepEqual(picks.get('GD'), ['g4', 'g5']) //[R-SNAP][R-IDS]
        })
        it('RI-7 snap 非 Map(null／undefined／物件) → 新增名稱記空陣列', function() {
            for (let sn of [null, undefined, {}, [['GA', ['g1']]]]) {
                let picks = new Map()
                recordPicks({ keyTable: 'users', strOld: '{}', strNew: authStr('users', [['GA', 'y']]), snap: sn, picks })
                A.deepEqual([...picks.entries()], [['GA', []]]) //[R-SNAP]
            }
        })
        it('RI-7 連續回填: 已啟用之名稱第二次回填不重記(保留首次選取當時之 id); 取消啟用後再選而對應 id 不同 → 記為衝突(null, 外審 sol#1: 不得以新快照覆蓋先前之選取)', function() {
            let picks = new Map()
            let s1 = authStr('users', [['GC', 'y']])
            recordPicks({ keyTable: 'users', strOld: '{}', strNew: s1, snap: new Map([['GC', ['g3']]]), picks })
            //第二次: 該名稱已在 strOld 啟用 → 不是本次新增 → 不重記
            recordPicks({ keyTable: 'users', strOld: s1, strNew: authStr('users', [['GC', 'y'], ['GA', 'y']]), snap: new Map([['GC', ['g3-NEW']], ['GA', ['g1']]]), picks })
            A.deepEqual(picks.get('GC'), ['g3'], '保留首次選取當時') //[R-SNAP]
            A.deepEqual(picks.get('GA'), ['g1'])
            //取消後再選: strOld 無 GC → 算新增; 與先前記錄之 id 不同 → 兩次選取不可能同時與現況一致 → 衝突(null), 不以新快照覆蓋
            recordPicks({ keyTable: 'users', strOld: '{}', strNew: s1, snap: new Map([['GC', ['g3-NEW']]]), picks })
            A.equal(picks.get('GC'), null) //[R-SNAP][R-CONFLICT]
            //衝突不自行解除(其後同 id 之選取仍為衝突)
            recordPicks({ keyTable: 'users', strOld: '{}', strNew: s1, snap: new Map([['GC', ['g3-NEW']]]), picks })
            A.equal(picks.get('GC'), null)
        })
        it('RI-7 衝突: 兩列各選同名實體而選取當時對應之 id 不同(中間被引用實體被刪除後同名重建)→ 衝突; 對應 id 相同則不是衝突(外審 sol#1)', function() {
            //U1 選 G 時 G=g1; 他人刪除 G 並同名重建為 g2; U2 選 G 時 G=g2 → 記錄不得以後者覆蓋前者(否則 U1 之授權被同名新實體接管而宣告仍「相符」)
            let picks = new Map()
            let s = authStr('users', [['G', 'y']])
            recordPicks({ keyTable: 'users', strOld: '{}', strNew: s, snap: new Map([['G', ['g1']]]), picks })
            recordPicks({ keyTable: 'users', strOld: '{}', strNew: s, snap: new Map([['G', ['g2']]]), picks })
            A.equal(picks.get('G'), null, '同名兩次選取對應不同 id → 衝突') //[R-CONFLICT]
            //宣告: 衝突名稱之 ids 為 null → parseRefDecl 判格式不合(null) → countRefMismatch 視為不符(前端自檢不放行)
            let rowsOld = [{ id: 'u1', cgrups: '{}' }, { id: 'u2', cgrups: '{}' }]
            let rowsNew = [{ id: 'u1', cgrups: s }, { id: 'u2', cgrups: s }]
            let d = buildRefDecl({ keyTable: 'users', rowsNew, rowsOld, picks, refRows: [{ id: 'g2', name: 'G' }] })
            A.deepEqual(d, [{ name: 'G', ids: null }]) //[R-CONFLICT]
            A.equal(parseRefDecl(d), null)
            A.ok(countRefMismatch({ keyTable: 'users', decl: parseRefDecl(d), refRows: [{ id: 'g2', name: 'G' }] }) > 0)
            //同 id 之兩次選取(兩列、同一快照)不是衝突
            let picks2 = new Map()
            recordPicks({ keyTable: 'users', strOld: '{}', strNew: s, snap: new Map([['G', ['g2']]]), picks: picks2 })
            recordPicks({ keyTable: 'users', strOld: '{}', strNew: s, snap: new Map([['G', ['g2']]]), picks: picks2 })
            A.deepEqual(picks2.get('G'), ['g2'])
            let d2 = buildRefDecl({ keyTable: 'users', rowsNew, rowsOld, picks: picks2, refRows: [{ id: 'g2', name: 'G' }] })
            A.deepEqual(d2, [{ name: 'G', ids: ['g2'] }])
            A.equal(countRefMismatch({ keyTable: 'users', decl: parseRefDecl(d2), refRows: [{ id: 'g2', name: 'G' }] }), 0)
        })
        it('RI-7 引用端為 targets／不識 → 原樣回傳 picks 不動; picks 非 Map → 原樣回傳', function() {
            for (let t of ['targets', 'zzz']) {
                let picks = new Map([['K', ['k']]])
                let ret = recordPicks({ keyTable: t, strOld: '{}', strNew: authStr('users', [['GA', 'y']]), snap: SNAP(), picks })
                A.equal(ret, picks) //[R-TGT]
                A.deepEqual([...picks.entries()], [['K', ['k']]])
            }
            for (let pk of [null, undefined, {}, []]) {
                A.equal(recordPicks({ keyTable: 'users', strOld: '{}', strNew: authStr('users', [['GA', 'y']]), snap: SNAP(), picks: pk }), pk)
            }
        })
        it('RI-7 [pemis → crules] 字串值形式與陣列形式皆可回填', function() {
            let picks = new Map()
            recordPicks({ keyTable: 'pemis', strOld: '{}', strNew: J({ 'sys/a': 'y', 'sys/b': 'n' }), snap: new Map([['sys/a', ['sys/a']]]), picks })
            A.deepEqual([...picks.entries()], [['sys/a', ['sys/a']]]) //[R-SNAP][R-ACT]
            let picks2 = new Map()
            recordPicks({ keyTable: 'pemis', strOld: '{}', strNew: J([{ name: 'sys/c', isActive: 'y' }]), snap: new Map(), picks: picks2 })
            A.deepEqual([...picks2.entries()], [['sys/c', []]])
        })
    })


    // =================================================================
    // RI-8 buildRefDecl
    // =================================================================
    describe('RI-8 buildRefDecl', function() {
        const REFROWS = [{ id: 'g1', name: 'GA' }, { id: 'g2', name: 'GB' }, { id: 'g3', name: 'GC' }]
        const ROWS_OLD = [hrow('users', 'u1', [['GA', 'y']]), hrow('users', 'u2', [])]
        const ROWS_NEW = [hrow('users', 'u1', [['GA', 'y'], ['GC', 'y'], ['GB', 'y'], ['GD', 'n']]), hrow('users', 'u2', [])]
        it('RI-8 有選取記錄者以記錄為準(不用送出當下之被引用表); 結果依名稱排序; 未變更舊引用與停用項不入', function() {
            let picks = new Map([['GB', ['g2-at-pick']], ['GC', ['g3-at-pick']]])
            let d = buildRefDecl({ keyTable: 'users', rowsNew: ROWS_NEW, rowsOld: ROWS_OLD, picks, refRows: REFROWS })
            A.deepEqual(d, [{ name: 'GB', ids: ['g2-at-pick'] }, { name: 'GC', ids: ['g3-at-pick'] }]) //[R-DECL]
        })
        it('RI-8 無選取記錄之名稱(複製／貼上路徑)退回送出當下之被引用表', function() {
            let picks = new Map([['GB', ['g2-at-pick']]])
            let d = buildRefDecl({ keyTable: 'users', rowsNew: ROWS_NEW, rowsOld: ROWS_OLD, picks, refRows: REFROWS })
            A.deepEqual(d, [{ name: 'GB', ids: ['g2-at-pick'] }, { name: 'GC', ids: ['g3'] }]) //[R-DECL]
        })
        it('RI-8 picks 缺(null／undefined／非 Map)→ 全部退回送出當下之被引用表', function() {
            for (let pk of [null, undefined, {}, []]) {
                let d = buildRefDecl({ keyTable: 'users', rowsNew: ROWS_NEW, rowsOld: ROWS_OLD, picks: pk, refRows: REFROWS })
                A.deepEqual(d, [{ name: 'GB', ids: ['g2'] }, { name: 'GC', ids: ['g3'] }]) //[R-DECL]
            }
        })
        it('RI-8 懸空(選取當時查無 → 記錄為 []; 或無記錄且送出當下亦查無) → ids 為 []', function() {
            let rowsNew = [hrow('users', 'u1', [['GA', 'y'], ['GZ', 'y'], ['GY', 'y']]), hrow('users', 'u2', [])]
            let picks = new Map([['GZ', []]])
            let d = buildRefDecl({ keyTable: 'users', rowsNew, rowsOld: ROWS_OLD, picks, refRows: REFROWS })
            A.deepEqual(d, [{ name: 'GY', ids: [] }, { name: 'GZ', ids: [] }]) //[R-DECL][R-SNAP]
        })
        it('RI-8 選取記錄為 [](選取當時懸空)而送出當下被引用表已出現同名 → 宣告仍為 [](以選取當時為準, 伺服端比對即判出被同名新實體接管)', function() {
            let picks = new Map([['GC', []]])
            let d = buildRefDecl({ keyTable: 'users', rowsNew: ROWS_NEW, rowsOld: ROWS_OLD, picks, refRows: REFROWS })
            A.deepEqual(d.find((v) => v.name === 'GC'), { name: 'GC', ids: [] }) //[R-DECL][R-SNAP]
        })
        it('RI-8 回傳之 ids 為拷貝: 改動結果不影響 picks', function() {
            let picks = new Map([['GB', ['g2']], ['GC', ['g3']]])
            let d = buildRefDecl({ keyTable: 'users', rowsNew: ROWS_NEW, rowsOld: ROWS_OLD, picks, refRows: REFROWS })
            d[0].ids.push('HACK')
            A.deepEqual(picks.get('GB'), ['g2']) //[R-DECL]
        })
        it('RI-8 本次無新增啟用引用 → []; 引用端為 targets／不識 → []', function() {
            A.deepEqual(buildRefDecl({ keyTable: 'users', rowsNew: ROWS_OLD, rowsOld: ROWS_OLD, picks: new Map(), refRows: REFROWS }), []) //[R-DECL]
            for (let t of ['targets', 'zzz']) {
                A.deepEqual(buildRefDecl({ keyTable: t, rowsNew: ROWS_NEW, rowsOld: ROWS_OLD, picks: new Map(), refRows: REFROWS }), []) //[R-TGT]
            }
        })
        it('RI-8 新增列(舊表無該 id)之啟用引用亦入宣告', function() {
            let rowsNew = [...ROWS_OLD, hrow('users', 'u-new', [['GB', 'y']])]
            let d = buildRefDecl({ keyTable: 'users', rowsNew, rowsOld: ROWS_OLD, picks: new Map(), refRows: REFROWS })
            A.deepEqual(d, [{ name: 'GB', ids: ['g2'] }]) //[R-DECL][R-COL]
        })
        it('RI-8 [pemis → targets] 名稱即 id: 無記錄時以 targets 列之 id 為宣告', function() {
            let rowsOld = [hrow('pemis', 'p1', [])]
            let rowsNew = [hrow('pemis', 'p1', [['sys/a', 'y'], ['sys/zzz', 'y']])]
            let d = buildRefDecl({ keyTable: 'pemis', rowsNew, rowsOld, picks: null, refRows: [{ id: 'sys/a' }, { id: 'sys/b' }] })
            A.deepEqual(d, [{ name: 'sys/a', ids: ['sys/a'] }, { name: 'sys/zzz', ids: [] }]) //[R-DECL][R-TGT-ID]
        })
        it('RI-8 與 parseRefDecl 銜接: 組出之宣告必為合法格式(伺服端解析不為 null), 且解析後內容不變', function() {
            let picks = new Map([['GB', ['g2']], ['GC', ['g3']]])
            let d = buildRefDecl({ keyTable: 'users', rowsNew: ROWS_NEW, rowsOld: ROWS_OLD, picks, refRows: REFROWS })
            A.deepEqual(parseRefDecl(d), d) //[R-DECL][R-FMT-R]
        })
    })


    // =================================================================
    // RI-9 parseSubject
    // =================================================================
    describe('RI-9 parseSubject', function() {
        it('RI-9 有效 { id, name, saved } → 回正規化新物件(只含三欄, 非同一參照)', function() {
            let raw = { id: 'g1', name: 'GA', saved: true, extra: 'x' }
            let p = parseSubject(raw)
            A.deepEqual(p, { id: 'g1', name: 'GA', saved: true }) //[R-FMT-S]
            A.notEqual(p, raw)
            A.deepEqual(parseSubject({ id: 'g1', name: 'GA', saved: false }), { id: 'g1', name: 'GA', saved: false })
        })
        const BAD = [
            ['null', null], ['undefined', undefined], ['陣列', []], ['陣列含物件', [{ id: 'a', name: 'b', saved: true }]], ['字串', 'x'], ['數字', 5], ['true', true],
            ['缺 id', { name: 'b', saved: true }], ['缺 name', { id: 'a', saved: true }], ['缺 saved', { id: 'a', name: 'b' }],
            ["saved 為 'true'", { id: 'a', name: 'b', saved: 'true' }], ['saved 為 1', { id: 'a', name: 'b', saved: 1 }], ['saved 為 null', { id: 'a', name: 'b', saved: null }], ['saved 為 0', { id: 'a', name: 'b', saved: 0 }],
            ['id 空字串', { id: '', name: 'b', saved: true }], ['name 空字串', { id: 'a', name: '', saved: true }],
            ['id 為數字', { id: 5, name: 'b', saved: true }], ['name 為數字', { id: 'a', name: 5, saved: false }], ['id 為 null', { id: null, name: 'b', saved: true }], ['name 為物件', { id: 'a', name: {}, saved: true }],
        ]
        for (let [title, raw] of BAD) {
            it(`RI-9 非法「${title}」→ null`, function() {
                A.equal(parseSubject(raw), null) //[R-FMT-S]
            })
        }
    })


    // =================================================================
    // RI-10 parseRefDecl
    // =================================================================
    describe('RI-10 parseRefDecl', function() {
        it('RI-10 有效: ids 去重並排序; 空陣列合法; 多項保留各項', function() {
            A.deepEqual(parseRefDecl([{ name: 'a', ids: ['z', 'y', 'z'] }]), [{ name: 'a', ids: ['y', 'z'] }]) //[R-FMT-R]
            A.deepEqual(parseRefDecl([]), [])
            A.deepEqual(parseRefDecl([{ name: 'a', ids: [] }]), [{ name: 'a', ids: [] }])
            let multi = parseRefDecl([{ name: 'b', ids: ['2'] }, { name: 'a', ids: ['1', '0'] }])
            A.deepEqual([...multi].sort((x, y) => (x.name < y.name ? -1 : 1)), [{ name: 'a', ids: ['0', '1'] }, { name: 'b', ids: ['2'] }])
        })
        it('RI-10 回傳為新物件(只含 name、ids), 輸入多餘欄位被丟棄', function() {
            let raw = [{ name: 'a', ids: ['1'], extra: 'x' }]
            let p = parseRefDecl(raw)
            A.deepEqual(p, [{ name: 'a', ids: ['1'] }]) //[R-FMT-R]
            A.notEqual(p[0], raw[0])
        })
        it('RI-10 邊界: 5000 筆宣告、單名稱 1000 個 id 皆合法; 5001 筆、1001 個 id 非法', function() {
            let mk = (n) => Array.from({ length: n }, (_, k) => ({ name: `n${k}`, ids: [] }))
            A.notEqual(parseRefDecl(mk(5000)), null) //[R-FMT-R]
            A.equal(parseRefDecl(mk(5001)), null)
            let ids = (n) => Array.from({ length: n }, (_, k) => `i${k}`)
            A.equal(parseRefDecl([{ name: 'a', ids: ids(1000) }])[0].ids.length, 1000)
            A.equal(parseRefDecl([{ name: 'a', ids: ids(1001) }]), null)
            A.equal(parseRefDecl([{ name: 'a', ids: Array.from({ length: 1001 }, () => 'same') }]), null, '上限以原始長度計(去重前), 防以重複值灌量')
        })
        const BAD = [
            ['null', null], ['undefined', undefined], ['物件', {}], ['字串', 'x'], ['數字', 5], ['true', true], ['類陣列物件', { length: 1, 0: { name: 'a', ids: [] } }],
            ['項為 null', [null]], ['項為陣列', [[]]], ['項為字串', ['x']], ['項為數字', [5]],
            ['name 缺', [{ ids: [] }]], ['name 為數字', [{ name: 1, ids: [] }]], ['name 為 null', [{ name: null, ids: [] }]],
            ['名稱重複', [{ name: 'a', ids: [] }, { name: 'a', ids: ['1'] }]], ['原型鍵名重複', [{ name: '__proto__', ids: [] }, { name: '__proto__', ids: [] }]],
            ['ids 缺', [{ name: 'a' }]], ['ids 為字串', [{ name: 'a', ids: 'x' }]], ['ids 為物件', [{ name: 'a', ids: {} }]],
            ['ids 含數字', [{ name: 'a', ids: [1] }]], ['ids 含 null', [{ name: 'a', ids: ['1', null] }]], ['ids 含 undefined', [{ name: 'a', ids: [undefined] }]], ['ids 含陣列', [{ name: 'a', ids: [['x']] }]],
        ]
        for (let [title, raw] of BAD) {
            it(`RI-10 非法「${title}」→ null`, function() {
                A.equal(parseRefDecl(raw), null) //[R-FMT-R]
            })
        }
        for (let p of PROTO_NAMES) {
            it(`RI-10 原型鍵名「${p}」為宣告名稱可通過(重複判定以 Set 計, 不誤判)`, function() {
                A.deepEqual(parseRefDecl([{ name: p, ids: ['1'] }]), [{ name: p, ids: ['1'] }]) //[R-PROTO][R-FMT-R]
                A.deepEqual(parseRefDecl([{ name: p, ids: ['1'] }, { name: 'normal', ids: [] }]).map((v) => v.name).sort(), ['normal', p].sort(), '不同名稱之間不誤判為重複')
            })
        }
    })


    // =================================================================
    // RI-11 countRefMismatch
    // =================================================================
    describe('RI-11 countRefMismatch', function() {
        const REFROWS = [{ id: 'g1', name: 'GA' }, { id: 'g2', name: 'GB' }, { id: 'g3', name: 'GB' }]
        it('RI-11 全部相符 → 0(含歷史同名多筆須逐一相同; 查無與宣告 [] 相符)', function() {
            let decl = parseRefDecl([{ name: 'GA', ids: ['g1'] }, { name: 'GB', ids: ['g3', 'g2'] }, { name: 'GZ', ids: [] }])
            A.equal(countRefMismatch({ keyTable: 'users', decl, refRows: REFROWS }), 0) //[R-CHK1]
        })
        it('RI-11 回傳不符之名稱數(不是列數): 被刪除、id 不同、多了同名、少了同名、宣告 [] 但現已出現', function() {
            let decl = parseRefDecl([
                { name: 'GA', ids: ['g1-old'] }, //刪後同名重建(id 不同)
                { name: 'GB', ids: ['g2'] }, //新增了同名(現為 g2、g3)
                { name: 'GC', ids: ['g9'] }, //被刪除(現查無)
                { name: 'GD', ids: [] }, //相符(仍查無)
            ])
            A.equal(countRefMismatch({ keyTable: 'users', decl, refRows: REFROWS }), 3) //[R-CHK1]
            A.equal(countRefMismatch({ keyTable: 'users', decl: parseRefDecl([{ name: 'GA', ids: [] }]), refRows: REFROWS }), 1, '宣告 [](選取當時懸空)而現已出現 → 不符')
            A.equal(countRefMismatch({ keyTable: 'users', decl: parseRefDecl([{ name: 'GB', ids: ['g2', 'g3'] }]), refRows: [{ id: 'g2', name: 'GB' }] }), 1, '宣告兩個 id 而現只剩一個 → 不符')
        })
        it('RI-11 空宣告 → 0', function() {
            A.equal(countRefMismatch({ keyTable: 'users', decl: [], refRows: REFROWS }), 0) //[R-CHK1]
        })
        it('RI-11 引用端為 targets／不識 → 宣告筆數(全部視為不符)', function() {
            let decl = parseRefDecl([{ name: 'a', ids: [] }, { name: 'b', ids: [] }])
            for (let t of ['targets', 'zzz', '__proto__']) {
                A.equal(countRefMismatch({ keyTable: t, decl, refRows: [] }), 2, t) //[R-NOTGT]
            }
        })
        it('RI-11 [pemis → targets] 以 id 比對: 宣告 [id] 相符; 已刪除 → 不符; 名稱不同 → 不符', function() {
            let decl = parseRefDecl([{ name: 'sys/a', ids: ['sys/a'] }])
            A.equal(countRefMismatch({ keyTable: 'pemis', decl, refRows: [{ id: 'sys/a' }] }), 0) //[R-CHK1][R-TGT-ID]
            A.equal(countRefMismatch({ keyTable: 'pemis', decl, refRows: [{ id: 'sys/b' }] }), 1)
            A.equal(countRefMismatch({ keyTable: 'pemis', decl, refRows: [] }), 1)
        })
        it('RI-11 被引用表非陣列 → 視為查無(宣告 [] 相符, 其餘不符)', function() {
            for (let v of [null, undefined, 'x']) {
                A.equal(countRefMismatch({ keyTable: 'users', decl: [{ name: 'GA', ids: [] }], refRows: v }), 0)
                A.equal(countRefMismatch({ keyTable: 'users', decl: [{ name: 'GA', ids: ['g1'] }], refRows: v }), 1)
            }
        })
    })


    // =================================================================
    // RI-12 checkRefIdentity
    // =================================================================
    describe('RI-12 checkRefIdentity', function() {
        //對每個引用端表 h(被引用表名稱／id 依 HOLD 手寫): N[0..2] 為三個被引用實體之名稱, I[0..2] 為其 id;
        //  rowsOld: 引用端表舊列 h1(授權空)、h2(引用 N[0] 啟用); 本次寫入之列(rowsNew)相對舊列新增之啟用引用為各案手建
        for (let h of ['users', 'grups', 'pemis']) {
            let { N, I } = HOLD[h]
            let isTgt = h === 'pemis'
            let rowsOld = [hrow(h, 'h1', []), hrow(h, 'h2', [[N[0], 'y']])]
            let newRows = (...items) => [hrow(h, 'h1', items.map((n) => [n, 'y']))]
            let decl = (...pairs) => parseRefDecl(pairs.map(([name, ids]) => ({ name, ids })))
            let refRows = refRowsOf(h)
            let chk = (o) => checkRefIdentity({ keyTable: h, decl: [], rowsNew: [], rowsOld, refRows, ...o })

            it(`RI-12 [${h}] 新增啟用引用 N2 且宣告相符(現況未變) → null(通過)`, function() {
                A.equal(chk({ rowsNew: newRows(N[2]), decl: decl([N[2], [I[2]]]) }), null) //[R-CHK1][R-CHK2]
            })
            it(`RI-12 [${h}] 被引用實體已被刪除 → saveRefChanged／refChanged, n＝1`, function() {
                let rr = refRows.filter((r) => r.id !== I[2])
                A.deepEqual(chk({ rowsNew: newRows(N[2]), decl: decl([N[2], [I[2]]]), refRows: rr }), { key: 'saveRefChanged', reason: 'refChanged', n: 1 }) //[R-CHK1]
            })
            if (!isTgt) {
                it(`RI-12 [${h}] 刪除後以同名重建(id 不同) → saveRefChanged／refChanged, n＝1(授權不得被同名新實體接管)`, function() {
                    let rr = [...refRows.filter((r) => r.id !== I[2]), entRow(h, `${I[2]}-NEW`, N[2])]
                    A.deepEqual(chk({ rowsNew: newRows(N[2]), decl: decl([N[2], [I[2]]]), refRows: rr }), { key: 'saveRefChanged', reason: 'refChanged', n: 1 }) //[R-CHK1]
                })
                it(`RI-12 [${h}] 另新增了同名實體(原實體仍在, ids 變兩個) → saveRefChanged／refChanged`, function() {
                    let rr = [...refRows, entRow(h, `${I[2]}-DUP`, N[2])]
                    A.deepEqual(chk({ rowsNew: newRows(N[2]), decl: decl([N[2], [I[2]]]), refRows: rr }), { key: 'saveRefChanged', reason: 'refChanged', n: 1 }) //[R-CHK1]
                })
                it(`RI-12 [${h}] 歷史同名多筆: 宣告兩個 id(次序不拘)相符 → null; 只宣告其一 → refChanged`, function() {
                    let rr = [...refRows, entRow(h, 'h-dup', N[2])]
                    A.equal(chk({ rowsNew: newRows(N[2]), decl: decl([N[2], ['h-dup', I[2]]]), refRows: rr }), null) //[R-CHK1][R-IDS]
                    A.deepEqual(chk({ rowsNew: newRows(N[2]), decl: decl([N[2], [I[2]]]), refRows: rr }), { key: 'saveRefChanged', reason: 'refChanged', n: 1 })
                })
            }
            else {
                it(`RI-12 [${h}] targets 之 id 即名稱: 刪除後同 id 重建依定義是同一實體 → null(設計事實, R-REF-IDENTITY-01 規則 5)`, function() {
                    //被引用表於檢查當下之列仍含同 id(刪除後重建 → 現況與刪除前同 id) → 宣告 [id] 相符; 純函數層只看現況, 不知曾被刪
                    let rr = refRows.map((r) => ({ ...r, description: 'recreated' }))
                    A.equal(chk({ rowsNew: newRows(N[2]), decl: decl([N[2], [I[2]]]), refRows: rr }), null) //[R-TGT-ID][R-CHK1]
                })
            }
            it(`RI-12 [${h}] 懸空: 選取當時查無(宣告 [])且現仍查無 → null; 之後該名稱出現 → refChanged`, function() {
                let rr = refRows.filter((r) => r.id !== I[2])
                A.equal(chk({ rowsNew: newRows(N[2]), decl: decl([N[2], []]), refRows: rr }), null, '沿用既有行為: 引用先指向尚不存在之名稱') //[R-CHK1][R-SNAP]
                A.deepEqual(chk({ rowsNew: newRows(N[2]), decl: decl([N[2], []]), refRows }), { key: 'saveRefChanged', reason: 'refChanged', n: 1 }, '宣告查無而現已有 → 被新出現之實體接管')
            })
            it(`RI-12 [${h}] 漏報: 新增 N1、N2 兩個啟用引用僅宣告 N2 → saveRefChanged／refIncomplete, n＝1`, function() {
                A.deepEqual(chk({ rowsNew: newRows(N[1], N[2]), decl: decl([N[2], [I[2]]]) }), { key: 'saveRefChanged', reason: 'refIncomplete', n: 1 }) //[R-CHK2]
            })
            it(`RI-12 [${h}] 空宣告而有新增啟用引用 → refIncomplete(n＝漏報數)`, function() {
                A.deepEqual(chk({ rowsNew: newRows(N[2]), decl: [] }), { key: 'saveRefChanged', reason: 'refIncomplete', n: 1 }) //[R-CHK2]
                A.deepEqual(chk({ rowsNew: newRows(N[1], N[2]), decl: [] }), { key: 'saveRefChanged', reason: 'refIncomplete', n: 2 })
            })
            it(`RI-12 [${h}] 空宣告且無新增啟用引用(只改 mode／新增停用項／移除舊引用) → null`, function() {
                let mode = [hrow(h, 'h2', [[N[0], 'y']])] //未變更
                A.equal(chk({ rowsNew: mode, decl: [] }), null) //[R-CHK2][R-NEW]
                let off = [hrow(h, 'h1', [[N[1], 'n']])]
                A.equal(chk({ rowsNew: off, decl: [] }), null, '新增停用項不授權, 不須宣告')
                A.equal(chk({ rowsNew: [], decl: [] }), null, '本次無寫入列')
            })
            it(`RI-12 [${h}] 舊引用 N0 之實體已被替換/刪除, 但引用未變更(舊列已持久之關係) → 不驗, null`, function() {
                let rr = refRows.filter((r) => r.id !== I[0])
                A.equal(chk({ rowsNew: [hrow(h, 'h2', [[N[0], 'y']])], decl: [], refRows: rr }), null) //[R-NEW]: 未變更之舊引用不入
            })
            it(`RI-12 [${h}] 停用項改啟用(舊值停用 → 新值啟用)算新增: 未宣告 → refIncomplete; 宣告 → null`, function() {
                let ro = [hrow(h, 'h1', [[N[1], 'n']])]
                let rn = [hrow(h, 'h1', [[N[1], 'y']])]
                A.deepEqual(chk({ rowsOld: ro, rowsNew: rn, decl: [] }), { key: 'saveRefChanged', reason: 'refIncomplete', n: 1 }) //[R-NEW][R-CHK2]
                A.equal(chk({ rowsOld: ro, rowsNew: rn, decl: decl([N[1], [I[1]]]) }), null)
            })
            it(`RI-12 [${h}] 多報: 宣告了未新增之名稱——現況相符 → null; 現況不符(宣告 ids 與現況不同) → refChanged n＝1`, function() {
                A.equal(chk({ rowsNew: newRows(N[2]), decl: decl([N[2], [I[2]]], [N[1], [I[1]]]) }), null) //[R-CHK1]
                A.deepEqual(chk({ rowsNew: newRows(N[2]), decl: decl([N[2], [I[2]]], [N[1], ['ghost']]) }), { key: 'saveRefChanged', reason: 'refChanged', n: 1 })
            })
            it(`RI-12 [${h}] 先判不符再判漏報: 同時有 1 個不符與 1 個漏報 → refChanged(n＝不符數 1)`, function() {
                let rr = refRows.filter((r) => r.id !== I[2])
                A.deepEqual(chk({ rowsNew: newRows(N[1], N[2]), decl: decl([N[2], [I[2]]]), refRows: rr }), { key: 'saveRefChanged', reason: 'refChanged', n: 1 }) //[R-CHK1] 先於 [R-CHK2]
            })
            it(`RI-12 [${h}] n 為不符名稱數: 兩個名稱不符 → n＝2`, function() {
                let rr = refRows.filter((r) => r.id !== I[1] && r.id !== I[2])
                A.deepEqual(chk({ rowsNew: newRows(N[1], N[2]), decl: decl([N[1], [I[1]]], [N[2], [I[2]]]), refRows: rr }), { key: 'saveRefChanged', reason: 'refChanged', n: 2 }) //[R-CHK1]
            })
            it(`RI-12 [${h}] 新增列(舊表無該 id)帶啟用引用: 須宣告`, function() {
                let rn = [hrow(h, 'h-new', [[N[2], 'y']])]
                A.deepEqual(chk({ rowsNew: rn, decl: [] }), { key: 'saveRefChanged', reason: 'refIncomplete', n: 1 }) //[R-NEW][R-CHK2]
                A.equal(chk({ rowsNew: rn, decl: decl([N[2], [I[2]]]) }), null)
            })
            it(`RI-12 [${h}] 被引用表非陣列(讀取結果異常) → 視為查無: 宣告 [] 之名稱相符、宣告有 id 者不符`, function() {
                A.equal(chk({ rowsNew: newRows(N[2]), decl: decl([N[2], []]), refRows: null }), null) //[R-CHK1]
                A.deepEqual(chk({ rowsNew: newRows(N[2]), decl: decl([N[2], [I[2]]]), refRows: null }), { key: 'saveRefChanged', reason: 'refChanged', n: 1 })
            })
        }
        it('RI-12 引用端為 targets／不識表名 → saveIdentityFormat／refNoTarget, n＝0(不論宣告內容)', function() {
            for (let t of ['targets', 'zzz', '__proto__', null]) {
                A.deepEqual(checkRefIdentity({ keyTable: t, decl: [], rowsNew: [], rowsOld: [], refRows: [] }), { key: 'saveIdentityFormat', reason: 'refNoTarget', n: 0 }, String(t)) //[R-NOTGT]
                A.deepEqual(checkRefIdentity({ keyTable: t, decl: [{ name: 'a', ids: ['1'] }], rowsNew: [{ id: 'x' }], rowsOld: [], refRows: [{ id: 'a' }] }), { key: 'saveIdentityFormat', reason: 'refNoTarget', n: 0 })
            }
        })
    })


    // =================================================================
    // RI-13 checkSubjectIdentity
    // =================================================================
    describe('RI-13 checkSubjectIdentity', function() {
        const ROWS = [{ id: 'g1', name: 'GA' }, { id: 'g2', name: 'GB' }]
        const SUBJ = (o) => ({ id: 'g1', name: 'GA', saved: true, ...o })
        it('RI-13 同 id 同名 → null(通過)', function() {
            A.equal(checkSubjectIdentity({ subject: SUBJ(), refRows: ROWS }), null) //[R-SUBJ] ok
            A.equal(checkSubjectIdentity({ subject: SUBJ({ saved: false }), refRows: ROWS }), null, '同 id 同名時 saved 不影響')
        })
        it('RI-13 gone: 開框時已儲存之 id 現已不在(刪除) → saveSubjectChanged／gone', function() {
            A.deepEqual(checkSubjectIdentity({ subject: SUBJ(), refRows: ROWS.slice(1) }), { key: 'saveSubjectChanged', reason: 'gone' }) //[R-SUBJ]
            A.deepEqual(checkSubjectIdentity({ subject: SUBJ(), refRows: [] }), { key: 'saveSubjectChanged', reason: 'gone' })
        })
        it('RI-13 刪除後以同名重建(id 不同, saved:true) → gone', function() {
            A.deepEqual(checkSubjectIdentity({ subject: SUBJ(), refRows: [{ id: 'g1-NEW', name: 'GA' }, ROWS[1]] }), { key: 'saveSubjectChanged', reason: 'gone' }) //[R-SUBJ]
        })
        it('RI-13 renamed: 同 id 異名 → saveSubjectChanged／renamed', function() {
            A.deepEqual(checkSubjectIdentity({ subject: SUBJ(), refRows: [{ id: 'g1', name: 'GA2' }, ROWS[1]] }), { key: 'saveSubjectChanged', reason: 'renamed' }) //[R-SUBJ]
        })
        it('RI-13 taken: 開框時未儲存(saved:false)而現有同名不同 id 之實體 → saveSubjectChanged／taken; 無同名 → null', function() {
            let s = { id: 'g-unsaved', name: 'GA', saved: false }
            A.deepEqual(checkSubjectIdentity({ subject: s, refRows: ROWS }), { key: 'saveSubjectChanged', reason: 'taken' }) //[R-SUBJ]
            A.equal(checkSubjectIdentity({ subject: { ...s, name: 'GNEW' }, refRows: ROWS }), null, '沿用既有行為: 未儲存主體且無同名 → 通過')
        })
        it('RI-13 noSubject: 摘要無效(null、缺欄、空字串、非字串) → saveSubjectChanged／noSubject', function() {
            for (let s of [null, undefined, {}, { id: 'g1' }, { name: 'GA' }, { id: '', name: 'GA' }, { id: 'g1', name: '' }, { id: 5, name: 'GA' }, 'x']) {
                A.deepEqual(checkSubjectIdentity({ subject: s, refRows: ROWS }), { key: 'saveSubjectChanged', reason: 'noSubject' }, J(s)) //[R-SUBJ]
            }
        })
        it('RI-13 被引用表非陣列／含非物件列 → 視為查無(saved:true → gone)', function() {
            for (let v of [null, undefined, 'x', {}]) {
                A.deepEqual(checkSubjectIdentity({ subject: SUBJ(), refRows: v }), { key: 'saveSubjectChanged', reason: 'gone' }) //[R-SUBJ]
            }
            A.deepEqual(checkSubjectIdentity({ subject: SUBJ(), refRows: [null, 'x', 5] }), { key: 'saveSubjectChanged', reason: 'gone' })
            A.equal(checkSubjectIdentity({ subject: SUBJ(), refRows: [null, ROWS[0]] }), null)
        })
        it('RI-13 判準即 draftSync.checkSubject(格網一致): 6 主體 × 5 表況, 非 ok 之結果 reason 逐格等於 checkSubject, ok 則為 null', function() {
            let subjects = [
                { id: 'g1', name: 'GA', saved: true }, { id: 'g1', name: 'GA', saved: false }, { id: 'gX', name: 'GA', saved: true },
                { id: 'gX', name: 'GA', saved: false }, { id: 'gX', name: 'GNEW', saved: false }, { id: 'g1', name: 'GOTHER', saved: true },
            ]
            let tables = [
                [], ROWS, [{ id: 'g1', name: 'GA2' }], [{ id: 'g9', name: 'GA' }], [{ id: 'g1', name: 'GA' }, { id: 'gX', name: 'GA' }],
            ]
            let nOk = 0
            let nBad = 0
            for (let s of subjects) {
                for (let rows of tables) {
                    let want = checkSubject({ subject: s, rows })
                    let got = checkSubjectIdentity({ subject: s, refRows: rows })
                    if (want === 'ok') {
                        A.equal(got, null) //[R-SUBJ]
                        nOk++
                    }
                    else {
                        A.deepEqual(got, { key: 'saveSubjectChanged', reason: want })
                        nBad++
                    }
                }
            }
            A.ok(nOk >= 3 && nBad >= 15, `格網須同時涵蓋通過與各種拒收(防空洞): ok ${nOk}, 拒 ${nBad}`)
        })
    })


    // =================================================================
    // RI-14 原型鍵名全流程 ＋ 前端流程與伺服端判準串接
    // =================================================================
    describe('RI-14 全流程(快照 → 回填 → 組宣告 → 解析 → 檢查)', function() {
        for (let h of ['users', 'grups']) {
            for (let p of PROTO_NAMES) {
                it(`RI-14 [${h}] 原型鍵名「${p}」之群組/權限: 開框快照 → 回填 → 組宣告 → 伺服端解析 → 現況相符通過; 刪後同名重建(id 不同)被拒`, function() {
                    let refRows0 = [entRow(h, 'id-1', p), entRow(h, 'id-2', 'normal')]
                    let snap = snapRefIds(h, refRows0)
                    A.deepEqual(snap.get(p), ['id-1']) //[R-PROTO][R-SNAP]
                    let strOld = '{}'
                    let strNew = authStr(h, [[p, 'y']])
                    let picks = recordPicks({ keyTable: h, strOld, strNew, snap, picks: new Map() })
                    A.deepEqual(picks.get(p), ['id-1'])
                    let rowsOld = [hrow(h, 'h1', [])]
                    let rowsNew = [{ id: 'h1', [HOLD[h].field]: strNew }]
                    let decl = buildRefDecl({ keyTable: h, rowsNew, rowsOld, picks, refRows: refRows0 })
                    A.deepEqual(decl, [{ name: p, ids: ['id-1'] }]) //[R-DECL]
                    let parsed = parseRefDecl(JSON.parse(J(decl))) //經 JSON 往返模擬傳輸
                    A.deepEqual(parsed, decl)
                    A.equal(checkRefIdentity({ keyTable: h, decl: parsed, rowsNew, rowsOld, refRows: refRows0 }), null) //[R-CHK1] 現況未變 → 通過
                    //他人於使用者編輯期間刪除該實體並以同名重建
                    let refRows1 = [entRow(h, 'id-1-NEW', p), entRow(h, 'id-2', 'normal')]
                    A.deepEqual(checkRefIdentity({ keyTable: h, decl: parsed, rowsNew, rowsOld, refRows: refRows1 }), { key: 'saveRefChanged', reason: 'refChanged', n: 1 }) //[R-CHK1][R-PROTO]
                    //漏報: 空宣告
                    A.deepEqual(checkRefIdentity({ keyTable: h, decl: [], rowsNew, rowsOld, refRows: refRows0 }), { key: 'saveRefChanged', reason: 'refIncomplete', n: 1 }) //[R-CHK2]
                })
            }
        }
        for (let h of ['users', 'grups', 'pemis']) {
            it(`RI-14 [${h}] 前端流程與伺服端判準串接: 選取當時 ids 於送出時已不同 → 拒; 同一時刻未變 → 過`, function() {
                let { N, I } = HOLD[h]
                let refRows0 = refRowsOf(h)
                let snap = snapRefIds(h, refRows0) //開框
                let strOld = authStr(h, [[N[0], 'y']])
                let strNew = authStr(h, [[N[0], 'y'], [N[2], 'y']]) //使用者選了 N2
                let picks = recordPicks({ keyTable: h, strOld, strNew, snap, picks: new Map() })
                let rowsOld = [{ id: 'h1', [HOLD[h].field]: strOld }]
                let rowsNew = [{ id: 'h1', [HOLD[h].field]: strNew }]
                //送出前被引用表又變(N2 實體被刪後以同名重建: users／grups; pemis 之 targets 同 id 重建即同一實體)
                let refRows1 = refRows0.map((r) => (r.id === I[2] && h !== 'pemis' ? { ...r, id: `${r.id}-NEW` } : r))
                let decl = buildRefDecl({ keyTable: h, rowsNew, rowsOld, picks, refRows: refRows1 })
                A.deepEqual(decl, [{ name: N[2], ids: [I[2]] }], '宣告取選取當時(開框快照), 不取送出當下') //[R-DECL][R-SNAP]
                let r1 = checkRefIdentity({ keyTable: h, decl: parseRefDecl(decl), rowsNew, rowsOld, refRows: refRows1 })
                if (h === 'pemis') {
                    A.equal(r1, null, 'targets 同 id 重建＝同一實體 [R-TGT-ID]')
                }
                else {
                    A.deepEqual(r1, { key: 'saveRefChanged', reason: 'refChanged', n: 1 }) //[R-CHK1]
                }
                A.equal(checkRefIdentity({ keyTable: h, decl: parseRefDecl(decl), rowsNew, rowsOld, refRows: refRows0 }), null, '被引用表未變 → 通過')
            })
        }
    })

})

//案數(mocha 實跑 2026-10-23): RI-1 12、RI-2 34、RI-3 58、RI-4 7、RI-5 13、RI-6 10、RI-7 7、RI-8 10、RI-9 21、RI-10 32、RI-11 6、RI-12 47、RI-13 8、RI-14 15, 共 280 案全綠.
//變異驗證(對副本逐一注入缺陷, 確認會紅): 16 個變異中 15 個被殺, 1 個為等價變異（targets 之比對種類 rule→ref 對字串 id 結果相同）.
