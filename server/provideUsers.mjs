import axios from 'axios'
import ltdtpick from 'wsemi/src/ltdtpick.mjs'
import genPm from 'wsemi/src/genPm.mjs'


async function provideUsers(url, from, users) {
    //url: 指權限伺服器提供的調整users網址, 例如 http://localhost:11006/syncAndReplaceUsers
    //from: 指user來源

    //pm
    let pm = genPm()

    //ks
    let ks = [
        // 'id',
        'order', //order大部分由外部給予, 得要開啟
        'name',
        'email',
        'description',
        'from',
        'cgrups',
        'isAdmin',
        'isActive',
        // 'userId',
        // 'timeCreate',
        // 'userIdUpdate',
        // 'timeUpdate',
    ]

    //ltdtpick
    users = ltdtpick(users, ks)

    //rin
    let rin = {
        from,
        users,
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
                msg: '成功傳輸user清單',
                res,
            }
            pm.resolve(r)
        })
        .catch((err) => {
            // console.log(err)
            let r = {
                msg: '無法傳輸user清單',
                res: err,
            }
            pm.reject(r)
        })

    return pm
}


export default provideUsers
