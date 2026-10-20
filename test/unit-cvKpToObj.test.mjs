//授權資料(cgrups／cpemis／crules)之共用解碼(規則帳本 R-AUTH-DECODE-01; 第 92 項①, 站點 35)
//
//受測: src/js/cvKpToArr.mjs(伺服端 getUserRules 與編輯器共用之唯一解碼: JSON5.parse 結果 → [{ name, … }])、
//  src/js/cvKpToObj.mjs(編輯器用: 陣列形式 → 以名稱為鍵之物件形式; 物件形式去掉值內 name; opt.hasMode 為 cgrups／cpemis 帶 mode 之資料)、src/js/getRuleEnable.mjs(與之搭配取啟用狀態).
//背景: 外部應用直接寫入「陣列形式」[{ "name": "A", "isActive": "y" }]，伺服端 getUserRules 相容並授權(UNIT-OI-006a)，五個編輯元件
//  (VeCrules／VeCgrups／VeCpemis／VeGrupBlngUsers／VePemiBlngGrups)依名稱為鍵查值，查不到陣列元素 → 顯示停用 → 存檔即撤銷有效授權.
//  外審(minimax#1、sol#4～#6)另指出: 缺 mode 之元素顯示啟用後存檔會補 OR 而增權、同名不同 mode 取末項會增權、物件值內 name 使關聯對話框改指另一項、crules 之鍵轉型.
//CO-0xx: 函數契約; DF-0xx: 與伺服端 getUserRules 之差分(同一份資料，伺服端授權 ⇔ 編輯器顯示啟用); PR-0xx: 窮舉性質(編輯器存檔後之授權 ⊆ 存檔前, 且除不可無損表示者外相等);
//SITE-AD-001: src 內每一處 JSON5.parse(授權資料) 皆分類(五元件已套、清單頁未套〔站點 37〕, 新增者即紅).
//跑法: npx mocha test/unit-cvKpToObj.test.mjs --timeout 120000
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import JSON5 from 'json5'
import cvKpToArr from '../src/js/cvKpToArr.mjs'
import cvKpToObj from '../src/js/cvKpToObj.mjs'
import getRuleEnable from '../src/js/getRuleEnable.mjs'
import getOwn from '../src/js/getOwn.mjs'
import keepKeyOrder, { keyOrderOf } from '../src/js/keepKeyOrder.mjs'
import getKpLossy from '../src/js/getKpLossy.mjs'
import getKeyOrderLost from '../src/js/getKeyOrderLost.mjs'
import getKpWriteLost from '../src/js/getKpWriteLost.mjs'
import joinNames from '../src/js/joinNames.mjs'
import fmtLossyMsg from '../src/js/fmtLossyMsg.mjs'
import { getUserRules } from '../src/plugins/mShare.mjs'

const fdRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const HM = { hasMode: true }


describe('unit-cvKpToObj (授權資料共用解碼, R-AUTH-DECODE-01)', function() {

    it('CO-001 非陣列且無需修改 → 原樣回傳(同一參考): 物件形式、null、字串、數字、布林、undefined', function() {
        let o = { A: 'y', B: { mode: 'OR', isActive: 'y' } }
        assert.strict.equal(cvKpToObj(o), o)
        assert.strict.equal(cvKpToObj(o, HM), o)
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

    it('CO-004 hasMode(cgrups／cpemis): 僅名稱為非空字串者保留(伺服端 arrFinder 以 === 比對, 非字串名稱不授權); 元素非物件略過', function() {
        let kp = cvKpToObj(['G', 5, null, true, [], {}, { mode: 'OR', isActive: 'y' }, { name: 5, mode: 'OR', isActive: 'y' }, { name: true, mode: 'OR', isActive: 'y' }, { name: null, mode: 'OR', isActive: 'y' }, { name: ['G1'], mode: 'OR', isActive: 'y' }, { name: {}, mode: 'OR', isActive: 'y' }, { name: '', mode: 'OR', isActive: 'y' }, { name: 'OK', mode: 'OR', isActive: 'y' }], HM)
        assert.strict.deepEqual(Object.keys(kp), ['OK'])
        assert.strict.deepEqual(Object.keys(cvKpToObj([], HM)), [])
    })

    it('CO-005 hasMode: isActive 為 y 而 mode 缺漏或不合法(含小寫 or、數字、null)者改為 n(伺服端不納入合併 = 不授權; 否則存檔補預設 OR 而增權); 陣列與物件形式一致', function() {
        for (let m of [undefined, null, 'or', 'Or', '', 'AND ', 1, true, 'XOR']) {
            let a = { name: 'G1', isActive: 'y', ...(m === undefined ? {} : { mode: m }) }
            let o = { isActive: 'y', ...(m === undefined ? {} : { mode: m }) }
            assert.strict.equal(getOwn(getOwn(cvKpToObj([a], HM), 'G1'), 'isActive'), 'n', `陣列 mode=${String(m)}`)
            assert.strict.equal(getOwn(getOwn(cvKpToObj({ G1: o }, HM), 'G1'), 'isActive'), 'n', `物件 mode=${String(m)}`)
        }
        //合法 mode 且 y → 保留; n 者不變
        assert.strict.deepEqual({ ...getOwn(cvKpToObj([{ name: 'G1', mode: 'AND', isActive: 'y' }], HM), 'G1') }, { mode: 'AND', isActive: 'y' })
        assert.strict.deepEqual({ ...getOwn(cvKpToObj([{ name: 'G1', mode: 'OR', isActive: 'n' }], HM), 'G1') }, { mode: 'OR', isActive: 'n' })
        //crules(不帶 hasMode)不看 mode
        assert.strict.equal(getRuleEnable(cvKpToObj([{ name: 'A', isActive: 'y' }]), 'A'), 'y')
    })

    it('CO-006 同名重複: crules 後者覆蓋前者(伺服端 kpRule 亦然); hasMode 以「有效啟用元素」為準——模式一致合為一個啟用項, AND／OR 並存時保留 AND 支, 無有效啟用元素時為 n', function() {
        let c = cvKpToObj([{ name: 'A', isActive: 'y' }, { name: 'A', isActive: 'n' }, { name: 'B', isActive: 'n' }, { name: 'B', isActive: 'y' }])
        assert.strict.equal(getRuleEnable(c, 'A'), 'n')
        assert.strict.equal(getRuleEnable(c, 'B'), 'y')
        let g = cvKpToObj([
            { name: 'S1', mode: 'OR', isActive: 'y' }, { name: 'S1', mode: 'OR', isActive: 'n' }, //一啟用一停用 → 啟用(OR)
            { name: 'S2', mode: 'AND', isActive: 'y' }, { name: 'S2', mode: 'AND', isActive: 'y' }, //模式一致 → 啟用(AND)
            { name: 'C1', mode: 'OR', isActive: 'y' }, { name: 'C1', mode: 'AND', isActive: 'y' }, //AND 與 OR 並存 → 保留 AND 支
            { name: 'N1', mode: 'OR', isActive: 'n' }, { name: 'N1', isActive: 'y' }, //無有效啟用元素 → n
        ], HM)
        assert.strict.deepEqual({ ...g.S1 }, { mode: 'OR', isActive: 'y' })
        assert.strict.deepEqual({ ...g.S2 }, { mode: 'AND', isActive: 'y' })
        assert.strict.deepEqual({ ...g.C1 }, { mode: 'AND', isActive: 'y' })
        assert.strict.equal(g.N1.isActive, 'n')
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


    it('CO-010 hasMode 陣列形式之鍵序 = 有效啟用元素首次出現之序, 其後為無有效元素之名稱(首次出現序); 伺服端 AND 合併之「第一個 AND 項」依此序(R-AUTH-ORDER-01)', function() {
        let kp = cvKpToObj([
            { name: 'G1', mode: 'AND', isActive: 'n' }, //停用在前: 不得使 G1 排在 G2 之前
            { name: 'G9', isActive: 'y' }, //缺 mode: 無有效元素
            { name: 'G2', mode: 'AND', isActive: 'y' },
            { name: 'G1', mode: 'AND', isActive: 'y' },
            { name: 'G2', mode: 'AND', isActive: 'y' },
        ], HM)
        assert.strict.deepEqual(Object.keys(kp), ['G2', 'G1', 'G9'])
        //物件形式維持原鍵序
        assert.strict.deepEqual(Object.keys(cvKpToObj({ B: { name: 'x', mode: 'OR', isActive: 'y' }, A: { mode: 'OR', isActive: 'n' } }, HM)), ['B', 'A'])
    })

    it('KO-001 keepKeyOrder: 參考中已有之名稱維持參考序、新增名稱附加於後(依 kpNew 序); 參考有而 kpNew 沒有者不出現; 值取 kpNew; 回傳無原型物件; 不改動輸入', function() {
        let ref = { B: 1, A: 2, C: 3 }
        let nw = { A: 'a', D: 'd', C: 'c', B: 'b', E: 'e' }
        let r = keepKeyOrder(ref, nw)
        assert.strict.deepEqual(Object.keys(r), ['B', 'A', 'C', 'D', 'E'])
        assert.strict.equal(r.A, 'a')
        assert.strict.equal(Object.getPrototypeOf(r), null)
        assert.strict.deepEqual(Object.keys(ref), ['B', 'A', 'C'])
        assert.strict.deepEqual(Object.keys(nw), ['A', 'D', 'C', 'B', 'E'])
        assert.strict.deepEqual(Object.keys(keepKeyOrder({ B: 1, X: 2, A: 3 }, { A: 1, B: 2 })), ['B', 'A'], '參考有而 kpNew 沒有之 X(刪除)不出現')
    })

    it('KO-002 keepKeyOrder: 參考為 null／undefined／陣列／字串／數字時等同 kpNew 序; 原型鍵名(__proto__、constructor)為一般鍵', function() {
        let nw = { b: 1, a: 2 }
        for (let ref of [null, undefined, [], 'str', 5, true]) {
            assert.strict.deepEqual(Object.keys(keepKeyOrder(ref, nw)), ['b', 'a'], String(ref))
        }
        let r = keepKeyOrder(JSON.parse('{"__proto__":1,"constructor":2}'), JSON.parse('{"constructor":"c","x":"x","__proto__":"p"}'))
        assert.strict.deepEqual(Object.keys(r), ['__proto__', 'constructor', 'x'])
        assert.strict.equal(Object.getOwnPropertyDescriptor(r, '__proto__').value, 'p')
        assert.strict.equal(Object.getPrototypeOf(r), null)
    })

    it('KO-003 keyOrderOf: 與 keepKeyOrder 同序(參考中已有者依參考序、新增者依 kpNew 序附加); 整數式名稱仍依意圖序列出(JS 屬性序無法改變輸出物件, 見 getKeyOrderLost)', function() {
        assert.strict.deepEqual(keyOrderOf({ B: 1, A: 2 }, { A: 'a', C: 'c', B: 'b' }), ['B', 'A', 'C'])
        assert.strict.deepEqual(keyOrderOf({ A: 1 }, JSON.parse('{"1":"x","A":"a"}')), ['A', '1'], '整數式名稱新增: 意圖序為既有 A 在前、新增 1 附加於後')
        assert.strict.deepEqual(Object.keys(keepKeyOrder({ A: 1 }, JSON.parse('{"1":"x","A":"a"}'))), ['1', 'A'], 'JS 屬性序把整數式鍵排前面——這正是需 getKeyOrderLost 的原因')
        assert.strict.deepEqual(keyOrderOf(null, { b: 1, a: 2 }), ['b', 'a'])
        assert.strict.deepEqual(keyOrderOf({ a: 1 }, null), [])
        assert.strict.deepEqual(keyOrderOf({ a: 1 }, [1]), [])
    })

    it('GL-001 getKeyOrderLost: 欲寫出之物件因 JS 屬性序(整數式鍵先)使有效 AND 名稱易位 → 回傳該些 AND 名稱(依預期序); 順序一致、少於 2 個 AND、非 AND／停用者不計 → 空陣列', function() {
        let and = { mode: 'AND', isActive: 'y' }
        let or = { mode: 'OR', isActive: 'y' }
        let off = { mode: 'AND', isActive: 'n' }
        let out = (o) => keepKeyOrder({}, o) //keepKeyOrder 輸出為 JS 屬性序
        assert.strict.deepEqual(getKeyOrderLost(out({ A: and, 1: and }), ['A', '1']), ['A', '1'], '新增整數式 AND 名稱被排到既有 A 之前')
        assert.strict.deepEqual(getKeyOrderLost(out({ 1: and, A: and }), ['1', 'A']), [], '預期序即 JS 序')
        assert.strict.deepEqual(getKeyOrderLost(out({ A: and, 1: or }), ['A', '1']), [], '整數式名稱為 OR 不影響第一個 AND 項')
        assert.strict.deepEqual(getKeyOrderLost(out({ A: and, 1: off }), ['A', '1']), [], '停用者不算')
        assert.strict.deepEqual(getKeyOrderLost(out({ A: and }), ['A']), [], '只一個 AND')
        assert.strict.deepEqual(getKeyOrderLost(out({ A: and, B: and, 2: and, 1: and }), ['A', 'B', '1', '2']), ['A', 'B', '1', '2'], '整數式名稱 1、2 被排到 A、B 前面')
        assert.strict.deepEqual(getKeyOrderLost(out({ 1: and, B: and, 2: and }), ['1', 'B', '2']), [], '第一個 AND 項不變(其後 B 與 2 的相對順序改變不影響授權, 不需拒存)')
        assert.strict.deepEqual(getKeyOrderLost(out({ A: and, 1: and, X: or }), ['A', '1', 'X']), [], '有任何有效 OR 項時 AND 項順序與授權無關(OR 聯集為基底), 不需拒存(外審 minimax 第二輪#2)')
        assert.strict.deepEqual(getKeyOrderLost(out({ A: and, 1: and, X: { mode: 'OR', isActive: 'n' } }), ['A', '1', 'X']), ['A', '1'], '停用的 OR 項不算')
        assert.strict.deepEqual(getKeyOrderLost(null, ['A']), [])
        assert.strict.deepEqual(getKeyOrderLost({ A: and }, null), [])
    })

    it('WL-001 getKpWriteLost: 預期序由參考與欲寫出之物件於函數內導出(呼叫端不傳序, 外審 minimax 第二輪#1: 關聯對話框曾以已套用 JS 屬性序之物件序當預期序而守門恆空)', function() {
        let and = { mode: 'AND', isActive: 'y' }
        let or = { mode: 'OR', isActive: 'y' }
        assert.strict.deepEqual(getKpWriteLost({ A: and }, { A: and, 1: and }), ['A', '1'], '新啟用整數式 AND 名稱排到既有 A 之前')
        assert.strict.deepEqual(getKpWriteLost({ A: and }, { A: and, B: and }), [], '新增非整數式名稱附加於後')
        assert.strict.deepEqual(getKpWriteLost({ A: and }, { A: and, 1: or }), [], '整數式名稱為 OR')
        assert.strict.deepEqual(getKpWriteLost({ A: and }, { A: and, 1: and, X: or }), [], '有有效 OR 項')
        assert.strict.deepEqual(getKpWriteLost(JSON.parse('{"1":{"mode":"AND","isActive":"y"},"A":{"mode":"AND","isActive":"y"}}'), JSON.parse('{"1":{"mode":"AND","isActive":"y"},"A":{"mode":"AND","isActive":"y"}}')), [], '原資料即整數式 AND 在前(伺服端序即 JS 序): 未變更不拒存')
        assert.strict.deepEqual(getKpWriteLost(null, { A: and, 1: and }), [], '無參考(全新資料)時預期序即 kpNew 的 key 序(JS 序 1, A), 無既有 AND 項可易位')
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

    it('KL-001 getKpLossy: 物件形式、null、字串、數字、空陣列、無有效元素之陣列 → 空陣列(物件形式永遠可無損表示)', function() {
        for (let kp of [{ A: { mode: 'OR', isActive: 'y' }, B: { mode: 'AND', isActive: 'y' } }, null, undefined, 'x', 5, true, [], [{ name: 'A', mode: 'OR', isActive: 'n' }], [{ name: 'A', isActive: 'y' }]]) {
            assert.strict.deepEqual(getKpLossy(kp), [], JSON.stringify(kp))
        }
    })

    it('KL-002 getKpLossy: 同名有效啟用元素同時為 OR 與 AND → 該名稱有損; 同模式重複、一邊停用、一邊缺 mode 或名稱不同 → 不是', function() {
        let L = (arr) => getKpLossy(arr).sort()
        assert.strict.deepEqual(L([{ name: 'G1', mode: 'OR', isActive: 'y' }, { name: 'G1', mode: 'AND', isActive: 'y' }]), ['G1'])
        assert.strict.deepEqual(L([{ name: 'G1', mode: 'AND', isActive: 'y' }, { name: 'G2', mode: 'AND', isActive: 'y' }, { name: 'G2', mode: 'OR', isActive: 'y' }]), ['G2'], 'sol R3#2')
        assert.strict.deepEqual(L([{ name: 'G1', mode: 'OR', isActive: 'y' }, { name: 'G1', mode: 'OR', isActive: 'y' }]), [])
        assert.strict.deepEqual(L([{ name: 'G1', mode: 'OR', isActive: 'y' }, { name: 'G1', mode: 'AND', isActive: 'n' }]), [])
        assert.strict.deepEqual(L([{ name: 'G1', mode: 'OR', isActive: 'y' }, { name: 'G1', isActive: 'y' }]), [], '缺 mode 之 y 不是有效啟用元素')
        assert.strict.deepEqual(L([{ name: 'G1', mode: 'OR', isActive: 'y' }, { name: 'G2', mode: 'AND', isActive: 'y' }]), [])
        assert.strict.deepEqual(L([{ name: 'G1', mode: 'OR', isActive: 'y' }, { name: 'G1', mode: 'or', isActive: 'y' }, { name: 'G1', mode: 'AND', isActive: 'y' }]), ['G1'])
    })

    it('KL-003 getKpLossy: 有效 AND 名稱 ≥ 2 且其相對順序於伺服端序與物件鍵序(整數式鍵先、遞增)不同 → 有損(該些 AND 名稱; 因查無實體之名稱會被伺服端丟棄, 須整個相對順序一致, 不只第一個); 序相同、只一個 AND → 不是', function() {
        let L = (arr) => getKpLossy(arr).sort()
        let a = (name) => ({ name, mode: 'AND', isActive: 'y' })
        assert.strict.deepEqual(L([a('2'), a('1')]), ['1', '2'], '伺服端以 2 為首, 物件序以 1 為首')
        assert.strict.deepEqual(L([a('1'), a('2')]), [])
        assert.strict.deepEqual(L([a('G1'), a('1')]), ['1', 'G1'], 'G1 先於整數式名稱 1, 物件序 1 在前')
        assert.strict.deepEqual(L([a('1'), a('G1')]), [])
        assert.strict.deepEqual(L([a('2')]), [], '只一個 AND')
        assert.strict.deepEqual(L([a('2'), { name: '1', mode: 'OR', isActive: 'y' }]), [], '1 為 OR 非 AND')
        assert.strict.deepEqual(L([{ name: '1', mode: 'AND', isActive: 'n' }, a('2'), a('3')]), [], '停用之 1 不算; 2、3 序相同')
        assert.strict.deepEqual(L([a('2'), a('3'), a('1')]), ['1', '2', '3'], '首個 AND 為 2, 物件序為 1')
        //外審 sol#1／minimax#1: 首項相同但其後易位——查無實體之首項(幻影名稱 '1')被伺服端丟棄後, 實際首個 AND 從 G 變成 2
        assert.strict.deepEqual(L([a('1'), a('G'), a('2')]), ['1', '2', 'G'], '首項同為 1, 但 G 與 2 易位')
        assert.strict.deepEqual(L([a('1'), a('2'), a('G')]), [], '整個相對順序相同')
    })

    it('KL-004 getKpLossy: 名稱非字串或空字串、元素非物件者不計(伺服端 arrFinder 以 === 比對)', function() {
        let a = (name) => ({ name, mode: 'AND', isActive: 'y' })
        let o = (name) => ({ name, mode: 'OR', isActive: 'y' })
        assert.strict.deepEqual(getKpLossy([a(2), o(2), a(''), o(''), a(null), o(null), 'x', 5, null]), [])
    })

    it('KL-005 getKpLossy: 回傳不重複之名稱陣列, 不改動輸入', function() {
        let arr = [{ name: 'G1', mode: 'OR', isActive: 'y' }, { name: 'G1', mode: 'AND', isActive: 'y' }, { name: 'G1', mode: 'OR', isActive: 'y' }]
        let before = JSON.stringify(arr)
        assert.strict.deepEqual(getKpLossy(arr), ['G1'])
        assert.strict.equal(JSON.stringify(arr), before)
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

    it('DF-001 crules 各種陣列形式: 伺服端授權之標的 = 編輯器顯示啟用之標的(含停用元素、同名後者覆蓋、數字／布林／null／陣列／物件 name、非物件元素、無 name 元素)', function() {
        let batt = [
            '[{"name":"A","isActive":"y"}]',
            '[{"name":"A","isActive":"y"},{"name":"B","isActive":"n"},{"name":"C","isActive":"y"}]',
            '[{"name":"A","isActive":"n"}]',
            '[{"name":"A"}]',
            '[{"name":"A","isActive":"y"},{"name":"A","isActive":"n"}]',
            '[{"name":"A","isActive":"n"},{"name":"A","isActive":"y"}]',
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

    //cgrups: 伺服端使用者是否經群組 N 取得授權 ⇔ 編輯器(VeCgrups 之讀法: getOwn(kp, N) 之 isActive 為 y)顯示 N 啟用
    let groupNames = ['G1', 'G2', '5', 'G.0']
    let grantedByGroup = (cgrups) => {
        let out = {}
        for (let n of groupNames) {
            let r = getUserRules({ cgrups }, [{ name: n, cpemis: `{"P1":${ON}}` }], [{ name: 'P1', crules: '{"T":"y"}' }], [{ id: 'T' }])
            out[n] = r.rules[0].isActive === 'y'
        }
        return out
    }
    let editorOn = (kp, n) => {
        let ed = getOwn(kp, n, null)
        return !!ed && getOwn(ed, 'isActive', '') === 'y'
    }

    it('DF-003 cgrups 陣列／物件形式: 伺服端經群組授權 ⇔ 編輯器顯示該群組啟用(含停用元素、缺 mode、不合法 mode、非字串 name、非物件元素、同名重複、值內 name)', function() {
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
        ]
        let bad = []
        let nOn = 0
        for (let cgrups of batt) {
            let srv = grantedByGroup(cgrups)
            let kp = cvKpToObj(JSON5.parse(cgrups), HM)
            for (let n of groupNames) {
                nOn += srv[n] ? 1 : 0
                if (srv[n] !== editorOn(kp, n)) {
                    bad.push(`${cgrups} 群組 ${n}: 伺服端 ${srv[n]}、編輯器 ${editorOn(kp, n)}`)
                }
            }
        }
        assert.strict.deepEqual(bad, [], bad.join('\n'))
        assert.strict.ok(nOn >= 8, `對照組: 伺服端授權之格數須夠多, 實得 ${nOn}`)
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

    it('DF-006 缺 mode 之群組元素: 伺服端不授權、編輯器顯示停用、存檔不增權(陣列與物件形式一致; 修前物件形式顯示啟用而存檔補 OR 增權, 為既有缺陷, 此處一併收緊)', function() {
        for (let cgrups of ['[{"name":"G1","isActive":"y"}]', '{"G1":{"isActive":"y"}}']) {
            assert.strict.equal(grantedByGroup(cgrups).G1, false, cgrups)
            let kp = cvKpToObj(JSON5.parse(cgrups), HM)
            assert.strict.equal(editorOn(kp, 'G1'), false, cgrups)
            //存檔(VeCgrups.doSave 形式)後仍不授權
            let p = getOwn(kp, 'G1')
            let saved = { G1: { mode: (p.mode === 'AND' || p.mode === 'OR') ? p.mode : 'OR', isActive: p.isActive === 'y' ? 'y' : 'n' } }
            assert.strict.equal(grantedByGroup(JSON.stringify(saved)).G1, false, `存檔後 ${cgrups}`)
        }
    })


    // ===== 窮舉性質(R-AUTH-ORDER-01／R-AUTH-LOSSY-01): 編輯器存檔後之授權 = 存檔前, 除非解碼判定為「無法無損表示」(此時編輯器拒存) =====

    //受測存檔模擬(同 VeCgrups／VeCpemis.doSave 的資料流): 解碼 → 對話框每個名稱一列(mode 缺漏預設 OR, 啟用與否取解碼結果) → keepKeyOrder(解碼為參考) → 字串
    let saveLike = (raw, names, keep = true) => {
        let kp = cvKpToObj(JSON5.parse(raw), HM)
        let kpNew = Object.create(null)
        for (let n of names) {
            let p = getOwn(kp, n, null)
            let mode = getOwn(p, 'mode', '')
            kpNew[n] = { mode: (mode === 'OR' || mode === 'AND') ? mode : 'OR', isActive: getOwn(p, 'isActive', '') === 'y' ? 'y' : 'n' }
        }
        return JSON.stringify(keep ? keepKeyOrder(kp, kpNew) : kpNew)
    }

    //規則集家族: 標的集合彼此不同使順序／模式差異可觀察; 含 'n' 值(AND 合併對 n 敏感)
    let FAMS = [
        { A: { T1: 'y', T2: 'y' }, B: { T2: 'y', T3: 'y' }, C: { T3: 'y' } },
        { A: { T1: 'y' }, B: { T1: 'y', T2: 'y', T3: 'y' }, C: { T2: 'y' } },
        { A: { T1: 'y', T2: 'y', T3: 'y' }, B: { T1: 'y' }, C: { T1: 'y', T3: 'y' } },
        { A: { T1: 'y', T2: 'y', T3: 'n' }, B: { T2: 'y', T3: 'y', T1: 'n' }, C: { T3: 'y', T2: 'n' } },
        { A: { T1: 'y', T3: 'n' }, B: { T2: 'y', T1: 'n' }, C: { T3: 'y', T1: 'y', T2: 'n' } },
    ]

    //窮舉: names × mode × isActive, 長度 ≤ maxLen 之全部陣列; level 為 'cgrups'(使用者層, 名稱即群組) 或 'cpemis'(群組層, 名稱即權限)
    //ghosts: 出現在陣列元素中、但不在群組(權限)表內之名稱(已刪除或外部多給; 伺服端 arrFinder 查無實體即丟棄, 編輯器對話框亦不列, 存檔時被丟棄)
    let exhaust = (level, names, modes, actives, maxLen, ghosts = []) => {
        let elems = []
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
        let st = { total: 0, equal: 0, lossy: 0, leaks: [], naiveBroken: 0, keepFixed: 0 }
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
                let after = eff(saveLike(raw, names))
                if (lossy.length > 0) {
                    st.lossy++
                    continue //有損: 編輯器拒存(此格不寫出), 不比較
                }
                if (before === after) {
                    st.equal++
                }
                else {
                    st.leaks.push(`${raw}: ${before} → ${after}`)
                }
                //靈敏度: 不保序之舊式存檔(對話框序重寫)在此格是否改變授權、保序後是否修正
                let naive = eff(saveLike(raw, names, false))
                if (naive !== before) {
                    st.naiveBroken++
                    if (after === before) {
                        st.keepFixed++
                    }
                }
            }
        }
        return st
    }
    let chk = (label, st, opt = {}) => {
        assert.strict.deepEqual(st.leaks.slice(0, 5), [], `${label} ${st.leaks.length} 組授權改變而未被判定為有損: ${st.leaks.slice(0, 5).join('\n')}`)
        assert.strict.equal(st.equal + st.lossy, st.total, `${label} 分佈`)
        assert.strict.ok(st.equal > 0, `${label} 相等格數`)
        if (opt.lossy) {
            assert.strict.ok(st.lossy > 0, `${label} 應有被判有損之格(靈敏度)`)
        }
        if (opt.naive) {
            assert.strict.ok(st.naiveBroken > 0 && st.keepFixed > 0, `${label} 靈敏度: 舊式存檔改變授權 ${st.naiveBroken} 格, 保序後修正 ${st.keepFixed} 格`)
        }
    }

    it('PR-001 cgrups 陣列形式窮舉(2 群組 × mode{OR,AND,缺,or} × isActive{y,n}, 長度 ≤ 3, 5 組規則集): 保序存檔後授權相等, 除非判定為有損; 靈敏度: 舊式(不保序)存檔在多格改變授權', function() {
        this.timeout(300000)
        let st = exhaust('cgrups', ['G1', 'G2'], ['OR', 'AND', undefined, 'or'], ['y', 'n'], 3)
        assert.strict.equal(st.total, 4369 * FAMS.length)
        chk('PR-001', st, { lossy: true, naive: true })
    })

    it('PR-001b cgrups: 3 群組(含整數式名稱 1／2, JS 屬性序使其永遠排前面) 各種組合: 保序存檔後授權相等, 除非判定為有損', function() {
        this.timeout(300000)
        chk('PR-001b-1', exhaust('cgrups', ['1', '2'], ['OR', 'AND', undefined], ['y', 'n'], 3), { lossy: true })
        chk('PR-001b-2', exhaust('cgrups', ['G1', '2', '1'], ['OR', 'AND'], ['y'], 3), { lossy: true })
        chk('PR-001b-3', exhaust('cgrups', ['G1', '2', '1'], ['OR', 'AND', undefined], ['y', 'n'], 3), { lossy: true })
        chk('PR-001b-4', exhaust('cgrups', ['G1', 'G2', 'G3'], ['OR', 'AND', undefined], ['y', 'n'], 3), { lossy: true, naive: true })
        chk('PR-001b-5', exhaust('cgrups', ['G1', 'G2', 'G3'], ['OR', 'AND'], ['y', 'n'], 4), { lossy: true, naive: true })
        //幻影名稱(外審 sol#1／minimax#1: 首項為查無實體之整數式名稱時, 丟棄後實際首個 AND 項易位)
        chk('PR-001b-6', exhaust('cgrups', ['G1', '2'], ['OR', 'AND', undefined], ['y', 'n'], 3, ['1']), { lossy: true })
        chk('PR-001b-7', exhaust('cgrups', ['G1', 'G2'], ['OR', 'AND'], ['y'], 3, ['3', 'G9']), { lossy: true })
        chk('PR-001b-8', exhaust('cgrups', ['2', '3'], ['OR', 'AND'], ['y', 'n'], 3, ['1', 'G']), { lossy: true })
    })

    it('PR-003 cpemis 窮舉(同 PR-001 之下一層: 一個群組含 2～3 個權限): 保序存檔後授權相等, 除非判定為有損(mergeRules 同一函數, 權限層同有順序依賴)', function() {
        this.timeout(300000)
        chk('PR-003-1', exhaust('cpemis', ['A', 'B'], ['OR', 'AND', undefined, 'or'], ['y', 'n'], 3), { lossy: true, naive: true })
        chk('PR-003-2', exhaust('cpemis', ['A', 'B', 'C'], ['OR', 'AND', undefined], ['y', 'n'], 3), { lossy: true, naive: true })
        chk('PR-003-3', exhaust('cpemis', ['1', '2', 'A'], ['OR', 'AND', undefined], ['y', 'n'], 3), { lossy: true })
        chk('PR-003-4', exhaust('cpemis', ['A', '2'], ['OR', 'AND', undefined], ['y', 'n'], 3, ['1']), { lossy: true })
    })

    it('PR-004 物件形式窮舉(編輯器自己寫出之形式): 3 個名稱 × 各自 {缺席, (OR|AND|缺 mode) × (y|n)} × 全部鍵序排列 → getKpLossy 恆為空, 保序存檔後授權相等(含鍵序即不變式本身)', function() {
        this.timeout(300000)
        let names = ['G1', 'G2', 'G3']
        let states = [null]
        for (let mode of ['OR', 'AND', undefined]) {
            for (let isActive of ['y', 'n']) {
                states.push({ ...(mode === undefined ? {} : { mode }), isActive })
            }
        }
        let perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]
        let ts = [{ id: 'T1' }, { id: 'T2' }, { id: 'T3' }]
        let pn = ['A', 'B', 'C']
        let leaks = []
        let total = 0
        for (let fam of FAMS) {
            let gs = names.map((n, i) => ({ name: n, cpemis: `{"${pn[i % 3]}":${ON}}` }))
            let ps = pn.map((p) => ({ name: p, crules: JSON.stringify(fam[p]) }))
            let eff = (cgrups) => getUserRules({ cgrups }, gs, ps, ts).rules.map((v) => `${v.name}=${v.isActive}`).join(',')
            for (let s0 of states) {
                for (let s1 of states) {
                    for (let s2 of states) {
                        let ss = [s0, s1, s2]
                        for (let pm of perms) {
                            let o = {}
                            for (let i of pm) {
                                if (ss[i] !== null) {
                                    o[names[i]] = ss[i]
                                }
                            }
                            let raw = JSON.stringify(o)
                            total++
                            assert.strict.deepEqual(getKpLossy(JSON5.parse(raw)), [], `物件形式不得判有損 ${raw}`)
                            let after = eff(saveLike(raw, names))
                            if (eff(raw) !== after) {
                                leaks.push(`${raw}: ${eff(raw)} → ${after}`)
                            }
                        }
                    }
                }
            }
        }
        assert.strict.ok(total > 10000, `格數 ${total}`)
        assert.strict.deepEqual(leaks.slice(0, 5), [], `${leaks.length} 組違規: ${leaks.slice(0, 5).join('\n')}`)
    })

    it('PR-006 編輯後之輸出(外審 minimax#2): 對任一非有損原資料與任一列狀態組合(停用／OR／AND, 含新增整數式名稱), 寫出之物件的授權 = 依預期序(原序在前、新增附加於後)的陣列形式之授權; 若不等, 須由 getKeyOrderLost 判定易位(此時編輯器拒存)', function() {
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
        let n = 0
        let nDiff = 0
        let leaks = []
        for (let fam of FAMS) {
            let gs = names.map((nm, i) => ({ name: nm, cpemis: `{"${pn[i % 3]}":${ON}}` }))
            let ps = pn.map((p) => ({ name: p, crules: JSON.stringify(fam[p]) }))
            let eff = (cgrups) => getUserRules({ cgrups }, gs, ps, ts).rules.map((v) => `${v.name}=${v.isActive}`).join(',')
            for (let arr of origs) {
                let raw = JSON.stringify(arr)
                if (getKpLossy(JSON5.parse(raw)).length > 0) {
                    continue //有損: 編輯器於存檔前即拒存
                }
                let ref = cvKpToObj(JSON5.parse(raw), HM)
                for (let st of states) {
                    let kpNew = Object.create(null)
                    names.forEach((nm, i) => {
                        kpNew[nm] = { mode: st[i] === 2 ? 'AND' : 'OR', isActive: st[i] === 0 ? 'n' : 'y' }
                    })
                    let seq = keyOrderOf(ref, kpNew)
                    let out = keepKeyOrder(ref, kpNew)
                    let intended = eff(JSON.stringify(seq.map((nm) => ({ name: nm, ...kpNew[nm] }))))
                    let actual = eff(JSON.stringify(out))
                    n++
                    if (intended !== actual) {
                        nDiff++
                        if (getKpWriteLost(ref, kpNew).length === 0) { //四個編輯器共用之函數(預期序於內部由 ref 與 kpNew 導出)
                            leaks.push(`${raw} ${st.join('')}: ${intended} → ${actual}`)
                        }
                    }
                }
            }
        }
        assert.strict.deepEqual(leaks.slice(0, 5), [], `${leaks.length} 組輸出授權與預期不同而未被判定: ${leaks.slice(0, 5).join('\n')}`)
        assert.strict.ok(n > 10000 && nDiff > 0, `靈敏度: 共 ${n} 格, 其中輸出授權與預期不同者 ${nDiff} 格(皆已被 getKeyOrderLost 判定)`)
    })

    it('PR-005 兩個具體反例(外審 sol R3#2、run01 PR-004): 同名 AND／OR 並存且另有 AND 名稱 → 判定有損; 兩個 AND 群組且對話框序 ≠ 資料序 → 保序後授權相等', function() {
        let gs = [{ name: 'G1', cpemis: `{"P1":${ON}}` }, { name: 'G2', cpemis: `{"P2":${ON}}` }]
        let ps = [{ name: 'P1', crules: '{"T1":"y","T2":"y"}' }, { name: 'P2', crules: '{"T2":"y"}' }]
        let ts = [{ id: 'T1' }, { id: 'T2' }]
        let eff = (cgrups) => Object.fromEntries(getUserRules({ cgrups }, gs, ps, ts).rules.map((v) => [v.name, v.isActive]))
        //反例 1(sol R3#2): 無法無損表示 → 判定有損(編輯器拒存), 若硬寫(保留 AND 支)會 T1 由 n 變 y
        let c1 = '[{"name":"G1","mode":"AND","isActive":"y"},{"name":"G2","mode":"AND","isActive":"y"},{"name":"G2","mode":"OR","isActive":"y"}]'
        assert.strict.deepEqual(eff(c1), { T1: 'n', T2: 'y' })
        assert.strict.deepEqual(getKpLossy(JSON5.parse(c1)), ['G2'])
        assert.strict.deepEqual(eff(JSON.stringify({ G1: { mode: 'AND', isActive: 'y' }, G2: { mode: 'AND', isActive: 'y' } })), { T1: 'y', T2: 'y' }, '硬寫即增權(證明拒存之必要)')
        //反例 2(run01 PR-004): 資料序 G1,G2、對話框(群組表)序 G2,G1; 舊式依對話框序重寫即 T2 由 n 變 y; 保序後相等
        ps = [{ name: 'P1', crules: '{"T1":"y"}' }, { name: 'P2', crules: '{"T2":"y"}' }] //此例規則集互斥(兩個 AND 項互為對方之限制)
        let c2 = '[{"name":"G1","mode":"AND","isActive":"y"},{"name":"G2","mode":"AND","isActive":"y"}]'
        assert.strict.deepEqual(eff(c2), { T1: 'y', T2: 'n' })
        assert.strict.deepEqual(getKpLossy(JSON5.parse(c2)), [])
        assert.strict.deepEqual(eff(saveLike(c2, ['G2', 'G1'], false)), { T1: 'n', T2: 'y' }, '舊式(不保序)增權')
        assert.strict.deepEqual(eff(saveLike(c2, ['G2', 'G1'])), { T1: 'y', T2: 'n' }, '保序後相等')
        //物件形式同
        let c3 = '{"G1":{"mode":"AND","isActive":"y"},"G2":{"mode":"AND","isActive":"y"}}'
        assert.strict.deepEqual(eff(saveLike(c3, ['G2', 'G1'])), eff(c3))
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

    it('SITE-AD-003 以對話框序重寫授權字串之三個直接編輯器皆經 keepKeyOrder(R-AUTH-ORDER-01; 兩個關聯對話框之鍵序由解碼序構成、無重排); 四個帶 mode 者另經 getKpLossy 並於有損時以 authLossyBlocked 拒存(R-AUTH-LOSSY-01); 名稱代入用 fmtLossyMsg', function() {
        let txt = (fn) => fs.readFileSync(path.join(fdRoot, 'src', 'components', `${fn}.vue`), 'utf8')
        for (let fn of ['VeCgrups', 'VeCpemis', 'VeCrules']) {
            assert.strict.ok(/import keepKeyOrder/.test(txt(fn)), `${fn} 須 import keepKeyOrder`)
            assert.strict.ok(/keepKeyOrder\(/.test(txt(fn)), `${fn} 須呼叫 keepKeyOrder(`)
        }
        //寫出前之輸出側守門一律經共用函數 getKpWriteLost(kpRef, kpNew)(預期序於函數內由參考與欲寫出之物件導出; 呼叫端不得自行傳序——關聯對話框曾以已套用 JS 屬性序之物件序當預期序而守門恆空, 外審 minimax 第二輪#1)
        for (let [fn, ref, nw] of [['VeCgrups', 'vo.kpOrig', 'kpGrup'], ['VeCpemis', 'vo.kpOrig', 'kpPemi'], ['VeGrupBlngUsers', 'kpGrup', 'kpGrupNew'], ['VePemiBlngGrups', 'kpPemi', 'kpPemiNew']]) {
            let t = txt(fn)
            assert.strict.ok(t.includes(`getKpWriteLost(${ref}, ${nw})`), `${fn} 須呼叫 getKpWriteLost(${ref}, ${nw})(參考=解碼後之原資料)`)
            assert.strict.ok(!/getKeyOrderLost\(|keyOrderOf\(|seqNew/.test(t), `${fn} 不得自行傳入預期序(getKeyOrderLost／keyOrderOf／seqNew)`)
        }
        for (let fn of ['VeCgrups', 'VeCpemis', 'VeGrupBlngUsers', 'VePemiBlngGrups']) {
            let t = txt(fn)
            assert.strict.ok(/import getKpLossy from '\.\.\/js\/getKpLossy\.mjs'/.test(t), `${fn} 須 import getKpLossy`)
            assert.strict.ok(/getKpLossy\(/.test(t), `${fn} 須呼叫 getKpLossy(`)
            assert.strict.ok(/import getKpWriteLost from '\.\.\/js\/getKpWriteLost\.mjs'/.test(t), `${fn} 須 import getKpWriteLost`)
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
        assert.strict.ok(/authLossyBlocked: \{[^\n]*\n\s*eng: [^\n]*\{names\}[^\n]*\n\s*cht: [^\n]*\{names\}/.test(lang), 'procLang 須有 authLossyBlocked 之 eng／cht 且含 {names}')
    })

    it('SITE-AD-002 伺服端 getUserRules 之解碼與編輯器共用同一份 cvKpToArr(mShare.mjs 不再內嵌一份)', function() {
        let txt = fs.readFileSync(path.join(fdRoot, 'src', 'plugins', 'mShare.mjs'), 'utf8')
        assert.strict.ok(/import cvKpToArr from '\.\.\/js\/cvKpToArr\.mjs'/.test(txt), 'mShare.mjs 須 import cvKpToArr')
        assert.strict.ok(!/let cvKpToArr = /.test(txt), 'mShare.mjs 不得再內嵌 let cvKpToArr = …')
    })

})
