import map from 'lodash-es/map.js'
import keys from 'lodash-es/keys.js'
import genIDSeq from 'wsemi/src/genIDSeq.mjs'
import dtmapping from 'wsemi/src/dtmapping.mjs'
import dtpick from 'wsemi/src/dtpick.mjs'
import nowms2str from 'wsemi/src/nowms2str.mjs'


let keyTable = 'grups'
let tableNameCht = '權限群組設定'
let tableNameEng = 'Permission groups'


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
    cpemis: {
        name: '權限清單', //為json字串
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
        let v = funNew({
            userId: 'id-for-admin',
            order: k,
            name,
            description: `${name}的說明`,
            cpemis,
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

