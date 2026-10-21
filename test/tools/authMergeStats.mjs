//授權合併之窮舉與統計(供 unit-authMerge 與 authMergeReport.mjs 共用)
//
//scanCells 對一串「格」(儲存狀態之完整規格)逐格以真函數 getUserRules 求值(新語意 R-AUTH-MERGE-00＋R-PRINCIPLE-00 c／d／e), 同時求完整模型 evalFull 之
//新語意(spec)、run04、1.1.12(legacy)之結果, 並依 combo(同一組項目之所有儲存順序)彙整:
//  - 保真: 真函數必須等於模型之新語意(每格; fidelity)
//  - 只收回: 新語意為 y 者 1.1.12 必為 y(retract)、run04 必為 y(retract04); c／d／e 格另檢查「不含 e 之收嚴」(c、d 兩旗標)只會收回(retractNoE)
//  - 順序無關: 同一 combo 內真函數結果必須全相同(dependent 恆為 0); 1.1.12、run04 之順序相依 combo 數只作為差異盤點
//  - 逐旗標歸因(c／d／e 格): 格內不含某情形(懸空／同名多列／mode 非法)時, 單獨開關該旗標不得改變結果(idle); 各旗標造成差異之格數(sens)
//  - 與 1.1.12、run04 相異之格數／combo 數, 及最小例子(以 cx 最小者)

import { buildData, evalData, fmtResult, fmtSpec, itemVariants, cdeVariants, product, specP, specG, specPG, isDenseRuleset, rulesetsAll, FLAGS, CDE_KEYS, flagsWith, flagsWithout, TARGET_IDS } from './authMerge.mjs'


//單獨開關旗標: 自 run04 開一個(r04+c…)、自新語意關一個(new-c…)
const TOGGLES = Object.fromEntries(CDE_KEYS.flatMap((x) => [[`r04+${x}`, flagsWith(FLAGS.run04, [x])], [`new-${x}`, flagsWithout(FLAGS.spec, [x])]]))
const NO_E = flagsWithout(FLAGS.spec, ['e'])


/**
 * 逐格求值並彙整
 *
 * @param {Iterable} cells 輸入格, 每格 { spec, row, keys, cx, feat? }: row 為彙整列鍵(字串), keys 為 { 名稱: combo 鍵字串 }, cx 為複雜度(最小例子用),
 *   feat 為 { c, d, e }(格內是否含懸空／同名多列／mode 非法; 有給時做逐旗標歸因檢查)
 * @param {Array} targetIds 現存管理對象 id 陣列
 * @returns {Object} 回傳 { rows: { 列鍵: { cells, gain04, gainL, diff, diff04, sens, <名稱>: { combos, dependent, legacyDependent, run04Dependent } } }, checks }
 */
export function scanCells(cells, targetIds = TARGET_IDS) {
    let rows = {}
    let combos = new Map() // `${row}#${name}#${comboKey}` → { row, name, real: Set, legacy: Set, run04: Set, diff, diff04 }
    let checks = { cells: 0, fidelity: 0, retract: 0, retract04: 0, retractNoE: 0, idle: 0 }
    for (let c of cells) {
        let cde = c.feat !== undefined
        let e = evalData(buildData(c.spec, targetIds), cde ? { flags: { ...TOGGLES, noE: NO_E } } : {})
        checks.cells++
        let r0 = fmtResult(e.real, targetIds)
        let rl = fmtResult(e.sem.legacy, targetIds)
        let r4 = fmtResult(e.sem.run04, targetIds)
        if (r0 !== fmtResult(e.sem.spec, targetIds)) {
            checks.fidelity++
        }
        //只收回: 逐標的 新 ≤ 舊(以 n < y 比較)
        let gainL = 0
        let gain04 = 0
        for (let t of targetIds) {
            if (e.real[t] === 'y' && e.sem.legacy[t] !== 'y') {
                gainL++
            }
            if (e.real[t] === 'y' && e.sem.run04[t] !== 'y') {
                gain04++
            }
            if (cde && e.sem.noE[t] === 'y' && e.sem.run04[t] !== 'y') {
                checks.retractNoE++
            }
        }
        checks.retract += gainL
        checks.retract04 += gain04
        let row = rows[c.row]
        if (!row) {
            row = rows[c.row] = { cells: 0, gain04: 0, gainL: 0, diff: { cells: 0, combos: 0, min: null }, diff04: { cells: 0, combos: 0, min: null }, sens: { c: 0, d: 0, e: 0 } }
        }
        row.cells++
        row.gain04 += gain04 > 0 ? 1 : 0
        row.gainL += gainL > 0 ? 1 : 0
        let mark = (dd, other) => {
            dd.cells++
            if (dd.min === null || c.cx < dd.min.cx) {
                dd.min = { cx: c.cx, spec: fmtSpec(c.spec), other, real: r0 }
            }
        }
        let diff = r0 !== rl
        let diff04 = r0 !== r4
        if (diff) {
            mark(row.diff, rl)
        }
        if (diff04) {
            mark(row.diff04, r4)
        }
        if (cde) {
            for (let x of CDE_KEYS) {
                let on = fmtResult(e.sem[`r04+${x}`], targetIds)
                let off = fmtResult(e.sem[`new-${x}`], targetIds)
                if (on !== r4) {
                    row.sens[x]++
                }
                //逐旗標歸因: 格內不含該情形時, 開(自 run04)或關(自新語意)該旗標皆不得改變結果
                if (!c.feat[x] && (on !== r4 || off !== r0)) {
                    checks.idle++
                }
            }
        }
        for (let [name, ck] of Object.entries(c.keys)) {
            let key = `${c.row}#${name}#${ck}`
            let cb = combos.get(key)
            if (!cb) {
                cb = { row: c.row, name, real: new Set(), legacy: new Set(), run04: new Set(), diff: false, diff04: false }
                combos.set(key, cb)
            }
            cb.real.add(r0)
            cb.legacy.add(rl)
            cb.run04.add(r4)
            cb.diff = cb.diff || diff
            cb.diff04 = cb.diff04 || diff04
        }
    }
    for (let cb of combos.values()) {
        let row = rows[cb.row]
        let g = row[cb.name] || (row[cb.name] = { combos: 0, dependent: 0, legacyDependent: 0, run04Dependent: 0 })
        g.combos++
        if (cb.real.size > 1) {
            g.dependent++
        }
        if (cb.legacy.size > 1) {
            g.legacyDependent++
        }
        if (cb.run04.size > 1) {
            g.run04Dependent++
        }
        if (cb.name === 'any' && cb.diff) {
            row.diff.combos++
        }
        if (cb.name === 'any' && cb.diff04) {
            row.diff04.combos++
        }
    }
    return { rows, checks }
}


/**
 * 把 scanCells 之 rows 簡化為可比對之純資料(不含最小例子):
 * { 列鍵: { cells, dep: { 名稱: [新語意相依 combo 數, 1.1.12 相依 combo 數, combo 數, run04 相依 combo 數] }, diff: [與 1.1.12 相異格數, combo 數], diff04: [與 run04 相異格數, combo 數],
 *   gain: [新語意多於 run04 之格數, 多於 1.1.12 之格數], sens: [c, d, e 各自開啟(自 run04)即改變結果之格數] } }
 *
 * @param {Object} rows 輸入 scanCells 回傳之 rows
 * @returns {Object} 回傳簡化後的物件(列鍵依字母序)
 */
export function summarize(rows) {
    let o = {}
    Object.keys(rows).sort().forEach((k) => {
        let row = rows[k]
        let dep = {}
        Object.keys(row).filter((x) => !['cells', 'diff', 'diff04', 'gain04', 'gainL', 'sens'].includes(x)).forEach((x) => {
            dep[x] = [row[x].dependent, row[x].legacyDependent, row[x].combos, row[x].run04Dependent]
        })
        o[k] = { cells: row.cells, dep, diff: [row.diff.cells, row.diff.combos], diff04: [row.diff04.cells, row.diff04.combos], gain: [row.gain04, row.gainL], sens: [row.sens.c, row.sens.d, row.sens.e] }
    })
    return o
}


// ---------------------------------------------------------------
// 格之產生器
// ---------------------------------------------------------------

const rowKey = (dense, hasOr) => `${dense ? 'dense' : 'sparse'}|${hasOr ? 'OR' : 'noOR'}`

/** 權限層: 使用者一個群組(OR)內 k 個權限, 所有儲存順序 */
export function* genP(k, vs, form = 'obj', targetIds = TARGET_IDS) {
    for (let seq of product(vs, k)) {
        let dense = seq.every((v) => isDenseRuleset(v.rules, targetIds))
        let hasOr = seq.some((v) => v.mode === 'OR')
        yield {
            spec: specP(seq, { form }),
            row: rowKey(dense, hasOr),
            keys: { any: seq.map((v) => v.id).sort().join('+') },
            cx: seq.reduce((a, v) => a + v.rules.length + 1, 0),
        }
    }
}

/** 群組層: 使用者 k 個群組, 每群組一個權限, 所有儲存順序 */
export function* genG(k, vs, form = 'obj', targetIds = TARGET_IDS) {
    for (let seq of product(vs, k)) {
        let dense = seq.every((v) => isDenseRuleset(v.rules, targetIds))
        let hasOr = seq.some((v) => v.mode === 'OR')
        yield {
            spec: specG(seq, { form }),
            row: rowKey(dense, hasOr),
            keys: { any: seq.map((v) => v.id).sort().join('+') },
            cx: seq.reduce((a, v) => a + v.rules.length + 1, 0),
        }
    }
}

/**
 * 兩層: gCount 個群組, 每個群組之權限數取自 pSizes(0 表示沒有權限之群組)
 * 群組模式取 gModes, 權限變體取 vs; 列鍵: 形狀 | 群組層有無 OR / 權限層是否每個群組皆有 OR
 * 每個位置之群組皆可取任一變體, 故群組之所有排列與各群組內權限之所有排列都在枚舉內
 */
export function* genPG(gCount, pSizes, gModes, vs, form = 'obj', targetIds = TARGET_IDS) {
    //群組變體: 模式 × 權限序列
    let gvs = []
    for (let mode of gModes) {
        for (let n of pSizes) {
            for (let pseq of product(vs, n)) {
                gvs.push({ mode, pseq })
            }
        }
    }
    for (let graw of product(gvs, gCount)) {
        //群組代號以內容導出(含權限之排序後內容, 使名稱與位置無關); 同內容群組加尾碼由 specPG 處理
        let gseq = graw.map((g) => ({ id: `${g.mode}${g.pseq.map((v) => v.id).sort().join('')}`, mode: g.mode, pseq: g.pseq }))
        let perms = gseq.flatMap((g) => g.pseq)
        let dense = perms.every((v) => isDenseRuleset(v.rules, targetIds)) && gseq.every((g) => g.pseq.length > 0)
        let gOr = gseq.some((g) => g.mode === 'OR')
        let pAllOr = gseq.every((g) => g.pseq.some((v) => v.mode === 'OR'))
        let gKey = (g) => `${g.mode}:${g.pseq.map((v) => v.id).sort().join('+')}`
        let gKeyOrdered = (g) => `${g.mode}:${g.pseq.map((v) => v.id).join('>')}`
        yield {
            spec: specPG(gseq, { form }),
            row: `${dense ? 'dense' : 'sparse'}|${gOr ? 'gOR' : 'gNoOR'}/${pAllOr ? 'pAllOR' : 'pSomeNoOR'}`,
            keys: {
                any: gseq.map(gKey).sort().join(' ; '),
                permOnly: gseq.map(gKey).join(' ; '), //群組順序固定, 只變權限順序
                groupOnly: gseq.map(gKeyOrdered).sort().join(' ; '), //各群組內權限順序固定, 只變群組順序
            },
            cx: perms.reduce((a, v) => a + v.rules.length + 1, 0) + gseq.length,
        }
    }
}

/**
 * c／d／e 窮舉(R-PRINCIPLE-00 c／d／e): layer 'P'(權限層: 一個群組內 k 個權限)或 'G'(群組層: k 個群組, 每群組一個權限),
 * 變體取自 cdeVariants(含懸空、同名多列〔候選之表列順序為變體之一部分〕、mode 缺／非法), 所有儲存順序
 * 列鍵: c／d／e 情形(格內含懸空 c、同名多列 d、mode 非法 e; 無者為 -)| 該層有無 OR 模式之項; combo 鍵與項目順序、候選表列順序皆無關
 */
export function* genCde(layer, k, vs, targetIds = TARGET_IDS) {
    let ok = (m) => m === 'OR' || m === 'AND'
    for (let seq of product(vs, k)) {
        let feat = { c: seq.some((v) => v.kind === 'dangling'), d: seq.some((v) => v.kind === 'multi'), e: seq.some((v) => !ok(v.mode)) }
        let hasOr = seq.some((v) => v.mode === 'OR')
        yield {
            spec: (layer === 'G') ? specG(seq) : specP(seq),
            row: `${feat.c ? 'c' : '-'}${feat.d ? 'd' : '-'}${feat.e ? 'e' : '-'}|${hasOr ? 'OR' : 'noOR'}`,
            keys: { any: seq.map((v) => v.ck).sort().join('+') },
            cx: seq.reduce((a, v) => a + (v.cands ? v.cands.reduce((b, r) => b + r.length + 1, 0) : v.rules.length + 1), 0),
            feat,
        }
    }
}

/** 單一管理對象之項目變體(狀態 未列／y／n × 模式), 供較深結構之窮舉 */
export function oneTargetVariants(modes = ['OR', 'AND']) {
    return itemVariants(modes, rulesetsAll(['T1']))
}

//兩層 3 管理對象窮舉用之規則集家族 F5: 2 個稠密(全 y;y n y)與 3 個稀疏(T1 T2;T2 T3;T1)
export const RULESETS_F5 = [
    [['T1', 'y'], ['T2', 'y'], ['T3', 'y']],
    [['T1', 'y'], ['T2', 'n'], ['T3', 'y']],
    [['T1', 'y'], ['T2', 'y']],
    [['T2', 'y'], ['T3', 'y']],
    [['T1', 'y']],
]

//c／d／e 窮舉用之規則集家族 F6 = F5 ＋ 空規則集(未給任何管理對象; 同名多列之「候選內容為空」用)
export const RULESETS_F6 = [...RULESETS_F5, []]

/** c／d／e 窮舉之變體(2 項用): 模式 OR／AND／缺／'or' × 內容〔F6 規則集 6、懸空 1、同名 2 列(F6 有序對 30)、同名 3 列(4 組 × 正反 2 序)〕= 4 × 45 = 180 */
export function cdeVariants2() {
    let pairs = []
    for (let i = 0; i < 6; i++) {
        for (let j = 0; j < 6; j++) {
            if (i !== j) {
                pairs.push([i, j])
            }
        }
    }
    let triples = [[0, 2, 3], [1, 4, 5], [2, 3, 4], [0, 2, 5]]
    let multis = [...pairs, ...triples, ...triples.map((x) => [...x].reverse())]
    return cdeVariants(['OR', 'AND', undefined, 'or'], RULESETS_F6, multis)
}

/** c／d／e 窮舉之變體(3 項用): 模式 OR／AND／'XOR' × 內容〔T1 T2、T2 T3、空、懸空、同名 2 列(全 y 與 T1:y, 正反 2 序)、同名 2 列(T1 T2 與空)〕= 3 × 7 = 21 */
export function cdeVariants3() {
    let rs = [RULESETS_F6[2], RULESETS_F6[3], RULESETS_F6[5], RULESETS_F6[0], RULESETS_F6[4]]
    let vs = cdeVariants(['OR', 'AND', 'XOR'], rs, [[3, 4], [4, 3], [0, 2]])
    //規則集 3、4(全 y、T1:y)只作為同名多列之候選, 不單獨出現
    return vs.filter((v) => !(v.kind === 'rule' && (v.rules === rs[3] || v.rules === rs[4])))
}

/**
 * 窮舉彙整(GOLD)所含之窮舉定義: [名稱, 說明, 求值函數]; 單元測試與 authMergeReport.mjs --golden 共用同一份定義
 * 求值函數回傳 { checks, rows(summarize 後), raw(scanCells 原始 rows, 含最小例子; 不入 GOLD) }
 */
export function goldScanDefs() {
    let T1 = ['T1']
    let vs3 = itemVariants(['OR', 'AND'], rulesetsAll())
    let vs1 = oneTargetVariants()
    let vsF5 = itemVariants(['OR', 'AND'], RULESETS_F5)
    let vc2 = cdeVariants2()
    let vc3 = cdeVariants3()
    let run = (gen, tg) => {
        let r = scanCells(gen, tg)
        return { checks: r.checks, rows: summarize(r.rows), raw: r.rows }
    }
    return [
        ['P3k2', '權限層 3 管理對象 2 項(模式 OR／AND × 27 種規則集, 所有儲存順序)', () => run(genP(2, vs3))],
        ['G3k2', '群組層 3 管理對象 2 項', () => run(genG(2, vs3))],
        ['P3k3', '權限層 3 管理對象 3 項', () => run(genP(3, vs3))],
        ['P1k2', '權限層 1 管理對象 2 項(狀態 y／n／未列)', () => run(genP(2, vs1, 'obj', T1), T1)],
        ['P1k3', '權限層 1 管理對象 3 項', () => run(genP(3, vs1, 'obj', T1), T1)],
        ['P1k4', '權限層 1 管理對象 4 項', () => run(genP(4, vs1, 'obj', T1), T1)],
        ['PG1g2s012', '兩層 1 管理對象 2 群組(每群組 0～2 個權限)', () => run(genPG(2, [0, 1, 2], ['OR', 'AND'], vs1, 'obj', T1), T1)],
        ['PG1g3s01', '兩層 1 管理對象 3 群組(每群組 0～1 個權限)', () => run(genPG(3, [0, 1], ['OR', 'AND'], vs1, 'obj', T1), T1)],
        ['PG3F5g2s12', '兩層 3 管理對象 2 群組(每群組 1～2 個權限, 規則集家族 F5)', () => run(genPG(2, [1, 2], ['OR', 'AND'], vsF5, 'obj'))],
        ['P3cdek2', '權限層 3 管理對象 2 項 c／d／e(模式 OR／AND／缺／or × 內容: F6 規則集 6、懸空、同名 2 列有序對 30、同名 3 列 8; 所有儲存順序與表列順序)', () => run(genCde('P', 2, vc2))],
        ['G3cdek2', '群組層 3 管理對象 2 項 c／d／e(同上; 懸空＝群組表查無, 同名多列＝同名群組多列)', () => run(genCde('G', 2, vc2))],
        ['P3cdek3', '權限層 3 管理對象 3 項 c／d／e(模式 OR／AND／XOR × 內容: T1 T2、T2 T3、空、懸空、同名 2 列 3 種)', () => run(genCde('P', 3, vc3))],
        ['G3cdek3', '群組層 3 管理對象 3 項 c／d／e(同上)', () => run(genCde('G', 3, vc3))],
    ]
}
