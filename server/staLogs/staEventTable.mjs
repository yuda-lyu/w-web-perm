import { staTable } from './staLogsCore.mjs'


//staEventTable: 各 event 於近 1日/8hr/4hr/1hr 巢狀窗之發生數量 (1hr⊂4hr⊂8hr⊂24hr), 由 staLogsCore 掃近 25 小時之檔取得; 簽章與輸出形狀不變
//回傳: [{ event, last1Day, last8Hour, last4Hour, last1Hour }, ...], 依 last1Day 由大到小排序
async function staEventTable(opt = {}) {
    let r = await staTable(opt)
    return r.rs
}


export default staEventTable
