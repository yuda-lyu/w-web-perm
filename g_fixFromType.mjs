import fs from 'fs'
import path from 'path'
import WOrm from 'w-orm-lmdb/src/WOrmLmdb.mjs'
import WServOrm from 'w-serv-orm/src/WServOrm.mjs'
import ds from './src/schema/index.mjs'
import getSettings from './g_getSettings.mjs'
import { checkDbNotInUse, runFixFromType } from './server/tools/fromTools.mjs'


//來源欄 from 之型別正規化(升版工具; F-23 外部列受保護, 規則帳本 R-PRINCIPLE-00 原則 5): 升版後後台寫入起拒收非字串 from, 既有資料中 from 為 null／數字／布林／物件／陣列者須先正規化為 ''(後台列).
//外部列＝from 為非空字串者; ''、缺欄、非字串皆為後台列, 故本工具只把「非字串」改為 '', 不改變任何列是否為外部列; 缺欄視同 ''(已是後台列), 不改; 非空字串(外部列)不動.
//經 ORM 寫入, 只改 from 欄(不動其餘欄位與更新者／更新時間).
//
//用法(自專案根):
//  node g_fixFromType.mjs                        只列不改(預設): 連專案資料庫(./db)列出各表非字串 from 之列數、型別分佈與前 10 個 id
//  node g_fixFromType.mjs --apply                寫入: 後端須先停止(偵測到資料庫被占用即拒絕); 先備份資料庫(backup-時間.json, 於工作目錄)與四表全部列(./fixFromType-backup-時間.json), 任一備份失敗即中止、不寫入; 寫完回讀驗證(預期結果逐位元相同、已無非字串 from)
//  node g_fixFromType.mjs --apply --backup <檔>  指定四表備份檔路徑(不覆寫既有檔)
//  node g_fixFromType.mjs --db <資料夾>          覆寫資料庫位置(同 g_getSettings 之 dbUrl; 資料庫名稱仍為 dbName), 供測試用臨時資料庫; 資料夾不存在即中止(不憑空建立空庫)
//
//後端占用偵測(--apply 時, 於開啟資料庫之前; 僅 Windows 可偵測, 其他平台請自行確認後端已停止): 被占用即拒絕、零寫入(離開碼 1).
//冪等: 失敗後修正原因可原樣重跑; 已正規化者不再出現. 備份檔含 email 等個資, 請妥善保管、勿外傳、勿納入版控.
//離開碼: 0 成功(含只列不改與無須修正); 1 失敗(資料庫不存在、被占用、備份失敗、資料於稽核後被改動、寫入有失敗、寫後驗證不符等, 報告會列出); 2 參數錯誤.


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
        console.log('用法: node g_fixFromType.mjs [--apply] [--backup <檔>] [--db <資料夾>]')
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
        let res = await runFixFromType({ woItems, apply: flag('--apply'), backupPath: val('--backup') })
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
        console.log('fixFromType catch', err)
        process.exitCode = 1 //失敗以非 0 離開碼表達(規則帳本 R-SEED-01、R-ERR-01: 未 await 之 promise 於源頭 catch)
    })
