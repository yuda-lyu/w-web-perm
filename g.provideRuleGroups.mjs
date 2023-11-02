import map from 'lodash/map'
import ds from './src/schema/index.mjs'
import provideRuleGroups from './server/provideRuleGroups.mjs'


async function provide() {

    let url = `http://localhost:11006/syncAndReplaceRuleGroups?token=sys`

    let from = `pd`

    let rs = [
        ['pd-權限群組1', 'pd-權限群組1之說明',
            `{
                "___all___": { "show": "y", "active": "n" },
                "pd-專案A/頁A": { "show": "y", "active": "y" },
                "pd-專案A/頁B": { "show": "n", "active": "n" },
            }`
        ],
        ['pd-權限群組2', 'pd-權限群組2之說明',
            `{
                "___all___": { "show": "y", "active": "n" },
            }`
        ],
        ['pd-權限群組3', 'pd-權限群組3之說明',
            `{
                "___all___": { "show": "y", "active": "y" },
            }`
        ],
    ]
    rs = map(rs, ([name, description, crules], k) => {
        let v = ds.ruleGroups.funNew({
            order: 1000 + k,
            name,
            description,
            crules,
            userId: 'id-for-admin',
            from,
        })
        v.id = `id-for-${name}`
        return v
    })
    console.log('rs', rs)

    let r = await provideRuleGroups(url, from, rs)
    console.log('r.msg', r.msg)

}

provide()
    .catch((err) => {
        console.log('provide catch', err)
    })


//node --experimental-modules --es-module-specifier-resolution=node g.provideRuleGroups.mjs
