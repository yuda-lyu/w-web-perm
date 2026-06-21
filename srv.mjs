import fs from 'fs'
import JSON5 from 'json5'
import WOrm from 'w-orm-lmdb/src/WOrmLmdb.mjs'
import WWebPerm from './server/WWebPerm.mjs'
import getSettings from './g.getSettings.mjs'


//st(DB 設定)
let st = getSettings()

let url = st.dbUrl
let db = st.dbName

//app 設定來源: argv[2] 指定之 settings 檔(供 e2e restartBackend 注入不同語系等), 預設 ./settings.json.(對齊 SSO srv.mjs)
//JSON5 格式(無引號鍵 / 單引號 / 註解 / 尾逗號); language / webName / modeEdit* / webLogo 等資料設定皆在此檔.
let pathSettings = process.argv[2] || './settings.json'
let appSt = JSON5.parse(fs.readFileSync(pathSettings, 'utf8'))

let opt = {

    useCheckUser: false,
    getUserById: null,
    useExcludeWhenNotAdmin: false,

    //serverPort / subfolder / urlRedirect / showLanguage / language / showModeEdit* / modeEdit* / webName / webDescription / webLogo / kpLangExt 皆由 settings.json 提供
    ...appSt,

}

let getUserByToken = async (token) => {
    // console.log('getUserByToken/token', token)
    // console.log('於生產環境時得加入SSO等驗證token機制')
    // return {} //測試無法登入
    if (token === '{token-for-application}') { //提供外部應用系統作為存取使用者
        return {
            id: 'id-for-application',
            name: 'application',
            email: 'application@example.com',
            isAdmin: 'y',
        }
    }
    if (token === 'sys') { //開發階段w-ui-loginout自動給予browser使用者(且位於localhost)的token為sys
        return {
            id: 'id-for-admin',
            name: 'admin',
            email: 'admin@example.com', //mappingBy為email, 開發階段時會使用email找到所建置之使用者資料
            isAdmin: 'y',
        }
    }
    console.log('invalid token', token)
    return {}
}

let verifyClientUser = (user, from) => {
    // console.log('verifyClientUser/user', user)
    // console.log('於生產環境時得加入限制瀏覽器使用者身份機制')
    // return false //測試無法登入
    return user.isAdmin === 'y' //測試僅系統管理者使用
}

let verifyAppUser = (user, from) => {
    // console.log('verifyAppUser/user', user)
    // console.log('於生產環境時得加入限制應用程式使用者身份機制')
    // return false //測試無法登入
    return user.isAdmin === 'y' //測試僅系統管理者使用
}

//WWebPerm
let instWWebPerm = WWebPerm(WOrm, url, db, getUserByToken, verifyClientUser, verifyAppUser, opt)

instWWebPerm.on('error', (err) => {
    console.log(err)
})

//node srv.mjs
//node srv.mjs <pathSettings>  //指定 settings 檔(e2e 注入語系用)
