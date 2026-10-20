//授權與資料歸屬之查值: 供權限評估(src/plugins/mShare.mjs)、外部應用 SDK(src/perm.mjs)、後台整表寫入(server/procCore.mjs)與編輯對話框(VeCgrups／VeCpemis／VeCrules)共用
//規則見 CLAUDE_rulebook.md「迭代使用端傳入之物件」之 R-AUTH-PATH-01
//本檔無外部相依


/**
 * 取物件之自有屬性值, 不解析路徑、不取繼承屬性(lodash get 會把含 . 或 [ 之字串鍵解析為路徑, 並可取到繼承屬性)
 *
 * 鍵為使用端資料(標的 id、群組／權限／規則名稱、列 id)時一律用本函數: 只授權 A 時, lodash get(kp, 'A.0') 經字串索引得 'y'、'A.length' 得 1、
 * 'toString' 得繼承函數; 本函數對這些鍵回預設值. 自有屬性存在時回其值(含 0、''、null、false、undefined), 精確鍵(整串即鍵名, 如 'A.0')照常.
 * 輸入非物件(null、undefined、字串、數字、布林)一律回預設值.
 *
 * @param {Object} o 輸入物件(可為一般物件或無原型物件)
 * @param {String|Number} k 輸入鍵(整串視為鍵名)
 * @param {*} [def] 輸入無自有屬性時回傳之預設值, 預設undefined
 * @returns {*} 回傳自有屬性值或預設值
 * @example
 *
 * let kp = { A: 'y', 'B.0': 'y' }
 * console.log(getOwn(kp, 'A', 'n'))
 * // => 'y'
 * console.log(getOwn(kp, 'A.0', 'n'))
 * // => 'n'
 * console.log(getOwn(kp, 'B.0', 'n'))
 * // => 'y'
 * console.log(getOwn(kp, 'toString', 'n'))
 * // => 'n'
 *
 */
function getOwn(o, k, def) {
    if (o !== null && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k)) {
        return o[k]
    }
    return def
}


export default getOwn
