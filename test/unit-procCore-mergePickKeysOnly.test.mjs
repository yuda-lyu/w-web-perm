//procCore.mergePickKeysOnly 單元測試: modeEditUsers='for:grups' 之後端欄位限制(spec/流程_後台使用者清單.md〈參數來源〉modeEditUsers 三態)
//述語(R04f): 給定資料庫列 ltdtDb 與送入列 rowsIn, 只採納「既有列」之 pickKeys 欄位變更; 身分欄、新增列、缺列、順序一律以資料庫現值為準
import assert from 'assert'
import { mergePickKeysOnly } from '../server/procCore.mjs'


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

})
