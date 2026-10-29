//srLog 之 raw(錯誤原文)移除連線憑證(mig-perm2, 20261029002013, 排程第 161 項; 主控 2026-10-30 裁定 T-a 選 B; 規則帳本 R-ORM-DIAG-02; 跨套件規格 C:\opensrcOper\dspec\診斷輸出與遮罩.md D1／D3、P1)
//規格句(本檔所翻譯者; 每條 assertion 之註解標明所對應之 [代號]):
//  [S1] 取自本套件直接呼叫 woItems 之 ORM 方法(不經 procOrm)之錯誤原文, 寫入 srLog 之 raw 前經 wsemi maskDiagText 以 reject 清單(getRawSecrets(url))遮罩; 站點群全數套用:
//       procCore 讀回(updateTabItems-readBack-error)、procCore errLog、syncCore 讀庫(select)、syncCore doWrite、syncCore 引用端讀庫(holder select)、cascadeWrite toRaw(raw、rawRestore)、routeResult(raw 前 500 字);
//       WWebPerm 之 verifyConn msg 見 api-maskRaw. [前一輪(mig-perm)將 routeResult 歸為固定詞彙, 本輪更正: getPerm 之 woItems.*.select 錯誤由此出口入 log]
//  [S2] 秘密經參數 secrets 傳入, 必帶(不留無秘密之舊介面): procCore、syncCore、writeWithCascade、createRouteResult 缺 secrets 即 TypeError／reject TypeError(fail-closed).
//  [S3] 固定詞彙(語系鍵、procOrm 之固定英文詞彙)與 msg／key 欄位不經遮罩: errLog 之 msg 與對外 reject 值為 key 原樣、語系鍵不另記 raw; 只遮 raw 欄位之原文.
//  [S4] 只遮憑證(D3、P1): 單獨帳號與儲存路徑不遮; 儲存路徑形式之連線字串(w-orm-lmdb './db')之 reject 清單為空(同 w-serv-orm 之 getUrlSecrets).
//  [S5] 先遮罩再截斷(routeResult): 跨在第 500 字之憑證不得因先截斷而殘留前綴.
//  [S6] 非憑證之診斷文字保留(遮罩不把整段原文吞掉).
//受測: server/maskRaw.mjs、server/procCore.mjs、server/syncCore.mjs、server/cascadeWrite.mjs、server/routeResult.mjs; 依賴真實實作(w-serv-orm 實例 mkCore、wsemi maskDiagText), 僅資料表為記憶體替身(mkTable), 外來錯誤以替身表之 select／save 注入(模擬驅動訊息回顯連線字串).
//跑法(需測試鎖): node C:/opensrcOper/tools/quiet-run.mjs --lock --name maskraw -- npx mocha test/unit-maskRaw.test.mjs --timeout 60000
import assert from 'assert'
import cloneDeep from 'lodash-es/cloneDeep.js'
import cacheSt from 'wsemi/src/cacheSt.mjs'
import ds from '../src/schema/index.mjs'
import proc, { toOutKey } from '../server/procCore.mjs'
import syncCore from '../server/syncCore.mjs'
import createRouteResult from '../server/routeResult.mjs'
import createLockSave from '../server/lockSave.mjs'
import planRefChanges from '../src/js/refCascade.mjs'
import { writeWithCascade } from '../server/cascadeWrite.mjs'
import { getRawSecrets, checkRawSecrets, msgOfErr, maskRaw, rawOfErr, msgForLog } from '../server/maskRaw.mjs'
import { mkTable, mkCore, mkSrLog } from './tools/unitOrm.mjs'
import { sourceLines } from './tools/srcScan.mjs'
import path from 'path'
import { fileURLToPath } from 'url'

const A = assert.strict

const T0 = '2026-01-01T00:00:00.000+08:00'
const AUDIT = { userId: 'id-seed', timeCreate: T0, userIdUpdate: 'id-seed', timeUpdate: T0 }
const OR = { mode: 'OR', isActive: 'y' }
let J = (o) => JSON.stringify(o)

const USER = 'permuser'
const PW = 'Zx9kQ2mLp7' //連線密碼(10 字元, 非 key=value 形式出現時只靠已知秘密清單遮罩)
const URL_CRED = `mongodb://${USER}:${PW}@db.example.com:27017/wperm`
const SEC = getRawSecrets(URL_CRED)
const MARK = 'ENGINE-FAILED-MARK' //非憑證之診斷文字: 遮罩後須保留

//echo: 驅動訊息回顯連線字串與裸密碼(模擬 mongo 之 Unable to parse 與認證失敗訊息)
let echo = (tag) => `${MARK}-${tag} auth refused bare ${PW} url=${URL_CRED}`

//assertClean: 文字不含密碼、不含帳密並列、不含連線字串; 且保留標記(非憑證文字不被吞掉)
let assertClean = (text, tag, label) => {
    A.ok(!text.includes(PW), `${label}: 不得含密碼, 實得 ${text.slice(0, 300)}`)
    A.ok(!text.includes(`${USER}:${PW}`), `${label}: 不得含帳密並列`)
    A.ok(!text.includes(URL_CRED), `${label}: 不得含連線字串`)
    A.ok(text.includes(`${MARK}-${tag}`), `${label}: 非憑證之診斷文字須保留, 實得 ${text.slice(0, 300)}`)
}


//seedRows: 四表(後台列 from ''; 供 procCore／syncCore 之站點案例)
function seedRows() {
    let mk = (table, o) => ({ ...ds[table].funNew(), ...AUDIT, ...o })
    return {
        targets: [
            mk('targets', { id: '專案A/頁1/區塊1', order: 1, description: 'd-t1', from: '' }),
        ],
        pemis: [
            mk('pemis', { id: 'id-p1', order: 1, name: 'P1', description: 'd-p1', from: '', crules: J({ '專案A/頁1/區塊1': 'y' }) }),
        ],
        grups: [
            mk('grups', { id: 'id-g1', order: 1, name: 'G1', description: 'd-g1', from: '', cpemis: J({ P1: OR }) }),
        ],
        users: [
            mk('users', { id: 'id-u1', order: 1, name: 'u1', email: 'u1@example.com', description: 'd-u1', from: '', cgrups: J({ G1: OR }), isAdmin: 'n', isActive: 'y' }),
        ],
    }
}


describe('unit-maskRaw (srLog raw 移除連線憑證; mig-perm2 T-a 選 B, R-ORM-DIAG-02)', function() {

    this.timeout(60000)

    let envs = []

    //createEnv: 每案一組替身資料表與真 w-serv-orm 實例; secrets 為 getRawSecrets 之結果(預設 SEC); opt.seed(seed) 改種子; opt.procOrmWrap(core.procOrm) 回替身 procOrm(供 syncCore 之 procOrm 失敗案例)
    function createEnv(opt = {}) {
        let seed = seedRows()
        if (opt.seed) {
            opt.seed(seed)
        }
        let woItems = {}
        for (let k of Object.keys(seed)) {
            woItems[k] = mkTable(seed[k])
        }
        let { srLog, logs } = mkSrLog()
        let cst = cacheSt()
        let core = mkCore(ds, woItems)
        let secrets = opt.secrets || SEC
        let procOrm = opt.procOrmWrap ? opt.procOrmWrap(core.procOrm) : core.procOrm
        let sc = syncCore({ woItems, procOrm, lockTabs: core.withTabLocks, srLog, secrets })
        let pc = proc(woItems, procOrm, { srLog, ...core.lock, secrets, lockSave: createLockSave(cst) })
        let env = { seed, woItems, logs, cst, core, sc, pc }
        envs.push(env)
        return env
    }

    afterEach(function() {
        envs.forEach((e) => e.cst.clear())
        envs = []
    })

    //failOn: 替身表之方法於 when() 為真時拋出 mk() 之錯誤(模擬 ORM 驅動錯誤; 直接呼叫 woItems 之站點與 procOrm 內部皆走同一表物件)
    let failOn = (table, method, mkErr, when = () => true) => {
        let orig = table[method]
        table[method] = async (...a) => {
            if (when()) {
                throw mkErr()
            }
            return await orig.apply(table, a)
        }
    }
    let wrote = (t) => () => t.cnt.insert + t.cnt.save + t.cnt.del + t.cnt.delAll > 0
    let text = (env) => JSON.stringify(env.logs)
    let sync = async (env, kt, from, rows) => {
        try {
            return { ok: true, v: await env.sc.syncAndReplaceTabs('id-for-application', { from, rows }, kt) }
        }
        catch (err) {
            return { ok: false, v: err }
        }
    }
    const G = (srcKey, name, extra = {}) => ({ srcKey, name, description: `d-${srcKey}`, order: 10, cpemis: J({ P1: OR }), ...extra })


    describe('maskRaw 模組(getRawSecrets／checkRawSecrets／msgOfErr／maskRaw／rawOfErr)', function() {

        it('MR-001 [S1][S4] 連線字串形式: reject 清單遮密碼、帳密並列、整串連線字串; 單獨帳號與其餘診斷文字保留', function() {
            let s = maskRaw(`${echo('a')} user ${USER} ok`, SEC)
            assertClean(s, 'a', 'maskRaw')
            A.ok(s.includes(`user ${USER} ok`), '單獨帳號不遮(D3／P1: reject 清單只含憑證)')
            A.ok(SEC.reject.includes(PW))
            A.ok(!SEC.reject.includes(USER), 'reject 清單不得含單獨帳號')
        })

        it('MR-002 [S4] 儲存路徑形式(w-orm-lmdb 之 ./db、絕對路徑): reject 清單為空, 路徑原樣保留(同 w-serv-orm 之 getUrlSecrets); 內建樣式(password=)仍遮', function() {
            for (let u of ['./db', 'C:\\data\\db01', '/var/lib/perm/db']) {
                let sec = getRawSecrets(u)
                A.deepEqual([...sec.reject], [], `${u}: 路徑不是憑證, reject 清單應為空`)
                let s = maskRaw(`ENOENT: no such file, open '${u}/users/data.mdb' password=abc1234`, sec)
                A.ok(s.includes(`${u}/users/data.mdb`), `${u}: 儲存路徑不得被遮, 實得 ${s}`)
                A.ok(!s.includes('abc1234'), `${u}: 內建之憑證鍵值對樣式仍遮, 實得 ${s}`)
            }
        })

        it('MR-003 msgOfErr／rawOfErr: 字串原樣、Error 取 message、其餘 String(); rawOfErr 於取原文後遮罩; 非字串之遮罩不拋錯', function() {
            A.equal(msgOfErr('abc'), 'abc')
            A.equal(msgOfErr(new Error('boom')), 'boom')
            A.equal(msgOfErr({ message: 'm' }), 'm')
            A.equal(msgOfErr(42), '42')
            A.equal(msgOfErr(new Error('')), 'Error')
            assertClean(rawOfErr(new Error(echo('b')), SEC), 'b', 'rawOfErr(Error)')
            assertClean(rawOfErr(echo('c'), SEC), 'c', 'rawOfErr(string)')
            A.equal(rawOfErr('failed to select data', SEC), 'failed to select data', '固定詞彙原樣(清單中無其字樣)')
            A.equal(maskRaw(123, SEC), 123, 'maskDiagText 對非字串原樣回傳, 不拋錯')
        })

        it('MR-004 [S2] checkRawSecrets: 缺、null、字串、無 reject 陣列者 TypeError; getRawSecrets 之結果通過', function() {
            for (let bad of [undefined, null, 'x', 1, {}, { reject: 'x' }, { detail: [] }]) {
                A.throws(() => checkRawSecrets(bad, 'who'), (e) => e instanceof TypeError && /^who: secrets must be/.test(e.message), `應 TypeError: ${J(bad)}`)
            }
            checkRawSecrets(SEC, 'who')
            checkRawSecrets(getRawSecrets('./db'), 'who')
        })

        it('MR-006 [S3] msgForLog(verifyConn 之 msg): 已知語系鍵原樣(秘密與鍵字樣重疊亦同); 非鍵之字串與 Error 取原文並遮罩; 無訊息者回預設文字(不經遮罩)', function() {
            let isKey = (s) => toOutKey(s, '') !== ''
            let secOverlap = getRawSecrets('mongodb://permuser:NotAdmin@db.example.com:27017/wperm')
            A.ok(secOverlap.reject.includes('NotAdmin'), '前提: 密碼 NotAdmin 在 reject 清單')
            A.equal(msgForLog('userNotAdmin', isKey, secOverlap, 'checkTokenFail'), 'userNotAdmin', '語系鍵原樣(未被遮罩成 user***)')
            assertClean(msgForLog(new Error(echo('m1')), isKey, SEC, 'checkTokenFail'), 'm1', 'Error')
            assertClean(msgForLog(echo('m2'), isKey, SEC, 'checkTokenFail'), 'm2', '非鍵字串')
            A.equal(msgForLog(undefined, isKey, SEC, 'checkTokenFail'), 'checkTokenFail')
            A.equal(msgForLog(new Error(''), isKey, SEC, 'checkTokenFail'), 'checkTokenFail', '空訊息之 Error 回預設文字')
            A.equal(msgForLog({}, isKey, SEC, 'checkTokenFail'), 'checkTokenFail')
        })

        it('MR-007 [S1][S2] 站點接線(原始碼靜態): WWebPerm 由 url 導出 rawSecrets 恰一處, 並以同一個 rawSecrets 傳給 syncCore、procCore、createRouteResult 與 verifyConn 之 msgForLog(缺或傳錯來源即紅; 缺傳另有各模組之必帶檢查, MR-005)', function() {
            let code = sourceLines(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'server', 'WWebPerm.mjs'), 'code').map((l) => l.text).join('\n')
            A.equal((code.match(/\bgetRawSecrets\(/g) || []).length, 1, 'getRawSecrets( 於 WWebPerm 恰一處')
            A.equal((code.match(/\blet rawSecrets = getRawSecrets\(url\)/g) || []).length, 1, 'rawSecrets 由 url 導出恰一處')
            A.ok(/\bsyncCore\(\{[^}]*\bsecrets: rawSecrets\b[^}]*\}\)/.test(code), 'syncCore 須帶 secrets: rawSecrets')
            A.ok(/\bprocCore\(woItems,\s*procOrm,\s*\{[^}]*\bsecrets: rawSecrets\b[^}]*\}\)/.test(code), 'procCore 須帶 secrets: rawSecrets')
            A.ok(/\bcreateRouteResult\(\{[^}]*\bsecrets: rawSecrets\b[^}]*\}\)/.test(code), 'createRouteResult 須帶 secrets: rawSecrets')
            A.ok(/\bmsgForLog\(err,.*,\s*rawSecrets,/.test(code), 'verifyConn 之 msgForLog 須帶 rawSecrets')
            A.equal((code.match(/\bsecrets: rawSecrets\b/g) || []).length, 3, '帶 secrets 之模組恰 3 個(syncCore、procCore、createRouteResult)')
        })

        it('MR-005 [S2] 必帶 secrets(不留舊介面): procCore、syncCore、createRouteResult 缺 secrets 即 TypeError; writeWithCascade(含無計畫之直通路徑)reject TypeError', async function() {
            let { srLog } = mkSrLog()
            let seed = seedRows()
            let woItems = {}
            for (let k of Object.keys(seed)) {
                woItems[k] = mkTable(seed[k])
            }
            let core = mkCore(ds, woItems)
            A.throws(() => proc(woItems, core.procOrm, { srLog, ...core.lock, secrets: undefined, lockSave: () => {} }), TypeError)
            A.throws(() => syncCore({ woItems, procOrm: core.procOrm, lockTabs: core.withTabLocks, srLog }), TypeError)
            A.throws(() => createRouteResult({ srLog }), TypeError)
            let e1 = await writeWithCascade({ plan: null, holdersOld: [], woItems, procOrm: async () => {}, userId: 'u', srLog, writeMain: async () => 'M' }).then(() => null, (e) => e)
            A.ok(e1 instanceof TypeError, `writeWithCascade 缺 secrets 應 reject TypeError, 實得 ${String(e1)}`)
        })

    })


    describe('procCore 站點(直接 woItems 之 ORM 錯誤)', function() {

        it('MR-101 [S1][S6] updateTabItems 讀回失敗(寫入已生效、returnRows 之 select 失敗) → srLog updateTabItems-readBack-error 之 raw 已遮; 存檔仍回成功', async function() {
            let env = createEnv()
            let { woItems, pc, logs } = env
            failOn(woItems.targets, 'select', () => new Error(echo('rb')), wrote(woItems.targets))
            let rows = cloneDeep(env.seed.targets)
            rows[0].description = 'changed'
            let r = await pc.updateTargets('id-admin', rows, { returnRows: true })
            A.equal(r, 'saveTabItemsSuccess', '讀回失敗不使存檔失敗(回 null, 前端退回等推播)')
            let l = logs.find((x) => x.event === 'updateTabItems-readBack-error')
            A.ok(l, `應記 updateTabItems-readBack-error, 實得 ${text(env).slice(0, 300)}`)
            A.equal(l.msg, 'getDataError', 'msg 為固定鍵, 不經遮罩')
            assertClean(l.raw, 'rb', 'readBack raw')
        })

        it('MR-102 [S1][S3][S6] errLog: 直接 woItems 之 select 失敗(原文回顯連線字串) → srLog 之 raw 已遮, msg 為固定鍵 saveWriteFail, 對外 reject 為 saveWriteFail 不含原文', async function() {
            let env = createEnv()
            let { woItems, pc, logs } = env
            failOn(woItems.targets, 'select', () => new Error(echo('el')))
            let rows = cloneDeep(env.seed.targets)
            rows[0].description = 'changed'
            let e = await pc.updateTargets('id-admin', rows).then(() => null, (err) => err)
            A.equal(e, 'saveWriteFail', '對外為固定語系鍵(R-ORM-02)')
            let l = logs.find((x) => x.event === 'updateTargets-error')
            A.ok(l, `應記 updateTargets-error, 實得 ${text(env).slice(0, 300)}`)
            A.equal(l.msg, 'saveWriteFail')
            assertClean(l.raw, 'el', 'errLog raw')
            assertClean(text(env), 'el', '整份 srLog')
        })

        it('MR-103 [S3] errLog 固定詞彙不遮: 秘密與語系鍵字樣重疊(密碼 RowField, 語系鍵 saveRowFieldInvalid) → msg 與對外 reject 為鍵原樣、不另記 raw(是否為語系鍵以未遮罩之原文判定)', async function() {
            let secOverlap = getRawSecrets('mongodb://permuser:RowField@db.example.com:27017/wperm')
            A.ok(secOverlap.reject.includes('RowField'), '前提: 密碼 RowField 在 reject 清單')
            let env = createEnv({ secrets: secOverlap })
            let e = await env.pc.updateTargets('id-admin', 'not-an-array').then(() => null, (err) => err) //rows 非陣列 → 固定鍵 saveRowFieldInvalid
            A.equal(e, 'saveRowFieldInvalid', '對外 reject 為鍵原樣(未被遮罩成 save***Invalid)')
            let l = env.logs.find((x) => x.event === 'updateTargets-error')
            A.ok(l, `應記 updateTargets-error, 實得 ${text(env).slice(0, 300)}`)
            A.equal(l.msg, 'saveRowFieldInvalid', 'msg 為鍵原樣')
            A.ok(!('raw' in l), `語系鍵(固定詞彙)不另記 raw(raw 等於 key 時省略; 若先遮罩再比較, 重疊字樣會使 raw 與 key 不等而多記), 實得 ${J(l)}`)
        })

    })


    describe('syncCore 站點(外部匯入; 直接 woItems 之 ORM 錯誤)', function() {

        it('MR-201 [S1] 讀庫(rsAll select)失敗 → syncAndReplaceTabs-error 之 raw 已遮、step 為 select; 對外回 anUnexpectedErrorOccurred', async function() {
            let env = createEnv()
            failOn(env.woItems.targets, 'select', () => new Error(echo('s1')))
            let r = await sync(env, 'targets', 'appX', [{ srcKey: '專案X/頁1/區塊1', description: 'd', order: 10 }])
            A.deepEqual(r, { ok: false, v: 'anUnexpectedErrorOccurred' })
            let l = env.logs.find((x) => x.event === 'syncAndReplaceTabs-error' && x.step === 'select')
            A.ok(l, `應記 step=select 之 syncAndReplaceTabs-error, 實得 ${text(env).slice(0, 300)}`)
            A.equal(l.msg, 'anUnexpectedErrorOccurred')
            assertClean(l.raw, 's1', 'select raw')
        })

        it('MR-202 [S1] 寫入階段非固定詞彙之失敗(procOrm 拋出回顯連線字串之 Error, 如舊版 w-serv-orm) → doWrite 之 raw 已遮; 對外回 saveWriteFail', async function() {
            let env = createEnv({
                procOrmWrap: (procOrm) => async (userId, table, method, data, opt) => {
                    if (method === 'insert') {
                        throw new Error(echo('w1'))
                    }
                    return await procOrm(userId, table, method, data, opt)
                },
            })
            let r = await sync(env, 'grups', 'appX', [G('a', 'GA')])
            A.deepEqual(r, { ok: false, v: 'saveWriteFail' })
            let l = env.logs.find((x) => x.event === 'syncAndReplaceTabs-error' && x.msg === 'saveWriteFail')
            A.ok(l, `應記 saveWriteFail 之 syncAndReplaceTabs-error, 實得 ${text(env).slice(0, 300)}`)
            A.equal(l.msg, 'saveWriteFail', 'msg 為固定鍵, 不經遮罩')
            assertClean(l.raw, 'w1', 'doWrite raw')
            assertClean(text(env), 'w1', '整份 srLog')
        })

        it('MR-203 [S1] 引用連帶之引用端讀庫(holder select)失敗 → raw 已遮、step 為 select; 對外回 anUnexpectedErrorOccurred', async function() {
            let env = createEnv({
                seed: (s) => {
                    s.grups.push({ ...ds.grups.funNew(), ...AUDIT, id: 'id-x1', order: 3, name: 'GA', description: 'old', from: 'appX', srcKey: 'a', cpemis: '{}' })
                    s.users[0].cgrups = J({ G1: OR, GA: OR })
                },
            })
            failOn(env.woItems.users, 'select', () => new Error(echo('h1')))
            let r = await sync(env, 'grups', 'appX', [G('b', 'GB', { cpemis: '{}' })]) //GA 刪除 → 須取引用端 users 之鎖並讀庫
            A.deepEqual(r, { ok: false, v: 'anUnexpectedErrorOccurred' })
            let l = env.logs.find((x) => x.event === 'syncAndReplaceTabs-error' && x.step === 'select')
            A.ok(l, `應記 step=select 之 syncAndReplaceTabs-error, 實得 ${text(env).slice(0, 300)}`)
            assertClean(l.raw, 'h1', 'holder select raw')
        })

    })


    describe('cascadeWrite 站點(引用連帶補償之 raw／rawRestore)', function() {

        //mk: 以替身記錄; failProcOrm 為引用端寫入(procOrm)之拒絕值, restore(data) 為補償 save 之行為(可拋錯)
        let mk = (opt = {}) => {
            let { srLog, logs } = mkSrLog()
            let holdersOld = [{ id: 'u1', cgrups: J({ A: OR }), userIdUpdate: 'u0', timeUpdate: 't0', email: 'e@x', from: '' }]
            let plan = planRefChanges({ keyTable: 'grups', rowsOld: [{ id: 'g1', name: 'A' }], rowsNew: [{ id: 'g1', name: 'B' }], holdersOld })
            let woItems = {
                [plan.holder]: {
                    save: async (data) => {
                        if (opt.restore) {
                            return opt.restore(data)
                        }
                        return data.map(() => ({ ok: 1 }))
                    },
                },
            }
            let procOrm = async () => Promise.reject(opt.failProcOrm)
            let go = () => writeWithCascade({ plan, holdersOld, woItems, procOrm, userId: 'id-op', srLog, writeMain: async () => 'MAIN', secrets: SEC })
            return { logs, go }
        }

        it('MR-301 [S1][S6] 補償成功(refCascade-restored): raw 已遮; 非憑證文字保留', async function() {
            let t = mk({ failProcOrm: new Error(echo('c1')) })
            let e = await t.go().then(() => null, (err) => err)
            A.ok(e instanceof Error, '重新拋出原錯誤')
            let l = t.logs.find((x) => x.event === 'refCascade-restored')
            A.ok(l, `應記 refCascade-restored, 實得 ${J(t.logs).slice(0, 300)}`)
            assertClean(l.raw, 'c1', 'restored raw')
        })

        it('MR-302 [S1] 補償失敗(雙重故障; refCascade-restore-error): raw 與 rawRestore 皆已遮; 固定詞彙 save result ok:0 原樣', async function() {
            let t = mk({
                failProcOrm: new Error(echo('c2')),
                restore: async () => {
                    throw new Error(echo('c3'))
                },
            })
            let e = await t.go().then(() => null, (err) => err)
            A.equal(e, 'saveCascadePartial')
            let l = t.logs.find((x) => x.event === 'refCascade-restore-error')
            A.ok(l, `應記 refCascade-restore-error, 實得 ${J(t.logs).slice(0, 300)}`)
            A.equal(l.msg, 'saveCascadePartial')
            assertClean(l.raw, 'c2', 'restore-error raw')
            assertClean(l.rawRestore, 'c3', 'restore-error rawRestore')

            let t2 = mk({ failProcOrm: new Error(echo('c4')), restore: async (data) => data.map(() => ({ ok: 0 })) })
            await t2.go().then(() => null, (err) => err)
            let l2 = t2.logs.find((x) => x.event === 'refCascade-restore-error')
            A.equal(l2.rawRestore, 'save result ok:0', '固定詞彙原樣(不經遮罩)')
            assertClean(l2.raw, 'c4', 'restore-error raw(ok:0 形狀)')
        })

        it('MR-303 [S1] 引用端 id 與憑證併存: 兩種遮罩皆生效(id 遮為 id[*]、憑證遮為 ***), 順序不使 id 字面比對落空', async function() {
            let t = mk({ failProcOrm: new Error(`${echo('c5')} id[u1] id[unknown-id]`) })
            await t.go().then(() => null, (err) => err)
            let l = t.logs.find((x) => x.event === 'refCascade-restored')
            assertClean(l.raw, 'c5', 'raw')
            A.ok(!l.raw.includes('u1') && l.raw.includes('id[*]'), `引用端 id 仍遮罩, 實得 ${l.raw}`)
        })

    })


    describe('routeResult 站點(hapi 路由失敗結果; getPerm 等之 woItems 直接讀取錯誤由此入 log)', function() {

        let mkRr = (secrets = SEC) => {
            let logs = []
            let srLog = { error: (o) => logs.push(o) }
            return { logs, rr: createRouteResult({ srLog, secrets }) }
        }

        it('MR-401 [S1][S3] Error／字串之原文回顯連線字串 → srLog raw 已遮; 對外 msg 仍為 anUnexpectedErrorOccurred', function() {
            for (let msg of [new Error(echo('r1')), echo('r1')]) {
                let { logs, rr } = mkRr()
                let r = rr({ state: 'error', msg }, 'api/getPerm-error')
                A.deepEqual(r, { state: 'error', msg: 'anUnexpectedErrorOccurred' })
                A.equal(logs.length, 1)
                A.equal(logs[0].msg, 'anUnexpectedErrorOccurred')
                assertClean(logs[0].raw, 'r1', 'routeResult raw')
            }
        })

        it('MR-402 [S3] 語系鍵不記 log、不經遮罩(秘密與鍵字樣重疊亦同): 已知鍵原樣回傳', function() {
            let { logs, rr } = mkRr(getRawSecrets('mongodb://permuser:NotAdmin@db.example.com:27017/wperm'))
            let r = rr({ state: 'error', msg: 'userNotAdmin' }, 'api/getPerm-error')
            A.deepEqual(r, { state: 'error', msg: 'userNotAdmin' })
            A.deepEqual(logs, [])
        })

        it('MR-403 [S5] 憑證跨在第 500 字: 先遮罩再截斷, 不殘留憑證前綴; 非憑證文字保留', function() {
            let { logs, rr } = mkRr()
            let msg = `${MARK}-r3 ${'x'.repeat(472)} ${PW} ${'y'.repeat(100)}`
            A.ok(msg.indexOf(PW) < 500 && msg.indexOf(PW) + PW.length > 500, `前提: 憑證跨在第 500 字(起於 ${msg.indexOf(PW)})`)
            let r = rr({ state: 'error', msg }, 'api/getPerm-error')
            A.equal(r.msg, 'anUnexpectedErrorOccurred')
            let raw = logs[0].raw
            A.ok(raw.length <= 500, `raw 至多 500 字, 實得 ${raw.length}`)
            A.ok(!raw.includes(PW.slice(0, 4)), `不得殘留憑證前綴 ${PW.slice(0, 4)}, 實得 ...${raw.slice(-60)}`)
            A.ok(raw.startsWith(`${MARK}-r3`), '非憑證文字保留')
        })

    })

})
