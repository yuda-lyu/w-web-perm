//e2e 檔開頭擷取之 base seed 須為「剛種子完」之 pristine 狀態(規則帳本 R-E2E-ISO-01; 第 89 項)
//
//單一 mocha 行程全跑(npm test)時, 各 e2e 檔共用同一個後端與 ./db(不像逐檔隔離 runner 每檔重種); 前檔最後一案若遺留改動
//(如 e2e-rela-user-grup E2E-010 寫入同名使用者 mary-dup, 其後無下一案之 resetDb 還原), 後檔 captureBaseSeedOnce 會把遺留當成 base seed 凍結,
//之後 24 案以截圖差與筆數不符大量失敗, 現象與根因相距甚遠. 擷取當下以「主鍵集合」守門(種子之主鍵具決定性, 取自各表 schema 之 funTest),
//使這類遺留在檔案起點即以可讀訊息失敗, 並點名多出／缺少之主鍵. 守門只比主鍵集合, 不比欄位內容(同主鍵之內容遺留不在其涵蓋內; 那類遺留由各檔檔尾還原防止).
//本檔為無副作用之純模組(供 e2e-setup.mjs 與 unit-e2e-lifecycle 共用).
import ds from '../../src/schema/index.mjs'


//g_initialTestData.mjs 種子之筆數(users: admin/john/mary/peter; grups: 權限群組M1~M4; pemis: 權限P1~P4; targets: 22 個標的)
export const BASE_SEED_COUNT = { users: 4, grups: 4, pemis: 4, targets: 22 }

let cacheIds = {}

/**
 * 取得某表種子之主鍵集合(排序), 取自該表 schema 之 funTest(與 g_initialTestData 同源); funTest 會 console.log 產生的列, 此處暫時靜音
 *
 * @param {String} key 輸入表名字串, 'users'、'grups'、'pemis' 或 'targets'
 * @returns {Array} 回傳排序後之主鍵陣列
 */
export function getSeedIds(key) {
    if (typeof BASE_SEED_COUNT[key] !== 'number') {
        throw new Error(`getSeedIds: 未知的表名「${key}」`)
    }
    if (!cacheIds[key]) {
        let log = console.log
        console.log = () => {}
        try {
            cacheIds[key] = ds[key].funTest().map((v) => v.id).sort()
        }
        finally {
            console.log = log
        }
    }
    return cacheIds[key].slice()
}


/**
 * 斷言擷取到的 seed 為 pristine base seed(主鍵集合與種子一致), 否則拋出可讀訊息(含筆數與多出／缺少之主鍵)
 *
 * @param {String} key 輸入表名字串, 'users'、'grups'、'pemis' 或 'targets'
 * @param {Array} seed 輸入自 $store.state 擷取之列陣列
 * @returns {Array} 回傳原 seed
 */
export function assertPristineSeed(key, seed) {
    let want = getSeedIds(key)
    let n = BASE_SEED_COUNT[key]
    let got = Array.isArray(seed) ? seed.map((v) => (v && v.id !== undefined) ? String(v.id) : '?') : null
    let extra = got ? got.filter((id) => !want.includes(id)) : []
    let lack = got ? want.filter((id) => !got.includes(id)) : []
    if (!got || got.length !== n || extra.length > 0 || lack.length > 0) {
        let names = Array.isArray(seed) ? seed.map((v) => (v && (v.name || v.id)) || '?').join(', ') : String(seed)
        //多出之列若為外部列(from 為非空字串), 在主鍵後註記其 from 分區: 各測試檔之夾具各用專屬 from(如 e2e-init E2E-006 之 appE2eInit006), 據此可指向是哪個檔遺留(2026-10-22 run09)
        let fromOf = (id) => {
            let r = Array.isArray(seed) ? seed.find((v) => v && v.id !== undefined && String(v.id) === id) : null
            return (r && typeof r.from === 'string' && r.from !== '') ? `${id}(from=${r.from})` : id
        }
        throw new Error(`captureBaseSeedOnce(${key}): 擷取到的資料不是 pristine base seed(實得 ${got ? got.length : '非陣列'} 筆, 應為 ${n} 筆; 多出主鍵 [${extra.map(fromOf).join(', ')}]、缺少主鍵 [${lack.join(', ')}]): [${names}]。` +
            '常見成因: 單一 mocha 行程內前一個 e2e 檔遺留改動(其收尾未還原本表)或前置測試污染了庫; 逐檔隔離執行不會遇到(每檔重種)。')
    }
    return seed
}
