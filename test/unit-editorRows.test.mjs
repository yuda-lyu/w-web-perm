//編輯對話框之「引用清單(cgrups／cpemis) ↔ 對話框之列」轉換(src/js/editorRefRows.mjs)與存檔往返不變式(規則帳本 R-PRINCIPLE-00 c／d／e／f、R-AUTH-MERGE-00 第 5 條; run05 U1)
//
//背景: 伺服端 getUserRules 對 isActive 為 'y' 之引用一律參與合併——查無列(懸空)者以其 mode 參與、內容全 n; mode 缺或非法者視為 AND; 名稱 '' 照常比對.
//修前五個編輯對話框存檔時: 直接編輯器 VeCgrups／VeCpemis 之列只有「被引用表之全部列」且以 isestr(name) 略過 '', 懸空與空字串名稱之引用被丟棄;
//反向關聯對話框 VeGrupBlngUsers／VePemiBlngGrups 以列上經 fltKp* 篩過之 grups／pemis 重組字串, 同樣丟棄懸空引用; 物件形式之純量值 { "G1": "y" }(伺服端為啟用 AND)顯示為停用並寫成停用.
//丟棄或停用 AND 項即放寬授權(R-PRINCIPLE-00 原則 3: 不得靜默丟棄).
//
//本檔: ①純函數契約(ER-*、RV-*); ②往返不變式(RT-*): 以「與 .vue 膠合碼逐行對應之編輯器模型」(SITE-ER-* 靜態守護兩者一致), 對窮舉＋隨機之引用字串,
//  直接編輯器「開啟 → 不改值 → 存檔」後授權(getUserRules)與存檔前相等(有損者回原字串); 改一列者授權等於「只改該名稱」之參考構造(oracle);
//  反向關聯對話框之改寫(putRefEntry)授權等於 oracle(其餘引用項之效果不變), 本項未變更者字串逐字元不動; ③靜態站點(SITE-ER-*);
//  ④第三格放寬之證明(RT-LOSSY3-*、EX-LOSSY3-*; run06, ADR-035 Update 2026-10-22): 原 getKpLossy 第三格(該層啟用項皆 mode 缺／非法 → 拒存)改為可存; 依據為方案 A(未被管理者改動之限制項原樣寫回
//  其原始 mode, getRawModeMap／putRowsToKp／putRefEntry). 本組以真 getUserRules 窮舉＋隨機(固定種子)證明: 凡「該層啟用項皆 mode 缺／非法」之輸入(物件與陣列形式、單一／多個啟用項、混停用項／懸空引用／
//  名稱 ''／同名重複、含歷史同名表), 或「原層有合法項而管理者於同一次編輯停用之而使該層只剩限制項」者, 經直接編輯器與反向關聯對話框存檔後之授權: 未改動 → 等於存檔前; 有改動 → 等於同一編輯套用於
//  原資料(oracleEdits; 未被改動之項逐字保留, 限制項不被升格為合法 AND), 且不多於「對話框所示狀態」之伺服端解讀(所見之上界). 變異驗證(≥5 個自植缺陷須使本組變紅)見 run06 報告.
//跑法: node node_modules/mocha/bin/mocha.js test/unit-editorRows.test.mjs --timeout 300000
import assert from 'assert'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import JSON5 from 'json5'
import isEqual from 'lodash-es/isEqual.js'
import cvKpToObj from '../src/js/cvKpToObj.mjs'
import cvKpToArr from '../src/js/cvKpToArr.mjs'
import getKpLossy from '../src/js/getKpLossy.mjs'
import getOwn from '../src/js/getOwn.mjs'
import { getRefWarns } from '../src/js/getAuthWarn.mjs'
import { getRefState, getRefRowsExtra, getDupRowsInconsistent, getRawModeMap, putRowsToKp, putRefEntry, getRowIdxs } from '../src/js/editorRefRows.mjs'
import { getUserRules } from '../src/plugins/mShare.mjs'
import { sourceLines } from './tools/srcScan.mjs'

const projRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const HM = { hasMode: true }


// ===== 夾具: 標的、權限、群組表(含歷史同名、名稱 ''、無 name 欄與非字串名稱之列) =====

const TGT = [{ id: 'T1' }, { id: 'T2' }, { id: 'T3' }]
const ref = (n, mode = 'OR') => JSON.stringify({ [n]: { mode, isActive: 'y' } })
const P_BASE = [{ name: 'P1', crules: JSON.stringify({ T1: 'y', T2: 'y' }) }, { name: 'P2', crules: JSON.stringify({ T2: 'y', T3: 'y' }) }]
const G1 = { name: 'G1', cpemis: ref('P1') }
const G2 = { name: 'G2', cpemis: ref('P2') }

//群組層(cgrups): names 為引用名稱之窮舉軸(含懸空 GX 與 '')
const TABS_G = {
    A: { rows: [G1, G2], names: ['G1', 'G2', 'GX', ''] },
    B: { rows: [G1, G2, { name: 'G2', cpemis: ref('P1') }], names: ['G1', 'G2', 'GX', ''] }, //G2 歷史同名(d): 內容取交集 {T2}
    C: { rows: [G1, G2, { name: '', cpemis: JSON.stringify({ P1: { mode: 'OR', isActive: 'y' }, P2: { mode: 'OR', isActive: 'y' } }) }], names: ['G1', 'G2', 'GX', ''] }, //名稱 '' 之群組(f)
    D: { rows: [G1, { cpemis: ref('P2') }, { name: 5, cpemis: ref('P2') }], names: ['G1', '', '5', 'undefined'] }, //無 name 欄(findRefRows 視為 '')、非字串名稱 5(不與 '5' 相符)
}
//權限層(cpemis): 使用者經單一群組 GG(OR)取得該群組 cpemis 之結果
const TABS_P = {
    A: { rows: P_BASE, names: ['P1', 'P2', 'PX', ''] },
    B: { rows: [...P_BASE, { name: 'P2', crules: JSON.stringify({ T1: 'y', T3: 'y' }) }], names: ['P1', 'P2', 'PX', ''] },
    C: { rows: [...P_BASE, { name: '', crules: JSON.stringify({ T3: 'y' }) }], names: ['P1', 'P2', 'PX', ''] },
}

let cacheAuth = new Map()
let authG = (tabKey) => (c) => {
    let k = `G${tabKey}\u0000${c}`
    if (!cacheAuth.has(k)) {
        cacheAuth.set(k, getUserRules({ cgrups: c }, TABS_G[tabKey].rows, P_BASE, TGT).rules)
    }
    return cacheAuth.get(k)
}
let authP = (tabKey) => (c) => {
    let k = `P${tabKey}\u0000${c}`
    if (!cacheAuth.has(k)) {
        cacheAuth.set(k, getUserRules({ cgrups: ref('GG') }, [{ name: 'GG', cpemis: c }], TABS_P[tabKey].rows, TGT).rules)
    }
    return cacheAuth.get(k)
}
let yOf = (rules) => rules.filter((r) => r.isActive === 'y').map((r) => r.name).join(',')


// ===== 編輯器模型: 與 .vue 膠合碼逐行對應(SITE-ER-001／002 靜態守護) =====

//直接編輯器 VeCgrups.show／VeCpemis.show: 解碼(isestr 才解析; 失敗為空容器) → 表列(getOwn＋getRefState) ＋ 額外列(getRefRowsExtra); itemsInit 為開啟時之列內容
function editorOpen(c, tabRows) {
    let kp = Object.create(null)
    let lossy = []
    let rawModeMap = Object.create(null)
    if (typeof c === 'string' && c !== '') {
        try {
            let raw = JSON5.parse(c)
            kp = cvKpToObj(raw, HM)
            lossy = getKpLossy(raw)
            rawModeMap = getRawModeMap(raw)
        }
        catch (err) {}
    }
    let rows = tabRows.map((v) => ({ name: v.name, ...getRefState(getOwn(kp, v.name, null)) }))
    rows = [...rows, ...getRefRowsExtra(kp, tabRows)]
    let init = rows.map((r) => ({ name: r.name, mode: r.mode, enable: r.enable }))
    return { rows, init, lossy, rawModeMap }
}

//直接編輯器 doSave: 有損 → 未變更回原字串、有變更拒存; 同名多列不一致拒存; 其餘 putRowsToKp(含 rawModeMap: 未改之限制項寫回原始 mode)寫出. 拒存回 false
function editorSave(c, st) {
    let cur = st.rows.map((r) => ({ name: r.name, mode: r.mode, enable: r.enable }))
    if (st.lossy.length > 0) {
        return isEqual(cur, st.init) ? c : false
    }
    if (getDupRowsInconsistent(st.rows).length > 0) {
        return false
    }
    return JSON.stringify(putRowsToKp(Object.create(null), st.rows, st.rawModeMap))
}

//直接編輯器之單列切換(showVeCgrupsToggleItem*ByName): 精確同名之全部列(getRowIdxs)一併套用
function editorToggle(st, name, enable, mode) {
    for (let k of getRowIdxs(st.rows, 'name', name)) {
        st.rows[k] = { ...st.rows[k], enable, mode }
    }
}

//直接編輯器之批次操作(showVeCgrupsToggleItemsEnableAll*): 對每個顯示中之列(此處為全部列), 其精確同名之全部列一併套用 enable
function editorBatch(st, fnEnable) {
    let disp = st.rows.map((r) => ({ name: r.name, enable: r.enable }))
    for (let d of disp) {
        for (let k of getRowIdxs(st.rows, 'name', d.name)) {
            st.rows[k] = { ...st.rows[k], enable: fnEnable(d.enable) }
        }
    }
}

//反向關聯對話框 doSave 之一列: 有損(getKpLossy 非空)者不經改寫(由 kpLossyIdx／authLossyBlocked 處置, 回 null); 其餘解碼(失敗為空容器) → putRefEntry(含該列快照之 rawModeMap) → 變更才改寫字串
function relSave(c, name, enable, mode) {
    let raw
    let rawModeMap
    try {
        raw = JSON5.parse(c)
        rawModeMap = getRawModeMap(raw)
    }
    catch (err) {}
    if (raw !== undefined && getKpLossy(raw).length > 0) {
        return null
    }
    let kp = Object.create(null)
    try {
        kp = cvKpToObj(JSON5.parse(c), HM)
    }
    catch (err) {}
    let out = Object.create(null)
    return putRefEntry(out, kp, name, enable, mode, rawModeMap) ? JSON.stringify(out) : c
}

//參考構造(oracle, 不經編輯器任何函數): 原字串之元素(cvKpToArr, 伺服端同一解碼)去掉名稱為 name 者, 歸屬時再加一個 { name, mode, isActive: 'y' }, 以陣列形式寫出
function oracle(c, name, enable, mode) {
    let raw
    try {
        raw = JSON5.parse(c)
    }
    catch (err) {}
    let arr = cvKpToArr(raw).filter((e) => e.name !== name)
    if (enable === 'y') {
        arr.push({ name, mode, isActive: 'y' })
    }
    return JSON.stringify(arr)
}

//伺服端解碼(cvKpToArr; 解析失敗為空)
function decodeArr(c) {
    let raw
    try {
        raw = JSON5.parse(c)
    }
    catch (err) {}
    return cvKpToArr(raw)
}

//參考構造(多列版, 不經編輯器任何函數): 同 oracle, 但一次套用多個名稱之編輯 edits [{ name, enable, mode }]: 原元素(cvKpToArr)去掉名稱為被編輯者, 被編輯而歸屬者再各加一個 { name, mode, isActive: 'y' };
//未被編輯之元素(含 mode 缺／非法之限制項)逐字保留——此即「凡未被管理者改動之項目不得放寬」之判準(限制項不被升格為可當基底之合法 AND). 以陣列形式寫出
function oracleEditsArr(arr0, edits) {
    let names = new Set(edits.map((e) => e.name))
    let arr = arr0.filter((e) => !names.has(e.name))
    for (let e of edits) {
        if (e.enable === 'y') {
            arr.push({ name: e.name, mode: e.mode, isActive: 'y' })
        }
    }
    return JSON.stringify(arr)
}

//對話框所示狀態(開啟時之列狀態; 與 editorOpen 之表列同: 解碼 → getRefState)
function shownOf(c, name) {
    let kp = Object.create(null)
    try {
        kp = cvKpToObj(JSON5.parse(c), HM)
    }
    catch (err) {}
    return getRefState(getOwn(kp, name, null))
}

//該名稱之啟用元素(伺服端解碼)皆 mode 缺／非法 ＝ 限制項(獨立於 getRawModeMap 之寫法)
function isLimName(c, name) {
    let act = decodeArr(c).filter((e) => e.name === name && e.isActive === 'y')
    return act.length > 0 && act.every((e) => e.mode !== 'OR' && e.mode !== 'AND')
}

//輸入字串所屬類別(獨立於 getKpLossy; 只看伺服端解碼之啟用元素): unnamed＝有啟用而名稱非字串者(第二格, 仍有損); both＝同名啟用元素之有效模式同時為 OR 與 AND(第一格, 仍有損);
//allLim＝有啟用元素、其 mode 皆缺／非法(原第三格, 已放寬); mixed＝同時有合法與缺／非法; valid＝皆合法; none＝無啟用元素
function classOf(c) {
    let act = decodeArr(c).filter((e) => e.isActive === 'y')
    if (act.some((e) => typeof e.name !== 'string')) {
        return 'unnamed'
    }
    let kpEff = Object.create(null)
    for (let e of act) {
        kpEff[e.name] = (kpEff[e.name] || new Set()).add(e.mode === 'OR' ? 'OR' : 'AND')
    }
    if (Object.values(kpEff).some((s) => s.size > 1)) {
        return 'both'
    }
    let nValid = act.filter((e) => e.mode === 'OR' || e.mode === 'AND').length
    if (act.length === 0) {
        return 'none'
    }
    return nValid === 0 ? 'allLim' : (nValid === act.length ? 'valid' : 'mixed')
}

//授權 a 為 y 之標的是否有不在 b 為 y 者(a 比 b 多給)
let moreY = (a, b) => a.some((r, k) => r.isActive === 'y' && b[k].isActive !== 'y')


// ===== 引用字串之產生 =====

//物件形式每個名稱之值(undefined＝不列): 啟用 OR／AND／缺 mode／'or'、停用 OR／AND、純量 'y'／'n'
const OBJ_VALS = [undefined, { mode: 'OR', isActive: 'y' }, { mode: 'AND', isActive: 'y' }, { isActive: 'y' }, { mode: 'or', isActive: 'y' }, { mode: 'OR', isActive: 'n' }, { mode: 'AND', isActive: 'n' }, 'y', 'n']
//陣列形式元素之 mode／isActive 軸; 名稱軸另加非字串 7 與無 name(皆為 noName, 有損)
const ARR_MODES = ['OR', 'AND', undefined, 'or']
const ARR_ACTS = ['y', 'n']
//特殊字串: 空字串(新增列之預設)、壞 JSON、非物件 JSON
const SPECIAL = ['', '{oops', '5', 'null', '[]', '{}', '"str"']

function genObjForm(names, vals = OBJ_VALS) {
    let out = []
    let n = names.length
    let total = vals.length ** n
    for (let i = 0; i < total; i++) {
        let o = {}
        let x = i
        for (let k = 0; k < n; k++) {
            let v = vals[x % vals.length]
            x = Math.floor(x / vals.length)
            if (v !== undefined) {
                o[names[k]] = v
            }
        }
        out.push(JSON.stringify(o))
    }
    return out
}

function arrPool(names) {
    let pool = []
    for (let nm of [...names, 7, undefined]) {
        for (let m of ARR_MODES) {
            for (let a of ARR_ACTS) {
                let e = {}
                if (nm !== undefined) {
                    e.name = nm
                }
                if (m !== undefined) {
                    e.mode = m
                }
                e.isActive = a
                pool.push(e)
            }
        }
    }
    return pool
}

function genArrForm(names) {
    let pool = arrPool(names)
    let out = ['[]']
    for (let a of pool) {
        out.push(JSON.stringify([a]))
        for (let b of pool) {
            out.push(JSON.stringify([a, b]))
        }
    }
    return out
}

//可重現之亂數(mulberry32)
function rng(seed) {
    let s = seed >>> 0
    return () => {
        s = (s + 0x6D2B79F5) >>> 0
        let t = s
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

function genRandom(names, n, seed) {
    let r = rng(seed)
    let pick = (a) => a[Math.floor(r() * a.length)]
    let pool = arrPool(names)
    let out = []
    for (let i = 0; i < n; i++) {
        if (r() < 0.5) {
            let len = 3 + Math.floor(r() * 3)
            let arr = []
            for (let k = 0; k < len; k++) {
                arr.push(r() < 0.1 ? pick(['y', 'n', 1, null]) : pick(pool)) //少數非物件元素(名稱為索引數字, noName)
            }
            out.push(JSON.stringify(arr))
        }
        else {
            let o = {}
            for (let nm of names) {
                let v = pick(OBJ_VALS)
                if (v !== undefined) {
                    o[nm] = (r() < 0.15 && typeof v === 'object') ? { ...v, extra: 'x', name: pick(names) } : v //值內多餘欄位與值內 name(外層鍵為名, R-AUTH-PATH-01)
                }
            }
            out.push(JSON.stringify(o))
        }
    }
    return out
}

function spaceOf(names, seed) {
    return [...SPECIAL, ...genObjForm(names), ...genArrForm(names), ...genRandom(names, 1500, seed)]
}


describe('unit-editorRows (編輯對話框之引用清單 ↔ 列, 存檔不丟棄啟用中之引用; R-PRINCIPLE-00 c／d／e／f)', function() {
    this.timeout(300000)


    // ===== 純函數契約 =====

    it('ER-001-getRefState: 與伺服端同解讀——啟用者 mode 取有效值(缺／\'or\'／數字 → AND); 純量 \'y\' 為啟用 AND; 停用者 mode 合法沿用、否則 OR; 無引用為停用 OR', function() {
        assert.deepStrictEqual(getRefState({ mode: 'OR', isActive: 'y' }), { mode: 'OR', enable: 'y' })
        assert.deepStrictEqual(getRefState({ mode: 'AND', isActive: 'y' }), { mode: 'AND', enable: 'y' })
        assert.deepStrictEqual(getRefState({ isActive: 'y' }), { mode: 'AND', enable: 'y' })
        assert.deepStrictEqual(getRefState({ mode: 'or', isActive: 'y' }), { mode: 'AND', enable: 'y' })
        assert.deepStrictEqual(getRefState({ mode: 1, isActive: 'y' }), { mode: 'AND', enable: 'y' })
        assert.deepStrictEqual(getRefState('y'), { mode: 'AND', enable: 'y' }, '物件形式純量值 { "G": "y" }: 伺服端 cvKpToArr 解為 { isActive: "y" }(無 mode → AND)')
        assert.deepStrictEqual(getRefState('n'), { mode: 'OR', enable: 'n' })
        assert.deepStrictEqual(getRefState({ mode: 'AND', isActive: 'n' }), { mode: 'AND', enable: 'n' })
        assert.deepStrictEqual(getRefState({ mode: 'xx', isActive: 'n' }), { mode: 'OR', enable: 'n' })
        assert.deepStrictEqual(getRefState(null), { mode: 'OR', enable: 'n' })
        assert.deepStrictEqual(getRefState(undefined), { mode: 'OR', enable: 'n' })
        assert.deepStrictEqual(getRefState(['y']), { mode: 'OR', enable: 'n' }, '陣列值: 伺服端 isActive 為該陣列(非 y)')
        assert.deepStrictEqual(getRefState({}), { mode: 'OR', enable: 'n' })
        //與伺服端逐值一致: 單一引用之使用者授權 = 以 getRefState 之結果重寫後之授權
        for (let v of OBJ_VALS.filter((x) => x !== undefined)) {
            let c = JSON.stringify({ G1: v })
            let st = getRefState(getOwn(cvKpToObj(JSON5.parse(c), HM), 'G1', null))
            let c2 = JSON.stringify(st.enable === 'y' ? { G1: { mode: st.mode, isActive: 'y' } } : {})
            for (let mode2 of ['OR', 'AND']) {
                let withOther = (s) => JSON.stringify({ ...JSON.parse(s), G2: { mode: mode2, isActive: 'y' } })
                assert.deepStrictEqual(authG('A')(withOther(c2)), authG('A')(withOther(c)), `值 ${JSON.stringify(v)} 搭配 G2 ${mode2}`)
            }
        }
    })

    it('ER-002-getRefRowsExtra: 啟用中而表列(name 為字串且 ===)未顯示之引用各一列(懸空、名稱 \'\'、純量 \'y\'); 停用者、已顯示者不產生; 順序為解碼鍵序; 非物件輸入回空', function() {
        let kp = cvKpToObj(JSON5.parse('{"G1":{"mode":"OR","isActive":"y"},"GX":{"mode":"AND","isActive":"y"},"":{"mode":"or","isActive":"y"},"GN":{"mode":"AND","isActive":"n"},"GS":"y"}'), HM)
        assert.deepStrictEqual(getRefRowsExtra(kp, [G1, G2]), [
            { name: 'GX', mode: 'AND', enable: 'y', dangling: true },
            { name: '', mode: 'AND', enable: 'y', dangling: true },
            { name: 'GS', mode: 'AND', enable: 'y', dangling: true },
        ])
        assert.deepStrictEqual(getRefRowsExtra(kp, [G1, G2, { name: '' }, { name: 'GX' }, { name: 'GS' }]), [], '皆已由表列顯示')
        //無 name 欄之表列(findRefRows 視為 '')不以字串名稱寫出, 引用 '' 仍須額外列; 非字串名稱 5 之表列同理(引用 '5')
        let kp2 = cvKpToObj(JSON5.parse('{"":{"mode":"AND","isActive":"y"},"5":{"mode":"OR","isActive":"y"}}'), HM)
        assert.deepStrictEqual(getRefRowsExtra(kp2, [{ cpemis: '' }, { name: 5 }]).map((r) => r.name), ['5', ''])
        for (let bad of [null, undefined, 5, 'abc', ['G1']]) {
            assert.deepStrictEqual(getRefRowsExtra(bad, [G1]), [])
        }
        //原型鍵名為一般鍵(R-KEY-01)
        let kp3 = cvKpToObj(JSON5.parse('[{"name":"__proto__","mode":"AND","isActive":"y"},{"name":"constructor","mode":"OR","isActive":"y"}]'), HM)
        assert.deepStrictEqual(getRefRowsExtra(kp3, [G1]).map((r) => r.name), ['__proto__', 'constructor'])
        assert.deepStrictEqual(getRefRowsExtra(kp3, [{ name: 'constructor' }]).map((r) => r.name), ['__proto__'])
    })

    it('ER-003-getDupRowsInconsistent: 同名多列之 (mode, enable) 不全相同者回其名稱(不重複、首次出現序); 全相同、不同名、非字串名稱不計', function() {
        assert.deepStrictEqual(getDupRowsInconsistent([{ name: 'A', mode: 'OR', enable: 'y' }, { name: 'A', mode: 'OR', enable: 'y' }, { name: 'B', mode: 'OR', enable: 'n' }]), [])
        assert.deepStrictEqual(getDupRowsInconsistent([{ name: 'A', mode: 'OR', enable: 'y' }, { name: 'B', mode: 'OR', enable: 'n' }, { name: 'A', mode: 'OR', enable: 'n' }, { name: 'B', mode: 'AND', enable: 'n' }, { name: 'A', mode: 'AND', enable: 'y' }]), ['A', 'B'])
        assert.deepStrictEqual(getDupRowsInconsistent([{ name: '', mode: 'OR', enable: 'y' }, { name: '', mode: 'AND', enable: 'y' }]), [''])
        assert.deepStrictEqual(getDupRowsInconsistent([{ name: 5, mode: 'OR', enable: 'y' }, { name: 5, mode: 'OR', enable: 'n' }, null, 'x']), [])
        assert.deepStrictEqual(getDupRowsInconsistent([{ name: '__proto__', mode: 'OR', enable: 'y' }, { name: '__proto__', mode: 'OR', enable: 'n' }]), ['__proto__'])
    })

    it('ER-004-putRowsToKp: 名稱為字串者(含 \'\'、__proto__)寫出 { mode, isActive }; 名稱非字串、mode 非 OR／AND、enable 非非空字串者略過; 寫入呼叫端之無原型容器並回傳之', function() {
        let kp = Object.create(null)
        let r = putRowsToKp(kp, [
            { name: 'G1', mode: 'OR', enable: 'y' },
            { name: '', mode: 'AND', enable: 'y' },
            { name: '__proto__', mode: 'AND', enable: 'n' },
            { name: 5, mode: 'OR', enable: 'y' },
            { name: undefined, mode: 'OR', enable: 'y' },
            { name: 'Gm', mode: 'or', enable: 'y' },
            { name: 'Ge', mode: 'OR', enable: '' },
            null,
        ])
        assert.strictEqual(r, kp)
        assert.strictEqual(Object.getPrototypeOf(kp), null)
        //以字串比對(物件字面值之 '__proto__' 會設原型而非建鍵, 不可作期望值)
        assert.strictEqual(JSON.stringify(kp), '{"G1":{"mode":"OR","isActive":"y"},"":{"mode":"AND","isActive":"y"},"__proto__":{"mode":"AND","isActive":"n"}}')
        assert.ok(Object.prototype.hasOwnProperty.call(kp, '__proto__'), '__proto__ 為自有鍵, JSON.stringify 寫出')
    })

    it('RV-001-putRefEntry: 只改名稱為 name 之一項; 其餘(懸空、\'\'、停用、純量、值內多餘欄位)原樣複製; 目標狀態與現值相同回 false 且不寫入 kpOut; mode 非 OR 者寫 AND', function() {
        let c0 = '{"G1":{"mode":"OR","isActive":"y"},"GX":{"mode":"AND","isActive":"y"},"":{"mode":"AND","isActive":"y"},"GN":{"mode":"OR","isActive":"n"},"GS":"y","GE":{"mode":"OR","isActive":"y","extra":1}}'
        let kp = cvKpToObj(JSON5.parse(c0), HM)
        let rm = getRawModeMap(JSON5.parse(c0)) //GS(純量 y, 無 mode)為限制項
        let out = Object.create(null)
        assert.strictEqual(putRefEntry(out, kp, 'G1', 'y', 'OR'), false, '已是 OR 啟用')
        assert.deepStrictEqual(Object.keys(out), [])
        assert.strictEqual(putRefEntry(Object.create(null), kp, 'G9', 'n', 'OR'), false, '不存在且目標為不歸屬')
        assert.strictEqual(putRefEntry(Object.create(null), kp, 'GN', 'n', 'AND'), false, '停用且目標為不歸屬(mode 無關)')
        assert.strictEqual(putRefEntry(Object.create(null), kp, 'GS', 'y', 'AND'), false, '純量 y 即啟用 AND')
        let o1 = Object.create(null)
        assert.strictEqual(putRefEntry(o1, kp, 'G1', 'y', 'AND', rm), true)
        assert.deepStrictEqual(JSON.parse(JSON.stringify(o1)), { G1: { mode: 'AND', isActive: 'y' }, GX: { mode: 'AND', isActive: 'y' }, '': { mode: 'AND', isActive: 'y' }, GN: { mode: 'OR', isActive: 'n' }, GS: { isActive: 'y' }, GE: { mode: 'OR', isActive: 'y', extra: 1 } }, '限制項 GS 寫回原始 mode(缺)')
        let o1b = Object.create(null)
        assert.strictEqual(putRefEntry(o1b, kp, 'G1', 'y', 'AND'), true)
        assert.deepStrictEqual(o1b.GS, kp.GS, '未給 rawModeMap: 照解碼值複製(現行行為)')
        let o2 = Object.create(null)
        assert.strictEqual(putRefEntry(o2, kp, 'G1', 'n', 'OR'), true)
        assert.deepStrictEqual(Object.keys(o2), ['GX', '', 'GN', 'GS', 'GE'], '不歸屬: 移除該項, 其餘保留')
        let o3 = Object.create(null)
        assert.strictEqual(putRefEntry(o3, kp, 'G9', 'y', 'xx'), true)
        assert.deepStrictEqual(o3.G9, { mode: 'AND', isActive: 'y' }, 'mode 非 OR → AND(收嚴)')
        let o4 = Object.create(null)
        assert.strictEqual(putRefEntry(o4, kp, '', 'n', 'OR'), true, '名稱 \'\' 亦可改')
        assert.ok(!('' in o4) && 'GX' in o4)
        for (let bad of [null, undefined, 5, 'abc']) {
            let o = Object.create(null)
            assert.strictEqual(putRefEntry(o, bad, 'G1', 'y', 'OR'), true)
            assert.deepStrictEqual(JSON.parse(JSON.stringify(o)), { G1: { mode: 'OR', isActive: 'y' } })
        }
        let o5 = Object.create(null)
        assert.strictEqual(putRefEntry(o5, kp, '__proto__', 'y', 'OR'), true)
        assert.ok(Object.prototype.hasOwnProperty.call(o5, '__proto__') && Object.getPrototypeOf(o5) === null, '原型鍵名為自有鍵(R-KEY-01)')
    })


    it('ER-005-getRawModeMap: 啟用且名稱為字串而 mode 缺／非法(\'or\'、數字、null、純量 y)者記原始 mode; 同名另有合法 mode 之啟用元素者不記; 停用、非字串名稱、非物件輸入不記', function() {
        let m = getRawModeMap(JSON5.parse('{"A":{"isActive":"y"},"B":{"mode":"or","isActive":"y"},"C":{"mode":1,"isActive":"y"},"D":{"mode":null,"isActive":"y"},"E":"y","F":{"mode":"AND","isActive":"y"},"G":{"isActive":"n"},"H":"n"}'))
        assert.deepStrictEqual(Object.keys(m), ['A', 'B', 'C', 'D', 'E'])
        assert.deepStrictEqual([m.A.mode, m.B.mode, m.C.mode, m.D.mode, m.E.mode], [undefined, 'or', 1, null, undefined])
        assert.strictEqual(Object.getPrototypeOf(m), null)
        let a = getRawModeMap([{ name: 'A', isActive: 'y' }, { name: 'A', mode: 'AND', isActive: 'y' }, { name: 'B', mode: 'XOR', isActive: 'y' }, { name: 'B', mode: 'or', isActive: 'y' }, { mode: 'or', isActive: 'y' }, { name: 5, isActive: 'y' }, { name: 'C', isActive: 'n' }, 'y'])
        assert.deepStrictEqual(Object.keys(a), ['B'], 'A 另有合法 AND 之啟用元素(伺服端結果同 AND), 不記')
        assert.strictEqual(a.B.mode, 'XOR')
        for (let bad of [null, undefined, 5, 'abc', []]) {
            assert.deepStrictEqual(Object.keys(getRawModeMap(bad)), [])
        }
        let p = getRawModeMap(JSON5.parse('[{"name":"__proto__","isActive":"y"},{"name":"","mode":"or","isActive":"y"}]'))
        assert.deepStrictEqual(Object.keys(p), ['__proto__', ''])
    })

    it('ER-006-putRowsToKp(含 rawModeMap): 限制項之列仍為「AND、啟用」(開啟時之狀態)者寫回原始 mode(缺則不寫 mode 鍵); 管理者改為 OR 或停用者照列寫出; 不在 map 者照列; 未給 map 為現行行為', function() {
        let rm = getRawModeMap(JSON5.parse('{"A":{"isActive":"y"},"B":{"mode":"or","isActive":"y"},"C":{"mode":null,"isActive":"y"},"D":"y"}'))
        let rows = [
            { name: 'A', mode: 'AND', enable: 'y' },
            { name: 'B', mode: 'AND', enable: 'y' },
            { name: 'C', mode: 'OR', enable: 'y' },
            { name: 'D', mode: 'AND', enable: 'n' },
            { name: 'X', mode: 'AND', enable: 'y' },
        ]
        assert.strictEqual(JSON.stringify(putRowsToKp(Object.create(null), rows, rm)), '{"A":{"isActive":"y"},"B":{"mode":"or","isActive":"y"},"C":{"mode":"OR","isActive":"y"},"D":{"mode":"AND","isActive":"n"},"X":{"mode":"AND","isActive":"y"}}')
        assert.strictEqual(JSON.stringify(putRowsToKp(Object.create(null), [{ name: 'C', mode: 'AND', enable: 'y' }], rm)), '{"C":{"mode":null,"isActive":"y"}}', 'null 原值照寫')
        assert.strictEqual(JSON.stringify(putRowsToKp(Object.create(null), rows.slice(0, 2))), '{"A":{"mode":"AND","isActive":"y"},"B":{"mode":"AND","isActive":"y"}}', '未給 map: 照列寫出')
    })

    it('RV-002-putRefEntry(含 rawModeMap): 複製其餘項時啟用中之限制項寫回原始 mode(停用者原樣); 本項照目標寫出(管理者改過則不還原); 本項為限制項而目標同顯示狀態(AND、啟用)→ 未變更', function() {
        let c = '{"G1":{"isActive":"y","extra":1},"G2":{"mode":"AND","isActive":"y"},"G3":{"mode":"or","isActive":"n"}}'
        let kp = cvKpToObj(JSON5.parse(c), HM)
        let rm = getRawModeMap(JSON5.parse(c))
        let o = Object.create(null)
        assert.strictEqual(putRefEntry(o, kp, 'G2', 'n', 'OR', rm), true)
        assert.strictEqual(JSON.stringify(o), '{"G1":{"isActive":"y","extra":1},"G3":{"mode":"or","isActive":"n"}}')
        assert.strictEqual(yOf(authG('A')(JSON.stringify(o))), '', '取消唯一合法項 G2 後: 限制項 G1 不當基底 → 全 n')
        assert.deepStrictEqual(authG('A')(JSON.stringify(o)), authG('A')(oracle(c, 'G2', 'n', 'OR')))
        let oNo = Object.create(null)
        putRefEntry(oNo, kp, 'G2', 'n', 'OR')
        assert.strictEqual(yOf(authG('A')(JSON.stringify(oNo))), 'T1,T2', '未給 map(修前): G1 被寫成合法 AND 而成為基底, 多給 T1,T2')
        assert.strictEqual(putRefEntry(Object.create(null), kp, 'G1', 'y', 'AND', rm), false, '限制項之顯示狀態即 AND、啟用: 未變更')
        let o2 = Object.create(null)
        assert.strictEqual(putRefEntry(o2, kp, 'G1', 'y', 'OR', rm), true)
        assert.deepStrictEqual(o2.G1, { mode: 'OR', isActive: 'y' }, '管理者改為 OR: 照選擇寫出')
    })

    it('ER-007-getRowIdxs: row[key] 精確 === 之全部索引(undefined 不等於 \'\'、5 不等於 \'5\'); 非物件列略過', function() {
        let rows = [{ name: 'A' }, { cpemis: '' }, { name: 'A' }, { name: '' }, { name: 'A' }, { name: 5 }, null, { id: 'g1', name: 'X' }, { id: 'g2', name: 'X' }]
        assert.deepStrictEqual(getRowIdxs(rows, 'name', 'A'), [0, 2, 4])
        assert.deepStrictEqual(getRowIdxs(rows, 'name', ''), [3], '名稱 \'\' 不命中無 name 欄之列')
        assert.deepStrictEqual(getRowIdxs(rows, 'name', '5'), [])
        assert.deepStrictEqual(getRowIdxs(rows, 'name', 5), [5])
        assert.deepStrictEqual(getRowIdxs(rows, 'id', 'g2'), [8])
        assert.deepStrictEqual(getRowIdxs('x', 'name', 'A'), [])
    })


    // ===== 具體例(使用者可讀) =====

    it('EX-005-直接編輯器(主責回報之例): { G1: 缺 mode, G2: AND } 停用唯一合法項 G2 後存檔 → 全 n(＝只改 G2); 修前 G1 被寫成合法 AND 而授予 T1,T2', function() {
        let c = '{"G1":{"isActive":"y"},"G2":{"mode":"AND","isActive":"y"}}'
        let st = editorOpen(c, TABS_G.A.rows)
        assert.deepStrictEqual(st.rows.find((r) => r.name === 'G1'), { name: 'G1', mode: 'AND', enable: 'y' }, '限制項顯示為 AND、啟用')
        editorToggle(st, 'G2', 'n', 'AND')
        let s = editorSave(c, st)
        assert.deepStrictEqual(JSON.parse(s).G1, { isActive: 'y' }, 'G1 寫回原始(缺 mode)')
        assert.strictEqual(yOf(authG('A')(s)), '')
        assert.deepStrictEqual(authG('A')(s), authG('A')(oracle(c, 'G2', 'n', 'AND')))
        let sNo = JSON.stringify(putRowsToKp(Object.create(null), st.rows))
        assert.strictEqual(yOf(authG('A')(sNo)), 'T1,T2', '未給 rawModeMap(修前)多給')
        //管理者把 G1 改為 OR: 照選擇寫出 OR(明確操作)
        editorToggle(st, 'G1', 'y', 'OR')
        assert.deepStrictEqual(JSON.parse(editorSave(c, st)).G1, { mode: 'OR', isActive: 'y' })
    })

    it('EX-006-直接編輯器: 三筆同名列「全部停用」→ 三列皆 n 且存檔成功; 名稱 \'\' 之額外列切換只影響額外列(不命中無 name 欄之表列)', function() {
        let tab = [G1, G2, { name: 'G2', cpemis: ref('P1') }, { name: 'G2', cpemis: ref('P2', 'AND') }]
        let c = '{"G1":{"mode":"OR","isActive":"y"},"G2":{"mode":"OR","isActive":"y"}}'
        let st = editorOpen(c, tab)
        editorBatch(st, () => 'n')
        assert.deepStrictEqual(st.rows.filter((r) => r.name === 'G2').map((r) => r.enable), ['n', 'n', 'n'])
        assert.deepStrictEqual(getDupRowsInconsistent(st.rows), [])
        let s = editorSave(c, st)
        assert.notStrictEqual(s, false)
        assert.deepStrictEqual(JSON.parse(s), { G1: { mode: 'OR', isActive: 'n' }, G2: { mode: 'OR', isActive: 'n' } })
        let st2 = editorOpen(c, tab)
        editorBatch(st2, (e) => (e === 'y' ? 'n' : 'y')) //全反選: 同名列一致, 各顯示列算出之反向值相同
        assert.deepStrictEqual(st2.rows.map((r) => r.enable), ['n', 'n', 'n', 'n'])
        //名稱 '' 之額外列(表 D 有無 name 欄之列, 該列以 getOwn(kp, undefined) 顯示鍵 'undefined')
        let c3 = '{"":{"mode":"AND","isActive":"y"},"undefined":{"mode":"OR","isActive":"y"},"G1":{"mode":"OR","isActive":"y"}}' //無 name 欄之表列顯示為啟用(鍵 'undefined'), 誤命中即可觀察
        let st3 = editorOpen(c3, TABS_G.D.rows)
        let before = st3.rows.map((r) => `${r.name}:${r.enable}`)
        editorToggle(st3, '', 'n', 'AND')
        let after = st3.rows.map((r) => `${r.name}:${r.enable}`)
        assert.deepStrictEqual(after.filter((v, k) => v !== before[k]), [':n'], '只有額外列 \'\' 被改')
        assert.deepStrictEqual(authG('D')(editorSave(c3, st3)), authG('D')(oracle(c3, '', 'n', 'AND')))
    })

    it('EX-007-反向關聯對話框(VePemiBlngGrups): 群組表歷史同名(g1／g2 皆名 G、cpemis 不同), 以 id 操作第二列只改第二列(修前以 name 改到第一列, 存檔依 id 寫入錯列)', function() {
        let snap = [{ id: 'g1', name: 'G', cpemis: '{"P1":{"mode":"OR","isActive":"y"}}' }, { id: 'g2', name: 'G', cpemis: '{"P1":{"mode":"OR","isActive":"y"},"P2":{"mode":"AND","isActive":"y"}}' }]
        let rows = snap.map((g) => ({ id: g.id, name: g.name, enable: 'y', mode: 'OR' })) //本權限 P1 之歸屬列
        let findBy = (id, name) => rows.findIndex((v) => (typeof id === 'string' && id !== '' ? v.id === id : v.name === name)) //同 .vue: 有 id 以 id 找列
        rows[findBy('g2', 'G')].enable = 'n'
        assert.deepStrictEqual(rows.map((r) => r.enable), ['y', 'n'], '以 id: 只改第二列')
        assert.strictEqual(findBy(undefined, 'G'), 0, '修前以 name: 命中第一列')
        let out = rows.map((r, k) => relSave(snap[k].cpemis, 'P1', r.enable, r.mode))
        assert.strictEqual(out[0], snap[0].cpemis, 'g1 未變更: 字串不動')
        assert.deepStrictEqual(JSON.parse(out[1]), { P2: { mode: 'AND', isActive: 'y' } }, 'g2 只移除 P1')
    })

    it('EX-001-直接編輯器: 懸空 AND(群組 GX 已刪)以額外列保留, 未改值存檔後授權仍為空(修前存檔得 G1 之授權 T1,T2 即放寬)', function() {
        let c = '{"G1":{"mode":"OR","isActive":"y"},"GX":{"mode":"AND","isActive":"y"}}'
        let st = editorOpen(c, TABS_G.A.rows)
        assert.deepStrictEqual(st.rows.map((r) => `${r.name}:${r.mode}:${r.enable}${r.dangling ? ':dangling' : ''}`), ['G1:OR:y', 'G2:OR:n', 'GX:AND:y:dangling'])
        let s = editorSave(c, st)
        assert.deepStrictEqual(JSON.parse(s).GX, { mode: 'AND', isActive: 'y' })
        assert.strictEqual(yOf(authG('A')(c)), '')
        assert.strictEqual(yOf(authG('A')(s)), '', '存檔後仍為空(不得放寬)')
        //管理者把懸空列改為停用以解除 → 得 G1 之授權(使用者明確操作)
        editorToggle(st, 'GX', 'n', 'AND')
        assert.strictEqual(yOf(authG('A')(editorSave(c, st))), 'T1,T2')
    })

    it('EX-002-直接編輯器: 名稱 \'\' 之啟用引用原樣保留(懸空或對到名稱 \'\' 之群組); 純量 { "G2": "y" } 顯示為啟用 AND, 未改則寫回限制項(無 mode); 陣列形式 mode 缺同', function() {
        let c = '{"G1":{"mode":"OR","isActive":"y"},"":{"mode":"AND","isActive":"y"},"G2":"y"}'
        for (let tab of ['A', 'C']) {
            let st = editorOpen(c, TABS_G[tab].rows)
            assert.deepStrictEqual(st.rows.find((r) => r.name === 'G2'), { name: 'G2', mode: 'AND', enable: 'y' }, tab)
            let s = editorSave(c, st)
            assert.deepStrictEqual(JSON.parse(s)[''], { mode: 'AND', isActive: 'y' }, tab)
            assert.deepStrictEqual(JSON.parse(s).G2, { isActive: 'y' }, tab)
            assert.deepStrictEqual(authG(tab)(s), authG(tab)(c), tab)
        }
        assert.strictEqual(editorOpen(c, TABS_G.A.rows).rows.filter((r) => r.dangling).length, 1, '表 A 無名稱 \'\' 之群組: 額外列')
        assert.strictEqual(editorOpen(c, TABS_G.C.rows).rows.filter((r) => r.dangling).length, 0, '表 C 有名稱 \'\' 之群組: 由表列顯示')
        let c2 = '[{"name":"G1","mode":"OR","isActive":"y"},{"name":"G2","isActive":"y"}]'
        let s2 = editorSave(c2, editorOpen(c2, TABS_G.A.rows))
        assert.deepStrictEqual(JSON.parse(s2).G2, { isActive: 'y' })
        assert.strictEqual(yOf(authG('A')(s2)), yOf(authG('A')(c2)))
    })

    it('EX-003-直接編輯器: 停用之懸空引用不產生額外列, 存檔丟棄不改變授權; 歷史同名 G2 兩列一致時寫出一次, 切換其一 → 兩列一併套用(恆一致); 不一致(防呆)→ 拒存(warnDupRowsInconsistent)', function() {
        let c = '{"G1":{"mode":"OR","isActive":"y"},"GX":{"mode":"AND","isActive":"n"}}'
        let st = editorOpen(c, TABS_G.A.rows)
        assert.strictEqual(st.rows.length, 2)
        let s = editorSave(c, st)
        assert.ok(!('GX' in JSON.parse(s)))
        assert.deepStrictEqual(authG('A')(s), authG('A')(c))
        let c2 = '{"G2":{"mode":"OR","isActive":"y"}}'
        let st2 = editorOpen(c2, TABS_G.B.rows)
        assert.deepStrictEqual(st2.rows.filter((r) => r.name === 'G2').map((r) => r.enable), ['y', 'y'])
        assert.deepStrictEqual(JSON.parse(editorSave(c2, st2)), { G1: { mode: 'OR', isActive: 'n' }, G2: { mode: 'OR', isActive: 'y' } })
        assert.strictEqual(yOf(authG('B')(c2)), 'T2', '同名兩列取交集')
        //單列切換對精確同名之全部列一併套用 → 恆一致, 存檔成功
        editorToggle(st2, 'G2', 'n', 'OR')
        assert.deepStrictEqual(st2.rows.filter((r) => r.name === 'G2').map((r) => r.enable), ['n', 'n'])
        assert.deepStrictEqual(getDupRowsInconsistent(st2.rows), [])
        assert.strictEqual(yOf(authG('B')(editorSave(c2, st2))), '')
        //防呆: 若同名列仍不一致(非經 UI 之改動) → 拒存
        st2.rows[st2.rows.findIndex((r) => r.name === 'G2')].enable = 'y'
        assert.deepStrictEqual(getDupRowsInconsistent(st2.rows), ['G2'])
        assert.strictEqual(editorSave(c2, st2), false)
    })

    it('EX-004-反向關聯對話框: 未改本群組之列字串逐字元不動; 切換本群組時懸空 AND／名稱 \'\'／純量值保留(修前丟棄懸空 AND 即放寬)', function() {
        let c = '{"G1":{"mode":"OR","isActive":"y"},"GX":{"mode":"AND","isActive":"y"}}'
        assert.strictEqual(relSave(c, 'G1', 'y', 'OR'), c, '本群組未變更: 不改寫')
        let s = relSave(c, 'G2', 'y', 'OR')
        assert.deepStrictEqual(JSON.parse(s), { G1: { mode: 'OR', isActive: 'y' }, GX: { mode: 'AND', isActive: 'y' }, G2: { mode: 'OR', isActive: 'y' } })
        assert.strictEqual(yOf(authG('A')(s)), '', 'GX(AND, 懸空)仍使結果為空')
        let c2 = '[{"name":"G1","mode":"OR","isActive":"y"},{"name":"","mode":"AND","isActive":"y"},{"name":"G2","isActive":"n"}]'
        assert.strictEqual(relSave(c2, 'G2', 'n', 'OR'), c2, '陣列形式且本群組未變更: 原字串(含陣列形式)不動')
        let s2 = relSave(c2, 'G1', 'y', 'AND')
        assert.deepStrictEqual(JSON.parse(s2)[''], { mode: 'AND', isActive: 'y' })
        assert.deepStrictEqual(authG('C')(s2), authG('C')(oracle(c2, 'G1', 'y', 'AND')))
        assert.strictEqual(relSave('[{"name":"G1","mode":"OR","isActive":"y"},{"name":"G1","mode":"AND","isActive":"y"}]', 'G2', 'y', 'OR'), null, '有損(同名 OR／AND)不經改寫')
    })


    // ===== 往返不變式(窮舉＋隨機) =====

    //直接編輯器: 開啟 → 不改值 → 存檔, 授權不變(有損者回原字串); 隨機挑一列改值 → 授權＝oracle(只改該名稱), 同名多列被改者拒存, 有損者有變更即拒存
    let runEditorRoundTrip = (layer) => {
        let tabs = layer === 'G' ? TABS_G : TABS_P
        let auth = layer === 'G' ? authG : authP
        let stat = { cases: 0, lossy: 0, extra: 0, extraAnd: 0, changed: 0, changedDup: 0, changedLossyReject: 0 }
        for (let [tk, tab] of Object.entries(tabs)) {
            let r = rng(tk.charCodeAt(0) * 7919 + (layer === 'G' ? 1 : 2))
            for (let c of spaceOf(tab.names, tk.charCodeAt(0) + 101)) {
                stat.cases++
                let st = editorOpen(c, tab.rows)
                if (st.lossy.length > 0) {
                    stat.lossy++
                }
                let ex = st.rows.filter((v) => v.dangling)
                stat.extra += ex.length > 0 ? 1 : 0
                stat.extraAnd += ex.some((v) => v.mode === 'AND') ? 1 : 0
                let s = editorSave(c, st)
                assert.notStrictEqual(s, false, `未改值不得拒存: 表 ${tk} ${c}`)
                assert.deepStrictEqual(auth(tk)(s), auth(tk)(c), `未改值存檔後授權須不變: 表 ${tk} ${c} → ${s}`)
                if (st.lossy.length > 0) {
                    assert.strictEqual(s, c, `有損且未變更: 回原字串 ${c}`)
                }
                //改一列(約 1/3 之格; 只挑名稱為字串之列, 同 .vue 之單列切換以名稱找第一列)
                if (r() < 0.34) {
                    let cand = st.rows.filter((v) => typeof v.name === 'string')
                    if (cand.length === 0) {
                        continue
                    }
                    let row = cand[Math.floor(r() * cand.length)]
                    let to = row.enable === 'y' ? (r() < 0.5 ? { enable: 'n', mode: row.mode } : { enable: 'y', mode: row.mode === 'OR' ? 'AND' : 'OR' }) : { enable: 'y', mode: r() < 0.5 ? 'OR' : 'AND' }
                    let nSame = st.rows.filter((v) => v.name === row.name).length
                    editorToggle(st, row.name, to.enable, to.mode)
                    let s2 = editorSave(c, st)
                    stat.changed++
                    if (st.lossy.length > 0) {
                        assert.strictEqual(s2, false, `有損且有變更須拒存: ${c}`)
                        stat.changedLossyReject++
                    }
                    else {
                        if (nSame >= 2) {
                            stat.changedDup++ //同名多列一併套用, 恆一致而存檔
                        }
                        assert.notStrictEqual(s2, false, `非有損且同名列一併套用者不得拒存: 表 ${tk} ${c} ${row.name}`)
                        assert.deepStrictEqual(auth(tk)(s2), auth(tk)(oracle(c, row.name, to.enable, to.mode)), `改 ${row.name}→${to.enable}/${to.mode} 後授權須等於只改該名稱: 表 ${tk} ${c} → ${s2}`)
                    }
                }
            }
        }
        return stat
    }

    it('RT-001-直接編輯器(VeCgrups, 群組層 cgrups): 開啟 → 不改值 → 存檔授權不變(或有損回原字串); 改一列授權＝只改該名稱; 窮舉(物件形式 4 名稱 × 9 值、陣列形式長度 ≤ 2)＋隨機, 4 張群組表', function() {
        let stat = runEditorRoundTrip('G')
        assert.ok(stat.cases > 40000, JSON.stringify(stat))
        assert.ok(stat.lossy > 0 && stat.extra > 0 && stat.extraAnd > 0 && stat.changed > 0 && stat.changedDup > 0 && stat.changedLossyReject > 0, `各分支須實際被走到(非空驗): ${JSON.stringify(stat)}`)
    })

    it('RT-002-直接編輯器(VeCpemis, 權限層 cpemis): 同 RT-001, 3 張權限表(含歷史同名、名稱 \'\' 之權限)', function() {
        let stat = runEditorRoundTrip('P')
        assert.ok(stat.cases > 30000, JSON.stringify(stat))
        assert.ok(stat.lossy > 0 && stat.extra > 0 && stat.extraAnd > 0 && stat.changed > 0 && stat.changedDup > 0, `各分支須實際被走到(非空驗): ${JSON.stringify(stat)}`)
    })

    //反向關聯對話框: 每個字串 × 本群組(表中字串名稱者) × 目標狀態{不歸屬, OR, AND}: 非有損者 relSave 之授權＝oracle(其餘引用項之效果不變); 未變更者字串逐字元不動
    let runRelRoundTrip = (layer) => {
        let tabs = layer === 'G' ? TABS_G : TABS_P
        let auth = layer === 'G' ? authG : authP
        let stat = { cells: 0, lossySkip: 0, unchanged: 0, rewritten: 0 }
        for (let [tk, tab] of Object.entries(tabs)) {
            //本群組名稱: 表列之 name(.vue 為 get(vo, 'grup.name', ''), 無 name 欄者為 ''); 非字串名稱之列不納入(其改寫本即指向懸空名稱, 既有行為)
            let selfNames = [...new Set(tab.rows.map((v) => (v.name === undefined ? '' : v.name)).filter((n) => typeof n === 'string'))]
            for (let c of spaceOf(tab.names, tk.charCodeAt(0) + 211)) {
                for (let name of selfNames) {
                    for (let [enable, mode] of [['n', 'OR'], ['y', 'OR'], ['y', 'AND']]) {
                        stat.cells++
                        let s = relSave(c, name, enable, mode)
                        if (s === null) {
                            stat.lossySkip++
                            continue
                        }
                        if (s === c) {
                            stat.unchanged++
                        }
                        else {
                            stat.rewritten++
                        }
                        //期望: 目標＝該名稱「限制項」(啟用而 mode 缺／非法)之對話框所示狀態(啟用、AND)者為未變更, 授權同原字串(run06 第三格放寬: 該層全為限制項時, 「所示之 AND」
                        //若以真合法 AND 解讀, 會成為唯一基底而多給, 並非管理者之改動); 其餘照舊為同一編輯套用於原資料之 oracle
                        let sh = shownOf(c, name)
                        let sameLim = isLimName(c, name) && enable === 'y' && sh.enable === 'y' && mode === sh.mode
                        if (sameLim) {
                            assert.strictEqual(s, c, `限制項之目標同所示狀態: 字串逐字元不動 ${c} ${name}`)
                        }
                        assert.deepStrictEqual(auth(tk)(s), sameLim ? auth(tk)(c) : auth(tk)(oracle(c, name, enable, mode)), `表 ${tk} ${c} 之 ${name}→${enable}/${mode}: ${s}`)
                    }
                }
            }
        }
        return stat
    }

    it('RV-RT-001-反向關聯對話框(VeGrupBlngUsers, 群組層): 改寫後授權＝只改本群組之 oracle(懸空、\'\'、非法 mode、停用、純量值之效果不變); 未變更者不改寫; 有損者不經改寫', function() {
        let stat = runRelRoundTrip('G')
        assert.ok(stat.cells > 100000 && stat.lossySkip > 0 && stat.unchanged > 0 && stat.rewritten > 0, JSON.stringify(stat))
    })

    it('RV-RT-002-反向關聯對話框(VePemiBlngGrups, 權限層): 同 RV-RT-001', function() {
        let stat = runRelRoundTrip('P')
        assert.ok(stat.cells > 80000 && stat.lossySkip > 0 && stat.unchanged > 0 && stat.rewritten > 0, JSON.stringify(stat))
    })


    //混合層(合法項＋限制項)全編輯窮舉: 每個字串 × 每個名稱 × 目標狀態{不歸屬, OR, AND}之單一編輯; 期望: 目標同開啟時狀態 → 授權同原字串, 否則 → oracle(同一編輯套用於原資料), 以 getUserRules 為真理
    const MIX_VALS = [undefined, { mode: 'OR', isActive: 'y' }, { mode: 'AND', isActive: 'y' }, { isActive: 'y' }, { mode: 'or', isActive: 'y' }, { mode: 1, isActive: 'y' }, { mode: null, isActive: 'y' }, 'y', { mode: 'AND', isActive: 'n' }]
    const MIX_MODES = ['OR', 'AND', undefined, 'or', 1, null]
    let mixSpace = (names, seed) => {
        let out = []
        let total = MIX_VALS.length ** names.length
        for (let i = 0; i < total; i++) {
            let o = {}
            let x = i
            for (let nm of names) {
                let v = MIX_VALS[x % MIX_VALS.length]
                x = Math.floor(x / MIX_VALS.length)
                if (v !== undefined) {
                    o[nm] = v
                }
            }
            out.push(JSON.stringify(o))
        }
        let pool = []
        for (let nm of names) {
            for (let m of MIX_MODES) {
                pool.push(m === undefined ? { name: nm, isActive: 'y' } : { name: nm, mode: m, isActive: 'y' })
            }
        }
        for (let a of pool) {
            for (let b of pool) {
                out.push(JSON.stringify([a, b]))
            }
        }
        let r = rng(seed)
        for (let i = 0; i < 400; i++) {
            out.push(JSON.stringify([0, 1, 2].map(() => pool[Math.floor(r() * pool.length)])))
        }
        return out
    }
    let runMixed = (layer) => {
        let tabs = layer === 'G' ? { A: TABS_G.A, B: TABS_G.B } : { A: TABS_P.A, B: TABS_P.B }
        let auth = layer === 'G' ? authG : authP
        let stat = { strings: 0, edits: 0, lossy: 0, relCells: 0, bugWithoutMap: 0 }
        for (let [tk, tab] of Object.entries(tabs)) {
            let names = tab.names.slice(0, 3)
            for (let c of mixSpace(names, tk.charCodeAt(0) + (layer === 'G' ? 31 : 37))) {
                stat.strings++
                let st0 = editorOpen(c, tab.rows)
                if (st0.lossy.length > 0) {
                    stat.lossy++
                }
                let rowNames = [...new Set(st0.rows.map((v) => v.name).filter((n) => typeof n === 'string'))]
                for (let name of rowNames) {
                    let r0 = st0.rows.find((v) => v.name === name)
                    for (let [en, md] of [['n', r0.mode], ['y', 'OR'], ['y', 'AND']]) {
                        let same = en === r0.enable && (en !== 'y' || md === r0.mode)
                        //直接編輯器
                        let st = { ...st0, rows: st0.rows.map((v) => ({ ...v })) }
                        editorToggle(st, name, en, md)
                        let s = editorSave(c, st)
                        stat.edits++
                        if (st0.lossy.length > 0) {
                            assert.strictEqual(s, same ? c : false, `有損: 未變更回原字串、有變更拒存: ${c} ${name}→${en}/${md}`)
                        }
                        else {
                            let want = same ? auth(tk)(c) : auth(tk)(oracle(c, name, en, md))
                            assert.deepStrictEqual(auth(tk)(s), want, `直接編輯器 表 ${tk} ${c} 之 ${name}→${en}/${md}: ${s}`)
                            let sNo = JSON.stringify(putRowsToKp(Object.create(null), st.rows))
                            if (!isEqual(auth(tk)(sNo), want)) {
                                stat.bugWithoutMap++
                            }
                        }
                        //反向關聯對話框(本實體為表中字串名稱者)
                        if (tab.rows.some((v) => v.name === name)) {
                            let s2 = relSave(c, name, en, md)
                            stat.relCells++
                            if (s2 !== null) {
                                let want2 = same ? auth(tk)(c) : auth(tk)(oracle(c, name, en, md))
                                assert.deepStrictEqual(auth(tk)(s2), want2, `反向 表 ${tk} ${c} 之 ${name}→${en}/${md}: ${s2}`)
                            }
                        }
                    }
                }
            }
        }
        return stat
    }

    it('RT-003-混合層(合法項＋限制項: mode 缺／\'or\'／1／null／純量 y)全編輯窮舉, 群組層: 直接編輯器與反向關聯對話框存檔之授權＝同一編輯套用於原資料(未改之限制項不得被寫成可當基底之合法 AND)', function() {
        let stat = runMixed('G')
        assert.ok(stat.strings > 2000 && stat.edits > 15000 && stat.relCells > 10000 && stat.lossy > 0, JSON.stringify(stat))
        assert.ok(stat.bugWithoutMap > 0, `未給 rawModeMap 時須有格多給(證明本維度涵蓋該缺陷): ${JSON.stringify(stat)}`)
    })

    it('RT-004-混合層全編輯窮舉, 權限層(cpemis): 同 RT-003', function() {
        let stat = runMixed('P')
        assert.ok(stat.strings > 2000 && stat.edits > 15000 && stat.relCells > 10000 && stat.lossy > 0 && stat.bugWithoutMap > 0, JSON.stringify(stat))
    })


    // ===== run06 第三格放寬: 「該層啟用項皆 mode 缺／非法」存檔不多給之證明(窮舉＋隨機; ADR-035 Update 2026-10-22, 規則帳本 R-EDIT-KEEP-01 ③) =====
    //放寬前 getKpLossy 對此格判有損而整格拒存(管理者無法存任何變更); 放寬後存檔須不多給. 判準(對 getUserRules 之真授權):
    //  ①未改動(各列終態＝開啟時所示狀態): 存檔後授權＝存檔前(限制項原樣寫回, 不被升格為可當基底之合法 AND);
    //  ②有改動: 授權＝同一編輯套用於原資料(oracleEditsArr: 被編輯之名稱以新狀態取代, 未被編輯之項逐字保留);
    //  ③上界: 授權不多於「對話框所示狀態」之伺服端解讀(所示之限制項 ＝ 合法 AND, 為最寬之解讀);
    //  ④開啟時不判有損、存檔不拒(直接編輯器回非 false; 反向關聯對話框回非 null).
    //列終態: 每個對話框列(名稱為字串之相異列名)各取 { 停用, 啟用 OR, 啟用 AND }(含開啟時所示狀態＝不動)之組合: 單列改動、批次(全停用／全 OR／全 AND／反選)、全 3^k 組、固定種子隨機組.

    const L3_OBJ_VALS = [undefined, { isActive: 'y' }, { mode: 'or', isActive: 'y' }, { mode: 'XOR', isActive: 'y' }, { mode: 1, isActive: 'y' }, { mode: null, isActive: 'y' }, 'y', { mode: 'OR', isActive: 'n' }, { mode: 'AND', isActive: 'n' }, { isActive: 'n' }, 'n']
    const L3_MIX_VALS = [...L3_OBJ_VALS, { mode: 'OR', isActive: 'y' }, { mode: 'AND', isActive: 'y' }]
    const L3_ARR_ELEMS = [{ isActive: 'y' }, { mode: 'or', isActive: 'y' }, { mode: 'XOR', isActive: 'y' }, { mode: null, isActive: 'y' }, { mode: 'OR', isActive: 'n' }, { mode: 'AND', isActive: 'n' }, { isActive: 'n' }]

    let l3Targets = (r0) => [{ enable: 'n', mode: r0.mode }, { enable: 'y', mode: 'OR' }, { enable: 'y', mode: 'AND' }]
    let l3Init = (r0s) => r0s.map((r) => ({ enable: r.enable, mode: r.mode }))
    let l3Single = (r0s) => {
        let out = [l3Init(r0s)]
        r0s.forEach((r0, i) => {
            for (let t of l3Targets(r0)) {
                let v = l3Init(r0s)
                v[i] = t
                out.push(v)
            }
        })
        return out
    }
    let l3Batch = (r0s) => [
        r0s.map((r) => ({ enable: 'n', mode: r.mode })),
        r0s.map(() => ({ enable: 'y', mode: 'OR' })),
        r0s.map(() => ({ enable: 'y', mode: 'AND' })),
        r0s.map((r) => ({ enable: r.enable === 'y' ? 'n' : 'y', mode: r.mode })),
    ]
    let l3Full = (r0s) => {
        let out = [[]]
        for (let r0 of r0s) {
            let next = []
            for (let v of out) {
                for (let t of l3Targets(r0)) {
                    next.push([...v, t])
                }
            }
            out = next
        }
        return out
    }
    let l3Sample = (r, n) => (r0s) => {
        let out = []
        for (let k = 0; k < n; k++) {
            out.push(r0s.map((r0) => (r() < 0.25 ? { enable: r0.enable, mode: r0.mode } : l3Targets(r0)[Math.floor(r() * 3)])))
        }
        return out
    }
    //單列改動＋批次＋隨機 2 組(窮舉字串多時用), 與全 3^k 組(字串少時用)
    let l3Light = (seed) => {
        let r = rng(seed)
        return (r0s) => [...l3Single(r0s), ...l3Batch(r0s), ...l3Sample(r, 2)(r0s)]
    }

    let l3Strings = (kind, names, cls) => {
        let all
        if (kind === 'obj') {
            all = genObjForm(names, L3_OBJ_VALS)
        }
        else if (kind === 'mix') {
            all = genObjForm(names, L3_MIX_VALS)
        }
        else {
            let pool = []
            for (let nm of names) {
                for (let e of L3_ARR_ELEMS) {
                    pool.push({ name: nm, ...e })
                }
            }
            all = []
            let frontier = [[]]
            for (let len = 1; len <= kind; len++) { //kind 為數字: 陣列形式之最大長度
                let next = []
                for (let c of frontier) {
                    for (let e of pool) {
                        next.push([...c, e])
                    }
                }
                all.push(...next.map((a) => JSON.stringify(a)))
                frontier = next
            }
        }
        return all.filter((c) => classOf(c) === cls)
    }

    //固定種子隨機: 陣列(長 1～5)與物件(值內多餘欄位與值內 name), 名稱取自 names(不含非字串名稱: 其屬第二格仍有損); mode 缺／'or'／'XOR'／null／1／'and'／'' 為限制項, 另摻合法項
    let l3Random = (names, n, seed) => {
        let r = rng(seed)
        let pick = (a) => a[Math.floor(r() * a.length)]
        let limModes = [undefined, 'or', 'XOR', null, 1, 'and', '']
        let out = []
        for (let i = 0; i < n; i++) {
            let mk = () => {
                let o = {}
                if (r() < 0.25) {
                    o.mode = pick(['OR', 'AND'])
                }
                else {
                    let m = pick(limModes)
                    if (m !== undefined) {
                        o.mode = m
                    }
                }
                o.isActive = r() < 0.78 ? 'y' : 'n'
                return o
            }
            if (r() < 0.5) {
                let len = 1 + Math.floor(r() * 5)
                let arr = []
                for (let k = 0; k < len; k++) {
                    arr.push({ name: pick(names), ...mk() })
                }
                out.push(JSON.stringify(arr))
            }
            else {
                let o = {}
                for (let nm of names) {
                    if (r() < 0.7) {
                        let v = r() < 0.12 ? pick(['y', 'n']) : mk()
                        o[nm] = (r() < 0.15 && typeof v === 'object') ? { ...v, extra: 'x', name: pick(names) } : v
                    }
                }
                out.push(JSON.stringify(o))
            }
        }
        return out.filter((c) => !['unnamed', 'both'].includes(classOf(c))) //仍有損之第一、二格不在本組(由 RT-001 等涵蓋)
    }

    //斷言之訊息為函數, 僅於失敗時才組字串(窮舉數十萬格, 避免成功路徑之字串組裝成本)
    let l3Ok = (cond, msg) => {
        if (!cond) {
            assert.fail(msg())
        }
    }
    let l3Eq = (got, want, msg) => {
        if (!isEqual(got, want)) {
            assert.deepStrictEqual(got, want, msg())
        }
    }

    let checkL3 = (ctx, c, vectors) => {
        let { tk, tab, auth, stat, selfNames } = ctx
        let cls = classOf(c)
        stat.byClass[cls] = (stat.byClass[cls] || 0) + 1
        stat.strings++
        let arr0 = decodeArr(c)
        let st0 = editorOpen(c, tab.rows)
        l3Ok(st0.lossy.length === 0, () => `第三格已放寬, 開啟時不判有損: 表 ${tk} ${c} → ${JSON.stringify(st0.lossy)}`)
        let names = [...new Set(st0.rows.map((v) => v.name).filter((n) => typeof n === 'string'))]
        let r0s = names.map((n) => st0.rows.find((v) => v.name === n))
        let init = l3Init(r0s)
        let originHasValid = cls === 'mixed' || cls === 'valid'
        let aOrig = auth(tk)(c)
        //直接編輯器
        for (let fin of vectors(r0s)) {
            let st = { ...st0, rows: st0.rows.map((v) => ({ ...v })) }
            let edits = []
            names.forEach((name, i) => {
                let f = fin[i]
                editorToggle(st, name, f.enable, f.mode)
                if (!(f.enable === init[i].enable && (f.enable !== 'y' || f.mode === init[i].mode))) {
                    edits.push({ name, enable: f.enable, mode: f.mode })
                }
            })
            let s = editorSave(c, st)
            stat.direct++
            let tag = () => `表 ${tk} ${c} 終態 ${names.map((n, i) => `${n}:${fin[i].enable}/${fin[i].mode}`).join(' ')}`
            l3Ok(s !== false, () => `不得拒存(第三格已放寬): ${tag()}`)
            let os = oracleEditsArr(arr0, edits)
            let want = auth(tk)(os)
            let got = auth(tk)(s)
            l3Eq(got, want, () => `存檔後授權須等於同一編輯套用於原資料(未被改動之項逐字保留): ${tag()} → ${s}`)
            if (edits.length === 0) {
                stat.unchanged++
                l3Eq(got, aOrig, () => `未改動: 存檔前後授權相等: ${tag()} → ${s}`)
            }
            else {
                stat.changed++
            }
            //③上界: 不多於所示狀態(限制項視為合法 AND)之解讀
            let shown = JSON.stringify(names.map((n) => st.rows.find((v) => v.name === n)).filter((v) => v.enable === 'y').map((v) => ({ name: v.name, mode: v.mode, isActive: 'y' })))
            l3Ok(!moreY(got, auth(tk)(shown)), () => `授權不得多於對話框所示狀態之解讀: ${tag()} → ${s}`)
            //空化: 原層有合法項, 管理者之編輯使該層啟用項皆為限制項
            if (originHasValid) {
                let act = JSON.parse(os).filter((e) => e.isActive === 'y')
                if (act.length > 0 && act.every((e) => e.mode !== 'OR' && e.mode !== 'AND')) {
                    stat.emptied++
                }
            }
            //對照: 照列寫出而不還原原始 mode(修前之寫法)是否多給／偏離(證明本維度涵蓋該缺陷)
            let aNo = auth(tk)(JSON.stringify(putRowsToKp(Object.create(null), st.rows)))
            if (!isEqual(aNo, want)) {
                stat.naiveDiff++
            }
            if (moreY(aNo, want)) {
                stat.naiveGain++
            }
        }
        //反向關聯對話框(本實體為表中字串名稱者)
        for (let name of selfNames) {
            let sh = shownOf(c, name)
            for (let [en, md] of [['n', 'OR'], ['y', 'OR'], ['y', 'AND']]) {
                let s = relSave(c, name, en, md)
                stat.rel++
                let tag = () => `表 ${tk} ${c} 之 ${name}→${en}/${md}`
                l3Ok(s !== null, () => `第三格已放寬, 反向關聯對話框不得視為有損: ${tag()}`)
                let same = en === sh.enable && (en !== 'y' || md === sh.mode)
                if (same) {
                    stat.relSame++
                    l3Ok(s === c, () => `目標同所示狀態: 字串逐字元不動: ${tag()} → ${s}`)
                }
                else {
                    stat.relRewritten++
                }
                let wantRel = same ? aOrig : auth(tk)(oracleEditsArr(arr0, [{ name, enable: en, mode: md }]))
                l3Eq(auth(tk)(s), wantRel, () => `反向關聯對話框: ${tag()}: ${s}`)
            }
        }
    }

    //plans: [{ tk, strings, vectors }]; 回傳統計
    let runLossy3 = (layer, plans) => {
        let tabs = layer === 'G' ? TABS_G : TABS_P
        let auth = layer === 'G' ? authG : authP
        let stat = { strings: 0, direct: 0, unchanged: 0, changed: 0, emptied: 0, rel: 0, relSame: 0, relRewritten: 0, naiveDiff: 0, naiveGain: 0, byClass: {} }
        for (let { tk, strings, vectors } of plans) {
            let tab = tabs[tk]
            let selfNames = [...new Set(tab.rows.map((v) => (v.name === undefined ? '' : v.name)).filter((n) => typeof n === 'string'))]
            for (let c of strings) {
                checkL3({ tk, tab, auth, stat, selfNames }, c, vectors)
            }
        }
        return stat
    }
    let n3 = (tabs, tk, n) => tabs[tk].names.slice(0, n)

    it('RT-LOSSY3-001-群組層(VeCgrups／VeGrupBlngUsers, cgrups)物件形式窮舉: 該層啟用項皆 mode 缺／非法(限制項: 缺／\'or\'／XOR／1／null／純量 y; 另混停用之合法／限制項、懸空 GX、名稱 \'\')之全部字串, 4 張群組表(含歷史同名、名稱 \'\' 之群組、無 name 欄之列) × 單列／批次／全 3^k 終態: 存檔不多給', function() {
        let plans = [
            { tk: 'A', strings: l3Strings('obj', TABS_G.A.names, 'allLim'), vectors: l3Light(11) }, //4 名稱 × 11 值: 11^4 − 5^4
            ...['B', 'C', 'D'].map((tk) => ({ tk, strings: l3Strings('obj', n3(TABS_G, tk, 3), 'allLim'), vectors: l3Full })), //3 名稱: 11^3 − 5^3, 全 3^k 終態
        ]
        let stat = runLossy3('G', plans)
        assert.strictEqual(stat.strings, (11 ** 4 - 5 ** 4) + 3 * (11 ** 3 - 5 ** 3), JSON.stringify(stat))
        assert.strictEqual(stat.byClass.allLim, stat.strings, JSON.stringify(stat))
        assert.ok(stat.unchanged > 15000 && stat.changed > 100000 && stat.rel > 50000 && stat.relSame > 5000 && stat.relRewritten > 20000, JSON.stringify(stat))
        assert.ok(stat.naiveDiff > 0 && stat.naiveGain > 0, `對照(不還原原始 mode 之寫法)須有格偏離且多給(證明本維度涵蓋該缺陷): ${JSON.stringify(stat)}`)
    })

    it('RT-LOSSY3-002-權限層(VeCpemis／VePemiBlngGrups, cpemis)物件形式窮舉: 同 RT-LOSSY3-001, 3 張權限表(含歷史同名、名稱 \'\' 之權限)', function() {
        let plans = [
            { tk: 'A', strings: l3Strings('obj', TABS_P.A.names, 'allLim'), vectors: l3Light(12) },
            ...['B', 'C'].map((tk) => ({ tk, strings: l3Strings('obj', n3(TABS_P, tk, 3), 'allLim'), vectors: l3Full })),
        ]
        let stat = runLossy3('P', plans)
        assert.strictEqual(stat.strings, (11 ** 4 - 5 ** 4) + 2 * (11 ** 3 - 5 ** 3), JSON.stringify(stat))
        assert.strictEqual(stat.byClass.allLim, stat.strings, JSON.stringify(stat))
        assert.ok(stat.unchanged > 15000 && stat.changed > 100000 && stat.rel > 50000 && stat.relSame > 5000 && stat.relRewritten > 20000, JSON.stringify(stat))
        assert.ok(stat.naiveDiff > 0 && stat.naiveGain > 0, JSON.stringify(stat))
    })

    it('RT-LOSSY3-003-群組層陣列形式窮舉: 元素 = 3 名稱 × {啟用限制項 4 種(缺／\'or\'／XOR／null), 停用 OR／AND／缺 mode}, 長度 ≤ 3(表 A)與 ≤ 2(表 B／C／D)之全部「啟用項皆限制項」序列(含同名重複、同名限制項與停用合法項並存)', function() {
        let plans = [
            { tk: 'A', strings: l3Strings(3, n3(TABS_G, 'A', 3), 'allLim'), vectors: l3Light(13) },
            ...['B', 'C', 'D'].map((tk) => ({ tk, strings: l3Strings(2, n3(TABS_G, tk, 3), 'allLim'), vectors: l3Full })),
        ]
        let stat = runLossy3('G', plans)
        assert.strictEqual(stat.byClass.allLim, stat.strings, JSON.stringify(stat))
        assert.ok(stat.strings > 8000 && stat.unchanged > 8000 && stat.changed > 50000 && stat.rel > 40000 && stat.relSame > 4000, JSON.stringify(stat))
        assert.ok(stat.naiveDiff > 0 && stat.naiveGain > 0, JSON.stringify(stat))
    })

    it('RT-LOSSY3-004-權限層陣列形式窮舉: 同 RT-LOSSY3-003, 3 張權限表', function() {
        let plans = [
            { tk: 'A', strings: l3Strings(3, n3(TABS_P, 'A', 3), 'allLim'), vectors: l3Light(14) },
            ...['B', 'C'].map((tk) => ({ tk, strings: l3Strings(2, n3(TABS_P, tk, 3), 'allLim'), vectors: l3Full })),
        ]
        let stat = runLossy3('P', plans)
        assert.strictEqual(stat.byClass.allLim, stat.strings, JSON.stringify(stat))
        assert.ok(stat.strings > 8000 && stat.unchanged > 8000 && stat.changed > 50000 && stat.rel > 40000 && stat.relSame > 4000, JSON.stringify(stat))
        assert.ok(stat.naiveDiff > 0 && stat.naiveGain > 0, JSON.stringify(stat))
    })

    it('RT-LOSSY3-005-群組層「原層有合法項, 管理者編輯後只剩限制項」窮舉(物件形式 3 名稱 × 13 值, 原字串為合法項與限制項並存; 全 3^k 終態含停用全部合法項): 存檔不多給, 授權＝同一編輯套用於原資料', function() {
        let plans = [
            { tk: 'A', strings: l3Strings('mix', n3(TABS_G, 'A', 3), 'mixed'), vectors: l3Full },
            { tk: 'B', strings: l3Strings('mix', n3(TABS_G, 'B', 3), 'mixed'), vectors: l3Full },
            { tk: 'C', strings: l3Strings('mix', n3(TABS_G, 'C', 3), 'mixed'), vectors: l3Full },
        ]
        let stat = runLossy3('G', plans)
        assert.strictEqual(stat.strings, 3 * (13 ** 3 - 11 ** 3 - 7 ** 3 + 5 ** 3), JSON.stringify(stat)) //每表: 至少一合法啟用項(2 值)且至少一限制項(6 值)之 3 名稱組合
        assert.strictEqual(stat.byClass.mixed, stat.strings, JSON.stringify(stat))
        assert.ok(stat.emptied > 3000 && stat.changed > 50000 && stat.rel > 10000, JSON.stringify(stat))
        assert.ok(stat.naiveDiff > 0 && stat.naiveGain > 0, JSON.stringify(stat))
    })

    it('RT-LOSSY3-006-權限層「原層有合法項, 管理者編輯後只剩限制項」窮舉: 同 RT-LOSSY3-005', function() {
        let plans = [
            { tk: 'A', strings: l3Strings('mix', n3(TABS_P, 'A', 3), 'mixed'), vectors: l3Full },
            { tk: 'B', strings: l3Strings('mix', n3(TABS_P, 'B', 3), 'mixed'), vectors: l3Full },
            { tk: 'C', strings: l3Strings('mix', n3(TABS_P, 'C', 3), 'mixed'), vectors: l3Full },
        ]
        let stat = runLossy3('P', plans)
        assert.strictEqual(stat.strings, 3 * (13 ** 3 - 11 ** 3 - 7 ** 3 + 5 ** 3), JSON.stringify(stat))
        assert.strictEqual(stat.byClass.mixed, stat.strings, JSON.stringify(stat))
        assert.ok(stat.emptied > 3000 && stat.changed > 50000 && stat.rel > 10000, JSON.stringify(stat))
        assert.ok(stat.naiveDiff > 0 && stat.naiveGain > 0, JSON.stringify(stat))
    })

    it('RT-LOSSY3-007-隨機(固定種子): 群組層 4 表 × 各 600 字串、權限層 3 表 × 各 600 字串(陣列長 1～5 與物件, 值內多餘欄位與值內 name, mode 含 \'and\'／\'\'／1／null, 摻合法項), 單列／批次／隨機 3 組終態', function() {
        let mkPlans = (tabs, ks, seed0) => ks.map((tk, i) => ({ tk, strings: l3Random(tabs[tk].names, 600, seed0 + i), vectors: (r0s) => [...l3Single(r0s), ...l3Batch(r0s), ...l3Sample(rng(seed0 * 31 + i), 3)(r0s)] }))
        let statG = runLossy3('G', mkPlans(TABS_G, ['A', 'B', 'C', 'D'], 6101))
        let statP = runLossy3('P', mkPlans(TABS_P, ['A', 'B', 'C'], 6201))
        for (let stat of [statG, statP]) {
            assert.ok(stat.strings > 1500 && stat.byClass.allLim > 300 && stat.byClass.mixed > 300 && stat.changed > 5000 && stat.unchanged > 1500 && stat.rel > 8000 && stat.relSame > 800, JSON.stringify(stat))
        }
    })

    it('RT-LOSSY3-008-陣列形式「原層有合法項, 管理者編輯後只剩限制項」窮舉(含同名重複: 同名限制項與合法項並存): 2 名稱 × {啟用限制項 4 種, 啟用 OR／AND, 停用 OR} 長度 ≤ 3 之全部「合法項與限制項並存」序列(表 A, 群組層與權限層) × 全 3^k 終態', function() {
        let pool = []
        for (let nm of ['G1', 'G2']) {
            for (let e of [...L3_ARR_ELEMS.slice(0, 4), { mode: 'OR', isActive: 'y' }, { mode: 'AND', isActive: 'y' }, { mode: 'OR', isActive: 'n' }]) {
                pool.push({ name: nm, ...e })
            }
        }
        let strs = []
        let frontier = [[]]
        for (let len = 1; len <= 3; len++) {
            let next = []
            for (let c of frontier) {
                for (let e of pool) {
                    next.push([...c, e])
                }
            }
            strs.push(...next.map((a) => JSON.stringify(a)))
            frontier = next
        }
        strs = strs.filter((c) => classOf(c) === 'mixed') //同名之有效 OR 與限制項並存(視為 AND)者屬第一格(仍有損, 另測), 不在此
        assert.strictEqual(strs.length, 984, '序列數(固定窮舉空間)')
        //權限層名稱為 P1／P2: 同構造, 名稱代換
        let strsP = strs.map((c) => c.split('"G1"').join('"P1"').split('"G2"').join('"P2"'))
        let statG = runLossy3('G', [{ tk: 'A', strings: strs, vectors: l3Full }])
        let statP = runLossy3('P', [{ tk: 'A', strings: strsP, vectors: l3Full }])
        for (let stat of [statG, statP]) {
            assert.strictEqual(stat.strings, strs.length, JSON.stringify(stat))
            assert.strictEqual(stat.byClass.mixed, stat.strings, JSON.stringify(stat))
            assert.ok(stat.emptied > 600 && stat.changed > 7000 && stat.rel > 5000 && stat.naiveGain > 0, JSON.stringify(stat))
        }
    })

    it('RT-LOSSY3-009-原型鍵名(__proto__、constructor)為群組名稱之表(R-KEY-01): 陣列形式「啟用項皆限制項」長度 ≤ 2 之全部序列 × 全 3^k 終態, 存檔不多給(直接編輯器與反向關聯對話框)', function() {
        let names = ['G1', '__proto__', 'constructor']
        let rows = [G1, { name: '__proto__', cpemis: ref('P2') }, { name: 'constructor', cpemis: ref('P1') }]
        let cache = new Map()
        let auth = () => (c) => {
            if (!cache.has(c)) {
                cache.set(c, getUserRules({ cgrups: c }, rows, P_BASE, TGT).rules)
            }
            return cache.get(c)
        }
        let stat = { strings: 0, direct: 0, unchanged: 0, changed: 0, emptied: 0, rel: 0, relSame: 0, relRewritten: 0, naiveDiff: 0, naiveGain: 0, byClass: {} }
        for (let c of l3Strings(2, names, 'allLim')) {
            checkL3({ tk: 'X', tab: { rows, names }, auth, stat, selfNames: names }, c, l3Full)
        }
        assert.strictEqual(stat.byClass.allLim, stat.strings, JSON.stringify(stat))
        assert.ok(stat.strings > 300 && stat.changed > 3000 && stat.rel > 3000 && stat.naiveGain > 0, JSON.stringify(stat))
        //物件形式(以文字拼出, 避免 JS 物件字面值對 __proto__ 設原型而非建鍵): 單一／多個限制項之未改動存檔
        for (let c of ['{"__proto__":{"isActive":"y"}}', '{"constructor":{"mode":"or","isActive":"y"},"G1":{"isActive":"y"}}', '{"__proto__":"y","constructor":{"mode":null,"isActive":"y"}}']) {
            let st = editorOpen(c, rows)
            assert.deepStrictEqual(st.lossy, [], c)
            let s = editorSave(c, st)
            assert.notStrictEqual(s, false, c)
            assert.deepStrictEqual(auth()(s), auth()(c), `未改動存檔授權不變: ${c} → ${s}`)
            assert.ok(c.includes('__proto__') ? s.includes('"__proto__":{"isActive":"y"}') : s.includes('"constructor":{"mode":"or","isActive":"y"}'), `限制項原樣保留(含原型鍵名): ${c} → ${s}`)
        }
    })


    // ===== run06 第三格放寬: 具體例(使用者可讀; 以 TABS_G.A: G1＝P1{T1,T2}、G2＝P2{T2,T3}) =====

    it('EX-LOSSY3-001-直接編輯器: 該層只有一個缺 mode 之限制項 { G1 } → 不判有損、可存; 警告圖示(modeInvalid)保留; 存檔後仍為缺 mode 之限制項, 授權仍全 n; 照列寫出為合法 AND(方案 A 之前)則 G1 成為唯一基底而多給 T1,T2', function() {
        let c = '{"G1":{"isActive":"y"}}'
        assert.deepStrictEqual(getKpLossy(JSON5.parse(c)), [], '第三格已放寬')
        let st = editorOpen(c, TABS_G.A.rows)
        assert.deepStrictEqual(st.lossy, [])
        assert.deepStrictEqual(st.rows.find((r) => r.name === 'G1'), { name: 'G1', mode: 'AND', enable: 'y' }, '所示為啟用 AND')
        assert.deepStrictEqual(getRefWarns(c, TABS_G.A.rows).byCode.modeInvalid, ['G1'], '警告圖示(modeInvalid)保留')
        editorToggle(st, 'G2', 'y', 'OR') //管理者勾選 G2 又取消: 終態同開啟時, 視為未改動(列狀態為終態之函數, 不記操作歷程)
        editorToggle(st, 'G2', 'n', 'OR')
        let s = editorSave(c, st)
        assert.notStrictEqual(s, false, '不拒存')
        assert.deepStrictEqual(JSON.parse(s).G1, { isActive: 'y' }, '缺 mode 原樣保留')
        assert.strictEqual(yOf(authG('A')(c)), '')
        assert.strictEqual(yOf(authG('A')(s)), '', '存檔後授權不多給')
        let sNo = JSON.stringify(putRowsToKp(Object.create(null), st.rows))
        assert.strictEqual(yOf(authG('A')(sNo)), 'T1,T2', '照列寫出為合法 AND: 放寬前拒存之理由(現由方案 A 避免)')
    })

    it('EX-LOSSY3-002-直接編輯器: 兩個限制項 { G1 缺 mode, G2 \'or\' }, 管理者停用 G1 → 只剩限制項 G2, 授權全 n(不是 G2 之 T2,T3); G2 之 mode 原樣(\'or\')', function() {
        let c = '{"G1":{"isActive":"y"},"G2":{"mode":"or","isActive":"y"}}'
        let st = editorOpen(c, TABS_G.A.rows)
        editorToggle(st, 'G1', 'n', 'AND')
        let s = editorSave(c, st)
        assert.deepStrictEqual(JSON.parse(s).G2, { mode: 'or', isActive: 'y' })
        assert.deepStrictEqual(JSON.parse(s).G1, { mode: 'AND', isActive: 'n' })
        assert.strictEqual(yOf(authG('A')(s)), '')
        assert.deepStrictEqual(authG('A')(s), authG('A')(oracleEditsArr(decodeArr(c), [{ name: 'G1', enable: 'n', mode: 'AND' }])))
        assert.strictEqual(yOf(authG('A')(JSON.stringify(putRowsToKp(Object.create(null), st.rows)))), 'T2,T3', '照列寫出: G2 成為唯一 AND 基底而多給')
    })

    it('EX-LOSSY3-003-直接編輯器: 限制項 { G1 } 之層, 管理者勾選 G2(OR 或 AND) → 授權＝G2 與 G1(限制項, 交集)之 T2, 等於同一編輯套用於原資料; G1 仍為缺 mode 之限制項', function() {
        let c = '{"G1":{"isActive":"y"}}'
        for (let md of ['OR', 'AND']) {
            let st = editorOpen(c, TABS_G.A.rows)
            editorToggle(st, 'G2', 'y', md)
            let s = editorSave(c, st)
            assert.deepStrictEqual(JSON.parse(s).G1, { isActive: 'y' }, md)
            assert.deepStrictEqual(JSON.parse(s).G2, { mode: md, isActive: 'y' }, md)
            assert.strictEqual(yOf(authG('A')(s)), 'T2', `勾選 G2(${md}): G2{T2,T3} ∩ G1{T1,T2}`)
            assert.deepStrictEqual(authG('A')(s), authG('A')(oracleEditsArr(decodeArr(c), [{ name: 'G2', enable: 'y', mode: md }])), md)
        }
    })

    it('EX-LOSSY3-004-直接編輯器: 管理者把限制項 G1 改為 OR → 照選擇寫出 OR(明確操作: 授予 T1,T2); 改成 OR 再改回 AND 視為未改, 仍寫回原始 mode(已知限制①: 無法由編輯器把限制項明確轉成合法 AND)', function() {
        let c = '{"G1":{"isActive":"y"}}'
        let st = editorOpen(c, TABS_G.A.rows)
        editorToggle(st, 'G1', 'y', 'OR')
        let s = editorSave(c, st)
        assert.deepStrictEqual(JSON.parse(s).G1, { mode: 'OR', isActive: 'y' })
        assert.strictEqual(yOf(authG('A')(s)), 'T1,T2')
        editorToggle(st, 'G1', 'y', 'AND')
        let s2 = editorSave(c, st)
        assert.deepStrictEqual(JSON.parse(s2).G1, { isActive: 'y' }, '改回 AND: 終態同開啟時, 視為未改')
        assert.strictEqual(yOf(authG('A')(s2)), '')
    })

    it('EX-LOSSY3-005-權限層(直接編輯器 VeCpemis, cpemis): 原層有合法項 P2(AND)與限制項 P1(\'or\'), 管理者停用 P2 → 只剩限制項 P1, 授權全 n; 照列寫出則 P1 成為唯一 AND 基底而多給 T1,T2', function() {
        let c = '[{"name":"P1","mode":"or","isActive":"y"},{"name":"P2","mode":"AND","isActive":"y"}]'
        assert.strictEqual(yOf(authP('A')(c)), 'T2', '原: P2 為基底{T2,T3} ∩ P1 限制項{T1,T2}')
        let st = editorOpen(c, TABS_P.A.rows)
        editorToggle(st, 'P2', 'n', 'AND')
        let s = editorSave(c, st)
        assert.deepStrictEqual(JSON.parse(s).P1, { mode: 'or', isActive: 'y' })
        assert.strictEqual(yOf(authP('A')(s)), '')
        assert.deepStrictEqual(authP('A')(s), authP('A')(oracleEditsArr(decodeArr(c), [{ name: 'P2', enable: 'n', mode: 'AND' }])))
        assert.strictEqual(yOf(authP('A')(JSON.stringify(putRowsToKp(Object.create(null), st.rows)))), 'T1,T2')
    })

    it('EX-LOSSY3-006-反向關聯對話框(relSave): 限制項 { G1 } 之字串, 目標＝G1 所示狀態(啟用 AND)→ 字串逐字元不動; 本群組 G2 歸屬(OR)→ 只加 G2、G1 缺 mode 原樣, 授權 T2; 取消 G1 → { }; G1 改 OR → 授予 T1,T2', function() {
        let c = '{"G1":{"isActive":"y"}}'
        assert.strictEqual(relSave(c, 'G1', 'y', 'AND'), c, '未變更: 字串不動(原亦不判有損)')
        let s = relSave(c, 'G2', 'y', 'OR')
        assert.deepStrictEqual(JSON.parse(s), { G1: { isActive: 'y' }, G2: { mode: 'OR', isActive: 'y' } })
        assert.strictEqual(yOf(authG('A')(s)), 'T2')
        assert.strictEqual(relSave(c, 'G1', 'n', 'OR'), '{}')
        assert.strictEqual(yOf(authG('A')(relSave(c, 'G1', 'y', 'OR'))), 'T1,T2')
    })

    it('EX-LOSSY3-007-懸空限制項與名稱 \'\' 之純量限制項 { GX 缺 mode, "": "y" }: 不判有損、未改動存檔原樣保留(含鍵 \'\'), 授權仍全 n; 陣列形式同名重複限制項＋停用合法項亦同', function() {
        let c = '{"GX":{"isActive":"y"},"":"y"}'
        let st = editorOpen(c, TABS_G.A.rows)
        assert.deepStrictEqual(st.lossy, [])
        assert.deepStrictEqual(st.rows.filter((r) => r.dangling).map((r) => `${r.name}:${r.mode}:${r.enable}`), ['GX:AND:y', ':AND:y'])
        let s = editorSave(c, st)
        assert.deepStrictEqual(JSON.parse(s).GX, { isActive: 'y' })
        assert.deepStrictEqual(JSON.parse(s)[''], { isActive: 'y' })
        assert.strictEqual(yOf(authG('A')(s)), '')
        let c2 = '[{"name":"G1","isActive":"y"},{"name":"G1","mode":"or","isActive":"y"},{"name":"G2","mode":"AND","isActive":"n"}]'
        let s2 = editorSave(c2, editorOpen(c2, TABS_G.A.rows))
        assert.deepStrictEqual(JSON.parse(s2).G1, { isActive: 'y' }, '同名重複限制項: 取第一個之原始 mode(皆為限制項, 授權同)')
        assert.deepStrictEqual(authG('A')(s2), authG('A')(c2))
    })

    it('EX-LOSSY3-008-放寬只限第三格: 同名 OR 與缺 mode 並存(第一格)、啟用而名稱非字串之限制項(第二格)仍判有損——直接編輯器未改動回原字串、有變更拒存; 反向關聯對話框不經改寫', function() {
        for (let [c, names] of [['[{"name":"G1","mode":"OR","isActive":"y"},{"name":"G1","isActive":"y"}]', ['G1']], ['[{"mode":"or","isActive":"y"}]', ['#1']], ['[{"name":"G1","isActive":"y"},{"mode":"or","isActive":"y"}]', ['#2']]]) {
            assert.deepStrictEqual(getKpLossy(JSON5.parse(c)), names, c)
            let st = editorOpen(c, TABS_G.A.rows)
            assert.deepStrictEqual(st.lossy, names, c)
            assert.strictEqual(editorSave(c, st), c, `未改動: 回原字串 ${c}`)
            editorToggle(st, 'G2', 'y', 'OR')
            assert.strictEqual(editorSave(c, st), false, `有變更: 拒存 ${c}`)
            assert.strictEqual(relSave(c, 'G2', 'y', 'OR'), null, `反向關聯對話框不經改寫 ${c}`)
        }
    })


    // ===== 靜態站點: .vue 之膠合碼與上方模型一致, 警告節點僅於有警告時渲染 =====

    let codeOf = (fn) => sourceLines(path.join(projRoot, 'src', 'components', `${fn}.vue`), 'code').filter((l) => l.text.trim() !== '')
    let methodBody = (lines, name) => {
        let i0 = lines.findIndex((l) => new RegExp(`^\\s{8}${name}: function`).test(l.text))
        assert.ok(i0 >= 0, `找不到方法 ${name}`)
        let i1 = lines.findIndex((l, k) => k > i0 && /^\s{8}[A-Za-z_$][\w$]*: (async )?function/.test(l.text))
        return lines.slice(i0, i1 < 0 ? lines.length : i1).map((l) => l.text.trim()).join('\n')
    }
    let tplOf = (fn) => {
        let t = fs.readFileSync(path.join(projRoot, 'src', 'components', `${fn}.vue`), 'utf8')
        return t.slice(0, t.indexOf('<script>')).split(/\r?\n/).map((l) => l.trim()).join('\n')
    }
    const ICON_NAME = '<span :title="props.row.warnText" v-if="props.row.warnText"><img style="vertical-align:sub; width:16px; height:16px; margin-right:4px;" :src="$ui.getIcon(\'warning\')" />{{ props.value }}</span>\n<span v-else>{{ props.value }}</span>'

    it('SITE-ER-001-VeCgrups／VeCpemis: show 以 getOwn＋getRefState 產表列並附 getRefRowsExtra 額外列、getRefWarns 取警告; doSave 先 getDupRowsInconsistent 拒存再 putRowsToKp 寫出, 不再以 isestr(name) 略過; 名稱儲存格之警告節點僅於 warnText 時渲染', function() {
        for (let [fn, kp, tab, field, kind] of [['VeCgrups', 'kpGrup', 'vo.grups', 'cgrups', 'warnKindGrup'], ['VeCpemis', 'kpPemi', 'vo.pemis', 'cpemis', 'warnKindPemi']]) {
            let lines = codeOf(fn)
            let s = methodBody(lines, 'show')
            for (let h of [`let p = getOwn(${kp}, v.name, null)`, 'let { mode, enable } = getRefState(p)', `items = [...items, ...getRefRowsExtra(${kp}, ${tab})]`, `let resWarn = getRefWarns(${field}, ${tab})`, `getItemWarnText(codes, r.name, vo.$t, '${kind}')`, 'vo.itemsInit = map(items, (r) => ({ name: r.name, mode: r.mode, enable: r.enable }))', 'rawModeMap = getRawModeMap(kpRaw)', 'vo.rawModeMap = rawModeMap']) {
                assert.ok(s.includes(h), `${fn}.show 應含「${h}」`)
            }
            assert.ok(s.indexOf('getRefRowsExtra(') < s.indexOf('vo.itemsInit = '), `${fn}.show 之 itemsInit 須含額外列(在附加之後取)`)
            let d = methodBody(lines, 'doSave')
            let iDup = d.indexOf('let namesDupBad = getDupRowsInconsistent(rows)')
            let iPut = d.indexOf(`putRowsToKp(${kp}, rows, vo.rawModeMap)`)
            assert.ok(iDup >= 0 && iPut > iDup, `${fn}.doSave 須先 getDupRowsInconsistent 再 putRowsToKp(${kp}, rows, vo.rawModeMap)(未改之限制項寫回原始 mode)`)
            //單列切換與批次操作: 精確同名之全部列一併套用(getRowIdxs), 不再以 get(v, 'name', '') 找第一列或 kpRow[r.name] 只命中最後一列
            let pre = fn === 'VeCgrups' ? 'showVeCgrups' : 'showVeCpemis'
            for (let m of [`${pre}ToggleItemModeByName`, `${pre}ToggleItemEnableByName`]) {
                let b = methodBody(lines, m)
                assert.ok(b.includes("let krs = getRowIdxs(rows, 'name', name)") && /each\(krs, \(kr\) => \{/.test(b) && !b.includes("get(v, 'name', '') === name"), `${fn}.${m} 須以 getRowIdxs 對精確同名之全部列套用`)
            }
            for (let m of [`${pre}ToggleItemsEnableAllYes`, `${pre}ToggleItemsEnableAllNo`, `${pre}ToggleItemsEnableAllInv`]) {
                let b = methodBody(lines, m)
                assert.ok(b.includes("each(getRowIdxs(rows, 'name', r.name), (kr) => {") && !/kpRow\[r\.name\]/.test(b), `${fn}.${m} 須對精確同名之全部列套用`)
            }
            assert.ok(/if \(size\(namesDupBad\) > 0\) \{[\s\S]{0,300}warnDupRowsInconsistent[\s\S]{0,120}return false/.test(d), `${fn}.doSave 不一致時須以 warnDupRowsInconsistent 拒存`)
            assert.ok(!/isestr\(name\)/.test(d), `${fn}.doSave 不得以 isestr(name) 略過名稱 ''`)
            assert.ok(tplOf(fn).includes(ICON_NAME), `${fn} 名稱儲存格: 有 warnText 才渲染圖示, 否則與修前同一節點`)
            assert.ok(/v-if="lossyHint"/.test(tplOf(fn)), `${fn} 之無列可掛提示列須以 v-if 渲染`)
        }
    })

    it('SITE-ER-002-VeGrupBlngUsers／VePemiBlngGrups: doSave 以 putRefEntry 只改本群組／權限一項(不再以列上之 grups／pemis 重組、不再 isEqual); genItems 以 getRefState 解讀並以 getRefWarns 取警告; 儲存格之警告容器僅於 warnText 時渲染', function() {
        for (let [fn, kpNew, kp, self, col, fieldRow, u, field, tab, kind] of [['VeGrupBlngUsers', 'kpGrupNew', 'kpGrup', 'grup', 'grupsNames', 'grups', 'u', 'cgrups', 'vo.grups', 'warnKindGrup'], ['VePemiBlngGrups', 'kpPemiNew', 'kpPemi', 'pemi', 'pemisNames', 'pemis', 'g', 'cpemis', 'vo.pemis', 'warnKindPemi']]) {
            let lines = codeOf(fn)
            let d = methodBody(lines, 'doSave')
            assert.ok(d.includes(`if (putRefEntry(${kpNew}, ${kp}, get(vo, '${self}.name', ''), get(r, 'enable', ''), get(r, 'mode', ''), kpRawModes[kr])) {`), `${fn}.doSave 須以 putRefEntry(含該列快照之 rawModeMap)改寫`)
            assert.ok(d.includes('kpRawModes[kr] = getRawModeMap(kpRaw)') && d.indexOf('kpRawModes[kr] = getRawModeMap(kpRaw)') < d.indexOf('if (size(getKpLossy(kpRaw)) === 0) {'), `${fn}.doSave 須於有損檢查之解析處(同一份快照字串)為每列建 rawModeMap`)
            assert.ok(!/isEqual\(/.test(d), `${fn}.doSave 不得再以 isEqual 判定改寫`)
            assert.ok(!d.includes(`get(r, '${fieldRow}'`), `${fn}.doSave 不得再讀列上之 ${fieldRow}(經 fltKp* 篩過, 會丟棄懸空引用)`)
            let g = methodBody(lines, 'genItems')
            assert.ok(g.includes('let st = getRefState(v)'), `${fn}.genItems 須以 getRefState 解讀`)
            assert.ok(g.includes(`let resWarn = getRefWarns(${u}.${field}, ${tab})`) && g.includes(`getRefWarnText(resWarn, vo.$t, '${kind}')`), `${fn}.genItems 須以 getRefWarns 取警告`)
            let t = tplOf(fn)
            assert.ok(t.includes(`v-if="props.key==='${col}' && props.row.warnText"`) && t.includes(`v-else-if="props.key==='${col}'"`), `${fn} 之 ${col} 儲存格: 有 warnText 才渲染外層容器與圖示, 否則與修前同一 RelationChips 節點`)
        }
    })

    it('SITE-ER-004-VePemiBlngGrups: 模板把群組 id 傳給單列切換(enable／mode), 單列切換有 id 以 id 找列; 三個批次操作以 id 定位且 rowsEff 取自 getDisplayRows()(含 id; 群組表可有歷史同名)——同 VeGrupBlngUsers', function() {
        let t = fs.readFileSync(path.join(projRoot, 'src', 'components', 'VePemiBlngGrups.vue'), 'utf8')
        assert.strictEqual(t.split('showVePemiBlngGrupsToggleItemModeByName(props.row.name, item, props.row.id)').length - 1, 2, '兩處 RelationChips 之模式切換須傳 id')
        assert.ok(t.includes('@click="showVePemiBlngGrupsToggleItemEnableByName(props.row.name, props.row.id)"'), '勾選框須傳 id')
        let lines = codeOf('VePemiBlngGrups')
        assert.ok(methodBody(lines, 'showVePemiBlngGrupsToggleItemModeByName').includes("isestr(id) ? get(v, 'id', '') === id : get(v, 'name', '') === name"))
        assert.ok(methodBody(lines, 'showVePemiBlngGrupsToggleItemEnableByName').includes("isestr(id) ? get(v, 'id', '') === id : get(v, 'name', '') === name"))
        for (let m of ['showVePemiBlngGrupsToggleItemsEnableAllYes', 'showVePemiBlngGrupsToggleItemsEnableAllNo', 'showVePemiBlngGrupsToggleItemsEnableAllInv']) {
            let b = methodBody(lines, m)
            assert.ok(/kpRow\[r\.id\] = kr/.test(b) && /let kr = kpRow\[r\.id\]/.test(b) && !/kpRow\[r\.name\]/.test(b), `${m} 須以 r.id 定位`)
            assert.ok(/let rowsEff = vo\.getDisplayRows\(\)/.test(b) && !/getDisplayData\(/.test(b), `${m} 之 rowsEff 須取自 getDisplayRows()`)
        }
        let g = methodBody(lines, 'getDisplayRows')
        assert.ok(/getApi\(\)/.test(g) && /forEachNodeAfterFilterAndSort/.test(g) && /rows\.push\(node\.data\)/.test(g))
    })

    it('SITE-ER-003-VeCrules: show 以原字串 getRuleWarns 取衝突, ID 儲存格之警告節點僅於 warnText 時渲染', function() {
        let s = methodBody(codeOf('VeCrules'), 'show')
        assert.ok(s.includes('let resRule = getRuleWarns(crules)') && s.includes('getOwn(resRule.kpConflict, v.id, false) === true') && s.includes("fmtWarn(vo.$t('warnRuleConflict'), { names: [v.id] })"), 'VeCrules.show 須以 getRuleWarns 標示衝突列')
        assert.ok(tplOf('VeCrules').includes(ICON_NAME), 'VeCrules ID 儲存格: 有 warnText 才渲染圖示')
    })

})
