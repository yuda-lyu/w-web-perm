import fs from 'fs'
import path from 'path'
import WOrm from 'w-orm-lmdb/src/WOrmLmdb.mjs'
import WServOrm from 'w-serv-orm/src/WServOrm.mjs'
import ds from './src/schema/index.mjs'
import getSettings from './g_getSettings.mjs'
import { runClean } from './test/tools/authRefsClean.mjs'


//懸空引用之一次性清理(升版工具; 適用表 n 上線前之舊資料可能已有查無實體之引用: users.cgrups 引用不存在之群組、grups.cpemis 引用不存在之權限、pemis.crules 引用不存在之管控對象 id)
//效果等同舊版「找不到即忽略」: 把懸空項目自授權字串移除(不論 isActive); 經 ORM 寫入, 只改該欄位.
//
//用法(自專案根):
//  node g_authRefsClean.mjs                        只列不改(預設): 連專案資料庫(./db)稽核並輸出報告
//  node g_authRefsClean.mjs --apply                寫入: 先備份資料庫(backup-時間.json, 於工作目錄)與將改寫之三張引用端表全部列(./authRefsClean-backup-時間.json), 任一備份失敗即中止、不寫入; 寫完重新稽核, 應為 0 懸空
//  node g_authRefsClean.mjs --apply --backup <檔>  指定引用端表備份檔路徑(不覆寫既有檔)
//  node g_authRefsClean.mjs --db <資料夾>          覆寫資料庫位置(同 g_getSettings 之 dbUrl; 資料庫名稱仍為 dbName), 供測試用臨時資料庫; 資料夾不存在即中止(不憑空建立空庫)
//離線版(只讀匯出檔、不連庫): node test/tools/authRefsAudit.mjs <匯出檔.json> [--json] [--clean-out <檔>]
//
//不清理者(報告列為「須人工處理」, 非失敗): 壞 JSON、名稱非字串之引用、缺字串主鍵之列, 以及含 JSON5 Infinity／NaN 數值而命中須改寫之授權欄位(JSON.stringify 會把它編成 null, 作規則名時改指別的規則); 寫後重新稽核時其懸空項為已知殘留.
//--backup 路徑以 wx 建立: 同名既有檔(含資料庫檔、別名——大小寫不同、相對／絕對、硬連結)一律拒絕、不覆寫, 失敗於備份階段(零寫入).
//離開碼: 0 成功(含只列不改與無須清理); 1 失敗(備份失敗、資料於稽核後被改動、寫入有 ok:0、寫後重稽核不為 0 等, 報告會列出); 2 參數錯誤.
//建議於停服(或無人編輯)時 --apply, 完成後重啟服務. 備份檔含 email 等個資, 請妥善保管、勿外傳、勿納入版控.


async function main() {
    let args = process.argv.slice(2)
    let flag = (k) => args.includes(k)
    let val = (k) => {
        let i = args.indexOf(k)
        return i >= 0 ? args[i + 1] : undefined
    }
    let known = ['--apply', '--backup', '--db', '--help']
    let bad = args.filter((a, k) => (a.startsWith('--') ? !known.includes(a) : !(k > 0 && ['--backup', '--db'].includes(args[k - 1]))))
    let missing = ['--backup', '--db'].some((k) => flag(k) && (val(k) === undefined || val(k).startsWith('--')))
    if (flag('--help') || bad.length > 0 || missing) {
        console.log('用法: node g_authRefsClean.mjs [--apply] [--backup <檔>] [--db <資料夾>]')
        process.exitCode = flag('--help') ? 0 : 2
        return
    }

    //連線: 預設走 g_mOrm.mjs(專案資料庫, 動態載入——靜態 import 會於載入時即開啟 ./db); --db 則依指定資料夾自建(WServOrm 組裝同 g_mOrm.mjs)
    let st = getSettings()
    let url = flag('--db') ? val('--db') : st.dbUrl
    if (!fs.existsSync(path.join(url, st.dbName))) {
        console.log(`資料庫不存在: ${path.resolve(url, st.dbName)}(不憑空建立空庫, 已中止)`)
        process.exitCode = 1
        return
    }
    let woItems = null
    let closeAll = null
    if (flag('--db')) {
        let r = WServOrm(ds, WOrm, url, st.dbName)
        woItems = r.woItems
        closeAll = r.closeAll
    }
    else {
        woItems = (await import('./g_mOrm.mjs')).woItems
    }

    try {
        let res = await runClean({ woItems, apply: flag('--apply'), backupPath: val('--backup') })
        if (!res.ok) {
            process.exitCode = 1
        }
    }
    finally {
        if (closeAll) {
            await closeAll()
        }
    }
}


main()
    .catch((err) => {
        console.log('authRefsClean catch', err)
        process.exitCode = 1 //失敗以非 0 離開碼表達(規則帳本 R-SEED-01、R-ERR-01: 未 await 之 promise 於源頭 catch)
    })
