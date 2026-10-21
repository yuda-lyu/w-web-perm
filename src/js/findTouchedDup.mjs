//後台整表寫入之「本次造成或觸及之同名」判準, 單一擁有者(規則帳本 R-NAME-UNIQ-02、R-DUP-UI-01, ADR-034/035):
//伺服端(server/keyCheck.mjs 轉出, procCore.mjs:updateTabItems 呼叫)與前端清單頁(LayoutContentGrups／Pemis／Users 之 errItemsByName／errItemsByEmail)共用同一份, 兩端判準一致.
//純函數, 不依賴 node 專屬模組. 比對一律精確 ===; 以 Map 計, 免原型鍵名(constructor、__proto__)誤判(規則帳本 R-KEY-01).


let isStr = (v) => typeof v === 'string'


/**
 * 後台整表寫入(procCore.updateTabItems)用: 回傳 rowsNew 中第一個「本次寫入造成或觸及」之同名列索引, 無則 -1
 *
 * 寫入後之名稱集合即送入之整表(後台整表寫入, 含他 from 之外部同步列). 名稱於 rowsNew 出現 ≥ 2 次者為重複; 其中
 * 「庫內該名稱已有 ≥ 2 列, 且 rowsNew 中該名稱之每一列皆為庫內同 id 同名之既有列, 且筆數不多於庫內」為歷史既有重複原樣送回(與本次無關), 不算;
 * 其餘(新增第三個同名列、他列改名併入、重複中一列改成已被他列使用之名、以新 id 取代)皆為本次造成或觸及.
 * why: 歷史重複(僅外部同步可造成)不得使後台所有存檔失敗, 否則已有重複之庫無法在後台修復; 但本次不得再造出新的重複.
 *
 * @param {Array} rowsNew 送入之整表(已 ltdtmapping、id 數字轉字串)
 * @param {Array} rowsOld 庫內現有全部列(select 結果)
 * @param {String} key 欄位名(name)
 * @returns {Number} 造成或觸及重複之列索引(該名稱各列中第一個不是「庫內同 id 同名之既有列」者; 歷史原樣之組跳過; 多組取索引最小者), 無為 -1
 */
function findTouchedDup(rowsNew, rowsOld, key) {
    if (!Array.isArray(rowsNew)) {
        return -1
    }
    //庫內: id → 名稱, 名稱 → 筆數
    let nameOfId = new Map()
    let cntOld = new Map()
    for (let r of (Array.isArray(rowsOld) ? rowsOld : [])) {
        if (r === null || typeof r !== 'object') {
            continue
        }
        if (isStr(r.id) && isStr(r[key])) {
            nameOfId.set(r.id, r[key])
        }
        if (isStr(r[key])) {
            cntOld.set(r[key], (cntOld.get(r[key]) || 0) + 1)
        }
    }
    //送入: 名稱 → 該名稱各列之索引
    let kpIdx = new Map()
    for (let k = 0; k < rowsNew.length; k++) {
        let r = rowsNew[k]
        let v = (r === null || typeof r !== 'object') ? undefined : r[key]
        if (!isStr(v)) {
            continue
        }
        if (!kpIdx.has(v)) {
            kpIdx.set(v, [])
        }
        kpIdx.get(v).push(k)
    }
    let kBad = -1
    for (let [name, idxs] of kpIdx) {
        if (idxs.length < 2) {
            continue
        }
        let legacy = (cntOld.get(name) || 0) >= 2 &&
            idxs.length <= cntOld.get(name) &&
            idxs.every((k) => {
                let id = rowsNew[k].id
                return isStr(id) && nameOfId.get(id) === name
            }) &&
            new Set(idxs.map((k) => rowsNew[k].id)).size === idxs.length //同一 id 重送不算兩列
        if (!legacy) {
            //回「造成或觸及」之列: 該名稱各列中第一個不是「庫內同 id 同名之既有列」者(新增、或由他名改入); 無(僅同 id 重送等)則回第二次出現者
            let kTouch = idxs.find((k) => !(isStr(rowsNew[k].id) && nameOfId.get(rowsNew[k].id) === name))
            let k = (kTouch === undefined) ? idxs[1] : kTouch
            if (kBad < 0 || k < kBad) {
                kBad = k
            }
        }
    }
    return kBad
}


export default findTouchedDup
