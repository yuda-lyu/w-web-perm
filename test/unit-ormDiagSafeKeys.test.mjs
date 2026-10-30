//ORM 診斷轉接器之 safeKeys 接線(b-perm of 20261030184428, 排程第 187、192 項之下游部分; 規則帳本 R-ORM-DIAG-03、R-ORM-DIAG-02; 跨套件規格〈診斷輸出與遮罩〉D1／D2／D3)
//規格句(本檔所翻譯者; 每條 assertion 之註解標明所對應之 [代號]):
//  [R1] 本套件之 funLog 為 genDiagFunLog((o) => srLog.warn(o), { safeKeys: SAFE_KEYS }).funLog(SAFE_KEYS 為 w-serv-orm 1.1.23 公開之安全鍵名單):
//       含白名單外之鍵(password、巢狀物件等)之安全摘要經它轉寫, srLog 只收到 SAFE_KEYS 內之鍵與恆保留之 errType、errCode.
//  [R2] w-serv-orm 實際產出之診斷(以本套件既有之 ORM 失敗情境觸發)經此轉接後鍵不被丟失: 與「不帶 safeKeys 之同一轉接器」逐情境比對, 兩者之 srLog 記錄全同.
//  [R3] 本套件不 import w-serv-orm 之診斷內部檔(getDiagBrief 等; 1.1.23 起 getDiagBrief.mjs 為內部檔且已刪 getUrlSecrets); 除公開入口外之深層匯入須逐一登錄(KNOWN_DEEP), 新增者判紅.
//  [R4] server/maskRaw.mjs 之秘密清單由 wsemi getDiagSecrets({ conns: [url] }) 產生(取代 w-serv-orm 之 getUrlSecrets), 判準與 w-serv-orm 同為該 wsemi 函數.
//受測: server/WWebPerm.mjs 之 WServOrm 建構行(經 test/tools/siteFunLog.mjs 取其 funLog 運算式原文重建, 非測試自寫接線)、server/maskRaw.mjs、w-serv-orm 1.1.23 之真 WServOrm＋替身資料表.
//SK-S*: 靜態不變式; SK-W*: 接線行為(R1、R2); SK-M*: 秘密清單(R4).
//跑法(需測試鎖): node C:/opensrcOper/tools/quiet-run.mjs --lock --name safekeys -- npx mocha test/unit-ormDiagSafeKeys.test.mjs --timeout 60000
import fs from 'fs'
import path from 'path'
import assert from 'assert'
import { fileURLToPath } from 'url'
import genDiagFunLog from 'wsemi/src/genDiagFunLog.mjs'
import getDiagSecrets from 'wsemi/src/getDiagSecrets.mjs'
import WServOrm from 'w-serv-orm/src/WServOrm.mjs'
import { SAFE_KEYS } from 'w-serv-orm/src/safeKeys.mjs'
import ds from '../src/schema/index.mjs'
import { getRawSecrets } from '../server/maskRaw.mjs'
import { mkTable, mkSrLog } from './tools/unitOrm.mjs'
import { sourceLines, blankStrings } from './tools/srcScan.mjs'
import { mkSiteFunLog, getSiteExpr } from './tools/siteFunLog.mjs'

const A = assert.strict
const projRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const ALWAYS = ['errType', 'errCode'] //wsemi genDiagFunLog 恆保留之鍵(不列於 SAFE_KEYS)


describe('unit-ormDiagSafeKeys-sites (靜態不變式: 公開入口與 w-serv-orm 內部檔之匯入)', function() {
    this.timeout(60000)

    //walk: 目錄下全部 .mjs／.js(略過 node_modules、_tmp)
    let walk = (fd) => {
        let out = []
        for (let e of fs.readdirSync(fd, { withFileTypes: true })) {
            let fp = path.join(fd, e.name)
            if (e.isDirectory()) {
                if (e.name !== 'node_modules' && e.name !== '_tmp') {
                    out.push(...walk(fp))
                }
            }
            else if (/\.(mjs|js)$/.test(e.name)) {
                out.push(fp)
            }
        }
        return out
    }
    let rel = (fp) => path.relative(projRoot, fp).split(path.sep).join('/')

    //deepImports: 檔案內可執行碼之 import … from 'w-serv-orm/src/<名>.mjs'(含 import 於同一行之多形態), 回傳 <名> 陣列
    let deepImports = (fp) => {
        let out = []
        for (let l of sourceLines(fp, 'code')) {
            let m = l.text.trim().match(/^import\b.*\bfrom\s+'w-serv-orm\/src\/([A-Za-z0-9_]+)\.mjs'\s*$/)
            if (m) {
                out.push(m[1])
            }
        }
        return out.sort()
    }

    //scopeProd: 本專案可執行碼(server/、src/ 之 .mjs／.js、專案根之 g_*.mjs 與 srv.mjs; src/ 之 .vue 只有註解提及, 見 SK-S2 之盤點指令)
    let scopeProd = () => [
        ...walk(path.join(projRoot, 'server')),
        ...walk(path.join(projRoot, 'src')),
        ...fs.readdirSync(projRoot).filter((n) => /^g_.*\.mjs$/.test(n) || n === 'srv.mjs').map((n) => path.join(projRoot, n)),
    ]

    //PUBLIC: w-serv-orm 對下游公開之深層匯入(其 README: WServOrm.mjs 為主入口、baseline.mjs〈純函數子模組〉、safeKeys.mjs〈公開 SAFE_KEYS〉)
    const PUBLIC = ['WServOrm', 'baseline', 'safeKeys']
    //KNOWN_DEEP: 本輪(診斷轉接)範圍外之既有深層匯入, 非診斷輸出路徑, 逐一登錄(新增者須先判定再登錄, 否則 SK-S2 判紅); 其是否宜由 w-serv-orm 公開宣告列待裁示(報告)
    const KNOWN_DEEP = {
        checkOptRemoved: 'server/WWebPerm.mjs 於 srLogInit 之後、WServOrm 之前檢查已移除之選項(WServOrm 建構亦自檢, 此處為先行檢查以便記 srLog)',
        getDb: '離線維運工具(g_backupDb.mjs、server/tools/fromTools.mjs、server/tools/authRefsClean.mjs)直接開庫備份／還原／稽核, 不經 WServOrm',
        genTestData: '離線種子工具(g_initialTestData.mjs)產製測試資料, 非伺服器路徑',
    }
    //FORBIDDEN: 診斷相關之 w-serv-orm 內部檔, 本套件任何可執行碼(含測試)不得匯入
    const FORBIDDEN = ['getDiagBrief', 'getSettings', 'getWoItems', 'getDbBackupAndRecover', 'isOrmFail']
    //RE_OLD: 已刪除之函數名(以字串拼接建構, 使本檔自身不含該識別字而被自己的掃描命中)
    const RE_OLD = new RegExp(['\\bgetUrl', 'Secrets\\b'].join(''))

    //[R3] 可執行碼之 w-serv-orm 深層匯入全集: 公開入口(PUBLIC)＋已登錄之既有匯入(KNOWN_DEEP), 其餘一律判紅
    it('SK-S1 本專案可執行碼對 w-serv-orm/src/ 之匯入全表: 只有公開入口(WServOrm、baseline、safeKeys)與已登錄之既有匯入(checkOptRemoved、getDb、genTestData)', function() {
        let found = {}
        for (let fp of scopeProd()) {
            let ns = deepImports(fp)
            if (ns.length > 0) {
                found[rel(fp)] = ns
            }
        }
        A.deepEqual(found, {
            'g_authRefsClean.mjs': ['WServOrm'],
            'g_backupDb.mjs': ['getDb'],
            'g_fixFromType.mjs': ['WServOrm'],
            'g_initialTestData.mjs': ['genTestData'],
            'g_mOrm.mjs': ['WServOrm'],
            'g_purgeFrom.mjs': ['WServOrm'],
            'server/WWebPerm.mjs': ['WServOrm', 'checkOptRemoved', 'safeKeys'].sort(),
            'server/procCore.mjs': ['baseline'],
            'server/tools/authRefsClean.mjs': ['getDb'],
            'server/tools/fromTools.mjs': ['getDb'],
            'src/js/rowDigest.mjs': ['baseline'],
        }, '新增 w-serv-orm 深層匯入須先判定: 公開入口放 PUBLIC, 既有之非診斷用途須於 KNOWN_DEEP 寫理由, 並更新本表與規則帳本 R-ORM-DIAG-03')
        let all = new Set(Object.values(found).flat())
        for (let n of all) {
            A.ok(PUBLIC.includes(n) || Object.keys(KNOWN_DEEP).includes(n), `${n} 既非公開入口亦未登錄於 KNOWN_DEEP`)
        }
        for (let n of Object.keys(KNOWN_DEEP)) {
            A.ok(all.has(n), `KNOWN_DEEP 登錄之 ${n} 已無匯入, 須自登錄移除`)
        }
    })

    //[R3] 診斷內部檔與 getUrlSecrets: 全 repo 可執行碼(server、src、g_*、srv、test)皆不得出現
    it('SK-S2 全部可執行碼(含測試)不匯入 w-serv-orm 之診斷內部檔(getDiagBrief 等), 識別字 getUrlSecrets 已無', function() {
        let files = [...scopeProd(), ...walk(path.join(projRoot, 'test'))]
        let badImport = []
        let badIdent = []
        for (let fp of files) {
            for (let n of deepImports(fp)) {
                if (FORBIDDEN.includes(n)) {
                    badImport.push(`${rel(fp)}: ${n}`)
                }
            }
            for (let l of sourceLines(fp, 'code')) {
                if (RE_OLD.test(blankStrings(l.text))) {
                    badIdent.push(`${rel(fp)}:${l.no}`)
                }
            }
        }
        A.deepEqual(badImport, [], 'w-serv-orm 之診斷內部檔不得匯入(1.1.23 起 getDiagBrief.mjs 為內部檔)')
        A.deepEqual(badIdent, [], 'getUrlSecrets 已於 w-serv-orm 1.1.23 刪除, 改 wsemi getDiagSecrets({ conns })')
    })

    //[R1] 呼叫點須帶 safeKeys: SAFE_KEYS, 且 SAFE_KEYS 自公開入口匯入
    it('SK-S3 呼叫點運算式為 genDiagFunLog((o) => srLog.warn(o), { safeKeys: SAFE_KEYS }).funLog; SAFE_KEYS 自 w-serv-orm/src/safeKeys.mjs 匯入', function() {
        A.equal(getSiteExpr(), 'genDiagFunLog((o) => srLog.warn(o), { safeKeys: SAFE_KEYS }).funLog')
        let ls = sourceLines(path.join(projRoot, 'server', 'WWebPerm.mjs'), 'code')
        A.ok(ls.some((l) => l.text.trim() === 'import { SAFE_KEYS } from \'w-serv-orm/src/safeKeys.mjs\''), 'SAFE_KEYS 須自 w-serv-orm/src/safeKeys.mjs(公開入口)匯入')
    })

    //[R1] 名單性質: 凍結之字串陣列, 無重複, 不含 __proto__ 與恆保留鍵(接線案之前提)
    it('SK-S4 SAFE_KEYS 為凍結之字串陣列, 無重複, 不含 __proto__ 與 errType／errCode', function() {
        A.ok(Array.isArray(SAFE_KEYS) && Object.isFrozen(SAFE_KEYS) && SAFE_KEYS.length > 0)
        A.ok(SAFE_KEYS.every((k) => typeof k === 'string' && k !== ''))
        A.equal(new Set(SAFE_KEYS).size, SAFE_KEYS.length)
        A.ok(!SAFE_KEYS.includes('__proto__'))
        for (let k of ALWAYS) {
            A.ok(!SAFE_KEYS.includes(k), `${k} 由 wsemi 恆保留, 不列於 SAFE_KEYS`)
        }
    })

})


describe('unit-ormDiagSafeKeys-wire (本套件之 funLog: 白名單外之鍵丟棄, 白名單內之鍵與 w-serv-orm 之實際產出不丟失)', function() {
    this.timeout(60000)

    //[R1] 含白名單外之鍵(password、token、巢狀物件)之摘要: srLog 只收 SAFE_KEYS 內之鍵與 errType、errCode
    it('SK-W1 含 password／token／巢狀物件之 safe 經本套件 funLog → srLog 只收 SAFE_KEYS 內之鍵與 errType、errCode; funLog 帶 noDetail', function() {
        let { srLog, logs } = mkSrLog()
        let funLog = mkSiteFunLog(srLog)
        A.equal(funLog.noDetail, true, '轉接器產生之 funLog 須帶 noDetail === true(w-serv-orm 見之不取細節)')
        funLog('users.save fail', { n: 1, ks: [0], password: 'P@ss-5c2e', token: 'tk-5c2e', detail: { id: 'PII-5c2e' }, nested: { a: { b: 1 } }, errType: 'Error', errCode: 'ENOSPC' })
        A.deepEqual(logs, [{ level: 'warn', event: 'orm-diag', label: 'users.save fail', safe: { n: 1, ks: [0], errType: 'Error', errCode: 'ENOSPC' } }])
        let all = JSON.stringify(logs)
        for (let s of ['P@ss-5c2e', 'tk-5c2e', 'PII-5c2e', 'password', 'token', 'nested', 'detail']) {
            A.ok(!all.includes(s), `srLog 不得含 ${s}`)
        }
    })

    //[R1][R2] 與真名單綁定: SAFE_KEYS 內每個鍵經本接線原樣通過; 白名單外之名稱一律丟棄(夾具鍵集與真名單雙向相等, w-serv-orm 新增鍵時此案判紅提醒同步)
    it('SK-W2 SAFE_KEYS 之每個鍵經本接線原樣保留, 白名單外之名稱(password、pwd、secret、email、id、url…)一律丟棄; 輸出鍵集恆為 SAFE_KEYS ∪ errType、errCode 之子集', function() {
        const FULL = { n: 3, ks: [0, 1], skipped: 1, ok: 0, type: 'Proxy', reason: 'fixed reason', msgs: ['m1'], table: 'users', tables: ['users', 'targets'], keys: ['a'], nOther: 2 }
        A.deepEqual(Object.keys(FULL).sort(), [...SAFE_KEYS].sort(), '夾具須涵蓋 w-serv-orm 公開之 SAFE_KEYS 全部鍵(雙向相等); 名單變動請同步夾具')
        const OFF = ['password', 'pwd', 'secret', 'token', 'detail', 'raw', 'email', 'id', 'url', 'conn', 'dbPassword', 'mode', 'stack', 'message', 'sub', '__proto__x']
        let { srLog, logs } = mkSrLog()
        let funLog = mkSiteFunLog(srLog)
        let safe = { ...FULL, errType: 'Error', errCode: '23505' }
        let leak = {}
        for (let k of OFF) {
            leak[k] = k === 'sub' ? { k: `LEAK-${k}` } : `LEAK-${k}`
        }
        funLog('lb', { ...leak, ...safe })
        A.equal(logs.length, 1)
        A.deepEqual(logs[0].safe, safe, '只留 SAFE_KEYS 內之鍵與 errType、errCode, 且值原樣')
        A.ok(!JSON.stringify(logs).includes('LEAK-'), '白名單外之鍵之值不得出現')
        let allowed = new Set([...SAFE_KEYS, ...ALWAYS])
        A.ok(Object.keys(logs[0].safe).every((k) => allowed.has(k)))
    })

    //[R1] 白名單內之鍵之值仍經 wsemi 之正規化(bigint、循環、長度與項數上限): 接線帶 safeKeys 不削弱正規化(取代語料 A03／A09／A10 之接線覆蓋)
    it('SK-W3 白名單內之鍵之值仍經正規化: bigint 為 (bigint)、循環為 [Circular]、字串至多 200 字元、陣列至多 20 項; 不拋錯', function() {
        let { srLog, logs } = mkSrLog()
        let funLog = mkSiteFunLog(srLog)
        let circ = { a: 1 }
        circ.self = circ
        funLog('lb', { n: 2n, ks: [1n, 2], msgs: circ, reason: 'x'.repeat(300), tables: Array.from({ length: 30 }, (_, i) => i) })
        A.equal(logs.length, 1)
        let s = logs[0].safe
        A.equal(s.n, '(bigint)')
        A.deepEqual(s.ks, ['(bigint)', 2])
        A.deepEqual(s.msgs, { a: 1, self: '[Circular]' })
        A.equal(s.reason, 'x'.repeat(200))
        //陣列至多 20 項(wsemi JSDoc); 超出部分以截斷標記字串取代(不釘標記之細節: 前 20 項原樣, 其後只可能是 '[Truncated]')
        A.deepEqual(s.tables.slice(0, 20), Array.from({ length: 20 }, (_, i) => i))
        A.ok(s.tables.length <= 21 && s.tables.slice(20).every((x) => x === '[Truncated]'), `第 20 項之後只可能是截斷標記, 實得 ${JSON.stringify(s.tables.slice(20))}`)
    })

    //[R2] w-serv-orm 實際產出(本套件既有之 ORM 失敗情境, 經真 procOrm)之診斷, 本接線與「不帶 safeKeys 之同一轉接器」之 srLog 記錄逐情境全同
    const ROW = { id: 'PII-ID-b9a1', name: 'pii name', email: 'pii.b9a1@example.com' }
    let insertRun = (p) => p('u', 'users', 'insert', [ROW])
    let setInsert = (v) => (wo) => Object.assign(wo.users, { insert: async () => v })
    const SCENARIOS = [
        { id: 'S1', why: 'save 逐筆失敗', label: 'users.save fail', keys: ['n', 'ks'], fail: { saveIds: [ROW.id] }, run: (p) => p('u', 'users', 'save', [ROW]) },
        { id: 'S2', why: 'insert 引擎 Error(ENOSPC)', label: 'users.insert catch', keys: ['errCode', 'errType'], fail: { insert: Object.assign(new Error('engine text'), { code: 'ENOSPC' }) }, run: insertRun },
        { id: 'S3', why: 'select 條件非物件', label: 'users.select invalid find', keys: ['reason'], run: (p) => p('u', 'users', 'select', 'not-an-object') },
        { id: 'S4', why: 'insert 回聚合 ok:0', label: 'users.insert fail', keys: ['ok'], setup: setInsert({ n: 1, ok: 0 }), run: insertRun },
        { id: 'S5', why: 'insert 回 Proxy(ok:0)', label: 'users.insert fail', keys: ['type'], setup: setInsert(new Proxy({ ok: 0 }, {})), run: insertRun },
        { id: 'S6', why: 'save 資料含自有 __proto__ 鍵', label: 'users.save data has unsupported key', keys: ['msgs'], run: (p) => p('u', 'users', 'save', [JSON.parse('{"id":"x1","name":"n","__proto__":{"a":1}}')]) },
        { id: 'S7', why: 'del 逐筆失敗', label: 'users.del fail', keys: ['n', 'ks'], fail: { delIds: [ROW.id] }, run: (p) => p('u', 'users', 'del', [{ id: ROW.id }]) },
    ]

    //runScenario: 真 WServOrm＋替身資料表; mk(srLog) 回傳 funLog; 回傳 { logs, err }
    let runScenario = async (sc, mk) => {
        let woItems = {}
        for (let k of Object.keys(ds)) {
            woItems[k] = mkTable([], k === 'users' ? (sc.fail || {}) : {})
        }
        function WOrmReplica(opt) {
            return woItems[opt.cl]
        }
        let { srLog, logs } = mkSrLog()
        let so = WServOrm(ds, WOrmReplica, 'replica', 'replica', { funLog: mk(srLog) })
        if (sc.setup) {
            sc.setup(woItems)
        }
        let err = null
        await sc.run(so.procOrm).catch((e) => {
            err = e
        })
        return { logs, err }
    }
    let mkBare = (srLog) => genDiagFunLog((o) => srLog.warn(o)).funLog //對照: 同一轉接器、不帶 safeKeys

    for (let sc of SCENARIOS) {
        it(`SK-W4 ${sc.id} ${sc.why} → label ${sc.label}、safe 鍵 [${sc.keys.join(', ')}]: 本接線之 srLog 記錄與不帶 safeKeys 者全同(鍵不丟失)`, async function() {
            let site = await runScenario(sc, mkSiteFunLog)
            let bare = await runScenario(sc, mkBare)
            A.ok(site.err !== null && bare.err !== null, 'ORM 失敗仍如實 reject(契約不變)')
            A.equal(bare.logs.length, 1, `對照組應恰一筆診斷, 實得 ${JSON.stringify(bare.logs)}`)
            A.equal(bare.logs[0].label, sc.label)
            A.deepEqual(Object.keys(bare.logs[0].safe).sort(), sc.keys.slice().sort(), `情境 ${sc.id} 之 w-serv-orm 實際產出鍵(未過濾)須為預期, 否則情境失效, 實得 ${JSON.stringify(bare.logs[0].safe)}`)
            A.deepEqual(site.logs, bare.logs, `帶 safeKeys 不得丟失 w-serv-orm 實際產出之鍵, 實得 ${JSON.stringify(site.logs)} 對照 ${JSON.stringify(bare.logs)}`)
            let allowed = new Set([...SAFE_KEYS, ...ALWAYS])
            for (let k of Object.keys(site.logs[0].safe)) {
                A.ok(allowed.has(k), `${k} 不在 SAFE_KEYS ∪ errType、errCode`)
            }
        })
    }

})


describe('unit-ormDiagSafeKeys-secrets (server/maskRaw.mjs 之秘密清單 = wsemi getDiagSecrets({ conns: [url] }))', function() {
    this.timeout(60000)

    const URLS = [
        'mongodb://permuser:Zx9kQ2mLp7@db.example.com:27017/wperm',
        'mongodb://u1:pw5678@h1:27017,h2:27018/db?authSource=admin&password=Qw12ErTy',
        'postgres://dbuser:pw1234@db.example.com:5432/app',
        'mssql://sa:Sq1P4ssw0rd@10.0.0.5:1433/perm',
        './db',
        'C:\\data\\permdb',
        '/var/lib/perm/db',
        '',
    ]

    //[R4] 與 wsemi 同一函數同一輸入同一結果
    it('SK-M1 getRawSecrets(url) 與 getDiagSecrets({ conns: [url] }) 結果全同(detail、reject 兩份清單), 逐形態', function() {
        for (let u of URLS) {
            A.deepEqual(getRawSecrets(u), getDiagSecrets({ conns: [u] }), `url=${JSON.stringify(u)}`)
        }
    })

    //[R4] D3 只遮憑證: 連線字串之密碼入 reject; 單獨帳號與儲存路徑不入 reject(同 w-serv-orm 對外錯誤值之判準)
    it('SK-M2 連線字串之密碼入 reject 清單、單獨帳號不入; 儲存路徑形式(./db、絕對路徑)之 reject 清單為空', function() {
        let s = getRawSecrets(URLS[0])
        A.ok(s.reject.includes('Zx9kQ2mLp7'), '密碼須入 reject')
        A.ok(s.reject.includes('permuser:Zx9kQ2mLp7'), '帳密並列須入 reject')
        A.ok(!s.reject.includes('permuser'), '單獨帳號不入 reject(只入 detail)')
        A.ok(s.detail.includes('permuser'))
        for (let u of ['./db', 'C:\\data\\permdb', '/var/lib/perm/db']) {
            A.deepEqual([...getRawSecrets(u).reject], [], `儲存路徑 ${u} 之 reject 清單須為空`)
        }
    })

    //[R4] 站點: maskRaw.mjs 之匯入與呼叫
    it('SK-M3 server/maskRaw.mjs 自 wsemi/src/getDiagSecrets.mjs 匯入 getDiagSecrets 並以 { conns: [url] } 呼叫, 不匯入 w-serv-orm 之任何檔', function() {
        let ls = sourceLines(path.join(projRoot, 'server', 'maskRaw.mjs'), 'code')
        A.ok(ls.some((l) => l.text.trim() === 'import getDiagSecrets from \'wsemi/src/getDiagSecrets.mjs\''))
        A.ok(ls.some((l) => /return getDiagSecrets\(\{ conns: \[url\] \}\)/.test(l.text)))
        A.deepEqual(ls.filter((l) => /\bw-serv-orm\b/.test(l.text)).map((l) => `:${l.no}`), [], 'maskRaw.mjs 不得匯入 w-serv-orm')
    })

})
