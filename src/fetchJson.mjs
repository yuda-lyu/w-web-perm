/**
 * 以瀏覽器與 node(18+) 內建之 fetch 取得 JSON 回應, 取代 axios(2026-09-07 起本套件不再依賴 axios)
 *
 * 與 axios 之語意對齊:
 *   - 網路錯誤或非 2xx: axios 會 reject, fetch 只在網路錯誤 reject, 故此處對 !res.ok 亦 reject, 統一為 { kind: 'request', status, message }
 *   - 回應非 JSON: axios 回原字串(呼叫端判 state 失敗), 此處 res.json() 失敗 reject { kind: 'parse', status, message }
 *   - 成功: resolve 解析後之 JSON(對應 axios 之 res.data)
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
        return Promise.reject({ kind: 'request', status: 0, message: String((err && err.message) || err) })
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
        return Promise.reject({ kind: 'parse', status: res.status, message: String((err && err.message) || err) })
    }

}


export default fetchJson
