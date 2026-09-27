import get from 'lodash-es/get.js'
import isestr from 'wsemi/src/isestr.mjs'


let reName = /^[A-Za-z]{1,40}$/
let reCode = /^[A-Z][A-Z0-9_]{1,40}$/


//errDesc: 例外只取名稱(與代碼形狀之 cause.code / code), 不取 message(spec/設計要點與取捨.md ADR-023)
//why: fetch 例外之 message 可能含完整網址('Failed to parse URL from <url>'、'Request cannot be constructed from a URL that includes credentials: <url>'),
//而網址常帶權杖(?token=); JSON 解析錯誤之 message 夾帶回應本體片段. reject 物件會經 perm.conn / provideTabs 交給呼叫端與其 log
function errDesc(err) {
    let name = get(err, 'name')
    let s = (isestr(name) && reName.test(name)) ? name : 'Error'
    let code = get(err, 'cause.code')
    if (!(isestr(code) && reCode.test(code))) {
        code = get(err, 'code')
    }
    if (isestr(code) && reCode.test(code)) {
        s += ` ${code}`
    }
    return s
}


/**
 * 以瀏覽器與 node(18+) 內建之 fetch 取得 JSON 回應, 取代 axios(2026-09-07 起本套件不再依賴 axios)
 *
 * 與 axios 之語意對齊:
 *   - 網路錯誤或非 2xx: axios 會 reject, fetch 只在網路錯誤 reject, 故此處對 !res.ok 亦 reject, 統一為 { kind: 'request', status, message }
 *   - 回應非 JSON: axios 回原字串(呼叫端判 state 失敗), 此處 res.json() 失敗 reject { kind: 'parse', status, message }
 *   - 成功: resolve 解析後之 JSON(對應 axios 之 res.data)
 * reject 之 message 只含例外名稱與代碼(如 'TypeError ECONNREFUSED'、'SyntaxError')或 'HTTP <status>', 不含網址與回應本體(網址常帶權杖)
 * 注意: node 端 fetch(undici) 不讀 HTTP_PROXY / HTTPS_PROXY 環境變數(axios 會), 需走 proxy 之部署須自行以 opt.dispatcher 注入 undici Agent
 *
 * @param {String} url 輸入請求網址字串
 * @param {Object} [opt={}] 輸入 fetch 選項物件(method / headers / body / signal / dispatcher 等原樣傳給 fetch), 預設 {}
 * @returns {Promise} 回傳 Promise, resolve 為 JSON 物件, reject 為 { kind: 'request'|'parse', status, message }
 */
async function fetchJson(url, opt = {}) {

    //fetch
    let res = null
    try {
        res = await fetch(url, opt)
    }
    catch (err) {
        return Promise.reject({ kind: 'request', status: 0, message: errDesc(err) })
    }

    //check status
    if (!res.ok) {
        return Promise.reject({ kind: 'request', status: res.status, message: `HTTP ${res.status}` })
    }

    //json
    try {
        return await res.json()
    }
    catch (err) {
        return Promise.reject({ kind: 'parse', status: res.status, message: errDesc(err) })
    }

}


export default fetchJson
