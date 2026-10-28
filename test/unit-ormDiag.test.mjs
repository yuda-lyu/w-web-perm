//w-serv-orm 診斷輸出(opt.funLog)導入本套件 srLog 之契約與站點不變式(perm-run01 of 20261028054319, 第 154 項; 規則帳本 R-ORM-DIAG-01)。
//來源: w-serv-orm 1.1.20 預設診斷輸出不含個資, 選項 opt.funLog(label, safe, detail) 可取代 console; 本套件日誌政策為「不記列 id／個資值」(R-SYNC-EXTERNAL 各節、procCore／cascadeWrite 之 srLog 註解),
//  故 server/ormDiag.mjs 之 mkOrmFunLog 只把 label 與 safe(不含主鍵、資料值、ORM 錯誤原文之摘要)寫入 srLog warn(event 'WServOrm-diag'), detail 一律不寫。
//ORMDIAG-0*: mkOrmFunLog 契約(替身 srLog)。
//ORMDIAG-1*: 真 WServOrm(w-serv-orm 1.1.20)＋替身資料表, 觸發各形狀之 ORM 失敗, 斷言 srLog 只有 label＋safe、全文不含主鍵／email／錯誤原文、console 無輸出。
//SITE-DIAG-*: 靜態站點不變式(不需 server/ormDiag.mjs 存在): WWebPerm 之 WServOrm 建構帶 funLog、本專案全部 WServOrm( 站點之分類、server 不用 logDetail。
//端到端(真 WWebPerm＋真 srLog 檔＋真 HTTP)見 api-ormDiag.test.mjs。
//跑法: npx mocha test/unit-ormDiag.test.mjs --timeout 60000
import fs from 'fs'
import path from 'path'
import assert from 'assert'
import { fileURLToPath } from 'url'
import WServOrm from 'w-serv-orm/src/WServOrm.mjs'
import ds from '../src/schema/index.mjs'
import { mkTable, mkSrLog } from './tools/unitOrm.mjs'
import { sourceLines, blankStrings } from './tools/srcScan.mjs'

const A = assert.strict
const projRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const fpWWebPerm = path.join(projRoot, 'server', 'WWebPerm.mjs')
const fpOrmDiag = path.join(projRoot, 'server', 'ormDiag.mjs')

const SECRET_ID = 'PII-ID-5c2e08'
const SECRET_MAIL = 'pii.user.5c2e08@example.com'
const SECRET_TEXT = 'ENGINE-FAILED-TEXT-5c2e08'
const SECRETS = [SECRET_ID, SECRET_MAIL, SECRET_TEXT, 'simulated save failure', 'simulated del failure']


//withConsoleSpy: 執行 fn 期間攔下 console.log／info／warn／error／debug(不呼叫原函數), 回傳 { calls }
async function withConsoleSpy(fn) {
    let names = ['log', 'info', 'warn', 'error', 'debug']
    let orig = {}
    let calls = []
    for (let n of names) {
        orig[n] = console[n]
        console[n] = (...args) => {
            calls.push({ n, args })
        }
    }
    try {
        await fn()
    }
    finally {
        for (let n of names) {
            console[n] = orig[n]
        }
    }
    return { calls }
}


describe('unit-ormDiag (mkOrmFunLog 契約: 只寫 label＋safe)', function() {
    this.timeout(60000)

    let mkOrmFunLog = null

    before(async function() {
        mkOrmFunLog = (await import('../server/ormDiag.mjs')).mkOrmFunLog
    })

    //R-ORM-DIAG-01: label＋safe 以 warn 寫入 srLog, 除此之外無其他欄位(尤其不得有 detail)
    it('ORMDIAG-001 funLog(label, safe, detail) → srLog.warn({ event: WServOrm-diag, label, safe }) 恰一筆, 無其他欄位', function() {
        let { srLog, logs } = mkSrLog()
        let f = mkOrmFunLog(srLog)
        let safe = { n: 1, ks: [0] }
        f('users.save fail', safe, { id: SECRET_ID, email: SECRET_MAIL })
        A.deepEqual(logs, [{ level: 'warn', event: 'WServOrm-diag', label: 'users.save fail', safe: { n: 1, ks: [0] } }])
        safe.ks.push(5) //摘要為拷貝: 上游事後改動其物件不影響已記錄之內容
        A.deepEqual(logs[0].safe, { n: 1, ks: [0] })
    })

    //R-ORM-DIAG-01: safe 無(undefined)者只有 label
    it('ORMDIAG-002 safe 為 undefined → 該筆無 safe 鍵', function() {
        let { srLog, logs } = mkSrLog()
        mkOrmFunLog(srLog)('users.save row not found', undefined)
        A.deepEqual(logs, [{ level: 'warn', event: 'WServOrm-diag', label: 'users.save row not found' }])
    })

    //R-ORM-DIAG-01: detail 絕不讀取(含 getter 與 Proxy 陷阱: 讀了即可能夾帶主鍵／錯誤原文, 且可能拋錯)
    it('ORMDIAG-003 detail 不被讀取: 函數只收 (label, safe) 兩參數, 傳入帶陷阱之 detail 不觸發', function() {
        let { srLog, logs } = mkSrLog()
        let f = mkOrmFunLog(srLog)
        A.equal(f.length, 2, '回傳函數之形式參數須恰為 (label, safe), 不綁定 detail')
        let touched = 0
        let detail = new Proxy({}, { get() { touched++;return SECRET_ID }, ownKeys() { touched++;return [] }, has() { touched++;return true } })
        f('users.save fail', { n: 1, ks: [0] }, detail)
        A.equal(touched, 0, 'detail 之陷阱不得被觸發')
        A.ok(!JSON.stringify(logs).includes(SECRET_ID))
    })

    //R-ORM-DIAG-01: 日誌寫入失敗不得影響原流程(同步拋錯、回傳 rejected promise 皆吞下)
    it('ORMDIAG-004 srLog.warn 同步拋錯或回傳 rejected promise → funLog 不拋錯、不產生 unhandledRejection', async function() {
        let unhandled = []
        let onUnhandled = (e) => {
            unhandled.push(e)
        }
        process.on('unhandledRejection', onUnhandled)
        try {
            let fThrow = mkOrmFunLog({ warn: () => { throw new Error('log down') } })
            A.doesNotThrow(() => fThrow('users.save fail', { n: 1, ks: [0] }))
            let fRej = mkOrmFunLog({ warn: () => Promise.reject(new Error('log down async')) })
            A.doesNotThrow(() => fRej('users.save fail', { n: 1, ks: [0] }))
            await new Promise((resolve) => setTimeout(resolve, 100))
        }
        finally {
            process.off('unhandledRejection', onUnhandled)
        }
        A.deepEqual(unhandled, [], '不得有 unhandledRejection')
    })

    //R-ORM-DIAG-01: safe／label 為上游之固定摘要, 仍設上限(防異常形狀灌爆日誌): label ≤ 200 字元; safe 序列化後 ≤ 1000 字元、不可序列化者以標記代替
    it('ORMDIAG-005 label 截斷、safe 過長或不可序列化(BigInt、循環)以標記代替且不拋錯', function() {
        let { srLog, logs } = mkSrLog()
        let f = mkOrmFunLog(srLog)
        f('x'.repeat(500), { n: 1, ks: [0] })
        f('big', { s: 'y'.repeat(5000) })
        f('bigint', { n: 10n })
        let cyc = { a: 1 }
        cyc.self = cyc
        f('cyc', cyc)
        A.equal(logs.length, 4)
        A.equal(logs[0].label.length, 200)
        A.equal(logs[1].safe, '[Unloggable]')
        A.equal(logs[2].safe, '[Unloggable]')
        A.equal(logs[3].safe, '[Unloggable]')
    })

    //R-ORM-DIAG-01: 建構時 fail-fast(srLog 無 warn 函數即拋 TypeError, 不靜默變成永遠不記錄)
    it('ORMDIAG-006 srLog 無 warn 函數 → mkOrmFunLog 建構即拋 TypeError', function() {
        for (let bad of [undefined, null, {}, { warn: 'x' }, 'srLog']) {
            A.throws(() => mkOrmFunLog(bad), TypeError, `srLog=${JSON.stringify(bad)} 應拋 TypeError`)
        }
    })

})


describe('unit-ormDiag-orm (真 WServOrm 1.1.20＋替身資料表: ORM 失敗之診斷輸出進 srLog, 不含個資, console 無輸出)', function() {
    this.timeout(60000)

    let mkOrmFunLog = null

    before(async function() {
        mkOrmFunLog = (await import('../server/ormDiag.mjs')).mkOrmFunLog
    })

    //mkOrm: 四張替身資料表(users 可注入故障)＋真 WServOrm; useFunLog=false 為對照(不帶 funLog, 預設 console)
    let mkOrm = (failUsers = {}, useFunLog = true) => {
        let woItems = {}
        for (let k of Object.keys(ds)) {
            woItems[k] = mkTable([], k === 'users' ? failUsers : {})
        }
        function WOrmReplica(opt) {
            return woItems[opt.cl]
        }
        let { srLog, logs } = mkSrLog()
        let so = useFunLog ? WServOrm(ds, WOrmReplica, 'replica', 'replica', { funLog: mkOrmFunLog(srLog) }) : WServOrm(ds, WOrmReplica, 'replica', 'replica')
        return { so, woItems, logs }
    }

    //expectDiag: 觸發 → 斷言 reject、srLog 恰為預期之 label＋safe、全文不含任何祕密、console 零呼叫
    let expectDiag = async ({ fail, setup, run, label, safe }) => {
        let { so, woItems, logs } = mkOrm(fail)
        if (setup) {
            setup(woItems)
        }
        let err = null
        let { calls } = await withConsoleSpy(async () => {
            await run(so.procOrm).catch((e) => {
                err = e
            })
        })
        A.ok(err !== null, '呼叫應 reject(ORM 失敗仍如實回報給呼叫端, 契約不變)')
        A.deepEqual(logs, [{ level: 'warn', event: 'WServOrm-diag', label, safe }], `srLog 應恰為 label＋safe, 實得 ${JSON.stringify(logs)}`)
        let all = JSON.stringify(logs)
        for (let s of SECRETS) {
            A.ok(!all.includes(s), `srLog 不得含 ${s}`)
        }
        A.deepEqual(calls, [], `console 不得有輸出, 實得 ${JSON.stringify(calls).slice(0, 300)}`)
        return err
    }

    let rowSecret = { id: SECRET_ID, name: 'pii name', email: SECRET_MAIL }

    //對照: 不帶 funLog 時診斷輸出走 console(預設安全摘要)——證明 console 攔截有效, 且 funLog 確實取代了 console
    it('ORMDIAG-100 對照: 不帶 funLog → 診斷輸出由 console 輸出(攔截有效), srLog 無記錄', async function() {
        let { so, logs } = mkOrm({ saveIds: [SECRET_ID] }, false)
        let { calls } = await withConsoleSpy(async () => {
            await so.procOrm('u', 'users', 'save', [rowSecret]).catch(() => {})
        })
        A.ok(calls.some((c) => c.n === 'log' && c.args[0] === 'users.save fail'), `預設應由 console.log 輸出 users.save fail, 實得 ${JSON.stringify(calls).slice(0, 300)}`)
        A.deepEqual(logs, [])
    })

    //寫入失敗(逐筆 ok:0): 摘要為失敗筆數與位置, 不含主鍵
    it('ORMDIAG-101 save 逐筆失敗 → label users.save fail、safe { n, ks }, 不含主鍵／email／ORM 原文', async function() {
        let err = await expectDiag({
            fail: { saveIds: [SECRET_ID] },
            run: (procOrm) => procOrm('u', 'users', 'save', [rowSecret, { id: 'ok-1', name: 'ok' }]),
            label: 'users.save fail',
            safe: { n: 1, ks: [0] },
        })
        A.ok(String(err).includes(SECRET_ID), '呼叫端收到之 reject 訊息仍列主鍵(w-serv-orm 契約, 本套件不改; 對外由 procCore／routeResult 轉語系鍵)')
    })

    //寫入失敗(整批性, ORM 引擎錯誤): 摘要為錯誤類別與機器代碼, 不含訊息文字
    it('ORMDIAG-102 insert 引擎 Error(含 code ENOSPC, 訊息夾帶主鍵與 email) → label users.insert catch、safe { errType, errCode }', async function() {
        await expectDiag({
            fail: { insert: Object.assign(new Error(`${SECRET_TEXT} id[${SECRET_ID}] mail=${SECRET_MAIL}`), { code: 'ENOSPC' }) },
            run: (procOrm) => procOrm('u', 'users', 'insert', [rowSecret]),
            label: 'users.insert catch',
            safe: { errType: 'Error', errCode: 'ENOSPC' },
        })
    })

    it('ORMDIAG-103 insert 引擎以字串 reject(夾帶主鍵) → safe { errType: string }', async function() {
        await expectDiag({
            fail: { insert: `${SECRET_TEXT} id[${SECRET_ID}] mail=${SECRET_MAIL}` },
            run: (procOrm) => procOrm('u', 'users', 'insert', [rowSecret]),
            label: 'users.insert catch',
            safe: { errType: 'string' },
        })
    })

    it('ORMDIAG-104 del 逐筆失敗 → label users.del fail、safe { n, ks }', async function() {
        await expectDiag({
            fail: { delIds: [SECRET_ID] },
            run: (procOrm) => procOrm('u', 'users', 'del', [{ id: SECRET_ID }]),
            label: 'users.del fail',
            safe: { n: 1, ks: [0] },
        })
    })

    //寫入前被拒(主鍵含 HTML 標記): 摘要只有位置
    it('ORMDIAG-105 主鍵含 HTML 標記被拒 → label users.save id changed by clearXSS、safe { n, ks }(不含主鍵)', async function() {
        await expectDiag({
            fail: {},
            run: (procOrm) => procOrm('u', 'users', 'save', [{ id: `<script>x</script>${SECRET_ID}`, name: 'x', email: SECRET_MAIL }]),
            label: 'users.save id changed by clearXSS',
            safe: { n: 1, ks: [0] },
        })
    })

    //讀取失敗(ORM 引擎錯誤)
    it('ORMDIAG-106 select 引擎 Error → label users.select catch、safe { errType, errCode }', async function() {
        await expectDiag({
            fail: {},
            setup: (woItems) => {
                woItems.users.select = async () => Promise.reject(Object.assign(new Error(`${SECRET_TEXT} id[${SECRET_ID}] mail=${SECRET_MAIL}`), { code: 'ENOSPC' }))
            },
            run: (procOrm) => procOrm('u', 'users', 'select', {}),
            label: 'users.select catch',
            safe: { errType: 'Error', errCode: 'ENOSPC' },
        })
    })

    //被拒之查詢條件(find 為字串, 其值夾帶 email): 摘要只有固定拒收句, 條件值只在 detail
    it('ORMDIAG-107 select 條件非物件(夾帶 email) → label users.select invalid find、safe { reason: 固定句 }, 不含條件值', async function() {
        let { so, logs } = mkOrm({})
        let err = null
        let { calls } = await withConsoleSpy(async () => {
            await so.procOrm('u', 'users', 'select', SECRET_MAIL).catch((e) => {
                err = e
            })
        })
        A.ok(err !== null)
        A.equal(logs.length, 1)
        A.equal(logs[0].label, 'users.select invalid find')
        A.deepEqual(Object.keys(logs[0].safe), ['reason'])
        A.ok(typeof logs[0].safe.reason === 'string' && logs[0].safe.reason !== '')
        A.ok(!JSON.stringify(logs).includes(SECRET_MAIL), 'srLog 不得含條件值')
        A.deepEqual(calls, [])
    })

})


describe('unit-ormDiag-sites (WServOrm 站點之靜態不變式)', function() {
    this.timeout(60000)

    //walk: server 下全部 .mjs
    let walk = (fd) => {
        let out = []
        for (let e of fs.readdirSync(fd, { withFileTypes: true })) {
            let fp = path.join(fd, e.name)
            if (e.isDirectory()) {
                out.push(...walk(fp))
            }
            else if (e.name.endsWith('.mjs')) {
                out.push(fp)
            }
        }
        return out
    }
    let rel = (fp) => path.relative(projRoot, fp).split(path.sep).join('/')
    //本專案可執行碼範圍: server/ 全部、專案根之 g_*.mjs 與 srv.mjs(src/ 為前端, test/ 為測試, 不計)
    let scope = () => [...walk(path.join(projRoot, 'server')), ...fs.readdirSync(projRoot).filter((n) => /^g_.*\.mjs$/.test(n) || n === 'srv.mjs').map((n) => path.join(projRoot, n))]

    //R-ORM-DIAG-01: 生產站點(伺服器)建構 WServOrm 時帶 funLog: mkOrmFunLog(srLog), 且在 srLog 建立之後
    it('SITE-DIAG-001 server/WWebPerm.mjs 之 WServOrm 建構帶 { funLog: mkOrmFunLog(srLog) }, 於 srLogInit 之後; 自 ./ormDiag.mjs 匯入', function() {
        let ls = sourceLines(fpWWebPerm, 'code')
        let iSr = ls.find((l) => /let srLog = srLogInit\(opt\)/.test(l.text))
        let iOrm = ls.filter((l) => /\bWServOrm\(/.test(blankStrings(l.text)) && !/^import\b/.test(l.text.trim()))
        A.ok(iSr, '找不到 let srLog = srLogInit(opt)')
        A.equal(iOrm.length, 1, `server/WWebPerm.mjs 內 WServOrm( 呼叫須恰一處, 實得 ${JSON.stringify(iOrm.map((l) => l.no))}`)
        A.ok(/\bWServOrm\(ds, WOrm, url, db, \{ funLog: mkOrmFunLog\(srLog\) \}\)/.test(iOrm[0].text), `WServOrm 須帶 { funLog: mkOrmFunLog(srLog) }, 實得 :${iOrm[0].no} ${iOrm[0].text.trim()}`)
        A.ok(iSr.no < iOrm[0].no, `srLogInit(:${iSr.no}) 須早於 WServOrm(:${iOrm[0].no})`)
        A.ok(ls.some((l) => /^import \{ mkOrmFunLog \} from '\.\/ormDiag\.mjs'$/.test(l.text.trim())), '須有 import { mkOrmFunLog } from \'./ormDiag.mjs\'')
    })

    //R-ORM-DIAG-01: 站點全集——WServOrm( 之建構站點必須逐一分類: 伺服器(帶 funLog)與離線維運工具(不寫 srLog, 診斷輸出留在操作者終端機之預設安全摘要)
    it('SITE-DIAG-002 WServOrm( 站點全集: 伺服器 1 處帶 funLog; 離線工具 g_*.mjs 4 處刻意不帶(無 srLog, 終端機輸出)', function() {
        let found = {}
        for (let fp of scope()) {
            let ls = sourceLines(fp, 'code').filter((l) => /\bWServOrm\(/.test(blankStrings(l.text)) && !/^import\b/.test(l.text.trim()))
            if (ls.length > 0) {
                found[rel(fp)] = ls.map((l) => ({ withFunLog: /\bfunLog\s*:/.test(l.text) }))
            }
        }
        A.deepEqual(found, {
            'g_authRefsClean.mjs': [{ withFunLog: false }],
            'g_fixFromType.mjs': [{ withFunLog: false }],
            'g_mOrm.mjs': [{ withFunLog: false }],
            'g_purgeFrom.mjs': [{ withFunLog: false }],
            'server/WWebPerm.mjs': [{ withFunLog: true }],
        }, '新增 WServOrm( 站點須先分類(伺服器帶 funLog; 離線工具不寫 srLog)並更新本表與規則帳本 R-ORM-DIAG-01')
    })

    //R-ORM-DIAG-01: 伺服端不得以 logDetail 還原完整細節到 console(funLog 優先於 logDetail, 但給了即表示日誌可能含主鍵／錯誤原文)
    it('SITE-DIAG-003 本專案可執行碼(server／g_*／srv)不使用 logDetail', function() {
        let bad = []
        for (let fp of scope()) {
            for (let l of sourceLines(fp, 'code')) {
                if (/\blogDetail\b/.test(blankStrings(l.text))) {
                    bad.push(`${rel(fp)}:${l.no}`)
                }
            }
        }
        A.deepEqual(bad, [])
    })

    //R-ORM-DIAG-01: ormDiag.mjs 不碰 detail、不碰 console(去註解後之可執行碼)
    it('SITE-DIAG-004 server/ormDiag.mjs 可執行碼無 detail 識別字、無 console', function() {
        A.ok(fs.existsSync(fpOrmDiag), 'server/ormDiag.mjs 須存在')
        let code = sourceLines(fpOrmDiag, 'code').map((l) => blankStrings(l.text)).join('\n')
        A.ok(!/\bdetail\b/.test(code), '不得綁定或讀取 detail')
        A.ok(!/\bconsole\b/.test(code), '不得使用 console')
    })

})
