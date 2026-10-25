//續跑全套 e2e 中因 quiet-run 115 分鐘上限被截斷而未完成之檔(perm-run01 本輪: e2e-targets 被截於中途、e2e-users 未開始)。
//機制同 test/tools/run-e2e-isolated.mjs: 每檔前殺 11006 後端, 新 mocha 行程自 seed＋spawn 全新後端, 前端 8090 暖機共用; 只是以 targets 指定檔案。
//用法(以專案根為 cwd, 需測試鎖): node C:/opensrcOper/tools/quiet-run.mjs --lock --name perm-run01 --timeout 3300 -- node spec/evidence/perm-run01-20261025/scripts/run-rest.mjs
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { runIsolatedE2e, killPortListeners } from '../../../../test/tools/e2eLib.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url)) //spec/evidence/perm-run01-20261025/scripts
const projRoot = join(__dirname, '..', '..', '..', '..')

let { failed } = await runIsolatedE2e({
    projRoot,
    testDir: join(projRoot, 'test'),
    targets: ['e2e-targets.test.mjs', 'e2e-users.test.mjs'],
    beforeEachFile: async () => {
        killPortListeners(11006)
        await new Promise((resolve) => setTimeout(resolve, 2000))
    },
    afterAll: () => {
        killPortListeners(11006)
    },
})
process.exit(failed === 0 ? 0 : 1)
