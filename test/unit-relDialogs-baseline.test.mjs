//反向關聯對話框(VeGrupBlngUsers／VePemiBlngGrups)之「開框綁定載入基準」與「送出整表以存檔當下 store 為底」(run07 F-26 對話框部分、S4; 外審 B.1; R-PRINCIPLE-00 原則 3; 規則帳本 R-BASELINE-01, ADR-037)
//
//受測: src/js/relDialogSend.mjs(getRowState／makeRowStates／getChangedIdx／buildRowsSend, 純函數)與其在兩個 .vue 之接線(show 綁基準、doSave 取基準與組裝整表、saveXxx 帶基準);
//伺服端以真 server/procCore.mjs(記憶體 ORM 替身, 同 unit-procCore-updateTabItems 之組法)驗「前端組出之整表 + 基準」端到端被接受或被拒.
//規格(R-PRINCIPLE-00 與 run07 design-digest, 每條 assertion 註解標出對應句):
//  [P1] 基準隨「草稿所依據之那份列」於開框(show)時同時產生並綁定; 之後 store 推播變新不得更新; 存檔當下才由最新 store 取基準不合格(證明的是 store 新, 不是待存內容新)
//  [P2] 送出之整表＝存檔當下 store 快照之全部列; 開框後他人／外部同步新增之列(不在對話框內)原樣帶回、不被刪(S4)
//  [P3] 使用者於本次編輯有變更之列(相對開框時之歸屬狀態)才對存檔當下快照之字串只改本項(putRefEntry); 使用者未變更之列一律原樣帶回存檔當下 store 之版本(逐字不動), 不因草稿舊值而被改寫
//  [P4] 對話框內有列所對應之使用者／群組於開框後被刪除(群組另含改名)→ 整次拒存 relationRowsStale(既有安全檢查, 不得放寬)
//  [P5] (run11 改寫為表級, R-PRINCIPLE-00 原則 7: 先動先贏) 伺服端以開框時之整表基準比對庫內整表: 開框後表內任何一列被他人／外部同步改動或增刪(不論是否為使用者有變更之列, 含 [P3] 之未變更列)→ saveStale、零寫入; 須重新開框(基準取自新 store)後再存。run07 版「只比對本次將寫入之列(same 不檢查)」之案已改寫
//  [P6] 外部列(from 非空)之指派可勾選: 附基準則可存, 且 from／名稱等欄位逐字帶回; 無基準 → saveBaselineRequired
//
//輸入空間表(軸 × 格; 已測／刻意不測／未測):
//  軸 A 列歸屬狀態轉移(開框→存檔) 8 格: n→n、n→y:OR、n→y:AND、y:OR→n、y:OR→y:AND、y:AND→y:OR、y:AND→n、切換後切回原狀 —— 全測(RB-003, 純函數); 另 mode 改而 enable 為 n 之列(狀態仍為 n)與 mode 為缺／'or'／1／null 之有效值化各測(RB-001／RB-003)
//  軸 B enable × mode 輸入形態 7 × 6 = 42 格(enable: 'y'／'n'／''／'Y'／undefined／null／1; mode: 'OR'／'AND'／'or'／undefined／null／1)—— 全測(RB-001), 並對 putRefEntry 之「未變更」判定做等價性窮舉(7 現值 × 42 目標, RB-002)
//  軸 C 開框後 store 之變動(對話框外 / 內) 9 格:
//      無變動(RB-SRV-001)、他人新增列(RB-SRV-002／RB-SRV-101)、他人改動使用者未碰之列(RB-SRV-003／RB-SRV-103)、他人改動使用者有變更之列(RB-SRV-004)、
//      store 排序被改(RB-SRV-010)、對話框內之列被刪(RB-SRV-006)、群組改名(RB-SRV-102)、外部同步整來源重寫稽核欄(RB-SRV-008)、他人刪除對話框外之列 → **未測**(伺服端依列序重編 order, 其後列之 order 位移成為 diff; 屬主責伺服端語意, 見報告疑慮)
//  軸 D 站點 2 格: users 對話框(updateUsers; RB-SRV-001～010)、grups 對話框(updateGrups, 驗名稱; RB-SRV-101～103) —— 全測; 對話框 DOM／ag-grid 互動未測(留 e2e)
//  軸 E 基準時點 2 格: 開框時綁定(RB-SRV-001～005)、存檔當下取(RB-SRV-005 以對照證明其不合格; 靜態 SITE-RB-002 禁止) —— 全測
//  軸 F 列授權字串形態 6 格: `{}`、pretty JSON5 物件(逐字比對)、陣列形式含停用項、壞 JSON／空字串、有損(同名 OR+AND)、外部列 —— 逐字帶回各測於 RB-004／RB-SRV-001／RB-SRV-009; 有損者「使用者有變更 → authLossyBlocked」「未變更 → 不拒且逐字」各測
//  軸 G 重複身分／缺身分 : makeRowStates 之重複取第一筆、缺身分不記(RB-005), getChangedIdx 之缺身分／空洞／原型鍵名(RB-003); 同一快照列被兩個對話框列配到(buildRowsSend 取第一個, RB-006)—— 測
//  軸 H show() 重入(存檔進行中再次 show 換掉 vo.baseline／vo.rowStates) —— 以靜態守護 doSave 於流程開頭取區域變數(SITE-RB-002), 真瀏覽器行為未測
//變異驗證: 見 tmp/run07/UI2/mut/ 與報告(自植缺陷於副本, repo 不動)
//跑法: npx mocha test/unit-relDialogs-baseline.test.mjs --timeout 60000
import assert from 'assert'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import JSON5 from 'json5'
import cloneDeep from 'lodash-es/cloneDeep.js'
import cacheSt from 'wsemi/src/cacheSt.mjs'
import ds from '../src/schema/index.mjs'
import proc from '../server/procCore.mjs'
import { autoDecl } from './tools/declHelper.mjs'
import createLockSave from '../server/lockSave.mjs'
import pairRowsToSnapshot from '../src/js/pairRowsToSnapshot.mjs'
import cvKpToObj from '../src/js/cvKpToObj.mjs'
import getKpLossy from '../src/js/getKpLossy.mjs'
import getOwn from '../src/js/getOwn.mjs'
import { getRefState, getRawModeMap, putRefEntry } from '../src/js/editorRefRows.mjs'
//perm-run01: rowDigest(row, keys) 已刪, 改 digestRow(row, 寫入契約)(契約由 getContract(表名) 取); makeBaseline／checkBaseline 之表參數由 keys 陣列改為表名字串 keyTable
import { makeBaseline, isBaselineValid, checkBaseline, digestRow, getContract } from '../src/js/rowDigest.mjs'
import { getRowState, makeRowStates, getChangedIdx, buildRowsSend } from '../src/js/relDialogSend.mjs'
import { mkTable, mkCore, mkSrLog } from './tools/unitOrm.mjs'
import { sourceLines } from './tools/srcScan.mjs'

const projRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const fpOf = (fn) => path.join(projRoot, 'src', 'components', `${fn}.vue`)
const HM = { hasMode: true }

//TAB: 兩個對話框之差異(users 對話框改 users.cgrups 不驗名稱; grups 對話框改 grups.cpemis 並驗名稱)
const TAB = {
    users: { refKey: 'cgrups', verify: [], fn: 'updateUsers' },
    grups: { refKey: 'cpemis', verify: ['name'], fn: 'updateGrups' },
}


// ===== 對話框模型: 與 .vue 膠合碼逐行對應(SITE-RB-* 靜態守護兩者一致) =====

//show() 之模型: 以 items 所依據之那份列計算基準並綁定; items 由 genItems 之等價邏輯產生(本群組／權限之歸屬狀態; 未歸屬 enable 'n'、mode 'OR'); 再記下開框時各列狀態
function openDialog(store, selfName, table) {
    let { refKey } = TAB[table]
    let src = cloneDeep(store) //show(): let users = cloneDeep(vo.users)
    let baseline = makeBaseline(src, table) //perm-run01: 原 makeBaseline(src, keys) 改傳表名
    let rows = src.map((u) => {
        let kp = Object.create(null)
        try {
            kp = cvKpToObj(JSON5.parse(u[refKey]), HM)
        }
        catch (err) {}
        let st = getRefState(getOwn(kp, selfName, null))
        return { id: u.id, name: u.name, enable: st.enable, mode: st.enable === 'y' ? st.mode : 'OR' }
    })
    let rowStates = makeRowStates(rows)
    return { baseline, rowStates, rows }
}

//使用者切換某列(opt.rows 就地改 enable／mode, 同 showXxxToggleItemEnableByName／ModeByName)
function toggle(dlg, id, enable, mode) {
    let r = dlg.rows.find((v) => v.id === id)
    r.enable = enable
    if (mode !== undefined) {
        r.mode = mode
    }
}

//doSave 之模型(core()): 取草稿基準與狀態 → 快照 → 以 id 配對(missing → relationRowsStale) → 找使用者有變更之列 → 有損檢查(只看有變更者) → putRefEntry 只改本項 → buildRowsSend
function saveModel(dlg, storeNow, selfName, table) {
    let { refKey, verify } = TAB[table]
    let rows = dlg.rows
    if (rows.length === 0) {
        return { rejected: 'empty' }
    }
    let baseline = cloneDeep(dlg.baseline)
    let rowStates = dlg.rowStates
    let snap = cloneDeep(storeNow)
    let { pairs, missing } = pairRowsToSnapshot(rows, snap, verify.length > 0 ? { verifyKeys: verify } : {})
    if (missing.length > 0) {
        return { rejected: 'relationRowsStale', names: missing.map((v) => v.name) }
    }
    let kpChanged = getChangedIdx(rows, rowStates)
    let kpLossyIdx = Object.create(null)
    let kpRawModes = Object.create(null)
    let lossyNames = []
    rows.forEach((r, kr) => {
        if (kpChanged[kr] !== true) {
            return
        }
        let u = pairs[kr]
        let kpRaw = null
        try {
            kpRaw = JSON5.parse(typeof u[refKey] === 'string' ? u[refKey] : '')
        }
        catch (err) {
            return
        }
        kpRawModes[kr] = getRawModeMap(kpRaw)
        if (getKpLossy(kpRaw).length === 0) {
            return
        }
        kpLossyIdx[kr] = true
        let p = getOwn(cvKpToObj(kpRaw, HM), selfName, null)
        let was = (p !== null && p.isActive === 'y')
        let wasMode = was ? (p.mode === undefined ? '' : p.mode) : ''
        let now = r.enable === 'y'
        let nowMode = now ? r.mode : ''
        if (was !== now || wasMode !== nowMode) {
            lossyNames.push(u.name)
        }
    })
    if (lossyNames.length > 0) {
        return { rejected: 'authLossyBlocked', names: lossyNames }
    }
    let kpNew = Object.create(null)
    rows.forEach((r, kr) => {
        if (kpChanged[kr] !== true || kpLossyIdx[kr] === true) {
            return
        }
        let u = pairs[kr]
        let kpDec = Object.create(null)
        try {
            kpDec = cvKpToObj(JSON5.parse(typeof u[refKey] === 'string' ? u[refKey] : ''), HM)
        }
        catch (err) {}
        let kpOut = Object.create(null)
        if (putRefEntry(kpOut, kpDec, selfName, r.enable, r.mode, kpRawModes[kr])) {
            kpNew[kr] = JSON.stringify(kpOut)
        }
    })
    return { rowsSend: buildRowsSend(snap, pairs, kpNew, refKey), baseline, kpChanged, kpNew, snap }
}

//修前行為(僅供對照, 證明測試對缺陷敏感): 送出「對話框之列」映射(不含開框後新增之列), 對每列以對話框列值對存檔當下快照字串套用 putRefEntry(未變更之列亦以草稿值比對), 無基準概念
function legacySaveModel(dlg, storeNow, selfName, table) {
    let { refKey, verify } = TAB[table]
    let snap = cloneDeep(storeNow)
    let { pairs, missing } = pairRowsToSnapshot(dlg.rows, snap, verify.length > 0 ? { verifyKeys: verify } : {})
    if (missing.length > 0) {
        return { rejected: 'relationRowsStale' }
    }
    let rowsSend = dlg.rows.map((r, kr) => {
        let u = pairs[kr]
        let kpRaw = null
        let kpDec = Object.create(null)
        try {
            kpRaw = JSON5.parse(typeof u[refKey] === 'string' ? u[refKey] : '')
            kpDec = cvKpToObj(kpRaw, HM)
        }
        catch (err) {}
        let kpOut = Object.create(null)
        if (putRefEntry(kpOut, kpDec, selfName, r.enable, r.mode, kpRaw === null ? undefined : getRawModeMap(kpRaw))) {
            u[refKey] = JSON.stringify(kpOut)
        }
        return u
    })
    return { rowsSend }
}


// ===== 伺服端環境: 真 procCore + 記憶體 ORM 替身 =====

const T0 = '2026-01-01T00:00:00.000+08:00'
const AUDIT = { userId: 'id-seed', timeCreate: T0, userIdUpdate: 'id-seed', timeUpdate: T0 }
const mk = (table, o) => ({ ...ds[table].funNew(), ...AUDIT, ...o })
const ON = (n, mode = 'OR') => JSON.stringify({ [n]: { mode, isActive: 'y' } })
const PRETTY = '{\n  G9: { mode: "OR", isActive: "y" },\n}' //pretty JSON5(逐字比對用: 任何「解碼再 stringify」之改寫都會改變此字串)
const ARR_OFF = '[{"name":"G7","mode":"AND","isActive":"n"},{"name":"G9","mode":"OR","isActive":"y"}]' //陣列形式含停用項
const LOSSY = '[{"name":"G1","mode":"OR","isActive":"y"},{"name":"G1","mode":"AND","isActive":"y"}]' //同名同時 OR 與 AND(getKpLossy 判有損)
const LOSSY_P = '[{"name":"P1","mode":"OR","isActive":"y"},{"name":"P1","mode":"AND","isActive":"y"}]'

function seedRows() {
    return {
        users: [
            mk('users', { id: 'u1', order: 1, name: 'peter', email: 'peter@example.com', cgrups: '{}', isAdmin: 'n', isActive: 'y' }),
            mk('users', { id: 'u2', order: 2, name: 'mary', email: 'mary@example.com', cgrups: PRETTY, isAdmin: 'n', isActive: 'y' }),
            mk('users', { id: 'u3', order: 3, name: 'john', email: 'john@example.com', cgrups: ARR_OFF, isAdmin: 'n', isActive: 'y' }),
            mk('users', { id: 'ux', order: 4, name: 'ext', email: 'ext@example.com', cgrups: '{}', isAdmin: 'n', isActive: 'y', from: 'teamA' }),
        ],
        grups: [
            mk('grups', { id: 'g1', order: 1, name: 'G1', cpemis: '{}' }),
            mk('grups', { id: 'g2', order: 2, name: 'G2', cpemis: PRETTY }),
            mk('grups', { id: 'g3', order: 3, name: 'G3', cpemis: ARR_OFF }),
            mk('grups', { id: 'gx', order: 4, name: 'GX', cpemis: '{}', from: 'teamA' }),
        ],
        pemis: [
            mk('pemis', { id: 'p1', order: 1, name: 'P1', crules: '{}' }),
            mk('pemis', { id: 'p2', order: 2, name: 'P2', crules: '{}' }),
        ],
        targets: [],
    }
}

let envs = [] //本案建立之全部環境(同一案可建多組以做對照), afterEach 逐一 cst.clear() 停止其 TTL timer, 否則 mocha 不結束

function createEnv() {
    let seed = seedRows()
    let woItems = {}
    for (let k of Object.keys(seed)) {
        woItems[k] = mkTable(seed[k])
    }
    let { srLog, logs } = mkSrLog()
    let cst = cacheSt()
    let core = mkCore(ds, woItems) //perm-run01: 原 mkProcOrm＋kmx: pmKeyMutex() 改為 w-serv-orm 實例之 procOrm＋withTabLocks／guardWrite
    let pc = autoDecl(proc(woItems, core.procOrm, { srLog, ...core.lock, lockSave: createLockSave(cst) }), woItems)
    let env = { seed, woItems, logs, cst, pc }
    envs.push(env)
    return env
}

//storeOf: store 快照(依 order; 前端 store 為資料庫之推播鏡像, 此處直接取庫內)
async function storeOf(e, table) {
    let rs = await e.woItems[table].select()
    return rs.sort((a, b) => a.order - b.order)
}

//call: 呼叫真 procCore 之寫入入口; baseline 未給(undefined)＝舊客戶端
const call = (e, table, rows, baseline) => e.pc[TAB[table].fn]('id-admin', cloneDeep(rows), baseline === undefined ? {} : { baseline }).then((v) => ({ ok: true, v }), (err) => ({ ok: false, v: err }))

//他人／外部同步於開框後對庫內之變動
const other = {
    patch: async (e, table, id, o) => {
        await e.woItems[table].save({ id, ...o })
    },
    add: async (e, table, row) => {
        await e.woItems[table].insert(row)
    },
    del: async (e, table, id) => {
        await e.woItems[table].del({ id })
    },
}

const byId = (rows, id) => rows.find((v) => v.id === id)
const ids = (rows) => rows.map((v) => v.id)


describe('unit-relDialogs-baseline (關聯對話框: 開框綁基準＋整表以存檔當下 store 為底, run07 F-26／S4)', function() {

    afterEach(function() {
        for (let e of envs) {
            e.cst.clear() //停止 cacheSt 之 TTL 偵測 timer, 避免 mocha 不結束
        }
        envs = []
    })


    // ===== 純函數 =====

    it('RB-001-getRowState: enable 7 形態 × mode 6 形態 = 42 格, 歸屬(enable==="y")才計 mode 之有效值(getEffMode: 非 "OR" 皆 AND), 其餘一律 n  [spec P3: 以有效狀態判定有無變更]', function() {
        let enables = ['y', 'n', '', 'Y', undefined, null, 1]
        let modes = ['OR', 'AND', 'or', undefined, null, 1]
        let n = 0
        for (let e of enables) {
            for (let m of modes) {
                let exp = e === 'y' ? (m === 'OR' ? 'y:OR' : 'y:AND') : 'n'
                assert.strictEqual(getRowState(e, m), exp, `enable=${String(e)} mode=${String(m)}`)
                n++
            }
        }
        assert.strictEqual(n, 42)
    })

    it('RB-002-getRowState 與 putRefEntry 之「未變更」判定等價: 7 種現值 × 42 種目標(enable × mode)全部 putRefEntry===false ⇔ 兩狀態相同  [spec P3: 前端判未變更 ⇔ 既有 putRefEntry 不改寫]', function() {
        let curs = [
            undefined, //無此引用
            { mode: 'OR', isActive: 'y' },
            { mode: 'AND', isActive: 'y' },
            { mode: 'OR', isActive: 'n' },
            { mode: 'AND', isActive: 'n' },
            'y', //純量值(伺服端解為啟用 AND)
            { isActive: 'y' }, //缺 mode(限制項, 顯示 AND)
        ]
        let enables = ['y', 'n', '', 'Y', undefined, null, 1]
        let modes = ['OR', 'AND', 'or', undefined, null, 1]
        let cells = 0
        for (let cur of curs) {
            let kpDec = cur === undefined ? Object.create(null) : cvKpToObj({ G1: cur }, HM)
            let st = getRefState(getOwn(kpDec, 'G1', null))
            for (let e of enables) {
                for (let m of modes) {
                    let unchanged = putRefEntry(Object.create(null), kpDec, 'G1', e, m) === false
                    assert.strictEqual(unchanged, getRowState(e, m) === getRowState(st.enable, st.mode), `cur=${JSON.stringify(cur)} target=${String(e)}/${String(m)}`)
                    cells++
                }
            }
        }
        assert.strictEqual(cells, 7 * 42)
    })

    it('RB-003-getChangedIdx: 8 種轉移全測; 切換後切回 → 未變更; enable 為 n 時改 mode → 未變更; 無記錄／缺身分／空洞／原型鍵名／未給記錄 → 視為有變更(無法證明未變更)  [spec P3]', function() {
        let base = [
            { id: 'a', enable: 'n', mode: 'OR' },
            { id: 'b', enable: 'y', mode: 'OR' },
            { id: 'c', enable: 'y', mode: 'AND' },
        ]
        let st = makeRowStates(base)
        let chg = (rows) => Object.keys(getChangedIdx(rows, st)).map(Number)
        assert.deepStrictEqual(chg(cloneDeep(base)), [], '全不動 → 無變更')
        //8 種轉移(a: n 起; b: y:OR 起; c: y:AND 起)
        let T = [
            ['a', 'n', 'AND', false], //n→n(mode 改但未歸屬: 狀態仍 n)
            ['a', 'y', 'OR', true], //n→y:OR
            ['a', 'y', 'AND', true], //n→y:AND
            ['b', 'n', 'OR', true], //y:OR→n
            ['b', 'y', 'AND', true], //y:OR→y:AND
            ['c', 'y', 'OR', true], //y:AND→y:OR
            ['c', 'n', 'OR', true], //y:AND→n
            ['c', 'y', 'AND', false], //y:AND→y:AND(切回原狀)
        ]
        for (let [id, enable, mode, changed] of T) {
            let rows = cloneDeep(base)
            Object.assign(rows.find((v) => v.id === id), { enable, mode })
            assert.deepStrictEqual(chg(rows), changed ? [base.findIndex((v) => v.id === id)] : [], `${id}→${enable}/${mode}`)
        }
        //mode 為無法判讀值(缺／'or'／1／null)者於歸屬時有效值為 AND: c(y:AND)改成 'or' 仍為未變更, b(y:OR)改成 'or' 為有變更
        for (let m of [undefined, 'or', 1, null]) {
            let r1 = cloneDeep(base)
            r1[2].mode = m
            assert.deepStrictEqual(chg(r1), [], `c mode=${String(m)} 有效值仍 AND`)
            let r2 = cloneDeep(base)
            r2[1].mode = m
            assert.deepStrictEqual(chg(r2), [1], `b mode=${String(m)} 有效值變 AND`)
        }
        //列之多重變更: 索引依列序
        let multi = cloneDeep(base)
        multi[0].enable = 'y'
        multi[2].enable = 'n'
        assert.deepStrictEqual(chg(multi), [0, 2])
        //無法證明未變更者一律有變更
        assert.deepStrictEqual(chg([{ id: 'zz', enable: 'n', mode: 'OR' }]), [0], '開框時無該列之記錄')
        assert.deepStrictEqual(chg([{ enable: 'n', mode: 'OR' }, { id: '', enable: 'n', mode: 'OR' }, { id: null, enable: 'n', mode: 'OR' }]), [0, 1, 2], '缺身分')
        assert.deepStrictEqual(chg([null, 5, 'a']), [0, 1, 2], '列非物件')
        // eslint-disable-next-line no-sparse-arrays
        assert.deepStrictEqual(chg([{ id: 'a', enable: 'n', mode: 'OR' }, , { id: 'c', enable: 'y', mode: 'AND' }]), [1], '空洞視為有變更, 其餘照常')
        for (let proto of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
            assert.deepStrictEqual(chg([{ id: proto, enable: 'n', mode: 'OR' }]), [0], `原型鍵名 ${proto} 於記錄中不存在 → 有變更`)
        }
        assert.deepStrictEqual(Object.keys(getChangedIdx(base, null)).map(Number), [0, 1, 2], '未給記錄(null) → 全部視為有變更')
        assert.deepStrictEqual(Object.keys(getChangedIdx(base, undefined)).map(Number), [0, 1, 2])
        assert.deepStrictEqual(Object.keys(getChangedIdx(null, st)), [], 'rows 非陣列 → 空')
        //states 為一般物件(非 makeRowStates 產出)亦以自有鍵判定
        assert.deepStrictEqual(Object.keys(getChangedIdx([{ id: 'a', enable: 'n', mode: 'OR' }], { a: 'n' })), [])
        assert.deepStrictEqual(Object.keys(getChangedIdx([{ id: 'constructor', enable: 'n', mode: 'OR' }], { a: 'n' })), ['0'])
        //數字身分以其字串形式(ADR-028)
        assert.deepStrictEqual(Object.keys(getChangedIdx([{ id: 7, enable: 'n', mode: 'OR' }], makeRowStates([{ id: '7', enable: 'n', mode: 'OR' }]))), [])
    })

    it('RB-004-buildRowsSend: 整表＝快照全部列同序; 只有 newVals 之列換 refKey 一欄(其餘欄逐字保留); 其餘列為快照同一物件; 不改輸入; refKey 可為 cpemis; 無效輸入防呆  [spec P2／P3]', function() {
        let snap = [
            { id: 'u1', name: 'a', cgrups: '{}', order: 1 },
            { id: 'u2', name: 'b', cgrups: PRETTY, order: 2 },
            { id: 'n1', name: 'new-after-open', cgrups: ARR_OFF, order: 3 }, //開框後他人新增(不在對話框)
            { id: 'u3', name: 'c', cgrups: '壞 JSON', order: 4 },
        ]
        let before = JSON.stringify(snap)
        let pairs = [snap[0], snap[1], snap[3]]
        //無 newVals: 整表等於快照, 每列同一物件(逐字不動)
        let r0 = buildRowsSend(snap, pairs, Object.create(null), 'cgrups')
        assert.deepStrictEqual(r0, snap)
        r0.forEach((v, k) => assert.strictEqual(v, snap[k], `第 ${k} 列應為快照同一物件`))
        //有 newVals: 只換被指定之列之 cgrups; 索引為「對話框列索引」(pairs[kr] 為配到之快照列)
        let r1 = buildRowsSend(snap, pairs, { 0: '{"G1":{"mode":"OR","isActive":"y"}}', 2: '壞 JSON 但已改' }, 'cgrups')
        assert.deepStrictEqual(ids(r1), ['u1', 'u2', 'n1', 'u3'], '列序依快照, 開框後新增之 n1 在其自然位置')
        assert.deepStrictEqual(r1[0], { id: 'u1', name: 'a', cgrups: '{"G1":{"mode":"OR","isActive":"y"}}', order: 1 }, '只換 cgrups 一欄')
        assert.strictEqual(r1[1], snap[1])
        assert.strictEqual(r1[2], snap[2], '開框後新增之列原樣帶回(同一物件)')
        assert.strictEqual(r1[3].cgrups, '壞 JSON 但已改')
        assert.strictEqual(r1[3].name, 'c')
        assert.strictEqual(JSON.stringify(snap), before, '輸入不被修改')
        //cpemis
        let g = [{ id: 'g1', cpemis: '{}' }, { id: 'g2', cpemis: '{}' }]
        let r2 = buildRowsSend(g, [g[1]], { 0: 'X' }, 'cpemis')
        assert.deepStrictEqual(r2, [{ id: 'g1', cpemis: '{}' }, { id: 'g2', cpemis: 'X' }])
        assert.strictEqual(r2[0], g[0])
        //防呆: 非字串之新值、對應 null 之配對、非物件 newVals 一律忽略; snapshot 非陣列 → []
        assert.deepStrictEqual(buildRowsSend(snap, [null, snap[1]], { 0: 'x', 1: 5 }, 'cgrups'), snap, 'null 配對與非字串新值不改任何列')
        assert.deepStrictEqual(buildRowsSend(snap, pairs, null, 'cgrups'), snap)
        assert.deepStrictEqual(buildRowsSend(snap, null, { 0: 'x' }, 'cgrups'), snap)
        for (let bad of [null, undefined, 'abc', 5, {}]) {
            assert.deepStrictEqual(buildRowsSend(bad, pairs, { 0: 'x' }, 'cgrups'), [])
        }
    })

    it('RB-005-makeRowStates: 以身分為鍵之無原型物件; 數字身分以字串形式; 缺身分不記; 重複身分取第一筆; 非陣列 → 空  [spec P3]', function() {
        let st = makeRowStates([
            { id: 'a', enable: 'y', mode: 'OR' },
            { id: 'a', enable: 'n', mode: 'OR' }, //重複: 取第一筆
            { id: 7, enable: 'y', mode: 'AND' },
            { id: '__proto__', enable: 'y', mode: 'OR' },
            { enable: 'y', mode: 'OR' },
            { id: '', enable: 'y', mode: 'OR' },
            null,
        ])
        assert.strictEqual(Object.getPrototypeOf(st), null)
        assert.deepStrictEqual(Object.keys(st).sort(), ['7', '__proto__', 'a'])
        assert.strictEqual(st.a, 'y:OR')
        assert.strictEqual(st['7'], 'y:AND')
        assert.strictEqual(Object.getOwnPropertyDescriptor(st, '__proto__').value, 'y:OR', '原型鍵名為自有屬性')
        for (let bad of [null, undefined, 'abc', 5, {}]) {
            assert.deepStrictEqual(Object.keys(makeRowStates(bad)), [])
        }
    })

    it('RB-006-buildRowsSend: 同一快照列被兩個對話框列配到(防禦) → 取第一個之新值, 不重複改寫  [spec P3]', function() {
        let snap = [{ id: 'u1', cgrups: '{}' }]
        let r = buildRowsSend(snap, [snap[0], snap[0]], { 0: 'A', 1: 'B' }, 'cgrups')
        assert.strictEqual(r[0].cgrups, 'A')
    })

    it('RB-007-基準口徑: 開框時之 makeBaseline(來源列, 表名) 即伺服端 checkBaseline 所比對之摘要(對庫內同版本整表通過); 格式合法(h1: 前綴＋14 位 16 進位, 序即名次); 欄位與 digestRow 排除 order 與伺服器管理欄一致  [spec P1／P5]', async function() {
        //perm-run01: 原 makeBaseline(來源列, ds[表].keys)／checkBaseline({ keys, r, ltdtOld, baseline })／rowDigest(row, keys) 改為
        //  makeBaseline(來源列, 表名)／checkBaseline({ keyTable, ltdtOld, baseline })／digestRow(row, getContract(表名)); 原「對庫內同版本之任一列視為本次修改」之 r 已無(表級比對不分本次寫入之列)
        let { woItems } = createEnv()
        for (let table of ['users', 'grups']) {
            let store = await storeOf({ woItems }, table)
            let dlg = openDialog(store, table === 'users' ? 'G1' : 'P1', table)
            assert.ok(isBaselineValid(dlg.baseline), `${table} 基準格式`)
            assert.deepStrictEqual(dlg.baseline, makeBaseline(store, table), `${table} 同一口徑`)
            assert.strictEqual(dlg.baseline.length, store.length)
            assert.deepStrictEqual(dlg.baseline.map(([id]) => id), ids(store), `${table} 基準之序即名次(依 order)`)
            for (let [, dg] of dlg.baseline) {
                assert.ok(/^h1:[0-9a-f]{14}$/.test(dg), `${table} 摘要格式 h1:+14 位小寫 16 進位: ${dg}`)
            }
            //伺服端比對: 對庫內同版本整表 → 通過
            let ltdtOld = await woItems[table].select()
            assert.strictEqual(checkBaseline({ keyTable: table, ltdtOld, baseline: dlg.baseline }), null)
            //order／稽核欄變動不影響摘要(外部同步整來源重寫使每列稽核欄皆變, 不應使草稿作廢)
            let ct = getContract(table)
            let moved = cloneDeep(store[0])
            moved.order = 99
            moved.timeUpdate = '2030-01-01T00:00:00.000+08:00'
            moved.userIdUpdate = 'someone'
            assert.strictEqual(digestRow(moved, ct), digestRow(store[0], ct))
            //內容欄變動則摘要不同
            let edited = cloneDeep(store[0])
            edited[TAB[table].refKey] = ON('Z')
            assert.notStrictEqual(digestRow(edited, ct), digestRow(store[0], ct))
            //伺服端比對: 庫內某列內容異於基準 → saveStale(rowChanged)
            let drifted = cloneDeep(ltdtOld)
            drifted.find((v) => v.id === store[0].id)[TAB[table].refKey] = ON('Z')
            let ck = checkBaseline({ keyTable: table, ltdtOld: drifted, baseline: dlg.baseline })
            assert.ok(ck !== null && ck.key === 'saveStale' && ck.reason === 'rowChanged', `${table} 內容異動 → saveStale/rowChanged: ${JSON.stringify(ck)}`)
        }
    })

    it('RB-008-基準於開框時綁定(B.1): 開框後 store 變新, 基準仍為舊版本之指紋(以兩個不同版本之來源列證明); 重新開框(show)重新綁定為當時版本  [spec P1]', function() {
        let v1 = [mk('users', { id: 'u1', order: 1, name: 'a', cgrups: '{}' }), mk('users', { id: 'u2', order: 2, name: 'b', cgrups: '{}' })]
        let v2 = cloneDeep(v1)
        v2[0].cgrups = ON('G1') //開框後他人改了 u1
        v2.push(mk('users', { id: 'u9', order: 3, name: 'new', cgrups: '{}' })) //並新增 u9
        let dlg = openDialog(v1, 'G1', 'users')
        let b1 = makeBaseline(v1, 'users')
        let b2 = makeBaseline(v2, 'users')
        assert.notDeepStrictEqual(b1, b2, '兩版本之指紋不同(夾具有效)')
        assert.deepStrictEqual(dlg.baseline, b1, '開框時綁定之基準＝開框時來源列之指紋')
        //store 推播變新: 基準為開框時計算之值, 不隨 store 改變
        assert.deepStrictEqual(dlg.baseline, b1, 'store 變新後基準仍為舊版')
        assert.notDeepStrictEqual(dlg.baseline, b2)
        //存檔模型取之基準即開框時之值(與當下 store 無關)
        toggle(dlg, 'u2', 'y', 'OR')
        let res = saveModel(dlg, v2, 'G1', 'users')
        assert.deepStrictEqual(res.baseline, b1)
        assert.ok(!res.baseline.some(([id]) => id === 'u9'), '基準不含開框後才新增之列')
        //重新開框: 以當時 store 重新綁定
        let dlg2 = openDialog(v2, 'G1', 'users')
        assert.deepStrictEqual(dlg2.baseline, b2)
    })


    // ===== 端到端: 前端組出之整表 + 基準 → 真 procCore =====

    it('RB-SRV-001-無開框後變動: 勾選 u1 → 送出整表＝store 全部 4 列(含外部列, 同序); 成功; 只有 u1 之 cgrups 改為只含本群組一項, u2(pretty JSON5)／u3(陣列含停用項)／外部列 ux 逐字不動  [spec P2／P3]', async function() {
        let e = createEnv()
        let store = await storeOf(e, 'users')
        let dlg = openDialog(store, 'G1', 'users')
        toggle(dlg, 'u1', 'y', 'OR')
        let res = saveModel(dlg, store, 'G1', 'users')
        assert.deepStrictEqual(ids(res.rowsSend), ids(store), '整表＝store 全部列, 同序')
        assert.strictEqual(res.rowsSend.length, 4)
        assert.strictEqual(res.rowsSend[0].cgrups, ON('G1'))
        for (let id of ['u2', 'u3', 'ux']) {
            assert.deepStrictEqual(byId(res.rowsSend, id), byId(store, id), `${id} 原樣帶回`)
        }
        assert.strictEqual(byId(res.rowsSend, 'u2').cgrups, PRETTY, '未變更列之字串逐字(含空白與換行)')
        let r = await call(e, 'users', res.rowsSend, res.baseline)
        assert.deepStrictEqual(r, { ok: true, v: 'saveTabItemsSuccess' })
        let after = await storeOf(e, 'users')
        assert.strictEqual(after.length, 4)
        assert.strictEqual(byId(after, 'u1').cgrups, ON('G1'))
        assert.strictEqual(byId(after, 'u2').cgrups, PRETTY)
        assert.strictEqual(byId(after, 'u3').cgrups, ARR_OFF)
        assert.strictEqual(byId(after, 'ux').cgrups, '{}')
        assert.strictEqual(byId(after, 'ux').from, 'teamA')
    })

    it('RB-SRV-002-S4 開框後他人新增列 u9: 前端整表仍含 u9(原樣帶回, 在其 order 位置), 但表級基準已過期 → 伺服端 saveStale、零寫入、u9 仍在庫內(run11 原則 7: 先動先贏; run07 版為成功); 重新開框(新基準)後再存成功且 u9 保留; 對照修前行為(只送對話框之列)u9 被整表 diff 刪除  [spec P2／原則 7]', async function() {
        let e = createEnv()
        let store1 = await storeOf(e, 'users')
        let dlg = openDialog(store1, 'G1', 'users')
        await other.add(e, 'users', mk('users', { id: 'u9', order: 5, name: 'new9', email: 'new9@example.com', cgrups: ON('G1'), isAdmin: 'n', isActive: 'y' }))
        let store2 = await storeOf(e, 'users')
        assert.ok(byId(store2, 'u9'))
        toggle(dlg, 'u1', 'y', 'OR')
        let res = saveModel(dlg, store2, 'G1', 'users')
        assert.deepStrictEqual(ids(res.rowsSend), ids(store2))
        assert.deepStrictEqual(byId(res.rowsSend, 'u9'), byId(store2, 'u9'), 'u9 逐字原樣帶回')
        assert.deepStrictEqual(await call(e, 'users', res.rowsSend, res.baseline), { ok: false, v: 'saveStale' }, '開框後表內多了 u9 → 表級過期')
        let mid = await storeOf(e, 'users')
        assert.ok(byId(mid, 'u9'), 'u9 仍在庫內')
        assert.strictEqual(byId(mid, 'u1').cgrups, '{}', '零寫入(u1 未被改)')
        //重新開框(基準取自含 u9 之 store)後再存: 成功, u9 保留
        let dlgB = openDialog(store2, 'G1', 'users')
        toggle(dlgB, 'u1', 'y', 'OR')
        let resB = saveModel(dlgB, store2, 'G1', 'users')
        assert.deepStrictEqual(await call(e, 'users', resB.rowsSend, resB.baseline), { ok: true, v: 'saveTabItemsSuccess' })
        let after = await storeOf(e, 'users')
        assert.ok(byId(after, 'u9'), 'u9 仍在庫內(修前被刪)')
        assert.strictEqual(byId(after, 'u9').cgrups, ON('G1'))
        assert.strictEqual(byId(after, 'u1').cgrups, ON('G1'))

        //對照: 修前行為 → u9 被刪
        let e2 = createEnv()
        let s1 = await storeOf(e2, 'users')
        let d2 = openDialog(s1, 'G1', 'users')
        await other.add(e2, 'users', mk('users', { id: 'u9', order: 5, name: 'new9', email: 'new9@example.com', cgrups: '{}', isAdmin: 'n', isActive: 'y' }))
        toggle(d2, 'u1', 'y', 'OR')
        let lg = legacySaveModel(d2, await storeOf(e2, 'users'), 'G1', 'users')
        assert.strictEqual(lg.rowsSend.length, 4, '修前整表只含對話框之列')
        //修前行為 + 基準: 伺服端視 u9 之刪除為過期(基準無該列＝草稿之後才新增)而整次拒收 → 開框後只要有他人新增列, 此對話框就無法存檔
        assert.deepStrictEqual(await call(e2, 'users', lg.rowsSend, d2.baseline), { ok: false, v: 'saveStale' }, '修前行為 + 基準: 被拒(使用者無法存檔)')
        assert.ok(byId(await storeOf(e2, 'users'), 'u9'))
        //修前行為且無基準(舊客戶端): 靜默刪除 u9(S4)
        let r2 = await call(e2, 'users', lg.rowsSend, undefined)
        assert.strictEqual(r2.ok, true)
        assert.ok(!byId(await storeOf(e2, 'users'), 'u9'), '修前行為(無基準): u9 被刪(S4)')
    })

    it('RB-SRV-003-開框後他人改了使用者「未碰」之列 u3: u3 以存檔當下 store 版本原樣帶回、不被草稿舊值改寫; 但表級基準已過期 → 伺服端 saveStale、零寫入(run11 原則 7: 他人改別列亦拒; run07 版為成功); 重新開框後存檔成功且 u3 保留他人之版本; 對照修前行為(以草稿值改寫)→ 伺服端 saveStale、或(無基準之舊客戶端)覆蓋他人變更  [spec P3／P5／原則 7]', async function() {
        let e = createEnv()
        let store1 = await storeOf(e, 'users')
        let dlg = openDialog(store1, 'G1', 'users') //開框時 u3 未歸屬 G1(ARR_OFF 只有停用之 G7 與 G9)
        await other.patch(e, 'users', 'u3', { cgrups: ON('G1', 'AND'), timeUpdate: '2026-02-02T00:00:00.000+08:00' }) //他人讓 u3 歸屬 G1(AND)
        let store2 = await storeOf(e, 'users')
        toggle(dlg, 'u1', 'y', 'OR')
        let res = saveModel(dlg, store2, 'G1', 'users')
        assert.deepStrictEqual(byId(res.rowsSend, 'u3'), byId(store2, 'u3'), 'u3 原樣帶回存檔當下 store 之版本')
        assert.strictEqual(byId(res.rowsSend, 'u3').cgrups, ON('G1', 'AND'))
        assert.ok(!(2 in res.kpNew), '未變更列不入新值表')
        assert.deepStrictEqual(await call(e, 'users', res.rowsSend, res.baseline), { ok: false, v: 'saveStale' }, '表內 u3 已異於開框時 → 表級過期(即使 u3 本次不寫入)')
        assert.strictEqual(byId(await storeOf(e, 'users'), 'u1').cgrups, '{}', '零寫入')
        let dlgB = openDialog(store2, 'G1', 'users') //重新開框: 基準取自含他人變更之 store
        toggle(dlgB, 'u1', 'y', 'OR')
        let resB = saveModel(dlgB, store2, 'G1', 'users')
        assert.deepStrictEqual(await call(e, 'users', resB.rowsSend, resB.baseline), { ok: true, v: 'saveTabItemsSuccess' })
        let after = await storeOf(e, 'users')
        assert.strictEqual(byId(after, 'u3').cgrups, ON('G1', 'AND'), '保留他人之變更')
        assert.strictEqual(byId(after, 'u1').cgrups, ON('G1'))

        //對照 A: 修前行為 + 基準 → 草稿值(u3 未歸屬)與 store(已歸屬)不同 → 改寫 u3 → 伺服端 saveStale
        let e2 = createEnv()
        let s1 = await storeOf(e2, 'users')
        let d2 = openDialog(s1, 'G1', 'users')
        await other.patch(e2, 'users', 'u3', { cgrups: ON('G1', 'AND'), timeUpdate: '2026-02-02T00:00:00.000+08:00' })
        toggle(d2, 'u1', 'y', 'OR')
        let lg = legacySaveModel(d2, await storeOf(e2, 'users'), 'G1', 'users')
        assert.notStrictEqual(byId(lg.rowsSend, 'u3').cgrups, ON('G1', 'AND'), '修前行為: u3 被草稿值改寫')
        assert.deepStrictEqual(await call(e2, 'users', lg.rowsSend, d2.baseline), { ok: false, v: 'saveStale' })
        //對照 B: 修前行為且無基準(舊客戶端) → 靜默覆蓋他人之變更(最後寫入者勝)
        let r3 = await call(e2, 'users', lg.rowsSend, undefined)
        assert.strictEqual(r3.ok, true)
        assert.ok(!(await storeOf(e2, 'users')).find((v) => v.id === 'u3').cgrups.includes('G1'), '修前行為(無基準): 他人讓 u3 歸屬 G1 之變更被覆蓋')
    })

    it('RB-SRV-004-開框後他人改了使用者「有變更」之列 u2: 對 u2 套用變更並送出 → 伺服端 saveStale、零寫入(庫內仍為他人之版本)  [spec P5]', async function() {
        let e = createEnv()
        let store1 = await storeOf(e, 'users')
        let dlg = openDialog(store1, 'G1', 'users')
        await other.patch(e, 'users', 'u2', { cgrups: ON('G8'), timeUpdate: '2026-02-02T00:00:00.000+08:00' })
        let store2 = await storeOf(e, 'users')
        toggle(dlg, 'u2', 'y', 'OR')
        let res = saveModel(dlg, store2, 'G1', 'users')
        assert.ok(res.rowsSend, '前端不攔(基準比對由伺服端把關)')
        assert.strictEqual(byId(res.rowsSend, 'u2').cgrups, JSON.stringify({ G8: { mode: 'OR', isActive: 'y' }, G1: { mode: 'OR', isActive: 'y' } }), '變更套用於存檔當下快照之字串(保留他人加入之 G8)')
        let r = await call(e, 'users', res.rowsSend, res.baseline)
        assert.deepStrictEqual(r, { ok: false, v: 'saveStale' })
        let after = await storeOf(e, 'users')
        assert.strictEqual(byId(after, 'u2').cgrups, ON('G8'), '零寫入')
        assert.strictEqual(byId(after, 'u1').cgrups, '{}', '零寫入(含其他列)')
        assert.ok(e.logs.some((l) => l.level === 'error' && l.event === 'updateTabItems-stale-error' && l.msg === 'saveStale'), 'srLog 記 saveStale')
    })

    it('RB-SRV-005-基準須於開框時綁定(B.1): 開框後他人改了 u1, 使用者勾選 u1 → 以開框基準送出被拒 saveStale; 對照「存檔當下才取基準」會通過並以舊草稿覆蓋他人變更(此即不合格之原因)  [spec P1]', async function() {
        let e = createEnv()
        let store1 = await storeOf(e, 'users')
        let dlg = openDialog(store1, 'G1', 'users')
        await other.patch(e, 'users', 'u1', { cgrups: ON('G5'), timeUpdate: '2026-02-02T00:00:00.000+08:00' })
        let store2 = await storeOf(e, 'users')
        toggle(dlg, 'u1', 'y', 'OR')
        let res = saveModel(dlg, store2, 'G1', 'users')
        assert.deepStrictEqual(await call(e, 'users', res.rowsSend, res.baseline), { ok: false, v: 'saveStale' }, '開框基準 → 被拒')
        assert.strictEqual(byId(await storeOf(e, 'users'), 'u1').cgrups, ON('G5'))
        //對照: 存檔當下才由最新 store 取基準(不合格作法)→ 伺服端無從發現草稿已舊
        let late = await call(e, 'users', res.rowsSend, makeBaseline(store2, 'users'))
        assert.deepStrictEqual(late, { ok: true, v: 'saveTabItemsSuccess' }, '存檔當下取基準: 通過(證明的是 store 新, 不是待存內容新)')
    })

    it('RB-SRV-006-開框後對話框內之列 u2 被刪: saveModel 回 relationRowsStale(點名), 不產出整表、不呼叫伺服端; 庫內不變  [spec P4]', async function() {
        let e = createEnv()
        let store1 = await storeOf(e, 'users')
        let dlg = openDialog(store1, 'G1', 'users')
        await other.del(e, 'users', 'u2')
        let store2 = await storeOf(e, 'users')
        toggle(dlg, 'u1', 'y', 'OR')
        let res = saveModel(dlg, store2, 'G1', 'users')
        assert.deepStrictEqual(res, { rejected: 'relationRowsStale', names: ['mary'] })
        assert.strictEqual((await storeOf(e, 'users')).length, 3)
        assert.strictEqual(byId(await storeOf(e, 'users'), 'u1').cgrups, '{}')
    })

    it('RB-SRV-007-外部列 ux(from: teamA): 勾選其指派 → 附基準可存, from／名稱／email 逐字帶回; 無基準(舊客戶端) → saveBaselineRequired  [spec P6]', async function() {
        let e = createEnv()
        let store = await storeOf(e, 'users')
        let dlg = openDialog(store, 'G1', 'users')
        toggle(dlg, 'ux', 'y', 'AND')
        let res = saveModel(dlg, store, 'G1', 'users')
        assert.strictEqual(byId(res.rowsSend, 'ux').from, 'teamA')
        assert.strictEqual(byId(res.rowsSend, 'ux').cgrups, ON('G1', 'AND'))
        assert.deepStrictEqual(await call(e, 'users', res.rowsSend, undefined), { ok: false, v: 'saveBaselineRequired' }, '無基準')
        assert.deepStrictEqual(await call(e, 'users', res.rowsSend, res.baseline), { ok: true, v: 'saveTabItemsSuccess' })
        let ux = byId(await storeOf(e, 'users'), 'ux')
        assert.strictEqual(ux.cgrups, ON('G1', 'AND'))
        assert.strictEqual(ux.from, 'teamA')
        assert.strictEqual(ux.name, 'ext')
        assert.strictEqual(ux.email, 'ext@example.com')
    })

    it('RB-SRV-008-開框後外部同步整來源重寫(每列稽核欄皆變、內容未變): 勾選 u1 仍成功(指紋排除稽核欄與 order), 其餘列原樣帶回(含新稽核欄), 外部列稽核欄不回退  [spec P1／P5]', async function() {
        let e = createEnv()
        let store1 = await storeOf(e, 'users')
        let dlg = openDialog(store1, 'G1', 'users')
        for (let u of store1) {
            await other.patch(e, 'users', u.id, { userId: 'id-sync', userIdUpdate: 'id-sync', timeCreate: '2026-03-03T00:00:00.000+08:00', timeUpdate: '2026-03-03T00:00:00.000+08:00' })
        }
        let store2 = await storeOf(e, 'users')
        toggle(dlg, 'u1', 'y', 'OR')
        let res = saveModel(dlg, store2, 'G1', 'users')
        assert.deepStrictEqual(byId(res.rowsSend, 'ux'), byId(store2, 'ux'), '外部列帶回存檔當下之稽核欄')
        assert.deepStrictEqual(await call(e, 'users', res.rowsSend, res.baseline), { ok: true, v: 'saveTabItemsSuccess' })
        let ux = byId(await storeOf(e, 'users'), 'ux')
        assert.strictEqual(ux.timeCreate, '2026-03-03T00:00:00.000+08:00', '外部列之建立時間未被回退')
    })

    it('RB-SRV-009-有損列(同名 OR+AND, getKpLossy): 使用者未變更 → 不檢查有損、不拒、字串逐字帶回(即使開框後才變有損); 使用者有變更 → authLossyBlocked(既有行為)  [spec P3／P4 精神: 有變更才處置]', async function() {
        let e = createEnv()
        let store1 = await storeOf(e, 'users')
        let dlg = openDialog(store1, 'G1', 'users')
        await other.patch(e, 'users', 'u3', { cgrups: LOSSY, timeUpdate: '2026-02-02T00:00:00.000+08:00' }) //開框後 u3 變有損(同名 G1 同時 OR 與 AND)
        let store2 = await storeOf(e, 'users')
        toggle(dlg, 'u1', 'y', 'OR')
        let res = saveModel(dlg, store2, 'G1', 'users')
        assert.ok(res.rowsSend, '未變更之有損列不拒(前端不攔)')
        assert.strictEqual(byId(res.rowsSend, 'u3').cgrups, LOSSY, '逐字帶回')
        assert.deepStrictEqual(await call(e, 'users', res.rowsSend, res.baseline), { ok: false, v: 'saveStale' }, 'run11 表級: u3 於開框後被改 → 以開框基準被拒')
        let dlgB = openDialog(store2, 'G1', 'users') //重新開框後再存: 有損列逐字帶回, 成功
        toggle(dlgB, 'u1', 'y', 'OR')
        let resB = saveModel(dlgB, store2, 'G1', 'users')
        assert.strictEqual(byId(resB.rowsSend, 'u3').cgrups, LOSSY, '逐字帶回')
        assert.deepStrictEqual(await call(e, 'users', resB.rowsSend, resB.baseline), { ok: true, v: 'saveTabItemsSuccess' })
        assert.strictEqual(byId(await storeOf(e, 'users'), 'u3').cgrups, LOSSY)
        //使用者勾選有損列 u3(開框時為未歸屬 → 歸屬)
        let dlg2 = openDialog(store2, 'G1', 'users')
        toggle(dlg2, 'u3', 'n', 'OR') //store2 之 u3 對 G1 為有損(OR+AND 並存, getRefState 解碼為 AND 啟用); 改為不歸屬 → 與快照狀態不同
        let res2 = saveModel(dlg2, await storeOf(e, 'users'), 'G1', 'users')
        assert.deepStrictEqual(res2, { rejected: 'authLossyBlocked', names: ['john'] })
    })

    it('RB-SRV-010-開框後他人改了 order(store 排序變動): 送出整表仍依存檔當下 store 之 order 序(不依對話框列序), 但名次入基準 → 以開框基準送出被拒 saveStale、零寫入(perm-run01 原則 10); 重新開框後存檔成功且他人之排序保留  [spec P2／原則 10: 他人只重排 → 不符]', async function() {
        //perm-run01: 原預期「他人只改 order(名次改變) → 成功」改為 saveStale——共用核心基準(h1)的摘要不含 order 數值但「序即名次」入基準, 他人重排被偵測(刻意語意變更, 規格原則 10; 舊版指紋排除 order 故放行);
        //  原斷言之意圖(送出整表依存檔當下 store 序、他人之排序保留、內容無誤)仍保留於前端組裝與重新開框後的存檔
        let e = createEnv()
        let store1 = await storeOf(e, 'users')
        let dlg = openDialog(store1, 'G1', 'users')
        await other.patch(e, 'users', 'u1', { order: 2 })
        await other.patch(e, 'users', 'u2', { order: 1 })
        let store2 = await storeOf(e, 'users')
        assert.deepStrictEqual(ids(store2), ['u2', 'u1', 'u3', 'ux'])
        toggle(dlg, 'u1', 'y', 'OR')
        let res = saveModel(dlg, store2, 'G1', 'users')
        assert.deepStrictEqual(ids(res.rowsSend), ['u2', 'u1', 'u3', 'ux'], '送出整表依存檔當下 store 之 order 序')
        assert.deepStrictEqual(await call(e, 'users', res.rowsSend, res.baseline), { ok: false, v: 'saveStale' }, '名次與開框時不同 → 表級過期')
        assert.ok(e.logs.some((l) => l.level === 'error' && l.event === 'updateTabItems-stale-error' && l.msg === 'saveStale' && l.reason === 'rowReordered'), 'srLog 記 saveStale／rowReordered')
        let mid = await storeOf(e, 'users')
        assert.deepStrictEqual(ids(mid), ['u2', 'u1', 'u3', 'ux'], '零寫入: 他人之排序仍在')
        assert.strictEqual(byId(mid, 'u1').cgrups, '{}', '零寫入: u1 未被改')
        //重新開框(基準取自含新排序之 store)後再存: 成功, 他人之排序保留
        let dlgB = openDialog(store2, 'G1', 'users')
        toggle(dlgB, 'u1', 'y', 'OR')
        let resB = saveModel(dlgB, store2, 'G1', 'users')
        assert.deepStrictEqual(await call(e, 'users', resB.rowsSend, resB.baseline), { ok: true, v: 'saveTabItemsSuccess' })
        let after = await storeOf(e, 'users')
        assert.deepStrictEqual(ids(after), ['u2', 'u1', 'u3', 'ux'], '他人之排序保留')
        assert.strictEqual(byId(after, 'u1').cgrups, ON('G1'))
    })

    it('RB-SRV-012-開框後 order 數值被系統重編號而名次不變(如外部同步整來源重寫): 勾選 u1 仍成功(order 數值不入摘要, 名次不變不誤擋), 內容無誤  [spec P1／P5／原則 10: 重編號名次不變 → 相符]', async function() {
        //perm-run01 新增: 與 RB-SRV-010 成對(名次變 → 擋; 數值變而名次不變 → 放行)
        let e = createEnv()
        let store1 = await storeOf(e, 'users')
        let dlg = openDialog(store1, 'G1', 'users')
        let k = 10
        for (let u of store1) {
            await other.patch(e, 'users', u.id, { order: k })
            k += 10
        }
        let store2 = await storeOf(e, 'users')
        assert.deepStrictEqual(ids(store2), ids(store1), '名次不變')
        assert.deepStrictEqual(store2.map((v) => v.order), [10, 20, 30, 40], '夾具有效: order 數值已變')
        toggle(dlg, 'u1', 'y', 'OR')
        let res = saveModel(dlg, store2, 'G1', 'users')
        assert.deepStrictEqual(await call(e, 'users', res.rowsSend, res.baseline), { ok: true, v: 'saveTabItemsSuccess' })
        let after = await storeOf(e, 'users')
        assert.deepStrictEqual(ids(after), ids(store1))
        assert.strictEqual(byId(after, 'u1').cgrups, ON('G1'))
    })

    it('RB-SRV-011-無任何變更即存檔: 整表原樣送出(全部列逐字同 store), 伺服端成功且零寫入(全為 same)  [spec P3]', async function() {
        let e = createEnv()
        let store = await storeOf(e, 'users')
        let dlg = openDialog(store, 'G1', 'users')
        let res = saveModel(dlg, store, 'G1', 'users')
        assert.deepStrictEqual(res.rowsSend, store)
        assert.strictEqual(Object.keys(res.kpNew).length, 0)
        assert.deepStrictEqual(await call(e, 'users', res.rowsSend, res.baseline), { ok: true, v: 'saveTabItemsSuccess' })
        assert.strictEqual(e.woItems.users.cnt.save, 0, '無列被寫入')
        assert.strictEqual(e.woItems.users.cnt.insert, 0)
        assert.strictEqual(e.woItems.users.cnt.del, 0)
    })

    it('RB-SRV-101-權限所屬群組對話框(grups, 驗名稱): 勾選 g1 → 整表含 4 群組(含外部群組 gx); 開框後他人新增群組 g9 原樣帶回且不被刪, 但表級基準已過期 → saveStale; 重新開框後成功  [spec P2／P3／原則 7]', async function() {
        let e = createEnv()
        let store1 = await storeOf(e, 'grups')
        let dlg = openDialog(store1, 'P1', 'grups')
        await other.add(e, 'grups', mk('grups', { id: 'g9', order: 5, name: 'G9new', cpemis: ON('P1') }))
        let store2 = await storeOf(e, 'grups')
        toggle(dlg, 'g1', 'y', 'OR')
        let res = saveModel(dlg, store2, 'P1', 'grups')
        assert.deepStrictEqual(ids(res.rowsSend), ids(store2))
        assert.strictEqual(byId(res.rowsSend, 'g1').cpemis, ON('P1'))
        assert.deepStrictEqual(byId(res.rowsSend, 'g9'), byId(store2, 'g9'))
        assert.deepStrictEqual(byId(res.rowsSend, 'g2'), byId(store2, 'g2'))
        assert.strictEqual(byId(res.rowsSend, 'g2').cpemis, PRETTY)
        assert.deepStrictEqual(await call(e, 'grups', res.rowsSend, res.baseline), { ok: false, v: 'saveStale' }, '開框後表內多了 g9 → 表級過期')
        assert.strictEqual(byId(await storeOf(e, 'grups'), 'g1').cpemis, '{}', '零寫入')
        let dlgB = openDialog(store2, 'P1', 'grups')
        toggle(dlgB, 'g1', 'y', 'OR')
        let resB = saveModel(dlgB, store2, 'P1', 'grups')
        assert.deepStrictEqual(await call(e, 'grups', resB.rowsSend, resB.baseline), { ok: true, v: 'saveTabItemsSuccess' })
        let after = await storeOf(e, 'grups')
        assert.ok(byId(after, 'g9'), 'g9 仍在庫內')
        assert.strictEqual(byId(after, 'g1').cpemis, ON('P1'))
        assert.strictEqual(byId(after, 'g3').cpemis, ARR_OFF)
        //外部群組 gx 之指派可勾選
        let dlg2 = openDialog(after, 'P1', 'grups')
        toggle(dlg2, 'gx', 'y', 'OR')
        let res2 = saveModel(dlg2, after, 'P1', 'grups')
        assert.deepStrictEqual(await call(e, 'grups', res2.rowsSend, res2.baseline), { ok: true, v: 'saveTabItemsSuccess' })
        let gx = byId(await storeOf(e, 'grups'), 'gx')
        assert.strictEqual(gx.cpemis, ON('P1'))
        assert.strictEqual(gx.from, 'teamA')
        assert.strictEqual(gx.name, 'GX')
    })

    it('RB-SRV-102-群組於開框後被改名(verifyKeys: name): saveModel 回 relationRowsStale(點名開框時之名稱); 被刪亦然  [spec P4]', async function() {
        let e = createEnv()
        let store1 = await storeOf(e, 'grups')
        let dlg = openDialog(store1, 'P1', 'grups')
        await other.patch(e, 'grups', 'g2', { name: 'G2-renamed' })
        toggle(dlg, 'g1', 'y', 'OR')
        let res = saveModel(dlg, await storeOf(e, 'grups'), 'P1', 'grups')
        assert.deepStrictEqual(res, { rejected: 'relationRowsStale', names: ['G2'] })
        await other.patch(e, 'grups', 'g2', { name: 'G2' })
        await other.del(e, 'grups', 'g3')
        let res2 = saveModel(dlg, await storeOf(e, 'grups'), 'P1', 'grups')
        assert.deepStrictEqual(res2, { rejected: 'relationRowsStale', names: ['G3'] })
    })

    it('RB-SRV-103-開框後他人改了使用者未碰之群組 g3: g3 帶回存檔當下版本不被草稿改寫, 但表級基準已過期 → saveStale、零寫入; 重新開框後勾選 g1 成功且 g3 保留他人之變更; 有損群組(同名 OR+AND)未變更 → 前端不拒  [spec P3／P5／原則 7]', async function() {
        let e = createEnv()
        let store1 = await storeOf(e, 'grups')
        let dlg = openDialog(store1, 'P1', 'grups')
        await other.patch(e, 'grups', 'g3', { cpemis: LOSSY_P, timeUpdate: '2026-02-02T00:00:00.000+08:00' })
        await other.patch(e, 'grups', 'g2', { cpemis: ON('P1', 'AND'), timeUpdate: '2026-02-02T00:00:00.000+08:00' })
        let store2 = await storeOf(e, 'grups')
        toggle(dlg, 'g1', 'y', 'OR')
        let res = saveModel(dlg, store2, 'P1', 'grups')
        assert.ok(res.rowsSend)
        assert.strictEqual(byId(res.rowsSend, 'g3').cpemis, LOSSY_P)
        assert.strictEqual(byId(res.rowsSend, 'g2').cpemis, ON('P1', 'AND'))
        assert.deepStrictEqual(await call(e, 'grups', res.rowsSend, res.baseline), { ok: false, v: 'saveStale' }, '表內 g2／g3 已異於開框時 → 表級過期')
        assert.strictEqual(byId(await storeOf(e, 'grups'), 'g1').cpemis, '{}', '零寫入')
        let dlgB = openDialog(store2, 'P1', 'grups')
        toggle(dlgB, 'g1', 'y', 'OR')
        let resB = saveModel(dlgB, store2, 'P1', 'grups')
        assert.deepStrictEqual(await call(e, 'grups', resB.rowsSend, resB.baseline), { ok: true, v: 'saveTabItemsSuccess' })
        let after = await storeOf(e, 'grups')
        assert.strictEqual(byId(after, 'g3').cpemis, LOSSY_P)
        assert.strictEqual(byId(after, 'g2').cpemis, ON('P1', 'AND'))
        assert.strictEqual(byId(after, 'g1').cpemis, ON('P1'))
    })


    // ===== 靜態站點: 接線(防回退; 靜態不變式只擋字面與資料來源之回退, 語意由上列 RB-SRV-* 與 e2e 證) =====

    const codeLines = (fp) => sourceLines(fp, 'code').filter((l) => l.text.trim() !== '')
    const methodBody = (lines, name) => {
        let i0 = lines.findIndex((l) => new RegExp(`^\\s{8}${name}: (async )?function`).test(l.text))
        assert.ok(i0 >= 0, `找不到方法 ${name}`)
        let i1 = lines.findIndex((l, k) => k > i0 && /^\s{8}[A-Za-z_$][\w$]*: (async )?function/.test(l.text))
        return lines.slice(i0, i1 < 0 ? lines.length : i1).map((l) => l.text).join('\n')
    }
    const VUES = [
        { fn: 'VeGrupBlngUsers', snap: 'users', save: 'saveUsers', api: 'updateUsers', refKey: 'cgrups', newVar: 'kpNewCgrups', send: 'usersNew' },
        { fn: 'VePemiBlngGrups', snap: 'grups', save: 'saveGrups', api: 'updateGrups', refKey: 'cpemis', newVar: 'kpNewCpemis', send: 'grupsNew' },
    ]
    const count = (s, sub) => s.split(sub).length - 1

    it('SITE-RB-001-show(): 與 items 同一處綁定基準與開框狀態: `let baseline = makeBaseline(<快照>, \'<表名>\')` 在 genItems 之前取自 items 所依據之那份快照, `makeRowStates(items)` 在 genItems 之後, 並存入 vo.baseline／vo.rowStates; 兩者皆 import  [spec P1]', function() {
        //perm-run01: 原 makeBaseline(<快照>, vo.$ds.<表>.keys) 改為 makeBaseline(<快照>, '<表名>')(第 2 參改表名字串)
        for (let v of VUES) {
            let txt = fs.readFileSync(fpOf(v.fn), 'utf8')
            assert.ok(txt.includes(`import { makeBaseline } from '../js/rowDigest.mjs'`), `${v.fn} 須 import makeBaseline`)
            assert.ok(txt.includes(`import { makeRowStates, getChangedIdx, buildRowsSend } from '../js/relDialogSend.mjs'`), `${v.fn} 須 import relDialogSend`)
            let s = methodBody(codeLines(fpOf(v.fn)), 'show')
            let iSnap = s.indexOf(`let ${v.snap} = cloneDeep(vo.${v.snap})`)
            let iBase = s.indexOf(`let baseline = makeBaseline(${v.snap}, '${v.snap}')`)
            let iGen = s.indexOf('vo.genItems(')
            let iStates = s.indexOf('let rowStates = makeRowStates(items)')
            let iSaveItems = s.indexOf('vo.items = items')
            assert.ok(iSnap >= 0 && iBase > iSnap && iGen > iBase, `${v.fn}.show: 基準須取自 genItems 所用之同一份快照且在 genItems 之前`)
            assert.ok(iStates > iGen && iStates < iSaveItems, `${v.fn}.show: makeRowStates(items) 須在 genItems 之後、切換操作之前(寫入 vo 之前)`)
            assert.ok(s.includes('vo.baseline = baseline') && s.includes('vo.rowStates = rowStates'), `${v.fn}.show: 須存入 vo.baseline／vo.rowStates`)
            assert.strictEqual(count(s, 'makeBaseline('), 1, `${v.fn}.show: 只在此處計算基準`)
            assert.ok(txt.includes('baseline: null,') && txt.includes('rowStates: null,'), `${v.fn} data 須宣告 baseline／rowStates`)
            //perm-run01 新增: 開框中無未存修改時 syncStore 經 rebuildDialog 以目前 store 重建, 其基準與狀態亦須在同一處由同一份快照產生(口徑同 show()), 且仍只有 show／rebuildDialog 兩處計算基準
            let rb = methodBody(codeLines(fpOf(v.fn)), 'rebuildDialog')
            let jSnap = rb.indexOf(`let ${v.snap} = cloneDeep(vo.${v.snap})`)
            let jBase = rb.indexOf(`let baseline = makeBaseline(${v.snap}, '${v.snap}')`)
            let jGen = rb.indexOf('vo.genItems(')
            let jStates = rb.indexOf('let rowStates = makeRowStates(items)')
            assert.ok(jSnap >= 0 && jBase > jSnap && jGen > jBase && jStates > jGen, `${v.fn}.rebuildDialog: 基準須取自 genItems 所用之同一份快照且在 genItems 之前, makeRowStates 在 genItems 之後`)
            assert.ok(rb.includes('vo.baseline = baseline') && rb.includes('vo.rowStates = rowStates') && rb.includes('vo.isModified = false'), `${v.fn}.rebuildDialog: 須存入 vo.baseline／vo.rowStates 並歸零 isModified`)
            assert.strictEqual(count(codeLines(fpOf(v.fn)).map((l) => l.text).join('\n'), 'makeBaseline('), 2, `${v.fn}: 只在 show／rebuildDialog 兩處計算基準(import 與註解不計)`)
        }
    })

    it('SITE-RB-002-doSave: 基準不於存檔當下重算(無 makeBaseline); 流程開頭(updateLoading(true) 與任何後續 await 之前)以區域變數持有 cloneDeep(vo.baseline)／vo.rowStates(防存檔中再次 show() 換成新草稿之值); 組裝整表經 buildRowsSend 並把基準傳 saveXxx; 不再以 map(rows…) 組送出之表; 有損與寫出兩處皆以 kpChanged 閘控  [spec P1／P2／P3]', function() {
        for (let v of VUES) {
            let d = methodBody(codeLines(fpOf(v.fn)), 'doSave')
            assert.ok(!d.includes('makeBaseline('), `${v.fn}.doSave 不得於存檔當下計算基準`)
            assert.strictEqual(count(d, 'vo.baseline'), 1, `${v.fn}.doSave 只在流程開頭讀一次 vo.baseline`)
            assert.strictEqual(count(d, 'vo.rowStates'), 1, `${v.fn}.doSave 只在流程開頭讀一次 vo.rowStates`)
            let iBase = d.indexOf('let baseline = cloneDeep(vo.baseline)')
            let iStates = d.indexOf('let rowStates = vo.rowStates')
            let iLoading = d.indexOf('updateLoading(true)')
            let iDelay = d.indexOf('await delay(')
            assert.ok(iBase >= 0 && iStates >= 0 && iBase < iLoading && iStates < iLoading && iBase < iDelay && iStates < iDelay, `${v.fn}.doSave 須於 updateLoading(true)／delay 之前取得基準與開框狀態`)
            let iChg = d.indexOf('let kpChanged = getChangedIdx(rows, rowStates)')
            assert.ok(iChg > d.indexOf('pairRowsToSnapshot(') && iChg < d.indexOf('let kpLossyIdx'), `${v.fn}.doSave 須於配對之後、有損檢查之前取得 kpChanged`)
            assert.strictEqual(count(d, 'getChangedIdx('), 1)
            assert.ok(count(d, 'kpChanged[kr] !== true') >= 2, `${v.fn}.doSave 有損檢查與寫出兩處皆須以 kpChanged 閘控`)
            let iNew = d.indexOf(`let ${v.send} = buildRowsSend(${v.snap}, pairs, ${v.newVar}, '${v.refKey}')`)
            let iPut = d.indexOf('putRefEntry(')
            let iSave = d.indexOf(`vo.${v.save}(${v.send}, baseline, subject)`) //perm-run02: 第 3 參 subject(主體摘要, 流程開頭取得並持有)
            assert.ok(iNew > iPut && iSave > iNew, `${v.fn}.doSave 須 putRefEntry → buildRowsSend(${v.snap}, pairs, ${v.newVar}, '${v.refKey}') → vo.${v.save}(${v.send}, baseline, subject)`)
            assert.ok(!new RegExp(`let ${v.send} = map\\(rows`).test(d), `${v.fn}.doSave 不得再以 map(rows…) 只送對話框之列(S4)`)
            assert.ok(d.includes(`${v.newVar}[kr] = JSON.stringify(`), `${v.fn}.doSave 新字串收入 ${v.newVar}[kr]`)
            assert.ok(!new RegExp(`\\b[ug]\\.${v.refKey} = `).test(d), `${v.fn}.doSave 不得就地改快照列(改由 buildRowsSend 產生新列)`)
            //relationRowsStale 仍在且早於 updateLoading(true)(不得放寬)
            assert.ok(d.indexOf('relationRowsStale') >= 0 && d.indexOf('relationRowsStale') < iLoading, `${v.fn}.doSave 之 relationRowsStale 拒存須保留且在寫入前`)
        }
    })

    it('SITE-RB-003-saveUsers／saveGrups: 以 `$fapi.<api>(rows, { baseline })` 送出, 基準取自參數(不讀 vo.baseline); 失敗路徑: catch 內先 updateLoading(false) 再 showCheckYes(非 success 型), 失敗回 false(對話框不關、儲存鈕可再按)  [spec: 失敗處置 saveStale 等沿用既有路徑]', function() {
        for (let v of VUES) {
            let b = methodBody(codeLines(fpOf(v.fn)), v.save)
            //perm-run01: 原 `$fapi.<api>(rows, { baseline })` 改為 `{ baseline, returnRows: true }`(存檔成功回傳寫入後之列並立即 commit 進 store, 規格第 8 節)
            //perm-run02(範圍一, R-SUBJECT-ID-01 規則 4): 再增第 3 參 subject(開框時之主體摘要; 伺服端於引用表鎖內新鮮讀取後強制驗證), 簽名改為 (rows, baseline, subject)
            assert.ok(b.includes(`vo.$fapi.${v.api}(rows, { baseline, returnRows: true, subject })`), `${v.fn}.${v.save} 須帶 { baseline, returnRows: true, subject }`)
            assert.ok(new RegExp(`^\\s*${v.save}: async function\\(rows, baseline, subject\\) \\{`).test(b), `${v.fn}.${v.save} 簽名須為 (rows, baseline, subject)`)
            assert.ok(!b.includes('vo.baseline'), `${v.fn}.${v.save} 不得讀 vo.baseline(存檔進行中 show() 會換掉)`)
            let iCatch = b.indexOf('.catch(async (err) => {')
            let iOff = b.indexOf('vo.$ui.updateLoading(false)', iCatch)
            let iShow = b.indexOf('vo.$dg.showCheckYes(', iCatch)
            assert.ok(iCatch >= 0 && iOff > iCatch && iShow > iOff, `${v.fn}.${v.save} 失敗路徑須先 updateLoading(false) 再 showCheckYes`)
            let failSeg = b.slice(iShow, b.indexOf('})', iShow) + 2)
            assert.ok(!/type:\s*'success'/.test(failSeg), `${v.fn}.${v.save} 失敗訊息不得為 success 型`)
            assert.ok(/if \(!okSave\) \{\s+return false/.test(b), `${v.fn}.${v.save} 失敗須回 false(doSave 據此不關閉對話框)`)
            assert.ok(/\$tErr\(err\)/.test(b), `${v.fn}.${v.save} 失敗訊息須以 $tErr 顯示語系文字(saveStale 等鍵)`)
        }
    })

    it('SITE-RB-004-伺服端四個失敗語系鍵(saveStale／saveBaselineRequired／saveExternalRowChanged／saveFromNotAllowed)皆有 eng／cht 文字(對話框之失敗路徑經 $tErr 顯示之)', function() {
        let lang = fs.readFileSync(path.join(projRoot, 'server', 'procLang.mjs'), 'utf8')
        for (let k of ['saveStale', 'saveBaselineRequired', 'saveExternalRowChanged', 'saveFromNotAllowed']) {
            assert.ok(new RegExp(`${k}: \\{\\s*\\n\\s*eng: \`[^\`]+\`,\\s*\\n\\s*cht: \`[^\`]+\`,`).test(lang), `${k} 須有 eng／cht`)
        }
        assert.ok(/saveStale: \{[^}]*重新整理/.test(lang), 'saveStale 之 cht 須提示重新整理頁面')
    })

})
