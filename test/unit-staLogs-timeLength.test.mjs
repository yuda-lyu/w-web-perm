//統計(staEvent)之 timeLength 入口檢測(排程第 301 項; 規格 C:/opensrcOper/dspec/輸入參數之檢測機制.md: timeLength 為必須參數, 個數類 N2 非負整數 0～3650, 數字字串收下並以轉換值為準 K4, 無效 reject 固定鍵不回顯 K9; 比照 w-web-api staLogsCore 之 errTimeLengthInvalid)
//
//TL-001 判準函數 parseTimeLength 之有效／無效全表(進行程序內; 無效之輸入不會進迴圈)
//TL-002 無效 timeLength × 各層入口(genPlan、staLogs、staEvent、staEvent.callWorker、procStaInfor.getStaEvent〔kpFunExt 之下層〕、mock 模式): 一律被拒且為固定鍵 errTimeLengthInvalid(genPlan 為同步 throw Error, 其餘為 reject 字串)
//TL-003 有效 timeLength × 各層入口: 照常產出(桶數 = 天數 × 24 + 1)
//TL-004 K4 檢測之值即使用之值: '7' 與 7 共用同一 single-flight(同一 promise)
//TL-005 opt.timeNow 為 NaN、±Infinity、超出 Date 範圍者視為未給(退回現在), 不再使 kpTime 迴圈成為無窮迴圈
//TL-006 站點不變式: 凡使用 timeLength 之伺服端檔案為已盤點之全集; 檢測先於 subtract／快取鍵; 伺服端唯一對外入口 getStaEvent 只經 psi.getStaEvent
//
//why 子行程: 修前之 NaN、'abc'、±Infinity、{}、1e20 等使 genPlan 之 `while (!tCurr.isAfter(tEnd))` 為同步無窮迴圈, 同行程內 mocha 之逾時計時器亦無法觸發, 故 TL-002／003／005 以 spawnSync 之 timeout 終止(修前紅: 逾時即判該層「卡住」)
//跑法: npx mocha test/unit-staLogs-timeLength.test.mjs --timeout 600000
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { spawnSync } from 'child_process'
import { fileURLToPath } from 'url'
import ot from 'dayjs'
import { staLogs, parseTimeLength, MAX_TIME_LENGTH_DAY } from '../server/staLogs/staLogsCore.mjs'
import { sourceLines } from './tools/srcScan.mjs'

const A = assert.strict
const projRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const fdTmp = path.join(projRoot, 'test', '_tmp', 'staLogs-timeLength')
const fdLog = path.join(fdTmp, 'emptylogs')
const CHILD = path.join(projRoot, 'test', 'tools', 'timeLengthChild.mjs')
const KEY = 'errTimeLengthInvalid'

//有效候選(名稱同子行程) → 天數
const VALID = {
    'v-0': 0, 'v-negzero': 0, 'v-1': 1, 'v-7': 7, 'v-undef': 7, 'v-str7': 7, 'v-str-spaced': 7, 'v-str-sci': 10, 'v-str-plus': 7, 'v-30': 30, 'v-3650': 3650,
}
//無效候選(名稱同子行程)
const INVALID = [
    'x-NaN', 'x-Infinity', 'x-negInfinity', 'x-neg1', 'x-negHuge', 'x-float1.5', 'x-3651', 'x-100000', 'x-1e20', 'x-1e308',
    'x-strAbc', 'x-strEmpty', 'x-strSpace', 'x-strHex', 'x-strInfinity', 'x-strNaN', 'x-strFloat', 'x-strNeg', 'x-strHuge', 'x-strMarker',
    'x-null', 'x-true', 'x-false', 'x-obj', 'x-objValueOf', 'x-arr', 'x-arr7', 'x-bigint', 'x-symbol', 'x-numberObj', 'x-fn', 'x-revokedProxy', 'x-date',
]
const LAYERS = ['genPlan', 'staLogs', 'staEvent', 'staEventWorker', 'psi', 'psiMock']


//runCand: 以子行程跑單一候選, 回 { timedOut, status, byLayer: { 層: { kind, v } }, ms }
function runCand(name, timeoutMs = (Number(process.env.TL_CHILD_TIMEOUT_MS) || 15000)) { //TL_CHILD_TIMEOUT_MS: 變異測試縮短卡住之候選的等待(預設 15 秒)
    let t0 = Date.now()
    let r = spawnSync(process.execPath, [CHILD, name, fdLog], { cwd: projRoot, encoding: 'utf8', timeout: timeoutMs, killSignal: 'SIGKILL', maxBuffer: 16 * 1024 * 1024, windowsHide: true })
    let byLayer = {}
    for (let ln of String(r.stdout || '').split(/\r?\n/)) {
        try {
            let o = JSON.parse(ln)
            byLayer[o.layer] = o
        }
        catch (err) {}
    }
    return { timedOut: (r.error && r.error.code === 'ETIMEDOUT') === true, status: r.status, byLayer, ms: Date.now() - t0, stderr: String(r.stderr || '').slice(-300) }
}


describe('unit-staLogs-timeLength (統計 timeLength 入口檢測, 排程第 301 項)', function() {
    this.timeout(600000)

    before(function() {
        fs.rmSync(fdTmp, { recursive: true, force: true })
        fs.mkdirSync(fdLog, { recursive: true })
    })

    after(function() {
        fs.rmSync(fdTmp, { recursive: true, force: true })
    })


    it('TL-001 parseTimeLength: 0～3650 之整數與其數字字串有效(回轉換後 number); 其餘一律 null(不拋錯)', function() {
        A.equal(MAX_TIME_LENGTH_DAY, 3650)
        //有效(含頭尾空白、科學記號、正號、前導零之數字字串; -0)
        for (let [v, n] of [[0, 0], [-0, 0], [1, 1], [7, 7], [3650, 3650], ['7', 7], [' 7 ', 7], ['1e1', 10], ['+7', 7], ['00012', 12], ['0', 0], ['3650', 3650]]) {
            let r = parseTimeLength(v)
            A.ok(typeof r === 'number' && r === n, `parseTimeLength(${JSON.stringify(v)}) 應為 number ${n}, 實得 ${typeof r} ${r}`)
        }
        //無效
        let revoked = Proxy.revocable({}, {})
        revoked.revoke()
        let bads = [NaN, Infinity, -Infinity, -1, -1e9, 1.5, 3651, 100000, 1e20, 1e308, 'abc', '', '   ', '0x10', 'Infinity', 'NaN', '7.5', '-1', '1e400', 'NP', null, undefined, true, false, {}, { valueOf: () => 7 }, [], [7], 7n, Symbol('x'), new Number(7), () => 7, revoked.proxy, new Date(0), 2 ** 53, '9007199254740993'] // eslint-disable-line no-new-wrappers
        for (let v of bads) {
            let r = null
            A.doesNotThrow(() => {
                r = parseTimeLength(v)
            }, `parseTimeLength 對 ${typeof v} 不得拋錯`)
            A.equal(r, null, `parseTimeLength(${typeof v}) 應為 null`)
        }
    })


    describe('TL-002 無效 timeLength 於各層入口皆被拒(固定鍵, 不回顯值, 不卡住)', function() {
        for (let name of INVALID) {
            it(`TL-002-${name}`, function() {
                let c = runCand(name)
                A.equal(c.timedOut, false, `候選 ${name} 子行程逾時(同步無窮迴圈或過慢): 已完成之層 ${Object.keys(c.byLayer)}, ms=${c.ms}`)
                A.equal(c.status, 0, `候選 ${name} 子行程異常結束 status=${c.status} stderr=${c.stderr}`)
                for (let layer of LAYERS) {
                    let o = c.byLayer[layer]
                    A.ok(o, `候選 ${name} 缺層 ${layer}(該層未回應); 已完成之層 ${Object.keys(c.byLayer)}`)
                    //genPlan 為同步 throw Error; 其餘入口回傳 Promise, 一律 reject 固定鍵字串(規格 §5.1; 不同步 throw)
                    A.equal(o.kind, layer === 'genPlan' ? 'throw' : 'reject', `候選 ${name} 層 ${layer}: 應被拒, 實得 ${o.kind} ${JSON.stringify(o.v)}`)
                    A.equal(o.v, KEY, `候選 ${name} 層 ${layer}: 應為固定鍵 ${KEY}(不回顯值、不轉成 cannotGetStaEvent), 實得 ${JSON.stringify(o.v)}`)
                }
            })
        }
    })


    describe('TL-003 有效 timeLength 於各層入口照常產出(桶數 = 天數 × 24 + 1)', function() {
        for (let [name, days] of Object.entries(VALID)) {
            it(`TL-003-${name}`, function() {
                let c = runCand(name)
                A.equal(c.timedOut, false, `候選 ${name} 逾時: 已完成之層 ${Object.keys(c.byLayer)}, ms=${c.ms}`)
                A.equal(c.status, 0, `候選 ${name} 異常結束 stderr=${c.stderr}`)
                let n = days * 24 + 1
                A.equal(c.byLayer.genPlan && c.byLayer.genPlan.v, `kpTime(${n})`, `genPlan: ${JSON.stringify(c.byLayer.genPlan)}`)
                for (let layer of ['staLogs', 'staEvent', 'staEventWorker', 'psi']) {
                    let o = c.byLayer[layer]
                    A.ok(o, `缺層 ${layer}`)
                    A.equal(o.kind, 'ok', `層 ${layer}: ${JSON.stringify(o)}`)
                    A.equal(o.v, `array(${n})`, `層 ${layer} 桶數(此層由現在起算, 與固定時刻之 genPlan 同為 ${n})`)
                }
                A.equal(c.byLayer.psiMock && c.byLayer.psiMock.kind, 'ok', `mock 層: ${JSON.stringify(c.byLayer.psiMock)}`)
                A.equal(c.byLayer.psiMock.v, 'array(48)', 'mock 模式回固定 48 桶')
            })
        }
    })


    //K4: 檢測之值即使用之值——數字字串 '7' 與數字 7 為同一查詢(修前 single-flight 鍵以原值 JSON 序列化, '7' 與 7 不同鍵而各掃一次)
    it('TL-004 single-flight: staLogs(7) 與 staLogs(\'7\') 共用同一 promise(K4)', async function() {
        let o = { fdLog, timeNow: Date.UTC(2026, 10, 23, 4, 0, 0), useCache: false }
        let p1 = staLogs(7, 'hr', o)
        let p2 = staLogs('7', 'hr', o)
        let p3 = staLogs(' 7 ', 'hr', o)
        A.ok(p1 === p2 && p1 === p3, '7、\'7\'、\' 7 \' 應為同一 in-flight promise(轉換後之值為鍵)')
        let r = await p1
        A.equal(r.rs.length, 169)
        //無效者之 reject(不佔 single-flight 之鍵)於 TL-002 以子行程涵蓋(同行程呼叫於修前會同步無窮迴圈而卡死整個 mocha, 此處不放)
    })


    //有效範圍 1970-01-01(epoch 0)～2100-01-01T00:00:00.000Z(含); 範圍外(含 Date 本身之極值 ±8.64e15, 其後之 subtract／add 溢位成 Invalid Date)視為未給改用現在, 不使 kpTime 迴圈無窮; 範圍內(含兩端)照常使用該時刻
    describe('TL-005 opt.timeNow 為無效時刻者視為未給(退回現在), 不使迴圈無窮; 範圍內者照常使用', function() {
        const FMT = 'YYYY-MM-DDTHH'
        //範圍外或無效(退回現在): 現在所屬桶之標籤為現在之小時(容許跨整點差一小時)
        for (let name of ['now-NaN', 'now-Infinity', 'now-neg-Infinity', 'now-1e300', 'now-neg1e300', 'now-str', 'now-date-max', 'now-date-min', 'now-date-max-minus-5d', 'now-date-min-plus-5d', 'now-beyond-2100', 'now-year-9999', 'now-negative-epoch']) {
            it(`TL-005-fallback-${name}`, function() {
                let c = runCand(name)
                A.equal(c.timedOut, false, `候選 ${name} 逾時(kpTime 迴圈無窮): 已完成之層 ${Object.keys(c.byLayer)}, ms=${c.ms}`)
                A.equal(c.status, 0, `候選 ${name} 異常結束 stderr=${c.stderr}`)
                A.match(c.byLayer.genPlan.v, /^kpTime\(169\)$/, `genPlan: ${JSON.stringify(c.byLayer.genPlan)}`)
                for (let layer of ['staLogs', 'staEvent', 'staEventWorker']) {
                    A.equal(c.byLayer[layer].kind, 'ok', `層 ${layer}: ${JSON.stringify(c.byLayer[layer])}`)
                    A.equal(c.byLayer[layer].v, 'array(169)')
                }
                let nowLabels = [ot().format(FMT), ot().subtract(1, 'hour').format(FMT)]
                A.ok(nowLabels.includes(c.byLayer.pinned.v), `應退回現在所屬桶(${nowLabels}), 實得 ${c.byLayer.pinned.v}`)
            })
        }
        //範圍內(含兩端): 照常使用所給時刻
        for (let [name, ms] of [['now-ok-epoch0', 0], ['now-ok-2100', 4102444800000]]) {
            it(`TL-005-pinned-${name}`, function() {
                let c = runCand(name)
                A.equal(c.timedOut, false, `候選 ${name} 逾時: ${Object.keys(c.byLayer)}`)
                A.match(c.byLayer.genPlan.v, /^kpTime\(169\)$/)
                A.equal(c.byLayer.pinned.v, ot(ms).format(FMT), '範圍內之 timeNow 須被採用(現在所屬桶為該時刻之小時)')
                for (let layer of ['staLogs', 'staEvent', 'staEventWorker']) {
                    A.equal(c.byLayer[layer].v, 'array(169)')
                }
            })
        }
    })


    //語系鍵(CLAUDE.md: 後端錯誤一律回 key, 前端依 lang 查文字; 同 w-web-api): errTimeLengthInvalid 於 procLang 須有 eng 與 cht 且非空
    it('TL-007 procLang 有 errTimeLengthInvalid 之 eng 與 cht 文字', async function() {
        let m = await import('../server/procLang.mjs')
        let L = m.default({}) //{ eng: { 鍵: 文字 }, cht: { 鍵: 文字 } }
        for (let lang of ['eng', 'cht']) {
            let s = L[lang].errTimeLengthInvalid
            A.ok(typeof s === 'string' && s.trim() !== '', `procLang(${lang}) 缺 errTimeLengthInvalid 或為空`)
        }
    })

    describe('TL-006 站點不變式(全部入口皆經檢測)', function() {
        const fdServer = path.join(projRoot, 'server')
        let codeOf = (rel) => sourceLines(path.join(fdServer, rel), 'code').map((l) => l.text).join('\n')

        //全集: server/ 下可執行碼提及 timeLength 之檔(新增檔須先判定是否為新入口)
        it('TL-006a 使用 timeLength 之伺服端檔案為已盤點之全集', function() {
            let hits = []
            let walk = (d) => {
                for (let n of fs.readdirSync(d, { withFileTypes: true })) {
                    let fp = path.join(d, n.name)
                    if (n.isDirectory()) {
                        walk(fp)
                    }
                    else if (n.name.endsWith('.mjs') && /\btimeLength\b/.test(sourceLines(fp, 'code').map((l) => l.text).join('\n'))) {
                        hits.push(path.relative(fdServer, fp).replace(/\\/g, '/'))
                    }
                }
            }
            walk(fdServer)
            A.deepEqual(hits.sort(), [
                'WWebPerm.mjs', //kpFunExt getStaEvent: 遠端唯一入口, 只轉交 psi.getStaEvent(見 TL-006d)
                'procStaInfor.mjs', //psi.getStaEvent: 入口檢測(parseTimeLength)先於快取鍵
                'staLogs/staEvent.callWorker.mjs', //轉交 staLogs(core)
                'staLogs/staEvent.mjs', //轉交 staLogs(core)
                'staLogs/staLogsCore.callWorker.mjs', //轉交 staLogsCore
                'staLogs/staLogsCore.mjs', //核心: genPlan 檢測
            ].sort(), '出現新的 timeLength 使用檔: 須先判定是否為新入口並納入檢測, 再更新本全集')
        })

        it('TL-006b staLogsCore.genPlan: parseTimeLength 先於 now.subtract 與 kpTime 迴圈; 無效 throw errTimeLengthInvalid', function() {
            let code = codeOf('staLogs/staLogsCore.mjs')
            let i0 = code.indexOf('function genPlan(')
            let body = code.slice(i0, code.indexOf('function listFiles('))
            let iParse = body.indexOf('parseTimeLength(')
            let iSub = body.indexOf('.subtract(')
            let iLoop = body.indexOf('while (')
            A.ok(iParse >= 0 && iSub >= 0 && iLoop >= 0, 'genPlan 須含 parseTimeLength、subtract、迴圈')
            A.ok(iParse < iSub && iSub < iLoop, `檢測須先於 subtract 與迴圈(位置 ${iParse} < ${iSub} < ${iLoop})`)
            A.ok(/throw new Error\('errTimeLengthInvalid'\)/.test(body), '無效須 throw Error(errTimeLengthInvalid)')
            //staLogs 入口: genPlan 之 throw 轉為 reject 固定鍵, key 用轉換後之 plan.timeLength
            let bodyStaLogs = code.slice(code.indexOf('function staLogs('), code.indexOf('function absFloor('))
            A.ok(/Promise\.reject\(/.test(bodyStaLogs) && /plan\.timeLength/.test(bodyStaLogs), 'staLogs 須 reject 固定鍵且 single-flight 鍵用 plan.timeLength')
        })

        it('TL-006c procStaInfor.getStaEvent: parseTimeLength 為函數第一個動作, 先於快取鍵、mock 與掃描; 無效 reject errTimeLengthInvalid; 轉交下游者為轉換後之值', function() {
            let code = codeOf('procStaInfor.mjs')
            let i0 = code.indexOf('let getStaEvent = async')
            let body = code.slice(i0, code.indexOf('let _getStaEventTable'))
            let iParse = body.indexOf('parseTimeLength(')
            let iKey = body.indexOf('let cacheKey')
            A.ok(iParse >= 0 && iKey >= 0 && iParse < iKey, `檢測須先於快取鍵(位置 ${iParse} < ${iKey})`)
            A.ok(/Promise\.reject\('errTimeLengthInvalid'\)/.test(body), '無效須 reject 固定鍵 errTimeLengthInvalid(不轉成 cannotGetStaEvent)')
            A.ok(/inputs:\s*\[nDay,/.test(body) && /\$\{nDay\}/.test(body), '快取鍵與轉交下游皆須用轉換後之 nDay, 不用原值')
        })

        it('TL-006d 伺服端唯一之遠端入口 getStaEvent 只經 psi.getStaEvent; staEvent／staLogs 於 server/ 之呼叫者只有 procStaInfor 與其轉交鏈', function() {
            let code = codeOf('WWebPerm.mjs')
            let m = /getStaEvent: async \(userId, timeLength, timeInterval\) => \{[\s\S]*?\n {12}\},/.exec(code)
            A.ok(m, '須找到 kpFunExt getStaEvent')
            A.ok(/psi\.getStaEvent\(userId, timeLength, timeInterval\)/.test(m[0]), 'getStaEvent 須轉交 psi.getStaEvent(userId, timeLength, timeInterval)')
            A.ok(!/staEvent\(|staLogs\(|genPlan\(/.test(m[0]), 'kpFunExt getStaEvent 不得直接呼叫 staEvent／staLogs／genPlan(繞過檢測)')
            //server/ 內(staLogs/ 資料夾除外)呼叫 staEvent／staLogs 者
            let callers = []
            let walk = (d) => {
                for (let n of fs.readdirSync(d, { withFileTypes: true })) {
                    let fp = path.join(d, n.name)
                    let rel = path.relative(fdServer, fp).replace(/\\/g, '/')
                    if (n.isDirectory()) {
                        if (rel !== 'staLogs' && rel !== 'tools') {
                            walk(fp)
                        }
                    }
                    else if (n.name.endsWith('.mjs') && /\b(staEvent|staLogs)\(/.test(sourceLines(fp, 'code').map((l) => l.text).join('\n'))) {
                        callers.push(rel)
                    }
                }
            }
            walk(fdServer)
            A.deepEqual(callers, ['procStaInfor.mjs'], 'staLogs 資料夾外只有 procStaInfor 可呼叫 staEvent／staLogs(其檢測已於 getStaEvent 首動作)')
        })
    })
})
