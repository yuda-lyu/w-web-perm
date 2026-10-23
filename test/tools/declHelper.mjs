//測試共用: 被引用實體身分宣告(opt.refs)之「合規客戶端」模擬(perm-run03 範圍一; 規則帳本 R-REF-IDENTITY-01 規則 7)
//
//背景: perm-run03 起存檔改變引用(新增或移除啟用之引用項、新增列帶引用)而未附身分宣告即整次拒收 saveIdentityRequired(使用者 2026-10-23 裁示宣告強制必帶).
//清單頁(瀏覽器)本來就附宣告; 但測試以 callRpc／pc.updateXxx 直打者原本不附, 其「改變引用」之案例須改為像清單頁一樣附宣告——
//本檔提供與清單頁相同的純函數(src/js/refIdentity.mjs 之 buildRefDecl, picks 為空時以送出當下之被引用表為準), 使測試的案例意圖不變(測的是各自的規則, 不是宣告本身).
//要測「未附宣告被拒」者(saveIdentityRequired)請明示略過: callRpc 之 opt.noDecl:true、autoDecl 包裝後之 pc 的 opt.__noDecl:true.
import { buildRefDecl, getRefTarget } from '../../src/js/refIdentity.mjs'


/**
 * 依「送出的整表」與「目前庫內」組宣告(同清單頁 buildRefDecl 之無 picks 路徑); 該表無授權引用欄(targets)或 rowsNew 非陣列回 null
 *
 * @param {String} keyTable 輸入引用端表名(users／grups／pemis／targets)
 * @param {Array} rowsNew 輸入欲送出之整表
 * @param {Function} selectFn 輸入 async (表名) => 該表目前全部列
 * @returns {Promise<Array|null>} 回傳 [{ name, ids }] 或 null
 */
export async function buildDecl(keyTable, rowsNew, selectFn) {
    let t = getRefTarget(keyTable)
    if (t === null || !Array.isArray(rowsNew)) {
        return null
    }
    let rowsOld = await selectFn(keyTable)
    let refRows = await selectFn(t.table)
    if (!Array.isArray(rowsOld) || !Array.isArray(refRows)) {
        return null
    }
    return buildRefDecl({ keyTable, rowsNew, rowsOld, picks: new Map(), refRows })
}


/**
 * 包裝 procCore 實例(單元測試用): 四個 updateXxx 在未帶 refs／subject 時自動附上宣告(讀 woItems 替身之目前資料); 其餘行為不變
 *
 * @param {Object} pc 輸入 proc(woItems, procOrm, …) 之回傳
 * @param {Object} woItems 輸入資料表替身集合(須有 select)
 * @returns {Object} 回傳同形之包裝物件
 */
export function autoDecl(pc, woItems) {
    //讀替身快照(不經 select: 替身若被包裝成計數 select 呼叫次數的測試, 自動宣告不得污染其計數; 無 snapshot 者退回 select)
    let sel = async (t) => {
        let w = woItems[t]
        if (!w) {
            return []
        }
        if (typeof w.snapshot === 'function') {
            return JSON.parse(w.snapshot())
        }
        return (typeof w.select === 'function') ? await w.select() : []
    }
    let wrap = (kt, fn) => async (userId, rows, opt) => {
        let o = (opt !== null && typeof opt === 'object') ? { ...opt } : {}
        let skip = o.__noDecl === true
        delete o.__noDecl
        if (!skip && o.refs === undefined && o.subject === undefined) {
            let decl = await buildDecl(kt, rows, sel)
            //只在「本次存檔改變了引用」(宣告非空)時附: 不改變引用之存檔不需宣告(規格: 只改名、只改其他欄、mode 變更、整列刪除免宣告), 伺服端對空宣告與未宣告同樣照常通過,
            //但**帶了宣告就會取被引用表鎖並新鮮讀取之**(procCore.withRefLock)——空宣告若一律附上, 會使取鎖軌跡／持鎖互斥／並行類測試(unit-procCore-refCascade RW-5xx)的被測前提(「無改名無刪除只取本表一把鎖」「他方持被引用表鎖時不被擋」)被包裝器悄悄改變.
            //故合規客戶端的最小形式是「有改變引用才附宣告」; 要連空宣告也附(同清單頁恆送 refs)請自行在 opt 帶 refs: []
            if (decl !== null && decl.length > 0) {
                o.refs = decl
            }
        }
        return await pc[fn](userId, rows, o)
    }
    return {
        ...pc,
        updateUsers: wrap('users', 'updateUsers'),
        updateGrups: wrap('grups', 'updateGrups'),
        updatePemis: wrap('pemis', 'updatePemis'),
    }
}
