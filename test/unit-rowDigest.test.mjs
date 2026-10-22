//列內容指紋與載入基準純函數單元測試(F-26 過期快照保護; R-PRINCIPLE-00 原則 3「遇衝突或歧義:收嚴＋提示」; 規則帳本 R-BASELINE-01; ADR-037; run07 U1)
//
//受測: src/js/rowDigest.mjs(純函數, 前後端共用): cyrb53／getDigestFields／rowDigest／makeBaseline／isBaselineValid／getBaselineDigest／checkBaseline.
//
//規格來源(期望由下列規則推導, 不抄實作; 規格常數見 test/tools/unitExt.mjs):
//  RD-S1 指紋只含內容欄位: schema 全部欄位扣除 order 與伺服器管理欄(userId／timeCreate／userIdUpdate／timeUpdate); 外部同步整來源重寫使每列之建立／更新時間皆變, 內容未變者不應使草稿作廢; order 由儲存時依列序重給.
//  RD-S2 每個內容欄位(含 id、from)之變動皆改變指紋; 缺欄視同 null; 物件鍵序、非 schema 之暫態欄位(如 _isNew)不影響; 同內容同指紋(與是哪一個物件無關).
//  RD-S3 載入基準 = 草稿所依據之那版列之 [[id, digest], ...](只含字串 id 之列, 次序同輸入); 格式合法 = 陣列且每項為 [字串, 字串].
//  RD-S4 比對(表鎖內, 於寫入之前): 本次「將寫入」之列——修改列與刪除列之庫內版本須與基準相同(基準無該列 = 草稿之後才新增, 亦視為過期);
//        新增列之 id 若在基準內 = 草稿所依據之版本有、現已不在(被刪或被同步移除), 復活會使已撤銷之列回來, 視為過期; 未異動之列(same)不檢查.
//        違規整次拒收 saveStale; reason 為 diffStale／delStale／addExisted, 以「修改 → 刪除 → 新增」之第一個違規為準, n 為違規列總數.
//  RD-S5 (run07 修訂, 依 API 子代理 C-1 缺陷與 U1 觀察 1; 本檔 RC-050～RC-063 為其翻譯; 原 RC-002 diff 格之期望為舊語意) 修改列(diff)若其內容指紋與庫內該列相同(僅 order／伺服器管理欄不同,
//        如開框後他人新增之列因依列序重編 order 而成為 diff 且不在基準內), 不檢查基準、不算過期——送入之內容並未覆蓋他人版本; 與基準是否有該列、基準版本是否仍等於庫內版本皆無關.
//        刪除列與新增列之檢查不變; 修改列只要任一內容欄(含缺欄與 null 之差異外之任何差異)與庫內不同, 仍依 RD-S4 檢查基準.
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
//  RC  checkBaseline    {diff,del,add} × {基準有且同版,基準有但庫內已變,基準無} 9 格 × 表 4 = 36; 內容欄逐欄改變(users 7、grups 4、pemis 4、targets 2 欄 = 17 欄)× {diff,del} = 34;
//                       order／伺服器欄變動不使過期 4(四表) ＋ same 不檢查 ＋ 只檢查將寫入之列 = 6; 混合之 reason／n 優先序 6; 缺 id／非物件／庫內已無／雜訊／不改輸入 6; 空基準 3; 隨機語意對照 400;
//                       [RD-S5 內容同庫內之 diff 不計] 基準無該列 4(四表)＋基準在但庫內已變 4＋order 與四伺服器欄皆異 4＋任一內容欄不同仍檢查 17 欄＋缺欄≡null 與 ''≠null 2＋混合計數 4＋C-1 函數層情境 2＋庫內無該列 1＋空基準 1 = 39;
//                       RC-002 diff 格(17)改為「client 列為草稿所依據之舊版另編修一欄」, RC-040 隨機情境加入「僅 order 不同之 diff」(預言依內容語意)
//  刻意不測: 稀疏陣列之基準(JSON 不會產生); 指紋之具體字串值(不凍結雜湊演算法, 只驗性質); 同 id 重複之基準送入 checkBaseline 之行為(RD-S6 已於格式驗證拒收, 呼叫端須先 isBaselineValid; procCore 即如此).
//  未測: 無.
//跑法: npx mocha test/unit-rowDigest.test.mjs --reporter list --timeout 60000
import assert from 'assert'
import { cyrb53, getDigestFields, rowDigest, makeBaseline, isBaselineValid, getBaselineDigest, checkBaseline } from '../src/js/rowDigest.mjs'
import { TABLES, KEYS, SPEC_SERVER, SPEC_DIGEST, MISSING, mkRow, rowWith, deepFreeze, mulberry32 } from './tools/unitExt.mjs'


const cells = { RD: 0, RG: 0, RB: 0, RV: 0, GD: 0, RC_matrix: 0, RC_field: 0, RC_inv: 0, RC_mixed: 0, RC_robust: 0, RC_empty: 0, RC_random: 0, RC_skip: 0 }
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
    // checkBaseline
    // =====================================================================
    describe('checkBaseline(RD-S4)', function() {

        //庫內三列(目前版本); 基準狀態: 'same' 基準指紋 = 庫內目前版本; 'changed' 基準為較舊之內容(庫內已變); 'absent' 基準無該 id
        let dbRows = (t) => [mkRow(t, { id: 'r1', order: 1 }), mkRow(t, { id: 'r2', order: 2 }), mkRow(t, { id: 'r3', order: 3 })]
        let oldVersion = (t, row) => rowWith(row, { description: 'older-description' }) //較舊版: 內容(description 為四表共有之內容欄)不同
        let blOf = (t, db, states) => {
            let bl = []
            db.forEach((row) => {
                let st = states[row.id]
                if (st === 'same') {
                    bl.push([row.id, rowDigest(row, KEYS[t])])
                }
                else if (st === 'changed') {
                    bl.push([row.id, rowDigest(oldVersion(t, row), KEYS[t])])
                }
            })
            return bl
        }

        //9 格: 操作 × 基準狀態. diff／del 之目標列 r2; add 之目標列為庫內不存在之 id
        //add 之「基準有」: 基準內有該 id(草稿所依據之版本有、現已不在庫內), 不論基準指紋為何皆為 addExisted; 「基準無」: 草稿之後才新增之新 id
        for (let t of TABLES) {
            let MATRIX = [
                ['diff', 'same', null],
                ['diff', 'changed', 'diffStale'],
                ['diff', 'absent', 'diffStale'],
                ['del', 'same', null],
                ['del', 'changed', 'delStale'],
                ['del', 'absent', 'delStale'],
                ['add', 'same', 'addExisted'],
                ['add', 'changed', 'addExisted'],
                ['add', 'absent', null],
            ]
            for (let [op, st, exp] of MATRIX) {
                it(`RC-001 ${t} ${op} × 基準${st === 'same' ? '有且同版' : (st === 'changed' ? '有但庫內已變' : '無')} → ${exp === null ? '通過' : `saveStale/${exp}`}`, function() {
                    cells.RC_matrix++
                    let db = dbRows(t)
                    let r = { add: [], del: [], diff: [], same: [] }
                    let states = { r1: 'same', r2: 'same', r3: 'same' }
                    if (op === 'add') {
                        //新增列之 id 不在庫內: 'same'／'changed' 時基準內放該 id(以較舊內容之指紋), 'absent' 時基準無
                        let nr = mkRow(t, { id: 'rN', order: 4 })
                        r.add = [nr]
                        let bl = blOf(t, db, states)
                        if (st !== 'absent') {
                            bl.push(['rN', rowDigest(st === 'same' ? nr : oldVersion(t, nr), KEYS[t])])
                        }
                        let res = checkBaseline({ keys: KEYS[t], r: deepFreeze(r), ltdtOld: deepFreeze(db), baseline: deepFreeze(bl) })
                        assert.strict.deepEqual(res, exp === null ? null : { key: 'saveStale', reason: exp, n: 1 })
                        return
                    }
                    states.r2 = st
                    let row = { ...db[1], description: 'client-edit' }
                    if (op === 'diff') {
                        r.diff = [row]
                        r.same = [db[0], db[2]]
                    }
                    else {
                        r.del = [db[1]]
                        r.same = [db[0], db[2]]
                    }
                    let res = checkBaseline({ keys: KEYS[t], r: deepFreeze(r), ltdtOld: deepFreeze(db), baseline: deepFreeze(blOf(t, db, states)) })
                    assert.strict.deepEqual(res, exp === null ? null : { key: 'saveStale', reason: exp, n: 1 })
                })
            }
        }

        //內容欄逐欄: 庫內該欄已與基準不同 → diff 與 del 皆過期(基準 = 較舊內容); 欄位為 schema 全部內容欄(含 id 以外之 from 等)
        //diff 格之 client 列(run07 U1b 依 RD-S5 重寫; 原期望為舊語意: 原送入「內容=庫內、僅 order 不同」之列亦判 diffStale, 新語意下該形狀屬「不計」, 見 RC-050): 草稿開啟於舊版(欄 f 為較舊值),
        //使用者另編修一個內容欄 g(≠f, ≠id)→ 送入列之內容既異於庫內(f 為舊值、g 已編修)、基準亦不等於庫內 → 仍為 diffStale
        for (let t of TABLES) {
            for (let f of SPEC_DIGEST[t].filter((k) => k !== 'id')) {
                for (let op of ['diff', 'del']) {
                    it(`RC-002 ${t}: 庫內 ${f} 已異於基準 → ${op} 過期(${op === 'diff' ? 'diffStale' : 'delStale'})`, function() {
                        cells.RC_field++
                        let dbRow = mkRow(t, { id: 'r1' })
                        let stale = rowWith(dbRow, { [f]: `older-${f}` }) //基準依據之較舊版
                        let bl = [['r1', rowDigest(stale, KEYS[t])]]
                        let g = SPEC_DIGEST[t].find((k) => k !== 'id' && k !== f) //使用者於舊版上另編修之欄
                        let client = rowWith(stale, { [g]: `client-edit-${g}`, order: 2 })
                        let r = op === 'diff' ? { add: [], del: [], diff: [client], same: [] } : { add: [], del: [dbRow], diff: [], same: [] }
                        if (op === 'diff') {
                            assert.strict.notEqual(contentOf(t, client), contentOf(t, dbRow), '前提: 送入列之內容異於庫內(否則屬 RD-S5 不計之形狀)')
                        }
                        let res = checkBaseline({ keys: KEYS[t], r, ltdtOld: [dbRow], baseline: bl })
                        assert.strict.deepEqual(res, { key: 'saveStale', reason: op === 'diff' ? 'diffStale' : 'delStale', n: 1 })
                    })
                }
            }
        }

        //order／伺服器管理欄: 外部同步整來源重寫使其變動, 內容未變 → 基準仍同版, 不過期
        for (let t of TABLES) {
            it(`RC-003 ${t}: 庫內僅 order 與伺服器管理欄較基準新(內容未變)→ diff／del 皆通過(不使草稿作廢)`, function() {
                cells.RC_inv++
                let atOpen = mkRow(t, { id: 'r1' })
                let dbNow = rowWith(atOpen, { order: 50, userId: 'sync', timeCreate: 'tc', userIdUpdate: 'sync', timeUpdate: 'tu' })
                let bl = makeBaseline([atOpen], KEYS[t])
                assert.strict.equal(checkBaseline({ keys: KEYS[t], r: { add: [], del: [], diff: [{ ...dbNow, description: 'edit' }], same: [] }, ltdtOld: [dbNow], baseline: bl }), null)
                assert.strict.equal(checkBaseline({ keys: KEYS[t], r: { add: [], del: [dbNow], diff: [], same: [] }, ltdtOld: [dbNow], baseline: bl }), null)
            })
        }

        it('RC-004 same 列不檢查: 庫內已變／基準無之列若列於 same → 通過(他人在草稿之後新增而草稿原樣帶回、內容未變之列不使存檔作廢)', function() {
            cells.RC_inv++
            let db = dbRows('grups')
            let bl = blOf('grups', db, { r1: 'changed', r2: 'absent', r3: 'same' })
            let r = { add: [], del: [], diff: [], same: [db[0], db[1], db[2]] }
            assert.strict.equal(checkBaseline({ keys: KEYS.grups, r, ltdtOld: db, baseline: bl }), null)
        })

        it('RC-005 只檢查「本次將寫入」之列: 他列之庫內版本已與基準不同, 不影響只寫其餘列之存檔', function() {
            cells.RC_inv++
            let db = dbRows('grups')
            let bl = blOf('grups', db, { r1: 'changed', r2: 'same', r3: 'same' }) //r1 已被他人改過, 但本次不寫 r1
            let r = { add: [], del: [], diff: [{ ...db[1], description: 'edit' }], same: [db[0], db[2]] }
            assert.strict.equal(checkBaseline({ keys: KEYS.grups, r, ltdtOld: db, baseline: bl }), null)
        })

        //混合: reason 為「修改 → 刪除 → 新增」之第一個違規; n 為違規列總數
        let mixedSetup = () => {
            let db = dbRows('grups')
            let bl = blOf('grups', db, { r1: 'changed', r2: 'absent', r3: 'same' })
            bl.push(['rGone', 'x']) //基準有、庫內已無之列
            return { db, bl }
        }
        it('RC-010 修改過期＋刪除過期＋新增復活 → reason=diffStale, n=3', function() {
            cells.RC_mixed++
            let { db, bl } = mixedSetup()
            let r = { add: [mkRow('grups', { id: 'rGone' })], del: [db[1]], diff: [{ ...db[0], description: 'e' }], same: [db[2]] }
            assert.strict.deepEqual(checkBaseline({ keys: KEYS.grups, r, ltdtOld: db, baseline: bl }), { key: 'saveStale', reason: 'diffStale', n: 3 })
        })
        it('RC-011 刪除過期＋新增復活(無修改違規)→ reason=delStale, n=2', function() {
            cells.RC_mixed++
            let { db, bl } = mixedSetup()
            let r = { add: [mkRow('grups', { id: 'rGone' })], del: [db[1]], diff: [{ ...db[2], description: 'e' }], same: [db[0]] }
            assert.strict.deepEqual(checkBaseline({ keys: KEYS.grups, r, ltdtOld: db, baseline: bl }), { key: 'saveStale', reason: 'delStale', n: 2 })
        })
        it('RC-012 僅新增復活 → reason=addExisted, n=1', function() {
            cells.RC_mixed++
            let { db, bl } = mixedSetup()
            let r = { add: [mkRow('grups', { id: 'rGone' })], del: [], diff: [], same: db }
            assert.strict.deepEqual(checkBaseline({ keys: KEYS.grups, r, ltdtOld: db, baseline: bl }), { key: 'saveStale', reason: 'addExisted', n: 1 })
        })
        it('RC-013 同類多列各計一次: 3 列修改過期 → n=3', function() {
            cells.RC_mixed++
            let db = dbRows('grups')
            let bl = blOf('grups', db, { r1: 'changed', r2: 'changed', r3: 'absent' })
            let r = { add: [], del: [], diff: db.map((x) => ({ ...x, description: 'e' })), same: [] }
            assert.strict.deepEqual(checkBaseline({ keys: KEYS.grups, r, ltdtOld: db, baseline: bl }), { key: 'saveStale', reason: 'diffStale', n: 3 })
        })
        it('RC-014 多列新增皆復活 → n 為復活列數; 其中僅一個復活 → n=1', function() {
            cells.RC_mixed++
            let db = dbRows('grups')
            let bl = [['a', 'x'], ['b', 'y']]
            let two = checkBaseline({ keys: KEYS.grups, r: { add: [mkRow('grups', { id: 'a' }), mkRow('grups', { id: 'b' }), mkRow('grups', { id: 'new' })], del: [], diff: [], same: db }, ltdtOld: db, baseline: bl })
            assert.strict.deepEqual(two, { key: 'saveStale', reason: 'addExisted', n: 2 })
            let one = checkBaseline({ keys: KEYS.grups, r: { add: [mkRow('grups', { id: 'a' }), mkRow('grups', { id: 'new' })], del: [], diff: [], same: db }, ltdtOld: db, baseline: bl })
            assert.strict.deepEqual(one, { key: 'saveStale', reason: 'addExisted', n: 1 })
        })
        it('RC-015 回傳形狀恆為 { key: "saveStale", reason, n }(無其他鍵)', function() {
            cells.RC_mixed++
            let { db, bl } = mixedSetup()
            let res = checkBaseline({ keys: KEYS.grups, r: { add: [], del: [db[1]], diff: [], same: [] }, ltdtOld: db, baseline: bl })
            assert.strict.deepEqual(Object.keys(res).sort(), ['key', 'n', 'reason'])
            assert.strict.equal(res.key, 'saveStale')
        })

        //缺 id／非物件／庫內已無: 不拋例外, 依「無從證明版本相同」收嚴
        it('RC-020 diff 列缺 id 或非物件 → diffStale(無從對應基準); 不拋例外', function() {
            cells.RC_robust++
            let db = dbRows('grups')
            let bl = blOf('grups', db, { r1: 'same', r2: 'same', r3: 'same' })
            for (let row of [rowWith(db[0], { id: MISSING }), null, 'x', 5]) {
                let res = checkBaseline({ keys: KEYS.grups, r: { add: [], del: [], diff: [row], same: [] }, ltdtOld: db, baseline: bl })
                assert.strict.deepEqual(res, { key: 'saveStale', reason: 'diffStale', n: 1 }, `diff 列 ${JSON.stringify(row)}`)
            }
        })
        it('RC-021 del 列缺 id 或非物件 → delStale; 不拋例外', function() {
            cells.RC_robust++
            let db = dbRows('grups')
            let bl = blOf('grups', db, { r1: 'same', r2: 'same', r3: 'same' })
            for (let row of [rowWith(db[0], { id: MISSING }), null, 'x', 5]) {
                let res = checkBaseline({ keys: KEYS.grups, r: { add: [], del: [row], diff: [], same: [] }, ltdtOld: db, baseline: bl })
                assert.strict.deepEqual(res, { key: 'saveStale', reason: 'delStale', n: 1 }, `del 列 ${JSON.stringify(row)}`)
            }
        })
        it('RC-022 add 列缺 id、id 非字串或非物件 → 無從在基準內 → 不計(通過); 不拋例外', function() {
            cells.RC_robust++
            let db = dbRows('grups')
            let bl = blOf('grups', db, { r1: 'same', r2: 'same', r3: 'same' })
            let adds = [rowWith(mkRow('grups'), { id: MISSING }), mkRow('grups', { id: 5 }), mkRow('grups', { id: null }), null, 'x']
            assert.strict.equal(checkBaseline({ keys: KEYS.grups, r: { add: adds, del: [], diff: [], same: db }, ltdtOld: db, baseline: bl }), null)
        })
        it('RC-023 diff 列之 id 在基準內但庫內已無該列(被他人刪除) → diffStale', function() {
            cells.RC_robust++
            let db = dbRows('grups')
            let bl = [...blOf('grups', db, { r1: 'same', r2: 'same', r3: 'same' }), ['rX', 'x']]
            let res = checkBaseline({ keys: KEYS.grups, r: { add: [], del: [], diff: [mkRow('grups', { id: 'rX' })], same: [] }, ltdtOld: db, baseline: bl })
            assert.strict.deepEqual(res, { key: 'saveStale', reason: 'diffStale', n: 1 })
        })
        it('RC-024 庫內列含非物件或無字串 id 者 → 忽略, 不影響他列比對', function() {
            cells.RC_robust++
            let db = dbRows('grups')
            let bl = blOf('grups', db, { r1: 'same', r2: 'same', r3: 'same' })
            let noisy = [null, 'x', 5, mkRow('grups', { id: 77 }), ...db]
            let res = checkBaseline({ keys: KEYS.grups, r: { add: [], del: [], diff: [{ ...db[0], description: 'e' }], same: [] }, ltdtOld: noisy, baseline: bl })
            assert.strict.equal(res, null)
        })
        it('RC-025 不改輸入(凍結之 r／ltdtOld／baseline)', function() {
            cells.RC_robust++
            let db = dbRows('grups')
            let bl = blOf('grups', db, { r1: 'changed', r2: 'same', r3: 'same' })
            let r = { add: [mkRow('grups', { id: 'n' })], del: [db[2]], diff: [{ ...db[0], description: 'e' }], same: [db[1]] }
            checkBaseline({ keys: KEYS.grups, r: deepFreeze(r), ltdtOld: deepFreeze(db), baseline: deepFreeze(bl) })
        })

        it('RC-030 空基準: 無任何寫入 → 通過; 僅新增(id 不在基準) → 通過', function() {
            cells.RC_empty++
            let db = dbRows('grups')
            assert.strict.equal(checkBaseline({ keys: KEYS.grups, r: { add: [], del: [], diff: [], same: db }, ltdtOld: db, baseline: [] }), null)
            assert.strict.equal(checkBaseline({ keys: KEYS.grups, r: { add: [mkRow('grups', { id: 'brandnew' })], del: [], diff: [], same: db }, ltdtOld: db, baseline: [] }), null)
        })
        it('RC-031 空基準: 有修改 → diffStale(基準無該列 = 草稿之後才新增)', function() {
            cells.RC_empty++
            let db = dbRows('grups')
            assert.strict.deepEqual(checkBaseline({ keys: KEYS.grups, r: { add: [], del: [], diff: [{ ...db[0], description: 'e' }], same: [db[1], db[2]] }, ltdtOld: db, baseline: [] }), { key: 'saveStale', reason: 'diffStale', n: 1 })
        })
        it('RC-032 空基準: 有刪除 → delStale(草稿不知有此列, 不得刪除)', function() {
            cells.RC_empty++
            let db = dbRows('grups')
            assert.strict.deepEqual(checkBaseline({ keys: KEYS.grups, r: { add: [], del: [db[2]], diff: [], same: [db[0], db[1]] }, ltdtOld: db, baseline: [] }), { key: 'saveStale', reason: 'delStale', n: 1 })
        })

        //隨機語意對照: 以「內容是否相同」之獨立預言(不經指紋)比對 checkBaseline
        it('RC-040 隨機 400 情境: checkBaseline 與內容語意預言一致(表隨機、庫內被他人改／刪／增、草稿改／刪／增)', function() {
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
                //草稿開啟時之列 rows0; 之後庫內變為 db(每列: 不變 60%／內容被改 15%／被刪 15%, 並可能新增列)
                let rows0 = []
                for (let k = 0; k < 1 + Math.floor(rand() * 5); k++) {
                    rows0.push(randRow(`r${k}`))
                }
                let db = []
                rows0.forEach((row) => {
                    let x = rand()
                    if (x < 0.6) {
                        db.push({ ...row, order: row.order + 1, timeUpdate: 'sync-time' }) //僅 order／伺服器欄變
                    }
                    else if (x < 0.75) {
                        db.push(randRow(row.id)) //內容可能被改(亦可能碰巧相同, 由預言判定)
                    }
                })
                for (let k = 0; k < Math.floor(rand() * 3); k++) {
                    db.push(randRow(`new${k}`))
                }
                let bl = makeBaseline(rows0, KEYS[t])
                let c0 = new Map(rows0.map((row) => [row.id, contentOf(t, row)]))
                //草稿之寫入: 對庫內現有列隨機選 diff／del／same; 另隨機新增(id 取基準內已被刪者或全新)
                let r = { add: [], del: [], diff: [], same: [] }
                db.forEach((row) => {
                    let x = rand()
                    if (x < 0.25) {
                        r.diff.push({ ...row, description: 'client-edit' })
                    }
                    else if (x < 0.4) {
                        r.diff.push({ ...row, order: row.order + 5, timeUpdate: 'client-time' }) //僅 order／伺服器欄不同之 diff(如他人新增之列因列序被重編 order; RD-S5)
                    }
                    else if (x < 0.55) {
                        r.del.push(row)
                    }
                    else {
                        r.same.push(row)
                    }
                })
                let dbIds = new Set(db.map((row) => row.id))
                for (let k = 0; k < Math.floor(rand() * 3); k++) {
                    let gone = rows0.filter((row) => !dbIds.has(row.id))
                    r.add.push(randRow(gone.length > 0 && rand() < 0.6 ? pick(gone).id : `fresh${k}`))
                }
                //預言
                let dbBy = new Map(db.map((row) => [row.id, row]))
                let reasons = []
                r.diff.forEach((row) => {
                    if (contentOf(t, row) === contentOf(t, dbBy.get(row.id))) {
                        return //RD-S5: 送入之內容與庫內相同(僅 order／伺服器欄不同)→ 不計
                    }
                    if (!c0.has(row.id) || c0.get(row.id) !== contentOf(t, dbBy.get(row.id))) {
                        reasons.push('diffStale')
                    }
                })
                r.del.forEach((row) => {
                    if (!c0.has(row.id) || c0.get(row.id) !== contentOf(t, row)) {
                        reasons.push('delStale')
                    }
                })
                r.add.forEach((row) => {
                    if (c0.has(row.id)) {
                        reasons.push('addExisted')
                    }
                })
                let exp = reasons.length === 0 ? null : { key: 'saveStale', reason: reasons[0], n: reasons.length }
                assert.strict.deepEqual(checkBaseline({ keys: KEYS[t], r, ltdtOld: db, baseline: bl }), exp, `情境 ${n}(${t})`)
            }
        })


        // ---------------------------------------------------------------
        // RD-S5: 修改列之內容與庫內相同(僅 order／伺服器管理欄不同)→ 不檢查基準、不算過期(run07 U1b; 新增格, 無舊語意對應)
        // 各格皆附「對照」: 同一情境把送入列改成內容異於庫內, 須回 diffStale——證明該格之基準狀態本來會判過期, 通過確由 RD-S5 之跳過而來
        // ---------------------------------------------------------------
        for (let t of TABLES) {
            it(`RC-050 ${t}: diff 列內容=庫內、僅 order 不同, 基準無該列(開框後他人新增、依列序重編 order)→ 不計(通過); 對照: 內容異於庫內則 diffStale`, function() {
                cells.RC_skip++
                let db = dbRows(t)
                let bl = blOf(t, db, { r1: 'same', r2: 'same', r3: 'absent' }) //r3 為草稿開啟之後才由他人新增
                let r = { add: [], del: [], diff: [{ ...db[2], order: 2 }], same: [db[0], db[1]] }
                assert.strict.equal(checkBaseline({ keys: KEYS[t], r: deepFreeze(r), ltdtOld: deepFreeze(db), baseline: deepFreeze(bl) }), null)
                let ctl = { add: [], del: [], diff: [{ ...db[2], order: 2, description: 'client-edit' }], same: [db[0], db[1]] }
                assert.strict.deepEqual(checkBaseline({ keys: KEYS[t], r: ctl, ltdtOld: db, baseline: bl }), { key: 'saveStale', reason: 'diffStale', n: 1 })
            })

            it(`RC-051 ${t}: diff 列內容=庫內、僅 order 不同, 基準有該列但庫內已較基準新(基準版本≠庫內版本)→ 不計(通過); 對照: 內容異於庫內則 diffStale`, function() {
                cells.RC_skip++
                let db = dbRows(t)
                let bl = blOf(t, db, { r1: 'same', r2: 'changed', r3: 'same' })
                let r = { add: [], del: [], diff: [{ ...db[1], order: 5 }], same: [db[0], db[2]] }
                assert.strict.equal(checkBaseline({ keys: KEYS[t], r: deepFreeze(r), ltdtOld: deepFreeze(db), baseline: deepFreeze(bl) }), null)
                let ctl = { add: [], del: [], diff: [{ ...db[1], order: 5, description: 'client-edit' }], same: [db[0], db[2]] }
                assert.strict.deepEqual(checkBaseline({ keys: KEYS[t], r: ctl, ltdtOld: db, baseline: bl }), { key: 'saveStale', reason: 'diffStale', n: 1 })
            })

            it(`RC-052 ${t}: diff 列之 order 與四個伺服器管理欄皆不同、內容=庫內 → 不計(通過; 基準無該列)`, function() {
                cells.RC_skip++
                let db = dbRows(t)
                let bl = blOf(t, db, { r1: 'same', r2: 'absent', r3: 'same' })
                let row = { ...db[1], order: 9, userId: 'other', timeCreate: 'tc', userIdUpdate: 'other', timeUpdate: 'tu' }
                let r = { add: [], del: [], diff: [row], same: [db[0], db[2]] }
                assert.strict.equal(checkBaseline({ keys: KEYS[t], r, ltdtOld: db, baseline: bl }), null)
            })

            //跳過只在「全部內容欄皆相同」時成立: 任一內容欄不同(其餘皆同)且基準無該列 → 仍 diffStale(使「只比部分欄位」之實作變紅)
            for (let f of SPEC_DIGEST[t].filter((k) => k !== 'id')) {
                it(`RC-053 ${t}: diff 列僅 ${f} 異於庫內(其餘內容欄與 order 之外皆同), 基準無該列 → diffStale(跳過只在全部內容欄相同時成立)`, function() {
                    cells.RC_skip++
                    let db = dbRows(t)
                    let bl = blOf(t, db, { r1: 'same', r2: 'absent', r3: 'same' })
                    let row = { ...db[1], [f]: `client-${f}`, order: 2 }
                    assert.strict.notEqual(contentOf(t, row), contentOf(t, db[1]), '前提: 內容確實異於庫內')
                    let r = { add: [], del: [], diff: [row], same: [db[0], db[2]] }
                    assert.strict.deepEqual(checkBaseline({ keys: KEYS[t], r, ltdtOld: db, baseline: bl }), { key: 'saveStale', reason: 'diffStale', n: 1 })
                })
            }
        }

        it('RC-054 內容相同之判定同 rowDigest(RD-S2): 庫內 description 為 null, 送入列缺 description 欄(缺欄≡null)→ 內容相同, 不計(通過)', function() {
            cells.RC_skip++
            let db = [mkRow('grups', { id: 'r1', order: 1, description: null }), mkRow('grups', { id: 'r2', order: 2 })]
            let bl = [['r2', rowDigest(db[1], KEYS.grups)]] //r1 不在基準(草稿開啟後新增)
            let row = rowWith(db[0], { order: 2, description: MISSING })
            assert.strict.equal(checkBaseline({ keys: KEYS.grups, r: { add: [], del: [], diff: [row], same: [db[1]] }, ltdtOld: db, baseline: bl }), null)
        })

        it('RC-055 內容相同之判定同 rowDigest(RD-S2): 庫內 description 為 null, 送入列為 \'\'(≠ null)→ 內容不同, 基準無該列 → diffStale', function() {
            cells.RC_skip++
            let db = [mkRow('grups', { id: 'r1', order: 1, description: null }), mkRow('grups', { id: 'r2', order: 2 })]
            let bl = [['r2', rowDigest(db[1], KEYS.grups)]]
            let row = rowWith(db[0], { order: 2, description: '' })
            assert.strict.deepEqual(checkBaseline({ keys: KEYS.grups, r: { add: [], del: [], diff: [row], same: [db[1]] }, ltdtOld: db, baseline: bl }), { key: 'saveStale', reason: 'diffStale', n: 1 })
        })

        //混合: 被跳過之 diff 不計入 n、不影響其餘列之 reason
        describe('跳過之 diff 與其餘寫入列並存(RD-S5)', function() {

            let dbG = () => dbRows('grups')

            it('RC-056 兩個「僅 order 不同」之 diff(r1 基準無、r2 基準已變)＋合法編修 r3 → 通過; 改為再加一個基準已變之真編修 r4 → reason=diffStale, n=1(只計真過期者)', function() {
                cells.RC_skip++
                let db = [...dbG(), mkRow('grups', { id: 'r4', order: 4 })]
                let bl = blOf('grups', db, { r1: 'absent', r2: 'changed', r3: 'same', r4: 'changed' })
                let skipped = [{ ...db[0], order: 7 }, { ...db[1], order: 8 }]
                let ok = { add: [], del: [], diff: [...skipped, { ...db[2], description: 'valid-edit' }], same: [db[3]] }
                assert.strict.equal(checkBaseline({ keys: KEYS.grups, r: ok, ltdtOld: db, baseline: bl }), null)
                let bad = { add: [], del: [], diff: [...skipped, { ...db[2], description: 'valid-edit' }, { ...db[3], description: 'stale-edit' }], same: [] }
                assert.strict.deepEqual(checkBaseline({ keys: KEYS.grups, r: bad, ltdtOld: db, baseline: bl }), { key: 'saveStale', reason: 'diffStale', n: 1 })
            })

            it('RC-057 僅有「僅 order 不同」之 diff(任意多個, 基準狀態各異)→ 通過', function() {
                cells.RC_skip++
                let db = dbG()
                let bl = blOf('grups', db, { r1: 'absent', r2: 'changed', r3: 'same' })
                let r = { add: [], del: [], diff: db.map((x, k) => ({ ...x, order: 10 + k })), same: [] }
                assert.strict.equal(checkBaseline({ keys: KEYS.grups, r, ltdtOld: db, baseline: bl }), null)
            })

            it('RC-058 「僅 order 不同」之 diff＋過期之 del → reason=delStale, n=1(跳過只及 diff, 不及 del)', function() {
                cells.RC_skip++
                let db = dbG()
                let bl = blOf('grups', db, { r1: 'absent', r2: 'changed', r3: 'same' })
                let r = { add: [], del: [db[1]], diff: [{ ...db[0], order: 7 }], same: [db[2]] }
                assert.strict.deepEqual(checkBaseline({ keys: KEYS.grups, r, ltdtOld: db, baseline: bl }), { key: 'saveStale', reason: 'delStale', n: 1 })
            })

            it('RC-059 「僅 order 不同」之 diff＋基準內已存在 id 之 add(復活) → reason=addExisted, n=1(跳過只及 diff, 不及 add)', function() {
                cells.RC_skip++
                let db = dbG()
                let bl = [...blOf('grups', db, { r1: 'absent', r2: 'same', r3: 'same' }), ['rGone', 'x']]
                let r = { add: [mkRow('grups', { id: 'rGone' })], del: [], diff: [{ ...db[0], order: 7 }], same: [db[1], db[2]] }
                assert.strict.deepEqual(checkBaseline({ keys: KEYS.grups, r, ltdtOld: db, baseline: bl }), { key: 'saveStale', reason: 'addExisted', n: 1 })
            })

        })

        //C-1 情境之函數層(API 子代理 C-1 缺陷; 整合層見 unit-procCore-external 之 EXT-O01～O03): users 後台 4 列(order 1～4)＋外部 2 列(order 70／80); 草稿基準取自 R0(無 X);
        //他人新增 X 時 X 之 order 為 7(接在 R0 之後), 草稿依 order 序帶回 [bo1..bo4, X, ext1, ext2] → 伺服端以位置重給後台列 order, X 變 5、外部列還原為庫內 order → 只有 X(僅 order)與被編修之後台列成為 diff
        describe('C-1 情境(users: 後台 4 列＋外部 2 列, 他人新增列 X 使 order 重編)', function() {

            let setup = () => {
                let u = (id, order, from) => mkRow('users', { id, order, from, name: `n-${id}`, email: `${id}@example.com` })
                let R0 = [u('bo1', 1, ''), u('bo2', 2, ''), u('bo3', 3, ''), u('bo4', 4, ''), u('ext1', 70, 'pd'), u('ext2', 80, 'pe')]
                let X = u('X', 7, '')
                return { R0, X, db: [...R0, X], bl: makeBaseline(R0, KEYS.users) }
            }

            it('RC-060 X 依 order 序原樣帶回(order 7→5, 內容不變)並只編修 bo2, 原基準 → 通過', function() {
                cells.RC_skip++
                let { R0, X, db, bl } = setup()
                let r = { add: [], del: [], diff: [{ ...X, order: 5 }, { ...R0[1], description: 'bo2-edit' }], same: [R0[0], R0[2], R0[3], R0[4], R0[5]] }
                assert.strict.equal(checkBaseline({ keys: KEYS.users, r: deepFreeze(r), ltdtOld: deepFreeze(db), baseline: deepFreeze(bl) }), null)
            })

            it('RC-061 同情境但 X 之內容於庫內已被他人再改(草稿帶回舊版 X)→ diffStale, n=1', function() {
                cells.RC_skip++
                let { R0, X, db, bl } = setup()
                let dbNow = db.map((x) => (x.id === 'X' ? { ...x, description: 'X-changed-by-other' } : x))
                let r = { add: [], del: [], diff: [{ ...X, order: 5 }, { ...R0[1], description: 'bo2-edit' }], same: [R0[0], R0[2], R0[3], R0[4], R0[5]] }
                assert.strict.deepEqual(checkBaseline({ keys: KEYS.users, r, ltdtOld: dbNow, baseline: bl }), { key: 'saveStale', reason: 'diffStale', n: 1 })
            })

        })

        //跳過只及「庫內存在之列」: diff 列之 id 不在庫內(庫內已無該列, 草稿仍帶回並改動)→ 依 RD-S4 檢查, 不因無從比對內容而放行
        it('RC-062 diff 列之 id 不在庫內且不在基準 → diffStale(無庫內列可比, 不跳過)', function() {
            cells.RC_skip++
            let db = dbRows('grups')
            let bl = blOf('grups', db, { r1: 'same', r2: 'same', r3: 'same' })
            let ghost = mkRow('grups', { id: 'ghost', order: 9 })
            assert.strict.deepEqual(checkBaseline({ keys: KEYS.grups, r: { add: [], del: [], diff: [ghost], same: db }, ltdtOld: db, baseline: bl }), { key: 'saveStale', reason: 'diffStale', n: 1 })
        })

        it('RC-063 空基準 [] ＋「僅 order 不同」之 diff → 通過(跳過與基準內容無關; 對照 RC-031: 有內容修改則 diffStale)', function() {
            cells.RC_skip++
            let db = dbRows('grups')
            assert.strict.equal(checkBaseline({ keys: KEYS.grups, r: { add: [], del: [], diff: [{ ...db[0], order: 5 }], same: [db[1], db[2]] }, ltdtOld: db, baseline: [] }), null)
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
                RC_matrix: 36,
                RC_field: 34,
                RC_inv: 6,
                RC_mixed: 6,
                RC_robust: 6,
                RC_empty: 3,
                RC_random: 400,
                RC_skip: 39,
            })
        })

    })

})
