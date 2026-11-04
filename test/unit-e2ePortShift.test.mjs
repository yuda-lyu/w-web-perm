//測試 e2e 多開之埠位移接線(規則帳本 R-E2E-SHARD-01; 排程第 302、275 項, 2026-11-04 wp302)
//
//受測: test/tools/e2e-setup.mjs(apiBaseUrl／baseUrl／genTempSettings 之 serverPort)、test/tools/run-e2e-isolated.mjs、vue.config.js(proxy 目標)、
//      test/tools/e2eShard.json(分組設定)、test/ 下 child_process 呼叫之 windowsHide.
//契約(R-E2E-SHARD-01):
//  1. 未設 E2E_PORT_OFFSET(含 '' 與 '0')時, 所有埠、設定與行為與導入前相同: 基準埠 後端 11006／前端 8090, 臨時設定與 settings.json 逐鍵相同(不多一個鍵).
//  2. 設 E2E_PORT_OFFSET=N 時, 後端／前端實際埠＝基準埠＋N; 臨時設定一律帶實際後端埠(srv.mjs 之 serverPort 只能由 settings 決定); vue.config.js 之 proxy 指向實際後端埠.
//  3. 位移量格式錯誤即拋錯, 不靜默沿用基準埠(沿用即會連到他實例之服務).
//  4. e2e 測試檔不寫死基準埠(11006／8090); 基準埠字面只在 e2e-setup.mjs 兩個常數、run-e2e-isolated.mjs 之 resolveE2ePort(11006).
//  5. test/ 下每個 child_process 呼叫(spawn／spawnSync／execSync／execFileSync…)皆帶 windowsHide: true(本機有人使用, 不彈出視窗).
//  6. e2eShard.json 與基準埠一致、分組計畫涵蓋全部 e2e 檔各一次.
//檢查臨時設定時只比對鍵名與 serverPort, 失敗訊息不印設定值.
//跑法: npx mocha test/unit-e2ePortShift.test.mjs --timeout 120000
import fs from 'fs'
import path from 'path'
import assert from 'assert'
import JSON5 from 'json5'
import { spawnSync } from 'child_process'
import { fileURLToPath, pathToFileURL } from 'url'
import { sourceLines, takeParen } from './tools/srcScan.mjs'

const A = assert.strict
const fdTest = path.dirname(fileURLToPath(import.meta.url))
const projRoot = path.join(fdTest, '..')
const SETUP_URL = pathToFileURL(path.join(fdTest, 'tools', 'e2e-setup.mjs')).href

//於子行程匯入 e2e-setup(模組頂層即解析位移量), 回報埠與臨時設定之差異鍵名(不含值)
const CHILD_CODE = `
import fs from 'fs'
import JSON5 from 'json5'
const m = await import(${JSON.stringify(SETUP_URL)})
const base = JSON5.parse(fs.readFileSync('./settings.json', 'utf8'))
const readGen = (o) => JSON.parse(fs.readFileSync(m.genTempSettings(o), 'utf8'))
const diff = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])).sort()
const g0 = readGen({})
const g1 = readGen({ language: 'cht' })
console.log('RESULT ' + JSON.stringify({ api: m.apiBaseUrl, base: m.baseUrl, app: m.appUrl, diff0: diff(g0, base), diff1: diff(g1, base), port0: g0.serverPort, port1: g1.serverPort, basePort: base.serverPort, lang1: g1.language }))
m.cleanup()
`

let runSetup = (offset) => {
    let env = { ...process.env }
    delete env.E2E_PORT_OFFSET
    delete env.E2E_REGEN
    delete env.E2E_BARE
    delete env.E2E_DIAG
    if (offset !== undefined) {
        env.E2E_PORT_OFFSET = offset
    }
    let r = spawnSync(process.execPath, ['--input-type=module', '-e', CHILD_CODE], { cwd: projRoot, env, encoding: 'utf8', timeout: 90000, windowsHide: true })
    let m = /RESULT (.*)/.exec(r.stdout || '')
    return { status: r.status, out: m ? JSON.parse(m[1]) : null, err: (r.stderr || '').slice(-1200) }
}

let runVueProxy = (offset) => {
    let env = { ...process.env }
    delete env.E2E_PORT_OFFSET
    if (offset !== undefined) {
        env.E2E_PORT_OFFSET = offset
    }
    let code = `import { createRequire } from 'module'; const require = createRequire(import.meta.url); const c = require(${JSON.stringify(path.join(projRoot, 'vue.config.js'))}); console.log('RESULT ' + c.devServer.proxy['/api'].target)`
    let r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: projRoot, env, encoding: 'utf8', timeout: 30000, windowsHide: true })
    let m = /RESULT (.*)/.exec(r.stdout || '')
    return { status: r.status, target: m ? m[1].trim() : null, err: (r.stderr || '').slice(-600) }
}

let e2eFiles = () => fs.readdirSync(fdTest).filter((f) => /^e2e-.*\.test\.mjs$/.test(f)).sort()
let codeOf = (fp) => sourceLines(fp, 'code').map((l) => l.text).join('\n')


describe('unit-e2ePortShift (e2e 多開之埠位移接線, R-E2E-SHARD-01)', function() {
    this.timeout(120000)

    describe('契約 1: 未設位移時與導入前相同', function() {
        for (let [label, offset] of [['未設', undefined], ["空字串", ''], ["'0'", '0']]) {
            it(`PS-001 E2E_PORT_OFFSET ${label}: 基準埠 11006／8090, 臨時設定逐鍵同 settings.json(僅 overrides 之鍵不同)`, function() {
                let { status, out, err } = runSetup(offset)
                A.equal(status, 0, `子行程失敗: ${err}`)
                A.equal(out.api, 'http://127.0.0.1:11006', 'apiBaseUrl 為基準後端埠')
                A.equal(out.base, 'http://127.0.0.1:8090', 'baseUrl 為基準前端埠')
                A.equal(out.app, 'http://127.0.0.1:8090/?token=sys', 'appUrl 同導入前')
                A.deepEqual(out.diff0, [], 'genTempSettings({}) 與 settings.json 不得有任何鍵不同(未位移時不加 serverPort 覆寫)')
                A.ok(out.diff1.every((k) => k === 'language'), `genTempSettings({ language }) 只允許 language 不同, 實得鍵 ${JSON.stringify(out.diff1)}`)
                A.equal(out.lang1, 'cht')
                A.equal(out.port0, out.basePort, 'serverPort 同 settings.json')
                A.equal(out.port0, 11006, 'settings.json 之 serverPort 為基準後端埠(基準埠常數與設定一致)')
            })
        }
    })

    describe('契約 2: 設位移時實際埠＝基準埠＋位移', function() {
        for (let off of [100, 400]) {
            it(`PS-002 E2E_PORT_OFFSET=${off}: 後端 ${11006 + off}／前端 ${8090 + off}, 臨時設定帶實際後端埠`, function() {
                let { status, out, err } = runSetup(String(off))
                A.equal(status, 0, `子行程失敗: ${err}`)
                A.equal(out.api, `http://127.0.0.1:${11006 + off}`)
                A.equal(out.base, `http://127.0.0.1:${8090 + off}`)
                A.equal(out.app, `http://127.0.0.1:${8090 + off}/?token=sys`)
                A.deepEqual(out.diff0, ['serverPort'], '位移時 genTempSettings({}) 只多 serverPort 一鍵')
                A.ok(out.diff1.includes('serverPort') && out.diff1.every((k) => k === 'serverPort' || k === 'language'), `鍵差異只允許 serverPort／language, 實得 ${JSON.stringify(out.diff1)}`)
                A.equal(out.port0, 11006 + off)
                A.equal(out.port1, 11006 + off, '帶 overrides 之臨時設定同樣帶實際埠')
            })
        }

        it('PS-003 vue.config.js 之 proxy 目標: 未設／0 為 11006, 位移 100 為 11106', function() {
            for (let [label, offset, exp] of [['未設', undefined, 'http://localhost:11006'], ["''", '', 'http://localhost:11006'], ["'0'", '0', 'http://localhost:11006'], ['100', '100', 'http://localhost:11106'], ['400', '400', 'http://localhost:11406']]) {
                let { status, target, err } = runVueProxy(offset)
                A.equal(status, 0, `${label}: 子行程失敗 ${err}`)
                A.equal(target, exp, `${label}: proxy 目標`)
            }
        })
    })

    describe('契約 3: 位移量格式錯誤即拋錯, 不靜默沿用基準埠', function() {
        for (let bad of ['abc', '-100', '1.5', '70000']) {
            it(`PS-004 E2E_PORT_OFFSET='${bad}': 匯入 e2e-setup 即失敗並指出環境變數名`, function() {
                let { status, out, err } = runSetup(bad)
                A.notEqual(status, 0, '須以非 0 結束')
                A.equal(out, null, '不得印出結果(不得沿用基準埠)')
                A.ok(/E2E_PORT_OFFSET|超過 65535/.test(err), `錯誤訊息須指出位移量: ${err}`)
            })
        }
    })

    describe('契約 4: 基準埠字面只在固定站點', function() {
        it('PS-005 e2e-*.test.mjs 之可執行碼不含 11006／8090; test/tools 之字面只在 e2e-setup 兩個常數與 run-e2e-isolated 之 resolveE2ePort(11006)', function() {
            let hits = []
            for (let f of e2eFiles()) {
                for (let l of sourceLines(path.join(fdTest, f), 'code')) {
                    if (/\b(11006|8090)\b/.test(l.text)) {
                        hits.push(`${f}:${l.no}`)
                    }
                }
            }
            A.deepEqual(hits, [], `e2e 測試檔不得寫死基準埠(經 apiBaseUrl／baseUrl): ${hits.join(', ')}`)
            let toolHits = []
            for (let f of fs.readdirSync(path.join(fdTest, 'tools')).filter((x) => /\.mjs$/.test(x)).sort()) {
                for (let l of sourceLines(path.join(fdTest, 'tools', f), 'code')) {
                    if (/\b(11006|8090)\b/.test(l.text)) {
                        toolHits.push(`${f}: ${l.text.trim()}`)
                    }
                }
            }
            A.deepEqual(toolHits, [
                'e2e-setup.mjs: const BACKEND_PORT = 11006',
                'e2e-setup.mjs: const FRONTEND_PORT = 8090',
                'run-e2e-isolated.mjs: const BACKEND_PORT = resolveE2ePort(11006)',
            ], `test/tools 之基準埠字面: ${JSON.stringify(toolHits)}`)
        })

        it('PS-006 e2e-setup 之服務埠: services[].port 為基準常數(其內部套用位移)、前端以 spawn 收到之 port 啟動、後端經 argsOf', function() {
            let code = codeOf(path.join(fdTest, 'tools', 'e2e-setup.mjs'))
            A.ok(/port: BACKEND_PORT,/.test(code), '後端 services[].port 為基準常數')
            A.ok(/port: FRONTEND_PORT,/.test(code), '前端 services[].port 為基準常數')
            A.ok(/spawn: \(\{ port \}\) =>/.test(code), '前端 spawn 取收到之實際埠')
            A.ok(!/--port \$\{FRONTEND_PORT\}/.test(code) && !/String\(FRONTEND_PORT\)/.test(code), '前端啟動指令不得寫基準埠')
            A.ok(/spawnSrv\('node', \[SRV_PATH, \.\.\.argsOf\(args\)\]/.test(code), '後端啟動參數經 argsOf')
        })
    })

    describe('契約 5: child_process 呼叫皆帶 windowsHide: true', function() {
        it('PS-007 test/ 與 test/tools 下 import child_process 之檔, 每個 spawn／spawnSync／execSync／execFileSync／exec／execFile／fork 呼叫都含 windowsHide: true', function() {
            let bad = []
            let n = 0
            let dirs = [fdTest, path.join(fdTest, 'tools')]
            for (let d of dirs) {
                for (let f of fs.readdirSync(d).filter((x) => /\.mjs$/.test(x)).sort()) {
                    let fp = path.join(d, f)
                    let code = codeOf(fp)
                    let im = /import\s*\{([^}]*)\}\s*from\s*['"](?:node:)?child_process['"]/.exec(code)
                    if (!im) {
                        continue
                    }
                    let names = im[1].split(',').map((s) => s.trim().split(/\s+as\s+/).pop()).filter((s) => s)
                    let re = new RegExp(`(?<![.\\w$])(${names.join('|')})\\(`, 'g')
                    let m
                    while ((m = re.exec(code)) !== null) {
                        let inner = takeParen(code, m.index + m[0].length)
                        n++
                        if (inner === null || !/windowsHide:\s*true/.test(inner)) {
                            bad.push(`${path.relative(projRoot, fp)}: ${m[1]}(…) 近 ${code.slice(0, m.index).split('\n').length} 行`)
                        }
                    }
                }
            }
            A.ok(n >= 30, `應掃到 child_process 呼叫(本機 2026-11-04 為 38 處、16 檔), 實得 ${n}`)
            A.deepEqual(bad, [], `下列呼叫缺 windowsHide: true:\n${bad.join('\n')}`)
        })
    })

    describe('契約 6: 分組設定與計畫', function() {
        let cfg = null
        before(function() {
            cfg = JSON.parse(fs.readFileSync(path.join(fdTest, 'tools', 'e2eShard.json'), 'utf8'))
        })

        it('PS-008 e2eShard.json: 鍵屬套件白名單, ports 為 [基準後端埠, 基準前端埠], 檔名鍵都存在', function() {
            let allowed = ['ports', 'instances', 'officialOnly', 'together', 'durations', 'exclude', 'portStep']
            A.deepEqual(Object.keys(cfg).filter((k) => !allowed.includes(k)), [], '不得有套件不認得之鍵(套件遇未知鍵即拋錯)')
            A.deepEqual(cfg.ports, [11006, 8090], 'ports 須含兩個基準埠(預檢用)')
            A.ok(Number.isInteger(cfg.instances) && cfg.instances >= 1, 'instances 為正整數')
            let files = new Set(e2eFiles())
            let named = [...(cfg.officialOnly || []), ...(cfg.together || []).flat(), ...Object.keys(cfg.durations || {})]
            A.deepEqual(named.filter((f) => !files.has(f)), [], 'officialOnly／together／durations 之檔名都須是現存 e2e 檔')
            for (let [f, v] of Object.entries(cfg.durations || {})) {
                A.ok(typeof v === 'number' && v > 0, `durations[${f}] 須為正數(分)`)
            }
        })

        it('PS-009 shardE2e --plan: 退出碼 0, 每個 e2e 檔恰被分到一組', function() {
            let r = spawnSync(process.execPath, [path.join(projRoot, 'node_modules', 'w-package-tools-e2e', 'tools', 'shardE2e.mjs'), '--plan'], { cwd: projRoot, encoding: 'utf8', timeout: 60000, windowsHide: true })
            A.equal(r.status, 0, `--plan 失敗: ${(r.stdout || '').slice(-800)}${(r.stderr || '').slice(-400)}`)
            let planned = []
            for (let line of (r.stdout || '').split(/\r?\n/)) {
                let m = /第 \d+ 組 位移 \d+ 埠 \[[^\]]*\] 預估 [\d.]+ 分: (.*)$/.exec(line)
                if (m) {
                    planned.push(...m[1].split(',').map((s) => s.trim()).filter((s) => s))
                }
            }
            A.deepEqual(planned.slice().sort(), e2eFiles(), '分組計畫須涵蓋全部 e2e 檔各一次(無遺漏、無重複)')
        })
    })
})
