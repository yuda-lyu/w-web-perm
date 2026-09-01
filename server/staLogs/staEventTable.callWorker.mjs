import { staTable } from './staLogsCore.callWorker.mjs'


//staEventTable (worker 版): 近 25 小時檔案之掃描交由 staLogsCore 單一 worker (主執行緒不阻塞); 介面同 staEventTable.mjs
async function staEventTable(opt = {}) {
    let r = await staTable(opt)
    return r.rs
}


export default staEventTable
