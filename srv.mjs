import fs from 'fs'
import JSON5 from 'json5'
import WOrm from 'w-orm-lmdb/src/WOrmLmdb.mjs'
import WWebPerm from './server/WWebPerm.mjs'
import getSettings from './g_getSettings.mjs'


//st(DB 設定)
let st = getSettings()

let url = st.dbUrl
let db = st.dbName

//app 設定來源: argv[2] 指定之 settings 檔(供 e2e restartBackend 注入不同語系等), 預設 ./settings.json.(對齊 SSO srv.mjs)
//JSON5 格式(無引號鍵 / 單引號 / 註解 / 尾逗號); language / webName / modeEdit* / webLogo 等資料設定皆在此檔.
let pathSettings = process.argv[2] || './settings.json'
let appSt = JSON5.parse(fs.readFileSync(pathSettings, 'utf8'))

let opt = {

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
    if (token === '{token-for-peter}') { //測試用: 在 perm users 表內、有效、但非系統管理者之瀏覽使用者(供 api 測試驗證 verifyClientUser 對資料通道亦生效)
        return {
            id: 'id-for-peter',
            name: 'peter',
            email: 'peter@example.com',
            isAdmin: 'n',
        }
    }
    if (process.env.NODE_ENV !== 'production') { //測試用權杖(非 production 才有), 供 test/api-tokenSafety 驗證注入函數失敗時不外洩(W 契約, spec/設計要點與取捨.md ADR-023)
        if (token === '{token-for-reject}') { //模擬部署方以舊版 w-web-sso helper(≤1.1.4)注入: 失敗時 reject 之字串含已代入系統介接權杖(合成秘密)與使用者權杖之完整網址
            return Promise.reject(`can not get user data by url[http://127.0.0.1:11007/api/getSsoUserInfor?token=SYNTH-SYS-SECRET-FOR-TEST&key=token&value=${token}]`)
        }
        if (token === '{token-for-admin2}') { //測試用(perm-run03 範圍三): 第二位系統管理員, 供「標頭 token 與本體 __sysToken__ 為不同使用者」「本體 token 之使用者被停用」等 getUserIdByToken 完整驗證案例(其 perm users 列由測試自行建立／停用)
            return {
                id: 'id-for-admin2',
                name: 'admin2',
                email: 'admin2@example.com',
                isAdmin: 'y',
            }
        }
        if (token === '{token-for-member}') { //測試用(perm-run03 範圍四): 在 perm users 表內(測試自行建立)、有效、isAdmin='n' 但**通過** verifyClientUser(見下方)之瀏覽使用者, 供「通過連線閘之非管理員呼叫寫入函數被 requireAdmin 拒收」案例
            return {
                id: 'id-for-member',
                name: 'member',
                email: 'member@example.com',
                isAdmin: 'n',
            }
        }
        if (token === '{token-for-verify-throw}') { //回有效使用者, 但 verifyClientUser / verifyAppUser 對其拋錯(Error.message 為合成秘密), 模擬部署方驗證函數拋錯
            return {
                id: 'id-for-verify-throw',
                name: 'verify-throw',
                email: 'verify-throw@example.com',
                isAdmin: 'y',
            }
        }
    }
    console.log('invalid token') //不印權杖值(ADR-023)
    return {}
}

let verifyClientUser = (user, from) => {
    // console.log('verifyClientUser/user', user)
    // console.log('於生產環境時得加入限制瀏覽器使用者身份機制')
    // return false //測試無法登入
    if (process.env.NODE_ENV !== 'production' && user.id === 'id-for-verify-throw') { //測試用: 見 getUserByToken 之 '{token-for-verify-throw}'
        throw new Error('SYNTH-VERIFY-SECRET-FOR-TEST')
    }
    if (process.env.NODE_ENV !== 'production' && user.id === 'id-for-member') { //測試用: 見 getUserByToken 之 '{token-for-member}'(部署方放行非管理員, 套件仍須於函數層級另檢查角色)
        return true
    }
    return user.isAdmin === 'y' //測試僅系統管理者使用
}

let verifyAppUser = (user, from) => {
    // console.log('verifyAppUser/user', user)
    // console.log('於生產環境時得加入限制應用程式使用者身份機制')
    // return false //測試無法登入
    if (process.env.NODE_ENV !== 'production' && user.id === 'id-for-verify-throw') { //測試用: 見 getUserByToken 之 '{token-for-verify-throw}'
        throw new Error('SYNTH-VERIFY-SECRET-FOR-TEST')
    }
    return user.isAdmin === 'y' //測試僅系統管理者使用
}

//WWebPerm
let instWWebPerm = WWebPerm(WOrm, url, db, getUserByToken, verifyClientUser, verifyAppUser, opt)

instWWebPerm.on('error', (err) => {
    console.log(err)
})

//node srv.mjs
//node srv.mjs <pathSettings>  //指定 settings 檔(e2e 注入語系用)
