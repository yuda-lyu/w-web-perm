import map from 'lodash/map'
import ds from './src/schema/index.mjs'
import provideUsers from './server/provideUsers.mjs'


async function provide() {

    let url = `http://localhost:11006/syncAndReplaceUsers?token=sys`

    let from = `pd`

    let rs = [
        ['pd-viewer', 'pd-普通瀏覽者', 'id-for-pd-權限群組1'],
        ['pd-basic', 'pd-一般使用者', 'id-for-pd-權限群組2'],
        ['pd-admin', 'pd-系統管理者', 'id-for-pd-權限群組3'],
    ]
    rs = map(rs, ([key, name, ruleGroupsIds], k) => {
        let v = ds.users.funNew({
            order: 1000 + k,
            name,
            email: `${key}@example.com`,
            ruleGroupsIds,
            userId: 'id-for-admin',
            from,
        })
        v.id = `id-for-${key}`
        if (key === 'pd-admin') {
            v.isAdmin = 'y'
        }
        return v
    })
    console.log('rs', rs)

    let r = await provideUsers(url, from, rs)
    console.log('r.msg', r.msg)

}

provide()
    .catch((err) => {
        console.log('provide catch', err)
    })


//node --experimental-modules --es-module-specifier-resolution=node g.provideUsers.mjs
