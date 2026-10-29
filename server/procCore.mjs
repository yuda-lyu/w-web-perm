import get from 'lodash-es/get.js'
import each from 'lodash-es/each.js'
import map from 'lodash-es/map.js'
import size from 'lodash-es/size.js'
import sortBy from 'lodash-es/sortBy.js'
import isestr from 'wsemi/src/isestr.mjs'
import isearr from 'wsemi/src/isearr.mjs'
import haskey from 'wsemi/src/haskey.mjs'
import arrHas from 'wsemi/src/arrHas.mjs'
import ltdtDiffByKey from 'wsemi/src/ltdtDiffByKey.mjs'
import ltdtmapping from 'wsemi/src/ltdtmapping.mjs'
import getOwn from '../src/js/getOwn.mjs'
import ds from '../src/schema/index.mjs'
import procLang from './procLang.mjs'
import validateRowsBeforeWrite from './validateRows.mjs'
import planRefChanges, { REF_OF, diffRefTargets, fillIdlessIds } from '../src/js/refCascade.mjs'
import { restoreExternalOrder, dropServerOnlyDiff, restoreServerFields, checkExternalWrite, hasExternalDiff } from '../src/js/externalRows.mjs'
import { isBaselineValid, getContract } from '../src/js/rowDigest.mjs'
import { getRefTarget, parseSubject, parseRefDecl, checkSubjectIdentity, checkRefIdentity } from '../src/js/refIdentity.mjs'
import { getRejectKey } from 'w-serv-orm/src/baseline.mjs'
import { findTouchedDup, findDupIndex, withTabLocks, checkUsersWrite, mapKeyOf, loginIdOf, findLoginIdClashDetail } from './keyCheck.mjs'
import { checkCascadePlan, writeWithCascade } from './cascadeWrite.mjs'
import { checkRawSecrets, msgOfErr, rawOfErr } from './maskRaw.mjs'


//isRowObj: 待寫入之列須為至少有一個自有可列舉鍵之物件(非 null、非陣列; 不用依 toString 判型之 iseobj, 免被 Symbol.toStringTag 偽稱)
let isRowObj = (r) => r !== null && typeof r === 'object' && !Array.isArray(r) && Object.keys(r).length > 0


/**
 * 僅採納既有列之指定欄位變更, 其餘欄位、新增列、缺列(刪除)與順序一律以資料庫現值為準
 *
 * 用於 modeEditUsers='for:grups': 使用者身分由外部單一登入系統同步, 本系統只擁有群組指派(cgrups), 故 API 層須與 UI 一致只接受 cgrups 變更
 *
 * @param {Array} ltdtDb 資料庫現有列(select 結果, 依 order 排序後為基底)
 * @param {Array} rowsIn 前端/外部送入之整表列; 須為真陣列(Array.isArray), 非陣列(含帶 length 之物件)視同未送入任何列, 不依其 length 迭代(規則帳本 R-OBJ-ITER-01)
 * @param {String} keyDetect 對應列之鍵欄位(如 'id')
 * @param {Array} pickKeys 允許採納之欄位名陣列(如 ['cgrups'])
 * @returns {Array} 以資料庫列為基底、僅覆蓋 pickKeys 之新列陣列(順序同資料庫)
 */
function mergePickKeysOnly(ltdtDb, rowsIn, keyDetect, pickKeys) {
    let kpIn = Object.create(null) //無原型: 鍵為使用者資料(id), 不得命中 constructor 等原型鍵(規則帳本 R-KEY-01)
    if (Array.isArray(rowsIn)) { //rowsIn 為客戶端 JSON: lodash each 對 { length: N } 物件會迭代 N 次並把索引 0 之值當列採納(R-OBJ-ITER-01)
        each(rowsIn, (r) => {
            let v = get(r, keyDetect, '')
            if (isestr(v)) {
                kpIn[v] = r
            }
        })
    }
    let ltdt = sortBy(ltdtDb, 'order')
    ltdt = map(ltdt, (u) => {
        let r = { ...u }
        let v = get(u, keyDetect, '')
        let rin = getOwn(kpIn, v, null) //庫內 id 是資料不是路徑: 含 . 或 [ 之 id 不得經 lodash get 路徑解析而被他列之巢狀欄位冒充(規則帳本 R-AUTH-PATH-01)
        if (rin !== null) {
            each(pickKeys, (k) => {
                if (haskey(rin, k)) {
                    r[k] = rin[k]
                }
            })
        }
        return r
    })
    return ltdt
}


//拒收鍵(w-serv-orm baseline.mjs 之固定英文鍵) → 本套件語系鍵; 一律提示重新載入(規格第 6 節; R-BASELINE-01):
//  baselineMismatch: 持舊畫面存檔(先動先贏); rowNotFound: 修改或刪除時該列已不存在(已被他人刪除, 不復活); baselineFormat: 基準格式或版本不識(含套內舊版指紋; 不得降級為不帶基準)
let kpRejectKey = {
    baselineMismatch: 'saveStale',
    rowNotFound: 'saveStale',
    baselineFormat: 'saveBaselineFormat',
}


/**
 * 用戶端(kpFunExt 第 3 參)的 opt 只採納 baseline、returnRows(是否於回傳附寫入後之列, 布林)、subject(反向對話框之主體身分摘要)與 refs(清單頁新增引用之被引用實體身分宣告),
 * 不接受 pickKeysOnly 等伺服端設定, 更不轉給 procOrm 之 opt(規格第 6 節: procOrm 之 opt 只能由伺服端程式自組);
 * 未給(undefined／null)之 baseline 視為舊客戶端／外部應用(不帶, 本 major 允許; 不比原行為多放行任何寫入); 未給之 subject／refs 自 perm-run03 起僅限「本次存檔不改變引用」者,
 * 改變引用(新增或移除啟用之引用項、新增列帶引用)而未附宣告 → 拒收 saveIdentityRequired(R-REF-IDENTITY-01 規則 7); 給了則一律驗證, 格式不合即拒收(baselineFormat／identityFormat; 不降級為不帶, R-SUBJECT-ID-01、R-REF-IDENTITY-01).
 * subject／refs 在此原樣轉出(不信任其內容), 由 updateTabItems 解析驗證; 驗證所需之表與鎖皆由伺服端依 keyTable 自組(getRefTarget), 用戶端不得指定
 *
 * @param {*} opt 輸入用戶端給之 opt(任何值)
 * @returns {Object} 回傳 { baseline?, returnRows?, subject?, refs? }
 */
function pickClientOpt(opt) {
    let o = (opt !== null && typeof opt === 'object') ? opt : {}
    let out = {}
    if (o.baseline !== undefined && o.baseline !== null) {
        out.baseline = o.baseline
    }
    if (o.returnRows === true) {
        out.returnRows = true
    }
    if (o.subject !== undefined && o.subject !== null) {
        out.subject = o.subject
    }
    if (o.refs !== undefined && o.refs !== null) {
        out.refs = o.refs
    }
    return out
}


//mappingBy: 使用者對應鍵('id'｜'email'｜'name', WWebPerm 已正規化; 未給或其他值視同 'id'), 供 users 整表寫入的對應鍵檢查(R-PRINCIPLE-00 適用表 h, R-MAPKEY-03)
//cascadeRename: 群組／權限改名時是否連帶更新引用(預設 true; 只管改名, 刪除連帶清理不受影響, R-REF-CASCADE-01)
//lockExternalRows: 後台是否不得改外部列(from 為非空字串者)之身分／結構欄(預設 true, R-EXT-OWN-01; 'n' 時回到舊行為, 僅保留 from 型別檢查)
//withTabLocks(別名 lockTabs), guardWrite: w-serv-orm 實例(WServOrm 回傳物件)之每表一鍵表鎖與原子防護(R-LOCK-CORE-01), 與外部同步(WWebPerm.syncAndReplaceTabs)共用同一個鎖管理器; 未注入即 TypeError(fail-closed, 不寫入)
//secrets: maskRaw.getRawSecrets(url) 之結果(必帶, 不留無秘密之舊介面; 缺即 TypeError): 直接呼叫 woItems 之 ORM 錯誤原文(驅動訊息可能回顯連線字串)寫入 srLog 之 raw 前, 先經 wsemi maskDiagText 移除連線憑證(R-ORM-DIAG-02)
function proc(woItems, procOrm, { srLog, withTabLocks: lockTabs, guardWrite, lockSave, secrets, mappingBy = 'id', cascadeRename = true, lockExternalRows = true }) {

    checkRawSecrets(secrets, 'procCore')


    //mapGuardErr: guardWrite／procOrm(mustExist)之拒收轉本套件語系鍵並記 srLog(只記錯誤鍵、原因與差異筆數, 不記列 id／個資值); rowsInvalid(庫內主鍵缺漏或重複)屬伺服端資料錯誤, 回 saveWriteFail 並記 log;
    //其餘(語系鍵字串、ORM 失敗、非預期例外)原樣轉出(由 errLog／toOutKey 處置)
    let mapGuardErr = (keyTable, userId) => (err) => {
        let k = getRejectKey(err)
        if (typeof k === 'string' && Object.prototype.hasOwnProperty.call(kpRejectKey, k)) {
            let n = 0
            let reason = k
            if (err !== null && typeof err === 'object' && Array.isArray(err.changed)) {
                n = err.changed.length + err.removed.length + err.added.length
                reason = err.changed.length > 0 ? 'rowChanged' : (err.removed.length > 0 ? 'rowRemoved' : (err.added.length > 0 ? 'rowAdded' : (err.reordered === true ? 'rowReordered' : k)))
                n = n > 0 ? n : (err.reordered === true ? 1 : 0)
            }
            srLog.error({ event: 'updateTabItems-stale-error', keyTable, userId, msg: kpRejectKey[k], reason, n })
            return Promise.reject(kpRejectKey[k])
        }
        if (k === 'rowsInvalid') {
            srLog.error({ event: 'updateTabItems-rows-invalid', keyTable, userId, msg: 'saveWriteFail', reason: 'rowsInvalid' })
            return Promise.reject('saveWriteFail')
        }
        return Promise.reject(err)
    }


    //updateTabItems
    let updateTabItems = async (keyTable, userId, rows, keyDetect, opt = {}) => {
        // console.log('updateTabItems', keyTable, userId, rows.length, keyDetect)

        //rows 須為陣列且各列為非空物件, 否則拒絕(規則帳本 R-ORM-05、R-OBJ-ITER-01): rows 來自客戶端 JSON(kpFunExt 引數).
        //修正前 ①非陣列(如 { length: N })經 ltdtmapping 變成 [], 被 ltdtDiffByKey 視為「全部刪除」而整表清空並回成功, 且下方 each(rows) 對 { length: N } 迭代 N 次(2**32-1 約 80 秒阻塞事件迴圈);
        //②單元素陣列其元素為空值([null]、[{}]、[''] 、[[]])時, ltdtmapping 內 wsemi isearr 判為非陣列而回 [], 同樣整表清空並回成功(外審 sol/minimax 實測).
        //空陣列 [] 仍合法(清空整表為正常操作); 外部同步 syncAndReplaceTabs 另以 isearr 拒絕空陣列(防誤清源, ADR-008), 兩者用途不同
        if (!Array.isArray(rows) || !rows.every(isRowObj)) {
            srLog.error({ event: 'updateTabItems-validate-error', keyTable, msg: 'saveRowFieldInvalid', reason: 'rowsInvalid', row: -1, field: '' })
            return Promise.reject('saveRowFieldInvalid')
        }

        //baseline: 草稿所依據之載入基準 [[id, digest], ...](h1 版, w-serv-orm baseline.mjs; F-26, R-BASELINE-01; 前端於開啟編輯時綁定); 未給(舊客戶端、外部應用)為 null;
        //給了但格式或版本不識(含套內舊版指紋、非陣列)→ 拒收 saveBaselineFormat(提示重新載入, 不降級為不帶基準), 於任何讀寫之前
        let baseline = get(opt, 'baseline', null)
        if (baseline !== null && !isBaselineValid(baseline)) {
            srLog.error({ event: 'updateTabItems-stale-error', keyTable, userId, msg: 'saveBaselineFormat', reason: 'baselineFormat', n: 0 })
            return Promise.reject('saveBaselineFormat')
        }

        //被引用實體身分(perm-run02 範圍一; R-SUBJECT-ID-01、R-REF-IDENTITY-01; 使用者 2026-10-23 裁示「正反關聯與主體身份檢查, 前後端都要做」; 原則 4: 檢查與寫入同一把鎖、原則 6: 引用不得被同名新資料接管):
        //  subject: 反向關聯對話框(users 之主體為 grups、grups 之主體為 pemis)開框時之主體摘要 { id, name, saved }; refs: 清單頁新增或移除之啟用引用項其名稱在選取當時對應之實體 id 宣告 [{ name, ids }].
        //  被引用表由伺服端依 keyTable 自組(getRefTarget, 用戶端不得指定), 於本表鎖之外層取其表鎖(階層: 被引用者先、引用端後, R-WRITE-LOCK-02)並新鮮讀取後驗證;
        //  perm-run03 範圍一(使用者 2026-10-23 裁示「這本來就該強制必帶吧? 要不然怎麼確認與驗證調用者身份?」): 宣告強制必帶——存檔改變了引用(新增或移除啟用之引用項、新增列帶引用)而未附宣告 → 拒收 saveIdentityRequired
        //  (於 write 內本表鎖下判定、零寫入; 無宣告者不取被引用表鎖: 無從驗證即拒收, 不需讀被引用表); 不改變引用之存檔(只改名、只改其他欄)不需宣告, 照常. 給了但格式不合或該表無授權引用欄 → 拒收 saveIdentityFormat(不降級), 於任何讀寫之前
        let subjectRaw = get(opt, 'subject', null)
        let refsRaw = get(opt, 'refs', null)
        let refInfo = getRefTarget(keyTable) //本表有授權引用欄者(users／grups／pemis)為 { table, field, kind }; targets 為 null(無需宣告)
        let refTarget = null
        let subject = null
        let refDecl = null
        if (subjectRaw !== null || refsRaw !== null) {
            refTarget = refInfo
            subject = subjectRaw === null ? null : parseSubject(subjectRaw)
            refDecl = refsRaw === null ? null : parseRefDecl(refsRaw)
            //主體摘要只用於反向對話框(主體表 grups／pemis, 有 name 欄); pemis 之被引用表為 targets(無 name、無反向對話框), 帶 subject 屬格式錯誤
            if (refTarget === null || (subjectRaw !== null && (subject === null || refTarget.table === 'targets')) || (refsRaw !== null && refDecl === null)) {
                srLog.error({ event: 'updateTabItems-identity-error', keyTable, userId, msg: 'saveIdentityFormat', reason: 'format', n: 0 })
                return Promise.reject('saveIdentityFormat')
            }
        }

        //returnRows: 存檔成功後於同一表鎖內新鮮讀回該表全部列隨回傳附上(規格第 8 節): 前端立即以之更新畫面與基準, 不必等推播／輪詢; 不以前端送出之值當新基準(寫入時 clearXSS 等會改寫字串)
        let returnRows = get(opt, 'returnRows', false) === true

        //pickKeysOnly, 僅採納既有列之指定欄位變更(見 mergePickKeysOnly), 未給則整表 diff 寫入
        let pickKeysOnly = get(opt, 'pickKeysOnly', null)

        //idsNew: 前端標為新增(transient 欄位 _isNew === true, 清單頁 addItem / copyItem 標記)之列 id, 供下方比對既有列 (ADR-025);
        //_isNew 不在 schema keys 內, 下方 ltdtmapping 取欄時即剝除不入庫. pickKeysOnly 模式不採納新增列(見 mergePickKeysOnly), 故不收集
        let idsNew = []
        if (!isearr(pickKeysOnly)) {
            each(rows, (r) => {
                if (get(r, '_isNew') === true) {
                    idsNew.push(get(r, 'id', ''))
                }
            })
        }

        //prepRows: 寫入前之純函式前處理(不讀庫、不取鎖): ltdtmapping、重給 order、空值／重複檢查、主鍵正規化與重複主鍵檢查; 錯誤以 Promise.reject(語系鍵) 回報(次序與修正前同: 先於基準比對).
        //非 pickKeysOnly 者在取鎖之前執行; pickKeysOnly(users 之 for:grups 模式)須以表鎖內新鮮讀取之庫內列為基底合併後才能前處理(見下方 write)
        let prepRows = async (rows) => {

        //ltdtmapping
        rows = ltdtmapping(rows, ds[keyTable].keys)
        // console.log('ltdtmapping rows', rows)

        //重給order
        rows = map(rows, (r, k) => {
            r.order = k + 1
            return r
        })

        //ckKey, 回傳 err key (saveRowFieldInvalid / saveRowFieldDuplicate) 或 null; 動態細節 (row index/field/value) 改記 srLog, 不進使用者訊息
        //opt.skipDup 為 true 時只檢查空值／非字串, 不檢查重複: pemis／grups 之名稱唯一改由下方 findTouchedDup 判定(只拒本次造成或觸及者, F-02, ADR-034)
        let ckKey = (rows, key, opt = {}) => {
            let err = null

            //check
            let kp = Object.create(null) //無原型: haskey 以 in 判斷, {} 之原型鍵(constructor、toString 等)恆為真而誤判重複(規則帳本 R-KEY-01)
            each(rows, (v, k) => {

                //value
                let value = get(v, key, '')

                //check
                if (!isestr(value)) {
                    srLog.error({ event: 'updateTabItems-ckKey-error', keyTable, key, msg: 'saveRowFieldInvalid', row: k })
                    err = `saveRowFieldInvalid`
                    return false //跳出
                }

                //check
                if (opt.skipDup !== true && haskey(kp, value)) {
                    srLog.error({ event: 'updateTabItems-ckKey-error', keyTable, key, msg: 'saveRowFieldDuplicate', row: k, value })
                    err = `saveRowFieldDuplicate`
                    return false //跳出
                }

                //kp
                kp[value] = true

            })

            return err
        }

        //偵測未給予或重複
        let err = null
        if (true) {
            if (arrHas(keyTable, ['targets'])) {
                err = ckKey(rows, 'id')
                if (err !== null) {
                    return Promise.reject(err)
                }
            }
            if (arrHas(keyTable, ['pemis', 'grups'])) { //users可重複name故不列入; 此處只驗空值, 名稱重複見下方 findTouchedDup
                err = ckKey(rows, 'name', { skipDup: true })
                if (err !== null) {
                    return Promise.reject(err)
                }
            }
            //users 之 email／對應鍵檢查改至下方 select 之後(需庫內現況判定「本次造成或觸及」, R-PRINCIPLE-00 適用表 h), 不再於此以整表 ckKey('email') 擋(歷史空值／重複會使所有存檔失敗)
        }

        //主鍵之有限數字轉為其字串形式(規則帳本 R-ORM-04; w-serv-orm 1.1.11 起庫內即如此存放): ltdtDiffByKey 以嚴格比對, 未轉時 123 對不上庫內之 '123',
        //成為「刪 '123' 再新增」而重設建立者與建立時間(userId、timeCreate); 放在 ckKey 之後, targets 仍只收字串主鍵(ckKey 以 isestr 檢查 id)
        rows = map(rows, (r) => {
            let id = get(r, 'id')
            return (typeof id === 'number' && Number.isFinite(id)) ? { ...r, id: String(id) } : r
        })

        //pemis／grups／users 以 id 對應既有列(見下方 isNameKeyTable／users 分支, ltdtDiffByKey 以 Map(id → 列)), 送入之整表內主鍵 id(字串)不得重複, 否則同批兩列被靜默併成一列而遺失其一(unit-procCore-writeValidate WV-008、WV-DUPID);
        //targets 之 id 重複已由上方 ckKey(rows, 'id') 拒收. 四表一併檢查(perm-run01 範圍二, perm-run05 確證 users 漏了此檢查). 缺 id 之列(API 直打, 視為新增)不參與; 錯誤鍵同 validateRowsBeforeWrite 之 idDuplicate: saveRowFieldDuplicate
        if (arrHas(keyTable, ['pemis', 'grups', 'users'])) {
            let kIdDup = findDupIndex(rows, 'id', (r) => isestr(get(r, 'id'))) //空字串 id 視為未給(待自動產號, validateRows 同), 不參與重複判定(外審 sol R6)
            if (kIdDup >= 0) {
                srLog.error({ event: 'updateTabItems-ckKey-error', keyTable, key: 'id', msg: 'saveRowFieldDuplicate', row: kIdDup, value: get(rows, [kIdDup, 'id']) })
                return Promise.reject('saveRowFieldDuplicate')
            }
        }

        return rows

        }

        //非 pickKeysOnly: 前處理在取鎖之前(純函式, 不讀庫)
        let rowsPre = null
        if (!isearr(pickKeysOnly)) {
            rowsPre = await prepRows(rows)
        }
        else {
            //pickKeysOnly(users 之 for:grups 模式): 送入列於鎖內與庫內列合併後才前處理(prepRows), 合併以 id 為鍵(mergePickKeysOnly 的 kpIn[id] = 列, 同 id 後者覆蓋前者)——
            //送入列內同一 id 出現兩次會被靜默併成一列而遺失其一, 故在合併之前(取鎖之前, 純函式)先以相同口徑拒收(有限數字 id 與同值字串 id 視為同一個, 同合併前之正規化; perm-run01 範圍二)
            let kIdDupIn = findDupIndex(map(rows, (r) => {
                let id = get(r, 'id')
                return (typeof id === 'number' && Number.isFinite(id)) ? { id: String(id) } : r
            }), 'id', (r) => isestr(get(r, 'id')))
            if (kIdDupIn >= 0) {
                srLog.error({ event: 'updateTabItems-ckKey-error', keyTable, key: 'id', msg: 'saveRowFieldDuplicate', row: kIdDupIn, value: get(rows, [kIdDupIn, 'id']) })
                return Promise.reject('saveRowFieldDuplicate')
            }
        }

        //雙擊防護(後端): 同一操作者之同表寫入處理中再送出即拒絕 'saveInProgress'(不排隊, 見 lockSave.mjs, ADR-025);
        //占位包在表鎖之外層, 不同操作者之並行寫入仍由表鎖序列化、各自成功(ADR-012)
        //表鎖＝w-serv-orm 實例之 guardWrite(withTabLocks): 取鎖 → 新鮮讀取 → 載入基準比對 → write 於**同一把表鎖內**(規格第 6、7 節; R-LOCK-CORE-01), 防 lost update 與唯一性檢查被交錯略過;
        //與外部同步(WWebPerm.syncAndReplaceTabs)共用同一個鎖管理器(外審 sol R10). 本表有改名或刪除而須改寫引用端時, 才於 write 內依階層再取引用端表之鎖(見下方「引用連帶」段, R-WRITE-LOCK-02)
        //refRows: 被引用表(grups／pemis／targets)於引用表鎖內之新鮮讀取(僅帶 subject／refs 時; 其餘為 null), 供 subject 事前驗證與 write 內之 refs 驗證共用——兩者與本表寫入在同一段持鎖期間, 其間被引用表不會被任何入口改動(R-LOCK-CORE-01)
        let refRows = null

        //withRefLock: 未帶 subject／refs 者同修正前(僅本表鎖); 帶了: 先取被引用表鎖(外層, 階層較低)、新鮮讀取、驗主體身分(先於基準比對, 使「主體已被取代」優先於泛稱之 saveStale), 再進本表之 guardWrite
        let withRefLock = (fn) => {
            if (refTarget === null) {
                return fn()
            }
            return withTabLocks(lockTabs, [refTarget.table], async () => {
                refRows = await woItems[refTarget.table].select()
                if (subject !== null) {
                    let si = checkSubjectIdentity({ subject, refRows })
                    if (si !== null) {
                        srLog.error({ event: 'updateTabItems-identity-error', keyTable, userId, msg: si.key, reason: si.reason, n: 1 })
                        return Promise.reject(si.key)
                    }
                }
                return await fn()
            })
        }

        return await lockSave(`updateTabItems:${keyTable}`, userId, () => withRefLock(() => guardWrite({
            tables: [keyTable],

            //新鮮讀取: 直讀 woItems(WServOrm 未開 useCache), 不經任何快取(規格第 12 節)
            read: () => woItems[keyTable].select(),

            //表級載入基準比對(R-PRINCIPLE-00 原則 7、使用者 2026-10-22 裁示原則 10「多人同時編輯以表雜湊比對, 先動先贏」; 規則帳本 R-BASELINE-01, ADR-037 Update(perm-run01)):
            //有基準者, 草稿載入時之整表須與目前庫內整表相同(任一列內容摘要不同、列被增刪、名次不同即過期), 否則整次拒收 saveStale、零寫入, 不部分變更、不上鎖; 摘要依寫入契約(排除 order 與伺服器專有欄, 名次入基準).
            //比對在 guardWrite 內、write 之前: 基準過期時下列各檢查之結果(撞名、新增列已存在、外部列守門…)皆以過期之畫面為前提, 應先回「請重新載入」而非誤導之其他訊息.
            //無基準者(舊客戶端、外部應用)不比對(undefined 才跳過; null 不傳到此): 後台列維持最後寫入者勝(ADR-013), 外部列之指派欄改動另於下方拒收(saveBaselineRequired)
            baseline: baseline === null ? undefined : baseline,
            contract: getContract(keyTable),

            write: async (ltdtOld) => {

        //rows: 非 pickKeysOnly 為取鎖前已前處理者; pickKeysOnly 於鎖內以新鮮讀取之庫內列為基底合併(避免與並行寫入 race)再前處理
        if (isearr(pickKeysOnly)) {
            //有限數字 id 先轉為字串形式再與庫內對應(外審 sol R7): mergePickKeysOnly 只認非空字串 id, 數字 id(如 1)對不上庫內之 '1' 而該列指派被靜默略過卻回成功(R-ORM-04 之同一正規化, 此處原晚於合併)
            rows = map(rows, (r) => {
                let id = get(r, 'id')
                return (typeof id === 'number' && Number.isFinite(id)) ? { ...r, id: String(id) } : r
            })
            rows = mergePickKeysOnly(ltdtOld, rows, keyDetect, pickKeysOnly)
            srLog.info({ event: 'updateTabItems-pickKeysOnly', keyTable, userId, pickKeysOnly })
            rows = await prepRows(rows)
        }
        else {
            rows = rowsPre
        }

        //外部列之 order 由外部擁有(R-EXT-OWN-01): 上方 order=k+1 重編不得改外部列之順序, 還原為庫內值(使其不因後台存檔而成為 diff)
        if (lockExternalRows) {
            rows = restoreExternalOrder(rows, ltdtOld)
        }

        //pemis／grups 名稱唯一(F-02, 規則帳本 R-NAME-UNIQ-02, ADR-034): 寫入後之名稱集合即送入之整表(含他 from 之外部同步列), 其中出現兩列(不同 id)同名且為「本次造成或觸及」者整次拒收於任何寫入之前;
        //庫內已有之歷史重複(僅外部同步可造成)原樣送回不算, 否則已有重複之庫將無法在後台修復. 比對為精確 ===(同 arrFinder). 放在 select 之後、saveNewRowExists 之前, 使撞名先於「新增列已存在」被回報(與修正前 ckKey 之次序相同)
        let isNameKeyTable = arrHas(keyTable, ['pemis', 'grups'])
        if (isNameKeyTable) {
            let kDup = findTouchedDup(rows, ltdtOld, 'name')
            if (kDup >= 0) {
                srLog.error({ event: 'updateTabItems-ckKey-error', keyTable, key: 'name', msg: 'nameDuplicate', row: kDup, value: get(rows, [kDup, 'name']) })
                return Promise.reject('nameDuplicate')
            }
        }

        //users 之 email／對應鍵(R-PRINCIPLE-00 適用表 h, 規則帳本 R-MAPKEY-03): 遭遇衝突就收嚴, 但只擋「本次造成或觸及」者, 歷史既有之空值／重複原樣送回不拒(否則已有歷史資料之庫無法在後台修復, 連群組指派 pickKeysOnly 也會失敗);
        //①全表 email 須為非空字串且不重複; ②mappingBy 為 email／name 時另對 isActive==='y' 之列檢查該欄位(含停用改啟用); 判準單一擁有者 keyCheck.checkUsersWrite(與外部同步 F-14 同口徑).
        //放在 select 之後、saveNewRowExists 之前(次序同 pemis／grups 之 findTouchedDup), 於任何破壞性寫入之前(本函式在 guardWrite 之表鎖內, R-WRITE-LOCK-01、R-LOCK-CORE-01); 被拒時資料表零變更.
        //srLog 只記錯誤鍵、原因、欄位與列索引, 不記 email／name 之值(個資; 修正前重複時記 value)
        if (keyTable === 'users') {
            let ck = checkUsersWrite(rows, ltdtOld, mappingBy)
            if (ck !== null) {
                srLog.error({ event: 'updateTabItems-ckKey-error', keyTable, key: ck.field, msg: ck.key, reason: ck.reason, row: ck.k })
                return Promise.reject(ck.key)
            }
        }

        //新增列已存在即拒絕 (ADR-025): 同一包重送且第 2 次於第 1 次完成後才處理時(占位已釋放), 第 1 次已建立之列會被當「修改」(diff),
        //以前端之佔位字覆寫伺服器於新增時填入之建立者 / 建立時間(procOrm save 只覆寫 userIdUpdate / timeUpdate); 故整包拒絕、不寫入
        if (size(idsNew) > 0) {
            let kpIdOld = Object.create(null) //無原型: 鍵為資料庫 id(使用者資料), 一般物件遇 id='__proto__' 時 kpIdOld['__proto__'] = true 被忽略而偵測不到已存在之列(規則帳本 R-KEY-01)
            each(ltdtOld, (v) => {
                kpIdOld[get(v, 'id', '')] = true
            })
            if (idsNew.some((id) => kpIdOld[id] === true)) {
                return Promise.reject('saveNewRowExists')
            }
        }

        let ltdtNew = rows
        let r = null
        if (isNameKeyTable || keyTable === 'users') { //users 亦拆出缺 id 之列(外審 sol R5): 同批兩列缺 id 時 ltdtmapping 皆補 id:'', ltdtDiffByKey 以 Map(id → 列) 使前列被後列覆蓋而只建立一列卻回成功
            //pemis／grups 一律以主鍵 id 對應(F-02 完整化, run04 主責補強, ADR-034 Update): 寫入後之名稱集合須等於送入之整表, findTouchedDup 對「送入整表」驗唯一才成立,
            //而以 name 為 diff 鍵時 ltdtDiffByKey 以 Map(name → 列) 對應, 下列單次存檔雖通過檢查卻使庫內與送入不同、留下同名兩列且仍回成功(D1 設計稿 §1.5 以真 procCore＋ORM 替身實測,
            //unit-procCore-nameUniq NU-021～024 守護): ①改名 A→A2 並以舊名 A 新增另一列(新 id)——改名靜默遺失; ②刪除 A 並以同名新增(新 id, F-02② 原案)——舊列未刪;
            //③鏈式改名 A→B 且 B→C——id-2 應為 C 卻停在 B; ④庫內已有同名列(歷史重複)時改名其中先出現之一列——新名稱之列走 add 而其 id 已存在, insert 對既有主鍵略過(NU-011 修前實測).
            //改以 id 對應後: 改名成為 diff 而非 del + add(建立者與建立時間沿用庫內, 同名之歷史重複各自獨立); 缺 id 之送入列(API 直打)無從對應既有列, 視為新增.
            let withId = ltdtNew.filter((v) => isestr(get(v, 'id')))
            let noId = ltdtNew.filter((v) => !isestr(get(v, 'id')))
            r = ltdtDiffByKey(ltdtOld, withId, 'id')
            r.add = [...r.add, ...noId]
        }
        else {
            r = ltdtDiffByKey(ltdtOld, ltdtNew, keyDetect)
        }
        // console.log('ltdtDiffByKey r', r)

        //外部列保護(F-23; R-PRINCIPLE-00 原則 3、5; 規則帳本 R-EXT-OWN-01, ADR-037): 於任何寫入之前(含引用端), 違規整次拒收、資料表零變更, 不靜默忽略;
        //(載入基準之表級比對 checkBaseline 已在上方 select 之後先行, run11: 基準過期時應先回「請重新載入」, 而非誤導之「外部列不可修改」, run07 U1 觀察 1)
        //①外部列僅伺服器管理欄不同者(外部同步重寫使其時間／建立者較新, 持舊快照送回)視為無變更, 免把建立者與建立時間回退為舊值(S2); 內容確有改動(指派欄)之外部列改帶庫內之伺服器管理欄寫入(restoreServerFields);
        //②from 型別與外部列守門(checkExternalWrite): 新增列 from 須為 ''、外部列不可刪／不可改 from 與身分結構欄, 指派欄可寫(草稿新鮮而仍違規者在此被拒);
        //③無基準而修改外部列之指派欄: 無從證明快照新舊, Lv1 放行之指派欄不得因舊快照還原外部已撤銷之授權(外審 B.2), 依原則 3 拒收(saveBaselineRequired); 後台列無基準維持舊行為(最後寫入者勝, ADR-013).
        //srLog 只記錯誤鍵、原因、筆數與來源名稱, 不記列 id／個資值
        //(perm-run01, 寫入契約 serverOnly: 伺服器專有欄位〔建立者／建立時間／更新者／更新時間〕存檔不採用客戶端值〔規格第 4、6 節; R-CONTRACT-01〕:
        //dropServerOnlyDiff／restoreServerFields 改為不分外部列或後台列、亦不論 lockExternalRows 一律套用〔all: true〕——僅伺服器專有欄不同之列視為無變更, 確有改動之列改帶庫內之專有欄位寫入, 客戶端持舊列〔或偽造〕不得回寫.)
        let keysTab = ds[keyTable].keys
        r = dropServerOnlyDiff({ keys: keysTab, r, ltdtOld, all: true })
        r = restoreServerFields({ r, ltdtOld, all: true }) //改動之列帶庫內之伺服器管理欄: 持舊草稿(保留未存編輯期間外部同步重寫了該列)不得把較新之建立者／建立時間回退(外審 sol 第 3 點)

        //引用身分(perm-run02 範圍一; R-REF-IDENTITY-01; perm-run03 範圍一起宣告強制必帶): 本次寫入之列(新增＋改動)相對庫內舊列新增或移除之啟用引用項, 其名稱對應之被引用實體須與選取當時同一身分(同 id), 且宣告須完整;
        //改變了引用卻未附宣告 → saveIdentityRequired; 被刪除、刪除後同名重建(id 不同)、同名新增實體皆整次拒收 saveRefChanged(零寫入): 不得把授權寫到(或移除到)同名新實體(原則 6). refRows 為被引用表鎖內之新鮮讀取(無宣告者未讀取, 為 null)
        if (refInfo !== null) {
            let ri = checkRefIdentity({ keyTable, decl: refDecl, subject, rowsNew: [...r.add, ...r.diff], rowsOld: ltdtOld, refRows })
            if (ri !== null) {
                srLog.error({ event: 'updateTabItems-identity-error', keyTable, userId, msg: ri.key, reason: ri.reason, n: ri.n })
                return Promise.reject(ri.key)
            }
        }
        let ex =checkExternalWrite({ keyTable, keys: keysTab, r, ltdtOld, lockExternalRows })
        if (ex !== null) {
            srLog.error({ event: 'updateTabItems-external-error', keyTable, userId, msg: ex.key, reason: ex.reason, n: ex.n, froms: ex.froms })
            return Promise.reject(ex.key)
        }
        if (baseline === null && lockExternalRows && hasExternalDiff({ r, ltdtOld })) {
            srLog.error({ event: 'updateTabItems-stale-error', keyTable, userId, msg: 'saveBaselineRequired', reason: 'externalAssignNoBaseline' })
            return Promise.reject('saveBaselineRequired')
        }

        //users 登入識別撞值(mappingBy 為 'id' 時; perm-run04, 規則帳本 R-MAPKEY-04, 規格 dspec/外部匯入之定義與機制.md 第 9 節末 O1): 外部列以 srcKey、後台列以 id 對應外部 token 之使用者 id;
        //perm-run05(主控 2026-10-24 收件裁示): 登入識別值須跨全表唯一——不論 isActive、含他來源外部列(登入查找不論有效與否計筆, 放行停用列之撞值, 其後轉有效即造成登入永久拒絕).
        //被本次觸及＝新增之列、或登入識別(類別〔後台／外部＋來源 from〕＋值〔loginIdOf: 後台列為 id、外部列為 srcKey〕)與庫內不同之列(外審 sol#2: lockExternalRows 為假時後台可改 from, 外部列改為後台列即換了登入識別而撞到他列;
        //外部列守門啟用時 from 與 srcKey 不可改, 由上方 checkExternalWrite 先拒——故本檢查置於外部列守門之後, perm-run03 既有之錯誤鍵〔saveExternalRowChanged 等〕不變, 被觸及者實務上只有後台列).
        //停用改啟用只是狀態改變, 登入識別不變, 不算被觸及(歷史撞值不因啟用而新擋; 登入時照拒). 只擋「本次造成或觸及」者(歷史既有撞值原樣送回不擋, 同 R-MAPKEY-03; 後台仍可修復).
        //缺 id 之列無從比對(ORM 補隨機主鍵). 於任何寫入之前(procOrm 在下方). srLog 不記 id／srcKey 之值
        if (keyTable === 'users' && mapKeyOf(mappingBy) === null) {
            //sigOf: 登入識別之「類別＋來源＋值」(後台列 a／外部列 x:來源; 外審 sol 第二輪#1: 外部列改為後台列而 srcKey 恰等於 id 時值不變、類別已變, 仍須視為被觸及; perm-run05: 來源改變亦同)
            let sigOf = (v) => `${isestr(v.from) ? `x:${v.from}` : 'a'}|${loginIdOf(v)}`
            let loginOld = new Map(ltdtOld.filter((v) => v !== null && typeof v === 'object' && isestr(v.id)).map((v) => [v.id, sigOf(v)]))
            let dClash = findLoginIdClashDetail(rows, (r) => !(isestr(r.id) && loginOld.has(r.id) && loginOld.get(r.id) === sigOf(r)))
            if (dClash !== null) {
                srLog.error({ event: 'updateTabItems-ckKey-error', keyTable, key: 'id', msg: 'loginIdCollision', reason: (dClash.kind === 'otherFrom') ? 'srcKeyOtherFrom' : ((dClash.kind === 'sameFrom') ? 'srcKeyClaimTwice' : 'adminIdIsSrcKey'), row: dClash.k })
                return Promise.reject('loginIdCollision')
            }
        }

        //寫入前驗證(規則帳本 R-ORM-01, ADR-026): 於第一個破壞步驟(del)之前擋下可預判之寫入失敗, 被拒時資料表零變更.
        //why: 寫入順序為 del → insert → save, 而 w-serv-orm 1.1.8 起對「會被 clearXSS 改寫之主鍵」整批拒絕、LMDB 對 > 1978 B 之主鍵整批拒絕,
        //修正前遇之即「舊列已刪、新列被拒」(改標的 id 時該列遺失, 2026-10-14 V3/V7 實測); 非主鍵欄位之標記則被靜默改寫(存值≠送入值).
        //只驗本次會寫入之 add + diff 列(任一字串欄位); 未變更之 same 列不寫入、只參與主鍵重複之判定(舊資料不阻擋儲存)
        let ve = validateRowsBeforeWrite([...r.add, ...r.diff], { rowsIdOnly: r.same })
        if (ve !== null) {
            let key = 'saveRowFieldInvalid'
            if (ve.reason === 'htmlMarkup') {
                key = 'htmlMarkupNotAllowed'
            }
            else if (ve.reason === 'idDuplicate') {
                key = 'saveRowFieldDuplicate'
            }
            srLog.error({ event: 'updateTabItems-validate-error', keyTable, msg: key, reason: ve.reason, row: ve.k, field: ve.field })
            return Promise.reject(key)
        }

        //writeMain
        //修改只改不增、刪除未命中回報(規格第 6 節; R-ONLYMOD-01): del／save 帶 opt { mustExist: true }(伺服端自組, 不轉傳客戶端之任何參數), 列已不存在(同鎖內新鮮讀取之後仍不在, 理論上不會發生)→ 'rowNotFound' 零寫入、不復活;
        //insert 為新增(主鍵已存在即略過之冪等新增, 不比對、不去重, 資料規則要求唯一者照其規則擋)
        let writeMain = async () => {

            //del
            if (size(r.del) > 0) {
                await procOrm(userId, keyTable, 'del', r.del, { mustExist: true }) //須使用procOrm才有辦法自動給予相關欄位
                // .catch((err) => {
                //     console.log('woItems[keyTable].del err', err)
                // })
            }

            //add
            if (size(r.add) > 0) {
                await procOrm(userId, keyTable, 'insert', r.add) //須使用procOrm才有辦法自動給予相關欄位
                // .catch((err) => {
                //     console.log('woItems[keyTable].insert err', err)
                // })
            }

            //diff
            if (size(r.diff) > 0) {
                await procOrm(userId, keyTable, 'save', r.diff, { mustExist: true }) //須使用procOrm才有辦法自動給予相關欄位
                // .catch((err) => {
                //     console.log('woItems[keyTable].save err', err)
                // })
            }

        }

        //readAfter: 存檔成功後於同一表鎖內(含引用端鎖)新鮮讀回該表全部列(opt.returnRows 時; 規格第 8 節), 前端立即以之更新畫面與基準; 寫入已生效, 讀回失敗不使存檔失敗(回 null, 前端退回等推播), 失敗入 srLog
        //holder 給了(引用連帶有改寫引用端表)時一併讀回引用端表(others[引用端表名])——該表亦被本次寫入改動, 前端同樣立即更新其基準, 免自己存檔後馬上去存引用端頁而被自己上一次之寫入誤擋
        let readAfter = async (holder = null) => {
            if (!returnRows) {
                return null
            }
            try {
                let rs = await woItems[keyTable].select()
                let out = { rows: sortBy(rs, 'order'), others: {} }
                if (holder !== null) {
                    let rh = await woItems[holder].select()
                    out.others[holder] = sortBy(rh, 'order')
                }
                return out
            }
            catch (err) {
                srLog.error({ event: 'updateTabItems-readBack-error', keyTable, userId, msg: 'getDataError', raw: rawOfErr(err, secrets) })
                return null
            }
        }

        //引用連帶(R-PRINCIPLE-00 原則 6、適用表 m／n, 規則帳本 R-REF-CASCADE-01, ADR-036): grups／pemis 改名(同 id 異名)與 grups／pemis／targets 刪除(舊 id 不在送入整表),
        //須於同一次寫入內連帶更新／清理引用它之授權字串(users.cgrups、grups.cpemis、pemis.crules). 是否須改寫引用端只依本表新舊列判定(diffRefTargets), 故於持有本表鎖之下即可決定是否再取引用端表之鎖;
        //取齊鎖之後才讀取引用端、規劃與預檢(新名撞懸空名、歷史同名組改名、容器內相撞、改寫後欄位驗證), 預檢與寫入涵蓋同一版本(外審 A.3), 被拒時資料表零變更.
        //寫入為引用端先、主體後, 失敗時補償還原引用端(cascadeWrite.mjs)
        //未帶 id 之列(API 直打; 寫入時 ORM 補隨機主鍵, 即舊列刪、新列增)改依名稱對應既有列, 同名即同一實體而不清空引用(fillIdlessIds)
        let rowsPlan = arrHas(keyTable, ['targets', 'pemis', 'grups']) ? fillIdlessIds(keyTable, ltdtOld, ltdtNew) : ltdtNew
        let kind = arrHas(keyTable, ['targets', 'pemis', 'grups']) ? diffRefTargets({ keyTable, rowsOld: ltdtOld, rowsNew: rowsPlan, opt: { cascadeRename } }) : null
        if (kind !== null && (kind.renames.length > 0 || kind.delNames.length > 0)) {
            let holder = REF_OF[keyTable].holder
            return await withTabLocks(lockTabs, [holder], async () => {
                let holdersOld = await woItems[holder].select()
                let plan = planRefChanges({ keyTable, rowsOld: ltdtOld, rowsNew: rowsPlan, holdersOld, opt: { cascadeRename } })
                let errPlan = plan.err !== null ? plan.err : checkCascadePlan(plan)
                if (errPlan !== null) {
                    srLog.error({ event: 'updateTabItems-refCascade-error', keyTable, msg: errPlan })
                    return Promise.reject(errPlan)
                }
                await writeWithCascade({ plan, holdersOld, woItems, procOrm, userId, srLog, writeMain, secrets })
                return await readAfter(plan.changes.length > 0 ? holder : null)
            }, [keyTable])
        }

        await writeMain()

        return await readAfter()

            },
        }).catch(mapGuardErr(keyTable, userId))))
    }


    //errLog: 失敗統一記 err key 並回傳對外之 key(規則帳本 R-ORM-02).
    //拒絕值來源: updateTabItems 自身之 reject 為本套件語系鍵字串(saveRowFieldInvalid、htmlMarkupNotAllowed、saveInProgress 等), 原樣轉出;
    //procOrm 之拒絕為 w-serv-orm 之英文原文字串(1.1.10 起, 如 failed to save data…)或 Error, updateTabItems 內直接呼叫之 woItems[keyTable].select()
    //失敗為 ORM 之原錯誤(可能為 Error)——此兩類原文只入 srLog 之 raw, 對前端與外部改回 saveWriteFail(修正前原樣外送, 前端 tErr 換算為「無法連線至伺服器」)
    //raw 入 srLog 前經 rawOfErr 移除連線憑證(R-ORM-DIAG-02); 是否為語系鍵(固定詞彙)以未遮罩之原文判定, msg(key)不經遮罩
    let errLog = (event, userId, err) => {
        let key = toOutKey(err)
        srLog.error({ event, userId, msg: key, ...(msgOfErr(err) !== key ? { raw: rawOfErr(err, secrets) } : {}) })
        return key
    }


    //outOf: 成功回傳. 預設為成功 msg key 字串(既有呼叫端不變); 客戶端帶 returnRows:true 且讀回成功時改回 { msg, rows }(rows＝寫入後該表全部列, 鎖內新鮮讀取; 規格第 8 節)
    //  others: 引用連帶有改寫引用端表時, 引用端表之寫入後全部列(鍵為表名); 無則為空物件
    let outOf = (after, opt) => {
        return (get(opt, 'returnRows', false) === true && after !== null && typeof after === 'object' && Array.isArray(after.rows)) ? { msg: 'saveTabItemsSuccess', rows: after.rows, others: after.others } : 'saveTabItemsSuccess'
    }


    //updateTargets
    let updateTargets = async (userId, rows, opt = {}) => {
        let rowsAfter = null
        let optc = pickClientOpt(opt)
        try {
            rowsAfter = await updateTabItems('targets', userId, rows, 'id', optc)
        }
        catch (err) { throw errLog('updateTargets-error', userId, err) }
        srLog.info({ event: 'updateTargets-success', userId })
        return outOf(rowsAfter, optc) //成功 msg key
    }


    //updatePemis
    let updatePemis = async (userId, rows, opt = {}) => {
        let rowsAfter = null
        let optc = pickClientOpt(opt)
        try {
            rowsAfter = await updateTabItems('pemis', userId, rows, 'name', optc)
        }
        catch (err) { throw errLog('updatePemis-error', userId, err) }
        srLog.info({ event: 'updatePemis-success', userId })
        return outOf(rowsAfter, optc) //成功 msg key
    }


    //updateGrups
    let updateGrups = async (userId, rows, opt = {}) => {
        let rowsAfter = null
        let optc = pickClientOpt(opt)
        try {
            rowsAfter = await updateTabItems('grups', userId, rows, 'name', optc)
        }
        catch (err) { throw errLog('updateGrups-error', userId, err) }
        srLog.info({ event: 'updateGrups-success', userId })
        return outOf(rowsAfter, optc) //成功 msg key
    }


    //updateUsers, opt.pickKeysOnly 給 ['cgrups'] 時僅採納既有使用者之群組指派變更(modeEditUsers='for:grups'; 伺服端設定, WWebPerm 組入, 不接受用戶端給);
    //opt.baseline／opt.returnRows 為用戶端給(其餘 opt 鍵不採納, 見 pickClientOpt 與 WWebPerm 之 kpFunExt)
    let updateUsers = async (userId, rows, opt = {}) => {
        let rowsAfter = null
        try {
            rowsAfter = await updateTabItems('users', userId, rows, 'id', opt)
        }
        catch (err) { throw errLog('updateUsers-error', userId, err) }
        srLog.info({ event: 'updateUsers-success', userId })
        return outOf(rowsAfter, opt) //成功 msg key
    }


    let p = {
        updateTargets,
        updatePemis,
        updateGrups,
        updateUsers,
    }


    return p
}


//toOutKey: 拒絕值為本套件語系鍵(procLang 之鍵集合)者原樣回傳, 其餘(ORM／I/O 原文、Error)回 keyFail(規則帳本 R-ORM-02)
let kpLangKey = null
function toOutKey(err, keyFail = 'saveWriteFail') {
    if (kpLangKey === null) {
        kpLangKey = new Set(Object.keys(procLang({}).eng))
    }
    return (typeof err === 'string' && kpLangKey.has(err)) ? err : keyFail
}


export { mergePickKeysOnly, toOutKey, isRowObj, pickClientOpt }


export default proc
