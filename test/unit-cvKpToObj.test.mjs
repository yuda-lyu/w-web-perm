//授權資料(cgrups／cpemis／crules)之共用解碼(規則帳本 R-AUTH-DECODE-01; 第 92 項①, 站點 35)
//
//受測: src/js/cvKpToArr.mjs(伺服端 getUserRules 與編輯器共用之唯一解碼: JSON5.parse 結果 → [{ name, … }])、
//  src/js/cvKpToObj.mjs(編輯器用: 陣列形式 → 以名稱為鍵之物件形式; 物件形式去掉值內 name; opt.hasMode 為 cgrups／cpemis 帶 mode 之資料)、src/js/getRuleEnable.mjs(與之搭配取啟用狀態).
//背景: 外部應用直接寫入「陣列形式」[{ "name": "A", "isActive": "y" }]，伺服端 getUserRules 相容並授權(UNIT-OI-006a)，五個編輯元件
//  (VeCrules／VeCgrups／VeCpemis／VeGrupBlngUsers／VePemiBlngGrups)依名稱為鍵查值，查不到陣列元素 → 顯示停用 → 存檔即撤銷有效授權.
//  外審(minimax#1、sol#4～#6)另指出: 缺 mode 之元素顯示啟用後存檔會補 OR 而增權、同名不同 mode 取末項會增權、物件值內 name 使關聯對話框改指另一項、crules 之鍵轉型.
//CO-0xx: 函數契約; DF-0xx: 與伺服端 getUserRules 之差分(同一份資料，伺服端授權 ⇔ 編輯器顯示啟用); PR-0xx: 窮舉性質(編輯器存檔前後之授權相等, 唯一例外為 getKpLossy 判定之有損格; 存檔模型為方案 A);
//SITE-AD-001: src 內每一處 JSON5.parse(授權資料) 皆分類(五元件已套、清單頁未套〔站點 37〕, 新增者即紅).
//
//授權合併規則(sgud/rule/rulebook.md R-AUTH-MERGE-00, 使用者 2026-10-21 裁示; 本檔 assertion 註解以「規則 N」指該條文之第 N 條):
//  規則 1: 每一項之值有勾=y, 給 n 或未給一律視同 n; 規則 2: 起點全部管理對象皆為 n;
//  規則 3: 先將所有 OR 項聯集(無 OR 時以第一個 AND 項為基底), 再與所有 AND 項交集(AND 項未列之對象視同 n);
//  規則 4: 結果與項目之儲存順序、物件鍵序、陣列元素序無關; 規則 5: isActive 為 n 之項不參與;
//  〔run05, R-PRINCIPLE-00 c／e／f〕mode 缺或非 OR／AND 之項視為 AND; 引用查無實體(懸空)者以其 mode 參與、內容全 n; 空字串名稱之引用照常(編輯器保留為鍵 "");
//  編輯器模型(存檔): 對話框之列 = 被引用表全部列 ∪ 啟用而查無列之引用(額外列, 原樣寫回); 名稱非字串之啟用元素無法表示 → getKpLossy 以 #序號 判定拒存.
//  連帶: 同一項(crules 陣列形式)重複列同名規則時所有列皆 y 才 y(與列序無關; 舊規則為後者覆蓋前者);
//  run02 之排序保護(keepKeyOrder／getKeyOrderLost／getKpWriteLost 與 getKpLossy 之 AND 相對順序判定)已隨規則 4 刪除, 本檔對應案例(KO／GL／WL／KL-003)隨之移除;
//  保留者唯「同名同時有效 OR 與 AND」一格(物件形式一個名稱只有一個 mode, 無法無損表示), 由 getKpLossy 判定, 編輯器拒存(R-AUTH-LOSSY-01); 加上「啟用而名稱非字串」(run05 f)一格.
//  〔run06〕原第三格「該層啟用項皆 mode 缺／非法 → 拒存」(ADR-035 決定 e)已放寬(使用者裁示, ADR-035 Update 2026-10-22): 方案 A(未改動之限制項原樣寫回原始 mode)使存檔前後授權相等, KL-007／PR-* 改為
//  不判有損且方案 A 存檔授權相等(照列寫出為合法 AND 之舊寫法 saveLike 仍保留為對照, 證明放寬仰賴方案 A); 往返之完整證明(直接編輯器／反向關聯對話框, 含系統管理者改動)見 unit-editorRows RT-LOSSY3-*.
//跑法: npx mocha test/unit-cvKpToObj.test.mjs --timeout 180000
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import JSON5 from 'json5'
import cvKpToArr from '../src/js/cvKpToArr.mjs'
import cvKpToObj from '../src/js/cvKpToObj.mjs'
import getRuleEnable from '../src/js/getRuleEnable.mjs'
import getOwn from '../src/js/getOwn.mjs'
import getKpLossy from '../src/js/getKpLossy.mjs'
import joinNames from '../src/js/joinNames.mjs'
import fmtLossyMsg from '../src/js/fmtLossyMsg.mjs'
import { getUserRules } from '../src/plugins/mShare.mjs'

const fdRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const HM = { hasMode: true }


describe('unit-cvKpToObj (授權資料共用解碼, R-AUTH-DECODE-01)', function() {

    it('CO-001 非陣列且無需修改 → 原樣回傳(同一參考): 物件形式、null、字串、數字、布林、undefined(hasMode 之純量值須轉換, 見 CO-011)', function() {
        let o = { A: 'y', B: { mode: 'OR', isActive: 'y' } }
        assert.strict.equal(cvKpToObj(o), o)
        let oM = { B: { mode: 'OR', isActive: 'y' }, C: { mode: 'AND', isActive: 'n' } }
        assert.strict.equal(cvKpToObj(oM, HM), oM)
        let np = Object.create(null)
        assert.strict.equal(cvKpToObj(np), np)
        for (let v of [null, undefined, 'y', 5, true]) {
            assert.strict.equal(cvKpToObj(v), v)
            assert.strict.equal(cvKpToObj(v, HM), v)
        }
    })

    it('CO-002 crules 陣列形式 → 以名稱為鍵之物件(無原型), 值為元素去掉 name; getRuleEnable 取得與伺服端一致之啟用狀態', function() {
        let kp = cvKpToObj(JSON5.parse('[{"name":"A","isActive":"y"},{"name":"B","isActive":"n"},{"name":"C"}]'))
        assert.strict.equal(Object.getPrototypeOf(kp), null)
        assert.strict.deepEqual(Object.keys(kp), ['A', 'B', 'C'])
        assert.strict.deepEqual({ ...kp.A }, { isActive: 'y' })
        assert.strict.equal(getRuleEnable(kp, 'A'), 'y')
        assert.strict.equal(getRuleEnable(kp, 'B'), 'n')
        assert.strict.equal(getRuleEnable(kp, 'C'), 'n', '元素無 isActive → 停用')
        assert.strict.equal(getRuleEnable(kp, 'D'), 'n', '不在其中 → 停用')
    })

    it('CO-003 crules 之鍵轉型同伺服端 kpRule[vv.name]: 數字／布林／null／陣列／物件 name 與非物件元素(索引名稱)皆依 JS 屬性鍵轉型取鍵', function() {
        let kp = cvKpToObj(['y', { name: 5, isActive: 'y' }, { name: true, isActive: 'y' }, { name: null, isActive: 'y' }, { name: ['T1'], isActive: 'y' }, { name: {}, isActive: 'y' }, { isActive: 'y' }, { name: 'OK', isActive: 'y' }])
        //元素 0 為字串 → 名稱為索引 → '0'; 元素 6 為無 name 之物件 → 名稱為索引 → '6'; 其餘依 name 轉型
        assert.strict.deepEqual(Object.keys(kp).sort(), ['0', '5', '6', 'OK', 'T1', '[object Object]', 'null', 'true'].sort(), '鍵集合')
        assert.strict.equal(getRuleEnable(kp, '0'), 'y')
        assert.strict.equal(getRuleEnable(kp, 'T1'), 'y')
    })

    it('CO-004 hasMode(cgrups／cpemis) run05 f: 名稱為字串者保留(含空字串 "": 伺服端 findRefRows 與名稱為 "" 之列相符, 否則為懸空——丟棄即改變授權); 名稱非字串(含元素非物件之索引名稱)者物件形式無法表示而略過, 啟用者由 getKpLossy 以 #序號 判定並拒存', function() {
        let arr = ['G', 5, null, true, [], {}, { mode: 'OR', isActive: 'y' }, { name: 5, mode: 'OR', isActive: 'y' }, { name: true, mode: 'OR', isActive: 'y' }, { name: null, mode: 'OR', isActive: 'y' }, { name: ['G1'], mode: 'OR', isActive: 'y' }, { name: {}, mode: 'OR', isActive: 'y' }, { name: '', mode: 'OR', isActive: 'y' }, { name: 'OK', mode: 'OR', isActive: 'y' }]
        let kp = cvKpToObj(arr, HM)
        assert.strict.deepEqual(Object.keys(kp), ['', 'OK'])
        assert.strict.deepEqual({ ...kp[''] }, { mode: 'OR', isActive: 'y' }, '空字串名稱保留為鍵 ""')
        assert.strict.deepEqual(getKpLossy(arr), ['#7', '#8', '#9', '#10', '#11', '#12'], '啟用而名稱非字串之元素(第 7～12 個)→ 拒存; 非物件元素(isActive 非 y)不計')
        assert.strict.deepEqual(Object.keys(cvKpToObj([], HM)), [])
    })

    it('CO-005 hasMode run05 e: isActive 為 y 而 mode 缺漏或不合法(含小寫 or、數字、null)者解碼為 mode AND(isActive 仍為 y; 與伺服端視為 AND 同解讀——改為停用會丟掉 AND 限制而放寬, 補預設 OR 則多給); 陣列與物件形式一致', function() {
        for (let m of [undefined, null, 'or', 'Or', '', 'AND ', 1, true, 'XOR']) {
            let a = { name: 'G1', isActive: 'y', ...(m === undefined ? {} : { mode: m }) }
            let o = { isActive: 'y', ...(m === undefined ? {} : { mode: m }) }
            assert.strict.deepEqual({ ...getOwn(cvKpToObj([a], HM), 'G1') }, { isActive: 'y', mode: 'AND' }, `陣列 mode=${String(m)}`)
            assert.strict.deepEqual({ ...getOwn(cvKpToObj({ G1: o }, HM), 'G1') }, { isActive: 'y', mode: 'AND' }, `物件 mode=${String(m)}`)
            //停用者 mode 不變(不參與合併)
            assert.strict.equal(getOwn(cvKpToObj({ G1: { ...o, isActive: 'n' } }, HM), 'G1').isActive, 'n')
        }
        //合法 mode 且 y → 保留; n 者不變
        assert.strict.deepEqual({ ...getOwn(cvKpToObj([{ name: 'G1', mode: 'AND', isActive: 'y' }], HM), 'G1') }, { mode: 'AND', isActive: 'y' })
        assert.strict.deepEqual({ ...getOwn(cvKpToObj([{ name: 'G1', mode: 'OR', isActive: 'n' }], HM), 'G1') }, { mode: 'OR', isActive: 'n' })
        //crules(不帶 hasMode)不看 mode
        assert.strict.equal(getRuleEnable(cvKpToObj([{ name: 'A', isActive: 'y' }]), 'A'), 'y')
    })

    it('CO-011 hasMode 物件形式之純量值(舊式簡寫 { G1: "y" }): 解為 { isActive: 值 }, 值為 "y" 者另加 mode AND(與伺服端 cvKpToArr 之 { isActive: 值 }、無 mode 同解讀); 回傳新物件(無原型), 不改動輸入; 不帶 hasMode(crules)時純量值原樣', function() {
        let src = { G1: 'y', G2: 'n', G3: 5, G4: {}, G5: { mode: 'OR', isActive: 'y' } }
        let kp = cvKpToObj(src, HM)
        assert.strict.notEqual(kp, src)
        assert.strict.equal(Object.getPrototypeOf(kp), null)
        assert.strict.deepEqual({ ...kp.G1 }, { isActive: 'y', mode: 'AND' })
        assert.strict.deepEqual({ ...kp.G2 }, { isActive: 'n' })
        assert.strict.deepEqual({ ...kp.G3 }, { isActive: 5 })
        assert.strict.deepEqual({ ...kp.G4 }, { isActive: {} }, '空物件(iseobj 為 false)亦為純量值: 伺服端解為 isActive:{}(停用)')
        assert.strict.deepEqual({ ...kp.G5 }, { mode: 'OR', isActive: 'y' })
        assert.strict.equal(src.G1, 'y', '不改動輸入')
        //伺服端解讀一致: cvKpToArr 之 isActive 與 mode
        assert.strict.deepEqual(cvKpToArr({ G1: 'y' }), [{ name: 'G1', isActive: 'y' }])
        //crules(不帶 hasMode): 純量值即規則值, 原樣(同一參考)
        let rules = { T1: 'y', T2: 'n' }
        assert.strict.equal(cvKpToObj(rules), rules)
        assert.strict.equal(getRuleEnable(cvKpToObj(rules), 'T1'), 'y')
    })

    it('CO-006 同名重複: crules 所有列皆 y 才 y(任一列非 y 即 n, 與列序無關; 編輯器與伺服端 mergeRules 一致); hasMode 以「有效啟用元素」為準——模式一致合為一個啟用項, AND／OR 並存時保留 AND 支, 無有效啟用元素時為 n', function() {
        //crules 同名重複列: 每一列為一個「項值」; 規則 1(只有 y 才是 y, 其餘視同 n)＋規則 4(與列序無關) ⇒ 所有列皆 y 才 y(舊規則為後者覆蓋前者, 結果隨列序而異)
        //undefined 代表該列無 isActive(未給 ⇒ n)
        let mk = (name, isActive) => (isActive === undefined ? { name } : { name, isActive })
        let srv = (arr, id) => {
            let r = getUserRules({ cgrups: `{"G1":${ON}}` }, [{ name: 'G1', cpemis: `{"P1":${ON}}` }], [{ name: 'P1', crules: JSON.stringify(arr) }], [{ id }])
            return r.rules[0].isActive
        }
        let dup = [
            [['y', 'y'], 'y'], //全 y
            [['y', 'y', 'y'], 'y'],
            [['y', 'n'], 'n'], //任一列 n
            [['n', 'y'], 'n'], //與列序無關(上一列之反序)
            [['n', 'n'], 'n'],
            [['y', 'y', 'n'], 'n'],
            [['n', 'y', 'y'], 'n'],
            [['y', 'n', 'y'], 'n'],
            [['y', 'yes'], 'n'], //非 y 之值視同 n(規則 1)
            [['yes', 'y'], 'n'],
            [['y', undefined], 'n'], //未給 ⇒ n(規則 1)
            [[undefined, 'y'], 'n'],
        ]
        for (let [seq, exp] of dup) {
            for (let s of [seq, [...seq].reverse()]) {
                let arr = s.map((a) => mk('A', a))
                assert.strict.equal(getRuleEnable(cvKpToObj(arr), 'A'), exp, `編輯器 ${JSON.stringify(arr)}`)
                assert.strict.equal(srv(arr, 'A'), exp, `伺服端 ${JSON.stringify(arr)}`)
            }
        }
        //不同名稱互不影響: A 重複列混合、B 全 y
        let c = cvKpToObj([{ name: 'A', isActive: 'y' }, { name: 'A', isActive: 'n' }, { name: 'B', isActive: 'y' }, { name: 'B', isActive: 'y' }])
        assert.strict.equal(getRuleEnable(c, 'A'), 'n')
        assert.strict.equal(getRuleEnable(c, 'B'), 'y')
        //hasMode: 同名重複以「有效啟用元素」為準
        let g = cvKpToObj([
            { name: 'S1', mode: 'OR', isActive: 'y' }, { name: 'S1', mode: 'OR', isActive: 'n' }, //一啟用一停用 → 啟用(OR)
            { name: 'S2', mode: 'AND', isActive: 'y' }, { name: 'S2', mode: 'AND', isActive: 'y' }, //模式一致 → 啟用(AND)
            { name: 'C1', mode: 'OR', isActive: 'y' }, { name: 'C1', mode: 'AND', isActive: 'y' }, //AND 與 OR 並存 → 保留 AND 支
            { name: 'N1', mode: 'OR', isActive: 'n' }, { name: 'N1', isActive: 'y' }, //run05 e: 缺 mode 之啟用元素視為 AND → 啟用(AND)
            { name: 'N2', mode: 'OR', isActive: 'n' }, { name: 'N2', mode: 'AND', isActive: 'n' }, //無啟用元素 → n
        ], HM)
        assert.strict.deepEqual({ ...g.S1 }, { mode: 'OR', isActive: 'y' })
        assert.strict.deepEqual({ ...g.S2 }, { mode: 'AND', isActive: 'y' })
        assert.strict.deepEqual({ ...g.C1 }, { mode: 'AND', isActive: 'y' })
        assert.strict.deepEqual({ ...g.N1 }, { mode: 'AND', isActive: 'y' })
        assert.strict.equal(g.N2.isActive, 'n')
    })

    it('CO-007 物件形式: 值內 name 不得改名(外層鍵為名, R-AUTH-PATH-01)——去掉值內 name; 無需修改者仍同一參考', function() {
        let o = { G1: { name: 'G2', mode: 'OR', isActive: 'y' }, G3: { mode: 'AND', isActive: 'y' } }
        let r = cvKpToObj(o, HM)
        assert.strict.deepEqual(Object.keys(r), ['G1', 'G3'])
        assert.strict.deepEqual({ ...r.G1 }, { mode: 'OR', isActive: 'y' })
        assert.strict.ok('name' in o.G1, '不改動輸入')
        let ok = { G1: { mode: 'OR', isActive: 'y' } }
        assert.strict.equal(cvKpToObj(ok, HM), ok)
        //crules 物件值亦同
        assert.strict.deepEqual({ ...cvKpToObj({ T1: { name: 'T2', isActive: 'y' } }).T1 }, { isActive: 'y' })
    })

    it('CO-008 原型鍵名(__proto__、constructor、toString、hasOwnProperty)與含 . [ 之名稱為一般鍵, 自有屬性精確取值(R-KEY-01／R-AUTH-PATH-01)', function() {
        let names = ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'A.0', 'A[0]', 'a.b']
        let kp = cvKpToObj(names.map((n) => ({ name: n, isActive: 'y', mode: 'OR' })), HM)
        assert.strict.deepEqual(Object.keys(kp), names)
        for (let n of names) {
            assert.strict.equal(getOwn(getOwn(kp, n), 'isActive'), 'y', n)
            assert.strict.equal(getOwn(kp, n).mode, 'OR', n)
        }
        let kpr = cvKpToObj(names.map((n) => ({ name: n, isActive: 'y' })))
        for (let n of names) {
            assert.strict.equal(getRuleEnable(kpr, n), 'y', n)
        }
        assert.strict.equal(getRuleEnable(kpr, 'A'), 'n', '只授權 A.0 時 A 不得因路徑解析而啟用')
        assert.strict.equal(getRuleEnable(cvKpToObj([{ name: 'A', isActive: 'y' }]), 'A.0'), 'n', '只授權 A 時 A.0 不得啟用')
    })

    it('CO-009 cvKpToArr: 物件形式以外層鍵為名(值內 name 不得改名)、陣列形式元素之 name 即名稱; 非物件值 → { name, isActive: 值 }', function() {
        assert.strict.deepEqual(cvKpToArr({ A: 'y', B: { name: 'X', isActive: 'y' }, C: { mode: 'OR', isActive: 'n' } }), [
            { name: 'A', isActive: 'y' },
            { name: 'B', isActive: 'y' },
            { name: 'C', mode: 'OR', isActive: 'n' },
        ])
        assert.strict.deepEqual(cvKpToArr([{ name: 'A', isActive: 'y' }, 'z']), [{ name: 'A', isActive: 'y' }, { name: 1, isActive: 'z' }])
        assert.strict.deepEqual(cvKpToArr(null), [])
        assert.strict.deepEqual(cvKpToArr('abc'), [])
    })


    it('CO-010 hasMode 陣列形式之鍵序 = 名稱首次出現之序(僅供顯示); 鍵序與元素序不影響授權(規則 4; 以 getUserRules 實證)', function() {
        //鍵序: 名稱首次出現之序——停用在前者、無有效啟用元素者亦照首次出現序(舊: 有效啟用元素排前面, 隨保序機制刪除而不再如此)
        let kp = cvKpToObj([
            { name: 'G1', mode: 'AND', isActive: 'n' }, //停用: 仍依首次出現序排第一
            { name: 'G9', isActive: 'y' }, //缺 mode: run05 e 視為 AND(啟用)
            { name: 'G2', mode: 'AND', isActive: 'y' },
            { name: 'G1', mode: 'AND', isActive: 'y' },
            { name: 'G2', mode: 'AND', isActive: 'y' },
        ], HM)
        assert.strict.deepEqual(Object.keys(kp), ['G1', 'G9', 'G2'])
        assert.strict.equal(kp.G1.isActive, 'y', 'G1 有一個有效啟用元素 → 啟用')
        assert.strict.deepEqual({ ...kp.G9 }, { isActive: 'y', mode: 'AND' }, 'G9 缺 mode → 啟用、AND(run05 e)')
        //物件形式維持原鍵序
        assert.strict.deepEqual(Object.keys(cvKpToObj({ B: { name: 'x', mode: 'OR', isActive: 'y' }, A: { mode: 'OR', isActive: 'n' } }, HM)), ['B', 'A'])

        //規則 4: 同一組項目不論陣列元素序、物件鍵序, 授權相同; 規則 3: 結果 = (所有 OR 聯集) ∩ (所有 AND)
        //4 個群組各含一個權限(OR): G1→{T1,T2}、G2→{T2,T3}、G3→{T2}、G4→{T3}
        let perms = (a) => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p])))
        let gs = ['G1', 'G2', 'G3', 'G4'].map((n, i) => ({ name: n, cpemis: `{"P${i + 1}":${ON}}` }))
        let ps = [{ T1: 'y', T2: 'y' }, { T2: 'y', T3: 'y' }, { T2: 'y' }, { T3: 'y' }].map((r, i) => ({ name: `P${i + 1}`, crules: JSON.stringify(r) }))
        let ts = [{ id: 'T1' }, { id: 'T2' }, { id: 'T3' }]
        let ys = (cgrups) => getUserRules({ cgrups }, gs, ps, ts).rules.filter((v) => v.isActive === 'y').map((v) => v.name).join(',')
        let items = (s) => s.split(' ').map((x) => ({ name: x.slice(0, 2), mode: x.slice(2) === 'a' ? 'AND' : 'OR', isActive: 'y' }))
        let table = [
            ['G1a G2a', 'T2'], //AND×2: {T1,T2}∩{T2,T3}(舊規則依先後得 T1,T2 或 T2,T3)
            ['G1a G2a G3a', 'T2'], //AND×3
            ['G3o G1a G2a', 'T2'], //OR {T2} 為基底, 再交集兩個 AND
            ['G1o G2o', 'T1,T2,T3'], //OR×2: 聯集
            ['G1o G2a G3a', 'T2'], //{T1,T2}∩{T2,T3}∩{T2}
            ['G4o G1o G2a', 'T2,T3'], //({T3}∪{T1,T2})∩{T2,T3}
            ['G1a G4a', ''], //AND×2 無交集: {T1,T2}∩{T3} = ∅(不得因先後而殘留 G1 獨有之 T1、T2)
        ]
        let nPerm = 0
        for (let [s, exp] of table) {
            let its = items(s)
            for (let p of perms(its)) {
                nPerm++
                assert.strict.equal(ys(JSON.stringify(p)), exp, `陣列元素序 ${JSON.stringify(p.map((x) => x.name + x.mode))}`)
                let o = {}
                for (let x of p) {
                    o[x.name] = { mode: x.mode, isActive: x.isActive }
                }
                assert.strict.equal(ys(JSON.stringify(o)), exp, `物件鍵序 ${Object.keys(o).join(',')}`)
                //編輯器解碼後寫出(JSON.stringify(cvKpToObj(…))): 不論來源元素序, 授權不變
                assert.strict.equal(ys(JSON.stringify(cvKpToObj(p, HM))), exp, `解碼後寫出 ${JSON.stringify(p.map((x) => x.name + x.mode))}`)
            }
        }
        assert.strict.equal(nPerm, 2 + 6 + 6 + 2 + 6 + 6 + 2, '對照組: 7 組項目的全部排列數(2!×3 + 3!×4), 確實走過多種排列')
    })

    it('FM-001 fmtLossyMsg: 名稱含 $&、$$、$ 接單引號、$ 接反引號等字樣時原樣代入(不被 String.replace 展開); 範本無 {names} 時原樣; 超過 5 個加省略號', function() {
        let tpl = 'Not saved: {names} end'
        let bt = '$' + String.fromCharCode(96)
        assert.strict.equal(fmtLossyMsg(tpl, ['$&']), 'Not saved: $& end')
        assert.strict.equal(fmtLossyMsg(tpl, ['$$']), 'Not saved: $$ end')
        let sq = '$' + String.fromCharCode(39)
        assert.strict.equal(fmtLossyMsg(tpl, [sq]), 'Not saved: ' + sq + ' end')
        assert.strict.equal(fmtLossyMsg(tpl, [bt]), 'Not saved: ' + bt + ' end')
        assert.strict.equal(fmtLossyMsg(tpl, ['a', 'b']), 'Not saved: a, b end')
        assert.strict.equal(fmtLossyMsg('no placeholder', ['a']), 'no placeholder')
        assert.strict.equal(fmtLossyMsg(tpl, ['1', '2', '3', '4', '5', '6']), 'Not saved: 1, 2, 3, 4, 5 … end')
    })

    it('KL-001 getKpLossy: 每個名稱有合法 mode 之物件形式、null、字串、數字、空陣列、無啟用元素之陣列 → 空陣列(啟用項皆 mode 非法之格見 KL-007)', function() {
        for (let kp of [{ A: { mode: 'OR', isActive: 'y' }, B: { mode: 'AND', isActive: 'y' } }, null, undefined, 'x', 5, true, [], [{ name: 'A', mode: 'OR', isActive: 'n' }], [{ name: 'A', isActive: 'n' }]]) {
            assert.strict.deepEqual(getKpLossy(kp), [], JSON.stringify(kp))
        }
    })

    it('KL-007 getKpLossy 第三格已放寬(run06 使用者裁示, ADR-035 Update 2026-10-22): 該層啟用項皆 mode 缺或非法(陣列、物件、純量值 {"G1":"y"} 皆然)→ 不判有損(回空陣列; 缺漏提示仍由 getAuthWarn 之 modeInvalid 警告圖示承擔); 第一格(同名 OR 與限制項並存)與第二格(名稱非字串之限制項)不受影響; 放寬之依據: 方案 A 原樣寫回使存檔前後授權不變, 而照列硬寫為合法 AND(方案 A 之前)會多給', function() {
        let L = (kp) => getKpLossy(kp)
        //放寬: 以下六格於放寬前回傳這些名稱(拒存), 現回空陣列
        assert.strict.deepEqual(L([{ name: 'A', isActive: 'y' }]), [], '單一缺 mode')
        assert.strict.deepEqual(L([{ name: 'G1', mode: 'or', isActive: 'y' }, { name: 'G2', mode: 'XOR', isActive: 'y' }, { name: 'G3', mode: 'OR', isActive: 'n' }]), [], '多個限制項(合法者停用)')
        assert.strict.deepEqual(L([{ name: 'G1', mode: 'or', isActive: 'y' }, { name: 'G1', mode: null, isActive: 'y' }]), [], '同名皆非法')
        assert.strict.deepEqual(L({ G1: { mode: 'or', isActive: 'y' } }), [], '物件形式')
        assert.strict.deepEqual(L({ G1: { isActive: 'y' }, G2: { mode: 'OR', isActive: 'n' } }), [], '物件形式, 合法者停用')
        assert.strict.deepEqual(L({ G1: 'y' }), [], '純量值(舊式簡寫)')
        //另有 mode 合法之啟用項(限制項與 AND 等價)、全停用: 本即不判
        assert.strict.deepEqual(L([{ name: 'A', isActive: 'y' }, { name: 'B', mode: 'OR', isActive: 'y' }]), [])
        assert.strict.deepEqual(L({ G1: 'y', G2: { mode: 'AND', isActive: 'y' } }), [])
        assert.strict.deepEqual(L([{ name: 'A', mode: 'or', isActive: 'n' }, { name: 'B', isActive: 'n' }]), [])
        assert.strict.deepEqual(L({ A: { mode: 'or', isActive: 'n' }, B: 'n' }), [])
        //不受放寬影響之格: 第二格(名稱非字串)以 #序號 判; 第一格(同名有效 OR 與限制項〔視為 AND〕並存)判
        assert.strict.deepEqual(L([{ mode: 'or', isActive: 'y' }]), ['#1'], '名稱非字串之限制項(無合法項)')
        assert.strict.deepEqual(L([{ name: 'A', mode: 'XOR', isActive: 'y' }, { mode: 'AND', isActive: 'y' }]), ['#2'], '合法項名稱非字串: 只判 #序號, 限制項 A 不判')
        assert.strict.deepEqual(L([{ name: 'G1', mode: 'OR', isActive: 'y' }, { name: 'G1', isActive: 'y' }]), ['G1'], '同名 OR 與缺 mode 並存')
        //伺服端與編輯器模型對照(放寬之依據): 上列放寬之格, 伺服端全 n; 方案 A 之前之寫法(照列寫出為合法 AND)授權(多給, 即放寬前拒存之理由); 方案 A(未改動之限制項原樣寫回)仍全 n(不多給)
        let gs = [{ name: 'G1', cpemis: `{"P1":${ON}}` }, { name: 'G2', cpemis: `{"P1":${ON}}` }, { name: 'A', cpemis: `{"P1":${ON}}` }]
        let ps = [{ name: 'P1', crules: '{"T":"y"}' }]
        let eff = (cgrups) => getUserRules({ cgrups }, gs, ps, [{ id: 'T' }]).rules[0].isActive
        for (let raw of ['[{"name":"A","isActive":"y"}]', '{"G1":{"mode":"or","isActive":"y"}}', '{"G1":"y"}', '[{"name":"G1","mode":"or","isActive":"y"},{"name":"G2","mode":"XOR","isActive":"y"}]']) {
            assert.strict.equal(eff(raw), 'n', `伺服端全 n: ${raw}`)
            assert.strict.equal(eff(saveLike(raw, ['G1', 'G2', 'A'])), 'y', `方案 A 之前之寫法硬寫會授權(多給): ${raw}`)
            assert.strict.equal(eff(saveLikeA(raw, ['G1', 'G2', 'A'])), 'n', `方案 A 原樣寫回: 存檔後仍全 n(不多給): ${raw}`)
        }
    })

    it('KL-002 getKpLossy: 同名啟用元素之有效模式同時為 OR 與 AND → 該名稱有損(run05 e: 缺 mode／非法視為 AND, 故 OR＋缺 mode 亦有損); 同模式重複、一邊停用、名稱不同 → 不是', function() {
        let L = (arr) => getKpLossy(arr).sort()
        assert.strict.deepEqual(L([{ name: 'G1', mode: 'OR', isActive: 'y' }, { name: 'G1', mode: 'AND', isActive: 'y' }]), ['G1'])
        assert.strict.deepEqual(L([{ name: 'G1', mode: 'AND', isActive: 'y' }, { name: 'G2', mode: 'AND', isActive: 'y' }, { name: 'G2', mode: 'OR', isActive: 'y' }]), ['G2'], 'sol R3#2')
        assert.strict.deepEqual(L([{ name: 'G1', mode: 'OR', isActive: 'y' }, { name: 'G1', mode: 'OR', isActive: 'y' }]), [])
        assert.strict.deepEqual(L([{ name: 'G1', mode: 'OR', isActive: 'y' }, { name: 'G1', mode: 'AND', isActive: 'n' }]), [])
        assert.strict.deepEqual(L([{ name: 'G1', mode: 'OR', isActive: 'y' }, { name: 'G1', isActive: 'y' }]), ['G1'], 'run05 e: 缺 mode 之啟用元素視為 AND → 與 OR 並存即有損')
        assert.strict.deepEqual(L([{ name: 'G1', mode: 'AND', isActive: 'y' }, { name: 'G1', mode: 'XOR', isActive: 'y' }]), [], 'AND 與非法(視為 AND)同模式 → 不是')
        assert.strict.deepEqual(L([{ name: 'G1', mode: 'OR', isActive: 'y' }, { name: 'G2', mode: 'AND', isActive: 'y' }]), [])
        assert.strict.deepEqual(L([{ name: 'G1', mode: 'OR', isActive: 'y' }, { name: 'G1', mode: 'or', isActive: 'y' }, { name: 'G1', mode: 'AND', isActive: 'y' }]), ['G1'])
    })

    it('KL-004 getKpLossy run05 f: 啟用而名稱非字串之元素(數字、null、陣列元素無 name、非物件元素 "y")→ 以 #序號(1 起算)判定有損(物件形式無法表示; 伺服端以懸空引用參與, 丟棄即放寬); 空字串名稱為一般名稱(同名 OR 與 AND 並存才有損); 停用或非 y 之非物件元素不計', function() {
        let a = (name) => ({ name, mode: 'AND', isActive: 'y' })
        let o = (name) => ({ name, mode: 'OR', isActive: 'y' })
        assert.strict.deepEqual(getKpLossy([a(2), o(2), a(''), o(''), a(null), o(null), 'x', 5, null]), ['', '#1', '#2', '#5', '#6'])
        assert.strict.deepEqual(getKpLossy([o(''), o('A')]), [], '空字串名稱單一模式 → 可原樣保留')
        assert.strict.deepEqual(getKpLossy(['y', { mode: 'AND', isActive: 'y' }, { name: 'A', isActive: 'y' }]), ['#1', '#2'], '非物件元素 "y"(名稱為索引)、無 name 之元素')
        assert.strict.deepEqual(getKpLossy([{ name: 3, mode: 'AND', isActive: 'n' }, 'n']), [], '停用者不計')
    })

    it('KL-005 getKpLossy: 回傳不重複之名稱陣列, 不改動輸入', function() {
        let arr = [{ name: 'G1', mode: 'OR', isActive: 'y' }, { name: 'G1', mode: 'AND', isActive: 'y' }, { name: 'G1', mode: 'OR', isActive: 'y' }]
        let before = JSON.stringify(arr)
        assert.strict.deepEqual(getKpLossy(arr), ['G1'])
        assert.strict.equal(JSON.stringify(arr), before)
    })

    it('KL-006 getKpLossy 不再判定 AND 名稱之相對順序(規則 4: 結果與順序無關; 原 KL-003 的格〔整數式名稱使伺服端序與物件鍵序不同〕全部回空陣列)', function() {
        //原 KL-003 判為有損之輸入: 有效 AND 名稱 ≥ 2 且其相對順序於「陣列元素序」與「JS 物件鍵序(整數式鍵先、遞增)」不同——規則 4 下兩種序的授權相同, 故不是有損
        let a = (name) => ({ name, mode: 'AND', isActive: 'y' })
        for (let arr of [
            [a('2'), a('1')],
            [a('G1'), a('1')],
            [a('2'), a('3'), a('1')],
            [a('1'), a('G'), a('2')],
            [a('G'), a('2'), a('1'), a('B')],
        ]) {
            assert.strict.deepEqual(getKpLossy(arr), [], JSON.stringify(arr))
        }
        //有損格唯一: 同名同時有效 OR 與 AND(KL-002); 名稱為整數式不改變此判定
        assert.strict.deepEqual(getKpLossy([a('2'), a('1'), { name: '1', mode: 'OR', isActive: 'y' }]), ['1'])
    })

    it('JN-001 joinNames: 逗號分隔, 超過上限者截斷並加省略號; 非字串轉字串; 空陣列為空字串', function() {
        assert.strict.equal(joinNames(['a', 'b']), 'a, b')
        assert.strict.equal(joinNames(['a', 'b', 'c', 'd', 'e', 'f', 'g']), 'a, b, c, d, e …')
        assert.strict.equal(joinNames(['a', 'b', 'c'], 2), 'a, b …')
        assert.strict.equal(joinNames([]), '')
        assert.strict.equal(joinNames([1, null]), '1, null')
        assert.strict.equal(joinNames('x'), '')
    })

    // ===== 差分: 同一份資料, 伺服端 getUserRules 授權 ⇔ 編輯器(cvKpToObj + getRuleEnable／getOwn)顯示啟用 =====

    let ON = '{"mode":"OR","isActive":"y"}'

    //crules: 伺服端對各標的之 isActive ⇔ 編輯器顯示
    let targets = ['A', 'B', 'C', '5', 'A.0', '0', '1', 'true', 'null', 'T1', '[object Object]'].map((id) => ({ id }))
    let serverRules = (crules) => {
        let user = { cgrups: `{"G1":${ON}}` }
        let r = getUserRules(user, [{ name: 'G1', cpemis: `{"P1":${ON}}` }], [{ name: 'P1', crules }], targets)
        return Object.fromEntries(r.rules.map((v) => [v.name, v.isActive]))
    }

    it('DF-001 crules 各種陣列形式: 伺服端授權之標的 = 編輯器顯示啟用之標的(含停用元素、同名重複列所有列皆 y 才 y〔與列序無關〕、數字／布林／null／陣列／物件 name、非物件元素、無 name 元素)', function() {
        let batt = [
            '[{"name":"A","isActive":"y"}]',
            '[{"name":"A","isActive":"y"},{"name":"B","isActive":"n"},{"name":"C","isActive":"y"}]',
            '[{"name":"A","isActive":"n"}]',
            '[{"name":"A"}]',
            '[{"name":"A","isActive":"y"},{"name":"A","isActive":"n"}]',
            '[{"name":"A","isActive":"n"},{"name":"A","isActive":"y"}]',
            '[{"name":"A","isActive":"y"},{"name":"A","isActive":"y"}]',
            '[{"name":"A","isActive":"y"},{"name":"A","isActive":"y"},{"name":"A","isActive":"n"}]',
            '[{"name":"A","isActive":"n"},{"name":"A","isActive":"y"},{"name":"A","isActive":"y"}]',
            '[{"name":"A.0","isActive":"y"}]',
            '[{"isActive":"y"},"A",5,null,{"name":"B","isActive":"y"}]',
            '[{"name":"A","isActive":"yes"},{"name":"B","isActive":true}]',
            '[{"name":5,"isActive":"y"},{"name":true,"isActive":"y"},{"name":null,"isActive":"y"}]',
            '[{"name":["T1"],"isActive":"y"},{"name":{},"isActive":"y"}]',
            '["y"]',
            '[{"isActive":"y"}]',
            '[]',
        ]
        let bad = []
        let nOn = 0
        for (let crules of batt) {
            let srv = serverRules(crules)
            let kp = cvKpToObj(JSON5.parse(crules))
            for (let t of targets) {
                let ed = getRuleEnable(kp, t.id)
                nOn += (srv[t.id] === 'y') ? 1 : 0
                if (srv[t.id] !== ed) {
                    bad.push(`${crules} 標的 ${t.id}: 伺服端 ${srv[t.id]}、編輯器 ${ed}`)
                }
            }
        }
        assert.strict.deepEqual(bad, [], bad.join('\n'))
        assert.strict.ok(nOn >= 12, `對照組: 伺服端授權之格數須夠多(含鍵轉型格), 實得 ${nOn}`)

        //絕對期望(差分只證明兩端一致, 兩端若同錯〔如皆為後者覆蓋〕仍會過): 同名重複列所有列皆 y 才 y(規則 1＋規則 4), 兩種列序皆然
        let exp = [
            ['[{"name":"A","isActive":"y"},{"name":"A","isActive":"n"}]', 'n'],
            ['[{"name":"A","isActive":"n"},{"name":"A","isActive":"y"}]', 'n'],
            ['[{"name":"A","isActive":"y"},{"name":"A","isActive":"y"}]', 'y'],
            ['[{"name":"A","isActive":"y"},{"name":"A","isActive":"y"},{"name":"A","isActive":"n"}]', 'n'],
            ['[{"name":"A","isActive":"n"},{"name":"A","isActive":"y"},{"name":"A","isActive":"y"}]', 'n'],
        ]
        for (let [crules, v] of exp) {
            assert.strict.equal(serverRules(crules).A, v, `伺服端 ${crules}`)
            assert.strict.equal(getRuleEnable(cvKpToObj(JSON5.parse(crules)), 'A'), v, `編輯器 ${crules}`)
        }
    })

    it('DF-002 crules 物件形式: 伺服端授權之標的 = 編輯器顯示啟用之標的(含值內 name)', function() {
        let batt = ['{"A":"y","B":"n"}', '{"A":{"isActive":"y"},"C":{"isActive":"n"}}', '{"A.0":"y"}', '{"A":{"name":"B","isActive":"y"}}', '{}']
        let bad = []
        for (let crules of batt) {
            let srv = serverRules(crules)
            let kp = cvKpToObj(JSON5.parse(crules))
            for (let t of targets) {
                if (srv[t.id] !== getRuleEnable(kp, t.id)) {
                    bad.push(`${crules} 標的 ${t.id}`)
                }
            }
        }
        assert.strict.deepEqual(bad, [], bad.join('\n'))
    })

    //cgrups: 伺服端使用者是否經群組 N 取得授權(群組表只有 N, 單一群組) ⇔ 編輯器顯示 N 啟用
    let groupNames = ['G1', 'G2', '5', 'G.0']
    let grantedByGroup = (cgrups) => {
        let out = {}
        for (let n of groupNames) {
            let r = getUserRules({ cgrups }, [{ name: n, cpemis: `{"P1":${ON}}` }], [{ name: 'P1', crules: '{"T":"y"}' }], [{ id: 'T' }])
            out[n] = r.rules[0].isActive === 'y'
        }
        return out
    }

    //編輯器模型(VeCgrups／VeCpemis 之讀法, 與 U1 src/js/editorRefRows.mjs 之 getRefState 同解讀; 本檔獨立寫出以交叉驗證):
    //  getOwn(cvKpToObj 之結果, 名稱) 之值——物件: isActive 為 y 者啟用, 啟用者之 mode 取有效值(OR 為 OR, 其餘 AND), 停用者 mode 合法則沿用否則 OR;
    //  純量(物件形式 { "G1": "y" }, cvKpToArr 解為 { isActive: 值 }): 視為 { isActive: 值 }; 無此名稱: 停用、OR
    let refState = (pv) => {
        let o = (pv !== null && typeof pv === 'object') ? pv : { isActive: pv }
        let on = getOwn(o, 'isActive', '') === 'y'
        let m = getOwn(o, 'mode', '')
        return { enable: on ? 'y' : 'n', mode: on ? (m === 'OR' ? 'OR' : 'AND') : ((m === 'OR' || m === 'AND') ? m : 'OR') }
    }

    //伺服端對「名稱 n 之引用」之解讀(只留名稱為 n 之元素; 群組 n 授予 {T}; 輔助群組 #H 內容為空、#H2 授予 {T,U}), 三個探針:
    //  p1 只有 n: T 為 y ⇔ n 以合法 mode 參與(唯一項即基底; 限制項〔mode 非法〕無合法項時全 n)
    //  p2 n＋#H(OR, 空): T 為 y ⇔ n 為 OR(AND／限制項時 OR 聯集為空)
    //  p3 n＋#H2(OR, {T,U}): U 為 n ⇔ n 以 AND 或限制項參與(交集收斂); OR 或不參與時 U 為 y
    //參與 ⇔ p1 或 p3 收斂; 編輯器: OR ⇔ p2, AND ⇔ p3 收斂(限制項顯示為 AND; 該層無合法項時存檔原樣寫回原始 mode, 不判有損, 見 KL-007)
    let serverRefView = (raw, n) => {
        let kp = JSON5.parse(raw)
        let only = Array.isArray(kp) ? kp.filter((e) => e !== null && typeof e === 'object' && e.name === n) : (Object.prototype.hasOwnProperty.call(kp, n) ? { [n]: kp[n] } : {})
        let plus = (h) => (Array.isArray(only) ? [...only, { name: h, mode: 'OR', isActive: 'y' }] : { ...only, [h]: { mode: 'OR', isActive: 'y' } })
        let gs = [{ name: n, cpemis: `{"P1":${ON}}` }, { name: '#H', cpemis: '{}' }, { name: '#H2', cpemis: `{"P2":${ON}}` }]
        let ps = [{ name: 'P1', crules: '{"T":"y"}' }, { name: 'P2', crules: '{"T":"y","U":"y"}' }]
        let ev = (c) => Object.fromEntries(getUserRules({ cgrups: JSON.stringify(c) }, gs, ps, [{ id: 'T' }, { id: 'U' }]).rules.map((v) => [v.name, v.isActive]))
        let p1 = ev(only)
        let p2 = ev(plus('#H'))
        let p3 = ev(plus('#H2'))
        let and = p3.U === 'n'
        return { on: p1.T === 'y' || and, or: p2.T === 'y', and }
    }

    it('DF-003 cgrups 陣列／物件形式 run05: 伺服端對每個名稱之解讀(參與與否、OR／AND)⇔ 編輯器顯示(啟用與否、mode)(含停用元素、缺 mode、不合法 mode、非字串 name、非物件元素、同名重複、值內 name、純量值); 同名同時 OR 與 AND 者由 getKpLossy 判定(拒存)', function() {
        let batt = [
            '[{"name":"G1","mode":"OR","isActive":"y"}]',
            '[{"name":"G1","mode":"AND","isActive":"y"},{"name":"G2","mode":"OR","isActive":"n"}]',
            '[{"name":"G1","mode":"OR","isActive":"n"}]',
            '[{"name":"G1","isActive":"y"}]',
            '[{"name":"G1","mode":"or","isActive":"y"},{"name":"G2","mode":"OR","isActive":"y"}]',
            '[{"name":5,"mode":"OR","isActive":"y"},{"mode":"OR","isActive":"y"}]',
            '["G1",5,null,{"name":"G2","mode":"OR","isActive":"y"}]',
            '[{"name":"G.0","mode":"OR","isActive":"y"}]',
            '[{"name":"G1","mode":"OR","isActive":"y"},{"name":"G1","mode":"OR","isActive":"n"}]',
            '[{"name":"G1","mode":"OR","isActive":"n"},{"name":"G1","mode":"OR","isActive":"y"}]',
            '[{"name":"G1","mode":"AND","isActive":"y"},{"name":"G1","mode":"AND","isActive":"y"}]',
            '{"G1":{"isActive":"y"}}',
            '{"G1":{"mode":"OR","isActive":"y"},"G2":{"mode":"xor","isActive":"y"}}',
            '{"G1":{"name":"G2","mode":"OR","isActive":"y"}}',
            '{"G1":"y"}',
            '[{"name":"G1","mode":"OR","isActive":"y"},{"name":"G1","isActive":"y"}]',
            '[{"name":"G1","mode":"XOR","isActive":"y"},{"name":"G2","mode":null,"isActive":"y"},{"name":"5","mode":1,"isActive":"y"}]',
        ]
        let bad = []
        let nOn = 0
        let nOr = 0
        let nAnd = 0
        let nLossy = 0
        for (let cgrups of batt) {
            let kpRaw = JSON5.parse(cgrups)
            let kp = cvKpToObj(kpRaw, HM)
            let lossy = getKpLossy(kpRaw)
            for (let n of groupNames) {
                let srv = serverRefView(cgrups, n)
                let ed = refState(getOwn(kp, n, null))
                nOn += srv.on ? 1 : 0
                if (srv.on !== (ed.enable === 'y')) {
                    bad.push(`${cgrups} 群組 ${n}: 伺服端參與 ${srv.on}、編輯器啟用 ${ed.enable}`)
                }
                if (!srv.on) {
                    continue
                }
                if (lossy.includes(n)) {
                    nLossy++ //同名 OR 與 AND 並存: 伺服端兩支皆參與(加輔助 OR 後仍授權), 物件形式無法表示 → 拒存
                    continue
                }
                if (srv.or === srv.and) {
                    bad.push(`${cgrups} 群組 ${n}: 伺服端解讀不唯一(OR ${srv.or}、AND ${srv.and})`)
                }
                nOr += srv.or ? 1 : 0
                nAnd += srv.and ? 1 : 0
                if ((srv.or ? 'OR' : 'AND') !== ed.mode) {
                    bad.push(`${cgrups} 群組 ${n}: 伺服端 ${srv.or ? 'OR' : 'AND'}、編輯器 ${ed.mode}`)
                }
            }
        }
        assert.strict.deepEqual(bad, [], bad.join('\n'))
        //純量 "y" 唯一項: 伺服端為限制項而該層無合法項 → 全 n(主責裁示); 編輯器顯示啟用(AND); 存檔原樣寫回原始 mode(方案 A), 不判有損(run06 放寬, 見 KL-007)
        assert.strict.equal(grantedByGroup('{"G1":"y"}').G1, false, '純量 "y" 唯一項 → 全 n')
        assert.strict.deepEqual(getKpLossy(JSON5.parse('{"G1":"y"}')), [])
        //對照組(本 batt 實得: 參與 19、OR 8、AND 10〔含限制項; 其中該層啟用項皆 mode 非法者為原第三格, run06 放寬後不再入有損而入此欄: 伺服端解讀為限制項〔交集收斂〕＝ 編輯器 AND〕、有損 1〔同名 OR＋AND〕)
        assert.strict.ok(nOn >= 12 && nOr >= 4 && nAnd >= 8 && nLossy >= 1, `對照組: 參與 ${nOn}、OR ${nOr}、AND ${nAnd}、有損 ${nLossy} 皆須出現`)
    })

    it('DF-004 cgrups 陣列形式之 mode 保留: 編輯器顯示之 mode = 元素之 mode(AND／OR), 存出後伺服端以相同 mode 合併(mode 影響授權: 改為 OR 結果不同)', function() {
        let cgrups = '[{"name":"G1","mode":"AND","isActive":"y"},{"name":"G2","mode":"AND","isActive":"y"}]'
        let kp = cvKpToObj(JSON5.parse(cgrups), HM)
        assert.strict.equal(getOwn(kp, 'G1').mode, 'AND')
        //編輯器存出(VeCgrups.doSave 之形式: { name: { mode, isActive } })後, 伺服端評估結果與原陣列形式相同
        let saved = {}
        for (let n of ['G1', 'G2']) {
            saved[n] = { mode: getOwn(kp, n).mode, isActive: getOwn(kp, n).isActive }
        }
        let gs = [{ name: 'G1', cpemis: `{"P1":${ON}}` }, { name: 'G2', cpemis: `{"P2":${ON}}` }]
        let ps = [{ name: 'P1', crules: '{"T1":"y","T2":"y"}' }, { name: 'P2', crules: '{"T2":"y","T3":"y"}' }]
        let ts = [{ id: 'T1' }, { id: 'T2' }, { id: 'T3' }]
        let before = getUserRules({ cgrups }, gs, ps, ts).rules
        let after = getUserRules({ cgrups: JSON.stringify(saved) }, gs, ps, ts).rules
        assert.strict.deepEqual(after, before)
        assert.strict.ok(before.some((v) => v.isActive === 'y') && before.some((v) => v.isActive === 'n'), '對照組: 授權結果非全 y 亦非全 n(AND 合併有實質作用), 比對才有意義')
        let asOr = getUserRules({ cgrups: JSON.stringify({ G1: { mode: 'OR', isActive: 'y' }, G2: { mode: 'OR', isActive: 'y' } }) }, gs, ps, ts).rules
        assert.strict.notDeepEqual(asOr, before)
    })

    it('DF-005 同名重複(cgrups): 模式一致時與伺服端等價(含一啟用一停用); AND 與 OR 並存時伺服端合併兩支、物件形式無法無損表示 → 保留 AND 支(存檔後授權不增; sol#4 夾具; 限制固定於此)', function() {
        let gs = [{ name: 'G1', cpemis: `{"P1":${ON}}` }, { name: 'G2', cpemis: `{"P2":${ON}}` }]
        let ps = [{ name: 'P1', crules: '{"T1":"y","T2":"n"}' }, { name: 'P2', crules: '{"T1":"n","T2":"y"}' }]
        let ts = [{ id: 'T1' }, { id: 'T2' }]
        let eff = (cgrups) => Object.fromEntries(getUserRules({ cgrups }, gs, ps, ts).rules.map((v) => [v.name, v.isActive]))
        //sol#4 夾具: [G1/AND, G1/OR, G2/OR]——伺服端 G1 的 AND 支另行合併, 結果只 T1; 若取末項(OR)轉存則 T1、T2 皆 y(增權)
        let arr = '[{"name":"G1","mode":"AND","isActive":"y"},{"name":"G1","mode":"OR","isActive":"y"},{"name":"G2","mode":"OR","isActive":"y"}]'
        let before = eff(arr)
        let kp = cvKpToObj(JSON5.parse(arr), HM)
        assert.strict.deepEqual({ ...getOwn(kp, 'G1') }, { mode: 'AND', isActive: 'y' }, 'AND 與 OR 並存 → 保留 AND 支')
        let saved = {}
        for (let n of ['G1', 'G2']) {
            let p = getOwn(kp, n)
            saved[n] = { mode: p.mode === 'AND' ? 'AND' : 'OR', isActive: p.isActive === 'y' ? 'y' : 'n' }
        }
        let after = eff(JSON.stringify(saved))
        for (let k of Object.keys(after)) {
            assert.strict.ok(!(after[k] === 'y' && before[k] !== 'y'), `不得增權: ${k} 修前 ${before[k]} 修後 ${after[k]}`)
        }
        //對照: 若取末項(OR)轉存(sol#4 指出之舊作法)則 T2 由 n 變 y(增權); 若改為停用該名稱亦增權(移除 AND 限制)——故保留 AND 支
        let asLast = eff(JSON.stringify({ G1: { mode: 'OR', isActive: 'y' }, G2: { mode: 'OR', isActive: 'y' } }))
        assert.strict.ok(asLast.T2 === 'y' && before.T2 !== 'y', '對照組: 取末項會增權')
        let asOff = eff(JSON.stringify({ G1: { mode: 'OR', isActive: 'n' }, G2: { mode: 'OR', isActive: 'y' } }))
        assert.strict.ok(asOff.T2 === 'y' && before.T2 !== 'y', '對照組: 停用該名稱亦增權(AND 為限制)')
        //模式一致: 與伺服端等價
        for (let a of ['[{"name":"G1","mode":"OR","isActive":"y"},{"name":"G1","mode":"OR","isActive":"n"}]', '[{"name":"G1","mode":"OR","isActive":"n"},{"name":"G1","mode":"OR","isActive":"y"}]', '[{"name":"G1","mode":"AND","isActive":"y"},{"name":"G1","mode":"AND","isActive":"y"}]']) {
            let k2 = cvKpToObj(JSON5.parse(a), HM)
            assert.strict.equal(getOwn(k2, 'G1').isActive, 'y', a)
            assert.strict.deepEqual(eff(JSON.stringify({ G1: { mode: getOwn(k2, 'G1').mode, isActive: 'y' } })), eff(a), a)
        }
    })

    it('DF-006 缺 mode 之群組元素 run05 e: 伺服端視為 AND 參與、編輯器顯示啟用且 mode 為 AND、存檔後授權不變(陣列、物件、純量三種形式一致; 修前為「不授權、顯示停用」, run04 之前物件形式顯示啟用而存檔補 OR 增權)', function() {
        let gs = [{ name: 'G1', cpemis: `{"P1":${ON}}` }, { name: 'G2', cpemis: `{"P2":${ON}}` }]
        let ps = [{ name: 'P1', crules: '{"T1":"y"}' }, { name: 'P2', crules: '{"T1":"y","T2":"y"}' }]
        let ts = [{ id: 'T1' }, { id: 'T2' }]
        let eff = (cgrups) => getUserRules({ cgrups }, gs, ps, ts).rules.map((v) => `${v.name}=${v.isActive}`).join(',')
        for (let cgrups of ['[{"name":"G1","isActive":"y"},{"name":"G2","mode":"OR","isActive":"y"}]', '{"G1":{"isActive":"y"},"G2":{"mode":"OR","isActive":"y"}}', '{"G1":"y","G2":{"mode":"OR","isActive":"y"}}']) {
            assert.strict.equal(eff(cgrups), 'T1=y,T2=n', `${cgrups}: G2(OR){T1,T2} ∩ G1(缺 mode → AND){T1}`)
            let kp = cvKpToObj(JSON5.parse(cgrups), HM)
            assert.strict.deepEqual(refState(getOwn(kp, 'G1', null)), { enable: 'y', mode: 'AND' }, cgrups)
            //存檔(編輯器模型: 對話框列 → { 名稱: { mode, isActive } })後授權不變——若顯示停用或補 OR, 存檔即放寬為 T1、T2
            assert.strict.equal(eff(saveLike(cgrups, ['G1', 'G2'])), 'T1=y,T2=n', `存檔後 ${cgrups}`)
            assert.strict.equal(eff('{"G1":{"mode":"OR","isActive":"n"},"G2":{"mode":"OR","isActive":"y"}}'), 'T1=y,T2=y', '對照組: 若存成停用則放寬')
        }
    })


    // ===== 窮舉性質(R-AUTH-MERGE-00／R-AUTH-LOSSY-01): 編輯器存檔前後之授權相等, 唯一例外為 getKpLossy 判定之有損格(同名 OR／AND、名稱非字串); 且與陣列元素序／對話框列序無關 =====

    //受測存檔模擬＝編輯器模型(run05; 同 VeCgrups／VeCpemis.doSave 的資料流, 與 U1 之實作一致; saveLikeA 為含方案 A 之編輯器實際存檔模型): 解碼(cvKpToObj hasMode) → 對話框之列 =
    //  (被引用表之全部列, 狀態取 refState) ∪ (啟用而名稱不在表中之引用〔懸空, 含名稱 ""〕, 各一列原樣保留其有效 mode; R-PRINCIPLE-00 c／f: 丟棄即改變授權)
    //  → 寫出 { 名稱: { mode, isActive } }(JSON.stringify; 物件鍵序 = 列序. 不保序: 規則 4, 結果與鍵序無關).
    //名稱非字串之啟用元素物件形式無法表示, 由 getKpLossy 判定(拒存), 此處不寫出
    //keepLim(方案 A, run05 外審後採納, R-EDIT-KEEP-01; run06 第三格放寬之依據): 「未被系統管理者改動」之限制項(該名稱所有啟用元素皆 mode 缺／非法, 列仍為啟用 AND)原樣寫回其原始 mode(缺則不寫 mode 鍵);
    //  不給(預設)＝照列寫出, 為方案 A 之前之寫法(限制項被寫成合法 AND, 該層無合法項時成為唯一基底而多給). 本檔獨立寫出(不經 editorRefRows)以交叉驗證; 往返之完整證明見 unit-editorRows RT-LOSSY3-*
    let saveLike = (raw, names, keepLim = false) => {
        let kp = cvKpToObj(JSON5.parse(raw), HM)
        let rows = names.map((n) => ({ name: n, ...refState(getOwn(kp, n, null)) }))
        if (kp !== null && typeof kp === 'object' && !Array.isArray(kp)) {
            Object.keys(kp).forEach((k) => {
                let st = refState(kp[k])
                if (!names.includes(k) && st.enable === 'y') {
                    rows.push({ name: k, ...st })
                }
            })
        }
        let lim = Object.create(null) //限制項名稱 → 原始 mode(取該名稱第一個啟用元素)
        if (keepLim) {
            let byName = Object.create(null)
            cvKpToArr(JSON5.parse(raw)).forEach((e) => {
                if (e.isActive === 'y' && typeof e.name === 'string') {
                    byName[e.name] = byName[e.name] || []
                    byName[e.name].push(e)
                }
            })
            Object.keys(byName).forEach((n) => {
                if (byName[n].every((e) => e.mode !== 'OR' && e.mode !== 'AND')) {
                    lim[n] = byName[n][0].mode
                }
            })
        }
        let kpNew = Object.create(null)
        rows.forEach((r) => {
            if (r.name in lim && r.enable === 'y' && r.mode === 'AND') {
                kpNew[r.name] = lim[r.name] === undefined ? { isActive: 'y' } : { mode: lim[r.name], isActive: 'y' }
                return
            }
            kpNew[r.name] = { mode: r.mode, isActive: r.enable }
        })
        return JSON.stringify(kpNew)
    }
    let saveLikeA = (raw, names) => saveLike(raw, names, true)

    //eff 字串 'T1=y,T2=n,…' → 授權為 y 之標的集合
    let ysOf = (s) => new Set(s.split(',').filter((x) => x.endsWith('=y')).map((x) => x.slice(0, -2)))

    //規則集家族: 標的集合彼此不同使順序／模式差異可觀察; 含 'n' 值(AND 合併對 n 敏感)
    let FAMS = [
        { A: { T1: 'y', T2: 'y' }, B: { T2: 'y', T3: 'y' }, C: { T3: 'y' } },
        { A: { T1: 'y' }, B: { T1: 'y', T2: 'y', T3: 'y' }, C: { T2: 'y' } },
        { A: { T1: 'y', T2: 'y', T3: 'y' }, B: { T1: 'y' }, C: { T1: 'y', T3: 'y' } },
        { A: { T1: 'y', T2: 'y', T3: 'n' }, B: { T2: 'y', T3: 'y', T1: 'n' }, C: { T3: 'y', T2: 'n' } },
        { A: { T1: 'y', T3: 'n' }, B: { T2: 'y', T1: 'n' }, C: { T3: 'y', T1: 'y', T2: 'n' } },
    ]

    //nValidOf: 陣列形式中 mode 合法(OR／AND)之啟用元素數(0 ＝ 該層啟用項皆 mode 非法或無啟用項)
    let nValidOf = (arr) => arr.filter((e) => e !== null && typeof e === 'object' && e.isActive === 'y' && (e.mode === 'OR' || e.mode === 'AND')).length

    //窮舉: names × mode × isActive, 長度 ≤ maxLen 之全部陣列; level 為 'cgrups'(使用者層, 名稱即群組) 或 'cpemis'(群組層, 名稱即權限)
    //ghosts: 出現在陣列元素中、但不在群組(權限)表內之名稱(已刪除或外部多給; run05 c: 伺服端以懸空引用參與〔內容全 n〕, 編輯器以額外列保留、存檔原樣寫回)
    //extras: 另加之元素(如名稱非字串、非物件元素; 物件形式無法表示, 由 getKpLossy 判定)
    let exhaust = (level, names, modes, actives, maxLen, ghosts = [], extras = []) => {
        let elems = [...extras]
        for (let name of [...names, ...ghosts]) {
            for (let mode of modes) {
                for (let isActive of actives) {
                    elems.push({ name, ...(mode === undefined ? {} : { mode }), isActive })
                }
            }
        }
        let combos = [[]]
        let frontier = [[]]
        for (let len = 1; len <= maxLen; len++) {
            let next = []
            for (let c of frontier) {
                for (let e of elems) {
                    next.push([...c, e])
                }
            }
            combos.push(...next)
            frontier = next
        }
        let ts = [{ id: 'T1' }, { id: 'T2' }, { id: 'T3' }]
        let pn = ['A', 'B', 'C']
        //st 四個互斥分類(total = equal + lossyNeed + lossyCons + leaks.length):
        //  equal: 存檔前後授權相等且未判有損(存檔模型為方案 A: 未改動之限制項原樣寫回; 含原第三格〔啟用項皆 mode 缺／非法〕, run06 放寬); lossyNeed: 判有損且硬寫真的改變授權(判定確有必要); lossyCons: 判有損但硬寫碰巧相等(保守側); leaks: 授權改變而未判有損(漏判, 須為 0)
        //  orderBad: 陣列元素序反轉／對話框列序反轉使授權改變者(規則 4, 須為 0); gain: 有損格硬寫後授權為 y 之標的多於寫前者(增權, 須為 0——硬寫取 AND 支, 只會收回)
        //  allBad: 啟用項皆 mode 缺／非法且未判有損之格數(原第三格); allBadNaive: 其中「照列寫出為合法 AND」(方案 A 之前之寫法)會改變授權者(證明放寬仰賴方案 A 而非巧合)
        let st = { total: 0, equal: 0, lossyNeed: 0, lossyCons: 0, leaks: [], orderBad: [], gain: [], unnamed: 0, allBad: 0, allBadNaive: 0 }
        for (let fam of FAMS) {
            let eff
            if (level === 'cgrups') {
                let gs = names.map((n, i) => ({ name: n, cpemis: `{"${pn[i % 3]}":${ON}}` }))
                let ps = pn.map((p) => ({ name: p, crules: JSON.stringify(fam[p]) }))
                eff = (cgrups) => getUserRules({ cgrups }, gs, ps, ts).rules.map((v) => `${v.name}=${v.isActive}`).join(',')
            }
            else {
                let ps = names.map((n, i) => ({ name: n, crules: JSON.stringify(fam[pn[i % 3]]) }))
                eff = (cpemis) => getUserRules({ cgrups: `{"G":${ON}}` }, [{ name: 'G', cpemis }], ps, ts).rules.map((v) => `${v.name}=${v.isActive}`).join(',')
            }
            for (let arr of combos) {
                st.total++
                let raw = JSON.stringify(arr)
                let before = eff(raw)
                let lossy = getKpLossy(JSON5.parse(raw))
                //有損格(同名 OR 與 AND、名稱非字串)編輯器實際會拒存, 此處計算「硬寫」之授權以驗證判定是否漏判／是否必要; 其餘格為編輯器實際存檔之模型(方案 A: 未改動之限制項原樣寫回)
                let write = lossy.length > 0 ? saveLike : saveLikeA
                let after = eff(write(raw, names))

                //原第三格(啟用項皆 mode 缺／非法, 已放寬): 方案 A 存檔後授權相等; 若照列寫出為合法 AND(方案 A 之前)則改變——計數供靈敏度檢查
                if (lossy.length === 0 && nValidOf(arr) === 0 && arr.some((e) => e !== null && typeof e === 'object' && e.isActive === 'y')) {
                    st.allBad++
                    if (eff(saveLike(raw, names)) !== before) {
                        st.allBadNaive++
                    }
                }

                //規則 4: 陣列元素序反轉、對話框列序反轉, 授權不變(寫前、寫後皆然)
                let beforeRev = eff(JSON.stringify([...arr].reverse()))
                let afterRev = eff(write(raw, [...names].reverse()))
                if (beforeRev !== before || afterRev !== after) {
                    st.orderBad.push(`${raw}: 元素序反轉 ${before} → ${beforeRev}; 列序反轉(寫後) ${after} → ${afterRev}`)
                }

                if (before === after) {
                    if (lossy.length > 0) {
                        st.lossyCons++
                    }
                    else {
                        st.equal++
                    }
                }
                else if (lossy.length > 0) {
                    st.lossyNeed++
                    let yb = ysOf(before)
                    let ya = ysOf(after)
                    //增權檢查只對「同名 OR 與 AND 並存」之有損(硬寫取 AND 支只會收回); 名稱非字串之啟用元素(#序號, run05 f)硬寫即丟棄懸空引用而增權, 正是拒存之理由, 不在此列
                    //(原「啟用項皆 mode 非法」之第三格已放寬, 不再入有損, 見上 allBad)
                    if (lossy.every((x) => !/^#\d+$/.test(x)) && [...ya].some((t) => !yb.has(t))) {
                        st.gain.push(`${raw}: ${before} → ${after}`)
                    }
                    if (lossy.some((x) => /^#\d+$/.test(x))) {
                        st.unnamed++
                    }
                }
                else {
                    st.leaks.push(`${raw}: ${before} → ${after}`)
                }
            }
        }
        return st
    }
    let chk = (label, st, opt = {}) => {
        //R-AUTH-LOSSY-01: 凡存檔前後授權不相等者皆被 getKpLossy 判定(漏判 0)
        assert.strict.deepEqual(st.leaks.slice(0, 5), [], `${label} ${st.leaks.length} 組授權改變而未被判定為有損: ${st.leaks.slice(0, 5).join('\n')}`)
        assert.strict.equal(st.equal + st.lossyNeed + st.lossyCons, st.total, `${label} 分佈`)
        //規則 4: 順序無關
        assert.strict.deepEqual(st.orderBad.slice(0, 5), [], `${label} ${st.orderBad.length} 組授權隨元素序／列序改變: ${st.orderBad.slice(0, 5).join('\n')}`)
        assert.strict.deepEqual(st.gain.slice(0, 5), [], `${label} ${st.gain.length} 組有損格硬寫後增權`)
        assert.strict.ok(st.equal > 0, `${label} 相等格數`)
        if (opt.lossy) {
            assert.strict.ok(st.lossyNeed + st.lossyCons > 0, `${label} 應有被判有損之格(靈敏度)`)
        }
        if (opt.need) {
            assert.strict.ok(st.lossyNeed > 0, `${label} 靈敏度: 應有「判有損且硬寫真的改變授權」之格(判定非虛設), 實得 ${st.lossyNeed}`)
        }
        if (opt.allBad) {
            assert.strict.ok(st.allBad > 0 && st.allBadNaive > 0, `${label} 靈敏度: 啟用項皆 mode 缺／非法之格(原第三格, 已放寬, 方案 A 存檔授權相等)須出現, 且其中須有「照列寫出為合法 AND」會改變授權者(證明放寬仰賴方案 A), 實得 ${st.allBad}／${st.allBadNaive}`)
        }
    }

    it('PR-001 cgrups 陣列形式窮舉(2 群組 × mode{OR,AND,缺,or} × isActive{y,n}, 長度 ≤ 3, 5 組規則集): 經編輯器流程重新寫出之授權 = 寫出前, 除非 getKpLossy 判定有損; 漏判 0; 與元素序／列序無關', function() {
        this.timeout(300000)
        let st = exhaust('cgrups', ['G1', 'G2'], ['OR', 'AND', undefined, 'or'], ['y', 'n'], 3)
        assert.strict.equal(st.total, 4369 * FAMS.length)
        chk('PR-001', st, { lossy: true, need: true, allBad: true })
    })

    it('PR-001b cgrups: 3 群組(含整數式名稱 1／2, 幻影名稱) 各種組合: 重新寫出後授權相等, 除非判定為有損; 整數式名稱被 JS 屬性序排前不再改變授權(規則 4)', function() {
        this.timeout(300000)
        chk('PR-001b-1', exhaust('cgrups', ['1', '2'], ['OR', 'AND', undefined], ['y', 'n'], 3), { lossy: true })
        chk('PR-001b-2', exhaust('cgrups', ['G1', '2', '1'], ['OR', 'AND'], ['y'], 3), { lossy: true })
        chk('PR-001b-3', exhaust('cgrups', ['G1', '2', '1'], ['OR', 'AND', undefined], ['y', 'n'], 3), { lossy: true })
        chk('PR-001b-4', exhaust('cgrups', ['G1', 'G2', 'G3'], ['OR', 'AND', undefined], ['y', 'n'], 3), { lossy: true, need: true })
        chk('PR-001b-5', exhaust('cgrups', ['G1', 'G2', 'G3'], ['OR', 'AND'], ['y', 'n'], 4), { lossy: true, need: true })
        //幻影名稱(外審 sol#1／minimax#1: 首項為查無實體之整數式名稱): 元素中出現、但不在群組表內之名稱——run05 c: 伺服端以懸空引用參與(內容全 n), 編輯器以額外列保留
        chk('PR-001b-6', exhaust('cgrups', ['G1', '2'], ['OR', 'AND', undefined], ['y', 'n'], 3, ['1']), { lossy: true, need: true })
        chk('PR-001b-7', exhaust('cgrups', ['G1', 'G2'], ['OR', 'AND'], ['y'], 3, ['3', 'G9']), { lossy: true })
        chk('PR-001b-8', exhaust('cgrups', ['2', '3'], ['OR', 'AND'], ['y', 'n'], 3, ['1', 'G']), { lossy: true })
        //run05 新維度: 名稱 ""(表中有／無名稱為 "" 之列)、非法 mode(XOR、null)、名稱非字串之元素(無 name、數字 name、非物件元素 "y")
        chk('PR-001b-9', exhaust('cgrups', ['G1', ''], ['OR', 'AND', undefined, 'XOR'], ['y', 'n'], 3, ['G9']), { lossy: true, need: true })
        chk('PR-001b-10', exhaust('cgrups', ['G1', 'G2'], ['OR', 'AND', null], ['y', 'n'], 3, ['']), { lossy: true, need: true })
        let st11 = exhaust('cgrups', ['G1', 'G2'], ['OR', 'AND', undefined], ['y', 'n'], 2, ['G9'], [{ mode: 'AND', isActive: 'y' }, { name: 7, mode: 'OR', isActive: 'y' }, 'y', { name: 8, mode: 'OR', isActive: 'n' }])
        chk('PR-001b-11', st11, { lossy: true, need: true })
        assert.strict.ok(st11.unnamed > 0, `靈敏度: 名稱非字串之啟用元素須被判有損(#序號), 實得 ${st11.unnamed}`)
        //主責裁示之限制項維度: 只有 mode 缺／非法(全部格之啟用項皆非法)與混合合法 mode; 啟用項皆 mode 非法者原為第三格(有損), run06 放寬: 不判有損, 方案 A 存檔授權相等(allBad: 這些格)
        let st12 = exhaust('cgrups', ['G1', 'G2'], [undefined, 'XOR'], ['y', 'n'], 3, ['G9'])
        chk('PR-001b-12', st12, { allBad: true })
        assert.strict.equal(st12.lossyNeed + st12.lossyCons, 0, `PR-001b-12: 此空間之元素有效模式皆 AND, 無同名 OR／AND 並存, 放寬後無任何有損格, 實得 ${st12.lossyNeed + st12.lossyCons}`)
        chk('PR-001b-13', exhaust('cgrups', ['G1', 'G2', ''], ['OR', 'or', null], ['y', 'n'], 3), { lossy: true, need: true })
    })

    it('PR-003 cpemis 窮舉(同 PR-001 之下一層: 一個群組含 2～3 個權限): 重新寫出後授權相等, 除非判定為有損(mergeRules 同一函數, 權限層與群組層同一規則)', function() {
        this.timeout(300000)
        chk('PR-003-1', exhaust('cpemis', ['A', 'B'], ['OR', 'AND', undefined, 'or'], ['y', 'n'], 3), { lossy: true, need: true, allBad: true })
        chk('PR-003-2', exhaust('cpemis', ['A', 'B', 'C'], ['OR', 'AND', undefined], ['y', 'n'], 3), { lossy: true, need: true })
        chk('PR-003-3', exhaust('cpemis', ['1', '2', 'A'], ['OR', 'AND', undefined], ['y', 'n'], 3), { lossy: true })
        chk('PR-003-4', exhaust('cpemis', ['A', '2'], ['OR', 'AND', undefined], ['y', 'n'], 3, ['1']), { lossy: true, need: true })
        //run05 新維度: 名稱 ""、非法 mode、懸空(權限表查無)
        chk('PR-003-5', exhaust('cpemis', ['A', ''], ['OR', 'AND', 'or'], ['y', 'n'], 3, ['PX']), { lossy: true, need: true })
        let st6 = exhaust('cpemis', ['A', 'B'], ['or', undefined, 'AND'], ['y', 'n'], 3, ['PX'])
        chk('PR-003-6', st6, { allBad: true }) //權限層: 啟用項皆 mode 非法之格(原第三格, 已放寬; 元素有效模式皆 AND, 無有損格)
        assert.strict.equal(st6.lossyNeed + st6.lossyCons, 0, `PR-003-6: 無有損格, 實得 ${st6.lossyNeed + st6.lossyCons}`)
    })

    it('PR-004 物件形式窮舉(編輯器自己寫出之形式): 3 個名稱(三組: 純英數、含整數式名稱、含空字串名稱〔run05〕) × 各自 {缺席, (OR|AND|缺 mode|XOR) × (y|n)} × 全部鍵序排列 → getKpLossy 恆為空(原第三格「啟用項皆 mode 非法」已於 run06 放寬), 方案 A 重新寫出後授權恆相等, 且同一組項目的 6 種鍵序授權完全相同(規則 4)', function() {
        this.timeout(300000)
        let states = [null]
        for (let mode of ['OR', 'AND', undefined, 'XOR']) { //run05 e: 缺 mode 與非法 mode(XOR)皆視為 AND
            for (let isActive of ['y', 'n']) {
                states.push({ ...(mode === undefined ? {} : { mode }), isActive })
            }
        }
        let perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]
        let ts = [{ id: 'T1' }, { id: 'T2' }, { id: 'T3' }]
        let pn = ['A', 'B', 'C']
        let leaks = []
        let orderBad = []
        let total = 0
        let nSets = 0
        let nMulti = 0 //項目 ≥ 2 個(鍵序排列才有實質差異)之組數
        let nAllBad = 0 //啟用項皆 mode 非法(原第三格, 已放寬)之格數
        let nNeed = 0 //其中照列寫出為合法 AND(方案 A 之前之寫法)確實改變授權者(放寬仰賴方案 A)
        //第二組名稱含整數式名稱: JSON.parse 後 JS 屬性序恆把 '2'、'1' 排到 G1 之前, 與文字序無關——規則 4 下授權仍相同
        for (let names of [['G1', 'G2', 'G3'], ['G1', '2', '1'], ['', 'G2', '1']]) { //第三組含空字串名稱(run05 f: 保留為鍵 "")
            for (let fam of FAMS) {
                let gs = names.map((n, i) => ({ name: n, cpemis: `{"${pn[i % 3]}":${ON}}` }))
                let ps = pn.map((p) => ({ name: p, crules: JSON.stringify(fam[p]) }))
                let eff = (cgrups) => getUserRules({ cgrups }, gs, ps, ts).rules.map((v) => `${v.name}=${v.isActive}`).join(',')
                for (let s0 of states) {
                    for (let s1 of states) {
                        for (let s2 of states) {
                            let ss = [s0, s1, s2]
                            let effs = new Set()
                            for (let pm of perms) {
                                //以文字拼出該鍵序之物件(不經 JS 物件, 避免整數式鍵被重排而失去排列意義)
                                let raw = '{' + pm.filter((i) => ss[i] !== null).map((i) => `${JSON.stringify(names[i])}:${JSON.stringify(ss[i])}`).join(',') + '}'
                                total++
                                //物件形式恆可無損表示(每個名稱只有一個值; 同名 OR／AND 並存、名稱非字串皆僅陣列形式可能): 恆為空; 原第三格(啟用項皆 mode 缺或非法, KL-007)已於 run06 放寬, 不再判有損
                                let lossy = getKpLossy(JSON5.parse(raw))
                                assert.strict.deepEqual(lossy, [], `物件形式之有損判定 ${raw}`)
                                let act = ss.map((s, i) => [s, names[i]]).filter(([s]) => s !== null && s.isActive === 'y')
                                let allBad = act.length > 0 && act.every(([s]) => s.mode !== 'OR' && s.mode !== 'AND')
                                let before = eff(raw)
                                effs.add(before)
                                let after = eff(saveLikeA(raw, names)) //編輯器實際存檔之模型(方案 A)
                                if (before !== after) {
                                    leaks.push(`${raw}: ${before} → ${after}`)
                                }
                                nAllBad += allBad ? 1 : 0
                                nNeed += (allBad && before !== eff(saveLike(raw, names))) ? 1 : 0 //照列寫出為合法 AND(方案 A 之前)會改變授權者: 放寬仰賴方案 A 之證據
                            }
                            nSets++
                            nMulti += ss.filter((s) => s !== null).length >= 2 ? 1 : 0
                            if (effs.size !== 1) {
                                orderBad.push(`${names.join(',')} ${JSON.stringify(ss)}: ${[...effs].join(' | ')}`)
                            }
                        }
                    }
                }
            }
        }
        assert.strict.ok(total > 10000, `格數 ${total}`)
        assert.strict.equal(total, 3 * FAMS.length * 729 * 6, '格數 = 3 組名稱 × 規則集 × 9^3 狀態 × 6 鍵序')
        assert.strict.ok(nMulti > nSets / 2, `對照組: 多數組合有 ≥ 2 個項目(鍵序排列才有意義), 實得 ${nMulti}／${nSets}`)
        assert.strict.deepEqual(leaks.slice(0, 5), [], `${leaks.length} 組寫出後授權改變(未判有損): ${leaks.slice(0, 5).join('\n')}`)
        assert.strict.deepEqual(orderBad.slice(0, 5), [], `${orderBad.length} 組授權隨鍵序改變: ${orderBad.slice(0, 5).join('\n')}`)
        assert.strict.ok(nAllBad > 0 && nNeed > 0, `靈敏度: 啟用項皆 mode 非法之格 ${nAllBad}、照列寫出為合法 AND(方案 A 之前)確實改變授權者 ${nNeed}`)
    })

    it('PR-006 編輯後之輸出(外審 minimax#2): 對任一非有損原資料與任一列狀態組合(停用／OR／AND, 含新增整數式名稱), 寫出之物件的授權 = 規則 3 逐字計算之授權(與陣列元素序無關); 新增整數式 AND 名稱(舊制易位而拒存之形狀)不再被拒存且授權符合預期', function() {
        this.timeout(300000)
        let names = ['G1', '2', '1']
        let elems = []
        for (let name of names) {
            for (let mode of ['OR', 'AND']) {
                for (let isActive of ['y', 'n']) {
                    elems.push({ name, mode, isActive })
                }
            }
        }
        let origs = [[]]
        for (let e of elems) {
            origs.push([e])
            for (let e2 of elems) {
                origs.push([e, e2])
            }
        }
        let states = []
        for (let a = 0; a < 3; a++) {
            for (let b = 0; b < 3; b++) {
                for (let c = 0; c < 3; c++) {
                    states.push([a, b, c]) //0 停用、1 OR、2 AND
                }
            }
        }
        let ts = [{ id: 'T1' }, { id: 'T2' }, { id: 'T3' }]
        let pn = ['A', 'B', 'C']

        //規則 3 之逐字參照實作(不經 getUserRules／mergeRules): items = [{ mode, set }], set 為該項值為 y 之標的集合(未列 = n, 規則 1);
        //起點全 n(規則 2); 所有 OR 聯集, 無 OR 時以第一個 AND 為基底, 再與所有 AND 交集(規則 3)
        let specMerge = (items) => {
            let ors = items.filter((x) => x.mode === 'OR')
            let ands = items.filter((x) => x.mode === 'AND')
            let res = new Set()
            if (ors.length > 0) {
                for (let x of ors) {
                    for (let t of x.set) {
                        res.add(t)
                    }
                }
            }
            else if (ands.length > 0) {
                res = new Set(ands[0].set)
            }
            for (let x of ands) {
                res = new Set([...res].filter((t) => x.set.has(t)))
            }
            return res
        }

        let n = 0
        let nShape = 0 //舊制易位(而拒存)之形狀: 原資料已有 G1 AND, 新啟用整數式 AND 名稱且無 OR → 寫出物件鍵序為 1／2 在前、G1 在後
        let leaks = []
        let memo = new Map() //寫出內容只取決於 (規則集, 列狀態), 與原資料無關(不再參考原鍵序), 同一組合只評估一次
        let distinct = new Set()
        for (let [fi, fam] of FAMS.entries()) {
            let gs = names.map((nm, i) => ({ name: nm, cpemis: `{"${pn[i % 3]}":${ON}}` }))
            let ps = pn.map((p) => ({ name: p, crules: JSON.stringify(fam[p]) }))
            let eff = (cgrups) => getUserRules({ cgrups }, gs, ps, ts).rules.map((v) => `${v.name}=${v.isActive}`).join(',')
            let setOf = (nm) => new Set(ts.map((t) => t.id).filter((t) => fam[pn[names.indexOf(nm) % 3]][t] === 'y'))
            for (let arr of origs) {
                let raw = JSON.stringify(arr)
                if (getKpLossy(JSON5.parse(raw)).length > 0) {
                    continue //有損: 編輯器於存檔前即拒存
                }
                let origAndG1 = arr.some((e) => e.name === 'G1' && e.mode === 'AND' && e.isActive === 'y')
                for (let st of states) {
                    n++
                    //對話框列狀態 → 寫出(同 doSave: 物件, 鍵序 = JS 屬性序, 整數式名稱在前)
                    let kpNew = Object.create(null)
                    names.forEach((nm, i) => {
                        kpNew[nm] = { mode: st[i] === 2 ? 'AND' : 'OR', isActive: st[i] === 0 ? 'n' : 'y' }
                    })
                    let out = JSON.stringify(kpNew)
                    let key = `${fi}:${st.join('')}`
                    if (!memo.has(key)) {
                        let intended = names.map((nm) => ({ name: nm, ...kpNew[nm] }))
                        //規則 3 逐字計算(只有啟用且 mode 合法的項參與, 規則 5)
                        let res = specMerge(intended.filter((x) => x.isActive === 'y').map((x) => ({ mode: x.mode, set: setOf(x.name) })))
                        let spec = ts.map((t) => `${t.id}=${res.has(t.id) ? 'y' : 'n'}`).join(',')
                        memo.set(key, { spec, actual: eff(out), fwd: eff(JSON.stringify(intended)), rev: eff(JSON.stringify([...intended].reverse())) })
                        distinct.add(spec)
                    }
                    let m = memo.get(key)
                    if (m.actual !== m.spec || m.fwd !== m.spec || m.rev !== m.spec) {
                        leaks.push(`${raw} ${st.join('')}: 規則 3 計算 ${m.spec}; 寫出物件 ${m.actual}; 陣列正序 ${m.fwd}; 陣列反序 ${m.rev}`)
                    }
                    //舊制拒存之形狀(sensitivity): 確認該形狀真的落在窮舉空間內, 且寫出之鍵序確為整數式在前(JS 屬性序), 而授權仍符合規則 3(上面已驗)
                    if (origAndG1 && st[0] === 2 && (st[1] === 2 || st[2] === 2) && !st.includes(1)) {
                        let ks = Object.keys(JSON.parse(out))
                        assert.strict.ok(ks.indexOf('G1') > ks.findIndex((k) => /^\d+$/.test(k)) && ks.indexOf('G1') === ks.length - 1, `舊制易位形狀之鍵序 ${out}`)
                        nShape++
                    }
                }
            }
        }
        assert.strict.deepEqual(leaks.slice(0, 5), [], `${leaks.length} 組寫出物件之授權與規則 3 計算不同: ${leaks.slice(0, 5).join('\n')}`)
        assert.strict.ok(n > 10000, `格數 ${n}`)
        assert.strict.ok(nShape > 0, `靈敏度: 窮舉空間內應含舊制易位而拒存之形狀(新增整數式 AND 名稱), 實得 ${nShape} 格, 皆已通過(不再拒存)`)
        assert.strict.ok(distinct.size >= 5, `對照組: 規則 3 計算出的授權結果須有多種(標的集合共 8 種可能; 非全 y 或全 n), 實得 ${distinct.size} 種`)
    })

    it('PR-005 具體反例(外審 sol R3#2、run01 PR-004; 依 R-AUTH-MERGE-00 重算): 同名 OR／AND 並存 → 判有損, 硬寫(取 AND 支或取 OR 支)改變授權; 兩個 AND 群組且對話框序 ≠ 資料序 → 重新寫出後授權相等且與序無關', function() {
        let ts = [{ id: 'T1' }, { id: 'T2' }]
        let mkEff = (ps, gs) => (cgrups) => Object.fromEntries(getUserRules({ cgrups }, gs, ps, ts).rules.map((v) => [v.name, v.isActive]))
        let gs3 = [{ name: 'G1', cpemis: `{"P1":${ON}}` }, { name: 'G2', cpemis: `{"P2":${ON}}` }, { name: 'G3', cpemis: `{"P3":${ON}}` }]

        //反例 1(sol R3#2 的新規則版): G1 同時為 OR 與 AND, 另有 G2(OR)、G3(AND); P1={T1}、P2={T2}、P3={T1,T2}
        //規則 3: 所有 OR 聯集 {T1}∪{T2} = {T1,T2}, 再與所有 AND 交集 {T1} ∩ {T1,T2} = {T1}
        let eff1 = mkEff([{ name: 'P1', crules: '{"T1":"y"}' }, { name: 'P2', crules: '{"T2":"y"}' }, { name: 'P3', crules: '{"T1":"y","T2":"y"}' }], gs3)
        let c1 = '[{"name":"G1","mode":"AND","isActive":"y"},{"name":"G1","mode":"OR","isActive":"y"},{"name":"G2","mode":"OR","isActive":"y"},{"name":"G3","mode":"AND","isActive":"y"}]'
        assert.strict.deepEqual(eff1(c1), { T1: 'y', T2: 'n' }, '規則 3 之期望')
        assert.strict.deepEqual(getKpLossy(JSON5.parse(c1)), ['G1'], '物件形式無法無損表示 → 判有損(編輯器拒存)')
        //硬寫取 AND 支(cvKpToObj 的顯示值): G2(OR)={T2} ∩ G1 {T1} ∩ G3 {T1,T2} = ∅ → 減權
        assert.strict.deepEqual(eff1(saveLike(c1, ['G1', 'G2', 'G3'])), { T1: 'n', T2: 'n' }, '硬寫 AND 支: T1 由 y 變 n(減權), 證明拒存之必要')
        //硬寫取 OR 支: ({T1}∪{T2}) ∩ G3 {T1,T2} = {T1,T2} → 增權
        assert.strict.deepEqual(eff1(JSON.stringify({ G1: { mode: 'OR', isActive: 'y' }, G2: { mode: 'OR', isActive: 'y' }, G3: { mode: 'AND', isActive: 'y' } })), { T1: 'y', T2: 'y' }, '硬寫 OR 支: T2 由 n 變 y(增權)')
        assert.strict.deepEqual(eff1(JSON.stringify(JSON5.parse(c1).reverse())), { T1: 'y', T2: 'n' }, '元素序反轉後授權不變(規則 4)')

        //反例 1b(舊反例 1 之資料, 新規則重算): P1={T1,T2}、P2={T2}; [G1/AND, G2/AND, G2/OR] 規則 3 得 {T2}; 硬寫 AND 支亦得 {T2}——碰巧相等, 仍從嚴判有損(getKpLossy 保守側)
        let gs2 = [{ name: 'G1', cpemis: `{"P1":${ON}}` }, { name: 'G2', cpemis: `{"P2":${ON}}` }]
        let eff2 = mkEff([{ name: 'P1', crules: '{"T1":"y","T2":"y"}' }, { name: 'P2', crules: '{"T2":"y"}' }], gs2)
        let c1b = '[{"name":"G1","mode":"AND","isActive":"y"},{"name":"G2","mode":"AND","isActive":"y"},{"name":"G2","mode":"OR","isActive":"y"}]'
        assert.strict.deepEqual(eff2(c1b), { T1: 'n', T2: 'y' })
        assert.strict.deepEqual(getKpLossy(JSON5.parse(c1b)), ['G2'])
        assert.strict.deepEqual(eff2(saveLike(c1b, ['G1', 'G2'])), { T1: 'n', T2: 'y' }, '舊規則下此格硬寫增權(T1 由 n 變 y); 新規則(對稱交集)下碰巧相等')

        //反例 2(run01 PR-004): 兩個 AND 群組, 資料序 G1,G2、對話框(群組表)序 G2,G1; 舊規則下依對話框序重寫即授權改變(AND 非對稱), 新規則下與序無關
        for (let [p1, p2, exp] of [
            ['{"T1":"y"}', '{"T2":"y"}', { T1: 'n', T2: 'n' }], //互斥: 兩個 AND 項互為對方之限制 → 交集為空
            ['{"T1":"y","T2":"y"}', '{"T2":"y"}', { T1: 'n', T2: 'y' }], //G1 獨有之 T1 被 G2(未列 T1 = n)收回
        ]) {
            let eff = mkEff([{ name: 'P1', crules: p1 }, { name: 'P2', crules: p2 }], gs2)
            let c2 = '[{"name":"G1","mode":"AND","isActive":"y"},{"name":"G2","mode":"AND","isActive":"y"}]'
            let c2r = '[{"name":"G2","mode":"AND","isActive":"y"},{"name":"G1","mode":"AND","isActive":"y"}]'
            let c3 = '{"G1":{"mode":"AND","isActive":"y"},"G2":{"mode":"AND","isActive":"y"}}'
            let c3r = '{"G2":{"mode":"AND","isActive":"y"},"G1":{"mode":"AND","isActive":"y"}}'
            assert.strict.deepEqual(getKpLossy(JSON5.parse(c2)), [])
            for (let c of [c2, c2r, c3, c3r]) {
                assert.strict.deepEqual(eff(c), exp, `規則 3 之期望 ${c} (P1 ${p1}, P2 ${p2})`)
                for (let names of [['G1', 'G2'], ['G2', 'G1']]) {
                    assert.strict.deepEqual(eff(saveLike(c, names)), exp, `重新寫出(列序 ${names.join(',')}) ${c}`)
                }
            }
        }
    })

    it('PR-002 crules 陣列形式窮舉(name{T1,T2}×isActive{y,n,yes}, 長度 ≤ 3, 共 259 組): 編輯器顯示啟用之標的 = 伺服端授權之標的', function() {
        let elems = []
        for (let name of ['T1', 'T2']) {
            for (let isActive of ['y', 'n', 'yes']) {
                elems.push({ name, isActive })
            }
        }
        let combos = [[]]
        for (let len = 1; len <= 3; len++) {
            for (let c of combos.filter((x) => x.length === len - 1)) {
                for (let e of elems) {
                    combos.push([...c, e])
                }
            }
        }
        assert.strict.equal(combos.length, 259)
        let ts = [{ id: 'T1' }, { id: 'T2' }]
        let bad = []
        for (let arr of combos) {
            let r = getUserRules({ cgrups: `{"G1":${ON}}` }, [{ name: 'G1', cpemis: `{"P1":${ON}}` }], [{ name: 'P1', crules: JSON.stringify(arr) }], ts)
            let kp = cvKpToObj(arr)
            for (let t of r.rules) {
                if (t.isActive !== getRuleEnable(kp, t.name)) {
                    bad.push(`${JSON.stringify(arr)} ${t.name}`)
                }
            }
        }
        assert.strict.deepEqual(bad.slice(0, 5), [], `${bad.length} 組違規`)
    })


    // ===== R-KEY-PROP-01(ADR-032, run02 F-25): 陣列形式 crules 元素之 name 不可轉為屬性鍵時略過, 不拋 TypeError =====
    //修前 hasMode:false 之陣列形式以 o[r.name] = rest 取鍵, name 為 { toString: null } 之元素使整個解碼(編輯器開啟 VeCrules／清單頁 crules 計數)拋 TypeError

    it('CO-KP-001 crules 陣列形式含不可轉鍵 name 的元素 → 不拋錯、該元素略過、其餘照常(修前拋 TypeError)', function() {
        let arr = JSON5.parse('[{"name":"T","isActive":"y"},{"name":{"toString":null},"isActive":"y"},{"name":"U","isActive":"n"}]')
        let o = null
        assert.doesNotThrow(() => { o = cvKpToObj(arr) })
        assert.strict.deepEqual(Object.keys(o), ['T', 'U'])
        assert.strict.equal(getRuleEnable(o, 'T'), 'y')
        assert.strict.equal(getRuleEnable(o, 'U'), 'n')
        //伺服端同一份資料不拋錯, 且授權的標的與編輯器顯示啟用的標的相同(DF 差分)
        let r = getUserRules({ cgrups: `{"G1":${ON}}` }, [{ name: 'G1', cpemis: `{"P1":${ON}}` }], [{ name: 'P1', crules: JSON.stringify(arr) }], [{ id: 'T' }, { id: 'U' }, { id: '[object Object]' }])
        assert.strict.deepEqual(r.rules.map((v) => `${v.name}=${v.isActive}`), ['T=y', 'U=n', '[object Object]=n'])
    })

    it('CO-KP-002 可轉為鍵的非字串 name 維持修前行為(5 → "5"、true → "true"、["T"] → "T"、{} → "[object Object]"); 轉鍵後同名重複列所有列皆 y 才 y(與列序無關, 舊為後者覆蓋前者); hasMode:true 只留字串名稱(run05 f: 含空字串, 見 CO-004)', function() {
        let arr = [{ name: 5, isActive: 'y' }, { name: true, isActive: 'y' }, { name: ['T'], isActive: 'y' }, { name: {}, isActive: 'y' }, { name: 'T', isActive: 'n' }]
        let o = cvKpToObj(arr)
        assert.strict.deepEqual(Object.keys(o).sort(), ['5', 'T', 'true', '[object Object]'].sort())
        assert.strict.equal(getRuleEnable(o, 'T'), 'n', '["T"] 的 y 與 "T" 的 n 轉鍵後同名: 非所有列皆 y → n')
        assert.strict.equal(getRuleEnable(o, '5'), 'y')
        //反序(規則 4): 後者為 y 時, 後者覆蓋前者會得 y; 所有列皆 y 才 y 則仍為 n
        let o2 = cvKpToObj([{ name: 'T', isActive: 'n' }, { name: ['T'], isActive: 'y' }, { name: 'U', isActive: 'y' }, { name: ['U'], isActive: 'y' }])
        assert.strict.equal(getRuleEnable(o2, 'T'), 'n', '前 n 後 y → n')
        assert.strict.equal(getRuleEnable(o2, 'U'), 'y', '轉鍵後同名皆 y → y')
        let p = [{ name: { toString: null }, mode: 'OR', isActive: 'y' }, { name: 'G', mode: 'OR', isActive: 'y' }]
        assert.doesNotThrow(() => cvKpToObj(p, HM))
        assert.strict.deepEqual(Object.keys(cvKpToObj(p, HM)), ['G'])
    })

    it('CO-KP-003 不可轉鍵 name 全部略過 → 空容器(無原型); 與全部是不可轉者的伺服端結果一致(全 n)', function() {
        let arr = [{ name: { toString: null }, isActive: 'y' }, { name: [{ toString: 1 }], isActive: 'y' }]
        let o = cvKpToObj(arr)
        assert.strict.deepEqual(Object.keys(o), [])
        assert.strict.equal(Object.getPrototypeOf(o), null)
    })


    // ===== 站點不變式 =====

    //src 內每一處 JSON5.parse(…) 的分類: 五元件〔站點 35〕與清單頁〔站點 37, 複審 R1〕皆已套(經 cvKpToObj; 帶 mode 者傳 { hasMode: true }); 其餘為伺服端解碼入口 mShare.mjs
    const SITES = {
        //raw: 'let kpRaw = JSON5.parse(…)' 後同時交給 cvKpToObj(kpRaw, { hasMode: true }) 與 getKpLossy(kpRaw)(R-AUTH-LOSSY-01); 直接編輯器於開啟時一處, 關聯對話框於儲存前之有損檢查一處
        'src/components/VeCgrups.vue': { all: 1, wrapped: 0, hasMode: 0, raw: 1 },
        'src/components/VeCpemis.vue': { all: 1, wrapped: 0, hasMode: 0, raw: 1 },
        'src/components/VeCrules.vue': { all: 1, wrapped: 1, hasMode: 0, raw: 0 },
        'src/components/VeGrupBlngUsers.vue': { all: 4, wrapped: 3, hasMode: 3, raw: 1 },
        'src/components/VePemiBlngGrups.vue': { all: 4, wrapped: 3, hasMode: 3, raw: 1 },
        'src/components/LayoutContentGrups.vue': { all: 2, wrapped: 2, hasMode: 2, raw: 0 }, //站點 37(複審 R1: 已套, R-AUTH-LIST-01)
        'src/components/LayoutContentPemis.vue': { all: 2, wrapped: 2, hasMode: 1, raw: 0 }, //站點 37(cpemis 帶 mode、crules 不帶)
        'src/components/LayoutContentUsers.vue': { all: 1, wrapped: 1, hasMode: 1, raw: 0 }, //站點 37
        'src/plugins/mShare.mjs': { all: 1, wrapped: 0, hasMode: 0, raw: 0 }, //getUserRules 之 cvStrToArr(伺服端解碼入口, 經 cvKpToArr)
        'src/js/refCascade.mjs': { all: 1, wrapped: 0, hasMode: 0, raw: 0 }, //run06 引用連帶之 decodeKp(改名級聯／刪除連帶清理改寫引用字串前之解碼: 壞 JSON／空字串／純量視為空容器不動, 同伺服端 cvStrToArr 之容錯; 之後以 listEntries 依 cvKpToArr 同一名稱規則走訪, R-REF-CASCADE-01)
        'src/js/refAudit.mjs': { all: 1, wrapped: 0, hasMode: 0, raw: 0 }, //run06 懸空引用稽核之解碼(經 cvKpToArr 取名稱, 壞 JSON 列入 badJson; 唯讀分析, 不寫入; R-REF-CASCADE-01 升級工具)
        'src/js/getAuthWarn.mjs': { all: 2, wrapped: 0, hasMode: 0, raw: 0 }, //run05 頁面提示之 parseKp(字串 → JSON5.parse, 損壞回 null; 其後經 cvKpToArr, 與伺服端同一解碼)與 isBadData(僅判定字串是否可解析為物件／陣列, 供 unparsable 提示, 不解碼授權內容)
    }

    it('SITE-AD-001 src 內每一處 JSON5.parse(授權資料) 皆分類: 五元件與三個清單頁皆經 cvKpToObj(帶 mode 者傳 { hasMode: true }), 新增讀取點即紅', function() {
        let found = {}
        let walk = (dir) => {
            for (let ent of fs.readdirSync(dir, { withFileTypes: true })) {
                let fp = path.join(dir, ent.name)
                if (ent.isDirectory()) {
                    walk(fp)
                }
                else if (/\.(vue|mjs|js)$/.test(ent.name)) {
                    let rel = path.relative(fdRoot, fp).split(path.sep).join('/')
                    //可執行碼之 JSON5.parse(: 略過整行註解(// 開頭)
                    let code = fs.readFileSync(fp, 'utf8').split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
                    let all = code.filter((l) => /JSON5\.parse\(/.test(l))
                    if (all.length > 0) {
                        let wrapped = all.filter((l) => /cvKpToObj\(JSON5\.parse\(/.test(l))
                        let raw = all.filter((l) => /\bkpRaw = JSON5\.parse\(/.test(l))
                        found[rel] = { all: all.length, wrapped: wrapped.length, hasMode: wrapped.filter((l) => /\{ hasMode: true \}\)/.test(l)).length, raw: raw.length }
                        //raw 站點須交給 cvKpToObj(kpRaw, { hasMode: true }) 與 getKpLossy(kpRaw)
                        if (raw.length > 0) {
                            let txt = code.join('\n')
                            assert.strict.equal(txt.split('cvKpToObj(kpRaw, { hasMode: true })').length - 1, raw.length, `${rel} 之 kpRaw 應各交給 cvKpToObj(kpRaw, { hasMode: true })`)
                            assert.strict.equal(txt.split('getKpLossy(kpRaw)').length - 1, raw.length, `${rel} 之 kpRaw 應各交給 getKpLossy(kpRaw)`)
                        }
                    }
                }
            }
        }
        walk(path.join(fdRoot, 'src'))
        assert.strict.deepEqual(found, SITES, '站點不符(新增讀取點須分類)')
        for (let fn of ['VeCgrups', 'VeCpemis', 'VeCrules', 'VeGrupBlngUsers', 'VePemiBlngGrups', 'LayoutContentUsers', 'LayoutContentGrups', 'LayoutContentPemis']) {
            let txt = fs.readFileSync(path.join(fdRoot, 'src', 'components', `${fn}.vue`), 'utf8')
            assert.strict.ok(/import cvKpToObj from '\.\.\/js\/cvKpToObj\.mjs'/.test(txt), `${fn} 須 import cvKpToObj`)
        }
        let pemis = fs.readFileSync(path.join(fdRoot, 'src', 'components', 'LayoutContentPemis.vue'), 'utf8')
        assert.strict.ok(/import getRuleEnable from '\.\.\/js\/getRuleEnable\.mjs'/.test(pemis), 'LayoutContentPemis 之 crules 計數須用 getRuleEnable')
    })

    it('SITE-AD-003 五個編輯元件不再引用排序保護(keepKeyOrder／getKeyOrderLost／getKpWriteLost, 反向守護: 原始碼出現即紅); 四個帶 mode 者仍經 getKpLossy 並於有損時以 authLossyBlocked 拒存(R-AUTH-LOSSY-01); 名稱代入用 fmtLossyMsg', function() {
        let txt = (fn) => fs.readFileSync(path.join(fdRoot, 'src', 'components', `${fn}.vue`), 'utf8')

        //反向守護(規則 4: 結果與順序無關, 排序保護於本規則下非必要而已刪除): 三個模組檔不得復活; src／server 可執行碼(略過整行註解)不得出現其名稱
        //(含 keyOrderOf、seqNew——舊關聯對話框自行傳入預期序之殘留)
        for (let mod of ['keepKeyOrder', 'getKeyOrderLost', 'getKpWriteLost']) {
            assert.strict.equal(fs.existsSync(path.join(fdRoot, 'src', 'js', `${mod}.mjs`)), false, `src/js/${mod}.mjs 已刪除, 不得復活`)
        }
        let gone = /\b(keepKeyOrder|getKeyOrderLost|getKpWriteLost|keyOrderOf|seqNew)\b/
        let hits = []
        let walkGone = (dir) => {
            for (let ent of fs.readdirSync(dir, { withFileTypes: true })) {
                let fp = path.join(dir, ent.name)
                if (ent.isDirectory()) {
                    walkGone(fp)
                }
                else if (/\.(vue|mjs|js)$/.test(ent.name)) {
                    let rel = path.relative(fdRoot, fp).split(path.sep).join('/')
                    fs.readFileSync(fp, 'utf8').split(/\r?\n/).forEach((l, i) => {
                        //略過整行註解與行尾 // 註解(// 前須有空白, 不誤傷 http://)
                        let code = l.replace(/\s\/\/.*$/, '')
                        if (!/^\s*(\/\/|\*|\/\*|<!--)/.test(code) && gone.test(code)) {
                            hits.push(`${rel}:${i + 1}: ${l.trim()}`)
                        }
                    })
                }
            }
        }
        walkGone(path.join(fdRoot, 'src'))
        walkGone(path.join(fdRoot, 'server'))
        assert.strict.deepEqual(hits, [], `src／server 不得再引用已刪除之排序保護:\n${hits.join('\n')}`)
        //五個元件明確逐檔(縱使上面全域掃描已涵蓋, 此處對 import 與呼叫兩種形態分別守護)
        for (let fn of ['VeCgrups', 'VeCpemis', 'VeCrules', 'VeGrupBlngUsers', 'VePemiBlngGrups']) {
            let t = txt(fn)
            assert.strict.ok(!/import (keepKeyOrder|getKeyOrderLost|getKpWriteLost)\b/.test(t), `${fn} 不得 import 已刪除之排序保護模組`)
            assert.strict.ok(!/\b(keepKeyOrder|getKeyOrderLost|getKpWriteLost|keyOrderOf)\(/.test(t), `${fn} 不得呼叫已刪除之排序保護函數`)
        }

        for (let fn of ['VeCgrups', 'VeCpemis', 'VeGrupBlngUsers', 'VePemiBlngGrups']) {
            let t = txt(fn)
            assert.strict.ok(/import getKpLossy from '\.\.\/js\/getKpLossy\.mjs'/.test(t), `${fn} 須 import getKpLossy`)
            assert.strict.ok(/getKpLossy\(/.test(t), `${fn} 須呼叫 getKpLossy(`)
            assert.strict.ok(/authLossyBlocked/.test(t), `${fn} 須以 authLossyBlocked 顯示固定訊息`)
            assert.strict.ok(/import fmtLossyMsg from '\.\.\/js\/fmtLossyMsg\.mjs'/.test(t) && /fmtLossyMsg\(/.test(t), `${fn} 須以 fmtLossyMsg 代入名稱`)
            assert.strict.ok(!/\.replace\('\{names\}'/.test(t), `${fn} 不得以 String.replace 代入 {names}(名稱含 $ 樣式會被展開)`)
        }
        //關聯對話框: 有損檢查與寫入共用同一份快照(外審 sol#2: 兩次讀取之間 store 可能被伺服器推送更新)
        for (let [fn, snap, live] of [['VeGrupBlngUsers', 'let users = cloneDeep(vo.users)', 'get(vo.users, kr'], ['VePemiBlngGrups', 'let grups = cloneDeep(vo.grups)', 'get(vo.grups, kr']]) {
            let t = txt(fn)
            let i0 = t.indexOf('doSave: function(opt = {})')
            let d = t.slice(i0, t.indexOf('clickClose: function', i0))
            assert.strict.equal(d.split(snap).length - 1, 1, `${fn}.doSave 須只取一次快照 ${snap}`)
            assert.strict.ok(d.indexOf(snap) < d.indexOf('let kpLossyIdx'), `${fn}.doSave 之快照須在有損檢查之前`)
            assert.strict.ok(!d.includes(live), `${fn}.doSave 不得再以即時 store 資料(${live}…)取列`)
        }
        let lang = fs.readFileSync(path.join(fdRoot, 'server', 'procLang.mjs'), 'utf8')
        let mLang = /authLossyBlocked: \{[^\n]*\n\s*eng: ([^\n]*\{names\}[^\n]*)\n\s*cht: ([^\n]*\{names\}[^\n]*)/.exec(lang)
        assert.strict.ok(mLang !== null, 'procLang 須有 authLossyBlocked 之 eng／cht 且含 {names}')
        //拒存訊息只剩「同名同時 OR 與 AND」一格, 不得再宣稱「順序無法保留」(規則 4 下順序不影響授權)
        assert.strict.ok(!/order/i.test(mLang[1]) && !/順序/.test(mLang[2]), 'authLossyBlocked 文字不得再提順序')
        assert.strict.ok(/OR/.test(mLang[1]) && /AND/.test(mLang[1]) && /OR/.test(mLang[2]) && /AND/.test(mLang[2]), 'authLossyBlocked 文字須說明同名同時 OR 與 AND')
    })

    it('SITE-AD-002 伺服端 getUserRules 之解碼與編輯器共用同一份 cvKpToArr(mShare.mjs 不再內嵌一份)', function() {
        let txt = fs.readFileSync(path.join(fdRoot, 'src', 'plugins', 'mShare.mjs'), 'utf8')
        assert.strict.ok(/import cvKpToArr from '\.\.\/js\/cvKpToArr\.mjs'/.test(txt), 'mShare.mjs 須 import cvKpToArr')
        assert.strict.ok(!/let cvKpToArr = /.test(txt), 'mShare.mjs 不得再內嵌 let cvKpToArr = …')
    })

})
