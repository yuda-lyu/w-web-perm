//變異驗證(twp2, 排程第 603 項): 對各守護點植入單點缺陷, 確認對應測試轉紅; 每項還原後以 sha256 回驗
//用法: node ./tmp/twp2/mutate.mjs <group: sf|desc|all> [dry]   (cwd 為 repo 根; 由 quiet-run --lock 包住, 本腳本內部不另取鎖)
//錨點須在原檔恰出現 1 次(否則該項報「錨點不唯一」並視為失敗); 變異後必還原(finally)
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { spawnSync } from 'child_process'

const root = process.cwd()
const mocha = path.join(root, 'node_modules', 'mocha', 'bin', 'mocha.js')
const group = process.argv[2] || 'all'
const dry = process.argv[3] === 'dry'
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex')

const SF_TESTS = ['test/unit-staLogs-timeLength.test.mjs']
const SF_GREP = 'TL-004|TL-006b'
const CORE = 'server/staLogs/staLogsCore.mjs'
const KEY = 'plan.timeNowPinned ? plan.timeNow : null'
const PIN = 'timeNowPinned: isNowOk,'

const M = [
    //single-flight 鍵
    { id: 'SF1', g: 'sf', file: CORE, from: KEY, to: 'get(opt, \'timeNow\', null)', tests: SF_TESTS, grep: SF_GREP, note: '鍵回到 opt.timeNow 原值' },
    { id: 'SF2', g: 'sf', file: CORE, from: KEY, to: 'plan.timeNow', tests: SF_TESTS, grep: SF_GREP, note: '鍵含 plan.timeNow 但不分是否被採用' },
    { id: 'SF3', g: 'sf', file: CORE, from: KEY, to: 'null', tests: SF_TESTS, grep: SF_GREP, note: '鍵不含 timeNow' },
    { id: 'SF4', g: 'sf', file: CORE, from: KEY, to: 'plan.timeNowPinned ? Math.floor(plan.timeNow / 3600000) : null', tests: SF_TESTS, grep: SF_GREP, note: '鍵之 timeNow 取整到小時(過度併合)' },
    { id: 'SF5', g: 'sf', file: CORE, from: KEY, to: 'plan.timeNowPinned ? get(opt, \'timeNow\') : null', tests: SF_TESTS, grep: SF_GREP, note: '被採用時仍以原值入鍵(小數毫秒不併)' },
    { id: 'SF6', g: 'sf', file: CORE, from: PIN, to: 'timeNowPinned: typeof timeNow === \'number\',', tests: SF_TESTS, grep: SF_GREP, note: '採用判斷放寬為只看 typeof number(範圍外之數字被當採用)' },
    { id: 'SF7', g: 'sf', file: CORE, from: PIN, to: 'timeNowPinned: true,', tests: SF_TESTS, grep: SF_GREP, note: '一律視為採用' },
    { id: 'SF8', g: 'sf', file: CORE, from: PIN, to: 'timeNowPinned: false,', tests: SF_TESTS, grep: SF_GREP, note: '一律視為未採用(釘住之時刻不入鍵)' },
    //console 摘要: 靜態不變式與接線
    { id: 'D1', g: 'desc', file: 'src/App.vue', from: 'console.log(\'login success\', getDiagShape(data.user))', to: 'console.log(\'login success\', data.user)', tests: ['test/unit-consoleNoValuesFront.test.mjs'], note: '登入成功印使用者物件' },
    { id: 'D2', g: 'desc', file: 'src/components/VeCrules.vue', from: 'console.log(\'crules\', getDiagShape(crules))', to: 'console.log(\'crules\', crules)', tests: ['test/unit-consoleNoValuesFront.test.mjs'], note: '授權字串原樣印出' },
    { id: 'D3', g: 'desc', file: 'src/main.js', from: 'console.log(\'getWebInfor catch\', getDiagBriefErr(err))', to: 'console.log(\'getWebInfor catch\', err)', tests: ['test/unit-consoleNoValuesFront.test.mjs'], note: '錯誤本體原樣印出' },
    { id: 'D4', g: 'desc', file: 'src/components/VeCgrups.vue', from: 'import getDiagShape from \'wsemi/src/getDiagShape.mjs\'', to: '', tests: ['test/unit-consoleNoValuesFront.test.mjs'], note: '呼叫 getDiagShape 但未匯入' },
    { id: 'D5', g: 'desc', file: 'src/plugins/mUI.mjs', from: 'import getDiagShape from \'wsemi/src/getDiagShape.mjs\'', to: 'function getDiagShape(v) {\n    return typeof v\n}', tests: ['test/unit-consoleNoValuesFront.test.mjs'], note: '以本地函數取代 wsemi 匯入(自寫等價實作)' },
    { id: 'D6', g: 'desc', create: 'src/js/describeShape.mjs', content: 'export default 1\n', tests: ['test/unit-consoleNoValuesFront.test.mjs'], note: '復活本地模組檔' },
    { id: 'D7', g: 'desc', file: 'server/maskLog.mjs', from: 'export {', to: 'export {\n    safeCtl,', tests: ['test/unit-consoleNoValuesFront.test.mjs'], note: 'maskLog 多匯出 safeCtl' },
    { id: 'D8', g: 'desc', file: 'server/WWebPerm.mjs', from: 'console.log(\'getUserRules\', getDiagBriefErr(err))', to: 'console.log(\'getUserRules\', err)', tests: ['test/unit-consoleNoValues.test.mjs', 'test/api-consoleNoValues.test.mjs'], note: 'getUserRules 例外原樣印出(靜態＋真後端)' },
    { id: 'D9', g: 'desc', file: 'srv.mjs', from: 'console.log(\'error\', getDiagBriefErr(err))', to: 'console.log(\'error\', err)', tests: ['test/unit-consoleNoValues.test.mjs'], note: 'srv.mjs error 事件原樣印出' },
    { id: 'D10', g: 'desc', file: 'test/tools/srcScan.mjs', from: '[\'getDiagShape\', \'getDiagBriefErr\', \'maskTok\'', to: '[\'describeShape\', \'getDiagShape\', \'getDiagBriefErr\', \'maskTok\'', tests: ['test/unit-consoleNoValues.test.mjs'], note: '掃描器重新允許已不存在之 describeShape' },
    { id: 'D11', g: 'desc', file: 'server/WWebPerm.mjs', from: 'import getDiagShape from \'wsemi/src/getDiagShape.mjs\'', to: '', tests: ['test/unit-consoleNoValuesFront.test.mjs'], note: '伺服端呼叫 getDiagShape 但未匯入' },
    //safeCtl(maskTok 露出字元)
    { id: 'C1', g: 'desc', file: 'server/maskLog.mjs', from: 'return isCtl ? \'?\' : c', to: 'return c', tests: ['test/unit-maskLog.test.mjs'], note: 'safeCtl 不替換' },
    { id: 'C2', g: 'desc', file: 'server/maskLog.mjs', from: 'x < 32 ||', to: 'x < 31 ||', tests: ['test/unit-maskLog.test.mjs'], note: 'C0 上界少一' },
    { id: 'C3', g: 'desc', file: 'server/maskLog.mjs', from: 'x >= 127 && x <= 159', to: 'x >= 127 && x <= 158', tests: ['test/unit-maskLog.test.mjs'], note: 'C1 上界少一' },
    { id: 'C4', g: 'desc', file: 'server/maskLog.mjs', from: 'x >= 127 && x <= 159', to: 'x >= 128 && x <= 159', tests: ['test/unit-maskLog.test.mjs'], note: 'DEL 不換' },
    { id: 'C5', g: 'desc', file: 'server/maskLog.mjs', from: 'x === 0x2028 || x === 0x2029 ||', to: 'x === 0x2028 ||', tests: ['test/unit-maskLog.test.mjs'], note: '段分隔 U+2029 不換' },
    { id: 'C6', g: 'desc', file: 'server/maskLog.mjs', from: '(x >= 0x202a && x <= 0x202e)', to: '(x >= 0x202a && x <= 0x202d)', tests: ['test/unit-maskLog.test.mjs'], note: 'RLO U+202E 不換' },
    { id: 'C7', g: 'desc', file: 'server/maskLog.mjs', from: '(x >= 0x2066 && x <= 0x2069)', to: '(x >= 0x2066 && x <= 0x2068)', tests: ['test/unit-maskLog.test.mjs'], note: 'PDI U+2069 不換' },
    { id: 'C8', g: 'desc', file: 'server/maskLog.mjs', from: '(x >= 0x2066 && x <= 0x2069)', to: '(x >= 0x2065 && x <= 0x2069)', tests: ['test/unit-maskLog.test.mjs'], note: '範圍多換 U+2065' },
]

function runMocha(tests, grep) {
    let args = [mocha, '--no-parallel', ...tests, '--timeout', '180000']
    if (grep) {
        args.push('--grep', grep)
    }
    let r = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', timeout: 900000, windowsHide: true, maxBuffer: 64 * 1024 * 1024 })
    let out = `${r.stdout || ''}\n${r.stderr || ''}`
    let mp = /(\d+) passing/.exec(out)
    let mf = /(\d+) failing/.exec(out)
    let np = mp ? Number(mp[1]) : 0
    let nf = mf ? Number(mf[1]) : 0
    let fails = []
    for (let m of out.matchAll(/^\s+\d+\) .*\n(?:.*\n){0,3}?\s+((?:TL-|CNVF-|SITE-|CNV-|MASK-|SHAPE-|ERR-)[^\n:]{0,80})/gm)) {
        fails.push(m[1].trim())
    }
    return { status: r.status, np, nf, summary: nf > 0 ? 'FAIL' : (np > 0 ? 'PASS' : 'NO-SUMMARY'), fails: fails.slice(0, 6) }
}

let results = []
let list = M.filter((m) => group === 'all' || m.g === group)
console.log(`[mutate] 群組=${group} 項數=${list.length}${dry ? ' (dry: 只驗錨點)' : ''}`)

//對照組: 各測試集未變異先跑
let sets = new Map()
for (let m of list) {
    sets.set(`${m.tests.join('+')}|${m.grep || ''}`, m)
}
if (!dry) {
    for (let [k, m] of sets) {
        let r = runMocha(m.tests, m.grep)
        console.log(`[control] ${k} => ${r.summary} passing=${r.np} failing=${r.nf}`)
        if (r.summary !== 'PASS') {
            console.log('[control] 對照組非全綠, 中止')
            process.exit(2)
        }
    }
}

for (let m of list) {
    let rec = { id: m.id, note: m.note, tests: m.tests, file: m.file || m.create }
    try {
        if (m.create) {
            let fp = path.join(root, m.create)
            if (fs.existsSync(fp)) {
                throw new Error('建立目標已存在')
            }
            if (dry) {
                rec.verdict = 'DRY-OK'
            }
            else {
                fs.writeFileSync(fp, m.content, 'utf8')
                try {
                    let r = runMocha(m.tests, m.grep)
                    rec.run = r
                    rec.verdict = r.summary === 'FAIL' ? 'KILLED' : 'SURVIVED'
                }
                finally {
                    fs.rmSync(fp, { force: true })
                }
                rec.restored = !fs.existsSync(fp)
            }
        }
        else {
            let fp = path.join(root, m.file)
            let before = fs.readFileSync(fp, 'utf8')
            let n = before.split(m.from).length - 1
            if (n !== 1) {
                rec.verdict = `ANCHOR-${n}`
            }
            else if (dry) {
                rec.verdict = 'DRY-OK'
            }
            else {
                let after = before.replace(m.from, () => m.to)
                if (after === before) {
                    throw new Error('變異未改變內容')
                }
                fs.writeFileSync(fp, after, 'utf8')
                try {
                    let r = runMocha(m.tests, m.grep)
                    rec.run = r
                    rec.verdict = r.summary === 'FAIL' ? 'KILLED' : (r.summary === 'PASS' ? 'SURVIVED' : 'UNDECIDED')
                }
                finally {
                    fs.writeFileSync(fp, before, 'utf8')
                }
                let back = fs.readFileSync(fp, 'utf8')
                rec.restored = sha(back) === sha(before)
            }
        }
    }
    catch (err) {
        rec.verdict = 'ERROR'
        rec.error = String(err && err.message || err)
    }
    results.push(rec)
    console.log(`[${m.id}] ${rec.verdict}${rec.run ? ` (passing=${rec.run.np} failing=${rec.run.nf}; ${rec.run.fails.join(' | ')})` : ''}${rec.restored === false ? ' !!未還原' : ''} -- ${m.note}`)
}
let killed = results.filter((r) => r.verdict === 'KILLED').length
console.log(`[mutate] KILLED ${killed}/${results.length}; 非 KILLED: ${results.filter((r) => r.verdict !== 'KILLED').map((r) => `${r.id}:${r.verdict}`).join(', ') || '無'}`)
fs.writeFileSync(path.join(root, 'tmp', 'twp2', `mutation-results-${group}${dry ? '-dry' : ''}.json`), JSON.stringify(results, null, 1))
