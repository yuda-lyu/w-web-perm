//unit-ormDiag 之子行程: ORM 建構(WOrm)拋出含連線憑證之錯誤時, WWebPerm 建構即拋(fail-fast, 不起服務); 觀察三個出口——拋出之 Error、console、srLog 檔(event WServOrm-init-error)
//用途: R-DIAG-01 D3「對外錯誤值不含憑證」於本套件之接線案——外來值(WOrm 建構拋出之值, 可能回顯連線字串)由 w-serv-orm 在其 catch 站點經 wsemi 之 diag.err 遮憑證後轉出,
//  本套件不持有秘密清單、不另包一層(單一擁有者在 w-serv-orm); 本子行程證明該值確實一路遮到本套件的三個出口.
//為何用子行程: srLog 之 pino transport 在行程結束時才釋放 log 檔, 同行程內測試資料夾在 Windows 上刪不掉(同 wwebpermInitChild.mjs).
//用法: node test/tools/ormDiagInitChild.mjs <paramsJson>  params: { url, password, logFd, port }
//輸出: 一行 'RESULT <json>', 為 { threw, name, msg, stack, consoleLines }
import util from 'util'
import WWebPerm from '../../server/WWebPerm.mjs'

let { url, password, logFd, port } = JSON.parse(process.argv[2])

//WOrmThrow: 建構即拋, 訊息回顯連線字串與密碼(模擬驅動把連線字串寫進錯誤訊息)
function WOrmThrow(opt) {
    throw new Error(`connect failed: ${opt.url} (password authentication failed, password=${password})`)
}

let fn = async () => ({})
let consoleLines = []
let ol = console.log
console.log = (...args) => {
    consoleLines.push(args.map((a) => util.inspect(a, { depth: 4 })).join(' '))
}
let r = { threw: false }
try {
    WWebPerm(WOrmThrow, url, 'wperm', fn, fn, fn, { serverPort: port, logFd })
}
catch (err) {
    r.threw = true
    r.name = (err && err.constructor && err.constructor.name) || ''
    r.msg = String(err && err.message)
    r.stack = String(err && err.stack)
}
console.log = ol
r.consoleLines = consoleLines
await new Promise((resolve) => setTimeout(resolve, 1500)) //srLog 之 transport 落檔
console.log('RESULT ' + JSON.stringify(r))
process.exit(r.threw ? 0 : 1) //未拋者可能已開啟服務, 強制結束
