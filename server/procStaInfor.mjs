import get from 'lodash-es/get.js'
import isestr from 'wsemi/src/isestr.mjs'
import cache from 'wsemi/src/cache.mjs'
import staEvent from './staLogs/staEvent.callWorker.mjs'


function proc(opt = {}) {


    //fdLog
    let fdLog = get(opt, 'fdLog', '')
    if (!isestr(fdLog)) {
        fdLog = './_logs'
    }


    //getStaEvent
    let _getStaEvent = async (timeLength = 7, timeInterval = 'hr') => {

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


    //pl
    let pl = {

        getStaEvent,

    }


    return pl
}


export default proc
