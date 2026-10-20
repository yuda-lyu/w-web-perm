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

### Unreleased: objects carrying a numeric `length` key, and non-array `rows` (2026-10-20)
- **`rows` must be an array (behavior change)**: `updateTargets`, `updatePemis`, `updateGrups` and `updateUsers` now reject a `rows` argument that is not an array (a string, number, `null`, `undefined`, a plain object, or an object carrying a numeric `length` key), or whose elements are not non-empty objects (`[null]`, `[{}]`, `[""]`, `[[]]`), with `saveRowFieldInvalid` and leave the table unchanged. Previously such input was treated as an empty table: the whole table was cleared and the call reported success (in the `modeEditUsers: 'for:grups'` mode it was silently ignored). An empty array `[]` is still accepted (it clears the table). The bundled front end and `/syncAndReplaceTabs` (which already required a non-empty array) are not affected.
- **Objects are iterated by their own keys**: a field or key named `length` is an ordinary key everywhere user-supplied objects are walked (write validation, the `cgrups` / `cpemis` / `crules` JSON strings evaluated by `getPerm` / `getPermUserInfor`, and the list pages). Before, lodash treated such an object as an array-like of that length: real keys were skipped (for example a group listed next to `"length": 0` was ignored, so its rules evaluated to `n`) and a huge `length` made the call spin or run out of memory.
- **`/syncAndReplaceTabs` rows must be non-empty objects (behavior change)**: every element of `rows` must be an object with at least one key. A push containing a string, number, `null`, array, boolean or an empty object `{}` is rejected as a whole with `invalidRows` before anything is deleted. Before, a non-object element made the call fail with an engine message (for example `Cannot create property 'from' on string 'abc'`) that was returned to the application, and an empty object in a multi-row push was written as a blank row with a generated id. A row that carries no schema field at all (for example `{"foo":1}`; it would map to an all-empty row) is rejected the same way.
- **Authorization lookups use the exact id, not a lodash path (behavior change, tightening)**: `getUserRules` (used by `getPerm` / `getPermUserInfor`), the SDK `perm().active(name)` and the edit dialogs of user groups, group permissions and permission rules now look a target, group or permission up by its exact name as an own property. Before, a name containing `.` or `[` was resolved as a path: when only `A` was granted, targets `A.0` and `A[0]` evaluated to `y` (and `A.length` to `1`), and inherited names such as `toString` could be returned. Names that are themselves keys (for example a target called `A.0` granted by a rule named `A.0`, or one called `constructor` / `__proto__`) are granted as usual. In the admin session of `modeEditUsers: 'for:grups'`, a database id containing `.` or `[` can no longer be taken over by another row's nested field. The edit dialogs also keep an item named `__proto__` when saving (before, it was shown as enabled but silently dropped from the saved JSON).
- **Object-form entries are named by their key (behavior change, tightening)**: in the `cgrups` / `cpemis` / `crules` JSON of the form `{"<name>": …}`, an inner `name` field no longer renames the entry (before, `{"A":{"name":"B","isActive":"y"}}` granted `B` while the edit dialogs showed `A`). The array form `[{"name":"A","isActive":"y"}]` is unchanged. The permission-rule edit dialog also reads object-form values (`{"A":{"isActive":"y"}}`) the same way as the server, so such a rule is no longer shown as disabled (and revoked on save).
- **`/syncAndReplaceTabs` blank rows**: a row that carries no content outside the server-managed fields is rejected with `invalidRows`. Server-managed fields are `from`, `userId`, `timeCreate`, `userIdUpdate` and `timeUpdate` (the server overwrites them); a field value counts as content when it is a non-empty string, a finite number (`0` included) or a boolean (`""`, `null`, `[]` and `{}` do not).

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
