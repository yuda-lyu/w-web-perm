//來源欄 from 之離線維運工具之單元測試(run07 TOOLS; F-23 外部列受保護、規則帳本 R-PRINCIPLE-00 原則 5; 升版工具 g_fixFromType.mjs／g_purgeFrom.mjs).
//受測站點: src/js/fromAudit.mjs(auditFrom／planFixFromType／planPurgeFrom／applyPurgePlan／planPurgeChain)、test/tools/fromTools.mjs(runAuditFrom／runFixFromType／runPurgeFrom／checkDbNotInUse／報告)、
//          g_fixFromType.mjs、g_purgeFrom.mjs(連庫 CLI)、test/tools/dbHolder.mjs(測試輔助: 模擬後端占用資料庫).
//
//規格句(使用者裁示 run07 設計摘要 §1／§2, TOOLS 派工單):
//  S1 外部列＝from 為非空字串; ''、缺欄、非字串(null／數字／布林／物件／陣列)為後台列(判準單一擁有者 externalRows.isExternalRow).
//  S2 遷移工具把既有非字串 from 正規化為 ''(先只列); 缺欄視同 ''、不改, 只列出; 非空 from(外部列)不動; 不改變任何列是否為外部列.
//  S3 auditFrom 回報逐(表, from 值型別/值)筆數, 並標出「升版後將成為外部列(唯讀)」之(表, from)與筆數.
//  S4 planPurgeFrom: 被清除列 ＝ 該表 from 精確 === 指定值之列(不 trim、不分大小寫、不模糊); from 須為非空字串, 拒絕 ''、非字串; 對 targets／pemis／grups 以 planRefChanges 規劃同一次清理引用
//     (rowsNew ＝ 該表扣除被清除列, holdersOld 為引用端全表); 計畫有 err 則整體拒絕、零寫入; users 之清除無引用清理; 被清除列缺主鍵整體拒絕; 輸出可列 id 與名稱但不寫 srLog.
//  S5 清除後之授權＝把被清除項自引用移除之效果(以真 getUserRules 驗證); 引用端改寫列數(nDelHolders)與 AND 引用者數(nAnd)與獨立計數一致.
//  S6 g_fixFromType.mjs: 預設只列; --apply 才寫, 先備份(任一備份失敗零寫入), 寫後回讀驗證; 後端占用時拒絕; 離開碼 0／1／2 同 g_authRefsClean.
//  S7 g_purgeFrom.mjs: 預設只列(表, from) 筆數並標示外部列; --table <表|all> --from <來源> 只列將清除之列與連帶清理之引用端筆數(dry-run); 加 --apply 才寫: 先備份、先寫引用端後刪被清除列、寫後回驗;
//     all 依 targets → pemis → grups → users 逐表處理、同一備份; --from '' 一律拒絕; 不做認領; 無自動刪除之預設(--apply 須搭配 --table 與 --from).
//  S8 (R-REF-CASCADE-01 工具條文) 預設只列不改、備份失敗零寫入、失敗以非 0 離開碼表達、寫後回驗.
//
//輸入空間表(軸 × 格數; 已測／刻意不測):
//  A from 值(18 格: ''、缺欄、null、0、5、NaN、true、false、{}、{a:1}、[]、['x']、'pd'、' pd'、'PD'、' '、'__proto__'、'中文來源'; 另 own undefined／bigint／function 歸 missing／other) × B 表(4) = 72 格 → FA-001 全測
//  C 列形狀(非物件 null／5／'x'、id 缺／''／數字／特殊名) → FA-003、FA-010、FA-012; 輸入形狀(undefined／null／數字／字串／陣列／缺表) → FA-003
//  D planPurgeFrom 表(4 + 非法 8 值) × E from 引數(合法、'' 、非字串 8 值、前後空白、大小寫變體、相近但不同、全空白) → FA-020、FA-021
//  F 被清除母體(0／1／多筆、他表之同名、非字串／缺欄／'' 之列不得命中) → FA-021、FA-022
//  G 引用端容器形狀(物件／陣列 × 啟用／停用 × mode OR／AND／缺／非法 = 16 格; 無名元素、壞 JSON、空字串、缺欄、無 id、Infinity／NaN unsafe) → FA-023、FA-025
//  H 歷史同名存續列(0／1) × 引用者(0／1) → FA-024; 被清除列缺主鍵(''／缺／數字) → FA-026; 原型鍵名與特殊字元 id(7 種) → FA-029
//  I 引用端自身 from(後台／外部／非字串) → nExternal → FA-022、FA-023
//  J 隨機宇宙(固定種子 2000 組 × 表子集 5 種) 對獨立參考模型與真 getUserRules → FA-050
//  K runner(ORM 替身): 預設只列／apply／備份失敗(db／rows／已存在檔)／稽核後被改動／save 與 del 逐筆失敗(5 形)／寫後驗證不符／無須處理／參數與 woItems 檢查／冪等／部分失敗後重跑 → FA-060～FA-080
//  L 真 lmdb 臨時庫 CLI: 兩腳本 × (預設／dry-run／apply／備份失敗／資料庫不存在／參數錯誤／預設連線／規劃被拒／備份檔指向資料庫檔／後端占用) → FA-100～FA-125
//  M 刻意不測／已知限制: 非 Windows 之占用偵測(僅 Windows 實測; 其他平台回 checked:false 之分支以單元斷言覆蓋); 占用偵測改回資料夾名稱失敗之拋錯分支(無法在不破壞環境下模擬);
//     真 lmdb 寫入中途失敗(以 ORM 替身逐點注入覆蓋); 超大表之效能(L4 不適用: 離線一次性工具)
//測試組成: FA-001～004 auditFrom; FA-010～012 planFixFromType; FA-020～031 planPurgeFrom; FA-040～042 applyPurgePlan／planPurgeChain; FA-050 語意不變式; FA-060～066 runFixFromType; FA-070～082 runPurgeFrom／報告;
//          FA-090～094 checkDbNotInUse; FA-100～125 CLI(真 lmdb); FA-190～193 站點不變式.
//站點全集(規則帳本盤點指令): rg -n "fromAudit|fromTools|g_fixFromType|g_purgeFrom|dbHolder" src test g_*.mjs --glob '!tmp/**'
//跑法: node node_modules/mocha/bin/mocha.js test/unit-fromAudit.test.mjs --timeout 180000
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { spawn, spawnSync } from 'child_process'
import { fileURLToPath } from 'url'
import WOrm from 'w-orm-lmdb/src/WOrmLmdb.mjs'
import WServOrm from 'w-serv-orm/src/WServOrm.mjs'
import ds from '../src/schema/index.mjs'
import auditRefs from '../src/js/refAudit.mjs'
import { isExternalRow } from '../src/js/externalRows.mjs'
import { getDelImpact } from '../src/js/getDelRefCount.mjs'
import { TABLE_ORDER, auditFrom, planFixFromType, planPurgeFrom, applyPurgePlan, planPurgeChain } from '../src/js/fromAudit.mjs'
import { getUserRules } from '../src/plugins/mShare.mjs'
import { checkDbNotInUse, formatFixReport, formatFromAudit, formatPurgeReport, runAuditFrom, runFixFromType, runPurgeFrom } from './tools/fromTools.mjs'
import { mkTable } from './tools/unitOrm.mjs'


const projRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const TOOL_FIX = path.join(projRoot, 'g_fixFromType.mjs')
const TOOL_PURGE = path.join(projRoot, 'g_purgeFrom.mjs')
const HOLDER = path.join(projRoot, 'test', 'tools', 'dbHolder.mjs')
const TMP = path.join(projRoot, 'test', '_tmp', 'fromAudit')
const DB_NAME = 'wperm' //同 g_getSettings.mjs
const TABLES = ['users', 'grups', 'pemis', 'targets']


// ---------------------------------------------------------------
// helpers
// ---------------------------------------------------------------

//授權字串之逐字產生器(與 JSON.stringify 之輸出同形): rule 為 crules(物件形式值為 'y'／'n' 字串, 無 mode)
let mkObj = (es, rule = false) => `{${es.map((e) => (rule ? `"${e.name}":"${e.active}"` : `"${e.name}":{${e.mode === undefined ? '' : `"mode":"${e.mode}",`}"isActive":"${e.active}"}`)).join(',')}}`
let mkArr = (es, rule = false) => `[${es.map((e) => `{"name":"${e.name}",${(rule || e.mode === undefined) ? '' : `"mode":"${e.mode}",`}"isActive":"${e.active}"}`).join(',')}]`
let E = (name, mode, active = 'y') => ({ name, mode, active })
//任意名稱(含 __proto__／constructor／特殊字元)之物件形式授權字串(名稱以 JSON.stringify 編碼)
let objStr = (names, mode = 'OR') => `{${names.map((n) => `${JSON.stringify(n)}:{"mode":"${mode}","isActive":"y"}`).join(',')}}`

let clone = (o) => structuredClone(o)
let deepFreeze = (o) => {
    if (o !== null && typeof o === 'object' && !Object.isFrozen(o)) {
        Object.freeze(o)
        Object.keys(o).forEach((k) => deepFreeze(o[k]))
    }
    return o
}
let quiet = (f) => {
    let log = console.log
    console.log = () => {}
    try {
        return f()
    }
    finally {
        console.log = log
    }
}
let mkRng = (seed) => {
    let a = seed >>> 0
    return () => {
        a = (a + 0x6D2B79F5) >>> 0
        let t = a
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}
let byId = (rows) => rows.slice().sort((a, b) => String(a.id).localeCompare(String(b.id)))

//標準宇宙(來源 X 在四表各有 1 列; 來源 Y 為另一來源; 後台列、缺欄、null 各有): 逐字可預期之引用字串
let stdFx = () => ({
    targets: [{ id: 'T1', from: '' }, { id: 'T2', from: 'X' }, { id: 'T3', from: 'Y' }],
    pemis: [
        { id: 'p1', name: 'P1', from: '', crules: mkObj([{ name: 'T1', active: 'y' }, { name: 'T2', active: 'y' }], true) },
        { id: 'p2', name: 'P2', from: 'X', crules: mkObj([{ name: 'T2', active: 'y' }, { name: 'T3', active: 'y' }], true) },
        { id: 'p3', name: 'P3', from: 'Y', crules: mkArr([{ name: 'T2', active: 'y' }, { name: 'T3', active: 'y' }], true) },
    ],
    grups: [
        { id: 'g1', name: 'G1', from: '', cpemis: mkObj([E('P1', 'OR'), E('P2', 'AND')]) },
        { id: 'g2', name: 'G2', from: 'X', cpemis: mkObj([E('P2', 'OR')]) },
        { id: 'g3', name: 'G3', from: 'Y', cpemis: mkArr([E('P1', 'OR', 'n'), E('P2', 'OR')]) },
    ],
    users: [
        { id: 'u1', name: 'NAME-u1-zzq', email: 'secret-u1@x.com', from: '', isAdmin: 'y', cgrups: mkObj([E('G1', 'OR'), E('G2', 'AND')]) },
        { id: 'u2', name: 'NAME-u2-zzq', email: 'secret-u2@x.com', from: 'X', cgrups: mkObj([E('G2', 'OR')]) },
        { id: 'u3', name: 'NAME-u3-zzq', email: 'secret-u3@x.com', from: 'Y', cgrups: mkArr([E('G1', 'OR'), E('G2', 'AND', 'n')]) },
        { id: 'u4', name: 'NAME-u4-zzq', email: 'secret-u4@x.com', from: null, cgrups: '{}' },
        { id: 'u5', name: 'NAME-u5-zzq', email: 'secret-u5@x.com', cgrups: '' },
    ],
})
//標準宇宙之「清除 from=X(四表)」預期結果(逐字手算)
let stdAfterAllX = () => ({
    targets: [{ id: 'T1', from: '' }, { id: 'T3', from: 'Y' }],
    pemis: [
        { id: 'p1', name: 'P1', from: '', crules: mkObj([{ name: 'T1', active: 'y' }], true) },
        { id: 'p3', name: 'P3', from: 'Y', crules: mkArr([{ name: 'T3', active: 'y' }], true) },
    ],
    grups: [
        { id: 'g1', name: 'G1', from: '', cpemis: mkObj([E('P1', 'OR')]) },
        { id: 'g3', name: 'G3', from: 'Y', cpemis: mkArr([E('P1', 'OR', 'n')]) },
    ],
    users: [
        { id: 'u1', name: 'NAME-u1-zzq', email: 'secret-u1@x.com', from: '', isAdmin: 'y', cgrups: mkObj([E('G1', 'OR')]) },
        { id: 'u3', name: 'NAME-u3-zzq', email: 'secret-u3@x.com', from: 'Y', cgrups: mkArr([E('G1', 'OR')]) },
        { id: 'u4', name: 'NAME-u4-zzq', email: 'secret-u4@x.com', from: null, cgrups: '{}' },
        { id: 'u5', name: 'NAME-u5-zzq', email: 'secret-u5@x.com', cgrups: '' },
    ],
})

//型別正規化用資料(各型別非字串 from 各表皆有; 含個資供「不回顯」斷言): 待改共 7 列(users 2、grups 3、pemis 1、targets 1)
let fixFx = () => ({
    targets: [{ id: 'T1', from: '' }, { id: 'T2', from: false }],
    pemis: [{ id: 'p1', name: 'P1', from: 'X', crules: '{}' }, { id: 'p2', name: 'P2', from: null, crules: '{}' }],
    grups: [
        { id: 'g1', name: 'G1', from: true, order: 1, cpemis: '{}', timeUpdate: '2026-02-01 00:00:00', userIdUpdate: 'adm' },
        { id: 'g2', name: 'G2', from: { a: 1 }, order: 2, cpemis: '{}' },
        { id: 'g3', name: 'G3', from: [1, 2], order: 3, cpemis: '{}' },
    ],
    users: [
        { id: 'u1', name: 'NAME-u1-zzq', email: 'secret-u1@x.com', from: null, cgrups: '{}', timeUpdate: '2026-01-01 00:00:00', userIdUpdate: 'adm' },
        { id: 'u2', name: 'NAME-u2-zzq', email: 'secret-u2@x.com', from: 5, cgrups: '{}', timeUpdate: '2026-01-02 00:00:00', userIdUpdate: 'adm' },
        { id: 'u3', name: 'NAME-u3-zzq', email: 'secret-u3@x.com', from: 'pd', cgrups: '{}' },
        { id: 'u4', name: 'NAME-u4-zzq', email: 'secret-u4@x.com', from: '', cgrups: '{}' },
        { id: 'u5', name: 'NAME-u5-zzq', email: 'secret-u5@x.com', cgrups: '{}' },
    ],
})
let fixAfter = (d) => {
    let o = clone(d)
    for (let t of TABLES) {
        o[t] = o[t].map((r) => (r.from !== undefined && typeof r.from !== 'string' ? { ...r, from: '' } : r))
    }
    return o
}

//ORM 替身(同 unit-refAudit)
let mkWo = (d, fails = {}) => {
    let wo = {}
    for (let t of TABLES) {
        wo[t] = mkTable(d[t], fails[t] || {})
    }
    return wo
}
let snap = (wo) => Object.fromEntries(TABLES.map((t) => [t, wo[t].snapshot()]))
let snapOf = (d) => Object.fromEntries(TABLES.map((t) => [t, mkTable(d[t]).snapshot()]))
let cntOf = (wo) => TABLES.reduce((a, t) => a + wo[t].cnt.insert + wo[t].cnt.save + wo[t].cnt.del + wo[t].cnt.delAll, 0)
let mkLog = () => {
    let logs = []
    return { logs, log: (s) => logs.push(String(s)) }
}
//事件記錄: 包裝各表 save／del, 記錄順序與當時之備份檔是否已存在
let spyWo = (wo, fp) => {
    let ev = []
    for (let t of TABLES) {
        let s0 = wo[t].save
        let d0 = wo[t].del
        wo[t].save = async (d, o) => {
            ev.push({ op: `save:${t}`, bk: fp ? fs.existsSync(fp) : null, opt: o, items: d })
            return s0(d, o)
        }
        wo[t].del = async (d) => {
            ev.push({ op: `del:${t}`, bk: fp ? fs.existsSync(fp) : null })
            return d0(d)
        }
    }
    return ev
}

//evalAll: 各使用者之 { grups 名稱, 各管控對象 isActive }(同 unit-refAudit; 對損壞字串之 console.log 靜音)
let evalAll = (d) => Object.fromEntries(d.users.map((u) => {
    let r = quiet(() => getUserRules(clone(u), clone(d.grups), clone(d.pemis), clone(d.targets)))
    return [u.id, { grups: r.grups.map((g) => g.name).join('|'), rules: r.rules.map((x) => `${x.name}=${x.isActive}`).join(',') }]
}))
let rulesOf = (e) => Object.fromEntries(e.rules.split(',').filter((s) => s !== '').map((s) => s.split('=')))


describe('unit-fromAudit (來源欄 from 之稽核、型別正規化與整來源清除)', function() {

    before(function() {
        fs.rmSync(TMP, { recursive: true, force: true })
        fs.mkdirSync(TMP, { recursive: true })
    })

    after(function() {
        fs.rmSync(TMP, { recursive: true, force: true })
        try {
            if (fs.readdirSync(path.dirname(TMP)).length === 0) {
                fs.rmdirSync(path.dirname(TMP))
            }
        }
        catch (err) {}
    })


    // ---------------------------------------------------------------
    // auditFrom
    // ---------------------------------------------------------------

    describe('auditFrom(純函數)', function() {

        //[kind, from 值(undefined 表缺欄)]
        const CELLS = [
            ['empty', ''], ['missing', undefined], ['null', null], ['number', 0], ['number', 5], ['number', NaN],
            ['boolean', true], ['boolean', false], ['object', {}], ['object', { a: 1 }], ['array', []], ['array', ['x']],
            ['string', 'pd'], ['string', ' pd'], ['string', 'PD'], ['string', ' '], ['string', '__proto__'], ['string', '中文來源'],
        ]
        let mkRow = (id, v) => (v === undefined ? { id } : { id, from: v })

        it('FA-001 from 值(18 格) × 表(4)全格: 各格 2 列, entries／external／counts 逐項吻合(S3), 不改輸入', function() {
            let n = 0
            for (let t of TABLE_ORDER) {
                for (let [kind, v] of CELLS) {
                    let d = deepFreeze({ [t]: [mkRow('a', v), mkRow('b', v)] })
                    let r = auditFrom(d)
                    let label = `${t} ${kind} ${String(v)}`
                    let exp = kind === 'string' ? { table: t, kind, from: v, n: 2 } : { table: t, kind, n: 2 }
                    assert.deepStrictEqual(r.entries, [exp], label)
                    assert.deepStrictEqual(r.external, kind === 'string' ? [{ table: t, from: v, n: 2 }] : [], label)
                    let c = r.counts
                    assert.strictEqual(c.nRows, 2, label)
                    assert.strictEqual(c.nExternal, kind === 'string' ? 2 : 0, label)
                    assert.strictEqual(c.nEmpty, kind === 'empty' ? 2 : 0, label)
                    assert.strictEqual(c.nMissing, kind === 'missing' ? 2 : 0, label)
                    assert.strictEqual(c.nNonString, ['null', 'number', 'boolean', 'object', 'array'].includes(kind) ? 2 : 0, label)
                    assert.strictEqual(c.byTable[t].nRows, 2, label)
                    for (let t2 of TABLE_ORDER.filter((x) => x !== t)) {
                        assert.strictEqual(c.byTable[t2].nRows, 0, `${label}: 他表 ${t2} 為空`)
                    }
                    if (['null', 'number', 'boolean', 'object', 'array'].includes(kind)) {
                        assert.strictEqual(c.byTable[t].kinds[kind], 2, label)
                    }
                    n++
                }
            }
            assert.strictEqual(n, 72)
        })

        it('FA-001b 另三種型別: own undefined 視同缺欄; bigint／function 歸 other(非字串)', function() {
            let r = auditFrom({ users: [{ id: 'a', from: undefined }, { id: 'b', from: 10n }, { id: 'c', from: () => 1 }, { id: 'd', from: Symbol('s') }] })
            assert.deepStrictEqual(r.entries, [
                { table: 'users', kind: 'missing', n: 1 },
                { table: 'users', kind: 'other', n: 3 },
            ])
            assert.strictEqual(r.counts.nNonString, 3)
            assert.strictEqual(r.counts.byTable.users.kinds.other, 3)
        })

        it('FA-002 非空字串依值精確分組(不 trim、不分大小寫): pd／ pd／PD／pd ／__proto__／constructor／中文各自獨立; 升冪確定性排序; 同值跨表分表計', function() {
            let users = [
                ...['pd', 'pd', ' pd', 'PD', 'pd ', '__proto__', 'constructor', '中文來源', '中文來源', ' '].map((f, i) => ({ id: `u${i}`, from: f })),
            ]
            let grups = [{ id: 'g1', name: 'A', from: 'pd' }, { id: 'g2', name: 'B', from: 'pd' }]
            let r = auditFrom(deepFreeze({ users, grups }))
            let strs = r.entries.filter((x) => x.kind === 'string').map((x) => `${x.table}|${JSON.stringify(x.from)}|${x.n}`)
            assert.deepStrictEqual(strs, [
                'grups|"pd"|2',
                'users|" "|1', 'users|" pd"|1', 'users|"PD"|1', 'users|"__proto__"|1', 'users|"constructor"|1', 'users|"pd"|2', 'users|"pd "|1', 'users|"中文來源"|2',
            ])
            assert.deepStrictEqual(r.external.map((x) => `${x.table}|${x.from}|${x.n}`), [
                'grups|pd|2', 'users| |1', 'users| pd|1', 'users|PD|1', 'users|__proto__|1', 'users|constructor|1', 'users|pd|2', 'users|pd |1', 'users|中文來源|2',
            ])
            assert.strictEqual(r.counts.nExternal, 12)
            assert.strictEqual(r.counts.nSources, 9)
            assert.strictEqual(r.counts.byTable.users.nSources, 8)
            assert.strictEqual(({}).pd, undefined, '原型未被污染')
        })

        it('FA-003 輸入形狀: 非物件列記 notObject; 缺表／非陣列表／非物件輸入不拋、視為空', function() {
            let r = auditFrom({ users: [null, 5, 'x', { id: 'a', from: '' }] })
            assert.deepStrictEqual(r.entries, [{ table: 'users', kind: 'empty', n: 1 }, { table: 'users', kind: 'notObject', n: 3 }])
            assert.strictEqual(r.counts.nNotObject, 3)
            assert.strictEqual(r.counts.nRows, 4)
            for (let bad of [undefined, null, 5, 'x', [], {}, { users: 5, grups: 'x', pemis: null, targets: {} }]) {
                let z = auditFrom(bad)
                assert.deepStrictEqual(z.entries, [])
                assert.deepStrictEqual(z.external, [])
                assert.strictEqual(z.counts.nRows, 0)
            }
        })

        it('FA-004 與 isExternalRow 互驗(隨機列 3000 筆 × 4 表): external 筆數＝isExternalRow 為真者; 非字串／缺欄／空字串筆數與獨立計數相等; 各項加總＝列數', function() {
            let rng = mkRng(4)
            let pool = ['', undefined, null, 0, 5, true, false, {}, [], 'pd', ' pd', 'PD', ' ', 'X', '__proto__', 'a b']
            let d = {}
            for (let t of TABLE_ORDER) {
                d[t] = []
                for (let i = 0; i < 750; i++) {
                    let v = pool[Math.floor(rng() * pool.length)]
                    d[t].push(v === undefined ? { id: `${t}${i}` } : { id: `${t}${i}`, from: v })
                }
            }
            let r = auditFrom(d)
            for (let t of TABLE_ORDER) {
                let b = r.counts.byTable[t]
                assert.strictEqual(b.nExternal, d[t].filter(isExternalRow).length, `${t} 外部列`)
                assert.strictEqual(b.nEmpty, d[t].filter((x) => x.from === '').length, `${t} 空字串`)
                assert.strictEqual(b.nMissing, d[t].filter((x) => x.from === undefined).length, `${t} 缺欄`)
                assert.strictEqual(b.nNonString, d[t].filter((x) => x.from !== undefined && typeof x.from !== 'string').length, `${t} 非字串`)
                assert.strictEqual(b.nExternal + b.nEmpty + b.nMissing + b.nNonString + b.nNotObject, b.nRows, `${t} 加總`)
            }
            assert.strictEqual(r.external.reduce((a, x) => a + x.n, 0), r.counts.nExternal)
        })

    })


    // ---------------------------------------------------------------
    // planFixFromType
    // ---------------------------------------------------------------

    describe('planFixFromType(純函數)', function() {

        it('FA-010 非字串 from(null／數字／布林／物件／陣列)→ 待改為 \'\'(before 為原值); \'\'／非空字串／缺欄不改; 缺欄只列 id; 缺主鍵者列 noId; 計數逐項(S2)', function() {
            let rows = deepFreeze([
                { id: 'a', from: null }, { id: 'b', from: 5 }, { id: 'c', from: true }, { id: 'd', from: { x: 1 } }, { id: 'e', from: [1] },
                { id: 'f', from: '' }, { id: 'g' }, { id: 'h', from: 'pd' },
                { id: '', from: null }, { from: null }, { id: 5, from: null }, null, 5, 'x',
            ])
            let r = planFixFromType(rows)
            assert.deepStrictEqual(r.changes, [
                { id: 'a', kind: 'null', before: null, after: '' },
                { id: 'b', kind: 'number', before: 5, after: '' },
                { id: 'c', kind: 'boolean', before: true, after: '' },
                { id: 'd', kind: 'object', before: { x: 1 }, after: '' },
                { id: 'e', kind: 'array', before: [1], after: '' },
            ])
            assert.deepStrictEqual(r.missing, ['g'])
            assert.deepStrictEqual(r.noId, [{ idx: 8, kind: 'null' }, { idx: 9, kind: 'null' }, { idx: 10, kind: 'null' }])
            assert.deepStrictEqual(r.counts, {
                nRows: 14,
                nEmpty: 1,
                nMissing: 1,
                nNonString: 8,
                nExternal: 1,
                nNotObject: 3,
                nNoId: 3,
                kinds: { null: 4, number: 1, boolean: 1, object: 1, array: 1, other: 0 },
            })
        })

        it('FA-010b 非字串全型別格(含 NaN、false、0、空物件、空陣列、own undefined 視為缺欄): 各格各自正規化或不動', function() {
            let cells = [
                [{ from: null }, true], [{ from: 0 }, true], [{ from: NaN }, true], [{ from: false }, true], [{ from: {} }, true], [{ from: [] }, true],
                [{ from: '' }, false], [{ from: 'pd' }, false], [{}, false], [{ from: undefined }, false],
            ]
            for (let [part, fixed] of cells) {
                let r = planFixFromType([{ id: 'x', ...part }])
                assert.strictEqual(r.changes.length, fixed ? 1 : 0, JSON.stringify(part))
            }
        })

        it('FA-011 冪等與不變式: 套用 changes 後再規劃為 0; 外部列集合與其 from 逐值不變(不改變任何列是否為外部列); 其餘列逐位元不變', function() {
            let d = fixFx()
            for (let t of TABLE_ORDER) {
                let r = planFixFromType(deepFreeze(clone(d[t])))
                let m = new Map(r.changes.map((c) => [c.id, c]))
                let after = d[t].map((x) => (m.has(x.id) ? { ...x, from: m.get(x.id).after } : x))
                assert.strictEqual(planFixFromType(after).changes.length, 0, `${t} 再規劃`)
                assert.deepStrictEqual(after.filter(isExternalRow).map((x) => [x.id, x.from]), d[t].filter(isExternalRow).map((x) => [x.id, x.from]), `${t} 外部列集合不變`)
                d[t].forEach((x, i) => {
                    if (!m.has(x.id)) {
                        assert.deepStrictEqual(after[i], x, `${t} ${x.id} 不得被改`)
                    }
                })
            }
        })

        it('FA-012 特殊 id(__proto__／constructor／空白／中文／引號／反斜線)原樣; before 為原值參考; 輸入非陣列視為空', function() {
            let ids = ['__proto__', 'constructor', 'a b', '中文', 'q\'x', 'a\\b', 'toString']
            let o = { k: 1 }
            let rows = deepFreeze(ids.map((id) => ({ id, from: o })))
            let r = planFixFromType(rows)
            assert.deepStrictEqual(r.changes.map((c) => c.id), ids)
            assert.ok(r.changes.every((c) => c.before === o && c.after === ''))
            for (let bad of [undefined, null, 5, 'x', {}]) {
                assert.deepStrictEqual(planFixFromType(bad).changes, [])
            }
        })

    })


    // ---------------------------------------------------------------
    // planPurgeFrom
    // ---------------------------------------------------------------

    describe('planPurgeFrom(純函數)', function() {

        it('FA-020 拒絕: 非法表名(8 值)→ invalidTable; from 為 \'\'／非字串(9 值)→ invalidFrom; 皆零清除、零改寫(S4)', function() {
            let tables = deepFreeze(stdFx())
            for (let t of [undefined, null, '', 'all', 'user', '__proto__', 'constructor', 5]) {
                let r = planPurgeFrom({ keyTable: t, from: 'X', tables })
                assert.strictEqual(r.err, 'invalidTable', String(t))
                assert.strictEqual(r.nRows, 0)
                assert.deepStrictEqual(r.changes, [])
            }
            for (let f of ['', undefined, null, 5, true, {}, [], ['X'], 0]) {
                for (let t of TABLE_ORDER) {
                    let r = planPurgeFrom({ keyTable: t, from: f, tables })
                    assert.strictEqual(r.err, 'invalidFrom', `${t} ${JSON.stringify(f)}`)
                    assert.strictEqual(r.nRows, 0)
                    assert.deepStrictEqual(r.rows, [])
                    assert.deepStrictEqual(r.changes, [])
                }
            }
            for (let bad of [undefined, null, 5, 'x']) {
                assert.strictEqual(planPurgeFrom(bad).err, 'invalidTable')
            }
        })

        it('FA-021 精確 ===: 只命中 from 與指定值逐字相同者; PD／ pd／pd ／pdx 不命中(列入 similar 僅提示); 非字串／缺欄／\'\' 之列永不命中; \'0\' 不命中數字 0; 全空白值只命中全空白', function() {
            let rows = (extra) => [
                { id: 'a', from: 'pd' }, { id: 'b', from: 'PD' }, { id: 'c', from: ' pd' }, { id: 'd', from: 'pd ' }, { id: 'e', from: 'pdx' }, { id: 'f', from: 'p' },
                { id: 'g', from: '' }, { id: 'h' }, { id: 'i', from: null }, { id: 'j', from: 0 }, { id: 'k', from: true }, { id: 'l', from: { pd: 1 } }, { id: 'm', from: ['pd'] },
                { id: 'n', from: ' ' }, { id: 'o', from: 'pd' }, ...(extra || []),
            ]
            for (let t of TABLE_ORDER) {
                let tables = deepFreeze({ [t]: rows([{ id: 'p', from: '0' }]) })
                let r = planPurgeFrom({ keyTable: t, from: 'pd', tables })
                assert.strictEqual(r.err, null, t)
                assert.deepStrictEqual(r.delIds, ['a', 'o'], t)
                assert.strictEqual(r.nRows, 2)
                assert.deepStrictEqual(r.similar, [{ from: ' pd', n: 1 }, { from: 'PD', n: 1 }, { from: 'pd ', n: 1 }], `${t}: 相近但不同者僅提示, 不含 pdx／p`)
                assert.deepStrictEqual(planPurgeFrom({ keyTable: t, from: '0', tables }).delIds, ['p'], `${t}: '0' 不命中數字 0`)
                assert.deepStrictEqual(planPurgeFrom({ keyTable: t, from: ' ', tables }).delIds, ['n'], `${t}: 全空白只命中全空白`)
                assert.deepStrictEqual(planPurgeFrom({ keyTable: t, from: 'PD', tables }).delIds, ['b'])
                assert.deepStrictEqual(planPurgeFrom({ keyTable: t, from: 'nope', tables }).delIds, [])
            }
        })

        it('FA-022 四表逐表(標準宇宙 from=X): 被清除列、引用端改寫逐字、筆數(nHolders／nDelHolders／nExternal／nAnd)、不改輸入', function() {
            let tables = deepFreeze(stdFx())

            //targets: T2 被引用於 p1(後台)、p2(X)、p3(Y; 陣列形式)
            let a = planPurgeFrom({ keyTable: 'targets', from: 'X', tables })
            assert.strictEqual(a.err, null)
            assert.deepStrictEqual(a.rows, [{ id: 'T2', name: 'T2' }])
            assert.deepStrictEqual(a.delIds, ['T2'])
            assert.strictEqual(a.holder, 'pemis')
            assert.strictEqual(a.field, 'crules')
            assert.deepStrictEqual(a.delNames, ['T2'])
            assert.deepStrictEqual(a.changes.map((c) => [c.id, c.after, c.from, c.nDel]), [
                ['p1', mkObj([{ name: 'T1', active: 'y' }], true), '', 1],
                ['p2', mkObj([{ name: 'T3', active: 'y' }], true), 'X', 1],
                ['p3', mkArr([{ name: 'T3', active: 'y' }], true), 'Y', 1],
            ])
            assert.deepStrictEqual([a.nHolders, a.nDelHolders, a.nExternal], [3, 3, 2])
            assert.deepStrictEqual(a.impact, { nRefs: 3, nAnd: 0, nWiden: 0 })

            //pemis: P2 被引用於 g1(AND)、g2(OR)、g3(陣列, OR)
            let b = planPurgeFrom({ keyTable: 'pemis', from: 'X', tables })
            assert.deepStrictEqual(b.rows, [{ id: 'p2', name: 'P2' }])
            assert.strictEqual(b.holder, 'grups')
            assert.strictEqual(b.field, 'cpemis')
            assert.deepStrictEqual(b.changes.map((c) => [c.id, c.after]), [
                ['g1', mkObj([E('P1', 'OR')])],
                ['g2', '{}'],
                ['g3', mkArr([E('P1', 'OR', 'n')])],
            ])
            assert.deepStrictEqual([b.nHolders, b.nDelHolders, b.nExternal], [3, 3, 2])
            assert.deepStrictEqual(b.impact, { nRefs: 3, nAnd: 1, nWiden: 0 })

            //grups: G2 被引用於 u1(AND 啟用)、u2(OR)、u3(AND 停用; 陣列)
            let c = planPurgeFrom({ keyTable: 'grups', from: 'X', tables })
            assert.deepStrictEqual(c.rows, [{ id: 'g2', name: 'G2' }])
            assert.strictEqual(c.holder, 'users')
            assert.strictEqual(c.field, 'cgrups')
            assert.deepStrictEqual(c.changes.map((x) => [x.id, x.after]), [
                ['u1', mkObj([E('G1', 'OR')])],
                ['u2', '{}'],
                ['u3', mkArr([E('G1', 'OR')])],
            ])
            assert.deepStrictEqual([c.nHolders, c.nDelHolders, c.nExternal], [3, 3, 2])
            assert.deepStrictEqual(c.impact, { nRefs: 3, nAnd: 1, nWiden: 0 }, 'u3 之 AND 為停用項不計')

            //users: 無引用端; 不輸出姓名／email; Y 來源
            let u = planPurgeFrom({ keyTable: 'users', from: 'X', tables })
            assert.deepStrictEqual(u.rows, [{ id: 'u2' }])
            assert.strictEqual(u.holder, '')
            assert.deepStrictEqual(u.changes, [])
            assert.deepStrictEqual(u.impact, { nRefs: 0, nAnd: 0, nWiden: 0 })
            assert.ok(!JSON.stringify(u).includes('secret-') && !JSON.stringify(u).includes('NAME-'), '計畫不含 email／姓名')
            assert.deepStrictEqual(planPurgeFrom({ keyTable: 'users', from: 'Y', tables }).delIds, ['u3'])
        })

        it('FA-023 引用端容器形狀 16 格(物件／陣列 × 啟用／停用 × mode OR／AND／缺／非法): 只移除被清除項, 其餘逐字; nAnd 只計「啟用且有效模式為 AND」(缺／非法視為 AND)', function() {
            let n = 0
            for (let form of ['obj', 'arr']) {
                for (let active of ['y', 'n']) {
                    for (let mode of ['OR', 'AND', undefined, 'xor']) {
                        let mk = form === 'obj' ? mkObj : mkArr
                        let str = mk([E('KEEP', 'OR'), E('GX', mode, active)])
                        let tables = deepFreeze({ grups: [{ id: 'gk', name: 'KEEP', from: '' }, { id: 'gx', name: 'GX', from: 'X' }], users: [{ id: 'h', from: '', cgrups: str }] })
                        let r = planPurgeFrom({ keyTable: 'grups', from: 'X', tables })
                        let label = `${form} active=${active} mode=${mode}`
                        assert.deepStrictEqual(r.changes, [{ id: 'h', field: 'cgrups', before: str, after: mk([E('KEEP', 'OR')]), nRename: 0, nDel: 1, from: '' }], label)
                        assert.deepStrictEqual(r.impact, { nRefs: 1, nAnd: (active === 'y' && mode !== 'OR') ? 1 : 0, nWiden: 0 }, label)
                        n++
                    }
                }
            }
            assert.strictEqual(n, 16)
        })

        it('FA-023b 其餘形狀: 無名元素與非物件元素原樣; 壞 JSON／空字串／空白／缺欄／純量之引用端不改; 缺字串主鍵之引用端不納入; 引用端 from 為非字串不計外部', function() {
            let un = '[{"mode":"AND","isActive":"y"},{"name":"GX","mode":"AND","isActive":"y"},{"name":5,"mode":"OR","isActive":"y"},"x"]'
            let tables = deepFreeze({
                grups: [{ id: 'gx', name: 'GX', from: 'X' }],
                users: [
                    { id: 'h1', from: '', cgrups: un },
                    { id: 'h2', cgrups: '{oops' }, { id: 'h3', cgrups: '' }, { id: 'h4', cgrups: '   ' }, { id: 'h5' }, { id: 'h6', cgrups: '5' }, { id: 'h7', cgrups: 'null' },
                    { cgrups: mkObj([E('GX', 'AND')]) }, { id: 9, cgrups: mkObj([E('GX', 'AND')]) },
                    { id: 'h8', from: null, cgrups: mkObj([E('GX', 'OR')]) },
                ],
            })
            let r = planPurgeFrom({ keyTable: 'grups', from: 'X', tables })
            assert.deepStrictEqual(r.changes.map((c) => c.id), ['h1', 'h8'])
            assert.strictEqual(r.changes[0].after, '[{"mode":"AND","isActive":"y"},{"name":5,"mode":"OR","isActive":"y"},"x"]')
            assert.strictEqual(r.changes[1].after, '{}')
            assert.strictEqual(r.nExternal, 0, '引用端 from 為 \'\' 與 null 皆非外部')
        })

        it('FA-024 歷史同名: 被清除列與存續列同名(不同 id)→ 該名稱仍有實體, 不清理引用(changes 空), 仍刪除該列; nWiden 計「只刪其一致授權可能變寬」之引用者; 無人引用則為 0', function() {
            let mk = (cgrups) => deepFreeze({
                grups: [{ id: 'g1', name: 'D', from: '' }, { id: 'g2', name: 'D', from: 'X' }],
                users: [{ id: 'u1', from: '', cgrups }],
            })
            let a = planPurgeFrom({ keyTable: 'grups', from: 'X', tables: mk(mkObj([E('D', 'AND')])) })
            assert.strictEqual(a.err, null)
            assert.deepStrictEqual(a.delIds, ['g2'])
            assert.deepStrictEqual(a.changes, [])
            assert.deepStrictEqual(a.delNames, [])
            assert.strictEqual(a.impact.nWiden, 1)
            assert.strictEqual(planPurgeFrom({ keyTable: 'grups', from: 'X', tables: mk('{}') }).impact.nWiden, 0)
            //兩筆同名皆被清除 → 名稱消失 → 清理
            let both = deepFreeze({ grups: [{ id: 'g1', name: 'D', from: 'X' }, { id: 'g2', name: 'D', from: 'X' }], users: [{ id: 'u1', cgrups: mkObj([E('D', 'AND')]) }] })
            let b = planPurgeFrom({ keyTable: 'grups', from: 'X', tables: both })
            assert.deepStrictEqual(b.delIds, ['g1', 'g2'])
            assert.deepStrictEqual(b.changes.map((c) => c.after), ['{}'])
            assert.strictEqual(b.impact.nAnd, 1)
        })

        it('FA-025 引用端含 Infinity／NaN(無法安全重新編碼)而須改寫: 整體拒絕(err renameCascadeUnsupported)、changes 空(零寫入); 被清除列仍列出供檢視; applyPurgePlan 不套用; 該引用端與被清除名稱無關時不受影響', function() {
            let bad = '{"GX":{"mode":"AND","isActive":"y","w":NaN}}'
            let tables = deepFreeze({ grups: [{ id: 'gx', name: 'GX', from: 'X' }, { id: 'gk', name: 'GK', from: '' }], users: [{ id: 'h', cgrups: bad }] })
            let r = planPurgeFrom({ keyTable: 'grups', from: 'X', tables })
            assert.strictEqual(r.err, 'renameCascadeUnsupported')
            assert.deepStrictEqual(r.changes, [])
            assert.deepStrictEqual(r.delIds, ['gx'])
            assert.deepStrictEqual(applyPurgePlan(tables, r), { ...tables })
            let tables2 = deepFreeze({ grups: [{ id: 'gx', name: 'GX', from: 'X' }], users: [{ id: 'h', cgrups: '{"OTHER":{"w":Infinity}}' }] })
            let ok = planPurgeFrom({ keyTable: 'grups', from: 'X', tables: tables2 })
            assert.strictEqual(ok.err, null, '未命中須改寫者不觸發 unsafe')
            assert.deepStrictEqual(ok.changes, [])
        })

        it('FA-026 被清除列缺非空字串主鍵(\'\'／缺／數字)→ 整體拒絕 purgeRowNoId(不做部分清除), 零改寫; 其他表之缺 id 列不影響', function() {
            for (let bad of [{ id: '', from: 'X' }, { from: 'X' }, { id: 5, from: 'X' }]) {
                let tables = deepFreeze({ grups: [{ id: 'g1', name: 'A', from: 'X' }, { ...bad, name: 'B' }], users: [{ id: 'u', cgrups: mkObj([E('A', 'OR')]) }] })
                let r = planPurgeFrom({ keyTable: 'grups', from: 'X', tables })
                assert.strictEqual(r.err, 'purgeRowNoId', JSON.stringify(bad))
                assert.strictEqual(r.nNoId, 1)
                assert.deepStrictEqual(r.changes, [])
                assert.strictEqual(r.nRows, 2)
            }
            let ok = planPurgeFrom({ keyTable: 'grups', from: 'X', tables: deepFreeze({ grups: [{ id: 'g1', name: 'A', from: 'X' }, { name: 'B', from: 'Y' }] }) })
            assert.strictEqual(ok.err, null)
        })

        it('FA-027 計數獨立互驗: nDelHolders 與 nAnd 等於以獨立解碼(JSON.parse)計得之「引用被清除且已無存續同名之列」與其中「啟用且有效模式為 AND」者; 與 getDelImpact 口徑一致', function() {
            let rng = mkRng(27)
            let st = { n: 0, withRefs: 0, withAnd: 0 }
            for (let k = 0; k < 600; k++) {
                let u = genUniverse(rng, k % 2 === 1)
                for (let kt of ['grups', 'pemis']) {
                    let tables = deepFreeze(clone(u))
                    let r = planPurgeFrom({ keyTable: kt, from: 'X', tables })
                    assert.strictEqual(r.err, null)
                    let gone = goneNames(u, kt, 'X')
                    let holderTable = kt === 'grups' ? 'users' : 'grups'
                    let field = kt === 'grups' ? 'cgrups' : 'cpemis'
                    let nRefs = 0
                    let nAnd = 0
                    for (let h of u[holderTable]) {
                        let es = entriesOf(h[field])
                        if (es.some((e) => gone.has(e.name))) {
                            nRefs++
                        }
                        if (es.some((e) => gone.has(e.name) && e.isActive === 'y' && e.mode !== 'OR')) {
                            nAnd++
                        }
                    }
                    assert.strictEqual(r.nDelHolders, nRefs, `#${k} ${kt} nDelHolders`)
                    assert.strictEqual(r.impact.nAnd, nAnd, `#${k} ${kt} nAnd`)
                    let kind = kt === 'grups' ? 'Grup' : 'Pemi'
                    let im = getDelImpact(r.delIds, u[kt], u[holderTable], kind, u[kt].filter((x) => x.from !== 'X'))
                    assert.strictEqual(im.nRefs, r.impact.nRefs, `#${k} ${kt} getDelImpact.nRefs`)
                    assert.strictEqual(im.nWiden, r.impact.nWiden, `#${k} ${kt} getDelImpact.nWiden`)
                    st.n++
                    st.withRefs += nRefs > 0 ? 1 : 0
                    st.withAnd += nAnd > 0 ? 1 : 0
                }
            }
            assert.ok(st.n === 1200 && st.withRefs >= 300 && st.withAnd >= 100, JSON.stringify(st)) //靈敏度: 產生器確實涵蓋有引用與 AND 之情形
        })

        it('FA-028 users: nAdmin 計被清除列中 isAdmin 為 y 者; 無引用端; 不輸出 name; 大表(5000 列)亦正確', function() {
            let users = [{ id: 'a', from: 'X', isAdmin: 'y', name: 'N', email: 'e' }, { id: 'b', from: 'X', isAdmin: 'n' }, { id: 'c', from: 'X' }, { id: 'd', from: '', isAdmin: 'y' }]
            let r = planPurgeFrom({ keyTable: 'users', from: 'X', tables: deepFreeze({ users }) })
            assert.strictEqual(r.nAdmin, 1)
            assert.deepStrictEqual(r.rows, [{ id: 'a' }, { id: 'b' }, { id: 'c' }])
            assert.strictEqual(planPurgeFrom({ keyTable: 'grups', from: 'X', tables: { grups: users, users: [] } }).nAdmin, 0, '非 users 不計')
            let big = []
            for (let i = 0; i < 5000; i++) {
                big.push({ id: `u${i}`, from: i % 5 === 0 ? 'X' : '' })
            }
            assert.strictEqual(planPurgeFrom({ keyTable: 'users', from: 'X', tables: { users: big } }).nRows, 1000)
        })

        it('FA-029 原型鍵名與特殊字元之名稱／id(7 種)被清除: 引用端之該鍵被移除、不誤傷他鍵、不污染原型; 名稱與 id 原樣列出', function() {
            let names = ['__proto__', 'constructor', 'a b', '中文', 'q\'x', 'a\\b', 'toString']
            let tables = deepFreeze({
                grups: [...names.map((n, i) => ({ id: `g${i}`, name: n, from: 'X' })), { id: 'gk', name: 'KEEP', from: '' }],
                users: [{ id: 'u1', cgrups: objStr([...names, 'KEEP']) }],
            })
            let r = planPurgeFrom({ keyTable: 'grups', from: 'X', tables })
            assert.strictEqual(r.err, null)
            assert.deepStrictEqual(r.rows.map((x) => x.name), names)
            assert.deepStrictEqual(r.delNames.slice().sort(), names.slice().sort())
            assert.strictEqual(r.changes[0].after, objStr(['KEEP']))
            assert.strictEqual(r.changes[0].nDel, 7)
            assert.strictEqual(({}).mode, undefined, '原型未被污染')
            //標的: id 即名稱
            let t2 = deepFreeze({ targets: names.map((n) => ({ id: n, from: 'X' })), pemis: [{ id: 'p', name: 'P', crules: JSON.stringify(Object.fromEntries(names.map((n) => [n, 'y']))) }] })
            let rt = planPurgeFrom({ keyTable: 'targets', from: 'X', tables: t2 })
            assert.strictEqual(rt.err, null)
            assert.deepStrictEqual(rt.delIds, names)
            assert.deepStrictEqual(rt.rows.map((x) => x.name), names, 'targets 之名稱即 id')
        })

        it('FA-030 非物件列與非陣列表: 非物件列不命中不拋; 表非陣列視為空; 缺 tables 視為空', function() {
            let r = planPurgeFrom({ keyTable: 'grups', from: 'X', tables: deepFreeze({ grups: [null, 5, 'x', { id: 'g', name: 'A', from: 'X' }], users: [null, 7, { id: 'u', cgrups: mkObj([E('A', 'OR')]) }] }) })
            assert.strictEqual(r.err, null)
            assert.deepStrictEqual(r.delIds, ['g'])
            assert.deepStrictEqual(r.changes.map((c) => c.id), ['u'])
            for (let bad of [undefined, null, 5, 'x', {}]) {
                for (let t of TABLE_ORDER) {
                    let z = planPurgeFrom({ keyTable: t, from: 'X', tables: bad })
                    assert.strictEqual(z.err, null)
                    assert.strictEqual(z.nRows, 0)
                }
                assert.strictEqual(planPurgeFrom({ keyTable: 'grups', from: 'X', tables: { grups: bad } }).nRows, 0)
            }
        })

        it('FA-031 不改輸入: deepFreeze 之標準宇宙與隨機宇宙經 planPurgeFrom／planPurgeChain／applyPurgePlan 不拋(嚴格模式下改動凍結物件即拋); 凍結確實生效', function() {
            assert.throws(() => {
                deepFreeze({ a: { b: 1 } }).a.b = 2
            }, TypeError)
            let tables = deepFreeze(stdFx())
            for (let t of TABLE_ORDER) {
                applyPurgePlan(tables, planPurgeFrom({ keyTable: t, from: 'X', tables }))
            }
            planPurgeChain({ from: 'X', tables })
            let rng = mkRng(31)
            for (let k = 0; k < 100; k++) {
                let u = deepFreeze(genUniverse(rng, k % 2 === 1))
                planPurgeChain({ from: 'X', tables: u })
            }
        })

    })


    // ---------------------------------------------------------------
    // applyPurgePlan／planPurgeChain
    // ---------------------------------------------------------------

    describe('applyPurgePlan／planPurgeChain(純函數)', function() {

        it('FA-040 applyPurgePlan: 只移除 id 命中且 from 為該值之列、引用端欄位換成 after、其餘列為同一參考(未被複製); err 計畫原樣回傳', function() {
            let tables = deepFreeze(stdFx())
            let plan = planPurgeFrom({ keyTable: 'grups', from: 'X', tables })
            let out = applyPurgePlan(tables, plan)
            assert.deepStrictEqual(out.grups.map((x) => x.id), ['g1', 'g3'])
            assert.strictEqual(out.grups[0], tables.grups[0], '存續列同一參考')
            assert.deepStrictEqual(out.users.map((x) => x.cgrups), [mkObj([E('G1', 'OR')]), '{}', mkArr([E('G1', 'OR')]), '{}', ''])
            assert.strictEqual(out.users[3], tables.users[3], '未被改寫之引用端列同一參考')
            assert.strictEqual(out.targets, tables.targets, '無關表同一參考')
            assert.deepStrictEqual(out.users[0], { ...tables.users[0], cgrups: mkObj([E('G1', 'OR')]) }, '只改引用欄位')
            let bad = planPurgeFrom({ keyTable: 'grups', from: '', tables })
            assert.deepStrictEqual(applyPurgePlan(tables, bad), { ...tables })
            assert.deepStrictEqual(applyPurgePlan(tables, null), { ...tables })
        })

        it('FA-041 planPurgeChain: 依引用鏈序 targets → pemis → grups → users 逐表(輸入子集亦依此序、去重); 後表以前表套用後之模擬狀態規劃; totals 為各表加總; 非法輸入回 invalidFrom／invalidTable', function() {
            let tables = deepFreeze(stdFx())
            let c = planPurgeChain({ from: 'X', tables })
            assert.strictEqual(c.err, null)
            assert.deepStrictEqual(c.plans.map((p) => p.keyTable), ['targets', 'pemis', 'grups', 'users'])
            assert.deepStrictEqual(c.totals, { nRows: 4, nHolders: 9, nDelHolders: 9, nAnd: 2, nWiden: 0, nExternal: 6, nAdmin: 0 })
            assert.deepStrictEqual(c.tablesAfter, stdAfterAllX())
            //子集與順序
            let sub = planPurgeChain({ from: 'X', tables, keyTables: ['users', 'targets', 'users', 'grups'] })
            assert.deepStrictEqual(sub.plans.map((p) => p.keyTable), ['targets', 'grups', 'users'])
            //後表以模擬狀態規劃: p1(存續)之 crules 已被清除 T2, 規劃 pemis 時看到的 rowsOld 是清理後之列(名稱不受影響, 結果不變)
            assert.deepStrictEqual(c.tablesAfter.pemis.find((p) => p.id === 'p1').crules, mkObj([{ name: 'T1', active: 'y' }], true))
            //非法
            assert.strictEqual(planPurgeChain({ from: '', tables }).err, 'invalidFrom')
            assert.strictEqual(planPurgeChain({ from: null, tables }).err, 'invalidFrom')
            assert.strictEqual(planPurgeChain({ from: 'X', tables, keyTables: ['x'] }).err, 'invalidTable')
            assert.strictEqual(planPurgeChain({ from: 'X', tables, keyTables: [] }).err, 'invalidTable')
            assert.strictEqual(planPurgeChain({ from: 'X', tables, keyTables: 'all' }).plans.length, 4, 'keyTables 非陣列時視為全部')
            assert.strictEqual(planPurgeChain(undefined).err, 'invalidFrom')
        })

        it('FA-041b 任一表被拒即停止並整體拒絕: err／errTable 指出; plans 含到失敗表為止; 其後之表不規劃', function() {
            let tables = deepFreeze({
                targets: [{ id: 'T2', from: 'X' }],
                pemis: [{ id: 'p1', name: 'P1', from: 'X', crules: '{"T2":"y","n":NaN}' }, { id: 'p2', name: 'P2', from: '', crules: '{"T2":"y"}' }],
                grups: [{ id: 'g1', name: 'G1', from: 'X', cpemis: '{}' }],
                users: [],
            })
            let c = planPurgeChain({ from: 'X', tables })
            assert.strictEqual(c.err, 'renameCascadeUnsupported')
            assert.strictEqual(c.errTable, 'targets', 'p1 之 crules 含 NaN 而須清理 T2 → targets 步即被拒')
            assert.deepStrictEqual(c.plans.map((p) => p.keyTable), ['targets'])
            //被拒發生在中間表
            let t2 = deepFreeze({ ...stdFx(), grups: [{ id: 'g1', name: 'G1', from: '', cpemis: '{}' }, { id: 'g2', name: 'G2', from: 'X', cpemis: '{}' }], users: [{ id: 'u1', cgrups: '{"G2":{"w":Infinity}}' }] })
            let c2 = planPurgeFrom({ keyTable: 'grups', from: 'X', tables: t2 })
            assert.strictEqual(c2.err, 'renameCascadeUnsupported')
            let chain2 = planPurgeChain({ from: 'X', tables: t2 })
            assert.strictEqual(chain2.errTable, 'grups')
            assert.deepStrictEqual(chain2.plans.map((p) => p.keyTable), ['targets', 'pemis', 'grups'])
        })

        it('FA-042 標準宇宙 all 之終態逐字等於手算結果; 四表皆無 from=X 之列; 存續列非引用欄位逐位元不變', function() {
            let tables = deepFreeze(stdFx())
            let c = planPurgeChain({ from: 'X', tables })
            for (let t of TABLE_ORDER) {
                assert.deepStrictEqual(c.tablesAfter[t], stdAfterAllX()[t], t)
                assert.ok(!c.tablesAfter[t].some((r) => r.from === 'X'), `${t} 已無 from=X`)
            }
        })

    })


    // ---------------------------------------------------------------
    // 語意不變式(真 getUserRules)
    // ---------------------------------------------------------------

    describe('語意不變式(以真 src/plugins/mShare.mjs 之 getUserRules 驗證)', function() {

        it('FA-050 隨機宇宙(固定種子, 2000 組 × 表子集 5 種): 清除後之引用字串與授權＝以獨立參考模型自引用移除被清除項之效果; 終態列與參考模型逐位元相同; 只放寬不收嚴(相對「刪列不清引用」)', function() {
            let rng = mkRng(20261022)
            let subsets = [TABLE_ORDER, ['targets'], ['pemis', 'grups'], ['grups'], ['grups', 'users']]
            let st = { n: 0, withPurge: 0, loosened: 0, authDiffVsDangling: 0, usersPurged: 0, nonTrivial: 0, nonTrivialBefore: 0, changedVsBefore: 0 }
            for (let k = 0; k < 2000; k++) {
                let u = genUniverse(rng, k % 2 === 1, k % 4 === 3) //奇數組稠密; 每 4 組有 1 組為 AND 偏多(使「AND 限制解除」之授權變化足夠多)
                let keyTables = subsets[k % subsets.length]
                let chain = planPurgeChain({ from: 'X', tables: deepFreeze(clone(u)), keyTables })
                assert.strictEqual(chain.err, null, `#${k}`)
                let ref = refUniverse(u, 'X', keyTables)

                //終態: 逐表與參考模型相同(列、順序以 id 排序)
                for (let t of TABLE_ORDER) {
                    assert.deepStrictEqual(byId(chain.tablesAfter[t]), byId(ref[t]), `#${k} ${keyTables.join(',')} ${t}`)
                }

                //授權: 清除後 ＝ 參考模型(真 getUserRules)
                let ea = evalAll(chain.tablesAfter)
                let er = evalAll(ref)
                assert.deepStrictEqual(ea, er, `#${k} 授權須等於自引用移除被清除項之效果`)

                //只放寬: 相對「刪除被清除列、不清理引用」(引用成為懸空, 收嚴)
                let dang = clone(u)
                for (let t of keyTables) {
                    dang[t] = dang[t].filter((r) => r.from !== 'X')
                }
                let ed = evalAll(dang)
                let eb = evalAll(u)
                for (let usr of chain.tablesAfter.users) {
                    let rb = rulesOf(ed[usr.id])
                    let ra = rulesOf(ea[usr.id])
                    for (let key of Object.keys(rb)) {
                        assert.ok(rb[key] !== 'y' || ra[key] === 'y', `#${k} ${usr.id} ${key} 不得被收嚴`)
                    }
                    if (JSON.stringify(ed[usr.id]) !== JSON.stringify(ea[usr.id])) {
                        st.authDiffVsDangling++
                    }
                    if (Object.values(ra).includes('y')) {
                        st.nonTrivial++
                    }
                    if (Object.values(rulesOf(eb[usr.id])).includes('y')) {
                        st.nonTrivialBefore++
                    }
                    if (JSON.stringify(eb[usr.id]) !== JSON.stringify(ea[usr.id])) {
                        st.changedVsBefore++
                    }
                }
                st.n++
                st.withPurge += chain.totals.nRows > 0 ? 1 : 0
                st.loosened += chain.totals.nAnd > 0 ? 1 : 0
                st.usersPurged += keyTables.includes('users') ? chain.plans.find((p) => p.keyTable === 'users').nRows : 0
            }
            //靈敏度: 產生器確實涵蓋「有清除」「有 AND 引用被解除」「清理使授權與懸空狀態不同」「有使用者被清除」
            assert.ok(st.withPurge >= 1200 && st.loosened >= 300 && st.authDiffVsDangling >= 30 && st.usersPurged >= 300 && st.nonTrivial >= 300 && st.changedVsBefore >= 1000, JSON.stringify(st))
        })

        it('FA-051 授權變化之逐案實證(真 getUserRules, 手算預期): 啟用 AND 引用被清除項 → 清理後限制解除(n → y, 對照「刪列不清引用」之收嚴); 啟用 OR 引用 → 與懸空相同(皆收回被清除項之授權); 停用 AND 不影響; 權限層 AND 同; 標的被清除只自輸出消失; 歷史同名只刪其一 → 無引用被清理而授權變寬(nWiden)', function() {
            let mkU = (cgrups, extra = {}) => ({
                targets: [{ id: 'T1' }, { id: 'T2' }],
                pemis: [
                    { id: 'p1', name: 'P1', crules: mkObj([{ name: 'T1', active: 'y' }, { name: 'T2', active: 'n' }], true) },
                    { id: 'p2', name: 'P2', from: 'X', crules: mkObj([{ name: 'T1', active: 'n' }, { name: 'T2', active: 'y' }], true) },
                ],
                grups: [
                    { id: 'g1', name: 'G1', cpemis: mkObj([E('P1', 'OR')]) },
                    { id: 'g2', name: 'G2', from: 'X', cpemis: mkObj([E('P2', 'OR')]) },
                ],
                users: [{ id: 'u', cgrups }],
                ...extra,
            })
            let auth = (d) => evalAll(d).u.rules
            let run = (d, keyTables) => {
                let c = planPurgeChain({ from: 'X', tables: deepFreeze(clone(d)), keyTables })
                assert.strictEqual(c.err, null)
                let dang = clone(d)
                for (let t of keyTables) {
                    dang[t] = dang[t].filter((r) => r.from !== 'X')
                }
                return { before: auth(d), dangling: auth(dang), after: auth(c.tablesAfter), chain: c }
            }
            //[說明, 宇宙, 清除之表, 清除前, 刪列不清引用, 清除後]
            let A = run(mkU(mkObj([E('G1', 'OR'), E('G2', 'AND')])), ['grups'])
            assert.deepStrictEqual([A.before, A.dangling, A.after], ['T1=n,T2=n', 'T1=n,T2=n', 'T1=y,T2=n'], '啟用 AND 引用被清除群組: 清理後限制解除')
            assert.strictEqual(A.chain.totals.nAnd, 1)
            let B = run(mkU(mkObj([E('G1', 'OR'), E('G2', 'OR')])), ['grups'])
            assert.deepStrictEqual([B.before, B.dangling, B.after], ['T1=y,T2=y', 'T1=y,T2=n', 'T1=y,T2=n'], '啟用 OR 引用: 清理後與懸空相同(收回被清除項之授權)')
            assert.strictEqual(B.chain.totals.nAnd, 0)
            let C = run(mkU(mkObj([E('G1', 'OR'), E('G2', 'AND', 'n')])), ['grups'])
            assert.deepStrictEqual([C.before, C.dangling, C.after], ['T1=y,T2=n', 'T1=y,T2=n', 'T1=y,T2=n'], '停用之 AND 不參與授權, 清理不影響')
            assert.strictEqual(C.chain.totals.nAnd, 0)
            let D = run(mkU(mkObj([E('G1', 'OR')]), { grups: [{ id: 'g1', name: 'G1', cpemis: mkObj([E('P1', 'OR'), E('P2', 'AND')]) }, { id: 'g2', name: 'G2', from: 'X', cpemis: '{}' }] }), ['pemis'])
            assert.deepStrictEqual([D.before, D.dangling, D.after], ['T1=n,T2=n', 'T1=n,T2=n', 'T1=y,T2=n'], '權限層: 群組以 AND 引用被清除權限, 清理後限制解除')
            assert.strictEqual(D.chain.totals.nAnd, 1)
            let T = run(mkU(mkObj([E('G1', 'OR')]), { targets: [{ id: 'T1' }, { id: 'T2', from: 'X' }] }), ['targets'])
            assert.deepStrictEqual([T.before, T.dangling, T.after], ['T1=y,T2=n', 'T1=y', 'T1=y'], '標的被清除: 只自輸出消失, 其餘授權不變')
            //歷史同名只刪其一: 名稱仍有實體, 引用不清理(changes 空), 授權取存續者(交集變寬)
            let H = run(mkU(mkObj([E('G1', 'OR')]), { grups: [{ id: 'g1', name: 'G1', cpemis: mkObj([E('P1', 'OR')]) }, { id: 'g1b', name: 'G1', from: 'X', cpemis: mkObj([E('P2', 'OR')]) }] }), ['grups'])
            assert.deepStrictEqual([H.before, H.after], ['T1=n,T2=n', 'T1=y,T2=n'], '歷史同名: 引用原綁各筆之交集, 刪其一後取存續者')
            assert.deepStrictEqual(H.chain.plans[0].changes, [], '名稱仍有存續列, 引用不清理')
            assert.strictEqual(H.chain.totals.nWiden, 1, '授權變寬之引用者以 nWiden 計')
        })

    })


    // ---------------------------------------------------------------
    // runFixFromType(ORM 替身)
    // ---------------------------------------------------------------

    describe('runFixFromType(ORM 替身)', function() {

        let bk = (name) => path.join(TMP, 'fx', name, 'rows-backup.json')
        let mkDir = (name) => {
            fs.mkdirSync(path.dirname(bk(name)), { recursive: true })
            return bk(name)
        }

        it('FA-060 預設(apply 未給)只列不改: 零寫入、不備份、報告列各表非字串 from 之列數／型別分佈／前 10 個 id; 不含 email 與姓名(S6)', async function() {
            let wo = mkWo(fixFx())
            let s0 = snap(wo)
            let backups = 0
            let { logs, log } = mkLog()
            let res = await runFixFromType({
                woItems: wo,
                log,
                backupPath: mkDir('t60'),
                backupDb: async () => {
                    backups++
                }
            })
            assert.strictEqual(res.ok, true)
            assert.strictEqual(res.apply, false)
            assert.strictEqual(res.nChanges, 7)
            assert.strictEqual(cntOf(wo), 0)
            assert.deepStrictEqual(snap(wo), s0)
            assert.strictEqual(backups, 0)
            assert.strictEqual(fs.existsSync(bk('t60')), false)
            let txt = logs.join('\n')
            for (let s of ['-- users: 共 5 列; 非字串 from 2 列(null 1、number 1)', '-- grups: 共 3 列; 非字串 from 3 列(boolean 1、object 1、array 1)', '-- targets: 共 2 列; 非字串 from 1 列(boolean 1)', '-- pemis: 共 2 列; 非字串 from 1 列(null 1)', '"u1"、"u2"', '缺欄 1 列(視同', '預設只列不改', '將改為 \'\' 之列共 7 列']) {
                assert.ok(txt.includes(s), `報告應含「${s}」\n${txt}`)
            }
            assert.ok(!txt.includes('secret-') && !txt.includes('NAME-'))
        })

        it('FA-061 apply: 先備份(資料庫與四表全部列)再寫入; 逐表依序一次 save; 只改 from(其餘欄位含更新者／更新時間逐位元不變); 寫後再規劃無待改; 備份檔為寫入前全部列', async function() {
            let fx = fixFx()
            let wo = mkWo(fx)
            let fp = mkDir('t61')
            let ev = spyWo(wo, fp)
            let order = []
            let { logs, log } = mkLog()
            let res = await runFixFromType({
                woItems: wo,
                apply: true,
                log,
                backupPath: fp,
                backupDb: async () => {
                    order.push('backupDb')
                }
            })
            assert.strictEqual(res.ok, true, res.err)
            assert.strictEqual(res.stage, 'done')
            assert.deepStrictEqual(order, ['backupDb'])
            assert.deepStrictEqual(ev.map((e) => e.op), ['save:targets', 'save:pemis', 'save:grups', 'save:users'])
            assert.ok(ev.every((e) => e.bk === true), '寫入時四表備份檔已存在')
            assert.ok(ev.every((e) => e.opt && e.opt.autoInsert === false), 'save 須 autoInsert:false(列已不存在時不得補出只有一欄之殘列)')
            assert.ok(ev.every((e) => e.items.every((x) => Object.keys(x).sort().join() === 'from,id')), '只送 id 與 from 兩欄(只改 from)')
            assert.strictEqual(res.dbBackup, true)
            assert.strictEqual(res.backupPath, path.resolve(fp))
            assert.deepStrictEqual(res.written.map((w) => `${w.table}:${w.id}`), ['targets:T2', 'pemis:p2', 'grups:g1', 'grups:g2', 'grups:g3', 'users:u1', 'users:u2'])
            assert.strictEqual(res.failed.length, 0)
            assert.deepStrictEqual(snap(wo), snapOf(fixAfter(fx)), '只改 from 之預期結果')
            assert.strictEqual(wo.users.get('u1').timeUpdate, '2026-01-01 00:00:00')
            assert.strictEqual(wo.users.get('u3').from, 'pd', '外部列不動')
            assert.strictEqual(wo.users.get('u5').from, undefined, '缺欄不補')
            let back = JSON.parse(fs.readFileSync(fp, 'utf8'))
            for (let t of TABLES) {
                assert.deepStrictEqual(back[t], JSON.parse(JSON.stringify(fx[t])), `備份檔 ${t}`)
            }
            assert.strictEqual(back.meta.tool, 'fixFromType')
            let txt = logs.join('\n')
            assert.ok(txt.includes('已修正') && !txt.includes('secret-'))
        })

        it('FA-062 冪等: apply 後再跑一次 → 無須修正(不備份、不寫入)', async function() {
            let wo = mkWo(fixFx())
            let { log } = mkLog()
            let r1 = await runFixFromType({ woItems: wo, apply: true, log, backupPath: mkDir('t62a'), backupDb: async () => {} })
            assert.strictEqual(r1.ok, true)
            let n0 = cntOf(wo)
            let backups = 0
            let l2 = mkLog()
            let r2 = await runFixFromType({
                woItems: wo,
                apply: true,
                log: l2.log,
                backupPath: mkDir('t62b'),
                backupDb: async () => {
                    backups++
                }
            })
            assert.strictEqual(r2.ok, true)
            assert.strictEqual(r2.nChanges, 0)
            assert.strictEqual(backups, 0)
            assert.strictEqual(cntOf(wo), n0)
            assert.strictEqual(fs.existsSync(bk('t62b')), false)
            assert.ok(l2.logs.join('\n').includes('無須修正'))
        })

        it('FA-063 資料庫備份失敗／四表備份失敗(目錄不存在、檔案已存在不覆寫)→ 中止、零寫入(S6/S8)', async function() {
            let { log } = mkLog()
            let wo = mkWo(fixFx())
            let s0 = snap(wo)
            let r1 = await runFixFromType({
                woItems: wo,
                apply: true,
                log,
                backupPath: mkDir('t63a'),
                backupDb: async () => {
                    throw new Error('disk full')
                }
            })
            assert.strictEqual(r1.ok, false)
            assert.strictEqual(r1.stage, 'backupDb')
            assert.ok(r1.err.includes('disk full'))
            assert.strictEqual(fs.existsSync(bk('t63a')), false)
            let r1b = await runFixFromType({ woItems: wo, apply: true, log, backupPath: mkDir('t63a'), backupDb: () => Promise.reject(new Error('x')) })
            assert.strictEqual(r1b.ok, false)
            let r2 = await runFixFromType({ woItems: wo, apply: true, log, backupPath: path.join(TMP, 'fx', 'nodir-t63', 'x.json'), backupDb: async () => {} })
            assert.strictEqual(r2.ok, false)
            assert.strictEqual(r2.stage, 'backupRows')
            let fp = mkDir('t63c')
            fs.writeFileSync(fp, 'KEEP', 'utf8')
            let r3 = await runFixFromType({ woItems: wo, apply: true, log, backupPath: fp, backupDb: async () => {} })
            assert.strictEqual(r3.ok, false)
            assert.strictEqual(r3.stage, 'backupRows')
            assert.strictEqual(fs.readFileSync(fp, 'utf8'), 'KEEP', '既有檔不得被覆寫')
            assert.strictEqual(cntOf(wo), 0, '零寫入')
            assert.deepStrictEqual(snap(wo), s0)
        })

        it('FA-064 稽核後資料被改動(任一表任一列)→ 中止、零寫入(不以過期資料覆蓋)', async function() {
            for (let [t, mut] of [['users', (rs) => {
                rs.find((r) => r.id === 'u1').name = 'changed'
            }], ['targets', (rs) => {
                rs.push({ id: 'T9', from: '' })
            }], ['grups', (rs) => {
                rs.pop()
            }]]) {
                let wo = mkWo(fixFx())
                let n = 0
                let orig = wo[t].select
                wo[t].select = async (f) => {
                    n++
                    let rs = await orig(f)
                    if (n >= 2) { //第 1 次為稽核, 第 2 次為備份後之再讀取
                        mut(rs)
                    }
                    return rs
                }
                let { log } = mkLog()
                let res = await runFixFromType({ woItems: wo, apply: true, log, backupPath: mkDir(`t64-${t}`), backupDb: async () => {} })
                assert.strictEqual(res.ok, false, t)
                assert.strictEqual(res.stage, 'stale', t)
                assert.deepStrictEqual(res.stale, [t])
                assert.strictEqual(cntOf(wo), 0, `${t} 零寫入`)
            }
        })

        it('FA-065 save 失敗 5 形(逐筆 ok:0、整批 reject、筆數不符、n 為 0、nInserted)→ stage write 失敗、ok:false、列出失敗之表與 id、其後之表不寫入; 失敗提示含備份與冪等重跑', async function() {
            let { logs, log } = mkLog()
            let wo = mkWo(fixFx(), { grups: { saveIds: ['g2'] } })
            let res = await runFixFromType({ woItems: wo, apply: true, log, backupPath: mkDir('t65a'), backupDb: async () => {} })
            assert.strictEqual(res.ok, false)
            assert.strictEqual(res.stage, 'write')
            assert.deepStrictEqual(res.failed.map((f) => `${f.table}:${f.id}`), ['grups:g2'])
            assert.ok(res.failed[0].err.includes('simulated'))
            assert.strictEqual(wo.users.cnt.save, 0, '其後之 users 不寫入')
            assert.strictEqual(wo.users.get('u1').from, null)
            assert.ok(logs.join('\n').includes('備份') && logs.join('\n').includes('重跑'))
            let mut = async (name, fn) => {
                let w = mkWo(fixFx())
                let orig = w.pemis.save
                w.pemis.save = (d, o) => fn(d, o, orig)
                let r = await runFixFromType({ woItems: w, apply: true, log, backupPath: mkDir(name), backupDb: async () => {} })
                assert.strictEqual(r.ok, false, name)
                assert.strictEqual(r.stage, 'write', name)
                assert.deepStrictEqual(r.failed.map((f) => `${f.table}:${f.id}`), ['pemis:p2'], name)
                assert.strictEqual(w.grups.cnt.save, 0, `${name}: 其後之表不寫入`)
            }
            await mut('t65b', async () => {
                throw new Error('boom')
            })
            await mut('t65c', async () => [])
            await mut('t65d', async (d) => d.map(() => ({ n: 0, nInserted: 0, nModified: 0, ok: 1 })))
            await mut('t65e', async (d) => d.map(() => ({ n: 1, nInserted: 1, nModified: 0, ok: 1 })))
        })

        it('FA-067 備份保真(run07 外審 N3): 列內含無法 JSON 往返之值(NaN／Infinity／bigint／Date／自有 undefined／陣列內 undefined／Buffer)→ apply 於任何備份與寫入之前中止(stage backupFidelity), 零寫入、不備份、備份檔不產生; 可逆之一般列(含 -0 以外之純 JSON 值)不受影響(FA-061)', async function() {
            let bads = {
                nan: { from: null, description: NaN },
                inf: { from: null, description: Infinity },
                big: { from: null, description: 10n },
                date: { from: new Date('2020-01-02T00:00:00.000Z') },
                undef: { from: null, description: undefined, x: undefined },
                arrUndef: { from: null, tags: [undefined] },
                buf: { from: null, blob: Buffer.from('ab') },
            }
            for (let [k, extra] of Object.entries(bads)) {
                let fx = fixFx()
                fx.users[0] = { ...fx.users[0], ...extra }
                let wo = mkWo(fx)
                let fp = mkDir(`t67-${k}`)
                let backups = 0
                let { log } = mkLog()
                let res = await runFixFromType({ woItems: wo, apply: true, log, backupPath: fp, backupDb: async () => { backups++ } })
                assert.strictEqual(res.ok, false, `${k}: 應中止`)
                assert.strictEqual(res.stage, 'backupFidelity', `${k}: stage`)
                assert.strictEqual(cntOf(wo), 0, `${k}: 零寫入`)
                assert.strictEqual(backups, 0, `${k}: 不備份資料庫`)
                assert.strictEqual(fs.existsSync(fp), false, `${k}: 備份檔不產生`)
            }
        })

        it('FA-066 寫後驗證: ORM 實際存入內容與預期不符(寫成別值／寫到別列)→ stage verify 失敗; 缺主鍵之非字串列不改、報告為須人工處理且不算失敗; woItems 缺表或缺函數回 check 失敗(不拋)', async function() {
            let { log } = mkLog()
            let wo = mkWo(fixFx())
            let orig = wo.users.save
            wo.users.save = (d, o) => orig(d.map((x) => ({ ...x, from: 'zz' })), o)
            let res = await runFixFromType({ woItems: wo, apply: true, log, backupPath: mkDir('t66a'), backupDb: async () => {} })
            assert.strictEqual(res.ok, false)
            assert.strictEqual(res.stage, 'verify')
            let wo2 = mkWo(fixFx())
            let orig2 = wo2.grups.save
            wo2.grups.save = async (d, o) => {
                await orig2(d.map(() => ({ id: 'g1', from: '' })), o) //寫成同一列(g2、g3 仍為原值)
                return d.map(() => ({ n: 1, nModified: 1, ok: 1 }))
            }
            let res2 = await runFixFromType({ woItems: wo2, apply: true, log, backupPath: mkDir('t66b'), backupDb: async () => {} })
            assert.strictEqual(res2.ok, false)
            assert.strictEqual(res2.stage, 'verify')

            //缺主鍵之非字串 from 列: 以 ORM 替身難以植入(替身以 id 為鍵), 改以 select 注入
            let fx = fixFx()
            let wo3 = mkWo(fx)
            let o3 = wo3.users.select
            wo3.users.select = async (f) => [...(await o3(f)), { name: 'noid', from: null }]
            let l3 = mkLog()
            let res3 = await runFixFromType({ woItems: wo3, apply: true, log: l3.log, backupPath: mkDir('t66c'), backupDb: async () => {} })
            assert.strictEqual(res3.ok, true, res3.err)
            assert.strictEqual(res3.nNoId, 1)
            assert.ok(l3.logs.join('\n').includes('缺非空字串主鍵') && l3.logs.join('\n').includes('須人工處理'))

            //check
            assert.strictEqual((await runFixFromType({ log })).stage, 'check')
            let wo4 = mkWo(fixFx())
            delete wo4.targets.select
            assert.strictEqual((await runFixFromType({ woItems: wo4, log })).stage, 'check')
            let wo5 = mkWo(fixFx())
            delete wo5.pemis.save
            assert.strictEqual((await runFixFromType({ woItems: wo5, apply: true, log })).stage, 'check')
            assert.strictEqual((await runFixFromType({ woItems: wo5, log })).ok, true, '只列不需 save')
        })

    })


    // ---------------------------------------------------------------
    // runAuditFrom／runPurgeFrom(ORM 替身)與報告
    // ---------------------------------------------------------------

    describe('runAuditFrom／runPurgeFrom(ORM 替身)與報告', function() {

        let bk = (name) => path.join(TMP, 'pg', name, 'rows-backup.json')
        let mkDir = (name) => {
            fs.mkdirSync(path.dirname(bk(name)), { recursive: true })
            return bk(name)
        }
        let noWrite = async (wo, label) => {
            assert.strictEqual(cntOf(wo), 0, `${label}: 零寫入`)
        }

        it('FA-070 runAuditFrom(預設只列): 零寫入; 報告列各表 (表, from) 筆數、\'\'／缺欄／非字串摘要、外部列標示、升版後唯讀清單; 不含 email 與姓名', async function() {
            let wo = mkWo(stdFx())
            let { logs, log } = mkLog()
            let res = await runAuditFrom({ woItems: wo, log })
            assert.strictEqual(res.ok, true)
            await noWrite(wo, 'audit')
            let txt = logs.join('\n')
            for (let s of ['\'\' (後台列): 1', '缺欄(視同', 'null(非字串, 後台列): 1', '"X"(外部列, 升版後唯讀): 1', '"Y"(外部列, 升版後唯讀): 1', '升版後將成為外部列(唯讀)之(表, from)與筆數: 共 8 列、8 個(表, from)', 'users from="X": 1 列', 'g_fixFromType.mjs', 'g_purgeFrom.mjs', '不做「認領」']) {
                assert.ok(txt.includes(s), `報告應含「${s}」\n${txt}`)
            }
            assert.ok(!txt.includes('secret-') && !txt.includes('NAME-'))
            assert.strictEqual(res.audit.counts.nExternal, 8)
            assert.strictEqual((await runAuditFrom({ log })).stage, 'check')
        })

        it('FA-071 runPurgeFrom 預設(dry-run): 零寫入、不備份; 報告列將清除之列 id／名稱、連帶清理之引用端筆數(含 AND、外部)、不含 email 與姓名; 相近來源提示', async function() {
            let fx = stdFx()
            fx.grups.push({ id: 'g4', name: 'G4', from: 'x' }) //相近(大小寫)
            let wo = mkWo(fx)
            let backups = 0
            let { logs, log } = mkLog()
            let res = await runPurgeFrom({
                woItems: wo,
                table: 'grups',
                from: 'X',
                log,
                backupPath: mkDir('t71'),
                backupDb: async () => {
                    backups++
                }
            })
            assert.strictEqual(res.ok, true)
            assert.strictEqual(res.nRows, 1)
            await noWrite(wo, 'dry-run')
            assert.strictEqual(backups, 0)
            assert.strictEqual(fs.existsSync(bk('t71')), false)
            let txt = logs.join('\n')
            for (let s of ['== grups: 將清除 1 列 ==', 'id="g2" name="G2"', '連帶清理引用 users.cgrups: 須改寫 3 列', '其中來源非空(外部應用)者 2 列', '其中以 AND 引用者 1 列', '相近但不相同之來源(不會被清除): "x" 1 列', '預設只列不改']) {
                assert.ok(txt.includes(s), `報告應含「${s}」\n${txt}`)
            }
            assert.ok(!txt.includes('secret-') && !txt.includes('NAME-'))
        })

        it('FA-072 apply 單表(grups, from=X): 備份先於任何寫入; 先寫引用端(users)後刪被清除列(grups); 終態逐字等於手算; 備份檔為寫入前全部列; 寫後回驗通過(S7)', async function() {
            let fx = stdFx()
            let wo = mkWo(fx)
            let fp = mkDir('t72')
            let ev = spyWo(wo, fp)
            let order = []
            let { logs, log } = mkLog()
            let res = await runPurgeFrom({
                woItems: wo,
                table: 'grups',
                from: 'X',
                apply: true,
                log,
                backupPath: fp,
                backupDb: async () => {
                    order.push('backupDb')
                }
            })
            assert.strictEqual(res.ok, true, res.err)
            assert.strictEqual(res.stage, 'done')
            assert.deepStrictEqual(order, ['backupDb'])
            assert.deepStrictEqual(ev.map((e) => e.op), ['save:users', 'del:grups'], '先寫引用端、後刪被清除列')
            assert.ok(ev.every((e) => e.bk === true), '寫入時備份檔已存在')
            assert.ok(ev.filter((e) => e.op.startsWith('save:')).every((e) => e.opt && e.opt.autoInsert === false && e.items.every((x) => Object.keys(x).sort().join() === 'cgrups,id')), '引用端 save 須 autoInsert:false 且只送 id 與引用欄位')
            let exp = clone(fx)
            exp.grups = exp.grups.filter((g) => g.id !== 'g2')
            exp.users[0].cgrups = mkObj([E('G1', 'OR')])
            exp.users[1].cgrups = '{}'
            exp.users[2].cgrups = mkArr([E('G1', 'OR')])
            assert.deepStrictEqual(snap(wo), snapOf(exp))
            assert.deepStrictEqual(res.written.map((w) => `${w.op}:${w.table}:${w.id}`), ['save:users:u1', 'save:users:u2', 'save:users:u3', 'del:grups:g2'])
            let back = JSON.parse(fs.readFileSync(fp, 'utf8'))
            for (let t of TABLES) {
                assert.deepStrictEqual(back[t], JSON.parse(JSON.stringify(fx[t])), `備份檔 ${t}`)
            }
            assert.strictEqual(back.meta.tool, 'purgeFrom')
            assert.strictEqual(back.meta.from, 'X')
            assert.ok(logs.join('\n').includes('已清除: 刪除 1 列、改寫引用端 3 列'))
        })

        it('FA-073 apply all: 單一備份; 依 targets → pemis → grups → users 逐表(每表先引用端後刪列; users 無引用端只刪); 終態逐字等於手算; 寫後無 from=X 之列', async function() {
            let fx = stdFx()
            let wo = mkWo(fx)
            let fp = mkDir('t73')
            let ev = spyWo(wo, fp)
            let backups = 0
            let { log } = mkLog()
            let res = await runPurgeFrom({
                woItems: wo,
                table: 'all',
                from: 'X',
                apply: true,
                log,
                backupPath: fp,
                backupDb: async () => {
                    backups++
                }
            })
            assert.strictEqual(res.ok, true, res.err)
            assert.strictEqual(backups, 1, '同一備份')
            assert.deepStrictEqual(ev.map((e) => e.op), ['save:pemis', 'del:targets', 'save:grups', 'del:pemis', 'save:users', 'del:grups', 'del:users'])
            assert.ok(ev.every((e) => e.bk === true))
            assert.deepStrictEqual(snap(wo), snapOf(stdAfterAllX()))
            for (let t of TABLES) {
                assert.ok(!wo[t].snapshot().includes('"from":"X"'), `${t} 已無 from=X`)
            }
        })

        it('FA-074 失敗注入: 引用端 save 逐筆失敗 → 中止、不刪該表被清除列、其後之表不動; 刪除失敗 → 中止; 皆 ok:false、stage write、提示備份與冪等重跑(S7)', async function() {
            let { logs, log } = mkLog()
            //引用端(users)u2 存失敗
            let wo = mkWo(stdFx(), { users: { saveIds: ['u2'] } })
            let res = await runPurgeFrom({ woItems: wo, table: 'grups', from: 'X', apply: true, log, backupPath: mkDir('t74a'), backupDb: async () => {} })
            assert.strictEqual(res.ok, false)
            assert.strictEqual(res.stage, 'write')
            assert.deepStrictEqual(res.failed.map((f) => `${f.table}:${f.id}`), ['users:u2'])
            assert.strictEqual(wo.grups.cnt.del, 0, '引用端未寫完不得刪被清除列')
            assert.ok(wo.grups.has('g2'))
            assert.ok(logs.join('\n').includes('備份') && logs.join('\n').includes('重跑'))
            //刪除失敗(all 模式於 pemis 步)
            let wo2 = mkWo(stdFx(), { pemis: { delIds: ['p2'] } })
            let res2 = await runPurgeFrom({ woItems: wo2, table: 'all', from: 'X', apply: true, log, backupPath: mkDir('t74b'), backupDb: async () => {} })
            assert.strictEqual(res2.ok, false)
            assert.strictEqual(res2.stage, 'write')
            assert.deepStrictEqual(res2.failed.map((f) => `${f.table}:${f.id}`), ['pemis:p2'])
            assert.strictEqual(wo2.grups.cnt.save, 1, 'pemis 步之引用端(grups)已先寫')
            assert.strictEqual(wo2.grups.cnt.del + wo2.users.cnt.save + wo2.users.cnt.del, 0, '失敗步驟之後(grups、users 步)不啟動')
            assert.ok(!wo2.targets.has('T2'), '先前步驟(targets)已完成')
            //del 回傳 5 形
            let mut = async (name, fn) => {
                let w = mkWo(stdFx())
                let orig = w.grups.del
                w.grups.del = (d) => fn(d, orig)
                let r = await runPurgeFrom({ woItems: w, table: 'grups', from: 'X', apply: true, log, backupPath: mkDir(name), backupDb: async () => {} })
                assert.strictEqual(r.ok, false, name)
                assert.strictEqual(r.stage, 'write', name)
                assert.deepStrictEqual(r.failed.map((f) => `${f.table}:${f.id}`), ['grups:g2'], name)
            }
            await mut('t74c', async () => {
                throw new Error('boom')
            })
            await mut('t74d', async () => [])
            await mut('t74e', async (d) => d.map(() => ({ n: 0, nDeleted: 0, ok: 1 })))
            await mut('t74f', async (d) => d.map(() => ({ n: 1, nDeleted: 0, ok: 1 })))
            await mut('t74g', async (d) => d.map(() => ({ n: 1, nDeleted: 1, ok: 0, err: 'x' })))
        })

        it('FA-075 部分失敗後重跑收斂(冪等): 刪除失敗後以同一指令重跑 → 完成且終態等於一次成功之終態', async function() {
            let { log } = mkLog()
            let wo = mkWo(stdFx(), { grups: { delIds: ['g2'] } })
            let r1 = await runPurgeFrom({ woItems: wo, table: 'grups', from: 'X', apply: true, log, backupPath: mkDir('t75a'), backupDb: async () => {} })
            assert.strictEqual(r1.ok, false)
            let st = Object.fromEntries(TABLES.map((t) => [t, JSON.parse(wo[t].snapshot())]))
            assert.ok(st.grups.some((g) => g.id === 'g2'), '被清除列仍在')
            assert.strictEqual(st.users.find((u) => u.id === 'u2').cgrups, '{}', '引用端已先清理')
            let wo2 = mkWo(st) //以失敗後之狀態重建(模擬重啟後重跑)
            let r2 = await runPurgeFrom({ woItems: wo2, table: 'grups', from: 'X', apply: true, log, backupPath: mkDir('t75b'), backupDb: async () => {} })
            assert.strictEqual(r2.ok, true, r2.err)
            assert.strictEqual(wo2.users.cnt.save, 0, '引用端已無須改寫')
            let wo3 = mkWo(stdFx())
            await runPurgeFrom({ woItems: wo3, table: 'grups', from: 'X', apply: true, log, backupPath: mkDir('t75c'), backupDb: async () => {} })
            assert.deepStrictEqual(snap(wo2), snap(wo3), '終態與一次成功相同')
        })

        it('FA-076 備份失敗(資料庫／四表(目錄不存在、檔案已存在)) → 中止、零寫入; 稽核後被改動 → stale 中止、零寫入', async function() {
            let { log } = mkLog()
            let wo = mkWo(stdFx())
            let s0 = snap(wo)
            let a = { woItems: wo, table: 'all', from: 'X', apply: true, log }
            let r1 = await runPurgeFrom({
                ...a,
                backupPath: mkDir('t76a'),
                backupDb: async () => {
                    throw new Error('disk full')
                }
            })
            assert.strictEqual(r1.stage, 'backupDb')
            let r2 = await runPurgeFrom({ ...a, backupPath: path.join(TMP, 'pg', 'nodir-t76', 'x.json'), backupDb: async () => {} })
            assert.strictEqual(r2.stage, 'backupRows')
            let fp = mkDir('t76c')
            fs.writeFileSync(fp, 'KEEP', 'utf8')
            let r3 = await runPurgeFrom({ ...a, backupPath: fp, backupDb: async () => {} })
            assert.strictEqual(r3.stage, 'backupRows')
            assert.strictEqual(fs.readFileSync(fp, 'utf8'), 'KEEP')
            await noWrite(wo, '備份失敗')
            assert.deepStrictEqual(snap(wo), s0)
            for (let [t, mut] of [['users', (rs) => {
                rs.find((r) => r.id === 'u1').name = 'changed'
            }], ['pemis', (rs) => {
                rs.pop()
            }]]) {
                let w = mkWo(stdFx())
                let n = 0
                let orig = w[t].select
                w[t].select = async (f) => {
                    n++
                    let rs = await orig(f)
                    if (n >= 2) {
                        mut(rs)
                    }
                    return rs
                }
                let r = await runPurgeFrom({ ...a, woItems: w, backupPath: mkDir(`t76-${t}`), backupDb: async () => {} })
                assert.strictEqual(r.ok, false, t)
                assert.strictEqual(r.stage, 'stale', t)
                assert.deepStrictEqual(r.stale, [t])
                await noWrite(w, `stale ${t}`)
            }
        })

        it('FA-077 寫後驗證: 刪除未實際生效、引用端寫成別值 → stage verify 失敗; 注入「不清理引用」之有缺陷規劃器 → 寫後不變式(未製造新懸空)獨立抓出', async function() {
            let { log } = mkLog()
            let wo = mkWo(stdFx())
            wo.grups.del = async (d) => d.map(() => ({ n: 1, nDeleted: 1, ok: 1 })) //回報成功但未實際刪除
            let r1 = await runPurgeFrom({ woItems: wo, table: 'grups', from: 'X', apply: true, log, backupPath: mkDir('t77a'), backupDb: async () => {} })
            assert.strictEqual(r1.ok, false)
            assert.strictEqual(r1.stage, 'verify')
            let wo2 = mkWo(stdFx())
            let o2 = wo2.users.save
            wo2.users.save = (d, o) => o2(d.map((x) => ({ ...x, cgrups: '{}' })), o)
            let r2 = await runPurgeFrom({ woItems: wo2, table: 'grups', from: 'X', apply: true, log, backupPath: mkDir('t77b'), backupDb: async () => {} })
            assert.strictEqual(r2.stage, 'verify')

            //有缺陷之規劃器: 只刪列、不清理引用(預測狀態與實際一致, 逐位元比對通過; 唯寫後不變式能抓)
            let noClean = (p) => {
                let c = planPurgeChain(p)
                c.plans.forEach((pl) => {
                    pl.changes = []
                })
                let cur = p.tables
                for (let pl of c.plans) {
                    cur = applyPurgePlan(cur, pl)
                }
                c.tablesAfter = cur
                return c
            }
            let wo3 = mkWo(stdFx())
            let r3 = await runPurgeFrom({ woItems: wo3, table: 'grups', from: 'X', apply: true, log, backupPath: mkDir('t77c'), backupDb: async () => {}, planFn: noClean })
            assert.strictEqual(r3.ok, false)
            assert.strictEqual(r3.stage, 'verify')
            assert.ok(r3.err.includes('new dangling refs'), r3.err)
        })

        it('FA-078 規劃被拒(引用端含 NaN): dry-run 亦 ok:false stage plan(表示 --apply 亦將拒絕); apply 零寫入、不備份、報告列拒絕原因', async function() {
            let fx = stdFx()
            fx.users[0].cgrups = '{"G2":{"mode":"AND","isActive":"y","w":NaN}}'
            for (let apply of [false, true]) {
                let wo = mkWo(fx)
                let backups = 0
                let { logs, log } = mkLog()
                let res = await runPurgeFrom({
                    woItems: wo,
                    table: 'grups',
                    from: 'X',
                    apply,
                    log,
                    backupPath: mkDir(`t78-${apply}`),
                    backupDb: async () => {
                        backups++
                    }
                })
                assert.strictEqual(res.ok, false, `apply=${apply}`)
                assert.strictEqual(res.stage, 'plan')
                await noWrite(wo, `apply=${apply}`)
                assert.strictEqual(backups, 0)
                assert.ok(logs.join('\n').includes('[拒絕] renameCascadeUnsupported'))
                assert.ok(res.err.includes('nothing written'))
            }
        })

        it('FA-079 無須清除(沒有命中列): apply 亦不備份、不寫入, ok; 參數檢查: from 為空字串／非字串、表名非法、woItems 缺 del 皆回 check 失敗(不拋、零寫入)', async function() {
            let { logs, log } = mkLog()
            let wo = mkWo(stdFx())
            let backups = 0
            let r = await runPurgeFrom({
                woItems: wo,
                table: 'all',
                from: 'NOPE',
                apply: true,
                log,
                backupPath: mkDir('t79'),
                backupDb: async () => {
                    backups++
                }
            })
            assert.strictEqual(r.ok, true)
            assert.strictEqual(backups, 0)
            await noWrite(wo, '無命中')
            assert.ok(logs.join('\n').includes('無須清除'))
            for (let from of ['', undefined, null, 5, {}]) {
                let x = await runPurgeFrom({ woItems: wo, table: 'grups', from, apply: true, log })
                assert.strictEqual(x.ok, false, JSON.stringify(from))
                assert.strictEqual(x.stage, 'check')
            }
            for (let table of [undefined, '', 'x', 'ALL', '__proto__']) {
                let x = await runPurgeFrom({ woItems: wo, table, from: 'X', apply: true, log })
                assert.strictEqual(x.stage, 'check', String(table))
            }
            let w2 = mkWo(stdFx())
            delete w2.grups.del
            assert.strictEqual((await runPurgeFrom({ woItems: w2, table: 'grups', from: 'X', apply: true, log })).stage, 'check')
            assert.strictEqual((await runPurgeFrom({ woItems: w2, table: 'grups', from: 'X', log })).ok, true, '只列不需 del／save')
            assert.strictEqual((await runPurgeFrom({ log })).stage, 'check')
            await noWrite(wo, '參數錯誤')
        })

        it('FA-080 users 清除: 報告含管理員警示與 id(不含姓名／email); 被清除列缺主鍵者規劃被拒(purgeRowNoId); 超過上限之列從略並註明', async function() {
            let fx = stdFx()
            fx.users.push({ id: 'u6', name: 'NAME-u6-zzq', email: 'secret-u6@x.com', from: 'X', isAdmin: 'y', cgrups: '{}' })
            let { logs, log } = mkLog()
            let res = await runPurgeFrom({ woItems: mkWo(fx), table: 'users', from: 'X', log })
            assert.strictEqual(res.ok, true)
            let txt = logs.join('\n')
            assert.ok(txt.includes('id="u2"') && txt.includes('id="u6"'))
            assert.ok(txt.includes('被清除列中有 1 列為系統管理員'))
            assert.ok(txt.includes('users 無引用端'))
            assert.ok(!txt.includes('secret-') && !txt.includes('NAME-'))
            let wo = mkWo(stdFx())
            let o = wo.users.select
            wo.users.select = async (f) => [...(await o(f)), { name: 'noid', from: 'X' }]
            let l2 = mkLog()
            let r2 = await runPurgeFrom({ woItems: wo, table: 'users', from: 'X', apply: true, log: l2.log, backupPath: mkDir('t80'), backupDb: async () => {} })
            assert.strictEqual(r2.ok, false)
            assert.strictEqual(r2.stage, 'plan')
            assert.ok(l2.logs.join('\n').includes('purgeRowNoId'))
            assert.strictEqual(cntOf(wo), 0)
            //上限
            let big = { targets: [], pemis: [], grups: [], users: [] }
            for (let i = 0; i < 7; i++) {
                big.users.push({ id: `b${i}`, from: 'X' })
            }
            let txt2 = formatPurgeReport(planPurgeChain({ from: 'X', tables: big, keyTables: ['users'] }), { maxList: 3 })
            assert.ok(txt2.includes('id="b2"') && !txt2.includes('id="b3"') && txt2.includes('其餘 4 列從略'))
        })

        it('FA-081 報告不含使用者姓名／email(formatFromAudit／formatFixReport／formatPurgeReport 對含個資之宇宙)', function() {
            let fx = stdFx()
            let a = formatFromAudit(auditFrom(fx))
            let plans = Object.fromEntries(TABLE_ORDER.map((t) => [t, planFixFromType(fixFx()[t])]))
            let f = formatFixReport(plans)
            let p = formatPurgeReport(planPurgeChain({ from: 'X', tables: fx }))
            for (let txt of [a, f, p]) {
                assert.ok(!txt.includes('secret-') && !txt.includes('NAME-') && !txt.includes('@x.com'))
            }
            assert.ok(p.includes('逐表依序套用'))
            assert.ok(p.includes('合計: 清除 4 列, 改寫引用端 9 列(其中 AND 引用 2 列、外部來源 6 列)'))
        })

        it('FA-082 資料量: 5000 使用者／2000 群組之 all 清除規劃於 5 秒內完成且筆數正確(離線一次性工具之合理性檢查, 非效能需求)', function() {
            this.timeout(30000)
            let users = []
            let grups = []
            for (let i = 0; i < 2000; i++) {
                grups.push({ id: `g${i}`, name: `G${i}`, from: i % 4 === 0 ? 'X' : '', cpemis: '{}' })
            }
            for (let i = 0; i < 5000; i++) {
                users.push({ id: `u${i}`, from: i % 10 === 0 ? 'X' : '', cgrups: mkObj([E(`G${i % 2000}`, 'OR'), E(`G${(i * 7) % 2000}`, 'AND')]) })
            }
            let t0 = Date.now()
            let c = planPurgeChain({ from: 'X', tables: { targets: [], pemis: [], grups, users } })
            assert.ok(Date.now() - t0 < 5000, `耗時 ${Date.now() - t0} ms`)
            assert.strictEqual(c.plans.find((p) => p.keyTable === 'grups').nRows, 500)
            assert.strictEqual(c.plans.find((p) => p.keyTable === 'users').nRows, 500)
            assert.strictEqual(c.err, null)
        })

    })


    // ---------------------------------------------------------------
    // checkDbNotInUse(真 lmdb; 僅 Windows 實測)
    // ---------------------------------------------------------------

    describe('checkDbNotInUse(後端占用偵測)', function() {

        this.timeout(120000)

        let seedDir = async (tag) => {
            let dir = path.join(TMP, tag)
            fs.mkdirSync(dir, { recursive: true })
            let url = path.join(dir, 'db')
            let r = WServOrm(ds, WOrm, url, DB_NAME)
            try {
                await r.woItems.users.insert([{ id: 'u1', name: 'a', from: '', cgrups: '{}' }])
            }
            finally {
                await r.closeAll()
            }
            return { dir, url }
        }
        //startHolder: 子行程開啟資料庫並持有(模擬後端), 回傳 { stop }
        let startHolder = (url) => new Promise((resolve, reject) => {
            let child = spawn(process.execPath, [HOLDER, url], { stdio: ['pipe', 'pipe', 'pipe'] })
            let out = ''
            let timer = setTimeout(() => {
                child.kill()
                reject(new Error(`holder not ready: ${out}`))
            }, 30000)
            child.stdout.on('data', (d) => {
                out += String(d)
                if (out.includes('holder-ready')) {
                    clearTimeout(timer)
                    resolve({
                        child,
                        stop: () => new Promise((resolve) => {
                            child.on('exit', resolve)
                            child.stdin.end()
                        }),
                    })
                }
            })
            child.on('error', reject)
        })
        const onWin = process.platform === 'win32'

        it('FA-090 閒置之資料庫: ok、資料夾已改回原名、無暫名殘留; 資料不變', async function() {
            let { url } = await seedDir('inuse1')
            let r = checkDbNotInUse({ url, dbName: DB_NAME })
            assert.strictEqual(r.ok, true, r.err)
            assert.strictEqual(r.checked, onWin)
            assert.deepStrictEqual(fs.readdirSync(url), [DB_NAME], '無暫名殘留')
            assert.deepStrictEqual(fs.readdirSync(path.join(url, DB_NAME)).sort(), ['grups', 'pemis', 'targets', 'users'])
            let o = WServOrm(ds, WOrm, url, DB_NAME)
            try {
                assert.deepStrictEqual((await o.woItems.users.select()).map((x) => x.id), ['u1'])
            }
            finally {
                await o.closeAll()
            }
        })

        it('FA-091 另一行程持有(模擬後端): 拒絕(ok:false, 指出被占用)、資料夾完好、持有者仍可正常使用; 持有者結束後 ok(Windows; 其他平台無法偵測, 回 checked:false)', async function() {
            if (!onWin) {
                let { url } = await seedDir('inuse2x')
                let r = checkDbNotInUse({ url, dbName: DB_NAME })
                assert.deepStrictEqual([r.ok, r.checked], [true, false])
                this.skip()
            }
            let { url } = await seedDir('inuse2')
            let h = await startHolder(url)
            try {
                let r = checkDbNotInUse({ url, dbName: DB_NAME })
                assert.strictEqual(r.ok, false)
                assert.strictEqual(r.checked, true)
                assert.ok(r.err.includes('被其他行程占用'), r.err)
                assert.deepStrictEqual(fs.readdirSync(url), [DB_NAME], '資料夾未被改名')
                assert.ok(h.child.exitCode === null, '持有者仍在運作')
            }
            finally {
                await h.stop()
            }
            let r2 = checkDbNotInUse({ url, dbName: DB_NAME })
            assert.strictEqual(r2.ok, true, r2.err)
        })

        it('FA-092 資料庫不存在 → ok:false; 暫名已存在 → 拒絕且不動資料夾(fail-closed, Windows)', async function() {
            let nodir = checkDbNotInUse({ url: path.join(TMP, 'nope'), dbName: DB_NAME })
            assert.strictEqual(nodir.ok, false)
            assert.ok(nodir.err.includes('資料庫不存在'))
            if (!onWin) {
                this.skip()
            }
            let { url } = await seedDir('inuse3')
            let tmp = `${path.resolve(url, DB_NAME)}.__inuse-probe-${process.pid}__`
            fs.mkdirSync(tmp)
            try {
                let r = checkDbNotInUse({ url, dbName: DB_NAME })
                assert.strictEqual(r.ok, false)
                assert.ok(r.err.includes('暫名已存在'))
                assert.ok(fs.existsSync(path.join(url, DB_NAME, 'users')), '資料夾完好')
            }
            finally {
                fs.rmSync(tmp, { recursive: true, force: true })
            }
        })

    })


    // ---------------------------------------------------------------
    // 真 lmdb 臨時庫 CLI
    // ---------------------------------------------------------------

    describe('CLI(g_fixFromType.mjs／g_purgeFrom.mjs; 真 lmdb 臨時庫 test/_tmp/fromAudit/<tag>/)', function() {

        this.timeout(180000)

        let seed = async (tag, fx) => {
            let dir = path.join(TMP, tag)
            fs.mkdirSync(dir, { recursive: true })
            let url = path.join(dir, 'db')
            let r = WServOrm(ds, WOrm, url, DB_NAME)
            try {
                for (let t of TABLES) {
                    if (fx[t].length > 0) {
                        await r.woItems[t].insert(fx[t])
                    }
                }
            }
            finally {
                await r.closeAll()
            }
            return { dir, url }
        }
        let readDb = async (url) => {
            let r = WServOrm(ds, WOrm, url, DB_NAME)
            try {
                let rows = {}
                for (let t of TABLES) {
                    rows[t] = await r.woItems[t].select()
                }
                return rows
            }
            finally {
                await r.closeAll()
            }
        }
        let norm = (rows) => JSON.stringify(Object.fromEntries(TABLES.map((t) => [t, byId(rows[t])])))
        let runFix = (cwd, args) => spawnSync(process.execPath, [TOOL_FIX, ...args], { encoding: 'utf8', timeout: 90000, cwd })
        let runPurge = (cwd, args) => spawnSync(process.execPath, [TOOL_PURGE, ...args], { encoding: 'utf8', timeout: 90000, cwd })
        let filesOf = (dir, re) => fs.readdirSync(dir).filter((f) => re.test(f))
        let out = (r) => r.stdout + r.stderr
        //種入之 users 不含 own undefined(lmdb 編碼器); 缺欄以不給鍵表達
        const onWin = process.platform === 'win32'

        it('FA-100 g_fixFromType.mjs --db: 預設只列不改(離開碼 0、零寫入、不產備份); 報告含各表型別分佈與 id; 不含 email／姓名', async function() {
            let { dir, url } = await seed('fx1', fixFx())
            let rows0 = await readDb(url)
            let r = runFix(dir, ['--db', url])
            assert.strictEqual(r.status, 0, out(r))
            for (let s of ['非字串 from 2 列(null 1、number 1)', '"u1"、"u2"', '預設只列不改', '將改為 \'\' 之列共 7 列']) {
                assert.ok(r.stdout.includes(s), `應含「${s}」\n${r.stdout}`)
            }
            assert.ok(!out(r).includes('secret-') && !out(r).includes('NAME-'))
            assert.strictEqual(norm(await readDb(url)), norm(rows0))
            assert.deepStrictEqual(filesOf(dir, /backup/), [], '不得產備份檔')
        })

        it('FA-101 g_fixFromType.mjs --db --apply: 先備份(backup-時間.json 與四表備份)再寫入、寫後無非字串 from、只改 from、離開碼 0; 再跑無須修正(不產新備份)', async function() {
            let fx = fixFx()
            let { dir, url } = await seed('fx2', fx)
            let rows0 = await readDb(url)
            let fpRows = path.join(dir, 'rows-backup.json')
            let ok = runFix(dir, ['--db', url, '--apply', '--backup', fpRows])
            assert.strictEqual(ok.status, 0, out(ok))
            assert.ok(ok.stdout.includes('已修正'))
            let dbBk = filesOf(dir, /^backup-\d+\.json$/)
            assert.strictEqual(dbBk.length, 1, 'getDb.backup 之備份檔')
            let bkDb = JSON.parse(fs.readFileSync(path.join(dir, dbBk[0]), 'utf8'))
            assert.strictEqual(JSON.stringify(byId(bkDb.find((x) => x.name === 'grups').data)), JSON.stringify(byId(rows0.grups)), '資料庫備份為寫入前內容')
            let bkRows = JSON.parse(fs.readFileSync(fpRows, 'utf8'))
            for (let t of TABLES) {
                assert.strictEqual(JSON.stringify(byId(bkRows[t])), JSON.stringify(byId(rows0[t])), `四表備份 ${t}`)
            }
            let rows1 = await readDb(url)
            let exp = Object.fromEntries(TABLES.map((t) => [t, rows0[t].map((r) => (r.from !== undefined && typeof r.from !== 'string' ? { ...r, from: '' } : r))]))
            assert.strictEqual(norm(rows1), norm(exp), '只改 from(含更新者／更新時間逐位元不變)')
            assert.strictEqual(rows1.users.find((u) => u.id === 'u3').from, 'pd', '外部列不動')
            let again = runFix(dir, ['--db', url, '--apply', '--backup', path.join(dir, 'rows2.json')])
            assert.strictEqual(again.status, 0, out(again))
            assert.ok(again.stdout.includes('無須修正'))
            assert.strictEqual(fs.existsSync(path.join(dir, 'rows2.json')), false)
            assert.strictEqual(filesOf(dir, /^backup-\d+\.json$/).length, 1)
        })

        it('FA-102 g_fixFromType.mjs: 四表備份失敗 → 離開碼 1、零寫入(資料庫備份已先產生); 資料庫不存在 → 離開碼 1 且不憑空建庫; 參數錯誤 → 離開碼 2', async function() {
            let { dir, url } = await seed('fx3', fixFx())
            let rows0 = await readDb(url)
            let bad = runFix(dir, ['--db', url, '--apply', '--backup', path.join(dir, 'nodir', 'rows.json')])
            assert.strictEqual(bad.status, 1, out(bad))
            assert.ok(bad.stdout.includes('階段 backupRows'))
            assert.strictEqual(norm(await readDb(url)), norm(rows0), '零寫入')
            assert.strictEqual(filesOf(dir, /^backup-\d+\.json$/).length, 1, '資料庫備份先於(未發生之)寫入而產生')
            let nodb = path.join(dir, 'no-such-db')
            let r2 = runFix(dir, ['--db', nodb, '--apply'])
            assert.strictEqual(r2.status, 1)
            assert.ok(r2.stdout.includes('資料庫不存在'))
            assert.strictEqual(fs.existsSync(nodb), false)
            assert.strictEqual(runFix(dir, ['--bogus']).status, 2)
            assert.strictEqual(runFix(dir, ['--db']).status, 2)
            assert.strictEqual(runFix(dir, ['--backup', '--apply']).status, 2)
            assert.strictEqual(runFix(dir, ['stray']).status, 2)
            let h = runFix(dir, ['--help'])
            assert.strictEqual(h.status, 0)
            assert.ok(h.stdout.includes('用法'))
        })

        it('FA-103 g_fixFromType.mjs 預設連線(不給 --db 時走 g_mOrm.mjs 之 ./db, 於工作目錄=臨時資料夾下執行, 不碰專案 ./db): 只列→--apply→寫後無非字串 from、離開碼 0', async function() {
            let { dir, url } = await seed('fx4', fixFx())
            let rows0 = await readDb(url)
            let r1 = runFix(dir, [])
            assert.strictEqual(r1.status, 0, out(r1))
            assert.strictEqual(norm(await readDb(url)), norm(rows0))
            let r2 = runFix(dir, ['--apply'])
            assert.strictEqual(r2.status, 0, out(r2))
            assert.ok(r2.stdout.includes('已修正'))
            assert.ok(!(await readDb(url)).users.some((u) => u.from !== undefined && typeof u.from !== 'string'))
            assert.strictEqual(filesOf(dir, /^backup-\d+\.json$/).length, 1)
            assert.strictEqual(filesOf(dir, /^fixFromType-backup-\d+\.json$/).length, 1, '預設四表備份檔名於工作目錄')
        })

        it('FA-110 g_purgeFrom.mjs --db 預設: 只列 (表, from) 筆數並標示外部列(離開碼 0、零寫入、不產備份); 不含 email／姓名', async function() {
            let { dir, url } = await seed('pg1', stdFx())
            let rows0 = await readDb(url)
            let r = runPurge(dir, ['--db', url])
            assert.strictEqual(r.status, 0, out(r))
            for (let s of ['各表 from 值分佈', '"X"(外部列, 升版後唯讀): 1', '\'\' (後台列)', '升版後將成為外部列(唯讀)之(表, from)與筆數: 共 8 列']) {
                assert.ok(r.stdout.includes(s), `應含「${s}」\n${r.stdout}`)
            }
            assert.ok(!out(r).includes('secret-') && !out(r).includes('NAME-'))
            assert.strictEqual(norm(await readDb(url)), norm(rows0))
            assert.deepStrictEqual(filesOf(dir, /backup/), [])
        })

        it('FA-111 g_purgeFrom.mjs --table --from(dry-run): 只列將清除之列與連帶清理之引用端筆數(離開碼 0、零寫入、不產備份); 中文來源名與 all 皆可', async function() {
            let fx = stdFx()
            fx.grups.push({ id: 'g9', name: 'G9', from: '外部A' })
            let { dir, url } = await seed('pg2', fx)
            let rows0 = await readDb(url)
            let r = runPurge(dir, ['--db', url, '--table', 'grups', '--from', 'X'])
            assert.strictEqual(r.status, 0, out(r))
            for (let s of ['== grups: 將清除 1 列 ==', 'id="g2" name="G2"', '連帶清理引用 users.cgrups: 須改寫 3 列', '預設只列不改']) {
                assert.ok(r.stdout.includes(s), `應含「${s}」\n${r.stdout}`)
            }
            let r2 = runPurge(dir, ['--db', url, '--table', 'all', '--from', '外部A'])
            assert.strictEqual(r2.status, 0, out(r2))
            assert.ok(r2.stdout.includes('id="g9" name="G9"') && r2.stdout.includes('合計: 清除 1 列'))
            assert.strictEqual(norm(await readDb(url)), norm(rows0))
            assert.deepStrictEqual(filesOf(dir, /backup/), [])
        })

        it('FA-112 g_purgeFrom.mjs --apply(單表 grups): 先備份再寫、終態等於預測、引用端已清理、被清除列已刪、其餘逐位元不變、離開碼 0; 再跑無須清除(不產新備份)', async function() {
            let fx = stdFx()
            let { dir, url } = await seed('pg3', fx)
            let rows0 = await readDb(url)
            let fpRows = path.join(dir, 'rows-backup.json')
            let ok = runPurge(dir, ['--db', url, '--table', 'grups', '--from', 'X', '--apply', '--backup', fpRows])
            assert.strictEqual(ok.status, 0, out(ok))
            assert.ok(ok.stdout.includes('已清除: 刪除 1 列、改寫引用端 3 列'))
            let dbBk = filesOf(dir, /^backup-\d+\.json$/)
            assert.strictEqual(dbBk.length, 1)
            let bkDb = JSON.parse(fs.readFileSync(path.join(dir, dbBk[0]), 'utf8'))
            assert.strictEqual(JSON.stringify(byId(bkDb.find((x) => x.name === 'users').data)), JSON.stringify(byId(rows0.users)), '資料庫備份為寫入前內容')
            let bkRows = JSON.parse(fs.readFileSync(fpRows, 'utf8'))
            for (let t of TABLES) {
                assert.strictEqual(JSON.stringify(byId(bkRows[t])), JSON.stringify(byId(rows0[t])), `四表備份 ${t}`)
            }
            let rows1 = await readDb(url)
            let exp = clone(rows0)
            exp.grups = exp.grups.filter((g) => g.id !== 'g2')
            exp.users.find((u) => u.id === 'u1').cgrups = mkObj([E('G1', 'OR')])
            exp.users.find((u) => u.id === 'u2').cgrups = '{}'
            exp.users.find((u) => u.id === 'u3').cgrups = mkArr([E('G1', 'OR')])
            assert.strictEqual(norm(rows1), norm(exp))
            assert.strictEqual(auditRefs(rows1).items.length, auditRefs(rows0).items.length, '未製造新懸空')
            let again = runPurge(dir, ['--db', url, '--table', 'grups', '--from', 'X', '--apply', '--backup', path.join(dir, 'rows2.json')])
            assert.strictEqual(again.status, 0, out(again))
            assert.ok(again.stdout.includes('無須清除'))
            assert.strictEqual(fs.existsSync(path.join(dir, 'rows2.json')), false)
            assert.strictEqual(filesOf(dir, /^backup-\d+\.json$/).length, 1)
        })

        it('FA-113 g_purgeFrom.mjs --table all --apply: 四表依引用鏈序清除、同一備份; 終態逐字等於手算; 寫後授權(真 getUserRules)等於參考模型', async function() {
            let fx = stdFx()
            let { dir, url } = await seed('pg4', fx)
            let rows0 = await readDb(url)
            let r = runPurge(dir, ['--db', url, '--table', 'all', '--from', 'X', '--apply'])
            assert.strictEqual(r.status, 0, out(r))
            assert.strictEqual(filesOf(dir, /^backup-\d+\.json$/).length, 1)
            assert.strictEqual(filesOf(dir, /^purgeFrom-backup-\d+\.json$/).length, 1, '同一備份')
            let rows1 = await readDb(url)
            assert.strictEqual(norm(rows1), norm(stdAfterAllX()))
            assert.deepStrictEqual(evalAll(rows1), evalAll(refUniverse(rows0, 'X', TABLE_ORDER)))
            assert.ok(TABLES.every((t) => !rows1[t].some((x) => x.from === 'X')))
        })

        it('FA-114 g_purgeFrom.mjs 參數錯誤離開碼 2、零寫入: --from \'\'(空字串)、--from 缺值、--table 缺 --from、--from 缺 --table、--table 非法、--apply 單獨或缺 --from、未知旗標、多餘位置參數、--help 離開碼 0(不得有自動刪除之預設)', async function() {
            let { dir, url } = await seed('pg5', stdFx())
            let rows0 = await readDb(url)
            let cases = [
                ['--from 空字串', ['--table', 'grups', '--from', '', '--apply']],
                ['--from 空字串(dry-run)', ['--table', 'grups', '--from', '']],
                ['--from 缺值', ['--table', 'grups', '--from']],
                ['--from 後接旗標', ['--table', 'grups', '--from', '--apply']],
                ['--table 缺 --from', ['--table', 'grups']],
                ['--from 缺 --table', ['--from', 'X']],
                ['--table 非法', ['--table', 'user', '--from', 'X']],
                ['--table ALL(大小寫)', ['--table', 'ALL', '--from', 'X']],
                ['--apply 單獨', ['--apply']],
                ['--apply 缺 --from', ['--apply', '--table', 'grups']],
                ['未知旗標', ['--bogus']],
                ['多餘位置參數', ['stray']],
                ['--db 缺值', ['--db']],
            ]
            for (let [label, args] of cases) {
                let r = runPurge(dir, args) //參數錯誤須於連庫之前即離開(工作目錄 dir 下之 ./db 即種子庫, 若誤連亦可由零寫入斷言抓到)
                assert.strictEqual(r.status, 2, `${label}: 離開碼須為 2(${out(r)})`)
                assert.ok(r.stdout.includes('用法'), label)
            }
            assert.strictEqual(norm(await readDb(url)), norm(rows0), '零寫入')
            assert.deepStrictEqual(filesOf(dir, /backup/), [])
            let h = runPurge(dir, ['--help'])
            assert.strictEqual(h.status, 0)
            assert.ok(h.stdout.includes('用法'))
        })

        it('FA-115 g_purgeFrom.mjs 規劃被拒(引用端含 NaN): dry-run 與 --apply 皆離開碼 1、零寫入、不產備份', async function() {
            let fx = stdFx()
            fx.users[0].cgrups = '{"G2":{"mode":"AND","isActive":"y","w":NaN}}'
            let { dir, url } = await seed('pg6', fx)
            let rows0 = await readDb(url)
            for (let apply of [false, true]) {
                let r = runPurge(dir, ['--db', url, '--table', 'grups', '--from', 'X', ...(apply ? ['--apply'] : [])])
                assert.strictEqual(r.status, 1, out(r))
                assert.ok(r.stdout.includes('[拒絕] renameCascadeUnsupported'))
                assert.ok(r.stdout.includes('階段 plan'))
            }
            assert.strictEqual(norm(await readDb(url)), norm(rows0))
            assert.deepStrictEqual(filesOf(dir, /backup/), [])
        })

        it('FA-116 g_purgeFrom.mjs 四表備份失敗 → 離開碼 1、零寫入; --backup 指向資料庫檔本身(data.mdb)或其硬連結 → 拒絕覆寫(wx)、離開碼 1、資料庫檔不變、零寫入; 資料庫不存在 → 離開碼 1', async function() {
            let { dir, url } = await seed('pg7', stdFx())
            let rows0 = await readDb(url)
            let bad = runPurge(dir, ['--db', url, '--table', 'all', '--from', 'X', '--apply', '--backup', path.join(dir, 'nodir', 'rows.json')])
            assert.strictEqual(bad.status, 1, out(bad))
            assert.ok(bad.stdout.includes('階段 backupRows'))
            assert.strictEqual(norm(await readDb(url)), norm(rows0))
            let mdb = path.join(url, DB_NAME, 'users', 'data.mdb')
            let sizeBefore = fs.statSync(mdb).size
            let aliases = [mdb]
            let hl = path.join(dir, 'mdb-hardlink.json')
            try {
                fs.linkSync(mdb, hl)
                aliases.push(hl)
            }
            catch (err) {
                console.log(`(FA-116 略過硬連結別名: ${err.code})`)
            }
            for (let bp of aliases) {
                for (let f of filesOf(dir, /^backup-\d+\.json$/)) {
                    fs.rmSync(path.join(dir, f))
                }
                let r = runPurge(dir, ['--db', url, '--table', 'all', '--from', 'X', '--apply', '--backup', bp])
                assert.strictEqual(r.status, 1, out(r))
                assert.ok(r.stdout.includes('階段 backupRows'))
                assert.strictEqual(fs.statSync(mdb).size, sizeBefore, '資料庫檔未被覆寫')
                assert.strictEqual(norm(await readDb(url)), norm(rows0), '零寫入')
            }
            let nodb = path.join(dir, 'no-such-db')
            let r2 = runPurge(dir, ['--db', nodb, '--table', 'all', '--from', 'X'])
            assert.strictEqual(r2.status, 1)
            assert.ok(r2.stdout.includes('資料庫不存在'))
            assert.strictEqual(fs.existsSync(nodb), false)
        })

        it('FA-117 g_purgeFrom.mjs 預設連線(不給 --db, 走 g_mOrm.mjs 之 ./db, 於臨時工作目錄): 只列→dry-run→--apply 清除、離開碼 0', async function() {
            let { dir, url } = await seed('pg8', stdFx())
            let rows0 = await readDb(url)
            assert.strictEqual(runPurge(dir, []).status, 0)
            assert.strictEqual(runPurge(dir, ['--table', 'users', '--from', 'X']).status, 0)
            assert.strictEqual(norm(await readDb(url)), norm(rows0))
            let r = runPurge(dir, ['--table', 'users', '--from', 'X', '--apply'])
            assert.strictEqual(r.status, 0, out(r))
            let rows1 = await readDb(url)
            assert.deepStrictEqual(rows1.users.map((u) => u.id).sort(), ['u1', 'u3', 'u4', 'u5'])
            assert.strictEqual(filesOf(dir, /^purgeFrom-backup-\d+\.json$/).length, 1)
        })

        it('FA-120 後端占用時 --apply 拒絕(Windows): 兩腳本皆離開碼 1、階段 inuse、零寫入、不產備份、資料夾完好; 持有期間只列/dry-run 仍可(唯讀); 持有者結束後 --apply 成功', async function() {
            if (!onWin) {
                this.skip()
            }
            let { dir, url } = await seed('use1', fixFx())
            let rows0 = await readDb(url)
            let child = spawn(process.execPath, [HOLDER, url], { stdio: ['pipe', 'pipe', 'pipe'] })
            await new Promise((resolve, reject) => {
                let buf = ''
                let timer = setTimeout(() => reject(new Error(`holder not ready: ${buf}`)), 30000)
                child.stdout.on('data', (d) => {
                    buf += String(d)
                    if (buf.includes('holder-ready')) {
                        clearTimeout(timer)
                        resolve()
                    }
                })
            })
            try {
                let a = runFix(dir, ['--db', url, '--apply'])
                assert.strictEqual(a.status, 1, out(a))
                assert.ok(a.stdout.includes('階段 inuse') && a.stdout.includes('被其他行程占用'), a.stdout)
                let b = runPurge(dir, ['--db', url, '--table', 'all', '--from', 'pd', '--apply'])
                assert.strictEqual(b.status, 1, out(b))
                assert.ok(b.stdout.includes('階段 inuse'))
                assert.deepStrictEqual(filesOf(dir, /backup/), [], '拒絕時不產備份')
                assert.deepStrictEqual(fs.readdirSync(url), [DB_NAME], '資料夾完好、無暫名殘留')
                //唯讀: 只列不受占用影響
                assert.strictEqual(runFix(dir, ['--db', url]).status, 0)
                assert.strictEqual(runPurge(dir, ['--db', url, '--table', 'all', '--from', 'pd']).status, 0)
                assert.ok(child.exitCode === null, '持有者仍在運作')
            }
            finally {
                await new Promise((resolve) => {
                    child.on('exit', resolve)
                    child.stdin.end()
                })
            }
            assert.strictEqual(norm(await readDb(url)), norm(rows0), '拒絕期間零寫入')
            let ok = runFix(dir, ['--db', url, '--apply'])
            assert.strictEqual(ok.status, 0, out(ok))
            assert.ok(ok.stdout.includes('已修正'))
        })

    })


    // ---------------------------------------------------------------
    // 站點不變式(靜態)
    // ---------------------------------------------------------------

    describe('站點不變式(靜態掃描)', function() {

        let read = (rel) => fs.readFileSync(path.join(projRoot, rel), 'utf8')
        //可執行碼行: 略過整行註解與行尾 // 註解(// 前須有空白)
        let codeOf = (rel) => read(rel).split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).map((l) => l.replace(/\s\/\/.*$/, '')).join('\n')
        const FILES = ['src/js/fromAudit.mjs', 'test/tools/fromTools.mjs', 'g_fixFromType.mjs', 'g_purgeFrom.mjs']

        it('FA-190 不寫 srLog、不引用 server／後端模組(離線工具; id 僅輸出至 stdout)', function() {
            for (let rel of FILES) {
                let c = codeOf(rel)
                assert.ok(!/\bsrLog\b/.test(c), `${rel} 不得出現 srLog`)
                assert.ok(!/from\s+['"][^'"]*\bserver\//.test(c), `${rel} 不得匯入 server/`)
            }
        })

        it('FA-191 fromAudit.mjs 為純函數檔: 只匯入 externalRows／refCascade／getDelRefCount(不依賴 Vue／DOM／ORM／fs); 不直接賦值授權欄位、不自寫 JSON.stringify 授權', function() {
            let imps = codeOf('src/js/fromAudit.mjs').split('\n').filter((l) => /^\s*import\b/.test(l)).map((l) => /from\s+['"]([^'"]+)['"]/.exec(l)[1]).sort()
            assert.deepStrictEqual(imps, ['./externalRows.mjs', './getDelRefCount.mjs', './refCascade.mjs'])
            let c = codeOf('src/js/fromAudit.mjs')
            assert.ok(!/\.(cgrups|cpemis|crules)\s*=[^=]/.test(c))
            assert.ok(!/JSON\.stringify/.test(c))
            assert.ok(!/\.name === undefined\)\s*\?\s*''/.test(c), '不另寫「列無 name 視為 空字串」之找列(單一擁有者 findRefRows)')
        })

        it('FA-192 兩腳本之失敗以非 0 離開碼表達(.catch 設 process.exitCode = 1); g_purgeFrom 之 apply 只來自 --apply 旗標(無自動刪除之預設), 且 --apply 須搭配 --table', function() {
            for (let rel of ['g_fixFromType.mjs', 'g_purgeFrom.mjs']) {
                assert.ok(/\.catch\(\(err\) => \{[\s\S]*process\.exitCode = 1/.test(read(rel)), `${rel} 之 catch 須設 exitCode`)
                assert.ok(/process\.exitCode = (2|flag\('--help'\) \? 0 : 2)/.test(read(rel)), `${rel} 須有參數錯誤離開碼 2`)
            }
            let p = codeOf('g_purgeFrom.mjs')
            assert.strictEqual((p.match(/apply:\s*[^,}]+/g) || []).join('|'), 'apply: flag(\'--apply\')')
            assert.ok(/flag\('--apply'\) && !flag\('--table'\)/.test(p), '--apply 須搭配 --table')
            assert.ok(/flag\('--from'\) && from === ''/.test(p), '--from 空字串須拒絕')
            let f = codeOf('g_fixFromType.mjs')
            assert.strictEqual((f.match(/apply:\s*[^,}]+/g) || []).join('|'), 'apply: flag(\'--apply\')')
        })

        it('FA-193 刪除只經 fromTools.delRows 一處且僅 ORM 之 del(無 delAll／無 ORM insert／無 fs.rm* 於工具與腳本); 寫入前之占用偵測先於開啟資料庫', function() {
            let t = codeOf('test/tools/fromTools.mjs')
            assert.strictEqual((t.match(/\.del\(/g) || []).length, 1, 'ORM del 僅一處')
            assert.ok(!/delAll\(/.test(t) && !/\.insert\(/.test(t))
            assert.ok(!/fs\.(rm|rmdir|unlink)\w*\(/.test(t), '工具不刪檔')
            for (let rel of ['g_fixFromType.mjs', 'g_purgeFrom.mjs']) {
                let c = codeOf(rel)
                assert.ok(!/delAll\(|\.del\(|\.insert\(|fs\.(rm|rmdir|unlink)\w*\(/.test(c), `${rel} 不直接寫庫`)
                assert.ok(c.indexOf('checkDbNotInUse(') >= 0 && c.indexOf('checkDbNotInUse(') < c.indexOf('WServOrm(ds'), `${rel}: 占用偵測須在開啟資料庫之前`)
                assert.ok(c.indexOf('checkDbNotInUse(') < c.indexOf('import(\'./g_mOrm.mjs\')'), `${rel}: 占用偵測須在載入 g_mOrm(開啟資料庫)之前`)
            }
        })

    })

})


// ---------------------------------------------------------------
// 隨機宇宙與獨立參考模型(FA-027、FA-031、FA-050 共用; 不經 refCascade／fromAudit)
// ---------------------------------------------------------------

//entriesOf: 引用字串(JSON.stringify 產生, 以 JSON.parse 獨立解碼)之項目 [{ name, mode, isActive }]; 壞 JSON／空字串／純量為空; 無名元素略過(不對應任何名稱)
function entriesOf(str) {
    let kp = null
    try {
        kp = JSON.parse(str)
    }
    catch (err) {
        return []
    }
    if (kp === null || typeof kp !== 'object') {
        return []
    }
    if (Array.isArray(kp)) {
        return kp.filter((el) => el !== null && typeof el === 'object' && typeof el.name === 'string').map((el) => ({ name: el.name, mode: el.mode, isActive: el.isActive }))
    }
    return Object.keys(kp).map((k) => {
        let v = kp[k]
        return { name: k, mode: v !== null && typeof v === 'object' ? v.mode : undefined, isActive: v !== null && typeof v === 'object' ? v.isActive : v }
    })
}

//goneNames: 清除 keyTable 中 from===X 之列後「名稱消失」(被清除者之名稱且無任何存續列同名)之集合; targets 以 id 為名稱, 其餘以 name(缺視為 '')
function goneNames(u, keyTable, X) {
    let nameOf = (r) => (keyTable === 'targets' ? r.id : (typeof r.name === 'string' ? r.name : ''))
    let alive = new Set(u[keyTable].filter((r) => r.from !== X).map(nameOf))
    return new Set(u[keyTable].filter((r) => r.from === X).map(nameOf).filter((n) => !alive.has(n)))
}

//refRemoveGone: 獨立之引用移除(物件／陣列形式; 移除名稱在 gone 者; 無命中回原字串)
function refRemoveGone(str, gone) {
    let kp = null
    try {
        kp = JSON.parse(str)
    }
    catch (err) {
        return str
    }
    if (kp === null || typeof kp !== 'object') {
        return str
    }
    let removed = false
    let o = null
    if (Array.isArray(kp)) {
        o = kp.filter((el) => {
            let nm = (el !== null && typeof el === 'object' && typeof el.name === 'string') ? el.name : null
            let g = nm !== null && gone.has(nm)
            removed = removed || g
            return !g
        })
    }
    else {
        o = Object.create(null)
        Object.keys(kp).forEach((k) => {
            if (gone.has(k)) {
                removed = true
            }
            else {
                o[k] = kp[k]
            }
        })
    }
    return removed ? JSON.stringify(o) : str
}

//refUniverse: 參考模型——自宇宙移除 keyTables 中 from===X 之列, 並自引用端字串移除其(已無存續同名之)名稱; 與 fromAudit 完全獨立
function refUniverse(u, X, keyTables) {
    let out = clone(u)
    let gone = {}
    for (let t of keyTables) {
        gone[t] = goneNames(u, t, X)
    }
    let HOLD = { targets: ['pemis', 'crules'], pemis: ['grups', 'cpemis'], grups: ['users', 'cgrups'] }
    for (let t of keyTables) {
        if (HOLD[t]) {
            let [h, f] = HOLD[t]
            out[h] = out[h].map((r) => ({ ...r, [f]: typeof r[f] === 'string' ? refRemoveGone(r[f], gone[t]) : r[f] }))
        }
    }
    for (let t of keyTables) {
        out[t] = out[t].filter((r) => r.from !== X)
    }
    return out
}

//genUniverse: 隨機宇宙(來源 X 散布於四表; 另有 ''／Y／null／5／缺欄; 歷史同名; 引用含懸空名、無名元素、壞 JSON); dense 為稠密模式(不產壞 JSON／空字串、啟用居多)
function genUniverse(rng, dense = false, andHeavy = false) {
    let pick = (a) => a[Math.floor(rng() * a.length)]
    let fromPool = ['', '', 'X', 'X', 'Y', null, 5, undefined]
    let withFrom = (row) => {
        let f = pick(fromPool)
        return f === undefined ? row : { ...row, from: f }
    }
    let genRefs = (names) => {
        let r = rng()
        if (!dense && r < 0.04) {
            return '{oops'
        }
        if (!dense && r < 0.08) {
            return ''
        }
        let n = dense ? 1 + Math.floor(rng() * 4) : Math.floor(rng() * 5)
        let mk = () => ({ mode: andHeavy ? pick(['AND', 'AND', 'AND', 'OR']) : pick(['OR', 'AND', 'OR', 'AND', undefined, 'xor']), isActive: andHeavy ? 'y' : (dense ? pick(['y', 'y', 'y', 'y', 'y', 'y', 'y', 'n']) : pick(['y', 'y', 'y', 'n'])) })
        //稠密模式: 首項恆為「啟用之 OR 引用 names[0](該名稱之實體必存在)」, 使授權多數為非空(否則隨機 AND 交集使授權幾乎恆空, 語意比對流於空轉); 其餘項隨機(含 AND／懸空名)
        let first = () => ({ mode: 'OR', isActive: 'y' })
        if (rng() < 0.4) {
            let a = []
            for (let i = 0; i < n; i++) {
                if (dense && i === 0) {
                    a.push({ name: names[0], ...first() })
                    continue
                }
                let e = mk()
                a.push(!dense && rng() < 0.05 ? { ...e } : { name: pick(names), ...e }) //偶有無名元素
            }
            return JSON.stringify(a)
        }
        let o = Object.create(null)
        for (let i = 0; i < n; i++) {
            if (dense && i === 0) {
                o[names[0]] = first()
                continue
            }
            o[pick(names)] = mk()
        }
        return JSON.stringify(o)
    }
    let genRules = () => {
        let ks = ['T0', 'T1', 'T2', 'T3', 'TX']
        let ys = dense ? ['y', 'y', 'y', 'n'] : ['y', 'n']
        let n = dense ? 2 + Math.floor(rng() * 3) : Math.floor(rng() * 4)
        if (rng() < 0.4) {
            return JSON.stringify(Array.from({ length: n }, () => ({ name: pick(ks), isActive: pick(ys) })))
        }
        let o = Object.create(null)
        for (let i = 0; i < n; i++) {
            o[pick(ks)] = pick(ys)
        }
        return JSON.stringify(o)
    }
    let nT = 2 + Math.floor(rng() * 3)
    let targets = Array.from({ length: nT }, (_, i) => withFrom({ id: `T${i}` }))
    let pemis = Array.from({ length: 1 + Math.floor(rng() * 3) }, (_, i) => withFrom({ id: `p${i}`, name: `P${i}`, crules: genRules() }))
    if (rng() < 0.2) {
        pemis.push(withFrom({ id: 'pd', name: 'P0', crules: genRules() })) //歷史同名
    }
    let grups = Array.from({ length: 1 + Math.floor(rng() * 3) }, (_, i) => withFrom({ id: `g${i}`, name: `G${i}`, cpemis: genRefs(['P0', 'P1', 'P2', 'PX']) }))
    if (rng() < 0.2) {
        grups.push(withFrom({ id: 'gd', name: 'G0', cpemis: genRefs(['P0', 'P1', 'PX']) }))
    }
    let users = Array.from({ length: 2 + Math.floor(rng() * 3) }, (_, i) => withFrom({ id: `u${i}`, name: `U${i}`, email: `u${i}@x.com`, isAdmin: pick(['n', 'n', 'y']), cgrups: genRefs(['G0', 'G1', 'G2', 'GX']) }))
    return { targets, pemis, grups, users }
}
