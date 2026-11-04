//續跑全套 e2e 中因 quiet-run 115 分鐘上限被截斷而未完成之檔(perm-run01 本輪: e2e-targets 被截於中途、e2e-users 未開始)。
//機制同 test/tools/run-e2e-isolated.mjs: 每檔前殺 11006 後端, 新 mocha 行程自 seed＋spawn 全新後端, 前端 8090 暖機共用; 只是以 targets 指定檔案。
//用法(以專案根為 cwd, 需測試鎖): node C:/opensrcOper/tools/quiet-run.mjs --lock --name perm-run01 --timeout 3300 -- node spec/evidence/perm-run01-20261025/scripts/run-rest.mjs
//2026-11-05 wp309(e2e 單開自動換埠): 原 killPortListeners(11006)(依埠殺任何監聽者)已自 e2eLib 移除, 改與 run-e2e-isolated.mjs 同形——
//  基準埠與保留取自 test/tools/e2ePorts.mjs, 只殺本實例(身分已確認)之後端; 遇他人占用即拋錯中止。其餘(targets、每檔換新後端)不變。
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { runIsolatedE2e } from '../../../../test/tools/e2eLib.mjs'
import { BACKEND_PORT, reservation } from '../../../../test/tools/e2ePorts.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url)) //spec/evidence/perm-run01-20261025/scripts
const projRoot = join(__dirname, '..', '..', '..', '..')
const port = reservation.portOf(BACKEND_PORT)

const killOwnBackend = () => {
    const r = reservation.killOwnListeners(port)
    if (r.skipped && r.skipped.length > 0) {
        throw new Error(`埠 ${port} 有非本實例之監聽者(PID ${r.skipped.join(', ')}), 不下殺, 中止`)
    }
}

let { failed } = await runIsolatedE2e({
    projRoot,
    testDir: join(projRoot, 'test'),
    targets: ['e2e-targets.test.mjs', 'e2e-users.test.mjs'],
    beforeEachFile: async () => {
        killOwnBackend()
        await new Promise((resolve) => setTimeout(resolve, 2000))
    },
    afterAll: () => {
        killOwnBackend()
    },
})
process.exit(failed === 0 ? 0 : 1)
