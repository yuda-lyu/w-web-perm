//外部同步缺指派欄鍵保留(grups.cpemis／pemis.crules)純函數單元測試(run08; 主控依 R-PRINCIPLE-00 原則 3、5 定案; 規則帳本 R-EXT-OWN-01; ADR-037 決定 11 之修訂)
//
//受測: server/syncKeep.mjs: keepAssignByEntity(grups 列缺 cpemis 鍵、pemis 列缺 crules 鍵者保留庫內同一 from 同一實體之值); 站點接線 server/syncCore.mjs:syncAndReplaceTabs(靜態斷言).
//
//規格句(期望由下列規則推導, 不抄實作):
//  KE-S1 三個指派欄(users.cgrups／grups.cpemis／pemis.crules)同為後台可寫(Lv1): 外部同步 payload 之列「缺該鍵」時保留庫內值, 「含該鍵」(含 ''／undefined／null)則以外部為準(原則 5);
//        每次同步清空等於靜默丟棄管理者之指派(原則 3). users 之行為不變(unit-syncKeep).
//  KE-S2 實體身分(群組／權限無登入對應鍵, 不適用 users 之 mappingBy 矛盾檢查): 有 id 者依 id 對到庫內同一 from 之列; id 不在庫內＝新實體, 維持缺鍵之預設('');
//        無 id 者(含 NaN／Infinity／''／null／布林／物件等無效 id; 寫入時 ORM 補隨機主鍵)依名稱, 與引用連帶(refCascade.fillIdlessIds)同一口徑:
//        對庫內同一 from 中 id 未被本批帶用、名稱 === 相同之列, 須恰 1 筆(同名多筆為歷史同名, 不取首筆, 不保留並計入 nConflict); 0 筆＝新實體(不計 nConflict).
//  KE-S3 收嚴(原則 3): 同 id 但名稱不同(改名)且 cascadeRename 為假(引用不跟著改, 名稱即授權身分)→ 不保留並計入 nConflict; cascadeRename 為 true／缺省 → 改名後保留(引用由級聯改寫, 同一實體);
//        名稱相同時不論 cascadeRename 皆保留. (外審 sol #1) 改名而新舊名稱有一方非字串(歷史資料)時級聯無從處理(須新舊皆字串, 缺欄視 ''), 保留會使原指向新名(懸空)之引用者增權 → 不保留並 nConflict(KE-016).
//  KE-S4 庫內該列無此欄位(自有屬性)時不保留; 保留值須通過 isKeepable(站點傳入與外部寫入同一套 validateRowsBeforeWrite), 為假者不保留並計入 nSkip(列原樣、不補鍵);
//        isKeepable 只對「已對應到庫內列、庫內有該欄位、本批缺鍵」之值呼叫(含鍵／對不到／矛盾者不呼叫).
//  KE-S5 回傳 { rows, nKeep, nSkip, nConflict }: rows 為新陣列(不改輸入; 被保留之列為複本, 其餘同一參考)、次序與輸入相同; 非物件元素原樣通過; hasKey 只有嚴格 true 才視為含鍵.
//  KE-S6 站點(server/syncCore.mjs〔perm-run03 自 WWebPerm.mjs 搬出〕): KEY_ASSIGN 對應 users→cgrups／grups→cpemis／pemis→crules(targets 無); isKeepable 以 validateRowsBeforeWrite([{ id: 'keep', [keyAssign]: val }]) 判定;
//        呼叫位於第一個 ORM 寫入之前; 記錄事件 field 為 keyAssign, nConflict 之 reason 恆為 'identityConflict'〔perm-run03: 身分依 srcKey 配對, keepAssignOnMissing 以 mappingBy 固定 'id' 呼叫, users 之 'mapKeyConflict' 不再發生〕(只記表名／來源／欄位／筆數／原因, 不含值).
//
//輸入空間表(軸 × 格數; 格數於檔尾 KE-999 以計數器核對):
//  keepAssignByEntity   指派欄鍵{cpemis(grups 列),crules(pemis 列)} 2 ＋ hasKey{true 之值 EXT／''／undefined／null 4; 非 true 之缺項／false／0／'true'／null 5} 9 ＋ id 軸{有限數字對到、id 不在庫內 2;
//                       無效 id NaN／Infinity／''／null／布林／物件改依名稱 6} 8 ＋ 庫內無該欄位{依 id,依名稱} 2 ＋ 依名稱對應{恰 1、0、≥2 不取首筆、對到之舊列 id 已被本批他列帶用、大小寫／空白精確比對} 5 ＋
//                       改名 cascadeRename{true,缺省,false} × 名稱{相同,不同} 6 ＋ isKeepable{預設,為假,只對候選呼叫} 3 ＋ 非物件元素／庫內雜訊 2 ＋ 混批 1 ＋ 不改輸入 1 ＋ 原型鍵名 2 ＋
//                       以站點同式 predicate 接真驗證 8 種庫內值 8 ＋ key 參數只讀指定欄 1 ＋ 改名而新舊名稱有一方非字串(歷史資料)4 不保留 + 3 保留 7 ＋ 外審 sol 挑戰表缺格(名稱互換 × cascadeRename 2、歷史同名 × 已帶用 id 1、crules × isKeepable 為假 1、含鍵 × 關閉改名 × 不可保留 1)5 = 62 格, 全測
//  站點(靜態)           SITE-KE-001／002 共 2 案(不計格)
//  刻意不測: 庫內同 id 重複列(庫內主鍵唯一); hasKey 非陣列(呼叫端恆給 markHasKey 之結果); isKeepable 非函數或拋例外(呼叫端為站點內固定之 predicate); 真後端同步行為(api-externalRows EX-021～021d).
//  未測: 無.
//跑法: npx mocha test/unit-syncKeepEntity.test.mjs --reporter list --timeout 30000
import assert from 'assert'
import path from 'path'
import { fileURLToPath } from 'url'
import { keepAssignByEntity } from '../server/syncKeep.mjs'
import validateRowsBeforeWrite from '../server/validateRows.mjs'
import { deepFreeze } from './tools/unitExt.mjs'
import { sourceLines } from './tools/srcScan.mjs'


const projRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const cells = { KE: 0 }

//庫內同一 from 之 grups(保留指派之來源); g1 另有 crules 欄(驗證只讀指定欄)
let oldGrups = () => [
    { id: 'g1', name: 'A', cpemis: '{"P1":1}', crules: '{"T1":"y"}' },
    { id: 'g2', name: 'B', cpemis: '{"P2":1}' },
    { id: 'g3', name: 'D', cpemis: 'D1' }, //歷史同名
    { id: 'g4', name: 'D', cpemis: 'D2' },
    { id: 'g5', name: 'nokey' }, //庫內無 cpemis 欄位
    { id: '5', name: 'N5', cpemis: 'FIVE' }, //以數字 id 5 對應
]
//庫內同一 from 之 pemis
let oldPemis = () => [
    { id: 'p1', name: 'PA', crules: '{"T1":"y"}' },
    { id: 'p2', name: 'PB', crules: '{"T2":"y"}' },
]
let keep = (rows, o = {}) => keepAssignByEntity({ rows, hasKey: rows.map(() => false), rowsOldSameFrom: oldGrups(), key: 'cpemis', ...o })


describe('unit-syncKeepEntity (外部同步缺 cpemis／crules 鍵保留, run08)', function() {

    describe('keepAssignByEntity(KE-S1～KE-S5)', function() {

        it('KE-001 指派欄鍵 cpemis(grups 列)／crules(pemis 列): 缺鍵且 id 命中庫內同一 from → 取庫內值, 其餘欄位維持 payload(外部為準), nKeep=1、nSkip=0、nConflict=0', function() {
            cells.KE += 2
            let g = keep([{ id: 'g1', name: 'A', description: 'new-desc' }])
            assert.strict.deepEqual(g.rows, [{ id: 'g1', name: 'A', description: 'new-desc', cpemis: '{"P1":1}' }])
            assert.strict.deepEqual([g.nKeep, g.nSkip, g.nConflict], [1, 0, 0])
            let p = keepAssignByEntity({ rows: [{ id: 'p2', name: 'PB', description: 'd' }], hasKey: [false], rowsOldSameFrom: oldPemis(), key: 'crules' })
            assert.strict.deepEqual(p.rows, [{ id: 'p2', name: 'PB', description: 'd', crules: '{"T2":"y"}' }])
            assert.strict.deepEqual([p.nKeep, p.nSkip, p.nConflict], [1, 0, 0])
        })

        it('KE-002 hasKey 為 true(含鍵)→ 以外部為準: 值為 EXT／空字串／undefined／null 皆原樣、同一參考, 不呼叫 isKeepable, nKeep=0', function() {
            cells.KE += 4
            for (let val of ['EXT', '', undefined, null]) {
                let row = { id: 'g1', name: 'A', cpemis: val }
                let called = 0
                let r = keepAssignByEntity({ rows: [row], hasKey: [true], rowsOldSameFrom: oldGrups(), key: 'cpemis', isKeepable: () => { called++; return true } })
                assert.strict.equal(r.rows[0], row, `值 ${String(val)}`)
                assert.strict.equal(r.rows[0].cpemis, val)
                assert.strict.deepEqual([r.nKeep, r.nSkip, r.nConflict, called], [0, 0, 0, 0])
            }
        })

        it('KE-003 hasKey 只有嚴格 true 才視為含鍵: 缺項(較 rows 短)／false／0／\'true\'／null 皆視為缺鍵而保留', function() {
            cells.KE += 5
            for (let hasKey of [[], [false], [0], ['true'], [null]]) {
                let r = keepAssignByEntity({ rows: [{ id: 'g2', name: 'B' }], hasKey, rowsOldSameFrom: oldGrups(), key: 'cpemis' })
                assert.strict.equal(r.rows[0].cpemis, '{"P2":1}', `hasKey ${JSON.stringify(hasKey)}`)
                assert.strict.equal(r.nKeep, 1)
            }
        })

        it('KE-004 id 軸: 有限數字 id(5)對到庫內字串 id \'5\' → 保留; id 不在庫內(新實體, 即使名稱與庫內某列相同)→ 不動、不保留、不計 nConflict', function() {
            cells.KE += 2
            let a = keep([{ id: 5, name: 'N5' }])
            assert.strict.equal(a.rows[0].cpemis, 'FIVE')
            assert.strict.equal(a.nKeep, 1)
            let b = keep([{ id: 'g-new', name: 'A' }]) //新 id 同名 A(舊 g1 不在本批): 依 id 判新實體
            assert.strict.deepEqual(b.rows, [{ id: 'g-new', name: 'A' }])
            assert.strict.deepEqual([b.nKeep, b.nSkip, b.nConflict], [0, 0, 0])
        })

        it('KE-005 無效 id(NaN／Infinity／空字串／null／布林／物件)視為無 id: 改依名稱, 恰命中 1 筆 → 保留', function() {
            cells.KE += 6
            for (let id of [NaN, Infinity, '', null, true, {}]) {
                let r = keep([{ id, name: 'B' }])
                assert.strict.equal(r.rows[0].cpemis, '{"P2":1}', `id ${String(id)}`)
                assert.strict.equal(r.nKeep, 1)
            }
        })

        it('KE-006 庫內對應列無此欄位(自有屬性)→ 不動、不保留: 依 id(g5)與依名稱(nokey)各一', function() {
            cells.KE += 2
            let a = keep([{ id: 'g5', name: 'nokey' }])
            assert.strict.equal('cpemis' in a.rows[0], false)
            let b = keep([{ name: 'nokey' }])
            assert.strict.equal('cpemis' in b.rows[0], false)
            assert.strict.deepEqual([a.nKeep, b.nKeep, a.nConflict, b.nConflict], [0, 0, 0, 0])
        })

        it('KE-007 無 id 依名稱: 恰 1 筆→保留; 0 筆→不動(新實體, 不計 nConflict); ≥2 筆(歷史同名)→不取首筆、不保留、nConflict=1; 對到之舊列 id 已被本批他列帶用→不在對應池, 不保留; 名稱精確 === (大小寫、空白不同不對應)', function() {
            cells.KE += 5
            let one = keep([{ name: 'A' }])
            assert.strict.equal(one.rows[0].cpemis, '{"P1":1}')
            let zero = keep([{ name: 'ZZ' }])
            assert.strict.deepEqual([zero.rows[0], zero.nKeep, zero.nConflict], [{ name: 'ZZ' }, 0, 0])
            let dup = keep([{ name: 'D' }])
            assert.strict.equal('cpemis' in dup.rows[0], false, '同名兩筆不取首筆')
            assert.strict.deepEqual([dup.nKeep, dup.nConflict], [0, 1])
            //g1 之 id 被本批第一列帶用(該列改名為 X), 第二列無 id 名稱 A: 舊 g1 不在對應池
            let used = keep([{ id: 'g1', name: 'X' }, { name: 'A' }])
            assert.strict.equal(used.rows[1].cpemis, undefined)
            assert.strict.deepEqual([used.nKeep, used.nConflict], [1, 0]) //第一列依 id 保留(cascadeRename 缺省 true), 第二列不保留
            let exact = keep([{ name: 'a' }, { name: ' A' }, { name: 'A ' }])
            assert.strict.deepEqual([exact.nKeep, exact.nConflict], [0, 0])
        })

        it('KE-008 改名(同 id 異名)× cascadeRename{true,缺省,false} × 名稱{相同,不同}: 僅 (false, 不同) 不保留並 nConflict=1; 其餘保留', function() {
            cells.KE += 6
            for (let cr of [true, undefined, false]) {
                let opt = cr === undefined ? {} : { cascadeRename: cr }
                let same = keep([{ id: 'g1', name: 'A' }], opt)
                assert.strict.deepEqual([same.rows[0].cpemis, same.nKeep, same.nConflict], ['{"P1":1}', 1, 0], `名稱相同 cascadeRename=${String(cr)}`)
                let diff = keep([{ id: 'g1', name: 'A-renamed' }], opt)
                if (cr === false) {
                    assert.strict.equal('cpemis' in diff.rows[0], false, '引用不跟著改: 不把舊名之指派移轉給新名')
                    assert.strict.deepEqual([diff.nKeep, diff.nConflict], [0, 1])
                }
                else {
                    assert.strict.deepEqual([diff.rows[0].cpemis, diff.nKeep, diff.nConflict], ['{"P1":1}', 1, 0], `改名 cascadeRename=${String(cr)}`)
                }
            }
        })

        it('KE-009 isKeepable: 預設恆可; 為假→不保留、nSkip=1、列原樣(同一參考); 只對候選(已對應、庫內有欄位、缺鍵)呼叫且收到庫內值', function() {
            cells.KE += 3
            let r0 = keep([{ id: 'g2', name: 'B' }])
            assert.strict.deepEqual([r0.nKeep, r0.nSkip], [1, 0])
            let row = { id: 'g2', name: 'B' }
            let r1 = keepAssignByEntity({ rows: [row], hasKey: [false], rowsOldSameFrom: oldGrups(), key: 'cpemis', isKeepable: () => false })
            assert.strict.equal(r1.rows[0], row)
            assert.strict.equal('cpemis' in row, false)
            assert.strict.deepEqual([r1.nKeep, r1.nSkip, r1.nConflict], [0, 1, 0])
            let seen = []
            let rows = [
                { id: 'g1', name: 'A' }, //候選
                { id: 'g2', name: 'B', cpemis: 'EXT' }, //含鍵
                { id: 'g-new', name: 'Q' }, //對不到
                { id: 'g5', name: 'nokey' }, //庫內無欄位
                { id: 'g1x', name: 'D' }, //id 不在庫內
                { name: 'D' }, //同名多筆(衝突)
                { name: 'B2' }, //名稱對不到
                { id: 5, name: 'N5' }, //候選
            ]
            let hasKey = [false, true, false, false, false, false, false, false]
            keepAssignByEntity({ rows, hasKey, rowsOldSameFrom: oldGrups(), key: 'cpemis', isKeepable: (v) => { seen.push(v); return true } })
            assert.strict.deepEqual(seen, ['{"P1":1}', 'FIVE'])
        })

        it('KE-010 非物件元素(null／undefined／字串／數字／陣列)原樣通過不拋例外; 庫內雜訊(非物件列、id 非字串)被略過', function() {
            cells.KE += 2
            let rows = [null, undefined, 'x', 5, [], { id: 'g1', name: 'A' }]
            let r = keepAssignByEntity({ rows, hasKey: rows.map(() => false), rowsOldSameFrom: oldGrups(), key: 'cpemis' })
            assert.strict.deepEqual(r.rows.slice(0, 5), [null, undefined, 'x', 5, []])
            assert.strict.equal(r.rows[5].cpemis, '{"P1":1}')
            assert.strict.equal(r.nKeep, 1)
            let noisy = [null, 'x', 5, { id: 7, name: 'A', cpemis: 'NUM-ID' }, { name: 'A', cpemis: 'NO-ID' }, { id: 'g1', name: 'A', cpemis: 'OK' }]
            let r2 = keepAssignByEntity({ rows: [{ name: 'A' }], hasKey: [false], rowsOldSameFrom: noisy, key: 'cpemis' })
            assert.strict.equal(r2.rows[0].cpemis, 'OK', '只有 id 為字串之列可對應')
        })

        it('KE-011 混合批次: 次序保持、各列獨立判定, 三個計數各自累計', function() {
            cells.KE += 1
            let rows = [{ id: 'g1', name: 'A' }, { id: 'g2', name: 'B', cpemis: 'EXT' }, { name: 'D' }, { id: 'g-new', name: 'N' }, { id: 'g2x', name: 'B' }, { id: 'g5', name: 'nokey' }]
            let hasKey = [false, true, false, false, false, false]
            let calls = 0
            let r = keepAssignByEntity({ rows, hasKey, rowsOldSameFrom: oldGrups(), key: 'cpemis', isKeepable: (v) => { calls++; return v !== '{"P1":1}' } })
            assert.strict.deepEqual(r.rows.map((x) => x.id), ['g1', 'g2', undefined, 'g-new', 'g2x', 'g5'])
            assert.strict.deepEqual(r.rows.map((x) => x.cpemis), [undefined, 'EXT', undefined, undefined, undefined, undefined])
            assert.strict.deepEqual([r.nKeep, r.nSkip, r.nConflict, calls], [0, 1, 1, 1])
        })

        it('KE-012 不改輸入: 凍結之 rows／rowsOldSameFrom／hasKey 不拋錯; 回傳新陣列, 被保留之列為新物件, 其餘列同一參考', function() {
            cells.KE += 1
            let rowsIn = deepFreeze([{ id: 'g1', name: 'A' }, { id: 'g-new', name: 'N' }])
            let out = keepAssignByEntity({ rows: rowsIn, hasKey: deepFreeze([false, false]), rowsOldSameFrom: deepFreeze(oldGrups()), key: 'cpemis' })
            assert.strict.notEqual(out.rows, rowsIn)
            assert.strict.notEqual(out.rows[0], rowsIn[0])
            assert.strict.equal(out.rows[1], rowsIn[1])
            assert.strict.equal('cpemis' in rowsIn[0], false)
        })

        it('KE-013 原型鍵名(__proto__／constructor／toString／hasOwnProperty)作為 id 或名稱: 不在庫內→不保留; 庫內確有同名／同 id 之列→與一般字串相同(保留), 不污染原型', function() {
            cells.KE += 2
            let names = ['__proto__', 'constructor', 'toString', 'hasOwnProperty']
            let r = keepAssignByEntity({ rows: names.map((n) => ({ id: n, name: n })), hasKey: names.map(() => false), rowsOldSameFrom: oldGrups(), key: 'cpemis' })
            assert.strict.deepEqual([r.nKeep, r.nSkip, r.nConflict], [0, 0, 0])
            assert.strict.equal(({}).cpemis, undefined)
            let old = names.map((n, k) => ({ id: n, name: `${n}-name`, cpemis: `V${k}` })).concat(names.map((n, k) => ({ id: `idn${k}`, name: n, cpemis: `N${k}` })))
            let byId = keepAssignByEntity({ rows: names.map((n) => ({ id: n, name: `${n}-name` })), hasKey: names.map(() => false), rowsOldSameFrom: old, key: 'cpemis' })
            assert.strict.deepEqual(byId.rows.map((x) => x.cpemis), ['V0', 'V1', 'V2', 'V3'])
            let byName = keepAssignByEntity({ rows: names.map((n) => ({ name: n })), hasKey: names.map(() => false), rowsOldSameFrom: old, key: 'cpemis' })
            assert.strict.deepEqual(byName.rows.map((x) => x.cpemis), ['N0', 'N1', 'N2', 'N3'])
            assert.strict.equal(({}).cpemis, undefined)
        })

        it('KE-014 以站點同式 predicate(validateRowsBeforeWrite)接真驗證: 正常 JSON 字串／空字串／數字／null 保留(nKeep); 含標記字串／物件／陣列／bigint 不保留(nSkip)', function() {
            let isKeepable = (val) => validateRowsBeforeWrite([{ id: 'keep', cpemis: val }]) === null
            let cases = [
                ['正常 JSON 字串', '{"P1":1}', true],
                ['空字串', '', true],
                ['數字', 5, true],
                ['null', null, true],
                ['含 HTML 標記字串', '<script>alert(1)</script>', false],
                ['物件', { P1: 1 }, false],
                ['陣列', ['P1'], false],
                ['bigint', 10n, false],
            ]
            for (let [title, val, ok] of cases) {
                cells.KE++
                let r = keepAssignByEntity({ rows: [{ id: 'x1', name: 'X' }], hasKey: [false], rowsOldSameFrom: [{ id: 'x1', name: 'X', cpemis: val }], key: 'cpemis', isKeepable })
                if (ok) {
                    assert.strict.deepEqual([r.nKeep, r.nSkip], [1, 0], title)
                    assert.strict.equal(r.rows[0].cpemis, val, title)
                }
                else {
                    assert.strict.deepEqual([r.nKeep, r.nSkip], [0, 1], title)
                    assert.strict.equal('cpemis' in r.rows[0], false, title)
                }
            }
        })

        it('KE-015 key 參數只讀指定欄: 庫內同列有 cpemis 與 crules 時, key=crules 只取 crules', function() {
            cells.KE += 1
            let r = keepAssignByEntity({ rows: [{ id: 'g1', name: 'A' }], hasKey: [false], rowsOldSameFrom: oldGrups(), key: 'crules' })
            assert.strict.deepEqual(r.rows, [{ id: 'g1', name: 'A', crules: '{"T1":"y"}' }])
        })

        it('KE-016 (run08 外審 sol #1) 同 id 改名而新舊名稱有一方非字串(歷史資料; cascadeRename 預設真): 級聯無從處理(refCascade.diffRefTargets 須新舊名皆為字串, 缺欄視 \'\'), 保留會使原指向新名(懸空)之引用者增權 → 舊名為 null／數字／物件、新名為 null 皆不保留並 nConflict=1; 舊名缺欄(視 \'\')或空字串、新舊同為 null(非改名)→ 保留', function() {
            cells.KE += 7
            let one = (oldRow, newRow) => keepAssignByEntity({ rows: [newRow], hasKey: [false], rowsOldSameFrom: [{ id: 'x1', cpemis: 'SECRET', ...oldRow }], key: 'cpemis' })
            for (let [title, oldRow, newRow] of [
                ['舊名 null', { name: null }, { id: 'x1', name: 'B' }],
                ['舊名數字', { name: 5 }, { id: 'x1', name: 'B' }],
                ['舊名物件', { name: {} }, { id: 'x1', name: 'B' }],
                ['新名 null(舊名 A)', { name: 'A' }, { id: 'x1', name: null }],
            ]) {
                let r = one(oldRow, newRow)
                assert.strict.equal('cpemis' in r.rows[0], false, `${title}: 不得帶入`)
                assert.strict.deepEqual([r.nKeep, r.nSkip, r.nConflict], [0, 0, 1], title)
            }
            for (let [title, oldRow, newRow] of [
                ['舊名缺欄(視 空字串, 級聯可處理)', {}, { id: 'x1', name: 'B' }],
                ['舊名空字串', { name: '' }, { id: 'x1', name: 'B' }],
                ['新舊同為 null(非改名)', { name: null }, { id: 'x1', name: null }],
            ]) {
                let r = one(oldRow, newRow)
                assert.strict.equal(r.rows[0].cpemis, 'SECRET', title)
                assert.strict.deepEqual([r.nKeep, r.nSkip, r.nConflict], [1, 0, 0], title)
            }
        })

        //外審 sol A1 挑戰表之缺格(作者讀碼判定行為正確, 補成案例): 交互格以實體身分(id)判定, 不被同批名稱互換、歷史同名池排除等干擾
        it('KE-017 批次名稱互換(a: A→B、b: B→A)× cascadeRename: 開啟時指派跟著 id(P→a、Q→b, nKeep=2); 關閉時兩列皆不保留(名稱即身分, nConflict=2)', function() {
            cells.KE += 2
            let old = [{ id: 'a', name: 'A', cpemis: 'P' }, { id: 'b', name: 'B', cpemis: 'Q' }]
            let rows = [{ id: 'a', name: 'B' }, { id: 'b', name: 'A' }]
            let on = keepAssignByEntity({ rows, hasKey: [false, false], rowsOldSameFrom: old, key: 'cpemis' })
            assert.strict.deepEqual(on.rows.map((x) => x.cpemis), ['P', 'Q'])
            assert.strict.deepEqual([on.nKeep, on.nConflict], [2, 0])
            let off = keepAssignByEntity({ rows, hasKey: [false, false], rowsOldSameFrom: old, key: 'cpemis', cascadeRename: false })
            assert.strict.deepEqual(off.rows.map((x) => x.cpemis), [undefined, undefined])
            assert.strict.deepEqual([off.nKeep, off.nConflict], [0, 2])
        })

        it('KE-018 歷史同名(a、b 皆名 D)× 本批已帶用 a 的 id × 無 id 同名列: 對應池只剩 b → 無 id 列取 b 之值(恰 1 筆), a 改名 X 依 id 取 a 之值', function() {
            cells.KE += 1
            let old = [{ id: 'a', name: 'D', cpemis: 'P' }, { id: 'b', name: 'D', cpemis: 'Q' }]
            let r = keepAssignByEntity({ rows: [{ id: 'a', name: 'X' }, { name: 'D' }], hasKey: [false, false], rowsOldSameFrom: old, key: 'cpemis' })
            assert.strict.deepEqual(r.rows.map((x) => x.cpemis), ['P', 'Q'])
            assert.strict.deepEqual([r.nKeep, r.nSkip, r.nConflict], [2, 0, 0])
        })

        it('KE-019 key=crules × isKeepable 為假(庫內值含會被 clearXSS 改寫之標記): 不保留、nSkip=1、不補鍵', function() {
            cells.KE += 1
            let isKeepable = (val) => validateRowsBeforeWrite([{ id: 'keep', crules: val }]) === null
            let r = keepAssignByEntity({ rows: [{ id: 'p1', name: 'PA' }], hasKey: [false], rowsOldSameFrom: [{ id: 'p1', name: 'PA', crules: '<script>x</script>' }], key: 'crules', isKeepable })
            assert.strict.equal('crules' in r.rows[0], false)
            assert.strict.deepEqual([r.nKeep, r.nSkip, r.nConflict], [0, 1, 0])
        })

        it('KE-020 含鍵 × cascadeRename 關閉 × 同 id 改名 × 庫內值不可保留: 以外部為準(列同一參考), 不呼叫 isKeepable, 三個計數皆 0', function() {
            cells.KE += 1
            let row = { id: 'a', name: 'B', cpemis: '' }
            let called = 0
            let r = keepAssignByEntity({ rows: [row], hasKey: [true], rowsOldSameFrom: [{ id: 'a', name: 'A', cpemis: '<b>' }], key: 'cpemis', cascadeRename: false, isKeepable: () => { called++; return false } })
            assert.strict.equal(r.rows[0], row)
            assert.strict.deepEqual([r.nKeep, r.nSkip, r.nConflict, called], [0, 0, 0, 0])
        })

    })


    // 站點靜態斷言(整合層; 真後端行為由 API 層另測)
    describe('站點(靜態)', function() {

        //perm-run03: 外部同步搬到 server/syncCore.mjs(syncCore() 閉包內之 syncAndReplaceTabs); 保留指派之接線隨之: 指派欄表為模組層 KEY_ASSIGN、庫內來源為 sameFrom(以 srcKey 配對後同一 from 之列)、
        //被保留者之 id 為「配對到之庫內 id／新配之 id」(rowsKeep), mappingBy 固定 'id' 故 users 不再有 mapKeyConflict, nConflict 之 reason 恆為 identityConflict
        let code = () => sourceLines(path.join(projRoot, 'server/syncCore.mjs'), 'code').map((l) => l.text).join('\n')

        it('SITE-KE-001 syncAndReplaceTabs: KEY_ASSIGN 對應 users→cgrups／grups→cpemis／pemis→crules(其餘 null); keyAssign 取自 KEY_ASSIGN[keyTable]; markHasKey 以 keyAssign 記錄(於缺鍵補 \'\' 之前, 對 rowsIn); grups／pemis 走 keepAssignByEntity 並傳入 key、cascadeRename、isKeepable; isKeepable 以 validateRowsBeforeWrite 判定; 呼叫位於第一個 ORM 寫入之前; 結果回寫 rowsKeep', function() {
            let c = code()
            assert.strict.ok(c.includes(`let KEY_ASSIGN = { users: 'cgrups', grups: 'cpemis', pemis: 'crules', targets: null }`), 'KEY_ASSIGN 對應')
            assert.strict.ok(c.includes(`let keyAssign = KEY_ASSIGN[keyTable]`), 'keyAssign 取自 KEY_ASSIGN')
            assert.strict.ok(c.includes('markHasKey(rowsIn, keyAssign)'), 'markHasKey 以 keyAssign 記錄(對 ltdtmapping 補鍵之前的 rowsIn)')
            assert.strict.ok(c.indexOf('markHasKey(rowsIn, keyAssign)') < c.indexOf('ltdtmapping('), 'markHasKey 須在 ltdtmapping 補鍵之前')
            assert.strict.ok(c.includes(`let isKeepable = (val) => validateRowsBeforeWrite([{ id: 'keep', [keyAssign]: val }]) === null`), 'isKeepable 須以 validateRowsBeforeWrite 判定')
            let m = /keepAssignByEntity\(\{([^\n]*)\}\)/.exec(c.slice(c.indexOf('let kr = ')))
            assert.strict.ok(m, '找不到 keepAssignByEntity({...}) 呼叫')
            for (let s of ['key: keyAssign', 'cascadeRename', 'isKeepable', 'rowsOldSameFrom: sameFrom', 'hasKey: hasAssign', 'rows: rowsKeep']) {
                assert.strict.ok(m[1].includes(s), `keepAssignByEntity 須傳入 ${s}: ${m[1]}`)
            }
            let iKeep = c.indexOf('keepAssignByEntity({')
            let iWrite = c.search(/\.(insert|save|del|delAll|mix)\(|\bprocOrm\(/)
            assert.strict.ok(iKeep > 0 && iWrite > 0 && iKeep < iWrite, 'keepAssignByEntity 須位於第一個 ORM 寫入呼叫之前')
            assert.strict.ok(/rowsKeep = kr\.rows/.test(c), '保留結果須回寫 rowsKeep')
        })

        it('SITE-KE-002 記錄事件之 field 為 keyAssign(不再寫死 cgrups); nConflict 之 reason 恆為 identityConflict(mappingBy 固定 id, users 不再有 mapKeyConflict); 只帶表名／來源／欄位／筆數／原因(不含值)', function() {
            let c = code()
            assert.strict.ok(/if \(kr\.nKeep > 0\) \{\s*srLog\.info\(\{ event: 'syncAndReplaceTabs-keepAssign', keyTable, from, field: keyAssign, n: kr\.nKeep \}\)\s*\}/.test(c), 'info 事件')
            assert.strict.ok(/if \(kr\.nSkip > 0\) \{\s*srLog\.warn\(\{ event: 'syncAndReplaceTabs-keepAssign-skip', keyTable, from, field: keyAssign, n: kr\.nSkip, reason: 'notKeepable' \}\)\s*\}/.test(c), 'notKeepable warn')
            assert.strict.ok(/if \(kr\.nConflict > 0\) \{\s*srLog\.warn\(\{ event: 'syncAndReplaceTabs-keepAssign-skip', keyTable, from, field: keyAssign, n: kr\.nConflict, reason: 'identityConflict' \}\)/.test(c), 'conflict warn')
        })

    })


    // 宣告格數核對
    describe('KE-CELLS 輸入空間格數核對', function() {

        it('KE-999 實測格數 = 宣告(62)', function() {
            if (process.argv.some((a) => a === '--grep' || a === '-g' || a.startsWith('--grep='))) {
                this.skip() //--grep 只跑部分案例時計數必不全, 不核對
            }
            assert.strict.deepEqual(cells, { KE: 62 })
        })

    })

})
