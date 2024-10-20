<template>
    <div
        style="height:100%;"
        v-domresize
        @domresize="resizePanel"
        :changeTargets="changeTargets"
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
                        :icon="mdiGamepadCircle"
                        :color="'#000'"
                        :size="26"
                    ></WIcon>

                    <div style="padding-left:10px; font-size:1.4rem; color:#000;">
                        {{$t('managementTargets')}}
                    </div>

                </div>
            </div>

            <!-- 功能區 -->
            <div style="padding:5px; border-top:1px solid #ddd; display:flex; align-items:center;">

                <template>

                    <WButtonCircle
                        :paddingStyle="{v:6,h:6}"
                        :tooltip="$t('targetAdd')"
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
                        :tooltip="$t('targetCopy')"
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
                        :tooltip="$t('targetDeleteCheckTargets')"
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
                        @click="saveTargets"
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
import { mdiGamepadCircle, mdiStackOverflow, mdiAccountGroupOutline, mdiBallotRecountOutline, mdiCloudUploadOutline, mdiTrashCanOutline, mdiPlus, mdiPencilOutline, mdiContentCopy } from '@mdi/js/mdi.js'
import get from 'lodash-es/get.js'
import each from 'lodash-es/each.js'
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
            mdiGamepadCircle,
            mdiStackOverflow,
            mdiAccountGroupOutline,
            mdiBallotRecountOutline,
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

        // let vo = this

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

        changeTargets: function() {
            // console.log('computed changeTargets')

            let vo = this

            //check
            if (size(vo.targets) === 0) {
                return ''
            }

            //cloneDeep
            let items = cloneDeep(vo.targets)

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
            let b = vo.itemsCheck.length > 0

            return b
        },

        hasItemCheckOne: function() {
            let vo = this

            //h
            let b = size(vo.itemsCheck) === 1

            return b
        },

        errItemsById: function() {
            let vo = this

            //rows
            let rows = get(vo, 'opt.rows', [])

            //kpErr
            let kpErr = {}
            let kpId = {}
            each(rows, (v, k) => {

                //id
                let id = get(v, 'id', '')

                //check
                if (!isestr(id)) {

                    //kpErr
                    kpErr[id] = vo.$t(`targetIdEmpty`)

                    return true //跳出換下一個
                }

                //check
                if (haskey(kpId, id)) {

                    //kpErr
                    kpErr[id] = vo.$t(`targetIdDuplicate`)

                    return true //跳出換下一個
                }

                //kpId
                kpId[id] = true

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
                    'description',
                    'from',
                    'userId',
                    'timeCreate',
                    'userIdUpdate',
                    'timeUpdate',
                ]
                // console.log('ks', ks)

                //kpHead
                let kpHead = {
                    'id': vo.$t('targetId'),
                    'description': vo.$t('description'),
                    'from': vo.$t('from'),
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
                    // kpHeadHide: {
                    //     'id': true,
                    // },
                    kpHeadFixLeft: {
                        'id': true,
                    },
                    defHeadMinWidth: 150,
                    kpHeadWidth: {
                        'id': 300,
                        'timeCreate': 220,
                        'timeUpdate': 220,
                    },
                    kpHeadFilterType: {
                        'id': 'text',
                        'description': 'text',
                        'from': 'text',
                        'userId': 'text',
                        'timeCreate': 'text',
                        'userIdUpdate': 'text',
                        'timeUpdate': 'text',
                    },
                    kpCellEditable: {
                        'id': true,
                        'description': true,
                        'from': true,
                    },
                    kpRowDrag: {
                        'id': true,
                    },
                    kpHeadCheckBox: {
                        'id': true,
                    },
                    kpCellRender: {
                        'id': (v) => {
                            // console.log('kpCellRender', v)

                            //err
                            let err = get(vo.errItemsById, v, '')
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
                    },
                    // kpCellTooltip: {
                    //     'id': (v) => {
                    //         // console.log('kpCellTooltip', v)

                    //         //err
                    //         let err = get(vo.errItemsById, v, '')
                    //         // console.log(v, err)

                    //         //check
                    //         let t = ''
                    //         if (isestr(err)) {
                    //             t = err
                    //         }

                    //         return t
                    //     },
                    // },
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

        addItem: function() {
            // console.log('method addItem')

            let vo = this

            //cloneDeep
            let rows = get(vo, 'opt.rows', [])

            //cloneDeep
            rows = cloneDeep(rows)

            //r
            let r = vo.$ds.targets.funNew()
            r.id = vo.$s.getNameNew(rows, 'id', '', vo.$t('targetAddNameNew'))
            r.userId = `{${vo.$t('targetAddIdNew')}}`
            r.timeCreate = `{${vo.$t('targetAddIdNew')}}`
            r.userIdUpdate = `{${vo.$t('targetAddIdNew')}}`
            r.timeUpdate = `{${vo.$t('targetAddIdNew')}}`
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
            let nameOld = r.id
            let _r = vo.$ds.targets.funNew()
            r.id = _r.id //使用新建方式預先產生id避免重複
            r.id = vo.$s.getNameNew(rows, 'id', nameOld, vo.$t('targetCopyNameNew'))
            r.userId = `{${vo.$t('targetAddIdNew')}}`
            r.timeCreate = `{${vo.$t('targetAddIdNew')}}`
            r.userIdUpdate = `{${vo.$t('targetAddIdNew')}}`
            r.timeUpdate = `{${vo.$t('targetAddIdNew')}}`
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

        saveTargets: function() {
            // console.log('method saveTargets')

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
                    vo.$alert(`${vo.$t('targetAddEmpty')}`, { type: 'error' })
                    return
                }

                //updateTargets
                await vo.$fapi.updateTargets(rows)
                    .catch((err) => {
                        errTemp = err
                    })

                //check
                if (errTemp !== null) {
                    vo.$alert(`${vo.$t('targetSaveTargetsFail')}: ${errTemp}`, { type: 'error' })
                    return
                }

                //isModified
                vo.isModified = false

                //alert
                vo.$alert(vo.$t('targetSaveTargetsSuccess'))

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
