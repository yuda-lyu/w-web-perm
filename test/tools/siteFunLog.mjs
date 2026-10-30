//本套件 ORM 診斷轉接之「呼叫點運算式」取出與重建(unit-ormDiag、unit-ormDiagSafeKeys 共用; 同一 helper 只定義一次):
//  自 server/WWebPerm.mjs 之 WServOrm 建構行取出 funLog 運算式原文(本套件實際呼叫點), 以 new Function 在受控之三個識別字(genDiagFunLog、srLog、SAFE_KEYS)下重建 funLog;
//  呼叫點若被改成別的寫法(自寫轉接器、漏 .funLog、漏 safeKeys、引入他處之識別字)則此處跟著變或拋 ReferenceError, 使各測試反映真實接線, 而非測試自己再寫一份接線。
import path from 'path'
import assert from 'assert'
import { fileURLToPath } from 'url'
import genDiagFunLog from 'wsemi/src/genDiagFunLog.mjs'
import { SAFE_KEYS } from 'w-serv-orm/src/safeKeys.mjs'
import { sourceLines } from './srcScan.mjs'

const A = assert.strict
const projRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
export const fpWWebPerm = path.join(projRoot, 'server', 'WWebPerm.mjs')


//getSiteExpr: 自 WWebPerm.mjs 之 WServOrm 建構行取出 funLog 運算式原文; 找不到(或不只一處)回 null
export function getSiteExpr() {
    let ls = sourceLines(fpWWebPerm, 'code').filter((l) => /\bWServOrm\(ds, WOrm, url, db, \{ funLog: .+ \}\)/.test(l.text))
    if (ls.length !== 1) {
        return null
    }
    return ls[0].text.match(/\{ funLog: (.+) \}\)/)[1].trim()
}


//mkSiteFunLog: 以呼叫點之運算式原文建 funLog(srLog 為替身; SAFE_KEYS 為 w-serv-orm 公開之真名單, 與 WWebPerm.mjs 之匯入同一個物件)
export function mkSiteFunLog(srLog) {
    let expr = getSiteExpr()
    A.ok(expr !== null, '找不到 WWebPerm.mjs 之 WServOrm 建構行(須恰一處且寫成 { funLog: <運算式> })')
    // eslint-disable-next-line no-new-func
    return new Function('genDiagFunLog', 'srLog', 'SAFE_KEYS', `return ${expr}`)(genDiagFunLog, srLog, SAFE_KEYS)
}
