//懸空引用之一次性清理(升版工具; 規則帳本 R-REF-CASCADE-01 之配套): 稽核 users.cgrups／grups.cpemis／pemis.crules 中查無實體之引用, 預設只列不改, apply 時才寫入.
//由專案根之 g_authRefsClean.mjs 呼叫(連專案資料庫); 邏輯抽成可注入 woItems 之函數, 供單元測試以臨時資料庫驗證(test/unit-refAudit.test.mjs).
//
//apply 之順序(任一步失敗即中止, 其後之步驟不執行; 備份失敗時零寫入):
//  1. 讀取四表並稽核(src/js/refAudit.mjs); 無須清理者不備份、不寫入
//  2. (a) 備份整個資料庫(getDb.backup(woItems), 落點為模組載入時之工作目錄之 backup-時間.json, 同 g_backupDb.mjs; 可由 backupDb 注入)
//  3. (b) 另匯出將被改寫之三張引用端表(users／grups／pemis)全部列(並附 targets 供稽核重現)為 json(backupPath; 不覆寫既有檔), 寫後讀回驗證
//  4. 重新讀取引用端表, 逐筆確認 before 仍等於庫內現值(稽核後被他人改動者中止, 免以過期資料覆蓋)
//  5. 寫入: woItems[表].save([{ id, [欄位]: 新字串 }], { autoInsert: false })——只改該欄位, 列已不存在時不得補出只有一欄之殘列; 逐筆結果 ok 非 1、n 為 0 或有 nInserted 者視為失敗並列出
//  6. 重新讀取並稽核: 懸空須為 0、變更之列只有該欄位改變、其餘列逐位元不變, 否則視為失敗
//     例外(已知殘留, 非失敗): 含無法安全重新編碼之內容(JSON5 Infinity／NaN, 重新編碼會變成 null 而改指別的規則名; 見 refCascade.rewriteRefs 之 unsafe)之授權欄位不清理,
//     其懸空項目寫前寫後皆在, 逐筆須與寫前相同(多或少即失敗), 並於報告列為「須人工處理」(res.unsafe／res.residue)
//備份檔路徑: 以 flag wx 建立(同名既有檔、同一檔之別名——大小寫不同、相對／絕對、硬連結——一律拒絕、不覆寫, 失敗於 backupRows 階段、零寫入)
//備份檔含 email 等個資, 請妥善保管、勿外傳、勿納入版控.

import fs from 'fs'
import path from 'path'
import { isDeepStrictEqual } from 'util'
import getDb from 'w-serv-orm/src/getDb.mjs'
import now2strp from 'wsemi/src/now2strp.mjs'
import { buildReport, formatReport } from './authRefsAudit.mjs'


const TABLES = ['users', 'grups', 'pemis', 'targets']
const HOLDERS = ['users', 'grups', 'pemis']


let arr = (v) => (Array.isArray(v) ? v : [])
let msgOf = (err) => (err && err.message ? err.message : String(err))
let byId = (rows) => new Map(arr(rows).map((r) => [r.id, r]))


//readTables: 讀取四表全部列
async function readTables(woItems) {
    let rows = {}
    for (let t of TABLES) {
        let rs = await woItems[t].select()
        if (!Array.isArray(rs)) {
            throw new Error(`select ${t} did not return an array`)
        }
        rows[t] = rs
    }
    return rows
}


/**
 * 稽核並(apply 時)清理懸空引用
 *
 * @param {Object} p 輸入參數物件
 * @param {Object} p.woItems 輸入 ORM 資料表物件(users、grups、pemis、targets 各有 select／save)
 * @param {Boolean} [p.apply=false] 輸入是否寫入, 預設 false(只列不改)
 * @param {String} [p.backupPath] 輸入引用端表之備份檔路徑, 預設 ./authRefsClean-backup-<時間戳>.json(相對工作目錄)
 * @param {Function} [p.backupDb] 輸入資料庫備份函數(回傳 Promise, reject 表失敗), 預設 getDb.backup(woItems)
 * @param {Function} [p.log] 輸入輸出文字之函數, 預設 console.log
 * @returns {Promise<Object>} 回傳 { ok, apply, stage, err, audit, auditAfter, dbBackup, backupPath, written, failed, stale }; ok 為 false 時 stage 為失敗之階段(check／select／backupDb／backupRows／stale／write／verify), err 為訊息; 不 reject
 */
async function runClean(p = {}) {
    let woItems = p.woItems
    let apply = p.apply === true
    let log = typeof p.log === 'function' ? p.log : console.log
    let backupDb = typeof p.backupDb === 'function' ? p.backupDb : () => getDb.backup(woItems)
    let res = { ok: false, apply, stage: 'check', err: '', audit: null, auditAfter: null, dbBackup: false, backupPath: '', written: [], failed: [], stale: [], unsafe: [], residue: [] }
    let fail = (stage, err) => {
        res.ok = false
        res.stage = stage
        res.err = msgOf(err)
        log(`失敗(階段 ${stage}): ${res.err}`)
        if (res.written.length > 0 || res.failed.length > 0) {
            log(`已寫入 ${res.written.length} 列, 失敗 ${res.failed.length} 列${res.failed.length > 0 ? ': ' + res.failed.map((f) => `${f.table} id=${f.id}(${f.err})`).join('; ') : ''}; 請依備份檔還原或重跑本工具`)
        }
        return res
    }

    //check
    if (woItems === null || typeof woItems !== 'object') {
        return fail('check', 'invalid woItems')
    }
    for (let t of TABLES) {
        if (!woItems[t] || typeof woItems[t].select !== 'function' || (apply && typeof woItems[t].save !== 'function')) {
            return fail('check', `woItems.${t} lacks select${apply ? '／save' : ''}`)
        }
    }

    //select, audit
    let rows0 = null
    try {
        rows0 = await readTables(woItems)
    }
    catch (err) {
        return fail('select', err)
    }
    let rp = buildReport(rows0)
    res.audit = rp
    res.unsafe = rp.unsafe
    log(formatReport(rp))
    let unsafeNote = rp.unsafe.length > 0 ? `另有 ${rp.unsafe.length} 個授權欄位含無法安全重新編碼之內容(JSON5 Infinity／NaN), 本工具不清理(其懸空項目仍在), 須人工處理: ${rp.unsafe.map((u) => `${u.table} id=${u.id}`).join('、')}` : ''
    if (!apply) {
        log('')
        log('(預設只列不改; 確認清單後加 --apply 才寫入, 寫入前會自動備份)')
        res.ok = true
        res.stage = 'audit'
        return res
    }
    if (rp.changes.length === 0) {
        log('')
        log('無須清理(沒有可改寫之懸空引用), 不備份、不寫入.')
        if (unsafeNote !== '') {
            log(unsafeNote)
        }
        res.ok = true
        res.stage = 'audit'
        return res
    }

    //(a) 備份整個資料庫
    res.stage = 'backupDb'
    try {
        await backupDb()
        res.dbBackup = true
    }
    catch (err) {
        return fail('backupDb', err)
    }

    //(b) 匯出引用端表全部列
    res.stage = 'backupRows'
    try {
        let fp = path.resolve(p.backupPath || `./authRefsClean-backup-${now2strp()}.json`)
        res.backupPath = fp
        let body = { meta: { tool: 'authRefsClean', time: new Date().toISOString(), note: 'users／grups／pemis 為將被改寫之引用端表之全部列(寫入前); targets 未被改寫, 附上供稽核重現. 含個資, 請妥善保管.' } }
        for (let t of TABLES) {
            body[t] = rows0[t]
        }
        let txt = JSON.stringify(body)
        fs.writeFileSync(fp, txt, { encoding: 'utf8', flag: 'wx' }) //wx: 既有檔不覆寫
        let back = JSON.parse(fs.readFileSync(fp, 'utf8'))
        for (let t of TABLES) {
            if (!Array.isArray(back[t]) || back[t].length !== rows0[t].length) {
                throw new Error(`backup file verification failed: ${t}`)
            }
        }
        log(`已備份: 資料庫(backup-時間.json, 於工作目錄)、引用端表全部列 ${fp}`)
    }
    catch (err) {
        return fail('backupRows', err)
    }

    //稽核後被他人改動者中止
    res.stage = 'stale'
    let rows1 = null
    try {
        rows1 = await readTables(woItems)
    }
    catch (err) {
        return fail('stale', err)
    }
    for (let c of rp.changes) {
        let r = byId(rows1[c.table]).get(c.id)
        if (r === undefined || r[c.field] !== c.before) {
            res.stale.push({ table: c.table, id: c.id })
        }
    }
    if (res.stale.length > 0) {
        return fail('stale', `${res.stale.length} rows changed or removed since the audit: ${res.stale.slice(0, 10).map((s) => `${s.table} id=${s.id}`).join(', ')}`)
    }

    //write
    res.stage = 'write'
    for (let t of HOLDERS) {
        let cs = rp.changes.filter((c) => c.table === t)
        if (cs.length === 0) {
            continue
        }
        let rs = null
        try {
            rs = await woItems[t].save(cs.map((c) => ({ id: c.id, [c.field]: c.after })), { autoInsert: false })
        }
        catch (err) {
            cs.forEach((c) => res.failed.push({ table: t, id: c.id, err: msgOf(err) }))
            continue
        }
        if (!Array.isArray(rs) || rs.length !== cs.length) {
            cs.forEach((c) => res.failed.push({ table: t, id: c.id, err: 'unexpected save result' }))
            continue
        }
        cs.forEach((c, k) => {
            let r = rs[k]
            if (r && r.ok === 1 && r.n !== 0 && !(r.nInserted > 0)) {
                res.written.push({ table: t, id: c.id })
            }
            else {
                res.failed.push({ table: t, id: c.id, err: (r && r.err) ? String(r.err) : `save result ${JSON.stringify(r)}` })
            }
        })
    }
    if (res.failed.length > 0) {
        return fail('write', `${res.failed.length} rows failed to save`)
    }

    //verify: 重新稽核須為 0 懸空, 變更之列只有該欄位改變, 其餘列逐位元不變
    res.stage = 'verify'
    try {
        let rows2 = await readTables(woItems)
        res.auditAfter = buildReport(rows2)
        let newOf = new Map(rp.changes.map((c) => [`${c.table}\u0000${c.id}`, c]))
        let bad = []
        for (let t of HOLDERS) {
            let m0 = byId(rows0[t])
            let m2 = byId(rows2[t])
            if (m2.size !== m0.size || rows2[t].length !== rows0[t].length) {
                bad.push(`${t} row count ${rows0[t].length} -> ${rows2[t].length}`)
                continue
            }
            for (let [id, r0] of m0) {
                let c = newOf.get(`${t}\u0000${id}`)
                let expect = c ? { ...r0, [c.field]: c.after } : r0
                if (!isDeepStrictEqual(m2.get(id), expect)) {
                    bad.push(`${t} id=${id}`)
                }
            }
        }
        if (bad.length > 0) {
            return fail('verify', `rows differ from expected after write: ${bad.slice(0, 10).join(', ')}`)
        }
        //已知殘留: 含無法安全重新編碼之內容(unsafe)之列不清理, 其懸空項目於寫前寫後皆在(須人工處理); 除此之外不得有懸空
        let unsafeKeys = new Set(rp.unsafe.map((u) => `${u.table}\u0000${u.id}`))
        res.residue = rp.items.filter((x) => unsafeKeys.has(`${x.table}\u0000${x.holderId}`))
        let rest = res.auditAfter.items.filter((x) => !unsafeKeys.has(`${x.table}\u0000${x.holderId}`))
        if (rest.length !== 0) {
            return fail('verify', `${rest.length} dangling refs remain after clean`)
        }
        if (!isDeepStrictEqual(res.auditAfter.items, res.residue)) {
            return fail('verify', 'residue of unsafe rows changed unexpectedly')
        }
    }
    catch (err) {
        return fail('verify', err)
    }

    res.ok = true
    res.stage = 'done'
    let n = (t) => res.written.filter((w) => w.table === t).length
    log('')
    log(`已清理: 寫入 ${res.written.length} 列(users ${n('users')}、grups ${n('grups')}、pemis ${n('pemis')}); 重新稽核懸空 ${res.auditAfter.items.length} 項${res.residue.length > 0 ? `(皆為下述不清理之列的既知殘留, 非錯誤)` : ''}. 請重啟服務並抽查授權.`)
    if (unsafeNote !== '') {
        log(unsafeNote)
    }
    return res
}


export { runClean, TABLES }
