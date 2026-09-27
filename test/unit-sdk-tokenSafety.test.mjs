//SDK(src/getPerm / getPermUserInfor / fetchJson / perm.conn 與 server/provideTabs)之權杖安全與代入正確性。對應 spec/設計要點與取捨.md ADR-023。
//以 node 內建 http 起本機臨時伺服器記錄收到之請求網址, 不依賴專案後端(純單元層)。
//  SDK-001 getPermUserInfor 之佔位符檢查缺一即拒(原為 &&: 只有兩者皆缺才拒; 對齊 w-web-sso ADR-056 修正紀錄)
//  SDK-002 getPerm 代入值經 encodeURIComponent 並以 split/join 代入: 含 + & = $` 之權杖送出後, 伺服端解出之查詢值與原值相同
//          (原 replaceAll 之取代字串會解讀 $` 等樣式——把佔位符前之網址前綴複製進查詢值; 未編碼時 + 被解成空白、& 形成額外參數)
//  SDK-003 getPermUserInfor 同上(tokenSelf 與 userIdTar; userIdTar 之 $` 會把已代入之介接權杖複製進 userId)
//  SDK-004 funConvertPerm 同步拋錯 / reject → reject 'noUserDataAfterConvert'(原為部署方之錯誤原樣上拋)
//  SDK-005 fetchJson 例外之 reject 物件 message 不含網址與回應本體(原為 err.message: 'Failed to parse URL from <url>' 等), kind / status 形狀不變
//  SDK-006 perm().conn 與 provideTabs 之 reject 因此不帶網址
import assert from 'assert'
import http from 'http'
import fetchJson from '../src/fetchJson.mjs'
import getPerm from '../src/getPerm.mjs'
import getPermUserInfor from '../src/getPermUserInfor.mjs'
import perm from '../src/perm.mjs'
import provideTabs from '../server/provideTabs.mjs'


let server = null
let base = ''
let reqs = []

//路由: /ok → 200 envelope success; /notjson-secret → 200 非 JSON 本體(夾合成秘密)
function startServer() {
    return new Promise((resolve) => {
        server = http.createServer((req, res) => {
            reqs.push(req.url)
            let u = new URL(req.url, 'http://x')
            if (u.pathname === '/ok') {
                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ state: 'success', msg: { user: { id: 'u1' }, rules: [{ name: 'A', isActive: 'y' }] } }))
            }
            else if (u.pathname === '/notjson-secret') {
                res.writeHead(200, { 'Content-Type': 'text/html' })
                res.end('not json SYNTH-FJ-BODY-SECRET')
            }
            else {
                res.writeHead(404)
                res.end('nf')
            }
        })
        server.listen(0, '127.0.0.1', () => {
            base = `http://127.0.0.1:${server.address().port}`
            resolve()
        })
    })
}

//lastQuery: 最後一個請求之查詢參數(伺服端解出之值)
function lastQuery() {
    let u = new URL(reqs[reqs.length - 1], 'http://x')
    return u.searchParams
}

//reject 值轉字串供秘密掃描(物件取 JSON, 其餘 String)
function str(e) {
    try {
        return (e && typeof e === 'object') ? JSON.stringify({ ...e, message: e.message }) : String(e)
    }
    catch (err) {
        return String(e)
    }
}


describe('unit-sdk-tokenSafety', function() {
    this.timeout(30000)

    before(async function() {
        await startServer()
    })

    after(function(done) {
        server.close(() => done())
    })

    beforeEach(function() {
        reqs = []
    })


    it('SDK-001-getPermUserInfor-placeholder-check-requires-both', async function() {
        //缺 userId 佔位符: 原 && 放行而打出請求
        await assert.rejects(() => getPermUserInfor(`${base}/ok?token={sysToken}`, 't', 'u'), (e) => e === 'noTokenUserIdInUrl')
        //缺 token 佔位符
        await assert.rejects(() => getPermUserInfor(`${base}/ok?userId={userId}`, 't', 'u'), (e) => e === 'noTokenUserIdInUrl')
        //兩者皆缺(既有 E2E-002)
        await assert.rejects(() => getPermUserInfor(`${base}/ok`, 't', 'u'), (e) => e === 'noTokenUserIdInUrl')
        assert.strict.equal(reqs.length, 0, `佔位符不齊時不得送出請求, 實際送出 ${JSON.stringify(reqs)}`)
        //兩者皆有則照常
        let ur = await getPermUserInfor(`${base}/ok?token={sysToken}&userId={userId}`, 't', 'u')
        assert.strict.equal(ur.user.id, 'u1')
    })

    it('SDK-002-getPerm-substitution-encoded', async function() {
        let tk = 'a+b&c=d$`e$&f$\'g'
        await getPerm(`${base}/ok?token={token}`, tk)
        assert.strict.equal(reqs.length, 1)
        assert.strict.equal(lastQuery().get('token'), tk, `伺服端解出之 token 應等於原值, 實際請求 ${reqs[0]}`)
        assert.strict.deepEqual([...lastQuery().keys()], ['token'], `不得因未編碼而多出參數, 實際請求 ${reqs[0]}`)
        //UUID、英數與 -_.~ 為恆等轉換(線上格式不變)
        await getPerm(`${base}/ok?token={token}`, '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b')
        assert.strict.ok(reqs[1].endsWith('?token=0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b'), reqs[1])
    })

    it('SDK-003-getPermUserInfor-substitution-encoded', async function() {
        let tkSelf = 'SYNTH-APP-TOKEN+x&y=z'
        let uid = 'u$`v&w+x#y'
        await getPermUserInfor(`${base}/ok?token={sysToken}&userId={userId}`, tkSelf, uid)
        assert.strict.equal(reqs.length, 1)
        let q = lastQuery()
        assert.strict.equal(q.get('token'), tkSelf, `token 應等於原值, 實際請求 ${reqs[0]}`)
        assert.strict.equal(q.get('userId'), uid, `userId 應等於原值(不得夾帶網址前綴或介接權杖), 實際請求 ${reqs[0]}`)
        assert.strict.deepEqual([...q.keys()].sort(), ['token', 'userId'], `不得多出參數, 實際請求 ${reqs[0]}`)
        //值內含另一佔位符字樣者不被二次代入
        reqs = []
        await getPermUserInfor(`${base}/ok?token={sysToken}&userId={userId}`, 'has-{userId}-inside', 'u1')
        assert.strict.equal(lastQuery().get('token'), 'has-{userId}-inside', `實際請求 ${reqs[0]}`)
    })

    it('SDK-004-funConvertPerm-throw-or-reject-to-key', async function() {
        let throwSync = () => {
            throw new Error('SYNTH-CONVERT-SECRET')
        }
        let rejectAsync = async () => {
            throw new Error('SYNTH-CONVERT-SECRET')
        }
        let rejectStr = () => Promise.reject('SYNTH-CONVERT-SECRET')
        for (let fun of [throwSync, rejectAsync, rejectStr]) {
            await assert.rejects(() => getPerm(`${base}/ok?token={token}`, 'tk', { funConvertPerm: fun }), (e) => e === 'noUserDataAfterConvert')
            await assert.rejects(() => getPermUserInfor(`${base}/ok?token={sysToken}&userId={userId}`, 't', 'u', { funConvertPerm: fun }), (e) => e === 'noUserDataAfterConvert')
        }
        //正常轉換不受影響
        let ur = await getPerm(`${base}/ok?token={token}`, 'tk', { funConvertPerm: async (x) => ({ ...x, extra: 1 }) })
        assert.strict.equal(ur.extra, 1)
        //轉換回非物件(既有語意)
        await assert.rejects(() => getPerm(`${base}/ok?token={token}`, 'tk', { funConvertPerm: () => 'x' }), (e) => e === 'noUserDataAfterConvert')
    })

    it('SDK-005-fetchJson-reject-message-without-url-or-body', async function() {
        let cases = [
            //網址無法解析(埠超出範圍): Node fetch 之 message 為 'Failed to parse URL from <url>'
            { url: 'http://127.0.0.1:99999/x?token=SYNTH-FJ-SECRET-1', secret: 'SYNTH-FJ-SECRET-1', kind: 'request', status: 0 },
            //網址含 userinfo: message 為 'Request cannot be constructed from a URL that includes credentials: <url>'
            { url: 'http://u:SYNTH-FJ-SECRET-2@127.0.0.1:1/x', secret: 'SYNTH-FJ-SECRET-2', kind: 'request', status: 0 },
            //連線被拒
            { url: 'http://127.0.0.1:1/x?token=SYNTH-FJ-SECRET-3', secret: 'SYNTH-FJ-SECRET-3', kind: 'request', status: 0 },
            //回應非 JSON: JSON 解析錯誤之 message 夾帶回應本體片段
            { url: `${base}/notjson-secret?token=SYNTH-FJ-SECRET-4`, secret: 'SYNTH-FJ-BODY-SECRET', kind: 'parse', status: 200 },
        ]
        let bad = []
        for (let c of cases) {
            let e = null
            try {
                await fetchJson(c.url)
            }
            catch (err) {
                e = err
            }
            if (!e || e.kind !== c.kind || e.status !== c.status) {
                bad.push(`${c.secret}: kind/status 形狀應為 ${c.kind}/${c.status}, 實得 ${str(e)}`)
                continue
            }
            if (str(e).includes(c.secret) || str(e).includes('SYNTH-FJ-SECRET') || /https?:\/\//.test(e.message)) {
                bad.push(`${c.secret}: reject 物件含網址或本體, 實得 ${str(e)}`)
                continue
            }
            if (!/^[A-Za-z]{1,40}( [A-Z][A-Z0-9_]{1,40})?$/.test(e.message)) {
                bad.push(`${c.secret}: message 應為 '<err.name>[ <code>]', 實得 ${str(e)}`)
            }
        }
        assert.strict.deepEqual(bad, [], bad.join('\n'))
    })

    it('SDK-006-perm-conn-and-provideTabs-reject-without-url', async function() {
        let bad = []
        //perm().conn: reject 與 permError 皆為 fetchJson 之 reject 物件
        let got = null
        let p = perm()
        let e1 = null
        try {
            await p.conn('http://127.0.0.1:99999/api/getPerm?token=SYNTH-CONN-SECRET', {
                permError: (e) => {
                    got = e
                },
            })
        }
        catch (err) {
            e1 = err
        }
        if (!e1 || e1.kind !== 'request' || str(e1).includes('SYNTH-CONN-SECRET')) {
            bad.push(`perm.conn reject: ${str(e1)}`)
        }
        if (!got || str(got).includes('SYNTH-CONN-SECRET')) {
            bad.push(`perm.conn permError: ${str(got)}`)
        }
        //provideTabs
        let e2 = null
        try {
            await provideTabs('http://127.0.0.1:99999/syncAndReplaceTabs?keyTable=grups&token=SYNTH-SYNC-SECRET', 'grups', 'f', [{ id: 'x1', name: 'n' }])
        }
        catch (err) {
            e2 = err
        }
        if (!e2 || e2.kind !== 'request' || str(e2).includes('SYNTH-SYNC-SECRET')) {
            bad.push(`provideTabs reject: ${str(e2)}`)
        }
        assert.strict.deepEqual(bad, [], bad.join('\n'))
    })

})
