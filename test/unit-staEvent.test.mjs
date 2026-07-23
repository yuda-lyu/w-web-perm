//staLogs 之 staEvent / staEventTable / filterVpfsByWindow 單元測試。
//對應規格來源(read-only, 逐行讀過):
//  server/staLogs/staEvent.mjs        —— 時間桶產生(:31-40)、per-line 窗判斷(:57-74)
//  server/staLogs/staEventTable.mjs   —— 巢狀窗累計 1hr⊂4hr⊂8hr⊂24hr(:50-73)
//  server/staLogs/filterVpfsByWindow.mjs —— 檔名粒度自適應防線(:15-24)
//
//fixture 於 tmp/fixture-logs/ 自造 w-syslog 格式 log(檔名 `YYYY-MM-DDTHH.log`(hr)或 `YYYY-MM-DD.log`(day),
//每行一筆 JSON `{"time":"<ISO字串>","event":"<名稱>"}`),時間一律以執行當下 dayjs 相對推算(不寫死日期)。

import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import ot from 'dayjs'
import staEvent from '../server/staLogs/staEvent.mjs'
import staEventTable from '../server/staLogs/staEventTable.mjs'
import filterVpfsByWindow from '../server/staLogs/filterVpfsByWindow.mjs'
import proc from '../server/procStaInfor.mjs'


//fixture 目錄錨定於 test 檔所在之上一層 tmp/(≡ 專案 cwd 下 tmp/),不受執行 cwd 影響
let __dirname = path.dirname(fileURLToPath(import.meta.url))
let fdLog = path.resolve(__dirname, '..', 'tmp', 'fixture-logs')

//以 hr 粒度檔名寫入一批事件行(檔名取事件時刻之小時桶)
function writeHrLog(t, event, n = 1) {
    let fp = path.join(fdLog, t.format('YYYY-MM-DDTHH') + '.log')
    let lines = []
    for (let i = 0; i < n; i++) {
        lines.push(JSON.stringify({ time: t.format(), event }))
    }
    //同一小時桶可能多批 → append 不覆寫
    fs.appendFileSync(fp, lines.join('\n') + '\n')
}

//以 day 粒度檔名寫入事件行(檔名為日期,不含小時 → 模擬 srLog logInterval='day' 而 staLogs fmt='hr' 之粒度不一致)
function writeDayLog(tFile, tEvent, event) {
    let fp = path.join(fdLog, tFile.format('YYYY-MM-DD') + '.log')
    fs.appendFileSync(fp, JSON.stringify({ time: tEvent.format(), event }) + '\n')
}

//跨全部時間桶累加某 event 之計數
function sumEvent(rs, event) {
    return rs.reduce((a, r) => a + (r.data[event] || 0), 0)
}


describe('unit-staEvent', function() {
    this.timeout(300000)

    before(function() {
        //乾淨重建 fixture 目錄
        fs.rmSync(fdLog, { recursive: true, force: true })
        fs.mkdirSync(fdLog, { recursive: true })

        let now = ot()

        //窗內 1h 前:7 天窗內, 且落在 staEventTable 之 1hr 窗邊界(dh=1) → 應計入全部四窗
        writeHrLog(now.subtract(1, 'hour'), 'evWin1h', 1)

        //窗內 23h 前:7 天窗內, staEventTable 僅落在 24hr 窗(dh=23) → 僅計入 last1Day
        writeHrLog(now.subtract(23, 'hour'), 'evWin23h', 1)

        //7 天窗內邊界 6 天前:寫 2 筆, 驗證計數與寫入筆數一致; 對 staEventTable 為 dh~144 > 24 → 不入表
        writeHrLog(now.subtract(6, 'day'), 'evBoundary6d', 2)

        //7 天窗外 20 天前:應被完全排除(filterVpfsByWindow 檔名層剔除 + per-line 窗判斷雙重擋下)
        writeHrLog(now.subtract(20, 'day'), 'evOut20d', 1)

        //day 粒度檔名(窗內):檔名為今日日期(10 字元), 事件時刻 2h 前 → 驗證 hr fmt 下當天 day 檔不被誤剔
        writeDayLog(now, now.subtract(2, 'hour'), 'evDayFile')

        //非 ISO 檔名 + 非 JSON 內容:fail-open 保留, 但無可解析事件(不應污染任何計數)
        fs.writeFileSync(path.join(fdLog, 'notes.txt.log'), 'this is not json\nplain text line\n')
    })

    after(function() {
        fs.rmSync(fdLog, { recursive: true, force: true })
    })


    //UNIT-001:staEvent 基本語意
    //  spec: staEvent.mjs:31-40 產生 tStart.startOf(unit)..now.startOf(unit) 逐 unit 之時間桶(hr → 逐小時);
    //        timeLength=7 天 × 24 小時 + 1(含頭尾兩端點)= 169 個桶。
    //  spec: staEvent.mjs:64,86-102 有 event 欄位者依 event 名於所屬小時桶計數。
    it('UNIT-001-staEvent-basic-semantics', async function() {
        let rs = await staEvent(7, 'hr', { fdLog })

        //回傳為陣列
        assert.strict.ok(Array.isArray(rs), 'staEvent 應回傳陣列')

        //時間桶數量 = 7 天 × 24 + 1 = 169(staEvent.mjs:37-40 之 while 迴圈含頭尾端點)
        assert.strict.equal(rs.length, 7 * 24 + 1, '時間桶數量應為 7*24+1=169')

        //每個桶結構含 time(字串)與 data.count(數字)(staEvent.mjs:38,108-113)
        for (let r of rs) {
            assert.strict.equal(typeof r.time, 'string', '每個桶應含字串 time')
            assert.strict.equal(typeof r.data.count, 'number', '每個桶 data.count 應為數字')
        }

        //指定事件(evBoundary6d)之跨桶總計數 = fixture 寫入筆數(2)
        assert.strict.equal(sumEvent(rs, 'evBoundary6d'), 2, 'evBoundary6d 計數應等於寫入之 2 筆')

        //窗內 1h 前事件確有計入(1 筆)
        assert.strict.equal(sumEvent(rs, 'evWin1h'), 1, 'evWin1h 應計入 1 筆')
    })


    //UNIT-002:窗外排除
    //  spec: staEvent.mjs:44 filterVpfsByWindow 檔名層剔除窗外檔 + :63 b1=t.isAfter(tStart) per-line 窗判斷;
    //        20 天前(遠早於 now-7day)之事件不應出現在任何桶。
    it('UNIT-002-staEvent-out-of-window-excluded', async function() {
        let rs = await staEvent(7, 'hr', { fdLog })

        //任何桶之 data 皆不得含窗外事件 evOut20d
        assert.strict.ok(
            rs.every((r) => !('evOut20d' in r.data)),
            '20 天前(窗外)事件不應出現在任何時間桶'
        )
        assert.strict.equal(sumEvent(rs, 'evOut20d'), 0, 'evOut20d 跨桶計數應為 0')
    })


    //UNIT-003:staEventTable 巢狀窗包含關係
    //  spec: staEventTable.mjs:61-73 巢狀窗 1hr⊂4hr⊂8hr⊂24hr 各自累計 → 對每 event 恒有 last1Hour≤last4Hour≤last8Hour≤last1Day;
    //        :51-54 dh=now.diff(time,'hour'), dh>24 略過。
    //        1h 前事件 dh=1 → 四窗皆計入; 23h 前事件 dh=23 → 僅 last1Day; 6 天前事件 dh>24 → 不入表。
    it('UNIT-003-staEventTable-nested-window-containment', async function() {
        let table = await staEventTable({ fdLog })

        assert.strict.ok(Array.isArray(table), 'staEventTable 應回傳陣列')

        //對每個 event 驗證巢狀窗單調包含關係
        for (let row of table) {
            assert.strict.ok(row.last1Hour <= row.last4Hour, `${row.event}: last1Hour ≤ last4Hour`)
            assert.strict.ok(row.last4Hour <= row.last8Hour, `${row.event}: last4Hour ≤ last8Hour`)
            assert.strict.ok(row.last8Hour <= row.last1Day, `${row.event}: last8Hour ≤ last1Day`)
        }

        //1h 前事件同時計入四窗(dh=1, staEventTable.mjs:62,65,68,71 之 dh<=24/8/4/1 皆真)
        let r1h = table.find((v) => v.event === 'evWin1h')
        assert.strict.ok(r1h, 'evWin1h 應出現在表中')
        assert.strict.deepEqual(
            { d: r1h.last1Day, h8: r1h.last8Hour, h4: r1h.last4Hour, h1: r1h.last1Hour },
            { d: 1, h8: 1, h4: 1, h1: 1 },
            'evWin1h 應計入全部四窗各 1 筆'
        )

        //23h 前事件僅計入 last1Day(dh=23 → 僅 dh<=24 為真)
        let r23h = table.find((v) => v.event === 'evWin23h')
        assert.strict.ok(r23h, 'evWin23h 應出現在表中')
        assert.strict.deepEqual(
            { d: r23h.last1Day, h8: r23h.last8Hour, h4: r23h.last4Hour, h1: r23h.last1Hour },
            { d: 1, h8: 0, h4: 0, h1: 0 },
            'evWin23h 應僅計入 last1Day'
        )

        //6 天前事件超過 24hr 窗 → 不入表(staEventTable.mjs:52 dh>24 return)
        assert.strict.ok(
            !table.some((v) => v.event === 'evBoundary6d'),
            '6 天前事件(dh>24)不應出現在 staEventTable'
        )
    })


    //UNIT-004:粒度自適應(直接測 filterVpfsByWindow)
    //  spec: filterVpfsByWindow.mjs:22 bn >= keyStart.slice(0, bn.length) —— 以檔名長度截取比較;
    //        :19-21 非 ISO 前綴檔名 fail-open 保留。
    //  情境: day 粒度檔名(10 字元)× hr 粒度 fmt(13 字元)。
    it('UNIT-004-filterVpfsByWindow-granularity-adaptive', function() {
        //固定 tStart 使 keyStart='2026-07-10T21'(此測不依賴 now, 直接驗字串比較邏輯)
        let tStart = ot('2026-07-10T21:30:00')
        let fmt = 'YYYY-MM-DDTHH'

        let vpfs = [
            { name: '2026-07-10.log', path: '/x/2026-07-10.log' },      //day 檔(含 tStart 當天)→ 應保留
            { name: '2026-07-01T05.log', path: '/x/2026-07-01T05.log' }, //hr 檔(明確窗外)→ 應剔除
            { name: 'notes.txt.log', path: '/x/notes.txt.log' },         //非 ISO 檔名 → fail-open 保留
        ]
        let kept = filterVpfsByWindow(vpfs, tStart, fmt).map((v) => v.name)

        //含 tStart 當天之 day 檔(10 字元)被保留:'2026-07-10' >= '2026-07-10T21'.slice(0,10)='2026-07-10'
        assert.strict.ok(kept.includes('2026-07-10.log'), '含 tStart 當天之 day 檔應被保留')

        //明確窗外之 hr 檔被剔除:'2026-07-01T05' < '2026-07-10T21'
        assert.strict.ok(!kept.includes('2026-07-01T05.log'), '明確窗外之 hr 檔應被剔除')

        //非 ISO 檔名 fail-open 保留
        assert.strict.ok(kept.includes('notes.txt.log'), '非 ISO 檔名應 fail-open 保留')
    })


    //UNIT-005:staEvent 對 day 檔名 fixture 之整合
    //  spec: staEvent.mjs:44 之 filterVpfsByWindow 於 hr fmt(13 字元)下, 不得誤剔窗內之 day 粒度檔(10 字元);
    //        證明當天 day 檔之事件確有被 staEvent 計入(filterVpfsByWindow 粒度自適應在整合路徑生效)。
    it('UNIT-005-staEvent-day-file-integration', async function() {
        let rs = await staEvent(7, 'hr', { fdLog })

        //day 粒度檔(檔名 10 字元)內之事件 evDayFile 應被計入(證明未於檔名層被誤剔)
        assert.strict.equal(sumEvent(rs, 'evDayFile'), 1, '窗內 day 粒度檔之事件應被 staEvent 計入 1 筆')
    })


    //UNIT-006:procStaInfor 之統計失敗 reject key(規劃書 M-7, 採 unit 層直測 reject 源頭)
    //  spec: procStaInfor.mjs:83 —— worker 失敗時 cache 回 undefined → 非陣列 → reject 'cannotGetStaEvent';
    //        procStaInfor.mjs:109 —— 同型 reject 'cannotGetStaEventTable'。
    //  觸發: fdLog 指向「檔案而非目錄」使 fsTreeFolder throw(staEvent 經 worker、staEventTable 直呼皆然)。
    //  註: WWebPerm.mjs:1146/:1158 之 kpFun wrapper 僅 srLog.error 後原樣重拋, 抵達前端之 reject 值即此 key,
    //      故於 reject 源頭驗 key 等價覆蓋契約(api-level RPC 觸發需自建 client + 專屬後端, 成本不成比例, 見規劃書 M-7 裁決)。
    it('UNIT-006-procStaInfor-reject-keys-on-failure', async function() {
        //arrange: 建一個「檔案」充當 fdLog
        let fpNotDir = path.resolve(__dirname, '..', 'tmp', 'not-a-dir.log')
        fs.writeFileSync(fpNotDir, 'x', 'utf8')
        let psi = proc({ mock: false, fdLog: fpNotDir })
        try {
            //getStaEvent 失敗須 reject 純 key 'cannotGetStaEvent'(procStaInfor.mjs:83)
            await assert.rejects(
                () => psi.getStaEvent('uid-test', 7, 'hr'),
                (err) => err === 'cannotGetStaEvent',
                'getStaEvent 失敗應 reject 純 key cannotGetStaEvent'
            )
            //getStaEventTable 失敗須 reject 純 key 'cannotGetStaEventTable'(procStaInfor.mjs:109)
            await assert.rejects(
                () => psi.getStaEventTable('uid-test'),
                (err) => err === 'cannotGetStaEventTable',
                'getStaEventTable 失敗應 reject 純 key cannotGetStaEventTable'
            )
        } finally {
            fs.rmSync(fpNotDir, { force: true })
        }
    })

})
