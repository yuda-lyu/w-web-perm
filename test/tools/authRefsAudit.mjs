//懸空引用之離線稽核工具(適用表 n 上線後之升版前盤點; 規則帳本 R-REF-CASCADE-01 之配套; 不屬測試, 只讀匯出檔、不寫庫).
//
//用法(自專案根):
//  node test/tools/authRefsAudit.mjs <匯出檔.json> [--json] [--clean-out <檔>]
//
//  匯出檔內容 { users, grups, pemis, targets }(各為列陣列, 如以資料通道 select 之結果或 g_backupDb.mjs 之備份整理而得)。
//  --json       輸出結構化結果 { items, counts, changes, badJson, unnamed, unsafe, noId, widen }(供其他工具), 省略則輸出文字報告.
//  --clean-out  把「清理後之引用端列」(僅變更者之主鍵 id 與新字串)寫成 json 供審閱: { users: [{ id, cgrups }], grups: [{ id, cpemis }], pemis: [{ id, crules }] }.
//
//報告內容:
//  1. 懸空引用清單(users.cgrups 引用不存在之群組名、grups.cpemis 引用不存在之權限名、pemis.crules 引用不存在之管控對象 id): 逐引用端列出被引用之名稱、isActive、mode 與對授權之影響.
//  2. 清理後授權可能變多之使用者／群組數(啟用之 AND 懸空項使結果為空, 清理後限制解除; 含「唯一 OR 項」與經群組傳導之情形).
//  3. 壞 JSON(解析失敗, 視為無引用, 不處理)清單、名稱非字串之引用(不處理, 須人工)清單.
//  4. 建議處置步驟.
//  不回顯 email／name 等個資(只列主鍵 id 與被引用之名稱).
//
//清理由 g_authRefsClean.mjs 執行(預設只列不改, 加 --apply 才寫入; 寫入前備份); 解析與改寫邏輯同 src/js/refAudit.mjs(改寫經 src/js/refCascade.mjs 之 rewriteRefs).

import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'
import auditRefs, { EFFECT } from '../../src/js/refAudit.mjs'


const TABLE_LABEL = { users: 'users.cgrups(引用群組名)', grups: 'grups.cpemis(引用權限名)', pemis: 'pemis.crules(引用管控對象 id)' }
const TARGET_LABEL = { users: '群組', grups: '權限', pemis: '管控對象' }
const BAD_TXT = { parse: 'JSON5 解析失敗', notContainer: '解析結果非物件／陣列', decode: '解碼失敗' }
const MAX_HOLDERS = 500 //文字報告每表最多列出之引用端列數(完整請用 --json)


let arr = (v) => (Array.isArray(v) ? v : [])
let j = (v) => JSON.stringify(v)


/**
 * 建立稽核結果(純函數, 不讀寫檔案): auditRefs 之結果加上各表筆數
 *
 * @param {Object} data { users, grups, pemis, targets }
 * @returns {Object} 稽核結果
 */
function buildReport(data) {
    let d = (data !== null && typeof data === 'object') ? data : {}
    let rp = auditRefs(d)
    return {
        rows: { users: arr(d.users).length, grups: arr(d.grups).length, pemis: arr(d.pemis).length, targets: arr(d.targets).length },
        ...rp,
    }
}


/**
 * 清理後之引用端列(供 --clean-out): 僅變更者之主鍵 id 與新字串, 即 ORM save 之輸入形狀
 *
 * @param {Array} changes auditRefs 之 changes
 * @returns {Object} { users: [{ id, cgrups }], grups: [{ id, cpemis }], pemis: [{ id, crules }] }
 */
function cleanOutOf(changes) {
    let out = { users: [], grups: [], pemis: [] }
    for (let c of arr(changes)) {
        out[c.table].push({ id: c.id, [c.field]: c.after })
    }
    return out
}


//formatReport: 結果轉文字
function formatReport(rp, opt = {}) {
    let maxHolders = Number.isInteger(opt.maxHolders) ? opt.maxHolders : MAX_HOLDERS
    let c = rp.counts
    let L = []
    L.push(`資料筆數: users ${rp.rows.users}、grups ${rp.rows.grups}、pemis ${rp.rows.pemis}、targets ${rp.rows.targets}`)
    L.push('')
    L.push(`== 懸空引用(引用之名稱查無實體): 共 ${c.nItems} 項, 涉及引用端 ${c.byTable.users.nHolders + c.byTable.grups.nHolders + c.byTable.pemis.nHolders} 列; 清理後會改寫 ${c.nChanges} 列 ==`)
    for (let t of ['users', 'grups', 'pemis']) {
        let its = rp.items.filter((x) => x.table === t)
        let bt = c.byTable[t]
        L.push(`-- ${TABLE_LABEL[t]}: ${bt.nItems} 項, ${bt.nHolders} 列`)
        let byHolder = new Map()
        for (let x of its) {
            if (!byHolder.has(x.holderId)) {
                byHolder.set(x.holderId, [])
            }
            byHolder.get(x.holderId).push(x)
        }
        let n = 0
        for (let [id, xs] of byHolder) {
            if (n++ >= maxHolders) {
                L.push(`   …(其餘 ${byHolder.size - maxHolders} 列從略, 完整清單請加 --json)`)
                break
            }
            let txt = xs.map((x) => `${j(x.name)}${t === 'pemis' ? '' : `(${x.isActive === 'y' ? '啟用' : '停用'}, mode=${j(x.mode)})`}`).join('、')
            L.push(`   ${t} id=${id}: ${txt}`)
        }
    }
    L.push('')
    L.push(`== 對授權之影響(ref 類之 cgrups／cpemis; crules 懸空項不影響授權) ==`)
    L.push(`- 啟用之懸空項 ${c.nActive} 項(其中有效模式為 AND 者 ${c.nAndActive} 項、OR 者 ${c.nOrActive} 項), 停用之懸空項 ${c.nInactive} 項`)
    L.push(`- 擁有「啟用 AND 懸空項」之使用者 ${c.byTable.users.nAndActiveHolders} 位、群組 ${c.byTable.grups.nAndActiveHolders} 個: 現況其授權(該層合併結果)被收嚴為空; 清理後 AND 限制解除, 授權可能變多`)
    L.push(`- 清理後授權可能變多(含唯一 OR 懸空項而同層有合法 AND 項、經群組傳導者): 使用者 ${c.nWidenUsers} 位、群組 ${c.nWidenGrups} 個`)
    for (let w of rp.widen.slice(0, maxHolders)) {
        L.push(`   ${w.table} id=${w.holderId}${w.via === 'grups' ? '(經其啟用引用之群組傳導)' : ''}`)
    }
    if (rp.widen.length > maxHolders) {
        L.push(`   …(其餘 ${rp.widen.length - maxHolders} 筆從略, 完整清單請加 --json)`)
    }
    L.push('- 影響說明:')
    L.push(`   AND: ${EFFECT.and}`)
    L.push(`   OR: ${EFFECT.or}`)
    L.push(`   停用: ${EFFECT.inactive}`)
    L.push(`   crules: ${EFFECT.rule}`)
    L.push('')
    L.push(`== 授權字串壞 JSON(解析失敗等, 視為無引用, 清理時不處理): ${rp.badJson.length} 列 ==`)
    rp.badJson.forEach((b) => L.push(`- ${b.table} id=${b.id} 欄位 ${b.field}: ${BAD_TXT[b.reason] || b.reason}`))
    L.push('')
    L.push(`== 名稱非字串之引用(陣列元素無 name 等, 不對應任何${TARGET_LABEL.users}／${TARGET_LABEL.grups}名, 清理時不處理, 須人工於後台修正): ${rp.unnamed.length} 項 ==`)
    rp.unnamed.slice(0, maxHolders).forEach((x) => L.push(`- ${x.table} id=${x.holderId} 欄位 ${x.field} isActive=${j(x.isActive)} mode=${j(x.mode)}`))
    if (rp.unsafe && rp.unsafe.length > 0) {
        L.push(`== 含無法安全重新編碼之內容(JSON5 Infinity／NaN 數值)而不清理之授權欄位, 須人工處理: ${rp.unsafe.length} 項 ==`)
        rp.unsafe.slice(0, maxHolders).forEach((x) => L.push(`- ${x.table} id=${x.id} 欄位 ${x.field}`))
    }
    if (rp.noId.length > 0) {
        L.push('')
        L.push(`== 缺字串主鍵而無從寫回之引用端列: ${rp.noId.length} 列(不清理) ==`)
        rp.noId.forEach((x) => L.push(`- ${x.table} id=${j(x.holderId)} 欄位 ${x.field}: ${x.nItems} 項懸空`))
    }
    L.push('')
    L.push('== 建議處置步驟 ==')
    L.push('1. 先確認本報告「對授權之影響」: 啟用 AND 懸空項若本意為限制(例如曾刪除群組／權限而期望該使用者從此無授權), 清理會使其授權變多; 此類請先於後台改正名稱(或停用該引用)再清理.')
    L.push('2. 預設只列不改: node g_authRefsClean.mjs(連專案資料庫, 與本報告同一判準); 確認清單後再加 --apply 寫入(寫入前自動備份資料庫與將改寫之三張引用端表, 任一備份失敗即中止).')
    L.push('3. 建議於停服(或無人編輯)時執行 --apply, 執行後重啟服務(避免伺服端快取沿用舊字串), 並以 getPerm／getPermUserInfor 抽查數位使用者之授權.')
    L.push('4. 寫入後工具會重新稽核, 應為 0 懸空; 壞 JSON 與名稱非字串者不受清理影響, 須另行處理.')
    return L.join('\n')
}


//CLI
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
    let args = process.argv.slice(2)
    let iOut = args.indexOf('--clean-out')
    let cleanOut = (iOut >= 0) ? args[iOut + 1] : undefined
    let fp = args.find((a, k) => !a.startsWith('--') && !(iOut >= 0 && k === iOut + 1))
    if (!fp || (iOut >= 0 && (cleanOut === undefined || cleanOut.startsWith('--')))) {
        console.log('用法: node test/tools/authRefsAudit.mjs <匯出檔.json> [--json] [--clean-out <檔>]')
        process.exit(2)
    }
    //輸出不得覆寫輸入(同一檔; 以解析後之絕對路徑與已存在檔之 inode 判定): --clean-out 只含變更列之 id 與引用欄位, 覆寫匯出檔會使其遺失其餘列與欄位
    if (cleanOut !== undefined) {
        let same = path.resolve(fp).toLowerCase() === path.resolve(cleanOut).toLowerCase()
        if (!same && fs.existsSync(cleanOut) && fs.existsSync(fp)) {
            let a = fs.statSync(fp)
            let b = fs.statSync(cleanOut)
            same = a.ino !== 0 && a.ino === b.ino && a.dev === b.dev
        }
        if (same) {
            console.error('失敗: --clean-out 不得與輸入匯出檔為同一檔(會覆寫原匯出檔)')
            process.exit(2)
        }
    }
    try {
        let data = JSON.parse(fs.readFileSync(fp, 'utf8'))
        let rp = buildReport(data)
        console.log(args.includes('--json') ? JSON.stringify(rp, null, 1) : formatReport(rp))
        if (cleanOut !== undefined) {
            fs.writeFileSync(cleanOut, JSON.stringify(cleanOutOf(rp.changes), null, 1), 'utf8')
            console.error(`已寫入清理後之引用端列(僅變更者): ${cleanOut}`) //stderr: 不污染 --json 之 stdout
        }
    }
    catch (err) {
        console.error(`失敗: ${err && err.message ? err.message : err}`)
        process.exitCode = 1
    }
}


export { buildReport, formatReport, cleanOutOf }
