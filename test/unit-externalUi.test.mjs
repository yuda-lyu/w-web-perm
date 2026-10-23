//清單頁(標的／權限／群組／使用者)之外部列前端輔助與接線(run07 UI1; F-23「以外部同步為主」; 規則帳本 R-PRINCIPLE-00 原則 3、5; R-EXT-OWN-01; src/js/externalUi.mjs)
//
//述語(規格句):
//  EU-1 外部列＝from 為非空字串者(externalRows.isExternalRow 單一擁有者); 橫幅只在「啟用保護且外部列數 > 0」才有外部列提示, 外部同步警示只取本表且 from 非空、n 為正者; 皆無則為空陣列(頁面不渲染任何節點);
//  EU-2 勾選刪除: 啟用保護時外部列被過濾並計數(提示後其餘照常), 未啟用保護時全部照舊; 全為外部列時無可刪之列;
//  EU-3 送出前外部列守門: 外部列之身分／結構欄(getLockFields)與 from 被改、或外部列消失(刪除／改 id)才違規, 指派欄／order／伺服器管理欄不算; 前端判違規 ⇔ 伺服端 checkExternalWrite 回 saveExternalRowChanged(同一組 diff);
//  EU-4 fmtVars 單趟代入, 值內之 {n}／{from}／$& 字樣原樣;
//  EU-5 站點: 四頁 from 欄不可編(kpCellEditable 無 from)、身分欄逐列唯讀以函數判定(僅啟用保護時)、複製重置 from、刪除過濾、橫幅與鎖頭以 v-for 渲染(無外部列時不留任何節點, 不改既有分支)、撞名提示改用 nameUsedByExternal.
//
//跑法: npx mocha test/unit-externalUi.test.mjs --reporter list --timeout 30000
import assert from 'assert'
import path from 'path'
import { fileURLToPath } from 'url'
import cloneDeep from 'lodash-es/cloneDeep.js'
import ltdtDiffByKey from 'wsemi/src/ltdtDiffByKey.mjs'
import ds from '../src/schema/index.mjs'
import procLang from '../server/procLang.mjs'
import { checkExternalWrite, dropServerOnlyDiff, restoreExternalOrder } from '../src/js/externalRows.mjs'
import { fmtVars, countExternalRows, getSyncWarnLines, getBannerLines, splitCheckedRows, getExternalEdits } from '../src/js/externalUi.mjs'
import { sourceLines } from './tools/srcScan.mjs'
import fs from 'fs'


const projRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const LANG = procLang({})

let ext = (id, from = 'teamA', o = {}) => ({ id, from, ...o })
let back = (id, o = {}) => ({ id, from: '', ...o })


describe('unit-externalUi (清單頁外部列前端輔助與接線, F-23 / R-EXT-OWN-01)', function() {

    // ===== EU-4: fmtVars =====
    describe('EU-4 fmtVars', function() {

        it('EU-401 基本代入、未給之佔位符保留、數字 0 與空字串亦代入、同一佔位符多次皆代入', function() {
            assert.strict.equal(fmtVars('{from}:{n}', { from: 'teamA', n: 3 }), 'teamA:3')
            assert.strict.equal(fmtVars('{a} {b}', { a: 1 }), '1 {b}')
            assert.strict.equal(fmtVars('{n}{n}', { n: 0 }), '00')
            assert.strict.equal(fmtVars('[{x}]', { x: '' }), '[]')
            assert.strict.equal(fmtVars('{from}/{from}', { from: 'A' }), 'A/A')
        })

        it('EU-402 單趟: 值內之佔位符字樣與 $&、$$、$` 原樣(不二次代入、不被當取代樣式)', function() {
            assert.strict.equal(fmtVars('{from}|{n}', { from: '{n}$&{from}', n: 7 }), '{n}$&{from}|7')
            assert.strict.equal(fmtVars('{name}', { name: '$$ $` $\'' }), '$$ $` $\'')
            assert.strict.equal(fmtVars('{n}:{from}', { n: '{from}', from: '{n}' }), '{from}:{n}')
        })

        it('EU-403 vars 非物件、範本非字串、原型鍵名之佔位符: 不拋錯且不取原型屬性', function() {
            assert.strict.equal(fmtVars('{n}', null), '{n}')
            assert.strict.equal(fmtVars('{n}', undefined), '{n}')
            assert.strict.equal(fmtVars('{n}', 5), '{n}')
            assert.strict.equal(fmtVars(5, { n: 1 }), '5')
            assert.strict.equal(fmtVars('{constructor}{toString}{__proto__}', {}), '{constructor}{toString}{__proto__}')
            assert.strict.equal(fmtVars('{constructor}', { constructor: 'X' }), 'X')
        })

        it('EU-404 procLang 新語系鍵之佔位符格式(eng／cht 皆含): externalRowLocked {from}; externalRowsNotice／externalRowsNoticeTarget {n}; syncWarnIdRenumber {from}{n}; externalRowDelBlocked {n}; nameUsedByExternal {name}{from}; 代入後無殘留', function() {
            let spec = { externalRowLocked: ['from'], externalRowsNotice: ['n'], externalRowsNoticeTarget: ['n'], syncWarnIdRenumber: ['from', 'n'], externalRowDelBlocked: ['n'], nameUsedByExternal: ['name', 'from'] }
            for (let [k, phs] of Object.entries(spec)) {
                for (let lang of ['eng', 'cht']) {
                    let t = LANG[lang][k]
                    assert.strict.ok(typeof t === 'string' && t.length > 0, `${lang} ${k}`)
                    for (let ph of phs) {
                        assert.strict.ok(t.includes(`{${ph}}`), `${lang} ${k} 須含 {${ph}}`)
                    }
                    let vars = { from: 'SRC', n: 9, name: 'NM' }
                    let out = fmtVars(t, vars)
                    assert.strict.ok(!/\{\w+\}/.test(out), `${lang} ${k} 代入後無殘留: ${out}`)
                }
            }
        })
    })


    // ===== EU-1: 計數與橫幅 =====
    describe('EU-1 外部列計數與橫幅各行', function() {

        it('EU-101 countExternalRows: 只計 from 為非空字串者; 非陣列為 0', function() {
            let rows = [ext('1'), back('2'), { id: '3' }, { id: '4', from: null }, { id: '5', from: 0 }, { id: '6', from: true }, { id: '7', from: {} }, ext('8', 'x'), null, 5]
            assert.strict.equal(countExternalRows(rows), 2)
            for (let bad of [undefined, null, 5, 'x', {}]) {
                assert.strict.equal(countExternalRows(bad), 0)
            }
        })

        it('EU-102 getSyncWarnLines: 只取本表(keyTable 相符)、from 非空字串、n 為正數者; 次序同輸入; 壞元素略過', function() {
            let sw = [
                { keyTable: 'grups', from: 'A', n: 2, time: 't' },
                { keyTable: 'pemis', from: 'B', n: 1, time: 't' },
                { keyTable: 'grups', from: '', n: 3 },
                { keyTable: 'grups', from: 'C', n: 0 },
                { keyTable: 'grups', from: 'D', n: '5' },
                { keyTable: 'grups', from: 5, n: 5 },
                { keyTable: 'grups', from: 'E', n: 4 },
                null, 5, 'x', [],
            ]
            assert.strict.deepEqual(getSyncWarnLines(sw, 'grups'), [{ from: 'A', n: 2 }, { from: 'E', n: 4 }])
            assert.strict.deepEqual(getSyncWarnLines(sw, 'pemis'), [{ from: 'B', n: 1 }])
            assert.strict.deepEqual(getSyncWarnLines(sw, 'users'), [])
            for (let bad of [undefined, null, 5, 'x', {}]) {
                assert.strict.deepEqual(getSyncWarnLines(bad, 'grups'), [])
            }
        })

        it('EU-103 getBannerLines: 啟用保護且有外部列 → 外部列提示(Target 用 externalRowsNoticeTarget, 其餘 externalRowsNotice, {n} 為外部列數); 未啟用／lock 非 true／無外部列 → 無提示', function() {
            let $t = (k) => k
            let rows = [ext('1'), ext('2'), back('3')]
            let r = getBannerLines({ keyTable: 'grups', kind: 'Grup', rows, lock: true, syncWarns: [], $t })
            assert.strict.deepEqual(r, [{ kind: 'ext', text: 'externalRowsNotice' }])
            let rT = getBannerLines({ keyTable: 'targets', kind: 'Target', rows, lock: true, syncWarns: [], $t })
            assert.strict.deepEqual(rT, [{ kind: 'ext', text: 'externalRowsNoticeTarget' }])
            for (let lock of [false, undefined, null, 'y', 1, 'true']) {
                assert.strict.deepEqual(getBannerLines({ keyTable: 'grups', kind: 'Grup', rows, lock, syncWarns: [], $t }), [], `lock=${lock}`)
            }
            assert.strict.deepEqual(getBannerLines({ keyTable: 'grups', kind: 'Grup', rows: [back('1')], lock: true, syncWarns: [], $t }), [])
            assert.strict.deepEqual(getBannerLines({ keyTable: 'grups', kind: 'Grup', rows: [], lock: true, syncWarns: [], $t }), [])
        })

        it('EU-104 getBannerLines 文字(eng／cht): {n} 為外部列數; 警示 {from}、{n}; 警示不受是否啟用保護影響; 次序為提示在前、警示在後(來源各一行)', function() {
            for (let lang of ['eng', 'cht']) {
                let $t = (k) => LANG[lang][k]
                let rows = [ext('1'), ext('2'), ext('3'), back('4')]
                let sw = [{ keyTable: 'grups', from: 'teamA', n: 2, time: 't' }, { keyTable: 'grups', from: 'teamB', n: 5, time: 't' }, { keyTable: 'pemis', from: 'zzz', n: 1, time: 't' }]
                let r = getBannerLines({ keyTable: 'grups', kind: 'Grup', rows, lock: true, syncWarns: sw, $t })
                assert.strict.deepEqual(r.map((v) => v.kind), ['ext', 'warn', 'warn'])
                assert.strict.equal(r[0].text, fmtVars(LANG[lang].externalRowsNotice, { n: 3 }))
                assert.strict.ok(r[0].text.includes('3'))
                assert.strict.equal(r[1].text, fmtVars(LANG[lang].syncWarnIdRenumber, { from: 'teamA', n: 2 }))
                assert.strict.ok(r[1].text.includes('teamA') && r[1].text.includes('2'))
                assert.strict.ok(r[2].text.includes('teamB') && r[2].text.includes('5') && !r[2].text.includes('zzz'))
                //未啟用保護: 仍有警示
                let r2 = getBannerLines({ keyTable: 'grups', kind: 'Grup', rows, lock: false, syncWarns: sw, $t })
                assert.strict.deepEqual(r2.map((v) => v.kind), ['warn', 'warn'])
            }
        })

        it('EU-105 無外部列且無警示 → 空陣列(頁面 v-for 不渲染任何節點, 畫面與 DOM 同未啟用前); 輸入不被改動', function() {
            let rows = [back('1'), back('2')]
            let snap = cloneDeep(rows)
            assert.strict.deepEqual(getBannerLines({ keyTable: 'grups', kind: 'Grup', rows, lock: true, syncWarns: undefined, $t: (k) => k }), [])
            assert.strict.deepEqual(rows, snap)
        })
    })


    // ===== EU-2: 勾選刪除過濾 =====
    describe('EU-2 splitCheckedRows', function() {

        let it1 = (row) => ({ data: row })

        it('EU-201 啟用保護: 外部列被過濾並計數, 其餘原序保留; 全為外部列時 rows 為空(無可刪)', function() {
            let items = [it1(back('1')), it1(ext('2')), it1(back('3')), it1(ext('4'))]
            let r = splitCheckedRows(items, true)
            assert.strict.deepEqual(r.rows.map((v) => v.data.id), ['1', '3'])
            assert.strict.equal(r.nBlocked, 2)
            let r2 = splitCheckedRows([it1(ext('1')), it1(ext('2'))], true)
            assert.strict.deepEqual([r2.rows.length, r2.nBlocked], [0, 2])
        })

        it('EU-202 未啟用保護(lock 非 true): 全部照舊, 不計擋下', function() {
            let items = [it1(back('1')), it1(ext('2'))]
            for (let lock of [false, undefined, null, 'y', 0]) {
                let r = splitCheckedRows(items, lock)
                assert.strict.equal(r.rows.length, 2)
                assert.strict.equal(r.nBlocked, 0)
            }
        })

        it('EU-203 無外部列時 rows 內容同輸入; 缺 data、非物件、非陣列輸入不拋錯(缺 data 者視為後台列照留)', function() {
            let items = [it1(back('1')), it1(back('2'))]
            let r = splitCheckedRows(items, true)
            assert.strict.deepEqual(r.rows, items)
            assert.strict.equal(r.nBlocked, 0)
            let r2 = splitCheckedRows([{}, null, 5, { data: null }, it1(ext('x'))], true)
            assert.strict.equal(r2.nBlocked, 1)
            assert.strict.equal(r2.rows.length, 4)
            for (let bad of [undefined, null, 5, 'x', {}]) {
                assert.strict.deepEqual(splitCheckedRows(bad, true), { rows: [], nBlocked: 0 })
            }
        })
    })


    // ===== EU-3: 送出前外部列守門 =====
    describe('EU-3 getExternalEdits', function() {

        let KEYS = {
            grups: ds.grups.keys,
            pemis: ds.pemis.keys,
            targets: ds.targets.keys,
            users: ds.users.keys,
        }
        let mkBase = (table) => {
            let mk = (id, from, o = {}) => {
                let r = { id, from, order: 1, userId: 'u', timeCreate: 't0', userIdUpdate: 'u', timeUpdate: 't0', description: 'd', ...o }
                if (table === 'grups') {
                    return { name: `N-${id}`, cpemis: '{}', ...r }
                }
                if (table === 'pemis') {
                    return { name: `N-${id}`, crules: '{}', ...r }
                }
                if (table === 'users') {
                    return { name: `N-${id}`, email: `${id}@x.com`, cgrups: '{}', isAdmin: 'n', isActive: 'y', ...r }
                }
                return r
            }
            return [mk('e1', 'teamA'), mk('e2', 'teamB'), mk('b1', '')]
        }
        let ASSIGN = { grups: 'cpemis', pemis: 'crules', users: 'cgrups' }
        let LOCKF = { grups: 'name', pemis: 'name', users: 'email', targets: 'description' }

        for (let table of ['grups', 'pemis', 'users', 'targets']) {
            it(`EU-301 ${table}: 原樣、改後台列、改外部列之指派欄／order／伺服器管理欄 → null; 改外部列之鎖定欄／from、外部列被刪／改 id → 違規(n 計列數, froms 為來源)`, function() {
                let base = mkBase(table)
                let g = (rowsNew) => getExternalEdits({ keyTable: table, keys: KEYS[table], rowsNew, rowsOld: base })
                assert.strict.equal(g(cloneDeep(base)), null, '原樣')

                //後台列任意修改
                let r1 = cloneDeep(base)
                r1[2][LOCKF[table]] = 'changed'
                r1[2].from = '' //後台列
                assert.strict.equal(g(r1), null, '後台列修改不算')

                //外部列之 order／伺服器管理欄／指派欄
                let r2 = cloneDeep(base)
                r2[0].order = 99
                r2[0].userId = 'other'
                r2[0].timeUpdate = 't9'
                if (ASSIGN[table]) {
                    r2[0][ASSIGN[table]] = '{"X":{"mode":"OR","isActive":"y"}}'
                }
                assert.strict.equal(g(r2), null, '指派欄／order／伺服器管理欄不算')

                //外部列鎖定欄
                let r3 = cloneDeep(base)
                r3[0][LOCKF[table]] = 'hacked'
                let v3 = g(r3)
                assert.strict.deepEqual(v3, { n: 1, froms: ['teamA'] })

                //外部列 from 被改(含清空)
                let r4 = cloneDeep(base)
                r4[1].from = ''
                assert.strict.deepEqual(g(r4), { n: 1, froms: ['teamB'] })

                //外部列被刪
                let r5 = cloneDeep(base).filter((r) => r.id !== 'e1')
                assert.strict.deepEqual(g(r5), { n: 1, froms: ['teamA'] })

                //外部列改 id(原 id 消失)
                let r6 = cloneDeep(base)
                r6[0].id = 'e1-renamed'
                assert.strict.deepEqual(g(r6), { n: 1, froms: ['teamA'] })

                //兩個外部列違規: n 為 2, froms 依序
                let r7 = cloneDeep(base)
                r7[0][LOCKF[table]] = 'x1'
                r7[1][LOCKF[table]] = 'x2'
                assert.strict.deepEqual(g(r7), { n: 2, froms: ['teamA', 'teamB'] })
            })
        }

        it('EU-302 缺欄與 "" 視為同一(同 checkExternalWrite 之 normV): 外部列之鎖定欄缺欄 ↔ ""; 數字 id 視同字串 id; froms 去重且至多 5 個', function() {
            let base = [ext('e1', 'A', { description: '' }), ext('e2', 'A', { description: 'd' })]
            let r = cloneDeep(base)
            delete r[0].description
            assert.strict.equal(getExternalEdits({ keyTable: 'targets', keys: ds.targets.keys, rowsNew: r, rowsOld: base }), null, '缺欄 ≡ ""')
            let r2 = [{ ...base[0], id: 'e1' }, { ...base[1], id: 'e2' }]
            let nb = [{ id: '1', from: 'A', description: 'd' }]
            assert.strict.equal(getExternalEdits({ keyTable: 'targets', keys: ds.targets.keys, rowsNew: [{ id: 1, from: 'A', description: 'd' }], rowsOld: nb }), null, '數字 id 1 ≡ 字串 "1"')
            assert.strict.equal(r2.length, 2)
            let many = []
            for (let k = 0; k < 8; k++) {
                many.push(ext(`e${k}`, `src${k % 7}`, { description: 'd' }))
            }
            let rn = many.map((x) => ({ ...x, description: 'changed' }))
            let v = getExternalEdits({ keyTable: 'targets', keys: ds.targets.keys, rowsNew: rn, rowsOld: many })
            assert.strict.equal(v.n, 8)
            assert.strict.equal(v.froms.length, 5)
            assert.strict.equal(new Set(v.froms).size, 5)
        })

        it('EU-303 非外部列(from 缺／null／數字／布林／空字串)被改或被刪皆不算; 輸入防呆(非陣列)不拋錯', function() {
            for (let f of [undefined, '', null, 0, 1, true, false]) {
                let base = [{ id: 'b1', from: f, description: 'd' }]
                assert.strict.equal(getExternalEdits({ keyTable: 'targets', keys: ds.targets.keys, rowsNew: [{ id: 'b1', from: f, description: 'x' }], rowsOld: base }), null, `from=${f}`)
                assert.strict.equal(getExternalEdits({ keyTable: 'targets', keys: ds.targets.keys, rowsNew: [], rowsOld: base }), null, `刪除 from=${f}`)
            }
            for (let bad of [undefined, null, 5, 'x', {}]) {
                assert.strict.equal(getExternalEdits({ keyTable: 'targets', keys: ds.targets.keys, rowsNew: [], rowsOld: bad }), null)
                let v = getExternalEdits({ keyTable: 'targets', keys: ds.targets.keys, rowsNew: bad, rowsOld: [ext('e1')] })
                assert.strict.deepEqual(v, { n: 1, froms: ['teamA'] }, '整表不是陣列視同外部列全消失(不會發生, 偏嚴)')
            }
        })

        it('EU-304 與伺服端 checkExternalWrite 同判準: 前端判違規 ⇔ 伺服端 diff 後回 saveExternalRowChanged(同一組外部列修改／刪除情境, 以真 ltdtDiffByKey／dropServerOnlyDiff／restoreExternalOrder)', function() {
            for (let table of ['grups', 'pemis', 'users', 'targets']) {
                let keys = KEYS[table]
                let base = mkBase(table)
                let lockF = LOCKF[table]
                //set: 對第 i 列設欄位值(回傳整表, 供單行表達式使用)
                let set = (r, i, o) => {
                    Object.assign(r[i], o)
                    return r
                }
                let assignKey = ASSIGN[table] || 'description' //targets 無指派欄: 以不變更之 description 代替(判準同為「不算違規」)
                let scenarios = [
                    ['原樣', (r) => r, false],
                    ['改後台列', (r) => set(r, 2, { [lockF]: 'z' }), false],
                    ['改外部列鎖定欄', (r) => set(r, 0, { [lockF]: 'z' }), true],
                    ['改外部列 from', (r) => set(r, 0, { from: 'other' }), true],
                    ['改外部列 from 為空', (r) => set(r, 0, { from: '' }), true],
                    ['刪外部列', (r) => r.filter((x) => x.id !== 'e2'), true],
                    ['改外部列指派欄', (r) => set(r, 0, { [assignKey]: ASSIGN[table] ? '{"Q":"y"}' : 'd' }), false],
                    ['改外部列伺服器管理欄', (r) => set(r, 0, { timeUpdate: 't-new', userId: 'someone' }), false],
                    ['改外部列 order(後台儲存重編 order, 伺服端還原)', (r) => set(r, 0, { order: 77 }), false],
                    ['刪後台列', (r) => r.filter((x) => x.id !== 'b1'), false],
                    ['外部列改 id', (r) => set(r, 1, { id: 'e2x' }), true],
                ]
                for (let [title, mut, expectBad] of scenarios) {
                    let rowsNew = mut(cloneDeep(base))
                    let fe = getExternalEdits({ keyTable: table, keys, rowsNew, rowsOld: base }) !== null

                    //伺服端: restoreExternalOrder → ltdtDiffByKey(以 id) → dropServerOnlyDiff → checkExternalWrite
                    let rs = restoreExternalOrder(cloneDeep(rowsNew), base)
                    let r = ltdtDiffByKey(base, rs, 'id')
                    r = dropServerOnlyDiff({ keys, r, ltdtOld: base })
                    let ex = checkExternalWrite({ keyTable: table, keys, r, ltdtOld: base, lockExternalRows: true })
                    let sv = ex !== null && ex.key === 'saveExternalRowChanged'
                    //外部列改 id ＝ 舊 id 消失(del) + 新 id(add 且 from 非空 → saveFromNotAllowed): 伺服端亦整次拒收, 只是鍵不同
                    let svBad = ex !== null
                    assert.strict.equal(fe, expectBad, `${table} ${title}: 前端`)
                    assert.strict.equal(svBad, expectBad, `${table} ${title}: 伺服端(拒收 ${ex && ex.key})`)
                    if (title !== '外部列改 id' && title !== '改外部列 from' && title !== '改外部列 from 為空') {
                        assert.strict.equal(sv, expectBad, `${table} ${title}: 伺服端須為 saveExternalRowChanged`)
                    }
                }
            }
        })

        it('EU-305 空值等價前後端同判準(perm-run01 外審 sol#2): 外部列鎖定欄 description 於 null／""／缺欄互換 → 前端不判違規、伺服端(真 ltdtDiffByKey／dropServerOnlyDiff／checkExternalWrite)亦通過; 空值 ↔ 0／false／非空 → 兩端皆判違規; from 欄 null／"" 改動 → 兩端皆判違規(from 不適用空值等價)', function() {
            const MISSING = Symbol('missing')
            let judge = (table, field, ov, nv) => {
                let keys = KEYS[table]
                let base = mkBase(table)
                if (ov === MISSING) {
                    delete base[0][field]
                }
                else {
                    base[0][field] = ov
                }
                let rowsNew = cloneDeep(base)
                if (nv === MISSING) {
                    delete rowsNew[0][field]
                }
                else {
                    rowsNew[0][field] = nv
                }
                let fe = getExternalEdits({ keyTable: table, keys, rowsNew, rowsOld: base }) !== null
                let rs = restoreExternalOrder(cloneDeep(rowsNew), base)
                let r = dropServerOnlyDiff({ keys, r: ltdtDiffByKey(base, rs, 'id'), ltdtOld: base })
                let ex = checkExternalWrite({ keyTable: table, keys, r, ltdtOld: base, lockExternalRows: true })
                return { fe, sv: ex !== null }
            }
            let show = (v) => (v === MISSING ? '〈缺欄〉' : JSON.stringify(v))
            let EQ = [['', null], ['', MISSING], [null, ''], [null, MISSING], [MISSING, ''], [MISSING, null]]
            let NE = [['', 0], ['', false], [null, 0], [null, false], ['x', null], ['x', ''], [0, null], [false, '']]
            for (let table of ['grups', 'pemis', 'users', 'targets']) {
                for (let [ov, nv] of EQ) {
                    let j = judge(table, 'description', ov, nv)
                    assert.strict.deepEqual(j, { fe: false, sv: false }, `${table} description ${show(ov)} → ${show(nv)}: 空值等價, 前後端皆不判違規`)
                }
                for (let [ov, nv] of NE) {
                    let j = judge(table, 'description', ov, nv)
                    assert.strict.deepEqual(j, { fe: true, sv: true }, `${table} description ${show(ov)} → ${show(nv)}: 非空值等價, 前後端皆判違規`)
                }
                for (let nv of ['', null]) {
                    let j = judge(table, 'from', 'teamA', nv)
                    assert.strict.deepEqual(j, { fe: true, sv: true }, `${table} 外部列 from teamA → ${show(nv)}: 前後端皆判違規`)
                }
            }
        })
    })


    // ===== EU-5: 站點 =====
    describe('SITE-EU 四個清單頁之接線(靜態)', function() {

        let read = (rel) => fs.readFileSync(path.join(projRoot, rel), 'utf8')
        let code = (rel) => sourceLines(path.join(projRoot, rel), 'code').map((l) => l.text).join('\n')
        let PAGES = [
            ['LayoutContentGrups', 'grups', 'Grup', 'name', 'errItemsByName'],
            ['LayoutContentPemis', 'pemis', 'Pemi', 'name', 'errItemsByName'],
            ['LayoutContentTargets', 'targets', 'Target', 'id', 'errItemsById'],
            ['LayoutContentUsers', 'users', 'User', 'name', 'errItemsByName'],
        ]

        it('SITE-EU-001 from 欄於所有列皆唯讀(kpCellEditable 無 from); 身分欄僅於啟用保護時以函數逐列判定, 否則為 true(同現況); 指派欄與開窗按鈕不受影響', function() {
            for (let [fn] of PAGES) {
                let c = code(`src/components/${fn}.vue`)
                assert.strict.ok(!/'from': true/.test(c), `${fn} kpCellEditable 不得再有 from: true`)
                assert.strict.ok(c.includes(`let editable = vo.isLockExternal ? (params) => !isExternalRow(params.data) : true`), `${fn} 逐列唯讀函數`)
                assert.strict.ok(/kpCellEditable = \{\s*('(id|name|email|description)': editable,\s*)+\}/.test(c), `${fn} kpCellEditable 內之欄位皆為 editable`)
                assert.strict.ok(c.includes(`import { isExternalRow } from '../js/externalRows.mjs'`), `${fn} import isExternalRow`)
                assert.strict.ok(c.includes(`isLockExternal: function() {`) && c.includes(`return this.lockExternalRows === 'y'`), `${fn} isLockExternal`)
                assert.strict.ok(c.includes(`return get(this, 'webInfor.lockExternalRows', '')`), `${fn} lockExternalRows 取自 webInfor(舊伺服端無此鍵視為未啟用)`)
            }
        })

        it('SITE-EU-002 複製重置 from(不論是否啟用保護): copyItem 內 r.from = "" 且在 _isNew 之前; 各頁恰一處', function() {
            for (let [fn] of PAGES) {
                let c = code(`src/components/${fn}.vue`)
                assert.strict.equal((c.match(/r\.from = ''/g) || []).length, 1, `${fn} 只有複製處重置 from(新增列由 funNew 之 from 預設)`)
                let i = c.indexOf(`r.from = ''`)
                let iNew = c.indexOf('r._isNew = true', i)
                assert.strict.ok(i > 0 && iNew > i, `${fn} r.from 重置在複製段落內`)
                assert.strict.ok(c.lastIndexOf('copyItem: function()', i) > 0 && c.lastIndexOf('copyItem: function()', i) > c.lastIndexOf('addItem: function()', i), `${fn} 位於 copyItem`)
            }
        })

        it('SITE-EU-003 刪除過濾: 先 splitCheckedRows(啟用保護才過濾); 有被擋者以 showCheckYes(警告型, 非 success)提示後才處理其餘; 全為外部列不進入刪除流程; 刪除本體 deleteItems(itemsDel) 沿用既有流程', function() {
            for (let [fn] of PAGES) {
                let c = code(`src/components/${fn}.vue`)
                assert.strict.ok(c.includes('let sp = splitCheckedRows(vo.itemsCheck, vo.isLockExternal)'), `${fn} 過濾`)
                assert.strict.ok(/if \(sp\.nBlocked > 0\) \{\s*vo\.\$dg\.showCheckYes\(fmtVars\(vo\.\$t\('externalRowDelBlocked'\), \{ n: sp\.nBlocked \}\), \{ type: 'warning' \}\)\s*\.then\(\(\) => \{\s*if \(size\(sp\.rows\) > 0\) \{\s*vo\.deleteItems\(sp\.rows\)\s*\}\s*\}\)\s*return\s*\}\s*vo\.deleteItems\(sp\.rows\)/.test(c), `${fn} 提示後才處理其餘; 全為外部列不刪除`)
                assert.strict.ok(c.includes('deleteItems: function(itemsDel) {'), `${fn} deleteItems`)
                assert.strict.ok(/each\(itemsDel, \(v\) => \{/.test(c), `${fn} 刪除以過濾後之項目計`)
                assert.strict.ok(!/each\(vo\.itemsCheck, \(v\) => \{/.test(c), `${fn} 不再直接以 vo.itemsCheck 取刪除列`)
            }
        })

        it('SITE-EU-004 橫幅與鎖頭以 v-for 渲染(空陣列不渲染任何節點, 不用 v-if 以免留下註解節點); 鎖頭 span 緊接於首欄既有分支之前, 既有分支(v-if／v-else-if／v-else)原樣; 圖示 16px 同警告圖示', function() {
            for (let [fn, table, , col, errMap] of PAGES) {
                let t = read(`src/components/${fn}.vue`)
                assert.strict.ok(t.includes('v-for="(b, kb) in bannerLines"'), `${fn} 橫幅 v-for`)
                assert.strict.ok(!/v-if="[^"]*bannerLines/.test(t), `${fn} 橫幅不得用 v-if`)
                assert.strict.ok(t.includes(`:data-fmid="\`${table}-banner-\${b.kind}\`"`), `${fn} 橫幅 data-fmid`)
                assert.strict.ok(t.includes(':style="getBannerStyle(b.kind)"'), `${fn} 橫幅樣式`)
                assert.strict.ok(t.includes('<svg v-if="b.kind===\'ext\'"') && t.includes(`<img v-else style="vertical-align:sub; width:16px; height:16px; margin-right:4px;" :src="$ui.getIcon('warning')" />`), `${fn} 橫幅圖示(外部列用鎖頭, 警示用既有警告圖示)`)
                let lock = `<span v-for="loc in lockOfRow(props.row)" :key="loc.from" :title="getLockTitle(loc)" style="margin-right:4px;"><svg style="vertical-align:sub;" width="16" height="16" viewBox="0 0 24 24"><path :d="mdiLock" fill="#666"></path></svg></span>`
                let i = t.indexOf(lock)
                assert.strict.ok(i > 0, `${fn} 鎖頭 span`)
                assert.strict.equal(t.indexOf(lock, i + 1), -1, `${fn} 鎖頭只有一處(首欄)`)
                let head = errMap === 'errItemsById' ? `<span v-if="errItemsById[props.value]" :title="errItemsById[props.value]">` : `<span v-if="errItemsByName[props.value]" :title="errItemsByName[props.value]">`
                let after = t.slice(i + lock.length).replace(/^\s*/, '')
                assert.strict.ok(after.startsWith(head), `${fn} 鎖頭之後即為既有首欄分支(原樣)`)
                assert.strict.ok(t.includes(`<template v-if="props.key==='${col}'">`), `${fn} 首欄 ${col}`)
            }
        })

        it('SITE-EU-005 橫幅各行來源: getBannerLines(本表、種類、store 基準列、lock、syncWarns); 撞名提示: 名稱頁以 dupExternal 改用 nameUsedByExternal, 標的頁以外部列 from 改用 nameUsedByExternal; 其餘仍為既有文字', function() {
            for (let [fn, table, kind] of PAGES) {
                let c = code(`src/components/${fn}.vue`)
                assert.strict.ok(c.includes(`getBannerLines({ keyTable: '${table}', kind: '${kind}', rows: vo.${table}, lock: vo.isLockExternal, syncWarns: get(vo, 'webInfor.syncWarns', []), $t: (k) => vo.$t(k) })`), `${fn} getBannerLines`)
                if (table === 'targets') {
                    assert.strict.ok(c.includes(`kpExt[id] = v.from`) && c.includes(`haskey(kpExt, id) ? fmtVars(vo.$t('nameUsedByExternal'), { name: id, from: kpExt[id] }) : vo.$t(\`targetIdDuplicate\`)`), `${fn} id 重複之外部來源提示`)
                }
                else {
                    assert.strict.ok(c.includes(`if (kind === 'dup' && name in vo.nameErrs.dupExternal) {`) && c.includes(`return fmtVars(vo.$t('nameUsedByExternal'), { name, from: vo.nameErrs.dupExternal[name] })`), `${fn} 名稱重複之外部來源提示`)
                }
            }
        })

        it('SITE-EU-006 使用者頁: isAdmin／isActive 核選方塊對外部列 :disabled(其餘分支原樣); 兩個切換函數對外部列為防呆不變更', function() {
            let t = read('src/components/LayoutContentUsers.vue')
            assert.strict.ok(t.includes(`@click="toggleItemIsAdminById(props.row.id)" :disabled="!isEditableIdentity || isLockedRow(props.row)" />`))
            assert.strict.ok(t.includes(`@click="toggleItemIsActiveById(props.row.id)" :disabled="!isEditableIdentity || isLockedRow(props.row)" />`))
            let c = code('src/components/LayoutContentUsers.vue')
            assert.strict.equal((c.match(/if \(vo\.isLockedRow\(r\)\) \{\s*vo\.refresh\(\)\s*return\s*\}/g) || []).length, 2, '兩個切換函數各一處防呆')
            assert.strict.ok(c.includes('return vo.isLockExternal && isExternalRow(row)'), 'isLockedRow')
        })

        it('SITE-EU-007 四頁送出前之外部列守門(貼上等路徑可繞過逐列唯讀): getExternalEdits 於開 loading 之前、早退前 unlockBtn、以 saveExternalRowChanged 之警告訊息框提示', function() {
            for (let [fn, table] of PAGES) {
                let c = code(`src/components/${fn}.vue`)
                let re = new RegExp(`if \\(vo\\.isLockExternal && getExternalEdits\\(\\{ keyTable: '${table}', keys: vo\\.\\$ds\\.${table}\\.keys, rowsNew: rows, rowsOld: vo\\.baseRows \\}\\) !== null\\) \\{\\s*unlockBtn\\(\\)\\s*await vo\\.\\$dg\\.showCheckYes\\(vo\\.\\$t\\('saveExternalRowChanged'\\), \\{ type: 'warning' \\}\\)\\s*return\\s*\\}`)
                assert.strict.ok(re.test(c), `${fn} 外部列守門`)
                let iGuard = c.indexOf('getExternalEdits({ keyTable')
                let iLoad = c.indexOf('updateLoading(true)')
                assert.strict.ok(iGuard > 0 && iGuard < iLoad, `${fn} 守門在開 loading 之前`)
            }
        })

        it('SITE-EU-008 錯誤路徑: 伺服端回之 saveStale／saveBaselineRequired／saveExternalRowChanged／saveFromNotAllowed 於四頁皆走 catch → updateLoading(false) → showCheckYes(失敗前綴 + $tErr(err)) 且 type 非 success; 四鍵 eng／cht 皆有; 失敗後不殘留 loading(finally 關閉)', function() {
            for (let k of ['saveStale', 'saveBaselineRequired', 'saveExternalRowChanged', 'saveFromNotAllowed']) {
                for (let lang of ['eng', 'cht']) {
                    assert.strict.ok(typeof LANG[lang][k] === 'string' && LANG[lang][k].length > 0, `${lang} ${k}`)
                }
            }
            for (let [fn] of PAGES) {
                let c = code(`src/components/${fn}.vue`)
                //run12: 失敗路徑於關 loading 之前先歸零 saveMark.saving 並依目前 store 重算過期提示(自己存檔進行中被安靜保留之推播; 見 unit-draftSync DS-4o); 其後仍是先關 loading 再 showCheckYes
                assert.strict.ok(/\.catch\(async \(err\) => \{\s*vo\.saveMark\.saving = false\s*vo\.staleNotice = isDraftStale\(\{[^\n]*\}\)\s*vo\.\$ui\.updateLoading\(false\)\s*await vo\.\$dg\.showCheckYes\(`\$\{vo\.\$t\('\w+Fail'\)\}: \$\{vo\.\$tErr\(err\)\}`\)\s*\}\)/.test(c), `${fn} 失敗路徑: 先關 loading 再 showCheckYes(無 type: success)`)
                assert.strict.ok(/\.finally\(\(\) => \{\s*vo\.saveMark\.saving = false\s*vo\.\$ui\.updateLoading\(false\)\s*\}\)/.test(c), `${fn} finally 統一關 loading(並歸零 saveMark.saving)`)
            }
        })
    })

})
