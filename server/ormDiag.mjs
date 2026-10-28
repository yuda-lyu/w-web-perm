//w-serv-orm 診斷輸出導入本套件 srLog(規則帳本 R-ORM-DIAG-01; w-serv-orm 1.1.20 R-DIAG-01, opt.funLog)
//why: w-serv-orm 1.1.20 起診斷輸出預設只走 console 且不含主鍵、資料值、ORM 錯誤原文; 後端行程之標準輸出常被 pm2／容器收集而不入本套件日誌, 寫入失敗便少了可診斷性.
//給 opt.funLog 後診斷輸出只交給它(不寫 console), 由此導入 srLog: 寫入失敗之標籤(含表名與操作, 如 'users.save fail')與不含個資之摘要(失敗筆數與位置、錯誤類別與機器代碼、固定拒收句).
//detail(含主鍵與 ORM 錯誤原文)一律不寫: 本套件日誌政策為不記列 id 與個資值(srLog 只記錯誤鍵、原因、筆數、位置; 見 procCore／cascadeWrite／syncCore 之 srLog 註解),
//且 detail 為任意結構(失敗列清單、查詢條件快照、引擎錯誤原文可夾帶 email／主鍵), 以樣式遮罩無從證明完整; 摘要已足以定位(哪張表、哪個操作、幾筆、第幾筆、何種錯誤).
//本函數因此只收 (label, safe) 兩參數, 不綁定也不讀取第 3 參數.


//標籤與摘要之長度上限(上游皆為固定短句或小物件, 上限只防異常形狀灌爆日誌)
const MAX_LABEL = 200
const MAX_SAFE = 1000


//toSafe: 摘要轉為可寫入日誌之純資料拷貝; 不可序列化(BigInt、循環)或過長者以標記代替
function toSafe(safe) {
    let s = ''
    try {
        s = JSON.stringify(safe)
    }
    catch (err) {
        return '[Unloggable]'
    }
    if (typeof s !== 'string' || s.length > MAX_SAFE) {
        return '[Unloggable]'
    }
    return JSON.parse(s)
}


/**
 * 建立 w-serv-orm 之 opt.funLog: 把診斷輸出之標籤與摘要以 warn 寫入 srLog(event 'WServOrm-diag'), 完整細節不寫
 * 日誌寫入失敗(同步拋錯、回傳 rejected promise)一律吞下, 不影響 w-serv-orm 與呼叫端之流程
 *
 * @param {Object} srLog 輸入 srLog(須有 warn 方法)
 * @returns {Function} 回傳 (label, safe) => void
 */
function mkOrmFunLog(srLog) {
    if (srLog === null || typeof srLog !== 'object' || typeof srLog.warn !== 'function') {
        throw new TypeError('invalid srLog, need an object with warn()')
    }
    return (label, safe) => {
        try {
            let o = { event: 'WServOrm-diag', label: String(label).slice(0, MAX_LABEL) }
            if (safe !== undefined) {
                o.safe = toSafe(safe)
            }
            let r = srLog.warn(o)
            if (r !== null && r !== undefined && typeof r.then === 'function') {
                r.then(undefined, () => {})
            }
        }
        catch (err) {
            //日誌寫入失敗不得影響原流程
        }
    }
}


export { mkOrmFunLog }
