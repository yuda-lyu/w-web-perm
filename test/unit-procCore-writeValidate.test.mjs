//procCore 整表寫入之「可預判寫入失敗於第一個破壞步驟之前擋下」與「ORM 原文不外送」(規則帳本 R-ORM-01、R-ORM-02、R-KEY-01; ADR-026)
//
//受測: server/procCore.mjs 之 updateTargets / updatePemis / updateGrups / updateUsers(kpFunExt 之實際入口, 內走 updateTabItems),
//依賴一律真實: w-serv-orm 之 getMapOrm → getProc 組出之 procOrm(真 adjustData / clearXSS / 主鍵標記檢查 / 逐筆結果檢查)、wsemi pmKeyMutex、
//cacheSt + server/lockSave.mjs; 只有資料表以 test/tools/unitOrm.mjs 之替身取代 w-orm-lmdb(對齊 1.0.38 之對外語意: insert ifNoExists 與鍵長整批拒、
//save/del 逐筆結果).
//每案斷言「被拒時資料表零變更」(逐列快照比對)——修正前之 del → insert → save 於 insert 被拒時舊列已刪(資料遺失)、save 被拒時已部分寫入.
//跑法: npx mocha test/unit-procCore-writeValidate.test.mjs --timeout 30000
import assert from 'assert'
import cloneDeep from 'lodash-es/cloneDeep.js'
import pmKeyMutex from 'wsemi/src/pmKeyMutex.mjs'
import cacheSt from 'wsemi/src/cacheSt.mjs'
import ds from '../src/schema/index.mjs'
import proc from '../server/procCore.mjs'
import * as procMod from '../server/procCore.mjs'
import createLockSave from '../server/lockSave.mjs'
import { mkTable, mkProcOrm, mkSrLog } from './tools/unitOrm.mjs'


const PH = '{新增}' //前端新列之稽核欄位佔位字

const TABLES = {
    users: { fn: 'updateUsers' },
    targets: { fn: 'updateTargets' },
    grups: { fn: 'updateGrups' },
    pemis: { fn: 'updatePemis' },
}


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
            mk('targets', { id: 'T1', order: 1, description: 'd1' }),
            mk('targets', { id: 'T2', order: 2, description: 'd2' }),
        ],
        grups: [
            mk('grups', { id: 'id-g1', order: 1, name: 'M1', cpemis: '{}' }),
            mk('grups', { id: 'id-g2', order: 2, name: 'M2', cpemis: '{}' }),
        ],
        pemis: [
            mk('pemis', { id: 'id-p1', order: 1, name: 'P1', crules: '{}' }),
            mk('pemis', { id: 'id-p2', order: 2, name: 'P2', crules: '{}' }),
        ],
    }
}


//newRow: 模擬清單頁 addItem 之新列(前端 funNew 產 id、稽核欄位為佔位字、transient _isNew)
function newRow(table, o = {}) {
    let r = ds[table].funNew()
    r.userId = PH
    r.timeCreate = PH
    r.userIdUpdate = PH
    r.timeUpdate = PH
    if (table === 'users') {
        r.name = 'new-u'
        r.email = 'new-u@example.com'
        r.cgrups = '{}'
    }
    else if (table === 'targets') {
        r.id = 'T-new'
    }
    else {
        r.name = 'new-n'
    }
    r._isNew = true
    return { ...r, ...o }
}


describe('unit-procCore-writeValidate (寫入前驗證與寫入失敗回 key, ADR-026)', function() {

    let env = null

    function createEnv(fail = {}) {
        let seed = seedRows()
        let woItems = {}
        for (let k of Object.keys(TABLES)) {
            woItems[k] = mkTable(seed[k], fail[k] || {})
        }
        let { srLog, logs } = mkSrLog()
        let cst = cacheSt()
        let pc = proc(woItems, mkProcOrm(ds, woItems), { srLog, kmx: pmKeyMutex(), lockSave: createLockSave(cst) })
        env = { seed, woItems, logs, cst, pc }
        return env
    }

    afterEach(function() {
        if (env) {
            env.cst.clear()
            env = null
        }
    })

    let run = async (pc, table, rows) => {
        try {
            return { ok: true, v: await pc[TABLES[table].fn]('id-admin', rows) }
        }
        catch (err) {
            return { ok: false, v: err }
        }
    }

    let snapAll = (woItems) => Object.fromEntries(Object.keys(TABLES).map((k) => [k, woItems[k].snapshot()]))


    // ===== R-ORM-01: 可預判之寫入失敗於第一個破壞步驟(del)之前擋下, 資料表零變更 =====

    //spec(流程_後台標的清單 E2E-011): 既有標的之 id 改為含 HTML 標記者 → 回 htmlMarkupNotAllowed, 原標的仍在(修正前: 舊列已刪、新列被拒 → 遺失)
    it('WV-001 標的改既有 id 為含標記者 → htmlMarkupNotAllowed, 資料表零變更(原列仍在)', async function() {
        let { woItems, pc } = createEnv()
        let before = snapAll(woItems)
        let rows = (await woItems.targets.select()).sort((a, b) => a.order - b.order)
        rows[0].id = 'T1<x'
        let r = await run(pc, 'targets', rows)
        assert.strict.deepEqual(r, { ok: false, v: 'htmlMarkupNotAllowed' })
        assert.strict.deepEqual(snapAll(woItems), before, '資料表須零變更')
        assert.strict.ok(woItems.targets.has('T1'), '原標的 T1 須仍在')
    })

    it('WV-002 各表新增列之任一欄位含標記 → htmlMarkupNotAllowed, 資料表零變更', async function() {
        let cases = [
            ['targets', { id: 'a<b' }],
            ['targets', { description: 'x<y' }],
            ['grups', { name: 'g<b' }],
            ['pemis', { description: '<script>x' }],
            ['users', { email: 'a<b@example.com' }],
        ]
        for (let [table, o] of cases) {
            let { woItems, pc, cst } = createEnv()
            let before = snapAll(woItems)
            let rows = [...(await woItems[table].select()).sort((a, b) => a.order - b.order), newRow(table, o)]
            let r = await run(pc, table, rows)
            assert.strict.deepEqual(r, { ok: false, v: 'htmlMarkupNotAllowed' }, `${table} ${JSON.stringify(o)}`)
            assert.strict.deepEqual(snapAll(woItems), before, `${table} ${JSON.stringify(o)} 資料表須零變更`)
            cst.clear()
        }
    })

    it('WV-003 同批刪除 + 新增含標記之列 → 被拒且刪除未落地(T2 仍在)', async function() {
        let { woItems, pc } = createEnv()
        let before = snapAll(woItems)
        let rows = (await woItems.targets.select()).filter((v) => v.id !== 'T2')
        rows.push(newRow('targets', { id: 'a<b' }))
        let r = await run(pc, 'targets', rows)
        assert.strict.deepEqual(r, { ok: false, v: 'htmlMarkupNotAllowed' })
        assert.strict.deepEqual(snapAll(woItems), before)
        assert.strict.ok(woItems.targets.has('T2'), '刪除不得落地')
    })

    it('WV-004 同批修改他列 + 新增含標記之列 → 被拒且修改未落地', async function() {
        let { woItems, pc } = createEnv()
        let before = snapAll(woItems)
        let rows = (await woItems.targets.select()).sort((a, b) => a.order - b.order)
        rows[0].description = 'changed'
        rows.push(newRow('targets', { id: 'a<b' }))
        let r = await run(pc, 'targets', rows)
        assert.strict.deepEqual(r, { ok: false, v: 'htmlMarkupNotAllowed' })
        assert.strict.deepEqual(snapAll(woItems), before)
    })

    it('WV-005 主鍵 UTF-8 1979 B → saveRowFieldInvalid 且零變更; 1978 B 可寫', async function() {
        let big = (n) => 'K' + 'x'.repeat(n - 1)
        {
            let { woItems, pc, cst } = createEnv()
            let before = snapAll(woItems)
            let rows = (await woItems.targets.select()).sort((a, b) => a.order - b.order)
            rows[0].id = big(1979)
            let r = await run(pc, 'targets', rows)
            assert.strict.deepEqual(r, { ok: false, v: 'saveRowFieldInvalid' })
            assert.strict.deepEqual(snapAll(woItems), before, '1979 B: 資料表須零變更(修正前 T1 遺失)')
            cst.clear()
        }
        {
            let { woItems, pc } = createEnv()
            let rows = (await woItems.targets.select()).sort((a, b) => a.order - b.order)
            rows[0].id = big(1978)
            let r = await run(pc, 'targets', rows)
            assert.strict.deepEqual(r, { ok: true, v: 'saveTabItemsSuccess' })
            assert.strict.ok(woItems.targets.has(big(1978)) && !woItems.targets.has('T1'), '1978 B 為合法改 id')
        }
    })

    it('WV-006 白名單標籤與不構成標記之 < > 照常寫入且存值＝送入值', async function() {
        let vals = ['<b>粗體</b>', 'a < b', 'x > y', 'a<1', '專案A/頁A']
        for (let desc of vals) {
            let { woItems, pc, cst } = createEnv()
            let rows = (await woItems.targets.select()).sort((a, b) => a.order - b.order)
            rows[0].description = desc
            let r = await run(pc, 'targets', rows)
            assert.strict.deepEqual(r, { ok: true, v: 'saveTabItemsSuccess' }, desc)
            assert.strict.equal(woItems.targets.get('T1').description, desc, `存值須等於送入值: ${desc}`)
            cst.clear()
        }
    })

    it('WV-007 既有列含會被改寫之值但本次未變更(不寫入) → 不阻擋他列之儲存', async function() {
        let seed = seedRows()
        seed.targets[1].description = 'legacy<x' //裸寫入留下之舊資料
        let woItems = {}
        for (let k of Object.keys(TABLES)) {
            woItems[k] = mkTable(seed[k])
        }
        let { srLog } = mkSrLog()
        let cst = cacheSt()
        let pc = proc(woItems, mkProcOrm(ds, woItems), { srLog, kmx: pmKeyMutex(), lockSave: createLockSave(cst) })
        env = { cst }
        let rows = (await woItems.targets.select()).sort((a, b) => a.order - b.order)
        rows[0].description = 'changed'
        let r = await run(pc, 'targets', rows)
        assert.strict.deepEqual(r, { ok: true, v: 'saveTabItemsSuccess' })
        assert.strict.equal(woItems.targets.get('T1').description, 'changed')
        assert.strict.equal(woItems.targets.get('T2').description, 'legacy<x', '未變更之舊列不寫入、不改寫')
    })

    //API 直打(不帶 _isNew)送與既有列同 id 而名稱不同之新列: 修正前比對鍵為名稱 → 當新增 → insert 遇既存主鍵即略過而回成功(M9 未寫入, 靜默)
    it('WV-008 主鍵(id)與未變更之既有列重複(名稱不同, 未帶 _isNew) → saveRowFieldDuplicate 且零變更', async function() {
        let { woItems, pc } = createEnv()
        let before = snapAll(woItems)
        let rows = (await woItems.grups.select()).sort((a, b) => a.order - b.order)
        let nr = newRow('grups', { id: 'id-g1', name: 'M9' })
        delete nr._isNew
        rows.push(nr)
        let r = await run(pc, 'grups', rows)
        assert.strict.deepEqual(r, { ok: false, v: 'saveRowFieldDuplicate' })
        assert.strict.deepEqual(snapAll(woItems), before)
    })


    // ===== R-ORM-02: ORM 原文不外送, 寫入失敗回 saveWriteFail, 原文入 srLog =====

    it('WV-ERR-001 ORM save 逐筆失敗 → saveWriteFail(非 procOrm 英文原文), srLog 記原文', async function() {
        let { woItems, pc, logs } = createEnv({ targets: { saveIds: ['T1'] } })
        let rows = (await woItems.targets.select()).sort((a, b) => a.order - b.order)
        rows[0].description = 'changed'
        let r = await run(pc, 'targets', rows)
        assert.strict.deepEqual(r, { ok: false, v: 'saveWriteFail' })
        let e = logs.find((l) => l.level === 'error' && l.event === 'updateTargets-error')
        assert.strict.ok(e && e.msg === 'saveWriteFail' && String(e.raw).includes('failed to save data'), `srLog 須記 key 與原文, 實得 ${JSON.stringify(e)}`)
    })

    it('WV-ERR-002 ORM insert 整批失敗 → saveWriteFail', async function() {
        let { woItems, pc } = createEnv({ grups: { insert: 'disk full' } })
        let rows = [...(await woItems.grups.select()).sort((a, b) => a.order - b.order), newRow('grups', { name: 'M3' })]
        let r = await run(pc, 'grups', rows)
        assert.strict.deepEqual(r, { ok: false, v: 'saveWriteFail' })
    })

    it('WV-ERR-003 本套件語系鍵原樣轉出(saveRowFieldDuplicate)', async function() {
        let { woItems, pc } = createEnv()
        let rows = (await woItems.pemis.select()).sort((a, b) => a.order - b.order)
        rows.push(newRow('pemis', { name: 'P1' }))
        let r = await run(pc, 'pemis', rows)
        assert.strict.deepEqual(r, { ok: false, v: 'saveRowFieldDuplicate' })
    })


    // ===== R-KEY-01: 查表容器無原型(原型鍵名不被誤判為已存在) =====

    it('WV-PROTO-001 標的 id 與群組／權限名稱為原型鍵名 → 可儲存(不誤判重複)', async function() {
        for (let [table, o] of [['targets', { id: 'constructor' }], ['grups', { name: 'toString' }], ['pemis', { name: 'constructor' }], ['users', { email: 'hasOwnProperty' }]]) {
            let { woItems, pc, cst } = createEnv()
            let rows = [...(await woItems[table].select()).sort((a, b) => a.order - b.order), newRow(table, o)]
            let r = await run(pc, table, cloneDeep(rows))
            assert.strict.deepEqual(r, { ok: true, v: 'saveTabItemsSuccess' }, `${table} ${JSON.stringify(o)}`)
            cst.clear()
        }
    })


    // ===== R-ORM-05 / R-OBJ-ITER-01: 整表寫入之 rows 須為陣列; 列物件帶 length 欄位不影響驗證 =====

    //修正前: rows 非陣列時 ltdtmapping 回 [], ltdtDiffByKey 視為「全部刪除」→ 回成功且整表清空(2026-10-20 真後端實測 rows={length:2e7}: targets 22 → 0)
    //另一類(外審 sol#3／minimax#1 實測): 單元素陣列其元素為空值([null]、[{}]、['']、[[]])時, ltdtmapping 內 wsemi isearr 判為非陣列而回 [], 同樣整表清空並回成功
    it('WV-OI-001 rows 非陣列或含非物件／空物件之列(帶 length 之物件、一般物件、字串、數字、null、undefined、[null]、[{}]、[\'\']、[[]]、[5]、[合法列, null]) → saveRowFieldInvalid, 四表皆零變更, srLog 記 rowsInvalid', async function() {
        for (let table of Object.keys(TABLES)) {
            let probes = (rowsDb) => [
                { length: 3 },
                { length: 0 },
                { length: 2, 0: rowsDb[0], 1: rowsDb[1] }, //形似陣列之物件
                {},
                'abc',
                5,
                null,
                undefined,
                [null],
                [{}],
                [''],
                [[]],
                [5],
                [rowsDb[0], null],
                [rowsDb[0], 5],
                [rowsDb[0], {}],
            ]
            let { woItems, logs, pc, cst } = createEnv()
            let rowsDb = (await woItems[table].select()).sort((a, b) => a.order - b.order)
            let before = snapAll(woItems)
            for (let rows of probes(rowsDb)) {
                logs.length = 0
                let r = await run(pc, table, rows)
                assert.strict.deepEqual(r, { ok: false, v: 'saveRowFieldInvalid' }, `${table} ${JSON.stringify(rows)}`)
                assert.strict.deepEqual(snapAll(woItems), before, `${table} ${JSON.stringify(rows)}: 資料表須零變更`)
                let e = logs.find((l) => l.level === 'error' && l.event === 'updateTabItems-validate-error')
                assert.strict.ok(e && e.reason === 'rowsInvalid' && e.msg === 'saveRowFieldInvalid', `srLog 須記 key 與原因, 實得 ${JSON.stringify(e)}`)
            }
            cst.clear()
        }
    })

    //modeEditUsers='for:grups'(pickKeysOnly): 修前非陣列 rows 經 mergePickKeysOnly 視為無送入列, 資料不變且回成功(帶 length 之物件則會採納索引 0 之列); 修後一律拒絕
    it('WV-OI-005 pickKeysOnly 模式(for:grups): rows 非陣列或含空列 → saveRowFieldInvalid, 資料零變更; 合法陣列仍只採納 cgrups', async function() {
        let { woItems, pc, cst } = createEnv()
        let before = snapAll(woItems)
        let rowsDb = (await woItems.users.select()).sort((a, b) => a.order - b.order)
        for (let rows of [{}, { length: 1, 0: { ...rowsDb[0], cgrups: '{"X":1}' } }, 'abc', null, [null], [{}], [rowsDb[0], null]]) {
            let r = null
            try {
                r = { ok: true, v: await pc.updateUsers('id-admin', rows, { pickKeysOnly: ['cgrups'] }) }
            }
            catch (err) {
                r = { ok: false, v: err }
            }
            assert.strict.deepEqual(r, { ok: false, v: 'saveRowFieldInvalid' }, JSON.stringify(rows))
            assert.strict.deepEqual(snapAll(woItems), before, `${JSON.stringify(rows)}: 資料表須零變更`)
        }
        //合法陣列: 只採納 cgrups
        let rows = rowsDb.map((u) => ({ ...u, name: 'CHANGED', cgrups: '{"M9":{"mode":"OR","isActive":"y"}}' }))
        let r = await pc.updateUsers('id-admin', rows, { pickKeysOnly: ['cgrups'] })
        assert.strict.equal(r, 'saveTabItemsSuccess')
        let after = (await woItems.users.select()).sort((a, b) => a.order - b.order)
        assert.strict.deepEqual(after.map((u) => u.name), rowsDb.map((u) => u.name), '身分欄仍以資料庫為準')
        assert.strict.ok(after.every((u) => u.cgrups === '{"M9":{"mode":"OR","isActive":"y"}}'), 'cgrups 被採納')
        cst.clear()
    })

    it('WV-OI-002 rows 為空陣列 → 仍合法(清空整表為正常操作)', async function() {
        let { woItems, pc } = createEnv()
        let r = await run(pc, 'targets', [])
        assert.strict.deepEqual(r, { ok: true, v: 'saveTabItemsSuccess' })
        assert.strict.equal((await woItems.targets.select()).length, 0)
    })

    //列物件帶 length(0、1、2**32-1)＋標記: 兩條寫入路徑皆先以 ltdtmapping 依 schema 欄位重建列(schema 無 length 欄), length 到不了 validateRows,
    //故修正前亦被拒(整合面迴歸; 函數本身之縱深防禦見 unit-validateRows VR-OI-*)
    it('WV-OI-003 列帶 length 欄位(0、1、2**32-1)且某欄含標記 → htmlMarkupNotAllowed, 資料表零變更', async function() {
        for (let n of [0, 1, 2 ** 32 - 1]) {
            let { woItems, pc, cst } = createEnv()
            let before = snapAll(woItems)
            let rows = (await woItems.targets.select()).sort((a, b) => a.order - b.order)
            rows[0] = { ...rows[0], length: n, description: '<script>x</script>' }
            let r = await run(pc, 'targets', rows)
            assert.strict.deepEqual(r, { ok: false, v: 'htmlMarkupNotAllowed' }, `length:${n}`)
            assert.strict.deepEqual(snapAll(woItems), before, `length:${n}: 資料表須零變更`)
            cst.clear()
        }
    })

    //isRowObj(後台整表寫入與外部同步共用之「列」判準): 非 null、非陣列、至少一個自有可列舉鍵之物件; 不依 toString 判型(Symbol.toStringTag 偽稱不影響)
    it('WV-OI-006 isRowObj 判準: 非空物件為 true; null、undefined、原始值、陣列、空物件為 false; 偽稱 Array 之物件依實際型別判', function() {
        assert.strict.equal(typeof procMod.isRowObj, 'function', 'procCore 應匯出 isRowObj')
        let f = procMod.isRowObj
        for (let v of [{ id: 'a' }, { length: 0 }, Object.assign(Object.create(null), { id: 'a' }), Object.defineProperty({ id: 'x' }, Symbol.toStringTag, { value: 'Array' })]) {
            assert.strict.equal(f(v), true, JSON.stringify(v))
        }
        for (let v of [null, undefined, 'abc', '', 5, 0, true, [], [1], [{ id: 'a' }], {}, () => {}, Object.create(null)]) {
            assert.strict.equal(f(v), false, Object.prototype.toString.call(v))
        }
    })

    it('WV-OI-004 列帶 length 欄位但內容合法 → 成功寫入, length 不入庫', async function() {
        let { woItems, pc } = createEnv()
        let rows = (await woItems.targets.select()).sort((a, b) => a.order - b.order)
        rows[0] = { ...rows[0], length: 5, description: 'changed' }
        let r = await run(pc, 'targets', rows)
        assert.strict.deepEqual(r, { ok: true, v: 'saveTabItemsSuccess' })
        let saved = woItems.targets.get('T1')
        assert.strict.equal(saved.description, 'changed')
        assert.strict.ok(!Object.prototype.hasOwnProperty.call(saved, 'length'), 'length 不是 schema 欄位, 不得入庫')
    })

})
