//外部同步(syncAndReplaceTabs)之保留指派欄與 id 重編偵測純函數單元測試(F-23; R-PRINCIPLE-00 原則 3、5; 規則帳本 R-EXT-OWN-01; ADR-037; run07 U1)
//
//受測: server/syncKeep.mjs: markHasKey／keepAssignOnMissing／countIdRenumber.
//
//規格來源(期望由下列規則推導, 不抄實作):
//  SK-S1 users 指派欄(cgrups)屬後台(Lv1): 外部同步 payload 之 users 列「缺 cgrups 鍵」時保留庫內值(含該鍵則以外部為準, 即使值為 ''／undefined);
//        修正前 ltdtmapping 缺鍵補 ''、delAll＋insert 即清掉後台已指派之群組(run06 已知限制④).
//  SK-S2 對應庫內列: 先依 id(有限數字取其字串形式、非空字串); 無 id 者在 mappingBy 為 email／name 時依該欄位, 須恰命中 1 筆(命中多筆不取首筆、對不到不保留 → 維持缺鍵之預設);
//        有 id 者只依 id 對應(id 不在庫內即新使用者, 不改以 email 對應); mappingBy 為 'id'(預設)或其他值時無 id 者不保留.
//        (run07 外審 sol R3 修訂) mappingBy 為 email／name 時, 登入以對應鍵找使用者: 本批列以 id 對到之舊列, 其對應鍵值(缺欄視 '')須與本批列相同, 否則為「同來源 id 重用／重編」之矛盾
//        (id 指向 A、對應鍵卻是 B), 自動把 A 之後台指派移轉給 B 屬靜默擇一(R-PRINCIPLE-00 原則 3), 一律不保留(收嚴; 即使對應鍵恰屬另一舊列亦不改以對應鍵取); 原規格為「id 優先、不看對應鍵」, SK-025 之期望隨之改寫.
//        mappingBy 為 'id'(預設)或其他值時只依 id, 不看對應鍵(不受 R3 影響).
//  SK-S3 庫內該列無此欄位(自有屬性)時不保留; 回傳 { rows, nKeep, nSkip }: rows 為新陣列(不改輸入), nKeep 為保留筆數, nSkip 為「可對應且庫內有該欄位, 但 isKeepable 為假而未保留」之筆數.
//  SK-S6 (run07 外審 sol R4) 保留值須能原樣通過寫入前驗證: 呼叫端傳入 isKeepable(收庫內值, 回布林; 預設恆可), 為假者不保留(列原樣、不補鍵、計入 nSkip 不計 nKeep);
//        庫內歷史值若含會被 clearXSS 改寫之標記或非純量, 入庫時被 ORM 改寫而使引用改指他名(增權), 一律不保留(視為空, 收嚴). isKeepable 只對「已對應到庫內列、庫內有該欄位且非含鍵列」之值呼叫(對不到／含鍵／矛盾者不呼叫).
//        站點接線(server/WWebPerm.mjs:syncAndReplaceTabs): isKeepable = (val) => validateRowsBeforeWrite([{ id: 'keep', cgrups: val }]) === null, 位於 delAll 之前, nSkip>0 記 warn(syncAndReplaceTabs-keepAssign-skip, 不含值);
//        真後端行為由 API 層另測(本檔只做純函數層與站點之靜態斷言).
//  SK-S4 id 重編偵測(外部 id 不穩定時, id 消失＝刪除會每次清理引用而抹掉後台指派, 故以 warn log 與頁面橫幅提示): 本批列帶 id 與其名稱, 庫內同一 from 有「同名、不同 id、且該舊 id 不在本批」之列 → 計入;
//        同名同 id、舊 id 仍在本批、本批列無 id、非物件元素 → 不計; 筆數以本批列計.
//  SK-S5 原型鍵名(__proto__／constructor／toString／hasOwnProperty)作為 id、email、name 時不出錯、不污染原型、判定與一般字串相同.
//
//輸入空間表(軸 × 格數; 格數於檔尾 SK-999 以計數器核對):
//  markHasKey            鍵狀態{自有有值,自有 undefined,自有 null,缺,繼承} 5 ＋ 元素型別{null,undefined,字串,數字,陣列} 5 ＋ 物件自有 hasOwnProperty／無原型物件 2 ＋ 次序／空陣列／不同鍵名 3 ＋ 不改輸入 1 = 16, 全測
//  keepAssignOnMissing   mappingBy{id,email,name,其他 4 種} × 列有無 id{字串,有限數字 3,NaN／Infinity／''／null／布林／物件 6} × 有無鍵 × 庫內對應{0,1,多筆} × 庫內有無該欄 × 對應欄位{空,缺,非字串 6};
//                        批次／不改輸入／非物件／自訂 key／庫內值型別／hasKey 異常／原型鍵名 id 6＋庫內 3＋email／name 2 共 56 格, 全測
//                        [run07 R3 對應鍵矛盾] mappingBy{email,name} × id 對到之舊列對應鍵{相同,相異,雙缺／空,一缺一有 4 種, 與他列互換} 與 mappingBy{id,foo,null} 不受影響: SK-025／025b／026／027／028／029／036／037 共 17 格(SK-025 計入 KA 之 56 格, 其餘 16 格計 R3)
//                        [run07 R4 isKeepable] 預設恆可／為假不保留與 nSkip／僅對保留候選呼叫／混批／不改輸入／與 R3 互動 6 ＋ 以站點同式 predicate(validateRowsBeforeWrite)接真驗證 8 種庫內值 共 14 格(計 R4); 站點靜態 SITE-SK 另 2 案(不計格)
//  countIdRenumber       12 格(同名異 id／同名同 id／舊 id 仍在本批／無 id／非物件／部分重編／改名非重編／數字 id／庫內雜訊／空輸入／精確比對／原型鍵名), 全測
//  刻意不測: 庫內同 id 重複列(庫內主鍵唯一); hasKey 非陣列(呼叫端恆給 markHasKey 之結果); isKeepable 非函數或拋例外(呼叫端為站點內固定之 predicate); 真後端同步行為(API 層).
//  未測: 無.
//跑法: npx mocha test/unit-syncKeep.test.mjs --reporter list --timeout 30000
import assert from 'assert'
import path from 'path'
import { fileURLToPath } from 'url'
import { markHasKey, keepAssignOnMissing, countIdRenumber } from '../server/syncKeep.mjs'
import validateRowsBeforeWrite from '../server/validateRows.mjs'
import { deepFreeze } from './tools/unitExt.mjs'
import { sourceLines } from './tools/srcScan.mjs'


const projRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const cells = { MH: 0, KA: 0, CR: 0, R3: 0, R4: 0 }

//庫內同一 from 之 users(保留指派之來源)
let oldUsers = () => [
    { id: 'u1', name: 'peter', email: 'peter@x.test', cgrups: '{"G1":1}' },
    { id: 'u2', name: 'mary', email: 'mary@x.test', cgrups: '{"G2":1}' },
    { id: 'u3', name: 'john', email: 'dup@x.test', cgrups: 'A' },
    { id: 'u4', name: 'jane', email: 'dup@x.test', cgrups: 'B' },
    { id: 'u5', name: 'nokey', email: 'nokey@x.test' }, //庫內無 cgrups 欄位
]
let keep = (rows, o = {}) => keepAssignOnMissing({ rows, hasKey: rows.map(() => false), rowsOldSameFrom: oldUsers(), ...o })


describe('unit-syncKeep (外部同步保留指派欄與 id 重編偵測, F-23)', function() {

    // =====================================================================
    // markHasKey
    // =====================================================================
    describe('markHasKey(SK-S1)', function() {

        it('SK-001 鍵狀態: 自有有值／自有 undefined 值／自有 null／缺／繼承 → 依序 true／true／true／false／false', function() {
            cells.MH += 5
            let inherited = Object.create({ cgrups: 'from-proto' })
            let rows = [{ cgrups: 'x' }, { cgrups: undefined }, { cgrups: null }, { id: '1' }, inherited]
            assert.strict.deepEqual(markHasKey(rows, 'cgrups'), [true, true, true, false, false])
        })

        it('SK-002 元素非物件(null／undefined／字串／數字／陣列)→ false, 不拋例外', function() {
            cells.MH += 5
            assert.strict.deepEqual(markHasKey([null, undefined, 'cgrups', 5, []], 'cgrups'), [false, false, false, false, false])
        })

        it('SK-003 物件自有 hasOwnProperty 屬性(遮蔽原型方法)與無原型物件亦正確判斷', function() {
            cells.MH += 2
            let shadow = { hasOwnProperty: 1, cgrups: 'x' }
            let bare = Object.create(null)
            bare.cgrups = 'x'
            let bare2 = Object.create(null)
            assert.strict.deepEqual(markHasKey([shadow, bare, bare2], 'cgrups'), [true, true, false])
        })

        it('SK-004 結果與輸入同長同序; 空陣列 → 空陣列; 鍵名依參數(同一列對不同鍵名各自判斷)', function() {
            cells.MH += 3
            let rows = [{ a: 1 }, { b: 2 }, { a: 1, b: 2 }]
            assert.strict.deepEqual(markHasKey(rows, 'a'), [true, false, true])
            assert.strict.deepEqual(markHasKey(rows, 'b'), [false, true, true])
            assert.strict.deepEqual(markHasKey([], 'a'), [])
        })

        it('SK-005 不改輸入(凍結之列)', function() {
            cells.MH++
            markHasKey(deepFreeze([{ cgrups: 'x' }, { id: 'y' }]), 'cgrups')
        })

    })


    // =====================================================================
    // keepAssignOnMissing
    // =====================================================================
    describe('keepAssignOnMissing(SK-S1、SK-S2、SK-S3)', function() {

        //--- mappingBy = id(預設) ---
        it('SK-010 [id] 缺鍵且 id 命中庫內 → 取庫內 cgrups, 其餘欄位維持 payload(外部為準), nKeep=1', function() {
            cells.KA++
            let { rows, nKeep } = keep([{ id: 'u1', name: 'renamed-by-external', email: 'new@x.test' }])
            assert.strict.deepEqual(rows, [{ id: 'u1', name: 'renamed-by-external', email: 'new@x.test', cgrups: '{"G1":1}' }])
            assert.strict.equal(nKeep, 1)
        })

        it('SK-011 [id] 含鍵者不動(以外部為準): 值為字串／空字串／undefined／null 皆維持, nKeep=0', function() {
            cells.KA++
            let rowsIn = [{ id: 'u1', cgrups: 'EXTERNAL' }, { id: 'u2', cgrups: '' }, { id: 'u3', cgrups: undefined }, { id: 'u4', cgrups: null }]
            let { rows, nKeep } = keepAssignOnMissing({ rows: rowsIn, hasKey: [true, true, true, true], rowsOldSameFrom: oldUsers() })
            assert.strict.deepEqual(rows, rowsIn)
            assert.strict.equal(nKeep, 0)
        })

        it('SK-012 [id] 缺鍵但 id 不在庫內(新使用者)→ 不動, 不保留, nKeep=0', function() {
            cells.KA++
            let { rows, nKeep } = keep([{ id: 'zz', name: 'peter', email: 'peter@x.test' }])
            assert.strict.deepEqual(rows, [{ id: 'zz', name: 'peter', email: 'peter@x.test' }])
            assert.strict.equal(nKeep, 0)
        })

        it('SK-013 [id] 缺鍵、庫內命中之列本身無 cgrups 欄位 → 不動, nKeep=0(庫內無該欄位不動)', function() {
            cells.KA++
            let { rows, nKeep } = keep([{ id: 'u5', name: 'nokey' }])
            assert.strict.deepEqual(rows, [{ id: 'u5', name: 'nokey' }])
            assert.strict.equal('cgrups' in rows[0], false)
            assert.strict.equal(nKeep, 0)
        })

        it('SK-014 [id] 無 id 之列不保留(即使 email／name 恰命中庫內一筆)', function() {
            cells.KA += 2
            let { rows, nKeep } = keep([{ name: 'peter', email: 'peter@x.test' }])
            assert.strict.deepEqual(rows, [{ name: 'peter', email: 'peter@x.test' }])
            assert.strict.equal(nKeep, 0)
            //mappingBy 省略與 'id' 同
            let r2 = keepAssignOnMissing({ rows: [{ email: 'peter@x.test' }], hasKey: [false], rowsOldSameFrom: oldUsers(), mappingBy: 'id' })
            assert.strict.equal(r2.nKeep, 0)
        })

        it('SK-015 mappingBy 為其他值(foo／大小寫不符 Email／null／數字)→ 視同不依欄位對應: 無 id 者不保留', function() {
            cells.KA += 4
            for (let mb of ['foo', 'Email', null, 5]) {
                let { rows, nKeep } = keepAssignOnMissing({ rows: [{ email: 'peter@x.test', name: 'peter' }], hasKey: [false], rowsOldSameFrom: oldUsers(), mappingBy: mb })
                assert.strict.equal(nKeep, 0, `mappingBy=${String(mb)}`)
                assert.strict.deepEqual(rows, [{ email: 'peter@x.test', name: 'peter' }])
            }
        })

        //--- id 型別 ---
        it('SK-016 id 為有限數字 → 取字串形式對應庫內(1 → "1")並保留; 負數與小數同', function() {
            cells.KA += 3
            let old = [{ id: '1', cgrups: 'ONE' }, { id: '-2', cgrups: 'NEG' }, { id: '1.5', cgrups: 'DEC' }]
            let { rows, nKeep } = keepAssignOnMissing({ rows: [{ id: 1 }, { id: -2 }, { id: 1.5 }], hasKey: [false, false, false], rowsOldSameFrom: old })
            assert.strict.deepEqual(rows.map((r) => r.cgrups), ['ONE', 'NEG', 'DEC'])
            assert.strict.equal(nKeep, 3)
        })

        it('SK-017 id 為 NaN／Infinity／空字串／null／布林／物件(非有效 id)→ 視為無 id: mappingBy=email 時改依 email 對應, mappingBy=id 時不保留', function() {
            cells.KA += 6
            for (let badId of [NaN, Infinity, '', null, true, {}]) {
                let r1 = keepAssignOnMissing({ rows: [{ id: badId, email: 'peter@x.test' }], hasKey: [false], rowsOldSameFrom: oldUsers(), mappingBy: 'email' })
                assert.strict.equal(r1.rows[0].cgrups, '{"G1":1}', `id=${String(badId)} 依 email 對應`)
                assert.strict.equal(r1.nKeep, 1)
                let r2 = keepAssignOnMissing({ rows: [{ id: badId, email: 'peter@x.test' }], hasKey: [false], rowsOldSameFrom: oldUsers(), mappingBy: 'id' })
                assert.strict.equal(r2.nKeep, 0, `id=${String(badId)} mappingBy=id 不保留`)
                assert.strict.equal('cgrups' in r2.rows[0], false)
            }
        })

        //--- mappingBy = email / name ---
        it('SK-020 [email] 無 id、email 恰命中庫內一筆 → 保留; [name] 無 id、name 恰命中一筆 → 保留', function() {
            cells.KA += 2
            let a = keep([{ email: 'mary@x.test' }], { mappingBy: 'email' })
            assert.strict.equal(a.rows[0].cgrups, '{"G2":1}')
            assert.strict.equal(a.nKeep, 1)
            let b = keep([{ name: 'mary' }], { mappingBy: 'name' })
            assert.strict.equal(b.rows[0].cgrups, '{"G2":1}')
            assert.strict.equal(b.nKeep, 1)
        })

        it('SK-021 [email] 無 id、email 命中庫內多筆(dup@x.test ×2)→ 不取首筆, 不保留; [name] 同', function() {
            cells.KA += 2
            let old = [...oldUsers(), { id: 'u6', name: 'mary', email: 'm6@x.test', cgrups: 'M6' }] //name mary 兩筆
            let a = keepAssignOnMissing({ rows: [{ email: 'dup@x.test' }], hasKey: [false], rowsOldSameFrom: old, mappingBy: 'email' })
            assert.strict.deepEqual(a.rows, [{ email: 'dup@x.test' }])
            assert.strict.equal(a.nKeep, 0)
            let b = keepAssignOnMissing({ rows: [{ name: 'mary' }], hasKey: [false], rowsOldSameFrom: old, mappingBy: 'name' })
            assert.strict.deepEqual(b.rows, [{ name: 'mary' }])
            assert.strict.equal(b.nKeep, 0)
        })

        it('SK-022 [email／name] 無 id、對不到任何庫內列 → 不保留', function() {
            cells.KA += 2
            let a = keep([{ email: 'nobody@x.test' }], { mappingBy: 'email' })
            assert.strict.equal(a.nKeep, 0)
            let b = keep([{ name: 'nobody' }], { mappingBy: 'name' })
            assert.strict.equal(b.nKeep, 0)
        })

        it('SK-023 [email／name] 對應欄位為空字串、缺、非字串 → 不對應(即使庫內恰有一筆空值)', function() {
            cells.KA += 6
            let old = [{ id: 'e1', name: '', email: '', cgrups: 'EMPTY' }]
            for (let mb of ['email', 'name']) {
                for (let v of ['', undefined, 5]) {
                    let row = v === undefined ? {} : { [mb]: v }
                    let { nKeep } = keepAssignOnMissing({ rows: [row], hasKey: [false], rowsOldSameFrom: old, mappingBy: mb })
                    assert.strict.equal(nKeep, 0, `${mb}=${String(v)}`)
                }
            }
        })

        it('SK-024 有 id 者只依 id 對應: id 不在庫內時不改以 email 對應(新使用者不承接他人指派)', function() {
            cells.KA++
            let { rows, nKeep } = keep([{ id: 'brand-new', email: 'peter@x.test' }], { mappingBy: 'email' })
            assert.strict.deepEqual(rows, [{ id: 'brand-new', email: 'peter@x.test' }])
            assert.strict.equal(nKeep, 0)
        })

        //SK-025: run07 外審 sol R3 改寫. 原期望「id 與 email 各指不同庫內列時以 id 為準」(靜默擇 id, 把 u1 之指派移轉給以 mary@ 登入者)為舊規格, 與 SK-S2(R3 修訂)矛盾:
        //id 指向 u1(peter)、對應鍵 email 卻是 u2 之 mary@x.test → 同來源 id 重用／重編之矛盾, 一律不保留, 且不改以 email 取 u2 之指派(不靜默擇一)
        it('SK-025 [email] id 與 email 各指不同庫內列(id→u1、email 屬 u2)→ 矛盾, 不保留(不取 u1 亦不取 u2 之指派), nKeep=0, nSkip=0(R3)', function() {
            cells.KA++
            let { rows, nKeep, nSkip } = keep([{ id: 'u1', email: 'mary@x.test' }], { mappingBy: 'email' })
            assert.strict.deepEqual(rows, [{ id: 'u1', email: 'mary@x.test' }])
            assert.strict.equal('cgrups' in rows[0], false, '不得帶入 u1 之 {"G1":1} 或 u2 之 {"G2":1}')
            assert.strict.equal(nKeep, 0)
            assert.strict.equal(nSkip, 0, '矛盾列不是「isKeepable 為假」, 不計 nSkip')
        })

        //--- run07 外審 sol R3: id 與登入對應鍵(mappingBy)矛盾 → 不保留(SK-S2) ---
        it('SK-025b [name] id 與 name 各指不同庫內列(id→u1 peter、name 為 u2 之 mary)→ 矛盾, 不保留, nKeep=0(R3 之 name 同型)', function() {
            cells.R3++
            let { rows, nKeep } = keep([{ id: 'u1', name: 'mary' }], { mappingBy: 'name' })
            assert.strict.deepEqual(rows, [{ id: 'u1', name: 'mary' }])
            assert.strict.equal(nKeep, 0)
        })

        it('SK-026 [email／name] id 對到之舊列其對應鍵值與本批列相同 → 保留(正常路徑); 對應鍵以外欄位(name／email)被外部改動不影響', function() {
            cells.R3 += 2
            let a = keep([{ id: 'u1', email: 'peter@x.test', name: 'renamed' }], { mappingBy: 'email' })
            assert.strict.deepEqual(a.rows, [{ id: 'u1', email: 'peter@x.test', name: 'renamed', cgrups: '{"G1":1}' }])
            assert.strict.equal(a.nKeep, 1)
            let b = keep([{ id: 'u2', name: 'mary', email: 'changed@x.test' }], { mappingBy: 'name' })
            assert.strict.deepEqual(b.rows, [{ id: 'u2', name: 'mary', email: 'changed@x.test', cgrups: '{"G2":1}' }])
            assert.strict.equal(b.nKeep, 1)
        })

        it('SK-027 [email／name] 同 id 而對應鍵被外部改動(peter@x.test → new@x.test; peter → renamed)→ 不保留(收嚴: 無法證明仍是同一人, 即使無第二人涉入)', function() {
            cells.R3 += 2
            let a = keep([{ id: 'u1', email: 'new@x.test' }], { mappingBy: 'email' })
            assert.strict.deepEqual(a.rows, [{ id: 'u1', email: 'new@x.test' }])
            assert.strict.equal(a.nKeep, 0)
            let b = keep([{ id: 'u1', name: 'renamed' }], { mappingBy: 'name' })
            assert.strict.deepEqual(b.rows, [{ id: 'u1', name: 'renamed' }])
            assert.strict.equal(b.nKeep, 0)
        })

        it('SK-028 [email] 對應鍵缺欄與空字串視為相同("" ≡ 缺), 一缺一有則矛盾不保留: 舊缺／舊空字串/舊有值 × 本批缺／空字串／有值 之 5 格', function() {
            cells.R3 += 5
            let old = [{ id: 'x1', cgrups: 'A' }, { id: 'x2', email: '', cgrups: 'B' }, { id: 'x3', email: 'e3@x.test', cgrups: 'C' }]
            let k = (row) => keepAssignOnMissing({ rows: [row], hasKey: [false], rowsOldSameFrom: old, mappingBy: 'email' })
            assert.strict.equal(k({ id: 'x1' }).rows[0].cgrups, 'A', '舊缺欄、本批缺欄 → 皆 "" → 保留')
            assert.strict.equal(k({ id: 'x1', email: '' }).rows[0].cgrups, 'A', '舊缺欄、本批 "" → 保留')
            assert.strict.equal(k({ id: 'x2' }).rows[0].cgrups, 'B', '舊 ""、本批缺欄 → 保留')
            assert.strict.equal(k({ id: 'x3' }).nKeep, 0, '舊有 e3@x.test、本批缺欄(對應鍵消失)→ 矛盾, 不保留')
            assert.strict.equal(k({ id: 'x1', email: 'new@x.test' }).nKeep, 0, '舊缺欄、本批有值 → 矛盾, 不保留')
        })

        it('SK-029 mappingBy 為 id(預設／明給)或其他值(foo／null)時只依 id: 即使 email／name 與舊列相異仍保留(R3 只約束 email／name 之對應)', function() {
            cells.R3 += 3
            for (let mb of ['id', 'foo', null]) {
                let { rows, nKeep } = keepAssignOnMissing({ rows: [{ id: 'u1', email: 'mary@x.test', name: 'mary' }], hasKey: [false], rowsOldSameFrom: oldUsers(), mappingBy: mb })
                assert.strict.equal(rows[0].cgrups, '{"G1":1}', `mappingBy=${String(mb)}`)
                assert.strict.equal(nKeep, 1)
            }
        })

        it('SK-036 id 與對應鍵互換之同批兩列(u1 配 mary@、u2 配 peter@; name 同型)→ 兩列皆不保留(互換不得使雙方承接對方之指派)', function() {
            cells.R3 += 2
            let a = keep([{ id: 'u1', email: 'mary@x.test' }, { id: 'u2', email: 'peter@x.test' }], { mappingBy: 'email' })
            assert.strict.deepEqual(a.rows, [{ id: 'u1', email: 'mary@x.test' }, { id: 'u2', email: 'peter@x.test' }])
            assert.strict.equal(a.nKeep, 0)
            let b = keep([{ id: 'u1', name: 'mary' }, { id: 'u2', name: 'peter' }], { mappingBy: 'name' })
            assert.strict.deepEqual(b.rows, [{ id: 'u1', name: 'mary' }, { id: 'u2', name: 'peter' }])
            assert.strict.equal(b.nKeep, 0)
        })

        it('SK-037 矛盾列只影響自己: 同批 [u1 對應鍵被改(不保留)、u2 正常(保留 G2)、u3 與 u4 同為共用 email dup@x.test 之列(增量外審 N1: 庫內另有別列持有同值＝舊登入擁有者不明, 兩列皆不保留)] → nKeep=1, nConflict=3, 次序不變', function() {
            cells.R3++
            let rowsIn = [{ id: 'u1', email: 'other@x.test' }, { id: 'u2', email: 'mary@x.test' }, { id: 'u3', email: 'dup@x.test' }, { id: 'u4', email: 'dup@x.test' }]
            let { rows, nKeep, nConflict } = keep(rowsIn, { mappingBy: 'email' })
            assert.strict.deepEqual(rows.map((r) => [r.id, r.cgrups]), [['u1', undefined], ['u2', '{"G2":1}'], ['u3', undefined], ['u4', undefined]])
            assert.strict.equal(nKeep, 1)
            assert.strict.equal(nConflict, 3)
        })

        //增量外審 N1／N2: 舊登入擁有者矛盾與提示計數
        it('SK-038 (N1) mappingBy=name: 庫內 A(停用, id a)與 B(啟用, id b)同名 Shared, 本批只送 {id:a, name:Shared} 缺 cgrups → 不保留 A 之指派(登入值 Shared 原屬 B), nConflict=1', function() {
            cells.R3++
            let old = [{ id: 'a', name: 'Shared', email: 'a@x.test', isActive: 'n', cgrups: 'SECRET' }, { id: 'b', name: 'Shared', email: 'b@x.test', isActive: 'y', cgrups: '{}' }]
            let rowsIn = [{ id: 'a', name: 'Shared', email: 'a@x.test', isActive: 'y' }]
            let out = keepAssignOnMissing({ rows: rowsIn, hasKey: [false], rowsOldSameFrom: old, mappingBy: 'name' })
            assert.strict.equal('cgrups' in out.rows[0], false)
            assert.strict.equal(out.nKeep, 0)
            assert.strict.equal(out.nConflict, 1)
            //email 同型
            let old2 = [{ id: 'a', name: 'A', email: 'same@x.test', isActive: 'n', cgrups: 'SECRET' }, { id: 'b', name: 'B', email: 'same@x.test', isActive: 'y', cgrups: '{}' }]
            let out2 = keepAssignOnMissing({ rows: [{ id: 'a', name: 'A', email: 'same@x.test', isActive: 'y' }], hasKey: [false], rowsOldSameFrom: old2, mappingBy: 'email' })
            assert.strict.equal(out2.nKeep, 0)
            assert.strict.equal(out2.nConflict, 1)
        })

        it('SK-039 (N1 對照) 庫內該對應鍵值只有本列自己持有 → 照常保留; 對應鍵為空字串者不受唯一性限制(登入不以空值查找); mappingBy=id 不受影響; nConflict=0', function() {
            cells.R3++
            let old = [{ id: 'a', name: 'A', email: 'a@x.test', cgrups: 'SECRET' }, { id: 'e1', name: 'E1', email: '', cgrups: 'X1' }, { id: 'e2', name: 'E2', email: '', cgrups: 'X2' }]
            let out = keepAssignOnMissing({ rows: [{ id: 'a', name: 'A', email: 'a@x.test' }, { id: 'e1', name: 'E1', email: '' }], hasKey: [false, false], rowsOldSameFrom: old, mappingBy: 'email' })
            assert.strict.deepEqual(out.rows.map((r) => r.cgrups), ['SECRET', 'X1'])
            assert.strict.equal(out.nKeep, 2)
            assert.strict.equal(out.nConflict, 0)
            let old3 = [{ id: 'a', name: 'Shared', cgrups: 'SECRET' }, { id: 'b', name: 'Shared', cgrups: '{}' }]
            let out3 = keepAssignOnMissing({ rows: [{ id: 'a', name: 'Shared' }], hasKey: [false], rowsOldSameFrom: old3, mappingBy: 'id' })
            assert.strict.equal(out3.rows[0].cgrups, 'SECRET')
            assert.strict.equal(out3.nConflict, 0)
        })

        it('SK-040 (N2) 同一 id 改 email 而缺 cgrups → 清空且 nConflict=1(供呼叫端記 warn mapKeyConflict, 收嚴須附提示); WWebPerm 於 nConflict>0 時記 syncAndReplaceTabs-keepAssign-skip(reason mapKeyConflict)', async function() {
            cells.R3++
            let out = keepAssignOnMissing({ rows: [{ id: 'a', email: 'new@x.test' }], hasKey: [false], rowsOldSameFrom: [{ id: 'a', email: 'old@x.test', cgrups: 'SECRET' }], mappingBy: 'email' })
            assert.strict.equal('cgrups' in out.rows[0], false)
            assert.strict.equal(out.nConflict, 1)
            let fs = await import('fs')
            let txt = fs.readFileSync(new URL('../server/WWebPerm.mjs', import.meta.url), 'utf8')
            assert.ok(/if \(kr\.nConflict > 0\) \{[\s\S]{0,200}syncAndReplaceTabs-keepAssign-skip[\s\S]{0,200}mapKeyConflict/.test(txt))
        })

        //--- 批次、次序、不改輸入 ---
        it('SK-030 混合批次: 次序保持、各列獨立判定、nKeep 為被保留之列數', function() {
            cells.KA++
            let hasKey = [false, true, false, false, false]
            let rowsIn = [{ id: 'u1' }, { id: 'u2', cgrups: 'EXT' }, { id: 'nope' }, { id: 'u5' }, { id: 'u4' }]
            let { rows, nKeep } = keepAssignOnMissing({ rows: rowsIn, hasKey, rowsOldSameFrom: oldUsers() })
            assert.strict.deepEqual(rows.map((r) => [r.id, r.cgrups]), [['u1', '{"G1":1}'], ['u2', 'EXT'], ['nope', undefined], ['u5', undefined], ['u4', 'B']])
            assert.strict.equal(nKeep, 2)
        })

        it('SK-031 不改輸入: 凍結之 rows／rowsOldSameFrom／hasKey 不拋錯; 回傳新陣列且被保留之列為新物件', function() {
            cells.KA++
            let rowsIn = deepFreeze([{ id: 'u1', name: 'x' }])
            let out = keepAssignOnMissing({ rows: rowsIn, hasKey: deepFreeze([false]), rowsOldSameFrom: deepFreeze(oldUsers()) })
            assert.strict.notEqual(out.rows, rowsIn)
            assert.strict.notEqual(out.rows[0], rowsIn[0])
            assert.strict.equal('cgrups' in rowsIn[0], false, '輸入列未被補鍵')
        })

        it('SK-032 非物件元素(null／字串／數字)原樣保留且不計; 庫內列含非物件亦忽略, 不拋例外', function() {
            cells.KA += 2
            let old = [null, 'x', 5, ...oldUsers()]
            let rowsIn = [null, 'str', 7, { id: 'u1' }]
            let { rows, nKeep } = keepAssignOnMissing({ rows: rowsIn, hasKey: [false, false, false, false], rowsOldSameFrom: old })
            assert.strict.deepEqual(rows, [null, 'str', 7, { id: 'u1', cgrups: '{"G1":1}' }])
            assert.strict.equal(nKeep, 1)
        })

        it('SK-033 自訂指派欄 key(grups 之 cpemis)同規則; 其他欄位不被帶入', function() {
            cells.KA += 2
            let old = [{ id: 'g1', name: 'G', cpemis: '{"P":1}', cgrups: 'WRONG' }]
            let { rows, nKeep } = keepAssignOnMissing({ rows: [{ id: 'g1' }, { id: 'g1', cpemis: 'X' }], hasKey: [false, true], rowsOldSameFrom: old, key: 'cpemis' })
            assert.strict.deepEqual(rows, [{ id: 'g1', cpemis: '{"P":1}' }, { id: 'g1', cpemis: 'X' }])
            assert.strict.equal(nKeep, 1)
        })

        it('SK-034 純函數預設 isKeepable 恆可: 庫內值原樣帶入(空字串、null、物件、陣列皆保留其值; 只要庫內有該自有欄位; 站點實際傳入 isKeepable 後物件／陣列不保留, 見 SK-076)', function() {
            cells.KA += 4
            let old = [{ id: 'a', cgrups: '' }, { id: 'b', cgrups: null }, { id: 'c', cgrups: { k: 1 } }, { id: 'd', cgrups: [1, 2] }]
            let { rows, nKeep } = keepAssignOnMissing({ rows: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }], hasKey: [false, false, false, false], rowsOldSameFrom: old })
            assert.strict.deepEqual(rows.map((r) => r.cgrups), ['', null, { k: 1 }, [1, 2]])
            assert.strict.equal(nKeep, 4)
        })

        it('SK-035 hasKey 缺項(較 rows 短)或非 true 值 → 視為「缺鍵」而保留(只有嚴格 true 才視為含鍵)', function() {
            cells.KA += 2
            let a = keepAssignOnMissing({ rows: [{ id: 'u1' }, { id: 'u2' }], hasKey: [], rowsOldSameFrom: oldUsers() })
            assert.strict.equal(a.nKeep, 2)
            let b = keepAssignOnMissing({ rows: [{ id: 'u1' }], hasKey: [1], rowsOldSameFrom: oldUsers() })
            assert.strict.equal(b.nKeep, 1)
        })

        //--- 原型鍵名(SK-S5) ---
        it('SK-040 id 為原型鍵名(__proto__／constructor／toString／hasOwnProperty／valueOf／__defineGetter__)且庫內無對應 → 不保留、不拋例外、不污染原型', function() {
            cells.KA += 6
            for (let pid of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf', '__defineGetter__']) {
                let { rows, nKeep } = keep([{ id: pid }])
                assert.strict.equal(nKeep, 0, pid)
                assert.strict.equal(rows[0].id, pid)
                assert.strict.equal('cgrups' in rows[0], false, pid)
            }
            assert.strict.equal(Object.prototype.cgrups, undefined, '未污染 Object.prototype')
        })

        it('SK-041 庫內有 id 為原型鍵名之列 → 與一般 id 同樣對應並保留', function() {
            cells.KA += 3
            let old = [{ id: '__proto__', cgrups: 'P' }, { id: 'constructor', cgrups: 'C' }, { id: 'toString', cgrups: 'T' }]
            let { rows, nKeep } = keepAssignOnMissing({ rows: [{ id: '__proto__' }, { id: 'constructor' }, { id: 'toString' }], hasKey: [false, false, false], rowsOldSameFrom: old })
            assert.strict.deepEqual(rows.map((r) => r.cgrups), ['P', 'C', 'T'])
            assert.strict.equal(nKeep, 3)
            assert.strict.equal(Object.prototype.cgrups, undefined)
        })

        it('SK-042 email／name 為原型鍵名: 庫內有同名之一筆 → 對應保留; 無 → 不保留且不拋例外', function() {
            cells.KA += 2
            let old = [{ id: 'x', email: '__proto__', name: 'constructor', cgrups: 'HIT' }]
            let a = keepAssignOnMissing({ rows: [{ email: '__proto__' }, { email: 'constructor' }], hasKey: [false, false], rowsOldSameFrom: old, mappingBy: 'email' })
            assert.strict.deepEqual(a.rows.map((r) => r.cgrups), ['HIT', undefined])
            assert.strict.equal(a.nKeep, 1)
            let b = keepAssignOnMissing({ rows: [{ name: 'constructor' }, { name: 'toString' }], hasKey: [false, false], rowsOldSameFrom: old, mappingBy: 'name' })
            assert.strict.deepEqual(b.rows.map((r) => r.cgrups), ['HIT', undefined])
            assert.strict.equal(b.nKeep, 1)
        })

    })


    // =====================================================================
    // keepAssignOnMissing 之 isKeepable(run07 外審 sol R4; SK-S6)
    // =====================================================================
    describe('keepAssignOnMissing isKeepable(SK-S6)', function() {

        let spy = (pred) => {
            let calls = []
            let fn = (v) => {
                calls.push(v)
                return pred(v)
            }
            return { fn, calls }
        }

        it('SK-070 未傳 isKeepable → 恆可: 回傳鍵集合恰為 rows／nKeep／nSkip, nSkip=0; 含標記字串與物件之庫內值亦保留(把關由呼叫端傳入之 isKeepable 負責)', function() {
            cells.R4++
            let old = [{ id: 'a', cgrups: '{"x<script>":1}' }, { id: 'b', cgrups: { k: 1 } }]
            let out = keepAssignOnMissing({ rows: [{ id: 'a' }, { id: 'b' }], hasKey: [false, false], rowsOldSameFrom: old })
            assert.strict.deepEqual(Object.keys(out).sort(), ['nConflict', 'nKeep', 'nSkip', 'rows'])
            assert.strict.equal(out.nKeep, 2)
            assert.strict.equal(out.nSkip, 0)
        })

        it('SK-071 isKeepable 為假 → 該列不保留: 列原樣(同一參考、不補鍵), 計入 nSkip 而不計 nKeep', function() {
            cells.R4++
            let rowsIn = [{ id: 'u1', name: 'x' }]
            let { rows, nKeep, nSkip } = keepAssignOnMissing({ rows: rowsIn, hasKey: [false], rowsOldSameFrom: oldUsers(), isKeepable: () => false })
            assert.strict.equal(rows[0], rowsIn[0], '未保留之列為同一參考')
            assert.strict.equal('cgrups' in rows[0], false)
            assert.strict.equal(nKeep, 0)
            assert.strict.equal(nSkip, 1)
        })

        it('SK-072 isKeepable 只對「已對應到庫內列、庫內有該欄位、本批缺鍵」之值呼叫, 且收到庫內值(依 rows 次序各一次): 含鍵／對不到／庫內無欄位者不呼叫', function() {
            cells.R4++
            let s = spy(() => true)
            let rowsIn = [{ id: 'u1' }, { id: 'u2', cgrups: 'EXT' }, { id: 'zz' }, { id: 'u5' }, { id: 'u4' }]
            let { nKeep, nSkip } = keepAssignOnMissing({ rows: rowsIn, hasKey: [false, true, false, false, false], rowsOldSameFrom: oldUsers(), isKeepable: s.fn })
            assert.strict.deepEqual(s.calls, ['{"G1":1}', 'B'])
            assert.strict.equal(nKeep, 2)
            assert.strict.equal(nSkip, 0)
        })

        it('SK-073 混批: 對庫內值 "B" 為假 → u1 保留、u4 不保留(nKeep=1, nSkip=1), 次序不變, 不保留者無 cgrups 鍵', function() {
            cells.R4++
            let { rows, nKeep, nSkip } = keepAssignOnMissing({ rows: [{ id: 'u1' }, { id: 'u4' }, { id: 'u2' }], hasKey: [false, false, false], rowsOldSameFrom: oldUsers(), isKeepable: (v) => v !== 'B' })
            assert.strict.deepEqual(rows.map((r) => [r.id, r.cgrups]), [['u1', '{"G1":1}'], ['u4', undefined], ['u2', '{"G2":1}']])
            assert.strict.equal('cgrups' in rows[1], false)
            assert.strict.equal(nKeep, 2)
            assert.strict.equal(nSkip, 1)
        })

        it('SK-074 不改輸入: isKeepable 為真／為假兩種情況下, 凍結之 rows／rowsOldSameFrom／hasKey 皆不拋錯', function() {
            cells.R4++
            for (let pred of [() => true, () => false]) {
                keepAssignOnMissing({ rows: deepFreeze([{ id: 'u1' }, { id: 'u4' }]), hasKey: deepFreeze([false, false]), rowsOldSameFrom: deepFreeze(oldUsers()), isKeepable: pred })
            }
        })

        it('SK-075 與 R3 之互動: 因對應鍵矛盾而不保留之列不呼叫 isKeepable、不計 nSkip(nSkip 只計「可對應而驗證不過」者)', function() {
            cells.R4++
            let s = spy(() => false)
            let { nKeep, nSkip } = keepAssignOnMissing({ rows: [{ id: 'u1', email: 'mary@x.test' }], hasKey: [false], rowsOldSameFrom: oldUsers(), mappingBy: 'email', isKeepable: s.fn })
            assert.strict.deepEqual(s.calls, [])
            assert.strict.equal(nKeep, 0)
            assert.strict.equal(nSkip, 0)
        })

        //以站點同式之 predicate 接真 validateRowsBeforeWrite(與 WWebPerm.mjs:syncAndReplaceTabs 傳入者同一式, 站點同式由 SITE-SK-001 靜態斷言): 期望由 SK-S6 推導——
        //「保留值須能原樣通過寫入前驗證」= 不含會被 clearXSS 改寫之標記、為純量(字串／數字／布林／null)
        it('SK-076 以站點同式 predicate(validateRowsBeforeWrite)接真驗證: 乾淨 JSON 字串／空字串／null／數字保留; 含 <script> 之名稱／HTML 標記字串／物件／陣列不保留(8 種庫內值)', function() {
            let isKeepable = (val) => validateRowsBeforeWrite([{ id: 'keep', cgrups: val }]) === null
            let CASES = [
                ['乾淨 JSON 字串', '{"G1":{"mode":"OR","isActive":"y"}}', true],
                ['空字串', '', true],
                ['null', null, true],
                ['數字 12', 12, true],
                ['JSON 字串之名稱含 <script>(會被 clearXSS 改成 &lt;script>, 改指他名而增權)', '{"Secret<script>":{"mode":"AND","isActive":"y"}}', false],
                ['HTML 標記字串', '<img src=x onerror=1>', false],
                ['物件(非純量)', { k: 1 }, false],
                ['陣列(非純量)', [1, 2], false],
            ]
            let exp = { nKeep: 0, nSkip: 0 }
            for (let [title, val, ok] of CASES) {
                cells.R4++
                let { rows, nKeep, nSkip } = keepAssignOnMissing({ rows: [{ id: 'k1' }], hasKey: [false], rowsOldSameFrom: [{ id: 'k1', cgrups: val }], isKeepable })
                if (ok) {
                    assert.strict.deepEqual(rows[0].cgrups, val, title)
                    assert.strict.deepEqual([nKeep, nSkip], [1, 0], title)
                    exp.nKeep++
                }
                else {
                    assert.strict.equal('cgrups' in rows[0], false, `${title}: 不得帶入`)
                    assert.strict.deepEqual([nKeep, nSkip], [0, 1], title)
                    exp.nSkip++
                }
            }
            assert.strict.deepEqual(exp, { nKeep: 4, nSkip: 4 }, '夾具確含保留與不保留各半, 非空洞')
        })

        //站點靜態斷言(整合層; 真後端行為由 API 層另測): WWebPerm.mjs:syncAndReplaceTabs 傳入之 isKeepable 使用 validateRowsBeforeWrite, 位於 delAll 之前; 不保留者記 warn(不含值)
        describe('站點(靜態)', function() {

            let code = () => sourceLines(path.join(projRoot, 'server/WWebPerm.mjs'), 'code').map((l) => l.text).join('\n')

            it('SITE-SK-001 syncAndReplaceTabs 呼叫 keepAssignOnMissing 時傳入 isKeepable, 其以 validateRowsBeforeWrite([{ id: \'keep\', cgrups: val }]) === null 判定; 呼叫位於 delAll 之前(保留值於破壞性寫入前驗證)', function() {
                let c = code()
                assert.strict.ok(/import validateRowsBeforeWrite from '\.\/validateRows\.mjs'/.test(c), '須匯入 validateRowsBeforeWrite')
                let m = /keepAssignOnMissing\(\{([^\n]*)\}\)/.exec(c)
                assert.strict.ok(m, '找不到 keepAssignOnMissing({...}) 呼叫')
                assert.strict.ok(m[1].includes(`isKeepable: (val) => validateRowsBeforeWrite([{ id: 'keep', cgrups: val }]) === null`), `isKeepable 須以 validateRowsBeforeWrite 判定: ${m[1]}`)
                assert.strict.ok(m[1].includes('mappingBy'), '須傳入 mappingBy(R3 需要)')
                let iKeep = c.indexOf('keepAssignOnMissing({')
                let iDelAll = c.indexOf('.delAll({ from })')
                assert.strict.ok(iKeep > 0 && iDelAll > 0 && iKeep < iDelAll, 'keepAssignOnMissing 須位於 delAll 之前')
                assert.strict.ok(/rows = kr\.rows/.test(c), '保留結果須回寫 rows(之後才驗證／寫入)')
            })

            it('SITE-SK-002 nSkip>0 記 warn 事件 syncAndReplaceTabs-keepAssign-skip, 只帶表名／來源／欄位／筆數／原因(不含值); nKeep>0 之 info 事件仍在', function() {
                let c = code()
                assert.strict.ok(/if \(kr\.nSkip > 0\) \{\s*srLog\.warn\(\{ event: 'syncAndReplaceTabs-keepAssign-skip', keyTable, from, field: 'cgrups', n: kr\.nSkip, reason: 'notKeepable' \}\)\s*\}/.test(c), 'warn 事件之條件與欄位')
                assert.strict.ok(/if \(kr\.nKeep > 0\) \{\s*srLog\.info\(\{ event: 'syncAndReplaceTabs-keepAssign', keyTable, from, field: 'cgrups', n: kr\.nKeep \}\)\s*\}/.test(c), 'info 事件仍在')
            })

        })

    })


    // =====================================================================
    // countIdRenumber
    // =====================================================================
    describe('countIdRenumber(SK-S4)', function() {

        let g = (id, name) => ({ id, name })

        it('SK-050 同名異 id(舊 id 不在本批)→ 計入(1)', function() {
            cells.CR++
            assert.strict.equal(countIdRenumber([g('a', 'N')], [g('b', 'N')]), 1)
        })

        it('SK-051 同名同 id → 不計(0)', function() {
            cells.CR++
            assert.strict.equal(countIdRenumber([g('a', 'N')], [g('a', 'N')]), 0)
        })

        it('SK-052 舊 id 仍在本批(改名而非重編)→ 不計(0)', function() {
            cells.CR++
            assert.strict.equal(countIdRenumber([g('a', 'N')], [g('a', 'M'), g('b', 'N')]), 0)
        })

        it('SK-053 本批列無 id(缺、空字串、NaN、null、布林、物件)→ 不計', function() {
            cells.CR++
            let rows = [{ name: 'N' }, { id: '', name: 'N' }, { id: NaN, name: 'N' }, { id: null, name: 'N' }, { id: true, name: 'N' }, { id: {}, name: 'N' }]
            assert.strict.equal(countIdRenumber([g('a', 'N')], rows), 0)
        })

        it('SK-054 非物件元素(null／字串／數字)於本批與庫內皆不拋例外且不計; 非字串名稱不計', function() {
            cells.CR++
            let old = [null, 'x', 5, g('a', 'N'), g(5, 'N'), g('c', 5)]
            let rows = [null, 'x', 5, g('b', 'N'), g('d', 5)]
            assert.strict.equal(countIdRenumber(old, rows), 1)
        })

        it('SK-055 部分重編: 庫內 {a:A, b:B}、本批 {a:A, y:B} → 1(A 同 id 不計, B 異 id 計 1); 全重編 {x:A, y:B} → 2', function() {
            cells.CR++
            assert.strict.equal(countIdRenumber([g('a', 'A'), g('b', 'B')], [g('a', 'A'), g('y', 'B')]), 1)
            assert.strict.equal(countIdRenumber([g('a', 'A'), g('b', 'B')], [g('x', 'A'), g('y', 'B')]), 2)
        })

        it('SK-056 純改名(新名稱無庫內同名)→ 不計(0)', function() {
            cells.CR++
            assert.strict.equal(countIdRenumber([g('a', 'A')], [g('b', 'C')]), 0)
        })

        it('SK-057 id 為有限數字取字串形式: 本批 id 7 對庫內 "7" 同名 → 同 id 不計(0); 對庫內 "6" 同名 → 計(1)', function() {
            cells.CR++
            assert.strict.equal(countIdRenumber([g('7', 'N')], [{ id: 7, name: 'N' }]), 0)
            assert.strict.equal(countIdRenumber([g('6', 'N')], [{ id: 7, name: 'N' }]), 1)
        })

        it('SK-058 空輸入: 庫內空、本批空、兩者皆空 → 0', function() {
            cells.CR++
            assert.strict.equal(countIdRenumber([], [g('a', 'N')]), 0)
            assert.strict.equal(countIdRenumber([g('a', 'N')], []), 0)
            assert.strict.equal(countIdRenumber([], []), 0)
        })

        it('SK-059 名稱精確 ===: 大小寫、前後空白不同不算同名(0)', function() {
            cells.CR++
            assert.strict.equal(countIdRenumber([g('a', 'N')], [g('b', 'n'), g('c', 'N '), g('d', ' N')]), 0)
        })

        it('SK-060 名稱為原型鍵名(__proto__／constructor)不出錯: 同名異 id 仍計入, 無對應者不計', function() {
            cells.CR++
            assert.strict.equal(countIdRenumber([g('a', '__proto__'), g('b', 'constructor')], [g('x', '__proto__'), g('y', 'toString')]), 1)
        })

        it('SK-061 筆數以本批列計: 庫內同名兩筆(皆不在本批)、本批一列同名異 id → 1; 不改輸入', function() {
            cells.CR++
            let old = deepFreeze([g('a', 'N'), g('b', 'N')])
            let rows = deepFreeze([g('c', 'N')])
            assert.strict.equal(countIdRenumber(old, rows), 1)
        })

    })


    //宣告格數核對
    describe('SK-CELLS 輸入空間格數核對', function() {

        it('SK-999 各函數實測格數 = 宣告', function() {
            if (process.argv.some((a) => a === '--grep' || a === '-g' || a.startsWith('--grep='))) {
                this.skip() //--grep 只跑部分案例時計數必不全, 不核對
            }
            assert.strict.deepEqual(cells, { MH: 16, KA: 56, CR: 12, R3: 19, R4: 14 })
        })

    })

})
