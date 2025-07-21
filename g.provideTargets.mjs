import map from 'lodash-es/map.js'
import ds from './src/schema/index.mjs'
import provideTabs from './server/provideTabs.mjs'


async function provide() {

    let keyTable = 'targets'

    let from = `pd`

    let url = `http://localhost:11006/syncAndReplaceTabs?keyTable=${keyTable}&token=sys`

    let rs = [

        'pd-專案A/頁A/區塊A',
        'pd-專案A/頁A/區塊A/執行按鈕',
        'pd-專案A/頁A/區塊A/分析按鈕',

        'pd-專案A/頁B/區塊A',
        'pd-專案A/頁B/區塊A/執行按鈕',
        'pd-專案A/頁B/區塊A/分析按鈕',

        'pd-專案A/頁B/區塊B/展開按鈕',
        'pd-專案A/頁B/區塊B/下載按鈕',

        'pd-專案A/頁C',

        'pd-專案B/頁A/區塊A',
        'pd-專案B/頁A/區塊A/顯示綜合報表',
        'pd-專案B/頁A/區塊A/顯示當前數據',
        'pd-專案B/頁A/區塊B',
        'pd-專案B/頁A/區塊B/下載報表按鈕',
        'pd-專案B/頁A/區塊B/下載數據按鈕',
        'pd-專案B/頁A/區塊C',

        'pd-專案B/頁B/區塊A',
        'pd-專案B/頁B/區塊A/待辦事項清單',
        'pd-專案B/頁B/區塊A/相關資源清單',
        'pd-專案B/頁B/區塊B',
        'pd-專案B/頁B/區塊B/顯示後台按鈕',
        'pd-專案B/頁B/區塊B/轉跳主站按鈕',

    ]
    rs = map(rs, (key, k) => {
        let v = ds.targets.funNew({
            order: k + 1000, //使能排序至最後, 不穿插至原測試數據
            description: `${key}的說明`,
        })
        v.id = key
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


//node g.provideTargets.mjs
