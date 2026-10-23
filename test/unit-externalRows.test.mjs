//外部列受保護純函數單元測試(F-23; R-PRINCIPLE-00 原則 5「開了外部同步就以外部為主」、原則 3「遇衝突或歧義:收嚴＋提示」; 規則帳本 R-EXT-OWN-01; ADR-037; run07 U1)
//
//受測: src/js/externalRows.mjs(純函數, 前後端共用): isExternalRow／getLockFields／restoreExternalOrder／dropServerOnlyDiff／restoreServerFields／checkExternalWrite／hasExternalDiff 與常數 SERVER_FIELDS／ASSIGN_FIELD.
//
//規格來源(期望由下列規則逐格推導, 不抄實作; 規格常數見 test/tools/unitExt.mjs 之 SPEC_*, 由 src/schema/tables/*.mjs 逐表手列):
//  EX-S1 外部列判別(設計摘要「外部列」、externalRows.mjs 檔頭定案 D1): from 為非空字串者為外部列; from 為 ''、缺欄、非字串(null／數字／布林)者為後台列.
//  EX-S2 鎖定欄: 外部列之身分／結構欄 = schema 全部欄位扣除 id、from、order、指派欄(users.cgrups／grups.cpemis／pemis.crules)、伺服器管理欄(userId／timeCreate／userIdUpdate／timeUpdate).
//  EX-S3 外部列之 order 由外部擁有: 後台儲存重編 order 時, 庫內為外部列者之 order 還原為庫內值; 後台列、庫內無之列不動; 不改輸入.
//  EX-S4 外部列「僅伺服器管理欄不同」之 diff 列視為無變更(移入 same, 不回退建立者／建立時間); 後台列不適用, 內容有異者仍為 diff.
//  EX-S4b (run11 外審 sol 第 3 點) 外部列之 diff 列(內容確有改動, 如指派欄)改帶庫內之伺服器管理欄(userId／timeCreate／userIdUpdate／timeUpdate), 免持舊草稿(保留未存編輯期間外部同步已重寫該列)把建立者與建立時間回退為舊值;
//        只處理庫內為外部列者, 後台列、庫內無對應者原樣; 庫內缺該欄者(歷史列)不補、亦不採用客戶端送入之值(刪除該欄, 保留庫內值; perm-run01 外審 sol#3, 寫入契約 serverOnly); add／del／same 原樣; 不改輸入.
//  EX-S8 (perm-run01 外審 sol#2) 空值等價: 內容欄之比對(dropServerOnlyDiff 的「僅伺服器欄不同」判定、checkExternalWrite 的鎖定欄異動判定)視 null／""／缺欄為同一空值(與基準 digestRow 同口徑), 0／false 仍異於空值;
//        from 欄不適用(null 與 "" 之 from 有別: 歷史後台列). 否則基準已因空值等價而通過, 守門卻回 saveExternalRowChanged, 合法存檔被誤拒.
//  EX-S5 守門(違規整次拒收、零寫入, 不靜默忽略):
//        ①from 型別(不論 lockExternalRows): 新增列 from 須為字串(缺欄視為 ''); 修改列若把 from 改成非字串且異於庫內值 → 拒; 歷史非字串 from 原樣送回之 diff 列不拒(否則已有歷史資料之庫無法儲存);
//        ②lockExternalRows 為真: 新增列 from 須為 ''(含復活他來源之列、複製繼承、手打); 外部列不可刪; 外部列不可改 from 與鎖定欄; 後台列不可改成非空 from;
//          指派欄／order／伺服器管理欄之變更不受限; 歷史非字串 from 之列為後台列(可刪、可改鎖定欄);
//        ③lockExternalRows 為假: 只有①(舊行為).
//  EX-S6 回傳: null 通過; 否則 { key, reason, k, n, froms }: 以「新增 → 刪除 → 修改」之處理順序第一個違規決定 key／reason／k(該陣列內索引),
//        n 為違規列總數(一列只計一次), froms 為涉及之外部來源名稱(去重、至多 5 個、不含 ''; 型別違規不帶來源).
//  EX-S7 hasExternalDiff: 本次 diff 內是否有「庫內為外部列」者(決定是否須附載入基準, 外審 B.2).
//
//輸入空間表(軸 × 格數; 格數於檔尾 EX-999 以計數器核對, 宣告值與實測不符即失敗; 本檔總格數 = 各列之和):
//  A isExternalRow          from 值{'pd','',undefined 值,缺欄,null,0,false,123,{},[],' '} 11 格 ＋ 列本身非物件{null,undefined,'x',5,true} 5 格 = 16, 全測
//  B getLockFields          表4 × {精確集合, 排除項(含「鎖定欄∪排除項＝schema 全欄」), 依 keys 次序} 12 格 ＋ keys 非陣列 1 ＋ 表名未知／原型鍵名 1 ＋ 他表指派欄 1 = 15, 全測
//  C restoreExternalOrder   庫內歸屬{外部 pd,外部 ' ',後台 '',缺欄,null} × 送入 from{同庫內,pd,''} 15 格 ＋ 混合／無 order／缺 order／庫內無／非陣列／雜訊／非物件元素／不改輸入／空陣列 9 格 = 24, 全測
//  D dropServerOnlyDiff     表4 × 伺服器管理欄{單欄 4,全欄 1}=20 ＋ 表4 × 非伺服器欄逐欄(users 8、grups 5、pemis 5、targets 3)=21 ＋ 後台列{'',缺欄,null,0} 4 ＋ 陣列保持／缺欄≡''／庫內無／不改輸入 4 ＋ 空值等價 3(null／缺欄互等且雙向、0／false 異於空值、from 欄不適用) = 52, 全測
//  D2 restoreServerFields   表4 × 伺服器管理欄{單欄 4,全欄 1}=20 ＋ 外部列改指派欄(三表)3 ＋ 後台列{'',缺欄,null,0} 4 ＋ 庫內無對應／缺 id 1 ＋ 庫內缺伺服器欄(單欄／全欄／all:true 後台列)3 ＋ add／del／same 原樣與同一物件 1 ＋ 不改輸入與回傳新物件 1 = 33, 全測
//  E checkExternalWrite     E_add 新增列 from 10 格 × lock{真,假} 2 × 表 4 = 80
//                           E_del 刪除列之庫內歸屬 8 格({pd,' ',''、缺欄,null,0,123,false}) × 2 × 4 = 64
//                           E_from 修改列之 from: 舊歸屬{外部 pd 11 新值,後台 '' 10,後台缺欄 9,歷史 null 7,歷史 0 4,歷史 123 3,歷史 false 3}=47 格 × 2 × 4 = 376
//                           E_field 修改列逐欄: 表之全部非 id／from 欄(users 11、grups 8、pemis 8、targets 6)=33 × 舊歸屬{外部,後台,歷史 null} 3 × 2 = 198
//                           E_norm 值正規化 10 格(null／""／缺欄互為空值 4 格、異於空值〔"x" 變空 2 格、0、false〕4 格、型別與空白 2 格) × 表 4 = 40; E_multi 多違規之 k／n／froms／次序 10 格; E_robust 異常輸入 5 格
//  F hasExternalDiff        庫內歸屬 6 格 ＋ 混合 ＋ add／del／same 不計 ＋ 無對應／缺 id／非物件 ＋ 歸屬以庫內為準 = 10, 全測
//  刻意不測: diff 列在庫內無對應(ltdtDiffByKey 不會產生此輸入); 稀疏陣列(JSON 不會產生); keys 非陣列之 dropServerOnlyDiff(呼叫端恆給 schema keys).
//  未測: 無.
//跑法: npx mocha test/unit-externalRows.test.mjs --reporter list --timeout 30000
import assert from 'assert'
import { SERVER_FIELDS, ASSIGN_FIELD, isExternalRow, getLockFields, restoreExternalOrder, dropServerOnlyDiff, restoreServerFields, checkExternalWrite, hasExternalDiff } from '../src/js/externalRows.mjs'
import { TABLES, KEYS, SPEC_LOCK, SPEC_ASSIGN, SPEC_SERVER, MISSING, mkRow, rowWith, deepFreeze } from './tools/unitExt.mjs'


//違規代碼(語系鍵 + 原因)
const OK = null
const TYPE = { key: 'saveFromNotAllowed', reason: 'fromType' }
const ADD = { key: 'saveFromNotAllowed', reason: 'addFrom' }
const BK2EXT = { key: 'saveFromNotAllowed', reason: 'fromChanged' }
const DEL = { key: 'saveExternalRowChanged', reason: 'del' }
const EXTFROM = { key: 'saveExternalRowChanged', reason: 'fromChanged' }
const FIELD = { key: 'saveExternalRowChanged', reason: 'fieldChanged' }

//cells: 各矩陣實測格數(檔尾核對)
const cells = { A: 0, B: 0, C: 0, D: 0, D2: 0, E_add: 0, E_del: 0, E_from: 0, E_field: 0, E_norm: 0, E_multi: 0, E_robust: 0, F: 0 }

let mkR = (o = {}) => ({ add: [], del: [], diff: [], same: [], ...o })
let sortCopy = (a) => [...a].sort()
let label = (v) => (v === MISSING ? '〈缺欄〉' : (typeof v === 'string' ? JSON.stringify(v) : (typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v))))

//assertCell: 單列違規之斷言(n 為 1、k 為 0; froms 依規則: 新增與後台改外部帶「新 from」, 刪除與外部列改帶「外部 from」, 型別違規不帶)
function assertCell(res, exp, froms, msg) {
    if (exp === OK) {
        assert.strict.equal(res, null, `${msg}: 應通過(null), 實得 ${JSON.stringify(res)}`)
        return
    }
    assert.strict.notEqual(res, null, `${msg}: 應被拒(${exp.key}/${exp.reason}), 實得 null`)
    assert.strict.deepEqual(res, { key: exp.key, reason: exp.reason, k: 0, n: 1, froms }, msg)
}


describe('unit-externalRows (外部列受保護純函數, F-23, R-EXT-OWN-01)', function() {

    describe('常數', function() {

        it('EX-001 SERVER_FIELDS 恰為四個伺服器管理欄; ASSIGN_FIELD 恰為 users.cgrups／grups.cpemis／pemis.crules／targets 無(EX-S2)', function() {
            assert.strict.deepEqual(sortCopy(SERVER_FIELDS), sortCopy(SPEC_SERVER))
            assert.strict.deepEqual(ASSIGN_FIELD, SPEC_ASSIGN)
        })

    })


    describe('isExternalRow(EX-S1)', function() {

        //[標籤, 列, 期望]
        let FROM_AXIS = [
            ['from 為非空字串 pd', { id: '1', from: 'pd' }, true],
            ['from 為空字串', { id: '1', from: '' }, false],
            ['from 為 undefined 值', { id: '1', from: undefined }, false],
            ['from 缺欄', { id: '1' }, false],
            ['from 為 null(歷史非字串, 後台列)', { id: '1', from: null }, false],
            ['from 為 0', { id: '1', from: 0 }, false],
            ['from 為 false', { id: '1', from: false }, false],
            ['from 為 123', { id: '1', from: 123 }, false],
            ['from 為 {}', { id: '1', from: {} }, false],
            ['from 為 []', { id: '1', from: [] }, false],
            ['from 為單一空白(非空字串 → 外部列)', { id: '1', from: ' ' }, true],
        ]
        for (let [title, row, exp] of FROM_AXIS) {
            it(`EX-010 ${title} → ${exp}`, function() {
                cells.A++
                assert.strict.equal(isExternalRow(row), exp)
            })
        }

        for (let [title, row] of [['null', null], ['undefined', undefined], ['字串', 'x'], ['數字', 5], ['布林', true]]) {
            it(`EX-011 列本身為非物件(${title}) → false, 不拋例外`, function() {
                cells.A++
                assert.strict.equal(isExternalRow(row), false)
            })
        }

    })


    describe('getLockFields(EX-S2)', function() {

        for (let t of TABLES) {
            it(`EX-020 ${t}: 鎖定欄為精確集合 [${SPEC_LOCK[t].join(',')}]`, function() {
                cells.B++
                assert.strict.deepEqual(sortCopy(getLockFields(t, KEYS[t])), sortCopy(SPEC_LOCK[t]))
            })

            it(`EX-021 ${t}: 指派欄、id、from、order、伺服器管理欄皆不在鎖定欄內`, function() {
                cells.B++
                let lf = getLockFields(t, KEYS[t])
                let excluded = ['id', 'from', 'order', ...SPEC_SERVER, ...(SPEC_ASSIGN[t] === null ? [] : [SPEC_ASSIGN[t]])]
                for (let f of excluded) {
                    assert.strict.ok(!lf.includes(f), `${t} 之鎖定欄不應含 ${f}`)
                }
                //另一方向: 鎖定欄 ∪ 排除項 = schema 全部欄位(無遺漏)
                assert.strict.deepEqual(sortCopy([...lf, ...excluded]), sortCopy(KEYS[t]))
            })

            it(`EX-022 ${t}: 結果依傳入 keys 之次序(不重排、不去重複輸入)`, function() {
                cells.B++
                let rev = [...KEYS[t]].reverse()
                assert.strict.deepEqual(getLockFields(t, rev), [...SPEC_LOCK[t]].sort((a, b) => rev.indexOf(a) - rev.indexOf(b)))
            })
        }

        it('EX-023 keys 非陣列(undefined／null／物件／字串)→ 空陣列, 不拋例外', function() {
            cells.B++
            for (let bad of [undefined, null, { length: 2, 0: 'name' }, 'name']) {
                assert.strict.deepEqual(getLockFields('grups', bad), [])
            }
        })

        it('EX-024 表名未知或為原型鍵名(constructor／__proto__／toString)→ 無指派欄可排除, 只扣 id／from／order／伺服器管理欄, 不拋例外', function() {
            cells.B++
            let keys = ['id', 'order', 'from', 'name', 'cgrups', 'userId', 'timeUpdate']
            for (let t of ['nosuch', 'constructor', '__proto__', 'toString', undefined, null]) {
                assert.strict.deepEqual(getLockFields(t, keys), ['name', 'cgrups'], `表名 ${String(t)}`)
            }
        })

        it('EX-025 指派欄只對「該表」排除: grups 之 keys 若含 cgrups(users 之指派欄)則 cgrups 對 grups 為鎖定欄', function() {
            cells.B++
            assert.strict.deepEqual(getLockFields('grups', ['id', 'name', 'cgrups', 'cpemis']), ['name', 'cgrups'])
        })

    })


    describe('restoreExternalOrder(EX-S3)', function() {

        //庫內歸屬 × 是否還原: 庫內為外部列(任何非空字串 from)者還原; 後台列(''、缺欄、null)不還原
        let OLD_KINDS = [
            ['外部 pd', 'pd', true],
            ['外部 " "(非空白字串亦為外部)', ' ', true],
            ['後台 空字串', '', false],
            ['後台 缺 from 欄', MISSING, false],
            ['歷史 null', null, false],
        ]
        for (let [title, oldFrom, restored] of OLD_KINDS) {
            for (let [sentTitle, sentFrom] of [['送入 from 同庫內', oldFrom], ['送入 from 為 pd', 'pd'], ['送入 from 為空字串', '']]) {
                it(`EX-030 庫內${title}、${sentTitle}: order ${restored ? '還原為庫內值 10' : '維持送入值 3'}(歸屬以庫內為準, 與送入 from 無關)`, function() {
                    cells.C++
                    let old = [rowWith(mkRow('grups', { id: 'g1', order: 10 }), { from: oldFrom })]
                    let rows = [rowWith(mkRow('grups', { id: 'g1', order: 3 }), { from: sentFrom })]
                    deepFreeze(old)
                    deepFreeze(rows)
                    let out = restoreExternalOrder(rows, old)
                    assert.strict.equal(out.length, 1)
                    assert.strict.equal(out[0].order, restored ? 10 : 3)
                    assert.strict.deepEqual({ ...out[0], order: 0 }, { ...rows[0], order: 0 }, '其餘欄位不動')
                })
            }
        }

        it('EX-031 混合: 外部列還原、後台列與庫內無之新列維持送入之 order(後台重編 k+1), 輸出順序與長度同輸入', function() {
            cells.C++
            let old = [
                mkRow('users', { id: 'e1', order: 10, from: 'pd' }),
                mkRow('users', { id: 'b1', order: 2, from: '' }),
                mkRow('users', { id: 'e2', order: 30, from: 'pe' }),
            ]
            let rows = [
                mkRow('users', { id: 'b1', order: 1 }),
                mkRow('users', { id: 'e1', order: 2 }),
                mkRow('users', { id: 'new', order: 3 }),
                mkRow('users', { id: 'e2', order: 4 }),
            ]
            deepFreeze(old)
            deepFreeze(rows)
            let out = restoreExternalOrder(rows, old)
            assert.strict.deepEqual(out.map((r) => [r.id, r.order]), [['b1', 1], ['e1', 10], ['new', 3], ['e2', 30]])
            assert.strict.notEqual(out, rows, '回傳新陣列')
        })

        it('EX-032 庫內外部列無 order 欄 → 送入之 order 不動(無從還原), 不憑空補鍵', function() {
            cells.C++
            let old = [rowWith(mkRow('grups', { id: 'g1', from: 'pd' }), { order: MISSING })]
            let rows = [mkRow('grups', { id: 'g1', order: 7 })]
            deepFreeze(old)
            deepFreeze(rows)
            assert.strict.equal(restoreExternalOrder(rows, old)[0].order, 7)
        })

        it('EX-033 送入列缺 order 欄而庫內為外部列 → 補為庫內值(仍以庫內為準)', function() {
            cells.C++
            let old = [mkRow('grups', { id: 'g1', order: 10, from: 'pd' })]
            let rows = [rowWith(mkRow('grups', { id: 'g1' }), { order: MISSING })]
            assert.strict.equal(restoreExternalOrder(rows, old)[0].order, 10)
        })

        it('EX-034 庫內無該 id → 不動; 庫內有同 id 但送入列缺 id → 不動', function() {
            cells.C++
            let old = [mkRow('grups', { id: 'g1', order: 10, from: 'pd' })]
            let rows = [mkRow('grups', { id: 'gX', order: 5 }), rowWith(mkRow('grups', { order: 6 }), { id: MISSING })]
            assert.strict.deepEqual(restoreExternalOrder(rows, old).map((r) => r.order), [5, 6])
        })

        it('EX-035 ltdtOld 非陣列(undefined／null／物件)→ 視為庫內無任何列, 原樣回傳, 不拋例外', function() {
            cells.C++
            let rows = [mkRow('grups', { id: 'g1', order: 5 })]
            for (let bad of [undefined, null, {}, 'x']) {
                assert.strict.deepEqual(restoreExternalOrder(rows, bad), rows)
            }
        })

        it('EX-036 庫內列含非物件、無字串 id 者 → 忽略, 不影響其他列', function() {
            cells.C++
            let old = [null, 'x', 5, mkRow('grups', { id: 7, order: 99, from: 'pd' }), mkRow('grups', { id: 'g1', order: 10, from: 'pd' })]
            let rows = [mkRow('grups', { id: 'g1', order: 1 })]
            assert.strict.equal(restoreExternalOrder(rows, old)[0].order, 10)
        })

        it('EX-037 送入列含非物件元素(null／字串)→ 原樣保留, 不拋例外', function() {
            cells.C++
            let old = [mkRow('grups', { id: 'g1', order: 10, from: 'pd' })]
            assert.strict.deepEqual(restoreExternalOrder([null, 'x', mkRow('grups', { id: 'g1', order: 1 })], old).map((r) => (r !== null && typeof r === 'object' ? r.order : r)), [null, 'x', 10])
        })

        it('EX-038 不改輸入: 凍結之 rows／ltdtOld(含列物件)呼叫後內容不變, 被還原之列為新物件', function() {
            cells.C++
            let old = deepFreeze([mkRow('grups', { id: 'g1', order: 10, from: 'pd' })])
            let rows = deepFreeze([mkRow('grups', { id: 'g1', order: 1 })])
            let out = restoreExternalOrder(rows, old)
            assert.strict.equal(rows[0].order, 1)
            assert.strict.equal(old[0].order, 10)
            assert.strict.notEqual(out[0], rows[0])
        })

        it('EX-039 空陣列 → 空陣列', function() {
            cells.C++
            assert.strict.deepEqual(restoreExternalOrder([], [mkRow('grups', { id: 'g1', from: 'pd' })]), [])
        })

    })


    describe('dropServerOnlyDiff(EX-S4)', function() {

        let ext = (t, o = {}) => mkRow(t, { id: 'e1', from: 'pd', ...o })

        for (let t of TABLES) {
            //伺服器管理欄: 單欄與全欄
            let serverCases = [...SPEC_SERVER.map((f) => [f, [f]]), ['四欄同時', SPEC_SERVER]]
            for (let [title, fs] of serverCases) {
                it(`EX-040 ${t}: 外部列僅伺服器管理欄(${title})不同 → 移入 same, diff 不含(不回退建立者／建立時間)`, function() {
                    cells.D++
                    let old = [ext(t)]
                    let row = ext(t, Object.fromEntries(fs.map((f) => [f, `stale-${f}`])))
                    let r = { add: [], del: [], diff: [row], same: [] }
                    deepFreeze(old)
                    deepFreeze(r)
                    let out = dropServerOnlyDiff({ keys: KEYS[t], r, ltdtOld: old })
                    assert.strict.deepEqual(out.diff, [])
                    assert.strict.deepEqual(out.same, [row])
                })
            }

            //非伺服器欄逐欄: 外部列任一內容欄(含 order、from)不同 → 仍為 diff
            for (let f of KEYS[t].filter((k) => k !== 'id' && !SPEC_SERVER.includes(k))) {
                it(`EX-041 ${t}: 外部列 ${f} 不同(非伺服器管理欄)→ 仍為 diff, 不移入 same`, function() {
                    cells.D++
                    let old = [ext(t)]
                    let row = ext(t, { [f]: f === 'order' ? 99 : `changed-${f}` })
                    let out = dropServerOnlyDiff({ keys: KEYS[t], r: { add: [], del: [], diff: [row], same: [] }, ltdtOld: old })
                    assert.strict.deepEqual(out.diff, [row])
                    assert.strict.deepEqual(out.same, [])
                })
            }
        }

        //後台列不論: 僅伺服器管理欄不同亦留 diff
        for (let [title, from] of [['空字串', ''], ['缺欄', MISSING], ['null', null], ['0', 0]]) {
            it(`EX-042 後台列(from ${title})僅伺服器管理欄不同 → 仍為 diff(後台列之 diff 判定不變)`, function() {
                cells.D++
                let base = rowWith(mkRow('grups', { id: 'b1' }), { from })
                let row = rowWith(base, { timeUpdate: 'newer', userId: 'other' })
                let out = dropServerOnlyDiff({ keys: KEYS.grups, r: { add: [], del: [], diff: [row], same: [] }, ltdtOld: [base] })
                assert.strict.deepEqual(out.diff, [row])
                assert.strict.deepEqual(out.same, [])
            })
        }

        it('EX-043 add／del 原樣; same 先保留原有、再依 diff 之次序附加被移入者; 其餘 diff 保持相對次序', function() {
            cells.D++
            let o1 = mkRow('grups', { id: 'e1', from: 'pd' })
            let o2 = mkRow('grups', { id: 'b2', from: '' })
            let o3 = mkRow('grups', { id: 'e3', from: 'pe' })
            let o4 = mkRow('grups', { id: 'e4', from: 'pd' })
            let add = [mkRow('grups', { id: 'a1' })]
            let del = [mkRow('grups', { id: 'd1', from: 'pd' })]
            let same0 = [mkRow('grups', { id: 's0' })]
            let d1 = rowWith(o1, { userId: 'x' }) //僅伺服器欄 → same
            let d2 = rowWith(o2, { userId: 'x' }) //後台 → diff
            let d3 = rowWith(o3, { name: 'changed' }) //外部且內容異 → diff
            let d4 = rowWith(o4, { timeCreate: 'x' }) //僅伺服器欄 → same
            let r = deepFreeze({ add, del, diff: [d1, d2, d3, d4], same: same0 })
            let out = dropServerOnlyDiff({ keys: KEYS.grups, r, ltdtOld: deepFreeze([o1, o2, o3, o4]) })
            assert.strict.deepEqual(out.add, add)
            assert.strict.deepEqual(out.del, del)
            assert.strict.deepEqual(out.diff, [d2, d3])
            assert.strict.deepEqual(out.same, [...same0, d1, d4])
        })

        it('EX-044 缺欄與 "" 視為同一內容(外部列之 description 缺欄 vs 庫內 "")→ 視為僅伺服器欄不同而移入 same', function() {
            cells.D++
            let old = [ext('grups', { description: '' })]
            let row = rowWith(ext('grups', { description: '' }), { description: MISSING, timeUpdate: 'newer' })
            let out = dropServerOnlyDiff({ keys: KEYS.grups, r: { add: [], del: [], diff: [row], same: [] }, ltdtOld: old })
            assert.strict.deepEqual(out.diff, [])
        })

        it('EX-044b 空值等價(外審 sol#2): 外部列 description 於庫內與送入之間 null／""／缺欄任意互換(雙向)+ 伺服器欄不同 → 皆移入 same(不重寫, 庫內原表示不被改成 "")', function() {
            cells.D++
            let reps = [['', null], ['', MISSING], [null, ''], [null, MISSING], [MISSING, null], [MISSING, '']]
            for (let [ov, nv] of reps) {
                let old = [rowWith(ext('grups'), { description: ov })]
                let row = rowWith(rowWith(ext('grups'), { description: nv }), { timeUpdate: 'newer' })
                let out = dropServerOnlyDiff({ keys: KEYS.grups, r: { add: [], del: [], diff: [row], same: [] }, ltdtOld: old, all: true })
                assert.strict.deepEqual(out.diff, [], `庫內 ${label(ov)} → 送入 ${label(nv)} 應視為無內容變更`)
                assert.strict.deepEqual(out.same, [row])
            }
        })

        it('EX-044c 空值等價不吞真實變更: 庫內為空值而送入 0／false／非空字串、或庫內非空而送入空值 → 仍為 diff', function() {
            cells.D++
            let reps = [['', 0], ['', false], [null, 0], [null, false], ['', 'x'], ['x', null], ['x', ''], [0, null], [false, '']]
            for (let [ov, nv] of reps) {
                let old = [rowWith(ext('grups'), { description: ov })]
                let row = rowWith(ext('grups'), { description: nv })
                let out = dropServerOnlyDiff({ keys: KEYS.grups, r: { add: [], del: [], diff: [row], same: [] }, ltdtOld: old, all: true })
                assert.strict.deepEqual(out.diff, [row], `庫內 ${label(ov)} → 送入 ${label(nv)} 應仍為 diff`)
                assert.strict.deepEqual(out.same, [])
            }
        })

        it('EX-044d from 欄不適用空值等價: 庫內 from 為 null(歷史後台列)而送入 ""(或反之)→ 仍為 diff(all: true)', function() {
            cells.D++
            for (let [ov, nv] of [[null, ''], ['', null], [null, MISSING], [MISSING, null]]) {
                let old = [rowWith(mkRow('grups', { id: 'b1' }), { from: ov })]
                let row = rowWith(mkRow('grups', { id: 'b1' }), { from: nv })
                let out = dropServerOnlyDiff({ keys: KEYS.grups, r: { add: [], del: [], diff: [row], same: [] }, ltdtOld: old, all: true })
                //from 欄沿用 normV(缺欄≡''; null 與 ''／缺欄有別)
                assert.strict.equal(out.diff.length, 1, `from ${label(ov)} → ${label(nv)} 應仍為 diff`)
            }
        })

        it('EX-045 庫內無對應 id 之 diff 列／diff 列缺 id → 留 diff, 不拋例外', function() {
            cells.D++
            let old = [ext('grups')]
            let r1 = rowWith(ext('grups', { id: 'zz' }), { userId: 'x' })
            let r2 = rowWith(ext('grups'), { id: MISSING })
            let out = dropServerOnlyDiff({ keys: KEYS.grups, r: { add: [], del: [], diff: [r1, r2], same: [] }, ltdtOld: old })
            assert.strict.deepEqual(out.diff, [r1, r2])
        })

        it('EX-046 不改輸入(凍結之 r／ltdtOld 不拋錯)且回傳新物件', function() {
            cells.D++
            let o = ext('grups')
            let r = deepFreeze({ add: [], del: [], diff: [rowWith(o, { userId: 'x' })], same: [] })
            let out = dropServerOnlyDiff({ keys: KEYS.grups, r, ltdtOld: deepFreeze([o]) })
            assert.strict.notEqual(out, r)
            assert.strict.equal(r.diff.length, 1)
            assert.strict.equal(out.diff.length, 0)
        })

    })


    describe('restoreServerFields(EX-S4b)', function() {

        let ext = (t, o = {}) => mkRow(t, { id: 'e1', from: 'pd', ...o })
        let SRV_OLD = { userId: 'sync-new', timeCreate: 'T-new', userIdUpdate: 'sync-new', timeUpdate: 'T-new' }
        let SRV_STALE = { userId: 'sync-old', timeCreate: 'T-old', userIdUpdate: 'sync-old', timeUpdate: 'T-old' }

        for (let t of TABLES) {
            //伺服器管理欄: 單欄與全欄(草稿持舊值, 庫內為較新值)
            let serverCases = [...SPEC_SERVER.map((f) => [f, [f]]), ['四欄同時', SPEC_SERVER]]
            for (let [title, fs] of serverCases) {
                it(`EX-047 ${t}: 外部列內容有改動(description)且伺服器管理欄(${title})持舊值 → diff 列改帶庫內較新之值, 其餘欄(含被改之內容)不動`, function() {
                    cells.D2++
                    let old = [ext(t, SRV_OLD)]
                    let row = ext(t, { ...Object.fromEntries(fs.map((f) => [f, SRV_STALE[f]])), description: 'edited' })
                    let r = deepFreeze({ add: [], del: [], diff: [row], same: [] })
                    let out = restoreServerFields({ r, ltdtOld: deepFreeze(old) })
                    assert.strict.equal(out.diff.length, 1)
                    for (let f of SPEC_SERVER) {
                        assert.strict.equal(out.diff[0][f], SRV_OLD[f], `${t}.${f} 應為庫內值`)
                    }
                    assert.strict.equal(out.diff[0].description, 'edited', '被改之內容欄不得被覆蓋')
                    assert.strict.equal(out.diff[0].id, 'e1')
                })
            }
        }

        for (let [t, f] of [['users', 'cgrups'], ['grups', 'cpemis'], ['pemis', 'crules']]) {
            it(`EX-048 ${t}: 外部列改指派欄 ${f}(後台唯一可改之欄)且伺服器欄持舊值 → 指派欄為草稿值、伺服器欄為庫內值`, function() {
                cells.D2++
                let old = [ext(t, SRV_OLD)]
                let row = ext(t, { ...SRV_STALE, [f]: '{"X":"y"}' })
                let out = restoreServerFields({ r: { add: [], del: [], diff: [row], same: [] }, ltdtOld: old })
                assert.strict.equal(out.diff[0][f], '{"X":"y"}')
                assert.strict.equal(out.diff[0].userId, 'sync-new')
                assert.strict.equal(out.diff[0].timeCreate, 'T-new')
            })
        }

        for (let [title, from] of [['空字串', ''], ['缺欄', MISSING], ['null', null], ['0', 0]]) {
            it(`EX-049 後台列(from ${title})之 diff 原樣(同一物件, 伺服器管理欄不動; 後台列寫入行為不變)`, function() {
                cells.D2++
                let base = rowWith(mkRow('grups', { id: 'b1', ...SRV_OLD }), { from })
                let row = rowWith(base, { ...SRV_STALE, description: 'edited' })
                let out = restoreServerFields({ r: { add: [], del: [], diff: [row], same: [] }, ltdtOld: [base] })
                assert.strict.equal(out.diff[0], row)
                assert.strict.equal(out.diff[0].userId, 'sync-old')
            })
        }

        it('EX-050 庫內無對應 id／diff 列缺 id → 原樣(同一物件), 不拋例外', function() {
            cells.D2++
            let old = [ext('grups', SRV_OLD)]
            let r1 = ext('grups', { id: 'zz', ...SRV_STALE })
            let r2 = rowWith(ext('grups', SRV_STALE), { id: MISSING })
            let out = restoreServerFields({ r: { add: [], del: [], diff: [r1, r2], same: [] }, ltdtOld: old })
            assert.strict.equal(out.diff[0], r1)
            assert.strict.equal(out.diff[1], r2)
        })

        it('EX-051 庫內該外部列缺某伺服器管理欄 → 不補(不憑空寫入 undefined)、亦不採用客戶端送入之值(刪除該欄, 保留庫內值＝仍無該欄; perm-run01 外審 sol#3)', function() {
            cells.D2++
            let o = rowWith(ext('grups', SRV_OLD), { timeCreate: MISSING })
            let row = ext('grups', { ...SRV_STALE, description: 'edited' })
            let out = restoreServerFields({ r: { add: [], del: [], diff: [row], same: [] }, ltdtOld: [o] })
            assert.strict.equal(out.diff[0].userId, 'sync-new')
            assert.strict.equal(Object.prototype.hasOwnProperty.call(out.diff[0], 'timeCreate'), false, '庫內缺欄者不補、客戶端偽造值不採用(該欄不存在)')
            assert.strict.equal(out.diff[0].description, 'edited', '被改之內容欄照常')
            assert.strict.equal(row.timeCreate, 'T-old', '輸入列不被改')
        })

        it('EX-051b 庫內歷史列四個伺服器管理欄全缺 → 客戶端送入之四欄皆不採用(全部不存在)', function() {
            cells.D2++
            let o = rowWith(ext('grups'), Object.fromEntries(SPEC_SERVER.map((f) => [f, MISSING])))
            let row = ext('grups', { ...SRV_STALE, description: 'edited' })
            let out = restoreServerFields({ r: { add: [], del: [], diff: [row], same: [] }, ltdtOld: [o] })
            for (let f of SPEC_SERVER) {
                assert.strict.equal(Object.prototype.hasOwnProperty.call(out.diff[0], f), false, `${f} 不採用客戶端值`)
            }
            assert.strict.equal(out.diff[0].description, 'edited')
        })

        it('EX-051c all: true 時後台列亦然: 庫內後台列缺伺服器管理欄 → 客戶端送入之值不採用; 預設(all 未給)後台列原樣(同一物件)', function() {
            cells.D2++
            let base = rowWith(mkRow('grups', { id: 'b1', from: '' }), Object.fromEntries(SPEC_SERVER.map((f) => [f, MISSING])))
            let row = rowWith(base, { ...SRV_STALE, description: 'edited' })
            let r = { add: [], del: [], diff: [row], same: [] }
            let all = restoreServerFields({ r, ltdtOld: [base], all: true })
            for (let f of SPEC_SERVER) {
                assert.strict.equal(Object.prototype.hasOwnProperty.call(all.diff[0], f), false, `${f} 不採用客戶端值`)
            }
            let def = restoreServerFields({ r, ltdtOld: [base] })
            assert.strict.equal(def.diff[0], row, '預設只處理外部列, 後台列原樣')
        })

        it('EX-052 add／del／same 原樣(同一陣列)', function() {
            cells.D2++
            let add = [mkRow('grups', { id: 'a1' })]
            let del = [mkRow('grups', { id: 'd1', from: 'pd' })]
            let same = [mkRow('grups', { id: 's1', from: 'pd' })]
            let out = restoreServerFields({ r: { add, del, diff: [], same }, ltdtOld: [ext('grups', SRV_OLD)] })
            assert.strict.equal(out.add, add)
            assert.strict.equal(out.del, del)
            assert.strict.equal(out.same, same)
        })

        it('EX-053 不改輸入(凍結之 r／ltdtOld 不拋錯)且回傳新物件與新 diff 列', function() {
            cells.D2++
            let o = ext('grups', SRV_OLD)
            let row = ext('grups', { ...SRV_STALE, description: 'edited' })
            let r = deepFreeze({ add: [], del: [], diff: [row], same: [] })
            let out = restoreServerFields({ r, ltdtOld: deepFreeze([o]) })
            assert.strict.notEqual(out, r)
            assert.strict.notEqual(out.diff[0], row)
            assert.strict.equal(row.userId, 'sync-old', '輸入列不被改')
        })

    })


    describe('checkExternalWrite: 新增列(EX-S5①②)', function() {

        //[標籤, 新增列之 from(MISSING＝缺欄), lock 為真之期望, lock 為假之期望]
        const ADD_CELLS = [
            ['空字串', '', OK, OK],
            ['缺 from 欄(視為 "")', MISSING, OK, OK],
            ['非空 pd(含復活他來源之列、複製繼承、手打)', 'pd', ADD, OK],
            ['單一空白(非空字串)', ' ', ADD, OK],
            ['null', null, TYPE, TYPE],
            ['0', 0, TYPE, TYPE],
            ['false', false, TYPE, TYPE],
            ['123', 123, TYPE, TYPE],
            ['{}', {}, TYPE, TYPE],
            ['[]', [], TYPE, TYPE],
        ]
        for (let t of TABLES) {
            for (let [title, nf, expLock, expFree] of ADD_CELLS) {
                for (let [lock, exp] of [[true, expLock], [false, expFree]]) {
                    it(`EX-050 ${t} 新增列 from=${title}, lockExternalRows=${lock} → ${exp === OK ? '通過' : `${exp.key}/${exp.reason}`}`, function() {
                        cells.E_add++
                        let row = rowWith(mkRow(t, { id: 'n1' }), { from: nf })
                        let r = deepFreeze(mkR({ add: [row] }))
                        let res = checkExternalWrite({ keyTable: t, keys: KEYS[t], r, ltdtOld: [mkRow(t, { id: 'e1', from: 'pd' })], lockExternalRows: lock })
                        assertCell(res, exp, exp === ADD ? [nf] : [], `${t}/${label(nf)}/lock=${lock}`)
                    })
                }
            }
        }

    })


    describe('checkExternalWrite: 刪除列(EX-S5②)', function() {

        //[標籤, 被刪之庫內列 from, lock 為真之期望, lock 為假之期望]: 非字串 from 必為後台寫入, 屬後台列可刪
        const DEL_CELLS = [
            ['外部 pd', 'pd', DEL, OK],
            ['外部 " "(非空白字串亦為外部)', ' ', DEL, OK],
            ['後台 空字串', '', OK, OK],
            ['後台 缺 from 欄', MISSING, OK, OK],
            ['歷史 null', null, OK, OK],
            ['歷史 0', 0, OK, OK],
            ['歷史 123', 123, OK, OK],
            ['歷史 false', false, OK, OK],
        ]
        for (let t of TABLES) {
            for (let [title, oFrom, expLock, expFree] of DEL_CELLS) {
                for (let [lock, exp] of [[true, expLock], [false, expFree]]) {
                    it(`EX-060 ${t} 刪除庫內${title}列, lockExternalRows=${lock} → ${exp === OK ? '通過' : `${exp.key}/${exp.reason}`}`, function() {
                        cells.E_del++
                        let old = rowWith(mkRow(t, { id: 'd1' }), { from: oFrom })
                        let r = deepFreeze(mkR({ del: [old] }))
                        let res = checkExternalWrite({ keyTable: t, keys: KEYS[t], r, ltdtOld: [old], lockExternalRows: lock })
                        assertCell(res, exp, exp === DEL ? [oFrom] : [], `${t}/${label(oFrom)}/lock=${lock}`)
                    })
                }
            }
        }

    })


    describe('checkExternalWrite: 修改列之 from(EX-S5①②; 歷史非字串原樣送回不拒)', function() {

        const NONSTR = [['null', null], ['0', 0], ['false', false], ['123', 123], ['{}', {}], ['[]', []]]
        const asType = (list) => list.map(([title, v]) => [title, v, TYPE, TYPE])

        //DIFF_FROM: [舊歸屬標籤, 舊 from, [[新 from 標籤, 新 from, lock 真之期望, lock 假之期望], ...], 期望之 froms 規則]
        //froms 規則: 'old' 帶庫內外部來源; 'new' 帶新 from; 型別違規不帶(自動)
        const DIFF_FROM = [
            ['外部 pd', 'pd', [
                ['同為 pd', 'pd', OK, OK],
                ['改為 pe', 'pe', EXTFROM, OK],
                ['改為空字串', '', EXTFROM, OK],
                ['改為缺欄', MISSING, EXTFROM, OK],
                ['改為單一空白', ' ', EXTFROM, OK],
                ...asType(NONSTR), //改為非字串: 型別違規優先於「改外部列之 from」
            ], 'old'],
            ['後台 空字串', '', [
                ['同為空字串', '', OK, OK],
                ['缺欄', MISSING, OK, OK],
                ['改為 pd(後台列不可改成非空 from)', 'pd', BK2EXT, OK],
                ['改為單一空白', ' ', BK2EXT, OK],
                ...asType(NONSTR),
            ], 'new'],
            ['後台 缺 from 欄', MISSING, [
                ['缺欄', MISSING, OK, OK],
                ['空字串', '', OK, OK],
                ['改為 pd', 'pd', BK2EXT, OK],
                ...asType(NONSTR),
            ], 'new'],
            ['歷史 null', null, [
                ['原樣 null', null, OK, OK],
                ['缺欄(視為 "")', MISSING, OK, OK],
                ['改為空字串(歷史 null 改成 "")', '', OK, OK],
                ['改為 pd', 'pd', BK2EXT, OK],
                ['改為 0', 0, TYPE, TYPE],
                ['改為 false', false, TYPE, TYPE],
                ['改為 {}', {}, TYPE, TYPE],
            ], 'new'],
            ['歷史 0', 0, [
                ['原樣 0', 0, OK, OK],
                ['改為 null', null, TYPE, TYPE],
                ['改為空字串', '', OK, OK],
                ['改為 pd', 'pd', BK2EXT, OK],
            ], 'new'],
            ['歷史 123', 123, [
                ['原樣 123', 123, OK, OK],
                ['改為字串 "123"(非空字串)', '123', BK2EXT, OK],
                ['改為空字串', '', OK, OK],
            ], 'new'],
            ['歷史 false', false, [
                ['原樣 false', false, OK, OK],
                ['改為 null', null, TYPE, TYPE],
                ['改為空字串', '', OK, OK],
            ], 'new'],
        ]

        for (let t of TABLES) {
            for (let [oTitle, oFrom, list, who] of DIFF_FROM) {
                it(`EX-070 ${t} 庫內${oTitle}: 新 from 逐格(lockExternalRows 真／假)`, function() {
                    let old = rowWith(mkRow(t, { id: 'r1', order: 1 }), { from: oFrom })
                    let other = mkRow(t, { id: 'r2', from: 'pd' })
                    for (let [nTitle, nf, expLock, expFree] of list) {
                        for (let [lock, exp] of [[true, expLock], [false, expFree]]) {
                            cells.E_from++
                            let row = rowWith(old, { from: nf, order: 2 }) //order 變更不受限, 與 from 並存以貼近實況
                            let r = deepFreeze(mkR({ diff: [row] }))
                            let res = checkExternalWrite({ keyTable: t, keys: KEYS[t], r, ltdtOld: [old, other], lockExternalRows: lock })
                            let froms = exp === OK || exp === TYPE ? [] : (who === 'old' ? [oFrom] : [nf])
                            assertCell(res, exp, froms, `${t}/庫內${oTitle}→${nTitle}/lock=${lock}`)
                        }
                    }
                })
            }
        }

    })


    describe('checkExternalWrite: 修改列逐欄(EX-S2、EX-S5②)', function() {

        //舊列歸屬 × 欄位: 外部列在 lock 為真時只有「鎖定欄」之變更被拒, 指派欄／order／伺服器管理欄之變更放行; 後台列與歷史 null 之列任何欄位變更皆放行
        const OLD_KINDS = [['外部 pd', 'pd'], ['後台 空字串', ''], ['歷史 null', null]]
        for (let t of TABLES) {
            for (let [oTitle, oFrom] of OLD_KINDS) {
                for (let f of KEYS[t].filter((k) => k !== 'id' && k !== 'from')) {
                    for (let lock of [true, false]) {
                        let isLock = SPEC_LOCK[t].includes(f)
                        let exp = (oFrom === 'pd' && lock && isLock) ? FIELD : OK
                        it(`EX-080 ${t} 庫內${oTitle}列改 ${f}(${isLock ? '鎖定欄' : (f === SPEC_ASSIGN[t] ? '指派欄' : (f === 'order' ? 'order' : '伺服器管理欄'))}), lockExternalRows=${lock} → ${exp === OK ? '通過' : 'fieldChanged'}`, function() {
                            cells.E_field++
                            let old = rowWith(mkRow(t, { id: 'r1' }), { from: oFrom })
                            let row = rowWith(old, { [f]: f === 'order' ? 99 : `changed-${f}` })
                            let r = deepFreeze(mkR({ diff: [row] }))
                            let res = checkExternalWrite({ keyTable: t, keys: KEYS[t], r, ltdtOld: [old], lockExternalRows: lock })
                            assertCell(res, exp, exp === OK ? [] : ['pd'], `${t}/${oTitle}/${f}/lock=${lock}`)
                        })
                    }
                }
            }
        }

        //值正規化: null／""／缺欄為同一空值(寫入契約空值等價, perm-run01 外審 sol#2); 其餘依 JSON 值比對(字串之差異、數字與字串、前後空白、0／false 皆為異動)
        const NORM = [
            ['庫內 "" → 送入缺欄(視為同一)', '', MISSING, OK],
            ['庫內 "x" → 送入缺欄(異動)', 'x', MISSING, FIELD],
            ['庫內 "5" → 送入數字 5(型別不同即異動)', '5', 5, FIELD],
            ['庫內 "a" → 送入 "a "(前後空白為異動)', 'a', 'a ', FIELD],
            ['庫內 "" → 送入 null(空值等價, 視為同一)', '', null, OK],
            ['庫內 null → 送入 ""(空值等價, 視為同一)', null, '', OK],
            ['庫內 null → 送入缺欄(空值等價, 視為同一)', null, MISSING, OK],
            ['庫內 "x" → 送入 null(異動)', 'x', null, FIELD],
            ['庫內 "" → 送入 0(0 異於空值, 異動)', '', 0, FIELD],
            ['庫內 "" → 送入 false(false 異於空值, 異動)', '', false, FIELD],
        ]
        for (let t of TABLES) {
            for (let [title, ov, nv, exp] of NORM) {
                it(`EX-081 ${t} 外部列 description ${title} → ${exp === OK ? '通過' : 'fieldChanged'}`, function() {
                    cells.E_norm++
                    let old = mkRow(t, { id: 'r1', from: 'pd', description: ov })
                    let row = rowWith(old, { description: nv })
                    let res = checkExternalWrite({ keyTable: t, keys: KEYS[t], r: mkR({ diff: [row] }), ltdtOld: [old] })
                    assertCell(res, exp, exp === OK ? [] : ['pd'], `${t}/${title}`)
                })
            }
        }

        it('EX-082 外部列 diff 內容與庫內完全相同(僅被列入 diff, 無任何欄位差異)→ 通過; lockExternalRows 預設為真(省略參數即守門)', function() {
            let old = mkRow('users', { id: 'r1', from: 'pd' })
            assert.strict.equal(checkExternalWrite({ keyTable: 'users', keys: KEYS.users, r: mkR({ diff: [{ ...old }] }), ltdtOld: [old] }), null)
            //省略 lockExternalRows 與顯式 true 同: 同一份違規在省略時亦被拒
            let r = mkR({ del: [old] })
            assert.strict.deepEqual(checkExternalWrite({ keyTable: 'users', keys: KEYS.users, r, ltdtOld: [old] }), checkExternalWrite({ keyTable: 'users', keys: KEYS.users, r, ltdtOld: [old], lockExternalRows: true }))
            assert.strict.notEqual(checkExternalWrite({ keyTable: 'users', keys: KEYS.users, r, ltdtOld: [old] }), null)
            assert.strict.equal(checkExternalWrite({ keyTable: 'users', keys: KEYS.users, r, ltdtOld: [old], lockExternalRows: undefined }) === null, false, '明給 undefined 亦視為預設(真)')
        })

    })


    describe('checkExternalWrite: 多違規之 k／n／froms／次序(EX-S6)', function() {

        let ks = { keyTable: 'grups', keys: KEYS.grups }
        let e = (id, from) => mkRow('grups', { id, from })
        let b = (id) => mkRow('grups', { id, from: '' })

        it('EX-090 k 為該陣列內第一個違規索引(新增: 前一列通過、第 2 列違規 → k=1)', function() {
            cells.E_multi++
            let res = checkExternalWrite({ ...ks, r: mkR({ add: [b('n0'), e('n1', 'pd'), e('n2', 'pe')] }), ltdtOld: [] })
            assert.strict.deepEqual(res, { key: 'saveFromNotAllowed', reason: 'addFrom', k: 1, n: 2, froms: ['pd', 'pe'] })
        })

        it('EX-091 刪除: [後台, 外部] → k=1, reason=del', function() {
            cells.E_multi++
            let old = [b('d0'), e('d1', 'pd')]
            let res = checkExternalWrite({ ...ks, r: mkR({ del: old }), ltdtOld: old })
            assert.strict.deepEqual(res, { key: 'saveExternalRowChanged', reason: 'del', k: 1, n: 1, froms: ['pd'] })
        })

        it('EX-092 修改: [通過, 違規] → k=1', function() {
            cells.E_multi++
            let old = [e('r0', 'pd'), e('r1', 'pd')]
            let res = checkExternalWrite({ ...ks, r: mkR({ diff: [{ ...old[0] }, { ...old[1], name: 'changed' }] }), ltdtOld: old })
            assert.strict.deepEqual(res, { key: 'saveExternalRowChanged', reason: 'fieldChanged', k: 1, n: 1, froms: ['pd'] })
        })

        it('EX-093 處理次序「新增 → 刪除 → 修改」: 三者皆違規時以新增之第一個為 key／reason, n 為總列數 3', function() {
            cells.E_multi++
            let old = [e('x1', 'pd'), e('x2', 'pe')]
            let r = mkR({ add: [e('n1', 'pf')], del: [old[0]], diff: [{ ...old[1], name: 'changed' }] })
            let res = checkExternalWrite({ ...ks, r, ltdtOld: old })
            assert.strict.deepEqual(res, { key: 'saveFromNotAllowed', reason: 'addFrom', k: 0, n: 3, froms: ['pf', 'pd', 'pe'] })
        })

        it('EX-094 無新增違規時刪除先於修改: key／reason 取刪除之違規', function() {
            cells.E_multi++
            let old = [e('x1', 'pd'), e('x2', 'pe')]
            let res = checkExternalWrite({ ...ks, r: mkR({ del: [old[0]], diff: [{ ...old[1], name: 'changed' }] }), ltdtOld: old })
            assert.strict.deepEqual(res, { key: 'saveExternalRowChanged', reason: 'del', k: 0, n: 2, froms: ['pd', 'pe'] })
        })

        it('EX-095 一列同時改 from 與鎖定欄 → 只計一列(n=1), reason 為 fromChanged', function() {
            cells.E_multi++
            let old = [e('x1', 'pd')]
            let res = checkExternalWrite({ ...ks, r: mkR({ diff: [{ ...old[0], from: 'pz', name: 'changed', description: 'changed' }] }), ltdtOld: old })
            assert.strict.deepEqual(res, { key: 'saveExternalRowChanged', reason: 'fromChanged', k: 0, n: 1, froms: ['pd'] })
        })

        it('EX-096 froms 至多 5 個、依首見次序; n 仍為全部違規列數(7)', function() {
            cells.E_multi++
            let old = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((s, k) => e(`d${k}`, `src-${s}`))
            let res = checkExternalWrite({ ...ks, r: mkR({ del: old }), ltdtOld: old })
            assert.strict.deepEqual(res, { key: 'saveExternalRowChanged', reason: 'del', k: 0, n: 7, froms: ['src-a', 'src-b', 'src-c', 'src-d', 'src-e'] })
        })

        it('EX-097 froms 去重: 5 列來自 pd、pd、pe、pd、pe → [pd, pe], n=5', function() {
            cells.E_multi++
            let old = ['pd', 'pd', 'pe', 'pd', 'pe'].map((s, k) => e(`d${k}`, s))
            let res = checkExternalWrite({ ...ks, r: mkR({ del: old }), ltdtOld: old })
            assert.strict.deepEqual(res.froms, ['pd', 'pe'])
            assert.strict.equal(res.n, 5)
        })

        it('EX-098 froms 不含 "": 型別違規(from 為 null)不帶來源, 與外部列刪除並存時只含外部來源', function() {
            cells.E_multi++
            let old = [e('x1', 'pd')]
            let res = checkExternalWrite({ ...ks, r: mkR({ add: [rowWith(b('n1'), { from: null }), rowWith(b('n2'), { from: 7 })], del: old }), ltdtOld: old })
            assert.strict.deepEqual(res, { key: 'saveFromNotAllowed', reason: 'fromType', k: 0, n: 3, froms: ['pd'] })
            assert.strict.ok(!res.froms.includes(''))
        })

        it('EX-099 第 6 個以後之不同來源不入 froms(先到先得), 其後重複之舊來源亦不增加; n 仍為 7', function() {
            cells.E_multi++
            let old = ['s1', 's2', 's3', 's4', 's5', 's6', 's1'].map((s, k) => e(`d${k}`, s))
            let res = checkExternalWrite({ ...ks, r: mkR({ del: old }), ltdtOld: old })
            assert.strict.deepEqual(res.froms, ['s1', 's2', 's3', 's4', 's5'])
            assert.strict.equal(res.n, 7)
        })

    })


    describe('checkExternalWrite: 異常輸入不拋例外', function() {

        let ks = { keyTable: 'grups', keys: KEYS.grups }

        it('EX-100 add 內含 null／字串／數字元素 → 視為無 from 之列(通過)', function() {
            cells.E_robust++
            assert.strict.equal(checkExternalWrite({ ...ks, r: mkR({ add: [null, 'x', 5] }), ltdtOld: [] }), null)
        })

        it('EX-101 del 內含非物件元素 → 非外部列(通過)', function() {
            cells.E_robust++
            assert.strict.equal(checkExternalWrite({ ...ks, r: mkR({ del: [null, 'x'] }), ltdtOld: [] }), null)
        })

        it('EX-102 diff 內含非物件元素或缺 id 之列 → 無法對應庫內列, 只做型別檢查(通過)', function() {
            cells.E_robust++
            assert.strict.equal(checkExternalWrite({ ...ks, r: mkR({ diff: [null, 'x', rowWith(mkRow('grups', { from: 'pd' }), { id: MISSING })] }), ltdtOld: [mkRow('grups', { id: 'r1', from: 'pd' })] }), null)
        })

        it('EX-103 庫內列含非物件、無字串 id 者 → 忽略, 不影響其他列之判定', function() {
            cells.E_robust++
            let old = mkRow('grups', { id: 'r1', from: 'pd' })
            let res = checkExternalWrite({ ...ks, r: mkR({ diff: [{ ...old, name: 'changed' }] }), ltdtOld: [null, 'x', 5, mkRow('grups', { id: 9, from: '' }), old] })
            assert.strict.equal(res.reason, 'fieldChanged')
        })

        it('EX-104 不改輸入(凍結之 r／ltdtOld 呼叫不拋錯)', function() {
            cells.E_robust++
            let old = mkRow('grups', { id: 'r1', from: 'pd' })
            let r = deepFreeze(mkR({ add: [mkRow('grups', { id: 'n1', from: 'pd' })], del: [old], diff: [{ ...old, name: 'c' }] }))
            let res = checkExternalWrite({ ...ks, r, ltdtOld: deepFreeze([old]) })
            assert.strict.notEqual(res, null)
        })

    })


    describe('hasExternalDiff(EX-S7)', function() {

        let ks = (rows, old) => ({ r: mkR({ diff: rows }), ltdtOld: old })

        for (let [title, from, exp] of [['外部 pd', 'pd', true], ['外部 " "', ' ', true], ['後台 ""', '', false], ['後台缺欄', MISSING, false], ['歷史 null', null, false], ['歷史 0', 0, false]]) {
            it(`EX-110 diff 內庫內為${title}之列 → ${exp}`, function() {
                cells.F++
                let old = rowWith(mkRow('users', { id: 'r1' }), { from })
                assert.strict.equal(hasExternalDiff(ks([{ ...old, description: 'c' }], [old])), exp)
            })
        }

        it('EX-111 混合: 後台列與外部列同在 diff → true; 僅後台列 → false; 空 diff → false', function() {
            cells.F++
            let b = mkRow('users', { id: 'b1', from: '' })
            let e = mkRow('users', { id: 'e1', from: 'pd' })
            assert.strict.equal(hasExternalDiff(ks([{ ...b }, { ...e }], [b, e])), true)
            assert.strict.equal(hasExternalDiff(ks([{ ...b }], [b, e])), false)
            assert.strict.equal(hasExternalDiff(ks([], [b, e])), false)
        })

        it('EX-112 外部列只出現在 add／del／same → 不計(只看 diff)', function() {
            cells.F++
            let e = mkRow('users', { id: 'e1', from: 'pd' })
            let r = { add: [mkRow('users', { id: 'n1', from: 'pd' })], del: [e], diff: [], same: [e] }
            assert.strict.equal(hasExternalDiff({ r, ltdtOld: [e] }), false)
        })

        it('EX-113 diff 列庫內無對應 id、或缺 id、或為非物件 → 不計(false), 不拋例外', function() {
            cells.F++
            let e = mkRow('users', { id: 'e1', from: 'pd' })
            assert.strict.equal(hasExternalDiff(ks([mkRow('users', { id: 'zz', from: 'pd' }), rowWith(e, { id: MISSING }), null, 'x'], [e])), false)
        })

        it('EX-114 歸屬以庫內為準, 與 diff 列自身之 from 無關(送入 from 已被改成 "" 之外部列仍計)', function() {
            cells.F++
            let e = mkRow('users', { id: 'e1', from: 'pd' })
            assert.strict.equal(hasExternalDiff(ks([{ ...e, from: '' }], [e])), true)
            let b = mkRow('users', { id: 'b1', from: '' })
            assert.strict.equal(hasExternalDiff(ks([{ ...b, from: 'pd' }], [b])), false)
        })

    })


    //宣告格數核對(檔頭「輸入空間表」之數字須與實測一致; 新增或刪格時須同步改檔頭與此處)
    describe('EX-CELLS 輸入空間格數核對', function() {

        it('EX-999 各矩陣實測格數 = 宣告', function() {
            if (process.argv.some((a) => a === '--grep' || a === '-g' || a.startsWith('--grep='))) {
                this.skip() //--grep 只跑部分案例時計數必不全, 不核對
            }
            assert.strict.deepEqual(cells, {
                A: 16,
                B: 15,
                C: 24,
                D: 52,
                D2: 33,
                E_add: 80,
                E_del: 64,
                E_from: 376,
                E_field: 198,
                E_norm: 40,
                E_multi: 10,
                E_robust: 5,
                F: 10,
            })
        })

    })

})
