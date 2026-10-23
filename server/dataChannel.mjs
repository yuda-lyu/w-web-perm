import isestr from 'wsemi/src/isestr.mjs'


//資料通道(w-serv-webdata, useDbOrm:true)之表操作授權與 ORM 呼叫包裝(規則帳本 R-WSD-01、R-ORM-02; spec/設計要點與取捨.md ADR-026、ADR-015 Update)
//
//政策: 資料通道只開 select(methodsExec:['select'] 為第一道, 本授權函數只放行 select 為第二道).
//why: 裸 insert/save/del/delAll 繞過 procCore 之 lockSave、表鎖(w-serv-orm withTabLocks／guardWrite)、ckKey、寫入前驗證與整表比對(ADR-009/012/025/026 之不變式只在 kpFunExt 成立),
//同表兩條寫入路徑不對稱; 前端與測試皆只用 kpFunExt 寫入、同步只用 select(2026-10-14 Grep `\$fapi\.`、`callRpc(` 實證).
//連線者之身分授權仍在 verifyConn(getAndVerifyClientUser), 本函數不重做.


/**
 * 建立資料通道之表操作授權函數(w-serv-webdata 之 opt.authorizeExec)
 *
 * @param {Object} p 輸入物件
 * @param {Object} p.srLog 輸入 srLog(須有 error 方法)
 * @returns {Function} 回傳授權函數 ({ userId, tableName, methodName }) => Boolean, 只對已取得 userId 之 select 回傳 true; 拒絕時記 srLog(event 'authorizeExec', msg 為 err key)
 */
function createAuthorizeExec({ srLog }) {
    return ({ userId, tableName, methodName }) => {
        let msg = ''
        if (!isestr(userId)) {
            msg = 'cannotFindUserId'
        }
        else if (methodName !== 'select') {
            msg = 'userNoPermission'
        }
        if (msg !== '') {
            srLog.error({ event: 'authorizeExec', ok: false, msg, userId, tableName, methodName })
            return false
        }
        return true
    }
}


/**
 * 包裝資料通道之 operOrm: ORM 拒絕之原文(英文訊息、Error)只入 srLog, 對前端改回語系鍵 anUnexpectedErrorOccurred
 *
 * @param {Function} procOrm 輸入 w-serv-orm 之 procOrm(userId, tableName, methodName, input)
 * @param {Object} p 輸入物件
 * @param {Object} p.srLog 輸入 srLog(須有 error 方法)
 * @returns {Function} 回傳同簽名之 async 函數
 */
function wrapOperOrm(procOrm, { srLog }) {
    return async (userId, tableName, methodName, input) => {
        try {
            return await procOrm(userId, tableName, methodName, input)
        }
        catch (err) {
            let raw = (typeof err === 'string') ? err : ((err && err.message) || String(err))
            srLog.error({ event: 'operOrm-error', msg: 'anUnexpectedErrorOccurred', raw, userId, tableName, methodName })
            return Promise.reject('anUnexpectedErrorOccurred')
        }
    }
}


export { createAuthorizeExec, wrapOperOrm }
