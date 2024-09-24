import axios from 'axios'
import get from 'lodash-es/get.js'
import each from 'lodash-es/each.js'
import isestr from 'wsemi/src/isestr.mjs'
import isbol from 'wsemi/src/isbol.mjs'
import isfun from 'wsemi/src/isfun.mjs'
import genPm from 'wsemi/src/genPm.mjs'
import pmInvResolve from 'wsemi/src/pmInvResolve.mjs'


function perm() {
    //供外部系統引用並進行取得權限之操作

    //pmd
    let pmd = null

    //conn
    let conn = (url, opt = {}) => {

        //check
        if (!isestr(url)) {
            throw new Error(`invalid url`)
        }
        if (url.indexOf('token=') === 0) {
            throw new Error(`url does not include 'token='`)
        }
        if (url.indexOf('userId=') === 0) {
            throw new Error(`url does not include 'userId='`)
        }

        //useAsync
        let useAsync = get(opt, 'useAsync')
        if (!isbol(useAsync)) {
            useAsync = false
        }

        //permSuccess
        let permSuccess = get(opt, 'permSuccess')

        //permError
        let permError = get(opt, 'permError')

        //pm
        let pm = null
        if (useAsync) {
            pm = genPm()
        }

        //get
        let pms = axios.get(url)
        pms = pmInvResolve(pms, { thenExtractData: true })
        pms
            .then((res) => {
                // console.log('perm.getPerm then', res)
                pmd = res
                if (isfun(permSuccess)) {
                    permSuccess(pmd)
                }
                if (useAsync) {
                    pm.resolve(kp)
                }
            })
            .catch((err) => {
                // console.log('perm.getPerm catch', err)
                if (isfun(permError)) {
                    permError(err)
                }
                if (useAsync) {
                    pm.reject()
                }
            })

        if (useAsync) {
            return pm
        }
        return kp
    }

    //user
    let user = get(pmd, `user`, {})

    //rules
    let rules = get(pmd, `rules`, [])

    //kpRule
    let kpRule = {}
    each(rules, (v) => {

        //name
        let name = get(v, 'name', '')
        if (!isestr(name)) {
            return true //跳出換下一個
        }

        //isActive
        let _isActive = get(v, 'isActive', '')
        let isActive = _isActive === 'y' ? 'y' : 'n'

        //save
        kpRule[name] = isActive

    })

    //kp
    let kp = {
        conn,
        getUser: () => {
            return user
        },
        getRules: () => {
            return rules
        },
        getKpRule: () => {
            return kpRule
        },
        // rule: (key) => {
        //     return get(kpRule, key, '')
        // },
        active: (key) => {
            let _isActive = get(kpRule, key, '')
            let isActive = _isActive === 'y' ? 'y' : 'n'
            return isActive
        },
    }

    return kp
}


export default perm
