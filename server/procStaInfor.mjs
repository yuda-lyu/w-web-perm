import ot from 'dayjs'
import get from 'lodash-es/get.js'
import isestr from 'wsemi/src/isestr.mjs'
import cache from 'wsemi/src/cache.mjs'
import staEvent from './staLogs/staEvent.callWorker.mjs'
import staEventTable from './staLogs/staEventTable.callWorker.mjs'


//mock 之事件名單：
//  true（預設 5 種）：既有 e2e 標準圖所用；
//  'many'（13 種）：本系統實際會記錄之事件名（取自本機 log），供圖例列數跨門檻之 e2e（1440 寬時一般式 2 列，勾全部加總並切中文為 3 列）
let MOCK_EVENTS = ['verifyConn', 'updateTargets-success', 'checkUser-error', 'api/getPerm-success', 'getWebInfor-success']
let MOCK_EVENTS_MANY = ['api/getPermUserInfor-success', 'api/getUserByToken-success', 'getStaEvent-success', 'getStaEventTable-success', 'getTokenUser-error', 'getWebInfor-success', 'updateGrups-success', 'updatePemis-success', 'updateTabItems-pickKeysOnly', 'updateTargets-success', 'updateUsers-success', 'verifyConn', 'verifyConn-error']
function getMockEvents(mock) {
    return mock === 'many' ? MOCK_EVENTS_MANY : MOCK_EVENTS
}


//mock 確定性資料集（供 e2e 統計圖穩定用）：固定起點時間 + 固定 sin 計數，不依 now / log → 每次完全相同。
//觸發：opt.mock 為 true 或 'many'（由 settings.json staEventMock 經 srv.mjs → WWebPerm 傳入）。非 mock 時走真實 staEvent。
function genMockStaEvent(timeInterval = 'hr', mock = true) {
    let fmt = timeInterval === 'day' ? 'YYYY-MM-DD' : 'YYYY-MM-DDTHH'
    let unit = timeInterval === 'hr' ? 'hour' : 'day'
    let nBuckets = timeInterval === 'hr' ? 48 : 7
    let events = getMockEvents(mock)
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
//事件名單與 genMockStaEvent 相同；各事件滿足 last1Day>last8Hour>last4Hour>last1Hour，且各事件 last1Day 互不相同（排序明確、上多下少）。
function genMockStaEventTable(mock = true) {
    if (mock !== 'many') {
        let rs = [
            { event: 'verifyConn', last1Day: 240, last8Hour: 90, last4Hour: 50, last1Hour: 15 },
            { event: 'updateTargets-success', last1Day: 180, last8Hour: 70, last4Hour: 38, last1Hour: 11 },
            { event: 'checkUser-error', last1Day: 120, last8Hour: 45, last4Hour: 24, last1Hour: 7 },
            { event: 'api/getPerm-success', last1Day: 90, last8Hour: 33, last4Hour: 18, last1Hour: 5 },
            { event: 'getWebInfor-success', last1Day: 60, last8Hour: 22, last4Hour: 12, last1Hour: 3 },
        ]
        return rs
    }
    //'many': 依名單順序遞減, last1Day 自 400 起每事件少 20（互不相同）
    let rs = MOCK_EVENTS_MANY.map((event, k) => {
        let last1Day = 400 - k * 20
        return { event, last1Day, last8Hour: Math.round(last1Day * 0.4), last4Hour: Math.round(last1Day * 0.2), last1Hour: Math.round(last1Day * 0.05) }
    })
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
            return genMockStaEvent(timeInterval, mock)
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
            return genMockStaEventTable(mock)
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
