//授權合併(getUserRules)規格參考實作、舊規則複製與稽核之共用工具(供 unit-authMerge 與 authMergeReport.mjs 使用)
//
//【定位】規則為 sgud/rule/rulebook.md 之 R-AUTH-MERGE-00 與 R-PRINCIPLE-00(使用者裁示; ADR-033 取代 ADR-001 之 AND 非對稱條)——
//  每一項「未給」＝ n; 全對象 n 起點 → 所有 OR 聯集(無 OR 時第一個 AND 為基底)→ 與所有 AND 交集; 結果與排列順序無關;
//  run05(R-PRINCIPLE-00 適用表 c／d／e): 引用查無實體(懸空)者以其 mode 參與、內容全 n; 引用之名稱對到多筆(歷史同名)者內容取各筆之交集;
//  mode 缺或非 OR／AND 者為「限制項」(lim): 只作 AND 交集項、不當基底; 該層沒有任何 mode 合法之啟用項(含沒有任何項)→ 結果全 n(主責裁示: 各解讀〔OR／AND／不計入〕之交集,
//  維持「只收回、不多給」). 引用之 isActive 非 'y' 者不參與(不變).
//
//【做法】evalFull 為「自原始輸入(user／grups／pemis／targets)出發」之完整集合式模型: 與 src 只共用解碼(JSON5.parse＋cvKpToArr),
//  找列(名稱精確 ===)、mode 判定、候選交集、合併皆於本檔獨立實作(不 import findRefRows／getEffMode／mShare 內部), 以旗標 flags 選語意:
//    FLAGS.spec   { dangling:'empty', multi:'intersect', badMode:'lim',  merge:'spec' }    新語意(run05); 真函數在每一格必須等於它(保真)
//                 (badMode 另可為 'AND': 視為一般 AND 項〔可當基底〕——run05 初版之解讀, 唯一項時會多給, 僅供對照)
//    FLAGS.run04  { dangling:'drop',  multi:'first',     badMode:'drop', merge:'spec' }    run04(未發布, 僅開發內): 懸空不計入、同名取表中第一筆、mode 非法不計入
//    FLAGS.legacy { dangling:'drop',  multi:'first',     badMode:'drop', merge:'legacy' }  1.1.12 發布版: 同 run04, 合併為 ADR-001 非對稱(各 AND 項只約束其提及之鍵; 同名重複列後者覆蓋前者)
//  單獨開關一個旗標(flagsWith／flagsWithout)即得 c／d／e 各自之效果: 稽核之原因歸因(auditUsers 之 reasons)與單元測試之逐旗標歸因用.
//  run04 旗標模型之忠實度以 run04 真函數一次性比對(第 101 項 run05 M1, 不入 repo; 結果見主控報告).
//
//【逐鍵獨立】合併對每個鍵(管理對象)獨立進行(候選交集亦然), 故每個管理對象的結果只取決於各項在該鍵上的 (mode, 狀態 y／n／未列); 單元測試 SP-PROJ-001 驗證.

import JSON5 from 'json5'
import { getUserRules } from '../../src/plugins/mShare.mjs'
import cvKpToArr from '../../src/js/cvKpToArr.mjs'


export const TARGET_IDS = ['T1', 'T2', 'T3']
export const SEMS = ['spec', 'run04', 'legacy']

/** 三代語意之旗標(見檔頭) */
export const FLAGS = {
    spec: Object.freeze({ dangling: 'empty', multi: 'intersect', badMode: 'lim', merge: 'spec' }),
    run04: Object.freeze({ dangling: 'drop', multi: 'first', badMode: 'drop', merge: 'spec' }),
    legacy: Object.freeze({ dangling: 'drop', multi: 'first', badMode: 'drop', merge: 'legacy' }),
}

/** R-PRINCIPLE-00 適用表 c／d／e: 各自對應之旗標鍵、新語意之值與警告碼(與 src/js/getAuthWarn.mjs 之警告碼同名) */
export const CDE = {
    c: { key: 'dangling', value: 'empty', code: 'dangling' },
    d: { key: 'multi', value: 'intersect', code: 'ambiguous' },
    e: { key: 'badMode', value: 'lim', code: 'modeInvalid' },
}
export const CDE_KEYS = ['c', 'd', 'e']

/** 以 base 旗標為底, 把 keys(c／d／e 之子集)換成新語意之值 */
export function flagsWith(base, keys) {
    let f = { ...base }
    keys.forEach((x) => {
        f[CDE[x].key] = CDE[x].value
    })
    return f
}

/** 以 base 旗標為底, 把 keys(c／d／e 之子集)換回 run04 之值 */
export function flagsWithout(base, keys) {
    let f = { ...base }
    keys.forEach((x) => {
        f[CDE[x].key] = FLAGS.run04[CDE[x].key]
    })
    return f
}


// ---------------------------------------------------------------
// 資料建構
// ---------------------------------------------------------------

/**
 * 依規格建構 getUserRules 的四個輸入(user、grups、pemis、targets)
 *
 * spec:
 *   form: 'obj'(預設; 授權字串為以名稱為鍵之物件, 鍵序即 groups／perms／rules 之順序) 或 'arr'(陣列形式 [{ name, … }])
 *   groups: [{ name, mode, active, perms: [{ name, mode, active, rules: [[標的, 值], …] }] }], 順序即使用者 cgrups 內之順序
 *     mode／active 為 undefined 時該欄不寫出(缺); mode 可為任意值(如 'or'、'XOR'、1、null 為非法)
 *     group.inTable === false: 使用者 cgrups 列出但群組表查無(懸空); perm.inTable === false 同(群組 cpemis 列出但權限表查無)
 *     group.cpemisRaw／perm.crulesRaw／spec.cgrupsRaw: 直接給字串(測資料損壞、空字串等)
 *     group.dupRows: [{ perms: […] , cpemisRaw? }] 與主列同名之其他群組列(歷史同名; 表中依序接在主列之後), 其 perms 一併寫入權限表(不列入主列之 cpemis)
 *     perm.dupRows: [{ rules: […] , crulesRaw? }] 與主列同名之其他權限列(同上)
 *   同名實體: spec 內不同群組(或權限)若同名, 其表列內容(含 dupRows)必須相同, 否則拋錯(同名多列請以 dupRows 指定, 或直接給四表資料)
 *
 * @param {Object} spec 輸入規格(現存管理對象不在 spec 內, 由第二參數 targets 給定)
 * @param {Array} targets 輸入現存管理對象 id 陣列(預設 TARGET_IDS)
 * @returns {Object} 回傳 { user, grups, pemis, targets }, 每次呼叫皆為全新物件
 */
export function buildData(spec, targets = TARGET_IDS) {
    let form = spec.form || 'obj'
    let ent = (o) => {
        let r = {}
        if (o.mode !== undefined) {
            r.mode = o.mode
        }
        if (o.active !== undefined) {
            r.isActive = o.active
        }
        return r
    }
    //serial: 依 form 把 [[name, entry], …] 序列化
    let serial = (pairs) => {
        if (form === 'arr') {
            return JSON.stringify(pairs.map(([name, e]) => ({ name, ...e })))
        }
        let o = Object.create(null) //無原型容器: 名稱可為 __proto__ 等原型鍵名
        pairs.forEach(([name, e]) => {
            o[name] = e
        })
        return JSON.stringify(o)
    }
    let serialRules = (rules) => {
        if (form === 'arr') {
            return JSON.stringify(rules.map(([name, v]) => ({ name, isActive: v })))
        }
        let o = Object.create(null)
        rules.forEach(([name, v]) => {
            o[name] = v
        })
        return JSON.stringify(o)
    }

    let pemis = []
    let grups = []
    let seenP = new Map()
    let seenG = new Map()
    //addRows: 同名實體之表列(主列 + dupRows)只寫入一次; 再次出現時內容須相同
    let addRows = (seen, tbl, kind, name, field, contents) => {
        let sig = JSON.stringify(contents)
        if (!seen.has(name)) {
            seen.set(name, sig)
            contents.forEach((c, k) => {
                tbl.push({ id: k === 0 ? `id-${name}` : `id-${name}#${k + 1}`, name, [field]: c })
            })
        }
        else if (seen.get(name) !== sig) {
            throw new Error(`buildData: 同名${kind}「${name}」內容不同(同名多列請以 dupRows 指定, 或直接給四表資料)`)
        }
    }
    let addPerm = (p) => {
        if (p.inTable === false) {
            if (p.dupRows) {
                throw new Error(`buildData: 權限「${p.name}」inTable:false 不得有 dupRows`)
            }
            return
        }
        let contents = [p, ...(p.dupRows || [])].map((x) => ((x.crulesRaw !== undefined) ? x.crulesRaw : serialRules(x.rules || [])))
        addRows(seenP, pemis, '權限', p.name, 'crules', contents)
    }
    let cpemisOf = (perms, raw) => {
        let pairs = []
        ;(perms || []).forEach((p) => {
            pairs.push([p.name, ent(p)])
            addPerm(p)
        })
        return (raw !== undefined) ? raw : serial(pairs)
    }

    let cgrupsPairs = []
    spec.groups.forEach((g) => {
        let cpemis = cpemisOf(g.perms, g.cpemisRaw)
        cgrupsPairs.push([g.name, ent(g)])
        if (g.inTable === false) {
            if (g.dupRows) {
                throw new Error(`buildData: 群組「${g.name}」inTable:false 不得有 dupRows`)
            }
            return
        }
        let contents = [cpemis, ...(g.dupRows || []).map((x) => cpemisOf(x.perms, x.cpemisRaw))]
        addRows(seenG, grups, '群組', g.name, 'cpemis', contents)
    })
    let user = { id: 'id-user', name: 'user', cgrups: (spec.cgrupsRaw !== undefined) ? spec.cgrupsRaw : serial(cgrupsPairs) }
    return { user, grups, pemis, targets: targets.map((id) => ({ id })) }
}


// ---------------------------------------------------------------
// 完整模型 evalFull(獨立實作; 只共用解碼)
// ---------------------------------------------------------------

//decode: 同 getUserRules 之解碼——JSON5.parse 失敗視為空物件、cvKpToArr 失敗視為空陣列(解碼為與 src 唯一共用之程式碼)
function decode(c) {
    let kp = Object.create(null)
    try {
        kp = JSON5.parse(c)
    }
    catch (err) {
        //損壞字串: 視為空
    }
    try {
        return cvKpToArr(kp)
    }
    catch (err) {
        return []
    }
}

//fieldOf: 單層鍵取值, o 為 null／undefined 或值為 undefined 時為 ''(列無 name 欄之列名稱為 '', 與引用名稱 '' 相符)
let fieldOf = (o, key) => ((o === null || o === undefined || o[key] === undefined) ? '' : o[key])

//propKey: 規則名轉屬性鍵(JS 屬性鍵轉型); 轉型必拋者(如 { toString: null })回 null, 該規則略過
let propKey = (name) => {
    try {
        return `${name}`
    }
    catch (err) {
        return null
    }
}

//rulesMap: crules 解碼結果 → Map(規則鍵 → 值); 同名重複列: dup 'allY'(新語意與 run04: 所有列皆 y 才 y)或 'last'(1.1.12: 後者覆蓋前者)
function rulesMap(arr, dup) {
    let kp = new Map()
    arr.forEach((r) => {
        let k = propKey(r.name)
        if (k === null) {
            return
        }
        if (dup === 'allY' && kp.has(k)) {
            kp.set(k, (kp.get(k) === 'y' && r.isActive === 'y') ? 'y' : 'n')
        }
        else {
            kp.set(k, r.isActive)
        }
    })
    return kp
}

//mergeSpecItems: 集合式定義(R-AUTH-MERGE-00＋R-PRINCIPLE-00 e): 逐鍵 y ⇔ (有 OR 項 ? 某 OR 項為 y : 真) 且 每個 AND 項(含限制項 lim)皆為 y; 未列視為 n;
//  沒有任何 mode 合法(非 lim)之項(含無項)→ 空(全 n)——限制項只收斂、不授予
function mergeSpecItems(ts) {
    let kp = new Map()
    if (ts.filter((t) => !t.lim).length === 0) {
        return kp
    }
    let tsOR = ts.filter((t) => t.mode === 'OR')
    let tsAND = ts.filter((t) => t.mode === 'AND')
    let keys = new Set()
    ts.forEach((t) => t.kp.forEach((v, k) => keys.add(k)))
    keys.forEach((k) => {
        let ok = (tsOR.length > 0) ? tsOR.some((t) => t.kp.get(k) === 'y') : true
        ok = ok && tsAND.every((t) => t.kp.get(k) === 'y')
        kp.set(k, ok ? 'y' : 'n')
    })
    return kp
}

function objOR(a, b) {
    let kp = new Map()
    ;[a, b].forEach((obj) => {
        obj.forEach((v, k) => {
            if (!kp.has(k)) {
                kp.set(k, 'n')
            }
            kp.set(k, (kp.get(k) === 'y' || v === 'y') ? 'y' : 'n')
        })
    })
    return kp
}

function objANDLegacy(a, b) {
    let kp = new Map(a)
    b.forEach((v, k) => {
        if (!kp.has(k)) {
            kp.set(k, 'n')
        }
        kp.set(k, (kp.get(k) === 'y' && v === 'y') ? 'y' : 'n')
    })
    return kp
}

//mergeLegacyItems: 舊規則(ADR-001 非對稱; 1.1.12 之 mergeRules)之複製: 有 OR 項 → 以 OR 聯集為起點、各 AND 項只約束其提及之鍵; 無 OR 項 → 以第一個 AND 項為起點; 與排列順序有關
//  (限制項 lim: 只作 AND 約束、不當起點, 無合法項時為空——1.1.12 無此項, 只供旗標組合之完整性)
function mergeLegacyItems(ts) {
    if (ts.filter((t) => !t.lim).length === 0) {
        return new Map()
    }
    let tsOR = ts.filter((t) => t.mode === 'OR')
    let tsAND = ts.filter((t) => t.mode === 'AND')
    let kpFin = (tsOR.length > 0) ? tsOR[0].kp : tsAND.filter((t) => !t.lim)[0].kp
    tsOR.forEach((t) => {
        kpFin = objOR(kpFin, t.kp)
    })
    tsAND.forEach((t) => {
        kpFin = objANDLegacy(kpFin, t.kp)
    })
    return kpFin
}

const MERGE_ITEMS = { spec: mergeSpecItems, legacy: mergeLegacyItems }

//intersectMaps: 多個候選內容之交集(逐鍵皆 y 才 y; 鍵取聯集, 未列＝n); 1 個＝原樣
function intersectMaps(kps) {
    if (kps.length === 1) {
        return kps[0]
    }
    let keys = new Set()
    kps.forEach((m) => m.forEach((v, k) => keys.add(k)))
    let kp = new Map()
    keys.forEach((k) => {
        kp.set(k, kps.every((m) => m.get(k) === 'y') ? 'y' : 'n')
    })
    return kp
}

//prepData: 預先解碼(同一份資料以多種旗標求值時只解碼一次); 表列之授權字串延遲解碼
function prepData(d) {
    let rowsOf = (rows) => (Array.isArray(rows) ? rows : [])
    let lazy = (rows, field) => rowsOf(rows).map((row) => {
        let o = { name: fieldOf(row, 'name'), memo: null }
        o.arr = () => {
            if (o.memo === null) {
                o.memo = decode(fieldOf(row, field))
            }
            return o.memo
        }
        return o
    })
    return {
        userArr: decode(fieldOf(d.user, 'cgrups')),
        grups: lazy(d.grups, 'cpemis'),
        pemis: lazy(d.pemis, 'crules'),
    }
}

//refItems: 引用清單(解碼結果)→ 參與合併之項 [{ name, mode, cands }]
//  只取 isActive 為 'y' 者(R-AUTH-MERGE-00 第 5 條); 以名稱精確 === 找列(列無 name 欄視為 '');
//  mode: 'OR'／'AND' 照用, 其餘依 flags.badMode('lim' 限制項: AND 交集項、不當基底; 'AND' 一般 AND 項; 'drop' 不計入);
//  查無列: flags.dangling('empty' 仍參與、內容全 n; 'drop' 不計入); 多筆: flags.multi('intersect' 全部候選; 'first' 表中第一筆)
//  onRef(r, hits): 每個啟用引用之回呼(稽核列出觸發之引用用)
function refItems(arr, rows, flags, contentOf, onRef) {
    let items = []
    arr.forEach((r) => {
        if (r.isActive !== 'y') {
            return
        }
        let hits = rows.filter((x) => x.name === r.name)
        if (onRef) {
            onRef(r, hits)
        }
        let ok = r.mode === 'OR' || r.mode === 'AND'
        if (!ok && flags.badMode === 'drop') {
            return
        }
        if (hits.length === 0 && flags.dangling === 'drop') {
            return
        }
        let cands = (flags.multi === 'first') ? hits.slice(0, 1) : hits
        items.push({ name: r.name, mode: ok ? r.mode : 'AND', lim: !ok && flags.badMode === 'lim', cands: cands.map(contentOf) })
    })
    return items
}

//treeOf: 授權樹 { items: [群組項] }; 群組項之 cands 為群組節點 { name, items: [權限項] }; 權限項之 cands 為規則 Map
function treeOf(P, flags, onRef) {
    let dup = (flags.merge === 'legacy') ? 'last' : 'allY'
    let permNode = (pr) => rulesMap(pr.arr(), dup)
    let grupNode = (gr) => ({
        name: gr.name,
        items: refItems(gr.arr(), P.pemis, flags, permNode, onRef ? (r, hits) => onRef('pemi', gr.name, r, hits) : null),
    })
    return { items: refItems(P.userArr, P.grups, flags, grupNode, onRef ? (r, hits) => onRef('grup', null, r, hits) : null) }
}

//mergeNode: 節點之合併結果(Map); 項之內容 = 候選內容之交集, 無候選(懸空)＝空(全 n)
function mergeNode(node, merge) {
    return merge(node.items.map((it) => ({
        mode: it.mode,
        lim: it.lim,
        kp: (it.cands.length === 0) ? new Map() : intersectMaps(it.cands.map((c) => ((c instanceof Map) ? c : mergeNode(c, merge)))),
    })))
}

function evalKp(P, flags) {
    return mergeNode(treeOf(P, flags), MERGE_ITEMS[flags.merge])
}

//expandTargets: 依現存管理對象展開(未涵蓋者 n), 回傳 { 標的: 'y'／'n' }(無原型容器)
function expandTargets(kp, targets) {
    let o = Object.create(null)
    ;(Array.isArray(targets) ? targets : []).forEach((t) => {
        o[t.id] = (kp.get(String(t.id)) === 'y') ? 'y' : 'n'
    })
    return o
}

/**
 * 完整模型: 自原始輸入求授權(獨立於 src 之找列／mode 判定／交集／合併)
 *
 * @param {Object} d 輸入 { user, grups, pemis, targets }(與 getUserRules 之四個參數同)
 * @param {Object} flags 輸入語意旗標(FLAGS.spec／run04／legacy, 或 flagsWith／flagsWithout 之結果)
 * @returns {Object} 回傳 { 標的: 'y'／'n' }
 */
export function evalFull(d, flags) {
    return expandTargets(evalKp(prepData(d), flags), d.targets)
}

/**
 * 列出參與合併之引用(isActive 為 'y')中屬 c／d／e 者(依新語意可達者: 同名多列之每一候選皆展開)
 *
 * @param {Object} d 輸入 { user, grups, pemis, targets }
 * @returns {Array} 回傳 [{ code: 'dangling'|'ambiguous'|'modeInvalid', level: 'grup'(使用者 cgrups)|'pemi'(群組 cpemis), holder(群組名; grup 層為 null), name, n(相符列數) }]
 */
export function refIssues(d) {
    let out = []
    let seen = new Set()
    treeOf(prepData(d), FLAGS.spec, (level, holder, r, hits) => {
        let push = (code) => {
            let key = JSON.stringify([code, level, holder, r.name])
            if (!seen.has(key)) {
                seen.add(key)
                out.push({ code, level, holder, name: r.name, n: hits.length })
            }
        }
        if (hits.length === 0) {
            push('dangling')
        }
        if (hits.length >= 2) {
            push('ambiguous')
        }
        if (r.mode !== 'OR' && r.mode !== 'AND') {
            push('modeInvalid')
        }
    })
    return out
}

/** 資料含哪些 c／d／e 情形: { c, d, e } */
export function featuresOf(d) {
    let codes = new Set(refIssues(d).map((x) => x.code))
    return { c: codes.has('dangling'), d: codes.has('ambiguous'), e: codes.has('modeInvalid') }
}


// ---------------------------------------------------------------
// 評估: 真函數與各語意
// ---------------------------------------------------------------

/** 把 getUserRules 之 rules 陣列轉為 { 標的: isActive }(無原型容器, 標的可為 __proto__ 等原型鍵名) */
export function toMap(rules) {
    let kp = Object.create(null)
    rules.forEach((r) => {
        kp[r.name] = r.isActive
    })
    return kp
}

/** 結果摘要字串, 如 'T1=n T2=y T3=y'(依 targets 順序) */
export function fmtResult(kp, targets = TARGET_IDS) {
    return targets.map((t) => `${t}=${Object.prototype.hasOwnProperty.call(kp, t) ? kp[t] : '?'}`).join(' ')
}

/** 有權限(y)之標的集合字串, 如 '{T2,T3}' */
export function ySet(kp, targets = TARGET_IDS) {
    return '{' + targets.filter((t) => Object.prototype.hasOwnProperty.call(kp, t) && kp[t] === 'y').join(',') + '}'
}

/**
 * 對一份四表資料計算真函數與各語意(SEMS)之結果; 先求模型再呼叫真函數(真函數若就地改動輸入, 不影響模型結果)
 *
 * @param {Object} d 輸入 { user, grups, pemis, targets }
 * @param {Object} [opt] 輸入 { flags: { 名稱: 旗標 } } 另求之語意(如單獨開關旗標)
 * @returns {Object} 回傳 { real, sem: { spec, run04, legacy, …opt.flags 之名稱 }, out }
 */
export function evalData(d, opt = {}) {
    let P = prepData(d)
    let sem = {}
    SEMS.forEach((s) => {
        sem[s] = expandTargets(evalKp(P, FLAGS[s]), d.targets)
    })
    Object.entries(opt.flags || {}).forEach(([k, f]) => {
        sem[k] = expandTargets(evalKp(P, f), d.targets)
    })
    let out = getUserRules(d.user, d.grups, d.pemis, d.targets)
    return { real: toMap(out.rules), sem, out }
}

/**
 * 對一個規格計算真函數結果與各語意之結果
 *
 * @param {Object} spec 輸入規格(見 buildData)
 * @param {Array} targetIds 輸入現存管理對象 id 陣列
 * @param {Object} [opt] 輸入同 evalData
 * @returns {Object} 回傳 { real: { 標的: isActive }, sem: { spec, run04, legacy }, out }
 */
export function evalSpec(spec, targetIds = TARGET_IDS, opt = {}) {
    return evalData(buildData(spec, targetIds), opt)
}

/** 只要真函數結果(較快) */
export function realOf(spec, targetIds = TARGET_IDS) {
    let d = buildData(spec, targetIds)
    return toMap(getUserRules(d.user, d.grups, d.pemis, d.targets).rules)
}


// ---------------------------------------------------------------
// 單層合併(項目已解碼)之規格／舊規則: [{ name, mode, rules: [{ name, isActive }] }] → [{ name, isActive }](mode 非 OR／AND 之項不計入)
// ---------------------------------------------------------------

function itemsOf(rs, dup) {
    let ts = []
    rs.forEach((v) => {
        if (v.mode !== 'OR' && v.mode !== 'AND') {
            return
        }
        ts.push({ name: v.name, mode: v.mode, kp: rulesMap(v.rules || [], dup) })
    })
    return ts
}

function toRules(kp) {
    let rs = []
    kp.forEach((v, k) => {
        rs.push({ name: k, isActive: v })
    })
    return rs
}

/** 規格(R-AUTH-MERGE-00)之單層合併: 逐鍵 y ⇔ (有 OR 項 ? 某 OR 項為 y : 真) 且 每個 AND 項皆為 y; 未列視為 n; 無有效項 → [] */
export function mergeSpec(rs) {
    return toRules(mergeSpecItems(itemsOf(rs, 'allY')))
}

/** 舊規則(ADR-001 非對稱)之單層合併 */
export function mergeLegacy(rs) {
    return toRules(mergeLegacyItems(itemsOf(rs, 'last')))
}

export const MERGERS = { spec: mergeSpec, legacy: mergeLegacy }


// ---------------------------------------------------------------
// 逐鍵閉式: 單一管理對象, 各項為 { mode, s }, s 為 'y'／'n'／''(未列)
// ---------------------------------------------------------------

/**
 * 單層合併之閉式(規格; 與儲存順序無關): 有 OR → 某 OR 項為 y 且 每個 AND 項皆為 y; 無 OR → 每個 AND 項皆為 y; 未列視為 n; 無任何有效項 → n
 *
 * @param {Array} items 輸入 [{ mode, s }]
 * @returns {String} 回傳 'y' 或 'n'
 */
export function predictSpec(items) {
    let ors = items.filter((t) => t.mode === 'OR')
    let ands = items.filter((t) => t.mode === 'AND')
    if (ors.length === 0 && ands.length === 0) {
        return 'n'
    }
    let y = (ors.length > 0) ? ors.some((t) => t.s === 'y') : true
    ands.forEach((t) => {
        y = y && t.s === 'y'
    })
    return y ? 'y' : 'n'
}

/**
 * 單層舊規則之閉式(依儲存順序; 稽核工具 mergeLegacy 之保真檢查用): 有 OR: OR 有無 y 且 列出之 AND 皆 y; 無 OR: 第一個 AND 為 y 且 其後列出之 AND 皆 y
 *
 * @param {Array} items 輸入 [{ mode, s }]
 * @returns {String} 回傳 'y' 或 'n'
 */
export function predictLegacy(items) {
    let ors = items.filter((t) => t.mode === 'OR')
    let ands = items.filter((t) => t.mode === 'AND')
    if (ors.length === 0 && ands.length === 0) {
        return 'n'
    }
    let y
    let rest
    if (ors.length > 0) {
        y = ors.some((t) => t.s === 'y')
        rest = ands
    }
    else {
        y = ands[0].s === 'y'
        rest = ands.slice(1)
    }
    rest.forEach((t) => {
        if (t.s !== '') {
            y = y && t.s === 'y'
        }
    })
    return y ? 'y' : 'n'
}


// ---------------------------------------------------------------
// 輸入空間: 規則集(crules)、項目變體、排列
// ---------------------------------------------------------------

/** 規則集全集: 每個管理對象在 {未列, y, n} 取一, 共 3^n 個; 回傳 [[標的, 值], …] 陣列之陣列(依標的順序, 未列者省略) */
export function rulesetsAll(targetIds = TARGET_IDS) {
    let out = [[]]
    targetIds.forEach((t) => {
        let next = []
        out.forEach((rs) => {
            next.push(rs)
            next.push([...rs, [t, 'y']])
            next.push([...rs, [t, 'n']])
        })
        out = next
    })
    return out
}

/** 規則集標籤, 如 'T1:y T3:n'; 空集合為空字串 */
export function rulesetLabel(rules) {
    return rules.map(([t, v]) => `${t}:${v}`).join(' ')
}

/** 規則集是否稠密(列出全部管理對象且值為 y／n) */
export function isDenseRuleset(rules, targetIds = TARGET_IDS) {
    return targetIds.every((t) => rules.some(([k, v]) => k === t && (v === 'y' || v === 'n')))
}

/** 規則集在某管理對象之狀態: 'y'／'n'／''(未列) */
export function stateOf(rules, t) {
    let r = rules.filter(([k]) => k === t).pop()
    return r ? r[1] : ''
}

/** 所有排列(元素個數 ≤ 5) */
export function permutations(arr) {
    if (arr.length <= 1) {
        return [arr.slice()]
    }
    let out = []
    arr.forEach((x, i) => {
        let rest = arr.slice(0, i).concat(arr.slice(i + 1))
        permutations(rest).forEach((p) => out.push([x, ...p]))
    })
    return out
}

/** 笛卡兒積: product(variants, k) → 所有長度為 k 之序列(可重複) */
export function* product(variants, k) {
    if (k === 0) {
        yield []
        return
    }
    for (let v of variants) {
        for (let rest of product(variants, k - 1)) {
            yield [v, ...rest]
        }
    }
}

/**
 * 項目變體: [{ id, mode, rules }], id 為內容之決定性代號(名稱由 id 導出, 使名稱與內容連動而非與位置連動)
 *
 * @param {Array} modes 輸入模式陣列, 如 ['OR', 'AND']
 * @param {Array} rulesets 輸入規則集陣列(rulesetsAll 之子集)
 */
export function itemVariants(modes, rulesets) {
    let vs = []
    modes.forEach((mode) => {
        rulesets.forEach((rules, i) => {
            vs.push({ id: `${mode}${String(i).padStart(2, '0')}`, mode, rules })
        })
    })
    return vs
}

//modeTag: 模式之代號(變體 id 用): OR→O、AND→A、缺→U、其他(非法)→B<值>
let modeTag = (m) => ((m === 'OR') ? 'O' : (m === 'AND') ? 'A' : (m === undefined) ? 'U' : `B${String(m)}`)

/**
 * c／d／e 項目變體: 模式 × 內容種類
 *   kind 'rule'    一般(表中恰一列), rules 為其規則集
 *   kind 'dangling' 懸空(表中查無)
 *   kind 'multi'   同名多列(歷史同名), cands 為各列之規則集(依表列順序)
 * id 含候選之表列順序; ck(combo 鍵)與候選順序無關——同一組項目之所有儲存順序(含表列順序)為同一 combo
 *
 * @param {Array} modes 輸入模式陣列(可含缺 undefined 與非法值)
 * @param {Array} rulesets 輸入規則集陣列
 * @param {Array} multis 輸入同名多列之候選(規則集索引陣列, 依表列順序)之陣列
 */
export function cdeVariants(modes, rulesets, multis) {
    let vs = []
    modes.forEach((mode) => {
        let mt = modeTag(mode)
        rulesets.forEach((rules, i) => {
            vs.push({ id: `${mt}r${i}`, ck: `${mt}r${i}`, mode, kind: 'rule', rules })
        })
        vs.push({ id: `${mt}x`, ck: `${mt}x`, mode, kind: 'dangling', rules: [] })
        multis.forEach((idx) => {
            vs.push({ id: `${mt}m${idx.join('-')}`, ck: `${mt}m${[...idx].sort().join('-')}`, mode, kind: 'multi', rules: rulesets[idx[0]], cands: idx.map((i) => rulesets[i]) })
        })
    })
    return vs
}

/** 自序列變體產生權限名稱(重複的變體加尾碼, 同一群組內名稱須唯一) */
function nameSeq(prefix, seq) {
    let cnt = {}
    return seq.map((v) => {
        cnt[v.id] = (cnt[v.id] || 0) + 1
        return `${prefix}${v.id}${cnt[v.id] > 1 ? '_' + cnt[v.id] : ''}`
    })
}

//permOf: 變體 → 權限規格(kind 見 cdeVariants; 無 kind 者為一般)
let permOf = (name, v) => {
    let p = { name, mode: v.mode, active: 'y', rules: v.rules }
    if (v.kind === 'dangling') {
        p.inTable = false
    }
    else if (v.kind === 'multi') {
        p.rules = v.cands[0]
        p.dupRows = v.cands.slice(1).map((rules) => ({ rules }))
    }
    return p
}

/** 權限層規格: 使用者只有一個群組(預設 OR), 內含 seq 順序之權限(變體可為 cdeVariants 之懸空／同名多列) */
export function specP(seq, opt = {}) {
    let names = nameSeq('P', seq)
    return {
        form: opt.form || 'obj',
        groups: [{
            name: 'G1', mode: opt.grupMode || 'OR', active: 'y',
            perms: seq.map((v, i) => permOf(names[i], v)),
        }],
    }
}

/** 群組層規格: 使用者有 seq 順序之群組, 每個群組(每一列)只有一個權限; 懸空變體＝群組表查無, 同名多列變體＝同名群組多列(各含一個不同內容之權限) */
export function specG(seq, opt = {}) {
    let names = nameSeq('', seq)
    let pm = opt.pemiMode || 'OR'
    return {
        form: opt.form || 'obj',
        groups: seq.map((v, i) => {
            let gg = {
                name: `G${names[i]}`, mode: v.mode, active: 'y',
                perms: [{ name: `P${names[i]}`, mode: pm, active: 'y', rules: v.rules }],
            }
            if (v.kind === 'dangling') {
                gg.perms = []
                gg.inTable = false
            }
            else if (v.kind === 'multi') {
                gg.perms = [{ name: `P${names[i]}`, mode: pm, active: 'y', rules: v.cands[0] }]
                gg.dupRows = v.cands.slice(1).map((rules, k) => ({ perms: [{ name: `P${names[i]}#${k + 2}`, mode: pm, active: 'y', rules }] }))
            }
            return gg
        }),
    }
}

/**
 * 兩層規格: gseq 為群組序列, 每個群組 = { id, mode, pseq }, pseq 為權限變體序列
 * 權限名稱全域唯一(群組代號 + 權限代號)
 */
export function specPG(gseq, opt = {}) {
    let gnames = nameSeq('G', gseq.map((g) => ({ id: g.id })))
    return {
        form: opt.form || 'obj',
        groups: gseq.map((g, i) => {
            let pnames = nameSeq(`P${gnames[i]}-`, g.pseq)
            return {
                name: gnames[i], mode: g.mode, active: 'y',
                perms: g.pseq.map((v, j) => permOf(pnames[j], v)),
            }
        }),
    }
}


// ---------------------------------------------------------------
// 稽核: 對一份現有資料(users／grups／pemis／targets)逐使用者比較新語意(真函數)與 run04、1.1.12
// ---------------------------------------------------------------

//最小原因: 自 run04 起最少需開哪些旗標(c／d／e)才使該管理對象變為 want; 依子集大小由小到大, 已找到之子集之超集略過
const CDE_SUBSETS = [['c'], ['d'], ['e'], ['c', 'd'], ['c', 'e'], ['d', 'e'], ['c', 'd', 'e']]

/**
 * 稽核現有資料(部署前盤點新語意的影響; 純函數, 不讀寫資料庫)
 *
 * 每位使用者: 以真函數 getUserRules(新語意)求授權(real), 與模型 evalFull 之 1.1.12(legacy)、run04 結果比較:
 *   lost         1.1.12 為 y、新語意為 n 之管理對象(相對發布版被收回者)
 *   gained       1.1.12 為 n、新語意為 y 之管理對象(多給)
 *   lostByCde    run04 為 y、新語意為 n 之管理對象(run04 未發布, 僅開發內: 因 R-PRINCIPLE-00 c／d／e 額外收回者)
 *   gainedByCde  run04 為 n、新語意為 y 之管理對象
 *   reasons      { 管理對象: [[警告碼, …], …] } lostByCde／gainedByCde 各管理對象之最小原因(單獨開關旗標即可者為單一碼; 須同時開兩個以上者為複合)
 *   issues       觸發之具體引用(refIssues: 使用者 cgrups／群組 cpemis 中之懸空、同名多列、mode 非法), 只含名稱(不含 email 等個資)
 *   fidelity     真函數＝模型 evalFull(新語意)(false 表示工具或規則有誤)
 * 並窮舉(上限 maxOrders)1.1.12 下「群組順序 × 各群組內權限順序」之所有儲存順序, legacyOrderSensitive 為 1.1.12 下不同順序是否得到不同授權
 * (上限內窮舉才為 true／false, 超過則 → null).
 *
 * @param {Array} users 輸入使用者列(含 cgrups)
 * @param {Array} grups 輸入群組列(含 name、cpemis)
 * @param {Array} pemis 輸入權限列(含 name、crules)
 * @param {Array} targets 輸入管理對象列(含 id)
 * @param {Object} [opt] 輸入設定物件, 預設 { maxOrders: 5000 }
 * @returns {Array} 回傳 [{ id, name, real, legacy, run04, lost, gained, lostByCde, gainedByCde, reasons, issues, fidelity, legacyOrderSensitive, orders }];
 *   單一使用者評估拋例外者改回 { id, name, error, … }(legacyOrderSensitive 為 undefined, 不計入「未窮舉」)
 */
export function auditUsers(users, grups, pemis, targets, opt = {}) {
    let maxOrders = opt.maxOrders || 5000
    let targetIds = targets.map((t) => t.id)
    let fact = (n) => (n <= 1 ? 1 : n * fact(n - 1))
    let auditOne = (user) => {
        let d = { user, grups, pemis, targets }
        let P = prepData(d)
        let memo = new Map()
        let ev = (key, flags) => {
            if (!memo.has(key)) {
                memo.set(key, expandTargets(evalKp(P, flags), targets))
            }
            return memo.get(key)
        }
        let spec = ev('spec', FLAGS.spec)
        let run04 = ev('run04', FLAGS.run04)
        let legacy = ev('legacy', FLAGS.legacy)
        //真函數(各使用者各用一份複本, 真函數若就地改動輸入亦不影響其他使用者)
        let out = getUserRules(user, JSON.parse(JSON.stringify(grups)), JSON.parse(JSON.stringify(pemis)), targets)
        let real = toMap(out.rules)
        let lost = targetIds.filter((t) => legacy[t] === 'y' && real[t] !== 'y')
        let gained = targetIds.filter((t) => legacy[t] !== 'y' && real[t] === 'y')
        let lostByCde = targetIds.filter((t) => run04[t] === 'y' && real[t] !== 'y')
        let gainedByCde = targetIds.filter((t) => run04[t] !== 'y' && real[t] === 'y')
        let causeOf = (t, want) => {
            let mins = []
            for (let s of CDE_SUBSETS) {
                if (mins.some((m) => m.every((x) => s.includes(x)))) {
                    continue
                }
                if (ev(s.join(''), flagsWith(FLAGS.run04, s))[t] === want) {
                    mins.push(s)
                }
            }
            return mins.map((s) => s.map((x) => CDE[x].code))
        }
        let reasons = {}
        lostByCde.forEach((t) => {
            reasons[t] = causeOf(t, 'n')
        })
        gainedByCde.forEach((t) => {
            reasons[t] = causeOf(t, 'y')
        })
        let issues = refIssues(d)
        let fidelity = targetIds.every((t) => real[t] === spec[t])
        //1.1.12 之順序窮舉: 群組項之順序 × 各群組項之權限項順序(不計入之項已排除; 1.1.12 同名取第一筆, 每項恰一個候選)
        let tree = treeOf(P, FLAGS.legacy)
        let nodeOf = (it) => it.cands[0]
        let total = fact(tree.items.length) * tree.items.reduce((a, it) => a * fact(nodeOf(it).items.length), 1)
        let legacyOrderSensitive = null
        if (total <= maxOrders) {
            let seen = new Set()
            let idx = (n) => Array.from({ length: n }, (_, i) => i)
            let recP = (k, acc, gOrder) => {
                if (k === gOrder.length) {
                    let items = gOrder.map((gi, j) => {
                        let it = tree.items[gi]
                        let node = nodeOf(it)
                        return { ...it, cands: [{ ...node, items: acc[j].map((pi) => node.items[pi]) }] }
                    })
                    let t2 = { items }
                    seen.add(fmtResult(expandTargets(mergeNode(t2, mergeLegacyItems), targets), targetIds))
                    return
                }
                permutations(idx(nodeOf(tree.items[gOrder[k]]).items.length)).forEach((po) => recP(k + 1, [...acc, po], gOrder))
            }
            permutations(idx(tree.items.length)).forEach((gOrder) => recP(0, [], gOrder))
            legacyOrderSensitive = seen.size > 1
        }
        return { id: user.id, name: user.name, real, legacy, run04, lost, gained, lostByCde, gainedByCde, reasons, issues, fidelity, legacyOrderSensitive, orders: total }
    }
    return users.map((user) => {
        try {
            return auditOne(user)
        }
        catch (err) {
            //單一使用者的資料無法評估(如 getUserRules 拋例外)不終止整份稽核, 於報告中列為 error(外審 sol R1)
            //legacyOrderSensitive 為 undefined(不是 null): null 專指「順序數超過上限而未窮舉」, 報告據以計「未窮舉 N 人」, error 列不得混入(增量外審 mmd-N4)
            return { id: user && user.id, name: user && user.name, error: String((err && err.message) || err), real: {}, legacy: {}, run04: {}, lost: [], gained: [], lostByCde: [], gainedByCde: [], reasons: {}, issues: [], fidelity: false, legacyOrderSensitive: undefined, orders: 0 }
        }
    })
}


/**
 * 稽核同名表列: 群組表／權限表有同名列(歷史同名; F-02 防新增). 新語意(R-PRINCIPLE-00 d)取各筆之交集; run04／1.1.12 取表中第一筆(結果取決於表列順序)
 *
 * @param {Array} grups 輸入群組列
 * @param {Array} pemis 輸入權限列
 * @returns {Object} 回傳 { grups: [{ name, count, sameContent }], pemis: [...] }; sameContent 為同名列之授權字串是否全相同(相同則取哪一筆、交集與否皆不影響結果)
 */
export function findNameConflicts(grups, pemis) {
    let scan = (rows, key) => {
        let by = new Map()
        rows.forEach((x) => {
            let n = String(x.name)
            by.set(n, [...(by.get(n) || []), x[key]])
        })
        return [...by.entries()].filter(([, v]) => v.length > 1).map(([name, v]) => ({ name, count: v.length, sameContent: v.every((c) => c === v[0]) }))
    }
    return { grups: scan(grups, 'cpemis'), pemis: scan(pemis, 'crules') }
}


/**
 * 稽核群組表／權限表名稱為空字串或非字串之列(外審 sol R2; 升級前外部同步可寫入, 現已由 R-SYNC-NAME-01 擋下新寫入)
 *
 * 伺服端以 === 比對名稱, 名稱為空字串者仍可被 cgrups／cpemis 的 '' 鍵對應而授權(或作為 AND 限制);
 * 編輯器自 run05 起保留空字串名稱之引用(R-PRINCIPLE-00 f), 但列名稱為空或非字串者在後台難以辨識與修正. 本函數只列出, 不處理.
 *
 * @param {Array} grups 輸入群組列
 * @param {Array} pemis 輸入權限列
 * @returns {Object} 回傳 { grups: [id…], pemis: [id…] }
 */
export function findEmptyNames(grups, pemis) {
    let scan = (rows) => rows.filter((x) => x && !(typeof x.name === 'string' && x.name !== '')).map((x) => x.id) //null 列(匯出檔壞資料)略過, 不使整份稽核中斷(增量外審 mmd-N6)
    return { grups: scan(grups || []), pemis: scan(pemis || []) }
}


// ---------------------------------------------------------------
// 規格之可讀字串
// ---------------------------------------------------------------

/** 規格之簡寫字串, 如 'G1(OR)[P1(AND){T2:y T3:y}, P2(AND){T1:y T2:y}]'; 懸空標「查無」, 同名多列以「|」分隔各列 */
export function fmtSpec(spec) {
    let m = (x) => (x.mode === undefined ? '缺' : String(x.mode)) + ((x.active === 'n') ? '/停用' : '') + ((x.inTable === false) ? '/查無' : '')
    let rs = (p) => (p.crulesRaw !== undefined ? JSON.stringify(p.crulesRaw) : rulesetLabel(p.rules || []))
    return spec.groups.map((g) => {
        let ps = (perms) => (perms || []).map((p) => `${p.name}(${m(p)}){${[p, ...(p.dupRows || [])].map(rs).join('|')}}`).join(', ')
        return `${g.name}(${m(g)})[${[{ perms: g.perms }, ...(g.dupRows || [])].map((x) => ps(x.perms)).join(' | ')}]`
    }).join(' ; ')
}

/** 解析授權字串(與 getUserRules 同為 JSON5), 供測試檢視實際寫出之字串 */
export function parseAuth(c) {
    return JSON5.parse(c)
}
