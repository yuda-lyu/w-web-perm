//權限後台與資料通道只限系統管理員之判準與站點不變式(perm-run01; 規則帳本 R-ADMIN-ONLY-01; 使用者 2026-10-24 裁示)
//
//受測: server/adminCheck.mjs(isAdminRow, 單一擁有者)、server/WWebPerm.mjs(getAndVerifyClientUser／getAndVerifyAdminUser／checkToken／getUserIdByToken／/api/getUserByToken／/api/getPerm／requireAdmin).
//述語:
//  AOS-001  isAdminRow(row): 僅 isActive==='y' 且 isAdmin==='y'(自有屬性, 嚴格相等)為 true; 其餘(n／空／大小寫／空白／布林／數字／缺欄／繼承屬性／非物件／陣列)一律 false;
//  AOS-S1   連線閘 checkToken 只經 getAndVerifyAdminUser(不得退回 getAndVerifyClientUser);
//  AOS-S2   執行身分 getUserIdByToken 只經 getAndVerifyAdminUser;
//  AOS-S3   後台登入檢查 /api/getUserByToken 只經 getAndVerifyAdminUser;
//  AOS-S4   /api/getPerm 仍經 getAndVerifyClientUser(一般使用者查本人權限樹照常; 不得誤加角色檢查), 且是 getAndVerifyClientUser 唯一的路由呼叫點;
//  AOS-S5   角色於部署方 verifyClientUser 之前判定(檢查之值即使用之值), 部署方可修改其收到之 user 物件而不影響角色判定;
//  AOS-S6   requireAdmin 經 isAdminRow, 四個寫入函數各先經 requireAdmin 再進 procCore(縱深防禦);
//  AOS-S7   server/ 內以 isAdmin 判斷角色之站點只有 adminCheck.mjs(isAdminRow)與 token 欄位格式檢查(checkUser); 其餘一律不得自行比對 isAdmin.
//跑法: npx mocha test/unit-adminOnlySite.test.mjs --reporter list --timeout 30000
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import isAdminRow from '../server/adminCheck.mjs'
import { stripLineComment, sourceLines } from './tools/srcScan.mjs'

const projRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const A = assert.strict

let readCode = (rel) => fs.readFileSync(path.join(projRoot, rel), 'utf8').split(/\r?\n/).map((ln) => stripLineComment(ln)).join('\n')

//取函數本體: 自起始樣式起至下一個縮排 4 格之 `}` 行
let takeBody = (code, startRe, endRe = /\n    \}\n/) => {
    let m = startRe.exec(code)
    A.ok(m, `找不到 ${startRe}`)
    let rest = code.slice(m.index)
    let end = rest.search(endRe)
    A.ok(end > 0, `找不到 ${startRe} 之結尾`)
    return rest.slice(0, end)
}
let count = (s, re) => (s.match(re) || []).length


describe('unit-adminOnlySite (權限後台與資料通道只限系統管理員之判準與站點, perm-run01)', function() {

    describe('isAdminRow 判準(AOS-001)', function() {
        it('AOS-001a 有效之系統管理員 → true', function() {
            A.equal(isAdminRow({ id: 'a', isActive: 'y', isAdmin: 'y' }), true)
            A.equal(isAdminRow({ isAdmin: 'y', isActive: 'y', extra: 1 }), true)
        })

        it('AOS-001b 一般使用者／已停用／值不嚴格相等 → false(輸入空間: isAdmin × isActive 各取 y／n／大小寫／空白／空字串／布林／數字／null／缺欄)', function() {
            let vals = ['y', 'n', 'Y', ' y', 'y ', 'yes', '', true, false, 1, 0, null, undefined, 'true']
            let nTrue = 0
            for (let isAdmin of vals) {
                for (let isActive of vals) {
                    let r = isAdminRow({ isAdmin, isActive })
                    if (isAdmin === 'y' && isActive === 'y') {
                        A.equal(r, true)
                        nTrue++
                    }
                    else {
                        A.equal(r, false, `isAdmin=${JSON.stringify(isAdmin)} isActive=${JSON.stringify(isActive)} 應為 false`)
                    }
                }
            }
            A.equal(nTrue, 1, '14×14=196 格中只有 (y,y) 為 true')
            A.equal(isAdminRow({ isAdmin: 'y' }), false, '缺 isActive')
            A.equal(isAdminRow({ isActive: 'y' }), false, '缺 isAdmin')
            A.equal(isAdminRow({}), false)
        })

        it('AOS-001c 非物件／陣列／繼承屬性 → false(只認自有屬性)', function() {
            for (let v of [null, undefined, 'y', 1, true, [], ['y', 'y'], () => true]) {
                A.equal(isAdminRow(v), false, `${typeof v} 應為 false`)
            }
            let inherited = Object.create({ isAdmin: 'y', isActive: 'y' })
            A.equal(isAdminRow(inherited), false, '繼承之 isAdmin／isActive 不算')
            let arr = ['y']
            arr.isAdmin = 'y'
            arr.isActive = 'y'
            A.equal(isAdminRow(arr), false, '陣列即使掛了屬性亦不算')
        })
    })


    describe('站點不變式(AOS-S*)', function() {
        let code = readCode('server/WWebPerm.mjs')

        it('AOS-S1 連線閘 checkToken 只經 getAndVerifyAdminUser', function() {
            let body = takeBody(code, /checkToken: async\(token, from = ''\) => \{/, /\n        \},/)
            A.ok(body.includes('getAndVerifyAdminUser(token, from)'), 'checkToken 須經 getAndVerifyAdminUser(token, from)(from 為 apiType, 涵蓋 main 與上傳下載各入口)')
            A.ok(!body.includes('getAndVerifyClientUser('), 'checkToken 不得退回 getAndVerifyClientUser')
        })

        it('AOS-S2 執行身分 getUserIdByToken 只經 getAndVerifyAdminUser(from 為 main)', function() {
            let body = takeBody(code, /getUserIdByToken: async \(token\) => \{/, /\n        \},\n/)
            A.ok(body.includes("getAndVerifyAdminUser(token, 'main')"), 'getUserIdByToken 須經 getAndVerifyAdminUser(token, \'main\')')
            A.ok(!body.includes('getAndVerifyClientUser('), 'getUserIdByToken 不得退回 getAndVerifyClientUser')
        })

        it("AOS-S3 後台登入檢查 /api/getUserByToken 只經 getAndVerifyAdminUser(from 為 'getUserByToken')", function() {
            let i0 = code.indexOf("path: '/api/getUserByToken'")
            let i1 = code.indexOf("path: '/api/getPerm'")
            A.ok(i0 > 0 && i1 > i0, '找不到兩個路由')
            let seg = code.slice(i0, i1)
            A.ok(seg.includes("getAndVerifyAdminUser(token, 'getUserByToken')"), '登入檢查須經 getAndVerifyAdminUser')
            A.ok(!seg.includes('getAndVerifyClientUser('), '登入檢查不得退回 getAndVerifyClientUser')
        })

        it("AOS-S4 /api/getPerm 仍經 getAndVerifyClientUser(一般使用者查本人權限樹), 不得加角色檢查; 它是 getAndVerifyClientUser 唯一的路由呼叫點", function() {
            let i0 = code.indexOf("path: '/api/getPerm'")
            let i1 = code.indexOf("path: '/api/getPermUserInfor'")
            A.ok(i0 > 0 && i1 > i0, '找不到兩個路由')
            let seg = code.slice(i0, i1)
            A.ok(seg.includes("getAndVerifyClientUser(token, 'getPerm')"), '/api/getPerm 須經 getAndVerifyClientUser(token, \'getPerm\')')
            A.ok(!seg.includes('getAndVerifyAdminUser(') && !seg.includes('isAdminRow(') && !seg.includes('adminOnly'), '/api/getPerm 不得加角色檢查')
            //外審 sol#3: 權限樹用驗證時取得之列(第 2 參 userSelf), 不以 id 重讀(行為見 api-adminOnly AO-E2)
            A.ok(seg.includes('getGenUserAndRulesByUserId(userIdSelf, userSelf)'), '/api/getPerm 須把驗證時取得之列傳入 getGenUserAndRulesByUserId(不重讀)')
            //getAndVerifyClientUser( 呼叫點: getAndVerifyAdminUser 內 1＋/api/getPerm 1 = 2(連線閘、執行身分、登入檢查皆不得直呼; 定義為 `= async (` 不計)
            A.equal(count(code, /\bgetAndVerifyClientUser\(/g), 2, 'getAndVerifyClientUser( 呼叫點: getAndVerifyAdminUser＋/api/getPerm')
            //getAndVerifyAdminUser( 呼叫點: checkToken 1＋getUserIdByToken 1＋/api/getUserByToken 1 = 3
            A.equal(count(code, /\bgetAndVerifyAdminUser\(/g), 3, 'getAndVerifyAdminUser( 呼叫點: 連線閘、執行身分、後台登入檢查')
            //perm-run01 本輪(R-APP-TOKEN-01): 外部反查結果 userExt 由 getAndVerifyAdminUser 先取得並共用(一次請求只呼叫一次部署方 getUserByToken), 故轉呼叫多帶 userExt
            A.ok(/getAndVerifyClientUser\(token, from, \{ adminOnly: true, userExt \}\)/.test(takeBody(code, /let getAndVerifyAdminUser = async/)), 'getAndVerifyAdminUser 須以 { adminOnly: true, userExt } 轉呼叫')
        })

        it('AOS-S5 角色於部署方 verifyClientUser 之前判定(isAdminRow 先於 verifyClientUser(), adminOnly 檢查在其後)', function() {
            let body = takeBody(code, /let getAndVerifyClientUser = async/)
            let iAdmin = body.indexOf('isAdminRow(user)')
            let iVerify = body.indexOf('verifyClientUser({ ...user }, from)') //部署方只收淺層副本(外審 sol#2; 行為見 api-adminOnly AO-E1)
            let iCheck = body.indexOf('adminOnly && !isAdmin')
            A.ok(iAdmin > 0 && iVerify > iAdmin, '須於呼叫 verifyClientUser 之前先判定角色(檢查之值即使用之值)')
            A.ok(iCheck > iVerify, '角色拒絕在部署方通過之後(拒絕鍵次序: userNoPermission 先、userNotAdmin 後)')
            A.ok(body.includes("Promise.reject(`userNotAdmin`)"), '拒絕鍵為固定語系鍵 userNotAdmin')
            //srLog 只記 from, 不記 token 與使用者資料
            let m = /srLog\.error\(\{ event: 'getAndVerifyAdminUser-error'[^}]*\}\)/.exec(body)
            A.ok(m, '應有 getAndVerifyAdminUser-error 之 srLog')
            A.ok(!/token|user\b|userId|email/.test(m[0].replace('event: \'getAndVerifyAdminUser-error\'', '')), '角色拒絕之 srLog 不得記 token 與使用者資料')
        })

        it('AOS-S6 requireAdmin 經 isAdminRow; 四個寫入函數各先經 requireAdmin 再進 procCore(縱深防禦)', function() {
            let body = takeBody(code, /let requireAdmin = async/)
            A.ok(body.includes('isAdminRow(u)'), 'requireAdmin 須經 isAdminRow')
            for (let fn of ['updateTargets', 'updatePemis', 'updateGrups', 'updateUsers']) {
                let b = takeBody(code, new RegExp(`${fn}: async \\(userId, rows, opt(?:Client)?\\) => \\{`), /\n            \},\n/)
                let iReq = b.indexOf(`requireAdmin(userId, '${fn}')`)
                let iPc = b.indexOf('pc.')
                A.ok(iReq > 0, `${fn} 須呼叫 requireAdmin`)
                A.ok(iPc > iReq, `${fn} 須先 requireAdmin 再進 procCore`)
            }
        })

        it('AOS-S7 server/ 內以 isAdmin 判斷角色之站點: 只有 adminCheck.mjs 與 WWebPerm.checkUser 之欄位格式檢查; 他處不得自行比對 isAdmin', function() {
            let dir = path.join(projRoot, 'server')
            let files = []
            let walk = (d) => {
                for (let f of fs.readdirSync(d, { withFileTypes: true })) {
                    if (f.isDirectory()) {
                        if (f.name !== 'staLogs') {
                            walk(path.join(d, f.name))
                        }
                    }
                    else if (f.name.endsWith('.mjs')) {
                        files.push(path.join(d, f.name))
                    }
                }
            }
            walk(dir)
            let hits = []
            for (let fp of files) {
                let rel = path.relative(projRoot, fp).split(path.sep).join('/')
                sourceLines(fp, 'code').forEach(({ no, text }) => { //'code': 略過 JSDoc 與註解行
                    if (/isAdmin\s*(===|!==|==|!=)|[=!]==\s*[^\s]*isAdmin|\.isAdmin\b/.test(text)) {
                        hits.push(`${rel}:${no}: ${text.trim()}`)
                    }
                })
            }
            //允許: adminCheck.mjs(row.isAdmin 比對)、WWebPerm.mjs checkUser 之格式檢查('y'／'n' 二值)與其 console.log、fromTools(離線維運之報告統計)
            let bad = hits.filter((h) => !/^server\/adminCheck\.mjs:/.test(h) && !/^server\/WWebPerm\.mjs:\d+: (if \(isAdmin !== 'y' && isAdmin !== 'n'\) \{|console\.log\('user\.isAdmin is not y or n', user\.isAdmin\))/.test(h) && !/^server\/tools\/fromTools\.mjs:/.test(h))
            A.deepEqual(bad, [], `角色判斷須只經 isAdminRow:\n${bad.join('\n')}`)
        })
    })
})
