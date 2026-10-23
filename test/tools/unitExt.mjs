//外部列保護／載入基準單元測試共用輔助(run07 U1; unit-externalRows／unit-rowDigest／unit-procCore-external 共用, 同一 helper 只定義一次):
//  - 規格常數(SPEC_*): 依規格(R-PRINCIPLE-00 原則 5、externalRows.mjs 檔頭「Lv1 鎖定層級」)與 src/schema/tables/*.mjs 之欄位逐表手列, 不由受測函數推導, 作為期望值之獨立來源
//  - mkRow／rowWith: 依 schema 欄位建完整列; MISSING 表示「該鍵不存在」(不同於 undefined 值)
//  - deepFreeze: 供「不得改動輸入」之斷言(ESM 為嚴格模式, 對凍結物件賦值即拋 TypeError)
import ds from '../../src/schema/index.mjs'


export const TABLES = ['users', 'grups', 'pemis', 'targets']

//KEYS: 各表 schema 欄位(受測函數之 keys 參數, 前端為 vo.$ds[keyTable].keys)
export const KEYS = Object.fromEntries(TABLES.map((t) => [t, ds[t].keys]))

//SPEC_LOCK: 外部列之鎖定欄(身分／結構欄) = schema 欄位扣除 id、from、order、指派欄、伺服器管理欄; 逐表手列(見 src/schema/tables/*.mjs)
//perm-run03: 四表新增 srcKey(外部匯入之來源鍵, 身分欄, 同 from 屬鎖定欄), 故各表鎖定欄多一個 srcKey
export const SPEC_LOCK = {
    users: ['name', 'email', 'description', 'srcKey', 'isAdmin', 'isActive'],
    grups: ['name', 'description', 'srcKey'],
    pemis: ['name', 'description', 'srcKey'],
    targets: ['description', 'srcKey'],
}

//SPEC_ASSIGN: 各表之授權指派欄(後台可寫); targets 無
export const SPEC_ASSIGN = { users: 'cgrups', grups: 'cpemis', pemis: 'crules', targets: null }

//SPEC_SERVER: 伺服器管理欄(procOrm 寫入時覆寫)
export const SPEC_SERVER = ['userId', 'timeCreate', 'userIdUpdate', 'timeUpdate']

//SPEC_DIGEST: 各表之「內容欄位」(內容指紋所含; rowDigest 規格 RD-S1) = schema 欄位扣除 order 與伺服器管理欄; 逐表手列, 作為內容相同／不同判定之獨立來源(run07 U1b 自 unit-rowDigest 移入, 供 unit-procCore-external 共用)
//perm-run03: 四表新增 srcKey(外部匯入之來源鍵), 屬內容欄(入寫入契約 fields, 見 unit-rowDigest RD-C4)
export const SPEC_DIGEST = {
    users: ['id', 'name', 'email', 'description', 'from', 'srcKey', 'cgrups', 'isAdmin', 'isActive'],
    grups: ['id', 'name', 'description', 'from', 'srcKey', 'cpemis'],
    pemis: ['id', 'name', 'description', 'from', 'srcKey', 'crules'],
    targets: ['id', 'description', 'from', 'srcKey'],
}

//MISSING: 於 mkRow／rowWith 之覆寫值, 表示該鍵不存在
export const MISSING = Symbol('missing')


/**
 * 依 schema 欄位建完整列: 每欄預設 `v-<欄位>`, id 預設 r1, order 預設 1, from 預設 '', srcKey 預設 ''
 *
 * srcKey(perm-run03; 外部匯入之來源鍵, 身分欄)預設為空字串: 後台列恆為空, 後台不可新增帶值之列、不可改既有列之值(externalRows.checkExternalWrite: addSrcKey／srcKeyChanged);
 * 預設「`v-srcKey`」會使每個後台新增列夾具都被拒. 需要帶來源鍵之外部列夾具請明給 srcKey 覆寫.
 *
 * @param {String} table 輸入表名
 * @param {Object} [o={}] 輸入覆寫(值為 MISSING 者刪除該鍵)
 * @returns {Object} 回傳列物件
 */
export function mkRow(table, o = {}) {
    let r = {}
    for (let k of KEYS[table]) {
        r[k] = `v-${k}`
    }
    r.id = 'r1'
    r.order = 1
    r.from = ''
    r.srcKey = ''
    return rowWith(r, o)
}


/**
 * 複製列並覆寫(不改輸入; 值為 MISSING 者刪除該鍵)
 *
 * @param {Object} row 輸入列
 * @param {Object} [o={}] 輸入覆寫
 * @returns {Object} 回傳新列
 */
export function rowWith(row, o = {}) {
    let r = { ...row }
    for (let [k, v] of Object.entries(o)) {
        if (v === MISSING) {
            delete r[k]
        }
        else {
            r[k] = v
        }
    }
    return r
}


/**
 * 確定性亂數(mulberry32; 同種子同序列, 供窮舉／隨機交叉驗證)
 *
 * @param {Number} seed 輸入種子(整數)
 * @returns {Function} 回傳無參函數, 每次回 [0, 1) 之亂數
 */
export function mulberry32(seed) {
    let a = seed >>> 0
    return () => {
        a = (a + 0x6D2B79F5) >>> 0
        let t = a
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}


/**
 * 深凍結(物件與陣列遞迴)
 *
 * @param {*} o 輸入值
 * @returns {*} 回傳同一個物件(已凍結)
 */
export function deepFreeze(o) {
    if (o !== null && typeof o === 'object' && !Object.isFrozen(o)) {
        Object.freeze(o)
        for (let v of Object.values(o)) {
            deepFreeze(v)
        }
    }
    return o
}
