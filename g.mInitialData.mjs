import map from 'lodash/map'
import ds from './src/schema/index.mjs'
import { woItems } from './g.mOrm.mjs'


async function initialData() {
    let rs


    //人工建置數據時得要嚴格建立各階分層, 否則會無法查找到自動建立之parentId
    rs = [
        '主要資訊',
        '主要資訊/主選單區',
        '主要資訊/內容區',
        '主要資訊/內容區/待處理任務區',
        '計畫資料管理系統',
        '計畫資料管理系統/主選單區',
        '計畫資料管理系統/內容區',
        '計畫資料管理系統/內容區/另存按鈕',
        '計畫資料管理系統/內容區/刪除按鈕',
        '計畫資料管理系統/內容區/查詢',
        // '計畫資料管理系統/內容區/查詢/關鍵字功能',
        '計畫資料管理系統/內容區/查詢/分類功能',
        '計畫資料管理系統/內容區/查詢/計畫功能',
        '計畫資料管理系統/內容區/查詢/欄位功能',
        '輔助參考文獻系統',
        '輔助參考文獻系統/主選單區',
        '需求管理系統',
        '需求管理系統/主選單區',
        '需求管理系統/內容區',
        '需求管理系統/內容區/編輯按鈕',
        '知識管理系統',
        '知識管理系統/主選單區',
        '知識管理系統/內容區',
        '知識管理系統/內容區/編輯按鈕',
        'GIS(2D)',
        'GIS(2D)/主選單區',
        '模板下載',
        '模板下載/主選單區',
        '批次上傳系統',
        '批次上傳系統/主選單區',
        'API管理系統',
        'API管理系統/主選單區',
        '後台管理系統',
        '後台管理系統/主選單區',
    ]
    rs = map(rs, (key, k) => {
        let v = ds.targets.funNew({
            description: key,
        })
        v.id = key
        return v
    })
    await woItems.targets.delAll()
    await woItems.targets.insert(rs)


    rs = [
        ['L0權限群組', '普通瀏覽者用之權限群組',
            `{ "___all___": { "show": "n", "active": "n" }, 
            "主要資訊": { "show": "y", "active": "y" }, 
            "主要資訊/主選單區": { "show": "y", "active": "y" }, 
            "計畫資料管理系統": { "show": "y", "active": "y" }, 
            "計畫資料管理系統/主選單區": { "show": "y", "active": "y" }, 
            "計畫資料管理系統/內容區": { "show": "y", "active": "y" }, 
            "需求管理系統": { "show": "y", "active": "y" }, 
            "需求管理系統/主選單區": { "show": "y", "active": "y" }, 
            "知識管理系統": { "show": "y", "active": "y" }, 
            "知識管理系統/主選單區": { "show": "y", "active": "y" }, 
            "GIS": { "show": "y", "active": "y" }, 
            "GIS/主選單區": { "show": "y", "active": "y" }, 
            "模板下載": { "show": "y", "active": "y" }, 
            "模板下載/主選單區": { "show": "y", "active": "y" }, 
        }`],
        ['L1權限群組', '一般使用者用之權限群組',
            `{ "___all___": { "show": "n", "active": "n" }, 
            "主要資訊": { "show": "y", "active": "y" }, 
            "主要資訊/主選單區": { "show": "y", "active": "y" }, 
            "計畫資料管理系統": { "show": "y", "active": "y" }, 
            "計畫資料管理系統/主選單區": { "show": "y", "active": "y" }, 
            "計畫資料管理系統/內容區": { "show": "y", "active": "y" }, 
            "計畫資料管理系統/內容區/編輯按鈕": { "show": "y", "active": "n" }, 
            "輔助參考文獻系統": { "show": "y", "active": "y" }, 
            "輔助參考文獻系統/主選單區": { "show": "y", "active": "y" }, 
            "需求管理系統": { "show": "y", "active": "y" }, 
            "需求管理系統/主選單區": { "show": "y", "active": "y" }, 
            "需求管理系統/內容區": { "show": "y", "active": "y" },
            "需求管理系統/內容區/編輯按鈕": { "show": "y", "active": "n" },
            "知識管理系統": { "show": "y", "active": "y" }, 
            "知識管理系統/主選單區": { "show": "y", "active": "y" }, 
            "知識管理系統/內容區": { "show": "y", "active": "y" },
            "知識管理系統/內容區/編輯按鈕": { "show": "y", "active": "n" },
            "GIS": { "show": "y", "active": "y" }, 
            "GIS/主選單區": { "show": "y", "active": "y" }, 
            "模板下載": { "show": "y", "active": "y" }, 
            "模板下載/主選單區": { "show": "y", "active": "y" }, 
        }`],
        ['L2權限群組', '系統管理者用之權限群組',
            `{ "___all___": { "show": "y", "active": "y" } }`],
    ]
    rs = map(rs, ([name, description, crules], k) => {
        let v = ds.ruleGroups.funNew({
            userId: 'id-for-admin',
            name,
            description,
            crules,
        })
        v.id = `id-for-${name}`
        v.order = k
        return v
    })
    await woItems.ruleGroups.delAll()
    await woItems.ruleGroups.insert(rs)


    rs = [
        ['viewer', '普通瀏覽者', 'id-for-L0權限群組'],
        ['basic', '一般使用者', 'id-for-L1權限群組'],
        ['admin', '系統管理者', 'id-for-L2權限群組'],
    ]
    rs = map(rs, ([key, name, ruleGroupsIds], k) => {
        let v = ds.users.funNew({
            userId: 'id-for-admin',
            name,
            email: `${key}@example.com`,
            ruleGroupsIds,
        })
        v.id = `id-for-${key}`
        if (key === 'admin') {
            v.isAdmin = 'y'
        }
        return v
    })
    await woItems.users.delAll()
    await woItems.users.insert(rs)


}

initialData()
    .catch((err) => {
        console.log('initialData catch', err)
    })


//重建資料庫
//node --experimental-modules --es-module-specifier-resolution=node g.mInitialData.mjs
