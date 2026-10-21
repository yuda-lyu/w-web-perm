import get from 'lodash-es/get.js'
import each from 'lodash-es/each.js'
import iseobj from 'wsemi/src/iseobj.mjs'


let kpLang = {

    csIng: {
        eng: 'Connecting...',
        cht: '連線中...',
    },
    csLogin: {
        eng: 'Logged in',
        cht: '已登入',
    },
    csLogout: {
        eng: 'Logged out',
        cht: '已登出',
    },
    csErrConn: {
        eng: 'Unable to connect',
        cht: '無法連線',
    },
    csErrLogin: {
        eng: 'Login denied',
        cht: '拒絕登入',
    },

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

    //目前無引用,保留供日後使用(見 spec/設計要點與取捨.md ADR-014)
    // isEditabled: {
    //     eng: 'Editable',
    //     cht: '是否編輯',
    // },
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
    //目前無引用,保留供日後使用(見 spec/設計要點與取捨.md ADR-014)
    // cancel: {
    //     eng: `Cancel`,
    //     cht: `取消`,
    // },
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
        cht: `全選使用`,
    },
    checkAllNo: {
        eng: `Uncheck all`,
        cht: `全不選使用`,
    },
    checkAllInv: {
        eng: `Reverse all`,
        cht: `全反選使用`,
    },
    operEnable: { //關聯表 enable 欄表頭（是否使用）
        eng: `Enable`,
        cht: `是否使用`,
    },
    operPemiMode: { //關聯表 mode 欄表頭（權限之 OR/AND 合併模式）
        eng: `Operator`,
        cht: `合併權限模式`,
    },
    operGrupMode: { //關聯表 mode 欄表頭（權限群組之 OR/AND 合併模式）
        eng: `Operator`,
        cht: `合併權限群組模式`,
    },

    processing: {
        eng: `Processing...`,
        cht: `處理中請稍後...`,
    },
    anUnexpectedErrorOccurred: {
        eng: `An unexpected error occurred, please contact the administrator`,
        cht: `發生非預期錯誤，請洽管理員`,
    },

    //後端 reject 之 err key (eng + cht), 前端 .catch 依 lang 用 $tErr 反查顯示
    cannotConnectServer: {
        eng: `Cannot connect to server`,
        cht: `無法連線至伺服器`,
    },
    saveRowFieldInvalid: {
        eng: `Invalid field value in saved data`,
        cht: `儲存資料的欄位值無效`,
    },
    saveRowFieldDuplicate: {
        eng: `Duplicate field value in saved data`,
        cht: `儲存資料的欄位值重複`,
    },
    nameDuplicate: { //後台整表寫入: 群組／權限之名稱重複(本次造成或觸及者; 歷史既有重複原樣送回不拒), 整次拒存、資料未變更(規則帳本 R-NAME-UNIQ-02, ADR-034)
        eng: `Not saved: the name is duplicated. Group names and permission names must be unique. Nothing was changed.`,
        cht: `未儲存：名稱重複。群組名稱與權限名稱不得重複。資料未變更。`,
    },
    authLossyBlocked: { //編輯器對「物件形式無法無損表示」之授權資料拒存(規則帳本 R-AUTH-LOSSY-01, 主控複審 R4; run04 起「同名同時 OR 與 AND」, 順序部分隨 ADR-033 移除; run05 起另含「啟用而無字串名稱之項目」, R-PRINCIPLE-00 f); {names} 為受影響之名稱
        eng: `Not saved: the authorization settings for {names} contain entries the editor cannot write without changing access (the same name set to both OR and AND, an entry without a usable name, or only entries whose merge mode is missing or invalid). Nothing was changed. Please correct the source data first.`,
        cht: `未儲存：{names} 的授權設定含有編輯器無法在不改變授權下寫出的項目（同一名稱同時以 OR 與 AND 設定、項目沒有可用的名稱，或啟用的項目其合併模式皆缺漏或不合法）。資料未變更，請先修正資料來源。`,
    },
    //授權資料衝突之頁面提示(規則帳本 R-PRINCIPLE-00 原則 3「遇衝突:收嚴＋提示」、R-AUTH-WARN-01): 警告圖示(三角形驚嘆號)之 tooltip; 偵測與代入見 src/js/getAuthWarn.mjs; {names} 為受影響之名稱、{kind} 為被引用者種類(warnKindGrup／warnKindPemi)、{n} 為筆數
    warnKindGrup: {
        eng: `permission group`,
        cht: `權限群組`,
    },
    warnKindPemi: {
        eng: `permission`,
        cht: `權限`,
    },
    warnRefDangling: { //c: 引用之名稱查無實體
        eng: `Not found in the {kind} list: {names}. Each is still counted as an entry with no authorization (an OR entry adds nothing; an AND entry leaves nothing granted). Restore it or remove it.`,
        cht: `在{kind}清單中找不到：{names}。仍視為一個沒有任何授權的項目（OR 項目不增加授權；AND 項目使結果為空）。請還原或移除。`,
    },
    warnRefAmbiguous: { //d: 引用之名稱對到多筆(歷史同名)
        eng: `Matches several {kind}s with the same name: {names}. Only the authorization they all share is used (intersection). Rename or delete the duplicates.`,
        cht: `對到多筆同名的{kind}：{names}。僅採用它們共同擁有的授權（交集）。請將同名項目改名或刪除。`,
    },
    warnRefModeInvalid: { //e: mode 缺或非 OR／AND
        eng: `The merge mode is missing or invalid: {names}. It is treated as AND, but only as a restriction: it never grants access on its own.`,
        cht: `合併模式缺漏或不合法：{names}。系統視為 AND，且僅作為限制，不會單獨授予任何授權。`,
    },
    warnRefBothModes: { //b: 同名同時有 OR 與 AND
        eng: `Set as both OR and AND: {names}. The editor cannot save this without changing access, so saving is refused until the source data is fixed.`,
        cht: `同時以 OR 與 AND 設定：{names}。編輯器無法在不改變授權下儲存，於資料來源修正前將拒絕儲存。`,
    },
    warnRefEmptyName: { //f: 名稱為空字串
        eng: `An entry has an empty name. It is kept as it is and matches only a {kind} whose name is empty.`,
        cht: `有項目的名稱為空字串。照原樣保留，且僅與名稱為空字串的{kind}相符。`,
    },
    warnRefNoName: { //f: 名稱不是字串
        eng: `An entry has no usable name ({names}). The editor cannot keep it, so saving is refused until the source data is fixed.`,
        cht: `有項目沒有可用的名稱（{names}）。編輯器無法保留，於資料來源修正前將拒絕儲存。`,
    },
    warnDataUnparsable: { //格式無法判讀(JSON5 解析失敗或非物件／陣列): 伺服端視為沒有任何授權(收嚴)
        eng: `The authorization data cannot be parsed (invalid format). It is treated as granting nothing. Correct the source data or set it again and save.`,
        cht: `授權資料的格式無法解析，系統視為沒有任何授權。請修正資料來源，或重新設定後儲存。`,
    },
    warnRuleConflict: { //a: crules 同一管理對象重複列且有勾與沒勾並存
        eng: `Listed more than once, with both checked and unchecked: {names}. It is treated as unchecked (n).`,
        cht: `重複列出且有勾與沒勾並存：{names}。系統視為沒勾選（n）。`,
    },
    warnNameHistDup: { //g: 歷史同名列(非本次編輯造成)
        eng: `This name is shared by {n} rows (existing duplicates, not caused by this edit). Anything that refers to it by name uses only what the rows share. Rename or delete the extra rows.`,
        cht: `此名稱由 {n} 筆資料共用（既有的重複，並非本次編輯造成）。以名稱引用它的授權僅採用各筆共同的部分。請將多餘的資料改名或刪除。`,
    },
    warnDupRowsInconsistent: { //編輯器: 同名之列設定不一致而拒存
        eng: `Not saved: rows with the same name have different settings ({names}). Nothing was changed. Please make them identical, or fix the duplicate names first.`,
        cht: `未儲存：同名的列設定不一致（{names}）。資料未變更，請先使其一致，或先修正同名資料。`,
    },
    confirmDelAndRefsGrup: { //刪除群組前: 以 AND 引用者之授權將被收回(R-PRINCIPLE-00 c); {n} 為使用者數
        eng: `{n} user(s) refer to the selected group(s) with AND. If you delete them, those users' authorization will be revoked. Delete anyway?`,
        cht: `有 {n} 位使用者以 AND 引用所選群組，刪除後其授權將被收回。確定刪除？`,
    },
    confirmDelAndRefsPemi: { //刪除權限前: 以 AND 引用者之授權將被收回; {n} 為群組數
        eng: `{n} group(s) refer to the selected permission(s) with AND. If you delete them, the authorization of those groups will be revoked. Delete anyway?`,
        cht: `有 {n} 個群組以 AND 引用所選權限，刪除後其授權將被收回。確定刪除？`,
    },
    //@@U1-KEYS
    //使用者清單頁: 歷史既有(庫內原樣、非本次編輯造成)之同名／同 email／空值／格式不符不擋存, 僅於該儲存格顯示警告圖示(規則帳本 R-PRINCIPLE-00 g、h); 本次造成者仍擋存並顯示 userNameEmpty／userNameDuplicate／userEmail* 既有文字. {n} 為共用該值之使用者數
    warnUserNameHistDup: {
        eng: `This name is shared by {n} users (existing duplicates, not caused by this edit). This does not block saving. If name is the sign-in key, signing in with it is refused until the duplicates are fixed.`,
        cht: `此名稱由 {n} 位使用者共用（既有的重複，並非本次編輯造成），不影響儲存。若以名稱作為登入對應鍵，在重複修正前該名稱將無法登入。`,
    },
    warnUserEmailHistDup: {
        eng: `This email is shared by {n} users (existing duplicates, not caused by this edit). This does not block saving. If email is the sign-in key, signing in with it is refused until the duplicates are fixed.`,
        cht: `此 Email 由 {n} 位使用者共用（既有的重複，並非本次編輯造成），不影響儲存。若以 Email 作為登入對應鍵，在重複修正前該 Email 將無法登入。`,
    },
    warnUserNameHistEmpty: {
        eng: `This user has no valid name (existing data, not caused by this edit). This does not block saving.`,
        cht: `此使用者尚未給予有效名稱（既有資料，並非本次編輯造成），不影響儲存。`,
    },
    warnUserEmailHistEmpty: {
        eng: `This user has no email (existing data, not caused by this edit). This does not block saving. If email is the sign-in key, this user cannot sign in.`,
        cht: `此使用者尚未給予 Email（既有資料，並非本次編輯造成），不影響儲存。若以 Email 作為登入對應鍵，此使用者將無法登入。`,
    },
    warnUserEmailHistInvalid: {
        eng: `The email format of this user is invalid (existing data, not caused by this edit). This does not block saving.`,
        cht: `此使用者的 Email 格式錯誤（既有資料，並非本次編輯造成），不影響儲存。`,
    },
    //刪除群組／權限前之確認(規則帳本 R-PRINCIPLE-00 d): 引用的名稱有多筆同名(歷史同名)而只刪其一, 其餘候選之交集變寬, 引用者授權可能變多. {n} 為引用者數(Both 者 {n} 為授權被收回數、{m} 為授權可能變多數);
    //Both 為 confirmDelAndRefs*(授權被收回)與本類併於同一框、同一個問句
    confirmDelDupRefsGrup: {
        eng: `{n} user(s) refer to a group name that is shared by several groups. If you delete one of them, those users' authorization may increase. Delete anyway?`,
        cht: `有 {n} 位使用者引用的群組名稱有多筆同名資料，刪除其中一筆後，其授權可能變多。確定刪除？`,
    },
    confirmDelDupRefsPemi: {
        eng: `{n} group(s) refer to a permission name that is shared by several permissions. If you delete one of them, the authorization of those groups may increase. Delete anyway?`,
        cht: `有 {n} 個群組引用的權限名稱有多筆同名資料，刪除其中一筆後，其授權可能變多。確定刪除？`,
    },
    confirmDelBothRefsGrup: {
        eng: `{n} user(s) refer to the selected group(s) with AND; if you delete them, those users' authorization will be revoked. Also, {m} user(s) refer to a group name that is shared by several groups; if you delete one of them, those users' authorization may increase. Delete anyway?`,
        cht: `有 {n} 位使用者以 AND 引用所選群組，刪除後其授權將被收回；另有 {m} 位使用者引用的群組名稱有多筆同名資料，刪除其中一筆後，其授權可能變多。確定刪除？`,
    },
    confirmDelBothRefsPemi: {
        eng: `{n} group(s) refer to the selected permission(s) with AND; if you delete them, the authorization of those groups will be revoked. Also, {m} group(s) refer to a permission name that is shared by several permissions; if you delete one of them, the authorization of those groups may increase. Delete anyway?`,
        cht: `有 {n} 個群組以 AND 引用所選權限，刪除後其授權將被收回；另有 {m} 個群組引用的權限名稱有多筆同名資料，刪除其中一筆後，其授權可能變多。確定刪除？`,
    },
    //@@U2-KEYS
    //@@S-KEYS
    //@@M-KEYS
    relationRowsStale: { //反向關聯對話框存檔時, 對話框內有列所對應的使用者／群組已被刪除或改名而整次拒存(規則帳本 R-REL-PAIR-01, ADR-032); {names} 為受影響之名稱
        eng: `Not saved: the list changed while this dialog was open (removed or renamed: {names}). Nothing was changed. Please close this dialog, reload the page and try again.`,
        cht: `未儲存：此對話框開啟期間清單已有異動（已刪除或改名：{names}）。資料未變更，請關閉對話框並重新整理頁面後再操作。`,
    },
    saveInProgress: { //同一操作者之同表儲存處理中再送出 (ADR-025)
        eng: `The previous save is still in progress. Please do not submit again.`,
        cht: `上一次儲存仍在處理中，請勿重複送出`,
    },
    saveNewRowExists: { //標為新增之列已存在(同一包資料重送) (ADR-025)
        eng: `The newly added data has already been saved. Please reload the page before making changes.`,
        cht: `新增之資料已儲存過，請重新整理頁面後再操作`,
    },
    saveTabItemsSuccess: {
        eng: `Saved successfully`,
        cht: `儲存成功`,
    },
    //寫入之欄位值含 HTML 標記而會被 XSS 清除改寫(如 < 後接英文字母), 儲存值將與輸入不同, 於寫入前拒絕(清單儲存與外部同步, ADR-026; 用語同 w-web-sso ADR-081)
    htmlMarkupNotAllowed: {
        eng: 'The input contains HTML markup that is not allowed (such as "<" followed by a letter). Please remove it and try again.',
        cht: '輸入內容含有不允許的 HTML 標記（如「<」後接英文字母），請移除後再試一次。',
    },
    //寫入階段之 ORM／I/O 失敗(非可預判之輸入問題), 部分變更可能已寫入(ADR-013、ADR-026; 用語同 w-web-sso ADR-080)
    saveWriteFail: {
        eng: `Not all changes were written, and some may have taken effect. Please reload the page and check before making changes.`,
        cht: `資料寫入未全部完成，部分變更可能已生效，請重新整理頁面確認後再操作`,
    },
    cannotGetUserId: {
        eng: `Cannot get the user id`,
        cht: `無法取得使用者 Id`,
    },
    cannotGetUserEmail: {
        eng: `Cannot get the email of user`,
        cht: `無法取得使用者 Email`,
    },
    cannotGetUserName: {
        eng: `Cannot get the name of user`,
        cht: `無法取得使用者名稱`,
    },
    cannotGetUserRole: {
        eng: `Cannot get the role of user`,
        cht: `無法取得使用者角色`,
    },
    cannotFindUserFromToken: {
        eng: `Cannot identify the user from token`,
        cht: `無法由 token 識別使用者`,
    },
    cannotGetUserProp: {
        eng: `Cannot get the property of user`,
        cht: `無法取得使用者對應屬性`,
    },
    cannotGetUserFromPerm: {
        eng: `Cannot find the user in permission system`,
        cht: `無法於權限系統取得使用者`,
    },
    ambiguousUserFromPerm: { //登入查找: 以對應鍵(mappingBy)查 perm users(isActive='y')命中多於 1 筆, 拒絕而不取首筆(規則帳本 R-MAPKEY-02, ADR-034); 訊息不含使用者之對應值
        eng: `Cannot identify the user in permission system: more than one active user matches`,
        cht: `無法於權限系統確認使用者：有多位有效使用者符合`,
    },
    userNoPermission: {
        eng: `User does not have permission`,
        cht: `使用者權限不足`,
    },
    invalidPayload: {
        eng: `Invalid payload in request`,
        cht: `請求內容無效`,
    },
    invalidFromInPayload: {
        eng: `Invalid from in payload`,
        cht: `請求來源欄位無效`,
    },
    invalidRowsInPayload: {
        eng: `Invalid rows in payload`,
        cht: `請求資料列無效`,
    },
    invalidFrom: {
        eng: `Invalid from`,
        cht: `來源欄位無效`,
    },
    invalidRows: { //外部同步之資料列無效(非陣列、主鍵型別錯誤／過長／重複、主鍵已屬其他來源(R-SYNC-01)); 2026-10-14 用語改同 w-web-sso(ADR-026, 原 `Invalid rows`／`資料列無效`)
        eng: 'Invalid data format.',
        cht: '資料格式錯誤。',
    },
    cannotGetUserRules: {
        eng: `Cannot get rules of user`,
        cht: `無法取得使用者權限規則`,
    },
    tokenNoPermission: {
        eng: `Token does not have permission`,
        cht: `權限不足`,
    },
    userIdNoPermrules: {
        eng: `The user id does not have permission rules`,
        cht: `此使用者沒有權限規則`,
    },
    invalidKeyTable: {
        eng: `Invalid key table`,
        cht: `資料表名稱無效`,
    },
    cannotFindUserId: {
        eng: `Cannot find the user id`,
        cht: `無法找到使用者 Id`,
    },

    //目前無引用,保留供日後使用(見 spec/設計要點與取捨.md ADR-014)
    // unknow: {
    //     eng: `Unknow`,
    //     cht: `未知`,
    // },

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
    // noDescription: {
    //     eng: `No description`,
    //     cht: `無說明`,
    // },
    modeEdit: {
        eng: `Edit mode`,
        cht: `編輯模式`,
    },
    showTabCols: {
        eng: `Show columns`,
        cht: `顯示欄位`,
    },

    belongUsers: {
        eng: `Use users`,
        cht: `管控所屬使用者`,
    },
    belongGrups: { //與 belongUsers(管控所屬使用者)同類之反向參照欄, 中文補「管控」以對稱(2026-09-16 業主指正)
        eng: `Use groups`,
        cht: `管控所屬權限群組`,
    },
    //目前無引用,保留供日後使用(見 spec/設計要點與取捨.md ADR-014)
    // belongPemis: {
    //     eng: `Use permissions`,
    //     cht: `所屬權限`,
    // },
    belongGrupsNames: {
        eng: `Use permission groups`,
        cht: `所屬權限群組名稱`,
    },
    belongPemisNames: {
        eng: `Use permissions`,
        cht: `所屬權限名稱`,
    },
    chipsShowAll: { //關聯 chip 列表(RelationChips)之「展開全部」鈕提示
        eng: `Show all`,
        cht: `展開全部`,
    },
    chipsPopupTitle: { //關聯 chip 列表之展開浮層標題, {title} 為欄名(belongGrupsNames/belongPemisNames), {n} 為數量
        eng: `{title} ({n} in total)`,
        cht: `{title}：共 {n} 項`,
    },

    isAdmin: {
        eng: `Administrator`,
        cht: `是否為系統管理員`,
    },
    isActive: {
        eng: `Active`,
        cht: `是否有效`,
    },

    errInNames: {
        eng: `Name errors`,
        cht: `名稱出現錯誤待修復`,
    },
    errInIds: {
        eng: `ID errors`,
        cht: `ID 出現錯誤待修復`,
    },
    errInEmails: {
        eng: `Email errors`,
        cht: `Email出現錯誤待修復`,
    },

    menuTreeShow: {
        eng: `Show menu`,
        cht: `顯示選單`,
    },
    menuTreeHide: {
        eng: `Hide menu`,
        cht: `隱藏選單`,
    },
    menuUser: { //上方標題列窄版漢堡按鈕之無障礙名稱(aria-label), 其選單內含當前登入者資訊/語系切換
        eng: `User menu`,
        cht: `使用者選單`,
    },
    language: { //上方標題列窄版選單內語系切換列之標籤
        eng: `Language`,
        cht: `語系`,
    },

    mmTargets: {
        eng: `Targets`,
        cht: `管理對象`,
    },
    mmTargetsMsg: {
        eng: `Targets generally refer to entities such as pages, data, etc., and can also include features or services.`,
        cht: `對象泛指實體的頁面、數據等，亦可為的功能或服務。`,
    },

    mmPemis: {
        eng: `Permissions`,
        cht: `管理權限`,
    },
    mmPemisMsg: {
        eng: `Permissions are primarily used to set rules for enabling or disabling various objects.`,
        cht: `權限主要為用來設定各種對象之使用或禁用規則。`,
    },

    mmGrups: {
        eng: `Permission groups`,
        cht: `管理權限群組`,
    },
    mmGrupsMsg: {
        eng: `Permission groups are primarily used to configure combinations of different permissions.`,
        cht: `權限群組主要為用來設定組合各種權限。`,
    },

    mmUsers: {
        eng: `Users`,
        cht: `管理使用者`,
    },
    mmUsersMsg: {
        eng: `Users are primarily for providing or extending user information and can be configured with combinations of various permission groups.`,
        cht: `使用者主要為提供或擴充使用者資訊，並可設定組合各種權限群組。`,
    },

    targetId: {
        eng: `Target`,
        cht: `對象名稱`,
    },
    targetIdEmpty: {
        eng: `Invalid name`,
        cht: `尚未給予有效對象名稱`,
    },
    targetIdDuplicate: {
        eng: `Duplicate target`,
        cht: `對象名稱出現重複`,
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
    targetDeleteCheckTargets: {
        eng: `Delete target(s)`,
        cht: `刪除勾選對象`,
    },
    targetEnable: {
        eng: `Enable`,
        cht: `是否使用`,
    },
    //目前無引用,保留供日後使用(見 spec/設計要點與取捨.md ADR-014)
    // targetClearTargetsFail: {
    //     eng: `Failed to clear existing targets`,
    //     cht: `清除既有對象數據失敗`,
    // },
    targetSaveTargetsFail: {
        eng: `Failed to save targets`,
        cht: `儲存對象數據失敗`,
    },
    targetSaveTargetsSuccess: {
        eng: `Save targets successfully`,
        cht: `儲存對象數據成功`,
    },

    pemiName: {
        eng: `Name of permission`,
        cht: `權限名稱`,
    },
    pemiNameEmpty: {
        eng: `Invalid name of permission`,
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
    pemiDeleteCheckPemis: {
        eng: `Delete permission(s)`,
        cht: `刪除勾選權限`,
    },
    pemiCrules: {
        eng: `Rules of permission`,
        cht: `管控對象`,
    },
    pemiEditBlngGrupsNoPemiId: {
        eng: `Can not find the id of permission`,
        cht: `無法找到權限Id`,
    },
    pemiEditBlngGrupsNoPemiData: {
        eng: `Can not find the data of permission`,
        cht: `無法找到權限資料`,
    },
    pemiEditCrules: {
        eng: `Edit rules of permission`,
        cht: `編輯使用對象`,
    },
    pemiEditCrulesForDisplay: {
        eng: `Rules of permission`,
        cht: `展示使用對象`,
    },
    // pemiEditCrulesSimple: {
    //     eng: `Edit rules`,
    //     cht: `編輯對象`,
    // },
    pemiEditCrulesNoPemiId: {
        eng: `Can not find the id of permission`,
        cht: `無法找到權限Id`,
    },
    pemiEditCrulesNoPemiData: {
        eng: `Can not find the data of permission`,
        cht: `無法找到權限資料`,
    },
    pemiRnderCrulesNoRule: {
        eng: `No rule`,
        cht: `無使用任何對象`,
    },
    pemiRnderCrulesHasNRule: {
        eng: `Has {n} rule(s){nms}`,
        cht: `使用共 {n} 項對象{nms}`,
    },
    //目前無引用,保留供日後使用(見 spec/設計要點與取捨.md ADR-014)
    // pemiClearPemisFail: {
    //     eng: `Failed to clear existing permissions`,
    //     cht: `清除既有權限數據失敗`,
    // },
    pemiSavePemisFail: {
        eng: `Failed to save permissions`,
        cht: `儲存權限數據失敗`,
    },
    pemiSavePemisSuccess: {
        eng: `Save permissions successfully`,
        cht: `儲存權限數據成功`,
    },

    pemiBlngEditGrups: {
        eng: `Edit permission groups`,
        cht: `編輯所屬權限群組`,
    },
    pemiBlngEditGrupsForDisplay: {
        eng: `Permission groups`,
        cht: `展示所屬權限群組`,
    },
    pemiBlngRnderNoGrup: { //權限頁 belongGrups 欄之空狀態; eng 原誤植為 `No users`(與本欄語意不符, 2026-09-16 雙獨立審計查出), 隨 A3 同欄改字一併訂正
        eng: `No permission groups`,
        cht: `無所屬權限群組`,
    },
    pemiBlngRnderGrups: {
        eng: `Has {n} permission group(s){nms}`,
        cht: `共被 {n} 個權限群組{nms}使用`,
    },
    pemiBlngPemiNow: {
        eng: `Now permission`,
        cht: `目前權限`,
    },
    pemiBlngEditNoName: {
        eng: `Can not find the name of permission`,
        cht: `無法找到權限名稱`,
    },
    pemiBlngEditNoPemi: {
        eng: `Can not find the data of permission`,
        cht: `無法找到權限資料`,
    },
    pemiBlngDeleteCheckPemis: {
        eng: `Delete permission(s)`,
        cht: `刪除勾選權限`,
    },

    cruleEditNoTargetId: {
        eng: `Can not find the id of target`,
        cht: `無法找到對象Id`,
    },
    cruleEditNoTargetData: {
        eng: `Can not find the data of target`,
        cht: `無法找到對象資料`,
    },
    cruleDeleteCheckTargets: {
        eng: `Delete target(s)`,
        cht: `刪除勾選對象`,
    },

    grupName: {
        eng: `Name of permission group`,
        cht: `權限群組名稱`,
    },
    grupNameEmpty: {
        eng: `Invalid name of permission group`,
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
    grupDeleteCheckGrups: {
        eng: `Delete permission group(s)`,
        cht: `刪除勾選權限群組`,
    },
    grupCpemis: {
        eng: `Permissions`,
        cht: `管控使用權限`,
    },
    grupEditBlngNoGrupId: {
        eng: `Can not find the id of permission group`,
        cht: `無法找到權限群組Id`,
    },
    grupEditBlngNoGrupData: {
        eng: `Can not find the data of permission group`,
        cht: `無法找到權限群組資料`,
    },
    grupEditCpemis: {
        eng: `Edit list of permission group`,
        cht: `編輯使用權限`,
    },
    grupEditCpemisForDisplay: {
        eng: `List of permission group`,
        cht: `展示使用權限`,
    },
    grupRnderCpemisNoPermission: {
        eng: `No permission`,
        cht: `無使用任何權限`,
    },
    grupRnderCpemisHasNPermissions: {
        eng: `Has {n} permission(s){nms}`,
        cht: `使用 {n} 項權限{nms}`,
    },
    //目前無引用,保留供日後使用(見 spec/設計要點與取捨.md ADR-014)
    // grupClearGrupsFail: {
    //     eng: `Failed to clear existing permission groups`,
    //     cht: `清除既有權限群組數據失敗`,
    // },
    grupSaveGrupsEmpty: {
        eng: `No user`,
        cht: `未有變更權限群組資料`,
    },
    grupSaveGrupsFail: {
        eng: `Failed to save permission groups`,
        cht: `儲存權限群組數據失敗`,
    },
    grupSaveGrupsSuccess: {
        eng: `Save permission groups successfully`,
        cht: `儲存權限群組數據成功`,
    },

    grupBlngEditUsers: {
        eng: `Edit permission group of users`,
        cht: `編輯所屬使用者`,
    },
    grupBlngEditUsersForDisplay: {
        eng: `Permission group of users`,
        cht: `展示所屬使用者`,
    },
    grupBlngRnderNoUser: {
        eng: `No users`,
        cht: `無所屬使用者`,
    },
    grupBlngRnderUsers: {
        eng: `Has {n} user(s){nms}`,
        cht: `共被 {n} 位使用者{nms}使用`,
    },
    grupBlngGrupNow: {
        eng: `Now permission group`,
        cht: `目前權限群組`,
    },
    grupBlngEditNoGrupName: {
        eng: `Can not find the name of permission group`,
        cht: `無法找到權限群組名稱`,
    },
    grupBlngEditNoGrupData: {
        eng: `Can not find the data of permission group`,
        cht: `無法找到權限群組資料`,
    },
    grupBlngDeleteCheckGrups: {
        eng: `Delete permission group(s)`,
        cht: `刪除勾選權限群組`,
    },

    cpemiEditNoName: {
        eng: `Can not find the name of target`,
        cht: `無法找到對象名稱`,
    },
    cpemiEditNoTarget: {
        eng: `Can not find the data of target`,
        cht: `無法找到對象資料`,
    },
    cpemiDeleteCheckTargets: {
        eng: `Delete targets(s)`,
        cht: `刪除勾選對象`,
    },

    userName: {
        eng: `Name of user`,
        cht: `使用者名稱`,
    },
    userNameEmpty: {
        eng: `Invalid name of user`,
        cht: `尚未給予有效使用者名稱`,
    },
    userNameDuplicate: {
        eng: `Duplicate name of user`,
        cht: `使用者名稱出現重複`,
    },
    userEmailEmpty: {
        eng: `Empty email of user`,
        cht: `尚未給予使用者Email`,
    },
    userEmailError: {
        eng: `Invalid email of user`,
        cht: `使用者Email格式錯誤`,
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
    userDeleteCheckUsers: {
        eng: `Delete user(s)`,
        cht: `刪除勾選使用者`,
    },
    userCgrups: {
        eng: `Permission groups`,
        cht: `管控使用權限群組`,
    },
    userEditCgrups: {
        eng: `Edit list of user`,
        cht: `編輯使用權限群組`,
    },
    userEditCgrupsForDisplay: {
        eng: `Permission groups of user`, //展示版不帶 Edit 動詞(2026-07-10 訂正: 原誤與編輯版同值, 唯讀對話框標題顯示「Edit...」且 e2e 無法以標題區分模式)
        cht: `展示使用權限群組`,
    },
    userEditCgrupsNoUserId: {
        eng: `Can not find the id of user`,
        cht: `無法找到使用者Id`,
    },
    userEditCgrupsNoUserData: {
        eng: `Can not find the data of user`,
        cht: `無法找到使用者資料`,
    },
    // userClearUsersFail: {
    //     eng: `Failed to clear existing users`,
    //     cht: `清除既有使用者數據失敗`,
    // },
    userSaveUsersEmpty: {
        eng: `No user`,
        cht: `未有變更使用者資料`,
    },
    userSaveUsersFail: {
        eng: `Failed to save users`,
        cht: `儲存使用者數據失敗`,
    },
    userSaveUsersSuccess: {
        eng: `Save users successfully`,
        cht: `儲存使用者數據成功`,
    },
    userEditNoUserId: {
        eng: `Can not find the id of user`,
        cht: `無法找到使用者Id`,
    },
    userEditNoUserData: {
        eng: `Can not find the data of user`,
        cht: `無法找到使用者數據`,
    },
    userRnderCgrupsNoGroup: {
        eng: `No permission group`,
        cht: `無使用任何權限群組`,
    },
    userRnderCgrupsHasNGroups: {
        eng: `Has {n} permission group(s){nms}`,
        cht: `使用 {n} 項權限群組{nms}`,
    },

    cgrupEditNoName: {
        eng: `Can not find the name of permission`,
        cht: `無法找到權限名稱`,
    },
    cgrupEditNoPemi: {
        eng: `Can not find the data of permission`,
        cht: `無法找到權限資料`,
    },
    cgrupDeleteCheckPemis: {
        eng: `Delete permission(s)`,
        cht: `刪除勾選權限`,
    },

    //目前無引用,保留供日後使用(見 spec/設計要點與取捨.md ADR-014)
    // allDefaults: {
    //     eng: `All defaults`,
    //     cht: `全部項目預設值`,
    // },
    show: {
        eng: `Show`,
        cht: `顯示`,
    },
    active: {
        eng: `Active`,
        cht: `啟用`,
    },
    //目前無引用,保留供日後使用(見 spec/設計要點與取捨.md ADR-014)
    // showChildren: {
    //     eng: `Show children`,
    //     cht: `所屬顯示`,
    // },
    // hideChildren: {
    //     eng: `Hide children`,
    //     cht: `所屬不顯示`,
    // },
    // activateChildren: {
    //     eng: `Activate children`,
    //     cht: `所屬啟用`,
    // },
    // deactivateChildren: {
    //     eng: `Deactivate children`,
    //     cht: `所屬不啟用`,
    // },
    //目前無引用,保留供日後使用(見 spec/設計要點與取捨.md ADR-014)
    // isUsernameEmpty: {
    //     eng: `Username is empty`,
    //     cht: `使用者名稱不得為空`,
    // },
    // failedToSaveUser: {
    //     eng: `Failed to save the user`,
    //     cht: `變更使用者失敗`,
    // },
    // successfulToSaveUser: {
    //     eng: `Save the user successfully`,
    //     cht: `變更使用者成功`,
    // },

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

    invalidUrl: {
        eng: `Invalid url`,
        cht: `網址無效`,
    },
    invalidTokenTar: {
        eng: `Invalid target token`,
        cht: `目標 token 無效`,
    },
    invalidTokenSelf: {
        eng: `Invalid self token`,
        cht: `自身 token 無效`,
    },
    invalidUserIdTar: {
        eng: `Invalid target user id`,
        cht: `目標使用者 Id 無效`,
    },
    noTokenInUrl: {
        eng: `Missing token in url`,
        cht: `網址缺少 token`,
    },
    noTokenUserIdInUrl: {
        eng: `Missing token or userId in url`,
        cht: `網址缺少 token 或 userId`,
    },
    cannotGetUserByUrl: {
        eng: `Cannot get user by url`,
        cht: `無法由網址取得使用者`,
    },
    cannotGetUserDataByUrl: {
        eng: `Cannot get user data by url`,
        cht: `無法由網址取得使用者資料`,
    },
    noUserDataByUrl: {
        eng: `No user data by url`,
        cht: `該網址無使用者資料`,
    },
    noUserDataAfterConvert: {
        eng: `No user data after permission conversion`,
        cht: `權限轉換後無使用者資料`,
    },

    mmStaInfor: {
        eng: `Statistics`,
        cht: `統計資訊`,
    },
    staEventTitle: {
        eng: `Event Frequency`,
        cht: `事件發生頻率`,
    },
    //目前無引用,保留供日後使用(見 spec/設計要點與取捨.md ADR-014)
    // staTimeGroup: {
    //     eng: `Time grouping`,
    //     cht: `時間分組`,
    // },
    staTimeHr: {
        eng: `Hourly`,
        cht: `每小時`,
    },
    staTimeDay: {
        eng: `Daily`,
        cht: `每日`,
    },
    staTotal: {
        eng: `Total`,
        cht: `全部加總`,
    },
    staNoData: {
        eng: `No event data`,
        cht: `尚無事件資料`,
    },
    getDataError: {
        eng: `Failed to load data`,
        cht: `資料載入失敗`,
    },
    staTableTitle: {
        eng: `Event Statistics`,
        cht: `事件統計表`,
    },
    staColEvent: {
        eng: `Event`,
        cht: `事件`,
    },
    staColLast1Day: {
        eng: `Last 1 Day`,
        cht: `最近1日`,
    },
    staColLast8Hour: {
        eng: `Last 8 Hours`,
        cht: `最近8小時`,
    },
    staColLast4Hour: {
        eng: `Last 4 Hours`,
        cht: `最近4小時`,
    },
    staColLast1Hour: {
        eng: `Last 1 Hour`,
        cht: `最近1小時`,
    },

}


let init = (opt = {}) => {

    //kpLangExt
    let kpLangExt = get(opt, 'kpLangExt')
    if (!iseobj(kpLangExt)) {
        kpLangExt = {}
    }

    //webName
    let webName = get(opt, 'webName')
    if (!iseobj(webName)) {
        webName = {}
    }

    //webDescription
    let webDescription = get(opt, 'webDescription')
    if (!iseobj(webDescription)) {
        webDescription = {}
    }

    //kp
    let kp = {}

    //kpLang
    kp = {
        ...kp,
        ...kpLang,
    }

    //ext kpLangExt
    if (iseobj(kpLangExt)) {
        kp = {
            ...kp,
            ...kpLangExt,
        }
    }

    //webName
    if (iseobj(webName)) {
        kp = {
            ...kp,
            webName: {
                ...webName,
            },
        }
    }

    //webDescription
    if (iseobj(webDescription)) {
        kp = {
            ...kp,
            webDescription: {
                ...webDescription,
            },
        }
    }

    let langs = [
        'eng',
        'cht',
    ]

    let r = {}
    each(langs, (lang) => {

        //kpText
        let kpText = {}
        each(kp, (v, k) => {
            kpText[k] = v[lang]
        })

        //save
        r[lang] = kpText

    })

    return r
}


export default init
