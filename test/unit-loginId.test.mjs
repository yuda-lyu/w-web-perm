//users 登入對應 mappingBy='id' 之 O1 規則: 外部列(from 非空)對 srcKey、後台列(from 空)對 id, 撞值收嚴(perm-run04 範圍一; 規則帳本 R-MAPKEY-04; 規格 C:\opensrcOper\dspec\外部匯入之定義與機制.md 第 9 節末)
//
//述語(期望由規格推導, 不照實作現況):
//  L1 登入識別值(loginIdOf): 後台列(from 空)＝id; 外部列(from 非空)＝srcKey(其 id 為本系統配之內部主鍵, 不是登入識別);
//     遷移前之舊外部列(升版前同步寫入、尚無 srcKey)暫以 id(與升版前行為相同, 首次匯入補上 srcKey 後即改以 srcKey).
//  L2 登入查找(findLoginUsers): mappingBy='id'(含預設與不合法值)只匹配 isActive='y' 且 loginIdOf 等於外部 token 使用者 id 之列; 恰 1 筆才登入, 多於 1 筆不取首筆(count>1, user null);
//     'email'／'name' 不變(沿用 select({ [mappingBy]: v, isActive:'y' }) 與 pickUniqueUser); 查詢一律帶 isActive 與對應欄位條件, 不做全表讀取; ORM 例外原樣拋出(不吞, fail-closed).
//  L3 撞值(findLoginIdClash): 同一張表寫入後, 「被本次觸及」之有效(isActive='y')外部列其 srcKey 等於有效後台列之 id、或「被本次觸及」之有效後台列其 id 等於有效外部列之 srcKey → 回第一個被觸及之列索引, 否則 -1;
//     歷史既有(未被觸及)之撞值不擋(否則已有歷史資料之庫無法在後台修復); 停用列不參與; 舊外部列(無 srcKey)與外部列之 id 不參與; 他 from 外部列彼此同 srcKey 不算撞值(只比後台 id).
//受測: server/keyCheck.mjs(loginIdOf／findLoginUsers／findLoginIdClash)、server/WWebPerm.mjs／syncCore.mjs／procCore.mjs 之接線(靜態)、server/procLang.mjs 之 loginIdCollision.
//跑法: npx mocha test/unit-loginId.test.mjs --reporter list --timeout 60000
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { loginIdOf, findLoginUsers, findLoginIdClash } from '../server/keyCheck.mjs'
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

        it('LI-016b 邊界(設計限制, 與 email／name 對應鍵同口徑): 兩來源之外部列同 srcKey 而只有一列有效時, 登入到該有效列; 兩列皆有效時命中兩筆拒絕  [外審 sol#1: 部署須確保 getUserByToken 之使用者 id 在全部來源間唯一]', async function() {
            let t = mkTable([ext('sA', 'shared', 'appA', { isActive: 'n' }), ext('sB', 'shared', 'appB')])
            let r = await findLoginUsers(t, 'id', 'shared')
            A.deepEqual([r.count, idsOf(r)], [1, ['sB']])
            let t2 = mkTable([ext('sA', 'shared', 'appA'), ext('sB', 'shared', 'appB')])
            A.equal((await findLoginUsers(t2, 'id', 'shared')).count, 2)
        })

        it('LI-021 效能不變式: 每次查詢的條件都帶 isActive:"y" 與對應欄位(id 模式為 id、srcKey 各一次), 不做全表 select()', async function() {
            let calls = []
            let t = { select: async (find) => { calls.push(find); return [] } }
            await findLoginUsers(t, 'id', 'v')
            A.ok(calls.length >= 1 && calls.every((c) => c && c.isActive === 'y' && Object.keys(c).length === 2), `id 模式條件: ${JSON.stringify(calls)}`)
            A.deepEqual(calls.map((c) => Object.keys(c).filter((k) => k !== 'isActive')[0]).sort(), ['id', 'srcKey'])
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

        it('LI-030 被觸及的外部列其 srcKey 等於有效後台列之 id → 回該外部列索引', function() {
            let rows = [backend('a1'), ext('sys-1', 'a1')]
            A.equal(findLoginIdClash(rows, only(1)), 1)
        })

        it('LI-031 被觸及的後台列其 id 等於有效外部列之 srcKey → 回該後台列索引', function() {
            let rows = [ext('sys-1', 'a1'), backend('a1')]
            A.equal(findLoginIdClash(rows, only(1)), 1)
        })

        it('LI-032 歷史既有(未被觸及)之撞值不擋; 兩邊都被觸及時回較前者', function() {
            let rows = [backend('a1'), ext('sys-1', 'a1')]
            A.equal(findLoginIdClash(rows, none), -1)
            A.equal(findLoginIdClash(rows, all), 0)
        })

        it('LI-033 停用列不參與: 外部列停用、後台列停用、被觸及者本身停用皆不算撞值; 但停用改啟用(被觸及且有效)算', function() {
            A.equal(findLoginIdClash([backend('a1'), ext('s', 'a1', 'appA', { isActive: 'n' })], all), -1, '外部列停用')
            A.equal(findLoginIdClash([backend('a1', { isActive: 'n' }), ext('s', 'a1')], all), -1, '後台列停用')
            A.equal(findLoginIdClash([backend('a1'), ext('s', 'a1')], only(0)), 0, '後台列有效且被觸及(例: 停用改啟用)')
            A.equal(findLoginIdClash([backend('a1', { isActive: 'n' }), ext('s', 'a1')], only(0)), -1, '被觸及者本身停用')
        })

        it('LI-034 舊外部列(無 srcKey)與外部列的 id 不參與撞值比對', function() {
            A.equal(findLoginIdClash([backend('a1'), legacy('a1x')], all), -1)
            A.equal(findLoginIdClash([backend('sys-1'), ext('sys-1x', 'GUID-1')], all), -1, '外部列的 id 不是登入識別: 後台列 id 不與之比')
            A.equal(findLoginIdClash([backend('GUID-1'), ext('sys-1', 'GUID-1')], all), 0, '但 srcKey 與後台 id 相同即撞')
        })

        it('LI-035 他 from 外部列彼此同 srcKey 不算(只比後台 id; 登入時另由多筆拒絕承擔)', function() {
            A.equal(findLoginIdClash([ext('s1', 'dup', 'appA'), ext('s2', 'dup', 'appB')], all), -1)
        })

        it('LI-036 非物件、缺欄位、非字串值安全略過; 回第一個被觸及且撞值者', function() {
            let rows = [null, undefined, 'x', 5, { id: 'a1' }, backend('a1'), ext('s', 'a1'), ext('s2', 'a1', 'appB')]
            A.equal(findLoginIdClash(rows, all), 5, '第一個被觸及且撞值者(索引 5 的後台列 a1)')
            A.equal(findLoginIdClash([backend(5), ext('s', 5)], all), -1)
            A.equal(findLoginIdClash([], all), -1)
            A.equal(findLoginIdClash(null, all), -1)
        })

        it('LI-038 精確比對與啟用值邊界: 前後空白不同之 srcKey／id 不撞; 啟用值非 \'y\'(\'Y\'、true、1、空字串、缺漏)之列不參與  [外審 sol#5]', function() {
            A.equal(findLoginIdClash([backend('K'), ext('s', ' K ')], all), -1, '空白不同')
            A.equal(findLoginIdClash([backend('K'), ext('s', 'k')], all), -1, '大小寫不同')
            A.equal(findLoginIdClash([backend(' K '), ext('s', ' K ')], all), 0, '空白相同才撞')
            for (let v of ['Y', true, 1, '', undefined]) {
                A.equal(findLoginIdClash([backend('K'), ext('s', 'K', 'appA', { isActive: v })], all), -1, `外部列 isActive=${String(v)}`)
                A.equal(findLoginIdClash([backend('K', { isActive: v }), ext('s', 'K')], all), -1, `後台列 isActive=${String(v)}`)
            }
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

        it('SITE-LI-002 syncCore: users 且 mappingBy 為 id 時以 findLoginIdClash 檢查, 位於第一個 ORM 寫入呼叫之前; 拒收鍵為 loginIdCollision', function() {
            let body = takeBody(readCode('server/syncCore.mjs'), /let syncAndReplaceTabs = async/)
            let iWrite = body.search(/\.(insert|save|del|delAll|mix)\(|\bprocOrm\(/)
            let i = body.indexOf('findLoginIdClash(')
            A.ok(i > 0 && i < iWrite, 'findLoginIdClash( 須位於第一個寫入呼叫之前')
            A.ok(body.indexOf('loginIdCollision') > 0, '拒收鍵 loginIdCollision')
            A.ok(/keyTable === 'users'[\s\S]{0,200}mapKeyOf\(mappingBy\) === null|mapKeyOf\(mappingBy\) === null[\s\S]{0,200}keyTable === 'users'/.test(body), '僅 users 且 mappingBy 為 id 才檢查')
        })

        it('SITE-LI-003 procCore.updateTabItems: users 且 mappingBy 為 id 時以 findLoginIdClash 檢查, 位於 checkUsersWrite 之後、第一個 procOrm 破壞步驟之前', function() {
            let code = readCode('server/procCore.mjs')
            let iCk = code.indexOf('checkUsersWrite(rows')
            let iCl = code.indexOf('findLoginIdClash(')
            let iOrm = code.indexOf('procOrm(userId, keyTable')
            A.ok(iCk > 0 && iCl > iCk && iOrm > iCl, `順序: checkUsersWrite(${iCk}) < findLoginIdClash(${iCl}) < procOrm(${iOrm})`)
            A.ok(code.includes('loginIdCollision'), '拒收鍵 loginIdCollision')
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
