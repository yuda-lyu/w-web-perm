import path from 'path'
import fs from 'fs'
import get from 'lodash/get'
import keys from 'lodash/keys'
import iseobj from 'wsemi/src/iseobj.mjs'
import isestr from 'wsemi/src/isestr.mjs'
import ispint from 'wsemi/src/ispint.mjs'
import isfun from 'wsemi/src/isfun.mjs'
import ispm from 'wsemi/src/ispm.mjs'
import cint from 'wsemi/src/cint.mjs'
import strleft from 'wsemi/src/strleft.mjs'
import strright from 'wsemi/src/strright.mjs'
import strdelright from 'wsemi/src/strdelright.mjs'
import pm2resolve from 'wsemi/src/pm2resolve.mjs'
import fsIsFolder from 'wsemi/src/fsIsFolder.mjs'
import replace from 'wsemi/src/replace.mjs'
import WServHapiServer from 'w-serv-hapi/src/WServHapiServer.mjs'
import WServOrm from 'w-serv-orm/src/WServOrm.mjs'
import ds from '../src/schema/index.mjs'
import { getUserRules } from '../src/plugins/mShare.mjs'


/**
 * 基於hapi之API伺服器
 *
 * @class
 * @param {Function} WOrm 輸入資料庫ORM函數
 * @param {String} url 輸入資料庫連線字串，例如'mongodb://sername:password@$127.0.0.1:27017'
 * @param {String} db 輸入資料庫名稱字串
 * @param {Function} getUserByToken 輸入處理函數，函數會傳入使用者token，通過此函數處理後並回傳使用者資訊物件，並至少須提供'id'、'email'、'name'、'isAdmin'欄位，且'isAdmin'限輸入'y'或'n'，且輸入'y'時會複寫權限系統該使用者之'isAdmin'欄位值
 * @param {Object} [opt={}] 輸入設定物件，預設{}
 * @param {Integer} [opt.serverPort=11006] 輸入伺服器通訊port，預設11006
 * @param {Boolean} [opt.bCheckUser=false] 輸入是否檢查使用者資訊布林值，預設false
 * @param {Function} [opt.getUserById=null] 輸入當bCheckUser=true時依照使用者ID取得使用者資訊物件函數，預設null
 * @param {Boolean} [opt.bExcludeWhenNotAdmin=false] 輸入使用ORM的select方法時是否自動刪除數據內isActive欄位之布林值，預設false
 * @param {Object} [opt.webName={}] 輸入站台名稱物件，至少包含語系eng與cht鍵的名稱，預設{}
 * @param {Object} [opt.webDescription={}] 輸入站台描述物件，至少包含語系eng與cht鍵的名稱，預設{}
 * @param {String} [opt.webLogo=''] 輸入站台logo字串，採base64格式，預設''
 * @param {String} [opt.subfolder=''] 輸入站台所在子目錄字串，提供站台位於內網採反向代理進行服務時，故需支援位於子目錄情形，預設''
 * @param {String} [opt.mappingBy='email'] 輸入外部系統識別使用者token後所提供之資料物件，與權限系統之使用者資料物件，兩者間查找之對應欄位，可選'id'、'email'、'name'，預設'email'
 * @returns {Object} 回傳物件，其內server為hapi伺服器實體，wsrv為w-converhp的伺服器事件物件，wsds為w-serv-webdata的伺服器事件物件，可監聽error事件
 * @example

 */
function WWebPerm(WOrm, url, db, getUserByToken, opt = {}) {
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


    //serverPort
    let serverPort = get(opt, 'serverPort')
    if (!ispint(serverPort)) {
        serverPort = 11006
    }
    serverPort = cint(serverPort)


    //bCheckUser
    let bCheckUser = get(opt, 'bCheckUser', false)


    //getUserById
    let getUserById = get(opt, 'getUserById', null)


    //bExcludeWhenNotAdmin
    let bExcludeWhenNotAdmin = get(opt, 'bExcludeWhenNotAdmin', false)


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


    //mappingBy
    let mappingBy = get(opt, 'mappingBy', '')
    if (mappingBy !== 'id' && mappingBy !== 'email' && mappingBy !== 'name') {
        mappingBy = 'email'
    }


    //WServOrm
    let optWServOrm = {
        bCheckUser,
        getUserById,
        bExcludeWhenNotAdmin,
    }
    let wp = {}
    try {
        wp = WServOrm(ds, WOrm, url, db, optWServOrm)
    }
    catch (err) {
        console.log(err)
    }
    let { woItems, procOrm } = wp


    //getWebInfor
    let getWebInfor = (userId) => {
        return {
            webName,
            webDescription,
            webLogo,
        }
    }


    //getUsersList
    let getUsersList = async (userId, token) => {
        let rs = await woItems.users.select() //isActive為y或n都需要提供, 給前端編輯
        return rs
    }


    //getRuleGroupsList
    let getRuleGroupsList = async (userId, token) => {
        let rs = await woItems.ruleGroups.select()
        return rs
    }


    //getTargetsList
    let getTargetsList = async (userId, token) => {
        let rs = await woItems.targets.select()
        return rs
    }


    //parseToken
    let parseToken = (req) => {

        //token
        let token = get(req, 'query.token', '')
        // console.log('token', token)

        return token
    }


    //getTokenUserForSelf
    let getTokenUserForSelf = async(token) => {

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
            console.log('invalid userSelf')
            return null
        }

        //check userSelf
        if (true) {
            let id = get(userSelf, 'id', '')
            if (!isestr(id)) {
                console.log('invalid userSelf.id')
                return null
            }
            let email = get(userSelf, 'email', '')
            if (!isestr(email)) {
                console.log('invalid userSelf.email')
                return null
            }
            let name = get(userSelf, 'name', '')
            if (!isestr(name)) {
                console.log('invalid userSelf.name')
                return null
            }
            let isAdmin = get(userSelf, 'isAdmin', '')
            if (isAdmin !== 'y' && isAdmin !== 'n') {
                console.log('userSelf.isAdmin is not y or n')
                return null
            }
        }

        //須反查perm內users, 提供正規化屬性
        let vSelf = get(userSelf, mappingBy, '')
        // console.log('vSelf', vSelf)

        //check
        if (!isestr(vSelf)) {
            console.log('invalid vSelf')
            return null
        }

        //userFind
        let userFind = await woItems.users.select({ [mappingBy]: vSelf, isActive: 'y' })
        userFind = get(userFind, 0, null)
        // console.log('userFind', userFind)

        //複寫isAdmin
        let isAdminSrc = get(userSelf, 'isAdmin', '')
        let isAdminSelf = get(userFind, 'isAdmin', '')
        if (isAdminSrc !== isAdminSelf) {
            userFind.isAdmin = isAdminSelf
        }
        // console.log('userFind(isAdmin)', userFind)

        return userFind
    }


    //getGenUserByKV
    let getGenUserByKV = async(keyUser, valueUser) => {

        //userFind
        let userFind = await woItems.users.select({ [keyUser]: valueUser, isActive: 'y' })
        userFind = get(userFind, 0, null)

        //check
        if (!iseobj(userFind)) {
            return null
        }

        return userFind
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

        //ruleGroups
        let ruleGroups = await woItems.ruleGroups.select()
        // console.log('ruleGroups', ruleGroups)

        //targets
        let targets = await woItems.targets.select()
        // console.log('targets', targets)

        //getUserRules
        let urs = getUserRules(userFind, ruleGroups, targets)
        // console.log('getUserRules', urs)

        //check
        if (!iseobj(urs)) {
            console.log('can not get permrules', userId)
            return Promise.reject(`can not get permrules`)
        }

        return {
            user: {
                ...userFind,
                ruleGroupsNames: urs.ruleGroupsNames, //ruleGroupsNames併入user內顯示
            },
            rules: urs.rules,
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
        let fpEntryOut = path.resolve(pathStaticFiles, fnEntryOut)
        let c = fs.readFileSync(fpEntryIn, 'utf8')
        c = replace(c, '{sfd}', subfolder)
        fs.writeFileSync(fpEntryOut, c, 'utf8')
    }
    catch (err) {
        console.log(err)
        console.log(`can not generate ${fnEntryOut}`)
    }


    //apis
    let apis = [
        // {
        //     method: 'GET',
        //     path: '/api/someAPI',
        //     handler: async function (req, res) {

        //         // //token
        //         // let token = get(req, 'query.token', '')

        //         return 'someAPI'
        //     },
        // },
        {
            method: 'GET',
            path: '/getWebInfor',
            handler: async function (req, res) {
                return getWebInfor()
            },
        },
        {
            method: 'GET',
            path: '/api/getUserByToken', //名稱getUserByToken為w-ui-loginout預設值, 若要更改兩邊須同時修改
            handler: async function (req, res) {
                // console.log('getUserByToken', req)

                async function core() {
                    //提供對象為browser使用者, 且認定權限系統須系統管理員才能使用, 須先檢測token是否為系統管理員, 確認後回傳該使用者(系統管理員)資訊物件

                    //token
                    let token = get(req, 'query.token', '')
                    // console.log('token', token)

                    //getGenUserByUserId
                    let userSelf = await getTokenUserForSelf(token)
                    // console.log('userSelf', userSelf)

                    //check
                    if (get(userSelf, 'isAdmin') !== 'y') { //權限系統須系統管理員才能使用
                        return Promise.reject(`user does not have permission`)
                    }

                    return userSelf
                }

                //pm2resolve core
                let r = await pm2resolve(core)() //w-ui-loginout接收已預設格式用pm2resolve轉過, 須另提取state進行判斷
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
                    //提供對象為node與browser使用者, 須先檢測token是否有效, 再依照token取得使用者資訊物件, 再由其userId查詢回傳該使用者權限資訊物件

                    //parseToken
                    let token = parseToken(req)
                    // console.log('token', token)

                    //getGenUserByUserId
                    let userLogin = await getTokenUserForSelf(token)
                    // console.log('userLogin', userLogin)

                    //check
                    if (!iseobj(userLogin)) {
                        return Promise.reject(`user does not have permission`)
                    }

                    //parseUserId
                    let userId = get(userLogin, 'id', '')
                    // console.log('userId', userId)

                    //check
                    if (!isestr(userId)) {
                        return Promise.reject(`invalid user`)
                    }

                    //getGenUserAndRulesByUserId
                    let r = await getGenUserAndRulesByUserId(userId)
                    // console.log('getGenUserAndRulesByUserId', r)

                    //check
                    if (!iseobj(r)) {
                        return Promise.reject(`user does not have permrules`)
                    }

                    return r
                }

                //pm2resolve core
                let r = await pm2resolve(core)()
                // console.log('getPerm r', r)

                return r
            },
        },
        {
            method: 'GET',
            path: '/api/getPermById',
            handler: async function (req, res) {
                // console.log('getPermById', req)

                async function core() {
                    //提供對象為node使用者, 且認定權限系統須系統管理員才能使用, 須先檢測token是否為系統管理員, 再由query取得欲查詢的使用者userId, 再由其userId查詢回傳該使用者權限資訊物件

                    //token
                    let token = get(req, 'query.token', '')
                    // console.log('token', token)

                    //getGenUserByUserId
                    let userSelf = await getTokenUserForSelf(token)
                    // console.log('userSelf', userSelf)

                    //check
                    if (get(userSelf, 'isAdmin') !== 'y') { //權限系統須系統管理員才能使用
                        return Promise.reject(`user does not have permission`)
                    }

                    //userId
                    let userId = get(req, 'query.userId', '')
                    // console.log('userId', userId)

                    //getGenUserAndRulesByUserId
                    let r = await getGenUserAndRulesByUserId(userId)
                    // console.log('getGenUserAndRulesByUserId', r)

                    //check
                    if (!iseobj(r)) {
                        return Promise.reject(`user does not have permrules`)
                    }

                    return r
                }

                //pm2resolve core
                let r = await pm2resolve(core)() //w-ui-loginout接收已預設格式用pm2resolve轉過, 須另提取state進行判斷
                // console.log('getUserByToken', r)

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


    //WServHapiServer
    instWServHapiServer = new WServHapiServer({
        port: opt.serverPort,
        pathStaticFiles,
        apis,
        getUserIDFromToken: async (token) => { //可使用async或sync函數
            return ''
        },
        useDbORM: true,
        dbORMs: woItems,
        operORM: procOrm, //procOrm的輸入為: userId, tableName, methodName, input
        tableNamesExec,
        methodsExec: ['select', 'insert', 'save', 'del', 'delAll'], //mix需於procOrm內註冊以提供
        tableNamesSync,
        extFuncs: { //接收參數第1個為userId, 之後才是前端給予參數
            getWebInfor,
            getUsersList,
            getRuleGroupsList,
            getTargetsList,
            //...
        },
        hookBefores: null,
        hookAfters: null,
        fnTableTags: 'tableTags-web-perm.json',
    })


    return instWServHapiServer
}


export default WWebPerm