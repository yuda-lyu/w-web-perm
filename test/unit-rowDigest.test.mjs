//列內容指紋與載入基準純函數單元測試(F-26 過期快照保護; R-PRINCIPLE-00 原則 3「遇衝突或歧義:收嚴＋提示」; 規則帳本 R-BASELINE-01; ADR-037; run07 U1)
//
//受測: src/js/rowDigest.mjs(純函數, 前後端共用): cyrb53／getDigestFields／rowDigest／makeBaseline／isBaselineValid／getBaselineDigest／compareBaseline／isBaselineStale／checkBaseline.
//
//規格來源(期望由下列規則推導, 不抄實作; 規格常數見 test/tools/unitExt.mjs):
//  RD-S1 指紋只含內容欄位: schema 全部欄位扣除 order 與伺服器管理欄(userId／timeCreate／userIdUpdate／timeUpdate); 外部同步整來源重寫使每列之建立／更新時間皆變, 內容未變者不應使草稿作廢; order 由儲存時依列序重給.
//  RD-S2 每個內容欄位(含 id、from)之變動皆改變指紋; 缺欄視同 null; 物件鍵序、非 schema 之暫態欄位(如 _isNew)不影響; 同內容同指紋(與是哪一個物件無關).
//  RD-S3 載入基準 = 草稿所依據之那版列之 [[id, digest], ...](只含字串 id 之列, 次序同輸入); 格式合法 = 陣列且每項為 [字串, 字串].
//  RD-S4 (run11 改寫為表級; 使用者 2026-10-22 裁示 R-PRINCIPLE-00 原則 7「多人同時編輯以表雜湊比對, 先動先贏」; run07 版「只檢查本次將寫入之列」之期望作廢)
//        比對(表鎖內, 於寫入之前): 草稿載入時之整表(基準)與目前庫內整表逐列比內容指紋與列集合——表內任何一列之內容不同、或有列被增刪, 即過期, 不論該列是否為本次將寫入者(不部分變更、不上鎖).
//        整次拒收 saveStale; reason 為 rowChanged(有列內容不同)／rowRemoved(基準之列已不在)／rowAdded(多出基準沒有之列), 依序取第一個成立者, n 為差異列總數.
//  RD-S5 (run11 取代 run07 同編號: 原為「diff 列內容同庫內不計」之跳過規則, 表級比對不再有 r 參數而作廢) 指紋口徑不變(RD-S1): 排除 order 與伺服器管理欄——外部同步整批重寫但內容未變(時間／建立者／order 皆變)、
//        儲存依列序重給 order、純列序重排, 皆不使表雜湊改變, 管理員不被誤擋; 外部同步真有改變內容 → 雜湊變 → 管理員以舊資料存檔被擋(以外部為主, 原則 5).
//  RD-S6 (run07 外審 sol R8 修訂; 原檔頭「同 id 重複之基準項(Map 取後者, 非規格)不測」之敘述作廢) 基準中同一 id 不得出現兩次(不論兩項指紋是否相同、次序如何): 同 id 帶不同版本為矛盾之基準,
//        由列序決定採哪版屬靜默擇一(R-PRINCIPLE-00 原則 3「遇衝突或歧義:收嚴＋提示」), 格式驗證(isBaselineValid)即拒收 → 伺服端回 saveRowFieldInvalid(reason baselineInvalid)零寫入(procCore 層見 unit-procCore-external EXT-J03).
//        id 之比對為嚴格字串相等(大小寫相異、原型鍵名皆為一般字串).
//  RD-S7 (run07 外審 sol R8 新增) getBaselineDigest(baseline, id): 取基準中某字串 id 之指紋, 無該列／基準壞(非陣列)／id 非字串皆回 undefined; 壞元素略過; 原型鍵名(__proto__／constructor／toString 等)只當一般字串 id 比對, 不經原型鏈.
//
//輸入空間表(軸 × 格數; 格數於檔尾 RD-999 以計數器核對, 宣告值與實測不符即失敗):
//  RD  rowDigest        基本 1 ＋ 表4 × {order／伺服器欄單欄 4 與全欄 1 不影響}=24 ＋ 內容欄逐欄(users 8、grups 5、pemis 5、targets 3 欄)× {6 種值互異, 缺欄≡null≠''}=42 ＋ 鍵序／暫態欄／同內容／id／非物件／型別／邊界／不改輸入／keys 異常／keys 夾雜／無碰撞 5000／cyrb53 共 12 = 79
//  RG  getDigestFields  表4 精確集合 4 格
//  RB  makeBaseline     id 型別 7 種(含缺 id)＋ 非物件元素 3 種 = 10; 次序／digest 一致／非陣列／空／order 與伺服器欄不同基準同／不改輸入 5; 四表 4 = 19
//  RV  isBaselineValid  壞形狀 26 種 ＋ 合法形狀 5 種 = 31; [run07 R8] 同 id 重複之壞形狀 7 種(同指紋／異指紋／交換次序／不相鄰／三次／原型鍵名／空字串) ＋ 真指紋交換次序 2 ＋ 合法(id 異而指紋同／原型鍵名不重複／大小寫相異) 3 = 12; 共 43, 全測
//  GD  getBaselineDigest  [run07 R8] 有／無／壞基準與壞元素／原型鍵名／與 makeBaseline 一致／id 型別 6 案, 全測
//  RC  checkBaseline 表級(run11): 整表情境 11 種 × 表 4 = 44; 內容欄逐欄被他人改(users 7、grups 4、pemis 4、targets 2 欄 = 17 欄)= 17; order／伺服器欄變動與純重排不使過期 4 表 × 2 ＋ 外部同步整批重寫 ＋ 他列被改仍拒 = 10;
//                       reason／n 優先序與形狀 5; 雜訊列／重複 id／不改輸入／非陣列／keys 非陣列 5; 空基準／空表 3; 隨機語意對照 400(預言逐 id 比內容, 不經指紋); isBaselineStale／前後端同判準／compareBaseline 形狀 3
//  刻意不測: 稀疏陣列之基準(JSON 不會產生); 指紋之具體字串值(不凍結雜湊演算法, 只驗性質); 同 id 重複之基準送入 checkBaseline 之行為(RD-S6 已於格式驗證拒收, 呼叫端須先 isBaselineValid; procCore 即如此).
//  未測: 無.
//跑法: npx mocha test/unit-rowDigest.test.mjs --reporter list --timeout 60000
import assert from 'assert'
import { cyrb53, getDigestFields, rowDigest, makeBaseline, isBaselineValid, getBaselineDigest, compareBaseline, isBaselineStale, checkBaseline } from '../src/js/rowDigest.mjs'
import { TABLES, KEYS, SPEC_SERVER, SPEC_DIGEST, MISSING, mkRow, rowWith, deepFreeze, mulberry32 } from './tools/unitExt.mjs'


const cells = { RD: 0, RG: 0, RB: 0, RV: 0, GD: 0, RC_matrix: 0, RC_field: 0, RC_inv: 0, RC_mixed: 0, RC_robust: 0, RC_empty: 0, RC_random: 0, RC_misc: 0 }
let sortCopy = (a) => [...a].sort()
let dg = (t, o = {}) => rowDigest(mkRow(t, o), KEYS[t])
//contentOf: 「內容是否相同」之獨立預言(不經指紋): 內容欄位依 SPEC_DIGEST 逐表手列, 缺欄視為 null
let contentOf = (t, row) => JSON.stringify(SPEC_DIGEST[t].map((f) => (row[f] === undefined ? null : row[f])))


describe('unit-rowDigest (列內容指紋與載入基準, F-26, R-BASELINE-01)', function() {

    // =====================================================================
    // 指紋
    // =====================================================================
    describe('getDigestFields(RD-S1)', function() {

        for (let t of TABLES) {
            it(`RG-001 ${t}: 內容欄位為精確集合 [${SPEC_DIGEST[t].join(',')}](不含 order 與伺服器管理欄)`, function() {
                cells.RG++
                assert.strict.deepEqual(sortCopy(getDigestFields(KEYS[t])), sortCopy(SPEC_DIGEST[t]))
            })
        }

        it('RG-002 keys 非陣列 → 空陣列, 不拋例外', function() {
            for (let bad of [undefined, null, 'id', { length: 1, 0: 'id' }]) {
                assert.strict.deepEqual(getDigestFields(bad), [])
            }
        })

    })


    describe('rowDigest 不變性(RD-S1、RD-S2)', function() {

        it('RD-001 回傳非空之小寫 base36 字串; 相同輸入重複呼叫結果相同', function() {
            cells.RD++
            let d = dg('users')
            assert.strict.equal(typeof d, 'string')
            assert.strict.ok(/^[0-9a-z]+$/.test(d), `指紋格式 ${d}`)
            assert.strict.equal(dg('users'), d)
        })

        for (let t of TABLES) {
            //order 與伺服器管理欄之變動不影響指紋(單欄與全欄)
            for (let [title, fs] of [['order', ['order']], ...SPEC_SERVER.map((f) => [f, [f]]), ['order 與四個伺服器管理欄同時', ['order', ...SPEC_SERVER]]]) {
                it(`RD-010 ${t}: ${title} 變動 → 指紋不變`, function() {
                    cells.RD++
                    let a = mkRow(t)
                    let b = rowWith(a, Object.fromEntries(fs.map((f) => [f, f === 'order' ? 999 : `changed-${f}`])))
                    assert.strict.equal(rowDigest(a, KEYS[t]), rowDigest(b, KEYS[t]))
                })
            }

            //每個內容欄位之變動皆改變指紋; 同欄之 6 種值(原值、改值、空字串、null、數字 5、字串 '5')指紋兩兩互異
            for (let f of SPEC_DIGEST[t]) {
                it(`RD-011 ${t}.${f}: 6 種不同值之指紋兩兩互異(任何變動皆改變指紋)`, function() {
                    cells.RD++
                    let vals = [`v-${f}`, `changed-${f}`, '', null, 5, '5']
                    let ds = vals.map((v) => dg(t, { [f]: v }))
                    assert.strict.equal(new Set(ds).size, vals.length, `${t}.${f}: ${JSON.stringify(ds)}`)
                })

                it(`RD-012 ${t}.${f}: 缺欄與 null 同值(缺欄、undefined 值、null 三者同指紋), 且異於空字串`, function() {
                    cells.RD++
                    let dMissing = dg(t, { [f]: MISSING })
                    assert.strict.equal(dg(t, { [f]: null }), dMissing)
                    assert.strict.equal(dg(t, { [f]: undefined }), dMissing)
                    assert.strict.notEqual(dg(t, { [f]: '' }), dMissing)
                })
            }
        }

        it('RD-020 物件鍵序不影響(同內容, 鍵插入次序反轉)', function() {
            cells.RD++
            for (let t of TABLES) {
                let a = mkRow(t)
                let b = Object.fromEntries(Object.entries(a).reverse())
                assert.strict.deepEqual(Object.keys(b), [...Object.keys(a)].reverse(), '前提: 鍵序確實不同')
                assert.strict.equal(rowDigest(a, KEYS[t]), rowDigest(b, KEYS[t]))
            }
        })

        it('RD-021 非 schema 欄位(暫態 _isNew、任意額外鍵)不影響指紋', function() {
            cells.RD++
            let a = mkRow('users')
            assert.strict.equal(rowDigest({ ...a, _isNew: true, extra: 'x', nested: { k: 1 } }, KEYS.users), rowDigest(a, KEYS.users))
        })

        it('RD-022 不同列物件、同內容 → 同指紋(深複製、伺服器欄與 order 不同之另一物件皆同)', function() {
            cells.RD++
            let a = mkRow('grups', { id: 'g1', name: 'N', description: 'D' })
            let b = JSON.parse(JSON.stringify(a))
            let c = { ...a, order: 7, userId: 'someone', timeUpdate: 'later' }
            assert.strict.equal(rowDigest(a, KEYS.grups), rowDigest(b, KEYS.grups))
            assert.strict.equal(rowDigest(a, KEYS.grups), rowDigest(c, KEYS.grups))
        })

        it('RD-023 id 亦為內容欄位: 其餘全同而 id 不同 → 指紋不同', function() {
            cells.RD++
            for (let t of TABLES) {
                assert.strict.notEqual(dg(t, { id: 'r1' }), dg(t, { id: 'r2' }))
            }
        })

        it('RD-024 列本身為非物件(null／undefined／字串／數字)→ 視同全欄缺欄之空列(全為 null), 且異於有內容之列', function() {
            cells.RD++
            let empty = rowDigest({}, KEYS.users)
            for (let bad of [null, undefined, 'abc', 5, true]) {
                assert.strict.equal(rowDigest(bad, KEYS.users), empty)
            }
            assert.strict.notEqual(empty, dg('users'))
            //全欄缺欄之空列 = 每個內容欄位皆為 null 之列
            assert.strict.equal(rowDigest(Object.fromEntries(SPEC_DIGEST.users.map((k) => [k, null])), KEYS.users), empty)
        })

        it('RD-025 值型別有別: 數字 5／字串 "5"、布林 true／字串 "true"、物件／其字串化 互異', function() {
            cells.RD++
            let ds = [5, '5', true, 'true', { a: 1 }, '{"a":1}', [1], '[1]'].map((v) => dg('users', { name: v }))
            assert.strict.equal(new Set(ds).size, ds.length)
        })

        it('RD-026 欄位邊界不致相撞: 相鄰欄位內容拼接相同而邊界不同者指紋互異(含逗號、引號、換行、Unicode)', function() {
            cells.RD++
            let pairs = [
                [{ name: 'a', email: 'b' }, { name: 'ab', email: '' }],
                [{ name: 'a', email: 'b' }, { name: '', email: 'ab' }],
                [{ name: 'a,b', email: '' }, { name: 'a', email: 'b' }],
                [{ name: 'a","b', email: '' }, { name: 'a', email: 'b' }],
                [{ name: 'a\nb', email: '' }, { name: 'a', email: 'b' }],
                [{ name: '標的/頁', email: '1' }, { name: '標的/頁1', email: '' }],
                [{ name: '😀', email: '' }, { name: '', email: '😀' }],
                [{ name: null, email: 'x' }, { name: 'x', email: null }],
            ]
            for (let [x, y] of pairs) {
                assert.strict.notEqual(dg('users', x), dg('users', y), `${JSON.stringify(x)} vs ${JSON.stringify(y)}`)
            }
        })

        it('RD-027 不改輸入(凍結之列)', function() {
            cells.RD++
            let a = deepFreeze(mkRow('users'))
            assert.strict.equal(typeof rowDigest(a, KEYS.users), 'string')
        })

        it('RD-028 keys 非陣列 → 不拋例外; 此時無內容欄位, 任何列同指紋', function() {
            cells.RD++
            for (let bad of [undefined, null, 'id']) {
                assert.strict.equal(rowDigest(mkRow('users'), bad), rowDigest({ x: 1 }, bad))
            }
        })

        it('RD-029 keys 中夾雜 order 與伺服器欄之位置不影響結果(只取內容欄)', function() {
            cells.RD++
            let a = mkRow('grups')
            let keys2 = ['order', 'id', 'userId', 'name', 'timeCreate', 'description', 'from', 'userIdUpdate', 'cpemis', 'timeUpdate']
            let b = rowWith(a, { order: 5, userId: 'zz', timeCreate: 'zz', userIdUpdate: 'zz', timeUpdate: 'zz' })
            assert.strict.equal(rowDigest(a, keys2), rowDigest(b, keys2))
            assert.strict.notEqual(rowDigest(a, keys2), rowDigest(rowWith(a, { cpemis: 'x' }), keys2))
        })

        it('RD-030 無碰撞: 5000 個內容互異之列(隨機, 確定性種子)指紋兩兩互異', function() {
            cells.RD++
            let rand = mulberry32(20261022)
            let pick = (arr) => arr[Math.floor(rand() * arr.length)]
            let alpha = ['', 'a', 'b', 'ab', 'x,y', '標的', '1', '10', 'N', 'n ']
            let seen = new Map()
            let n = 0
            while (n < 5000) {
                let o = { id: `id-${n}`, name: pick(alpha) + pick(alpha), email: pick(alpha), description: pick(alpha) + pick(alpha) + pick(alpha), from: pick(['', 'pd', 'pe']), cgrups: pick(['{}', '{"G":1}', '[]']), isAdmin: pick(['y', 'n']), isActive: pick(['y', 'n']) }
                let d = rowDigest(o, KEYS.users)
                assert.strict.ok(!seen.has(d), `碰撞: ${JSON.stringify(o)} 與 ${JSON.stringify(seen.get(d))}`)
                seen.set(d, o)
                n++
            }
        })

        it('RD-031 cyrb53: 確定性、整數且小於 2^53; 不同字串不同值; seed 改變輸出', function() {
            cells.RD++
            let h = cyrb53('abc')
            assert.strict.equal(h, cyrb53('abc'))
            assert.strict.ok(Number.isInteger(h) && h >= 0 && h < 2 ** 53)
            assert.strict.notEqual(cyrb53('abc'), cyrb53('abd'))
            assert.strict.notEqual(cyrb53('abc', 1), cyrb53('abc', 2))
        })

    })


    // =====================================================================
    // makeBaseline
    // =====================================================================
    describe('makeBaseline(RD-S3)', function() {

        it('RB-001 只含字串 id 之列(數字、null、undefined、物件、陣列、布林 id 與缺 id 者略過), 非物件元素略過; 次序同輸入', function() {
            let rows = [
                mkRow('grups', { id: 'a' }),
                mkRow('grups', { id: 5 }),
                mkRow('grups', { id: null }),
                mkRow('grups', { id: undefined }),
                mkRow('grups', { id: {} }),
                mkRow('grups', { id: ['x'] }),
                mkRow('grups', { id: true }),
                rowWith(mkRow('grups'), { id: MISSING }),
                null,
                'str',
                7,
                mkRow('grups', { id: 'c' }),
                mkRow('grups', { id: 'b' }),
            ]
            cells.RB += 10 //id 型別 7 種(含缺 id)與非物件元素 3 種
            assert.strict.deepEqual(makeBaseline(rows, KEYS.grups).map((e) => e[0]), ['a', 'c', 'b'])
        })

        it('RB-002 每項恰為 [id, rowDigest(row)] 之二元陣列(指紋與 rowDigest 一致)', function() {
            cells.RB++
            let rows = [mkRow('users', { id: 'u1', name: 'n1' }), mkRow('users', { id: 'u2', name: 'n2' })]
            let bl = makeBaseline(rows, KEYS.users)
            assert.strict.deepEqual(bl, [['u1', rowDigest(rows[0], KEYS.users)], ['u2', rowDigest(rows[1], KEYS.users)]])
            assert.strict.ok(bl.every((e) => Array.isArray(e) && e.length === 2))
        })

        it('RB-003 rows 非陣列(null／undefined／物件／字串)→ 空陣列', function() {
            cells.RB++
            for (let bad of [null, undefined, { 0: mkRow('grups', { id: 'a' }), length: 1 }, 'x', 5]) {
                assert.strict.deepEqual(makeBaseline(bad, KEYS.grups), [])
            }
        })

        it('RB-004 空陣列 → 空基準(合法)', function() {
            cells.RB++
            assert.strict.deepEqual(makeBaseline([], KEYS.grups), [])
            assert.strict.equal(isBaselineValid(makeBaseline([], KEYS.grups)), true)
        })

        it('RB-005 同一份內容之列, order／伺服器欄不同 → 基準相同(外部同步重寫時間不使草稿基準作廢)', function() {
            cells.RB++
            let a = [mkRow('pemis', { id: 'p1' }), mkRow('pemis', { id: 'p2' })]
            let b = a.map((r, k) => ({ ...r, order: 100 + k, timeUpdate: 'newer', userId: 'sync' }))
            assert.strict.deepEqual(makeBaseline(a, KEYS.pemis), makeBaseline(b, KEYS.pemis))
        })

        it('RB-006 不改輸入(凍結之 rows)', function() {
            cells.RB++
            makeBaseline(deepFreeze([mkRow('targets', { id: 't1' })]), KEYS.targets)
        })

        for (let t of TABLES) {
            it(`RB-007 ${t}: 以 schema 之 keys 產生之基準通過 isBaselineValid, 列數與字串 id 數一致`, function() {
                cells.RB++
                let rows = [mkRow(t, { id: 'a' }), mkRow(t, { id: 'b' }), mkRow(t, { id: 'c' })]
                let bl = makeBaseline(rows, KEYS[t])
                assert.strict.equal(bl.length, 3)
                assert.strict.equal(isBaselineValid(bl), true)
            })
        }

    })


    // =====================================================================
    // isBaselineValid
    // =====================================================================
    describe('isBaselineValid(RD-S3)', function() {

        let BAD = [
            ['null', null],
            ['undefined', undefined],
            ['空物件', {}],
            ['字串', 'abc'],
            ['數字', 5],
            ['布林 true', true],
            ['類陣列物件 { length:1, 0:["a","b"] }', { length: 1, 0: ['a', 'b'] }],
            ['元素為 null', [null]],
            ['元素為字串 "ab"(非陣列)', ['ab']],
            ['元素為物件', [{}]],
            ['元素為空陣列(長度 0)', [[]]],
            ['元素長度 1', [['a']]],
            ['元素長度 3', [['a', 'b', 'c']]],
            ['id 為數字', [[1, 'b']]],
            ['digest 為數字', [['a', 2]]],
            ['id 為 null', [[null, 'b']]],
            ['digest 為 null', [['a', null]]],
            ['id 為 undefined', [[undefined, 'b']]],
            ['id 為物件', [[{}, 'b']]],
            ['id 為陣列', [[['a'], 'b']]],
            ['巢狀多一層 [[["a","b"]]]', [[['a', 'b']]]],
            ['一項合法、一項為字串', [['a', 'b'], 'x']],
            ['一項合法、一項長度 1', [['a', 'b'], ['c']]],
            ['一項合法、一項為 null', [['a', 'b'], null]],
            ['類陣列元素 { 0:"a", 1:"b", length:2 }', [{ 0: 'a', 1: 'b', length: 2 }]],
            ['元素為 Set', [new Set(['a', 'b'])]],
        ]
        for (let [title, v] of BAD) {
            it(`RV-001 壞形狀: ${title} → false`, function() {
                cells.RV++
                assert.strict.equal(isBaselineValid(v), false)
            })
        }

        let GOOD = [
            ['空陣列', []],
            ['一項', [['a', 'b']]],
            ['多項', [['a', 'b'], ['c', 'd'], ['e', 'f']]],
            ['含 Unicode／特殊字元之 id', [['標的/頁1/區塊 A', 'x1y2'], ['a"b\'c\\d', 'z']]],
            ['makeBaseline 之輸出', makeBaseline([mkRow('grups', { id: 'g1' })], KEYS.grups)],
        ]
        for (let [title, v] of GOOD) {
            it(`RV-002 合法形狀: ${title} → true`, function() {
                cells.RV++
                assert.strict.equal(isBaselineValid(v), true)
            })
        }

        //RD-S6(run07 外審 sol R8): 同 id 重複(不論指紋同異、次序、是否相鄰)一律無效——由列序決定採哪版屬靜默擇一, 格式驗證即拒收
        let DUP = [
            ['同 id、同指紋 [["a","x"],["a","x"]]', [['a', 'x'], ['a', 'x']]],
            ['同 id、異指紋 [["a","x"],["a","y"]]', [['a', 'x'], ['a', 'y']]],
            ['同 id、異指紋, 次序交換 [["a","y"],["a","x"]]', [['a', 'y'], ['a', 'x']]],
            ['同 id 不相鄰(中間夾他 id)', [['a', 'x'], ['b', 'z'], ['a', 'x']]],
            ['同 id 出現三次', [['a', 'x'], ['a', 'x'], ['a', 'x']]],
            ['原型鍵名 id 重複(__proto__)', [['__proto__', 'x'], ['__proto__', 'y']]],
            ['空字串 id 重複', [['', 'x'], ['', 'y']]],
        ]
        for (let [title, v] of DUP) {
            it(`RV-003 同 id 重複: ${title} → false`, function() {
                cells.RV++
                assert.strict.equal(isBaselineValid(v), false)
            })
        }

        it('RV-004 同一列之真指紋: 舊版指紋 d0 與庫內現版指紋 d1 以兩種次序併陳 → 兩包皆無效(結果不由次序決定; 原行為: 第一包被接受、交換後被視為過期)', function() {
            cells.RV += 2
            let cur = mkRow('grups', { id: 'g1', description: 'now' })
            let old = rowWith(cur, { description: 'older' })
            let d0 = rowDigest(old, KEYS.grups)
            let d1 = rowDigest(cur, KEYS.grups)
            assert.strict.notEqual(d0, d1, '前提: 兩版指紋相異')
            assert.strict.equal(isBaselineValid([['g1', d0], ['g1', d1]]), false)
            assert.strict.equal(isBaselineValid([['g1', d1], ['g1', d0]]), false)
        })

        it('RV-005 id 不同而指紋相同、原型鍵名 id 但不重複、大小寫相異之 id → 合法(重複判定為字串 id 之嚴格相等, 非指紋、非原型鏈、非大小寫)', function() {
            cells.RV += 3
            assert.strict.equal(isBaselineValid([['a', 'x'], ['b', 'x']]), true)
            assert.strict.equal(isBaselineValid([['__proto__', 'x'], ['constructor', 'y'], ['toString', 'z'], ['hasOwnProperty', 'w']]), true)
            assert.strict.equal(isBaselineValid([['a', 'x'], ['A', 'x']]), true)
        })

    })


    // =====================================================================
    // getBaselineDigest(run07 外審 sol R8 新增; RD-S7)
    // =====================================================================
    describe('getBaselineDigest(RD-S7)', function() {

        it('GD-001 基準內有該列 → 回其指紋(多列各取各自之指紋)', function() {
            cells.GD++
            let bl = [['a', 'x1'], ['b', 'x2'], ['c', 'x3']]
            assert.strict.equal(getBaselineDigest(bl, 'a'), 'x1')
            assert.strict.equal(getBaselineDigest(bl, 'b'), 'x2')
            assert.strict.equal(getBaselineDigest(bl, 'c'), 'x3')
        })

        it('GD-002 基準內無該列(含空基準) → undefined', function() {
            cells.GD++
            assert.strict.equal(getBaselineDigest([['a', 'x1']], 'zz'), undefined)
            assert.strict.equal(getBaselineDigest([], 'a'), undefined)
        })

        it('GD-003 基準壞(null／undefined／字串／數字／物件／類陣列)→ undefined 不拋例外; 壞元素(null／字串／空陣列／數字)略過而不影響其餘好項', function() {
            cells.GD++
            for (let bad of [null, undefined, 'abc', 5, {}, { length: 1, 0: ['a', 'x'] }]) {
                assert.strict.equal(getBaselineDigest(bad, 'a'), undefined)
            }
            assert.strict.equal(getBaselineDigest([null, 'ab', [], 7, ['a', 'x1']], 'a'), 'x1')
            assert.strict.equal(getBaselineDigest([null, 'ab', [], 7, ['a', 'x1']], 'b'), undefined)
        })

        it('GD-004 原型鍵名 id(__proto__／constructor／toString／hasOwnProperty)只當一般字串: 基準有則取其指紋, 基準無則 undefined(不得取到原型上之方法)', function() {
            cells.GD++
            let bl = [['__proto__', 'p'], ['constructor', 'c']]
            assert.strict.equal(getBaselineDigest(bl, '__proto__'), 'p')
            assert.strict.equal(getBaselineDigest(bl, 'constructor'), 'c')
            assert.strict.equal(getBaselineDigest(bl, 'toString'), undefined)
            assert.strict.equal(getBaselineDigest(bl, 'hasOwnProperty'), undefined)
            assert.strict.equal(getBaselineDigest([], 'toString'), undefined)
        })

        it('GD-005 與 makeBaseline／rowDigest 一致: 對四表各列, getBaselineDigest(makeBaseline(rows), id) === rowDigest(row)', function() {
            cells.GD++
            for (let t of TABLES) {
                let rows = [mkRow(t, { id: 'a', description: 'da' }), mkRow(t, { id: 'b', description: 'db' })]
                let bl = makeBaseline(rows, KEYS[t])
                for (let r of rows) {
                    assert.strict.equal(getBaselineDigest(bl, r.id), rowDigest(r, KEYS[t]), `${t} ${r.id}`)
                }
                assert.strict.equal(getBaselineDigest(bl, 'nope'), undefined)
            }
        })

        it('GD-006 id 非字串(數字 5／undefined／null／物件)→ undefined(基準之 id 恆為字串, 嚴格相等比對; 數字 5 不等於 "5")', function() {
            cells.GD++
            let bl = [['5', 'x5'], ['undefined', 'xu'], ['null', 'xn']]
            for (let id of [5, undefined, null, {}, ['5']]) {
                assert.strict.equal(getBaselineDigest(bl, id), undefined, String(id))
            }
        })

    })


    // =====================================================================
    // compareBaseline／isBaselineStale／checkBaseline(表級, run11)
    // =====================================================================
    describe('checkBaseline 表級(RD-S4)', function() {

        //庫內三列(目前版本); 基準 = 草稿載入時之整表(makeBaseline)
        let dbRows = (t) => [mkRow(t, { id: 'r1', order: 1 }), mkRow(t, { id: 'r2', order: 2 }), mkRow(t, { id: 'r3', order: 3 })]
        let chk = (t, db, bl) => checkBaseline({ keys: KEYS[t], ltdtOld: deepFreeze(db), baseline: deepFreeze(bl) })
        let stale = (reason, n) => ({ key: 'saveStale', reason, n })

        //載入時整表 vs 目前整表: 每格 = [情境, 目前整表產生器, 期望]; 「他人改別列」「他人增刪列」即使與使用者將寫入之列無關, 亦整次拒收(原則 7: 表級, 不部分變更)
        for (let t of TABLES) {
            let MATRIX = [
                ['整表一致', (db) => db, null],
                ['他人改了一列內容(別列)', (db) => [db[0], rowWith(db[1], { description: 'by-other' }), db[2]], stale('rowChanged', 1)],
                ['他人改了全部三列內容', (db) => db.map((r) => rowWith(r, { description: `by-other-${r.id}` })), stale('rowChanged', 3)],
                ['他人刪了一列', (db) => [db[0], db[2]], stale('rowRemoved', 1)],
                ['他人新增一列', (db) => [...db, mkRow(t, { id: 'rN', order: 4 })], stale('rowAdded', 1)],
                ['他人新增三列', (db) => [...db, mkRow(t, { id: 'rN1' }), mkRow(t, { id: 'rN2' }), mkRow(t, { id: 'rN3' })], stale('rowAdded', 3)],
                ['改一列＋刪一列＋增一列', (db) => [rowWith(db[0], { description: 'by-other' }), db[2], mkRow(t, { id: 'rN' })], stale('rowChanged', 3)],
                ['刪一列＋增一列(無內容改變)', (db) => [db[0], db[2], mkRow(t, { id: 'rN' })], stale('rowRemoved', 2)],
                ['刪後以同 id 重新新增且內容不同(同 id 異內容)', (db) => [db[0], mkRow(t, { id: 'r2', description: 'recreated' }), db[2]], stale('rowChanged', 1)],
                ['刪後以同 id 重新新增且內容相同(整表內容未變)', (db) => [db[0], mkRow(t, { id: 'r2', order: 2 }), db[2]], null],
                ['整表清空', () => [], stale('rowRemoved', 3)],
            ]
            for (let [title, gen, exp] of MATRIX) {
                it(`RC-001 ${t}: ${title} → ${exp === null ? '通過' : `saveStale/${exp.reason}(n=${exp.n})`}`, function() {
                    cells.RC_matrix++
                    let db0 = dbRows(t)
                    let bl = makeBaseline(db0, KEYS[t])
                    assert.strict.deepEqual(chk(t, gen(db0), bl), exp)
                })
            }
        }

        //內容欄逐欄: 他人改了任一內容欄 → 過期(欄位為 schema 全部內容欄, 含 from; id 改變 = 該列被刪＋新列新增, 見 RC-001)
        for (let t of TABLES) {
            for (let f of SPEC_DIGEST[t].filter((k) => k !== 'id')) {
                it(`RC-002 ${t}: 庫內 ${f} 已異於載入時 → saveStale/rowChanged(n=1)`, function() {
                    cells.RC_field++
                    let db0 = dbRows(t)
                    let bl = makeBaseline(db0, KEYS[t])
                    let db = [db0[0], rowWith(db0[1], { [f]: `by-other-${f}` }), db0[2]]
                    assert.strict.notEqual(contentOf(t, db[1]), contentOf(t, db0[1]), '前提: 內容確實不同')
                    assert.strict.deepEqual(chk(t, db, bl), stale('rowChanged', 1))
                })
            }
        }

        //order／伺服器管理欄: 外部同步整來源重寫、儲存依列序重給 order——內容未變 → 不過期(使用者 2026-10-22: 以內容計算, 排除系統自動變更之欄位)
        for (let t of TABLES) {
            it(`RC-003 ${t}: 全部列之 order 與四個伺服器管理欄皆已改變(內容未變)→ 通過(不使草稿作廢)`, function() {
                cells.RC_inv++
                let db0 = dbRows(t)
                let bl = makeBaseline(db0, KEYS[t])
                let db = db0.map((r, k) => rowWith(r, { order: 50 + k, userId: 'sync', timeCreate: 'tc2', userIdUpdate: 'sync', timeUpdate: 'tu2' }))
                assert.strict.equal(chk(t, db, bl), null)
            })
            it(`RC-004 ${t}: 純列序重排(order 反向、列在陣列中的位置也反向; 內容未變)→ 通過`, function() {
                cells.RC_inv++
                let db0 = dbRows(t)
                let bl = makeBaseline(db0, KEYS[t])
                let db = db0.map((r, k) => rowWith(r, { order: 3 - k })).reverse()
                assert.strict.equal(chk(t, db, bl), null)
            })
        }
        it('RC-005 外部同步整批重寫內容未變(users: 同一來源 3 列 teamX, 重寫後時間／建立者／order 全變)→ 通過; 其中一列內容真有改變 → rowChanged(n=1)', function() {
            cells.RC_inv++
            let ext = (id, o = {}) => mkRow('users', { id, from: 'teamX', description: `desc-${id}`, ...o })
            let db0 = [mkRow('users', { id: 'bo1', order: 1 }), ext('e1', { order: 100 }), ext('e2', { order: 101 }), ext('e3', { order: 102 })]
            let bl = makeBaseline(db0, KEYS.users)
            let rewritten = db0.map((r) => (r.from === 'teamX' ? rowWith(r, { userId: 'syncer', timeCreate: 'T2', userIdUpdate: 'syncer', timeUpdate: 'T2', order: r.order + 7 }) : r))
            assert.strict.equal(chk('users', rewritten, bl), null)
            let changed = rewritten.map((r) => (r.id === 'e2' ? rowWith(r, { description: 'external-changed' }) : r))
            assert.strict.deepEqual(chk('users', changed, bl), stale('rowChanged', 1))
        })

        //原則 7 之核心對照: 與「使用者將寫入之列」無關的列被改, 亦拒(run07 版對此通過)
        it('RC-006 使用者只想改 r1, 他人改了 r3(與 r1 無關)→ 仍 saveStale(表級, 先動先贏; 不部分變更)', function() {
            cells.RC_inv++
            let db0 = dbRows('grups')
            let bl = makeBaseline(db0, KEYS.grups)
            let db = [db0[0], db0[1], rowWith(db0[2], { description: 'by-other' })]
            assert.strict.deepEqual(chk('grups', db, bl), stale('rowChanged', 1))
        })

        //reason 優先序: rowChanged → rowRemoved → rowAdded, n 為三者總和
        it('RC-010 reason 優先序與 n: 僅刪＋增 → rowRemoved; 僅增 → rowAdded; 三者並存 → rowChanged, n 為總和', function() {
            cells.RC_mixed++
            let db0 = dbRows('users')
            let bl = makeBaseline(db0, KEYS.users)
            assert.strict.deepEqual(chk('users', [db0[0], mkRow('users', { id: 'x' }), mkRow('users', { id: 'y' })], bl), stale('rowRemoved', 4))
            assert.strict.deepEqual(chk('users', [...db0, mkRow('users', { id: 'x' })], bl), stale('rowAdded', 1))
            assert.strict.deepEqual(chk('users', [rowWith(db0[0], { name: 'z' }), mkRow('users', { id: 'x' })], bl), stale('rowChanged', 4))
        })
        it('RC-011 回傳形狀恆為 { key: "saveStale", reason, n }(無其他鍵); 通過回 null', function() {
            cells.RC_mixed++
            let db0 = dbRows('pemis')
            let bl = makeBaseline(db0, KEYS.pemis)
            let res = chk('pemis', [db0[0]], bl)
            assert.strict.deepEqual(Object.keys(res).sort(), ['key', 'n', 'reason'])
            assert.strict.equal(chk('pemis', db0, bl), null)
        })
        it('RC-012 reason 只可能是 rowChanged／rowRemoved／rowAdded(舊 diffStale／delStale／addExisted 已不存在)', function() {
            cells.RC_mixed++
            let seen = new Set()
            for (let t of TABLES) {
                let db0 = dbRows(t)
                let bl = makeBaseline(db0, KEYS[t])
                seen.add(chk(t, [rowWith(db0[0], { description: 'x' }), db0[1], db0[2]], bl).reason)
                seen.add(chk(t, [db0[0]], bl).reason)
                seen.add(chk(t, [...db0, mkRow(t, { id: 'n' })], bl).reason)
            }
            assert.strict.deepEqual(sortCopy([...seen]), ['rowAdded', 'rowChanged', 'rowRemoved'])
        })
        it('RC-013 同類多列各計一次: 5 列皆被改 → n=5; 2 列被刪 → n=2; 4 列新增 → n=4', function() {
            cells.RC_mixed++
            let db0 = [1, 2, 3, 4, 5].map((k) => mkRow('targets', { id: `t${k}`, order: k }))
            let bl = makeBaseline(db0, KEYS.targets)
            assert.strict.deepEqual(chk('targets', db0.map((r) => rowWith(r, { description: `o-${r.id}` })), bl), stale('rowChanged', 5))
            assert.strict.deepEqual(chk('targets', db0.slice(2), bl), stale('rowRemoved', 2))
            assert.strict.deepEqual(chk('targets', [...db0, ...[1, 2, 3, 4].map((k) => mkRow('targets', { id: `n${k}` }))], bl), stale('rowAdded', 4))
        })
        it('RC-014 內容同、僅 id 大小寫不同 → 視為刪一列＋增一列(id 為嚴格字串相等)', function() {
            cells.RC_mixed++
            let db0 = dbRows('grups')
            let bl = makeBaseline(db0, KEYS.grups)
            let db = [db0[0], rowWith(db0[1], { id: 'R2' }), db0[2]]
            assert.strict.deepEqual(chk('grups', db, bl), stale('rowRemoved', 2))
        })

        //穩健: 庫內異常列、重複 id、不改輸入
        it('RC-020 庫內列含非物件或無字串 id 者 → 忽略, 不影響其餘列之比對(兩側一致: makeBaseline 亦只含字串 id 之列)', function() {
            cells.RC_robust++
            let db0 = dbRows('users')
            let bl = makeBaseline(db0, KEYS.users)
            let noise = [null, undefined, 'str', 5, [], { name: 'no-id' }, { id: 7 }, { id: null }, { id: ['r9'] }]
            assert.strict.equal(chk('users', [...noise, ...db0], bl), null)
            assert.strict.deepEqual(chk('users', [...noise, db0[0]], bl), stale('rowRemoved', 2))
        })
        it('RC-021 庫內同 id 出現兩次(ORM 主鍵唯一, 不應發生)→ 只計一次(取第一個), 不重複計 n', function() {
            cells.RC_robust++
            let db0 = dbRows('pemis')
            let bl = makeBaseline(db0, KEYS.pemis)
            let dup = [db0[0], rowWith(db0[0], { description: 'dup' }), db0[1], db0[2]]
            assert.strict.equal(chk('pemis', dup, bl), null)
        })
        it('RC-022 不改輸入(凍結之 ltdtOld／baseline)', function() {
            cells.RC_robust++
            let db0 = dbRows('grups')
            let bl = makeBaseline(db0, KEYS.grups)
            let db = deepFreeze([db0[0], rowWith(db0[1], { description: 'x' })])
            let before = JSON.stringify([db, bl])
            checkBaseline({ keys: KEYS.grups, ltdtOld: db, baseline: deepFreeze(bl) })
            assert.strict.equal(JSON.stringify([db, bl]), before)
        })
        it('RC-023 ltdtOld 非陣列／baseline 非陣列 → 不拋例外, 視為空(compareBaseline)', function() {
            cells.RC_robust++
            assert.strict.deepEqual(compareBaseline({ keys: KEYS.users, rows: null, baseline: null }), { nChanged: 0, nRemoved: 0, nAdded: 0 })
            assert.strict.deepEqual(compareBaseline({ keys: KEYS.users, rows: undefined, baseline: 'x' }), { nChanged: 0, nRemoved: 0, nAdded: 0 })
            assert.strict.deepEqual(compareBaseline({ keys: KEYS.users, rows: dbRows('users'), baseline: {} }), { nChanged: 0, nRemoved: 0, nAdded: 3 })
        })
        it('RC-024 keys 非陣列(無內容欄)→ 不拋例外; 此時任何列同指紋, 僅列集合之增刪被偵測', function() {
            cells.RC_robust++
            let db0 = dbRows('users')
            let bl = makeBaseline(db0, KEYS.users)
            assert.strict.deepEqual(compareBaseline({ keys: null, rows: db0, baseline: bl.map(([id]) => [id, rowDigest({}, null)]) }), { nChanged: 0, nRemoved: 0, nAdded: 0 })
        })

        //空基準／空表
        it('RC-030 空基準 × 空表 → 通過(兩側皆無列)', function() {
            cells.RC_empty++
            assert.strict.equal(chk('users', [], []), null)
        })
        it('RC-031 空基準 × 庫內有 3 列(草稿載入時表是空的, 之後他人新增)→ rowAdded, n=3', function() {
            cells.RC_empty++
            assert.strict.deepEqual(chk('users', dbRows('users'), []), stale('rowAdded', 3))
        })
        it('RC-032 基準有 3 列 × 庫內已清空(外部同步或他人刪光)→ rowRemoved, n=3', function() {
            cells.RC_empty++
            let db0 = dbRows('users')
            assert.strict.deepEqual(chk('users', [], makeBaseline(db0, KEYS.users)), stale('rowRemoved', 3))
        })

        //隨機語意對照: 以「整表內容是否相同」之獨立預言(不經指紋)比對 checkBaseline／compareBaseline／isBaselineStale
        it('RC-040 隨機 400 情境: checkBaseline／compareBaseline／isBaselineStale 與整表內容語意預言一致(表隨機; 庫內被他人改內容／僅改 order 與伺服器欄／刪／增)', function() {
            let rand = mulberry32(777)
            let pick = (arr) => arr[Math.floor(rand() * arr.length)]
            let alpha = ['a', 'b', '', 'c d']
            for (let n = 0; n < 400; n++) {
                cells.RC_random++
                let t = pick(TABLES)
                let randRow = (id) => {
                    let o = { id, order: 1 + Math.floor(rand() * 9), userId: pick(['u1', 'u2']), timeUpdate: pick(['t1', 't2']) }
                    for (let f of SPEC_DIGEST[t]) {
                        if (f !== 'id') {
                            o[f] = pick(alpha)
                        }
                    }
                    return o
                }
                let rows0 = []
                for (let k = 0; k < Math.floor(rand() * 6); k++) {
                    rows0.push(randRow(`r${k}`))
                }
                //之後庫內變為 db(每列: 僅 order／伺服器欄變 50%／內容被改 20%／被刪 20%／不變 10%, 並可能新增列)
                let db = []
                rows0.forEach((row) => {
                    let x = rand()
                    if (x < 0.5) {
                        db.push({ ...row, order: row.order + 1, timeUpdate: 'sync-time', userId: 'syncer' })
                    }
                    else if (x < 0.7) {
                        db.push(randRow(row.id)) //內容可能被改(亦可能碰巧相同, 由預言判定)
                    }
                    else if (x < 0.8) {
                        //被刪
                    }
                    else {
                        db.push({ ...row })
                    }
                })
                for (let k = 0; k < Math.floor(rand() * 3); k++) {
                    db.push(randRow(`new${k}`))
                }
                let bl = makeBaseline(rows0, KEYS[t])
                //預言: 逐 id 比內容(不經指紋)
                let c0 = new Map(rows0.map((row) => [row.id, contentOf(t, row)]))
                let c1 = new Map(db.map((row) => [row.id, contentOf(t, row)]))
                let nChanged = 0
                let nRemoved = 0
                let nAdded = 0
                c0.forEach((v, id) => {
                    if (!c1.has(id)) {
                        nRemoved++
                    }
                    else if (c1.get(id) !== v) {
                        nChanged++
                    }
                })
                c1.forEach((v, id) => {
                    if (!c0.has(id)) {
                        nAdded++
                    }
                })
                let nAll = nChanged + nRemoved + nAdded
                let exp = nAll === 0 ? null : stale(nChanged > 0 ? 'rowChanged' : (nRemoved > 0 ? 'rowRemoved' : 'rowAdded'), nAll)
                assert.strict.deepEqual(chk(t, db, bl), exp, `情境 ${n}(${t}) checkBaseline`)
                assert.strict.deepEqual(compareBaseline({ keys: KEYS[t], rows: db, baseline: bl }), { nChanged, nRemoved, nAdded }, `情境 ${n}(${t}) compareBaseline`)
                assert.strict.equal(isBaselineStale({ keys: KEYS[t], rows: db, baseline: bl }), nAll > 0, `情境 ${n}(${t}) isBaselineStale`)
            }
        })

        //isBaselineStale: 前端提示用布林版, 與 compareBaseline 總和一致
        it('RC-050 isBaselineStale: 一致 → false; 改一列／刪一列／增一列 → true; 僅 order／伺服器欄不同 → false', function() {
            cells.RC_misc++
            let db0 = dbRows('users')
            let bl = makeBaseline(db0, KEYS.users)
            let st = (rows) => isBaselineStale({ keys: KEYS.users, rows, baseline: bl })
            assert.strict.equal(st(db0), false)
            assert.strict.equal(st([db0[0], rowWith(db0[1], { email: 'o@x' }), db0[2]]), true)
            assert.strict.equal(st([db0[0], db0[1]]), true)
            assert.strict.equal(st([...db0, mkRow('users', { id: 'n' })]), true)
            assert.strict.equal(st(db0.map((r) => rowWith(r, { order: 99, timeUpdate: 'z', userIdUpdate: 'z' }))), false)
        })
        it('RC-051 前端 store 之列與伺服端庫內列為同一組資料時, 前後端共用同一判準(同輸入 → 同結果): 前端取 isBaselineStale、伺服端取 checkBaseline 之 null／非 null', function() {
            cells.RC_misc++
            let rand = mulberry32(4242)
            for (let n = 0; n < 50; n++) {
                let t = TABLES[n % TABLES.length]
                let rows0 = [0, 1, 2, 3].map((k) => mkRow(t, { id: `r${k}`, order: k + 1 }))
                let rows1 = rows0.filter(() => rand() < 0.85).map((r) => (rand() < 0.3 ? rowWith(r, { description: `x${n}` }) : r))
                if (rand() < 0.3) {
                    rows1.push(mkRow(t, { id: `z${n}` }))
                }
                let bl = makeBaseline(rows0, KEYS[t])
                assert.strict.equal(isBaselineStale({ keys: KEYS[t], rows: rows1, baseline: bl }), checkBaseline({ keys: KEYS[t], ltdtOld: rows1, baseline: bl }) !== null)
            }
        })
        it('RC-052 compareBaseline 回傳形狀恆為 { nChanged, nRemoved, nAdded }(三個非負整數)', function() {
            cells.RC_misc++
            let db0 = dbRows('grups')
            let c = compareBaseline({ keys: KEYS.grups, rows: [db0[0], rowWith(db0[1], { description: 'q' }), mkRow('grups', { id: 'n' })], baseline: makeBaseline(db0, KEYS.grups) })
            assert.strict.deepEqual(Object.keys(c).sort(), ['nAdded', 'nChanged', 'nRemoved'])
            assert.strict.deepEqual(c, { nChanged: 1, nRemoved: 1, nAdded: 1 })
        })

    })


    //宣告格數核對(檔頭「輸入空間表」之數字須與實測一致)
    describe('RD-CELLS 輸入空間格數核對', function() {

        it('RD-999 各矩陣實測格數 = 宣告', function() {
            if (process.argv.some((a) => a === '--grep' || a === '-g' || a.startsWith('--grep='))) {
                this.skip() //--grep 只跑部分案例時計數必不全, 不核對
            }
            assert.strict.deepEqual(cells, {
                RD: 79,
                RG: 4,
                RB: 19,
                RV: 43,
                GD: 6,
                RC_matrix: 44,
                RC_field: 17,
                RC_inv: 10,
                RC_mixed: 5,
                RC_robust: 5,
                RC_empty: 3,
                RC_random: 400,
                RC_misc: 3,
            })
        })

    })

})
