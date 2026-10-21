import JSON5 from 'json5'
import cvKpToArr from './cvKpToArr.mjs'
import findRefRows from './findRefRows.mjs'
import getEffMode from './getEffMode.mjs'
import getPropKey from './getPropKey.mjs'
import isAuthMode from './isAuthMode.mjs'
import { REF_OF, rewriteRefs } from './refCascade.mjs'


//懸空引用稽核(升版一次性清理工具之核心; 規則帳本 R-REF-CASCADE-01 之配套, 適用表 n 上線前之舊資料可能已有懸空引用):
//  users.cgrups 引用不存在之群組名、grups.cpemis 引用不存在之權限名、pemis.crules 引用不存在之管控對象 id.
//  清理＝把懸空項目自授權字串移除(不論 isActive), 效果等同舊版「找不到即忽略」; 改寫一律經 refCascade.rewriteRefs(物件形式仍物件、陣列形式仍陣列、未命中者同一字串), 不另寫一套.
//本檔為純函數(不依賴 Vue／DOM／ORM), 供離線稽核(test/tools/authRefsAudit.mjs)、一次性清理(test/tools/authRefsClean.mjs／g_authRefsClean.mjs)與日後頁面共用.


//EFFECT: 懸空項目對授權之影響說明(item.effect 之碼 → 文字; 依 src/plugins/mShare.mjs 之 mergeRules, R-AUTH-MERGE-00／R-PRINCIPLE-00 c)
const EFFECT = {
    inactive: '停用項不參與授權合併, 移除不改變授權',
    and: '啟用且有效模式為 AND(含 mode 缺／非法): 引用查無實體者內容全 n, 使該層合併結果為空(收嚴); 清理後此限制解除, 授權可能變多',
    or: '啟用且為 OR: 引用查無實體者聯集貢獻 0; 惟若為同層唯一之 OR 項而同層另有合法 AND 項, 現況基底為空集(結果為空), 清理後基底改取 AND 項, 授權可能變多',
    rule: 'crules 查無之管控對象 id: 授權輸出只列現存管控對象, 不影響授權',
}


let isStr = (v) => typeof v === 'string'
let arr = (v) => (Array.isArray(v) ? v : [])


//mkIsDang: 建立「引用名稱查無實體」之判定函數(key → 是否懸空); grups／pemis 經 findRefRows(單一擁有者, 缺 name 視為 ''、===、歷史同名不是懸空, 同伺服端 getUserRules; 同一名稱只查一次,
//免使用者數 × 引用數 × 群組數之逐筆比對), targets 以 id 轉屬性鍵比對(同 mergeRules／getUserRules 之取值, 只收字串與數字之 id)
let mkIsDang = (rows, keyTable) => {
    if (keyTable === 'targets') {
        let s = new Set()
        arr(rows).forEach((r) => {
            if (r !== null && typeof r === 'object' && (isStr(r.id) || typeof r.id === 'number')) {
                let k = getPropKey(r.id)
                if (k !== null) {
                    s.add(k)
                }
            }
        })
        return (k) => !s.has(k)
    }
    let memo = new Map()
    return (k) => {
        if (!memo.has(k)) {
            memo.set(k, findRefRows(rows, k).length === 0)
        }
        return memo.get(k)
    }
}


//modeInfo: mode 之合法性(isAuthMode)與有效模式是否為 OR(getEffMode; mode 缺或非法者有效模式為 AND, 只作限制項, 見 mergeRules)
let modeInfo = (m) => ({ valid: isAuthMode(m), isOr: getEffMode(m) === 'OR' })


//decode: 授權字串 → { state, ents }; 'empty'(非字串或空白, 新增列之預設值, 非損壞)、'bad'(JSON5 解析失敗, 或解出非物件／陣列, 同 getAuthWarn.isBadData; reason 為 parse／notContainer／decode)、'ok'(ents 為 cvKpToArr 之解碼)
let decode = (str) => {
    if (!isStr(str) || str.trim() === '') {
        return { state: 'empty', ents: [] }
    }
    let kp = null
    try {
        kp = JSON5.parse(str)
    }
    catch (err) {
        return { state: 'bad', reason: 'parse', ents: [] }
    }
    if (kp === null || typeof kp !== 'object') {
        return { state: 'bad', reason: 'notContainer', ents: [] }
    }
    try {
        return { state: 'ok', reason: '', ents: cvKpToArr(kp) }
    }
    catch (err) {
        return { state: 'bad', reason: 'decode', ents: [] }
    }
}


//maybeNonEmpty: 同層啟用項(es: [{ valid, isOr, zero }], 見 modeInfo)合併結果「可能非空」否, 依 mergeRules 之結構, 內容未知之實體項視為可能非空, zero 者(查無實體之懸空項, 或名稱非字串而不對應任何實體者)內容恆空:
//  沒有任何 mode 合法(OR／AND)之項 → 恆空; 任一 AND 有效項(含 mode 缺／非法, 只作限制)為 zero → 恆空(交集含空集); 有 OR 項時須至少一個 OR 項非 zero(聯集), 無 OR 項時以合法 AND 項為基底即可
let maybeNonEmpty = (es) => {
    if (!es.some((e) => e.valid)) {
        return false
    }
    if (es.some((e) => !e.isOr && e.zero)) {
        return false
    }
    if (es.some((e) => e.isOr)) {
        return es.some((e) => e.isOr && !e.zero)
    }
    return true
}


/**
 * 稽核引用端授權字串中查無實體(懸空)之引用, 並產生清理後之新字串(純函數, 不讀寫任何資料)
 *
 * 懸空判準同伺服端 findRefRows: cgrups／cpemis 以名稱 === 比對 grups／pemis 之 name(缺 name 視為 ''), 歷史同名(名稱對到多列)不是懸空;
 * crules 之項目名稱以 getPropKey 轉屬性鍵後與 targets.id 比對. 解碼用 cvKpToArr(與伺服端 getUserRules 同一份); JSON5 解析失敗(或非物件／陣列)者列入 badJson, 不當作有引用、不動.
 * 名稱非字串(陣列元素無 name、name 為數字或陣列等)之 cgrups／cpemis 項目不對應任何群組／權限名, 無法以名稱處置, 列入 unnamed(不清理, 須人工於後台處理; 編輯器對其亦拒存).
 * 清理移除懸空項目不論 isActive; 不回顯 email／name 等個資(只列主鍵 id 與被引用之名稱).
 *
 * 清理後授權之變化(對照 mergeRules): 停用項、crules 項不影響授權; 啟用之 AND 項(含 mode 缺／非法)使該層結果為空, 清理後限制解除;
 * 啟用之 OR 項聯集貢獻 0, 但若為同層唯一之 OR 項且同層另有合法 AND 項, 現況基底為空集, 清理後基底改取 AND 項. 以上皆只會放寬(授權變多), 不會收嚴.
 * widen 以結構判定「可能變多」之引用端(實際是否變多取決於各實體內容, 為保守上界): users 含直接(自身 cgrups)與經群組傳導(啟用引用之群組其 cpemis 可能變多).
 *
 * @param {Object} d 輸入 { users, grups, pemis, targets }(各為列陣列, 缺者視為空)
 * @returns {Object} 回傳 { items, counts, changes, badJson, unnamed, unsafe, noId, widen }:
 *   items    懸空項目 [{ table(users|grups|pemis), holderId, field, name, isActive, mode, effect }], effect 為 EFFECT 之碼(inactive|and|or|rule), mode 於 crules 為 null
 *   counts   { nItems, nActive, nInactive, nAndActive, nOrActive, nBadJson, nUnnamed, nNoId, nChanges, nAndActiveHolders, nWidenUsers, nWidenGrups,
 *              byTable: { users|grups|pemis: { nItems, nHolders, nAndActive, nAndActiveHolders, nWidenHolders } } }; nAndActive 為啟用且有效模式為 AND 之懸空項數(ref 類), nAndActiveHolders 為擁有該類項目之使用者與群組列數
 *   changes  [{ table, id, field, before, after, nDel }], after 為清理後新字串(經 rewriteRefs)
 *   badJson  [{ table, id, field, reason }]; unnamed 為 [{ table, holderId, field, isActive, mode }]; unsafe 為含無法安全重新編碼之內容(如 JSON5 Infinity／NaN 數值, 重新編碼會變成 null 而改指別的規則名)故不清理之 [{ table, id, field }](須人工處理); noId 為缺字串主鍵而無從寫回之 [{ table, holderId, field, nItems }]
 *   widen    [{ table(users|grups), holderId, field, via(direct|grups) }]
 * @example
 *
 * let r = auditRefs({
 *     users: [{ id: 'u1', cgrups: '{"G":{"mode":"AND","isActive":"y"},"X":{"mode":"AND","isActive":"y"}}' }],
 *     grups: [{ id: 'g1', name: 'G', cpemis: '{}' }],
 *     pemis: [],
 *     targets: [],
 * })
 * console.log(r.items[0].name, r.changes[0].after)
 * // => X {"G":{"mode":"AND","isActive":"y"}}
 *
 */
function auditRefs(d) {
    let data = (d !== null && typeof d === 'object') ? d : {}
    let items = []
    let changes = []
    let badJson = []
    let unnamed = []
    let unsafe = [] //含無法安全重新編碼之內容(如 JSON5 之 Infinity／NaN 數值)而不改寫之容器
    let noId = []
    let widen = []
    let byTable = {}

    //userRefs: 各使用者啟用引用之群組名(供經群組傳導之 widen); flagGrupNames: 有 widen 之群組列之名稱
    let userRefs = []
    let flagGrupNames = new Set()
    let flagUsers = new Set()

    for (let key of Object.keys(REF_OF)) {
        let sp = REF_OF[key]
        let t = sp.holder
        let isRule = sp.kind === 'rule'
        let isDangName = mkIsDang(data[key], key)
        let tab = { nItems: 0, nHolders: 0, nAndActive: 0, nAndActiveHolders: 0, nWidenHolders: 0 }
        byTable[t] = tab

        for (let h of arr(data[t])) {
            if (h === null || typeof h !== 'object') {
                continue
            }
            let str = h[sp.field]
            let dc = decode(str)
            if (dc.state === 'bad') {
                badJson.push({ table: t, id: h.id, field: sp.field, reason: dc.reason })
                continue
            }

            //逐項: 懸空(dang)、名稱非字串(unnamed, 仍參與合併而內容恆空)、其餘(實體存在)
            let dang = []
            let es = []
            let activeNames = []
            for (let e of dc.ents) {
                let active = e.isActive === 'y'
                let k = null
                if (isRule) {
                    k = getPropKey(e.name)
                    if (k === null) {
                        continue //屬性鍵轉型必拋者, 伺服端 mergeRules 略過, 不對應任何標的
                    }
                }
                else {
                    if (!isStr(e.name)) {
                        unnamed.push({ table: t, holderId: h.id, field: sp.field, isActive: e.isActive, mode: e.mode })
                        es.push({ ...modeInfo(e.mode), active, zero: true, dang: false })
                        continue
                    }
                    k = e.name
                }
                let isDang = isDangName(k)
                if (!isRule) {
                    es.push({ ...modeInfo(e.mode), active, zero: isDang, dang: isDang })
                    if (active) {
                        activeNames.push(k)
                    }
                }
                if (isDang) {
                    dang.push({ key: k, e, active })
                }
            }
            if (t === 'users' && isStr(h.id)) {
                userRefs.push({ id: h.id, names: activeNames })
            }
            if (dang.length === 0) {
                continue
            }
            if (!isStr(h.id)) {
                noId.push({ table: t, holderId: h.id, field: sp.field, nItems: dang.length })
                continue
            }

            //items
            let nAnd = 0
            for (let x of dang) {
                let effect = 'rule'
                if (!isRule) {
                    effect = !x.active ? 'inactive' : (modeInfo(x.e.mode).isOr ? 'or' : 'and')
                }
                if (effect === 'and') {
                    nAnd++
                }
                items.push({ table: t, holderId: h.id, field: sp.field, name: x.key, isActive: x.e.isActive, mode: isRule ? null : x.e.mode, effect })
            }
            tab.nItems += dang.length
            tab.nHolders++
            tab.nAndActive += nAnd
            if (nAnd > 0) {
                tab.nAndActiveHolders++
            }

            //changes: 以 refCascade.rewriteRefs 移除該容器內之懸空名稱(不論 isActive; 歷史同名非懸空不在集合內)
            let r = rewriteRefs(str, { kind: sp.kind, del: new Set(dang.map((x) => x.key)) })
            if (r.unsafe) {
                unsafe.push({ table: t, id: h.id, field: sp.field })
            }
            else if (r.changed) {
                changes.push({ table: t, id: h.id, field: sp.field, before: str, after: r.str, nDel: r.nDel })
            }

            //widen: 同層啟用項, 現況合併結果必為空而清理後可能非空
            if (!isRule) {
                let A = es.filter((x) => x.active)
                let R = A.filter((x) => !x.dang)
                if (A.some((x) => x.dang) && !maybeNonEmpty(A) && maybeNonEmpty(R)) {
                    widen.push({ table: t, holderId: h.id, field: sp.field, via: 'direct' })
                    tab.nWidenHolders++
                    if (t === 'grups') {
                        flagGrupNames.add(h.name === undefined ? '' : h.name)
                    }
                    if (t === 'users') {
                        flagUsers.add(h.id)
                    }
                }
            }
        }
    }

    //經群組傳導: 使用者啟用引用某群組名, 該名稱之群組列有 widen(其 cpemis 清理後授權可能變多)
    if (flagGrupNames.size > 0) {
        for (let u of userRefs) {
            if (!flagUsers.has(u.id) && u.names.some((n) => flagGrupNames.has(n))) {
                widen.push({ table: 'users', holderId: u.id, field: 'cgrups', via: 'grups' })
                byTable.users.nWidenHolders++
            }
        }
    }

    let refItems = items.filter((x) => x.effect !== 'rule')
    let counts = {
        nItems: items.length,
        nActive: refItems.filter((x) => x.effect !== 'inactive').length,
        nInactive: refItems.filter((x) => x.effect === 'inactive').length,
        nAndActive: refItems.filter((x) => x.effect === 'and').length,
        nOrActive: refItems.filter((x) => x.effect === 'or').length,
        nBadJson: badJson.length,
        nUnnamed: unnamed.length,
        nUnsafe: unsafe.length,
        nNoId: noId.length,
        nChanges: changes.length,
        nAndActiveHolders: byTable.users.nAndActiveHolders + byTable.grups.nAndActiveHolders,
        nWidenUsers: byTable.users.nWidenHolders,
        nWidenGrups: byTable.grups.nWidenHolders,
        byTable,
    }

    return { items, counts, changes, badJson, unnamed, unsafe, noId, widen }
}


export { EFFECT, auditRefs }
export default auditRefs
