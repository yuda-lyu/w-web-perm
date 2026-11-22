//第 301 項最小重現(子行程): 對單一 timeLength 候選值呼叫 genPlan, 印結果; 若無窮迴圈由父行程逾時終止
//用法: node repro301-child.mjs <候選名> <模組相對路徑>
import path from 'path'
import { pathToFileURL } from 'url'

let cands = {
    'str7': () => '7',
    'strAbc': () => 'abc',
    'strEmpty': () => '',
    'NaN': () => NaN,
    'neg1': () => -1,
    'negHuge': () => -1e9,
    'Infinity': () => Infinity,
    'negInfinity': () => -Infinity,
    'obj': () => ({}),
    'arr': () => [],
    'nul': () => null,
    'undef': () => undefined,
    'true': () => true,
    'float1.5': () => 1.5,
    'zero': () => 0,
    'int7': () => 7,
    'huge1e20': () => 1e20,
    'big3650': () => 3650,
    'big3651': () => 3651,
    'big100000': () => 100000,
}

let name = process.argv[2]
let modRel = process.argv[3]
let mod = await import(pathToFileURL(path.resolve(modRel)).href)
let v = cands[name]()
try {
    let t0 = Date.now()
    let p = mod.genPlan(v, 'hr', { fdLog: './tmp/twp1/emptylogs', timeNow: Date.UTC(2026, 10, 23, 0, 0, 0) })
    console.log(JSON.stringify({ name, ok: true, nKp: p.kpTime.length, ms: Date.now() - t0 }))
}
catch (err) {
    console.log(JSON.stringify({ name, ok: false, err: String(err && err.message || err) }))
}
