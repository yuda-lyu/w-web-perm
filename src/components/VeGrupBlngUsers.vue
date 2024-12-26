<template>
    <WDialog
        :show.sync="bShow"
        :title="$t('grupBlngEditUsers')"
        :icon="mdiFormatListCheckbox"
        :minWidth="800"
        :maxWidth="800"
        :fullscreen="fullscreen"
        :contentBackgroundColor="'#fff'"
        :headerBtns="useHeaderBtns"
        :hasSaveBtn="isModified"
        :save-btn-tooltip="$t('save')"
        :close-btn-tooltip="$t('close')"
        @click-btns="clickBtns"
        @click-save="clickSave"
        @click-close="clickClose"
        @resize="resizeDialog"
    >
        <template v-slot:content>
            <div>

                <div
                    style="border-bottom:1px solid #ddd; background:#fff;"
                    v-domresize
                    @domresize="resizeHead"
                >

                    <!-- 當前權限群組名稱 -->
                    <div style="padding:18px 12px;  background:#fff; border-bottom:1px solid #ddd;">

                        <div style="font-size:0.75rem; color:#999; padding-bottom:2px;">
                            {{$t('grupBlngGrupNow')}}
                        </div>

                        <div style="font-size:1.3rem;">
                            {{grupName}}
                        </div>

                    </div>

                    <!-- 功能區 -->
                    <div style="padding:5px; background:#fff; display:flex; align-items:center;">

                        <template>

                            <WButtonCircle
                                :paddingStyle="{v:6,h:6}"
                                :tooltip="$t('checkAllYes')"
                                :icon="mdiCheckboxMultipleMarked"
                                :backgroundColor="'#fff'"
                                :backgroundColorHover="'#f2f2f2'"
                                _textColor="'#eee'"
                                _textColorHover="'#fff'"
                                :iconColor="'#444'"
                                :iconColorHover="'#222'"
                                :shadow="false"
                                @click="showVeGrupBlngUsersToggleItemsEnableAllYes"
                            ></WButtonCircle>

                            <div style="padding-left:6px;"></div>

                        </template>

                        <template>

                            <WButtonCircle
                                :paddingStyle="{v:6,h:6}"
                                :tooltip="$t('checkAllNo')"
                                :icon="mdiCheckboxMultipleBlankOutline"
                                :backgroundColor="'#fff'"
                                :backgroundColorHover="'#f2f2f2'"
                                _textColor="'#eee'"
                                _textColorHover="'#fff'"
                                :iconColor="'#444'"
                                :iconColorHover="'#222'"
                                :shadow="false"
                                @click="showVeGrupBlngUsersToggleItemsEnableAllNo"
                            ></WButtonCircle>

                            <div style="padding-left:6px;"></div>

                        </template>

                        <template>

                            <WButtonCircle
                                :paddingStyle="{v:6,h:6}"
                                :tooltip="$t('checkAllInv')"
                                :icon="mdiCodeTagsCheck"
                                :backgroundColor="'#fff'"
                                :backgroundColorHover="'#f2f2f2'"
                                _textColor="'#eee'"
                                _textColorHover="'#fff'"
                                :iconColor="'#444'"
                                :iconColorHover="'#222'"
                                :shadow="false"
                                @click="showVeGrupBlngUsersToggleItemsEnableAllInv"
                            ></WButtonCircle>

                            <div style="padding-left:6px;"></div>

                        </template>

                        <template v-if="hasItemsCheck">

                            <WButtonCircle
                                :paddingStyle="{v:6,h:6}"
                                :tooltip="$t('grupBlngDeleteCheckGrups')"
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

                    </div>

                </div>

                <template v-if="items">
                    <WAggridVueDyn
                        ref="rftable"
                        :style="`width:100%;`"
                        :height="contentHeight"
                        :opt="opt"
                    >
                    </WAggridVueDyn>
                </template>

                <div style="padding:10px 15px; font-size:0.8rem;" v-else>
                    {{$t('waitingData')}}
                </div>

            </div>
        </template>
    </WDialog>
</template>

<script>
import { mdiDeleteForever, mdiFullscreen, mdiFullscreenExit, mdiFormatListCheckbox, mdiFileTree, mdiTrashCanOutline, mdiCheckboxMultipleBlankOutline, mdiCheckboxMultipleMarked, mdiCodeTagsCheck } from '@mdi/js/mdi.js'
import Vue from 'vue'
import JSON5 from 'json5'
import get from 'lodash-es/get.js'
import set from 'lodash-es/set.js'
import each from 'lodash-es/each.js'
import map from 'lodash-es/map.js'
import size from 'lodash-es/size.js'
import filter from 'lodash-es/filter.js'
import join from 'lodash-es/join.js'
import sortBy from 'lodash-es/sortBy.js'
import isEqual from 'lodash-es/isEqual.js'
import cloneDeep from 'lodash-es/cloneDeep.js'
import genPm from 'wsemi/src/genPm.mjs'
import haskey from 'wsemi/src/haskey.mjs'
import delay from 'wsemi/src/delay.mjs'
import iseobj from 'wsemi/src/iseobj.mjs'
import isestr from 'wsemi/src/isestr.mjs'
import WDialog from 'w-component-vue/src/components/WDialog.vue'
import WButtonCircle from 'w-component-vue/src/components/WButtonCircle.vue'
import WAggridVueDyn from 'w-component-vue/src/components/WAggridVueDyn.vue'


export default {
    components: {
        WDialog,
        WButtonCircle,
        WAggridVueDyn,
    },
    props: {
    },
    data: function() {
        return {
            mdiDeleteForever,
            mdiFullscreen,
            mdiFullscreenExit,
            mdiFormatListCheckbox,
            mdiFileTree,
            mdiTrashCanOutline,
            mdiCheckboxMultipleBlankOutline,
            mdiCheckboxMultipleMarked,
            mdiCodeTagsCheck,

            bShow: false,
            pm: null,

            fullscreen: false,

            panelWidth: 100,
            panelHeight: 100,
            headHeight: 100,

            isModified: false,

            grup: null,

            items: [],
            itemsCheck: [],
            opt: null,

        }
    },
    mounted: function() {
        //console.log('mounted')

        let vo = this

        //set
        Vue.prototype.$dg.showVeGrupBlngUsers = vo.show
        Vue.prototype.$dg.showVeGrupBlngUsersToggleItemModeByName = vo.showVeGrupBlngUsersToggleItemModeByName
        Vue.prototype.$dg.showVeGrupBlngUsersToggleItemEnableByName = vo.showVeGrupBlngUsersToggleItemEnableByName

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

        kpHeaderBtns: function() {
            let vo = this
            let kp = {
                // delete: {
                //     icon: mdiDeleteForever,
                //     tooltip: `${vo.$t('delete')}${vo.tableNameCht}`,
                //     evName: 'delete'
                // },
                toFullscreen: {
                    icon: mdiFullscreen,
                    tooltip: vo.$t('screenFull'),
                    evName: 'toFullscreen'
                },
                toNormalscreen: {
                    icon: mdiFullscreenExit,
                    tooltip: vo.$t('screenNormal'),
                    evName: 'toNormalscreen'
                },
            }
            return kp
        },

        useHeaderBtns: function() {
            let vo = this
            let bts = []
            if (true) {
                let k = vo.fullscreen ? 'toNormalscreen' : 'toFullscreen'
                bts = [
                    ...bts,
                    vo.kpHeaderBtns[k]
                ]
            }
            // if (vo.useDelete) {
            //     let k = 'delete'
            //     bts = [
            //         ...bts,
            //         vo.kpHeaderBtns[k]
            //     ]
            // }
            return bts
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
            let b = vo.itemsCheck.length > 0

            return b
        },

        grupName: function() {
            let vo = this

            let c = get(vo, 'grup.name', '')

            return c
        },

    },
    methods: {

        resizeDialog: function(msg) {
            // console.log('methods resizeDialog', msg)

            let vo = this

            //panelWidth, panelHeight
            vo.panelWidth = msg.panelWidth
            vo.panelHeight = msg.contentHeightMax

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
                    'name',
                    'grupsNames',
                    'mode',
                    'enable',
                ]
                // console.log('ks', ks)

                //kpHead
                let kpHead = {
                    'name': vo.$t('userName'),
                    'grupsNames': vo.$t('belongGrupsNames'),
                    'mode': vo.$t('operGrupEnable'),
                    'enable': vo.$t('operMode'),
                }

                //opt
                opt = {
                    language: vo.$t('aggridLanguage'),
                    rows: vo.items,
                    keys: ks,
                    kpHead,
                    autoFitColumn: true,
                    defHeadFilter: true,
                    defCellAlignH: 'left',
                    // kpCellEditable: {
                    //     'name': true,
                    //     'mode': true,
                    //     'enable': true,
                    // },
                    kpHeadWidth: {
                        'mode': 100,
                        'enable': 100,
                    },
                    // kpRowDrag: {
                    //     'name': true,
                    // },
                    // kpHeadFilter: {
                    //     'enable': false,
                    // },
                    kpHeadFilterType: {
                        'name': 'text',
                        'grupsNames': 'text',
                        'mode': 'text',
                        'enable': 'text',
                    },
                    // kpHeadCheckBox: {
                    //     'name': true,
                    // },
                    kpHeadFocusHighlight: { //雖然效果不完全, 但因按鈕與cell有padding可被點擊, 故還是需要開啟
                        'grupsNames': false,
                    },
                    kpCellRender: {
                        'grupsNames': (v, k, r) => {
                            // console.log('kpCellRender grupsNames', v, k, r)

                            let csp = `border-top-left-radius:4px; border-bottom-left-radius:4px;`
                            let csnp = `border-left:1px solid #aaaaaa; border-right:1px solid #aaaaaa; border-top:1px solid #aaaaaa; border-bottom:1px solid #aaaaaa; background:#ffffff; color:#555;`
                            let csep = `border-left:1px solid #ac2451; border-right:1px solid #9e2149; border-top:1px solid #ac2451; border-bottom:1px solid #ac2451; background:#be295a; color:#fff;`

                            let csa = `border-top-right-radius:4px; border-bottom-right-radius:4px;`
                            let csna = `_border-left:1px solid #aaaaaa; border-right:1px solid #aaaaaa; border-top:1px solid #aaaaaa; border-bottom:1px solid #aaaaaa; background:#eeeeee; color:#555;`
                            let csea = `_border-left:1px solid #ac2451; border-right:1px solid #ac2451; border-top:1px solid #ac2451; border-bottom:1px solid #ac2451; background:#d22f64; color:#fff;`

                            let vs = r.grups

                            let t = ''
                            each(vs, (v) => {
                                t += `
                                    <span style="display:inline-block; line-height:20px; height:20px;">
                                        <div style="display:flex;">
                                            <div style="padding:0px 5px; ${csp} ${v.enable === 'y' ? csep : csnp}">
                                                ${v.mode}
                                            </div>
                                            <div style="padding:0px 5px; ${csa} ${v.enable === 'y' ? csea : csna}">
                                                ${v.name}
                                            </div>
                                        </div>
                                    </span>
                                `
                            })

                            return t
                        },
                        'mode': (v, k, r) => {
                            // console.log('kpCellRender mode', v)

                            //name
                            let name = get(r, 'name', '')
                            // console.log('name', name, k, r)

                            //mode
                            let mode = get(r, 'mode', '')
                            // console.log('mode', mode, k, r)

                            let t = `
                                <select onchange="$vo.$dg.showVeGrupBlngUsersToggleItemModeByName('${name}',this.value)">
                                    <option value="OR" ${mode === 'OR' ? 'selected' : ''}>OR</option>
                                    <option value="AND" ${mode === 'AND' ? 'selected' : ''}>AND</option>
                                </select>
                            `

                            return t
                        },
                        'enable': (v, k, r) => {
                            // console.log('kpCellRender enable', v, k, r)

                            //name
                            let name = get(r, 'name', '')
                            // console.log('name', name, k, r)

                            let t = `
                                <input type="checkbox" ${v === 'y' ? 'checked' : ''} onclick="$vo.$dg.showVeGrupBlngUsersToggleItemEnableByName('${name}')" />
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

        deleteItemsCheck: function() {
            // console.log('method deleteItemsCheck')

            let vo = this

            //check
            if (size(vo.itemsCheck) === 0) {
                return
            }

            //cloneDeep
            let rows = get(vo, 'opt.rows', [])

            //cloneDeep
            rows = cloneDeep(rows)

            //filter
            each(vo.itemsCheck, (v) => {
                // console.log('v', v)
                let name = get(v, 'data.name', '')
                if (!isestr(name)) {
                    console.log(`invalid name`)
                    return true //跳出換下一個
                }
                rows = filter(rows, (vv) => {
                    return vv.name !== name
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

        refresh: function() {
            let vo = this

            //cmp
            let cmp = get(vo, '$refs.rftable.$refs.$self')
            // console.log('cmp', cmp)

            //refresh, 因set不會觸發kpCellRender, 故須另外調用組件函數refresh, 進而觸發kpCellRender, 使能更新數據
            cmp.refresh()

        },

        getDisplayData: function() {
            let vo = this

            //cmp
            let cmp = get(vo, '$refs.rftable.$refs.$self')
            // console.log('cmp', cmp)

            //getDisplayData
            let rows = cmp.getDisplayData()

            return rows
        },

        fltKpGrup: function(kp) {
            // console.log('fltKpGrup', kp)

            let vo = this

            //_kp
            let _kp = {}
            each(vo.grups, (v, k) => {
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

        genItems: function(grup, users) {
            // console.log('genItems', grup, users)

            let vo = this

            //items
            let items = map(users, (u) => {

                //kpGrup
                let kpGrup = JSON5.parse(u.cgrups)
                // console.log(u.name, 'kpGrup', kpGrup)

                //fltKpGrup
                kpGrup = vo.fltKpGrup(kpGrup)
                // console.log(u.name, 'kpGrup(fltKpGrup)', kpGrup)

                //mode, enable, grups
                let mode = 'OR'
                let enable = 'n'
                let grups = []
                each(kpGrup, (v, k) => {
                    // console.log(k, 'v', v)

                    //_isActive, 此為使用者cgrups內設定, 可為y或n, 僅提取y, 再判斷此使用者是否有使用此grup
                    let _isActive = get(v, 'isActive', '')
                    if (_isActive !== 'y') {
                        return true //跳出換下一個
                    }
                    // console.log(k, '_isActive', _isActive)

                    //_mode
                    let _mode = get(v, 'mode', '')
                    // console.log(k, '_mode', _mode)

                    //b, 使用者是否擁有指定權限群組
                    let b = k === grup.name
                    // console.log(k, 'b', b)

                    //mode, isActive
                    if (b) {
                        enable = 'y'
                        mode = _mode //使用使用者給予cgrups內指定權限群組之合併權限模式
                        // console.log('使用使用者給予cgrups內指定權限群組之合併權限模式 grup', grup)
                    }

                    //push
                    grups.push({
                        name: k,
                        ...v,
                        enable: b ? 'y' : 'n', //給render使用
                    })

                })
                // console.log(u.name, 'grups', grups)

                //grupsNames
                let grupsNames = map(grups, 'name')
                grupsNames = join(grupsNames, ' ')
                // console.log(u.name, 'grupsNames', grupsNames)

                return {
                    name: u.name,
                    grupsNames,
                    mode,
                    enable,
                    // kpGrup,
                    grups,
                }
            })
            // console.log(u.name, 'items', items)

            return items
        },

        revRows: function() {
            // console.log('revRows')

            let vo = this

            //grup
            let grup = cloneDeep(vo.grup)
            // console.log('grup', grup)

            //users
            let users = cloneDeep(vo.users)
            // console.log('users', users)

            //rows
            let rows = get(vo, 'opt.rows', [])
            // console.log('rows', rows)

            //users
            users = map(users, (u, ku) => {

                //kpGrup
                let kpGrup = JSON5.parse(u.cgrups)
                // console.log(u.name, 'kpGrup', kpGrup)

                //fltKpGrup
                kpGrup = vo.fltKpGrup(kpGrup)
                // console.log(u.name, 'kpGrup(fltKpGrup)', kpGrup)

                //mode
                let mode = get(rows, `${ku}.mode`, '')
                if (mode !== 'OR' && mode !== 'AND') {
                    console.log(`非預期: mode應該皆已指定不應觸發`, mode)
                    mode = 'OR'
                }
                // console.log(u.name, 'mode', mode)

                //enable
                let enable = get(rows, `${ku}.enable`, '')
                if (enable !== 'y' && enable !== 'n') {
                    console.log(`非預期: enable應該皆已指定不應觸發`, enable)
                    enable = 'n'
                }
                // console.log(u.name, 'enable', enable)

                //kpGrup
                if (enable === 'y') {
                    kpGrup[grup.name] = {
                        mode,
                        isActive: 'y',
                    }
                }
                else {
                    if (haskey(kpGrup, grup.name)) {
                        delete kpGrup[grup.name]
                    }
                }
                // console.log(u.name, 'kpGrup', kpGrup)

                //update cgrups
                let cgrups = JSON.stringify(kpGrup)
                u.cgrups = cgrups
                // console.log(u.name, 'cgrups', cgrups)

                return u
            })

            //items
            let items = vo.genItems(grup, users)
            // console.log('items', items)

            //update grupsNames, grups
            each(items, (r, kr) => {
                // name: u.name,
                // grupsNames,
                // mode,
                // enable,
                // grups,

                //set
                set(vo, `opt.rows[${kr}].grupsNames`, r.grupsNames)
                set(vo, `opt.rows[${kr}].grups`, r.grups)
                // console.log('vo.opt.rows[kr]', cloneDeep(vo.opt.rows[kr]))

            })

            //refresh
            vo.refresh()

        },

        showVeGrupBlngUsersToggleItemModeByName: function(name, mode) {
            // console.log('showVeGrupBlngUsersToggleItemModeByName', name, mode)

            let vo = this

            //check
            if (!isestr(name)) {
                vo.$alert(`${vo.$t('grupBlngEditNoGrupName')}`, { type: 'error' })
                return
            }

            //rows
            let rows = get(vo, 'opt.rows', [])

            //find
            let r = null
            let kr = null
            each(rows, (v, k) => {
                if (get(v, 'name', '') === name) {
                    r = v
                    kr = k
                    return false //跳出
                }
            })

            //check
            if (!iseobj(r)) {
                vo.$alert(`${vo.$t('grupBlngEditNoGrupData')}`, { type: 'error' })
                return
            }

            //mode
            // let mode = th.value
            // console.log('mode', mode)

            //set
            set(vo, `opt.rows[${kr}].mode`, mode)
            // console.log('vo.opt.rows[kr]', cloneDeep(vo.opt.rows[kr]))

            //revRows, 已含refresh
            vo.revRows()

            //isModified
            vo.isModified = true

        },

        showVeGrupBlngUsersToggleItemEnableByName: function(name) {
            // console.log('showVeGrupBlngUsersToggleItemEnableByName', name)

            let vo = this

            //check
            if (!isestr(name)) {
                vo.$alert(`${vo.$t('grupBlngEditNoGrupName')}`, { type: 'error' })
                return
            }

            //rows
            let rows = get(vo, 'opt.rows', [])

            //find
            let r = null
            let kr = null
            each(rows, (v, k) => {
                if (get(v, 'name', '') === name) {
                    r = v
                    kr = k
                    return false //跳出
                }
            })

            //check
            if (!iseobj(r)) {
                vo.$alert(`${vo.$t('grupBlngEditNoGrupData')}`, { type: 'error' })
                return
            }

            //enable
            let _enable = get(r, 'enable', 'n')
            let enable = _enable === 'y' ? 'n' : 'y'
            // console.log('enable', enable)

            //set
            set(vo, `opt.rows[${kr}].enable`, enable)
            // console.log('vo.opt.rows[kr]', cloneDeep(vo.opt.rows[kr]))

            //revRows, 已含refresh
            vo.revRows()

            //isModified
            vo.isModified = true

        },

        showVeGrupBlngUsersToggleItemsEnableAllYes: function() {
            // console.log('showVeGrupBlngUsersToggleItemsEnableAllYes')

            let vo = this

            //rows
            let rows = get(vo, 'opt.rows', [])
            // console.log('rows', rows)

            //kpRow
            let kpRow = {}
            each(rows, (r, kr) => {
                kpRow[r.name] = kr
            })

            //rowsEff
            let rowsEff = vo.getDisplayData()
            // console.log('rowsEff', rowsEff)

            //toggle
            each(rowsEff, (r) => {

                //kr
                let kr = kpRow[r.name]

                //set
                set(vo, `opt.rows[${kr}].enable`, 'y')
                // console.log('vo.opt.rows[kr]', cloneDeep(vo.opt.rows[kr]))

            })

            //revRows, 已含refresh
            vo.revRows()

            //isModified
            vo.isModified = true

        },

        showVeGrupBlngUsersToggleItemsEnableAllNo: function() {
            // console.log('showVeGrupBlngUsersToggleItemsEnableAllNo')

            let vo = this

            //rows
            let rows = get(vo, 'opt.rows', [])
            // console.log('rows', rows)

            //kpRow
            let kpRow = {}
            each(rows, (r, kr) => {
                kpRow[r.name] = kr
            })

            //rowsEff
            let rowsEff = vo.getDisplayData()
            // console.log('rowsEff', rowsEff)

            //toggle
            each(rowsEff, (r) => {

                //kr
                let kr = kpRow[r.name]

                //set
                set(vo, `opt.rows[${kr}].enable`, 'n')
                // console.log('vo.opt.rows[kr]', cloneDeep(vo.opt.rows[kr]))

            })

            //revRows, 已含refresh
            vo.revRows()

            //isModified
            vo.isModified = true

        },

        showVeGrupBlngUsersToggleItemsEnableAllInv: function() {
            // console.log('showVeGrupBlngUsersToggleItemsEnableAllInv')

            let vo = this

            //rows
            let rows = get(vo, 'opt.rows', [])
            // console.log('rows', rows)

            //kpRow
            let kpRow = {}
            each(rows, (r, kr) => {
                kpRow[r.name] = kr
            })

            //rowsEff
            let rowsEff = vo.getDisplayData()
            // console.log('rowsEff', rowsEff)

            //toggle
            each(rowsEff, (r) => {

                //kr
                let kr = kpRow[r.name]

                //enable
                let _enable = get(r, 'enable', 'n')
                let enable = _enable === 'y' ? 'n' : 'y'

                //set
                set(vo, `opt.rows[${kr}].enable`, enable)
                // console.log('vo.opt.rows[kr]', cloneDeep(vo.opt.rows[kr]))

            })

            //revRows, 已含refresh
            vo.revRows()

            //isModified
            vo.isModified = true

        },

        saveUsers: async function(rows) {
            // console.log('method saveUsers', rows)

            let vo = this

            //errTemp
            let errTemp = null

            //check
            if (size(rows) === 0) {
                vo.$alert(`${vo.$t('userSaveUsersEmpty')}`, { type: 'error' })
                return
            }

            //updateUsers
            await vo.$fapi.updateUsers(rows)
                .catch((err) => {
                    errTemp = err
                })

            //check
            if (errTemp !== null) {
                vo.$alert(`${vo.$t('userSaveUsersFail')}: ${errTemp}`, { type: 'error' })
                return
            }

            //alert
            vo.$alert(vo.$t('userSaveUsersSuccess'))

        },

        clickBtns: function(msg) {
            // console.log('clickBtns', msg)

            let vo = this

            //evName
            if (msg.evName === 'toFullscreen') {
                vo.fullscreen = true
            }
            else if (msg.evName === 'toNormalscreen') {
                vo.fullscreen = false
            }

        },

        clickSave: function(msg) {
            //console.log('methods clickSave', msg)

            let vo = this

            async function core() {

                //show loading
                vo.$ui.updateLoading(true)

                //delay
                await delay(300)

                //rows
                let rows = get(vo, 'opt.rows', [])
                // console.log('rows', rows)

                //users
                let users = cloneDeep(vo.users)
                // console.log('users', users)

                //usersNew
                let usersNew = map(rows, (r, kr) => {

                    //u
                    let u = get(users, kr, {})

                    //cgrups
                    let cgrups = get(u, 'cgrups', '')

                    //kpGrup
                    let kpGrup = JSON5.parse(cgrups)
                    // console.log('kpGrup', kpGrup)

                    //grups
                    let grups = get(r, 'grups', [])

                    //kpGrupNew
                    let kpGrupNew = {}
                    if (true) {
                        each(grups, (g) => {
                            if (g.isActive === 'y') {
                                kpGrupNew[g.name] = {
                                    mode: g.mode,
                                    isActive: g.isActive,
                                }
                            }
                        })
                    }

                    //check
                    if (!isEqual(kpGrup, kpGrupNew)) {

                        //cgrups
                        u.cgrups = JSON.stringify(kpGrupNew)

                    }

                    return u
                })
                console.log('usersNew', usersNew)

                // //check
                // if (size(usersNew) === 0) {
                //     return
                // }

                //saveUsers
                await vo.saveUsers(usersNew)

            }

            //core
            core()
                .then((rows) => {

                    //resolve
                    vo.pm.resolve(rows)

                    //hide
                    vo.bShow = false

                })
                .catch(() => { })
                .finally(() => {

                    //save按鈕解除loading
                    msg.pm.resolve()

                    //hide loading
                    vo.$ui.updateLoading(false)

                })

        },

        clickClose: function() {
            //console.log('methods clickClose')

            let vo = this

            //reject
            vo.pm.reject('close window')

            //hide
            vo.bShow = false

        },

        show: function (grup) {
            // console.log('methods show', grup)

            let vo = this

            //pm
            vo.pm = genPm()

            //default
            vo.isModified = false

            //grup
            grup = cloneDeep(grup)
            vo.grup = grup

            //users
            let users = cloneDeep(vo.users)

            //items
            let items = vo.genItems(grup, users)
            vo.items = items

            //genOpt
            vo.genOpt()

            //bShow
            vo.bShow = true

            return vo.pm
        },

    }
}
</script>

<style scoped>
</style>
