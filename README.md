# w-web-perm
A web service for permissions.

![language](https://img.shields.io/badge/language-JavaScript-orange.svg) 
[![npm version](http://img.shields.io/npm/v/w-web-perm.svg?style=flat)](https://npmjs.org/package/w-web-perm) 
[![license](https://img.shields.io/npm/l/w-web-perm.svg?style=flat)](https://npmjs.org/package/w-web-perm) 
[![npm download](https://img.shields.io/npm/dt/w-web-perm.svg)](https://npmjs.org/package/w-web-perm) 
[![npm download](https://img.shields.io/npm/dm/w-web-perm.svg)](https://npmjs.org/package/w-web-perm) 
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
import WOrm from 'w-orm-lmdb/src/WOrmLmdb.mjs'
import WWebPerm from './server/WWebPerm.mjs'
import getSettings from './g_getSettings.mjs'


//st
let st = getSettings()

let url = st.dbUrl
let db = st.dbName
let opt = {

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
    console.log('invalid token') //勿印權杖值
    console.log('於生產環境時得加入SSO等驗證token機制')
    return {}
}

let verifyClientUser = (user, from) => {
    console.log('verifyClientUser/user', user)
    // return false //測試無法登入
    console.log('於生產環境時得加入限制瀏覽器使用者身份機制')
    return user.isAdmin === 'y' //測試僅系統管理者使用
}

let verifyAppUser = (user, from) => {
    console.log('verifyAppUser/user', user)
    // return false //測試無法登入
    console.log('於生產環境時得加入限制應用程式使用者身份機制')
    return user.isAdmin === 'y' //測試僅系統管理者使用
}

//WWebPerm
let instWWebPerm = WWebPerm(WOrm, url, db, getUserByToken, verifyClientUser, verifyAppUser, opt)

instWWebPerm.on('error', (err) => {
    console.log(err)
})
```

## Upgrade Notes

### Upgrading to w-serv-orm 1.1.11 / w-syslog 1.0.33 (2026-10-14)
- **Numeric ids are stored as strings**: a numeric row id sent to `/syncAndReplaceTabs` (or to `updatePemis`, `updateGrups`, `updateUsers`) is stored as its string form (`123` is stored as `'123'`) and the success response lists it as a string. Before, the number was replaced by a generated id while the response still showed the number. A number and its string form are the same id; `NaN` and `Infinity` count as no id (a new id is generated). `updateTargets` still accepts string ids only and rejects other ids with `saveRowFieldInvalid`.
- **Ids owned by another source are rejected**: if an id pushed to `/syncAndReplaceTabs` already belongs to another `from`, the whole push is rejected with `invalidRows` before anything is deleted (before, the row was skipped while the push still returned success). External applications must use ids that do not overlap with other sources.
- **Logging**: with w-syslog 1.0.33, a log write failure no longer terminates the process (it is reported on stderr), and `WWebPerm` throws at construction when `opt.logFd` cannot be created.
- **Bundled usage**: the statistics worker file is located on first use from the installed package (`server/staLogs/staLogsCore.shellWorker.mjs`), so `dist/w-web-perm.umd.js` and downstream bundles can run the statistics; the package must be installed with its `server` folder.

### Upgrading to w-serv-orm 1.1.10 / w-serv-hapi 1.1.6 (2026-10-14)
- **Removed options**: `opt.useCheckUser`, `opt.getUserById` and `opt.useExcludeWhenNotAdmin` were removed together with w-serv-orm 1.1.9. Passing any value other than `undefined`, `null` or `false` now throws when constructing `WWebPerm` (the message comes from w-serv-orm `checkOptRemoved`) and is logged to srLog. Delete these keys; users of the data channel are authorized by `verifyConn` (`verifyClientUser`), no replacement option is needed.
- **Data channel is select-only (behavior change)**: only `<table>.select` of `targets`, `pemis`, `grups` and `users` is exposed (`methodsExec: ['select']`, and `authorizeExec` allows select only). Calling raw `insert`, `save`, `del` or `delAll` now returns `invalid func[<table>.<method>]`. Clients that wrote tables directly must call `updateTargets`, `updatePemis`, `updateGrups` or `updateUsers`, which apply the save lock, serialization, validation and whole-table diff.
- **Write validation**: rows to be written are validated before anything is deleted or written. A string value that XSS cleaning would rewrite (for example `<` followed by a letter) is rejected with `htmlMarkupNotAllowed`; an id longer than 1978 UTF-8 bytes is rejected with `saveRowFieldInvalid` (admin lists) or `invalidRows` (`syncAndReplaceTabs`). Unexpected database write failures return `saveWriteFail`; the ORM messages are written to srLog only.
- **Process-level errors**: w-serv-hapi 1.1.6 no longer registers `unhandledRejection` or `uncaughtException` handlers, and `WWebPerm` does not register them either; the deployment decides its own process policy.
