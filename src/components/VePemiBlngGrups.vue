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

                    <!-- 資料已被更新提示(R-PRINCIPLE-00 原則 7): 開框後他人或外部同步改了群組表, 本視窗之草稿與基準維持開框時之版本、不重建, 存檔將被伺服端拒收; 以 v-for 渲染(無提示時不渲染任何節點) -->
                    <div
                        v-for="ks in ((staleNotice || subjectNotice) ? 1 : 0)"
                        :key="`stale-${ks}`"
                        data-fmid="pemi-blng-grups-banner-stale"
                        style="padding:5px 15px; border-top:1px solid #ddd; background:#FFE0B2; color:#444; font-size:0.8rem; overflow-wrap:anywhere;"
                    >
                        <img style="vertical-align:sub; width:16px; height:16px; margin-right:4px;" :src="$ui.getIcon('warning')" />
                        <span>{{ $t('staleDraftNoticeDialog') }}</span>
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
                                <!-- 警告圖示: 該列群組之 cpemis 有衝突時於「所屬權限名稱」儲存格最左顯示, 理由與版面同 VeGrupBlngUsers 該處註解(無警告者與修前同一節點) -->
                                <div
                                    style="display:flex; align-items:center; height:100%;"
                                    v-if="props.key==='pemisNames' && props.row.warnText"
                                >
                                    <span style="flex:0 0 auto; display:flex; align-items:center;" :title="props.row.warnText"><img style="vertical-align:sub; width:16px; height:16px; margin-right:4px;" :src="$ui.getIcon('warning')" /></span>
                                    <RelationChips
                                        style="flex:1 1 auto;"
                                        :items="props.row.pemis"
                                        :editable="isEditable"
                                        :popupTitle="$t('belongPemisNames')"
                                        :tooltipAll="$t('chipsShowAll')"
                                        :labelContent="'modeSelect'"
                                        @input="(item)=>{showVePemiBlngGrupsToggleItemModeByName(props.row.name, item, props.row.id)}"
                                    ></RelationChips>
                                </div>
                                <RelationChips
                                    v-else-if="props.key==='pemisNames'"
                                    :items="props.row.pemis"
                                    :editable="isEditable"
                                    :popupTitle="$t('belongPemisNames')"
                                    :tooltipAll="$t('chipsShowAll')"
                                    :labelContent="'modeSelect'"
                                    @input="(item)=>{showVePemiBlngGrupsToggleItemModeByName(props.row.name, item, props.row.id)}"
                                ></RelationChips>
                                <input v-else-if="props.key==='enable'" type="checkbox" :checked="props.value === 'y'" @click="showVePemiBlngGrupsToggleItemEnableByName(props.row.name, props.row.id)" :disabled="!isEditable" />
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
import join from 'lodash-es/join.js'
import sortBy from 'lodash-es/sortBy.js'
import cloneDeep from 'lodash-es/cloneDeep.js'
import genPm from 'wsemi/src/genPm.mjs'
import haskey from 'wsemi/src/haskey.mjs'
import delay from 'wsemi/src/delay.mjs'
import iseobj from 'wsemi/src/iseobj.mjs'
import isestr from 'wsemi/src/isestr.mjs'
import eachOwn from '../js/eachOwn.mjs'
import getOwn from '../js/getOwn.mjs'
import cvKpToObj from '../js/cvKpToObj.mjs'
import getKpLossy from '../js/getKpLossy.mjs'
import fmtLossyMsg from '../js/fmtLossyMsg.mjs'
import pairRowsToSnapshot from '../js/pairRowsToSnapshot.mjs'
import { makeBaseline } from '../js/rowDigest.mjs'
import { isDraftStale, planDialogSync, checkSubject } from '../js/draftSync.mjs'
import { applySavedRows } from '../js/applySaved.mjs'
import { isCellEditing, bindCellEditingStopRetry } from '../js/cellEditing.mjs'
import { makeRowStates, getChangedIdx, buildRowsSend } from '../js/relDialogSend.mjs'
import { getRefState, getRawModeMap, putRefEntry } from '../js/editorRefRows.mjs'
import { getRefWarns, getRefWarnText } from '../js/getAuthWarn.mjs'
import WDialog from 'w-component-vue/src/components/WDialog.vue'
import WButtonCircle from 'w-component-vue/src/components/WButtonCircle.vue'
import WAggridVue from 'w-aggrid-vue/src/components/WAggridVue.vue'
import RelationChips from './RelationChips.vue'


export default {
    components: {
        WDialog,
        WButtonCircle,
        WAggridVue,
        RelationChips,
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
            ownSaving: false, //本視窗自己之存檔已送出(成功後視窗隨即關閉): 自己之寫入所致之推播(grups 表更新)不是「他人更新」, watch 不得據以提示; 每次 show() 歸零, 存檔失敗時歸零

            pemi: null,

            //baseline, rowStates: 開框(show)時綁定之草稿基準(F-26, R-BASELINE-01), 之後 store 推播變新不更新, 每次 show() 重新綁定;
            //baseline 為草稿所依據之那份群組列之逐列內容指紋, 存檔隨 updateGrups 第 2 參送伺服端; rowStates 為開框時各列之歸屬狀態, 存檔時判定使用者有無變更該列
            baseline: null,
            rowStates: null,
            staleNotice: false, //有未存編輯(含開啟中之儲存格編輯器)時收到推播、且群組表已異於本視窗載入時之基準(R-PRINCIPLE-00 原則 7、10): true 時顯示「資料已被更新」提示; 每次 show() 歸零
            subject: null, //開框時之主體摘要 { id, name, saved }(第 114 項, R-SUBJECT-ID-01): 本對話框以**名稱**引用權限(群組 cpemis 的鍵是權限名稱), 存檔時以 id 驗主體仍是同一個實體(未被刪除、改名、刪除後以同名重建)
            subjectNotice: false, //主體(權限)於開框後已被刪除、改名或以同名重建(id 不同): true 時顯示「資料已被更新」提示, 存檔將被拒收; 每次 show() 歸零
            systemProcing: false, //程式端重建對話框內容期間為 true, 用於排除非使用者操作之 rowsChange (見 $ui.markDataReload; 開框中因推播重建時須用)

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
    watch: {
        //store 之群組表或權限(主體)表被推播更新(整表以新陣列取代): 處置見 syncStore
        grups: function() {
            this.syncStore()
        },
        pemis: function() {
            this.syncStore()
        },
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

                //ks, 本列自己可改的(是否使用)在左, 由其他權限帶來的(所屬權限名稱)在右; 合併模式併入 pemisNames 欄之本項 chip(RelationChips), 不再獨立成欄
                let ks = [
                    'name',
                    'enable',
                    'pemisNames',
                ]
                // console.log('ks', ks)

                //kpHead
                let kpHead = {
                    'name': vo.$t('grupName'),
                    'enable': vo.$t('operEnable'),
                    'pemisNames': vo.$t('belongPemisNames'),
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
                        //name 一律唯讀: 理由同 VeGrupBlngUsers——doSave 只回寫 cpemis、不讀列上之 name, 改名會被靜默丟棄。
                        'name': false,
                        'enable': false,
                    },
                    kpHeadWidth: {
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
                        'enable': 'text',
                    },
                    // kpHeadCheckBox: {
                    //     'name': true,
                    // },
                    kpHeadFocusHighlight: { //兩欄之儲存格內皆有自己的控制項(chip 之模式下拉、勾選框), 焦點框徒增干擾故關閉; 控制項取得焦點時之焦點框由 w-aggrid-vue 2.0.87 之 :focus-within 規則一併擋下
                        'pemisNames': false,
                        'enable': false,
                    },
                    rowsChange: (rs) => {
                        // console.log('rowsChange', rs)
                        // console.log('rowsChange cloneDeep(vo.opt.rows)', cloneDeep(vo.opt.rows))

                        //check
                        if (!vo.syncState || vo.firstLoading || vo.firstSetting || vo.systemProcing) {
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

        getDisplayRows: function() {
            let vo = this

            //cmp
            let cmp = get(vo, '$refs.rftable')
            // console.log('cmp', cmp)

            //getDisplayData 只回傳顯示中之欄位(name／enable／pemisNames), 不含 id; 批次勾選須以 id 定位列(群組表可有歷史同名), 故另以 ag-grid api 取篩選排序後之完整列(含 id), 同 VeGrupBlngUsers
            let api = cmp.getApi()
            let rows = []
            api.forEachNodeAfterFilterAndSort((node) => {
                rows.push(node.data)
            })

            return rows
        },

        fltKpPemi: function(kp) {
            // console.log('fltKpPemi', kp)

            let vo = this

            //_kp
            let _kp = Object.create(null) //無原型: 鍵為使用者資料, 不得命中 constructor 等原型鍵(規則帳本 R-KEY-01)
            each(vo.pemis, (v, k) => {
                _kp[v.name] = true
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

        genItems: function(pemi, grups) {
            // console.log('genItems', pemi, grups)

            let vo = this

            //items
            let items = map(grups, (g) => {

                //kpPemi, 空字串(新增列之 funNew 預設值)與壞 JSON 視為空容器, 同 VeCpemis／清單頁／伺服端(R-REL-PARSE-01: 任一列解碼失敗不得使對話框打不開)
                let kpPemi = Object.create(null)
                try {
                    kpPemi = cvKpToObj(JSON5.parse(g.cpemis), { hasMode: true })
                }
                catch (err) {}
                // console.log(g.name, 'kpPemi', kpPemi)

                //fltKpPemi
                kpPemi = vo.fltKpPemi(kpPemi)
                // console.log(g.name, 'kpPemi(fltKpPemi)', kpPemi)

                //mode, enable, pemis
                let mode = 'OR'
                let enable = 'n'
                let pemis = []
                eachOwn(kpPemi, (v, k) => {
                    // console.log(k, 'v', v)

                    //st, 此為使用者cpemis內設定, 可為y或n, 僅提取y, 再判斷此使用者是否有使用此pemi; 與伺服端同解讀(getRefState, 理由同 VeGrupBlngUsers.genItems)
                    let st = getRefState(v)
                    if (st.enable !== 'y') {
                        return true //跳出換下一個
                    }
                    // console.log(k, 'st', st)

                    //b, 使用者是否擁有指定權限群組
                    let b = k === pemi.name
                    // console.log(k, 'b', b)

                    //mode, isActive
                    if (b) {
                        enable = 'y'
                        mode = st.mode //使用使用者給予cpemis內指定權限群組之合併權限模式
                        // console.log('使用使用者給予cpemis內指定權限群組之合併權限模式 pemi', pemi)
                    }

                    //push, 僅供 RelationChips 顯示(name／mode／enable); 存檔不讀本陣列(doSave 以 putRefEntry 自快照字串只改本權限一項)
                    pemis.push({
                        name: k,
                        mode: st.mode,
                        isActive: 'y',
                        enable: b ? 'y' : 'n', //給render使用
                    })

                })
                // console.log(g.name, 'pemis', pemis)

                //pemisNames
                let pemisNames = map(pemis, 'name')
                pemisNames = join(pemisNames, ' ')
                // console.log(g.name, 'pemisNames', pemisNames)

                //warnText: 該群組 cpemis 之衝突提示(理由同 VeGrupBlngUsers.genItems; revRows 不回寫本欄, 警告反映開啟時之已儲存資料)
                let resWarn = getRefWarns(g.cpemis, vo.pemis)
                let warnText = resWarn.hasWarn ? getRefWarnText(resWarn, vo.$t, 'warnKindPemi') : ''

                return {
                    id: g.id, //列識別: 存檔時以 id(並驗 name)配對存檔當下之群組快照, 不以列索引(R-REL-PAIR-01)
                    name: g.name,
                    pemisNames,
                    mode,
                    enable,
                    // kpPemi,
                    pemis,
                    warnText,
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

            //以列身分(id)配對: 對話框之列 ↔ 目前 store 中同一個群組(R-REL-PAIR-01; 不得以列索引配對——store 於對話框開啟期間可被更新〔他人增刪、改 order〕而錯位), 並驗 name 相同(改名視為過期)
            //krs, grupsRev: 對話框有列且 store 仍存在之群組(grupsRev[k] 即第 krs[k] 列所配到者; 配對不到者不更新其顯示, 存檔時由 doSave 整次拒存)
            let { krs, matched: grupsRev } = pairRowsToSnapshot(rows, grups, { verifyKeys: ['name'] })

            //grups
            grups = map(grupsRev, (g, kg) => {
                let row = get(rows, krs[kg], {})

                //kpPemi, 空字串與壞 JSON 視為空容器(R-REL-PARSE-01)
                let kpPemi = Object.create(null)
                try {
                    kpPemi = cvKpToObj(JSON5.parse(g.cpemis), { hasMode: true })
                }
                catch (err) {}
                // console.log(g.name, 'kpPemi', kpPemi)

                //fltKpPemi
                kpPemi = vo.fltKpPemi(kpPemi)
                // console.log(g.name, 'kpPemi(fltKpPemi)', kpPemi)

                //mode
                let mode = get(row, 'mode', '')
                if (mode !== 'OR' && mode !== 'AND') {
                    console.log(`非預期: mode應該皆已指定不應觸發`, mode)
                    mode = 'OR'
                }
                // console.log(g.name, 'mode', mode)

                //enable
                let enable = get(row, 'enable', '')
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
                    if (Object.prototype.hasOwnProperty.call(kpPemi, pemi.name)) {
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

            //update pemisNames, pemis, items 與 krs 同序(item k 對應對話框第 krs[k] 列)
            each(items, (r, k) => {
                // name: g.name,
                // pemisNames,
                // mode,
                // enable,
                // pemis,

                //set
                let kr = krs[k]
                set(vo, `opt.rows[${kr}].pemisNames`, r.pemisNames)
                set(vo, `opt.rows[${kr}].pemis`, r.pemis)
                // console.log('vo.opt.rows[kr]', cloneDeep(vo.opt.rows[kr]))

            })

            //refresh
            vo.refresh()

        },

        showVePemiBlngGrupsToggleItemModeByName: function(name, mode, id) {
            // console.log('showVePemiBlngGrupsToggleItemModeByName', name, mode, id)

            let vo = this

            //check
            if (!isestr(name)) {
                vo.$alert(`${vo.$t('pemiBlngEditNoName')}`, { type: 'error' })
                return
            }

            //rows
            let rows = get(vo, 'opt.rows', [])

            //find, 有 id 以 id 找列(群組表可有歷史同名〔外部同步〕, 以 name 會改到第一個同名群組、存檔依 id 寫入錯列; 同 VeGrupBlngUsers); 未給 id 之既有 $dg 呼叫端維持以 name 找
            let r = null
            let kr = null
            each(rows, (v, k) => {
                if (isestr(id) ? get(v, 'id', '') === id : get(v, 'name', '') === name) {
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

        showVePemiBlngGrupsToggleItemEnableByName: function(name, id) {
            // console.log('showVePemiBlngGrupsToggleItemEnableByName', name, id)

            let vo = this

            //check
            if (!isestr(name)) {
                vo.$alert(`${vo.$t('pemiBlngEditNoName')}`, { type: 'error' })
                return
            }

            //rows
            let rows = get(vo, 'opt.rows', [])

            //find, 理由同 showVePemiBlngGrupsToggleItemModeByName: 有 id 以 id 找列
            let r = null
            let kr = null
            each(rows, (v, k) => {
                if (isestr(id) ? get(v, 'id', '') === id : get(v, 'name', '') === name) {
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

            //kpRow, 以群組 id 為鍵(群組表可有歷史同名, 以 name 會使同名者互相錯位、存檔依 id 寫入錯列; 同 VeGrupBlngUsers)
            let kpRow = Object.create(null)
            each(rows, (r, kr) => {
                kpRow[r.id] = kr
            })

            //rowsEff, 篩選排序後之完整列(含 id; getDisplayData 不含 id)
            let rowsEff = vo.getDisplayRows()
            // console.log('rowsEff', rowsEff)

            //toggle
            each(rowsEff, (r) => {

                //kr
                let kr = kpRow[r.id]

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

            //kpRow, 以群組 id 為鍵(群組表可有歷史同名, 以 name 會使同名者互相錯位、存檔依 id 寫入錯列; 同 VeGrupBlngUsers)
            let kpRow = Object.create(null)
            each(rows, (r, kr) => {
                kpRow[r.id] = kr
            })

            //rowsEff, 篩選排序後之完整列(含 id; getDisplayData 不含 id)
            let rowsEff = vo.getDisplayRows()
            // console.log('rowsEff', rowsEff)

            //toggle
            each(rowsEff, (r) => {

                //kr
                let kr = kpRow[r.id]

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

            //kpRow, 以群組 id 為鍵(群組表可有歷史同名, 以 name 會使同名者互相錯位、存檔依 id 寫入錯列; 同 VeGrupBlngUsers)
            let kpRow = Object.create(null)
            each(rows, (r, kr) => {
                kpRow[r.id] = kr
            })

            //rowsEff, 篩選排序後之完整列(含 id; getDisplayData 不含 id)
            let rowsEff = vo.getDisplayRows()
            // console.log('rowsEff', rowsEff)

            //toggle
            each(rowsEff, (r) => {

                //kr
                let kr = kpRow[r.id]

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

        syncStore: function() {
            //store 之群組表或權限(主體)表被推播更新(整表以新陣列取代)時的處置(R-PRINCIPLE-00 原則 10; 規則帳本 R-DRAFT-KEEP-01 規則 11、12; draftSync.planDialogSync):
            //  ① 無未存修改(含無開啟中之儲存格編輯器)而群組表已異於載入基準 → 以新資料重建對話框內容並更新基準(對話框開而未編輯時不停在過期資料上; 修 (b));
            //  ② 有未存修改或開啟中之編輯器 → 保留草稿、凍結基準, 顯示「資料已被更新」提示, 存檔時由伺服端拒收(saveStale);
            //  ③ 自己存檔進行中所致之推播不是他人更新 → 不重建、不提示;
            //  ④ 主體(權限)已被刪除、改名或以同名重建(第 114 項) → 不重建(無從續編), 顯示同一提示, 存檔時前端與之比對 id 拒收.
            let vo = this
            if (!vo.bShow || !Array.isArray(vo.baseline)) {
                return
            }
            let sc = checkSubject({ subject: vo.subject, rows: vo.pemis })
            vo.subjectNotice = sc !== 'ok'
            let act = planDialogSync({
                show: true,
                storeChanged: true,
                stale: isDraftStale({ keyTable: 'grups', rows: vo.grups, baseline: vo.baseline }),
                dirty: vo.isModified === true,
                editing: isCellEditing(get(vo, '$refs.rftable', null)),
                saving: vo.ownSaving === true,
            })
            if (act === 'rebuild') {
                if (sc === 'ok') {
                    vo.rebuildDialog()
                }
            }
            else if (act === 'keep') {
                vo.staleNotice = true
            }
        },

        rebuildDialog: function() {
            //開框中以目前 store 重建對話框內容與基準(無未存修改時; 同 show() 之內容組裝, 不動 pm／bShow／isEditable／subject)
            let vo = this
            let p = vo.pemis.find((r) => r.id === get(vo, 'subject.id', ''))
            let pemi = { ...vo.pemi, ...cloneDeep(p) }
            let grups = cloneDeep(vo.grups)
            let baseline = makeBaseline(grups, 'grups')
            let items = vo.genItems(pemi, grups)
            let rowStates = makeRowStates(items)

            //markDataReload: 重建 opt 屬程式端寫入, 其後非同步觸發之 rowsChange 不得視為使用者變更
            vo.$ui.markDataReload(vo)

            vo.pemi = pemi
            vo.items = items
            vo.baseline = baseline
            vo.rowStates = rowStates
            vo.isModified = false
            vo.staleNotice = false
            vo.genOpt()
            vo.$nextTick(() => {
                vo.bindEditing()
            })
        },

        bindEditing: function() {
            //第 115 項(R-DRAFT-KEEP-01 規則 10): 儲存格編輯器開啟中視為有草稿(syncStore 以 ag-grid 的 getEditingCells 判定); 編輯結束(提交、Esc、失焦)時補做保留期間跳過之重建
            let vo = this
            bindCellEditingStopRetry(() => get(vo, '$refs.rftable', null), () => {
                vo.afterEditing()
            })
        },

        afterEditing: function() {
            //儲存格編輯結束: 無未存修改而表於編輯期間已變新者, 補上一次同步處置(重建); 有未存修改者維持保留
            let vo = this
            if (vo.isModified !== true) {
                vo.syncStore()
            }
        },

        saveGrups: async function(rows, baseline) {
            // console.log('method saveGrups', rows, baseline)

            let vo = this

            //3) updateGrups, 各自 catch + okX 旗標短路 (canonical 五段結構; 空清單檢查已上移至 doSave core())
            //第 2 參 { baseline, returnRows }: baseline 為開框時綁定之草稿基準(由 doSave 於流程開頭取得並傳入, 不於此讀 vo.baseline——存檔進行中若再次 show() 會換成新草稿之基準); 伺服端比對「本次將寫入之列」之庫內版本, 草稿之後被改過即整次拒收 saveStale(失敗路徑沿用下方 catch 顯示語系文字);
            //returnRows: 成功時回傳寫入後之列(鎖內新鮮讀取), 立即 commit 進 store(規格第 8 節; R-SAVED-ROWS-01), 其後再開此視窗時基準即為最新, 不會被自己上一次之存檔誤擋
            let okSave = false
            vo.ownSaving = true //自己之寫入所致之推播不提示(成功路徑維持至視窗關閉; show() 歸零)
            await vo.$fapi.updateGrups(rows, { baseline, returnRows: true })
                .then((res) => {
                    okSave = true
                    applySavedRows('grups', res, (t, rs) => vo.$store.commit(vo.$store.types.UpdateTableData, { tableName: t, data: rs, source: 'savedRows' }))
                })
                .catch(async (err) => {
                    vo.ownSaving = false //失敗(含 saveStale 被拒): 視窗仍開著, 恢復監看
                    vo.$ui.updateLoading(false) //showCheckYes 前關 loading（modal 阻斷期間避免 loading 疊在底下）
                    await vo.$dg.showCheckYes(`${vo.$t('grupSaveGrupsFail')}: ${vo.$tErr(err)}`)
                })
            if (!okSave) {
                return false //回報失敗: 呼叫端 doSave 據此不關閉對話框, 保留未存變更供修正後重按儲存
            }

            //alert（showCheckYes 前關 loading，避免 modal 等待期間 loading 疊在底下）
            vo.$ui.updateLoading(false)
            await vo.$dg.showCheckYes(vo.$t('grupSaveGrupsSuccess'), { type: 'success' })

            return true
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
            //WDialog 內建儲存鈕之 promiseUnlock 鎖交由 doSave 之 runSubmit 於請求結束時釋放, 不於此解鎖: 請求期間儲存鈕之滑鼠與鍵盤 Enter 皆擋 (ADR-025;
            //原第一行即 msg.pm.resolve(), 鎖立即解除, 焦點留在儲存鈕時連按 Enter 可送出 2 次)
            let vo = this
            vo.doSave({ pm: msg.pm })
        },

        doSave: function(opt = {}) {

            let vo = this

            //pmDlg: 本次存檔流程所屬之對話框 promise(外審 sol R2): 存檔進行中(如 await delay)若再次 show() 開啟另一權限, vo.pm 會被換成新視窗之 promise,
            //舊流程完成時只能 resolve 自己的 promise、且不得關閉新視窗(見下方 .then)
            let pmDlg = vo.pm

            async function core(unlockBtn) {

                //1) 事先檢測 (所有同步檢查在開 loading 之前, 空清單不應先閃 loading); 訊息框前以 unlockBtn() 釋放儲存鈕之 promiseUnlock 鎖:
                //按鈕鎖只涵蓋請求期間, 結果訊息框出現時按鈕已恢復(與打 API 之路徑一致) (ADR-025)
                let rows = get(vo, 'opt.rows', [])
                // console.log('rows', rows)
                if (size(rows) === 0) {
                    unlockBtn()
                    await vo.$dg.showCheckYes(`${vo.$t('grupSaveGrupsEmpty')}`)
                    return
                }

                //草稿基準與開框時各列之歸屬狀態(F-26, R-BASELINE-01): 於流程開頭(任何 await 之前)取得並以區域變數持有——存檔進行中若再次 show() 會把 vo.baseline／vo.rowStates 換成新草稿之值, 舊草稿之列不可配新草稿之基準
                let baseline = cloneDeep(vo.baseline)
                let rowStates = vo.rowStates

                //pemiName: 被編輯之權限名稱, 同樣於流程開頭(任何 await 之前)取得——等待後才讀 vo.pemi.name 會讀到新開啟之實體, 把舊草稿之歸屬寫成指派新實體(外審 sol R2)
                let pemiName = get(vo, 'pemi.name', '')

                //subject: 開框時之主體摘要 { id, name, saved }, 同樣於流程開頭取得並持有. isSubjectOk: 主體(權限)於存檔當下仍是開框時那一個實體(第 114 項, R-SUBJECT-ID-01; 原則 3、6):
                //本對話框以名稱引用權限(群組 cpemis 的鍵是權限名稱)而不驗主體身分——開框後權限被刪除、改名, 或刪除後以同名重建(id 不同), 引用會靜默指向新實體(被同名新資料接管); 故以 id 比對存檔當下之權限表, 不符即整次拒存(零寫入)並提示重新載入
                let subject = vo.subject
                let isSubjectOk = () => checkSubject({ subject, rows: vo.pemis }) === 'ok'
                let rejectSubject = async () => {
                    vo.$ui.updateLoading(false)
                    await vo.$dg.showCheckYes(vo.$t('relSubjectChangedPemi').split('{name}').join(get(subject, 'name', '')))
                    return false
                }
                if (!isSubjectOk()) {
                    unlockBtn()
                    return await rejectSubject()
                }

                //1b) 無法無損表示之授權資料(R-AUTH-LOSSY-01, 主控複審 R4): 該列群組之 cpemis 含物件形式無法無損表示之格(getKpLossy)者, 本對話框不得改寫其字串——
                //本對話框所管之歸屬／模式有變更 → 整次儲存拒絕並點名(原子, 其餘列亦不寫); 未變更 → 該列字串逐字元不動(見下方 kpLossyIdx)
                //群組列之快照只取這一次: 有損檢查之值即下方寫入之值(外審 sol#2: 兩次讀取之間 store 可能被伺服器推送更新, 檢查與寫入看到不同資料)
                let grups = cloneDeep(vo.grups)

                //1a) 以列身分(id, 並驗 name)配對快照(R-REL-PAIR-01, 主控 run02 F-24): 修前以開框時的列索引取快照列, store 於對話框開啟期間被更新(他人增刪、改 order)時關聯寫到另一個群組;
                //對話框有列所對應的群組已被刪除或改名者 → 整次拒存(原子, 不寫任何列)並提示重新整理, 不得退而配到其他列
                let { pairs, missing } = pairRowsToSnapshot(rows, grups, { verifyKeys: ['name'] })
                if (size(missing) > 0) {
                    unlockBtn()
                    await vo.$dg.showCheckYes(fmtLossyMsg(vo.$t('relationRowsStale'), map(missing, 'name')))
                    return false
                }

                //1a2) 使用者於本次編輯相對「開框時」有變更之列(F-26, S4; 外審 B.1): 對話框之列是開框時之草稿值, 他人於開框後改過而使用者未碰之列, 不得以草稿值改寫(覆蓋他人之變更);
                //故只有 kpChanged 之列才對存檔當下快照之字串套用變更(下方 putRefEntry), 其餘列(含開框後新增而不在對話框內者)一律原樣帶回存檔當下 store 之版本(逐字不動), 亦不納入下方有損檢查
                let kpChanged = getChangedIdx(rows, rowStates)

                let kpLossyIdx = Object.create(null)
                let kpRawModes = Object.create(null) //列索引 → 該列快照字串之限制項原始 mode(getRawModeMap), 供下方 putRefEntry 寫回未改之限制項
                let lossyNames = []
                each(rows, (r, kr) => {
                    if (kpChanged[kr] !== true) {
                        return true //使用者未變更: 原樣帶回, 不檢查有損亦不需 rawModeMap
                    }
                    let g = pairs[kr]
                    let kpRaw = null
                    try {
                        kpRaw = JSON5.parse(get(g, 'cpemis', ''))
                    }
                    catch (err) {
                        return true //無法解析者交由下方原流程處理
                    }
                    kpRawModes[kr] = getRawModeMap(kpRaw)
                    if (size(getKpLossy(kpRaw)) === 0) {
                        return true //跳出換下一個
                    }
                    kpLossyIdx[kr] = true
                    let p = getOwn(cvKpToObj(kpRaw, { hasMode: true }), pemiName, null)
                    let was = get(p, 'isActive', '') === 'y'
                    let wasMode = was ? get(p, 'mode', '') : ''
                    let now = get(r, 'enable', '') === 'y'
                    let nowMode = now ? get(r, 'mode', '') : ''
                    if (was !== now || wasMode !== nowMode) {
                        lossyNames.push(get(g, 'name', ''))
                    }
                })
                if (size(lossyNames) > 0) {
                    unlockBtn()
                    await vo.$dg.showCheckYes(fmtLossyMsg(vo.$t('authLossyBlocked'), lossyNames))
                    return false
                }

                //2) 確定打 API 才開 loading
                vo.$ui.updateLoading(true)

                //delay
                await delay(300)

                //主體身分複驗(第 114 項): 開 loading 與等待期間 store 可能再被推播更新, 送出前再比對一次
                if (!isSubjectOk()) {
                    return await rejectSubject()
                }

                //grups: 沿用 1b 之快照(見上)

                //kpNewCpemis: 列索引 → 該列新 cpemis 字串; 只收「使用者有變更(kpChanged)、非有損、且 putRefEntry 判定本項確有變更」者, 其餘一律不收(由 buildRowsSend 原樣帶回)
                let kpNewCpemis = Object.create(null)
                each(rows, (r, kr) => {

                    //使用者未變更之列(kpChanged)與有損列(kpLossyIdx): 歸屬未變更, 字串逐字元不動
                    if (kpChanged[kr] !== true || kpLossyIdx[kr] === true) {
                        return true //跳出換下一個
                    }

                    //g, 以列身分配對之快照列(見 1a)
                    let g = pairs[kr]

                    //cpemis
                    let cpemis = get(g, 'cpemis', '')

                    //kpPemi, 空字串與壞 JSON 視為空容器(R-REL-PARSE-01)
                    let kpPemi = Object.create(null)
                    try {
                        kpPemi = cvKpToObj(JSON5.parse(cpemis), { hasMode: true })
                    }
                    catch (err) {}
                    // console.log('kpGrup', kpGrup)

                    //kpPemiNew: 只改本權限對應之一項(依列之 enable／mode), 其餘引用項(含懸空、名稱 ''、mode 缺/非法、停用項、純量值)原樣保留, 授權效果不變(putRefEntry; 理由同 VeGrupBlngUsers.doSave)
                    //本項未變更 → 回 false, 字串逐字元不動; 其餘項中之限制項寫回原始 mode(kpRawModes[kr]; 理由同 VeGrupBlngUsers.doSave)
                    let kpPemiNew = Object.create(null)
                    if (putRefEntry(kpPemiNew, kpPemi, pemiName, get(r, 'enable', ''), get(r, 'mode', ''), kpRawModes[kr])) {

                        //cpemis(鍵序無關授權, R-AUTH-MERGE-00 第 4 條: 不需保留原鍵序, 亦無整數式名稱易位之拒存)
                        kpNewCpemis[kr] = JSON.stringify(kpPemiNew)

                    }

                })

                //grupsNew: 送出之整表＝存檔當下 store 快照(grups)之全部列、依其 order 序(F-26 c0, S4): 修前只送「對話框之列」, 開框後他人／外部同步新增之列被伺服端整表 diff 刪除;
                //只有 kpNewCpemis 之列換其 cpemis 一欄, 其餘列(使用者未變更者、有損列、開框後新增而不在對話框內者)與快照同一物件、逐字不動(帶回存檔當下 store 版本以免誤刪／誤改他人之列; 但載入基準仍是開框時之版本, 伺服端表級比對〔R-BASELINE-01, run11〕會因開框後他人之任何變更而整次拒收 saveStale)
                let grupsNew = buildRowsSend(grups, pairs, kpNewCpemis, 'cpemis')

                // //check
                // if (size(grupsNew) === 0) {
                //     return
                // }

                //saveGrups, 失敗時回 false: 失敗提示已由 saveGrups 顯示, 此處不關閉對話框(保留未存變更供重按儲存)
                let okSave = await vo.saveGrups(grupsNew, baseline)
                if (!okSave) {
                    return false
                }

            }

            //runSubmit: 對話框儲存流程(至結果訊息框關閉, 成功時含關閉對話框)進行中再觸發即略過; opt.pm 為對話框儲存鈕之 promiseUnlock 鎖,
            //於請求結束(updateLoading(false))時釋放. 對話框之 promise(vo.pm)與開關(bShow)不變: 成功才 resolve 並關閉, 失敗保持開啟可重按儲存 (ADR-025)
            return vo.$ui.runSubmit('savePemiBlngGrups', (unlockBtn) => {
                return core(unlockBtn)
                    .then((rows) => {

                        //存檔失敗: 不 resolve、不關窗(規格「若寫入失敗…對話框不關閉，可修正後重按儲存」; 舊版於此無條件關窗, 2026-09-17 審計查出)
                        if (rows === false) {
                            return
                        }

                        //resolve
                        pmDlg.resolve(rows)

                        //hide
                        if (vo.pm === pmDlg) { //期間若已 show() 開啟另一視窗, 舊流程不得關閉新視窗
                            vo.bShow = false
                        }

                    })
                    .catch((err) => {
                        console.log('doSave', err)
                        vo.$alert(vo.$t('anUnexpectedErrorOccurred'), { type: 'error' }) //§5.1: 非預期例外須告知, 不靜默吞 (失敗時 .then 不執行→視窗不關)
                    })
                    .finally(() => {

                        //hide loading
                        vo.$ui.updateLoading(false)

                    })
            }, opt)

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
            vo.staleNotice = false
            vo.subjectNotice = false
            vo.ownSaving = false

            //isEditable, pemi
            let isEditable = get(msg, 'isEditable', false)
            let pemi = get(msg, 'pemi', {})

            //grup
            pemi = cloneDeep(pemi)

            //subject: 開框時之主體摘要(第 114 項): 存檔時以 id 驗主體仍是同一個實體
            let subject = { id: get(pemi, 'id', ''), name: get(pemi, 'name', ''), saved: vo.pemis.some((r) => r.id === get(pemi, 'id', '')) }

            //grups
            let grups = cloneDeep(vo.grups)

            //baseline(F-26, R-BASELINE-01; 外審 B.1): 於生成 items 之同一處, 以 items 所依據之那份群組列(grups)計算並綁定為本次草稿之載入基準; 之後 store 推播變新不得更新它,
            //除非無未存修改時 syncStore 整個重建(存檔當下才由最新 store 取基準, 證明的是「store 新」而非「待存之編輯內容新」), 每次 show() 重新綁定. 摘要口徑與伺服端同一(寫入契約 grups, 經 rowDigest.makeBaseline／w-serv-orm buildBaseline)
            let baseline = makeBaseline(grups, 'grups')

            //items
            let items = vo.genItems(pemi, grups)

            //rowStates: 開框時各列之歸屬狀態(須在任何切換操作前由 items 記下; opt.rows 與 items 為同一份陣列, 切換會就地改 enable／mode), 供存檔時判定使用者有無變更該列
            let rowStates = makeRowStates(items)

            //save
            vo.isEditable = isEditable
            vo.pemi = pemi
            vo.subject = subject
            vo.items = items
            vo.baseline = baseline
            vo.rowStates = rowStates

            //genOpt
            vo.genOpt()

            //firstLoading
            vo.firstLoading = false

            //第 115 項: 對話框內之 ag-grid 綁「儲存格編輯結束」監聽
            vo.$nextTick(() => {
                vo.bindEditing()
            })

            //bShow
            vo.bShow = true

            return vo.pm
        },

    }
}
</script>

<style scoped>
</style>
