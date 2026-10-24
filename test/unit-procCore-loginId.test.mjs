//後台整表寫入 users 之登入識別撞值檢查(mappingBy='id' 之 O1 規則; perm-run04 範圍一; 規則帳本 R-MAPKEY-04; 規格 dspec/外部匯入之定義與機制.md 第 9 節末)
//
//perm-run05 更新(主控裁示: 不同外部系統之使用者 id 碰撞常見而非同一人; srcKey 須跨來源唯一、不論 isActive): P1／P2 改為不論 isActive 皆算撞值——
//  登入查找不論有效與否計筆, 若匯入／後台存檔放行停用列之撞值, 其後該列轉為有效即造成永久登入拒絕; 故停用列與他來源之外部列皆參與.
//述語(期望由規格推導, 不照實作現況):
//  P1 mappingBy 為 'id'(含省略與不合法值)時, 後台存檔「新增或改變之後台列 id」若等於既有外部列之 srcKey(不論 isActive) → 整次拒收 loginIdCollision、四表零變更、零寫入;
//  P2 「被觸及」＝新增之列或登入識別(類別＋值)與庫內不同之列; 停用改啟用只是狀態改變, 不改變登入識別, 不算被觸及(歷史撞值不因啟用而新擋; 登入時照拒);
//  P3 歷史既有(未被觸及)之撞值不擋: 原樣送回並編修無關列、群組指派(pickKeysOnly)、刪除其中一列皆可存(否則已有歷史資料之庫無法在後台修復);
//  P4 mappingBy 為 'email'／'name' 時不檢查(同一操作可存);
//  P5 被拒時 srLog 記 event=updateTabItems-ckKey-error、key='id'、msg='loginIdCollision'、reason、row(列索引), 不記 id／srcKey 之值;
//  P6 同批多列時任一列撞值即整批拒收(不撞之列的變更亦不寫入).
//受測: server/procCore.mjs 之 updateUsers(內走 updateTabItems; 注入 mappingBy 同 WWebPerm 之 procCore(...) 呼叫)與 server/keyCheck.mjs 之 findLoginIdClash;
//替身: test/tools/unitOrm.mjs(同 unit-procCore-usersKey).
//跑法: npx mocha test/unit-procCore-loginId.test.mjs --reporter list --timeout 60000
import assert from 'assert'
import cloneDeep from 'lodash-es/cloneDeep.js'
import cacheSt from 'wsemi/src/cacheSt.mjs'
import ds from '../src/schema/index.mjs'
import proc from '../server/procCore.mjs'
import { autoDecl } from './tools/declHelper.mjs'
import createLockSave from '../server/lockSave.mjs'
import { mkTable, mkCore, mkSrLog } from './tools/unitOrm.mjs'

const A = assert.strict
const PH = '{新增}'
const T0 = '2026-01-01T00:00:00.000+08:00'
const AUDIT = { userId: 'id-seed', timeCreate: T0, userIdUpdate: 'id-seed', timeUpdate: T0 }
const OMIT = Symbol('omit')
const OK = { ok: true, v: 'saveTabItemsSuccess' }
const REJ = { ok: false, v: 'loginIdCollision' }
const CG = '{"G1":{"mode":"OR","isActive":"y"}}'

let mkUser = (id, o = {}) => ({ ...ds.users.funNew(), ...AUDIT, id, name: id, email: `${id}@x.test`, cgrups: '{}', isAdmin: 'n', isActive: 'y', from: '', description: '', ...o })
//ext: 外部列(srcKey 為來源鍵; id 為本系統配之內部主鍵)
let ext = (id, srcKey, o = {}) => mkUser(id, { from: 'appX', srcKey, ...o })
//nu: 模擬清單頁新增之後台列(稽核欄位為佔位字、transient _isNew); id 由呼叫端給(前端 funNew 產隨機 id, 或使用者在欄位輸入)
let seqNew = 0
let nu = (o = {}) => {
    seqNew++
    return { ...ds.users.funNew(), userId: PH, timeCreate: PH, userIdUpdate: PH, timeUpdate: PH, name: `newbie${seqNew}`, email: `newbie${seqNew}@x.test`, cgrups: '{}', _isNew: true, ...o }
}
let by = (rows, id) => rows.find((r) => r.id === id)

//SEEDS: users 種子
//  base  : 後台列 b1(有效)、b2(停用)、外部列 e1(srcKey 'GUID-1', 有效)、e2(srcKey 'GUID-2', 停用)
//  hist  : 歷史撞值(僅旁路寫庫可造): 後台列 'k'(有效)與外部列 e1(srcKey 'k', 有效); 另有後台列 b1、外部列 e3(srcKey 'GUID-3', 有效)
//  actv  : 後台停用列 'GUID-1'(id 同有效外部列 e1 的 srcKey; 停用時不構成撞值)
//  actv2 : 同 actv, 但外部列 e1 亦停用
const SEEDS = {
    base: () => [mkUser('b1'), mkUser('b2', { isActive: 'n' }), ext('e1', 'GUID-1'), ext('e2', 'GUID-2', { isActive: 'n' })],
    hist: () => [mkUser('b1'), mkUser('k'), ext('e1', 'k'), ext('e3', 'GUID-3')],
    actv: () => [mkUser('b1'), mkUser('GUID-1', { isActive: 'n' }), ext('e1', 'GUID-1')],
    actv2: () => [mkUser('b1'), mkUser('GUID-1', { isActive: 'n' }), ext('e1', 'GUID-1', { isActive: 'n' })],
    //swap: 外部列 K(來源 A, srcKey 'A-key')與外部列 p(來源 B, srcKey 'K'); lockExternalRows 為假時後台可改 from(外審 sol#2)
    swap: () => [mkUser('b1'), ext('K', 'A-key', { from: 'A' }), ext('p', 'K', { from: 'B' })],
    //swap2: 同 swap, 但外部列 K 之 srcKey 恰等於其 id(轉為後台列後登入識別之「值」不變, 只有類別由外部變後台; 外審 sol 第二輪#1)
    swap2: () => [mkUser('b1'), ext('K', 'K', { from: 'A' }), ext('p', 'K', { from: 'B' })],
    //dupsame: 同一來源 A 之兩外部列同 srcKey 'K'(歷史資料; perm-run05 簽章含來源之守護)
    dupsame: () => [mkUser('b1'), ext('p1', 'K', { from: 'A' }), ext('p2', 'K', { from: 'A' })],
    //claim: 來源 A 之外部列 S(srcKey 'K'); 供後台(保護關閉時)新增外部形列 id 'K' 之 claimTwice 形(外審 sol 第一輪#1)
    claim: () => [mkUser('b1'), ext('S', 'K', { from: 'A' })],
    claimOff: () => [mkUser('b1'), ext('S', 'K', { from: 'A', isActive: 'n' })],
}

describe('unit-procCore-loginId (後台整表寫入: mappingBy=id 之登入識別撞值, R-MAPKEY-04)', function() {

    let envs = []

    function createEnv(seedName, mappingBy, extra = {}) {
        let seed = SEEDS[seedName]().map((r, k) => ({ ...r, order: k + 1 }))
        let mk = (table, o) => ({ ...ds[table].funNew(), ...AUDIT, ...o })
        let woItems = {
            users: mkTable(seed),
            grups: mkTable([mk('grups', { id: 'id-g1', order: 1, name: 'G1', cpemis: '{}', from: '' })]),
            pemis: mkTable([mk('pemis', { id: 'id-p1', order: 1, name: 'P1', crules: '{}', from: '' })]),
            targets: mkTable([mk('targets', { id: 'T1', order: 1, description: 'd1' })]),
        }
        let { srLog, logs } = mkSrLog()
        let cst = cacheSt()
        let core = mkCore(ds, woItems)
        let opt = { srLog, ...core.lock, lockSave: createLockSave(cst), ...extra }
        if (mappingBy !== OMIT) {
            opt.mappingBy = mappingBy
        }
        let pc = autoDecl(proc(woItems, core.procOrm, opt), woItems)
        let env = { woItems, logs, cst, core, pc }
        envs.push(env)
        return env
    }

    afterEach(function() {
        envs.forEach((e) => e.cst.clear())
        envs = []
    })

    let run = async (pc, rows, opt) => {
        try {
            return { ok: true, v: await pc.updateUsers('id-admin', rows, opt) }
        }
        catch (err) {
            return { ok: false, v: err }
        }
    }
    let rowsOf = async (woItems) => (await woItems.users.select()).sort((a, b) => a.order - b.order).map((v) => cloneDeep(v))
    let tabs = ['users', 'grups', 'pemis', 'targets']
    let snapAll = (woItems) => Object.fromEntries(tabs.map((t) => [t, woItems[t].snapshot()]))
    let writes = (woItems) => tabs.reduce((a, t) => a + woItems[t].cnt.insert + woItems[t].cnt.save + woItems[t].cnt.del + woItems[t].cnt.delAll, 0)
    let assertRejected = async (e, rows, opt) => {
        let before = snapAll(e.woItems)
        let r = await run(e.pc, cloneDeep(rows), opt)
        A.deepEqual(r, REJ)
        A.deepEqual(snapAll(e.woItems), before, '被拒須四表零變更')
        A.equal(writes(e.woItems), 0, '被拒時不得有任何 insert／save／del／delAll')
    }

    const MODES_ID = ['id', OMIT, '', 'ID', null, 5] //視同 id 的 mappingBy

    it('UL-001 新增後台列 id 等於有效外部列之 srcKey → loginIdCollision(mappingBy 為 id、省略與不合法值皆是)、零寫入  [P1]', async function() {
        for (let mode of MODES_ID) {
            let e = createEnv('base', mode)
            await assertRejected(e, [...(await rowsOf(e.woItems)), nu({ id: 'GUID-1' })])
        }
    })

    it('UL-002 mappingBy 為 email／name 時同一操作可存(不變)  [P4]', async function() {
        for (let mode of ['email', 'name']) {
            let e = createEnv('base', mode)
            let r = await run(e.pc, [...(await rowsOf(e.woItems)), nu({ id: 'GUID-1' })])
            A.deepEqual(r, OK, `mappingBy=${mode}`)
            A.ok(e.woItems.users.has('GUID-1'))
        }
    })

    it('UL-003 新增之後台列為停用、而其 id 等於有效外部列之 srcKey → 仍拒收(不論 isActive; 否則其後轉有效即造成登入永久拒絕)、零寫入; mappingBy 為 email 不檢查  [P1]', async function() {
        let e = createEnv('base', 'id')
        await assertRejected(e, [...(await rowsOf(e.woItems)), nu({ id: 'GUID-1', isActive: 'n' })])
        let e2 = createEnv('base', 'email')
        A.deepEqual(await run(e2.pc, [...(await rowsOf(e2.woItems)), nu({ id: 'GUID-1', isActive: 'n' })]), OK)
    })

    it('UL-004 停用／啟用只是狀態: 歷史撞值之後台停用列改啟用(登入識別不變)不算被觸及 → 可存(歷史撞值不因啟用而新擋; 登入時照拒); mappingBy 為 email 不檢查  [P2]', async function() {
        //actv: 後台停用列 'GUID-1' 與外部列 e1 之 srcKey 'GUID-1' 相同(歷史撞值; 現行入口不可造, 旁路寫庫)
        let e = createEnv('actv', 'id')
        let rows = await rowsOf(e.woItems)
        by(rows, 'GUID-1').isActive = 'y'
        A.deepEqual(await run(e.pc, rows), OK)
        A.equal(e.woItems.users.get('GUID-1').isActive, 'y')
        let e2 = createEnv('actv2', 'id') //外部列亦停用: 同
        let rows2 = await rowsOf(e2.woItems)
        by(rows2, 'GUID-1').isActive = 'y'
        A.deepEqual(await run(e2.pc, rows2), OK)
        let e3 = createEnv('actv', 'email')
        let rows3 = await rowsOf(e3.woItems)
        by(rows3, 'GUID-1').isActive = 'y'
        A.deepEqual(await run(e3.pc, rows3), OK)
    })

    it('UL-005 外部列已停用(srcKey 相同)時新增後台列 → 仍拒收(不論 isActive)、零寫入  [P1]', async function() {
        let e = createEnv('base', 'id')
        await assertRejected(e, [...(await rowsOf(e.woItems)), nu({ id: 'GUID-2' })]) //e2 的 srcKey 'GUID-2' 為停用外部列
    })

    it('UL-006 歷史撞值(後台列 k 與外部列 srcKey k 皆有效)原樣送回並編修無關列 → 可存; 群組指派(pickKeysOnly)可存; 刪除後台列 k(修復)可存  [P3]', async function() {
        let e1 = createEnv('hist', 'id')
        let rows1 = await rowsOf(e1.woItems)
        by(rows1, 'b1').description = 'edited'
        A.deepEqual(await run(e1.pc, rows1), OK)
        A.equal(e1.woItems.users.get('b1').description, 'edited')
        A.ok(e1.woItems.users.has('k') && e1.woItems.users.has('e1'), '撞值兩列皆仍在')

        let e2 = createEnv('hist', 'id')
        let rows2 = await rowsOf(e2.woItems)
        by(rows2, 'k').cgrups = CG
        A.deepEqual(await run(e2.pc, rows2, { pickKeysOnly: ['cgrups'] }), OK)
        A.equal(e2.woItems.users.get('k').cgrups, CG)

        let e3 = createEnv('hist', 'id')
        A.deepEqual(await run(e3.pc, (await rowsOf(e3.woItems)).filter((r) => r.id !== 'k')), OK)
        A.equal(e3.woItems.users.has('k'), false)
    })

    it('UL-007 歷史撞值存在時, 另新增一個 id 等於另一有效外部列 srcKey 之後台列 → 仍擋(新增列被觸及; 歷史撞值不遮蔽新造成者)  [P1+P3]', async function() {
        let e = createEnv('hist', 'id')
        await assertRejected(e, [...(await rowsOf(e.woItems)), nu({ id: 'GUID-3' })])
    })

    it('UL-008 同批多列任一列撞值 → 整批拒收, 不撞之列的變更亦不寫入  [P6]', async function() {
        let e = createEnv('base', 'id')
        let rows = await rowsOf(e.woItems)
        by(rows, 'b1').description = 'edited'
        await assertRejected(e, [...rows, nu({ id: 'fresh-ok' }), nu({ id: 'GUID-1' })])
        A.equal(e.woItems.users.get('b1').description, '', '未被寫入')
        A.equal(e.woItems.users.has('fresh-ok'), false)
    })

    it('UL-009 srLog: event=updateTabItems-ckKey-error 帶 keyTable／key／msg／reason／row, 不含 id／srcKey 之值(個資)  [P5]', async function() {
        let e = createEnv('base', 'id')
        let r = await run(e.pc, [...(await rowsOf(e.woItems)), nu({ id: 'GUID-1' })])
        A.deepEqual(r, REJ)
        let lg = e.logs.find((l) => l.event === 'updateTabItems-ckKey-error')
        A.ok(lg, `應有 updateTabItems-ckKey-error, 實得 ${JSON.stringify(e.logs)}`)
        A.equal(lg.level, 'error')
        A.equal(lg.keyTable, 'users')
        A.equal(lg.key, 'id')
        A.equal(lg.msg, 'loginIdCollision')
        A.ok(typeof lg.reason === 'string' && lg.reason !== '', 'reason')
        A.equal(lg.row, 4, '列索引為新增列(前 4 列為種子)')
        let txt = JSON.stringify(e.logs)
        for (let pii of ['GUID-1', 'GUID-2', 'newbie']) {
            A.equal(txt.includes(pii), false, `srLog 不得出現 id／srcKey／使用者值(${pii}): ${txt}`)
        }
        A.ok(e.logs.some((l) => l.level === 'error' && l.event === 'updateUsers-error' && l.msg === 'loginIdCollision' && l.userId === 'id-admin'), 'errLog 應記錯誤鍵')
    })

    it('UL-010 新增列缺 id(API 直打, 由 ORM 補隨機主鍵)不構成撞值檢查之對象 → 可存且確實新增(外審 sol#3: 不只驗成功回應)  [邊界: 無從比對的列不誤擋]', async function() {
        let e = createEnv('base', 'id')
        let nr = nu({})
        delete nr.id
        let before = await rowsOf(e.woItems)
        A.deepEqual(await run(e.pc, [...before, nr]), OK)
        let after = await rowsOf(e.woItems)
        A.equal(after.length, before.length + 1, '新增一列')
        let added = after.find((r) => r.name === nr.name)
        A.ok(added && typeof added.id === 'string' && added.id !== '', `新列應有 ORM 補之非空 id, 實得 ${JSON.stringify(added)}`)
        A.equal(added.email, nr.email)
        A.equal(added.from, '')
        for (let b of before) {
            A.deepEqual(after.find((r) => r.id === b.id), b, `既有列 ${b.id} 不變`)
        }
    })

    it('UL-012 lockExternalRows 為假時後台可改 from: 外部列改為後台列而其 id 等於他來源有效外部列之 srcKey → loginIdCollision、零變更(登入識別值改變即被觸及; 外審 sol#2)  [P1: 觸及含登入識別改變]', async function() {
        for (let mode of ['id', OMIT]) {
            let e = createEnv('swap', mode, { lockExternalRows: false })
            let rows = await rowsOf(e.woItems)
            by(rows, 'K').from = '' //外部列(srcKey 'A-key')→ 後台列(登入識別由 'A-key' 變為 id 'K'), 撞來源 B 之有效外部列 p(srcKey 'K')
            await assertRejected(e, rows)
        }
        //mappingBy 為 email／name 不檢查
        for (let mode of ['email', 'name']) {
            let e = createEnv('swap', mode, { lockExternalRows: false })
            let rows = await rowsOf(e.woItems)
            by(rows, 'K').from = ''
            A.deepEqual(await run(e.pc, rows), OK, `mappingBy=${mode}`)
        }
        //預設(外部列保護啟用): 同一操作被既有外部列守門先拒(perm-run03 之錯誤鍵 saveExternalRowChanged 不變; 撞值檢查置於外部列守門之後, 不改變既有拒收之優先序)
        let e3 = createEnv('swap', 'id')
        let rows3 = await rowsOf(e3.woItems)
        by(rows3, 'K').from = ''
        let before3 = snapAll(e3.woItems)
        A.deepEqual(await run(e3.pc, rows3), { ok: false, v: 'saveExternalRowChanged' })
        A.deepEqual(snapAll(e3.woItems), before3, '零變更')
    })

    it('UL-014 lockExternalRows 為假: 外部列改為後台列而 srcKey 恰等於 id(登入識別之值不變、類別由外部變後台)而撞他來源有效外部列 → loginIdCollision、零變更(外審 sol 第二輪#1)', async function() {
        let e = createEnv('swap2', 'id', { lockExternalRows: false })
        let rows = await rowsOf(e.woItems)
        by(rows, 'K').from = ''
        await assertRejected(e, rows)
        let e2 = createEnv('swap2', 'id', { lockExternalRows: false })
        A.deepEqual(await run(e2.pc, await rowsOf(e2.woItems)), OK, '原樣送回(歷史上兩外部列同 srcKey)不被誤擋')
    })

    it('UL-015 lockExternalRows 為假: 歷史撞值原樣送回、無關欄位修改、刪除其一皆可存, 且資料結果正確(外審 sol 第二輪#2: 非預設設定下「被觸及」不得擴張為全部列)', async function() {
        let e1 = createEnv('hist', 'id', { lockExternalRows: false })
        let rows1 = await rowsOf(e1.woItems)
        by(rows1, 'b1').description = 'edited-unlocked'
        A.deepEqual(await run(e1.pc, rows1), OK)
        A.equal(e1.woItems.users.get('b1').description, 'edited-unlocked')
        A.ok(e1.woItems.users.has('k') && e1.woItems.users.has('e1'), '撞值兩列皆仍在')
        let e2 = createEnv('hist', 'id', { lockExternalRows: false })
        let rows2 = await rowsOf(e2.woItems)
        by(rows2, 'e1').description = 'ext-edited-unlocked' //外部列之非鎖定欄位於保護關閉時可改
        A.deepEqual(await run(e2.pc, rows2), OK)
        A.equal(e2.woItems.users.get('e1').description, 'ext-edited-unlocked')
        let e3 = createEnv('hist', 'id', { lockExternalRows: false })
        A.deepEqual(await run(e3.pc, (await rowsOf(e3.woItems)).filter((r) => r.id !== 'k')), OK)
        A.equal(e3.woItems.users.has('k'), false)
    })

    it('UL-013 lockExternalRows 為假: 登入識別值改變但無撞值 → 可存; 原樣送回(含歷史撞值)不被誤擋  [P3: 只擋被觸及且撞值者]', async function() {
        let e = createEnv('swap', 'id', { lockExternalRows: false })
        let rows = await rowsOf(e.woItems)
        by(rows, 'p').from = '' //登入識別由 'K' 變為 id 'p': 無他列以 'p' 為 srcKey
        A.deepEqual(await run(e.pc, rows), OK)
        A.equal(e.woItems.users.get('p').from, '')
        let e2 = createEnv('swap', 'id', { lockExternalRows: false })
        A.deepEqual(await run(e2.pc, await rowsOf(e2.woItems)), OK, '原樣送回')
    })

    it('UL-016 lockExternalRows 為假: 外部列只換 from(類別仍為外部、srcKey 不變)而與他來源同值 → 登入識別之來源改變即被觸及 → loginIdCollision、零變更; 同一來源之兩列同 srcKey 原樣送回(歷史, 同來源不算撞)可存(perm-run05 簽章含來源)', async function() {
        //dupsame: 同一來源 A 之兩外部列同 srcKey 'K'(歷史資料; 同來源由 srcKeyDuplicate／srcKeyConflict 處理, 非登入識別撞值)
        let e0 = createEnv('dupsame', 'id', { lockExternalRows: false })
        A.deepEqual(await run(e0.pc, await rowsOf(e0.woItems)), OK, '同來源同 srcKey 原樣送回可存')
        let e = createEnv('dupsame', 'id', { lockExternalRows: false })
        let rows = await rowsOf(e.woItems)
        by(rows, 'p2').from = 'B' //登入識別 (x:A,'K') → (x:B,'K'): 值與類別(外部)不變, 來源改變, 與 p1(A,'K') 成為跨來源同值
        await assertRejected(e, rows)
    })

    it('UL-017 lockExternalRows 為假: 後台新增外部形列(from 非空、無 srcKey), 其 id 等於同來源既有外部列之 srcKey(claimTwice 形; 登入命中兩筆、同步端回 srcKeyConflict; 外審 sol 第一輪#1) → loginIdCollision、零變更, reason srcKeyClaimTwice; 預設(外部列保護啟用)則由外部列守門先拒 saveFromNotAllowed', async function() {
        let e = createEnv('claim', 'id', { lockExternalRows: false })
        await assertRejected(e, [...(await rowsOf(e.woItems)), nu({ id: 'K', from: 'A' })])
        let lg = e.logs.find((l) => l.event === 'updateTabItems-ckKey-error')
        A.ok(lg && lg.reason === 'srcKeyClaimTwice', `reason 應為 srcKeyClaimTwice, 實得 ${JSON.stringify(lg)}`)
        //不論雙方 isActive(含停用與非標準值): 既有外部列有效／停用 × 新增列各取值皆拒、零寫入(外審 sol 第二輪#2)
        for (let seedName of ['claim', 'claimOff']) {
            for (let v of ['y', 'n', 'Y', true, '', undefined]) {
                let ev = createEnv(seedName, 'id', { lockExternalRows: false })
                await assertRejected(ev, [...(await rowsOf(ev.woItems)), nu({ id: 'K', from: 'A', isActive: v })])
            }
        }
        //id 不同於對方 srcKey 的外部形列可存(無撞值)
        let e2 = createEnv('claim', 'id', { lockExternalRows: false })
        A.deepEqual(await run(e2.pc, [...(await rowsOf(e2.woItems)), nu({ id: 'K2', from: 'A' })]), OK)
        //預設(外部列保護啟用): 後台不得新增 from 非空之列, 由外部列守門先拒(perm-run03 錯誤優先序不變)
        let e3 = createEnv('claim', 'id')
        let before3 = snapAll(e3.woItems)
        A.deepEqual(await run(e3.pc, [...(await rowsOf(e3.woItems)), nu({ id: 'K', from: 'A' })]), { ok: false, v: 'saveFromNotAllowed' })
        A.deepEqual(snapAll(e3.woItems), before3, '零變更')
    })

    it('UL-011 後台列既有 id 不變、其他欄位改動 → 不是改變 id, 不擋(例: 有效後台列 b1 改描述, 而外部列 srcKey 與之無關)  [P3]', async function() {
        let e = createEnv('base', 'id')
        let rows = await rowsOf(e.woItems)
        by(rows, 'b1').description = 'edited'
        A.deepEqual(await run(e.pc, rows), OK)
    })
})
