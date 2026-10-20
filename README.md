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
- **Field values must be scalar (behavior change)**: every field of a row written by `updateTargets`, `updatePemis`, `updateGrups`, `updateUsers` or `/syncAndReplaceTabs` must be a string, number, boolean, `null` or absent. An object, array or other non-scalar value is rejected as a whole before anything is deleted (`saveRowFieldInvalid` for the admin pages, `invalidRows` for `/syncAndReplaceTabs`; the existing rows stay unchanged). No table has an object-typed field: `cgrups`, `cpemis` and `crules` are JSON **strings**. Before, a nested string such as `{ "description": { "value": "<script>" } }` slipped past the write validation and was silently rewritten when stored.
- **Edit dialogs decode authorization data exactly like the server (behavior change, tightening)**: `cgrups` / `cpemis` / `crules` may also be written in the array form `[{ "name": "A", "isActive": "y" }]` (an external application writing directly; `getPerm` / `getPermUserInfor` already honor it). The edit dialogs for user groups, group permissions and permission rules (and the two "belongs to" dialogs) used to look entries up by name, showed such entries as disabled, and saving revoked the authorization. They now decode both forms with the same function as the server, so what a dialog shows matches what is authorized, and saving keeps the authorization unchanged. Details: (1) in `cgrups` / `cpemis`, an entry with `isActive: "y"` but a missing or invalid `mode` (anything other than `"OR"` / `"AND"`) is not honored by the server; the dialogs now show it as disabled (before, object-form entries like that were shown as enabled and saving filled in `OR`, silently granting it); (2) in the object form `{ "<name>": { "name": …, … } }` the outer key is the name and an inner `name` is ignored, also in the "belongs to" dialogs (before, saving there re-pointed the grant to the inner name); (3) the three direct editors always save the object form `{ "<name>": … }`, the two "belongs to" dialogs rewrite the stored string only when its decoded content changes; (4) see the next two items for the cases the object form cannot hold (the same name active as both `AND` and `OR`) and for the order of `AND` entries.
- **Saving keeps the order of the stored entries (behavior change, fix)**: `mergeRules` starts the `AND` combination from the first `AND` entry when there is no active `OR` entry, so the order of the keys in `cgrups` / `cpemis` decides the result. The edit dialogs used to rewrite the keys in the order of the group / permission table, so with two or more `AND` entries of different rule sets a save with no visible change could gain or lose a grant. Entries already stored now keep their relative order and new ones are appended; for the array form the order is that of the first active entry of each name. `crules` is order independent and is handled the same way for consistency.
- **Data that the object form cannot hold is not rewritten (behavior change, fail-closed)**: when a `cgrups` / `cpemis` array (written directly by an external application) has the same name active as both `OR` and `AND`, or has two or more active `AND` names where the first `AND` name cannot keep its place in the object form (integer-like names such as `"1"` always sort first), the edit dialogs refuse to write it. A direct editor with changes, or a "belongs to" dialog with a change on such a row, is not saved and shows a fixed message naming the affected names; the stored string is left untouched, and a dialog opened and saved without changes returns the original string. The data has to be corrected at its source. Data written by the dialogs themselves (the object form) is never affected. The same refusal applies when a dialog would have to write an `AND` entry whose position JavaScript cannot keep: an integer-like name (for example a group called `1`) always sorts first in an object, so enabling it as `AND` in a dialog is refused when it would move ahead of the existing `AND` entries and change which one is evaluated first (as `OR`, or disabled, it saves normally).
- **List pages decode like the server**: the user, group and permission lists count and name the groups, permissions and rules of an array-form `cgrups` / `cpemis` / `crules` the same way as the server (before, the user list used the array index as the group name and the permission list counted 0 rules). Display only; nothing is written.
- **`/syncAndReplaceTabs` requires non-empty string names and ids (behavior change)**: for `grups` and `pemis` the `name` of every row, and for `targets` the `id` of every row, must be a non-empty string (as the admin pages already required). A missing value, an empty string, or a non-string (number, boolean, `null`) rejects the whole push with `invalidRows` before anything is deleted. Before, a group or permission with `name: ""` was stored and honored by `getPerm` / `getPermUserInfor`, but the edit dialogs treated it as invalid and removed it on the next save. `users` rows are not affected.

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
