import ot from 'dayjs'
import get from 'lodash-es/get.js'
import each from 'lodash-es/each.js'
import genPm from 'wsemi/src/genPm.mjs'
import isestr from 'wsemi/src/isestr.mjs'
import fsTreeFolder from 'wsemi/src/fsTreeFolder.mjs'
import fsBuildReadStreamText from 'wsemi/src/fsBuildReadStreamText.mjs'
import filterVpfsByWindow from './filterVpfsByWindow.mjs'


//統計各 event 事件於近 1日/8hr/4hr/1hr 各窗內之發生數量（鏡像 staEvent.mjs 的 NDJSON 讀取方式）。
//巢狀窗:1hr⊂4hr⊂8hr⊂24hr, 各窗各自累計該窗內出現總數。
//回傳: [{ event, last1Day, last8Hour, last4Hour, last1Hour }, ...], 依 last1Day 由大到小排序。
async function staEventTable(opt = {}) {

    //fdLog
    let fdLog = get(opt, 'fdLog')
    if (!isestr(fdLog)) {
        fdLog = './_logs'
    }

    //now
    let now = ot()

    //kp, 各 event 名累計各窗計數
    let kp = {}

    //vpfs
    let vpfs = fsTreeFolder(fdLog)
    vpfs = filterVpfsByWindow(vpfs, now.subtract(25, 'hour'), 'YYYY-MM-DDTHH') //開檔前剔除窗外檔; 用 25h(非 24h)是因 diff('hour') 取整, 最舊可能到 now-25h, 多留一小時確保不漏讀

    //逐檔逐行讀取
    for (let vpf of vpfs) {

        //fp
        let fp = vpf.path

        //ev
        let ev = fsBuildReadStreamText(fp)

        //line
        ev.on('line', (line) => {
            try {
                let v = JSON.parse(line)
                let event = v.event
                if (!isestr(event)) {
                    return
                }

                //dh, 距今幾小時(用 dayjs 比較)
                let dh = now.diff(ot(v.time), 'hour')
                if (dh < 0 || dh > 24) {
                    return //超過 1日窗或未來時間略過
                }

                //初始化
                if (!kp[event]) {
                    kp[event] = { last1Day: 0, last8Hour: 0, last4Hour: 0, last1Hour: 0 }
                }

                //巢狀窗各自累計(1hr⊂4hr⊂8hr⊂24hr)
                if (dh <= 24) {
                    kp[event].last1Day += 1
                }
                if (dh <= 8) {
                    kp[event].last8Hour += 1
                }
                if (dh <= 4) {
                    kp[event].last4Hour += 1
                }
                if (dh <= 1) {
                    kp[event].last1Hour += 1
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

    //rs
    let rs = []
    each(kp, (vv, event) => {
        rs.push({
            event,
            ...vv,
        })
    })

    //依 last1Day 由大到小排序
    rs.sort((a, b) => b.last1Day - a.last1Day)

    return rs
}

export default staEventTable
