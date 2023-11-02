import axios from 'axios'
import ltdtpick from 'wsemi/src/ltdtpick.mjs'
import genPm from 'wsemi/src/genPm.mjs'


async function provideRuleGroups(url, from, ruleGroups) {
    //url: 指權限伺服器提供的調整ruleGroups網址, 例如 http://localhost:11006/syncAndReplaceRuleGroups
    //from: 指ruleGroup來源

    //pm
    let pm = genPm()

    //ks
    let ks = [
        'id',
        'order',
        'name',
        'description',
        'from',
        'crules',
        'userId',
        'timeCreate',
        'userIdUpdate',
        'timeUpdate',
    ]

    //ltdtpick
    ruleGroups = ltdtpick(ruleGroups, ks)

    //rin
    let rin = {
        from,
        ruleGroups,
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
                msg: '成功傳輸RuleGroups清單',
                res,
            }
            pm.resolve(r)
        })
        .catch((err) => {
            // console.log(err)
            let r = {
                msg: '無法傳輸RuleGroups清單',
                res: err,
            }
            pm.reject(r)
        })

    return pm
}


export default provideRuleGroups
