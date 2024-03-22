import axios from 'axios'
import get from 'lodash-es/get'
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

    //kp
    let kp = {
        conn,
        getUser: () => {
            let u = get(pmd, `user`, {})
            // console.log('u', u)
            return u
        },
        getRules: () => {
            return get(pmd, `rules`, {})
        },
        rule: (key) => {
            return get(pmd, `rules.${key}`, {})
        },
        show: (key) => {
            return get(pmd, `rules.${key}.show`, 'n')
        },
        active: (key) => {
            return get(pmd, `rules.${key}.active`, 'n')
        },
    }

    return kp
}


export default perm
