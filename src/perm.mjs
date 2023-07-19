import axios from 'axios'
import isestr from 'wsemi/src/isestr.mjs'


let _url = ''


function iniPerm(url) {
    _url = url
}


function getPerm(token = '') {

    //check
    if (!isestr(_url)) {
        throw new Error(`invalid url, need to use iniPerm to set url`)
    }

    // //pm
    // let pm = genPm()

    //url
    let url = ''
    if (isestr(token)) {
        url = `${_url}?token=${token}`
    }
    else {
        url = _url
    }

    //axios
    let pm = axios({
        method: 'get',
        url,
        // headers: { 'Content-Type': 'application/json; charset=utf-8' },
        // data: rin,
    })
    // .then((res) => {
    //     console.log(res)
    //     let r = {
    //         msg: '成功取得使用者權限',
    //         res,
    //     }
    //     pm.resolve(r)
    // })
    // .catch((err) => {
    //     console.log(err)
    //     let r = {
    //         msg: '取得使用者權限發生錯誤',
    //         res: err,
    //     }
    //     pm.reject(r)
    // })

    return pm
}


let perm = {
    iniPerm,
    getPerm,
}


export default perm
