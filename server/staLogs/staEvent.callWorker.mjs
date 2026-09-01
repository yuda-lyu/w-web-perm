import { staLogs } from './staLogsCore.callWorker.mjs'


//staEvent (worker 版): 掃描交由 staLogsCore 單一 worker (只收需重掃之檔案清單), 快取與 single-flight 在主執行緒; 介面同 staEvent.mjs
async function staEvent(timeLength = 7, timeInterval = 'hr', opt = {}) {
    let r = await staLogs(timeLength, timeInterval, opt)
    return r.rs
}


export default staEvent
