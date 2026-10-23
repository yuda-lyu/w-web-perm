//srLog 位置定位(第 101 項 run10, R-SRLOG-MARK-01): 以「檔案位置」讀後端 srLog 中某動作之後新增的行, 不比對跨行程的時間戳。
//
//【為何不比對時間戳】後端 pino 以「後端行程」的 Date.now() 蓋每行的 time, 測試以「測試行程」的 Date.now() 取 t0; 兩個 node 行程的 Date.now() 彼此有
//  1~2 ms 的偏差(本機實測, 同一行程配對內短時間穩定、隨配對而異; 成因推測為各行程獨立校準計時器, 未證實; 實測見 R-SRLOG-MARK-01),
//  偏差使「後端在請求之後才記的行」其 time 小於請求前所取的 t0:
//  請求到記 log 只隔約 2 ms 時, 舊式 `o.time >= t0` 會把目標行濾掉, 且其後後端閒置不再有新行, 測試等滿 30 秒回報「讀到 0 行」
//  (2026-10-22 13:04:35、14:57:41 兩次 API-RC-044 偶發失敗, 皆為該案第一個子案 NameInUse)。
//
//【作法】markSrLog 取「標記」= 各 log 檔此刻的位元組數; 之後只讀標記之後新增的位元組。為免標記之前仍在 pino 管線中(尚未落檔)的行落在標記之後,
//  標記前先送一個哨兵請求並等它落檔(同一後端行程的 srLog 依呼叫序落檔, 見哨兵即其前各行已落檔), 標記取在哨兵行之後。
//
//本檔只放與專案無關的純檔案邏輯(便於單元測試注入暫存資料夾); 哨兵請求與 logFd 解析在 api-setup.mjs。

import fs from 'fs'
import path from 'path'

//log 檔名: hr 模式 YYYY-MM-DDTHH.log, day 模式 YYYY-MM-DD.log(server/srLog.mjs 預設 hr)。只取最新 KEEP_FILES 個:
//  剛寫入的行只會在當前小時檔(跨小時時為次新檔), 不必逐一檢視一年份(logNumKeep 上限 8760 檔)。
const LOG_FILE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2})?\.log$/
const KEEP_FILES = 3
const MARK_KIND = 'srLogMark'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

//listLogFiles: dir 內最新 KEEP_FILES 個 log 檔名(檔名字典序即時間序); dir 不存在回 []
export function listLogFiles(dir) {
    if (!fs.existsSync(dir)) {
        return []
    }
    return fs.readdirSync(dir).filter((fn) => LOG_FILE_RE.test(fn)).sort().slice(-KEEP_FILES)
}

//snapshotOffsets: 各 log 檔此刻之位元組數 { 檔名: size }
export function snapshotOffsets(dir) {
    const out = {}
    for (const fn of listLogFiles(dir)) {
        out[fn] = fs.statSync(path.join(dir, fn)).size
    }
    return out
}

//scanAppended: 讀各 log 檔自 offsets[檔名](未列者自 0, 即標記之後才建立之新檔)起新增之「完整行」。
//  回 { entries: [{ fn, end, obj, raw }], sizes }: end 為該行(含換行)之結尾位元組位置; sizes 為本次掃描所見各檔大小。
//  以位元組定位(非字元): 中文等多位元組字元不影響位置。尾端無換行之殘行(尚未寫完)不計, 下次掃描自同一標記重讀時自然補上;
//  無法解析為 JSON 物件之行略過(含標記恰落在行中間時之半截行)。
export function scanAppended(dir, offsets) {
    const entries = []
    const sizes = {}
    for (const fn of listLogFiles(dir)) {
        const fp = path.join(dir, fn)
        const size = fs.statSync(fp).size
        sizes[fn] = size
        const off = Object.prototype.hasOwnProperty.call(offsets, fn) ? offsets[fn] : 0
        if (size <= off) {
            continue
        }
        const buf = Buffer.alloc(size - off)
        const fd = fs.openSync(fp, 'r')
        try {
            fs.readSync(fd, buf, 0, buf.length, off)
        }
        finally {
            fs.closeSync(fd)
        }
        let pos = 0
        while (true) {
            const nl = buf.indexOf(0x0a, pos)
            if (nl < 0) {
                break //殘行
            }
            const raw = buf.toString('utf8', pos, nl).replace(/\r$/, '')
            pos = nl + 1
            if (raw === '') {
                continue
            }
            let obj = null
            try {
                obj = JSON.parse(raw)
            }
            catch (e) {
                continue
            }
            if (obj !== null && typeof obj === 'object' && !Array.isArray(obj)) {
                entries.push({ fn, end: off + pos, obj, raw })
            }
        }
    }
    return { entries, sizes }
}

//assertMark: 防誤用——舊式呼叫 readSrLogSince(Date.now()) 若靜默通過會退回跨行程比對時鐘, 故非標記一律拋錯
export function assertMark(mark) {
    if (!mark || typeof mark !== 'object' || mark.kind !== MARK_KIND || !mark.offsets || typeof mark.offsets !== 'object') {
        throw new TypeError(`srLog 標記須由 markSrLog() 取得(不接受時間戳), 實得 ${JSON.stringify(mark)}`)
    }
}

//readLinesAfter: 標記之後新增之各行(已 JSON.parse, 附 _raw 原文); 不看行內任何時間欄位
export function readLinesAfter(dir, mark) {
    assertMark(mark)
    return scanAppended(dir, mark.offsets).entries.map((e) => ({ ...e.obj, _raw: e.raw }))
}

//markAfterSentinel: 送哨兵並等它落檔, 回傳取在哨兵行之後的標記。
//  send        : 送出會使後端記一行哨兵 log 的請求(async)
//  isSentinel  : (已解析之 log 行物件) → 是否為本次哨兵
//  timeoutMs   : 等哨兵落檔之上限(僅作同行程計時, 不比對任何跨行程時間)
export async function markAfterSentinel({ dir, send, isSentinel, timeoutMs = 30000, pollMs = 20 }) {
    const pre = snapshotOffsets(dir)
    await send()
    const tEnd = Date.now() + timeoutMs
    while (true) {
        const { entries, sizes } = scanAppended(dir, pre)
        const hit = entries.find((e) => isSentinel(e.obj))
        if (hit) {
            //哨兵所在檔取至哨兵行尾(其後若已有他行屬標記之後), 其餘檔取本次掃描所見大小
            return { kind: MARK_KIND, offsets: { ...sizes, [hit.fn]: hit.end } }
        }
        if (Date.now() >= tEnd) {
            throw new Error(`markSrLog: ${timeoutMs} ms 內 srLog 未見哨兵行(logFd 不符、後端未啟動或 srLog 未落檔)`)
        }
        await sleep(pollMs)
    }
}
