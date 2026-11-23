//變異驗證(twp3, 排程第 609 項): 對各守護點植入單點缺陷, 確認對應測試轉紅; 每項還原後以 sha256 回驗
//用法: node spec/evidence/twp3-20261124/mutate.mjs [all|dry]   (cwd 為 repo 根; 由 quiet-run --lock 包住, 本腳本內部不另取鎖; 執行期間不得編輯 src／server／test／README)
//錨點須在原檔恰出現 1 次(否則該項報「錨點不唯一」並視為失敗); 變異後必還原(finally); 結果寫入本檔所在資料夾之 mutation-results.json
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { spawnSync } from 'child_process'
import { fileURLToPath } from 'url'

const root = process.cwd()
const fdOut = path.dirname(fileURLToPath(import.meta.url))
const mocha = path.join(root, 'node_modules', 'mocha', 'bin', 'mocha.js')
const dry = process.argv[2] === 'dry'
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex')

const SH = 'src/plugins/mShare.mjs'
const T_UNIT = ['test/unit-diagLocalSummary.test.mjs']
const T_SITE = ['test/unit-consoleNoValues.test.mjs']
const LINE1 = 'console.log(\'cvStrToArr: JSON5.parse failed\', getDiagShape(c, { keys: false }), getDiagBriefErr(err))'
const LINE2 = 'console.log(\'cvStrToArr: cvKpToArr failed\', getDiagShape(c, { keys: false }), getDiagShape(kp, { keys: false }), getDiagBriefErr(err))'
const D = '$' //避免於一般字串內寫出樣板插值字樣
const LIT = `\`(typeof ${D}{typeof c})\``

const M = [
    //mShare 之 console 站點: 錯誤摘要
    { id: 'N1', file: SH, from: LINE1, to: 'console.log(\'cvStrToArr: JSON5.parse failed\', getDiagShape(c, { keys: false }), err)', tests: T_UNIT, note: 'JSON5 失敗站印錯誤本體' },
    { id: 'N2', file: SH, from: LINE1, to: 'console.log(\'cvStrToArr: JSON5.parse failed\', getDiagShape(c, { keys: false }), err.name)', tests: [...T_UNIT, 'test/api-consoleNoValues.test.mjs'], grep: 'DLS-|CNV-007', note: 'JSON5 失敗站印 err.name(字串; 真後端 CNV-007 亦以整行比對)' },
    { id: 'N3', file: SH, from: LINE1, to: 'console.log(\'cvStrToArr: JSON5.parse failed\', getDiagShape(c, { keys: false }), (/^\\w{1,40}$/.test(err && err.name) ? err.name : \'Error\'))', tests: T_UNIT, note: 'JSON5 失敗站復活「識別字形狀之 name 原樣放行」(原 nameOfErr 之行為)' },
    { id: 'N4', file: SH, from: LINE2, to: 'console.log(\'cvStrToArr: cvKpToArr failed\', getDiagShape(c, { keys: false }), getDiagShape(kp, { keys: false }), (/^\\w{1,40}$/.test(err && err.name) ? err.name : \'Error\'))', tests: T_UNIT, note: 'cvKpToArr 失敗站復活「識別字形狀之 name 原樣放行」' },
    { id: 'N5', file: SH, from: LINE2, to: 'console.log(\'cvStrToArr: cvKpToArr failed\', getDiagShape(c, { keys: false }), getDiagShape(kp, { keys: false }), err)', tests: T_UNIT, note: 'cvKpToArr 失敗站印錯誤本體' },
    { id: 'N6', file: SH, from: LINE2, to: 'console.log(\'cvStrToArr: cvKpToArr failed\', getDiagShape(c, { keys: false }), getDiagShape(kp, { keys: false }))', tests: T_UNIT, note: 'cvKpToArr 失敗站漏印錯誤類別' },
    //mShare 之 console 站點: 型別標示
    { id: 'S1', file: SH, from: LINE1, to: `console.log('cvStrToArr: JSON5.parse failed', ${LIT}, getDiagBriefErr(err))`, tests: T_UNIT, note: 'JSON5 失敗站復活 `(typeof …)` 字面值' },
    { id: 'S2', file: SH, from: LINE1, to: 'console.log(\'cvStrToArr: JSON5.parse failed\', getDiagShape(c), getDiagBriefErr(err))', tests: T_UNIT, note: 'JSON5 失敗站 c 用預設(列鍵名; 授權值為以資料為鍵之物件時鍵名外洩)' },
    { id: 'S3', file: SH, from: LINE2, to: 'console.log(\'cvStrToArr: cvKpToArr failed\', getDiagShape(c, { keys: false }), getDiagShape(kp), getDiagBriefErr(err))', tests: T_UNIT, note: 'cvKpToArr 失敗站 kp 用預設(列鍵名; 鍵為群組／權限／規則名)' },
    { id: 'S4', file: SH, from: LINE2, to: 'console.log(\'cvStrToArr: cvKpToArr failed\', getDiagShape(c), getDiagShape(kp, { keys: false }), getDiagBriefErr(err))', tests: T_UNIT, note: 'cvKpToArr 失敗站 c 用預設(物件授權值之鍵名外洩)' },
    { id: 'S5', file: SH, from: LINE2, to: `console.log('cvStrToArr: cvKpToArr failed', getDiagShape(c, { keys: false }), \`(typeof ${D}{typeof kp})\`, getDiagBriefErr(err))`, tests: T_UNIT, note: 'cvKpToArr 失敗站 kp 復活 `(typeof …)` 字面值' },
    //匯入與單一實作
    { id: 'I1', file: SH, from: 'import getDiagShape from \'wsemi/src/getDiagShape.mjs\'', to: '', tests: T_UNIT, note: 'mShare 呼叫 getDiagShape 但未匯入' },
    { id: 'I2', file: SH, from: 'import getDiagBriefErr from \'wsemi/src/getDiagBriefErr.mjs\'', to: '', tests: T_UNIT, note: 'mShare 呼叫 getDiagBriefErr 但未匯入' },
    { id: 'I3', file: SH, from: 'import getDiagBriefErr from \'wsemi/src/getDiagBriefErr.mjs\'', to: 'import getDiagBriefErr from \'wsemi/src/getDiagBriefErr.mjs\'\nlet nameOfErr = (err) => ((err instanceof Error && /^\\w{1,40}$/.test(err.name)) ? err.name : \'x\')', tests: T_UNIT, note: '復活本地 nameOfErr 定義(未被呼叫)' },
    //掃描器與文件範例
    { id: 'W1', file: 'test/tools/srcScan.mjs', from: '[\'getDiagShape\', \'getDiagBriefErr\', \'maskTok\', \'maskUrl\']', to: '[\'getDiagShape\', \'getDiagBriefErr\', \'maskTok\', \'maskUrl\', \'nameOfErr\']', tests: T_SITE, note: '掃描器重新允許已刪之 nameOfErr' },
    { id: 'W2', file: 'README.md', from: 'console.log(\'error\', getDiagBriefErr(err)) //只印錯誤類別(wsemi之getDiagBriefErr', to: 'console.log(\'error\', err && err.name) //只印錯誤類別(wsemi之getDiagBriefErr', tests: T_SITE, note: 'README 範例復活 err && err.name' },
    { id: 'W3', file: 'server/WWebPerm.mjs', from: ' *     console.log(\'error\', getDiagBriefErr(err)) //只印錯誤類別', to: ' *     console.log(\'error\', err && err.name) //只印錯誤類別', tests: T_SITE, note: 'WWebPerm JSDoc 範例復活 err && err.name' },
    //新增檔: 盤點之限定(類別名稱擷取、`(typeof …)` 字面值)
    { id: 'X1', create: 'server/zzNewErrName.mjs', content: 'export default (err) => err.name\n', tests: T_UNIT, note: '新增檔以 err.name 自錯誤取名稱(DLS-013 限定之檔外)' },
    { id: 'X2', create: 'server/zzNewTypeofLit.mjs', content: `export default (c) => \`(typeof ${D}{typeof c})\`\n`, tests: T_UNIT, note: '新增檔產生 `(typeof …)` 字面值(DLS-011)' },
    { id: 'X3', create: 'src/js/zzNewNameOfErr.mjs', content: 'export default function nameOfErr(err) {\n    return err.constructor.name\n}\n', tests: T_UNIT, note: '新增本地 nameOfErr(DLS-010／013)' },
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
    for (let m of out.matchAll(/^\s+\d+\) (DLS-[^\n]{0,60}|SITE-NV-\d+[^\n]{0,40}|CNV-\d+[^\n]{0,40}|CNVF-\d+)/gm)) {
        fails.push(m[1].trim())
    }
    return { status: r.status, np, nf, summary: nf > 0 ? 'FAIL' : (np > 0 ? 'PASS' : 'NO-SUMMARY'), fails: [...new Set(fails)].slice(0, 8) }
}

let results = []
console.log(`[mutate] 項數=${M.length}${dry ? ' (dry: 只驗錨點)' : ''}`)

//對照組: 各測試集未變異先跑
let sets = new Map()
for (let m of M) {
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

for (let m of M) {
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
        rec.error = String((err && err.message) || err)
    }
    results.push(rec)
    console.log(`[${m.id}] ${rec.verdict}${rec.run ? ` (passing=${rec.run.np} failing=${rec.run.nf}; ${rec.run.fails.join(' | ')})` : ''}${rec.restored === false ? ' !!未還原' : ''} -- ${m.note}`)
}
let killed = results.filter((r) => r.verdict === 'KILLED').length
console.log(`[mutate] KILLED ${killed}/${results.length}; 非 KILLED: ${results.filter((r) => r.verdict !== 'KILLED').map((r) => `${r.id}:${r.verdict}`).join(', ') || '無'}`)
if (!dry) {
    fs.writeFileSync(path.join(fdOut, 'mutation-results.json'), JSON.stringify(results, null, 1))
}
