import iseobj from 'wsemi/src/iseobj.mjs'
import findTouchedDup from '../src/js/findTouchedDup.mjs' //判準單一擁有者在 src/js(前端清單頁共用), 本檔轉出供 procCore.mjs 與測試沿用既有匯入路徑


//名稱唯一(F-02)與使用者對應鍵(F-14)之判準, 單一擁有者(規則帳本 R-NAME-UNIQ-01／02、R-MAPKEY-01／02／03, ADR-034):
//  外部同步(WWebPerm.mjs:syncAndReplaceTabs)、後台整表寫入(procCore.mjs:updateTabItems)、登入查找(WWebPerm.mjs:getTokenUser／getGenUserByKV)只呼叫本檔, 不複製判準.
//比對一律精確 ===(與伺服端 arrFinder 與 getTokenUser 之 select 一致; 不做大小寫／空白正規化: 正規化後比對會放行伺服端視為不同之名稱, 或拒絕伺服端視為不同之鍵).
//鍵之值非字串者不參與重複比對(空／非字串另由呼叫端之 isestr 檢查負責). 以 Map／Set 計, 免原型鍵名(constructor、__proto__)誤判(規則帳本 R-KEY-01).


let isStr = (v) => typeof v === 'string'


/**
 * 回傳 rows 內第一個「key 欄位值(須為字串)與先前某參與列相同」之列索引, 無則 -1
 *
 * @param {Array} rows 列陣列
 * @param {String} key 欄位名
 * @param {Function} [isPart] 判斷該列是否參與比對(如只計 active), 預設全部參與
 * @returns {Number} 第二次(含)出現者之索引, 無重複為 -1
 */
function findDupIndex(rows, key, isPart = () => true) {
    if (!Array.isArray(rows)) {
        return -1
    }
    let seen = new Set()
    for (let k = 0; k < rows.length; k++) {
        let r = rows[k]
        if (!isPart(r)) {
            continue
        }
        let v = (r === null || typeof r !== 'object') ? undefined : r[key]
        if (!isStr(v)) {
            continue
        }
        if (seen.has(v)) {
            return k
        }
        seen.add(v)
    }
    return -1
}


/**
 * rows 內是否有兩列 key 值相同(字串, 精確 ===)
 */
function hasDupKey(rows, key) {
    return findDupIndex(rows, key) >= 0
}


/**
 * 回傳 rows 中第一個「key 值已被 from 不等於本 from 之既有列使用」之索引, 無則 -1; 同 from 之既有列不算衝突(隨後由 delAll 重寫)
 *
 * @param {Array} rows 本批列
 * @param {Array} rowsExist 該表既有之全部列(select 結果)
 * @param {String} from 本批之 from
 * @param {String} key 欄位名
 * @param {Object} [opt={}] 設定
 * @param {Boolean} [opt.onlyActive=false] 為 true 時兩側皆只計 isActive==='y' 之列(使用者對應鍵: getTokenUser 只匹配 active)
 * @returns {Number} 衝突列之索引, 無為 -1
 */
function findKeyOtherFrom(rows, rowsExist, from, key, opt = {}) {
    if (!Array.isArray(rows) || !Array.isArray(rowsExist)) {
        return -1
    }
    let onlyActive = opt.onlyActive === true
    let used = new Set()
    for (let r of rowsExist) {
        if (r === null || typeof r !== 'object') {
            continue
        }
        if (r.from === from) {
            continue
        }
        if (onlyActive && r.isActive !== 'y') {
            continue
        }
        if (isStr(r[key])) {
            used.add(r[key])
        }
    }
    for (let k = 0; k < rows.length; k++) {
        let r = rows[k]
        if (r === null || typeof r !== 'object') {
            continue
        }
        if (onlyActive && r.isActive !== 'y') {
            continue
        }
        if (isStr(r[key]) && used.has(r[key])) {
            return k
        }
    }
    return -1
}


/**
 * 同表寫入互斥鍵(外審 sol R10, D2 設計稿 (a) 之最小版): 外部同步(syncAndReplaceTabs)與後台整表寫入(updateTabItems)對同一張表須共用同一個 kmx 鍵,
 * 否則兩者各自「先檢查名稱／對應鍵、後寫入」可交錯——檢查後、寫入前對方已完成寫入, F-02／F-14 之全域唯一性被略過(終態同名兩列、授權取決於列序).
 * 兩條路徑內都不得再取同一個鍵(kmx 非可重入, 巢狀同鍵即死結): syncAndReplaceTabs 內只呼叫 procOrm／woItems, 不呼叫 updateTabItems.
 *
 * @param {String} keyTable 表名
 * @returns {String} 回傳 kmx 鍵
 */
function tabWriteKey(keyTable) {
    return 'tabWrite:' + keyTable
}


/**
 * 使用者對應鍵(mappingBy)所指之 users 欄位: 'email'／'name' 回該欄位名, 其餘(含預設 'id')回 null(不另檢查: id 為主鍵, 既有 idOtherFrom 已涵蓋跨 from)
 */
function mapKeyOf(mappingBy) {
    return (mappingBy === 'email' || mappingBy === 'name') ? mappingBy : null
}


/**
 * 外部同步 users 之對應鍵批內檢查(F-14): mappingBy 為 'email'／'name' 時, 每個 isActive==='y' 之列, 該欄位須為非空字串(trim 後長度 > 0)且批內唯一(精確 ===);
 * isActive 非 'y' 者不參與(getTokenUser 只匹配 active). 先掃全批之空值再查重複(次序決定性).
 *
 * @param {Array} rows 本批 users 列(已 ltdtmapping)
 * @param {String} mappingBy 'id'｜'email'｜'name'
 * @returns {Object|null} null 為通過; { reason: 'mapKeyInvalid'|'mapKeyDuplicate', k } 為第一個違規列
 */
function checkMapKeyBatch(rows, mappingBy) {
    let key = mapKeyOf(mappingBy)
    if (key === null || !Array.isArray(rows)) {
        return null
    }
    let isActive = (r) => r !== null && typeof r === 'object' && r.isActive === 'y'
    let kInvalid = rows.findIndex((r) => isActive(r) && !(isStr(r[key]) && r[key].trim().length > 0))
    if (kInvalid >= 0) {
        return { reason: 'mapKeyInvalid', k: kInvalid }
    }
    let kDup = findDupIndex(rows, key, isActive)
    if (kDup >= 0) {
        return { reason: 'mapKeyDuplicate', k: kDup }
    }
    return null
}


/**
 * 後台整表寫入 users 之 email／對應鍵檢查(R-PRINCIPLE-00 適用表 h, 規則帳本 R-MAPKEY-03; 遭遇衝突就收嚴, 但歷史資料不得使所有存檔失敗, 只擋「本次造成或觸及」者):
 *
 *  ① 一般 email(任何 mappingBy, 全表含停用列): 須為非空字串(僅檢查「新增列」與「email 值與庫內同 id 列不同的列」, 歷史既有之空／非字串原樣送回不拒),
 *     且不得與他列重複(判準 findTouchedDup, 歷史既有重複原樣送回不拒).
 *  ② 對應鍵(mappingBy 為 'email'／'name' 時, 與外部同步 F-14 同口徑): 兩側先過濾成 isActive==='y' 之列再比;
 *     該欄位須為非空字串(trim 後長度 > 0; 僅檢查「新增列」「該欄位值與庫內同 id 之 active 列不同的列」與「由非 active 改為 active 的列」),
 *     且 active 列間不得重複(findTouchedDup; 一列由 inactive 改 active 而撞值亦屬本次造成). inactive 列不參與.
 *     mappingBy 為 'id'(預設)不做②, 故 name 不檢查; mappingBy 為 'email' 時 ① 已涵蓋 active 列之 email, ② 另補「停用列改為啟用」之情形.
 *
 * 錯誤鍵沿用 saveRowFieldInvalid(空／非字串)與 saveRowFieldDuplicate(重複); reason 供 srLog 區分來源(不含欄位值: email／name 為個資).
 * 次序: 先 ① 後 ②; 同一階段內空值與重複取列索引較小者(與修正前 ckKey 逐列掃描之次序一致).
 *
 * @param {Array} rowsNew 送入之整表(已 ltdtmapping、id 數字轉字串)
 * @param {Array} rowsOld 庫內現有全部列(select 結果)
 * @param {String} mappingBy 'id'｜'email'｜'name'(其他值視同 'id')
 * @returns {Object|null} null 為通過; 否則 { key: 'saveRowFieldInvalid'|'saveRowFieldDuplicate', reason, field, k }(k 為 rowsNew 之列索引)
 */
function checkUsersWrite(rowsNew, rowsOld, mappingBy) {
    if (!Array.isArray(rowsNew)) {
        return null
    }
    let isObj = (r) => r !== null && typeof r === 'object'
    let isEstr = (v) => isStr(v) && v.length > 0
    let isFilled = (v) => isStr(v) && v.trim().length > 0
    let isActive = (r) => isObj(r) && r.isActive === 'y'
    let listOld = Array.isArray(rowsOld) ? rowsOld.filter(isObj) : []

    //findBad: listNew 中第一個「本次造成或觸及」且 key 值不合 isOk 之索引, 無則 -1; 新增列(庫內無同 id)與 key 值與庫內同 id 列不同者為造成或觸及
    let findBad = (listNew, list, key, isOk) => {
        let byId = new Map()
        for (let r of list) {
            if (isStr(r.id)) {
                byId.set(r.id, r)
            }
        }
        return listNew.findIndex((r) => {
            let v = isObj(r) ? r[key] : undefined
            let o = (isObj(r) && isStr(r.id)) ? byId.get(r.id) : undefined
            let touched = o === undefined || v !== o[key]
            return touched && !isOk(v)
        })
    }

    //judge: 一個階段(列集合, 欄位, 空值判準, reason 前綴)之結果; idxMap 為過濾後索引對應回 rowsNew 之原索引
    let judge = (listNew, idxMap, list, key, isOk, tag) => {
        let kBad = findBad(listNew, list, key, isOk)
        let kDup = findTouchedDup(listNew, list, key)
        if (kBad < 0 && kDup < 0) {
            return null
        }
        let isBad = kBad >= 0 && (kDup < 0 || kBad <= kDup) //同一列既空又被當重複(如新增第二個空字串 email)時以「空值」為主(與修正前 ckKey 先判空再判重複一致)
        return {
            key: isBad ? 'saveRowFieldInvalid' : 'saveRowFieldDuplicate',
            reason: isBad ? `${tag}Invalid` : `${tag}Duplicate`,
            field: key,
            k: idxMap[isBad ? kBad : kDup],
        }
    }

    //① 一般 email
    let r1 = judge(rowsNew, rowsNew.map((v, k) => k), listOld, 'email', isEstr, 'email')
    if (r1 !== null) {
        return r1
    }

    //② 對應鍵(僅 active 列)
    let keyMap = mapKeyOf(mappingBy)
    if (keyMap === null) {
        return null
    }
    let idxAct = []
    let rowsNewAct = []
    rowsNew.forEach((r, k) => {
        if (isActive(r)) {
            idxAct.push(k)
            rowsNewAct.push(r)
        }
    })
    return judge(rowsNewAct, idxAct, listOld.filter(isActive), keyMap, isFilled, 'mapKey')
}


/**
 * 登入查找之結果判定(F-14): 以對應鍵查 perm users(isActive='y')命中 0 筆／1 筆／多筆; 多筆不取首筆(user 為 null, 由呼叫端依 count 拒絕)
 *
 * @param {Array} rs select 結果
 * @returns {Object} { user, count }: count 為物件列之筆數; 僅 count===1 時 user 為該列
 */
function pickUniqueUser(rs) {
    let rows = Array.isArray(rs) ? rs.filter((r) => iseobj(r)) : []
    return {
        user: rows.length === 1 ? rows[0] : null,
        count: rows.length,
    }
}


export { findDupIndex, hasDupKey, findKeyOtherFrom, findTouchedDup, tabWriteKey, mapKeyOf, checkMapKeyBatch, checkUsersWrite, pickUniqueUser }
