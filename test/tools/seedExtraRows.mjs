//種子旁路追加列(e2e 專用): 由 e2e-setup.mjs 之 restartBackend(…, { seedExtra }) 於「後端已停止、尚未重啟」期間以子行程執行(完成判定經 runSeedChild: 見 'finish.' 才算成功, 規則帳本 R-SEED-01).
//用法: node test/tools/seedExtraRows.mjs <json 檔>; json 為 { pemis?: [列], grups?: [列], users?: [列] }, 各列為完整列(含 id; 由呼叫端自 base seed 之列複製後改欄位).
//why: 歷史同名之 grups／pemis 列無法經任何現行寫入入口造出(外部同步與後台整表寫入皆拒同名, ADR-034; 規則帳本 R-NAME-UNIQ-01／02),
//  而「既有重複不擋存、顯示警告」(R-PRINCIPLE-00 g)與「引用對到多筆取交集」(d)之 e2e 需要這種資料, 故於後端停止期間直接以 w-serv-orm 寫入 ./db.
//  只追加(save 以 id 寫入), 不刪不改既有列; 收尾由呼叫端 restartBackend(…, { reseed: true }) 重建 base seed.
//  注意: 不得在 e2e／api 之 mocha 行程內 import g_mOrm.mjs(會持有 lmdb 映射使 reseed 刪不掉 ./db, 見 e2e-setup.mjs:wipeDbVerified), 故一律於本子行程寫入.
import fs from 'fs'
import size from 'lodash-es/size.js'
import getItemsFail from 'w-data-collector/src/getItemsFail.mjs'
import { woItems } from '../../g_mOrm.mjs'


async function main() {
    let fp = process.argv[2]
    let kp = JSON.parse(fs.readFileSync(fp, 'utf8'))
    for (let k of ['targets', 'pemis', 'grups', 'users']) {
        let rs = kp[k]
        if (!Array.isArray(rs) || rs.length === 0) {
            continue
        }
        let rss = await woItems[k].save(rs)
        let fails = getItemsFail(rss, rs)
        if (size(fails) > 0) {
            throw new Error(`seedExtraRows: ${k} 寫入失敗 ${JSON.stringify(fails)}`)
        }
        console.log(`seedExtraRows: ${k} +${rs.length}`)
    }
    console.log('finish.')
}

main()
    .catch((err) => {
        console.log('seedExtraRows catch', err)
        process.exitCode = 1 //失敗以非 0 離開碼表達, 且不印 finish.(runSeedChild 據此 reject)
    })
