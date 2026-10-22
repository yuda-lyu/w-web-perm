//列內容指紋與載入基準(F-26 過期快照保護; R-PRINCIPLE-00 原則 3「遇衝突或歧義:收嚴＋提示」; 規則帳本 R-BASELINE-01; ADR-037): 純函數(不依賴 Vue／DOM／ORM), 前端與伺服端同一份.
//
//基準(baseline)＝「編輯草稿所依據之那一版資料」之逐列內容指紋 [[id, digest], ...]; 於**開啟編輯(建立草稿)時**由草稿所依據之那份列計算並綁定,
//之後即使資料推播使 store 變新, 舊草稿仍帶舊基準(外審 B.1: 存檔當下才取基準, 證明的是「store 新」而不是「待存之編輯內容新」).
//伺服端於整表寫入之互斥鎖內以庫內現況比對: 本次將寫入(新增／修改／刪除)之列, 其庫內版本須與草稿所依據者相同, 否則整次拒收 saveStale、零寫入, 提示重新載入.
//指紋只含內容欄位(排除 order 與伺服器管理欄 userId／timeCreate／userIdUpdate／timeUpdate): 外部同步整來源重寫使每列之建立／更新時間皆變, 內容未變者不應使草稿作廢; order 由儲存時依列序重給.
//
//未帶基準之舊客戶端: 後台列維持舊行為(最後寫入者勝, ADR-013); 但**修改外部列之指派欄**無從證明快照新舊(Lv1 放行之指派欄不得因舊快照還原外部已撤銷之授權, 外審 B.2), 依原則 3 收嚴拒收(saveBaselineRequired).

import { SERVER_FIELDS } from './externalRows.mjs'


let isStr = (v) => typeof v === 'string'
let isObj = (v) => v !== null && typeof v === 'object'


//cyrb53: 53 位元非密碼學雜湊(純 JS, 前後端皆可用; 用途為一致性比對, 非安全邊界)
function cyrb53(str, seed = 0) {
    let h1 = 0xdeadbeef ^ seed
    let h2 = 0x41c6ce57 ^ seed
    for (let i = 0; i < str.length; i++) {
        let ch = str.charCodeAt(i)
        h1 = Math.imul(h1 ^ ch, 2654435761)
        h2 = Math.imul(h2 ^ ch, 1597334677)
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
    return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}


/**
 * 取得列內容指紋所含欄位: schema 全部欄位扣除 order 與伺服器管理欄
 *
 * @param {Array} keys 輸入該表 schema 欄位名陣列(ds[keyTable].keys)
 * @returns {Array} 回傳欄位名陣列
 */
function getDigestFields(keys) {
    return (Array.isArray(keys) ? keys : []).filter((k) => k !== 'order' && SERVER_FIELDS.indexOf(k) < 0)
}


/**
 * 計算單列內容指紋(欄位依 schema 次序; 缺欄視為 null; 與列內其他鍵、鍵序無關)
 *
 * @param {Object} row 輸入列物件
 * @param {Array} keys 輸入該表 schema 欄位名陣列
 * @returns {String} 回傳指紋字串
 */
function rowDigest(row, keys) {
    let fields = getDigestFields(keys)
    let vals = fields.map((k) => {
        let v = isObj(row) ? row[k] : undefined
        return v === undefined ? null : v
    })
    return cyrb53(JSON.stringify(vals)).toString(36)
}


/**
 * 由草稿所依據之列計算載入基準(只含主鍵為字串之列)
 *
 * @param {Array} rows 輸入草稿所依據之那份列(開啟編輯時之 store 快照, 非存檔當下)
 * @param {Array} keys 輸入該表 schema 欄位名陣列
 * @returns {Array} 回傳 [[id, digest], ...]
 */
function makeBaseline(rows, keys) {
    let rs = []
    ;(Array.isArray(rows) ? rows : []).forEach((r) => {
        if (isObj(r) && isStr(r.id)) {
            rs.push([r.id, rowDigest(r, keys)])
        }
    })
    return rs
}


/**
 * 判斷客戶端送入之基準格式是否合法(陣列, 每項為 [字串, 字串])
 *
 * @param {*} baseline 輸入客戶端送入之基準
 * @returns {Boolean} 回傳是否合法
 */
function isBaselineValid(baseline) {
    if (!Array.isArray(baseline) || !baseline.every((e) => Array.isArray(e) && e.length === 2 && isStr(e[0]) && isStr(e[1]))) {
        return false
    }

    //同 id 不得出現兩次(外審 sol R8): 同 id 帶不同版本為矛盾之基準, 由列序決定採哪版屬靜默擇一(R-PRINCIPLE-00 原則 3), 格式驗證即拒收
    let ids = new Set()
    for (let e of baseline) {
        if (ids.has(e[0])) {
            return false
        }
        ids.add(e[0])
    }
    return true
}


/**
 * 取得基準中某列之指紋(供前端確認草稿所依據之某列版本於期間是否變動)
 *
 * @param {Array} baseline 輸入載入基準 [[id, digest], ...]
 * @param {String} id 輸入列 id
 * @returns {String|undefined} 回傳該列指紋; 基準內無該列為 undefined
 */
function getBaselineDigest(baseline, id) {
    let hit = (Array.isArray(baseline) ? baseline : []).find((e) => Array.isArray(e) && e[0] === id)
    return hit === undefined ? undefined : hit[1]
}


/**
 * 以載入基準檢查本次寫入是否基於過期快照(於 ltdtDiffByKey 之後、寫入之前, 在表鎖內以庫內現況比對; 不符整次拒收、零寫入)
 *
 * 只檢查「本次將寫入」之列: 修改列與刪除列之庫內版本須與基準相同(基準無該列＝草稿之後才新增, 亦視為過期); 新增列之主鍵若在基準內＝草稿所依據之版本有、現已不在(被刪或被同步移除), 復活會使已撤銷之列回來, 亦視為過期.
 * 未異動之列(same)不檢查, 故他人在草稿之後新增而草稿原樣帶回之列、內容未變之外部列不使存檔作廢; 修改列若內容指紋與庫內相同(僅 order／伺服器管理欄不同, 如他人新增之列因列序被重編 order)亦不檢查——送入之內容並未覆蓋他人版本.
 *
 * @param {Object} p 輸入參數物件
 * @param {Array} p.keys 輸入該表 schema 欄位名陣列
 * @param {Object} p.r 輸入 { add, del, diff, same }
 * @param {Array} p.ltdtOld 輸入該表庫內全部列
 * @param {Array} p.baseline 輸入客戶端載入基準(須已通過 isBaselineValid)
 * @returns {Object|null} 回傳 null 為通過; 否則 { key: 'saveStale', reason, n }: reason 為 diffStale／delStale／addExisted
 */
function checkBaseline({ keys, r, ltdtOld, baseline }) {
    let kp = new Map(baseline)
    let oldById = new Map()
    ltdtOld.forEach((o) => {
        if (isObj(o) && isStr(o.id)) {
            oldById.set(o.id, o)
        }
    })
    let bad = []
    r.diff.forEach((row) => {
        let o = isObj(row) && isStr(row.id) ? oldById.get(row.id) : undefined
        if (o !== undefined && rowDigest(row, keys) === rowDigest(o, keys)) {
            return //內容與庫內相同(僅 order 或伺服器管理欄不同, 如開框後他人新增之列依列序被重編 order): 草稿之內容並未覆蓋他人版本, 不算過期
        }
        if (o === undefined || !kp.has(row.id) || kp.get(row.id) !== rowDigest(o, keys)) {
            bad.push('diffStale')
        }
    })
    r.del.forEach((o) => {
        if (!isObj(o) || !isStr(o.id) || !kp.has(o.id) || kp.get(o.id) !== rowDigest(o, keys)) {
            bad.push('delStale')
        }
    })
    r.add.forEach((row) => {
        if (isObj(row) && isStr(row.id) && kp.has(row.id)) {
            bad.push('addExisted')
        }
    })
    if (bad.length === 0) {
        return null
    }
    return { key: 'saveStale', reason: bad[0], n: bad.length }
}


export { cyrb53, getDigestFields, rowDigest, makeBaseline, isBaselineValid, getBaselineDigest, checkBaseline }
export default makeBaseline
