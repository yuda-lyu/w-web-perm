//資料驅動之名稱轉屬性鍵(規則帳本 R-KEY-PROP-01, ADR-032; 來源: run02 設計一致性盤查 F-25)
//
//外部應用可直接寫入陣列形式授權資料, 元素 name 為任意 JSON 值; 評估器與編輯器以 name 當屬性鍵(obj[name] = …)時, 屬性鍵轉型對
//「toString 被覆寫成非函數之物件」等值會拋 TypeError(整個權限查詢因此失敗). getPropKey 與屬性鍵轉型取同一個 ToString, 轉不了回 null 讓呼叫端略過.
//
//跑法: npx mocha test/unit-getPropKey.test.mjs --timeout 30000
import assert from 'assert'
import getPropKey from '../src/js/getPropKey.mjs'


//JSON 可產生之 name 值(含轉型成功者與轉型必拋者)
const OK = [
    ['T1', 'T1'],
    ['', ''],
    [5, '5'],
    [0, '0'],
    [-1.5, '-1.5'],
    [true, 'true'],
    [false, 'false'],
    [null, 'null'],
    [undefined, 'undefined'],
    [['T1'], 'T1'],
    [[], ''],
    [['a', 'b'], 'a,b'],
    [[[1, 2], 3], '1,2,3'],
    [{}, '[object Object]'],
    [{ a: 1 }, '[object Object]'],
]
const THROW = [
    { toString: 'x' },
    { toString: null },
    { toString: 5 },
    { toString: {} },
    { toString: [] },
    [{ toString: null }],
    [[{ toString: 1 }]],
    { valueOf: null, toString: null },
]


describe('getPropKey (名稱 → 屬性鍵字串; 轉不了回 null)', function() {

    it('KP-001-可轉者回字串, 與 `Object.keys({ [name]: 1 })[0]`(屬性鍵轉型)逐項相同(字串／數字／布林／null／陣列／一般物件)', function() {
        for (let [name, exp] of OK) {
            let viaKey = Object.keys({ [name]: 1 })[0]
            assert.strictEqual(viaKey, exp, `前提: 屬性鍵轉型 ${JSON.stringify(name)} → ${JSON.stringify(exp)}`)
            assert.strictEqual(getPropKey(name), exp, `getPropKey(${JSON.stringify(name)})`)
        }
    })

    it('KP-002-屬性鍵轉型會拋 TypeError 者(toString 被覆寫成非函數之物件、含巢狀於陣列內) — getPropKey 回 null、不拋錯', function() {
        for (let name of THROW) {
            assert.throws(() => ({ [name]: 1 }), TypeError, `前提: 屬性鍵轉型 ${JSON.stringify(name)} 會拋 TypeError(此即修前 mergeRules 拋出之例外)`)
            assert.strictEqual(getPropKey(name), null, `getPropKey(${JSON.stringify(name)})`)
        }
    })

    it('KP-003-JSON5.parse 實際可產生的 name(含 { "toString": null })經 getPropKey 的行為: 可轉者為字串、不可轉者為 null', async function() {
        let JSON5 = (await import('json5')).default
        let arr = JSON5.parse('[{"name":"T","isActive":"y"},{"name":{"toString":null},"isActive":"y"},{"name":5,"isActive":"y"},{"name":["T2"]}]')
        assert.deepStrictEqual(arr.map((v) => getPropKey(v.name)), ['T', null, '5', 'T2'])
    })

    it('KP-004-轉型時若 toString 自行拋錯 — 同樣回 null(不論拋出的是什麼)', function() {
        let bad = { toString() { throw new Error('boom') } }
        assert.strictEqual(getPropKey(bad), null)
        let bad2 = { toString() { throw 'str' } }
        assert.strictEqual(getPropKey(bad2), null)
    })

    it('KP-005-Symbol(JSON 不會產生; 屬性鍵轉型可用並建立 symbol 鍵〔不被 Object.keys／eachOwn 走訪〕, 但轉字串必拋)回 null、不拋錯——與屬性鍵轉型在此唯一不等價, 效果相同(該元素不對應任何字串名稱之標的／規則)', function() {
        assert.strictEqual(getPropKey(Symbol('x')), null)
    })

    it('KP-006-回傳值型別恆為 string 或 null', function() {
        for (let name of [...OK.map((v) => v[0]), ...THROW]) {
            let r = getPropKey(name)
            assert.ok(r === null || typeof r === 'string')
        }
    })

})
