import ot from 'dayjs'
import get from 'lodash-es/get.js'
import isestr from 'wsemi/src/isestr.mjs'
import cache from 'wsemi/src/cache.mjs'
import staEvent from './staLogs/staEvent.callWorker.mjs'
import staEventTable from './staLogs/staEventTable.mjs'


//mock 確定性資料集（供 e2e 統計圖穩定用）：固定起點時間 + 固定 sin 計數，不依 now / log → 每次完全相同。
//觸發：opt.mock=true（由 settings.json staEventMock 經 srv.mjs → WWebPerm 傳入）。非 mock 時走真實 staEvent。
function genMockStaEvent(timeInterval = 'hr') {
    let fmt = timeInterval === 'day' ? 'YYYY-MM-DD' : 'YYYY-MM-DDTHH'
    let unit = timeInterval === 'hr' ? 'hour' : 'day'
    let nBuckets = timeInterval === 'hr' ? 48 : 7
    let events = ['verifyConn', 'updateTargets-success', 'checkUser-error', 'api/getPerm-success', 'getWebInfor-success']
    let base = ot('2025-01-01T00:00:00') //固定起點，不依 now
    let rs = []
    for (let i = 0; i < nBuckets; i++) {
        let t = base.add(i, unit)
        let data = { count: 0 }
        events.forEach((ev, k) => {
            let c = Math.round(20 + 15 * Math.sin((i + k * 3) / 4)) //固定確定性計數
            data[ev] = c
            data.count += c
        })
        rs.push({ time: t.format(fmt), data })
    }
    return rs
}


//mock 確定性資料集（供 e2e 統計表穩定用）：固定窗計數，不依 now / log → 每次完全相同。
//5 個 event 與 genMockStaEvent 同名單；各事件滿足 last1Day>last8Hour>last4Hour>last1Hour，且各事件 last1Day 互不相同（排序明確、上多下少）。
function genMockStaEventTable() {
    let rs = [
        { event: 'verifyConn', last1Day: 240, last8Hour: 90, last4Hour: 50, last1Hour: 15 },
        { event: 'updateTargets-success', last1Day: 180, last8Hour: 70, last4Hour: 38, last1Hour: 11 },
        { event: 'checkUser-error', last1Day: 120, last8Hour: 45, last4Hour: 24, last1Hour: 7 },
        { event: 'api/getPerm-success', last1Day: 90, last8Hour: 33, last4Hour: 18, last1Hour: 5 },
        { event: 'getWebInfor-success', last1Day: 60, last8Hour: 22, last4Hour: 12, last1Hour: 3 },
    ]
    return rs
}


function proc(opt = {}) {


    //fdLog
    let fdLog = get(opt, 'fdLog', '')
    if (!isestr(fdLog)) {
        fdLog = './_logs'
    }


    //mock（e2e 統計圖穩定用）
    let mock = get(opt, 'mock', false)


    //getStaEvent
    let _getStaEvent = async (timeLength = 7, timeInterval = 'hr') => {

        //mock 模式回固定確定性資料集
        if (mock) {
            return genMockStaEvent(timeInterval)
        }

        //staEvent
        let rs = await staEvent(timeLength, timeInterval, { fdLog })

        return rs
    }
    let ocGetStaEvent = cache()
    let getStaEvent = async (userId, timeLength = 7, timeInterval = 'hr') => {

        //cacheKey: 含 timeLength + timeInterval 避免不同分組互蓋快取
        let cacheKey = `${timeLength}:${timeInterval}`

        let r = await ocGetStaEvent.getProxy(cacheKey, { fun: _getStaEvent, inputs: [timeLength, timeInterval], timeExpired: 30 * 1000 }) //快取30秒
        return r
    }


    //getStaEventTable
    let _getStaEventTable = async () => {

        //mock 模式回固定確定性資料集
        if (mock) {
            return genMockStaEventTable()
        }

        //staEventTable
        let rs = await staEventTable({ fdLog })

        return rs
    }
    let ocGetStaEventTable = cache()
    let getStaEventTable = async (userId) => {

        let r = await ocGetStaEventTable.getProxy('staEventTable', { fun: _getStaEventTable, inputs: [], timeExpired: 30 * 1000 }) //快取30秒
        return r
    }


    //pl
    let pl = {

        getStaEvent,
        getStaEventTable,

    }


    return pl
}


export default proc
