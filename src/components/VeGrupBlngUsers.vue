<template>
    <WDialog
        :show.sync="bShow"
        :title="isEditable?$t('grupBlngEditUsers'):$t('grupBlngEditUsersForDisplay')"
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
                            {{$t('grupBlngGrupNow')}}
                        </div>

                        <div style="font-size:1.3rem;">
                            {{grupName}}
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
                                @click="showVeGrupBlngUsersToggleItemsEnableAllYes"
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
                                @click="showVeGrupBlngUsersToggleItemsEnableAllNo"
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
                                @click="showVeGrupBlngUsersToggleItemsEnableAllInv"
                            ></WButtonCircle>

                            <div style="padding-left:4px;"></div>

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

                            <div style="padding-left:4px;"></div>

                        </template>

                    </div>

                    <!-- 資料已被更新提示(R-PRINCIPLE-00 原則 7): 開框後他人或外部同步改了使用者表, 本視窗之草稿與基準維持開框時之版本、不重建, 存檔將被伺服端拒收; 以 v-for 渲染(無提示時不渲染任何節點) -->
                    <div
                        v-for="ks in (staleNotice ? 1 : 0)"
                        :key="`stale-${ks}`"
                        data-fmid="grup-blng-users-banner-stale"
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
                                <!-- 警告圖示(R-PRINCIPLE-00 原則 3「提示」): 該列使用者之 cgrups 有衝突時(warnText, genItems 由 getRefWarns 取得)於儲存格最左顯示; 以外層 flex 容器與 RelationChips 並排,
                                     RelationChips 根元素寬＝儲存格寬−圖示寬, 其量測(v-domresize 監聽根元素尺寸)與「+K」溢出計算(可用寬取自根元素)不變; 無警告者不渲染外層容器與圖示, 與修前同一節點 -->
                                <div
                                    style="display:flex; align-items:center; height:100%;"
                                    v-if="props.key==='grupsNames' && props.row.warnText"
                                >
                                    <span style="flex:0 0 auto; display:flex; align-items:center;" :title="props.row.warnText"><img style="vertical-align:sub; width:16px; height:16px; margin-right:4px;" :src="$ui.getIcon('warning')" /></span>
                                    <RelationChips
                                        style="flex:1 1 auto;"
                                        :items="props.row.grups"
                                        :editable="isEditable"
                                        :popupTitle="$t('belongGrupsNames')"
                                        :tooltipAll="$t('chipsShowAll')"
                                        :labelContent="'modeSelect'"
                                        @input="(item)=>{showVeGrupBlngUsersToggleItemModeByName(props.row.name, item, props.row.id)}"
                                    ></RelationChips>
                                </div>
                                <RelationChips
                                    v-else-if="props.key==='grupsNames'"
                                    :items="props.row.grups"
                                    :editable="isEditable"
                                    :popupTitle="$t('belongGrupsNames')"
                                    :tooltipAll="$t('chipsShowAll')"
                                    :labelContent="'modeSelect'"
                                    @input="(item)=>{showVeGrupBlngUsersToggleItemModeByName(props.row.name, item, props.row.id)}"
                                ></RelationChips>
                                <input v-else-if="props.key==='enable'" type="checkbox" :checked="props.value === 'y'" @click="showVeGrupBlngUsersToggleItemEnableByName(props.row.name, props.row.id)" :disabled="!isEditable" />
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
import { isDraftStale } from '../js/draftSync.mjs'
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
            ownSaving: false, //本視窗自己之存檔已送出(成功後視窗隨即關閉): 自己之寫入所致之推播(users 表更新)不是「他人更新」, watch 不得據以提示; 每次 show() 歸零, 存檔失敗時歸零

            grup: null,

            //baseline, rowStates: 開框(show)時綁定之草稿基準(F-26, R-BASELINE-01), 之後 store 推播變新不更新, 每次 show() 重新綁定;
            //baseline 為草稿所依據之那份使用者列之逐列內容指紋, 存檔隨 updateUsers 第 2 參送伺服端; rowStates 為開框時各列之歸屬狀態, 存檔時判定使用者有無變更該列
            baseline: null,
            rowStates: null,
            staleNotice: false, //有未存編輯時收到推播、且使用者表已異於本視窗載入時之基準(R-PRINCIPLE-00 原則 7): true 時顯示「資料已被更新」提示; 每次 show() 歸零

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
        //store 之使用者表被推播更新(整表以新陣列取代): 本視窗不重建(草稿與基準維持開框時之版本, 見 show()). 此刻有未存編輯者, 若表已異於載入時之基準(任一列內容不同或列增刪; 僅 order／伺服器管理欄不同不算)
        //即顯示「資料已被更新」提示, 存檔時由伺服端以表雜湊拒收(saveStale); 無未存編輯者維持原行為(靜默, 存檔時才由伺服端拒收). 唯讀檢視無存檔, 不提示
        users: function(rows) {
            let vo = this
            if (!vo.bShow || !vo.isEditable || !vo.isModified || vo.ownSaving || !Array.isArray(vo.baseline)) {
                return
            }
            vo.staleNotice = isDraftStale({ keys: vo.$ds.users.keys, rows, baseline: vo.baseline })
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

                //ks, 本列自己可改的(是否使用)在左, 由其他權限群組帶來的(所屬權限群組名稱)在右; 合併模式併入 grupsNames 欄之本項 chip(RelationChips), 不再獨立成欄
                let ks = [
                    'name',
                    'enable',
                    'grupsNames',
                ]
                // console.log('ks', ks)

                //kpHead
                let kpHead = {
                    'name': vo.$t('userName'),
                    'enable': vo.$t('operEnable'),
                    'grupsNames': vo.$t('belongGrupsNames'),
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
                        //name 一律唯讀: 列固定為全部既有使用者(genItems 產生, 無新增/刪除列); doSave 只回寫 u.cgrups、
                        //  完全不讀列上之 name, 故就地改名會被靜默丟棄——有可編輯外觀卻無對應行為(全域 §2.1 第 6 條之半吊子)。
                        //  與 VeCgrups/VeCpemis 同類一併關閉(§2.1 第 4 條 對稱性)。
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
                        'grupsNames': 'text',
                        'enable': 'text',
                    },
                    // kpHeadCheckBox: {
                    //     'name': true,
                    // },
                    kpHeadFocusHighlight: { //兩欄之儲存格內皆有自己的控制項(chip 之模式下拉、勾選框), 焦點框徒增干擾故關閉; 控制項取得焦點時之焦點框由 w-aggrid-vue 2.0.87 之 :focus-within 規則一併擋下
                        'grupsNames': false,
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

        getDisplayRows: function() {
            let vo = this

            //cmp
            let cmp = get(vo, '$refs.rftable')
            // console.log('cmp', cmp)

            //getDisplayData 只回傳顯示中之欄位(name／enable／grupsNames), 不含 id; 批次勾選須以 id 定位列(使用者 name 允許重複), 故另以 ag-grid api 取篩選排序後之完整列(含 id)
            let api = cmp.getApi()
            let rows = []
            api.forEachNodeAfterFilterAndSort((node) => {
                rows.push(node.data)
            })

            return rows
        },

        fltKpGrup: function(kp) {
            // console.log('fltKpGrup', kp)

            let vo = this

            //_kp
            let _kp = Object.create(null) //無原型: 鍵為使用者資料, 不得命中 constructor 等原型鍵(規則帳本 R-KEY-01)
            each(vo.grups, (v, k) => {
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

        genItems: function(grup, users) {
            // console.log('genItems', grup, users)

            let vo = this

            //items
            let items = map(users, (u) => {

                //kpGrup, 空字串(新增列之 funNew 預設值)與壞 JSON 視為空容器, 同 VeCgrups／清單頁／伺服端(R-REL-PARSE-01: 任一列解碼失敗不得使對話框打不開)
                let kpGrup = Object.create(null)
                try {
                    kpGrup = cvKpToObj(JSON5.parse(u.cgrups), { hasMode: true })
                }
                catch (err) {}
                // console.log(u.name, 'kpGrup', kpGrup)

                //fltKpGrup
                kpGrup = vo.fltKpGrup(kpGrup)
                // console.log(u.name, 'kpGrup(fltKpGrup)', kpGrup)

                //mode, enable, grups
                let mode = 'OR'
                let enable = 'n'
                let grups = []
                eachOwn(kpGrup, (v, k) => {
                    // console.log(k, 'v', v)

                    //st, 此為使用者cgrups內設定, 可為y或n, 僅提取y, 再判斷此使用者是否有使用此grup; 與伺服端同解讀(getRefState: 純量值 { "G1": "y" } 為啟用 AND, 啟用者 mode 缺/非法為 AND)
                    let st = getRefState(v)
                    if (st.enable !== 'y') {
                        return true //跳出換下一個
                    }
                    // console.log(k, 'st', st)

                    //b, 使用者是否擁有指定權限群組
                    let b = k === grup.name
                    // console.log(k, 'b', b)

                    //mode, isActive
                    if (b) {
                        enable = 'y'
                        mode = st.mode //使用使用者給予cgrups內指定權限群組之合併權限模式
                        // console.log('使用使用者給予cgrups內指定權限群組之合併權限模式 grup', grup)
                    }

                    //push, 僅供 RelationChips 顯示(name／mode／enable); 存檔不讀本陣列(doSave 以 putRefEntry 自快照字串只改本群組一項)
                    grups.push({
                        name: k,
                        mode: st.mode,
                        isActive: 'y',
                        enable: b ? 'y' : 'n', //給render使用
                    })

                })
                // console.log(u.name, 'grups', grups)

                //grupsNames
                let grupsNames = map(grups, 'name')
                grupsNames = join(grupsNames, ' ')
                // console.log(u.name, 'grupsNames', grupsNames)

                //warnText: 該使用者 cgrups 之衝突提示(R-PRINCIPLE-00 原則 3; 偵測同伺服端判準, getRefWarns 以該列字串), 「所屬權限群組名稱」儲存格最左之警告圖示與 tooltip, 無衝突為 ''
                //  revRows 只回寫 grupsNames／grups 不回寫本欄(其複本字串經 fltKpGrup 已去掉懸空項), 故警告反映開啟時之已儲存資料; 存檔只改本群組一項, 其餘衝突項於存檔後仍在
                let resWarn = getRefWarns(u.cgrups, vo.grups)
                let warnText = resWarn.hasWarn ? getRefWarnText(resWarn, vo.$t, 'warnKindGrup') : ''

                return {
                    id: u.id, //列識別: 使用者 name 允許重複(僅前端警告、後端不擋), 切換處理須以 id 找列, 不可以 name(否則同名者會改到第一位)
                    name: u.name,
                    grupsNames,
                    mode,
                    enable,
                    // kpGrup,
                    grups,
                    warnText,
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

            //以列身分(id)配對: 對話框之列 ↔ 目前 store 中同一位使用者(R-REL-PAIR-01; 不得以列索引配對——store 於對話框開啟期間可被更新〔他人增刪、改 order〕而錯位)
            //krs, usersRev: 對話框有列且 store 仍存在之使用者(usersRev[k] 即第 krs[k] 列所配到者; 配對不到者不更新其顯示, 存檔時由 doSave 整次拒存)
            let { krs, matched: usersRev } = pairRowsToSnapshot(rows, users)

            //users
            users = map(usersRev, (u, ku) => {
                let row = get(rows, krs[ku], {})

                //kpGrup, 空字串與壞 JSON 視為空容器(R-REL-PARSE-01)
                let kpGrup = Object.create(null)
                try {
                    kpGrup = cvKpToObj(JSON5.parse(u.cgrups), { hasMode: true })
                }
                catch (err) {}
                // console.log(u.name, 'kpGrup', kpGrup)

                //fltKpGrup
                kpGrup = vo.fltKpGrup(kpGrup)
                // console.log(u.name, 'kpGrup(fltKpGrup)', kpGrup)

                //mode
                let mode = get(row, 'mode', '')
                if (mode !== 'OR' && mode !== 'AND') {
                    console.log(`非預期: mode應該皆已指定不應觸發`, mode)
                    mode = 'OR'
                }
                // console.log(u.name, 'mode', mode)

                //enable
                let enable = get(row, 'enable', '')
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
                    if (Object.prototype.hasOwnProperty.call(kpGrup, grup.name)) {
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

            //update grupsNames, grups, items 與 krs 同序(item k 對應對話框第 krs[k] 列)
            each(items, (r, k) => {
                // name: u.name,
                // grupsNames,
                // mode,
                // enable,
                // grups,

                //set
                let kr = krs[k]
                set(vo, `opt.rows[${kr}].grupsNames`, r.grupsNames)
                set(vo, `opt.rows[${kr}].grups`, r.grups)
                // console.log('vo.opt.rows[kr]', cloneDeep(vo.opt.rows[kr]))

            })

            //refresh
            vo.refresh()

        },

        showVeGrupBlngUsersToggleItemModeByName: function(name, mode, id) {
            // console.log('showVeGrupBlngUsersToggleItemModeByName', name, mode, id)

            let vo = this

            //check
            if (!isestr(name)) {
                vo.$alert(`${vo.$t('grupBlngEditNoGrupName')}`, { type: 'error' })
                return
            }

            //rows
            let rows = get(vo, 'opt.rows', [])

            //find, 有 id 以 id 找列(使用者 name 可重複, 以 name 會改到第一位同名者); 未給 id 之既有 $dg 呼叫端維持以 name 找
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

        showVeGrupBlngUsersToggleItemEnableByName: function(name, id) {
            // console.log('showVeGrupBlngUsersToggleItemEnableByName', name, id)

            let vo = this

            //check
            if (!isestr(name)) {
                vo.$alert(`${vo.$t('grupBlngEditNoGrupName')}`, { type: 'error' })
                return
            }

            //rows
            let rows = get(vo, 'opt.rows', [])

            //find, 理由同 showVeGrupBlngUsersToggleItemModeByName: 有 id 以 id 找列
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

            //kpRow, 以使用者 id 為鍵(使用者 name 允許重複, 以 name 會使同名者互相錯位; 單列切換早已以 id, 見 showVeGrupBlngUsersToggleItemEnableByName)
            let kpRow = Object.create(null)
            each(rows, (r, kr) => {
                kpRow[r.id] = kr
            })

            //rowsEff, 篩選排序後之完整列(含 id)
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

        showVeGrupBlngUsersToggleItemsEnableAllNo: function() {
            // console.log('showVeGrupBlngUsersToggleItemsEnableAllNo')

            let vo = this

            //rows
            let rows = get(vo, 'opt.rows', [])
            // console.log('rows', rows)

            //kpRow, 以使用者 id 為鍵(使用者 name 允許重複, 以 name 會使同名者互相錯位; 單列切換早已以 id, 見 showVeGrupBlngUsersToggleItemEnableByName)
            let kpRow = Object.create(null)
            each(rows, (r, kr) => {
                kpRow[r.id] = kr
            })

            //rowsEff, 篩選排序後之完整列(含 id)
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

        showVeGrupBlngUsersToggleItemsEnableAllInv: function() {
            // console.log('showVeGrupBlngUsersToggleItemsEnableAllInv')

            let vo = this

            //rows
            let rows = get(vo, 'opt.rows', [])
            // console.log('rows', rows)

            //kpRow, 以使用者 id 為鍵(使用者 name 允許重複, 以 name 會使同名者互相錯位; 單列切換早已以 id, 見 showVeGrupBlngUsersToggleItemEnableByName)
            let kpRow = Object.create(null)
            each(rows, (r, kr) => {
                kpRow[r.id] = kr
            })

            //rowsEff, 篩選排序後之完整列(含 id)
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

        saveUsers: async function(rows, baseline) {
            // console.log('method saveUsers', rows, baseline)

            let vo = this

            //3) updateUsers, 各自 catch + okX 旗標短路 (canonical 五段結構; 空清單檢查已上移至 doSave core())
            //第 2 參 { baseline }: 開框時綁定之草稿基準(由 doSave 於流程開頭取得並傳入, 不於此讀 vo.baseline——存檔進行中若再次 show() 會換成新草稿之基準); 伺服端比對「本次將寫入之列」之庫內版本, 草稿之後被改過即整次拒收 saveStale(失敗路徑沿用下方 catch 顯示語系文字)
            let okSave = false
            vo.ownSaving = true //自己之寫入所致之推播不提示(成功路徑維持至視窗關閉; show() 歸零)
            await vo.$fapi.updateUsers(rows, { baseline })
                .then(() => { okSave = true })
                .catch(async (err) => {
                    vo.ownSaving = false //失敗(含 saveStale 被拒): 視窗仍開著, 恢復監看
                    vo.$ui.updateLoading(false) //showCheckYes 前關 loading（modal 阻斷期間避免 loading 疊在底下）
                    await vo.$dg.showCheckYes(`${vo.$t('userSaveUsersFail')}: ${vo.$tErr(err)}`)
                })
            if (!okSave) {
                return false //回報失敗: 呼叫端 doSave 據此不關閉對話框, 保留未存變更供修正後重按儲存
            }

            //alert（showCheckYes 前關 loading，避免 modal 等待期間 loading 疊在底下）
            vo.$ui.updateLoading(false)
            await vo.$dg.showCheckYes(vo.$t('userSaveUsersSuccess'), { type: 'success' })

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

            //pmDlg: 本次存檔流程所屬之對話框 promise(外審 sol R2): 存檔進行中(如 await delay)若再次 show() 開啟另一群組, vo.pm 會被換成新視窗之 promise,
            //舊流程完成時只能 resolve 自己的 promise、且不得關閉新視窗(見下方 .then)
            let pmDlg = vo.pm

            async function core(unlockBtn) {

                //1) 事先檢測 (所有同步檢查在開 loading 之前, 空清單不應先閃 loading); 訊息框前以 unlockBtn() 釋放儲存鈕之 promiseUnlock 鎖:
                //按鈕鎖只涵蓋請求期間, 結果訊息框出現時按鈕已恢復(與打 API 之路徑一致) (ADR-025)
                let rows = get(vo, 'opt.rows', [])
                // console.log('rows', rows)
                if (size(rows) === 0) {
                    unlockBtn()
                    await vo.$dg.showCheckYes(`${vo.$t('userSaveUsersEmpty')}`)
                    return
                }

                //草稿基準與開框時各列之歸屬狀態(F-26, R-BASELINE-01): 於流程開頭(任何 await 之前)取得並以區域變數持有——存檔進行中若再次 show() 會把 vo.baseline／vo.rowStates 換成新草稿之值, 舊草稿之列不可配新草稿之基準
                let baseline = cloneDeep(vo.baseline)
                let rowStates = vo.rowStates

                //grupName: 被編輯之群組名稱, 同樣於流程開頭(任何 await 之前)取得——等待後才讀 vo.grup.name 會讀到新開啟之實體, 把舊草稿之歸屬寫成指派新實體(外審 sol R2)
                let grupName = get(vo, 'grup.name', '')

                //1b) 無法無損表示之授權資料(R-AUTH-LOSSY-01, 主控複審 R4): 該列使用者之 cgrups 含物件形式無法無損表示之格(getKpLossy)者, 本對話框不得改寫其字串——
                //本對話框所管之歸屬／模式有變更 → 整次儲存拒絕並點名(原子, 其餘列亦不寫); 未變更 → 該列字串逐字元不動(見下方 kpLossyIdx)
                //使用者列之快照只取這一次: 有損檢查之值即下方寫入之值(外審 sol#2: 兩次讀取之間 store 可能被伺服器推送更新, 檢查與寫入看到不同資料)
                let users = cloneDeep(vo.users)

                //1a) 以列身分(id)配對快照(R-REL-PAIR-01, 主控 run02 F-24): 修前以開框時的列索引取快照列, store 於對話框開啟期間被更新(他人增刪、改 order)時關聯寫到另一位使用者;
                //對話框有列所對應的使用者已被刪除者 → 整次拒存(原子, 不寫任何列)並提示重新整理, 不得退而配到其他列
                let { pairs, missing } = pairRowsToSnapshot(rows, users)
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
                    let u = pairs[kr]
                    let kpRaw = null
                    try {
                        kpRaw = JSON5.parse(get(u, 'cgrups', ''))
                    }
                    catch (err) {
                        return true //無法解析者交由下方原流程處理
                    }
                    kpRawModes[kr] = getRawModeMap(kpRaw)
                    if (size(getKpLossy(kpRaw)) === 0) {
                        return true //跳出換下一個
                    }
                    kpLossyIdx[kr] = true
                    let p = getOwn(cvKpToObj(kpRaw, { hasMode: true }), grupName, null)
                    let was = get(p, 'isActive', '') === 'y'
                    let wasMode = was ? get(p, 'mode', '') : ''
                    let now = get(r, 'enable', '') === 'y'
                    let nowMode = now ? get(r, 'mode', '') : ''
                    if (was !== now || wasMode !== nowMode) {
                        lossyNames.push(get(u, 'name', ''))
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

                //users: 沿用 1b 之快照(見上)

                //kpNewCgrups: 列索引 → 該列新 cgrups 字串; 只收「使用者有變更(kpChanged)、非有損、且 putRefEntry 判定本項確有變更」者, 其餘一律不收(由 buildRowsSend 原樣帶回)
                let kpNewCgrups = Object.create(null)
                each(rows, (r, kr) => {

                    //使用者未變更之列(kpChanged)與有損列(kpLossyIdx): 歸屬未變更, 字串逐字元不動
                    if (kpChanged[kr] !== true || kpLossyIdx[kr] === true) {
                        return true //跳出換下一個
                    }

                    //u, 以列身分配對之快照列(見 1a)
                    let u = pairs[kr]

                    //cgrups
                    let cgrups = get(u, 'cgrups', '')

                    //kpGrup, 空字串與壞 JSON 視為空容器(R-REL-PARSE-01)
                    let kpGrup = Object.create(null)
                    try {
                        kpGrup = cvKpToObj(JSON5.parse(cgrups), { hasMode: true })
                    }
                    catch (err) {}
                    // console.log('kpGrup', kpGrup)

                    //kpGrupNew: 只改本群組對應之一項(依列之 enable／mode), 其餘引用項(含懸空、名稱 ''、mode 缺/非法〔已解碼為 AND〕、停用項、純量值)原樣保留, 授權效果不變(putRefEntry; R-PRINCIPLE-00 c／e／f)——
                    //修前以列上之 grups(genItems 經 fltKpGrup 只剩查得之群組、且只取啟用者)重組並以 isEqual 判定改寫, 啟用中之懸空 AND 引用被丟棄即放寬(例: { G1: OR, GX〔已刪〕: AND } 原授權為空, 未改 G1 存檔後得 G1 之授權)
                    //本項未變更 → 回 false, 字串逐字元不動(含其他項為陣列形式／含停用項者, 修前會正規化改寫)
                    //其餘項中之限制項(mode 缺或非法之啟用引用)寫回原始 mode(kpRawModes[kr]), 不寫成可當基底之合法 AND(否則本群組為該層唯一合法項而被取消時多給, R-PRINCIPLE-00 e)
                    let kpGrupNew = Object.create(null)
                    if (putRefEntry(kpGrupNew, kpGrup, grupName, get(r, 'enable', ''), get(r, 'mode', ''), kpRawModes[kr])) {

                        //cgrups(鍵序無關授權, R-AUTH-MERGE-00 第 4 條: 不需保留原鍵序, 亦無整數式名稱易位之拒存)
                        kpNewCgrups[kr] = JSON.stringify(kpGrupNew)

                    }

                })

                //usersNew: 送出之整表＝存檔當下 store 快照(users)之全部列、依其 order 序(F-26 c0, S4): 修前只送「對話框之列」, 開框後他人／外部同步新增之列被伺服端整表 diff 刪除;
                //只有 kpNewCgrups 之列換其 cgrups 一欄, 其餘列(使用者未變更者、有損列、開框後新增而不在對話框內者)與快照同一物件、逐字不動(帶回存檔當下 store 版本以免誤刪／誤改他人之列; 但載入基準仍是開框時之版本, 伺服端表級比對〔R-BASELINE-01, run11〕會因開框後他人之任何變更而整次拒收 saveStale)
                let usersNew = buildRowsSend(users, pairs, kpNewCgrups, 'cgrups')

                // //check
                // if (size(usersNew) === 0) {
                //     return
                // }

                //saveUsers, 失敗時回 false: 失敗提示已由 saveUsers 顯示, 此處不關閉對話框(保留未存變更供重按儲存)
                let okSave = await vo.saveUsers(usersNew, baseline)
                if (!okSave) {
                    return false
                }

            }

            //runSubmit: 對話框儲存流程(至結果訊息框關閉, 成功時含關閉對話框)進行中再觸發即略過; opt.pm 為對話框儲存鈕之 promiseUnlock 鎖,
            //於請求結束(updateLoading(false))時釋放. 對話框之 promise(vo.pm)與開關(bShow)不變: 成功才 resolve 並關閉, 失敗保持開啟可重按儲存 (ADR-025)
            return vo.$ui.runSubmit('saveGrupBlngUsers', (unlockBtn) => {
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
            vo.ownSaving = false

            //isEditable, grup
            let isEditable = get(msg, 'isEditable', false)
            let grup = get(msg, 'grup', {})

            //grup
            grup = cloneDeep(grup)

            //users
            let users = cloneDeep(vo.users)

            //baseline(F-26, R-BASELINE-01; 外審 B.1): 於生成 items 之同一處, 以 items 所依據之那份使用者列(users)計算並綁定為本次草稿之載入基準; 之後 store 推播變新不得更新它
            //(存檔當下才由最新 store 取基準, 證明的是「store 新」而非「待存之編輯內容新」), 每次 show() 重新綁定. 欄位口徑與伺服端同一(vo.$ds.users.keys 經 rowDigest.makeBaseline)
            let baseline = makeBaseline(users, vo.$ds.users.keys)

            //items
            let items = vo.genItems(grup, users)

            //rowStates: 開框時各列之歸屬狀態(須在任何切換操作前由 items 記下; opt.rows 與 items 為同一份陣列, 切換會就地改 enable／mode), 供存檔時判定使用者有無變更該列
            let rowStates = makeRowStates(items)

            //save
            vo.isEditable = isEditable
            vo.grup = grup
            vo.items = items
            vo.baseline = baseline
            vo.rowStates = rowStates

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
