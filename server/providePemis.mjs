import axios from 'axios'
import ltdtpick from 'wsemi/src/ltdtpick.mjs'
import genPm from 'wsemi/src/genPm.mjs'


async function providePemis(url, from, pemis) {
    //url: 指權限伺服器提供的調整pemis網址, 例如 http://localhost:11006/syncAndReplacePemis
    //from: 指pemis來源

    //pm
    let pm = genPm()

    //ks
    let ks = [
        // 'id',
        'order', //order大部分由外部給予, 得要開啟
        'name',
        'description',
        'crules',
        // 'userId',
        // 'timeCreate',
        // 'userIdUpdate',
        // 'timeUpdate',
    ]

    //ltdtpick
    pemis = ltdtpick(pemis, ks)

    //rin
    let rin = {
        from,
        pemis,
    }
    // rin = JSON.stringify(rin)

    //axios
    await axios({
        method: 'post',
        url,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        data: rin,
    })
        .then((res) => {
            // console.log(res)
            let r = {
                msg: '成功傳輸pemis清單',
                res,
            }
            pm.resolve(r)
        })
        .catch((err) => {
            // console.log(err)
            let r = {
                msg: '無法傳輸pemis清單',
                res: err,
            }
            pm.reject(r)
        })

    return pm
}


export default providePemis
