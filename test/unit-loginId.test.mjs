//users 登入對應 mappingBy='id' 之 O1 規則: 外部列(from 非空)對 srcKey、後台列(from 空)對 id, 撞值收嚴(perm-run04 範圍一; 規則帳本 R-MAPKEY-04; 規格 C:\opensrcOper\dspec\外部匯入之定義與機制.md 第 9 節末)
//
//述語(期望由規格推導, 不照實作現況):
//  L1 登入識別值(loginIdOf): 後台列(from 空)＝id; 外部列(from 非空)＝srcKey(其 id 為本系統配之內部主鍵, 不是登入識別);
//     遷移前之舊外部列(升版前同步寫入、尚無 srcKey)暫以 id(與升版前行為相同, 首次匯入補上 srcKey 後即改以 srcKey).
//  L2 登入查找(findLoginUsers; perm-run05 起「不論 isActive」計筆): mappingBy='id'(含預設與不合法值)取全部 loginIdOf 等於外部 token 使用者 id 之列(含停用者與他來源之列);
//     多於 1 筆 → count>1、user null(不取首筆, 不以「只有一列有效」放行); 恰 1 筆且有效 → 該列; 恰 1 筆但停用 → count 0(查無); 0 筆 → count 0;
//     'email'／'name' 不變(沿用 select({ [mappingBy]: v, isActive:'y' }) 與 pickUniqueUser); id 模式之查詢條件只帶 id／srcKey 之一(無 isActive), 不做全表讀取; ORM 例外原樣拋出(不吞, fail-closed).
//  L3 撞值(findLoginIdClash／findLoginIdClashDetail; perm-run05 起「不論 isActive」且含他來源外部列): 同一張表寫入後, 「被本次觸及」之列其登入識別值(loginIdOf)與另一列相同, 且該對不是「兩後台列」與「同一來源之兩外部列」→ 撞值,
//     回第一個被觸及之列索引(Detail 另回對方索引與種類 adminId／otherFrom), 否則 -1; 歷史既有(未被觸及)之撞值不擋(否則已有歷史資料之庫無法在後台修復); 外部列之內部 id 不是登入識別(有 srcKey 者); 舊外部列(無 srcKey)以 id 為登入識別而參與.
//受測: server/keyCheck.mjs(loginIdOf／findLoginUsers／findLoginIdClash／findLoginIdClashDetail)、server/WWebPerm.mjs／syncCore.mjs／procCore.mjs 之接線(靜態)、server/procLang.mjs 之 loginIdCollision.
//跑法: npx mocha test/unit-loginId.test.mjs --reporter list --timeout 60000
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { loginIdOf, findLoginUsers, findLoginIdClash, findLoginIdClashDetail } from '../server/keyCheck.mjs'
import { mkTable } from './tools/unitOrm.mjs'
import { stripLineComment } from './tools/srcScan.mjs'

const A = assert.strict
const projRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

//u: users 列夾具(最小欄位)
let u = (o) => ({ isActive: 'y', from: '', ...o })
//backend／ext／legacy: 後台列、外部列(帶 srcKey; id 為系統配之值)、舊外部列(無 srcKey)
let backend = (id, o = {}) => u({ id, ...o })
let ext = (id, srcKey, from = 'appA', o = {}) => u({ id, srcKey, from, ...o })
let legacy = (id, from = 'appA', o = {}) => u({ id, from, ...o })
let idsOf = (r) => (r.user ? [r.user.id] : [])


describe('unit-loginId (users 登入對應 mappingBy=id 之 O1 規則, R-MAPKEY-04)', function() {

    describe('loginIdOf(L1)', function() {
        it('LI-001 後台列(from 空字串／缺／null)＝id, 即使資料帶 srcKey 也以 id 為準', function() {
            A.equal(loginIdOf({ id: 'a1', from: '' }), 'a1')
            A.equal(loginIdOf({ id: 'a1' }), 'a1')
            A.equal(loginIdOf({ id: 'a1', from: null }), 'a1')
            A.equal(loginIdOf({ id: 'a1', from: '', srcKey: 'zzz' }), 'a1', '後台列不得帶 srcKey; 資料若有, 登入識別仍是 id')
        })
        it('LI-002 外部列(from 非空)帶 srcKey ＝ srcKey, 不是系統配之 id', function() {
            A.equal(loginIdOf({ id: 'sys-1', from: 'appA', srcKey: 'GUID-1' }), 'GUID-1')
            A.notEqual(loginIdOf({ id: 'sys-1', from: 'appA', srcKey: 'GUID-1' }), 'sys-1')
        })
        it('LI-003 遷移前舊外部列(srcKey 為空字串／缺／null／非字串)暫以 id(同升版前)', function() {
            for (let sk of ['', undefined, null, 5, {}]) {
                A.equal(loginIdOf({ id: 'old-1', from: 'appA', srcKey: sk }), 'old-1', `srcKey=${JSON.stringify(sk)}`)
            }
        })
        it('LI-004 無可用鍵(id 空／缺／非字串)或非物件 → 空字串(不匹配任何登入)', function() {
            A.equal(loginIdOf({ id: '', from: '' }), '')
            A.equal(loginIdOf({ from: '' }), '')
            A.equal(loginIdOf({ id: 7, from: '' }), '')
            A.equal(loginIdOf({ id: '', from: 'appA', srcKey: '' }), '')
            for (let v of [null, undefined, 'x', 5, [], true]) {
                A.equal(loginIdOf(v), '')
            }
        })
    })


    describe('findLoginUsers(L2)', function() {

        it('LI-010 id 模式: 後台列對 id; 查無為 count 0', async function() {
            let t = mkTable([backend('a1'), backend('a2')])
            let r = await findLoginUsers(t, 'id', 'a1')
            A.deepEqual([r.count, idsOf(r)], [1, ['a1']])
            r = await findLoginUsers(t, 'id', 'nobody')
            A.deepEqual([r.count, r.user], [0, null])
        })

        it('LI-011 id 模式: 外部列對 srcKey; 外部列的系統配 id 不是登入識別(不可用 id 登入)', async function() {
            let t = mkTable([ext('sys-1', 'GUID-1')])
            let r = await findLoginUsers(t, 'id', 'GUID-1')
            A.deepEqual([r.count, idsOf(r)], [1, ['sys-1']], '以 srcKey 登入, 回該列(id 為內部主鍵)')
            r = await findLoginUsers(t, 'id', 'sys-1')
            A.deepEqual([r.count, r.user], [0, null], '以系統配 id 登入不得命中外部列')
        })

        it('LI-012 遷移後之外部列(srcKey 等於舊 id)照常登入且不重複計算', async function() {
            let t = mkTable([ext('x-1', 'x-1')])
            let r = await findLoginUsers(t, 'id', 'x-1')
            A.deepEqual([r.count, idsOf(r)], [1, ['x-1']])
        })

        it('LI-013 遷移前之舊外部列(無 srcKey)暫以 id 登入; 已有 srcKey 的外部列不再以 id 登入', async function() {
            let t = mkTable([legacy('old-1'), ext('sys-2', 'GUID-2')])
            let r = await findLoginUsers(t, 'id', 'old-1')
            A.deepEqual([r.count, idsOf(r)], [1, ['old-1']])
            r = await findLoginUsers(t, 'id', 'sys-2')
            A.equal(r.count, 0)
        })

        it('LI-014 停用列(isActive 非 y)不匹配: 後台列、外部列、舊外部列皆是', async function() {
            let t = mkTable([backend('a1', { isActive: 'n' }), ext('sys-1', 'GUID-1', 'appA', { isActive: 'n' }), legacy('old-1', 'appA', { isActive: 'n' })])
            for (let v of ['a1', 'GUID-1', 'old-1']) {
                let r = await findLoginUsers(t, 'id', v)
                A.deepEqual([r.count, r.user], [0, null], v)
            }
        })

        it('LI-015 撞多筆(歷史資料: 後台列 id 與外部列 srcKey 相同, 皆有效)→ count 2, 不取首筆', async function() {
            let t = mkTable([backend('k'), ext('sys-1', 'k')])
            let r = await findLoginUsers(t, 'id', 'k')
            A.deepEqual([r.count, r.user], [2, null])
        })

        it('LI-016 兩個來源之外部列 srcKey 相同(srcKey 只在 from 內唯一)→ count 2, 不取首筆', async function() {
            let t = mkTable([ext('sys-1', 'dup', 'appA'), ext('sys-2', 'dup', 'appB')])
            let r = await findLoginUsers(t, 'id', 'dup')
            A.deepEqual([r.count, r.user], [2, null])
        })

        it('LI-017 外部列的 id 恰等於另一外部列的 srcKey: 只匹配 srcKey 那一列(id 不是登入識別)', async function() {
            let t = mkTable([ext('S', 'other-guid', 'appA'), ext('sys-2', 'S', 'appB')])
            let r = await findLoginUsers(t, 'id', 'S')
            A.deepEqual([r.count, idsOf(r)], [1, ['sys-2']])
        })

        it('LI-018 email／name 模式不變: 以該欄位查有效列; 外部列同樣以 email／name 匹配(不看 srcKey); 多筆不取首筆', async function() {
            let t = mkTable([
                backend('a1', { email: 'a1@x.test', name: 'n-a1' }),
                ext('sys-1', 'GUID-1', 'appA', { email: 'e1@x.test', name: 'n-e1' }),
                ext('sys-2', 'GUID-2', 'appB', { email: 'dup@x.test', name: 'dupn' }),
                backend('a3', { email: 'dup@x.test', name: 'dupn' }),
                backend('a4', { email: 'off@x.test', name: 'offn', isActive: 'n' }),
            ])
            for (let [mode, key] of [['email', 'email'], ['name', 'name']]) {
                let vals = mode === 'email' ? { a1: 'a1@x.test', e1: 'e1@x.test', dup: 'dup@x.test', off: 'off@x.test' } : { a1: 'n-a1', e1: 'n-e1', dup: 'dupn', off: 'offn' }
                let r = await findLoginUsers(t, mode, vals.a1)
                A.deepEqual([r.count, idsOf(r)], [1, ['a1']], `${mode} 後台列`)
                r = await findLoginUsers(t, mode, vals.e1)
                A.deepEqual([r.count, idsOf(r)], [1, ['sys-1']], `${mode} 外部列以 ${key} 匹配, 與 srcKey 無關`)
                r = await findLoginUsers(t, mode, vals.dup)
                A.deepEqual([r.count, r.user], [2, null], `${mode} 多筆不取首筆`)
                r = await findLoginUsers(t, mode, vals.off)
                A.deepEqual([r.count, r.user], [0, null], `${mode} 停用列不匹配`)
                r = await findLoginUsers(t, mode, 'GUID-1')
                A.equal(r.count, 0, `${mode} 模式下 srcKey 值不是登入識別`)
            }
        })

        it('LI-019 mappingBy 為不合法值(空字串、大小寫不符、null、undefined)視同 id', async function() {
            let t = mkTable([ext('sys-1', 'GUID-1'), backend('a1')])
            for (let bad of ['', 'ID', 'Email', null, undefined, 5]) {
                let r = await findLoginUsers(t, bad, 'GUID-1')
                A.deepEqual([r.count, idsOf(r)], [1, ['sys-1']], `mappingBy=${String(bad)} 外部列依 srcKey`)
                r = await findLoginUsers(t, bad, 'sys-1')
                A.equal(r.count, 0, `mappingBy=${String(bad)} 外部列的 id 不是登入識別`)
            }
        })

        it('LI-020 ORM 讀取失敗原樣拋出(不吞成 0 筆; fail-closed 由呼叫端的 reject 承擔)', async function() {
            let boom = new Error('select failed')
            let t = { select: async () => { throw boom } }
            for (let mode of ['id', 'email', 'name']) {
                await A.rejects(() => findLoginUsers(t, mode, 'v'), (e) => e === boom, mode)
            }
        })

        it('LI-020b 第一次查詢成功、第二次查詢失敗時亦原樣拋出(不可吞成空結果而採信第一次; 外審 sol#4)', async function() {
            let boom = new Error('second select failed')
            let n = 0
            let t = { select: async () => { n++; if (n === 1) { return [backend('K')] } throw boom } }
            await A.rejects(() => findLoginUsers(t, 'id', 'K'), (e) => e === boom)
            A.equal(n, 2, '兩次查詢皆發出')
        })

        it('LI-020c 精確比對: 前後空白與大小寫不同視為不同值(srcKey／id 皆是); 非標準啟用值(\'Y\'、true、1、空字串、缺漏)之列不匹配  [外審 sol#5]', async function() {
            let t = mkTable([ext('s1', ' K '), ext('s2', 'Kx'), backend('k'), ext('s3', 'ON', 'appA', { isActive: 'Y' }), ext('s4', 'T', 'appA', { isActive: true }), ext('s5', 'ONE', 'appA', { isActive: 1 }), ext('s6', 'EMPTY', 'appA', { isActive: '' }), ext('s7', 'MISS', 'appA', { isActive: undefined })])
            let r = await findLoginUsers(t, 'id', ' K ')
            A.deepEqual([r.count, idsOf(r)], [1, ['s1']], '前後空白原樣比對')
            A.equal((await findLoginUsers(t, 'id', 'K')).count, 0, '去空白後之值不匹配')
            A.equal((await findLoginUsers(t, 'id', 'K ')).count, 0)
            A.equal((await findLoginUsers(t, 'id', 'KX')).count, 0, '大小寫不同')
            A.equal((await findLoginUsers(t, 'id', 'K')).count, 0, 'srcKey「Kx」與 id「k」皆不等於「K」')
            for (let v of ['ON', 'T', 'ONE', 'EMPTY', 'MISS']) {
                A.equal((await findLoginUsers(t, 'id', v)).count, 0, `isActive 非 'y' 者不匹配: ${v}`)
            }
        })

        it('LI-020d 後台列 id 亦精確比對: id 為 \' K \' 之後台列與 token id \' K \' 命中; 去空白之 \'K\' 不命中(外審 sol 第二輪#3)', async function() {
            let t = mkTable([backend(' K ')])
            let r = await findLoginUsers(t, 'id', ' K ')
            A.deepEqual([r.count, idsOf(r)], [1, [' K ']])
            A.equal((await findLoginUsers(t, 'id', 'K')).count, 0)
            A.equal(loginIdOf({ id: ' K ', from: '' }), ' K ')
            A.equal(findLoginIdClash([backend(' K '), ext('s', ' K ')], () => true), 0)
            A.equal(findLoginIdClash([backend(' K '), ext('s', 'K')], () => true), -1)
        })

        it('LI-016b 不論 isActive 計筆(perm-run05, 主控裁示: 不同外部系統之使用者 id 碰撞常見而非同一人, 已停用者之 token 不得對到他來源之有效列): 兩來源之外部列同 srcKey, 只有一列有效 → 仍命中兩筆拒絕; 兩列皆停用 → 兩筆(拒絕); 與後台列同值亦然', async function() {
            for (let combo of [['n', 'y'], ['y', 'n'], ['y', 'y'], ['n', 'n']]) {
                let t = mkTable([ext('sA', 'shared', 'appA', { isActive: combo[0] }), ext('sB', 'shared', 'appB', { isActive: combo[1] })])
                let r = await findLoginUsers(t, 'id', 'shared')
                A.deepEqual([r.count, r.user], [2, null], `兩來源 isActive=${combo.join('/')}`)
                let t2 = mkTable([backend('shared', { isActive: combo[0] }), ext('sB', 'shared', 'appB', { isActive: combo[1] })])
                let r2 = await findLoginUsers(t2, 'id', 'shared')
                A.deepEqual([r2.count, r2.user], [2, null], `後台列與外部列 isActive=${combo.join('/')}`)
            }
            //非標準啟用值('Y'、true、1、空字串、缺漏)之列與標準有效列('y')同值: 仍命中兩筆(不因「唯一標準有效列」而放行; 外審 sol 第一輪#7)
            for (let v of ['Y', true, 1, '', undefined]) {
                let t3 = mkTable([ext('sA', 'shared', 'appA', { isActive: v }), ext('sB', 'shared', 'appB', { isActive: 'y' })])
                let r3 = await findLoginUsers(t3, 'id', 'shared')
                A.deepEqual([r3.count, r3.user], [2, null], `非標準 isActive=${String(v)} 與有效列同 srcKey`)
                let t4 = mkTable([backend('shared', { isActive: v }), ext('sB', 'shared', 'appB', { isActive: 'y' })])
                let r4 = await findLoginUsers(t4, 'id', 'shared')
                A.deepEqual([r4.count, r4.user], [2, null], `非標準 isActive=${String(v)} 之後台列與有效外部列同值`)
            }
        })

        it('LI-016c 單一列時行為不變: 恰 1 筆且有效 → 登入該列; 恰 1 筆但停用 → 查無(count 0, user null); 他列之內部 id 不計入', async function() {
            let t = mkTable([ext('sA', 'solo', 'appA'), ext('sB', 'solo-off', 'appB', { isActive: 'n' }), ext('solo', 'other-guid', 'appC')])
            let r = await findLoginUsers(t, 'id', 'solo')
            A.deepEqual([r.count, idsOf(r)], [1, ['sA']], '另一外部列之內部 id 等於 solo 者不計(外部列之內部 id 不是登入識別)')
            let r2 = await findLoginUsers(t, 'id', 'solo-off')
            A.deepEqual([r2.count, r2.user], [0, null])
        })

        it('LI-021 效能不變式: id 模式之查詢條件只帶對應欄位之一(id、srcKey 各一次; 不帶 isActive 以便不論停用皆計筆), 不做全表 select(); email／name 模式仍帶 isActive', async function() {
            let calls = []
            let t = { select: async (find) => { calls.push(find); return [] } }
            await findLoginUsers(t, 'id', 'v')
            A.ok(calls.length >= 1 && calls.every((c) => c && Object.keys(c).length === 1), `id 模式條件: ${JSON.stringify(calls)}`)
            A.deepEqual(calls.map((c) => Object.keys(c)[0]).sort(), ['id', 'srcKey'])
            calls.length = 0
            await findLoginUsers(t, 'email', 'v')
            A.deepEqual(calls, [{ email: 'v', isActive: 'y' }], 'email 模式條件不變')
            calls.length = 0
            await findLoginUsers(t, 'name', 'v')
            A.deepEqual(calls, [{ name: 'v', isActive: 'y' }], 'name 模式條件不變')
        })
    })


    describe('findLoginIdClash(L3)', function() {
        let all = () => true
        let none = () => false
        let only = (...ks) => (r, k) => ks.includes(k)

        it('LI-030 被觸及的外部列其 srcKey 等於後台列之 id → 回該外部列索引', function() {
            let rows = [backend('a1'), ext('sys-1', 'a1')]
            A.equal(findLoginIdClash(rows, only(1)), 1)
        })

        it('LI-031 被觸及的後台列其 id 等於外部列之 srcKey → 回該後台列索引', function() {
            let rows = [ext('sys-1', 'a1'), backend('a1')]
            A.equal(findLoginIdClash(rows, only(1)), 1)
        })

        it('LI-032 歷史既有(未被觸及)之撞值不擋; 兩邊都被觸及時回較前者', function() {
            let rows = [backend('a1'), ext('sys-1', 'a1')]
            A.equal(findLoginIdClash(rows, none), -1)
            A.equal(findLoginIdClash(rows, all), 0)
        })

        it('LI-033 不論 isActive 皆參與(perm-run05): 外部列停用、後台列停用、被觸及者本身停用、雙方皆停用都算撞值; isActive 之取值(\'y\'、\'n\'、\'Y\'、true、空字串、缺漏)不影響', function() {
            for (let v of ['y', 'n', 'Y', true, 1, '', undefined]) {
                A.equal(findLoginIdClash([backend('a1'), ext('s', 'a1', 'appA', { isActive: v })], all), 0, `外部列 isActive=${String(v)}`)
                A.equal(findLoginIdClash([backend('a1', { isActive: v }), ext('s', 'a1')], all), 0, `後台列 isActive=${String(v)}`)
                A.equal(findLoginIdClash([backend('a1', { isActive: v }), ext('s', 'a1', 'appA', { isActive: v })], only(1)), 1, `雙方 isActive=${String(v)}`)
            }
        })

        it('LI-034 外部列之內部 id 不是登入識別(有 srcKey 者); 舊外部列(無 srcKey)以 id 為登入識別而參與比對(perm-run05)', function() {
            A.equal(findLoginIdClash([backend('a1'), legacy('a1x')], all), -1)
            A.equal(findLoginIdClash([backend('sys-1'), ext('sys-1x', 'GUID-1')], all), -1, '外部列的 id 不是登入識別: 後台列 id 不與之比')
            A.equal(findLoginIdClash([backend('GUID-1'), ext('sys-1', 'GUID-1')], all), 0, 'srcKey 與後台 id 相同即撞')
            A.equal(findLoginIdClash([legacy('L1', 'appA'), ext('sys-2', 'L1', 'appB')], only(1)), 1, '他來源外部列之 srcKey 等於舊外部列之 id(其登入識別)即撞')
            A.equal(findLoginIdClash([legacy('L1', 'appA'), backend('L1')], all), 0, '後台列 id 與舊外部列之 id 相同(主鍵重複, 不應出現; 比對上仍視為撞)')
        })

        it('LI-035 他來源外部列彼此同 srcKey 即撞值(perm-run05, 主控裁示: srcKey 須跨來源唯一); 同一來源之兩外部列不在此檢查(srcKeyDuplicate／srcKeyConflict 另拒)', function() {
            A.equal(findLoginIdClash([ext('s1', 'dup', 'appA'), ext('s2', 'dup', 'appB')], all), 0)
            A.equal(findLoginIdClash([ext('s1', 'dup', 'appA'), ext('s2', 'dup', 'appB')], only(1)), 1)
            A.equal(findLoginIdClash([ext('s1', 'dup', 'appA'), ext('s2', 'dup', 'appA')], all), -1, '同一來源')
            A.equal(findLoginIdClash([ext('s1', 'dup', 'appA', { isActive: 'n' }), ext('s2', 'dup', 'appB', { isActive: 'n' })], all), 0, '皆停用亦撞')
            A.equal(findLoginIdClash([backend('a1'), backend('a1')], all), -1, '兩後台列同 id: 主鍵重複由寫入前驗證另拒, 不屬登入識別撞值')
        })

        it('LI-035b findLoginIdClashDetail 回撞值之對象與種類: 後台↔外部 為 adminId; 外部↔他來源外部 為 otherFrom; 無撞值為 null', function() {
            let d1 = findLoginIdClashDetail([backend('a1'), ext('s', 'a1')], only(1))
            A.deepEqual(d1, { k: 1, kOther: 0, kind: 'adminId' })
            let d2 = findLoginIdClashDetail([ext('s1', 'dup', 'appA'), ext('s2', 'dup', 'appB')], only(0))
            A.deepEqual(d2, { k: 0, kOther: 1, kind: 'otherFrom' })
            A.equal(findLoginIdClashDetail([backend('a1'), ext('s', 'b1')], all), null)
            A.equal(findLoginIdClashDetail(null, all), null)
            A.equal(findLoginIdClash([backend('a1'), ext('s', 'a1')], only(1)), findLoginIdClashDetail([backend('a1'), ext('s', 'a1')], only(1)).k)
        })

        it('LI-035c 同一來源一有 srcKey、一為舊形(無 srcKey)而其 id 等於對方 srcKey(claimTwice 形; 外審 sol 第一輪#1)→ 撞值 kind sameFrom; 同來源皆有 srcKey 或皆無 srcKey 不判; 不同來源則為 otherFrom', function() {
            A.deepEqual(findLoginIdClashDetail([ext('S', 'K', 'appA'), legacy('K', 'appA')], only(1)), { k: 1, kOther: 0, kind: 'sameFrom' })
            A.deepEqual(findLoginIdClashDetail([ext('S', 'K', 'appA'), legacy('K', 'appA')], only(0)), { k: 0, kOther: 1, kind: 'sameFrom' })
            A.equal(findLoginIdClashDetail([ext('S1', 'K', 'appA'), ext('S2', 'K', 'appA')], all), null, '皆有 srcKey: 由 srcKeyDuplicate／srcKeyConflict 於同步端拒')
            A.equal(findLoginIdClashDetail([legacy('K', 'appA'), legacy('K', 'appA')], all), null, '皆無 srcKey: 同主鍵')
            A.equal(findLoginIdClashDetail([ext('S', 'K', 'appA'), legacy('K', 'appB')], only(1)).kind, 'otherFrom')
            //不論雙方 isActive(含停用與非標準值; 外審 sol 第二輪#2)
            for (let v of ['y', 'n', 'Y', true, 1, '', undefined]) {
                A.equal(findLoginIdClashDetail([ext('S', 'K', 'appA', { isActive: v }), legacy('K', 'appA')], all).kind, 'sameFrom', `外部列 isActive=${String(v)}`)
                A.equal(findLoginIdClashDetail([ext('S', 'K', 'appA'), legacy('K', 'appA', { isActive: v })], all).kind, 'sameFrom', `舊形列 isActive=${String(v)}`)
            }
            A.equal(findLoginIdClash([ext('S', 'K', 'appA'), legacy('K', 'appA')], only(1)), 1, '索引版同')
        })

        it('LI-036 非物件、缺欄位、非字串值安全略過; 回第一個被觸及且撞值者', function() {
            let rows = [null, undefined, 'x', 5, { id: 'a1' }, backend('a1'), ext('s', 'a1'), ext('s2', 'a1', 'appB')]
            A.equal(findLoginIdClash(rows, all), 4, '第一個被觸及且撞值者(索引 4 之物件 { id: a1 } 為後台列〔from 缺〕, 與索引 6 之外部列 srcKey 同值)')
            A.equal(findLoginIdClash([backend(5), ext('s', 5)], all), -1)
            A.equal(findLoginIdClash([], all), -1)
            A.equal(findLoginIdClash(null, all), -1)
        })

        it('LI-038 精確比對: 前後空白、大小寫不同之 srcKey／id 不撞  [外審 sol#5]', function() {
            A.equal(findLoginIdClash([backend('K'), ext('s', ' K ')], all), -1, '空白不同')
            A.equal(findLoginIdClash([backend('K'), ext('s', 'k')], all), -1, '大小寫不同')
            A.equal(findLoginIdClash([backend(' K '), ext('s', ' K ')], all), 0, '空白相同才撞')
        })

        it('LI-037 mappingBy 非 id 時呼叫端不呼叫本函數(由 syncCore／procCore 判斷); 本函數本身只看資料: 同一資料給 isTouched 全真即可重現第一個撞值', function() {
            A.equal(findLoginIdClash([backend('a1'), ext('s', 'a1')], all), 0)
        })
    })


    describe('SITE-LI 站點接線(靜態; 只擋字面與位置之回退, 語意由上列與 unit-syncCore／unit-procCore-loginId／api-mapKeyId 證)', function() {
        let readCode = (rel) => fs.readFileSync(path.join(projRoot, rel), 'utf8').split(/\r?\n/).map((ln) => stripLineComment(ln)).join('\n')
        let takeBody = (code, startRe) => {
            let m = startRe.exec(code)
            A.ok(m, `找不到 ${startRe}`)
            let rest = code.slice(m.index)
            let end = rest.search(/\n    \}\n/)
            A.ok(end > 0, `找不到 ${startRe} 之結尾`)
            return rest.slice(0, end)
        }

        it('SITE-LI-001 getTokenUser 經 findLoginUsers 查找(登入識別判準單一擁有者在 keyCheck.mjs), 不再自行 select 對應鍵', function() {
            let tok = takeBody(readCode('server/WWebPerm.mjs'), /let getTokenUser = async/)
            A.ok(tok.includes('findLoginUsers('), 'getTokenUser 須呼叫 findLoginUsers')
            A.ok(!/woItems\.users\.select\(/.test(tok), 'getTokenUser 不得自行 woItems.users.select(')
            A.ok(tok.includes('ambiguousUserFromPerm'), '多筆仍拒絕')
        })

        it('SITE-LI-002 syncCore: users 且 mappingBy 為 id 時以 findLoginIdClashDetail 檢查, 位於第一個 ORM 寫入呼叫之前; 拒收鍵為 loginIdCollision', function() {
            let body = takeBody(readCode('server/syncCore.mjs'), /let syncAndReplaceTabs = async/)
            let iWrite = body.search(/\.(insert|save|del|delAll|mix)\(|\bprocOrm\(/)
            let i = body.indexOf('findLoginIdClashDetail(')
            A.ok(i > 0 && i < iWrite, 'findLoginIdClashDetail( 須位於第一個寫入呼叫之前')
            A.ok(body.indexOf('loginIdCollision') > 0, '拒收鍵 loginIdCollision')
            A.ok(/keyTable === 'users'[\s\S]{0,200}mapKeyOf\(mappingBy\) === null|mapKeyOf\(mappingBy\) === null[\s\S]{0,200}keyTable === 'users'/.test(body), '僅 users 且 mappingBy 為 id 才檢查')
        })

        it('SITE-LI-003 procCore.updateTabItems: users 且 mappingBy 為 id 時以 findLoginIdClashDetail 檢查, 位於 checkUsersWrite 之後、第一個 procOrm 破壞步驟之前', function() {
            let code = readCode('server/procCore.mjs')
            let iCk = code.indexOf('checkUsersWrite(rows')
            let iCl = code.indexOf('findLoginIdClashDetail(')
            let iOrm = code.indexOf('procOrm(userId, keyTable')
            A.ok(iCk > 0 && iCl > iCk && iOrm > iCl, `順序: checkUsersWrite(${iCk}) < findLoginIdClashDetail(${iCl}) < procOrm(${iOrm})`)
            A.ok(code.includes('loginIdCollision'), '拒收鍵 loginIdCollision')
        })

        it('SITE-LI-005 getPermUserInfor 路由之 userId 於 mappingBy 為 id 時經 findLoginUsers 解析(不再直接以內部 id 查找); email／name 維持依內部 id; 多筆拒絕; 位於 getGenUserAndRulesByUserId 之前', function() {
            let code = readCode('server/WWebPerm.mjs')
            let i0 = code.indexOf("path: '/api/getPermUserInfor'")
            A.ok(i0 > 0, '找不到 /api/getPermUserInfor 路由')
            let rest = code.slice(i0)
            let iEnd = rest.indexOf("path: '/syncAndReplaceTabs'") > 0 ? rest.indexOf("path: '/syncAndReplaceTabs'") : rest.length
            let body = rest.slice(0, iEnd)
            let iRes = body.indexOf('resolvePermUserId(')
            let iGet = body.indexOf('getGenUserAndRulesByUserId(')
            A.ok(iRes > 0 && iGet > iRes, `順序: resolvePermUserId(${iRes}) < getGenUserAndRulesByUserId(${iGet})`)
            let fn = takeBody(code, /let resolvePermUserId = async/)
            A.ok(fn.includes('findLoginUsers(') && fn.includes('ambiguousUserFromPerm') && fn.includes('mapKeyOf('), 'resolvePermUserId 須經 findLoginUsers、多筆回 ambiguousUserFromPerm、並以 mapKeyOf 區分模式')
            //getPerm(client 使用者自己)之 userIdSelf 為 getTokenUser 回傳之 perm 內部 id, 不得再經解析(否則外部列以內部 id 查自己會落空)
            let iPerm = code.indexOf("path: '/api/getPerm'")
            let bodyPerm = code.slice(iPerm, code.indexOf("path: '/api/getPermUserInfor'"))
            A.ok(!bodyPerm.includes('resolvePermUserId('), '/api/getPerm 不得經 resolvePermUserId')
            //已解析之列直接採用、不再以內部 id 重讀(外審 sol 第一輪#2: 解析與重讀之間該列可被刪除、同 id 被另一人佔用; 競態不易於行為層穩定重現, 此處以靜態斷言守「傳入解析出之列」與「採用 userPre」)
            A.ok(/getGenUserAndRulesByUserId\(\s*\w+\.userId\s*,\s*\w+\.userFind\s*\)/.test(body), '/api/getPermUserInfor 須把 resolvePermUserId 解析出之列(userFind)傳給 getGenUserAndRulesByUserId')
            let gu = takeBody(code, /let getGenUserAndRulesByUserId = async/)
            A.ok(/userPre !== undefined\) \? userPre : await getGenUserByUserId\(userId\)/.test(gu), 'getGenUserAndRulesByUserId 須在 userPre 非 undefined 時直接採用(含 null＝查無), 否則才依 userId 讀取')
            let rf = takeBody(code, /let resolvePermUserId = async/)
            A.ok(rf.includes('userFind: user') && rf.includes('userFind: null') && rf.includes('userFind: undefined'), 'resolvePermUserId 須回 { userId, userFind }: 命中回該列、查無回 null、email／name 回 undefined')
            //解析函數內只有一次讀取(findLoginUsers), 不得再以任何方式重讀使用者(外審 sol 第二輪#1: 僅斷言回傳欄位字面擋不住 `userFind: user && await getGenUserByUserId(...)` 這類改壞)
            A.equal((rf.match(/\bawait\b/g) || []).length, 1, 'resolvePermUserId 內須恰一個 await(findLoginUsers), 不得再讀取使用者')
            A.ok(!/getGenUser|woItems\.users\.select|\.select\(/.test(rf), 'resolvePermUserId 內不得呼叫 getGenUser*／select(僅經 findLoginUsers)')
        })

        it('SITE-LI-004 procLang 含 loginIdCollision 之 eng 與 cht(不含個資佔位符)', async function() {
            let kp = (await import('../server/procLang.mjs')).default({})
            for (let lang of ['eng', 'cht']) {
                let s = kp[lang].loginIdCollision
                A.ok(typeof s === 'string' && s !== '', `loginIdCollision ${lang}`)
                A.ok(!/\{[a-zA-Z]+\}/.test(s), `${lang} 固定訊息不得含佔位符(不回顯 srcKey／id)`)
            }
        })
    })
})
