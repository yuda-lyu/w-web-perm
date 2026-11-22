//第 598 項實測: 修前碼(daddd01^, 以 strdelleft(authorization, 7) 取權杖)對各種 Authorization 前綴之連線閘行為
//做法: 起修前碼之後端(./tmp/twp1/old598, 埠 18598, 自有資料夾與 log), 以真 HTTP 直打資料通道 /api/main(同 test/tools/api-setup.mjs callRpcRaw),
//  依序送 Authorization = `<前綴><sys>`(sys 為系統管理者之開發 token), 記通過(回 success)或被拒(permission denied); 6 字元前綴與 7 字元前綴各數種.
//結束: 以 PID 樹狀停止自起之後端並回驗埠已釋放. 輸出每項一行 JSON(寫入證據檔由呼叫端導向).
import { spawn, execSync } from 'child_process'
import path from 'path'
import net from 'net'
import obj2u8arr from 'wsemi/src/obj2u8arr.mjs'
import u8arr2obj from 'wsemi/src/u8arr2obj.mjs'

const root = path.resolve('./tmp/twp1/old598')
const PORT = 18598
const base = `http://127.0.0.1:${PORT}`

let sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let portOpen = () => new Promise((resolve) => {
    let s = net.connect({ host: '127.0.0.1', port: PORT })
    s.on('connect', () => {
        s.destroy()
        resolve(true)
    })
    s.on('error', () => resolve(false))
})

let child = spawn(process.execPath, [path.join(root, 'srv.mjs'), './settings.json'], { cwd: root, stdio: 'ignore', windowsHide: true })
let pid = child.pid
let tEnd = Date.now() + 60000
while (!(await portOpen()) && Date.now() < tEnd) {
    await sleep(300)
}
if (!(await portOpen())) {
    console.log(JSON.stringify({ fatal: 'old backend not ready' }))
    execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore', windowsHide: true })
    process.exit(1)
}
await sleep(1500)

//getWebInfor 以標頭 Authorization 與本體 __sysToken__('sys') 呼叫: 通過連線閘者回 success, 被拒者回 permission denied
async function call(auth) {
    let payload = { func: 'getWebInfor', input: { __sysInputArgs__: [], __sysToken__: 'sys' } }
    let r = await fetch(`${base}/api/main`, { method: 'POST', headers: { 'Authorization': auth, 'Content-Type': 'application/octet-stream' }, body: Buffer.from(obj2u8arr(payload)) })
    let u8a = new Uint8Array(await r.arrayBuffer())
    let o = u8arr2obj(u8a)
    if (o && typeof o === 'object' && 'success' in o) {
        return 'pass'
    }
    return `denied(${String((o && o.error) || Buffer.from(u8a).toString('utf8').slice(0, 40))})`
}

//前綴長度含空白: 'Basic '、'Token ' 為 6 字元; 'Digest '、'Bearer\t'、7 個任意字元為 7 字元; 'Bearer '(7 字元)為對照
let cases = [
    ['Bearer sys', 7, 'control: Bearer'],
    ['Basic sys', 6, '6 字元前綴(Basic )'],
    ['Token sys', 6, '6 字元前綴(Token )'],
    ['ABCDE sys', 6, '6 字元任意前綴'],
    ['Digest sys', 7, '7 字元前綴(Digest )'],
    ['Bearer\tsys', 7, '7 字元前綴(Bearer + Tab)'],
    ['XXXXXXXsys', 7, '7 字元任意前綴(無空白)'],
    ['Bearer  sys', 8, '8 字元前綴(Bearer 兩個空白: 截 7 後得 " sys")'],
    ['sys', 0, '無前綴(裸權杖)'],
]
let rows = []
try {
    for (let [auth, n, note] of cases) {
        let r = await call(auth)
        rows.push({ auth, prefixLen: n, note, result: r })
        console.log(JSON.stringify({ auth, prefixLen: n, note, result: r }))
    }
}
finally {
    execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore', windowsHide: true })
    await sleep(1500)
    console.log(JSON.stringify({ stopped: pid, portStillOpen: await portOpen() }))
}
process.exit(0)
