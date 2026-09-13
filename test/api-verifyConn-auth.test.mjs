//資料通道(/api/main)授權對稱契約測試。對應 spec/流程_後台使用者清單.md〈spec 規則摘要〉權限條、WWebPerm.mjs p.checkToken 註解。
//述語(R05): verifyConn 與登入入口(api/getUserByToken)採同一授權強度——
//  外部 token 有效但不在 perm users 表 → 拒; 在表但 isActive='n' → 拒; 在表且有效但 verifyClientUser 拒 → 拒; 在表、有效、允許 → 通。
//  api/getPerm 行為不變(既有 api-getPerm 測試覆蓋), syncAndReplaceTabs 不經 verifyConn(既有 api-syncAndReplaceTabs 覆蓋)。
//
//背景: 2026-09-07 前 verifyConn 只驗外部 token 欄位齊備, 不查 perm users 與 isActive, 亦不經 verifyClientUser;
//實測 app token(不在表)可寫 grups、admin 自停用後仍可讀寫並自我復活(tmp/probe-report.json A3/A4)。本檔為該缺陷之重現測試(修正前紅、修正後綠)。
//
//callRpc 仿 api-updateTabs.test.mjs(直打 POST /api/main, obj2u8arr 編碼); 傳輸層拒絕時回 {error:'permission denied'}。
//AUTH-003 需把 admin 自己停用, 停用後所有通道皆拒、無法經 RPC 還原, 故 after 以 restartBackend(reseed) 重建 base seed。

import assert from 'assert'
import obj2u8arr from 'wsemi/src/obj2u8arr.mjs'
import u8arr2obj from 'wsemi/src/u8arr2obj.mjs'
import { startApi, apiBaseUrl, TOKEN_ADMIN, TOKEN_APP, TOKEN_PETER, TOKEN_BAD, getWoItems } from './tools/api-setup.mjs'
import { restartBackend } from './tools/e2e-setup.mjs'


async function callRpc(funcName, args, token) {
    let payload = { func: funcName, input: { __sysInputArgs__: args, __sysToken__: token } }
    let body = Buffer.from(obj2u8arr(payload))
    let r = await fetch(`${apiBaseUrl}/api/main`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
        body,
    })
    let ab = await r.arrayBuffer()
    let respObj = u8arr2obj(new Uint8Array(ab))
    if (respObj && typeof respObj === 'object') {
        if ('error' in respObj) {
            return { ok: false, state: 'error', msg: String(respObj.error) }
        }
        if ('success' in respObj) {
            //kpFunExt 回傳包成 { state, msg }; msg 為回傳值本體(getWebInfor 為物件, updateXxx 為 key 字串)
            let out = respObj.success?.output
            if (out && typeof out === 'object' && 'state' in out) {
                return { ok: out.state === 'success', state: out.state, msg: typeof out.msg === 'string' ? out.msg : JSON.stringify(out.msg), output: out.msg }
            }
            return { ok: true, state: 'success', output: out }
        }
    }
    return { ok: false, state: 'error', msg: `unparseable response: ${JSON.stringify(respObj)}` }
}

async function readTable(keyTable) {
    let woItems = await getWoItems()
    return await woItems[keyTable].select()
}

function sortByOrder(rs) {
    return rs.slice().sort((a, b) => (a.order || 0) - (b.order || 0))
}


describe('api-verifyConn-auth', function() {
    this.timeout(300000)

    let grupsBase = null
    let adminStopped = false

    before(async function() {
        await startApi()
        grupsBase = sortByOrder(await readTable('grups'))
        assert.strict.ok(grupsBase.length > 0, 'base seed grups 應存在')
    })

    after(async function() {
        //AUTH-003 停用 admin 後無任何 token 可經 RPC 還原 → 以 hermetic reseed 重建 base seed(見 e2e-setup restartBackend opts.reseed)
        if (adminStopped) {
            await restartBackend('./settings.json', { reseed: true })
            //本進程 getWoItems() 持有 lmdb 時 seedDb 無法刪 ./db 而改為 upsert seed, 仍須回驗 admin 已恢復有效
            let admin = (await readTable('users')).find((u) => u.id === 'id-for-admin')
            assert.strict.equal(admin?.isActive, 'y', 'after: reseed 後 admin 應恢復 isActive=y')
        }
    })


    //spec: 「token 無效 / 過期一律拒絕連線」(既有行為, 對照組)
    it('AUTH-000-invalid-token-rejected', async function() {
        let r = await callRpc('getWebInfor', [], TOKEN_BAD)
        assert.strict.equal(r.ok, false)
        assert.strict.equal(r.msg, 'permission denied')
    })

    //spec: 允許之使用者(在表、有效、verifyClientUser 通過)可讀可寫(對照組)
    it('AUTH-001-admin-in-table-active-allowed', async function() {
        let r = await callRpc('getWebInfor', [], TOKEN_ADMIN)
        assert.strict.ok(r.ok, `admin 應可讀, 實得 ${JSON.stringify(r)}`)
        assert.strict.equal(r.output?.modeEditUsers, 'y', 'getWebInfor 應回 settings 之 modeEditUsers')
    })

    //spec: 外部 token 有效但不在 perm users 表 → 拒(讀與寫皆拒, DB 不變)
    it('AUTH-002-app-token-not-in-perm-users-rejected', async function() {
        let rRead = await callRpc('getWebInfor', [], TOKEN_APP)
        assert.strict.equal(rRead.ok, false, `不在 perm users 表之外部使用者不得讀資料通道, 實得 ${JSON.stringify(rRead)}`)
        assert.strict.equal(rRead.msg, 'permission denied')

        let rowsMod = grupsBase.map((g, k) => (k === 0 ? { ...g, description: String(g.description || '') + '_AUTH002' } : { ...g }))
        let rWrite = await callRpc('updateGrups', [rowsMod], TOKEN_APP)
        assert.strict.equal(rWrite.ok, false, `不在 perm users 表之外部使用者不得寫資料通道, 實得 ${JSON.stringify(rWrite)}`)
        let after = sortByOrder(await readTable('grups'))
        assert.strict.equal(after[0].description, grupsBase[0].description, 'DB grups 不得被改')
    })

    //spec: 在表、有效、但 verifyClientUser 拒(開發樣本限 isAdmin='y') → 拒
    it('AUTH-004-peter-in-table-active-but-verifyClientUser-rejects', async function() {
        let users = await readTable('users')
        let peter = users.find((u) => u.id === 'id-for-peter')
        assert.strict.ok(peter && peter.isActive === 'y' && peter.isAdmin === 'n', 'base seed peter 應為有效非管理者')

        let rRead = await callRpc('getWebInfor', [], TOKEN_PETER)
        assert.strict.equal(rRead.ok, false, `verifyClientUser 拒絕之使用者不得讀資料通道, 實得 ${JSON.stringify(rRead)}`)
        let rWrite = await callRpc('updateGrups', [grupsBase.map((g) => ({ ...g }))], TOKEN_PETER)
        assert.strict.equal(rWrite.ok, false, `verifyClientUser 拒絕之使用者不得寫資料通道, 實得 ${JSON.stringify(rWrite)}`)
    })

    //spec: 在表但 isActive='n' → 拒(UI 之「是否有效」對資料通道生效); 且被停用者不得自我復活
    //放最後: 停用 admin 後本進程再無可用 client token, 由 after 以 reseed 還原
    it('AUTH-003-admin-set-inactive-then-rejected-cannot-self-reactivate', async function() {
        let usersBase = sortByOrder(await readTable('users'))
        let usersOff = usersBase.map((u) => (u.id === 'id-for-admin' ? { ...u, isActive: 'n' } : { ...u }))
        let rOff = await callRpc('updateUsers', [usersOff], TOKEN_ADMIN)
        assert.strict.ok(rOff.ok, `停用前 admin 應可寫, 實得 ${JSON.stringify(rOff)}`)
        adminStopped = true
        let chk = (await readTable('users')).find((u) => u.id === 'id-for-admin')
        assert.strict.equal(chk.isActive, 'n', 'DB admin.isActive 應為 n')

        let rRead = await callRpc('getWebInfor', [], TOKEN_ADMIN)
        assert.strict.equal(rRead.ok, false, `停用之使用者不得讀資料通道, 實得 ${JSON.stringify(rRead)}`)
        assert.strict.equal(rRead.msg, 'permission denied')

        let usersOn = usersBase.map((u) => ({ ...u }))
        let rOn = await callRpc('updateUsers', [usersOn], TOKEN_ADMIN)
        assert.strict.equal(rOn.ok, false, `停用之使用者不得經資料通道自我復活, 實得 ${JSON.stringify(rOn)}`)
        let chk2 = (await readTable('users')).find((u) => u.id === 'id-for-admin')
        assert.strict.equal(chk2.isActive, 'n', 'DB admin.isActive 應仍為 n')
    })

})
