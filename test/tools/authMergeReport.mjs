//授權合併之報告產生器(不屬測試, 供產出比較報告、重產 GOLD 彙整、部署前稽核現有資料)
//
//用法(自專案根):
//  node test/tools/authMergeReport.mjs --golden > test/tools/authMergeGolden.json   重產單元測試比對之彙整(改規則後預期須重產; 重產前請先確認差異是預期的)
//  node test/tools/authMergeReport.mjs                                               產出各窮舉之總表、最小例子、逐鍵真值表(markdown)
//  node test/tools/authMergeReport.mjs --audit <匯出檔.json> [--json]                稽核現有資料(部署前盤點): 檔案內容 { users, grups, pemis, targets }(各為列陣列),
//                                                                                     逐使用者列出新語意(R-AUTH-MERGE-00＋R-PRINCIPLE-00 c／d／e)相對 1.1.12 發布版被收回之管理對象(lost)、
//                                                                                     相對 run04(未發布, 僅開發內)因 c／d／e 額外收回者(lostByCde)與其原因、觸發之引用(只列名稱, 不列 email)、
//                                                                                     1.1.12 下結果取決於儲存順序者(legacyOrderSensitive)、同名表列; --json 改輸出 JSON
//
//規格見 sgud/rule/rulebook.md 之 R-AUTH-MERGE-00／R-PRINCIPLE-00 與 spec/設計要點與取捨.md 之 ADR-033; 舊語意(run04、1.1.12)只存在於 authMerge.mjs 之完整模型 evalFull(比較用, 不入 src/).

import fs from 'fs'
import { evalSpec, specP, itemVariants, rulesetsAll, auditUsers, findNameConflicts, findEmptyNames, ySet } from './authMerge.mjs'
import { goldScanDefs } from './authMergeStats.mjs'


let args = process.argv.slice(2)

//警告碼之中文(同頁面提示之用語)
const CODE_TXT = { dangling: '懸空', ambiguous: '同名多列', modeInvalid: 'mode 非法' }
let fmtCause = (cs) => cs.map((c) => c.map((x) => CODE_TXT[x] || x).join('＋')).join(' 或 ')
let fmtIssue = (x) => `${x.level === 'grup' ? `群組「${x.name}」` : `群組「${x.holder}」之權限「${x.name}」`}${CODE_TXT[x.code]}${x.code === 'ambiguous' ? `(${x.n} 筆)` : ''}`

if (args.includes('--golden')) {
    let out = {}
    for (let [name, desc, fn] of goldScanDefs()) {
        let r = fn()
        out[name] = { desc, checks: r.checks, rows: r.rows }
    }
    console.log(JSON.stringify(out, null, 1))
}
else if (args.includes('--audit')) {
    let fp = args[args.indexOf('--audit') + 1]
    let d = JSON.parse(fs.readFileSync(fp, 'utf8'))
    let rs = auditUsers(d.users, d.grups, d.pemis, d.targets)
    let nc = findNameConflicts(d.grups, d.pemis)
    let en = findEmptyNames(d.grups, d.pemis)
    let errUsers = rs.filter((r) => r.error !== undefined)
    let lostUsers = rs.filter((r) => r.lost.length > 0)
    let gainedUsers = rs.filter((r) => r.gained.length > 0)
    let cdeUsers = rs.filter((r) => r.lostByCde.length > 0)
    let cdeGainUsers = rs.filter((r) => r.gainedByCde.length > 0)
    let modelBad = rs.filter((r) => r.error === undefined && !r.fidelity)
    //原因統計: 各管理對象之最小原因中出現之警告碼(複合者各碼皆計)
    let causeCnt = { dangling: 0, ambiguous: 0, modeInvalid: 0 }
    cdeUsers.forEach((r) => r.lostByCde.forEach((t) => new Set(r.reasons[t].flat()).forEach((c) => causeCnt[c]++)))
    if (args.includes('--json')) {
        let pick = (r) => ({ id: r.id, name: r.name, error: r.error, real: r.real, lost: r.lost, gained: r.gained, lostByCde: r.lostByCde, gainedByCde: r.gainedByCde, reasons: r.reasons, issues: r.issues, fidelity: r.fidelity, legacyOrderSensitive: r.legacyOrderSensitive, orders: r.orders })
        let summary = {
            users: rs.length,
            lostUsers: lostUsers.length,
            lostTargets: lostUsers.reduce((a, r) => a + r.lost.length, 0),
            gainedUsers: gainedUsers.length,
            cdeUsers: cdeUsers.length,
            cdeTargets: cdeUsers.reduce((a, r) => a + r.lostByCde.length, 0),
            cdeCause: causeCnt,
            cdeGainUsers: cdeGainUsers.length,
            legacyOrderSensitive: rs.filter((r) => r.legacyOrderSensitive === true).length,
            notEnumerated: rs.filter((r) => r.legacyOrderSensitive === null).length,
            nameConflicts: nc,
            emptyNames: en,
            errorUsers: errUsers.length,
            modelMismatch: modelBad.length,
        }
        console.log(JSON.stringify({ summary, users: rs.filter((r) => r.error !== undefined || r.lost.length > 0 || r.gained.length > 0 || r.lostByCde.length > 0 || r.gainedByCde.length > 0 || r.issues.length > 0 || r.legacyOrderSensitive === true).map(pick) }, null, 1))
    }
    else {
        console.log(`使用者 ${rs.length} 人; 新規則收回授權(舊規則為 y、新規則為 n) ${lostUsers.length} 人(共 ${lostUsers.reduce((a, r) => a + r.lost.length, 0)} 個管理對象)`)
        console.log(`新規則多給授權(舊規則為 n、新規則為 y; 依規則推導應為 0) ${gainedUsers.length} 人${gainedUsers.length > 0 ? ' ← 非 0 表示規則或資料有誤, 請回報' : ''}`)
        console.log(`相對 run04(未發布, 僅開發內)因懸空／同名多列／mode 非法(R-PRINCIPLE-00 c／d／e)額外收回 ${cdeUsers.length} 人(共 ${cdeUsers.reduce((a, r) => a + r.lostByCde.length, 0)} 個管理對象; 原因: 懸空 ${causeCnt.dangling}、同名多列 ${causeCnt.ambiguous}、mode 非法 ${causeCnt.modeInvalid})${cdeGainUsers.length > 0 ? `; 多給 ${cdeGainUsers.length} 人 ← 依規則推導應為 0, 請回報` : ''}`)
        console.log(`舊規則下結果取決於儲存順序(舊結果本身不確定; 抽象排列, 物件形式下整數式名稱無法重排) ${rs.filter((r) => r.legacyOrderSensitive === true).length} 人; 未窮舉 ${rs.filter((r) => r.legacyOrderSensitive === null).length} 人`)
        console.log(`同名表列(歷史同名; 新規則取各筆之交集, 舊規則取表中第一筆; F-02 防新增, 既有者須人工清理): 群組 ${nc.grups.length} 組(內容不同 ${nc.grups.filter((x) => !x.sameContent).length})、權限 ${nc.pemis.length} 組(內容不同 ${nc.pemis.filter((x) => !x.sameContent).length})`)
        nc.grups.concat(nc.pemis).filter((x) => !x.sameContent).forEach((x) => console.log(`  - 「${x.name}」${x.count} 筆, 內容不同`))
        console.log(`名稱為空字串或非字串之群組 ${en.grups.length} 筆、權限 ${en.pemis.length} 筆(伺服端仍可對應; 請先於後台修正名稱): 群組 id ${JSON.stringify(en.grups)}、權限 id ${JSON.stringify(en.pemis)}`)
        console.log(`無法評估(資料使 getUserRules 拋例外,已略過該使用者並繼續) ${errUsers.length} 人${errUsers.length > 0 ? ': ' + errUsers.map((r) => `${r.name}[${r.id}] ${r.error}`).join('; ') : ''}`)
        if (modelBad.length > 0) {
            console.log(`真函數與參考模型不一致 ${modelBad.length} 人(工具或規則有誤, 請回報): ${modelBad.map((r) => `${r.name}[${r.id}]`).join(', ')}`)
        }
        for (let r of rs) {
            if (r.lost.length > 0 || r.gained.length > 0 || r.lostByCde.length > 0 || r.gainedByCde.length > 0 || r.legacyOrderSensitive === true) {
                let cde = r.lostByCde.map((t) => `${t}(${fmtCause(r.reasons[t])})`).join(', ')
                let cdeG = r.gainedByCde.map((t) => `${t}(${fmtCause(r.reasons[t])})`).join(', ')
                console.log(`- ${r.name} [${r.id}] 新規則授權=${ySet(r.real, Object.keys(r.real))} 被收回=${JSON.stringify(r.lost)}${r.gained.length > 0 ? ` 多給=${JSON.stringify(r.gained)}` : ''} 舊規則順序相依=${r.legacyOrderSensitive} 順序數=${r.orders}${cde ? ` 相對run04收回=${cde}` : ''}${cdeG ? ` 相對run04多給=${cdeG}` : ''}${r.issues.length > 0 ? ` 觸發=${r.issues.map(fmtIssue).join('、')}` : ''}`)
            }
        }
    }
}
else {
    console.log('# 窮舉總表(新規則 vs 1.1.12 舊規則 vs run04)\n')
    for (let [name, desc, fn] of goldScanDefs()) {
        let r = fn()
        console.log(`## ${name}: ${desc}\n`)
        console.log(`檢查(fidelity: 真函數≠參考模型之格數; retract／retract04: 新規則多於 1.1.12／run04 之(格,管理對象)數; retractNoE: 不含 e 之收嚴多於 run04 者; idle: 不含某情形卻因該旗標改變結果之格數): ${JSON.stringify(r.checks)}\n`)
        //列鍵含「|」(形狀|有無OR), 在 markdown 表格內改以「 / 」顯示
        let depKeys = Object.keys(Object.values(r.rows)[0].dep)
        console.log('| 列(形狀 / 有無OR) | 格數 | ' + depKeys.map((k) => `相依 combo(${k}): 新 / 1.1.12 / run04 / combo 數`).join(' | ') + ' | 與 1.1.12 相異 格數(combo) | 與 run04 相異 格數(combo) | 多於 run04／1.1.12 格數 | c／d／e 單獨開啟改變之格數 |')
        console.log('|---|---|' + depKeys.map(() => '---').join('|') + '|---|---|---|---|')
        for (let [k, row] of Object.entries(r.rows)) {
            console.log(`| ${k.split('|').join(' / ')} | ${row.cells} | ` + Object.values(row.dep).map(([a, b, c, d4]) => `${a} / ${b} / ${d4} / ${c}`).join(' | ') + ` | ${row.diff[0]}(${row.diff[1]}) | ${row.diff04[0]}(${row.diff04[1]}) | ${row.gain[0]}／${row.gain[1]} | ${row.sens.join('／')} |`)
        }
        console.log('\n最小例子(與 1.1.12、run04 相異格中複雜度最小者):\n')
        for (let [k, row] of Object.entries(r.raw).sort(([a], [b]) => (a < b ? -1 : 1))) {
            for (let [lab, m] of [['1.1.12', row.diff.min], ['run04', row.diff04.min]]) {
                if (m) {
                    console.log(`- ${k}: ${m.spec} → ${lab} ${m.other}; 新規則 ${m.real}`)
                }
            }
        }
        console.log('')
    }

    //逐鍵真值表: 單一管理對象, 兩個項目(模式 × 狀態), 所有儲存順序
    console.log('# 逐鍵真值表(單一管理對象 T1; 兩個項目 A、B; 狀態 y／n／-(未列)); 欄位為該管理對象之授權 y／n\n')
    console.log('| A | B | 舊規則 A先B後 | 舊規則 B先A後 | 舊規則順序相依 | 新規則(兩種順序同) |')
    console.log('|---|---|---|---|---|---|')
    let T1 = ['T1']
    let vs = itemVariants(['OR', 'AND'], rulesetsAll(T1))
    let lab = (v) => `${v.mode} ${v.rules.length === 0 ? '-' : v.rules[0][1]}`
    for (let a of vs) {
        for (let b of vs) {
            if (lab(a) > lab(b)) {
                continue
            }
            let ea = { ...a, id: 'A' }
            let eb = { ...b, id: 'B' }
            let ab = evalSpec(specP([ea, eb]), T1)
            let ba = evalSpec(specP([eb, ea]), T1)
            console.log(`| ${lab(a)} | ${lab(b)} | ${ab.sem.legacy.T1} | ${ba.sem.legacy.T1} | ${ab.sem.legacy.T1 !== ba.sem.legacy.T1 ? '是' : ''} | ${ab.real.T1}${ab.real.T1 === ba.real.T1 ? '' : ` / ${ba.real.T1}(順序相依, 非預期!)`} |`)
        }
    }
}
