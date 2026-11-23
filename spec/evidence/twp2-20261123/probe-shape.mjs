//探測: 舊本地 describeShape／describeErr(HEAD 鏡像) vs wsemi getDiagShape／getDiagBriefErr, 同一組輸入之輸出差異表(供報告「輸出字樣改變表」)
import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import getDiagShape from 'wsemi/src/getDiagShape.mjs'
import getDiagBriefErr from 'wsemi/src/getDiagBriefErr.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const old = await import(pathToFileURL(path.join(here, 'pre', 'src', 'js', 'describeShape.mjs')).href)

const SEC = 'ZZ-secret'
const revoked = Proxy.revocable({}, {})
revoked.revoke()
const evilKeys = new Proxy({}, { ownKeys() {
    throw new Error(SEC)
} })
const circ = { a: SEC }
circ.self = circ
const nullProto = Object.assign(Object.create(null), { token: SEC, userId: SEC })
const longKey = { ['x'.repeat(60)]: SEC }
const k35 = { ['y'.repeat(35)]: 1 }
const many = {}
for (let i = 0; i < 25; i++) {
    many[`k${i}`] = SEC
}
class Foo {
    constructor() {
        this.a = SEC
        this.b = SEC
    }
}
const cases = [
    ['null', null],
    ['undefined', undefined],
    ['string', SEC],
    ['empty string', ''],
    ['number', 123456789],
    ['NaN', NaN],
    ['boolean', true],
    ['function', () => SEC],
    ['bigint', 10n],
    ['symbol', Symbol(SEC)],
    ['array3', [SEC, { id: SEC }, SEC]],
    ['array0', []],
    ['object keys', { id: SEC, name: SEC, email: SEC }],
    ['empty object', {}],
    ['null-proto object', nullProto],
    ['class instance', new Foo()],
    ['circular', circ],
    ['key 60 chars', longKey],
    ['key 35 chars', k35],
    ['25 keys', many],
    ['ctl keys C0/DEL/C1/2028/202E', { ['a\nb']: 1, ['c\u0085d']: 1, ['e f']: 1, ['g‮h']: 1, ['i\u007fj']: 1 }],
    ['zero-width key (Cf)', { ['a​b']: 1, ['c﻿d']: 1, ['e­f']: 1 }],
    ['ownKeys throws (Proxy)', evilKeys],
    ['revoked Proxy', revoked.proxy],
    ['Map', new Map([['a', SEC]])],
    ['Set', new Set([SEC])],
    ['Uint8Array', new Uint8Array(4)],
    ['Date', new Date(0)],
    ['RegExp', /x/],
    ['Promise', Promise.resolve(SEC)],
    ['Error object', new Error(SEC)],
    ['boxed String', new String(SEC)], // eslint-disable-line no-new-wrappers
    ['WeakMap', new WeakMap()],
]
const rows = []
for (let [name, v] of cases) {
    let o = old.describeShape(v)
    let n = getDiagShape(v)
    rows.push({ name, old: o, new: n, same: o === n })
}

//錯誤摘要: 舊 describeErr(字串) vs getDiagBriefErr(物件)
const e3 = Object.assign(new Error(`open ${SEC}`), { code: 'ENOENT' })
const e4 = new Error('x')
e4.name = SEC
const badGet = new Proxy({}, { get() {
    throw new Error(SEC)
} })
const errCases = [
    ['Error', new Error(`parse failed ${SEC}`)],
    ['TypeError', new TypeError(`bad ${SEC}`)],
    ['Error + code ENOENT', e3],
    ['string(語系鍵)', SEC],
    ['null', null],
    ['undefined', undefined],
    ['{ message }', { message: SEC }],
    ['Error with name=SEC', e4],
    ['Proxy get throws', badGet],
    ['revoked Proxy', revoked.proxy],
    ['number', 42],
]
const errRows = []
for (let [name, v] of errCases) {
    let o = old.describeErr(v)
    let n = getDiagBriefErr(v)
    errRows.push({ name, old: o, new: JSON.stringify(n) })
}
fs.writeFileSync(path.join(here, 'shape-diff.json'), JSON.stringify({ rows, errRows }, null, 1))
for (let r of rows) {
    console.log(`${r.same ? '=' : '≠'} ${r.name.padEnd(32)} ${r.old}  →  ${r.new}`)
}
console.log('--- err ---')
for (let r of errRows) {
    console.log(`${r.name.padEnd(24)} ${r.old}  →  ${r.new}`)
}
