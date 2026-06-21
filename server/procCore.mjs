import get from 'lodash-es/get.js'
import each from 'lodash-es/each.js'
import map from 'lodash-es/map.js'
import size from 'lodash-es/size.js'
import isestr from 'wsemi/src/isestr.mjs'
import haskey from 'wsemi/src/haskey.mjs'
import arrHas from 'wsemi/src/arrHas.mjs'
import ltdtDiffByKey from 'wsemi/src/ltdtDiffByKey.mjs'
import ltdtmapping from 'wsemi/src/ltdtmapping.mjs'
import ds from '../src/schema/index.mjs'


function proc(woItems, procOrm, { srLog, kmx }) {


    //updateTabItems
    let updateTabItems = async (keyTable, userId, rows, keyDetect) => {
        // console.log('updateTabItems', keyTable, userId, rows.length, keyDetect)

        //序列化同表之並行整表批次寫入: 防 lost update (同 keyTable 序列化, 不同表並行)
        return await kmx('updateTabItems:' + keyTable, async () => {

        //ltdtmapping
        rows = ltdtmapping(rows, ds[keyTable].keys)
        // console.log('ltdtmapping rows', rows)

        //重給order
        rows = map(rows, (r, k) => {
            r.order = k + 1
            return r
        })

        //ckKey, 回傳 err key (saveRowFieldInvalid / saveRowFieldDuplicate) 或 null; 動態細節 (row index/field/value) 改記 srLog, 不進使用者訊息
        let ckKey = (rows, key) => {
            let err = null

            //check
            let kp = {}
            each(rows, (v, k) => {

                //value
                let value = get(v, key, '')

                //check
                if (!isestr(value)) {
                    srLog.error({ event: 'updateTabItems-ckKey-error', keyTable, key, msg: 'saveRowFieldInvalid', row: k })
                    err = `saveRowFieldInvalid`
                    return false //跳出
                }

                //check
                if (haskey(kp, value)) {
                    srLog.error({ event: 'updateTabItems-ckKey-error', keyTable, key, msg: 'saveRowFieldDuplicate', row: k, value })
                    err = `saveRowFieldDuplicate`
                    return false //跳出
                }

                //kp
                kp[value] = true

            })

            return err
        }

        //偵測未給予或重複
        let err = null
        if (true) {
            if (arrHas(keyTable, ['targets'])) {
                err = ckKey(rows, 'id')
                if (err !== null) {
                    return Promise.reject(err)
                }
            }
            if (arrHas(keyTable, ['pemis', 'grups'])) { //users可重複name故不列入
                err = ckKey(rows, 'name')
                if (err !== null) {
                    return Promise.reject(err)
                }
            }
            if (arrHas(keyTable, ['users'])) {
                err = ckKey(rows, 'email')
                if (err !== null) {
                    return Promise.reject(err)
                }
            }
        }

        //ltdtDiffByKey
        let ltdtOld = await woItems[keyTable].select()
        let ltdtNew = rows
        let r = ltdtDiffByKey(ltdtOld, ltdtNew, keyDetect)
        // console.log('ltdtDiffByKey r', r)

        //del
        if (size(r.del) > 0) {
            await procOrm(userId, keyTable, 'del', r.del) //須使用procOrm才有辦法自動給予相關欄位
            // .catch((err) => {
            //     console.log('woItems[keyTable].del err', err)
            // })
        }

        //add
        if (size(r.add) > 0) {
            await procOrm(userId, keyTable, 'insert', r.add) //須使用procOrm才有辦法自動給予相關欄位
            // .catch((err) => {
            //     console.log('woItems[keyTable].insert err', err)
            // })
        }

        //diff
        if (size(r.diff) > 0) {
            await procOrm(userId, keyTable, 'save', r.diff) //須使用procOrm才有辦法自動給予相關欄位
            // .catch((err) => {
            //     console.log('woItems[keyTable].save err', err)
            // })
        }

        return ltdtNew

        })
    }


    //updateTargets
    let updateTargets = async (userId, rows) => {
        await updateTabItems('targets', userId, rows, 'id')
        srLog.info({ event: 'updateTargets-success', userId })
        return 'saveTabItemsSuccess' //成功 msg key
    }


    //updatePemis
    let updatePemis = async (userId, rows) => {
        await updateTabItems('pemis', userId, rows, 'name')
        srLog.info({ event: 'updatePemis-success', userId })
        return 'saveTabItemsSuccess' //成功 msg key
    }


    //updateGrups
    let updateGrups = async (userId, rows) => {
        await updateTabItems('grups', userId, rows, 'name')
        srLog.info({ event: 'updateGrups-success', userId })
        return 'saveTabItemsSuccess' //成功 msg key
    }


    //updateUsers
    let updateUsers = async (userId, rows) => {
        await updateTabItems('users', userId, rows, 'id')
        srLog.info({ event: 'updateUsers-success', userId })
        return 'saveTabItemsSuccess' //成功 msg key
    }


    let p = {
        updateTargets,
        updatePemis,
        updateGrups,
        updateUsers,
    }


    return p
}


export default proc
