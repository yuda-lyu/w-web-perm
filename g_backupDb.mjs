import { woItems } from './g_mOrm.mjs'
import getDb from 'w-serv-orm/src/getDb.mjs'


getDb.backup(woItems)
    .catch((err) => {
        console.log('backupDb catch', err)
        process.exitCode = 1 //失敗以非 0 離開碼表達(規則帳本 R-SEED-01、R-ERR-01: 未 await 之 promise 於源頭 catch)
    })
// getDb.recover(woItems, './ooo.json')


//備份資料重與由備份資料重建資料庫
//node g_backupDb.mjs
