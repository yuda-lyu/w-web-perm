//尾段加跑(perm-run01): 於 quiet-run --lock 內執行; 先等主鏈(pid)結束, 若『現在起 + 預估』未超過可接受之最晚結束時刻才跑指定步驟, 否則直接退出(不占鎖).
//  用法: node tmp/perm-run01/late.mjs <等待之主鏈 quiet-run pid> <最晚結束 HH:MM> <步驟,以逗號分隔>
import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'

const [pidArg, endArg, stepsArg] = process.argv.slice(2)
const pid = Number(pidArg)
const [eh, em] = endArg.split(':').map(Number)
const endMs = (() => { const d = new Date(); d.setHours(eh, em, 0, 0); return d.getTime() })()
const hhmm = () => new Date().toTimeString().slice(0, 8)
const root = path.resolve('.')
const logDir = path.resolve('./tmp/perm-run01/chain-logs')
fs.mkdirSync(logDir, { recursive: true })
const statusPath = path.join(logDir, 'status-late.json')
const status = {}
const save = () => fs.writeFileSync(statusPath, JSON.stringify(status, null, 1))

const alive = (p) => { try { process.kill(p, 0); return true } catch (e) { return e.code === 'EPERM' } }
while (alive(pid)) {
    await new Promise((r) => setTimeout(r, 3000))
}
console.log(`[late] ${hhmm()} 主鏈 pid ${pid} 已結束`)

const mocha = (files, extra = []) => ['node_modules/mocha/bin/mocha.js', '--no-parallel', ...files, '--reporter', 'list', '--timeout', '300000', '--exit', ...extra]
const STEPS = {
    relagp: { est: 14, args: () => mocha(['test/e2e-rela-grup-pemi.test.mjs']) },
    refcas: { est: 5, args: () => mocha(['test/e2e-ref-cascade.test.mjs']) },
    apiext: { est: 4, args: () => mocha(['test/api-externalRows.test.mjs', 'test/api-baseline.test.mjs'], ['--timeout', '180000']) },
    ce: { est: 13, args: () => mocha(['test/e2e-concurrent-edit.test.mjs']) },
    //e2e-external-rows 只跑 eng 語系(整檔 60 案約 17～27 分鐘, 時限內放不下; 部分驗證, 報告據實標示)
    extEng: { est: 8, args: () => mocha(['test/e2e-external-rows.test.mjs'], ['--grep', '\\(eng\\)']) },
}
for (const name of stepsArg.split(',')) {
    const s = STEPS[name]
    if (!s || Date.now() + s.est * 60000 > endMs) {
        status[name] = { state: 'skipped-no-time', at: hhmm() }
        save()
        console.log(`[late] ${hhmm()} 預估 ${s ? s.est : '?'} 分鐘將超過 ${endArg}, 略過 ${name}`)
        continue
    }
    const log = path.join(logDir, `${name}-late.log`)
    const t0 = Date.now()
    status[name] = { state: 'running', start: hhmm() }
    save()
    console.log(`[late] ${hhmm()} 開始 ${name}`)
    const fd = fs.openSync(log, 'w')
    const code = await new Promise((resolve) => {
        const c = spawn('node', s.args(), { cwd: root, stdio: ['ignore', fd, fd], windowsHide: true })
        c.on('exit', (x) => resolve(x))
    })
    fs.closeSync(fd)
    const txt = fs.readFileSync(log, 'utf8')
    const num = (re) => { const m = txt.match(re); return m ? Number(m[1]) : 0 }
    status[name] = { state: code === 0 ? 'pass' : 'FAIL', exit: code, passing: num(/(\d+) passing/), failing: num(/(\d+) failing/), pending: num(/(\d+) pending/), min: Math.round((Date.now() - t0) / 600) / 100, end: hhmm() }
    save()
    console.log(`[late] ${hhmm()} 結束 ${name}: ${JSON.stringify(status[name])}`)
}
