import axios from 'axios'
import isestr from 'wsemi/src/isestr.mjs'
import genPm from 'wsemi/src/genPm.mjs'


let _url = ''


function iniPerm(url) {
    _url = url
}


async function getPerm(token) {

    //check
    if (!isestr(_url)) {
        throw new Error(`invalid url, need to use iniPerm to set url`)
    }

    //pm
    let pm = genPm()

    //url
    let url = `${_url}?token=${token}`

    //axios
    await axios({
        method: 'get',
        url,
        // headers: { 'Content-Type': 'application/json; charset=utf-8' },
        // data: rin,
    })
        .then((res) => {
            // console.log(res)
            let r = {
                msg: '成功取得使用者權限',
                res,
            }
            pm.resolve(r)
        })
        .catch((err) => {
            // console.log(err)
            let r = {
                msg: '取得使用者權限發生錯誤',
                res: err,
            }
            pm.reject(r)
        })

    return pm
}


let perm = {
    iniPerm,
    getPerm,
}


export default perm
