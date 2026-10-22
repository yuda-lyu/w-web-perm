import fs from 'fs'
import { fileURLToPath } from 'url'


/**
 * 判斷呼叫端模組是否為 node 直接執行之入口(CLI 區塊的進入條件)
 *
 * 套件經 symlink／junction 安裝(npm link、pnpm、workspaces)時, node 以真實路徑載入入口模組(import.meta.url 為真實路徑),
 * 而 process.argv[1] 維持命令列所給之路徑, 兩者直接比較不相等, CLI 區塊靜默不執行(無報告卻正常結束; run08 外審 sol #5).
 * 故兩邊皆取真實路徑再比對(Windows 路徑不分大小寫).
 *
 * @param {String} importMetaUrl 輸入呼叫端的 import.meta.url
 * @param {String} [argv1=process.argv[1]] 輸入命令列給 node 的入口路徑, 預設 process.argv[1]
 * @returns {Boolean} 回傳呼叫端模組即為入口為 true; 無法判定(路徑不存在等)為 false
 */
function isMain(importMetaUrl, argv1 = process.argv[1]) {
    if (typeof argv1 !== 'string' || argv1 === '') {
        return false
    }
    try {
        let a = fs.realpathSync.native(fileURLToPath(importMetaUrl))
        let b = fs.realpathSync.native(argv1)
        return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
    }
    catch (err) {
        return false
    }
}


export default isMain
