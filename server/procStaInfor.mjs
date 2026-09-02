import ot from 'dayjs'
import get from 'lodash-es/get.js'
import isestr from 'wsemi/src/isestr.mjs'
import cache from 'wsemi/src/cache.mjs'
import staEvent from './staLogs/staEvent.callWorker.mjs'
import staEventTable from './staLogs/staEventTable.callWorker.mjs'


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
        fdLog = './logs'
    }


    //mock（e2e 統計圖穩定用）
    let mock = get(opt, 'mock', false)


    //srLog（staLogsCore 單檔略過時記 warn）
    let srLog = get(opt, 'srLog', null)


    //getStaEvent
    let _getStaEvent = async (timeLength = 7, timeInterval = 'hr') => {

        //mock 模式回固定確定性資料集
        if (mock) {
            return genMockStaEvent(timeInterval)
        }

        //staEvent
        let rs = await staEvent(timeLength, timeInterval, { fdLog, srLog })

        return rs
    }
    let ocGetStaEvent = cache()
    let getStaEvent = async (userId, timeLength = 7, timeInterval = 'hr') => {

        //cacheKey: 含 timeLength + timeInterval 避免不同分組互蓋快取
        let cacheKey = `${timeLength}:${timeInterval}`

        //wsemi ≥1.8.81 cache: 執行中共用 in-flight promise (併發不輪詢); timeFrom:'end' 使 30 秒自掃描完成起算; useCacheWhenError:false 失敗不快取且拋錯
        //(取代原「非陣列即 clear + reject」之繞道), 失敗一律 reject 'cannotGetStaEvent' 讓上層 (kpFunExt) 記 err key
        let r = await ocGetStaEvent.getProxy(cacheKey, { fun: _getStaEvent, inputs: [timeLength, timeInterval], timeExpired: 30 * 1000, timeFrom: 'end', useCacheWhenError: false }) //快取30秒
            .catch(() => {
                return Promise.reject('cannotGetStaEvent')
            })
        if (!Array.isArray(r)) {
            return Promise.reject('cannotGetStaEvent')
        }
        return r
    }


    //getStaEventTable
    let _getStaEventTable = async () => {

        //mock 模式回固定確定性資料集
        if (mock) {
            return genMockStaEventTable()
        }

        //staEventTable
        let rs = await staEventTable({ fdLog, srLog })

        return rs
    }
    let ocGetStaEventTable = cache()
    let getStaEventTable = async (userId) => {

        //cache 選項同 getStaEvent
        let r = await ocGetStaEventTable.getProxy('staEventTable', { fun: _getStaEventTable, inputs: [], timeExpired: 30 * 1000, timeFrom: 'end', useCacheWhenError: false }) //快取30秒
            .catch(() => {
                return Promise.reject('cannotGetStaEventTable')
            })
        if (!Array.isArray(r)) {
            return Promise.reject('cannotGetStaEventTable')
        }
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
