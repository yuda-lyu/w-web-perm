import axios from 'axios'
import get from 'lodash-es/get.js'
import isestr from 'wsemi/src/isestr.mjs'
import iseobj from 'wsemi/src/iseobj.mjs'
import isfun from 'wsemi/src/isfun.mjs'
import ispm from 'wsemi/src/ispm.mjs'


async function getPermUserInfor(url, tokenSelf, userIdTar, opt = {}) {
    //url: http://localhost:11006/api/getPermUserInfor?token={sysToken}&userId={userId}
    let errTemp = null

    //check
    if (!isestr(url)) {
        return Promise.reject('invalid url')
    }
    if (!isestr(tokenSelf)) {
        return Promise.reject('invalid tokenSelf')
    }
    if (!isestr(userIdTar)) {
        return Promise.reject('invalid userIdTar')
    }

    //funConvertPerm
    let funConvertPerm = get(opt, 'funConvertPerm')

    //url
    if (url.indexOf('token={sysToken}') < 0 && url.indexOf('userId={userId}') < 0) {
        return Promise.reject(`no 'token={sysToken}', 'userId={userId}' in url`)
    }
    url = url.replaceAll('{sysToken}', tokenSelf) //系統介接用permToken
    url = url.replaceAll('{userId}', userIdTar)
    // console.log('getPermUserInfor: url', url)

    //get
    let res = await axios.get(url)
        .catch((err) => {
            errTemp = err.toString()
        })

    //check
    if (errTemp !== null) {
        console.log('res', res)
        console.log('errTemp', errTemp)
        console.log(`can not get user by url[${url}]`)
        return Promise.reject(`can not get user by url[${url}]`) //由SSO取得使用者資訊錯誤
    }

    //data
    let data = get(res, 'data')

    //state
    let state = get(data, 'state', '')

    //msg
    let msg = get(data, 'msg')

    //check
    if (state !== 'success') {
        console.log('res', res)
        console.log('data', data)
        console.log('state', state)
        console.log('errTemp', msg)
        console.log(`can not get user data by url[${url}]`)
        return Promise.reject(`can not get user data by url[${url}]`) //取得使用者資訊失敗
    }

    //ur
    let ur = msg
    // console.log('getPermUserInfor ur(msg)', ur)

    //check
    if (!iseobj(ur)) {
        console.log(`no user data by url[${url}]`)
        return Promise.reject(`no user data by url[${url}]`)
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
            console.log(`no user data after funConvertPerm`)
            return Promise.reject(`no user data after funConvertPerm`)
        }

    }

    return ur
}


export default getPermUserInfor
