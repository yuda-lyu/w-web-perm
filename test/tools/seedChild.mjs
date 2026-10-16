//種子子行程之執行與完成判定(規則帳本 R-SEED-01; spec/設計要點與取捨.md ADR-026). 供 e2e-setup.mjs 之 seedDb 使用.
//
//契約: 子行程 stdout 出現 'finish.'(g_initialTestData 成功之唯一訊號)才 resolve, 並結束子行程(lmdb 會撐住其 event loop);
//      子行程結束而未見 'finish.'(不論離開碼)、逾時、spawn 失敗一律 reject, 訊息附 stdout／stderr 尾段.
//why: 修正前 seedDb 於子行程 exit 即 resolve——w-serv-orm 1.1.10 之 genTestData 遇逐筆失敗拋錯, g_initialTestData 之 catch 印出後
//     以離開碼 0 結束、不印 finish., seedDb 視同成功(2026-10-14 V5 實測 449 ms), 測試以不完整之種子續跑.
import { spawn } from 'child_process'

const TAIL_MAX = 4000

//tailOf: 取字串末段(保留最後 TAIL_MAX 字元)
let tailOf = (s) => (s.length > TAIL_MAX ? s.slice(s.length - TAIL_MAX) : s)


/**
 * 執行種子腳本子行程, 見 'finish.' 才算成功
 *
 * @param {Object} p 輸入物件
 * @param {Array} p.args 輸入 node 之參數陣列(首項為腳本路徑)
 * @param {String} p.cwd 輸入子行程工作目錄
 * @param {Number} [p.timeoutMs=60000] 輸入逾時毫秒
 * @returns {Promise} 成功 resolve(undefined); 失敗 reject Error(訊息附輸出尾段)
 */
export function runSeedChild({ args, cwd, timeoutMs = 60000 }) {
    return new Promise((resolve, reject) => {
        let child = null
        try {
            child = spawn('node', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
        }
        catch (err) {
            reject(err)
            return
        }
        let out = ''
        let errOut = ''
        let done = false
        let timer = null
        let settle = (err) => {
            if (done) {
                return
            }
            done = true
            clearTimeout(timer)
            try {
                child.kill()
            }
            catch (e) {}
            if (err) {
                reject(err)
            }
            else {
                resolve()
            }
        }
        let describe = (head) => new Error(`${head}\n[stdout tail]\n${tailOf(out)}\n[stderr tail]\n${tailOf(errOut)}`)
        child.stdout.on('data', (d) => {
            out = tailOf(out + String(d))
            if (out.includes('finish.')) {
                settle(null)
            }
        })
        child.stderr.on('data', (d) => {
            errOut = tailOf(errOut + String(d))
        })
        child.on('error', (err) => settle(err))
        //用 close 而非 exit: exit 可能早於 stdio 之最後一段資料, 先印 finish. 即結束之子行程會被誤判為失敗
        child.on('close', (code, signal) => {
            settle(describe(`seed child exited without 'finish.' (code=${code}, signal=${signal})`))
        })
        timer = setTimeout(() => {
            settle(describe(`seed child timeout ${timeoutMs}ms`))
        }, timeoutMs)
    })
}
