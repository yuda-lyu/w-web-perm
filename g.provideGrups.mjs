import map from 'lodash-es/map.js'
import ds from './src/schema/index.mjs'
import provideGrups from './server/provideGrups.mjs'


async function provide() {

    let url = `http://localhost:11006/syncAndReplaceGrups?token=sys`

    let from = `pd`

    let rs = [

        ['pd-權限群組M1', `
            {
                'pd-權限P1': {
                    'mode': 'OR',
                    'isActive': 'y',
                },
                'pd-權限P2': {
                    'mode': 'OR',
                    'isActive': 'y',
                },
            }
        `],
        ['pd-權限群組M2', `
            {
                'pd-權限P2': {
                    'mode': 'OR',
                    'isActive': 'y',
                },
                'pd-權限P3': {
                    'mode': 'OR',
                    'isActive': 'y',
                },
            }
        `],
        ['pd-權限群組M3', `
            {
                'pd-權限P2': {
                    'mode': 'OR',
                    'isActive': 'y',
                },
                'pd-權限P3': {
                    'mode': 'AND',
                    'isActive': 'y',
                },
            }
        `],
        ['pd-權限群組M4', `
            {
                'pd-權限P3': {
                    'mode': 'OR',
                    'isActive': 'y',
                },
                'pd-權限P4': {
                    'mode': 'OR',
                    'isActive': 'y',
                },
            }
        `],

    ]
    rs = map(rs, ([name, cpemis], k) => {
        let v = ds.grups.funNew({
            order: k + 1000, //使能排序至最後, 不穿插至原測試
            name,
            description: `${name}的說明`,
            cpemis,
        })
        v.id = `id-for-${name}`
        return v
    })
    console.log('rs', rs)

    let r = await provideGrups(url, from, rs)
    console.log('r.msg', r.msg)

}

provide()
    .catch((err) => {
        console.log('provide catch', err)
    })


//node --experimental-modules g.provideGrups.mjs
