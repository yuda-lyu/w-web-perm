import isestr from 'wsemi/src/isestr.mjs'
import isarr from 'wsemi/src/isarr.mjs'
import getDiagBriefErr from 'wsemi/src/getDiagBriefErr.mjs'


//maskLog: 權杖與網址寫入 console / srLog 前之遮罩(M 契約, spec/設計要點與取捨.md ADR-023); console 診斷不印資料值之形狀摘要 describeShape／describeErr(ADR-047)
//四 repo 一致(w-web-sso server/srLog.mjs 之 maskToken 與 src/maskUrl.mjs、w-web-api / w-web-task 之 maskTok), 以同一組測資守護(test/unit-maskLog.test.mjs)
//why: 原 console 站點原樣印出 token / req.query / authorization(Hapi 對重複之 query 參數給陣列, 型別檢查失敗之分支正是印出處), verifyConn 之 srLog 原樣記 referer


//safe: 露出字元之控制字元換成 '?', 避免請求端以 CR/LF 偽造 log 行
function safe(s) {
    return Array.from(s, (c) => {
        let x = c.charCodeAt(0)
        return (x < 32 || x === 127) ? '?' : c
    }).join('')
}


/**
 * 權杖遮罩
 * - 空值(undefined / null / '')回 ''
 * - 陣列逐元素遮罩
 * - 字串(長度 n)露出前後各 k=min(4, floor(n/8)) 字: k=0 只回 '(len=n)', 否則 '前k...後k(len=n)'; 36 字元之 session token 為前 4 後 4(與 w-web-sso 格式相同)
 * - 其他型別只回 '(typeof)', 絕不輸出原值
 *
 * @param {*} token 輸入權杖
 * @returns {String|Array} 回傳遮罩後字串, 輸入陣列時回傳陣列
 */
function maskTok(token) {
    if (isarr(token)) {
        return token.map(maskTok)
    }
    if (token === undefined || token === null || token === '') {
        return ''
    }
    if (!isestr(token)) {
        return `(${typeof token})`
    }
    let n = token.length
    let k = Math.min(4, Math.floor(n / 8))
    if (k === 0) {
        return `(len=${n})`
    }
    return `${safe(token.slice(0, k))}...${safe(token.slice(-k))}(len=${n})`
}


//console 診斷之形狀摘要上限: 鍵名最多列 MAX_KEYS 個、單一鍵名至多 MAX_KEY_LEN 字(超出者截斷並標示), 避免請求端以巨量鍵名灌爆行程標準輸出
const MAX_KEYS = 20
const MAX_KEY_LEN = 40


/**
 * 形狀摘要: console 診斷只印型別、鍵名或筆數, 絕不印任何值(R-DIAG-01 D2「預設不輸出資料值」; V20; ADR-047)
 * - null → '(null)'; undefined → '(undefined)'; 字串 → '(typeof string)'(空字串另標 empty, 便於區分「空」與「非字串」); 其他非物件 → '(typeof 型別)'
 * - 陣列 → '(array, length=N)'; 物件 → '(keys: a,b,c)'(自有可列舉之字串鍵, 至多 20 個、單鍵至多 40 字, 控制字元換 '?'; 無鍵 '(keys: none)')
 * - 永不拋錯(存取器、Proxy 陷阱之例外回 '(typeof object)')
 * 取代原 maskQuery(其印出 req.query 之非 token 值, 與 D2 相衝)
 *
 * @param {*} v 輸入任意值(使用者物件、請求本體、查詢參數、傳入參數等)
 * @returns {String} 回傳不含值之摘要字串
 */
function describeShape(v) {
    try {
        if (v === null) {
            return '(null)'
        }
        if (v === undefined) {
            return '(undefined)'
        }
        if (typeof v === 'string') {
            return v === '' ? '(typeof string, empty)' : '(typeof string)'
        }
        if (typeof v !== 'object') {
            return `(typeof ${typeof v})`
        }
        if (isarr(v)) {
            return `(array, length=${v.length})`
        }
        let ks = Object.keys(v)
        if (ks.length === 0) {
            return '(keys: none)'
        }
        let s = ks.slice(0, MAX_KEYS).map((k) => {
            return safe(k.length > MAX_KEY_LEN ? `${k.slice(0, MAX_KEY_LEN)}...` : k)
        }).join(',')
        if (ks.length > MAX_KEYS) {
            s += `,...+${ks.length - MAX_KEYS}`
        }
        return `(keys: ${s})`
    }
    catch (err) {
        return '(typeof object)'
    }
}


/**
 * 錯誤摘要: console 診斷只印錯誤類別與白名單內之機器代碼, 不印訊息文字(訊息可能含資料值、路徑或驅動原文; 原文只入 srLog 並依 maskRaw 遮憑證)
 * 經 wsemi getDiagBriefErr(單一實作, 規格 D1), 不自寫; 回 '(Error)' 或 '(Error ENOENT)'; 永不拋錯
 *
 * @param {*} err 輸入錯誤或任意值
 * @returns {String} 回傳不含訊息文字之摘要字串
 */
function describeErr(err) {
    let b = getDiagBriefErr(err)
    return b.errCode === undefined ? `(${safe(String(b.errType))})` : `(${safe(String(b.errType))} ${safe(String(b.errCode))})`
}


/**
 * 網址遮罩: http(s) 只留 origin + pathname, 捨棄 query / fragment / userinfo(其內常含權杖, 如 ?token=)
 * - 陣列逐元素處理; 空值回 ''; 其他非字串只回 '(typeof)'
 * - 非 http(s) 之網址(如 data:、javascript:)路徑即全部內容, 只回 protocol(同 w-web-sso src/maskUrl.mjs)
 * - 無法解析回 '(invalid-url)'
 *
 * @param {*} u 輸入網址
 * @returns {String|Array} 回傳可寫入 log 之字串, 輸入陣列時回傳陣列
 */
function maskUrl(u) {
    if (isarr(u)) {
        return u.map(maskUrl)
    }
    if (u === undefined || u === null || u === '') {
        return ''
    }
    if (!isestr(u)) {
        return `(${typeof u})`
    }
    let x = null
    try {
        x = new URL(u)
    }
    catch (err) {
        return '(invalid-url)'
    }
    if (x.protocol !== 'http:' && x.protocol !== 'https:') {
        return x.protocol
    }
    return `${x.origin}${x.pathname}`
}


export {
    maskTok,
    maskUrl,
    describeShape,
    describeErr
}
