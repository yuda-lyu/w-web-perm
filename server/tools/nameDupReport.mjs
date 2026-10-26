//名稱重複與使用者對應鍵之唯讀稽核工具(F-02／F-14; 規則帳本 R-NAME-UNIQ-03; ADR-034). 不屬測試, 不寫任何資料, 不提供自動刪除/改名——清理由系統管理者於後台逐一處理並確認授權.
//
//用法(自專案根; 套件安裝後此檔位於 node_modules/w-web-perm/server/tools/, 以該路徑執行即可, 匯出檔路徑相對於目前工作目錄):
//  node server/tools/nameDupReport.mjs <匯出檔.json> [--mapping-by id|email|name] [--json]
//  node server/tools/nameDupReport.mjs --audit <匯出檔.json> [--mapping-by id|email|name] [--json]   (同上; 與 authMergeReport.mjs --audit 寫法一致)
//
//  匯出檔內容 { users, grups, pemis, targets }(各為列陣列, 如以資料通道 select 之結果或資料庫匯出)。
//  --mapping-by 省略時 email 與 name 皆報告(部署之 mappingBy 設定不在資料庫內); 給 id 則查 id 缺漏與「登入識別撞值」(perm-run05; 見下方報告內容 2).
//  --json 輸出結構化結果(供其他工具), 省略則輸出文字報告.
//
//報告內容:
//  1. grups／pemis 同名組: 各筆之 id／from／isActive／order, 以及被哪些 users.cgrups(查 grups 名)／grups.cpemis(查 pemis 名)以該名稱引用(只計名稱字串出現之引用; 解碼用 src/js/cvKpToArr.mjs,
//     JSON5 解析失敗之列容錯: 視為無引用並列入「壞 JSON」清單). 比對為精確 ===(同伺服端 arrFinder).
//     已知邊界(增量外審 mmd-N8, 未處理): 陣列形式之引用元素缺 name 時, 伺服端 arrFinder 以 get(vv,'name','') 取得 ''(可對應名稱為 '' 之列), 本工具解碼後名稱為索引數字, 不計入該引用;
//     須同時存在「名稱為空字串之群組/權限」與「陣列形式且缺 name 之引用」, 空名稱者已另由 authMergeReport --audit 列出, 請一併人工檢視.
//  2. users 對應鍵: isActive==='y' 之列, 對應鍵(email／name／id)為空／空白／非字串者, 以及值重複者(精確 ===; 與 getTokenUser 之 select 一致), 附各列 id／name／from.
//     mappingBy 為 id 時(perm-run05, 規則帳本 R-MAPKEY-05): 登入識別值＝後台列(from 空)之 id、外部列(from 非空)之 srcKey(遷移前無 srcKey 之舊外部列為其 id);
//     列出每一組「同一登入識別值有 ≥ 2 列」者(登入時命中多筆即一律拒絕 ambiguousUserFromPerm), **不論 isActive、含他來源與同一來源**; 每組標 scope:
//     crossSource＝匯入／後台存檔會擋之撞值組合(後台列↔外部列、他來源外部列↔外部列、同來源一有 srcKey 一為舊形之 claimTwice 形; 判準 keyCheck.findLoginIdClashDetail),
//     sameSource＝同一來源之重複(皆有 srcKey 之 srcKeyDuplicate／srcKeyConflict 形, 或同主鍵), 同步端本就拒絕, 需於來源端或以 g_purgeFrom.mjs 清理.
//     各組附各列 id／name／from／isActive. 升版後這些歷史撞值不阻擋後台存檔(才可修復), 但登入一律被拒——請依本報告在後台刪除或改用可唯一對應之鍵、並請外部來源改用不撞值之 srcKey
//     (同時須讓部署方之 getUserByToken 回報值隨之改變, 見 README Upgrade Notes 第 4 節), 處理後重跑確認為 0 組.
//
//【清理須知】引用以「名稱」比對, 改名級聯(F-07)尚未實作: 同名組中改名或刪除其一, 引用該名稱者會全部指向剩下的那一筆或失效.
//  請先以本報告列出引用者, 清理後逐一確認授權(getPermUserInfor／getPerm 之結果), 再處理下一組.
//  報告含 email(對應鍵)原文, 請妥善保管、勿外傳.

import fs from 'fs'
import isMain from './isMain.mjs'
import JSON5 from 'json5'
import cvKpToArr from '../../src/js/cvKpToArr.mjs'
import { loginIdOf, findLoginIdClashDetail } from '../keyCheck.mjs'


let isStr = (v) => typeof v === 'string'
let arr = (v) => (Array.isArray(v) ? v : [])


//decodeNames: 解碼授權字串(cgrups／cpemis)為 [{ name, mode, isActive }], 失敗回 null(壞 JSON); 空字串視為無內容([])
function decodeRefs(s) {
    if (!isStr(s) || s.trim() === '') {
        return []
    }
    let kp = null
    try {
        kp = JSON5.parse(s)
    }
    catch (err) {
        return null
    }
    try {
        //名稱保留原型別: 伺服端 arrFinder 以 === 比對, 非字串名稱(如 1、['1'])不會對應任何群組／權限, 不得轉字串後報成引用者(外審 sol R8)
        return cvKpToArr(kp).map((r) => ({ name: r.name, mode: r.mode, isActive: r.isActive }))
    }
    catch (err) {
        return null
    }
}


//dupGroups: 表內 name 為字串且出現 ≥ 2 次者之組(精確 ===)
function dupGroups(rows) {
    let kp = new Map()
    for (let r of arr(rows)) {
        if (r && isStr(r.name)) {
            if (!kp.has(r.name)) {
                kp.set(r.name, [])
            }
            kp.get(r.name).push(r)
        }
    }
    return [...kp].filter(([, rs]) => rs.length >= 2).map(([name, rs]) => ({ name, rows: rs }))
}


//refsTo: 以 refTable 各列之授權欄位(refCol)引用 name 者
function refsTo(name, refRows, refCol, badJson) {
    let out = []
    for (let r of arr(refRows)) {
        let ds = decodeRefs(r && r[refCol])
        if (ds === null) {
            badJson.push({ table: refCol === 'cgrups' ? 'users' : 'grups', id: r.id })
            continue
        }
        for (let d of ds) {
            if (d.name === name) {
                out.push({ id: r.id, name: r.name, mode: d.mode, isActive: d.isActive })
            }
        }
    }
    return out
}


//mapKeyIssues: isActive==='y' 之 users, 對應鍵 key 為空／空白／非字串(empty), 以及值重複(dup)
function mapKeyIssues(users, key) {
    let act = arr(users).filter((u) => u && u.isActive === 'y')
    let brief = (u) => ({ id: u.id, name: u.name, from: u.from })
    let empty = act.filter((u) => !(isStr(u[key]) && u[key].trim().length > 0)).map(brief)
    let kp = new Map()
    for (let u of act) {
        if (isStr(u[key]) && u[key].trim().length > 0) {
            if (!kp.has(u[key])) {
                kp.set(u[key], [])
            }
            kp.get(u[key]).push(brief(u))
        }
    }
    let dup = [...kp].filter(([, rs]) => rs.length >= 2).map(([value, rows]) => ({ value, rows }))
    return { empty, dup }
}


//loginIdDups: mappingBy='id' 之登入識別撞值組(perm-run05): 依 loginIdOf 分組, 凡同一登入識別值有 ≥ 2 列者皆列出(不論 isActive、含他來源與同一來源——登入時命中多筆即一律拒絕, 故稽核須與登入同口徑,
//  外審 sol 第一輪#5: 同來源重複〔其一停用〕亦使該使用者不能登入、來源同步回 srcKeyConflict); scope 標示: 'crossSource'＝匯入／後台存檔會擋之撞值組合(findLoginIdClashDetail, 判準單一擁有者在 keyCheck.mjs),
//  'sameSource'＝同一來源之重複(皆有 srcKey 之 srcKeyDuplicate／srcKeyConflict 形，或同主鍵), 需在來源端或以 g_purgeFrom.mjs 清理
function loginIdDups(users) {
    let kp = new Map()
    for (let u of arr(users)) {
        let v = loginIdOf(u)
        if (v === '') {
            continue
        }
        if (!kp.has(v)) {
            kp.set(v, [])
        }
        kp.get(v).push(u)
    }
    return [...kp]
        .filter(([, rs]) => rs.length >= 2)
        .map(([value, rs]) => ({ value, scope: (findLoginIdClashDetail(rs, () => true) !== null) ? 'crossSource' : 'sameSource', rows: rs.map((u) => ({ id: u.id, name: u.name, from: u.from, isActive: u.isActive })) }))
}


/**
 * 建立稽核結果(純函數, 不讀寫檔案)
 *
 * @param {Object} data { users, grups, pemis, targets }
 * @param {Object} [opt={}] 設定
 * @param {String} [opt.mappingBy] 'id'｜'email'｜'name', 省略時 email 與 name 皆報告
 * @returns {Object} 稽核結果
 */
function buildReport(data, opt = {}) {
    let d = data || {}
    let badJson = []
    let brief = (r) => ({ id: r.id, from: r.from, isActive: r.isActive, order: r.order })
    let grups = dupGroups(d.grups).map((g) => ({
        name: g.name,
        rows: g.rows.map(brief),
        refs: refsTo(g.name, d.users, 'cgrups', badJson), //users.cgrups 以群組名引用
    }))
    let pemis = dupGroups(d.pemis).map((g) => ({
        name: g.name,
        rows: g.rows.map(brief),
        refs: refsTo(g.name, d.grups, 'cpemis', badJson), //grups.cpemis 以權限名引用
    }))
    //壞 JSON 全表掃描(外審 sol R9): 不論有無同名組, users.cgrups／grups.cpemis 解析失敗者皆列出(refsTo 只掃同名組之引用者, 會漏列)
    for (let [rows, col, table] of [[d.users, 'cgrups', 'users'], [d.grups, 'cpemis', 'grups']]) {
        for (let r of arr(rows)) {
            if (r && decodeRefs(r[col]) === null) {
                badJson.push({ table, id: r.id })
            }
        }
    }
    let keys = (opt.mappingBy === 'id' || opt.mappingBy === 'email' || opt.mappingBy === 'name') ? [opt.mappingBy] : ['email', 'name']
    let mapKey = {}
    for (let key of keys) {
        mapKey[key] = (key === 'id')
            ? { empty: arr(d.users).filter((u) => u && u.isActive === 'y' && !(isStr(u.id) && u.id !== '')).map((u) => ({ id: u.id, name: u.name, from: u.from })), dup: loginIdDups(d.users) }
            : mapKeyIssues(d.users, key)
    }
    //壞 JSON 去重(同一列被多個重複名稱之解碼重複記錄)
    let seen = new Set()
    badJson = badJson.filter((b) => {
        let k = `${b.table}:${b.id}`
        return seen.has(k) ? false : (seen.add(k), true)
    })
    return {
        counts: { users: arr(d.users).length, grups: arr(d.grups).length, pemis: arr(d.pemis).length, targets: arr(d.targets).length },
        grups,
        pemis,
        mapKey,
        badJson,
    }
}


//formatReport: 結果轉文字
function formatReport(rp) {
    let L = []
    let rowTxt = (r) => `id=${r.id} from=${JSON.stringify(r.from)} isActive=${JSON.stringify(r.isActive)} order=${r.order}`
    L.push(`資料筆數: users ${rp.counts.users}、grups ${rp.counts.grups}、pemis ${rp.counts.pemis}、targets ${rp.counts.targets}`)
    for (let [tab, refFrom, label] of [['grups', 'users.cgrups', '群組'], ['pemis', 'grups.cpemis', '權限']]) {
        L.push('')
        L.push(`== ${label}(${tab})同名組: ${rp[tab].length} 組 ==`)
        for (let g of rp[tab]) {
            L.push(`- 「${g.name}」${g.rows.length} 筆`)
            g.rows.forEach((r) => L.push(`    ${rowTxt(r)}`))
            L.push(`  被 ${refFrom} 引用: ${g.refs.length} 處`)
            g.refs.forEach((r) => L.push(`    ${tab === 'grups' ? 'user' : 'grup'} id=${r.id} name=${JSON.stringify(r.name)} mode=${JSON.stringify(r.mode)} isActive=${JSON.stringify(r.isActive)}`))
        }
    }
    for (let [key, v] of Object.entries(rp.mapKey)) {
        L.push('')
        if (key === 'id') {
            L.push(`== users 對應鍵 id(後台列＝id、外部列＝srcKey; 登入識別撞值不論 isActive、含他來源): 無 id 之有效列 ${v.empty.length} 筆, 撞值 ${v.dup.length} 組 ==`)
        }
        else {
            L.push(`== users 對應鍵 ${key}(僅 isActive='y'): 空／空白／非字串 ${v.empty.length} 筆, 值重複 ${v.dup.length} 組 ==`)
        }
        v.empty.forEach((u) => L.push(`- 空: id=${u.id} name=${JSON.stringify(u.name)} from=${JSON.stringify(u.from)}`))
        for (let g of v.dup) {
            L.push(`- ${key === 'id' ? (g.scope === 'sameSource' ? '同來源重複' : '跨來源撞值') : '重複'}「${g.value}」${g.rows.length} 筆`)
            g.rows.forEach((u) => L.push(`    id=${u.id} name=${JSON.stringify(u.name)} from=${JSON.stringify(u.from)}${('isActive' in u) ? ` isActive=${JSON.stringify(u.isActive)}` : ''}`))
        }
    }
    L.push('')
    L.push(`== 授權字串壞 JSON(解析失敗, 視為無引用): ${rp.badJson.length} 列 ==`)
    rp.badJson.forEach((b) => L.push(`- ${b.table} id=${b.id}`))
    return L.join('\n')
}


//CLI
if (isMain(import.meta.url)) {
    let args = process.argv.slice(2)
    let iMap = args.indexOf('--mapping-by')
    let mappingBy = (iMap >= 0) ? args[iMap + 1] : undefined
    let iAudit = args.indexOf('--audit')
    let fp = (iAudit >= 0) ? args[iAudit + 1] : args.find((a, k) => !a.startsWith('--') && !(iMap >= 0 && k === iMap + 1))
    if (!fp || (iMap >= 0 && !['id', 'email', 'name'].includes(mappingBy))) {
        console.log('用法: node server/tools/nameDupReport.mjs <匯出檔.json> [--mapping-by id|email|name] [--json]')
        process.exit(2)
    }
    let data = JSON.parse(fs.readFileSync(fp, 'utf8'))
    let rp = buildReport(data, { mappingBy })
    console.log(args.includes('--json') ? JSON.stringify(rp, null, 1) : formatReport(rp))
}


export { buildReport, formatReport, decodeRefs }
