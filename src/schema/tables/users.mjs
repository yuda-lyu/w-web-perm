import map from 'lodash-es/map.js'
import keys from 'lodash-es/keys.js'
import genIDSeq from 'wsemi/src/genIDSeq.mjs'
import dtmapping from 'wsemi/src/dtmapping.mjs'
import dtpick from 'wsemi/src/dtpick.mjs'
import nowms2str from 'wsemi/src/nowms2str.mjs'


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
        name: '來源', //標注使用者來源, 亦供外部批次變更使用
        type: 'STRING',
    },
    cgrups: {
        name: '權限群組清單', //為json字串
        type: 'TEXT',
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
    o.id = `${genIDSeq()}`
    o.isAdmin = 'n'
    o.userIdUpdate = o.userId
    o.timeCreate = nowms2str()
    o.userIdUpdate = o.userId
    o.timeUpdate = o.timeCreate
    o.isActive = 'y'
    return o
}

let funTest = () => {
    let rs = [

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
        let v = funNew({
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
        v.isAdmin = isAdmin
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

