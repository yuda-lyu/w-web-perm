import map from 'lodash-es/map.js'
import ds from './src/schema/index.mjs'
import provideTabs from './server/provideTabs.mjs'


async function provide() {

    let keyTable = 'users'

    let from = `pd`

    let url = `http://localhost:11006/syncAndReplaceTabs?keyTable=${keyTable}&token=sys`

    let rs = [

        ['pd-peter', 'teamA', `
            { 
                'pd-權限群組M1': {
                    'mode': 'OR',
                    'isActive': 'y',
                }
            }
        `, 'n'],
        ['pd-mary', 'teamA', `
            { 
                'pd-權限群組M2': {
                    'mode': 'OR',
                    'isActive': 'y',
                }
            }
        `, 'n'],
        ['pd-john', 'teamA', `
            { 
                'pd-權限群組M3': {
                    'mode': 'OR',
                    'isActive': 'y',
                }
            }
        `, 'n'],
        ['pd-admin', '', `
            { 
                'pd-權限群組M4': {
                    'mode': 'OR',
                    'isActive': 'y',
                }
            }
        `, 'y'],

    ]
    rs = map(rs, ([name, from, cgrups, isAdmin], k) => {
        let v = ds.users.funNew({
            order: k + 1000, //使能排序至最後, 不穿插至原測試
            name,
            email: `${name}@example.com`,
            from,
            cgrups,
            isAdmin,
        })
        v.id = `id-for-${name}`
        // if (name === 'john') {
        //     v.email = `${v.email};john@test.com`
        // }
        v.isAdmin = isAdmin
        return v
    })
    console.log('rs', rs)

    let r = await provideTabs(url, keyTable, from, rs)
    console.log('r', r)

}

provide()
    .catch((err) => {
        console.log('provide catch', err)
        process.exitCode = 1 //失敗以非 0 離開碼表達(規則帳本 R-SEED-01): 呼叫端(e2e seedDb、排程、CI)才分辨得出失敗
    })


//node g_provideUsers.mjs
