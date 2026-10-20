import get from 'lodash-es/get.js'
import isestr from 'wsemi/src/isestr.mjs'
import clearXSS from 'wsemi/src/clearXSS.mjs'
import eachOwn from '../src/js/eachOwn.mjs'


//LMDB 之主鍵上限(lmdb 之 DEFAULT_MAX_KEY_SIZE): 主鍵 UTF-8 位元組數 1978 可寫, 1979 即被 ORM 整批拒絕(2026-10-14 實測)
let maxIdBytes = 1978


//純量: 字串、數字、布林、null、undefined(欄位未給)
let isScalar = (x) => x === null || x === undefined || typeof x === 'string' || typeof x === 'number' || typeof x === 'boolean'


/**
 * 寫入前驗證可預判之 ORM 寫入失敗(ADR-026, 規則帳本 R-ORM-01)
 *
 * 寫入路徑皆「先破壞後寫入」(整表儲存為 del → insert → save, 外部同步為 delAll → insert), 而 ORM(w-serv-orm 1.1.8 起)對下列輸入整批拒絕,
 * 於第一個破壞步驟之後才被拒會造成部分寫入或資料遺失, 故須於任何寫入之前判定:
 * 1. 主鍵 id 有給時須為非空字串或有限數字(NaN、±Infinity 視為未給, 同 w-serv-orm 1.1.11 之補值), 字串之 UTF-8 位元組數不得超過 1978(LMDB 鍵長上限),
 *    且批內不得重複(以 String(id) 比對: w-serv-orm 1.1.11 起數字主鍵存為其字串形式, 數字與其字串形式為同一主鍵).
 * 2. 任一字串欄位之值會被 wsemi 之 clearXSS 改寫者(含 HTML 標記, 如「<」後接英文字母)即拒絕——與 w-serv-orm 寫入前之 adjustData 同一函數,
 *    主鍵被改寫時 ORM 拒絕整批, 其他欄位則會被靜默改寫(存值與送入值不同), 兩者皆於此擋下, 使送入值即儲存值.
 * 3. 任一欄位之值須為純量(字串、數字、布林、null、undefined)——物件、陣列、函數、symbol、bigint 一律拒絕(規則帳本 R-FIELD-SCALAR-01):
 *    四表 schema 欄位型別只有 STRING／INTEGER／TEXT(cgrups／cpemis／crules 為 TEXT 存 JSON 字串), 無合法物件型欄位; 修正前預檢只看 isestr(vv),
 *    巢狀字串(如 { description: { value: '<標記>' } })避過預檢而於寫入時被 w-serv-orm 靜默改寫(非拒絕), 「送入值即儲存值」不成立.
 * 本函數為純函數: 不修改輸入、不呼叫 ORM; 主鍵是否必填由呼叫端以 opt.idRequired 指定(未給主鍵之列由 ORM 自動補主鍵者可不要求).
 * 列物件之欄位一律依自有可列舉字串鍵逐一檢查(規則帳本 R-OBJ-ITER-01): 名為 length 之欄位與其他欄位同為一般欄位, 即使其值為非負整數(0、1、2**32-1)亦然——
 * lodash each 對這類物件會改走索引 0..length-1 而略過全部字串欄位, 且迭代次數即 length 之值; rows 與 rowsIdOnly 須為真陣列(Array.isArray),
 * 以 Symbol.toStringTag 偽稱 Array 之物件不是陣列(rows → rowsInvalid、rowsIdOnly → 視為未給), 不依其 length 迭代.
 *
 * @param {Array} rows 輸入待寫入之列陣列, 各列為物件; 非真陣列回傳 { reason: 'rowsInvalid', k: -1, field: '' }
 * @param {Object} [opt={}] 輸入設定物件
 * @param {Boolean} [opt.idRequired=false] 輸入主鍵是否必填, 預設false
 * @param {Array} [opt.rowsIdOnly=[]] 輸入只參與主鍵檢查(重複、長度)而不檢查欄位標記之列陣列(如整表儲存中不會被寫入之既有列), 非真陣列視為未給, 預設[]
 * @returns {Object|null} 回傳第一個違規 { reason, k, field }, reason 為 'rowsInvalid'、'idInvalid'、'idTooLong'、'idDuplicate'、'fieldNotScalar'、'htmlMarkup' 之一, k 為該列於 rows 之位置(rowsIdOnly 之列為 -1), field 為欄位名; 皆通過回傳 null
 */
function validateRowsBeforeWrite(rows, opt = {}) {

    //check
    if (!Array.isArray(rows)) {
        return { reason: 'rowsInvalid', k: -1, field: '' }
    }

    //idRequired
    let idRequired = get(opt, 'idRequired', false) === true

    //rowsIdOnly
    let rowsIdOnly = get(opt, 'rowsIdOnly', [])
    if (!Array.isArray(rowsIdOnly)) {
        rowsIdOnly = []
    }

    //kpId, 無原型之查表容器: 主鍵為使用者資料, 一般物件之原型鍵(constructor、toString、__proto__)會被誤判為已存在(規則帳本 R-KEY-01)
    let kpId = Object.create(null)
    let checkId = (v, k) => {
        let id = get(v, 'id')
        //有給: 非空字串或有限數字; undefined、null、''、NaN、±Infinity 視為未給(w-serv-orm 1.1.11 對之補值, 2026-10-14 run05); 其他型別(布林、物件)為無效
        let isNumId = typeof id === 'number'
        let hasId = !(id === undefined || id === null || id === '' || (isNumId && !Number.isFinite(id)))
        if (!hasId) {
            return idRequired ? { reason: 'idInvalid', k, field: 'id' } : null
        }
        if (!isestr(id) && !isNumId) {
            return { reason: 'idInvalid', k, field: 'id' }
        }
        let sid = String(id)
        if (isestr(id) && Buffer.byteLength(id, 'utf8') > maxIdBytes) {
            return { reason: 'idTooLong', k, field: 'id' }
        }
        if (kpId[sid] === true) {
            return { reason: 'idDuplicate', k, field: 'id' }
        }
        kpId[sid] = true
        return null
    }

    //主鍵: 待寫入之列與只參與主鍵檢查之列
    let err = null
    eachOwn(rows, (v, k) => {
        err = checkId(v, k)
        if (err !== null) {
            return false //跳出
        }
    })
    if (err !== null) {
        return err
    }
    eachOwn(rowsIdOnly, (v) => {
        err = checkId(v, -1)
        if (err !== null) {
            return false //跳出
        }
    })
    if (err !== null) {
        return err
    }

    //欄位型別與標記: 只檢查待寫入之列, 列物件依自有可列舉字串鍵走訪(length 為一般欄位, 見檔頭 JSDoc)
    eachOwn(rows, (v, k) => {
        if (v === null || typeof v !== 'object' || Array.isArray(v)) { //列須為物件(不用依 toString 判型之 iseobj: 可被 Symbol.toStringTag 偽稱為 Array 而略過全部欄位)
            return true //跳出換下一個
        }
        eachOwn(v, (vv, kk) => {
            if (!isScalar(vv)) { //非純量(物件、陣列、函數、symbol、bigint): schema 欄位型別只有 STRING／INTEGER／TEXT, 無合法物件型欄位(規則帳本 R-FIELD-SCALAR-01)
                err = { reason: 'fieldNotScalar', k, field: kk }
                return false //跳出
            }
            if (isestr(vv) && clearXSS(vv) !== vv) {
                err = { reason: 'htmlMarkup', k, field: kk }
                return false //跳出
            }
        })
        if (err !== null) {
            return false //跳出
        }
    })

    return err
}


export { maxIdBytes }
export default validateRowsBeforeWrite
