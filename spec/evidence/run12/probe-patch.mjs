//run12 探測: 以 node --import 預載, 攔 chromium.launch → newContext, 對每頁注入觀測腳本(不改 src／測試檔)
//觀測: store 提交(UpdateTableData)、清單頁 rebuildDraft／isModified／staleNotice／postSaving／systemProcing 變化、updatePemis 呼叫起訖、showCheckYes 起訖
//注意(第一版教訓): 觀測不得在 computed(changeParams)執行期間讀取反應式屬性——會使 changeParams 依賴該屬性而產生假迴圈; 改以 sync watcher 維護影子旗標, 只讀影子
import fs from 'fs'
import { chromium } from 'playwright'

const OUT = process.env.PROBE_OUT || 'C:/opensrc/開源-JS-411-8-w-web-perm/w-web-perm/tmp/run12/probe.log'
fs.appendFileSync(OUT, `\n===== probe start ${new Date().toISOString()} pid=${process.pid} =====\n`)

function initScript() {
    if (window.__probeInstalled) return
    window.__probeInstalled = true
    const T0 = Date.now()
    const log = (...a) => {
        try {
            console.log('[PROBE] ' + String(Date.now() - T0).padStart(6, ' ') + 'ms ' + a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '))
        }
        catch (e) {}
    }
    const wrapped = new WeakSet()
    const walk = (vm, fn) => {
        fn(vm)
        for (const c of vm.$children || []) walk(c, fn)
    }
    const hookStore = (vo) => {
        const st = vo.$store
        if (!st || st.__probe) return
        st.__probe = true
        const orig = st.commit.bind(st)
        st.commit = function(type, payload, ...rest) {
            try {
                if (payload && payload.tableName) {
                    log('store.commit', String(type), payload.tableName, 'rows=' + (Array.isArray(payload.data) ? payload.data.length : '?'))
                }
            }
            catch (e) {}
            return orig(type, payload, ...rest)
        }
    }
    const hookFapi = (vo) => {
        const fapi = vo.$fapi
        if (!fapi || fapi.__probe) return
        fapi.__probe = true
        for (const k of ['updatePemis', 'updateGrups', 'updateUsers', 'updateTargets']) {
            const f = fapi[k]
            if (typeof f !== 'function') continue
            fapi[k] = function(...a) {
                log('fapi.' + k + ' START')
                return f.apply(this, a).then((r) => {
                    log('fapi.' + k + ' RESOLVED')
                    return r
                }, (e) => {
                    log('fapi.' + k + ' REJECTED')
                    throw e
                })
            }
        }
    }
    const hookDg = (vo) => {
        const dg = vo.$dg
        if (!dg || dg.__probe) return
        dg.__probe = true
        for (const k of ['showCheckYes', 'showCheckYesNo']) {
            const f = dg[k]
            if (typeof f !== 'function') continue
            dg[k] = function(...a) {
                log('dg.' + k + ' OPEN')
                const p = f.apply(this, a)
                Promise.resolve(p).then(() => log('dg.' + k + ' CLOSED(resolve)'), () => log('dg.' + k + ' CLOSED(reject)'))
                return p
            }
        }
    }
    const hookComp = (vm) => {
        if (wrapped.has(vm)) return
        if (typeof vm.rebuildDraft !== 'function' || !('isModified' in vm.$data)) return
        wrapped.add(vm)
        const name = String((vm.$options && vm.$options.name) || vm.$vnode?.tag || 'list').replace(/^vue-component-\d+-/, '')
        const sh = { iM: vm.isModified, pS: vm.postSaving, sP: vm.systemProcing, sN: vm.staleNotice }
        log('HOOK', name, sh)
        const rb = vm.rebuildDraft.bind(vm)
        vm.rebuildDraft = function(...a) {
            log(name, 'rebuildDraft', Object.assign({}, sh))
            return rb(...a)
        }
        const map = { isModified: 'iM', staleNotice: 'sN', postSaving: 'pS', systemProcing: 'sP' }
        for (const k of Object.keys(map)) {
            vm.$watch(k, (n, o) => {
                sh[map[k]] = n
                if (k === 'isModified' && n === true) {
                    log(name, k, o, '->', n, Object.assign({}, sh), String(new Error().stack).split('\n').slice(2, 7).map((s) => s.trim().replace(/\(.*[\\/]/, '(')).join(' | '))
                }
                else if (k !== 'systemProcing') {
                    log(name, k, o, '->', n)
                }
            }, { sync: true })
        }
        vm.$watch(() => vm.syncTick, (n, o) => log(name, 'syncTick', o, '->', n), { sync: true })
    }
    const tick = () => {
        const vo = window.$vo
        if (!vo) return
        hookStore(vo)
        hookFapi(vo)
        hookDg(vo)
        walk(vo.$root || vo, hookComp)
    }
    setInterval(tick, 20)
}

const origLaunch = chromium.launch.bind(chromium)
chromium.launch = async function(...a) {
    const browser = await origLaunch(...a)
    const origNew = browser.newContext.bind(browser)
    browser.newContext = async function(...b) {
        const ctx = await origNew(...b)
        await ctx.addInitScript(initScript)
        ctx.on('page', (p) => {
            p.on('console', (m) => {
                const t = m.text()
                if (t.startsWith('[PROBE]')) fs.appendFileSync(OUT, t + '\n')
            })
        })
        return ctx
    }
    return browser
}
