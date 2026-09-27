import get from 'lodash-es/get.js'
import isestr from 'wsemi/src/isestr.mjs'
import iseobj from 'wsemi/src/iseobj.mjs'
import isfun from 'wsemi/src/isfun.mjs'
import fetchJson from './fetchJson.mjs'


async function getPermUserInfor(url, tokenSelf, userIdTar, opt = {}) {
    //url: http://localhost:11006/api/getPermUserInfor?token={sysToken}&userId={userId}
    let errTemp = null

    //check
    if (!isestr(url)) {
        return Promise.reject('invalidUrl')
    }
    if (!isestr(tokenSelf)) {
        return Promise.reject('invalidTokenSelf')
    }
    if (!isestr(userIdTar)) {
        return Promise.reject('invalidUserIdTar')
    }

    //funConvertPerm
    let funConvertPerm = get(opt, 'funConvertPerm')

    //url, 兩個佔位符缺一即拒(原為 &&: 只有兩者皆缺才拒, 缺一時仍送出請求; 對齊 w-web-sso ADR-056 修正紀錄)
    if (url.indexOf('token={sysToken}') < 0 || url.indexOf('userId={userId}') < 0) {
        return Promise.reject('noTokenUserIdInUrl')
    }
    //代入: 值經 encodeURIComponent 並以 split / join 取代(ADR-023); 不用 replaceAll——其取代字串會解讀 $` $& $' 等樣式(userIdTar 含 $` 時會把已代入之介接權杖複製進 userId),
    //不編碼時 + 被伺服端解成空白、& 與 = 形成額外參數, 值內之 {userId} 字樣亦會被二次代入. 對 UUID、英數與 -_.~ 為恆等轉換
    url = url.split('{sysToken}').join(encodeURIComponent(tokenSelf)) //系統介接用permToken
    url = url.split('{userId}').join(encodeURIComponent(userIdTar))
    // console.log('getPermUserInfor: url', url)

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
    // console.log('getPermUserInfor ur(msg)', ur)

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
        // console.log('getPermUserInfor ur(funConvertPerm)', ur)

        //check
        if (!iseobj(ur)) {
            return Promise.reject('noUserDataAfterConvert')
        }

    }

    return ur
}


export default getPermUserInfor
