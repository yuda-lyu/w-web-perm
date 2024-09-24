<template>
    <WDialog
        :show.sync="bShow"
        :title="$t('grupEditCpemis')"
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

                    <!-- 功能區 -->
                    <div style="padding:5px; background:#fff; display:flex; align-items:center;">

                        <template>

                            <WButtonCircle
                                :paddingStyle="{v:6,h:6}"
                                :tooltip="$t('cpemiCheckAllYes')"
                                :icon="mdiCheckboxMultipleMarked"
                                :backgroundColor="'#fff'"
                                :backgroundColorHover="'#f2f2f2'"
                                _textColor="'#eee'"
                                _textColorHover="'#fff'"
                                :iconColor="'#444'"
                                :iconColorHover="'#222'"
                                :shadow="false"
                                @click="toggleItemsEnableAllYes"
                            ></WButtonCircle>

                            <div style="padding-left:6px;"></div>

                        </template>

                        <template>

                            <WButtonCircle
                                :paddingStyle="{v:6,h:6}"
                                :tooltip="$t('cpemiCheckAllNo')"
                                :icon="mdiCheckboxMultipleBlankOutline"
                                :backgroundColor="'#fff'"
                                :backgroundColorHover="'#f2f2f2'"
                                _textColor="'#eee'"
                                _textColorHover="'#fff'"
                                :iconColor="'#444'"
                                :iconColorHover="'#222'"
                                :shadow="false"
                                @click="toggleItemsEnableAllNo"
                            ></WButtonCircle>

                            <div style="padding-left:6px;"></div>

                        </template>

                        <template>

                            <WButtonCircle
                                :paddingStyle="{v:6,h:6}"
                                :tooltip="$t('cpemiCheckAllInv')"
                                :icon="mdiCodeTagsCheck"
                                :backgroundColor="'#fff'"
                                :backgroundColorHover="'#f2f2f2'"
                                _textColor="'#eee'"
                                _textColorHover="'#fff'"
                                :iconColor="'#444'"
                                :iconColorHover="'#222'"
                                :shadow="false"
                                @click="toggleItemsEnableAllInv"
                            ></WButtonCircle>

                            <div style="padding-left:6px;"></div>

                        </template>

                        <template v-if="hasItemsCheck">

                            <WButtonCircle
                                :paddingStyle="{v:6,h:6}"
                                :tooltip="$t('cpemiDeleteCheckTargets')"
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
import trim from 'lodash-es/trim.js'
import uniq from 'lodash-es/uniq.js'
import find from 'lodash-es/find.js'
import size from 'lodash-es/size.js'
import filter from 'lodash-es/filter.js'
import join from 'lodash-es/join.js'
import sortBy from 'lodash-es/sortBy.js'
import cloneDeep from 'lodash-es/cloneDeep.js'
import genPm from 'wsemi/src/genPm.mjs'
import sep from 'wsemi/src/sep.mjs'
import delay from 'wsemi/src/delay.mjs'
import iseobj from 'wsemi/src/iseobj.mjs'
import isestr from 'wsemi/src/isestr.mjs'
import WDialog from 'w-component-vue/src/components/WDialog.vue'
import WText from 'w-component-vue/src/components/WText.vue'
import WTextSuggest from 'w-component-vue/src/components/WTextSuggest.vue'
import WSwitch from 'w-component-vue/src/components/WSwitch.vue'
import WCheckbox from 'w-component-vue/src/components/WCheckbox.vue'
import WIcon from 'w-component-vue/src/components/WIcon.vue'
import WButtonChip from 'w-component-vue/src/components/WButtonChip.vue'
import WButtonCircle from 'w-component-vue/src/components/WButtonCircle.vue'
import WAggridVueDyn from 'w-component-vue/src/components/WAggridVueDyn.vue'


export default {
    components: {
        WDialog,
        WText,
        WTextSuggest,
        WSwitch,
        WCheckbox,
        WIcon,
        WButtonChip,
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
        Vue.prototype.$dg.showVeCpemis = vo.show
        Vue.prototype.$dg.toggleItemModeByName = vo.toggleItemModeByName
        Vue.prototype.$dg.toggleItemEnableByName = vo.toggleItemEnableByName

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
                    'mode',
                    'enable',
                ]
                // console.log('ks', ks)

                //kpHead
                let kpHead = {
                    'name': vo.$t('pemiName'),
                    'mode': vo.$t('pemiMode'),
                    'enable': vo.$t('pemiEnable'),
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
                        'mode': 50,
                        'enable': 50,
                    },
                    // kpRowDrag: {
                    //     'name': true,
                    // },
                    // kpHeadFilter: {
                    //     'enable': false,
                    // },
                    kpHeadFilterType: {
                        'name': 'text',
                        'mode': 'text',
                        'enable': 'text',
                    },
                    // kpHeadCheckBox: {
                    //     'name': true,
                    // },
                    kpCellRender: {
                        'name': (v, k, r) => {
                            // console.log('kpCellRender name', v)

                            return v
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
                                <select onchange="$vo.$dg.toggleItemModeByName('${name}',this.value)">
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
                                <input type="checkbox" ${v === 'y' ? 'checked' : ''} onclick="$vo.$dg.toggleItemEnableByName('${name}')" />
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

        toggleItemModeByName: function(name, mode) {
            // console.log('toggleItemModeByName', name, mode)

            let vo = this

            //check
            if (!isestr(name)) {
                vo.$alert(`${vo.$t('cpemiEditNoName')}`, { type: 'error' })
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
                vo.$alert(`${vo.$t('cpemiEditNoPemi')}`, { type: 'error' })
                return
            }

            //mode
            // let mode = th.value
            console.log('mode', mode)

            //set
            set(vo, `opt.rows[${kr}].mode`, mode)
            // console.log('vo.opt.rows[kr]', cloneDeep(vo.opt.rows[kr]))

            //refresh
            vo.refresh()

            //isModified
            vo.isModified = true

        },

        toggleItemEnableByName: function(name) {
            // console.log('toggleItemEnableByName', name)

            let vo = this

            //check
            if (!isestr(name)) {
                vo.$alert(`${vo.$t('cpemiEditNoName')}`, { type: 'error' })
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
                vo.$alert(`${vo.$t('cpemiEditNoPemi')}`, { type: 'error' })
                return
            }

            //enable
            let _enable = get(r, 'enable', 'n')
            let enable = _enable === 'y' ? 'n' : 'y'
            // console.log('enable', enable)

            //set
            set(vo, `opt.rows[${kr}].enable`, enable)
            // console.log('vo.opt.rows[kr]', cloneDeep(vo.opt.rows[kr]))

            //refresh
            vo.refresh()

            //isModified
            vo.isModified = true

        },

        toggleItemsEnableAllYes: function() {
            // console.log('toggleItemsEnableAllYes')

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

            //refresh
            vo.refresh()

            //isModified
            vo.isModified = true

        },

        toggleItemsEnableAllNo: function() {
            // console.log('toggleItemsEnableAllNo')

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

            //refresh
            vo.refresh()

            //isModified
            vo.isModified = true

        },

        toggleItemsEnableAllInv: function() {
            // console.log('toggleItemsEnableAllInv')

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

            //refresh
            vo.refresh()

            //isModified
            vo.isModified = true

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

                //kpPemi
                let kpPemi = {}
                each(rows, (r) => {
                    let name = get(r, 'name', '')
                    let mode = get(r, 'mode', '')
                    let enable = get(r, 'enable', '')
                    if (!isestr(name)) {
                        console.log(`invalid name`)
                        return true //跳出換下一個
                    }
                    if (mode !== 'OR' && mode !== 'AND') {
                        console.log(`invalid mode[${mode}]`)
                        return true //跳出換下一個
                    }
                    if (!isestr(enable)) {
                        console.log(`invalid enable`)
                        return true //跳出換下一個
                    }
                    kpPemi[name] = {
                        mode,
                        isActive: enable,
                    }
                })
                // console.log('kpPemi', kpPemi)

                //cpemis
                let cpemis = JSON.stringify(kpPemi)
                // console.log('cpemis', cpemis)

                return cpemis
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

            //cloneDeep
            grup = cloneDeep(grup)

            //cpemis
            let cpemis = get(grup, 'cpemis', '')
            // console.log('cpemis', cpemis)

            //kpPemi
            let kpPemi = {}
            if (isestr(cpemis)) {
                try {
                    kpPemi = JSON5.parse(cpemis)
                }
                catch (err) {
                    console.log('cpemis', cpemis)
                    console.log('err', err)
                }
            }
            // console.log('kpPemi', kpPemi)

            //items
            let items = map(vo.pemis, (v) => {
                // console.log('pemis v', v)

                //p
                let p = get(kpPemi, v.name, null)
                // console.log('p', p)

                //name
                let name = v.name
                // console.log('name', name)

                //mode
                let mode = get(p, 'mode', '')
                if (mode !== 'OR' && mode !== 'AND') {
                    mode = 'OR'
                }
                // console.log('mode', mode)

                //enable
                let _enable = get(p, 'isActive', '')
                let enable = _enable === 'y' ? 'y' : 'n'
                // console.log('isActive', enable)

                //r
                let r = {
                    name,
                    mode,
                    enable,
                }
                // console.log('r', r)

                return r
            })
            // console.log('items', items)

            //save
            vo.grup = grup
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
