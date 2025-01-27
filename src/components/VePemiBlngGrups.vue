<template>
    <WDialog
        :show.sync="bShow"
        :title="isEditable?$t('pemiBlngEditGrups'):$t('pemiBlngEditGrupsForDisplay')"
        :icon="mdiFormatListCheckbox"
        :minWidth="800"
        :maxWidth="800"
        :fullscreen="fullscreen"
        :contentBackgroundColor="'#fff'"
        :headerBtns="useHeaderBtns"
        :hasSaveBtn="isEditable && isModified"
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
                    style="_border-bottom:1px solid #ddd; background:#fff;"
                    v-domresize
                    @domresize="resizeHead"
                >

                    <!-- 當前權限群組名稱 -->
                    <div style="padding:18px 12px;  background:#fff; border-bottom:1px solid #ddd;">

                        <div style="font-size:0.75rem; color:#999; padding-bottom:2px;">
                            {{$t('pemiBlngPemiNow')}}
                        </div>

                        <div style="font-size:1.3rem;">
                            {{pemiName}}
                        </div>

                    </div>

                    <!-- 功能區 -->
                    <div
                        style="padding:5px; background:#fff; display:flex; align-items:center;"
                        v-if="isEditable"
                    >

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
                                @click="showVePemiBlngGrupsToggleItemsEnableAllYes"
                            ></WButtonCircle>

                            <div style="padding-left:4px;"></div>

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
                                @click="showVePemiBlngGrupsToggleItemsEnableAllNo"
                            ></WButtonCircle>

                            <div style="padding-left:4px;"></div>

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
                                @click="showVePemiBlngGrupsToggleItemsEnableAllInv"
                            ></WButtonCircle>

                            <div style="padding-left:4px;"></div>

                        </template>

                        <template v-if="hasItemsCheck">

                            <WButtonCircle
                                :paddingStyle="{v:6,h:6}"
                                :tooltip="$t('pemiBlngDeleteCheckPemis')"
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

            isEditable: false,
            isModified: false,

            pemi: null,

            items: [],
            itemsCheck: [],
            opt: null,

        }
    },
    mounted: function() {
        //console.log('mounted')

        let vo = this

        //set
        Vue.prototype.$dg.showVePemiBlngGrups = vo.show
        Vue.prototype.$dg.showVePemiBlngGrupsToggleItemModeByName = vo.showVePemiBlngGrupsToggleItemModeByName
        Vue.prototype.$dg.showVePemiBlngGrupsToggleItemEnableByName = vo.showVePemiBlngGrupsToggleItemEnableByName

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

        pemiName: function() {
            let vo = this

            let c = get(vo, 'pemi.name', '')

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
                    'pemisNames',
                    'mode',
                    'enable',
                ]
                // console.log('ks', ks)

                //kpHead
                let kpHead = {
                    'name': vo.$t('grupName'),
                    'pemisNames': vo.$t('belongPemisNames'),
                    'mode': vo.$t('operPemiEnable'),
                    'enable': vo.$t('operMode'),
                }

                //opt
                opt = {
                    language: vo.$t('aggridLanguage'),
                    rows: vo.items,
                    keys: ks,
                    kpHead,
                    autoFitColumn: true,
                    defCellEditable: false, //vo.isEditable,
                    defHeadFilter: true,
                    defCellAlignH: 'left',
                    kpCellEditable: {
                        'name': vo.isEditable,
                        'mode': false,
                        'enable': false,
                    },
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
                        'pemisNames': 'text',
                        'mode': 'text',
                        'enable': 'text',
                    },
                    // kpHeadCheckBox: {
                    //     'name': true,
                    // },
                    kpHeadFocusHighlight: { //雖然效果不完全, 但因按鈕與cell有padding可被點擊, 故還是需要開啟
                        'pemisNames': false,
                    },
                    kpCellRender: {
                        'pemisNames': (v, k, r) => {
                            // console.log('kpCellRender pemisNames', v, k, r)

                            let csp = `border-top-left-radius:4px; border-bottom-left-radius:4px;`
                            let csnp = `border-left:1px solid #aaaaaa; border-right:1px solid #aaaaaa; border-top:1px solid #aaaaaa; border-bottom:1px solid #aaaaaa; background:#ffffff; color:#555;`
                            let csep = `border-left:1px solid #ac2451; border-right:1px solid #9e2149; border-top:1px solid #ac2451; border-bottom:1px solid #ac2451; background:#be295a; color:#fff;`

                            let csa = `border-top-right-radius:4px; border-bottom-right-radius:4px;`
                            let csna = `_border-left:1px solid #aaaaaa; border-right:1px solid #aaaaaa; border-top:1px solid #aaaaaa; border-bottom:1px solid #aaaaaa; background:#eeeeee; color:#555;`
                            let csea = `_border-left:1px solid #ac2451; border-right:1px solid #ac2451; border-top:1px solid #ac2451; border-bottom:1px solid #ac2451; background:#d22f64; color:#fff;`

                            let vs = r.pemis

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
                                <select onchange="$vo.$dg.showVePemiBlngGrupsToggleItemModeByName('${name}',this.value)" ${vo.isEditable ? '' : 'disabled'}>
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
                                <input type="checkbox" ${v === 'y' ? 'checked' : ''} onclick="$vo.$dg.showVePemiBlngGrupsToggleItemEnableByName('${name}')" ${vo.isEditable ? '' : 'disabled'} />
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

        genItems: function(pemi, grups) {
            // console.log('genItems', pemi, grups)

            let vo = this

            //items
            let items = map(grups, (g) => {

                //kpPemi
                let kpPemi = JSON5.parse(g.cpemis)
                // console.log(g.name, 'kpPemi', kpPemi)

                //fltKpPemi
                kpPemi = vo.fltKpPemi(kpPemi)
                // console.log(g.name, 'kpPemi(fltKpPemi)', kpPemi)

                //mode, enable, pemis
                let mode = 'OR'
                let enable = 'n'
                let pemis = []
                each(kpPemi, (v, k) => {
                    // console.log(k, 'v', v)

                    //_isActive, 此為使用者cpemis內設定, 可為y或n, 僅提取y, 再判斷此使用者是否有使用此pemi
                    let _isActive = get(v, 'isActive', '')
                    if (_isActive !== 'y') {
                        return true //跳出換下一個
                    }
                    // console.log(k, '_isActive', _isActive)

                    //_mode
                    let _mode = get(v, 'mode', '')
                    // console.log(k, '_mode', _mode)

                    //b, 使用者是否擁有指定權限群組
                    let b = k === pemi.name
                    // console.log(k, 'b', b)

                    //mode, isActive
                    if (b) {
                        enable = 'y'
                        mode = _mode //使用使用者給予cpemis內指定權限群組之合併權限模式
                        // console.log('使用使用者給予cpemis內指定權限群組之合併權限模式 pemi', pemi)
                    }

                    //push
                    pemis.push({
                        name: k,
                        ...v,
                        enable: b ? 'y' : 'n', //給render使用
                    })

                })
                // console.log(g.name, 'pemis', pemis)

                //pemisNames
                let pemisNames = map(pemis, 'name')
                pemisNames = join(pemisNames, ' ')
                // console.log(g.name, 'pemisNames', pemisNames)

                return {
                    name: g.name,
                    pemisNames,
                    mode,
                    enable,
                    // kpPemi,
                    pemis,
                }
            })
            // console.log(g.name, 'items', items)

            return items
        },

        revRows: function() {
            // console.log('revRows')

            let vo = this

            //pemi
            let pemi = cloneDeep(vo.pemi)
            // console.log('pemi', pemi)

            //grups
            let grups = cloneDeep(vo.grups)
            // console.log('grups', grups)

            //rows
            let rows = get(vo, 'opt.rows', [])
            // console.log('rows', rows)

            //grups
            grups = map(grups, (g, kg) => {

                //kpPemi
                let kpPemi = JSON5.parse(g.cpemis)
                // console.log(g.name, 'kpPemi', kpPemi)

                //fltKpPemi
                kpPemi = vo.fltKpPemi(kpPemi)
                // console.log(g.name, 'kpPemi(fltKpPemi)', kpPemi)

                //mode
                let mode = get(rows, `${kg}.mode`, '')
                if (mode !== 'OR' && mode !== 'AND') {
                    console.log(`非預期: mode應該皆已指定不應觸發`, mode)
                    mode = 'OR'
                }
                // console.log(g.name, 'mode', mode)

                //enable
                let enable = get(rows, `${kg}.enable`, '')
                if (enable !== 'y' && enable !== 'n') {
                    console.log(`非預期: enable應該皆已指定不應觸發`, enable)
                    enable = 'n'
                }
                // console.log(g.name, 'enable', enable)

                //kpPemi
                if (enable === 'y') {
                    kpPemi[pemi.name] = {
                        mode,
                        isActive: 'y',
                    }
                }
                else {
                    if (haskey(kpPemi, pemi.name)) {
                        delete kpPemi[pemi.name]
                    }
                }
                // console.log(g.name, 'kpPemi', kpPemi)

                //update cpemis
                let cpemis = JSON.stringify(kpPemi)
                g.cpemis = cpemis
                // console.log(g.name, 'cpemis', cpemis)

                return g
            })

            //items
            let items = vo.genItems(pemi, grups)
            // console.log('items', items)

            //update pemisNames, pemis
            each(items, (r, kr) => {
                // name: g.name,
                // pemisNames,
                // mode,
                // enable,
                // pemis,

                //set
                set(vo, `opt.rows[${kr}].pemisNames`, r.pemisNames)
                set(vo, `opt.rows[${kr}].pemis`, r.pemis)
                // console.log('vo.opt.rows[kr]', cloneDeep(vo.opt.rows[kr]))

            })

            //refresh
            vo.refresh()

        },

        showVePemiBlngGrupsToggleItemModeByName: function(name, mode) {
            // console.log('showVePemiBlngGrupsToggleItemModeByName', name, mode)

            let vo = this

            //check
            if (!isestr(name)) {
                vo.$alert(`${vo.$t('pemiBlngEditNoName')}`, { type: 'error' })
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
                vo.$alert(`${vo.$t('pemiBlngEditNoPemi')}`, { type: 'error' })
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

        showVePemiBlngGrupsToggleItemEnableByName: function(name) {
            // console.log('showVePemiBlngGrupsToggleItemEnableByName', name)

            let vo = this

            //check
            if (!isestr(name)) {
                vo.$alert(`${vo.$t('pemiBlngEditNoName')}`, { type: 'error' })
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
                vo.$alert(`${vo.$t('pemiBlngEditNoPemi')}`, { type: 'error' })
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

        showVePemiBlngGrupsToggleItemsEnableAllYes: function() {
            // console.log('showVePemiBlngGrupsToggleItemsEnableAllYes')

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

        showVePemiBlngGrupsToggleItemsEnableAllNo: function() {
            // console.log('showVePemiBlngGrupsToggleItemsEnableAllNo')

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

        showVePemiBlngGrupsToggleItemsEnableAllInv: function() {
            // console.log('showVePemiBlngGrupsToggleItemsEnableAllInv')

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

        saveGrups: async function(rows) {
            // console.log('method saveGrups', rows)

            let vo = this

            //errTemp
            let errTemp = null

            //check
            if (size(rows) === 0) {
                vo.$alert(`${vo.$t('grupSaveGrupsEmpty')}`, { type: 'error' })
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

            //alert
            vo.$alert(vo.$t('grupSaveGrupsSuccess'))

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

                //grups
                let grups = cloneDeep(vo.grups)
                // console.log('grups', grups)

                //grupsNew
                let grupsNew = map(rows, (r, kr) => {

                    //g
                    let g = get(grups, kr, {})

                    //cpemis
                    let cpemis = get(g, 'cpemis', '')

                    //kpPemi
                    let kpPemi = JSON5.parse(cpemis)
                    // console.log('kpGrup', kpGrup)

                    //pemis
                    let pemis = get(r, 'pemis', [])

                    //kpPemiNew
                    let kpPemiNew = {}
                    if (true) {
                        each(pemis, (p) => {
                            if (p.isActive === 'y') {
                                kpPemiNew[p.name] = {
                                    mode: p.mode,
                                    isActive: p.isActive,
                                }
                            }
                        })
                    }

                    //check
                    if (!isEqual(kpPemi, kpPemiNew)) {

                        //cpemis
                        g.cpemis = JSON.stringify(kpPemiNew)

                    }

                    return g
                })
                console.log('grupsNew', grupsNew)

                // //check
                // if (size(grupsNew) === 0) {
                //     return
                // }

                //saveGrups
                await vo.saveGrups(grupsNew)

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

        show: function (msg) {
            // console.log('methods show', msg)

            let vo = this

            //pm
            vo.pm = genPm()

            //default
            vo.isModified = false

            //isEditable, pemi
            let isEditable = get(msg, 'isEditable', false)
            let pemi = get(msg, 'pemi', {})

            //grup
            pemi = cloneDeep(pemi)

            //grups
            let grups = cloneDeep(vo.grups)

            //items
            let items = vo.genItems(pemi, grups)

            //save
            vo.isEditable = isEditable
            vo.pemi = pemi
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
