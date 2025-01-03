import Vue from 'vue'
import min from 'lodash-es/min.js'
import size from 'lodash-es/size.js'
import take from 'lodash-es/take.js'
import isEqual from 'lodash-es/isEqual.js'
import uniq from 'lodash-es/uniq.js'
import set from 'lodash-es/set.js'
import get from 'lodash-es/get.js'
import each from 'lodash-es/each.js'
import map from 'lodash-es/map.js'
import filter from 'lodash-es/filter.js'
import last from 'lodash-es/last.js'
import split from 'lodash-es/split.js'
import join from 'lodash-es/join.js'
import drop from 'lodash-es/drop.js'
import dropRight from 'lodash-es/dropRight.js'
import groupBy from 'lodash-es/groupBy.js'
import sortBy from 'lodash-es/sortBy.js'
import cloneDeep from 'lodash-es/cloneDeep.js'
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
    let t = get(kpText, key, '')
    if (!isestr(t)) {
        t = key
    }
    return t
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


let kpIcon = {
    warning: `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACQAAAAhCAYAAACxzQkrAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAOwwAADsMBx2+oZAAAABZ0RVh0Q3JlYXRpb24gVGltZQAwOS8xOS8yNP52YhIAAAAcdEVYdFNvZnR3YXJlAEFkb2JlIEZpcmV3b3JrcyBDUzbovLKMAAADMklEQVRYha2WTWgTQRiGn0k2SU2KNQjmoiL+gGAVD/5gEelAkSKOiILei+hBRAQv/tBDsQiK1CJFDz331tNePAjRm60eBL0pXsSDF+dimmzbZDzsRJNmm+xPXliyOzP7zrNfvpn5hDGGJNJSHQJmAQHcLpbdL0n8RBIgLdVhYBHYb5u+AZeLZfdzXM9UbBpfC8AB/OgIe7+QxDA2kJZqAhgO6Bq2fbEU6y/TUuWB70BpkyG/gL3FsrsS1TtuhO53gcH23Y9jHDlCWqqd+Mmb6zHUA/YVy+7PKP5xIvQkBAx2zNOo5pEipKU6Bnzo6Kg3/N904PcdL5bdj2HniBqh2bYnITDVGmQcyDj+vRDd3+kXkJbqEjDS2mYqK2THTjO0MMfQwhzZsdOYSsfCGrHv9g9IS+UAz9oajUFkHPITV0mVSqRKJfITVxAZBzrT4Jn16A8QcBvY0w4EZDL+/mw8/xIpv60zLfdYj+RAWqrtwGRgpzHQaJm90QiKTlOT1isZEPAI2BpiXC9ttV5d1RVIS3UQuN4HmKZuWM94QMBMiDFRJKznptp0Mi3VGDDeR5imxq13eCB95iz0+JKEmtFj58IDkc5dI7jWaZcQ7cdFOhW0UwdpmHr6WiggLVUBmO4NA6bmYSpVEIMgBjGVKqbm+ZnSW9N2ru5AwANgR28gf9bKzDxry+9ZW35PZWa+ra+Hdti52m1bT3st1S7gK+HKi/+Ha73uP6fTiC0D3TbHjfKAA8Wy+6PZsDFCT0PDAGAQ2Qys12G97t8HnBtd1FEz/YuQluoEsBTFjXoDnDQ5u4o9940PF1wXddPJYtldBmg9gZ9HdTG1GoMPb5G9cBEAZ+9u/ky/QBTyUa2eY0ubFICWSgGnotEYxEAO59gRoAJUcI4fQQzkouRQU6csAykt1TZgKqqDn9Aeq6/fAQWgwOrrt5iqF3aVbdSUlmpI/B49vwiErujaZAxmbZ3syaMArC598gu0eEAAi+L36PkakVZWANRKFQCR35IEBqCaAl4mcUAIRCHvJ3IyGIBXjhHcEYYGcJMkkUomD5gziLut+9Bj4DKQJeLulkACWAUWi2X3HsBfLU4ARuGaUEMAAAAASUVORK5CYII=`,
}
function getIcon(icon) {
    let c = get(kpIcon, icon, '')
    if (!isestr(c)) {
        console.log(`invalid icon[${icon}]`)
    }
    return c
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

    getIcon,

}


export default mUI
