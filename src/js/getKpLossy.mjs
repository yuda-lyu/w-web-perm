import isestr from 'wsemi/src/isestr.mjs'
import eachOwn from './eachOwn.mjs'
import cvKpToArr from './cvKpToArr.mjs'
import isAuthMode from './isAuthMode.mjs'


/**
 * 判定帶 mode 之授權資料(JSON5.parse(cgrups／cpemis) 之結果)是否含「編輯器無法以物件形式無損表示」之格, 回傳受影響之名稱
 *
 * 編輯器存檔一律寫物件形式 { 名稱: { mode, isActive } }(每個名稱只有一個 mode、鍵序為 JS 屬性序); 外部應用可直接寫入陣列形式, 其下列兩格物件形式無法無損表示,
 * 硬寫即靜默改變授權(規則帳本 R-AUTH-LOSSY-01; 複審 R4), 編輯器須拒存並顯示固定訊息(authLossyBlocked), 庫內字串不動:
 * 1. 同名有效啟用元素同時為 OR 與 AND: 物件形式只能留一個 mode. 保留 AND 支者, 另有其他 AND 名稱時 AND 合併之起始值由 OR 聯集改為第一個 AND 項而增權(外審 sol 第三輪#2);
 *    保留 OR 支或停用者亦會減權或增權, 一律視為有損(此格若整組只有該名稱則碰巧相等, 仍從嚴判定).
 * 2. 有效 AND 名稱 ≥ 2 且其相對順序於伺服端序(陣列元素首次有效出現之序)與物件鍵序(整數式鍵先、遞增)不同:
 *    mergeRules 在沒有有效 OR 項時以第一個 AND 項為 AND 合併之起始, 結果因之而異; 整數式名稱(如群組名 '1')在物件形式中恆排在前面, 陣列形式之順序無法保留.
 *    須比整個相對順序而非只比第一個: 查無實體(群組／權限表內沒有)之名稱會被伺服端 arrFinder 丟棄、編輯器存檔時亦不寫出, 丟棄後實際的第一個 AND 項可能是其後任一名稱(外審 sol#1／minimax#1).
 * 有效啟用元素: 名稱為非空字串、isActive 為 'y'、mode 為 OR／AND(同伺服端 arrFinder 以 === 比對名稱、mergeRules 跳過非 OR／AND 者).
 * 物件形式(編輯器自己寫出之形式、鍵唯一、鍵序即伺服端序)與其他輸入恆可無損表示, 回傳空陣列. 以原函式 getUserRules 為真理之窮舉驗證見 unit-cvKpToObj PR-001／PR-001b／PR-003
 * (凡存檔前後授權不相等者皆被本函數判定, 漏判 0; 本函數為保守側, 某些整體授權碰巧相等之格仍判有損).
 *
 * @param {Object|Array} kp 輸入 JSON5.parse(cgrups／cpemis) 之結果
 * @returns {Array} 回傳受影響之名稱陣列(不重複), 無損回傳空陣列; 不改動輸入
 * @example
 *
 * console.log(getKpLossy([{ name: 'G1', mode: 'OR', isActive: 'y' }, { name: 'G1', mode: 'AND', isActive: 'y' }]))
 * // => ['G1']
 * console.log(getKpLossy({ G1: { mode: 'OR', isActive: 'y' } }))
 * // => []
 *
 */
function getKpLossy(kp) {
    if (!Array.isArray(kp)) {
        return []
    }

    //seq: 有效啟用元素(依伺服端序)
    let seq = []
    eachOwn(cvKpToArr(kp), (r) => {
        if (isestr(r.name) && r.isActive === 'y' && isAuthMode(r.mode)) {
            seq.push({ name: r.name, mode: r.mode })
        }
    })

    let out = []
    let add = (n) => {
        if (!out.includes(n)) {
            out.push(n)
        }
    }

    //1) 同名同時有效 OR 與 AND
    let kpModes = Object.create(null)
    eachOwn(seq, (e) => {
        if (!(e.name in kpModes)) {
            kpModes[e.name] = []
        }
        if (!kpModes[e.name].includes(e.mode)) {
            kpModes[e.name].push(e.mode)
        }
    })
    eachOwn(kpModes, (ms, n) => {
        if (ms.length > 1) {
            add(n)
        }
    })

    //2) AND 名稱之相對順序於伺服端序與物件鍵序不同
    let andOrder = []
    eachOwn(seq, (e) => {
        if (e.mode === 'AND' && !andOrder.includes(e.name)) {
            andOrder.push(e.name)
        }
    })
    if (andOrder.length >= 2) {
        let probe = Object.create(null)
        eachOwn(andOrder, (n) => {
            probe[n] = true
        })
        if (Object.keys(probe).some((n, i) => n !== andOrder[i])) {
            eachOwn(andOrder, add)
        }
    }

    return out
}


export default getKpLossy
