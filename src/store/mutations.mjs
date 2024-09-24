import each from 'lodash-es/each.js'
import set from 'lodash-es/set.js'
import * as types from './types.mjs'
import ds from '../schema/index.mjs'


//state, 全域狀態
let state = {

    hostname: `${window.location.origin}`,
    webInfor: {},
    connState: '連線中...',
    syncState: false,
    viewState: 'lists',
    loading: false,
    settings: {
        leftDrawerWidth: 200,
    },

    heightApp: 0,
    heightAppEff: 0,
    heightToolbar: 60,

    menu: {}, //初始值需為物件, 否則LayoutContent會取menu.key出錯

    userToken: '',
    user: {
        id: '', //id-for-admin
        name: '', //測試者
        email: '', //admin@example.com
        isAdmin: 'n',
    },

    lang: 'cht',
    keyLangs: {

        aggridLanguage: {
            eng: 'en',
            cht: 'zh-tw',
        },

        systemMessage: {
            eng: 'System message',
            cht: '系統確認訊息',
        },
        ok: {
            eng: 'OK',
            cht: '確認',
        },
        no: {
            eng: 'No',
            cht: '取消',
        },
        yes: {
            eng: 'Yes',
            cht: '確定',
        },

        empty: {
            eng: 'Empty',
            cht: '無',
        },
        waitingData: {
            eng: 'Waiting data...',
            cht: '等待數據中...',
        },

        isEditabled: {
            eng: 'Editable',
            cht: '是否編輯',
        },
        saveChanges: {
            eng: `Save changes`,
            cht: `儲存變更`,
        },
        id: {
            eng: `Id`,
            cht: `主鍵`,
        },
        from: {
            eng: `From`,
            cht: `來源`,
        },
        save: {
            eng: `Save`,
            cht: `儲存`,
        },
        close: {
            eng: `Close`,
            cht: `關閉`,
        },
        delete: {
            eng: `Delete`,
            cht: `刪除`,
        },
        cancel: {
            eng: `Cancel`,
            cht: `取消`,
        },
        screenFull: {
            eng: `Max size`,
            cht: `最大化尺寸`,
        },
        screenNormal: {
            eng: `Normal size`,
            cht: `預設尺寸`,
        },
        checkAllYes: {
            eng: `Check all`,
            cht: `全選`,
        },
        checkAllNo: {
            eng: `Uncheck all`,
            cht: `全不選`,
        },
        checkAllInv: {
            eng: `Reverse all`,
            cht: `全反選`,
        },

        processing: {
            eng: `Processing...`,
            cht: `處理中請稍後...`,
        },
        anUnexpectedErrorOccurred: {
            eng: `An unexpected error occurred, please contact the administrator`,
            cht: `發生非預期錯誤，請洽管理員`,
        },
        unknow: {
            eng: `Unknow`,
            cht: `未知`,
        },

        username: {
            eng: `Username`,
            cht: `使用者姓名`,
        },
        email: {
            eng: `Email`,
            cht: `電子郵件`,
        },
        name: {
            eng: `Name`,
            cht: `名稱`,
        },
        description: {
            eng: `Description`,
            cht: `說明`,
        },
        noDescription: {
            eng: `No description`,
            cht: `無說明`,
        },
        isAdmin: {
            eng: `Administrator`,
            cht: `是否為系統管理員`,
        },
        isActive: {
            eng: `Active`,
            cht: `是否使用`,
        },

        errInNames: {
            eng: `Name errors`,
            cht: `名稱出現錯誤待修復`,
        },
        errInEmails: {
            eng: `Email errors`,
            cht: `Email出現錯誤待修復`,
        },

        managementTargets: {
            eng: `Targets`,
            cht: `管理對象`,
        },
        targetId: {
            eng: `Target`,
            cht: `管理名稱`,
        },
        targetIdEmpty: {
            eng: `No valid name`,
            cht: `尚未給予有效管理名稱`,
        },
        targetIdDuplicate: {
            eng: `Duplicate target`,
            cht: `管理名稱出現重複`,
        },
        targetAddEmpty: {
            eng: `No target`,
            cht: `尚未新增管理資料`,
        },
        targetAdd: {
            eng: `Add target`,
            cht: `新增對象`,
        },
        targetAddNameNew: {
            eng: `New target`,
            cht: `新對象`,
        },
        targetAddIdNew: {
            eng: `Waiting generation`,
            cht: `待自動給予`,
        },
        targetCopy: {
            eng: `Copy target`,
            cht: `複製對象`,
        },
        targetCopyNameNew: {
            eng: `copy`,
            cht: `複製`,
        },
        targetDeleteChecks: {
            eng: `Delete user(s)`,
            cht: `刪除勾選對象`,
        },
        targetEnable: {
            eng: `Enable`,
            cht: `是否使用`,
        },
        targetClearTargetsFail: {
            eng: `Failed to clear existing targets`,
            cht: `清除既有對象數據失敗`,
        },
        targetSaveTargetsFail: {
            eng: `Failed to save targets`,
            cht: `儲存對象數據失敗`,
        },
        targetSaveTargetsSuccess: {
            eng: `Save targets successfully`,
            cht: `儲存對象數據成功`,
        },

        managementPemis: {
            eng: `Permissions`,
            cht: `管理權限`,
        },
        pemiName: {
            eng: `Name of permission`,
            cht: `權限名稱`,
        },
        pemiNameEmpty: {
            eng: `No valid name of permission`,
            cht: `尚未給予有效權限名稱`,
        },
        pemiNameDuplicate: {
            eng: `Duplicate name of permission`,
            cht: `權限名稱出現重複`,
        },
        pemiAddEmpty: {
            eng: `No permission`,
            cht: `尚未新增權限資料`,
        },
        pemiAdd: {
            eng: `Add permission`,
            cht: `新增權限`,
        },
        pemiAddNameNew: {
            eng: `New permission`,
            cht: `新權限`,
        },
        pemiAddIdNew: {
            eng: `Waiting generation`,
            cht: `待自動給予`,
        },
        pemiCopy: {
            eng: `Copy permission`,
            cht: `複製權限`,
        },
        pemiCopyNameNew: {
            eng: `copy`,
            cht: `複製`,
        },
        pemiDeleteChecks: {
            eng: `Delete user(s)`,
            cht: `刪除勾選權限`,
        },
        pemiEnable: {
            eng: `Enable`,
            cht: `是否使用`,
        },
        pemiMode: {
            eng: `Operator`,
            cht: `合併權限模式`,
        },
        pemiCrules: {
            eng: `Rules of permission`,
            cht: `管控對象規則`,
        },
        pemiEditCrules: {
            eng: `Edit rules of permission`,
            cht: `編輯對象規則清單`,
        },
        pemiEditCrulesSimple: {
            eng: `Edit rules`,
            cht: `編輯對象規則`,
        },
        pemiEditCrulesNoId: {
            eng: `Can not find the id of permission`,
            cht: `無法找到權限Id`,
        },
        pemiEditCrulesNoPemi: {
            eng: `Can not find the data of permission`,
            cht: `無法找到權限資料`,
        },
        pemiClearPemisFail: {
            eng: `Failed to clear existing permissions`,
            cht: `清除既有權限數據失敗`,
        },
        pemiSavePemisFail: {
            eng: `Failed to save permissions`,
            cht: `儲存權限數據失敗`,
        },
        pemiSavePemisSuccess: {
            eng: `Save permissions successfully`,
            cht: `儲存權限數據成功`,
        },

        cruleEditNoId: {
            eng: `Can not find the id of rule`,
            cht: `無法找到規則Id`,
        },
        cruleEditNoRule: {
            eng: `Can not find the data of rule`,
            cht: `無法找到規則資料`,
        },
        cruleCheckAllYes: {
            eng: `Check all`,
            cht: `全選使用`,
        },
        cruleCheckAllNo: {
            eng: `Uncheck all`,
            cht: `全不選使用`,
        },
        cruleCheckAllInv: {
            eng: `Reverse all`,
            cht: `全反選使用`,
        },
        cruleDeleteCheckTargets: {
            eng: `Delete item(s)`,
            cht: `刪除勾選對象`,
        },

        managementGrups: {
            eng: `Permission groups`,
            cht: `管理權限群組`,
        },
        grupName: {
            eng: `Name of permission group`,
            cht: `權限群組名稱`,
        },
        grupNameEmpty: {
            eng: `No valid name of permission group`,
            cht: `尚未給予有效權限群組名稱`,
        },
        grupNameDuplicate: {
            eng: `Duplicate name of permission group`,
            cht: `權限群組名稱出現重複`,
        },
        grupAddEmpty: {
            eng: `No permission group`,
            cht: `尚未新增權限群組資料`,
        },
        grupAdd: {
            eng: `Add permission group`,
            cht: `新增權限群組`,
        },
        grupAddNameNew: {
            eng: `New permission group`,
            cht: `新權限群組`,
        },
        grupAddIdNew: {
            eng: `Waiting generation`,
            cht: `待自動給予`,
        },
        grupCopy: {
            eng: `Copy permission group`,
            cht: `複製權限群組`,
        },
        grupCopyNameNew: {
            eng: `copy`,
            cht: `複製`,
        },
        grupDeleteChecks: {
            eng: `Delete user(s)`,
            cht: `刪除勾選權限群組`,
        },
        grupCpemis: {
            eng: `Permissions`,
            cht: `管控使用權限`,
        },
        grupEditCpemis: {
            eng: `Edit list of permission group`,
            cht: `編輯使用權限清單`,
        },
        grupEditCpemisSimple: {
            eng: `Edit permissions`,
            cht: `編輯權限`,
        },
        grupEditCpemisNoId: {
            eng: `Can not find the id of permission group`,
            cht: `無法找到權限群組Id`,
        },
        grupEditCpemisNoGrup: {
            eng: `Can not find the data of permission group`,
            cht: `無法找到權限群組資料`,
        },
        grupClearGrupsFail: {
            eng: `Failed to clear existing permission groups`,
            cht: `清除既有權限群組數據失敗`,
        },
        grupSaveGrupsFail: {
            eng: `Failed to save permission groups`,
            cht: `儲存權限群組數據失敗`,
        },
        grupSaveGrupsSuccess: {
            eng: `Save permission groups successfully`,
            cht: `儲存權限群組數據成功`,
        },

        cpemiEditNoName: {
            eng: `Can not find the name of permission`,
            cht: `無法找到權限名稱`,
        },
        cpemiEditNoPemi: {
            eng: `Can not find the data of permission`,
            cht: `無法找到權限資料`,
        },
        cpemiCheckAllYes: {
            eng: `Check all`,
            cht: `全選使用`,
        },
        cpemiCheckAllNo: {
            eng: `Uncheck all`,
            cht: `全不選使用`,
        },
        cpemiCheckAllInv: {
            eng: `Reverse all`,
            cht: `全反選使用`,
        },
        cpemiDeleteCheckTargets: {
            eng: `Delete item(s)`,
            cht: `刪除勾選權限`,
        },

        managementUsers: {
            eng: `Users`,
            cht: `管理使用者`,
        },
        userName: {
            eng: `Name of user`,
            cht: `使用者名稱`,
        },
        userNameEmpty: {
            eng: `No valid name of user`,
            cht: `尚未給予有效使用者名稱`,
        },
        userNameDuplicate: {
            eng: `Duplicate name of user`,
            cht: `使用者名稱出現重複`,
        },
        userEmailEmpty: {
            eng: `No valid email of user`,
            cht: `尚未給予有效使用者Email`,
        },
        userEmailDuplicate: {
            eng: `Duplicate email of user`,
            cht: `使用者Email出現重複`,
        },
        userAddEmpty: {
            eng: `No user`,
            cht: `尚未新增使用者資料`,
        },
        userAdd: {
            eng: `Add user`,
            cht: `新增使用者`,
        },
        userAddNameNew: {
            eng: `New user`,
            cht: `新使用者`,
        },
        userAddIdNew: {
            eng: `Waiting generation`,
            cht: `待自動給予`,
        },
        userCopy: {
            eng: `Copy user`,
            cht: `複製使用者`,
        },
        userCopyNameNew: {
            eng: `copy`,
            cht: `複製`,
        },
        userDeleteChecks: {
            eng: `Delete user(s)`,
            cht: `刪除勾選使用者`,
        },
        userCgrups: {
            eng: `Permission groups`,
            cht: `管控使用權限群組`,
        },
        userEditCgrups: {
            eng: `Edit list of user`,
            cht: `編輯使用權限群組清單`,
        },
        userEditCgrupsSimple: {
            eng: `Edit permission group`,
            cht: `編輯權限群組`,
        },
        userEditCgrupsNoId: {
            eng: `Can not find the id of user`,
            cht: `無法找到使用者Id`,
        },
        userEditCgrupsNoUser: {
            eng: `Can not find the data of user`,
            cht: `無法找到使用者資料`,
        },
        userClearUsersFail: {
            eng: `Failed to clear existing users`,
            cht: `清除既有使用者數據失敗`,
        },
        userSaveUsersFail: {
            eng: `Failed to save users`,
            cht: `儲存使用者數據失敗`,
        },
        userSaveUsersSuccess: {
            eng: `Save users successfully`,
            cht: `儲存使用者數據成功`,
        },
        userEditNoId: {
            eng: `Can not find the id of user`,
            cht: `無法找到使用者Id`,
        },
        userEditNoUser: {
            eng: `Can not find the data of user`,
            cht: `無法找到使用者數據`,
        },

        allDefaults: {
            eng: `All defaults`,
            cht: `全部項目預設值`,
        },
        show: {
            eng: `Show`,
            cht: `顯示`,
        },
        active: {
            eng: `Active`,
            cht: `啟用`,
        },
        showChildren: {
            eng: `Show children`,
            cht: `所屬顯示`,
        },
        hideChildren: {
            eng: `Hide children`,
            cht: `所屬不顯示`,
        },
        activateChildren: {
            eng: `Activate children`,
            cht: `所屬啟用`,
        },
        deactivateChildren: {
            eng: `Deactivate children`,
            cht: `所屬不啟用`,
        },
        isUsernameEmpty: {
            eng: `Username is empty`,
            cht: `使用者名稱不得為空`,
        },
        failedToSaveUser: {
            eng: `Failed to save the user`,
            cht: `變更使用者失敗`,
        },
        successfulToSaveUser: {
            eng: `Save the user successfully`,
            cht: `變更使用者成功`,
        },

        userId: {
            eng: `ID of the created user`,
            cht: '創建使用者主鍵',
        },
        timeCreate: {
            eng: `Created time`,
            cht: '創建時間',
        },
        userIdUpdate: {
            eng: `ID of the updated user`,
            cht: '最新變更使用者主鍵',
        },
        timeUpdate: {
            eng: `Updated time`,
            cht: '更新時間',
        },

    },
    kpText: {},

}

//添加各資料表
each(ds, (v, k) => {
    state[k] = null //初始化null
})

//儲存至state
export { state }

//mutations, 同步執行
export let mutations = {

    [types.UpdateWebInfor] (state, webInfor) {
        state.webInfor = webInfor
    },

    [types.UpdateLang] (state, lang) {
        state.lang = lang
    },

    [types.UpdateKpText] (state, kpText) {
        state.kpText = kpText
    },

    [types.UpdateConnState] (state, connState) {
        state.connState = connState
    },

    [types.UpdateSyncState] (state, syncState) {
        state.syncState = syncState
    },

    [types.UpdateLoading] (state, loading) {
        state.loading = loading
    },

    [types.UpdateViewState] (state, viewState) {
        state.viewState = viewState
    },

    [types.UpdateTableData] (state, msg) {
        state[msg.tableName] = msg.data
    },

    [types.UpdateData] (state, msg) {
        //msg.path內為存取路徑, 需使用set處理
        // console.log('UpdateData msg', msg)
        set(state, msg.path, msg.data)
    },

    [types.UpdateHeightApp] (state, heightApp) {
        state.heightApp = heightApp
    },

    [types.UpdateHeightAppEff] (state, heightAppEff) {
        state.heightAppEff = heightAppEff
    },

    [types.UpdateHeightToolbar] (state, heightToolbar) {
        state.heightToolbar = heightToolbar
    },

    [types.UpdateMenu] (state, menu) {
        state.menu = menu
    },

    [types.UpdateUserToken] (state, userToken) {
        state.userToken = userToken
    },

    [types.UpdateUserSelf] (state, userSelf) {
        state.userSelf = userSelf
    },

}

