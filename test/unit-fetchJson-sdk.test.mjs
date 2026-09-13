//src/fetchJson.mjs 與四個呼叫端(getPerm / getPermUserInfor / perm.conn / provideTabs)在「連不上 / 非 2xx / 非 JSON / 正常 envelope」下之語意
//(2026-09-07 axios → 內建 fetch 改寫; 述語對齊 tmp/axios-to-fetch.md 差異表):
//  連不上 或 非 2xx → getPerm/getPermUserInfor reject 'cannotGetUserByUrl'; 非 JSON → 'cannotGetUserDataByUrl'; envelope state≠success → 'cannotGetUserDataByUrl'
//  perm.conn: 連不上/非 2xx/非 JSON → reject { kind, status, message }; envelope error → reject msg
//  provideTabs: 同 perm.conn 之 reject 型別; envelope success → resolve msg
//以 node 內建 http 起本機臨時伺服器模擬各回應, 不依賴專案後端(純單元層)。
import assert from 'assert'
import http from 'http'
import fetchJson from '../src/fetchJson.mjs'
import getPerm from '../src/getPerm.mjs'
import getPermUserInfor from '../src/getPermUserInfor.mjs'
import perm from '../src/perm.mjs'
import provideTabs from '../server/provideTabs.mjs'


let server = null
let base = ''
let lastReq = null

//路由: /ok → 200 envelope success; /err → 200 envelope error; /notjson → 200 非 JSON; /http500 → 500; /echo → 回傳收到之 body 供 POST 驗證
function startServer() {
    return new Promise((resolve) => {
        server = http.createServer((req, res) => {
            let chunks = []
            req.on('data', (d) => chunks.push(d))
            req.on('end', () => {
                lastReq = { url: req.url, method: req.method, headers: req.headers, body: Buffer.concat(chunks).toString('utf8') }
                let u = new URL(req.url, 'http://x')
                if (u.pathname === '/ok') {
                    res.writeHead(200, { 'Content-Type': 'application/json' })
                    res.end(JSON.stringify({ state: 'success', msg: { user: { id: 'u1' }, rules: [{ name: 'A', isActive: 'y' }] } }))
                }
                else if (u.pathname === '/err') {
                    res.writeHead(200, { 'Content-Type': 'application/json' })
                    res.end(JSON.stringify({ state: 'error', msg: 'someErrKey' }))
                }
                else if (u.pathname === '/notjson') {
                    res.writeHead(200, { 'Content-Type': 'text/html' })
                    res.end('<html>login page</html>')
                }
                else if (u.pathname === '/http500') {
                    res.writeHead(500, { 'Content-Type': 'application/json' })
                    res.end(JSON.stringify({ state: 'error', msg: 'boom' }))
                }
                else if (u.pathname === '/echo') {
                    res.writeHead(200, { 'Content-Type': 'application/json' })
                    res.end(JSON.stringify({ state: 'success', msg: 'echoed' }))
                }
                else {
                    res.writeHead(404)
                    res.end('nf')
                }
            })
        })
        server.listen(0, '127.0.0.1', () => {
            base = `http://127.0.0.1:${server.address().port}`
            resolve()
        })
    })
}


describe('unit-fetchJson-sdk', function() {
    this.timeout(30000)

    before(async function() {
        await startServer()
    })

    after(function(done) {
        server.close(() => done())
    })


    //fetchJson 本體
    it('FJ-001-fetchJson-success-resolves-json', async function() {
        let r = await fetchJson(`${base}/ok`)
        assert.strict.equal(r.state, 'success')
    })
    it('FJ-002-fetchJson-non-2xx-rejects-request', async function() {
        await assert.rejects(() => fetchJson(`${base}/http500`), (e) => e.kind === 'request' && e.status === 500)
    })
    it('FJ-003-fetchJson-not-json-rejects-parse', async function() {
        await assert.rejects(() => fetchJson(`${base}/notjson`), (e) => e.kind === 'parse' && e.status === 200)
    })
    it('FJ-004-fetchJson-unreachable-rejects-request', async function() {
        await assert.rejects(() => fetchJson('http://127.0.0.1:1/x'), (e) => e.kind === 'request' && e.status === 0)
    })

    //getPerm: 對齊 axios 時期 reject key
    it('FJ-010-getPerm-keys', async function() {
        let ur = await getPerm(`${base}/ok?token={token}`, 'tk')
        assert.strict.equal(ur.user.id, 'u1')
        assert.strict.ok(lastReq.url.endsWith('?token=tk'), 'token 應原樣替入 query')
        await assert.rejects(() => getPerm(`${base}/http500?token={token}`, 'tk'), (e) => e === 'cannotGetUserByUrl')
        await assert.rejects(() => getPerm('http://127.0.0.1:1/x?token={token}', 'tk'), (e) => e === 'cannotGetUserByUrl')
        await assert.rejects(() => getPerm(`${base}/notjson?token={token}`, 'tk'), (e) => e === 'cannotGetUserDataByUrl')
        await assert.rejects(() => getPerm(`${base}/err?token={token}`, 'tk'), (e) => e === 'cannotGetUserDataByUrl')
    })

    //getPermUserInfor: 同上, 且 {token-for-application} 之大括號須原樣送出(WHATWG URL query 不 percent-encode {})
    it('FJ-011-getPermUserInfor-keys-and-brace-token', async function() {
        let ur = await getPermUserInfor(`${base}/ok?token={sysToken}&userId={userId}`, '{token-for-application}', 'id-x')
        assert.strict.equal(ur.user.id, 'u1')
        assert.strict.ok(lastReq.url.includes('token={token-for-application}&userId=id-x'), `大括號 token 應原樣, 實得 ${lastReq.url}`)
        await assert.rejects(() => getPermUserInfor(`${base}/http500?token={sysToken}&userId={userId}`, 't', 'u'), (e) => e === 'cannotGetUserByUrl')
        await assert.rejects(() => getPermUserInfor(`${base}/notjson?token={sysToken}&userId={userId}`, 't', 'u'), (e) => e === 'cannotGetUserDataByUrl')
        await assert.rejects(() => getPermUserInfor(`${base}/err?token={sysToken}&userId={userId}`, 't', 'u'), (e) => e === 'cannotGetUserDataByUrl')
    })

    //perm.conn: 成功 resolve envelope msg 並可 active(); 失敗 reject 型別
    it('FJ-012-perm-conn', async function() {
        let p = perm()
        let d = await p.conn(`${base}/ok?token=tk`)
        assert.strict.equal(d.user.id, 'u1')
        assert.strict.equal(p.active('A'), 'y')
        assert.strict.equal(p.active('Z'), 'n')
        let p2 = perm()
        await assert.rejects(() => p2.conn(`${base}/err?token=tk`), (e) => e === 'someErrKey')
        let p3 = perm()
        await assert.rejects(() => p3.conn(`${base}/http500?token=tk`), (e) => e && e.kind === 'request' && e.status === 500)
        let p4 = perm()
        await assert.rejects(() => p4.conn(`${base}/notjson?token=tk`), (e) => e && e.kind === 'parse')
    })

    //provideTabs: POST JSON body 與 header, 成功 resolve msg, 失敗 reject
    it('FJ-013-provideTabs-post', async function() {
        let rows = [{ id: 'x1', order: 1, name: 'n', description: 'd', from: 'f', cpemis: '{}', extra: 'dropped' }]
        let r = await provideTabs(`${base}/echo?keyTable=grups&token=tk`, 'grups', 'f', rows)
        assert.strict.equal(r, 'echoed')
        assert.strict.equal(lastReq.method, 'POST')
        assert.strict.ok(String(lastReq.headers['content-type']).startsWith('application/json'), 'Content-Type 應為 application/json')
        let sent = JSON.parse(lastReq.body)
        assert.strict.equal(sent.from, 'f')
        assert.strict.equal(sent.rows.length, 1)
        assert.strict.equal(sent.rows[0].extra, undefined, 'ltdtpick 應剔除非 schema 欄位')
        await assert.rejects(() => provideTabs(`${base}/err?keyTable=grups&token=tk`, 'grups', 'f', rows), (e) => e === 'someErrKey')
        await assert.rejects(() => provideTabs(`${base}/http500?keyTable=grups&token=tk`, 'grups', 'f', rows), (e) => e && e.kind === 'request' && e.status === 500)
        await assert.rejects(() => provideTabs(`${base}/echo`, 'nope', 'f', rows), (e) => e === 'invalidKeyTable')
    })

})
