import map from 'lodash-es/map.js'
import keys from 'lodash-es/keys.js'
import genID from 'wsemi/src/genID.mjs'
import dtmapping from 'wsemi/src/dtmapping.mjs'
import dtpick from 'wsemi/src/dtpick.mjs'
import nowms2str from 'wsemi/src/nowms2str.mjs'
import now2strp from 'wsemi/src/now2strp.mjs'


let keyTable = 'users'
let tableNameCht = '使用者'
let tableNameEng = 'Users'


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
        name: '姓名',
        type: 'STRING',
    },
    email: {
        name: '電子郵件',
        type: 'STRING',
    },
    description: {
        name: '描述',
        type: 'TEXT',
    },
    from: {
        name: '來源',
        type: 'STRING',
    },
    ruleGroupsIds: {
        name: '所屬權限群組主鍵', //多主鍵用分號區隔
        type: 'STRING',
    },
    isAdmin: {
        name: '是否為系統管理員',
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
    isActive: {
        name: '是否有效',
        type: 'STRING',
    },
}

let funNew = (ndata = {}) => {
    let o = dtmapping(ndata, keys(settings))
    o.id = `${now2strp()}-${genID()}`
    o.isAdmin = 'n'
    o.userIdUpdate = o.userId
    o.timeCreate = nowms2str()
    o.timeUpdate = o.timeCreate
    o.isActive = 'y'
    return o
}

let funTest = () => {
    let rs = [
        '王小明',
        'peter',
        'mary',
        'john',
        'bill',
        'admin',
    ]
    rs = map(rs, (name, k) => {
        let v = funNew({ userId: 'id-for-admin', name })
        v.id = `id-for-${name}`
        v.order = k
        v.email = `${name}@example.com`
        v = dtpick(v, keys(settings))
        return v
    })
    rs[0].ruleGroupsIds = `id-for-權限群組1;id-for-權限群組2`
    rs[1].ruleGroupsIds = `id-for-權限群組1`
    rs[0].from = 'teamA'
    rs[1].from = 'teamA'
    rs[2].from = 'teamA'
    rs[3].from = 'teamB'
    rs[4].from = 'teamB'
    rs[4].isActive = 'n'
    rs[5].ruleGroupsIds = `id-for-權限群組1`
    rs[5].description = '測試系統管理員描述說明'
    rs[5].isAdmin = 'y' //admin
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

