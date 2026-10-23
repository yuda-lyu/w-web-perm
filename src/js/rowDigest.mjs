//列內容指紋與載入基準(F-26 過期快照保護; R-PRINCIPLE-00 原則 3「遇衝突或歧義:收嚴＋提示」; 規則帳本 R-BASELINE-01; ADR-037): 純函數(不依賴 Vue／DOM／ORM), 前端與伺服端同一份.
//
//基準(baseline)＝「編輯草稿所依據之那一版資料」之逐列內容指紋 [[id, digest], ...]; 於**開啟編輯(建立草稿)時**由草稿所依據之那份整表計算並綁定,
//之後即使資料推播使 store 變新, 舊草稿仍帶舊基準(外審 B.1: 存檔當下才取基準, 證明的是「store 新」而不是「待存之編輯內容新」).
//伺服端於整表寫入之互斥鎖內以庫內整表現況比對(表級, R-PRINCIPLE-00 原則 7, 使用者 2026-10-22 裁示): 表內任何一列之內容與載入時不同, 或列被增刪, 即整次拒收 saveStale、零寫入, 提示重新載入;
//不部分變更、不上鎖, 先動先贏(run07 版只比對「本次將寫入之列」, run11 改為整表).
//指紋只含內容欄位(排除 order 與伺服器管理欄 userId／timeCreate／userIdUpdate／timeUpdate): 外部同步整來源重寫使每列之建立／更新時間皆變, 內容未變者不應使草稿作廢; order 由儲存時依列序重給
//(外部列之 order 由外部擁有), 僅 order 不同不是內容變更.
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
 * 表級比對: 目前整表與載入基準(草稿所依據之整表)逐列內容指紋與列集合之差異數
 *
 * 比對對象是整表而非「本次將寫入之列」(R-PRINCIPLE-00 原則 7, 使用者 2026-10-22 裁示「以表雜湊比對, 先動先贏」): 表內任何一列之內容(指紋口徑見 getDigestFields: 排除 order 與伺服器管理欄)與基準不同,
 * 或列被增刪(id 集合不同), 即視為資料已被他人／外部同步更新. 只含主鍵為字串之列(同 makeBaseline; 主鍵非字串之列 ORM 不允許入庫, 兩側一致忽略).
 * 前端(判定草稿是否過期、顯示提示)與伺服端(checkBaseline)共用本函數, 口徑單一.
 *
 * @param {Object} p 輸入參數物件
 * @param {Array} p.keys 輸入該表 schema 欄位名陣列
 * @param {Array} p.rows 輸入目前整表之列(伺服端為庫內全部列, 前端為 store 之該表列)
 * @param {Array} p.baseline 輸入載入基準 [[id, digest], ...](須已通過 isBaselineValid; 非陣列視為空基準)
 * @returns {Object} 回傳 { nChanged, nRemoved, nAdded }: 內容指紋不同之列數／基準有而現已不在之列數／基準無而現在才有之列數; 三者皆 0 為一致
 */
function compareBaseline({ keys, rows, baseline }) {
    let kp = new Map(Array.isArray(baseline) ? baseline : [])
    let nChanged = 0
    let nAdded = 0
    let seen = new Set()
    ;(Array.isArray(rows) ? rows : []).forEach((o) => {
        if (!isObj(o) || !isStr(o.id) || seen.has(o.id)) {
            return
        }
        seen.add(o.id)
        if (!kp.has(o.id)) {
            nAdded++
        }
        else if (kp.get(o.id) !== rowDigest(o, keys)) {
            nChanged++
        }
    })
    let nRemoved = 0
    kp.forEach((v, id) => {
        if (!seen.has(id)) {
            nRemoved++
        }
    })
    return { nChanged, nRemoved, nAdded }
}


/**
 * 判斷載入基準相對於目前整表是否已過期(compareBaseline 之布林版, 供前端提示用)
 *
 * @param {Object} p 輸入參數物件(同 compareBaseline)
 * @returns {Boolean} 回傳 true 為過期(有任何一列內容不同或列被增刪)
 */
function isBaselineStale(p) {
    let c = compareBaseline(p)
    return c.nChanged + c.nRemoved + c.nAdded > 0
}


/**
 * 以載入基準做表級過期檢查(在表鎖內, 以庫內整表現況比對; 不符整次拒收、零寫入; R-PRINCIPLE-00 原則 7)
 *
 * 規則: 載入時之整表與目前整表有任何差異(compareBaseline: 任一列內容指紋不同, 或列被增刪)即過期, 不論差異是否落在「本次將寫入之列」——
 * 不部分變更(不逐項判斷哪些可蓋)、不上鎖, 先動先贏; 指紋排除 order 與伺服器管理欄, 故外部同步整批重寫但內容未變(含時間／建立者改變、order 重編)、純粹重排 order 皆不使草稿作廢.
 * 修改前之 run07 版只檢查「本次將寫入之列」(他人改別列不擋), 使用者 2026-10-22 裁示改為表級, 見 ADR-037 Update(run11).
 *
 * @param {Object} p 輸入參數物件
 * @param {Array} p.keys 輸入該表 schema 欄位名陣列
 * @param {Array} p.ltdtOld 輸入該表庫內全部列
 * @param {Array} p.baseline 輸入客戶端載入基準(須已通過 isBaselineValid)
 * @returns {Object|null} 回傳 null 為通過; 否則 { key: 'saveStale', reason, n }: reason 為 rowChanged(有列內容不同)／rowRemoved(基準之列已不在)／rowAdded(多出基準沒有的列), 依序取第一個成立者; n 為差異總列數
 */
function checkBaseline({ keys, ltdtOld, baseline }) {
    let c = compareBaseline({ keys, rows: ltdtOld, baseline })
    let n = c.nChanged + c.nRemoved + c.nAdded
    if (n === 0) {
        return null
    }
    let reason = c.nChanged > 0 ? 'rowChanged' : (c.nRemoved > 0 ? 'rowRemoved' : 'rowAdded')
    return { key: 'saveStale', reason, n }
}


export { cyrb53, getDigestFields, rowDigest, makeBaseline, isBaselineValid, getBaselineDigest, compareBaseline, isBaselineStale, checkBaseline }
export default makeBaseline
