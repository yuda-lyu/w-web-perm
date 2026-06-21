import { fileURLToPath } from 'url'
import path from 'path'
import { Worker } from 'worker_threads'
import genPm from 'wsemi/src/genPm.mjs'


let __filename = fileURLToPath(import.meta.url)
let __dirname = path.dirname(__filename)

//worker 版 staEvent：於獨立 worker thread 計算（避免讀大量 log 阻塞主執行緒）。介面同 staEvent.mjs。
async function staEvent(timeLength = 7, timeInterval = 'hr', opt = {}) {
    let pm = genPm()

    //fpWk
    let fpWk = path.resolve(__dirname, 'staEvent.shellWorker.mjs')

    //wk
    let wk = new Worker(fpWk)

    wk.on('message', (msg) => {

        if (msg.mode === 'done') {
            pm.resolve(msg.payload)
        }
        else if (msg.mode === 'error') {
            pm.reject(msg.payload)
        }

        wk.terminate()

    })

    wk.on('error', (err) => {
        pm.reject(err)
    })

    wk.postMessage({
        timeLength,
        timeInterval,
        opt,
    })

    return pm
}

export default staEvent
