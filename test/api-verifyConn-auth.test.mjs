//資料通道(/api/main)授權對稱契約測試。對應 spec/流程_後台使用者清單.md〈spec 規則摘要〉權限條、WWebPerm.mjs p.checkToken 註解。
//述語(R05): verifyConn 與登入入口(api/getUserByToken)採同一授權強度——
//  外部 token 有效但不在 perm users 表 → 拒; 在表但 isActive='n' → 拒; 在表且有效但 verifyClientUser 拒 → 拒; 在表、有效、允許 → 通。
//  api/getPerm 行為不變(既有 api-getPerm 測試覆蓋), syncAndReplaceTabs 不經 verifyConn(既有 api-syncAndReplaceTabs 覆蓋)。
//perm-run03 範圍三(AUTH-BODY-*): 資料通道之執行身分(本體 __sysToken__ → getUserIdByToken)與連線閘同等完整驗證——標頭 token 與本體 token 為不同使用者時, 本體 token 之使用者亦須存在於 perm users、isActive='y'、通過 verifyClientUser,
//  否則該次呼叫被拒(固定語系鍵 cannotFindUserFromToken／cannotGetUserFromPerm／userNoPermission)、函數不執行; 通過者以該使用者之 perm id 為執行身分。
//
//背景: 2026-09-07 前 verifyConn 只驗外部 token 欄位齊備, 不查 perm users 與 isActive, 亦不經 verifyClientUser;
//實測 app token(不在表)可寫 grups、admin 自停用後仍可讀寫並自我復活(tmp/probe-report.json A3/A4)。本檔為該缺陷之重現測試(修正前紅、修正後綠)。
//
//callRpc 仿 api-updateTabs.test.mjs(直打 POST /api/main, obj2u8arr 編碼); 傳輸層拒絕時回 {error:'permission denied'}。
//AUTH-003 需把 admin 自己停用, 停用後所有通道皆拒、無法經 RPC 還原, 故 after 以 restartBackend(reseed) 重建 base seed。

import assert from 'assert'
import { startApi, TOKEN_ADMIN, TOKEN_ADMIN2, TOKEN_APP, TOKEN_PETER, TOKEN_BAD, getWoItems, callRpc } from './tools/api-setup.mjs'
import { restartBackend } from './tools/e2e-setup.mjs'

//callRpc：本檔原一份局部實作，與 test/tools/api-setup.mjs 匯出版之邏輯逐式相同（僅缺 raw 欄位與 opt 參數，
//本檔皆未使用），2026-09-28 收斂改直接 import（斷言不受影響，回歸測試已過）。

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

    // ============ 資料通道只開 select（ADR-026、ADR-015 Update；規則帳本 R-WSD-01）============
    //政策：methodsExec:['select']＋authorizeExec 只放行 select。修正前（methodsExec 含 insert/save/del/delAll）已認證者可直呼裸表操作，
    //繞過 updateXxx 之 lockSave、表鎖(perm-run01 起為 w-serv-orm 之 guardWrite，原 kmx)、寫入前驗證與整表比對；前端與測試之寫入皆經 kpFunExt、同步只用 select。
    const TABLES_DC = ['grups', 'pemis', 'targets', 'users']
    const KP_FUN_EXT = ['getWebInfor', 'updateTargets', 'updatePemis', 'updateGrups', 'updateUsers', 'getStaEvent', 'getStaEventTable']

    it('DC-FUNCLIST-001-table-ops-select-only：[sys:getFuncList] 之表操作只有各表之 select（其餘為 kpFunExt）', async function() {
        let r = await callRpc('[sys:getFuncList]', [], TOKEN_ADMIN)
        assert.strict.ok(r.ok, `getFuncList 應成功, 實得 ${JSON.stringify(r).slice(0, 300)}`)
        let expected = [...TABLES_DC.map((t) => `${t}.select`), ...KP_FUN_EXT].sort()
        assert.strict.deepEqual((r.output || []).slice().sort(), expected)
    })

    it('DC-WRITE-001-raw-writes-rejected：直呼裸 insert/save/del/delAll 一律回 invalid func[表名.方法] 且資料不變', async function() {
        let snap = async () => JSON.stringify((await readTable('targets')).sort((a, b) => String(a.id).localeCompare(String(b.id))))
        let base = sortByOrder(await readTable('targets'))
        let snap0 = await snap()
        let t0 = base[0]
        try {
            let calls = [
                ['targets.save', [{ ...t0, description: String(t0.description || '') + '_DCW' }]],
                ['targets.insert', [{ id: '專案DC/裸寫入', order: 99, description: 'raw', from: '' }]],
                ['targets.del', [{ id: '專案DC/不存在' }]],
                ['targets.delAll', { from: '__none__' }],
            ]
            for (let [fn, arg] of calls) {
                let r = await callRpc(fn, [arg], TOKEN_ADMIN)
                assert.strict.equal(r.ok, false, `${fn} 應被拒, 實得 ${JSON.stringify(r).slice(0, 300)}`)
                assert.strict.equal(r.msg, `invalid func[${fn}]`, `${fn} 應不在函數清單`)
            }
            for (let t of ['grups', 'pemis', 'users']) {
                for (let m of ['insert', 'save', 'del', 'delAll']) {
                    let r = await callRpc(`${t}.${m}`, [{ id: '__none__' }], TOKEN_ADMIN)
                    assert.strict.equal(r.msg, `invalid func[${t}.${m}]`, `${t}.${m} 應不在函數清單, 實得 ${JSON.stringify(r).slice(0, 200)}`)
                }
            }
            assert.strict.equal(await snap(), snap0, 'targets 資料須不變')
        }
        finally {
            //修正前(裸寫入可執行)之重跑會改到資料: 以 kpFunExt 整表寫回快照還原(修正後為 no-op)
            if (await snap() !== snap0) {
                let rr = await callRpc('updateTargets', [base], TOKEN_ADMIN)
                assert.strict.ok(rr.ok, `還原 targets 應成功, 實得 ${JSON.stringify(rr)}`)
            }
        }
    })

    it('DC-SELECT-001-select-allowed：已認證者之裸 select 經授權放行（前端同步依賴），回該表全部列', async function() {
        for (let t of TABLES_DC) {
            let r = await callRpc(`${t}.select`, [], TOKEN_ADMIN)
            assert.strict.ok(r.ok, `${t}.select 應成功, 實得 ${JSON.stringify(r).slice(0, 300)}`)
            let db = await readTable(t)
            assert.strict.deepEqual((r.output || []).map((v) => v.id).sort(), db.map((v) => v.id).sort(), `${t}.select 應回該表全部列`)
        }
    })

    // ============ 執行身分(本體 __sysToken__ → getUserIdByToken)與連線閘同等完整驗證（perm-run03 範圍三；dspec/使用者身分驗證原則.md）============
    //資料通道每次呼叫有兩個 token：請求標頭 Authorization（連線閘 verifyConn 驗）與本體 __sysToken__（框架據以呼叫 getUserIdByToken 取得執行身分）；兩者縱為不同 token，框架不比對。
    //修正前：getUserIdByToken 只查外部 getUserByToken 與 perm users 存在，未驗 isActive、未經 verifyClientUser——標頭放行後，本體 token 之使用者可為「已停用」「不通過 verifyClientUser」者仍被當成執行身分。
    //修正後：本體 token 之使用者亦經完整驗證（外部 getUserByToken → perm users 存在且 isActive='y' → verifyClientUser），任一關不過即 reject 固定語系鍵、函數不執行（零寫入），並回 perm users 內該使用者之 id 作為執行身分。
    //opt.sysToken 給本體 token（api-setup callRpc 預設同標頭 token）。

    const ID_ADMIN2 = 'id-for-admin2' //srv.mjs '{token-for-admin2}' 之使用者 id（測試用第二位系統管理員; 其 perm users 列由本檔案例自建並於收尾移除）
    const ROW_ADMIN2 = { id: ID_ADMIN2, order: 99, name: 'admin2', email: 'admin2@example.com', description: '', from: '', cgrups: '{}', isAdmin: 'y', isActive: 'y' }

    it('AUTH-BODY-001-body-token-fully-validated-rejected：標頭 token 有效(admin)、本體 token 無效／外部有效但不在 perm users／在表啟用但 verifyClientUser 拒 → 讀與寫皆拒、回固定語系鍵、函數不執行(DB 不變)', async function() {
        let cases = [
            { label: '本體 token 無效', sysToken: TOKEN_BAD, key: 'cannotFindUserFromToken' },
            { label: '本體 token 為外部有效但不在 perm users 表者(app token)', sysToken: TOKEN_APP, key: 'cannotGetUserFromPerm' },
            { label: '本體 token 為在表、啟用但 verifyClientUser 拒者(peter)', sysToken: TOKEN_PETER, key: 'userNoPermission' },
        ]
        let rowsMod = grupsBase.map((g, k) => (k === 0 ? { ...g, description: String(g.description || '') + '_BODY001' } : { ...g }))
        let snap0 = JSON.stringify(sortByOrder(await readTable('grups')))
        for (let c of cases) {
            let rRead = await callRpc('getWebInfor', [], TOKEN_ADMIN, { sysToken: c.sysToken })
            assert.strict.equal(rRead.ok, false, `${c.label}: 讀應被拒(函數不執行), 實得 ${JSON.stringify(rRead)}`)
            assert.strict.equal(rRead.msg, c.key, `${c.label}: 讀應回固定語系鍵 ${c.key}, 實得 ${rRead.msg}`)
            let rWrite = await callRpc('updateGrups', [rowsMod], TOKEN_ADMIN, { sysToken: c.sysToken })
            assert.strict.equal(rWrite.ok, false, `${c.label}: 寫應被拒(函數不執行), 實得 ${JSON.stringify(rWrite)}`)
            assert.strict.equal(rWrite.msg, c.key, `${c.label}: 寫應回固定語系鍵 ${c.key}, 實得 ${rWrite.msg}`)
        }
        assert.strict.equal(JSON.stringify(sortByOrder(await readTable('grups'))), snap0, 'DB grups 不得被改')
    })

    it('AUTH-BODY-002-body-token-other-admin-identity-and-disabled：本體 token 為另一位有效管理員(admin2)→ 以該使用者之 perm id 執行(新增列建立者為 id-for-admin2); 將其停用後同一本體 token → 拒(cannotGetUserFromPerm)、函數不執行', async function() {
        let usersBase = sortByOrder(await readTable('users'))
        assert.strict.ok(!usersBase.some((u) => u.id === ID_ADMIN2), `前置: perm users 不得已有 ${ID_ADMIN2}`)
        let grupsBefore = sortByOrder(await readTable('grups'))
        let newG = (id, name) => ({ id, order: 99, name, description: '', from: '', cpemis: '{}' })
        try {
            //建立 admin2(後台列, 啟用, isAdmin='y'), 由 admin 經管理者寫入 RPC
            let rAdd = await callRpc('updateUsers', [[...usersBase.map((u) => ({ ...u })), { ...ROW_ADMIN2 }]], TOKEN_ADMIN)
            assert.strict.ok(rAdd.ok, `前置: 建立 admin2 應成功, 實得 ${JSON.stringify(rAdd)}`)

            //(1) 標頭 admin、本體 admin2(有效): 通過完整驗證, 以 admin2 之 perm id 執行(寫入之新列建立者為 id-for-admin2, 非標頭使用者 id-for-admin)
            let r1 = await callRpc('updateGrups', [[...grupsBefore.map((g) => ({ ...g })), newG('id-vc-body-g1', 'vcBodyG1')]], TOKEN_ADMIN, { sysToken: TOKEN_ADMIN2 })
            assert.strict.ok(r1.ok, `(1) 本體 token 為有效管理員應可執行, 實得 ${JSON.stringify(r1)}`)
            let g1 = (await readTable('grups')).find((g) => g.name === 'vcBodyG1')
            assert.strict.ok(g1, '(1) 新列應已寫入')
            assert.strict.equal(g1.userId, ID_ADMIN2, `(1) 執行身分應為本體 token 之使用者(perm id ${ID_ADMIN2}), 實得建立者「${g1.userId}」`)

            //(2) 將 admin2 停用(經標頭本體皆為 admin 之寫入), 再以本體 admin2 呼叫 → 拒, 不寫入
            let usersOff = sortByOrder(await readTable('users')).map((u) => (u.id === ID_ADMIN2 ? { ...u, isActive: 'n' } : { ...u }))
            let rOff = await callRpc('updateUsers', [usersOff], TOKEN_ADMIN)
            assert.strict.ok(rOff.ok, `(2) 停用 admin2 應成功, 實得 ${JSON.stringify(rOff)}`)
            let snap2 = JSON.stringify(sortByOrder(await readTable('grups')))
            let r2 = await callRpc('updateGrups', [[...sortByOrder(await readTable('grups')).map((g) => ({ ...g })), newG('id-vc-body-g2', 'vcBodyG2')]], TOKEN_ADMIN, { sysToken: TOKEN_ADMIN2 })
            assert.strict.equal(r2.ok, false, `(2) 本體 token 之使用者已停用應被拒, 實得 ${JSON.stringify(r2)}`)
            assert.strict.equal(r2.msg, 'cannotGetUserFromPerm', `(2) 應回 cannotGetUserFromPerm, 實得 ${r2.msg}`)
            assert.strict.equal(JSON.stringify(sortByOrder(await readTable('grups'))), snap2, '(2) 被拒時 DB grups 不得被改')
        }
        finally {
            //收尾(失敗時亦還原): 移除本案新增之群組列與 admin2 列(皆為後台列, 經 admin 之管理者寫入 RPC)
            let rG = await callRpc('updateGrups', [grupsBefore.map((g) => ({ ...g }))], TOKEN_ADMIN)
            let rU = await callRpc('updateUsers', [sortByOrder(await readTable('users')).filter((u) => u.id !== ID_ADMIN2).map((u) => ({ ...u }))], TOKEN_ADMIN)
            assert.strict.ok(rG.ok && rU.ok, `收尾還原 grups／users 應成功, 實得 ${JSON.stringify([rG, rU])}`)
            assert.strict.ok(!(await readTable('users')).some((u) => u.id === ID_ADMIN2), '收尾: admin2 列應已移除')
        }
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
