//宣告強制必帶 × users 之 pickKeysOnly 模式(modeEditUsers='for:grups')(perm-run03 範圍一補測; 規則帳本 R-REF-IDENTITY-01 規則 10).
//
//背景: WWebPerm 於 modeEditUsers='for:grups' 時強制 opt.pickKeysOnly=['cgrups'](伺服端設定, 用戶端不得給): updateUsers 只採納既有使用者之 cgrups 變更, 其餘欄位／新增／刪除／順序以庫內為準.
//此模式下「改變引用」仍須宣告——必帶判定走同一個 checkRefIdentity, 以合併後(庫內列為底、只覆蓋 cgrups)之 add／diff 為準.
//跑法: npx mocha test/unit-procCore-identityPick.test.mjs --timeout 60000
//受測: server/procCore.mjs:updateTabItems(pickKeysOnly 分支)＋src/js/refIdentity.mjs:checkRefIdentity. 資料表以記憶體替身(test/tools/unitOrm.mjs)取代; 此檔不包 autoDecl(直接測宣告本身).
import assert from 'assert'
import cloneDeep from 'lodash-es/cloneDeep.js'
import cacheSt from 'wsemi/src/cacheSt.mjs'
import ds from '../src/schema/index.mjs'
import proc from '../server/procCore.mjs'
import createLockSave from '../server/lockSave.mjs'
import { mkTable, mkCore, mkSrLog } from './tools/unitOrm.mjs'


const T0 = '2026-01-01T00:00:00.000+08:00'
const AUDIT = { userId: 'id-seed', timeCreate: T0, userIdUpdate: 'id-seed', timeUpdate: T0 }
const OR = { mode: 'OR', isActive: 'y' }
let J = (o) => JSON.stringify(o)

function seed() {
    let mk = (t, o) => ({ ...ds[t].funNew(), ...AUDIT, ...o })
    return {
        users: [
            mk('users', { id: 'id-u1', order: 1, name: 'u1', email: 'u1@example.com', description: 'd1', from: '', cgrups: J({ G1: OR }), isAdmin: 'n', isActive: 'y' }),
            mk('users', { id: 'id-u2', order: 2, name: 'u2', email: 'u2@example.com', description: 'd2', from: '', cgrups: '{}', isAdmin: 'n', isActive: 'y' }),
        ],
        grups: [
            mk('grups', { id: 'id-g1', order: 1, name: 'G1', cpemis: '{}', from: '' }),
            mk('grups', { id: 'id-g2', order: 2, name: 'G2', cpemis: '{}', from: '' }),
        ],
        pemis: [],
        targets: [],
    }
}

describe('unit-procCore-identityPick (宣告必帶 × pickKeysOnly, perm-run03)', function() {

    this.timeout(60000)

    let envs = []
    function createEnv() {
        let sd = seed()
        let woItems = {}
        for (let t of Object.keys(sd)) {
            woItems[t] = mkTable(sd[t])
        }
        let { srLog, logs } = mkSrLog()
        let cst = cacheSt()
        let core = mkCore(ds, woItems)
        let pc = proc(woItems, core.procOrm, { srLog, ...core.lock, lockSave: createLockSave(cst) })
        let env = { woItems, logs, cst, pc }
        envs.push(env)
        return env
    }
    afterEach(function() {
        envs.forEach((e) => e.cst.clear())
        envs = []
    })

    //run: pickKeysOnly 由伺服端設定(此處以 opt 直接給, 同 WWebPerm 的 modeEditUsers='for:grups' 分支); 回 { ok, v }
    let run = async (env, rows, opt = {}) => {
        try {
            return { ok: true, v: await env.pc.updateUsers('id-admin', cloneDeep(rows), { pickKeysOnly: ['cgrups'], ...opt }) }
        }
        catch (err) {
            return { ok: false, v: err }
        }
    }
    let snap = (env) => env.woItems.users.snapshot()
    let cnt = (env) => env.woItems.users.cnt.insert + env.woItems.users.cnt.save + env.woItems.users.cnt.del + env.woItems.users.cnt.delAll
    let rowsOf = (env) => JSON.parse(env.woItems.users.snapshot()).sort((a, b) => a.order - b.order)

    it('IDP-1 pickKeysOnly 下新增引用而無宣告 → saveIdentityRequired、零寫入、被引用表不讀不取鎖  [R-REF-IDENTITY-01 規則 10]', async function() {
        let env = createEnv()
        let rows = rowsOf(env).map((u) => (u.id === 'id-u2' ? { ...u, cgrups: J({ G2: OR }) } : u))
        let before = snap(env)
        let r = await run(env, rows)
        assert.strictEqual(r.ok, false)
        assert.strictEqual(r.v, 'saveIdentityRequired')
        assert.strictEqual(snap(env), before)
        assert.strictEqual(cnt(env), 0)
        assert.strictEqual(env.woItems.grups.cnt.insert + env.woItems.grups.cnt.save + env.woItems.grups.cnt.del, 0, '被引用表零寫入')
    })

    it('IDP-2 pickKeysOnly 下附完整宣告 → 成功, 只有 cgrups 變更被採納(其餘欄位以庫內為準)  [對照]', async function() {
        let env = createEnv()
        let rows = rowsOf(env).map((u) => (u.id === 'id-u2' ? { ...u, cgrups: J({ G2: OR }), description: 'TAMPERED', isAdmin: 'y' } : u))
        let r = await run(env, rows, { refs: [{ name: 'G2', ids: ['id-g2'] }] })
        assert.strictEqual(r.ok, true, JSON.stringify(r.v))
        let u2 = rowsOf(env).find((u) => u.id === 'id-u2')
        assert.strictEqual(u2.cgrups, J({ G2: OR }))
        assert.strictEqual(u2.description, 'd2', '非 cgrups 欄位不採納')
        assert.strictEqual(u2.isAdmin, 'n')
    })

    it('IDP-3 pickKeysOnly 下移除引用而無宣告 → saveIdentityRequired(移除亦須宣告)  [規則 10]', async function() {
        let env = createEnv()
        let rows = rowsOf(env).map((u) => (u.id === 'id-u1' ? { ...u, cgrups: '{}' } : u))
        let before = snap(env)
        let r = await run(env, rows)
        assert.strictEqual(r.v, 'saveIdentityRequired')
        assert.strictEqual(snap(env), before)
        let ok = await run(env, rows, { refs: [{ name: 'G1', ids: ['id-g1'] }] })
        assert.strictEqual(ok.ok, true, JSON.stringify(ok.v))
        assert.strictEqual(rowsOf(env).find((u) => u.id === 'id-u1').cgrups, '{}')
    })

    it('IDP-4 pickKeysOnly 下客戶端送來被忽略之欄位變更(不是引用變更)不需宣告  [不改變引用者照常]', async function() {
        let env = createEnv()
        let rows = rowsOf(env).map((u) => (u.id === 'id-u1' ? { ...u, description: 'ignored', isAdmin: 'y' } : u))
        let r = await run(env, rows)
        assert.strictEqual(r.ok, true, JSON.stringify(r.v))
        assert.strictEqual(rowsOf(env).find((u) => u.id === 'id-u1').description, 'd1', '被忽略')
    })

    it('IDP-5 宣告 ids 與被引用表不符 → saveRefChanged、零寫入(pickKeysOnly 下同)', async function() {
        let env = createEnv()
        let rows = rowsOf(env).map((u) => (u.id === 'id-u2' ? { ...u, cgrups: J({ G2: OR }) } : u))
        let before = snap(env)
        let r = await run(env, rows, { refs: [{ name: 'G2', ids: ['id-OTHER'] }] })
        assert.strictEqual(r.v, 'saveRefChanged')
        assert.strictEqual(snap(env), before)
    })
})
