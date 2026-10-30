//api-consoleNoValues 之子行程(建構期站點): 以含識別值之建構參數呼叫 WWebPerm, 收集行程之 console 輸出(規則帳本 R-CONSOLE-NOVAL-01; dspec〈輸入參數之檢測機制〉V20「訊息與 throw 前之 console 不含輸入值」)
//場景:
//  bad-url     url 為含密碼之設定物件(識別值在 password 之值) → 'invalid url' 之 console 只印型別
//  bad-fun     getUserByToken 為含識別值之字串(非函數) → 'invalid getUserByToken' 只印型別
//  bad-orm     WOrm 建構時拋出之 Error 訊息含識別值(非連線憑證, 故 w-serv-orm 之憑證遮罩管不到) → WServOrm 初始化失敗之 console 只印錯誤類別
//用法: node test/tools/consoleNoValuesInitChild.mjs <paramsJson>  params: { scenario, sec, logFd, port }
//輸出: 一行 'RESULT <json>', 為 { threw, msg, consoleLines }(consoleLines 為以 util.inspect 展開後之各行, 與行程標準輸出所見同)
import util from 'util'
import WWebPerm from '../../server/WWebPerm.mjs'

let { scenario, sec, logFd, port } = JSON.parse(process.argv[2])

let fn = async () => ({})
function WOrmOk() {
    return {}
}
function WOrmThrow() {
    throw new Error(`engine init failed near ${sec}`)
}

let args = {
    'bad-url': () => [WOrmOk, { host: 'h.example', user: 'u', password: sec }, 'wperm', fn, fn, fn],
    'bad-fun': () => [WOrmOk, './db', 'wperm', `${sec}`, fn, fn],
    'bad-orm': () => [WOrmThrow, './db', 'wperm', fn, fn, fn],
}[scenario]()

let consoleLines = []
let ol = console.log
console.log = (...a) => {
    consoleLines.push(a.map((x) => util.inspect(x, { depth: 4 })).join(' '))
}
let r = { threw: false }
try {
    WWebPerm(...args, { serverPort: port, logFd })
}
catch (err) {
    r.threw = true
    r.msg = String(err && err.message)
}
console.log = ol
r.consoleLines = consoleLines
await new Promise((resolve) => setTimeout(resolve, 1500)) //srLog 之 transport 落檔
console.log('RESULT ' + JSON.stringify(r))
process.exit(r.threw ? 0 : 1)
