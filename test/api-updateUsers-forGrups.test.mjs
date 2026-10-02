//modeEditUsers='for:grups' 之後端契約測試。對應 spec/流程_後台使用者清單.md〈參數來源〉modeEditUsers 三態。
//述語(R04f/R04g): 給定 settings.modeEditUsers='for:grups':
//  getWebInfor 原樣回 'for:grups'; updateUsers 只採納既有使用者之 cgrups 變更, 身分欄(name/email/isAdmin/isActive)、新增列、缺列、順序以資料庫現值為準。
//  給定 'y'(還原後): updateUsers 整表 diff 寫入不受限(既有 api-updateTabs 覆蓋, 此處只驗 getWebInfor 回 'y' 對照)。
//
//以 restartBackend(genTempSettings({ modeEditUsers: 'for:grups' })) 換設定, after 還原 './settings.json'; DB 以 RPC 還原 base seed。

import assert from 'assert'
import { startApi, TOKEN_ADMIN, getWoItems, callRpc as callRpcShared } from './tools/api-setup.mjs'
import { restartBackend, genTempSettings } from './tools/e2e-setup.mjs'

//callRpc：本檔原一份局部實作，2026-09-28 收斂改呼叫 test/tools/api-setup.mjs 之共用版。差異：共用版 token 為
//必填參數（無預設值），本檔多處呼叫沿用省略第 3 參之慣例（依賴預設 TOKEN_ADMIN）；故此處以薄封裝補回預設值，
//不改共用版本身之行為或回傳形狀（`.output` 兩版皆為 out.msg 原值，本檔斷言只用 `.ok`／`.output`，不受影響）。
const callRpc = (funcName, args, token = TOKEN_ADMIN) => callRpcShared(funcName, args, token)

async function readUsers() {
    let woItems = await getWoItems()
    let rs = await woItems.users.select()
    return rs.slice().sort((a, b) => (a.order || 0) - (b.order || 0))
}

function pick(u) {
    return { id: u.id, name: u.name, email: u.email, isAdmin: u.isAdmin, isActive: u.isActive, cgrups: u.cgrups }
}


describe('api-updateUsers-forGrups', function() {
    this.timeout(300000)

    let usersBase = null

    before(async function() {
        await startApi()
        usersBase = await readUsers()
        assert.strict.ok(usersBase.length >= 2, 'base seed users 應存在')
        await restartBackend(genTempSettings({ modeEditUsers: 'for:grups' }))
    })

    after(async function() {
        //還原設定與資料: 先切回 'y' 才能整表寫回 base seed(for:grups 下新增/刪除/身分欄皆不採納)
        await restartBackend('./settings.json')
        let r = await callRpc('updateUsers', [usersBase.map((u) => ({ ...u }))])
        assert.strict.ok(r.ok, `after 還原 users 失敗: ${JSON.stringify(r)}`)
    })


    //spec: 「後端 getWebInfor 原樣轉送 settings 值」
    it('FG-001-getWebInfor-returns-for-grups', async function() {
        let r = await callRpc('getWebInfor', [])
        assert.strict.ok(r.ok, JSON.stringify(r))
        assert.strict.equal(r.output?.modeEditUsers, 'for:grups')
    })

    //spec: 「只採納既有使用者之 cgrups 變更; 身分欄...以資料庫現值為準」
    it('FG-002-only-cgrups-adopted-identity-kept', async function() {
        let peter = usersBase.find((u) => u.id === 'id-for-peter')
        let cgrupsNew = JSON.stringify({ '權限群組M1': { mode: 'AND', isActive: 'y' }, '權限群組M2': { mode: 'OR', isActive: 'y' } })
        let sent = usersBase.map((u) => (u.id === 'id-for-peter'
            ? { ...u, name: 'PETER-X', email: 'peter-x@example.com', isAdmin: 'y', isActive: 'n', cgrups: cgrupsNew }
            : { ...u }))
        let r = await callRpc('updateUsers', [sent])
        assert.strict.ok(r.ok, `updateUsers 應成功(回 saveTabItemsSuccess), 實得 ${JSON.stringify(r)}`)
        let after = await readUsers()
        let p2 = after.find((u) => u.id === 'id-for-peter')
        assert.strict.equal(p2.cgrups, cgrupsNew, 'cgrups 變更應被採納')
        assert.strict.equal(p2.name, peter.name, 'name 應維持資料庫值')
        assert.strict.equal(p2.email, peter.email, 'email 應維持資料庫值')
        assert.strict.equal(p2.isAdmin, peter.isAdmin, 'isAdmin 應維持資料庫值')
        assert.strict.equal(p2.isActive, peter.isActive, 'isActive 應維持資料庫值')
    })

    //spec: 「新增列、缺列、順序一律以資料庫現值為準」
    it('FG-003-add-delete-reorder-ignored', async function() {
        let before = await readUsers()
        let sent = before.slice().reverse().filter((u) => u.id !== 'id-for-mary').map((u) => ({ ...u }))
        sent.push({ id: 'id-for-newbie', name: 'newbie', email: 'newbie@example.com', isAdmin: 'n', isActive: 'y', cgrups: '' })
        let r = await callRpc('updateUsers', [sent])
        assert.strict.ok(r.ok, JSON.stringify(r))
        let after = await readUsers()
        assert.strict.deepEqual(after.map(pick), before.map(pick), '列集合、順序與身分欄皆應與資料庫現值相同(無新增、無刪除、無重排)')
    })

})
