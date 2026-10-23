//授權合併規格之 API 層抽驗(第 101 項 run04): 單元層(unit-authMerge)的代表格,經真後端 syncAndReplaceTabs 寫入、getPermUserInfor 查詢,結果須與單元層一致.
//
//【規格】sgud/rule/rulebook.md 之 R-AUTH-MERGE-00(未給＝n、OR 聯集後與所有 AND 交集、與排列順序無關; ADR-033). 規則說明與窮舉見 unit-authMerge.test.mjs 檔頭.
//前身為 run01 之現況刻畫(api-authMerge-characterize, 預期值為舊規則之順序相依結果), 2026-10-21 依使用者最終裁示改為規格; 各案「舊規則」結果見 CASES 註解.
//做法: 以 tools/authMerge.mjs 的 buildData 由規格組出四表字串 → POST /syncAndReplaceTabs(全量取代本檔專屬 from)→ 唯讀 select 讀回,
//  ①授權字串(crules／cpemis／cgrups)逐字不變(後端不改寫、不補齊稠密)②getPermUserInfor 回傳之 rules 等於單元層對讀回資料呼叫 getUserRules 之結果 ③等於本檔寫死之規格預期值.
//DB 斷言一律 getWoItems() 後唯讀 select; 本檔專屬 from 於 after 經 cleanExternalFixtures 清除(base seed 不動).

import assert from 'assert'
import { startApi, urlSync, urlGetPermUserInfor, TOKEN_APP, getWoItems, cleanExternalFixtures } from './tools/api-setup.mjs'
import getPermUserInfor from '../src/getPermUserInfor.mjs'
import { getUserRules } from '../src/plugins/mShare.mjs'
import { buildData } from './tools/authMerge.mjs'


const F = 'appTest-chm'
const T = ['chm-T1', 'chm-T2', 'chm-T3']

/** 'T2:y T3:n' → [['chm-T2','y'], ['chm-T3','n']] */
let R = (s) => (s === '' ? [] : s.split(' ').map((x) => [`chm-${x.split(':')[0]}`, x.split(':')[1]]))
let g = (name, mode, perms, extra = {}) => ({ name, mode, active: 'y', perms, ...extra })
let p = (name, mode, rules) => ({ name, mode, active: 'y', rules: R(rules) })

let PA = (n, mode = 'AND') => p(n, mode, 'T2:y T3:y') //權限: 可用 T2、T3
let PB = (n, mode = 'AND') => p(n, mode, 'T1:y T2:y') //權限: 可用 T1、T2

//案例: id → { spec, want(規格預期之 y 標的集合, 去掉 chm- 前綴) }; 註解「舊規則」為 2026-10-21 前(ADR-001 非對稱)之結果, 僅供對照
const CASES = [
    //權限層: 群組內兩個稀疏 AND 權限, 順序相反——交集 {T2}, 與順序無關(舊規則: T2,T3／T1,T2)
    ['perm-ab', { groups: [g('chm-Gab', 'OR', [PA('chm-PA'), PB('chm-PB')])] }, 'T2'],
    ['perm-ba', { groups: [g('chm-Gba', 'OR', [PB('chm-PB'), PA('chm-PA')])] }, 'T2'],
    //群組層: 使用者兩個 AND 群組(各含單一權限), 順序相反(舊規則: T2,T3／T1,T2)
    ['grup-ab', { groups: [g('chm-GA', 'AND', [PA('chm-PA2', 'OR')]), g('chm-GB', 'AND', [PB('chm-PB2', 'OR')])] }, 'T2'],
    ['grup-ba', { groups: [g('chm-GB', 'AND', [PB('chm-PB2', 'OR')]), g('chm-GA', 'AND', [PA('chm-PA2', 'OR')])] }, 'T2'],
    //稠密對照: 順序無關(新舊規則相同)
    ['dense-12', { groups: [g('chm-Gd12', 'OR', [p('chm-PD1', 'AND', 'T1:y T2:y T3:n'), p('chm-PD2', 'AND', 'T1:y T2:n T3:y')])] }, 'T1'],
    ['dense-21', { groups: [g('chm-Gd21', 'OR', [p('chm-PD2', 'AND', 'T1:y T2:n T3:y'), p('chm-PD1', 'AND', 'T1:y T2:y T3:n')])] }, 'T1'],
    //有 OR + 稀疏 AND: AND 未列之 T1 視為 n 而被收回(舊規則: T1,T2——AND 未列不約束)
    ['or-sparse', { groups: [g('chm-Go', 'OR', [p('chm-PO', 'OR', 'T1:y T2:y'), p('chm-PX', 'AND', 'T2:y')])] }, 'T2'],
    //尚未指派權限之空 AND 群組＝全部 n: 排前排後皆全 n(舊規則: 排前全 n; 排後 T1,T2,T3)
    ['empty-first', { groups: [g('chm-GE', 'AND', []), g('chm-GR', 'AND', [p('chm-PR', 'OR', 'T1:y T2:y T3:y')])] }, ''],
    ['empty-last', { groups: [g('chm-GR', 'AND', [p('chm-PR', 'OR', 'T1:y T2:y T3:y')]), g('chm-GE', 'AND', [])] }, ''],
    //陣列形式(權限名非整數式): 與物件形式同結果(舊規則: T1,T2)
    ['arr-ba', { form: 'arr', groups: [g('chm-Garr', 'OR', [PB('chm-PB3'), PA('chm-PA3')])] }, 'T2'],
    //孤兒管理對象(crules 列出 chm-TX, targets 無): 不輸出、不影響(舊規則: T2,T3)
    ['orphan', { groups: [g('chm-Gorp', 'OR', [p('chm-PAo', 'AND', 'T2:y T3:y TX:y'), PB('chm-PB')])] }, 'T2'],
    //整數式權限名: 物件形式與陣列形式結果相同(舊規則: 物件形式 T2,T3 無法保留儲存順序; 陣列形式 T1,T2)
    ['int-obj', { groups: [g('chm-Gint', 'OR', [PA('9101'), PB('9102')], { cpemisRaw: `{"9102":{"mode":"AND","isActive":"y"},"9101":{"mode":"AND","isActive":"y"}}` })] }, 'T2'],
    ['int-arr', { groups: [g('chm-Gint2', 'OR', [PA('9101'), PB('9102')], { cpemisRaw: `[{"name":"9102","mode":"AND","isActive":"y"},{"name":"9101","mode":"AND","isActive":"y"}]` })] }, 'T2'],
]


const F2 = 'appTest-chm2' //「同步入口是否驗授權字串內容」專用分區(同步為整區全量取代, 不可與 F 共用)

let postSync = async (keyTable, rows, from = F) => {
    let url = urlSync.replace('{keyTable}', keyTable).replace('{token}', TOKEN_APP)
    let res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ from, rows }) })
    return await res.json()
}

let ysOf = (rules) => rules.filter((x) => x.name.startsWith('chm-T') && x.isActive === 'y').map((x) => x.name.slice(4)).sort().join(',')

/** 本檔管理對象(chm-T*)之完整 [name, isActive] 對應(含 n; 依輸出順序), 供完整 rules 相等比對 */
let mineOf = (rules) => rules.filter((x) => x.name.startsWith('chm-T')).map((x) => [x.name, x.isActive])


describe('api-authMerge - 授權合併規格(R-AUTH-MERGE-00)之 API 層抽驗', function() {
    this.timeout(120000)

    let sent = { users: [], grups: [], pemis: [], targets: [] }

    before(async function() {
        this.timeout(200000)
        await startApi()

        //組四表(群組／權限依名稱去重, 同名須同內容)
        let byName = { grups: new Map(), pemis: new Map() }
        let put = (kind, row, key) => {
            let old = byName[kind].get(row.name)
            if (old) {
                assert.strictEqual(old[key], row[key], `${kind} ${row.name} 同名但內容不同`)
                return
            }
            byName[kind].set(row.name, row)
        }
        CASES.forEach(([id, spec], k) => {
            let d = buildData(spec, T)
            d.grups.forEach((x) => put('grups', x, 'cpemis'))
            d.pemis.forEach((x) => put('pemis', x, 'crules'))
            sent.users.push({ id: `id-chm-${id}`, order: k, name: `chm-${id}`, email: `chm-${id}@appTest.com`, description: '', from: F, cgrups: d.user.cgrups, isAdmin: 'n', isActive: 'y' })
        })
        let order = 0
        sent.grups = [...byName.grups.values()].map((x) => ({ id: `id-${x.name}`, order: order++, name: x.name, description: '', from: F, cpemis: x.cpemis }))
        sent.pemis = [...byName.pemis.values()].map((x) => ({ id: `id-${x.name}`, order: order++, name: x.name, description: '', from: F, crules: x.crules }))
        sent.targets = T.map((id, k) => ({ id, order: k, description: '', from: F }))

        for (let kt of ['targets', 'pemis', 'grups', 'users']) {
            let res = await postSync(kt, sent[kt])
            assert.strictEqual(res.state, 'success', `${kt} 推送應成功: ${JSON.stringify(res)}`)
        }
    })

    after(async function() {
        this.timeout(60000)
        await cleanExternalFixtures({ froms: [F, F2] }) //外部列夾具收尾之單一入口(R-TEST-EXT-CLEAN-01)
    })

    it('API-chm-099-同步入口對授權字串內容不設限: 空字串、非 JSON、截斷、型別錯誤之 crules／cpemis／cgrups 皆被接受並逐字存入(外審 sol R13；故這類字串是實務上可達的輸入)', async function() {
        const bad = ['not json', '{"chm-T1":', '[1,2,3]', 'null', '{"__proto__":"y"}']
        let rows = { pemis: [], grups: [], users: [] }
        bad.forEach((s, k) => {
            rows.pemis.push({ id: `id-chm2-p${k}`, order: k, name: `chm2-p${k}`, description: '', from: F2, crules: s })
            rows.grups.push({ id: `id-chm2-g${k}`, order: k, name: `chm2-g${k}`, description: '', from: F2, cpemis: s })
            rows.users.push({ id: `id-chm2-u${k}`, order: k, name: `chm2-u${k}`, email: `chm2-u${k}@appTest.com`, description: '', from: F2, cgrups: s, isAdmin: 'n', isActive: 'y' })
        })
        for (let kt of ['pemis', 'grups', 'users']) {
            let res = await postSync(kt, rows[kt], F2)
            assert.strictEqual(res.state, 'success', `${kt} 含損壞字串之推送應成功(現況: 不驗內容), 實得: ${JSON.stringify(res)}`)
        }
        let woItems = await getWoItems()
        let back = { pemis: await woItems.pemis.select({ from: F2 }), grups: await woItems.grups.select({ from: F2 }), users: await woItems.users.select({ from: F2 }) }
        bad.forEach((s, k) => {
            assert.strictEqual(back.pemis.find((x) => x.id === `id-chm2-p${k}`).crules, s)
            assert.strictEqual(back.grups.find((x) => x.id === `id-chm2-g${k}`).cpemis, s)
            assert.strictEqual(back.users.find((x) => x.id === `id-chm2-u${k}`).cgrups, s)
        })
        //查詢端不因損壞字串而失敗: 該使用者的有效權限為全 n(fail-safe)
        for (let k = 0; k < bad.length; k++) {
            let ur = await getPermUserInfor(urlGetPermUserInfor, TOKEN_APP, `id-chm2-u${k}`)
            assert.ok(ur.rules.every((x) => x.isActive === 'n'), `損壞 cgrups #${k} → 全 n`)
        }
    })

    it('API-chm-000-授權字串經後端寫入後讀回逐字不變(後端不改寫、不補齊稠密、不重排)', async function() {
        let woItems = await getWoItems()
        let rows = {}
        for (let kt of ['users', 'grups', 'pemis', 'targets']) {
            rows[kt] = await woItems[kt].select({ from: F })
        }
        let by = (kt, id) => rows[kt].find((x) => x.id === id)
        sent.pemis.forEach((x) => assert.strictEqual(by('pemis', x.id).crules, x.crules, `pemis ${x.name}`))
        sent.grups.forEach((x) => assert.strictEqual(by('grups', x.id).cpemis, x.cpemis, `grups ${x.name}`))
        sent.users.forEach((x) => assert.strictEqual(by('users', x.id).cgrups, x.cgrups, `users ${x.name}`))
        assert.strictEqual(rows.targets.length, 3)
    })

    CASES.forEach(([id, spec, want]) => {
        it(`API-chm-${id}-經 getPermUserInfor 查得之授權 = 單元層對讀回資料之 getUserRules = 規格預期 {${want}}`, async function() {
            //①API
            let ur = await getPermUserInfor(urlGetPermUserInfor, TOKEN_APP, `id-chm-${id}`)
            assert.ok(Array.isArray(ur.rules))
            assert.ok(!ur.rules.some((x) => x.name === 'chm-TX'), '孤兒管理對象不輸出')
            let apiYs = ysOf(ur.rules)

            //②單元層: 對 DB 讀回之資料呼叫真函數
            let woItems = await getWoItems()
            let users = await woItems.users.select({ from: F })
            let grups = await woItems.grups.select({ from: F })
            let pemis = await woItems.pemis.select({ from: F })
            let targets = await woItems.targets.select({ from: F })
            let unit = getUserRules(users.find((x) => x.id === `id-chm-${id}`), grups, pemis, targets)
            assert.strictEqual(ysOf(unit.rules), apiYs, '單元層與 API 層須一致')
            //完整 rules(含 n 與輸出順序)相等: 現存管理對象各一筆、依 targets 順序(外審 sol R12: 只比 y 集合會漏掉缺項／額外項／非 y／n 之值)
            assert.deepStrictEqual(mineOf(ur.rules), mineOf(unit.rules), 'API 與單元層之完整 rules 須相等')
            assert.deepStrictEqual(mineOf(ur.rules).map(([n]) => n), T, '現存管理對象各一筆且依 targets 順序')
            assert.ok(mineOf(ur.rules).every(([, v]) => v === 'y' || v === 'n'))

            //③規格預期(R-AUTH-MERGE-00)
            assert.strictEqual(apiYs, want, `${id}: spec 見 CASES`)
            assert.ok(spec.groups.length > 0)
        })
    })

})
