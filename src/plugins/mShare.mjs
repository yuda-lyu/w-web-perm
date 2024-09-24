//前後端共用函數區
import JSON5 from 'json5'
import get from 'lodash-es/get.js'
import each from 'lodash-es/each.js'
import map from 'lodash-es/map.js'
import join from 'lodash-es/join.js'
import size from 'lodash-es/size.js'
import find from 'lodash-es/find.js'
import filter from 'lodash-es/filter.js'
import cloneDeep from 'lodash-es/cloneDeep.js'
import takeRight from 'lodash-es/takeRight.js'
import dropRight from 'lodash-es/dropRight.js'
import sortBy from 'lodash-es/sortBy.js'
import sep from 'wsemi/src/sep.mjs'
import iseobj from 'wsemi/src/iseobj.mjs'
import isestr from 'wsemi/src/isestr.mjs'
import haskey from 'wsemi/src/haskey.mjs'


// //dlm
// let dlm = '/'


function getNameNew(rows, key = 'name', nameBase = '', nameExt = '') {

    //hasName
    let hasName = (name) => {
        let b = false
        each(rows, (r) => {
            let _name = get(r, key, '')
            if (_name === name) {
                b = true
                return false //跳出
            }
        })
        return b
    }

    //nameNew
    let nameNew = ''
    let b = true
    let i = 0
    while (b) {
        i++
        let pre = ''
        if (isestr(nameBase)) {
            pre = `${nameBase} - `
        }
        nameNew = `${pre}${nameExt}(${i})` //vo.$t('pemiAddNameNew') vo.$t('pemiCopyNameNew')
        b = hasName(nameNew)
    }

    return nameNew
}


// function getAllBlocks(targets) {

//     //rs
//     let rs = map(targets, (v) => {

//         //text, parentId
//         let s = sep(v.id, dlm) //[tag:dlm]
//         let text = get(takeRight(s), 0) //取最後節點
//         s = dropRight(s, 1)
//         let parentId = join(s, dlm) //[tag:dlm] 取父節點

//         return {
//             ...v,
//             idTemp: v.id,
//             parentId,
//             text,
//         }
//     })
//     // console.log('rs', rs)

//     //sortBy
//     rs = sortBy(rs, 'order')
//     // console.log('rs sortBy', rs)

//     return rs
// }


// function getTreeBlocks(targets) {

//     //getAllBlocks
//     let blocks = getAllBlocks(targets)
//     // console.log('blocks', blocks)

//     //opt
//     let opt = {
//         bindKey: 'id',
//         bindParent: 'parentId',
//         bindChildren: 'children',
//         saveExtProps: true,
//     }

//     //composeToTree
//     let r
//     try {
//         r = composeToTree(blocks, opt)
//     }
//     catch (err) {
//         console.log(err)
//     }
//     // console.log('treeBlocks', cloneDeep(r))

//     return r
// }


// function getUserGroups(user, pemis) {

//     //userGroups
//     let ruleGroupsIds = get(user, 'ruleGroupsIds', '')

//     //sep
//     let s = sep(ruleGroupsIds, ';')

//     //gs
//     let gs = []
//     each(s, (id) => {
//         let g = find(pemis, { id })
//         if (iseobj(g)) {
//             gs.push(g)
//         }
//     })

//     //add pemis
//     gs = map(gs, (g) => {
//         let pemis = JSON5.parse(g.crules)
//         g.pemis = pemis
//         return g
//     })

//     return gs
// }


// function getTargetsByGroup(targets, group) {

//     //cloneDeep
//     targets = cloneDeep(targets)

//     //sortBy
//     targets = sortBy(targets, 'order')

//     //cloneDeep
//     group = cloneDeep(group)

//     //pemis
//     let pemis = JSON5.parse(group.crules)

//     //rulesDisplay
//     let rulesDisplay = {}
//     let ks = ['show', 'active']
//     each(ks, (k) => {

//         //___all___
//         let def = get(pemis, `___all___.${k}`)
//         def = (def === 'y') ? 'y' : 'n'

//         //other props
//         each(targets, (v) => {

//             //krule
//             let krule = v.id

//             //check
//             if (!rulesDisplay[krule]) {
//                 rulesDisplay[krule] = {}
//             }

//             //rule
//             let rule = pemis[krule]

//             //r
//             let r = null

//             //b
//             let b = get(rule, `${k}`)
//             if (b === 'y' || b === 'n') {
//                 r = b
//             }
//             else {
//                 r = def
//             }

//             //save
//             rulesDisplay[krule][k] = r //因krule內含有「.」故不能用set

//         })

//     })
//     // console.log('rulesDisplay', rulesDisplay)

//     return rulesDisplay
// }


function getUserRules(user, grups, pemis, targets) {

    let cvKpToArr = (kp) => {
        let rs = []
        each(kp, (v, k) => {
            // console.log(k, v)
            let r = {
                name: k,
            }
            if (iseobj(v)) {
                r = {
                    ...r,
                    ...v,
                }
            }
            else {
                r = {
                    ...r,
                    isActive: v,
                }
            }
            rs.push(r)
        })
        return rs
    }

    let cvStrToArr = (c) => {

        //kp
        let kp = {}
        try {
            kp = JSON5.parse(c)
            // console.log('kp', kp)
        }
        catch (err) {
            console.log('c', c)
            console.log(err)
        }

        //arr
        let arr = []
        try {
            arr = cvKpToArr(kp)
            // console.log('arr', arr)
        }
        catch (err) {
            console.log('c', c)
            console.log('kp', kp)
            console.log(err)
        }

        return arr
    }

    let arrFinder = (arrSrc, arrPks, key) => {
        let rs = []
        each(arrSrc, (v) => {
            let tSrc = get(v, key, '')
            each(arrPks, (vv) => {
                let tPks = get(vv, key, '')
                if (tSrc === tPks) {
                    rs.push({
                        ...v,
                        data: vv,
                    })
                    return false //跳出
                }
            })
        })
        return rs
    }

    let mergeRules = (rs) => {

        //ts
        let ts = []
        each(rs, (v) => {

            //mode
            let mode = get(v, 'mode', '')

            //check
            if (mode !== 'OR' && mode !== 'AND') {
                return true //跳出換下一個
            }

            //kpRule
            let rules = get(v, 'rules', [])
            let kpRule = {}
            each(rules, (vv) => {
                kpRule[vv.name] = vv.isActive
            })

            //push
            ts.push({
                mode,
                kpRule,
            })

        })

        //check
        if (size(ts) === 0) {
            return []
        }

        let objOR = (obj1, obj2) => {
            let kp = {}
            let objs = [obj1, obj2]
            each(objs, (obj) => {
                each(obj, (v, k) => {
                    if (!haskey(kp, k)) {
                        kp[k] = 'n'
                    }
                    if (kp[k] === 'y' || v === 'y') {
                        kp[k] = 'y'
                    }
                    else {
                        kp[k] = 'n'
                    }
                })
            })
            return kp
        }

        let objAND = (obj1, obj2) => {
            let kp = cloneDeep(obj1)
            let objs = [obj2]
            each(objs, (obj) => {
                each(obj, (v, k) => {
                    if (!haskey(kp, k)) {
                        kp[k] = 'n'
                    }
                    if (kp[k] === 'y' && v === 'y') {
                        kp[k] = 'y'
                    }
                    else {
                        kp[k] = 'n'
                    }
                })
            })
            return kp
        }

        let tsOR = filter(ts, { mode: 'OR' })
        let tsAND = filter(ts, { mode: 'AND' })
        // console.log('tsOR', tsOR)
        // console.log('tsAND', tsAND)

        //kpRuleFin
        let kpRuleFin = null
        if (size(tsOR) > 0) {
            kpRuleFin = get(tsOR, `0.kpRule`)
        }
        else if (size(tsAND) > 0) {
            kpRuleFin = get(tsAND, `0.kpRule`)
        }
        // console.log('kpRuleFin(0)', kpRuleFin)

        //or
        each(tsOR, (t) => {
            let kpRule = get(t, 'kpRule', {})
            kpRuleFin = objOR(kpRuleFin, kpRule)
        })
        // console.log('kpRuleFin(or)', kpRuleFin)

        //and
        each(tsAND, (t, kt) => {
            let kpRule = get(t, 'kpRule', {})
            // console.log(kt, '(and)(in) kpRule', kpRule)
            // console.log(kt, '(and)(in) kpRuleFin', kpRuleFin)
            kpRuleFin = objAND(kpRuleFin, kpRule)
            // console.log(kt, '(and)(out) kpRuleFin', kpRuleFin)
        })
        // console.log('kpRuleFin(and)', kpRuleFin)

        //rulesFin
        let rulesFin = []
        each(kpRuleFin, (v, k) => {
            rulesFin.push({
                name: k,
                isActive: v,
            })
        })
        // console.log('rulesFin', rulesFin)

        return rulesFin
    }

    //cgrups
    let cgrups = get(user, 'cgrups', '')
    // console.log('cgrups', cgrups)

    //cvStrToArr
    let _grups = cvStrToArr(cgrups)
    // console.log('cvStrToArr _grups', _grups)

    //_grups
    _grups = arrFinder(_grups, grups, 'name')
    // console.log('arrFinder _grups', cloneDeep(_grups))

    //filter
    _grups = filter(_grups, { isActive: 'y' })
    // console.log('filter _grups', cloneDeep(_grups))

    //proc _pemis
    _grups = map(_grups, (v) => {
        let cpemis = get(v, 'data.cpemis', '')
        let _pemis = cvStrToArr(cpemis)
        _pemis = filter(_pemis, { isActive: 'y' })
        _pemis = arrFinder(_pemis, pemis, 'name')
        v.data._pemis = _pemis
        return v
    })
    // console.log('proc _pemis _grups', cloneDeep(_grups))

    //proc _rules
    _grups = map(_grups, (v) => {
        let _pemis = get(v, 'data._pemis', [])
        _pemis = map(_pemis, (vv) => {
            let crules = get(vv, 'data.crules', '')
            let _rules = cvStrToArr(crules)
            vv.data._rules = _rules
            return vv
        })
        v.data._pemis = _pemis
        return v
    })
    // console.log('proc _rules _grups', cloneDeep(_grups))

    //merge _rules
    let _rules = []
    if (true) {

        //rrs
        let rrs = []
        each(_grups, (v) => {

            let modeG = v.mode
            let _pemis = v.data._pemis

            //rs
            let rs = []
            each(_pemis, (vv) => {
                let modeP = vv.mode
                let _rules = vv.data._rules
                rs.push({
                    mode: modeP,
                    rules: _rules,
                })

            })
            // console.log('rs', rs)

            //mergeRules
            let rulesP = mergeRules(rs)
            // console.log('rulesP', rulesP)

            //t
            let t = {
                mode: modeG,
                rules: rulesP,
            }

            //push
            rrs.push(t)

        })
        // console.log('rrs', rrs)

        //mergeRules
        let rulesG = mergeRules(rrs)
        // console.log('rulesG', rulesG)

        //save
        _rules = rulesG

    }
    // console.log('merge _rules', cloneDeep(_rules))

    //expand _rules
    if (true) {
        let kp = {}
        each(_rules, (v) => {
            kp[v.name] = v.isActive
        })
        each(targets, (t) => {
            // console.log('t', t)
            if (!haskey(kp, t.id)) {
                kp[t.id] = 'n'
            }
        })
        let rs = []
        each(kp, (v, k) => {
            let r = {
                name: k,
                isActive: v,
            }
            rs.push(r)
        })
        _rules = rs
    }
    // console.log('expand _rules', cloneDeep(_rules))

    return {
        grups: _grups,
        rules: _rules,
    }
}


export {
    // atSep,
    // atJoin,
    // atParse,
    // atMerge,
    // atRemove,
    getNameNew,
    // getAllBlocks,
    // getTreeBlocks,
    // getUserGroups,
    // getTargetsByGroup,
    getUserRules
}
