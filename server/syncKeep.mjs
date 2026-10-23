//外部同步(server/syncCore.mjs:syncAndReplaceTabs; perm-run03 起依 srcKey 差異同步, 本檔函數由其以「配對到之庫內 id／新配之 id」呼叫)之三個純函數(F-23; R-PRINCIPLE-00 原則 3、5; 規則帳本 R-EXT-OWN-01; ADR-037), 不依賴 ORM／Vue, 供單元測試:
//  keepAssignOnMissing: users 列「payload 缺 cgrups 鍵」時保留庫內指派(指派欄屬後台, Lv1; 含該鍵則以外部為準)——修正前 ltdtmapping 缺鍵補 ''、delAll＋insert 即清掉後台已指派之群組(run06 已知限制④);
//  keepAssignByEntity: grups 列缺 cpemis 鍵、pemis 列缺 crules 鍵時同樣保留(run08; 同為後台可寫之指派欄)——群組／權限無登入對應鍵, 實體身分依 id(無 id 者依名稱), 見該函數說明;
//  countSrcKeyRenumber: 同一 from 同一批內出現「同名異 srcKey」(疑似外部來源鍵重編)之筆數, 供 warn log 與頁面提示(外部來源鍵不穩定時, 來源鍵消失＝刪除會每次清理引用而抹掉後台指派, 不加開關, 以提示處理; 原 countIdRenumber 之 id 口徑隨差異同步改為 srcKey)


let isStr = (v) => typeof v === 'string'
let isObj = (v) => v !== null && typeof v === 'object'
let hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k)


//toId: 列之 id 取字串形式(非空字串; 有限數字取其字串), 否則 null(同 refCascade.fillIdlessIds)
let toId = (v) => {
    let id = isObj(v) ? v.id : undefined
    if (isStr(id) && id !== '') {
        return id
    }
    return (typeof id === 'number' && Number.isFinite(id)) ? String(id) : null
}


/**
 * 記錄 payload 各列是否自帶指定鍵(須於 ltdtmapping 補鍵之前呼叫; ltdtmapping 為 1:1 同序, 故可依索引對應)
 *
 * @param {Array} rowsRaw 輸入 payload 原始列(皆為物件)
 * @param {String} key 輸入鍵名(如 'cgrups')
 * @returns {Array} 回傳布林陣列, 第 k 項為第 k 列是否自帶該鍵(自有屬性)
 */
function markHasKey(rowsRaw, key) {
    return rowsRaw.map((v) => isObj(v) && hasOwn(v, key))
}


/**
 * users 列缺 cgrups 鍵者, 以庫內同一 from 之對應列之值取代(對應: 先依 id; 無 id 者在 mappingBy 為 email／name 時依該欄位, 須恰命中 1 筆; 對不到則不保留, 即新使用者/無從對應者維持 '')
 *
 * @param {Object} p 輸入參數物件
 * @param {Array} p.rows 輸入已 ltdtmapping 並帶 from 之本批列
 * @param {Array} p.hasKey 輸入 markHasKey 之結果(與 rows 同序同長)
 * @param {Array} p.rowsOldSameFrom 輸入庫內同一 from 之既有 users 列
 * @param {String} [p.mappingBy='id'] 輸入使用者對應鍵('id'｜'email'｜'name')
 * @param {String} [p.key='cgrups'] 輸入指派欄名稱
 * @param {Function} [p.isKeepable] 輸入判斷庫內值是否可保留之函數(收庫內值, 回布林), 預設恆可; 不可保留者(如無法原樣通過寫入前驗證)不保留並計入 nSkip
 * @returns {Object} 回傳 { rows, nKeep, nSkip, nConflict }: rows 為新陣列(被保留值之列為複本, 其餘同一參考), nKeep 為保留筆數, nSkip 為因 isKeepable 為假而未保留之筆數,
 *   nConflict 為因身分矛盾而未保留之筆數;
 *   mappingBy 為 email／name 時, 以 id 對到之舊列其對應鍵值須與本批列相同、且庫內同一來源不得另有別列持有同值(舊登入擁有者矛盾), 否則不保留(同來源 id 重用／重編之矛盾)
 */
function keepAssignOnMissing({ rows, hasKey, rowsOldSameFrom, mappingBy = 'id', key = 'cgrups', isKeepable = () => true }) {
    let oldById = new Map()
    let oldByMap = new Map() //mappingBy 欄位值 → 同值之既有列陣列
    rowsOldSameFrom.forEach((o) => {
        if (!isObj(o)) {
            return
        }
        if (isStr(o.id)) {
            oldById.set(o.id, o)
        }
        if ((mappingBy === 'email' || mappingBy === 'name') && isStr(o[mappingBy]) && o[mappingBy] !== '') {
            if (!oldByMap.has(o[mappingBy])) {
                oldByMap.set(o[mappingBy], [])
            }
            oldByMap.get(o[mappingBy]).push(o)
        }
    })
    let byMap = mappingBy === 'email' || mappingBy === 'name'
    let nKeep = 0
    let nSkip = 0
    let nConflict = 0
    let out = rows.map((v, k) => {
        if (hasKey[k] === true || !isObj(v)) {
            return v
        }
        let id = toId(v)
        let o = null
        if (id !== null) {
            o = oldById.has(id) ? oldById.get(id) : null

            //對應鍵矛盾(外審 sol R3): mappingBy 為 email／name 時, 登入以對應鍵找使用者; 本批列以 id 對到之舊列, 其對應鍵值須與本批列相同, 否則為同來源 id 重用／重編(id 指向 A、對應鍵卻是 B),
            //自動把 A 之後台指派移轉給 B 屬靜默擇一(R-PRINCIPLE-00 原則 3), 一律不保留(cgrups 維持空字串, 收嚴); 不保留者計入 nConflict 供呼叫端提示(原則 3: 收嚴須附提示, 增量外審 N2)
            if (o !== null && byMap && (v[mappingBy] === undefined ? '' : v[mappingBy]) !== (o[mappingBy] === undefined ? '' : o[mappingBy])) {
                o = null
                nConflict++
            }

            //舊登入擁有者矛盾(增量外審 N1): 對應鍵值非空時, 庫內同一來源須只有該列自己持有此值; 若另有別列(如舊 active 擁有者為另一個 id, 本列為停用列被本批改為啟用)持有同值,
            //登入查找(以對應鍵＋isActive)原指向別列, 保留本列之指派會使該登入值改取得本列之授權(移轉), 同樣不保留
            if (o !== null && byMap && isStr(v[mappingBy]) && v[mappingBy] !== '') {
                let cands = oldByMap.get(v[mappingBy])
                if (cands !== undefined && cands.some((c) => c !== o)) {
                    o = null
                    nConflict++
                }
            }
        }
        else if (byMap && isStr(v[mappingBy]) && v[mappingBy] !== '') {
            let cands = oldByMap.get(v[mappingBy])
            o = (cands !== undefined && cands.length === 1) ? cands[0] : null

            //對應鍵命中多筆(如同值之啟用與停用列)無從判定歸屬, 不取首筆而不保留; 須附提示, 計入 nConflict(收嚴＋提示, run08 外審 sol #3; 與 keepAssignByEntity 之無 id 同名多筆一致)
            if (cands !== undefined && cands.length > 1) {
                nConflict++
            }
        }
        if (o === null || !hasOwn(o, key)) {
            return v
        }

        //保留值須能通過與外部寫入同一套寫入前驗證(外審 sol R4): 保留之歷史值若含會被 clearXSS 改寫之標記或非純量, 入庫時被改寫而使引用改指他名(增權), 一律不保留(視為空, 收嚴)
        if (!isKeepable(o[key])) {
            nSkip++
            return v
        }
        nKeep++
        return { ...v, [key]: o[key] }
    })
    return { rows: out, nKeep, nSkip, nConflict }
}


/**
 * grups 列缺 cpemis 鍵、pemis 列缺 crules 鍵者, 以庫內同一 from 之同一實體之值取代(run08; 與 keepAssignOnMissing 同一精神: 指派欄屬後台, 同步不得靜默清掉; 含該鍵則以外部為準)
 *
 * 實體身分(群組／權限無登入對應鍵, 不適用 mappingBy 之矛盾檢查): 有 id 者依 id 對到庫內同一 from 之列; 無 id 者(寫入時 ORM 補隨機主鍵, 身分不穩定)依名稱, 與引用連帶(refCascade.fillIdlessIds)同一口徑:
 * 對庫內同一 from 中 id 未被本批帶用、名稱相同之列, 須恰 1 筆(同名多筆為歷史同名, 不取首筆); 對不到者視為新實體, 維持缺鍵之預設('').
 * 收嚴(原則 3, 不保留並計入 nConflict, 供呼叫端記 warn): ①無 id 而同名命中多筆; ②同 id 但名稱不同(改名)且 cascadeRename 為假——引用不跟著改時名稱即授權身分,
 * 把舊名之指派移轉給新名, 會使原引用新名之使用者(懸空)取得該授權; ③同 id 改名而新舊名稱有一方非字串(歷史資料)——級聯無從處理(缺欄視 '', 同 refCascade.entName), 保留同樣會增權(run08 外審 sol #1).
 *
 * @param {Object} p 輸入參數物件
 * @param {Array} p.rows 輸入已 ltdtmapping 並帶 from 之本批列
 * @param {Array} p.hasKey 輸入 markHasKey 之結果(與 rows 同序同長)
 * @param {Array} p.rowsOldSameFrom 輸入庫內同一 from 之既有列
 * @param {String} p.key 輸入指派欄名稱('cpemis'｜'crules')
 * @param {Boolean} [p.cascadeRename=true] 輸入改名是否連帶更新引用(opt.cascadeRename), 預設 true
 * @param {Function} [p.isKeepable] 輸入判斷庫內值是否可保留之函數(收庫內值, 回布林), 預設恆可; 不可保留者不保留並計入 nSkip
 * @returns {Object} 回傳 { rows, nKeep, nSkip, nConflict }: rows 為新陣列(被保留值之列為複本, 其餘同一參考), nKeep 為保留筆數, nSkip 為因 isKeepable 為假而未保留之筆數, nConflict 為因身分不確定而未保留之筆數
 */
function keepAssignByEntity({ rows, hasKey, rowsOldSameFrom, key, cascadeRename = true, isKeepable = () => true }) {
    let nameOf = (r) => (r.name === undefined ? '' : r.name) //同 refCascade.entName: 缺欄視 ''
    let idsBatch = new Set()
    rows.forEach((v) => {
        let id = toId(v)
        if (id !== null) {
            idsBatch.add(id)
        }
    })
    let oldById = new Map()
    let oldByName = new Map() //名稱 → 本批未帶用其 id 之既有列陣列(無 id 者之對應池)
    rowsOldSameFrom.forEach((o) => {
        if (!isObj(o) || !isStr(o.id)) {
            return
        }
        oldById.set(o.id, o)
        if (isStr(o.name) && !idsBatch.has(o.id)) {
            if (!oldByName.has(o.name)) {
                oldByName.set(o.name, [])
            }
            oldByName.get(o.name).push(o)
        }
    })
    let nKeep = 0
    let nSkip = 0
    let nConflict = 0
    let out = rows.map((v, k) => {
        if (hasKey[k] === true || !isObj(v)) {
            return v
        }
        let id = toId(v)
        let o = null
        if (id !== null) {
            o = oldById.has(id) ? oldById.get(id) : null

            //改名(同 id 異名)須「引用跟著改」才算同一實體: cascadeRename 為假時引用不跟著改; 為真時級聯只處理新舊名稱皆為字串之改名(refCascade.diffRefTargets: 缺欄視 '', 非字串不成實體),
            //舊名稱為歷史非字串者無從級聯, 新名稱撞懸空名之檢查(renameCascadeNameInUse)亦不會觸發, 保留會把舊列之指派帶給原指向新名之懸空引用者, 同樣不保留(run08 外審 sol #1)
            if (o !== null && nameOf(o) !== nameOf(v) && (cascadeRename === false || !isStr(nameOf(o)) || !isStr(nameOf(v)))) {
                o = null
                nConflict++
            }
        }
        else if (isStr(v.name) && oldByName.has(v.name)) {
            let cands = oldByName.get(v.name)
            if (cands.length === 1) {
                o = cands[0]
            }
            else {
                nConflict++
            }
        }
        if (o === null || !hasOwn(o, key)) {
            return v
        }

        //保留值須能通過與外部寫入同一套寫入前驗證(同 keepAssignOnMissing): 不通過者不保留(視為空, 收嚴)
        if (!isKeepable(o[key])) {
            nSkip++
            return v
        }
        nKeep++
        return { ...v, [key]: o[key] }
    })
    return { rows: out, nKeep, nSkip, nConflict }
}


/**
 * 同一 from 同一批內「同名異 srcKey」之筆數(疑似外部來源鍵重編; perm-run03 範圍二: 差異同步下身分是 srcKey, 原「同名異 id」之判定口徑改為 srcKey)
 *
 * 本批列之 srcKey 不屬庫內同一 from 任何列(新來源鍵), 而庫內同一 from 有另一列同名、其來源鍵不在本批(將被刪除)——外部來源若重編來源鍵(如目錄重建後 GUID 全換),
 * 該列等於「刪舊增新」, 引用每次被連帶清理而抹掉後台指派(原則 6: 新實體不繼承). 庫內尚無 srcKey 之列(遷移前資料)以其 id 為身分候選(批次 srcKey 等於其 id 者視為同一列, 見 syncCore).
 *
 * @param {Array} rowsOldSameFrom 輸入庫內同一 from 之既有列(grups／pemis; users 之 name 可重複故不適用)
 * @param {Array} rows 輸入本批列(須帶 srcKey 與 name)
 * @returns {Number} 回傳筆數
 */
function countSrcKeyRenumber(rowsOldSameFrom, rows) {
    let idOf = (o) => (isStr(o.srcKey) && o.srcKey !== '') ? o.srcKey : (isStr(o.id) ? o.id : null) //庫內列之身分候選: 有 srcKey 用 srcKey, 遷移前資料用 id
    let keysBatch = new Set()
    rows.forEach((v) => {
        if (isObj(v) && isStr(v.srcKey)) {
            keysBatch.add(v.srcKey)
        }
    })
    let keysOld = new Set()
    let goneByName = new Set() //將被刪除之庫內列之名稱(其身分不在本批)
    rowsOldSameFrom.forEach((o) => {
        if (!isObj(o)) {
            return
        }
        let k = idOf(o)
        if (k !== null) {
            keysOld.add(k)
        }
        if (k !== null && !keysBatch.has(k) && isStr(o.name)) {
            goneByName.add(o.name)
        }
    })
    let n = 0
    rows.forEach((v) => {
        if (isObj(v) && isStr(v.srcKey) && !keysOld.has(v.srcKey) && isStr(v.name) && goneByName.has(v.name)) {
            n++
        }
    })
    return n
}


export { markHasKey, keepAssignOnMissing, keepAssignByEntity, countSrcKeyRenumber }
