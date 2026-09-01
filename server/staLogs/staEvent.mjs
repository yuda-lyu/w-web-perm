import { staLogs } from './staLogsCore.mjs'


//staEvent: 各 event 於各時間桶之發生頻率, 由 staLogsCore 單趟掃描 + 檔級彙總快取取得; 簽章與輸出形狀不變
//回傳: [{ time, data: { count, <event1>: n, <event2>: m, ... } }, ...] (count 為該時間桶全部事件數)
async function staEvent(timeLength = 7, timeInterval = 'hr', opt = {}) {
    let r = await staLogs(timeLength, timeInterval, opt)
    return r.rs
}


export default staEvent
