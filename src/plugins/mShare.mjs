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
import getPropKey from '../js/getPropKey.mjs'
import findRefRows from '../js/findRefRows.mjs'
import getEffMode from '../js/getEffMode.mjs'
import isAuthMode from '../js/isAuthMode.mjs'


//nameOfErr: console 診斷用之錯誤類別名稱(只取識別字形狀之 name, 不取訊息; 非 Error 只回型別); 本檔前後端共用, 故不引用 server/maskLog.mjs 之 describeErr(ADR-047)
let nameOfErr = (err) => {
    let n = null
    try {
        n = (err instanceof Error) ? err.name : null
    }
    catch (e) {
        n = null
    }
    return (typeof n === 'string' && /^\w{1,40}$/.test(n)) ? n : `(typeof ${typeof err})`
}


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
            //console 只印型別與錯誤類別, 不印授權字串之內容與錯誤訊息(JSON5 之訊息含原文片段; R-DIAG-01 D2, ADR-047)
            console.log('cvStrToArr: JSON5.parse failed', `(typeof ${typeof c})`, nameOfErr(err))
        }

        //arr
        let arr = []
        try {
            arr = cvKpToArr(kp)
            // console.log('arr', arr)
        }
        catch (err) {
            console.log('cvStrToArr: cvKpToArr failed', `(typeof ${typeof c})`, `(typeof ${typeof kp})`, nameOfErr(err))
        }

        return arr
    }

    //objOR／objAND／rulesToKp 走訪之 kpRule 物件: 鍵為規則名、值為使用者寫入之 isActive(可為數字, 如規則名 length 之值), 同樣以 eachOwn 依自有鍵走訪
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

    //objAND: 交集, 對稱(R-AUTH-MERGE-00): 任一方「未列」之鍵視同 n——結果之鍵為兩方鍵之聯集, 兩方皆為 y 才 y
    //(舊規則 ADR-001 非對稱: obj1 獨有之鍵保留 obj1 的值, 僅 obj2 獨有者為 n, 故結果隨 AND 項之排列順序而異; 已由 ADR-033 取代)
    let objAND = (obj1, obj2) => {
        let kp = Object.create(null)
        let objs = [obj1, obj2]
        each(objs, (obj) => {
            eachOwn(obj, (v, k) => {
                kp[k] = (getOwn(obj1, k) === 'y' && getOwn(obj2, k) === 'y') ? 'y' : 'n'
            })
        })
        return kp
    }

    //andAll: 多個 kpRule 之交集(R-PRINCIPLE-00 d: 引用之名稱對到多筆〔歷史同名〕時, 該項內容取各筆之交集); 0 個＝空(R-PRINCIPLE-00 c: 引用查無實體, 內容全 n); 1 個＝原樣
    let andAll = (kps) => {
        if (size(kps) === 0) {
            return Object.create(null)
        }
        let kp = kps[0]
        for (let k = 1; k < kps.length; k++) {
            kp = objAND(kp, kps[k])
        }
        return kp
    }

    //rulesToKp: rules([{ name, isActive }])轉 kpRule, 鍵為規則名: 無原型容器, 使 __proto__／constructor 等原型鍵名之規則可被精確授權、不與繼承屬性混淆(規則帳本 R-AUTH-PATH-01、R-KEY-01)
    let rulesToKp = (rules) => {
        let kpRule = Object.create(null)
        each(rules, (vv) => {
            let k = getPropKey(vv.name) //規則名為使用者／外部應用寫入之任意 JSON 值: 屬性鍵轉型必拋者(如 { toString: null })不對應任何標的, 略過而非使整個權限查詢拋 TypeError(R-KEY-PROP-01)
            if (k === null) {
                return true //跳出換下一個
            }
            //同一項內(陣列形式)重複列同名規則: 所有列皆 y 才 y(任一列非 y 即 n), 與列之順序無關(R-AUTH-MERGE-00 第 4 條; 舊規則為後者覆蓋前者, 結果隨順序而異)
            kpRule[k] = haskey(kpRule, k) ? ((kpRule[k] === 'y' && vv.isActive === 'y') ? 'y' : 'n') : vv.isActive
        })
        return kpRule
    }

    //kpToRules: kpRule 轉 rules([{ name, isActive }])
    let kpToRules = (kp) => {
        let rs = []
        eachOwn(kp, (v, k) => {
            rs.push({
                name: k,
                isActive: v,
            })
        })
        return rs
    }

    //mergeRules: 輸入 rs 為 [{ mode, rules: [{ name, isActive }] }](同層各引用項, 已排除 isActive 非 'y' 者), 輸出合併後之 rules
    //mode 缺或非 OR／AND 者(R-AUTH-MERGE-00 第 5 條, R-PRINCIPLE-00 e)「視為 AND」只作為限制(交集項), 不單獨授予授權: 該層若沒有任何 mode 合法的有效項, 結果全 n.
    //why: 無法判讀時授權取各解讀(OR／AND／不計入)所得之交集(原則 3); 略過該項會使 AND 限制消失而放寬, 但把「唯一一個 mode 非法的項」當 AND 基底則會授予其內容(比修正前多給),
    //  兩者之交集即「有其他有效項時當 AND 交集項, 沒有時內容為空」. 因此 c／d／e 皆只會收回、不會多給(unit-authMerge SP-CDE).
    let mergeRules = (rs) => {

        //ts: mode 缺或非法者標 lim(getEffMode 為 AND)
        let ts = []
        each(rs, (v) => {

            //mode
            let modeRaw = get(v, 'mode', '')
            let mode = getEffMode(modeRaw)
            let lim = !isAuthMode(modeRaw)

            //kpRule
            let kpRule = rulesToKp(get(v, 'rules', []))

            //push
            ts.push({
                mode,
                lim,
                kpRule,
            })

        })

        //check: 沒有任何 mode 合法的有效項(含沒有任何項)→ 結果全 n
        if (size(filter(ts, { lim: false })) === 0) {
            return []
        }

        let tsOR = filter(ts, { mode: 'OR' }) //OR 必為合法 mode
        let tsAND = filter(ts, { mode: 'AND' }) //含 lim 項(僅作限制)
        let tsBase = filter(tsAND, { lim: false }) //基底只取 mode 合法之 AND 項
        // console.log('tsOR', tsOR)
        // console.log('tsAND', tsAND)

        //kpRuleFin
        let kpRuleFin = null
        if (size(tsOR) > 0) {
            kpRuleFin = get(tsOR, `0.kpRule`)
        }
        else if (size(tsBase) > 0) {
            kpRuleFin = get(tsBase, `0.kpRule`)
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
        let rulesFin = kpToRules(kpRuleFin)
        // console.log('rulesFin', rulesFin)

        return rulesFin
    }

    //evalGroup: 單一群組列(候選)之合併結果, 回傳 { rules, pemisTree }
    //  群組 cpemis 中 isActive 為 'y' 之引用逐一以名稱查權限表: 查無(懸空)者以其 mode 參與、內容全 n; 對到多筆(歷史同名)者內容取各筆 crules 之交集(R-PRINCIPLE-00 c／d; 皆只收回)
    //  pemisTree 為供回傳 grups 樹之相容視圖(僅含查得之權限; data 為複本, 不寫入輸入之表列)
    let evalGroup = (rowGrup) => {
        let cpemis = get(rowGrup, 'cpemis', '')
        let refs = filter(cvStrToArr(cpemis), { isActive: 'y' })
        let rs = []
        let pemisTree = []
        each(refs, (rp) => {
            let cands = findRefRows(pemis, rp.name)
            let arrRules = map(cands, (c) => cvStrToArr(get(c, 'crules', '')))
            let kps = map(arrRules, (rules) => rulesToKp(rules))
            rs.push({
                mode: rp.mode,
                rules: kpToRules(andAll(kps)),
            })
            if (size(cands) > 0) {
                pemisTree.push({
                    ...rp,
                    data: {
                        ...cands[0],
                        _rules: arrRules[0],
                    },
                })
            }
        })
        return {
            rules: mergeRules(rs),
            pemisTree,
        }
    }

    //cgrups
    let cgrups = get(user, 'cgrups', '')
    // console.log('cgrups', cgrups)

    //使用者 cgrups 中 isActive 為 'y' 之引用(isActive 非 'y' 者不參與, R-AUTH-MERGE-00 第 5 條)
    let refsG = filter(cvStrToArr(cgrups), { isActive: 'y' })
    // console.log('refsG', refsG)

    //merge _rules, 並同時建立回傳之 grups 樹(僅含查得之群組, 供 grupsNames; 懸空引用雖參與合併但不是群組, 不列入)
    let _grups = []
    let _rules = []
    if (true) {

        //rrs
        let rrs = []
        each(refsG, (rg) => {

            //查無(懸空)→ 候選 0 筆, 內容全 n; 對到多筆(歷史同名)→ 內容取各筆合併結果之交集(R-PRINCIPLE-00 c／d)
            let cands = findRefRows(grups, rg.name)
            let evs = map(cands, (c) => evalGroup(c))
            let kps = map(evs, (ev) => rulesToKp(ev.rules))

            //push
            rrs.push({
                mode: rg.mode,
                rules: kpToRules(andAll(kps)),
            })

            //_grups
            if (size(cands) > 0) {
                _grups.push({
                    ...rg,
                    data: {
                        ...cands[0],
                        _pemis: evs[0].pemisTree,
                    },
                })
            }

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
