<template>
    <div
        style="height:100%;"
        v-domresize
        @domresize="resizePanel"
        :changeParams="changeParams"
    >

        <div
            style="_border-bottom:1px solid #ddd; background:#fff;"
            v-domresize
            @domresize="resizeHead"
        >

            <!-- 標題區 -->
            <div style="padding:10px 10px 10px 20px;">
                <div :style="`display:flex; align-items:center; padding:${drawer?'5px':'5px 5px 5px 20px'};`">

                    <WIcon
                        :icon="mdiStackOverflow"
                        :color="'#000'"
                        :size="32"
                    ></WIcon>

                    <div style="padding-left:12px;">

                        <div style="font-size:1.4rem; color:#000;">
                            {{$t('managementPemis')}}
                        </div>

                        <div style="padding-top:2px; font-size:0.8rem; color:#666;">
                            {{$t('managementPemisMsg')}}
                        </div>

                    </div>

                </div>
            </div>

            <!-- 功能區 -->
            <div
                style="padding:5px; border-top:1px solid #ddd; display:flex; align-items:center;"
                _v-if="showIsEditable || isEditable"
            >

                <template v-if="showIsEditable">

                    <div style="padding:6px 0px 4px 4px;">
                        <WSwitch
                            v-model="isEditable"
                            :text="$t('modeEdit')"
                        ></WSwitch>
                    </div>

                    <div style="padding-left:10px;"></div>

                </template>

                <template v-if="true">

                    <WPopup
                        :isolated="true"
                        _show=""
                        _hide=""
                    >
                        <template v-slot:trigger>
                            <WButtonCircle
                                :paddingStyle="{v:6,h:6}"
                                :tooltip="$t('showTabCols')"
                                :icon="mdiTableHeadersEye"
                                :backgroundColor="'#fff'"
                                :backgroundColorHover="'#f2f2f2'"
                                _textColor="'#eee'"
                                _textColorHover="'#fff'"
                                :iconColor="'#444'"
                                :iconColorHover="'#222'"
                                :shadow="false"
                                _click=""
                            ></WButtonCircle>
                        </template>

                        <template v-slot:content>
                            <div style="padding:10px 0px 10px 0px;">

                                <div style="padding:7px 10px; font-size:0.85rem; color:#222; background:#f2f2f2;">
                                    {{$t('showTabCols')}}
                                </div>

                                <div style="padding:7px 9px 0px 7px;">
                                    <WInputCheckbox
                                        :items="tabKeysPick"
                                        v-model="tabKeysShow"
                                        @input="toggleTabKeys"
                                    >
                                        <template v-slot="props">
                                            <div style="padding-left:3px; display:flex; align-items:center; font-size:0.85rem; height:24px; cursor:pointer;">
                                                {{getHead(props.item.data)}}
                                            </div>
                                        </template>
                                    </WInputCheckbox>
                                </div>

                            </div>
                        </template>
                    </WPopup>

                    <div style="padding-left:4px;"></div>

                </template>

                <template v-if="isEditable">

                    <WButtonCircle
                        :paddingStyle="{v:6,h:6}"
                        :tooltip="$t('pemiAdd')"
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

                    <div style="padding-left:4px;"></div>

                </template>

                <template v-if="isEditable && hasItemCheckOne">

                    <WButtonCircle
                        :paddingStyle="{v:6,h:6}"
                        :tooltip="$t('pemiCopy')"
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

                    <div style="padding-left:4px;"></div>

                </template>

                <template v-if="isEditable && hasItemsCheck">

                    <WButtonCircle
                        :paddingStyle="{v:6,h:6}"
                        :tooltip="$t('pemiDeleteCheckPemis')"
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

                    <div style="padding-left:4px;"></div>

                </template>

                <template v-if="isEditable && isModified">

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
                        @click="savePemis"
                    ></WButtonCircle>

                    <div style="padding-left:4px;"></div>

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
import { mdiStackOverflow, mdiVectorPolylinePlus, mdiCheckboxMarkedCircle, mdiCloudUploadOutline, mdiTrashCanOutline, mdiTableHeadersEye, mdiPlus, mdiPencilOutline, mdiContentCopy } from '@mdi/js/mdi.js'
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
import isnum from 'wsemi/src/isnum.mjs'
import cdbl from 'wsemi/src/cdbl.mjs'
import cstr from 'wsemi/src/cstr.mjs'
import arrPull from 'wsemi/src/arrPull.mjs'
import WIcon from 'w-component-vue/src/components/WIcon.vue'
import WSwitch from 'w-component-vue/src/components/WSwitch.vue'
import WButtonCircle from 'w-component-vue/src/components/WButtonCircle.vue'
import WPopup from 'w-component-vue/src/components/WPopup.vue'
import WInputCheckbox from 'w-component-vue/src/components/WInputCheckbox.vue'
import WAggridVueDyn from 'w-component-vue/src/components/WAggridVueDyn.vue'


export default {
    components: {
        WIcon,
        WSwitch,
        WButtonCircle,
        WPopup,
        WInputCheckbox,
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
            mdiStackOverflow,
            mdiVectorPolylinePlus,
            mdiCheckboxMarkedCircle,
            mdiCloudUploadOutline,
            mdiTrashCanOutline,
            mdiTableHeadersEye,
            mdiPlus,
            mdiPencilOutline,
            mdiContentCopy,

            panelWidth: 100,
            panelHeight: 100,
            headHeight: 100,

            firstLoading: true,
            firstSetting: true,
            showIsEditable: false,
            isEditable: false,
            isModified: false,

            tabKeys: [
                'id',
                'name',
                'description',
                'from',
                'belongGrups',
                'crules',
                'userId',
                'timeCreate',
                'userIdUpdate',
                'timeUpdate',
            ],
            tabKeysPick: [
                'name',
                'description',
                'from',
                'belongGrups',
                'crules',
                'userId',
                'timeCreate',
                'userIdUpdate',
                'timeUpdate',
            ],
            tabKeysShow: [
                'name',
                'description',
                // 'from',
                'belongGrups',
                'crules',
                // 'userId',
                // 'timeCreate',
                // 'userIdUpdate',
                // 'timeUpdate',
            ],

            widthPemisName: null,
            widthPemisDescription: null,

            items: [],
            itemsCheck: [],
            opt: null,

        }
    },
    mounted: function() {
        // console.log('mounted')

        let vo = this

        //註冊至$dg供使用
        vo.$dg.showVePemiBlngGrupsById = vo.showVePemiBlngGrupsById
        vo.$dg.showVeCrulesById = vo.showVeCrulesById

        //firstSetting
        if (vo.firstSetting) {
            // console.log('webInfor', vo.webInfor)

            let showModeEditPemis = get(vo, 'webInfor.showModeEditPemis', '')
            vo.showIsEditable = showModeEditPemis === 'y'
            let modeEditPemis = get(vo, 'webInfor.modeEditPemis', '')
            vo.isEditable = modeEditPemis === 'y'

            vo.widthPemisName = get(vo, 'webInfor.widthPemisName', '')
            vo.widthPemisDescription = get(vo, 'webInfor.widthPemisDescription', '')

            vo.firstSetting = false
        }

    },
    computed: {

        webInfor: function() {
            let wi = get(this, `$store.state.webInfor`)
            return wi
        },

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

        useGrups: function() {
            let vo = this

            //parse cpemis
            let grups = map(vo.grups, (g) => {

                //cloneDeep
                g = cloneDeep(g)

                //kpPemi
                let kpPemi = {}
                try {
                    // console.log('g.cpemis', g.cpemis)
                    kpPemi = JSON5.parse(g.cpemis)
                }
                catch (err) {}

                //save kpPemi
                g.kpPemi = kpPemi

                return g
            })
            // console.log('grups', grups)

            return grups
        },

        kpPemiGrup: function() {
            let vo = this

            //kp
            let kp = {}
            each(vo.useGrups, (g) => {
                each(g.kpPemi, (v, k) => {
                    let isActive = get(v, 'isActive', '')
                    if (isActive !== 'y') {
                        return true //跳出換下一個
                    }
                    if (!haskey(kp, k)) {
                        kp[k] = []
                    }
                    kp[k].push({
                        grup: g,
                        pemi: v,
                    })
                })
            })
            // console.log('kp', kp)

            return kp
        },

        kpUsePemiGrup: function() {
            let vo = this

            //_kp
            let _kp = {}
            each(vo.pemis, (v, k) => {
                _kp[v.name] = true
            })
            // console.log('_kp', _kp)

            //kp
            let kp = {}
            each(vo.kpPemiGrup, (v, k) => {
                if (haskey(_kp, k)) {
                    kp[k] = v
                }
            })
            // console.log('kp', kp)

            return kp
        },

        changeParams: function() {
            // console.log('computed changeParams')

            let vo = this

            //trigger
            let isEditable = vo.isEditable
            let pemis = cloneDeep(vo.pemis)
            let kpUsePemiGrup = cloneDeep(vo.kpUsePemiGrup)

            //items
            let items = vo.genItems(pemis, kpUsePemiGrup)

            //save
            vo.items = items

            //genOpt
            vo.genOpt({ isEditable })

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
                    kpErr[name] = vo.$t(`pemiNameEmpty`)

                    return true //跳出換下一個
                }

                //check
                if (haskey(kpName, name)) {

                    //kpErr
                    kpErr[name] = vo.$t(`pemiNameDuplicate`)

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

        kpHead: function() {
            let vo = this

            let kp = {
                'id': vo.$t('id'),
                'name': vo.$t('name'),
                'description': vo.$t('description'),
                'from': vo.$t('from'),
                'belongGrups': vo.$t('belongGrups'),
                'crules': vo.$t('pemiCrules'),
                'userId': vo.$t('userId'),
                'timeCreate': vo.$t('timeCreate'),
                'userIdUpdate': vo.$t('userIdUpdate'),
                'timeUpdate': vo.$t('timeUpdate'),
            }

            return kp
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

        getHead: function(key) {
            // console.log('methods getHead', key)

            let vo = this

            let head = get(vo, `kpHead.${key}`, '')

            return head
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
                let ks = vo.tabKeys
                // console.log('ks', ks)

                //kpHead
                let kpHead = vo.kpHead

                //kpCellEditable, kpRowDrag, kpHeadCheckBox
                let kpCellEditable = {}
                let kpRowDrag = {}
                let kpHeadCheckBox = {}
                if (vo.isEditable) {
                    kpCellEditable = {
                        'name': true,
                        'description': true,
                        'from': true,
                    }
                    kpRowDrag = {
                        'name': true,
                    }
                    kpHeadCheckBox = {
                        'name': true,
                    }
                }

                //kpHeadHide
                let kpHeadHide = {
                    'id': true,
                }
                if (true) {
                    let tabKeysHide = arrPull(vo.tabKeysPick, vo.tabKeysShow)
                    each(tabKeysHide, (k) => {
                        kpHeadHide[k] = true
                    })
                }

                //opt
                opt = {
                    language: vo.$t('aggridLanguage'),
                    rows: vo.items,
                    keys: ks,
                    kpHead,
                    // autoFitColumn: true,
                    defCellEditable: vo.isEditable,
                    defHeadFilter: true,
                    defCellAlignH: 'left',
                    kpHeadHide,
                    kpHeadFixLeft: {
                        'name': true,
                    },
                    defHeadMinWidth: 150,
                    kpHeadWidth: {
                        'name': isnum(vo.widthPemisName) ? cdbl(vo.widthPemisName) : 300,
                        'description': isnum(vo.widthPemisDescription) ? cdbl(vo.widthPemisDescription) : 300,
                        'belongGrups': 300,
                        'crules': 300,
                        'timeCreate': 220,
                        'timeUpdate': 220,
                    },
                    kpHeadFilterType: {
                        'id': 'text',
                        'name': 'text',
                        'description': 'text',
                        'from': 'text',
                        'belongGrups': 'text',
                        'crules': 'text',
                        'userId': 'text',
                        'timeCreate': 'text',
                        'userIdUpdate': 'text',
                        'timeUpdate': 'text',
                    },
                    kpCellEditable,
                    kpRowDrag,
                    kpHeadCheckBox,
                    kpHeadFilter: {
                        'belongGrups': false,
                        'crules': false,
                    },
                    kpHeadSort: {
                        'belongGrups': false,
                        'crules': false,
                    },
                    kpHeadFocusHighlight: { //雖然效果不完全, 但因按鈕與cell有padding可被點擊, 故還是需要開啟
                        'belongGrups': false,
                        'crules': false,
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
                        'belongGrups': (v, k, r) => {
                            // console.log('kpCellRender belongGrups', v, k, r)

                            //id
                            let id = get(r, 'id', '')
                            // console.log('id', id, k, r)

                            //因kpHeadFocusHighlight設定false時, 仍會於點擊其他可focus的cell, 再點回時依然出現highlight的focus邊框, 故改使用stopPropagation強制吃掉點擊訊息
                            //因stopPropagation只吃掉訊息, 原本focus會處於原本可focus的cell, 再重複點時會於前個focus的cell出現highlight邊框, 故再多使用preventDefault阻止瀏覽器預設行為, 此等同於return false
                            let t = `
                                <div onclick="event.stopPropagation();event.preventDefault();" onmousedown="event.stopPropagation();event.preventDefault();">
                                    <button style="width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" onclick="$vo.$dg.showVePemiBlngGrupsById('${id}')">${v}</button>
                                </div>
                            `

                            return t
                        },
                        'crules': (v, k, r) => {
                            // console.log('kpCellRender crules', v, k, r)

                            //id
                            let id = get(r, 'id', '')
                            // console.log('id', id, k, r)

                            //因kpHeadFocusHighlight設定false時, 仍會於點擊其他可focus的cell, 再點回時依然出現highlight的focus邊框, 故改使用stopPropagation強制吃掉點擊訊息
                            //因stopPropagation只吃掉訊息, 原本focus會處於原本可focus的cell, 再重複點時會於前個focus的cell出現highlight邊框, 故再多使用preventDefault阻止瀏覽器預設行為, 此等同於return false
                            let t = `
                                <div onclick="event.stopPropagation();event.preventDefault();" onmousedown="event.stopPropagation();event.preventDefault();">
                                    <button style="width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" onclick="$vo.$dg.showVeCrulesById('${id}')">${vo.getCrulesText(v)}</button>
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

        toggleTabKeys: function() {
            let vo = this

            //cmp
            let cmp = get(vo, '$refs.rftable.$refs.$self')
            // console.log('cmp', cmp)

            //showKeys
            cmp.showKeys(vo.tabKeysShow)
            // console.log('tabKeysShow', vo.tabKeysShow)

        },

        genItems: function(pemis, kpUsePemiGrup) {
            // console.log('method genItems', pemis, kpUsePemiGrup)

            let vo = this

            //items
            let items = map(pemis, (p) => {

                //gs
                let gs = []
                if (haskey(kpUsePemiGrup, p.name)) {
                    gs = kpUsePemiGrup[p.name]
                }
                // console.log('gs', gs)

                //belongGrups
                let belongGrups = vo.$t('pemiBlngRnderNoGrup')
                let t = vo.$t('pemiBlngRnderGrups')
                let n = size(gs)
                if (n > 0) {
                    t = t.replace('{n}', n)
                    if (n === 1) {
                        t = t.replace('{nms}', `(${gs[0].grup.name})`)
                    }
                    else {
                        t = t.replace('{nms}', '')
                    }
                    belongGrups = t
                }

                //save belongGrups, gs
                p.belongGrups = belongGrups
                p.gs = gs
                // console.log('p', p)

                return p
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
            let r = vo.$ds.pemis.funNew()
            r.name = vo.$s.getNameNew(rows, 'name', '', vo.$t('pemiAddNameNew'))
            // r.crules = ''
            r.userId = `{${vo.$t('pemiAddIdNew')}}`
            r.timeCreate = `{${vo.$t('pemiAddIdNew')}}`
            r.userIdUpdate = `{${vo.$t('pemiAddIdNew')}}`
            r.timeUpdate = `{${vo.$t('pemiAddIdNew')}}`
            // console.log('r', r)

            //belongGrups, gs
            let gs = []
            let belongGrups = vo.$t('pemiBlngRnderNoGrup')

            //save belongGrups, gs
            r.belongGrups = belongGrups
            r.gs = gs
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
            let _r = vo.$ds.pemis.funNew()
            r.id = _r.id //使用新建方式預先產生id避免重複
            r.name = vo.$s.getNameNew(rows, 'name', nameOld, vo.$t('pemiCopyNameNew'))
            r.userId = `{${vo.$t('pemiAddIdNew')}}`
            r.timeCreate = `{${vo.$t('pemiAddIdNew')}}`
            r.userIdUpdate = `{${vo.$t('pemiAddIdNew')}}`
            r.timeUpdate = `{${vo.$t('pemiAddIdNew')}}`
            // console.log('r', r)

            //belongGrups, gs
            let gs = []
            let belongGrups = vo.$t('pemiBlngRnderNoGrup')

            //save belongGrups, gs
            r.belongGrups = belongGrups
            r.gs = gs
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

        fltKpRule: function(kp) {
            // console.log('fltKpRule', kp)

            let vo = this

            //_kp
            let _kp = {}
            each(vo.targets, (v, k) => {
                _kp[v.id] = true //管控對象須使用id
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

        getCrulesText: function(crules) {
            // console.log('method getCrulesText', crules)

            let vo = this

            //kpRule
            let kpRule = {}
            try {
                // console.log('crules', crules)
                kpRule = JSON5.parse(crules)
            }
            catch (err) {}
            // console.log('kpRule', kpRule)

            //fltKpRule
            kpRule = vo.fltKpRule(kpRule)
            // console.log('kpRule(fltKpRule)', kpRule)

            //vs
            let vs = []
            each(kpRule, (v, k) => {
                // console.log(k, 'v', v)

                //isActive
                let isActive = v //crules各值為直接儲存y或n
                if (isActive !== 'y') {
                    return true //跳出換下一個
                }
                // console.log(k, '_isActive', _isActive)

                //push
                vs.push(k)

            })

            //crulesText
            let crulesText = vo.$t('pemiRnderCrulesNoRule')
            let t = vo.$t('pemiRnderCrulesHasNRule')
            let n = size(vs)
            if (n > 0) {
                t = t.replace('{n}', n)
                // if (n === 1) {
                //     t = t.replace('{nms}', `(${vs[0]})`)
                // }
                // else {
                //     t = t.replace('{nms}', '')
                // }
                t = t.replace('{nms}', '') //管控對象id太長, 顯示按鈕預設寬度小, 故皆僅顯示數量
                crulesText = t
            }

            return crulesText
        },

        showVePemiBlngGrupsById: function(id) {
            // console.log('method showVePemiBlngGrupsById', id)

            let vo = this

            //check
            if (!isestr(id)) {
                vo.$alert(`${vo.$t('pemiEditBlngGrupsNoPemiId')}`, { type: 'error' })
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
                vo.$alert(`${vo.$t('pemiEditBlngGrupsNoPemiData')}`, { type: 'error' })
                return
            }

            //showVePemiBlngGrups
            vo.$dg.showVePemiBlngGrups({
                isEditable: vo.isEditable,
                pemi: r,
            })
                .then(() => {})
                .catch(() => {})

        },

        showVeCrulesById: function(id) {
            // console.log('method showVeCrulesById', id)

            let vo = this

            //check
            if (!isestr(id)) {
                vo.$alert(`${vo.$t('pemiEditCrulesNoPemiId')}`, { type: 'error' })
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
                vo.$alert(`${vo.$t('pemiEditCrulesNoPemiData')}`, { type: 'error' })
                return
            }

            //showVeCrules
            vo.$dg.showVeCrules({
                isEditable: vo.isEditable,
                pemi: r,
            })
                .then((crules) => {
                    // console.log('crules', crules)

                    //set
                    set(vo, `opt.rows[${kr}].crules`, crules)
                    // console.log('vo.opt.rows[kr]', cloneDeep(vo.opt.rows[kr]))

                    //refresh
                    vo.refresh()

                    //isModified
                    vo.isModified = true

                })
                .catch(() => {})

        },

        savePemis: function() {
            // console.log('method savePemis')

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
                    vo.$alert(`${vo.$t('pemiAddEmpty')}`, { type: 'error' })
                    return
                }

                //updatePemis
                await vo.$fapi.updatePemis(rows)
                    .catch((err) => {
                        errTemp = err
                    })

                //check
                if (errTemp !== null) {
                    vo.$alert(`${vo.$t('pemiSavePemisFail')}: ${errTemp}`, { type: 'error' })
                    return
                }

                //isModified
                vo.isModified = false

                //alert
                vo.$alert(vo.$t('pemiSavePemisSuccess'))

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
