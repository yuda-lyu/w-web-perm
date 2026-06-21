import ot from 'dayjs'
import get from 'lodash-es/get.js'
import size from 'lodash-es/size.js'
import groupBy from 'lodash-es/groupBy.js'
import each from 'lodash-es/each.js'
import mapValues from 'lodash-es/mapValues.js'
import merge from 'lodash-es/merge.js'
import genPm from 'wsemi/src/genPm.mjs'
import isestr from 'wsemi/src/isestr.mjs'
import fsTreeFolder from 'wsemi/src/fsTreeFolder.mjs'
import fsBuildReadStreamText from 'wsemi/src/fsBuildReadStreamText.mjs'


//統計各 event 事件於各時間桶之發生頻率（鏡像 SSO staLogs/staToken.mjs；差異：不限特定 event，改依 event 名分組）。
//回傳: [{ time, data: { count, <event1>: n, <event2>: m, ... } }, ...]（count 為該時間桶全部事件數）
async function staEvent(timeLength = 7, timeInterval = 'hr', opt = {}) {

    //fdLog
    let fdLog = get(opt, 'fdLog')
    if (!isestr(fdLog)) {
        fdLog = './_logs'
    }

    //fmt
    let fmt = timeInterval === 'day' ? 'YYYY-MM-DD' : 'YYYY-MM-DDTHH'

    //unit
    let unit = timeInterval === 'hr' ? 'hour' : 'day'

    //kpTime, 產生完整的時間區間
    let now = ot()
    let tStart = now.subtract(timeLength, 'day')
    let tCurr = tStart.startOf(unit)
    let tEnd = now.startOf(unit)
    let kpTime = {}
    while (!tCurr.isAfter(tEnd)) {
        kpTime[tCurr.format(fmt)] = { data: { count: 0 } }
        tCurr = tCurr.add(1, unit)
    }

    //vpfs
    let vpfs = fsTreeFolder(fdLog)

    //logs
    let logs = []
    for (let vpf of vpfs) {

        //fp
        let fp = vpf.path

        //ev
        let ev = fsBuildReadStreamText(fp)

        //line
        ev.on('line', (line) => {
            let v = null
            try {
                v = JSON.parse(line)
                let t = ot(v.time)
                let timeFmt = t.format(fmt)
                let b1 = t.isAfter(tStart)
                let b2 = isestr(v.event) //有 event 欄位即計入（不限特定 event）
                let b = b1 && b2
                if (b) {
                    logs.push({
                        timeFmt,
                        ...v,
                    })
                }
            }
            catch (err) {}
        })

        //await close
        let pm = genPm()
        ev.on('close', () => {
            pm.resolve()
        })
        await pm

    }

    //gs
    let gs = groupBy(logs, 'timeFmt')

    //gsLog, 各時間桶內依 event 名分組計數
    let gsLog = mapValues(gs, vs => {
        let count = size(vs)
        let geve = groupBy(vs, 'event')
        let kp = {}
        each(geve, (vvs, event) => {
            kp[event] = size(vvs)
        })
        return {
            data: {
                count,
                ...kp,
            }
        }
    })

    //merge
    let mr = merge({}, kpTime, gsLog)

    //rs
    let rs = Object.keys(mr)
        .sort()
        .map(time => ({
            time,
            ...mr[time]
        }))

    return rs
}

export default staEvent
