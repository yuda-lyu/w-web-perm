//單元測試共用之 ORM 替身(規則帳本 R-ORM-01、ADR-026; 對齊 w-orm-lmdb 1.0.38 之對外語意, 同 w-web-sso test/tools/unitProc.mjs 之 mkTable):
//  - insert: 主鍵已存在即略過(ifNoExists); 任一列主鍵 UTF-8 > 1978 B 即整批 reject(LMDB 鍵長上限, 整批性錯誤); 回聚合 { n, nInserted, ok }
//  - save: 逐筆結果陣列 { n, nInserted, nModified, ok[, err] }; 既存以 lodash merge 合併(option.merge === false 則整筆覆寫)、無則插入(autoInsert); 主鍵過長該筆 ok:0
//  - del: 逐筆結果陣列; 主鍵無效該筆 ok:0、查無 { n:0, ok:1 }
//  - delAll(find): find 為物件時刪除各欄相等之列, 否則全刪
//  - 可注入失敗: fail.insert(整批 reject)、fail.saveIds(該些 id 之 save 逐筆 ok:0)、fail.delIds(del 逐筆 ok:0)
//  mkProcOrm 以 w-serv-orm 之 getMapOrm → getProc 組出真 procOrm(與 WServOrm 內部相同之組裝, 無設定鍵), 測試走真 adjustData / clearXSS / 逐筆檢查
import cloneDeep from 'lodash-es/cloneDeep.js'
import merge from 'lodash-es/merge.js'
import getMapOrm from 'w-serv-orm/src/getMapOrm.mjs'
import getProc from 'w-serv-orm/src/getProc.mjs'
import WServOrm from 'w-serv-orm/src/WServOrm.mjs'

const MAX_KEY_BYTES = 1978

let arr = (d) => (Array.isArray(d) ? d : [d])
let tooLong = (id) => typeof id === 'string' && Buffer.byteLength(id, 'utf8') > MAX_KEY_BYTES
let validId = (id) => (typeof id === 'string' && id !== '') || typeof id === 'number'

export function mkTable(rows0 = [], fail = {}) {
    let kp = new Map()
    for (let r of rows0) {
        kp.set(r.id, cloneDeep(r))
    }
    let cnt = { insert: 0, save: 0, del: 0, delAll: 0 }
    let failSaveIds = new Set(fail.saveIds || [])
    let failDelIds = new Set(fail.delIds || [])
    let t = {
        cnt,
        get: (id) => cloneDeep(kp.get(id)),
        has: (id) => kp.has(id),
        size: () => kp.size,
        snapshot: () => JSON.stringify([...kp.values()].map((v) => cloneDeep(v)).sort((a, b) => String(a.id).localeCompare(String(b.id)))),
        select: async (find) => {
            let rs = [...kp.values()].map((v) => cloneDeep(v))
            if (find && typeof find === 'object') {
                //條件: 欄位值相等, 或 { $in: [...] }(w-serv-orm 1.1.17 mustExist 之存在檢查用 select({ id: { $in: [...] } }))
                let hit = (v, k) => {
                    let c = find[k]
                    return (c !== null && typeof c === 'object' && Array.isArray(c.$in)) ? c.$in.indexOf(v[k]) >= 0 : v[k] === c
                }
                rs = rs.filter((v) => Object.keys(find).every((k) => hit(v, k)))
            }
            return rs
        },
        insert: async (data) => {
            cnt.insert++
            if (fail.insert) {
                return Promise.reject(fail.insert)
            }
            let ds = arr(data)
            if (ds.some((v) => tooLong(v.id))) {
                return Promise.reject(new Error(`Key size is larger than the maximum key size (${MAX_KEY_BYTES})`))
            }
            let n = 0
            for (let v of ds) {
                if (!kp.has(v.id)) {
                    kp.set(v.id, cloneDeep(v))
                    n++
                }
            }
            return { n: ds.length, nInserted: n, ok: 1 }
        },
        save: async (data, option = {}) => {
            cnt.save++
            return arr(data).map((v) => {
                if (tooLong(v.id)) {
                    return { n: 1, nInserted: 0, nModified: 0, ok: 0, err: `Key size is larger than the maximum key size (${MAX_KEY_BYTES})` }
                }
                if (failSaveIds.has(v.id)) {
                    return { n: 1, nInserted: 0, nModified: 0, ok: 0, err: 'simulated save failure' }
                }
                let old = kp.get(v.id)
                if (old) {
                    kp.set(v.id, (option && option.merge === false) ? cloneDeep(v) : merge({}, old, cloneDeep(v))) //option.merge === false: 整筆覆寫(w-orm-lmdb 之選項)
                    return { n: 1, nModified: 1, ok: 1 }
                }
                kp.set(v.id, cloneDeep(v))
                return { n: 1, nInserted: 1, ok: 1 }
            })
        },
        del: async (data) => {
            cnt.del++
            return arr(data).map((v) => {
                if (!validId(v.id)) {
                    return { n: 0, nDeleted: 0, ok: 0, err: `can not delete by invalid id[${v.id}]` }
                }
                if (failDelIds.has(v.id)) {
                    return { n: 1, nDeleted: 0, ok: 0, err: 'simulated del failure' }
                }
                if (kp.has(v.id)) {
                    kp.delete(v.id)
                    return { n: 1, nDeleted: 1, ok: 1 }
                }
                return { n: 0, nDeleted: 0, ok: 1 }
            })
        },
        delAll: async (find) => {
            cnt.delAll++
            let n = 0
            for (let [id, v] of [...kp.entries()]) {
                //條件同 select: 欄位值相等, 或 { $in: [...] }(w-orm-lmdb 之 delAll 支援; test/tools/api-setup.mjs purgeExternalRows 以真後端庫同法使用)
                let hit = !(find && typeof find === 'object') || Object.keys(find).every((k) => {
                    let c = find[k]
                    return (c !== null && typeof c === 'object' && Array.isArray(c.$in)) ? c.$in.indexOf(v[k]) >= 0 : v[k] === c
                })
                if (hit) {
                    kp.delete(id)
                    n++
                }
            }
            return { n, nDeleted: n, ok: 1 }
        },
    }
    return t
}

//mkProcOrm: 以 getMapOrm → getProc 組出真 procOrm(WServOrm 內部同一組裝; 不帶 opt, w-serv-orm 1.1.10 已無設定鍵)
export function mkProcOrm(ds, woItems) {
    return getProc(getMapOrm(ds, woItems)).procOrm
}

//mkCore: 以**真的** WServOrm(w-serv-orm 1.1.17)包住替身資料表, 取得同一實例之 procOrm、withTabLocks、guardWrite(多人同時編輯之共用核心, 每實例一個鎖管理器; 規則帳本 R-LOCK-CORE-01):
//  WOrm 以替身建構子代之(建構子回傳既有替身表, 故 woItems 即傳入之替身, 測試對替身所做之故障注入與快照照常有效);
//  使測試走真 procOrm(含 mustExist)、真 withTabLocks／guardWrite, 與 WWebPerm 內 WServOrm(ds, WOrm, url, db, { funLog }) 回傳物件同一組裝
//  (WWebPerm 另給 funLog 把診斷輸出導入 srLog, R-ORM-DIAG-01; 此處不給, 診斷輸出照預設走 console——診斷輸出之去向見 test/unit-ormDiag.test.mjs)
export function mkCore(ds, woItems) {
    function WOrmReplica(opt) {
        return woItems[opt.cl]
    }
    let so = WServOrm(ds, WOrmReplica, 'replica', 'replica')
    return {
        so,
        procOrm: so.procOrm,
        withTabLocks: so.withTabLocks,
        guardWrite: so.guardWrite,
        lock: { withTabLocks: so.withTabLocks, guardWrite: so.guardWrite }, //可直接展開進 proc(woItems, procOrm, { srLog, ...core.lock, lockSave })
    }
}

//mkSrLog: 收集 srLog 呼叫(info/warn/error)之替身
export function mkSrLog() {
    let logs = []
    let srLog = {
        info: (o) => logs.push({ level: 'info', ...o }),
        warn: (o) => logs.push({ level: 'warn', ...o }),
        error: (o) => logs.push({ level: 'error', ...o }),
    }
    return { srLog, logs }
}
