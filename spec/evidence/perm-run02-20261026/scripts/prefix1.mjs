//K2(單獨舊稱)與 K3(單獨管理＋者)之「前 1 字」與「前 2 字」統計, 找可能構成其他角色複合詞者(資料庫／網站／專案／內容…)
import fs from 'fs'
import { execFileSync } from 'child_process'

const SYS = '系統'
const OLD = '管理' + '員'
const ZE = '管理' + '者'
let files = execFileSync('git', ['ls-files', '-z'], { encoding: 'buffer', maxBuffer: 1 << 28 }).toString('utf8').split('\0').filter((s) => s)
let p1 = {}
let p2 = {}
let ex = {}
for (let f of files) {
    if (/^(db|node_modules|test\/pics)\//.test(f)) continue
    let b
    try { b = fs.readFileSync(f) } catch (e) { continue }
    if (b.includes(0)) continue
    let s = b.toString('utf8')
    for (let [tag, re] of [['K2', new RegExp(`(.{0,2})(?<!${SYS})${OLD}`, 'g')], ['K3', new RegExp(`(.{0,2})(?<!${SYS})${ZE}`, 'g')]]) {
        for (let m of s.matchAll(re)) {
            let pre = m[1]
            let c1 = pre.slice(-1)
            let c2 = pre.slice(-2)
            //只看前一字為漢字者(複合詞候選)
            if (/\p{Script=Han}/u.test(c1)) {
                let k = tag + ':' + c1
                p1[k] = (p1[k] || 0) + 1
                let k2 = tag + ':' + c2
                p2[k2] = (p2[k2] || 0) + 1
                if (!ex[k]) ex[k] = f
            }
        }
    }
}
let top = Object.entries(p1).sort((a, b) => b[1] - a[1])
console.log('前 1 字為漢字者(依次數):')
console.log(top.map(([k, n]) => `${k}×${n}`).join('  '))
