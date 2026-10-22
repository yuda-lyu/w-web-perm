import fs from 'fs'
import path from 'path'
import WOrm from 'w-orm-lmdb/src/WOrmLmdb.mjs'
import WServOrm from 'w-serv-orm/src/WServOrm.mjs'
import ds from './src/schema/index.mjs'
import getSettings from './g_getSettings.mjs'
import { checkDbNotInUse, runAuditFrom, runPurgeFrom } from './server/tools/fromTools.mjs'


//來源欄 from 之整來源清除(升版工具; F-23 外部列受保護, 規則帳本 R-PRINCIPLE-00 原則 5): 升版後 from 為非空字串之列為外部列, 後台唯讀(不得改、不得刪);
//某外部來源已不再同步而須整批移除時, 以本工具清除該來源寫入之全部列, 並於同一次清理引用(效果同後台刪除該些列: users.cgrups 引用被清除群組、grups.cpemis 引用被清除權限、pemis.crules 引用被清除標的者, 自授權字串移除; 與伺服端同一純函數 refCascade.planRefChanges).
//比對為精確 ===(不 trim、不分大小寫、不模糊); from 不可為空字串(拒絕); 不做「認領」(外部列改成後台列); 不得有自動刪除之預設——預設只列, 明確加 --apply 才寫入.
//
//用法(自專案根):
//  node g_purgeFrom.mjs                                           只列(預設): 各表 (表, from 值型別/值) 之筆數(含 '' 與非字串者之摘要), 並標示非空 from 為外部列
//  node g_purgeFrom.mjs --table <targets|pemis|grups|users|all> --from <來源名>
//                                                                 只列出將被清除之列與將被連帶清理之引用端筆數(dry-run, 不寫); all 為四表依 targets → pemis → grups → users 之引用鏈序逐表處理
//  node g_purgeFrom.mjs --table <表|all> --from <來源名> --apply  寫入(不可逆): 後端須先停止(偵測到資料庫被占用即拒絕); 先備份資料庫(backup-時間.json, 於工作目錄)與四表全部列(./purgeFrom-backup-時間.json), 任一備份失敗即中止、不寫入;
//                                                                 逐表先寫引用端改寫、後刪被清除列; 任一步失敗即中止並提示依備份回復; 寫完回驗(與預測狀態逐位元相同、指定表已無該來源之列、未製造新的懸空引用)
//  --backup <檔>                                                  指定四表備份檔路徑(不覆寫既有檔)
//  --db <資料夾>                                                  覆寫資料庫位置(同 g_getSettings 之 dbUrl; 資料庫名稱仍為 dbName), 供測試用臨時資料庫; 資料夾不存在即中止(不憑空建立空庫)
//
//拒絕(零寫入): from 為空字串(--from '' 於部分 shell 會被吃掉而成缺值, 亦視為參數錯誤); 被清除列缺非空字串主鍵; 引用端授權字串含無法安全重新編碼之內容(JSON5 Infinity／NaN 數值, 清理會改指別的規則, 須先人工處理該引用端列).
//冪等: 失敗後修正原因可原樣重跑同一指令. 備份檔含 email 等個資, 請妥善保管、勿外傳、勿納入版控. 輸出可列 id 與群組／權限／標的名稱, 不列使用者姓名與 email.
//離開碼: 0 成功(含只列與無須清除); 1 失敗(資料庫不存在、被占用、規劃被拒、備份失敗、資料於稽核後被改動、寫入有失敗、寫後驗證不符等, 報告會列出; 規劃被拒於 dry-run 亦為 1, 表示 --apply 亦將拒絕); 2 參數錯誤.

const TABLE_NAMES = ['targets', 'pemis', 'grups', 'users', 'all']


async function main() {
    let args = process.argv.slice(2)
    let flag = (k) => args.includes(k)
    let val = (k) => {
        let i = args.indexOf(k)
        return i >= 0 ? args[i + 1] : undefined
    }
    let USAGE = '用法: node g_purgeFrom.mjs [--table <targets|pemis|grups|users|all> --from <來源名> [--apply] [--backup <檔>]] [--db <資料夾>]'
    let known = ['--apply', '--backup', '--db', '--table', '--from', '--help']
    let valueFlags = ['--backup', '--db', '--table', '--from']
    let bad = args.filter((a, k) => (a.startsWith('--') ? !known.includes(a) : !(k > 0 && valueFlags.includes(args[k - 1]))))
    let missing = valueFlags.some((k) => flag(k) && (val(k) === undefined || val(k).startsWith('--')))
    if (flag('--help') || bad.length > 0 || missing) {
        console.log(USAGE)
        process.exitCode = flag('--help') ? 0 : 2
        return
    }
    let table = val('--table')
    let from = val('--from')
    let usageErr = (msg) => {
        console.log(`${msg}\n${USAGE}`)
        process.exitCode = 2
    }
    if (flag('--from') && from === '') {
        usageErr('--from 不可為空字串(空字串為後台列, 不是一個來源)')
        return
    }
    if (flag('--table') !== flag('--from')) {
        usageErr('--table 與 --from 須同時給')
        return
    }
    if (flag('--table') && !TABLE_NAMES.includes(table)) {
        usageErr(`--table 須為 ${TABLE_NAMES.join('／')} 之一`)
        return
    }
    if (flag('--apply') && !flag('--table')) {
        usageErr('--apply 須搭配 --table 與 --from(不提供無條件清除)')
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

    //後端占用偵測(寫入前, 且須於本行程開啟資料庫之前)
    if (flag('--apply')) {
        let u = checkDbNotInUse({ url, dbName: st.dbName })
        if (!u.ok) {
            console.log(`失敗(階段 inuse): ${u.err}`)
            process.exitCode = 1
            return
        }
        if (!u.checked) {
            console.log('(此平台無法自動偵測後端是否占用資料庫, 請自行確認後端已停止)')
        }
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
        let res = null
        if (flag('--table')) {
            res = await runPurgeFrom({ woItems, table, from, apply: flag('--apply'), backupPath: val('--backup') })
        }
        else {
            res = await runAuditFrom({ woItems })
        }
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
        console.log('purgeFrom catch', err)
        process.exitCode = 1 //失敗以非 0 離開碼表達(規則帳本 R-SEED-01、R-ERR-01: 未 await 之 promise 於源頭 catch)
    })
