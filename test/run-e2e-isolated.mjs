//逐檔隔離執行 e2e：每個 browser e2e 檔以「獨立 mocha 進程 + 全新後端」跑，前端(dev server)保持暖機共用。
//
//why：本專案 e2e 檔本就設計為逐檔獨立(各自 seedDb g.initialTestData + 自 spawn 後端 + 自管 browser 生命週期，
//  且有 --baseline 直跑入口)。把它們塞進單一 mocha 進程(npm test 的 `mocha` 全 glob)時，會共用「api 相先 seed
//  並經 updateXxx 還原 RPC 正規化過 order 欄位」的後端 → 對話框類 case 之 grid 列序(sortBy order)與 solo 自產
//  baseline 不符 → 整批 pixel mismatch(2026-07-10 以 grups E2E-008 之 diff 圖確證: 同資料、列序相反)。
//  逐檔各給全新後端(純 g.initialTestData 種子)即回到 solo 之綠燈狀態，且無須改動任何 baseline 或 production 碼。
//
//機制：每檔前只殺後端(11006)、保留前端(8090, 無狀態且啟動慢)。新 mocha 進程 startedBackend=false → seedDb+spawn
//  全新後端；startedFrontend 段偵測 8090 已起 → reuse。
//
//用法：node test/run-e2e-isolated.mjs   (exit 0=全綠；非 0=有失敗檔)

import { spawn, spawnSync, execSync } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projRoot = join(__dirname, '..')
const isWin = process.platform === 'win32'
const BACKEND_PORT = 11006
const FRONTEND_PORT = 8090

//動態列舉全部 e2e 檔(pattern 白名單, 全域 §14.3): 新增之 e2e-*.test.mjs 自動納入, 不因寫死清單而被靜默漏跑。
//e2e-doubleclick(API-level, ADR-017)亦以隔離模式跑——只多一次後端重啟成本, 換取零遺漏。
const E2E_FILES = fs.readdirSync(__dirname)
    .filter((f) => /^e2e-.*\.test\.mjs$/.test(f))
    .sort()

function killPort(port) {
    if (!isWin) {
        try { execSync(`lsof -ti:${port} | xargs -r kill -9`, { stdio: 'ignore' }) } catch (e) {}
        return
    }
    try {
        const out = execSync(`netstat -ano | findstr ":${port}"`, { encoding: 'utf8' })
        const pids = new Set()
        for (const line of out.split(/\r?\n/).filter((l) => /LISTENING/.test(l))) {
            const m = line.match(/\s(\d+)\s*$/)
            if (m) { pids.add(m[1]) }
        }
        for (const pid of pids) { try { execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' }) } catch (e) {} }
    }
    catch (e) { /* 無監聽 */ }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }

const results = []
for (const f of E2E_FILES) {
    //每檔前殺後端 → 新 mocha 進程自 seed+spawn 全新後端；前端保持暖機
    killPort(BACKEND_PORT)
    await sleep(2000)
    console.log(`\n=== [run-e2e-isolated] 執行 ${f}（全新後端）===`)
    const r = spawnSync('npx', ['mocha', join('test', f), '--reporter', 'spec', '--timeout', '300000'], {
        cwd: projRoot, stdio: 'inherit', shell: isWin,
    })
    results.push({ file: f, code: r.status })
}

//收尾殺後端(前端留給使用者/後續)
killPort(BACKEND_PORT)

console.log('\n=== [run-e2e-isolated] 逐檔結果 ===')
let failed = 0
for (const { file, code } of results) {
    console.log(`  ${code === 0 ? '✔' : '✘'} ${file} (exit ${code})`)
    if (code !== 0) { failed++ }
}
console.log(`\n${failed === 0 ? '✔ e2e 全部通過' : `✘ ${failed} 個 e2e 檔失敗`}`)
process.exit(failed === 0 ? 0 : 1)
