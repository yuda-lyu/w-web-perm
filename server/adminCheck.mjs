/**
 * 是否為系統管理員: perm users 表之列 isActive 為 'y' 且 isAdmin 為 'y'(自有屬性、嚴格相等, 其餘值一律視為否)
 *
 * 判準單一擁有者(R-ADMIN-ONLY-01): 資料通道連線閘(checkToken)、資料通道執行身分(getUserIdByToken)、後台登入檢查(/api/getUserByToken)與寫入函數之角色檢查(requireAdmin)都只呼叫本函數.
 * perm 以自身 users 表為權威, 不採外部 token(getUserByToken)宣稱之 isAdmin; 呼叫端須傳入 perm users 表之列(getTokenUser 反查所得, 或 requireAdmin 新鮮讀取之列), 不得傳 token 使用者物件.
 * 只認自有屬性: 原型鏈上繼承而來之 isAdmin／isActive 不算(防禦性, 資料庫列恆為自有屬性).
 *
 * @param {*} row 輸入 perm users 表之列(任何值)
 * @returns {Boolean} 回傳是否為有效之系統管理員
 */
function isAdminRow(row) {
    if (row === null || typeof row !== 'object' || Array.isArray(row)) {
        return false
    }
    let has = (k) => Object.prototype.hasOwnProperty.call(row, k)
    return has('isActive') && has('isAdmin') && row.isActive === 'y' && row.isAdmin === 'y'
}


/**
 * 外部反查結果是否為「應用系統 token・系統服務用途」之身分(R-APP-TOKEN-01; dspec/使用者身分驗證原則.md 二之一第 3 點)
 *
 * 判準單一擁有者: 部署方之 getUserByToken 回傳之外部使用者物件, 須有非空字串 id, 且 isApp 為 'y'、isAdmin 為 'y'(自有屬性、嚴格相等, 其餘值一律視為否).
 * 本函數只回答「外部宣稱」之形狀, 不是授權: 呼叫端另須確認該身分不在 perm users 表(任何 isActive 之列皆算在表中, 在表者以該列為準, 見 keyCheck.countLoginRows),
 * 且仍須經部署方 verifyAppUser.
 * 使用者用途之應用系統 token(以 userId 綁定使用者)其反查回所綁使用者之實際資料(isApp 為 'y'、isAdmin 依該使用者), 所綁使用者在 perm users 表者以 perm 列判定, 不走本判準.
 *
 * @param {*} user 輸入部署方 getUserByToken 回傳之外部使用者物件(任何值)
 * @returns {Boolean} 回傳是否為系統服務用途之應用系統身分(外部宣稱)
 */
function isSystemAppUser(user) {
    if (user === null || typeof user !== 'object' || Array.isArray(user)) {
        return false
    }
    let has = (k) => Object.prototype.hasOwnProperty.call(user, k)
    return has('id') && typeof user.id === 'string' && user.id !== '' && has('isApp') && user.isApp === 'y' && has('isAdmin') && user.isAdmin === 'y'
}


export { isAdminRow, isSystemAppUser }
export default isAdminRow
