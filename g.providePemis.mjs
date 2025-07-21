import map from 'lodash-es/map.js'
import ds from './src/schema/index.mjs'
import provideTabs from './server/provideTabs.mjs'


async function provide() {

    let keyTable = 'pemis'

    let from = `pd`

    let url = `http://localhost:11006/syncAndReplaceTabs?keyTable=${keyTable}&token=sys`

    let rs = [

        ['pd-權限P1', `{  "pd-專案A/頁A/區塊A": 'y', "pd-專案A/頁B/區塊A": 'n', "pd-專案A/頁C": 'n' }`],
        ['pd-權限P2', `{  "pd-專案A/頁C": 'y', "pd-專案B/頁A/區塊A": 'y', "pd-專案B/頁A/區塊B": 'y' }`],
        ['pd-權限P3', `{  "pd-專案A/頁C": 'y', "pd-專案B/頁A/區塊A": 'n', "pd-專案B/頁A/區塊B": 'y', "pd-專案B/頁A/區塊C": 'y' }`],
        ['pd-權限P4', `{  "pd-專案B/頁B/區塊A/待辦事項清單": 'y', "pd-專案B/頁B/區塊B/顯示後台按鈕": 'n' }`],

    ]
    rs = map(rs, ([name, crules], k) => {
        let v = ds.pemis.funNew({
            order: k + 1000, //使能排序至最後, 不穿插至原測試
            name,
            description: `${name}的說明`,
            crules,
        })
        v.id = `id-for-${name}`
        return v
    })
    console.log('rs', rs)

    let r = await provideTabs(url, keyTable, from, rs)
    console.log('r', r)

}

provide()
    .catch((err) => {
        console.log('provide catch', err)
    })


//node g.providePemis.mjs
