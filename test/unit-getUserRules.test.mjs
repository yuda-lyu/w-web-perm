import assert from 'assert'
import { getUserRules } from '../src/plugins/mShare.mjs'
import { runChild, fileUrl, describeChild } from './tools/runChild.mjs'


// ---------------------------------------------------------------
// helpers
// ---------------------------------------------------------------

/** 建立 target 物件 */
let t = (id) => ({ id })

/** 建立 permission 物件，rules 為 { targetId: 'y'|'n' } */
let p = (name, rules = {}) => ({
    name,
    crules: JSON.stringify(rules),
})

/** 建立 group 物件，perms 為 { permName: { mode, isActive } } */
let g = (name, perms = {}) => ({
    name,
    cpemis: JSON.stringify(perms),
})

/** 建立 user 物件，groups 為 { groupName: { mode, isActive } } */
let u = (groups = {}) => ({
    cgrups: JSON.stringify(groups),
})

/** 從 rules 陣列取特定 target 的 isActive */
let ruleOf = (rules, targetName) => {
    let r = rules.find((v) => v.name === targetName)
    return r ? r.isActive : undefined
}

/** 將 rules 陣列轉為 { name: isActive } map，方便比對 */
let rulesToMap = (rules) => {
    let kp = {}
    rules.forEach((v) => { kp[v.name] = v.isActive })
    return kp
}

/** permission 內的 active entry 簡寫 */
let OR = { mode: 'OR', isActive: 'y' }
let AND = { mode: 'AND', isActive: 'y' }
let OR_OFF = { mode: 'OR', isActive: 'n' }
let AND_OFF = { mode: 'AND', isActive: 'n' }


// ---------------------------------------------------------------
// tests
// ---------------------------------------------------------------

describe('getUserRules - 權限樹組裝', function() {

    // ===========================================================
    // 基本場景
    // ===========================================================
    describe('基本場景', function() {

        it('UNIT-001-單一使用者、單一群組、單一權限、單一target — 授權 y', function() {
            let targets = [t('A')]
            let pemis = [p('P1', { A: 'y' })]
            let grups = [g('G1', { P1: OR })]
            let user = u({ G1: OR })

            let { rules } = getUserRules(user, grups, pemis, targets)
            assert.strictEqual(ruleOf(rules, 'A'), 'y')
        })

        it('UNIT-001a-單一使用者、單一群組、單一權限、單一target — 拒絕 n', function() {
            let targets = [t('A')]
            let pemis = [p('P1', { A: 'n' })]
            let grups = [g('G1', { P1: OR })]
            let user = u({ G1: OR })

            let { rules } = getUserRules(user, grups, pemis, targets)
            assert.strictEqual(ruleOf(rules, 'A'), 'n')
        })

        it('使用者沒有任何群組 — 全部 target 預設 n', function() {
            let targets = [t('A'), t('B')]
            let pemis = [p('P1', { A: 'y' })]
            let grups = [g('G1', { P1: OR })]
            let user = u({})

            let { rules } = getUserRules(user, grups, pemis, targets)
            assert.strictEqual(ruleOf(rules, 'A'), 'n')
            assert.strictEqual(ruleOf(rules, 'B'), 'n')
        })

        it('UNIT-009-cgrups 為空字串 — 不會拋錯、全部 target 預設 n', function() {
            let targets = [t('A')]
            let pemis = []
            let grups = []
            let user = { cgrups: '' }

            let { rules } = getUserRules(user, grups, pemis, targets)
            assert.strictEqual(ruleOf(rules, 'A'), 'n')
        })

        it('targets 為空陣列 — 回傳空 rules', function() {
            let targets = []
            let pemis = [p('P1', { A: 'y' })]
            let grups = [g('G1', { P1: OR })]
            let user = u({ G1: OR })

            let { rules } = getUserRules(user, grups, pemis, targets)
            // 輸出以「當前 targets」為主軸：targets 為空 → 沒有任何節點可輸出。
            // crules 雖授權 A，但 A 不在 targets 中（孤兒），不應殘留於 rules。
            assert.deepStrictEqual(rules, [])
        })

    })


    // ===========================================================
    // target 展開（未提及的 target 預設 'n'）
    // ===========================================================
    describe('target 展開', function() {

        it('UNIT-002-未被任何權限提及的 target 預設為 n', function() {
            let targets = [t('A'), t('B'), t('C')]
            let pemis = [p('P1', { A: 'y' })]
            let grups = [g('G1', { P1: OR })]
            let user = u({ G1: OR })

            let { rules } = getUserRules(user, grups, pemis, targets)
            assert.strictEqual(ruleOf(rules, 'A'), 'y')
            assert.strictEqual(ruleOf(rules, 'B'), 'n')
            assert.strictEqual(ruleOf(rules, 'C'), 'n')
        })

        it('UNIT-002a-多個權限覆蓋部分 targets — 其餘仍為 n', function() {
            let targets = [t('A'), t('B'), t('C'), t('D')]
            let pemis = [
                p('P1', { A: 'y', B: 'n' }),
                p('P2', { C: 'y' }),
            ]
            let grups = [g('G1', { P1: OR, P2: OR })]
            let user = u({ G1: OR })

            let { rules } = getUserRules(user, grups, pemis, targets)
            assert.strictEqual(ruleOf(rules, 'A'), 'y')
            assert.strictEqual(ruleOf(rules, 'B'), 'n')
            assert.strictEqual(ruleOf(rules, 'C'), 'y')
            assert.strictEqual(ruleOf(rules, 'D'), 'n')
        })

        it('crules 引用但已從 targets 刪除的孤兒 target — 不出現在 rules', function() {
            // targets 只剩 B（A 已被刪除），但 crules 對 A 與 B 皆授權。
            // 輸出以「當前 targets」為主軸：只列 B，孤兒 A 不殘留於權限樹。
            let targets = [t('B')]
            let pemis = [p('P1', { A: 'y', B: 'y' })]
            let grups = [g('G1', { P1: OR })]
            let user = u({ G1: OR })

            let { rules } = getUserRules(user, grups, pemis, targets)
            assert.strictEqual(ruleOf(rules, 'B'), 'y')
            assert.ok(!rules.some((r) => r.name === 'A'), '孤兒 target A 不應出現在 rules')
            assert.deepStrictEqual(rules.map((r) => r.name), ['B'])
        })

    })


    // ===========================================================
    // OR 模式合併
    // ===========================================================
    describe('OR 模式 — 權限層級', function() {

        it('UNIT-003-兩個權限 OR：其中一個 y 另一個 n → y', function() {
            let targets = [t('A')]
            let pemis = [
                p('P1', { A: 'y' }),
                p('P2', { A: 'n' }),
            ]
            let grups = [g('G1', { P1: OR, P2: OR })]
            let user = u({ G1: OR })

            let { rules } = getUserRules(user, grups, pemis, targets)
            assert.strictEqual(ruleOf(rules, 'A'), 'y')
        })

        it('UNIT-003a-兩個權限 OR：兩個都 n → n', function() {
            let targets = [t('A')]
            let pemis = [
                p('P1', { A: 'n' }),
                p('P2', { A: 'n' }),
            ]
            let grups = [g('G1', { P1: OR, P2: OR })]
            let user = u({ G1: OR })

            let { rules } = getUserRules(user, grups, pemis, targets)
            assert.strictEqual(ruleOf(rules, 'A'), 'n')
        })

        it('UNIT-003b-兩個權限 OR：互不重疊的 target 聯集', function() {
            let targets = [t('A'), t('B')]
            let pemis = [
                p('P1', { A: 'y' }),
                p('P2', { B: 'y' }),
            ]
            let grups = [g('G1', { P1: OR, P2: OR })]
            let user = u({ G1: OR })

            let { rules } = getUserRules(user, grups, pemis, targets)
            assert.strictEqual(ruleOf(rules, 'A'), 'y')
            assert.strictEqual(ruleOf(rules, 'B'), 'y')
        })

        it('UNIT-003c-三個權限 OR：漸進聯集', function() {
            let targets = [t('A'), t('B'), t('C')]
            let pemis = [
                p('P1', { A: 'y', B: 'n', C: 'n' }),
                p('P2', { A: 'n', B: 'y', C: 'n' }),
                p('P3', { A: 'n', B: 'n', C: 'y' }),
            ]
            let grups = [g('G1', { P1: OR, P2: OR, P3: OR })]
            let user = u({ G1: OR })

            let { rules } = getUserRules(user, grups, pemis, targets)
            assert.strictEqual(ruleOf(rules, 'A'), 'y')
            assert.strictEqual(ruleOf(rules, 'B'), 'y')
            assert.strictEqual(ruleOf(rules, 'C'), 'y')
        })

    })

    describe('OR 模式 — 群組層級', function() {

        it('UNIT-004-兩個群組 OR：其中一個群組授權 y → y', function() {
            let targets = [t('A')]
            let pemis = [
                p('P1', { A: 'y' }),
                p('P2', { A: 'n' }),
            ]
            let grups = [
                g('G1', { P1: OR }),
                g('G2', { P2: OR }),
            ]
            let user = u({ G1: OR, G2: OR })

            let { rules } = getUserRules(user, grups, pemis, targets)
            assert.strictEqual(ruleOf(rules, 'A'), 'y')
        })

        it('UNIT-004a-兩個群組 OR：互不重疊的 target 聯集', function() {
            let targets = [t('A'), t('B')]
            let pemis = [
                p('P1', { A: 'y' }),
                p('P2', { B: 'y' }),
            ]
            let grups = [
                g('G1', { P1: OR }),
                g('G2', { P2: OR }),
            ]
            let user = u({ G1: OR, G2: OR })

            let { rules } = getUserRules(user, grups, pemis, targets)
            assert.strictEqual(ruleOf(rules, 'A'), 'y')
            assert.strictEqual(ruleOf(rules, 'B'), 'y')
        })

    })


    // ===========================================================
    // AND 模式合併
    // ===========================================================
    describe('AND 模式 — 權限層級', function() {

        it('UNIT-005-兩個權限 AND：都是 y → y', function() {
            let targets = [t('A')]
            let pemis = [
                p('P1', { A: 'y' }),
                p('P2', { A: 'y' }),
            ]
            let grups = [g('G1', { P1: AND, P2: AND })]
            let user = u({ G1: OR })

            let { rules } = getUserRules(user, grups, pemis, targets)
            assert.strictEqual(ruleOf(rules, 'A'), 'y')
        })

        it('UNIT-005a-兩個權限 AND：一個 y 一個 n → n', function() {
            let targets = [t('A')]
            let pemis = [
                p('P1', { A: 'y' }),
                p('P2', { A: 'n' }),
            ]
            let grups = [g('G1', { P1: AND, P2: AND })]
            let user = u({ G1: OR })

            let { rules } = getUserRules(user, grups, pemis, targets)
            assert.strictEqual(ruleOf(rules, 'A'), 'n')
        })

        it('UNIT-005b-AND 對稱性（R-AUTH-MERGE-00，取代 ADR-001 非對稱）：key 只存在於 obj1 → 視 obj2 為未給＝n，結果為 n', function() {
            // P1 有 A 和 B，P2 只有 A
            // 新規則：每一項「未給」＝ n，AND 為所有項之交集；B 在 P2 未給 → n
            // （舊規則：以 P1 為基底、B 不在 P2 → 保留 P1 的 y）
            let targets = [t('A'), t('B')]
            let pemis = [
                p('P1', { A: 'y', B: 'y' }),
                p('P2', { A: 'y' }),
            ]
            let grups = [g('G1', { P1: AND, P2: AND })]
            let user = u({ G1: OR })

            let { rules } = getUserRules(user, grups, pemis, targets)
            assert.strictEqual(ruleOf(rules, 'A'), 'y')
            assert.strictEqual(ruleOf(rules, 'B'), 'n') // B 在 P2 未給 → n
        })

        it('UNIT-005c-AND 對稱性（R-AUTH-MERGE-00）：key 只存在於 obj2 → 視 obj1 為未給＝n，結果為 n（與 005b 對調順序同結果）', function() {
            // P1 只有 A，P2 有 A 和 B
            // B 在 P1 未給 → n（舊規則亦為 n；本案例保留以固定「兩種儲存順序結果相同」）
            let targets = [t('A'), t('B')]
            let pemis = [
                p('P1', { A: 'y' }),
                p('P2', { A: 'y', B: 'y' }),
            ]
            let grups = [g('G1', { P1: AND, P2: AND })]
            let user = u({ G1: OR })

            let { rules } = getUserRules(user, grups, pemis, targets)
            assert.strictEqual(ruleOf(rules, 'A'), 'y')
            assert.strictEqual(ruleOf(rules, 'B'), 'n') // B 在 P1 未給 → n
        })

        it('UNIT-005g-AND 交換律：P1、P2 在 cpemis 之順序對調，結果相同（R-AUTH-MERGE-00 第 4 條；舊規則：P1 在前得 {A,B}、P2 在前得 {A}）', function() {
            let targets = [t('A'), t('B')]
            let pemis = [
                p('P1', { A: 'y', B: 'y' }),
                p('P2', { A: 'y' }),
            ]
            let r12 = getUserRules(u({ G1: OR }), [g('G1', { P1: AND, P2: AND })], pemis, targets).rules
            let r21 = getUserRules(u({ G1: OR }), [g('G1', { P2: AND, P1: AND })], pemis, targets).rules
            assert.deepStrictEqual(rulesToMap(r12), { A: 'y', B: 'n' })
            assert.deepStrictEqual(rulesToMap(r21), { A: 'y', B: 'n' })
        })

    })

    describe('AND 模式 — 群組層級', function() {

        it('UNIT-005d-兩個群組 AND：同一 target 都授權 → y', function() {
            let targets = [t('A')]
            let pemis = [
                p('P1', { A: 'y' }),
                p('P2', { A: 'y' }),
            ]
            let grups = [
                g('G1', { P1: OR }),
                g('G2', { P2: OR }),
            ]
            let user = u({ G1: AND, G2: AND })

            let { rules } = getUserRules(user, grups, pemis, targets)
            assert.strictEqual(ruleOf(rules, 'A'), 'y')
        })

        it('UNIT-005e-兩個群組 AND：一個授權一個拒絕 → n', function() {
            let targets = [t('A')]
            let pemis = [
                p('P1', { A: 'y' }),
                p('P2', { A: 'n' }),
            ]
            let grups = [
                g('G1', { P1: OR }),
                g('G2', { P2: OR }),
            ]
            let user = u({ G1: AND, G2: AND })

            let { rules } = getUserRules(user, grups, pemis, targets)
            assert.strictEqual(ruleOf(rules, 'A'), 'n')
        })

    })


    // ===========================================================
    // 授權合併規則 R-AUTH-MERGE-00(使用者裁示 2026-10-21; ADR-033 取代 ADR-001 非對稱條)
    // 每一項「未給」＝ n; 全對象 n 起點 → 所有 OR 聯集(無 OR 時第一個 AND 為基底)→ 與所有 AND 交集; 結果與排列順序無關
    // ===========================================================
    describe('UNIT-AM 授權合併規則(R-AUTH-MERGE-00)', function() {

        // 使用者之例: 管理對象 a～e; x = { a:y, b:y, c:n }(d、e 未給), y = { b:y, d:y, e:y }(a、c 未給)
        let targets = ['a', 'b', 'c', 'd', 'e'].map(t)
        let pemis = [
            p('PX', { a: 'y', b: 'y', c: 'n' }),
            p('PY', { b: 'y', d: 'y', e: 'y' }),
        ]
        let yOf = (rules) => rules.filter((v) => v.isActive === 'y').map((v) => v.name).sort().join('')

        // [x 模式, y 模式, 預期有權限之管理對象]
        let cases = [
            ['OR', 'OR', 'abde'], // x OR y = {a,b,d,e}
            ['AND', 'AND', 'b'], // x AND y = y AND x = {b}
            ['OR', 'AND', 'b'], // x OR + y AND: {a,b} ∩ {b,d,e} = {b}
            ['AND', 'OR', 'b'], // y OR + x AND: {b,d,e} ∩ {a,b} = {b}
        ]

        it('UNIT-AM-001-權限層: 使用者之例——兩個權限四種模式組合，cpemis 之兩種儲存順序結果相同', function() {
            cases.forEach(([mx, my, exp]) => {
                let M = { OR, AND }
                let xy = getUserRules(u({ G1: OR }), [g('G1', { PX: M[mx], PY: M[my] })], pemis, targets).rules
                let yx = getUserRules(u({ G1: OR }), [g('G1', { PY: M[my], PX: M[mx] })], pemis, targets).rules
                assert.strictEqual(yOf(xy), exp, `x ${mx} / y ${my} (x 先)`)
                assert.strictEqual(yOf(yx), exp, `x ${mx} / y ${my} (y 先)`)
            })
        })

        it('UNIT-AM-002-群組層: 同一組項目放在使用者下（兩個群組各含單一 OR 權限），cgrups 之兩種儲存順序結果相同', function() {
            cases.forEach(([mx, my, exp]) => {
                let M = { OR, AND }
                let grups = [g('GX', { PX: OR }), g('GY', { PY: OR })]
                let xy = getUserRules(u({ GX: M[mx], GY: M[my] }), grups, pemis, targets).rules
                let yx = getUserRules(u({ GY: M[my], GX: M[mx] }), grups, pemis, targets).rules
                assert.strictEqual(yOf(xy), exp, `x ${mx} / y ${my} (x 先)`)
                assert.strictEqual(yOf(yx), exp, `x ${mx} / y ${my} (y 先)`)
            })
        })

        it('UNIT-AM-003-陣列形式之元素順序、crules 物件鍵序皆不影響結果', function() {
            let arr = (items) => JSON.stringify(items)
            let grupsA = (order) => [{ name: 'G1', cpemis: arr(order.map(([n, m]) => ({ name: n, mode: m, isActive: 'y' }))) }]
            let userA = { cgrups: arr([{ name: 'G1', mode: 'OR', isActive: 'y' }]) }
            let a = getUserRules(userA, grupsA([['PX', 'AND'], ['PY', 'AND']]), pemis, targets).rules
            let b = getUserRules(userA, grupsA([['PY', 'AND'], ['PX', 'AND']]), pemis, targets).rules
            assert.strictEqual(yOf(a), 'b')
            assert.strictEqual(yOf(b), 'b')
            //crules 物件鍵序對調
            let pemisRev = [
                { name: 'PX', crules: '{"c":"n","b":"y","a":"y"}' },
                { name: 'PY', crules: '{"e":"y","d":"y","b":"y"}' },
            ]
            let c = getUserRules(u({ G1: OR }), [g('G1', { PX: AND, PY: AND })], pemisRev, targets).rules
            assert.strictEqual(yOf(c), 'b')
        })

        it('UNIT-AM-004-空 AND 項（未給任何對象）＝ 全 n: 與 OR 並存時把 OR 聯集全部收回，且與儲存順序無關（舊規則: 排前全 n、排後無影響）', function() {
            let ps = [p('PE', {}), p('PO', { a: 'y', b: 'y' })]
            let tg = [t('a'), t('b')]
            let ao = getUserRules(u({ G1: OR }), [g('G1', { PE: AND, PO: OR })], ps, tg).rules
            let oa = getUserRules(u({ G1: OR }), [g('G1', { PO: OR, PE: AND })], ps, tg).rules
            assert.strictEqual(yOf(ao), '')
            assert.strictEqual(yOf(oa), '')
            //只有 AND（空 AND 與有授權 AND）
            let ps2 = [p('PE', {}), p('PR', { a: 'y', b: 'y' })]
            let e1 = getUserRules(u({ G1: OR }), [g('G1', { PE: AND, PR: AND })], ps2, tg).rules
            let e2 = getUserRules(u({ G1: OR }), [g('G1', { PR: AND, PE: AND })], ps2, tg).rules
            assert.strictEqual(yOf(e1), '')
            assert.strictEqual(yOf(e2), '')
        })

        it('UNIT-AM-007-群組層: 內無有效權限之 AND 群組（其權限皆停用，或只引用查無之權限）＝ 全部 n，與 cgrups 儲存順序無關（spec E2E-014 ③④；外審 minimax R9: 原僅權限層有守護）', function() {
            let tg = ['a', 'b'].map(t)
            let ps = [p('PO', { a: 'y', b: 'y' })]
            let gO = g('GO', { PO: OR })
            //③ GE 內 PE 停用（pemis 表有 PE，但 cpemis 內 isActive=n）④ GE 只引用查無之權限 PX
            let psAll = [...ps, p('PE', { a: 'y', b: 'y' })]
            let gE3 = g('GE', { PE: { mode: 'OR', isActive: 'n' } })
            let gE4 = g('GE', { PX: OR })
            for (let [label, gE, pemisTbl] of [['③停用', gE3, psAll], ['④查無', gE4, ps]]) {
                let ao = getUserRules(u({ GE: AND, GO: OR }), [gE, gO], pemisTbl, tg).rules
                let oa = getUserRules(u({ GO: OR, GE: AND }), [gO, gE], pemisTbl, tg).rules
                assert.strictEqual(yOf(ao), '', `${label} GE(AND) 在前`)
                assert.strictEqual(yOf(oa), '', `${label} GE(AND) 在後`)
                //對照：GE 為 OR 時不收回
                let orGE = getUserRules(u({ GE: OR, GO: OR }), [gE, gO], pemisTbl, tg).rules
                assert.strictEqual(yOf(orGE), 'ab', `${label} 對照: GE 為 OR 時由 GO 決定`)
            }
        })

        it('UNIT-AM-008-整數式名稱（spec E2E-013 ④）: 權限名 "2"（a、b）與 "10"（只 a）皆 AND，物件形式與陣列形式、兩種元素序皆只有 a 為 y（外審 minimax R9）', function() {
            let tg = ['a', 'b'].map(t)
            let ps = [p('2', { a: 'y', b: 'y' }), p('10', { a: 'y' })]
            let user = { cgrups: JSON.stringify({ G1: OR }) }
            let run = (cpemis) => yOf(getUserRules(user, [{ name: 'G1', cpemis }], ps, tg).rules)
            assert.strictEqual(run('{"10":{"mode":"AND","isActive":"y"},"2":{"mode":"AND","isActive":"y"}}'), 'a', '物件形式（JS 屬性序恆 2 在前）')
            assert.strictEqual(run('{"2":{"mode":"AND","isActive":"y"},"10":{"mode":"AND","isActive":"y"}}'), 'a')
            assert.strictEqual(run('[{"name":"10","mode":"AND","isActive":"y"},{"name":"2","mode":"AND","isActive":"y"}]'), 'a', '陣列形式 10 在前')
            assert.strictEqual(run('[{"name":"2","mode":"AND","isActive":"y"},{"name":"10","mode":"AND","isActive":"y"}]'), 'a', '陣列形式 2 在前')
        })

        it('UNIT-AM-005-同一 crules（陣列形式）重複列同名規則: 所有列皆 y 才 y，與列之順序無關（舊規則: 後者覆蓋前者，順序相依）', function() {
            let mk = (items) => [{ name: 'PA', crules: JSON.stringify(items.map((s) => ({ name: 'a', isActive: s }))) }]
            let tg = [t('a')]
            let run = (items) => getUserRules(u({ G1: OR }), [g('G1', { PA: OR })], mk(items), tg).rules
            assert.strictEqual(yOf(run(['y', 'n'])), '')
            assert.strictEqual(yOf(run(['n', 'y'])), '')
            assert.strictEqual(yOf(run(['y', 'y'])), 'a')
            assert.strictEqual(yOf(run(['n', 'n'])), '')
        })

        it('UNIT-AM-006-只會收回不會多給: 三個項目（OR／AND 任意組合）之全部排列，結果等於 (OR 聯集) ∩ (所有 AND)', function() {
            let ps = [p('P1', { a: 'y', b: 'y' }), p('P2', { b: 'y', c: 'y' }), p('P3', { a: 'y', c: 'y', d: 'y' })]
            let tg = ['a', 'b', 'c', 'd'].map(t)
            let sets = { P1: ['a', 'b'], P2: ['b', 'c'], P3: ['a', 'c', 'd'] }
            let names = ['P1', 'P2', 'P3']
            let perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]
            for (let m1 of ['OR', 'AND']) {
                for (let m2 of ['OR', 'AND']) {
                    for (let m3 of ['OR', 'AND']) {
                        let modes = { P1: m1, P2: m2, P3: m3 }
                        let ors = names.filter((n) => modes[n] === 'OR')
                        let ands = names.filter((n) => modes[n] === 'AND')
                        let exp = tg.map((x) => x.id).filter((k) => (ors.length > 0 ? ors.some((n) => sets[n].includes(k)) : true) && ands.every((n) => sets[n].includes(k))).join('')
                        perms.forEach((pm) => {
                            let perm = {}
                            pm.forEach((i) => { perm[names[i]] = { mode: modes[names[i]], isActive: 'y' } })
                            let got = yOf(getUserRules(u({ G1: OR }), [g('G1', perm)], ps, tg).rules)
                            assert.strictEqual(got, exp, `${m1}${m2}${m3} 順序 ${pm}`)
                        })
                    }
                }
            }
        })

    })


    // ===========================================================
    // UNIT-CDE: R-PRINCIPLE-00 適用表 c(懸空)／d(同名多列)／e(mode 非法)(run05; R-AUTH-MERGE-00 第 5 條之修改)
    // c: 引用之群組／權限查無 → 該項以其 mode 參與、內容全 n; d: 名稱對到多筆 → 內容取各筆之交集; e: mode 缺或非 OR／AND → 視為 AND
    // isActive 非 'y' 之引用不參與(不變)
    // ===========================================================
    describe('UNIT-CDE 懸空／同名多列／mode 非法(run05)', function() {

        let tg = ['A', 'B', 'C'].map(t)
        let yOf = (rules) => rules.filter((v) => v.isActive === 'y').map((v) => v.name).join('')
        let pemis = [p('PAB', { A: 'y', B: 'y' }), p('PBC', { B: 'y', C: 'y' }), p('PA', { A: 'y' }), p('PALL', { A: 'y', B: 'y', C: 'y' })]
        let grups = [g('GAB', { PAB: OR }), g('GBC', { PBC: OR }), g('GALL', { PALL: OR })]
        let run = (user, gs = grups, ps = pemis) => yOf(getUserRules(user, gs, ps, tg).rules)

        it('UNIT-CDE-c01-懸空 AND 使結果為空: 使用者 GALL(OR)＋GX(AND, 群組表查無) → 全 n(run04: GX 不計入 → ABC)', function() {
            assert.strictEqual(run(u({ GALL: OR, GX: AND })), '')
            assert.strictEqual(run(u({ GX: AND, GALL: OR })), '', '順序對調')
        })

        it('UNIT-CDE-c02-懸空 OR 無影響: GAB(OR)＋GX(OR, 查無) → AB, 與無 GX 者相同; 另有 AND GBC → B', function() {
            assert.strictEqual(run(u({ GAB: OR, GX: OR })), 'AB')
            assert.strictEqual(run(u({ GX: OR, GAB: OR, GBC: AND })), 'B')
        })

        it('UNIT-CDE-c03-OR 懸空＋AND X(無其他 OR) → 空: 有 OR 項使基底為 OR 聯集(懸空 OR 貢獻空集合)而非第一個 AND(run04: 以 GAB 為基底 → AB)', function() {
            assert.strictEqual(run(u({ GX: OR, GAB: AND })), '')
            assert.strictEqual(run(u({ GAB: AND, GX: OR })), '')
        })

        it('UNIT-CDE-c04-權限層同形: 群組內 PX(AND, 權限表查無) → 群組內容為空; PX(OR) → 不影響', function() {
            assert.strictEqual(run(u({ G1: OR }), [g('G1', { PALL: OR, PX: AND })]), '')
            assert.strictEqual(run(u({ G1: OR }), [g('G1', { PAB: OR, PX: OR })]), 'AB')
            assert.strictEqual(run(u({ G1: OR }), [g('G1', { PX: OR, PAB: AND })]), '', 'OR 懸空＋AND PAB')
        })

        it('UNIT-CDE-c05-isActive 為 n 之懸空引用仍不參與(不收回): GALL(OR)＋GX(AND, 停用, 查無) → ABC; 權限層同', function() {
            assert.strictEqual(run(u({ GALL: OR, GX: AND_OFF })), 'ABC')
            assert.strictEqual(run(u({ G1: OR }), [g('G1', { PALL: OR, PX: AND_OFF })]), 'ABC')
        })

        it('UNIT-CDE-d01-同名兩群組列(歷史同名)取交集: G1 兩列(含 PAB、含 PBC) → B, 兩種表列順序相同(run04: 取第一列 → AB 或 BC)', function() {
            let r1 = g('G1', { PAB: OR })
            let r2 = g('G1', { PBC: OR })
            assert.strictEqual(run(u({ G1: OR }), [r1, r2]), 'B')
            assert.strictEqual(run(u({ G1: OR }), [r2, r1]), 'B')
            assert.strictEqual(run(u({ GALL: OR, G1: AND }), [g('GALL', { PALL: OR }), r1, r2]), 'B', 'AND 引用同名兩列: ABC ∩ (AB ∩ BC)')
        })

        it('UNIT-CDE-d02-同名兩權限列取交集(權限層): P1 兩列 {A,B}、{B,C} → B, 兩種表列順序相同; 三列 {A,B,C}、{A,B}、{B,C} → B', function() {
            let gs = [g('G1', { P1: OR })]
            assert.strictEqual(run(u({ G1: OR }), gs, [p('P1', { A: 'y', B: 'y' }), p('P1', { B: 'y', C: 'y' })]), 'B')
            assert.strictEqual(run(u({ G1: OR }), gs, [p('P1', { B: 'y', C: 'y' }), p('P1', { A: 'y', B: 'y' })]), 'B')
            assert.strictEqual(run(u({ G1: OR }), gs, [p('P1', { A: 'y', B: 'y', C: 'y' }), p('P1', { A: 'y', B: 'y' }), p('P1', { B: 'y', C: 'y' })]), 'B')
        })

        it('UNIT-CDE-d03-同名多列其一內容為空 → 該項內容為空: 群組 G1 兩列(含 PAB、無權限) → 全 n; 權限 P1 兩列({A,B}、{}) → 全 n; 內容相同之兩列 → 同單一列', function() {
            assert.strictEqual(run(u({ G1: OR }), [g('G1', { PAB: OR }), g('G1', {})]), '')
            assert.strictEqual(run(u({ G1: OR }), [g('G1', { P1: OR })], [p('P1', { A: 'y', B: 'y' }), p('P1', {})]), '')
            assert.strictEqual(run(u({ G1: OR }), [g('G1', { PAB: OR }), g('G1', { PAB: OR })]), 'AB')
        })

        it('UNIT-CDE-e01-mode 缺 → 視為 AND: 群組內 PALL(OR)＋PA({ isActive: y }, 無 mode) → A(run04: PA 不計入 → ABC)', function() {
            assert.strictEqual(run(u({ G1: OR }), [g('G1', { PALL: OR, PA: { isActive: 'y' } })]), 'A')
        })

        it('UNIT-CDE-e02-mode 為 "or"(小寫)、"XOR"、"" → 視為 AND(群組層與權限層)', function() {
            for (let m of ['or', 'XOR', '']) {
                assert.strictEqual(run(u({ G1: OR }), [g('G1', { PALL: OR, PA: { mode: m, isActive: 'y' } })]), 'A', `權限層 mode=${m}`)
                assert.strictEqual(run(u({ GALL: OR, GAB: { mode: m, isActive: 'y' } })), 'AB', `群組層 mode=${m}`)
            }
        })

        it('UNIT-CDE-e03-mode 為數字 1、null、true → 視為 AND; 停用者(isActive n)仍不參與', function() {
            for (let m of [1, null, true]) {
                assert.strictEqual(run(u({ GALL: OR, GAB: { mode: m, isActive: 'y' } })), 'AB', `mode=${String(m)}`)
                assert.strictEqual(run(u({ GALL: OR, GAB: { mode: m, isActive: 'n' } })), 'ABC', `停用 mode=${String(m)}`)
            }
        })

        it('UNIT-CDE-e04-mode 非法之項為該層唯一(或全部)啟用項: 限制項不當基底, 該層無 mode 合法之項 → 全 n(主責裁示, 與 run04「不計入」同, 不多給); 另有合法項則與 AND 等價', function() {
            assert.strictEqual(run(u({ GAB: { mode: 'or', isActive: 'y' } })), '', '使用者唯一群組 mode=or')
            assert.strictEqual(run(u({ GAB: { isActive: 'y' }, GBC: { mode: 'XOR', isActive: 'y' } })), '', '兩個群組皆 mode 非法')
            assert.strictEqual(run(u({ G1: OR }), [g('G1', { PA: { isActive: 'y' } })]), '', '群組內唯一權限缺 mode')
            assert.strictEqual(run(u({ GALL: OR, G1: AND }), [g('GALL', { PALL: OR }), g('G1', { PA: { mode: 1, isActive: 'y' } })]), '', 'AND 群組內唯一權限 mode 非法 → 群組內容為空 → 收回')
            assert.strictEqual(run(u({ GAB: 'y' })), '', '物件形式純量值 {"GAB":"y"}')
            assert.strictEqual(run(u({ GAB: { isActive: 'y' }, GBC: AND })), 'B', '另有合法 AND 項(基底) → 限制項交集')
        })

        it('UNIT-CDE-f01-空字串名稱之引用: 與名稱為 "" 之列相符(照常參與); 列無 name 欄亦視為 ""; 無此列則懸空(AND → 全 n)', function() {
            let gE = { name: '', cpemis: JSON.stringify({ PAB: OR }) }
            assert.strictEqual(run(u({ '': OR }), [gE]), 'AB')
            assert.strictEqual(run(u({ '': OR }), [{ cpemis: gE.cpemis }]), 'AB', '列無 name 欄')
            assert.strictEqual(run(u({ 'GALL': OR, '': AND })), '', '查無名稱 "" 之列 → 懸空 AND')
            assert.strictEqual(run(u({ 'GALL': OR, '': AND }), [...grups, gE]), 'AB', '有名稱 "" 之列 → ABC ∩ AB')
        })

        it('UNIT-CDE-m01-不改動輸入之表列(舊版就地寫入 grups 列之 _pemis 與 pemis 列之 _rules; 新版回傳複本): 含懸空與同名多列', function() {
            let gs = [g('G1', { PAB: OR, PX: AND }), g('G1', { PBC: OR }), g('G2', { P1: OR })]
            let ps = [...pemis, p('P1', { A: 'y' }), p('P1', { A: 'y', B: 'y' })]
            let user = u({ G1: OR, G2: AND, GX: OR })
            let before = JSON.stringify([user, gs, ps, tg])
            let out = getUserRules(user, gs, ps, tg)
            assert.strictEqual(JSON.stringify([user, gs, ps, tg]), before, '輸入四者逐字元不變')
            gs.forEach((x) => assert.ok(!('_pemis' in x), '群組列無 _pemis'))
            ps.forEach((x) => assert.ok(!('_rules' in x), '權限列無 _rules'))
            //回傳之 grups 樹: 只含查得之群組(GX 懸空不列), 同名多列以第一列為代表; data 為複本(非輸入列本身)
            assert.deepStrictEqual(out.grups.map((x) => x.name), ['G1', 'G2'])
            assert.notStrictEqual(out.grups[0].data, gs[0])
            assert.strictEqual(yOf(out.rules), '', 'G1 兩列: 第一列含懸空 AND → 空, 交集為空; AND G2 → 空')
        })

    })


    // ===========================================================
    // 混合 OR/AND
    // ===========================================================
    describe('混合 OR/AND', function() {

        it('UNIT-006-權限層級混合：OR 和 AND 權限共存於同一群組', function() {
            // P1(OR): A=y, B=n
            // P2(OR): A=n, B=y
            // P3(AND): A=y, B=y
            //
            // Step1 OR: P1 OR P2 = {A:'y', B:'y'}
            // Step2 AND: {A:'y', B:'y'} AND P3{A:'y', B:'y'} = {A:'y', B:'y'}
            let targets = [t('A'), t('B')]
            let pemis = [
                p('P1', { A: 'y', B: 'n' }),
                p('P2', { A: 'n', B: 'y' }),
                p('P3', { A: 'y', B: 'y' }),
            ]
            let grups = [g('G1', { P1: OR, P2: OR, P3: AND })]
            let user = u({ G1: OR })

            let { rules } = getUserRules(user, grups, pemis, targets)
            assert.strictEqual(ruleOf(rules, 'A'), 'y')
            assert.strictEqual(ruleOf(rules, 'B'), 'y')
        })

        it('UNIT-006a-權限層級混合：AND 收緊 OR 結果', function() {
            // P1(OR): A=y, B=y
            // P2(AND): A=y, B=n
            //
            // Step1 OR: P1 = {A:'y', B:'y'}
            // Step2 AND: {A:'y', B:'y'} AND {A:'y', B:'n'} = {A:'y', B:'n'}
            let targets = [t('A'), t('B')]
            let pemis = [
                p('P1', { A: 'y', B: 'y' }),
                p('P2', { A: 'y', B: 'n' }),
            ]
            let grups = [g('G1', { P1: OR, P2: AND })]
            let user = u({ G1: OR })

            let { rules } = getUserRules(user, grups, pemis, targets)
            assert.strictEqual(ruleOf(rules, 'A'), 'y')
            assert.strictEqual(ruleOf(rules, 'B'), 'n') // AND 收緊
        })

        it('UNIT-006b-群組層級混合：OR 群組 + AND 群組', function() {
            // G1(OR): P1 → {A:'y', B:'y'}
            // G2(AND): P2 → {A:'y', B:'n'}
            //
            // Step1 OR groups: G1 = {A:'y', B:'y'}
            // Step2 AND groups: {A:'y', B:'y'} AND G2{A:'y', B:'n'} = {A:'y', B:'n'}
            let targets = [t('A'), t('B')]
            let pemis = [
                p('P1', { A: 'y', B: 'y' }),
                p('P2', { A: 'y', B: 'n' }),
            ]
            let grups = [
                g('G1', { P1: OR }),
                g('G2', { P2: OR }),
            ]
            let user = u({ G1: OR, G2: AND })

            let { rules } = getUserRules(user, grups, pemis, targets)
            assert.strictEqual(ruleOf(rules, 'A'), 'y')
            assert.strictEqual(ruleOf(rules, 'B'), 'n')
        })

        it('UNIT-006c-群組層級混合：多 OR + 多 AND 交互', function() {
            // G1(OR): P1 → {A:'y', B:'n', C:'n'}
            // G2(OR): P2 → {A:'n', B:'y', C:'n'}
            // G3(AND): P3 → {A:'y', B:'y', C:'y'}
            //
            // OR: G1 OR G2 = {A:'y', B:'y', C:'n'}
            // AND: {A:'y', B:'y', C:'n'} AND G3{A:'y', B:'y', C:'y'} = {A:'y', B:'y', C:'n'}
            let targets = [t('A'), t('B'), t('C')]
            let pemis = [
                p('P1', { A: 'y', B: 'n', C: 'n' }),
                p('P2', { A: 'n', B: 'y', C: 'n' }),
                p('P3', { A: 'y', B: 'y', C: 'y' }),
            ]
            let grups = [
                g('G1', { P1: OR }),
                g('G2', { P2: OR }),
                g('G3', { P3: OR }),
            ]
            let user = u({ G1: OR, G2: OR, G3: AND })

            let { rules } = getUserRules(user, grups, pemis, targets)
            assert.strictEqual(ruleOf(rules, 'A'), 'y')
            assert.strictEqual(ruleOf(rules, 'B'), 'y')
            assert.strictEqual(ruleOf(rules, 'C'), 'n') // OR 結果 C=n，AND 不會變 y
        })

    })


    // ===========================================================
    // isActive 過濾
    // ===========================================================
    describe('isActive 過濾', function() {

        it('UNIT-007-群組 isActive=n — 該群組被忽略', function() {
            let targets = [t('A')]
            let pemis = [p('P1', { A: 'y' })]
            let grups = [g('G1', { P1: OR })]
            let user = u({ G1: { mode: 'OR', isActive: 'n' } })

            let { rules } = getUserRules(user, grups, pemis, targets)
            assert.strictEqual(ruleOf(rules, 'A'), 'n') // 群組被忽略，預設 n
        })

        it('UNIT-007a-權限 isActive=n — 該權限被忽略', function() {
            let targets = [t('A')]
            let pemis = [
                p('P1', { A: 'y' }),
                p('P2', { A: 'n' }),
            ]
            let grups = [g('G1', { P1: OR_OFF, P2: OR })]
            let user = u({ G1: OR })

            let { rules } = getUserRules(user, grups, pemis, targets)
            // P1 被關閉，只剩 P2(A=n)
            assert.strictEqual(ruleOf(rules, 'A'), 'n')
        })

        it('UNIT-007b-全部群組皆 inactive — 全部 target 為 n', function() {
            let targets = [t('A'), t('B')]
            let pemis = [p('P1', { A: 'y', B: 'y' })]
            let grups = [g('G1', { P1: OR })]
            let user = u({
                G1: { mode: 'OR', isActive: 'n' },
            })

            let { rules } = getUserRules(user, grups, pemis, targets)
            assert.strictEqual(ruleOf(rules, 'A'), 'n')
            assert.strictEqual(ruleOf(rules, 'B'), 'n')
        })

        it('UNIT-007c-混合 active/inactive 權限', function() {
            let targets = [t('A'), t('B')]
            let pemis = [
                p('P1', { A: 'y', B: 'n' }),
                p('P2', { A: 'n', B: 'y' }),
            ]
            // P1 啟用, P2 停用 → 只有 P1 生效
            let grups = [g('G1', { P1: OR, P2: OR_OFF })]
            let user = u({ G1: OR })

            let { rules } = getUserRules(user, grups, pemis, targets)
            assert.strictEqual(ruleOf(rules, 'A'), 'y')
            assert.strictEqual(ruleOf(rules, 'B'), 'n')
        })

        it('UNIT-007d-群組內所有權限皆 inactive — 該群組產出空 rules', function() {
            let targets = [t('A')]
            let pemis = [p('P1', { A: 'y' })]
            let grups = [g('G1', { P1: OR_OFF })]
            let user = u({ G1: OR })

            let { rules } = getUserRules(user, grups, pemis, targets)
            assert.strictEqual(ruleOf(rules, 'A'), 'n')
        })

    })


    // ===========================================================
    // 名稱匹配（找不到對應的 group/permission）
    // ===========================================================
    describe('名稱匹配失敗', function() {

        //run05(R-PRINCIPLE-00 c): 查無之引用不再「被忽略」, 而是以其 mode 參與、內容全 n——下列三案皆為 OR 引用, 結果與修前相同; AND 懸空見 UNIT-CDE-c01／c04
        it('UNIT-008-使用者引用不存在的群組(OR) — run05: 懸空 OR 內容全 n, 不增加授權', function() {
            let targets = [t('A')]
            let pemis = [p('P1', { A: 'y' })]
            let grups = [g('G1', { P1: OR })]
            let user = u({ G_NOT_EXIST: OR })

            let { rules } = getUserRules(user, grups, pemis, targets)
            assert.strictEqual(ruleOf(rules, 'A'), 'n')
        })

        it('UNIT-008a-群組引用不存在的權限(OR) — run05: 懸空 OR 內容全 n, 群組內容為空', function() {
            let targets = [t('A')]
            let pemis = [p('P1', { A: 'y' })]
            let grups = [g('G1', { P_NOT_EXIST: OR })]
            let user = u({ G1: OR })

            let { rules } = getUserRules(user, grups, pemis, targets)
            assert.strictEqual(ruleOf(rules, 'A'), 'n')
        })

        it('UNIT-008b-部分匹配(OR) — run05: 匹配到者照常, 懸空 OR 不增加', function() {
            let targets = [t('A'), t('B')]
            let pemis = [p('P1', { A: 'y' })]
            let grups = [g('G1', { P1: OR, P_NOT_EXIST: OR })]
            let user = u({ G1: OR })

            let { rules } = getUserRules(user, grups, pemis, targets)
            assert.strictEqual(ruleOf(rules, 'A'), 'y')
            assert.strictEqual(ruleOf(rules, 'B'), 'n')
        })

    })


    // ===========================================================
    // 邊界情況
    // ===========================================================
    describe('邊界情況', function() {

        it('權限的 crules 為空物件 — 不產出任何 rule', function() {
            let targets = [t('A')]
            let pemis = [p('P1', {})]
            let grups = [g('G1', { P1: OR })]
            let user = u({ G1: OR })

            let { rules } = getUserRules(user, grups, pemis, targets)
            assert.strictEqual(ruleOf(rules, 'A'), 'n')
        })

        it('單一權限覆蓋多個 targets', function() {
            let targets = [t('A'), t('B'), t('C'), t('D'), t('E')]
            let pemis = [p('P1', { A: 'y', B: 'y', C: 'n', D: 'y', E: 'n' })]
            let grups = [g('G1', { P1: OR })]
            let user = u({ G1: OR })

            let { rules } = getUserRules(user, grups, pemis, targets)
            let m = rulesToMap(rules)
            assert.deepStrictEqual(
                { A: m.A, B: m.B, C: m.C, D: m.D, E: m.E },
                { A: 'y', B: 'y', C: 'n', D: 'y', E: 'n' }
            )
        })

        it('回傳結構包含 grups 和 rules', function() {
            let targets = [t('A')]
            let pemis = [p('P1', { A: 'y' })]
            let grups = [g('G1', { P1: OR })]
            let user = u({ G1: OR })

            let result = getUserRules(user, grups, pemis, targets)
            assert.ok(Array.isArray(result.grups))
            assert.ok(Array.isArray(result.rules))
        })

        it('UNIT-007e-grups 回傳中僅包含 active 且匹配的群組', function() {
            let targets = [t('A')]
            let pemis = [p('P1', { A: 'y' })]
            let grups = [g('G1', { P1: OR }), g('G2', { P1: OR })]
            let user = u({
                G1: OR,
                G2: { mode: 'OR', isActive: 'n' },
                G3: OR, // 不存在
            })

            let result = getUserRules(user, grups, pemis, targets)
            // 只有 G1 是 active 且存在的
            assert.strictEqual(result.grups.length, 1)
            assert.strictEqual(result.grups[0].name, 'G1')
        })

    })


    // ===========================================================
    // 複雜實際場景
    // ===========================================================
    describe('複雜實際場景', function() {

        it('UNIT-010-模擬完整權限樹：多使用者群組、多權限、多 target', function() {
            // Targets: 頁面結構
            let targets = [
                t('專案A/頁A'),
                t('專案A/頁B'),
                t('專案A/頁A/按鈕1'),
                t('專案B/頁A'),
            ]

            // Permissions
            let pemis = [
                p('閱覽權', { '專案A/頁A': 'y', '專案A/頁B': 'y', '專案A/頁A/按鈕1': 'n' }),
                p('執行權', { '專案A/頁A/按鈕1': 'y' }),
                p('專案B全權', { '專案B/頁A': 'y' }),
            ]

            // Groups
            let grups = [
                g('基本瀏覽組', { '閱覽權': OR }),
                g('操作員組', { '閱覽權': OR, '執行權': OR }),
                g('專案B組', { '專案B全權': OR }),
            ]

            // User: 操作員 + 專案B (OR 模式)
            let user = u({ '操作員組': OR, '專案B組': OR })

            let { rules } = getUserRules(user, grups, pemis, targets)
            let m = rulesToMap(rules)

            assert.strictEqual(m['專案A/頁A'], 'y')
            assert.strictEqual(m['專案A/頁B'], 'y')
            assert.strictEqual(m['專案A/頁A/按鈕1'], 'y') // 執行權 OR 閱覽權(n) = y
            assert.strictEqual(m['專案B/頁A'], 'y')
        })

        it('模擬 AND 限制：必須同時屬於兩個群組才有完整權限', function() {
            let targets = [t('機密區'), t('一般區')]

            let pemis = [
                p('部門A存取', { '機密區': 'y', '一般區': 'y' }),
                p('安全認證', { '機密區': 'y', '一般區': 'y' }),
            ]

            let grups = [
                g('部門A', { '部門A存取': OR }),
                g('安全組', { '安全認證': OR }),
            ]

            // 必須同時屬於部門A且通過安全認證（AND）
            let user = u({ '部門A': AND, '安全組': AND })

            let { rules } = getUserRules(user, grups, pemis, targets)
            let m = rulesToMap(rules)

            assert.strictEqual(m['機密區'], 'y') // 兩者都 y → y
            assert.strictEqual(m['一般區'], 'y')
        })

        it('模擬 AND 限制：缺少一個群組的授權', function() {
            let targets = [t('機密區'), t('一般區')]

            let pemis = [
                p('部門A存取', { '機密區': 'y', '一般區': 'y' }),
                p('安全認證', { '機密區': 'n', '一般區': 'y' }),
            ]

            let grups = [
                g('部門A', { '部門A存取': OR }),
                g('安全組', { '安全認證': OR }),
            ]

            let user = u({ '部門A': AND, '安全組': AND })

            let { rules } = getUserRules(user, grups, pemis, targets)
            let m = rulesToMap(rules)

            assert.strictEqual(m['機密區'], 'n') // 安全認證拒絕 → AND 結果為 n
            assert.strictEqual(m['一般區'], 'y') // 兩者都 y → y
        })

        it('UNIT-010a-大量 targets 與稀疏權限 — 未涵蓋全部為 n', function() {
            let targets = []
            for (let i = 0; i < 50; i++) {
                targets.push(t(`target-${i}`))
            }

            // 只授權前 3 個
            let pemis = [p('P1', { 'target-0': 'y', 'target-1': 'y', 'target-2': 'y' })]
            let grups = [g('G1', { P1: OR })]
            let user = u({ G1: OR })

            let { rules } = getUserRules(user, grups, pemis, targets)
            let m = rulesToMap(rules)

            assert.strictEqual(m['target-0'], 'y')
            assert.strictEqual(m['target-1'], 'y')
            assert.strictEqual(m['target-2'], 'y')
            assert.strictEqual(m['target-3'], 'n')
            assert.strictEqual(m['target-49'], 'n')

            // 確保所有 50 個 target 都有 rule
            let targetNames = targets.map((v) => v.id)
            targetNames.forEach((name) => {
                assert.ok(m[name] !== undefined, `target ${name} should have a rule`)
            })
        })

    })


    // ===========================================================
    // mergeRules 處理順序：OR 先、AND 後
    // ===========================================================
    describe('mergeRules 處理順序', function() {

        it('UNIT-006d-OR 先執行再 AND — AND 可從 OR 結果收緊', function() {
            // P1(OR): {A:'y', B:'y', C:'y'}
            // P2(AND): {A:'y', B:'n', C:'y'}
            //
            // OR result: {A:'y', B:'y', C:'y'}
            // AND: {A:'y', B:'n', C:'y'}
            // Final: {A:'y', B:'n', C:'y'}
            let targets = [t('A'), t('B'), t('C')]
            let pemis = [
                p('P1', { A: 'y', B: 'y', C: 'y' }),
                p('P2', { A: 'y', B: 'n', C: 'y' }),
            ]
            let grups = [g('G1', { P1: OR, P2: AND })]
            let user = u({ G1: OR })

            let { rules } = getUserRules(user, grups, pemis, targets)
            let m = rulesToMap(rules)
            assert.strictEqual(m.A, 'y')
            assert.strictEqual(m.B, 'n')
            assert.strictEqual(m.C, 'y')
        })

        it('UNIT-005f-純 AND 無 OR — 以第一筆為基底逐步交集', function() {
            // P1(AND): {A:'y', B:'y', C:'n'}
            // P2(AND): {A:'y', B:'n', C:'y'}
            //
            // AND: P1 AND P2 = {A:'y', B:'n', C:'n'}
            let targets = [t('A'), t('B'), t('C')]
            let pemis = [
                p('P1', { A: 'y', B: 'y', C: 'n' }),
                p('P2', { A: 'y', B: 'n', C: 'y' }),
            ]
            let grups = [g('G1', { P1: AND, P2: AND })]
            let user = u({ G1: OR })

            let { rules } = getUserRules(user, grups, pemis, targets)
            let m = rulesToMap(rules)
            assert.strictEqual(m.A, 'y')
            assert.strictEqual(m.B, 'n')
            assert.strictEqual(m.C, 'n')
        })

        it('UNIT-006e-多 OR + 多 AND 權限 — 驗證最終結果', function() {
            // P1(OR): {A:'y', B:'n'}
            // P2(OR): {A:'n', B:'y'}
            // P3(AND): {A:'y', B:'y'}
            // P4(AND): {A:'y', B:'n'}
            //
            // OR: P1 OR P2 = {A:'y', B:'y'}
            // AND step1: {A:'y', B:'y'} AND P3{A:'y', B:'y'} = {A:'y', B:'y'}
            // AND step2: {A:'y', B:'y'} AND P4{A:'y', B:'n'} = {A:'y', B:'n'}
            let targets = [t('A'), t('B')]
            let pemis = [
                p('P1', { A: 'y', B: 'n' }),
                p('P2', { A: 'n', B: 'y' }),
                p('P3', { A: 'y', B: 'y' }),
                p('P4', { A: 'y', B: 'n' }),
            ]
            let grups = [g('G1', { P1: OR, P2: OR, P3: AND, P4: AND })]
            let user = u({ G1: OR })

            let { rules } = getUserRules(user, grups, pemis, targets)
            let m = rulesToMap(rules)
            assert.strictEqual(m.A, 'y')
            assert.strictEqual(m.B, 'n') // P4 的 AND 收緊
        })

    })


    // ===========================================================
    // 兩層巢狀合併（群組內合併 + 群組間合併）
    // ===========================================================
    describe('兩層巢狀合併', function() {

        it('UNIT-006f-群組內 OR 合併後，群組間再 AND', function() {
            // G1 (OR mode at group level):
            //   P1(OR): {A:'y', B:'n'}
            //   P2(OR): {A:'n', B:'y'}
            //   → 群組內 OR = {A:'y', B:'y'}
            //
            // G2 (AND mode at group level):
            //   P3(OR): {A:'y', B:'n'}
            //   → 群組內 = {A:'y', B:'n'}
            //
            // 群組間：G1(OR) then AND G2
            // OR result = {A:'y', B:'y'}
            // AND result = {A:'y', B:'y'} AND {A:'y', B:'n'} = {A:'y', B:'n'}
            let targets = [t('A'), t('B')]
            let pemis = [
                p('P1', { A: 'y', B: 'n' }),
                p('P2', { A: 'n', B: 'y' }),
                p('P3', { A: 'y', B: 'n' }),
            ]
            let grups = [
                g('G1', { P1: OR, P2: OR }),
                g('G2', { P3: OR }),
            ]
            let user = u({ G1: OR, G2: AND })

            let { rules } = getUserRules(user, grups, pemis, targets)
            let m = rulesToMap(rules)
            assert.strictEqual(m.A, 'y')
            assert.strictEqual(m.B, 'n')
        })

        it('UNIT-006g-群組內 AND 合併後，群組間再 OR', function() {
            // G1:
            //   P1(AND): {A:'y', B:'y'}
            //   P2(AND): {A:'y', B:'n'}
            //   → 群組內 AND = {A:'y', B:'n'}
            //
            // G2:
            //   P3(OR): {A:'n', B:'y'}
            //   → 群組內 = {A:'n', B:'y'}
            //
            // 群組間 OR: {A:'y', B:'n'} OR {A:'n', B:'y'} = {A:'y', B:'y'}
            let targets = [t('A'), t('B')]
            let pemis = [
                p('P1', { A: 'y', B: 'y' }),
                p('P2', { A: 'y', B: 'n' }),
                p('P3', { A: 'n', B: 'y' }),
            ]
            let grups = [
                g('G1', { P1: AND, P2: AND }),
                g('G2', { P3: OR }),
            ]
            let user = u({ G1: OR, G2: OR })

            let { rules } = getUserRules(user, grups, pemis, targets)
            let m = rulesToMap(rules)
            assert.strictEqual(m.A, 'y')
            assert.strictEqual(m.B, 'y')
        })

    })


    // ===========================================================
    // JSON5 格式容錯
    // ===========================================================
    describe('JSON5 格式', function() {

        it('UNIT-009a-cgrups 使用 JSON5 格式（單引號）— 正常解析', function() {
            let targets = [t('A')]
            let pemis = [p('P1', { A: 'y' })]
            let grups = [g('G1', { P1: OR })]
            let user = {
                cgrups: `{ 'G1': { 'mode': 'OR', 'isActive': 'y' } }`,
            }

            let { rules } = getUserRules(user, grups, pemis, targets)
            assert.strictEqual(ruleOf(rules, 'A'), 'y')
        })

    })


    // ===========================================================
    // R-OBJ-ITER-01: cgrups / cpemis / crules 為使用者(含外部應用)寫入之 JSON 字串, 解析後之物件含 length 鍵時不得被當陣列樣迭代
    // ===========================================================
    // 缺陷: lodash each 對具非負整數 length 之物件只走索引 0..length-1, 真實鍵(群組／權限／規則名)被略過 → 權限被靜默評估為 n;
    // length 極大時空轉或耗盡記憶體(getPerm／getPermUserInfor 每次查詢皆走此路徑, 毒化資料持久).
    describe('R-OBJ-ITER-01 length 鍵', function() {

        let targets = [t('A'), t('B')]
        let pemis = [p('P1', { A: 'y' })]
        let grups = [g('G1', { P1: OR })]
        let ORs = '{"mode":"OR","isActive":"y"}'

        it('UNIT-OI-001-user.cgrups 含 length 鍵(0、1、2、3、10) — 群組仍被辨識, A 為 y', function() {
            for (let n of [0, 1, 2, 3, 10]) {
                let user = { cgrups: `{"length":${n},"G1":${ORs}}` }
                let { rules, grups: kg } = getUserRules(user, grups, pemis, targets)
                assert.strictEqual(ruleOf(rules, 'A'), 'y', `length:${n}`)
                assert.deepStrictEqual(kg.map((v) => v.name), ['G1'], `length:${n}`)
            }
        })

        it('UNIT-OI-002-grup.cpemis 含 length 鍵(0、1、5) — 權限仍被辨識, A 為 y', function() {
            for (let n of [0, 1, 5]) {
                let gs = [{ name: 'G1', cpemis: `{"length":${n},"P1":${ORs}}` }]
                let { rules } = getUserRules(u({ G1: OR }), gs, pemis, targets)
                assert.strictEqual(ruleOf(rules, 'A'), 'y', `length:${n}`)
            }
        })

        it('UNIT-OI-003-pemi.crules 含 length 鍵(0、1、5) — 規則仍被辨識, A 為 y、B 為 n', function() {
            for (let n of [0, 1, 5]) {
                let ps = [{ name: 'P1', crules: `{"length":${n},"A":"y","B":"n"}` }]
                let { rules } = getUserRules(u({ G1: OR }), grups, ps, targets)
                assert.strictEqual(ruleOf(rules, 'A'), 'y', `length:${n}`)
                assert.strictEqual(ruleOf(rules, 'B'), 'n', `length:${n}`)
            }
        })

        // 規則名為 length 且 isActive 為數字(object 形式): 合併用之 kpRule 物件帶數字 length 鍵 → 合併(OR／AND)與輸出皆須逐鍵走訪
        it('UNIT-OI-004-規則 length 帶數字 isActive — OR 與 AND 合併後 A 仍為 y', function() {
            let pm = [
                { name: 'P1', crules: '{"A":"y","length":{"isActive":3}}' },
                { name: 'P2', crules: '{"A":"y"}' },
            ]
            for (let mode of ['OR', 'AND']) {
                let m = `{"mode":"${mode}","isActive":"y"}`
                let gs = [{ name: 'G1', cpemis: `{"P1":${m},"P2":${m}}` }]
                let { rules } = getUserRules({ cgrups: `{"G1":${m}}` }, gs, pm, targets)
                assert.strictEqual(ruleOf(rules, 'A'), 'y', mode)
            }
            //單一權限: 只經 mergeRules 一輪
            let { rules } = getUserRules(u({ G1: OR }), grups, [{ name: 'P1', crules: '{"A":"y","length":{"isActive":3}}' }], targets)
            assert.strictEqual(ruleOf(rules, 'A'), 'y')
        })

        // AND 合併: 後一個權限的規則物件帶數字 length 且 A 為 n → 結果須為 n(objAND 若改走索引, A 被略過而沿用前一個權限之 y, 權限被放寬)
        it('UNIT-OI-004a-AND 合併時後一權限帶數字 length 且 A 為 n — 結果 A 為 n(不得沿用前一權限之 y)', function() {
            let pm = [
                { name: 'P1', crules: '{"A":"y"}' },
                { name: 'P2', crules: '{"A":"n","length":{"isActive":3}}' },
            ]
            let m = '{"mode":"AND","isActive":"y"}'
            let gs = [{ name: 'G1', cpemis: `{"P1":${m},"P2":${m}}` }]
            let { rules } = getUserRules({ cgrups: `{"G1":${m}}` }, gs, pm, targets)
            assert.strictEqual(ruleOf(rules, 'A'), 'n')
        })

        // OR 合併: 先 n 後 y(後者帶數字 length) → y
        it('UNIT-OI-004b-OR 合併時後一權限帶數字 length 且 A 為 y — 結果 A 為 y', function() {
            let pm = [
                { name: 'P1', crules: '{"A":"n"}' },
                { name: 'P2', crules: '{"A":"y","length":{"isActive":3}}' },
            ]
            let gs = [{ name: 'G1', cpemis: `{"P1":${ORs},"P2":${ORs}}` }]
            let { rules } = getUserRules({ cgrups: `{"G1":${ORs}}` }, gs, pm, targets)
            assert.strictEqual(ruleOf(rules, 'A'), 'y')
        })

        it('UNIT-OI-005-target 與規則名皆為 length 且值為 y — 正常評估(迴歸: 非數字 length 值本來就不構成陣列樣)', function() {
            let ts = [t('length'), t('A')]
            let ps = [{ name: 'P1', crules: '{"length":"y","A":"y"}' }]
            let { rules } = getUserRules(u({ G1: OR }), grups, ps, ts)
            assert.strictEqual(ruleOf(rules, 'length'), 'y')
            assert.strictEqual(ruleOf(rules, 'A'), 'y')
        })

        it('UNIT-OI-006-cgrups 為無法對應群組名稱之非物件 JSON(字串元素陣列、字串、數字、null、布林、空陣列) — 不拋錯, 全部 target 為 n', function() {
            for (let c of ['["G1"]', '"y"', '5', 'null', 'true', '[]']) {
                let { rules } = getUserRules({ cgrups: c }, grups, pemis, targets)
                assert.strictEqual(ruleOf(rules, 'A'), 'n', c)
                assert.strictEqual(ruleOf(rules, 'B'), 'n', c)
            }
        })

        // 迴歸(外審 sol#9): 元素為含 name 的物件之 JSON 陣列, 修前即被辨識(cvKpToArr 的 ...v 以元素之 name 覆蓋索引名稱); eachOwn 對真陣列依索引走訪, 行為不變
        it('UNIT-OI-006a-三欄皆為「元素含 name 之物件陣列」 — 維持修前行為(被辨識, A 為 y)', function() {
            let user = { cgrups: '[{"name":"G1","mode":"OR","isActive":"y"}]' }
            let gs = [{ name: 'G1', cpemis: '[{"name":"P1","mode":"OR","isActive":"y"}]' }]
            let ps = [{ name: 'P1', crules: '[{"name":"A","isActive":"y"}]' }]
            let { rules } = getUserRules(user, gs, ps, targets)
            assert.strictEqual(ruleOf(rules, 'A'), 'y')
        })

        // 巨大 length: 修前 4.29e9 次迭代並逐次配置(耗盡 128 MB 堆積而崩潰, 或空轉); 子行程設逾時, 修後毫秒內完成
        it('UNIT-OI-007-巨大 length(2**32-1) 於 cgrups、cpemis、crules、規則 isActive 四處 — 毫秒內完成且評估正確', function() {
            let code = `
                import { getUserRules } from ${fileUrl('src/plugins/mShare.mjs')}
                let targets = [{ id: 'A' }]
                let OR = '{"mode":"OR","isActive":"y"}'
                let N = 4294967295
                let run = (user, grups, pemis) => getUserRules(user, grups, pemis, targets).rules.map((v) => v.name + '=' + v.isActive).join()
                let out = [
                    run({ cgrups: '{"length":' + N + ',"G1":' + OR + '}' }, [{ name: 'G1', cpemis: '{"P1":' + OR + '}' }], [{ name: 'P1', crules: '{"A":"y"}' }]),
                    run({ cgrups: '{"G1":' + OR + '}' }, [{ name: 'G1', cpemis: '{"length":' + N + ',"P1":' + OR + '}' }], [{ name: 'P1', crules: '{"A":"y"}' }]),
                    run({ cgrups: '{"G1":' + OR + '}' }, [{ name: 'G1', cpemis: '{"P1":' + OR + '}' }], [{ name: 'P1', crules: '{"length":' + N + ',"A":"y"}' }]),
                    run({ cgrups: '{"G1":' + OR + '}' }, [{ name: 'G1', cpemis: '{"P1":' + OR + '}' }], [{ name: 'P1', crules: '{"A":"y","length":{"isActive":' + N + '}}' }]),
                ]
                console.log(JSON.stringify(out))
            `
            let c = runChild(code, { timeoutMs: 30000, maxOldSpaceMb: 128 })
            assert.strictEqual(c.ok, true, `子行程應正常結束(修前逾時或記憶體耗盡): ${describeChild(c)}`)
            assert.deepStrictEqual(c.result, ['A=y', 'A=y', 'A=y', 'A=y'])
        })

    })


    // ===========================================================
    // R-AUTH-PATH-01: 標的 id／規則名是資料不是路徑——授權查值不得以 lodash 路徑語意解析, 原型鍵名須可精確授權且不被繼承屬性誤判
    // ===========================================================
    // 缺陷(外審 sol#5, 修前): 展開段以 lodash get(kp, t.id, 'n') 取值, crules 只授權 A 時, 標的 A.0、A[0] 經字串索引得 y、A.length 得數字 1;
    // 未授權之 toString 取到繼承函數(isActive 不是 'n'); 規則名 __proto__ 因一般物件容器忽略字串指派而無法授權.
    describe('R-AUTH-PATH-01 授權查值', function() {

        let grupsAp = [g('G1', { P1: OR })]
        let userAp = u({ G1: OR })
        //rulesOf: 回 'name=isActive' 以逗號串接之字串(依 targets 順序; 以字串比對可表示 __proto__ 等原型鍵名, 一般物件的 map 做不到)
        let rulesOf = (crules, ids, ps = null) => {
            let pemisAp = ps || [{ name: 'P1', crules: typeof crules === 'string' ? crules : JSON.stringify(crules) }]
            let { rules } = getUserRules(userAp, grupsAp, pemisAp, ids.map((id) => t(id)))
            return rules.map((v) => v.name + '=' + (typeof v.isActive === 'string' ? v.isActive : '<' + typeof v.isActive + ':' + String(v.isActive) + '>')).join(',')
        }

        it('UNIT-AP-001-只授權 A — A.0、A[0]、A.length、A.1、A.x、B 皆不得授權(修前 A.0／A[0] 為 y、A.length 為數字 1)', function() {
            assert.strictEqual(
                rulesOf({ A: 'y' }, ['A', 'A.0', 'A[0]', 'A.length', 'A.1', 'A.x', 'B']),
                'A=y,A.0=n,A[0]=n,A.length=n,A.1=n,A.x=n,B=n'
            )
        })

        //迴歸保護(修前亦綠: lodash get 精確鍵優先)
        it('UNIT-AP-002-精確鍵照常: crules 鍵含 . 或 [ 時, 該標的依其值授權, 其餘不受影響', function() {
            assert.strictEqual(
                rulesOf({ 'A.0': 'y', 'B[0]': 'y', 'x.y.z': 'y', A: 'n' }, ['A', 'A.0', 'B[0]', 'B', 'x.y.z', 'x.y', 'x']),
                'A=n,A.0=y,B[0]=y,B=n,x.y.z=y,x.y=n,x=n'
            )
        })

        it('UNIT-AP-003-原型鍵名之標的: 未授權者一律 n(不取繼承屬性); 精確授權者為 y(含 __proto__)', function() {
            let ids = ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf', 'A']
            //只授權 A: 原型鍵名之標的皆 n(修前 toString 等取到繼承函數)
            assert.strictEqual(rulesOf({ A: 'y' }, ids), 'constructor=n,__proto__=n,toString=n,hasOwnProperty=n,valueOf=n,A=y')
            //精確授權 constructor 與 __proto__(JSON5 解析為自有鍵): 兩者為 y, 其餘仍 n(修前 __proto__ 因容器忽略指派而為 n)
            assert.strictEqual(rulesOf('{"constructor":"y","__proto__":"y"}', ids), 'constructor=y,__proto__=y,toString=n,hasOwnProperty=n,valueOf=n,A=n')
        })

        it('UNIT-AP-004-OR／AND 合併下, 規則名 __proto__／constructor 依各權限值合併(OR 取 y 優先, AND 須皆 y)', function() {
            let ps = [
                { name: 'P1', crules: '{"__proto__":"y","constructor":"y","A":"y"}' },
                { name: 'P2', crules: '{"__proto__":"n","constructor":"y","A":"y"}' },
            ]
            for (let [mode, expProto] of [['OR', 'y'], ['AND', 'n']]) {
                let md = '{"mode":"' + mode + '","isActive":"y"}'
                let gs = [{ name: 'G1', cpemis: '{"P1":' + md + ',"P2":' + md + '}' }]
                let { rules } = getUserRules({ cgrups: '{"G1":' + md + '}' }, gs, ps, [t('__proto__'), t('constructor'), t('A'), t('toString')])
                assert.strictEqual(rules.map((v) => v.name + '=' + v.isActive).join(','), '__proto__=' + expProto + ',constructor=y,A=y,toString=n', mode)
            }
        })

        it('UNIT-AP-005-輸出結構不變: rules 為 { name, isActive } 陣列(isActive 恆為字串 y／n), 依 targets 順序', function() {
            let { rules } = getUserRules(userAp, grupsAp, [{ name: 'P1', crules: '{"A":"y"}' }], [t('toString'), t('A'), t('A.0')])
            assert.deepStrictEqual(rules, [{ name: 'toString', isActive: 'n' }, { name: 'A', isActive: 'y' }, { name: 'A.0', isActive: 'n' }])
        })

        //外審 sol(run03)#1: 物件形式(以名稱為鍵)之值內 name 不得改名——編輯器與關聯對話框皆依外層鍵顯示與存檔, 授權若依值內 name 則「顯示 A 啟用、實際授權 __proto__」.
        //陣列形式([{name:'A', …}], UNIT-OI-006a)元素之 name 即名稱, 維持
        it('UNIT-AP-006-物件形式以外層鍵為名: 值內 name 不得改名(crules／cpemis／cgrups 三欄; 修前 crules 值內 name:__proto__ 使 __proto__ 為 y、A 為 n)', function() {
            //crules
            assert.strictEqual(
                rulesOf('{"A":{"name":"__proto__","isActive":"y"}}', ['A', '__proto__', 'B']),
                'A=y,__proto__=n,B=n'
            )
            assert.strictEqual(
                rulesOf('{"A":{"name":"B","isActive":"y"}}', ['A', 'B']),
                'A=y,B=n'
            )
            //cpemis: 值內 name 不得改選另一個權限
            let ps = [{ name: 'P1', crules: '{"A":"y"}' }, { name: 'P2', crules: '{"B":"y"}' }]
            let r1 = getUserRules(userAp, [{ name: 'G1', cpemis: '{"P1":{"name":"P2","mode":"OR","isActive":"y"}}' }], ps, [t('A'), t('B')])
            assert.deepStrictEqual(r1.rules, [{ name: 'A', isActive: 'y' }, { name: 'B', isActive: 'n' }])
            //cgrups: 值內 name 不得改選另一個群組
            let gs = [{ name: 'G1', cpemis: '{"P1":{"mode":"OR","isActive":"y"}}' }, { name: 'G2', cpemis: '{"P2":{"mode":"OR","isActive":"y"}}' }]
            let r2 = getUserRules({ cgrups: '{"G1":{"name":"G2","mode":"OR","isActive":"y"}}' }, gs, ps, [t('A'), t('B')])
            assert.deepStrictEqual(r2.rules, [{ name: 'A', isActive: 'y' }, { name: 'B', isActive: 'n' }])
        })

    })


    // ===========================================================
    // R-KEY-PROP-01(ADR-032, 來源 run02 F-25): 資料驅動之規則名轉屬性鍵須安全轉型, 轉不了者略過而非拋 TypeError
    // ===========================================================
    // 缺陷(修前): 陣列形式 crules 元素之 name 為合法 JSON 但屬性鍵轉型必拋者(如 { "toString": null })時,
    // mergeRules 之 kpRule[vv.name] = vv.isActive(位於 cvStrToArr 之 try 之外)拋 TypeError: Cannot convert object to primitive value,
    // 使所有使用該權限之使用者的權限評估整個失敗; 壞 JSON('{oops')則降級為全 n(容錯成立)。
    describe('R-KEY-PROP-01 資料驅動之規則名轉屬性鍵', function() {

        let grupsKp = [g('G1', { P1: OR })]
        let userKp = u({ G1: OR })
        //pemi(crules 為陣列形式字串)
        let pemiOf = (crulesArr, name = 'P1') => ({ name, crules: JSON.stringify(crulesArr) })
        //rulesOf: 'name=isActive' 以逗號串接(依 targets 順序)
        let rulesOf = (ps, ids, grs = grupsKp, usr = userKp) => {
            let { rules } = getUserRules(usr, grs, ps, ids.map((id) => t(id)))
            return rules.map((v) => v.name + '=' + v.isActive).join(',')
        }
        //不可轉為屬性鍵之 name(JSON.stringify 對 { toString: null } 輸出 {"toString":null}, 解析後屬性鍵轉型必拋)
        const POISON = [{ toString: null }, { toString: 5 }, [{ toString: null }], { valueOf: null, toString: 'x' }]

        it('UNIT-KP-001-crules 含不可轉鍵 name 的元素 — 不拋錯, 其餘規則照常授權(修前拋 TypeError: Cannot convert object to primitive value)', function() {
            for (let poison of POISON) {
                let ps = [pemiOf([{ name: 'T', isActive: 'y' }, { name: poison, isActive: 'y' }])]
                let out = null
                assert.doesNotThrow(() => { out = rulesOf(ps, ['T', 'U']) }, `name=${JSON.stringify(poison)}`)
                assert.strictEqual(out, 'T=y,U=n', `name=${JSON.stringify(poison)}: 不可轉者不授權任何標的`)
            }
        })

        it('UNIT-KP-002-不可轉鍵 name 排在前面、中間、最後、全部皆是 — 結果與「刪掉該元素」相同', function() {
            let P = { toString: null }
            let ok = [{ name: 'A', isActive: 'y' }, { name: 'B', isActive: 'n' }, { name: 'C', isActive: 'y' }]
            let base = rulesOf([pemiOf(ok)], ['A', 'B', 'C', 'D'])
            assert.strictEqual(base, 'A=y,B=n,C=y,D=n')
            for (let k = 0; k <= ok.length; k++) {
                let withP = ok.slice(0, k).concat([{ name: P, isActive: 'y' }], ok.slice(k))
                assert.strictEqual(rulesOf([pemiOf(withP)], ['A', 'B', 'C', 'D']), base, `插在位置 ${k}`)
            }
            assert.strictEqual(rulesOf([pemiOf([{ name: P, isActive: 'y' }, { name: P, isActive: 'y' }])], ['A']), 'A=n', '全部不可轉 → 全 n')
        })

        it('UNIT-KP-003-可轉為鍵的非字串 name 維持修前行為(迴歸): 5 → "5"、true → "true"、["T"] → "T"、{} → "[object Object]"、null → "null"', function() {
            let ps = [pemiOf([{ name: 5, isActive: 'y' }, { name: true, isActive: 'y' }, { name: ['T'], isActive: 'y' }, { name: {}, isActive: 'y' }, { name: null, isActive: 'y' }])]
            assert.strictEqual(rulesOf(ps, ['5', 'true', 'T', '[object Object]', 'null', 'X']), '5=y,true=y,T=y,[object Object]=y,null=y,X=n')
        })

        it('UNIT-KP-004-AND／OR 合併下含不可轉鍵 name — 不拋錯, 結果與刪掉該元素相同(ADR-001 合併規則不變)', function() {
            let P = { toString: null }
            let r1 = [{ name: 'A', isActive: 'y' }, { name: 'B', isActive: 'y' }]
            let r2 = [{ name: 'A', isActive: 'y' }, { name: 'B', isActive: 'n' }]
            let withP = (r) => r.concat([{ name: P, isActive: 'y' }])
            for (let [m1, m2] of [['OR', 'OR'], ['OR', 'AND'], ['AND', 'AND'], ['AND', 'OR']]) {
                let md = (m) => ({ mode: m, isActive: 'y' })
                let gs = [g('G1', { P1: md(m1), P2: md(m2) })]
                let base = rulesOf([pemiOf(r1, 'P1'), pemiOf(r2, 'P2')], ['A', 'B'], gs)
                let poisoned = rulesOf([pemiOf(withP(r1), 'P1'), pemiOf(withP(r2), 'P2')], ['A', 'B'], gs)
                assert.strictEqual(poisoned, base, `${m1}/${m2}`)
            }
        })

        it('UNIT-KP-005-同一使用者其他權限不受影響: 一個權限含不可轉鍵 name, 另一個權限(OR)的授權照常', function() {
            let P = { toString: null }
            let ps = [pemiOf([{ name: P, isActive: 'y' }], 'P1'), pemiOf([{ name: 'A', isActive: 'y' }], 'P2')]
            let gs = [g('G1', { P1: OR, P2: OR })]
            assert.strictEqual(rulesOf(ps, ['A', 'B'], gs), 'A=y,B=n')
        })

        it('UNIT-KP-006-cgrups／cpemis 陣列元素的 name 為不可轉鍵物件 — 不拋錯(以 === 比對名稱, 不授權); 其餘元素照常', function() {
            let P = { toString: null }
            let ps = [{ name: 'P1', crules: JSON.stringify({ A: 'y' }) }]
            let gs = [{ name: 'G1', cpemis: JSON.stringify([{ name: P, ...OR }, { name: 'P1', ...OR }]) }]
            let usr = { cgrups: JSON.stringify([{ name: P, ...OR }, { name: 'G1', ...OR }]) }
            assert.strictEqual(rulesOf(ps, ['A', 'B'], gs, usr), 'A=y,B=n')
        })

        it('UNIT-KP-007-壞 JSON 仍降級為全 n(容錯成立, 迴歸)', function() {
            assert.strictEqual(rulesOf([{ name: 'P1', crules: '{oops' }], ['A']), 'A=n')
        })

    })

})
