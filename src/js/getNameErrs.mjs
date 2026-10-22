import eachOwn from './eachOwn.mjs'
import findTouchedDup from './findTouchedDup.mjs'
import getPropKey from './getPropKey.mjs'
import { isExternalRow } from './externalRows.mjs'


//後台清單頁(群組／權限／使用者)「名稱(或 email)擋存」之判準, 單一擁有者(規則帳本 R-PRINCIPLE-00 g、h, R-NAME-UNIQ-02):
//  只擋「本次造成或觸及」者, 庫內既有的歷史問題(僅外部同步可造成)改為警告圖示而不擋存——否則已有歷史同名之庫在後台永遠存不了、無從修復.
//  重複之判準與伺服端同一份(findTouchedDup, server/keyCheck.mjs 亦轉出之), 故「前端判擋存 ⇔ 伺服端回 nameDuplicate」.
//  純函數, 不依賴 Vue／DOM／語系; 文字由呼叫端依 errBlock／warnHist／warnHistBad 之分類代入($t).
//
//  比對一律精確 ===; 以 Map 與無原型物件計, 免原型鍵名(constructor、__proto__)誤判(規則帳本 R-KEY-01).
//  基準 rowsOld ＝ 最近一次由伺服端載入的列(store 之 grups／pemis／users 原始列); 新增但尚未儲存的列(id 不在基準內)視為本次造成.


/**
 * 取得清單頁某欄(name／email)之擋存錯誤與歷史警告
 *
 * 每一列之該欄值分三類:
 *  - 壞值(empty): 不是字串或為空字串; 另 opt.isValid 給予時, 非空字串但不合格式者為 invalid(如 email 格式不符);
 *  - 好值之重複: 好值在 rowsNew 內出現 ≥ 2 次; 用 findTouchedDup 判斷是「本次造成或觸及」(dup, 擋存)還是「歷史既有原樣」(warnHist, 不擋存);
 *  - 其餘無事.
 * 壞值預設一律擋存(opt.badScope 'all', 群組／權限之名稱: 伺服端 ckKey 對任一列之空／非字串名稱皆拒);
 * opt.badScope 為 'touched' 時只擋「本次新增、或由其他值改成該壞值」之列, 基準內原樣就是壞值之列(歷史空值)不擋、改列入 warnHistBad(使用者之 name／email).
 *
 * 判定前先把兩邊列的有限數字 id 轉為字串(同伺服端), 非陣列視為空.
 * 回傳之物件鍵為「儲存格之值」(非字串者依屬性鍵轉型, 空字串為 ''; 與清單頁以 props.value 查表一致), 皆為無原型物件.
 *
 * @param {Array} rowsNew 輸入目前清單之列(vo.opt.rows, 含未儲存之編修)
 * @param {Array} rowsOld 輸入基準列(store 之原始列; 非陣列視為空)
 * @param {String} [key='name'] 輸入欄位名
 * @param {Object} [opt={}] 輸入設定物件
 * @param {String} [opt.badScope='all'] 輸入壞值之擋存範圍, 'all' 或 'touched'
 * @param {Function} [opt.isValid] 輸入好值格式檢查函數(值 → Boolean), 不給則任一非空字串皆合格
 * @returns {Object} 回傳 { errBlock, warnHist, warnHistBad }:
 *   errBlock     值 → 'empty' | 'invalid' | 'dup'(會擋存)
 *   warnHist     值 → 目前共用該值之列數(歷史同名, 不擋存; 與 errBlock 互斥, 以擋存者為準)
 *   warnHistBad  值 → 'empty' | 'invalid'(歷史壞值, 不擋存; 僅 badScope 為 'touched' 時有)
 *   dupExternal  值 → 外部列之來源 from(僅 errBlock 為 'dup' 者, 且共用該值之列中有外部列〔from 為非空字串, externalRows.isExternalRow〕; 供提示改為「外部來源 X 已使用此名稱」, 否則無此鍵)
 * @example
 *
 * let rowsOld = [{ id: '1', name: 'A' }, { id: '2', name: 'A' }]
 * let r1 = getNameErrs(rowsOld, rowsOld, 'name')
 * console.log(r1.errBlock.A, r1.warnHist.A)
 * // => undefined 2
 * let r2 = getNameErrs([...rowsOld, { id: '3', name: 'A' }], rowsOld, 'name')
 * console.log(r2.errBlock.A, r2.warnHist.A)
 * // => 'dup' undefined
 *
 */
function getNameErrs(rowsNew0, rowsOld0, key = 'name', opt = {}) {
    let o = (opt !== null && typeof opt === 'object') ? opt : {}
    let touchedOnly = o.badScope === 'touched'
    let isValid = typeof o.isValid === 'function' ? o.isValid : null

    let errBlock = Object.create(null)
    let warnHist = Object.create(null)
    let warnHistBad = Object.create(null)
    let dupExternal = Object.create(null)

    let isRow = (r) => r !== null && typeof r === 'object'

    //id 正規化: 有限數字 id 轉為字串(同伺服端 procCore.updateTabItems 於 findTouchedDup 之前所做, R-ORM-04), 其餘不變; 非陣列視為空.
    //why: 前端若直接以數字 id 比對庫內之字串 id 會認不得同一列, 把歷史同名誤判為本次造成而擋存(兩端不一致)
    let normIds = (rows) => {
        if (!Array.isArray(rows)) {
            return []
        }
        return rows.map((r) => {
            return (isRow(r) && typeof r.id === 'number' && Number.isFinite(r.id)) ? { ...r, id: String(r.id) } : r
        })
    }
    let rowsNew = normIds(rowsNew0)
    let rowsOld = normIds(rowsOld0)

    //基準: id → 基準列該欄之原始值
    let kpOldVal = new Map()
    eachOwn(rowsOld, (r) => {
        if (isRow(r) && typeof r.id === 'string') {
            kpOldVal.set(r.id, r[key])
        }
    })

    //rowsNew: 壞值分類; 好值計次(Map: 值 → 列數)
    let cnt = new Map()
    eachOwn(rowsNew, (r) => {
        if (!isRow(r)) {
            return true //跳出換下一個
        }
        let raw = r[key]
        let v = (raw === undefined) ? '' : raw //缺欄位視為空字串(同清單頁既有 get(v, 'name', ''))
        let kind = null
        if (typeof v !== 'string' || v.length === 0) {
            kind = 'empty'
        }
        else if (isValid !== null && !isValid(v)) {
            kind = 'invalid'
        }
        if (kind === null) {
            cnt.set(v, (cnt.get(v) || 0) + 1)
            return true //跳出換下一個
        }
        let kc = getPropKey(v) //儲存格值轉屬性鍵, 轉不了者(如 { toString: null })無從在畫面標示, 略過
        if (kc === null) {
            return true //跳出換下一個
        }
        //本次造成或觸及: 新列(id 不在基準)、或該欄值與基準不同
        let touched = !(typeof r.id === 'string' && kpOldVal.has(r.id) && kpOldVal.get(r.id) === raw)
        if (!touchedOnly || touched) {
            errBlock[kc] = kind
        }
        else {
            warnHistBad[kc] = kind
        }
    })

    //好值之重複: 同值各列與基準中同值各列交給 findTouchedDup(兩端同一份判準)
    let dupVals = []
    cnt.forEach((n, v) => {
        if (n >= 2) {
            dupVals.push(v)
        }
    })
    if (dupVals.length > 0) {
        let setDup = new Set(dupVals)
        let kpNew = new Map()
        let kpOld = new Map()
        eachOwn(rowsNew, (r) => {
            if (isRow(r) && setDup.has(r[key])) {
                if (!kpNew.has(r[key])) {
                    kpNew.set(r[key], [])
                }
                kpNew.get(r[key]).push(r)
            }
        })
        eachOwn(rowsOld, (r) => {
            if (isRow(r) && setDup.has(r[key])) {
                if (!kpOld.has(r[key])) {
                    kpOld.set(r[key], [])
                }
                kpOld.get(r[key]).push(r)
            }
        })
        eachOwn(dupVals, (v) => {
            let kc = getPropKey(v)
            if (kc === null) {
                return true //跳出換下一個
            }
            let k = findTouchedDup(kpNew.get(v), kpOld.get(v) || [], key)
            if (k >= 0) {
                errBlock[kc] = 'dup'
                let rExt = kpNew.get(v).find((r) => isExternalRow(r)) //另一方(或其中一方)為外部列: 提示改為「外部來源 X 已使用此名稱」
                if (rExt !== undefined) {
                    dupExternal[kc] = rExt.from
                }
            }
            else {
                warnHist[kc] = cnt.get(v)
            }
        })
    }

    //以擋存者為準
    eachOwn(Object.keys(errBlock), (kc) => {
        delete warnHist[kc]
        delete warnHistBad[kc]
    })

    return {
        errBlock,
        warnHist,
        warnHistBad,
        dupExternal,
    }
}


/**
 * 把「值 → 分類(或筆數)」之無原型物件逐項轉為「值 → 文字」之無原型物件(清單頁以 props.value 查表), 供 computed 組 tooltip 文字用
 *
 * @param {Object} kp 輸入 getNameErrs 回傳之 errBlock／warnHist／warnHistBad
 * @param {Function} fn 輸入轉換函數(分類或筆數, 值) → 文字
 * @returns {Object} 回傳無原型物件
 */
function mapNameKp(kp, fn) {
    let out = Object.create(null)
    eachOwn(kp, (v, k) => {
        out[k] = fn(v, k)
    })
    return out
}


export { getNameErrs, mapNameKp }
