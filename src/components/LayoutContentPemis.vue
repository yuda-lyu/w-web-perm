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
                            {{$t('mmPemis')}}
                        </div>

                        <div style="padding-top:2px; font-size:0.8rem; color:#666;">
                            {{$t('mmPemisMsg')}}
                        </div>

                    </div>

                </div>
            </div>

            <!-- 功能區 -->
            <div
                data-fmid="pemis-toolbar"
                style="padding:5px; border-top:1px solid #ddd; display:flex; align-items:center;"
                _v-if="showIsEditable || isEditable"
            >

                <template v-if="showIsEditable">

                    <div style="padding:6px 0px 4px 4px;">
                        <WSwitch
                            :checkedSwitchCircleColor="'#F68200'"
                            :checkedSwitchCircleColorHover="'#FB8C00'"
                            :checkedSwitchBarColor="'#FFE0B2'"
                            :checkedSwitchBarColorHover="'#FFE6B8'"
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
                        :backgroundColorFocus="'rgba(255,0,50,0.8)'"
                        :textColor="'#eee'"
                        :textColorHover="'#fff'"
                        :iconColor="'#eee'"
                        :iconColorHover="'#fff'"
                        :iconColorFocus="'#fff'"
                        :shadow="false"
                        :promiseUnlock="true"
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
                <WAggridVue
                    ref="rftable"
                    :style="`width:100%;`"
                    :height="contentHeight"
                    :opt="opt"
                >
                    <template v-slot:cell-render="props">
                        <template v-if="props.key==='name'">
                            <span v-if="errItemsByName[props.value]" :title="errItemsByName[props.value]">
                                <span style="color:#F57C00;">{{ props.value }}</span>
                                <img style="vertical-align:sub; width:16px; height:16px;" :src="$ui.getIcon('warning')" />
                            </span>
                            <span v-else-if="warnItemsByName[props.value]" :title="warnItemsByName[props.value]">
                                <img style="vertical-align:sub; width:16px; height:16px; margin-right:4px;" :src="$ui.getIcon('warning')" />
                                <span style="color:#F57C00;">{{ props.value }}</span>
                            </span>
                            <span v-else>{{ props.value }}</span>
                        </template>
                        <template v-else-if="props.key==='belongGrups'">
                            <div @click.stop.prevent @mousedown.stop.prevent>
                                <button style="width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" @click="$dg.showVePemiBlngGrupsById(props.row.id)">{{ props.value }}</button>
                            </div>
                        </template>
                        <template v-else-if="props.key==='crules'">
                            <div v-if="warnCrulesById[props.row.id]" style="display:flex; align-items:center; gap:4px;" @click.stop.prevent @mousedown.stop.prevent>
                                <span :title="warnCrulesById[props.row.id]" style="display:flex; align-items:center; flex:0 0 auto;">
                                    <img style="vertical-align:sub; width:16px; height:16px;" :src="$ui.getIcon('warning')" />
                                </span>
                                <button style="flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" @click="$dg.showVeCrulesById(props.row.id)">{{ getCrulesText(props.value) }}</button>
                            </div>
                            <div v-else @click.stop.prevent @mousedown.stop.prevent>
                                <button style="width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" @click="$dg.showVeCrulesById(props.row.id)">{{ getCrulesText(props.value) }}</button>
                            </div>
                        </template>
                        <span v-else>{{ props.value }}</span>
                    </template>
                </WAggridVue>
            </template>

        </template>

        <div
            style="padding:10px 15px; font-size:0.8rem;"
            v-else
        >
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
import arrPull from 'wsemi/src/arrPull.mjs'
import eachOwn from '../js/eachOwn.mjs'
import cvKpToObj from '../js/cvKpToObj.mjs'
import getRuleEnable from '../js/getRuleEnable.mjs'
import { getRuleWarns, getRuleWarnText, fmtWarn } from '../js/getAuthWarn.mjs'
import { getNameErrs, mapNameKp } from '../js/getNameErrs.mjs'
import { getDelImpact, getDelConfirmText } from '../js/getDelRefCount.mjs'
import { getSavePreview } from '../js/getCascadePreview.mjs'
import WIcon from 'w-component-vue/src/components/WIcon.vue'
import WSwitch from 'w-component-vue/src/components/WSwitch.vue'
import WButtonCircle from 'w-component-vue/src/components/WButtonCircle.vue'
import WPopup from 'w-component-vue/src/components/WPopup.vue'
import WInputCheckbox from 'w-component-vue/src/components/WInputCheckbox.vue'
import WAggridVue from 'w-aggrid-vue/src/components/WAggridVue.vue'


export default {
    components: {
        WIcon,
        WSwitch,
        WButtonCircle,
        WPopup,
        WInputCheckbox,
        WAggridVue,
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

            panelHeight: 100,
            headHeight: 100,

            firstLoading: true,
            firstSetting: true,
            systemProcing: false, //程式端載入/重載清單資料期間為 true, 用於排除非使用者操作之 rowsChange (見 $ui.markDataReload)
            postSaving: false, //儲存成功後至成功訊息框關閉(再加短暫緩衝)期間為 true: 刪除或改名連帶更新引用端表(ADR-036), 一次儲存使 store 先後推播兩張表而多次重建清單, 其後非同步觸發之 rowsChange 不得視為使用者變更(markDataReload 之 1ms 窗口可能短於 ag-grid 渲染, 儲存鈕殘留的間歇現象); 成功訊息框期間使用者無從編輯
            showIsEditable: false,
            isEditable: false,
            isModified: false,

            tabKeys: [
                'id',
                'name',
                'description',
                'from',
                'crules',
                'belongGrups',
                'userId',
                'timeCreate',
                'userIdUpdate',
                'timeUpdate',
            ],
            tabKeysPick: [
                'name',
                'description',
                'from',
                'crules',
                'belongGrups',
                'userId',
                'timeCreate',
                'userIdUpdate',
                'timeUpdate',
            ],
            tabKeysShow: [
                'name',
                'description',
                // 'from',
                'crules',
                'belongGrups',
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

            //會觸發數據變更再導致opt變更導致觸發rowsChange等事件, 故得要延遲, 供組件偵測初始設定數據初始化之用
            setTimeout(() => {
                vo.firstSetting = false
                // console.log('firstSetting', vo.firstSetting)
            }, 1)

        }

    },
    computed: {

        syncState: function() {
            let vo = this
            return get(vo, '$store.state.syncState')
        },

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
                    kpPemi = cvKpToObj(JSON5.parse(g.cpemis), { hasMode: true }) //陣列形式經共用解碼(R-AUTH-LIST-01)
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
            let kp = Object.create(null) //無原型: 鍵為使用者資料, 不得命中 constructor 等原型鍵(規則帳本 R-KEY-01)
            each(vo.useGrups, (g) => {
                eachOwn(g.kpPemi, (v, k) => {
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
            let _kp = Object.create(null)
            each(vo.pemis, (v, k) => {
                _kp[v.name] = true
            })
            // console.log('_kp', _kp)

            //kp
            let kp = Object.create(null)
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

        nameErrs: function() {
            let vo = this

            //名稱擋存只針對「本次造成或觸及」者, 庫內既有的歷史同名(僅外部同步可造成)不擋、改為警告圖示(R-PRINCIPLE-00 g, R-NAME-UNIQ-02);
            //判準與伺服端同一份(findTouchedDup), 基準為 store 之 pemis(最近一次由伺服端載入的列, 儲存成功後 store 推播更新, 基準隨之更新)
            return getNameErrs(get(vo, 'opt.rows', []), vo.pemis, 'name')
        },

        errItemsByName: function() {
            let vo = this

            //擋存者(空名稱、本次造成或觸及之重複): 既有呈現(橘色名稱＋圖示), 決定 isError
            return mapNameKp(vo.nameErrs.errBlock, (kind) => {
                return vo.$t(kind === 'empty' ? `pemiNameEmpty` : `pemiNameDuplicate`)
            })
        },

        warnItemsByName: function() {
            let vo = this

            //歷史同名(不擋存, 與 errItemsByName 互斥): 同樣顯示橘色名稱＋圖示, tooltip 說明為既有重複
            return mapNameKp(vo.nameErrs.warnHist, (n) => {
                return fmtWarn(vo.$t('warnNameHistDup'), { n })
            })
        },

        warnCrulesById: function() {
            let vo = this

            //crules 規則清單之衝突提示(R-PRINCIPLE-00 a): 列 id → tooltip 文字, 只含有衝突之列(同一管理對象重複列且有勾與沒勾並存); 無衝突之列不入表, 畫面維持原樣
            let kp = Object.create(null)
            let rows = get(vo, 'opt.rows', [])
            each(rows, (r) => {
                let res = getRuleWarns(get(r, 'crules', ''))
                if (res.hasWarn) {
                    kp[get(r, 'id', '')] = getRuleWarnText(res, (k) => vo.$t(k))
                }
            })

            return kp
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
                    defCellEditable: false, //vo.isEditable,
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
                    kpHeadFocusHighlight: { //本欄內容為開窗按鈕(cell 之 padding 亦可被點), 焦點框徒增干擾故關閉; w-aggrid-vue 2.0.87 起規則含 :focus-within, 按鈕取得焦點(如鍵盤 Tab)時亦不顯示焦點框——2.0.86 只擋 :focus, 按鈕聚焦仍現藍框, 即本註解原載「效果不完全」之由, 2026-09-16 實測已修
                        'belongGrups': false,
                        'crules': false,
                    },
                    rowsChange: (rs) => {
                        // console.log('rowsChange', rs)
                        // console.log('rowsChange cloneDeep(vo.opt.rows)', cloneDeep(vo.opt.rows))

                        //check
                        if (!vo.syncState || vo.firstLoading || vo.firstSetting || vo.systemProcing || vo.postSaving) {
                            return
                        }

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

            //markDataReload, 重建 opt 屬程式端寫入, 其後非同步觸發之 rowsChange 不得視為使用者變更
            vo.$ui.markDataReload(vo)

            //save
            vo.opt = opt

        },

        refresh: function() {
            let vo = this

            //cmp
            let cmp = get(vo, '$refs.rftable')
            // console.log('cmp', cmp)

            //refresh, 因set不會觸發ag-grid重繪, 故須另外調用組件函數refresh(內為redrawRows)重繪各列, 使cell-render slot內容更新(w-aggrid-vue 2.0.56起以cell-render slot取代opt.kpCellRender)
            cmp.refresh()

        },

        toggleTabKeys: function() {
            let vo = this

            //cmp
            let cmp = get(vo, '$refs.rftable')
            // console.log('cmp', cmp)

            //showKeys, applyOrder:false 僅切換顯示與隱藏、維持目前欄序; 理由同 LayoutContentUsers 該處註解
            cmp.showKeys(vo.tabKeysShow, { applyOrder: false })
            // console.log('tabKeysShow', vo.tabKeysShow)

        },

        genItems: function(pemis, kpUsePemiGrup) {
            // console.log('method genItems', pemis, kpUsePemiGrup)

            let vo = this

            //items
            let items = map(pemis, (p) => {

                //gs
                let gs = []
                if (Object.prototype.hasOwnProperty.call(kpUsePemiGrup, p.name)) {
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
            //transient 欄位 _isNew: 標記未儲存之新列, 隨列送後端供「新增列已存在即拒絕」(saveNewRowExists), 後端檢查後剝除不入庫 (ADR-025)
            r._isNew = true
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
            //transient 欄位 _isNew: 複製出之列亦為新列(見 addItem) (ADR-025)
            r._isNew = true
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

            //delIds
            let delIds = []
            each(vo.itemsCheck, (v) => {
                // console.log('v', v)
                let id = get(v, 'data.id', '')
                if (!isestr(id)) {
                    console.log(`invalid id`)
                    return true //跳出換下一個
                }
                delIds.push(id)
            })

            //getRowsRemain, 由「現在」之 opt.rows 剔除被刪之列(確認框開啟期間 store 推播可能重建 opt.rows, 故確認後再算一次)
            let getRowsRemain = () => {
                let rows = get(vo, 'opt.rows', [])

                //cloneDeep
                rows = cloneDeep(rows)

                //filter
                each(delIds, (id) => {
                    rows = filter(rows, (vv) => {
                        return vv.id !== id
                    })
                })

                return rows
            }

            //doDelete
            let doDelete = () => {

                //rows
                let rows = getRowsRemain()

                //clear
                vo.itemsCheck = []

                //save
                vo.opt.rows = rows
                // console.log('deleteItemsCheck cloneDeep(vo.opt.rows)', cloneDeep(vo.opt.rows))

                //isModified
                vo.isModified = true

            }

            //impact, 對群組(引用端)之影響, 刪除前須提示(單一框): nRefs 為儲存時將被連帶清理(自其 cpemis 移除對被刪權限之引用)之群組數(任何 mode、含停用項目;
            //與伺服端同一純函數 planRefChanges, 只算本次刪除, ADR-036、R-REF-CASCADE-01), nAnd 為其中以 AND 引用且刪除後查無該權限者(引用被移除後其限制解除, 授權可能變多, R-PRINCIPLE-00 c),
            //nWiden 為引用的權限名稱有多筆同名而只刪其一之群組數(各候選之交集變寬, 授權可能變多, R-PRINCIPLE-00 d);
            //被刪名稱只取基準(store 之 pemis, 已儲存)列中存在者: 尚未儲存的新增列刪除不影響他人
            let impact = getDelImpact(delIds, vo.pemis, vo.grups, 'Pemi', getRowsRemain())
            let confirmText = getDelConfirmText(impact, (k) => vo.$t(k), 'Pemi')

            //無影響他人之授權時維持現行流程(直接刪除, 不彈框)
            if (confirmText === '') {
                doDelete()
                return
            }

            //有影響: 確認框(單一框, 多種影響併入同一框); 使用者取消(No)則不刪除
            vo.$dg.showCheckYesNo(confirmText)
                .then(() => {
                    doDelete()
                })
                .catch(() => {})

        },

        fltKpRule: function(kp) {
            // console.log('fltKpRule', kp)

            let vo = this

            //_kp
            let _kp = Object.create(null)
            each(vo.targets, (v, k) => {
                _kp[v.id] = true //管控對象須使用id
            })
            // console.log('_kp', _kp)

            //kpt
            let kpt = Object.create(null)
            eachOwn(kp, (v, k) => {
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
                kpRule = cvKpToObj(JSON5.parse(crules)) //陣列形式經共用解碼(R-AUTH-LIST-01)
            }
            catch (err) {}
            // console.log('kpRule', kpRule)

            //fltKpRule
            kpRule = vo.fltKpRule(kpRule)
            // console.log('kpRule(fltKpRule)', kpRule)

            //vs
            let vs = []
            eachOwn(kpRule, (v, k) => {
                // console.log(k, 'v', v)

                //isActive
                let isActive = getRuleEnable(kpRule, k) //啟用狀態依共用語意(值為 y／n 或物件形式 { isActive }; 與伺服端授權一致, R-AUTH-LIST-01)
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
            each(rows, (v) => {
                if (get(v, 'id', '') === id) {
                    r = v
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

                    //以 id 於「現在」之 opt.rows 重新找列(R-REL-PAIR-01): 對話框開啟期間 store 更新會重建 opt.rows(他人增刪、改 order), 開框時之列索引可能已指向另一列; 該列已不存在則提示並放棄回填
                    let krNow = -1
                    each(get(vo, 'opt.rows', []), (v, k) => {
                        if (get(v, 'id', '') === id) {
                            krNow = k
                            return false //跳出
                        }
                    })
                    if (krNow < 0) {
                        vo.$alert(`${vo.$t('pemiEditCrulesNoPemiData')}`, { type: 'error' })
                        return
                    }

                    //set
                    set(vo, `opt.rows[${krNow}].crules`, crules)
                    // console.log('vo.opt.rows[krNow]', cloneDeep(vo.opt.rows[krNow]))

                    //refresh
                    vo.refresh()

                    //isModified
                    vo.isModified = true

                })
                .catch(() => {})

        },

        savePemis: function(msg) {
            //promiseUnlock 之鎖交由 doSavePemis 之 runSubmit 於請求結束時釋放, 不於此解鎖: 請求期間儲存鈕之滑鼠與鍵盤 Enter 皆擋 (ADR-025;
            //原第一行即 msg.pm.resolve(), 鎖立即解除, 焦點留在儲存鈕時連按 Enter 可送出 2 次)
            let vo = this
            vo.doSavePemis({ pm: msg.pm })
        },

        doSavePemis: function(opt = {}) {
            // console.log('method doSavePemis')

            let vo = this

            async function core(unlockBtn) {

                //1) 同步檢測 (在開 loading 之前); 早退之訊息框前以 unlockBtn() 釋放儲存鈕之 promiseUnlock 鎖: 按鈕鎖只涵蓋請求期間,
                //結果訊息框出現時按鈕已恢復(與打 API 之路徑一致); 流程狀態仍由 runSubmit 保持至訊息框關閉 (ADR-025)
                if (isestr(vo.isError)) {
                    unlockBtn()
                    await vo.$dg.showCheckYes(`${vo.isError}`)
                    return
                }

                //rows
                let rows = get(vo, 'opt.rows', [])

                //check
                if (size(rows) === 0) {
                    unlockBtn()
                    await vo.$dg.showCheckYes(`${vo.$t('pemiAddEmpty')}`)
                    return
                }

                //新增列之 transient 欄位 _isNew(addItem / copyItem 標記)隨列送後端: 後端據以拒絕「標為新增但 id 已存在」之列
                //(同一包重送時不把剛建立之列當修改覆寫, 回 saveNewRowExists), 檢查後由 ltdtmapping 依 schema 取欄時剝除不入庫 (ADR-025)

                //2) 引用連帶預覽(ADR-036、R-REF-CASCADE-01; 與伺服端同一純函數 planRefChanges, 基準為 store 之 pemis／grups, 筆數以伺服端實際為準): 權限改名時引用它之群組 cpemis 於同一次寫入內連帶改名,
                //有引用端將被更新時先確認(確認框文字與成功訊息之判定見 src/js/getCascadePreview.mjs); plan.err 非 null(新名撞懸空名等)不彈框、照常送出, 伺服端以固定語系鍵拒存並由下方 showCheckYes 顯示
                let pv = getSavePreview({ kind: 'Pemi', rowsOld: vo.pemis, rowsNew: rows, holdersOld: vo.grups, cascadeRename: get(vo, 'webInfor.cascadeRename', true), $t: (k) => vo.$t(k) })
                if (pv.confirmText !== '') {

                    //先開確認框之流程: 開框前 unlockBtn() 釋放儲存鈕之 promiseUnlock 鎖(同上, 按鈕鎖只涵蓋請求期間); 流程狀態仍由 runSubmit 保持至本流程結束,
                    //確認框與後續請求期間之重入(焦點仍在儲存鈕時 Enter)皆被略過 (ADR-025)
                    unlockBtn()
                    let isGo = await vo.$dg.showCheckYesNo(pv.confirmText)
                        .then(() => true)
                        .catch(() => false)

                    //選否(或確認框被取代而視同選否): 中止儲存, 不送出; 尚未開 loading, 資料與 isModified 保留, 由 runSubmit 於回傳後結束流程
                    if (!isGo) {
                        return
                    }

                }

                //3) 確定打 API 才開 loading
                vo.$ui.updateLoading(true)

                //4) updatePemis, 各自 catch + 旗標短路
                let okSave = false
                await vo.$fapi.updatePemis(rows)
                    .then(() => { okSave = true })
                    .catch(async (err) => {
                        vo.$ui.updateLoading(false) //showCheckYes 前關 loading（modal 阻斷期間避免 loading 疊在底下）
                        await vo.$dg.showCheckYes(`${vo.$t('pemiSavePemisFail')}: ${vo.$tErr(err)}`)
                    })
                if (!okSave) return

                //isModified; postSaving 自此至成功訊息框關閉後 300ms 內排除 rowsChange(見 data 註解)
                vo.postSaving = true
                vo.isModified = false

                //alert（showCheckYes 前關 loading，避免 modal 等待期間 loading 疊在底下）
                vo.$ui.updateLoading(false)
                try {
                    await vo.$dg.showCheckYes(pv.successText !== '' ? pv.successText : vo.$t('pemiSavePemisSuccess'), { type: 'success' }) //只有改名且有群組之引用被連帶更新才附筆數(刪除所致之清理不改, 已於刪除確認框告知), 否則維持原成功訊息
                }
                finally {
                    setTimeout(() => {
                        vo.postSaving = false
                    }, 300)
                }

            }

            //runSubmit: 儲存流程(至結果訊息框關閉)進行中再觸發即略過; opt.pm 為儲存鈕之 promiseUnlock 鎖, 於請求結束(updateLoading(false))時釋放 (ADR-025)
            return vo.$ui.runSubmit('savePemis', (unlockBtn) => {
                return core(unlockBtn)
                    .catch((err) => {
                        console.log('catch', err)
                        vo.$alert(vo.$t('anUnexpectedErrorOccurred'), { type: 'error' })
                    })
                    .finally(() => {

                        //hide loading
                        vo.$ui.updateLoading(false)

                    })
            }, opt)

        },

    }
}
</script>

<style scoped>
</style>
