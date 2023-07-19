//前後端共用函數區
import get from 'lodash/get'
import each from 'lodash/each'
import map from 'lodash/map'
import find from 'lodash/find'
import join from 'lodash/join'
import cloneDeep from 'lodash/cloneDeep'
import takeRight from 'lodash/takeRight'
import dropRight from 'lodash/dropRight'
import sortBy from 'lodash/sortBy'
import sep from 'wsemi/src/sep.mjs'
import iseobj from 'wsemi/src/iseobj.mjs'
import haskey from 'wsemi/src/haskey.mjs'
import composeToTree from 'wsemi/src/composeToTree.mjs'


function getAllBlocks(targets) {

    //rs
    let rs = map(targets, (v) => {

        //text, parentId
        let s = sep(v.id, '.')
        let text = get(takeRight(s), 0) //取最後節點
        s = dropRight(s, 1)
        let parentId = join(s, '.') //取父節點

        return {
            ...v,
            idTemp: v.id,
            parentId,
            text,
        }
    })

    //sortBy
    rs = sortBy(rs, 'order')

    return rs
}


function getTreeBlocks(targets) {

    //getAllBlocks
    let blocks = getAllBlocks(targets)

    //opt
    let opt = {
        bindKey: 'id',
        bindParent: 'parentId',
        bindChildren: 'children',
        saveExtProps: true,
    }

    //composeToTree
    let r
    try {
        r = composeToTree(blocks, opt)
    }
    catch (err) {
        console.log(err)
    }
    // console.log('treeBlocks', cloneDeep(r))

    return r
}


function getUserGroups(user, ruleGroups) {

    //userGroups
    let ruleGroupsIds = get(user, 'ruleGroupsIds', '')

    //sep
    let s = sep(ruleGroupsIds, ';')

    //gs
    let gs = []
    each(s, (id) => {
        let g = find(ruleGroups, { id })
        if (iseobj(g)) {
            gs.push(g)
        }
    })

    //add rules
    gs = map(gs, (g) => {
        let rules = JSON.parse(g.crules)
        g.rules = rules
        return g
    })

    return gs
}


function getTargetsByGroup(targets, group) {

    //cloneDeep
    targets = cloneDeep(targets)

    //sortBy
    targets = sortBy(targets, 'order')

    //cloneDeep
    group = cloneDeep(group)

    //rules
    let rules = JSON.parse(group.crules)

    //rulesDisplay
    let rulesDisplay = {}
    let ks = ['show', 'active']
    each(ks, (k) => {

        //___all___
        let def = get(rules, `___all___.${k}`)
        def = (def === 'y') ? 'y' : 'n'

        //other props
        each(targets, (v) => {

            //krule
            let krule = v.id

            //check
            if (!rulesDisplay[krule]) {
                rulesDisplay[krule] = {}
            }

            //rule
            let rule = rules[krule]

            //r
            let r = null

            //b
            let b = get(rule, `${k}`)
            if (b === 'y' || b === 'n') {
                r = b
            }
            else {
                r = def
            }

            //save
            rulesDisplay[krule][k] = r //因krule內含有「.」故不能用set

        })

    })
    // console.log('rulesDisplay', rulesDisplay)

    return rulesDisplay
}


function getUserRules(user, ruleGroups, targets) {

    //getUserGroups
    let gs = getUserGroups(user, ruleGroups)
    // console.log('gs', gs)

    //getTargetsByGroup
    let rulesDisplay = {}
    each(gs, (g) => {
        let r = getTargetsByGroup(targets, g)
        each(r, (v, k) => {

            //check
            if (!haskey(rulesDisplay, k)) {
                rulesDisplay[k] = {}
            }

            //merge
            let ks = ['show', 'active']
            each(ks, (kk) => {
                let bOld = rulesDisplay[k][kk]
                let bNew = r[k][kk]
                if (bOld === 'y') {
                    //不用覆寫
                }
                else {
                    //需覆寫
                    if (bNew === 'y') {
                        rulesDisplay[k][kk] = 'y'
                    }
                    else {
                        rulesDisplay[k][kk] = 'n'
                    }
                }
            })

        })
    })
    // console.log('rulesDisplay', rulesDisplay)

    return rulesDisplay
}


export {
    // atSep,
    // atJoin,
    // atParse,
    // atMerge,
    // atRemove,
    // getAllBlocks,
    getTreeBlocks,
    // getUserGroups,
    // getTargetsByGroup,
    getUserRules
}
