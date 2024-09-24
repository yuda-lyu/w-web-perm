import map from 'lodash-es/map.js'
import ds from './src/schema/index.mjs'
import { woItems } from './g.mOrm.mjs'


async function initialData() {
    let rs


    rs = [

        '專案A/頁A/區塊A',
        '專案A/頁A/區塊A/執行按鈕',
        '專案A/頁A/區塊A/分析按鈕',

        '專案A/頁B/區塊A',
        '專案A/頁B/區塊A/執行按鈕',
        '專案A/頁B/區塊A/分析按鈕',

        '專案A/頁B/區塊B/展開按鈕',
        '專案A/頁B/區塊B/下載按鈕',

        '專案A/頁C',

        '專案B/頁A/區塊A',
        '專案B/頁A/區塊A/顯示綜合報表',
        '專案B/頁A/區塊A/顯示當前數據',
        '專案B/頁A/區塊B',
        '專案B/頁A/區塊B/下載報表按鈕',
        '專案B/頁A/區塊B/下載數據按鈕',
        '專案B/頁A/區塊C',

        '專案B/頁B/區塊A',
        '專案B/頁B/區塊A/待辦事項清單',
        '專案B/頁B/區塊A/相關資源清單',
        '專案B/頁B/區塊B',
        '專案B/頁B/區塊B/顯示後台按鈕',
        '專案B/頁B/區塊B/轉跳主站按鈕',

    ]
    rs = map(rs, (key, k) => {
        let v = ds.targets.funNew({
            userId: 'id-for-admin',
            order: k,
            description: `${key}的說明`,
        })
        v.id = key
        return v
    })
    await woItems.targets.delAll()
    await woItems.targets.insert(rs)


    rs = [

        ['權限P1', `{  "專案A/頁A/區塊A": 'y', "專案A/頁B/區塊A": 'n', "專案A/頁C": 'n' }`],
        ['權限P2', `{  "專案A/頁C": 'y', "專案B/頁A/區塊A": 'y', "專案B/頁A/區塊B": 'y' }`],
        ['權限P3', `{  "專案A/頁C": 'y', "專案B/頁A/區塊A": 'n', "專案B/頁A/區塊B": 'y', "專案B/頁A/區塊C": 'y' }`],
        ['權限P4', `{  "專案B/頁B/區塊A/待辦事項清單": 'y', "專案B/頁B/區塊B/顯示後台按鈕": 'n' }`],

    ]
    rs = map(rs, ([name, crules], k) => {
        let v = ds.pemis.funNew({
            userId: 'id-for-admin',
            order: k,
            name,
            description: `${name}的說明`,
            crules,
        })
        v.id = `id-for-${name}`
        return v
    })
    await woItems.pemis.delAll()
    await woItems.pemis.insert(rs)


    rs = [

        ['權限群組M1', `
            {
                '權限P1': {
                    'mode': 'OR',
                    'isActive': 'y',
                },
                '權限P2': {
                    'mode': 'OR',
                    'isActive': 'y',
                },
            }
        `],
        ['權限群組M2', `
            {
                '權限P2': {
                    'mode': 'OR',
                    'isActive': 'y',
                },
                '權限P3': {
                    'mode': 'OR',
                    'isActive': 'y',
                },
            }
        `],
        ['權限群組M3', `
            {
                '權限P2': {
                    'mode': 'OR',
                    'isActive': 'y',
                },
                '權限P3': {
                    'mode': 'AND',
                    'isActive': 'y',
                },
            }
        `],
        ['權限群組M4', `
            {
                '權限P3': {
                    'mode': 'OR',
                    'isActive': 'y',
                },
                '權限P4': {
                    'mode': 'OR',
                    'isActive': 'y',
                },
            }
        `],

    ]
    rs = map(rs, ([name, cpemis], k) => {
        let v = ds.grups.funNew({
            userId: 'id-for-admin',
            order: k,
            name,
            description: `${name}的說明`,
            cpemis,
        })
        v.id = `id-for-${name}`
        return v
    })
    await woItems.grups.delAll()
    await woItems.grups.insert(rs)


    rs = [

        ['peter', 'teamA', `
            { 
                '權限群組M1': {
                    'mode': 'OR',
                    'isActive': 'y',
                }
            }
        `, 'n'],
        ['mary', 'teamA', `
            { 
                '權限群組M2': {
                    'mode': 'OR',
                    'isActive': 'y',
                }
            }
        `, 'n'],
        ['john', 'teamA', `
            { 
                '權限群組M3': {
                    'mode': 'OR',
                    'isActive': 'y',
                }
            }
        `, 'n'],
        ['admin', '', `
            { 
                '權限群組M4': {
                    'mode': 'OR',
                    'isActive': 'y',
                }
            }
        `, 'y'],

    ]
    rs = map(rs, ([name, from, cgrups, isAdmin], k) => {
        let v = ds.users.funNew({
            userId: 'id-for-admin',
            order: k,
            name,
            email: `${name}@example.com`,
            from,
            cgrups,
            isAdmin,
        })
        v.id = `id-for-${name}`
        if (name === 'john') {
            v.email = `${v.email};john@test.com`
        }
        v.isAdmin = isAdmin //funNew會複寫isAdmin為n, 得另外重置
        return v
    })
    await woItems.users.delAll()
    await woItems.users.insert(rs)


    console.log('finish.')
}

initialData()
    .catch((err) => {
        console.log('initialData catch', err)
    })


//重建資料庫
//node --experimental-modules g.initialData.mjs
