import { fmtWarn } from './getAuthWarn.mjs'
import getEffMode from './getEffMode.mjs'
import { REF_OF, keyOf, entName, decodeKp, listEntries } from './refCascade.mjs'


//清單頁「儲存」前之「新增撞懸空名」確認(F-23／F-26 run07 設計摘要原則 7; 規則帳本 R-PRINCIPLE-00 原則 3「遇衝突或歧義: 收嚴＋提示」、明確同意; 純函數, 不依賴 Vue／DOM／ORM):
//新增(id 不在基準)之群組／權限／標的, 其名稱(群組／權限為 name, 標的為 id)在基準內查無任何同名實體, 而仍有「啟用中之引用」指向該名稱(懸空引用: 使用者 cgrups、群組 cpemis、權限 crules)——
//新增後該引用即解到此新實體, 引用端(使用者／群組／權限)之授權隨之變多或受其限制(AND). 後台允許新增, 但須於送出前列出影響並由使用者按「是」才送出.
//引用之解碼、名稱比對鍵、被引用表與引用端之對應皆沿用 refCascade.mjs(REF_OF／decodeKp／listEntries／entName／keyOf, 與伺服端引用連帶同一套口徑);
//AND 之判定沿用 getEffMode(mode 缺或非 OR 者視為 AND, 與刪除確認框 countAndRefs 一致); 只有群組／權限之引用項有 mode, 標的之 crules 項目無 mode(mergeRules 之規則只取 isActive), 故標的之 nAnd 恆為 0.


//MAX_NAMES: 供顯示之名稱上限(同 getCascadePreview 之 joinList)
let MAX_NAMES = 5


//TEXT_KEY: 頁面種類 → 語系鍵(無 AND 句, 有 AND 句)
let TEXT_KEY = {
    Grup: ['confirmAddRefsGrup', 'confirmAddRefsAndGrup'],
    Pemi: ['confirmAddRefsPemi', 'confirmAddRefsAndPemi'],
    Target: ['confirmAddRefsTarget', ''],
}


let isStr = (v) => typeof v === 'string'
let isObj = (v) => v !== null && typeof v === 'object'
let hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k)


//toId: 列之 id 取字串形式(字串原樣; 有限數字取其字串, 同伺服端寫入前之主鍵正規化), 否則 null(視為無 id: 新列)
let toId = (r) => {
    let id = isObj(r) ? r.id : undefined
    if (isStr(id)) {
        return id
    }
    return (typeof id === 'number' && Number.isFinite(id)) ? String(id) : null
}


//showName: 名稱之顯示形式, 空字串顯示為 "" (否則文案中看不到, 同 getCascadePreview)
let showName = (v) => (v === '' ? '""' : String(v))


/**
 * 計算「本次新增且撞懸空名」對引用端之影響
 *
 * 新增列: rowsNew 中 id 不在 rowsOld 者(缺 id 者亦為新增; 有限數字 id 取字串形式比對). 撞懸空名: 新增列之名稱(群組／權限為 name〔缺欄視為 ''〕, 標的為 id)非字串者不計,
 * 其比對鍵(群組／權限為字串本身, 標的為屬性鍵轉型)在 rowsOld 內無任何同名實體(歷史同名、本次一併刪除或改名之舊列仍算有同名實體, 其引用之去留由刪除／改名流程確認);
 * 同一名稱多列新增只計一次. 引用端: holders 中授權字串(cgrups／cpemis／crules)解碼後, 有「isActive 為 'y' 且名稱指向該新名稱」之項目者(停用項目、壞 JSON、空字串、非容器皆不計; 含外部列).
 * nHolders 為受影響之引用端列數(一列引用多個新名稱只計一次); nAnd 為其中至少有一個此類引用項之有效模式為 AND 者(群組／權限; 標的恆為 0); names 為受影響之新名稱(依 rowsNew 次序、去重、至多 5 個), nNames 為其總數.
 *
 * @param {Object} p 輸入參數物件
 * @param {String} p.keyTable 輸入被新增之表, 'grups'(引用端 users.cgrups)、'pemis'(引用端 grups.cpemis)或 'targets'(引用端 pemis.crules); 其他回傳全 0
 * @param {Array} p.rowsOld 輸入基準列(store 之該表列, 已儲存者)
 * @param {Array} p.rowsNew 輸入欲送出之該表整表(清單目前之列; 標的頁為 reuseDeletedIds 正規化後之 rowsSend)
 * @param {Array} p.holders 輸入引用端表全部列(users／grups／pemis, 含外部列)
 * @returns {Object} 回傳 { nHolders, nAnd, names, nNames }
 * @example
 *
 * let r = getAddImpact({
 *     keyTable: 'grups',
 *     rowsOld: [],
 *     rowsNew: [{ id: 'g1', name: 'G1' }],
 *     holders: [{ id: 'u1', cgrups: '{"G1":{"mode":"AND","isActive":"y"}}' }],
 * })
 * console.log(r.nHolders, r.nAnd, r.names)
 * // => 1 1 [ 'G1' ]
 *
 */
function getAddImpact(p) {
    let res = { nHolders: 0, nAnd: 0, names: [], nNames: 0 }
    let p0 = isObj(p) ? p : {}
    let keyTable = p0.keyTable
    if (!isStr(keyTable) || !hasOwn(REF_OF, keyTable)) {
        return res
    }
    let ref = REF_OF[keyTable]
    let rowsOld = Array.isArray(p0.rowsOld) ? p0.rowsOld : []
    let rowsNew = Array.isArray(p0.rowsNew) ? p0.rowsNew : []
    let holders = Array.isArray(p0.holders) ? p0.holders : []

    //oldIds, keysOld: 基準之字串主鍵集合、基準名稱之比對鍵集合
    let oldIds = new Set()
    let keysOld = new Set()
    rowsOld.forEach((r) => {
        let id = toId(r)
        if (id !== null) {
            oldIds.add(id)
        }
        let k = keyOf(entName(r, keyTable), ref.kind)
        if (k !== null) {
            keysOld.add(k)
        }
    })

    //kpNew: 比對鍵 → 新名稱(新增列且基準無同名實體; Map 依 rowsNew 次序)
    let kpNew = new Map()
    rowsNew.forEach((r) => {
        if (!isObj(r)) {
            return
        }
        let id = toId(r)
        if (id !== null && oldIds.has(id)) {
            return //既有列(含改名), 非新增
        }
        let name = entName(r, keyTable)
        let k = keyOf(name, ref.kind)
        if (k === null || keysOld.has(k) || kpNew.has(k)) {
            return
        }
        kpNew.set(k, name)
    })
    if (kpNew.size === 0) {
        return res
    }

    //holders: 解碼各引用端之授權字串, 找啟用中且指向新名稱之項目
    let kpHit = new Set() //受影響之比對鍵
    holders.forEach((h) => {
        if (!isObj(h)) {
            return
        }
        let kp = decodeKp(h[ref.field])
        if (kp === null) {
            return
        }
        let isHit = false
        let isAnd = false
        listEntries(kp, ref.kind).forEach((e) => {
            if (e.key === null || !kpNew.has(e.key) || e.isActive !== 'y') {
                return
            }
            isHit = true
            kpHit.add(e.key)
            if (ref.kind === 'ref') {
                let mode = (e.isObj && hasOwn(e.el, 'mode')) ? e.el.mode : undefined
                if (getEffMode(mode) === 'AND') {
                    isAnd = true
                }
            }
        })
        if (isHit) {
            res.nHolders++
        }
        if (isAnd) {
            res.nAnd++
        }
    })

    //names: 受影響之新名稱(依 rowsNew 次序)
    let names = []
    kpNew.forEach((name, k) => {
        if (kpHit.has(k)) {
            names.push(name)
        }
    })
    res.nNames = names.length
    res.names = names.slice(0, MAX_NAMES)

    return res
}


/**
 * 新增撞懸空名之確認框文字: nHolders 為 0 回空字串(不彈框); 有 AND 引用者(群組／權限頁)選含 AND 句之語系鍵
 *
 * 文案依頁面種類選鍵: 'Grup'(群組頁, 引用端為使用者) confirmAddRefsGrup／confirmAddRefsAndGrup; 'Pemi'(權限頁, 引用端為群組) confirmAddRefsPemi／confirmAddRefsAndPemi;
 * 'Target'(標的頁, 引用端為權限) confirmAddRefsTarget(無 AND 句). 佔位符: {list} 為新名稱清單(至多 5 個, 超過附 cascadeListMore 之總數), {n} 為受影響之引用端數, {m} 為其中以 AND 引用者.
 * 單一框、單一問句(「確定新增？」). 種類不明回空字串.
 *
 * @param {Object} impact 輸入 getAddImpact 之結果 { nHolders, nAnd, names, nNames }
 * @param {Function} $t 輸入語系函數(key → 文字)
 * @param {String} kind 輸入頁面種類: 'Grup'、'Pemi' 或 'Target'
 * @returns {String} 回傳確認框文字, 無影響為空字串
 */
function getAddConfirmText(impact, $t, kind) {
    if (!isStr(kind) || !hasOwn(TEXT_KEY, kind)) {
        return ''
    }
    let n = (isObj(impact) && impact.nHolders > 0) ? impact.nHolders : 0
    if (n === 0) {
        return ''
    }
    let m = (impact.nAnd > 0 && TEXT_KEY[kind][1] !== '') ? Math.min(impact.nAnd, n) : 0
    let key = TEXT_KEY[kind][m > 0 ? 1 : 0]
    let names = Array.isArray(impact.names) ? impact.names : []
    let nNames = impact.nNames > names.length ? impact.nNames : names.length
    let list = names.map(showName).join(', ')
    if (nNames > names.length) {
        list = `${list} ${fmtWarn($t('cascadeListMore'), { n: nNames })}`
    }
    return fmtWarn($t(key), { n, m, list })
}


export { getAddImpact, getAddConfirmText }
export default getAddImpact
