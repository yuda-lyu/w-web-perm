//procCore.updateTabItems 雙擊防護單元測試 (ADR-025): 後台整表寫入之「同一操作者占位」與「新增列已存在即拒絕」
//
//受測: server/procCore.mjs 之 updateTargets / updatePemis / updateGrups / updateUsers(kpFunExt 之實際入口, 內走 updateTabItems),
//依賴一律用真實實作——wsemi pmKeyMutex(kmx)、cacheSt + server/lockSave.mjs(lockSave)、w-serv-orm getMapOrm(procOrm 之核心, 含
//insert 填 userId / timeCreate、save 只填 userIdUpdate / timeUpdate 之 adjustData)——僅資料表以記憶體替身取代 w-orm-lmdb
//(insert 同 ifNoExists(id) 去重; save 同「既有則合併、無則插入」), 不起服務.
//api-doubleclick DC-01～06 另以真後端驗同一組契約之端到端不變式; 本檔以受控順序驗與時序無關之判定邏輯.
//UNIT-UTI-008～009: 標的清單送出前之正規化 src/plugins/reuseDeletedIds.mjs(新增列重用本次刪除之標的 id 時改為修改該標的, 否則被誤判為重送).
//跑法: npx mocha test/unit-procCore-updateTabItems.test.mjs --timeout 30000
import assert from 'assert'
import cloneDeep from 'lodash-es/cloneDeep.js'
import pmKeyMutex from 'wsemi/src/pmKeyMutex.mjs'
import cacheSt from 'wsemi/src/cacheSt.mjs'
import ds from '../src/schema/index.mjs'
import proc from '../server/procCore.mjs'
import createLockSave from '../server/lockSave.mjs'
import { tabWriteKey } from '../server/keyCheck.mjs'
import reuseDeletedIds from '../src/plugins/reuseDeletedIds.mjs'
import { mkTable, mkProcOrm, mkSrLog } from './tools/unitOrm.mjs'


//PH: 前端新列之佔位字(清單頁 addItem / copyItem 把 userId / timeCreate / userIdUpdate / timeUpdate 設為 `{${$t('xxxAddIdNew')}}`)
const PH = '{新增}'

//各表之 kpFunExt 入口與比對鍵(procCore: targets / users 以 id、pemis / grups 以 name)
const TABLES = {
    users: { fn: 'updateUsers', key: 'id' },
    targets: { fn: 'updateTargets', key: 'id' },
    grups: { fn: 'updateGrups', key: 'name' },
    pemis: { fn: 'updatePemis', key: 'name' },
}


//資料表替身: test/tools/unitOrm.mjs 之 mkTable(對齊 w-orm-lmdb 1.0.38 之對外語意: insert ifNoExists 與鍵長整批拒、save/del 逐筆結果, 2026-10-14 A-9 收斂;
//原本檔一份只實作 select/insert/save/del 且 save/del 不回逐筆結果之替身, 測不到 w-serv-orm 1.1.8 起之新失敗型)


//seedRows: 各表 base 列(伺服器已寫入之既有資料, 稽核欄位為真值)
function seedRows() {
    let t0 = '2026-01-01T00:00:00.000+08:00'
    let audit = { userId: 'id-seed', timeCreate: t0, userIdUpdate: 'id-seed', timeUpdate: t0 }
    let mk = (table, o) => ({ ...ds[table].funNew(), ...audit, ...o })
    return {
        users: [
            mk('users', { id: 'id-u1', order: 1, name: 'peter', email: 'peter@example.com', cgrups: '{}', isAdmin: 'n', isActive: 'y' }),
            mk('users', { id: 'id-u2', order: 2, name: 'admin', email: 'admin@example.com', cgrups: '{}', isAdmin: 'y', isActive: 'y' }),
        ],
        targets: [
            mk('targets', { id: '專案A/頁1/區塊1', order: 1, description: 'A1' }),
            mk('targets', { id: '專案A/頁1/區塊2', order: 2, description: 'A2' }),
        ],
        grups: [
            mk('grups', { id: 'id-g1', order: 1, name: '權限群組M1', cpemis: '{}' }),
            mk('grups', { id: 'id-g2', order: 2, name: '權限群組M2', cpemis: '{}' }),
        ],
        pemis: [
            mk('pemis', { id: 'id-p1', order: 1, name: '權限P1', crules: '{}' }),
            mk('pemis', { id: 'id-p2', order: 2, name: '權限P2', crules: '{}' }),
        ],
    }
}


//newRow: 模擬清單頁 addItem 之新列(前端 funNew 產 id、稽核欄位為佔位字、transient _isNew)
function newRow(table, tag, isNew = true) {
    let r = ds[table].funNew()
    r.userId = PH
    r.timeCreate = PH
    r.userIdUpdate = PH
    r.timeUpdate = PH
    if (table === 'users') {
        r.name = `new-${tag}`
        r.email = `new-${tag}@example.com`
        r.cgrups = '{}'
    }
    else if (table === 'targets') {
        r.id = `專案DC/${tag}` //本表 id 為標的路徑(前端 getNameNew 產生, 可就地改寫)
    }
    else {
        r.name = `新增-${tag}`
    }
    if (isNew) {
        r._isNew = true
    }
    return r
}


describe('unit-procCore-updateTabItems (後台整表寫入之雙擊防護, ADR-025)', function() {

    let env = null

    //createEnv: 每案一組全新之資料表替身、kmx、占位與 procCore(procOrm 以 w-serv-orm 之 getMapOrm → getProc 組出, 1.1.10 起各實例各自保存 woItems)
    function createEnv() {
        let seed = seedRows()
        let woItems = {}
        for (let k of Object.keys(TABLES)) {
            woItems[k] = mkTable(seed[k])
        }
        let { srLog, logs } = mkSrLog()
        let cst = cacheSt()
        let pc = proc(woItems, mkProcOrm(ds, woItems), { srLog, kmx: pmKeyMutex(), lockSave: createLockSave(cst) })
        env = { seed, woItems, logs, cst, pc }
        return env
    }

    afterEach(function() {
        if (env) {
            env.cst.clear() //停止 cacheSt 之 TTL 偵測 timer, 避免 mocha 不結束
            env = null
        }
    })

    let settle = async (ps) => {
        let rs = await Promise.allSettled(ps)
        return rs.map((r) => (r.status === 'fulfilled' ? { ok: true, v: r.value } : { ok: false, v: r.reason }))
    }


    //ADR-025 決定 4: 同一操作者之同表寫入處理中再送出 → 'saveInProgress', 不排隊、不寫入
    it('UNIT-UTI-001 同一操作者並行同表同一包 → 第 1 次成功, 第 2 次 saveInProgress 且未寫入', async function() {
        let { seed, woItems, pc, logs } = createEnv()
        let nr = newRow('grups', '001')
        let rows = [...seed.grups, nr]
        let [r1, r2] = await settle([
            pc.updateGrups('id-admin', cloneDeep(rows)),
            pc.updateGrups('id-admin', cloneDeep(rows)),
        ])
        assert.strict.deepEqual(r1, { ok: true, v: 'saveTabItemsSuccess' })
        assert.strict.deepEqual(r2, { ok: false, v: 'saveInProgress' })
        assert.strict.equal(woItems.grups.cnt.insert, 1, '只有第 1 次寫入')
        assert.strict.equal(woItems.grups.cnt.save, 0, '第 2 次不得以 save 覆寫新列')
        let g = woItems.grups.get(nr.id)
        assert.strict.equal(g.userId, 'id-admin', '建立者為伺服器填入之操作者')
        assert.strict.notEqual(g.timeCreate, PH, '建立時間不得為佔位字')
        //錯誤 key 經 updateGrups 之集中 errLog 記入 srLog(CLAUDE.md「記錄錯誤至少要記 err key」)
        assert.strict.ok(logs.some((l) => l.level === 'error' && l.event === 'updateGrups-error' && l.msg === 'saveInProgress' && l.userId === 'id-admin'), 'srLog 應記 saveInProgress')
    })


    //ADR-025 決定 4 + ADR-012: 不同操作者之並行仍由 kmx 序列化、各自成功, 終態為其一快照(api-doubleclick DC-01～04 之契約)
    it('UNIT-UTI-002 不同操作者並行同表 → 兩次皆成功, 終態為其一完整快照', async function() {
        let { seed, woItems, pc } = createEnv()
        let a = newRow('grups', '002a', false)
        let b = newRow('grups', '002b', false)
        let snapA = [...seed.grups, a]
        let snapB = [...seed.grups, b]
        let rs = await settle([
            pc.updateGrups('id-admin', cloneDeep(snapA)),
            pc.updateGrups('id-admin2', cloneDeep(snapB)),
        ])
        assert.strict.deepEqual(rs, [{ ok: true, v: 'saveTabItemsSuccess' }, { ok: true, v: 'saveTabItemsSuccess' }])
        let names = (await woItems.grups.select()).map((v) => v.name).sort()
        let cand = [snapA, snapB].map((s) => s.map((v) => v.name).sort())
        assert.strict.ok(cand.some((c) => JSON.stringify(c) === JSON.stringify(names)), `終態應等於其一快照, 實得 ${JSON.stringify(names)}`)
    })


    //ADR-025 決定 4: 依序重送(第 2 次於第 1 次完成後才到, 占位已釋放)以新增列標記擋; 四表皆適用(比對鍵 id 或 name)
    for (let table of Object.keys(TABLES)) {
        it(`UNIT-UTI-003 依序重送含 _isNew 新列(${table}, 比對鍵 ${TABLES[table].key}) → 第 2 次 saveNewRowExists, 新列未被覆寫, _isNew 不入庫`, async function() {
            let { seed, woItems, pc } = createEnv()
            let fn = TABLES[table].fn
            let nr = newRow(table, `003-${table}`)
            let rows = [nr, ...seed[table]] //前端新列加在最首
            let r1 = await pc[fn]('id-admin', cloneDeep(rows)).then((v) => ({ ok: true, v }), (e) => ({ ok: false, v: e }))
            assert.strict.deepEqual(r1, { ok: true, v: 'saveTabItemsSuccess' }, `${table} 第 1 次應成功`)
            let after1 = woItems[table].get(nr.id)
            assert.strict.ok(after1, `${table} 新列應已寫入`)
            assert.strict.equal(after1.userId, 'id-admin', `${table} 建立者為伺服器填入之操作者, 實得 ${after1.userId}`)
            assert.strict.notEqual(after1.timeCreate, PH, `${table} 建立時間不得為佔位字`)
            assert.strict.equal('_isNew' in after1, false, `${table} transient _isNew 不得入庫`)
            let r2 = await pc[fn]('id-admin', cloneDeep(rows)).then((v) => ({ ok: true, v }), (e) => ({ ok: false, v: e }))
            assert.strict.deepEqual(r2, { ok: false, v: 'saveNewRowExists' }, `${table} 第 2 次應拒絕`)
            assert.strict.deepEqual(woItems[table].get(nr.id), after1, `${table} 新列不得被第 2 次覆寫`)
            assert.strict.equal(woItems[table].size(), seed[table].length + 1, `${table} 列數為 base + 1`)
        })
    }


    //向後相容: 未帶 _isNew 之呼叫端(api-updateTabs、e2e resetDb、對話框送出之既有列)依序重送同一包仍成功
    it('UNIT-UTI-004 未帶 _isNew 之同一包依序重送 → 仍成功(不誤擋既有列之寫入)', async function() {
        let { seed, pc } = createEnv()
        let rows = [...seed.users, newRow('users', '004', false)]
        assert.strict.equal(await pc.updateUsers('id-admin', cloneDeep(rows)), 'saveTabItemsSuccess')
        assert.strict.equal(await pc.updateUsers('id-admin', cloneDeep(rows)), 'saveTabItemsSuccess')
    })


    //modeEditUsers='for:grups'(pickKeysOnly): 新增列本不採納(mergePickKeysOnly), 故不收集 _isNew、不因其拒絕
    it('UNIT-UTI-005 pickKeysOnly 模式: 帶 _isNew 之列不觸發 saveNewRowExists, 新列不採納, 只更新 cgrups', async function() {
        let { seed, woItems, pc } = createEnv()
        let u1 = { ...cloneDeep(seed.users[0]), cgrups: '{"權限群組M2":{"mode":"OR","isActive":"y"}}', _isNew: true } //既有 id 卻標 _isNew(API 直打)
        let nr = newRow('users', '005')
        let rows = [nr, u1, cloneDeep(seed.users[1])]
        let r = await pc.updateUsers('id-admin', rows, { pickKeysOnly: ['cgrups'] })
        assert.strict.equal(r, 'saveTabItemsSuccess')
        assert.strict.equal(woItems.users.get(nr.id), undefined, '新列不採納')
        assert.strict.equal(woItems.users.get('id-u1').cgrups, u1.cgrups, '既有列之 cgrups 採納')
        assert.strict.equal(woItems.users.size(), seed.users.length)
    })


    //外審 sol R7(run04): 有限數字 id 的正規化(R-ORM-04)原晚於 pickKeysOnly 合併, 數字 id 對不上庫內字串 id 而該列之群組指派被靜默略過卻回成功
    it('UNIT-UTI-012 pickKeysOnly 模式: 有限數字 id(如 7)對應庫內字串 id(\'7\') → 該列 cgrups 採納(修前: 靜默略過仍回成功)', async function() {
        let { seed, woItems, pc } = createEnv()
        await woItems.users.insert([{ ...cloneDeep(seed.users[0]), id: '7', order: 3, name: 'num', email: 'num@example.com', cgrups: '{}' }])
        let cg = '{"權限群組M2":{"mode":"OR","isActive":"y"}}'
        let rows = [cloneDeep(seed.users[0]), cloneDeep(seed.users[1]), { ...cloneDeep(woItems.users.get('7')), id: 7, cgrups: cg }]
        let r = await pc.updateUsers('id-admin', rows, { pickKeysOnly: ['cgrups'] })
        assert.strict.equal(r, 'saveTabItemsSuccess')
        assert.strict.equal(woItems.users.get('7').cgrups, cg, '數字 id 之列指派須採納')
        assert.strict.equal(woItems.users.size(), 3, '不得多出列')
    })

    //外審 sol R10(run04): 外部同步(WWebPerm.syncAndReplaceTabs)與後台整表寫入須共用同表互斥鍵 tabWriteKey, 否則兩者各自「先檢查唯一、後寫入」可交錯而略過 F-02／F-14.
    //此處以同一個 kmx 實例從外部持有 tabWriteKey('grups'), 驗證 updateGrups 必須等它釋放才寫入(同步端同鍵由 unit-keyCheck SITE-KC-007 靜態守護)
    it('UNIT-UTI-013 後台整表寫入與外部同步共用同表互斥鍵: 他方持有 tabWriteKey 期間 updateGrups 不寫入, 釋放後才完成', async function() {
        let seed = seedRows()
        let woItems = {}
        for (let k of Object.keys(TABLES)) {
            woItems[k] = mkTable(seed[k])
        }
        let { srLog } = mkSrLog()
        let cst = cacheSt()
        let kmx = pmKeyMutex()
        let pc = proc(woItems, mkProcOrm(ds, woItems), { srLog, kmx, lockSave: createLockSave(cst) })
        env = { cst }
        let release = null
        let gate = new Promise((resolve) => {
            release = resolve
        })
        let held = kmx(tabWriteKey('grups'), async () => {
            await gate
        })
        let nr = newRow('grups', '013')
        let done = false
        let p = pc.updateGrups('id-admin', [...cloneDeep(seed.grups), nr]).then((v) => {
            done = true
            return v
        })
        //持鎖期間：讓出事件迴圈數輪, updateGrups 仍不得寫入或完成
        for (let i = 0; i < 20; i++) {
            await new Promise((resolve) => setImmediate(resolve))
        }
        assert.strict.equal(done, false, '持鎖期間不得完成')
        assert.strict.equal(woItems.grups.cnt.insert + woItems.grups.cnt.save + woItems.grups.cnt.del, 0, '持鎖期間不得寫入')
        //另一張表不受影響(鍵依表而異): 此處用 targets(其引用端為 pemis, 與被持有之 grups 無涉); 單純新增而無改名／刪除之 pemis 寫入亦只取 pemis 鎖, 不被 grups 鎖擋住(分段取鎖, R-WRITE-LOCK-02)
        let rt = await pc.updateTargets('id-admin', [...cloneDeep(seed.targets), newRow('targets', '013')])
        assert.strict.equal(rt, 'saveTabItemsSuccess')
        let rp = await pc.updatePemis('id-admin', [...cloneDeep(seed.pemis), newRow('pemis', '013')])
        assert.strict.equal(rp, 'saveTabItemsSuccess')
        release()
        await held
        assert.strict.equal(await p, 'saveTabItemsSuccess')
        assert.strict.equal(woItems.grups.size(), seed.grups.length + 1)
    })

    //占位於失敗後釋放: 拒絕(ckKey / saveNewRowExists)後同一操作者可立即再送
    it('UNIT-UTI-006 拒絕後占位即釋放 → 同一操作者立即再送合法資料成功', async function() {
        let { seed, woItems, pc } = createEnv()
        //ckKey 拒絕(名稱重複; 2026-10-21 F-02 起 pemis／grups 之名稱重複回 nameDuplicate, ADR-034)
        let dup = { ...newRow('pemis', '006'), name: seed.pemis[0].name }
        let e1 = await pc.updatePemis('id-admin', [...seed.pemis, dup]).then(() => null, (e) => e)
        assert.strict.equal(e1, 'nameDuplicate')
        //saveNewRowExists 拒絕: 標 _isNew 但 id 已存在
        let exist = { ...cloneDeep(seed.pemis[0]), _isNew: true }
        let e2 = await pc.updatePemis('id-admin', [exist, cloneDeep(seed.pemis[1])]).then(() => null, (e) => e)
        assert.strict.equal(e2, 'saveNewRowExists')
        assert.strict.equal(woItems.pemis.cnt.insert + woItems.pemis.cnt.save + woItems.pemis.cnt.del, 0, '被拒絕之兩次皆不得寫入')
        //再送合法資料
        let nr = newRow('pemis', '006ok')
        assert.strict.equal(await pc.updatePemis('id-admin', [...seed.pemis, nr]), 'saveTabItemsSuccess')
        assert.strict.ok(woItems.pemis.get(nr.id))
    })


    //占位鍵含表名: 同一操作者並行寫不同表互不影響
    it('UNIT-UTI-007 同一操作者並行寫不同表 → 皆成功', async function() {
        let { seed, pc } = createEnv()
        let rs = await settle([
            pc.updateGrups('id-admin', [...seed.grups, newRow('grups', '007')]),
            pc.updatePemis('id-admin', [...seed.pemis, newRow('pemis', '007')]),
            pc.updateTargets('id-admin', [...seed.targets, newRow('targets', '007')]),
            pc.updateUsers('id-admin', [...seed.users, newRow('users', '007')]),
        ])
        assert.strict.deepEqual(rs.map((r) => r.v), ['saveTabItemsSuccess', 'saveTabItemsSuccess', 'saveTabItemsSuccess', 'saveTabItemsSuccess'])
    })


    //標的清單之 id 可就地改寫(路徑): 同一次儲存中刪除既有標的 X 又新增一列並把 id 改成 X, 淨效果為修改 X.
    //前端送出前以 reuseDeletedIds 正規化(去 _isNew、沿用資料庫之建立者 / 建立時間); 未正規化時被當重送擋下(重新整理後重做仍被擋)
    it('UNIT-UTI-008 標的: 刪除 X 並新增同 id 之列 → 未正規化為 saveNewRowExists; 以 reuseDeletedIds 正規化後成功, 建立者 / 建立時間沿用資料庫', async function() {
        let { seed, woItems, pc } = createEnv()
        let x = seed.targets[0] //'專案A/頁1/區塊1'
        let nr = { ...newRow('targets', '008'), id: x.id, description: 'A1-重建' } //新增列之 id 改成 X
        let rows = [nr, cloneDeep(seed.targets[1])] //X 已自清單刪除

        //未正規化: 被當重送擋下, 不寫入
        let e = await pc.updateTargets('id-admin', cloneDeep(rows)).then(() => null, (err) => err)
        assert.strict.equal(e, 'saveNewRowExists')
        assert.strict.equal(woItems.targets.cnt.insert + woItems.targets.cnt.save + woItems.targets.cnt.del, 0)

        //正規化後送出
        let rowsSend = reuseDeletedIds(rows, await woItems.targets.select())
        assert.strict.equal(rowsSend[0]._isNew, false, '重用 id 之新增列改為一般列')
        assert.strict.equal(rows[0]._isNew, true, '不修改輸入之列(清單列不變)')
        assert.strict.equal(await pc.updateTargets('id-admin', rowsSend), 'saveTabItemsSuccess')
        let t = woItems.targets.get(x.id)
        assert.strict.equal(t.description, 'A1-重建', '內容為新列之值')
        assert.strict.equal(t.userId, x.userId, '建立者沿用資料庫之值, 不得為佔位字')
        assert.strict.equal(t.timeCreate, x.timeCreate, '建立時間沿用資料庫之值')
        assert.strict.equal(t.userIdUpdate, 'id-admin', '修改者為本次操作者')
        assert.strict.ok(t.timeUpdate !== PH && t.timeUpdate !== x.timeUpdate, '修改時間由後端寫入')
        assert.strict.equal(woItems.targets.size(), seed.targets.length, '列數不變(修改而非新增)')
    })


    //reuseDeletedIds 之邊界: 只處理「帶 _isNew、id 存在於資料庫、且於送出列內唯一」者
    it('UNIT-UTI-009 reuseDeletedIds: 真正新增之列、非新增列、送出列內重複 id 皆不處理; id 含「.」亦正確比對', function() {
        let db = [
            { id: 'a.b/c', userId: 'u0', timeCreate: 't0', description: 'db' },
            { id: 'd', userId: 'u0', timeCreate: 't0', description: 'db' },
        ]
        let rows = [
            { id: 'a.b/c', _isNew: true, userId: PH, timeCreate: PH, description: 'new' }, //重用 → 正規化
            { id: 'brand-new', _isNew: true, userId: PH, timeCreate: PH }, //資料庫無 → 不處理
            { id: 'd', userId: 'u0', timeCreate: 't0' }, //非新增列 → 不處理
            { id: 'd', _isNew: true, userId: PH, timeCreate: PH }, //送出列內重複 → 不處理(交後端 ckKey)
        ]
        let rs = reuseDeletedIds(rows, db)
        assert.strict.deepEqual(rs[0], { id: 'a.b/c', _isNew: false, userId: 'u0', timeCreate: 't0', description: 'new' })
        assert.strict.equal(rs[1], rows[1])
        assert.strict.equal(rs[2], rows[2])
        assert.strict.equal(rs[3], rows[3])
        assert.strict.deepEqual(reuseDeletedIds([], db), [])
    })


    //R-ORM-04: w-serv-orm 1.1.11 起數字主鍵存為其字串形式: 送出之數字主鍵須對上庫內之字串主鍵(修改而非刪除後重建), 建立者 / 建立時間沿用資料庫
    //(依 w-serv-orm 主責 agent 之建議書 3.5-3)
    it('UNIT-UTI-010 使用者: 既有列主鍵 \'123\' 以數字 123 送出 → 視為修改, 建立者 / 建立時間沿用資料庫, 列數不變', async function() {
        let { seed, woItems, pc } = createEnv()
        let base = { ...cloneDeep(seed.users[0]), id: '123', name: 'p123', email: 'p123@example.com' }
        await woItems.users.insert([base])
        let rows = [...cloneDeep(seed.users), { ...cloneDeep(base), id: 123, name: 'p123-改' }]
        assert.strict.equal(await pc.updateUsers('id-admin', rows), 'saveTabItemsSuccess')
        let u = woItems.users.get('123')
        assert.strict.equal(u.name, 'p123-改', '內容為送出之值')
        assert.strict.equal(u.userId, base.userId, '建立者沿用資料庫之值')
        assert.strict.equal(u.timeCreate, base.timeCreate, '建立時間沿用資料庫之值')
        assert.strict.equal(u.userIdUpdate, 'id-admin', '修改者為本次操作者')
        assert.strict.equal(woItems.users.size(), seed.users.length + 1, '列數不變(修改而非刪除後重建)')
        assert.strict.equal(woItems.users.has(123), false, '不得以數字為鍵存放')
    })


    //R-KEY-01／R-AUTH-PATH-01: 「新增列已存在即拒絕」之查表鍵為資料庫 id(使用者資料), 查表容器須無原型;
    //修前以一般物件 {} 為容器, id='__proto__' 時 kpIdOld['__proto__']=true 被忽略, 已存在之 __proto__ 列不被偵測(constructor 等其他原型鍵名本就偵測得到)
    it('UNIT-UTI-011 標的 id 為 __proto__／constructor／toString 之既有列被標 _isNew 再送 → saveNewRowExists(查表容器無原型)', async function() {
        for (let id of ['__proto__', 'constructor', 'toString']) {
            let { seed, woItems, pc, cst } = createEnv()
            let base = { ...cloneDeep(seed.targets[0]), id, order: 99, description: 'proto-key' }
            await woItems.targets.insert([base])
            let rows = [...cloneDeep(seed.targets), { ...cloneDeep(base), _isNew: true }]
            let before = JSON.stringify(woItems.targets.snapshot())
            let e = await pc.updateTargets('id-admin', rows).then(() => null, (err) => err)
            assert.strict.equal(e, 'saveNewRowExists', `id=${id}`)
            assert.strict.equal(JSON.stringify(woItems.targets.snapshot()), before, `id=${id}: 資料表須零變更`)
            cst.clear()
        }
    })

})
