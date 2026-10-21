//清單頁(群組／權限／使用者)名稱與 email「擋存／歷史警告」判準(規則帳本 R-PRINCIPLE-00 g、h, R-NAME-UNIQ-02; run05 U2)
//
//述語(規格句):
//  GN-1 只擋「本次造成或觸及」之同名(新增列撞名、改名撞名、歷史組再加一列、他列併入、新增兩列同名); 庫內既有的歷史同名原樣存在 → 不擋(warnHist, 筆數為目前共用該名稱之列數);
//  GN-2 重複之判準與伺服端同一份(findTouchedDup): 對同樣輸入, 前端判「擋存(dup)」⇔ 伺服端(procCore.updateGrups／updatePemis)回 nameDuplicate; 前端判不擋 ⇔ 伺服端可存;
//  GN-3 群組／權限之空／非字串名稱一律擋存(badScope 'all'); 使用者之 name／email(badScope 'touched'): 新增或改成壞值者擋存, 基準內原樣就是壞值者不擋(warnHistBad);
//  GN-4 同一名稱不同時屬於擋存與歷史警告(以擋存者為準); 比對為精確 ===; 原型鍵名(constructor／__proto__)無誤判;
//  GN-5 getDelRefCount: 只以基準(已儲存)列之名稱計, 未儲存新增列刪除不影響他人; 僅 AND 引用且刪除後查無者計入;
//  GN-6 站點: 三個清單頁以 getNameErrs 取代舊的逐列 haskey 計重複; 新增之警告儲存格僅在有衝突時換成 flex 容器, 無衝突之分支維持原 DOM; 刪除確認走專案 DOM 模態(showCheckYesNo), 不用原生 confirm.
//
//跑法: npx mocha test/unit-getNameErrs.test.mjs --reporter list --timeout 30000
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import cloneDeep from 'lodash-es/cloneDeep.js'
import pmKeyMutex from 'wsemi/src/pmKeyMutex.mjs'
import cacheSt from 'wsemi/src/cacheSt.mjs'
import isEmail from 'wsemi/src/isEmail.mjs'
import ds from '../src/schema/index.mjs'
import proc from '../server/procCore.mjs'
import createLockSave from '../server/lockSave.mjs'
import { findTouchedDup } from '../server/keyCheck.mjs'
import { getUserRules } from '../src/plugins/mShare.mjs'
import { countAndRefs } from '../src/js/getAuthWarn.mjs'
import procLang from '../server/procLang.mjs'
import { getNameErrs, mapNameKp } from '../src/js/getNameErrs.mjs'
import { getDelRefCount, getDelConfirmText } from '../src/js/getDelRefCount.mjs'
import { mkTable, mkProcOrm, mkSrLog } from './tools/unitOrm.mjs'
import { sourceLines } from './tools/srcScan.mjs'


const projRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const PH = '{新增}'
const T0 = '2026-01-01T00:00:00.000+08:00'
const AUDIT = { userId: 'id-seed', timeCreate: T0, userIdUpdate: 'id-seed', timeUpdate: T0 }
const TABLES = {
    grups: { fn: 'updateGrups', col: 'cpemis' },
    pemis: { fn: 'updatePemis', col: 'crules' },
}

let nm = (...a) => a.map((name, k) => ({ id: `id-${k + 1}`, name }))
let keys = (o) => Object.keys(o).sort()


describe('unit-getNameErrs (清單頁名稱／email 擋存與歷史警告判準, R-PRINCIPLE-00 g／h)', function() {

    // ===== GN-1: 擋存(本次造成或觸及)與歷史警告 =====
    describe('GN-1 本次造成或觸及者擋存, 歷史同名不擋', function() {

        it('GN-001 無重複 → errBlock／warnHist 皆空(空陣列、單列、全相異)', function() {
            for (let rows of [[], nm('A'), nm('A', 'B', 'C')]) {
                let r = getNameErrs(rows, rows, 'name')
                assert.strict.deepEqual(keys(r.errBlock), [])
                assert.strict.deepEqual(keys(r.warnHist), [])
                assert.strict.deepEqual(keys(r.warnHistBad), [])
            }
        })

        it('GN-002 全新重複: 基準為空, 兩個新列同名 → dup(擋存)', function() {
            let r = getNameErrs(nm('A', 'A'), [], 'name')
            assert.strict.deepEqual({ ...r.errBlock }, { A: 'dup' })
            assert.strict.deepEqual(keys(r.warnHist), [])
        })

        it('GN-003 新增列撞既有名 → dup', function() {
            let old = nm('A', 'B')
            let r = getNameErrs([...old, { id: 'new-1', name: 'A', _isNew: true }], old, 'name')
            assert.strict.deepEqual({ ...r.errBlock }, { A: 'dup' })
        })

        it('GN-004 改名撞名 → dup(被撞與撞人者同一個名稱鍵)', function() {
            let old = nm('A', 'B', 'C')
            let rows = cloneDeep(old)
            rows[2].name = 'A'
            let r = getNameErrs(rows, old, 'name')
            assert.strict.deepEqual({ ...r.errBlock }, { A: 'dup' })
        })

        it('GN-005 歷史重複原樣 → 不擋存, warnHist 為共用筆數', function() {
            let old = nm('X', 'X', 'Y')
            let r = getNameErrs(cloneDeep(old), old, 'name')
            assert.strict.deepEqual(keys(r.errBlock), [])
            assert.strict.deepEqual({ ...r.warnHist }, { X: 2 })
        })

        it('GN-006 歷史重複(3 筆)中刪一列 → 仍為歷史(筆數隨目前列數為 2), 不擋', function() {
            let old = nm('X', 'X', 'X')
            let rows = cloneDeep(old).slice(0, 2)
            let r = getNameErrs(rows, old, 'name')
            assert.strict.deepEqual(keys(r.errBlock), [])
            assert.strict.deepEqual({ ...r.warnHist }, { X: 2 })
        })

        it('GN-007 歷史重複中一列改為不重複之名 → 兩者皆無警告', function() {
            let old = nm('X', 'X', 'Y')
            let rows = cloneDeep(old)
            rows[0].name = 'X2'
            let r = getNameErrs(rows, old, 'name')
            assert.strict.deepEqual(keys(r.errBlock), [])
            assert.strict.deepEqual(keys(r.warnHist), [])
        })

        it('GN-008 歷史重複再加第三列 → dup, 且不再列為歷史(以擋存者為準)', function() {
            let old = nm('X', 'X', 'Y')
            let rows = [...cloneDeep(old), { id: 'new-1', name: 'X', _isNew: true }]
            let r = getNameErrs(rows, old, 'name')
            assert.strict.deepEqual({ ...r.errBlock }, { X: 'dup' })
            assert.strict.deepEqual(keys(r.warnHist), [])
        })

        it('GN-009 歷史重複 + 他列改名併入 → dup; 歷史重複中一列改成已被他列使用之名 → dup', function() {
            let old = nm('X', 'X', 'Y')
            let rows = cloneDeep(old)
            rows[2].name = 'X' //Y → X
            assert.strict.deepEqual({ ...getNameErrs(rows, old, 'name').errBlock }, { X: 'dup' })
            let rows2 = cloneDeep(old)
            rows2[0].name = 'Y' //X(id-1) → Y(已被 id-3 使用)
            let r2 = getNameErrs(rows2, old, 'name')
            assert.strict.deepEqual({ ...r2.errBlock }, { Y: 'dup' })
            assert.strict.deepEqual(keys(r2.warnHist), [], 'X 只剩 id-2 一列, 已無重複')
        })

        it('GN-010 兩組並存: 一組歷史(不擋)、一組本次造成(擋)', function() {
            let old = nm('X', 'X', 'Y')
            let rows = [...cloneDeep(old), { id: 'new-1', name: 'N', _isNew: true }, { id: 'new-2', name: 'N', _isNew: true }]
            let r = getNameErrs(rows, old, 'name')
            assert.strict.deepEqual({ ...r.errBlock }, { N: 'dup' })
            assert.strict.deepEqual({ ...r.warnHist }, { X: 2 })
        })

        it('GN-011 新列缺 id 視為本次造成(歷史組再加一列)', function() {
            let old = nm('X', 'X')
            let r = getNameErrs([...cloneDeep(old), { name: 'X' }], old, 'name')
            assert.strict.deepEqual({ ...r.errBlock }, { X: 'dup' })
        })

        it('GN-012 精確 ===: 僅大小寫或前後空白不同不算重複', function() {
            let r = getNameErrs(nm('A', 'a', 'A ', ' A'), [], 'name')
            assert.strict.deepEqual(keys(r.errBlock), [])
            assert.strict.deepEqual(keys(r.warnHist), [])
        })

        it('GN-013 基準非陣列或 rowsNew 非陣列 → 不拋錯(視為空)', function() {
            for (let bad of [null, undefined, 5, 'x', {}]) {
                let r = getNameErrs(nm('A', 'A'), bad, 'name')
                assert.strict.deepEqual({ ...r.errBlock }, { A: 'dup' })
                let r2 = getNameErrs(bad, nm('A'), 'name')
                assert.strict.deepEqual(keys(r2.errBlock), [])
            }
        })
    })


    // ===== GN-2: 與伺服端 findTouchedDup／nameDuplicate 一致 =====
    describe('GN-2 前端判擋存 ⇔ 伺服端回 nameDuplicate', function() {

        // 與 unit-procCore-nameUniq 同一組裝: 真 procCore + 表替身
        let seedRows = (table, legacy) => {
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
                mk({ id: 'id-2', order: 2, name: 'X1', from: 'appX', description: 'd2' }),
                mk({ id: 'id-3', order: 3, name: 'X3', from: '', description: 'd3' }),
            ]
        }
        let newRow = (table, name) => {
            let r = ds[table].funNew()
            r.userId = PH
            r.timeCreate = PH
            r.userIdUpdate = PH
            r.timeUpdate = PH
            r.name = name
            r._isNew = true
            return r
        }

        // 修改輔助: 依索引改 name／description, 回傳整表
        let ren = (rows, o) => {
            for (let [k, v] of Object.entries(o)) {
                rows[Number(k)].name = v
            }
            return rows
        }
        let desc = (rows, o) => {
            for (let [k, v] of Object.entries(o)) {
                rows[Number(k)].description = v
            }
            return rows
        }

        // [名稱, legacy, 對基準列(依序 id-1..3)的修改函數(rows, table) → 送入整表, 預期是否為「本次造成或觸及之重複」]
        let scenarios = [
            ['無歷史重複 原樣', false, (rows) => rows, false],
            ['無歷史重複 新增撞既有名', false, (rows, t) => [...rows, newRow(t, 'X2')], true],
            ['無歷史重複 改名撞名', false, (rows) => ren(rows, { 2: 'X1' }), true],
            ['無歷史重複 新增兩列同名', false, (rows, t) => [...rows, newRow(t, 'N'), newRow(t, 'N')], true],
            ['無歷史重複 僅大小寫不同', false, (rows, t) => [...rows, newRow(t, 'x1')], false],
            ['無歷史重複 僅改說明', false, (rows) => desc(rows, { 0: 'e' }), false],
            ['歷史重複 原樣', true, (rows) => rows, false],
            ['歷史重複 改說明與無關列', true, (rows) => desc(rows, { 0: 'e1', 2: 'e3' }), false],
            ['歷史重複 先出現列改名', true, (rows) => ren(rows, { 0: 'X1-r' }), false],
            ['歷史重複 後出現列改名', true, (rows) => ren(rows, { 1: 'X1-o' }), false],
            ['歷史重複 刪其中一列', true, (rows) => rows.filter((v) => v.id !== 'id-2'), false],
            ['歷史重複 兩列皆改名', true, (rows) => ren(rows, { 0: 'A', 1: 'B' }), false],
            ['歷史重複 反序', true, (rows) => [rows[2], rows[1], rows[0]], false],
            ['歷史重複 加第三個同名列', true, (rows, t) => [...rows, newRow(t, 'X1')], true],
            ['歷史重複 無關列改名併入', true, (rows) => ren(rows, { 2: 'X1' }), true],
            ['歷史重複 重複中一列改成他列之名', true, (rows) => ren(rows, { 0: 'X3' }), true],
            ['歷史重複 以新 id 同名列取代其中一列', true, (rows, t) => [rows[0], rows[2], newRow(t, 'X1')], true],
            ['歷史重複 另新增兩列同名', true, (rows, t) => [...rows, newRow(t, 'Z'), newRow(t, 'Z')], true],
            ['歷史重複 末尾空白改名', true, (rows) => ren(rows, { 0: 'X1 ' }), false],
        ]

        for (let table of Object.keys(TABLES)) {
            for (let [title, legacy, mut, expectBlock] of scenarios) {
                it(`GN-PAR ${table} ${title} → 前端${expectBlock ? '擋' : '不擋'}、伺服端${expectBlock ? 'nameDuplicate' : '可存'}`, async function() {
                    let seed = seedRows(table, legacy)
                    let seedOld = cloneDeep(seed) //前端之基準(store 原始列); 與表替身脫鉤, 伺服端寫入後不致被改動
                    let woItems = { [table]: mkTable(seed) }
                    for (let t of ['users', 'targets', 'grups', 'pemis']) {
                        if (!woItems[t]) {
                            woItems[t] = mkTable([])
                        }
                    }
                    let { srLog } = mkSrLog()
                    let cst = cacheSt()
                    let pc = proc(woItems, mkProcOrm(ds, woItems), { srLog, kmx: pmKeyMutex(), lockSave: createLockSave(cst) })
                    try {
                        //送入整表: 以基準列為底(依 order), 套用修改
                        let base = (await woItems[table].select()).sort((a, b) => a.order - b.order).map((v) => cloneDeep(v))
                        let rows = mut(base, table)

                        //前端: rowsOld ＝ 基準(store 之原始列)
                        let fe = getNameErrs(cloneDeep(rows), seedOld, 'name')
                        let feBlock = Object.values(fe.errBlock).includes('dup')

                        //伺服端
                        let ret = null
                        try {
                            ret = { ok: true, v: await pc[TABLES[table].fn]('id-admin', cloneDeep(rows)) }
                        }
                        catch (err) {
                            ret = { ok: false, v: err }
                        }
                        let svBlock = ret.ok === false && ret.v === 'nameDuplicate'
                        if (!svBlock) {
                            assert.strict.deepEqual(ret, { ok: true, v: 'saveTabItemsSuccess' }, '伺服端若不回 nameDuplicate 則須可存')
                        }

                        //一致
                        assert.strict.equal(feBlock, svBlock, `前端擋存(${feBlock}) 須等於 伺服端 nameDuplicate(${svBlock})`)
                        assert.strict.equal(feBlock, expectBlock, '預期')

                        //同一個判準函數: 對整表直接呼叫 findTouchedDup 亦同
                        assert.strict.equal(findTouchedDup(cloneDeep(rows), seedOld, 'name') >= 0, feBlock)
                    }
                    finally {
                        cst.clear()
                    }
                })
            }
        }
    })


    // ===== GN-2b: 有限數字 id 之正規化(同伺服端 procCore 於 findTouchedDup 之前轉 String(id)) =====
    describe('GN-2b 數字 id 正規化', function() {

        let mkEnv = (table, seedList) => {
            let seed = seedList
            let woItems = { [table]: mkTable(seed) }
            for (let t of ['users', 'targets', 'grups', 'pemis']) {
                if (!woItems[t]) {
                    woItems[t] = mkTable([])
                }
            }
            let { srLog } = mkSrLog()
            let cst = cacheSt()
            let pc = proc(woItems, mkProcOrm(ds, woItems), { srLog, kmx: pmKeyMutex(), lockSave: createLockSave(cst) })
            return { pc, cst }
        }

        for (let table of Object.keys(TABLES)) {
            it(`GN-050 ${table}: 庫內字串 id '1','2' 同名 A(歷史重複), 送入數字 id 1,2 → 前端不擋(歷史)、伺服端可存`, async function() {
                let col = TABLES[table].col
                let mk = (o) => ({ ...ds[table].funNew(), ...AUDIT, [col]: '{}', ...o })
                let seed = [mk({ id: '1', order: 1, name: 'A' }), mk({ id: '2', order: 2, name: 'A' }), mk({ id: '3', order: 3, name: 'C' })]
                let seedOld = cloneDeep(seed)
                let { pc, cst } = mkEnv(table, seed)
                try {
                    let rows = seedOld.map((r) => ({ ...cloneDeep(r), id: Number(r.id) }))
                    let fe = getNameErrs(cloneDeep(rows), seedOld, 'name')
                    assert.strict.deepEqual(keys(fe.errBlock), [], '前端: 數字 id 與字串 id 視為同一列, 歷史同名不擋')
                    assert.strict.deepEqual({ ...fe.warnHist }, { A: 2 })
                    let ret = await pc[TABLES[table].fn]('id-admin', cloneDeep(rows))
                    assert.strict.equal(ret, 'saveTabItemsSuccess', '伺服端: 先轉字串 id, 歷史同名原樣可存')
                }
                finally {
                    cst.clear()
                }
            })

            it(`GN-051 ${table}: 數字 id 之歷史同名組再加第三列 → 前端擋(dup)、伺服端 nameDuplicate(兩端一致)`, async function() {
                let col = TABLES[table].col
                let mk = (o) => ({ ...ds[table].funNew(), ...AUDIT, [col]: '{}', ...o })
                let seed = [mk({ id: '1', order: 1, name: 'A' }), mk({ id: '2', order: 2, name: 'A' })]
                let seedOld = cloneDeep(seed)
                let { pc, cst } = mkEnv(table, seed)
                try {
                    let nr = ds[table].funNew()
                    nr.userId = PH
                    nr.timeCreate = PH
                    nr.userIdUpdate = PH
                    nr.timeUpdate = PH
                    nr.name = 'A'
                    nr._isNew = true
                    let rows = [...seedOld.map((r) => ({ ...cloneDeep(r), id: Number(r.id) })), nr]
                    let fe = getNameErrs(cloneDeep(rows), seedOld, 'name')
                    assert.strict.deepEqual({ ...fe.errBlock }, { A: 'dup' })
                    await assert.strict.rejects(pc[TABLES[table].fn]('id-admin', cloneDeep(rows)), (err) => err === 'nameDuplicate')
                }
                finally {
                    cst.clear()
                }
            })
        }

        it('GN-052 純函數: 基準與送入皆為數字 id、或一邊數字一邊字串, 判定相同; 非有限數字(NaN)與其他型別 id 不變', function() {
            let a = [{ id: 1, name: 'A' }, { id: 2, name: 'A' }]
            let r1 = getNameErrs(cloneDeep(a), cloneDeep(a), 'name')
            assert.strict.deepEqual({ ...r1.warnHist }, { A: 2 })
            let b = [{ id: '1', name: 'A' }, { id: '2', name: 'A' }]
            assert.strict.deepEqual({ ...getNameErrs(cloneDeep(a), b, 'name').warnHist }, { A: 2 })
            assert.strict.deepEqual({ ...getNameErrs(cloneDeep(b), a, 'name').warnHist }, { A: 2 })
            //NaN 不是有限數字: 不轉, 對不上基準之字串 id → 視為新列
            let c = [{ id: NaN, name: 'A' }, { id: '2', name: 'A' }]
            assert.strict.deepEqual({ ...getNameErrs(c, b, 'name').errBlock }, { A: 'dup' })
            //輸入的原列不被改動(正規化用複本)
            assert.strict.equal(a[0].id, 1)
        })
    })


    // ===== GN-3: 空／非字串名稱, 使用者 name／email =====
    describe('GN-3 空／非字串／格式不合', function() {

        it('GN-020 群組／權限(badScope all): 空字串、缺欄位、null、數字一律擋存, 鍵為儲存格值', function() {
            let old = nm('A')
            let rows = [...cloneDeep(old), { id: 'n1', name: '' }, { id: 'n2' }, { id: 'n3', name: null }, { id: 'n4', name: 5 }]
            let r = getNameErrs(rows, old, 'name')
            assert.strict.equal(r.errBlock[''], 'empty', `空字串與缺欄位(undefined)皆以空字串為鍵(同既有 get(v, 'name', ''))`)
            assert.strict.equal(r.errBlock['null'], 'empty')
            assert.strict.equal(r.errBlock['5'], 'empty')
            assert.strict.deepEqual(keys(r.warnHistBad), [])
        })

        it('GN-021 群組／權限(badScope all): 歷史就是空名稱仍擋存(伺服端 ckKey 對任一列之空名稱皆拒)', function() {
            let old = [{ id: 'a', name: '' }, { id: 'b', name: 'B' }]
            let r = getNameErrs(cloneDeep(old), old, 'name')
            assert.strict.equal(r.errBlock[''], 'empty')
            assert.strict.deepEqual(keys(r.warnHistBad), [])
        })

        it('GN-022 使用者 name(badScope touched): 歷史空名稱原樣 → 不擋、warnHistBad; 新增空名稱、改成空 → 擋存', function() {
            let old = [{ id: 'a', name: '' }, { id: 'b', name: 'B' }]
            let r = getNameErrs(cloneDeep(old), old, 'name', { badScope: 'touched' })
            assert.strict.deepEqual(keys(r.errBlock), [])
            assert.strict.deepEqual({ ...r.warnHistBad }, { '': 'empty' })
            let rows2 = [...cloneDeep(old), { id: 'c', name: '', _isNew: true }]
            assert.strict.deepEqual({ ...getNameErrs(rows2, old, 'name', { badScope: 'touched' }).errBlock }, { '': 'empty' }, '新增空名稱擋存, 且同鍵之歷史警告讓位')
            let rows3 = cloneDeep(old)
            rows3[1].name = ''
            assert.strict.deepEqual({ ...getNameErrs(rows3, old, 'name', { badScope: 'touched' }).errBlock }, { '': 'empty' })
        })

        it('GN-023 使用者 email: 歷史空值／歷史格式錯誤不擋(warnHistBad); 新增或改成壞值擋存(empty／invalid)', function() {
            let opt = { badScope: 'touched', isValid: isEmail }
            let old = [{ id: 'a', email: '' }, { id: 'b', email: 'not-mail' }, { id: 'c', email: 'c@x.com' }]
            let r = getNameErrs(cloneDeep(old), old, 'email', opt)
            assert.strict.deepEqual(keys(r.errBlock), [])
            assert.strict.deepEqual({ ...r.warnHistBad }, { '': 'empty', 'not-mail': 'invalid' })
            let rows = cloneDeep(old)
            rows[2].email = 'oops' //好值改成格式錯誤
            rows.push({ id: 'd', email: '', _isNew: true })
            let r2 = getNameErrs(rows, old, 'email', opt)
            assert.strict.deepEqual({ ...r2.errBlock }, { 'oops': 'invalid', '': 'empty' })
            assert.strict.deepEqual({ ...r2.warnHistBad }, { 'not-mail': 'invalid' })
        })

        it('GN-024 使用者 email: 格式錯誤者不計入重複(同舊行為); 好值重複照 findTouchedDup 分歷史／本次', function() {
            let opt = { badScope: 'touched', isValid: isEmail }
            let old = [{ id: 'a', email: 'bad' }, { id: 'b', email: 'bad' }, { id: 'c', email: 'u@x.com' }, { id: 'd', email: 'u@x.com' }]
            let r = getNameErrs(cloneDeep(old), old, 'email', opt)
            assert.strict.deepEqual(keys(r.errBlock), [])
            assert.strict.deepEqual({ ...r.warnHist }, { 'u@x.com': 2 })
            assert.strict.deepEqual({ ...r.warnHistBad }, { bad: 'invalid' })
            let rows = [...cloneDeep(old), { id: 'e', email: 'u@x.com', _isNew: true }]
            assert.strict.deepEqual({ ...getNameErrs(rows, old, 'email', opt).errBlock }, { 'u@x.com': 'dup' })
        })
    })


    // ===== GN-4: 互斥、原型鍵名、對照表 =====
    describe('GN-4 互斥與原型鍵名', function() {

        it('GN-030 原型鍵名(constructor／__proto__／toString)單列無誤判; 兩列新增才算重複; 結果物件無原型', function() {
            for (let n of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf']) {
                let r1 = getNameErrs(nm(n), [], 'name')
                assert.strict.equal(Object.keys(r1.errBlock).length, 0, n)
                assert.strict.equal(Object.getPrototypeOf(r1.errBlock), null)
                assert.strict.equal(Object.getPrototypeOf(r1.warnHist), null)
                assert.strict.equal(Object.getPrototypeOf(r1.warnHistBad), null)
                let r2 = getNameErrs(nm(n, n), [], 'name')
                assert.strict.equal(r2.errBlock[n], 'dup', n)
                let old = nm(n, n)
                let r3 = getNameErrs(cloneDeep(old), old, 'name')
                assert.strict.equal(r3.warnHist[n], 2, n)
            }
            assert.strict.equal(({}).polluted, undefined)
        })

        it('GN-031 mapNameKp: 逐項轉換為無原型物件; 空輸入為空物件', function() {
            let o = Object.create(null)
            o.A = 'dup'
            let kProto = '__proto__'
            o[kProto] = 'empty'
            let m = mapNameKp(o, (v, k) => `${k}:${v}`)
            assert.strict.equal(Object.getPrototypeOf(m), null)
            assert.strict.equal(m.A, 'A:dup')
            assert.strict.equal(m[kProto], '__proto__:empty')
            assert.strict.deepEqual(Object.keys(mapNameKp(null, () => 'x')), [])
        })

        it('GN-032 errBlock 與 warnHist／warnHistBad 互斥(同一個鍵只會在一處)', function() {
            let old = [{ id: 'a', email: '' }, { id: 'b', email: 'u@x.com' }, { id: 'c', email: 'u@x.com' }]
            let rows = [...cloneDeep(old), { id: 'd', email: '', _isNew: true }]
            let r = getNameErrs(rows, old, 'email', { badScope: 'touched', isValid: isEmail })
            for (let k of Object.keys(r.errBlock)) {
                assert.strict.ok(!(k in r.warnHist) && !(k in r.warnHistBad), k)
            }
            assert.strict.deepEqual({ ...r.errBlock }, { '': 'empty' })
            assert.strict.deepEqual({ ...r.warnHist }, { 'u@x.com': 2 })
        })
    })


    // ===== GN-5: 刪除影響人數 =====
    describe('GN-5 getDelRefCount', function() {

        let AND = (n) => JSON.stringify({ [n]: { mode: 'AND', isActive: 'y' } })
        let OR = (n) => JSON.stringify({ [n]: { mode: 'OR', isActive: 'y' } })
        let grupsBase = [{ id: 'g1', name: 'G1' }, { id: 'g2', name: 'G2' }]

        let N = (n, nWiden = 0) => ({ n, nWiden })

        it('GN-040 刪除被 AND 引用且刪後查無 → n 計入使用者數; OR 引用、停用引用、未引用者不計', function() {
            let users = [{ id: 'u1', cgrups: AND('G1') }, { id: 'u2', cgrups: AND('G1') }, { id: 'u3', cgrups: OR('G1') }, { id: 'u4', cgrups: JSON.stringify({ G1: { mode: 'AND', isActive: 'n' } }) }, { id: 'u5', cgrups: AND('G2') }]
            assert.strict.deepEqual(getDelRefCount(['g1'], grupsBase, users, 'cgrups', [grupsBase[1]]), N(2))
            assert.strict.deepEqual(getDelRefCount(['g1', 'g2'], grupsBase, users, 'cgrups', []), N(3))
        })

        it('GN-041 沒有影響 → 0／0(不彈框): 沒人引用、只引用未刪者', function() {
            let users = [{ id: 'u1', cgrups: AND('G2') }, { id: 'u2', cgrups: '' }, { id: 'u3', cgrups: '{}' }]
            assert.strict.deepEqual(getDelRefCount(['g1'], grupsBase, users, 'cgrups', [grupsBase[1]]), N(0))
            assert.strict.deepEqual(getDelRefCount([], grupsBase, users, 'cgrups', grupsBase), N(0))
        })

        it('GN-042 尚未儲存之新增列(id 不在基準)刪除不影響他人, 即使其名稱與某引用同名', function() {
            let users = [{ id: 'u1', cgrups: AND('NEW') }]
            assert.strict.deepEqual(getDelRefCount(['tmp-1'], grupsBase, users, 'cgrups', grupsBase), N(0))
        })

        it('GN-043 歷史同名只刪其一(刪後仍有同名列, 候選變少): n 不計(引用仍對到列), 但 nWiden 計入——授權確實變寬(以 getUserRules 實證); 任何 mode(OR／AND)、陣列形式皆計, 停用引用不計', function() {
            //G1 有兩筆同名候選: g1a 給 P1(A、B)、g1b 給 P2(僅 A) → 引用者取交集 = 只有 A
            let targets = [{ id: 'A' }, { id: 'B' }]
            let pemis = [{ id: 'p1', name: 'P1', crules: JSON.stringify({ A: 'y', B: 'y' }) }, { id: 'p2', name: 'P2', crules: JSON.stringify({ A: 'y' }) }]
            let g1a = { id: 'g1a', name: 'G1', cpemis: JSON.stringify({ P1: { mode: 'OR', isActive: 'y' } }) }
            let g1b = { id: 'g1b', name: 'G1', cpemis: JSON.stringify({ P2: { mode: 'OR', isActive: 'y' } }) }
            let base = [g1a, g1b]
            let uOr = { id: 'u1', cgrups: OR('G1') }
            let uAnd = { id: 'u2', cgrups: AND('G1') }
            let uArr = { id: 'u3', cgrups: JSON.stringify([{ name: 'G1', mode: 'OR', isActive: 'y' }]) }
            let uOff = { id: 'u4', cgrups: JSON.stringify({ G1: { mode: 'OR', isActive: 'n' } }) }
            let users = [uOr, uAnd, uArr, uOff]
            let ruleMap = (u, grups) => {
                let o = {}
                for (let r of getUserRules(u, grups, pemis, targets).rules) {
                    o[r.name] = r.isActive
                }
                return o
            }

            //刪前: 兩候選取交集 → 只有 A
            assert.strict.deepEqual(ruleMap(uOr, base), { A: 'y', B: 'n' })
            //刪較嚴之 g1b: 剩 g1a → B 變 y(授權變多)
            assert.strict.deepEqual(ruleMap(uOr, [g1a]), { A: 'y', B: 'y' })
            assert.strict.deepEqual(getDelRefCount(['g1b'], base, users, 'cgrups', [g1a]), N(0, 3), 'OR、AND、陣列形式各 1 位計入; 停用引用不計')
            //刪較寬之 g1a: 實際授權不變(仍 A), 但計數保守地提示(候選變少, 無從在不比對內容下排除)
            assert.strict.deepEqual(ruleMap(uOr, [g1b]), { A: 'y', B: 'n' })
            assert.strict.deepEqual(getDelRefCount(['g1a'], base, users, 'cgrups', [g1b]), N(0, 3))
            //兩筆都刪: 名稱完全消失 → AND 引用者計入 n(授權被收回), 不計 nWiden
            assert.strict.deepEqual(getDelRefCount(['g1a', 'g1b'], base, users, 'cgrups', []), N(1, 0))
        })

        it('GN-043b 歷史同名三筆刪一 → nWiden; 刪後被另一未儲存列同名取代(候選數不變)→ 不計; 只有一筆的名稱刪除不計 nWiden', function() {
            let base = [{ id: 'a', name: 'G1' }, { id: 'b', name: 'G1' }, { id: 'c', name: 'G1' }, { id: 'd', name: 'G2' }]
            let users = [{ id: 'u1', cgrups: OR('G1') }, { id: 'u2', cgrups: OR('G2') }]
            assert.strict.deepEqual(getDelRefCount(['a'], base, users, 'cgrups', base.slice(1)), N(0, 1))
            //刪 a 與 b、剩 c: 3 → 1 仍變少
            assert.strict.deepEqual(getDelRefCount(['a', 'b'], base, users, 'cgrups', base.slice(2)), N(0, 1))
            //刪 a、新增未儲存列 G1(候選數 3 → 3): 不變寬
            assert.strict.deepEqual(getDelRefCount(['a'], base, users, 'cgrups', [base[1], base[2], base[3], { id: 'tmp', name: 'G1' }]), N(0, 0))
            //G2 只有 1 筆: 刪除即完全消失, OR 引用不計 n、不計 nWiden
            assert.strict.deepEqual(getDelRefCount(['d'], base, users, 'cgrups', base.slice(0, 3)), N(0, 0))
        })

        it('GN-043c 刪除其中一筆歷史同名並將另一筆改名(刪後該名稱消失)→ 走 n(AND)而非 nWiden', function() {
            let base = [{ id: 'a', name: 'G1' }, { id: 'b', name: 'G1' }]
            let users = [{ id: 'u1', cgrups: AND('G1') }, { id: 'u2', cgrups: OR('G1') }]
            //刪 a, b 尚未儲存地改名為 G1x: 剩餘列中已無 G1
            assert.strict.deepEqual(getDelRefCount(['a'], base, users, 'cgrups', [{ id: 'b', name: 'G1x' }]), N(1, 0))
        })

        it('GN-044 權限頁: 群組以 AND 引用被刪權限(cpemis); 陣列形式引用、mode 缺漏(視為 AND)亦計', function() {
            let pemisBase = [{ id: 'p1', name: 'P1' }]
            let grups = [
                { id: 'g1', cpemis: AND('P1') },
                { id: 'g2', cpemis: JSON.stringify([{ name: 'P1', mode: 'AND', isActive: 'y' }]) },
                { id: 'g3', cpemis: JSON.stringify({ P1: { isActive: 'y' } }) }, //mode 缺: 視為 AND
                { id: 'g4', cpemis: OR('P1') },
            ]
            assert.strict.deepEqual(getDelRefCount(['p1'], pemisBase, grups, 'cpemis', []), N(3))
        })

        it('GN-045 輸入形狀防呆: delIds／基準／引用者非陣列 → 0／0(不拋錯)', function() {
            assert.strict.deepEqual(getDelRefCount(null, grupsBase, [], 'cgrups', []), N(0))
            assert.strict.deepEqual(getDelRefCount(['g1'], null, [], 'cgrups', []), N(0))
            assert.strict.deepEqual(getDelRefCount(['g1'], grupsBase, null, 'cgrups', []), N(0))
        })

        it('GN-046 countAndRefs 向下相容: 未給 rowsBefore → 回傳欄位 n／holders 同舊, nWiden 為 0; 給了才計 nWiden／holdersWiden', function() {
            let base = [{ id: 'a', name: 'G1' }, { id: 'b', name: 'G1' }]
            let users = [{ id: 'u1', cgrups: OR('G1') }, { id: 'u2', cgrups: AND('G1') }]
            let r0 = countAndRefs(users, 'cgrups', ['G1'], [base[1]])
            assert.strict.deepEqual([r0.n, r0.holders.length, r0.nWiden, r0.holdersWiden.length], [0, 0, 0, 0])
            let r1 = countAndRefs(users, 'cgrups', ['G1'], [base[1]], base)
            assert.strict.deepEqual([r1.n, r1.nWiden], [0, 2])
            assert.strict.deepEqual(r1.holdersWiden.map((h) => h.id), ['u1', 'u2'])
        })

        it('GN-047 getDelConfirmText: 只有 n → 既有 confirmDelAndRefs*; 只有 nWiden → confirmDelDupRefs*; 兩者皆有 → 同一框、同一問句(confirmDelBothRefs*, {n}、{m} 皆代入); 皆 0 → 空字串(不彈框); eng／cht 兩語系', function() {
            let LANG = procLang({})
            for (let lang of ['eng', 'cht']) {
                let $t = (k) => LANG[lang][k]
                for (let kind of ['Grup', 'Pemi']) {
                    assert.strict.equal(getDelConfirmText({ n: 0, nWiden: 0 }, $t, kind), '')
                    assert.strict.equal(getDelConfirmText(null, $t, kind), '')
                    assert.strict.equal(getDelConfirmText({ n: 3, nWiden: 0 }, $t, kind), $t(`confirmDelAndRefs${kind}`).split('{n}').join('3'))
                    let t2 = getDelConfirmText({ n: 0, nWiden: 4 }, $t, kind)
                    assert.strict.equal(t2, $t(`confirmDelDupRefs${kind}`).split('{n}').join('4'))
                    assert.strict.ok(t2.includes('4') && !t2.includes('{'), `${lang} ${kind} 只有 nWiden`)
                    let t3 = getDelConfirmText({ n: 3, nWiden: 4 }, $t, kind)
                    assert.strict.ok(t3.includes('3') && t3.includes('4') && !t3.includes('{'), `${lang} ${kind} 兩者皆有: 兩個數字皆代入`)
                    let nAsk = lang === 'cht' ? (t3.match(/確定刪除？/g) || []).length : (t3.match(/Delete anyway\?/g) || []).length
                    assert.strict.equal(nAsk, 1, `${lang} ${kind} 兩者皆有: 只有一個問句`)
                }
            }
        })
    })


    // ===== GN-6: 站點(靜態) =====
    describe('GN-6 站點不變式', function() {

        let read = (rel) => fs.readFileSync(path.join(projRoot, rel), 'utf8')
        let code = (rel) => sourceLines(path.join(projRoot, rel), 'code').map((l) => l.text).join('\n')
        let pages = ['LayoutContentGrups', 'LayoutContentPemis', 'LayoutContentUsers']

        it('SITE-GN-001 三個清單頁以 getNameErrs 判擋存, 不再逐列 haskey 計重複', function() {
            for (let fn of pages) {
                let c = code(`src/components/${fn}.vue`)
                assert.strict.ok(/import \{ getNameErrs, mapNameKp \} from '\.\.\/js\/getNameErrs\.mjs'/.test(c), `${fn} 應 import getNameErrs`)
                assert.strict.ok(/getNameErrs\(get\(vo, 'opt\.rows', \[\]\), vo\.(grups|pemis|users), 'name'/.test(c), `${fn} 應以 store 之原始列為基準呼叫 getNameErrs`)
                assert.strict.ok(!/\bhaskey\(kp(Name|Email)\b/.test(c), `${fn} 不應再有逐列 haskey(kpName／kpEmail) 計重複`)
                assert.strict.ok(/iseobj\(vo\.errItemsByName\)/.test(c), `${fn} isError 仍只由擋存者(errItemsByName)決定`)
                assert.strict.ok(!/iseobj\(vo\.warnItemsBy/.test(c), `${fn} 歷史警告不得使 isError 為真`)
            }
            let u = code('src/components/LayoutContentUsers.vue')
            assert.strict.ok(/getNameErrs\(get\(vo, 'opt\.rows', \[\]\), vo\.users, 'email', \{ badScope: 'touched', isValid: isEmail \}\)/.test(u), 'Users 之 email 應 badScope touched 並檢查 isEmail')
            assert.strict.ok(/iseobj\(vo\.errItemsByEmail\)/.test(u))
        })

        it('SITE-GN-002 名稱儲存格: 擋存者之分支維持原樣(橘色名稱＋圖示, title 為既有文字), 歷史警告為相鄰的 v-else-if 分支', function() {
            for (let fn of pages) {
                let t = read(`src/components/${fn}.vue`)
                assert.strict.ok(t.includes('<span v-if="errItemsByName[props.value]" :title="errItemsByName[props.value]">'), `${fn} 擋存分支`)
                assert.strict.ok(t.includes('<span v-else-if="warnItemsByName[props.value]" :title="warnItemsByName[props.value]">'), `${fn} 歷史警告分支`)
                assert.strict.ok(t.includes('<span v-else>{{ props.value }}</span>'), `${fn} 無衝突分支維持原樣`)
            }
        })

        it('SITE-GN-002b 新增之歷史警告分支: 圖示在值左側(子節點順序為 圖示、值); 擋存者既有分支圖示仍在右側(既有標準圖鎖定)', function() {
            let chk = (fn, head) => {
                let t = read(`src/components/${fn}.vue`)
                let i = t.indexOf(head)
                assert.strict.ok(i >= 0, `${fn} ${head}`)
                let seg = t.slice(i, t.indexOf('</span>', t.indexOf('</span>', i) + 1) + 7) //外層 span 到其收尾(內含一個值 span)
                let iImg = seg.indexOf('<img')
                let iVal = seg.indexOf('{{ props.value }}')
                return { iImg, iVal, seg }
            }
            for (let [fn, head, left] of [
                ['LayoutContentGrups', '<span v-else-if="warnItemsByName[props.value]"', true],
                ['LayoutContentPemis', '<span v-else-if="warnItemsByName[props.value]"', true],
                ['LayoutContentUsers', '<span v-else-if="warnItemsByName[props.value]"', true],
                ['LayoutContentUsers', '<span v-else-if="warnItemsByEmail[props.value]"', true],
                ['LayoutContentGrups', '<span v-if="errItemsByName[props.value]"', false],
                ['LayoutContentPemis', '<span v-if="errItemsByName[props.value]"', false],
                ['LayoutContentUsers', '<span v-if="errItemsByName[props.value]"', false],
                ['LayoutContentUsers', '<span v-if="errItemsByEmail[props.value]"', false],
            ]) {
                let { iImg, iVal, seg } = chk(fn, head)
                assert.strict.ok(iImg >= 0 && iVal >= 0, `${fn} ${head} 應含圖示與值`)
                assert.strict.equal(iImg < iVal, left, `${fn} ${head} 圖示應在值${left ? '左' : '右'}側`)
                if (left) {
                    assert.strict.ok(/margin-right:4px/.test(seg), `${fn} ${head} 圖示與值之間距`)
                }
                else {
                    assert.strict.ok(!/margin-right/.test(seg), `${fn} ${head} 既有擋存分支樣式不得變動`)
                }
            }
        })

        it('SITE-GN-003 授權欄儲存格: 有衝突才換成 flex 容器(圖示在按鈕左側, 按鈕 flex:1 1 auto; min-width:0), 無衝突分支與原 DOM 完全相同', function() {
            let cases = [['LayoutContentUsers', 'warnCgrupsById', 'showVeCgrupsById', 'getCgrupsText'], ['LayoutContentGrups', 'warnCpemisById', 'showVeCpemisById', 'getCpemisText'], ['LayoutContentPemis', 'warnCrulesById', 'showVeCrulesById', 'getCrulesText']]
            for (let [fn, map, open, text] of cases) {
                let t = read(`src/components/${fn}.vue`)
                let iWarn = t.indexOf(`<div v-if="${map}[props.row.id]" style="display:flex; align-items:center; gap:4px;" @click.stop.prevent @mousedown.stop.prevent>`)
                assert.strict.ok(iWarn >= 0, `${fn} 有衝突分支`)
                let iImg = t.indexOf(`:title="${map}[props.row.id]"`, iWarn)
                let iBtn = t.indexOf('<button style="flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"', iWarn)
                assert.strict.ok(iImg > iWarn && iBtn > iImg, `${fn} 圖示須在按鈕之前(左側)`)
                assert.strict.ok(t.includes(`@click="$dg.${open}(props.row.id)">{{ ${text}(props.value) }}</button>`))
                //無衝突分支: 與修改前逐字相同(僅多了 v-else)
                assert.strict.ok(t.includes(`<div v-else @click.stop.prevent @mousedown.stop.prevent>
                                <button style="width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" @click="$dg.${open}(props.row.id)">{{ ${text}(props.value) }}</button>
                            </div>`.replace(/\n/g, t.includes('\r\n') ? '\r\n' : '\n')), `${fn} 無衝突分支`)
            }
        })

        it('SITE-GN-004 刪除確認: 群組頁／權限頁經 getDelRefCount＋getDelConfirmText＋showCheckYesNo(單一框, 兩種影響併入同一框), 無影響時不彈框; 不用原生 confirm／alert', function() {
            for (let [fn, kind, arg] of [['LayoutContentGrups', 'Grup', `vo.grups, vo.users, 'cgrups'`], ['LayoutContentPemis', 'Pemi', `vo.pemis, vo.grups, 'cpemis'`]]) {
                let c = code(`src/components/${fn}.vue`)
                assert.strict.ok(c.includes(`let impact = getDelRefCount(delIds, ${arg}, getRowsRemain())`), `${fn} 影響人數`)
                assert.strict.ok(c.includes(`let confirmText = getDelConfirmText(impact, (k) => vo.$t(k), '${kind}')`), `${fn} 確認框文字`)
                assert.strict.ok(c.includes(`vo.$dg.showCheckYesNo(confirmText)`), `${fn} 確認框`)
                assert.strict.ok(/if \(confirmText === ''\) \{\s*doDelete\(\)\s*return\s*\}/.test(c), `${fn} 無影響時直接刪除`)
                assert.strict.equal((c.match(/showCheckYesNo\(/g) || []).length, 1, `${fn} 只能一個確認框`)
            }
            for (let fn of pages) {
                let c = code(`src/components/${fn}.vue`)
                assert.strict.ok(!/(^|[^\w.$])(window\.)?(confirm|alert|prompt)\(/m.test(c), `${fn} 不得用原生 confirm／alert／prompt`)
            }
        })

        it('SITE-GN-005 procLang: 使用者歷史警告 5 個與刪除確認(歷史同名)4 個語系鍵皆有 eng／cht; 含 {n}（Both 另含 {m}）者兩語系皆含', function() {
            let lang = fs.readFileSync(path.join(projRoot, 'server', 'procLang.mjs'), 'utf8')
            for (let k of ['confirmDelBothRefsGrup', 'confirmDelBothRefsPemi']) {
                let m = lang.match(new RegExp(`${k}: \\{\\s*eng: \`([^\`]+)\`,\\s*cht: \`([^\`]+)\`,`))
                assert.strict.ok(m && m[1].includes('{n}') && m[1].includes('{m}') && m[2].includes('{n}') && m[2].includes('{m}'), `${k} 兩語系皆須含 {n}、{m}`)
            }
            for (let [k, hasN] of [['confirmDelDupRefsGrup', true], ['confirmDelDupRefsPemi', true], ['warnUserNameHistDup', true], ['warnUserEmailHistDup', true], ['warnUserNameHistEmpty', false], ['warnUserEmailHistEmpty', false], ['warnUserEmailHistInvalid', false]]) {
                let re = new RegExp(`${k}: \\{\\s*eng: \`([^\`]+)\`,\\s*cht: \`([^\`]+)\`,`)
                let m = lang.match(re)
                assert.strict.ok(m, `${k} 須有 eng／cht`)
                if (hasN) {
                    assert.strict.ok(m[1].includes('{n}') && m[2].includes('{n}'), `${k} 兩語系皆須含 {n}`)
                }
            }
        })
    })

})
