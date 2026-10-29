//api-ormDiag 之子行程: 以真 WWebPerm(真 w-serv-orm、真 w-serv-webdata、真 srLog 落檔)起一個獨立後端, ORM 層(WOrm)於 targets 表之 select 注入故障(含主鍵與 email 之錯誤原文),
//供測試經真 HTTP 資料通道觸發 w-serv-orm 之診斷輸出, 檢查其去向(srLog 檔與標準輸出; 規則帳本 R-DIAG-01).
//故障訊息另夾帶連線憑證(params.credText), 供 api-ormDiag 證明外來值之引擎錯誤既不入 srLog 之 orm-diag, 也不入 operOrm-error 之 raw(procOrm 以固定詞彙 reject, 不轉出引擎錯誤).
//為何以 ORM 縫注入故障: 真後端上 w-serv-orm 之寫入／查詢失敗皆已被 procCore／資料通道前置驗證擋下(設計如此), 自然觸發只剩 ORM 引擎本身之失敗(磁碟滿、LMDB 錯誤), 無從重現.
//用法: node test/tools/ormDiagChild.mjs <paramsJson>  params: { dir, logFd, port, secretId, secretMail, credText }
//輸出: 種子完成後建構後端, 輸出一行 'READY'(其後之標準輸出才是診斷輸出之觀察對象); 行程由測試殺掉(taskkill /T), 資料夾由測試刪
import WOrmLmdb from 'w-orm-lmdb/src/WOrmLmdb.mjs'
import WServOrm from 'w-serv-orm/src/WServOrm.mjs'
import genTestData from 'w-serv-orm/src/genTestData.mjs'
import ds from '../../src/schema/index.mjs'
import WWebPerm from '../../server/WWebPerm.mjs'

let { dir, logFd, port, secretId, secretMail, credText } = JSON.parse(process.argv[2])

//種子: 與 g_initialTestData 同(genTestData), 庫在 dir(含 id-for-admin 之系統管理者列, 資料通道連線閘須 perm users 表有此列)
let so = WServOrm(ds, WOrmLmdb, dir, 'wperm')
await genTestData(ds, so.woItems, { bLog: false })
await so.closeAll()

//WOrmFault: 與 WOrmLmdb 同, 唯 targets 表之 select 一律 reject 帶機器代碼 ENOSPC 之 Error, 其訊息含主鍵、email 與連線憑證(模擬引擎錯誤原文夾帶資料值與連線字串)
function WOrmFault(opt) {
    let ee = WOrmLmdb(opt)
    if (opt.cl === 'targets') {
        ee.select = async () => {
            return Promise.reject(Object.assign(new Error(`ENGINE-WRITE-FAILED id[${secretId}] mail=${secretMail} ${credText}`), { code: 'ENOSPC' }))
        }
    }
    return ee
}

//與 srv.mjs 之 sys 權杖同形: id-for-admin(perm users 表之系統管理者)
let getUserByToken = async (token) => {
    return token === 'sys' ? { id: 'id-for-admin', name: 'admin', email: 'admin@example.com', isAdmin: 'y' } : {}
}
let verifyOk = async () => true

WWebPerm(WOrmFault, dir, 'wperm', getUserByToken, verifyOk, verifyOk, { serverPort: port, logFd })
console.log('READY')
