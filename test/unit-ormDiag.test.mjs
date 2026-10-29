//w-serv-orm 診斷輸出(opt.funLog)導入本套件 srLog 之接線測試與站點不變式(mig-perm of 20261029002013, 排程第 161 項; 規則帳本 R-ORM-DIAG-01、跨套件規格〈診斷輸出與遮罩〉R-DIAG-01)。
//規格: dspec/診斷輸出與遮罩.md D1(單一實作: 轉接器一律用 wsemi 之 genDiagFunLog, 本套件不自寫)、D2(預設只輸出安全摘要)、D3(對外錯誤值不含憑證)、§3 Q1(伺服端只寫 safe)、§4(perm 事件名 WServOrm-diag → orm-diag);
//  設計 diag-run01-設計.md §6.8、§6.10。
//本檔為「接線測試」: 形態類案(label 控制字元、safe 白名單／bigint／循環／上限、write 拋錯／rejected promise 之吞下、detail 不讀)由 wsemi 之共用語料驅動(_diagCases.mjs group A),
//  經本套件實際呼叫點(server/WWebPerm.mjs 之 WServOrm 建構行所寫之 funLog 運算式原文)重跑, 本檔不再自寫形態測試(原 ORMDIAG-001～006 與語料重複, 已刪)。
//ORMDIAG-0*: 共用語料 group A 經本套件接線路徑; 其中適用/不適用逐案登錄於 CORPUS_A。
//ORMDIAG-1*: 真 WServOrm(w-serv-orm 1.1.22)＋替身資料表, 觸發各形狀之 ORM 失敗, 斷言 srLog 只有 label＋safe(event orm-diag)、全文不含主鍵／email／錯誤原文／連線憑證、console 無輸出、
//  reject 值為固定詞彙原樣(外來值之引擎錯誤不經本套件轉出)。
//ORMDIAG-3*: WOrm 建構拋出含連線憑證之錯誤(子行程 test/tools/ormDiagInitChild.mjs): 拋出之 Error、console、srLog 之 WServOrm-init-error 皆不含憑證。
//SITE-DIAG-*: 靜態站點不變式: WWebPerm 之 WServOrm 建構帶 genDiagFunLog 產生之 funLog、本專案全部 WServOrm( 站點之分類、server 不用 logDetail、不自寫轉接器、engines。
//端到端(真 WWebPerm＋真 srLog 檔＋真 HTTP)見 api-ormDiag.test.mjs。
//跑法: npx mocha test/unit-ormDiag.test.mjs --timeout 60000
import fs from 'fs'
import path from 'path'
import assert from 'assert'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import WServOrm from 'w-serv-orm/src/WServOrm.mjs'
import genDiagFunLog from 'wsemi/src/genDiagFunLog.mjs'
import getDiag from 'wsemi/src/getDiag.mjs'
import diagCases from 'wsemi/src/_diagCases.mjs'
import ds from '../src/schema/index.mjs'
import { mkTable, mkSrLog } from './tools/unitOrm.mjs'
import { sourceLines, blankStrings } from './tools/srcScan.mjs'

const A = assert.strict
const projRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const fpWWebPerm = path.join(projRoot, 'server', 'WWebPerm.mjs')
const fpOrmDiag = path.join(projRoot, 'server', 'ormDiag.mjs')
const fdTmp = path.join(projRoot, 'test', '_tmp', 'unit-ormDiag')

const SECRET_ID = 'PII-ID-5c2e08'
const SECRET_MAIL = 'pii.user.5c2e08@example.com'
const SECRET_TEXT = 'ENGINE-FAILED-TEXT-5c2e08'
const SEC = diagCases.secrets() //共用語料之測試秘密組(url 內含帳密與查詢秘密值), 與 wsemi 自身測試同一組
const CRED_TEXT = `url=${SEC.url} password=${SEC.password}`
const SECRETS = [SECRET_ID, SECRET_MAIL, SECRET_TEXT, 'simulated save failure', 'simulated del failure', SEC.password, 'Ssl8kLm3', `${SEC.username}:${SEC.password}`]

let sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))


//getSiteExpr: 自 WWebPerm.mjs 之 WServOrm 建構行取出 funLog 運算式原文(本套件實際呼叫點); 找不到回 null
function getSiteExpr() {
    let ls = sourceLines(fpWWebPerm, 'code').filter((l) => /\bWServOrm\(ds, WOrm, url, db, \{ funLog: .+ \}\)/.test(l.text))
    if (ls.length !== 1) {
        return null
    }
    return ls[0].text.match(/\{ funLog: (.+) \}\)/)[1].trim()
}

//mkSiteFunLog: 以呼叫點之運算式原文建 funLog(srLog 為替身); 呼叫點若被改成別的寫法(例: 自寫轉接器、漏 .funLog)則此處跟著變, 使下列各測試反映真實接線
function mkSiteFunLog(srLog) {
    let expr = getSiteExpr()
    A.ok(expr !== null, '找不到 WWebPerm.mjs 之 WServOrm 建構行(須恰一處且寫成 { funLog: <運算式> })')
    // eslint-disable-next-line no-new-func
    return new Function('genDiagFunLog', 'srLog', `return ${expr}`)(genDiagFunLog, srLog)
}

//withConsoleSpy: 執行 fn 期間攔下 console.log／info／warn／error／debug(不呼叫原函數), 回傳 { calls }
async function withConsoleSpy(fn) {
    let names = ['log', 'info', 'warn', 'error', 'debug']
    let orig = {}
    let calls = []
    for (let n of names) {
        orig[n] = console[n]
        console[n] = (...args) => {
            calls.push({ n, args })
        }
    }
    try {
        await fn()
    }
    finally {
        for (let n of names) {
            console[n] = orig[n]
        }
    }
    return { calls }
}


//CORPUS_A: 共用語料 group A(genDiagFunLog 轉接器)逐案之適用性。適用者經 mkSiteFunLog 之本套件接線路徑重跑; 不適用者寫明理由。語料新增 A 案時此表須補, 否則 ORMDIAG-000 失敗
const CORPUS_A = {
    A01: { wire: true },
    A02: { wire: true },
    A03: { wire: true },
    A04: { wire: true },
    A05: { wire: false, why: '本套件只取 funLog、不保留 close()(轉接器隨行程存續), 呼叫點沒有 close 可驗' },
    A06: { wire: true },
    A07: { wire: false, why: '案例自訂 event 名(x-diag), 本套件固定用預設 orm-diag; 其 getDiag 不呼叫 getDetail 之部分由 ORMDIAG-120 以真 WServOrm(funLog 恆兩引數)驗' },
    A08: { wire: false, why: 'write 恆為本套件固定之箭頭函數 (o) => srLog.warn(o), 不會觸發建構期 TypeError; 非函數之建構拋錯由 wsemi 自身測試(A08)負責' },
    A09: { wire: true },
    A10: { wire: true },
}


describe('unit-ormDiag-corpus (wsemi 共用語料 group A 經本套件接線路徑)', function() {
    this.timeout(60000)

    let unhandled = 0
    let onUnhandled = () => {
        unhandled++
    }

    before(function() {
        process.on('unhandledRejection', onUnhandled)
    })

    after(function() {
        process.off('unhandledRejection', onUnhandled)
    })

    //R-DIAG-01 D5: 語料新增 A 案時須決定本套件適用與否(登錄於 CORPUS_A), 不讓新形態悄悄不被覆蓋
    it('ORMDIAG-000 語料 group A 之案例全集與 CORPUS_A 登錄一致(無漏登、無多登)', function() {
        let ids = diagCases.cases.filter((c) => c.group === 'A').map((c) => c.id).sort()
        A.deepEqual(ids, Object.keys(CORPUS_A).sort())
    })

    for (let [id, reg] of Object.entries(CORPUS_A)) {
        if (!reg.wire) {
            it(`ORMDIAG-0${id.slice(1)} ${id} 不適用: ${reg.why}`, function() {
                A.ok(typeof reg.why === 'string' && reg.why.length > 0)
            })
            continue
        }
        let c = diagCases.cases.find((x) => x.id === id)
        it(`ORMDIAG-0${id.slice(1)} ${id} ${c.label}(本套件呼叫點之 funLog 運算式)`, async function() {
            let ctx = diagCases.mkCtx({ util: true, unhandled: () => unhandled, tick: () => sleep(100) })
            c.make(ctx)
            //api.genDiagFunLog: 本套件之接線 = (o) => srLog.warn(o); 此處令替身 srLog.warn 即案例給的 write, 回傳其 funLog
            //api.getDiag: 案例 A10 另以 getDiag 直接取 safe 正規化之對照值(wsemi 原函數, 非本套件接線)
            let api = { genDiagFunLog: (write) => ({ funLog: mkSiteFunLog({ warn: write }) }), getDiag }
            let out = await c.call(api, ctx)
            A.equal(diagCases.verify(c, out, ctx), null)
        })
    }

})


describe('unit-ormDiag-orm (真 WServOrm 1.1.22＋替身資料表: ORM 失敗之診斷輸出進 srLog, 不含個資與憑證, console 無輸出)', function() {
    this.timeout(60000)

    //mkOrm: 四張替身資料表(users 可注入故障)＋真 WServOrm; useFunLog=false 為對照(不帶 funLog, 預設 console); calls 記錄 funLog 每次被呼叫之引數個數
    let mkOrm = (failUsers = {}, useFunLog = true) => {
        let woItems = {}
        for (let k of Object.keys(ds)) {
            woItems[k] = mkTable([], k === 'users' ? failUsers : {})
        }
        function WOrmReplica(opt) {
            return woItems[opt.cl]
        }
        let { srLog, logs } = mkSrLog()
        let calls = []
        let funLog = null
        if (useFunLog) {
            let f = mkSiteFunLog(srLog)
            funLog = (...args) => {
                calls.push(args.length)
                return f(...args)
            }
            Object.defineProperty(funLog, 'noDetail', { value: f.noDetail, enumerable: true }) //保留轉接器之 noDetail 標記, 否則 w-serv-orm 會交出細節
        }
        let so = useFunLog ? WServOrm(ds, WOrmReplica, 'replica', 'replica', { funLog }) : WServOrm(ds, WOrmReplica, 'replica', 'replica')
        return { so, woItems, logs, calls }
    }

    //expectDiag: 觸發 → 斷言 reject、srLog 恰為預期之 label＋safe(event orm-diag)、全文不含任何祕密、console 零呼叫、funLog 恆兩引數
    let expectDiag = async ({ fail, setup, run, label, safe }) => {
        let { so, woItems, logs, calls } = mkOrm(fail)
        if (setup) {
            setup(woItems)
        }
        let err = null
        let { calls: cc } = await withConsoleSpy(async () => {
            await run(so.procOrm).catch((e) => {
                err = e
            })
        })
        A.ok(err !== null, '呼叫應 reject(ORM 失敗仍如實回報給呼叫端, 契約不變)')
        A.deepEqual(logs, [{ level: 'warn', event: 'orm-diag', label, safe }], `srLog 應恰為 label＋safe, 實得 ${JSON.stringify(logs)}`)
        let all = JSON.stringify(logs)
        for (let s of SECRETS) {
            A.ok(!all.includes(s), `srLog 不得含 ${s}`)
        }
        A.deepEqual(cc, [], `console 不得有輸出, 實得 ${JSON.stringify(cc).slice(0, 300)}`)
        A.deepEqual(calls, [2], 'funLog 應恰被呼叫一次且只有 (label, safe) 兩引數(noDetail: 不取細節)')
        return err
    }

    let rowSecret = { id: SECRET_ID, name: 'pii name', email: SECRET_MAIL }
    let engineText = `${SECRET_TEXT} id[${SECRET_ID}] mail=${SECRET_MAIL} ${CRED_TEXT}`

    //對照: 不帶 funLog 時診斷輸出走 console(預設安全摘要)——證明 console 攔截有效, 且 funLog 確實取代了 console
    it('ORMDIAG-100 對照: 不帶 funLog → 診斷輸出由 console 輸出(攔截有效), srLog 無記錄', async function() {
        let { so, logs } = mkOrm({ saveIds: [SECRET_ID] }, false)
        let { calls } = await withConsoleSpy(async () => {
            await so.procOrm('u', 'users', 'save', [rowSecret]).catch(() => {})
        })
        A.ok(calls.some((c) => c.n === 'log' && c.args[0] === 'users.save fail'), `預設應由 console.log 輸出 users.save fail, 實得 ${JSON.stringify(calls).slice(0, 300)}`)
        A.deepEqual(logs, [])
    })

    //寫入失敗(逐筆 ok:0): 摘要為失敗筆數與位置, 不含主鍵
    it('ORMDIAG-101 save 逐筆失敗 → label users.save fail、safe { n, ks }, 不含主鍵／email／ORM 原文', async function() {
        let err = await expectDiag({
            fail: { saveIds: [SECRET_ID] },
            run: (procOrm) => procOrm('u', 'users', 'save', [rowSecret, { id: 'ok-1', name: 'ok' }]),
            label: 'users.save fail',
            safe: { n: 1, ks: [0] },
        })
        A.ok(String(err).includes(SECRET_ID), '呼叫端收到之 reject 訊息仍列主鍵(w-serv-orm 契約, 本套件不改; 對外由 procCore／routeResult 轉語系鍵)')
    })

    //寫入失敗(整批性, ORM 引擎錯誤): 摘要為錯誤類別與機器代碼, 不含訊息文字; 外來值(引擎錯誤, 訊息夾帶主鍵、email 與連線憑證)不轉出, reject 為固定詞彙原樣
    it('ORMDIAG-102 insert 引擎 Error(含 code ENOSPC, 訊息夾帶主鍵、email、連線憑證) → label users.insert catch、safe { errType, errCode }; reject 為固定詞彙原樣', async function() {
        let err = await expectDiag({
            fail: { insert: Object.assign(new Error(engineText), { code: 'ENOSPC' }) },
            run: (procOrm) => procOrm('u', 'users', 'insert', [rowSecret]),
            label: 'users.insert catch',
            safe: { errType: 'Error', errCode: 'ENOSPC' },
        })
        A.equal(err, 'failed to insert data', 'procOrm 之 reject 為固定詞彙(固定字串不經遮罩、原樣), 不轉出引擎錯誤')
    })

    it('ORMDIAG-103 insert 引擎以字串 reject(夾帶主鍵與連線憑證) → safe { errType: string }; reject 為固定詞彙原樣', async function() {
        let err = await expectDiag({
            fail: { insert: engineText },
            run: (procOrm) => procOrm('u', 'users', 'insert', [rowSecret]),
            label: 'users.insert catch',
            safe: { errType: 'string' },
        })
        A.equal(err, 'failed to insert data')
    })

    it('ORMDIAG-104 del 逐筆失敗 → label users.del fail、safe { n, ks }', async function() {
        await expectDiag({
            fail: { delIds: [SECRET_ID] },
            run: (procOrm) => procOrm('u', 'users', 'del', [{ id: SECRET_ID }]),
            label: 'users.del fail',
            safe: { n: 1, ks: [0] },
        })
    })

    //寫入前被拒(主鍵含 HTML 標記): 摘要只有位置
    it('ORMDIAG-105 主鍵含 HTML 標記被拒 → label users.save id changed by clearXSS、safe { n, ks }(不含主鍵)', async function() {
        await expectDiag({
            fail: {},
            run: (procOrm) => procOrm('u', 'users', 'save', [{ id: `<script>x</script>${SECRET_ID}`, name: 'x', email: SECRET_MAIL }]),
            label: 'users.save id changed by clearXSS',
            safe: { n: 1, ks: [0] },
        })
    })

    //讀取失敗(ORM 引擎錯誤)
    it('ORMDIAG-106 select 引擎 Error(訊息夾帶主鍵、email、連線憑證) → label users.select catch、safe { errType, errCode }; reject 為固定詞彙原樣', async function() {
        let err = await expectDiag({
            fail: {},
            setup: (woItems) => {
                woItems.users.select = async () => Promise.reject(Object.assign(new Error(engineText), { code: 'ENOSPC' }))
            },
            run: (procOrm) => procOrm('u', 'users', 'select', {}),
            label: 'users.select catch',
            safe: { errType: 'Error', errCode: 'ENOSPC' },
        })
        A.equal(err, 'failed to select data')
    })

    //被拒之查詢條件(find 為字串, 其值夾帶 email): 摘要只有固定拒收句, 條件值只在 detail(本套件不取)
    it('ORMDIAG-107 select 條件非物件(夾帶 email) → label users.select invalid find、safe { reason: 固定句 }, 不含條件值', async function() {
        let { so, logs, calls } = mkOrm({})
        let err = null
        let { calls: cc } = await withConsoleSpy(async () => {
            await so.procOrm('u', 'users', 'select', SECRET_MAIL).catch((e) => {
                err = e
            })
        })
        A.ok(err !== null)
        A.equal(logs.length, 1)
        A.equal(logs[0].event, 'orm-diag')
        A.equal(logs[0].label, 'users.select invalid find')
        A.deepEqual(Object.keys(logs[0].safe), ['reason'])
        A.ok(typeof logs[0].safe.reason === 'string' && logs[0].safe.reason !== '')
        A.ok(!JSON.stringify(logs).includes(SECRET_MAIL), 'srLog 不得含條件值')
        A.deepEqual(cc, [])
        A.deepEqual(calls, [2])
    })

    //R-DIAG-01 §6.7 第 5 條(A07 同義): funLog 帶 noDetail, w-serv-orm 之 getDiag 見之不取細節——funLog 在任何失敗形狀下都只收到 (label, safe) 兩引數
    it('ORMDIAG-120 funLog 帶 noDetail 標記且各失敗形狀皆恆以兩引數呼叫(不取細節、不做拷貝)', async function() {
        let { srLog } = mkSrLog()
        let f = mkSiteFunLog(srLog)
        A.equal(f.noDetail, true, '轉接器產生之 funLog 須帶 noDetail === true')
        for (let [fail, run] of [
            [{ saveIds: [SECRET_ID] }, (p) => p('u', 'users', 'save', [rowSecret])],
            [{ insert: Object.assign(new Error(engineText), { code: 'ENOSPC' }) }, (p) => p('u', 'users', 'insert', [rowSecret])],
            [{ delIds: [SECRET_ID] }, (p) => p('u', 'users', 'del', [{ id: SECRET_ID }])],
            [{}, (p) => p('u', 'users', 'select', SECRET_MAIL)],
        ]) {
            let { so, calls } = mkOrm(fail)
            await run(so.procOrm).catch(() => {})
            A.ok(calls.length >= 1 && calls.every((n) => n === 2), `funLog 引數個數應恆為 2, 實得 ${JSON.stringify(calls)}`)
        }
    })

})


describe('unit-ormDiag-init (WOrm 建構拋出含連線憑證之錯誤: 拋出之 Error、console、srLog 皆不含憑證)', function() {
    this.timeout(120000)

    let r = null
    let logText = ''

    before(async function() {
        fs.rmSync(fdTmp, { recursive: true, force: true })
        let fdLog = path.join(fdTmp, 'logs')
        fs.mkdirSync(fdLog, { recursive: true })
        let params = JSON.stringify({ url: SEC.url, password: SEC.password, logFd: fdLog, port: 8562 })
        let child = spawn(process.execPath, [path.join(projRoot, 'test', 'tools', 'ormDiagInitChild.mjs'), params], { cwd: projRoot, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
        let out = ''
        child.stdout.on('data', (d) => {
            out += String(d)
        })
        child.stderr.on('data', (d) => {
            out += String(d)
        })
        let code = await new Promise((resolve) => child.on('exit', resolve))
        let m = out.match(/RESULT (.*)/)
        A.ok(m, `子行程未輸出 RESULT(exit=${code}); 輸出尾段: ${out.slice(-800)}`)
        r = JSON.parse(m[1])
        for (let fn of fs.readdirSync(fdLog)) {
            logText += fs.readFileSync(path.join(fdLog, fn), 'utf8')
        }
    })

    after(async function() {
        for (let i = 0; i < 20; i++) {
            try {
                fs.rmSync(fdTmp, { recursive: true, force: true })
                break
            }
            catch (e) {
                await sleep(300)
            }
        }
        let fdParent = path.join(projRoot, 'test', '_tmp')
        if (fs.existsSync(fdParent) && fs.readdirSync(fdParent).length === 0) {
            fs.rmdirSync(fdParent)
        }
    })

    //R-DIAG-01 D3: 外來值(WOrm 建構拋出之 Error, 回顯連線字串與密碼)於 w-serv-orm 之 catch 站點遮憑證後轉出; 非憑證之原文(connect failed)保留, 不整句抹成 ***
    it('ORMDIAG-301 WWebPerm 建構即拋(fail-fast), 拋出之 Error 的 message／stack 不含密碼與帳密串, 仍保留非憑證之原文與 Error 類別', function() {
        A.equal(r.threw, true, 'WOrm 建構失敗須使 WWebPerm 建構即拋')
        A.equal(r.name, 'Error')
        A.ok(r.msg.includes('connect failed'), `非憑證之原文應保留, 實得 ${r.msg}`)
        for (let s of [SEC.password, 'Ssl8kLm3', `${SEC.username}:${SEC.password}`]) {
            A.ok(!r.msg.includes(s), `message 不得含 ${s}`)
            A.ok(!r.stack.includes(s), `stack 不得含 ${s}`)
        }
    })

    it('ORMDIAG-302 console 輸出(console.log(err))不含密碼與帳密串', function() {
        A.ok(r.consoleLines.length >= 1, 'WWebPerm 於 ORM 初始化失敗時會 console.log(err)')
        let all = r.consoleLines.join('\n')
        for (let s of [SEC.password, 'Ssl8kLm3', `${SEC.username}:${SEC.password}`]) {
            A.ok(!all.includes(s), `console 不得含 ${s}`)
        }
    })

    it('ORMDIAG-303 srLog 之 WServOrm-init-error 有記錄且全文不含密碼與帳密串', function() {
        let objs = logText.split(/\r?\n/).map((ln) => {
            try {
                return JSON.parse(ln)
            }
            catch (e) {
                return null
            }
        }).filter((o) => o !== null)
        let o = objs.find((x) => x.event === 'WServOrm-init-error')
        A.ok(o, `srLog 應有 WServOrm-init-error, 實得事件 ${JSON.stringify(objs.map((x) => x.event))}`)
        A.ok(String(o.msg).includes('connect failed'), `msg 應保留非憑證之原文, 實得 ${o.msg}`)
        for (let s of [SEC.password, 'Ssl8kLm3', `${SEC.username}:${SEC.password}`]) {
            A.ok(!logText.includes(s), `srLog 全文不得含 ${s}`)
        }
    })

})


describe('unit-ormDiag-sites (WServOrm 站點之靜態不變式)', function() {
    this.timeout(60000)

    //walk: server 下全部 .mjs
    let walk = (fd) => {
        let out = []
        for (let e of fs.readdirSync(fd, { withFileTypes: true })) {
            let fp = path.join(fd, e.name)
            if (e.isDirectory()) {
                out.push(...walk(fp))
            }
            else if (e.name.endsWith('.mjs')) {
                out.push(fp)
            }
        }
        return out
    }
    let rel = (fp) => path.relative(projRoot, fp).split(path.sep).join('/')
    //本專案可執行碼範圍: server/ 全部、專案根之 g_*.mjs 與 srv.mjs(src/ 為前端, test/ 為測試, 不計)
    let scope = () => [...walk(path.join(projRoot, 'server')), ...fs.readdirSync(projRoot).filter((n) => /^g_.*\.mjs$/.test(n) || n === 'srv.mjs').map((n) => path.join(projRoot, n))]

    //R-ORM-DIAG-01: 生產站點(伺服器)建構 WServOrm 時帶 funLog: genDiagFunLog((o) => srLog.warn(o)).funLog, 且在 srLog 建立之後
    it('SITE-DIAG-001 server/WWebPerm.mjs 之 WServOrm 建構帶 { funLog: genDiagFunLog((o) => srLog.warn(o)).funLog }, 於 srLogInit 之後; 自 wsemi 匯入', function() {
        let ls = sourceLines(fpWWebPerm, 'code')
        let iSr = ls.find((l) => /let srLog = srLogInit\(opt\)/.test(l.text))
        let iOrm = ls.filter((l) => /\bWServOrm\(/.test(blankStrings(l.text)) && !/^import\b/.test(l.text.trim()))
        A.ok(iSr, '找不到 let srLog = srLogInit(opt)')
        A.equal(iOrm.length, 1, `server/WWebPerm.mjs 內 WServOrm( 呼叫須恰一處, 實得 ${JSON.stringify(iOrm.map((l) => l.no))}`)
        A.ok(/\bWServOrm\(ds, WOrm, url, db, \{ funLog: genDiagFunLog\(\(o\) => srLog\.warn\(o\)\)\.funLog \}\)/.test(iOrm[0].text), `WServOrm 須帶 { funLog: genDiagFunLog((o) => srLog.warn(o)).funLog }, 實得 :${iOrm[0].no} ${iOrm[0].text.trim()}`)
        A.ok(iSr.no < iOrm[0].no, `srLogInit(:${iSr.no}) 須早於 WServOrm(:${iOrm[0].no})`)
        A.ok(ls.some((l) => /^import genDiagFunLog from 'wsemi\/src\/genDiagFunLog\.mjs'$/.test(l.text.trim())), '須有 import genDiagFunLog from \'wsemi/src/genDiagFunLog.mjs\'')
    })

    //R-ORM-DIAG-01: 站點全集——WServOrm( 之建構站點必須逐一分類: 伺服器(帶 funLog)與離線維運工具(不寫 srLog, 診斷輸出留在操作者終端機之預設安全摘要)
    it('SITE-DIAG-002 WServOrm( 站點全集: 伺服器 1 處帶 funLog; 離線工具 g_*.mjs 4 處刻意不帶(無 srLog, 終端機輸出)', function() {
        let found = {}
        for (let fp of scope()) {
            let ls = sourceLines(fp, 'code').filter((l) => /\bWServOrm\(/.test(blankStrings(l.text)) && !/^import\b/.test(l.text.trim()))
            if (ls.length > 0) {
                found[rel(fp)] = ls.map((l) => ({ withFunLog: /\bfunLog\s*:/.test(l.text) }))
            }
        }
        A.deepEqual(found, {
            'g_authRefsClean.mjs': [{ withFunLog: false }],
            'g_fixFromType.mjs': [{ withFunLog: false }],
            'g_mOrm.mjs': [{ withFunLog: false }],
            'g_purgeFrom.mjs': [{ withFunLog: false }],
            'server/WWebPerm.mjs': [{ withFunLog: true }],
        }, '新增 WServOrm( 站點須先分類(伺服器帶 funLog; 離線工具不寫 srLog)並更新本表與規則帳本 R-ORM-DIAG-01')
    })

    //R-ORM-DIAG-01: 伺服端不得以 logDetail 還原完整細節到 console(funLog 優先於 logDetail, 但給了即表示日誌可能含主鍵／錯誤原文)
    it('SITE-DIAG-003 本專案可執行碼(server／g_*／srv)不使用 logDetail', function() {
        let bad = []
        for (let fp of scope()) {
            for (let l of sourceLines(fp, 'code')) {
                if (/\blogDetail\b/.test(blankStrings(l.text))) {
                    bad.push(`${rel(fp)}:${l.no}`)
                }
            }
        }
        A.deepEqual(bad, [])
    })

    //R-DIAG-01 D1: 單一實作——本套件不自寫轉接器: server/ormDiag.mjs 已刪, 且 funLog 識別字在可執行碼內只出現於 WWebPerm.mjs 之那一行
    it('SITE-DIAG-004 不自寫診斷轉接器: server/ormDiag.mjs 不存在, funLog 識別字只出現於 WWebPerm.mjs 之 WServOrm 建構行(含離線工具 0 處)', function() {
        A.ok(!fs.existsSync(fpOrmDiag), 'server/ormDiag.mjs 須已刪除(改用 wsemi 之 genDiagFunLog)')
        let hits = []
        for (let fp of scope()) {
            for (let l of sourceLines(fp, 'code')) {
                if (/\bfunLog\b/.test(blankStrings(l.text))) {
                    hits.push(`${rel(fp)}:${l.no}`)
                }
            }
        }
        A.equal(hits.length, 1, `funLog 識別字應恰一處, 實得 ${JSON.stringify(hits)}`)
        A.ok(hits[0].startsWith('server/WWebPerm.mjs:'), `應在 server/WWebPerm.mjs, 實得 ${hits[0]}`)
    })

    //設計 §6.1: wsemi 於 Node < 20.16 取不到 util.types, Proxy 不可偵測 → engines 提高; 相依 wsemi ≥ 1.9.31(共用診斷模組)、w-serv-orm ≥ 1.1.22(funLog 引數形狀:safe 白名單鍵)
    it('SITE-DIAG-005 package.json: engines.node >=20.16、wsemi ^1.9.31 以上、w-serv-orm ^1.1.22 以上', function() {
        let pkg = JSON.parse(fs.readFileSync(path.join(projRoot, 'package.json'), 'utf8'))
        A.equal(pkg.engines.node, '>=20.16')
        let ver = (s) => s.replace(/^[\^~>=\s]+/, '').split('.').map(Number)
        let ge = (a, b) => {
            for (let i = 0; i < 3; i++) {
                if (a[i] !== b[i]) {
                    return a[i] > b[i]
                }
            }
            return true
        }
        A.ok(ge(ver(pkg.dependencies.wsemi), [1, 9, 31]), `wsemi 須 ≥1.9.31, 實得 ${pkg.dependencies.wsemi}`)
        A.ok(ge(ver(pkg.dependencies['w-serv-orm']), [1, 1, 22]), `w-serv-orm 須 ≥1.1.22, 實得 ${pkg.dependencies['w-serv-orm']}`)
    })

    //R-DIAG-01 D2: 參數檢查失敗之 console 只印型別不印值(無效之 url 可能是含帳密的設定物件)
    it('SITE-DIAG-006 WWebPerm 參數檢查失敗之 console 只印 typeof, 不印參數之值(6 處)', function() {
        let ls = sourceLines(fpWWebPerm, 'code').filter((l) => /console\.log\('invalid (WOrm|url|db|getUserByToken|verifyClientUser|verifyAppUser)'/.test(l.text))
        A.equal(ls.length, 6, `invalid-* 之 console 站點應為 6 處, 實得 ${ls.map((l) => l.no)}`)
        for (let l of ls) {
            A.ok(/console\.log\('invalid \w+', typeof \w+\)/.test(l.text), `:${l.no} 須為 console.log('invalid X', typeof X), 實得 ${l.text.trim()}`)
        }
    })

})
