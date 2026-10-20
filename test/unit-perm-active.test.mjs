//外部應用 SDK src/perm.mjs 之 active(name) 查值(規則帳本 R-AUTH-PATH-01; 外審 sol#5 同型站點 src/perm.mjs:118)
//
//perm().conn(url) 取得 { user, rules } 後, active(name) 依 rules 之 isActive 判定單一標的是否被授權(只有 'y' 為 y, 其餘一律 n).
//修前以 lodash get(_kpRule, key, '') 取值: 只授權 A 時 active('A.0')、active('A[0]') 得 y(字串索引); 規則名 __proto__ 因一般物件容器忽略字串指派而無法授權.
//以 node 內建 http 起本機臨時伺服器回傳指定 rules, 不依賴專案後端(純單元層).
//跑法: npx mocha --no-parallel test/unit-perm-active.test.mjs --timeout 60000
import assert from 'assert'
import http from 'http'
import perm from '../src/perm.mjs'


let server = null
let base = ''
let rulesNow = []

function startServer() {
    return new Promise((resolve) => {
        server = http.createServer((req, res) => {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ state: 'success', msg: { user: { id: 'u1' }, rules: rulesNow } }))
        })
        server.listen(0, '127.0.0.1', () => {
            base = `http://127.0.0.1:${server.address().port}`
            resolve()
        })
    })
}

//connect: 以指定 rules 連線並回傳 perm 實例
async function connect(rules) {
    rulesNow = rules
    let p = perm()
    await p.conn(`${base}/getPerm?token=tk`)
    return p
}


describe('unit-perm-active (R-AUTH-PATH-01)', function() {
    this.timeout(30000)

    before(async function() {
        await startServer()
    })

    after(function(done) {
        server.close(() => done())
    })

    it('PA-001 只授權 A: active(A.0)、active(A[0])、active(A.length)、active(A.1) 皆 n(修前 A.0、A[0] 為 y); 未授權與未知標的 n', async function() {
        let p = await connect([{ name: 'A', isActive: 'y' }, { name: 'B', isActive: 'n' }])
        assert.strict.equal(p.active('A'), 'y')
        for (let k of ['A.0', 'A[0]', 'A.length', 'A.1', 'A.x', 'B', 'Z']) {
            assert.strict.equal(p.active(k), 'n', k)
        }
    })

    //迴歸保護(修前亦綠: 修前 get 取到繼承屬性但非 'y' 已正規化為 n)
    it('PA-002 原型鍵名: 未授權之 constructor、toString、__proto__、hasOwnProperty、valueOf 皆 n(不取繼承屬性)', async function() {
        let p = await connect([{ name: 'A', isActive: 'y' }])
        for (let k of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf']) {
            assert.strict.equal(p.active(k), 'n', k)
        }
    })

    it('PA-003 精確授權: 規則名含 . 或 [ 、或為原型鍵名(含 __proto__)時, 該標的為 y, 其近似名仍 n', async function() {
        let p = await connect([
            { name: 'exact.dot', isActive: 'y' },
            { name: 'weird[0]', isActive: 'y' },
            { name: 'constructor', isActive: 'y' },
            { name: '__proto__', isActive: 'y' },
            { name: 'off', isActive: 'n' },
            { name: 'odd', isActive: 'maybe' },
        ])
        for (let k of ['exact.dot', 'weird[0]', 'constructor', '__proto__']) {
            assert.strict.equal(p.active(k), 'y', k)
        }
        for (let k of ['exact', 'exact.dot.x', 'weird', 'weird.0', 'toString', 'off', 'odd']) {
            assert.strict.equal(p.active(k), 'n', k)
        }
    })

    it('PA-004 getKpRule() 對外型別不變: 一般物件(原型為 Object.prototype), 鍵為各規則名、值為 y／n; __proto__ 規則為自有屬性', async function() {
        let p = await connect([{ name: 'A', isActive: 'y' }, { name: '__proto__', isActive: 'y' }, { name: 'B', isActive: 'x' }])
        let kp = p.getKpRule()
        assert.strict.equal(Object.getPrototypeOf(kp), Object.prototype)
        assert.strict.equal(typeof kp.hasOwnProperty, 'function', '外部應用慣用 kp.hasOwnProperty(…)')
        assert.strict.deepEqual(Object.keys(kp), ['A', '__proto__', 'B'])
        assert.strict.equal(Object.getOwnPropertyDescriptor(kp, '__proto__').value, 'y')
        assert.strict.equal(kp.A, 'y')
        assert.strict.equal(kp.B, 'n', '非 y 一律正規化為 n')
    })

    //迴歸保護(修前亦綠)
    it('PA-005 未連線(尚未 conn)時 active 回 n; rules 空陣列時皆 n', async function() {
        assert.strict.equal(perm().active('A'), 'n')
        let p = await connect([])
        assert.strict.equal(p.active('A'), 'n')
    })

    //外審 minimax#2: 規則名恰為 hasOwnProperty／toString 時, _kpRule(一般物件)上的自有屬性會遮蔽 Object.prototype 同名方法——此為修前即有之限制(以一般指派亦然),
    //getKpRule() 回傳物件上的 kp.hasOwnProperty(…)、String(kp) 因而不可用; active() 以 Object.prototype.hasOwnProperty.call 取值, 不受遮蔽影響, 仍須正確
    it('PA-006 規則名為 hasOwnProperty／toString／valueOf: active() 仍依其值判定(不受自有屬性遮蔽同名方法影響); 近似名 n', async function() {
        let p = await connect([{ name: 'hasOwnProperty', isActive: 'y' }, { name: 'toString', isActive: 'n' }, { name: 'valueOf', isActive: 'y' }, { name: 'A', isActive: 'y' }])
        assert.strict.deepEqual(['hasOwnProperty', 'toString', 'valueOf', 'A', 'isPrototypeOf'].map((k) => p.active(k)), ['y', 'n', 'y', 'y', 'n'])
    })

})
