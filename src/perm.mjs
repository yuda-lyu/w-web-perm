import axios from 'axios'
import get from 'lodash-es/get.js'
import each from 'lodash-es/each.js'
import isestr from 'wsemi/src/isestr.mjs'
import isfun from 'wsemi/src/isfun.mjs'
import genPm from 'wsemi/src/genPm.mjs'
import pmInvResolve from 'wsemi/src/pmInvResolve.mjs'


function perm() {
    //供外部系統引用並進行取得權限之操作

    //pmd
    let pmd = null
    let _user = {}
    let _rules = []
    let _kpRule = {}

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

        //permSuccess
        let permSuccess = get(opt, 'permSuccess')

        //permError
        let permError = get(opt, 'permError')

        //pm
        let pm = genPm()

        //get
        let pms = axios.get(url)
        pms = pmInvResolve(pms, { thenExtractData: true })
        pms
            .then((res) => {
                // console.log('perm.getPerm then', res)
                pmd = res
                genUser()
                genRules()
                genKpRule()
                if (isfun(permSuccess)) {
                    permSuccess(pmd)
                }
                pm.resolve(pmd)
            })
            .catch((err) => {
                // console.log('perm.getPerm catch', err)
                if (isfun(permError)) {
                    permError(err)
                }
                pm.reject(err)
            })

        return pm
    }

    let isInit = () => {
        return pmd !== null
    }

    let genUser = () => {
        _user = get(pmd, `user`, {})
    }

    let genRules = () => {
        _rules = get(pmd, `rules`, [])
    }

    let genKpRule = () => {
        let kpRule = {}
        each(_rules, (v) => {

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
        _kpRule = kpRule
    }

    //kp
    let kp = {
        conn,
        isInit,
        getUser: () => {
            return _user
        },
        getRules: () => {
            return _rules
        },
        getKpRule: () => {
            return _kpRule
        },
        // rule: (key) => {
        //     return get(_kpRule, key, '')
        // },
        active: (key) => {
            let _isActive = get(_kpRule, key, '')
            let isActive = _isActive === 'y' ? 'y' : 'n'
            return isActive
        },
    }

    return kp
}


export default perm
