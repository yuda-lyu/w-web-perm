//M 契約(權杖與網址寫入 console / srLog 前之遮罩, server/maskLog.mjs)單元測試與站點不變式。對應 spec/設計要點與取捨.md ADR-023。
//測資與 w-web-sso server/srLog.mjs 之 maskToken、w-web-api / w-web-task 之 maskTok 為同一組(四 repo 一致; 來源為 sso 修正方案 v2〈六〉M 契約)。
//  maskTok  : 空值 → ''; 陣列逐元素; 字串露出 k=min(4, floor(n/8)) 字(k=0 只給長度), 露出之控制字元換 '?'; 其他型別只給 (typeof)
//  maskUrl  : http(s) 只留 origin + pathname(捨棄 query / fragment / userinfo); 非 http(s) 只回 protocol; 無法解析 '(invalid-url)'
//  (原 maskQuery〔鍵名為 token 者遮罩, 其餘值原樣〕於 perm 修正輪 20261031023204 刪除: 其印出 req.query 之非 token 值與 D2 相衝, 改以 describeShape 只印鍵名, 見 ADR-047 與 unit-consoleNoValues)
//站點不變式(SITE-*)為 sgud/rule/rulebook.md「印權杖只經 maskLog」之可執行版: 靜態掃描 server/WWebPerm.mjs、srv.mjs 之可執行 console 呼叫,
//與 WWebPerm.mjs 之 JSDoc 範例、README.md 範例; 引數含權杖類識別字(token / tokenSelf / authorization / headers / referer)或 req.query
//而未經 maskTok / maskUrl 者即違規(後端 stdout 由測試 harness 丟棄, console 通道以此守護; 判準實作見 test/tools/srcScan.mjs)。
import assert from 'assert'
import path from 'path'
import { fileURLToPath } from 'url'
import { scanConsoleTokenArgs } from './tools/srcScan.mjs'


const projRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')


//M 契約測資(四 repo 同一組)
const CASES_TOK = [
    ['', ''],
    ['abc', '(len=3)'],
    ['abcdefg', '(len=7)'],
    ['abcdefgh', 'a...h(len=8)'],
    ['token-for-app', 't...p(len=13)'],
    ['abcdefghijklmnop', 'ab...op(len=16)'],
    ['0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b', '0199...4a5b(len=36)'],
    [['abcdefghijklmnop', 'x'], ['ab...op(len=16)', '(len=1)']],
    [{ a: 'SECRET' }, '(object)'],
    [12345, '(number)'],
    ['\nbcdefghijklmno\r', '?b...o?(len=16)'],
]


describe('unit-maskLog', function() {

    let maskTok = null
    let maskUrl = null

    before(async function() {
        let m = await import('../server/maskLog.mjs')
        maskTok = m.maskTok
        maskUrl = m.maskUrl
    })

    //M 契約測資全表
    it('MASK-001-maskTok-contract-table', function() {
        for (let [inp, exp] of CASES_TOK) {
            assert.strict.deepEqual(maskTok(inp), exp, `maskTok(${JSON.stringify(inp)})`)
        }
    })

    //空值與其他型別: 絕不輸出原值
    it('MASK-002-maskTok-empty-and-types', function() {
        assert.strict.equal(maskTok(undefined), '')
        assert.strict.equal(maskTok(null), '')
        assert.strict.equal(maskTok(true), '(boolean)')
        assert.strict.equal(maskTok(() => 'SECRET'), '(function)')
        assert.strict.deepEqual(maskTok([]), [])
        assert.strict.deepEqual(maskTok([12345, { a: 'SECRET' }, null]), ['(number)', '(object)', ''])
        //36 字元 session token 與 w-web-sso 現行格式相同(前 4 後 4)
        assert.strict.equal(maskTok('0123456789abcdef0123456789abcdef0123'), '0123...0123(len=36)')
        //長權杖露出上限 4 字
        assert.strict.equal(maskTok('x'.repeat(100)), 'xxxx...xxxx(len=100)')
        //控制字元含 \u007f 與 \u0000
        assert.strict.equal(maskTok('\u007f\u0000cdefghijklmn\u0000\u007f'), '??...??(len=16)')
    })

    //(MASK-003 原為 maskQuery, 隨 maskQuery 刪除而廢止保留編號; 形狀摘要之測試見 unit-consoleNoValues SHAPE-*)

    //maskUrl: 只留 origin + pathname
    it('MASK-004-maskUrl', function() {
        assert.strict.equal(maskUrl('http://127.0.0.1/?token=SYNTH-REF-SECRET-FOR-TEST'), 'http://127.0.0.1/')
        assert.strict.equal(maskUrl('http://127.0.0.1:18006/?view=x&token=SYNTH-PERM-R5'), 'http://127.0.0.1:18006/')
        assert.strict.equal(maskUrl('https://u:SYNTH-PW@h.example:8443/a/b?token=S#frag'), 'https://h.example:8443/a/b')
        assert.strict.equal(maskUrl('http://127.0.0.1:8090/#/?token=SYNTH-HASH'), 'http://127.0.0.1:8090/')
        assert.strict.equal(maskUrl('not a url SYNTH-X'), '(invalid-url)')
        assert.strict.equal(maskUrl(''), '')
        assert.strict.equal(maskUrl(undefined), '')
        assert.strict.equal(maskUrl(null), '')
        assert.strict.equal(maskUrl(12345), '(number)')
        assert.strict.equal(maskUrl({ href: 'http://h/?token=S' }), '(object)')
        assert.strict.deepEqual(maskUrl(['http://a.example/p?token=S', 'x']), ['http://a.example/p', '(invalid-url)'])
        //非 http(s): 路徑即全部內容, 只回 protocol(同 w-web-sso src/maskUrl.mjs)
        assert.strict.equal(maskUrl('data:text/plain,SYNTH-DATA-SECRET'), 'data:')
        assert.strict.equal(maskUrl('javascript:alert(SYNTH)'), 'javascript:')
    })

})


//—— 站點不變式: 靜態掃描(不需 server/maskLog.mjs 存在, 修正前即可獨立執行) ——
describe('unit-maskLog-sites', function() {

    //server/WWebPerm.mjs 之可執行 console 呼叫(修正前 22 處: getTokenUser / getAndVerifyAppUser / 四個 HTTP 入口 / verifyConn / getUserIdByToken)
    it('SITE-001-WWebPerm-console-token-args-masked', function() {
        let bad = scanConsoleTokenArgs(path.join(projRoot, 'server', 'WWebPerm.mjs'), 'code')
        assert.strict.deepEqual(bad, [], `未經遮罩之權杖 console 站點 ${bad.length} 處:\n${bad.join('\n')}`)
    })

    //server/syncCore.mjs(perm-run03: 外部匯入核心自 WWebPerm.mjs 移出; 無 console 呼叫, 日後新增者須遮罩權杖類引數; 同 SITE-001 判準)
    it('SITE-001b-syncCore-console-token-args-masked', function() {
        let bad = scanConsoleTokenArgs(path.join(projRoot, 'server', 'syncCore.mjs'), 'code')
        assert.strict.deepEqual(bad, [], `未經遮罩之權杖 console 站點 ${bad.length} 處:\n${bad.join('\n')}`)
    })

    //參考部署 srv.mjs(修正前 getUserByToken 之 'invalid token' 印出權杖值)
    it('SITE-002-srv-console-token-args-masked', function() {
        let bad = scanConsoleTokenArgs(path.join(projRoot, 'srv.mjs'), 'code')
        assert.strict.deepEqual(bad, [], `未經遮罩之權杖 console 站點 ${bad.length} 處:\n${bad.join('\n')}`)
    })

    //部署方會照抄之範例: WWebPerm.mjs JSDoc 與 README.md
    it('SITE-003-examples-do-not-print-token', function() {
        let bad = [
            ...scanConsoleTokenArgs(path.join(projRoot, 'server', 'WWebPerm.mjs'), 'doc'),
            ...scanConsoleTokenArgs(path.join(projRoot, 'README.md'), 'md'),
        ]
        assert.strict.deepEqual(bad, [], `範例印出權杖值 ${bad.length} 處:\n${bad.join('\n')}`)
    })

})
