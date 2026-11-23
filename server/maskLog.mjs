import isestr from 'wsemi/src/isestr.mjs'
import isarr from 'wsemi/src/isarr.mjs'


//maskLog: 權杖與網址寫入 console / srLog 前之遮罩(M 契約, spec/設計要點與取捨.md ADR-023)
//  console 診斷不印資料值之形狀摘要與錯誤摘要(ADR-047)不在本檔: 2026-11-23 排程第 603 項起一律用 wsemi 共用函數 getDiagShape／getDiagBriefErr(規格〈診斷輸出與遮罩〉D1 單一實作, 各站點自 wsemi 匯入; ADR-051),
//  原本檔轉出之 describeShape／describeErr(src/js/describeShape.mjs)已移除
//四 repo 一致(w-web-sso server/srLog.mjs 之 maskToken 與 src/maskUrl.mjs、w-web-api / w-web-task 之 maskTok), 以同一組測資守護(test/unit-maskLog.test.mjs)
//why: 原 console 站點原樣印出 token / req.query / authorization(Hapi 對重複之 query 參數給陣列, 型別檢查失敗之分支正是印出處), verifyConn 之 srLog 原樣記 referer


/**
 * 控制字元換 '?': 避免請求端或使用者資料以 CR/LF 偽造 log 行(僅供 maskTok 露出之頭尾字元; wsemi 無等價之匯出函數: getDiagShape 內之同類替換為其私有實作, 見 ADR-051 之建議收錄)
 * 涵蓋 C0 控制字元(碼位 < 32)、DEL(127)、C1 控制字元(0x80～0x9F, 含 U+0085 NEL)、行／段分隔(U+2028、U+2029)與雙向文字控制(U+202A～U+202E、U+2066～U+2069; 可使檢視器之顯示順序與實際不同)
 *
 * @param {String} s 輸入字串
 * @returns {String} 回傳上列字元已換成 '?' 之字串
 */
function safeCtl(s) {
    return Array.from(s, (c) => {
        let x = c.charCodeAt(0)
        let isCtl = x < 32 || (x >= 127 && x <= 159) || x === 0x2028 || x === 0x2029 || (x >= 0x202a && x <= 0x202e) || (x >= 0x2066 && x <= 0x2069)
        return isCtl ? '?' : c
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
    return `${safeCtl(token.slice(0, k))}...${safeCtl(token.slice(-k))}(len=${n})`
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
    maskUrl
}
