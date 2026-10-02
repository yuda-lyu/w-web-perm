//逐檔隔離執行 e2e：每個 browser e2e 檔以「獨立 mocha 進程 + 全新後端」跑，前端(dev server)保持暖機共用。
//
//why：本專案 e2e 檔本就設計為逐檔獨立(各自 seedDb g_initialTestData + 自 spawn 後端 + 自管 browser 生命週期，
//  且有 --baseline 直跑入口)。把它們塞進單一 mocha 進程(npm test 的 `mocha` 全 glob)時，會共用「api 相先 seed
//  並經 updateXxx 還原 RPC 正規化過 order 欄位」的後端 → 對話框類 case 之 grid 列序(sortBy order)與 solo 自產
//  baseline 不符 → 整批 pixel mismatch(2026-07-10 以 grups E2E-008 之 diff 圖確證: 同資料、列序相反)。
//  逐檔各給全新後端(純 g_initialTestData 種子)即回到 solo 之綠燈狀態，且無須改動任何 baseline 或 production 碼。
//
//機制：每檔前只殺後端(11006, 專屬本專案, CLAUDE.md 明文例外)、保留前端(8090, 無狀態且啟動慢)。新 mocha 進程偵測 11006 沒人 → seedDb+spawn
//  全新後端；8090 已起 → reuse。測試檔以 pattern 動態列舉(新增之 e2e-*.test.mjs 自動納入, 不因寫死清單而被靜默漏跑)；
//  下方 runIsolatedE2e 之預設 pattern 為 /^e2e-.*\.test\.mjs$/(未覆寫)。
//  api-doubleclick(2026-09-28 由 e2e-doubleclick 改名, 見 spec/設計要點與取捨.md ADR-017 Update；純 API 契約測試,
//  無瀏覽器/UI 終態)改名後不再匹配此 pattern、不納入本隔離 runner；其自帶 restoreBaseSeed 經 RPC 還原 base seed,
//  不需整檔換全新後端, 改與其餘 api-*/unit-* 共用同一後端、由 `npm test`(mocha test/*.test.mjs)涵蓋。
//2026-09-28 起組裝自 e2e 共用設施（當時為 w-web-sso 之 srcPack，2026-09-29 起為 w-package-tools-e2e；runIsolatedE2e、killPortListeners；經 ./e2eLib.mjs 引用）。
//  2026-09-30 升 1.0.3 起，有本地 mocha 時以 node 直接執行 node_modules/mocha/bin/mocha.js、不經 shell（原為 npx mocha，Windows 下經 cmd.exe）。
//
//用法：node test/tools/run-e2e-isolated.mjs   (exit 0=全綠；非 0=有失敗檔)

import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { runIsolatedE2e, killPortListeners } from './e2eLib.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url)) //test/tools
const BACKEND_PORT = 11006

let { failed } = await runIsolatedE2e({
    projRoot: join(__dirname, '..', '..'),
    testDir: join(__dirname, '..'),
    beforeEachFile: async () => {
        //每檔前殺後端 → 新 mocha 進程自 seed+spawn 全新後端；前端保持暖機
        killPortListeners(BACKEND_PORT)
        await new Promise((resolve) => setTimeout(resolve, 2000))
    },
    afterAll: () => {
        //收尾殺後端(前端留給使用者/後續)
        killPortListeners(BACKEND_PORT)
    },
})
process.exit(failed === 0 ? 0 : 1)
