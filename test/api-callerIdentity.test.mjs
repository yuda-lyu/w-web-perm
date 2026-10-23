//資料通道執行身分之完整驗證與寫入函數之角色檢查(perm-run03 範圍三、四; 真後端)。
//規格: C:\opensrcOper\dspec\w-web呼叫者身分驗證.md 規則 4(執行身分須經完整驗證)、C2(函數層級角色); C:\opensrcOper\dspec\使用者身分驗證原則.md 二.2／二.4; 規則帳本 R-CALLER-ID-01。
//
//[G] getUserIdByToken(框架對本體 __sysToken__ 呼叫)與連線閘同等完整: 外部 getUserByToken → perm users 存在且 isActive='y' → 部署方 verifyClientUser; 任一關不過即 reject, 函數不執行(零寫入), 記 srLog 不回顯 token。
//    標頭 token(連線閘)有效、本體 token 無效之輸入空間: {不在 perm users〔app 權杖〕、perm 內但被 verifyClientUser 拒〔isAdmin n〕、perm 內但已停用、getUserByToken 查無〔無效〕、
//    getUserByToken reject 上游原文、verifyClientUser 拋錯〔perm users 內有此列且啟用, 才走到驗證器〕、perm users 無此列〔admin2 尚未建立〕} × 被呼叫函數 {寫入 updateGrups、唯讀 getWebInfor}。
//    兩 token 皆有效且為不同使用者時以本體 token 之使用者執行(稽核欄位為本體使用者)。mappingBy=email 時回傳 perm 內之 id(非外部 token 宣稱之 id)。
//[A] requireAdmin: updateTargets／updatePemis／updateGrups／updateUsers 僅 perm users 表中有效且 isAdmin='y' 之使用者可呼叫; 通過連線閘之非管理員(TOKEN_MEMBER: srv.mjs 之 verifyClientUser 放行)
//    被拒 userNotAdmin、零寫入、記 srLog(函數名＋userId, 無 token); perm 為權威(token 宣稱 isAdmin 'n'、perm 列 'y' 者可呼叫); 管理員照常。
//跑法(需測試鎖): node C:/opensrcOper/tools/quiet-run.mjs --name tcid --lock --timeout 1800 -- npx mocha test/api-callerIdentity.test.mjs --timeout 300000
import assert from 'assert'
import { assertPristineSeed } from './tools/baseSeed.mjs'
import {
    startApi, TOKEN_ADMIN, TOKEN_ADMIN2, TOKEN_MEMBER, TOKEN_PETER, TOKEN_APP, TOKEN_BAD, TOKEN_REJECT, TOKEN_VERIFY_THROW,
    callRpc, readTables, selectAllRows, purgeExternalRows, markSrLog, readSrLogSince,
} from './tools/api-setup.mjs'
import { restartBackend, genTempSettings } from './tools/e2e-setup.mjs'

const A = assert.strict
const KTS = ['users', 'grups', 'pemis', 'targets']
const FN = { users: 'updateUsers', grups: 'updateGrups', pemis: 'updatePemis', targets: 'updateTargets' }

let clone = (o) => JSON.parse(JSON.stringify(o))
let byId = (a, b) => String(a.id).localeCompare(String(b.id))
let byOrder = (a, b) => ((a.order || 0) - (b.order || 0)) || byId(a, b)
let rowsOf = async (kt) => (await selectAllRows(kt)).slice().sort(byOrder).map(clone)
let snapKt = async (kt) => JSON.stringify((await selectAllRows(kt)).slice().sort(byId))
let snap4 = async () => JSON.stringify(await Promise.all(KTS.map(snapKt)))
let sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

//perm users 夾具列(後台列, from ''): admin2(isAdmin y)、member(isAdmin n)
let userRow = (id, name, isAdmin, isActive = 'y', extra = {}) => ({ id, order: 50, name, email: `${name}@example.com`, description: '', from: '', cgrups: '{}', isAdmin, isActive, ...extra })
//newGrup: 追加一個群組之整表(以管理員視角讀現況再加一列; id 由呼叫端給)
let grupRow = (id, name) => ({ id, order: 0, name, description: `${name}說明`, from: '', cpemis: '{}' })

//waitLines: srLog 經 pino 非同步落檔, 以標記(動作之前取)定位後輪詢到符合 pred 之行
let waitLines = async (mark, pred, label, ms = 30000) => {
    let tEnd = Date.now() + ms
    let lines = []
    while (Date.now() < tEnd) {
        lines = readSrLogSince(mark)
        if (lines.some(pred)) {
            return lines
        }
        await sleep(100)
    }
    throw new Error(`${label}: ${ms} ms 內未見預期之 log 行; 實得 ${JSON.stringify(lines.map((l) => l.event || l.msg)).slice(0, 300)}`)
}


describe('api-callerIdentity (資料通道執行身分完整驗證＋寫入函數角色檢查, perm-run03, 真後端)', function() {
    this.timeout(300000)

    let BASE = null

    //restoreBase: 四表還原為 base seed(次序: 被引用者先、引用端後), 同 api-baseline; 夾具使用者(admin2／member)隨 users 還原而移除
    let restoreBase = async () => {
        await purgeExternalRows(KTS, { keepIds: Object.fromEntries(KTS.map((kt) => [kt, BASE[kt].map((r) => r.id)])) })
        for (let kt of ['targets', 'pemis', 'grups', 'users']) {
            let r = await callRpc(FN[kt], [clone(BASE[kt])], TOKEN_ADMIN)
            if (!r.ok) {
                throw new Error(`restoreBase ${FN[kt]} 失敗: ${JSON.stringify(r).slice(0, 200)}`)
            }
        }
    }

    //addUsers: 以管理員在 base seed 的 users 之上追加夾具使用者
    let addUsers = async (rows) => {
        let cur = await rowsOf('users')
        let r = await callRpc('updateUsers', [[...cur, ...rows]], TOKEN_ADMIN)
        A.ok(r.ok, `追加夾具使用者應成功: ${JSON.stringify(r).slice(0, 300)}`)
    }

    before(async function() {
        this.timeout(300000)
        await startApi()
        for (let kt of KTS) {
            assertPristineSeed(kt, await selectAllRows(kt))
        }
        BASE = await readTables()
        BASE.targets = await rowsOf('targets')
    })

    afterEach(async function() {
        this.timeout(120000)
        await restoreBase()
    })

    after(async function() {
        this.timeout(300000)
        await restartBackend('./settings.json')
        await restoreBase()
    })


    describe('G 執行身分(本體 __sysToken__)完整驗證', function() {

        //標頭 token 有效(TOKEN_ADMIN, 過連線閘), 本體 token 為下列各種「無法通過完整驗證」者 → 函數不執行
        //預期之固定語系鍵由 getAndVerifyClientUser 之各關決定(見 server/WWebPerm.mjs getTokenUser／getAndVerifyClientUser)
        let bodyCases = [
            { title: '不在 perm users 表(app 權杖: 外部 getUserByToken 有效、perm 無此列)', token: TOKEN_APP, key: 'cannotGetUserFromPerm' },
            { title: 'perm 內有效使用者但被部署方 verifyClientUser 拒絕(isAdmin n)', token: TOKEN_PETER, key: 'userNoPermission' },
            { title: 'getUserByToken 查無(無效 token)', token: TOKEN_BAD, key: 'cannotFindUserFromToken' },
            { title: 'getUserByToken reject 上游原文(含合成秘密; W 契約視同查無)', token: TOKEN_REJECT, key: 'cannotFindUserFromToken' },
            //perm users 內有此列且啟用(才會走到 verifyClientUser; 否則先於驗證器被 cannotGetUserFromPerm 拒收而守不到驗證器拋錯之 fail-closed; 外審 sol#5); 驗證器拋錯 ≡ 無權限
            { title: 'perm 內有效使用者但部署方 verifyClientUser 拋錯(fail-closed 視同無權限; 回應與 log 不含合成秘密)', token: TOKEN_VERIFY_THROW, key: 'userNoPermission', pre: async () => addUsers([userRow('id-for-verify-throw', 'verify-throw', 'y', 'y', { email: 'verify-throw@example.com' })]) },
            { title: 'perm users 無此列(admin2 尚未建立)', token: TOKEN_ADMIN2, key: 'cannotGetUserFromPerm' },
        ]

        for (let c of bodyCases) {
            it(`CI-G1 ${c.title} → 寫入函數不執行(零寫入)、回 ${c.key}  [dspec 規則 4、fail-closed]`, async function() {
                if (c.pre) {
                    await c.pre()
                }
                let before = await snap4()
                let rows = (await rowsOf('grups')).concat([grupRow('id-ci-g1', 'ci-g1')])
                let r = await callRpc('updateGrups', [rows], TOKEN_ADMIN, { sysToken: c.token })
                A.equal(r.ok, false, `本體 token 無效時函數不得執行, 實得 ${JSON.stringify(r).slice(0, 200)}`)
                A.equal(r.msg, c.key)
                A.equal(await snap4(), before, '零寫入')
                A.ok(!r.raw.includes(c.token) && !r.raw.includes('SYNTH-'), '回應不得回顯 token 與上游原文(合成秘密)')
            })

            it(`CI-G2 ${c.title} → 唯讀函數亦不執行(回 ${c.key})  [dspec 規則 4: 反查即驗證身分, 與函數是否唯讀無關]`, async function() {
                if (c.pre) {
                    await c.pre()
                }
                let r = await callRpc('getWebInfor', [], TOKEN_ADMIN, { sysToken: c.token })
                A.equal(r.ok, false)
                A.equal(r.msg, c.key)
                A.ok(!r.raw.includes(c.token) && !r.raw.includes('SYNTH-'), '回應不得回顯 token 與上游原文(合成秘密)')
            })
        }

        it('CI-G3 perm 內已停用之使用者(admin2: isAdmin y 但 isActive n)之本體 token → 不執行、零寫入  [規則 4: 本系統使用者須存在且啟用]', async function() {
            await addUsers([userRow('id-for-admin2', 'admin2', 'y', 'n')])
            let before = await snap4()
            let rows = (await rowsOf('grups')).concat([grupRow('id-ci-g3', 'ci-g3')])
            let r = await callRpc('updateGrups', [rows], TOKEN_ADMIN, { sysToken: TOKEN_ADMIN2 })
            A.equal(r.ok, false)
            A.equal(r.msg, 'cannotGetUserFromPerm')
            A.equal(await snap4(), before)
        })

        it('CI-G4 perm 內 isAdmin 已被降為 n 之管理員(admin2 列 isAdmin n)之本體 token → verifyClientUser 拒絕、零寫入  [perm 以自身 users 表為權威]', async function() {
            await addUsers([userRow('id-for-admin2', 'admin2', 'n', 'y')])
            let before = await snap4()
            let rows = (await rowsOf('grups')).concat([grupRow('id-ci-g4', 'ci-g4')])
            let r = await callRpc('updateGrups', [rows], TOKEN_ADMIN, { sysToken: TOKEN_ADMIN2 })
            A.equal(r.ok, false)
            A.equal(r.msg, 'userNoPermission')
            A.equal(await snap4(), before)
        })

        it('CI-G5 兩 token 皆有效且為不同使用者(標頭 admin、本體 admin2) → 以本體 token 之使用者執行: 新列之建立者／更新者為 id-for-admin2(既有行為)  [dspec 規則 4: 兩個身分各經完整驗證, 框架不比對兩 token]', async function() {
            await addUsers([userRow('id-for-admin2', 'admin2', 'y', 'y')])
            let rows = (await rowsOf('grups')).concat([grupRow('id-ci-g5', 'ci-g5')])
            let r = await callRpc('updateGrups', [rows], TOKEN_ADMIN, { sysToken: TOKEN_ADMIN2 })
            A.equal(r.ok, true, JSON.stringify(r).slice(0, 300))
            let row = (await rowsOf('grups')).find((g) => g.id === 'id-ci-g5')
            A.ok(row, '新列已寫入')
            A.equal(row.userId, 'id-for-admin2', '建立者為本體 token 之使用者')
            A.equal(row.userIdUpdate, 'id-for-admin2')
        })

        it('CI-G6 失敗記 srLog: event getUserIdByToken-error、msg 為固定語系鍵; log 不含 token 與使用者資料  [dspec 規則 6]', async function() {
            let mark = await markSrLog()
            let r = await callRpc('getWebInfor', [], TOKEN_ADMIN, { sysToken: TOKEN_BAD })
            A.equal(r.ok, false)
            let lines = await waitLines(mark, (l) => l.event === 'getUserIdByToken-error', 'getUserIdByToken-error')
            let ev = lines.find((l) => l.event === 'getUserIdByToken-error')
            A.equal(ev.msg, 'cannotFindUserFromToken')
            let all = JSON.stringify(lines)
            A.ok(!all.includes(TOKEN_BAD), 'log 不得含 token 值')
        })

        it('CI-G7 mappingBy=email: 回傳 perm 內之 id 而非 token 宣稱之 id(稽核欄位為 perm 列之 id)  [WWebPerm.getUserIdByToken 註解: 回 perm users 內該使用者之 id]', async function() {
            //admin2 之 perm 列: id 與 token 宣稱不同('perm-x-admin2' vs 'id-for-admin2'), email 相同 → mappingBy=email 時對應到該列
            await addUsers([userRow('perm-x-admin2', 'admin2', 'y', 'y', { email: 'admin2@example.com' })])
            await restartBackend(genTempSettings({ mappingBy: 'email' }))
            try {
                let rows = (await rowsOf('grups')).concat([grupRow('id-ci-g7', 'ci-g7')])
                let r = await callRpc('updateGrups', [rows], TOKEN_ADMIN, { sysToken: TOKEN_ADMIN2 })
                A.equal(r.ok, true, JSON.stringify(r).slice(0, 300))
                let row = (await rowsOf('grups')).find((g) => g.id === 'id-ci-g7')
                A.equal(row.userId, 'perm-x-admin2', '建立者為 perm 內之 id')
            }
            finally {
                await restartBackend('./settings.json')
            }
        })
    })


    describe('A 函數層級角色檢查(requireAdmin)', function() {

        //通過連線閘(srv.mjs 之 verifyClientUser 放行 id-for-member)但 perm 列 isAdmin='n' 之使用者
        let memberReady = async (isAdmin = 'n', isActive = 'y') => {
            await addUsers([userRow('id-for-member', 'member', isAdmin, isActive)])
        }

        it('CI-A0 前提: member 通過連線閘(唯讀 getWebInfor、資料通道 select 皆成功)', async function() {
            await memberReady()
            let r = await callRpc('getWebInfor', [], TOKEN_MEMBER)
            A.equal(r.ok, true, JSON.stringify(r).slice(0, 200))
            let s = await callRpc('grups.select', [], TOKEN_MEMBER)
            A.equal(s.ok, true)
        })

        for (let kt of KTS) {
            it(`CI-A1 ${FN[kt]}: 通過連線閘之非管理員(perm 列 isAdmin n)被拒 userNotAdmin、零寫入; 管理員照常  [C2、使用者身分驗證原則 二.4]`, async function() {
                await memberReady()
                let before = await snap4()
                let rows = await rowsOf(kt)
                let edited = rows.map((r, k) => (k === 0 ? { ...r, description: 'edited-by-member' } : r))
                let r = await callRpc(FN[kt], [edited], TOKEN_MEMBER)
                A.equal(r.ok, false, `非管理員不得寫入, 實得 ${JSON.stringify(r).slice(0, 200)}`)
                A.equal(r.msg, 'userNotAdmin')
                A.equal(await snap4(), before, '零寫入')
                let ok = await callRpc(FN[kt], [edited], TOKEN_ADMIN)
                A.equal(ok.ok, true, `管理員照常: ${JSON.stringify(ok).slice(0, 200)}`)
                A.equal((await rowsOf(kt))[0].description, 'edited-by-member', '管理員之寫入生效(對照: 同一輸入, 差別只在角色)')
            })
        }

        it('CI-A2 perm 為權威: token 宣稱 isAdmin n、perm 列 isAdmin y 之使用者可呼叫(不採 token 宣稱之值)  [WWebPerm.getTokenUser 註解、requireAdmin]', async function() {
            await memberReady('y')
            let rows = (await rowsOf('grups')).concat([grupRow('id-ci-a2', 'ci-a2')])
            let r = await callRpc('updateGrups', [rows], TOKEN_MEMBER)
            A.equal(r.ok, true, JSON.stringify(r).slice(0, 300))
            A.ok((await rowsOf('grups')).some((g) => g.id === 'id-ci-a2'))
        })

        it('CI-A3 已停用之 member(isActive n)連連線閘都過不了(permission denied), 與角色檢查無關; 對照 CI-A1  [縱深: 兩道獨立]', async function() {
            await memberReady('n', 'n')
            let r = await callRpc('updateGrups', [await rowsOf('grups')], TOKEN_MEMBER)
            A.equal(r.ok, false)
            A.equal(r.msg, 'permission denied')
        })

        it('CI-A4 被拒記 srLog: event requireAdmin-error、msg userNotAdmin、funcName、userId; 無 token 與資料值  [dspec 規則 6]', async function() {
            await memberReady()
            let mark = await markSrLog()
            let rows = (await rowsOf('users')).map((r, k) => (k === 0 ? { ...r, description: 'SENSITIVE-DESC' } : r))
            let r = await callRpc('updateUsers', [rows], TOKEN_MEMBER)
            A.equal(r.msg, 'userNotAdmin')
            let lines = await waitLines(mark, (l) => l.event === 'requireAdmin-error', 'requireAdmin-error')
            let ev = lines.find((l) => l.event === 'requireAdmin-error')
            A.equal(ev.msg, 'userNotAdmin')
            A.equal(ev.funcName, 'updateUsers')
            A.equal(ev.userId, 'id-for-member')
            let all = JSON.stringify(lines)
            A.ok(!all.includes(TOKEN_MEMBER), 'log 不得含 token 值')
            A.ok(!all.includes('SENSITIVE-DESC'), 'log 不得含寫入內容')
        })

        it('CI-A5 唯讀函數不受角色檢查約束(getWebInfor／getStaEvent 等唯讀函數對通過連線閘者可用; 本輪只收斂改變狀態之四個函數)', async function() {
            await memberReady()
            let r = await callRpc('getWebInfor', [], TOKEN_MEMBER)
            A.equal(r.ok, true)
        })
    })
})
