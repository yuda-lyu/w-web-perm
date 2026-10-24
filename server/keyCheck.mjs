import iseobj from 'wsemi/src/iseobj.mjs'
import findTouchedDup from '../src/js/findTouchedDup.mjs' //判準單一擁有者在 src/js(前端清單頁共用), 本檔轉出供 procCore.mjs 與測試沿用既有匯入路徑


//名稱唯一(F-02)與使用者對應鍵(F-14)之判準, 單一擁有者(規則帳本 R-NAME-UNIQ-01／02、R-MAPKEY-01／02／03, ADR-034):
//  外部同步(WWebPerm.mjs:syncAndReplaceTabs)、後台整表寫入(procCore.mjs:updateTabItems)、登入查找(WWebPerm.mjs:getTokenUser／getGenUserByKV)只呼叫本檔, 不複製判準.
//同表寫入互斥(外審 sol R10): 外部同步與後台整表寫入對同一張表須共用同一把鎖(否則兩者各自「先檢查名稱／對應鍵、後寫入」可交錯而略過 F-02／F-14);
//perm-run01 起該鎖即 w-serv-orm 實例之 withTabLocks(每表一鍵), 由下方 withTabLocks 以階層巢狀取得, 不再有套內自建之鎖鍵(tabWriteKey 已移除).
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


//取鎖階層(規則帳本 R-WRITE-LOCK-02, ADR-036; perm-run01 起鎖管理器改為 w-serv-orm 實例之 withTabLocks, R-LOCK-CORE-01): 引用鏈序「被引用者先、引用端後」targets → pemis → grups → users(引用端之階層恆高於被引用者);
//所有寫入入口(後台整表寫入、外部同步、引用連帶之引用端寫入)取得的是**同一個**鎖管理器(WServOrm 回傳之 withTabLocks, 每表一鍵、不可重入), 與 w-serv-orm 之 guardWrite 共鎖.
//多把表鎖一律由外而內「依階層」逐表巢狀取鎖(每層一次只宣告一張表), 不使用核心之多表一次宣告(其碼元序與階層序不同, 混用即成環);
//同一把鎖不巢狀, 持鎖後才讀取、預檢與寫入, 使預檢與寫入涵蓋同一版本(外審 A.3)
let TAB_LOCK_RANK = { targets: 0, pemis: 1, grups: 2, users: 3 }


/**
 * 依取鎖階層取齊指定表鎖後執行 fn(單一取鎖函數): 表名去重、依 targets → pemis → grups → users 排序(階層外之表名排最後、彼此依字典序), 由外而內巢狀取 lockTabs([表]);
 * 各路徑取鎖次序一致故不成環.
 * 分段取鎖: 先取被引用表之鎖、依該表之新舊資料判定須改寫引用端後, 才在內層以 held 指明已持之表再取引用端表之鎖(寫入引用端表不涉改名／刪除者免取, 免無謂之互等);
 * held 非空時, keyTables 之階層須全數高於 held(否則拋錯, 即違反階層, 不嘗試取鎖).
 *
 * @param {Function} lockTabs 輸入 w-serv-orm 實例之 withTabLocks(tableNames, fn)
 * @param {Array} keyTables 輸入須持鎖之表名陣列
 * @param {Function} fn 輸入持鎖後執行之 async 函數
 * @param {Array} [held=[]] 輸入呼叫端已持有鎖之表名陣列(內層分段取鎖用)
 * @returns {Promise} 回傳 fn 之結果
 */
function withTabLocks(lockTabs, keyTables, fn, held = []) {
    let rank = (t) => (Object.prototype.hasOwnProperty.call(TAB_LOCK_RANK, t) ? TAB_LOCK_RANK[t] : Infinity)
    let ts = [...new Set(keyTables)].sort((a, b) => (rank(a) - rank(b)) || (a < b ? -1 : (a > b ? 1 : 0)))
    if (held.length > 0) {
        let maxHeld = Math.max(...held.map(rank))
        if (ts.some((t) => rank(t) <= maxHeld)) {
            throw new Error('tab lock order violation')
        }
    }
    let run = fn
    for (let k = ts.length - 1; k >= 0; k--) {
        let inner = run
        let t = ts[k]
        run = () => lockTabs([t], inner)
    }
    return run()
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


//users 登入對應 mappingBy='id' 之 O1 規則(perm-run04, 規則帳本 R-MAPKEY-04; 規格 dspec/外部匯入之定義與機制.md 第 9 節末, 主控 2026-10-24 定案):
//  外部列(from 非空)以外部 token 之使用者 id 對 srcKey(其 id 是本系統配發之內部主鍵, 不是登入識別), 後台列(from 空)對 id.
//  perm-run05(主控 2026-10-24 收件裁示): 登入識別值須跨全表唯一, 「不論 isActive」「含他來源」: 不同外部系統之使用者 id 碰撞常見而非同一人, 且停用列可被重新啟用,
//  故「只有一列有效」不得放行(否則已停用者之 token 會對到他來源之有效列). 撞值之組合: 同一登入識別值出現在兩列, 且該對不是「兩後台列」(同一主鍵)、「同一來源皆有 srcKey 之兩外部列」(srcKeyDuplicate／srcKeyConflict 於同步端另拒)與「同一來源皆無 srcKey 之兩舊外部列」(同一主鍵); 詳見 findLoginIdClashDetail.
//  匯入批次、後台存檔、登入三處皆拒(原則 3 收嚴＋提示、原則 4 所有入口一致); 登入時命中多筆(不論有效與否)即拒絕, 恰 1 筆且停用視同查無.
//  判準(loginIdOf／findLoginUsers／findLoginIdClashDetail)單一擁有者在本檔; 外部同步(syncCore.mjs)、後台整表寫入(procCore.mjs)、登入查找與 getPermUserInfor(WWebPerm.mjs)只呼叫本檔.
let isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
let isEStr = (v) => isStr(v) && v.length > 0


/**
 * users 列在 mappingBy='id' 下的登入識別值: 後台列(from 空)為 id; 外部列(from 非空)為 srcKey;
 * 遷移前之舊外部列(升版前同步寫入、尚無 srcKey)暫以 id(與升版前行為相同, 首次匯入依規格補上 srcKey 後即改以 srcKey).
 *
 * @param {Object} row users 列
 * @returns {String} 登入識別值; 無可用鍵(非物件、id 空或非字串)為 ''
 */
function loginIdOf(row) {
    if (!isObj(row)) {
        return ''
    }
    if (isEStr(row.from) && isEStr(row.srcKey)) {
        return row.srcKey
    }
    return isEStr(row.id) ? row.id : ''
}


/**
 * 登入查找(getTokenUser／getPermUserInfor): 回 { user, count }(僅恰 1 筆有效列時 user 為該列, 多筆不取首筆).
 * 'email'／'name': 以該欄位查 perm users 中有效(isActive='y')之列(不變, 同 pickUniqueUser).
 * 其餘(含預設 'id'): 後台列對 id、外部列對 srcKey(見上方 O1 規則), 「不論 isActive」計筆(perm-run05): 兩次帶條件之 select(id、srcKey 各一; 不帶 isActive, 不做全表讀取),
 * 合併去重後以 loginIdOf 複判; 多於 1 筆 → count 為筆數、user 為 null(不以「只有一列有效」放行); 恰 1 筆且有效 → 該列; 恰 1 筆但停用 → count 0(視同查無).
 * ORM 讀取失敗原樣拋出(不吞成 0 筆).
 *
 * @param {Object} tabUsers 輸入 users 表之 ORM 物件(select)
 * @param {String} mappingBy 'id'｜'email'｜'name'(其他值視同 'id')
 * @param {String} vSelf 外部 token 之使用者對應值(須為非空字串)
 * @returns {Promise<Object>} { user, count }
 */
async function findLoginUsers(tabUsers, mappingBy, vSelf) {
    let key = mapKeyOf(mappingBy)
    if (key !== null) {
        return pickUniqueUser(await tabUsers.select({ [key]: vSelf, isActive: 'y' }))
    }
    let rsId = await tabUsers.select({ id: vSelf })
    let rsSrc = await tabUsers.select({ srcKey: vSelf })
    let kp = new Map() //以 id 去重(srcKey 等於 id 之遷移後外部列會被兩次查詢各命中一次)
    for (let r of [...(Array.isArray(rsId) ? rsId : []), ...(Array.isArray(rsSrc) ? rsSrc : [])]) {
        if (isObj(r) && isEStr(r.id)) {
            kp.set(r.id, r)
        }
    }
    let hits = [...kp.values()].filter((r) => loginIdOf(r) === vSelf)
    if (hits.length === 1 && hits[0].isActive !== 'y') {
        return { user: null, count: 0 }
    }
    return pickUniqueUser(hits)
}


/**
 * 登入識別撞值(mappingBy='id'): 回傳寫入後之表 rowsAfter 中第一個「被本次觸及」之列, 其登入識別值(loginIdOf)與另一列相同且屬撞值組合者之細節, 無則 null.
 * 「不論 isActive」「含他來源」(perm-run05): 撞值組合＝同一登入識別值出現在兩列, 且該對不是下列三種不屬登入識別撞值者:
 *  - 兩後台列(登入識別值＝主鍵 id, 同一主鍵於表中不可並存);
 *  - 同一來源(from 相同)之兩外部列且皆有 srcKey(srcKeyDuplicate／srcKeyConflict 於同步端另拒);
 *  - 同一來源之兩舊外部列(皆無 srcKey, 登入識別值＝id, 即同一主鍵).
 * 撞值之種類:
 *  - adminId: 一為後台列(from 空)、一為外部列(其 srcKey; 舊外部列無 srcKey 者為其 id)相同;
 *  - otherFrom: 兩外部列來源不同而登入識別值相同;
 *  - sameFrom: 同一來源之兩外部列, 一有 srcKey、一為舊形(無 srcKey, 以其 id 為登入識別)而該 id 等於對方 srcKey——即同步端之 claimTwice(srcKeyConflict), 登入亦命中兩筆
 *    (後台新增外部形列只在 lockExternalRows 為假時可能; 外審 sol 第一輪#1).
 * 歷史既有(未被觸及)之撞值不擋(否則已有歷史資料之庫無法在後台修復; 同 R-MAPKEY-03). 外部列之內部 id(有 srcKey 者)不是登入識別, 不參與.
 *
 * @param {Array} rowsAfter 寫入後之 users 全表(後台整表寫入為送入之整表; 外部匯入為「他 from 之列＋本批」)
 * @param {Function} isTouched (row, index) → Boolean, 該列是否為本次造成或觸及
 * @returns {Object|null} { k, kOther, kind: 'adminId'|'otherFrom'|'sameFrom' }(k 為第一個被觸及且撞值之列索引, kOther 為與之撞值的另一列中索引最小者), 無則 null
 */
function findLoginIdClashDetail(rowsAfter, isTouched) {
    if (!Array.isArray(rowsAfter)) {
        return null
    }
    let groups = new Map() //登入識別值 → 列索引陣列(以 Map 計, 免原型鍵名誤判)
    rowsAfter.forEach((r, k) => {
        let v = loginIdOf(r)
        if (v === '') {
            return
        }
        if (!groups.has(v)) {
            groups.set(v, [])
        }
        groups.get(v).push(k)
    })
    for (let k = 0; k < rowsAfter.length; k++) {
        let r = rowsAfter[k]
        let v = loginIdOf(r)
        if (v === '' || !isTouched(r, k)) {
            continue
        }
        let rx = isEStr(r.from)
        for (let kOther of groups.get(v)) {
            if (kOther === k) {
                continue
            }
            let o = rowsAfter[kOther]
            let ox = isEStr(o.from)
            if (!rx && !ox) {
                continue
            }
            if (rx && ox && r.from === o.from) {
                //同一來源: 皆有 srcKey 或皆無 srcKey 者不在此判; 一有一無(claimTwice 形)才撞
                if (isEStr(r.srcKey) === isEStr(o.srcKey)) {
                    continue
                }
                return { k, kOther, kind: 'sameFrom' }
            }
            return { k, kOther, kind: (rx && ox) ? 'otherFrom' : 'adminId' }
        }
    }
    return null
}


/**
 * 登入識別撞值(mappingBy='id'): findLoginIdClashDetail 之索引版, 回第一個被觸及且撞值之列索引, 無則 -1
 *
 * @param {Array} rowsAfter 寫入後之 users 全表
 * @param {Function} isTouched (row, index) → Boolean, 該列是否為本次造成或觸及
 * @returns {Number} 撞值列之索引, 無為 -1
 */
function findLoginIdClash(rowsAfter, isTouched) {
    let d = findLoginIdClashDetail(rowsAfter, isTouched)
    return d === null ? -1 : d.k
}


export { findDupIndex, hasDupKey, findKeyOtherFrom, findTouchedDup, withTabLocks, mapKeyOf, checkMapKeyBatch, checkUsersWrite, pickUniqueUser, loginIdOf, findLoginUsers, findLoginIdClash, findLoginIdClashDetail }
