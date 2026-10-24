//hapi 路由失敗結果之收斂(perm-run01 本輪; 規則帳本 R-ROUTE-MSG-01; 外審 sol#5 「hapi 路由失敗時回 ORM 原文」)
//受測: server/routeResult.mjs(createRouteResult)
//述語(RR-*): 路由以 pm2resolve 包裝核心, 失敗為 { state:'error', msg: 拒絕值 }; 拒絕值(Error 取 message)為已知語系鍵者原樣回傳; 其餘(ORM／I/O 原文、非鍵字串、非字串)一律改回 anUnexpectedErrorOccurred,
//  原文只入 srLog(event 為路由之 -error、msg 為固定鍵、raw 為原文前 500 字); 成功與取消結果原樣回傳.
//跑法: npx mocha test/unit-routeResult.test.mjs --reporter list --timeout 30000
import assert from 'assert'
import createRouteResult from '../server/routeResult.mjs'
import procLang from '../server/procLang.mjs'

const A = assert.strict

let mk = () => {
    let logs = []
    let srLog = { error: (o) => logs.push(o) }
    return { logs, rr: createRouteResult({ srLog }) }
}


describe('unit-routeResult (hapi 路由失敗結果之收斂, perm-run01 R-ROUTE-MSG-01)', function() {

    it('RR-001 已知語系鍵(字串或 Error.message)原樣回傳, 不記 srLog  [前端與外部應用以鍵顯示文字; 修前亦如此]', function() {
        let keys = Object.keys(procLang({}).eng)
        A.ok(keys.length > 100)
        for (let k of ['tokenNoPermission', 'userNotAdmin', 'userNoPermission', 'cannotFindUserFromToken', 'ambiguousUserFromPerm', 'invalidKeyTable', 'saveWriteFail', 'anUnexpectedErrorOccurred']) {
            A.ok(keys.includes(k), `前提: ${k} 為語系鍵`)
            let { logs, rr } = mk()
            let r1 = rr({ state: 'error', msg: k }, 'api/x-error')
            A.deepEqual(r1, { state: 'error', msg: k })
            let r2 = rr({ state: 'error', msg: new Error(k) }, 'api/x-error')
            A.deepEqual(r2, { state: 'error', msg: k }, 'Error.message 為鍵者取其 message')
            A.deepEqual(logs, [], '已知鍵不記 srLog')
        }
    })

    it('RR-002 ORM／I/O 原文(Error 或字串)一律改回 anUnexpectedErrorOccurred, 原文只入 srLog  [修前: r.msg = r.msg.message 回原文]', function() {
        let raws = ['MDB_NOTFOUND: No matching key/data pair found', 'ENOENT: no such file or directory, open \'C:\\secret\\db\\data.mdb\'', 'Cannot read properties of undefined (reading \'id\')', 'some raw string']
        for (let raw of raws) {
            for (let msg of [new Error(raw), new TypeError(raw), raw]) {
                let { logs, rr } = mk()
                let r = rr({ state: 'error', msg }, 'api/getPerm-error')
                A.deepEqual(r, { state: 'error', msg: 'anUnexpectedErrorOccurred' }, `原文不得回給呼叫者: ${raw}`)
                A.ok(!JSON.stringify(r).includes(raw.slice(0, 12)))
                A.equal(logs.length, 1)
                A.equal(logs[0].event, 'api/getPerm-error')
                A.equal(logs[0].msg, 'anUnexpectedErrorOccurred')
                A.equal(logs[0].raw, raw, '原文入 srLog')
            }
        }
    })

    it('RR-003 非字串拒絕值(物件、數字、null、undefined)一律固定鍵; 原文轉字串入 srLog, 前 500 字', function() {
        for (let msg of [{ code: 7, secret: 's3' }, 42, null, undefined, ['a'], true]) {
            let { logs, rr } = mk()
            let r = rr({ state: 'error', msg }, 'api/syncAndReplaceTabs-error')
            A.equal(r.msg, 'anUnexpectedErrorOccurred')
            A.equal(logs.length, 1)
            A.equal(typeof logs[0].raw, 'string')
        }
        let { logs, rr } = mk()
        rr({ state: 'error', msg: new Error('x'.repeat(2000)) }, 'e')
        A.equal(logs[0].raw.length, 500, 'raw 截為前 500 字')
    })

    it('RR-004 成功與取消結果原樣回傳(同一物件)、不記 srLog; 非物件輸入原樣回傳', function() {
        let { logs, rr } = mk()
        let ok = { state: 'success', msg: { user: { id: 'u1' } } }
        A.equal(rr(ok, 'e'), ok)
        let cancelled = { state: 'cancelled', msg: '' }
        A.equal(rr(cancelled, 'e'), cancelled)
        A.equal(rr(null, 'e'), null)
        A.equal(rr(undefined, 'e'), undefined)
        A.equal(rr('x', 'e'), 'x')
        A.deepEqual(logs, [])
    })

    it('RR-006 診斷字串化本身拋錯(null 原型物件、toString 非函數、會拋錯之 toString)時仍回固定鍵, srLog 記 [unprintable]  [外審 sol F08]', function() {
        let nullProto = Object.create(null)
        let badToString = { toString: 0 }
        let throwingToString = { toString() { throw new Error('boom') } }
        for (let msg of [nullProto, badToString, throwingToString]) {
            let { logs, rr } = mk()
            let r = rr({ state: 'error', msg }, 'api/getPerm-error')
            A.deepEqual(r, { state: 'error', msg: 'anUnexpectedErrorOccurred' })
            A.equal(logs.length, 1)
            A.equal(logs[0].raw, '[unprintable]')
        }
    })

    it('RR-005 語系鍵集合自 procLang 動態取得(新增鍵即生效); 固定鍵本身為語系鍵且 eng／cht 皆有文字', function() {
        let lang = procLang({})
        A.ok(typeof lang.eng.anUnexpectedErrorOccurred === 'string' && lang.eng.anUnexpectedErrorOccurred.length > 0)
        A.ok(typeof lang.cht.anUnexpectedErrorOccurred === 'string' && lang.cht.anUnexpectedErrorOccurred.length > 0)
        //procLang 之每個鍵(含日後新增者)皆原樣通過 routeResult(外審 sol: 原本只驗 fallback 鍵文字而未呼叫 routeResult)
        let { logs, rr } = mk()
        let keys = Object.keys(lang.eng)
        for (let k of keys) {
            A.deepEqual(rr({ state: 'error', msg: k }, 'e'), { state: 'error', msg: k }, k)
        }
        A.deepEqual(logs, [])
        A.ok(keys.length > 100)
    })
})
