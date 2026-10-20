//procCore.mergePickKeysOnly 單元測試: modeEditUsers='for:grups' 之後端欄位限制(spec/流程_後台使用者清單.md〈參數來源〉modeEditUsers 三態)
//述語(R04f): 給定資料庫列 ltdtDb 與送入列 rowsIn, 只採納「既有列」之 pickKeys 欄位變更; 身分欄、新增列、缺列、順序一律以資料庫現值為準
import assert from 'assert'
import { mergePickKeysOnly } from '../server/procCore.mjs'
import { runChild, fileUrl, describeChild } from './tools/runChild.mjs'


let db = () => [
    { id: 'u2', order: 2, name: 'mary', email: 'mary@example.com', isAdmin: 'n', isActive: 'y', cgrups: '{"M2":{"mode":"OR","isActive":"y"}}' },
    { id: 'u1', order: 1, name: 'peter', email: 'peter@example.com', isAdmin: 'n', isActive: 'y', cgrups: '{"M1":{"mode":"OR","isActive":"y"}}' },
    { id: 'u3', order: 3, name: 'admin', email: 'admin@example.com', isAdmin: 'y', isActive: 'y', cgrups: '' },
]


describe('unit-procCore-mergePickKeysOnly', function() {

    //spec: 「後端 updateUsers 於 'for:grups' 亦只採納既有使用者之 cgrups 變更」
    it('UNIT-PK-001-adopt-cgrups-of-existing-row', function() {
        let rowsIn = [
            { id: 'u1', name: 'peter', email: 'peter@example.com', isAdmin: 'n', isActive: 'y', cgrups: '{"M1":{"mode":"AND","isActive":"y"},"M3":{"mode":"OR","isActive":"y"}}' },
        ]
        let r = mergePickKeysOnly(db(), rowsIn, 'id', ['cgrups'])
        let u1 = r.find((u) => u.id === 'u1')
        assert.strict.equal(u1.cgrups, rowsIn[0].cgrups, '既有列之 cgrups 變更應被採納')
    })

    //spec: 「身分欄...一律以資料庫現值為準」
    it('UNIT-PK-002-identity-fields-keep-db-values', function() {
        let rowsIn = [
            { id: 'u1', name: 'PETER-CHANGED', email: 'hacked@example.com', isAdmin: 'y', isActive: 'n', description: 'x', from: 'sso', cgrups: '{"M1":{"mode":"OR","isActive":"y"}}' },
        ]
        let r = mergePickKeysOnly(db(), rowsIn, 'id', ['cgrups'])
        let u1 = r.find((u) => u.id === 'u1')
        assert.strict.equal(u1.name, 'peter')
        assert.strict.equal(u1.email, 'peter@example.com')
        assert.strict.equal(u1.isAdmin, 'n')
        assert.strict.equal(u1.isActive, 'y')
        assert.strict.equal(u1.description, undefined, '資料庫無 description 者不得被送入值補上')
        assert.strict.equal(u1.from, undefined)
    })

    //spec: 「新增列...以資料庫現值為準」→ 送入之新 id 被忽略
    it('UNIT-PK-003-new-row-ignored', function() {
        let rowsIn = [
            { id: 'u1', cgrups: '' },
            { id: 'u9', name: 'newbie', email: 'newbie@example.com', isAdmin: 'n', isActive: 'y', cgrups: '' },
        ]
        let r = mergePickKeysOnly(db(), rowsIn, 'id', ['cgrups'])
        assert.strict.equal(r.length, 3, '列數應等於資料庫列數')
        assert.strict.ok(!r.find((u) => u.id === 'u9'), '送入之新列不得出現')
    })

    //spec: 「缺列(刪除)...以資料庫現值為準」→ 送入缺少的列仍保留
    it('UNIT-PK-004-missing-row-kept', function() {
        let rowsIn = [
            { id: 'u1', cgrups: '' },
        ]
        let r = mergePickKeysOnly(db(), rowsIn, 'id', ['cgrups'])
        assert.strict.deepEqual(r.map((u) => u.id), ['u1', 'u2', 'u3'], '缺列不得被刪, 且依資料庫 order 排序')
        assert.strict.equal(r.find((u) => u.id === 'u2').cgrups, db()[0].cgrups, '未送入之列 cgrups 不變')
    })

    //spec: 「順序一律以資料庫現值為準」→ 送入順序打亂不影響
    it('UNIT-PK-005-order-follows-db', function() {
        let rowsIn = [
            { id: 'u3', cgrups: '' },
            { id: 'u2', cgrups: '' },
            { id: 'u1', cgrups: '' },
        ]
        let r = mergePickKeysOnly(db(), rowsIn, 'id', ['cgrups'])
        assert.strict.deepEqual(r.map((u) => u.id), ['u1', 'u2', 'u3'])
    })

    //邊界: 送入列無 pickKeys 欄位(或 keyDetect 空)時, 該列一律以資料庫值為準, 不得寫入 undefined
    it('UNIT-PK-006-row-without-pick-key-or-without-id', function() {
        let rowsIn = [
            { id: 'u1', name: 'x' },
            { name: 'no-id', cgrups: 'garbage' },
        ]
        let r = mergePickKeysOnly(db(), rowsIn, 'id', ['cgrups'])
        assert.strict.equal(r.find((u) => u.id === 'u1').cgrups, db()[1].cgrups)
        assert.strict.equal(r.length, 3)
    })

    //邊界: 不得改動傳入之資料庫列物件(純函式)
    it('UNIT-PK-007-pure-does-not-mutate-input', function() {
        let ltdtDb = db()
        let snapshot = JSON.stringify(ltdtDb)
        mergePickKeysOnly(ltdtDb, [{ id: 'u1', cgrups: 'changed' }], 'id', ['cgrups'])
        assert.strict.equal(JSON.stringify(ltdtDb), snapshot)
    })


    // ===== R-OBJ-ITER-01: 送入的 rowsIn 是客戶端 JSON, 只有真陣列才逐列採納; 帶 length 之物件不得被當陣列樣迭代 =====

    //送入列帶 length 欄位(真陣列之元素): 仍依主鍵採納 cgrups(迴歸: 列物件以鍵取值, 不走迭代)
    it('UNIT-PK-OI-001 真陣列之列帶 length 欄位 → 仍採納該列之 cgrups', function() {
        let rowsIn = [{ id: 'u1', length: 3, cgrups: '{"M1":{"mode":"AND","isActive":"y"}}' }]
        let r = mergePickKeysOnly(db(), rowsIn, 'id', ['cgrups'])
        assert.strict.equal(r.find((u) => u.id === 'u1').cgrups, rowsIn[0].cgrups)
    })

    //rowsIn 為帶 length 之物件(非陣列): 修前 lodash 當陣列樣迭代, 索引 0 之列被採納; 修後視為未送入任何列, 一律以資料庫為準
    it('UNIT-PK-OI-002 rowsIn 為 { length:1, 0:列 } 物件(非陣列) → 不採納, 全以資料庫現值為準', function() {
        for (let n of [0, 1, 2]) {
            let rowsIn = { length: n, 0: { id: 'u1', cgrups: 'HIJACK' }, 1: { id: 'u2', cgrups: 'HIJACK' } }
            let r = mergePickKeysOnly(db(), rowsIn, 'id', ['cgrups'])
            assert.strict.deepEqual(r, mergePickKeysOnly(db(), [], 'id', ['cgrups']), `length:${n}`)
            assert.strict.ok(r.every((u) => u.cgrups !== 'HIJACK'), `length:${n}`)
        }
    })

    it('UNIT-PK-OI-003 rowsIn 為字串、數字、null、undefined、一般物件 → 視同未送入任何列(不丟錯)', function() {
        let expected = mergePickKeysOnly(db(), [], 'id', ['cgrups'])
        for (let rowsIn of ['abc', 5, null, undefined, {}, { id: 'u1', cgrups: 'x' }]) {
            assert.strict.deepEqual(mergePickKeysOnly(db(), rowsIn, 'id', ['cgrups']), expected, JSON.stringify(rowsIn))
        }
    })

    //巨大 length: 修前 4.29e9 次空轉(約 80 秒); 子行程設逾時, 修後毫秒內完成
    it('UNIT-PK-OI-004 rowsIn 為 { length: 2**32-1 } → 毫秒內完成且全以資料庫為準', function() {
        let code = `
            import { mergePickKeysOnly } from ${fileUrl('server/procCore.mjs')}
            let ltdtDb = [{ id: 'u1', order: 1, cgrups: 'db1' }, { id: 'u2', order: 2, cgrups: 'db2' }]
            console.log(JSON.stringify([
                mergePickKeysOnly(ltdtDb, { length: 2 ** 32 - 1, 0: { id: 'u1', cgrups: 'HIJACK' } }, 'id', ['cgrups']),
                mergePickKeysOnly(ltdtDb, { length: Number.MAX_SAFE_INTEGER }, 'id', ['cgrups']),
            ]))
        `
        let c = runChild(code, { timeoutMs: 20000 })
        assert.strict.ok(c.ok, `子行程應正常結束(修前逾時): ${describeChild(c)}`)
        let dbRows = [{ id: 'u1', order: 1, cgrups: 'db1' }, { id: 'u2', order: 2, cgrups: 'db2' }]
        assert.strict.deepEqual(c.result, [dbRows, dbRows])
    })


    // ===== R-AUTH-PATH-01: 庫內 id 是資料不是路徑——含 . 或 [ 之 id 不可被他列之巢狀欄位冒充(修前以 lodash get(kpIn, id) 解析路徑) =====

    //修前: 庫內 id='a.b'、送入列 { id:'a', b:{ cgrups:'FROM-B' } } → get(kpIn, 'a.b') 取到送入列 a 之 b 欄位 → 'a.b' 之 cgrups 被覆蓋
    it('UNIT-PK-AP-001 庫內 id 含 . 或 [ → 不可被他列之巢狀欄位冒充; 該列 cgrups 維持資料庫值', function() {
        let dbAp = () => [
            { id: 'a.b', order: 1, name: 'dot', cgrups: 'DB-DOT' },
            { id: 'a', order: 2, name: 'a', cgrups: 'DB-A' },
            { id: 'x[0]', order: 3, name: 'idx', cgrups: 'DB-IDX' },
            { id: 'x', order: 4, name: 'x', cgrups: 'DB-X' },
        ]
        let rowsIn = [
            { id: 'a', b: { cgrups: 'FROM-B' }, cgrups: 'NEW-A' }, //b 為 a 列之巢狀欄位, 非 id='a.b' 之列
            { id: 'x', 0: { cgrups: 'FROM-0' }, cgrups: 'NEW-X' },
        ]
        let r = mergePickKeysOnly(dbAp(), rowsIn, 'id', ['cgrups'])
        let by = Object.fromEntries(r.map((u) => [u.id, u.cgrups]))
        assert.strict.deepEqual(by, { 'a.b': 'DB-DOT', a: 'NEW-A', 'x[0]': 'DB-IDX', x: 'NEW-X' })
    })

    it('UNIT-PK-AP-002 精確 id 照常: 送入列 id 為 a.b／x[0] 時採納其 cgrups', function() {
        let dbAp = [
            { id: 'a.b', order: 1, cgrups: 'DB-DOT' },
            { id: 'x[0]', order: 2, cgrups: 'DB-IDX' },
            { id: 'z', order: 3, cgrups: 'DB-Z' },
        ]
        let r = mergePickKeysOnly(dbAp, [{ id: 'a.b', cgrups: 'N1' }, { id: 'x[0]', cgrups: 'N2' }], 'id', ['cgrups'])
        assert.strict.deepEqual(r.map((u) => [u.id, u.cgrups]), [['a.b', 'N1'], ['x[0]', 'N2'], ['z', 'DB-Z']])
    })

    //迴歸保護(修前亦綠: kpIn 修前已為無原型容器, R-KEY-01)
    it('UNIT-PK-AP-003 id 為原型鍵名(constructor、toString、__proto__): 送入有該 id 之列才採納, 否則維持資料庫值', function() {
        let dbAp = () => [
            { id: 'constructor', order: 1, cgrups: 'DB-C' },
            { id: '__proto__', order: 2, cgrups: 'DB-P' },
            { id: 'toString', order: 3, cgrups: 'DB-T' },
            { id: 'k', order: 4, cgrups: 'DB-K' },
        ]
        //只送 k: 原型鍵名之列不得因繼承屬性而被誤採納
        let r0 = mergePickKeysOnly(dbAp(), [{ id: 'k', cgrups: 'NEW-K' }], 'id', ['cgrups'])
        assert.strict.deepEqual(r0.map((u) => u.cgrups), ['DB-C', 'DB-P', 'DB-T', 'NEW-K'])
        //精確送入 __proto__／constructor 之列: 採納
        let r1 = mergePickKeysOnly(dbAp(), [{ id: '__proto__', cgrups: 'N-P' }, { id: 'constructor', cgrups: 'N-C' }], 'id', ['cgrups'])
        assert.strict.deepEqual(r1.map((u) => u.cgrups), ['N-C', 'N-P', 'DB-T', 'DB-K'])
    })

})
