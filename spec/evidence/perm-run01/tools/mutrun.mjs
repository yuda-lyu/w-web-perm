//變異驗證(perm-run01): 就地施加字串變異 → 跑指定測試 → 一律還原並以 sha256 回驗與備份相同; 用法 node tmp/perm-run01/mutrun.mjs <變異名>
import fs from 'fs'
import crypto from 'crypto'
import { spawnSync } from 'child_process'

const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')
const CONTRACTS = ['users', 'grups', 'pemis', 'targets'].map((t) => `src/schema/contracts/${t}.mjs`)
const COMPONENTS = ['LayoutContentGrups', 'LayoutContentPemis', 'LayoutContentTargets', 'LayoutContentUsers', 'VeGrupBlngUsers', 'VePemiBlngGrups'].map((n) => `src/components/${n}.vue`)

const MOCHA = ['node_modules/mocha/bin/mocha.js', '--no-parallel']
const unit = (files, grep) => ({ lock: false, args: [...MOCHA, ...files, ...(grep ? ['--grep', grep] : []), '--timeout', '120000', '--exit'] })
const web = (files, grep) => ({ lock: true, args: [...MOCHA, ...files, ...(grep ? ['--grep', grep] : []), '--reporter', 'list', '--timeout', '300000', '--exit'] })

const MUTS = {
    //(e) 拿掉名次: 四份契約不設 orderKey(基準不含名次)
    rank: {
        edits: CONTRACTS.map((f) => ({ file: f, find: "    orderKey: 'order',\n", repl: '' })),
        tests: [unit(['test/unit-rowDigest.test.mjs']), unit(['test/unit-draftSync.test.mjs']), web(['test/e2e-concurrent-edit.test.mjs'], '\\(eng\\) E2E-01[78]-')],
    },
    //(d) 拿掉空值等價: 轉接層把 null 換成哨兵值再算(模擬 null 與 '' 被視為不同)
    nullEquiv: {
        edits: [
            { file: 'src/js/rowDigest.mjs', find: 'function makeBaseline(rows, keyTable) {\n    try {\n        return buildBaseline(Array.isArray(rows) ? rows : [], getContract(keyTable))', repl: "let nn = (rows) => rows.map((r) => (r !== null && typeof r === 'object' ? Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v === null ? '__NULL__' : v])) : r))\nfunction makeBaseline(rows, keyTable) {\n    try {\n        return buildBaseline(nn(Array.isArray(rows) ? rows : []), getContract(keyTable))" },
            { file: 'src/js/rowDigest.mjs', find: '    let c = compareCore(Array.isArray(rows) ? rows : [], baseline, getContract(keyTable))', repl: "    let nn2 = (rs) => rs.map((r) => (r !== null && typeof r === 'object' ? Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v === null ? '__NULL__' : v])) : r))\n    let c = compareCore(nn2(Array.isArray(rows) ? rows : []), baseline, getContract(keyTable))" },
        ],
        tests: [unit(['test/unit-rowDigest.test.mjs']), unit(['test/unit-draftSync.test.mjs'], 'DS-3'), web(['test/api-baseline.test.mjs'], 'AB-4')],
    },
    //(a) 拿掉回傳列更新基準(前端): 六個元件不套用回傳列
    savedRowsClient: {
        edits: COMPONENTS.map((f) => ({ file: f, find: 'applySavedRows(', repl: '(() => false)(', count: 2 })), //import 行不含 '('; 呼叫 1 處 + 註解中 0 → 實際見下 count 容差
        tests: [unit(['test/unit-applySaved.test.mjs']), web(['test/e2e-concurrent-edit.test.mjs'], '\\(eng\\) E2E-00[1-6]-')],
    },
    //(a) 拿掉回傳列更新基準(伺服端): 存檔不回傳列
    savedRowsServer: {
        edits: [{ file: 'server/procCore.mjs', find: "    let outOf = (after, opt) => {\n        return (get(opt, 'returnRows', false) === true", repl: "    let outOf = (after, opt) => {\n        return (false && get(opt, 'returnRows', false) === true" }],
        tests: [unit(['test/unit-procCore-baseline.test.mjs']), unit(['test/unit-procCore-external.test.mjs'], 'G11'), web(['test/api-baseline.test.mjs'], 'AB-[23]'), web(['test/e2e-concurrent-edit.test.mjs'], '\\(eng\\) E2E-00[1-6]-')],
    },
    //(c) 拿掉編輯器草稿判定
    editorDraft: {
        edits: [{ file: 'src/js/draftSync.mjs', find: '    return dirty === true || editing === true', repl: '    return dirty === true' }],
        tests: [unit(['test/unit-draftSync.test.mjs']), web(['test/e2e-concurrent-edit.test.mjs'], '\\(eng\\) E2E-(009|01[0-3])-')],
    },
    //114 拿掉主體身分驗證
    subject: {
        edits: [{ file: 'src/js/draftSync.mjs', find: "function checkSubject({ subject, rows }) {\n", repl: "function checkSubject({ subject, rows }) {\n    if (rows !== undefined) {\n        return 'ok'\n    }\n" }],
        tests: [unit(['test/unit-draftSync.test.mjs']), web(['test/e2e-concurrent-edit.test.mjs'], '\\(eng\\) E2E-01[4-6]-')],
    },
    //(b) 拿掉對話框開而未編輯時重建
    dialogRebuild: {
        edits: ['VeGrupBlngUsers', 'VePemiBlngGrups'].map((n) => ({ file: `src/components/${n}.vue`, find: "                if (sc === 'ok') {\n                    vo.rebuildDialog()\n                }", repl: "                if (sc === 'ok') {\n                    void 0\n                }" })),
        tests: [unit(['test/unit-draftSync.test.mjs']), web(['test/e2e-concurrent-edit.test.mjs'], '\\(eng\\) E2E-00[78]-')],
    },
    //舊格式基準降級為不帶基準
    legacyDowngrade: {
        edits: [{ file: 'server/procCore.mjs', find: "            srLog.error({ event: 'updateTabItems-stale-error', keyTable, userId, msg: 'saveBaselineFormat', reason: 'baselineFormat', n: 0 })\n            return Promise.reject('saveBaselineFormat')", repl: '            baseline = null' }],
        tests: [unit(['test/unit-rowDigest.test.mjs']), unit(['test/unit-procCore-external.test.mjs'], 'J0'), web(['test/e2e-concurrent-edit.test.mjs'], '\\(eng\\) E2E-020-')],
    },
}

const name = process.argv[2]
const m = MUTS[name]
if (!m) {
    console.log('未知變異', name, Object.keys(MUTS))
    process.exit(2)
}
const only = process.argv[3] // 可選: 'unit' 只跑 unit
const files = [...new Set(m.edits.map((e) => e.file))]
const backup = {}
for (const f of files) {
    backup[f] = fs.readFileSync(f)
}
const shaBefore = Object.fromEntries(files.map((f) => [f, sha(f)]))
let report = []
try {
    for (const f of files) {
        let s = backup[f].toString('utf8')
        const crlf = s.includes('\r\n')
        if (crlf) {
            s = s.replace(/\r\n/g, '\n')
        }
        for (const e of m.edits.filter((x) => x.file === f)) {
            const n = s.split(e.find).length - 1
            if (n < 1) {
                throw new Error(`變異 ${name}: ${f} 找不到 ${JSON.stringify(e.find.slice(0, 60))}`)
            }
            s = s.split(e.find).join(e.repl)
        }
        if (crlf) {
            s = s.replace(/\n/g, '\r\n')
        }
        fs.writeFileSync(f, s, 'utf8')
    }
    for (const t of m.tests) {
        if (only === 'unit' && t.lock) {
            continue
        }
        const qa = ['C:/opensrcOper/tools/quiet-run.mjs', ...(t.lock ? ['--lock'] : []), '--name', `mut-${name}`, '--timeout', '1500', '--', 'node', ...t.args]
        const r = spawnSync('node', qa, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
        const out = (r.stdout || '') + (r.stderr || '')
        const mf = out.match(/(\d+) failing/)
        const mp = out.match(/(\d+) passing/)
        report.push({ cmd: t.args.slice(2).join(' ').slice(0, 150), exit: r.status, passing: mp ? Number(mp[1]) : 0, failing: mf ? Number(mf[1]) : 0 })
    }
}
finally {
    for (const f of files) {
        fs.writeFileSync(f, backup[f])
        if (sha(f) !== shaBefore[f]) {
            console.log('!!! 還原失敗', f)
            process.exitCode = 3
        }
    }
}
console.log(JSON.stringify({ mutation: name, restored: process.exitCode !== 3, results: report }, null, 1))
