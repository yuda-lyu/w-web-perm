//應用系統 token 之配合與連線閘/路由修補之判準與站點不變式(perm-run01 本輪; 規則帳本 R-APP-TOKEN-01、R-BEARER-01、R-ROUTE-MSG-01; dspec/w-web存取管控表.md 第二節 P-1、P-2、P-3、P-5)
//
//受測: server/adminCheck.mjs(isSystemAppUser、isExtAdminUser)、server/keyCheck.mjs(countLoginRows)、server/WWebPerm.mjs(getExtUser／countPermRows／verifySystemApp／getAndVerifyAdminUser／getAndVerifyAppUser／requireAdmin／verifyConn／syncAndReplaceTabs 路由／四路由 routeResult).
//述語(perm-run02 起 AT-001 加 app: 前綴、新增 AT-003、AT-S2／S8 改寫、新增 AT-S9):
//  AT-001  isSystemAppUser(外部反查結果; 後台登入檢查、資料通道、requireAdmin 之「系統服務用途」嚴格認定的形狀部分): 僅「id 為以 'app:' 開頭之字串、isApp==='y'、isAdmin==='y'(自有屬性、嚴格相等)」為 true; 其餘一律 false(輸入空間見該案);
//  AT-002  countLoginRows: 不論 isActive 計列數(停用之列也算在表中); 'id' 模式後台列對 id、外部列對 srcKey; 'email'／'name' 以該欄位; 對應值非空字串回 0;
//  AT-003  isExtAdminUser(外部反查結果; 應用系統路由對「不在表」者之相容認定): 只看自有屬性 isAdmin==='y'(嚴格相等), 不要求 isApp、不要求 id 形狀;
//  AT-S1   P-2: getAndVerifyAdminUser 只在「isSystemAppUser 且 countPermRows 為 0」時走系統服務用途(verifySystemApp), 其餘一律轉呼 getAndVerifyClientUser(adminOnly) 並共用同一次外部反查結果(userExt);
//  AT-S2   P-1: getAndVerifyAppUser 在 perm 表者以 perm 列(isAdminRow)為準、不在表者以 isExtAdminUser 為準(perm-run02①: 不再用 isSystemAppUser); 先 verifyAppUser(userNoPermission)後等級(userNotAdmin); 部署方只收淺層副本, 回傳為交給部署方之前取得者;
//  AT-S3   P-3: verifyConn 以 reBearerAuth 取 token(不得以固定長度截斷);
//  AT-S4   P-5: /syncAndReplaceTabs 先 getAndVerifyAppUser 後讀 keyTable;
//  AT-S5   requireAdmin: 在 perm 表者(不論 isActive)以該列為準; 不在表者須為 getUserIdByToken 登錄之系統服務用途 id; getUserIdByToken 只對 verifySystemApp 產生之物件登錄;
//  AT-S6   R-ROUTE-MSG-01: 四條 hapi 路由皆經 routeResult, 不得再有 `r.msg = r.msg.message`;
//  AT-S7   srv.mjs(範例部署): 轉傳 isApp, verifyClientUser／verifyAppUser 不以 isAdmin 判斷(P-7);
//  AT-S8   系統服務用途之判準(isApp／isAdmin 比對)只在 adminCheck.mjs;
//  AT-S9   系統服務用途之 id 前綴('app:')只在 adminCheck.mjs 定義與比對(perm-run02②單一擁有者)。
//跑法: npx mocha test/unit-appToken.test.mjs --reporter list --timeout 30000
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { isSystemAppUser, isExtAdminUser } from '../server/adminCheck.mjs'
import { countLoginRows } from '../server/keyCheck.mjs'
import { stripLineComment, sourceLines } from './tools/srcScan.mjs'

const projRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const A = assert.strict

let readCode = (rel) => fs.readFileSync(path.join(projRoot, rel), 'utf8').split(/\r?\n/).map((ln) => stripLineComment(ln)).join('\n')
let takeBody = (code, startRe, endRe = /\n    \}\n/) => {
    let m = startRe.exec(code)
    A.ok(m, `找不到 ${startRe}`)
    let rest = code.slice(m.index)
    let end = rest.search(endRe)
    A.ok(end > 0, `找不到 ${startRe} 之結尾`)
    return rest.slice(0, end)
}
let count = (s, re) => (s.match(re) || []).length


describe('unit-appToken (應用系統 token 之判準與站點不變式, perm-run01 R-APP-TOKEN-01)', function() {

    describe('isSystemAppUser(AT-001)', function() {
        it('AT-001a 系統服務用途之形狀 → true(email／name 可空或缺; id 以 app: 開頭)', function() {
            A.equal(isSystemAppUser({ id: 'app:k1', name: 'k1', email: '', isAdmin: 'y', isApp: 'y' }), true)
            A.equal(isSystemAppUser({ id: 'app:k1', isAdmin: 'y', isApp: 'y' }), true)
            A.equal(isSystemAppUser({ id: 'app:k1', name: 'n', email: 'e@x.com', isAdmin: 'y', isApp: 'y', extra: 1 }), true)
        })

        it("AT-001b 輸入空間 id × isApp × isAdmin: 僅 (以 'app:' 開頭之字串, y, y) 為 true  [perm-run02②: 使用者用途綁不在表之 sso 管理員〔id 非 app: 開頭〕不是系統服務用途]", function() {
            let ids = ['app:k', 'app:', 'x', '', ' ', 'sso-admin-77', 'App:k', 'APP:k', ' app:k', 'xapp:k', 'app', 'app-k', 'app：k', 'app.k', 0, 1, null, undefined, true, {}, [], ['a']]
            let vals = ['y', 'n', 'Y', ' y', 'y ', 'yes', '', true, false, 1, 0, null, undefined]
            let nTrue = 0
            let nAll = 0
            for (let id of ids) {
                for (let isApp of vals) {
                    for (let isAdmin of vals) {
                        nAll++
                        let r = isSystemAppUser({ id, isApp, isAdmin })
                        let expect = (typeof id === 'string' && id.startsWith('app:') && isApp === 'y' && isAdmin === 'y')
                        A.equal(r, expect, `id=${JSON.stringify(id)} isApp=${JSON.stringify(isApp)} isAdmin=${JSON.stringify(isAdmin)}`)
                        if (r) {
                            nTrue++
                        }
                    }
                }
            }
            A.equal(nAll, 22 * 13 * 13)
            A.equal(nTrue, 2, "22×13×13=3718 格中 isApp、isAdmin 皆為 'y' 且 id 以 'app:' 開頭者(app:k、app:)兩格為 true; 'App:k'／' app:k'／'app：k' 等近似形一律 false")
        })

        it('AT-001c 缺欄／非物件／陣列／繼承屬性 → false(只認自有屬性)', function() {
            A.equal(isSystemAppUser({ id: 'app:a', isAdmin: 'y' }), false, '缺 isApp(未轉傳 = 視同 n)')
            A.equal(isSystemAppUser({ id: 'app:a', isApp: 'y' }), false, '缺 isAdmin')
            A.equal(isSystemAppUser({ isApp: 'y', isAdmin: 'y' }), false, '缺 id')
            for (let v of [null, undefined, 'y', 1, true, [], ['a'], () => true]) {
                A.equal(isSystemAppUser(v), false, `${typeof v}`)
            }
            let inherited = Object.create({ id: 'app:a', isApp: 'y', isAdmin: 'y' })
            A.equal(isSystemAppUser(inherited), false, '繼承屬性不算')
            let arr = ['y']
            arr.id = 'app:a'
            arr.isApp = 'y'
            arr.isAdmin = 'y'
            A.equal(isSystemAppUser(arr), false, '陣列不算')
        })
    })


    describe('isExtAdminUser(AT-003; perm-run02①)', function() {
        it("AT-003a 只看自有屬性 isAdmin==='y'(嚴格相等); 不要求 isApp、不要求 id 形狀", function() {
            A.equal(isExtAdminUser({ isAdmin: 'y' }), true, '舊版 sso 之應用系統身分: 只有 isAdmin y')
            A.equal(isExtAdminUser({ id: 'x', isAdmin: 'y' }), true)
            A.equal(isExtAdminUser({ id: 'app:k', isAdmin: 'y', isApp: 'y' }), true)
            A.equal(isExtAdminUser({ id: 'app:k', isAdmin: 'y', isApp: 'n' }), true, 'isApp n 亦同(相容; 不在表者只看 isAdmin)')
            A.equal(isExtAdminUser({ id: 5, isAdmin: 'y' }), true, 'id 形狀由路由另檢(syncAndReplaceTabs 要求非空字串 id), 等級判準不看')
        })

        it('AT-003b 輸入空間 isAdmin × isApp × id: 僅 isAdmin 為 y 者為 true', function() {
            let vals = ['y', 'n', 'Y', ' y', 'y ', 'yes', '', true, false, 1, 0, null, undefined]
            let ids = ['app:k', 'x', '', 0, null, undefined, {}]
            let nTrue = 0
            let nAll = 0
            for (let id of ids) {
                for (let isApp of vals) {
                    for (let isAdmin of vals) {
                        nAll++
                        let r = isExtAdminUser({ id, isApp, isAdmin })
                        A.equal(r, isAdmin === 'y', `id=${JSON.stringify(id)} isApp=${JSON.stringify(isApp)} isAdmin=${JSON.stringify(isAdmin)}`)
                        if (r) {
                            nTrue++
                        }
                    }
                }
            }
            A.equal(nAll, 7 * 13 * 13)
            A.equal(nTrue, 7 * 13, '7×13×13=1183 格中 isAdmin 為 y 者 7×13=91 格為 true')
        })

        it('AT-003c 缺欄／非物件／陣列／繼承屬性 → false', function() {
            A.equal(isExtAdminUser({ id: 'a' }), false, '缺 isAdmin')
            A.equal(isExtAdminUser({}), false)
            for (let v of [null, undefined, 'y', 1, true, [], ['a'], () => true]) {
                A.equal(isExtAdminUser(v), false, `${typeof v}`)
            }
            A.equal(isExtAdminUser(Object.create({ isAdmin: 'y' })), false, '繼承屬性不算')
            let arr = ['y']
            arr.isAdmin = 'y'
            A.equal(isExtAdminUser(arr), false, '陣列不算')
        })

        it('AT-003d 與 isSystemAppUser 之關係: 系統服務用途形狀必為 isExtAdminUser 為真之子集(嚴格認定只會比相容認定更窄)', function() {
            let ids = ['app:k', 'x', '', null]
            let vals = ['y', 'n', '', null, undefined]
            for (let id of ids) {
                for (let isApp of vals) {
                    for (let isAdmin of vals) {
                        let u = { id, isApp, isAdmin }
                        if (isSystemAppUser(u)) {
                            A.equal(isExtAdminUser(u), true, JSON.stringify(u))
                        }
                    }
                }
            }
        })
    })


    describe('countLoginRows(AT-002)', function() {
        //假 users 表: select(cond) 依條件(全部鍵相等)過濾
        let mk = (rows) => ({
            select: async (cond = {}) => rows.filter((r) => Object.keys(cond).every((k) => r[k] === cond[k])),
        })
        let rows = [
            { id: 'a1', email: 'a@x.com', name: 'A', from: '', isActive: 'y' },
            { id: 'a2', email: 'b@x.com', name: 'B', from: '', isActive: 'n' },
            { id: 'i3', srcKey: 'ext-1', email: 'c@x.com', name: 'C', from: 'teamA', isActive: 'y' },
            { id: 'i4', srcKey: 'ext-2', email: 'd@x.com', name: 'D', from: 'teamA', isActive: 'n' },
            { id: 'i5', email: 'e@x.com', name: 'E', from: 'teamB', isActive: 'y' }, //遷移前舊外部列(無 srcKey): 以 id 對
        ]
        let t = mk(rows)

        it('AT-002a mappingBy=id: 後台列對 id、外部列對 srcKey、舊外部列對 id; 停用之列也算在表中', async function() {
            A.equal(await countLoginRows(t, 'id', 'a1'), 1)
            A.equal(await countLoginRows(t, 'id', 'a2'), 1, '停用之後台列仍算在表中')
            A.equal(await countLoginRows(t, 'id', 'ext-1'), 1)
            A.equal(await countLoginRows(t, 'id', 'ext-2'), 1, '停用之外部列仍算在表中')
            A.equal(await countLoginRows(t, 'id', 'i3'), 0, '外部列之內部 id 不是登入識別')
            A.equal(await countLoginRows(t, 'id', 'i5'), 1, '舊外部列以 id 對')
            A.equal(await countLoginRows(t, 'id', 'nope'), 0)
            A.equal(await countLoginRows(t, 'zzz', 'a1'), 1, '未知 mappingBy 視同 id')
        })

        it('AT-002b mappingBy=email／name: 以該欄位, 不論 isActive', async function() {
            A.equal(await countLoginRows(t, 'email', 'a@x.com'), 1)
            A.equal(await countLoginRows(t, 'email', 'b@x.com'), 1, '停用者仍算')
            A.equal(await countLoginRows(t, 'email', 'z@x.com'), 0)
            A.equal(await countLoginRows(t, 'name', 'C'), 1)
            A.equal(await countLoginRows(t, 'name', 'a'), 0, '精確比對')
        })

        it('AT-002c 對應值非空字串 → 0(不查庫); 多筆回筆數', async function() {
            let n = 0
            let spy = { select: async () => { n++; return [] } }
            for (let v of ['', undefined, null, 1, {}, []]) {
                A.equal(await countLoginRows(spy, 'id', v), 0)
                A.equal(await countLoginRows(spy, 'email', v), 0)
            }
            A.equal(n, 0, '對應值不合格時不查庫')
            let dup = mk([{ id: 'd1', email: 'dup@x.com', isActive: 'y' }, { id: 'd2', email: 'dup@x.com', isActive: 'n' }])
            A.equal(await countLoginRows(dup, 'email', 'dup@x.com'), 2)
        })

        it('AT-002d ORM 讀取失敗原樣拋出(fail-closed, 不吞成 0 筆)', async function() {
            let boom = { select: async () => { throw new Error('orm boom') } }
            await A.rejects(() => countLoginRows(boom, 'id', 'a1'), /orm boom/)
            await A.rejects(() => countLoginRows(boom, 'email', 'a@x.com'), /orm boom/)
        })
    })


    describe('站點不變式(AT-S*)', function() {
        let code = readCode('server/WWebPerm.mjs')

        it('AT-S1 P-2: getAndVerifyAdminUser 只在 isSystemAppUser 且不在 perm 表時走系統服務用途, 外部反查結果共用', function() {
            let body = takeBody(code, /let getAndVerifyAdminUser = async/)
            A.ok(body.includes("getExtUser(token, 'getTokenUser-error')"), '須先取外部反查結果(一次請求只呼叫一次部署方 getUserByToken)')
            //getExtUser 回淺層快照(部署方保留引用並於非同步等待期間改寫它不得影響判定; 外審 sol F05); countPermRows 之「在表」含外部 id 等於表中某列主鍵(外審 sol F03／F04)
            A.ok(/return \{ \.\.\.user \}/.test(takeBody(code, /let getExtUser = async/)), 'getExtUser 須回外部反查結果之淺層快照')
            let cp = takeBody(code, /let countPermRows = async/)
            A.ok(cp.includes('countLoginRows(woItems.users, mappingBy, get(userExt, mappingBy, \'\'))') && cp.includes("getGenUserByKV('id', userExt.id, false)"), 'countPermRows: 對應鍵對得到或外部 id 等於表中某列主鍵(不論 isActive)皆算在表')
            A.ok(/isSystemAppUser\(userExt\) && \(await countPermRows\(userExt\)\) === 0/.test(body), '系統服務用途須同時要求 isSystemAppUser 與不在 perm 表(countPermRows 為 0)')
            A.ok(body.includes("verifySystemApp(userExt, from, 'getAndVerifyAdminUser-error')"), '系統服務用途須經 verifySystemApp(部署方 verifyAppUser)')
            A.ok(/getAndVerifyClientUser\(token, from, \{ adminOnly: true, userExt \}\)/.test(body), '其餘一律轉呼 getAndVerifyClientUser(adminOnly) 並共用 userExt')
            //外部 getUserByToken 之呼叫點: getExtUser 內唯一一處
            A.equal(count(code, /\bgetUserByToken\(token\)/g), 1, 'getUserByToken(token) 呼叫點只有 getExtUser 一處')
            //verifySystemApp: 部署方只收淺層副本, 身分物件於交給部署方之前建立, 通過後登錄
            let vs = takeBody(code, /let verifySystemApp = async/)
            A.ok(vs.indexOf('let userUse') < vs.indexOf('verifyAppUser('), '身分物件須於交給部署方之前建立(檢查之值即使用之值)')
            A.ok(vs.includes('verifyAppUser({ ...userExt }, from)'), '部署方只收淺層副本')
            A.ok(vs.includes("isAdmin: 'y'") && vs.includes("isApp: 'y'"), '回傳身分物件固定 isAdmin／isApp 為 y')
            A.ok(vs.includes('kpSystemAppUser.add(userUse)'), '通過後登錄(供 getUserIdByToken 辨識)')
        })

        it('AT-S2 P-1: getAndVerifyAppUser 在表者以 perm 列、不在表者以 isExtAdminUser(相容: 只看 isAdmin y, 不要求 isApp 與 app: 前綴); 先部署方後等級; 回傳為交給部署方之前取得者', function() {
            let body = takeBody(code, /let getAndVerifyAppUser = async/)
            A.ok(body.includes("getExtUser(token, 'getAndVerifyAppUser-error')"))
            A.ok(/\(await countPermRows\(user\)\) > 0/.test(body), '須先判斷是否在 perm 表')
            A.ok(body.includes('getTokenUser(token, user)') && body.includes('isAdminRow(userPerm)'), '在表者以 getTokenUser 驗證後之 perm 列判定 isAdminRow')
            A.ok(body.includes('isExtAdminUser(user)'), '不在表者以 isExtAdminUser 判定(perm-run02①)')
            A.ok(!body.includes('isSystemAppUser'), '應用系統路由不得再用 isSystemAppUser(系統服務用途之嚴格認定只用於後台登入檢查、資料通道、requireAdmin)')
            A.ok(!/\bisApp\b/.test(body), '應用系統路由之等級判定不得出現 isApp')
            let iUse = body.indexOf('let userUse = (userPerm !== null) ? { ...user, id: userPerm.id } : { ...user }') //在表者以 perm 列主鍵為執行身分(稽核欄), 不在表者為外部 id
            let iVerify = body.indexOf('verifyAppUser({ ...user }, from)')
            let iLevel = body.indexOf('if (!isLevel)')
            A.ok(iUse > 0 && iVerify > iUse && iLevel > iVerify, '次序: 取 userUse → verifyAppUser(淺層副本) → 等級檢查')
            A.ok(body.includes("msg: 'userNoPermission'") && body.includes("msg: 'userNotAdmin'"), '固定鍵 userNoPermission(部署方否決)、userNotAdmin(等級不足)')
            A.ok(/return userUse\n/.test(body + '\n') && !/return user\n/.test(body + '\n'), '回傳 userUse(交給部署方之前取得者), 不回傳可能被改寫之 user')
            //srLog 只記 from, 不記 token 與使用者資料
            let m = /srLog\.error\(\{ event: 'getAndVerifyAppUser-error', msg: 'userNotAdmin'[^}]*\}\)/.exec(body)
            A.ok(m && !/token|userId|email/.test(m[0]), '等級不足之 srLog 不得記 token 與使用者資料')
        })

        it('AT-S3 P-3: verifyConn 以 reBearerAuth 取 token, 不得以固定長度截斷', function() {
            A.ok(code.includes('let reBearerAuth = /^Bearer (\\S+)$/i'), '須有 reBearerAuth(Bearer 不分大小寫、單一空白、非空白憑證、整段吻合)')
            let body = takeBody(code, /verifyConn: async \(\{ apiType, authorization, query, headers, req \}\) => \{/, /\n        \},\n/)
            A.ok(body.includes('reBearerAuth.exec('), 'verifyConn 須經 reBearerAuth')
            A.ok(!/strdelleft|\.slice\(7\)|substring\(7\)|substr\(7\)/.test(body), 'verifyConn 不得以固定長度截斷 Authorization')
            A.ok(!/strdelleft/.test(code), 'WWebPerm.mjs 不再使用 strdelleft')
        })

        it('AT-S4 P-5: /syncAndReplaceTabs 先驗身分後讀 keyTable', function() {
            let i0 = code.indexOf("path: '/syncAndReplaceTabs'")
            A.ok(i0 > 0)
            let seg = code.slice(i0)
            let iAuth = seg.indexOf("getAndVerifyAppUser(token, 'syncAndReplaceTabs')")
            let iKey = seg.indexOf("get(req, 'query.keyTable'")
            let iAllow = seg.indexOf('allowedTables')
            let iParse = seg.indexOf('parsePayload(req)')
            A.ok(iAuth > 0 && iKey > iAuth && iAllow > iKey && iParse > iAllow, '次序: 身分 → keyTable → 白名單 → payload')
            //身分之前不得讀 keyTable
            A.equal(count(seg.slice(0, iAuth), /keyTable/g), 0, '身分驗證之前不得出現 keyTable')
        })

        it('AT-S5 requireAdmin: 在表者(不論 isActive)以列為準, 不在表者須為已登錄之系統服務用途 id; 只對 verifySystemApp 產生之物件登錄', function() {
            let body = takeBody(code, /let requireAdmin = async/)
            A.ok(body.includes("getGenUserByKV('id', userId, false)"), '須不篩 isActive 讀取(停用之列也算在表中)')
            A.ok(/\(u !== null\) \? isAdminRow\(u\) : isSystemAppIdRecent\(userId\)/.test(body), '在表以 isAdminRow, 不在表以近期登錄(TTL)')
            A.ok(body.includes("Promise.reject('userNotAdmin')"))
            let g = takeBody(code, /getUserIdByToken: async \(token\) => \{/, /\n        \},\n/)
            A.ok(g.includes('kpSystemAppUser.has(user)') && g.includes('markSystemAppId(userId)'), 'getUserIdByToken 只對 verifySystemApp 產生之物件登錄')
            A.equal(count(code, /markSystemAppId\(/g), 1, '登錄呼叫點只有 getUserIdByToken 一處')
            A.ok(g.includes('clearSystemAppId(userId)'), '以 perm 列通過者須清除該 id 之近期登錄(perm-run02 外審 sol F3; 行為見 api-callerMatrix MX-M6)')
            A.equal(count(code, /clearSystemAppId\(/g), 1, '清除呼叫點只有 getUserIdByToken 一處')
            A.equal(count(code, /kpSystemAppIds\.set\(/g), 1, 'kpSystemAppIds 之寫入點只有 markSystemAppId 一處')
            A.ok(code.includes('let SYSTEM_APP_TTL_MS = 60000') && /Date\.now\(\) - t <= SYSTEM_APP_TTL_MS/.test(code), '登錄須有 TTL(外審 sol F06: 不得永久登錄)')
            A.equal(count(code, /kpSystemAppUser\.add\(/g), 1, 'kpSystemAppUser 登錄點只有 verifySystemApp 一處')
        })

        it('AT-S6 R-ROUTE-MSG-01: 四條 hapi 路由皆經 routeResult, 不得再取 Error.message 原樣回傳', function() {
            for (let ev of ['api/getUserByToken-error', 'api/getPerm-error', 'api/getPermUserInfor-error', 'api/syncAndReplaceTabs-error']) {
                A.ok(code.includes(`r = routeResult(r, '${ev}')`), `路由須經 routeResult(r, '${ev}')`)
            }
            A.equal(count(code, /\br = routeResult\(/g), 4)
            A.ok(!/r\.msg = r\.msg\.message/.test(code), '不得 r.msg = r.msg.message')
            A.ok(code.includes('createRouteResult({ srLog })'))
        })

        it('AT-S7 srv.mjs(範例部署): 轉傳 isApp; verifyClientUser／verifyAppUser 不以 isAdmin 判斷(P-7)', function() {
            let sc = readCode('srv.mjs')
            A.ok(/id: 'id-for-application'[\s\S]{0,200}isApp: 'y'/.test(sc), "'{token-for-application}' 須轉傳 isApp")
            for (let name of ['verifyClientUser', 'verifyAppUser']) {
                let body = takeBody(sc, new RegExp(`let ${name} = \\(user, from\\) => \\{`), /\n\}\n/)
                A.ok(!/\.isAdmin\s*(===|!==)/.test(body.replace(/user\.isAdmin = 'n'/g, '')), `${name} 不得以 isAdmin 判斷角色`)
                A.ok(/\n    return true\n?$/.test(body), `${name} 最終應 return true(僅測試鉤子可否決)`)
            }
        })

        it('AT-S8 系統服務用途之判準(isApp 比對)只在 adminCheck.mjs; server/ 其餘檔案不自行比對 isApp', function() {
            let dir = path.join(projRoot, 'server')
            let hits = []
            let walk = (d) => {
                for (let f of fs.readdirSync(d, { withFileTypes: true })) {
                    if (f.isDirectory()) {
                        if (f.name !== 'staLogs') {
                            walk(path.join(d, f.name))
                        }
                    }
                    else if (f.name.endsWith('.mjs')) {
                        let fp = path.join(d, f.name)
                        let rel = path.relative(projRoot, fp).split(path.sep).join('/')
                        sourceLines(fp, 'code').forEach(({ no, text }) => {
                            if (/\bisApp\b/.test(text)) {
                                hits.push(`${rel}:${no}: ${text.trim()}`)
                            }
                        })
                    }
                }
            }
            walk(dir)
            //允許: adminCheck.mjs(判準本身); WWebPerm.mjs verifySystemApp 回傳固定值 isApp: 'y'(非比對)
            let bad = hits.filter((h) => !/^server\/adminCheck\.mjs:/.test(h) && !/^server\/WWebPerm\.mjs:\d+: isApp: 'y',$/.test(h))
            A.deepEqual(bad, [], `isApp 之比對須只在 adminCheck.mjs:\n${bad.join('\n')}`)
        })

        it("AT-S9 系統服務用途之 id 前綴('app:')只在 adminCheck.mjs 定義與比對; server/ 其餘檔案之程式碼(排除註解)不得出現 'app:' 字面或 startsWith 比對", function() {
            let dir = path.join(projRoot, 'server')
            let hits = []
            let walk = (d) => {
                for (let f of fs.readdirSync(d, { withFileTypes: true })) {
                    if (f.isDirectory()) {
                        if (f.name !== 'staLogs') {
                            walk(path.join(d, f.name))
                        }
                    }
                    else if (f.name.endsWith('.mjs')) {
                        let fp = path.join(d, f.name)
                        let rel = path.relative(projRoot, fp).split(path.sep).join('/')
                        sourceLines(fp, 'code').forEach(({ no, text }) => {
                            if (/['"`]app:/.test(text) || /startsWith\(\s*['"`]app/.test(text)) {
                                hits.push(`${rel}:${no}: ${text.trim()}`)
                            }
                        })
                    }
                }
            }
            walk(dir)
            let bad = hits.filter((h) => !/^server\/adminCheck\.mjs:/.test(h))
            A.deepEqual(bad, [], `app: 前綴之比對須只在 adminCheck.mjs:\n${bad.join('\n')}`)
            let ac = fs.readFileSync(path.join(projRoot, 'server/adminCheck.mjs'), 'utf8')
            A.ok(/SYSTEM_APP_ID_PREFIX = 'app:'/.test(ac) && /startsWith\(SYSTEM_APP_ID_PREFIX\)/.test(ac), "adminCheck.mjs 須以常數 SYSTEM_APP_ID_PREFIX = 'app:' 與 startsWith 比對")
        })
    })
})
