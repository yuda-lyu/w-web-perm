//測試種子子行程之完成判定(規則帳本 R-SEED-01; ADR-026)
//
//受測: test/tools/seedChild.mjs 之 runSeedChild(e2e-setup 之 seedDb 經此執行 g_initialTestData.mjs)
//契約: 見 stdout 之 'finish.' 才 resolve(並結束子行程); 子行程結束而未見 'finish.'(不論離開碼)、逾時、spawn 失敗一律 reject, 訊息附輸出尾段.
//修正前之 seedDb(e2e-setup.mjs)於子行程 exit 即 resolve: w-serv-orm 1.1.10 之 genTestData 遇逐筆失敗拋錯 → g_initialTestData 之 catch 印出、
//離開碼 0、不印 finish. → seedDb 視同成功(2026-10-14 V5 實測 449 ms), 測試以不完整之種子續跑.
//另以靜態站點守 g_*.mjs 之失敗離開碼與 seedDb 之接線.
//跑法: npx mocha test/unit-seedChild.test.mjs --timeout 30000
import fs from 'fs'
import path from 'path'
import assert from 'assert'
import { fileURLToPath } from 'url'
import { runSeedChild } from './tools/seedChild.mjs'

const projRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const fdTmp = path.join(projRoot, 'test', '_tmp', 'unit-seedChild')

let stub = (name, code) => {
    let fp = path.join(fdTmp, name)
    fs.writeFileSync(fp, code, 'utf8')
    return fp
}

let settle = async (p) => {
    try {
        return { ok: true, v: await p }
    }
    catch (err) {
        return { ok: false, v: String(err && err.message ? err.message : err) }
    }
}


describe('unit-seedChild (種子子行程之完成判定, ADR-026)', function() {
    this.timeout(30000)

    before(function() {
        fs.rmSync(fdTmp, { recursive: true, force: true })
        fs.mkdirSync(fdTmp, { recursive: true })
    })

    after(async function() {
        //被結束之子行程於 Windows 上釋放檔案需片刻, 重試數次(子行程之 cwd 為專案根, 不鎖本資料夾)
        for (let i = 0; i < 10; i++) {
            try {
                fs.rmSync(fdTmp, { recursive: true, force: true })
                break
            }
            catch (err) {
                await new Promise((resolve) => setTimeout(resolve, 300))
            }
        }
        let fdParent = path.join(projRoot, 'test', '_tmp')
        if (fs.existsSync(fdParent) && fs.readdirSync(fdParent).length === 0) {
            fs.rmdirSync(fdParent)
        }
    })

    it('SC-001 印出 finish. 即 resolve(子行程常駐亦結束之)', async function() {
        let fp = stub('ok-stay.mjs', `console.log('seeding...'); console.log('finish.'); setInterval(() => {}, 1000)`)
        let r = await settle(runSeedChild({ args: [fp], cwd: projRoot, timeoutMs: 10000 }))
        assert.strict.equal(r.ok, true, JSON.stringify(r))
    })

    it('SC-002 未印 finish. 而以離開碼 0 結束(種子腳本攔下錯誤後結束) → reject, 訊息附輸出尾段', async function() {
        let fp = stub('catch-exit0.mjs', `console.log('initialTestData catch Error: failed to write test data into table[users]')`)
        let r = await settle(runSeedChild({ args: [fp], cwd: projRoot, timeoutMs: 10000 }))
        assert.strict.equal(r.ok, false, '未見 finish. 不得視為成功')
        assert.strict.ok(r.v.includes('failed to write test data'), `訊息須附輸出尾段, 實得 ${r.v}`)
    })

    it('SC-003 非 0 離開碼 → reject', async function() {
        let fp = stub('exit1.mjs', `console.error('boom'); process.exit(1)`)
        let r = await settle(runSeedChild({ args: [fp], cwd: projRoot, timeoutMs: 10000 }))
        assert.strict.equal(r.ok, false)
        assert.strict.ok(r.v.includes('code=1') && r.v.includes('boom'), r.v)
    })

    it('SC-004 逾時 → reject 並結束子行程', async function() {
        let fp = stub('hang.mjs', `setInterval(() => {}, 1000)`)
        let t0 = Date.now()
        let r = await settle(runSeedChild({ args: [fp], cwd: projRoot, timeoutMs: 1500 }))
        assert.strict.equal(r.ok, false)
        assert.strict.ok(/timeout/i.test(r.v), r.v)
        assert.strict.ok(Date.now() - t0 < 8000, '逾時後即結束')
    })

    //R-SEED-01 之站點: 種子與維運腳本之失敗設非 0 離開碼; seedDb 經 runSeedChild
    it('SC-SITE-001 g_*.mjs 之 catch 皆設 process.exitCode; e2e-setup 之 seedDb 經 runSeedChild', function() {
        let files = ['g_initialTestData.mjs', 'g_initialData.mjs', 'g_provideUsers.mjs', 'g_provideGrups.mjs', 'g_providePemis.mjs', 'g_provideTargets.mjs', 'g_backupDb.mjs']
        let bad = []
        for (let f of files) {
            let c = fs.readFileSync(path.join(projRoot, f), 'utf8')
            if (!/\.catch\(\(err\) => \{[\s\S]*?process\.exitCode = 1/.test(c)) {
                bad.push(f)
            }
        }
        assert.strict.deepEqual(bad, [], `以下腳本之失敗未設非 0 離開碼: ${bad.join(', ')}`)
        let setup = fs.readFileSync(path.join(projRoot, 'test', 'tools', 'e2e-setup.mjs'), 'utf8')
        assert.strict.ok(/runSeedChild\(/.test(setup), 'seedDb 須經 runSeedChild')
        assert.strict.ok(!/child\.on\('exit', \(\) => finish\(\)\)/.test(setup), '不得再有「子行程結束即視為完成」之判定')
    })

})
