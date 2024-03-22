import map from 'lodash-es/map'
import ds from './src/schema/index.mjs'
import provideTargets from './server/provideTargets.mjs'


async function provide() {

    let url = `http://localhost:11006/syncAndReplaceTargets?token=sys`

    let from = `pd`

    let rs = [
        'pd-專案A',
        'pd-專案A/頁A',
        'pd-專案A/頁A/區塊A',
        'pd-專案A/頁A/區塊A/執行按鈕',
        'pd-專案A/頁A/區塊A/分析按鈕',
        'pd-專案A/頁B',
        'pd-專案A/頁B/區塊A',
        'pd-專案A/頁B/區塊A/執行按鈕',
        'pd-專案A/頁B/區塊A/分析按鈕',
        'pd-專案A/頁B/區塊B',
        'pd-專案A/頁B/區塊B/展開按鈕',
        'pd-專案A/頁B/區塊B/下載按鈕',
        'pd-專案B',
        'pd-專案B/頁A',
        'pd-專案B/頁A/區塊A',
        'pd-專案B/頁A/區塊A/下載報表按鈕',
        'pd-專案B/頁A/區塊A/下載數據按鈕',
        'pd-專案B/頁B/區塊A',
        'pd-專案B/頁B/區塊B',
        'pd-專案B/頁B/區塊B/顯示後台按鈕',
        'pd-專案B/頁B/區塊B/轉跳主站按鈕',
    ]
    rs = map(rs, (key, k) => {
        let v = ds.targets.funNew({
            order: 1000 + k,
            description: key,
            from,
        })
        v.id = key
        return v
    })
    console.log('rs', rs)

    let r = await provideTargets(url, from, rs)
    console.log('r.msg', r.msg)

}

provide()
    .catch((err) => {
        console.log('provide catch', err)
    })


//node --experimental-modules --es-module-specifier-resolution=node g.provideTargets.mjs
