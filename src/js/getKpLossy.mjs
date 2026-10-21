import eachOwn from './eachOwn.mjs'
import cvKpToArr from './cvKpToArr.mjs'
import getEffMode from './getEffMode.mjs'
import isAuthMode from './isAuthMode.mjs'


/**
 * 判定帶 mode 之授權資料(JSON5.parse(cgrups／cpemis) 之結果)是否含「編輯器無法以物件形式無損表示」之格, 回傳受影響之名稱
 *
 * 編輯器存檔一律寫物件形式 { 名稱: { mode, isActive } }(每個名稱只有一個 mode); 外部應用可直接寫入陣列形式, 其下列兩格物件形式無法無損表示,
 * 硬寫即靜默改變授權(規則帳本 R-AUTH-LOSSY-01; 複審 R4), 編輯器須拒存並顯示固定訊息(authLossyBlocked), 庫內字串不動:
 * - 同名啟用元素之有效模式同時為 OR 與 AND: 物件形式只能留一個 mode. 合併規則為「(所有 OR 聯集) ∩ (所有 AND)」(R-AUTH-MERGE-00), 同名同時為 OR 與 AND 時
 *   該項既擴張聯集又收斂交集, 保留 AND 支會使聯集少了該項(減權), 保留 OR 支則少了一個交集條件(增權), 一律視為有損(此格若整組只有該名稱則碰巧相等, 仍從嚴判定).
 * - 啟用元素之名稱不是字串(陣列元素無 name 等): 物件形式沒有對應的鍵. 該元素仍以懸空引用參與合併(內容全 n; AND 使結果為空, OR 使「無 OR 時以第一個 AND 為基底」失效,
 *   R-PRINCIPLE-00 c), 靜默丟棄即放寬, 故拒存(R-PRINCIPLE-00 f 之「無法原樣保留則拒存」; 空字串名稱則可原樣保留為物件鍵 '', 不在此格). 名稱以 `#<序號>`(1 起算)表示.
 *
 * - 該層啟用項皆 mode 缺或非法(沒有任何 mode 合法的啟用項; 陣列與物件形式皆可): mode 缺或非法者伺服端只當限制項(R-PRINCIPLE-00 e, 無合法項時結果全 n),
 *   編輯器解碼為 AND 並於存檔時寫出 AND, 該項會成為唯一的 AND 基底而授予其內容(比修正前多給), 故拒存; 該層另有 mode 合法之啟用項時, 限制項與 AND 等價, 不在此格.
 *
 * 不再判定「AND 名稱之相對順序」: 合併規則下結果與項目之儲存順序、物件鍵序、陣列元素序無關(R-AUTH-MERGE-00 第 4 條; ADR-033 取代 ADR-001 非對稱條),
 * 整數式名稱被 JS 屬性序排前不再改變授權(原 run02 之排序保護 keepKeyOrder／getKeyOrderLost／getKpWriteLost 隨之移除).
 * 啟用元素: isActive 為 'y' 者(mode 缺或非法者視為 AND 限制項, 見 getEffMode; 同伺服端 mergeRules).
 * 編輯器自己寫出之物件形式(每個名稱有合法 mode)與其他輸入恆可無損表示, 回傳空陣列. 以原函式 getUserRules 為真理之窮舉驗證見 unit-cvKpToObj PR-001／PR-001b／PR-003
 * (凡存檔前後授權不相等者皆被本函數判定, 漏判 0; 本函數為保守側, 某些整體授權碰巧相等之格仍判有損).
 *
 * @param {Object|Array} kp 輸入 JSON5.parse(cgrups／cpemis) 之結果
 * @returns {Array} 回傳受影響之名稱陣列(不重複), 無損回傳空陣列; 不改動輸入
 * @example
 *
 * console.log(getKpLossy([{ name: 'G1', mode: 'OR', isActive: 'y' }, { name: 'G1', mode: 'AND', isActive: 'y' }]))
 * // => ['G1']
 * console.log(getKpLossy([{ name: 'G1', mode: 'OR', isActive: 'y' }, { name: 'G1', isActive: 'y' }]))
 * // => ['G1']  (缺 mode 視為 AND)
 * console.log(getKpLossy([{ mode: 'AND', isActive: 'y' }]))
 * // => ['#1']
 * console.log(getKpLossy({ G1: { mode: 'OR', isActive: 'y' } }))
 * // => []
 *
 */
function getKpLossy(kp) {
    if (kp === null || typeof kp !== 'object') {
        return []
    }

    //kpModes: 啟用元素之名稱 → 出現過的有效 mode; unnamed: 啟用而名稱非字串之元素; bad: 啟用而 mode 缺或非法之名稱; nValid: mode 合法之啟用元素數
    let kpModes = Object.create(null)
    let unnamed = []
    let bad = []
    let nValid = 0
    let k = 0
    eachOwn(cvKpToArr(kp), (r) => {
        k++
        if (r.isActive !== 'y') {
            return true //跳出換下一個
        }
        if (isAuthMode(r.mode)) {
            nValid++
        }
        if (typeof r.name !== 'string') {
            unnamed.push(`#${k}`)
            return true //跳出換下一個
        }
        if (!isAuthMode(r.mode)) {
            bad.push(r.name)
        }
        let m = getEffMode(r.mode)
        if (!(r.name in kpModes)) {
            kpModes[r.name] = []
        }
        if (!kpModes[r.name].includes(m)) {
            kpModes[r.name].push(m)
        }
    })

    //同名同時有效 OR 與 AND(僅陣列形式可能), 及啟用而無字串名稱者
    let out = []
    eachOwn(kpModes, (ms, n) => {
        if (ms.length > 1) {
            out.push(n)
        }
    })

    //該層啟用項皆 mode 缺或非法(沒有任何合法 mode 的啟用項, 含物件形式): 伺服端以其為限制項、結果全 n(mergeRules), 編輯器解碼為 AND 後存檔會使其成為基底而授予內容(多給), 故拒存
    if (nValid === 0) {
        eachOwn(bad, (n) => {
            if (!out.includes(n)) {
                out.push(n)
            }
        })
    }

    return [...out, ...unnamed]
}


export default getKpLossy
