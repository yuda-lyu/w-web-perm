<template>
    <div
        style="height:100%;"
        v-domresize
        @domresize="resizePanel"
        :changePemis="changePemis"
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
                        :icon="mdiStackOverflow"
                        :color="'#000'"
                        :size="26"
                    ></WIcon>

                    <div style="padding-left:10px; font-size:1.4rem; color:#000;">
                        {{$t('managementPemis')}}
                    </div>

                </div>
            </div>

            <!-- 功能區 -->
            <div style="padding:5px; border-top:1px solid #ddd; display:flex; align-items:center;">

                <template>

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

                    <div style="padding-left:6px;"></div>

                </template>

                <template v-if="hasItemCheckOne">

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

                    <div style="padding-left:6px;"></div>

                </template>

                <template v-if="hasItemsCheck">

                    <WButtonCircle
                        :paddingStyle="{v:6,h:6}"
                        :tooltip="$t('pemiDeleteChecks')"
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
                        @click="savePemis"
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
import { mdiStackOverflow, mdiVectorPolylinePlus, mdiCheckboxMarkedCircle, mdiCloudUploadOutline, mdiTrashCanOutline, mdiPlus, mdiPencilOutline, mdiContentCopy } from '@mdi/js/mdi.js'
import get from 'lodash-es/get.js'
import set from 'lodash-es/set.js'
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
            mdiStackOverflow,
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
        vo.$dg.showVeCrulesById = vo.showVeCrulesById

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

        changePemis: function() {
            // console.log('computed changePemis')

            let vo = this

            //check
            if (size(vo.pemis) === 0) {
                return ''
            }

            //cloneDeep
            let items = cloneDeep(vo.pemis)

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
                    'description',
                    'from',
                    'crules',
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
                    'description': vo.$t('description'),
                    'from': vo.$t('from'),
                    'crules': vo.$t('pemiCrules'),
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
                        'crules': 100,
                        'timeCreate': 220,
                        'timeUpdate': 220,
                    },
                    kpHeadFilterType: {
                        'id': 'text',
                        'name': 'text',
                        'description': 'text',
                        'from': 'text',
                        'crules': 'text',
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
                        'crules': false,
                    },
                    kpHeadSort: {
                        'crules': false,
                    },
                    kpHeadFocusHighlight: { //雖然效果不完全, 但因按鈕與cell有padding可被點擊, 故還是需要開啟
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
                        'crules': (v, k, r) => {
                            // console.log('kpCellRender crules', v, k, r)

                            //id
                            let id = get(r, 'id', '')
                            // console.log('id', id, k, r)

                            //因kpHeadFocusHighlight設定false時, 仍會於點擊其他可focus的cell, 再點回時依然出現highlight的focus邊框, 故改使用stopPropagation強制吃掉點擊訊息
                            //因stopPropagation只吃掉訊息, 原本focus會處於原本可focus的cell, 再重複點時會於前個focus的cell出現highlight邊框, 故再多使用preventDefault阻止瀏覽器預設行為, 此等同於return false
                            let t = `
                                <div onclick="event.stopPropagation();event.preventDefault();" onmousedown="event.stopPropagation();event.preventDefault();">
                                    <button style="width:100%;" onclick="$vo.$dg.showVeCrulesById('${id}')">${vo.$t('pemiEditCrulesSimple')}</button>
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
            r.userId = `{${vo.$t('pemiAddIdNew')}}`
            r.timeCreate = `{${vo.$t('pemiAddIdNew')}}`
            r.userIdUpdate = `{${vo.$t('pemiAddIdNew')}}`
            r.timeUpdate = `{${vo.$t('pemiAddIdNew')}}`
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

        showVeCrulesById: function(id) {
            // console.log('method showVeCrulesById', id)

            let vo = this

            //check
            if (!isestr(id)) {
                vo.$alert(`${vo.$t('pemiEditCrulesNoId')}`, { type: 'error' })
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
                vo.$alert(`${vo.$t('pemiEditCrulesNoPemi')}`, { type: 'error' })
                return
            }

            //showVeCrules
            vo.$dg.showVeCrules(r)
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
