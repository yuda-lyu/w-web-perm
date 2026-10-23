//網頁測試鏈(perm-run01): 於單一 quiet-run --lock 內依優先序逐步執行; 每步獨立 mocha 行程(逐檔重種, 與專案 e2e 設計一致)、落 log 與狀態檔.
//  用法: node tmp/perm-run01/chain.mjs <截止時刻 HH:MM(此刻之後不再開新步驟)> <步驟代號,以逗號分隔>
//  步驟代號見 STEPS. 已開始之步驟不中斷(以 mocha 自身逾時為限); 結束時印出狀態表.
import fs from 'fs'
import path from 'path'
import { spawn, spawnSync } from 'child_process'

const root = path.resolve('.')
const logDir = path.resolve('./tmp/perm-run01/chain-logs')
fs.mkdirSync(logDir, { recursive: true })
const statusPath = path.join(logDir, 'status.json')

const [cutoff, stepsArg] = process.argv.slice(2)
const [ch, cm] = cutoff.split(':').map(Number)
const cutoffMs = (() => { const d = new Date(); d.setHours(ch, cm, 0, 0); return d.getTime() })()

const mocha = (files, extra = []) => ['node_modules/mocha/bin/mocha.js', '--no-parallel', ...files, '--reporter', 'list', '--timeout', '300000', '--exit', ...extra]
const testFiles = (re) => fs.readdirSync(path.join(root, 'test')).filter((f) => re.test(f)).sort().map((f) => `test/${f}`)

//預估分鐘(依圖數與案數粗估; 此刻起算若會超過截止時刻則略過該步, 後面較小之步驟仍可能放得下)
const EST = { unitapi: 25, apiaff: 12, ce: 14, users: 13, grups: 11, pemis: 11, targets: 15, relaug: 21, relagp: 19, relapr: 9, extrows: 27, refcas: 9, af: 11, af037: 4 }

const STEPS = {
    unitapi: () => mocha([...testFiles(/^unit-.*\.test\.mjs$/), ...testFiles(/^api-.*\.test\.mjs$/)], ['--timeout', '180000']),
    apiaff: () => mocha(['test/api-baseline.test.mjs', 'test/api-externalRows.test.mjs', 'test/api-doubleclick.test.mjs', 'test/api-verifyConn-auth.test.mjs', 'test/api-updateTabs.test.mjs', 'test/api-syncAndReplaceTabs.test.mjs', 'test/api-refCascade.test.mjs'], ['--timeout', '180000']),
    ce: () => mocha(['test/e2e-concurrent-edit.test.mjs']),
    users: () => mocha(['test/e2e-users.test.mjs']),
    grups: () => mocha(['test/e2e-grups.test.mjs']),
    pemis: () => mocha(['test/e2e-pemis.test.mjs']),
    targets: () => mocha(['test/e2e-targets.test.mjs']),
    relaug: () => mocha(['test/e2e-rela-user-grup.test.mjs']),
    relagp: () => mocha(['test/e2e-rela-grup-pemi.test.mjs']),
    relapr: () => mocha(['test/e2e-rela-pemi-rule.test.mjs']),
    extrows: () => mocha(['test/e2e-external-rows.test.mjs']),
    refcas: () => mocha(['test/e2e-ref-cascade.test.mjs']),
    af: () => mocha(['test/e2e-array-form.test.mjs'], ['--grep', 'AF-014[a-e]|AF-02[67]|AF-037']),
    af037: () => mocha(['test/e2e-array-form.test.mjs'], ['--grep', 'AF-037']),
}

const status = fs.existsSync(statusPath) ? JSON.parse(fs.readFileSync(statusPath, 'utf8')) : {}
const save = () => fs.writeFileSync(statusPath, JSON.stringify(status, null, 1))
const hhmm = () => new Date().toTimeString().slice(0, 8)

for (const name of stepsArg.split(',')) {
    if (!STEPS[name]) {
        console.log(`[chain] 未知步驟 ${name}`)
        continue
    }
    if (Date.now() + (EST[name] || 10) * 60000 > cutoffMs) {
        status[name] = { state: 'skipped-no-time', at: hhmm(), est: EST[name] }
        save()
        console.log(`[chain] ${hhmm()} 預估 ${EST[name]} 分鐘將超過截止時刻 ${cutoff}, 略過 ${name}`)
        continue
    }
    const args = STEPS[name]()
    const log = path.join(logDir, `${name}.log`)
    const t0 = Date.now()
    status[name] = { state: 'running', start: hhmm() }
    save()
    console.log(`[chain] ${hhmm()} 開始 ${name}: node ${args.slice(0, 6).join(' ').slice(0, 140)}`)
    const fd = fs.openSync(log, 'w')
    const r = await new Promise((resolve) => {
        const c = spawn('node', args, { cwd: root, stdio: ['ignore', fd, fd], windowsHide: true })
        c.on('exit', (code) => resolve(code))
    })
    fs.closeSync(fd)
    const txt = fs.readFileSync(log, 'utf8')
    const num = (re) => { const m = txt.match(re); return m ? Number(m[1]) : 0 }
    status[name] = { state: r === 0 ? 'pass' : 'FAIL', exit: r, passing: num(/(\d+) passing/), failing: num(/(\d+) failing/), pending: num(/(\d+) pending/), min: Math.round((Date.now() - t0) / 600) / 100, end: hhmm() }
    save()
    console.log(`[chain] ${hhmm()} 結束 ${name}: ${JSON.stringify(status[name])}`)
}

//埠回驗
const ns = spawnSync('netstat', ['-ano'], { encoding: 'utf8' })
const listen = (ns.stdout || '').split('\n').filter((l) => /LISTENING/.test(l) && /:(11006|8090)\s/.test(l))
console.log(`[chain] 結束時 11006／8090 監聽: ${listen.length === 0 ? '無(已釋放)' : listen.join(' | ')}`)
console.log(JSON.stringify(status, null, 1))
