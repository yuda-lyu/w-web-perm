//w-serv-orm 診斷輸出導入本套件 srLog(perm-run01 of 20261028054319, 第 154 項; w-serv-orm 1.1.20 opt.funLog; 規則帳本 R-ORM-DIAG-01)
//規格(任務背景): w-serv-orm 1.1.20 預設診斷輸出不含個資、選項 opt.funLog(label, safe, detail) 可取代 console; 本套件以 funLog 把 label 與 safe 寫入自己的 srLog,
//  detail(含主鍵與 ORM 錯誤原文)一律不寫(本套件日誌政策: 不記列 id／個資值, 見 R-ORM-DIAG-01 理由), console 不再輸出診斷.
//mig-perm(20261029002013, 排程第 161 項): funLog 改由 wsemi 之 genDiagFunLog 產生(跨套件規格〈診斷輸出與遮罩〉R-DIAG-01), 事件名 WServOrm-diag → orm-diag;
//  故障訊息另夾帶連線憑證(共用語料 secrets), 證明外來值之引擎錯誤不入 srLog(orm-diag 與 operOrm-error 之 raw 皆為固定詞彙)、不入標準輸出。
//真後端: 子行程 test/tools/ormDiagChild.mjs 以真 WWebPerm 起獨立後端(真 w-serv-orm／w-serv-webdata／srLog 落檔), ORM 縫於 targets.select 注入含主鍵與 email 之引擎錯誤;
//  測試經真 HTTP 資料通道(POST /api/main, w-converhp 協定, 同 api-setup callRpc)呼叫 targets.select, 檢查 srLog 檔與子行程標準輸出.
//  (自然觸發在真後端上已被前置驗證擋下, 只剩 ORM 引擎失敗, 故以 ORM 縫注入; 寫入失敗之各形狀見 unit-ormDiag 用真 WServOrm 逐項驗)
//跑法(需測試鎖): node C:/opensrcOper/tools/quiet-run.mjs --lock --name ormdiag -- npx mocha test/api-ormDiag.test.mjs --timeout 120000
import fs from 'fs'
import path from 'path'
import assert from 'assert'
import { spawn, execSync } from 'child_process'
import { fileURLToPath } from 'url'
import obj2u8arr from 'wsemi/src/obj2u8arr.mjs'
import u8arr2obj from 'wsemi/src/u8arr2obj.mjs'
import diagCases from 'wsemi/src/_diagCases.mjs'

const A = assert.strict
const projRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const fdTmp = path.join(projRoot, 'test', '_tmp', 'api-ormDiag')
const fdDb = path.join(fdTmp, 'db')
const fdLog = path.join(fdTmp, 'logs')
const PORT = 8561 //專屬本檔(≥8000, 不隨機); 與 11006／8090／e2e 各槽錯開
const SECRET_ID = 'PII-ID-7f3a91'
const SECRET_MAIL = 'pii.user.7f3a91@example.com'
const SECRET_TEXT = 'ENGINE-WRITE-FAILED'
const SEC = diagCases.secrets() //共用語料之測試秘密組(連線字串含帳密與查詢秘密值)
const CRED_TEXT = `url=${SEC.url} password=${SEC.password}`
const CREDS = [SEC.password, 'Ssl8kLm3', `${SEC.username}:${SEC.password}`]

let sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))


//readLogLines: logFd 下各檔之 JSON 行(srLog 經 pino transport 非同步落檔); 回 { objs, text }
function readLogLines() {
    let objs = []
    let text = ''
    if (fs.existsSync(fdLog)) {
        for (let fn of fs.readdirSync(fdLog)) {
            let fp = path.join(fdLog, fn)
            if (!fs.statSync(fp).isFile()) {
                continue
            }
            let t = fs.readFileSync(fp, 'utf8')
            text += t
            for (let ln of t.split(/\r?\n/)) {
                try {
                    objs.push(JSON.parse(ln))
                }
                catch (e) {}
            }
        }
    }
    return { objs, text }
}


//waitLog: 輪詢至 srLog 檔出現符合 pred 之行(動作之後才呼叫; 逾時拋錯並列已見事件)
async function waitLog(pred, label, ms = 15000) {
    let tEnd = Date.now() + ms
    let r = readLogLines()
    while (Date.now() < tEnd) {
        r = readLogLines()
        if (r.objs.some(pred)) {
            return r
        }
        await sleep(150)
    }
    throw new Error(`${label}: ${ms} ms 內 srLog 未見預期之行; 實得事件 ${JSON.stringify(r.objs.map((o) => o.event || o.msg)).slice(0, 400)}`)
}


//callMain: 直打資料通道 POST /api/main(w-converhp 協定, 同 test/tools/api-setup.mjs callRpc)
async function callMain(func, args, token) {
    let r = await fetch(`http://127.0.0.1:${PORT}/api/main`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
        body: Buffer.from(obj2u8arr({ func, input: { __sysInputArgs__: args, __sysToken__: token } })),
    })
    let u8a = new Uint8Array(await r.arrayBuffer())
    return u8arr2obj(u8a)
}


describe('api-ormDiag (w-serv-orm 診斷輸出導入 srLog: 只寫 label＋safe, 不含 id／email／錯誤原文, console 無診斷輸出; 真後端＋ORM 縫故障)', function() {
    this.timeout(120000)

    let child = null
    let outAfterReady = ''
    let resp = null

    before(async function() {
        fs.rmSync(fdTmp, { recursive: true, force: true })
        fs.mkdirSync(fdDb, { recursive: true })
        fs.mkdirSync(fdLog, { recursive: true })
        let params = JSON.stringify({ dir: fdDb, logFd: fdLog, port: PORT, secretId: SECRET_ID, secretMail: SECRET_MAIL, credText: CRED_TEXT })
        child = spawn(process.execPath, [path.join(projRoot, 'test', 'tools', 'ormDiagChild.mjs'), params], { cwd: projRoot, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
        let out = ''
        let ready = false
        let onData = (d) => {
            out += String(d)
            if (!ready && out.includes('READY')) {
                ready = true
                outAfterReady = '' //READY 之前(種子、建構)之輸出不列入觀察
                out = out.slice(out.indexOf('READY') + 'READY'.length)
            }
            if (ready) {
                outAfterReady = out
            }
        }
        child.stdout.on('data', onData)
        child.stderr.on('data', onData)
        let exited = false
        child.on('exit', () => {
            exited = true
        })
        //等 READY, 再等 HTTP 可連
        let tEnd = Date.now() + 90000
        while (!ready && !exited && Date.now() < tEnd) {
            await sleep(200)
        }
        A.ok(ready, `子行程未輸出 READY(exited=${exited}); 輸出尾段: ${out.slice(-800)}`)
        let up = false
        while (!up && Date.now() < tEnd) {
            try {
                await fetch(`http://127.0.0.1:${PORT}/`)
                up = true
            }
            catch (e) {
                await sleep(200)
            }
        }
        A.ok(up, `後端 port ${PORT} 未就緒`)

        //動作: 經資料通道查 targets(ORM 縫於此表 select 注入引擎失敗), 其後各案觀察 srLog 與標準輸出
        resp = await callMain('targets.select', [], 'sys')
    })

    after(async function() {
        if (child && child.pid) {
            try {
                execSync(`taskkill /F /T /PID ${child.pid}`, { stdio: 'ignore' })
            }
            catch (e) {}
        }
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

    //R-ORM-DIAG-01: ORM 引擎失敗(帶機器代碼 ENOSPC、訊息夾帶主鍵與 email)之診斷輸出進 srLog: event orm-diag(wsemi genDiagFunLog 預設事件名; 2026-10-29 起, 原 WServOrm-diag)、label 與不含個資之摘要
    it('ORMDIAG-201 資料通道 targets.select 遇 ORM 引擎失敗 → srLog 有 orm-diag(label＋safe 摘要), 摘要只含錯誤類別與機器代碼; 舊事件名 WServOrm-diag 不再出現', async function() {
        A.ok(resp && typeof resp === 'object', `呼叫須有回應物件, 實得 ${JSON.stringify(resp)}`)
        A.deepEqual(resp.success && resp.success.output, { state: 'error', msg: 'anUnexpectedErrorOccurred' }, `ORM 引擎失敗時資料通道回固定語系鍵(不外送引擎原文, R-ORM-02), 實得 ${JSON.stringify(resp).slice(0, 300)}`)
        let got = await waitLog((o) => o.event === 'orm-diag', 'ORMDIAG-201')
        A.ok(!got.objs.some((x) => x.event === 'WServOrm-diag'), '舊事件名 WServOrm-diag 不得再出現')
        let o = got.objs.find((x) => x.event === 'orm-diag')
        A.equal(o.label, 'targets.select catch', `label 應為 targets.select catch, 實得 ${JSON.stringify(o)}`)
        A.deepEqual(o.safe, { errType: 'Error', errCode: 'ENOSPC' }, `safe 應為 { errType, errCode }, 實得 ${JSON.stringify(o.safe)}`)
        A.equal(o.level, 40, 'srLog level 應為 warn(40)')
        A.deepEqual(Object.keys(o).filter((k) => !['level', 'time', 'pid', 'hostname', 'event', 'label', 'safe'].includes(k)), [], `該行不得有其他欄位(尤其不得有 detail／raw), 實得 ${JSON.stringify(o)}`)
    })

    //R-ORM-DIAG-01: 日誌政策——不記列 id／email／錯誤原文之資料值(整個 srLog 檔文字皆不含)
    it('ORMDIAG-202 srLog 全文不含主鍵、email、ORM 錯誤原文、連線憑證', async function() {
        await waitLog((o) => o.event === 'orm-diag', 'ORMDIAG-202')
        await waitLog((o) => o.event === 'operOrm-error', 'ORMDIAG-202') //資料通道失敗之既有紀錄(含 raw)亦已落檔, 全文檢查才涵蓋它
        let { text } = readLogLines()
        for (let s of [SECRET_ID, SECRET_MAIL, SECRET_TEXT, ...CREDS]) {
            A.ok(!text.includes(s), `srLog 不得含 ${s}`)
        }
    })

    //D3 對外錯誤值不含憑證 + 固定詞彙原樣: 外來值(ORM 引擎錯誤, 訊息夾帶連線憑證)到 procOrm 即被換成固定詞彙 reject('failed to select data'), 本套件之 operOrm-error 的 raw 因此是固定詞彙原樣
    it('ORMDIAG-204 資料通道之 operOrm-error: raw 為固定詞彙 failed to select data 原樣(不含引擎錯誤與憑證), msg 為固定語系鍵', async function() {
        let got = await waitLog((o) => o.event === 'operOrm-error', 'ORMDIAG-204')
        let o = got.objs.find((x) => x.event === 'operOrm-error')
        A.equal(o.msg, 'anUnexpectedErrorOccurred')
        A.equal(o.raw, 'failed to select data', `raw 應為 w-serv-orm 之固定詞彙, 實得 ${JSON.stringify(o.raw)}`)
        A.equal(o.tableName, 'targets')
        A.equal(o.methodName, 'select')
    })

    //R-ORM-DIAG-01: 診斷輸出改由 funLog 接管, 子行程標準輸出(console)不再出現診斷行與資料值(修前: 預設 console.log('targets.select catch', {...}))
    it('ORMDIAG-203 console 不多出輸出: READY 之後的標準輸出不含診斷 label 與資料值', async function() {
        await waitLog((o) => o.event === 'operOrm-error', 'ORMDIAG-203') //該失敗必記之既有事件(修前修後皆有), 以此確認失敗已處理完再看標準輸出
        await sleep(300)
        A.ok(!outAfterReady.includes('targets.select catch'), `標準輸出不得有診斷 label, 實得: ${outAfterReady.slice(-400)}`)
        for (let s of [SECRET_ID, SECRET_MAIL, SECRET_TEXT, ...CREDS]) {
            A.ok(!outAfterReady.includes(s), `標準輸出不得含 ${s}`)
        }
    })

})
