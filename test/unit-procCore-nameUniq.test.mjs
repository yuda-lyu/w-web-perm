//後台整表寫入之群組／權限名稱唯一(F-02; 規則帳本 R-NAME-UNIQ-02、ADR-034)
//
//述語(規格句, 見規則帳本 R-NAME-UNIQ-02):
//  P1 寫入後之名稱集合(= 送入之整表)中, grups／pemis 之 name 精確 === 重複, 且為「本次造成或觸及」者 → 整次拒收 nameDuplicate, 於任何寫入之前(資料表零變更);
//  P2 與本次無關之「歷史既有重複」(庫內已有同名 ≥ 2 列, 送入列中該名稱之每一列皆為庫內同 id 同名之既有列, 筆數不多於庫內)不致使存檔失敗——才能在後台修復;
//  P3 歷史重複存在時: 改別的列可存; 重複中任一列改為不重複之名稱可存且改名確實落地(不被「以 name 對應之差異」靜默吞掉); 刪其中一列可存;
//  P4 歷史重複存在時: 再新增第三個同名列、把他列改成該名、把重複中一列改成已被他列使用之名稱 → 皆拒;
//  P5 比對為精確 ===(僅大小寫或空白不同視為不同名稱); 空／非字串名稱仍為 saveRowFieldInvalid; users 以 email、targets 以 id 之 saveRowFieldDuplicate 不變.
//
//受測: server/procCore.mjs 之 updateGrups／updatePemis(kpFunExt 之實際入口, 內走 updateTabItems); 注入接縫: proc(woItems, procOrm, { srLog, withTabLocks, guardWrite, lockSave })之 woItems
//(test/tools/unitOrm.mjs 之 mkTable 替身, 其 cnt 計 insert／save／del／delAll 次數, 供斷言「被拒時零寫入」), procOrm／withTabLocks／guardWrite 為真(mkCore: 真 WServOrm 包住替身表; perm-run01: 原 mkProcOrm＋kmx 改 mkCore).
//跑法: npx mocha test/unit-procCore-nameUniq.test.mjs --reporter list --timeout 30000
import assert from 'assert'
import cloneDeep from 'lodash-es/cloneDeep.js'
import cacheSt from 'wsemi/src/cacheSt.mjs'
import ds from '../src/schema/index.mjs'
import proc from '../server/procCore.mjs'
import createLockSave from '../server/lockSave.mjs'
import { mkTable, mkCore, mkSrLog } from './tools/unitOrm.mjs'


const PH = '{新增}' //前端新列之稽核欄位佔位字
const T0 = '2026-01-01T00:00:00.000+08:00'
const AUDIT = { userId: 'id-seed', timeCreate: T0, userIdUpdate: 'id-seed', timeUpdate: T0 }

const TABLES = {
    grups: { fn: 'updateGrups', col: 'cpemis' },
    pemis: { fn: 'updatePemis', col: 'crules' },
}


//seedRows: 一般(無歷史重複)種子與「歷史重複」種子
//  clean: X1(id-1)、X2(id-2)、X3(id-3)
//  legacy: X1(id-1, from '')、X1(id-2, from 'appX': 外部同步灌入之同名列)、X3(id-3) —— 以 name 為鍵之差異無法區分 id-1 與 id-2
//  legacy === 'backend': 同 legacy, 但 id-2 亦為後台列(from ''; F-02 之前後台亦可能造成同名)
//run07 U1 修正(外部列保護 F-23 / R-EXT-OWN-01 / R-PRINCIPLE-00 原則 5): 外部列(from 非空)之身分／結構欄後台不得改、不得刪(saveExternalRowChanged),
//故 NU-012(對 id-2 改名)、NU-013(刪除 id-2、對 id-2 改名)若 id-2 為外部列會先被外部列守門拒收; 這兩案之述語(P3)只談「歷史同名之修復路徑」,
//與外部列無關, 改用 'backend' 種子, 斷言未放寬; 外部列版本之拒收(同形操作對外部 id-2 → saveExternalRowChanged 且零寫入)見 unit-procCore-external.
function seedRows(table, legacy) {
    let col = TABLES[table].col
    let mk = (o) => ({ ...ds[table].funNew(), ...AUDIT, [col]: '{}', ...o })
    if (!legacy) {
        return [
            mk({ id: 'id-1', order: 1, name: 'X1', from: '' }),
            mk({ id: 'id-2', order: 2, name: 'X2', from: '' }),
            mk({ id: 'id-3', order: 3, name: 'X3', from: '' }),
        ]
    }
    return [
        mk({ id: 'id-1', order: 1, name: 'X1', from: '', description: 'd1' }),
        mk({ id: 'id-2', order: 2, name: 'X1', from: legacy === 'backend' ? '' : 'appX', description: 'd2' }),
        mk({ id: 'id-3', order: 3, name: 'X3', from: '', description: 'd3' }),
    ]
}


//newRow: 模擬清單頁 addItem 之新列(前端 funNew 產 id、稽核欄位為佔位字、transient _isNew)
function newRow(table, name, o = {}) {
    let r = ds[table].funNew()
    r.userId = PH
    r.timeCreate = PH
    r.userIdUpdate = PH
    r.timeUpdate = PH
    r.name = name
    r._isNew = true
    return { ...r, ...o }
}


describe('unit-procCore-nameUniq (後台整表寫入之群組／權限名稱唯一, F-02, R-NAME-UNIQ-02)', function() {

    let env = null

    function createEnv(table, legacy) {
        let seed = seedRows(table, legacy)
        let woItems = { [table]: mkTable(seed) }
        for (let t of ['users', 'targets', 'grups', 'pemis']) {
            if (!woItems[t]) {
                woItems[t] = mkTable([])
            }
        }
        let { srLog, logs } = mkSrLog()
        let cst = cacheSt()
        let core = mkCore(ds, woItems) //perm-run01: 原 mkProcOrm(ds, woItems)＋kmx: pmKeyMutex() 改 mkCore(真 WServOrm 之 procOrm／withTabLocks／guardWrite)
        let pc = proc(woItems, core.procOrm, { srLog, ...core.lock, lockSave: createLockSave(cst) })
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

    //writes: 該表之破壞性寫入次數(被拒須為 0)
    let writes = (t) => t.cnt.insert + t.cnt.save + t.cnt.del + t.cnt.delAll

    //rowsOf: 以送入形狀取回庫內現況(依 order), 供「改一列」之基底
    let rowsOf = async (woItems, table) => (await woItems[table].select()).sort((a, b) => a.order - b.order).map((v) => cloneDeep(v))

    //byId
    let byId = (woItems, table, id) => woItems[table].get(id)


    for (let table of Object.keys(TABLES)) {

        // ===== P1／P5: 一般庫(無歷史重複)之撞名拒收, 零寫入 =====

        it(`NU-001 ${table}: 新增列之 name 與既有列相同 → nameDuplicate, 資料表零變更(零寫入)`, async function() {
            let { woItems, pc } = createEnv(table, false)
            let before = woItems[table].snapshot()
            let rows = [...(await rowsOf(woItems, table)), newRow(table, 'X2')]
            let r = await run(pc, table, rows)
            assert.strict.deepEqual(r, { ok: false, v: 'nameDuplicate' }) //P1
            assert.strict.equal(woItems[table].snapshot(), before, '資料表須零變更')
            assert.strict.equal(writes(woItems[table]), 0, '被拒時不得有任何 insert／save／del')
        })

        it(`NU-002 ${table}: 既有列改名為另一既有列之 name → nameDuplicate, 資料表零變更`, async function() {
            let { woItems, pc } = createEnv(table, false)
            let before = woItems[table].snapshot()
            let rows = await rowsOf(woItems, table)
            rows[2].name = 'X1' //X3 改名為 X1
            let r = await run(pc, table, rows)
            assert.strict.deepEqual(r, { ok: false, v: 'nameDuplicate' }) //P1
            assert.strict.equal(woItems[table].snapshot(), before)
            assert.strict.equal(writes(woItems[table]), 0)
        })

        it(`NU-003 ${table}: 比對為精確 ===: 僅大小寫或前後空白不同之名稱視為不同, 可存`, async function() {
            let { woItems, pc } = createEnv(table, false)
            let rows = [...(await rowsOf(woItems, table)), newRow(table, 'x1'), newRow(table, 'X1 '), newRow(table, ' X1')]
            let r = await run(pc, table, rows)
            assert.strict.deepEqual(r, { ok: true, v: 'saveTabItemsSuccess' }) //P5
            assert.strict.equal(woItems[table].size(), 6)
        })

        it(`NU-004 ${table}: 空字串／非字串名稱仍回 saveRowFieldInvalid(非 nameDuplicate), 零寫入`, async function() {
            for (let bad of ['', 5, null, undefined]) {
                let { woItems, pc, cst } = createEnv(table, false)
                let before = woItems[table].snapshot()
                let rows = [...(await rowsOf(woItems, table)), newRow(table, bad)]
                let r = await run(pc, table, rows)
                assert.strict.deepEqual(r, { ok: false, v: 'saveRowFieldInvalid' }, `name=${JSON.stringify(bad)}`) //P5
                assert.strict.equal(woItems[table].snapshot(), before)
                cst.clear()
            }
        })

        it(`NU-005 ${table}: 拒收時記後端 log: event=updateTabItems-ckKey-error、msg=nameDuplicate(錯誤鍵)`, async function() {
            let { woItems, pc, logs } = createEnv(table, false)
            let rows = [...(await rowsOf(woItems, table)), newRow(table, 'X2')]
            await run(pc, table, rows)
            let lg = logs.find((l) => l.event === 'updateTabItems-ckKey-error')
            assert.strict.ok(lg, `應有 updateTabItems-ckKey-error, 實得 ${JSON.stringify(logs)}`)
            assert.strict.equal(lg.msg, 'nameDuplicate')
            assert.strict.equal(lg.keyTable, table)
        })


        // ===== P2／P3: 歷史重複存在 =====

        it(`NU-010 ${table}: 歷史重複存在, 重複列原樣送回並改別列(含重複列之說明)→ 可存, 兩個同名列皆仍在且編修生效`, async function() {
            let { woItems, pc } = createEnv(table, true)
            let rows = await rowsOf(woItems, table)
            rows[0].description = 'd1-edited' //重複中之一列, name 不變
            rows[2].description = 'd3-edited' //無關列
            let r = await run(pc, table, rows)
            assert.strict.deepEqual(r, { ok: true, v: 'saveTabItemsSuccess' }) //P2、P3
            assert.strict.equal(woItems[table].size(), 3, '三列皆在(不得因同名被併成一列)')
            assert.strict.equal(byId(woItems, table, 'id-1').name, 'X1')
            assert.strict.equal(byId(woItems, table, 'id-2').name, 'X1', '歷史重複之另一列不得被刪')
            assert.strict.equal(byId(woItems, table, 'id-1').description, 'd1-edited', '重複中之一列之編修須落地')
            assert.strict.equal(byId(woItems, table, 'id-3').description, 'd3-edited')
            assert.strict.equal(byId(woItems, table, 'id-2').from, 'appX', '外部同步列之 from 不變')
        })

        it(`NU-011 ${table}: 歷史重複存在, 重複中「先出現之一列」改為不重複之名稱 → 可存且改名確實落地(修前: 靜默遺失仍回成功)`, async function() {
            let { woItems, pc } = createEnv(table, true)
            let rows = await rowsOf(woItems, table)
            rows[0].name = 'X1-renamed' //id-1
            let r = await run(pc, table, rows)
            assert.strict.deepEqual(r, { ok: true, v: 'saveTabItemsSuccess' })
            assert.strict.equal(woItems[table].size(), 3)
            assert.strict.equal(byId(woItems, table, 'id-1').name, 'X1-renamed', '改名須落地(修前以 name 對應之差異把 id-1 與 id-2 併為一列, 新名稱走 add 而 id-1 已存在被 insert 略過)') //P3
            assert.strict.equal(byId(woItems, table, 'id-2').name, 'X1')
            assert.strict.equal(byId(woItems, table, 'id-3').name, 'X3')
        })

        it(`NU-012 ${table}: 歷史重複存在, 重複中「後出現之一列」改為不重複之名稱 → 可存且改名落地`, async function() {
            let { woItems, pc } = createEnv(table, 'backend')
            let rows = await rowsOf(woItems, table)
            rows[1].name = 'X1-other' //id-2
            let r = await run(pc, table, rows)
            assert.strict.deepEqual(r, { ok: true, v: 'saveTabItemsSuccess' })
            assert.strict.equal(woItems[table].size(), 3)
            assert.strict.equal(byId(woItems, table, 'id-1').name, 'X1')
            assert.strict.equal(byId(woItems, table, 'id-2').name, 'X1-other')
        })

        it(`NU-013 ${table}: 歷史重複存在, 刪除重複中之一列 → 可存, 另一列仍在; 兩列皆改名亦可存`, async function() {
            let { woItems, pc } = createEnv(table, 'backend')
            let rows = await rowsOf(woItems, table)
            let r = await run(pc, table, rows.filter((v) => v.id !== 'id-2'))
            assert.strict.deepEqual(r, { ok: true, v: 'saveTabItemsSuccess' })
            assert.strict.equal(woItems[table].has('id-2'), false)
            assert.strict.equal(byId(woItems, table, 'id-1').name, 'X1')
            //兩列皆改名(新環境; 第一個環境之占位計時器須先清, 否則 mocha 不結束)
            env.cst.clear()
            let e2 = createEnv(table, 'backend')
            let rows2 = await rowsOf(e2.woItems, table)
            rows2[0].name = 'A'
            rows2[1].name = 'B'
            let r2 = await run(e2.pc, table, rows2)
            assert.strict.deepEqual(r2, { ok: true, v: 'saveTabItemsSuccess' })
            assert.strict.deepEqual([byId(e2.woItems, table, 'id-1').name, byId(e2.woItems, table, 'id-2').name], ['A', 'B'])
        })

        it(`NU-014 ${table}: 歷史重複存在, order 依送入位置重給(含重複列), 重複列之順序變更可存`, async function() {
            let { woItems, pc } = createEnv(table, true)
            let rows = await rowsOf(woItems, table)
            let r = await run(pc, table, [rows[2], rows[1], rows[0]]) //反序
            assert.strict.deepEqual(r, { ok: true, v: 'saveTabItemsSuccess' })
            assert.strict.deepEqual(['id-3', 'id-2', 'id-1'].map((id) => byId(woItems, table, id).order), [1, 2, 3])
            assert.strict.equal(woItems[table].size(), 3)
        })


        // ===== P4: 歷史重複存在, 本次造成或觸及者仍拒 =====

        it(`NU-020 ${table}: 歷史重複存在, 再新增第三個同名列 → nameDuplicate, 零寫入(且不先被 saveNewRowExists 等他檢查蓋過)`, async function() {
            let { woItems, pc } = createEnv(table, true)
            let before = woItems[table].snapshot()
            let rows = [...(await rowsOf(woItems, table)), newRow(table, 'X1')]
            let r = await run(pc, table, rows)
            assert.strict.deepEqual(r, { ok: false, v: 'nameDuplicate' }) //P4
            assert.strict.equal(woItems[table].snapshot(), before)
            assert.strict.equal(writes(woItems[table]), 0)
        })

        it(`NU-021 ${table}: 歷史重複存在, 無關列改名為該重複名稱 → nameDuplicate(併入重複組=觸及), 零寫入`, async function() {
            let { woItems, pc } = createEnv(table, true)
            let before = woItems[table].snapshot()
            let rows = await rowsOf(woItems, table)
            rows[2].name = 'X1' //id-3 改名併入
            let r = await run(pc, table, rows)
            assert.strict.deepEqual(r, { ok: false, v: 'nameDuplicate' }) //P4
            assert.strict.equal(woItems[table].snapshot(), before)
            assert.strict.equal(writes(woItems[table]), 0)
        })

        it(`NU-022 ${table}: 歷史重複存在, 重複中之一列改為已被他列使用之名稱(X3) → nameDuplicate, 零寫入`, async function() {
            let { woItems, pc } = createEnv(table, true)
            let before = woItems[table].snapshot()
            let rows = await rowsOf(woItems, table)
            rows[0].name = 'X3' //id-1 改成與 id-3 同名; id-2 仍為 X1
            let r = await run(pc, table, rows)
            assert.strict.deepEqual(r, { ok: false, v: 'nameDuplicate' }) //P4
            assert.strict.equal(woItems[table].snapshot(), before)
            assert.strict.equal(writes(woItems[table]), 0)
        })

        it(`NU-023 ${table}: 歷史重複存在, 以「既有 id 但名稱換成重複名稱」造出第三個同名列(另刪一個無關列使筆數相等) → nameDuplicate`, async function() {
            let { woItems, pc } = createEnv(table, true)
            let before = woItems[table].snapshot()
            let rows = await rowsOf(woItems, table)
            let extra = { ...rows[2], id: 'id-4', name: 'X1' } //id-4 為新 id
            rows[2] = extra //以新 id 取代 id-3(刪 id-3、新增 id-4 名 X1), 筆數仍 3
            let r = await run(pc, table, rows)
            assert.strict.deepEqual(r, { ok: false, v: 'nameDuplicate' }) //P4: X1 於送入出現 3 次 > 庫內 2 次
            assert.strict.equal(woItems[table].snapshot(), before)
        })

        it(`NU-024 ${table}: 歷史重複存在, 缺 id 之送入列視為新增(無法對應既有列): 名稱唯一者可存, 名稱撞重複組者 nameDuplicate`, async function() {
            let e1 = createEnv(table, true)
            let rows = await rowsOf(e1.woItems, table)
            let noId = { name: 'N-noid', order: 9, from: '' }
            noId[TABLES[table].col] = '{}'
            let r1 = await run(e1.pc, table, [...rows, noId])
            assert.strict.deepEqual(r1, { ok: true, v: 'saveTabItemsSuccess' })
            assert.strict.equal(e1.woItems[table].size(), 4)
            assert.strict.ok((await e1.woItems[table].select()).some((v) => v.name === 'N-noid'))
            e1.cst.clear()
            let e2 = createEnv(table, true)
            let before = e2.woItems[table].snapshot()
            let rows2 = await rowsOf(e2.woItems, table)
            let noId2 = { name: 'X1', order: 9, from: '' }
            noId2[TABLES[table].col] = '{}'
            let r2 = await run(e2.pc, table, [...rows2, noId2])
            assert.strict.deepEqual(r2, { ok: false, v: 'nameDuplicate' })
            assert.strict.equal(e2.woItems[table].snapshot(), before)
        })

        // ===== P6(run04 主責補強, ADR-034 Update): 寫入後之名稱集合 = 送入之整表(pemis／grups 恆以 id 對應既有列)=====
        //D1 設計稿 §1.5 以真 procCore 實測: 修前(name 鍵之 diff, 僅庫內已有同名時改 id 鍵)下列三種單次存檔回成功卻使庫內與送入不同、留下同名兩列

        it(`NU-040 ${table}: 改名 X1→X1-new 並以舊名 X1 新增另一列(新 id) → 可存; 庫內 id-1 為 X1-new 且新列為 X1, 名稱唯一(修前: 改名靜默遺失、同名兩列)`, async function() {
            let { woItems, pc } = createEnv(table, false)
            let rows = await rowsOf(woItems, table)
            rows[0].name = 'X1-new'
            let nr = newRow(table, 'X1')
            let r = await run(pc, table, [...rows, nr])
            assert.strict.deepEqual(r, { ok: true, v: 'saveTabItemsSuccess' })
            let all = await woItems[table].select()
            assert.strict.equal(all.length, 4)
            assert.strict.equal(byId(woItems, table, 'id-1').name, 'X1-new') //P6
            assert.strict.equal(byId(woItems, table, nr.id).name, 'X1')
            assert.strict.equal(new Set(all.map((v) => v.name)).size, 4, '名稱唯一')
        })

        it(`NU-041 ${table}: 刪除 X1(id-1)並以同名 X1 新增另一列(新 id; run02 F-02② 原案) → 可存; 舊列已刪、新列存在, 名稱唯一(修前: 舊列未刪、同名兩列)`, async function() {
            let { woItems, pc } = createEnv(table, false)
            let rows = (await rowsOf(woItems, table)).filter((v) => v.id !== 'id-1')
            let nr = newRow(table, 'X1')
            let r = await run(pc, table, [...rows, nr])
            assert.strict.deepEqual(r, { ok: true, v: 'saveTabItemsSuccess' })
            let all = await woItems[table].select()
            assert.strict.equal(all.length, 3)
            assert.strict.equal(byId(woItems, table, 'id-1'), undefined, '舊列須已刪除') //P6
            assert.strict.equal(byId(woItems, table, nr.id).name, 'X1')
            assert.strict.equal(new Set(all.map((v) => v.name)).size, 3, '名稱唯一')
        })

        it(`NU-042 ${table}: 鏈式改名 X1→X2 且 X2→X5(同一次存檔)與互換 X1↔X2 → 可存, 庫內各列名稱 = 送入(修前鏈式: id-2 停在 X2、同名兩列)`, async function() {
            let { woItems, pc } = createEnv(table, false)
            let rows = await rowsOf(woItems, table)
            rows[0].name = 'X2'
            rows[1].name = 'X5'
            let r = await run(pc, table, rows)
            assert.strict.deepEqual(r, { ok: true, v: 'saveTabItemsSuccess' })
            assert.strict.deepEqual([byId(woItems, table, 'id-1').name, byId(woItems, table, 'id-2').name, byId(woItems, table, 'id-3').name], ['X2', 'X5', 'X3']) //P6
            //互換(先清第一個環境之 cacheSt, 否則其計時器使 mocha 不退出)
            env.cst.clear()
            let e2 = createEnv(table, false)
            let rows2 = await rowsOf(e2.woItems, table)
            rows2[0].name = 'X2'
            rows2[1].name = 'X1'
            let r2 = await run(e2.pc, table, rows2)
            assert.strict.deepEqual(r2, { ok: true, v: 'saveTabItemsSuccess' })
            assert.strict.deepEqual([byId(e2.woItems, table, 'id-1').name, byId(e2.woItems, table, 'id-2').name], ['X2', 'X1'])
        })

        it(`NU-043 ${table}: 改名是 diff(save)而非 del + add: 建立者與建立時間沿用庫內, 僅更新者／更新時間改變`, async function() {
            let { woItems, pc } = createEnv(table, false)
            let rows = await rowsOf(woItems, table)
            rows[0].name = 'X1-renamed'
            let r = await run(pc, table, rows)
            assert.strict.deepEqual(r, { ok: true, v: 'saveTabItemsSuccess' })
            let row = byId(woItems, table, 'id-1')
            assert.strict.equal(row.name, 'X1-renamed')
            assert.strict.equal(row.userId, 'id-seed', '建立者沿用')
            assert.strict.equal(row.timeCreate, T0, '建立時間沿用')
            assert.strict.equal(woItems[table].cnt.del, 0, '改名不應走 del')
        })

        it(`NU-044 ${table}: 送入之整表內主鍵 id 重複(兩列同 id) → saveRowFieldDuplicate, 零寫入(以 id 對應時 Map 會靜默併成一列而遺失其一)`, async function() {
            let { woItems, pc } = createEnv(table, false)
            let before = woItems[table].snapshot()
            let rows = await rowsOf(woItems, table)
            let dup = { ...cloneDeep(rows[1]), name: 'X9' } //與 id-2 同 id, 名稱不同
            let r = await run(pc, table, [...rows, dup])
            assert.strict.deepEqual(r, { ok: false, v: 'saveRowFieldDuplicate' })
            assert.strict.equal(woItems[table].snapshot(), before)
            assert.strict.equal(writes(woItems[table]), 0)
        })

        it(`NU-046 ${table}: 一次新增兩列、皆未給主鍵(id 為空字串, 待自動產號)→ 可存, 各得不同之產生 id(外審 sol R6: 空字串 id 不得被當作重複主鍵)`, async function() {
            let { woItems, pc } = createEnv(table, false)
            let rows = await rowsOf(woItems, table)
            let mk = (name) => ({ id: '', order: 9, name, [TABLES[table].col]: '{}', from: '', description: '' })
            let r = await run(pc, table, [...rows, mk('N1'), mk('N2')])
            assert.strict.deepEqual(r, { ok: true, v: 'saveTabItemsSuccess' })
            let all = await woItems[table].select()
            assert.strict.equal(all.length, 5)
            let ids = all.map((v) => v.id)
            assert.strict.equal(new Set(ids).size, 5, '各列主鍵不同')
            assert.strict.ok(ids.every((s) => typeof s === 'string' && s !== ''), '產生之主鍵為非空字串')
        })

        it(`NU-045 ${table}: 不變式(隨機 300 次單次存檔: 改名／刪除／新增任意組合): 成功 ⇒ 庫內 (id → name) 等於送入且名稱唯一; 失敗 ⇒ 庫內零變更且送入確有同名`, async function() {
            let seedR = 12345
            let rnd = () => {
                seedR = (seedR * 1664525 + 1013904223) >>> 0
                return seedR / 4294967296
            }
            let pool = ['X1', 'X2', 'X3', 'X4', 'X5', 'X6']
            for (let i = 0; i < 300; i++) {
                let { woItems, pc, cst } = createEnv(table, false)
                let before = woItems[table].snapshot()
                let rows = await rowsOf(woItems, table)
                //隨機: 每列 20% 刪除、60% 改為池中隨機名稱(含不變)、其餘不動; 0～2 個新增列取池中隨機名稱
                rows = rows.filter(() => rnd() > 0.2)
                rows.forEach((v) => {
                    if (rnd() < 0.6) {
                        v.name = pool[Math.floor(rnd() * pool.length)]
                    }
                })
                let nAdd = Math.floor(rnd() * 3)
                for (let k = 0; k < nAdd; k++) {
                    rows.push(newRow(table, pool[Math.floor(rnd() * pool.length)]))
                }
                let names = rows.map((v) => v.name)
                let hasDup = new Set(names).size !== names.length
                let want = new Map(rows.map((v) => [v.id, v.name]))
                let r = await run(pc, table, rows.map((v) => cloneDeep(v)))
                if (hasDup) {
                    assert.strict.deepEqual(r, { ok: false, v: 'nameDuplicate' }, `#${i} 送入有同名須拒收`)
                    assert.strict.equal(woItems[table].snapshot(), before, `#${i} 拒收須零變更`)
                }
                else {
                    assert.strict.deepEqual(r, { ok: true, v: 'saveTabItemsSuccess' }, `#${i} 送入名稱唯一須可存`)
                    let all = await woItems[table].select()
                    assert.strict.equal(all.length, rows.length, `#${i} 筆數`)
                    assert.strict.deepEqual(new Map(all.map((v) => [v.id, v.name])), want, `#${i} 庫內 (id → name) 須等於送入`)
                    assert.strict.equal(new Set(all.map((v) => v.name)).size, all.length, `#${i} 名稱唯一`)
                }
                cst.clear()
                env = null
            }
        })

    }


    // ===== P5: 其他表之去重鍵不變 =====
    //run05(R-PRINCIPLE-00 適用表 h): users 之 email 檢查改為「只擋本次造成或觸及」——下列「新增列撞既有 email」仍擋(saveRowFieldDuplicate 不變);
    //歷史既有之空值／重複原樣送回、對應鍵(mappingBy)為 email／name 時對 active 列之檢查, 見 unit-procCore-usersKey

    it('NU-030 users 以 email 去重、targets 以 id 去重之 saveRowFieldDuplicate 不變(本任務只動 grups／pemis 之 name)', async function() {
        let t0 = '2026-01-01T00:00:00.000+08:00'
        let audit = { userId: 'id-seed', timeCreate: t0, userIdUpdate: 'id-seed', timeUpdate: t0 }
        let users = [
            { ...ds.users.funNew(), ...audit, id: 'id-u1', order: 1, name: 'a', email: 'a@example.com', cgrups: '{}', isAdmin: 'n', isActive: 'y' },
            { ...ds.users.funNew(), ...audit, id: 'id-u2', order: 2, name: 'b', email: 'b@example.com', cgrups: '{}', isAdmin: 'n', isActive: 'y' },
        ]
        let targets = [
            { ...ds.targets.funNew(), ...audit, id: 'T1', order: 1, description: 'd' },
            { ...ds.targets.funNew(), ...audit, id: 'T2', order: 2, description: 'd' },
        ]
        let woItems = { users: mkTable(users), targets: mkTable(targets), grups: mkTable([]), pemis: mkTable([]) }
        let { srLog } = mkSrLog()
        let cst = cacheSt()
        let core = mkCore(ds, woItems) //perm-run01: 原 mkProcOrm＋kmx 改 mkCore
        let pc = proc(woItems, core.procOrm, { srLog, ...core.lock, lockSave: createLockSave(cst) })
        let dupU = [...(await woItems.users.select()), { ...users[0], id: 'id-u3', email: 'b@example.com' }]
        let r1 = await pc.updateUsers('id-admin', dupU).then(() => null, (e) => e)
        assert.strict.equal(r1, 'saveRowFieldDuplicate')
        let dupT = [...(await woItems.targets.select()), { ...targets[0], description: 'dup' }]
        let r2 = await pc.updateTargets('id-admin', dupT).then(() => null, (e) => e)
        assert.strict.equal(r2, 'saveRowFieldDuplicate')
        assert.strict.equal(woItems.users.cnt.insert + woItems.users.cnt.save + woItems.users.cnt.del, 0)
        assert.strict.equal(woItems.targets.cnt.insert + woItems.targets.cnt.save + woItems.targets.cnt.del, 0)
        cst.clear()
    })

})
