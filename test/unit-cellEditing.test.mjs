//儲存格編輯器開啟中視為有草稿(第 115 項; 修已知缺口 (c); R-PRINCIPLE-00 原則 10「有未存修改時收到推播不重建」; 規則帳本 R-DRAFT-KEEP-01 規則 10; perm-run01)
//
//受測: src/js/cellEditing.mjs(isCellEditing／bindCellEditingStop／bindCellEditingStopRetry; 以替身 WAggridVue／ag-grid GridApi 驅動)與其在四清單頁、兩反向關聯對話框之接線(靜態).
//真瀏覽器行為(已輸入未按 Enter 時收到推播: 不重建、保留輸入、凍結基準、顯示提示)由 test/e2e-concurrent-edit.test.mjs 之 CE-C 系列走使用者路徑驗證.
//
//規格:
//  [C1] 編輯器開啟中(ag-grid getEditingCells 非空)→ isCellEditing 真; 取不到 api(元件未掛載、已銷毀、無此方法)或 getEditingCells 拋錯 → 假(不阻擋重建, 不拋錯).
//  [C2] 編輯結束(cellEditingStopped)監聽同一個 api 只綁一次(重建草稿後重複呼叫不重複註冊); 回呼拋錯不影響 ag-grid.
//  [C3] api 尚未可用時以短輪詢重試, 最多 tries 次; 元件於重試期間被重建(換新 api)亦能綁到新的.
//跑法: npx mocha test/unit-cellEditing.test.mjs --timeout 60000
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { isCellEditing, bindCellEditingStop, bindCellEditingStopRetry } from '../src/js/cellEditing.mjs'


const projRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const readSrc = (rel) => fs.readFileSync(path.join(projRoot, rel), 'utf8').replace(/\r\n/g, '\n')


//mkApi: ag-grid GridApi 替身(只含本模組用到的 getEditingCells／addEventListener)
function mkApi(editing = []) {
    let handlers = {}
    let api = {
        editing,
        getEditingCells: () => api.editing,
        addEventListener: (name, fn) => {
            handlers[name] = handlers[name] || []
            handlers[name].push(fn)
        },
        fire: (name) => (handlers[name] || []).forEach((fn) => fn()),
        nHandlers: (name) => (handlers[name] || []).length,
    }
    return api
}
let mkCmp = (api) => ({ getApi: () => api })


describe('unit-cellEditing (儲存格編輯器開啟中視為有草稿, 修 (c))', function() {

    it('CE-1 isCellEditing: getEditingCells 非空 → 真; 空 → 假  [C1]', function() {
        assert.strict.equal(isCellEditing(mkCmp(mkApi([{ rowIndex: 0, column: 'name' }]))), true)
        assert.strict.equal(isCellEditing(mkCmp(mkApi([]))), false)
    })

    it('CE-2 isCellEditing: 取不到 api(null／undefined／無 getApi／getApi 回 null／getApi 拋錯／api 無 getEditingCells／getEditingCells 回非陣列或拋錯)→ 假, 不拋錯  [C1]', function() {
        let CASES = [
            null,
            undefined,
            {},
            { getApi: () => null },
            { getApi: () => undefined },
            { getApi: () => { throw new Error('destroyed') } },
            { getApi: () => ({}) },
            { getApi: () => ({ getEditingCells: () => null }) },
            { getApi: () => ({ getEditingCells: () => 'x' }) },
            { getApi: () => ({ getEditingCells: () => { throw new Error('destroyed') } }) },
        ]
        for (let [k, cmp] of CASES.entries()) {
            assert.strict.equal(isCellEditing(cmp), false, `case ${k}`)
        }
    })

    it('CE-3 bindCellEditingStop: 對同一個 api 只註冊一次(重複呼叫回 true 但不重複註冊); 換新 api 則再註冊  [C2]', function() {
        let api = mkApi()
        let n = 0
        assert.strict.equal(bindCellEditingStop(mkCmp(api), () => n++), true)
        assert.strict.equal(bindCellEditingStop(mkCmp(api), () => n++), true)
        assert.strict.equal(api.nHandlers('cellEditingStopped'), 1)
        api.fire('cellEditingStopped')
        assert.strict.equal(n, 1, '只有第一次註冊之回呼被呼叫')
        let api2 = mkApi()
        assert.strict.equal(bindCellEditingStop(mkCmp(api2), () => n++), true)
        assert.strict.equal(api2.nHandlers('cellEditingStopped'), 1)
    })

    it('CE-4 bindCellEditingStop: api 不可用 → 回 false 且不註冊; 回呼拋錯被吞掉(不影響 ag-grid 的事件派發)  [C2]', function() {
        assert.strict.equal(bindCellEditingStop(null, () => {}), false)
        assert.strict.equal(bindCellEditingStop({ getApi: () => null }, () => {}), false)
        assert.strict.equal(bindCellEditingStop({ getApi: () => ({ getEditingCells: () => [] }) }, () => {}), false, '無 addEventListener')
        let api = mkApi()
        bindCellEditingStop(mkCmp(api), () => {
            throw new Error('boom')
        })
        let orig = console.log
        console.log = () => {}
        try {
            assert.strict.doesNotThrow(() => api.fire('cellEditingStopped'))
        }
        finally {
            console.log = orig
        }
    })

    it('CE-5 bindCellEditingStopRetry: api 第 3 次輪詢才可用 → 綁定成功且之後不再輪詢; 元件被重建(換新 api)時綁到新 api  [C3]', async function() {
        let api = mkApi()
        let calls = 0
        let cur = null
        let getCmp = () => {
            calls++
            return calls >= 3 ? mkCmp(cur) : null
        }
        cur = api
        let fired = 0
        bindCellEditingStopRetry(getCmp, () => fired++, 10)
        await new Promise((resolve) => setTimeout(resolve, 450))
        assert.strict.equal(calls, 3, '第 3 次綁到後停止輪詢')
        assert.strict.equal(api.nHandlers('cellEditingStopped'), 1)
        api.fire('cellEditingStopped')
        assert.strict.equal(fired, 1)
    })

    it('CE-6 bindCellEditingStopRetry: tries 用盡仍不可用 → 停止(不無限輪詢)  [C3]', async function() {
        let calls = 0
        bindCellEditingStopRetry(() => {
            calls++
            return null
        }, () => {}, 2)
        await new Promise((resolve) => setTimeout(resolve, 450))
        assert.strict.equal(calls, 3, '首次 + 重試 2 次')
    })

    describe('站點接線(CE-S, 靜態)', function() {

        const LISTS = ['LayoutContentTargets', 'LayoutContentPemis', 'LayoutContentGrups', 'LayoutContentUsers']
        for (let fn of LISTS) {
            let src = readSrc(`src/components/${fn}.vue`)
            it(`CE-S1 ${fn}: hasDraft 含儲存格編輯器(isCellEditing); 重建後綁編輯結束監聽(bindEditing → bindCellEditingStopRetry); 編輯結束且無未存修改而 store 已變新者補重建(afterEditing)  [C1][C2]`, function() {
                assert.strict.ok(src.includes(`hasDraft: () => hasDraftNow({ dirty: vo.syncMark.dirty === true, editing: isCellEditing(get(vo, '$refs.rftable', null)) }),`))
                assert.strict.ok(/vo\.firstLoading = false\n\n {12}\/\/第 115 項[^\n]*\n {12}vo\.\$nextTick\(\(\) => \{\n {16}vo\.bindEditing\(\)\n {12}\}\)/.test(src), 'rebuildDraft 末尾 nextTick 綁定')
                assert.strict.ok(/bindEditing: function\(\) \{[\s\S]*?bindCellEditingStopRetry\(\(\) => get\(vo, '\$refs\.rftable', null\), \(\) => \{\n {16}vo\.afterEditing\(\)/.test(src))
                assert.strict.ok(/afterEditing: function\(\) \{[\s\S]*?if \(vo\.isModified !== true && vo\.syncMark\.refs !== null && refsChanged\(vo\.syncMark\.refs, vo\.curRefs\(\)\)\) \{\n {16}vo\.reloadDraft\(\)/.test(src))
            })
        }

        const DLGS = ['VeGrupBlngUsers', 'VePemiBlngGrups']
        for (let fn of DLGS) {
            let src = readSrc(`src/components/${fn}.vue`)
            it(`CE-S2 ${fn}: syncStore 的 editing 取自 isCellEditing; show()／rebuildDialog 後綁定編輯結束監聽; 編輯結束且無未存修改者重做 syncStore  [C1][C2]`, function() {
                assert.strict.ok(src.includes(`editing: isCellEditing(get(vo, '$refs.rftable', null)),`))
                assert.strict.ok(/bindEditing: function\(\) \{[\s\S]*?bindCellEditingStopRetry\(\(\) => get\(vo, '\$refs\.rftable', null\)/.test(src))
                assert.strict.ok(/afterEditing: function\(\) \{[\s\S]*?if \(vo\.isModified !== true\) \{\n {16}vo\.syncStore\(\)/.test(src))
                assert.strict.equal(src.split('vo.bindEditing()').length - 1, 2, 'show() 與 rebuildDialog 各一處')
            })
        }

    })

})
