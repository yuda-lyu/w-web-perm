import isestr from 'wsemi/src/isestr.mjs'
import isarr from 'wsemi/src/isarr.mjs'


//maskLog: 權杖與網址寫入 console / srLog 前之遮罩(M 契約, spec/設計要點與取捨.md ADR-023)
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


/**
 * 查詢參數遮罩: 淺拷貝, 鍵名小寫為 token 者以 maskTok 處理, 其餘原樣(供印出 req.query)
 * 非物件輸入依 maskTok 處理
 *
 * @param {*} q 輸入查詢參數物件(Hapi 之 req.query 為 null-prototype 物件)
 * @returns {Object|String|Array} 回傳遮罩後之淺拷貝
 */
function maskQuery(q) {
    if (q === null || typeof q !== 'object' || isarr(q)) {
        return maskTok(q)
    }
    let r = {}
    for (let k of Object.keys(q)) {
        r[k] = (k.toLowerCase() === 'token') ? maskTok(q[k]) : q[k]
    }
    return r
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
    maskQuery,
    maskUrl
}
