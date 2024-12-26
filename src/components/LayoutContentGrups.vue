<template>
    <div
        style="height:100%;"
        v-domresize
        @domresize="resizePanel"
        :changeGrups="changeGrups"
    >

        <div
            style="border-bottom:1px solid #ddd; background:#fff;"
            v-domresize
            @domresize="resizeHead"
        >

            <!-- 標題區 -->
            <div style="padding:10px 10px 10px 20px;">
                <div :style="`display:flex; align-items:center; padding:${drawer?'5px':'5px 5px 5px 20px'};`">

                    <WIcon
                        :icon="mdiSelectGroup"
                        :color="'#000'"
                        :size="26"
                    ></WIcon>

                    <div style="padding-left:10px; font-size:1.4rem; color:#000;">
                        {{$t('managementGrups')}}
                    </div>

                </div>
            </div>

            <!-- 功能區 -->
            <div style="padding:5px; border-top:1px solid #ddd; display:flex; align-items:center;">

                <template>

                    <WButtonCircle
                        :paddingStyle="{v:6,h:6}"
                        :tooltip="$t('grupAdd')"
                        :icon="mdiPlus"
                        :backgroundColor="'#fff'"
                        :backgroundColorHover="'#f2f2f2'"
                        _textColor="'#eee'"
                        _textColorHover="'#fff'"
                        :iconColor="'#444'"
                        :iconColorHover="'#222'"
                        :shadow="false"
                        @click="addItem"
                    ></WButtonCircle>

                    <div style="padding-left:6px;"></div>

                </template>

                <template v-if="hasItemCheckOne">

                    <WButtonCircle
                        :paddingStyle="{v:6,h:6}"
                        :tooltip="$t('grupCopy')"
                        :icon="mdiContentCopy"
                        :backgroundColor="'#fff'"
                        :backgroundColorHover="'#f2f2f2'"
                        _textColor="'#eee'"
                        _textColorHover="'#fff'"
                        :iconColor="'#444'"
                        :iconColorHover="'#222'"
                        :shadow="false"
                        @click="copyItem"
                    ></WButtonCircle>

                    <div style="padding-left:6px;"></div>

                </template>

                <template v-if="hasItemsCheck">

                    <WButtonCircle
                        :paddingStyle="{v:6,h:6}"
                        :tooltip="$t('grupDeleteCheckGrups')"
                        :icon="mdiTrashCanOutline"
                        :backgroundColor="'#fff'"
                        :backgroundColorHover="'#f2f2f2'"
                        _textColor="'#eee'"
                        _textColorHover="'#fff'"
                        :iconColor="'#444'"
                        :iconColorHover="'#222'"
                        :shadow="false"
                        @click="deleteItemsCheck"
                    ></WButtonCircle>

                    <div style="padding-left:6px;"></div>

                </template>

                <template v-if="isModified">

                    <WButtonCircle
                        :paddingStyle="{v:6,h:6}"
                        :tooltip="$t('saveChanges')"
                        :icon="mdiCloudUploadOutline"
                        :backgroundColor="'rgba(255,0,50,0.7)'"
                        :backgroundColorHover="'rgba(255,0,50,0.8)'"
                        :textColor="'#eee'"
                        :textColorHover="'#fff'"
                        :iconColor="'#eee'"
                        :iconColorHover="'#fff'"
                        :shadow="false"
                        @click="saveGrups"
                    ></WButtonCircle>

                    <div style="padding-left:6px;"></div>

                </template>

            </div>

        </div>

        <template
            v-if="!firstLoading"
        >

            <template v-if="items">
                <WAggridVueDyn
                    ref="rftable"
                    :style="`width:100%;`"
                    :height="contentHeight"
                    :opt="opt"
                >
                </WAggridVueDyn>
            </template>

        </template>

        <div style="padding:10px 15px; font-size:0.8rem;" v-else>
            {{$t('waitingData')}}
        </div>

    </div>
</template>

<script>
import { mdiSelectGroup, mdiVectorPolylinePlus, mdiCheckboxMarkedCircle, mdiCloudUploadOutline, mdiTrashCanOutline, mdiPlus, mdiPencilOutline, mdiContentCopy } from '@mdi/js/mdi.js'
import JSON5 from 'json5'
import get from 'lodash-es/get.js'
import set from 'lodash-es/set.js'
import each from 'lodash-es/each.js'
import map from 'lodash-es/map.js'
import size from 'lodash-es/size.js'
import filter from 'lodash-es/filter.js'
import sortBy from 'lodash-es/sortBy.js'
import cloneDeep from 'lodash-es/cloneDeep.js'
import haskey from 'wsemi/src/haskey.mjs'
import isestr from 'wsemi/src/isestr.mjs'
import iseobj from 'wsemi/src/iseobj.mjs'
import cstr from 'wsemi/src/cstr.mjs'
import WIcon from 'w-component-vue/src/components/WIcon.vue'
import WButtonCircle from 'w-component-vue/src/components/WButtonCircle.vue'
import WAggridVueDyn from 'w-component-vue/src/components/WAggridVueDyn.vue'


export default {
    components: {
        WIcon,
        WButtonCircle,
        WAggridVueDyn,
    },
    props: {
        drawer: {
            type: Boolean,
            default: false,
        },
    },
    data: function() {
        return {
            mdiSelectGroup,
            mdiVectorPolylinePlus,
            mdiCheckboxMarkedCircle,
            mdiCloudUploadOutline,
            mdiTrashCanOutline,
            mdiPlus,
            mdiPencilOutline,
            mdiContentCopy,

            panelWidth: 100,
            panelHeight: 100,
            headHeight: 100,

            firstLoading: true,
            isModified: false,

            items: [],
            itemsCheck: [],
            opt: null,

        }
    },
    mounted: function() {
        // console.log('mounted')

        let vo = this

        //註冊至$dg供使用
        vo.$dg.showVeGrupBlngUsersById = vo.showVeGrupBlngUsersById
        vo.$dg.showVeCpemisById = vo.showVeCpemisById

    },
    computed: {

        targets: function() {
            let rs = get(this, `$store.state.targets`)
            rs = sortBy(rs, 'order')
            return rs
        },

        pemis: function() {
            let rs = get(this, `$store.state.pemis`)
            rs = sortBy(rs, 'order')
            return rs
        },

        grups: function() {
            let rs = get(this, `$store.state.grups`)
            rs = sortBy(rs, 'order')
            return rs
        },

        users: function() {
            let rs = get(this, `$store.state.users`)
            rs = sortBy(rs, 'order')
            return rs
        },

        useUsers: function() {
            let vo = this

            //parse cgrups
            let users = map(vo.users, (u) => {

                //cloneDeep
                u = cloneDeep(u)

                //kpGrup
                let kpGrup = {}
                try {
                    // console.log('u.cgrups', u.cgrups)
                    kpGrup = JSON5.parse(u.cgrups)
                }
                catch (err) {}

                //save kpGrup
                u.kpGrup = kpGrup

                return u
            })
            // console.log('users', users)

            return users
        },

        kpGrupUser: function() {
            let vo = this

            //kp
            let kp = {}
            each(vo.useUsers, (u) => {
                each(u.kpGrup, (v, k) => {
                    let isActive = get(v, 'isActive', '')
                    if (isActive !== 'y') {
                        return true //跳出換下一個
                    }
                    if (!haskey(kp, k)) {
                        kp[k] = []
                    }
                    kp[k].push({
                        user: u,
                        grup: v,
                    })
                })
            })
            // console.log('kp', kp)

            return kp
        },

        kpUseGrupUser: function() {
            let vo = this

            //_kp
            let _kp = {}
            each(vo.grups, (v, k) => {
                _kp[v.name] = true
            })
            // console.log('_kp', _kp)

            //kp
            let kp = {}
            each(vo.kpGrupUser, (v, k) => {
                if (haskey(_kp, k)) {
                    kp[k] = v
                }
            })
            // console.log('kp', kp)

            return kp
        },

        changeGrups: function() {
            // console.log('computed changeGrups')

            let vo = this

            //check
            if (size(vo.grups) === 0) {
                return ''
            }

            //grups, kpUseGrupUser
            let grups = cloneDeep(vo.grups)
            let kpUseGrupUser = cloneDeep(vo.kpUseGrupUser)

            //genItems
            let items = vo.genItems(grups, kpUseGrupUser)

            //save
            vo.items = items

            //genOpt
            vo.genOpt()

            //firstLoading
            vo.firstLoading = false

            return ''
        },

        contentHeight: function() {
            let vo = this

            //h
            let h = vo.panelHeight - vo.headHeight
            h = Math.max(h, 0)

            return h
        },

        hasItemsCheck: function() {
            let vo = this

            //h
            let b = size(vo.itemsCheck) > 0

            return b
        },

        hasItemCheckOne: function() {
            let vo = this

            //h
            let b = size(vo.itemsCheck) === 1

            return b
        },

        errItemsByName: function() {
            let vo = this

            //rows
            let rows = get(vo, 'opt.rows', [])

            //kpErr
            let kpErr = {}
            let kpName = {}
            each(rows, (v, k) => {

                //name
                let name = get(v, 'name', '')

                //check
                if (!isestr(name)) {

                    //kpErr
                    kpErr[name] = vo.$t(`grupNameEmpty`)

                    return true //跳出換下一個
                }

                //check
                if (haskey(kpName, name)) {

                    //kpErr
                    kpErr[name] = vo.$t(`grupNameDuplicate`)

                    return true //跳出換下一個
                }

                //kpName
                kpName[name] = true

            })

            return kpErr
        },

        isError: function() {
            let vo = this

            let c = ''
            let b = false
            b = iseobj(vo.errItemsByName)
            if (b) {
                c = vo.$t('errInNames')
            }

            return c
        },

    },
    methods: {

        resizePanel: function(msg) {
            // console.log('methods resizePanel', msg)

            let vo = this

            //panelWidth, panelHeight
            vo.panelWidth = msg.snew.offsetWidth
            vo.panelHeight = msg.snew.offsetHeight

        },

        resizeHead: function(msg) {
            // console.log('methods resizeHead', msg)

            let vo = this

            //headHeight
            vo.headHeight = msg.snew.offsetHeight

        },

        genOpt: function() {
            // console.log('methods genOpt')

            let vo = this

            //default
            vo.itemsCheck = []

            //opt
            let opt = null
            if (size(vo.items) > 0) {

                //ks
                let ks = [
                    'id',
                    'name',
                    'belongUsers',
                    'description',
                    'from',
                    'cpemis',
                    'userId',
                    'timeCreate',
                    'userIdUpdate',
                    'timeUpdate',
                ]
                // console.log('ks', ks)

                //kpHead
                let kpHead = {
                    'id': vo.$t('id'),
                    'name': vo.$t('name'),
                    'belongUsers': vo.$t('belongUsers'),
                    'description': vo.$t('description'),
                    'from': vo.$t('from'),
                    'cpemis': vo.$t('grupCpemis'),
                    'userId': vo.$t('userId'),
                    'timeCreate': vo.$t('timeCreate'),
                    'userIdUpdate': vo.$t('userIdUpdate'),
                    'timeUpdate': vo.$t('timeUpdate'),
                }

                //opt
                opt = {
                    language: vo.$t('aggridLanguage'),
                    rows: vo.items,
                    keys: ks,
                    kpHead,
                    // autoFitColumn: true,
                    defHeadFilter: true,
                    defCellAlignH: 'left',
                    kpHeadHide: {
                        'id': true,
                    },
                    kpHeadFixLeft: {
                        'name': true,
                    },
                    defHeadMinWidth: 150,
                    kpHeadWidth: {
                        'name': 300,
                        'belongUsers': 300,
                        'cpemis': 300,
                        'timeCreate': 220,
                        'timeUpdate': 220,
                    },
                    kpHeadFilterType: {
                        'id': 'text',
                        'name': 'text',
                        'belongUsers': 'text',
                        'description': 'text',
                        'from': 'text',
                        'cpemis': 'text',
                        'userId': 'text',
                        'timeCreate': 'text',
                        'userIdUpdate': 'text',
                        'timeUpdate': 'text',
                    },
                    kpCellEditable: {
                        'name': true,
                        'description': true,
                        'from': true,
                    },
                    kpRowDrag: {
                        'name': true,
                    },
                    kpHeadCheckBox: {
                        'name': true,
                    },
                    kpHeadFilter: {
                        'belongUsers': false,
                        'cpemis': false,
                    },
                    kpHeadSort: {
                        'belongUsers': false,
                        'cpemis': false,
                    },
                    kpHeadFocusHighlight: { //雖然效果不完全, 但因按鈕與cell有padding可被點擊, 故還是需要開啟
                        'belongUsers': false,
                        'cpemis': false,
                    },
                    kpCellRender: {
                        'name': (v) => {
                            // console.log('kpCellRender name', v)

                            //err
                            let err = get(vo.errItemsByName, v, '')
                            // console.log(v, err)

                            //check
                            if (isestr(err)) {
                                v = `
                                    <span title="${err}">
                                        <span style="color:#F57C00;">${cstr(v)}</span>
                                        <img style="vertical-align:sub; width:16px; height:16px;" src="${vo.$ui.getIcon('warning')}" />
                                    </span>
                                `
                            }

                            return v
                        },
                        'belongUsers': (v, k, r) => {
                            // console.log('kpCellRender belongUsers', v, k, r)

                            //id
                            let id = get(r, 'id', '')
                            // console.log('id', id, k, r)

                            //因kpHeadFocusHighlight設定false時, 仍會於點擊其他可focus的cell, 再點回時依然出現highlight的focus邊框, 故改使用stopPropagation強制吃掉點擊訊息
                            //因stopPropagation只吃掉訊息, 原本focus會處於原本可focus的cell, 再重複點時會於前個focus的cell出現highlight邊框, 故再多使用preventDefault阻止瀏覽器預設行為, 此等同於return false
                            let t = `
                                <div onclick="event.stopPropagation();event.preventDefault();" onmousedown="event.stopPropagation();event.preventDefault();">
                                    <button style="width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" onclick="$vo.$dg.showVeGrupBlngUsersById('${id}')">${v}</button>
                                </div>
                            `

                            return t
                        },
                        'cpemis': (v, k, r) => {
                            // console.log('kpCellRender cpemis', v, k, r)

                            //id
                            let id = get(r, 'id', '')
                            // console.log('id', id, k, r)

                            //因kpHeadFocusHighlight設定false時, 仍會於點擊其他可focus的cell, 再點回時依然出現highlight的focus邊框, 故改使用stopPropagation強制吃掉點擊訊息
                            //因stopPropagation只吃掉訊息, 原本focus會處於原本可focus的cell, 再重複點時會於前個focus的cell出現highlight邊框, 故再多使用preventDefault阻止瀏覽器預設行為, 此等同於return false
                            let t = `
                                <div onclick="event.stopPropagation();event.preventDefault();" onmousedown="event.stopPropagation();event.preventDefault();">
                                    <button style="width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" onclick="$vo.$dg.showVeCpemisById('${id}')">${vo.getCpemisText(v)}</button>
                                </div>
                            `

                            return t
                        },
                    },
                    rowsChange: (rs) => {
                        // console.log('rowsChange', rs)
                        // console.log('rowsChange cloneDeep(vo.opt.rows)', cloneDeep(vo.opt.rows))

                        //isModified
                        vo.isModified = true

                    },
                    rowChecked: (rs) => {
                        // console.log('rowChecked', rs)
                        // console.log('rowChecked cloneDeep(vo.opt.rows)', cloneDeep(vo.opt.rows))

                        //save itemsCheck
                        vo.itemsCheck = cloneDeep(rs)

                    },
                }
                // console.log('opt', opt)

            }

            //save
            vo.opt = opt

        },

        refresh: function() {
            let vo = this

            //cmp
            let cmp = get(vo, '$refs.rftable.$refs.$self')
            // console.log('cmp', cmp)

            //refresh, 因set不會觸發kpCellRender, 故須另外調用組件函數refresh, 進而觸發kpCellRender, 使能更新數據
            cmp.refresh()

        },

        genItems: function(grups, kpUseGrupUser) {
            // console.log('method genItems', grups, kpUseGrupUser)

            let vo = this

            //items
            let items = map(grups, (g) => {

                //us
                let us = []
                if (haskey(kpUseGrupUser, g.name)) {
                    us = kpUseGrupUser[g.name]
                }
                // console.log('us', us)

                //belongUsers
                let belongUsers = vo.$t('grupBlngRnderNoUser')
                let t = vo.$t('grupBlngRnderUsers')
                let n = size(us)
                if (n > 0) {
                    t = t.replace('{n}', n)
                    if (n === 1) {
                        t = t.replace('{nms}', `(${us[0].user.name})`)
                    }
                    else {
                        t = t.replace('{nms}', '')
                    }
                    belongUsers = t
                }

                //save belongUsers, us
                g.belongUsers = belongUsers
                g.us = us
                // console.log('g', g)

                return g
            })
            // console.log('items', items)

            return items
        },

        addItem: function() {
            // console.log('method addItem')

            let vo = this

            //cloneDeep
            let rows = get(vo, 'opt.rows', [])

            //cloneDeep
            rows = cloneDeep(rows)

            //r
            let r = vo.$ds.grups.funNew()
            r.name = vo.$s.getNameNew(rows, 'name', '', vo.$t('grupAddNameNew'))
            r.userId = `{${vo.$t('grupAddIdNew')}}`
            r.timeCreate = `{${vo.$t('grupAddIdNew')}}`
            r.userIdUpdate = `{${vo.$t('grupAddIdNew')}}`
            r.timeUpdate = `{${vo.$t('grupAddIdNew')}}`
            // console.log('r', r)

            //belongUsers, us
            let us = []
            let belongUsers = vo.$t('grupBlngRnderNoUser')

            //save belongUsers, us
            r.belongUsers = belongUsers
            r.us = us
            // console.log('r', r)

            //添加至最首
            rows = [
                r,
                ...rows,
            ]

            //save
            vo.opt.rows = rows
            // console.log('cloneDeep(vo.opt.rows)', cloneDeep(vo.opt.rows))

            //isModified
            vo.isModified = true

        },

        copyItem: function() {
            // console.log('method copyItem')

            let vo = this

            //check
            if (size(vo.itemsCheck) !== 1) {
                console.log(`size(vo.itemsCheck) !== 1`, vo.itemsCheck)
                vo.$alert(`${vo.$t('anUnexpectedErrorOccurred')}`, { type: 'error' })
                return
            }

            //cloneDeep
            let rows = get(vo, 'opt.rows', [])

            //cloneDeep
            rows = cloneDeep(rows)

            //find
            let tar = vo.itemsCheck[0]
            let tarId = get(tar, 'data.id', '')
            let row = null
            each(rows, (v) => {
                let id = get(v, 'id', '')
                if (id === tarId) {
                    row = v
                    return false //跳出
                }
            })
            // console.log('tar', tar)
            // console.log('row', row)

            //check
            if (!iseobj(row)) {
                console.log(`!iseobj(row)`, row)
                vo.$alert(`${vo.$t('anUnexpectedErrorOccurred')}`, { type: 'error' })
                return
            }

            //r
            let r = cloneDeep(row)
            let nameOld = r.name
            let _r = vo.$ds.grups.funNew()
            r.id = _r.id //使用新建方式預先產生id避免重複
            r.name = vo.$s.getNameNew(rows, 'name', nameOld, vo.$t('grupCopyNameNew'))
            r.userId = `{${vo.$t('grupAddIdNew')}}`
            r.timeCreate = `{${vo.$t('grupAddIdNew')}}`
            r.userIdUpdate = `{${vo.$t('grupAddIdNew')}}`
            r.timeUpdate = `{${vo.$t('grupAddIdNew')}}`
            // console.log('r', r)

            //belongUsers, us
            let us = []
            let belongUsers = vo.$t('grupBlngRnderNoUser')

            //save belongUsers, us
            r.belongUsers = belongUsers
            r.us = us
            // console.log('r', r)

            //添加至最首
            rows = [
                r,
                ...rows,
            ]

            //save
            vo.opt.rows = rows
            // console.log('cloneDeep(vo.opt.rows)', cloneDeep(vo.opt.rows))

            //isModified
            vo.isModified = true

        },

        deleteItemsCheck: function() {
            // console.log('method deleteItemsCheck')

            let vo = this

            //check
            if (size(vo.itemsCheck) === 0) {
                console.log(`size(vo.itemsCheck) === 0`, vo.itemsCheck)
                vo.$alert(`${vo.$t('anUnexpectedErrorOccurred')}`, { type: 'error' })
                return
            }

            //cloneDeep
            let rows = get(vo, 'opt.rows', [])

            //cloneDeep
            rows = cloneDeep(rows)

            //filter
            each(vo.itemsCheck, (v) => {
                // console.log('v', v)
                let id = get(v, 'data.id', '')
                if (!isestr(id)) {
                    console.log(`invalid id`)
                    return true //跳出換下一個
                }
                rows = filter(rows, (vv) => {
                    return vv.id !== id
                })
            })

            //clear
            vo.itemsCheck = []

            //save
            vo.opt.rows = rows
            // console.log('deleteItemsCheck cloneDeep(vo.opt.rows)', cloneDeep(vo.opt.rows))

            //isModified
            vo.isModified = true

        },

        fltKpPemi: function(kp) {
            // console.log('fltKpPemi', kp)

            let vo = this

            //_kp
            let _kp = {}
            each(vo.pemis, (v, k) => {
                _kp[v.name] = true
            })
            // console.log('_kp', _kp)

            //kpt
            let kpt = {}
            each(kp, (v, k) => {
                if (haskey(_kp, k)) {
                    kpt[k] = v
                }
            })

            return kpt
        },

        getCpemisText: function(cpemis) {
            // console.log('method getCpemisText', cpemis)

            let vo = this

            //kpPemi
            let kpPemi = {}
            try {
                // console.log('cpemis', cpemis)
                kpPemi = JSON5.parse(cpemis)
            }
            catch (err) {}
            // console.log('kpPemi', kpPemi)

            //fltKpPemi
            kpPemi = vo.fltKpPemi(kpPemi)
            // console.log('kpPemi(fltKpPemi)', kpPemi)

            //vs
            let vs = []
            each(kpPemi, (v, k) => {
                // console.log(k, 'v', v)

                //isActive
                let isActive = get(v, 'isActive', '')
                if (isActive !== 'y') {
                    return true //跳出換下一個
                }
                // console.log(k, '_isActive', _isActive)

                //push
                vs.push(k)

            })

            //cpemisText
            let cpemisText = vo.$t('grupRnderCpemisNoPermission')
            let t = vo.$t('grupRnderCpemisHasNPermissions')
            let n = size(vs)
            if (n > 0) {
                t = t.replace('{n}', n)
                if (n === 1) {
                    t = t.replace('{nms}', `(${vs[0]})`)
                }
                else {
                    t = t.replace('{nms}', '')
                }
                cpemisText = t
            }

            return cpemisText
        },

        showVeGrupBlngUsersById: function(id) {
            // console.log('method showVeGrupBlngUsersById', id)

            let vo = this

            //check
            if (!isestr(id)) {
                vo.$alert(`${vo.$t('grupEditBlngNoGrupId')}`, { type: 'error' })
                return
            }

            //rows
            let rows = get(vo, 'opt.rows', [])

            //find
            let r = null
            // let kr = null
            each(rows, (v, k) => {
                if (get(v, 'id', '') === id) {
                    r = v
                    // kr = k
                    return false //跳出
                }
            })
            // console.log('r', r)

            //check
            if (!iseobj(r)) {
                vo.$alert(`${vo.$t('grupEditBlngNoGrupData')}`, { type: 'error' })
                return
            }

            //showVeGrupBlngUsers
            vo.$dg.showVeGrupBlngUsers(r)
                .then(() => {})
                .catch(() => {})

        },

        showVeCpemisById: function(id) {
            // console.log('method showVeCpemisById', id)

            let vo = this

            //check
            if (!isestr(id)) {
                vo.$alert(`${vo.$t('grupEditBlngNoGrupId')}`, { type: 'error' })
                return
            }

            //rows
            let rows = get(vo, 'opt.rows', [])

            //find
            let r = null
            let kr = null
            each(rows, (v, k) => {
                if (get(v, 'id', '') === id) {
                    r = v
                    kr = k
                    return false //跳出
                }
            })

            //check
            if (!iseobj(r)) {
                vo.$alert(`${vo.$t('grupEditBlngNoGrupData')}`, { type: 'error' })
                return
            }

            //showVeCpemis
            vo.$dg.showVeCpemis(r)
                .then((cpemis) => {
                    // console.log('cpemis', cpemis)

                    //set
                    set(vo, `opt.rows[${kr}].cpemis`, cpemis)
                    // console.log('vo.opt.rows[kr]', cloneDeep(vo.opt.rows[kr]))

                    //refresh
                    vo.refresh()

                    //isModified
                    vo.isModified = true

                })
                .catch(() => {})

        },

        saveGrups: function() {
            // console.log('method saveGrups')

            let vo = this

            async function core() {
                let errTemp = null

                //show loading
                vo.$ui.updateLoading(true)

                //check
                if (isestr(vo.isError)) {
                    vo.$alert(`${vo.isError}`, { type: 'error' })
                    return
                }

                //rows
                let rows = get(vo, 'opt.rows', [])

                //check
                if (size(rows) === 0) {
                    vo.$alert(`${vo.$t('grupAddEmpty')}`, { type: 'error' })
                    return
                }

                //updateGrups
                await vo.$fapi.updateGrups(rows)
                    .catch((err) => {
                        errTemp = err
                    })

                //check
                if (errTemp !== null) {
                    vo.$alert(`${vo.$t('grupSaveGrupsFail')}: ${errTemp}`, { type: 'error' })
                    return
                }

                //isModified
                vo.isModified = false

                //alert
                vo.$alert(vo.$t('grupSaveGrupsSuccess'))

            }

            //core
            core()
                // .then((res) => {
                //     console.log('then', res)
                // })
                .catch((err) => {
                    console.log('catch', err)
                    vo.$alert(vo.$t('anUnexpectedErrorOccurred'), { type: 'error' })
                })
                .finally(() => {

                    //hide loading
                    vo.$ui.updateLoading(false)

                })

        },

    }
}
</script>

<style scoped>
</style>
