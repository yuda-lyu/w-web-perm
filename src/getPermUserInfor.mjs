import get from 'lodash-es/get.js'
import isestr from 'wsemi/src/isestr.mjs'
import iseobj from 'wsemi/src/iseobj.mjs'
import isfun from 'wsemi/src/isfun.mjs'
import ispm from 'wsemi/src/ispm.mjs'
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

    //url
    if (url.indexOf('token={sysToken}') < 0 && url.indexOf('userId={userId}') < 0) {
        return Promise.reject('noTokenUserIdInUrl')
    }
    url = url.replaceAll('{sysToken}', tokenSelf) //系統介接用permToken
    url = url.replaceAll('{userId}', userIdTar)
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

        //funConvertPerm
        ur = funConvertPerm(ur)
        if (ispm(ur)) {
            ur = await ur
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
