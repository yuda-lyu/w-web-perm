import path from 'path'
import fs from 'fs'
import get from 'lodash-es/get.js'
import map from 'lodash-es/map.js'
import keys from 'lodash-es/keys.js'
import join from 'lodash-es/join.js'
import iseobj from 'wsemi/src/iseobj.mjs'
import isestr from 'wsemi/src/isestr.mjs'
import ispint from 'wsemi/src/ispint.mjs'
import isearr from 'wsemi/src/isearr.mjs'
import isErr from 'wsemi/src/isErr.mjs'
import isfun from 'wsemi/src/isfun.mjs'
import ispm from 'wsemi/src/ispm.mjs'
import cint from 'wsemi/src/cint.mjs'
import j2o from 'wsemi/src/j2o.mjs'
import strleft from 'wsemi/src/strleft.mjs'
import strright from 'wsemi/src/strright.mjs'
import strdelright from 'wsemi/src/strdelright.mjs'
import pm2resolve from 'wsemi/src/pm2resolve.mjs'
import fsIsFolder from 'wsemi/src/fsIsFolder.mjs'
import fsIsFile from 'wsemi/src/fsIsFile.mjs'
import replace from 'wsemi/src/replace.mjs'
import strdelleft from 'wsemi/src/strdelleft.mjs'
import cacheSt from 'wsemi/src/cacheSt.mjs'
import WServHapiServer from 'w-serv-hapi/src/WServHapiServer.mjs'
import WServOrm from 'w-serv-orm/src/WServOrm.mjs'
import checkOptRemoved from 'w-serv-orm/src/checkOptRemoved.mjs'
import ds from '../src/schema/index.mjs'
import { getUserRules } from '../src/plugins/mShare.mjs'
import procCore, { toOutKey, pickClientOpt } from './procCore.mjs'
import syncCore from './syncCore.mjs'
import createLockSave from './lockSave.mjs'
import procLang from './procLang.mjs'
import srLogInit from './srLog.mjs'
import procStaInfor from './procStaInfor.mjs'
import { maskTok, maskQuery, maskUrl } from './maskLog.mjs'
import wrapInjected from './wrapInjected.mjs'
import { pickUniqueUser } from './keyCheck.mjs'
import { createAuthorizeExec, wrapOperOrm } from './dataChannel.mjs'


/**
 * 權限伺服器
 *
 * 身分驗證責任(dspec/使用者身分驗證原則.md 第三節, 使用方套件標準註解): 框架(w-converhp、w-serv-hapi、w-serv-webdata、w-serv-orm)不驗證 token, 一律由本套件負責.
 * 連線閘(verifyConn)與執行身分(getUserIdByToken)皆須完整驗證(token 有效、本系統使用者存在且啟用、部署方授權); hapi apis 路由各自驗證; 函數層級另檢查角色或成員; 公開入口只限列名者.
 * 本套件之落實: 資料通道之連線閘(標頭 token)與執行身分(請求本體 __sysToken__)皆經 getAndVerifyClientUser(外部 getUserByToken → perm users 存在且 isActive='y' → 部署方 verifyClientUser), 任一關不過函數不執行;
 * 改變狀態之 kpFunExt 函數(updateTargets／updatePemis／updateGrups／updateUsers)另限 perm users 表中有效且 isAdmin='y' 者(perm 以自身 users 表為權威, 不採 token 宣稱之 isAdmin), 不符回 userNotAdmin、零寫入;
 * hapi apis 路由: getUserByToken／getPerm 驗 client 使用者, getPermUserInfor／syncAndReplaceTabs 驗 app 使用者(verifyAppUser); 無公開入口(前端靜態檔除外).
 *
 * @class
 * @param {Function} WOrm 輸入資料庫ORM函數
 * @param {String} url 輸入資料庫連線字串，例如w-orm-lmdb為'./db'，或w-orm-mongodb為'mongodb://username:password@$127.0.0.1:27017'
 * @param {String} db 輸入資料庫名稱字串
 * @param {Function} getUserByToken 輸入處理函數，函數會傳入使用者token，通過此函數處理後並回傳使用者資訊物件，並至少須提供'id'、'email'、'name'、'isAdmin'欄位，且'isAdmin'限輸入'y'或'n'。注意: token 回傳之'isAdmin'僅供識別，權限系統一律以自身users表該使用者之'isAdmin'欄位值為權威，不會被 token 宣稱之值複寫。函數拋錯或reject時視同查無使用者(回自家錯誤key，錯誤原文不回前端、不入log，只於srLog記warn)
 * @param {Function} verifyClientUser 輸入驗證瀏覽使用者身份之處理函數，函數會傳入使用者資訊物件(perm users 表之列)與來源字串from，通過此函數識別後回傳布林值(可為Promise)，允許使用者回傳true，反之回傳false。from 值域: 'getUserByToken'(登入)、'getPerm'(api/getPerm)、以及資料通道之 apiType 'main'(RPC 與 ORM 執行; 連線閘驗標頭 token、執行身分〔getUserIdByToken〕驗請求本體 __sysToken__, 兩者各經本函數一次, 本體 token 與標頭 token 不同時兩個使用者各自驗證)、'upload-controller'、'upload-slice'、'download-get-filename'、'download-get-file'、'download'；資料通道與登入採同一授權強度(反查 perm users 且 isActive='y' 後再經本函數)；函數拋錯或reject時視同回傳false
 * @param {Function} verifyAppUser 輸入驗證應用程序使用者身份之處理函數，函數會傳入使用者資訊物件，通過此函數識別後回傳布林值，允許使用者回傳true，反之回傳false；函數拋錯或reject時視同回傳false
 * @param {Object} [opt={}] 輸入設定物件，預設{}
 * @param {Integer} [opt.serverPort=11006] 輸入伺服器通訊port，預設11006。註：原opt.useCheckUser、opt.getUserById、opt.useExcludeWhenNotAdmin已隨w-serv-orm 1.1.9移除，給予undefined、null、false以外之值時建構即拋錯(錯誤訊息出自w-serv-orm之checkOptRemoved，並記srLog)；資料通道之使用者授權由verifyConn(verifyClientUser)負責、表操作只開放select，刪除該三鍵即可，無須替代設定
 * @param {Object} [opt.webName={}] 輸入站台名稱物件，至少包含語系eng與cht鍵的名稱，預設{}
 * @param {Object} [opt.webDescription={}] 輸入站台描述物件，至少包含語系eng與cht鍵的名稱，預設{}
 * @param {String} [opt.webLogo=''] 輸入站台logo字串，採base64格式，預設''
 * @param {String} [opt.subfolder=''] 輸入站台所在子目錄字串，提供站台位於內網採反向代理進行服務時，故需支援位於子目錄情形，預設''
 * @param {String} [opt.urlRedirect=''] 輸入錯誤時自動轉址字串，提供站台例如無法登入或驗證失敗時須自動轉址，預設''
 * @param {String} [opt.mappingBy='id'] 輸入外部系統識別使用者token後所提供之資料物件，與權限系統之使用者資料物件，兩者間查找之對應欄位，可選'id'、'email'、'name'，未給或非此三者時為'id'，預設'id'。對應鍵須能唯一指出使用者：mappingBy為'email'或'name'時，外部同步(syncAndReplaceTabs)users之有效(isActive為'y')列，該欄位須為非空字串且與本批及其他from之有效列皆不重複(違規整批拒收invalidRows)；登入查找以對應鍵於權限系統users命中多於1筆有效使用者時一律拒絕(ambiguousUserFromPerm)，不取首筆；mappingBy為'id'(預設)時不另檢查
 * @param {Boolean} [opt.cascadeRename=true] 輸入群組、權限改名時是否連帶更新引用它之授權字串(users.cgrups、grups.cpemis)，預設true。改名以主鍵id判定(同id異名)，後台整表儲存與外部同步(同一from內)皆適用，於同一次寫入內改寫並可能寫入外部來源之users列之cgrups；給false則不連帶(引用成為懸空，視同引用查無對象而收嚴並於頁面提示)。群組、權限、標的被刪除時之引用連帶清理(users.cgrups、grups.cpemis、pemis.crules)不受此設定影響
 * @param {String} [opt.lockExternalRows='y'] 輸入後台是否不得改外部列(from為非空字串，即經syncAndReplaceTabs由外部來源同步之列)，可選'y'或'n'，預設'y'。'y'時伺服端強制：後台新增列from須為空字串、外部列不可刪除、不可改from、身分/結構欄(指派欄與順序以外之欄位)不可改，違規整次拒收(saveFromNotAllowed／saveExternalRowChanged)；授權指派欄(users.cgrups、grups.cpemis、pemis.crules)後台可寫，但須附載入基準(用戶端自動附帶)，無基準者拒收(saveBaselineRequired)；外部列之order由外部擁有、後台儲存不重編。給'n'回到舊行為(僅保留from須為字串之檢查)。升版後既有庫中from為非空字串之列即視為外部列而唯讀，請先以g_fixFromType.mjs／g_purgeFrom.mjs盤點(見README Upgrade Notes)
 * @param {String} [opt.logFd='./logs'] 輸入log紀錄儲存位置字串，預設'./logs'
 * @param {String} [opt.logInterval='hr'] 輸入log紀錄檔案拆檔時長字串，可選'hr'或'day'，預設'hr'
 * @param {Integer} [opt.logNumKeep=null] 輸入log檔保留數上限正整數，超出者自最舊刪除，未給採w-syslog預設(hr模式365*24、day模式365)，預設null
 * @returns {Object} 回傳w-serv-hapi之WServHapiServer事件物件，可監聽error事件；另提供ready函數(回傳promise，啟動成功resolve為hapi伺服器實體，失敗如埠被占用時reject)、stop函數(釋放資料同步等下游資源後停止伺服器)、getServer函數與getInstWConverServer函數。資料通道之表操作只開放select(新增、修改、刪除一律經updateTargets等函數)；設定錯誤(含已移除之opt鍵)於建構時同步拋出並記srLog
 * @example
 *
 * import WOrm from 'w-orm-lmdb/src/WOrmLmdb.mjs'
 * import WWebPerm from './server/WWebPerm.mjs'
 * import getSettings from './g_getSettings.mjs'
 *
 *
 * //st
 * let st = getSettings()
 *
 * let url = st.dbUrl
 * let db = st.dbName
 * let opt = {
 *
 *     serverPort: 11006,
 *     subfolder: '', //mperm
 *     urlRedirect: 'https://www.google.com/', //本機測試時得先編譯, 再瀏覽: http://localhost:11006/
 *
 *     webName: {
 *         'eng': 'Permission Service',
 *         'cht': '權限管理系統',
 *     },
 *     webDescription: {
 *         'eng': 'A web service package for user permissions and management targets.',
 *         'cht': 'A web service package for user permissions and management targets.',
 *     },
 *     webLogo: 'data:image/svg+xml;base64,...',
 *
 * }
 *
 * let getUserByToken = async (token) => {
 *     // return {} //測試無法登入
 *     if (token === '{token-for-application}') { //提供外部應用系統作為存取使用者
 *         return {
 *             id: 'id-for-application',
 *             name: 'application',
 *             email: 'application@example.com',
 *             isAdmin: 'y',
 *         }
 *     }
 *     if (token === 'sys') { //開發階段w-ui-loginout自動給予browser使用者(且位於localhost)的token為sys
 *         return {
 *             id: 'id-for-admin',
 *             name: 'tester',
 *             email: 'admin@example.com', //mappingBy為email, 開發階段時會使用email找到所建置之使用者資料
 *             isAdmin: 'y',
 *         }
 *     }
 *     console.log('invalid token') //勿印權杖值
 *     console.log('於生產環境時得加入SSO等驗證token機制')
 *     return {}
 * }
 *
 * let verifyClientUser = (user, from) => {
 *     console.log('verifyClientUser/user', user)
 *     // return false //測試無法登入
 *     console.log('於生產環境時得加入限制瀏覽器使用者身份機制')
 *     return user.isAdmin === 'y' //測試僅系統管理者使用
 * }
 *
 * let verifyAppUser = (user, from) => {
 *     console.log('verifyAppUser/user', user)
 *     // return false //測試無法登入
 *     console.log('於生產環境時得加入限制應用程式使用者身份機制')
 *     return user.isAdmin === 'y' //測試僅系統管理者使用
 * }
 *
 * //WWebPerm
 * let instWWebPerm = WWebPerm(WOrm, url, db, getUserByToken, verifyClientUser, verifyAppUser, opt)
 *
 * instWWebPerm.on('error', (err) => {
 *     console.log(err)
 * })
 *
 */
function WWebPerm(WOrm, url, db, getUserByToken, verifyClientUser, verifyAppUser, opt = {}) {
    let instWServHapiServer = null


    //check WOrm
    if (!isfun(WOrm)) {
        console.log('invalid WOrm', WOrm)
        throw new Error('invalid WOrm')
    }


    //check url
    if (!isestr(url)) {
        console.log('invalid url', url)
        throw new Error('invalid url')
    }


    //check db
    if (!isestr(db)) {
        console.log('invalid db', db)
        throw new Error('invalid db')
    }


    //check getUserByToken
    if (!isfun(getUserByToken)) {
        console.log('invalid getUserByToken', getUserByToken)
        throw new Error('invalid getUserByToken')
    }


    //check verifyClientUser
    if (!isfun(verifyClientUser)) {
        console.log('invalid verifyClientUser', verifyClientUser)
        throw new Error('invalid verifyClientUser')
    }


    //check verifyAppUser
    if (!isfun(verifyAppUser)) {
        console.log('invalid verifyAppUser', verifyAppUser)
        throw new Error('invalid verifyAppUser')
    }


    //serverPort
    let serverPort = get(opt, 'serverPort')
    if (!ispint(serverPort)) {
        serverPort = 11006
    }
    serverPort = cint(serverPort)


    //webName
    let webName = get(opt, 'webName', {})


    //webDescription
    let webDescription = get(opt, 'webDescription', {})


    //webLogo
    let webLogo = get(opt, 'webLogo', '')


    //subfolder
    let subfolder = get(opt, 'subfolder', '')
    if (isestr(subfolder)) {
        if (strright(subfolder, 1) === '/') { //右邊不需要給「/」
            subfolder = strdelright(subfolder, 1)
        }
        if (strleft(subfolder, 1) !== '/') { //左邊需要給「/」
            subfolder = `/${subfolder}`
        }
    }


    //urlRedirect
    let urlRedirect = get(opt, 'urlRedirect', '')
    // console.log('urlRedirect', urlRedirect)


    //params
    let showLanguage = get(opt, 'showLanguage', 'n')
    let language = get(opt, 'language', 'eng')
    let showModeEditTargets = get(opt, 'showModeEditTargets', 'n')
    let showModeEditPemis = get(opt, 'showModeEditPemis', 'n')
    let showModeEditGrups = get(opt, 'showModeEditGrups', 'n')
    let showModeEditUsers = get(opt, 'showModeEditUsers', 'n')
    let modeEditTargets = get(opt, 'modeEditTargets', 'n')
    let modeEditPemis = get(opt, 'modeEditPemis', 'n')
    let modeEditGrups = get(opt, 'modeEditGrups', 'n')
    let modeEditUsers = get(opt, 'modeEditUsers', 'n')
    let widthTargetId = get(opt, 'widthTargetId', '')
    let widthTargetDescription = get(opt, 'widthTargetDescription', '')
    let widthPemisName = get(opt, 'widthPemisName', '')
    let widthPemisDescription = get(opt, 'widthPemisDescription', '')
    let widthGrupsName = get(opt, 'widthGrupsName', '')
    let widthGrupsDescription = get(opt, 'widthGrupsDescription', '')
    let widthUsersName = get(opt, 'widthUsersName', '')
    let widthUsersEmail = get(opt, 'widthUsersEmail', '')
    let widthUsersDescription = get(opt, 'widthUsersDescription', '')


    //mappingBy
    let mappingBy = get(opt, 'mappingBy', '')
    if (mappingBy !== 'id' && mappingBy !== 'email' && mappingBy !== 'name') {
        mappingBy = 'id'
    }
    // console.log('mappingBy', mappingBy)


    //cascadeRename, 群組／權限改名時是否連帶更新引用它之授權字串(預設 true; 僅 false 關閉; 刪除連帶清理不受此設定影響, R-REF-CASCADE-01)
    let cascadeRename = get(opt, 'cascadeRename', true) !== false


    //lockExternalRows, 後台是否不得改外部列(from 為非空字串者)之身分／結構欄、不得刪除與複製繼承 from(預設 true; 僅 'n' 或 false 關閉, 回到舊行為; F-23, R-EXT-OWN-01, ADR-037)
    let lockExternalRows = !(get(opt, 'lockExternalRows', 'y') === 'n' || get(opt, 'lockExternalRows', 'y') === false)


    //kpLangExt
    let kpLangExt = get(opt, 'kpLangExt', null)


    //kpLang
    let kpLang = procLang({ kpLangExt, webName, webDescription })


    //srLog
    let srLog = srLogInit(opt)


    //w-serv-orm 1.1.9 已移除之設定鍵(useCheckUser / getUserById / useExcludeWhenNotAdmin): 給予 undefined、null、false 以外之值即拋錯(fail-fast, ADR-026; 規則帳本 R-ORM-03),
    //判準與訊息單一來源在 w-serv-orm 之 checkOptRemoved; 於 srLogInit 之後檢查以便記 key, 並先於 WServOrm 建構(不開啟資料庫).
    //why fail-fast(而非 w-web-sso ADR-083 之忽略＋警告): 本套件過去把三鍵透傳給 w-serv-orm 且實際生效(含依使用者過濾 select 結果),
    //靜默忽略會無聲失去部署方以為仍在之可見範圍保證; sso 過去即已忽略三鍵, 其「忽略並警告」係延續自身歷史, 兩者不必一致.
    try {
        checkOptRemoved(opt)
    }
    catch (err) {
        srLog.error({ event: 'WWebPerm-init-error', msg: err.message })
        throw err
    }


    //注入函數一律經包裝(W 契約, spec/設計要點與取捨.md ADR-023), 以包裝版取代三個參數
    //why: 注入函數拋錯或 reject 時原會被 await 原樣上拋, 其原文經 pm2resolve 回前端、經 verifyConn 之 msg 入 srLog、經 error 事件印出;
    //部署方常以 w-web-sso 對外 helper(≤1.1.4)包裝 getUserByToken, 其 reject 字串含已代入系統介接權杖與使用者權杖之完整網址.
    //包裝後失敗視同否定結果(getUserByToken → null 等同查無, verify* → false 等同無權限), 走各呼叫點既有分支回自家 key;
    //上游原文不回前端、不入 log, 只於此記 warn(白名單 key, 或型別與 Error.name). 同一次失敗 log 2~3 筆: 此處 warn(因) + 呼叫點 error(果).
    //以下取代後, 本函數內除此三行外不得再直接使用原始參數(盤點見 sgud/rule/rulebook.md「權杖不外洩」, 測試 unit-wrapInjected WRAP-SITE-*)
    let logInjectFail = (name) => {
        return (d) => {
            srLog.warn({ event: `inject-${name}-fail`, ...d })
        }
    }
    getUserByToken = wrapInjected(getUserByToken, { failValue: null, onFail: logInjectFail('getUserByToken') })
    verifyClientUser = wrapInjected(verifyClientUser, { failValue: false, onFail: logInjectFail('verifyClientUser') })
    verifyAppUser = wrapInjected(verifyAppUser, { failValue: false, onFail: logInjectFail('verifyAppUser') })


    //WServOrm, w-serv-orm 1.1.10 起無設定鍵(不帶 opt)
    let wp = {}
    try {
        wp = WServOrm(ds, WOrm, url, db)
    }
    catch (err) {
        console.log(err)
        srLog.error({ event: 'WServOrm-init-error', msg: (err && err.message) || 'WServOrmInitFailed' })
        throw err //fail-fast: ORM 初始化失敗直接終止啟動, 不以 wp={} 繼續組裝出「port 起得來但 woItems/procOrm 為 undefined、CRUD 全 crash」的半死伺服器
    }
    let { woItems, procOrm } = wp


    //lockTabs, guardWrite: w-serv-orm 1.1.17 的每表一鍵表鎖與原子防護(多人同時編輯規格第 6、7 節; 規則帳本 R-LOCK-CORE-01), 取自 WServOrm 回傳物件——**唯一**的鎖管理器.
    //perm 為「整表批次 diff」寫入, 鎖粒度為整表: 後台整表寫入(procCore.updateTabItems 之 guardWrite)、外部同步(syncAndReplaceTabs)與引用連帶之引用端寫入皆取同一把表鎖, 防同表並行 race (lost update) 與唯一性檢查被交錯略過 (R-WRITE-LOCK-01).
    //不再自建 pmKeyMutex／鎖鍵(原 tabWriteKey 已移除); 鎖不可重入, 多表依階層巢狀取鎖見 keyCheck.withTabLocks(R-WRITE-LOCK-02)
    let lockTabs = wp.withTabLocks
    let guardWrite = wp.guardWrite


    //sc: 外部匯入(POST /syncAndReplaceTabs)核心(server/syncCore.mjs; perm-run03 起依來源鍵 srcKey 差異同步, R-IMPORT-01): 與後台整表寫入共用同一個鎖管理器(lockTabs).
    //syncWarns(同一 from 同名異 srcKey 之疑似來源鍵重編提示)之登錄亦在其內(記憶體, 重啟即清; 不含個資, 僅表名、來源名稱、筆數、時間)
    let sc = syncCore({ woItems, procOrm, lockTabs, srLog, mappingBy, cascadeRename })


    //lockSave: 後台整表寫入(updateTabItems)之雙擊防護(後端, 見 lockSave.mjs, ADR-025): 以「updateTabItems:{表名}:{操作者 id}」於 cacheSt 原子占位,
    //同一操作者之同表寫入處理中再送出即 reject 'saveInProgress'(不排隊); 包在表鎖之外層, 不同操作者之並行仍由表鎖序列化(ADR-012)
    let cst = cacheSt()
    let lockSave = createLockSave(cst)


    //procCore: 整表批次 diff 寫入邏輯 (updateTabItems + updateTargets/Pemis/Grups/Users)
    let pc = procCore(woItems, procOrm, { srLog, withTabLocks: lockTabs, guardWrite, lockSave, mappingBy, cascadeRename, lockExternalRows }) //mappingBy 供 users 整表寫入的對應鍵檢查(R-PRINCIPLE-00 適用表 h); cascadeRename 供群組／權限改名之引用級聯(適用表 m); lockExternalRows 供後台對外部列之守門(F-23)


    //procStaInfor: 統計資訊, fdLog 對齊 srLog 使用同一目錄(讀 settings.logFd, fallback 邏輯同 srLog.mjs); mock 由 settings.staEventMock 注入(e2e 統計圖穩定用)
    let logFd = get(opt, 'logFd', '')
    if (!isestr(logFd)) {
        logFd = './logs'
    }
    let psi = procStaInfor({ fdLog: logFd, mock: get(opt, 'staEventMock', false), srLog })


    //getWebInfor
    let getWebInfor = (userId) => {

        //info
        srLog.info({ event: 'getWebInfor-success', userId })

        return {

            // webName, //已併入kpLang
            // webDescription, //已併入kpLang
            webLogo,
            // urlRedirect, //登入失敗就需要轉址, 故須通過html模板取代提供, 無法用api提供

            showLanguage,
            language,
            kpLang,

            showModeEditTargets,
            showModeEditPemis,
            showModeEditGrups,
            showModeEditUsers,
            modeEditTargets,
            modeEditPemis,
            modeEditGrups,
            modeEditUsers,

            cascadeRename, //改名是否連帶更新引用(opt.cascadeRename), 供清單頁儲存前預覽與伺服端一致(R-REF-CASCADE-01)
            lockExternalRows: lockExternalRows ? 'y' : 'n', //後台是否不得改外部列(opt.lockExternalRows), 供清單頁逐列唯讀、複製重置 from 與伺服端一致(R-EXT-OWN-01)
            syncWarns: sc.getSyncWarns(), //外部同步疑似來源鍵重編之提示(同一 from 同名異 srcKey), 供清單頁橫幅(原則 3: 提示); 不含個資, 僅表名、來源名稱、筆數、時間

            widthTargetId,
            widthTargetDescription,
            widthPemisName,
            widthPemisDescription,
            widthGrupsName,
            widthGrupsDescription,
            widthUsersName,
            widthUsersEmail,
            widthUsersDescription,

        }
    }


    //checkUser
    let checkUser = async(user) => {
        let id = get(user, 'id', '')
        if (!isestr(id)) {
            console.log('user', user)
            srLog.error({ event: 'checkUser-error', msg: 'cannotGetUserId' })
            return Promise.reject(`cannotGetUserId`)
        }
        let email = get(user, 'email', '')
        if (!isestr(email)) {
            console.log('user', user)
            srLog.error({ event: 'checkUser-error', msg: 'cannotGetUserEmail' })
            return Promise.reject(`cannotGetUserEmail`)
        }
        let name = get(user, 'name', '')
        if (!isestr(name)) {
            console.log('user', user)
            srLog.error({ event: 'checkUser-error', msg: 'cannotGetUserName' })
            return Promise.reject(`cannotGetUserName`)
        }
        let isAdmin = get(user, 'isAdmin', '')
        if (isAdmin !== 'y' && isAdmin !== 'n') {
            console.log('user', user)
            console.log('user.isAdmin is not y or n', user.isAdmin)
            srLog.error({ event: 'checkUser-error', msg: 'cannotGetUserRole' })
            return Promise.reject(`cannotGetUserRole`)
        }
        return true
    }


    //getTokenUser
    let getTokenUser = async(token) => {
        //基於token查找使用者, 會基於外部getUserByToken以及perm內部users進行查找並比對

        //userSelf
        let userSelf = null
        if (isestr(token)) {
            userSelf = getUserByToken(token)
            if (ispm(userSelf)) {
                userSelf = await userSelf
            }
        }
        // console.log('userSelf', userSelf)

        //check
        if (!iseobj(userSelf)) {
            console.log(`token`, maskTok(token))
            srLog.error({ event: 'getTokenUser-error', msg: 'cannotFindUserFromToken' })
            return Promise.reject(`cannotFindUserFromToken`)
        }

        //check userSelf
        await checkUser(userSelf)

        //須反查perm內users, 提供正規化屬性
        let vSelf = get(userSelf, mappingBy, '')
        // console.log('vSelf', vSelf)

        //check
        if (!isestr(vSelf)) {
            console.log('userSelf', userSelf)
            console.log('mappingBy', mappingBy)
            srLog.error({ event: 'getTokenUser-error', msg: 'cannotGetUserProp', mappingBy })
            return Promise.reject(`cannotGetUserProp`)
        }

        //userFind, 對應鍵須唯一(F-14, 規則帳本 R-MAPKEY-02): 命中多於 1 筆即拒絕, 不取首筆(取首筆等於由資料庫列序決定登入者為誰)
        let userRs = await woItems.users.select({ [mappingBy]: vSelf, isActive: 'y' })
        let { user: userFind, count: countFind } = pickUniqueUser(userRs)
        // console.log('userFind', userFind)

        //check, 多筆: 只記 mappingBy 與筆數, 不記使用者之對應值(email／name 為個資); 0 筆行為不變
        if (countFind > 1) {
            console.log('mappingBy', mappingBy, 'count', countFind)
            srLog.error({ event: 'getTokenUser-error', msg: 'ambiguousUserFromPerm', mappingBy, count: countFind })
            return Promise.reject(`ambiguousUserFromPerm`)
        }

        //check
        if (!iseobj(userFind)) {
            console.log('userSelf', userSelf)
            console.log('mappingBy', mappingBy)
            srLog.error({ event: 'getTokenUser-error', msg: 'cannotGetUserFromPerm', mappingBy })
            return Promise.reject(`cannotGetUserFromPerm`)
        }

        //isAdmin 權威為 perm users 表之欄位值, 不以 token(getUserByToken)宣稱之 isAdmin 複寫。
        //(2026-07-11 稽核 A-C1 裁決(b): 原此處有一段恆為 no-op 之「複寫isAdmin」死碼
        // (userFind.isAdmin = isAdminSelf, 把自己指派給自己), 與 JSDoc 舊文「輸入'y'時會複寫」互斥;
        // 依業主裁決採保守解: 刪除死碼、文件對齊實際行為, 不啟用 token→admin 提權路徑。)

        return userFind
    }


    //getAndVerifyClientUser
    let getAndVerifyClientUser = async (token, from = '') => {
        //基於token查找client使用者, 會基於外部getUserByToken以及perm內部users進行查找並比對

        //getTokenUser
        let user = await getTokenUser(token)

        //verifyClientUser
        let b = verifyClientUser(user, from)
        if (ispm(b)) {
            b = await b
        }

        //check
        if (!b) {
            console.log('user', user)
            srLog.error({ event: 'getAndVerifyClientUser-error', msg: 'userNoPermission', from })
            return Promise.reject(`userNoPermission`)
        }

        return user
    }


    //getAndVerifyAppUser
    let getAndVerifyAppUser = async (token, from = '') => {
        //基於token查找app使用者, 會基於外部getUserByToken進行查找, 故只要getUserByToken提供使用者即可, 可支援getUserByToken給予針對應用程式所產生之虛擬使用者

        //user
        let user = null
        if (isestr(token)) {
            user = getUserByToken(token)
            if (ispm(user)) {
                user = await user
            }
        }
        // console.log('user', user)

        //check
        if (!iseobj(user)) {
            console.log(`token`, maskTok(token))
            srLog.error({ event: 'getAndVerifyAppUser-error', msg: 'cannotFindUserFromToken' })
            return Promise.reject(`cannotFindUserFromToken`)
        }

        //verifyAppUser
        let b = verifyAppUser(user, from)
        if (ispm(b)) {
            b = await b
        }

        //check
        if (!b) {
            console.log('user', user)
            srLog.error({ event: 'getAndVerifyAppUser-error', msg: 'userNoPermission', from })
            return Promise.reject(`userNoPermission`)
        }

        return user
    }


    //p
    let p = {
        //checkToken, 資料通道(/api/main 之 RPC 與 ORM 執行、上傳、下載)之連線驗證, 與 api/getUserByToken(登入)採同一授權強度:
        //外部 getUserByToken → 欄位齊備 → 反查 perm users(mappingBy)且 isActive='y' → verifyClientUser(user, from)
        //why: 2026-09-07 前僅驗外部 token 欄位齊備(checkUser), 不查 perm users 與 isActive, 亦不經 verifyClientUser,
        //致不在 perm users 表之外部使用者、被停用(isActive='n')之使用者仍可經資料通道讀寫全部權限資料(實測 A3/A4, 見 tmp/probe-report.json);
        //改為與登入入口對稱, 使 UI 之「是否有效」與部署層 verifyClientUser 政策對資料通道亦生效.
        //from 為 w-converhp 之 apiType('main' / 'upload-controller' / 'upload-slice' / 'download-get-filename' / 'download-get-file' / 'download'),
        //供部署層 verifyClientUser(user, from) 區分入口.
        checkToken: async(token, from = '') => {

            //getAndVerifyClientUser, reject 時 key: cannotFindUserFromToken / cannotGetUserFromPerm / userNoPermission 等
            await getAndVerifyClientUser(token, from)

            return true
        },
    }


    //parsePayload
    let parsePayload = async (req) => {

        //payload
        let payload = get(req, 'payload')

        //to obj
        if (isestr(payload)) {
            payload = j2o(payload)
        }

        //check
        if (!iseobj(payload)) {
            console.log('payload', payload)
            srLog.error({ event: 'parsePayload-error', msg: 'invalidPayload' })
            return Promise.reject(`invalidPayload`)
        }

        //from
        let from = get(payload, 'from', '')

        //check
        if (!isestr(from)) {
            console.log('payload', payload)
            srLog.error({ event: 'parsePayload-error', msg: 'invalidFromInPayload' })
            return Promise.reject(`invalidFromInPayload`)
        }

        //rows
        let rows = get(payload, 'rows', [])

        //check
        if (!isearr(rows)) {
            console.log('payload', payload)
            srLog.error({ event: 'parsePayload-error', msg: 'invalidRowsInPayload' })
            return Promise.reject(`invalidRowsInPayload`)
        }

        //inp
        let inp = {
            from,
            rows,
        }

        return inp
    }


    //getGenUserByKV
    let getGenUserByKV = async(keyUser, valueUser) => {

        //userFind, 與 getTokenUser 同一判準(pickUniqueUser): 非恰 1 筆不取首筆(目前僅以主鍵 id 呼叫, 恆 ≤ 1 筆)
        let userRs = await woItems.users.select({ [keyUser]: valueUser, isActive: 'y' })
        let { user: userFind } = pickUniqueUser(userRs)

        //check
        if (!iseobj(userFind)) {
            return null
        }

        return userFind
    }


    //requireAdmin: 函數層級之角色檢查(perm-run03 範圍四; dspec/使用者身分驗證原則.md 二.4「函數層級須另檢查角色, 不得只靠部署方之授權設定把關」; w-web呼叫者身分驗證.md C2, 使用者 2026-10-23 裁示採②):
    //改變狀態之 kpFunExt 函數(updateTargets／updatePemis／updateGrups／updateUsers; getWebInfor、getStaEvent、getStaEventTable 為唯讀不在此列)限 perm users 表中有效(isActive='y')且 isAdmin='y' 之使用者.
    //perm 以自身 users 表為權威, 不採 token(getUserByToken)宣稱之 isAdmin(同 getTokenUser); userId 為 getUserIdByToken 回傳之 perm 內 id, 此處再新鮮讀取一次(角色可能於連線後被改, 不信任快取).
    //不符即 reject 固定錯誤鍵 userNotAdmin、零寫入(先於 lockSave／表鎖／任何讀庫), 記 srLog(只記函數名與 userId, 不記 token 與使用者資料); 讀取失敗(ORM 例外)一律視同不符(fail-closed)
    let requireAdmin = async (userId, funcName) => {
        let u = null
        try {
            u = await getGenUserByKV('id', userId)
        }
        catch (err) {
            u = null
        }
        if (!iseobj(u) || u.isAdmin !== 'y') {
            srLog.error({ event: 'requireAdmin-error', msg: 'userNotAdmin', funcName, userId })
            return Promise.reject('userNotAdmin')
        }
        return u
    }


    //getGenUserByUserId
    let getGenUserByUserId = async(userId) => {

        //userFind
        let userFind = await getGenUserByKV('id', userId)

        //check
        if (!iseobj(userFind)) {
            return null
        }

        return userFind
    }


    //getGenUserAndRulesByUserId
    let getGenUserAndRulesByUserId = async (userId) => {

        //userFind
        let userFind = await getGenUserByUserId(userId)
        // console.log('userFind', userFind)

        //grups
        let grups = await woItems.grups.select()
        // console.log('grups', grups)

        //pemis
        let pemis = await woItems.pemis.select()
        // console.log('pemis', pemis)

        //targets
        let targets = await woItems.targets.select()
        // console.log('targets', targets)

        //getUserRules, 評估時之任何例外一律轉為固定語系鍵 cannotGetUserRules: 不得把引擎原文(如 TypeError 的 message)經 getPerm／getPermUserInfor 回給外部應用(R-KEY-PROP-01, 錯誤一律回 key)
        let kur = null
        try {
            kur = getUserRules(userFind, grups, pemis, targets)
        }
        catch (err) {
            console.log('userId', userId)
            console.log('getUserRules', err)
            srLog.error({ event: 'getGenUserAndRulesByUserId-error', msg: 'cannotGetUserRules', userId })
            return Promise.reject(`cannotGetUserRules`)
        }
        // console.log('getUserRules', kur)

        //check
        if (!iseobj(kur)) {
            console.log('userId', userId)
            srLog.error({ event: 'getGenUserAndRulesByUserId-error', msg: 'cannotGetUserRules', userId })
            return Promise.reject(`cannotGetUserRules`)
        }

        //grupsNames
        let grupsNames = map(get(kur, 'grups', []), 'name') //kur.grups僅會提供isActive='y', 故grupsNames為有效權限群組名稱
        grupsNames = join(grupsNames, ';')

        return {
            user: {
                ...userFind,
                grupsNames,
            },
            // grups: get(kur, 'grups', []),
            rules: get(kur, 'rules', []),
        }
    }


    //pathStaticFiles
    let pathStaticFiles = 'dist'
    let npmPathStaticFiles = './node_modules/w-web-perm/dist'
    if (fsIsFolder(npmPathStaticFiles)) {
        pathStaticFiles = npmPathStaticFiles
    }
    // console.log('pathStaticFiles', pathStaticFiles)


    //subfolder
    let fnEntryIn = 'index.tmp'
    let fnEntryOut = 'index.html'
    try {
        let fpEntryIn = path.resolve(pathStaticFiles, fnEntryIn)
        if (!fsIsFile(fpEntryIn)) {
            fpEntryIn = path.resolve(pathStaticFiles, fnEntryOut) //本機開發另使用html替代tmp
        }
        if (!fsIsFile(fpEntryIn)) {
            console.log('fpEntryIn', fpEntryIn)
            throw new Error(`invalid fpEntryIn`)
        }
        let fpEntryOut = path.resolve(pathStaticFiles, fnEntryOut)
        let c = fs.readFileSync(fpEntryIn, 'utf8')
        c = replace(c, '/mperm/', '{sfd}/') //方法同genEntry
        c = replace(c, '{sfd}', subfolder)
        c = replace(c, '{urlRedirect}', urlRedirect)
        c = replace(c, '{language}', language)
        fs.writeFileSync(fpEntryOut, c, 'utf8')
    }
    catch (err) {
        console.log(err)
        console.log(`can not generate ${fnEntryOut}`)
    }


    //apis
    let apis = [

        {
            method: 'GET',
            path: '/api/getUserByToken', //未登入主頁時需先檢測token, getUserByToken為w-ui-loginout預設值, 若要更改兩邊須同時修改
            handler: async function (req, res) {
                // console.log('getUserByToken', req)

                async function core() {
                    //提供對象為browser使用者, 須先檢測token是否有效, 確認後回傳該使用者之資訊物件

                    //token
                    let token = get(req, 'query.token', '')
                    // console.log('token', token)

                    //check
                    if (!isestr(token)) {
                        console.log('req.query', maskQuery(get(req, 'query')))
                        console.log('token', maskTok(token))
                        console.log('[API]getUserByToken/check token: invalid token')
                        srLog.error({ event: 'api/getUserByToken-error', msg: 'tokenNoPermission' })
                        return Promise.reject(`tokenNoPermission`)
                    }

                    //getAndVerifyClientUser
                    let user = await getAndVerifyClientUser(token, 'getUserByToken')
                    // console.log('user', user)

                    //check
                    if (!iseobj(user)) {
                        console.log('token', maskTok(token))
                        console.log('[API]getUserByToken/check user: invalid user')
                        srLog.error({ event: 'api/getUserByToken-error', msg: 'tokenNoPermission' })
                        return Promise.reject(`tokenNoPermission`)
                    }

                    //info
                    srLog.info({ event: 'api/getUserByToken-success', userId: get(user, 'id', '') })

                    return user
                }

                //pm2resolve core
                let r = await pm2resolve(core)() //w-ui-loginout接收已預設格式用pm2resolve轉過, 須另提取state進行判斷
                if (isErr(r.msg)) {
                    r.msg = r.msg.message
                }
                // console.log('getUserByToken', r)

                return r
            },
        },
        {
            method: 'GET',
            path: '/api/getPerm',
            handler: async function (req, res) {
                // console.log('getPerm', req)

                async function core() {
                    //提供對象為node與browser端, 須為client使用者, 須先檢測token是否有效, 再依照token取得使用者資訊物件, 再由其userId查詢回傳該使用者之權限資訊物件

                    //token
                    let token = get(req, 'query.token', '')
                    // console.log('token', token)

                    //check
                    if (!isestr(token)) {
                        console.log('req.query', maskQuery(get(req, 'query')))
                        console.log('token', maskTok(token))
                        console.log('[API]getPerm/check token: invalid token')
                        srLog.error({ event: 'api/getPerm-error', msg: 'tokenNoPermission' })
                        return Promise.reject(`tokenNoPermission`)
                    }

                    //getAndVerifyClientUser, 發起token的所屬使用者, 驗證僅對client使用者, 不得使用app使用者
                    let userSelf = await getAndVerifyClientUser(token, 'getPerm')
                    // console.log('userSelf', userSelf)

                    //check
                    if (!iseobj(userSelf)) {
                        console.log('token', maskTok(token))
                        console.log('[API]getPerm/check userSelf: invalid userSelf')
                        srLog.error({ event: 'api/getPerm-error', msg: 'tokenNoPermission' })
                        return Promise.reject(`tokenNoPermission`)
                    }

                    //userIdSelf, client使用者的userId
                    let userIdSelf = get(userSelf, 'id', '')
                    // console.log('userIdSelf', userIdSelf)

                    //check
                    if (!isestr(userIdSelf)) {
                        console.log('token', maskTok(token))
                        console.log('userSelf', userSelf)
                        console.log('[API]getPerm/check userIdSelf: invalid userIdSelf')
                        srLog.error({ event: 'api/getPerm-error', msg: 'tokenNoPermission' })
                        return Promise.reject(`tokenNoPermission`)
                    }

                    //getGenUserAndRulesByUserId, 查找到的client使用者與權限
                    let userWithRulesSelf = await getGenUserAndRulesByUserId(userIdSelf)
                    // console.log('getGenUserAndRulesByUserId', r)

                    //check
                    if (!iseobj(userWithRulesSelf)) {
                        console.log('token', maskTok(token))
                        console.log('userSelf', userSelf)
                        console.log('userIdSelf', userIdSelf)
                        console.log('[API]getPerm/check userWithRulesSelf: invalid userWithRulesSelf')
                        srLog.error({ event: 'api/getPerm-error', msg: 'tokenNoPermission' })
                        return Promise.reject(`tokenNoPermission`)
                    }

                    //info
                    srLog.info({ event: 'api/getPerm-success', userId: userIdSelf })

                    return userWithRulesSelf
                }

                //pm2resolve core
                let r = await pm2resolve(core)()
                if (isErr(r.msg)) {
                    r.msg = r.msg.message
                }
                // console.log('getPerm r', r)

                return r
            },
        },
        {
            method: 'GET',
            path: '/api/getPermUserInfor',
            handler: async function (req, res) {
                // console.log('getPermUserInfor', req)

                async function core() {
                    //提供對象為node端, 須為app使用者, 須先檢測token是否有效, 再由其userId查詢回傳該使用者權限資訊物件

                    //tokenSelf
                    let tokenSelf = get(req, 'query.token', '')
                    // console.log('token', token)

                    //check
                    if (!isestr(tokenSelf)) {
                        console.log('req.query', maskQuery(get(req, 'query')))
                        console.log('[API]getPermUserInfor/check tokenSelf: invalid tokenSelf')
                        srLog.error({ event: 'api/getPermUserInfor-error', msg: 'tokenNoPermission' })
                        return Promise.reject(`tokenNoPermission`)
                    }

                    //getAndVerifyAppUser, 發起token的所屬使用者, 驗證須為app使用者
                    let userSelf = await getAndVerifyAppUser(tokenSelf, 'getPermUserInfor')
                    // console.log('userSelf', userSelf)

                    //check
                    if (!iseobj(userSelf)) {
                        console.log('req.query', maskQuery(get(req, 'query')))
                        console.log('tokenSelf', maskTok(tokenSelf))
                        console.log('[API]getPermUserInfor/check userSelf: invalid userSelf')
                        srLog.error({ event: 'api/getPermUserInfor-error', msg: 'tokenNoPermission' })
                        return Promise.reject(`tokenNoPermission`)
                    }

                    //userIdFind, 欲查找使用者的userId
                    let userIdFind = get(req, 'query.userId', '')
                    // console.log('userIdFind', userIdFind)

                    //check
                    if (!isestr(userIdFind)) {
                        console.log('req.query', maskQuery(get(req, 'query')))
                        console.log('tokenSelf', maskTok(tokenSelf))
                        console.log('[API]getPermUserInfor/check userIdFind: invalid userIdFind')
                        srLog.error({ event: 'api/getPermUserInfor-error', msg: 'tokenNoPermission' })
                        return Promise.reject(`tokenNoPermission`)
                    }

                    //getGenUserAndRulesByUserId, 查找到的使用者與權限
                    let userWithRulesFind = await getGenUserAndRulesByUserId(userIdFind)
                    // console.log('getGenUserAndRulesByUserId', userWithRulesFind)

                    //check
                    if (!iseobj(userWithRulesFind)) {
                        console.log('userIdFind', userIdFind)
                        console.log('[API]getPermUserInfor/check userWithRulesFind: invalid userWithRulesFind')
                        srLog.error({ event: 'api/getPermUserInfor-error', msg: 'userIdNoPermrules' })
                        return Promise.reject(`userIdNoPermrules`)
                    }

                    //info
                    srLog.info({ event: 'api/getPermUserInfor-success', userId: userIdFind })

                    return userWithRulesFind
                }

                //pm2resolve core
                let r = await pm2resolve(core)() //w-ui-loginout接收已預設格式用pm2resolve轉過, 須另提取state進行判斷
                if (isErr(r.msg)) {
                    r.msg = r.msg.message
                }
                // console.log('getPermUserInfor', r)

                return r
            },
        },
        {
            method: 'POST',
            path: '/syncAndReplaceTabs',
            handler: async function (req, res) {
                // console.log('syncAndReplaceTabs', req)
                // console.log('syncAndReplaceTabs payload', req.payload)

                async function core() {
                    //提供對象為node使用者, 須為系統管理者, 須先檢測token是否有效, 再進行數據變更

                    //token
                    let token = get(req, 'query.token', '')

                    //check
                    if (!isestr(token)) {
                        console.log('req.query', maskQuery(get(req, 'query')))
                        console.log('token', maskTok(token))
                        console.log('[API]syncAndReplaceTabs/check token: invalid token')
                        srLog.error({ event: 'api/syncAndReplaceTabs-error', msg: 'tokenNoPermission' })
                        return Promise.reject(`tokenNoPermission`)
                    }

                    //keyTable
                    let keyTable = get(req, 'query.keyTable', '')

                    //check
                    if (!isestr(keyTable)) {
                        console.log('req.query', maskQuery(get(req, 'query')))
                        console.log('keyTable', keyTable)
                        console.log('[API]syncAndReplaceTabs/check keyTable: invalid keyTable')
                        srLog.error({ event: 'api/syncAndReplaceTabs-error', msg: 'tokenNoPermission' })
                        return Promise.reject(`tokenNoPermission`)
                    }

                    //check keyTable
                    let allowedTables = ['targets', 'pemis', 'grups', 'users']
                    if (!allowedTables.includes(keyTable)) {
                        console.log('[API]syncAndReplaceTabs/check keyTable: unexpected keyTable', keyTable)
                        srLog.error({ event: 'api/syncAndReplaceTabs-error', msg: 'invalidKeyTable', keyTable })
                        return Promise.reject(`invalidKeyTable`)
                    }

                    //getAndVerifyAppUser
                    let user = await getAndVerifyAppUser(token, 'syncAndReplaceTabs')

                    //check user
                    if (!iseobj(user)) {
                        console.log('token', maskTok(token))
                        console.log('[API]syncAndReplaceTabs/check user: invalid user')
                        srLog.error({ event: 'api/syncAndReplaceTabs-error', msg: 'tokenNoPermission' })
                        return Promise.reject(`tokenNoPermission`)
                    }

                    //userId
                    let userId = get(user, 'id', '')

                    //check userId
                    if (!isestr(userId)) {
                        console.log('token', maskTok(token))
                        console.log('user', user)
                        console.log('[API]syncAndReplaceTabs/check userId: invalid userId')
                        srLog.error({ event: 'api/syncAndReplaceTabs-error', msg: 'tokenNoPermission' })
                        return Promise.reject(`tokenNoPermission`)
                    }

                    //parsePayload
                    let inp = await parsePayload(req)

                    //syncAndReplaceTabs
                    let r = await sc.syncAndReplaceTabs(userId, inp, keyTable)

                    //info
                    srLog.info({ event: 'api/syncAndReplaceTabs-success', userId, keyTable })

                    return r
                }

                //pm2resolve core
                let r = await pm2resolve(core)()
                if (isErr(r.msg)) {
                    r.msg = r.msg.message
                }
                // console.log('syncAndReplaceTabs', r)

                return r
            },
        },
    ]


    //tableNamesExec, tableNamesSync
    let tableNamesExec = keys(ds)
    // let tableNamesSync = filter(tableNamesExec, (v) => {
    //     return strright(v, 5) !== 'Items'//不同步數據
    // })
    let tableNamesSync = tableNamesExec


    //WServHapiServer, w-serv-hapi 1.1.6 起設定錯誤於建構時同步拋出: 記 srLog(key)後轉拋(規則帳本 R-INIT-01, ADR-026)
    let optWServHapiServer = {
        port: serverPort,
        pathStaticFiles,
        apiName: 'api',
        apis,
        tokenType: 'Bearer',
        verifyConn: async ({ apiType, authorization, query, headers, req }) => {
            // console.log('verifyConn', `apiType[${apiType}]`, `authorization[${authorization}]`)

            //身分驗證責任(dspec/使用者身分驗證原則.md 第三節, 使用方套件標準註解): 框架(w-converhp、w-serv-hapi、w-serv-webdata、w-serv-orm)不驗證 token, 一律由本套件負責.
            //連線閘(verifyConn)與執行身分(getUserIdByToken)皆須完整驗證(token 有效、本系統使用者存在且啟用、部署方授權); hapi apis 路由各自驗證; 函數層級另檢查角色或成員(updateXxx 限 perm users 表之 isAdmin='y', requireAdmin); 公開入口只限列名者.
            //本函數: 驗連線標頭之 token(getAndVerifyClientUser: 外部 getUserByToken → perm users 存在且 isActive='y' → 部署方 verifyClientUser(user, apiType)).

            //token
            let token = strdelleft(authorization, 7) //刪除Bearer
            // console.log('token', token)

            //check
            if (!isestr(token)) {
                console.log('apiType', apiType)
                console.log('authorization', maskTok(authorization))
                console.log('invalid token')
                srLog.error({ event: 'verifyConn-error', ok: false, apiType, msg: 'tokenNoPermission' }) //認證失敗須入 log 供稽核/統計(CLAUDE.md「log 記錄要點」; 同 w-web-api、w-web-task); 只記 key, 不記 authorization 原值
                return false
            }

            //checkToken, 失敗一律回 false(傳輸層回 permission denied); reject 之 err key 記於 verifyConn log 之 msg
            let b = false
            let msg = ''
            await p.checkToken(token, apiType)
                .then(() => {
                    b = true
                })
                .catch((err) => {
                    msg = (typeof err === 'string') ? err : ((err && err.message) || 'checkTokenFail')
                })
            // console.log('b', b)

            //ip, 對齊sso慣例x-forwarded-for取第1個, fallback到req remoteAddress, 取不到則略過
            let ip = get(headers, 'x-forwarded-for', '').split(',')[0].trim()
            if (!isestr(ip)) {
                ip = get(req, 'info.remoteAddress', '') || get(req, 'socket.remoteAddress', '') || get(req, 'connection.remoteAddress', '')
            }

            //origin
            let origin = get(headers, 'origin', '')

            //referer, 只記 origin + pathname(ADR-023): 前端以 ?token= 開站(w-ui-loginout 讀完不清網址), 同源請求之 Referer 預設帶完整網址, 原樣記錄即把使用者權杖寫入 srLog
            let referer = maskUrl(get(headers, 'referer', ''))

            //info, 失敗時 msg 為 err key(cannotFindUserFromToken / cannotGetUserFromPerm / userNoPermission 等), 供資安稽核與統計
            if (b) {
                srLog.info({ event: 'verifyConn', ok: b, apiType, ip, origin, referer })
            }
            else {
                srLog.error({ event: 'verifyConn-error', ok: b, apiType, ip, origin, referer, msg })
            }

            return b
        },
        getUserIdByToken: async (token) => { //可使用async或sync函數
            // console.log('getUserIdByToken', token)

            //身分驗證責任(dspec/使用者身分驗證原則.md 第三節, 使用方套件標準註解; 規則 w-web呼叫者身分驗證.md 規則 4): 框架(w-converhp、w-serv-hapi、w-serv-webdata、w-serv-orm)不驗證 token, 一律由本套件負責.
            //連線閘(verifyConn)與執行身分(getUserIdByToken)皆須完整驗證(token 有效、本系統使用者存在且啟用、部署方授權); hapi apis 路由各自驗證; 函數層級另檢查角色或成員; 公開入口只限列名者.
            //本函數: 資料通道只傳遞 token, 反查使用者即驗證身分之步驟(w-serv-orm 1.1.10 起 ORM 層不做使用者檢查): 與連線閘同等完整——經 getAndVerifyClientUser(外部 getUserByToken → perm users 存在且 isActive='y' → 部署方 verifyClientUser),
            //任一關不過即 reject(框架據此不執行函數, fail-closed)並記 srLog, 不回顯 token 與使用者資料. 請求標頭與本體 __sysToken__ 縱為不同 token, 兩個身分亦各經完整驗證(框架不比對兩 token).
            //回傳 perm users 表內該使用者之 id(非外部 token 宣稱之 id): 稽核欄位(userId／userIdUpdate)與函數層級角色檢查(requireAdmin)皆以 perm 內之列為準; mappingBy 為 email／name 時兩者可不同.
            //from 取 'main': 本函數只在資料通道 RPC／表操作(apiType 'main')之執行身分反查時被框架呼叫(上傳下載通道無監聽), 與連線閘對同一請求所用之 apiType 一致, 使部署方 verifyClientUser 依 from 分流之政策兩處一致, 不引入新的 from 值.
            let user = null
            try {
                user = await getAndVerifyClientUser(token, 'main')
            }
            catch (err) {
                let key = toOutKey(err, 'cannotFindUserId') //已知語系鍵原樣(cannotFindUserFromToken／cannotGetUserFromPerm／userNoPermission 等), 其餘(ORM／I/O 原文、Error)一律 cannotFindUserId, 不外送原文
                srLog.error({ event: 'getUserIdByToken-error', msg: key })
                return Promise.reject(key)
            }
            let userId = get(user, 'id', '')
            if (!isestr(userId)) {
                srLog.error({ event: 'getUserIdByToken-error', msg: 'cannotFindUserId' })
                return Promise.reject(`cannotFindUserId`)
            }
            return userId
        },
        corsOrigins: ['*'],
        useDbOrm: true,
        kpOrm: woItems,
        //operOrm: procOrm 之包裝(輸入為 userId, tableName, methodName, input), ORM 拒絕之原文只入 srLog、對前端回 key(規則帳本 R-ORM-02)
        operOrm: wrapOperOrm(procOrm, { srLog }),
        tableNamesExec,
        //資料通道只開 select(ADR-026、ADR-015 Update; 規則帳本 R-WSD-01): 前端同步只用 select, 寫入一律經 kpFunExt 之 updateXxx(lockSave、表鎖、寫入前驗證、整表比對);
        //裸 insert/save/del/delAll 繞過上述不變式, 2026-10-14 起不開放(直呼回 invalid func[表名.方法]); 對自寫客戶端直呼裸表操作之部署方為行為變更(README Upgrade Notes)
        methodsExec: ['select'],
        //authorizeExec: w-serv-webdata 1.1.7 起 useDbOrm:true 必填; 只對已取得 userId 之 select 放行(methodsExec 之外之第二道), 拒絕記 srLog event 'authorizeExec'.
        //連線者身分之授權在 verifyConn(getAndVerifyClientUser), 此處不重做
        authorizeExec: createAuthorizeExec({ srLog }),
        tableNamesSync,
        kpFunExt: { //接收參數第1個為userId, 之後才是前端給予參數

            getWebInfor,

            //updateXxx 第 3 參 opt 為用戶端給之 { baseline, returnRows }(草稿載入基準, F-26, R-BASELINE-01; 是否於成功回傳附寫入後之列, 規格第 8 節), 其餘鍵一律不採納(pickKeysOnly 等為伺服端設定, 更不轉給 procOrm); 未給(舊客戶端)見 procCore 之處置
            //四個寫入函數皆先經 requireAdmin(函數層級角色檢查, perm-run03 範圍四): 非 perm users 表中有效之系統管理員 → userNotAdmin、零寫入
            updateTargets: async (userId, rows, opt) => {
                await requireAdmin(userId, 'updateTargets')
                return await pc.updateTargets(userId, rows, opt)
            },
            updatePemis: async (userId, rows, opt) => {
                await requireAdmin(userId, 'updatePemis')
                return await pc.updatePemis(userId, rows, opt)
            },
            updateGrups: async (userId, rows, opt) => {
                await requireAdmin(userId, 'updateGrups')
                return await pc.updateGrups(userId, rows, opt)
            },
            //updateUsers, modeEditUsers='for:grups' 時 API 與 UI 一致只採納既有使用者之 cgrups 變更, 身分欄/新增/刪除/順序以資料庫為準
            updateUsers: async (userId, rows, optClient) => {
                await requireAdmin(userId, 'updateUsers')
                let opt = pickClientOpt(optClient)
                if (modeEditUsers === 'for:grups') {
                    opt.pickKeysOnly = ['cgrups']
                }
                return await pc.updateUsers(userId, rows, opt)
            },

            getStaEvent: async (userId, timeLength, timeInterval) => {
                try {
                    let rs = await psi.getStaEvent(userId, timeLength, timeInterval)
                    srLog.info({ event: 'getStaEvent-success', userId })
                    return rs
                }
                catch (err) {
                    srLog.error({ event: 'getStaEvent-error', userId, msg: (typeof err === 'string') ? err : ((err && err.message) || 'cannotGetStaEvent') })
                    throw err
                }
            },

            getStaEventTable: async (userId) => {
                try {
                    let rs = await psi.getStaEventTable(userId)
                    srLog.info({ event: 'getStaEventTable-success', userId })
                    return rs
                }
                catch (err) {
                    srLog.error({ event: 'getStaEventTable-error', userId, msg: (typeof err === 'string') ? err : ((err && err.message) || 'cannotGetStaEventTable') })
                    throw err
                }
            },

        },
        //fpTableTags: 各資料表時間戳檔案(供前端判定是否需重新同步)。
        //w-serv-hapi 1.0.87 起之正式名稱; 舊名 fnTableTags 於該版之前傳下去等同未給(w-serv-webdata 只讀 fpTableTags),
        //故 1.0.86 及之前實際寫的是預設之 ./tableTags.json, 升版後改用本檔名。
        fpTableTags: 'tableTags-web-perm.json',
    }
    try {
        instWServHapiServer = new WServHapiServer(optWServHapiServer)
    }
    catch (err) {
        console.log(err)
        srLog.error({ event: 'WServHapiServer-init-error', msg: (err && err.message) || 'WServHapiServerInitFailed' })
        throw err
    }


    return instWServHapiServer
}


export default WWebPerm
