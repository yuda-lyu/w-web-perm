//存檔成功後立即以伺服端回傳之「寫入後之列」更新 store(多人同時編輯規格第 8 節; 修已知缺口 (a); 規則帳本 R-SAVED-ROWS-01; perm-run01)
//
//受測: src/js/applySaved.mjs(getSavedTables／applySavedRows)與其在四清單頁、兩反向關聯對話框之接線(靜態).
//真瀏覽器行為(存檔成功後立即再編輯再存不被自己誤擋)由 test/e2e-concurrent-edit.test.mjs 之 CE-A 系列走使用者路徑驗證.
//
//規格(每條 assertion 註解標出對應句):
//  [A1] 存檔成功後新基準取自伺服端: 回傳 { msg, rows, others } 時, 以 rows(本表)與 others(引用連帶有改寫之引用端表)為新 store 資料; 不以自己送出之值當新基準(clearXSS 等會改寫字串).
//  [A2] 回傳不含可用之列(舊伺服端回字串、讀回失敗回字串、形狀異常)→ 不套用(false), 前端退回等推播; 不得拋錯, 不得部分套用異常資料.
//  [A3] 只套用白名單內之表(targets／pemis／grups／users); 本表與 others 同名時只取本表.
//輸入空間表: 回傳形狀 {字串, null, undefined, 物件缺 rows, rows 非陣列, rows 含非物件列, rows 含缺 id 列, rows 含非字串 id, 空陣列(合法: 表被清空)} × others {無, 空, 白名單表, 非白名單表, 異常資料} — 見各案.
//跑法: npx mocha test/unit-applySaved.test.mjs --timeout 60000
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getSavedTables, applySavedRows } from '../src/js/applySaved.mjs'
import { TABLES, mkRow } from './tools/unitExt.mjs'


const projRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const readSrc = (rel) => fs.readFileSync(path.join(projRoot, rel), 'utf8').replace(/\r\n/g, '\n')


describe('unit-applySaved (存檔成功後以回傳之寫入後之列更新 store, 修 (a))', function() {

    let rowsOf = (t, ids) => ids.map((id, k) => mkRow(t, { id, order: k + 1 }))

    it('AS-1 回傳 { msg, rows } → 取本表列; 回傳 others 之引用端表亦取(本表在前)  [A1]', function() {
        let rs = rowsOf('grups', ['g1', 'g2'])
        let us = rowsOf('users', ['u1'])
        let ts = getSavedTables('grups', { msg: 'saveTabItemsSuccess', rows: rs, others: { users: us } })
        assert.strict.deepEqual(ts.map((t) => t.tableName), ['grups', 'users'])
        assert.strict.equal(ts[0].data, rs)
        assert.strict.equal(ts[1].data, us)
    })

    it('AS-2 applySavedRows 對每個可套用之表呼叫 commit(tableName, data) 並回 true; 呼叫次序為本表先、引用端後  [A1]', function() {
        let calls = []
        let rs = rowsOf('pemis', ['p1'])
        let gs = rowsOf('grups', ['g1'])
        let ok = applySavedRows('pemis', { msg: 'saveTabItemsSuccess', rows: rs, others: { grups: gs } }, (t, d) => calls.push([t, d]))
        assert.strict.equal(ok, true)
        assert.strict.deepEqual(calls.map((c) => c[0]), ['pemis', 'grups'])
        assert.strict.equal(calls[0][1], rs)
    })

    it('AS-3 空陣列是合法的寫入後結果(表被清空)→ 套用  [A1]', function() {
        let calls = []
        assert.strict.equal(applySavedRows('targets', { msg: 'x', rows: [] }, (t, d) => calls.push([t, d])), true)
        assert.strict.deepEqual(calls, [['targets', []]])
    })

    let BAD = [
        ['成功 msg key 字串(舊伺服端／未帶 returnRows)', 'saveTabItemsSuccess'],
        ['null', null],
        ['undefined', undefined],
        ['數字', 1],
        ['物件缺 rows(讀回失敗)', { msg: 'saveTabItemsSuccess' }],
        ['rows 非陣列', { msg: 'x', rows: { 0: { id: 'a' }, length: 1 } }],
        ['rows 含非物件列', { msg: 'x', rows: [{ id: 'a' }, 'b'] }],
        ['rows 含 null', { msg: 'x', rows: [{ id: 'a' }, null] }],
        ['rows 含缺 id 之列', { msg: 'x', rows: [{ id: 'a' }, { name: 'n' }] }],
        ['rows 含非字串 id', { msg: 'x', rows: [{ id: 'a' }, { id: 5 }] }],
        ['rows 含空字串 id', { msg: 'x', rows: [{ id: '' }] }],
    ]
    for (let [title, res] of BAD) {
        it(`AS-4 回傳不可用: ${title} → 不套用(回 false, 不呼叫 commit, 不拋錯; 前端退回等推播)  [A2]`, function() {
            let calls = 0
            assert.strict.equal(applySavedRows('grups', res, () => calls++), false)
            assert.strict.equal(calls, 0)
        })
    }

    it('AS-5 表名不在白名單 → 不套用; others 內非白名單之表／與本表同名者／資料異常者略過, 其餘照取  [A3]', function() {
        let calls = []
        assert.strict.equal(applySavedRows('constructor', { msg: 'x', rows: [{ id: 'a' }] }, (t) => calls.push(t)), false)
        assert.strict.equal(applySavedRows('__proto__', { msg: 'x', rows: [{ id: 'a' }] }, (t) => calls.push(t)), false)
        assert.strict.deepEqual(calls, [])
        let ts = getSavedTables('grups', {
            msg: 'x',
            rows: [{ id: 'g' }],
            others: { grups: [{ id: 'dup' }], evil: [{ id: 'e' }], constructor: [{ id: 'c' }], users: [{ id: 'u' }], pemis: 'bad', targets: [{ id: '' }] },
        })
        assert.strict.deepEqual(ts.map((t) => t.tableName), ['grups', 'users'])
        assert.strict.deepEqual(ts[0].data, [{ id: 'g' }], '同名 others 不得覆蓋本表')
    })

    it('AS-6 others 為 null／陣列／字串 → 視為無 others', function() {
        for (let o of [null, [], 'x', 5, undefined]) {
            let ts = getSavedTables('users', { msg: 'x', rows: [{ id: 'u' }], others: o })
            assert.strict.deepEqual(ts.map((t) => t.tableName), ['users'], JSON.stringify(o))
        }
    })

    describe('站點接線(AS-S, 靜態)', function() {

        const PAGES = [
            { fn: 'LayoutContentTargets', t: 'targets', api: 'updateTargets' },
            { fn: 'LayoutContentPemis', t: 'pemis', api: 'updatePemis' },
            { fn: 'LayoutContentGrups', t: 'grups', api: 'updateGrups' },
            { fn: 'LayoutContentUsers', t: 'users', api: 'updateUsers' },
            { fn: 'VeGrupBlngUsers', t: 'users', api: 'updateUsers' },
            { fn: 'VePemiBlngGrups', t: 'grups', api: 'updateGrups' },
        ]
        for (let p of PAGES) {
            let src = readSrc(`src/components/${p.fn}.vue`)
            let code = src.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')

            it(`AS-S1 ${p.fn}: 存檔帶 returnRows:true; 成功(then)取回傳 res, 以 applySavedRows('${p.t}', …) 把寫入後之列 commit 進 store(UpdateTableData)  [A1]`, function() {
                assert.strict.ok(code.includes(`import { applySavedRows } from '../js/applySaved.mjs'`))
                assert.strict.ok(new RegExp(`\\$fapi\\.${p.api}\\([^)]*\\{ baseline, returnRows: true \\}\\)`).test(code))
                assert.strict.ok(code.includes('.then((res) => {'))
                //source: 'savedRows' 為 e2e 手段用之標記(e2e 只攔網路推播、放行自己存檔之 commit, 以固定「推播尚未抵達」之窗口); Vuex mutation 不讀它
                let m = /applySavedRows\('(\w+)', (\w+), \(t, rs\) => vo\.\$store\.commit\(vo\.\$store\.types\.UpdateTableData, \{ tableName: t, data: rs, source: 'savedRows' \}\)\)/.exec(code)
                assert.strict.ok(m, '應有 applySavedRows 呼叫')
                assert.strict.equal(m[1], p.t)
                assert.strict.equal(code.split('applySavedRows(').length - 1, 1, '每檔恰一處套用')
            })
        }

        for (let p of PAGES.slice(0, 4)) {
            let src = readSrc(`src/components/${p.fn}.vue`)
            it(`AS-S2 ${p.fn}: 套用前先同步歸零未存編輯旗標(isModified=false 且 syncMark.dirty=false; watch 為非同步)——commit 引起之 changeParams 重算須視為「無草稿」而重建, 否則 'keep' 分支會把剛存的結果顯示成過期橫幅  [A1]`, function() {
                let i = src.indexOf('vo.syncMark.dirty = false')
                let j = src.indexOf('applySavedRows(', i)
                assert.strict.ok(i > 0 && j > i)
                let k = src.lastIndexOf('vo.isModified = false', i)
                assert.strict.ok(k > 0 && i - k < 200)
            })
        }

    })

})
