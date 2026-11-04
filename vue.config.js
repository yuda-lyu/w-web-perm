module.exports = {
    productionSourceMap: false, //不產出map檔
    lintOnSave: false, //禁止eslint-loader於編譯時檢查語法
    devServer: {
        proxy: {
            '/api': {
                //e2e 多開(E2E_PORT_OFFSET, 排程第 302 項)時代理到本實例之後端(11006＋位移); 未設時值為 11006, 與導入前相同
                target: 'http://localhost:' + (11006 + Number(process.env.E2E_PORT_OFFSET || 0)),
                pathRewrite: {
                    '^/api': '/api'
                },
            },
        }
    },
    // transpileDependencies: [''],
    publicPath: process.env.NODE_ENV === 'production' ? '/mperm/' : '/', //預先編譯至mperm子目錄下, 待轉成模板, 並於伺服器啟動後依照設定檔取代
}
