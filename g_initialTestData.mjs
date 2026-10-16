import ds from './src/schema/index.mjs'
import { woItems } from './g_mOrm.mjs'
import genTestData from 'w-serv-orm/src/genTestData.mjs'


async function initialTestData() {

    //genTestData
    await genTestData(ds, woItems)

    console.log('finish.')
}

initialTestData()
    .catch((err) => {
        console.log('initialTestData catch', err)
        process.exitCode = 1 //失敗以非 0 離開碼表達(規則帳本 R-SEED-01): 呼叫端(e2e seedDb、排程、CI)才分辨得出失敗
    })


//刪除舊檔與重建測試資料庫
//node g_initialTestData.mjs
