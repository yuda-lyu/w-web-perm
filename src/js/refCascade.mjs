import JSON5 from 'json5'
import iseobj from 'wsemi/src/iseobj.mjs'
import getPropKey from './getPropKey.mjs'


//引用連帶(規則帳本 R-PRINCIPLE-00 原則 6、適用表 m／n; R-REF-CASCADE-01; ADR-036): 群組／權限／標的「改名」或「被刪除」時, 引用它之授權字串須於同一次寫入內連帶更新:
//  users.cgrups(引用 grups.name)、grups.cpemis(引用 pemis.name)、pemis.crules(引用 targets.id)
//本檔為純函數(不依賴 Vue／DOM／ORM), 伺服端寫入(server/procCore.mjs、server/WWebPerm.mjs 之外部同步)與前端預覽／刪除確認框(src/components 三個清單頁)共用同一份規劃(R-REF-CASCADE-01: 預覽與伺服端計畫同一純函數)


//REF_OF: 被引用表 → 引用端表與欄位; kind 為引用名稱之比對方式('ref': cgrups／cpemis 以 === 比對字串名稱; 'rule': crules 以屬性鍵轉型後比對, 與伺服端 mergeRules 同)
let REF_OF = {
    grups: { holder: 'users', field: 'cgrups', kind: 'ref' },
    pemis: { holder: 'grups', field: 'cpemis', kind: 'ref' },
    targets: { holder: 'pemis', field: 'crules', kind: 'rule' },
}


let isStr = (v) => typeof v === 'string'
let hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k)


//keyOf: 引用名稱 → 比對鍵; 'ref' 只認字串(非字串名稱以 === 比對不到任何實體, 不動), 'rule' 與伺服端 mergeRules 同取屬性鍵轉型(R-KEY-PROP-01)
let keyOf = (name, kind) => {
    if (kind === 'rule') {
        return getPropKey(name)
    }
    return isStr(name) ? name : null
}


//entName: 被引用表列之名稱(grups／pemis 為 name, 缺欄視為 ''(同 findRefRows); targets 為 id), 非字串回 null
let entName = (r, keyTable) => {
    if (r === null || typeof r !== 'object') {
        return null
    }
    let n = (keyTable === 'targets') ? r.id : (r.name === undefined ? '' : r.name)
    return isStr(n) ? n : null
}


//decodeKp: 授權字串 → JSON5 解析結果(物件或陣列), 空字串／壞 JSON／純量回 null(伺服端 cvStrToArr 同為視為空容器, 不動)
let decodeKp = (str) => {
    if (!isStr(str) || str.trim() === '') {
        return null
    }
    let kp = null
    try {
        kp = JSON5.parse(str)
    }
    catch (err) {
        return null
    }
    return (kp !== null && typeof kp === 'object') ? kp : null
}


//listEntries: 容器內所有項目(含停用者)之 { key: 比對鍵, el: 原值, i: 物件形式之外層鍵或陣列索引, isObj, isActive }; 物件形式以外層鍵為名, 陣列形式以元素之 name 為名(非物件或無 name 之元素以索引為名, 同 cvKpToArr)
let listEntries = (kp, kind) => {
    let rs = []
    if (Array.isArray(kp)) {
        kp.forEach((el, i) => {
            let name = (iseobj(el) && hasOwn(el, 'name')) ? el.name : i
            rs.push({ key: keyOf(name, kind), el, i, isObj: iseobj(el), isActive: iseobj(el) ? el.isActive : el })
        })
        return rs
    }
    Object.keys(kp).forEach((k) => {
        let v = kp[k]
        rs.push({ key: keyOf(k, kind), el: v, i: k, isObj: iseobj(v), isActive: iseobj(v) ? v.isActive : v })
    })
    return rs
}


//hasNonFinite: 解析結果內是否有非有限數值(Infinity、-Infinity、NaN; JSON5 可寫, JSON.stringify 會編成 null)
let hasNonFinite = (v) => {
    if (typeof v === 'number') {
        return !Number.isFinite(v)
    }
    if (v !== null && typeof v === 'object') {
        return Object.keys(v).some((k) => hasNonFinite(v[k]))
    }
    return false
}


/**
 * 改寫一個授權字串(cgrups／cpemis／crules)內對被改名／被刪除者之引用
 *
 * 同時套用所有改名與刪除(互換 A↔B、鏈式 A→B 且 B→C 皆正確, 不逐一套用); 先判刪除、再判改名. 物件形式(以名稱為鍵)仍輸出物件形式、陣列形式仍輸出陣列形式(不互轉, 免有損),
 * 其餘項目(含值內之 mode／isActive／額外欄位)原樣; 未命中任何改名或刪除者「同一字串原樣回傳」(不重新編碼, 保留註解與排版); 命中者以 JSON.stringify 重新編碼(註解與單引號不保留).
 * 壞 JSON／空字串／非容器視為空容器不動(與伺服端 cvStrToArr 容錯一致).
 * unsafe: 容器內含無法原樣重新編碼之值(JSON5 Infinity／NaN 數值)而命中須改寫時, 不改寫(str 原樣、changed 為 false)並回報 true.
 * conflict: 改名後新名與容器內另一個(未被一併改走或刪除之)同名項目相撞——自動改寫會與既有引用混成一項, 不改寫並回報(上層整次拒存).
 *
 * @param {String} str 輸入授權字串(JSON5)
 * @param {Object} [opt={}] 輸入設定物件
 * @param {String} [opt.kind='ref'] 輸入引用種類, 'ref'(cgrups／cpemis)或 'rule'(crules)
 * @param {Map} [opt.rename] 輸入改名對映 Map(舊名 → 新名), 預設空
 * @param {Set} [opt.del] 輸入被刪除之名稱 Set, 預設空
 * @returns {Object} 回傳 { str, changed, nRename, nDel, conflict }: str 為改寫後之字串(未改為同一參考), nRename／nDel 為被改名／被刪除之項目數
 * @example
 *
 * let r = rewriteRefs('{"A":{"mode":"OR","isActive":"y"}}', { rename: new Map([['A', 'B']]) })
 * console.log(r.str)
 * // => {"B":{"mode":"OR","isActive":"y"}}
 *
 */
function rewriteRefs(str, opt = {}) {
    let kind = opt.kind === 'rule' ? 'rule' : 'ref'
    let rename = opt.rename instanceof Map ? opt.rename : new Map()
    let del = opt.del instanceof Set ? opt.del : new Set()
    let res = { str, changed: false, nRename: 0, nDel: 0, conflict: false, unsafe: false }
    if (rename.size === 0 && del.size === 0) {
        return res
    }
    let kp = decodeKp(str)
    if (kp === null) {
        return res
    }

    //entries, present: 容器內既有之比對鍵(含停用項目)
    let entries = listEntries(kp, kind)
    let present = new Set()
    entries.forEach((e) => {
        if (e.key !== null) {
            present.add(e.key)
        }
    })

    //conflict: 命中改名之項目, 其新名與容器內另一個「未被改走且未被刪除」之既有項目相撞
    let isDel = (key) => key !== null && del.has(key)
    let isRen = (key) => key !== null && !isDel(key) && rename.has(key)
    for (let e of entries) {
        if (isRen(e.key)) {
            let to = rename.get(e.key)
            if (present.has(to) && !isRen(to) && !isDel(to)) {
                res.conflict = true
                return res
            }
        }
    }

    //改寫
    let nRename = 0
    let nDel = 0
    let out = null
    if (Array.isArray(kp)) {
        out = []

        //kFirstDel: 第一個被刪除項目之索引; 'rule'(crules)之索引名元素(非物件或無 name 者, 名稱即其索引)排在其後者, 刪除後索引前移會改指別的規則(伺服端 cvKpToArr 以索引為名),
        //故具名化為其原索引(解碼結果不變: 非物件元素 { name: 索引, isActive: 值 }), 免靜默改變授權; 'ref' 之索引名為非字串, 不對應任何實體, 前移無影響
        let kFirstDel = -1
        if (kind === 'rule') {
            entries.forEach((e) => {
                if (kFirstDel < 0 && isDel(e.key)) {
                    kFirstDel = e.i
                }
            })
        }
        entries.forEach((e) => {
            let hasName = e.isObj && hasOwn(e.el, 'name')
            if (isDel(e.key)) {
                nDel++
            }
            else if (isRen(e.key) && e.isObj) {
                nRename++
                out.push({ ...e.el, name: rename.get(e.key) })
            }
            else if (kFirstDel >= 0 && e.i > kFirstDel && !hasName) {
                out.push(e.isObj ? { ...e.el, name: e.i } : { name: e.i, isActive: e.el })
            }
            else {
                out.push(e.el)
            }
        })
    }
    else {
        out = Object.create(null) //無原型: 鍵為使用者資料, 含 __proto__ 者須為自有鍵(規則帳本 R-KEY-01)
        entries.forEach((e) => {
            if (isDel(e.key)) {
                nDel++
            }
            else if (isRen(e.key)) {
                nRename++
                out[rename.get(e.key)] = e.el
            }
            else {
                out[e.i] = e.el
            }
        })
    }
    if (nRename === 0 && nDel === 0) {
        return res
    }

    //unsafe: 容器內含 JSON.stringify 無法原樣編碼之值(JSON5 之 Infinity／NaN 數值會被編成 null, 作為規則名時改指別的規則『null』, 作為值時亦改變語意), 命中而須重新編碼時不改寫並回報(上層整次拒存; 稽核工具列入 unsafe)
    if (hasNonFinite(kp)) {
        res.unsafe = true
        return res
    }

    return { str: JSON.stringify(out), changed: true, nRename, nDel, conflict: false, unsafe: false }
}


/**
 * 只依被引用表自身之新舊列, 判定「改名」與「須清理引用之被刪名稱」(與引用端無關; 後台整表寫入據以決定是否須再取引用端表之鎖, 僅被引用表有改名或刪除時才須)
 *
 * 身分以主鍵 id 判定: 同 id 且名稱皆為字串而不同＝改名(僅 grups／pemis, 且 opt.cascadeRename 非 false; 互換與鏈式同時套用); 舊列 id 不在新表＝刪除(targets 之 id 即名稱, 改 id 即刪舊增新, 標的 id 改名之級聯為下一階段);
 * 刪除之名稱若仍有「同 id 同名之存續列」(歷史同名只刪其一)則不清理(引用仍解得出, 其授權變寬另由刪除前確認框提示); 刪除後以同名新增(新 id)者不繼承引用(原則 6: 不被同名新資料接管).
 *
 * @param {Object} p 輸入參數物件, 同 planRefChanges(只用 keyTable、rowsOld、rowsNew、opt.cascadeRename)
 * @returns {Object} 回傳 { renames, rename, delNames, del, oldById, newById }: renames 為 [{ id, from, to }], rename 為 Map(舊名 → 新名), delNames／del 為須清理之名稱陣列／Set, oldById／newById 為以字串主鍵建立之列 Map
 */
function diffRefTargets(p) {
    let keyTable = p ? p.keyTable : ''
    let rs = { renames: [], rename: new Map(), delNames: [], del: new Set(), oldById: new Map(), newById: new Map() }
    if (!hasOwn(REF_OF, keyTable)) {
        return rs
    }
    let cascadeRename = !(p.opt && p.opt.cascadeRename === false)
    let rowsOld = Array.isArray(p.rowsOld) ? p.rowsOld : []
    let rowsNew = Array.isArray(p.rowsNew) ? p.rowsNew : []

    //oldById, newById: 只認字串主鍵(缺 id 之新列為新增, 不對應既有列)
    let oldById = rs.oldById
    rowsOld.forEach((r) => {
        if (r !== null && typeof r === 'object' && isStr(r.id)) {
            oldById.set(r.id, r)
        }
    })
    let newById = rs.newById
    rowsNew.forEach((r) => {
        if (r !== null && typeof r === 'object' && isStr(r.id)) {
            newById.set(r.id, r)
        }
    })

    //renames: 同 id 且名稱皆為字串而不同; keptNames: 同 id 同名之存續列之名稱
    let keptNames = new Set()
    newById.forEach((rn, id) => {
        let ro = oldById.get(id)
        if (ro === undefined) {
            return
        }
        let from = entName(ro, keyTable)
        let to = entName(rn, keyTable)
        if (from !== null && from === to) {
            keptNames.add(from)
        }
        if (cascadeRename && keyTable !== 'targets' && from !== null && to !== null && from !== to) {
            rs.renames.push({ id, from, to })
            rs.rename.set(from, to)
        }
    })

    //delNames: 舊列 id 不在新表, 其名稱不再有同 id 同名之存續列者
    oldById.forEach((ro, id) => {
        if (newById.has(id)) {
            return
        }
        let name = entName(ro, keyTable)
        if (name !== null && !keptNames.has(name)) {
            rs.del.add(name)
        }
    })
    rs.delNames = [...rs.del]

    return rs
}


/**
 * 計算「被引用表之寫入」對引用端授權字串之連帶更新計畫(改名級聯＋刪除連帶清理)
 *
 * 改名與刪除之判定(身分以主鍵 id、同時套用、歷史同名只刪其一不清理、刪後同名新增不繼承)見 diffRefTargets.
 * 拒絕(整次不寫入, 收嚴＋提示, 原則 3、適用表 m):
 *   renameCascadeDupGroup  被改名者屬歷史同名組(庫內另有同名列)且該名稱仍被引用(級聯會把原綁各筆之交集的引用轉給被改名者, 外審 A.1)——須先清理再改名; 該名稱無人引用則不擋(歷史同名之清理路徑)
 *   renameCascadeNameInUse 新名為「仍被啟用中引用但無任何實體」之懸空名(級聯後舊引用與新實體混成一項, 授權被新名稱接管, Q4)
 *   renameCascadeConflict  某容器內新名與另一既有項目相撞, 無法自動改寫
 *   renameCascadeUnsupported 某容器內含無法安全重新編碼之內容(JSON5 之 Infinity／NaN 數值), 命中而須改寫時無法自動改寫(改刪除時亦同)
 * opt.cascadeRename 為 false 時不做改名級聯(亦不做上述改名相關拒絕; 舊行為, 引用成為懸空); 刪除連帶清理不受此設定影響.
 *
 * @param {Object} p 輸入參數物件
 * @param {String} p.keyTable 輸入被寫入之表, 'grups'、'pemis' 或 'targets'; 其他回傳空計畫
 * @param {Array} p.rowsOld 輸入庫內該表全部列(寫入前)
 * @param {Array} p.rowsNew 輸入寫入後該表全部列(後台為送入之整表; 外部同步為他 from 之既有列加本批列)
 * @param {Array} p.holdersOld 輸入引用端表全部列(users／grups／pemis, 寫入前)
 * @param {Object} [p.opt={}] 輸入設定物件
 * @param {Boolean} [p.opt.cascadeRename=true] 輸入是否做改名級聯, 預設true
 * @returns {Object} 回傳 { err, keyTable, holder, field, renames, delNames, changes, nHolders, nRenameHolders, nDelHolders, nExternal }:
 *   err 為 null 或拒絕之語系鍵; renames 為 [{ id, from, to }]; delNames 為須清理之名稱; changes 為須改寫之引用端列 [{ id, field, before, after, nRename, nDel, from }](before／after 為該欄位字串);
 *   nHolders 為須改寫之引用端列數, nRenameHolders／nDelHolders 為受改名／刪除影響之列數(一列可兩者皆計), nExternal 為其中來源 from 非空(外部應用)之列數
 * @example
 *
 * let p = planRefChanges({
 *     keyTable: 'grups',
 *     rowsOld: [{ id: 'g1', name: 'A' }],
 *     rowsNew: [{ id: 'g1', name: 'B' }],
 *     holdersOld: [{ id: 'u1', cgrups: '{"A":{"mode":"OR","isActive":"y"}}' }],
 * })
 * console.log(p.changes[0].after)
 * // => {"B":{"mode":"OR","isActive":"y"}}
 *
 */
function planRefChanges(p) {
    let keyTable = p ? p.keyTable : ''
    let ref = hasOwn(REF_OF, keyTable) ? REF_OF[keyTable] : null
    let plan = {
        err: null,
        keyTable,
        holder: ref ? ref.holder : '',
        field: ref ? ref.field : '',
        renames: [],
        delNames: [],
        changes: [],
        nHolders: 0,
        nRenameHolders: 0,
        nDelHolders: 0,
        nExternal: 0,
    }
    if (ref === null) {
        return plan
    }
    let holders = Array.isArray(p.holdersOld) ? p.holdersOld : []

    //renames, delNames: 只依被引用表自身之新舊列判定(與引用端無關)
    let d0 = diffRefTargets(p)
    let { oldById, newById, rename, del } = d0
    plan.renames = d0.renames
    plan.delNames = d0.delNames
    if (rename.size === 0 && del.size === 0) {
        return plan
    }

    //防禦: 同批兩列改名為同一新名(或兩個舊名映射到同一新名)——引用改寫後兩項併為一項而改變授權; 上游名稱唯一檢查(findTouchedDup／findDupIndex／前端 getNameErrs)本會擋下, 此處不依賴它(外審 minimax R6)
    let namesTo = new Set()
    for (let rn of plan.renames) {
        if (namesTo.has(rn.to)) {
            plan.err = 'renameCascadeConflict'
            return plan
        }
        namesTo.add(rn.to)
    }

    //解碼各引用端列一次(歷史同名組檢查、接管檢查與改寫共用)
    let decoded = holders.map((h) => {
        let str = (h !== null && typeof h === 'object') ? h[ref.field] : undefined
        return { h, str, kp: decodeKp(str) }
    }).filter((d) => d.h !== null && typeof d.h === 'object' && isStr(d.h.id)) //缺字串 id 之引用端列無從寫回, 不納入

    //歷史同名組之改名: 庫內另有同名列且該名稱仍被引用(含停用項)——引用原綁「各筆之交集」, 把引用轉給被改名者會改變授權(外審 A.1); 無人引用則無引用可轉, 不擋(清理歷史同名之改名路徑)
    let dupRenames = plan.renames.filter((rn) => {
        let nSame = 0
        oldById.forEach((ro) => {
            if (entName(ro, keyTable) === rn.from) {
                nSame++
            }
        })
        return nSame >= 2
    })
    if (dupRenames.length > 0) {
        let namesDup = new Set(dupRenames.map((rn) => rn.from))
        for (let d of decoded) {
            if (d.kp !== null && listEntries(d.kp, ref.kind).some((e) => e.key !== null && namesDup.has(e.key))) {
                plan.err = 'renameCascadeDupGroup'
                return plan
            }
        }
    }

    //新名接管檢查: 新名無任何舊實體(或其舊實體不是在本次一併改走／刪除), 而仍被啟用中之引用指向(懸空名)
    if (plan.renames.length > 0) {
        let namesOld = new Set()
        oldById.forEach((ro) => {
            let n = entName(ro, keyTable)
            if (n !== null) {
                namesOld.add(n)
            }
        })
        let ghosts = new Set()
        plan.renames.forEach((rn) => {
            if (!namesOld.has(rn.to)) {
                ghosts.add(rn.to)
            }
        })
        if (ghosts.size > 0) {
            for (let d of decoded) {
                if (d.kp === null) {
                    continue
                }
                for (let e of listEntries(d.kp, ref.kind)) {
                    if (e.key !== null && ghosts.has(e.key) && e.isActive === 'y') {
                        plan.err = 'renameCascadeNameInUse'
                        return plan
                    }
                }
            }
        }
    }

    //改寫
    for (let d of decoded) {
        let r = rewriteRefs(d.str, { kind: ref.kind, rename, del })
        if (r.conflict || r.unsafe) {
            plan.err = r.conflict ? 'renameCascadeConflict' : 'renameCascadeUnsupported'
            plan.changes = []
            plan.nHolders = 0
            plan.nRenameHolders = 0
            plan.nDelHolders = 0
            plan.nExternal = 0
            return plan
        }
        if (!r.changed) {
            continue
        }
        let from = (isStr(d.h.from) && d.h.from !== '') ? d.h.from : ''
        plan.changes.push({ id: d.h.id, field: ref.field, before: d.str, after: r.str, nRename: r.nRename, nDel: r.nDel, from })
        if (r.nRename > 0) {
            plan.nRenameHolders++
        }
        if (r.nDel > 0) {
            plan.nDelHolders++
        }
        if (from !== '') {
            plan.nExternal++
        }
    }
    plan.nHolders = plan.changes.length

    return plan
}


/**
 * 為「寫入後整表」中未帶主鍵 id 之列補規劃用之 id(僅供 diffRefTargets／planRefChanges, 不改寫入之列)
 *
 * 後台整表寫入(API 直打)與外部同步之列可不帶 id, 寫入時由 ORM 補隨機主鍵, 即每次皆為「舊列被刪、新列被新增」而身分不穩定; 若以 id 判定會把每次寫入都當成全部刪除再新增而清空引用.
 * 故未帶 id 之列(grups／pemis)改以「名稱」對應 rowsPool 中 id 未被本批帶用之既有列(同名即同一實體, 不算刪除再新增; 同名多列依序對應); 名稱不同者視為新實體(給不與任何既有主鍵相同之規劃 id).
 * 有限數字之 id 取其字串形式(同寫入前之主鍵正規化); targets 無此問題(id 即名稱, 必帶).
 *
 * @param {String} keyTable 輸入被寫入之表名
 * @param {Array} rowsPool 輸入可供對應之既有列(後台為該表全部既有列; 外部同步為同一 from 之既有列)
 * @param {Array} rows 輸入本批列
 * @param {Array} [rowsAvoid=[]] 輸入規劃 id 須避開之其他既有列(外部同步之他 from 列), 預設空
 * @returns {Array} 回傳補好規劃 id 之新列陣列(複本)
 */
function fillIdlessIds(keyTable, rowsPool, rows, rowsAvoid = []) {
    let toId = (v) => {
        let id = (v !== null && typeof v === 'object') ? v.id : undefined
        if (isStr(id) && id !== '') {
            return id
        }
        return (typeof id === 'number' && Number.isFinite(id)) ? String(id) : null
    }
    let idsGiven = new Set()
    rows.forEach((v) => {
        let id = toId(v)
        if (id !== null) {
            idsGiven.add(id)
        }
    })
    let pool = new Map()
    rowsPool.forEach((r) => {
        if (r !== null && typeof r === 'object' && isStr(r.id) && !idsGiven.has(r.id) && isStr(r.name)) {
            if (!pool.has(r.name)) {
                pool.set(r.name, [])
            }
            pool.get(r.name).push(r.id)
        }
    })
    //used: 已被占用之 id(pool 與 rowsAvoid 之既有列之全部主鍵與本批已帶之 id), 新實體之規劃 id 須避開; 外部同步之 pool 只含同 from 之列, 他 from 之列經 rowsAvoid 傳入(其主鍵仍屬寫入後整表, 撞號會使規劃把兩個實體併成一個)
    let used = new Set(idsGiven)
    ;[...rowsPool, ...rowsAvoid].forEach((r) => {
        if (r !== null && typeof r === 'object' && isStr(r.id)) {
            used.add(r.id)
        }
    })
    return rows.map((v, k) => {
        let id = toId(v)
        if (id === null && keyTable !== 'targets' && v !== null && typeof v === 'object' && isStr(v.name) && pool.has(v.name) && pool.get(v.name).length > 0) {
            id = pool.get(v.name).shift()
        }
        if (id === null) {
            let n = k
            while (used.has(`__new__${n}`)) { //新實體: 不與任何既有主鍵或本批已帶 id 相同
                n++
            }
            id = `__new__${n}`
            used.add(id)
        }
        return { ...v, id }
    })
}


export { REF_OF, rewriteRefs, diffRefTargets, planRefChanges, fillIdlessIds }
export default planRefChanges
