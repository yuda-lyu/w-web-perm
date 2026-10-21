import JSON5 from 'json5'
import eachOwn from './eachOwn.mjs'
import cvKpToArr from './cvKpToArr.mjs'
import findRefRows from './findRefRows.mjs'
import getEffMode from './getEffMode.mjs'
import getPropKey from './getPropKey.mjs'
import isAuthMode from './isAuthMode.mjs'
import joinNames from './joinNames.mjs'


//授權資料「衝突提示」之偵測與文字, 單一擁有者(規則帳本 R-PRINCIPLE-00 原則 3「遇衝突:收嚴＋提示」、R-AUTH-WARN-01):
//  伺服端 getUserRules 對衝突資料已收嚴(src/plugins/mShare.mjs); 本檔以相同判準(findRefRows／getEffMode／getPropKey)找出「哪裡有衝突」,
//  供清單頁(cgrups／cpemis／crules 儲存格)與五個編輯對話框於該處顯示警告圖示(三角形驚嘆號, $ui.getIcon('warning'))與 tooltip. 純函數, 不依賴 Vue／DOM.
//
//  警告碼(引用清單 cgrups／cpemis, 僅 isActive 為 'y' 之項目才有警告——停用項目不參與合併):
//    dangling   (c) 引用之名稱查無實體(懸空): 仍以其 mode 參與、內容全 n
//    ambiguous  (d) 引用之名稱對到多筆(歷史同名): 內容取各筆之交集
//    modeInvalid(e) mode 缺或非 OR／AND: 視為 AND 限制項(只當交集項、不單獨授予)
//    bothModes  (b) 同名同時有 OR 與 AND 之啟用項目: 物件形式無法無損表示, 編輯器拒存(getKpLossy)
//    emptyName  (f) 名稱為空字串: 照原樣保留(與名稱為 '' 之列相符, 否則為懸空)
//    noName     (f) 名稱不是字串(陣列元素無 name 等): 物件形式無法表示, 編輯器拒存(getKpLossy)
//  規則清單 crules: ruleConflict (a) 同一管理對象被列兩次以上且有勾與沒勾並存: 所有列皆勾才勾(收嚴)


let CODES = ['dangling', 'ambiguous', 'modeInvalid', 'bothModes', 'emptyName', 'noName', 'unparsable']


let parseKp = (c) => {
    if (typeof c === 'string') {
        try {
            return JSON5.parse(c)
        }
        catch (err) {
            return null //損壞字串: 伺服端視為空(全部 n), 無從指出個別項目
        }
    }
    return c
}


//isBadData: 非空字串而無法解析為物件／陣列(JSON5 解析失敗, 或解出 null／純量)——格式無法判讀, 伺服端視為空(全部 n, 收嚴), 頁面須提示(R-PRINCIPLE-00 原則 3; 外審 sol R8).
//空字串／空白(新增列之預設值)與非字串輸入不算損壞
let isBadData = (c) => {
    if (typeof c !== 'string' || c.trim() === '') {
        return false
    }
    try {
        let kp = JSON5.parse(c)
        return kp === null || typeof kp !== 'object'
    }
    catch (err) {
        return true
    }
}


/**
 * 偵測引用清單(使用者 cgrups、群組 cpemis)中各項目之衝突
 *
 * @param {String|Object|Array} c 輸入 cgrups／cpemis 字串(JSON5)或已解析之結果
 * @param {Array} rows 輸入被引用的表列(cgrups 對應 grups 表; cpemis 對應 pemis 表), 以 name 精確比對(findRefRows)
 * @returns {Object} 回傳 { items, kpWarns, byCode, count, hasWarn }:
 *   items    每個解碼出之項目 [{ name, mode, effMode, isActive, active, nMatch, warns: [警告碼] }](nMatch 僅啟用且名稱為字串者有值, 其餘 -1)
 *   kpWarns  名稱 → 警告碼陣列(無原型物件; 僅名稱為字串之啟用項目)
 *   byCode   警告碼 → 受影響之名稱陣列(不重複; noName 以 #<序號>)
 *   count    有警告之項目數; hasWarn 是否有任何警告
 * @example
 *
 * console.log(getRefWarns('{"G1":{"mode":"AND","isActive":"y"}}', []).byCode.dangling)
 * // => ['G1']
 *
 */
function getRefWarns(c, rows) {
    let arr = cvKpToArr(parseKp(c))

    //items
    let items = []
    let kpModes = Object.create(null)
    let k = 0
    eachOwn(arr, (r) => {
        k++
        let active = r.isActive === 'y'
        let it = {
            name: r.name,
            mode: r.mode,
            effMode: getEffMode(r.mode),
            isActive: r.isActive,
            active,
            nMatch: -1,
            warns: [],
            _k: k,
        }
        if (active) {
            if (typeof r.name !== 'string') {
                it.warns.push('noName')
            }
            else {
                it.nMatch = findRefRows(rows, r.name).length
                if (it.nMatch === 0) {
                    it.warns.push('dangling')
                }
                else if (it.nMatch >= 2) {
                    it.warns.push('ambiguous')
                }
                if (!isAuthMode(r.mode)) {
                    it.warns.push('modeInvalid')
                }
                if (r.name === '') {
                    it.warns.push('emptyName')
                }
                if (!(r.name in kpModes)) {
                    kpModes[r.name] = []
                }
                if (!kpModes[r.name].includes(it.effMode)) {
                    kpModes[r.name].push(it.effMode)
                }
            }
        }
        items.push(it)
    })

    //bothModes
    eachOwn(items, (it) => {
        if (it.active && typeof it.name === 'string' && kpModes[it.name].length > 1) {
            it.warns.push('bothModes')
        }
    })

    //kpWarns, byCode
    let kpWarns = Object.create(null)
    let byCode = {}
    eachOwn(CODES, (code) => {
        byCode[code] = []
    })
    let count = 0
    eachOwn(items, (it) => {
        if (it.warns.length === 0) {
            return true //跳出換下一個
        }
        count++
        let label = (typeof it.name === 'string') ? (it.name === '' ? '""' : it.name) : `#${it._k}` //空字串名稱顯示為 "", 否則 tooltip 中看不到
        eachOwn(it.warns, (code) => {
            if (!byCode[code].includes(label)) {
                byCode[code].push(label)
            }
            if (typeof it.name === 'string') {
                if (!(it.name in kpWarns)) {
                    kpWarns[it.name] = []
                }
                if (!kpWarns[it.name].includes(code)) {
                    kpWarns[it.name].push(code)
                }
            }
        })
    })
    eachOwn(items, (it) => {
        delete it._k
    })

    //unparsable: 整個字串無法判讀(無個別項目可掛), 以占位名稱 '-' 計入
    if (isBadData(c)) {
        byCode.unparsable.push('-')
        count++
    }

    return {
        items,
        kpWarns,
        byCode,
        count,
        hasWarn: count > 0,
    }
}


/**
 * 偵測規則清單(權限 crules)中「同一管理對象被列兩次以上且有勾與沒勾並存」(R-PRINCIPLE-00 a)
 *
 * 物件形式名稱即鍵、不會重複; 僅陣列形式 [{ name, isActive }] 會發生. 伺服端與編輯器解碼皆為「所有列皆 y 才 y」(收嚴).
 * 值只分 y(isActive 為 'y')與 n(其他一律視為 n); 值全相同(全 y 或全 n)的重複不算衝突.
 *
 * @param {String|Object|Array} c 輸入 crules 字串(JSON5)或已解析之結果
 * @returns {Object} 回傳 { conflicts, names, kpConflict, count, hasWarn }:
 *   conflicts  [{ name(屬性鍵), n(列數), nY(勾選列數) }]; names 受影響之管理對象名稱陣列; kpConflict 名稱 → true(無原型物件)
 * @example
 *
 * console.log(getRuleWarns('[{"name":"T1","isActive":"y"},{"name":"T1","isActive":"n"}]').names)
 * // => ['T1']
 *
 */
function getRuleWarns(c) {
    let arr = cvKpToArr(parseKp(c))
    let kpCnt = Object.create(null)
    eachOwn(arr, (r) => {
        let key = getPropKey(r.name)
        if (key === null) {
            return true //跳出換下一個
        }
        if (!(key in kpCnt)) {
            kpCnt[key] = { n: 0, nY: 0 }
        }
        kpCnt[key].n++
        if (r.isActive === 'y') {
            kpCnt[key].nY++
        }
    })
    let conflicts = []
    let kpConflict = Object.create(null)
    eachOwn(kpCnt, (v, key) => {
        if (v.n >= 2 && v.nY > 0 && v.nY < v.n) {
            conflicts.push({ name: key, n: v.n, nY: v.nY })
            kpConflict[key] = true
        }
    })
    let names = conflicts.map((x) => x.name)
    let unparsable = isBadData(c)
    return {
        conflicts,
        names,
        kpConflict,
        unparsable,
        count: conflicts.length + (unparsable ? 1 : 0),
        hasWarn: conflicts.length > 0 || unparsable,
    }
}


/**
 * 計算「刪除後其授權將被收回」之引用者數(R-PRINCIPLE-00 c: 刪除被 AND 引用之群組／權限前提示影響人數),
 * 以及「刪除歷史同名之一列後其授權可能變多」之引用者數(R-PRINCIPLE-00 d: 同名多筆取各候選之交集, 候選變少則交集變寬)
 *
 * n／holders(既有): 引用者(使用者的 cgrups、群組的 cpemis)中, 有 isActive 為 'y'、有效模式為 AND(mode 缺或非法者亦視為 AND)、名稱屬於被刪名稱,
 * 且刪除後被引用表已無該名稱之列者, 該引用者於刪除後其授權將被收回(AND 項變懸空, 內容全 n).
 * nWiden／holdersWiden(新增; 須給 rowsBefore): 引用者中有 isActive 為 'y' 之引用(任何 mode)、名稱屬於被刪名稱,
 * 且刪除後該名稱仍有 ≥ 1 筆剩餘列但筆數比刪除前少者(歷史同名只刪其一), 該引用者之授權可能變多(少一個較嚴之候選).
 * 未給 rowsBefore(非陣列)則不計, nWiden 為 0.
 *
 * @param {Array} holders 輸入引用者列(users 或 grups)
 * @param {String} field 輸入引用欄位名('cgrups' 或 'cpemis')
 * @param {Array} delNames 輸入被刪除之名稱陣列
 * @param {Array} rowsRemain 輸入刪除後被引用表之剩餘列(grups 或 pemis)
 * @param {Array} [rowsBefore] 輸入刪除前被引用表之列(基準, 已儲存者), 供計 nWiden
 * @returns {Object} 回傳 { n, holders, nWiden, holdersWiden }: n 為授權將被收回之引用者數, holders 為其列; nWiden 為授權可能變多之引用者數, holdersWiden 為其列
 */
function countAndRefs(holders, field, delNames, rowsRemain, rowsBefore) {
    let setDel = new Set(delNames)
    let canWiden = Array.isArray(rowsBefore)
    let hit = []
    let hitWiden = []
    eachOwn(holders, (h) => {
        let arr = cvKpToArr(parseKp(h ? h[field] : ''))
        let b = false
        let w = false
        eachOwn(arr, (r) => {
            if (r.isActive !== 'y' || typeof r.name !== 'string' || !setDel.has(r.name)) {
                return true //跳出換下一個
            }
            let nAfter = findRefRows(rowsRemain, r.name).length
            if (getEffMode(r.mode) === 'AND' && nAfter === 0) {
                b = true
            }
            if (canWiden && nAfter >= 1 && nAfter < findRefRows(rowsBefore, r.name).length) {
                w = true
            }
            if (b && (w || !canWiden)) {
                return false //跳出
            }
        })
        if (b) {
            hit.push(h)
        }
        if (w) {
            hitWiden.push(h)
        }
    })
    return {
        n: hit.length,
        holders: hit,
        nWiden: hitWiden.length,
        holdersWiden: hitWiden,
    }
}


/**
 * 把訊息範本之 {names}、{kind}、{n} 代入(以 split／join, 名稱可含 $& 等字樣, 原樣顯示)
 *
 * @param {String} tpl 輸入範本
 * @param {Object} vars 輸入 { names, kind, n }
 * @returns {String} 回傳代入後之文字
 */
function fmtWarn(tpl, vars = {}) {
    //只掃描原始範本一次, 代入結果不再解析(名稱可含 {kind}、{n}、{names} 等字樣, 須原樣顯示; 外審 sol R11)
    let kp = Object.create(null)
    if ('names' in vars) {
        kp.names = joinNames(vars.names)
    }
    if ('kind' in vars) {
        kp.kind = String(vars.kind)
    }
    if ('n' in vars) {
        kp.n = String(vars.n)
    }
    return String(tpl).replace(/\{(names|kind|n)\}/g, (m, k) => (k in kp ? kp[k] : m))
}


let KEY_OF_CODE = {
    dangling: 'warnRefDangling',
    ambiguous: 'warnRefAmbiguous',
    modeInvalid: 'warnRefModeInvalid',
    bothModes: 'warnRefBothModes',
    emptyName: 'warnRefEmptyName',
    noName: 'warnRefNoName',
    unparsable: 'warnDataUnparsable',
}


/**
 * 引用清單警告之 tooltip 文字(整個儲存格; 每種警告一行, 換行以 \n)
 *
 * @param {Object} res 輸入 getRefWarns 之結果
 * @param {Function} $t 輸入語系函數(key → 文字)
 * @param {String} kindKey 輸入被引用者之種類語系鍵('warnKindGrup' 或 'warnKindPemi')
 * @returns {String} 回傳 tooltip 文字, 無警告為空字串
 */
function getRefWarnText(res, $t, kindKey) {
    let kind = $t(kindKey)
    let lines = []
    eachOwn(CODES, (code) => {
        let names = res.byCode[code]
        if (names.length === 0) {
            return true //跳出換下一個
        }
        lines.push(fmtWarn($t(KEY_OF_CODE[code]), { names, kind }))
    })
    return lines.join('\n')
}


/**
 * 單一項目(編輯對話框之一列)警告之 tooltip 文字
 *
 * @param {Array} codes 輸入該項目之警告碼陣列(getRefWarns 的 kpWarns[name])
 * @param {String} name 輸入該項目之名稱
 * @param {Function} $t 輸入語系函數
 * @param {String} kindKey 輸入被引用者之種類語系鍵
 * @returns {String} 回傳 tooltip 文字, 無警告為空字串
 */
function getItemWarnText(codes, name, $t, kindKey) {
    let kind = $t(kindKey)
    let lines = []
    eachOwn(CODES, (code) => {
        if (!Array.isArray(codes) || !codes.includes(code)) {
            return true //跳出換下一個
        }
        lines.push(fmtWarn($t(KEY_OF_CODE[code]), { names: [name === '' ? '""' : name], kind }))
    })
    return lines.join('\n')
}


/**
 * 規則清單警告之 tooltip 文字
 *
 * @param {Object} res 輸入 getRuleWarns 之結果
 * @param {Function} $t 輸入語系函數
 * @returns {String} 回傳 tooltip 文字, 無警告為空字串
 */
function getRuleWarnText(res, $t) {
    if (!res.hasWarn) {
        return ''
    }
    let lines = []
    if (res.names.length > 0) {
        lines.push(fmtWarn($t('warnRuleConflict'), { names: res.names }))
    }
    if (res.unparsable) {
        lines.push($t('warnDataUnparsable'))
    }
    return lines.join('\n')
}


export { CODES, getRefWarns, getRuleWarns, countAndRefs, fmtWarn, getRefWarnText, getItemWarnText, getRuleWarnText }
