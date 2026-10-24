//變異驗證: 暫時改寫一個原始碼檔(整串字面取代, 必須恰命中 1 處), 執行指定測試指令, 無論結果必還原; 輸出一行 JSON { id, desc, caught, exit, failing }。
//用法: node mutate.mjs <id> "<說明>" <檔(相對 repo 根)> "<原字串>" "<新字串>" -- <測試指令...>
//caught = 測試離開碼非 0(變異被抓到)。還原後以內容雜湊核對與變異前相同。
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { spawnSync } from 'child_process'

let argv = process.argv.slice(2)
let iSep = argv.indexOf('--')
let [id, desc, file, from, to] = argv.slice(0, iSep)
let cmd = argv.slice(iSep + 1)
let fp = path.resolve(file)
let orig = fs.readFileSync(fp, 'utf8')
let sha = (s) => crypto.createHash('sha1').update(s).digest('hex')
let h0 = sha(orig)
let n = orig.split(from).length - 1
if (n !== 1) {
    console.log(JSON.stringify({ id, error: `原字串須恰命中 1 處, 實得 ${n}` }))
    process.exit(2)
}
let restore = () => {
    fs.writeFileSync(fp, orig, 'utf8')
}
process.on('SIGINT', () => { restore(); process.exit(130) })
let result = null
try {
    fs.writeFileSync(fp, orig.replace(from, () => to), 'utf8')
    let r = spawnSync('node', ['C:/opensrcOper/tools/quiet-run.mjs', '--lock', '--name', `mut-${id}`, '--timeout', '900', '--', ...cmd], { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 })
    let out = (r.stdout || '') + (r.stderr || '')
    let m = out.match(/(\d+) failing/)
    let p = out.match(/(\d+) passing/)
    result = { id, desc, caught: r.status !== 0, exit: r.status, failing: m ? Number(m[1]) : 0, passing: p ? Number(p[1]) : 0 }
}
finally {
    restore()
}
let h1 = sha(fs.readFileSync(fp, 'utf8'))
result.restored = h0 === h1
console.log(JSON.stringify(result))
