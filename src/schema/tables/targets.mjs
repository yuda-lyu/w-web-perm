import map from 'lodash/map'
import keys from 'lodash/keys'
import genID from 'wsemi/src/genID.mjs'
import dtmapping from 'wsemi/src/dtmapping.mjs'
import dtpick from 'wsemi/src/dtpick.mjs'
// import nowms2str from 'wsemi/src/nowms2str.mjs'
import now2strp from 'wsemi/src/now2strp.mjs'


let keyTable = 'targets'
let tableNameCht = '管控對象'
let tableNameEng = 'Targets'

let settings = {
    id: {
        pk: true,
        name: '主鍵', //儲存對象路徑, 不同階層用句點「.」分開, 可用unicode
        type: 'STRING',
    },
    order: {
        name: '順序',
        type: 'INTEGER',
    },
    // key: {
    //     name: '所屬區塊識別鍊',
    //     type: 'STRING',
    // },
    // name: {
    //     name: '區塊名稱',
    //     type: 'STRING',
    // },
    description: {
        name: '說明',
        type: 'TEXT',
    },
}

let funNew = (ndata = {}) => {
    let o = dtmapping(ndata, keys(settings))
    o.id = `${now2strp()}-${genID()}`
    // o.timeCreate = nowms2str()
    // o.timeUpdate = o.timeCreate
    // o.isActive = 'y'
    return o
}

let funTest = () => {
    let rs = [
        '專案A',
        '專案A.頁A',
        '專案A.頁A.區塊A',
        '專案A.頁A.區塊A.執行按鈕',
        '專案A.頁A.區塊A.分析按鈕',
        '專案A.頁B',
        '專案A.頁B.區塊A',
        '專案A.頁B.區塊A.執行按鈕',
        '專案A.頁B.區塊A.分析按鈕',
        '專案A.頁B.區塊B',
        '專案A.頁B.區塊B.展開按鈕',
        '專案A.頁B.區塊B.下載按鈕',
        '專案B',
        '專案B.頁A',
        '專案B.頁A.區塊A',
        '專案B.頁A.區塊A.下載報表按鈕',
        '專案B.頁A.區塊A.下載數據按鈕',
        '專案B.頁B.區塊A',
        '專案B.頁B.區塊B',
        '專案B.頁B.區塊B.顯示後台按鈕',
        '專案B.頁B.區塊B.轉跳主站按鈕',
        // '主題列表',
        // '主題列表.隱藏已刪除',
        // '主題列表.新增主題',
        // '主題列表.主題排序',
        // '主題列表.編輯主題',
        // '主題列表.刪除主題',
        // '後台管理',
        // '權限管理',
    ]
    rs = map(rs, (key, k) => {
        let v = funNew({ userId: 'id-for-admin', description: key })
        v.id = `id-for-${key}`
        v = dtpick(v, keys(settings))
        return v
    })
    console.log(`已產生: ${keyTable} 測試資料`, rs)
    return rs
}

let tab = {
    keyTable,
    tableNameCht,
    tableNameEng,
    settings,
    funNew,
    funTest,
}


export default tab

