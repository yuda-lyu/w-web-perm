//前後端共用函數區
import JSON5 from 'json5'
import get from 'lodash-es/get.js'
import each from 'lodash-es/each.js'
import map from 'lodash-es/map.js'
import join from 'lodash-es/join.js'
import size from 'lodash-es/size.js'
import find from 'lodash-es/find.js'
import filter from 'lodash-es/filter.js'
import takeRight from 'lodash-es/takeRight.js'
import dropRight from 'lodash-es/dropRight.js'
import sortBy from 'lodash-es/sortBy.js'
import sep from 'wsemi/src/sep.mjs'
import isestr from 'wsemi/src/isestr.mjs'
import haskey from 'wsemi/src/haskey.mjs'
import eachOwn from '../js/eachOwn.mjs'
import getOwn from '../js/getOwn.mjs'
import cvKpToArr from '../js/cvKpToArr.mjs'


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

    //cvKpToArr: 授權資料(JSON5.parse(cgrups／cpemis／crules) 之結果)之解碼已抽至 src/js/cvKpToArr.mjs, 與編輯對話框(經 cvKpToObj)共用同一份(規則帳本 R-AUTH-DECODE-01),
    //走訪規則(eachOwn, R-OBJ-ITER-01)與名稱規則(物件形式以外層鍵為名、陣列形式以元素之 name 為名, R-AUTH-PATH-01)見該檔

    let cvStrToArr = (c) => {

        //kp
        let kp = Object.create(null)
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

            //kpRule, 鍵為使用者寫入之規則名: 無原型容器, 使 __proto__／constructor 等原型鍵名之規則可被精確授權、不與繼承屬性混淆(規則帳本 R-AUTH-PATH-01、R-KEY-01)
            let rules = get(v, 'rules', [])
            let kpRule = Object.create(null)
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

        //objOR／objAND／rulesFin 走訪之 kpRule 物件: 鍵為規則名、值為使用者寫入之 isActive(可為數字, 如規則名 length 之值), 同樣以 eachOwn 依自有鍵走訪
        let objOR = (obj1, obj2) => {
            let kp = Object.create(null)
            let objs = [obj1, obj2]
            each(objs, (obj) => {
                eachOwn(obj, (v, k) => {
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
            let kp = Object.assign(Object.create(null), obj1) //淺複製入無原型容器(值皆為 y／n 或使用者寫入之原始值, 後續只比較不就地修改; cloneDeep 會把無原型物件複製成一般物件)
            let objs = [obj2]
            each(objs, (obj) => {
                eachOwn(obj, (v, k) => {
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
        eachOwn(kpRuleFin, (v, k) => {
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

    //expand _rules：以「當前 targets」為輸出主軸——逐 target 取其解析後 isActive（取自合併 crules 的 kp、預設 'n'）。
    //如此只列現存管控對象；crules 仍引用但已從 targets 刪除的「孤兒 target」自然被濾掉，不再殘留於權限樹。
    //（修正前：輸出 kp 全部 keys = crules keys ∪ targets，導致已刪 target 因 crules 殘留引用而仍出現在權限樹。）
    //標的 id 是資料不是路徑(規則帳本 R-AUTH-PATH-01): 以 getOwn 自有屬性查值, lodash get 會把 'A.0'、'A[0]'、'A.length' 解析為路徑而誤授權, 並取到 toString 等繼承屬性
    if (true) {
        let kp = Object.create(null)
        each(_rules, (v) => {
            kp[v.name] = v.isActive
        })
        let rs = []
        each(targets, (t) => {
            rs.push({
                name: t.id,
                isActive: getOwn(kp, t.id, 'n'),
            })
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
