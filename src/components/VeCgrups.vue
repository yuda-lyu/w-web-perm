<template>
    <WDialog
        :show.sync="bShow"
        :title="isEditable?$t('userEditCgrups'):$t('userEditCgrupsForDisplay')"
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

                    <!-- 無法掛在任何一列之警告(R-PRINCIPLE-00 f: 啟用而名稱非字串之項目, 物件形式無法保留, 存檔被拒): 僅有此類項目時才渲染, 無則與修前同(不預留空間); 字級與內距沿用下方 waitingData 提示 -->
                    <div
                        style="padding:10px 15px; font-size:0.8rem; color:#F57C00; display:flex; align-items:center;"
                        :title="lossyHintTitle"
                        v-if="lossyHint"
                    >
                        <img style="flex:0 0 auto; width:16px; height:16px; margin-right:4px;" :src="$ui.getIcon('warning')" />
                        <span>{{ lossyHint }}</span>
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
                                @click="showVeCgrupsToggleItemsEnableAllYes"
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
                                @click="showVeCgrupsToggleItemsEnableAllNo"
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
                                @click="showVeCgrupsToggleItemsEnableAllInv"
                            ></WButtonCircle>

                            <div style="padding-left:4px;"></div>

                        </template>

                        <template v-if="hasItemsCheck">

                            <WButtonCircle
                                :paddingStyle="{v:6,h:6}"
                                :tooltip="$t('cgrupDeleteCheckPemis')"
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
                                    <!-- 警告圖示(R-PRINCIPLE-00 原則 3「提示」): 僅該列之引用有衝突(warnText, show 時由 getRefWarns 取得)時才渲染於名稱左側; 無警告者與修前同一節點(不預留空間) -->
                                    <span :title="props.row.warnText" v-if="props.row.warnText"><img style="vertical-align:sub; width:16px; height:16px; margin-right:4px;" :src="$ui.getIcon('warning')" />{{ props.value }}</span>
                                    <span v-else>{{ props.value }}</span>
                                </template>
                                <!-- flex 置中容器: 22px 控制項以行內排版放入 27px 儲存格會偏下(上 4.77／下 0.23), 包一層 height:100% 之 flex 容器即上下各 2.5(同 w-aggrid-vue 範例 AppSlotCellRenderAlign.vue) -->
                                <div
                                    style="display:flex; align-items:center; height:100%;"
                                    v-else-if="props.key==='mode'"
                                >
                                    <ModeSelectChip
                                        :value="props.row.mode"
                                        :editable="isEditable && props.row.enable === 'y'"
                                        :labelContent="'modeSelect'"
                                        @input="(item)=>{showVeCgrupsToggleItemModeByName(props.row.name, item)}"
                                    ></ModeSelectChip>
                                </div>
                                <input v-else-if="props.key==='enable'" type="checkbox" :checked="props.value === 'y'" @click="showVeCgrupsToggleItemEnableByName(props.row.name)" :disabled="!isEditable" />
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
import sortBy from 'lodash-es/sortBy.js'
import isEqual from 'lodash-es/isEqual.js'
import cloneDeep from 'lodash-es/cloneDeep.js'
import genPm from 'wsemi/src/genPm.mjs'
import delay from 'wsemi/src/delay.mjs'
import isestr from 'wsemi/src/isestr.mjs'
import getOwn from '../js/getOwn.mjs'
import cvKpToObj from '../js/cvKpToObj.mjs'
import getKpLossy from '../js/getKpLossy.mjs'
import fmtLossyMsg from '../js/fmtLossyMsg.mjs'
import { getRefState, getRefRowsExtra, getDupRowsInconsistent, getRawModeMap, putRowsToKp, getRowIdxs } from '../js/editorRefRows.mjs'
import { getRefWarns, getItemWarnText, fmtWarn } from '../js/getAuthWarn.mjs'
import WDialog from 'w-component-vue/src/components/WDialog.vue'
import WButtonCircle from 'w-component-vue/src/components/WButtonCircle.vue'
import WAggridVue from 'w-aggrid-vue/src/components/WAggridVue.vue'
import ModeSelectChip from './ModeSelectChip.vue'


export default {
    components: {
        WDialog,
        WButtonCircle,
        WAggridVue,
        ModeSelectChip,
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

            panelHeight: 100,
            headHeight: 100,

            firstLoading: true,
            firstSetting: true,
            isEditable: false,
            isModified: false,

            user: null,

            items: [],
            itemsCheck: [],
            opt: null,

            lossyHint: '', //無法掛在任何一列之警告文字(啟用而名稱非字串之項目), 無則 ''
            lossyHintTitle: '',

        }
    },
    mounted: function() {
        //console.log('mounted')

        let vo = this

        //set
        Vue.prototype.$dg.showVeCgrups = vo.show
        Vue.prototype.$dg.showVeCgrupsToggleItemModeByName = vo.showVeCgrupsToggleItemModeByName
        Vue.prototype.$dg.showVeCgrupsToggleItemEnableByName = vo.showVeCgrupsToggleItemEnableByName

        //firstSetting
        if (vo.firstSetting) {
            // console.log('webInfor', vo.webInfor)

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
                    'name': vo.$t('grupName'), //本對話框列出的是權限群組（items 由 vo.grups 產生）
                    'mode': vo.$t('operGrupMode'),
                    'enable': vo.$t('operEnable'),
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
                        //name 一律唯讀: 本對話框之列固定為「全部既有權限群組」(genItems 產生, 無新增/刪除列),
                        //  就地改名無任何正當用途; 且 doSave 以列上之 name 當鍵寫出 cgrups(kpGrup[name]={mode,isActive}),
                        //  改名即寫出對不到任何群組之鍵 → 關聯靜默失效、DB 留下垃圾鍵, 屬「儲存成功但實況不符」。
                        //  2026-09-16 雙獨立審計提出、經追 doSave 控制流證實(全域 §4 規則 6)。
                        'name': false,
                        'mode': false,
                        'enable': false,
                    },
                    kpHeadWidth: {
                        'mode': 90, //ModeSelectChip 寬 56 + 儲存格內距 11×2 = 78, 留餘裕
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
                        'mode': 'text',
                        'enable': 'text',
                    },
                    kpHeadCheckBox: {
                        'name': true,
                    },
                    kpHeadFocusHighlight: { //兩欄之儲存格內皆有自己的控制項(模式下拉、勾選框), 焦點框徒增干擾故關閉; 控制項取得焦點時之焦點框由 w-aggrid-vue 2.0.87 之 :focus-within 規則一併擋下
                        'mode': false,
                        'enable': false,
                    },
                    rowsChange: (rs) => {
                        // console.log('rowsChange', rs)
                        // console.log('rowsChange cloneDeep(vo.opt.rows)', cloneDeep(vo.opt.rows))

                        //check
                        if (!vo.syncState || vo.firstLoading || vo.firstSetting) {
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
            let cmp = get(vo, '$refs.rftable')
            // console.log('cmp', cmp)

            //refresh, 因set不會觸發ag-grid重繪, 故須另外調用組件函數refresh(內為redrawRows)重繪各列, 使cell-render slot內容更新(w-aggrid-vue 2.0.56起以cell-render slot取代opt.kpCellRender)
            cmp.refresh()

        },

        getDisplayData: function() {
            let vo = this

            //cmp
            let cmp = get(vo, '$refs.rftable')
            // console.log('cmp', cmp)

            //getDisplayData
            let rows = cmp.getDisplayData()

            return rows
        },

        showVeCgrupsToggleItemModeByName: function(name, mode) {
            // console.log('showVeCgrupsToggleItemModeByName', name, mode)

            let vo = this

            //check, 名稱 '' 為合法名稱(R-PRINCIPLE-00 f: 懸空之額外列可為 '', 須可改 mode／停用), 僅非字串者拒絕
            if (typeof name !== 'string') {
                vo.$alert(`${vo.$t('cgrupEditNoName')}`, { type: 'error' })
                return
            }

            //rows
            let rows = get(vo, 'opt.rows', [])

            //krs, 精確同名之全部列(getRowIdxs): 同名多列代表同一個引用, 一併套用使其恆一致(warnDupRowsInconsistent 僅作防呆);
            //精確 ===, 表列無 name 欄(undefined)不再搶先命中名稱 '' 之額外列(修前 get(v, 'name', '') 找第一列)
            let krs = getRowIdxs(rows, 'name', name)

            //check
            if (size(krs) === 0) {
                vo.$alert(`${vo.$t('cgrupEditNoPemi')}`, { type: 'error' })
                return
            }

            //set
            each(krs, (kr) => {
                set(vo, `opt.rows[${kr}].mode`, mode)
            })

            //refresh
            vo.refresh()

            //isModified
            vo.isModified = true

        },

        showVeCgrupsToggleItemEnableByName: function(name) {
            // console.log('showVeCgrupsToggleItemEnableByName', name)

            let vo = this

            //check, 名稱 '' 為合法名稱(同 showVeCgrupsToggleItemModeByName)
            if (typeof name !== 'string') {
                vo.$alert(`${vo.$t('cgrupEditNoName')}`, { type: 'error' })
                return
            }

            //rows
            let rows = get(vo, 'opt.rows', [])

            //krs, 精確同名之全部列(理由同 showVeCgrupsToggleItemModeByName)
            let krs = getRowIdxs(rows, 'name', name)

            //check
            if (size(krs) === 0) {
                vo.$alert(`${vo.$t('cgrupEditNoPemi')}`, { type: 'error' })
                return
            }

            //enable, 同名列狀態恆一致, 取第一列切換後套用全部
            let _enable = get(rows[krs[0]], 'enable', 'n')
            let enable = _enable === 'y' ? 'n' : 'y'
            // console.log('enable', enable)

            //set
            each(krs, (kr) => {
                set(vo, `opt.rows[${kr}].enable`, enable)
            })

            //refresh
            vo.refresh()

            //isModified
            vo.isModified = true

        },

        showVeCgrupsToggleItemsEnableAllYes: function() {
            // console.log('showVeCgrupsToggleItemsEnableAllYes')

            let vo = this

            //rows
            let rows = get(vo, 'opt.rows', [])
            // console.log('rows', rows)

            //rowsEff
            let rowsEff = vo.getDisplayData()
            // console.log('rowsEff', rowsEff)

            //toggle, 每個顯示中之列對其精確同名之全部列一併套用(getRowIdxs; 修前 kpRow[r.name] 只命中最後一個同名列, 全選後同名列不一致而被拒存)
            each(rowsEff, (r) => {
                each(getRowIdxs(rows, 'name', r.name), (kr) => {
                    set(vo, `opt.rows[${kr}].enable`, 'y')
                })
            })

            //refresh
            vo.refresh()

            //isModified
            vo.isModified = true

        },

        showVeCgrupsToggleItemsEnableAllNo: function() {
            // console.log('showVeCgrupsToggleItemsEnableAllNo')

            let vo = this

            //rows
            let rows = get(vo, 'opt.rows', [])
            // console.log('rows', rows)

            //rowsEff
            let rowsEff = vo.getDisplayData()
            // console.log('rowsEff', rowsEff)

            //toggle, 對精確同名之全部列一併套用(理由同 showVeCgrupsToggleItemsEnableAllYes)
            each(rowsEff, (r) => {
                each(getRowIdxs(rows, 'name', r.name), (kr) => {
                    set(vo, `opt.rows[${kr}].enable`, 'n')
                })
            })

            //refresh
            vo.refresh()

            //isModified
            vo.isModified = true

        },

        showVeCgrupsToggleItemsEnableAllInv: function() {
            // console.log('showVeCgrupsToggleItemsEnableAllInv')

            let vo = this

            //rows
            let rows = get(vo, 'opt.rows', [])
            // console.log('rows', rows)

            //rowsEff
            let rowsEff = vo.getDisplayData()
            // console.log('rowsEff', rowsEff)

            //toggle, 對精確同名之全部列一併套用(理由同 showVeCgrupsToggleItemsEnableAllYes; 同名列狀態一致, 各顯示列算出之反向值相同)
            each(rowsEff, (r) => {

                //enable
                let _enable = get(r, 'enable', 'n')
                let enable = _enable === 'y' ? 'n' : 'y'

                //set
                each(getRowIdxs(rows, 'name', r.name), (kr) => {
                    set(vo, `opt.rows[${kr}].enable`, enable)
                })

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

            //save按鈕第一行立刻釋放視覺鎖: 本對話框不打 API(只把設定序列化回傳頁面, 由清單頁儲存統一寫入), 重複觸發只重複 resolve 同一 promise(無作用),
            //故刻意不套 runSubmit; 打 API 之送出一律經 runSubmit 且不於 handler 解鎖 (ADR-025)
            msg.pm.resolve()

            //fire-and-forget, 不 await
            vo.doSave()

        },

        doSave: function() {

            let vo = this

            async function core() {

                //show loading
                vo.$ui.updateLoading(true)

                //delay
                await delay(300)

                //rows
                let rows = get(vo, 'opt.rows', [])
                // console.log('rows', rows)

                //無法無損表示之授權資料(R-AUTH-LOSSY-01, 主控複審 R4): 原字串含物件形式無法無損表示之格(getKpLossy)時一律不重寫——
                //列內容與開啟時相同 → 回傳原字串(未變更); 有任何變更 → 拒存並顯示固定訊息(對話框保持開啟, 可還原變更後關閉)
                if (size(vo.lossyNames) > 0) {
                    let cur = map(rows, (r) => ({ name: r.name, mode: r.mode, enable: r.enable }))
                    if (isEqual(cur, vo.itemsInit)) {
                        return vo.cgrupsOrig
                    }
                    vo.$ui.updateLoading(false) //showCheckYes 前關 loading（modal 阻斷期間避免 loading 疊在底下）
                    await vo.$dg.showCheckYes(fmtLossyMsg(vo.$t('authLossyBlocked'), vo.lossyNames))
                    return false
                }

                //同名多列(群組表之歷史同名, R-PRINCIPLE-00 d): 各列之 (mode, enable) 不全相同者無法以物件形式寫出(寫出任一列即靜默捨棄其他列之設定), 拒存並點名(對話框保持開啟); 全相同則寫出一次
                let namesDupBad = getDupRowsInconsistent(rows)
                if (size(namesDupBad) > 0) {
                    vo.$ui.updateLoading(false) //showCheckYes 前關 loading（modal 阻斷期間避免 loading 疊在底下）
                    await vo.$dg.showCheckYes(fmtWarn(vo.$t('warnDupRowsInconsistent'), { names: namesDupBad }))
                    return false
                }

                //kpGrup: 名稱為字串之列(含名稱 '' 與懸空之額外列)皆寫出, 不得丟棄啟用中之引用(R-PRINCIPLE-00 c／f; 修前以 isestr(name) 略過 '', 懸空引用則根本無列); 共用 putRowsToKp(unit-editorRows 往返不變式)
                //限制項(mode 缺或非法之啟用引用)仍為開啟時之「AND、啟用」者寫回原始 mode(vo.rawModeMap), 不寫成可當基底之合法 AND(否則停用該層唯一合法項後多給, R-PRINCIPLE-00 e)
                let kpGrup = Object.create(null)
                putRowsToKp(kpGrup, rows, vo.rawModeMap)
                // console.log('kpGrup', kpGrup)

                //鍵序無關授權(R-AUTH-MERGE-00 第 4 條: 結果與項目之儲存順序、物件鍵序、陣列元素序無關), 故不需保留原鍵序, 亦無整數式名稱易位之拒存

                //cgrups
                let cgrups = JSON.stringify(kpGrup)
                // console.log('cgrups', cgrups)

                return cgrups
            }

            //core
            core()
                .then((rows) => {

                    //拒存(無法無損表示之授權資料): 不 resolve、不關窗
                    if (rows === false) {
                        return
                    }

                    //resolve
                    vo.pm.resolve(rows)

                    //hide
                    vo.bShow = false

                })
                .catch((err) => {
                    console.log('doSave', err)
                    vo.$alert(vo.$t('anUnexpectedErrorOccurred'), { type: 'error' }) //§5.1: 非預期例外須告知, 不靜默吞 (失敗時 .then 不執行→視窗不關)
                })
                .finally(() => {

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

            //單例: 對話框開啟中再次開啟(如焦點留在開啟鈕時按 Enter)時, 舊階段之等待者視同關閉(reject('close window'), 同 clickClose;
            //對已結束者無作用), 否則其 promise 永久懸置 (ADR-025; 同 CheckYes / CheckYesNo)
            if (vo.pm) {
                vo.pm.reject('close window')
            }

            //pm
            vo.pm = genPm()

            //default
            vo.isModified = false

            //isEditable, user
            let isEditable = get(msg, 'isEditable', false)
            let user = get(msg, 'user', {})

            //cloneDeep
            user = cloneDeep(user)

            //cgrups
            let cgrups = get(user, 'cgrups', '')
            // console.log('cgrups', cgrups)

            //kpGrup, lossyNames(物件形式無法無損表示者, R-AUTH-LOSSY-01)
            let kpGrup = Object.create(null)
            let lossyNames = []
            let rawModeMap = Object.create(null) //限制項之原始 mode(getRawModeMap), 存檔時未改者原樣寫回
            if (isestr(cgrups)) {
                try {
                    let kpRaw = JSON5.parse(cgrups)
                    kpGrup = cvKpToObj(kpRaw, { hasMode: true })
                    lossyNames = getKpLossy(kpRaw)
                    rawModeMap = getRawModeMap(kpRaw)
                }
                catch (err) {
                    console.log('cgrups', cgrups)
                    console.log('err', err)
                }
            }
            // console.log('kpGrup', kpGrup)

            //items
            let items = map(vo.grups, (v) => {
                // console.log('grups v', v)

                //p
                let p = getOwn(kpGrup, v.name, null)
                // console.log('p', p)

                //name
                let name = v.name
                // console.log('name', name)

                //mode, enable: 與伺服端同解讀(getRefState: 啟用者 mode 取有效值〔缺/非法 → AND〕, 純量值 { "G1": "y" } 亦為啟用 AND; 停用者 mode 缺/非法顯示 OR)
                let { mode, enable } = getRefState(p)
                // console.log('mode', mode, 'enable', enable)

                //r
                let r = {
                    name,
                    mode,
                    enable,
                }
                // console.log('r', r)

                return r
            })

            //額外列: 啟用中而群組表查無列之引用(懸空, 含名稱 '')各一列附於表列之後, 名稱唯讀、mode／enable 可改(可改為停用以解除); 伺服端仍以其 mode 參與(內容全 n),
            //存檔若丟棄即放寬(R-PRINCIPLE-00 c／f). 停用之懸空引用無授權影響, 不產生額外列(存檔時照舊丟棄)
            items = [...items, ...getRefRowsExtra(kpGrup, vo.grups)]

            //warnText: 各列引用之衝突提示(R-PRINCIPLE-00 原則 3; 偵測同伺服端判準, getRefWarns 以原字串), 名稱儲存格左側之警告圖示與 tooltip; 同名多列各列皆出(ambiguous)
            let resWarn = getRefWarns(cgrups, vo.grups)
            each(items, (r) => {
                let codes = getOwn(resWarn.kpWarns, r.name, null)
                if (codes !== null) {
                    r.warnText = getItemWarnText(codes, r.name, vo.$t, 'warnKindGrup')
                }
            })
            // console.log('items', items)

            //lossyHint: 啟用而名稱非字串之項目(noName)無列可掛, 於內容區最上方提示(存檔被拒, 見 doSave 之 lossyNames)
            let namesNoName = resWarn.byCode.noName
            vo.lossyHint = size(namesNoName) > 0 ? fmtWarn(vo.$t('warnRefNoName'), { names: namesNoName }) : ''
            vo.lossyHintTitle = size(namesNoName) > 0 ? fmtLossyMsg(vo.$t('authLossyBlocked'), lossyNames) : ''

            //save
            vo.isEditable = isEditable
            vo.user = user
            vo.items = items

            //存檔依據(非響應式): 原字串、有損名稱、開啟時之列內容(含額外列)
            vo.cgrupsOrig = cgrups
            vo.lossyNames = lossyNames
            vo.rawModeMap = rawModeMap
            vo.itemsInit = map(items, (r) => ({ name: r.name, mode: r.mode, enable: r.enable }))

            //genOpt
            vo.genOpt()

            //firstLoading
            vo.firstLoading = false

            //bShow
            vo.bShow = true

            return vo.pm
        },

    }
}
</script>

<style scoped>
</style>
