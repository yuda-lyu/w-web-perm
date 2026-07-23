//updateTabs 寫入 RPC 契約測試。對應 perm 4 個寫入 RPC（updateUsers / updateGrups / updatePemis / updateTargets，
//server/procCore.mjs:132-172 之 4 個 wrapper，核心走 updateTabItems（procCore.mjs:17））。
//
//【與既有 api 查詢測之差異】perm 的 4 個寫入函式註冊於 WServHapiServer 的 kpFunExt（WWebPerm.mjs:1132-1135，
//委派 pc.updateTargets 等，pc 為 procCore 實例，WWebPerm.mjs:300），走 w-converhp RPC 通道（POST
//{apiBaseUrl}/api/main，body 為 obj2u8arr 編碼），非裸 axios 查詢 URL。故本檔仿
//w-web-sso/test/e2e-doubleclick.test.mjs 之 callRpc：用 Node 內建 fetch + wsemi 之 obj2u8arr/u8arr2obj 直打。
//RPC 為 stateless POST（非常駐連線），無 sso 的 force-exit 顧慮；process 由 e2e-setup 的 mocha root after 殺 backend。
//
//【整表 diff 語意（已 Read 原始碼確認）】updateTabItems 對整張表（select() 無 from 過濾）做 ltdtDiffByKey：
//  - diff 鍵（keyDetect）：targets/users=id、pemis/grups=name（procCore.mjs:134/145/156/167）。
//  - 送入 rows 經 ltdtmapping 取 schema 欄位（procCore.mjs:24）、order 一律重給為陣列位置 k+1（procCore.mjs:27-31）。
//  - DB 終態 = 送入 rows：未列出的舊列被 del、新 id/name 被 add、同 key 但內容不同被 save(diff)。
//  - 因此「修改一列」「新增一列」「刪除一列」皆須送「整張表的完整 rows（含未改動列）」，僅調整目標列。
//  - 去重鍵檢測（procCore.mjs:66-87）：targets 同 id、pemis/grups 同 name、users 同 email 重複 → reject（saveRowFieldDuplicate，procCore.mjs:54）。
//
//token 用 TOKEN_ADMIN（'sys' → id-for-admin，過 verifyConn.checkToken + 為 isAdmin='y'）。
//每 case 前以 restoreBaseSeed 將目標表復原為 base seed（送 base 快照經同一 RPC 寫回），確保 case 間隔離。
//DB 斷言一律 getWoItems() 唯讀 select（跨進程唯讀實測可行；寫入一律走 backend RPC，測試進程不寫 DB）。

import assert from 'assert'
import obj2u8arr from 'wsemi/src/obj2u8arr.mjs'
import u8arr2obj from 'wsemi/src/u8arr2obj.mjs'
import { startApi, apiBaseUrl, TOKEN_ADMIN, getWoItems } from './api-setup.mjs'


//4 個寫入 RPC 對照表：RPC 名 ↔ keyTable ↔ diff/去重 鍵
const RPC = {
    users: { fn: 'updateUsers', detectKey: 'id', dupKey: 'email' },
    grups: { fn: 'updateGrups', detectKey: 'name', dupKey: 'name' },
    pemis: { fn: 'updatePemis', detectKey: 'name', dupKey: 'name' },
    targets: { fn: 'updateTargets', detectKey: 'id', dupKey: 'id' },
}


//callRpc：直打 POST {apiBaseUrl}/api/main，仿 w-converhp client sendPkg('basic') 編碼。
//回傳 normalized { ok, state, msg }。kpFunExt handler 首參為 userId（由 __sysToken__ 解出），故 args 只給前端參數。
async function callRpc(funcName, args, token = TOKEN_ADMIN) {
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
            let out = respObj.success?.output
            if (out && typeof out === 'object') {
                if (out.state === 'success') return { ok: true, state: 'success', msg: out.msg }
                let m = out.msg
                let msgStr = (typeof m === 'string') ? m : (m?.key ?? m?.message ?? JSON.stringify(m))
                return { ok: false, state: out.state, msg: msgStr }
            }
        }
    }
    return { ok: false, state: 'error', msg: `unparseable response: ${JSON.stringify(respObj)}` }
}


//讀整張表（唯讀），回傳 rows 陣列（含全部欄位）。
async function readTable(keyTable) {
    let woItems = await getWoItems()
    return await woItems[keyTable].select()
}


//base seed 快照（suite before 擷取一次，作為每 case 前 restore 的還原目標）。
let baseSeed = { users: null, grups: null, pemis: null, targets: null }

//將 keyTable 復原為 base seed：送 base 快照經寫入 RPC（整表 diff 會把 DB 推回快照內容）。
async function restoreBaseSeed(keyTable) {
    let res = await callRpc(RPC[keyTable].fn, [baseSeed[keyTable]], TOKEN_ADMIN)
    assert.strict.ok(res.ok, `restoreBaseSeed(${keyTable}) 應成功，實得: ${JSON.stringify(res)}`)
}


describe('api-updateTabs（寫入 RPC：add / del / diff / order / 去重鍵）', function() {
    this.timeout(120000)

    before(async function() {
        this.timeout(200000)
        await startApi()
        //擷取 base seed 快照。startApi 可能 reuse 別檔已啟動的 backend（未重 seed），DB 可能殘留
        //api-syncAndReplaceTabs 留下的 from='appTest-*' 列；canonical base seed 之 from 僅 '' 與 'teamA'
        //（見 api-setup.mjs SEED 註）。故過濾掉 appTest 分區，確保 baseSeed 為純 base；restoreBaseSeed 以
        //整表 diff 寫回此純快照時，會把殘留 appTest 列一併清除（整表取代語意），使每 case 起點 hermetic。
        for (let kt of ['users', 'grups', 'pemis', 'targets']) {
            let rows = await readTable(kt)
            baseSeed[kt] = rows.filter((r) => !String(r.from || '').startsWith('appTest'))
        }
    })


    // ============ updateUsers（detect/del-add key=id；去重 key=email）============

    it('API-updateUsers-001-add-del-diff-order：新增/刪除/修改列 + order 重給', async function() {
        await restoreBaseSeed('users')
        let before = await readTable('users')
        assert.strict.equal(before.length, 4, `base seed users 應 4 筆，實得 ${before.length}`)

        //以 base 為基礎，組「整表」送入 rows：
        //  - 刪 mary（不列入）
        //  - 改 peter.description
        //  - 新增 newUser（新 id）
        let kept = before.filter((u) => u.id !== 'id-for-mary')
        let sent = kept.map((u) => {
            if (u.id === 'id-for-peter') return { ...u, description: 'peter-edited-desc' }
            return { ...u }
        })
        sent.push({
            id: 'id-app-new-user', order: 99, name: 'newUser', email: 'newuser@example.com',
            description: 'brand new', from: 'apiTest', cgrups: '{}', isAdmin: 'n', isActive: 'y',
        })

        let res = await callRpc('updateUsers', [sent], TOKEN_ADMIN)
        assert.strict.ok(res.ok, `updateUsers 應成功，實得: ${JSON.stringify(res)}`)

        let after = await readTable('users')
        let byId = Object.fromEntries(after.map((u) => [u.id, u]))

        //del 生效：mary 不在
        assert.strict.ok(!byId['id-for-mary'], 'mary 應已被刪除（未列入送入 rows）')
        //add 生效：newUser 在，且內容正確
        assert.strict.ok(byId['id-app-new-user'], '新增 user 應存在')
        assert.strict.equal(byId['id-app-new-user'].email, 'newuser@example.com', '新增 user email 正確')
        assert.strict.equal(byId['id-app-new-user'].name, 'newUser', '新增 user name 正確')
        //diff 生效：peter.description 已改
        assert.strict.equal(byId['id-for-peter'].description, 'peter-edited-desc', 'peter description 應已更新')
        //john 未變（仍在）
        assert.strict.ok(byId['id-for-john'], 'john（未改動列）應仍存在')
        //終態筆數 = 送入筆數（4 - mary + new = 4）
        assert.strict.equal(after.length, sent.length, `users 終態筆數應等於送入 rows 筆數 ${sent.length}`)

        //order 重給為陣列位置 k+1（送入順序）
        let sentIds = sent.map((u) => u.id)
        for (let i = 0; i < sentIds.length; i++) {
            assert.strict.equal(byId[sentIds[i]].order, i + 1, `${sentIds[i]} order 應重給為 ${i + 1}`)
        }
    })

    it('API-updateUsers-002-duplicate-email-rejected：同 email 重複 → 整表寫入被拒、DB 不變', async function() {
        await restoreBaseSeed('users')
        let before = await readTable('users')

        //複製一列、改 id 但 email 與既有列相同 → 去重鍵（email）撞重複 → reject
        let dup = { ...before[0], id: 'id-dup-email', email: before[1].email }
        let sent = [...before.map((u) => ({ ...u })), dup]

        let res = await callRpc('updateUsers', [sent], TOKEN_ADMIN)
        assert.strict.equal(res.ok, false, `同 email 重複應被拒，實得: ${JSON.stringify(res)}`)
        assert.strict.ok(String(res.msg).includes('saveRowFieldDuplicate'),
            `reject msg 應為 err key saveRowFieldDuplicate（去重撞重複；欄位細節改記 srLog），實得: ${res.msg}`)

        //被拒未寫入：DB 仍為 4 筆、無 id-dup-email
        let after = await readTable('users')
        assert.strict.equal(after.length, before.length, '去重檢測拒絕後筆數不變')
        assert.strict.ok(!after.some((u) => u.id === 'id-dup-email'), '重複列不應寫入')
    })


    // ============ updateGrups（detect/去重 key=name）============

    it('API-updateGrups-001-add-del-diff-order：新增/刪除/修改列 + order 重給', async function() {
        await restoreBaseSeed('grups')
        let before = await readTable('grups')
        assert.strict.equal(before.length, 4, `base seed grups 應 4 筆，實得 ${before.length}`)

        //刪 權限群組M3、改 權限群組M1.description、新增 grupNew
        let kept = before.filter((g) => g.name !== '權限群組M3')
        let sent = kept.map((g) => g.name === '權限群組M1' ? { ...g, description: 'M1-edited' } : { ...g })
        sent.push({ id: 'id-grup-new', order: 88, name: 'grupNew', description: 'new grup', from: 'apiTest', cpemis: '{}' })

        let res = await callRpc('updateGrups', [sent], TOKEN_ADMIN)
        assert.strict.ok(res.ok, `updateGrups 應成功，實得: ${JSON.stringify(res)}`)

        let after = await readTable('grups')
        let byName = Object.fromEntries(after.map((g) => [g.name, g]))

        assert.strict.ok(!byName['權限群組M3'], 'M3 應已刪除')
        assert.strict.ok(byName['grupNew'], '新增 grup 應存在')
        assert.strict.equal(byName['grupNew'].description, 'new grup', '新增 grup description 正確')
        assert.strict.equal(byName['權限群組M1'].description, 'M1-edited', 'M1 description 應已更新')
        assert.strict.equal(after.length, sent.length, `grups 終態筆數應等於送入 ${sent.length}`)

        let sentNames = sent.map((g) => g.name)
        for (let i = 0; i < sentNames.length; i++) {
            assert.strict.equal(byName[sentNames[i]].order, i + 1, `${sentNames[i]} order 應重給為 ${i + 1}`)
        }
    })

    it('API-updateGrups-002-duplicate-name-rejected：同 name 重複 → 被拒、DB 不變', async function() {
        await restoreBaseSeed('grups')
        let before = await readTable('grups')

        let dup = { ...before[0], id: 'id-grup-dup', name: before[1].name }
        let sent = [...before.map((g) => ({ ...g })), dup]

        let res = await callRpc('updateGrups', [sent], TOKEN_ADMIN)
        assert.strict.equal(res.ok, false, `同 name 重複應被拒，實得: ${JSON.stringify(res)}`)
        assert.strict.ok(String(res.msg).includes('saveRowFieldDuplicate'),
            `reject msg 應為 err key saveRowFieldDuplicate（去重撞重複；欄位細節改記 srLog），實得: ${res.msg}`)

        let after = await readTable('grups')
        assert.strict.equal(after.length, before.length, '去重檢測拒絕後筆數不變')
        assert.strict.ok(!after.some((g) => g.id === 'id-grup-dup'), '重複列不應寫入')
    })


    // ============ updatePemis（detect/去重 key=name）============

    it('API-updatePemis-001-add-del-diff-order：新增/刪除/修改列 + order 重給', async function() {
        await restoreBaseSeed('pemis')
        let before = await readTable('pemis')
        assert.strict.equal(before.length, 4, `base seed pemis 應 4 筆，實得 ${before.length}`)

        //刪 權限P4、改 權限P1.description、新增 pemiNew
        let kept = before.filter((p) => p.name !== '權限P4')
        let sent = kept.map((p) => p.name === '權限P1' ? { ...p, description: 'P1-edited' } : { ...p })
        sent.push({ id: 'id-pemi-new', order: 77, name: 'pemiNew', description: 'new pemi', from: 'apiTest', crules: '{}' })

        let res = await callRpc('updatePemis', [sent], TOKEN_ADMIN)
        assert.strict.ok(res.ok, `updatePemis 應成功，實得: ${JSON.stringify(res)}`)

        let after = await readTable('pemis')
        let byName = Object.fromEntries(after.map((p) => [p.name, p]))

        assert.strict.ok(!byName['權限P4'], 'P4 應已刪除')
        assert.strict.ok(byName['pemiNew'], '新增 pemi 應存在')
        assert.strict.equal(byName['pemiNew'].description, 'new pemi', '新增 pemi description 正確')
        assert.strict.equal(byName['權限P1'].description, 'P1-edited', 'P1 description 應已更新')
        assert.strict.equal(after.length, sent.length, `pemis 終態筆數應等於送入 ${sent.length}`)

        let sentNames = sent.map((p) => p.name)
        for (let i = 0; i < sentNames.length; i++) {
            assert.strict.equal(byName[sentNames[i]].order, i + 1, `${sentNames[i]} order 應重給為 ${i + 1}`)
        }
    })

    it('API-updatePemis-002-duplicate-name-rejected：同 name 重複 → 被拒、DB 不變', async function() {
        await restoreBaseSeed('pemis')
        let before = await readTable('pemis')

        let dup = { ...before[0], id: 'id-pemi-dup', name: before[1].name }
        let sent = [...before.map((p) => ({ ...p })), dup]

        let res = await callRpc('updatePemis', [sent], TOKEN_ADMIN)
        assert.strict.equal(res.ok, false, `同 name 重複應被拒，實得: ${JSON.stringify(res)}`)
        assert.strict.ok(String(res.msg).includes('saveRowFieldDuplicate'),
            `reject msg 應為 err key saveRowFieldDuplicate（去重撞重複；欄位細節改記 srLog），實得: ${res.msg}`)

        let after = await readTable('pemis')
        assert.strict.equal(after.length, before.length, '去重檢測拒絕後筆數不變')
        assert.strict.ok(!after.some((p) => p.id === 'id-pemi-dup'), '重複列不應寫入')
    })


    // ============ updateTargets（detect/去重 key=id，id 為路徑字串）============

    it('API-updateTargets-001-add-del-diff-order：新增/刪除/修改列 + order 重給', async function() {
        await restoreBaseSeed('targets')
        let before = await readTable('targets')
        assert.strict.equal(before.length, 22, `base seed targets 應 22 筆，實得 ${before.length}`)

        //刪一個既有 target、改另一個的 description、新增一個（新 id 路徑字串）
        let delId = '專案A/頁A/區塊A/分析按鈕'
        let editId = '專案A/頁A/區塊A'
        let newId = '專案C/頁X/區塊Z/新按鈕'
        let kept = before.filter((t) => t.id !== delId)
        let sent = kept.map((t) => t.id === editId ? { ...t, description: 'target-edited-desc' } : { ...t })
        sent.push({ id: newId, order: 66, description: 'new target', from: 'apiTest' })

        let res = await callRpc('updateTargets', [sent], TOKEN_ADMIN)
        assert.strict.ok(res.ok, `updateTargets 應成功，實得: ${JSON.stringify(res)}`)

        let after = await readTable('targets')
        let byId = Object.fromEntries(after.map((t) => [t.id, t]))

        assert.strict.ok(!byId[delId], `${delId} 應已刪除`)
        assert.strict.ok(byId[newId], '新增 target 應存在')
        assert.strict.equal(byId[newId].description, 'new target', '新增 target description 正確')
        assert.strict.equal(byId[editId].description, 'target-edited-desc', '既有 target description 應已更新')
        assert.strict.equal(after.length, sent.length, `targets 終態筆數應等於送入 ${sent.length}`)

        let sentIds = sent.map((t) => t.id)
        for (let i = 0; i < sentIds.length; i++) {
            assert.strict.equal(byId[sentIds[i]].order, i + 1, `${sentIds[i]} order 應重給為 ${i + 1}`)
        }
    })

    it('API-updateTargets-002-duplicate-id-rejected：同 id 重複 → 被拒、DB 不變', async function() {
        await restoreBaseSeed('targets')
        let before = await readTable('targets')

        //追加一列、id 與既有列相同 → 去重鍵（id）撞重複 → reject
        let dup = { ...before[0], description: 'dup row' }
        let sent = [...before.map((t) => ({ ...t })), dup]

        let res = await callRpc('updateTargets', [sent], TOKEN_ADMIN)
        assert.strict.equal(res.ok, false, `同 id 重複應被拒，實得: ${JSON.stringify(res)}`)
        assert.strict.ok(String(res.msg).includes('saveRowFieldDuplicate'),
            `reject msg 應為 err key saveRowFieldDuplicate（去重撞重複；欄位細節改記 srLog），實得: ${res.msg}`)

        let after = await readTable('targets')
        assert.strict.equal(after.length, before.length, '去重檢測拒絕後筆數不變')
    })


    //收尾：所有表復原為 base seed（避免遺留特化資料影響其他檔在同一 mocha run 的執行）
    after(async function() {
        this.timeout(60000)
        for (let kt of ['users', 'grups', 'pemis', 'targets']) {
            if (baseSeed[kt]) await restoreBaseSeed(kt)
        }
    })

})
