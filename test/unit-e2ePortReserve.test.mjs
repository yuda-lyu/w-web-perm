//測試 e2e 單開之自動換埠與只動本實例之下殺(規則帳本 R-E2E-PORT-01; 排程第 309 項, 2026-11-05 wp309; 規格 C:/opensrcOper/dspec/e2e埠與多套件同跑.md E1～E8)
//
//受測: test/tools/e2ePorts.mjs(基準埠單一定義＋reserveE2ePorts)、test/tools/e2e-setup.mjs(apiBaseUrl／baseUrl／genTempSettings 之 serverPort／killOwnSrvProcesses)、
//      test/tools/run-e2e-isolated.mjs(逐檔 runner 之下殺)、test/ 下寫死之埠與網址。
//契約(R-E2E-PORT-01):
//  1. [E1][E2] 沒有占用時即基準埠(E2E_PORT_OFFSET 維持未設); 基準埠(後端或前端任一)被真實監聽者占用時整組位移, 位移後之 apiBaseUrl／baseUrl／臨時設定之 serverPort 皆為位移後之實際埠。
//  2. [E4] 占用者絕不被動到: 位移之過程中占用者仍在監聽、沒有收到任何 HTTP 請求(保留與偵測只做綁定檢查)。
//  3. [E3] 兩個同時開跑之行程(同一登錄目錄)不會選到同一組埠(預約, 偵測與綁定之間有時間差)。
//  4. [E4] killOwnSrvProcesses 只殺本實例(srvPath 為絕對路徑之命令列比對)之後端: 不殺他實例(同前綴目錄)、不殺他套件、不殺同路徑而監聽他埠者(另一實例); 殺未監聽(卡住)或監聽本實例後端埠者。
//  5. [E4] test/ 內無依埠或依名稱下殺(killPortListeners)之呼叫; 逐檔 runner 只殺本實例已確認身分之監聽者並於遇他人占用時中止。
//  6. 測試碼(e2e-／api-／tools)無寫死之 host:埠 網址; api-／unit- 測試寫死之監聽埠與 e2ePorts.OTHER_TEST_PORTS 一致(新增忘了列即紅)。
//占用者為真實 http 監聽(同 node 預設之雙棧位址)。造不出占用(基準埠已被他人占用)時 skip 並寫明原因, 不假綠。
//跑法: node C:/opensrcOper/tools/quiet-run.mjs --name e2ePortReserve --lock -- npx mocha test/unit-e2ePortReserve.test.mjs --timeout 120000
import fs from 'fs'
import net from 'net'
import http from 'http'
import path from 'path'
import assert from 'assert'
import { spawn, spawnSync } from 'child_process'
import { fileURLToPath, pathToFileURL } from 'url'
import { sourceLines } from './tools/srcScan.mjs'

const A = assert.strict
const fdTest = path.dirname(fileURLToPath(import.meta.url))
const projRoot = path.join(fdTest, '..')
const fdTmp = path.join(fdTest, '_tmp', 'e2ePortReserve') //測試中介資料(測完即刪)
const fdReg = path.join(fdTmp, 'reg') //私有之埠預約登錄目錄(不干擾真實預約)
const SETUP_URL = pathToFileURL(path.join(fdTest, 'tools', 'e2e-setup.mjs')).href
const PORTS_URL = pathToFileURL(path.join(fdTest, 'tools', 'e2ePorts.mjs')).href

//子行程: 匯入 e2e-setup(模組頂層即保留埠)後回報實際埠; holdOpen 時續留至父行程寫入一行(保留不釋放)
const CHILD_CODE = `
import fs from 'fs'
const m = await import(${JSON.stringify(SETUP_URL)})
const p = await import(${JSON.stringify(PORTS_URL)})
const t = JSON.parse(fs.readFileSync(m.genTempSettings({}), 'utf8'))
console.log('RESULT ' + JSON.stringify({ source: p.reservation.source, offset: p.reservation.offset, ports: p.reservation.ports, env: process.env.E2E_PORT_OFFSET === undefined ? null : process.env.E2E_PORT_OFFSET, api: m.apiBaseUrl, base: m.baseUrl, serverPort: t.serverPort }))
if (process.env.WP309_HOLD_OPEN === '1') {
    await new Promise((resolve) => process.stdin.once('data', resolve))
}
m.cleanup()
`

let baseEnv = () => {
    let env = { ...process.env, E2E_PORT_REG_DIR: fdReg }
    for (let k of ['E2E_PORT_OFFSET', 'E2E_PORT_HOLD', 'E2E_REGEN', 'E2E_BARE', 'E2E_DIAG', 'E2E_COLLECT', 'WP309_HOLD_OPEN']) {
        delete env[k]
    }
    return env
}

let runChild = (env) => {
    let r = spawnSync(process.execPath, ['--input-type=module', '-e', CHILD_CODE], { cwd: projRoot, env, encoding: 'utf8', timeout: 90000, windowsHide: true })
    let m = /RESULT (.*)/.exec(r.stdout || '')
    return { status: r.status, out: m ? JSON.parse(m[1]) : null, stdout: r.stdout || '', err: (r.stderr || '').slice(-800) }
}

//以真實 http 監聽占用一個埠(node 預設之雙棧位址); 記錄收到之請求數
let occupy = (port) => new Promise((resolve, reject) => {
    let hits = 0
    let server = http.createServer((req, res) => {
        hits++
        res.end('occupied')
    })
    server.once('error', reject)
    server.listen(port, () => resolve({ port, hits: () => hits, close: () => new Promise((r) => server.close(r)) }))
})

//埠是否仍在監聽(以 TCP 連線檢查, 不送 HTTP)
let isListening = (port) => new Promise((resolve) => {
    let s = net.connect({ host: '127.0.0.1', port })
    s.once('connect', () => {
        s.destroy()
        resolve(true)
    })
    s.once('error', () => resolve(false))
})

//基準埠是否可由本測試占用(被他人占用即無法造情境)
let canOccupy = async (port) => {
    try {
        let o = await occupy(port)
        await o.close()
        return true
    }
    catch (err) {
        return false
    }
}

//使該埠處於「被占用」: 能占即以真實 http 監聽占用(own=true, 可驗占用者沒被打到); 該埠已被他人占用(如同一 mocha 行程內 api 測試已起之後端占著 11006, 全套之 rest 段即是)
//  則視為已被占用(own=false), 不重複占。使本檔之占用情境在單檔跑與全套 rest 段皆能成立, 不因環境而整批 skip。
let holdBusy = async (port) => {
    try {
        return { ...(await occupy(port)), own: true }
    }
    catch (err) {
        if (err.code !== 'EADDRINUSE' && err.code !== 'EACCES') {
            throw err
        }
        return { port, own: false, hits: () => 0, close: async () => {} }
    }
}

//埠是否空閒(同套件偵測: 預設位址與 127.0.0.1 皆能綁定)
let isFree = async (port) => {
    for (let host of [undefined, '127.0.0.1']) {
        let ok = await new Promise((resolve) => {
            let s = net.createServer()
            s.once('error', () => resolve(false))
            s.listen(port, host, () => s.close(() => resolve(true)))
        })
        if (!ok) {
            return false
        }
    }
    return true
}

//依「由小到大逐一試位移 0、100、200…, 兩個基準埠皆空閒之第一個」算出期望位移(與當下環境無關: 他人占用者、api 後端、本測試之占用者皆計入)
let firstFreeOffset = async () => {
    for (let off = 0; off < 2000; off += 100) {
        if ((await isFree(11006 + off)) && (await isFree(8090 + off))) {
            return off
        }
    }
    throw new Error('找不到空閒之位移')
}

let alive = (pid) => {
    try {
        process.kill(pid, 0)
        return true
    }
    catch (err) {
        return err.code === 'EPERM'
    }
}

let sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

//等行程確實結束(輪詢至 PID 消失, 上限 15 秒; 以可觀察之條件同步, 不以固定延時後斷言)
let waitDead = async (pid, limitMs = 15000) => {
    let t0 = Date.now()
    while (alive(pid)) {
        if (Date.now() - t0 > limitMs) {
            return false
        }
        await sleep(100)
    }
    return true
}

let codeOf = (fp) => sourceLines(fp, 'code').map((l) => l.text).join('\n')


describe('unit-e2ePortReserve (e2e 單開自動換埠與只動本實例之下殺, R-E2E-PORT-01)', function() {
    this.timeout(180000)

    before(function() {
        fs.rmSync(fdTmp, { recursive: true, force: true })
        fs.mkdirSync(fdReg, { recursive: true })
    })

    after(function() {
        fs.rmSync(fdTmp, { recursive: true, force: true })
    })

    describe('契約 1、2: 基準埠空閒即基準埠; 被占用整組位移且占用者不受影響', function() {
        it('PR-001 沒有占用: 基準埠 11006／8090, E2E_PORT_OFFSET 維持未設, apiBaseUrl／baseUrl／臨時設定同導入前', async function() {
            if (!(await canOccupy(11006)) || !(await canOccupy(8090))) {
                this.skip() //前提: 基準埠空閒; 本機有他人占用時無法驗「沒有占用」之情境
            }
            let { status, out, err } = runChild(baseEnv())
            A.equal(status, 0, `子行程失敗: ${err}`)
            A.equal(out.source, 'auto')
            A.equal(out.offset, 0)
            A.deepEqual(out.ports, [11006, 8090])
            A.equal(out.env, null, '沒有位移時不得寫入 E2E_PORT_OFFSET(行為同導入前)')
            A.equal(out.api, 'http://127.0.0.1:11006')
            A.equal(out.base, 'http://127.0.0.1:8090')
            A.equal(out.serverPort, 11006, '未位移之臨時設定 serverPort 同 settings.json')
        })

        for (let [id, held] of [
            ['PR-002', [11006]], //後端基準埠被占用
            ['PR-003', [8090]], //前端基準埠被占用: 後端也一起移位(只換一個埠服務之間就連不上, E3)
            ['PR-004', [11006, 11106]], //第一個位移之後端埠也被占用: 再移一格
        ]) {
            it(`${id} 占用 ${held.join('、')}: 整組位移至「首個空閒位移」; 占用者仍在監聽且沒收到任何請求; 網址與臨時設定皆為實際埠`, async function() {
                let occupiers = []
                try {
                    for (let p of held) {
                        occupiers.push(await holdBusy(p))
                    }
                    //期望位移由當下環境算出(含他人與 api 後端之占用), 並須確實位移(基準埠已被占用)
                    let expOffset = await firstFreeOffset()
                    let expPorts = [11006 + expOffset, 8090 + expOffset]
                    A.ok(expOffset >= 100 * (held.includes(11106) ? 2 : 1), `前提: 基準埠已被占用, 期望位移須 >= ${100 * (held.includes(11106) ? 2 : 1)}, 實得 ${expOffset}`)
                    let { status, out, stdout, err } = runChild(baseEnv())
                    A.equal(status, 0, `子行程失敗: ${err}`)
                    A.equal(out.source, 'auto')
                    A.equal(out.offset, expOffset)
                    A.deepEqual(out.ports, expPorts)
                    A.equal(out.env, String(expOffset), '位移寫入 E2E_PORT_OFFSET, 供 resolveE2ePort／前端 proxy／子行程取得同一組埠')
                    A.equal(out.api, `http://127.0.0.1:${expPorts[0]}`, 'apiBaseUrl 為實際後端埠')
                    A.equal(out.base, `http://127.0.0.1:${expPorts[1]}`, 'baseUrl 為實際前端埠')
                    A.equal(out.serverPort, expPorts[0], '臨時設定之 serverPort 為實際後端埠(srv.mjs 之埠只能由 settings 決定)')
                    A.ok(new RegExp(`\\[e2e-port\\] 基準埠 \\[11006, 8090\\] → 實際埠 \\[${expPorts.join(', ')}\\]`).test(stdout), `[E6] 實際使用之埠須印入輸出: ${stdout.slice(0, 300)}`)
                    for (let o of occupiers) {
                        A.equal(await isListening(o.port), true, `占用者 ${o.port} 須仍在監聽(絕不殺占用者)`)
                        A.equal(o.hits(), 0, `占用者 ${o.port} 不得收到任何 HTTP 請求(只做綁定檢查, 不打到別人的服務)`)
                    }
                }
                finally {
                    for (let o of occupiers) {
                        await o.close()
                    }
                }
            })
        }

        it('PR-005 手動 E2E_PORT_OFFSET=0(沿用逃生口): 不換埠, 占用者仍不被動(只告警)', async function() {
            let o = await holdBusy(11006)
            try {
                let { status, out, stdout, err } = runChild({ ...baseEnv(), E2E_PORT_OFFSET: '0' })
                A.equal(status, 0, `子行程失敗: ${err}`)
                A.equal(out.source, 'pinned')
                A.deepEqual(out.ports, [11006, 8090], '手動指定位移 0＝明確要求基準埠, 不自動換埠')
                A.ok(/警告/.test(stdout), '被占用時須告警(不靜默)')
                A.equal(await isListening(11006), true)
                A.equal(o.hits(), 0)
            }
            finally {
                await o.close()
            }
        })
    })

    describe('契約 3: 同時開跑之兩個行程不選到同一組埠(預約)', function() {
        it('PR-006 兩個子行程同一登錄目錄: 先到者取首個空閒位移, 後到者因預約而取更大之位移(兩組埠不重疊)', async function() {
            let off0 = await firstFreeOffset()
            let kids = []
            let startKid = () => new Promise((resolve, reject) => {
                let child = spawn(process.execPath, ['--input-type=module', '-e', CHILD_CODE], { cwd: projRoot, env: { ...baseEnv(), WP309_HOLD_OPEN: '1' }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
                kids.push(child)
                let buf = ''
                let tm = setTimeout(() => reject(new Error(`子行程逾時未回報: ${buf.slice(-400)}`)), 60000)
                child.stdout.on('data', (d) => {
                    buf += d
                    let m = /RESULT (.*)/.exec(buf)
                    if (m) {
                        clearTimeout(tm)
                        resolve(JSON.parse(m[1]))
                    }
                })
                child.once('error', reject)
            })
            try {
                let a = await startKid()
                let b = await startKid() //a 仍持有(未結束), 其預約使 b 不得選同一組, 即使兩組埠都沒有真實監聽者
                A.equal(a.offset, off0, '先到者取首個空閒位移')
                A.ok(b.offset > a.offset, `後到者須因預約而位移(偵測與綁定之間有時間差, 不能只靠綁定檢查): 先 ${a.offset} 後 ${b.offset}`)
                A.ok(a.ports.every((p) => !b.ports.includes(p)), `兩組埠不得重疊: ${a.ports} vs ${b.ports}`)
            }
            finally {
                for (let k of kids) {
                    try {
                        k.stdin.write('go\n')
                    }
                    catch (err) {}
                }
                await sleep(1500)
                for (let k of kids) {
                    if (alive(k.pid)) {
                        k.kill()
                    }
                }
            }
        })
    })

    describe('契約 4: killOwnSrvProcesses 只殺本實例之後端(命令列含 srvPath 絕對路徑者, 且不殺監聽他埠者)', function() {
        it('PR-007 同前綴目錄(i10 vs i1)、他套件路徑、同路徑而監聽他埠者皆不殺; 未監聽(卡住)與監聽本實例後端埠者殺', async function() {
            //srvPath 含非 ASCII(同本機「開源」路徑), 命令列以 PowerShell 之 UTF-8 輸出於 node 端比對
            let fdInst = path.join(fdTmp, '實例')
            let srvA = path.join(fdInst, 'i1', 'srv.mjs')
            let srvSibling = path.join(fdInst, 'i10', 'srv.mjs') //前綴相近之他實例
            let srvOther = path.join(fdTmp, 'other-pkg', 'srv.mjs') //他套件
            let dummies = []
            let startDummy = (srv, listen) => new Promise((resolve, reject) => {
                let code = listen
                    ? "const s=require('net').createServer(); s.listen(0,'127.0.0.1',()=>console.log('PORT '+s.address().port)); setInterval(()=>{},1000)"
                    : "console.log('PORT 0'); setInterval(()=>{},1000)"
                let child = spawn(process.execPath, ['-e', code, '--', srv], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true })
                dummies.push(child)
                let tm = setTimeout(() => reject(new Error('dummy 逾時')), 20000)
                let buf = ''
                child.stdout.on('data', (d) => {
                    buf += d
                    let m = /PORT (\d+)/.exec(buf)
                    if (m) {
                        clearTimeout(tm)
                        resolve({ pid: child.pid, port: Number(m[1]) })
                    }
                })
                child.once('error', reject)
            })
            try {
                let stuck = await startDummy(srvA, false) //本實例, 未監聽(卡住之舊後端) → 殺
                let own = await startDummy(srvA, true) //本實例, 監聽本實例後端埠 → 殺
                let anotherPort = await startDummy(srvA, true) //同路徑, 監聽他埠(同專案根之另一實例) → 不殺
                let sibling = await startDummy(srvSibling, false) //前綴相近之他實例 → 不殺
                let other = await startDummy(srvOther, false) //他套件 → 不殺
                let code = `
const m = await import(${JSON.stringify(SETUP_URL)})
const killed = m.killOwnSrvProcesses({ srvPath: ${JSON.stringify(srvA)}, ownPort: ${own.port} })
console.log('RESULT ' + JSON.stringify({ killed }))
m.cleanup()
`
                let r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: projRoot, env: { ...baseEnv(), E2E_PORT_HOLD: 'wp309-unit' }, encoding: 'utf8', timeout: 90000, windowsHide: true })
                let mm = /RESULT (.*)/.exec(r.stdout || '')
                A.ok(mm, `子行程失敗: ${(r.stderr || '').slice(-600)}`)
                let killed = JSON.parse(mm[1]).killed.sort()
                A.deepEqual(killed, [stuck.pid, own.pid].sort(), '只殺未監聽者與監聽本實例後端埠者')
                A.equal(await waitDead(stuck.pid), true, '未監聽(卡住)之本實例後端須被殺')
                A.equal(await waitDead(own.pid), true, '監聽本實例後端埠之本實例後端須被殺')
                A.equal(alive(anotherPort.pid), true, '同路徑而監聽他埠者(同專案根之另一實例)不得被殺')
                A.equal(alive(sibling.pid), true, '前綴相近之他實例目錄(i10)不得被殺')
                A.equal(alive(other.pid), true, '他套件之後端不得被殺')
            }
            finally {
                for (let d of dummies) {
                    if (alive(d.pid)) {
                        d.kill()
                    }
                }
            }
        })
    })

    describe('契約 4b: 取不到監聽表時 killOwnSrvProcesses 不殺(寧缺勿濫)', function() {
        //獨立審查(2026-11-05)指出: 對單一 cmdlet 加 -ErrorAction SilentlyContinue 會使取表失敗時監聽表為空, 變成「全部視為未監聽而照殺」
        for (let [label, listenQuery] of [['監聽表查詢失敗(拋錯)', "throw 'wp309 模擬取表失敗'"], ['監聽表為空', '@()']]) {
            it(`PR-012 ${label}: 即使有命令列含 srvPath 之行程也一個都不殺`, async function() {
                let srv = path.join(fdTmp, '實例', 'iz', 'srv.mjs')
                let child = spawn(process.execPath, ['-e', "console.log('UP'); setInterval(()=>{},1000)", '--', srv], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true })
                try {
                    await new Promise((resolve, reject) => {
                        let tm = setTimeout(() => reject(new Error('dummy 逾時')), 20000)
                        child.stdout.on('data', () => {
                            clearTimeout(tm)
                            resolve()
                        })
                        child.once('error', reject)
                    })
                    let code = `
const m = await import(${JSON.stringify(SETUP_URL)})
const killed = m.killOwnSrvProcesses({ srvPath: ${JSON.stringify(srv)}, ownPort: 1, listenQuery: ${JSON.stringify(listenQuery)} })
console.log('RESULT ' + JSON.stringify({ killed }))
m.cleanup()
`
                    let r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: projRoot, env: { ...baseEnv(), E2E_PORT_HOLD: 'wp309-unit' }, encoding: 'utf8', timeout: 90000, windowsHide: true })
                    let mm = /RESULT (.*)/.exec(r.stdout || '')
                    A.ok(mm, `子行程失敗: ${(r.stderr || '').slice(-600)}`)
                    A.deepEqual(JSON.parse(mm[1]).killed, [], '取不到監聽表時須回 []')
                    await sleep(500)
                    A.equal(alive(child.pid), true, '行程不得被殺')
                }
                finally {
                    if (alive(child.pid)) {
                        child.kill()
                    }
                }
            })
        }
    })

    describe('契約 5: 無依埠或依名稱下殺; 逐檔 runner 只殺本實例並於遇他人占用時中止', function() {
        let files = () => [
            ...fs.readdirSync(fdTest).filter((f) => /\.mjs$/.test(f)).map((f) => path.join(fdTest, f)),
            ...fs.readdirSync(path.join(fdTest, 'tools')).filter((f) => /\.mjs$/.test(f)).map((f) => path.join(fdTest, 'tools', f)),
        ].filter((fp) => path.basename(fp) !== 'unit-e2ePortReserve.test.mjs')

        it('PR-008 test/ 與 test/tools/ 之可執行碼(含 e2eLib 轉出)不含 killPortListeners(依埠下殺)', function() {
            let hits = []
            for (let fp of files()) {
                for (let l of sourceLines(fp, 'code')) {
                    if (/killPortListeners/.test(l.text)) {
                        hits.push(`${path.relative(projRoot, fp)}:${l.no}`)
                    }
                }
            }
            A.deepEqual(hits, [], `不得依埠下殺(占用者可能是別的套件之測試), 改用 reservation.killOwnListeners: ${hits.join(', ')}`)
        })

        it('PR-009 run-e2e-isolated: 以 reservation.killOwnListeners 下殺、遇非本實例占用即拋錯中止; e2e-setup 之服務管理器明確帶入 reservation', function() {
            let runner = codeOf(path.join(fdTest, 'tools', 'run-e2e-isolated.mjs'))
            A.ok(/reservation\.killOwnListeners\(/.test(runner), 'runner 須以 reservation.killOwnListeners 下殺')
            A.ok(/skipped/.test(runner) && /throw new Error\(/.test(runner), 'runner 遇下殺略過(非本實例占用)須拋錯中止, 不得讓下一檔沿用他人之服務')
            A.ok(/beforeEachFile:[\s\S]*?killOwnBackend\(true\)/.test(runner), '每檔前之下殺須為 strict(遇他人占用拋錯); 僅收尾(afterAll)可只印出')
            A.ok(/from '\.\/e2ePorts\.mjs'/.test(runner), 'runner 之基準埠與保留取自 e2ePorts.mjs(單一定義)')
            let setup = codeOf(path.join(fdTest, 'tools', 'e2e-setup.mjs'))
            A.ok(/from '\.\/e2ePorts\.mjs'/.test(setup), 'e2e-setup 之基準埠與保留取自 e2ePorts.mjs')
            A.ok(/createServiceManager\(\{[\s\S]*?\breservation,/.test(setup), 'createServiceManager 須明確帶入 reservation(只殺身分已確認屬本實例者)')
            let ports = codeOf(path.join(fdTest, 'tools', 'e2ePorts.mjs'))
            A.ok(/reserveE2ePorts\(\[BACKEND_PORT, FRONTEND_PORT\], \{ avoid: OTHER_TEST_PORTS \}\)/.test(ports), 'e2ePorts 須一次宣告全部基準埠並帶 avoid')
        })
    })

    describe('契約 6: 測試碼無寫死之 host:埠 網址; 寫死之監聽埠與 avoid 清單一致', function() {
        it('PR-010 e2e-／api- 測試與 test/tools 之可執行碼不含「localhost／127.0.0.1 ＋ :數字埠」之寫死網址(網址一律由 apiBaseUrl／baseUrl 衍生)', function() {
            let hits = []
            let cand = [
                ...fs.readdirSync(fdTest).filter((f) => /^(e2e|api)-.*\.test\.mjs$/.test(f)).map((f) => path.join(fdTest, f)),
                ...fs.readdirSync(path.join(fdTest, 'tools')).filter((f) => /\.mjs$/.test(f)).map((f) => path.join(fdTest, 'tools', f)),
            ]
            for (let fp of cand) {
                for (let l of sourceLines(fp, 'code')) {
                    if (/(localhost|127\.0\.0\.1):\d{2,5}/.test(l.text)) {
                        hits.push(`${path.relative(projRoot, fp)}:${l.no}: ${l.text.trim().slice(0, 100)}`)
                    }
                }
            }
            A.deepEqual(hits, [], `寫死之網址(位移後會打到別人的服務): ${hits.join(' | ')}`)
        })

        it('PR-011 api-／unit- 測試及子行程腳本寫死之監聽埠＝e2ePorts.OTHER_TEST_PORTS(新增寫死埠而忘了列入 avoid 即紅)', function() {
            let found = new Set()
            let where = []
            let cand = [
                ...fs.readdirSync(fdTest).filter((f) => /\.mjs$/.test(f) && f !== 'unit-e2ePortReserve.test.mjs').map((f) => path.join(fdTest, f)),
                ...fs.readdirSync(path.join(fdTest, 'tools')).filter((f) => /\.mjs$/.test(f) && f !== 'e2ePorts.mjs').map((f) => path.join(fdTest, 'tools', f)),
            ]
            for (let fp of cand) {
                for (let l of sourceLines(fp, 'code')) {
                    let re = /\b(PORT|PORT_INIT|port|serverPort)\b\s*[:=]\s*(\d{4,5})\b/g
                    let m
                    while ((m = re.exec(l.text)) !== null) {
                        found.add(Number(m[2]))
                        where.push(`${path.basename(fp)}:${l.no}=${m[2]}`)
                    }
                }
            }
            //自 e2ePorts.mjs 原始碼取清單, 不 import 該模組(import 會在本 mocha 行程內實際呼叫 reserveE2ePorts, 使本盤點依賴環境; 獨立審查 2026-11-05)
            let m = /OTHER_TEST_PORTS\s*=\s*\[([^\]]*)\]/.exec(codeOf(path.join(fdTest, 'tools', 'e2ePorts.mjs')))
            A.ok(m, 'e2ePorts.mjs 須有 OTHER_TEST_PORTS 陣列')
            let listed = m[1].split(',').map((s) => Number(s.trim())).filter((n) => n > 0)
            A.deepEqual([...found].sort((a, b) => a - b), listed.sort((a, b) => a - b), `寫死之監聽埠(${where.join(', ')})須與 e2ePorts.OTHER_TEST_PORTS 一致`)
        })
    })
})
