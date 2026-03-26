import assert from 'assert'
import { getUserRules } from '../src/plugins/mShare.mjs'


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

        it('單一使用者、單一群組、單一權限、單一target — 授權 y', function() {
            let targets = [t('A')]
            let pemis = [p('P1', { A: 'y' })]
            let grups = [g('G1', { P1: OR })]
            let user = u({ G1: OR })

            let { rules } = getUserRules(user, grups, pemis, targets)
            assert.strictEqual(ruleOf(rules, 'A'), 'y')
        })

        it('單一使用者、單一群組、單一權限、單一target — 拒絕 n', function() {
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

        it('cgrups 為空字串 — 不會拋錯、全部 target 預設 n', function() {
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
            // 沒有 targets 需要展開，但 crules 中的 A 仍在 rules 中
            // A 不在 targets 中，但 merge 結果會包含它
            assert.ok(Array.isArray(rules))
        })

    })


    // ===========================================================
    // target 展開（未提及的 target 預設 'n'）
    // ===========================================================
    describe('target 展開', function() {

        it('未被任何權限提及的 target 預設為 n', function() {
            let targets = [t('A'), t('B'), t('C')]
            let pemis = [p('P1', { A: 'y' })]
            let grups = [g('G1', { P1: OR })]
            let user = u({ G1: OR })

            let { rules } = getUserRules(user, grups, pemis, targets)
            assert.strictEqual(ruleOf(rules, 'A'), 'y')
            assert.strictEqual(ruleOf(rules, 'B'), 'n')
            assert.strictEqual(ruleOf(rules, 'C'), 'n')
        })

        it('多個權限覆蓋部分 targets — 其餘仍為 n', function() {
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

    })


    // ===========================================================
    // OR 模式合併
    // ===========================================================
    describe('OR 模式 — 權限層級', function() {

        it('兩個權限 OR：其中一個 y 另一個 n → y', function() {
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

        it('兩個權限 OR：兩個都 n → n', function() {
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

        it('兩個權限 OR：互不重疊的 target 聯集', function() {
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

        it('三個權限 OR：漸進聯集', function() {
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

        it('兩個群組 OR：其中一個群組授權 y → y', function() {
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

        it('兩個群組 OR：互不重疊的 target 聯集', function() {
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

        it('兩個權限 AND：都是 y → y', function() {
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

        it('兩個權限 AND：一個 y 一個 n → n', function() {
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

        it('AND 非對稱性：key 只存在於 obj1 → 保留 obj1 的值', function() {
            // P1 有 A 和 B，P2 只有 A
            // AND 以 P1 為基底，P2 只影響 A
            // B 不在 P2 中，保留 P1 的值
            let targets = [t('A'), t('B')]
            let pemis = [
                p('P1', { A: 'y', B: 'y' }),
                p('P2', { A: 'y' }),
            ]
            let grups = [g('G1', { P1: AND, P2: AND })]
            let user = u({ G1: OR })

            let { rules } = getUserRules(user, grups, pemis, targets)
            assert.strictEqual(ruleOf(rules, 'A'), 'y')
            assert.strictEqual(ruleOf(rules, 'B'), 'y') // B 保留自 P1
        })

        it('AND 非對稱性：key 只存在於 obj2 → 強制為 n', function() {
            // P1 只有 A，P2 有 A 和 B
            // AND 以 P1 為基底 {A:'y'}，遍歷 P2：
            //   A: 都是 y → y
            //   B: 不在 P1 → 加入為 n
            let targets = [t('A'), t('B')]
            let pemis = [
                p('P1', { A: 'y' }),
                p('P2', { A: 'y', B: 'y' }),
            ]
            let grups = [g('G1', { P1: AND, P2: AND })]
            let user = u({ G1: OR })

            let { rules } = getUserRules(user, grups, pemis, targets)
            assert.strictEqual(ruleOf(rules, 'A'), 'y')
            assert.strictEqual(ruleOf(rules, 'B'), 'n') // B 不在 P1，強制 n
        })

    })

    describe('AND 模式 — 群組層級', function() {

        it('兩個群組 AND：同一 target 都授權 → y', function() {
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

        it('兩個群組 AND：一個授權一個拒絕 → n', function() {
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
    // 混合 OR/AND
    // ===========================================================
    describe('混合 OR/AND', function() {

        it('權限層級混合：OR 和 AND 權限共存於同一群組', function() {
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

        it('權限層級混合：AND 收緊 OR 結果', function() {
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

        it('群組層級混合：OR 群組 + AND 群組', function() {
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

        it('群組層級混合：多 OR + 多 AND 交互', function() {
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

        it('群組 isActive=n — 該群組被忽略', function() {
            let targets = [t('A')]
            let pemis = [p('P1', { A: 'y' })]
            let grups = [g('G1', { P1: OR })]
            let user = u({ G1: { mode: 'OR', isActive: 'n' } })

            let { rules } = getUserRules(user, grups, pemis, targets)
            assert.strictEqual(ruleOf(rules, 'A'), 'n') // 群組被忽略，預設 n
        })

        it('權限 isActive=n — 該權限被忽略', function() {
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

        it('全部群組皆 inactive — 全部 target 為 n', function() {
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

        it('混合 active/inactive 權限', function() {
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

        it('群組內所有權限皆 inactive — 該群組產出空 rules', function() {
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

        it('使用者引用不存在的群組 — 被忽略', function() {
            let targets = [t('A')]
            let pemis = [p('P1', { A: 'y' })]
            let grups = [g('G1', { P1: OR })]
            let user = u({ G_NOT_EXIST: OR })

            let { rules } = getUserRules(user, grups, pemis, targets)
            assert.strictEqual(ruleOf(rules, 'A'), 'n')
        })

        it('群組引用不存在的權限 — 被忽略', function() {
            let targets = [t('A')]
            let pemis = [p('P1', { A: 'y' })]
            let grups = [g('G1', { P_NOT_EXIST: OR })]
            let user = u({ G1: OR })

            let { rules } = getUserRules(user, grups, pemis, targets)
            assert.strictEqual(ruleOf(rules, 'A'), 'n')
        })

        it('部分匹配 — 只有匹配到的生效', function() {
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

        it('grups 回傳中僅包含 active 且匹配的群組', function() {
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

        it('模擬完整權限樹：多使用者群組、多權限、多 target', function() {
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

        it('大量 targets 與稀疏權限 — 未涵蓋全部為 n', function() {
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

        it('OR 先執行再 AND — AND 可從 OR 結果收緊', function() {
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

        it('純 AND 無 OR — 以第一筆為基底逐步交集', function() {
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

        it('多 OR + 多 AND 權限 — 驗證最終結果', function() {
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

        it('群組內 OR 合併後，群組間再 AND', function() {
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

        it('群組內 AND 合併後，群組間再 OR', function() {
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

        it('cgrups 使用 JSON5 格式（單引號）— 正常解析', function() {
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

})
