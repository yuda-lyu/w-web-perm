//後台整表寫入「缺 id 之列(API 直打, 視為新增)」之單元測試(run07 外審 sol R5; 規則帳本 R-NAME-UNIQ-02／ADR-034 缺 id 視為新增、不靜默忽略; R-PRINCIPLE-00 原則 3、5; run07 U1c)
//
//受測: server/procCore.mjs 之 updateUsers／updatePemis／updateGrups／updateTargets(kpFunExt 之實際入口, 內走 updateTabItems; 真 proc、真 procOrm〔w-serv-orm getMapOrm→getProc〕、真 kmx、真 lockSave),
//資料表以 test/tools/unitOrm.mjs 之 mkTable 替身取代 w-orm-lmdb(其 cnt 計 insert／save／del／delAll), 不起服務.
//
//規格來源(期望由規格推導, 不抄實作):
//  IL-S1 (R5; 規格: 外審 sol 所引「A: 無 id 之列(API 直打, 視為新增)」「同批多列」及不靜默忽略) 後台整表寫入中缺 id(缺鍵、空字串、null)之列視為新增: 同批 N 筆缺 id 之新列須 N 筆皆入庫並各補不同之主鍵,
//        不得只建立其中一筆(修正前 users 之 ltdtmapping 令各列 id 皆為 '', ltdtDiffByKey 以 Map(id → 列) 使前列被後列覆蓋, 只插入最後一筆卻回 saveTabItemsSuccess)——成功時不得遺漏任一列.
//        pemis／grups 既已如此(NU-046), users 補齊同一行為; targets 之主鍵即名稱(id), 缺 id 一律拒收(saveRowFieldInvalid)不在此列.
//  IL-S2 缺 id 之新列與其他寫入路徑之守門同口徑: 非空 from(外部列守門 saveFromNotAllowed)、users 之 email 空／重複(saveRowFieldInvalid／saveRowFieldDuplicate)皆整次拒收、零寫入、同批合法列亦不寫入(不靜默忽略部分列).
//  IL-S3 缺 id 之新增不影響既有列: 同批帶 id 而內容未變之列不被寫入(零 save／del), 新列主鍵不與既有主鍵相撞; 與刪除、編修、基準(baseline)並存時各自依其規則.
//
//輸入空間表(軸 × 案數; 案數為 mocha 實測, 共 29 案):
//  A 同批缺 id 新列數  表 3(users／grups／pemis) × {空表 2 筆, 空表 3 筆, 既有 2 列混批 2 筆} = 9; id 缺法 users × {缺鍵, 空字串, null} 3; users 同名(name 允許重複)兩筆 1 = 13
//  B 與其他寫入並存    users × {刪一既有列＋缺 id 兩筆, 編修一既有列＋缺 id 兩筆, 帶 baseline(=既有列)＋缺 id 兩筆, 缺 id 兩筆＋帶 id 之新列(funNew id)} = 4
//  C 守門(users)      {兩筆缺 id 且 email 相同, 兩筆缺 id 而其一 email 空, 兩筆缺 id 其二帶 from=pd, 缺 id 之 from 為 null 型別} = 4; 各案四表零寫入
//  D targets           {兩筆缺 id 拒收, 單筆缺 id 拒收, 帶 id 之新增(對照)成功} = 3
//  E 對照              users 帶 id 之兩筆新增成功(證明夾具合法, 非夾具造成拒收) 1 ＋ users 缺 id 之一筆新增(修正前亦成功之單筆形狀)1 ＋ 已入庫之列帶回＋同 email 之缺 id 列被拒(缺 id 列不冒充既有列) 1 = 3
//  SITE 靜態           procCore.mjs 之缺 id 拆分條件含 users(與 pemis／grups 同一分支) 1 ＋ targets 之 else 分支與 ckKey 拒收缺 id 仍在 1 = 2
//  刻意不測: 真後端端到端(API 層); users 缺 id 列之級聯(users 為引用鏈末端無級聯); 缺 id 列同名重複(pemis／grups 見 NU-024／RW-221g, users 之 name 允許重複).
//  未測: 無.
//跑法: npx mocha test/unit-procCore-idless.test.mjs --reporter list --timeout 60000
import assert from 'assert'
import path from 'path'
import { fileURLToPath } from 'url'
import cloneDeep from 'lodash-es/cloneDeep.js'
import pmKeyMutex from 'wsemi/src/pmKeyMutex.mjs'
import cacheSt from 'wsemi/src/cacheSt.mjs'
import ds from '../src/schema/index.mjs'
import proc from '../server/procCore.mjs'
import createLockSave from '../server/lockSave.mjs'
import { makeBaseline } from '../src/js/rowDigest.mjs'
import { mkTable, mkProcOrm, mkSrLog } from './tools/unitOrm.mjs'
import { sourceLines } from './tools/srcScan.mjs'


const projRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const T0 = '2026-01-01T00:00:00.000+08:00'
const AUDIT = { userId: 'id-seed', timeCreate: T0, userIdUpdate: 'id-seed', timeUpdate: T0 }
const TABLE_KEYS = ['users', 'targets', 'grups', 'pemis']
const FN = { users: 'updateUsers', targets: 'updateTargets', grups: 'updateGrups', pemis: 'updatePemis' }
const OKR = { ok: true, v: 'saveTabItemsSuccess' }
let ERR = (k) => ({ ok: false, v: k })
const ASSIGN = { users: 'cgrups', grups: 'cpemis', pemis: 'crules', targets: null }


//seedRows: 各表 2 個既有列(欄位順序同 schema, 使未改之列經 ltdtmapping 後與庫內列 JSON 相同而不被當成 diff)
function seedRows(opt = {}) {
    let mk = (table, o) => ({ ...ds[table].funNew(), ...AUDIT, ...o })
    let none = opt.empty === true
    return {
        targets: none ? [] : [
            mk('targets', { id: 'sys/p1/b1', order: 1, description: 'd-t1', from: '' }),
            mk('targets', { id: 'sys/p1/b2', order: 2, description: 'd-t2', from: '' }),
        ],
        pemis: none ? [] : [
            mk('pemis', { id: 'id-p1', order: 1, name: 'P1', description: 'd-p1', from: '', crules: '{}' }),
            mk('pemis', { id: 'id-p2', order: 2, name: 'P2', description: 'd-p2', from: '', crules: '{}' }),
        ],
        grups: none ? [] : [
            mk('grups', { id: 'id-g1', order: 1, name: 'G1', description: 'd-g1', from: '', cpemis: '{}' }),
            mk('grups', { id: 'id-g2', order: 2, name: 'G2', description: 'd-g2', from: '', cpemis: '{}' }),
        ],
        users: none ? [] : [
            mk('users', { id: 'id-u1', order: 1, name: 'n-u1', email: 'u1@example.test', description: 'd-u1', from: '', cgrups: '{}', isAdmin: 'n', isActive: 'y' }),
            mk('users', { id: 'id-u2', order: 2, name: 'n-u2', email: 'u2@example.test', description: 'd-u2', from: '', cgrups: '{}', isAdmin: 'n', isActive: 'y' }),
        ],
    }
}

//idless(table, k): 缺 id 之新列(API 直打; 無 id 鍵); 名稱／email 逐 k 互異
function idless(table, k, o = {}) {
    let r = null
    if (table === 'users') {
        r = { name: `new-user-${k}`, email: `new-${k}@example.test`, description: '', from: '', cgrups: '{}', isAdmin: 'n', isActive: 'y' }
    }
    else if (table === 'targets') {
        r = { description: `new-t-${k}`, from: '' }
    }
    else {
        r = { name: `new-${table}-${k}`, description: '', from: '', [ASSIGN[table]]: '{}' }
    }
    return { ...r, ...o }
}


describe('unit-procCore-idless (後台整表寫入缺 id 之列視為新增, run07 外審 sol R5)', function() {

    this.timeout(60000)

    let envs = []

    function createEnv(opt = {}) {
        let seed = seedRows(opt)
        let woItems = {}
        for (let k of TABLE_KEYS) {
            woItems[k] = mkTable(seed[k])
        }
        let { srLog, logs } = mkSrLog()
        let cst = cacheSt()
        let kmx = pmKeyMutex()
        let pc = proc(woItems, mkProcOrm(ds, woItems), { srLog, kmx, lockSave: createLockSave(cst), ...(opt.proc || {}) })
        let env = { seed, woItems, logs, cst, pc }
        envs.push(env)
        return env
    }

    afterEach(function() {
        envs.forEach((e) => e.cst.clear()) //停止 cacheSt 之 TTL 偵測 timer, 避免 mocha 不結束
        envs = []
    })

    let run = async (pc, table, rows, opt) => {
        try {
            return { ok: true, v: await pc[FN[table]]('id-admin', rows, opt) }
        }
        catch (err) {
            return { ok: false, v: err }
        }
    }
    let rowsOf = async (woItems, table) => (await woItems[table].select()).sort((a, b) => a.order - b.order).map((v) => cloneDeep(v))
    let writes = (t) => t.cnt.insert + t.cnt.save + t.cnt.del + t.cnt.delAll
    let writesAll = (w) => TABLE_KEYS.reduce((a, k) => a + writes(w[k]), 0)
    let snapAll = (w) => JSON.stringify(TABLE_KEYS.map((k) => w[k].snapshot()))
    let nameOf = (table) => (table === 'users' ? 'name' : (table === 'targets' ? 'id' : 'name'))
    let findLog = (logs, event) => logs.find((l) => l.event === event)

    //expectAllAdded: 成功; 庫內新增 n 筆(原有 nOld 筆不變); 新列之名稱集合 = 送入之名稱集合, 主鍵皆為非空字串、互異、不與既有主鍵相撞; 單次 insert、無 save／del
    async function expectAllAdded(env, table, sent, nOld, msg) {
        let all = await env.woItems[table].select()
        assert.strict.equal(all.length, nOld + sent.length, `${msg}: 庫內筆數(缺 id 之新列不得遺漏任何一筆)`)
        let oldIds = new Set(env.seed[table].map((v) => v.id))
        let fresh = all.filter((v) => !oldIds.has(v.id))
        assert.strict.equal(fresh.length, sent.length, `${msg}: 新增筆數`)
        assert.strict.deepEqual(fresh.map((v) => v[nameOf(table)]).sort(), sent.map((v) => v[nameOf(table)]).sort(), `${msg}: 新列之名稱集合 = 送入`)
        let ids = fresh.map((v) => v.id)
        assert.strict.ok(ids.every((s) => typeof s === 'string' && s !== ''), `${msg}: 補入之主鍵為非空字串`)
        assert.strict.equal(new Set(ids).size, ids.length, `${msg}: 各新列主鍵互異`)
        assert.strict.equal(env.woItems[table].cnt.insert, 1, `${msg}: 一次 insert`)
        assert.strict.equal(env.woItems[table].cnt.save + env.woItems[table].cnt.del, 0, `${msg}: 無 save／del`)
        assert.strict.ok(!env.logs.some((l) => l.level === 'error'), `${msg}: srLog 無 error`)
    }

    // =====================================================================
    // A. 同批缺 id 新列數 × 表
    // =====================================================================
    describe('A 同批缺 id 之新列皆入庫(IL-S1、IL-S3)', function() {

        for (let t of ['users', 'grups', 'pemis']) {
            it(`IL-A01 ${t}: 空表, 同批兩筆缺 id 之新列 → 兩筆皆新增、各補不同主鍵, 回成功(修正前 users 只建立最後一筆卻回成功)`, async function() {
                let env = createEnv({ empty: true })
                let sent = [idless(t, 1), idless(t, 2)]
                assert.strict.deepEqual(await run(env.pc, t, sent, { baseline: [] }), OKR)
                await expectAllAdded(env, t, sent, 0, `${t} 空表兩筆`)
            })

            it(`IL-A02 ${t}: 空表, 同批三筆缺 id 之新列 → 三筆皆新增、主鍵互異`, async function() {
                let env = createEnv({ empty: true })
                let sent = [idless(t, 1), idless(t, 2), idless(t, 3)]
                assert.strict.deepEqual(await run(env.pc, t, sent), OKR)
                await expectAllAdded(env, t, sent, 0, `${t} 空表三筆`)
            })

            it(`IL-A03 ${t}: 既有 2 列原樣帶回(帶 id、內容未變)＋兩筆缺 id 之新列 → 共 4 列; 既有列逐位元不變(不被寫入); 新列主鍵不撞既有`, async function() {
                let env = createEnv()
                let old = await rowsOf(env.woItems, t)
                let before = old.map((v) => JSON.stringify(env.woItems[t].get(v.id)))
                let sent = [idless(t, 1), idless(t, 2)]
                assert.strict.deepEqual(await run(env.pc, t, [...old, ...sent], { baseline: makeBaseline(old, ds[t].keys) }), OKR)
                await expectAllAdded(env, t, sent, 2, `${t} 混批`)
                assert.strict.deepEqual(old.map((v) => JSON.stringify(env.woItems[t].get(v.id))), before, '既有列逐位元不變')
            })
        }

        //id 之缺法: 缺鍵、空字串、null 皆為「缺 id」(isestr 為假)
        for (let [title, mk] of [['缺鍵', (r) => r], ['id 為空字串', (r) => ({ id: '', ...r })], ['id 為 null', (r) => ({ id: null, ...r })]]) {
            it(`IL-A04 users: 同批兩筆缺 id(${title}) → 兩筆皆新增`, async function() {
                let env = createEnv({ empty: true })
                let sent = [idless('users', 1), idless('users', 2)]
                assert.strict.deepEqual(await run(env.pc, 'users', sent.map(mk)), OKR)
                await expectAllAdded(env, 'users', sent, 0, `users ${title}`)
            })
        }

        it('IL-A05 users: 同批兩筆缺 id 且 name 相同、email 相異(users 之 name 允許重複)→ 兩筆皆新增(不得依名稱把缺 id 之列併為一筆; pemis／grups 同名則為 nameDuplicate, 見 NU-024)', async function() {
            let env = createEnv({ empty: true })
            let sent = [idless('users', 1, { name: 'same-name' }), idless('users', 2, { name: 'same-name' })]
            assert.strict.deepEqual(await run(env.pc, 'users', sent), OKR)
            await expectAllAdded(env, 'users', [{ name: 'same-name' }, { name: 'same-name' }], 0, 'users 同名兩筆')
            assert.strict.deepEqual((await env.woItems.users.select()).map((v) => v.email).sort(), ['new-1@example.test', 'new-2@example.test'])
        })

    })


    // =====================================================================
    // B. 與其他寫入並存
    // =====================================================================
    describe('B 缺 id 之新列與刪除／編修／基準／帶 id 新列並存(IL-S3)', function() {

        it('IL-B01 users: 刪除既有 u2 ＋ 兩筆缺 id 之新列 → u2 已刪、兩筆新增(共 3 列)', async function() {
            let env = createEnv()
            let old = await rowsOf(env.woItems, 'users')
            let sent = [idless('users', 1), idless('users', 2)]
            assert.strict.deepEqual(await run(env.pc, 'users', [old[0], ...sent]), OKR)
            let all = await env.woItems.users.select()
            assert.strict.equal(all.length, 3)
            assert.strict.equal(env.woItems.users.has('id-u2'), false, 'u2 已刪')
            assert.strict.deepEqual(all.filter((v) => !String(v.id).startsWith('id-u')).map((v) => v.name).sort(), ['new-user-1', 'new-user-2'])
        })

        it('IL-B02 users: 編修既有 u1 之說明 ＋ 兩筆缺 id 之新列 → u1 已改、兩筆新增、u2 不變', async function() {
            let env = createEnv()
            let old = await rowsOf(env.woItems, 'users')
            let before2 = JSON.stringify(env.woItems.users.get('id-u2'))
            let sent = [idless('users', 1), idless('users', 2)]
            assert.strict.deepEqual(await run(env.pc, 'users', [{ ...old[0], description: 'edited' }, old[1], ...sent]), OKR)
            assert.strict.equal(env.woItems.users.get('id-u1').description, 'edited')
            assert.strict.equal(JSON.stringify(env.woItems.users.get('id-u2')), before2)
            assert.strict.equal((await env.woItems.users.select()).length, 4)
        })

        it('IL-B03 users: 帶 baseline(= 既有列)＋兩筆缺 id 之新列 → 成功, 不誤判 addExisted(缺 id 之列無從在基準內), 兩筆皆新增', async function() {
            let env = createEnv()
            let old = await rowsOf(env.woItems, 'users')
            let sent = [idless('users', 1), idless('users', 2)]
            assert.strict.deepEqual(await run(env.pc, 'users', [...old, ...sent], { baseline: makeBaseline(old, ds.users.keys) }), OKR)
            await expectAllAdded(env, 'users', sent, 2, 'users 帶基準')
        })

        it('IL-B04 users: 兩筆缺 id ＋ 一筆帶 id 之新列(前端 funNew 產 id, _isNew) → 三筆皆新增(帶 id 者保留其 id, 缺 id 者各補不同主鍵)', async function() {
            let env = createEnv({ empty: true })
            let withId = { ...ds.users.funNew(), ...idless('users', 9), userId: '{新增}', timeCreate: '{新增}', userIdUpdate: '{新增}', timeUpdate: '{新增}', _isNew: true }
            let sent = [idless('users', 1), withId, idless('users', 2)]
            assert.strict.deepEqual(await run(env.pc, 'users', sent), OKR)
            let all = await env.woItems.users.select()
            assert.strict.equal(all.length, 3)
            assert.strict.ok(env.woItems.users.has(withId.id), '帶 id 者保留其 id')
            assert.strict.equal(new Set(all.map((v) => v.id)).size, 3)
            assert.strict.deepEqual(all.map((v) => v.name).sort(), ['new-user-1', 'new-user-2', 'new-user-9'])
        })

    })


    // =====================================================================
    // C. 守門(users): 缺 id 之列與其他路徑同口徑(IL-S2)
    // =====================================================================
    describe('C 缺 id 之新列之守門: 整次拒收、零寫入、同批合法列亦不寫入(IL-S2)', function() {

        async function expectRejectZero(env, rows, key, msg, opt) {
            let before = snapAll(env.woItems)
            assert.strict.deepEqual(await run(env.pc, 'users', rows, opt), ERR(key), msg)
            assert.strict.equal(snapAll(env.woItems), before, `${msg}: 四表逐位元不變`)
            assert.strict.equal(writesAll(env.woItems), 0, `${msg}: 零寫入`)
        }

        it('IL-C01 users: 兩筆缺 id 且 email 相同(本次造成之重複)→ saveRowFieldDuplicate, 零寫入(不得只靜默留一筆)', async function() {
            let env = createEnv({ empty: true })
            await expectRejectZero(env, [idless('users', 1, { email: 'same@example.test' }), idless('users', 2, { email: 'same@example.test' })], 'saveRowFieldDuplicate', '同 email')
        })

        it('IL-C02 users: 兩筆缺 id 而其一 email 為空字串 → saveRowFieldInvalid, 零寫入(另一筆合法者亦不寫入)', async function() {
            let env = createEnv({ empty: true })
            await expectRejectZero(env, [idless('users', 1), idless('users', 2, { email: '' })], 'saveRowFieldInvalid', '空 email')
        })

        it('IL-C03 users: 兩筆缺 id 而第二筆帶非空 from(pd)→ saveFromNotAllowed(後台新增列 from 須為 ""), 零寫入(第一筆合法者亦不寫入)', async function() {
            let env = createEnv({ empty: true })
            await expectRejectZero(env, [idless('users', 1), idless('users', 2, { from: 'pd' })], 'saveFromNotAllowed', '非空 from')
            let lg = findLog(env.logs, 'updateTabItems-external-error')
            assert.strict.ok(lg, '應記 updateTabItems-external-error')
            assert.strict.deepEqual([lg.keyTable, lg.msg, lg.reason], ['users', 'saveFromNotAllowed', 'addFrom'])
        })

        it('IL-C04 users: 缺 id 之新列 from 為非字串(null)→ saveFromNotAllowed(from 型別), 零寫入', async function() {
            let env = createEnv({ empty: true })
            await expectRejectZero(env, [idless('users', 1), idless('users', 2, { from: null })], 'saveFromNotAllowed', 'from=null')
        })

    })


    // =====================================================================
    // D. targets: 主鍵即名稱, 缺 id 拒收(不在 R5 範圍)
    // =====================================================================
    describe('D targets 缺 id 一律拒收(主鍵即名稱)', function() {

        it('IL-D01 targets: 同批兩筆缺 id → saveRowFieldInvalid, 零寫入', async function() {
            let env = createEnv({ empty: true })
            assert.strict.deepEqual(await run(env.pc, 'targets', [idless('targets', 1), idless('targets', 2)]), ERR('saveRowFieldInvalid'))
            assert.strict.equal(writesAll(env.woItems), 0)
            assert.strict.equal(env.woItems.targets.size(), 0)
        })

        it('IL-D02 targets: 單筆缺 id(其餘帶 id)→ saveRowFieldInvalid, 零寫入(帶 id 之合法列亦不寫入)', async function() {
            let env = createEnv()
            let old = await rowsOf(env.woItems, 'targets')
            let before = snapAll(env.woItems)
            assert.strict.deepEqual(await run(env.pc, 'targets', [...old, { id: 'sys/p9/b9', description: 'ok', from: '' }, idless('targets', 1)]), ERR('saveRowFieldInvalid'))
            assert.strict.equal(snapAll(env.woItems), before)
            assert.strict.equal(writesAll(env.woItems), 0)
        })

        it('IL-D03 對照 targets: 帶 id 之新增 → 成功(證明 D01／D02 之拒收確由缺 id 而來)', async function() {
            let env = createEnv({ empty: true })
            assert.strict.deepEqual(await run(env.pc, 'targets', [{ id: 'sys/p9/b9', description: 'ok', from: '' }, { id: 'sys/p9/b8', description: 'ok2', from: '' }]), OKR)
            assert.strict.equal(env.woItems.targets.size(), 2)
        })

    })


    // =====================================================================
    // E. 對照
    // =====================================================================
    describe('E 對照案', function() {

        it('IL-E01 users: 帶 id 之兩筆新增 → 成功(夾具本身合法, 非夾具造成之拒收)', async function() {
            let env = createEnv({ empty: true })
            let a = { ...idless('users', 1), id: 'id-new-1' }
            let b = { ...idless('users', 2), id: 'id-new-2' }
            assert.strict.deepEqual(await run(env.pc, 'users', [a, b]), OKR)
            assert.strict.deepEqual((await env.woItems.users.select()).map((v) => v.id).sort(), ['id-new-1', 'id-new-2'])
        })

        it('IL-E02 users: 單筆缺 id 之新增 → 成功並補主鍵(修正前亦成功之單筆形狀, 不得因拆分而退步)', async function() {
            let env = createEnv({ empty: true })
            let sent = [idless('users', 1)]
            assert.strict.deepEqual(await run(env.pc, 'users', sent), OKR)
            await expectAllAdded(env, 'users', sent, 0, 'users 單筆')
        })

        it('IL-E03 users: 已入庫之兩列(帶回)＋同一份缺 id 之兩列(email 與已入庫者相同)→ saveRowFieldDuplicate 整次拒收、零變更(缺 id 之列不冒充既有列、不靜默併入或略過)', async function() {
            let env = createEnv({ empty: true })
            let sent = [idless('users', 1), idless('users', 2)]
            assert.strict.deepEqual(await run(env.pc, 'users', sent), OKR)
            assert.strict.equal(env.woItems.users.size(), 2)
            //第二次: 以 [已入庫之兩列 + 同樣之缺 id 兩列] 送出 → email 與已入庫者相同, 為本次造成之重複, 整次拒收(而非靜默併入或再建兩筆)
            let old = await rowsOf(env.woItems, 'users')
            let before = snapAll(env.woItems)
            assert.strict.deepEqual(await run(env.pc, 'users', [...old, ...sent]), ERR('saveRowFieldDuplicate'))
            assert.strict.equal(snapAll(env.woItems), before)
        })

    })


    // =====================================================================
    // 靜態站點
    // =====================================================================
    describe('SITE 站點(靜態)', function() {

        let code = () => sourceLines(path.join(projRoot, 'server/procCore.mjs'), 'code').map((l) => l.text).join('\n')

        it('SITE-IL-001 updateTabItems 之缺 id 拆分條件涵蓋 users(isNameKeyTable || keyTable === \'users\'), 與 pemis／grups 同一分支(withId 以 id 對應、noId 併入 add)', function() {
            let c = code()
            assert.strict.ok(/if \(isNameKeyTable \|\| keyTable === 'users'\) \{[\s\S]{0,800}let withId = [^\n]*isestr\(get\(v, 'id'\)\)[\s\S]{0,200}let noId = [^\n]*!isestr\(get\(v, 'id'\)\)[\s\S]{0,200}ltdtDiffByKey\(ltdtOld, withId, 'id'\)[\s\S]{0,100}r\.add = \[\.\.\.r\.add, \.\.\.noId\]/.test(c), 'users 須與 pemis／grups 同走 withId／noId 拆分')
        })

        it('SITE-IL-002 else 分支(targets)仍以 keyDetect 對應(不拆缺 id: targets 缺 id 已於 ckKey 拒收)', function() {
            let c = code()
            assert.strict.ok(/else \{\s*r = ltdtDiffByKey\(ltdtOld, ltdtNew, keyDetect\)\s*\}/.test(c), 'else 分支以 keyDetect 對應')
            assert.strict.ok(/if \(arrHas\(keyTable, \['targets'\]\)\) \{\s*err = ckKey\(rows, 'id'\)/.test(c), 'targets 缺 id 由 ckKey 拒收')
        })

    })

})
