//授權資料「衝突提示」之偵測與文字(src/js/getAuthWarn.mjs; 規則帳本 R-PRINCIPLE-00 原則 3「遇衝突:收嚴＋提示」與適用表 a～g)
//以及共用之找列 findRefRows、mode 有效值 getEffMode／合法性 isAuthMode(伺服端 getUserRules 與頁面提示共用之判準)
//
//警告碼(引用清單 cgrups／cpemis, 只有 isActive 為 'y' 之項目才有警告——停用項目不參與合併, R-AUTH-MERGE-00 第 5 條):
//  dangling(c 懸空)、ambiguous(d 同名多列)、modeInvalid(e mode 缺或非法 → 視為 AND)、bothModes(b 同名同時 OR 與 AND → 拒存)、emptyName(f 名稱為 "")、noName(f 名稱非字串 → 拒存)
//規則清單 crules: ruleConflict(a 同一管理對象重複列且有勾與沒勾並存 → 所有列皆勾才勾)
//每條斷言之依據標於註解(R-PRINCIPLE-00 適用表之字母).
//跑法: node node_modules/mocha/bin/mocha.js test/unit-getAuthWarn.test.mjs
import assert from 'assert'
import JSON5 from 'json5'
import { CODES, getRefWarns, getRuleWarns, countAndRefs, fmtWarn, getRefWarnText, getItemWarnText, getRuleWarnText } from '../src/js/getAuthWarn.mjs'
import findRefRows from '../src/js/findRefRows.mjs'
import getEffMode from '../src/js/getEffMode.mjs'
import isAuthMode from '../src/js/isAuthMode.mjs'
import procLang from '../server/procLang.mjs'


let OR = { mode: 'OR', isActive: 'y' }
let AND = { mode: 'AND', isActive: 'y' }
let js = (o) => JSON.stringify(o)
let rowsOf = (...names) => names.map((name, k) => ({ id: `id${k}`, name }))
//名稱 → 警告碼之一般物件(kpWarns 為無原型物件, 比對前轉一般物件)
let warnsOf = (res) => Object.fromEntries(Object.keys(res.kpWarns).map((k) => [k, res.kpWarns[k]]))

//原型鍵名以變數取用(無原型容器之自有屬性; 避免 no-proto 規則誤判為存取原型)
let PROTO = '__proto__'

let LANG = procLang({})
let tOf = (lang) => (key) => LANG[lang][key]


describe('unit-getAuthWarn (授權資料衝突提示, R-PRINCIPLE-00 原則 3)', function() {

    describe('getRefWarns(引用清單 cgrups／cpemis)', function() {

        it('GW-001-dangling(c): 啟用之引用名稱查無列 → dangling; 查得者無警告; 停用之查無引用無警告(不參與)', function() {
            let res = getRefWarns(js({ G1: AND, G2: OR, G3: { mode: 'AND', isActive: 'n' } }), rowsOf('G2'))
            assert.deepStrictEqual(warnsOf(res), { G1: ['dangling'] })
            assert.deepStrictEqual(res.byCode.dangling, ['G1'])
            assert.strictEqual(res.count, 1)
            assert.strictEqual(res.hasWarn, true)
            assert.deepStrictEqual(res.items.map((x) => [x.name, x.nMatch, x.warns]), [['G1', 0, ['dangling']], ['G2', 1, []], ['G3', -1, []]])
        })

        it('GW-002-ambiguous(d): 名稱對到 ≥ 2 列 → ambiguous(nMatch 為列數); 精確 ===(大小寫、空白不同者非同名)', function() {
            let res = getRefWarns(js({ G1: OR, g1: OR }), [...rowsOf('G1', 'G1', 'G1'), ...rowsOf('g1 ')])
            assert.deepStrictEqual(warnsOf(res), { G1: ['ambiguous'], g1: ['dangling'] })
            assert.strictEqual(res.items[0].nMatch, 3)
        })

        it('GW-003-modeInvalid(e): mode 缺、"or"、"XOR"、""、1、null、true → modeInvalid, effMode 為 AND; OR／AND 無此警告', function() {
            for (let m of [undefined, 'or', 'XOR', '', 1, null, true]) {
                let ent = { isActive: 'y', ...(m === undefined ? {} : { mode: m }) }
                let res = getRefWarns(js({ G1: ent }), rowsOf('G1'))
                assert.deepStrictEqual(warnsOf(res), { G1: ['modeInvalid'] }, `mode=${String(m)}`)
                assert.strictEqual(res.items[0].effMode, 'AND')
            }
            for (let ent of [OR, AND]) {
                assert.strictEqual(getRefWarns(js({ G1: ent }), rowsOf('G1')).hasWarn, false)
            }
            //物件形式之純量值(cvKpToArr 解為 { isActive: 'y' }, 無 mode)亦為 modeInvalid
            assert.deepStrictEqual(warnsOf(getRefWarns('{"G1":"y"}', rowsOf('G1'))), { G1: ['modeInvalid'] })
        })

        it('GW-004-bothModes(b): 同名啟用項之有效模式同時 OR 與 AND(含缺 mode 視為 AND)→ 兩項皆 bothModes; 同模式重複、一邊停用 → 無', function() {
            let res = getRefWarns(js([{ name: 'G1', ...OR }, { name: 'G1', ...AND }, { name: 'G2', ...OR }, { name: 'G2', ...OR }, { name: 'G3', ...OR }, { name: 'G3', mode: 'AND', isActive: 'n' }]), rowsOf('G1', 'G2', 'G3'))
            assert.deepStrictEqual(warnsOf(res), { G1: ['bothModes'] })
            assert.deepStrictEqual(res.items.map((x) => x.warns), [['bothModes'], ['bothModes'], [], [], [], []])
            assert.deepStrictEqual(res.byCode.bothModes, ['G1'], 'byCode 名稱不重複')
            assert.strictEqual(res.count, 2, 'count 為有警告之項目數')
            let res2 = getRefWarns(js([{ name: 'G1', ...OR }, { name: 'G1', isActive: 'y' }]), rowsOf('G1'))
            assert.deepStrictEqual(warnsOf(res2), { G1: ['bothModes', 'modeInvalid'] }, '缺 mode 視為 AND, 與 OR 並存(複合警告)')
        })

        it('GW-005-emptyName(f): 名稱為 "" → emptyName(byCode 以 "" 之可見形式 \'""\' 表示); 無名稱為 "" 之列時另有 dangling; 列無 name 欄視為 ""', function() {
            let res = getRefWarns(js([{ name: '', ...OR }]), rowsOf('G1'))
            assert.deepStrictEqual(warnsOf(res), { '': ['dangling', 'emptyName'] })
            assert.deepStrictEqual(res.byCode.emptyName, ['""'])
            assert.deepStrictEqual(res.byCode.dangling, ['""'])
            assert.deepStrictEqual(warnsOf(getRefWarns(js({ '': OR }), rowsOf(''))), { '': ['emptyName'] })
            assert.deepStrictEqual(warnsOf(getRefWarns(js({ '': OR }), [{ id: 'x' }])), { '': ['emptyName'] }, '列無 name 欄 → 視為 "", 相符')
        })

        it('GW-006-noName(f): 啟用而名稱非字串(陣列元素無 name、數字 name、null name、非物件元素 "y")→ noName, 以 #序號(1 起算)表示, 不入 kpWarns; 停用者無警告', function() {
            let res = getRefWarns(js([{ ...AND }, { name: 5, ...OR }, 'y', { name: null, ...AND }, { name: 7, mode: 'OR', isActive: 'n' }, 'x', { name: 'G1', ...OR }]), rowsOf('G1'))
            assert.deepStrictEqual(res.byCode.noName, ['#1', '#2', '#3', '#4'])
            assert.deepStrictEqual(warnsOf(res), {}, 'kpWarns 只含名稱為字串者')
            assert.strictEqual(res.count, 4)
            assert.deepStrictEqual(res.items.map((x) => x.nMatch), [-1, -1, -1, -1, -1, -1, 1])
        })

        it('GW-007-複合: 同一項同時懸空、mode 非法、名稱 ""(警告碼依偵測順序); 物件與陣列兩形式結果相同', function() {
            let obj = getRefWarns(js({ '': { mode: 'or', isActive: 'y' }, 'G9': { isActive: 'y' } }), [])
            let arr = getRefWarns(js([{ name: '', mode: 'or', isActive: 'y' }, { name: 'G9', isActive: 'y' }]), [])
            assert.deepStrictEqual(warnsOf(obj), { '': ['dangling', 'modeInvalid', 'emptyName'], 'G9': ['dangling', 'modeInvalid'] })
            assert.deepStrictEqual(warnsOf(arr), warnsOf(obj))
            assert.deepStrictEqual(arr.byCode, obj.byCode)
            assert.deepStrictEqual(Object.keys(obj.byCode), CODES, 'byCode 含全部警告碼(無者為空陣列)')
        })

        it('GW-008-空字串／null／undefined／數字(非字串輸入)→ 無項目、無警告; 損壞字串／非物件字串(not json、{oops、null、5)→ 無項目但有 unparsable 警告(伺服端視為空、頁面提示, run05 外審 sol R8); 非物件元素(停用)無警告; 已解析之物件亦可輸入', function() {
            for (let c of ['', '   ', null, undefined, 5]) {
                let res = getRefWarns(c, rowsOf('G1'))
                assert.deepStrictEqual([res.items.length, res.count, res.hasWarn], [0, 0, false], `c=${String(c)}`)
            }
            for (let c of ['not json', '{oops', 'null', '5']) {
                let res = getRefWarns(c, rowsOf('G1'))
                assert.deepStrictEqual([res.items.length, res.count, res.hasWarn, res.byCode.unparsable.length], [0, 1, true, 1], `c=${String(c)}`)
            }
            assert.strictEqual(getRefWarns(js(['x', 5, null, true]), []).hasWarn, false)
            assert.deepStrictEqual(warnsOf(getRefWarns({ G1: AND }, [])), { G1: ['dangling'] }, '已解析之物件')
        })

        it('GW-009-原型鍵名(__proto__、constructor、toString)為一般名稱: kpWarns 為無原型物件、鍵為自有屬性; 與名稱相同之列精確比對', function() {
            let c = '{"__proto__":{"mode":"AND","isActive":"y"},"constructor":{"mode":"OR","isActive":"y"},"toString":{"mode":"or","isActive":"y"}}'
            assert.deepStrictEqual(Object.keys(JSON5.parse(c)), ['__proto__', 'constructor', 'toString'], '前提: JSON5 解析為自有屬性')
            let res = getRefWarns(c, rowsOf('constructor', 'toString'))
            assert.strictEqual(Object.getPrototypeOf(res.kpWarns), null)
            assert.deepStrictEqual(Object.keys(res.kpWarns), ['__proto__', 'toString'])
            assert.deepStrictEqual(res.kpWarns[PROTO], ['dangling'])
            assert.deepStrictEqual(res.kpWarns.toString, ['modeInvalid'])
            assert.ok(!Object.prototype.hasOwnProperty.call(res.kpWarns, 'constructor'))
            //陣列形式同名 __proto__ 同時 OR 與 AND
            let res2 = getRefWarns(js([{ name: '__proto__', ...OR }, { name: '__proto__', ...AND }]), rowsOf('__proto__'))
            assert.deepStrictEqual(res2.kpWarns[PROTO], ['bothModes'])
        })

    })


    describe('getRuleWarns(規則清單 crules, a)', function() {

        it('GW-101-同一管理對象重複列且 y 與 n 並存 → 衝突(n 列數、nY 勾選列數); 全 y、全 n(含非 y 之值)重複不算; 物件形式恆無衝突', function() {
            let r = (arr) => getRuleWarns(js(arr))
            let res = r([{ name: 'T1', isActive: 'y' }, { name: 'T1', isActive: 'n' }, { name: 'T2', isActive: 'y' }, { name: 'T2', isActive: 'y' }, { name: 'T3', isActive: 'n' }, { name: 'T3' }, { name: 'T4', isActive: 'yes' }, { name: 'T4', isActive: 'n' }])
            assert.deepStrictEqual(res.conflicts, [{ name: 'T1', n: 2, nY: 1 }])
            assert.deepStrictEqual(res.names, ['T1'])
            assert.deepStrictEqual([res.count, res.hasWarn], [1, true])
            assert.deepStrictEqual(r([{ name: 'T1', isActive: 'y' }, { name: 'T1', isActive: 'y' }, { name: 'T1', isActive: 'n' }]).conflicts, [{ name: 'T1', n: 3, nY: 2 }])
            assert.strictEqual(getRuleWarns(js({ T1: 'y', T2: 'n' })).hasWarn, false)
            assert.deepStrictEqual([getRuleWarns('not json').hasWarn, getRuleWarns('not json').unparsable], [true, true], '損壞字串: 無法判讀, 提示(伺服端視為空)')
            assert.strictEqual(getRuleWarns('').hasWarn, false, '空字串為新增列預設值, 不算損壞')
        })

        it('GW-102-名稱依屬性鍵轉型合併(5 與 "5" 同鍵, 同伺服端); 轉型必拋者(如 { toString: null })略過不拋錯; __proto__ 為一般鍵', function() {
            let res = getRuleWarns([{ name: 5, isActive: 'y' }, { name: '5', isActive: 'n' }, { name: { toString: null }, isActive: 'y' }, { name: { toString: null }, isActive: 'n' }, { name: '__proto__', isActive: 'y' }, { name: '__proto__', isActive: 'n' }])
            assert.deepStrictEqual(res.names, ['5', '__proto__'])
            assert.strictEqual(Object.getPrototypeOf(res.kpConflict), null)
            assert.strictEqual(res.kpConflict[PROTO], true)
        })

    })


    describe('countAndRefs(刪除前提示影響數, c)', function() {

        it('GW-301-有效模式為 AND(含 mode 缺／非法)、啟用、名稱屬被刪者且刪除後無同名剩餘列之引用者計入; OR、停用、未刪、損壞者不計; 陣列與物件形式皆可', function() {
            let users = [
                { id: 'u1', cgrups: js({ G1: AND }) },
                { id: 'u2', cgrups: js({ G1: OR }) },
                { id: 'u3', cgrups: js({ G1: { isActive: 'y' } }) },
                { id: 'u4', cgrups: js({ G1: { mode: 'or', isActive: 'y' } }) },
                { id: 'u5', cgrups: js({ G1: { mode: 'AND', isActive: 'n' } }) },
                { id: 'u6', cgrups: js({ G2: AND }) },
                { id: 'u7', cgrups: js([{ name: 'G1', ...AND }]) },
                { id: 'u8', cgrups: 'oops' },
                null,
                { id: 'u9', cgrups: js({ G1: OR, G3: AND }) },
            ]
            let res = countAndRefs(users, 'cgrups', ['G1', 'G3'], rowsOf('G2'))
            assert.deepStrictEqual(res.holders.map((h) => h.id), ['u1', 'u3', 'u4', 'u7', 'u9'])
            assert.strictEqual(res.n, 5)
            //刪除後仍有同名剩餘列(歷史同名刪其一)→ 不計(引用仍對到列)
            assert.strictEqual(countAndRefs(users, 'cgrups', ['G1'], rowsOf('G1')).n, 0)
            //群組之 cpemis 同理
            assert.strictEqual(countAndRefs([{ id: 'g1', cpemis: js({ P1: AND }) }, { id: 'g2', cpemis: js({ P1: OR }) }], 'cpemis', ['P1'], []).n, 1)
        })

    })


    describe('fmtWarn 與 tooltip 文字(eng＋cht)', function() {

        it('GW-401-fmtWarn: {names}／{kind}／{n} 以 split／join 代入(名稱含 $&、$$、$\'、$` 原樣); 同一佔位符多次皆代入; 名稱超過 5 個加省略號; 未給之佔位符保留', function() {
            let bt = '$' + String.fromCharCode(96)
            let sq = '$' + String.fromCharCode(39)
            assert.strictEqual(fmtWarn('[{names}] {names}', { names: ['$&', '$$', sq, bt] }), `[$&, $$, ${sq}, ${bt}] $&, $$, ${sq}, ${bt}`)
            assert.strictEqual(fmtWarn('{kind}:{n}', { kind: '$&', n: 3 }), '$&:3')
            assert.strictEqual(fmtWarn('{names}', { names: ['1', '2', '3', '4', '5', '6'] }), '1, 2, 3, 4, 5 …')
            assert.strictEqual(fmtWarn('{names}/{kind}', { names: ['A'] }), 'A/{kind}')
            //run05 外審 sol R11: 名稱本身含 {kind}／{n}／{names} 字樣時不得被二次代入(只掃描範本一次)
            assert.strictEqual(fmtWarn('Not found in the {kind} list: {names}.', { names: ['G-{kind}', 'H-{n}', 'I-{names}'], kind: 'permission group', n: 7 }), 'Not found in the permission group list: G-{kind}, H-{n}, I-{names}.')
            assert.strictEqual(fmtWarn('{n}:{kind}', { n: '{kind}', kind: '{n}' }), '{kind}:{n}')
        })

        it('GW-402-兩語系之警告語系鍵齊備; 各警告碼之 tooltip(getItemWarnText)非空、已代入名稱與種類、無殘留佔位符; emptyName 之範本不含名稱(名稱即空字串)', function() {
            let keys = ['warnKindGrup', 'warnKindPemi', 'warnRefDangling', 'warnRefAmbiguous', 'warnRefModeInvalid', 'warnRefBothModes', 'warnRefEmptyName', 'warnRefNoName', 'warnDataUnparsable', 'warnRuleConflict', 'warnNameHistDup', 'warnDupRowsInconsistent', 'confirmDelRefsGrup', 'confirmDelRefsPemi']
            for (let lang of ['eng', 'cht']) {
                let $t = tOf(lang)
                for (let k of keys) {
                    assert.ok(typeof $t(k) === 'string' && $t(k).length > 0, `${lang} ${k}`)
                }
                for (let kindKey of ['warnKindGrup', 'warnKindPemi']) {
                    for (let code of CODES.filter((x) => x !== 'unparsable')) { //unparsable 為整個字串之警告(無名稱), 不屬單一項目; 見 GW-008／GW-101
                        let name = code === 'emptyName' ? '' : (code === 'noName' ? '#2' : 'N$&1')
                        let s = getItemWarnText([code], name, $t, kindKey)
                        assert.ok(s.length > 0, `${lang} ${code}`)
                        assert.ok(!/\{(names|kind|n)\}/.test(s), `${lang} ${code} 無殘留佔位符: ${s}`)
                        if (code !== 'emptyName') {
                            assert.ok(s.includes(name), `${lang} ${code} 已代入名稱: ${s}`)
                        }
                        if ($t(`warnRef${code[0].toUpperCase()}${code.slice(1)}`).includes('{kind}')) {
                            assert.ok(s.includes($t(kindKey)), `${lang} ${code} 已代入種類`)
                        }
                    }
                }
                //多碼: 每碼一行, 依 CODES 之序; 不在其中者略過; 非陣列 → 空字串
                let multi = getItemWarnText(['modeInvalid', 'dangling'], 'G1', $t, 'warnKindGrup')
                assert.deepStrictEqual(multi.split('\n').length, 2)
                assert.ok(multi.indexOf(fmtWarn($t('warnRefDangling'), { names: ['G1'], kind: $t('warnKindGrup') })) === 0, 'dangling 在前(CODES 之序)')
                assert.strictEqual(getItemWarnText(null, 'G1', $t, 'warnKindGrup'), '')
                assert.strictEqual(getItemWarnText([], 'G1', $t, 'warnKindGrup'), '')
            }
        })

        it('GW-403-儲存格 tooltip(getRefWarnText): 每種警告一行(依 CODES 之序), 名稱已代入; 無警告為空字串; 規則清單(getRuleWarnText)代入管理對象名稱', function() {
            for (let lang of ['eng', 'cht']) {
                let $t = tOf(lang)
                let res = getRefWarns(js([{ name: 'GX', ...AND }, { name: 'G1', mode: 'or', isActive: 'y' }, { name: '', ...OR }, { ...AND }]), rowsOf('G1', ''))
                let s = getRefWarnText(res, $t, 'warnKindPemi')
                let lines = s.split('\n')
                assert.strictEqual(lines.length, 4, `${lang}: dangling、modeInvalid、emptyName、noName 各一行: ${s}`)
                assert.ok(lines[0].includes('GX') && lines[1].includes('G1') && lines[3].includes('#4'))
                assert.ok(!/\{(names|kind|n)\}/.test(s))
                assert.strictEqual(getRefWarnText(getRefWarns(js({ G1: OR }), rowsOf('G1')), $t, 'warnKindGrup'), '')
                let rw = getRuleWarns(js([{ name: 'T$&', isActive: 'y' }, { name: 'T$&', isActive: 'n' }]))
                let rs = getRuleWarnText(rw, $t)
                assert.ok(rs.includes('T$&') && !/\{names\}/.test(rs), `${lang}: ${rs}`)
                assert.strictEqual(getRuleWarnText(getRuleWarns('[]'), $t), '')
            }
        })

    })


    describe('findRefRows／getEffMode／isAuthMode(共用判準)', function() {

        it('GW-501-findRefRows: 回傳全部相符列(依表序; 0＝懸空、≥2＝歷史同名); 精確 ===; 列為 null／無 name 欄 → 名稱 ""; 非字串名稱只與 === 之列相符; rows 非陣列 → []', function() {
            let a1 = { name: 'A', k: 1 }
            let a2 = { name: 'A', k: 2 }
            assert.deepStrictEqual(findRefRows([a1, { name: 'B' }, a2], 'A'), [a1, a2])
            assert.deepStrictEqual(findRefRows([a1], 'X'), [])
            assert.deepStrictEqual(findRefRows([a1], 'a'), [], '大小寫不同')
            assert.deepStrictEqual(findRefRows([null, { k: 3 }, { name: '' }], '').length, 3)
            assert.deepStrictEqual(findRefRows([{ name: '5' }], 5), [])
            assert.deepStrictEqual(findRefRows([{ name: 5 }], 5).length, 1)
            for (let rows of [null, undefined, 'A', { 0: a1, length: 1 }]) {
                assert.deepStrictEqual(findRefRows(rows, 'A'), [])
            }
        })

        it('GW-502-getEffMode: "OR" 為 OR, 其餘(AND、缺、or、XOR、""、數字、null、物件)一律 AND; isAuthMode 只認 "OR"／"AND"', function() {
            assert.strictEqual(getEffMode('OR'), 'OR')
            for (let m of ['AND', undefined, 'or', 'Or', 'XOR', '', ' OR', 'AND ', 1, 0, null, true, {}, ['OR']]) {
                assert.strictEqual(getEffMode(m), 'AND', `getEffMode(${JSON.stringify(m)})`)
            }
            assert.deepStrictEqual(['OR', 'AND', 'or', undefined, null, 'AND ', ['OR']].map(isAuthMode), [true, true, false, false, false, false, false])
        })

    })

})
