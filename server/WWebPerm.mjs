import path from 'path'
import fs from 'fs'
import get from 'lodash/get'
import each from 'lodash/each'
import keys from 'lodash/keys'
import iseobj from 'wsemi/src/iseobj.mjs'
import isestr from 'wsemi/src/isestr.mjs'
import ispint from 'wsemi/src/ispint.mjs'
import isearr from 'wsemi/src/isearr.mjs'
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
import WServHapiServer from 'w-serv-hapi/src/WServHapiServer.mjs'
import WServOrm from 'w-serv-orm/src/WServOrm.mjs'
import ds from '../src/schema/index.mjs'
import { getUserRules } from '../src/plugins/mShare.mjs'


/**
 * 權限伺服器
 *
 * @class
 * @param {Function} WOrm 輸入資料庫ORM函數
 * @param {String} url 輸入資料庫連線字串，例如'mongodb://sername:password@$127.0.0.1:27017'
 * @param {String} db 輸入資料庫名稱字串
 * @param {Function} getUserByToken 輸入處理函數，函數會傳入使用者token，通過此函數處理後並回傳使用者資訊物件，並至少須提供'id'、'email'、'name'、'isAdmin'欄位，且'isAdmin'限輸入'y'或'n'，且輸入'y'時會複寫權限系統該使用者之'isAdmin'欄位值
 * @param {Function} verifyBrowserUser 輸入驗證瀏覽使用者身份之處理函數，函數會傳入使用者資訊物件，通過此函數識別後回傳布林值，允許使用者回傳true，反之回傳false
 * @param {Function} verifyAppUser 輸入驗證應用程序使用者身份之處理函數，函數會傳入使用者資訊物件，通過此函數識別後回傳布林值，允許使用者回傳true，反之回傳false
 * @param {Object} [opt={}] 輸入設定物件，預設{}
 * @param {Integer} [opt.serverPort=11006] 輸入伺服器通訊port，預設11006
 * @param {Boolean} [opt.bCheckUser=false] 輸入是否檢查使用者資訊布林值，預設false
 * @param {Function} [opt.getUserById=null] 輸入當bCheckUser=true時依照使用者ID取得使用者資訊物件函數，預設null
 * @param {Boolean} [opt.bExcludeWhenNotAdmin=false] 輸入使用ORM的select方法時是否自動刪除數據內isActive欄位之布林值，預設false
 * @param {Object} [opt.webName={}] 輸入站台名稱物件，至少包含語系eng與cht鍵的名稱，預設{}
 * @param {Object} [opt.webDescription={}] 輸入站台描述物件，至少包含語系eng與cht鍵的名稱，預設{}
 * @param {String} [opt.webLogo=''] 輸入站台logo字串，採base64格式，預設''
 * @param {String} [opt.subfolder=''] 輸入站台所在子目錄字串，提供站台位於內網採反向代理進行服務時，故需支援位於子目錄情形，預設''
 * @param {String} [opt.urlRedirect=''] 輸入錯誤時自動轉址字串，提供站台例如無法登入或驗證失敗時須自動轉址，預設''
 * @param {String} [opt.mappingBy='email'] 輸入外部系統識別使用者token後所提供之資料物件，與權限系統之使用者資料物件，兩者間查找之對應欄位，可選'id'、'email'、'name'，預設'email'
 * @returns {Object} 回傳物件，其內server為hapi伺服器實體，wsrv為w-converhp的伺服器事件物件，wsds為w-serv-webdata的伺服器事件物件，可監聽error事件
 * @example
 *
 * import WOrm from 'w-orm-mongodb/src/WOrmMongodb.mjs' //自行選擇引用ORM, 使用Mongodb測試
 * import WWebPerm from './server/WWebPerm.mjs'
 * import getSettings from './g.getSettings.mjs'
 *
 *
 * //st
 * let st = getSettings()
 *
 * let url = `mongodb://${st.dbUsername}:${st.dbPassword}@${st.dbIP}:${st.dbPort}` //使用Mongodb測試
 * let db = st.dbName
 * let opt = {
 *
 *     bCheckUser: false,
 *     getUserById: null,
 *     bExcludeWhenNotAdmin: false,
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
 *     console.log('invalid token', token)
 *     console.log('於生產環境時得加入SSO等驗證token機制')
 *     return {}
 * }
 *
 * let verifyBrowserUser = (user, caller) => {
 *     console.log('verifyBrowserUser/user', user)
 *     // return false //測試無法登入
 *     console.log('於生產環境時得加入限制瀏覽器使用者身份機制')
 *     return user.isAdmin === 'y' //測試僅系統管理者使用
 * }
 *
 * let verifyAppUser = (user, caller) => {
 *     console.log('verifyAppUser/user', user)
 *     // return false //測試無法登入
 *     console.log('於生產環境時得加入限制應用程式使用者身份機制')
 *     return user.isAdmin === 'y' //測試僅系統管理者使用
 * }
 *
 * //WWebPerm
 * let instWWebPerm = WWebPerm(WOrm, url, db, getUserByToken, verifyBrowserUser, verifyAppUser, opt)
 *
 * instWWebPerm.on('error', (err) => {
 *     console.log(err)
 * })
 *
 */
function WWebPerm(WOrm, url, db, getUserByToken, verifyBrowserUser, verifyAppUser, opt = {}) {
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


    //check verifyBrowserUser
    if (!isfun(verifyBrowserUser)) {
        console.log('invalid verifyBrowserUser', verifyBrowserUser)
        throw new Error('invalid verifyBrowserUser')
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


    //urlRedirect
    let urlRedirect = get(opt, 'urlRedirect', '')


    //mappingBy
    let mappingBy = get(opt, 'mappingBy', '')
    if (mappingBy !== 'id' && mappingBy !== 'email' && mappingBy !== 'name') {
        mappingBy = 'email'
    }
    // console.log('mappingBy', mappingBy)


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


    //getTokenUser
    let getTokenUser = async(token) => {

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
            console.log(`token`, token)
            console.log(`can not find the user from token`)
            return Promise.reject(`can not find the user from token`)
        }

        //check userSelf
        if (true) {
            let id = get(userSelf, 'id', '')
            if (!isestr(id)) {
                console.log('userSelf', userSelf)
                console.log('can not get the userId')
                return Promise.reject(`can not get the userId`)
            }
            let email = get(userSelf, 'email', '')
            if (!isestr(email)) {
                console.log('userSelf', userSelf)
                console.log('can not get the email of user')
                return Promise.reject(`can not get the email of user`)
            }
            let name = get(userSelf, 'name', '')
            if (!isestr(name)) {
                console.log('userSelf', userSelf)
                console.log('can not get userName')
                return Promise.reject(`can not get userName`)
            }
            let isAdmin = get(userSelf, 'isAdmin', '')
            if (isAdmin !== 'y' && isAdmin !== 'n') {
                console.log('userSelf', userSelf)
                console.log('userSelf.isAdmin is not y or n', userSelf.isAdmin)
                console.log('can not get the role of user')
                return Promise.reject(`can not get the role of user`)
            }
        }

        //須反查perm內users, 提供正規化屬性
        let vSelf = get(userSelf, mappingBy, '')
        // console.log('vSelf', vSelf)

        //check
        if (!isestr(vSelf)) {
            console.log('userSelf', userSelf)
            console.log('mappingBy', mappingBy)
            console.log('can not get the prop of user by mappingBy')
            return Promise.reject(`can not get the prop of user by mappingBy`)
        }

        //userFind
        let userFind = await woItems.users.select({ [mappingBy]: vSelf, isActive: 'y' })
        userFind = get(userFind, 0, null)
        // console.log('userFind', userFind)

        //check
        if (!iseobj(userFind)) {
            console.log('userSelf', userSelf)
            console.log('mappingBy', mappingBy)
            console.log('can not get the user from perm')
            return Promise.reject(`can not get the user from perm`)
        }

        //複寫isAdmin
        let isAdminSrc = get(userSelf, 'isAdmin', '')
        let isAdminSelf = get(userFind, 'isAdmin', '')
        if (isAdminSrc !== isAdminSelf) {
            userFind.isAdmin = isAdminSelf
        }
        // console.log('userFind(isAdmin)', userFind)

        return userFind
    }


    //getAndVerifyBrowserTokenUser
    let getAndVerifyBrowserTokenUser = async (token, caller = '') => {

        //getTokenUser
        let userSelf = await getTokenUser(token)

        //verifyBrowserUser
        let b = verifyBrowserUser(userSelf, caller)
        if (ispm(b)) {
            b = await b
        }

        //check
        if (!b) {
            console.log('userSelf', userSelf)
            console.log(`user does not have permission`)
            return Promise.reject(`user does not have permission`)
        }

        return userSelf
    }


    //getAndVerifyAppTokenUser
    let getAndVerifyAppTokenUser = async (token, caller = '') => {

        //getTokenUser
        let userSelf = await getTokenUser(token)

        //verifyAppUser
        let b = verifyAppUser(userSelf, caller)
        if (ispm(b)) {
            b = await b
        }

        //check
        if (!b) {
            console.log('userSelf', userSelf)
            console.log(`user does not have permission`)
            return Promise.reject(`user does not have permission`)
        }

        return userSelf
    }


    //parsePayload
    let parsePayload = async (req, key) => {

        //inp
        let inp = get(req, 'payload')

        //to obj
        if (isestr(inp)) {
            inp = j2o(inp)
        }

        //check
        if (!iseobj(inp)) {
            console.log('inp', inp)
            console.log('invalid inp from req')
            return Promise.reject(`invalid inp from req`)
        }

        //from
        let from = get(inp, 'from', '')

        //check
        if (!isestr(from)) {
            console.log('inp', inp)
            console.log('from', from)
            console.log('invalid from from inp')
            return Promise.reject(`invalid from from inp`)
        }


        //vs
        let vs = get(inp, key, [])
        //users
        //targets
        //ruleGroups

        //check
        if (!isearr(vs)) {
            console.log('inp', inp)
            console.log(key, vs)
            console.log(`invalid ${key} from inp`)
            return Promise.reject(`invalid ${key} from inp`)
        }

        //resave
        inp = {
            from,
            [key]: vs,
        }

        return inp
    }


    //syncAndReplaceRows
    let syncAndReplaceRows = async (params, key) => {

        //from
        let from = get(params, 'from', '')
        // console.log('from', from)

        //check
        if (!isestr(from)) {
            console.log('params', params)
            console.log('from', from)
            console.log(`invalid from`)
            return Promise.reject(`invalid from`)
        }

        //vs
        let vs = get(params, key, [])
        // console.log(key, vs)

        //check
        if (!isearr(vs)) {
            console.log('params', params)
            console.log(key, vs)
            console.log(`invalid ${key}`)
            return Promise.reject(`invalid ${key}`)
        }

        //save from
        each(vs, (v, k) => {
            vs[k].from = from
        })

        //delAll from
        await woItems[key].delAll({ from })

        //insert
        let r = await woItems[key].insert(vs)

        return r
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
            console.log('userId', userId)
            console.log(`can not get permrules`)
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
                    //提供對象為browser使用者, 須先檢測token是否有效, 確認後回傳該使用者之資訊物件

                    //token
                    let token = get(req, 'query.token', '')
                    // console.log('token', token)

                    //getAndVerifyBrowserTokenUser
                    let userSelf = await getAndVerifyBrowserTokenUser(token, 'getUserByToken')
                    // console.log('userSelf', userSelf)

                    //check
                    if (!iseobj(userSelf)) {
                        console.log('token', token)
                        console.log('[API]getUserByToken/check userSelf: invalid userSelf')
                        console.log(`token does not have permission`)
                        return Promise.reject(`token does not have permission`)
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
                    //提供對象為node與browser使用者, node實際也為轉發之browser使用者, 須先檢測token是否有效, 再依照token取得使用者資訊物件, 再由其userId查詢回傳該使用者之權限資訊物件

                    //parseToken
                    let token = parseToken(req)
                    // console.log('token', token)

                    //getAndVerifyBrowserTokenUser
                    let userLogin = await getAndVerifyBrowserTokenUser(token, 'getPerm')
                    // console.log('userLogin', userLogin)

                    //check
                    if (!iseobj(userLogin)) {
                        console.log('token', token)
                        console.log('[API]getPerm/check userLogin: invalid userLogin')
                        console.log(`token does not have permission`)
                        return Promise.reject(`token does not have permission`)
                    }

                    //parseUserId
                    let userId = get(userLogin, 'id', '')
                    // console.log('userId', userId)

                    //check
                    if (!isestr(userId)) {
                        console.log('userLogin', userLogin)
                        console.log('[API]getPerm/check userId: invalid userId')
                        console.log(`token does not have permission`)
                        return Promise.reject(`token does not have permission`)
                    }

                    //getGenUserAndRulesByUserId
                    let r = await getGenUserAndRulesByUserId(userId)
                    // console.log('getGenUserAndRulesByUserId', r)

                    //check
                    if (!iseobj(r)) {
                        console.log('userLogin', userLogin)
                        console.log('[API]getPerm/getGenUserAndRulesByUserId: user does not have permrules')
                        console.log(`token does not have permission`)
                        return Promise.reject(`token does not have permission`)
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
                    //提供對象為node使用者, 須為系統管理者, 須先檢測token是否有效, 再由query取得欲查詢的使用者userId, 再由其userId查詢回傳該使用者權限資訊物件

                    //token
                    let token = get(req, 'query.token', '')
                    // console.log('token', token)

                    //getAndVerifyAppTokenUser
                    let userSelf = await getAndVerifyAppTokenUser(token, 'getPermById')
                    // console.log('userSelf', userSelf)

                    //check
                    if (!iseobj(userSelf)) {
                        console.log('token', token)
                        console.log('[API]getPermById/check userSelf: invalid userSelf')
                        console.log(`token does not have permission`)
                        return Promise.reject(`token does not have permission`)
                    }

                    //userId
                    let userId = get(req, 'query.userId', '')
                    // console.log('userId', userId)

                    //getGenUserAndRulesByUserId
                    let r = await getGenUserAndRulesByUserId(userId)
                    // console.log('getGenUserAndRulesByUserId', r)

                    //check
                    if (!iseobj(r)) {
                        console.log('userSelf', userSelf)
                        console.log('[API]getPermById/getGenUserAndRulesByUserId: user does not have permrules')
                        console.log(`user does not have permrules`)
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
        {
            method: 'POST',
            path: '/syncAndReplaceUsers',
            handler: async function (req, res) {
                // console.log('syncAndReplaceUsers', req)
                // console.log('payload', req.payload)

                async function core() {
                    //提供對象為node使用者, 須為系統管理者, 須先檢測token是否有效, 再進行數據變更

                    //token
                    let token = get(req, 'query.token', '')

                    //getAndVerifyAppTokenUser
                    let user = await getAndVerifyAppTokenUser(token, 'syncAndReplaceUsers')

                    //check
                    if (!iseobj(user)) {
                        console.log('token', token)
                        console.log('[API]syncAndReplaceUsers/check user: invalid user')
                        console.log(`token does not have permission`)
                        return Promise.reject(`token does not have permission`)
                    }

                    //parsePayload
                    let inp = await parsePayload(req, 'users')

                    //syncAndReplaceRows
                    let r = await syncAndReplaceRows(inp, 'users')

                    return r
                }

                //pm2resolve core
                let r = await pm2resolve(core)()
                // console.log('verifyIdentity', r)

                return r
            },
        },
        {
            method: 'POST',
            path: '/syncAndReplaceTargets',
            handler: async function (req, res) {
                // console.log('syncAndReplaceTargets', req)
                // console.log('payload', req.payload)

                async function core() {
                    //提供對象為node使用者, 須為系統管理者, 須先檢測token是否有效, 再進行數據變更

                    //token
                    let token = get(req, 'query.token', '')

                    //getAndVerifyAppTokenUser
                    let user = await getAndVerifyAppTokenUser(token, 'syncAndReplaceTargets')

                    //check
                    if (!iseobj(user)) {
                        console.log('token', token)
                        console.log('[API]syncAndReplaceTargets/check user: invalid user')
                        console.log(`token does not have permission`)
                        return Promise.reject(`token does not have permission`)
                    }

                    //parsePayload
                    let inp = await parsePayload(req, 'targets')

                    //syncAndReplaceRows
                    let r = await syncAndReplaceRows(inp, 'targets')

                    return r
                }

                //pm2resolve core
                let r = await pm2resolve(core)()
                // console.log('verifyIdentity', r)

                return r
            },
        },
        {
            method: 'POST',
            path: '/syncAndReplaceRuleGroups',
            handler: async function (req, res) {
                // console.log('syncAndReplaceRuleGroups', req)
                // console.log('payload', req.payload)

                async function core() {
                    //提供對象為node使用者, 須為系統管理者, 須先檢測token是否有效, 再進行數據變更

                    //token
                    let token = get(req, 'query.token', '')

                    //getAndVerifyAppTokenUser
                    let user = await getAndVerifyAppTokenUser(token, 'syncAndReplaceRuleGroups')

                    //check
                    if (!iseobj(user)) {
                        console.log('token', token)
                        console.log('[API]syncAndReplaceRuleGroups/check user: invalid user')
                        console.log(`token does not have permission`)
                        return Promise.reject(`token does not have permission`)
                    }

                    //parsePayload
                    let inp = await parsePayload(req, 'ruleGroups')

                    //syncAndReplaceRows
                    let r = await syncAndReplaceRows(inp, 'ruleGroups')

                    return r
                }

                //pm2resolve core
                let r = await pm2resolve(core)()
                // console.log('verifyIdentity', r)

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
