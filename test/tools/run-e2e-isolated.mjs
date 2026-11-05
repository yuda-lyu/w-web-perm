//逐檔隔離執行 e2e：每個 browser e2e 檔以「獨立 mocha 進程 + 全新後端」跑，前端(dev server)保持暖機共用。
//
//why：本專案 e2e 檔本就設計為逐檔獨立(各自 seedDb g_initialTestData + 自 spawn 後端 + 自管 browser 生命週期，
//  且有 --baseline 直跑入口)。把它們塞進單一 mocha 進程(npm test 的 `mocha` 全 glob)時，會共用「api 相先 seed
//  並經 updateXxx 還原 RPC 正規化過 order 欄位」的後端 → 對話框類 case 之 grid 列序(sortBy order)與 solo 自產
//  baseline 不符 → 整批 pixel mismatch(2026-07-10 以 grups E2E-008 之 diff 圖確證: 同資料、列序相反)。
//  逐檔各給全新後端(純 g_initialTestData 種子)即回到 solo 之綠燈狀態，且無須改動任何 baseline 或 production 碼。
//
//機制：每檔前只殺「本實例之」後端(基準 11006 經保留位移後之實際埠)、保留前端(基準 8090, 無狀態且啟動慢)。新 mocha 進程偵測後端埠沒人 → seedDb+spawn
//  全新後端；前端埠已起 → reuse。測試檔以 pattern 動態列舉(新增之 e2e-*.test.mjs 自動納入, 不因寫死清單而被靜默漏跑)；
//  下方 runIsolatedE2e 之預設 pattern 為 /^e2e-.*\.test\.mjs$/(未覆寫)。
//  api-doubleclick(2026-09-28 由 e2e-doubleclick 改名, 見 spec/設計要點與取捨.md ADR-017 Update；純 API 契約測試,
//  無瀏覽器/UI 終態)改名後不再匹配此 pattern、不納入本隔離 runner；其自帶 restoreBaseSeed 經 RPC 還原 base seed,
//  不需整檔換全新後端, 改與其餘 api-*/unit-* 共用同一後端、由 `npm test`(mocha test/*.test.mjs)涵蓋。
//2026-09-28 起組裝自 e2e 共用設施（當時為 w-web-sso 之 srcPack，2026-09-29 起為 w-package-tools-e2e；runIsolatedE2e；經 ./e2eLib.mjs 引用）。
//  2026-09-30 升 1.0.3 起，有本地 mocha 時以 node 直接執行 node_modules/mocha/bin/mocha.js、不經 shell（原為 npx mocha，Windows 下經 cmd.exe）。
//2026-11-05 起(排程第 309 項, 規格 E1～E4): 本 runner 於最上層(經 e2ePorts.mjs)先呼叫一次 reserveE2ePorts, 子行程之 mocha 繼承保留(E2E_PORT_HOLD／E2E_PORT_OFFSET)而不再各自換埠;
//  原 killPortListeners(依埠殺任何監聽者, 占用者可能是別的套件之測試; 2026-11-05 修前以真實占用者實測第一檔前即被殺)改為 reservation.killOwnListeners(只殺身分已確認屬本實例者);
//  該埠上有非本實例之監聽者時不殺並拋錯中止(不讓下一檔沿用別人之服務)。
//
//用法：node test/tools/run-e2e-isolated.mjs   (exit 0=全綠；非 0=有失敗檔)

import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { runIsolatedE2e } from './e2eLib.mjs'
import { BACKEND_PORT, reservation } from './e2ePorts.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url)) //test/tools
//後端實際埠: 基準埠經保留後之實際埠(沒有占用且未設 E2E_PORT_OFFSET 時＝11006, 與導入前相同)
const BACKEND_ACTUAL_PORT = reservation.portOf(BACKEND_PORT)

//只殺本實例之後端監聽者; 有非本實例之監聽者(skipped)不殺: strict 時拋錯中止(每檔前, 免下一檔沿用別人之服務), 否則只印出(收尾, 不遮蔽逐檔結果)
//查不到監聽者(r.pids === null)時先重試 3 次; 仍查不到＝無法確認埠上有無別人之服務: 不殺, strict 時同樣中止(2026-11-05 w-web-api 實測: 只印出就續跑, 下一檔會沿用占用者之服務)
const killOwnBackend = async (strict) => {
    let r = null
    for (let i = 0; i < 3; i++) {
        r = reservation.killOwnListeners(BACKEND_ACTUAL_PORT)
        if (r.pids !== null) {
            break
        }
        await new Promise((resolve) => setTimeout(resolve, 1000))
    }
    if (r.pids === null) {
        const msg = `[run-e2e-isolated] 查詢埠 ${BACKEND_ACTUAL_PORT} 監聽者之工具不可用(重試 3 次), 無法確認埠上有無非本實例之監聽者, 未殺`
        if (strict) {
            throw new Error(`${msg}; 為免下一檔沿用別人之服務而中止`)
        }
        console.log(msg)
    }
    else if (r.skipped.length > 0) {
        const msg = `[run-e2e-isolated] 埠 ${BACKEND_ACTUAL_PORT} 有非本實例之監聽者(PID ${r.skipped.join(', ')}), 不下殺(占用者可能是別的套件正在跑之測試)`
        if (strict) {
            throw new Error(`${msg}; 為免下一檔沿用別人之服務而中止`)
        }
        console.log(msg)
    }
    return r
}

let { failed } = await runIsolatedE2e({
    projRoot: join(__dirname, '..', '..'),
    testDir: join(__dirname, '..'),
    beforeEachFile: async () => {
        //每檔前殺本實例之後端 → 新 mocha 進程自 seed+spawn 全新後端；前端保持暖機
        await killOwnBackend(true)
        await new Promise((resolve) => setTimeout(resolve, 2000))
    },
    afterAll: async () => {
        //收尾殺本實例之後端(前端留給使用者/後續)
        await killOwnBackend(false)
    },
})
process.exit(failed === 0 ? 0 : 1)
