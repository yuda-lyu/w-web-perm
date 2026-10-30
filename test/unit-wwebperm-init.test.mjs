//WWebPerm 建構期之設定處置(規則帳本 R-ORM-03、R-WSD-01、R-INIT-01; ADR-026)
//
//INIT-*: 真 WWebPerm 建構(真 w-serv-orm 1.1.10 之 checkOptRemoved、真 srLog 落檔於 test/_tmp), 只走「建構即拋」之路徑, 不開任何埠:
//  已移除之三鍵(useCheckUser / getUserById / useExcludeWhenNotAdmin)給予非 null/false 之值即同步拋錯(訊息單一來源在 w-serv-orm),
//  並於 srLog 記 event 'WWebPerm-init-error'(錯誤記 key), 且資料庫未被開啟(檢查先於 WServOrm 建構).
//  建構在子行程(test/tools/wwebpermInitChild.mjs)進行: 同行程建構時 srLog 之 pino transport 持有 log 檔至行程結束, 測試資料夾刪不掉而殘留(2026-10-14 實測).
//SITE-*: server/WWebPerm.mjs 之靜態站點不變式(去註解後之可執行碼): 不讀取、不轉交三鍵; checkOptRemoved 於 srLogInit 之後、WServOrm 之前;
//  WServHapiServer 之 useDbOrm:true 帶 authorizeExec; WServHapiServer 之建構包 try 並記 'WServHapiServer-init-error'.
//跑法: npx mocha test/unit-wwebperm-init.test.mjs --timeout 30000
import fs from 'fs'
import path from 'path'
import assert from 'assert'
import { spawnSync } from 'child_process'
import { fileURLToPath } from 'url'
import { sourceLines, blankStrings } from './tools/srcScan.mjs'

const projRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const fdTmp = path.join(projRoot, 'test', '_tmp', 'unit-wwebperm-init')
const fpWWebPerm = path.join(projRoot, 'server', 'WWebPerm.mjs')


//runChild: 於子行程建構 WWebPerm(cases 見 test/tools/wwebpermInitChild.mjs), 回傳各案結果
function runChild(cases) {
    let r = spawnSync(process.execPath, [path.join(projRoot, 'test', 'tools', 'wwebpermInitChild.mjs'), JSON.stringify(cases)], { cwd: projRoot, encoding: 'utf8', timeout: 60000 })
    let ln = (r.stdout || '').split(/\r?\n/).find((l) => l.startsWith('RESULT '))
    assert.ok(ln, `子行程未輸出結果, status=${r.status}, stderr=${String(r.stderr || '').slice(-600)}`)
    return JSON.parse(ln.slice('RESULT '.length))
}


//readLogEvents: 讀 logFd 下各檔之 JSON 行(srLog 經 pino transport 非同步落檔, 輪詢至見目標事件或逾時)
async function waitLogEvent(fdLog, event, timeoutMs = 8000) {
    let t0 = Date.now()
    while (Date.now() - t0 < timeoutMs) {
        if (fs.existsSync(fdLog)) {
            for (let fn of fs.readdirSync(fdLog)) {
                let fp = path.join(fdLog, fn)
                if (!fs.statSync(fp).isFile()) {
                    continue
                }
                for (let ln of fs.readFileSync(fp, 'utf8').split(/\r?\n/)) {
                    try {
                        let o = JSON.parse(ln)
                        if (o && o.event === event) {
                            return o
                        }
                    }
                    catch (e) {}
                }
            }
        }
        await new Promise((resolve) => setTimeout(resolve, 200))
    }
    return null
}


describe('unit-wwebperm-init (已移除設定之 fail-fast、資料通道授權、建構錯誤入 srLog, ADR-026)', function() {
    this.timeout(30000)

    before(function() {
        fs.rmSync(fdTmp, { recursive: true, force: true })
        fs.mkdirSync(fdTmp, { recursive: true })
    })

    after(async function() {
        //建構於子行程, 行程結束即釋放 log 檔; 仍以數次重試防 Windows 釋放延遲
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

    //R-ORM-03: 三鍵 × 非 null/false 之值 → 建構即拋 w-serv-orm 原文、資料庫未開啟
    it('INIT-001 已移除之三鍵給予非 null/false 之值 → 建構即拋(訊息為 w-serv-orm 之 checkOptRemoved 原文), 資料庫未開啟', async function() {
        let cases = [
            ['useCheckUser', true],
            ['useCheckUser', 'n'],
            ['getUserById', '__fn__'],
            ['useExcludeWhenNotAdmin', true],
            ['useExcludeWhenNotAdmin', 0],
        ].map(([k, v], i) => ({ k, v, url: path.join(fdTmp, `db-${i + 1}`), logFd: path.join(fdTmp, `logs-${i + 1}`) }))
        let rs = runChild(cases)
        assert.strict.equal(rs.length, cases.length)
        for (let r of rs) {
            assert.strict.ok(r.threw && String(r.msg).startsWith(`opt.${r.k} has been removed`), `${r.k} 應拋 opt.${r.k} has been removed, 實得 ${JSON.stringify(r)}`)
            assert.strict.equal(r.dbExists, false, `${r.k}: 檢查須先於 WServOrm 建構(資料庫未開啟)`)
        }
    })

    //R-INIT-01: 建構期錯誤記 srLog(key 為 event 與 msg)
    it('INIT-002 三鍵之拒絕記 srLog event WWebPerm-init-error(msg 為原文)', async function() {
        let fdLog = path.join(fdTmp, 'logs-init-002')
        let rs = runChild([{ k: 'useCheckUser', v: true, url: path.join(fdTmp, 'db-init-002'), logFd: fdLog }])
        assert.strict.ok(rs[0].threw, JSON.stringify(rs))
        let o = await waitLogEvent(fdLog, 'WWebPerm-init-error')
        assert.strict.ok(o, 'srLog 應有 WWebPerm-init-error')
        assert.strict.ok(String(o.msg).startsWith('opt.useCheckUser has been removed'), `msg 應為原文, 實得 ${o.msg}`)
    })

    //R-ORM-03: 可執行碼不得讀取或轉交三鍵(spec 作廢紀錄與 JSDoc 不在可執行碼內)
    it('SITE-OPT-001 WWebPerm 可執行碼不讀取、不轉交三鍵; checkOptRemoved 於 srLogInit 之後、WServOrm 之前', function() {
        let ls = sourceLines(fpWWebPerm, 'code')
        let bad = ls.filter((l) => /\b(useCheckUser|getUserById|useExcludeWhenNotAdmin)\b/.test(blankStrings(l.text)))
        assert.strict.deepEqual(bad.map((l) => `:${l.no} ${l.text.trim()}`), [], '可執行碼不得出現三鍵之識別字')
        let iSr = ls.find((l) => /let srLog = srLogInit\(opt\)/.test(l.text))
        let iChk = ls.find((l) => /\bcheckOptRemoved\(opt\)/.test(l.text))
        let iOrm = ls.find((l) => /\bWServOrm\(ds, WOrm, url, db, \{ funLog: genDiagFunLog\(\(o\) => srLog\.warn\(o\), \{ safeKeys: SAFE_KEYS \}\)\.funLog \}\)/.test(l.text)) //perm-run01(20261028): 第 5 參數僅 funLog(診斷輸出導入 srLog, R-ORM-DIAG-01); mig-perm(20261029): funLog 改由 wsemi 之 genDiagFunLog 產生; b-perm(20261030): 加 { safeKeys: SAFE_KEYS }(w-serv-orm 1.1.23 公開名單); 已移除之三鍵仍不得出現(上一斷言)
        assert.strict.ok(iSr && iChk && iOrm, `須有 srLogInit / checkOptRemoved(opt) / WServOrm(ds, WOrm, url, db, { funLog: genDiagFunLog((o) => srLog.warn(o), { safeKeys: SAFE_KEYS }).funLog }), 實得 ${JSON.stringify([iSr, iChk, iOrm].map((x) => x && x.no))}`)
        assert.strict.ok(iSr.no < iChk.no && iChk.no < iOrm.no, `順序須為 srLogInit(:${iSr.no}) < checkOptRemoved(:${iChk.no}) < WServOrm(:${iOrm.no})`)
    })

    //R-WSD-01: useDbOrm:true 必帶 authorizeExec(w-serv-webdata 1.1.7 起必填); 資料通道只開 select(methodsExec 只含 select、authorizeExec 經 createAuthorizeExec、operOrm 經 wrapOperOrm)
    it('SITE-WSD-001 WServHapiServer 之選項: useDbOrm:true、methodsExec 只含 select、authorizeExec 與 operOrm 經 dataChannel 之包裝', function() {
        let code = sourceLines(fpWWebPerm, 'code').map((l) => l.text).join('\n')
        let i0 = code.indexOf('let optWServHapiServer = {')
        assert.strict.ok(i0 >= 0, '找不到 let optWServHapiServer = {')
        assert.strict.ok(code.includes('new WServHapiServer(optWServHapiServer)'), 'WServHapiServer 須以 optWServHapiServer 建構')
        let seg = code.slice(i0, i0 + 20000)
        assert.strict.ok(/\buseDbOrm:\s*true\b/.test(seg), 'useDbOrm: true')
        assert.strict.ok(/\bmethodsExec:\s*\['select'\],/.test(seg), `methodsExec 須只含 select, 實得 ${(seg.match(/methodsExec:[^\n]*/) || ['(無)'])[0]}`)
        assert.strict.ok(/\bauthorizeExec:\s*createAuthorizeExec\(\{ srLog \}\),/.test(seg), 'authorizeExec 須為 createAuthorizeExec({ srLog })')
        assert.strict.ok(/\boperOrm:\s*wrapOperOrm\(procOrm, \{ srLog \}\),/.test(seg), 'operOrm 須為 wrapOperOrm(procOrm, { srLog })')
    })

    //R-INIT-01: WServHapiServer 之建構錯誤(1.1.6 起同步拋出)記 srLog 後轉拋
    it('SITE-INIT-001 new WServHapiServer 包在 try 內, catch 記 srLog event WServHapiServer-init-error 並轉拋', function() {
        let ls = sourceLines(fpWWebPerm, 'code')
        let k = ls.findIndex((l) => /new WServHapiServer\(/.test(l.text))
        assert.strict.ok(k >= 0, '找不到 new WServHapiServer(')
        let iTry = -1
        for (let i = k - 1; i >= Math.max(0, k - 3); i--) {
            if (ls[i].text.trim() === 'try {') {
                iTry = i
                break
            }
        }
        assert.strict.ok(iTry >= 0, `new WServHapiServer 前 3 行須有 try {, 實得 ${JSON.stringify(ls.slice(Math.max(0, k - 3), k).map((l) => l.text.trim()))}`)
        //與 try 同縮排之 catch(選項內 kpFunExt 函數自有之 try/catch 縮排較深, 不得誤認)
        let indent = ls[iTry].text.match(/^\s*/)[0]
        let iCatch = ls.findIndex((l, i) => i > k && l.text === `${indent}catch (err) {`)
        assert.strict.ok(iCatch > 0, `須有與 try 同縮排之 catch (err) {`)
        let after = ls.slice(iCatch, iCatch + 6).map((l) => l.text).join('\n')
        assert.strict.ok(/srLog\.error\(\{\s*event:\s*'WServHapiServer-init-error'/.test(after), 'catch 須記 WServHapiServer-init-error')
        assert.strict.ok(/throw err/.test(after), 'catch 須轉拋')
    })

})
