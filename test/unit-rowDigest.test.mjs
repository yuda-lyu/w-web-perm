//載入基準之套內轉接層與四份寫入契約(多人同時編輯共用核心; perm-run01; 規則帳本 R-BASELINE-01、R-CONTRACT-01; ADR-037 Update(perm-run01))
//
//受測: src/js/rowDigest.mjs(轉接 w-serv-orm/src/baseline.mjs: makeBaseline／compareBaseline／isBaselineStale／checkBaseline／getContract)與 src/schema/contracts/*.mjs.
//摘要、基準、比對之演算法與型別規則由 w-serv-orm 自己的 unit-baseline 覆蓋; 本檔只驗「套內怎麼用它」:
//  - 契約: 四表各一份、通過核心 checkContract; 每個 schema 欄位恰好歸屬 主鍵／名次欄／fields／serverOnly 其一(盤點表, 規格第 9 節); from 與 srcKey(perm-run03 新增之外部匯入來源鍵)為外部列身分須入 fields;
//    升版新增 srcKey 使舊契約算出之基準一律與升版後整表不符(RD-C6: 持舊畫面者過期,非 baselineFormat), 凍結向量(RD-V1)隨之更新, 舊契約重算仍等於升版前凍結值(RD-V2);
//  - 套內不再自帶指紋演算法(舊 rowDigest.mjs 之 cyrb53／getDigestFields／rowDigest 已刪除); 前後端與伺服端 import 同一份契約;
//  - 已知缺口 (d) 空值等價: undefined／null／'' 同一空值, 不誤擋; (e) 名次入基準: 他人重排被偵測, 系統重編號(名次不變)不誤擋;
//  - 舊格式(套內版、無 'h1:' 前綴)或不識版本之基準 → baselineFormat(伺服端 saveBaselineFormat, 提示重新載入), 不降級為未帶基準;
//  - 先動先贏未削弱: 他人改任一列、增、刪列, 持舊基準一律過期.
//規格(每條 assertion 註解標出對應句): RD-C 契約盤點; RD-B 基準建立; RD-F 逐欄摘要; RD-S 比對與拒收鍵; RD-T 傳輸同構(JSON 往返); RD-V 凍結向量; RD-X 站點不變式.
//輸入空間表: 四表 × (fields 各欄改動／serverOnly 各欄改動／order 改動／空值三態／列增刪／重排／重編號／舊格式／壞格式) — 見下各 describe 之迴圈, 無刻意不測格.
//跑法: npx mocha test/unit-rowDigest.test.mjs --timeout 60000
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { checkContract, buildBaseline, digestRow } from 'w-serv-orm/src/baseline.mjs'
import ds from '../src/schema/index.mjs'
import contracts from '../src/schema/contracts/index.mjs'
import { getContract, makeBaseline, isBaselineValid, compareBaseline, isBaselineStale, checkBaseline } from '../src/js/rowDigest.mjs'
import { SERVER_FIELDS } from '../src/js/externalRows.mjs'
import { TABLES, mkRow, rowWith, MISSING } from './tools/unitExt.mjs'


const projRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const readSrc = (rel) => fs.readFileSync(path.join(projRoot, rel), 'utf8').replace(/\r\n/g, '\n')


describe('unit-rowDigest (載入基準轉接層與寫入契約, perm-run01)', function() {

    describe('寫入契約盤點(RD-C)', function() {

        for (let t of TABLES) {
            let c = contracts[t]

            it(`RD-C1 ${t}: 契約通過核心 checkContract; table／pk／orderKey 正確; getContract 回同一份物件`, function() {
                assert.strict.equal(checkContract(c), true) //規格第 3 節: 契約結構合法
                assert.strict.equal(c.table, t)
                assert.strict.equal(c.pk, 'id')
                assert.strict.equal(c.orderKey, 'order', '[規格第 5 節] 存檔依列序重編 order 之表: 名次入基準')
                assert.strict.equal(getContract(t), c)
            })

            it(`RD-C2 ${t}: 盤點——schema 每個欄位恰好歸屬 主鍵／名次欄／fields／serverOnly 之一, 無遺漏無重複  [規格第 3、4、9 節]`, function() {
                let all = [c.pk, c.orderKey, ...c.fields, ...c.serverOnly]
                assert.strict.equal(new Set(all).size, all.length, '契約內欄位不得重複歸屬')
                assert.strict.deepEqual([...all].sort(), [...ds[t].keys].sort(), '契約欄位全集須等於 schema 欄位全集(新增欄位未歸類即缺口)')
            })

            it(`RD-C3 ${t}: serverOnly 即四個伺服器專有欄(與 externalRows.SERVER_FIELDS 同一組); from 與 srcKey 為外部列身分欄須入 fields(外部同步改 from／補上或改變 srcKey 即使持舊畫面者過期)  [規格第 3、4 節]`, function() {
                assert.strict.deepEqual([...c.serverOnly].sort(), [...SERVER_FIELDS].sort())
                assert.strict.ok(c.fields.indexOf('from') >= 0)
                assert.strict.ok(c.fields.indexOf('srcKey') >= 0, 'srcKey(perm-run03 新增之身分欄)須入 fields')
            })
        }

        it('RD-C4 四表之 fields 內容(白名單明列, 不以排除推得; 變動即升版或影響舊頁面, 須同步 README Upgrade Notes; perm-run03: 四表皆於 from 之後新增 srcKey〔外部匯入之來源鍵, 身分欄〕)  [規格第 3 節]', function() {
            assert.strict.deepEqual(contracts.users.fields, ['name', 'email', 'description', 'from', 'srcKey', 'cgrups', 'isAdmin', 'isActive'])
            assert.strict.deepEqual(contracts.grups.fields, ['name', 'description', 'from', 'srcKey', 'cpemis'])
            assert.strict.deepEqual(contracts.pemis.fields, ['name', 'description', 'from', 'srcKey', 'crules'])
            assert.strict.deepEqual(contracts.targets.fields, ['description', 'from', 'srcKey'])
        })

        for (let t of TABLES) {
            it(`RD-C6 ${t}: 升版新增 srcKey 欄——同一列相對「舊契約〔無 srcKey〕」與新契約之摘要不同(升版前開啟之頁面持舊基準,升版後一律過期、提示重新載入); 舊契約之摘要與升版前凍結值相同(其餘欄位編碼未變); srcKey 為空值時新契約之摘要等價於缺欄`, function() {
                let c = contracts[t]
                let legacy = { ...c, fields: c.fields.filter((f) => f !== 'srcKey') }
                assert.strict.equal(checkContract(legacy), true)
                let base = mkRow(t, { id: 'r1', order: 1 })
                //新增欄位使摘要不同(欄位序列多一格)——即使 srcKey 為空值
                assert.strict.notEqual(digestRow(base, c), digestRow(base, legacy))
                //舊契約算出之基準(= 升版前頁面持有者)對升版後之同一整表比對: 全部列內容摘要不同 → saveStale/rowChanged
                let rows = [mkRow(t, { id: 'r1', order: 1 }), mkRow(t, { id: 'r2', order: 2, description: '' })]
                let oldBl = buildBaseline(rows, legacy)
                assert.strict.equal(isBaselineValid(oldBl), true, '格式仍為合法 h1 基準(不是 baselineFormat)')
                assert.strict.equal(isBaselineStale({ keyTable: t, rows, baseline: oldBl }), true)
                assert.strict.deepEqual(checkBaseline({ keyTable: t, ltdtOld: rows, baseline: oldBl }), { key: 'saveStale', reason: 'rowChanged', n: 2 })
                //srcKey 空值三態(缺欄／null／空字串)於新契約下摘要相同(核心空值等價), 故新舊畫面一致之空 srcKey 列不因表示法不同而誤擋
                let a = digestRow(rowWith(base, { srcKey: '' }), c)
                assert.strict.equal(digestRow(rowWith(base, { srcKey: null }), c), a)
                assert.strict.equal(digestRow(rowWith(base, { srcKey: undefined }), c), a)
                assert.strict.equal(digestRow(rowWith(base, { srcKey: MISSING }), c), a)
                //srcKey 有值則摘要不同(外部匯入補上／改變 srcKey 使持舊畫面者存檔過期, 見 RD-F1 逐欄)
                assert.strict.notEqual(digestRow(rowWith(base, { srcKey: 'sk-1' }), c), a)
            })
        }

        it('RD-C5 getContract 拒絕未知表名與非字串(含原型鍵)', function() {
            for (let bad of ['x', '', 'constructor', '__proto__', 'toString', null, undefined, 1, {}]) {
                assert.strict.throws(() => getContract(bad), /invalid keyTable/, String(bad))
            }
        })

    })

    describe('基準建立(RD-B)', function() {

        for (let t of TABLES) {
            let rows = [mkRow(t, { id: 'b', order: 2 }), mkRow(t, { id: 'a', order: 2 }), mkRow(t, { id: 'c', order: 1 })]

            it(`RD-B1 ${t}: makeBaseline 即核心 buildBaseline(契約); 序即名次(order 數值, 主鍵碼元); 格式 h1  [規格第 5 節]`, function() {
                let bl = makeBaseline(rows, t)
                assert.strict.deepEqual(bl, buildBaseline(rows, contracts[t]))
                assert.strict.deepEqual(bl.map((e) => e[0]), ['c', 'a', 'b'], 'order 小者在前, 同 order 依主鍵碼元')
                for (let e of bl) {
                    assert.strict.match(e[1], /^h1:[0-9a-f]{14}$/)
                }
                assert.strict.equal(isBaselineValid(bl), true)
            })

            it(`RD-B2 ${t}: 主鍵缺漏或重複(資料異常, 正常不會發生)→ makeBaseline 不拋錯而回空基準; 與非空整表比對必過期(fail-closed, 提示重新載入)`, function() {
                let dup = [mkRow(t, { id: 'a', order: 1 }), mkRow(t, { id: 'a', order: 2 })]
                let noId = [mkRow(t, { id: 'a', order: 1 }), rowWith(mkRow(t, { order: 2 }), { id: MISSING })]
                assert.strict.deepEqual(makeBaseline(dup, t), [])
                assert.strict.deepEqual(makeBaseline(noId, t), [])
                assert.strict.equal(isBaselineStale({ keyTable: t, rows: dup.slice(0, 1), baseline: makeBaseline(dup, t) }), true)
            })

            it(`RD-B3 ${t}: 非陣列輸入視為空表`, function() {
                assert.strict.deepEqual(makeBaseline(null, t), [])
                assert.strict.deepEqual(makeBaseline(undefined, t), [])
                assert.strict.deepEqual(makeBaseline('x', t), [])
            })
        }

    })

    describe('逐欄摘要(RD-F: 入基準之欄位改動即不同, 不入基準者不影響, 空值等價)', function() {

        for (let t of TABLES) {
            let c = contracts[t]
            let base = mkRow(t, { id: 'r1', order: 1 })

            for (let f of c.fields) {
                it(`RD-F1 ${t}.${f}: 改動(客戶端／雙方欄位, 入基準)→ 摘要不同, 持舊基準者過期  [規格第 4、5 節]`, function() {
                    let a = digestRow(base, c)
                    let b = digestRow(rowWith(base, { [f]: 'CHANGED' }), c)
                    assert.strict.notEqual(a, b)
                    let bl = makeBaseline([base], t)
                    assert.strict.equal(isBaselineStale({ keyTable: t, rows: [rowWith(base, { [f]: 'CHANGED' })], baseline: bl }), true)
                })
            }

            for (let f of c.serverOnly) {
                it(`RD-F2 ${t}.${f}: 伺服器專有欄位改動(系統寫入)→ 摘要不變, 不誤擋  [規格第 4 節、V5]`, function() {
                    assert.strict.equal(digestRow(base, c), digestRow(rowWith(base, { [f]: 'SYSTEM-WROTE' }), c))
                    let bl = makeBaseline([base], t)
                    assert.strict.equal(isBaselineStale({ keyTable: t, rows: [rowWith(base, { [f]: 'SYSTEM-WROTE' })], baseline: bl }), false)
                })
            }

            it(`RD-F3 ${t}: order 數值改動本身不入摘要(只經名次影響基準); 其餘未列入契約之任意鍵不影響  [規格第 5 節]`, function() {
                assert.strict.equal(digestRow(base, c), digestRow(rowWith(base, { order: 999, zzExtra: 1, belongUsers: 'x', us: [] }), c))
            })

            it(`RD-F4 ${t}: 空值等價——undefined／null／缺欄／空字串同一空值, 修已知缺口 (d)(舊版 '' 與 null 不同而誤擋); 0、false、'0' 不是空值  [規格第 5 節]`, function() {
                let f = c.fields.find((k) => k !== 'from') //任一入基準欄位
                let e = rowWith(base, { [f]: '' })
                let a = digestRow(e, c)
                for (let v of [null, undefined]) {
                    assert.strict.equal(digestRow(rowWith(base, { [f]: v }), c), a, `${f}=${String(v)}`)
                }
                assert.strict.equal(digestRow(rowWith(base, { [f]: MISSING }), c), a, '缺欄')
                for (let v of [0, false, '0', ' ']) {
                    assert.strict.notEqual(digestRow(rowWith(base, { [f]: v }), c), a, `${f}=${JSON.stringify(v)} 不是空值`)
                }
                //表級: 以空字串建基準, 目前列為 null／缺欄 → 不過期
                let bl = makeBaseline([e], t)
                assert.strict.equal(isBaselineStale({ keyTable: t, rows: [rowWith(base, { [f]: null })], baseline: bl }), false)
                assert.strict.equal(isBaselineStale({ keyTable: t, rows: [rowWith(base, { [f]: MISSING })], baseline: bl }), false)
            })

            it(`RD-F5 ${t}: 數字與字串不互轉(1 與 '1' 摘要不同)——兩端同一快照故不會因型別而誤擋, 但真的不同值要被偵測  [規格第 5 節]`, function() {
                let f = c.fields.find((k) => k !== 'from')
                assert.strict.notEqual(digestRow(rowWith(base, { [f]: 1 }), c), digestRow(rowWith(base, { [f]: '1' }), c))
            })

            it(`RD-F6 ${t}: 物件鍵序無關(欄位值為物件時)`, function() {
                let f = c.fields.find((k) => k !== 'from')
                assert.strict.equal(digestRow(rowWith(base, { [f]: { a: 1, b: [1, 2] } }), c), digestRow(rowWith(base, { [f]: { b: [1, 2], a: 1 } }), c))
                assert.strict.notEqual(digestRow(rowWith(base, { [f]: { a: 1, b: [1, 2] } }), c), digestRow(rowWith(base, { [f]: { a: 1, b: [2, 1] } }), c), '陣列保序')
            })
        }

    })

    describe('比對與拒收鍵(RD-S)', function() {

        for (let t of TABLES) {
            let rows0 = [mkRow(t, { id: 'r1', order: 1, description: '' }), mkRow(t, { id: 'r2', order: 2, description: '' }), mkRow(t, { id: 'r3', order: 3, description: '' })]
            let bl = makeBaseline(rows0, t)
            //第 2 參顯式給(含 undefined)即用它, 不給才用 bl(不用預設參數: undefined 會被預設值吃掉)
            let cmp = (rows, ...a) => compareBaseline({ keyTable: t, rows, baseline: a.length > 0 ? a[0] : bl })
            let chk = (rows, ...a) => checkBaseline({ keyTable: t, ltdtOld: rows, baseline: a.length > 0 ? a[0] : bl })

            it(`RD-S1 ${t}: 整表一致 → 相符(reason 空字串)、checkBaseline 回 null`, function() {
                assert.strict.deepEqual(cmp(rows0), { nChanged: 0, nRemoved: 0, nAdded: 0, reordered: false, reason: '' })
                assert.strict.equal(chk(rows0), null)
            })

            it(`RD-S2 ${t}: 先動先贏未削弱——他人改任一列／刪任一列／增一列／清空, 一律 saveStale; 差異筆數與 reason 對應  [規格第 6 節、V1、V3]`, function() {
                for (let k = 0; k < 3; k++) {
                    let changed = rows0.map((r, j) => (j === k ? rowWith(r, { description: 'by-other' }) : r))
                    assert.strict.deepEqual(chk(changed), { key: 'saveStale', reason: 'rowChanged', n: 1 }, `改第 ${k} 列`)
                    let removed = rows0.filter((r, j) => j !== k)
                    assert.strict.deepEqual(chk(removed), { key: 'saveStale', reason: 'rowRemoved', n: 1 }, `刪第 ${k} 列`)
                }
                assert.strict.deepEqual(chk([...rows0, mkRow(t, { id: 'rN', order: 4 })]), { key: 'saveStale', reason: 'rowAdded', n: 1 })
                assert.strict.deepEqual(chk([]), { key: 'saveStale', reason: 'rowRemoved', n: 3 })
            })

            it(`RD-S3 ${t}: 名次——他人只重排(內容與列集合不變)→ saveStale/rowReordered; 系統重編號(order 值全變而名次不變)、外部同步整批重寫(伺服器專有欄全變)→ 相符  [規格第 5 節、V9; 修已知缺口 (e)]`, function() {
                let reordered = [rows0[2], rows0[0], rows0[1]].map((r, k) => rowWith(r, { order: k + 1 }))
                assert.strict.deepEqual(chk(reordered), { key: 'saveStale', reason: 'rowReordered', n: 1 })
                assert.strict.equal(cmp(reordered).reordered, true)
                let renum = rows0.map((r, k) => rowWith(r, { order: (k + 1) * 100 }))
                assert.strict.equal(chk(renum), null)
                let sync = rows0.map((r) => rowWith(r, { userId: 'sync', timeCreate: 'T2', userIdUpdate: 'sync', timeUpdate: 'T2' }))
                assert.strict.equal(chk(sync), null)
            })

            it(`RD-S4 ${t}: 同 order 之列以主鍵碼元序排名(不依傳入順序); 傳入順序不同而名次相同 → 相符`, function() {
                let tie = [mkRow(t, { id: 'b', order: 5 }), mkRow(t, { id: 'a', order: 5 })]
                let blTie = makeBaseline(tie, t)
                assert.strict.equal(chk([tie[1], tie[0]], blTie), null)
                assert.strict.equal(chk(tie, blTie), null)
            })

            it(`RD-S5 ${t}: 基準只含一列而該列已不在、且無新增列 → saveStale／rowNotFound(核心規則); 其餘單列不符仍為 rowChanged  [規格第 6 節]`, function() {
                let b1 = makeBaseline([rows0[0]], t)
                assert.strict.deepEqual(chk([], b1), { key: 'saveStale', reason: 'rowNotFound', n: 1 })
                assert.strict.deepEqual(chk([rowWith(rows0[0], { description: 'x' })], b1), { key: 'saveStale', reason: 'rowChanged', n: 1 })
            })

            it(`RD-S6 ${t}: 格式或版本不識一律 saveBaselineFormat(提示重新載入), 不降級為未帶基準——套內舊版指紋(base36)、h2、長度不符、大小寫不符、重複 id、非陣列、元素形狀不合  [規格第 5、6 節、V13; README Upgrade Notes]`, function() {
                let legacy = bl.map((e) => [e[0], 'abc1x2y3z4w5']) //套內舊版指紋形狀(無 h1: 前綴之 base36 字串)
                let BAD = [
                    ['套內舊版指紋', legacy],
                    ['h2 版本', bl.map((e) => [e[0], 'h2:' + e[1].slice(3)])],
                    ['h1 長度不足', bl.map((e) => [e[0], e[1].slice(0, -1)])],
                    ['h1 大寫十六進位', bl.map((e) => [e[0], e[1].toUpperCase().replace('H1', 'h1')])],
                    ['版本前綴大寫', bl.map((e) => [e[0], 'H' + e[1].slice(1)])],
                    ['重複 id', [bl[0], bl[0]]],
                    ['元素非陣列', ['r1']],
                    ['元素長度 3', [['r1', bl[0][1], 'x']]],
                    ['id 為數字', [[1, bl[0][1]]]],
                    ['id 為空字串', [['', bl[0][1]]]],
                    ['摘要為數字', [['r1', 5]]],
                    ['物件', { r1: bl[0][1] }],
                    ['字串', 'h1:xxxx'],
                    ['數字', 5],
                    ['null', null],
                    ['undefined', undefined],
                ]
                for (let [title, b] of BAD) {
                    assert.strict.equal(isBaselineValid(b), false, `isBaselineValid: ${title}`)
                    assert.strict.deepEqual(chk(rows0, b), { key: 'saveBaselineFormat', reason: 'baselineFormat', n: 0 }, title)
                    assert.strict.equal(cmp(rows0, b).reason, 'baselineFormat', title)
                    assert.strict.equal(isBaselineStale({ keyTable: t, rows: rows0, baseline: b }), true, `${title}: 前端視為過期(提示重新載入)`)
                }
                assert.strict.equal(isBaselineValid([]), true, '空陣列(空表)合法')
            })

            it(`RD-S7 ${t}: 庫內列主鍵缺漏或重複 → compareBaseline 拋 key=rowsInvalid(伺服端資料錯誤, 非重新載入能解); 前端 isBaselineStale 容錯視為過期  [規格第 6 節]`, function() {
                let dup = [rows0[0], rows0[0]]
                let e = null
                try {
                    cmp(dup)
                }
                catch (err) {
                    e = err
                }
                assert.strict.ok(e !== null && e.key === 'rowsInvalid')
                assert.strict.equal(isBaselineStale({ keyTable: t, rows: dup, baseline: bl }), true)
            })
        }

    })

    describe('傳輸同構(RD-T: 前端以 store 列自算、伺服端以新鮮讀取之列重算, 經 JSON 傳輸後仍相等)', function() {

        for (let t of TABLES) {
            it(`RD-T1 ${t}: 列經 JSON 往返(undefined 鍵消失)後算出之基準 = 原列算出者  [規格第 8 節、V10]`, function() {
                let rows = [
                    mkRow(t, { id: 'r1', order: 1, description: undefined }),
                    mkRow(t, { id: 'r2', order: 2.5, description: '中文 " \\ \n   😀' }),
                    mkRow(t, { id: 'r3', order: 3, description: '' }),
                ]
                let viaJson = JSON.parse(JSON.stringify(rows))
                assert.strict.deepEqual(makeBaseline(viaJson, t), makeBaseline(rows, t))
                assert.strict.equal(isBaselineStale({ keyTable: t, rows: viaJson, baseline: makeBaseline(rows, t) }), false)
            })
        }

    })

    describe('凍結向量(RD-V: 契約欄位序或政策被改動即改變摘要而使升級前開啟之頁面全數過期, 須同步 README Upgrade Notes)', function() {

        //perm-run03: 契約新增 srcKey 欄(欄位序列多一格)使摘要全變, 此為預期之升版(升版前開啟之頁面一律過期, 見 RD-C6; README Upgrade Notes); 新凍結值即新契約(fields 含 srcKey)之摘要,
        //VEC_LEGACY 為升版前之凍結值——以「舊契約〔fields 去掉 srcKey〕」重算須仍相同(證明新增欄位未改變其餘欄位之編碼與核心演算法)
        const VEC = {
            users: [['r1', 'h1:0b4e2ec491a5f2'], ['r2', 'h1:108ee14029cf03']],
            grups: [['r1', 'h1:10ec2d1dece75f'], ['r2', 'h1:1b7dfccf489555']],
            pemis: [['r1', 'h1:0d77ff6a75254d'], ['r2', 'h1:1e459797ce0ab1']],
            targets: [['r1', 'h1:041b97fc3881a0'], ['r2', 'h1:046d255e812572']],
        }
        const VEC_LEGACY = {
            users: [['r1', 'h1:01b8e8db455e96'], ['r2', 'h1:09417201f43f73']],
            grups: [['r1', 'h1:0d0acc22b36db2'], ['r2', 'h1:1841da7c897669']],
            pemis: [['r1', 'h1:0a106ccf30a572'], ['r2', 'h1:0ffc03080cc41f']],
            targets: [['r1', 'h1:0fdf3754416649'], ['r2', 'h1:12a9e132d30ad6']],
        }
        for (let t of TABLES) {
            it(`RD-V1 ${t}: 固定兩列(mkRow, 第二列 description 空字串; srcKey 預設空字串)之基準等於凍結值`, function() {
                let rows = [mkRow(t, { id: 'r1', order: 1 }), mkRow(t, { id: 'r2', order: 2, description: '' })]
                assert.strict.deepEqual(makeBaseline(rows, t), VEC[t])
            })

            it(`RD-V2 ${t}: 以舊契約(fields 去掉 srcKey)重算同一固定兩列 = 升版前之凍結值(新增 srcKey 欄位未改動其餘欄位之編碼)`, function() {
                let rows = [mkRow(t, { id: 'r1', order: 1 }), mkRow(t, { id: 'r2', order: 2, description: '' })]
                let legacy = { ...contracts[t], fields: contracts[t].fields.filter((f) => f !== 'srcKey') }
                assert.strict.deepEqual(buildBaseline(rows, legacy), VEC_LEGACY[t])
            })
        }

    })

    describe('站點不變式(RD-X, 靜態)', function() {

        it('RD-X1 rowDigest.mjs 只轉接共用核心: 匯入 w-serv-orm/src/baseline.mjs 與契約集合; 不自帶指紋演算法(無 cyrb53 實作、無 Math.imul、無 JSON.stringify 摘要)  [規格第 5 節]', function() {
            let code = readSrc('src/js/rowDigest.mjs').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')
            assert.strict.ok(code.includes(`from 'w-serv-orm/src/baseline.mjs'`) && code.includes(`from '../schema/contracts/index.mjs'`))
            assert.strict.ok(!/Math\.imul|function cyrb53|JSON\.stringify|charCodeAt/.test(code), '不得自帶摘要演算法')
            assert.strict.ok(!/getDigestFields|getBaselineDigest/.test(code), '舊 API 已刪除')
        })

        it('RD-X2 src／server 內除 w-serv-orm 外無其他摘要實作(cyrb53／imul 字樣只可能在 node_modules)', function() {
            let hits = []
            let walk = (dir) => {
                for (let f of fs.readdirSync(path.join(projRoot, dir), { withFileTypes: true })) {
                    let rel = `${dir}/${f.name}`
                    if (f.isDirectory()) {
                        if (f.name !== 'node_modules' && f.name !== 'staLogs') {
                            walk(rel)
                        }
                    }
                    else if (/\.(mjs|vue|js)$/.test(f.name)) {
                        let code = readSrc(rel).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')
                        if (/Math\.imul|function cyrb53|const cyrb53|let cyrb53/.test(code)) {
                            hits.push(rel)
                        }
                    }
                }
            }
            walk('src')
            walk('server')
            assert.strict.deepEqual(hits, [])
        })

        it('RD-X3 契約檔為純資料(零 import)且前後端各處只經 contracts／getContract 取用; server 與 src 的 baseline 匯入皆指向 w-serv-orm/src/baseline.mjs', function() {
            for (let t of TABLES) {
                let code = readSrc(`src/schema/contracts/${t}.mjs`).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')
                assert.strict.ok(!/^\s*import\s/m.test(code), `${t}.mjs 不得有 import`)
            }
            for (let rel of ['server/procCore.mjs', 'src/js/rowDigest.mjs']) {
                assert.strict.ok(/from 'w-serv-orm\/src\/baseline\.mjs'/.test(readSrc(rel)), rel)
            }
        })

    })

})
