//外部匯入核心(依來源鍵 srcKey 差異同步)單元測試: perm-run03 範圍二; 規格(真理源) C:\opensrcOper\dspec\外部匯入之定義與機制.md 第 3～10 節; 規則帳本 R-IMPORT-01.
//
//受測: server/syncCore.mjs(POST /syncAndReplaceTabs 之核心). 依賴一律用真實實作——w-serv-orm 實例(mkCore: 真 procOrm／withTabLocks／guardWrite)、wsemi 驗證函數、
//server/cascadeWrite.mjs(引用連帶寫入與補償)、server/procCore.mjs(I11 與後台存檔交錯)——僅資料表以記憶體替身(test/tools/unitOrm.mjs mkTable, 可注入失敗)取代 w-orm-lmdb.
//規格第 10 節驗收 I1～I15 各至少一案(SC-I1…SC-I15); 另含 targets(id＝srcKey)、欄位歸屬、srcKey 重編警示、庫內異常配對、回傳形狀.
//拒收案例一律斷言「零寫入」: 四表逐位元不變(snapshot)且四表寫入計數(insert／save／del／delAll)皆為 0.
//跑法: npx mocha test/unit-syncCore.test.mjs --timeout 60000
import assert from 'assert'
import cloneDeep from 'lodash-es/cloneDeep.js'
import cacheSt from 'wsemi/src/cacheSt.mjs'
import ds from '../src/schema/index.mjs'
import syncCore from '../server/syncCore.mjs'
import proc from '../server/procCore.mjs'
import createLockSave from '../server/lockSave.mjs'
import { autoDecl } from './tools/declHelper.mjs'
import { makeBaseline } from '../src/js/rowDigest.mjs'
import { mkTable, mkCore, mkSrLog } from './tools/unitOrm.mjs'


const T0 = '2026-01-01T00:00:00.000+08:00'
const AUDIT = { userId: 'id-seed', timeCreate: T0, userIdUpdate: 'id-seed', timeUpdate: T0 }
const TABLES = ['users', 'targets', 'grups', 'pemis']
const OR = { mode: 'OR', isActive: 'y' }
let J = (o) => JSON.stringify(o)
const APP = 'id-for-application' //外部應用(app 權杖)之使用者 id: 匯入之更新者

//seedRows: 後台列(from '')與他來源之列(from 'other'), 供「永不觸及」與「撞名」案例
//  targets: T1(後台)／T2(other)　pemis: P1(後台)／P2(other)　grups: G1(後台){P1}／G2(other){P2}　users: u1(後台){G1}／u2(other)
const T1 = '專案A/頁1/區塊1'
const T2 = '專案O/頁1/區塊1'
function seedRows() {
    let mk = (table, o) => ({ ...ds[table].funNew(), ...AUDIT, ...o })
    return {
        targets: [
            mk('targets', { id: T1, order: 1, description: 'd-t1', from: '' }),
            mk('targets', { id: T2, order: 2, description: 'd-t2', from: 'other', srcKey: T2 }),
        ],
        pemis: [
            mk('pemis', { id: 'id-p1', order: 1, name: 'P1', description: 'd-p1', from: '', crules: J({ [T1]: 'y' }) }),
            mk('pemis', { id: 'id-p2', order: 2, name: 'P2', description: 'd-p2', from: 'other', srcKey: 'o-p2', crules: J({ [T2]: 'y' }) }),
        ],
        grups: [
            mk('grups', { id: 'id-g1', order: 1, name: 'G1', description: 'd-g1', from: '', cpemis: J({ P1: OR }) }),
            mk('grups', { id: 'id-g2', order: 2, name: 'G2', description: 'd-g2', from: 'other', srcKey: 'o-g2', cpemis: J({ P2: OR }) }),
        ],
        users: [
            mk('users', { id: 'id-u1', order: 1, name: 'u1', email: 'u1@example.com', description: 'd-u1', from: '', cgrups: J({ G1: OR }), isAdmin: 'n', isActive: 'y' }),
            mk('users', { id: 'id-u2', order: 2, name: 'u2', email: 'u2@example.com', description: 'd-u2', from: 'other', srcKey: 'o-u2', cgrups: '{}', isAdmin: 'n', isActive: 'y' }),
        ],
    }
}

describe('unit-syncCore (外部匯入依 srcKey 差異同步, perm-run03, R-IMPORT-01)', function() {

    this.timeout(60000)

    let envs = []

    //createEnv: 每案一組全新之替身資料表、真 w-serv-orm 實例與 syncCore; opt.seed(seed) 改種子; opt.fail 為 { 表名: mkTable 之 fail 注入 }; opt.mappingBy／opt.cascadeRename 轉給 syncCore
    function createEnv(opt = {}) {
        let seed = seedRows()
        if (opt.seed) {
            opt.seed(seed)
        }
        let woItems = {}
        for (let t of TABLES) {
            woItems[t] = mkTable(seed[t], (opt.fail || {})[t] || {})
        }
        let { srLog, logs } = mkSrLog()
        let cst = cacheSt()
        let core = mkCore(ds, woItems)
        let sc = syncCore({ woItems, procOrm: core.procOrm, lockTabs: core.withTabLocks, srLog, mappingBy: opt.mappingBy || 'id', cascadeRename: opt.cascadeRename !== false })
        let pc = autoDecl(proc(woItems, core.procOrm, { srLog, ...core.lock, lockSave: createLockSave(cst) }), woItems)
        let env = { seed, woItems, logs, cst, core, sc, pc }
        envs.push(env)
        return env
    }

    afterEach(function() {
        envs.forEach((e) => e.cst.clear())
        envs = []
    })

    //sync: 回 { ok, v }(成功為計數物件, 失敗為固定語系鍵字串)
    let sync = async (env, kt, from, rows) => {
        try {
            return { ok: true, v: await env.sc.syncAndReplaceTabs(APP, { from, rows }, kt) }
        }
        catch (err) {
            return { ok: false, v: err }
        }
    }
    let snapAll = (env) => JSON.stringify(TABLES.map((t) => env.woItems[t].snapshot()))
    //assertSnapEq: 四表整體與 before(snapAll 之回傳)逐位元相同; 不同時指出第一個差異之表與列(除錯用)
    let assertSnapEq = (env, before, msg) => {
        let now = snapAll(env)
        if (now === before) {
            return
        }
        let a = JSON.parse(before).map((s) => JSON.parse(s))
        let b = JSON.parse(now).map((s) => JSON.parse(s))
        let hint = ''
        TABLES.forEach((t, k) => {
            let ids = new Set([...a[k].map((r) => r.id), ...b[k].map((r) => r.id)])
            ids.forEach((id) => {
                let x = a[k].find((r) => r.id === id)
                let y = b[k].find((r) => r.id === id)
                if (hint === '' && JSON.stringify(x) !== JSON.stringify(y)) {
                    hint = ` [${t}/${id}: 前=${JSON.stringify(x)} 後=${JSON.stringify(y)}]`
                }
            })
        })
        assert.fail(`${msg}${hint}`)
    }
    let cntAll = (env) => TABLES.reduce((a, t) => a + env.woItems[t].cnt.insert + env.woItems[t].cnt.save + env.woItems[t].cnt.del + env.woItems[t].cnt.delAll, 0)
    let rowsOf = (env, kt, from) => JSON.parse(env.woItems[kt].snapshot()).filter((r) => r.from === from).sort((a, b) => a.order - b.order)
    let bySrc = (env, kt, from, k) => rowsOf(env, kt, from).find((r) => r.srcKey === k)

    //zeroWrite: 被拒之批次——四表逐位元不變、零次寫入呼叫(I7／I8／I9／I13)
    let assertRejected = async (env, kt, from, rows, key) => {
        let before = snapAll(env)
        let r = await sync(env, kt, from, rows)
        assert.strictEqual(r.ok, false, `應被拒, 實得 ${JSON.stringify(r.v)}`)
        assert.strictEqual(r.v, key, `錯誤鍵應為 ${key}, 實得 ${String(r.v)}`)
        assertSnapEq(env, before, '被拒時四表須逐位元不變')
        assert.strictEqual(cntAll(env), 0, '被拒時不得有任何寫入呼叫')
    }

    //批次夾具: 每列 { srcKey, …外部擁有欄位 }(不帶 id)
    const G = (srcKey, name, extra = {}) => ({ srcKey, name, description: `d-${srcKey}`, order: 10, cpemis: J({ P1: OR }), ...extra })
    const U = (srcKey, name, extra = {}) => ({ srcKey, name, email: `${name}@ext.example.com`, description: `d-${srcKey}`, order: 10, isAdmin: 'n', isActive: 'y', cgrups: J({ G1: OR }), ...extra })
    const P = (srcKey, name, extra = {}) => ({ srcKey, name, description: `d-${srcKey}`, order: 10, crules: J({ [T1]: 'y' }), ...extra })
    const TG = (srcKey, extra = {}) => ({ srcKey, description: `d-${srcKey}`, order: 10, ...extra })


    describe('I1 冪等: 同一批次重送', function() {

        for (let kt of ['users', 'grups', 'pemis', 'targets']) {
            it(`SC-I1-${kt} 第二次重送: nAdd=nUpdate=nDel=0、nSame=全數、零寫入、id 不變、全表逐位元不變  [spec §6 冪等、§10 I1]`, async function() {
                let env = createEnv()
                let batch = (kt === 'users') ? [U('a', 'ua'), U('b', 'ub')] : ((kt === 'grups') ? [G('a', 'GA'), G('b', 'GB')] : ((kt === 'pemis') ? [P('a', 'PA'), P('b', 'PB')] : [TG('專案X/頁1/區塊1'), TG('專案X/頁1/區塊2')]))
                let r1 = await sync(env, kt, 'appX', cloneDeep(batch))
                assert.deepStrictEqual(r1.v, { nAdd: 2, nUpdate: 0, nDel: 0, nSame: 0 }, '首次全為新增')
                let ids1 = rowsOf(env, kt, 'appX').map((r) => r.id)
                let snap1 = snapAll(env)
                let cnt1 = cntAll(env)
                let r2 = await sync(env, kt, 'appX', cloneDeep(batch))
                assert.deepStrictEqual(r2.v, { nAdd: 0, nUpdate: 0, nDel: 0, nSame: 2 })
                assert.deepStrictEqual(rowsOf(env, kt, 'appX').map((r) => r.id), ids1, 'id 不變')
                assert.strictEqual(cntAll(env), cnt1, '重送零寫入(寫入計數不增)')
                assertSnapEq(env, snap1, '全表逐位元不變(含更新者／更新時間)')
            })
        }

        it('SC-I1-base 重送後表之載入基準不變(後台持重送前取得之基準存檔不被判過期)  [spec §6: 表之基準不變]', async function() {
            let env = createEnv()
            await sync(env, 'grups', 'appX', [G('a', 'GA')])
            let rows = rowsOf(env, 'grups', '').concat(rowsOf(env, 'grups', 'other'), rowsOf(env, 'grups', 'appX')).sort((a, b) => a.order - b.order)
            let all = JSON.parse(env.woItems.grups.snapshot()).sort((a, b) => a.order - b.order)
            let baseline = makeBaseline(all, 'grups')
            await sync(env, 'grups', 'appX', [G('a', 'GA')]) //同批重送
            let r = await env.pc.updateGrups('id-admin', cloneDeep(all), { baseline })
            assert.strictEqual(r, 'saveTabItemsSuccess', `重送不應使舊基準過期, 實得 ${String(r)}  (rows ${rows.length})`)
        })
    })


    describe('I2 新增 / I3 刪除 / I4 修改 / I5 改名', function() {

        it('SC-I2 批次多一列: nAdd=1、配新 id(非 srcKey)、其餘列(含他來源與後台)逐位元不動  [spec §10 I2]', async function() {
            let env = createEnv()
            await sync(env, 'grups', 'appX', [G('a', 'GA')])
            let before = JSON.parse(snapAllOf(env, 'grups'))
            let r = await sync(env, 'grups', 'appX', [G('a', 'GA'), G('b', 'GB')])
            assert.deepStrictEqual(r.v, { nAdd: 1, nUpdate: 0, nDel: 0, nSame: 1 })
            let added = bySrc(env, 'grups', 'appX', 'b')
            assert.ok(added && added.id !== 'b' && added.id.length > 8, '新列配新 id(uuid)而非 srcKey')
            assert.strictEqual(added.userIdUpdate, APP, '寫入者記為 app 使用者')
            let after = JSON.parse(snapAllOf(env, 'grups'))
            for (let b of before) {
                assert.deepStrictEqual(after.find((x) => x.id === b.id), b, `既有列 ${b.id} 不得被動`)
            }
        })

        it('SC-I2-targets 標的新增: id＝srcKey(標的名稱, 被 pemis.crules 以名稱引用)  [設計決定: targets 之 id 即名稱]', async function() {
            let env = createEnv()
            let r = await sync(env, 'targets', 'appX', [TG('專案X/頁1/區塊1')])
            assert.deepStrictEqual(r.v, { nAdd: 1, nUpdate: 0, nDel: 0, nSame: 0 })
            let row = rowsOf(env, 'targets', 'appX')[0]
            assert.strictEqual(row.id, '專案X/頁1/區塊1')
            assert.strictEqual(row.srcKey, '專案X/頁1/區塊1')
        })

        it('SC-I3 批次少一列: 該列刪除、引用連帶清理(grups 被刪 → users.cgrups 移除該項)、同 from 其他列不動  [spec §10 I3、§8、原則 6]', async function() {
            let env = createEnv()
            await sync(env, 'grups', 'appX', [G('a', 'GA'), G('b', 'GB')])
            let ga = bySrc(env, 'grups', 'appX', 'a')
            //後台使用者 u1 另引用 GA(以後台存檔設定: 直接改替身, 模擬已持久之引用)
            let u1 = JSON.parse(env.woItems.users.snapshot()).find((u) => u.id === 'id-u1')
            await env.woItems.users.save({ ...u1, cgrups: J({ G1: OR, GA: OR }) })
            let r = await sync(env, 'grups', 'appX', [G('b', 'GB')])
            assert.deepStrictEqual(r.v, { nAdd: 0, nUpdate: 0, nDel: 1, nSame: 1 })
            assert.strictEqual(bySrc(env, 'grups', 'appX', 'a'), undefined, '已刪')
            assert.ok(!JSON.parse(env.woItems.grups.snapshot()).some((g) => g.id === ga.id))
            let u1After = JSON.parse(env.woItems.users.snapshot()).find((u) => u.id === 'id-u1')
            assert.deepStrictEqual(Object.keys(JSON.parse(u1After.cgrups)), ['G1'], '被刪群組之引用須連帶清理, 其他引用不動')
            assert.strictEqual(u1After.userIdUpdate, APP, '引用端寫入者記為操作者')
        })

        it('SC-I4 外部擁有欄位改變: nUpdate=1、id 不變、建立者／建立時間不變、更新者為 app、其他欄位原樣  [spec §10 I4、§4]', async function() {
            let env = createEnv()
            await sync(env, 'users', 'appX', [U('a', 'ua'), U('b', 'ub')])
            let a0 = bySrc(env, 'users', 'appX', 'a')
            let b0 = bySrc(env, 'users', 'appX', 'b')
            let r = await sync(env, 'users', 'appX', [U('a', 'ua', { description: 'changed', isActive: 'n' }), U('b', 'ub')])
            assert.deepStrictEqual(r.v, { nAdd: 0, nUpdate: 1, nDel: 0, nSame: 1 })
            let a1 = bySrc(env, 'users', 'appX', 'a')
            assert.strictEqual(a1.id, a0.id)
            assert.strictEqual(a1.description, 'changed')
            assert.strictEqual(a1.isActive, 'n')
            assert.strictEqual(a1.userId, a0.userId)
            assert.strictEqual(a1.timeCreate, a0.timeCreate)
            assert.strictEqual(a1.userIdUpdate, APP)
            assert.deepStrictEqual(bySrc(env, 'users', 'appX', 'b'), b0, '未改之列逐位元不動')
        })

        it('SC-I5 同 srcKey 改名: 視為修改(id 不變), 以名稱引用者跟著改(users.cgrups 內 GA → GA2)  [spec §10 I5、原則 6]', async function() {
            let env = createEnv()
            await sync(env, 'grups', 'appX', [G('a', 'GA')])
            let ga = bySrc(env, 'grups', 'appX', 'a')
            let u1 = JSON.parse(env.woItems.users.snapshot()).find((u) => u.id === 'id-u1')
            await env.woItems.users.save({ ...u1, cgrups: J({ G1: OR, GA: OR }) })
            let r = await sync(env, 'grups', 'appX', [G('a', 'GA2')])
            assert.deepStrictEqual(r.v, { nAdd: 0, nUpdate: 1, nDel: 0, nSame: 0 })
            assert.strictEqual(bySrc(env, 'grups', 'appX', 'a').id, ga.id, 'id 不變')
            assert.strictEqual(bySrc(env, 'grups', 'appX', 'a').name, 'GA2')
            let u1After = JSON.parse(env.woItems.users.snapshot()).find((u) => u.id === 'id-u1')
            assert.deepStrictEqual(Object.keys(JSON.parse(u1After.cgrups)).sort(), ['G1', 'GA2'], '引用跟著改名')
        })

        it('SC-I5-off cascadeRename:false 時同 srcKey 改名仍為修改(id 不變), 但引用不跟著改(成為懸空)  [opt.cascadeRename]', async function() {
            let env = createEnv({ cascadeRename: false })
            await sync(env, 'grups', 'appX', [G('a', 'GA')])
            let u1 = JSON.parse(env.woItems.users.snapshot()).find((u) => u.id === 'id-u1')
            await env.woItems.users.save({ ...u1, cgrups: J({ G1: OR, GA: OR }) })
            let r = await sync(env, 'grups', 'appX', [G('a', 'GA2')])
            assert.deepStrictEqual(r.v, { nAdd: 0, nUpdate: 1, nDel: 0, nSame: 0 })
            let u1After = JSON.parse(env.woItems.users.snapshot()).find((u) => u.id === 'id-u1')
            assert.deepStrictEqual(Object.keys(JSON.parse(u1After.cgrups)).sort(), ['G1', 'GA'], '關閉級聯: 引用原樣(懸空)')
        })

        it('SC-I3-new 名稱相同、srcKey 不同 ＝ 刪舊增新: 新實體不繼承引用(舊 GA 被引用於 u1, 換 srcKey 後 u1 之 GA 引用被清, 不被同名新群組接管)  [原則 6]', async function() {
            let env = createEnv()
            await sync(env, 'grups', 'appX', [G('a', 'GA')])
            let u1 = JSON.parse(env.woItems.users.snapshot()).find((u) => u.id === 'id-u1')
            await env.woItems.users.save({ ...u1, cgrups: J({ G1: OR, GA: OR }) })
            let r = await sync(env, 'grups', 'appX', [G('a2', 'GA')])
            assert.deepStrictEqual(r.v, { nAdd: 1, nUpdate: 0, nDel: 1, nSame: 0 })
            let u1After = JSON.parse(env.woItems.users.snapshot()).find((u) => u.id === 'id-u1')
            assert.deepStrictEqual(Object.keys(JSON.parse(u1After.cgrups)), ['G1'])
        })

        it('SC-I3-targets 標的被刪: 引用它之 pemis.crules 項目連帶清理  [原則 6]', async function() {
            let env = createEnv()
            await sync(env, 'targets', 'appX', [TG('專案X/頁1/區塊1'), TG('專案X/頁1/區塊2')])
            let p1 = JSON.parse(env.woItems.pemis.snapshot()).find((p) => p.id === 'id-p1')
            await env.woItems.pemis.save({ ...p1, crules: J({ [T1]: 'y', '專案X/頁1/區塊1': 'y', '專案X/頁1/區塊2': 'y' }) })
            let r = await sync(env, 'targets', 'appX', [TG('專案X/頁1/區塊2')])
            assert.deepStrictEqual(r.v, { nAdd: 0, nUpdate: 0, nDel: 1, nSame: 1 })
            let p1After = JSON.parse(env.woItems.pemis.snapshot()).find((p) => p.id === 'id-p1')
            assert.deepStrictEqual(Object.keys(JSON.parse(p1After.crules)).sort(), [T1, '專案X/頁1/區塊2'].sort())
        })
    })


    describe('I6 欄位歸屬: 指派欄缺鍵保留／含鍵以外部為準; 伺服器管理欄不採批次值', function() {

        it('SC-I6-keep users: 批次缺 cgrups 鍵 → 保留庫內值(後台已指派); 含鍵 → 以外部為準; 新增列缺鍵 → 空字串  [spec §4 外部可選、F-23]', async function() {
            let env = createEnv()
            await sync(env, 'users', 'appX', [U('a', 'ua'), U('b', 'ub')])
            let a = bySrc(env, 'users', 'appX', 'a')
            await env.woItems.users.save({ ...a, cgrups: J({ G1: OR, G2: OR }) }) //後台指派
            let batch = [{ ...U('a', 'ua') }, { ...U('b', 'ub') }, { ...U('c', 'uc') }]
            delete batch[0].cgrups //缺鍵 → 保留
            batch[1].cgrups = J({ G2: OR }) //含鍵 → 外部為準
            delete batch[2].cgrups //新增列缺鍵 → ''
            let r = await sync(env, 'users', 'appX', batch)
            assert.deepStrictEqual(r.v, { nAdd: 1, nUpdate: 1, nDel: 0, nSame: 1 })
            assert.strictEqual(bySrc(env, 'users', 'appX', 'a').cgrups, J({ G1: OR, G2: OR }))
            assert.strictEqual(bySrc(env, 'users', 'appX', 'b').cgrups, J({ G2: OR }))
            assert.strictEqual(bySrc(env, 'users', 'appX', 'c').cgrups, '')
        })

        it('SC-I6-keep grups／pemis: 缺 cpemis／crules 鍵保留庫內值  [run08 缺鍵保留]', async function() {
            let env = createEnv()
            await sync(env, 'grups', 'appX', [G('a', 'GA')])
            await sync(env, 'pemis', 'appX', [P('a', 'PA')])
            let ga = bySrc(env, 'grups', 'appX', 'a')
            let pa = bySrc(env, 'pemis', 'appX', 'a')
            await env.woItems.grups.save({ ...ga, cpemis: J({ P1: OR, P2: OR }) })
            await env.woItems.pemis.save({ ...pa, crules: J({ [T1]: 'y', [T2]: 'y' }) })
            let g = G('a', 'GA')
            delete g.cpemis
            let p = P('a', 'PA')
            delete p.crules
            let r1 = await sync(env, 'grups', 'appX', [g])
            let r2 = await sync(env, 'pemis', 'appX', [p])
            assert.deepStrictEqual(r1.v, { nAdd: 0, nUpdate: 0, nDel: 0, nSame: 1 }, '缺鍵保留後與庫內相同 → 不變')
            assert.deepStrictEqual(r2.v, { nAdd: 0, nUpdate: 0, nDel: 0, nSame: 1 })
            assert.strictEqual(bySrc(env, 'grups', 'appX', 'a').cpemis, J({ P1: OR, P2: OR }))
            assert.strictEqual(bySrc(env, 'pemis', 'appX', 'a').crules, J({ [T1]: 'y', [T2]: 'y' }))
        })

        it('SC-I6-server 批次帶伺服器管理欄(userId／timeCreate／userIdUpdate／timeUpdate)一律不採: 新增列為匯入者與現在時間、修改列保留建立者與建立時間  [spec §4 本系統擁有]', async function() {
            let env = createEnv()
            let evil = { ...U('a', 'ua'), userId: 'evil', timeCreate: '1999-01-01', userIdUpdate: 'evil', timeUpdate: '1999-01-01' }
            await sync(env, 'users', 'appX', [evil])
            let a0 = bySrc(env, 'users', 'appX', 'a')
            assert.strictEqual(a0.userId, APP)
            assert.notStrictEqual(a0.timeCreate, '1999-01-01')
            await sync(env, 'users', 'appX', [{ ...evil, description: 'changed' }])
            let a1 = bySrc(env, 'users', 'appX', 'a')
            assert.strictEqual(a1.description, 'changed')
            assert.strictEqual(a1.userId, a0.userId, '修改列保留建立者')
            assert.strictEqual(a1.timeCreate, a0.timeCreate, '修改列保留建立時間')
            assert.strictEqual(a1.userIdUpdate, APP)
        })
    })


    describe('I7／I13 整批拒收: srcKey 缺／空／非字串／重複、送 id', function() {

        let cases = [
            ['缺 srcKey', [{ name: 'GA', description: '' }], 'srcKeyInvalid'],
            ['srcKey 空字串', [G('', 'GA')], 'srcKeyInvalid'],
            ['srcKey 空白', [G('   ', 'GA')], 'srcKeyInvalid'],
            ['srcKey 數字', [G(1, 'GA')], 'srcKeyInvalid'],
            ['srcKey null', [G(null, 'GA')], 'srcKeyInvalid'],
            ['srcKey 物件', [G({ a: 1 }, 'GA')], 'srcKeyInvalid'],
            ['srcKey 陣列', [G(['a'], 'GA')], 'srcKeyInvalid'],
            ['srcKey 含 HTML 標記(會被 clearXSS 改寫者)', [G('<script>x</script>', 'GA')], 'srcKeyInvalid'],
            ['srcKey 過長(UTF-8 > 1978 B)', [G('中'.repeat(700), 'GA')], 'srcKeyInvalid'],
            ['第二列缺 srcKey(第一列合法)', [G('a', 'GA'), { name: 'GB' }], 'srcKeyInvalid'],
            ['同批 srcKey 重複', [G('a', 'GA'), G('a', 'GB')], 'srcKeyDuplicate'],
            ['送 id(同時有合法 srcKey)', [{ ...G('a', 'GA'), id: 'x1' }], 'idNotAllowed'],
            ['只送 id 不送 srcKey(舊呼叫方式)', [{ id: 'x1', name: 'GA' }], 'idNotAllowed'],
            ['id 為空字串亦拒', [{ ...G('a', 'GA'), id: '' }], 'idNotAllowed'],
            ['id 為 null 亦拒', [{ ...G('a', 'GA'), id: null }], 'idNotAllowed'],
            ['第二列才送 id', [G('a', 'GA'), { ...G('b', 'GB'), id: 'x2' }], 'idNotAllowed'],
            ['非物件列', [G('a', 'GA'), 'str'], 'invalidRows'],
            ['空物件列', [{}], 'invalidRows'],
            ['空批次', [], 'invalidRows'],
        ]
        for (let [title, rows, key] of cases) {
            it(`SC-I7-grups ${title} → ${key}、零寫入  [spec §5.2、§9、§10 I7／I8／I13]`, async function() {
                let env = createEnv()
                await assertRejected(env, 'grups', 'appX', rows, key)
            })
        }

        it('SC-I7-all 四表皆適用同一組檢查(users／pemis／targets 缺 srcKey 與送 id 皆整批拒收且零寫入)', async function() {
            for (let kt of ['users', 'pemis', 'targets']) {
                let env = createEnv()
                await assertRejected(env, kt, 'appX', [(kt === 'users') ? { name: 'u' } : ((kt === 'pemis') ? { name: 'P' } : { description: 'd' })], 'srcKeyInvalid')
                await assertRejected(env, kt, 'appX', [{ ...(kt === 'users' ? U('a', 'ua') : kt === 'pemis' ? P('a', 'PA') : TG('專案X/a')), id: 'z' }], 'idNotAllowed')
            }
        })

        it('SC-I7-dupAfterTrim srcKey 僅前後空白不同視為不同值(精確比對, 不 trim 後比)  [精確 ===, 與 name 比對一致]', async function() {
            let env = createEnv()
            let r = await sync(env, 'grups', 'appX', [G('a', 'GA'), G('a ', 'GB')])
            assert.strictEqual(r.ok, true)
            assert.deepStrictEqual(r.v, { nAdd: 2, nUpdate: 0, nDel: 0, nSame: 0 })
        })

        it('SC-I7-from from 須為非空字串 → invalidFrom、零寫入', async function() {
            let env = createEnv()
            for (let from of ['', null, undefined, 5, {}]) {
                await assertRejected(env, 'grups', from, [G('a', 'GA')], 'invalidFrom')
            }
        })
    })


    describe('I9／I10 跨來源與後台列', function() {

        it('SC-I9-name grups 名稱撞他來源(G2)或後台列(G1) → invalidRows、雙方不變  [R-NAME-UNIQ-01、規格 §7]', async function() {
            let env = createEnv()
            await assertRejected(env, 'grups', 'appX', [G('a', 'G2')], 'invalidRows')
            await assertRejected(env, 'grups', 'appX', [G('a', 'G1')], 'invalidRows')
            await assertRejected(env, 'pemis', 'appX', [P('a', 'P1')], 'invalidRows')
        })

        it('SC-I9-batchDup 同批名稱重複 → invalidRows  [R-NAME-UNIQ-01 批內]', async function() {
            let env = createEnv()
            await assertRejected(env, 'grups', 'appX', [G('a', 'GA'), G('b', 'GA')], 'invalidRows')
        })

        it('SC-I9-nameEmpty grups／pemis 名稱缺／空／非字串 → invalidRows  [R-SYNC-NAME-01]', async function() {
            let env = createEnv()
            for (let name of [undefined, '', 5, null]) {
                let g = G('a', name)
                if (name === undefined) {
                    delete g.name
                }
                await assertRejected(env, 'grups', 'appX', [g], 'invalidRows')
            }
        })

        it('SC-I9-mapKey users mappingBy=email: 對應鍵撞他來源 active 列、空、批內重複 → invalidRows; 非 active 列不參與  [R-MAPKEY-01]', async function() {
            let env = createEnv({ mappingBy: 'email' })
            await assertRejected(env, 'users', 'appX', [U('a', 'ua', { email: 'u2@example.com' })], 'invalidRows') //他來源 active
            await assertRejected(env, 'users', 'appX', [U('a', 'ua', { email: 'u1@example.com' })], 'invalidRows') //後台列
            await assertRejected(env, 'users', 'appX', [U('a', 'ua', { email: '' })], 'invalidRows')
            await assertRejected(env, 'users', 'appX', [U('a', 'ua', { email: 'x@e.com' }), U('b', 'ub', { email: 'x@e.com' })], 'invalidRows')
            let r = await sync(env, 'users', 'appX', [U('a', 'ua', { email: 'u2@example.com', isActive: 'n' })])
            assert.strictEqual(r.ok, true, '停用列之對應鍵不參與檢查')
        })

        it('SC-I9-targets 標的名稱(id＝srcKey)已被他來源或後台列使用 → invalidRows、不改既有列(免 insert 靜默略過)  [R-SYNC-01 對 targets 仍成立]', async function() {
            let env = createEnv()
            await assertRejected(env, 'targets', 'appX', [TG(T1)], 'invalidRows') //後台列
            await assertRejected(env, 'targets', 'appX', [TG(T2)], 'invalidRows') //他來源
        })

        it('SC-I10 後台列與他來源之列永不被觸及: 批次不含它們時不刪; 同 srcKey 在不同 from 各自獨立(grups／pemis／users)  [規格 §7、§10 I10]', async function() {
            let env = createEnv()
            let before = JSON.parse(snapAllOf(env, 'grups'))
            let r = await sync(env, 'grups', 'appX', [G('o-g2', 'GX')]) //srcKey 與他來源 G2 之 srcKey 'o-g2' 相同
            assert.deepStrictEqual(r.v, { nAdd: 1, nUpdate: 0, nDel: 0, nSame: 0 })
            let after = JSON.parse(snapAllOf(env, 'grups'))
            for (let b of before) {
                assert.deepStrictEqual(after.find((x) => x.id === b.id), b, `既有列 ${b.id}(後台／他來源)逐位元不動`)
            }
            //再送一批只含另一列: 刪除只限 appX 內
            let r2 = await sync(env, 'grups', 'appX', [G('z', 'GZ')])
            assert.deepStrictEqual(r2.v, { nAdd: 1, nUpdate: 0, nDel: 1, nSame: 0 })
            assert.ok(JSON.parse(snapAllOf(env, 'grups')).some((g) => g.id === 'id-g1') && JSON.parse(snapAllOf(env, 'grups')).some((g) => g.id === 'id-g2'))
        })
    })


    describe('I11 並行: 與後台存檔共用同一把表鎖; 匯入改變內容使持舊基準之後台存檔被拒', function() {

        it('SC-I11-lock 他方持有同表鎖期間匯入不寫入, 釋放後才完成  [R-WRITE-LOCK-01／02]', async function() {
            let env = createEnv()
            let release
            let held = new Promise((res) => { release = res })
            let entered
            let inLock = new Promise((res) => { entered = res })
            let holder = env.core.withTabLocks(['grups'], async () => {
                entered()
                await held
            })
            await inLock
            let p = sync(env, 'grups', 'appX', [G('a', 'GA')])
            await new Promise((r) => setTimeout(r, 150))
            assert.strictEqual(cntAll(env), 0, '持鎖期間不得寫入')
            release()
            await holder
            let r = await p
            assert.deepStrictEqual(r.v, { nAdd: 1, nUpdate: 0, nDel: 0, nSame: 0 })
        })

        it('SC-I11-stale 匯入有改變內容後, 持匯入前基準之後台存檔被拒(saveStale); 持新基準者可存  [規格 §6: 以外部為主]', async function() {
            let env = createEnv()
            await sync(env, 'grups', 'appX', [G('a', 'GA')])
            let all0 = JSON.parse(env.woItems.grups.snapshot()).sort((a, b) => a.order - b.order)
            let baseline0 = makeBaseline(all0, 'grups')
            await sync(env, 'grups', 'appX', [G('a', 'GA', { description: 'changed by ext' })])
            let rej
            try {
                await env.pc.updateGrups('id-admin', cloneDeep(all0), { baseline: baseline0 })
            }
            catch (err) {
                rej = err
            }
            assert.strictEqual(rej, 'saveStale')
            let all1 = JSON.parse(env.woItems.grups.snapshot()).sort((a, b) => a.order - b.order)
            let ok = await env.pc.updateGrups('id-admin', cloneDeep(all1), { baseline: makeBaseline(all1, 'grups') })
            assert.strictEqual(ok, 'saveTabItemsSuccess')
        })

        it('SC-I11-serial 同表兩次匯入並行: 序列化(結果等同依序執行), 不 lost update  [規格 §6 同範圍並行匯入]', async function() {
            let env = createEnv()
            let [r1, r2] = await Promise.all([
                sync(env, 'grups', 'appX', [G('a', 'GA')]),
                sync(env, 'grups', 'appX', [G('a', 'GA'), G('b', 'GB')]),
            ])
            assert.strictEqual(r1.ok && r2.ok, true)
            assert.deepStrictEqual(rowsOf(env, 'grups', 'appX').map((r) => r.srcKey).sort(), ['a', 'b'])
            assert.deepStrictEqual(r1.v, { nAdd: 1, nUpdate: 0, nDel: 0, nSame: 0 })
            assert.deepStrictEqual(r2.v, { nAdd: 1, nUpdate: 0, nDel: 0, nSame: 1 })
        })
    })


    describe('I12 寫入中途失敗: 補償還原或明確回報, 不留部分寫入而回成功', function() {

        let seedExt = (env) => rowsOf(env, 'grups', 'appX')

        it('SC-I12-save 修改列之 save 失敗 → saveWriteFail, 本表與引用端逐位元回到匯入前(新增者刪除、被刪者寫回、被改者還原)  [規格 §5.6]', async function() {
            //種子先放兩筆同步列, 其中 a2 之 id 注入 save 失敗
            let env = createEnv({
                seed: (s) => {
                    s.grups.push({ ...ds.grups.funNew(), ...AUDIT, id: 'id-x1', order: 3, name: 'GA', description: 'old-a', from: 'appX', srcKey: 'a', cpemis: '{}' })
                    s.grups.push({ ...ds.grups.funNew(), ...AUDIT, id: 'id-x2', order: 4, name: 'GB', description: 'old-b', from: 'appX', srcKey: 'b', cpemis: '{}' })
                    s.grups.push({ ...ds.grups.funNew(), ...AUDIT, id: 'id-x3', order: 5, name: 'GC', description: 'old-c', from: 'appX', srcKey: 'c', cpemis: '{}' })
                },
            })
            //暫時性故障: 第一次 save(匯入之修改階段)中 id-x2 逐筆失敗(a 已寫入); 補償階段之 save 正常(模擬瞬斷, 非永久故障——永久故障見 SC-I12-undoFail)
            let tg = env.woItems.grups
            let origSave = tg.save
            let nSave = 0
            tg.save = async (d, o) => {
                nSave++
                if (nSave === 1) {
                    let rs = await origSave(d.filter((v) => v.id !== 'id-x2'), o)
                    return [...rs, { n: 1, nInserted: 0, nModified: 0, ok: 0, err: 'simulated save failure' }]
                }
                return await origSave(d, o)
            }
            let before = snapAll(env)
            //批次: a 改描述(save 成功)、b 改描述(save 失敗)、c 缺(刪除)、d 新增
            let r = await sync(env, 'grups', 'appX', [G('a', 'GA', { description: 'new-a', cpemis: '{}' }), G('b', 'GB', { description: 'new-b', cpemis: '{}' }), G('d', 'GD', { cpemis: '{}' })])
            assert.strictEqual(r.ok, false)
            assert.strictEqual(r.v, 'saveWriteFail', `應回 saveWriteFail, 實得 ${String(r.v)}`)
            assertSnapEq(env, before, '補償後四表須逐位元回到匯入前')
            assert.ok(env.logs.some((l) => l.event === 'syncAndReplaceTabs-restored'), `記補償成功 log, 實得事件 ${JSON.stringify(env.logs.map((l) => `${l.level}:${l.event}`))}`)
            assert.ok(!JSON.stringify(env.logs).includes('GA'), 'log 不含名稱等資料值')
        })

        it('SC-I12-insert 新增之 insert 整批失敗 → saveWriteFail、先前已刪者寫回  [規格 §5.6]', async function() {
            let env = createEnv({
                seed: (s) => {
                    s.pemis.push({ ...ds.pemis.funNew(), ...AUDIT, id: 'id-x1', order: 3, name: 'PA', description: 'old', from: 'appX', srcKey: 'a', crules: '{}' })
                },
                fail: { pemis: { insert: 'simulated insert failure' } },
            })
            let before = snapAll(env)
            let r = await sync(env, 'pemis', 'appX', [P('b', 'PB', { crules: '{}' })]) //a 刪除、b 新增
            assert.strictEqual(r.ok, false)
            assert.strictEqual(r.v, 'saveWriteFail')
            assertSnapEq(env, before, '先前已刪之 a 須寫回')
        })

        it('SC-I12-del 刪除之 del 逐筆失敗 → saveWriteFail、不留部分寫入  [規格 §5.6]', async function() {
            let env = createEnv({
                seed: (s) => {
                    s.users.push({ ...ds.users.funNew(), ...AUDIT, id: 'id-x1', order: 3, name: 'ua', email: 'ua@e.com', from: 'appX', srcKey: 'a', cgrups: '{}', isAdmin: 'n', isActive: 'y' })
                },
                fail: { users: { delIds: ['id-x1'] } },
            })
            let before = snapAll(env)
            let r = await sync(env, 'users', 'appX', [U('b', 'ub', { cgrups: '{}' })])
            assert.strictEqual(r.ok, false)
            assert.strictEqual(r.v, 'saveWriteFail')
            assertSnapEq(env, before, '四表須逐位元相同')
        })

        it('SC-I12-holder 引用連帶之引用端已改寫後本表寫入失敗 → 引用端亦還原(沿用 writeWithCascade)  [R-REF-CASCADE-01 規則 4]', async function() {
            let env = createEnv({
                seed: (s) => {
                    s.grups.push({ ...ds.grups.funNew(), ...AUDIT, id: 'id-x1', order: 3, name: 'GA', description: 'old', from: 'appX', srcKey: 'a', cpemis: '{}' })
                    let u1 = s.users.find((u) => u.id === 'id-u1')
                    u1.cgrups = J({ G1: OR, GA: OR })
                },
                fail: { grups: { delIds: ['id-x1'] } },
            })
            let before = snapAll(env)
            let r = await sync(env, 'grups', 'appX', [G('b', 'GB', { cpemis: '{}' })]) //GA 刪除(引用須清) → 本表 del 失敗
            assert.strictEqual(r.ok, false)
            assert.strictEqual(r.v, 'saveWriteFail')
            assertSnapEq(env, before, '含引用端 users 逐位元回到匯入前')
            assert.ok(seedExt)
        })

        it('SC-I12-cascadeUndoFail 引用端補償失敗(雙重故障) → 同步端點固定回 saveWriteFail(不回 saveCascadePartial), 引用端補償失敗記 refCascade-restore-error  [規格 §5.6; 外審 sol#3]', async function() {
            let env = createEnv({
                seed: (s) => {
                    s.grups.push({ ...ds.grups.funNew(), ...AUDIT, id: 'id-x1', order: 3, name: 'GA', description: 'old', from: 'appX', srcKey: 'a', cpemis: '{}' })
                    let u1 = s.users.find((u) => u.id === 'id-u1')
                    u1.cgrups = J({ G1: OR, GA: OR })
                },
                fail: { users: { saveIds: ['id-u1'] } }, //引用端 u1 之 save 恆失敗: 引用端改寫失敗後, 補償寫回亦失敗
            })
            let r = await sync(env, 'grups', 'appX', [G('b', 'GB', { cpemis: '{}' })]) //GA 刪除 → 須清理 u1 之引用
            assert.strictEqual(r.ok, false)
            assert.strictEqual(r.v, 'saveWriteFail', `應回 saveWriteFail, 實得 ${String(r.v)}`)
            assert.ok(env.logs.some((l) => l.event === 'refCascade-restore-error'), '引用端補償失敗須記 refCascade-restore-error 供稽核')
        })

        it('SC-I12-undoFail 補償本身失敗 → 仍回 saveWriteFail(不回成功), 並記 restore-error  [規格 §5.6: 無法補償時回 saveWriteFail 並記錄]', async function() {
            //del 失敗後補償時 save(寫回)亦失敗: 對同一 id 注入 save 失敗＋del 失敗
            let env = createEnv({
                seed: (s) => {
                    s.users.push({ ...ds.users.funNew(), ...AUDIT, id: 'id-x1', order: 3, name: 'ua', email: 'ua@e.com', from: 'appX', srcKey: 'a', cgrups: '{}', isAdmin: 'n', isActive: 'y' })
                    s.users.push({ ...ds.users.funNew(), ...AUDIT, id: 'id-x2', order: 4, name: 'ub', email: 'ub@e.com', from: 'appX', srcKey: 'b', cgrups: '{}', isAdmin: 'n', isActive: 'y' })
                },
                fail: { users: { delIds: ['id-x2'], saveIds: ['id-x1'] } },
            })
            let r = await sync(env, 'users', 'appX', [U('c', 'uc', { cgrups: '{}' })]) //a、b 皆刪除: a 先刪成功, b 刪失敗 → 補償寫回 a 時 save 失敗
            assert.strictEqual(r.ok, false)
            assert.strictEqual(r.v, 'saveWriteFail')
            assert.ok(env.logs.some((l) => l.event === 'syncAndReplaceTabs-restore-error'), '記補償失敗')
        })
    })


    describe('I15 一次性資料遷移: 既有外部列(無 srcKey)首次匯入', function() {

        //legacy: 舊同步寫入之外部列(無 srcKey 鍵; 測試框架之夾具, 非產品旁路)
        let legacyG = (id, name, extra = {}) => ({ ...ds.grups.funNew(), ...AUDIT, id, order: 3, name, description: 'old', from: 'appX', cpemis: '{}', ...extra })
        let legacyU = (id, name, extra = {}) => ({ ...ds.users.funNew(), ...AUDIT, id, order: 3, name, email: `${name}@e.com`, description: 'old', from: 'appX', cgrups: '{}', isAdmin: 'n', isActive: 'y', ...extra })
        let noSrc = (r) => {
            let o = { ...r }
            delete o.srcKey
            return o
        }

        it('SC-I15 批次 srcKey 等於舊列 id → 視為同一列: id 不變、補上 srcKey(計入 nUpdate)、其後重送 nSame; 後台指派保留  [規格 §9、§10 I15]', async function() {
            let env = createEnv({ seed: (s) => { s.grups.push(noSrc(legacyG('ext-1', 'GA', { cpemis: J({ P1: OR }) }))) } })
            let r = await sync(env, 'grups', 'appX', [G('ext-1', 'GA', { description: 'old' })].map((g) => { delete g.cpemis; return g }))
            assert.deepStrictEqual(r.v, { nAdd: 0, nUpdate: 1, nDel: 0, nSame: 0 }, '補上 srcKey 屬一次寫入')
            let row = JSON.parse(env.woItems.grups.snapshot()).find((g) => g.id === 'ext-1')
            assert.strictEqual(row.srcKey, 'ext-1')
            assert.strictEqual(row.cpemis, J({ P1: OR }), '缺鍵保留之指派欄不因遷移而清空')
            let r2 = await sync(env, 'grups', 'appX', [G('ext-1', 'GA', { description: 'old' })].map((g) => { delete g.cpemis; return g }))
            assert.deepStrictEqual(r2.v, { nAdd: 0, nUpdate: 0, nDel: 0, nSame: 1 }, '其後只認 srcKey, 冪等')
        })

        it('SC-I15-mix 批次含舊 id 對上者、全新者、舊列未對上者 → 對上者補 srcKey、新者配新 id、舊列未對上者刪除並連帶清理引用  [規格 §9「對不上者依差異同步處理」]', async function() {
            let env = createEnv({
                seed: (s) => {
                    s.grups.push(noSrc(legacyG('ext-1', 'GA')))
                    s.grups.push(noSrc(legacyG('ext-2', 'GB')))
                    let u1 = s.users.find((u) => u.id === 'id-u1')
                    u1.cgrups = J({ G1: OR, GB: OR })
                },
            })
            let r = await sync(env, 'grups', 'appX', [G('ext-1', 'GA', { cpemis: '{}', description: 'old' }), G('new-9', 'GN', { cpemis: '{}' })])
            assert.deepStrictEqual(r.v, { nAdd: 1, nUpdate: 1, nDel: 1, nSame: 0 })
            let gs = JSON.parse(env.woItems.grups.snapshot())
            assert.strictEqual(gs.find((g) => g.id === 'ext-1').srcKey, 'ext-1')
            assert.ok(!gs.some((g) => g.id === 'ext-2'), '未對上之舊列刪除')
            assert.notStrictEqual(gs.find((g) => g.srcKey === 'new-9').id, 'new-9')
            let u1 = JSON.parse(env.woItems.users.snapshot()).find((u) => u.id === 'id-u1')
            assert.deepStrictEqual(Object.keys(JSON.parse(u1.cgrups)), ['G1'], '被刪舊列之引用連帶清理')
        })

        it('SC-I15-users 使用者遷移同理(依 id 認列, 補 srcKey)  [規格 §9]', async function() {
            let env = createEnv({ seed: (s) => { s.users.push(noSrc(legacyU('ext-u1', 'ua'))) } })
            let r = await sync(env, 'users', 'appX', [U('ext-u1', 'ua', { description: 'old', cgrups: '{}' })])
            assert.deepStrictEqual(r.v, { nAdd: 0, nUpdate: 1, nDel: 0, nSame: 0 })
            assert.strictEqual(JSON.parse(env.woItems.users.snapshot()).find((u) => u.id === 'ext-u1').srcKey, 'ext-u1')
        })

        it('SC-I15-targets 標的遷移: 舊外部標的 id＝名稱, 批次 srcKey＝名稱即同一列(id 本就等於 srcKey)  [設計決定 targets id＝srcKey]', async function() {
            let env = createEnv({ seed: (s) => { s.targets.push({ ...ds.targets.funNew(), ...AUDIT, id: '專案X/舊', order: 3, description: 'old', from: 'appX' }) } })
            let r = await sync(env, 'targets', 'appX', [TG('專案X/舊', { description: 'old' })])
            assert.deepStrictEqual(r.v, { nAdd: 0, nUpdate: 1, nDel: 0, nSame: 0 })
            assert.strictEqual(JSON.parse(env.woItems.targets.snapshot()).find((t) => t.id === '專案X/舊').srcKey, '專案X/舊')
        })

        it('SC-I15-claimTwice 同一 srcKey 被兩個庫內列主張(一個已有 srcKey、一個以 id 主張) → srcKeyConflict、零寫入  [規格 §5.4: 無法唯一配對 → 拒收]', async function() {
            let env = createEnv({
                seed: (s) => {
                    s.grups.push({ ...legacyG('id-a', 'GA'), srcKey: 'k1' })
                    s.grups.push(noSrc(legacyG('k1', 'GB'))) //以 id 主張 k1
                },
            })
            await assertRejected(env, 'grups', 'appX', [G('k1', 'GA', { cpemis: '{}' })], 'srcKeyConflict')
        })

        it('SC-I15-claimTwice-unrelated 庫內有雙重主張之 srcKey 時, 即使本批不含該鍵仍 srcKeyConflict、零寫入(與庫內重複 srcKey 同屬庫內資料異常, 不看本批; 外審 sol#2)  [規格 §5.4]', async function() {
            let env = createEnv({
                seed: (s) => {
                    s.grups.push({ ...legacyG('id-a', 'GA'), srcKey: 'k1' })
                    s.grups.push(noSrc(legacyG('k1', 'GB'))) //以 id 主張 k1
                },
            })
            await assertRejected(env, 'grups', 'appX', [G('z', 'GZ', { cpemis: '{}' })], 'srcKeyConflict') //本批只有 z, 不含 k1
        })

        it('SC-I15-dupInDb 庫內同 from 有重複 srcKey(資料異常) → srcKeyConflict、零寫入  [規格 §5.4]', async function() {
            let env = createEnv({
                seed: (s) => {
                    s.grups.push({ ...legacyG('id-a', 'GA'), srcKey: 'k1' })
                    s.grups.push({ ...legacyG('id-b', 'GB'), srcKey: 'k1' })
                },
            })
            await assertRejected(env, 'grups', 'appX', [G('k1', 'GA', { cpemis: '{}' })], 'srcKeyConflict')
        })
    })


    describe('users 指派欄缺鍵保留 × 登入對應鍵矛盾(mappingBy=email／name; 外審 sol#1)', function() {

        //身分是 srcKey, 缺鍵保留依配對到之庫內 id; 但 mappingBy 為 email／name 時登入以該欄位找使用者: 同 srcKey 之對應鍵值被改成別值、或新值為庫內別列持有時,
        //保留指派會使該登入值取得原擁有者之授權(換主移轉, 增權)——不保留(cgrups 維持空字串)並記 keepAssign-skip warn(reason identityConflict, 不含個資值).
        let xu = (id, srcKey, name, email, extra = {}) => ({ ...ds.users.funNew(), ...AUDIT, id, order: 3, name, email, description: `d-${srcKey}`, from: 'appX', srcKey, cgrups: '{}', isAdmin: 'n', isActive: 'y', ...extra })
        let noCg = (r) => {
            let o = { ...r }
            delete o.cgrups
            return o
        }
        let skipLogs = (env) => env.logs.filter((l) => l.event === 'syncAndReplaceTabs-keepAssign-skip')

        it('SC-K1 mappingBy=email: 兩個 srcKey 互換 email、皆缺 cgrups 鍵 → 兩列皆不保留(不移轉授權), 記 identityConflict n=2  [外審 sol#1 確定情境]', async function() {
            let env = createEnv({
                mappingBy: 'email',
                seed: (s) => {
                    s.users.push(xu('id-xa', 'a', 'ua', 'a@x.example.com', { cgrups: J({ G1: OR }) })) //A 有高權限
                    s.users.push(xu('id-xb', 'b', 'ub', 'b@x.example.com'))
                },
            })
            let r = await sync(env, 'users', 'appX', [noCg(U('a', 'ua', { email: 'b@x.example.com' })), noCg(U('b', 'ub', { email: 'a@x.example.com' }))])
            assert.strictEqual(r.ok, true, JSON.stringify(r.v))
            assert.deepStrictEqual(r.v, { nAdd: 0, nUpdate: 2, nDel: 0, nSame: 0 })
            assert.strictEqual(bySrc(env, 'users', 'appX', 'a').email, 'b@x.example.com', 'email 以外部為準')
            assert.strictEqual(bySrc(env, 'users', 'appX', 'a').cgrups, '', 'A 之授權不得隨 srcKey 移轉給現持有 b@x 者')
            assert.strictEqual(bySrc(env, 'users', 'appX', 'b').cgrups, '')
            let sk = skipLogs(env)
            assert.strictEqual(sk.length, 1)
            assert.strictEqual(sk[0].n, 2)
            assert.strictEqual(sk[0].reason, 'identityConflict')
            assert.ok(!JSON.stringify(env.logs).includes('x.example.com'), 'log 不含 email')
        })

        it('SC-K2 mappingBy=email: 同 srcKey 同 email 缺鍵 → 保留(含 nSame); 同 srcKey 改 email 缺鍵 → 不保留; 新 srcKey 沿用舊 email → 不繼承  [對照]', async function() {
            let env = createEnv({
                mappingBy: 'email',
                seed: (s) => {
                    s.users.push(xu('id-xa', 'a', 'ua', 'a@x.example.com', { cgrups: J({ G1: OR }) }))
                    s.users.push(xu('id-xb', 'b', 'ub', 'b@x.example.com', { cgrups: J({ G1: OR }) }))
                },
            })
            let r = await sync(env, 'users', 'appX', [noCg(U('a', 'ua', { email: 'a@x.example.com', description: 'd-a', order: 3 })), noCg(U('b', 'ub', { email: 'b2@x.example.com' })), noCg(U('c', 'uc', { email: 'b@x.example.com' }))])
            assert.strictEqual(r.ok, true, JSON.stringify(r.v))
            assert.strictEqual(bySrc(env, 'users', 'appX', 'a').cgrups, J({ G1: OR }), '同 srcKey 同 email → 保留')
            assert.strictEqual(bySrc(env, 'users', 'appX', 'b').cgrups, '', '同 srcKey 但 email 被改 → 不保留')
            assert.strictEqual(bySrc(env, 'users', 'appX', 'c').cgrups, '', '新 srcKey 沿用舊 email → 不繼承')
            assert.strictEqual(skipLogs(env).length, 1)
            assert.strictEqual(skipLogs(env)[0].n, 1)
        })

        it('SC-K3 mappingBy=name: 同 srcKey 改 name 缺鍵 → 不保留; email 被改而 name 不變 → 保留(email 非對應鍵)', async function() {
            let env = createEnv({
                mappingBy: 'name',
                seed: (s) => {
                    s.users.push(xu('id-xa', 'a', 'ua', 'a@x.example.com', { cgrups: J({ G1: OR }) }))
                    s.users.push(xu('id-xb', 'b', 'ub', 'b@x.example.com', { cgrups: J({ G1: OR }) }))
                },
            })
            let r = await sync(env, 'users', 'appX', [noCg(U('a', 'ua-renamed', { email: 'a@x.example.com' })), noCg(U('b', 'ub', { email: 'b-changed@x.example.com' }))])
            assert.strictEqual(r.ok, true, JSON.stringify(r.v))
            assert.strictEqual(bySrc(env, 'users', 'appX', 'a').cgrups, '', 'name(對應鍵)被改 → 不保留')
            assert.strictEqual(bySrc(env, 'users', 'appX', 'b').cgrups, J({ G1: OR }), 'email 非對應鍵 → 保留')
        })

        it('SC-K4 mappingBy=id(預設): 對應鍵不是 email／name, 同 srcKey 改 email／name 缺鍵 → 保留(身分是 srcKey)  [待裁示: users mappingBy=id 重定義見報告]', async function() {
            let env = createEnv({
                seed: (s) => {
                    s.users.push(xu('id-xa', 'a', 'ua', 'a@x.example.com', { cgrups: J({ G1: OR }) }))
                },
            })
            let r = await sync(env, 'users', 'appX', [noCg(U('a', 'ua-renamed', { email: 'a2@x.example.com' }))])
            assert.strictEqual(r.ok, true, JSON.stringify(r.v))
            assert.strictEqual(bySrc(env, 'users', 'appX', 'a').cgrups, J({ G1: OR }))
            assert.strictEqual(skipLogs(env).length, 0)
        })
    })


    describe('srcKey 重編警示(syncWarns): 判定口徑 id → srcKey', function() {

        it('SC-W1 同名異 srcKey(來源鍵重編) → 登錄警示筆數; 同 srcKey 改名 → 不警示; 其後無此情形即清除  [rulebook R-IMPORT-01 規則 5 評估: 改寫不移除]', async function() {
            let env = createEnv()
            await sync(env, 'grups', 'appX', [G('a', 'GA'), G('b', 'GB')])
            assert.deepStrictEqual(env.sc.getSyncWarns(), [])
            await sync(env, 'grups', 'appX', [G('a', 'GA'), G('b2', 'GB')]) //GB 之 srcKey 由 b 換成 b2
            let w = env.sc.getSyncWarns()
            assert.strictEqual(w.length, 1)
            assert.strictEqual(w[0].keyTable, 'grups')
            assert.strictEqual(w[0].from, 'appX')
            assert.strictEqual(w[0].n, 1)
            assert.deepStrictEqual(Object.keys(w[0]).sort(), ['from', 'keyTable', 'n', 'time'], '只含表名、來源、筆數、時間(不含個資)')
            await sync(env, 'grups', 'appX', [G('a', 'GA'), G('b2', 'GB')]) //已無重編 → 清除
            assert.deepStrictEqual(env.sc.getSyncWarns(), [])
            await sync(env, 'grups', 'appX', [G('a', 'GA'), G('b2', 'GB-renamed')]) //同 srcKey 改名 → 不警示
            assert.deepStrictEqual(env.sc.getSyncWarns(), [])
        })
    })


    describe('回傳形狀與記錄', function() {

        it('SC-R1 成功回傳恰為 { nAdd, nUpdate, nDel, nSame } 四個非負整數  [規格 §3 回應]', async function() {
            let env = createEnv()
            let r = await sync(env, 'grups', 'appX', [G('a', 'GA')])
            assert.deepStrictEqual(Object.keys(r.v).sort(), ['nAdd', 'nDel', 'nSame', 'nUpdate'])
            Object.values(r.v).forEach((n) => assert.ok(Number.isInteger(n) && n >= 0))
        })

        it('SC-R2 srLog 記事件、範圍、計數, 不含個資值(名稱、email、srcKey 值)  [規格 §5.7]', async function() {
            let env = createEnv()
            await sync(env, 'users', 'appX', [U('SENS-KEY-1', 'sens-name', { email: 'sens@e.com' })])
            let d = env.logs.find((l) => l.event === 'syncAndReplaceTabs-diff')
            assert.ok(d, '成功須記 syncAndReplaceTabs-diff')
            assert.strictEqual(d.keyTable, 'users')
            assert.strictEqual(d.from, 'appX')
            assert.strictEqual(d.nAdd, 1)
            let all = JSON.stringify(env.logs)
            for (let s of ['SENS-KEY-1', 'sens-name', 'sens@e.com']) {
                assert.ok(!all.includes(s), `log 不得含資料值 ${s}`)
            }
        })

        it('SC-R3 被拒時記 syncAndReplaceTabs-error 與固定 msg 鍵、列索引, 不記 srcKey 值  [規格 §3 失敗: 動態原因只入伺服端 log]', async function() {
            let env = createEnv()
            await sync(env, 'grups', 'appX', [G('SENS-KEY-9', 'GA'), G('SENS-KEY-9', 'GB')])
            let e = env.logs.find((l) => l.event === 'syncAndReplaceTabs-error')
            assert.ok(e)
            assert.strictEqual(e.msg, 'srcKeyDuplicate')
            assert.strictEqual(e.row, 1)
            assert.ok(!JSON.stringify(env.logs).includes('SENS-KEY-9'))
        })

        it('SC-R4 不修改呼叫端傳入之 rows 物件(純讀取)', async function() {
            let env = createEnv()
            let batch = [G('a', 'GA')]
            let copy = cloneDeep(batch)
            await sync(env, 'grups', 'appX', batch)
            assert.deepStrictEqual(batch, copy)
        })

        it('SC-R5 批次中不在 schema 之鍵(含 _isNew、任意雜鍵)被剝除不入庫; 原型鍵名之 srcKey 可用(Map 比對, 無原型污染)  [R-KEY-01]', async function() {
            let env = createEnv()
            let r = await sync(env, 'grups', 'appX', [{ ...G('__proto__', 'GA'), _isNew: true, junk: 'x' }, G('constructor', 'GB')])
            assert.deepStrictEqual(r.v, { nAdd: 2, nUpdate: 0, nDel: 0, nSame: 0 })
            let row = bySrc(env, 'grups', 'appX', '__proto__')
            assert.ok(row && row.junk === undefined && row._isNew === undefined)
            let r2 = await sync(env, 'grups', 'appX', [G('__proto__', 'GA'), G('constructor', 'GB')])
            assert.deepStrictEqual(r2.v, { nAdd: 0, nUpdate: 0, nDel: 0, nSame: 2 })
        })
    })

})


function snapAllOf(env, kt) {
    return env.woItems[kt].snapshot()
}
