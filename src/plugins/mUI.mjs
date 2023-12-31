import Vue from 'vue'
import min from 'lodash/min'
import size from 'lodash/size'
import take from 'lodash/take'
import isEqual from 'lodash/isEqual'
import uniq from 'lodash/uniq'
import set from 'lodash/set'
import get from 'lodash/get'
import each from 'lodash/each'
import map from 'lodash/map'
import filter from 'lodash/filter'
import last from 'lodash/last'
import split from 'lodash/split'
import join from 'lodash/join'
import drop from 'lodash/drop'
import dropRight from 'lodash/dropRight'
import groupBy from 'lodash/groupBy'
import sortBy from 'lodash/sortBy'
import cloneDeep from 'lodash/cloneDeep'
import cint from 'wsemi/src/cint.mjs'
import delay from 'wsemi/src/delay.mjs'
import isarr from 'wsemi/src/isarr.mjs'
import isestr from 'wsemi/src/isestr.mjs'
import isfun from 'wsemi/src/isfun.mjs'
import iseobj from 'wsemi/src/iseobj.mjs'
import isearr from 'wsemi/src/isearr.mjs'
import isEle from 'wsemi/src/isEle.mjs'
import strleft from 'wsemi/src/strleft.mjs'
import strdelleft from 'wsemi/src/strdelleft.mjs'
import sep from 'wsemi/src/sep.mjs'
import aes2str from 'wsemi/src/aes2str.mjs'
import str2aes from 'wsemi/src/str2aes.mjs'
import haskey from 'wsemi/src/haskey.mjs'
import genPm from 'wsemi/src/genPm.mjs'
import pmSeries from 'wsemi/src/pmSeries.mjs'
import waitFun from 'wsemi/src/waitFun.mjs'
import browserView from 'wsemi/src/browserView.mjs'
import arrHas from 'wsemi/src/arrHas.mjs'
import arrSort from 'wsemi/src/arrSort.mjs'
import arrInsert from 'wsemi/src/arrInsert.mjs'
import replace from 'wsemi/src/replace.mjs'
import timemsTZ2past from 'wsemi/src/timemsTZ2past.mjs'
import convertToTree from 'wsemi/src/convertToTree.mjs'
// import WUiDwload from 'w-ui-dwload/src/WUiDwload.mjs'


let vo = Vue.prototype


function setVo(vObj) {
    vo = vObj
}


function updateConnState(connState) {
    vo.$store.commit(vo.$store.types.UpdateConnState, connState)
}


function updateLoading(loading) {
    vo.$store.commit(vo.$store.types.UpdateLoading, loading)
}


function updateViewState(viewState) {
    vo.$store.commit(vo.$store.types.UpdateViewState, viewState)
}


function updateUserToken(userToken) {
    vo.$store.commit(vo.$store.types.UpdateUserToken, userToken)
}


function updateUserSelf(userSelf) {
    vo.$store.commit(vo.$store.types.UpdateUserSelf, userSelf)
}


function forceUpdate() {
    // console.log('call forceUpdate')

    function broadcast(chs) {
        each(chs, (v) => {
            // console.log(v.$el)
            v.$forceUpdate()
            if (v.$children) {
                broadcast(v.$children)
            }
        })
    }

    //broadcast, 注意此處需使用更換ui內vo為mounted後的vo, 也就是含元素, 才能使用廣播技術
    broadcast(vo.$children)

}


function setLang(lang = null) {
    // console.log('call setLang')

    //check lang, 若有輸入才commit
    if (isestr(lang)) {
        vo.$store.commit(vo.$store.types.UpdateLang, lang)
    }

    //getKpLang, 切換lang得調用getKpLang重算kpText
    getKpLang()

    //forceUpdate
    forceUpdate()

}


function getKpLang() {
    // console.log('call getKpLang')

    //merge keyLangs
    let keyLangs = get(vo, '$store.state.keyLangs')
    let webName = get(vo, '$store.state.webInfor.webName')
    let webDescription = get(vo, '$store.state.webInfor.webDescription')
    let kls = {
        ...keyLangs,
        webName: {
            ...webName,
        },
        webDescription: {
            ...webDescription,
        },
    }

    //lang
    let lang = get(vo, '$store.state.lang')

    //kpText
    let kpText = {}
    each(kls, (v, k) => {
        kpText[k] = v[lang]
    })

    //commit
    vo.$store.commit(vo.$store.types.UpdateKpText, kpText)

    return kpText
}


function getKpText(key) {
    // console.log('call getKpText')
    let kpText = get(vo, '$store.state.kpText')
    return get(kpText, key, '')
}


function gv(o, k, cv = null) {
    let r = get(o, k, '')
    if (!isestr(r)) {
        let def = getKpText('empty')
        return def
    }
    if (isfun(cv)) {
        r = cv(r)
    }
    return r
}


function syncHeight() {

    //heightToolbar
    let heightToolbar = get(vo, '$store.state.heightToolbar')

    //heightAppEff
    let heightAppEff = window.innerHeight - heightToolbar

    //commit
    // vo.$store.commit(vo.$store.types.UpdateHeightToolbar, heightToolbar)
    vo.$store.commit(vo.$store.types.UpdateHeightApp, window.innerHeight)
    vo.$store.commit(vo.$store.types.UpdateHeightAppEff, heightAppEff)

    return ''
}


async function waitData(t = 0) {

    //delay
    if (t > 0) {
        await delay(t)
    }

    //waitFun, 等待dsrl模組掛載
    await waitFun(() => {
        return iseobj(get(vo, '$dsrl'))
    })

    //等待前端第一次同步完畢數據
    await waitFun(() => {
        return get(vo, '$store.state.syncState')
    })

}


let mUI = {

    setVo,

    updateConnState,
    updateLoading,
    updateViewState,
    updateUserToken,
    updateUserSelf,
    forceUpdate,

    setLang,
    getKpLang,
    getKpText,

    gv,
    syncHeight,

    waitData,

}


export default mUI
