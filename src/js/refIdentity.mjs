import { REF_OF, keyOf, entName, decodeKp, listEntries } from './refCascade.mjs'
import { checkSubject } from './draftSync.mjs'


//正反向關聯之「被引用實體身分」檢查(perm-run02 範圍一; 使用者 2026-10-23 裁示「正反關聯與主體身份檢查, 應該是前後端都要做」; R-PRINCIPLE-00 原則 4、6; 規則帳本 R-SUBJECT-ID-01、R-REF-IDENTITY-01; ADR-037 Update(perm-run02)):
//授權以**名稱**引用他表實體(users.cgrups→grups.name、grups.cpemis→pemis.name、pemis.crules→targets.id), 被引用實體於使用者編輯期間被刪除後以同名重建(id 不同), 存檔時引用會靜默指向新實體(被同名新資料接管).
//本檔為純函數(不依賴 Vue／DOM／ORM), 前端(送出前自檢、組宣告)與伺服端(updateTabItems 於引用表鎖內以新鮮讀取驗證)共用同一份判準, 單一擁有者:
//  ①反向對話框之主體: opt.subject = { id, name, saved }(開框時之主體摘要), 判準即 draftSync.checkSubject(伺服端以引用表之新鮮讀取呼叫);
//  ②清單頁指派欄之正向引用: opt.refs = [{ name, ids }](本次新增之啟用引用項, 其名稱在使用者**選取當時**對應之實體 id 陣列; 空陣列＝選取當時查無該名稱), 伺服端於引用表鎖內重算名稱對應之 id 陣列, 須逐名稱相等.
//「新增之啟用引用項」＝列之授權字串內 isActive 為 'y' 的項目, 其名稱不在該列舊值之啟用項內(停用項目不授權, 不入; 未變更之舊引用不入: 它們是已持久之關係, 刪除時引用連帶已清理).
//相容: 未帶 subject／refs 者(外部應用、舊客戶端)維持原行為(名稱引用、不驗身分; 不擴權: 不比原行為多放行任何寫入); 帶了但格式不合或不符一律拒收(不降級為不帶, 原則 1、3).
//targets 之 id 即名稱(主鍵＝標的名稱, 外部同步每次以同 id 重寫列), 故其身分定義即 id: 檢查涵蓋「已被刪除」, 刪除後同 id 重建依定義是同一實體(見 R-REF-IDENTITY-01 規則 5).


let hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k)
let isStr = (v) => typeof v === 'string'
let isPlain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)


//MAX_DECL／MAX_IDS: 宣告筆數與每名稱之 id 數上限(防濫用; 正常使用遠小於此)
let MAX_DECL = 5000
let MAX_IDS = 1000


//REF_TARGET_OF: 引用端表 → { table: 被引用表, field: 授權欄, kind }(REF_OF 之反向; users→grups、grups→pemis、pemis→targets; targets 無)
let REF_TARGET_OF = Object.create(null)
Object.keys(REF_OF).forEach((t) => {
    REF_TARGET_OF[REF_OF[t].holder] = { table: t, field: REF_OF[t].field, kind: REF_OF[t].kind }
})


/**
 * 取引用端表之被引用表資訊
 *
 * @param {String} keyTable 輸入引用端表名(users／grups／pemis)
 * @returns {Object|null} 回傳 { table, field, kind }; 該表無授權引用欄(如 targets)或表名不識回 null
 */
function getRefTarget(keyTable) {
    return (isStr(keyTable) && hasOwn(REF_TARGET_OF, keyTable)) ? REF_TARGET_OF[keyTable] : null
}


//toId: 列之 id 取字串形式(字串原樣; 有限數字取其字串, 同伺服端寫入前之主鍵正規化), 否則 null
let toId = (r) => {
    let id = isPlain(r) ? r.id : undefined
    if (isStr(id)) {
        return id
    }
    return (typeof id === 'number' && Number.isFinite(id)) ? String(id) : null
}


/**
 * 授權字串內「啟用中」之引用名稱集合(isActive 為 'y' 者; 壞 JSON、空字串、非容器皆不計; cgrups／cpemis('ref')之非字串名稱不計, crules('rule')之名稱依屬性鍵轉型〔getPropKey, 如數字 5 → '5'〕計入, 與伺服端 mergeRules 之比對鍵口徑一致)
 *
 * @param {String} str 輸入授權字串(JSON5)
 * @param {String} kind 輸入引用種類, 'ref'(cgrups／cpemis)或 'rule'(crules)
 * @returns {Set} 回傳名稱(比對鍵)集合
 */
function activeNames(str, kind) {
    let kp = decodeKp(str)
    let out = new Set()
    if (kp === null) {
        return out
    }
    listEntries(kp, kind).forEach((e) => {
        if (e.key !== null && e.isActive === 'y') {
            out.add(e.key)
        }
    })
    return out
}


/**
 * 一列相對舊值「新增之啟用引用名稱」(新值啟用項 − 舊值啟用項); 舊值為 null(新增列)時為新值之全部啟用項
 *
 * @param {String} keyTable 輸入引用端表名
 * @param {Object|null} rowOld 輸入舊列(null 為新增)
 * @param {Object} rowNew 輸入新列
 * @returns {Array} 回傳名稱陣列(依新值內之次序、去重)
 */
function newActiveNames(keyTable, rowOld, rowNew) {
    let t = getRefTarget(keyTable)
    if (t === null || !isPlain(rowNew)) {
        return []
    }
    let was = isPlain(rowOld) ? activeNames(rowOld[t.field], t.kind) : new Set()
    let out = []
    activeNames(rowNew[t.field], t.kind).forEach((n) => {
        if (!was.has(n)) {
            out.push(n)
        }
    })
    return out
}


/**
 * 多列相對舊表(以 id 對應)新增之啟用引用名稱集合
 *
 * @param {Object} p 輸入參數物件
 * @param {String} p.keyTable 輸入引用端表名
 * @param {Array} p.rowsNew 輸入新列陣列(整表或僅改動列皆可)
 * @param {Array} p.rowsOld 輸入舊表列陣列(同一版本: 前端為草稿載入時之列, 伺服端為鎖內新鮮讀取)
 * @returns {Set} 回傳名稱集合
 */
function collectNewNames({ keyTable, rowsNew, rowsOld }) {
    let byId = new Map()
    ;(Array.isArray(rowsOld) ? rowsOld : []).forEach((r) => {
        let id = toId(r)
        if (id !== null) {
            byId.set(id, r)
        }
    })
    let out = new Set()
    ;(Array.isArray(rowsNew) ? rowsNew : []).forEach((r) => {
        let id = toId(r)
        let old = (id !== null && byId.has(id)) ? byId.get(id) : null
        newActiveNames(keyTable, old, r).forEach((n) => out.add(n))
    })
    return out
}


/**
 * 被引用表內與名稱對應之實體 id 陣列(排序、去重; 空陣列＝查無; 歷史同名多列則多個)
 *
 * @param {Array} refRows 輸入被引用表列
 * @param {String} refTable 輸入被引用表名(grups／pemis／targets)
 * @param {String} name 輸入引用名稱(比對鍵)
 * @returns {Array} 回傳 id 字串陣列
 */
function idsOfName(refRows, refTable, name) {
    let s = new Set()
    ;(Array.isArray(refRows) ? refRows : []).forEach((r) => {
        let n = entName(r, refTable)
        let id = toId(r)
        if (n !== null && id !== null && keyOf(n, refTable === 'targets' ? 'rule' : 'ref') === name) {
            s.add(id)
        }
    })
    return [...s].sort()
}


/**
 * 以被引用表目前之列建「名稱 → id 陣列」快照(使用者開啟編輯器當下呼叫; 之後由 recordPicks 取用)
 *
 * @param {String} keyTable 輸入引用端表名
 * @param {Array} refRows 輸入被引用表列(前端 store 的 grups／pemis／targets)
 * @returns {Map} 回傳 Map(名稱 → id 陣列)
 */
function snapRefIds(keyTable, refRows) {
    let t = getRefTarget(keyTable)
    let m = new Map()
    if (t === null) {
        return m
    }
    ;(Array.isArray(refRows) ? refRows : []).forEach((r) => {
        let n = entName(r, t.table)
        if (n === null) {
            return
        }
        let k = keyOf(n, t.kind)
        if (k !== null && !m.has(k)) {
            m.set(k, idsOfName(refRows, t.table, k))
        }
    })
    return m
}


/**
 * 編輯器回填授權字串時, 記下本次「新增之啟用引用名稱」在編輯器開啟當下對應之 id(就地更新 picks)
 *
 * 查無者記空陣列(編輯器開啟當下被引用表無此名稱: 懸空引用, 伺服端須仍查無)。
 *
 * 選取記錄以名稱為鍵(跨列共用)。同一名稱先後被選取(不同列, 或同列取消後重選)而當時對應之 id 陣列不同, 代表被引用實體在兩次選取之間被替換過——
 * 兩次選取不可能同時與「現在」一致(至少一次已過期), 故該名稱記為衝突(值 null), 組宣告時令宣告無效而前端自檢不放行(收嚴; 外審 sol#1: 不同列之同名選取互相覆蓋快照, 使先前選取之授權被同名新實體接管)。
 * 衝突之名稱在草稿重建(放棄未存編輯)前不會自行解除; 對應 id 陣列相同之重複選取不是衝突。
 *
 * @param {Object} p 輸入參數物件
 * @param {String} p.keyTable 輸入引用端表名
 * @param {String} p.strOld 輸入該列回填前之授權字串
 * @param {String} p.strNew 輸入編輯器回傳之授權字串
 * @param {Map} p.snap 輸入 snapRefIds 於編輯器開啟當下之結果
 * @param {Map} p.picks 輸入累積之選取記錄(就地更新; 值為 id 陣列, 衝突為 null)
 * @returns {Map} 回傳 picks
 */
function recordPicks({ keyTable, strOld, strNew, snap, picks }) {
    let t = getRefTarget(keyTable)
    if (t === null || !(picks instanceof Map)) {
        return picks
    }
    let was = activeNames(strOld, t.kind)
    activeNames(strNew, t.kind).forEach((n) => {
        if (!was.has(n)) {
            let ids = [...((snap instanceof Map && snap.has(n)) ? snap.get(n) : [])].sort()
            if (picks.has(n) && (picks.get(n) === null || !sameIds([...picks.get(n)].sort(), ids))) {
                picks.set(n, null) //衝突: 同名兩次選取當時對應不同實體
            }
            else {
                picks.set(n, ids)
            }
        }
    })
    return picks
}


/**
 * 組存檔時送伺服端之引用身分宣告 opt.refs: 本次新增之啟用引用名稱, 各附選取當時對應之 id 陣列
 *
 * 選取記錄(picks)沒有的名稱(複製列、貼上等未經編輯器回填的路徑)退回以送出當下之被引用表為準(只涵蓋送出到寫入之窗口)。
 * 選取記錄為衝突(null, 見 recordPicks)之名稱, 其 ids 為 null: 此宣告無法通過 parseRefDecl／countRefMismatch, 前端自檢拒收(伺服端亦以格式不合拒收)。
 *
 * @param {Object} p 輸入參數物件
 * @param {String} p.keyTable 輸入引用端表名
 * @param {Array} p.rowsNew 輸入欲送出之整表
 * @param {Array} p.rowsOld 輸入草稿載入時之列(前端 baseRows)
 * @param {Map} p.picks 輸入選取記錄
 * @param {Array} p.refRows 輸入送出當下之被引用表列
 * @returns {Array} 回傳 [{ name, ids }](依名稱排序; 無新增引用為空陣列; 衝突名稱之 ids 為 null)
 */
function buildRefDecl({ keyTable, rowsNew, rowsOld, picks, refRows }) {
    let t = getRefTarget(keyTable)
    if (t === null) {
        return []
    }
    let names = [...collectNewNames({ keyTable, rowsNew, rowsOld })].sort()
    return names.map((name) => {
        if (picks instanceof Map && picks.has(name)) {
            let v = picks.get(name)
            return { name, ids: v === null ? null : [...v] }
        }
        return { name, ids: idsOfName(refRows, t.table, name) }
    })
}


/**
 * 驗證並正規化主體摘要 opt.subject = { id, name, saved }
 *
 * @param {*} raw 輸入任何值(伺服端來自用戶端 JSON)
 * @returns {Object|null} 回傳 { id, name, saved }; 格式不合回 null
 */
function parseSubject(raw) {
    if (!isPlain(raw) || !isStr(raw.id) || raw.id === '' || !isStr(raw.name) || raw.name === '' || typeof raw.saved !== 'boolean') {
        return null
    }
    return { id: raw.id, name: raw.name, saved: raw.saved }
}


/**
 * 驗證並正規化引用身分宣告 opt.refs = [{ name, ids }]
 *
 * @param {*} raw 輸入任何值(伺服端來自用戶端 JSON)
 * @returns {Array|null} 回傳 [{ name, ids }](ids 排序去重); 格式不合(非陣列、超量、名稱非字串、重複名稱、ids 非字串陣列)回 null
 */
function parseRefDecl(raw) {
    if (!Array.isArray(raw) || raw.length > MAX_DECL) {
        return null
    }
    let seen = new Set()
    let out = []
    for (let d of raw) {
        if (!isPlain(d) || !isStr(d.name) || seen.has(d.name) || !Array.isArray(d.ids) || d.ids.length > MAX_IDS || !d.ids.every(isStr)) {
            return null
        }
        seen.add(d.name)
        out.push({ name: d.name, ids: [...new Set(d.ids)].sort() })
    }
    return out
}


let sameIds = (a, b) => a.length === b.length && a.every((v, k) => v === b[k])


/**
 * 宣告之各名稱在被引用表目前對應之 id 陣列是否仍與宣告相同; 回傳不符之名稱數(供前端送出前自檢與伺服端共用)
 *
 * @param {Object} p 輸入參數物件
 * @param {String} p.keyTable 輸入引用端表名
 * @param {Array} p.decl 輸入已正規化之宣告
 * @param {Array} p.refRows 輸入被引用表目前之列(伺服端為鎖內新鮮讀取, 前端為 store)
 * @returns {Number} 回傳不符名稱數(0 為全部相符)
 */
function countRefMismatch({ keyTable, decl, refRows }) {
    let t = getRefTarget(keyTable)
    if (!Array.isArray(decl) || t === null) {
        return Array.isArray(decl) ? decl.length : 1 //宣告無效(非陣列)或該表無授權引用欄: 視為不符(收嚴)
    }
    return decl.filter((d) => !sameIds(idsOfName(refRows, t.table, d.name), d.ids)).length
}


/**
 * 伺服端: 寫入前驗證正向引用之身分(引用表鎖內, refRows 為新鮮讀取)
 *
 * ①宣告之每個名稱, 目前對應之 id 陣列須與宣告相同(被刪除、被刪除後同名重建〔id 不同〕、新增了同名實體皆不符);
 * ②宣告須完整: 本次寫入之列相對舊表新增之啟用引用名稱, 每個都須在宣告內(宣告不完整即拒, 免用戶端漏報)。
 *
 * @param {Object} p 輸入參數物件
 * @param {String} p.keyTable 輸入引用端表名
 * @param {Array} p.decl 輸入已正規化之宣告(parseRefDecl)
 * @param {Array} p.rowsNew 輸入本次將寫入之列(新增列＋改動列)
 * @param {Array} p.rowsOld 輸入鎖內新鮮讀取之引用端表舊列
 * @param {Array} p.refRows 輸入鎖內新鮮讀取之被引用表列
 * @returns {Object|null} 回傳 null 為通過; 否則 { key, reason, n }(key 為語系鍵 saveRefChanged／saveIdentityFormat; reason 為 refChanged／refIncomplete／refNoTarget)
 */
function checkRefIdentity({ keyTable, decl, rowsNew, rowsOld, refRows }) {
    let t = getRefTarget(keyTable)
    if (t === null) {
        return { key: 'saveIdentityFormat', reason: 'refNoTarget', n: 0 }
    }
    let n = countRefMismatch({ keyTable, decl, refRows })
    if (n > 0) {
        return { key: 'saveRefChanged', reason: 'refChanged', n }
    }
    let declared = new Set(decl.map((d) => d.name))
    let miss = [...collectNewNames({ keyTable, rowsNew, rowsOld })].filter((name) => !declared.has(name))
    if (miss.length > 0) {
        return { key: 'saveRefChanged', reason: 'refIncomplete', n: miss.length }
    }
    return null
}


/**
 * 伺服端: 驗證反向對話框之主體身分(引用表鎖內, refRows 為新鮮讀取; 判準即 draftSync.checkSubject)
 *
 * @param {Object} p 輸入參數物件
 * @param {Object} p.subject 輸入已正規化之主體摘要(parseSubject)
 * @param {Array} p.refRows 輸入主體表(grups／pemis)目前之列
 * @returns {Object|null} 回傳 null 為通過; 否則 { key: 'saveSubjectChanged', reason }(reason 為 gone／renamed／taken／noSubject)
 */
function checkSubjectIdentity({ subject, refRows }) {
    let sc = checkSubject({ subject, rows: refRows })
    return sc === 'ok' ? null : { key: 'saveSubjectChanged', reason: sc }
}


export {
    getRefTarget, activeNames, newActiveNames, collectNewNames, idsOfName, snapRefIds, recordPicks, buildRefDecl,
    parseSubject, parseRefDecl, countRefMismatch, checkRefIdentity, checkSubjectIdentity,
}
