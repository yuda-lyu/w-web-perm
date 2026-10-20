import get from 'lodash-es/get.js'
import each from 'lodash-es/each.js'
import isestr from 'wsemi/src/isestr.mjs'
import isfun from 'wsemi/src/isfun.mjs'
import genPm from 'wsemi/src/genPm.mjs'
import pmInvResolve from 'wsemi/src/pmInvResolve.mjs'
import fetchJson from './fetchJson.mjs'
import getOwn from './js/getOwn.mjs'


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
        if (url.indexOf('token=') < 0) {
            throw new Error(`url does not include 'token='`)
        }
        //註: conn() 為通用連線, getPerm 之 url 僅含 token=、getPermUserInfor 才含 userId=,
        //故此處不強制 userId=（端點專屬之 userId 驗證由後端對應 handler 負責）。

        //permSuccess
        let permSuccess = get(opt, 'permSuccess')

        //permError
        let permError = get(opt, 'permError')

        //pm
        let pm = genPm()

        //get, 內建 fetch(不依賴 axios): fetchJson 直接 resolve JSON envelope, 故 pmInvResolve 不再需 thenExtractData(原為取 axios res.data)
        //失敗時 permError / reject 收到 { kind: 'request'|'parse', status, message }(原為 AxiosError), 或後端 envelope 之 msg
        let pms = fetchJson(url)
        pms = pmInvResolve(pms)
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

            //save, 以 defineProperty 設為自有屬性: 規則名為使用者資料, 一般物件以 kpRule['__proto__'] = 'y' 指派時字串被忽略而無法授權(規則帳本 R-AUTH-PATH-01);
            //_kpRule 維持一般物件, 使 getKpRule() 對外型別不變(外部應用可能呼叫其 hasOwnProperty 等方法)
            Object.defineProperty(kpRule, name, { value: isActive, enumerable: true, writable: true, configurable: true })

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
            //key 為標的名稱(資料): 自有屬性查值, 不解析路徑、不取繼承屬性(lodash get 會使只授權 A 時 'A.0'、'A[0]' 得 y)
            let _isActive = getOwn(_kpRule, key, '')
            let isActive = _isActive === 'y' ? 'y' : 'n'
            return isActive
        },
    }

    return kp
}


export default perm
