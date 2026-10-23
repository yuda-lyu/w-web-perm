//srLog 位置定位(test/tools/srLogMark.mjs)單元測試。對應 sgud/rule/rulebook_test.md R-SRLOG-MARK-01(第 101 項 run10: API-RC-044 偶發失敗「讀到 0 行」之根因修正)。
//規格(R-SRLOG-MARK-01):
//  M1 標記之後新增的完整行必被讀到, 與行內 time 欄位之值無關(後端行程之時鐘可比測試行程慢或快 1~2 ms 以上)
//  M2 標記之前已在檔內之行必不被讀到(含其 time 在「未來」者)
//  M3 尾端無換行之殘行不計, 補完換行後才計且只計一次
//  M4 標記之後才建立之新檔(跨小時)自頭讀; 標記時已存在之檔自標記位置起讀
//  M5 位置以位元組計(中文等多位元組字元不影響); 不可解析之行、CRLF 不致錯位
//  M6 哨兵: 哨兵之前仍在管線中才落檔的行不屬標記之後; 哨兵之後的行屬標記之後; 哨兵延遲落檔仍可等到; 等不到則拋錯
//  M7 非標記(如時間戳)一律拋錯, 不得靜默退回跨行程比對時鐘
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { listLogFiles, snapshotOffsets, scanAppended, readLinesAfter, markAfterSentinel, assertMark } from './tools/srLogMark.mjs'


const projRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const TMP = path.join(projRoot, 'test', '_tmp', 'srLogMark')

let seq = 0
//每案一個專用資料夾(避免案間殘留)
const newDir = () => {
    const d = path.join(TMP, `c${++seq}`)
    fs.mkdirSync(d, { recursive: true })
    return d
}
//append: 追加一行(預設含換行); time 預設為 now
const put = (dir, fn, o, nl = '\n') => {
    fs.appendFileSync(path.join(dir, fn), JSON.stringify(o) + nl)
}
const evs = (lines) => lines.map((l) => l.event)


describe('unit-srLogMark', function() {

    before(function() {
        fs.rmSync(TMP, { recursive: true, force: true })
        fs.mkdirSync(TMP, { recursive: true })
    })

    after(function() {
        fs.rmSync(TMP, { recursive: true, force: true })
        assert.ok(!fs.existsSync(TMP), '暫存資料夾須刪除')
    })

    it('SLM-001 M1 後端時鐘比測試端慢: 標記之後新增之行其 time 遠小於標記時刻, 仍全部讀到(舊式 time>=t0 會讀到 0 行, API-RC-044 之失敗形狀)', function() {
        const d = newDir()
        const f = '2026-10-22T14.log'
        put(d, f, { time: 1000, event: 'before' })
        const mark = { kind: 'srLogMark', offsets: snapshotOffsets(d) }
        const tMark = Date.now()
        //後端行程之時鐘慢 5 秒(誇大偏差, 重現「行的 time < 測試端 t0」)
        put(d, f, { time: tMark - 5000, event: 'a' })
        put(d, f, { time: tMark - 4999, event: 'b' })
        assert.deepStrictEqual(evs(readLinesAfter(d, mark)), ['a', 'b'])
        //對照: 舊式比對在同一資料上讀到 0 行(證明本案測資確實重現缺陷形狀)
        const legacy = scanAppended(d, {}).entries.map((e) => e.obj).filter((o) => o.time >= tMark)
        assert.strictEqual(legacy.length, 0)
    })

    it('SLM-002 M2 標記之前已在檔內之行不被讀到, 含其 time 在未來者(後端時鐘快)', function() {
        const d = newDir()
        const f = '2026-10-22T14.log'
        put(d, f, { time: Date.now() + 60000, event: 'old-future' })
        put(d, f, { time: 1, event: 'old-past' })
        const mark = { kind: 'srLogMark', offsets: snapshotOffsets(d) }
        assert.deepStrictEqual(readLinesAfter(d, mark), [])
        put(d, f, { time: Date.now() + 60000, event: 'new-future' })
        assert.deepStrictEqual(evs(readLinesAfter(d, mark)), ['new-future'])
    })

    it('SLM-003 M3 殘行不計, 補完換行後計一次; 讀取不改變標記(可重複讀同一標記)', function() {
        const d = newDir()
        const f = '2026-10-22T14.log'
        put(d, f, { event: 'x0' })
        const mark = { kind: 'srLogMark', offsets: snapshotOffsets(d) }
        put(d, f, { event: 'x1' })
        const half = JSON.stringify({ event: 'x2', pad: 'abcdef' })
        fs.appendFileSync(path.join(d, f), half.slice(0, 10)) //寫了一半
        assert.deepStrictEqual(evs(readLinesAfter(d, mark)), ['x1'])
        fs.appendFileSync(path.join(d, f), half.slice(10) + '\n')
        assert.deepStrictEqual(evs(readLinesAfter(d, mark)), ['x1', 'x2'])
        assert.deepStrictEqual(evs(readLinesAfter(d, mark)), ['x1', 'x2'], '同一標記重讀結果相同')
        //殘行恰在換行之前切斷: 內容本身已是完整 JSON 但換行尚未寫出, 仍不計(寫入以「行」為單位, 無換行即未寫完)
        fs.appendFileSync(path.join(d, f), JSON.stringify({ event: 'x3' }))
        assert.deepStrictEqual(evs(readLinesAfter(d, mark)), ['x1', 'x2'])
        fs.appendFileSync(path.join(d, f), '\n')
        assert.deepStrictEqual(evs(readLinesAfter(d, mark)), ['x1', 'x2', 'x3'])
    })

    it('SLM-004 M4 跨小時: 標記時已存在之檔自標記位置起讀, 標記之後才建立之新檔自頭讀', function() {
        const d = newDir()
        put(d, '2026-10-22T14.log', { event: 'h14-old' })
        const mark = { kind: 'srLogMark', offsets: snapshotOffsets(d) }
        put(d, '2026-10-22T14.log', { event: 'h14-new' })
        put(d, '2026-10-22T15.log', { event: 'h15-first' })
        put(d, '2026-10-22T15.log', { event: 'h15-second' })
        assert.deepStrictEqual(evs(readLinesAfter(d, mark)), ['h14-new', 'h15-first', 'h15-second'])
    })

    it('SLM-005 M5 位元組定位: 標記前含中文行、其後含中文與 CRLF 與不可解析行, 位置不錯位', function() {
        const d = newDir()
        const f = '2026-10-22T14.log'
        put(d, f, { event: '標記前', msg: '中文訊息一二三' })
        const mark = { kind: 'srLogMark', offsets: snapshotOffsets(d) }
        assert.ok(mark.offsets[f] > JSON.stringify({ event: '標記前', msg: '中文訊息一二三' }).length, '位元組數大於字元數(中文為 3 位元組)')
        put(d, f, { event: '標記後甲', msg: '乙' }, '\r\n')
        fs.appendFileSync(path.join(d, f), 'not json at all\n')
        fs.appendFileSync(path.join(d, f), '[1,2,3]\n') //JSON 但非物件
        put(d, f, { event: 'tail' })
        assert.deepStrictEqual(evs(readLinesAfter(d, mark)), ['標記後甲', 'tail'])
    })

    it('SLM-006 listLogFiles: 只取符合檔名且最新 3 個, 忽略他種檔; 資料夾不存在回空', function() {
        const d = newDir()
        for (const fn of ['2026-10-22T10.log', '2026-10-22T11.log', '2026-10-22T12.log', '2026-10-22T13.log', 'notes.txt', 'x.log', '2026-10-22T14.log.bak']) {
            fs.writeFileSync(path.join(d, fn), '')
        }
        assert.deepStrictEqual(listLogFiles(d), ['2026-10-22T11.log', '2026-10-22T12.log', '2026-10-22T13.log'])
        fs.writeFileSync(path.join(d, '2026-10-23.log'), '') //day 模式檔名亦認(字典序在 T 之前者排前, 此處日期較大排最後)
        assert.deepStrictEqual(listLogFiles(d), ['2026-10-22T12.log', '2026-10-22T13.log', '2026-10-23.log'])
        assert.deepStrictEqual(listLogFiles(path.join(d, 'nope')), [])
    })

    it('SLM-007 M6 哨兵: 哨兵之前仍在管線中才落檔的行不屬標記之後; 哨兵之後的行屬標記之後', async function() {
        const d = newDir()
        const f = '2026-10-22T14.log'
        put(d, f, { event: 'long-ago' })
        const SENT = 'srMarkTEST1'
        const mark = await markAfterSentinel({
            dir: d,
            send: async () => {
                //send 開始後, 前一步驟(在管線中)的行才落檔, 然後是哨兵; 依序落檔
                put(d, f, { event: 'in-flight-1' })
                put(d, f, { event: 'in-flight-2' })
                put(d, f, { event: 'sentinel', keyTable: SENT })
            },
            isSentinel: (o) => o.keyTable === SENT,
        })
        assert.deepStrictEqual(readLinesAfter(d, mark), [], '標記取在哨兵行之後, 此時無新行')
        put(d, f, { event: 'action-1' })
        put(d, f, { event: 'action-2' })
        assert.deepStrictEqual(evs(readLinesAfter(d, mark)), ['action-1', 'action-2'])
    })

    it('SLM-008 M6 哨兵延遲落檔仍可等到; 哨兵落在標記前不存在之新檔(跨小時)亦可', async function() {
        const d = newDir()
        put(d, '2026-10-22T14.log', { event: 'prev' })
        const SENT = 'srMarkTEST2'
        const mark = await markAfterSentinel({
            dir: d,
            send: async () => {
                setTimeout(() => {
                    put(d, '2026-10-22T14.log', { event: 'late-inflight' })
                    put(d, '2026-10-22T15.log', { event: 'sentinel', keyTable: SENT }) //哨兵在新檔
                }, 150)
            },
            isSentinel: (o) => o.keyTable === SENT,
            pollMs: 10,
        })
        assert.deepStrictEqual(readLinesAfter(d, mark), [])
        put(d, '2026-10-22T15.log', { event: 'after' })
        assert.deepStrictEqual(evs(readLinesAfter(d, mark)), ['after'])
    })

    it('SLM-009 M6 哨兵等不到 → 拋錯(訊息含「哨兵」), 不回傳空標記', async function() {
        const d = newDir()
        put(d, '2026-10-22T14.log', { event: 'x' })
        await assert.rejects(
            markAfterSentinel({ dir: d, send: async () => {}, isSentinel: () => false, timeoutMs: 200, pollMs: 10 }),
            (err) => /哨兵/.test(err.message)
        )
    })

    it('SLM-010 M7 非標記(時間戳、null、一般物件、字串)一律拋 TypeError', function() {
        const d = newDir()
        for (const bad of [Date.now(), 0, null, undefined, {}, { offsets: {} }, { kind: 'srLogMark' }, 'x']) {
            assert.throws(() => assertMark(bad), TypeError, `應拒絕 ${JSON.stringify(bad)}`)
            assert.throws(() => readLinesAfter(d, bad), TypeError)
        }
        assert.doesNotThrow(() => assertMark({ kind: 'srLogMark', offsets: {} }))
    })
})
