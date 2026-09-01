//golden fixture / expected 產生器 (perm; 與 fixture 同目錄留存, 使 expected.json 之真理來源可重產)
//  node test/staLogs-golden/gen-expected.mjs fixture
//      → 產 test/staLogs-golden/logs/*.log (確定性, seeded PRNG; 173 檔)
//  node --import ./test/staLogs-golden/fakeDate.mjs test/staLogs-golden/gen-expected.mjs expected
//      → 以「改造前實作」(./legacy/staEvent.mjs, ./legacy/staEventTable.mjs, 即 ADR-021 之前之原碼) 於假時鐘產 expected.json
//FIXED now = 1788150896789 = 2026-08-31 12:34:56.789 (+08:00); tStart(7d) = 2026-08-24 12:34:56.789
//擴充 fixture 時: 改本檔 → 依序重跑 fixture 與 expected → 跑 test/unit-staEvent-golden.test.mjs; expected 永遠由 legacy 產出, 不得手改。
import './setTz.mjs'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import ot from 'dayjs'

let mode = process.argv[2] || 'fixture'
let fdRoot = path.dirname(fileURLToPath(import.meta.url)) //產物落在本目錄 (fixture 資產, 非使用者工作路徑輸出)
let fdLog = path.join(fdRoot, 'logs')

let FIXED = 1788150896789
let T_START = FIXED - 7 * 86400000

function prng(seed) {
    let a = seed >>> 0
    return function() {
        a = (a + 0x6D2B79F5) >>> 0
        let t = a
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}
let rnd = prng(20260901)
let pick = (arr) => arr[Math.floor(rnd() * arr.length)]

let events = ['verifyConn', 'updateTargets-success', 'checkUser-error', 'api/getPerm-success', 'getWebInfor-success', 'api/syncAndReplaceTabs-success', 'kpfun-getUsersList']

function line(timeMs, ev) {
    return JSON.stringify({ level: 30, time: timeMs, pid: 123, hostname: 'h', event: ev })
}

function genFixture() {
    fs.rmSync(fdLog, { recursive: true, force: true })
    fs.mkdirSync(fdLog, { recursive: true })

    let tOut = ot(FIXED).subtract(7, 'day').startOf('hour').subtract(2, 'hour') //窗外 2 檔
    let tEnd = ot(FIXED).startOf('hour')
    let nFiles = 0
    let nLines = 0
    for (let t = tOut; !t.isAfter(tEnd); t = t.add(1, 'hour')) {
        let name = t.format('YYYY-MM-DDTHH') + '.log'
        let lines = []
        let n = 8 + Math.floor(rnd() * 13)
        let times = []
        for (let i = 0; i < n; i++) {
            times.push(t.valueOf() + Math.floor(rnd() * 3600000))
        }
        times.sort((a, b) => a - b)
        for (let tm of times) {
            //10% 無 event 之行 (不計入)
            if (rnd() < 0.1) {
                lines.push(JSON.stringify({ level: 30, time: tm, pid: 123, hostname: 'h', msg: 'no event' }))
            }
            else {
                lines.push(line(tm, pick(events)))
            }
        }

        //邊界檔: 恰等 tStart (不計) / +1 ms (計) / -1 ms (不計)
        if (t.format('YYYY-MM-DDTHH') === ot(T_START).format('YYYY-MM-DDTHH')) {
            lines.push(line(T_START, 'boundary-eq'))
            lines.push(line(T_START + 1, 'boundary-plus1'))
            lines.push(line(T_START - 1, 'boundary-minus1'))
        }

        //邊界檔之下一檔: 前置 3 行緩衝外溢 (time 屬前一小時)
        if (t.format('YYYY-MM-DDTHH') === ot(T_START).add(1, 'hour').format('YYYY-MM-DDTHH')) {
            let tPrevEnd = t.valueOf() - 1
            lines.unshift(line(tPrevEnd - 400, 'spill-a'), line(tPrevEnd - 200, 'spill-b'), line(tPrevEnd, 'spill-c'))
        }

        //某封閉檔: 垃圾行 / ISO 字串 time / time 為垃圾
        if (name === '2026-08-26T05.log') {
            lines.push('{"level":30,"time":1787')
            lines.push('')
            lines.push('plain text line')
            lines.push(JSON.stringify({ level: 30, time: ot(t.valueOf() + 600000).format(), event: 'iso-string-time' }))
            lines.push(JSON.stringify({ level: 30, time: 'garbage', event: 'garbage-time' }))
        }

        //近 25 小時之檔: 加入距 now 恰 1h/4h/8h/24h 前後 1 秒之行 (staEventTable 窗邊界)
        for (let h of [1, 4, 8, 24]) {
            let tb = FIXED - h * 3600000
            for (let d of [-1000, 0, 1000]) {
                let tm = tb + d
                if (tm >= t.valueOf() && tm < t.valueOf() + 3600000) {
                    lines.push(line(tm, `win-${h}h`))
                }
            }
        }

        //當前小時檔: 加一行未來時間 (時鐘偏移): staEvent 聯集多一桶; staEventTable 未來 30 分鐘 dh 取整為 0 仍計入 (原語意)
        if (t.valueOf() === tEnd.valueOf()) {
            lines.push(line(FIXED + 30 * 60000, 'future-30m'))
            lines.push(line(ot(FIXED).add(1, 'day').startOf('hour').add(1, 'hour').valueOf(), 'future-1d'))
        }

        fs.writeFileSync(path.join(fdLog, name), lines.join('\n') + '\n')
        nFiles++
        nLines += lines.length
    }

    //day 粒度檔名
    if (true) {
        let tDay = ot('2026-08-30T00:00:00')
        let lines = []
        for (let i = 0; i < 12; i++) {
            lines.push(line(tDay.valueOf() + Math.floor(rnd() * 86400000), pick(events)))
        }
        fs.writeFileSync(path.join(fdLog, '2026-08-30.log'), lines.join('\n') + '\n')
        nFiles++
        nLines += lines.length
    }

    //非 ISO 檔名 (fail-open 保留)
    if (true) {
        let lines = [
            line(ot('2026-08-29T08:15:00').valueOf(), 'notes-event'),
            'this is not json',
            '',
            line(ot('2026-08-31T11:16:00').valueOf(), 'notes-event'),
        ]
        fs.writeFileSync(path.join(fdLog, 'notes.txt.log'), lines.join('\n') + '\n')
        nFiles++
        nLines += lines.length
    }

    console.log('fixture done', { fdLog, nFiles, nLines })
}

async function genExpected() {
    if (Date.now() !== FIXED) {
        throw new Error('expected 須於假時鐘下產出: node --import ./test/staLogs-golden/fakeDate.mjs test/staLogs-golden/gen-expected.mjs expected')
    }
    let staEvent = (await import('./legacy/staEvent.mjs')).default
    let staEventTable = (await import('./legacy/staEventTable.mjs')).default
    console.log('now(fake)', Date.now(), ot().format())
    let hr = await staEvent(7, 'hr', { fdLog })
    let day = await staEvent(7, 'day', { fdLog })
    let table = await staEventTable({ fdLog })
    let fp = path.join(fdRoot, 'expected.json')
    fs.writeFileSync(fp, JSON.stringify({ hr, day, table }, null, 2))
    console.log('expected done', fp, { hr: hr.length, day: day.length, table: table.length })
}

if (mode === 'fixture') {
    genFixture()
}
else if (mode === 'expected') {
    await genExpected()
}
else {
    throw new Error(`invalid mode[${mode}], use fixture | expected`)
}
