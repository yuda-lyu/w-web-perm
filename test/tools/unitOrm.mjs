//單元測試共用之 ORM 替身(規則帳本 R-ORM-01、ADR-026; 對齊 w-orm-lmdb 1.0.38 之對外語意, 同 w-web-sso test/tools/unitProc.mjs 之 mkTable):
//  - insert: 主鍵已存在即略過(ifNoExists); 任一列主鍵 UTF-8 > 1978 B 即整批 reject(LMDB 鍵長上限, 整批性錯誤); 回聚合 { n, nInserted, ok }
//  - save: 逐筆結果陣列 { n, nInserted, nModified, ok[, err] }; 既存以 lodash merge 合併、無則插入(autoInsert); 主鍵過長該筆 ok:0
//  - del: 逐筆結果陣列; 主鍵無效該筆 ok:0、查無 { n:0, ok:1 }
//  - delAll(find): find 為物件時刪除各欄相等之列, 否則全刪
//  - 可注入失敗: fail.insert(整批 reject)、fail.saveIds(該些 id 之 save 逐筆 ok:0)、fail.delIds(del 逐筆 ok:0)
//  mkProcOrm 以 w-serv-orm 之 getMapOrm → getProc 組出真 procOrm(與 WServOrm 內部相同之組裝, 無設定鍵), 測試走真 adjustData / clearXSS / 逐筆檢查
import cloneDeep from 'lodash-es/cloneDeep.js'
import merge from 'lodash-es/merge.js'
import getMapOrm from 'w-serv-orm/src/getMapOrm.mjs'
import getProc from 'w-serv-orm/src/getProc.mjs'

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
                rs = rs.filter((v) => Object.keys(find).every((k) => v[k] === find[k]))
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
        save: async (data) => {
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
                    kp.set(v.id, merge({}, old, cloneDeep(v)))
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
                let hit = !(find && typeof find === 'object') || Object.keys(find).every((k) => v[k] === find[k])
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
