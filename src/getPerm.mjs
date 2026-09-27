import get from 'lodash-es/get.js'
import isestr from 'wsemi/src/isestr.mjs'
import iseobj from 'wsemi/src/iseobj.mjs'
import isfun from 'wsemi/src/isfun.mjs'
import fetchJson from './fetchJson.mjs'


async function getPerm(url, tokenTar, opt = {}) {
    //url: http://localhost:11006/api/getPerm?token={token}
    let errTemp = null

    //check
    if (!isestr(url)) {
        return Promise.reject('invalidUrl')
    }
    if (!isestr(tokenTar)) {
        return Promise.reject('invalidTokenTar')
    }

    //funConvertPerm
    let funConvertPerm = get(opt, 'funConvertPerm')

    //url
    if (url.indexOf('token={token}') < 0) {
        return Promise.reject('noTokenInUrl')
    }
    //代入: 值經 encodeURIComponent 並以 split / join 取代(ADR-023); 不用 replaceAll——其取代字串會解讀 $` $& $' 等樣式(可把佔位符前之網址前綴複製進查詢值),
    //不編碼時 + 被伺服端解成空白、& 與 = 形成額外參數. 對 UUID、英數與 -_.~ 為恆等轉換
    url = url.split('{token}').join(encodeURIComponent(tokenTar))
    // console.log('getPerm: url', url)

    //get, 內建 fetch(不依賴 axios); 網路錯誤或非 2xx → cannotGetUserByUrl, 回應非 JSON → cannotGetUserDataByUrl(對齊 axios 時期語意)
    let data = await fetchJson(url)
        .catch((err) => {
            errTemp = err
        })

    //check
    if (errTemp !== null) {
        if (get(errTemp, 'kind') === 'parse') {
            return Promise.reject('cannotGetUserDataByUrl') //取得使用者資訊失敗
        }
        return Promise.reject('cannotGetUserByUrl') //由SSO取得使用者資訊錯誤
    }

    //state
    let state = get(data, 'state', '')

    //msg
    let msg = get(data, 'msg')

    //check
    if (state !== 'success') {
        return Promise.reject('cannotGetUserDataByUrl') //取得使用者資訊失敗
    }

    //ur
    let ur = msg
    // console.log('getPerm ur(msg)', ur)

    //check
    if (!iseobj(ur)) {
        return Promise.reject('noUserDataByUrl')
    }

    //check
    if (isfun(funConvertPerm)) {

        //funConvertPerm, 同步拋錯或 reject 一律 reject 'noUserDataAfterConvert'(部署方之錯誤原文不上拋, ADR-023)
        try {
            ur = await funConvertPerm(ur) //await 於 try 內: 同步拋錯、reject 與 thenable 之 reject 皆攔截; 非 Promise 之回傳原樣取得
        }
        catch (err) {
            return Promise.reject('noUserDataAfterConvert')
        }
        // console.log('getPerm ur(funConvertPerm)', ur)

        //check
        if (!iseobj(ur)) {
            return Promise.reject('noUserDataAfterConvert')
        }

    }

    return ur
}


export default getPerm
