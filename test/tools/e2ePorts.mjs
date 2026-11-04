//e2e 埠之單一定義與保留(排程第 309 項, 2026-11-05 wp309; 規格 C:/opensrcOper/dspec/e2e埠與多套件同跑.md E1～E8; 套件 w-package-tools-e2e >= 1.0.22 README §2.12; 規則帳本 R-E2E-PORT-01)。
//
//本模組為「基準埠」唯一定義處, 並於模組載入時呼叫一次 reserveE2ePorts(本實例全部基準埠)——須早於任何 resolveE2ePort／createServiceManager:
//  e2e-setup.mjs 與 run-e2e-isolated.mjs 皆自本檔取得基準埠與保留(ES 模組先評估被匯入者, 故先於其本體之任何取埠)。
//行為(沒有占用時與導入前相同):
//  - 基準埠 11006／8090 空閒 → 即基準埠, E2E_PORT_OFFSET 維持未設, 標準圖與行為不變。
//  - 任一基準埠被占用(別的套件正在跑, 或本機其他服務) → 整組位移 portStep(預設 100)至空閒之組, 位移寫入 E2E_PORT_OFFSET, 其後
//    resolveE2ePort／createServiceManager／前端 proxy(vue.config.js)／子行程一律取得同一組實際埠; 實際埠印入輸出([e2e-port] …)。絕不殺占用者(E4)。
//  - 手動設 E2E_PORT_OFFSET(含 0)＝不換埠(多開工具配發位移; 0 為「沿用本機已起之服務」逃生口); 上層已保留(E2E_PORT_HOLD; 逐檔 runner 之子行程、多開各組)＝沿用上層之位移。
//OTHER_TEST_PORTS 為本套件 api-／unit- 測試及其子行程寫死之監聽埠(盤點 2026-11-05, 實查見規則帳本): 位移後之實際埠不得落在其上。
//  現行基準埠 11006／8090 以間距 100 位移, 實際埠恆以 06／90 結尾, 不會落在 85xx; 列出為防日後改基準埠或間距。
//  這些測試埠本身與他套件(w-web-api 8561～8565 等)之撞埠屬規格 E8(非 e2e 測試之監聽埠), 另案處理。

import { reserveE2ePorts } from './e2eLib.mjs'

//基準埠(正式實例用; 與 vue.config.js 之 proxy 預設 11006、settings.json 之 serverPort 一致)。其餘組埠處一律經 resolveE2ePort(基準埠)／reservation.portOf(基準埠)。
export const BACKEND_PORT = 11006
//perm e2e 用獨立的 8090（避開常駐於 8080 的其他專案 dev server），以 --port 顯式指定確保確定性
export const FRONTEND_PORT = 8090
//api-／unit- 測試寫死之監聽埠: 8549(wwebpermInitChild)、8561(api-ormDiag)、8562(unit-ormDiag)、8563(api-maskRaw)、8564／8565(api-consoleNoValues)
export const OTHER_TEST_PORTS = [8549, 8561, 8562, 8563, 8564, 8565]

export const reservation = reserveE2ePorts([BACKEND_PORT, FRONTEND_PORT], { avoid: OTHER_TEST_PORTS })
