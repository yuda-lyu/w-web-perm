//unit-wwebperm-init 之子行程: 於獨立行程建構 WWebPerm(只走「建構即拋」之路徑), 行程結束時 srLog 之 pino transport 隨之關閉,
//測試資料夾(test/_tmp/unit-wwebperm-init)才刪得掉——同行程建構時 transport 持有 log 檔至行程結束, Windows 上刪除會失敗而殘留.
//用法: node test/tools/wwebpermInitChild.mjs <casesJson>  cases: [{ k, v, url, logFd }], v 為 '__fn__' 時代入函數
//輸出: 一行 'RESULT <json>', 各案 { k, threw, msg, dbExists }
import fs from 'fs'
import WOrm from 'w-orm-lmdb/src/WOrmLmdb.mjs'
import WWebPerm from '../../server/WWebPerm.mjs'

let cases = JSON.parse(process.argv[2])
let fn = async () => ({})
let out = []
for (let c of cases) {
    let v = c.v === '__fn__' ? async () => ({ id: 'x' }) : c.v
    let r = { k: c.k }
    try {
        WWebPerm(WOrm, c.url, 'wperm', fn, fn, fn, { [c.k]: v, serverPort: 8549, logFd: c.logFd })
        r.threw = false
    }
    catch (err) {
        r.threw = true
        r.msg = err.message
    }
    r.dbExists = fs.existsSync(c.url)
    out.push(r)
}
console.log('RESULT ' + JSON.stringify(out))
if (out.some((r) => !r.threw)) {
    process.exit(1) //未拋者可能已開啟服務, 強制結束
}
