//第 570 項實測: w-serv-orm 現行版(已安裝)對「主鍵為 NaN、±Infinity」之寫入行為(procOrm insert／save／mix; 以真 getMapOrm → getProc 組裝, 資料表為記憶體替身)
//  同時量測 validateRowsBeforeWrite 對同批輸入之判定, 與「JSON 通道可否送達 NaN／±Infinity」(JSON.stringify 後 → null)
import ds from '../../src/schema/index.mjs'
import validateRowsBeforeWrite from '../../server/validateRows.mjs'
import { mkTable, mkProcOrm } from '../../test/tools/unitOrm.mjs'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
let ver = require('w-serv-orm/package.json').version
console.log(JSON.stringify({ wServOrmVersion: ver }))

let ids = [['NaN', NaN], ['Infinity', Infinity], ['-Infinity', -Infinity], ['true', true], ['{}', {}]]
for (let [nm, id] of ids) {
    for (let fn of ['insert', 'save']) {
        let woItems = { targets: mkTable([]), pemis: mkTable([]), grups: mkTable([]), users: mkTable([]) }
        let procOrm = mkProcOrm(ds, woItems)
        let r = null
        try {
            let x = await procOrm('id-u', 'targets', fn, [{ id: 'T-ok', name: 'ok' }, { id, name: 'bad' }])
            r = { resolved: true, ok: JSON.stringify(x).slice(0, 80) }
        }
        catch (err) {
            r = { rejected: true, msg: String((err && err.message) || err).slice(0, 120) }
        }
        console.log(JSON.stringify({ id: nm, fn, ...r, tableSize: woItems.targets.size(), insertCalls: woItems.targets.cnt.insert, saveCalls: woItems.targets.cnt.save }))
    }
    console.log(JSON.stringify({ id: nm, validateRowsBeforeWrite: validateRowsBeforeWrite([{ id }]), idRequired: validateRowsBeforeWrite([{ id }], { idRequired: true }) }))
    console.log(JSON.stringify({ id: nm, afterJsonRoundTrip: JSON.parse(JSON.stringify({ id })).id }))
}
