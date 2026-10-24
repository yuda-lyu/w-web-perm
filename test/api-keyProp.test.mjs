//資料驅動之規則名轉屬性鍵(規則帳本 R-KEY-PROP-01, ADR-032; 來源: run02 設計一致性盤查 F-25): 經真後端、真 HTTP 的端到端不變式
//
//外部應用(或直接呼叫後台整表寫入 API)可寫入「合法 JSON 但規則名不可轉為屬性鍵」的 crules(如 [{"name":{"toString":null},"isActive":"y"}]);
//修前 mergeRules 的 kpRule[vv.name] 拋 TypeError: Cannot convert object to primitive value, 使「所有使用該權限之使用者」的
//getPermUserInfor／getPerm 整個失敗, 且 r.msg = r.msg.message 把引擎原文經 HTTP 回給外部應用(CLAUDE.md 「錯誤一律回 key」)。
//修後: 該元素略過、其餘規則照常授權、回應不含引擎原文。
//
//夾具: from=appKeyProp 之 pemis／grups／users 各一列(經 /syncAndReplaceTabs 寫入, app token), 標的用 base seed 之前兩個標的; 檔尾以 restoreTables 還原三表(擷取 ↔ 還原對稱)。
//  perm-run03(外部匯入改依 srcKey 差異同步, R-IMPORT-01): 夾具列只帶 srcKey(不帶 id, 帶了整批拒收 idNotAllowed); 每案重送同一 srcKey 之列＝修改既有列(id 不變), 使用者之 id 由伺服端產生, 依 srcKey 讀回後查詢。
//跑法: npx mocha test/api-keyProp.test.mjs --timeout 120000
import assert from 'assert'
import { startApi, apiBaseUrl, TOKEN_APP, TOKEN_ADMIN, callRpc, readTables, restoreTables, selectAllRows } from './tools/api-setup.mjs'

const FROM = 'appKeyProp'
const SK_U = 'sk-kp-u' //夾具使用者之來源鍵(其庫內 id 由伺服端產生, 見 seed 回傳值)
const T_ON = '專案A/頁A/區塊A'
const T_ON2 = '專案A/頁A/區塊A/分析按鈕'
const T_OFF = '專案A/頁A/區塊A/執行按鈕'
const ON = { mode: 'OR', isActive: 'y' }

//crules 為陣列形式字串; poison 為合法 JSON 但屬性鍵轉型必拋之 name
const crulesOf = (poison) => JSON.stringify([
    { name: T_ON, isActive: 'y' },
    ...(poison === undefined ? [] : [{ name: poison, isActive: 'y' }]),
    { name: T_ON2, isActive: 'y' },
])

//seed: 回傳夾具使用者查詢 getPermUserInfor 用之 userId; perm-run05 起 mappingBy 為 id 時 userId 依登入對應解析, 外部列傳其 srcKey(不是伺服端產生之內部 id; 內部 id 查無而回空權限)
async function seed(crules) {
    const FIX = {
        pemis: [{ srcKey: 'sk-kp-p', order: 300, name: 'kp-p', crules }],
        grups: [{ srcKey: 'sk-kp-g', order: 300, name: 'kp-g', cpemis: JSON.stringify({ 'kp-p': ON }) }],
        users: [{ srcKey: SK_U, order: 300, name: 'kp-u', email: 'kp-u@example.com', isAdmin: 'n', isActive: 'y', cgrups: JSON.stringify({ 'kp-g': ON }) }],
    }
    for (const kt of ['pemis', 'grups', 'users']) {
        const url = `${apiBaseUrl}/syncAndReplaceTabs?keyTable=${kt}&token=${encodeURIComponent(TOKEN_APP)}`
        const res = await (await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ from: FROM, rows: FIX[kt].map((v) => ({ ...v, from: FROM })) }) })).json()
        assert.ok(res.state === 'success', `夾具 ${kt} 寫入應成功, 實得 ${JSON.stringify(res)}`)
    }
    const u = (await selectAllRows('users')).find((v) => v.srcKey === SK_U)
    assert.ok(u && typeof u.id === 'string' && u.id !== '', '依 srcKey 應讀回夾具使用者列')
    return u.srcKey
}

//裸 HTTP 取 getPermUserInfor 的原始回應(不經 client SDK, 以便檢視 msg 原文)
async function getInfor(userId) {
    const url = `${apiBaseUrl}/api/getPermUserInfor?token=${encodeURIComponent(TOKEN_APP)}&userId=${encodeURIComponent(userId)}`
    const text = await (await fetch(url)).text()
    return { text, body: JSON.parse(text) }
}

const rulesMap = (rules) => Object.fromEntries(rules.map((v) => [v.name, v.isActive]))
//庫內現有標的數(以資料通道 select 實取, 不綁常數: targets 不在 readTables／restoreTables 之還原範圍)
const countTargets = async () => (await callRpc('targets.select', [], TOKEN_ADMIN)).output.length


describe('api-keyProp (資料驅動之規則名轉屬性鍵, R-KEY-PROP-01)', function() {
    this.timeout(120000)

    let snap0 = null

    before(async function() {
        this.timeout(200000)
        await startApi()
        snap0 = await readTables()
    })

    after(async function() {
        this.timeout(120000)
        if (snap0) {
            //run07(F-23): 夾具為外部列(from=appKeyProp, 經同步灌入), 後台整表寫入不得刪除外部列, 故 restoreTables 內先以 purgeExternalRows 移除快照以外之外部列再寫回(本檔之測試意圖為授權資料之容錯, 與外部列守門無關, 夾具維持外部列)
            await restoreTables(snap0) //服務之收尾由 e2e-setup 註冊之 root after 負責
        }
    })

    it('API-KP-000-對照組: 無不可轉鍵 name 之 crules(陣列形式) → success, T_ON／T_ON2 為 y、T_OFF 為 n', async function() {
        const uid = await seed(crulesOf())
        const { body } = await getInfor(uid)
        assert.strictEqual(body.state, 'success', JSON.stringify(body))
        const m = rulesMap(body.msg.rules)
        assert.strictEqual(m[T_ON], 'y')
        assert.strictEqual(m[T_ON2], 'y')
        assert.strictEqual(m[T_OFF], 'n')
        assert.strictEqual(body.msg.rules.length, await countTargets(), 'rules 須含全部標的(以 targets 為輸出主軸)')
    })

    it('API-KP-001-crules 含不可轉鍵 name 之元素({"toString":null}、{"toString":5}、巢狀於陣列內) → state=success 且其餘規則照常授權, 回應不含引擎原文(修前 state=error、msg 為 Cannot convert object to primitive value)', async function() {
        for (const poison of [{ toString: null }, { toString: 5 }, [{ toString: null }]]) {
            const uid = await seed(crulesOf(poison))
            const { text, body } = await getInfor(uid)
            const label = `name=${JSON.stringify(poison)}: ${text.slice(0, 300)}`
            assert.strictEqual(body.state, 'success', label)
            const m = rulesMap(body.msg.rules)
            assert.strictEqual(m[T_ON], 'y', label)
            assert.strictEqual(m[T_ON2], 'y', label)
            assert.strictEqual(m[T_OFF], 'n', label)
            assert.strictEqual(body.msg.rules.length, await countTargets(), `rules 須含全部標的(不因略過元素而少列): ${label}`)
            assert.ok(!/Cannot convert|primitive value|TypeError/i.test(text), `回應不得含引擎原文: ${label}`)
        }
    })

    it('API-KP-002-壞 JSON 之 crules 仍降級為全 n 且 state=success(容錯成立, 迴歸)', async function() {
        const uid = await seed('{oops')
        const { text, body } = await getInfor(uid)
        assert.strictEqual(body.state, 'success', text.slice(0, 300))
        assert.strictEqual(body.msg.rules.length, await countTargets(), '壞 JSON 降級後仍須回傳全部標的(不得退化為空 rules)')
        assert.ok(body.msg.rules.every((v) => v.isActive === 'n'), '壞 JSON → 全 n')
        assert.strictEqual(body.msg.user.srcKey, uid, '查得夾具使用者本人(傳錯鍵時 user 無 srcKey 而回空權限, 「全 n」斷言會空轉; perm-run05)')
    })

})
