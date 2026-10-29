//srLog raw 移除連線憑證之接線(mig-perm2, 20261029002013, 排程第 161 項; 主控 2026-10-30 裁定 T-a 選 B; 規則帳本 R-ORM-DIAG-02; 跨套件規格 dspec〈診斷輸出與遮罩〉D1／D3)
//規格句(本檔所翻譯者; 各案註解標明): 本套件直接呼叫 woItems 之 ORM 方法(不經 procOrm)所拋出之錯誤, 驅動訊息可能回顯連線字串; 入 srLog 之 raw(或 verifyConn 之 msg)前經 wsemi maskDiagText 以 WWebPerm 之 url 導出之 reject 清單遮罩.
//  各站點之遮罩規則逐站驗證見 unit-maskRaw(替身表); 本檔證明 WWebPerm 把 url 導出之秘密清單接到各站點: 真後端(子行程 test/tools/maskRawChild.mjs; 真 WWebPerm／w-serv-orm／w-serv-webdata／srLog 落檔),
//  WWebPerm 之連線字串為含帳密之網址, 資料庫實際開在 w-orm-lmdb; ORM 縫(select)依標記檔注入故障, 訊息回顯連線字串與裸密碼(裸密碼不是 key=value 形式, 只靠 url 導出之已知秘密清單才遮得到).
//  測試經真 HTTP 觸發: 資料通道連線閘(verifyConn)、GET /api/getPerm(routeResult)、資料通道 updateTargets(procCore errLog、讀回); syncCore 之接線見 unit-maskRaw MR-007(MASKRAW-104 已廢止保留編號, 理由見下).
//跑法(需測試鎖): node C:/opensrcOper/tools/quiet-run.mjs --lock --name maskraw -- npx mocha test/api-maskRaw.test.mjs --timeout 120000
import fs from 'fs'
import path from 'path'
import assert from 'assert'
import { spawn, execSync } from 'child_process'
import { fileURLToPath } from 'url'
import obj2u8arr from 'wsemi/src/obj2u8arr.mjs'
import u8arr2obj from 'wsemi/src/u8arr2obj.mjs'

const A = assert.strict
const projRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const fdTmp = path.join(projRoot, 'test', '_tmp', 'api-maskRaw')
const fdDb = path.join(fdTmp, 'db')
const fdLog = path.join(fdTmp, 'logs')
const fdFault = path.join(fdTmp, 'fault')
const PORT = 8563 //專屬本檔(≥8000, 不隨機); 與 11006／8090／8561／8562／8549／e2e 各槽錯開
const USER = 'permuser'
const PW = 'Zx9kQ2mLp7'
const URL_CRED = `mongodb://${USER}:${PW}@db.example.com:27017/wperm`
const MARK = 'ENGINE-FAILED-MARK'

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
        let o = r.objs.find(pred)
        if (o) {
            return { ...r, o }
        }
        await sleep(150)
    }
    throw new Error(`${label}: ${ms} ms 內 srLog 未見預期之行; 實得事件 ${JSON.stringify(r.objs.map((o) => o.event || o.msg)).slice(0, 500)}`)
}

//fault: 開關子行程之故障標記檔(存在即故障)
let fault = (name, on) => {
    let fp = path.join(fdFault, name)
    if (on) {
        fs.writeFileSync(fp, '1')
    }
    else {
        fs.rmSync(fp, { force: true })
    }
}

//callMain: 直打資料通道 POST /api/main(w-converhp 協定, 同 test/tools/api-setup.mjs callRpc); 回解碼後之回應物件
async function callMain(func, args, token) {
    let r = await fetch(`http://127.0.0.1:${PORT}/api/main`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
        body: Buffer.from(obj2u8arr({ func, input: { __sysInputArgs__: args, __sysToken__: token } })),
    })
    let u8a = new Uint8Array(await r.arrayBuffer())
    return u8arr2obj(u8a)
}

//assertClean: 文字不含密碼、帳密並列、連線字串; 且保留非憑證之診斷文字(證明記了原文、只遮憑證)
let assertClean = (t, tag, label) => {
    A.equal(typeof t, 'string', `${label}: 應為字串, 實得 ${JSON.stringify(t)}`)
    A.ok(!t.includes(PW), `${label}: 不得含密碼, 實得 ${t.slice(0, 300)}`)
    A.ok(!t.includes(`${USER}:${PW}`), `${label}: 不得含帳密並列`)
    A.ok(!t.includes(URL_CRED), `${label}: 不得含連線字串`)
    A.ok(t.includes(`${MARK}-${tag}`), `${label}: 非憑證之診斷文字須保留(只遮憑證, 不吞整段原文), 實得 ${t.slice(0, 300)}`)
}


describe('api-maskRaw (WWebPerm 之 url 導出之秘密清單接到各 srLog raw 站點; 真後端＋ORM 縫故障, R-ORM-DIAG-02)', function() {
    this.timeout(120000)

    let child = null

    before(async function() {
        for (let i = 0; i < 20; i++) { //上一輪之子行程若尚持有 lmdb 檔(Windows EBUSY)則重試
            try {
                fs.rmSync(fdTmp, { recursive: true, force: true })
                break
            }
            catch (e) {
                await sleep(300)
            }
        }
        fs.mkdirSync(fdDb, { recursive: true })
        fs.mkdirSync(fdLog, { recursive: true })
        fs.mkdirSync(fdFault, { recursive: true })
        let params = JSON.stringify({ dir: fdDb, logFd: fdLog, port: PORT, faultDir: fdFault, url: URL_CRED, pw: PW })
        child = spawn(process.execPath, [path.join(projRoot, 'test', 'tools', 'maskRawChild.mjs'), params], { cwd: projRoot, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
        let st = { out: '', ready: false, exited: false }
        let onData = (d) => {
            st.out += String(d)
            if (st.out.includes('READY')) {
                st.ready = true
            }
        }
        child.stdout.on('data', onData)
        child.stderr.on('data', onData)
        child.on('exit', () => {
            st.exited = true
        })
        let tEnd = Date.now() + 90000
        while (!st.ready && !st.exited && Date.now() < tEnd) {
            await sleep(200)
        }
        A.ok(st.ready, `子行程未輸出 READY(exited=${st.exited}); 輸出尾段: ${st.out.slice(-800)}`)
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
    })

    afterEach(function() {
        for (let n of ['users.select', 'targets.select', 'targets.select-after-write']) {
            fault(n, false)
        }
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

    //連線閘(verifyConn): 反查 perm users 表時 woItems.users.select 失敗 → checkToken reject 該 Error → verifyConn-error 之 msg 取其訊息(修前原樣入 log, 含裸密碼與連線字串)
    it('MASKRAW-101 [verifyConn msg] 連線閘反查 users 表之 ORM 錯誤原文回顯連線字串 → srLog verifyConn-error 之 msg 已遮(保留非憑證文字), 請求被拒', async function() {
        fault('users.select', true)
        let resp = await callMain('targets.select', [], 'sys')
        A.ok(!(resp && resp.success && resp.success.output && resp.success.output.state === 'success'), `連線閘須拒絕(users 表讀取失敗, fail-closed), 實得 ${JSON.stringify(resp).slice(0, 300)}`)
        let { o } = await waitLog((x) => x.event === 'verifyConn-error' && typeof x.msg === 'string' && x.msg.includes(MARK), 'MASKRAW-101')
        assertClean(o.msg, 'users.select', 'verifyConn msg')
    })

    //hapi 路由: GET /api/getPerm 取權限樹時 woItems.targets.select 失敗 → 路由收斂函數 routeResult 記 raw(前一輪歸為固定詞彙之出口, 本輪更正: 此出口接得到 woItems 直接讀取之原文)
    it('MASKRAW-102 [routeResult raw] GET /api/getPerm 之 targets 表讀取失敗(原文回顯連線字串) → 回固定鍵 anUnexpectedErrorOccurred, srLog api/getPerm-error 之 raw 已遮', async function() {
        fault('targets.select', true)
        let r = await fetch(`http://127.0.0.1:${PORT}/api/getPerm?token=sys`)
        let res = await r.json()
        A.deepEqual({ state: res.state, msg: res.msg }, { state: 'error', msg: 'anUnexpectedErrorOccurred' }, `對外為固定語系鍵, 實得 ${JSON.stringify(res).slice(0, 300)}`)
        let { o } = await waitLog((x) => x.event === 'api/getPerm-error' && typeof x.raw === 'string' && x.raw.includes(MARK), 'MASKRAW-102')
        A.equal(o.msg, 'anUnexpectedErrorOccurred')
        assertClean(o.raw, 'targets.select', 'routeResult raw')
    })

    //資料通道寫入: updateTargets 於本表鎖內讀庫(woItems.targets.select)失敗 → procCore errLog 記 raw, 對外回 saveWriteFail
    it('MASKRAW-103 [procCore errLog raw] 資料通道 updateTargets 之 targets 表讀取失敗(原文回顯連線字串) → 對外為固定鍵, srLog updateTargets-error 之 raw 已遮', async function() {
        let rows = [{ id: '專案A/頁1/區塊1', order: 1, description: 'd' }]
        fault('targets.select', true)
        let resp = await callMain('updateTargets', [rows, {}], 'sys')
        let out = resp && resp.success && resp.success.output
        A.ok(out && out.state === 'error', `應回錯誤, 實得 ${JSON.stringify(resp).slice(0, 300)}`)
        A.ok(!JSON.stringify(resp).includes(PW), '回應不得含密碼')
        let { o } = await waitLog((x) => x.event === 'updateTargets-error' && typeof x.raw === 'string' && x.raw.includes(MARK), 'MASKRAW-103')
        A.equal(o.msg, 'saveWriteFail', 'msg 為固定語系鍵, 不經遮罩')
        assertClean(o.raw, 'targets.select', 'errLog raw')
    })

    //MASKRAW-104(已廢止，編號保留不再使用; 理由: 原案經外部同步端點觸發 syncCore 讀庫之站點，但 unit-e2e-lifecycle LC-004 之站點不變式〔R-TEST-EXT-CLEAN-01〕
    //以程式碼中出現同步端點路徑即判為「建立外部列夾具」而要求 api-setup 之收尾輔助; 本檔之後端為子行程自有之獨立資料夾〔test/_tmp〕，該案又在讀庫即失敗〔零寫入〕，收尾輔助不適用，
    //不為迴避掃描而改寫路徑字串。syncCore 讀庫站點由 unit-maskRaw MR-201 逐站驗證，WWebPerm 對 syncCore 傳入之 secrets 由 unit-maskRaw MR-007 以原始碼靜態斷言＋syncCore 之必帶檢查〔缺即建構 TypeError〕把關)

    //資料通道寫入成功但讀回(returnRows)失敗: 寫入已生效, 讀回之 woItems.targets.select 失敗 → procCore 讀回站點記 raw
    it('MASKRAW-105 [procCore readBack raw] updateTargets 寫入成功後讀回失敗(原文回顯連線字串) → 仍回成功, srLog updateTabItems-readBack-error 之 raw 已遮', async function() {
        let got = await callMain('targets.select', [], 'sys')
        let rows = got && got.success && got.success.output && got.success.output.msg
        A.ok(Array.isArray(rows) && rows.length > 0, `前提: 取得 targets 全部列, 實得 ${JSON.stringify(got).slice(0, 300)}`)
        rows = JSON.parse(JSON.stringify(rows))
        rows[0].description = `${rows[0].description || ''}-maskraw`
        fault('targets.select-after-write', true)
        let resp = await callMain('updateTargets', [rows, { returnRows: true }], 'sys')
        let out = resp && resp.success && resp.success.output
        A.ok(out && out.state === 'success', `寫入已生效, 讀回失敗不使存檔失敗, 實得 ${JSON.stringify(resp).slice(0, 300)}`)
        let { o } = await waitLog((x) => x.event === 'updateTabItems-readBack-error' && typeof x.raw === 'string' && x.raw.includes(MARK), 'MASKRAW-105')
        A.equal(o.msg, 'getDataError')
        assertClean(o.raw, 'targets.select', 'readBack raw')
    })

    //全文: 上列各案之故障皆已發生後, 整份 srLog 不含密碼與帳密並列(各站點之遮罩合起來之結果)
    it('MASKRAW-106 [全文] 各故障發生後, srLog 全文不含密碼、帳密並列、連線字串', async function() {
        //自行再觸發一次故障並等其落檔(單獨以 --grep 跑本案亦成立; 且 srLog 經 pino transport 非同步落檔, 讀檔前等其 flush, 否則尚未落檔之漏遮行會使本案假綠)
        fault('targets.select', true)
        await fetch(`http://127.0.0.1:${PORT}/api/getPerm?token=sys`)
        await waitLog((x) => x.event === 'api/getPerm-error' && typeof x.raw === 'string' && x.raw.includes(MARK), 'MASKRAW-106')
        await sleep(800)
        let { text } = readLogLines()
        A.ok(text.includes(MARK), '前提: 故障之原文有記入 log(非整段被丟棄)')
        for (let s of [PW, `${USER}:${PW}`, URL_CRED]) {
            A.ok(!text.includes(s), `srLog 全文不得含 ${s}`)
        }
    })

})
