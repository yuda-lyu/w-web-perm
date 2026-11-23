//輸出字樣探測(twp3, 排程第 609 項): 同一組輸入, 跑修前 src/plugins/mShare.mjs 之本地 nameOfErr 與 `(typeof ${typeof v})` 字面值(逐字照錄於下), 與 wsemi getDiagBriefErr／getDiagShape(v, { keys: false }), 逐列輸出對照(字樣改變表之來源)
//用法: node spec/evidence/twp3-20261124/probe-shape.mjs   (cwd 為 repo 根; 結果寫入本檔所在資料夾之 shape-diff.json)
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import util from 'util'
import JSON5 from 'json5'
import getDiagShape from 'wsemi/src/getDiagShape.mjs'
import getDiagBriefErr from 'wsemi/src/getDiagBriefErr.mjs'

const fdOut = path.dirname(fileURLToPath(import.meta.url))

//修前之本地實作(自 git show HEAD:src/plugins/mShare.mjs 逐字照錄)
let nameOfErrOld = (err) => {
    let n = null
    try {
        n = (err instanceof Error) ? err.name : null
    }
    catch (e) {
        n = null
    }
    return (typeof n === 'string' && /^\w{1,40}$/.test(n)) ? n : `(typeof ${typeof err})`
}
let typeOld = (v) => `(typeof ${typeof v})`

let show = (v) => util.inspect(v, { depth: 3, breakLength: Infinity })

//錯誤輸入
let revokedErr = (() => {
    let r = Proxy.revocable(new Error('x'), {})
    r.revoke()
    return r.proxy
})()
class MyErr extends Error {}
let json5Err = (() => {
    try {
        JSON5.parse('{oops')
    }
    catch (e) {
        return e
    }
    return null
})()
let errs = [
    ['Error', new Error('m')],
    ['TypeError', new TypeError('m')],
    ['RangeError', new RangeError('m')],
    ['SyntaxError(JSON5.parse 實際拋出)', json5Err],
    ['AggregateError', new AggregateError([], 'm')],
    ['自訂類別 class MyErr extends Error', new MyErr('m')],
    ['name 被設為識別字(ZZsecret9317)', Object.assign(new Error('m'), { name: 'ZZsecret9317' })],
    ['name 含連字號(ZZ-secret-9317)', Object.assign(new Error('m'), { name: 'ZZ-secret-9317' })],
    ['name 長 41 字', Object.assign(new Error('m'), { name: 'a'.repeat(41) })],
    ['name 長 40 字', Object.assign(new Error('m'), { name: 'a'.repeat(40) })],
    ['帶白名單代碼 code=ENOENT', Object.assign(new Error('m'), { code: 'ENOENT' })],
    ['帶白名單外代碼 code=ZZ_SECRET_9317', Object.assign(new Error('m'), { code: 'ZZ_SECRET_9317' })],
    ['DOMException(TimeoutError)', new DOMException('m', 'TimeoutError')],
    ['字串(如伺服端回傳之語系鍵)', 'saveWriteFail'],
    ['null', null],
    ['undefined', undefined],
    ['{ message }', { message: 'm' }],
    ['number', 42],
    ['Proxy(Error)', new Proxy(new Error('m'), {})],
    ['已撤銷之 Proxy', revokedErr],
]

//值輸入(授權字串 c 與其解析結果 kp 之位置)
let revokedObj = (() => {
    let r = Proxy.revocable({ a: 1 }, {})
    r.revoke()
    return r.proxy
})()
class Foo {
    constructor() {
        this.secretKey = 1
    }
}
let manyKeys = {}
for (let i = 0; i < 25; i++) {
    manyKeys[`k${i}`] = i
}
let vals = [
    ['字串', 'abc'],
    ['空字串', ''],
    ['number', 12],
    ['NaN', NaN],
    ['boolean', true],
    ['null', null],
    ['undefined', undefined],
    ['函式', () => 1],
    ['bigint', 10n],
    ['symbol', Symbol('s')],
    ['空陣列', []],
    ['陣列(3)', [1, 2, 3]],
    ['空物件', {}],
    ['物件(鍵為群組名 A、B)', { A: 'y', B: { mode: 'OR', isActive: 'y' } }],
    ['物件(25 鍵)', manyKeys],
    ['null-prototype 物件', Object.assign(Object.create(null), { A: 'y' })],
    ['類別實例', new Foo()],
    ['Map', new Map([['a', 1]])],
    ['Set', new Set([1])],
    ['Uint8Array(4)', new Uint8Array(4)],
    ['Date', new Date(0)],
    ['RegExp', /a/],
    ['Promise', Promise.resolve(1)],
    ['Proxy(物件)', new Proxy({ a: 1 }, {})],
    ['已撤銷之 Proxy', revokedObj],
]

let out = { errors: [], values: [] }
for (let [label, e] of errs) {
    let o = nameOfErrOld(e)
    let n = getDiagBriefErr(e)
    out.errors.push({ input: label, old: o, new: show(n) })
}
for (let [label, v] of vals) {
    out.values.push({ input: label, old: typeOld(v), new: getDiagShape(v, { keys: false }), newDefault: getDiagShape(v) })
}
fs.writeFileSync(path.join(fdOut, 'shape-diff.json'), JSON.stringify(out, null, 2), 'utf8')
for (let r of out.errors) {
    console.log(`[err] ${r.input}\t舊: ${r.old}\t新: ${r.new}`)
}
for (let r of out.values) {
    console.log(`[val] ${r.input}\t舊: ${r.old}\t新(keys:false): ${r.new}\t(預設: ${r.newDefault})`)
}
