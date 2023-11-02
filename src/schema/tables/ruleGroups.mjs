import map from 'lodash/map'
import keys from 'lodash/keys'
import genID from 'wsemi/src/genID.mjs'
import dtmapping from 'wsemi/src/dtmapping.mjs'
import dtpick from 'wsemi/src/dtpick.mjs'
import nowms2str from 'wsemi/src/nowms2str.mjs'
import now2strp from 'wsemi/src/now2strp.mjs'


let keyTable = 'ruleGroups'
let tableNameCht = '權限群組'
let tableNameEng = 'Rule groups'


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
        name: '來源',
        type: 'STRING',
    },
    crules: {
        name: '規則', //為json字串, 例如{ '___all___': {show:'y',active:'n'}, '專案A/頁A': {show:'y',active:'y'}, '專案A/頁B': {show:'n',active:'n'} }
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
}

let funNew = (ndata = {}) => {
    let o = dtmapping(ndata, keys(settings))
    o.id = `${now2strp()}-${genID()}`
    o.userIdUpdate = o.userId
    o.timeCreate = nowms2str()
    o.timeUpdate = o.timeCreate
    // o.isActive = 'y'
    return o
}

let funTest = () => {
    let rs = [
        ['權限群組1', `{ "___all___": { "show": "y", "active": "n" }, "專案A/頁A": { "show": "y", "active": "y" }, "專案A/頁B": { "show": "n", "active": "n" } }`],
        ['權限群組2', `{ "___all___": { "show": "y", "active": "n" } }`],
        ['權限群組3', `{ "___all___": { "show": "y", "active": "y" } }`],
    ]
    rs = map(rs, ([g, crules], k) => {
        let v = funNew({ userId: 'id-for-admin', crules })
        v.id = `id-for-${g}`
        v.order = k
        v.name = g
        v.description = `${g}的說明`
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

