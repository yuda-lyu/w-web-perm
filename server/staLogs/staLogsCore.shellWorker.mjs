import { parentPort } from 'worker_threads'
import { scanFiles, scanTableFiles } from './staLogsCore.mjs'


//worker 只負責掃描主執行緒交付之檔案清單, 回傳彙總; 快取本體留在主執行緒 (staLogsCore.mjs)
//  kind='scan'  → staEvent 之每檔彙總 [{ name, ok, agg | err }]
//  kind='table' → staEventTable 之 { kp, errors }
parentPort.on('message', async (param) => {
    try {
        let r = null
        if (param.kind === 'table') {
            r = await scanTableFiles(param.files, param.nowMs)
        }
        else {
            r = await scanFiles(param.files, param.tStartMs, param.fmt)
        }
        parentPort.postMessage({
            mode: 'done',
            payload: r,
        })
    }
    catch (err) {
        parentPort.postMessage({
            mode: 'error',
            payload: String((err && err.message) || err),
        })
    }
})
