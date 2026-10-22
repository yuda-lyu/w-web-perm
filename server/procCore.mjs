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
import { restoreExternalOrder, dropServerOnlyDiff, checkExternalWrite, hasExternalDiff } from '../src/js/externalRows.mjs'
import { isBaselineValid, checkBaseline } from '../src/js/rowDigest.mjs'
import { findTouchedDup, findDupIndex, withTabLocks, checkUsersWrite } from './keyCheck.mjs'
import { checkCascadePlan, writeWithCascade } from './cascadeWrite.mjs'


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


//mappingBy: 使用者對應鍵('id'｜'email'｜'name', WWebPerm 已正規化; 未給或其他值視同 'id'), 供 users 整表寫入的對應鍵檢查(R-PRINCIPLE-00 適用表 h, R-MAPKEY-03)
//cascadeRename: 群組／權限改名時是否連帶更新引用(預設 true; 只管改名, 刪除連帶清理不受影響, R-REF-CASCADE-01)
//lockExternalRows: 後台是否不得改外部列(from 為非空字串者)之身分／結構欄(預設 true, R-EXT-OWN-01; 'n' 時回到舊行為, 僅保留 from 型別檢查)
function proc(woItems, procOrm, { srLog, kmx, lockSave, mappingBy = 'id', cascadeRename = true, lockExternalRows = true }) {


    //pickClientOpt: 用戶端(kpFunExt 第 3 參)只採納 baseline, 不接受 pickKeysOnly 等伺服端設定; 未給(undefined／null)視為舊客戶端
    let pickClientOpt = (opt) => {
        let b = (opt !== null && typeof opt === 'object') ? opt.baseline : undefined
        return (b === undefined || b === null) ? {} : { baseline: b }
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

        //baseline: 草稿所依據之載入基準 [[id, digest], ...](F-26, R-BASELINE-01; 前端於開啟編輯時綁定); 未給(舊客戶端)為 null; 給了但格式不合視為無效請求, 於任何讀寫之前拒絕
        let baseline = get(opt, 'baseline', null)
        if (baseline !== null && !isBaselineValid(baseline)) {
            srLog.error({ event: 'updateTabItems-validate-error', keyTable, msg: 'saveRowFieldInvalid', reason: 'baselineInvalid', row: -1, field: '' })
            return Promise.reject('saveRowFieldInvalid')
        }

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

        //雙擊防護(後端): 同一操作者之同表寫入處理中再送出即拒絕 'saveInProgress'(不排隊, 見 lockSave.mjs, ADR-025);
        //占位包在 kmx 之外層, 不同操作者之並行寫入仍由 kmx 序列化、各自成功(ADR-012)
        //序列化同表之並行整表批次寫入: 防 lost update (同 keyTable 序列化, 不同表並行)
        //持鎖: 先取本表之鎖; 本表有改名或刪除而須改寫引用端時, 才於內層依階層再取引用端表之鎖(見下方「引用連帶」段). 皆經單一取鎖函數(R-WRITE-LOCK-02); 與外部同步(WWebPerm.syncAndReplaceTabs)共用同表互斥鍵(外審 sol R10)
        return await lockSave(`updateTabItems:${keyTable}`, userId, () => withTabLocks(kmx, [keyTable], async () => {

        //pickKeysOnly, 須於 mutex 內讀取資料庫為基底, 避免與並行寫入 race
        if (isearr(pickKeysOnly)) {
            //有限數字 id 先轉為字串形式再與庫內對應(外審 sol R7): mergePickKeysOnly 只認非空字串 id, 數字 id(如 1)對不上庫內之 '1' 而該列指派被靜默略過卻回成功(R-ORM-04 之同一正規化, 此處原晚於合併)
            rows = map(rows, (r) => {
                let id = get(r, 'id')
                return (typeof id === 'number' && Number.isFinite(id)) ? { ...r, id: String(id) } : r
            })
            let ltdtDb = await woItems[keyTable].select()
            rows = mergePickKeysOnly(ltdtDb, rows, keyDetect, pickKeysOnly)
            srLog.info({ event: 'updateTabItems-pickKeysOnly', keyTable, userId, pickKeysOnly })
        }

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

        //pemis／grups 以 id 對應既有列(見下方 isNameKeyTable 分支), 送入之整表內主鍵 id(字串)不得重複, 否則 Map(id → 列) 靜默併成一列而遺失其一(unit-procCore-writeValidate WV-008);
        //缺 id 之列(API 直打, 視為新增)不參與; 錯誤鍵同 validateRowsBeforeWrite 之 idDuplicate: saveRowFieldDuplicate
        if (arrHas(keyTable, ['pemis', 'grups'])) {
            let kIdDup = findDupIndex(rows, 'id', (r) => isestr(get(r, 'id'))) //空字串 id 視為未給(待自動產號, validateRows 同), 不參與重複判定(外審 sol R6)
            if (kIdDup >= 0) {
                srLog.error({ event: 'updateTabItems-ckKey-error', keyTable, key: 'id', msg: 'saveRowFieldDuplicate', row: kIdDup, value: get(rows, [kIdDup, 'id']) })
                return Promise.reject('saveRowFieldDuplicate')
            }
        }

        //ltdtDiffByKey
        let ltdtOld = await woItems[keyTable].select()

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
        //放在 select 之後、saveNewRowExists 之前(次序同 pemis／grups 之 findTouchedDup), 於任何破壞性寫入之前(本函式在 kmx(tabWriteKey) 內, R-WRITE-LOCK-01); 被拒時資料表零變更.
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

        //外部列保護與載入基準(F-23／F-26; R-PRINCIPLE-00 原則 3、5; 規則帳本 R-EXT-OWN-01、R-BASELINE-01, ADR-037): 於任何寫入之前(含引用端), 違規整次拒收、資料表零變更, 不靜默忽略;
        //①外部列僅伺服器管理欄不同者(外部同步重寫使其時間／建立者較新, 持舊快照送回)視為無變更, 免把建立者與建立時間回退為舊值(S2);
        //②有基準者先逐列比對庫內版本(checkBaseline: 本次將寫入之列須與草稿所依據者相同, 否則 saveStale 提示重新載入): 先於外部列守門——草稿已過期時(外部同步在開啟後改了外部列或移除之,
        //使送入之外部列與庫內不同)應回「資料已更新, 請重新載入」, 而不是誤導之「外部列不可修改」(run07 U1 觀察 1);
        //③from 型別與外部列守門(checkExternalWrite): 新增列 from 須為 ''、外部列不可刪／不可改 from 與身分結構欄, 指派欄可寫(草稿新鮮而仍違規者在此被拒);
        //④無基準而修改外部列之指派欄: 無從證明快照新舊, Lv1 放行之指派欄不得因舊快照還原外部已撤銷之授權(外審 B.2), 依原則 3 拒收(saveBaselineRequired); 後台列無基準維持舊行為(最後寫入者勝, ADR-013).
        //srLog 只記錯誤鍵、原因、筆數與來源名稱, 不記列 id／個資值
        let keysTab = ds[keyTable].keys
        if (lockExternalRows) {
            r = dropServerOnlyDiff({ keys: keysTab, r, ltdtOld })
        }
        if (baseline !== null) {
            let ck = checkBaseline({ keys: keysTab, r, ltdtOld, baseline })
            if (ck !== null) {
                srLog.error({ event: 'updateTabItems-stale-error', keyTable, userId, msg: ck.key, reason: ck.reason, n: ck.n })
                return Promise.reject(ck.key)
            }
        }
        let ex = checkExternalWrite({ keyTable, keys: keysTab, r, ltdtOld, lockExternalRows })
        if (ex !== null) {
            srLog.error({ event: 'updateTabItems-external-error', keyTable, userId, msg: ex.key, reason: ex.reason, n: ex.n, froms: ex.froms })
            return Promise.reject(ex.key)
        }
        if (baseline === null && lockExternalRows && hasExternalDiff({ r, ltdtOld })) {
            srLog.error({ event: 'updateTabItems-stale-error', keyTable, userId, msg: 'saveBaselineRequired', reason: 'externalAssignNoBaseline' })
            return Promise.reject('saveBaselineRequired')
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
        let writeMain = async () => {

            //del
            if (size(r.del) > 0) {
                await procOrm(userId, keyTable, 'del', r.del) //須使用procOrm才有辦法自動給予相關欄位
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
                await procOrm(userId, keyTable, 'save', r.diff) //須使用procOrm才有辦法自動給予相關欄位
                // .catch((err) => {
                //     console.log('woItems[keyTable].save err', err)
                // })
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
            return await withTabLocks(kmx, [holder], async () => {
                let holdersOld = await woItems[holder].select()
                let plan = planRefChanges({ keyTable, rowsOld: ltdtOld, rowsNew: rowsPlan, holdersOld, opt: { cascadeRename } })
                let errPlan = plan.err !== null ? plan.err : checkCascadePlan(plan)
                if (errPlan !== null) {
                    srLog.error({ event: 'updateTabItems-refCascade-error', keyTable, msg: errPlan })
                    return Promise.reject(errPlan)
                }
                await writeWithCascade({ plan, holdersOld, woItems, procOrm, userId, srLog, writeMain })
                return ltdtNew
            }, [keyTable])
        }

        await writeMain()

        return ltdtNew

        }))
    }


    //errLog: 失敗統一記 err key 並回傳對外之 key(規則帳本 R-ORM-02).
    //拒絕值來源: updateTabItems 自身之 reject 為本套件語系鍵字串(saveRowFieldInvalid、htmlMarkupNotAllowed、saveInProgress 等), 原樣轉出;
    //procOrm 之拒絕為 w-serv-orm 之英文原文字串(1.1.10 起, 如 failed to save data…)或 Error, updateTabItems 內直接呼叫之 woItems[keyTable].select()
    //失敗為 ORM 之原錯誤(可能為 Error)——此兩類原文只入 srLog 之 raw, 對前端與外部改回 saveWriteFail(修正前原樣外送, 前端 tErr 換算為「無法連線至伺服器」)
    let errLog = (event, userId, err) => {
        let key = toOutKey(err)
        let raw = (typeof err === 'string') ? err : ((err && err.message) || String(err))
        srLog.error({ event, userId, msg: key, ...(raw !== key ? { raw } : {}) })
        return key
    }


    //updateTargets
    let updateTargets = async (userId, rows, opt = {}) => {
        try {
            await updateTabItems('targets', userId, rows, 'id', pickClientOpt(opt))
        }
        catch (err) { throw errLog('updateTargets-error', userId, err) }
        srLog.info({ event: 'updateTargets-success', userId })
        return 'saveTabItemsSuccess' //成功 msg key
    }


    //updatePemis
    let updatePemis = async (userId, rows, opt = {}) => {
        try {
            await updateTabItems('pemis', userId, rows, 'name', pickClientOpt(opt))
        }
        catch (err) { throw errLog('updatePemis-error', userId, err) }
        srLog.info({ event: 'updatePemis-success', userId })
        return 'saveTabItemsSuccess' //成功 msg key
    }


    //updateGrups
    let updateGrups = async (userId, rows, opt = {}) => {
        try {
            await updateTabItems('grups', userId, rows, 'name', pickClientOpt(opt))
        }
        catch (err) { throw errLog('updateGrups-error', userId, err) }
        srLog.info({ event: 'updateGrups-success', userId })
        return 'saveTabItemsSuccess' //成功 msg key
    }


    //updateUsers, opt.pickKeysOnly 給 ['cgrups'] 時僅採納既有使用者之群組指派變更(modeEditUsers='for:grups'; 伺服端設定, WWebPerm 組入, 不接受用戶端給);
    //opt.baseline 為草稿載入基準(用戶端給, 其餘 opt 鍵不採納, 見 pickClientOpt 與 WWebPerm 之 kpFunExt)
    let updateUsers = async (userId, rows, opt = {}) => {
        try {
            await updateTabItems('users', userId, rows, 'id', opt)
        }
        catch (err) { throw errLog('updateUsers-error', userId, err) }
        srLog.info({ event: 'updateUsers-success', userId })
        return 'saveTabItemsSuccess' //成功 msg key
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


export { mergePickKeysOnly, toOutKey, isRowObj }


export default proc
