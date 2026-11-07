const http = require('http')

//dev server 之 /api proxy 重用至後端之連線(排程第 347 項, R-E2E-PROXY-01; 同型現象由 w-web-sso 排程第 324 項先查得): http-proxy 未給 agent 時以 agent:false 每個請求新開一條連線並送 Connection: close,
//後端回應之 connection: close 又被轉回瀏覽器, 使每個 /api 請求於「瀏覽器→dev server」「dev server→後端」兩段各留一個 TIME_WAIT(量測與判讀見 sgud/rule/rulebook_test.md 之 R-E2E-PROXY-01)
const proxyAgent = new http.Agent({ keepAlive: true })

module.exports = {
    productionSourceMap: false, //不產出map檔
    lintOnSave: false, //禁止eslint-loader於編譯時檢查語法
    devServer: {
        proxy: {
            '/api': {
                //e2e 多開(E2E_PORT_OFFSET, 排程第 302 項)時代理到本實例之後端(11006＋位移); 未設時值為 11006, 與導入前相同
                target: 'http://localhost:' + (11006 + Number(process.env.E2E_PORT_OFFSET || 0)),
                agent: proxyAgent,
                pathRewrite: {
                    '^/api': '/api'
                },
            },
        }
    },
    // transpileDependencies: [''],
    publicPath: process.env.NODE_ENV === 'production' ? '/mperm/' : '/', //預先編譯至mperm子目錄下, 待轉成模板, 並於伺服器啟動後依照設定檔取代
}
