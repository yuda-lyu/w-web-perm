//新增撞「懸空名」之影響計算與確認框文字(run07 UI1; F-23／F-26 原則 7「新增同名群組／權限／標的撞仍被啟用中引用之懸空名: 允許, 但新增前彈確認框列出受影響之引用端並由使用者按是才送出」;
//規則帳本 R-PRINCIPLE-00 原則 3「遇衝突或歧義: 收嚴＋提示」; src/js/getAddImpact.mjs)
//
//述語(規格句):
//  AI-1 新增列(id 不在基準, 缺 id 亦為新增)之名稱(群組／權限為 name、標的為 id)在基準內無任何同名實體(含歷史同名、本次一併刪除或改名之舊列仍算有同名實體)者, 才為「撞懸空名」; 既有列(含改名)不是新增;
//  AI-2 受影響之引用端: 授權字串(users.cgrups／grups.cpemis／pemis.crules)解碼後, 有 isActive 為 'y' 且名稱指向該新名稱之項目者(停用項目、壞 JSON、空字串、非容器皆不計; 外部列亦計); 一列引用多個新名稱只計一次;
//  AI-3 nAnd: 引用端中至少有一個此類項目之有效模式為 AND 者(mode 缺／非 OR 一律視為 AND, getEffMode, 與刪除確認框 countAndRefs 一致); 標的之 crules 項目無 mode(mergeRules 之規則只取 isActive), nAnd 恆為 0;
//  AI-4 真理源為 getUserRules／mergeRules, 單向: 「授權確有改變者必被計入」(新增該實體後引用端〔其使用者〕之有效授權確有改變 ⇒ nHolders 計入; 以真函數前後比對, 無漏報、不低報);
//        反向(被計入 ⇒ 授權確有改變)**不成立, 亦非規格要求**(run07 外審 sol R6 裁示: 原宣稱之「被計入 ⇔ 授權確有改變」雙向等價, 與實作口徑不符, 改為單向): 計數口徑為「引用命中」(啟用中之引用指向新名稱),
//        不模擬授權之合併結果, 故下列情形會多計(寧多提示, 非規格要求之精確; 以 AI-405 現況刻畫, 若日後改為更精確之計數須同步改寫 AI-405 而不影響單向保證):
//        ①限制項(mode 缺／非法)單獨存在之使用者引用新增之有授權群組(真授權新增前後皆無; 另報 nAnd=1);
//        ②合法 OR 引用新增之「無權限」群組(cpemis 空)／權限(crules 空)(真授權新增前後不變);
//        AI-406 以窮舉小積空間(引用項模式 × 啟用 × 有無他群組 × 新實體之授權內容)對真 getUserRules 逐格驗證單向保證;
//  AI-5 names 為受影響之新名稱(依 rowsNew 次序、去重、至多 5 個), nNames 為總數; 確認框文字依頁面種類選語系鍵(Grup／Pemi 之 AND 句、Target 無 AND 句), 單一框單一問句, eng／cht 皆代入完整, 名稱內之 {n}／$& 等字樣原樣;
//  AI-6 站點: 群組頁／權限頁／標的頁於 doSave 送出前、開 loading 前彈確認框(unlockBtn → showCheckYesNo → 選否 return), 與改名／刪除預覽依序; 使用者頁不套用; 四頁 $fapi.updateXxx 皆帶 { baseline }(與 rows 同刻擷取).
//
//跑法: npx mocha test/unit-getAddImpact.test.mjs --reporter list --timeout 30000
import assert from 'assert'
import path from 'path'
import { fileURLToPath } from 'url'
import cloneDeep from 'lodash-es/cloneDeep.js'
import { getUserRules } from '../src/plugins/mShare.mjs'
import { getAddImpact, getAddConfirmText } from '../src/js/getAddImpact.mjs'
import procLang from '../server/procLang.mjs'
import { sourceLines } from './tools/srcScan.mjs'


const projRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const LANG = procLang({})

let OR = (isActive = 'y') => ({ mode: 'OR', isActive })
let AND = (isActive = 'y') => ({ mode: 'AND', isActive })
let J = (o) => JSON.stringify(o)
let T = (ids) => ids.map((id) => ({ id }))

//quiet: getUserRules 遇壞 JSON 會 console.log 錯誤(伺服端既有行為), 夾具刻意含壞 JSON, 呼叫期間靜音以免淹沒測試輸出
let quiet = (fn) => {
    let o = console.log
    console.log = () => {}
    try {
        return fn()
    }
    finally {
        console.log = o
    }
}

//ySet: 有效授權中為 y 之規則名(排序); rulesY: 以真 getUserRules 取該使用者之有效授權
let ySet = (rules) => rules.filter((r) => r.isActive === 'y').map((r) => r.name).sort()
let rulesY = (user, grups, pemis, targets) => quiet(() => ySet(getUserRules(user, grups, pemis, targets).rules))


describe('unit-getAddImpact (新增撞懸空名之影響與確認框, 設計原則 7)', function() {

    // ===== AI-4: 以真 getUserRules 為真理之夾具 =====
    describe('AI-4 授權確有改變者必被計入(單向, 無漏報; 真 getUserRules 前後比對; 反向不保證, 見 AI-405 現況刻畫)', function() {

        // 夾具 A: 群組頁新增 G／H(引用端為使用者 cgrups)
        let fxGrup = () => {
            let targets = T(['T1', 'T2'])
            let pemis = [
                { id: 'p1', name: 'P1', crules: J({ T1: 'y' }) },
                { id: 'p2', name: 'P2', crules: J({ T1: 'y', T2: 'y' }) },
            ]
            let grupsOld = [{ id: 'g0', name: 'Base', cpemis: J({ P1: OR() }) }]
            let gNew = [
                { id: 'gn1', name: 'G', cpemis: J({ P2: OR() }), _isNew: true },
                { id: 'gn2', name: 'H', cpemis: J({ P1: OR() }), _isNew: true },
            ]
            // [id, cgrups, 預期計入, 預期 AND, 預期授權改變(真函數)]
            let us = [
                ['u-or', J({ G: OR() }), true, false, true],
                ['u-and-only', J({ G: AND() }), true, true, true],
                ['u-and-base', J({ Base: OR(), G: AND() }), true, true, true],
                ['u-nomode', J({ Base: OR(), G: { isActive: 'y' } }), true, true, true],
                ['u-badmode-XOR', J({ Base: OR(), G: { mode: 'XOR', isActive: 'y' } }), true, true, true],
                ['u-badmode-lower', J({ Base: OR(), G: { mode: 'or', isActive: 'y' } }), true, true, true],
                ['u-inactive', J({ G: OR('n') }), false, false, false],
                ['u-inactive-and', J({ Base: OR(), G: AND('n') }), false, false, false],
                ['u-base-only', J({ Base: OR() }), false, false, false],
                ['u-multi', J({ G: OR(), H: OR() }), true, false, true],
                ['u-multi-and', J({ G: AND(), H: OR() }), true, true, true],
                ['u-array', J([{ name: 'G', mode: 'OR', isActive: 'y' }]), true, false, true],
                ['u-array-and', J([{ name: 'H', mode: 'AND', isActive: 'y' }]), true, true, true],
                ['u-lim-alone', J({ G: { isActive: 'y' } }), true, true, false], //現況刻畫(寧多提示, 非規格要求之精確; AI-405): mode 缺單獨存在 → mergeRules 全 n, 新增前後皆無授權, 而計入且 nAnd=1
                ['u-bad-json', '{bad', false, false, false],
                ['u-empty', '', false, false, false],
                ['u-scalar', '5', false, false, false],
                ['u-null', 'null', false, false, false],
            ]
            let users = us.map(([id, cgrups, counted, and, changed]) => ({ id, name: id, cgrups, from: '', _x: { counted, and, changed } }))
            users.push({ id: 'u-ext', name: 'u-ext', cgrups: J({ G: OR() }), from: 'sso', _x: { counted: true, and: false, changed: true } }) //外部引用端列亦計
            return { targets, pemis, grupsOld, gNew, users }
        }

        it('AI-401 群組頁: 逐使用者 changed 與夾具預期一致(驗證夾具本身), 授權確有改變者必被計入(計入集合 ⊇ 授權改變集合, 不低報; 反向不要求), nHolders／nAnd／names 與預期相符', function() {
            let { targets, pemis, grupsOld, gNew, users } = fxGrup()
            let rowsNew = [...grupsOld, ...gNew]
            let counted = []
            let andN = 0
            for (let u of users) {
                let before = rulesY(u, grupsOld, pemis, targets)
                let after = rulesY(u, rowsNew, pemis, targets)
                let changed = JSON.stringify(before) !== JSON.stringify(after)
                assert.strict.equal(changed, u._x.changed, `${u.id} 授權改變(真 getUserRules): before=${before} after=${after}`)
                if (u._x.counted) {
                    counted.push(u.id)
                }
                if (u._x.and) {
                    andN++
                }
                if (changed) {
                    assert.strict.ok(u._x.counted, `${u.id} 授權確有改變, 必須被計入`)
                }
            }
            let r = getAddImpact({ keyTable: 'grups', rowsOld: grupsOld, rowsNew, holders: users })
            assert.strict.equal(r.nHolders, counted.length, `nHolders(${counted.join(',')})`)
            assert.strict.equal(r.nAnd, andN, 'nAnd')
            assert.strict.deepEqual(r.names, ['G', 'H'])
            assert.strict.equal(r.nNames, 2)
        })

        it('AI-402 逐一單獨驗證: 每位引用端單獨作為 holders 時, 計入與否 ＝ 夾具預期(排除跨列相加之遮蔽; 夾具預期為「引用命中」口徑之現況, 其中 u-lim-alone 為多計之刻畫格)', function() {
            let { grupsOld, gNew, users } = fxGrup()
            let rowsNew = [...grupsOld, ...gNew]
            for (let u of users) {
                let r = getAddImpact({ keyTable: 'grups', rowsOld: grupsOld, rowsNew, holders: [u] })
                assert.strict.equal(r.nHolders, u._x.counted ? 1 : 0, `${u.id} nHolders`)
                assert.strict.equal(r.nAnd, u._x.and ? 1 : 0, `${u.id} nAnd`)
            }
        })

        // 夾具 B: 權限頁新增 PN(引用端為群組 cpemis; 以「引用該群組之使用者」取真有效授權)
        let fxPemi = () => {
            let targets = T(['T1', 'T2'])
            let pemisOld = [{ id: 'p1', name: 'P1', crules: J({ T1: 'y' }) }]
            let pNew = [{ id: 'pn1', name: 'PN', crules: J({ T1: 'y', T2: 'y' }), _isNew: true }]
            let gs = [
                ['GO', J({ PN: OR() }), true, false, true],
                ['GA', J({ PN: AND() }), true, true, true],
                ['GB', J({ P1: OR(), PN: AND() }), true, true, true],
                ['GM', J({ P1: OR(), PN: { isActive: 'y' } }), true, true, true],
                ['GI', J({ PN: OR('n') }), false, false, false],
                ['GX', J({ P1: OR() }), false, false, false],
                ['GR', J([{ name: 'PN', mode: 'OR', isActive: 'y' }]), true, false, true],
                ['GL', J({ PN: { isActive: 'y' } }), true, true, false], //現況刻畫(寧多提示, 非規格要求之精確; AI-405): mode 缺單獨存在 → 新增前後皆無授權, 而計入且 nAnd=1
            ]
            let grups = gs.map(([name, cpemis, counted, and, changed]) => ({ id: `id-${name}`, name, cpemis, from: '', _x: { counted, and, changed } }))
            grups.push({ id: 'id-GE', name: 'GE', cpemis: J({ PN: OR() }), from: 'ldap', _x: { counted: true, and: false, changed: true } })
            return { targets, pemisOld, pNew, grups }
        }

        it('AI-403 權限頁: 逐群組(以引用該群組之使用者取真有效授權)changed 與預期一致, 授權確有改變者必被計入(計入 ⊇ 改變; 反向不要求), 計數相符(GL 為多計之刻畫格)', function() {
            let { targets, pemisOld, pNew, grups } = fxPemi()
            let rowsNew = [...pemisOld, ...pNew]
            let counted = 0
            let andN = 0
            for (let g of grups) {
                let u = { id: `u-${g.id}`, cgrups: J({ [g.name]: OR() }) }
                let before = rulesY(u, grups, pemisOld, targets)
                let after = rulesY(u, grups, rowsNew, targets)
                let changed = JSON.stringify(before) !== JSON.stringify(after)
                assert.strict.equal(changed, g._x.changed, `${g.name} 授權改變(真 getUserRules): before=${before} after=${after}`)
                if (changed) {
                    assert.strict.ok(g._x.counted, `${g.name} 授權確有改變, 必須被計入`)
                }
                if (g._x.counted) {
                    counted++
                }
                if (g._x.and) {
                    andN++
                }
                let r1 = getAddImpact({ keyTable: 'pemis', rowsOld: pemisOld, rowsNew, holders: [g] })
                assert.strict.equal(r1.nHolders, g._x.counted ? 1 : 0, `${g.name} 單獨 nHolders`)
                assert.strict.equal(r1.nAnd, g._x.and ? 1 : 0, `${g.name} 單獨 nAnd`)
            }
            let r = getAddImpact({ keyTable: 'pemis', rowsOld: pemisOld, rowsNew, holders: grups })
            assert.strict.deepEqual([r.nHolders, r.nAnd], [counted, andN])
            assert.strict.deepEqual(r.names, ['PN'])
        })

        // 夾具 C: 標的頁新增 T9／'1'(引用端為權限 crules; 屬性鍵轉型: 整數式 id 與數字 name 皆指向同一標的)
        let fxTarget = () => {
            let targetsOld = T(['T0'])
            let tNew = [{ id: 'T9', _isNew: true }, { id: '1', _isNew: true }]
            let ps = [
                ['pY', J({ T9: 'y' }), true, true],
                ['pN', J({ T9: 'n' }), false, false],
                ['pArr', J([{ name: 'T9', isActive: 'y' }]), true, true],
                ['pInt', J({ 1: 'y' }), true, true], //屬性鍵 '1'
                ['pIntArr', J([{ name: 1, isActive: 'y' }]), true, true], //數字 name 轉為屬性鍵 '1'
                ['pIntArrStr', J([{ name: '1', isActive: 'y' }]), true, true],
                ['pOther', J({ T0: 'y' }), false, false],
                ['pObjN', J({ T9: { isActive: 'n' } }), false, false],
                ['pObjY', J({ T9: { isActive: 'y' } }), true, true],
                ['pModeAnd', J({ T9: { mode: 'AND', isActive: 'y' } }), true, true], //crules 項目之 mode 被 mergeRules 忽略: 仍為一般授權, 不算 AND 引用
            ]
            let pemis = ps.map(([name, crules, counted, changed]) => ({ id: `id-${name}`, name, crules, from: '', _x: { counted, changed } }))
            pemis.push({ id: 'id-pE', name: 'pE', crules: J({ T9: 'y' }), from: 'sso', _x: { counted: true, changed: true } })
            return { targetsOld, tNew, pemis }
        }

        it('AI-404 標的頁: 逐權限(經 群組→使用者 取真有效授權)changed 與預期一致, 授權確有改變者必被計入(計入 ⊇ 改變); 整數式 id／數字 name／物件值皆依屬性鍵轉型指向新標的; nAnd 恆為 0', function() {
            let { targetsOld, tNew, pemis } = fxTarget()
            let rowsOld = targetsOld
            let rowsNew = [...targetsOld, ...tNew]
            let counted = 0
            for (let p of pemis) {
                let g = { id: `g-${p.id}`, name: `G-${p.id}`, cpemis: J({ [p.name]: OR() }) }
                let u = { id: `u-${p.id}`, cgrups: J({ [g.name]: OR() }) }
                let before = rulesY(u, [g], pemis, targetsOld)
                let after = rulesY(u, [g], pemis, rowsNew)
                let changed = JSON.stringify(before) !== JSON.stringify(after)
                assert.strict.equal(changed, p._x.changed, `${p.name} 授權改變(真 getUserRules): before=${before} after=${after}`)
                if (changed) {
                    assert.strict.ok(p._x.counted, `${p.name} 授權確有改變, 必須被計入`)
                }
                if (p._x.counted) {
                    counted++
                }
                let r1 = getAddImpact({ keyTable: 'targets', rowsOld, rowsNew, holders: [p] })
                assert.strict.equal(r1.nHolders, p._x.counted ? 1 : 0, `${p.name} 單獨 nHolders`)
                assert.strict.equal(r1.nAnd, 0, `${p.name} 標的之 nAnd 恆為 0`)
            }
            let r = getAddImpact({ keyTable: 'targets', rowsOld, rowsNew, holders: pemis })
            assert.strict.equal(r.nHolders, counted)
            assert.strict.equal(r.nAnd, 0)
            assert.strict.deepEqual(r.names, ['T9', '1'])
        })

        // ===== AI-405: 現況刻畫(寧多提示, 非規格要求之精確; run07 外審 sol R6 所舉 over-count 格) =====
        //計數口徑為「引用命中」: 啟用中之引用指向新名稱即計入, 不模擬授權合併. 下列四格「授權實際不變(真 getUserRules 前後相同)而被計入」——
        //這是目前行為之刻畫, 不是規格要求: 規格只保證「授權確有改變者必被計入」(AI-401～404、AI-406); 若日後把計數改精確(上列格變為 0), 只需改寫本案之期望, 單向保證不受影響.
        describe('AI-405 現況刻畫: 計入但授權實際不變之格(寧多提示, 非規格要求之精確)', function() {

            let changedOf = (user, grupsBefore, grupsAfter, pemisBefore, pemisAfter, targets) => {
                let before = rulesY(user, grupsBefore, pemisBefore, targets)
                let after = rulesY(user, grupsAfter, pemisAfter, targets)
                return { changed: JSON.stringify(before) !== JSON.stringify(after), before, after }
            }
            let targets = T(['T1', 'T2'])
            let pemis = [{ id: 'p1', name: 'P1', crules: J({ T1: 'y' }) }, { id: 'p2', name: 'P2', crules: J({ T1: 'y', T2: 'y' }) }]

            it('AI-405a 群組頁: 使用者僅有限制項(mode 缺)引用新增之「有授權」群組 → 真授權前後皆無改變, 仍計入(nHolders=1)且報 AND(nAnd=1)', function() {
                let grupsOld = [{ id: 'g0', name: 'Base', cpemis: J({ P1: OR() }) }]
                let rowsNew = [...grupsOld, { id: 'gn', name: 'G', cpemis: J({ P2: OR() }), _isNew: true }]
                let u = { id: 'u-lim', cgrups: J({ G: { isActive: 'y' } }) }
                let c = changedOf(u, grupsOld, rowsNew, pemis, pemis, targets)
                assert.strict.equal(c.changed, false, `真授權不變(before=${c.before} after=${c.after})`)
                let r = getAddImpact({ keyTable: 'grups', rowsOld: grupsOld, rowsNew, holders: [u] })
                assert.strict.deepEqual([r.nHolders, r.nAnd, r.names], [1, 1, ['G']], '現況: 引用命中即計入, 缺 mode 視為 AND')
            })

            it('AI-405b 群組頁: 使用者以合法 OR 引用新增之「無權限」群組(cpemis 為 {})→ 真授權前後皆無改變, 仍計入(nHolders=1, nAnd=0)', function() {
                let grupsOld = [{ id: 'g0', name: 'Base', cpemis: J({ P1: OR() }) }]
                let rowsNew = [...grupsOld, { id: 'gn', name: 'H', cpemis: '{}', _isNew: true }]
                let u = { id: 'u-or', cgrups: J({ Base: OR(), H: OR() }) }
                let c = changedOf(u, grupsOld, rowsNew, pemis, pemis, targets)
                assert.strict.equal(c.changed, false, `真授權不變(before=${c.before} after=${c.after})`)
                let r = getAddImpact({ keyTable: 'grups', rowsOld: grupsOld, rowsNew, holders: [u] })
                assert.strict.deepEqual([r.nHolders, r.nAnd, r.names], [1, 0, ['H']], '現況: 引用命中即計入, 不論新增群組有無授權')
            })

            it('AI-405c 權限頁: 群組僅有限制項(mode 缺)引用新增之有授權權限 → 真授權前後皆無改變, 仍計入(nHolders=1, nAnd=1)', function() {
                let pemisOld = [{ id: 'p1', name: 'P1', crules: J({ T1: 'y' }) }]
                let rowsNew = [...pemisOld, { id: 'pn', name: 'PN', crules: J({ T1: 'y', T2: 'y' }), _isNew: true }]
                let g = { id: 'g-lim', name: 'GL', cpemis: J({ PN: { isActive: 'y' } }) }
                let u = { id: 'u-gl', cgrups: J({ GL: OR() }) }
                let c = changedOf(u, [g], [g], pemisOld, rowsNew, targets)
                assert.strict.equal(c.changed, false, `真授權不變(before=${c.before} after=${c.after})`)
                let r = getAddImpact({ keyTable: 'pemis', rowsOld: pemisOld, rowsNew, holders: [g] })
                assert.strict.deepEqual([r.nHolders, r.nAnd, r.names], [1, 1, ['PN']])
            })

            it('AI-405d 權限頁: 群組以合法 OR 引用新增之「無權限」權限(crules 為 {})→ 真授權前後皆無改變, 仍計入(nHolders=1, nAnd=0)', function() {
                let pemisOld = [{ id: 'p1', name: 'P1', crules: J({ T1: 'y' }) }]
                let rowsNew = [...pemisOld, { id: 'pn', name: 'PE', crules: '{}', _isNew: true }]
                let g = { id: 'g-or', name: 'GO', cpemis: J({ P1: OR(), PE: OR() }) }
                let u = { id: 'u-go', cgrups: J({ GO: OR() }) }
                let c = changedOf(u, [g], [g], pemisOld, rowsNew, targets)
                assert.strict.equal(c.changed, false, `真授權不變(before=${c.before} after=${c.after})`)
                let r = getAddImpact({ keyTable: 'pemis', rowsOld: pemisOld, rowsNew, holders: [g] })
                assert.strict.deepEqual([r.nHolders, r.nAnd, r.names], [1, 0, ['PE']])
            })

        })

        // ===== AI-406: 單向保證之窮舉(授權確有改變 ⇒ 必被計入), 以真 getUserRules 逐格判定 =====
        //小積空間(逐格以真函數取新增前後授權, 不以 getAddImpact 自身為 oracle): 群組頁 引用項 × 他群組 × 新群組授權內容 = 8 × 3 × 5 = 120 格; 權限頁同形 120 格; 非空洞: 各頁至少 20 格授權確有改變
        let ENTRY = [
            ['absent', null],
            ['OR y', OR('y')],
            ['OR n', OR('n')],
            ['AND y', AND('y')],
            ['AND n', AND('n')],
            ['mode 缺 y', { isActive: 'y' }],
            ['mode 缺 n', { isActive: 'n' }],
            ['XOR y', { mode: 'XOR', isActive: 'y' }],
        ]
        let BASE = [['無他群組', null], ['他群組 OR y', OR('y')], ['他群組 AND y', AND('y')]]

        it('AI-406a 群組頁窮舉 120 格: 凡新增群組 G 使使用者之真有效授權改變者, getAddImpact 必計入該使用者(nHolders=1)', function() {
            let targets2 = T(['T1', 'T2'])
            let pemis2 = [{ id: 'p1', name: 'P1', crules: J({ T1: 'y' }) }, { id: 'p2', name: 'P2', crules: J({ T1: 'y', T2: 'y' }) }]
            let NEWG = [
                ['授權 P2', J({ P2: OR() })],
                ['授權 P1', J({ P1: OR() })],
                ['無權限 {}', '{}'],
                ['P2 停用', J({ P2: OR('n') })],
                ['P2 AND', J({ P2: AND() })],
            ]
            let nCell = 0
            let nChanged = 0
            for (let [bTitle, bEntry] of BASE) {
                for (let [eTitle, eEntry] of ENTRY) {
                    for (let [gTitle, gCpemis] of NEWG) {
                        let kp = {}
                        if (bEntry !== null) {
                            kp.Base = bEntry
                        }
                        if (eEntry !== null) {
                            kp.G = eEntry
                        }
                        let u = { id: 'u', cgrups: J(kp) }
                        let grupsOld = [{ id: 'g0', name: 'Base', cpemis: J({ P1: OR() }) }]
                        let rowsNew = [...grupsOld, { id: 'gn', name: 'G', cpemis: gCpemis, _isNew: true }]
                        let before = rulesY(u, grupsOld, pemis2, targets2)
                        let after = rulesY(u, rowsNew, pemis2, targets2)
                        let changed = JSON.stringify(before) !== JSON.stringify(after)
                        let r = getAddImpact({ keyTable: 'grups', rowsOld: grupsOld, rowsNew, holders: [u] })
                        nCell++
                        if (changed) {
                            nChanged++
                            assert.strict.equal(r.nHolders, 1, `[${bTitle}／引用 G: ${eTitle}／新群組 ${gTitle}] 授權確有改變(before=${before} after=${after})卻未被計入`)
                        }
                    }
                }
            }
            assert.strict.equal(nCell, 120)
            assert.strict.ok(nChanged >= 20, `非空洞: 授權確有改變之格數 ${nChanged} 應 ≥ 20`)
        })

        it('AI-406b 權限頁窮舉 120 格: 凡新增權限 PN 使(引用其群組之)使用者之真有效授權改變者, getAddImpact 必計入該群組(nHolders=1)', function() {
            let targets2 = T(['T1', 'T2'])
            let NEWP = [
                ['授權 T1+T2', J({ T1: 'y', T2: 'y' })],
                ['授權 T1', J({ T1: 'y' })],
                ['無權限 {}', '{}'],
                ['T1 為 n', J({ T1: 'n' })],
                ['授權 T2', J({ T2: 'y' })],
            ]
            let nCell = 0
            let nChanged = 0
            for (let [bTitle, bEntry] of BASE) {
                for (let [eTitle, eEntry] of ENTRY) {
                    for (let [pTitle, pCrules] of NEWP) {
                        let kp = {}
                        if (bEntry !== null) {
                            kp.P1 = bEntry
                        }
                        if (eEntry !== null) {
                            kp.PN = eEntry
                        }
                        let g = { id: 'g', name: 'GX', cpemis: J(kp) }
                        let u = { id: 'u', cgrups: J({ GX: OR() }) }
                        let pemisOld = [{ id: 'p1', name: 'P1', crules: J({ T1: 'y' }) }]
                        let rowsNew = [...pemisOld, { id: 'pn', name: 'PN', crules: pCrules, _isNew: true }]
                        let before = rulesY(u, [g], pemisOld, targets2)
                        let after = rulesY(u, [g], rowsNew, targets2)
                        let changed = JSON.stringify(before) !== JSON.stringify(after)
                        let r = getAddImpact({ keyTable: 'pemis', rowsOld: pemisOld, rowsNew, holders: [g] })
                        nCell++
                        if (changed) {
                            nChanged++
                            assert.strict.equal(r.nHolders, 1, `[他權限 ${bTitle}／引用 PN: ${eTitle}／新權限 ${pTitle}] 授權確有改變(before=${before} after=${after})卻未被計入`)
                        }
                    }
                }
            }
            assert.strict.equal(nCell, 120)
            assert.strict.ok(nChanged >= 20, `非空洞: 授權確有改變之格數 ${nChanged} 應 ≥ 20`)
        })

    })


    // ===== AI-1: 何謂「新增且撞懸空名」 =====
    describe('AI-1 新增與懸空之判定', function() {

        let users = [{ id: 'u1', cgrups: J({ G: OR() }) }]
        let imp = (rowsOld, rowsNew, holders = users, keyTable = 'grups') => getAddImpact({ keyTable, rowsOld, rowsNew, holders })
        let ZERO = { nHolders: 0, nAnd: 0, names: [], nNames: 0 }

        it('AI-101 新增列之名稱與基準內既有列同名 → 不是懸空(引用已有實體), 不計', function() {
            let old = [{ id: 'g1', name: 'G' }]
            assert.strict.deepEqual(imp(old, [...old, { id: 'gn', name: 'G', _isNew: true }]), ZERO)
        })

        it('AI-102 懸空且啟用中引用 → 計入; 懸空但引用已停用 → 不計', function() {
            let rowsNew = [{ id: 'gn', name: 'G', _isNew: true }]
            assert.strict.deepEqual(imp([], rowsNew), { nHolders: 1, nAnd: 0, names: ['G'], nNames: 1 })
            assert.strict.deepEqual(imp([], rowsNew, [{ id: 'u1', cgrups: J({ G: OR('n') }) }]), ZERO)
        })

        it('AI-103 AND／OR／mode 缺／mode 非法: nAnd 依 getEffMode(OR 以外皆 AND); 同一引用端多個新名稱只計一次', function() {
            let rowsNew = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }, { id: 'd', name: 'D' }]
            let holders = [
                { id: 'u1', cgrups: J({ A: OR(), B: OR() }) }, //兩個新名稱, OR → 1 位, 非 AND
                { id: 'u2', cgrups: J({ C: AND() }) },
                { id: 'u3', cgrups: J({ D: { isActive: 'y' } }) }, //mode 缺
                { id: 'u4', cgrups: J({ D: { mode: 'Or', isActive: 'y' } }) }, //mode 非法
                { id: 'u5', cgrups: J({ A: OR(), C: AND() }) }, //OR 與 AND 並存 → AND 計入
                { id: 'u6', cgrups: J({ B: { mode: 1, isActive: 'y' } }) }, //mode 為非字串
                { id: 'u7', cgrups: J({ B: 'y' }) }, //值非物件(以值為 isActive, 無 mode)
            ]
            assert.strict.deepEqual(imp([], rowsNew, holders), { nHolders: 7, nAnd: 6, names: ['A', 'B', 'C', 'D'], nNames: 4 })
        })

        it('AI-104 歷史同名: 基準內已有該名稱(即使兩筆)→ 不計', function() {
            let old = [{ id: 'g1', name: 'G' }, { id: 'g2', name: 'G' }]
            assert.strict.deepEqual(imp(old, [...old, { id: 'gn', name: 'G' }]), ZERO)
        })

        it('AI-105 本次一併刪除舊列後以同名新增(新 id): 基準內仍有同名實體 → 不計(其引用之去留由刪除確認框負責)', function() {
            let old = [{ id: 'g1', name: 'G' }]
            assert.strict.deepEqual(imp(old, [{ id: 'gn', name: 'G', _isNew: true }]), ZERO)
        })

        it('AI-106 既有列改名為懸空名 → 不是新增(id 在基準內; 改名級聯與其接管檢查另有流程), 不計', function() {
            let old = [{ id: 'g1', name: 'Old' }]
            assert.strict.deepEqual(imp(old, [{ id: 'g1', name: 'G' }]), ZERO)
        })

        it('AI-107 缺 id 之列視為新增; 數字 id 與基準字串 id 同值視為同一列(不是新增); 非字串名稱不計; 缺 name 視為空字串名稱(對應 cgrups 之 "" 項)', function() {
            let holders = [{ id: 'u1', cgrups: J({ G: OR() }) }, { id: 'u2', cgrups: J({ '': OR() }) }]
            assert.strict.equal(imp([], [{ name: 'G' }], holders).nHolders, 1, '缺 id: 新增')
            assert.strict.equal(imp([{ id: '1', name: 'X' }], [{ id: 1, name: 'G' }], holders).nHolders, 0, '數字 id 1 ＝ 基準 id "1"(改名, 非新增)')
            assert.strict.equal(imp([], [{ id: 'n1', name: null }, { id: 'n2', name: 5 }, { id: 'n3', name: { x: 1 } }], holders).nHolders, 0, '非字串名稱不對應任何引用')
            let r = imp([], [{ id: 'n1' }], holders)
            assert.strict.deepEqual([r.nHolders, r.names], [1, ['']], '缺 name ＝ "" 名稱, 與 "" 引用項相符')
        })

        it('AI-108 同名多列新增只計一次(names 去重); 引用端不重複計', function() {
            let r = imp([], [{ id: 'a', name: 'G' }, { id: 'b', name: 'G' }])
            assert.strict.deepEqual(r, { nHolders: 1, nAnd: 0, names: ['G'], nNames: 1 })
        })

        it('AI-109 names 至多 5 個(依 rowsNew 次序), nNames 為總數', function() {
            let nms = ['n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7']
            let rowsNew = nms.map((name, k) => ({ id: `id${k}`, name }))
            let holders = [{ id: 'u1', cgrups: J(Object.fromEntries(nms.map((n) => [n, OR()]))) }]
            let r = imp([], rowsNew, holders)
            assert.strict.deepEqual(r.names, ['n1', 'n2', 'n3', 'n4', 'n5'])
            assert.strict.equal(r.nNames, 7)
            assert.strict.equal(r.nHolders, 1)
        })

        it('AI-110 只有被引用之新名稱列入 names(其餘新增列不列)', function() {
            let r = imp([], [{ id: 'a', name: 'A' }, { id: 'b', name: 'G' }, { id: 'c', name: 'C' }])
            assert.strict.deepEqual(r.names, ['G'])
        })

        it('AI-111 外部引用端列(from 非空)亦計', function() {
            let r = imp([], [{ id: 'a', name: 'G' }], [{ id: 'u1', from: 'sso', cgrups: J({ G: OR() }) }])
            assert.strict.equal(r.nHolders, 1)
        })
    })


    // ===== 原型鍵名、壞容器、輸入形狀 =====
    describe('AI-2 原型鍵名與壞輸入', function() {

        let PROTO = ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf']

        it('AI-201 原型鍵名之新群組／權限: 有自有鍵之引用才計; 空容器、他名之引用不因原型鏈被誤計; 基準已有該名則不是懸空', function() {
            for (let n of PROTO) {
                let rowsNew = [{ id: 'gn', name: n, _isNew: true }]
                let hit = [{ id: 'u1', cgrups: `{ ${JSON.stringify(n)}: { "mode": "OR", "isActive": "y" } }` }]
                assert.strict.equal(getAddImpact({ keyTable: 'grups', rowsOld: [], rowsNew, holders: hit }).nHolders, 1, `${n} 自有鍵引用`)
                let miss = [{ id: 'u2', cgrups: '{}' }, { id: 'u3', cgrups: J({ other: OR() }) }, { id: 'u4', cgrups: '[]' }]
                assert.strict.equal(getAddImpact({ keyTable: 'grups', rowsOld: [], rowsNew, holders: miss }).nHolders, 0, `${n} 無引用不得誤計`)
                assert.strict.equal(getAddImpact({ keyTable: 'grups', rowsOld: [{ id: 'g0', name: n }], rowsNew, holders: hit }).nHolders, 0, `${n} 基準已有同名`)
            }
            assert.strict.equal(({}).polluted, undefined)
        })

        it('AI-202 原型鍵名之新標的 id(crules 屬性鍵): 自有鍵才計; 陣列形式 name 亦同', function() {
            for (let n of PROTO) {
                let rowsNew = [{ id: n, _isNew: true }]
                let hit = [{ id: 'p1', crules: `{ ${JSON.stringify(n)}: "y" }` }, { id: 'p2', crules: J([{ name: n, isActive: 'y' }]) }]
                assert.strict.equal(getAddImpact({ keyTable: 'targets', rowsOld: [], rowsNew, holders: hit }).nHolders, 2, `${n}`)
                assert.strict.equal(getAddImpact({ keyTable: 'targets', rowsOld: [], rowsNew, holders: [{ id: 'p3', crules: '{}' }, { id: 'p4', crules: J({ T: 'y' }) }] }).nHolders, 0, `${n} 無引用`)
                assert.strict.equal(getAddImpact({ keyTable: 'targets', rowsOld: [{ id: n }], rowsNew, holders: hit }).nHolders, 0, `${n} 基準已有同 id`)
            }
        })

        it('AI-203 容器壞 JSON／空字串／純量／null／非字串／缺欄: 不計且不拋錯', function() {
            let bad = ['{bad', '', '   ', 'null', '5', '"str"', 'true', undefined, null, 7, {}, [], ['x']]
            let holders = bad.map((cgrups, k) => ({ id: `u${k}`, cgrups }))
            holders.push({ id: 'no-field' }, null, undefined, 5, 'str', [])
            assert.strict.deepEqual(getAddImpact({ keyTable: 'grups', rowsOld: [], rowsNew: [{ id: 'g', name: 'G' }], holders }), { nHolders: 0, nAnd: 0, names: [], nNames: 0 })
        })

        it('AI-204 容器中夾雜壞項目: 其餘好項目仍計(陣列元素非物件、name 缺、isActive 為其他型別)', function() {
            let cg = J([5, null, { isActive: 'y' }, { name: 'G', mode: 'OR', isActive: 'y' }, { name: 'G2', isActive: 1 }, { name: 'G3', mode: 'OR' }])
            let r = getAddImpact({ keyTable: 'grups', rowsOld: [], rowsNew: [{ id: 'g', name: 'G' }, { id: 'g2', name: 'G2' }, { id: 'g3', name: 'G3' }], holders: [{ id: 'u1', cgrups: cg }] })
            assert.strict.deepEqual([r.nHolders, r.names], [1, ['G']], 'G2 之 isActive 為數字 1、G3 缺 isActive, 皆非 "y" 不計')
        })

        it('AI-205 輸入形狀防呆: p 非物件、表名未知(含 users)、rowsOld／rowsNew／holders 非陣列、rowsNew 含非物件 → 全 0 不拋錯', function() {
            let Z = { nHolders: 0, nAnd: 0, names: [], nNames: 0 }
            for (let p of [undefined, null, 5, 'x', [], {}, { keyTable: 'users' }, { keyTable: 'xxx' }, { keyTable: 5 }, { keyTable: '__proto__' }, { keyTable: 'constructor' }]) {
                assert.strict.deepEqual(getAddImpact(p), Z)
            }
            for (let bad of [undefined, null, 5, 'x', {}]) {
                assert.strict.deepEqual(getAddImpact({ keyTable: 'grups', rowsOld: bad, rowsNew: bad, holders: bad }), Z)
                assert.strict.deepEqual(getAddImpact({ keyTable: 'grups', rowsOld: [], rowsNew: [{ id: 'g', name: 'G' }], holders: bad }), Z)
            }
            assert.strict.deepEqual(getAddImpact({ keyTable: 'grups', rowsOld: [null, 5, 'x'], rowsNew: [null, undefined, 5, 'x', []], holders: [{ cgrups: J({ G: OR() }) }] }), Z)

            //表名未知(含 users: 無「被引用」關係)而給了真實列: 同樣回全 0(不得因查不到引用規格而拋錯)
            for (let keyTable of ['users', 'xxx', '__proto__', 'constructor', 'toString']) {
                let r = getAddImpact({ keyTable, rowsOld: [{ id: 'u1', name: 'x' }], rowsNew: [{ id: 'u1', name: 'x' }, { id: 'u2', name: 'G' }], holders: [{ id: 'h', cgrups: J({ G: OR() }), cpemis: J({ G: OR() }), crules: J({ G: 'y' }) }] })
                assert.strict.deepEqual(r, Z, keyTable)
            }
        })

        it('AI-206 純函數: 不改動輸入(rowsOld／rowsNew／holders)', function() {
            let rowsOld = [{ id: 'g0', name: 'Base' }]
            let rowsNew = [...rowsOld, { id: 'gn', name: 'G' }]
            let holders = [{ id: 'u1', cgrups: J({ G: AND() }) }]
            let snap = cloneDeep({ rowsOld, rowsNew, holders })
            getAddImpact({ keyTable: 'grups', rowsOld, rowsNew, holders })
            assert.strict.deepEqual({ rowsOld, rowsNew, holders }, snap)
        })
    })


    // ===== AI-5: 確認框文字 =====
    describe('AI-5 getAddConfirmText', function() {

        let KINDS = [['Grup', 'confirmAddRefsGrup', 'confirmAddRefsAndGrup'], ['Pemi', 'confirmAddRefsPemi', 'confirmAddRefsAndPemi'], ['Target', 'confirmAddRefsTarget', '']]
        let render = (lang, key, v) => LANG[lang][key].split('{n}').join(String(v.n)).split('{m}').join(String(v.m)).split('{list}').join(v.list)

        it('AI-501 無影響(nHolders 為 0／缺／負、非物件、種類不明) → 空字串(不彈框)', function() {
            let $t = (k) => LANG.eng[k]
            for (let kind of ['Grup', 'Pemi', 'Target']) {
                for (let imp of [{ nHolders: 0, nAnd: 3, names: ['A'], nNames: 1 }, { names: ['A'] }, { nHolders: -1, names: ['A'] }, null, undefined, 5, 'x']) {
                    assert.strict.equal(getAddConfirmText(imp, $t, kind), '', `${kind} ${JSON.stringify(imp)}`)
                }
            }
            for (let kind of ['Xxx', '', undefined, null, 5, '__proto__', 'constructor']) {
                assert.strict.equal(getAddConfirmText({ nHolders: 2, nAnd: 1, names: ['A'], nNames: 1 }, $t, kind), '', `種類 ${kind}`)
            }
        })

        it('AI-502 eng／cht: 依種類與 AND 數選鍵, 佔位符皆代入, 單一問句(確定新增／Add anyway), 名單以「, 」串接', function() {
            for (let lang of ['eng', 'cht']) {
                let $t = (k) => LANG[lang][k]
                let ask = lang === 'cht' ? /確定新增？/g : /Add anyway\?/g
                for (let [kind, kPlain, kAnd] of KINDS) {
                    let imp0 = { nHolders: 3, nAnd: 0, names: ['A', 'B'], nNames: 2 }
                    let t0 = getAddConfirmText(imp0, $t, kind)
                    assert.strict.equal(t0, render(lang, kPlain, { n: 3, m: 0, list: 'A, B' }), `${lang} ${kind} 無 AND`)
                    assert.strict.ok(!t0.includes('{'), `${lang} ${kind} 佔位符皆已代入`)
                    assert.strict.equal((t0.match(ask) || []).length, 1, `${lang} ${kind} 只有一個問句`)

                    let imp1 = { nHolders: 3, nAnd: 2, names: ['A', 'B'], nNames: 2 }
                    let t1 = getAddConfirmText(imp1, $t, kind)
                    if (kAnd === '') {
                        assert.strict.equal(t1, t0, `${lang} ${kind} 無 AND 句之種類, nAnd 不影響文字`)
                    }
                    else {
                        assert.strict.equal(t1, render(lang, kAnd, { n: 3, m: 2, list: 'A, B' }), `${lang} ${kind} 有 AND`)
                        assert.strict.ok(t1.includes('2') && t1.includes('AND') && !t1.includes('{'), `${lang} ${kind} AND 句含 {m} 與 AND`)
                        assert.strict.notEqual(t1, t0)
                    }
                    assert.strict.ok(t0.includes('3'), `${lang} ${kind} 含引用端數`)
                }
            }
        })

        it('AI-503 nAnd 以 nHolders 為上限; AND 數為 0 時不提 AND', function() {
            let $t = (k) => LANG.cht[k]
            assert.strict.equal(getAddConfirmText({ nHolders: 2, nAnd: 9, names: ['A'], nNames: 1 }, $t, 'Grup'), render('cht', 'confirmAddRefsAndGrup', { n: 2, m: 2, list: 'A' }))
            assert.strict.ok(!/AND/.test(getAddConfirmText({ nHolders: 2, nAnd: 0, names: ['A'], nNames: 1 }, $t, 'Pemi')))
        })

        it('AI-504 名單超過 5 個: 附 cascadeListMore 之總數; 名稱內之 {n}／{m}／$& 字樣原樣顯示(單趟代入); 空名稱顯示為 ""', function() {
            let $t = (k) => LANG.eng[k]
            let t = getAddConfirmText({ nHolders: 1, nAnd: 0, names: ['a', 'b', 'c', 'd', 'e'], nNames: 8 }, $t, 'Grup')
            assert.strict.ok(t.includes('"a, b, c, d, e … (8 in total)"'), t)
            let t2 = getAddConfirmText({ nHolders: 4, nAnd: 1, names: ['{n}', '$&', '{m}{list}', ''], nNames: 4 }, $t, 'Grup')
            assert.strict.ok(t2.includes('{n}, $&, {m}{list}, ""'), t2)
            assert.strict.ok(t2.includes('4 user(s)') && t2.includes('1 of them'), t2)
        })

        it('AI-505 語系鍵 eng／cht 俱全、含應有之佔位符(Grup／Pemi 之 AND 句含 {m}; Target 無 {m}), 名稱以引號包住({list})', function() {
            for (let [kind, kPlain, kAnd] of KINDS) {
                for (let lang of ['eng', 'cht']) {
                    let p = LANG[lang][kPlain]
                    assert.strict.ok(typeof p === 'string' && p.includes('{n}') && p.includes('{list}') && !p.includes('{m}'), `${lang} ${kPlain}`)
                    if (kAnd !== '') {
                        let a = LANG[lang][kAnd]
                        assert.strict.ok(typeof a === 'string' && a.includes('{n}') && a.includes('{list}') && a.includes('{m}'), `${lang} ${kAnd}`)
                    }
                }
                assert.strict.ok(LANG.eng[kPlain].includes('"{list}"') && LANG.cht[kPlain].includes('「{list}」'), `${kind} 名稱引號`)
            }
            assert.strict.equal(LANG.eng.confirmAddRefsAndTarget, undefined, '標的無 AND 句')
        })
    })


    // ===== AI-6: 站點 =====
    describe('SITE-AI 清單頁接線(靜態)', function() {

        let code = (rel) => sourceLines(path.join(projRoot, rel), 'code').map((l) => l.text).join('\n')
        let PAGES = [
            //run11: 「舊」列為草稿所依據之那份 store 列(vo.baseRows, 與載入基準同時產生; 有未存編輯時 store 可能已被推播更新, 不用 vo.<表>), 見 unit-draftSync DS-4f
            ['LayoutContentGrups', 'grups', 'vo.baseRows', 'rows', 'vo.users', 'Grup', 'updateGrups(rows, { baseline })'],
            ['LayoutContentPemis', 'pemis', 'vo.baseRows', 'rows', 'vo.grups', 'Pemi', 'updatePemis(rows, { baseline })'],
            ['LayoutContentTargets', 'targets', 'vo.baseRows', 'rowsSend', 'vo.pemis', 'Target', 'updateTargets(rowsSend, { baseline })'],
        ]

        it('SITE-AI-001 三頁: 以草稿所依據之 store 列(baseRows)為基準於開 loading 前同步計算 addText; 與改名／刪除預覽之確認框依序(預覽 < 預覽確認框 < 新增確認框 < 開 loading < 打 API); 新增確認框: unlockBtn → showCheckYesNo → 選否 return; 無影響不彈框', function() {
            for (let [fn, table, base, rowsVar, holders, kind] of PAGES) {
                let c = code(`src/components/${fn}.vue`)
                assert.strict.ok(c.includes(`import { getAddImpact, getAddConfirmText } from '../js/getAddImpact.mjs'`), `${fn} import`)
                assert.strict.ok(c.includes(`let addText = getAddConfirmText(getAddImpact({ keyTable: '${table}', rowsOld: ${base}, rowsNew: ${rowsVar}, holders: ${holders} }), (k) => vo.$t(k), '${kind}')`), `${fn} addText 輸入`)
                assert.strict.ok(/if \(addText !== ''\) \{\s*unlockBtn\(\)\s*let isGoAdd = await vo\.\$dg\.showCheckYesNo\(addText\)\s*\.then\(\(\) => true\)\s*\.catch\(\(\) => false\)\s*if \(!isGoAdd\) \{\s*return\s*\}\s*\}/.test(c), `${fn} 新增確認框: unlockBtn → showCheckYesNo → 選否 return`)
                assert.strict.equal((c.match(/showCheckYesNo\(addText\)/g) || []).length, 1, `${fn} 新增確認只有一個框`)
                let iPv = c.indexOf('getSavePreview({ kind')
                let iAdd = c.indexOf('let addText = ')
                let iAskPv = c.indexOf('showCheckYesNo(pv.confirmText)')
                let iAskAdd = c.indexOf('showCheckYesNo(addText)')
                let iLoad = c.indexOf('updateLoading(true)')
                let iApi = c.search(/\$fapi\.update(Grups|Pemis|Targets)\(/)
                assert.strict.ok(iPv > 0 && iPv < iAdd && iAdd < iAskPv && iAskPv < iAskAdd && iAskAdd < iLoad && iLoad < iApi, `${fn} 順序: 預覽 < addText < 預覽確認框 < 新增確認框 < 開 loading < 打 API`)
                assert.strict.ok(!/(^|[^\w.$])(window\.)?(confirm|alert|prompt)\(/m.test(c), `${fn} 不得用原生 confirm／alert／prompt`)
            }
        })

        it('SITE-AI-002 使用者頁不套用新增確認(無懸空引用被新增之引用端表)', function() {
            let c = code('src/components/LayoutContentUsers.vue')
            assert.strict.ok(!c.includes('getAddImpact') && !c.includes('getAddConfirmText'))
        })

        it('SITE-AI-003 四頁: $fapi.updateXxx 帶 { baseline }; baseline 與 rows 同一刻擷取(cloneDeep(vo.baseline)); changeParams 內 baseline 與 items 同一處由同一份來源列產生', function() {
            let ALL = [['LayoutContentGrups', 'updateGrups(rows, { baseline })', 'makeBaseline(grups, vo.$ds.grups.keys)'], ['LayoutContentPemis', 'updatePemis(rows, { baseline })', 'makeBaseline(pemis, vo.$ds.pemis.keys)'], ['LayoutContentTargets', 'updateTargets(rowsSend, { baseline })', 'makeBaseline(items, vo.$ds.targets.keys)'], ['LayoutContentUsers', 'updateUsers(rows, { baseline })', 'makeBaseline(items, vo.$ds.users.keys)']]
            for (let [fn, call, mk] of ALL) {
                let c = code(`src/components/${fn}.vue`)
                assert.strict.ok(c.includes(`vo.$fapi.${call}`), `${fn} ${call}`)
                assert.strict.equal((c.match(/\$fapi\./g) || []).length, 1, `${fn} 只有一個 $fapi 呼叫`)
                assert.strict.ok(/let rows = get\(vo, 'opt\.rows', \[\]\)\s*let baseline = cloneDeep\(vo\.baseline\)/.test(c), `${fn} baseline 與 rows 同刻擷取`)
                assert.strict.ok(c.includes(`let baseline = ${mk}`), `${fn} changeParams 之 baseline 由來源列計算`)
                assert.strict.ok(/vo\.items = items\s*vo\.baseline = baseline/.test(c), `${fn} items 與 baseline 同處寫入`)
                assert.strict.ok(!/\$fapi\.update\w+\([^)]*vo\.baseline/.test(c), `${fn} 不得於送出當下才讀 vo.baseline(須用擷取值)`)
            }
        })
    })

})
