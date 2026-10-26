//以 HEAD 版本統計「單獨之管理＋者」之前後文(判斷是否皆指系統管理者角色), 供報告〈完成條件 1〉之清單與理由
import { execFileSync } from 'child_process'

const SYS = '系統'
const ZE = '管理' + '者'
let files = execFileSync('git', ['ls-tree', '-r', '--name-only', '-z', 'HEAD'], { encoding: 'buffer', maxBuffer: 1 << 28 }).toString('utf8').split('\0').filter((s) => s)
let after = {}
let before = {}
let perTop = {}
let total = 0
let samples = {}
for (let f of files) {
    if (/^(db|node_modules|test\/pics)\//.test(f)) continue
    let b
    try { b = execFileSync('git', ['show', `HEAD:${f}`], { maxBuffer: 1 << 28 }) } catch (e) { continue }
    if (b.includes(0)) continue
    let s = b.toString('utf8')
    for (let m of s.matchAll(new RegExp(`(.{0,3})(?<!${SYS})${ZE}(.{0,4})`, 'g'))) {
        total++
        let top = f.startsWith('spec/evidence') ? 'spec/evidence' : f.split('/')[0]
        perTop[top] = (perTop[top] || 0) + 1
        let a = m[2].replace(/\s/g, ' ')
        after[a] = (after[a] || 0) + 1
        let p = m[1].slice(-2).replace(/\s/g, ' ')
        before[p] = (before[p] || 0) + 1
        if (!samples[m[1] + '[ZE]' + m[2]]) samples[m[1] + '[ZE]' + m[2]] = f
    }
}
console.log('總數', total, JSON.stringify(perTop))
let top = (o, n) => Object.entries(o).sort((x, y) => y[1] - x[1]).slice(0, n).map(([k, c]) => `${JSON.stringify(k)}×${c}`).join('  ')
console.log('後 4 字前 30:', top(after, 30))
console.log('前 2 字前 30:', top(before, 30))
