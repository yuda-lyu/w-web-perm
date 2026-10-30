import maskDiagText from 'wsemi/src/maskDiagText.mjs'
import getDiagSecrets from 'wsemi/src/getDiagSecrets.mjs'


//srLog 之 raw(錯誤原文)移除連線憑證之單一入口(規則帳本 R-ORM-DIAG-02; 跨套件規格〈診斷輸出與遮罩〉D1 單一實作、D3 對外錯誤值不含憑證; 主控 2026-10-30 裁定 T-a 選 B):
//  外來值: 本套件直接呼叫 woItems 之 ORM 方法(select／save／delAll, 不經 procOrm)所拋出之錯誤——驅動之訊息可能回顯連線字串(如 mongo 之 Unable to parse mongodb://u:p@…), 部署端之驅動版本不由本套件控制;
//    經 procOrm 之失敗為 w-serv-orm 之固定詞彙(其 catch 站點已由 w-serv-orm 遮罩, 本套件不重複包).
//  做法: 遮罩一律經 wsemi 之 maskDiagText(用 reject 清單: 只遮憑證, 不遮單獨帳號與儲存路徑, 同 diag.mask 之清單, 規格 P1); 秘密清單由連線字串經 getRawSecrets 產生一次, 以參數 secrets 傳入各站點;
//    固定詞彙(語系鍵、procOrm 之固定英文詞彙)與 msg／key 欄位不經遮罩, 只遮 raw 欄位之原文.


/**
 * 由連線字串產生 srLog raw 遮罩用之秘密清單
 *
 * 連線字串(含 :// 或 @)列為網址(帳密為憑證); 其餘(w-orm-lmdb 之 './db' 等儲存路徑)列為路徑(reject 清單為空, 不把儲存路徑當憑證遮),
 * 判準與 w-serv-orm 本身遮罩自家錯誤值者為同一個 wsemi 函數(getDiagSecrets({ conns: [url] }), w-serv-orm 1.1.23 起兩層皆直接呼叫它), 兩層對同一連線字串之遮罩一致
 *
 * @param {String} url 輸入 WWebPerm 之資料庫連線字串
 * @returns {Object} 回傳 wsemi getDiagSecrets 之結果 { detail, reject }(凍結), 供 rawOfErr、maskRaw 之 secrets 參數使用
 */
function getRawSecrets(url) {
    return getDiagSecrets({ conns: [url] })
}


/**
 * 檢查 secrets 參數為 getRawSecrets 之結果(必帶, 不留無秘密之舊介面; 缺或型別不合即 TypeError, fail-closed)
 *
 * @param {Object} secrets 輸入秘密清單物件
 * @param {String} who 輸入呼叫端名稱(錯誤訊息用)
 */
function checkRawSecrets(secrets, who) {
    if (secrets === null || typeof secrets !== 'object' || !Array.isArray(secrets.reject)) {
        throw new TypeError(`${who}: secrets must be the result of getRawSecrets(url)`)
    }
}


/**
 * 取錯誤原文(未遮罩): 字串原樣, Error 取 message, 其餘 String()
 *
 * @param {*} err 輸入錯誤值
 * @returns {String} 回傳原文
 */
function msgOfErr(err) {
    return (typeof err === 'string') ? err : ((err && err.message) || String(err))
}


/**
 * 原文移除連線憑證(wsemi maskDiagText, reject 清單); 非字串原樣回傳(maskDiagText 之行為)
 *
 * @param {*} text 輸入原文
 * @param {Object} secrets 輸入 getRawSecrets 之結果
 * @returns {*} 回傳遮罩後之原文
 */
function maskRaw(text, secrets) {
    return maskDiagText(text, secrets.reject)
}


/**
 * 取錯誤原文並移除連線憑證, 供 srLog 之 raw 欄位使用
 *
 * @param {*} err 輸入錯誤值
 * @param {Object} secrets 輸入 getRawSecrets 之結果
 * @returns {String} 回傳遮罩後之原文
 */
function rawOfErr(err, secrets) {
    return maskRaw(msgOfErr(err), secrets)
}


/**
 * 錯誤值之 log 用文字(srLog 之 msg 欄位, 其值多為固定語系鍵, 非鍵時為 ORM／I/O 之原文): 已知語系鍵(固定詞彙)原樣不遮, 其餘取原文並移除連線憑證
 *
 * @param {*} err 輸入錯誤值(字串、Error 或其他)
 * @param {Function} isKey 輸入 (字串) => Boolean, 是否為本套件語系鍵(固定詞彙)
 * @param {Object} secrets 輸入 getRawSecrets 之結果
 * @param {String} fallback 輸入無訊息可取時之預設文字(不經遮罩)
 * @returns {String} 回傳 log 用文字
 */
function msgForLog(err, isKey, secrets, fallback) {
    if (typeof err === 'string' && isKey(err)) {
        return err
    }
    let text = (typeof err === 'string') ? err : ((err && err.message) || null)
    return text === null ? fallback : maskRaw(text, secrets)
}


export { getRawSecrets, checkRawSecrets, msgOfErr, maskRaw, rawOfErr, msgForLog }
