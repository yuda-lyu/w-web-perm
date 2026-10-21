import eachOwn from './eachOwn.mjs'
import getOwn from './getOwn.mjs'
import cvKpToArr from './cvKpToArr.mjs'
import getEffMode from './getEffMode.mjs'
import isAuthMode from './isAuthMode.mjs'


//編輯對話框之「引用清單(cgrups／cpemis) ↔ 對話框之列」轉換, 單一擁有者(規則帳本 R-PRINCIPLE-00 c／e／f、R-AUTH-MERGE-00 第 5 條):
//  直接編輯器 VeCgrups／VeCpemis(列＝被引用表之全部列＋額外列)與反向關聯對話框 VeGrupBlngUsers／VePemiBlngGrups(每列改寫另一實體之字串)共用.
//  伺服端 getUserRules 對 isActive 為 'y' 之引用一律參與合併——查無列(懸空)者以其 mode 參與、內容全 n; mode 缺或非法者視為 AND 限制項(有合法項時與 AND 等價); 名稱 '' 照常比對——
//  故編輯器存檔不得丟棄任何啟用中之引用(丟棄 AND 項即放寬). 輸入為 cvKpToObj(…, { hasMode: true }) 之結果(以名稱為鍵);
//  純函數, 不依賴 Vue／DOM／lodash, 不解析字串(JSON5.parse 由呼叫端執行, 站點見 unit-cvKpToObj SITE-AD-001). 往返不變式見 unit-editorRows.


let isPlainObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)


//restoreLim: 限制項(mode 缺或非法之啟用引用)寫回其原始 mode(見 getRawModeMap): 保留解碼值之其他欄位, mode 換回原值(原為缺則不寫 mode 鍵), isActive 為 'y'
let restoreLim = (v, lim) => {
    let o = isPlainObj(v) ? { ...v } : {}
    delete o.mode
    let m = getOwn(lim, 'mode')
    if (m !== undefined) {
        o.mode = m
    }
    o.isActive = 'y'
    return o
}


/**
 * 取得「mode 缺或非法之啟用引用」(伺服端之限制項)之原始 mode, 供存檔時原樣寫回(R-PRINCIPLE-00 e; 未被管理者改動之項寫回其原始 mode)
 *
 * 伺服端 mergeRules 把 mode 缺或非 OR／AND 之啟用項當「限制項」: 只當 AND 交集項、不單獨當基底, 該層沒有任何 mode 合法之啟用項時全 n.
 * 編輯器(cvKpToObj)把此類項顯示為「AND、啟用」; 存檔若寫出合法 AND, 限制項即變成可當基底之 AND——例: { G1: 缺 mode, G2: AND } 管理者停用唯一合法項 G2 後存檔,
 * G1 成為唯一基底而授予其內容(預期為全 n, 多給). 故記下原始 mode, 存檔時對仍為「AND、啟用」(開啟時之狀態, 視為未改)者寫回原始 mode(putRowsToKp／putRefEntry);
 * 管理者改過 mode 或停用者照其選擇寫出.
 * 只記「該名稱所有啟用元素皆 mode 缺或非法」者: 同名另有 mode 合法之啟用元素時(如陣列 [AND, 缺 mode]), 伺服端結果同該合法項, 寫出合法 mode 即授權不變, 寫回限制項反而收回.
 * 純量值({ "G1": "y" })伺服端解為 { isActive: 'y' }(無 mode), 視同缺 mode. 名稱非字串之元素不記(由 getKpLossy 拒存).
 *
 * @param {*} raw 輸入 JSON5.parse(cgrups／cpemis) 之結果(物件或陣列形式; 其他視為無引用)
 * @returns {Object} 回傳無原型物件 名稱 → { mode: 原始 mode 值(可為 undefined) }
 * @example
 *
 * let kp = getRawModeMap(JSON.parse('{"G1":{"isActive":"y"},"G2":{"mode":"or","isActive":"y"},"G3":{"mode":"AND","isActive":"y"}}'))
 * console.log(Object.keys(kp), kp.G2.mode)
 * // => ['G1', 'G2'] or
 *
 */
function getRawModeMap(raw) {
    let kpLim = Object.create(null) //無原型: 鍵為使用者資料(R-KEY-01)
    let kpValid = Object.create(null)
    eachOwn(cvKpToArr(raw), (r) => {
        if (r.isActive !== 'y' || typeof r.name !== 'string') {
            return true //跳出換下一個
        }
        if (isAuthMode(r.mode)) {
            kpValid[r.name] = true
            return true //跳出換下一個
        }
        if (!(r.name in kpLim)) {
            kpLim[r.name] = { mode: r.mode }
        }
    })
    let out = Object.create(null)
    eachOwn(kpLim, (v, name) => {
        if (kpValid[name] !== true) {
            out[name] = v
        }
    })
    return out
}


/**
 * 由解碼後之單一引用值取得對話框列之狀態, 與伺服端同解讀
 *
 * - 值為物件: isActive 為 'y' 者啟用; 啟用者之 mode 取有效值(getEffMode: 缺或非法 → 'AND'), 停用者 mode 合法則沿用、否則顯示預設 'OR'(停用項不參與合併, mode 無授權效果, 同修前顯示).
 * - 值為純量(物件形式 { "G1": "y" }; cvKpToObj 物件形式對非物件值原樣保留): 伺服端 cvKpToArr 解為 { isActive: 值 }(無 mode → AND), 此處同解讀——
 *   修前以 lodash get(值, 'isActive') 取不到而顯示停用、存檔寫出 { mode: 'OR', isActive: 'n' }, 丟掉該 AND 引用即放寬.
 * - 無此引用(null／undefined): 停用、'OR'.
 *
 * @param {*} p 輸入 getOwn(cvKpToObj 之結果, 名稱, null)
 * @returns {Object} 回傳 { mode: 'OR'|'AND', enable: 'y'|'n' }
 * @example
 *
 * console.log(getRefState({ mode: 'or', isActive: 'y' }))
 * // => { mode: 'AND', enable: 'y' }
 * console.log(getRefState('y'))
 * // => { mode: 'AND', enable: 'y' }
 *
 */
function getRefState(p) {
    let o = isPlainObj(p) ? p : { isActive: p }
    let m = getOwn(o, 'mode')
    let enable = getOwn(o, 'isActive') === 'y' ? 'y' : 'n'
    let mode = enable === 'y' ? getEffMode(m) : (isAuthMode(m) ? m : 'OR')
    return { mode, enable }
}


/**
 * 取得「啟用中而對話框之表列未顯示」之引用, 各一列(由呼叫端附於表列之後), 使存檔原樣寫回(R-PRINCIPLE-00 c／f)
 *
 * 對話框之表列以 getOwn(解碼結果, 表列.name) 顯示引用, 存檔只寫出名稱為字串之列; 故「顯示到」以表列 name 為字串且 === 引用名稱判定.
 * 與伺服端 findRefRows 之差異僅在表列無 name(findRefRows 視為 '')或 name 非字串者——此類表列不會以字串名稱寫出, 其所對應之引用仍須以額外列保留.
 * 一般情形即「引用之名稱查無列(懸空; 含名稱 '')」. 停用之引用無授權影響, 不產生額外列(存檔時照舊不寫出). 順序: 解碼結果之鍵序(僅供顯示, 不影響授權).
 *
 * @param {Object} kpDec 輸入 cvKpToObj(…, { hasMode: true }) 之結果(非物件視為無引用)
 * @param {Array} tabRows 輸入被引用表之列(群組表／權限表)
 * @returns {Array} 回傳額外列 [{ name, mode, enable: 'y', dangling: true }]
 */
function getRefRowsExtra(kpDec, tabRows) {
    let rs = []
    if (!isPlainObj(kpDec)) {
        return rs
    }
    let kpShown = Object.create(null) //無原型: 鍵為使用者資料(R-KEY-01)
    eachOwn(tabRows, (v) => {
        let n = isPlainObj(v) ? v.name : undefined
        if (typeof n === 'string') {
            kpShown[n] = true
        }
    })
    eachOwn(kpDec, (p, name) => {
        let st = getRefState(p)
        if (st.enable !== 'y' || kpShown[name] === true) {
            return true //跳出換下一個
        }
        rs.push({
            name,
            mode: st.mode,
            enable: 'y',
            dangling: true,
        })
    })
    return rs
}


/**
 * 取得同名多列(被引用表之歷史同名, R-PRINCIPLE-00 d)中 (mode, enable) 不全相同者之名稱
 *
 * 物件形式每個名稱只有一個值, 同名各列設定不同時無法寫出(寫出任一列即靜默捨棄其他列之設定), 編輯器拒存(warnDupRowsInconsistent); 全相同則寫出一次.
 *
 * @param {Array} rows 輸入對話框之列 [{ name, mode, enable }]
 * @returns {Array} 回傳名稱陣列(不重複, 依首次出現序); 名稱非字串之列不計
 */
function getDupRowsInconsistent(rows) {
    let kpFirst = Object.create(null) //無原型: 鍵為使用者資料(R-KEY-01)
    let out = []
    eachOwn(rows, (r) => {
        if (!isPlainObj(r) || typeof r.name !== 'string') {
            return true //跳出換下一個
        }
        if (!(r.name in kpFirst)) {
            kpFirst[r.name] = r
            return true //跳出換下一個
        }
        let f = kpFirst[r.name]
        if ((f.mode !== r.mode || f.enable !== r.enable) && !out.includes(r.name)) {
            out.push(r.name)
        }
    })
    return out
}


/**
 * 由直接編輯器之列寫出引用清單物件 { 名稱: { mode, isActive } }, 寫入呼叫端提供之無原型容器(R-KEY-01: 名稱可為 __proto__ 等原型鍵)
 *
 * 名稱為字串者(含 '', R-PRINCIPLE-00 f: 原樣保留; 含懸空之額外列)寫出; 名稱非字串、mode 非 OR／AND、enable 非非空字串之列略過(對話框不會產生此類列).
 * 同名多列後者覆蓋前者(呼叫端須先以 getDupRowsInconsistent 拒存不一致者; 一致者覆蓋結果相同).
 * rawModeMap(getRawModeMap 之結果, 選填): 限制項之列仍為「啟用、mode 為其有效值(AND)」(開啟時之狀態, 視為未改)者寫回原始 mode(restoreLim), 不寫成合法 AND——
 * 否則限制項變為可當基底之 AND 而多給(見 getRawModeMap); 管理者改過 mode 或停用者照列寫出. 不給＝一律照列寫出.
 *
 * @param {Object} kpOut 輸入寫出用之無原型容器(呼叫端建立)
 * @param {Array} rows 輸入對話框之列 [{ name, mode, enable }]
 * @param {Object} [rawModeMap] 輸入 getRawModeMap(原始解析結果)
 * @returns {Object} 回傳 kpOut
 */
function putRowsToKp(kpOut, rows, rawModeMap) {
    eachOwn(rows, (r) => {
        if (!isPlainObj(r)) {
            return true //跳出換下一個
        }
        let name = r.name
        let mode = r.mode
        let enable = r.enable
        if (typeof name !== 'string' || !isAuthMode(mode) || typeof enable !== 'string' || enable === '') {
            return true //跳出換下一個
        }
        let lim = getOwn(rawModeMap, name, null)
        if (lim !== null && enable === 'y' && mode === getEffMode(getOwn(lim, 'mode'))) {
            kpOut[name] = restoreLim(null, lim)
            return true //跳出換下一個
        }
        kpOut[name] = {
            mode,
            isActive: enable,
        }
    })
    return kpOut
}


/**
 * 反向關聯對話框改寫單一實體(使用者／群組)之引用清單: 只改「名稱為 name」之一項, 其餘引用項(含懸空、名稱 ''、mode 缺/非法〔解碼已為 AND〕、停用項、純量值)原樣保留,
 * 其授權效果不變(R-PRINCIPLE-00 c／e／f; 修前以列上經 fltKp* 篩過之 grups／pemis 重組, 查無列之啟用引用被丟棄即放寬)
 *
 * 目標狀態(enable 為 'y' 時 { mode, isActive: 'y' }; 否則移除該項)與現值(getRefState)相同 → 回 false(未變更: 呼叫端不改寫字串, 逐字元不動);
 * 不同 → 把 kpDec 之自有項(name 除外)複製入 kpOut 並寫入目標狀態, 回 true. mode 取有效值(getEffMode: 非 OR 者為 AND).
 * rawModeMap(getRawModeMap(該實體字串之原始解析結果), 選填): 複製其餘項時, 啟用中之限制項寫回其原始 mode(restoreLim; 解碼值為 AND, 寫成合法 AND 會多給, 見 getRawModeMap).
 *
 * @param {Object} kpOut 輸入寫出用之無原型容器(R-KEY-01; 呼叫端建立)
 * @param {Object} kpDec 輸入 cvKpToObj(…, { hasMode: true }) 之結果(非物件視為無引用)
 * @param {String} name 輸入本對話框所管之群組／權限名稱
 * @param {String} enable 輸入 'y' 為歸屬, 其他為不歸屬
 * @param {String} mode 輸入歸屬時之合併模式
 * @param {Object} [rawModeMap] 輸入 getRawModeMap(原始解析結果)
 * @returns {Boolean} 回傳是否變更(true 時 kpOut 已填入欲寫出之內容)
 * @example
 *
 * let kp = Object.create(null)
 * console.log(putRefEntry(kp, { GX: { mode: 'AND', isActive: 'y' } }, 'G1', 'y', 'OR'), JSON.stringify(kp))
 * // => true {"GX":{"mode":"AND","isActive":"y"},"G1":{"mode":"OR","isActive":"y"}}
 *
 */
function putRefEntry(kpOut, kpDec, name, enable, mode, rawModeMap) {
    let cur = getRefState(getOwn(kpDec, name, null))
    let on = enable === 'y'
    let m = getEffMode(mode)
    if (on === (cur.enable === 'y') && (!on || m === cur.mode)) {
        return false
    }
    if (isPlainObj(kpDec)) {
        eachOwn(kpDec, (v, k) => {
            if (k === name) {
                return true //跳出換下一個
            }
            let lim = getOwn(rawModeMap, k, null)
            kpOut[k] = (lim !== null && getRefState(v).enable === 'y') ? restoreLim(v, lim) : v
        })
    }
    if (on) {
        kpOut[name] = {
            mode: m,
            isActive: 'y',
        }
    }
    return true
}


/**
 * 對話框之列中 row[key] 精確 === val 之全部索引(單列切換與批次操作用)
 *
 * 直接編輯器之同名多列代表同一個引用(物件形式一個名稱只有一個值), 切換須對所有精確同名列一併套用, 同名列狀態恆一致(warnDupRowsInconsistent 僅作防呆);
 * 修前以 lodash get(row, 'name', '') 找第一列(批次以 kpRow[name] 只剩最後一列): 同名第二列之操作改到第一列、全選後同名列不一致而被拒存,
 * 且表列無 name 欄者(undefined)被當成 '' 搶先命中名稱 '' 之額外列. 反向關聯對話框以列身分 id 定位(群組／使用者之 name 可重複).
 * 比對為精確 ===(undefined 不等於 '', 數字 5 不等於 '5'); 非物件之列略過.
 *
 * @param {Array} rows 輸入對話框之列
 * @param {String} key 輸入欄位名('name' 或 'id')
 * @param {*} val 輸入欲比對之值
 * @returns {Array} 回傳索引陣列(由小到大)
 * @example
 *
 * console.log(getRowIdxs([{ name: 'A' }, { id: 'x' }, { name: 'A' }, { name: '' }], 'name', 'A'))
 * // => [0, 2]
 *
 */
function getRowIdxs(rows, key, val) {
    let ks = []
    eachOwn(rows, (r, k) => {
        if (isPlainObj(r) && getOwn(r, key) === val) {
            ks.push(k)
        }
    })
    return ks
}


export { getRefState, getRefRowsExtra, getDupRowsInconsistent, getRawModeMap, putRowsToKp, putRefEntry, getRowIdxs }
