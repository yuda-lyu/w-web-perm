//console 診斷不輸出資料值之行為驗證(perm 修正輪 20261031023204, 排程第 191、165 項; 規則帳本 R-CONSOLE-NOVAL-01; ADR-047)
//規格句(本檔所翻譯者; 各案註解標明):
//  S1 dspec〈診斷輸出與遮罩〉D2「預設不輸出資料值」(使用者 2026-10-29 裁示).
//  S2 dspec〈輸入參數之檢測機制〉§6 V20「訊息與 throw／reject 前之 console 皆不含輸入值」.
//  S3 主控裁定(任務 20261031023204): console 診斷只印鍵名、型別或固定詞彙, 不印使用者物件、請求本體、傳入值; 權杖之 maskTok 照舊.
//做法: 真後端(子行程 test/tools/consoleNoValuesChild.mjs; 真 WWebPerm／w-serv-orm／w-serv-webdata／srLog)與建構期子行程(test/tools/consoleNoValuesInitChild.mjs),
//  以**同一識別值** ZZ-secret-9317 置於使用者物件、請求本體、查詢參數、建構參數之「值」, 經真 HTTP／真建構觸發各 console 站點, 收集子行程之標準輸出與標準錯誤,
//  斷言(a)全程輸出不含識別值(b)各站點確實被觸發且印出之是鍵名／型別摘要(證明不是空轉)。站點靜態全集與豁免見 unit-consoleNoValues; 動態不可達之站點由其靜態不變式負責(見各案註解與規則帳本)。
//跑法(需測試鎖): node C:/opensrcOper/tools/quiet-run.mjs --lock --name console -- npx mocha test/api-consoleNoValues.test.mjs --timeout 180000
import fs from 'fs'
import path from 'path'
import assert from 'assert'
import { spawn, execSync } from 'child_process'
import { fileURLToPath } from 'url'

const A = assert.strict
const projRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const fdTmp = path.join(projRoot, 'test', '_tmp', 'api-consoleNoValues')
const fdDb = path.join(fdTmp, 'db')
const fdLog = path.join(fdTmp, 'logs')
const fdFault = path.join(fdTmp, 'fault')
const PORT = 8564 //專屬本檔(≥8000, 不隨機); 與 11006／8090／8561／8562／8563／e2e 各槽錯開
const PORT_INIT = 8565
const SEC = 'ZZ-secret-9317'

let sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let base = `http://127.0.0.1:${PORT}`


describe('api-consoleNoValues (真後端: 含識別值之使用者物件／請求本體／查詢參數經真 HTTP 觸發各 console 站點, 輸出不含識別值; R-CONSOLE-NOVAL-01)', function() {
    this.timeout(180000)

    let child = null
    let st = { out: '', ready: false, exited: false }

    //act: 執行動作後等輸出落到收集端, 回傳動作期間新增之輸出
    let act = async (fn) => {
        let mark = st.out.length
        await fn()
        await sleep(500)
        return st.out.slice(mark)
    }

    //noSec: 輸出不含識別值(含大小寫變體)
    let noSec = (t, label) => {
        A.ok(!t.includes(SEC), `${label}: 輸出不得含識別值, 實得:\n${t.slice(0, 800)}`)
        A.ok(!t.toLowerCase().includes(SEC.toLowerCase()), `${label}: 輸出不得含識別值(大小寫變體)`)
    }

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
        let params = JSON.stringify({ dir: fdDb, logFd: fdLog, port: PORT, faultDir: fdFault, sec: SEC })
        child = spawn(process.execPath, [path.join(projRoot, 'test', 'tools', 'consoleNoValuesChild.mjs'), params], { cwd: projRoot, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
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
                await fetch(`${base}/`)
                up = true
            }
            catch (e) {
                await sleep(200)
            }
        }
        A.ok(up, `後端 port ${PORT} 未就緒`)
    })

    afterEach(function() {
        fs.rmSync(path.join(fdFault, 'targets.poison'), { force: true })
    })

    after(async function() {
        if (child && child.pid) {
            try {
                execSync(`taskkill /F /T /PID ${child.pid}`, { stdio: 'ignore', windowsHide: true })
            }
            catch (e) {}
        }
        for (let i = 0; i < 20; i++) {
            try {
                fs.rmSync(fdTmp, { recursive: true, force: true })
                break
            }
            catch (e) {
                await sleep(500)
            }
        }
    })

    let get = async (p) => {
        let r = await fetch(`${base}${p}`)
        await r.text()
        return r.status
    }
    let post = async (p, body, ct = 'application/json') => {
        let r = await fetch(`${base}${p}`, { method: 'POST', headers: { 'Content-Type': ct }, body })
        await r.text()
        return r.status
    }

    //——— 使用者物件(getUserByToken 之回傳; checkUser 四分支) ———
    //S1／S3: checkUser 之分支只印使用者物件之鍵名, 值(id／name／email／isAdmin 皆含識別值)不出現
    it('CNV-001-checkUser-user-object-keys-only', async function() {
        let t1 = await act(() => get('/api/getUserByToken?token=tok-noid'))
        noSec(t1, 'tok-noid(缺 id)')
        A.ok(t1.includes('user (keys: name,email,isAdmin)'), `應印鍵名摘要, 實得:\n${t1.slice(0, 500)}`)
        let t2 = await act(() => get('/api/getUserByToken?token=tok-noemail'))
        noSec(t2, 'tok-noemail(缺 email)')
        A.ok(t2.includes('user (keys: id,name,isAdmin)'), `應印鍵名摘要, 實得:\n${t2.slice(0, 500)}`)
        let t3 = await act(() => get('/api/getUserByToken?token=tok-noname'))
        noSec(t3, 'tok-noname(缺 name)')
        A.ok(t3.includes('user (keys: id,email,isAdmin)'), `應印鍵名摘要, 實得:\n${t3.slice(0, 500)}`)
        let t4 = await act(() => get('/api/getUserByToken?token=tok-badrole'))
        noSec(t4, 'tok-badrole(isAdmin 非 y／n)')
        A.ok(t4.includes('user (keys: id,name,email,isAdmin)'), `應印鍵名摘要, 實得:\n${t4.slice(0, 500)}`)
        A.ok(t4.includes('user.isAdmin is not y or n (typeof string)'), `isAdmin 之值應只印型別, 實得:\n${t4.slice(0, 500)}`)
    })

    //S1／S3: 外部使用者不在 perm 表(getTokenUser 之 cannotGetUserFromPerm 分支)只印鍵名; mappingBy 為固定詞彙照印
    it('CNV-002-getTokenUser-not-in-perm-keys-only', async function() {
        let t = await act(() => get('/api/getUserByToken?token=tok-notinperm'))
        noSec(t, 'tok-notinperm')
        A.ok(t.includes('userSelf (keys: id,name,email,isAdmin)'), `應印鍵名摘要, 實得:\n${t.slice(0, 500)}`)
        A.ok(t.includes('mappingBy id'), `mappingBy 為固定詞彙, 實得:\n${t.slice(0, 500)}`)
    })

    //S1／S3: 部署方 verifyClientUser／verifyAppUser 否決(userNoPermission 分支)——perm 列(欄位值含識別值)／外部使用者物件只印鍵名
    it('CNV-003-verify-denied-user-keys-only', async function() {
        let t1 = await act(() => get('/api/getUserByToken?token=tok-zz'))
        noSec(t1, 'verifyClientUser 否決')
        A.ok(/user \(keys: [^)]*\bname\b[^)]*\)/.test(t1), `應印 perm 列之鍵名摘要, 實得:\n${t1.slice(0, 500)}`)
        let t2 = await act(() => get('/api/getPermUserInfor?token=tok-zz&userId=id-zz'))
        noSec(t2, 'verifyAppUser 否決')
        A.ok(t2.includes('user (keys: id,name,email,isAdmin)'), `應印外部使用者之鍵名摘要, 實得:\n${t2.slice(0, 500)}`)
    })

    //——— 請求本體(POST /syncAndReplaceTabs 之 payload) ———
    //S1／S3: payload 驗證失敗三分支(非物件／from 非字串／rows 非陣列)只印鍵名／型別, 請求本體之值不出現
    it('CNV-004-payload-body-keys-only', async function() {
        let q = '/syncAndReplaceTabs?keyTable=users&token=sys'
        let t1 = await act(() => post(q, JSON.stringify(SEC)))
        noSec(t1, 'payload 為字串')
        A.ok(/payload \((typeof string|keys: none)/.test(t1), `應印型別摘要, 實得:\n${t1.slice(0, 500)}`)
        let t2 = await act(() => post(q, JSON.stringify({ from: 123, note: SEC })))
        noSec(t2, 'from 非字串')
        A.ok(t2.includes('payload (keys: from,note)'), `應印鍵名摘要, 實得:\n${t2.slice(0, 500)}`)
        let t3 = await act(() => post(q, JSON.stringify({ from: 'pd', rows: SEC })))
        noSec(t3, 'rows 非陣列')
        A.ok(t3.includes('payload (keys: from,rows)'), `應印鍵名摘要, 實得:\n${t3.slice(0, 500)}`)
    })

    //——— 查詢參數(req.query)與 keyTable ———
    //S1／S3: 缺 token 時印出之 req.query 只列鍵名(原 maskQuery 僅遮 token 鍵, 其餘值原樣印出)
    it('CNV-005-query-keys-only', async function() {
        let t1 = await act(() => get(`/api/getUserByToken?userId=${SEC}`))
        noSec(t1, 'getUserByToken 缺 token')
        A.ok(t1.includes('req.query (keys: userId)'), `應印鍵名摘要, 實得:\n${t1.slice(0, 500)}`)
        let t2 = await act(() => get(`/api/getPerm?userId=${SEC}&x=${SEC}`))
        noSec(t2, 'getPerm 缺 token')
        A.ok(t2.includes('req.query (keys: userId,x)'), `應印鍵名摘要, 實得:\n${t2.slice(0, 500)}`)
        let t3 = await act(() => get(`/api/getPermUserInfor?userId=${SEC}`))
        noSec(t3, 'getPermUserInfor 缺 token')
        A.ok(t3.includes('req.query (keys: userId)'), `應印鍵名摘要, 實得:\n${t3.slice(0, 500)}`)
        let t4 = await act(() => get('/api/getPermUserInfor?token=sys&extra=' + SEC))
        noSec(t4, 'getPermUserInfor 缺 userId')
        A.ok(t4.includes('req.query (keys: token,extra)'), `應印鍵名摘要, 實得:\n${t4.slice(0, 500)}`)
        let t5 = await act(() => post(`/syncAndReplaceTabs?keyTable=users&extra=${SEC}`, '{}'))
        noSec(t5, 'syncAndReplaceTabs 缺 token')
        A.ok(t5.includes('req.query (keys: keyTable,extra)'), `應印鍵名摘要, 實得:\n${t5.slice(0, 500)}`)
    })

    //S1／S3: keyTable 非白名單或為空只印型別
    it('CNV-006-keyTable-type-only', async function() {
        let t1 = await act(() => post(`/syncAndReplaceTabs?keyTable=${SEC}&token=sys`, '{}'))
        noSec(t1, 'keyTable 非白名單')
        A.ok(t1.includes('unexpected keyTable (typeof string)'), `應印型別, 實得:\n${t1.slice(0, 500)}`)
        let t2 = await act(() => post('/syncAndReplaceTabs?keyTable=&token=sys', '{}'))
        noSec(t2, 'keyTable 為空')
        A.ok(t2.includes('keyTable (typeof string, empty)'), `應印型別, 實得:\n${t2.slice(0, 500)}`)
    })

    //——— 權限樹評估(getUserRules)與其共用碼(mShare) ———
    //S1／S3: 授權字串(cgrups)非合法 JSON5 時, 原印出整段授權字串與 JSON5 錯誤; 現只印型別與錯誤類別
    it('CNV-007-mShare-invalid-authorization-text', async function() {
        let t = await act(() => get('/api/getPerm?token=tok-zz2'))
        noSec(t, 'cgrups 為識別值')
        A.ok(/^cvStrToArr: JSON5\.parse failed \(typeof string\) SyntaxError\s*$/m.test(t), `應只印型別與錯誤類別(整行相符, 不得後接錯誤訊息), 實得:\n${t.slice(0, 500)}`)
    })

    //S1／S3: 權限樹評估拋出含識別值之例外(經 ORM 縫注入), 只印錯誤類別; userId 只印型別
    it('CNV-008-getUserRules-error-class-only', async function() {
        fs.writeFileSync(path.join(fdFault, 'targets.poison'), '1')
        let t = await act(() => get('/api/getPerm?token=sys'))
        noSec(t, 'getUserRules 拋出含識別值之例外')
        A.ok(t.includes('getUserRules (Error)'), `應印錯誤類別, 實得:\n${t.slice(0, 500)}`)
        A.ok(t.includes('userId (typeof string)'), `userId 應只印型別, 實得:\n${t.slice(0, 500)}`)
    })

    //——— 權杖(maskTok 照舊)與連線閘 ———
    //S3: 權杖仍經 maskTok(露頭尾少數字元與長度), 不露全文; 非 Bearer 方案之 Authorization 視同無 token
    it('CNV-009-verifyConn-authorization-masked', async function() {
        let t = await act(async () => {
            let r = await fetch(`${base}/api/main`, { method: 'POST', headers: { 'Authorization': `Basic ${SEC}`, 'Content-Type': 'application/octet-stream' }, body: Buffer.from([1, 2, 3]) })
            await r.arrayBuffer()
        })
        noSec(t, 'Authorization 為 Basic+識別值')
        A.ok(t.includes('authorization'), `連線閘應印遮罩後之 authorization, 實得:\n${t.slice(0, 500)}`)
        A.ok(/\w+\.\.\.\w+\(len=\d+\)/.test(t), `權杖應為 maskTok 形狀(頭尾少數字元與長度), 實得:\n${t.slice(0, 500)}`)
    })

    //全程輸出收尾: 整段子行程輸出(含啟動與全部請求)不含識別值
    it('CNV-099-whole-output-no-secret', async function() {
        await sleep(500)
        noSec(st.out, '子行程全程輸出')
        A.ok(st.out.includes('READY'), '子行程輸出收集端須有效(READY)')
    })

})


//——— 建構期(建構參數含識別值) ———
let runInit = async (scenario) => {
    let fd = path.join(projRoot, 'test', '_tmp', 'api-consoleNoValues-init', scenario)
    fs.rmSync(fd, { recursive: true, force: true })
    fs.mkdirSync(path.join(fd, 'logs'), { recursive: true })
    let params = JSON.stringify({ scenario, sec: SEC, logFd: path.join(fd, 'logs'), port: PORT_INIT })
    let c = spawn(process.execPath, [path.join(projRoot, 'test', 'tools', 'consoleNoValuesInitChild.mjs'), params], { cwd: projRoot, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    let out = ''
    c.stdout.on('data', (d) => {
        out += String(d)
    })
    c.stderr.on('data', (d) => {
        out += String(d)
    })
    let tEnd = Date.now() + 60000
    let exited = false
    c.on('exit', () => {
        exited = true
    })
    while (!exited && Date.now() < tEnd) {
        await sleep(200)
    }
    if (!exited) {
        try {
            execSync(`taskkill /F /T /PID ${c.pid}`, { stdio: 'ignore', windowsHide: true })
        }
        catch (e) {}
    }
    let m = /RESULT (.*)/.exec(out)
    let r = m ? JSON.parse(m[1]) : null
    //out 去掉子行程回報結果之 RESULT 行(該行為測試通道, 含拋出之 Error 文字, 不是 console 輸出)
    return { out: out.replace(/RESULT .*/, ''), r, fd }
}

describe('api-consoleNoValues-init (建構參數含識別值: 建構期 console 不印傳入值; V20)', function() {
    this.timeout(120000)

    after(async function() {
        for (let i = 0; i < 20; i++) {
            try {
                fs.rmSync(path.join(projRoot, 'test', '_tmp', 'api-consoleNoValues-init'), { recursive: true, force: true })
                break
            }
            catch (e) {
                await sleep(500)
            }
        }
    })

    //S2 V20: url 為含密碼(識別值)之設定物件 → console 只印型別, 拋出之 Error 為固定詞彙
    it('CNV-101-bad-url-object-type-only', async function() {
        let { out, r } = await runInit('bad-url')
        A.ok(r && r.threw, `應拋錯, 實得輸出:\n${out.slice(-500)}`)
        let all = r.consoleLines.join('\n') + '\n' + out
        A.ok(!all.includes(SEC), `console 不得含識別值, 實得:\n${all.slice(0, 500)}`)
        A.ok(r.consoleLines.join('\n').includes('\'invalid url\' \'object\''), `應印型別, 實得:\n${r.consoleLines.join('\n')}`)
        A.equal(r.msg, 'invalid url')
    })

    //S2 V20: 注入函數參數為含識別值之字串 → 只印型別
    it('CNV-102-bad-function-arg-type-only', async function() {
        let { out, r } = await runInit('bad-fun')
        A.ok(r && r.threw, `應拋錯, 實得輸出:\n${out.slice(-500)}`)
        let all = r.consoleLines.join('\n') + '\n' + out
        A.ok(!all.includes(SEC), `console 不得含識別值, 實得:\n${all.slice(0, 500)}`)
        A.ok(r.consoleLines.join('\n').includes('\'invalid getUserByToken\' \'string\''), `應印型別, 實得:\n${r.consoleLines.join('\n')}`)
        A.equal(r.msg, 'invalid getUserByToken')
    })

    //S1／S3: WOrm 建構拋出之 Error 訊息含識別值(非連線憑證, 上游之憑證遮罩不涵蓋) → console 只印錯誤類別
    it('CNV-103-orm-init-error-class-only', async function() {
        let { out, r } = await runInit('bad-orm')
        A.ok(r && r.threw, `應拋錯, 實得輸出:\n${out.slice(-500)}`)
        let all = r.consoleLines.join('\n') + '\n' + out
        A.ok(!all.includes(SEC), `console 不得含識別值, 實得:\n${all.slice(0, 500)}`)
        A.ok(r.consoleLines.join('\n').includes('\'WServOrm init error\' \'(Error)\''), `應印錯誤類別, 實得:\n${r.consoleLines.join('\n')}`)
    })

})
