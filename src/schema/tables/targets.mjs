import map from 'lodash-es/map.js'
import keys from 'lodash-es/keys.js'
import genIDSeq from 'wsemi/src/genIDSeq.mjs'
import dtmapping from 'wsemi/src/dtmapping.mjs'
import dtpick from 'wsemi/src/dtpick.mjs'
import nowms2str from 'wsemi/src/nowms2str.mjs'


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
    description: {
        name: '說明',
        type: 'TEXT',
    },
    from: {
        name: '來源', //供外部批次變更使用
        type: 'STRING',
    },
    userId: {
        name: '創建使用者主鍵',
        type: 'STRING',
    },
    timeCreate: {
        name: '創建時間',
        type: 'STRING',
    },
    userIdUpdate: {
        name: '最新變更使用者主鍵',
        type: 'STRING',
    },
    timeUpdate: {
        name: '更新時間',
        type: 'STRING',
    },
    // isActive: {
    //     name: '是否有效',
    //     type: 'STRING',
    // },
}

let funNew = (ndata = {}) => {
    let o = dtmapping(ndata, keys(settings))
    o.id = `${genIDSeq()}`
    o.userIdUpdate = o.userId
    o.timeCreate = nowms2str()
    o.userIdUpdate = o.userId
    o.timeUpdate = o.timeCreate
    // o.isActive = 'y'
    return o
}

let funTest = () => {
    let rs = [

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
        let v = funNew({
            userId: 'id-for-admin',
            order: k,
            description: `${key}的說明`,
        })
        v.id = key
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

