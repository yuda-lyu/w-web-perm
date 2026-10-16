//資料通道之表操作授權與 ORM 呼叫包裝(規則帳本 R-WSD-01、R-ORM-02; spec/設計要點與取捨.md ADR-026、ADR-015 Update)
//
//受測: server/dataChannel.mjs 之 createAuthorizeExec(w-serv-webdata 之 opt.authorizeExec)、wrapOperOrm(opt.operOrm).
//政策: 資料通道只開 select——methodsExec:['select'] 為第一道(其他方法直呼回 invalid func[…], 由 api-verifyConn-auth DC-* 端到端驗證),
//      authorizeExec 只對已取得 userId 之 select 放行為第二道(本檔驗證; 經 HTTP 不可達之分支: userId 取不到時 getUserIdByToken 已先拒、非 select 不在函數清單).
//跑法: npx mocha test/unit-dataChannel.test.mjs --timeout 30000
import assert from 'assert'
import { createAuthorizeExec, wrapOperOrm } from '../server/dataChannel.mjs'
import { mkSrLog } from './tools/unitOrm.mjs'


describe('unit-dataChannel (資料通道只開 select、ORM 原文不外送, ADR-026)', function() {

    it('DCU-001 已取得 userId 之 select → true, 不記 log', function() {
        let { srLog, logs } = mkSrLog()
        let authorizeExec = createAuthorizeExec({ srLog })
        assert.strict.equal(authorizeExec({ userId: 'id-for-admin', tableName: 'targets', methodName: 'select', input: undefined }), true)
        assert.strict.deepEqual(logs, [])
    })

    it('DCU-002 寫入方法(insert/save/del/delAll/mix) → false, 記 srLog event authorizeExec(msg userNoPermission、tableName、methodName)', function() {
        for (let methodName of ['insert', 'save', 'del', 'delAll', 'mix']) {
            let { srLog, logs } = mkSrLog()
            let b = createAuthorizeExec({ srLog })({ userId: 'id-for-admin', tableName: 'targets', methodName, input: [] })
            assert.strict.equal(b, false, methodName)
            assert.strict.deepEqual(logs, [{ level: 'error', event: 'authorizeExec', ok: false, msg: 'userNoPermission', userId: 'id-for-admin', tableName: 'targets', methodName }], methodName)
        }
    })

    it('DCU-003 userId 取不到(空字串) → false, 記 msg cannotFindUserId', function() {
        let { srLog, logs } = mkSrLog()
        let b = createAuthorizeExec({ srLog })({ userId: '', tableName: 'users', methodName: 'select' })
        assert.strict.equal(b, false)
        assert.strict.equal(logs.length, 1)
        assert.strict.equal(logs[0].event, 'authorizeExec')
        assert.strict.equal(logs[0].msg, 'cannotFindUserId')
    })

    it('DCU-004 wrapOperOrm: 成功原樣回傳; ORM 拒絕(原文字串或 Error) → reject anUnexpectedErrorOccurred, 原文只入 srLog', async function() {
        let { srLog, logs } = mkSrLog()
        let ok = wrapOperOrm(async (u, t, m, i) => [{ u, t, m, i }], { srLog })
        assert.strict.deepEqual(await ok('id-u', 'targets', 'select', 'x'), [{ u: 'id-u', t: 'targets', m: 'select', i: 'x' }])
        for (let e of ['failed to select data', new Error('MDB_CORRUPTED')]) {
            let f = wrapOperOrm(async () => { throw e }, { srLog })
            let r = await f('id-u', 'targets', 'select').then(() => 'resolved', (err) => err)
            assert.strict.equal(r, 'anUnexpectedErrorOccurred')
        }
        assert.strict.deepEqual(logs.map((l) => [l.event, l.msg, l.raw, l.tableName, l.methodName]), [
            ['operOrm-error', 'anUnexpectedErrorOccurred', 'failed to select data', 'targets', 'select'],
            ['operOrm-error', 'anUnexpectedErrorOccurred', 'MDB_CORRUPTED', 'targets', 'select'],
        ])
    })

})
