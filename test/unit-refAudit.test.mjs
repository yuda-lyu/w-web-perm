//懸空引用稽核與一次性清理之單元測試(run06 audit; 規則帳本 R-REF-CASCADE-01 之配套、適用表 n 之舊資料升版清理; Q9 auditRefs 稽核工具).
//受測站點: src/js/refAudit.mjs(auditRefs)、server/tools/authRefsAudit.mjs(離線 CLI)、server/tools/authRefsClean.mjs(runClean)、g_authRefsClean.mjs(連庫 CLI).
//
//規格句(使用者裁示, run06 設計摘要):
//  S1 懸空引用＝引用名稱查無實體(users.cgrups→grups.name、grups.cpemis→pemis.name、pemis.crules→targets.id); 比對同伺服端 findRefRows(===、缺 name 視為 ''), crules 以 getPropKey 轉屬性鍵; 歷史同名(對到多列)不是懸空.
//  S2 清理＝把懸空項目自授權字串移除, 不論 isActive; 改寫經 refCascade.rewriteRefs(物件形式仍物件、陣列形式仍陣列、未命中者同一字串); 效果等同舊版「找不到即忽略」.
//  S3 壞 JSON 之列容錯: 列入 badJson、不當作有引用、不動; 名稱非字串之引用不對應任何名稱, 列入 unnamed、不處理.
//  S4 稽核須回報「清理後 AND 限制解除、權限可能變多」之使用者／群組數(R-AUTH-MERGE-00／R-PRINCIPLE-00 c); 不回顯 email／name.
//  S5 一次性清理: 預設只列不改; --apply 才寫入(經 ORM, 只改該欄位), 寫入前先備份資料庫與將改寫之三張引用端表, 任一備份失敗即中止(零寫入); save 逐筆 ok:0 視為失敗(離開碼非 0)並列出; 寫完重新稽核應為 0 懸空.
//
//測試組成:
//  RA-001～012  auditRefs(三種引用×物件／陣列×啟用／停用×OR／AND／mode 缺、widen／counts、歷史同名、空名稱、__proto__／constructor、非字串名稱、壞 JSON、changes 逐字、個資、冪等、與 findRefRows 互驗、Infinity／NaN 之 unsafe(外審 R2))
//  RA-020～021  語意不變式(以真 src/plugins/mShare.mjs 之 getUserRules): 清理後＝自原始字串刪懸空項目後之結果(隨機宇宙 ≥ 2000 組、固定種子)、只放寬不收嚴、widen 旗標之健全性
//  RA-030～037  離線 CLI server/tools/authRefsAudit.mjs(子行程, 逾時 30 秒); RA-035 unsafe 之報告; RA-036a～e／037 --clean-out 不得與輸入匯出檔為同一檔(外審 R3: 同一路徑、大小寫、相對／絕對、硬連結、符號連結、對照組)
//  RA-040～049, 056～057  runClean(單元級 ORM 替身 mkTable); RA-056 unsafe 列不寫且寫後殘留不誤判失敗; RA-057 --backup 與既有檔同一檔之別名一律拒絕(wx)
//  RA-050～055, 058  runClean 與 g_authRefsClean.mjs 對真 lmdb 臨時庫(test/_tmp/refAudit/<tag>/): 備份檔先於寫入、寫後 0 懸空、備份失敗零寫入; 預設連線(g_mOrm.mjs)於臨時工作目錄下驗證
//站點全集(規則帳本盤點指令): rg -n "refAudit|authRefsAudit|authRefsClean|g_authRefsClean" src test g_*.mjs --glob '!tmp/**'
//跑法: npx mocha test/unit-refAudit.test.mjs --timeout 120000
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { spawnSync } from 'child_process'
import { fileURLToPath } from 'url'
import JSON5 from 'json5'
import WOrm from 'w-orm-lmdb/src/WOrmLmdb.mjs'
import WServOrm from 'w-serv-orm/src/WServOrm.mjs'
import ds from '../src/schema/index.mjs'
import auditRefs from '../src/js/refAudit.mjs'
import findRefRows from '../src/js/findRefRows.mjs'
import { getUserRules } from '../src/plugins/mShare.mjs'
import { buildReport, formatReport, cleanOutOf } from '../server/tools/authRefsAudit.mjs'
import { runClean } from '../server/tools/authRefsClean.mjs'
import { mkTable } from './tools/unitOrm.mjs'


const projRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const TOOL_AUDIT = path.join(projRoot, 'server', 'tools', 'authRefsAudit.mjs')
const TOOL_CLEAN = path.join(projRoot, 'g_authRefsClean.mjs')
const TMP = path.join(projRoot, 'test', '_tmp', 'refAudit')
const DB_NAME = 'wperm' //同 g_getSettings.mjs
const HOLDERS = ['users', 'grups', 'pemis']
const TABLES = ['users', 'grups', 'pemis', 'targets']


// ---------------------------------------------------------------
// helpers
// ---------------------------------------------------------------

//授權字串之逐字產生器(與 JSON.stringify 之輸出同形, 供 changes 逐字驗證; 名稱／mode／isActive 皆字面): rule 為 crules(物件形式值為 'y'／'n' 字串, 無 mode)
let mkObj = (es, rule = false) => `{${es.map((e) => (rule ? `"${e.name}":"${e.active}"` : `"${e.name}":{${e.mode === undefined ? '' : `"mode":"${e.mode}",`}"isActive":"${e.active}"}`)).join(',')}}`
let mkArr = (es, rule = false) => `[${es.map((e) => `{"name":"${e.name}",${(rule || e.mode === undefined) ? '' : `"mode":"${e.mode}",`}"isActive":"${e.active}"}`).join(',')}]`

let sha1 = (fp) => crypto.createHash('sha1').update(fs.readFileSync(fp)).digest('hex')
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
let clone = (o) => JSON.parse(JSON.stringify(o))
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

//套用 changes 於資料(回傳新資料, 不改輸入)
let applyChanges = (d, changes) => {
    let out = clone(d)
    for (let c of changes) {
        let r = out[c.table].find((x) => x.id === c.id)
        assert.strictEqual(r[c.field], c.before, `changes.before 須等於原字串(${c.table} ${c.id})`)
        r[c.field] = c.after
    }
    return out
}

//髒資料(runClean／CLI 共用): 懸空 4 項(u1 之 GX 啟用 AND、u4 之 GY 停用、g1 之 PX 啟用 AND、p1 之 TZ), 壞 JSON 1 列(u3), 另含 email 供個資斷言
let dirtyFx = () => ({
    users: [
        { id: 'u1', name: 'alice', email: 'secret-alice@x.com', isActive: 'y', from: '', timeUpdate: '2026-01-01 00:00:00', userIdUpdate: 'adm', cgrups: mkObj([{ name: 'G1', mode: 'OR', active: 'y' }, { name: 'GX', mode: 'AND', active: 'y' }]) },
        { id: 'u2', name: 'bob', email: 'secret-bob@x.com', isActive: 'y', from: '', timeUpdate: '2026-01-02 00:00:00', userIdUpdate: 'adm', cgrups: mkObj([{ name: 'G1', mode: 'OR', active: 'y' }]) },
        { id: 'u3', name: 'carol', email: 'secret-carol@x.com', isActive: 'y', from: '', timeUpdate: '2026-01-03 00:00:00', userIdUpdate: 'adm', cgrups: '{oops' },
        { id: 'u4', name: 'dave', email: 'secret-dave@x.com', isActive: 'y', from: 'app', timeUpdate: '2026-01-04 00:00:00', userIdUpdate: 'adm', cgrups: mkArr([{ name: 'GY', mode: 'OR', active: 'n' }, { name: 'G1', mode: 'AND', active: 'y' }]) },
    ],
    grups: [
        { id: 'g1', name: 'G1', isActive: 'y', from: '', order: 1, timeUpdate: '2026-02-01 00:00:00', userIdUpdate: 'adm', cpemis: mkObj([{ name: 'P1', mode: 'OR', active: 'y' }, { name: 'PX', mode: 'AND', active: 'y' }]) },
        { id: 'g2', name: 'G2', isActive: 'y', from: '', order: 2, timeUpdate: '2026-02-02 00:00:00', userIdUpdate: 'adm', cpemis: mkObj([{ name: 'P1', mode: 'OR', active: 'y' }]) },
    ],
    pemis: [
        { id: 'p1', name: 'P1', isActive: 'y', from: '', order: 1, timeUpdate: '2026-03-01 00:00:00', userIdUpdate: 'adm', crules: mkObj([{ name: 'T1', active: 'y' }, { name: 'TZ', active: 'y' }], true) },
    ],
    targets: [{ id: 'T1', order: 1 }, { id: 'T2', order: 2 }],
})

//髒資料加一列「含 JSON5 Infinity 且有懸空項」之 crules(p2; 外審 R2): 不清理(unsafe), 其懸空項 X 為已知殘留; 標的另有 id 'Infinity'
let unsafeFx = () => {
    let d = dirtyFx()
    d.pemis.push({ id: 'p2', name: 'P2', isActive: 'y', from: '', order: 2, timeUpdate: '2026-03-02 00:00:00', userIdUpdate: 'adm', crules: '[{"name":Infinity,"isActive":"y"},{"name":"X","isActive":"y"}]' })
    d.targets.push({ id: 'Infinity', order: 3 })
    return d
}

//單元級 ORM 替身之 woItems
let mkWo = (d, fails = {}) => {
    let wo = {}
    for (let t of TABLES) {
        wo[t] = mkTable(d[t], fails[t] || {})
    }
    return wo
}
let snap = (wo) => Object.fromEntries(TABLES.map((t) => [t, wo[t].snapshot()]))
let cntOf = (wo) => TABLES.reduce((a, t) => a + wo[t].cnt.insert + wo[t].cnt.save + wo[t].cnt.del + wo[t].cnt.delAll, 0)


describe('unit-refAudit (懸空引用稽核與一次性清理)', function() {

    before(function() {
        fs.rmSync(TMP, { recursive: true, force: true })
        fs.mkdirSync(TMP, { recursive: true })
    })

    after(function() {
        fs.rmSync(TMP, { recursive: true, force: true })
    })


    // ---------------------------------------------------------------
    // auditRefs
    // ---------------------------------------------------------------

    describe('auditRefs(純函數)', function() {

        it('RA-001a users.cgrups 引用不存在之群組: 物件／陣列形式 × 啟用／停用 × OR／AND／mode 缺, items 與 changes 逐字', function() {
            let n = 0
            for (let form of ['obj', 'arr']) {
                for (let active of ['y', 'n']) {
                    for (let mode of ['OR', 'AND', undefined]) {
                        let mk = form === 'obj' ? mkObj : mkArr
                        let str = mk([{ name: 'E', mode: 'OR', active: 'y' }, { name: 'X', mode, active }])
                        let rp = auditRefs({ users: [{ id: 'h', cgrups: str }], grups: [{ id: 't', name: 'E', cpemis: '{}' }], pemis: [], targets: [] })
                        let label = `${form} active=${active} mode=${mode}`
                        let effect = active === 'n' ? 'inactive' : (mode === 'OR' ? 'or' : 'and')
                        assert.deepStrictEqual(rp.items, [{ table: 'users', holderId: 'h', field: 'cgrups', name: 'X', isActive: active, mode, effect }], label)
                        assert.deepStrictEqual(rp.changes, [{ table: 'users', id: 'h', field: 'cgrups', before: str, after: mk([{ name: 'E', mode: 'OR', active: 'y' }]), nDel: 1 }], label)
                        n++
                    }
                }
            }
            assert.strictEqual(n, 12)
        })

        it('RA-001b grups.cpemis 引用不存在之權限: 物件／陣列形式 × 啟用／停用 × OR／AND／mode 缺, items 與 changes 逐字', function() {
            let n = 0
            for (let form of ['obj', 'arr']) {
                for (let active of ['y', 'n']) {
                    for (let mode of ['OR', 'AND', undefined]) {
                        let mk = form === 'obj' ? mkObj : mkArr
                        let str = mk([{ name: 'X', mode, active }, { name: 'E', mode: 'AND', active: 'y' }])
                        let rp = auditRefs({ users: [], grups: [{ id: 'h', name: 'GH', cpemis: str }], pemis: [{ id: 't', name: 'E', crules: '{}' }], targets: [] })
                        let label = `${form} active=${active} mode=${mode}`
                        let effect = active === 'n' ? 'inactive' : (mode === 'OR' ? 'or' : 'and')
                        assert.deepStrictEqual(rp.items, [{ table: 'grups', holderId: 'h', field: 'cpemis', name: 'X', isActive: active, mode, effect }], label)
                        assert.deepStrictEqual(rp.changes, [{ table: 'grups', id: 'h', field: 'cpemis', before: str, after: mk([{ name: 'E', mode: 'AND', active: 'y' }]), nDel: 1 }], label)
                        n++
                    }
                }
            }
            assert.strictEqual(n, 12)
        })

        it('RA-001c pemis.crules 引用不存在之管控對象 id: 物件／陣列形式 × 啟用／停用, mode 為 null、effect 為 rule', function() {
            let n = 0
            for (let form of ['obj', 'arr']) {
                for (let active of ['y', 'n']) {
                    let mk = (es) => (form === 'obj' ? mkObj(es, true) : mkArr(es, true))
                    let str = mk([{ name: 'E', active: 'y' }, { name: 'X', active }])
                    let rp = auditRefs({ users: [], grups: [], pemis: [{ id: 'h', name: 'PH', crules: str }], targets: [{ id: 'E' }] })
                    let label = `${form} active=${active}`
                    assert.deepStrictEqual(rp.items, [{ table: 'pemis', holderId: 'h', field: 'crules', name: 'X', isActive: active, mode: null, effect: 'rule' }], label)
                    assert.deepStrictEqual(rp.changes, [{ table: 'pemis', id: 'h', field: 'crules', before: str, after: mk([{ name: 'E', active: 'y' }]), nDel: 1 }], label)
                    assert.strictEqual(rp.widen.length, 0, 'crules 懸空不影響授權, 無 widen')
                    n++
                }
            }
            assert.strictEqual(n, 4)
        })

        it('RA-002 效果分類與 widen／counts: 啟用 AND(含 mode 缺／非法)、唯一 OR 且同層有合法 AND、他有 OR、停用、名稱非字串之 AND 殘留', function() {
            let E1 = { name: 'E1', mode: 'OR', active: 'y' }
            let cases = [
                ['ua', mkObj([E1, { name: 'X', mode: 'AND', active: 'y' }]), true],
                ['ub', mkObj([{ name: 'E1', mode: 'AND', active: 'y' }, { name: 'X', mode: 'OR', active: 'y' }]), true], //唯一 OR 懸空 + 合法 AND: 現況基底為空集
                ['uc', mkObj([E1, { name: 'E2', mode: 'OR', active: 'y' }, { name: 'X', mode: 'OR', active: 'y' }]), false], //另有 OR 實體: 懸空 OR 貢獻 0, 清理不改變
                ['ud', mkObj([{ name: 'X', mode: 'OR', active: 'y' }]), false],
                ['ue', mkObj([{ name: 'X', mode: 'AND', active: 'y' }]), false], //無其他有效項: 清理後仍空
                ['uf', mkObj([E1, { name: 'X', mode: 'AND', active: 'n' }]), false], //停用
                ['ug', mkObj([E1, { name: 'X', active: 'y' }]), true], //mode 缺 → 視為 AND
                ['uh', mkObj([E1, { name: 'X', mode: 'xor', active: 'y' }]), true], //mode 非法 → 視為 AND
                ['ui', '[{"mode":"AND","isActive":"y"},{"name":"X","mode":"AND","isActive":"y"},{"name":"E1","mode":"OR","isActive":"y"}]', false], //無 name 之 AND 項殘留(內容恆空), 清理後結果仍空
                ['uj', mkObj([{ name: 'E1', mode: 'AND', active: 'y' }, { name: 'X', mode: 'AND', active: 'y' }]), true],
                ['uk', mkObj([{ name: 'E1', mode: 'xor', active: 'y' }, { name: 'X', mode: 'OR', active: 'y' }]), false], //同層只有 mode 非法之實體: 清理後無合法項, 仍空
            ]
            let rp = auditRefs({
                users: cases.map(([id, cgrups]) => ({ id, cgrups })),
                grups: [{ id: 'g1', name: 'E1', cpemis: '{}' }, { id: 'g2', name: 'E2', cpemis: '{}' }],
                pemis: [],
                targets: [],
            })
            assert.deepStrictEqual(rp.widen.map((w) => w.holderId), cases.filter((c) => c[2]).map((c) => c[0]), 'widen 之使用者')
            assert.ok(rp.widen.every((w) => w.table === 'users' && w.via === 'direct' && w.field === 'cgrups'))
            let eff = (id) => rp.items.find((x) => x.holderId === id).effect
            assert.deepStrictEqual(['ua', 'ub', 'uc', 'ud', 'ue', 'uf', 'ug', 'uh', 'ui', 'uj', 'uk'].map(eff), ['and', 'or', 'or', 'or', 'and', 'inactive', 'and', 'and', 'and', 'and', 'or'])
            let c = rp.counts
            assert.strictEqual(c.nItems, 11)
            assert.strictEqual(c.nAndActive, 6)
            assert.strictEqual(c.nOrActive, 4)
            assert.strictEqual(c.nInactive, 1)
            assert.strictEqual(c.nActive, 10)
            assert.strictEqual(c.nAndActiveHolders, 6)
            assert.strictEqual(c.nWidenUsers, 5)
            assert.strictEqual(c.nWidenGrups, 0)
            assert.strictEqual(c.byTable.users.nHolders, 11)
            assert.strictEqual(c.nUnnamed, 1, 'ui 之無 name 元素')
            assert.strictEqual(c.nChanges, 11)
        })

        it('RA-002b 經群組傳導之 widen: 群組 cpemis 之 AND 懸空使其結果為空, 啟用引用該群組之使用者列入(via=grups), 僅停用引用者不列', function() {
            let rp = auditRefs({
                users: [
                    { id: 'u1', cgrups: mkObj([{ name: 'G', mode: 'OR', active: 'y' }]) },
                    { id: 'u2', cgrups: mkObj([{ name: 'G', mode: 'OR', active: 'n' }]) },
                    { id: 'u3', cgrups: mkObj([{ name: 'H', mode: 'OR', active: 'y' }]) },
                ],
                grups: [
                    { id: 'g1', name: 'G', cpemis: mkObj([{ name: 'P', mode: 'OR', active: 'y' }, { name: 'PX', mode: 'AND', active: 'y' }]) },
                    { id: 'g2', name: 'H', cpemis: '{}' },
                ],
                pemis: [{ id: 'p1', name: 'P', crules: '{}' }],
                targets: [],
            })
            assert.deepStrictEqual(rp.widen, [
                { table: 'grups', holderId: 'g1', field: 'cpemis', via: 'direct' },
                { table: 'users', holderId: 'u1', field: 'cgrups', via: 'grups' },
            ])
            assert.strictEqual(rp.counts.nWidenUsers, 1)
            assert.strictEqual(rp.counts.nWidenGrups, 1)
            assert.strictEqual(rp.counts.nAndActiveHolders, 1)
        })

        it('RA-003 歷史同名(名稱對到多列)不是懸空, 不動: 群組、權限各兩列同名, 引用之; 另一不存在名稱仍清掉', function() {
            let d = {
                users: [{ id: 'u1', cgrups: mkObj([{ name: 'H', mode: 'AND', active: 'y' }, { name: 'Z', mode: 'AND', active: 'y' }]) }],
                grups: [
                    { id: 'g1', name: 'H', cpemis: mkObj([{ name: 'PH', mode: 'OR', active: 'y' }, { name: 'PZ', mode: 'OR', active: 'y' }]) },
                    { id: 'g2', name: 'H', cpemis: '{}' },
                ],
                pemis: [{ id: 'p1', name: 'PH', crules: '{}' }, { id: 'p2', name: 'PH', crules: '{}' }],
                targets: [],
            }
            let rp = auditRefs(d)
            assert.deepStrictEqual(rp.items.map((x) => `${x.table}:${x.holderId}:${x.name}`), ['users:u1:Z', 'grups:g1:PZ'])
            assert.deepStrictEqual(rp.changes.map((c) => c.after), [
                mkObj([{ name: 'H', mode: 'AND', active: 'y' }]),
                mkObj([{ name: 'PH', mode: 'OR', active: 'y' }]),
            ])
        })

        it('RA-004 空名稱: 缺 name 欄之列視為 \'\' 可被名稱 \'\' 之引用解到(不懸空); name 為 null 或無任何空名列時 \'\' 之引用為懸空', function() {
            let ref = mkObj([{ name: '', mode: 'AND', active: 'y' }])
            let a = auditRefs({ users: [{ id: 'u', cgrups: ref }], grups: [{ id: 'g' , cpemis: '{}' }], pemis: [], targets: [] })
            assert.deepStrictEqual(a.items, [], '缺 name 之群組列相符 \'\'')
            let b = auditRefs({ users: [{ id: 'u', cgrups: ref }], grups: [{ id: 'g', name: '', cpemis: '{}' }], pemis: [], targets: [] })
            assert.deepStrictEqual(b.items, [])
            let c = auditRefs({ users: [{ id: 'u', cgrups: ref }], grups: [{ id: 'g', name: null, cpemis: '{}' }], pemis: [], targets: [] })
            assert.strictEqual(c.items.length, 1, 'name 為 null 不等於 \'\'(同 findRefRows)')
            assert.strictEqual(c.items[0].name, '')
            assert.strictEqual(c.changes[0].after, '{}')
            assert.strictEqual(findRefRows([{ name: null }], '').length, 0)
            let e = auditRefs({ users: [{ id: 'u', cgrups: ref }], grups: [{ id: 'g', name: 'G', cpemis: '{}' }], pemis: [], targets: [] })
            assert.strictEqual(e.items.length, 1, '無空名列')
        })

        it('RA-005 名稱為 __proto__／constructor／toString 安全: 有實體不懸空、無實體為懸空並被移除(物件與陣列形式), 不污染原型', function() {
            let ents = (names) => names.map((name) => ({ name, mode: 'AND', active: 'y' }))
            let d = {
                users: [
                    { id: 'uo', cgrups: mkObj(ents(['constructor', '__proto__', 'toString'])) },
                    { id: 'ua', cgrups: mkArr(ents(['__proto__', 'constructor', 'hasOwnProperty'])) },
                ],
                grups: [{ id: 'g1', name: 'constructor', cpemis: '{}' }],
                pemis: [],
                targets: [],
            }
            let rp = auditRefs(d)
            assert.deepStrictEqual(rp.items.map((x) => `${x.holderId}:${x.name}`), ['uo:__proto__', 'uo:toString', 'ua:__proto__', 'ua:hasOwnProperty'])
            assert.deepStrictEqual(rp.changes.map((c) => c.after), [mkObj(ents(['constructor'])), mkArr(ents(['constructor']))])
            assert.strictEqual(({}).mode, undefined, '原型未被污染')

            //__proto__ 有實體時不懸空, 容器不改寫
            let d2 = { users: [{ id: 'u', cgrups: mkObj(ents(['__proto__'])) }], grups: [{ id: 'g', name: '__proto__', cpemis: '{}' }], pemis: [], targets: [] }
            let rp2 = auditRefs(d2)
            assert.deepStrictEqual(rp2.items, [])
            assert.deepStrictEqual(rp2.changes, [])

            //crules: 標的 id 為 toString 者存在; constructor／__proto__ 無標的為懸空
            let d3 = { users: [], grups: [], pemis: [{ id: 'p', name: 'P', crules: '{"toString":"y","constructor":"y","__proto__":"y"}' }], targets: [{ id: 'toString' }] }
            let rp3 = auditRefs(d3)
            assert.deepStrictEqual(rp3.items.map((x) => x.name), ['constructor', '__proto__'])
            assert.strictEqual(rp3.changes[0].after, '{"toString":"y"}')
        })

        it('RA-006 名稱非字串: cgrups 之無 name／數字／陣列名／非物件元素列入 unnamed(不清理); crules 以屬性鍵比對(5 對 \'5\'、[\'T1\'] 對 \'T1\')、true 懸空、toString 為 null 之物件名略過', function() {
            let cg = '[{"mode":"AND","isActive":"y"},{"name":5,"mode":"OR","isActive":"y"},{"name":["G"],"mode":"AND","isActive":"n"},"x",{"name":"G","mode":"OR","isActive":"y"}]'
            let cr = '[{"name":5,"isActive":"y"},{"name":true,"isActive":"y"},{"name":{"toString":null},"isActive":"y"},{"name":["T1"],"isActive":"y"}]'
            let rp = auditRefs({
                users: [{ id: 'u', cgrups: cg }],
                grups: [{ id: 'g', name: 'G', cpemis: '{}' }],
                pemis: [{ id: 'p', name: 'P', crules: cr }],
                targets: [{ id: '5' }, { id: 'T1' }],
            })
            assert.deepStrictEqual(rp.unnamed, [
                { table: 'users', holderId: 'u', field: 'cgrups', isActive: 'y', mode: 'AND' },
                { table: 'users', holderId: 'u', field: 'cgrups', isActive: 'y', mode: 'OR' },
                { table: 'users', holderId: 'u', field: 'cgrups', isActive: 'n', mode: 'AND' },
                { table: 'users', holderId: 'u', field: 'cgrups', isActive: 'x', mode: undefined },
            ])
            assert.deepStrictEqual(rp.items.map((x) => `${x.table}:${x.name}`), ['pemis:true'])
            assert.deepStrictEqual(rp.changes.map((c) => c.table), ['pemis'], 'cgrups 不改(unnamed 不處理)')
            assert.strictEqual(rp.changes[0].after, '[{"name":5,"isActive":"y"},{"name":{"toString":null},"isActive":"y"},{"name":["T1"],"isActive":"y"}]')
            assert.strictEqual(rp.counts.nUnnamed, 4)
        })

        it('RA-007 壞 JSON 容錯: 解析失敗／非容器列入 badJson(含原因)、不當作有引用、不動; 空字串／空白／缺欄不算壞', function() {
            let rp = auditRefs({
                users: [
                    { id: 'u1', cgrups: '{oops' },
                    { id: 'u2', cgrups: '5' },
                    { id: 'u3', cgrups: 'null' },
                    { id: 'u4', cgrups: '' },
                    { id: 'u5' },
                    { id: 'u6', cgrups: '   ' },
                    { id: 'u7', cgrups: mkObj([{ name: 'X', mode: 'AND', active: 'y' }]) },
                ],
                grups: [{ id: 'g1', name: 'G', cpemis: '[[[bad' }],
                pemis: [{ id: 'p1', name: 'P', crules: 'x:' }],
                targets: [],
            })
            assert.deepStrictEqual(rp.badJson, [
                { table: 'users', id: 'u1', field: 'cgrups', reason: 'parse' },
                { table: 'users', id: 'u2', field: 'cgrups', reason: 'notContainer' },
                { table: 'users', id: 'u3', field: 'cgrups', reason: 'notContainer' },
                { table: 'grups', id: 'g1', field: 'cpemis', reason: 'parse' },
                { table: 'pemis', id: 'p1', field: 'crules', reason: 'parse' },
            ])
            assert.deepStrictEqual(rp.items.map((x) => x.holderId), ['u7'], '壞 JSON 列不當作有引用')
            assert.deepStrictEqual(rp.changes.map((c) => c.id), ['u7'])
            assert.strictEqual(rp.counts.nBadJson, 5)
        })

        it('RA-008 changes 逐字: JSON5 寫法(單引號／註解／無引號鍵)清理後為 JSON.stringify 之剩餘項; 無懸空之容器不列入 changes; 同名重複元素全移除; 缺字串主鍵者不處理', function() {
            let json5Str = `{ // 註解\n 'E': { mode: 'OR', isActive: 'y' }, X: { mode: 'AND', isActive: 'y' } }`
            let clean5 = `{ // 保留原樣\n 'E': { mode: 'OR', isActive: 'y' } }`
            let dupArr = '[{"name":"X","mode":"OR","isActive":"y"},{"name":"E","mode":"AND","isActive":"y"},{"name":"X","mode":"AND","isActive":"n"}]'
            let rp = auditRefs({
                users: [
                    { id: 'u1', cgrups: json5Str },
                    { id: 'u2', cgrups: clean5 },
                    { id: 'u3', cgrups: dupArr },
                    { cgrups: mkObj([{ name: 'X', mode: 'AND', active: 'y' }]) },
                    { id: 5, cgrups: mkObj([{ name: 'X', mode: 'AND', active: 'y' }]) },
                ],
                grups: [{ id: 'g', name: 'E', cpemis: '{}' }],
                pemis: [],
                targets: [],
            })
            assert.deepStrictEqual(rp.changes, [
                { table: 'users', id: 'u1', field: 'cgrups', before: json5Str, after: '{"E":{"mode":"OR","isActive":"y"}}', nDel: 1 },
                { table: 'users', id: 'u3', field: 'cgrups', before: dupArr, after: '[{"name":"E","mode":"AND","isActive":"y"}]', nDel: 2 },
            ])
            assert.deepStrictEqual(rp.items.filter((x) => x.holderId === 'u3').map((x) => x.isActive), ['y', 'n'], '同名兩元素各列一項')
            assert.deepStrictEqual(rp.noId, [
                { table: 'users', holderId: undefined, field: 'cgrups', nItems: 1 },
                { table: 'users', holderId: 5, field: 'cgrups', nItems: 1 },
            ])
            assert.strictEqual(rp.counts.nNoId, 2)
            assert.ok(!rp.items.some((x) => x.holderId === undefined || x.holderId === 5))
            assert.strictEqual(rp.counts.nItems, rp.items.length)
            assert.strictEqual(rp.counts.nChanges, 2)
        })

        it('RA-009 不回顯 email／name: 結果與文字報告皆只含主鍵 id 與被引用之名稱', function() {
            let fx = dirtyFx()
            fx.users.forEach((u) => {
                u.name = `NAME-${u.id}-zzq`
            })
            let rp = buildReport(fx)
            let txt = formatReport(rp)
            let js = JSON.stringify(rp)
            for (let s of ['secret-alice', 'secret-bob', 'secret-carol', 'secret-dave', '@x.com', 'NAME-u1-zzq', 'NAME-u2-zzq']) {
                assert.ok(!txt.includes(s), `文字報告不得含 ${s}`)
                assert.ok(!js.includes(s), `JSON 結果不得含 ${s}`)
            }
            assert.ok(txt.includes('id=u1') && txt.includes('"GX"'))
        })

        it('RA-010 冪等與保真: 套用 changes 後再稽核為 0 懸空 0 changes; before 為原字串; 無懸空之列不被改', function() {
            let fx = dirtyFx()
            let rp = auditRefs(fx)
            assert.strictEqual(rp.items.length, 4)
            assert.deepStrictEqual(rp.changes.map((c) => c.id), ['u1', 'u4', 'g1', 'p1'])
            let after = applyChanges(fx, rp.changes)
            let rp2 = auditRefs(after)
            assert.deepStrictEqual(rp2.items, [])
            assert.deepStrictEqual(rp2.changes, [])
            assert.deepStrictEqual(rp2.badJson, rp.badJson, '壞 JSON 列不受清理影響')
            for (let t of TABLES) {
                fx[t].forEach((r, k) => {
                    if (!rp.changes.some((c) => c.table === t && c.id === r.id)) {
                        assert.deepStrictEqual(after[t][k], r, `${t} ${r.id} 不得被改`)
                    }
                })
            }
        })

        it('RA-011 懸空判準與 findRefRows 互驗(隨機列: 缺 name、null、數字名、空字串、原型名): 懸空名稱集合 ＝ findRefRows 無命中之名稱集合; 空／缺表與非物件輸入不拋', function() {
            let rng = mkRng(11)
            let pick = (a) => a[Math.floor(rng() * a.length)]
            let pool = ['A', 'B', 'C', '', 'constructor', '__proto__', 'toString', 'a', ' A']
            for (let k = 0; k < 300; k++) {
                let rows = []
                let nr = Math.floor(rng() * 6)
                for (let i = 0; i < nr; i++) {
                    let r = { id: `g${i}`, cpemis: '{}' }
                    let nm = pick([...pool, undefined, null, 5])
                    if (nm !== undefined) {
                        r.name = nm
                    }
                    rows.push(r)
                }
                let cg = Object.create(null)
                pool.forEach((nm) => {
                    cg[nm] = { mode: 'AND', isActive: 'y' }
                })
                let rp = auditRefs({ users: [{ id: 'u', cgrups: JSON.stringify(cg) }], grups: rows, pemis: [], targets: [] })
                let exp = pool.filter((nm) => findRefRows(rows, nm).length === 0)
                assert.deepStrictEqual(rp.items.map((x) => x.name).sort(), exp.slice().sort(), JSON.stringify(rows))
            }
            for (let bad of [undefined, null, 5, 'x', [], {}, { users: 5, grups: 'x', pemis: null, targets: {} }]) {
                let rp = auditRefs(bad)
                assert.deepStrictEqual(rp.items, [])
                assert.deepStrictEqual(rp.changes, [])
                assert.deepStrictEqual(rp.unsafe, [])
            }
        })

        it('RA-012 含 JSON5 非有限數值(Infinity／NaN)之容器(外審 R2): 命中須改寫者不清理——items 仍列懸空項、changes 無該列、unsafe 列出該列; 無懸空者不列 unsafe; 其餘容器照常清理', function() {
            //a) crules 陣列形式, name 為 Infinity(JSON.stringify 會編成 null, 改指別的規則 'null'); 標的有 id 'Infinity' 故該項不懸空, X 懸空
            let strA = '[{"name":Infinity,"isActive":"y"},{"name":"X","isActive":"y"}]'
            let a = auditRefs({ users: [], grups: [], pemis: [{ id: 'h', name: 'PH', crules: strA }], targets: [{ id: 'Infinity' }] })
            assert.deepStrictEqual(a.items.map((x) => x.name), ['X'], 'items 仍列懸空項')
            assert.deepStrictEqual(a.changes, [], '該列不產生 changes(不清理)')
            assert.deepStrictEqual(a.unsafe, [{ table: 'pemis', id: 'h', field: 'crules' }])
            assert.strictEqual(a.counts.nUnsafe, 1)
            assert.strictEqual(a.counts.nChanges, 0)
            assert.strictEqual(a.counts.nItems, 1)

            //a2) 無標的 id 'Infinity' 時 Infinity 項自身亦懸空(名稱 'Infinity'), 同樣不清理
            let a2 = auditRefs({ users: [], grups: [], pemis: [{ id: 'h', name: 'PH', crules: strA }], targets: [] })
            assert.deepStrictEqual(a2.items.map((x) => x.name), ['Infinity', 'X'])
            assert.deepStrictEqual(a2.changes, [])
            assert.strictEqual(a2.unsafe.length, 1)

            //b) 同一容器, 但 X 亦存在 → 無懸空、不嘗試改寫, 不列 unsafe
            let b = auditRefs({ users: [], grups: [], pemis: [{ id: 'h', name: 'PH', crules: strA }], targets: [{ id: 'Infinity' }, { id: 'X' }] })
            assert.deepStrictEqual(b.items, [])
            assert.deepStrictEqual(b.unsafe, [])
            assert.deepStrictEqual(b.changes, [])

            //c) ref 類: 值內含 NaN
            let strC = '{"G":{"mode":"OR","isActive":"y","w":NaN},"X":{"mode":"AND","isActive":"y"}}'
            let c = auditRefs({ users: [{ id: 'h', cgrups: strC }], grups: [{ id: 'g', name: 'G', cpemis: '{}' }], pemis: [], targets: [] })
            assert.deepStrictEqual(c.items.map((x) => x.name), ['X'])
            assert.deepStrictEqual(c.changes, [])
            assert.deepStrictEqual(c.unsafe, [{ table: 'users', id: 'h', field: 'cgrups' }])

            //d) -Infinity 亦同; 另一個有限數值之容器照常清理(changes 只含它)
            let strD = '{"E":"y","X":"y","n":-Infinity}'
            let strOk = '{"E":"y","X":"y","n":1e3}'
            let d = auditRefs({
                users: [],
                grups: [],
                pemis: [{ id: 'pd', name: 'PD', crules: strD }, { id: 'po', name: 'PO', crules: strOk }],
                targets: [{ id: 'E' }],
            })
            assert.deepStrictEqual(d.unsafe, [{ table: 'pemis', id: 'pd', field: 'crules' }])
            assert.deepStrictEqual(d.changes.map((x) => x.id), ['po'], '有限數值者照常清理')
            assert.ok(d.items.some((x) => x.holderId === 'pd' && x.name === 'X'), 'unsafe 列之懸空項仍列出')
            assert.strictEqual(d.counts.nItems, d.items.length)
            assert.strictEqual(d.counts.nUnsafe, 1)
        })

    })


    // ---------------------------------------------------------------
    // 語意不變式(真 getUserRules)
    // ---------------------------------------------------------------

    describe('語意不變式(以真 src/plugins/mShare.mjs 之 getUserRules 驗證)', function() {

        //求值: 各使用者之 { grups 名稱, 各管控對象 isActive }; 對損壞字串之 console.log 靜音
        let evalAll = (d) => Object.fromEntries(d.users.map((u) => {
            let r = quiet(() => getUserRules(u, d.grups, d.pemis, d.targets))
            return [u.id, { grups: r.grups.map((g) => g.name).join('|'), rules: r.rules.map((x) => `${x.name}=${x.isActive}`).join(',') }]
        }))
        let rulesOf = (e) => Object.fromEntries(e.rules.split(',').filter((s) => s !== '').map((s) => s.split('=')))

        //參考模型(獨立於 refAudit／refCascade): 依「找不到即忽略」, 直接把原字串中查無實體之項目刪掉(ref 用 findRefRows、rule 用標的 id 集合); 字串數量同實作以 JSON.stringify 輸出, 無懸空者回原字串
        let refRemove = (str, isDang, kind) => {
            let kp = null
            try {
                kp = JSON5.parse(str)
            }
            catch (err) {
                return str
            }
            if (kp === null || typeof kp !== 'object') {
                return str
            }
            let nameOf = (el) => (el !== null && typeof el === 'object' && typeof el.name === 'string') ? el.name : null
            let removed = false
            let out = null
            if (Array.isArray(kp)) {
                out = kp.filter((el) => {
                    let nm = nameOf(el)
                    let dang = nm !== null && isDang(nm)
                    removed = removed || dang
                    return !dang
                })
            }
            else {
                out = Object.create(null)
                Object.keys(kp).forEach((k) => {
                    if (isDang(k)) {
                        removed = true
                    }
                    else {
                        out[k] = kp[k]
                    }
                })
            }
            return removed ? JSON.stringify(out) : str
        }
        let refUniverse = (d) => {
            let tIds = new Set(d.targets.map((t) => t.id))
            let isDangG = (nm) => findRefRows(d.grups, nm).length === 0
            let isDangP = (nm) => findRefRows(d.pemis, nm).length === 0
            let isDangT = (nm) => !tIds.has(nm)
            let out = clone(d)
            out.users.forEach((u) => {
                u.cgrups = refRemove(u.cgrups, isDangG, 'ref')
            })
            out.grups.forEach((g) => {
                g.cpemis = refRemove(g.cpemis, isDangP, 'ref')
            })
            out.pemis.forEach((p) => {
                p.crules = refRemove(p.crules, isDangT, 'rule')
            })
            return out
        }

        //隨機宇宙
        //dense: 稠密模式(不產壞 JSON／空字串、啟用居多、至少一項), 使「授權變多」之情形足夠多
        let genRefs = (rng, names, dense = false) => {
            let pick = (a) => a[Math.floor(rng() * a.length)]
            let r = rng()
            if (!dense && r < 0.04) {
                return '{oops'
            }
            if (!dense && r < 0.08) {
                return ''
            }
            let n = dense ? 1 + Math.floor(rng() * 4) : Math.floor(rng() * 5)
            let isArr = rng() < 0.4
            let mk = () => {
                let e = { mode: pick(['OR', 'AND', 'OR', 'AND', undefined, 'xor']), isActive: dense ? pick(['y', 'y', 'y', 'y', 'y', 'y', 'y', 'n']) : pick(['y', 'y', 'y', 'n']) }
                return e
            }
            if (isArr) {
                let a = []
                for (let i = 0; i < n; i++) {
                    let e = mk()
                    let x = dense ? 1 : rng()
                    if (x < 0.05) {
                        a.push({ ...e }) //無 name
                    }
                    else if (x < 0.08) {
                        a.push({ name: 5, ...e })
                    }
                    else {
                        a.push({ name: pick(names), ...e })
                    }
                }
                return JSON.stringify(a)
            }
            let o = Object.create(null)
            for (let i = 0; i < n; i++) {
                o[pick(names)] = mk()
            }
            return JSON.stringify(o)
        }
        let genRules = (rng, dense = false) => {
            let pick = (a) => a[Math.floor(rng() * a.length)]
            let ks = ['T1', 'T2', 'T3', 'TX']
            let ys = dense ? ['y', 'y', 'y', 'n'] : ['y', 'n']
            let n = dense ? 2 + Math.floor(rng() * 3) : Math.floor(rng() * 4)
            if (rng() < 0.4) {
                let a = []
                for (let i = 0; i < n; i++) {
                    a.push({ name: pick(ks), isActive: pick(ys) })
                }
                return JSON.stringify(a)
            }
            let o = Object.create(null)
            for (let i = 0; i < n; i++) {
                o[pick(ks)] = pick(ys)
            }
            return JSON.stringify(o)
        }
        let genUniverse = (rng, dense = false) => {
            let nP = 1 + Math.floor(rng() * 3)
            let pemis = []
            for (let i = 0; i < nP; i++) {
                pemis.push({ id: `p${i}`, name: `P${i}`, crules: genRules(rng, dense) })
            }
            if (rng() < 0.15) {
                pemis.push({ id: 'pd', name: 'P0', crules: genRules(rng, dense) }) //歷史同名
            }
            let nG = 1 + Math.floor(rng() * 3)
            let grups = []
            for (let i = 0; i < nG; i++) {
                grups.push({ id: `g${i}`, name: `G${i}`, cpemis: genRefs(rng, dense ? ['P0', 'P1', 'PX'] : ['P0', 'P1', 'P2', 'P3', 'PX'], dense) })
            }
            if (rng() < 0.15) {
                grups.push({ id: 'gd', name: 'G0', cpemis: genRefs(rng, ['P0', 'P1', 'PX'], dense) })
            }
            let nU = 2 + Math.floor(rng() * 2)
            let users = []
            for (let i = 0; i < nU; i++) {
                users.push({ id: `u${i}`, name: `U${i}`, email: `u${i}@x.com`, cgrups: genRefs(rng, dense ? ['G0', 'G1', 'GX', 'GY'] : ['G0', 'G1', 'G2', 'G3', 'GX'], dense) })
            }
            return { users, grups, pemis, targets: [{ id: 'T1' }, { id: 'T2' }, { id: 'T3' }] }
        }

        it('RA-020 隨機宇宙(固定種子, 2400 組): 清理後之授權＝自原始字串刪懸空項目後之結果(舊版「找不到即忽略」之語意); changes.after 逐字等於參考模型; 只放寬不收嚴; 無 widen 旗標者授權不變; 再稽核為 0', function() {
            let rng = mkRng(20261022)
            let st = { n: 0, withDang: 0, changedUsers: 0, flaggedUsers: 0, flaggedUnchanged: 0, widenGrup: 0 }
            for (let k = 0; k < 2400; k++) {
                let d = genUniverse(rng, k % 2 === 1) //奇數組為稠密模式
                let rp = auditRefs(d)
                let ref = refUniverse(d)
                let after = applyChanges(d, rp.changes)
                st.n++
                if (rp.items.length > 0) {
                    st.withDang++
                }

                //changes.after 逐字＝參考模型; 無 changes 之列＝參考模型(即原字串)
                for (let t of HOLDERS) {
                    let field = { users: 'cgrups', grups: 'cpemis', pemis: 'crules' }[t]
                    d[t].forEach((r, i) => {
                        assert.strictEqual(after[t][i][field], ref[t][i][field], `#${k} ${t} ${r.id}`)
                    })
                }

                //授權: 清理後 ＝ 參考模型
                let eb = evalAll(d)
                let ea = evalAll(after)
                let er = evalAll(ref)
                assert.deepStrictEqual(ea, er, `#${k} 清理後須等於刪懸空項後之授權`)

                //只放寬: 原本為 y 者清理後仍為 y
                let flagged = new Set(rp.widen.filter((w) => w.table === 'users').map((w) => w.holderId))
                for (let u of d.users) {
                    let rb = rulesOf(eb[u.id])
                    let ra = rulesOf(ea[u.id])
                    for (let key of Object.keys(rb)) {
                        assert.ok(rb[key] !== 'y' || ra[key] === 'y', `#${k} ${u.id} ${key} 不得被收嚴`)
                    }
                    assert.strictEqual(eb[u.id].grups, ea[u.id].grups, `#${k} ${u.id} 所屬群組不變`)
                    let changed = JSON.stringify(eb[u.id]) !== JSON.stringify(ea[u.id])
                    if (changed) {
                        st.changedUsers++
                        assert.ok(flagged.has(u.id), `#${k} ${u.id} 授權變多而未列入 widen(旗標不健全)`)
                    }
                    if (flagged.has(u.id)) {
                        st.flaggedUsers++
                        if (!changed) {
                            st.flaggedUnchanged++
                        }
                    }
                }
                st.widenGrup += rp.widen.filter((w) => w.table === 'grups').length

                //再稽核
                assert.deepStrictEqual(auditRefs(after).items, [], `#${k} 再稽核`)
            }
            //靈敏度: 產生器確實涵蓋「授權變多」與「旗標為保守上界」(旗標有而實際未變者)之情形
            assert.ok(st.withDang >= 1500, JSON.stringify(st))
            assert.ok(st.changedUsers >= 200, JSON.stringify(st))
            assert.ok(st.flaggedUnchanged >= 20, JSON.stringify(st))
            assert.ok(st.widenGrup >= 50, JSON.stringify(st))
        })

        it('RA-021 widen 旗標之真函數實證: 啟用 AND(含 mode 缺／非法)懸空與「唯一 OR 懸空＋合法 AND」清理後授權由 n 變 y; 他有 OR、停用、無其他有效項者不變', function() {
            let mkCase = (cgrups) => {
                let d = {
                    users: [{ id: 'u', cgrups }],
                    grups: [
                        { id: 'g1', name: 'E1', cpemis: mkObj([{ name: 'P', mode: 'OR', active: 'y' }]) },
                        { id: 'g2', name: 'E2', cpemis: mkObj([{ name: 'P', mode: 'OR', active: 'y' }]) },
                    ],
                    pemis: [{ id: 'p', name: 'P', crules: mkObj([{ name: 'T1', active: 'y' }], true) }],
                    targets: [{ id: 'T1' }],
                }
                let rp = auditRefs(d)
                let b = evalAll(d).u.rules
                let a = evalAll(applyChanges(d, rp.changes)).u.rules
                return { b, a, flagged: rp.widen.length > 0 }
            }
            let E1 = { name: 'E1', mode: 'OR', active: 'y' }
            //[說明, cgrups, 清理前, 清理後, 旗標]
            let cases = [
                ['啟用 AND 懸空 + OR 實體', mkObj([E1, { name: 'X', mode: 'AND', active: 'y' }]), 'T1=n', 'T1=y', true],
                ['唯一 OR 懸空 + 合法 AND 實體(基底原為空集)', mkObj([{ name: 'E1', mode: 'AND', active: 'y' }, { name: 'X', mode: 'OR', active: 'y' }]), 'T1=n', 'T1=y', true],
                ['mode 缺之懸空 + OR 實體', mkObj([E1, { name: 'X', active: 'y' }]), 'T1=n', 'T1=y', true],
                ['mode 非法之懸空 + OR 實體', mkObj([E1, { name: 'X', mode: 'xor', active: 'y' }]), 'T1=n', 'T1=y', true],
                ['AND 懸空 + AND 實體', mkObj([{ name: 'E1', mode: 'AND', active: 'y' }, { name: 'X', mode: 'AND', active: 'y' }]), 'T1=n', 'T1=y', true],
                ['他有 OR 實體, 懸空 OR 貢獻 0', mkObj([E1, { name: 'E2', mode: 'OR', active: 'y' }, { name: 'X', mode: 'OR', active: 'y' }]), 'T1=y', 'T1=y', false],
                ['停用之懸空', mkObj([E1, { name: 'X', mode: 'AND', active: 'n' }]), 'T1=y', 'T1=y', false],
                ['只有懸空 AND(無其他有效項)', mkObj([{ name: 'X', mode: 'AND', active: 'y' }]), 'T1=n', 'T1=n', false],
                ['只有懸空 OR', mkObj([{ name: 'X', mode: 'OR', active: 'y' }]), 'T1=n', 'T1=n', false],
                ['同層僅 mode 非法之實體 + 懸空 OR', mkObj([{ name: 'E1', mode: 'xor', active: 'y' }, { name: 'X', mode: 'OR', active: 'y' }]), 'T1=n', 'T1=n', false],
            ]
            for (let [label, cg, b, a, flagged] of cases) {
                let r = mkCase(cg)
                assert.strictEqual(r.b, b, `${label}: 清理前`)
                assert.strictEqual(r.a, a, `${label}: 清理後`)
                assert.strictEqual(r.flagged, flagged, `${label}: widen 旗標`)
            }
        })

    })


    // ---------------------------------------------------------------
    // 離線 CLI
    // ---------------------------------------------------------------

    describe('離線 CLI(server/tools/authRefsAudit.mjs)', function() {

        let runAudit = (args, cwd = projRoot) => spawnSync(process.execPath, [TOOL_AUDIT, ...args], { encoding: 'utf8', timeout: 30000, cwd })

        it('RA-030 --json 輸出等於 buildReport; --clean-out 只含變更之列(id 與新字串); 輸入檔不被修改; --clean-out 之提示走 stderr 不污染 stdout', function() {
            let dir = path.join(TMP, 'cli1')
            fs.mkdirSync(dir, { recursive: true })
            let fp = path.join(dir, 'in.json')
            let out = path.join(dir, 'clean.json')
            let fx = dirtyFx()
            fs.writeFileSync(fp, JSON.stringify(fx))
            let h0 = sha1(fp)
            let r = runAudit([fp, '--json', '--clean-out', out])
            assert.strictEqual(r.status, 0, r.stderr)
            assert.deepStrictEqual(JSON.parse(r.stdout), JSON.parse(JSON.stringify(buildReport(fx))))
            assert.ok(r.stderr.includes('清理後之引用端列'))
            let co = JSON.parse(fs.readFileSync(out, 'utf8'))
            let rp = auditRefs(fx)
            assert.deepStrictEqual(co, {
                users: [{ id: 'u1', cgrups: mkObj([{ name: 'G1', mode: 'OR', active: 'y' }]) }, { id: 'u4', cgrups: mkArr([{ name: 'G1', mode: 'AND', active: 'y' }]) }],
                grups: [{ id: 'g1', cpemis: mkObj([{ name: 'P1', mode: 'OR', active: 'y' }]) }],
                pemis: [{ id: 'p1', crules: mkObj([{ name: 'T1', active: 'y' }], true) }],
            })
            assert.deepStrictEqual(co, cleanOutOf(rp.changes))
            assert.strictEqual(sha1(fp), h0, '輸入檔須不變')
        })

        it('RA-031 文字報告含各段(懸空清單、AND 影響人數、壞 JSON、建議處置), 且不含 email／name', function() {
            let dir = path.join(TMP, 'cli2')
            fs.mkdirSync(dir, { recursive: true })
            let fp = path.join(dir, 'in.json')
            fs.writeFileSync(fp, JSON.stringify(dirtyFx()))
            let r = runAudit([fp])
            assert.strictEqual(r.status, 0, r.stderr)
            for (let s of ['資料筆數: users 4、grups 2、pemis 1、targets 2', '懸空引用', 'users.cgrups', 'grups.cpemis', 'pemis.crules', '擁有「啟用 AND 懸空項」之使用者 1 位、群組 1 個', '清理後授權可能變多', '壞 JSON', 'users id=u3', '建議處置步驟', 'g_authRefsClean.mjs', '--apply']) {
                assert.ok(r.stdout.includes(s), `報告應含「${s}」`)
            }
            for (let s of ['secret-', '@x.com', 'alice', 'bob']) {
                assert.ok(!r.stdout.includes(s), `報告不得含 ${s}`)
            }
        })

        it('RA-032 無懸空之資料: 0 項、不產 changes, --clean-out 寫出空陣列', function() {
            let dir = path.join(TMP, 'cli3')
            fs.mkdirSync(dir, { recursive: true })
            let fp = path.join(dir, 'in.json')
            let out = path.join(dir, 'clean.json')
            fs.writeFileSync(fp, JSON.stringify({ users: [{ id: 'u', cgrups: mkObj([{ name: 'G', mode: 'OR', active: 'y' }]) }], grups: [{ id: 'g', name: 'G', cpemis: '{}' }], pemis: [], targets: [] }))
            let r = runAudit([fp, '--json', '--clean-out', out])
            assert.strictEqual(r.status, 0, r.stderr)
            let j = JSON.parse(r.stdout)
            assert.strictEqual(j.counts.nItems, 0)
            assert.deepStrictEqual(j.changes, [])
            assert.deepStrictEqual(JSON.parse(fs.readFileSync(out, 'utf8')), { users: [], grups: [], pemis: [] })
        })

        it('RA-034 文字報告每表引用端列數有上限(maxHolders), 超過者註明從略並指向 --json; 結構化結果不截斷', function() {
            let users = []
            for (let i = 0; i < 6; i++) {
                users.push({ id: `u${i}`, cgrups: mkObj([{ name: `X${i}`, mode: 'AND', active: 'y' }]) })
            }
            let rp = buildReport({ users, grups: [], pemis: [], targets: [] })
            let txt = formatReport(rp, { maxHolders: 2 })
            assert.ok(txt.includes('id=u0') && txt.includes('id=u1'))
            assert.ok(!txt.includes('users id=u2:'), 'u2 起從略')
            assert.ok(txt.includes('其餘 4 列從略') && txt.includes('--json'))
            assert.strictEqual(rp.items.length, 6)
            assert.strictEqual(rp.changes.length, 6)
        })

        it('RA-033 參數錯誤離開碼 2 並印用法; 檔案不存在或非 JSON 離開碼 1', function() {
            let r1 = runAudit([])
            assert.strictEqual(r1.status, 2)
            assert.ok(r1.stdout.includes('用法'))
            let r2 = runAudit([path.join(TMP, 'x.json'), '--clean-out'])
            assert.strictEqual(r2.status, 2)
            let r3 = runAudit([path.join(TMP, 'nofile.json')])
            assert.strictEqual(r3.status, 1)
            assert.ok(r3.stderr.includes('失敗'))
            let dir = path.join(TMP, 'cli4')
            fs.mkdirSync(dir, { recursive: true })
            let fp = path.join(dir, 'bad.json')
            fs.writeFileSync(fp, '{oops')
            let r4 = runAudit([fp])
            assert.strictEqual(r4.status, 1)
        })

        it('RA-035 含 Infinity／NaN 而不清理之授權欄位(外審 R2): 文字報告列出「須人工處理」、--json 含 unsafe 與 counts.nUnsafe、--clean-out 不含該列', function() {
            let dir = path.join(TMP, 'cli5')
            fs.mkdirSync(dir, { recursive: true })
            let fp = path.join(dir, 'in.json')
            let out = path.join(dir, 'clean.json')
            let fx = unsafeFx()
            fs.writeFileSync(fp, JSON.stringify(fx))
            let rt = runAudit([fp])
            assert.strictEqual(rt.status, 0, rt.stderr)
            for (let s of ['無法安全重新編碼', 'Infinity', '須人工處理', 'pemis id=p2 欄位 crules']) {
                assert.ok(rt.stdout.includes(s), `報告應含「${s}」`)
            }
            let rj = runAudit([fp, '--json', '--clean-out', out])
            assert.strictEqual(rj.status, 0, rj.stderr)
            let j = JSON.parse(rj.stdout)
            assert.deepStrictEqual(j.unsafe, [{ table: 'pemis', id: 'p2', field: 'crules' }])
            assert.strictEqual(j.counts.nUnsafe, 1)
            assert.ok(j.items.some((x) => x.holderId === 'p2' && x.name === 'X'), 'unsafe 列之懸空項仍列出')
            assert.ok(!j.changes.some((c) => c.id === 'p2'))
            let co = JSON.parse(fs.readFileSync(out, 'utf8'))
            assert.deepStrictEqual(co.pemis.map((x) => x.id), ['p1'], '--clean-out 不含不清理之列')
        })

        //--clean-out 與輸入匯出檔為同一檔(外審 R3): 原會覆寫匯出檔(只剩變更列)且離開碼 0; 現於任何寫入前判定, 離開碼 2、輸入檔逐字不動
        describe('--clean-out 不得與輸入匯出檔為同一檔(外審 R3)', function() {

            let setup = (tag) => {
                let dir = path.join(TMP, tag)
                fs.mkdirSync(path.join(dir, 'sub'), { recursive: true })
                let fp = path.join(dir, 'in.json')
                fs.writeFileSync(fp, JSON.stringify(dirtyFx()))
                return { dir, fp, h0: sha1(fp) }
            }
            let expectRefused = (r, fp, h0, label) => {
                assert.strictEqual(r.status, 2, `${label}: 離開碼須為 2(${r.stdout}${r.stderr})`)
                assert.ok(r.stderr.includes('--clean-out 不得與輸入匯出檔為同一檔'), `${label}: stderr 須說明`)
                assert.strictEqual(r.stdout, '', `${label}: 不得輸出報告`)
                assert.strictEqual(sha1(fp), h0, `${label}: 輸入檔須逐字不動`)
            }

            it('RA-036a 同一路徑', function() {
                let { fp, h0 } = setup('same1')
                expectRefused(runAudit([fp, '--clean-out', fp]), fp, h0, '同一路徑')
                expectRefused(runAudit([fp, '--json', '--clean-out', fp]), fp, h0, '同一路徑 --json')
            })

            it('RA-036b 大小寫不同之同一路徑(Windows 之路徑不分大小寫; 非 Windows 略過)', function() {
                if (process.platform !== 'win32') {
                    this.skip()
                }
                let { dir, fp, h0 } = setup('same2')
                expectRefused(runAudit([fp, '--clean-out', path.join(dir, 'IN.JSON')]), fp, h0, '檔名大小寫不同')
                expectRefused(runAudit([fp, '--clean-out', fp.toUpperCase()]), fp, h0, '整條路徑大小寫不同')
            })

            it('RA-036c 相對與絕對別名(含 ./sub/../ 之正規化別名)', function() {
                let { dir, fp, h0 } = setup('same3')
                expectRefused(runAudit(['in.json', '--clean-out', fp], dir), fp, h0, '相對輸入 vs 絕對輸出')
                expectRefused(runAudit([fp, '--clean-out', 'in.json'], dir), fp, h0, '絕對輸入 vs 相對輸出')
                expectRefused(runAudit(['in.json', '--clean-out', './sub/../in.json'], dir), fp, h0, './sub/../ 別名')
                expectRefused(runAudit(['sub/../in.json', '--clean-out', 'in.json'], dir), fp, h0, '輸入端 ../ 別名')
            })

            it('RA-036d 硬連結(不同路徑、同一 inode; 環境不支援硬連結則略過)', function() {
                let { dir, fp, h0 } = setup('same4')
                let alias = path.join(dir, 'alias.json')
                try {
                    fs.linkSync(fp, alias)
                }
                catch (err) {
                    console.log(`(略過 RA-036d: 此環境不支援硬連結: ${err.code})`)
                    this.skip()
                }
                expectRefused(runAudit([fp, '--clean-out', alias]), fp, h0, '硬連結')
                expectRefused(runAudit([alias, '--clean-out', fp]), fp, h0, '硬連結(反向)')
                assert.strictEqual(sha1(alias), h0, '別名亦逐字不動')
            })

            it('RA-036e 符號連結(不同路徑、解析後同一檔; 環境無權建立則略過)', function() {
                let { dir, fp, h0 } = setup('same5')
                let alias = path.join(dir, 'sym.json')
                try {
                    fs.symlinkSync(fp, alias, 'file')
                }
                catch (err) {
                    console.log(`(略過 RA-036e: 此環境不支援符號連結: ${err.code})`)
                    this.skip()
                }
                expectRefused(runAudit([fp, '--clean-out', alias]), fp, h0, '符號連結')
            })

            it('RA-037 對照組: 不同路徑(含僅檔名前綴相同、不同資料夾同檔名)正常, 輸出檔寫入且輸入檔不變', function() {
                let { dir, fp, h0 } = setup('same6')
                let out1 = path.join(dir, 'in.json.clean')
                let out2 = path.join(dir, 'sub', 'in.json')
                for (let out of [out1, out2]) {
                    let r = runAudit([fp, '--clean-out', out])
                    assert.strictEqual(r.status, 0, r.stderr)
                    assert.deepStrictEqual(JSON.parse(fs.readFileSync(out, 'utf8')), cleanOutOf(auditRefs(dirtyFx()).changes))
                    assert.strictEqual(sha1(fp), h0)
                }
                //已存在之不同檔(非同一 inode)可被覆寫為輸出檔(輸出檔之既有行為: 覆寫輸出檔本身)
                let r2 = runAudit([fp, '--clean-out', out1])
                assert.strictEqual(r2.status, 0, r2.stderr)
                assert.strictEqual(sha1(fp), h0)
            })

        })

    })


    // ---------------------------------------------------------------
    // runClean(單元級)
    // ---------------------------------------------------------------

    describe('runClean(ORM 替身)', function() {

        let bk = (name) => path.join(TMP, 'rc', name, 'rows-backup.json')
        let mkDir = (name) => {
            fs.mkdirSync(path.dirname(bk(name)), { recursive: true })
            return bk(name)
        }
        let mkLog = () => {
            let logs = []
            return { logs, log: (s) => logs.push(String(s)) }
        }

        it('RA-040 預設(apply 未給)只列不改: 零寫入、不備份、輸出報告', async function() {
            let wo = mkWo(dirtyFx())
            let s0 = snap(wo)
            let backups = 0
            let { logs, log } = mkLog()
            let res = await runClean({ woItems: wo, log, backupPath: mkDir('t40'), backupDb: async () => { backups++ } })
            assert.strictEqual(res.ok, true)
            assert.strictEqual(res.apply, false)
            assert.strictEqual(res.audit.counts.nItems, 4)
            assert.strictEqual(cntOf(wo), 0, '不得有任何 insert／save／del／delAll')
            assert.deepStrictEqual(snap(wo), s0)
            assert.strictEqual(backups, 0)
            assert.strictEqual(fs.existsSync(bk('t40')), false)
            assert.ok(logs.join('\n').includes('預設只列不改'))
            assert.ok(!logs.join('\n').includes('secret-'), '輸出不含 email')
        })

        it('RA-041 apply: 先備份(資料庫與引用端表全部列)再寫入; 只改該欄位; 其餘列逐位元不變; 寫後 0 懸空', async function() {
            let fx = dirtyFx()
            let wo = mkWo(fx)
            let s0 = snap(wo)
            let order = []
            let existsAtSave = []
            let fp = mkDir('t41')
            for (let t of HOLDERS) {
                let orig = wo[t].save
                wo[t].save = async (d, o) => {
                    order.push(`save:${t}`)
                    existsAtSave.push(fs.existsSync(fp))
                    return orig(d, o)
                }
            }
            let { logs, log } = mkLog()
            let res = await runClean({ woItems: wo, apply: true, log, backupPath: fp, backupDb: async () => { order.push('backupDb') } })
            assert.strictEqual(res.ok, true, res.err)
            assert.strictEqual(res.stage, 'done')
            assert.deepStrictEqual(order, ['backupDb', 'save:users', 'save:grups', 'save:pemis'], '資料庫備份先於任何寫入; 逐表一次 save')
            assert.deepStrictEqual(existsAtSave, [true, true, true], '寫入時引用端表備份檔已存在')
            assert.strictEqual(res.dbBackup, true)
            assert.strictEqual(res.backupPath, path.resolve(fp))
            let back = JSON.parse(fs.readFileSync(fp, 'utf8'))
            for (let t of TABLES) {
                assert.deepStrictEqual(back[t], fx[t], `備份檔 ${t} 須為寫入前全部列`)
            }
            assert.deepStrictEqual(res.written.map((w) => `${w.table}:${w.id}`), ['users:u1', 'users:u4', 'grups:g1', 'pemis:p1'])
            assert.strictEqual(res.auditAfter.items.length, 0)
            assert.strictEqual(res.failed.length, 0)

            //只改該欄位: 與預期之列逐位元相同(含 timeUpdate、userIdUpdate、email); 其餘列不變
            let exp = applyChanges(fx, auditRefs(fx).changes)
            for (let t of TABLES) {
                assert.strictEqual(wo[t].snapshot(), mkTable(exp[t]).snapshot(), `${t} 寫後內容`)
            }
            assert.strictEqual(wo.targets.snapshot(), s0.targets)
            assert.ok(logs.join('\n').includes('已清理'))
            assert.ok(!logs.join('\n').includes('secret-'))
        })

        it('RA-042 資料庫備份失敗 → 中止, 零寫入, 不產引用端表備份檔', async function() {
            let wo = mkWo(dirtyFx())
            let s0 = snap(wo)
            let fp = mkDir('t42')
            let { log } = mkLog()
            let res = await runClean({ woItems: wo, apply: true, log, backupPath: fp, backupDb: async () => { throw new Error('disk full') } })
            assert.strictEqual(res.ok, false)
            assert.strictEqual(res.stage, 'backupDb')
            assert.ok(res.err.includes('disk full'))
            assert.strictEqual(cntOf(wo), 0, '零寫入')
            assert.deepStrictEqual(snap(wo), s0)
            assert.strictEqual(fs.existsSync(fp), false)
            let res2 = await runClean({ woItems: wo, apply: true, log, backupPath: fp, backupDb: () => Promise.reject(new Error('x')) })
            assert.strictEqual(res2.ok, false)
            assert.strictEqual(cntOf(wo), 0)
        })

        it('RA-043 引用端表備份失敗(目錄不存在／檔案已存在不覆寫) → 中止, 零寫入', async function() {
            let wo = mkWo(dirtyFx())
            let s0 = snap(wo)
            let { log } = mkLog()
            let r1 = await runClean({ woItems: wo, apply: true, log, backupPath: path.join(TMP, 'rc', 'nodir-t43', 'x.json'), backupDb: async () => {} })
            assert.strictEqual(r1.ok, false)
            assert.strictEqual(r1.stage, 'backupRows')
            assert.strictEqual(cntOf(wo), 0)
            let fp = mkDir('t43')
            fs.writeFileSync(fp, 'KEEP', 'utf8')
            let r2 = await runClean({ woItems: wo, apply: true, log, backupPath: fp, backupDb: async () => {} })
            assert.strictEqual(r2.ok, false)
            assert.strictEqual(r2.stage, 'backupRows')
            assert.strictEqual(fs.readFileSync(fp, 'utf8'), 'KEEP', '既有檔不得被覆寫')
            assert.strictEqual(cntOf(wo), 0)
            assert.deepStrictEqual(snap(wo), s0)
        })

        it('RA-044 save 逐筆 ok:0 視為失敗: ok 為 false、列出失敗之表與 id、其餘列照寫、不報成功', async function() {
            let wo = mkWo(dirtyFx(), { grups: { saveIds: ['g1'] } })
            let { logs, log } = mkLog()
            let res = await runClean({ woItems: wo, apply: true, log, backupPath: mkDir('t44'), backupDb: async () => {} })
            assert.strictEqual(res.ok, false)
            assert.strictEqual(res.stage, 'write')
            assert.deepStrictEqual(res.failed.map((f) => `${f.table}:${f.id}`), ['grups:g1'])
            assert.ok(res.failed[0].err.includes('simulated'))
            assert.deepStrictEqual(res.written.map((w) => `${w.table}:${w.id}`), ['users:u1', 'users:u4', 'pemis:p1'])
            assert.ok(logs.join('\n').includes('grups id=g1'), '失敗列須列出')
            assert.ok(!logs.join('\n').includes('已清理'), '不得報成功')
            assert.ok(wo.grups.get('g1').cpemis.includes('PX'), '失敗之列維持原值')
        })

        it('RA-045 save 整批 reject、回傳筆數不符、n 為 0(列已不存在)、nInserted(補出殘列) 皆視為失敗', async function() {
            let { log } = mkLog()
            let mut = async (name, fn) => {
                let wo = mkWo(dirtyFx())
                let orig = wo.users.save
                wo.users.save = (d, o) => fn(d, o, orig)
                let res = await runClean({ woItems: wo, apply: true, log, backupPath: mkDir(name), backupDb: async () => {} })
                assert.strictEqual(res.ok, false, name)
                assert.strictEqual(res.stage, 'write', name)
                assert.deepStrictEqual(res.failed.map((f) => `${f.table}:${f.id}`), ['users:u1', 'users:u4'], name)
            }
            await mut('t45a', async () => { throw new Error('boom') })
            await mut('t45b', async () => [{ n: 1, nModified: 1, ok: 1 }])
            await mut('t45c', async (d) => d.map(() => ({ n: 0, nInserted: 0, nModified: 0, ok: 1 })))
            await mut('t45d', async (d) => d.map(() => ({ n: 1, nInserted: 1, nModified: 0, ok: 1 })))
        })

        it('RA-046 稽核後資料被改動(before 不符) → 中止, 零寫入(不以過期資料覆蓋)', async function() {
            let fx = dirtyFx()
            let wo = mkWo(fx)
            let n = 0
            let origSel = wo.users.select
            wo.users.select = async (f) => {
                n++
                let rs = await origSel(f)
                if (n >= 2) { //第 1 次為稽核, 第 2 次為備份後之再讀取
                    rs.find((r) => r.id === 'u1').cgrups = mkObj([{ name: 'G1', mode: 'OR', active: 'y' }])
                }
                return rs
            }
            let { log } = mkLog()
            let res = await runClean({ woItems: wo, apply: true, log, backupPath: mkDir('t46'), backupDb: async () => {} })
            assert.strictEqual(res.ok, false)
            assert.strictEqual(res.stage, 'stale')
            assert.deepStrictEqual(res.stale, [{ table: 'users', id: 'u1' }])
            assert.strictEqual(cntOf(wo), 0)
        })

        it('RA-047 無懸空 → apply 亦不備份、不寫入, ok', async function() {
            let wo = mkWo({ users: [{ id: 'u', cgrups: mkObj([{ name: 'G', mode: 'OR', active: 'y' }]) }], grups: [{ id: 'g', name: 'G', cpemis: '{}' }], pemis: [], targets: [] })
            let backups = 0
            let { logs, log } = mkLog()
            let res = await runClean({ woItems: wo, apply: true, log, backupPath: mkDir('t47'), backupDb: async () => { backups++ } })
            assert.strictEqual(res.ok, true)
            assert.strictEqual(backups, 0)
            assert.strictEqual(cntOf(wo), 0)
            assert.strictEqual(fs.existsSync(bk('t47')), false)
            assert.ok(logs.join('\n').includes('無須清理'))
        })

        it('RA-048 寫入後驗證: ORM 實際存入內容與預期不符(寫壞)、寫後仍有懸空 → 視為失敗', async function() {
            let { log } = mkLog()
            let wo = mkWo(dirtyFx())
            let orig = wo.pemis.save
            wo.pemis.save = (d, o) => orig(d.map((x) => ({ ...x, crules: x.crules + ' ' })), o)
            let res = await runClean({ woItems: wo, apply: true, log, backupPath: mkDir('t48'), backupDb: async () => {} })
            assert.strictEqual(res.ok, false)
            assert.strictEqual(res.stage, 'verify')
            assert.ok(res.err.includes('pemis id=p1'))

            let wo2 = mkWo(dirtyFx())
            let orig2 = wo2.grups.save
            wo2.grups.save = async (d, o) => {
                await orig2(d.map(() => ({ id: 'g2', name: 'G2' })), o) //寫成別筆(g1 仍留懸空)
                return d.map(() => ({ n: 1, nModified: 1, ok: 1 }))
            }
            let res2 = await runClean({ woItems: wo2, apply: true, log, backupPath: mkDir('t48b'), backupDb: async () => {} })
            assert.strictEqual(res2.ok, false)
            assert.strictEqual(res2.stage, 'verify')
        })

        it('RA-059 備份保真(run08 外審 sol #2, 與 fromTools.backupBefore 同一判準 isJsonLossy): 四表任一列含無法 JSON 往返之值(NaN／Infinity／bigint／Date／自有 undefined／陣列內 undefined／Buffer)→ apply 於任何備份與寫入之前中止(stage backupFidelity), 零寫入、不備份資料庫、備份檔不產生; 預設只列不改與無須清理不受影響', async function() {
            let bads = {
                nan: { description: NaN },
                inf: { description: Infinity },
                big: { description: 10n },
                date: { description: new Date('2020-01-02T00:00:00.000Z') },
                undef: { description: undefined },
                arrUndef: { tags: [undefined] },
                buf: { blob: Buffer.from('ab') },
            }
            for (let [k, extra] of Object.entries(bads)) {
                let fx = dirtyFx()
                fx.targets[0] = { ...fx.targets[0], ...extra } //被備份但不被改寫之表亦須保真(備份含四表全部列)
                let wo = mkWo(fx)
                let fp = mkDir(`t59-${k}`)
                let backups = 0
                let { log } = mkLog()
                let res = await runClean({ woItems: wo, apply: true, log, backupPath: fp, backupDb: async () => { backups++ } })
                assert.strictEqual(res.ok, false, `${k}: 應中止`)
                assert.strictEqual(res.stage, 'backupFidelity', `${k}: stage`)
                assert.strictEqual(cntOf(wo), 0, `${k}: 零寫入`)
                assert.strictEqual(backups, 0, `${k}: 不備份資料庫`)
                assert.strictEqual(fs.existsSync(fp), false, `${k}: 備份檔不產生`)
            }
            //只列不改: 不檢查(不備份)
            let fx2 = dirtyFx()
            fx2.users[0] = { ...fx2.users[0], description: NaN }
            let wo2 = mkWo(fx2)
            let r2 = await runClean({ woItems: wo2, log: () => {}, backupPath: mkDir('t59-list'), backupDb: async () => {} })
            assert.strictEqual(r2.ok, true)
            assert.strictEqual(r2.stage, 'audit')
        })

        it('RA-049 參數檢查: woItems 缺表或缺 select/save 回 check 失敗而非拋出; 壞 JSON 列不被改動', async function() {
            let { log } = mkLog()
            let r1 = await runClean({ log })
            assert.strictEqual(r1.ok, false)
            assert.strictEqual(r1.stage, 'check')
            let wo = mkWo(dirtyFx())
            delete wo.targets.select
            let r2 = await runClean({ woItems: wo, log })
            assert.strictEqual(r2.ok, false)
            let wo3 = mkWo(dirtyFx())
            let res = await runClean({ woItems: wo3, apply: true, log, backupPath: mkDir('t49'), backupDb: async () => {} })
            assert.strictEqual(res.ok, true)
            assert.strictEqual(wo3.users.get('u3').cgrups, '{oops', '壞 JSON 列原樣')
            assert.deepStrictEqual(res.audit.badJson.map((b) => b.id), ['u3'])
        })

        it('RA-056 含 Infinity 而不清理之列(外審 R2): apply 不寫該列、其餘列照寫; 寫後重新稽核仍見其懸空項視為已知殘留(ok 不因此誤判失敗), 報告列為須人工處理; 殘留須與寫前逐筆相同, 其他列殘留懸空仍判失敗', async function() {
            let fx = unsafeFx()
            let wo = mkWo(fx)
            let { logs, log } = mkLog()
            let res = await runClean({ woItems: wo, apply: true, log, backupPath: mkDir('t56'), backupDb: async () => {} })
            assert.strictEqual(res.ok, true, res.err)
            assert.strictEqual(res.stage, 'done')
            assert.deepStrictEqual(res.written.map((w) => `${w.table}:${w.id}`), ['users:u1', 'users:u4', 'grups:g1', 'pemis:p1'], 'p2 不寫')
            assert.deepStrictEqual(res.unsafe, [{ table: 'pemis', id: 'p2', field: 'crules' }])
            assert.deepStrictEqual(res.residue.map((x) => `${x.holderId}:${x.name}`), ['p2:X'])
            assert.deepStrictEqual(res.auditAfter.items, res.residue, '寫後之懸空僅為既知殘留')
            assert.strictEqual(res.failed.length, 0)
            assert.deepStrictEqual(wo.pemis.get('p2'), fx.pemis.find((p) => p.id === 'p2'), 'p2 逐位元不變')
            let exp = applyChanges(fx, auditRefs(fx).changes)
            for (let t of TABLES) {
                assert.strictEqual(wo[t].snapshot(), mkTable(exp[t]).snapshot(), `${t} 寫後內容`)
            }
            let txt = logs.join('\n')
            assert.ok(txt.includes('須人工處理') && txt.includes('pemis id=p2'), '報告須列出')
            assert.ok(txt.includes('既知殘留'), '說明殘留非錯誤')
            assert.ok(txt.includes('已清理'))

            //只有 unsafe 列時: 無須清理(不備份、不寫入), ok, 並提示須人工處理
            let wo2 = mkWo({ users: [], grups: [], pemis: [fx.pemis.find((p) => p.id === 'p2')], targets: fx.targets })
            let backups = 0
            let l2 = mkLog()
            let res2 = await runClean({ woItems: wo2, apply: true, log: l2.log, backupPath: mkDir('t56b'), backupDb: async () => { backups++ } })
            assert.strictEqual(res2.ok, true)
            assert.strictEqual(backups, 0)
            assert.strictEqual(cntOf(wo2), 0)
            assert.ok(l2.logs.join('\n').includes('無須清理') && l2.logs.join('\n').includes('須人工處理'))

            //殘留不得被 unsafe 掩蓋: 另一列(g1)寫入被吞而仍有懸空 → 仍為 verify 失敗
            let wo3 = mkWo(fx)
            let orig3 = wo3.grups.save
            wo3.grups.save = async (d, o) => {
                await orig3(d.map(() => ({ id: 'g2', name: 'G2' })), o)
                return d.map(() => ({ n: 1, nModified: 1, ok: 1 }))
            }
            let res3 = await runClean({ woItems: wo3, apply: true, log: () => {}, backupPath: mkDir('t56c'), backupDb: async () => {} })
            assert.strictEqual(res3.ok, false)
            assert.strictEqual(res3.stage, 'verify')

            //unsafe 列被別處改動(殘留與寫前不同) → verify 失敗
            let wo4 = mkWo(fx)
            let orig4 = wo4.pemis.save
            wo4.pemis.save = async (d, o) => {
                let rs = await orig4(d, o)
                await orig4([{ id: 'p2', crules: '[{"name":Infinity,"isActive":"y"},{"name":"Y","isActive":"y"}]' }], o)
                return rs
            }
            let res4 = await runClean({ woItems: wo4, apply: true, log: () => {}, backupPath: mkDir('t56d'), backupDb: async () => {} })
            assert.strictEqual(res4.ok, false)
            assert.strictEqual(res4.stage, 'verify')
        })

        it('RA-057 --backup 路徑與既有檔為同一檔之別名(大小寫不同、相對／絕對、硬連結) → 拒絕、不覆寫、零寫入(wx; 外審 R3 同型風險之檢查)', async function() {
            let { log } = mkLog()
            let fp = mkDir('t57')
            fs.writeFileSync(fp, 'KEEP', 'utf8')
            let h0 = sha1(fp)
            let aliases = [['同一路徑', fp], ['相對路徑', path.relative(process.cwd(), fp)], ['./ 別名', path.join(path.dirname(fp), '.', path.basename(fp))]]
            if (process.platform === 'win32') {
                aliases.push(['大小寫不同', path.join(path.dirname(fp), path.basename(fp).toUpperCase())])
            }
            let hl = path.join(path.dirname(fp), 'hardlink.json')
            try {
                fs.linkSync(fp, hl)
                aliases.push(['硬連結', hl])
            }
            catch (err) {
                console.log(`(RA-057 略過硬連結別名: ${err.code})`)
            }
            for (let [label, bp] of aliases) {
                let wo = mkWo(dirtyFx())
                let res = await runClean({ woItems: wo, apply: true, log, backupPath: bp, backupDb: async () => {} })
                assert.strictEqual(res.ok, false, label)
                assert.strictEqual(res.stage, 'backupRows', label)
                assert.strictEqual(cntOf(wo), 0, `${label}: 零寫入`)
                assert.strictEqual(sha1(fp), h0, `${label}: 既有檔逐字不動`)
            }
            assert.ok(aliases.length >= 3)
        })

    })


    // ---------------------------------------------------------------
    // 真 lmdb 臨時庫
    // ---------------------------------------------------------------

    describe('真 lmdb 臨時庫(test/_tmp/refAudit/<tag>/)', function() {

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
        let open = (url) => WServOrm(ds, WOrm, url, DB_NAME)
        let readDb = async (url) => {
            let r = open(url)
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
        let byIdSort = (rows) => rows.slice().sort((a, b) => String(a.id).localeCompare(String(b.id)))
        let norm = (rows) => JSON.stringify(Object.fromEntries(TABLES.map((t) => [t, byIdSort(rows[t])])))

        it('RA-050 runClean(in-process, 真 lmdb): 資料庫備份與引用端表備份檔先於任何寫入; 寫後 0 懸空; 只改該欄位', async function() {
            let fx = dirtyFx()
            let { dir, url } = await seed('real1', fx)
            let rows0 = await readDb(url)
            assert.strictEqual(auditRefs(rows0).items.length, 4)
            let fpRows = path.join(dir, 'rows-backup.json')
            let fpDb = path.join(dir, 'db-backup.json')
            let r = open(url)
            let ev = []
            try {
                for (let t of HOLDERS) {
                    let orig = r.woItems[t].save
                    r.woItems[t].save = async (d, o) => {
                        ev.push({ t, db: fs.existsSync(fpDb), rows: fs.existsSync(fpRows) })
                        return orig(d, o)
                    }
                }
                let res = await runClean({
                    woItems: r.woItems,
                    apply: true,
                    backupPath: fpRows,
                    log: () => {},
                    backupDb: async () => {
                        let data = null
                        let log0 = console.log
                        console.log = () => {} //br.backup 逐表印 backup...
                        try {
                            data = await r.backup(r.woItems) //w-serv-orm 之 backup(只取資料, 落點由本測試指定, 以免寫到專案根)
                        }
                        finally {
                            console.log = log0
                        }
                        fs.writeFileSync(fpDb, JSON.stringify(data), 'utf8')
                    },
                })
                assert.strictEqual(res.ok, true, res.err)
                assert.deepStrictEqual(ev.map((x) => x.t), ['users', 'grups', 'pemis'])
                assert.ok(ev.every((x) => x.db && x.rows), '每次寫入時兩個備份檔都已存在')
            }
            finally {
                await r.closeAll()
            }
            let rows1 = await readDb(url)
            assert.strictEqual(auditRefs(rows1).items.length, 0, '寫後 0 懸空')
            let exp = applyChanges(rows0, auditRefs(rows0).changes)
            assert.strictEqual(norm(rows1), norm(exp), '只改該欄位, 其餘逐位元不變')
            let bkRows = JSON.parse(fs.readFileSync(fpRows, 'utf8'))
            for (let t of TABLES) {
                assert.strictEqual(JSON.stringify(byIdSort(bkRows[t])), JSON.stringify(byIdSort(rows0[t])), `備份檔 ${t}`)
            }
            let bkDb = JSON.parse(fs.readFileSync(fpDb, 'utf8'))
            assert.deepStrictEqual(bkDb.map((x) => x.name).sort(), TABLES.slice().sort())
        })

        it('RA-051 runClean(in-process, 真 lmdb): 資料庫備份失敗 → 零寫入(庫內容逐位元不變)', async function() {
            let { url } = await seed('real2', dirtyFx())
            let rows0 = await readDb(url)
            let r = open(url)
            let nSave = 0
            try {
                for (let t of HOLDERS) {
                    let orig = r.woItems[t].save
                    r.woItems[t].save = async (d, o) => {
                        nSave++
                        return orig(d, o)
                    }
                }
                let res = await runClean({ woItems: r.woItems, apply: true, backupPath: path.join(TMP, 'real2', 'rows-backup.json'), log: () => {}, backupDb: async () => { throw new Error('backup failed') } })
                assert.strictEqual(res.ok, false)
                assert.strictEqual(res.stage, 'backupDb')
            }
            finally {
                await r.closeAll()
            }
            assert.strictEqual(nSave, 0)
            assert.strictEqual(norm(await readDb(url)), norm(rows0))
            assert.strictEqual(fs.existsSync(path.join(TMP, 'real2', 'rows-backup.json')), false)
        })

        it('RA-055 真 lmdb 之 save(…, { autoInsert: false }): 列不存在時 n 為 0 且不補出只有一欄之殘列(runClean 據此以 n 為 0 判失敗); 列存在時僅合併該欄位', async function() {
            let { url } = await seed('real3', dirtyFx())
            let r = open(url)
            try {
                let rs = await r.woItems.users.save([{ id: 'ghost', cgrups: '{}' }, { id: 'u2', cgrups: '{"G1":{"isActive":"y"}}' }], { autoInsert: false })
                assert.strictEqual(rs.length, 2)
                assert.strictEqual(rs[0].ok, 1)
                assert.strictEqual(rs[0].n, 0, '未命中')
                assert.ok(!(rs[0].nInserted > 0), '不得補插入')
                assert.strictEqual(rs[1].ok, 1)
                assert.strictEqual(rs[1].n, 1)
            }
            finally {
                await r.closeAll()
            }
            let rows = await readDb(url)
            assert.ok(!rows.users.some((u) => u.id === 'ghost'), '不得出現殘列')
            let u2 = rows.users.find((u) => u.id === 'u2')
            assert.strictEqual(u2.cgrups, '{"G1":{"isActive":"y"}}')
            assert.strictEqual(u2.email, 'secret-bob@x.com', '其他欄位保留(合併)')
            assert.strictEqual(u2.timeUpdate, '2026-01-02 00:00:00')
        })

        let runCli = (cwd, args) => spawnSync(process.execPath, [TOOL_CLEAN, ...args], { encoding: 'utf8', timeout: 30000, cwd })
        let filesOf = (dir, re) => fs.readdirSync(dir).filter((f) => re.test(f))

        it('RA-052 g_authRefsClean.mjs --db: 預設只列不改(離開碼 0、零寫入、不產備份); 資料夾不存在中止不憑空建庫; 參數錯誤離開碼 2', async function() {
            let { dir, url } = await seed('cli1', dirtyFx())
            let rows0 = await readDb(url)
            let r = runCli(dir, ['--db', url])
            assert.strictEqual(r.status, 0, r.stdout + r.stderr)
            assert.ok(r.stdout.includes('懸空引用') && r.stdout.includes('預設只列不改'))
            assert.ok(!r.stdout.includes('secret-'))
            assert.strictEqual(norm(await readDb(url)), norm(rows0))
            assert.deepStrictEqual(filesOf(dir, /backup/), [], '不得產備份檔')

            let nodb = path.join(dir, 'no-such-db')
            let r2 = runCli(dir, ['--db', nodb, '--apply'])
            assert.strictEqual(r2.status, 1)
            assert.ok(r2.stdout.includes('資料庫不存在'))
            assert.strictEqual(fs.existsSync(nodb), false, '不得憑空建立空庫')

            assert.strictEqual(runCli(dir, ['--bogus']).status, 2)
            assert.strictEqual(runCli(dir, ['--db']).status, 2)
        })

        it('RA-053 g_authRefsClean.mjs --db --apply: 先備份(getDb.backup 之 backup-時間.json 與引用端表備份)再寫入、寫後 0 懸空、離開碼 0; 引用端表備份失敗 → 離開碼 1 且零寫入(資料庫備份已先產生)', async function() {
            let fx = dirtyFx()
            let { dir, url } = await seed('cli2', fx)
            let rows0 = await readDb(url)

            //備份失敗: --backup 指向不存在之資料夾 → 引用端表備份失敗, 零寫入; 此時資料庫備份(第 1 步)已產生, 證明備份先於寫入
            let bad = runCli(dir, ['--db', url, '--apply', '--backup', path.join(dir, 'nodir', 'rows.json')])
            assert.strictEqual(bad.status, 1, bad.stdout + bad.stderr)
            assert.ok(bad.stdout.includes('階段 backupRows'))
            assert.strictEqual(norm(await readDb(url)), norm(rows0), '備份失敗時零寫入')
            assert.strictEqual(filesOf(dir, /^backup-\d+\.json$/).length, 1, '資料庫備份先於(未發生之)寫入而產生')
            for (let f of filesOf(dir, /^backup-\d+\.json$/)) {
                fs.rmSync(path.join(dir, f))
            }

            //成功
            let fpRows = path.join(dir, 'rows-backup.json')
            let ok = runCli(dir, ['--db', url, '--apply', '--backup', fpRows])
            assert.strictEqual(ok.status, 0, ok.stdout + ok.stderr)
            assert.ok(ok.stdout.includes('已清理'))
            let dbBk = filesOf(dir, /^backup-\d+\.json$/)
            assert.strictEqual(dbBk.length, 1, 'getDb.backup 之備份檔')
            let bkDb = JSON.parse(fs.readFileSync(path.join(dir, dbBk[0]), 'utf8'))
            let users0 = bkDb.find((x) => x.name === 'users').data
            assert.strictEqual(JSON.stringify(byIdSort(users0)), JSON.stringify(byIdSort(rows0.users)), '資料庫備份為寫入前內容')
            let bkRows = JSON.parse(fs.readFileSync(fpRows, 'utf8'))
            for (let t of TABLES) {
                assert.strictEqual(JSON.stringify(byIdSort(bkRows[t])), JSON.stringify(byIdSort(rows0[t])), `引用端表備份 ${t}`)
            }
            let rows1 = await readDb(url)
            assert.strictEqual(auditRefs(rows1).items.length, 0, '寫後 0 懸空')
            assert.strictEqual(norm(rows1), norm(applyChanges(rows0, auditRefs(rows0).changes)))

            //再跑一次: 無須清理, 不產新備份
            let again = runCli(dir, ['--db', url, '--apply', '--backup', path.join(dir, 'rows2.json')])
            assert.strictEqual(again.status, 0, again.stdout + again.stderr)
            assert.ok(again.stdout.includes('無須清理'))
            assert.strictEqual(fs.existsSync(path.join(dir, 'rows2.json')), false)
            assert.strictEqual(filesOf(dir, /^backup-\d+\.json$/).length, 1)
        })

        it('RA-054 g_authRefsClean.mjs 預設連線(不給 --db 時走 g_mOrm.mjs 之 ./db, 於工作目錄=臨時資料夾下執行, 不碰專案 ./db): 只列不改→--apply 清理→寫後 0 懸空、離開碼 0', async function() {
            let { dir, url } = await seed('cli3', dirtyFx())
            let rows0 = await readDb(url)
            let r1 = runCli(dir, [])
            assert.strictEqual(r1.status, 0, r1.stdout + r1.stderr)
            assert.ok(r1.stdout.includes('預設只列不改'))
            assert.strictEqual(norm(await readDb(url)), norm(rows0))
            let r2 = runCli(dir, ['--apply'])
            assert.strictEqual(r2.status, 0, r2.stdout + r2.stderr)
            assert.ok(r2.stdout.includes('已清理'))
            let rows1 = await readDb(url)
            assert.strictEqual(auditRefs(rows1).items.length, 0)
            assert.strictEqual(norm(rows1), norm(applyChanges(rows0, auditRefs(rows0).changes)))
            assert.strictEqual(filesOf(dir, /^backup-\d+\.json$/).length, 1)
            assert.strictEqual(filesOf(dir, /^authRefsClean-backup-\d+\.json$/).length, 1, '預設引用端表備份檔名 authRefsClean-backup-時間戳.json(於工作目錄)')
        })

        it('RA-058 g_authRefsClean.mjs --backup 指向資料庫檔本身(data.mdb)或其別名 → 離開碼 1、拒絕覆寫(wx)、資料庫檔大小與內容不變、零寫入(外審 R3 同型風險之檢查)', async function() {
            let { dir, url } = await seed('cli4', dirtyFx())
            let rows0 = await readDb(url)
            let mdb = path.join(url, DB_NAME, 'users', 'data.mdb')
            assert.ok(fs.existsSync(mdb), '找到 lmdb 資料檔')
            let sizeBefore = fs.statSync(mdb).size
            let aliases = [mdb]
            let hl = path.join(dir, 'mdb-hardlink.json')
            try {
                fs.linkSync(mdb, hl)
                aliases.push(hl)
            }
            catch (err) {
                console.log(`(RA-058 略過硬連結別名: ${err.code})`)
            }
            for (let bp of aliases) {
                let r = runCli(dir, ['--db', url, '--apply', '--backup', bp])
                assert.strictEqual(r.status, 1, r.stdout + r.stderr)
                assert.ok(r.stdout.includes('階段 backupRows'))
                assert.strictEqual(fs.statSync(mdb).size, sizeBefore, '資料庫檔未被覆寫')
                assert.strictEqual(norm(await readDb(url)), norm(rows0), '零寫入')
                for (let f of filesOf(dir, /^backup-\d+\.json$/)) {
                    fs.rmSync(path.join(dir, f)) //本案之資料庫備份(第 1 步)每輪清掉, 免同秒同名
                }
            }
        })

    })

})
