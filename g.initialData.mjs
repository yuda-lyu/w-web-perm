import map from 'lodash-es/map'
import ds from './src/schema/index.mjs'
import { woItems } from './g.mOrm.mjs'


async function initialData() {
    let rs


    rs = [
        ['viewer', '普通瀏覽者', 'id-for-權限群組1'],
        ['basic', '一般使用者', 'id-for-權限群組2'],
        ['admin', '系統管理者', 'id-for-權限群組3'],
    ]
    rs = map(rs, ([key, name, ruleGroupsIds], k) => {
        let v = ds.users.funNew({
            order: k,
            name,
            email: `${key}@example.com`,
            ruleGroupsIds,
            userId: 'id-for-admin',
        })
        v.id = `id-for-${key}`
        if (key === 'admin') {
            v.isAdmin = 'y'
        }
        return v
    })
    await woItems.users.delAll()
    await woItems.users.insert(rs)


    //人工建置數據時得要嚴格建立各階分層, 否則會無法查找到自動建立之parentId
    rs = [
        '專案A',
        '專案A/頁A',
        '專案A/頁A/區塊A',
        '專案A/頁A/區塊A/執行按鈕',
        '專案A/頁A/區塊A/分析按鈕',
        '專案A/頁B',
        '專案A/頁B/區塊A',
        '專案A/頁B/區塊A/執行按鈕',
        '專案A/頁B/區塊A/分析按鈕',
        '專案A/頁B/區塊B',
        '專案A/頁B/區塊B/展開按鈕',
        '專案A/頁B/區塊B/下載按鈕',
        '專案B',
        '專案B/頁A',
        '專案B/頁A/區塊A',
        '專案B/頁A/區塊A/下載報表按鈕',
        '專案B/頁A/區塊A/下載數據按鈕',
        '專案B/頁B/區塊A',
        '專案B/頁B/區塊B',
        '專案B/頁B/區塊B/顯示後台按鈕',
        '專案B/頁B/區塊B/轉跳主站按鈕',
    ]
    rs = map(rs, (key, k) => {
        let v = ds.targets.funNew({
            order: k,
            description: key,
        })
        v.id = key
        return v
    })
    await woItems.targets.delAll()
    await woItems.targets.insert(rs)

    rs = [
        ['權限群組1', '權限群組1之說明',
            `{ 
                "___all___": { "show": "y", "active": "n" }, 
                "專案A/頁A": { "show": "y", "active": "y" }, 
                "專案A/頁B": { "show": "n", "active": "n" },
            }`
        ],
        ['權限群組2', '權限群組2之說明',
            `{ 
                "___all___": { "show": "y", "active": "n" }, 
            }`
        ],
        ['權限群組3', '權限群組3之說明',
            `{ 
                "___all___": { "show": "y", "active": "y" }, 
            }`
        ],
    ]
    rs = map(rs, ([name, description, crules], k) => {
        let v = ds.ruleGroups.funNew({
            order: k,
            name,
            description,
            crules,
            userId: 'id-for-admin',
        })
        v.id = `id-for-${name}`
        return v
    })
    await woItems.ruleGroups.delAll()
    await woItems.ruleGroups.insert(rs)


}

initialData()
    .catch((err) => {
        console.log('initialData catch', err)
    })


//重建資料庫
//node --experimental-modules --es-module-specifier-resolution=node g.initialData.mjs
