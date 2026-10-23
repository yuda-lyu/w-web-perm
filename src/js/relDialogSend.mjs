//反向關聯對話框(VeGrupBlngUsers／VePemiBlngGrups)存檔時「送出之整表」之組裝(F-26 對話框部分、S4; R-PRINCIPLE-00 原則 3; 規則帳本 R-BASELINE-01): 純函數(不依賴 Vue／DOM), 兩個對話框共用.
//
//背景: 對話框之列是開框時 store 快照之投影(只含「歸屬」一欄可改). 修前存檔以「對話框之列」映射成整表送出, 開框期間他人／外部同步新增之列不在對話框內, 被伺服端整表 diff 刪除(S4);
//且對話框之列為開框時之草稿值, 若某列之歸屬於開框後被他人改過而使用者並未碰它, 以草稿值改寫即以舊值覆蓋他人之變更.
//修後: 送出之整表＝存檔當下 store 快照之全部列; 使用者於本次編輯有變更之列(相對開框時之歸屬狀態)才以 putRefEntry 只改本群組／權限之一項(套用於存檔當下快照之字串);
//其餘一律原樣帶回(同一個物件、逐字不動). 注意(run11 起): 伺服端載入基準比對為表級(整表, R-BASELINE-01), 與「帶回哪個版本之列」無關——開框後他人若改了任何一列或增刪列, 本次存檔仍整次拒收 saveStale(請重新開啟); 帶回存檔當下 store 版本之列只是避免誤刪／誤改他人之列.
//本檔不解析授權字串(解析與 putRefEntry 留在 .vue 之 doSave, 站點由 unit-cvKpToObj SITE-AD-001 盤點), 只處理狀態比對與整表組裝.

import getEffMode from './getEffMode.mjs'
import { toId } from './pairRowsToSnapshot.mjs'


let isObj = (v) => v !== null && typeof v === 'object'
let hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k)


/**
 * 取得對話框列之歸屬有效狀態(與 putRefEntry 之相等判定同一口徑: 不歸屬 → 'n'; 歸屬 → 'y:' 加有效 mode)
 *
 * 不歸屬時 mode 無授權效果(putRefEntry 對停用目標不看 mode), 故不納入; 歸屬時 mode 取 getEffMode(非 'OR' 者為 'AND').
 *
 * @param {*} enable 輸入列之 enable('y' 為歸屬, 其他為不歸屬)
 * @param {*} mode 輸入列之 mode
 * @returns {String} 回傳 'n'、'y:OR' 或 'y:AND'
 * @example
 *
 * console.log(getRowState('n', 'AND'), getRowState('y', 'OR'), getRowState('y', 'or'))
 * // => n y:OR y:AND
 *
 */
function getRowState(enable, mode) {
    return enable === 'y' ? `y:${getEffMode(mode)}` : 'n'
}


/**
 * 由開框時生成之列(items)記錄各列之歸屬有效狀態(以列身分為鍵), 供存檔時判定「使用者於本次編輯有無變更該列」
 *
 * 須於 show() 生成 items 之同一處、尚未有任何切換操作前呼叫(opt.rows 與 items 為同一份陣列, 切換會就地改 enable／mode).
 *
 * @param {Array} rows 輸入開框時生成之列(各列帶 id、enable、mode); 非陣列視為無列
 * @returns {Object} 回傳無原型物件 id(字串形式; 數字身分以其字串形式) → 'n'｜'y:OR'｜'y:AND'; 缺身分之列不記, 同身分重複者取第一筆
 */
function makeRowStates(rows) {
    let kp = Object.create(null) //無原型: 鍵為使用者資料(R-KEY-01)
    ;(Array.isArray(rows) ? rows : []).forEach((r) => {
        let id = isObj(r) ? toId(r.id) : null
        if (id !== null && !(id in kp)) {
            kp[id] = getRowState(r.enable, r.mode)
        }
    })
    return kp
}


/**
 * 找出對話框之列中「使用者於本次編輯相對開框時有變更」者之列索引
 *
 * 比對列目前之歸屬有效狀態與開框時記錄者(makeRowStates); 相同(含切換後又切回)視為未變更.
 * 無法證明未變更者一律視為有變更(fail toward 既有流程: 對存檔當下快照字串套用 putRefEntry, 再由伺服端基準比對把關): 列缺身分、開框時無該列之記錄、未給記錄(null／非物件).
 *
 * @param {Array} rows 輸入對話框目前之列(opt.rows); 非陣列回傳空物件
 * @param {Object} states 輸入 makeRowStates 之結果
 * @returns {Object} 回傳無原型物件 列索引 → true(只含有變更者)
 * @example
 *
 * let s = makeRowStates([{ id: 'u1', enable: 'n', mode: 'OR' }, { id: 'u2', enable: 'y', mode: 'OR' }])
 * let ch = getChangedIdx([{ id: 'u1', enable: 'y', mode: 'OR' }, { id: 'u2', enable: 'y', mode: 'OR' }], s)
 * console.log(Object.keys(ch))
 * // => ['0']
 *
 */
function getChangedIdx(rows, states) {
    let kp = Object.create(null)
    if (!Array.isArray(rows)) {
        return kp
    }
    for (let kr = 0; kr < rows.length; kr++) { //索引迴圈: 稀疏陣列之空洞視為無法證明未變更
        let r = rows[kr]
        let id = isObj(r) ? toId(r.id) : null
        let st0 = (id !== null && isObj(states) && hasOwn(states, id)) ? states[id] : undefined
        if (st0 === undefined || !isObj(r) || st0 !== getRowState(r.enable, r.mode)) {
            kp[kr] = true
        }
    }
    return kp
}


/**
 * 組裝送出之整表: 存檔當下 store 快照之全部列(依快照列序), 僅「有新值」之列改其引用欄位, 其餘原樣帶回
 *
 * 不改輸入; 未被改之列即快照中同一個物件(逐字不動, 含開框後他人新增而不在對話框內之列、使用者未變更之列).
 * 被改之列為快照列之淺拷貝加新值(只換 refKey 一欄, 其餘欄位逐字保留).
 *
 * @param {Array} snapshot 輸入存檔當下之 store 快照(依 order 排序之全部列); 非陣列回傳空陣列
 * @param {Array} pairs 輸入 pairRowsToSnapshot 之 pairs(對話框第 kr 列配到之快照列, 同一個物件參考; 配不到者為 null)
 * @param {Object} newVals 輸入列索引 → 該列新字串(只放使用者有變更且確需改寫者)
 * @param {String} refKey 輸入引用欄位名('cgrups'｜'cpemis')
 * @returns {Array} 回傳送出之整表(與 snapshot 等長同序)
 * @example
 *
 * let snapshot = [{ id: 'u1', cgrups: '{}' }, { id: 'u2', cgrups: '{"G":{}}' }, { id: 'u3', cgrups: '{}' }]
 * let rows = buildRowsSend(snapshot, [snapshot[0], snapshot[1]], { 0: '{"G1":{"mode":"OR","isActive":"y"}}' }, 'cgrups')
 * console.log(rows.map((r) => r.cgrups), rows[1] === snapshot[1], rows[2] === snapshot[2])
 * // => [ '{"G1":{"mode":"OR","isActive":"y"}}', '{"G":{}}', '{}' ] true true
 *
 */
function buildRowsSend(snapshot, pairs, newVals, refKey) {
    if (!Array.isArray(snapshot)) {
        return []
    }
    let kpNew = new Map() //快照列(物件參考) → 新字串; 同一快照列被多個對話框列配到時取第一個(對話框每個身分只有一列, 防禦用)
    if (Array.isArray(pairs) && isObj(newVals)) {
        for (let kr = 0; kr < pairs.length; kr++) {
            let u = pairs[kr]
            if (isObj(u) && hasOwn(newVals, kr) && typeof newVals[kr] === 'string' && !kpNew.has(u)) {
                kpNew.set(u, newVals[kr])
            }
        }
    }
    return snapshot.map((row) => (kpNew.has(row) ? { ...row, [refKey]: kpNew.get(row) } : row))
}


export { getRowState, makeRowStates, getChangedIdx, buildRowsSend }
export default buildRowsSend
