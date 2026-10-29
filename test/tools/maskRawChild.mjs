//api-maskRaw 之子行程: 以真 WWebPerm(真 w-serv-orm、真 w-serv-webdata、真 srLog 落檔)起一個獨立後端, 其連線字串參數為含帳密之網址(url, 資料庫實際仍開在 dir 之 w-orm-lmdb),
//ORM 層(WOrm)之 select 依 faultDir 下之標記檔注入故障: 錯誤原文回顯連線字串與裸密碼(模擬驅動訊息回顯連線字串), 供測試經真 HTTP 觸發本套件直接呼叫 woItems 之各 srLog raw 站點(規則帳本 R-ORM-DIAG-02).
//標記檔(存在即故障; 測試建立與刪除): <表名>.select(該表之 select 一律失敗)、targets.select-after-write(targets 表於子行程內已有寫入之後之 select 失敗; 供讀回站點)
//用法: node test/tools/maskRawChild.mjs <paramsJson>  params: { dir, logFd, port, faultDir, url, pw }
//輸出: 種子完成後建構後端, 輸出一行 'READY'; 行程由測試殺掉(taskkill /T), 資料夾由測試刪
import fs from 'fs'
import path from 'path'
import WOrmLmdb from 'w-orm-lmdb/src/WOrmLmdb.mjs'
import WServOrm from 'w-serv-orm/src/WServOrm.mjs'
import genTestData from 'w-serv-orm/src/genTestData.mjs'
import ds from '../../src/schema/index.mjs'
import WWebPerm from '../../server/WWebPerm.mjs'

let { dir, logFd, port, faultDir, url, pw } = JSON.parse(process.argv[2])

//種子: 與 g_initialTestData 同(genTestData), 庫在 dir(含 id-for-admin 之系統管理者列, 資料通道連線閘須 perm users 表有此列)
let so = WServOrm(ds, WOrmLmdb, dir, 'wperm')
await genTestData(ds, so.woItems, { bLog: false })
await so.closeAll()

//WOrmFault: 與 WOrmLmdb 同(資料庫實際開在 dir, 不用 WWebPerm 傳入之網址), 唯 select 依標記檔注入故障, 訊息回顯連線字串與裸密碼
let wrote = false
function WOrmFault(opt) {
    let ee = WOrmLmdb({ ...opt, url: dir })
    let on = (name) => fs.existsSync(path.join(faultDir, name))
    let selOrg = ee.select
    ee.select = async (...a) => {
        if (on(`${opt.cl}.select`) || (opt.cl === 'targets' && wrote && on('targets.select-after-write'))) {
            throw new Error(`ENGINE-FAILED-MARK-${opt.cl}.select auth refused bare ${pw} url=${url}`)
        }
        return await selOrg.apply(ee, a)
    }
    if (opt.cl === 'targets') {
        for (let m of ['save', 'insert', 'del', 'delAll']) {
            let f = ee[m]
            if (typeof f !== 'function') {
                continue
            }
            ee[m] = async (...a) => {
                let r = await f.apply(ee, a)
                wrote = true
                return r
            }
        }
    }
    return ee
}

//與 srv.mjs 之 sys 權杖同形: id-for-admin(perm users 表之系統管理者)
let getUserByToken = async (token) => {
    return token === 'sys' ? { id: 'id-for-admin', name: 'admin', email: 'admin@example.com', isAdmin: 'y' } : {}
}
let verifyOk = async () => true

WWebPerm(WOrmFault, url, 'wperm', getUserByToken, verifyOk, verifyOk, { serverPort: port, logFd })
console.log('READY')
