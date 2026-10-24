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
    if (token === '{token-for-application}') { //提供外部應用系統作為存取使用者(應用系統token・系統服務用途: 部署方須轉傳上游反查結果之 isApp, 否則 perm 只認 users 表中有效之系統管理員, README Upgrade Notes)
        return {
            id: 'id-for-application',
            name: 'application',
            email: 'application@example.com',
            isAdmin: 'y',
            isApp: 'y',
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
        if (token === '{token-for-mutate}') { //測試用(perm-run01 外審 sol#2): perm 列為管理員, 但 verifyClientUser 會改寫其收到之 user 物件(id、isAdmin), 模擬行為不良之部署方回呼; 套件須以驗證當下之 perm 列為準
            return {
                id: 'id-for-mutate',
                name: 'mutate',
                email: 'mutate@example.com',
                isAdmin: 'y',
            }
        }
        if (token === '{token-for-slow}') { //測試用(perm-run01 外審 sol#3): 一般使用者, verifyClientUser 為 async 且等待約 1.5 秒, 供「驗證與取權限樹之間該列被改動」案例
            return {
                id: 'id-for-slow',
                name: 'slow',
                email: 'slow@example.com',
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
        //以下為應用系統 token 測試用權杖(perm-run01 本輪, R-APP-TOKEN-01, 對照 dspec/w-web存取管控表.md 第二節 AU／AS 欄); 上游(w-web-sso)反查形狀: 使用者用途回所綁使用者之實際資料＋isApp='y'(isAdmin 依該使用者), 系統服務用途回 id='app:<金鑰主鍵>'、名稱為金鑰名稱、isApp='y'、isAdmin='y'
        if (token === '{token-for-app-system}') { //系統服務用途(AS): 不在 perm users 表; email 為空(sso 金鑰無 email)
            return { id: 'app:key-sys', name: 'key-sys', email: '', isAdmin: 'y', isApp: 'y' }
        }
        if (token === '{token-for-app-system-n}') { //系統服務用途形狀但 isAdmin='n'(不屬系統服務用途, 應被拒)
            return { id: 'app:key-n', name: 'key-n', email: '', isAdmin: 'n', isApp: 'y' }
        }
        if (token === '{token-for-app-noflag}') { //AS 形狀但部署方未轉傳 isApp(視同 'n')——相容情形: 資料通道與應用系統路由皆不認
            return { id: 'app:key-noflag', name: 'key-noflag', email: 'noflag@example.com', isAdmin: 'y' }
        }
        if (token === '{token-for-app-bind-admin}') { //使用者用途(AU)綁定管理員(base seed admin): 反查回該使用者實際資料＋isApp='y'
            return { id: 'id-for-admin', name: 'admin', email: 'admin@example.com', isAdmin: 'y', isApp: 'y' }
        }
        if (token === '{token-for-app-bind-member}') { //使用者用途(AU)綁定一般使用者(base seed peter)
            return { id: 'id-for-peter', name: 'peter', email: 'peter@example.com', isAdmin: 'n', isApp: 'y' }
        }
        if (token === '{token-for-app-bind-disabled}') { //使用者用途(AU)綁定之使用者在 perm users 表但被停用(列由測試自建), 上游 isAdmin='y': 不得因「停用視同查無」而落入系統服務用途
            return { id: 'id-for-appdis', name: 'appdis', email: 'appdis@example.com', isAdmin: 'y', isApp: 'y' }
        }
        if (token === '{token-for-alt-admin}') { //外部 id 與 perm 主鍵不同之管理員(外審 sol F02): 以 email 對應 perm 列 id-for-admin(僅 mappingBy 為 email 之測試設定有效); 稽核欄須記 perm 內之 id-for-admin, 不是外部 id
            return { id: 'sso-admin-9', name: 'admin-alt', email: 'admin@example.com', isAdmin: 'y' }
        }
        if (token === '{token-for-app-bind-disabled-alt}') { //使用者用途綁定之使用者在 perm 表但停用, 且外部 id(sso-appdis-9)與 perm 主鍵(id-for-appdis)不同: 只能靠對應鍵 email 找到該列(僅 mappingBy 為 email 之測試設定); 停用之列也算在表中, 不得落入系統服務用途
            return { id: 'sso-appdis-9', name: 'appdis-alt', email: 'appdis@example.com', isAdmin: 'y', isApp: 'y' }
        }
        if (token === '{token-for-deny}') { //perm 列為管理員(列由測試自建), 但 verifyClientUser 因非角色因素(模擬來源網段)否決
            return { id: 'id-for-deny', name: 'deny', email: 'deny@example.com', isAdmin: 'y' }
        }
        if (token === '{token-for-app-deny}') { //系統服務用途, 但 verifyAppUser 因非角色因素否決
            return { id: 'app:key-deny', name: 'key-deny', email: '', isAdmin: 'y', isApp: 'y' }
        }
        if (token === '{token-for-app-mutate}') { //系統服務用途, verifyAppUser 會改寫其收到之 user 物件(id、isAdmin)後放行: 套件須以交給部署方之前取得者為準
            return { id: 'app:key-mutate', name: 'key-mutate', email: '', isAdmin: 'y', isApp: 'y' }
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
    if (process.env.NODE_ENV !== 'production' && user.id === 'id-for-mutate') { //測試用: 見 '{token-for-mutate}'——改寫收到之 user 物件後放行(套件傳給本函數的是副本, 改寫不得影響執行身分與角色)
        user.id = 'id-for-peter'
        user.isAdmin = 'n'
        return true
    }
    if (process.env.NODE_ENV !== 'production' && user.id === 'id-for-slow') { //測試用: 見 '{token-for-slow}'——async 放行並等待約 1.5 秒
        return new Promise((resolve) => setTimeout(() => resolve(true), 1500))
    }
    if (process.env.NODE_ENV !== 'production' && user.id === 'id-for-deny') { //測試用: 見 '{token-for-deny}'——部署方因非角色因素否決(例如來源網段不符)
        return false
    }
    //只放行有效之瀏覽使用者, 不以 isAdmin 判斷(P-7): 非管理員由本套件統一拒絕並使畫面顯示「無權進入權限後台」(userNotAdmin); 若在此先否決非管理員, 使用者只會看到「拒絕登入」並被轉址; 部署方可依 from 與自家政策(來源網段、系統別)再收緊
    return true
}

let verifyAppUser = (user, from) => {
    // console.log('verifyAppUser/user', user)
    // console.log('於生產環境時得加入限制應用程式使用者身份機制')
    // return false //測試無法登入
    if (process.env.NODE_ENV !== 'production' && user.id === 'id-for-verify-throw') { //測試用: 見 getUserByToken 之 '{token-for-verify-throw}'
        throw new Error('SYNTH-VERIFY-SECRET-FOR-TEST')
    }
    if (process.env.NODE_ENV !== 'production' && (user.id === 'app:key-deny' || user.id === 'id-for-deny')) { //測試用: 見 '{token-for-app-deny}'、'{token-for-deny}'——部署方因非角色因素否決(id-for-deny 之 perm 列可由測試設為非管理員, 驗拒絕鍵次序: 部署方否決先於等級不足)
        return false
    }
    if (process.env.NODE_ENV !== 'production' && user.id === 'app:key-mutate') { //測試用: 見 '{token-for-app-mutate}'——改寫收到之 user 物件後放行(套件傳的是副本, 改寫不得影響稽核欄所記之 id 與等級)
        user.id = 'id-for-peter'
        user.isAdmin = 'n'
        return true
    }
    //套件已自行要求管理員等級(users 表中有效之系統管理員, 或系統服務用途之應用系統 token; P-1), 不必再以 isAdmin 判斷; 部署方可依 from 與自家政策再收緊
    return true
}

//WWebPerm
let instWWebPerm = WWebPerm(WOrm, url, db, getUserByToken, verifyClientUser, verifyAppUser, opt)

instWWebPerm.on('error', (err) => {
    console.log(err)
})

//node srv.mjs
//node srv.mjs <pathSettings>  //指定 settings 檔(e2e 注入語系用)
