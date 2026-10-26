//反向關聯對話框之「列 ↔ 存檔快照」身分配對(規則帳本 R-REL-PAIR-01, ADR-032; 來源: run02 設計一致性盤查 F-24)
//
//背景: VeGrupBlngUsers／VePemiBlngGrups 開框時依 store 當時的列序產生對話框的列; 存檔時重新取 store 快照. 修前以「開框時的列索引」配對兩者,
//store 於開框期間被更新(另一位系統管理者增刪或改 order)時, 關聯寫到另一個使用者／群組. 修後以列身分(id; 群組另驗 name)配對, 找不到者回報為 missing, 由元件整次拒存.
//
//本檔驗純函數 pairRowsToSnapshot(src/js/pairRowsToSnapshot.mjs)的契約; 元件接線由 unit-relDialogs(靜態站點不變式)與 e2e-array-form AF-014(真瀏覽器)守護.
//跑法: npx mocha test/unit-pairRowsToSnapshot.test.mjs --timeout 30000
import assert from 'assert'
import pairRowsToSnapshot from '../src/js/pairRowsToSnapshot.mjs'


//快照(store 在存檔當下的列, 依 order 排序); 列為使用者, 身分欄位 id
const U = (id, name, cgrups = '{}') => ({ id, name, cgrups })
const ids = (pairs) => pairs.map((v) => (v === null ? null : v.id))


describe('pairRowsToSnapshot (對話框的列以身分配對存檔快照, R-REL-PAIR-01)', function() {

    it('PR-ID-001-快照列序與對話框列序相同 — 每列配到同 id 之快照列, missing 為空', function() {
        let snapshot = [U('u1', 'a'), U('u2', 'b'), U('u3', 'c')]
        let rows = [{ id: 'u1', name: 'a' }, { id: 'u2', name: 'b' }, { id: 'u3', name: 'c' }]
        let { pairs, missing } = pairRowsToSnapshot(rows, snapshot)
        assert.deepStrictEqual(ids(pairs), ['u1', 'u2', 'u3'])
        assert.deepStrictEqual(missing, [])
    })

    //spec(盤查 F-24): 開框時 [a(order 1), b(order 2)], 另一端把 order 改成 b=1、a=2, 存檔快照成 [b, a];
    //修前 map(rows, (r, kr) => get(users, kr)) 使 a 的列取到 b → b.cgrups 與 a.cgrups 對調.
    it('PR-ID-002-快照重排([a,b] → [b,a]) — 列 a 仍配到 a、列 b 仍配到 b(修前以索引配對會對調)', function() {
        let snapshot = [U('u2', 'b', '{"G":{"mode":"OR","isActive":"y"}}'), U('u1', 'a', '{}')]
        let rows = [{ id: 'u1', name: 'a' }, { id: 'u2', name: 'b' }]
        let { pairs, missing } = pairRowsToSnapshot(rows, snapshot)
        assert.deepStrictEqual(ids(pairs), ['u1', 'u2'], '以 id 配對: 第 0 列(a)取 u1、第 1 列(b)取 u2')
        assert.strictEqual(pairs[0].cgrups, '{}')
        assert.strictEqual(pairs[1].cgrups, '{"G":{"mode":"OR","isActive":"y"}}')
        assert.deepStrictEqual(missing, [])
    })

    it('PR-ID-003-他人在快照前端插入或新增其他列 — 對話框的列仍各自配到自己的列(索引全部位移)', function() {
        let snapshot = [U('n1', 'new1'), U('u1', 'a'), U('n2', 'new2'), U('u2', 'b')]
        let rows = [{ id: 'u1', name: 'a' }, { id: 'u2', name: 'b' }]
        let { pairs, missing } = pairRowsToSnapshot(rows, snapshot)
        assert.deepStrictEqual(ids(pairs), ['u1', 'u2'])
        assert.deepStrictEqual(missing, [])
    })

    it('PR-ID-004-他人刪除了其他列 — 對話框的列仍配對成功', function() {
        let snapshot = [U('u2', 'b')]
        let rows = [{ id: 'u2', name: 'b' }]
        let { pairs, missing } = pairRowsToSnapshot(rows, snapshot)
        assert.deepStrictEqual(ids(pairs), ['u2'])
        assert.deepStrictEqual(missing, [])
    })

    it('PR-ID-005-對話框的列對應的列已被刪除 — 該列 pairs 為 null 且列入 missing(元件據此整次拒存, 不得退而配到其他列)', function() {
        let snapshot = [U('u1', 'a'), U('u3', 'c')]
        let rows = [{ id: 'u1', name: 'a' }, { id: 'u2', name: 'b' }, { id: 'u3', name: 'c' }]
        let { pairs, missing } = pairRowsToSnapshot(rows, snapshot)
        assert.deepStrictEqual(ids(pairs), ['u1', null, 'u3'], '不得讓第 1 列取到索引 1 的 u3')
        assert.strictEqual(missing.length, 1)
        assert.strictEqual(missing[0].id, 'u2')
        assert.strictEqual(missing[0], rows[1], 'missing 為原列物件(供元件取名稱顯示)')
    })

    it('PR-ID-006-verifyKeys: 同 id 但 name 已不同(群組被改名) — 視為過期列入 missing; name 相同則配對', function() {
        let snapshot = [{ id: 'g1', name: 'Admins2', cpemis: '{}' }, { id: 'g2', name: 'Ops', cpemis: '{}' }]
        let rows = [{ id: 'g1', name: 'Admins' }, { id: 'g2', name: 'Ops' }]
        let { pairs, missing } = pairRowsToSnapshot(rows, snapshot, { verifyKeys: ['name'] })
        assert.deepStrictEqual(ids(pairs), [null, 'g2'])
        assert.deepStrictEqual(missing.map((v) => v.id), ['g1'])
        //未要求驗 name 時(使用者列: name 可重複且改名無害)同 id 即配對
        let r2 = pairRowsToSnapshot(rows, snapshot)
        assert.deepStrictEqual(ids(r2.pairs), ['g1', 'g2'])
        assert.deepStrictEqual(r2.missing, [])
    })

    it('PR-ID-007-同名不同 id(同名群組表列) — 以 id 區分, 各自配對(不因名稱重複而歧義)', function() {
        let snapshot = [{ id: 'g1', name: 'Dup' }, { id: 'g2', name: 'Dup' }]
        let rows = [{ id: 'g2', name: 'Dup' }, { id: 'g1', name: 'Dup' }]
        let { pairs, missing } = pairRowsToSnapshot(rows, snapshot, { verifyKeys: ['name'] })
        assert.deepStrictEqual(ids(pairs), ['g2', 'g1'])
        assert.deepStrictEqual(missing, [])
    })

    it('PR-ID-008-列缺身分(無 id、空字串、null、物件、NaN) — 一律列入 missing, 不拋錯', function() {
        let snapshot = [U('u1', 'a')]
        let rows = [{ name: 'x' }, { id: '', name: 'x' }, { id: null, name: 'x' }, { id: {}, name: 'x' }, { id: NaN, name: 'x' }, null, undefined, 5, 'u1']
        let { pairs, missing } = pairRowsToSnapshot(rows, snapshot)
        assert.strictEqual(pairs.length, rows.length)
        assert.ok(pairs.every((v) => v === null))
        assert.strictEqual(missing.length, rows.length)
    })

    it('PR-ID-009-數字身分與其字串形式視為同一(ADR-028: 數字主鍵以字串形式處置)', function() {
        let snapshot = [U('1', 'a'), U('2', 'b')]
        let rows = [{ id: 2, name: 'b' }, { id: '1', name: 'a' }]
        let { pairs, missing } = pairRowsToSnapshot(rows, snapshot)
        assert.deepStrictEqual(ids(pairs), ['2', '1'])
        assert.deepStrictEqual(missing, [])
    })

    it('PR-ID-010-原型鍵名之 id(__proto__、constructor、toString)不誤配 — 快照沒有該 id 時為 missing; 有則精確配對', function() {
        let rows = [{ id: '__proto__', name: 'p' }, { id: 'constructor', name: 'c' }, { id: 'toString', name: 't' }]
        let r1 = pairRowsToSnapshot(rows, [U('u1', 'a')])
        assert.ok(r1.pairs.every((v) => v === null))
        assert.strictEqual(r1.missing.length, 3)
        let snap2 = [U('__proto__', 'p'), U('constructor', 'c'), U('toString', 't')]
        let r2 = pairRowsToSnapshot(rows, snap2)
        assert.deepStrictEqual(ids(r2.pairs), ['__proto__', 'constructor', 'toString'])
        assert.deepStrictEqual(r2.missing, [])
    })

    it('PR-ID-011-配到的是快照中的同一個物件參考(元件就地改 cgrups 後以該物件送出); 輸入不被修改', function() {
        let snapshot = [U('u1', 'a'), U('u2', 'b')]
        let rows = [{ id: 'u2', name: 'b' }]
        let snapStr = JSON.stringify(snapshot)
        let rowsStr = JSON.stringify(rows)
        let { pairs } = pairRowsToSnapshot(rows, snapshot)
        assert.strictEqual(pairs[0], snapshot[1])
        assert.strictEqual(JSON.stringify(snapshot), snapStr)
        assert.strictEqual(JSON.stringify(rows), rowsStr)
    })

    it('PR-ID-012-非陣列輸入(null、undefined、字串、物件) — 不拋錯; rows 非陣列時 pairs／missing 皆空, snapshot 非陣列時每列皆 missing', function() {
        for (let bad of [null, undefined, 'abc', 5, {}]) {
            let r = pairRowsToSnapshot(bad, [U('u1', 'a')])
            assert.deepStrictEqual(r, { pairs: [], missing: [], krs: [], matched: [] })
        }
        for (let bad of [null, undefined, 'abc', 5, {}]) {
            let r = pairRowsToSnapshot([{ id: 'u1', name: 'a' }], bad)
            assert.deepStrictEqual(r.pairs, [null])
            assert.strictEqual(r.missing.length, 1)
        }
    })

    //外審 sol R4: revRows 以 krs／matched 還原「配得到之列 ↔ 其快照列」, 不自行壓縮索引; 配不到之列夾在中間時索引不得位移
    it('PR-ID-014-krs／matched: 列 [gone, u2, u1]、快照 [u1, new, u2] → krs=[1,2]、matched=[u2, u1](與 krs 同序等長, 第 k 個配到之快照列即第 krs[k] 列所配); 全配得到時 krs 為 0..n-1; 全配不到時兩者為空', function() {
        let snapshot = [U('u1', 'a'), U('n1', 'new'), U('u2', 'b')]
        let rows = [{ id: 'gone', name: 'x' }, { id: 'u2', name: 'b' }, { id: 'u1', name: 'a' }]
        let r = pairRowsToSnapshot(rows, snapshot)
        assert.deepStrictEqual(r.krs, [1, 2])
        assert.deepStrictEqual(r.matched.map((v) => v.id), ['u2', 'u1'])
        assert.strictEqual(r.matched.length, r.krs.length)
        r.krs.forEach((kr, k) => assert.strictEqual(r.pairs[kr], r.matched[k], `第 ${k} 個配到者即第 ${kr} 列之 pairs`))
        let all = pairRowsToSnapshot([{ id: 'u1' }, { id: 'u2' }], snapshot)
        assert.deepStrictEqual(all.krs, [0, 1])
        let none = pairRowsToSnapshot([{ id: 'x' }, { id: 'y' }], snapshot)
        assert.deepStrictEqual([none.krs, none.matched], [[], []])
    })

    //第二輪外審 minimax2 R3: forEach 會跳過稀疏陣列之空洞, pairs 與 rows 不再等長、空洞不列入 missing(fail-closed 守門變鬆)
    it('PR-ID-015-稀疏陣列(rows 含空洞) — 空洞視為無身分: pairs 與 rows 等長且對齊、空洞列入 missing(整次拒存), krs／matched 不含空洞', function() {
        let snapshot = [U('u1', 'a'), U('u3', 'c')]
        let rows = [{ id: 'u1', name: 'a' }, , { id: 'u3', name: 'c' }] // eslint-disable-line no-sparse-arrays
        assert.strictEqual(rows.length, 3)
        let r = pairRowsToSnapshot(rows, snapshot)
        assert.strictEqual(r.pairs.length, 3, 'pairs 與 rows 等長')
        assert.deepStrictEqual(r.pairs.map((v) => (v === null ? null : v.id)), ['u1', null, 'u3'], '空洞位置為 null, 其餘仍對齊')
        assert.strictEqual(r.missing.length, 1, '空洞列入 missing')
        assert.deepStrictEqual(r.krs, [0, 2])
        assert.deepStrictEqual(r.matched.map((v) => v.id), ['u1', 'u3'])
    })

    it('PR-ID-013-快照列缺 id 或快照內有重複 id — 缺 id 之快照列不參與配對; 重複 id 取第一筆', function() {
        let snapshot = [{ name: 'noid' }, U('u1', 'first'), U('u1', 'second')]
        let { pairs, missing } = pairRowsToSnapshot([{ id: 'u1', name: 'first' }], snapshot)
        assert.strictEqual(pairs[0].name, 'first')
        assert.deepStrictEqual(missing, [])
    })

})
