import axios from 'axios'
import ltdtpick from 'wsemi/src/ltdtpick.mjs'
import genPm from 'wsemi/src/genPm.mjs'


async function provideGrups(url, from, grups) {
    //url: 指權限伺服器提供的調整grups網址, 例如 http://localhost:11006/syncAndReplaceGrups
    //from: 指grups來源

    //pm
    let pm = genPm()

    //ks
    let ks = [
        // 'id',
        'order', //order大部分由外部給予, 得要開啟
        'name',
        'description',
        'cpemis',
        // 'userId',
        // 'timeCreate',
        // 'userIdUpdate',
        // 'timeUpdate',
    ]

    //ltdtpick
    grups = ltdtpick(grups, ks)

    //rin
    let rin = {
        from,
        grups,
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
                msg: '成功傳輸grups清單',
                res,
            }
            pm.resolve(r)
        })
        .catch((err) => {
            // console.log(err)
            let r = {
                msg: '無法傳輸grups清單',
                res: err,
            }
            pm.reject(r)
        })

    return pm
}


export default provideGrups
