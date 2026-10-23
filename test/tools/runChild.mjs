//子行程執行輔助(供 R-OBJ-ITER-01 之巨大 length 案例共用; 規則見 sgud/rule/rulebook.md「迭代使用端傳入之物件」)。
//why: 修正前 lodash 對帶 `length: 2**32-1` 之物件空轉約 80 秒(或配置記憶體至耗盡), 且為同步迴圈, mocha 之逾時無法中斷;
//故巨大 length 一律放子行程執行並設逾時與堆積上限, 逾時即殺、以 timedOut 回報(修前紅, 修後毫秒內完成).
import { spawnSync } from 'child_process'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const projRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..') //專案根

/**
 * 以子行程執行一段 ESM 程式碼, 程式碼以 console.log(JSON.stringify(結果)) 回傳結果
 *
 * @param {String} code 輸入子行程執行之 ESM 程式碼(可用 `import(${url('server/xxx.mjs')})`, 見 fileUrl)
 * @param {Object} [opt={}] 輸入設定物件
 * @param {Number} [opt.timeoutMs=20000] 輸入逾時毫秒
 * @param {Number} [opt.maxOldSpaceMb=128] 輸入子行程堆積上限(MB), 超過即崩潰(exit 134)
 * @returns {Object} 回傳 { ok, timedOut, status, signal, result, stdout, stderr, ms }, ok 為正常結束且 stdout 末行為合法 JSON
 */
export function runChild(code, opt = {}) {
    let timeoutMs = opt.timeoutMs ?? 20000
    let maxOldSpaceMb = opt.maxOldSpaceMb ?? 128
    let t0 = Date.now()
    let r = spawnSync(process.execPath, [`--max-old-space-size=${maxOldSpaceMb}`, '--input-type=module', '-e', code], {
        cwd: projRoot,
        encoding: 'utf8',
        timeout: timeoutMs,
        maxBuffer: 16 * 1024 * 1024,
    })
    let ms = Date.now() - t0
    let timedOut = (r.error && r.error.code === 'ETIMEDOUT') === true
    let stdout = r.stdout || ''
    let result = null
    let ok = false
    if (r.status === 0) {
        let lines = stdout.trim().split(/\r?\n/)
        try {
            result = JSON.parse(lines[lines.length - 1])
            ok = true
        }
        catch (err) {}
    }
    return { ok, timedOut, status: r.status, signal: r.signal, result, stdout, stderr: (r.stderr || '').slice(-600), ms }
}

//fileUrl: 專案內檔案(相對專案根)之 file URL 字串, 供子行程 import
export function fileUrl(rel) {
    return JSON.stringify(pathToFileURL(path.join(projRoot, rel)).href)
}

//describeChild: 子行程失敗時之斷言訊息
export function describeChild(c) {
    return `ok=${c.ok} timedOut=${c.timedOut} status=${c.status} signal=${c.signal} ms=${c.ms} stderr=${JSON.stringify(c.stderr)}`
}
