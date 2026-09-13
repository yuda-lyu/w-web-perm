import get from 'lodash-es/get.js'
import genPm from 'wsemi/src/genPm.mjs'
import haskey from 'wsemi/src/haskey.mjs'
import ltdtpick from 'wsemi/src/ltdtpick.mjs'
import fetchJson from '../src/fetchJson.mjs'


//kpKs
let ks_targets = [
    'id',
    'order', //order大部分由外部給予, 得要開啟
    'description',
    'from',
    // 'userId',
    // 'timeCreate',
    // 'userIdUpdate',
    // 'timeUpdate',
]
let ks_pemis = [
    'id',
    'order', //order大部分由外部給予, 得要開啟
    'name',
    'description',
    'from',
    'crules',
    // 'userId',
    // 'timeCreate',
    // 'userIdUpdate',
    // 'timeUpdate',
]
let ks_grups = [
    'id',
    'order', //order大部分由外部給予, 得要開啟
    'name',
    'description',
    'from',
    'cpemis',
    // 'userId',
    // 'timeCreate',
    // 'userIdUpdate',
    // 'timeUpdate',
]
let ks_users = [
    'id',
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
let kpKs = {
    ks_targets,
    ks_pemis,
    ks_grups,
    ks_users,
}


async function provideTabs(url, keyTable, from, rows) {
    //url: 伺服器提供的接入網址, 例如 http://localhost:11006/syncAndReplaceTabs?keyTable={keyTable}&token={token}
    //keyTable: 資料表名
    //from: 指陣列數據來源
    //rows: 陣列數據

    //pm
    let pm = genPm()

    //ks
    if (!haskey(kpKs, `ks_${keyTable}`)) {
        return Promise.reject('invalidKeyTable')
    }
    let ks = kpKs[`ks_${keyTable}`]
    // console.log('ks', ks)

    //ltdtpick
    rows = ltdtpick(rows, ks)
    // console.log('rows', rows)

    //rin
    let rin = {
        from,
        rows,
    }
    // console.log('rin', rin)

    //post, 內建 fetch(不依賴 axios); fetchJson 直接 resolve JSON envelope(原 axios 之 res.data),
    //網路錯誤 / 非 2xx / 非 JSON 回應 reject { kind, status, message }(原為 AxiosError)
    await fetchJson(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(rin),
    })
        .then((data) => {
            // console.log('then', data)
            let state = get(data, 'state')
            let msg = get(data, 'msg', '')
            if (state === 'success') {
                pm.resolve(msg)
            }
            else {
                pm.reject(msg)
            }

        })
        .catch((err) => {
            // console.log('catch', err)
            pm.reject(err)
        })

    return pm
}


export default provideTabs
