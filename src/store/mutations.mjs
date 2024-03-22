import each from 'lodash-es/each'
import set from 'lodash-es/set'
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
        cancel: {
            eng: `Cancel`,
            cht: `取消`,
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

        managementTargets: {
            eng: `Targets`,
            cht: `管理區塊`,
        },
        permissionGroups: {
            eng: `Groups`,
            cht: `權限群組`,
        },
        userPermissions: {
            eng: 'Users',
            cht: '使用者權限',
        },

        userMsg1: {
            eng: `Please give the appropriate permission group according to the user's identity.`,
            cht: '請依照使用者身份給予適合之權限群組。',
        },
        userMsg2: {
            eng: `Please confirm that the new user is an approved user.`,
            cht: `請確認新增使用者為核可之使用者。`,
        },
        userList: {
            eng: `User list`,
            cht: `使用者分類清單`,
        },
        addUser: {
            eng: `Add user`,
            cht: `新增使用者`,
        },

        targetMsg1: {
            eng: `Please click the button on the right side of each target to perform operations, such as changing the name, inserting or deleting targets.`,
            cht: `請於各區塊右側點擊按鈕即可進行操作，例如變更名稱、插入或刪除區塊。`,
        },
        targetMsg2: {
            eng: `Disable the sub-target function when editing a target.`,
            cht: `編輯區塊時禁止顯隱子區塊功能。`,
        },
        edit: {
            eng: `Edit`,
            cht: `編輯`,
        },
        changeName: {
            eng: `Change name`,
            cht: `變更名稱`,
        },
        insertBefore: {
            eng: `Insert before`,
            cht: `插入前區塊`,
        },
        insertChild: {
            eng: `Insert child`,
            cht: `插入子區塊`,
        },
        insertAfter: {
            eng: `Insert after`,
            cht: `插入後區塊`,
        },
        deleteTarget: {
            eng: `Delete target`,
            cht: `刪除區塊`,
        },
        newTarget: {
            eng: `New target`,
            cht: `新區塊`,
        },
        failedToChangePermissionGroups: {
            eng: `Failed to change permission groups`,
            cht: `連動變更權限群組失敗`,
        },
        failedToClearTargets: {
            eng: `Failed to clear existing targets`,
            cht: `清除既有區塊數據失敗`,
        },
        failedToSaveTargets: {
            eng: `Failed to save targets`,
            cht: `儲存區塊數據失敗`,
        },
        successfulToSaveTargets: {
            eng: `Save targets successfully`,
            cht: `儲存區塊數據成功`,
        },

        groupMsg1: {
            eng: `Please create appropriate permission groups for various users according to system management requirements.`,
            cht: `請依照系統管理需求創建適合各類使用者適合的權限群組。`,
        },
        groupMsg2: {
            eng: `When using edit mode, you can drag permission groups to change their relative order.`,
            cht: `開啟編輯時可拖曳權限群組變更其相對順序。`,
        },
        addGroup: {
            eng: `Add group`,
            cht: `新增群組`,
        },
        addPermissionGroup: {
            eng: `Add permission group`,
            cht: `新增權限群組`,
        },
        groupMsgNoPick: {
            eng: `No permission group is selected.`,
            cht: `未選擇權限群組，請點擇上方任一權限群組以顯示管理範圍。`,
        },
        newGroup: {
            eng: `New group`,
            cht: `新權限群組`,
        },
        failedToAddPermissionGroup: {
            eng: `Failed to add the permission group`,
            cht: `新增權限群組失敗`,
        },
        successfulToAddPermissionGroup: {
            eng: `Add permission group successfully`,
            cht: `新增權限群組成功`,
        },
        confirmToDeletePermissionGroup: {
            eng: `Do you want to delete the permission group[{name}]?`,
            cht: `確認是否刪除權限群組`,
        },
        failedToDeletePermissionGroup: {
            eng: `Failed to delete the permission group`,
            cht: `刪除權限群組失敗`,
        },
        successfulToDeletePermissionGroup: {
            eng: `Delete the permission group successfully`,
            cht: `刪除權限群組成功`,
        },
        failedToChangeOrderPermissionGroup: {
            eng: `Failed to change the order of permission group`,
            cht: `變更權限群組順序失敗`,
        },
        successfulToChangeOrderPermissionGroup: {
            eng: `Change the order of permission groups successfully`,
            cht: `變更權限群組順序成功`,
        },
        rememberToGivePermissionGroupName: {
            eng: `You need to give the permission group name`,
            cht: `權限群組名稱請記得給予`,
        },
        isPermissionGroupNameEmpty: {
            eng: `The {n}th permission group name is empty`,
            cht: `第 {n} 個權限群組名稱為空`,
        },
        failedToSavePermissionGroup: {
            eng: `Failed to save the permission group`,
            cht: `儲存權限群組失敗`,
        },
        successfulToSavePermissionGroup: {
            eng: `Save the permission group successfully`,
            cht: `儲存權限群組成功`,
        },

        editUser: {
            eng: `Edit user`,
            cht: `編修使用者`,
        },
        belongToPermissionGroup: {
            eng: `Permission group`,
            cht: `隸屬權限群組`,
        },
        availableTarget: {
            eng: `Available targets`,
            cht: `使用者可用區塊`,
        },
        isAManager: {
            eng: `Is a manager`,
            cht: `是否為管理者`,
        },
        isActive: {
            eng: 'Is active',
            cht: '是否有效',
        },
        remark: {
            eng: `Remark`,
            cht: `備註`,
        },
        dayCreate: {
            eng: 'Create day',
            cht: '創建日期',
        },
        newUser: {
            eng: `New user`,
            cht: `新使用者`,
        },
        failedToAddUser: {
            eng: `Failed to add the user`,
            cht: `新增使用者失敗`,
        },
        successfulToAddUser: {
            eng: `Add the user successfully`,
            cht: `新增使用者成功`,
        },
        confirmToDeleteUser: {
            eng: `Do you want to delete the user[{name}]?`,
            cht: `確認是否刪除使用者`,
        },
        failedToDeleteUser: {
            eng: `Failed to delete the user`,
            cht: `刪除使用者失敗`,
        },
        successfulToDeleteUser: {
            eng: `Delete the user successfully`,
            cht: `刪除使用者成功`,
        },
        cannotShowUserDetailsInViewMode: {
            eng: `Can not show the user details in the view mode`,
            cht: `非編輯模式無法查閱使用者詳細資訊`,
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

