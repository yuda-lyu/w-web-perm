//名稱唯一與對應鍵檢查之純函數與站點不變式(F-02／F-14; 規則帳本 R-NAME-UNIQ-01／02、R-MAPKEY-01／02; ADR-034)
//
//受測: server/keyCheck.mjs(單一擁有者; WWebPerm.mjs:syncAndReplaceTabs、procCore.mjs:updateTabItems、WWebPerm.mjs:getTokenUser／getGenUserByKV 只呼叫、不複製判準).
//述語:
//  KC-DUP  findDupIndex(rows, key[, isPart]): 回「值(須為字串)與先前某參與列相同」之第一個列索引, 無則 -1; 精確 ===(不正規化), 非字串值略過(空／非字串另由他檢查), 原型鍵名(constructor／__proto__)無誤判;
//  KC-OF   findKeyOtherFrom(rows, rowsExist, from, key[, { onlyActive }]): 回「值已被 from 不等於本 from 之既有列使用」之第一個列索引, 同 from 之既有列不算; onlyActive 時兩側皆只計 isActive==='y';
//  KC-TD   findTouchedDup(rowsNew, rowsOld, key): 後台整表寫入, 只回「本次造成或觸及」之同名(歷史既有重複原樣送回不算);
//  KC-MK   mapKeyOf(mappingBy)／checkMapKeyBatch(rows, mappingBy): 'id' 不檢查; 'email'／'name' 時 active 列須非空字串(trim)且批內唯一(精確 ===), inactive 不參與;
//  KC-PU   pickUniqueUser(rs): 0／1／多筆, 多筆不取首筆;
//  SITE-KC 站點不變式: 檢查位於破壞性寫入之前、資料通道只開 select、反查 users 之站點皆經 pickUniqueUser.
//跑法: npx mocha test/unit-keyCheck.test.mjs --reporter list --timeout 30000
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { findDupIndex, hasDupKey, findKeyOtherFrom, findTouchedDup, tabWriteKey, mapKeyOf, checkMapKeyBatch, pickUniqueUser } from '../server/keyCheck.mjs'
import { stripLineComment } from './tools/srcScan.mjs'


const projRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
let nm = (...names) => names.map((name) => ({ name }))


describe('unit-keyCheck (名稱唯一與對應鍵檢查之純函數, F-02／F-14)', function() {

    // ===== KC-DUP =====
    describe('findDupIndex／hasDupKey', function() {

        it('KC-DUP-001 無重複 → -1(空陣列、單列、全相異)', function() {
            assert.strict.equal(findDupIndex([], 'name'), -1)
            assert.strict.equal(findDupIndex(nm('a'), 'name'), -1)
            assert.strict.equal(findDupIndex(nm('a', 'b', 'c'), 'name'), -1)
            assert.strict.equal(hasDupKey(nm('a', 'b'), 'name'), false)
        })

        it('KC-DUP-002 重複 → 回第二次出現之列索引(相鄰、不相鄰、三筆同名回第 2 筆)', function() {
            assert.strict.equal(findDupIndex(nm('a', 'a'), 'name'), 1)
            assert.strict.equal(findDupIndex(nm('a', 'b', 'a'), 'name'), 2)
            assert.strict.equal(findDupIndex(nm('a', 'a', 'a'), 'name'), 1)
            assert.strict.equal(findDupIndex(nm('x', 'a', 'b', 'b', 'a'), 'name'), 3, '先到達之重複')
            assert.strict.equal(hasDupKey(nm('a', 'b', 'a'), 'name'), true)
        })

        it('KC-DUP-003 精確 ===: 僅大小寫或前後空白不同視為不同名稱', function() {
            assert.strict.equal(findDupIndex(nm('A', 'a', 'a ', ' a', 'A '), 'name'), -1)
        })

        it('KC-DUP-004 非字串值略過(空／非字串另由 isestr 檢查): 5、null、undefined、缺欄位皆不構成重複', function() {
            assert.strict.equal(findDupIndex([{ name: 5 }, { name: 5 }], 'name'), -1)
            assert.strict.equal(findDupIndex([{ name: null }, { name: null }, {}, {}], 'name'), -1)
            assert.strict.equal(findDupIndex([{ name: true }, { name: true }], 'name'), -1)
        })

        it('KC-DUP-005 原型鍵名無誤判(規則帳本 R-KEY-01): constructor／__proto__／toString 單列不重複, 兩列才重複', function() {
            for (let n of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf']) {
                assert.strict.equal(findDupIndex(nm(n), 'name'), -1, n)
                assert.strict.equal(findDupIndex(nm(n, n), 'name'), 1, n)
            }
        })

        it('KC-DUP-006 isPart 限定參與列(如只計 active)', function() {
            let rows = [{ email: 'a', isActive: 'y' }, { email: 'a', isActive: 'n' }, { email: 'b', isActive: 'y' }, { email: 'a', isActive: 'y' }]
            assert.strict.equal(findDupIndex(rows, 'email'), 1)
            assert.strict.equal(findDupIndex(rows, 'email', (r) => r.isActive === 'y'), 3)
        })

        it('KC-DUP-007 rows 非陣列 → -1(不拋錯)', function() {
            assert.strict.equal(findDupIndex(null, 'name'), -1)
            assert.strict.equal(findDupIndex(undefined, 'name'), -1)
            assert.strict.equal(findDupIndex({ length: 5 }, 'name'), -1)
        })
    })


    // ===== KC-OF =====
    describe('findKeyOtherFrom', function() {

        let ex = [
            { id: 1, name: 'A', from: '' },
            { id: 2, name: 'B', from: 'x' },
            { id: 3, name: 'C', from: 'y' },
        ]

        it('KC-OF-001 已被他 from 之既有列使用 → 回該列索引(第一個); 同 from 之既有列不算衝突', function() {
            assert.strict.equal(findKeyOtherFrom(nm('Z', 'A'), ex, 'x', 'name'), 1, 'A 屬 from=\'\'')
            assert.strict.equal(findKeyOtherFrom(nm('B'), ex, 'x', 'name'), -1, 'B 屬本 from, 隨 delAll 重寫')
            assert.strict.equal(findKeyOtherFrom(nm('B', 'C', 'A'), ex, 'x', 'name'), 1, '回第一個衝突(C 屬 y)')
        })

        it('KC-OF-002 from 為空字串(base seed 之 from)亦為一個來源: 本 from 非空時與 \'\' 之列衝突, 本 from 為 \'\' 時不衝突', function() {
            assert.strict.equal(findKeyOtherFrom(nm('A'), ex, 'x', 'name'), 0)
            assert.strict.equal(findKeyOtherFrom(nm('A'), ex, '', 'name'), -1)
        })

        it('KC-OF-003 精確 ===, 非字串值略過, 既有列缺 from 視為他來源', function() {
            assert.strict.equal(findKeyOtherFrom(nm('a', 'A '), ex, 'x', 'name'), -1)
            assert.strict.equal(findKeyOtherFrom([{ name: 5 }, { name: null }, {}], [{ name: 5, from: '' }, { name: null, from: '' }, { from: '' }], 'x', 'name'), -1)
            assert.strict.equal(findKeyOtherFrom(nm('Q'), [{ name: 'Q' }], 'x', 'name'), 0, '既有列缺 from 欄位 → 非本 from')
        })

        it('KC-OF-004 onlyActive: 兩側皆只計 isActive===\'y\'(他 from 之 inactive 列不衝突; 本批 inactive 列不參與)', function() {
            let exU = [
                { email: 'a@x', from: 'g', isActive: 'n' },
                { email: 'b@x', from: 'g', isActive: 'y' },
                { email: 'c@x', from: 'g', isActive: '' },
            ]
            let rows = [
                { email: 'a@x', isActive: 'y' }, //他 from 為 inactive → 不衝突
                { email: 'b@x', isActive: 'n' }, //本批 inactive → 不參與
                { email: 'c@x', isActive: 'y' }, //他 from isActive 空 → 非 y → 不衝突
                { email: 'b@x', isActive: 'y' }, //他 from active → 衝突
            ]
            assert.strict.equal(findKeyOtherFrom(rows, exU, 'f', 'email', { onlyActive: true }), 3)
            assert.strict.equal(findKeyOtherFrom(rows, exU, 'f', 'email'), 0, '未限 active 時 a@x 即衝突(對照)')
        })

        it('KC-OF-005 rowsExist 非陣列／空 → -1', function() {
            assert.strict.equal(findKeyOtherFrom(nm('A'), [], 'x', 'name'), -1)
            assert.strict.equal(findKeyOtherFrom(nm('A'), null, 'x', 'name'), -1)
        })
    })


    // ===== KC-TD =====
    describe('findTouchedDup(後台整表寫入: 只回本次造成或觸及之同名)', function() {

        let old2 = [{ id: '1', name: 'X' }, { id: '2', name: 'X' }, { id: '3', name: 'Y' }]

        it('KC-TD-001 庫內無重複: 送入無重複 → -1; 送入有重複 → 第二次出現之索引', function() {
            let old = [{ id: '1', name: 'A' }, { id: '2', name: 'B' }]
            assert.strict.equal(findTouchedDup([{ id: '1', name: 'A' }, { id: '2', name: 'B' }], old, 'name'), -1)
            assert.strict.equal(findTouchedDup([{ id: '1', name: 'A' }, { id: '2', name: 'A' }], old, 'name'), 1, '改名撞名')
            assert.strict.equal(findTouchedDup([{ id: '1', name: 'A' }, { id: '2', name: 'B' }, { id: '9', name: 'B' }], old, 'name'), 2, '新增撞名')
        })

        it('KC-TD-002 歷史重複原樣送回(同 id 同名, 筆數不多於庫內) → -1', function() {
            assert.strict.equal(findTouchedDup([{ id: '1', name: 'X', description: 'edited' }, { id: '2', name: 'X' }, { id: '3', name: 'Y' }], old2, 'name'), -1)
            assert.strict.equal(findTouchedDup([{ id: '3', name: 'Y' }, { id: '2', name: 'X' }, { id: '1', name: 'X' }], old2, 'name'), -1, '順序不同亦可')
        })

        it('KC-TD-003 歷史重複中之一列刪除／改為唯一名稱 → -1', function() {
            assert.strict.equal(findTouchedDup([{ id: '1', name: 'X' }, { id: '3', name: 'Y' }], old2, 'name'), -1)
            assert.strict.equal(findTouchedDup([{ id: '1', name: 'X2' }, { id: '2', name: 'X' }, { id: '3', name: 'Y' }], old2, 'name'), -1)
            assert.strict.equal(findTouchedDup([{ id: '1', name: 'X2' }, { id: '2', name: 'X3' }, { id: '3', name: 'Y' }], old2, 'name'), -1)
        })

        it('KC-TD-004 歷史重複存在時: 新增第三個同名列／他列改名併入／重複中一列改成他名 → 回造成重複之索引', function() {
            assert.strict.equal(findTouchedDup([...old2, { id: '9', name: 'X' }], old2, 'name'), 3, '新增第三個')
            assert.strict.equal(findTouchedDup([{ id: '1', name: 'X' }, { id: '2', name: 'X' }, { id: '3', name: 'X' }], old2, 'name'), 2, 'Y 改名併入 X')
            assert.strict.equal(findTouchedDup([{ id: '1', name: 'Y' }, { id: '2', name: 'X' }, { id: '3', name: 'Y' }], old2, 'name'), 0, '重複中一列(id 1)改成已被他列使用之名: 回被觸及(改名)之列')
        })

        it('KC-TD-005 以新 id 取代舊列造出第三個同名: 筆數 > 庫內 → 回索引', function() {
            assert.strict.equal(findTouchedDup([{ id: '1', name: 'X' }, { id: '2', name: 'X' }, { id: '4', name: 'X' }], old2, 'name'), 2)
        })

        it('KC-TD-006 同一批同時有「歷史重複原樣」與「新造之重複」→ 回新造者', function() {
            let rows = [{ id: '1', name: 'X' }, { id: '2', name: 'X' }, { id: '3', name: 'Y' }, { id: '8', name: 'Z' }, { id: '9', name: 'Z' }]
            assert.strict.equal(findTouchedDup(rows, old2, 'name'), 3, 'Z 組兩列皆為新增: 回其中第一個(索引 3); X 組為歷史原樣, 不算')
        })

        it('KC-TD-007 庫內同名 3 筆: 原樣送回 3 筆 → -1; 送入 4 筆 → 回索引', function() {
            let old3 = [{ id: '1', name: 'X' }, { id: '2', name: 'X' }, { id: '3', name: 'X' }]
            assert.strict.equal(findTouchedDup(old3, old3, 'name'), -1)
            assert.strict.equal(findTouchedDup([...old3, { id: '4', name: 'X' }], old3, 'name'), 3)
        })

        it('KC-TD-008 缺 id／id 非字串之送入列不對應任何既有列 → 視為新增(撞名即回索引)', function() {
            assert.strict.equal(findTouchedDup([{ id: '1', name: 'X' }, { id: '2', name: 'X' }, { name: 'X' }], old2, 'name'), 2)
            assert.strict.equal(findTouchedDup([{ id: '1', name: 'X' }, { id: '2', name: 'X' }, { id: '', name: 'X' }], old2, 'name'), 2)
            assert.strict.equal(findTouchedDup([{ id: '1', name: 'X' }, { id: '2', name: 'X' }, { name: 'W' }], old2, 'name'), -1)
        })

        it('KC-TD-009 同 id 重送兩次(筆數超過庫內)不得被視為歷史重複原樣', function() {
            assert.strict.equal(findTouchedDup([{ id: '1', name: 'X' }, { id: '1', name: 'X' }, { id: '2', name: 'X' }], old2, 'name'), 1)
        })

        it('KC-TD-010 原型鍵名(constructor／__proto__)不誤判', function() {
            assert.strict.equal(findTouchedDup([{ id: '1', name: 'constructor' }, { id: '2', name: '__proto__' }], [], 'name'), -1)
            assert.strict.equal(findTouchedDup([{ id: '1', name: '__proto__' }, { id: '2', name: '__proto__' }], [], 'name'), 0, '兩列皆為新增: 回第一個被觸及者')
        })
    })


    // ===== KC-MK =====
    describe('mapKeyOf／checkMapKeyBatch(F-14: 對應鍵)', function() {

        let u = (email, name, isActive = 'y') => ({ email, name, isActive })

        it('KC-MK-001 mapKeyOf: id → null(不另檢查); email／name → 該欄位; 其他值 → null', function() {
            assert.strict.equal(mapKeyOf('id'), null)
            assert.strict.equal(mapKeyOf('email'), 'email')
            assert.strict.equal(mapKeyOf('name'), 'name')
            for (let v of [undefined, null, '', 'x', 5]) {
                assert.strict.equal(mapKeyOf(v), null)
            }
        })

        it('KC-MK-002 mappingBy=id: 任何形狀皆通過(email 空／重複／非字串)', function() {
            assert.strict.equal(checkMapKeyBatch([u('', 'a'), u('', 'b'), u('x', 'c'), u('x', 'd'), u(5, 'e')], 'id'), null)
        })

        it('KC-MK-003 email: active 列 email 為空／空白／非字串／缺漏 → mapKeyInvalid(索引為該列)', function() {
            for (let bad of ['', ' ', '\t\n', 5, true, null, undefined]) {
                let r = checkMapKeyBatch([u('ok@x', 'a'), u(bad, 'b')], 'email')
                assert.strict.deepEqual(r, { reason: 'mapKeyInvalid', k: 1 }, JSON.stringify(bad))
            }
            assert.strict.deepEqual(checkMapKeyBatch([{ name: 'a', isActive: 'y' }], 'email'), { reason: 'mapKeyInvalid', k: 0 }, '缺 email 欄位')
        })

        it('KC-MK-004 email: 批內 active 列重複(精確 ===) → mapKeyDuplicate(索引為第二次出現); 大小寫／空白不同不算重複', function() {
            assert.strict.deepEqual(checkMapKeyBatch([u('a@x', 'a'), u('b@x', 'b'), u('a@x', 'c')], 'email'), { reason: 'mapKeyDuplicate', k: 2 })
            assert.strict.equal(checkMapKeyBatch([u('a@x', 'a'), u('A@x', 'b'), u('a@x ', 'c')], 'email'), null)
        })

        it('KC-MK-005 email: isActive 非 y 之列不參與(空、重複、非字串皆可); isActive 為 \'\'／缺漏／\'n\'／\'Y\' 皆非 active', function() {
            for (let ia of ['n', '', 'Y', 'yes', undefined, null, 1]) {
                let rows = [u('a@x', 'a'), { email: '', name: 'b', isActive: ia }, { email: 'a@x', name: 'c', isActive: ia }, { email: 7, name: 'd', isActive: ia }]
                assert.strict.equal(checkMapKeyBatch(rows, 'email'), null, `isActive=${JSON.stringify(ia)}`)
            }
        })

        it('KC-MK-006 name: 同 email 規則套用於 name 欄位(email 空／重複不檢查)', function() {
            assert.strict.deepEqual(checkMapKeyBatch([u('', ''), u('', 'x')], 'name'), { reason: 'mapKeyInvalid', k: 0 })
            assert.strict.deepEqual(checkMapKeyBatch([u('', 'x'), u('', 'x')], 'name'), { reason: 'mapKeyDuplicate', k: 1 })
            assert.strict.equal(checkMapKeyBatch([u('', 'x'), u('', 'y')], 'name'), null, 'email 重複／空不檢查')
        })

        it('KC-MK-007 先掃全批之 invalid, 再查 duplicate(決定性次序): 重複在前、空值在後 → 回 mapKeyInvalid', function() {
            assert.strict.deepEqual(checkMapKeyBatch([u('a@x', 'a'), u('a@x', 'b'), u('', 'c')], 'email'), { reason: 'mapKeyInvalid', k: 2 })
        })

        it('KC-MK-008 rows 非陣列 → null', function() {
            assert.strict.equal(checkMapKeyBatch(null, 'email'), null)
        })
    })


    // ===== KC-PU =====
    describe('pickUniqueUser(F-14: 多筆不取首筆)', function() {

        it('KC-PU-001 0 筆: user=null, count=0(含非陣列)', function() {
            assert.strict.deepEqual(pickUniqueUser([]), { user: null, count: 0 })
            for (let v of [null, undefined, {}, 'x', 5]) {
                assert.strict.deepEqual(pickUniqueUser(v), { user: null, count: 0 })
            }
        })

        it('KC-PU-002 恰 1 筆: 回該列', function() {
            let u = { id: 'a' }
            let r = pickUniqueUser([u])
            assert.strict.equal(r.count, 1)
            assert.strict.equal(r.user, u)
        })

        it('KC-PU-003 多筆(2、3): user=null、count=筆數, 不取首筆', function() {
            assert.strict.deepEqual(pickUniqueUser([{ id: 'a' }, { id: 'b' }]), { user: null, count: 2 })
            assert.strict.deepEqual(pickUniqueUser([{ id: 'a' }, { id: 'b' }, { id: 'c' }]), { user: null, count: 3 })
        })

        it('KC-PU-004 非物件元素不計(null、字串)', function() {
            assert.strict.deepEqual(pickUniqueUser([null, { id: 'a' }, 'x']), { user: { id: 'a' }, count: 1 })
        })
    })


    // ===== SITE-KC: 站點不變式(靜態; 只擋字面與位置之回退, 不證明語意——語意由 unit-procCore-nameUniq、api-syncAndReplaceTabs、api-mapKey 證) =====
    describe('SITE-KC 站點不變式', function() {

        //去註解後之原始碼(行註解; 字串內之 // 不算)
        let readCode = (rel) => fs.readFileSync(path.join(projRoot, rel), 'utf8').split(/\r?\n/).map((ln) => stripLineComment(ln)).join('\n')

        //取函數本體: 自 `let name = async (` 起至下一個縮排 4 格之 `}` 行
        let takeBody = (code, startRe) => {
            let m = startRe.exec(code)
            assert.strict.ok(m, `找不到 ${startRe}`)
            let rest = code.slice(m.index)
            let end = rest.search(/\n    \}\n/)
            assert.strict.ok(end > 0, `找不到 ${startRe} 之結尾`)
            return rest.slice(0, end)
        }

        it('SITE-KC-001 syncAndReplaceTabs: 重複／他 from／對應鍵檢查皆位於 delAll 之前(R-NAME-UNIQ-01／R-MAPKEY-01: 被拒時不得先清既有列)', function() {
            let body = takeBody(readCode('server/WWebPerm.mjs'), /let syncAndReplaceTabs = async/)
            let iDel = body.indexOf('.delAll(')
            assert.strict.ok(iDel > 0, '應有 delAll')
            for (let fn of ['findDupIndex(', 'findKeyOtherFrom(', 'checkMapKeyBatch(']) {
                let i = body.indexOf(fn)
                assert.strict.ok(i > 0, `syncAndReplaceTabs 應呼叫 ${fn}`)
                assert.strict.ok(i < iDel, `${fn} 須位於 delAll 之前`)
            }
            assert.strict.ok(body.indexOf('nameDuplicate') > 0 && body.indexOf('nameOtherFrom') > 0, 'log reason 應含 nameDuplicate／nameOtherFrom')
            for (let r of ['mapKeyInvalid', 'mapKeyDuplicate', 'mapKeyOtherFrom']) {
                assert.strict.ok(body.indexOf(r) > 0 || fs.readFileSync(path.join(projRoot, 'server/keyCheck.mjs'), 'utf8').includes(r), `reason ${r} 須存在`)
            }
        })

        it('SITE-KC-002 資料通道只開 select(ADR-026: 裸寫入不可達, 故 grups／pemis 寫入入口僅外部同步與 updateGrups／updatePemis)', function() {
            let code = readCode('server/WWebPerm.mjs')
            assert.strict.ok(/methodsExec:\s*\['select'\]/.test(code))
        })

        it('SITE-KC-003 updateTabItems: findTouchedDup 位於第一個 procOrm 破壞步驟之前; pemis／grups 之差異恆以 id 對應(run04 主責補強, ADR-034 Update: 寫入後名稱集合須等於送入之整表), 送入整表之 id 重複先拒', function() {
            let code = readCode('server/procCore.mjs')
            let iCk = code.indexOf('findTouchedDup(')
            let iOrm = code.indexOf('procOrm(userId, keyTable')
            assert.strict.ok(iCk > 0 && iOrm > 0 && iCk < iOrm, 'findTouchedDup 須在 procOrm 寫入之前')
            assert.strict.ok(/if \(isNameKeyTable\) \{[\s\S]{0,1200}ltdtDiffByKey\(ltdtOld, withId, 'id'\)/.test(code), 'pemis／grups 須無條件以 id 對應差異(ltdtDiffByKey(ltdtOld, withId, \'id\'))')
            assert.strict.ok(!/isNameKeyTable && hasDupKey/.test(code), '不得再以「庫內已有同名」為條件才改 id 對應(name 鍵之 diff 會使庫內與送入不同, NU-040～042)')
            assert.strict.ok(/findDupIndex\(rows, 'id'/.test(code), 'pemis／grups 須先拒送入整表內重複之 id(NU-044; 空字串 id 視為未給不參與, NU-046)')
        })

        it('SITE-KC-007 外部同步與後台整表寫入共用同表互斥鍵 tabWriteKey(外審 sol R10): 兩處皆 kmx(tabWriteKey(keyTable), …), 不得再以各自的字面鍵取鎖(鍵不同則「先檢查唯一、後寫入」可交錯而略過 F-02／F-14)', function() {
            let sync = readCode('server/WWebPerm.mjs')
            let upd = readCode('server/procCore.mjs')
            assert.strict.ok(/kmx\(tabWriteKey\(keyTable\)/.test(sync), 'syncAndReplaceTabs 須以 tabWriteKey 取鎖')
            assert.strict.ok(/kmx\(tabWriteKey\(keyTable\)/.test(upd), 'updateTabItems 須以 tabWriteKey 取鎖')
            assert.strict.ok(!/kmx\(\s*['`]syncAndReplaceTabs:/.test(sync) && !/kmx\(\s*['`]updateTabItems:/.test(upd), '不得保留各自字面鍵')
            let n = (sync.match(/kmx\(/g) || []).length
            assert.strict.equal(n, 1, 'WWebPerm.mjs 內 kmx( 取鎖點只有 syncAndReplaceTabs 一處(多一處即須檢查是否與 tabWriteKey 巢狀而死結)')
            //兩入口須共用「同一個」pmKeyMutex 實例: 鍵字面相同而實例不同時互斥即失效(增量外審 mmd-N2)。server 內 pmKeyMutex() 恰一處, 且 procCore(...) 之選項 kmx 為該實例
            let serverDir = path.join(projRoot, 'server')
            let nInst = fs.readdirSync(serverDir).filter((f) => f.endsWith('.mjs')).reduce((a, f) => a + (readCode(`server/${f}`).match(/pmKeyMutex\(\)/g) || []).length, 0)
            assert.strict.equal(nInst, 1, 'server 內 pmKeyMutex() 實例只能有一個(兩入口共用)')
            assert.strict.ok(/let kmx = pmKeyMutex\(\)/.test(sync), 'WWebPerm.mjs 之 kmx 即該實例')
            assert.strict.ok(/procCore\(woItems,\s*procOrm,\s*\{[^}]*\bkmx\b[^}]*\}\)/.test(sync), 'procCore 須收同一個 kmx 實例(不得另建)')
            assert.strict.equal(tabWriteKey('grups'), tabWriteKey('grups'))
            assert.strict.notEqual(tabWriteKey('grups'), tabWriteKey('pemis'), '不同表不同鍵')
        })

        it('SITE-KC-004 反查 users 之站點只有兩處且皆經 pickUniqueUser; 不得再以 get(userFind, 0 取首筆(R-MAPKEY-02)', function() {
            let code = readCode('server/WWebPerm.mjs')
            let sel = code.match(/woItems\.users\.select\(/g) || []
            assert.strict.equal(sel.length, 2, 'woItems.users.select( 之站點: getTokenUser、getGenUserByKV')
            let pu = code.match(/pickUniqueUser\(/g) || []
            assert.strict.ok(pu.length >= 2, `pickUniqueUser 應被兩個站點呼叫, 實得 ${pu.length}`)
            assert.strict.ok(!/get\(userFind,\s*0/.test(code), '不得取首筆')
            let tok = takeBody(code, /let getTokenUser = async/)
            assert.strict.ok(tok.includes('pickUniqueUser('), 'getTokenUser 須經 pickUniqueUser')
            assert.strict.ok(tok.includes('ambiguousUserFromPerm'), 'getTokenUser 須回 ambiguousUserFromPerm')
            let gen = takeBody(code, /let getGenUserByKV = async/)
            assert.strict.ok(gen.includes('pickUniqueUser('), 'getGenUserByKV 須經 pickUniqueUser')
        })

        it('SITE-KC-005 getTokenUser 之 srLog 不記對應值(email／name 為個資): 記 mappingBy 與 count, 不記 vSelf／userSelf', function() {
            let code = readCode('server/WWebPerm.mjs')
            let tok = takeBody(code, /let getTokenUser = async/)
            let m = /srLog\.error\(\{[^}]*ambiguousUserFromPerm[^}]*\}\)/.exec(tok)
            assert.strict.ok(m, '應有 ambiguousUserFromPerm 之 srLog.error')
            assert.strict.ok(/mappingBy/.test(m[0]) && /count/.test(m[0]), '應記 mappingBy 與 count')
            assert.strict.ok(!/vSelf|userSelf/.test(m[0]), '不得記使用者之對應值')
        })

        it('SITE-KC-006 procLang 含 nameDuplicate、ambiguousUserFromPerm 之 eng 與 cht(新語系鍵, F-02／F-14)', async function() {
            let procLang = (await import('../server/procLang.mjs')).default
            let kp = procLang({})
            for (let k of ['nameDuplicate', 'ambiguousUserFromPerm']) {
                for (let lang of ['eng', 'cht']) {
                    assert.strict.ok(typeof kp[lang][k] === 'string' && kp[lang][k] !== '', `${k} ${lang}`)
                }
            }
        })
    })

})
