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


export default isAdminRow
