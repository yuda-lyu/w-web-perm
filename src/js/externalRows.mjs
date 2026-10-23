//外部列受保護(F-23; R-PRINCIPLE-00 原則 5「開了外部同步就以外部為主」、原則 3; 規則帳本 R-EXT-OWN-01; ADR-037): 後台整表寫入對「外部列」之守門, 純函數(不依賴 Vue／DOM／ORM),
//伺服端(server/procCore.mjs)為強制者, 前端(清單頁唯讀、複製、刪除過濾)共用同一份判定, 不各自重寫.
//
//判別(定案 D1): from 為非空字串者為「外部列」(外部同步 syncAndReplaceTabs 只收非空字串 from, 故非空 from 必曾由外部同步寫入或後台誤植);
//from 為 ''、缺欄、或非字串(null／數字／布林)者為「後台列」——非字串 from 必為後台寫入(同步入口 isestr 把關), 遷移工具正規化為 ''(g_fixFromType.mjs), 後台寫入起拒收非字串 from.
//Lv1 鎖定層級: 外部列之身分／結構欄(指派欄、順序、伺服器管理欄以外之全部欄位)後台不得改, 不得刪除, 不得改 from; 指派欄(users.cgrups／grups.cpemis／pemis.crules)後台可寫
//  (改指派須附載入基準, 見 rowDigest.mjs; 無基準無從證明快照新舊, 依原則 3 收嚴拒收); 外部列之 order 由外部擁有(後台儲存不重編, 還原為庫內值).


//SERVER_FIELDS: 伺服器管理欄(procOrm 寫入時覆寫), 不納入內容比對
let SERVER_FIELDS = ['userId', 'timeCreate', 'userIdUpdate', 'timeUpdate']


//ASSIGN_FIELD: 各表之授權指派欄(後台可寫); targets 無指派欄
let ASSIGN_FIELD = { users: 'cgrups', grups: 'cpemis', pemis: 'crules', targets: null }


let isStr = (v) => typeof v === 'string'
let hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k)
let isObj = (v) => v !== null && typeof v === 'object'


//normV: 比對用正規化(缺欄與 '' 視為同一; 其餘以 JSON 字串比對, 值為資料庫與前端同源之純量／字串)
let normV = (v) => JSON.stringify(v === undefined ? '' : v)


//normC: 內容欄比對用——另視 null 與 ''／缺欄為同一空值(寫入契約之空值等價, 與基準 digestRow 同口徑; 0／false 仍異於空值).
//  基準已視 null≡'' 為相同而通過, 此處若仍視為不同, 會對合法存檔回 saveExternalRowChanged(外審 sol#2, 2026-10-23); 相同者亦不重寫, 庫內原表示(null)不被改成 ''.
//  from 欄不適用: null 與 '' 之 from 有別(歷史後台列, 見 checkExternalWrite), 一律用 normV.
let normC = (v, k) => (k === 'from' ? normV(v) : JSON.stringify(v === undefined || v === null ? '' : v))


/**
 * 判斷是否為外部列(from 為非空字串)
 *
 * @param {Object} row 輸入列物件
 * @returns {Boolean} 回傳是否為外部列
 * @example
 *
 * isExternalRow({ id: '1', from: 'pd' })
 * // => true
 * isExternalRow({ id: '1', from: '' })
 * // => false
 * isExternalRow({ id: '1', from: null })
 * // => false
 *
 */
function isExternalRow(row) {
    return isObj(row) && isStr(row.from) && row.from !== ''
}


/**
 * 取得外部列之鎖定欄位(身分／結構欄): schema 全部欄位扣除 id、from、order、指派欄、伺服器管理欄
 *
 * @param {String} keyTable 輸入表名(targets／pemis／grups／users)
 * @param {Array} keys 輸入該表 schema 之欄位名陣列(ds[keyTable].keys)
 * @returns {Array} 回傳鎖定欄位名陣列
 */
function getLockFields(keyTable, keys) {
    let ka = hasOwn(ASSIGN_FIELD, keyTable) ? ASSIGN_FIELD[keyTable] : null
    return (Array.isArray(keys) ? keys : []).filter((k) => k !== 'id' && k !== 'from' && k !== 'order' && k !== ka && SERVER_FIELDS.indexOf(k) < 0)
}


/**
 * 外部列之 order 由外部擁有: 把送入列中「庫內為外部列者」之 order 還原為庫內值(後台儲存重編 order=k+1 不得改外部列之順序), 回傳新陣列(不改輸入)
 *
 * @param {Array} rows 輸入送入之整表列(已重給 order)
 * @param {Array} ltdtOld 輸入該表庫內全部列(select 結果)
 * @returns {Array} 回傳 order 已還原之列陣列
 */
function restoreExternalOrder(rows, ltdtOld) {
    let oldById = new Map()
    ;(Array.isArray(ltdtOld) ? ltdtOld : []).forEach((o) => {
        if (isObj(o) && isStr(o.id)) {
            oldById.set(o.id, o)
        }
    })
    return rows.map((row) => {
        let o = isObj(row) && isStr(row.id) ? oldById.get(row.id) : undefined
        if (o !== undefined && isExternalRow(o) && hasOwn(o, 'order')) {
            return { ...row, order: o.order }
        }
        return row
    })
}


/**
 * 將「外部列且僅伺服器管理欄(建立者／時間、更新者／時間)不同」之 diff 列移入 same(視為無變更, 不寫入)
 *
 * 外部同步每次整來源重寫, 使外部列之 timeUpdate／timeCreate／userId 隨之更新; 持舊快照之後台存檔若原樣送回該列, 其內容與庫內相同而僅伺服器管理欄較舊,
 * 寫入會把建立者與建立時間回退為舊值(D2 設計稿 S2). 內容相同即無須寫入. 預設只處理外部列, 後台列之 diff 判定不變.
 * all 為真時不分外部列或後台列一律處理(perm-run01: 寫入契約 serverOnly——伺服器專有欄位存檔不採用客戶端值, 規格第 4、6 節; R-CONTRACT-01).
 *
 * @param {Object} p 輸入參數物件
 * @param {Array} p.keys 輸入該表 schema 欄位名陣列
 * @param {Object} p.r 輸入 ltdtDiffByKey 結果 { add, del, diff, same }
 * @param {Array} p.ltdtOld 輸入該表庫內全部列
 * @param {Boolean} [p.all=false] 輸入是否不分外部列或後台列(預設只外部列)
 * @returns {Object} 回傳新之 { add, del, diff, same }
 */
function dropServerOnlyDiff({ keys, r, ltdtOld, all = false }) {
    let oldById = new Map()
    ltdtOld.forEach((o) => {
        if (isObj(o) && isStr(o.id)) {
            oldById.set(o.id, o)
        }
    })
    let fields = (Array.isArray(keys) ? keys : []).filter((k) => SERVER_FIELDS.indexOf(k) < 0)
    let diff = []
    let same = [...r.same]
    r.diff.forEach((row) => {
        let o = isObj(row) && isStr(row.id) ? oldById.get(row.id) : undefined
        if (o !== undefined && (all === true || isExternalRow(o)) && fields.every((k) => normC(row[k], k) === normC(o[k], k))) {
            same.push(row)
        }
        else {
            diff.push(row)
        }
    })
    return { add: r.add, del: r.del, diff, same }
}


/**
 * 外部列之 diff 列(內容確有改動, 例如指派欄)改帶庫內之伺服器管理欄(userId／timeCreate／userIdUpdate／timeUpdate)
 *
 * 伺服器管理欄由伺服器擁有(procOrm save 只覆寫 userIdUpdate／timeUpdate, 建立者與建立時間取自送入之列); 外部同步每次整來源重寫使外部列之建立者／建立時間更新,
 * 持舊草稿(前端保留未存編輯, 見 draftSync)送回該列時, 基準因排除伺服器管理欄而通過(內容未變), 若原樣寫入就把較新之建立者與建立時間回退為舊值(R-EXT-OWN-01 S2 之同一缺陷, 外審 sol 第 3 點).
 * 故改動之外部列一律以庫內之伺服器管理欄寫入. 預設只處理庫內為外部列者(後台列之寫入不變); 庫內無該欄者(歷史列)不補、亦不採用客戶端送入之值(刪除該欄, 保留庫內值＝仍無該欄; perm-run01 外審 sol#3).
 * all 為真時不分外部列或後台列一律處理(perm-run01: 寫入契約 serverOnly, 見 dropServerOnlyDiff).
 *
 * @param {Object} p 輸入參數物件
 * @param {Object} p.r 輸入 ltdtDiffByKey(及 dropServerOnlyDiff)結果 { add, del, diff, same }
 * @param {Array} p.ltdtOld 輸入該表庫內全部列
 * @param {Boolean} [p.all=false] 輸入是否不分外部列或後台列(預設只外部列)
 * @returns {Object} 回傳新之 { add, del, diff, same }(不改輸入; 未改動之列為同一物件)
 */
function restoreServerFields({ r, ltdtOld, all = false }) {
    let oldById = new Map()
    ltdtOld.forEach((o) => {
        if (isObj(o) && isStr(o.id)) {
            oldById.set(o.id, o)
        }
    })
    let diff = r.diff.map((row) => {
        let o = isObj(row) && isStr(row.id) ? oldById.get(row.id) : undefined
        if (o === undefined || (all !== true && !isExternalRow(o))) {
            return row
        }
        let out = { ...row }
        SERVER_FIELDS.forEach((k) => {
            if (hasOwn(o, k)) {
                out[k] = o[k]
            }
            else {
                //庫內無該欄(歷史列): 不採用客戶端送入之值(寫入契約 serverOnly: 保留庫內值＝仍無該欄; 外審 sol#3, 2026-10-23)
                delete out[k]
            }
        })
        return out
    })
    return { add: r.add, del: r.del, diff, same: r.same }
}


/**
 * 後台整表寫入對外部列之守門(於 ltdtDiffByKey 與 dropServerOnlyDiff 之後、寫入之前; 違規整次拒收、零寫入, 不靜默忽略)
 *
 * from 型別(不論 lockExternalRows): 新增列之 from 須為字串(缺欄視為 ''), 修改列之 from 若改為非字串須與庫內值相同(歷史 null 原樣送回不拒, 否則已有歷史資料之庫無法儲存);
 * lockExternalRows 為真時另有: ①新增列之 from 須為 ''(含復活他來源之列、複製繼承、手打); ②不得刪除外部列; ③修改列: 外部列不得改 from 與鎖定欄位(getLockFields), 後台列不得改成非空 from.
 * 指派欄與 order／伺服器管理欄不在比對內.
 *
 * @param {Object} p 輸入參數物件
 * @param {String} p.keyTable 輸入表名
 * @param {Array} p.keys 輸入該表 schema 欄位名陣列
 * @param {Object} p.r 輸入 { add, del, diff, same }
 * @param {Array} p.ltdtOld 輸入該表庫內全部列
 * @param {Boolean} [p.lockExternalRows=true] 輸入是否啟用外部列保護, 預設 true
 * @returns {Object|null} 回傳 null 為通過; 否則 { key, reason, k, n, froms }: key 為語系鍵(saveFromNotAllowed／saveExternalRowChanged), reason 為原因(fromType／addFrom／del／fromChanged／fieldChanged), k 為 r 內該陣列之第一個違規索引, n 為違規列數, froms 為涉及之來源(至多 5 個)
 */
function checkExternalWrite({ keyTable, keys, r, ltdtOld, lockExternalRows = true }) {
    let oldById = new Map()
    ltdtOld.forEach((o) => {
        if (isObj(o) && isStr(o.id)) {
            oldById.set(o.id, o)
        }
    })
    let normFrom = (v) => (v === undefined ? '' : v)
    let lockFields = getLockFields(keyTable, keys)

    let bad = [] //{ key, reason, k, from }
    let push = (key, reason, k, from) => {
        bad.push({ key, reason, k, from: isStr(from) ? from : '' })
    }

    //add
    r.add.forEach((row, k) => {
        let f = isObj(row) ? normFrom(row.from) : ''
        if (!isStr(f)) {
            push('saveFromNotAllowed', 'fromType', k, '')
        }
        else if (lockExternalRows && f !== '') {
            push('saveFromNotAllowed', 'addFrom', k, f)
        }
    })

    //del
    if (lockExternalRows) {
        r.del.forEach((row, k) => {
            if (isExternalRow(row)) {
                push('saveExternalRowChanged', 'del', k, row.from)
            }
        })
    }

    //diff
    r.diff.forEach((row, k) => {
        let o = isObj(row) && isStr(row.id) ? oldById.get(row.id) : undefined
        let nf = isObj(row) ? normFrom(row.from) : ''
        let of = o === undefined ? '' : normFrom(o.from)
        if (!isStr(nf) && nf !== of) {
            push('saveFromNotAllowed', 'fromType', k, '')
            return
        }
        if (!lockExternalRows || o === undefined) {
            return
        }
        if (isExternalRow(o)) {
            if (nf !== o.from) {
                push('saveExternalRowChanged', 'fromChanged', k, o.from)
            }
            else if (lockFields.some((f) => normC(row[f], f) !== normC(o[f], f))) {
                push('saveExternalRowChanged', 'fieldChanged', k, o.from)
            }
        }
        else if (isStr(nf) && nf !== '') {
            push('saveFromNotAllowed', 'fromChanged', k, nf)
        }
    })

    if (bad.length === 0) {
        return null
    }
    let froms = []
    bad.forEach((b) => {
        if (b.from !== '' && froms.indexOf(b.from) < 0 && froms.length < 5) {
            froms.push(b.from)
        }
    })
    return { key: bad[0].key, reason: bad[0].reason, k: bad[0].k, n: bad.length, froms }
}


/**
 * 本次寫入是否修改了外部列之指派欄(須附載入基準, 見 rowDigest.mjs checkBaseline)
 *
 * @param {Object} p 輸入參數物件
 * @param {Object} p.r 輸入 { add, del, diff, same }(經 dropServerOnlyDiff 後)
 * @param {Array} p.ltdtOld 輸入該表庫內全部列
 * @returns {Boolean} 回傳是否有外部列之 diff
 */
function hasExternalDiff({ r, ltdtOld }) {
    let oldById = new Map()
    ltdtOld.forEach((o) => {
        if (isObj(o) && isStr(o.id)) {
            oldById.set(o.id, o)
        }
    })
    return r.diff.some((row) => {
        let o = isObj(row) && isStr(row.id) ? oldById.get(row.id) : undefined
        return o !== undefined && isExternalRow(o)
    })
}


export { SERVER_FIELDS, ASSIGN_FIELD, isExternalRow, getLockFields, restoreExternalOrder, dropServerOnlyDiff, restoreServerFields, checkExternalWrite, hasExternalDiff, normC }
export default isExternalRow
