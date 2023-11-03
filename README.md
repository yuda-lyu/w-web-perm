# w-web-perm
A web service for permissions.

![language](https://img.shields.io/badge/language-JavaScript-orange.svg) 
[![npm version](http://img.shields.io/npm/v/w-web-perm.svg?style=flat)](https://npmjs.org/package/w-web-perm) 
[![license](https://img.shields.io/npm/l/w-web-perm.svg?style=flat)](https://npmjs.org/package/w-web-perm) 
[![gzip file size](http://img.badgesize.io/yuda-lyu/w-web-perm/master/dist/w-web-perm-server.umd.js.svg?compression=gzip)](https://github.com/yuda-lyu/w-web-perm)
[![npm download](https://img.shields.io/npm/dt/w-web-perm.svg)](https://npmjs.org/package/w-web-perm) 
[![jsdelivr download](https://img.shields.io/jsdelivr/npm/hm/w-web-perm.svg)](https://www.jsdelivr.com/package/npm/w-web-perm)

## Documentation
To view documentation or get support, visit [docs](https://yuda-lyu.github.io/w-web-perm/WWebPerm.html).

## Installation
### Using npm(ES6 module):
```alias
npm i w-web-perm
```

#### Example for server:
> **Link:** [[dev source code](https://github.com/yuda-lyu/w-web-perm/blob/master/srv.mjs)]
```alias
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

    webName: {
        'eng': 'Permission Service',
        'cht': '權限管理系統',
    },
    webDescription: {
        'eng': 'A web service package for user permissions and management targets.',
        'cht': 'A web service package for user permissions and management targets.',
    },
    webLogo: 'data:image/svg+xml;base64,...',

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
            name: 'tester',
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
```
