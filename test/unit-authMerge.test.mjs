//授權合併(getUserRules 之 mergeRules)規格測試(第 101 項 run04; 前身為 run01 之現況刻畫 unit-authMerge-characterize, 2026-10-21 依使用者最終裁示改為規格)
//
//【規格】CLAUDE_rulebook.md 之 R-AUTH-MERGE-00(使用者裁示; spec/設計要點與取捨.md ADR-033 取代 ADR-001 之 AND 非對稱條):
//  1. 每一項之值: 有勾＝y; 給 n 或未給(未列)一律視同 n. 不存在「未列＝不約束」.
//  2. 起點: 全部管理對象皆為 n.
//  3. 先 OR 後 AND, 與排列順序無關: 先將所有 OR 項做聯集; 若該層沒有任何 OR 項, 以第一個 AND 項為基底(因第 1 條, 任何 AND 項當基底結果皆相同); 再與所有 AND 項做交集.
//  4. 結果須滿足交換律: 同一組項目不論儲存順序、物件鍵序、陣列元素序, 結果相同.
//  5. isActive 為 n 之項不參與合併. 〔run05, R-PRINCIPLE-00 適用表 c／d／e(主控依原則 3「收嚴＋提示」修改, 2026-10-21)〕mode 缺或非 OR／AND 之項視為 AND(e);
//     引用之群組／權限查無(懸空)者以其 mode 參與、內容全 n(c); 引用之名稱對到多筆(歷史同名)者內容取各筆之交集(d).
//  衍生(依第 4 條): 同一項(陣列形式 crules)重複列同名規則 → 所有列皆 y 才 y; 無任何規則之 AND 項視同全部 n.
//「項」: 權限層 = 權限群組內的各權限(cpemis); 群組層 = 使用者的各權限群組(cgrups). 管理對象 = targets(crules 之鍵). 權限層與群組層使用同一合併函數.
//
//【測試的組成】
//  SP-MIN    最小例子(含使用者之例)——每例同時記錄舊規則(ADR-001 非對稱)之結果以顯示差異
//  SP-SCAN   窮舉彙整(GOLD, test/tools/authMergeGolden.json): 真函數＝完整模型 evalFull(新語意; 自原始四表獨立求值)、順序無關、只收回; 與 1.1.12、run04 之差異量固定於 GOLD
//  SP-PROP   結構性質(逐管理對象獨立、閉式、交換律窮舉、層同形)
//  SP-PG     兩層交互
//  SP-DROP   不計入之項目(只剩 isActive 非 'y')等同移除; mode 非法 ≡ AND、懸空 ≡ 同 mode 之空內容項
//  SP-CDE    R-PRINCIPLE-00 c／d／e(懸空／同名多列／mode 非法): 使用者之例、最小例子、保真與順序無關(隨機)、只收回(含靈敏度)、逐旗標歸因、e 唯一項多給(待裁示)
//  SP-TGT    管理對象層
//  SP-FORM   資料形式(物件 vs 陣列)
//  SP-REAL   實務資料形狀(種子資料、編輯器往返)
//  SP-AUDIT  部署前稽核工具(node test/tools/authMergeReport.mjs --audit <匯出檔> [--json])
//  SITE-AM   站點不變式(規則帳本 R-AUTH-MERGE-01 判準之可執行化)
//舊語意(run04、1.1.12)只存在於 test/tools/authMerge.mjs 的完整模型 evalFull(旗標 FLAGS.run04／FLAGS.legacy; 比較用, 不入 src/). 重產 GOLD: node test/tools/authMergeReport.mjs --golden > test/tools/authMergeGolden.json
//比較報告: C:\opensrcOper\dnow\20261021095534\agent-out\run01-刻畫與比較報告.md、run04-修正報告.md.

import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'
import { fileURLToPath } from 'url'
import JSON5 from 'json5'
import ds from '../src/schema/index.mjs'
import { getUserRules } from '../src/plugins/mShare.mjs'
import cvKpToObj from '../src/js/cvKpToObj.mjs'
import {
    TARGET_IDS,
    buildData, evalSpec, evalData, realOf, fmtResult, predictSpec, predictLegacy, findNameConflicts, findEmptyNames,
    rulesetsAll, itemVariants, specP, specG, stateOf, auditUsers, toMap, permutations, product,
    FLAGS, CDE_KEYS, flagsWith, flagsWithout, refIssues, featuresOf, cdeVariants
} from './tools/authMerge.mjs'
import { goldScanDefs, RULESETS_F6, cdeVariants2 } from './tools/authMergeStats.mjs'
import { sourceLines } from './tools/srcScan.mjs'


// ---------------------------------------------------------------
// helpers
// ---------------------------------------------------------------

/** 簡寫: r('nyy') → 'T1=n T2=y T3=y' */
let r = (s, tg = TARGET_IDS) => tg.map((t, i) => `${t}=${s[i]}`).join(' ')

/** 群組／權限規格簡寫(格式見 tools/authMerge.mjs buildData) */
let g = (name, mode, perms, extra = {}) => ({ name, mode, active: 'y', perms, ...extra })
let p = (name, mode, rules, extra = {}) => ({ name, mode, active: 'y', rules, ...extra })

//項目變體: 模式 OR／AND × 規則集(3 管理對象 27 種; 1 管理對象 3 種)
let VS3 = itemVariants(['OR', 'AND'], rulesetsAll())
let VS1 = itemVariants(['OR', 'AND'], rulesetsAll(['T1']))

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

/** 對一個規格(或四表資料 d)求真函數、完整模型之新語意／run04／1.1.12, 回傳字串摘要 { real, spec, run04, legacy } */
let ev = (spec, tg = TARGET_IDS) => {
    let e = quiet(() => (spec.groups ? evalSpec(spec, tg) : evalData(spec)))
    return { real: fmtResult(e.real, tg), spec: fmtResult(e.sem.spec, tg), run04: fmtResult(e.sem.run04, tg), legacy: fmtResult(e.sem.legacy, tg) }
}

/** 斷言真函數結果(exp.real); 完整模型之新語意恆須等於真函數; exp.legacy／exp.run04 有給時記錄 1.1.12／run04 之結果(顯示新舊差異) */
let expectEv = (spec, exp, label) => {
    let got = ev(spec, exp.tg)
    assert.strictEqual(got.real, exp.real, `${label || ''} 真函數: 預期 ${exp.real}, 實得 ${got.real}`)
    assert.strictEqual(got.spec, got.real, `${label || ''} 規格參考實作須等於真函數`)
    if (exp.legacy !== undefined) {
        assert.strictEqual(got.legacy, exp.legacy, `${label || ''} 舊規則: 預期 ${exp.legacy}, 實得 ${got.legacy}`)
    }
    if (exp.run04 !== undefined) {
        assert.strictEqual(got.run04, exp.run04, `${label || ''} run04: 預期 ${exp.run04}, 實得 ${got.run04}`)
    }
}

/** 可重現亂數(mulberry32) */
let mkRng = (seed) => {
    let a = seed >>> 0
    return () => {
        a = (a + 0x6D2B79F5) >>> 0
        let t = a
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

/** 隨機規格: 1～3 群組、每群組 0～3 權限、模式 OR／AND、規則為 3 管理對象之隨機 y／n／未列 */
let randomSpec = (rng, opt = {}) => {
    let pick = (arr) => arr[Math.floor(rng() * arr.length)]
    let nG = 1 + Math.floor(rng() * 3)
    let groups = []
    for (let i = 0; i < nG; i++) {
        let minP = opt.minPerms || 0
        let nP = minP + Math.floor(rng() * (4 - minP))
        let perms = []
        for (let j = 0; j < nP; j++) {
            let rules = []
            TARGET_IDS.forEach((t) => {
                let s = pick(['', 'y', 'n'])
                if (s !== '') {
                    rules.push([t, s])
                }
            })
            if (opt.orphan && rng() < 0.5) {
                rules.push(['TX', pick(['y', 'n'])])
            }
            perms.push(p(`P${i}_${j}`, pick(['OR', 'AND']), rules))
        }
        groups.push(g(`G${i}`, pick(['OR', 'AND']), perms))
    }
    return { form: 'obj', groups }
}

/** 以亂數重排規格: 群組順序、各群組內權限順序、各權限內規則順序(Fisher–Yates) */
let shuffleSpec = (spec, rng) => {
    let sh = (arr) => {
        let a = arr.slice()
        for (let i = a.length - 1; i > 0; i--) {
            let j = Math.floor(rng() * (i + 1))
            ;[a[i], a[j]] = [a[j], a[i]]
        }
        return a
    }
    return {
        ...spec,
        groups: sh(spec.groups).map((gg) => ({ ...gg, perms: sh(gg.perms || []).map((pp) => ({ ...pp, rules: sh(pp.rules || []) })) })),
    }
}

/** 把規格之規則限縮到單一管理對象 */
let project = (spec, t) => ({
    ...spec,
    groups: spec.groups.map((gg) => ({ ...gg, perms: (gg.perms || []).map((pp) => ({ ...pp, rules: (pp.rules || []).filter(([k]) => k === t) })) })),
})

/** 非遞減索引序列(多重集合) */
function* multisets(n, k, start = 0) {
    if (k === 0) {
        yield []
        return
    }
    for (let i = start; i < n; i++) {
        for (let rest of multisets(n, k - 1, i)) {
            yield [i, ...rest]
        }
    }
}

//c／d／e 用之 mode: 合法 OR／AND 與各種非法值(缺、小寫、未知字串、數字、null)
let BAD_MODES = [undefined, 'or', 'XOR', 1, null]
let isBad = (m) => m !== 'OR' && m !== 'AND'

/**
 * 隨機規格(兩層, 含 R-PRINCIPLE-00 c／d／e): 1～3 群組、每群組(每一列)0～3 權限; 群組／權限之 mode 含非法值、isActive 偶有停用、
 * 約 15% 懸空(inTable:false)、約 20% 同名多列(dupRows 1～2 列, 各列內容獨立隨機, 可為空); 約 20% 為陣列形式
 */
let randomSpecCde = (rng) => {
    let pick = (arr) => arr[Math.floor(rng() * arr.length)]
    let modes = ['OR', 'AND', 'OR', 'AND', 'OR', 'AND', ...BAD_MODES]
    let rules = () => {
        let rs = []
        TARGET_IDS.forEach((t) => {
            let s = pick(['', 'y', 'n'])
            if (s !== '') {
                rs.push([t, s])
            }
        })
        return rs
    }
    let perm = (name) => {
        let pp = { name, mode: pick(modes), active: rng() < 0.1 ? 'n' : 'y', rules: rules() }
        let x = rng()
        if (x < 0.15) {
            pp.inTable = false
        }
        else if (x < 0.35) {
            pp.dupRows = Array.from({ length: 1 + Math.floor(rng() * 2) }, () => ({ rules: rules() }))
        }
        return pp
    }
    let groups = []
    let nG = 1 + Math.floor(rng() * 3)
    for (let i = 0; i < nG; i++) {
        let gg = { name: `G${i}`, mode: pick(modes), active: rng() < 0.1 ? 'n' : 'y', perms: Array.from({ length: Math.floor(rng() * 4) }, (_, j) => perm(`P${i}_${j}`)) }
        let x = rng()
        if (x < 0.15) {
            gg.inTable = false
        }
        else if (x < 0.35) {
            gg.dupRows = Array.from({ length: 1 + Math.floor(rng() * 2) }, (_, k) => ({ perms: Array.from({ length: Math.floor(rng() * 3) }, (_, j) => perm(`P${i}r${k}_${j}`)) }))
        }
        groups.push(gg)
    }
    return { form: rng() < 0.2 ? 'arr' : 'obj', groups }
}

/** 以亂數重排四表資料之表列順序(群組表、權限表; 同名多列之候選順序隨之改變) */
let shuffleTables = (d, rng) => {
    let sh = (arr) => {
        let a = arr.slice()
        for (let i = a.length - 1; i > 0; i--) {
            let j = Math.floor(rng() * (i + 1))
            ;[a[i], a[j]] = [a[j], a[i]]
        }
        return a
    }
    return { ...d, grups: sh(d.grups), pemis: sh(d.pemis) }
}

/**
 * 規格中是否有「某一層之啟用項(≥1 個)皆為 mode 非法」(使用者 cgrups 一層; 每個查得之群組列之 cpemis 一層)
 * ——依 R-PRINCIPLE-00 e(視為 AND), 該層無其他有效項時以第一個 AND 為基底, 結果等於各項之交集; run04 則不計入(該層全 n). 新語意多於 run04 之格只可能出現在此類(SP-CDE-005)
 */
let hasAllBadLevel = (spec) => {
    let allBad = (items) => {
        let act = items.filter((x) => x.active === 'y')
        return act.length > 0 && act.every((x) => isBad(x.mode))
    }
    if (allBad(spec.groups)) {
        return true
    }
    return spec.groups.some((gg) => gg.active === 'y' && gg.inTable !== false && [gg, ...(gg.dupRows || [])].some((row) => allBad(row.perms || [])))
}

let GOLD_PATH = fileURLToPath(new URL('./tools/authMergeGolden.json', import.meta.url))


// ---------------------------------------------------------------
// tests
// ---------------------------------------------------------------

describe('unit-authMerge - 授權合併規格(R-AUTH-MERGE-00; 未給＝n、OR 聯集後與所有 AND 交集、與排列順序無關)', function() {
    this.timeout(180000)

    // ===========================================================
    // SP-MIN: 最小例子(T1／T2／T3 = 管理對象; PA／PB = 權限; GA／GB = 權限群組)
    // ===========================================================
    describe('SP-MIN 最小例子', function() {

        //PA 可用 T2、T3, PB 可用 T1、T2, 同一權限群組內兩者皆 AND、群組內無 OR: 交集為 T2
        let PA = p('PA', 'AND', [['T2', 'y'], ['T3', 'y']])
        let PB = p('PB', 'AND', [['T1', 'y'], ['T2', 'y']])

        it('SP-MIN-001-使用者之例(管理對象 a～e; x = {a:y, b:y, c:n}, y = {b:y, d:y, e:y}): x OR y → {a,b,d,e}; x AND y → {b}; x OR + y AND → {b}; y OR + x AND → {b}——兩個儲存順序、權限層與群組層皆同(規則 3、4)', function() {
            let tg = ['a', 'b', 'c', 'd', 'e']
            let rx = [['a', 'y'], ['b', 'y'], ['c', 'n']]
            let ry = [['b', 'y'], ['d', 'y'], ['e', 'y']]
            //[x 模式, y 模式]
            let cases = [['OR', 'OR'], ['AND', 'AND'], ['OR', 'AND'], ['AND', 'OR']]
            //有權限之管理對象集合(以字串簡寫, 如 'abde')
            let setOf = (kp) => tg.filter((t) => kp[t] === 'y').join('')
            let want = { OR_OR: 'abde', AND_AND: 'b', OR_AND: 'b', AND_OR: 'b' }
            //舊規則(R-AUTH-MERGE-00 表; 2026-10-21 實測): 有 OR 時順序無關(OR 聯集為起點, AND 只約束其提及之鍵); 兩個 AND 時以第一個為起點
            let legacyX = { OR_OR: 'abde', AND_AND: 'ab', OR_AND: 'ab', AND_OR: 'bde' } //儲存順序 x 先
            let legacyY = { OR_OR: 'abde', AND_AND: 'bde', OR_AND: 'ab', AND_OR: 'bde' } //儲存順序 y 先
            assert.strictEqual(cases.length, 4)
            for (let [mx, my] of cases) {
                let key = `${mx}_${my}`
                let x = { id: 'X', mode: mx, rules: rx }
                let y = { id: 'Y', mode: my, rules: ry }
                for (let [label, mk] of [['權限層', specP], ['群組層', specG]]) {
                    let xy = quiet(() => evalSpec(mk([x, y]), tg))
                    let yx = quiet(() => evalSpec(mk([y, x]), tg))
                    assert.strictEqual(setOf(xy.real), want[key], `${label} ${key} x 先`)
                    assert.strictEqual(setOf(yx.real), want[key], `${label} ${key} y 先`)
                    assert.strictEqual(setOf(xy.sem.spec), want[key], `${label} ${key} 規格參考實作`)
                    assert.strictEqual(setOf(xy.sem.legacy), legacyX[key], `${label} ${key} 舊規則 x 先`)
                    assert.strictEqual(setOf(yx.sem.legacy), legacyY[key], `${label} ${key} 舊規則 y 先`)
                }
            }
        })

        it('SP-MIN-002-權限層: 群組內兩個稀疏 AND 權限——結果為交集 {T2}, 與 cpemis 順序無關(舊規則: PA 在前得 T2、T3; PB 在前得 T1、T2)', function() {
            expectEv({ groups: [g('G1', 'OR', [PA, PB])] }, { real: r('nyn'), legacy: r('nyy') }, '[PA,PB]')
            expectEv({ groups: [g('G1', 'OR', [PB, PA])] }, { real: r('nyn'), legacy: r('yyn') }, '[PB,PA]')
        })

        it('SP-MIN-002b-群組層: 使用者兩個群組皆 AND(各含單一權限)——結果為交集 {T2}, 與 cgrups 順序無關, 與權限層同形', function() {
            let ga = g('GA', 'AND', [p('PA', 'OR', [['T2', 'y'], ['T3', 'y']])])
            let gb = g('GB', 'AND', [p('PB', 'OR', [['T1', 'y'], ['T2', 'y']])])
            expectEv({ groups: [ga, gb] }, { real: r('nyn'), legacy: r('nyy') }, '[GA,GB]')
            expectEv({ groups: [gb, ga] }, { real: r('nyn'), legacy: r('yyn') }, '[GB,GA]')
        })

        it('SP-MIN-003-空 AND 群組(尚未指派任何權限)＝全部 n: 與其他 AND 群組並存時結果全 n, 與順序無關(規則 1: 未給＝n; 舊規則: 排前全 n、排後無影響)', function() {
            let ge = g('GE', 'AND', [])
            let gr = g('GR', 'AND', [p('PR', 'OR', [['T1', 'y'], ['T2', 'y'], ['T3', 'y']])])
            expectEv({ groups: [ge, gr] }, { real: r('nnn'), legacy: r('nnn') }, '[GE,GR]')
            expectEv({ groups: [gr, ge] }, { real: r('nnn'), legacy: r('yyy') }, '[GR,GE]')
        })

        it('SP-MIN-003b-空 AND 群組與 OR 群組並存: OR 聯集被空 AND 全部收回, 與順序無關(舊規則: 空 AND 不約束任何管理對象, 結果由 OR 聯集決定)', function() {
            let ge = g('GE', 'AND', [])
            let go = g('GO', 'OR', [p('PO', 'OR', [['T1', 'y'], ['T2', 'y']])])
            expectEv({ groups: [ge, go] }, { real: r('nnn'), legacy: r('yyn') }, '[GE,GO]')
            expectEv({ groups: [go, ge] }, { real: r('nnn'), legacy: r('yyn') }, '[GO,GE]')
        })

        it('SP-MIN-004-空 OR 群組 + 有授權之 AND 群組 → 全部 n(OR 聯集為空, AND 只約束不授予), 與順序無關(新舊規則相同)', function() {
            let ge = g('GE', 'OR', [])
            let gr = g('GR', 'AND', [p('PR', 'OR', [['T1', 'y'], ['T2', 'y'], ['T3', 'y']])])
            expectEv({ groups: [ge, gr] }, { real: r('nnn'), legacy: r('nnn') }, '[GE,GR]')
            expectEv({ groups: [gr, ge] }, { real: r('nnn'), legacy: r('nnn') }, '[GR,GE]')
        })

        it('SP-MIN-005-有 OR 項時: AND 項「未列」之管理對象視為 n, 收回 OR 授予者; AND 明列 n 同(舊規則: 未列不約束, 保留 OR 授予之 T1)', function() {
            let po = p('PO', 'OR', [['T1', 'y'], ['T2', 'y']])
            expectEv({ groups: [g('G1', 'OR', [po, p('PA', 'AND', [['T2', 'y']])])] }, { real: r('nyn'), legacy: r('yyn') }, 'OR,AND(T2)')
            expectEv({ groups: [g('G1', 'OR', [p('PA', 'AND', [['T2', 'y']]), po])] }, { real: r('nyn'), legacy: r('yyn') }, 'AND(T2),OR')
            expectEv({ groups: [g('G1', 'OR', [po, p('PA', 'AND', [['T1', 'n']])])] }, { real: r('nnn'), legacy: r('nyn') }, 'OR,AND(T1:n)')
        })

        it('SP-MIN-006-對照: 稠密(每條規則列出全部管理對象)時新舊規則相同、與順序無關', function() {
            let a = p('PA', 'AND', [['T1', 'y'], ['T2', 'y'], ['T3', 'n']])
            let b = p('PB', 'AND', [['T1', 'y'], ['T2', 'n'], ['T3', 'y']])
            expectEv({ groups: [g('G1', 'OR', [a, b])] }, { real: r('ynn'), legacy: r('ynn') }, '[a,b]')
            expectEv({ groups: [g('G1', 'OR', [b, a])] }, { real: r('ynn'), legacy: r('ynn') }, '[b,a]')
        })

        it('SP-MIN-007-兩層: 權限層之結果傳到使用者層, 使用者層另有 OR 群組時為聯集; 群組內權限順序不影響最終授權', function() {
            let g2 = g('G2', 'OR', [p('PC', 'OR', [['T1', 'n']])])
            expectEv({ groups: [g('G1', 'OR', [PA, PB])] }, { real: r('nyn') })
            expectEv({ groups: [g('G1', 'OR', [PB, PA])] }, { real: r('nyn') })
            expectEv({ groups: [g('G1', 'OR', [PA, PB]), g2] }, { real: r('nyn') })
            expectEv({ groups: [g('G1', 'OR', [PB, PA]), g2] }, { real: r('nyn') })
        })

        it('SP-MIN-008-整數式名稱(如權限名 "1"、"2"): 物件形式之儲存順序無法保留(JS 屬性序), 陣列形式可——新規則下兩者結果相同(舊規則: 陣列 [2,1] 與 [1,2] 結果不同)', function() {
            let p1 = p('1', 'AND', [['T2', 'y'], ['T3', 'y']])
            let p2 = p('2', 'AND', [['T1', 'y'], ['T2', 'y']])
            let d12 = buildData({ form: 'obj', groups: [g('G1', 'OR', [p1, p2])] })
            let d21 = buildData({ form: 'obj', groups: [g('G1', 'OR', [p2, p1])] })
            assert.strictEqual(d12.grups[0].cpemis, d21.grups[0].cpemis, '物件形式: 兩種寫入順序得到同一字串(整數式鍵遞增在前)')
            expectEv({ form: 'obj', groups: [g('G1', 'OR', [p1, p2])] }, { real: r('nyn'), legacy: r('nyy') }, 'obj [1,2]')
            expectEv({ form: 'obj', groups: [g('G1', 'OR', [p2, p1])] }, { real: r('nyn'), legacy: r('nyy') }, 'obj [2,1]')
            expectEv({ form: 'arr', groups: [g('G1', 'OR', [p1, p2])] }, { real: r('nyn'), legacy: r('nyy') }, 'arr [1,2]')
            expectEv({ form: 'arr', groups: [g('G1', 'OR', [p2, p1])] }, { real: r('nyn'), legacy: r('yyn') }, 'arr [2,1]')
        })

        it('SP-MIN-008b-整數式名稱 "2"、"10"(AND, 後者無規則): 任何儲存形式與順序皆為全 n(規則 4; 舊規則: 物件形式恆 "2" 在前得 T1, 陣列 "10" 在前得全 n)', function() {
            let p2 = p('2', 'AND', [['T1', 'y']])
            let p10 = p('10', 'AND', [])
            for (let form of ['obj', 'arr']) {
                for (let ps of [[p2, p10], [p10, p2]]) {
                    expectEv({ form, groups: [g('G1', 'OR', ps)] }, { real: r('nnn') }, `${form} ${ps.map((x) => x.name)}`)
                }
            }
        })

    })


    // ===========================================================
    // SP-SCAN: 窮舉彙整(與 test/tools/authMergeGolden.json 逐列相符)
    // ===========================================================
    describe('SP-SCAN 窮舉彙整(GOLD)', function() {

        let GOLD = JSON.parse(fs.readFileSync(GOLD_PATH, 'utf8'))

        goldScanDefs().forEach(([name, desc, fn]) => {
            it(`SP-SCAN-${name}-${desc}`, function() {
                let res = fn()
                let isCde = /cde/.test(name)
                //保真: 完整模型(新語意; 自原始四表獨立求值, 與 src 只共用解碼)在每一格都等於真函數
                assert.strictEqual(res.checks.fidelity, 0, '規格參考實作與真函數相異之格數')
                //順序無關(規則 4): 同一組項目之所有儲存順序(群組順序、權限順序; c／d／e 格另含同名多列之表列順序)得到同一結果
                Object.entries(res.rows).forEach(([row, x]) => {
                    Object.entries(x.dep).forEach(([k, [dep]]) => assert.strictEqual(dep, 0, `${row} ${k}: 新規則順序相依之 combo 數`))
                })
                //c、d 單獨亦只收回: 新語意關掉 e(只開 c、d)每格每個管理對象為 y 者 run04 必為 y
                assert.strictEqual(res.checks.retractNoE, 0, 'c、d 收嚴多給(run04 為 n)之(格,管理對象)數')
                //逐旗標歸因: 格內不含懸空／同名多列／mode 非法時, 單獨開關對應旗標不改變結果(差異只由該情形造成)
                assert.strictEqual(res.checks.idle, 0, '不含某情形卻因該旗標改變結果之格數')
                //只收回、無例外(規則: 新 ⊆ 1.1.12 且 新 ⊆ run04; 主責裁示 R-PRINCIPLE-00 e 之限制項): 每格每個管理對象, 新語意為 y 者 1.1.12 與 run04 必為 y
                assert.strictEqual(res.checks.retract, 0, '新規則多給(舊規則為 n、新規則為 y)之(格,管理對象)數')
                assert.strictEqual(res.checks.retract04, 0, '新語意多於 run04 之(格,管理對象)數')
                Object.entries(res.rows).forEach(([row, x]) => assert.deepStrictEqual(x.gain, [0, 0], `${row}: 新語意多於 run04／1.1.12 之格數`))
                if (!isCde) {
                    //不含 c／d／e 之格: 新語意＝run04 逐格相同
                    Object.entries(res.rows).forEach(([row, x]) => assert.deepStrictEqual(x.diff04, [0, 0], `${row}: 不含 c／d／e 時新語意＝run04`))
                }
                else {
                    //靈敏度: 含 c／d／e 之列與 run04 確有差異(檢查非空驗), 且各旗標單獨開啟確會改變結果
                    for (let [k, i, re] of [['c', 0, /^c/], ['d', 1, /^.d/], ['e', 2, /^..e/]]) {
                        let rowsX = Object.entries(res.rows).filter(([row]) => re.test(row))
                        assert.ok(rowsX.length > 0, `${k}: 窮舉空間須含此情形`)
                        assert.ok(rowsX.reduce((a, [, x]) => a + x.sens[i], 0) > 0, `${k}: 單獨開啟須有改變結果之格(靈敏度)`)
                        assert.ok(rowsX.reduce((a, [, x]) => a + x.diff04[0], 0) > 0, `${k}: 含此情形之列須有與 run04 相異之格`)
                    }
                    //不含任何情形之列(---)與 run04 相同
                    Object.entries(res.rows).filter(([row]) => row.startsWith('---')).forEach(([row, x]) => assert.deepStrictEqual(x.diff04, [0, 0], row))
                }
                //彙整與 GOLD 逐列相同(含舊規則之順序相依 combo 數與新舊差異量)
                assert.strictEqual(res.checks.cells, GOLD[name].checks.cells, '格數')
                assert.deepStrictEqual(res.checks, GOLD[name].checks, '檢查計數')
                assert.deepStrictEqual(res.rows, GOLD[name].rows, '各列(形狀|有無OR)之格數、舊規則順序相依 combo 數、與舊規則相異格數')
            })
        })

        it('SP-SCAN-READ-讀表: 稠密時新舊規則相同; 稀疏時新規則收回(與舊規則相異); 舊規則的順序相依只出現在「稀疏且無 OR」(權限層／群組層同形)', function() {
            for (let rows of [GOLD.P3k2.rows, GOLD.P3k3.rows, GOLD.G3k2.rows]) {
                assert.deepStrictEqual(rows['dense|OR'].diff, [0, 0], '稠密有 OR: 新舊相同')
                assert.deepStrictEqual(rows['dense|noOR'].diff, [0, 0], '稠密無 OR: 新舊相同')
                assert.ok(rows['sparse|OR'].diff[0] > 0, '稀疏有 OR: AND 未列者新規則視為 n, 與舊規則相異')
                assert.ok(rows['sparse|noOR'].diff[0] > 0, '稀疏無 OR: 新規則為嚴格交集, 與舊規則相異')
                assert.strictEqual(rows['sparse|OR'].dep.any[1], 0, '舊規則: 稀疏有 OR 時順序無關')
                assert.ok(rows['sparse|noOR'].dep.any[1] > 0, '舊規則: 稀疏無 OR 時順序相依')
            }
            assert.deepStrictEqual(GOLD.P3k2.rows, GOLD.G3k2.rows, '權限層與群組層(各群組單一權限)之彙整相同')
        })

    })


    // ===========================================================
    // SP-PROP: 結構性質(窮舉彙整所依據之論證, 皆以真函數驗證)
    // ===========================================================
    describe('SP-PROP 結構性質', function() {

        let vs3 = VS3
        let vs1 = VS1

        it('SP-PROJ-001-逐管理對象獨立: 多管理對象之結果等於各管理對象單獨計算之結果(含兩層隨機規格)', function() {
            let n = 0
            //權限層 3 管理對象 2 項: 全部 2,916 格
            for (let a of vs3) {
                for (let b of vs3) {
                    let spec = specP([a, b])
                    let full = realOf(spec)
                    for (let t of TARGET_IDS) {
                        let one = realOf(project(spec, t), [t])
                        assert.strictEqual(full[t], one[t], `${t} @ ${JSON.stringify(spec.groups[0].perms.map((x) => [x.mode, x.rules]))}`)
                        n++
                    }
                }
            }
            //兩層隨機規格 3,000 組
            let rng = mkRng(101)
            for (let i = 0; i < 3000; i++) {
                let spec = randomSpec(rng)
                let full = realOf(spec)
                for (let t of TARGET_IDS) {
                    assert.strictEqual(full[t], realOf(project(spec, t), [t])[t], `random #${i} ${t}`)
                    n++
                }
            }
            assert.strictEqual(n, 2916 * 3 + 3000 * 3)
        })

        it('SP-RULE-001-閉式(規則 1～3): 單層結果 = 「有 OR: 某 OR 項為 y 且 每個 AND 項皆為 y; 無 OR: 每個 AND 項皆為 y」, 未列視為 n(1 管理對象 1～4 項全部格; 3 管理對象 2 項全部格)', function() {
            let n = 0
            for (let k = 1; k <= 4; k++) {
                let seqs = []
                let rec = (acc) => {
                    if (acc.length === k) {
                        seqs.push(acc)
                        return
                    }
                    vs1.forEach((v) => rec([...acc, v]))
                }
                rec([])
                for (let seq of seqs) {
                    let items = seq.map((v) => ({ mode: v.mode, s: stateOf(v.rules, 'T1') }))
                    assert.strictEqual(realOf(specP(seq), ['T1']).T1, predictSpec(items), `P k=${k}`)
                    n++
                }
            }
            for (let a of vs3) {
                for (let b of vs3) {
                    let real = realOf(specP([a, b]))
                    for (let t of TARGET_IDS) {
                        let items = [a, b].map((v) => ({ mode: v.mode, s: stateOf(v.rules, t) }))
                        assert.strictEqual(real[t], predictSpec(items), `${t}`)
                        n++
                    }
                }
            }
            assert.strictEqual(n, 6 + 36 + 216 + 1296 + 2916 * 3)
        })

        it('SP-COMM-001-交換律窮舉(規則 4): 單層、1 管理對象 2～4 項之全部多重集合 × 全部儲存順序 → 結果恆唯一', function() {
            let n = 0
            for (let k = 2; k <= 4; k++) {
                for (let idxs of multisets(vs1.length, k)) {
                    let seq = idxs.map((i) => vs1[i])
                    let results = new Set()
                    for (let perm of permutations(seq)) {
                        results.add(realOf(specP(perm), ['T1']).T1)
                    }
                    assert.strictEqual(results.size, 1, `k=${k} ${seq.map((v) => v.id).join('+')}`)
                    n++
                }
            }
            assert.ok(n > 0)
        })

        it('SP-COMM-002-交換律(兩層隨機): 隨機規格重排「群組順序、各群組內權限順序、各權限內規則順序」後結果相同(3,000 組, 每組 3 種重排)', function() {
            let rng = mkRng(404)
            for (let i = 0; i < 3000; i++) {
                let spec = randomSpec(rng)
                let want = fmtResult(realOf(spec))
                for (let k = 0; k < 3; k++) {
                    assert.strictEqual(fmtResult(realOf(shuffleSpec(spec, rng))), want, `random #${i} 重排 ${k}`)
                }
            }
        })

        it('SP-COMM-003-交換律(陣列形式與物件鍵序): 名稱非整數式時, 同一組項目以陣列形式、物件形式、任意元素序/鍵序寫入, 結果皆相同(權限層 3 管理對象 2 項全部格 × 兩種順序 × 兩種形式)', function() {
            for (let a of vs3) {
                for (let b of vs3) {
                    let want = fmtResult(realOf(specP([a, b], { form: 'obj' })))
                    assert.strictEqual(fmtResult(realOf(specP([b, a], { form: 'obj' }))), want)
                    assert.strictEqual(fmtResult(realOf(specP([a, b], { form: 'arr' }))), want)
                    assert.strictEqual(fmtResult(realOf(specP([b, a], { form: 'arr' }))), want)
                }
            }
        })

        it('SP-RULE-002-舊規則複製(mergeLegacy)與其閉式保真: 稽核工具以它求「舊規則下之結果」, 須與舊規則之閉式一致(1 管理對象 1～4 項全部格)', function() {
            let n = 0
            for (let k = 1; k <= 4; k++) {
                let rec = (acc) => {
                    if (acc.length === k) {
                        let e = quiet(() => evalSpec(specP(acc), ['T1']))
                        assert.strictEqual(e.sem.legacy.T1, predictLegacy(acc.map((v) => ({ mode: v.mode, s: stateOf(v.rules, 'T1') }))))
                        n++
                        return
                    }
                    vs1.forEach((v) => rec([...acc, v]))
                }
                rec([])
            }
            assert.strictEqual(n, 6 + 36 + 216 + 1296)
        })

        it('SP-RETRACT-001-只收回不多給(兩層隨機 3,000 組): 新規則為 y 者舊規則必為 y(新 ⊆ 舊), 且真函數等於規格參考實作', function() {
            let rng = mkRng(2121)
            let lost = 0
            for (let i = 0; i < 3000; i++) {
                let e = quiet(() => evalSpec(randomSpec(rng)))
                assert.strictEqual(fmtResult(e.real), fmtResult(e.sem.spec), `random #${i} 保真`)
                for (let t of TARGET_IDS) {
                    if (e.real[t] === 'y') {
                        assert.strictEqual(e.sem.legacy[t], 'y', `random #${i} ${t} 新規則多給`)
                    }
                    else if (e.sem.legacy[t] === 'y') {
                        lost++
                    }
                }
            }
            assert.ok(lost > 0, '隨機規格中確有被新規則收回者(否則本案無靈敏度)')
        })

        it('SP-LAYER-EQ-001-權限層與群組層同形: 同一組項目放在群組內(各權限)或使用者下(各群組含單一 OR 權限), 每一格結果相同(3 管理對象 2 項全部格; 1 管理對象 3、4 項全部格)', function() {
            for (let a of vs3) {
                for (let b of vs3) {
                    assert.strictEqual(fmtResult(realOf(specP([a, b]))), fmtResult(realOf(specG([a, b]))))
                }
            }
            for (let k of [3, 4]) {
                let rec = (acc) => {
                    if (acc.length === k) {
                        assert.strictEqual(fmtResult(realOf(specP(acc), ['T1']), ['T1']), fmtResult(realOf(specG(acc), ['T1']), ['T1']))
                        return
                    }
                    vs1.forEach((v) => rec([...acc, v]))
                }
                rec([])
            }
        })

        it('SP-LAYER-EQ-002-使用者只有一個群組時, 該群組之 mode 為 OR 或 AND 不影響結果; mode 缺或非法(or、XOR、1)則為限制項而該層無合法項 → 全 n(R-PRINCIPLE-00 e 主責裁示; 與 run04「不計入」同, 不多給)', function() {
            let n = 0
            for (let a of vs3) {
                for (let b of vs3) {
                    let base = fmtResult(realOf(specP([a, b], { grupMode: 'OR' })))
                    assert.strictEqual(fmtResult(realOf(specP([a, b], { grupMode: 'AND' }))), base, 'mode=AND')
                    for (let m of ['or', 'XOR', 1]) {
                        assert.strictEqual(fmtResult(realOf(specP([a, b], { grupMode: m }))), r('nnn'), `mode=${m}`)
                    }
                    //mode 缺(群組引用無 mode 欄)
                    let sp = specP([a, b])
                    assert.strictEqual(fmtResult(realOf({ ...sp, groups: [{ ...sp.groups[0], mode: undefined }] })), r('nnn'), 'mode 缺')
                    n++
                }
            }
            assert.strictEqual(n, 2916)
        })

    })


    // ===========================================================
    // SP-PG: 兩層交互(單層命題無法單獨推出系統層結論)
    // ===========================================================
    describe('SP-PG 兩層交互', function() {

        it('SP-PG-001-群組內 AND 權限列出而 OR 基底未授予之管理對象, 在群組層以「明示 n」出現, 與另一 AND 群組交集後為 n; 兩種群組順序相同(舊規則: 群組層亦順序相依)', function() {
            let ga = g('GA', 'AND', [p('P1', 'OR', [['T1', 'y']])]) //群組輸出 {T1:y}
            let gb = g('GB', 'AND', [p('Q1', 'OR', [['T2', 'y']]), p('Q2', 'AND', [['T1', 'y']])]) //群組輸出: OR 基底 {T2} 再與 Q2{T1} 交集 → 全 n
            expectEv({ groups: [ga, gb] }, { real: r('nnn'), legacy: r('nnn') }, '[GA,GB]')
            expectEv({ groups: [gb, ga] }, { real: r('nnn'), legacy: r('nyn') }, '[GB,GA]')
            //對照: 只有 GA 時 T1 為 y
            expectEv({ groups: [ga] }, { real: r('ynn') }, '[GA]')
        })

        it('SP-PG-002-同一權限被多個群組共用(各群組引用時 mode 可不同): 結果等於各群組各用一份同內容權限(兩層隨機規格 2,000 組)', function() {
            let rng = mkRng(11)
            for (let i = 0; i < 2000; i++) {
                let base = randomSpec(rng, { minPerms: 1 })
                //共用版: 第二個群組(若有)引用第一個群組之全部權限(同名同內容, mode 隨機); 獨立版: 第二個群組用加尾碼之同內容權限
                let g0 = base.groups[0]
                let g1 = base.groups[1] || g('GX', 'OR', [])
                let modeOf = (k) => ((i + k) % 2 === 0 ? 'OR' : 'AND')
                let sharedPerms = g0.perms.map((pp, k) => ({ ...pp, mode: modeOf(k) }))
                let shared = { groups: [g0, { ...g1, name: 'GX', perms: sharedPerms }] }
                let uniq = { groups: [g0, { ...g1, name: 'GX', perms: sharedPerms.map((pp) => ({ ...pp, name: `${pp.name}#2` })) }] }
                assert.strictEqual(fmtResult(realOf(shared)), fmtResult(realOf(uniq)), `random #${i}`)
            }
        })

    })


    // ===========================================================
    // SP-DROP: 不計入之項目等同移除
    // ===========================================================
    describe('SP-DROP 不計入之項目', function() {

        //若計入會改變結果的「干擾項」——run05 起只剩「引用之 isActive 非 'y'」不計入(規則 5); 各種 mode、懸空、同名多列之停用引用皆然
        let killer = [['T1', 'n'], ['T2', 'n'], ['T3', 'n']]
        let grant = [['T1', 'y'], ['T2', 'y'], ['T3', 'y']]
        let dropPerms = [
            p('PX', 'AND', killer, { active: 'n' }),
            p('PX', 'OR', grant, { active: 'n' }),
            p('PX', 'AND', killer, { active: undefined }), //isActive 缺
            p('PX', 'AND', killer, { active: 'yes' }), //非 'y'
            p('PX', undefined, killer, { active: 'n' }),
            p('PX', 'or', killer, { active: 'n' }),
            p('PX', 'AND', killer, { active: 'n', inTable: false }), //停用之懸空引用
            p('PX', 'AND', killer, { active: 'n', dupRows: [{ rules: grant }] }), //停用之同名多列引用
        ]
        let dropGroups = [
            g('GX', 'AND', [p('PXX', 'OR', killer)], { active: 'n' }),
            g('GX', 'OR', [p('PXX', 'OR', grant)], { active: 'n' }),
            g('GX', 'AND', [], { active: undefined }),
            g('GX', 'XOR', [], { active: 'n' }),
            g('GX', 'AND', [], { active: 'n', inTable: false }),
            g('GX', 'AND', [p('PXX', 'OR', grant)], { active: 'n', dupRows: [{ perms: [] }] }),
        ]
        let ins = (arr, i, x) => [...arr.slice(0, i), x, ...arr.slice(i)]

        it('SP-DROP-001-run05: 引用之 isActive 非 y(n、缺、"yes"; 含 mode 非法、懸空、同名多列之停用引用)在任何位置插入皆不改變結果(等同移除; 3 管理對象 2 項全部格 × 全部插入位置; 規則 5)', function() {
            let n = 0
            for (let a of VS3) {
                for (let b of VS3) {
                    let basePs = [{ ...p('P1', a.mode, a.rules) }, { ...p('P2', b.mode, b.rules) }]
                    let want = fmtResult(realOf({ groups: [g('G1', 'OR', basePs)] }))
                    for (let x of dropPerms) {
                        for (let i = 0; i <= 2; i++) {
                            assert.strictEqual(fmtResult(realOf({ groups: [g('G1', 'OR', ins(basePs, i, x))] })), want, `權限層 ${JSON.stringify(x)} @${i}`)
                            n++
                        }
                    }
                    let baseGs = [g('GA', a.mode, [p('PA', 'OR', a.rules)]), g('GB', b.mode, [p('PB', 'OR', b.rules)])]
                    let wantG = fmtResult(realOf({ groups: baseGs }))
                    for (let x of dropGroups) {
                        for (let i = 0; i <= 2; i++) {
                            assert.strictEqual(fmtResult(realOf({ groups: ins(baseGs, i, x) })), wantG, `群組層 ${x.name} @${i}`)
                            n++
                        }
                    }
                }
            }
            assert.strictEqual(n, 2916 * (dropPerms.length + dropGroups.length) * 3)
        })

        it('SP-DROP-001b-run05 e: mode 缺或非法(缺、or、XOR、1、null)之啟用引用 ≡ 同一項以 AND 參與(權限層與群組層; 3 管理對象 2 項全部格 × 全部插入位置)', function() {
            let xr = [['T1', 'y'], ['T2', 'y']]
            let n = 0
            for (let a of VS3) {
                for (let b of VS3) {
                    let basePs = [p('P1', a.mode, a.rules), p('P2', b.mode, b.rules)]
                    let baseGs = [g('GA', a.mode, [p('PA', 'OR', a.rules)]), g('GB', b.mode, [p('PB', 'OR', b.rules)])]
                    for (let i = 0; i <= 2; i++) {
                        let wantP = fmtResult(realOf({ groups: [g('G1', 'OR', ins(basePs, i, p('PX', 'AND', xr)))] }))
                        let wantG = fmtResult(realOf({ groups: ins(baseGs, i, g('GX', 'AND', [p('PXX', 'OR', xr)])) }))
                        for (let m of BAD_MODES) {
                            assert.strictEqual(fmtResult(realOf({ groups: [g('G1', 'OR', ins(basePs, i, p('PX', m, xr)))] })), wantP, `權限層 mode=${m} @${i}`)
                            assert.strictEqual(fmtResult(realOf({ groups: ins(baseGs, i, g('GX', m, [p('PXX', 'OR', xr)])) })), wantG, `群組層 mode=${m} @${i}`)
                            n++
                        }
                    }
                }
            }
            assert.strictEqual(n, 2916 * 3 * BAD_MODES.length)
        })

        it('SP-DROP-001c-run05 c: 懸空之啟用引用(OR／AND)≡ 同 mode 之空內容項(權限層: crules 為 {}; 群組層: 無權限之群組)(3 管理對象 2 項全部格 × 全部插入位置)', function() {
            let n = 0
            for (let a of VS3) {
                for (let b of VS3) {
                    let basePs = [p('P1', a.mode, a.rules), p('P2', b.mode, b.rules)]
                    let baseGs = [g('GA', a.mode, [p('PA', 'OR', a.rules)]), g('GB', b.mode, [p('PB', 'OR', b.rules)])]
                    for (let m of ['OR', 'AND']) {
                        for (let i = 0; i <= 2; i++) {
                            assert.strictEqual(fmtResult(realOf({ groups: [g('G1', 'OR', ins(basePs, i, p('PX', m, grant, { inTable: false })))] })), fmtResult(realOf({ groups: [g('G1', 'OR', ins(basePs, i, p('PX', m, [])))] })), `權限層 ${m} @${i}`)
                            assert.strictEqual(fmtResult(realOf({ groups: ins(baseGs, i, g('GX', m, [p('PXX', 'OR', grant)], { inTable: false })) })), fmtResult(realOf({ groups: ins(baseGs, i, g('GX', m, [])) })), `群組層 ${m} @${i}`)
                            n++
                        }
                    }
                }
            }
            assert.strictEqual(n, 2916 * 2 * 3)
        })

        it('SP-DROP-002-run05: getUserRules 回傳之 grups(供 grupsNames)含啟用且查得之群組(含 mode 缺或非法者), 不含停用者與懸空者; mode 非法之群組以 AND 參與合併(e), 懸空 OR 群組不增加(c)', function() {
            let part = [['T1', 'y'], ['T2', 'y']]
            let gs = [g('G1', 'OR', [p('P1', 'OR', grant)]), g('G2', 'or', [p('P2', 'OR', part)]), g('G3', 'OR', [], { active: 'n' }), g('G4', 'OR', [], { inTable: false })]
            let d = buildData({ groups: gs })
            let out = getUserRules(d.user, d.grups, d.pemis, d.targets)
            assert.deepStrictEqual(out.grups.map((x) => x.name), ['G1', 'G2'], '停用之 G3、懸空之 G4 不在回傳之 grups')
            assert.strictEqual(fmtResult(toMap(out.rules)), r('yyn'), 'G1(OR){T1,T2,T3} ∪ G4(OR 懸空, 空) 再 ∩ G2(mode 非法 → AND){T1,T2}')
            assert.strictEqual(ev(d).run04, r('yyy'), 'run04: G2 不計入, 結果只由 G1 決定')
            //再加 mode 缺且無權限之 G5: 視為 AND、內容全 n → 收回全部
            let d5 = buildData({ groups: [...gs, g('G5', undefined, [])] })
            let out5 = getUserRules(d5.user, d5.grups, d5.pemis, d5.targets)
            assert.deepStrictEqual(out5.grups.map((x) => x.name), ['G1', 'G2', 'G5'])
            assert.strictEqual(fmtResult(toMap(out5.rules)), r('nnn'), 'G5(mode 缺 → AND, 無權限 → 全 n)收回全部')
        })

        it('SP-DROP-003-損壞或空的授權字串視為「未列任何管理對象」之項目(仍占一個項目位置, AND 時＝全部 n): crules 為空字串／{}／[]／null／非 JSON／截斷, 排前排後結果皆全 n', function() {
            let ok = p('PB', 'AND', [['T1', 'y'], ['T2', 'y']])
            for (let order of [0, 1]) {
                let pa = p('PA', 'AND', [])
                assert.strictEqual(fmtResult(realOf({ groups: [g('G1', 'OR', order ? [ok, pa] : [pa, ok])] })), r('nnn'), `空規則 AND 項 order=${order}`)
            }
            for (let raw of ['', '{}', '[]', 'null', 'not json', '{"T1":']) {
                let bad = p('PA', 'AND', [], { crulesRaw: raw })
                let a = quiet(() => fmtResult(realOf({ groups: [g('G1', 'OR', [bad, ok])] })))
                let b = quiet(() => fmtResult(realOf({ groups: [g('G1', 'OR', [ok, bad])] })))
                assert.strictEqual(a, r('nnn'), `crules=${JSON.stringify(raw)} 排前`)
                assert.strictEqual(b, r('nnn'), `crules=${JSON.stringify(raw)} 排後`)
            }
        })

        it('SP-DROP-005-run05 d: 群組表／權限表有同名列(歷史同名; F-02 防新增)——內容取各筆之交集, 與表列順序無關(run04／1.1.12 取表中第一筆, 結果隨表列順序而異)', function() {
            let a = buildData({ groups: [g('G1', 'OR', [p('P1', 'OR', [['T1', 'y'], ['T2', 'y']])])] })
            let b = buildData({ groups: [g('G1', 'OR', [p('P2', 'OR', [['T2', 'y'], ['T3', 'y']])])] })
            let dOf = (grupsRows, pemisRows) => ({ user: a.user, grups: grupsRows.map((x, k) => ({ ...x, id: `id-G1-${k}` })), pemis: pemisRows, targets: a.targets })
            //同名群組 G1 兩筆(含 P1 {T1,T2}、含 P2 {T2,T3}): 交集 {T2}, 兩種表列順序相同
            expectEv(dOf([a.grups[0], b.grups[0]], [...a.pemis, ...b.pemis]), { real: r('nyn'), run04: r('yyn') }, '同名群組 [含P1, 含P2]')
            expectEv(dOf([b.grups[0], a.grups[0]], [...a.pemis, ...b.pemis]), { real: r('nyn'), run04: r('nyy') }, '同名群組 [含P2, 含P1](run04 取另一筆)')
            //同名權限: 兩筆 P1({T1,T2}、{T2,T3}) → 交集 {T2}; 一筆為空 → 全 n
            let p1a = { id: 'id-P1a', name: 'P1', crules: JSON.stringify({ T1: 'y', T2: 'y' }) }
            let p1b = { id: 'id-P1b', name: 'P1', crules: JSON.stringify({ T2: 'y', T3: 'y' }) }
            let p1e = { id: 'id-P1e', name: 'P1', crules: '{}' }
            expectEv(dOf([a.grups[0]], [p1a, p1b]), { real: r('nyn'), run04: r('yyn') }, '同名權限 [a,b]')
            expectEv(dOf([a.grups[0]], [p1b, p1a]), { real: r('nyn'), run04: r('nyy') }, '同名權限 [b,a]')
            expectEv(dOf([a.grups[0]], [p1a, p1e]), { real: r('nnn'), run04: r('yyn') }, '同名權限其一為空')
            expectEv(dOf([a.grups[0]], [p1e, p1a, p1b]), { real: r('nnn'), run04: r('nnn') }, '三筆其一為空')
            //稽核工具列出此來源
            let nc = findNameConflicts([a.grups[0], b.grups[0]], [p1a, p1b])
            assert.deepStrictEqual(nc, { grups: [{ name: 'G1', count: 2, sameContent: false }], pemis: [{ name: 'P1', count: 2, sameContent: false }] })
            //建構器對「同名異內容」之規格拋錯(不靜默吞掉第二份定義, 外審 sol R02)
            assert.throws(() => buildData({ groups: [g('A', 'OR', [p('P', 'OR', [['T1', 'y']])]), g('B', 'OR', [p('P', 'OR', [['T1', 'n']])])] }), /同名權限/)
            assert.throws(() => buildData({ groups: [g('G', 'OR', [p('P', 'OR', [['T1', 'y']])]), g('G', 'OR', [p('Q', 'OR', [['T1', 'y']])])] }), /同名群組/)
        })

        it('SP-DROP-004-使用者 cgrups 損壞 → 無任何群組 → 全部 n; 群組 cpemis 損壞 → 該群組視為無權限之 AND 項(＝全部 n), 與順序無關', function() {
            let spec = { cgrupsRaw: 'not json', groups: [g('G1', 'OR', [p('P1', 'OR', grant)])] }
            assert.strictEqual(quiet(() => fmtResult(realOf(spec))), r('nnn'))
            let good = g('GB', 'AND', [p('PB', 'OR', [['T1', 'y'], ['T2', 'y']])])
            let badG = g('GA', 'AND', [], { cpemisRaw: '{oops' })
            assert.strictEqual(quiet(() => fmtResult(realOf({ groups: [badG, good] }))), r('nnn'), '損壞群組排前 → 全 n')
            assert.strictEqual(quiet(() => fmtResult(realOf({ groups: [good, badG] }))), r('nnn'), '損壞群組排後 → 全 n(舊規則: 無影響)')
        })

    })


    // ===========================================================
    // SP-CDE: R-PRINCIPLE-00 適用表 c(懸空)／d(同名多列)／e(mode 非法)(run05)
    // ===========================================================
    describe('SP-CDE 懸空／同名多列／mode 非法(R-PRINCIPLE-00 c／d／e)', function() {

        let all = [['T1', 'y'], ['T2', 'y'], ['T3', 'y']]
        let x12 = [['T1', 'y'], ['T2', 'y']]
        let x23 = [['T2', 'y'], ['T3', 'y']]
        let realD = (d) => fmtResult(toMap(quiet(() => getUserRules(d.user, d.grups, d.pemis, d.targets)).rules))
        let TOG = Object.fromEntries(CDE_KEYS.flatMap((x) => [[`r04+${x}`, flagsWith(FLAGS.run04, [x])], [`new-${x}`, flagsWithout(FLAGS.spec, [x])]]))

        it('SP-CDE-001-使用者之例(c): ①AND 引用之群組被刪(懸空)→ 該使用者授權為空; ②OR 懸空＋另一 OR 正常 → 正常者之授權不受影響; ③OR 懸空＋AND X(無其他 OR)→ 空(有 OR 項使基底為 OR 聯集)——群組層與權限層同形', function() {
            //群組層(使用者 cgrups)
            let GO = g('GO', 'OR', [p('PO', 'OR', all)])
            let GO2 = g('GO2', 'OR', [p('PO2', 'OR', x12)])
            let GA = g('GA', 'AND', [p('PA', 'OR', x12)])
            let GB = g('GB', 'AND', [p('PB', 'OR', x23)])
            let gone = (mode) => g('GD', mode, [], { inTable: false })
            expectEv({ groups: [GO, gone('AND')] }, { real: r('nnn'), run04: r('yyy'), legacy: r('yyy') }, '① OR 群組＋AND 懸空')
            expectEv({ groups: [gone('AND'), GA] }, { real: r('nnn'), run04: r('yyn'), legacy: r('yyn') }, '① 只有 AND: 懸空排前')
            expectEv({ groups: [GA, gone('AND')] }, { real: r('nnn'), run04: r('yyn'), legacy: r('yyn') }, '① 只有 AND: 懸空排後')
            expectEv({ groups: [GO2, gone('OR')] }, { real: r('yyn'), run04: r('yyn') }, '② OR 懸空＋OR 正常')
            expectEv({ groups: [gone('OR'), GO2] }, { real: r('yyn'), run04: r('yyn') }, '② 懸空排前')
            expectEv({ groups: [GO2, gone('OR'), GB] }, { real: r('nyn'), run04: r('nyn') }, '② 另有 AND: 與無懸空者相同')
            expectEv({ groups: [gone('OR'), GA] }, { real: r('nnn'), run04: r('yyn'), legacy: r('yyn') }, '③ OR 懸空＋AND X')
            expectEv({ groups: [GA, gone('OR')] }, { real: r('nnn'), run04: r('yyn') }, '③ 懸空排後')
            //權限層(群組 cpemis)
            let pd = (mode) => p('PD', mode, all, { inTable: false })
            expectEv({ groups: [g('G1', 'OR', [p('PO', 'OR', all), pd('AND')])] }, { real: r('nnn'), run04: r('yyy') }, '權限層 ①')
            expectEv({ groups: [g('G1', 'OR', [p('PO2', 'OR', x12), pd('OR')])] }, { real: r('yyn'), run04: r('yyn') }, '權限層 ②')
            expectEv({ groups: [g('G1', 'OR', [pd('OR'), p('PA', 'AND', x12)])] }, { real: r('nnn'), run04: r('yyn') }, '權限層 ③')
        })

        it('SP-CDE-002-c 細節: 停用之懸空引用不參與; 懸空且 mode 非法 → 以 AND 參與(全 n); 名稱 "" 之引用與名稱為 "" 或無 name 欄之列相符, 無此列則懸空', function() {
            let GO = g('GO', 'OR', [p('PO', 'OR', x12)])
            expectEv({ groups: [GO, g('GD', 'AND', [], { inTable: false, active: 'n' })] }, { real: r('yyn') }, '停用之懸空 AND')
            expectEv({ groups: [GO, g('GD', 'or', [], { inTable: false })] }, { real: r('nnn'), run04: r('yyn') }, '懸空且 mode 非法 → AND')
            //名稱 "": 群組表有名稱為 "" 之列 → 相符(照常授權); 列無 name 欄 → 亦相符(視為 ""); 無此列 → 懸空
            let withEmpty = buildData({ groups: [g('', 'AND', [p('PE', 'OR', x23)]), GO] })
            assert.strictEqual(withEmpty.grups[0].name, '')
            expectEv(withEmpty, { real: r('nyn') }, '名稱 "" 之列: AND {T2,T3} ∩ GO {T1,T2}')
            let noNameCol = { ...withEmpty, grups: withEmpty.grups.map((x) => (x.name === '' ? { id: x.id, cpemis: x.cpemis } : x)) }
            expectEv(noNameCol, { real: r('nyn') }, '列無 name 欄 → 視為 ""')
            let noRow = { ...withEmpty, grups: withEmpty.grups.filter((x) => x.name !== '') }
            expectEv(noRow, { real: r('nnn'), run04: r('yyn') }, '無名稱 "" 之列 → 懸空 AND')
            assert.deepStrictEqual(refIssues(noRow).map((x) => [x.code, x.level, x.name]), [['dangling', 'grup', '']])
        })

        it('SP-CDE-003-d: 同名多列(群組層與權限層, 2～3 候選, 含候選內容為空)取各筆之交集; 結果與表列順序無關(run04 取表中第一筆而隨序改變)', function() {
            let GO = g('GO', 'OR', [p('PO', 'OR', all)])
            //群組層: GM(AND) 兩列(含 PM1 {T1,T2}、含 PM2 {T2,T3}) → 交集 {T2}
            let GM = g('GM', 'AND', [p('PM1', 'OR', x12)], { dupRows: [{ perms: [p('PM2', 'OR', x23)] }] })
            let d = buildData({ groups: [GO, GM] })
            let reals = new Set()
            let r04s = new Set()
            for (let order of permutations(d.grups)) {
                let e = ev({ ...d, grups: order })
                assert.strictEqual(e.spec, e.real)
                reals.add(e.real)
                r04s.add(e.run04)
            }
            assert.deepStrictEqual([...reals], [r('nyn')], '新語意: 各表列順序皆為交集 {T2}')
            assert.deepStrictEqual([...r04s].sort(), [r('nyy'), r('yyn')].sort(), 'run04: 隨表列順序取第一筆(對照組)')
            //3 候選, 其一無權限(內容為空) → 全 n
            let GM3 = g('GM', 'AND', [p('PM1', 'OR', x12)], { dupRows: [{ perms: [p('PM2', 'OR', x23)] }, { perms: [] }] })
            expectEv({ groups: [GO, GM3] }, { real: r('nnn'), run04: r('yyn') }, '群組層 3 候選其一為空')
            //同名多列且 mode OR: 交集後再聯集
            expectEv({ groups: [g('GQ', 'OR', [p('PQ1', 'OR', x12)], { dupRows: [{ perms: [p('PQ2', 'OR', all)] }] })] }, { real: r('yyn') }, '群組層 OR: {T1,T2} ∩ {T1,T2,T3}')
            //同名多列內容相同 → 與單一列相同
            expectEv({ groups: [g('GS', 'OR', [p('PS', 'OR', x12)], { dupRows: [{ perms: [p('PS', 'OR', x12)] }] })] }, { real: r('yyn'), run04: r('yyn') }, '同內容兩列')
            //權限層: P1 三列 {T1,T2,T3}、{T1,T2}、{T2,T3} → {T2}; 權限表列之所有順序相同
            let dP = buildData({ groups: [g('G1', 'OR', [p('P1', 'OR', all, { dupRows: [{ rules: x12 }, { rules: x23 }] })])] })
            assert.strictEqual(dP.pemis.length, 3)
            let realsP = new Set()
            for (let order of permutations(dP.pemis)) {
                realsP.add(ev({ ...dP, pemis: order }).real)
            }
            assert.deepStrictEqual([...realsP], [r('nyn')], '權限層 3 候選之 6 種表列順序')
            expectEv({ groups: [g('G1', 'OR', [p('P1', 'AND', x12, { dupRows: [{ rules: [] }] }), p('P2', 'OR', all)])] }, { real: r('nnn'), run04: r('yyn') }, '權限層 AND 兩列其一為空')
        })

        it('SP-CDE-004-e: mode 缺／or／XOR／1／null 之啟用引用視為 AND(與其他有效項並存時只收回); 停用者仍不參與; 各種非法值結果相同(窮舉 2 項 × 全部位置)', function() {
            for (let m of BAD_MODES) {
                expectEv({ groups: [g('G1', 'OR', [p('PO', 'OR', all), p('PB', m, [['T1', 'y']])])] }, { real: r('ynn'), run04: r('yyy'), legacy: r('yyy') }, `權限層 mode=${m}`)
                expectEv({ groups: [g('GO', 'OR', [p('PO', 'OR', all)]), g('GB', m, [p('PB', 'OR', [['T1', 'y']])])] }, { real: r('ynn'), run04: r('yyy') }, `群組層 mode=${m}`)
                expectEv({ groups: [g('G1', 'OR', [p('PO', 'OR', all), p('PB', m, [['T1', 'y']], { active: 'n' })])] }, { real: r('yyy') }, `停用 mode=${m}`)
            }
            //非法值之等價: 2 項窮舉(模式 OR／AND／or × 內容 F6 規則集、懸空、同名 2 列), 把 or 換成其他非法值(含 Or、空字串、AND 帶空白、true)結果不變
            let vs = cdeVariants(['OR', 'AND', 'or'], RULESETS_F6, [[0, 2], [3, 5]])
            let alts = [...BAD_MODES, 'Or', '', 'AND ', true]
            let n = 0
            for (let a of vs) {
                for (let b of vs) {
                    if (a.mode !== 'or' && b.mode !== 'or') {
                        continue
                    }
                    let base = fmtResult(realOf(specP([a, b])))
                    for (let m of alts) {
                        let sub = (v) => (v.mode === 'or' ? { ...v, mode: m } : v)
                        assert.strictEqual(fmtResult(realOf(specP([sub(a), sub(b)]))), base, `${a.id}+${b.id} → mode=${String(m)}`)
                        n++
                    }
                }
            }
            assert.strictEqual(n, (27 * 27 - 18 * 18) * alts.length)
        })

        it('SP-CDE-005-e 唯一項不多給(主責裁示: mode 缺或非法者為限制項, 該層無 mode 合法之啟用項 → 全 n): 群組內唯一權限 mode=or、使用者唯一群組 mode=or、AND 群組內唯一權限 mode 非法、物件形式純量值 {"GB":"y"} 四例皆為全 n(run05 初版「視為一般 AND」會多給); 窮舉 2 項 64,800 格 0 多給, 而「視為一般 AND」之對照解讀確有多給(檢查之靈敏度)', function() {
            //四例(原「多給」之格): 新語意與 run04、1.1.12 同為全 n
            expectEv({ groups: [g('G1', 'OR', [p('PB', 'or', [['T1', 'y']])])] }, { real: r('nnn'), run04: r('nnn'), legacy: r('nnn') }, '① 群組內唯一權限 mode=or')
            expectEv({ groups: [g('GB', 'or', [p('PB', 'OR', x12)])] }, { real: r('nnn'), run04: r('nnn'), legacy: r('nnn') }, '② 使用者唯一群組 mode=or')
            expectEv({ groups: [g('G1', 'AND', [p('PB', 'XOR', [['T1', 'y']])]), g('GO', 'OR', [p('PO', 'OR', all)])] }, { real: r('nnn'), run04: r('nnn') }, '③ AND 群組內唯一權限 mode 非法 → 該群組內容為空 → 收回全部')
            expectEv({ cgrupsRaw: JSON.stringify({ GB: 'y' }), groups: [g('GB', 'OR', [p('PB', 'OR', x12)])] }, { real: r('nnn'), run04: r('nnn') }, '④ 物件形式純量值 {"GB":"y"}(cvKpToArr 解為 isActive:y、無 mode)')
            //多個限制項而無合法項 → 全 n; 一旦有合法項, 限制項與 AND 等價
            expectEv({ groups: [g('G1', 'OR', [p('PB1', 'or', all), p('PB2', undefined, x12)])] }, { real: r('nnn'), run04: r('nnn') }, '兩個限制項、無合法項')
            expectEv({ groups: [g('G1', 'OR', [p('PB1', 'or', all), p('PB2', undefined, x12), p('PO', 'OR', all)])] }, { real: r('yyn'), run04: r('yyy') }, '另有合法 OR 項: 限制項收斂')
            expectEv({ groups: [g('G1', 'OR', [p('PB', 'or', x12), p('PA', 'AND', x23)])] }, { real: r('nyn'), run04: r('nyy') }, '另有合法 AND 項(為基底), 限制項交集')
            expectEv({ groups: [g('G1', 'OR', [p('PB', 'or', x12), p('PD', 'AND', all, { inTable: false })])] }, { real: r('nnn'), run04: r('nnn') }, '合法項為懸空(內容空)→ 全 n')
            //窮舉: 新語意 ⊆ run04(0 例外); 「某層啟用項皆 mode 非法」之格該層為空(P 層: 兩項皆非法 → 全 n; G 層同); 對照之「視為一般 AND」(badMode:'AND')確有多給
            let naive = { ...FLAGS.spec, badMode: 'AND' }
            let nCls = 0
            let nNaiveGain = 0
            for (let layer of ['P', 'G']) {
                let vs = cdeVariants2()
                for (let a of vs) {
                    for (let b of vs) {
                        let spec = (layer === 'G') ? specG([a, b]) : specP([a, b])
                        let e = evalSpec(spec, TARGET_IDS, { flags: { naive } })
                        for (let t of TARGET_IDS) {
                            if (e.real[t] === 'y') {
                                assert.strictEqual(e.sem.run04[t], 'y', `多給: ${layer} ${a.id}+${b.id} @${t}`)
                                assert.strictEqual(e.sem.legacy[t], 'y', `多給(1.1.12): ${layer} ${a.id}+${b.id} @${t}`)
                            }
                        }
                        if (hasAllBadLevel(spec)) {
                            nCls++
                            assert.strictEqual(fmtResult(e.real), r('nnn'), `該層啟用項皆 mode 非法 → 全 n: ${layer} ${a.id}+${b.id}`)
                            nNaiveGain += TARGET_IDS.some((t) => e.sem.naive[t] === 'y' && e.sem.run04[t] !== 'y') ? 1 : 0
                        }
                    }
                }
            }
            assert.ok(nCls > 0, `此類格數 ${nCls}`)
            assert.ok(nNaiveGain > 0, `對照: 「視為一般 AND」於此類多給之格數 ${nNaiveGain}(限制項之必要性)`)
        })

        it('SP-CDE-010-限制項(mode 非法)與 OR／AND 混合之閉式與交換律窮舉: 單一管理對象, 項目 = 模式 {OR, AND, or(非法)} × 狀態 {y, n, 未列}, 1～4 項之全部序列: 真函數 ＝ 閉式「(有合法項) 且 (有 OR ? 某 OR 為 y : 真) 且 每個 AND／限制項皆為 y」, 且同一多重集合之所有排列結果相同(權限層與群組層)', function() {
            let vs = itemVariants(['OR', 'AND', 'or'], rulesetsAll(['T1']))
            let close = (seq) => {
                let st = seq.map((v) => ({ mode: v.mode, s: stateOf(v.rules, 'T1') }))
                if (!st.some((x) => x.mode === 'OR' || x.mode === 'AND')) {
                    return 'n'
                }
                let ors = st.filter((x) => x.mode === 'OR')
                let y = (ors.length > 0 ? ors.some((x) => x.s === 'y') : true) && st.filter((x) => x.mode !== 'OR').every((x) => x.s === 'y')
                return y ? 'y' : 'n'
            }
            let n = 0
            for (let k = 1; k <= 4; k++) {
                for (let seq of product(vs, k)) {
                    let want = close(seq)
                    assert.strictEqual(realOf(specP(seq), ['T1']).T1, want, `P ${seq.map((v) => v.id).join('+')}`)
                    assert.strictEqual(realOf(specG(seq), ['T1']).T1, want, `G ${seq.map((v) => v.id).join('+')}`)
                    n++
                }
            }
            assert.strictEqual(n, 9 + 81 + 729 + 6561, '全部序列(含所有排列; 閉式與順序無關, 故逐序列等於閉式即證交換律)')
        })

        it('SP-CDE-006-隨機兩層 6,000 組(懸空／同名多列／mode 非法／停用／陣列形式): 保真(真函數＝完整模型)、順序無關(授權字串之項目序＋表列順序重排 3 次)、只收回(⊆ run04 且 ⊆ 1.1.12, 0 例外; c、d 單獨亦然)、逐旗標歸因(不含該情形時開關旗標不改變結果)', function() {
            let rng = mkRng(505)
            let st = { retract: 0, gain: 0, feat: { c: 0, d: 0, e: 0 }, sens: { c: 0, d: 0, e: 0 } }
            for (let i = 0; i < 6000; i++) {
                let spec = randomSpecCde(rng)
                let d = buildData(spec)
                let e = quiet(() => evalData(d, { flags: TOG }))
                let want = fmtResult(e.real)
                assert.strictEqual(fmtResult(e.sem.spec), want, `random #${i} 保真`)
                for (let k = 0; k < 3; k++) {
                    let d2 = shuffleTables(buildData(shuffleSpec(spec, rng)), rng)
                    assert.strictEqual(realD(d2), want, `random #${i} 重排 ${k}`)
                }
                let f = featuresOf(d)
                for (let x of CDE_KEYS) {
                    st.feat[x] += f[x] ? 1 : 0
                    let on = fmtResult(e.sem[`r04+${x}`])
                    if (on !== fmtResult(e.sem.run04)) {
                        st.sens[x]++
                    }
                    if (!f[x]) {
                        assert.strictEqual(on, fmtResult(e.sem.run04), `random #${i} 不含 ${x} 卻因開啟 ${x} 改變`)
                        assert.strictEqual(fmtResult(e.sem[`new-${x}`]), want, `random #${i} 不含 ${x} 卻因關閉 ${x} 改變`)
                    }
                }
                for (let t of TARGET_IDS) {
                    //c、d 只收回: 新語意關掉 e 之結果 ⊆ run04
                    if (e.sem['new-e'][t] === 'y') {
                        assert.strictEqual(e.sem.run04[t], 'y', `random #${i} ${t}: c、d 多給`)
                    }
                    if (e.real[t] === 'y') {
                        assert.strictEqual(e.sem.run04[t], 'y', `random #${i} ${t}: 多於 run04`)
                        assert.strictEqual(e.sem.legacy[t], 'y', `random #${i} ${t}: 多於 1.1.12`)
                    }
                    if (e.real[t] !== 'y' && e.sem.run04[t] === 'y') {
                        st.retract++
                    }
                }
            }
            //靈敏度: 三種情形皆大量出現, 各自單獨開啟皆有改變結果之格, 且確有被收回者
            for (let x of CDE_KEYS) {
                assert.ok(st.feat[x] > 500, `${x} 出現 ${st.feat[x]} 組`)
                assert.ok(st.sens[x] > 0, `${x} 單獨開啟改變結果 ${st.sens[x]} 組`)
            }
            assert.ok(st.retract > 0, `被收回之(組,管理對象) ${st.retract}`)
        })

        it('SP-CDE-007-順序無關(明示): 同一群組內懸空 OR、同名兩列 AND、mode 非法、一般 OR 四項之 24 種儲存順序 × 物件／陣列形式 × 同名兩列之 2 種表列順序 → 結果唯一; 群組層同形', function() {
            let items = [
                p('PD', 'OR', all, { inTable: false }),
                p('PM', 'AND', all, { dupRows: [{ rules: x23 }] }),
                p('PB', 'XOR', [['T2', 'y'], ['T3', 'y'], ['T1', 'y']]),
                p('PO', 'OR', x23),
            ]
            let res = new Set()
            let n = 0
            for (let order of permutations(items)) {
                for (let form of ['obj', 'arr']) {
                    let d = buildData({ form, groups: [g('G1', 'OR', order)] })
                    for (let pm of [d.pemis, [...d.pemis].reverse()]) {
                        res.add(realD({ ...d, pemis: pm }))
                        n++
                    }
                }
            }
            assert.strictEqual(n, 24 * 2 * 2)
            assert.deepStrictEqual([...res], [r('nyy')], '({T2,T3} ∪ 懸空) ∩ ({T1,T2,T3} ∩ {T2,T3}) ∩ {T1,T2,T3}')
            let gItems = [
                g('GD', 'OR', [], { inTable: false }),
                g('GM', 'AND', [p('PM1', 'OR', all)], { dupRows: [{ perms: [p('PM2', 'OR', x23)] }] }),
                g('GB', 'XOR', [p('PB', 'OR', all)]),
                g('GO', 'OR', [p('PO', 'OR', x23)]),
            ]
            let resG = new Set()
            for (let order of permutations(gItems)) {
                let d = buildData({ groups: order })
                for (let gm of [d.grups, [...d.grups].reverse()]) {
                    resG.add(realD({ ...d, grups: gm }))
                }
            }
            assert.deepStrictEqual([...resG], [r('nyy')], '群組層同形')
        })

        it('SP-CDE-008-逐旗標歸因: 只含懸空／只含同名多列／只含 mode 非法之資料, 新舊差異只由該旗標造成; 懸空出現在同名多列之非首列時須 c＋d 同時開啟才收回(複合原因)', function() {
            let GO = g('GO', 'OR', [p('PO', 'OR', all)])
            let cases = [
                ['c', { groups: [GO, g('GD', 'AND', [], { inTable: false })] }],
                ['d', { groups: [GO, g('GM', 'AND', [p('PM1', 'OR', x12)], { dupRows: [{ perms: [p('PM2', 'OR', x23)] }] })] }],
                ['e', { groups: [GO, g('GB', 'or', [p('PB', 'OR', x12)])] }],
            ]
            for (let [x, spec] of cases) {
                let d = buildData(spec)
                let e = evalData(d, { flags: TOG })
                let f = featuresOf(d)
                assert.deepStrictEqual(Object.keys(f).filter((k) => f[k]), [x], `${x}: 資料只含此情形`)
                assert.notStrictEqual(fmtResult(e.sem.run04), fmtResult(e.real), `${x}: 新舊確有差異`)
                for (let y of CDE_KEYS) {
                    let on = fmtResult(e.sem[`r04+${y}`])
                    if (y === x) {
                        assert.strictEqual(on, fmtResult(e.real), `${x}: 單獨開啟 ${x} 即得新語意之結果`)
                    }
                    else {
                        assert.strictEqual(on, fmtResult(e.sem.run04), `${x}: 開啟 ${y} 不影響`)
                    }
                }
                //稽核之原因與觸發之引用
                let au = auditUsers([d.user], d.grups, d.pemis, d.targets)[0]
                assert.ok(au.lostByCde.length > 0)
                au.lostByCde.forEach((t) => assert.deepStrictEqual(au.reasons[t], [[{ c: 'dangling', d: 'ambiguous', e: 'modeInvalid' }[x]]], `${x} ${t}`))
            }
            //複合: GM(AND)兩列, 第二列含懸空 AND 權限——c 單獨(仍取第一列)、d 單獨(懸空不計入, 第二列＝{T1,T2})皆不收回; 同時開才使第二列為空而交集為空
            let spec = { groups: [GO, g('GM', 'AND', [p('PM1', 'OR', x12)], { dupRows: [{ perms: [p('PM2', 'OR', x12), p('PX', 'AND', all, { inTable: false })] }] })] }
            let d = buildData(spec)
            let e = evalData(d, { flags: { ...TOG, cd: flagsWith(FLAGS.run04, ['c', 'd']) } })
            assert.strictEqual(fmtResult(e.sem.run04), r('yyn'))
            assert.strictEqual(fmtResult(e.sem['r04+c']), r('yyn'))
            assert.strictEqual(fmtResult(e.sem['r04+d']), r('yyn'))
            assert.strictEqual(fmtResult(e.sem.cd), r('nnn'))
            assert.strictEqual(fmtResult(e.real), r('nnn'))
            let au = auditUsers([d.user], d.grups, d.pemis, d.targets)[0]
            assert.deepStrictEqual(au.lostByCde, ['T1', 'T2'])
            assert.deepStrictEqual(au.reasons.T1, [['dangling', 'ambiguous']], '複合原因')
            assert.deepStrictEqual(au.issues.map((x) => [x.code, x.level, x.holder, x.name]), [['ambiguous', 'grup', null, 'GM'], ['dangling', 'pemi', 'GM', 'PX']])
        })

        it('SP-CDE-009-getUserRules 不就地改動輸入之四表(舊版會寫入 _pemis／_rules; 隨機 500 組含懸空／同名多列)', function() {
            let rng = mkRng(909)
            for (let i = 0; i < 500; i++) {
                let d = buildData(randomSpecCde(rng))
                let before = JSON.stringify(d)
                quiet(() => getUserRules(d.user, d.grups, d.pemis, d.targets))
                assert.strictEqual(JSON.stringify(d), before, `random #${i}`)
                d.grups.forEach((x) => assert.ok(!('_pemis' in x)))
                d.pemis.forEach((x) => assert.ok(!('_rules' in x)))
            }
        })

    })


    // ===========================================================
    // SP-TGT: 管理對象層
    // ===========================================================
    describe('SP-TGT 管理對象(targets)層', function() {

        it('SP-TGT-001-孤兒(crules 仍列出但已不在 targets)不輸出, 也不影響其他管理對象(3 管理對象隨機規格 2,000 組, 每條規則另加孤兒 TX)', function() {
            let rng = mkRng(2026)
            for (let i = 0; i < 2000; i++) {
                let spec = randomSpec(rng, { orphan: true })
                let d = buildData(spec)
                let out = getUserRules(d.user, d.grups, d.pemis, d.targets)
                assert.deepStrictEqual(out.rules.map((x) => x.name), TARGET_IDS, '輸出只含現存管理對象, 順序同 targets')
                let noOrphan = {
                    ...spec,
                    groups: spec.groups.map((gg) => ({ ...gg, perms: gg.perms.map((pp) => ({ ...pp, rules: pp.rules.filter(([k]) => k !== 'TX') })) })),
                }
                assert.strictEqual(fmtResult(toMap(out.rules)), fmtResult(realOf(noOrphan)), `random #${i}`)
            }
        })

        it('SP-TGT-002-未被任何規則提及的管理對象預設 n(即使唯一的 AND 項授權其他管理對象); targets 為空 → rules 為空; targets 重複 id → 輸出重複', function() {
            let spec = { groups: [g('G1', 'AND', [p('P1', 'AND', [['T1', 'y']])])] }
            assert.strictEqual(fmtResult(realOf(spec)), r('ynn'))
            let d = buildData(spec, [])
            assert.deepStrictEqual(getUserRules(d.user, d.grups, d.pemis, d.targets).rules, [])
            let d2 = buildData(spec, ['T1', 'T1'])
            assert.deepStrictEqual(getUserRules(d2.user, d2.grups, d2.pemis, d2.targets).rules, [{ name: 'T1', isActive: 'y' }, { name: 'T1', isActive: 'y' }])
        })

        it('SP-TGT-003-特殊名稱之管理對象(原型鍵名、含 . 、整數式、length)與一般名稱同樣逐鍵合併, 兩種順序結果相同', function() {
            let names = ['constructor', '__proto__', 'toString', 'A.0', '1', 'length']
            let a = p('PA', 'AND', [[names[0], 'y'], [names[1], 'y'], [names[2], 'y'], [names[4], 'y']])
            let b = p('PB', 'AND', [[names[1], 'y'], [names[3], 'y'], [names[4], 'n'], [names[5], 'y']])
            let results = []
            for (let order of [[a, b], [b, a]]) {
                let spec = { groups: [g('G1', 'OR', order)] }
                let got = quiet(() => realOf(spec, names))
                names.forEach((t) => {
                    let items = order.map((v) => ({ mode: 'AND', s: stateOf(v.rules, t) }))
                    assert.strictEqual(got[t], predictSpec(items), `${t} @ [${order.map((v) => v.name)}]`)
                })
                results.push(fmtResult(got, names))
            }
            assert.strictEqual(results[0], results[1], '順序對調結果相同')
        })

    })


    // ===========================================================
    // SP-FORM: 資料形式
    // ===========================================================
    describe('SP-FORM 資料形式(物件 vs 陣列)', function() {

        it('SP-FORM-001-名稱非整數式時, 陣列形式與物件形式在每一格結果相同(權限層 3 管理對象 2 項全部格)', function() {
            for (let a of VS3) {
                for (let b of VS3) {
                    assert.strictEqual(fmtResult(realOf(specP([a, b], { form: 'arr' }))), fmtResult(realOf(specP([a, b], { form: 'obj' }))))
                }
            }
        })

        it('SP-FORM-002-陣列形式可重複列同名規則: 所有列皆 y 才 y, 與列序無關(規則 4 衍生; 舊規則: 後者覆蓋前者, [y,n] 得 n、[n,y] 得 y)', function() {
            let ps = (order) => p('PA', 'OR', [], { crulesRaw: JSON.stringify(order.map((s) => ({ name: 'T1', isActive: s }))) })
            let run = (order) => quiet(() => ev({ groups: [g('G1', 'OR', [ps(order)])] }))
            assert.deepStrictEqual([run(['y', 'n']).real, run(['y', 'n']).legacy], [r('nnn'), r('nnn')])
            assert.deepStrictEqual([run(['n', 'y']).real, run(['n', 'y']).legacy], [r('nnn'), r('ynn')], '新規則 [n,y] 亦為 n(舊規則得 y)')
            assert.strictEqual(run(['y', 'y']).real, r('ynn'))
            assert.strictEqual(run(['n', 'n']).real, r('nnn'))
            assert.strictEqual(run(['y', 'n', 'y']).real, r('nnn'))
        })

        it('SP-FORM-004-兩種形式的「名稱來源」不同, 同一語意不保證同一結果(限「物件鍵＝陣列元素 name」時才等價): 物件形式取外層鍵(值內 name 無效); 陣列形式取元素 name, 非物件元素名稱為索引, 數字型 name 因 === 比對不上而整項不被採納', function() {
            //(a) crules: 物件形式值內的 name 不改名(外層鍵 T1 為準); 陣列形式元素 name 為準
            let one = (crulesRaw, tg = TARGET_IDS) => fmtResult(realOf({ groups: [g('G1', 'OR', [p('P1', 'OR', [], { crulesRaw })])] }, tg), tg)
            assert.strictEqual(one('{"T1":{"name":"T2","isActive":"y"}}'), r('ynn'))
            assert.strictEqual(one('[{"name":"T2","isActive":"y"}]'), r('nyn'))
            //(b) crules 陣列內非物件元素: 名稱為索引(此例第二個元素名稱為 1), 與名為 '1' 的真實管理對象撞名
            assert.strictEqual(one('[{"name":"T1","isActive":"y"},"y"]', ['T1', '1']), 'T1=y 1=y')
            //(c) cpemis 陣列內數字型 name: 與權限表字串名稱 === 比對失敗 → 懸空(run05 c: 以其 mode OR 參與、內容全 n)→ 全 n
            let d = buildData({ groups: [g('G1', 'OR', [p('1', 'OR', [['T1', 'y']])], { cpemisRaw: '[{"name":1,"mode":"OR","isActive":"y"}]' })] })
            assert.strictEqual(fmtResult(toMap(getUserRules(d.user, d.grups, d.pemis, d.targets).rules)), r('nnn'))
        })

        it('SP-FORM-005-陣列形式 cgrups 重複列同一群組(OR 與 AND): 授權不變(OR 聯集 ∩ 同一群組＝該群組), 但回傳之 grups(供 grupsNames)出現同一群組兩次', function() {
            let d = buildData({ groups: [g('G1', 'OR', [p('P1', 'OR', [['T1', 'y'], ['T2', 'y']])])] })
            d.user.cgrups = JSON.stringify([{ name: 'G1', mode: 'OR', isActive: 'y' }, { name: 'G1', mode: 'AND', isActive: 'y' }])
            let out = getUserRules(d.user, d.grups, d.pemis, d.targets)
            assert.strictEqual(fmtResult(toMap(out.rules)), r('yyn'))
            assert.deepStrictEqual(out.grups.map((x) => x.name), ['G1', 'G1'])
        })

        it('SP-FORM-003-陣列形式可重複列同一權限(兩個項目, mode 可不同), 皆參與合併; 一筆停用者被濾除; 物件形式同名鍵只剩最後一筆', function() {
            let po = p('PA', 'OR', [['T1', 'y'], ['T2', 'n']])
            let d = buildData({ groups: [g('G1', 'OR', [po])] })
            d.grups[0].cpemis = JSON.stringify([{ name: 'PA', mode: 'OR', isActive: 'y' }, { name: 'PA', mode: 'AND', isActive: 'y' }])
            let out = getUserRules(d.user, d.grups, d.pemis, d.targets)
            assert.strictEqual(out.grups[0].data._pemis.length, 2, '同一權限列兩次 → 兩個項目')
            assert.deepStrictEqual(out.grups[0].data._pemis.map((x) => x.mode), ['OR', 'AND'])
            assert.strictEqual(fmtResult(toMap(out.rules)), r('ynn'))

            let d2 = buildData({ groups: [g('G1', 'OR', [p('P', 'OR', [['T1', 'y']])])] })
            let viaArr = (items) => {
                d2.grups[0].cpemis = JSON.stringify(items)
                return fmtResult(toMap(getUserRules(d2.user, d2.grups, d2.pemis, d2.targets).rules))
            }
            assert.strictEqual(viaArr([{ name: 'P', mode: 'OR', isActive: 'y' }, { name: 'P', mode: 'OR', isActive: 'n' }]), r('ynn'), '陣列: [y, n] → 啟用者保留')
            assert.strictEqual(viaArr([{ name: 'P', mode: 'OR', isActive: 'n' }, { name: 'P', mode: 'OR', isActive: 'y' }]), r('ynn'), '陣列: [n, y] → 同')
            d2.grups[0].cpemis = '{"P":{"mode":"OR","isActive":"y"},"P":{"mode":"OR","isActive":"n"}}' //物件形式同名鍵: JSON5 解析後只剩最後一筆
            assert.strictEqual(fmtResult(toMap(getUserRules(d2.user, d2.grups, d2.pemis, d2.targets).rules)), r('nnn'), '物件: 後者覆蓋 → 停用')
        })

    })


    // ===========================================================
    // SP-REAL: 實務資料形狀
    // ===========================================================
    describe('SP-REAL 實務資料形狀(編輯器與種子資料)', function() {

        let seedOf = () => quiet(() => ({ users: ds.users.funTest(), grups: ds.grups.funTest(), pemis: ds.pemis.funTest(), targets: ds.targets.funTest() }))
        let ysOf = (kp) => Object.entries(kp).filter(([, v]) => v === 'y').map(([k]) => k).sort()

        it('SP-REAL-001-種子資料(schema funTest: 4 使用者／4 群組／4 權限／22 管理對象, 規則皆稀疏): 每位使用者皆有 OR, 新規則未收回任何授權(lost 為空), 舊規則亦順序無關', function() {
            let s = seedOf()
            let au = auditUsers(s.users, s.grups, s.pemis, s.targets)
            assert.deepStrictEqual(au.map((a) => a.name), ['peter', 'mary', 'john', 'admin'])
            au.forEach((a) => {
                assert.strictEqual(a.legacyOrderSensitive, false, `${a.name} 舊規則順序相依`)
                assert.deepStrictEqual(a.lost, [], `${a.name} 被收回`)
                assert.deepStrictEqual(a.gained, [], `${a.name} 多給`)
            })
            assert.deepStrictEqual(au.map((a) => Object.values(a.real).filter((v) => v === 'y').length), [4, 4, 2, 4])
            //種子的規則確為稀疏: 權限 P1～P4 各只列 2～4 個管理對象(共 22 個)
            s.pemis.forEach((pm) => assert.ok(Object.keys(JSON5.parse(pm.crules)).length < s.targets.length, `${pm.name} 只列部分管理對象`))
        })

        it('SP-REAL-002-用種子資料的權限 P2、P3(稀疏)組成「兩者皆 AND」的群組: 兩種 cpemis 順序皆得交集(專案A/頁C、專案B/頁A/區塊B); 舊規則 P3 在前會多出 專案B/頁A/區塊C', function() {
            let s = seedOf()
            let mk = (name, order) => ({
                id: `id-${name}`, name,
                cpemis: JSON.stringify(Object.fromEntries(order.map((n) => [n, { mode: 'AND', isActive: 'y' }]))),
            })
            let u = (gn) => ({ id: `u-${gn}`, name: `u-${gn}`, cgrups: JSON.stringify({ [gn]: { mode: 'OR', isActive: 'y' } }) })
            let a5 = auditUsers([u('M5')], [...s.grups, mk('M5', ['權限P2', '權限P3'])], s.pemis, s.targets)[0]
            let a6 = auditUsers([u('M6')], [...s.grups, mk('M6', ['權限P3', '權限P2'])], s.pemis, s.targets)[0]
            assert.deepStrictEqual(ysOf(a5.real), ['專案A/頁C', '專案B/頁A/區塊B'])
            assert.deepStrictEqual(ysOf(a6.real), ['專案A/頁C', '專案B/頁A/區塊B'])
            assert.deepStrictEqual(ysOf(a5.legacy), ['專案A/頁C', '專案B/頁A/區塊B'], '舊規則 P2 在前')
            assert.deepStrictEqual(ysOf(a6.legacy), ['專案A/頁C', '專案B/頁A/區塊B', '專案B/頁A/區塊C'], '舊規則 P3 在前')
            assert.deepStrictEqual(a5.lost, [])
            assert.deepStrictEqual(a6.lost, ['專案B/頁A/區塊C'])
            assert.strictEqual(a5.legacyOrderSensitive, true)
            assert.strictEqual(a6.legacyOrderSensitive, true)
        })

        it('SP-REAL-004-本專案規格自身的兩個「OR + 稀疏 AND」情境(流程_群組權限關聯 peter: 3 → 2 個授權標的; 流程_使用者群組關聯 mary: 4 → 3 個): 新規則各收回 1 個(AND 項未列者視為 n)', function() {
            let s = seedOf()
            //(a) 群組權限關聯: M1(P1 OR, P2 OR)加入 權限P3 且 mode=AND; peter 屬 M1。P3 未列 專案A/頁A/區塊A(P1 授予), 新規則視為 n 而收回
            let grups = JSON.parse(JSON.stringify(s.grups))
            let m1 = grups.find((x) => x.name === '權限群組M1')
            m1.cpemis = JSON.stringify({ ...JSON5.parse(m1.cpemis), '權限P3': { mode: 'AND', isActive: 'y' } })
            let a = auditUsers([s.users.find((x) => x.name === 'peter')], grups, s.pemis, s.targets)[0]
            assert.deepStrictEqual(ysOf(a.real), ['專案A/頁C', '專案B/頁A/區塊B'])
            assert.deepStrictEqual(ysOf(a.legacy), ['專案A/頁A/區塊A', '專案A/頁C', '專案B/頁A/區塊B'])
            assert.deepStrictEqual(a.lost, ['專案A/頁A/區塊A'])
            //(b) 使用者群組關聯: mary 從 {M2} 變 {M2(OR), M1(AND)}。M1 未列 專案B/頁A/區塊C(M2 的 P3 授予)
            let mary = { ...s.users.find((x) => x.name === 'mary'), cgrups: JSON.stringify({ '權限群組M2': { mode: 'OR', isActive: 'y' }, '權限群組M1': { mode: 'AND', isActive: 'y' } }) }
            let b = auditUsers([mary], s.grups, s.pemis, s.targets)[0]
            assert.deepStrictEqual(ysOf(b.real), ['專案A/頁C', '專案B/頁A/區塊A', '專案B/頁A/區塊B'])
            assert.deepStrictEqual(ysOf(b.legacy), ['專案A/頁C', '專案B/頁A/區塊A', '專案B/頁A/區塊B', '專案B/頁A/區塊C'])
            assert.deepStrictEqual(b.lost, ['專案B/頁A/區塊C'])
        })

        it('SP-REAL-005-編輯器「啟用原為停用之 AND 權限」只會收回不會多給(基底非空: 已有任一有效項時, 多一個 AND 項 → 新結果 ⊆ 原結果; 3 管理對象 1～2 個既有項 × 27 種 AND 項全部格)', function() {
            let n = 0
            let extra = VS3.filter((v) => v.mode === 'AND')
            let bases = [...VS3.map((v) => [v]), ...VS3.flatMap((a) => VS3.map((b) => [a, b]))]
            for (let base of bases) {
                let before = realOf(specP(base))
                for (let e of extra) {
                    let after = realOf(specP([...base, { ...e, id: 'EX' }]))
                    for (let t of TARGET_IDS) {
                        if (after[t] === 'y') {
                            assert.strictEqual(before[t], 'y', `${base.map((v) => v.id)} + ${e.id} @${t}`)
                        }
                        n++
                    }
                }
            }
            assert.strictEqual(n, (54 + 54 * 54) * 27 * 3, '格數: (1 項 54 + 2 項 54×54) × AND 項 27 × 管理對象 3')
        })

        it('SP-REAL-006-編輯器重存「稀疏權限」把「未列」寫成顯式 n(兩態, 不做三態): 授權不變——權限層任意稀疏 AND／OR 組合與跨層(Guard 含空權限)皆然; 窮舉 3 管理對象 2 項全部格', function() {
            //VeCrules 存檔對「開啟當下全部管理對象」寫 y／n(真瀏覽器實測: 1 個 → 22 個); 此處以 resave 模擬: 補齊未列之現存管理對象為 n
            let resave = (rules) => [...rules, ...TARGET_IDS.filter((t) => !rules.some(([k]) => k === t)).map((t) => [t, 'n'])]
            let resaveItem = (v) => ({ ...v, rules: resave(v.rules) })
            for (let a of VS3) {
                for (let b of VS3) {
                    assert.strictEqual(fmtResult(realOf(specP([resaveItem(a), resaveItem(b)]))), fmtResult(realOf(specP([a, b]))), `權限層 ${a.id}+${b.id}`)
                    assert.strictEqual(fmtResult(realOf(specG([resaveItem(a), resaveItem(b)]))), fmtResult(realOf(specG([a, b]))), `群組層 ${a.id}+${b.id}`)
                }
            }
            //同層: 基本權限(OR){T1,T2} + 限制權限(AND)只列 T1:y
            let po = p('PO', 'OR', [['T1', 'y'], ['T2', 'y']])
            expectEv({ groups: [g('G1', 'OR', [po, p('PA', 'AND', [['T1', 'y']])])] }, { real: r('ynn'), legacy: r('yyn') }, '重存前')
            expectEv({ groups: [g('G1', 'OR', [po, p('PA', 'AND', resave([['T1', 'y']]))])] }, { real: r('ynn'), legacy: r('ynn') }, '重存後(舊規則重存會撤銷 T2: 新規則下重存前後相同)')
            //跨層: 群組 Grant(OR)授予 T1; 群組 Guard(AND)含一個 crules 為空的權限 Old——新規則: Old 未給任何對象＝全 n, 重存前後皆全 n
            let grant = g('Grant', 'OR', [p('Yes', 'OR', [['T1', 'y']])])
            expectEv({ groups: [grant, g('Guard', 'AND', [p('Old', 'OR', [])])] }, { real: r('nnn'), legacy: r('ynn') }, '跨層 重存前')
            expectEv({ groups: [grant, g('Guard', 'AND', [p('Old', 'OR', resave([]))])] }, { real: r('nnn'), legacy: r('nnn') }, '跨層 重存後')
        })

        it('SP-REAL-007-「刪除勾選對象」＝ 該對象改為 n(兩態): 取消勾選(顯式 n)、從 crules 刪除該鍵(未列)、對象已從 targets 刪除(孤兒)三者授權等價(窮舉 3 管理對象 2 項全部格)', function() {
            //取消勾選＝顯式 n; 刪除鍵＝未列; 兩者在新規則下相同(規則 1)
            let uncheck = (v, t) => ({ ...v, rules: v.rules.map(([k, s]) => (k === t ? [k, 'n'] : [k, s])) })
            let drop = (v, t) => ({ ...v, rules: v.rules.filter(([k]) => k !== t) })
            for (let a of VS3) {
                for (let b of VS3) {
                    for (let t of TARGET_IDS) {
                        if (stateOf(a.rules, t) !== 'y') {
                            continue
                        }
                        assert.strictEqual(fmtResult(realOf(specP([uncheck(a, t), b]))), fmtResult(realOf(specP([drop(a, t), b]))), `${a.id}+${b.id} @${t}`)
                    }
                }
            }
            //對象已從 targets 刪除(孤兒): 其餘對象結果不變(SP-TGT-001 之窮舉另證), 此處 spot check
            let spec = specP([{ id: 'A', mode: 'AND', rules: [['T1', 'y'], ['T2', 'y']] }, { id: 'B', mode: 'AND', rules: [['T2', 'y'], ['T3', 'y']] }])
            assert.strictEqual(fmtResult(realOf(spec, ['T1', 'T2']), ['T1', 'T2']), 'T1=n T2=y')
        })

        it('SP-REAL-003-編輯器寫出之稠密 crules 在「後增管理對象」後變稀疏: 舊權限(儲存於 T3 新增之前)未列 T3, 新權限列 T3:y, 兩者 AND——新規則 T3 為 n(未列＝n), 與順序無關; 舊規則 [新,舊] 順序會得 T3=y', function() {
            const old = p('P1-old', 'AND', [['T1', 'y'], ['T2', 'y']]) //儲存於 T3 新增之前
            const neu = p('P2-new', 'AND', [['T1', 'y'], ['T2', 'y'], ['T3', 'y']]) //儲存於 T3 新增之後
            expectEv({ groups: [g('G1', 'OR', [old, neu])] }, { real: r('yyn'), legacy: r('yyn') }, '[舊,新]')
            expectEv({ groups: [g('G1', 'OR', [neu, old])] }, { real: r('yyn'), legacy: r('yyy') }, '[新,舊]')
            const oldResaved = p('P1-old', 'AND', [['T1', 'y'], ['T2', 'y'], ['T3', 'n']]) //重存後 T3 顯式 n
            expectEv({ groups: [g('G1', 'OR', [oldResaved, neu])] }, { real: r('yyn'), legacy: r('yyn') }, '[舊重存,新]')
            expectEv({ groups: [g('G1', 'OR', [neu, oldResaved])] }, { real: r('yyn'), legacy: r('yyn') }, '[新,舊重存]')
        })

        it('SP-REAL-008-編輯器(cvKpToObj)解碼之物件形式再經 getUserRules 授權, 與直接以陣列形式授權相同(新規則下解碼不再需要保序; 窮舉 3 管理對象 2 項全部格 × 兩種順序)', function() {
            for (let a of VS3) {
                for (let b of VS3) {
                    for (let [x, y] of [[a, b], [b, a]]) {
                        let viaArr = fmtResult(realOf(specP([x, y], { form: 'arr' })))
                        //把 cpemis 陣列形式經 cvKpToObj 轉物件形式後再授權
                        let d = buildData(specP([x, y], { form: 'arr' }))
                        d.grups[0].cpemis = JSON.stringify(cvKpToObj(JSON5.parse(d.grups[0].cpemis), { hasMode: true }))
                        let viaObj = fmtResult(toMap(getUserRules(d.user, d.grups, d.pemis, d.targets).rules))
                        assert.strictEqual(viaObj, viaArr, `${x.id}+${y.id}`)
                    }
                }
            }
        })

    })


    // ===========================================================
    // SP-AUDIT: 稽核工具(部署前盤點新規則的影響)
    // ===========================================================
    describe('SP-AUDIT 稽核現有資料', function() {

        it('SP-AUDIT-001-auditUsers: 同時回報新規則授權(real)、舊規則授權(legacy)、被收回(lost)、多給(gained, 恆空)與舊規則是否順序相依; 超過窮舉上限則 legacyOrderSensitive 為 null', function() {
            let spec = { groups: [g('G1', 'OR', [p('PA', 'AND', [['T2', 'y'], ['T3', 'y']]), p('PB', 'AND', [['T1', 'y'], ['T2', 'y']])])] }
            let d = buildData(spec)
            let au = auditUsers([d.user], d.grups, d.pemis, d.targets)[0]
            assert.strictEqual(fmtResult(au.real), r('nyn'))
            assert.strictEqual(fmtResult(au.legacy), r('nyy'), '舊規則依儲存順序 [PA,PB]')
            assert.deepStrictEqual(au.lost, ['T3'])
            assert.deepStrictEqual(au.gained, [])
            assert.strictEqual(au.legacyOrderSensitive, true)
            assert.strictEqual(au.orders, 2)
            let au2 = auditUsers([d.user], d.grups, d.pemis, d.targets, { maxOrders: 1 })[0]
            assert.strictEqual(au2.legacyOrderSensitive, null)
        })

        it('SP-AUDIT-003-稽核不因單一資料而中斷(外審 sol R1): 規則名為屬性鍵轉型必拋者(如 { toString: null })被略過(同伺服端 mergeRules); 單一使用者評估拋例外時該列回 error 而其他使用者照常', function() {
            let mkU = (id) => ({ id, name: id, cgrups: JSON.stringify({ G: { mode: 'OR', isActive: 'y' } }) })
            let grups = [{ id: 'g', name: 'G', cpemis: JSON.stringify({ P: { mode: 'OR', isActive: 'y' } }) }]
            let pemis = [{ id: 'p', name: 'P', crules: '[{"name":{"toString":null},"isActive":"y"},{"name":"T1","isActive":"y"}]' }]
            let targets = [{ id: 'T1' }]
            let au = auditUsers([mkU('u1')], grups, pemis, targets)[0]
            assert.strictEqual(au.error, undefined)
            assert.deepStrictEqual({ ...au.real }, { T1: 'y' })
            assert.deepStrictEqual({ ...au.legacy }, { T1: 'y' })
            //單一使用者拋例外
            let bad = { id: 'bad', name: 'bad' }
            Object.defineProperty(bad, 'cgrups', { get() { throw new Error('boom') } })
            let rs = quiet(() => auditUsers([bad, mkU('u2')], grups, pemis, targets))
            assert.strictEqual(rs[0].id, 'bad')
            assert.match(rs[0].error, /boom/)
            //error 列不得被報告計入「未窮舉」(legacyOrderSensitive 為 null 才計; 增量外審 mmd-N4)
            assert.strictEqual(rs[0].legacyOrderSensitive, undefined)
            assert.strictEqual(rs.filter((r) => r.legacyOrderSensitive === null).length, 0)
            assert.strictEqual(rs[1].error, undefined)
            assert.deepStrictEqual({ ...rs[1].real }, { T1: 'y' })
        })

        it('SP-AUDIT-004-findEmptyNames 列出名稱為空字串或非字串之群組／權限(外審 sol R2: 重存即移除其授權/限制); 稽核指令印出該段', function() {
            assert.deepStrictEqual(findEmptyNames([{ id: 'g1', name: 'A' }, { id: 'g2', name: '' }, { id: 'g3', name: 5 }], [{ id: 'p1', name: null }, { id: 'p2', name: 'P' }]), { grups: ['g2', 'g3'], pemis: ['p1'] })
            //匯出檔之 null 列(壞資料)略過, 不使整份稽核中斷(增量外審 mmd-N6)
            assert.deepStrictEqual(findEmptyNames([null, { id: 'g2', name: '' }], [undefined, { id: 'p2', name: 'P' }]), { grups: ['g2'], pemis: [] })
            let dir = fileURLToPath(new URL('./_tmp/authMerge-audit4/', import.meta.url))
            fs.mkdirSync(dir, { recursive: true })
            try {
                let fp = path.join(dir, 'export.json')
                fs.writeFileSync(fp, JSON.stringify({ users: [], grups: [{ id: 'g2', name: '', cpemis: '{}' }], pemis: [], targets: [] }))
                let tool = fileURLToPath(new URL('./tools/authMergeReport.mjs', import.meta.url))
                let out = execFileSync(process.execPath, [tool, '--audit', fp], { encoding: 'utf8' })
                assert.match(out, /名稱為空字串或非字串之群組 1 筆、權限 0 筆/)
                //兩表 id 分別列出, 不混列(增量外審 mmd-N7)
                assert.match(out, /群組 id \["g2"\]、權限 id \[\]/)
            }
            finally {
                fs.rmSync(dir, { recursive: true, force: true })
            }
        })

        it('SP-AUDIT-002-稽核指令 node test/tools/authMergeReport.mjs --audit <匯出檔.json>(README Upgrade Notes 所載): 匯出檔 { users, grups, pemis, targets } → 逐使用者列出被收回之管理對象, 摘要含人數', function() {
            let dir = fileURLToPath(new URL('./_tmp/authMerge-audit/', import.meta.url))
            fs.mkdirSync(dir, { recursive: true })
            try {
                //使用者 u1: 群組 G1(OR)含 PA、PB(皆 AND, 稀疏)→ 舊規則依順序, 新規則收回; 使用者 u2: 單一 OR 權限 → 不受影響
                let a = buildData({ groups: [g('G1', 'OR', [p('PA', 'AND', [['T2', 'y'], ['T3', 'y']]), p('PB', 'AND', [['T1', 'y'], ['T2', 'y']])])] })
                let u2 = { id: 'u2', name: 'user2', cgrups: JSON.stringify({ G2: { mode: 'OR', isActive: 'y' } }) }
                let g2 = { id: 'id-G2', name: 'G2', cpemis: JSON.stringify({ PC: { mode: 'OR', isActive: 'y' } }) }
                let pc = { id: 'id-PC', name: 'PC', crules: JSON.stringify({ T1: 'y' }) }
                let fp = path.join(dir, 'export.json')
                fs.writeFileSync(fp, JSON.stringify({ users: [{ ...a.user, id: 'u1', name: 'user1' }, u2], grups: [...a.grups, g2], pemis: [...a.pemis, pc], targets: a.targets }))
                let tool = fileURLToPath(new URL('./tools/authMergeReport.mjs', import.meta.url))
                let out = execFileSync(process.execPath, [tool, '--audit', fp], { encoding: 'utf8' })
                assert.match(out, /使用者 2 人; 新規則收回授權\(舊規則為 y、新規則為 n\) 1 人\(共 1 個管理對象\)/)
                assert.match(out, /新規則多給授權\(舊規則為 n、新規則為 y; 依規則推導應為 0\) 0 人\n/)
                assert.match(out, /- user1 \[u1\] 新規則授權=\{T2\} 被收回=\["T3"\]/)
                assert.ok(!out.includes('user2'), '不受影響之使用者不列出')
            }
            finally {
                fs.rmSync(dir, { recursive: true, force: true })
            }
        })

        it('SP-AUDIT-005-run05: 稽核指令另列相對 run04 因 c／d／e 額外收回之管理對象(lostByCde)、其原因(懸空／同名多列／mode 非法, 可複合)與觸發之引用(使用者名稱、群組／權限名稱; 不列 email); --json 輸出同內容; 多給(gained)維持為空', function() {
            let dir = fileURLToPath(new URL('./_tmp/authMerge-audit5/', import.meta.url))
            fs.mkdirSync(dir, { recursive: true })
            try {
                let tg = TARGET_IDS.map((id) => ({ id }))
                let grups = [
                    { id: 'g-o', name: 'GO', cpemis: JSON.stringify({ PO: { mode: 'OR', isActive: 'y' } }) },
                    { id: 'g-m1', name: 'GM', cpemis: JSON.stringify({ PM1: { mode: 'OR', isActive: 'y' } }) },
                    { id: 'g-m2', name: 'GM', cpemis: JSON.stringify({ PM2: { mode: 'OR', isActive: 'y' } }) },
                    { id: 'g-b', name: 'GB', cpemis: JSON.stringify({ PB: { mode: 'OR', isActive: 'y' } }) },
                ]
                let pemis = [
                    { id: 'p-o', name: 'PO', crules: JSON.stringify({ T1: 'y', T2: 'y', T3: 'y' }) },
                    { id: 'p-m1', name: 'PM1', crules: JSON.stringify({ T1: 'y', T2: 'y' }) },
                    { id: 'p-m2', name: 'PM2', crules: JSON.stringify({ T2: 'y', T3: 'y' }) },
                    { id: 'p-b', name: 'PB', crules: JSON.stringify({ T1: 'y' }) },
                ]
                let mk = (id, refs) => ({ id, name: `name-${id}`, email: `${id}@secret.example`, cgrups: JSON.stringify(refs) })
                let OR = { mode: 'OR', isActive: 'y' }
                let AND = { mode: 'AND', isActive: 'y' }
                let users = [
                    mk('uc', { GO: OR, GDEL: AND }), //c: AND 引用之群組已刪 → 全部收回
                    mk('ud', { GO: OR, GM: AND }), //d: 同名兩列交集 {T2}(run04 取第一列 {T1,T2})→ 收回 T1
                    mk('ue', { GO: OR, GB: { isActive: 'y' } }), //e: GB 缺 mode → 限制項 {T1} → 收回 T2、T3
                    mk('ues', { GB: { mode: 'or', isActive: 'y' } }), //e 唯一項: 該層無合法 mode 之項 → 全 n(run04 不計入亦全 n; 不多給)
                    mk('uok', { GO: OR }), //不受影響
                ]
                let fp = path.join(dir, 'export.json')
                fs.writeFileSync(fp, JSON.stringify({ users, grups, pemis, targets: tg }))
                let tool = fileURLToPath(new URL('./tools/authMergeReport.mjs', import.meta.url))
                let out = execFileSync(process.execPath, [tool, '--audit', fp], { encoding: 'utf8' })
                assert.match(out, /相對 run04\(未發布, 僅開發內\)因懸空／同名多列／mode 非法\(R-PRINCIPLE-00 c／d／e\)額外收回 3 人\(共 6 個管理對象; 原因: 懸空 3、同名多列 1、mode 非法 2\)/)
                assert.match(out, /- name-uc \[uc\] 新規則授權=\{\} .*相對run04收回=T1\(懸空\), T2\(懸空\), T3\(懸空\) 觸發=群組「GDEL」懸空/)
                assert.match(out, /- name-ud \[ud\] 新規則授權=\{T2\} .*相對run04收回=T1\(同名多列\) 觸發=群組「GM」同名多列\(2 筆\)/)
                assert.match(out, /- name-ue \[ue\] 新規則授權=\{T1\} .*相對run04收回=T2\(mode 非法\), T3\(mode 非法\) 觸發=群組「GB」mode 非法/)
                assert.match(out, /新規則多給授權\(舊規則為 n、新規則為 y; 依規則推導應為 0\) 0 人\n/)
                assert.ok(!out.includes('name-uok') && !out.includes('name-ues'), '不受影響之使用者不列出(含 e 唯一項之 ues: 新舊皆全 n)')
                assert.ok(!/多給 \d+ 人/.test(out), '相對 run04 多給恆為 0, 不印多給段')
                assert.ok(!out.includes('@secret.example'), '不印 email')
                //--json
                let js = JSON.parse(execFileSync(process.execPath, [tool, '--audit', fp, '--json'], { encoding: 'utf8' }))
                assert.deepStrictEqual({ cdeUsers: js.summary.cdeUsers, cdeTargets: js.summary.cdeTargets, gainedUsers: js.summary.gainedUsers, cdeGainUsers: js.summary.cdeGainUsers, modelMismatch: js.summary.modelMismatch }, { cdeUsers: 3, cdeTargets: 6, gainedUsers: 0, cdeGainUsers: 0, modelMismatch: 0 })
                assert.deepStrictEqual(js.users.map((u) => u.id), ['uc', 'ud', 'ue', 'ues'], 'JSON 另列有觸發引用者(ues: mode 非法)')
                let ues = js.users.find((u) => u.id === 'ues')
                assert.deepStrictEqual([ues.lost, ues.gained, ues.lostByCde, ues.gainedByCde], [[], [], [], []])
                assert.deepStrictEqual(ues.issues.map((x) => x.code), ['modeInvalid'])
                let ud = js.users.find((u) => u.id === 'ud')
                assert.deepStrictEqual(ud.lostByCde, ['T1'])
                assert.deepStrictEqual(ud.reasons, { T1: [['ambiguous']] })
                assert.deepStrictEqual(ud.issues, [{ code: 'ambiguous', level: 'grup', holder: null, name: 'GM', n: 2 }])
                assert.deepStrictEqual(js.users.find((u) => u.id === 'uc').lost, ['T1', 'T2', 'T3'], '相對 1.1.12 亦收回')
                assert.ok(!JSON.stringify(js).includes('@secret.example'), 'JSON 亦不含 email')
            }
            finally {
                fs.rmSync(dir, { recursive: true, force: true })
            }
        })

    })


    // ===========================================================
    // SITE-AM: 站點不變式(規則帳本 R-AUTH-MERGE-01 之判準可執行化; 讀原始碼之可執行碼行〔略過註解〕字串比對)
    // ===========================================================
    describe('SITE-AM 站點不變式(授權合併之單一擁有者與判準)', function() {

        let root = fileURLToPath(new URL('../', import.meta.url))
        let codeOf = (rel) => sourceLines(path.join(root, rel), 'code').map((l) => l.text).join('\n')
        let srcFiles = () => {
            let out = []
            let walk = (dir) => {
                for (let ent of fs.readdirSync(dir, { withFileTypes: true })) {
                    let fp = path.join(dir, ent.name)
                    if (ent.isDirectory()) {
                        walk(fp)
                    }
                    else if (/\.(mjs|vue|js)$/.test(ent.name)) {
                        out.push(fp)
                    }
                }
            }
            walk(path.join(root, 'src'))
            return out
        }

        it('SITE-AM-001-getUserRules(src/plugins/mShare.mjs)不再以 arrFinder 取表中第一筆(d)、不再略過 mode 非 OR／AND 之項(e): 兩層找列皆經 findRefRows, 有效 mode 經 getEffMode', function() {
            let code = codeOf('src/plugins/mShare.mjs')
            let i0 = code.indexOf('function getUserRules(')
            assert.ok(i0 >= 0, '找到 getUserRules')
            let body = code.slice(i0, code.indexOf('\nexport {', i0))
            assert.ok(!/\barrFinder\b/.test(body), 'getUserRules 不得再含 arrFinder(R-PRINCIPLE-00 d)')
            assert.ok(!/mode\s*!==\s*'OR'\s*&&\s*mode\s*!==\s*'AND'/.test(body), 'getUserRules 不得再以「mode !== OR && mode !== AND」略過項目(R-PRINCIPLE-00 e)')
            assert.strictEqual((body.match(/\bfindRefRows\(grups, /g) || []).length, 1, '群組層找列經 findRefRows')
            assert.strictEqual((body.match(/\bfindRefRows\(pemis, /g) || []).length, 1, '權限層找列經 findRefRows')
            assert.strictEqual((body.match(/\bgetEffMode\(/g) || []).length, 1, 'mergeRules 之 mode 經 getEffMode')
        })

        it('SITE-AM-002-findRefRows／getEffMode 單一擁有者: findRefRows 由 mShare.mjs、getAuthWarn.mjs 引用; getEffMode 由 mShare.mjs、getAuthWarn.mjs、cvKpToObj.mjs、getKpLossy.mjs 引用; src 內不得另寫「列無 name 視為 ""」之找列', function() {
            let imp = (name) => new RegExp(`^import ${name} from '\\.\\.?/(js/)?${name}\\.mjs'`, 'm')
            for (let rel of ['src/plugins/mShare.mjs', 'src/js/getAuthWarn.mjs']) {
                assert.ok(imp('findRefRows').test(codeOf(rel)), `${rel} 須 import findRefRows`)
            }
            for (let rel of ['src/plugins/mShare.mjs', 'src/js/getAuthWarn.mjs', 'src/js/cvKpToObj.mjs', 'src/js/getKpLossy.mjs']) {
                assert.ok(imp('getEffMode').test(codeOf(rel)), `${rel} 須 import getEffMode`)
            }
            //同義找列(名稱 undefined 視為 '' 再 === 比對)只在 findRefRows.mjs
            let hits = srcFiles().filter((fp) => /\.name === undefined\)\s*\?\s*''/.test(sourceLines(fp, 'code').map((l) => l.text).join('\n'))).map((fp) => path.relative(root, fp).split(path.sep).join('/'))
            assert.deepStrictEqual(hits, ['src/js/findRefRows.mjs'])
        })

        it('SITE-AM-003-src 內 mode 比對(=== ／ !== \'OR\'／\'AND\'、filter(…, { mode: … }))逐站判讀: 有效值只經 getEffMode, 其餘為合法性判定或已取有效值後之比對(允許清單; 新增站點即紅)', function() {
            let re = /(===|!==)\s*'(OR|AND)'|'(OR|AND)'\s*(===|!==)|\{\s*mode:\s*'(OR|AND)'\s*\}/
            let found = {}
            for (let fp of srcFiles()) {
                let n = sourceLines(fp, 'code').filter((l) => re.test(l.text)).length
                if (n > 0) {
                    found[path.relative(root, fp).split(path.sep).join('/')] = n
                }
            }
            assert.deepStrictEqual(found, {
                'src/js/getEffMode.mjs': 1, //定義: m === 'OR' ? 'OR' : 'AND'
                'src/js/isAuthMode.mjs': 1, //合法性判定(頁面提示之 modeInvalid、編輯器停用列之顯示), 非有效值
                'src/js/cvKpToObj.mjs': 1, //acts 之 mode 已為 getEffMode 之有效值, 於 AND／OR 並存時挑 AND 支作顯示值
                'src/js/getAuthWarn.mjs': 1, //getEffMode(r.mode) === 'AND'(刪除前提示影響人數)
                'src/js/refAudit.mjs': 1, //modeInfo: getEffMode(m) === 'OR'(已取有效值後之比對; 懸空稽核對授權影響之結構判定, 對照 mergeRules; run06 audit 新增站點, 逐站判讀後列入)
                'src/js/getAddImpact.mjs': 1, //getEffMode(mode) === 'AND'(新增撞懸空名確認之 nAnd: 已取有效值後之比對, 與 getAuthWarn.countAndRefs 同口徑; run07 UI1 新增站點, 逐站判讀後列入)
                'src/plugins/mShare.mjs': 2, //mergeRules 之 filter(ts, { mode: 'OR'／'AND' }): ts 之 mode 已為 getEffMode 之有效值
                'src/components/VeGrupBlngUsers.vue': 1, //對話框列之 UI 值守門(列之 mode 恆由選單指定, 非解碼之引用)
                'src/components/VePemiBlngGrups.vue': 1, //同上
            })
        })

    })

})
