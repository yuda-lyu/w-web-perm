import iseobj from 'wsemi/src/iseobj.mjs'
import isestr from 'wsemi/src/isestr.mjs'
import eachOwn from './eachOwn.mjs'
import cvKpToArr from './cvKpToArr.mjs'
import isAuthMode from './isAuthMode.mjs'


/**
 * 授權資料(JSON5.parse(cgrups／cpemis／crules) 之結果)統一為以名稱為鍵之物件形式, 供編輯對話框依名稱查值(getOwn／getRuleEnable)
 *
 * 外部應用可直接寫入陣列形式 [{ "name": "A", "isActive": "y" }], 伺服端 getUserRules 相容並授權(規則帳本 R-AUTH-DECODE-01);
 * 編輯對話框若依名稱為鍵查值會查不到陣列元素 → 顯示停用 → 管理者存檔即撤銷有效授權. 本函數與伺服端共用 cvKpToArr 之解碼(單一擁有者),
 * 並使「編輯器顯示啟用 ⇔ 該元素被伺服端採納(納入合併; 元素層級, 非最終權限樹)」.
 *
 * 存檔後授權不變(複審 R3／R4, 規則帳本 R-AUTH-ORDER-01／R-AUTH-LOSSY-01): 解碼後之鍵序即伺服端序, 編輯器以 keepKeyOrder 保留原鍵序後寫出;
 * 物件形式無法無損表示之格(同名有效 OR／AND 並存; 有效 AND 名稱 ≥ 2 且第一個 AND 名稱因整數式鍵先排而易位)由 getKpLossy 判定,
 * 編輯器對之拒存並顯示固定訊息(authLossyBlocked), 不寫出. 其餘格(含兩個以上 AND 群組)在保序下存檔前後授權相等(unit-cvKpToObj PR-001／PR-001b／PR-003／PR-004 窮舉).
 *
 * - opt.hasMode 為 false(預設, crules): 伺服端 mergeRules 以 kpRule[vv.name] = vv.isActive 收斂, 鍵經 JS 屬性鍵轉型(true → 'true'、['T1'] → 'T1'、非物件元素之索引 → '0'),
 *   同名後者覆蓋前者; 本函數以同一個指派式 o[r.name] = … 取得相同鍵與相同覆蓋順序(crules 之合併與順序無關, 無有損格).
 * - opt.hasMode 為 true(cgrups／cpemis): 伺服端 arrFinder 以 === 比對名稱(非字串名稱不授權), 且 isActive 為 'y' 而 mode 非 OR／AND 者不納入合併(不授權).
 *   故僅名稱為非空字串者保留; isActive 為 'y' 而 mode 不合法者改為 'n'(顯示停用——否則存檔會補預設 OR 而把「不授權」變成「授權」); 同名重複者, 各「有效啟用元素」(isActive 'y' 且 mode 合法)
 *   模式一致時合為一個啟用項(與伺服端逐項合併等價: 同模式同規則之重複不改變結果); 無有效啟用元素時為 'n'; 同名 AND 與 OR 並存者(物件形式無法無損表示, 由 getKpLossy 判定並拒存)
 *   此處僅取 AND 支作為顯示值. 鍵序: 有效啟用元素首次出現之序在前(伺服端 AND 合併之第一個 AND 項依此序), 其後為無有效元素之名稱(首次出現之序);
 *   整數式名稱(如 '1')受 JS 屬性序影響恆排前面, 該格由 getKpLossy 判定.
 *
 * 物件形式: 值為物件者去掉值內 name(外層鍵為名, 規則帳本 R-AUTH-PATH-01: 否則關聯對話框存檔會把授權改指到值內 name 所指之項目); hasMode 時另把 isActive 'y' 而 mode 不合法者改為 'n'.
 * 無需修改時原樣回傳(同一參考, 既有行為不變). 陣列形式一律回傳無原型物件(原型鍵名〔__proto__、constructor、toString〕可為一般鍵).
 *
 * @param {Object|Array} kp 輸入 JSON5.parse(cgrups／cpemis／crules) 之結果
 * @param {Object} [opt={}] 輸入設定物件
 * @param {Boolean} [opt.hasMode=false] 輸入是否為帶 mode 之資料(cgrups／cpemis 為 true, crules 為 false), 預設false
 * @returns {Object} 回傳以名稱為鍵之物件; 輸入非物件且非陣列時原樣回傳
 * @example
 *
 * let kp = cvKpToObj([{ name: 'A', mode: 'OR', isActive: 'y' }], { hasMode: true })
 * console.log(kp.A)
 * // => { mode: 'OR', isActive: 'y' }
 * console.log(cvKpToObj([{ name: 'A', isActive: 'y' }], { hasMode: true }).A)
 * // => { isActive: 'n' }  (缺 mode: 伺服端不授權)
 *
 */
function cvKpToObj(kp, opt = {}) {
    let hasMode = (opt !== null && typeof opt === 'object') && opt.hasMode === true

    //物件形式
    if (!Array.isArray(kp)) {
        if (kp === null || typeof kp !== 'object') {
            return kp
        }
        let changed = false
        let o = Object.create(null)
        eachOwn(kp, (v, k) => {
            let nv = v
            if (iseobj(v)) {
                nv = { ...v }
                delete nv.name
                if (hasMode && nv.isActive === 'y' && !isAuthMode(nv.mode)) {
                    nv.isActive = 'n'
                }
                changed = changed || ('name' in v) || (nv.isActive !== v.isActive)
            }
            o[k] = nv
        })
        return changed ? o : kp
    }

    //陣列形式
    let arr = cvKpToArr(kp)
    let o = Object.create(null)
    if (!hasMode) {
        eachOwn(arr, (r) => {
            let rest = { ...r }
            delete rest.name
            o[r.name] = rest //同伺服端 kpRule[vv.name] = vv.isActive: 鍵轉型與覆蓋順序相同
        })
        return o
    }
    let seen = [] //名稱之首次出現序(kpG 為物件, 整數式鍵會被 JS 屬性序重排, 故另存陣列)
    let kpG = Object.create(null) //名稱 → { acts: 有效啟用元素, last: 最後一個元素, effAt: 首個有效啟用元素之位置(無則 -1) }
    eachOwn(arr, (r, i) => {
        if (!isestr(r.name)) { //伺服端 arrFinder 以 === 比對, 非字串(含元素非物件之索引名稱)不授權
            return true //跳出換下一個
        }
        let rest = { ...r }
        delete rest.name
        if (!(r.name in kpG)) {
            kpG[r.name] = { acts: [], last: null, effAt: -1 }
            seen.push(r.name)
        }
        kpG[r.name].last = rest
        if (rest.isActive === 'y' && isAuthMode(rest.mode)) {
            kpG[r.name].acts.push(rest)
            if (kpG[r.name].effAt < 0) {
                kpG[r.name].effAt = i
            }
        }
    })

    //鍵序(R-AUTH-ORDER-01): 有效啟用元素首次出現之序在前(停用或缺 mode 之元素不算, 否則停用在前者會使伺服端之第一個 AND 項易位), 其後為無有效元素之名稱(首次出現之序)
    let names = [
        ...seen.filter((n) => kpG[n].effAt >= 0).sort((a, b) => kpG[a].effAt - kpG[b].effAt),
        ...seen.filter((n) => kpG[n].effAt < 0),
    ]
    eachOwn(names, (name) => {
        let g = kpG[name]
        let modes = []
        eachOwn(g.acts, (a) => {
            if (!modes.includes(a.mode)) {
                modes.push(a.mode)
            }
        })
        if (modes.length === 0) {
            o[name] = { ...g.last, isActive: 'n' } //無有效啟用元素: 停用
        }
        else if (modes.length === 1) {
            o[name] = { ...g.acts[0] }
        }
        else {
            o[name] = { ...g.acts.find((a) => a.mode === 'AND') } //AND 與 OR 並存(物件形式無法無損表示, 由 getKpLossy 判定並拒存): 此處僅取 AND 支作為顯示值
        }
    })
    return o
}


export default cvKpToObj
