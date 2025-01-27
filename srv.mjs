import WOrm from 'w-orm-mongodb/src/WOrmMongodb.mjs' //自行選擇引用ORM, 使用Mongodb測試
import WWebPerm from './server/WWebPerm.mjs'
import getSettings from './g.getSettings.mjs'


//st
let st = getSettings()

let url = `mongodb://${st.dbUsername}:${st.dbPassword}@${st.dbIP}:${st.dbPort}` //使用Mongodb測試
let db = st.dbName
let opt = {

    bCheckUser: false,
    getUserById: null,
    bExcludeWhenNotAdmin: false,

    serverPort: 11006,
    subfolder: '', //mperm
    urlRedirect: 'https://www.google.com/', //本機測試時得先編譯, 再瀏覽: http://localhost:11006/
    showModeEditTargets: 'y', //'n',
    showModeEditPemis: 'y',
    showModeEditGrups: 'y',
    showModeEditUsers: 'y',
    modeEditTargets: 'y', //'n',
    modeEditPemis: 'y',
    modeEditGrups: 'y',
    modeEditUsers: 'y',

    webName: {
        'eng': 'Permission Service',
        'cht': '權限管理系統',
    },
    webDescription: {
        'eng': 'A web service package for user permissions and management targets.',
        'cht': '基於簡易分層架構來給予與設定使用者所需之權限及群組管理功能',
    },
    webLogo: 'data:image/svg+xml;base64,PHN2ZyBmaWxsPSJub25lIiBoZWlnaHQ9IjQ4IiB3aWR0aD0iNDgiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZD0iTTQ4IDBIMHY0OGg0OFYwWiIgZmlsbD0iI2ZmZiIgZmlsbC1vcGFjaXR5PSIuMDEiLz48cGF0aCBkPSJNMzcuODU2IDIwdjhNMjcuNDY0IDM4bDMuNDY0LTIgMy40NjQtMk0yMC41MzYgMzhsLTMuNDY1LTItMy40NjQtMk0xMC4xNDQgMjB2OE0xMy42MDcgMTRsMy40NjUtMiAzLjQ2NC0yTTI3LjQ2NCAxMGwzLjQ2NCAyIDMuNDY0IDIiIHN0cm9rZT0iI0ZGOTgwMCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIiBzdHJva2Utd2lkdGg9IjIiLz48cGF0aCBkPSJNMjQgNDRhNCA0IDAgMSAwIDAtOCA0IDQgMCAwIDAgMCA4Wk0yNCAxMmE0IDQgMCAxIDAgMC04IDQgNCAwIDAgMCAwIDhaTTI0IDI4YTQgNCAwIDEgMCAwLTggNCA0IDAgMCAwIDAgOFpNMzggMjBhNCA0IDAgMSAwIDAtOCA0IDQgMCAwIDAgMCA4Wk0zOCAzNmE0IDQgMCAxIDAgMC04IDQgNCAwIDAgMCAwIDhaTTEwIDIwYTQgNCAwIDEgMCAwLTggNCA0IDAgMCAwIDAgOFpNMTAgMzZhNCA0IDAgMSAwIDAtOCA0IDQgMCAwIDAgMCA4WiIgZmlsbD0iI0ZGRTBCMiIgc3Ryb2tlPSIjRkY5ODAwIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIHN0cm9rZS13aWR0aD0iMiIvPjwvc3ZnPg==',

}

let getUserByToken = async (token) => {
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
    console.log('於生產環境時得加入SSO等驗證token機制')
    return {}
}

let verifyBrowserUser = (user, caller) => {
    console.log('verifyBrowserUser/user', user)
    // return false //測試無法登入
    console.log('於生產環境時得加入限制瀏覽器使用者身份機制')
    return user.isAdmin === 'y' //測試僅系統管理者使用
}

let verifyAppUser = (user, caller) => {
    console.log('verifyAppUser/user', user)
    // return false //測試無法登入
    console.log('於生產環境時得加入限制應用程式使用者身份機制')
    return user.isAdmin === 'y' //測試僅系統管理者使用
}

//WWebPerm
let instWWebPerm = WWebPerm(WOrm, url, db, getUserByToken, verifyBrowserUser, verifyAppUser, opt)

instWWebPerm.on('error', (err) => {
    console.log(err)
})


//node --experimental-modules srv.mjs
