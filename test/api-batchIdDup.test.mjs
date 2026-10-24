//後台整表寫入之同批重複 id(perm-run01 範圍二; 真後端, 經資料通道 RPC): 四表一併檢查, 同批兩列同 id 即整批拒收 saveRowFieldDuplicate、零寫入。
//來源: perm-run05 確證 users 整表寫入時同批兩列同 id 被合併為一列而回成功、靜默遺失其一(pemis／grups／targets 早已拒收; 規則帳本 R-WRITE-ID-UNIQ-01)。
//輸入空間: 表 {users, grups, pemis, targets} × 形狀 {既有 id 在批內出現兩次〔內容不同〕, 兩列新增列同一個庫內不存在之 id} × 模式 {整表 diff, users 之 pickKeysOnly(modeEditUsers=for:grups)}。
//單元層(含數字／字串同值 id、srLog 不含資料值)見 unit-procCore-writeValidate WV-DUPID-*; 本檔驗證端到端: 回前端之 key、資料表零變更、管理員對照組成功。
//跑法(需測試鎖): node C:/opensrcOper/tools/quiet-run.mjs --name tdup --lock --timeout 1800 -- npx mocha test/api-batchIdDup.test.mjs --timeout 300000
import assert from 'assert'
import { assertPristineSeed } from './tools/baseSeed.mjs'
import { startApi, TOKEN_ADMIN, callRpc, readTables, selectAllRows, purgeExternalRows } from './tools/api-setup.mjs'
import { restartBackend, genTempSettings } from './tools/e2e-setup.mjs'

const A = assert.strict
const KTS = ['users', 'grups', 'pemis', 'targets']
const FN = { users: 'updateUsers', grups: 'updateGrups', pemis: 'updatePemis', targets: 'updateTargets' }

let clone = (o) => JSON.parse(JSON.stringify(o))
let byId = (a, b) => String(a.id).localeCompare(String(b.id))
let byOrder = (a, b) => ((a.order || 0) - (b.order || 0)) || byId(a, b)
let rowsOf = async (kt) => (await selectAllRows(kt)).slice().sort(byOrder).map(clone)
let snapKt = async (kt) => JSON.stringify((await selectAllRows(kt)).slice().sort(byId))
let snap4 = async () => JSON.stringify(await Promise.all(KTS.map(snapKt)))

//以既有第 1 列為底造一列同 id、內容不同之列(名稱／email 另取, 使其不因其他唯一性檢查而先被拒)
let tweak = (kt) => (kt === 'users' ? { email: 'dup-copy@example.com', description: 'dup-copy' } : (kt === 'targets' ? { description: 'dup-copy' } : { name: `${kt}-dup-copy`, description: 'dup-copy' }))
//新增列(id 由呼叫端給)
let newRowOf = (kt, id, tag) => {
    let base = { id, order: 0, description: `dup-${tag}`, from: '' }
    if (kt === 'users') {
        return { ...base, name: `dup-${tag}`, email: `dup-${tag}@example.com`, cgrups: '{}', isAdmin: 'n', isActive: 'y' }
    }
    if (kt === 'grups') {
        return { ...base, name: `grups-dup-${tag}`, cpemis: '{}' }
    }
    if (kt === 'pemis') {
        return { ...base, name: `pemis-dup-${tag}`, crules: '{}' }
    }
    return base
}


describe('api-batchIdDup (後台整表寫入之同批重複 id 整批拒收, perm-run01 範圍二, 真後端)', function() {
    this.timeout(300000)

    let BASE = null

    let restoreBase = async () => {
        await purgeExternalRows(KTS, { keepIds: Object.fromEntries(KTS.map((kt) => [kt, BASE[kt].map((r) => r.id)])) })
        for (let kt of ['targets', 'pemis', 'grups', 'users']) {
            let r = await callRpc(FN[kt], [clone(BASE[kt])], TOKEN_ADMIN)
            if (!r.ok) {
                throw new Error(`restoreBase ${FN[kt]} 失敗: ${JSON.stringify(r).slice(0, 200)}`)
            }
        }
    }

    before(async function() {
        this.timeout(300000)
        await startApi()
        for (let kt of KTS) {
            assertPristineSeed(kt, await selectAllRows(kt))
        }
        BASE = await readTables()
        BASE.targets = await rowsOf('targets')
    })

    afterEach(async function() {
        this.timeout(120000)
        await restoreBase()
    })

    after(async function() {
        this.timeout(300000)
        await restartBackend('./settings.json')
        await restoreBase()
    })

    for (let kt of KTS) {
        it(`BD-001 [${kt}] 既有列之 id 在同批出現兩次(內容不同) → saveRowFieldDuplicate、四表零寫入`, async function() {
            let before = await snap4()
            let rows = await rowsOf(kt)
            rows.push({ ...rows[0], ...tweak(kt) })
            let r = await callRpc(FN[kt], [rows], TOKEN_ADMIN)
            A.equal(r.ok, false, JSON.stringify(r).slice(0, 200))
            A.equal(r.msg, 'saveRowFieldDuplicate')
            A.equal(await snap4(), before, '零寫入')
        })

        it(`BD-002 [${kt}] 兩列新增列帶同一個庫內不存在之 id → saveRowFieldDuplicate、四表零寫入; 對照: id 唯一之兩列新增成功`, async function() {
            let before = await snap4()
            let id = kt === 'targets' ? '專案Z/頁Z/區塊Z' : 'id-bd-new'
            let rows = (await rowsOf(kt)).concat([newRowOf(kt, id, 'a'), newRowOf(kt, id, 'b')])
            let r = await callRpc(FN[kt], [rows], TOKEN_ADMIN)
            A.equal(r.ok, false, JSON.stringify(r).slice(0, 200))
            A.equal(r.msg, 'saveRowFieldDuplicate')
            A.equal(await snap4(), before, '零寫入')
            //對照組: 只差 id 不同
            let ids = kt === 'targets' ? ['專案Z/頁Z/區塊Z1', '專案Z/頁Z/區塊Z2'] : ['id-bd-new-1', 'id-bd-new-2']
            let rowsOk = (await rowsOf(kt)).concat([newRowOf(kt, ids[0], 'a'), newRowOf(kt, ids[1], 'b')])
            let ok = await callRpc(FN[kt], [rowsOk], TOKEN_ADMIN)
            A.equal(ok.ok, true, JSON.stringify(ok).slice(0, 300))
            let after = await rowsOf(kt)
            A.ok(after.some((x) => x.id === ids[0]) && after.some((x) => x.id === ids[1]), '兩列新增列皆寫入')
        })
    }

    it('BD-003 [users, pickKeysOnly(modeEditUsers=for:grups)] 批內同一個既有 id 出現兩次(cgrups 不同) → saveRowFieldDuplicate、零寫入; 對照: 每個 id 一列照常', async function() {
        await restartBackend(genTempSettings({ modeEditUsers: 'for:grups' }))
        try {
            let before = await snap4()
            let rows = await rowsOf('users')
            let g1 = JSON.stringify({ '權限群組M1': { mode: 'OR', isActive: 'y' } })
            let g2 = JSON.stringify({ '權限群組M2': { mode: 'OR', isActive: 'y' } })
            let target = rows.find((u) => u.id === 'id-for-peter')
            let dupRows = rows.map((u) => (u.id === target.id ? { ...u, cgrups: g1 } : u)).concat([{ ...target, cgrups: g2 }])
            let r = await callRpc('updateUsers', [dupRows], TOKEN_ADMIN)
            A.equal(r.ok, false, JSON.stringify(r).slice(0, 200))
            A.equal(r.msg, 'saveRowFieldDuplicate')
            A.equal(await snap4(), before, '零寫入')
            //對照組: 每個 id 一列 → 成功, peter 之 cgrups 依送入列採納
            let okRows = rows.map((u) => (u.id === target.id ? { ...u, cgrups: g2 } : u))
            let ok = await callRpc('updateUsers', [okRows], TOKEN_ADMIN)
            A.equal(ok.ok, true, JSON.stringify(ok).slice(0, 300))
            let peter = (await rowsOf('users')).find((u) => u.id === target.id)
            A.deepEqual(JSON.parse(peter.cgrups), JSON.parse(g2), '對照組之 cgrups 已採納')
        }
        finally {
            await restartBackend('./settings.json')
        }
    })
})
