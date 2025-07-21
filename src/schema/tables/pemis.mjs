import map from 'lodash-es/map.js'
import keys from 'lodash-es/keys.js'
import genIDSeq from 'wsemi/src/genIDSeq.mjs'
import dtmapping from 'wsemi/src/dtmapping.mjs'
import dtpick from 'wsemi/src/dtpick.mjs'
import nowms2str from 'wsemi/src/nowms2str.mjs'


let keyTable = 'pemis'
let tableNameCht = '權限設定'
let tableNameEng = 'Permissions'


let settings = {
    id: {
        pk: true,
        name: '主鍵',
        type: 'STRING',
    },
    order: {
        name: '順序',
        type: 'INTEGER',
    },
    name: {
        name: '名稱',
        type: 'STRING',
    },
    description: {
        name: '說明',
        type: 'TEXT',
    },
    from: {
        name: '來源', //供外部批次變更使用
        type: 'STRING',
    },
    crules: {
        name: '管控對象清單', //為json字串
        type: 'TEXT',
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

        ['權限P1', `{  "專案A/頁A/區塊A": 'y', "專案A/頁B/區塊A": 'n', "專案A/頁C": 'n' }`],
        ['權限P2', `{  "專案A/頁C": 'y', "專案B/頁A/區塊A": 'y', "專案B/頁A/區塊B": 'y' }`],
        ['權限P3', `{  "專案A/頁C": 'y', "專案B/頁A/區塊A": 'n', "專案B/頁A/區塊B": 'y', "專案B/頁A/區塊C": 'y' }`],
        ['權限P4', `{  "專案B/頁B/區塊A/待辦事項清單": 'y', "專案B/頁B/區塊B/顯示後台按鈕": 'n' }`],

    ]
    rs = map(rs, ([name, crules], k) => {
        let v = funNew({
            userId: 'id-for-admin',
            order: k,
            name,
            description: `${name}的說明`,
            crules,
        })
        v.id = `id-for-${name}`
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

