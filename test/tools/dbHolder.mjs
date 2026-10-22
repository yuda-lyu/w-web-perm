//測試用輔助(非測試檔): 開啟 lmdb 資料庫並持有, 模擬後端 srv.mjs 占用資料庫; stdin 關閉(end)時關閉資料庫並結束.
//用法: node test/tools/dbHolder.mjs <資料庫資料夾>; 就緒時於 stdout 印 holder-ready. 供 unit-fromAudit 驗證「後端占用時拒絕寫入」.
import WOrm from 'w-orm-lmdb/src/WOrmLmdb.mjs'
import WServOrm from 'w-serv-orm/src/WServOrm.mjs'
import ds from '../../src/schema/index.mjs'


let url = process.argv[2]
let r = WServOrm(ds, WOrm, url, 'wperm') //資料庫名稱同 g_getSettings.mjs
await r.woItems.users.select() //實際讀一次, 確保已開啟
console.log('holder-ready')
process.stdin.resume()
process.stdin.on('end', async () => {
    await r.closeAll()
    process.exit(0)
})
