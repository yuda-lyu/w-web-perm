import getPropKey from './getPropKey.mjs'
import { fmtWarn, getRefWarns } from './getAuthWarn.mjs'
import { REF_OF, planRefChanges } from './refCascade.mjs'


//清單頁「儲存」前之引用連帶預覽(規則帳本 R-PRINCIPLE-00 原則 6、適用表 m／n; R-REF-CASCADE-01; ADR-036):
//群組頁／權限頁改名 → 引用端(使用者 cgrups／群組 cpemis)於同一次寫入內連帶改名; 標的頁刪除或改 id → 引用它之權限 crules 項目被連帶清理(標的 id 即名稱, 改 id 等同刪舊增新, 不級聯).
//預覽與伺服端寫入用同一純函數 planRefChanges(src/js/refCascade.mjs), 前端以 store 之基準列計, 伺服端以實際為準.
//本檔只判定「要不要彈確認框」與「改名之成功訊息是否附帶筆數」並產生文字(刪除與標的頁之成功訊息不變), 不依賴 Vue／DOM; 元件只做薄接線(確認框、鎖釋放與 loading 仍在元件之 core()).
//
//kind: 'Grup'(群組頁, 引用端 users)、'Pemi'(權限頁, 引用端 grups)、'Target'(標的頁, 引用端 pemis)


let KIND = {
    Grup: {
        keyTable: 'grups',
        rename: true,
        confirm: 'confirmSaveRenameRefsGrup',
        confirmExt: 'confirmSaveRenameRefsExtGrup',
        success: 'grupSaveGrupsSuccessCascade',
    },
    Pemi: {
        keyTable: 'pemis',
        rename: true,
        confirm: 'confirmSaveRenameRefsPemi',
        confirmExt: 'confirmSaveRenameRefsExtPemi',
        success: 'pemiSavePemisSuccessCascade',
    },
    Target: {
        keyTable: 'targets',
        rename: false,
        confirm: 'confirmSaveDelRefsTarget',
        confirmExt: '',
        success: '', //標的頁不改成功訊息(刪除之筆數已於確認框告知)
    },
}


let MAX_NAMES = 5


let hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k)
let isStr = (v) => typeof v === 'string'


//showName: 名稱之顯示形式, 空字串顯示為 "" (否則清單中看不到, 同 getRefWarns 之 label)
let showName = (v) => (v === '' ? '""' : String(v))


/**
 * 把項目陣列以「, 」串接, 超過上限者截斷並加「共 N 個」之語系文字(cascadeListMore, {n} 為項目總數)
 *
 * @param {Array} items 輸入項目字串陣列
 * @param {Function} $t 輸入語系函數(key → 文字)
 * @param {Number} [max=5] 輸入最多列出幾項, 預設5
 * @returns {String} 回傳字串, 如 'a, b' 或 'a, b, c, d, e …等 12 個'
 */
function joinList(items, $t, max = MAX_NAMES) {
    let s = items.slice(0, max).join(', ')
    if (items.length > max) {
        s = `${s} ${fmtWarn($t('cascadeListMore'), { n: items.length })}`
    }
    return s
}


//getHitKeys: 計畫內「有被改寫之引用端列」之原授權字串中出現之名稱鍵集合(field 為 'nRename' 取有改名者、'nDel' 取有刪除者);
//解碼經 getRefWarns(getAuthWarn.mjs 之 parseKp＋cvKpToArr, 與 rewriteRefs 及伺服端同一套; 不另開 JSON5.parse 讀取點, 見 test/unit-cvKpToObj SITE-AD-001), 被引用表列給空陣列(只取 items 之名稱, 不查實體);
//名稱依 kind 取比對鍵('ref' 只認字串, 'rule' 取屬性鍵轉型, 同 rewriteRefs), 供名單只列「真的有人引用」者, 不列無人引用之改名／刪除
let getHitKeys = (plan, field) => {
    let set = new Set()
    let kind = hasOwn(REF_OF, plan.keyTable) ? REF_OF[plan.keyTable].kind : 'ref'
    plan.changes.forEach((c) => {
        if (!(c[field] > 0) || !isStr(c.before)) {
            return
        }
        getRefWarns(c.before, []).items.forEach((it) => {
            if (kind === 'ref' && !isStr(it.name)) {
                return
            }
            let key = getPropKey(it.name)
            if (key !== null) {
                set.add(key)
            }
        })
    })
    return set
}


/**
 * 依引用連帶計畫產生儲存前確認框文字與儲存成功訊息(群組頁／權限頁／標的頁共用)
 *
 * 確認框(confirmText, 空字串不彈框):
 *   Grup／Pemi: plan.err 為 null、有改名(plan.renames)且有引用端列因改名被連帶更新(plan.nRenameHolders > 0)時, 列出受影響引用端數與「舊→新」(至多 5 個, 只列有人引用者, 其餘「…等 N 個」),
 *     其中來源 from 非空(外部應用)之引用端另加一句警示(下次外部同步時可能被外部資料覆寫); 僅刪除所致之連帶清理已於「刪除」時確認(getDelImpact), 儲存時不再重複.
 *   Target: plan.err 為 null 且有權限之規則將被清理(plan.nDelHolders > 0)時, 列出受影響之權限數與被刪除或改 id 之管控對象(同上截斷).
 *   plan.err 非 null(伺服端將以固定語系鍵拒存)不彈框, 由呼叫端照常送出, 錯誤訊息由既有 showCheckYes 顯示.
 * 成功訊息(successText, 空字串即使用原成功文字): 只有 Grup／Pemi 且 plan.err 為 null、有改名(plan.renames.length > 0)且有引用端因改名被連帶更新(plan.nRenameHolders > 0)時, 回傳附帶筆數(nRenameHolders)之「引用已更新為新名稱」訊息;
 *   刪除所致之連帶清理(筆數已於刪除確認框告知, 且既有案例刪除被引用列後儲存之成功彈窗須維持原文字)與 Target 頁一律回空字串.
 *
 * @param {Object} plan 輸入 planRefChanges 之結果; null／非物件／keyTable 與 kind 不符視為無影響
 * @param {Function} $t 輸入語系函數(key → 文字)
 * @param {String} kind 輸入頁面種類: 'Grup'、'Pemi' 或 'Target'
 * @returns {Object} 回傳 { confirmText, successText }
 * @example
 *
 * let plan = planRefChanges({ keyTable: 'grups', rowsOld: [{ id: 'g1', name: 'A' }], rowsNew: [{ id: 'g1', name: 'B' }], holdersOld: [{ id: 'u1', cgrups: '{"A":{"mode":"OR","isActive":"y"}}' }] })
 * console.log(getCascadePreview(plan, (k) => k, 'Grup').confirmText)
 * // => confirmSaveRenameRefsGrup(語系函數為恆等時回傳鍵名)
 *
 */
function getCascadePreview(plan, $t, kind) {
    let res = { confirmText: '', successText: '' }
    if (!hasOwn(KIND, kind)) {
        return res
    }
    let cfg = KIND[kind]
    if (plan === null || typeof plan !== 'object' || plan.err !== null || plan.keyTable !== cfg.keyTable || !Array.isArray(plan.changes) || !Array.isArray(plan.renames)) {
        return res
    }

    //confirmText, successText(successText 只描述改名, 條件同改名確認框, 筆數為 nRenameHolders 而非 nHolders)
    if (cfg.rename) {
        if (plan.renames.length > 0 && plan.nRenameHolders > 0) {
            res.successText = fmtWarn($t(cfg.success), { n: plan.nRenameHolders })
            let hit = getHitKeys(plan, 'nRename')
            let rns = plan.renames.filter((rn) => hit.has(rn.from))
            if (rns.length === 0) {
                rns = plan.renames //防呆: 名單判不出時退回全部改名, 不讓確認框無名單
            }
            let list = joinList(rns.map((rn) => `${showName(rn.from)}→${showName(rn.to)}`), $t)
            let nExt = plan.changes.filter((c) => c.nRename > 0 && isStr(c.from) && c.from !== '').length
            res.confirmText = fmtWarn($t(nExt > 0 ? cfg.confirmExt : cfg.confirm), { n: plan.nRenameHolders, e: nExt, list })
        }
    }
    else if (plan.nDelHolders > 0) {
        let hit = getHitKeys(plan, 'nDel')
        let names = plan.delNames.filter((v) => hit.has(v))
        if (names.length === 0) {
            names = plan.delNames
        }
        let list = joinList(names.map((v) => showName(v)), $t)
        res.confirmText = fmtWarn($t(cfg.confirm), { n: plan.nDelHolders, list })
    }

    return res
}


/**
 * 儲存前預覽: 以與伺服端同一純函數規劃(planRefChanges), 再產生確認框文字與成功訊息; 預覽為輔助資訊, 計畫過程拋例外不得擋住儲存(回傳全空, 伺服端以實際為準)
 *
 * @param {Object} p 輸入參數物件
 * @param {String} p.kind 輸入頁面種類: 'Grup'、'Pemi' 或 'Target'
 * @param {Array} p.rowsOld 輸入基準列(store 之 grups／pemis／targets)
 * @param {Array} p.rowsNew 輸入欲送出之列(清單目前之列)
 * @param {Array} p.holdersOld 輸入引用端列(store 之 users／grups／pemis)
 * @param {Boolean} [p.cascadeRename=true] 輸入伺服端是否做改名級聯(webInfor.cascadeRename), 僅給 false 才關閉, 預設true
 * @param {Function} p.$t 輸入語系函數(key → 文字)
 * @returns {Object} 回傳 { plan, confirmText, successText }; 發生例外時 plan 為 null
 */
function getSavePreview(p) {
    let kind = p ? p.kind : ''
    if (!hasOwn(KIND, kind)) {
        return { plan: null, confirmText: '', successText: '' }
    }
    try {
        let plan = planRefChanges({
            keyTable: KIND[kind].keyTable,
            rowsOld: p.rowsOld,
            rowsNew: p.rowsNew,
            holdersOld: p.holdersOld,
            opt: { cascadeRename: p.cascadeRename !== false },
        })
        return { plan, ...getCascadePreview(plan, p.$t, kind) }
    }
    catch (err) {
        console.log('getSavePreview', err)
        return { plan: null, confirmText: '', successText: '' }
    }
}


export { getCascadePreview, getSavePreview, joinList }
export default getCascadePreview
