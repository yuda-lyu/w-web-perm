//E2E doubleclick test — perm 4 個寫入 RPC 之 backend mutex 並行序列化回歸測試。
//
//對應 server/WWebPerm.mjs:362 updateTabItems → kmx('updateTabItems:'+keyTable, fn)（pmKeyMutex，:288-290）：
//  同表並行整表批次寫入「序列化」、不同表並行。本檔驗證並行兩次同表寫入後 DB 終態正確、無 lost-update。
//
//【與 w-web-sso doubleclick 之差異 — 斷言重點】
//  sso 為「單筆操作 + throttle/select-after-insert」，故第 2 次撞特定 reject 訊息（一成功一失敗）。
//  perm 為「整表 diff」：每個 client 各送一份「完整 rows 快照」，server 把整表推成該快照。兩個並行呼叫
//  各帶自己的完整快照，mutex 序列化使兩份快照「依序、各自原子地」套用——終態必為「其中一份完整快照」，
//  絕不會出現「A 的 del 與 B 的 add 交錯」的損毀中間態（lost-update / 半套用 / 重複 insert）。
//  故 perm 的契約是：兩次皆 success（皆為合法整表寫入）、DB 終態 == 其中一份送入快照、筆數正確、無重複 id/name。
//
//本檔為 API-level（無 Playwright UI；前端 promiseUnlock 已防 UI race，本檔測 backend mutex 在 API 直打仍守）。
//act＝以 Promise.allSettled 並行打 2 次同表寫入 RPC；assert 走 DB 終態（getWoItems 唯讀 select）+ RPC 回傳。
//RPC 為 stateless POST {apiBaseUrl}/api/main（obj2u8arr 編碼），非常駐連線，無 force-exit 顧慮；
//lifecycle 對稱沿用 e2e-setup 的 startServersOnce↔cleanup（mocha root after hook 殺 backend）。
//本檔無 --baseline / 無 pixel 截圖（純並行序列化驗證）。

import assert from 'assert'
import obj2u8arr from 'wsemi/src/obj2u8arr.mjs'
import u8arr2obj from 'wsemi/src/u8arr2obj.mjs'
import { startServersOnce, cleanup, apiBaseUrl } from './e2e-setup.mjs'


const TOKEN_ADMIN = 'sys'

const RPC = {
    users: { fn: 'updateUsers', key: 'id' },
    grups: { fn: 'updateGrups', key: 'name' },
    pemis: { fn: 'updatePemis', key: 'name' },
    targets: { fn: 'updateTargets', key: 'id' },
}


//callRpc：直打 POST {apiBaseUrl}/api/main（仿 w-converhp client basic 編碼）。回傳 { ok, state, msg }。
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
        if ('error' in respObj) return { ok: false, state: 'error', msg: String(respObj.error) }
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
    return { ok: false, state: 'error', msg: `unparseable: ${JSON.stringify(respObj)}` }
}

function summarize(results) {
    let successCount = 0, errorCount = 0, msgs = []
    for (let r of results) {
        if (r.status !== 'fulfilled') { errorCount++; msgs.push(`unfulfilled: ${String(r.reason)}`); continue }
        if (r.value.ok) successCount++
        else { errorCount++ }
        msgs.push(r.value.msg)
    }
    return { successCount, errorCount, msgs }
}

//唯讀讀整張表
let _woItems = null
async function readTable(keyTable) {
    if (!_woItems) { const m = await import('../g.mOrm.mjs'); _woItems = m.woItems }
    return await _woItems[keyTable].select()
}


//base seed 快照（before 擷取一次）。每 case 前以此快照經 RPC 復原該表，確保隔離。
let baseSeed = { users: null, grups: null, pemis: null, targets: null }

async function restoreBaseSeed(keyTable) {
    let res = await callRpc(RPC[keyTable].fn, [baseSeed[keyTable]], TOKEN_ADMIN)
    assert.strict.ok(res.ok, `restoreBaseSeed(${keyTable}) 應成功，實得: ${JSON.stringify(res)}`)
}

//以 base 快照為基礎產生「整表快照 + 追加一列新 row」（新 row 的 key 由 newRow[keyField] 決定）。
function snapshotPlus(base, newRow) {
    return [...base.map((v) => ({ ...v })), newRow]
}

//斷言「無損毀中間態」：終態必等於兩份候選快照其中一份的 key 集合（序列化原子性），且無重複 key。
function assertOneOfSnapshots(keyField, after, candidateKeySetsByName) {
    let afterKeys = after.map((v) => v[keyField])
    //無重複 key（無重複 insert）
    assert.strict.equal(new Set(afterKeys).size, afterKeys.length,
        `終態 ${keyField} 不應有重複（無重複 insert），實得: ${JSON.stringify(afterKeys)}`)

    let afterSorted = JSON.stringify([...afterKeys].sort())
    let matched = null
    for (let [name, set] of Object.entries(candidateKeySetsByName)) {
        if (JSON.stringify([...set].sort()) === afterSorted) { matched = name; break }
    }
    assert.strict.ok(matched !== null,
        `終態 ${keyField} 集合應「完整等於」其中一份送入快照（序列化原子、無半套用/lost-update）；` +
        `實得 ${afterSorted}，候選: ${JSON.stringify(candidateKeySetsByName, (k, v) => v instanceof Array ? v : v)}`)
    return matched
}


describe('doubleclick API E2E — perm 寫入 RPC 並行序列化（無 lost-update）', function() {
    this.timeout(120000)

    before(async function() {
        this.timeout(200000)
        await startServersOnce({ backendOnly: true })
        for (let kt of ['users', 'grups', 'pemis', 'targets']) {
            baseSeed[kt] = await readTable(kt)
        }
    })


    //共用 case 骨架：並行 2 次同表寫入，各帶「base + 各自一列新 row」之完整快照。
    //序列化後終態必為其中一份完整快照（含 A-only 或 B-only 的新列），絕不同時含兩列、亦不損毀既有列。
    async function runConcurrentCase(keyTable, rowA, rowB) {
        let cfg = RPC[keyTable]
        await restoreBaseSeed(keyTable)
        let base = await readTable(keyTable)
        let baseKeys = base.map((v) => v[cfg.key])

        let snapA = snapshotPlus(base, rowA)
        let snapB = snapshotPlus(base, rowB)

        //並行打 2 次（各自完整快照）
        let results = await Promise.allSettled([
            callRpc(cfg.fn, [snapA], TOKEN_ADMIN),
            callRpc(cfg.fn, [snapB], TOKEN_ADMIN),
        ])
        let { successCount, errorCount, msgs } = summarize(results)

        //契約 1：兩次皆為合法整表寫入 → 序列化後皆 success（perm 無 throttle reject）
        assert.strict.equal(successCount, 2,
            `預期兩次並行寫入皆 success（mutex 序列化，皆為合法整表寫入），實得 success=${successCount} error=${errorCount} msgs=${JSON.stringify(msgs)}`)

        //契約 2：DB 終態 == 其中一份完整快照（原子、無半套用/lost-update/重複 insert）
        let after = await readTable(keyTable)
        let candidates = {
            snapA: [...baseKeys, rowA[cfg.key]],
            snapB: [...baseKeys, rowB[cfg.key]],
        }
        let matched = assertOneOfSnapshots(cfg.key, after, candidates)

        //契約 3：既有 base 列全數保留（未被任一並行寫入損毀）
        for (let bk of baseKeys) {
            assert.strict.ok(after.some((v) => v[cfg.key] === bk), `base 既有 ${cfg.key}=${bk} 應仍存在（未被損毀）`)
        }

        //契約 4：終態筆數 = base + 1（恰好一份快照之新列被反映）
        assert.strict.equal(after.length, base.length + 1,
            `終態筆數應為 base+1（恰一份快照之新列），實得 ${after.length}（base ${base.length}）`)

        return matched
    }


    it('E2E-DC-01-update-users-double：並行 2 次 updateUsers 同表 → 序列化、終態為其一快照、無 lost-update', async function() {
        await runConcurrentCase('users',
            { id: 'id-dc-user-a', order: 90, name: 'dcUserA', email: 'dc-user-a@example.com', description: '', from: 'dcTest', cgrups: '{}', isAdmin: 'n', isActive: 'y' },
            { id: 'id-dc-user-b', order: 91, name: 'dcUserB', email: 'dc-user-b@example.com', description: '', from: 'dcTest', cgrups: '{}', isAdmin: 'n', isActive: 'y' },
        )
    })

    it('E2E-DC-02-update-grups-double：並行 2 次 updateGrups 同表 → 序列化、終態為其一快照、無 lost-update', async function() {
        await runConcurrentCase('grups',
            { id: 'id-dc-grup-a', order: 90, name: 'dcGrupA', description: 'A', from: 'dcTest', cpemis: '{}' },
            { id: 'id-dc-grup-b', order: 91, name: 'dcGrupB', description: 'B', from: 'dcTest', cpemis: '{}' },
        )
    })

    it('E2E-DC-03-update-pemis-double：並行 2 次 updatePemis 同表 → 序列化、終態為其一快照、無 lost-update', async function() {
        await runConcurrentCase('pemis',
            { id: 'id-dc-pemi-a', order: 90, name: 'dcPemiA', description: 'A', from: 'dcTest', crules: '{}' },
            { id: 'id-dc-pemi-b', order: 91, name: 'dcPemiB', description: 'B', from: 'dcTest', crules: '{}' },
        )
    })

    it('E2E-DC-04-update-targets-double：並行 2 次 updateTargets 同表 → 序列化、終態為其一快照、無 lost-update', async function() {
        await runConcurrentCase('targets',
            { id: '專案DC/頁/區塊A', order: 90, description: 'A', from: 'dcTest' },
            { id: '專案DC/頁/區塊B', order: 91, description: 'B', from: 'dcTest' },
        )
    })


    //收尾：所有表復原 base seed
    after(async function() {
        this.timeout(60000)
        for (let kt of ['users', 'grups', 'pemis', 'targets']) {
            if (baseSeed[kt]) await restoreBaseSeed(kt)
        }
    })

})

//cleanup 由 e2e-setup 之 mocha root after() 觸發；本檔無直跑 baseline 入口。
void cleanup
