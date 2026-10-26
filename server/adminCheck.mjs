/**
 * 是否為系統管理者: perm users 表之列 isActive 為 'y' 且 isAdmin 為 'y'(自有屬性、嚴格相等, 其餘值一律視為否)
 *
 * 判準單一擁有者(R-ADMIN-ONLY-01): 資料通道連線閘(checkToken)、資料通道執行身分(getUserIdByToken)、後台登入檢查(/api/getUserByToken)與寫入函數之角色檢查(requireAdmin)都只呼叫本函數.
 * perm 以自身 users 表為權威, 不採外部 token(getUserByToken)宣稱之 isAdmin; 呼叫端須傳入 perm users 表之列(getTokenUser 反查所得, 或 requireAdmin 新鮮讀取之列), 不得傳 token 使用者物件.
 * 只認自有屬性: 原型鏈上繼承而來之 isAdmin／isActive 不算(防禦性, 資料庫列恆為自有屬性).
 *
 * @param {*} row 輸入 perm users 表之列(任何值)
 * @returns {Boolean} 回傳是否為有效之系統管理者
 */
function isAdminRow(row) {
    if (row === null || typeof row !== 'object' || Array.isArray(row)) {
        return false
    }
    let has = (k) => Object.prototype.hasOwnProperty.call(row, k)
    return has('isActive') && has('isAdmin') && row.isActive === 'y' && row.isAdmin === 'y'
}


/**
 * 系統服務用途之外部 id 前綴: 上游(w-web-sso)對系統服務用途(應用系統金鑰本身, 不綁使用者)反查回 id 恆為 'app:<金鑰主鍵>', 且 sso 拒收以此前綴開頭之使用者主鍵(保留前綴),
 * 故以此前綴開頭之 id 不可能是一般使用者(perm-run02②; 使用者用途綁定之 sso 管理員其 id 是該使用者之主鍵, 不以此前綴開頭).
 * 判準單一擁有者: 此前綴只在本檔定義與比對.
 */
const SYSTEM_APP_ID_PREFIX = 'app:'


/**
 * 外部反查結果是否為「應用系統 token・系統服務用途」之身分(R-APP-TOKEN-01; dspec/使用者身分驗證原則.md 二之一第 3 點)
 *
 * 判準單一擁有者: 部署方之 getUserByToken 回傳之外部使用者物件, 須同時: id 為以 'app:' 開頭之字串(SYSTEM_APP_ID_PREFIX)、isApp 為 'y'、isAdmin 為 'y'(自有屬性、嚴格相等, 其餘值一律視為否; 前綴比對區分大小寫、不 trim).
 * 本函數只回答「外部宣稱」之形狀, 不是授權: 呼叫端另須確認該身分不在 perm users 表(任何 isActive 之列皆算在表中, 在表者以該列為準, 見 keyCheck.countLoginRows),
 * 且仍須經部署方 verifyAppUser.
 * 用於後台登入檢查、資料通道與 requireAdmin(系統服務用途); 應用系統路由(getPermUserInfor、syncAndReplaceTabs)不用本判準, 對不在表者改用較寬之 isExtAdminUser(相容).
 * 使用者用途之應用系統 token(以 userId 綁定使用者)其反查回所綁使用者之實際資料(isApp 為 'y'、isAdmin 依該使用者、id 為該使用者之主鍵而非 'app:' 開頭): 所綁使用者在 perm users 表者以 perm 列判定;
 * 不在表者(如只存在於 sso 之管理員)不是系統服務用途, 於後台與資料通道被拒, 與其自身使用者 token 相同.
 *
 * @param {*} user 輸入部署方 getUserByToken 回傳之外部使用者物件(任何值)
 * @returns {Boolean} 回傳是否為系統服務用途之應用系統身分(外部宣稱)
 */
function isSystemAppUser(user) {
    if (user === null || typeof user !== 'object' || Array.isArray(user)) {
        return false
    }
    let has = (k) => Object.prototype.hasOwnProperty.call(user, k)
    return has('id') && typeof user.id === 'string' && user.id.startsWith(SYSTEM_APP_ID_PREFIX) && has('isApp') && user.isApp === 'y' && has('isAdmin') && user.isAdmin === 'y'
}


/**
 * 外部反查結果是否宣稱為管理員(僅供應用系統路由對「不在 perm users 表」之呼叫者做相容認定; perm-run02①, 原則二.8 改版預設相容)
 *
 * 判準單一擁有者: 只看自有屬性 isAdmin 是否嚴格等於 'y'; 不要求 isApp(舊版 sso 之應用系統身分即 isAdmin='y', 未轉傳 isApp 之既有部署升版後不中斷)、不要求 'app:' 前綴, 等級判準本身也不檢查 id 形狀
 * (id 是否為非空字串: /syncAndReplaceTabs 另要求才可作稽核欄; /api/getPermUserInfor 不使用呼叫者 id, 維持 1.1.15 行為, 契約上 getUserByToken 本就須提供 id).
 * 只用於 /api/getPermUserInfor、/syncAndReplaceTabs 且呼叫者不在 perm users 表時; 在表者一律以 perm 列(isAdminRow)為準; 後台登入檢查、資料通道、requireAdmin 不得使用本函數(那些入口用 isSystemAppUser 之嚴格認定).
 * 部署方 verifyAppUser 照舊套用(只能再收緊).
 *
 * @param {*} user 輸入部署方 getUserByToken 回傳之外部使用者物件(任何值)
 * @returns {Boolean} 回傳外部反查結果是否宣稱 isAdmin 為 'y'
 */
function isExtAdminUser(user) {
    if (user === null || typeof user !== 'object' || Array.isArray(user)) {
        return false
    }
    return Object.prototype.hasOwnProperty.call(user, 'isAdmin') && user.isAdmin === 'y'
}


export { isAdminRow, isSystemAppUser, isExtAdminUser }
export default isAdminRow
