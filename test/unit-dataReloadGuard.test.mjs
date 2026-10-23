import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { markDataReload } from '../src/plugins/dataReloadGuard.mjs'


//
// UNIT-RG: 程式端資料載入/重載旗標(systemProcing)之守門核心 src/plugins/dataReloadGuard.mjs (規則帳本 R-RELOAD-GUARD-01; run12)
//   對應 spec 流程_後台權限清單 E2E-027 與 spec/設計要點與取捨.md ADR-037 Update(run12):
//   - 一次儲存使兩張表先後推播(權限改名連帶更新群組引用端), 清單頁相隔約 20ms 重建兩次; 第 1 次重建之解除計時器不得在第 2 次重建之 rowsChange 之前解除旗標(AF-037 不穩定失敗之根因)
//   - 旗標只由「最後一次」markDataReload 所排之計時器解除
//   - 修正前(舊實作: 每次呼叫各排一個無條件解除之計時器)在重疊情境下旗標被提早解除 → RG-W 以舊實作當見證, 證明本表之情境確實能區分新舊
// 採 unit-test 性質 (無 server / 無 browser); 計時器與 nextTick 皆為受控假件, 逐事件決定次序, 不靠真實時間.
// 跑法: npx mocha test/unit-dataReloadGuard.test.mjs --timeout 30000
//

const projRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const readSrc = (rel) => fs.readFileSync(path.join(projRoot, rel), 'utf8').replace(/\r\n/g, '\n')


//舊實作(修正前之 mUI.markDataReload 原樣, 僅計時器可注入): 每次呼叫各排一個無條件解除旗標之計時器
function legacyMarkDataReload(vm, setTimeoutFn) {
    vm.systemProcing = true
    vm.$nextTick(() => {
        setTimeoutFn(() => {
            vm.systemProcing = false
        }, 1)
    })
}


//受控環境: 一個 vm、可逐事件觸發之 nextTick 佇列與計時器佇列
//  call(i): 第 i 次呼叫 impl(vm, setTimeoutFn)
//  tick(i): 執行第 i 次呼叫所登記之 nextTick 回呼(其內才登記 1ms 計時器)
//  fire(i): 觸發第 i 次呼叫所登記之計時器
function genEnv(impl) {
    let vm = { systemProcing: false, ticks: {}, timers: {}, cur: 0 }
    vm.$nextTick = (cb) => {
        vm.ticks[vm.cur] = cb
    }
    let setTimeoutFn = (fn, ms) => {
        assert.strict.equal(ms, 1, '解除計時器之延遲為 1ms')
        vm.timers[vm.cur] = fn
    }
    return {
        vm,
        call: (i) => {
            vm.cur = i
            impl(vm, setTimeoutFn)
        },
        tick: (i) => {
            vm.cur = i
            let cb = vm.ticks[i]
            assert.ok(cb, `第 ${i} 次呼叫應已登記 nextTick 回呼`)
            delete vm.ticks[i]
            cb()
        },
        fire: (i) => {
            let fn = vm.timers[i]
            assert.ok(fn, `第 ${i} 次呼叫之計時器應已登記`)
            delete vm.timers[i]
            fn()
        },
    }
}


//列舉 n 次呼叫之全部事件排列(滿足 call_i < tick_i < fire_i 且 call_1 < call_2 < … < call_n)
function genOrders(n) {
    let out = []
    let rec = (st, seq) => {
        if (seq.length === 3 * n) {
            out.push(seq.slice())
            return
        }
        for (let i = 1; i <= n; i++) {
            let s = st[i]
            if (s === 0 && i > 1 && st[i - 1] === 0) {
                continue //第 i 次呼叫須在第 i-1 次呼叫之後
            }
            if (s >= 3) {
                continue
            }
            st[i]++
            seq.push([['call', 'tick', 'fire'][s], i])
            rec(st, seq)
            seq.pop()
            st[i]--
        }
    }
    rec(Array.from({ length: n + 1 }, () => 0), [])
    return out
}


//期望之旗標(語意): 有過呼叫且「最近一次呼叫」之計時器尚未觸發 → 真; 否則 → 假
function expectedFlag(called, fired) {
    let last = 0
    for (let i = 1; i < called.length; i++) {
        if (called[i]) last = i
    }
    return last > 0 && !fired[last]
}


//依排列逐事件執行並檢查「每個前綴」之旗標; 回傳違反之 [排列序號, 事件序號] 清單(空為全符合)
function runOrders(impl, n) {
    let viol = []
    let orders = genOrders(n)
    orders.forEach((ord, io) => {
        let env = genEnv(impl)
        let called = Array(n + 1).fill(false)
        let fired = Array(n + 1).fill(false)
        ord.forEach(([ev, i], ie) => {
            env[ev](i)
            if (ev === 'call') called[i] = true
            if (ev === 'fire') fired[i] = true
            if (env.vm.systemProcing !== expectedFlag(called, fired)) {
                viol.push([io, ie])
            }
        })
    })
    return { orders: orders.length, viol }
}


describe('dataReloadGuard (程式端重載旗標守門, R-RELOAD-GUARD-01)', function() {

    it('RG-1 單次呼叫: 呼叫即為真; nextTick 回呼後、1ms 計時器觸發前仍為真; 計時器觸發後為假', function() {
        //spec 流程_後台權限清單 E2E-027: 單次重載之 rowsChange 於旗標有效期間內到達(同修正前)
        let env = genEnv(markDataReload)
        assert.strict.equal(env.vm.systemProcing, false, '呼叫前為假')
        env.call(1)
        assert.strict.equal(env.vm.systemProcing, true, '呼叫即為真')
        env.tick(1)
        assert.strict.equal(env.vm.systemProcing, true, 'nextTick 回呼後、計時器前仍為真')
        env.fire(1)
        assert.strict.equal(env.vm.systemProcing, false, '計時器觸發後為假')
    })

    it('RG-2 重疊重載(AF-037 之次序): 第 1 次之計時器在第 2 次重建之事件前觸發 → 旗標必須仍為真, 直到第 2 次之計時器觸發', function() {
        //spec 流程_後台權限清單 E2E-027: 一次儲存使兩張表先後推播而重建兩次, 第 2 次重建之 rowsChange 不得被視為使用者編輯
        let env = genEnv(markDataReload)
        env.call(1) //第 1 張表(群組)推播 → 重建
        env.tick(1) //第 1 次渲染完成, 排解除計時器
        env.call(2) //第 2 張表(權限)推播 → 重建(其渲染與事件尚未完成)
        env.fire(1) //第 1 次之計時器此時觸發
        assert.strict.equal(env.vm.systemProcing, true, '第 2 次重載尚未完成, 第 1 次之計時器不得解除旗標')
        env.tick(2)
        assert.strict.equal(env.vm.systemProcing, true, '第 2 次 nextTick 回呼後仍為真')
        env.fire(2)
        assert.strict.equal(env.vm.systemProcing, false, '最後一次之計時器觸發後為假')
    })

    it('RG-W 見證: 舊實作在 RG-2 之次序下旗標被提早解除(證明本情境能區分修正前後)', function() {
        let env = genEnv(legacyMarkDataReload)
        env.call(1)
        env.tick(1)
        env.call(2)
        env.fire(1)
        assert.strict.equal(env.vm.systemProcing, false, '舊實作: 第 1 次之計時器把旗標解除了(第 2 次之 rowsChange 因此被當成使用者編輯, AF-037 之失敗)')
    })

    it('RG-3 全排列: 2 次與 3 次呼叫之全部事件次序, 每個前綴旗標皆等於「最近一次呼叫之計時器尚未觸發」', function() {
        for (let n of [2, 3]) {
            let r = runOrders(markDataReload, n)
            assert.ok(r.orders > 0)
            assert.deepEqual(r.viol, [], `n=${n}: ${r.orders} 種次序皆須符合, 違反 ${r.viol.length} 處`)
        }
    })

    it('RG-W2 見證: 舊實作於全排列中有違反(證明 RG-3 之判準有鑑別力)', function() {
        let r = runOrders(legacyMarkDataReload, 2)
        assert.ok(r.viol.length > 0, '舊實作應有違反')
        let r3 = runOrders(legacyMarkDataReload, 3)
        assert.ok(r3.viol.length > r.viol.length, 'n=3 之違反更多')
    })

    it('RG-3b 次序數核對: n=2 為 10 種、n=3 為 280 種', function() {
        //線性延伸數(call_1<…<call_n, call_i<tick_i<fire_i)之解析值: n 條長 3 之鏈交錯共 (3n)!/(3!)^n 種, 再要求 call 依序(除以 n!):
        //n=2 → 20/2 = 10, n=3 → 1680/6 = 280(防止列舉函數寫錯而使 RG-3 空轉)
        assert.strict.equal(genOrders(1).length, 1)
        assert.strict.equal(genOrders(2).length, 10)
        assert.strict.equal(genOrders(3).length, 280)
    })

    it('RG-4 不同元件實例互不影響', function() {
        let a = genEnv(markDataReload)
        let b = genEnv(markDataReload)
        a.call(1)
        a.tick(1)
        b.call(1)
        b.tick(1)
        a.call(2)
        b.fire(1)
        assert.strict.equal(b.vm.systemProcing, false, 'b 自己只有 1 次呼叫, 其計時器觸發即解除(不受 a 之第 2 次呼叫影響)')
        assert.strict.equal(a.vm.systemProcing, true, 'a 仍為真')
    })

    it('RG-5 真實計時器: 連續兩次呼叫, 稍候旗標為假且只在最後一次之後解除', async function() {
        let vm = { systemProcing: false, $nextTick: (cb) => Promise.resolve().then(cb) }
        markDataReload(vm)
        markDataReload(vm)
        assert.strict.equal(vm.systemProcing, true)
        await new Promise((resolve) => setTimeout(resolve, 50))
        assert.strict.equal(vm.systemProcing, false)
    })

    describe('站點(靜態): 旗標之寫入與呼叫點', function() {

        it('SITE-RG-001 mUI.markDataReload 即 dataReloadGuard 之 markDataReload, mUI 不再自帶解除計時器', function() {
            let src = readSrc('src/plugins/mUI.mjs')
            assert.ok(/import \{ markDataReload \} from '\.\/dataReloadGuard\.mjs'/.test(src), 'mUI 應自 dataReloadGuard 匯入')
            assert.ok(!/function markDataReload\(/.test(src), 'mUI 不應再自行定義 markDataReload')
            assert.ok(!/systemProcing\s*=/.test(src), 'mUI 內不應直接寫 systemProcing')
            assert.ok(/^\s+markDataReload,$/m.test(src), 'mUI 仍匯出 markDataReload(四清單頁以 $ui.markDataReload 呼叫)')
        })

        it('SITE-RG-002 四清單頁 genOpt 各以 $ui.markDataReload(vo) 呼叫一次, 且只有守門核心寫入 systemProcing(= false／= true)', function() {
            for (let f of ['Targets', 'Pemis', 'Grups', 'Users']) {
                let src = readSrc(`src/components/LayoutContent${f}.vue`)
                let n = (src.match(/vo\.\$ui\.markDataReload\(vo\)/g) || []).length
                assert.strict.equal(n, 1, `${f}: $ui.markDataReload(vo) 應恰 1 處, 實得 ${n}`)
                assert.ok(!/systemProcing\s*=[^=]/.test(src.replace(/systemProcing: false,[^\n]*/, '')), `${f}: 不應自行寫入 systemProcing(僅 data 宣告)`)
                assert.ok(/vo\.systemProcing/.test(src), `${f}: rowsChange 守門應讀 vo.systemProcing`)
            }
        })

    })

})
