//api-consoleNoValues 之子行程: 以真 WWebPerm(真 w-serv-orm、真 w-serv-hapi／webdata、真 srLog 落檔)起一個獨立後端, 其行程標準輸出與標準錯誤由測試收集,
//供測試以「同一組含識別值之測資(置於使用者物件、請求本體、查詢參數)」經真 HTTP 觸發各 console 站點, 斷言輸出不含該值(規則帳本 R-CONSOLE-NOVAL-01; dspec〈診斷輸出與遮罩〉D2、〈輸入參數之檢測機制〉V20).
//測資(識別值 sec 由測試給, 如 ZZ-secret-9317):
//  getUserByToken(token → 外部使用者物件): tok-noid／tok-noemail／tok-noname／tok-badrole 各缺一必要欄位或欄位非法(checkUser 之四個分支, 值皆含 sec);
//    tok-notinperm(欄位齊備但不在 perm users 表 → getTokenUser 之 cannotGetUserFromPerm 分支);
//    tok-zz(對應 perm 列 id-zz, 其 name 為 sec; 部署方 verifyClientUser／verifyAppUser 對 name 為 sec 者回 false → getAndVerify* 之 userNoPermission 分支, 印出之 user 即含 sec);
//    tok-zz2(對應 perm 列 id-zz2, 其 cgrups 為 sec 本身〔非合法 JSON5〕→ getUserRules 之 JSON5.parse 失敗分支);
//    'sys' 為種子之系統管理者 id-for-admin(送請求用).
//  ORM 縫: 標記檔 targets.poison 存在時, targets.select 回傳一列其 id 存取器拋出含 sec 之 Error(模擬權限樹評估時之例外 → getGenUserAndRulesByUserId 之 catch 分支).
//用法: node test/tools/consoleNoValuesChild.mjs <paramsJson>  params: { dir, logFd, port, faultDir, sec }
//輸出: 種子完成後建構後端, 輸出一行 'READY'; 行程由測試殺掉(taskkill /T), 資料夾由測試刪
import fs from 'fs'
import path from 'path'
import WOrmLmdb from 'w-orm-lmdb/src/WOrmLmdb.mjs'
import WServOrm from 'w-serv-orm/src/WServOrm.mjs'
import genTestData from 'w-serv-orm/src/genTestData.mjs'
import ds from '../../src/schema/index.mjs'
import WWebPerm from '../../server/WWebPerm.mjs'

let { dir, logFd, port, faultDir, sec } = JSON.parse(process.argv[2])

//種子: 與 g_initialTestData 同(genTestData; 含 id-for-admin 之系統管理者列), 另加兩列含識別值之 perm 使用者
let so = WServOrm(ds, WOrmLmdb, dir, 'wperm')
await genTestData(ds, so.woItems, { bLog: false })
let mkUser = (o) => {
    let v = ds.users.funNew({ userId: 'id-for-admin', order: 9000, name: 'zz', email: 'zz@example.com', from: '', cgrups: '', ...o })
    v.id = o.id
    v.isAdmin = 'y'
    return v
}
await so.woItems.users.save([
    mkUser({ id: 'id-zz', name: sec, email: 'zz@example.com', order: 9001 }),
    mkUser({ id: 'id-zz2', name: 'zz2', email: 'zz2@example.com', order: 9002, cgrups: sec }),
])
await so.closeAll()

//WOrmFault: 與 WOrmLmdb 同(資料庫實際開在 dir), 唯 targets.select 依標記檔回傳含毒列
function WOrmFault(opt) {
    let ee = WOrmLmdb({ ...opt, url: dir })
    if (opt.cl === 'targets') {
        let selOrg = ee.select
        ee.select = async (...a) => {
            if (fs.existsSync(path.join(faultDir, 'targets.poison'))) {
                let row = {}
                Object.defineProperty(row, 'id', {
                    enumerable: true,
                    get() {
                        throw new Error(`poison row read failed: ${sec}`)
                    },
                })
                return [row]
            }
            return await selOrg.apply(ee, a)
        }
    }
    return ee
}

let users = {
    'sys': { id: 'id-for-admin', name: 'admin', email: 'admin@example.com', isAdmin: 'y' },
    'tok-noid': { name: sec, email: `${sec}@example.com`, isAdmin: 'y' },
    'tok-noemail': { id: sec, name: sec, isAdmin: 'y' },
    'tok-noname': { id: sec, email: `${sec}@example.com`, isAdmin: 'y' },
    'tok-badrole': { id: sec, name: sec, email: `${sec}@example.com`, isAdmin: sec },
    'tok-notinperm': { id: sec, name: sec, email: `${sec}@example.com`, isAdmin: 'y' },
    'tok-zz': { id: 'id-zz', name: sec, email: 'zz@example.com', isAdmin: 'y' },
    'tok-zz2': { id: 'id-zz2', name: 'zz2', email: 'zz2@example.com', isAdmin: 'y' },
}
let getUserByToken = async (token) => {
    return Object.prototype.hasOwnProperty.call(users, token) ? { ...users[token] } : {}
}
//name 為 sec 者否決(使 getAndVerifyClientUser／getAndVerifyAppUser 走 userNoPermission 分支); 其餘放行
let verify = async (user) => user.name !== sec

WWebPerm(WOrmFault, dir, 'wperm', getUserByToken, verify, verify, { serverPort: port, logFd })
console.log('READY')
