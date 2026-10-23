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
                        :icon="mdiGamepadCircle"
                        :color="'#000'"
                        :size="32"
                    ></WIcon>

                    <div style="padding-left:12px;">

                        <div style="font-size:1.4rem; color:#000;">
                            {{$t('mmTargets')}}
                        </div>

                        <div style="padding-top:2px; font-size:0.8rem; color:#666;">
                            {{$t('mmTargetsMsg')}}
                        </div>

                    </div>

                </div>
            </div>

            <!-- 功能區 -->
            <div
                data-fmid="targets-toolbar"
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

                    <div style="padding-left:4px;"></div>

                </template>

                <template v-if="isEditable && hasItemCheckOne">

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

                    <div style="padding-left:4px;"></div>

                </template>

                <template v-if="isEditable && hasItemsCheck">

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
                        @click="saveTargets"
                    ></WButtonCircle>

                    <div style="padding-left:4px;"></div>

                </template>

            </div>

            <!-- 外部列提示與外部同步警示橫幅(bannerLines 為空時 v-for 不渲染任何節點, 畫面與 DOM 同未啟用前) -->
            <div
                v-for="(b, kb) in bannerLines"
                :key="kb"
                :data-fmid="`targets-banner-${b.kind}`"
                :style="getBannerStyle(b.kind)"
            >
                <svg v-if="b.kind==='ext'" style="vertical-align:sub; margin-right:4px;" width="16" height="16" viewBox="0 0 24 24"><path :d="mdiLock" fill="#666"></path></svg>
                <img v-else style="vertical-align:sub; width:16px; height:16px; margin-right:4px;" :src="$ui.getIcon('warning')" />
                <span>{{ b.text }}</span>
            </div>

            <!-- 資料已被更新提示(R-PRINCIPLE-00 原則 7): 有未存編輯而他人或外部同步改了本表時, 保留草稿並提示, 存檔將被伺服端拒收; 以 v-for 渲染(無提示時不渲染任何節點, 畫面與 DOM 同未啟用前) -->
            <div
                v-for="ks in (staleNotice ? 1 : 0)"
                :key="`stale-${ks}`"
                data-fmid="targets-banner-stale"
                :style="getBannerStyle('warn')"
            >
                <img style="vertical-align:sub; width:16px; height:16px; margin-right:4px;" :src="$ui.getIcon('warning')" />
                <span>{{ $t('staleDraftNotice') }}</span>
                <button class="staleReloadBtn" data-fmid="targets-banner-stale-reload" @click="reloadDraft">{{ $t('staleDraftReload') }}</button>
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
                        <template v-if="props.key==='id'">
                            <span v-for="loc in lockOfRow(props.row)" :key="loc.from" :title="getLockTitle(loc)" style="margin-right:4px;"><svg style="vertical-align:sub;" width="16" height="16" viewBox="0 0 24 24"><path :d="mdiLock" fill="#666"></path></svg></span>
                            <span v-if="errItemsById[props.value]" :title="errItemsById[props.value]">
                                <span style="color:#F57C00;">{{ props.value }}</span>
                                <img style="vertical-align:sub; width:16px; height:16px;" :src="$ui.getIcon('warning')" />
                            </span>
                            <span v-else>{{ props.value }}</span>
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
import { mdiGamepadCircle, mdiStackOverflow, mdiAccountGroupOutline, mdiBallotRecountOutline, mdiCloudUploadOutline, mdiTrashCanOutline, mdiTableHeadersEye, mdiPlus, mdiPencilOutline, mdiContentCopy, mdiLock } from '@mdi/js/mdi.js'
import get from 'lodash-es/get.js'
import each from 'lodash-es/each.js'
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
import reuseDeletedIds from '../plugins/reuseDeletedIds.mjs'
import { getSavePreview } from '../js/getCascadePreview.mjs'
import { getAddImpact, getAddConfirmText } from '../js/getAddImpact.mjs'
import { isExternalRow } from '../js/externalRows.mjs'
import { makeBaseline } from '../js/rowDigest.mjs'
import { refsChanged, planDraftSync, isDraftStale, hasDraftNow } from '../js/draftSync.mjs'
import { applySavedRows } from '../js/applySaved.mjs'
import { isCellEditing, bindCellEditingStopRetry } from '../js/cellEditing.mjs'
import { fmtVars, getBannerLines, splitCheckedRows, getExternalEdits } from '../js/externalUi.mjs'
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
            mdiGamepadCircle,
            mdiStackOverflow,
            mdiAccountGroupOutline,
            mdiBallotRecountOutline,
            mdiCloudUploadOutline,
            mdiTrashCanOutline,
            mdiTableHeadersEye,
            mdiPlus,
            mdiPencilOutline,
            mdiContentCopy,
            mdiLock,

            panelHeight: 100,
            headHeight: 100,

            firstLoading: true,
            firstSetting: true,
            systemProcing: false, //程式端載入/重載清單資料期間為 true, 用於排除非使用者操作之 rowsChange (見 $ui.markDataReload)
            showIsEditable: false,
            isEditable: false,
            isModified: false,

            tabKeys: [
                'id',
                'description',
                'from',
                'userId',
                'timeCreate',
                'userIdUpdate',
                'timeUpdate',
            ],
            tabKeysPick: [
                'id',
                'description',
                'from',
                'userId',
                'timeCreate',
                'userIdUpdate',
                'timeUpdate',
            ],
            tabKeysShow: [
                'id',
                'description',
                // 'from',
                // 'userId',
                // 'timeCreate',
                // 'userIdUpdate',
                // 'timeUpdate',
            ],

            widthTargetId: null,
            widthTargetDescription: null,

            items: [],
            baseline: [], //載入基準([[id, 內容指紋]]): 與 items 於 changeParams 同一處由同一份來源列產生(草稿所依據之版本), 存檔時隨 RPC 送伺服端比對是否過期(F-26, R-BASELINE-01); 不得於存檔當下由最新 store 重算
            baseRows: [], //草稿所依據之那份 store 列(與 baseline 同時產生): 存檔前之預覽、外部列守門以它為「舊」, 不用已變新之 store(有未存編輯時 store 可能已被推播更新, 見 draftSync)
            staleNotice: false, //草稿所依據之整表已被他人／外部同步更新(R-PRINCIPLE-00 原則 7): true 時顯示「資料已被更新」橫幅與重新載入鈕
            syncTick: 0, //重新載入觸發器(reloadDraft 遞增): changeParams 讀它而於重算時於 computed 內重建草稿, 使 genOpt 讀取之反應式來源(語系等)的依賴重新收集——保留草稿(keep)時 changeParams 不呼叫 genOpt, 依賴會收縮, 若在 computed 外直接重建則不會恢復(外審 sol 第 4 點)
            itemsCheck: [],
            opt: null,

        }
    },
    created: function() {
        //syncMark(非響應式; changeParams 讀它而不因它建立響應式依賴, 見 draftSync.planDraftSync): refs／editable 為上次建立草稿時之各表 store 參照與編輯模式, dirty 為未存編輯旗標(isModified)之鏡像(由 watch 維護),
        //baseline 為草稿載入時之基準之副本(供保留草稿時判定是否已過期). 不讓 changeParams 依賴 isModified／baseline: 旗標切換或重新載入不得觸發它重算(其重算＝重建草稿, 見 draftSync)
        this.syncMark = { refs: null, editable: undefined, dirty: false, baseline: [], tick: 0 }
        //saveMark(非響應式, 同 syncMark 之理由): saving 為「自己之存檔請求進行中」(送出前設真, 回應〔成功或失敗〕一到歸零)——此期間伺服端寫入所致之推播若先於回應抵達, 不是他人更新(planDraftSync 回 'keepQuiet': 保留草稿但不顯示過期橫幅; run12)
        this.saveMark = { saving: false }
    },
    mounted: function() {
        // console.log('mounted')

        let vo = this

        //firstSetting
        if (vo.firstSetting) {
            // console.log('webInfor', vo.webInfor)

            let showModeEditTargets = get(vo, 'webInfor.showModeEditTargets', '')
            vo.showIsEditable = showModeEditTargets === 'y'
            let modeEditTargets = get(vo, 'webInfor.modeEditTargets', '')
            vo.isEditable = modeEditTargets === 'y'

            vo.widthTargetId = get(vo, 'webInfor.widthTargetId', '')
            vo.widthTargetDescription = get(vo, 'webInfor.widthTargetDescription', '')

            //會觸發數據變更再導致opt變更導致觸發rowsChange等事件, 故得要延遲, 供組件偵測初始設定數據初始化之用
            setTimeout(() => {
                vo.firstSetting = false
                // console.log('firstSetting', vo.firstSetting)
            }, 1)

        }

    },
    watch: {
        //未存編輯旗標: 維護 syncMark.dirty 鏡像(changeParams 以之判斷「有未存編輯」而不依賴旗標本身). 旗標歸零(已儲存或已放棄)而 store 於保留草稿期間已變新者, 立即依最新 store 重建
        //(儲存成功之推播若先於儲存回應抵達, 其時有未存編輯而被保留; 回應回來旗標歸零時須補上這次重建, 否則畫面停在儲存前之草稿而基準已過期)
        isModified: function(b) {
            let vo = this
            vo.syncMark.dirty = b === true
            if (b !== true && vo.syncMark.refs !== null && refsChanged(vo.syncMark.refs, vo.curRefs())) {
                vo.reloadDraft()
            }
        },
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

        lockExternalRows: function() {
            //後台是否不得改外部列(from 為非空字串者; 伺服端 opt.lockExternalRows 經 getWebInfor 帶來, 'y'／'n'; 舊伺服端無此鍵視為未啟用)
            return get(this, 'webInfor.lockExternalRows', '')
        },

        isLockExternal: function() {
            return this.lockExternalRows === 'y'
        },

        bannerLines: function() {
            let vo = this

            //清單上方橫幅各行: 外部列提示(啟用保護且有外部列; 標的無指派欄, 用 Target 專用文案)＋本表之外部同步警示; 皆無為空陣列, 不渲染任何節點
            return getBannerLines({ keyTable: 'targets', kind: 'Target', rows: vo.targets, lock: vo.isLockExternal, syncWarns: get(vo, 'webInfor.syncWarns', []), $t: (k) => vo.$t(k) })
        },

        changeParams: function() {
            // console.log('computed changeParams')

            let vo = this

            //trigger
            let isEditable = vo.isEditable
            let rows = vo.targets

            //草稿同步(R-PRINCIPLE-00 原則 7, draftSync.planDraftSync): store 變新(推播)時, 無未存編輯 → 重建 items 與基準(同修改前); 有未存編輯 → 保留草稿與其載入時之基準, 不重建, 只判定是否提示「資料已被更新」
            let act = planDraftSync({
                first: vo.syncMark.refs === null || vo.syncMark.tick !== vo.syncTick, //首次載入或使用者按了「重新載入」(syncTick 遞增)
                editChanged: vo.syncMark.editable !== isEditable,
                storeChanged: refsChanged(vo.syncMark.refs, [rows]),
                hasDraft: () => hasDraftNow({ dirty: vo.syncMark.dirty === true, editing: isCellEditing(get(vo, '$refs.rftable', null)) }), //未存修改, 或儲存格編輯器開啟中(已輸入、未按 Enter; 第 115 項, R-DRAFT-KEEP-01 規則 10)
                saving: () => vo.saveMark.saving === true, //自己之存檔請求進行中所致之推播 → 'keepQuiet'(不改過期提示)
            })
            if (act === 'rebuild') {
                vo.rebuildDraft(rows, isEditable)
            }
            else if (act === 'keep') {
                vo.staleNotice = isDraftStale({ keyTable: 'targets', rows, baseline: vo.syncMark.baseline })
            }

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
            let kpErr = Object.create(null) //無原型: 鍵為使用者資料, 不得命中 constructor 等原型鍵(規則帳本 R-KEY-01)
            let kpId = Object.create(null)
            let kpExt = Object.create(null) //id → 外部列之來源 from(共用該 id 之列中有外部列者; 重複之提示改為「外部來源 X 已使用此名稱」, 以 id 為名)
            each(rows, (v, k) => {

                //id
                let id = get(v, 'id', '')

                //kpExt
                if (isestr(id) && isExternalRow(v) && !haskey(kpExt, id)) {
                    kpExt[id] = v.from
                }

                //check
                if (!isestr(id)) {

                    //kpErr
                    kpErr[id] = vo.$t(`targetIdEmpty`)

                    return true //跳出換下一個
                }

                //check
                if (haskey(kpId, id)) {

                    //kpErr
                    kpErr[id] = haskey(kpExt, id) ? fmtVars(vo.$t('nameUsedByExternal'), { name: id, from: kpExt[id] }) : vo.$t(`targetIdDuplicate`)

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
            b = iseobj(vo.errItemsById)
            if (b) {
                c = vo.$t('errInIds')
            }

            return c
        },

        kpHead: function() {
            let vo = this

            let kp = {
                'id': vo.$t('targetId'),
                'description': vo.$t('description'),
                'from': vo.$t('from'),
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

        lockOfRow: function(row) {
            let vo = this

            //啟用外部列保護且該列為外部列者回 [{ from }](首欄顯示鎖頭), 否則回空陣列(供 v-for 渲染 0 或 1 個節點: 無外部列時 DOM 同未啟用前, 不留 v-if 之註解節點)
            if (vo.isLockExternal && isExternalRow(row)) {
                return [{ from: row.from }]
            }
            return []
        },

        getLockTitle: function(loc) {
            let vo = this

            return fmtVars(vo.$t('externalRowLocked'), { from: loc.from })
        },

        getBannerStyle: function(kind) {

            //橫幅樣式沿用既有色票與間距: 與功能區同為 border-top:1px solid #ddd; 字級 0.8rem(同副標題／waitingData)、水平內距 15px(同 waitingData)、垂直內距 5px(同功能區 padding:5px);
            //外部列提示為中性灰底(#f2f2f2, 同按鈕 hover 底)、文字 #444(同工具鈕圖示色); 外部同步警示為淡橘底(#FFE0B2, 同編輯模式開關之橫條色)搭既有警告圖示; 長來源名稱以 overflow-wrap:anywhere 折行, 窄螢幕不溢出
            let bg = kind === 'warn' ? '#FFE0B2' : '#f2f2f2'
            return `padding:5px 15px; border-top:1px solid #ddd; background:${bg}; color:#444; font-size:0.8rem; overflow-wrap:anywhere;`
        },

        rebuildDraft: function(rows, isEditable) {
            let vo = this

            //items
            let items = cloneDeep(rows)

            //baseline, 與 items 同一處由同一份來源列(items)計算: 草稿所依據之版本(F-26), 重建 items 時一併更新, 存檔時不重算
            let baseline = makeBaseline(items, 'targets')

            //save; 重建即放棄未存編輯(isModified 歸零)與過期提示, syncMark 記下本次所依據之 store 參照與編輯模式
            vo.items = items
            vo.baseline = baseline
            vo.baseRows = rows
            vo.isModified = false
            vo.staleNotice = false
            vo.syncMark = { refs: [rows], editable: isEditable, dirty: false, baseline, tick: vo.syncTick }

            //genOpt
            vo.genOpt({ isEditable })

            //firstLoading
            vo.firstLoading = false

            //第 115 項: 重建後元件可能重建, 對新的 ag-grid 重綁「儲存格編輯結束」監聽(同一 api 只綁一次)
            vo.$nextTick(() => {
                vo.bindEditing()
            })

        },

        curRefs: function() {
            //目前各來源 store 之參照(與 changeParams 之 refsChanged 同一組)
            let vo = this
            return [vo.targets]
        },

        bindEditing: function() {
            //第 115 項(R-DRAFT-KEEP-01 規則 10): 儲存格編輯器開啟中視為有草稿(changeParams 的 hasDraft 以 ag-grid 的 getEditingCells 判定); 編輯結束(提交、Esc、失焦)時補做保留期間跳過之重建
            let vo = this
            bindCellEditingStopRetry(() => get(vo, '$refs.rftable', null), () => {
                vo.afterEditing()
            })
        },

        afterEditing: function() {
            //儲存格編輯結束: 無未存修改(isModified 為假; 提交者此刻已由 rowsChange 設為真)而 store 於編輯期間已變新者, 補上一次重建; 有未存修改者維持保留(isModified 的 watch 於儲存或放棄後補重建)
            let vo = this
            if (vo.isModified !== true && vo.syncMark.refs !== null && refsChanged(vo.syncMark.refs, vo.curRefs())) {
                vo.reloadDraft()
            }
        },

        reloadDraft: function() {
            //「重新載入」鈕(資料已被更新橫幅): 使用者明確放棄未存編輯, 以目前 store 重建草稿與基準. 不在此直接呼叫 rebuildDraft: 遞增 syncTick 使 changeParams 重算並於 computed 內重建,
            //genOpt 之反應式依賴(語系等)才會重新收集(保留草稿期間 changeParams 未呼叫 genOpt, 依賴已收縮; 於 computed 外重建不會恢復, 重新載入後再切換語系表頭將停留舊值, 外審 sol 第 4 點)
            let vo = this
            vo.syncTick++
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

                    //外部列(from 非空)之身分／結構欄逐列唯讀(啟用保護時以函數判定: w-aggrid-vue 之 setobj 原樣取 kpCellEditable[key] 指給 ag-grid colDef.editable, 其接受 (params) => boolean);
                    //標的無指派欄; from 欄於所有列皆唯讀(外部同步所擁有, 後台新增列 from 恆為空)
                    let editable = vo.isLockExternal ? (params) => !isExternalRow(params.data) : true
                    kpCellEditable = {
                        'id': editable,
                        'description': editable,
                    }
                    kpRowDrag = {
                        'id': true,
                    }
                    kpHeadCheckBox = {
                        'id': true,
                    }
                }

                //kpHeadHide
                let kpHeadHide = {}
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
                        'id': true,
                    },
                    defHeadMinWidth: 150,
                    kpHeadWidth: {
                        'id': isnum(vo.widthTargetId) ? cdbl(vo.widthTargetId) : 600,
                        'description': isnum(vo.widthTargetDescription) ? cdbl(vo.widthTargetDescription) : 600,
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
                    kpCellEditable,
                    kpRowDrag,
                    kpHeadCheckBox,
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
            //transient 欄位 _isNew: 標記未儲存之新列, 隨列送後端供「新增列已存在即拒絕」(saveNewRowExists), 後端檢查後剝除不入庫 (ADR-025);
            //本表 id 為可就地改寫之標的路徑, 改寫後仍為新列, 標記不變
            r._isNew = true
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
            r.from = '' //複製出之列為後台新增列, 不繼承來源(來源非空即外部列, 後台新增列 from 須為空, 否則伺服端 saveFromNotAllowed; 不論是否啟用外部列保護)
            r.srcKey = '' //來源鍵 srcKey 與 from 同為身分欄(perm-run03 範圍二, R-IMPORT-01): 後台列之 srcKey 恆空, 不繼承外部列之來源鍵(否則伺服端 saveFromNotAllowed)
            r.userId = `{${vo.$t('targetAddIdNew')}}`
            r.timeCreate = `{${vo.$t('targetAddIdNew')}}`
            r.userIdUpdate = `{${vo.$t('targetAddIdNew')}}`
            r.timeUpdate = `{${vo.$t('targetAddIdNew')}}`
            //transient 欄位 _isNew: 複製出之列亦為新列(見 addItem) (ADR-025)
            r._isNew = true
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

            //外部列保護(啟用時): 外部列(from 非空)不得刪除(伺服端 saveExternalRowChanged), 先過濾掉並以 showCheckYes 提示被略過之筆數(警告, 非 success), 使用者按確定後其餘照常;
            //全為外部列則不刪除任何列
            let sp = splitCheckedRows(vo.itemsCheck, vo.isLockExternal)
            if (sp.nBlocked > 0) {
                vo.$dg.showCheckYes(fmtVars(vo.$t('externalRowDelBlocked'), { n: sp.nBlocked }), { type: 'warning' })
                    .then(() => {
                        if (size(sp.rows) > 0) {
                            vo.deleteItems(sp.rows)
                        }
                    })
                return
            }

            vo.deleteItems(sp.rows)

        },

        deleteItems: function(itemsDel) {
            // console.log('method deleteItems')

            let vo = this

            //cloneDeep
            let rows = get(vo, 'opt.rows', [])

            //cloneDeep
            rows = cloneDeep(rows)

            //filter
            each(itemsDel, (v) => {
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

        saveTargets: function(msg) {
            //promiseUnlock 之鎖交由 doSaveTargets 之 runSubmit 於請求結束時釋放, 不於此解鎖: 請求期間儲存鈕之滑鼠與鍵盤 Enter 皆擋 (ADR-025;
            //原第一行即 msg.pm.resolve(), 鎖立即解除, 焦點留在儲存鈕時連按 Enter 可送出 2 次)
            let vo = this
            vo.doSaveTargets({ pm: msg.pm })
        },

        doSaveTargets: function(opt = {}) {
            // console.log('method doSaveTargets')

            let vo = this

            async function core(unlockBtn) {

                //1) 同步檢測 (在開 loading 之前); 早退之訊息框前以 unlockBtn() 釋放儲存鈕之 promiseUnlock 鎖: 按鈕鎖只涵蓋請求期間,
                //結果訊息框出現時按鈕已恢復(與打 API 之路徑一致); 流程狀態仍由 runSubmit 保持至訊息框關閉 (ADR-025)
                if (isestr(vo.isError)) {
                    unlockBtn()
                    await vo.$dg.showCheckYes(`${vo.isError}`)
                    return
                }

                //rows, baseline: 與 rows 同一刻(同步)擷取——兩者於 changeParams 同一處同時產生, 之後確認框期間若推播重建清單, 仍帶「草稿所依據之那一版」之基準(F-26), 不由最新 store 重算
                let rows = get(vo, 'opt.rows', [])
                let baseline = cloneDeep(vo.baseline)

                //check
                if (size(rows) === 0) {
                    unlockBtn()
                    await vo.$dg.showCheckYes(`${vo.$t('targetAddEmpty')}`)
                    return
                }

                //外部列保護(啟用時): 外部列之身分／結構欄(含 id)以逐列唯讀與刪除過濾擋下, 但貼上(Ctrl+V)等路徑可繞過逐列唯讀, 送出前再比對一次(基準為 store 之 targets);
                //有違規即不送出並提示(伺服端同樣整次拒收 saveExternalRowChanged); 於開 loading 之前, 訊息框前釋放按鈕鎖
                if (vo.isLockExternal && getExternalEdits({ keyTable: 'targets', keys: vo.$ds.targets.keys, rowsNew: rows, rowsOld: vo.baseRows }) !== null) {
                    unlockBtn()
                    await vo.$dg.showCheckYes(vo.$t('saveExternalRowChanged'), { type: 'warning' })
                    return
                }

                //新增列之 transient 欄位 _isNew(addItem / copyItem 標記)隨列送後端: 後端據以拒絕「標為新增但 id 已存在」之列
                //(同一包重送時不把剛建立之列當修改覆寫, 回 saveNewRowExists), 檢查後由 ltdtmapping 依 schema 取欄時剝除不入庫 (ADR-025);
                //本表 id 可就地改寫: 新增列之 id 改成本次刪除(或改掉 id)之既有標的者, 淨效果為修改該標的, 送出前改為一般列並沿用其建立者 / 建立時間,
                //否則被後端當重送擋下(重新整理後重做仍被擋) (見 reuseDeletedIds)
                let rowsSend = reuseDeletedIds(rows, vo.baseRows)

                //2) 引用連帶預覽(ADR-036、R-REF-CASCADE-01; 與伺服端同一純函數 planRefChanges, 基準為 store 之 targets／pemis, 以實際送出之列 rowsSend 規劃, 筆數以伺服端實際為準):
                //標的 id 即名稱, 可就地改寫, 改 id 對伺服端等同刪舊增新(不級聯), 引用該標的之 pemis.crules 項目於同一次寫入內被連帶清理(刪除亦同); 有權限之規則將被清理時先確認,
                //確認框文字之判定見 src/js/getCascadePreview.mjs(標的頁只確認、不改成功訊息)
                let pv = getSavePreview({ kind: 'Target', rowsOld: vo.baseRows, rowsNew: rowsSend, holdersOld: vo.pemis, $t: (k) => vo.$t(k) })

                //新增撞懸空名(F-23／F-26 原則 7; src/js/getAddImpact.mjs): 本次新增之標的 id(含就地改寫成新 id 者)查無既有同名實體, 而仍有啟用中之權限 crules 規則指向該 id——新增後該規則即對新標的生效,
                //須明確同意才送出; 以實際送出之列 rowsSend 規劃(同上), 與預覽同於開 loading 之前同步計算(基準為 store 之 targets／pemis), 無懸空引用時不彈框; 與刪除／改 id 預覽依序(先預覽、再新增確認), 各自只在需要時彈出
                let addText = getAddConfirmText(getAddImpact({ keyTable: 'targets', rowsOld: vo.baseRows, rowsNew: rowsSend, holders: vo.pemis }), (k) => vo.$t(k), 'Target')

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

                //新增撞懸空名之確認(同上之鎖釋放與選否中止; 單一框、單一問句)
                if (addText !== '') {
                    unlockBtn()
                    let isGoAdd = await vo.$dg.showCheckYesNo(addText)
                        .then(() => true)
                        .catch(() => false)
                    if (!isGoAdd) {
                        return
                    }
                }

                //3) 確定打 API 才開 loading
                vo.$ui.updateLoading(true)

                //4) updateTargets, 各自 catch + 旗標短路; 第 2 參 { baseline } 為載入基準(伺服端於表鎖內比對本次將寫入之列是否仍與草稿所依據之版本相同, 否則整次拒收 saveStale)
                let okSave = false
                let savedRes = null //伺服端回傳(成功 msg key 字串, 或 { msg, rows, others }: 寫入後之列, 鎖內新鮮讀取; 規格第 8 節)
                vo.saveMark.saving = true //自己之存檔請求進行中: 此期間之推播不是他人更新(changeParams 的 planDraftSync 回 'keepQuiet'); 回應(成功或失敗)一到即歸零
                await vo.$fapi.updateTargets(rowsSend, { baseline, returnRows: true })
                    .then((res) => {
                        okSave = true
                        savedRes = res
                        vo.saveMark.saving = false
                    })
                    .catch(async (err) => {
                        vo.saveMark.saving = false
                        vo.staleNotice = isDraftStale({ keyTable: 'targets', rows: vo.targets, baseline: vo.syncMark.baseline }) //失敗(含 saveStale 被拒): 請求進行中被安靜保留之推播, 此時依目前 store 重算過期提示(同 changeParams 之保留分支)
                        vo.$ui.updateLoading(false) //showCheckYes 前關 loading（modal 阻斷期間避免 loading 疊在底下）
                        await vo.$dg.showCheckYes(`${vo.$t('targetSaveTargetsFail')}: ${vo.$tErr(err)}`)
                    })
                if (!okSave) return

                //isModified
                vo.isModified = false
                vo.syncMark.dirty = false //watch 為非同步, 此處同步歸零: 下面 commit 引起之 changeParams 重算須視為「無草稿」而重建

                //存檔成功後新基準取自伺服端且須立即取得(規格第 8 節; R-SAVED-ROWS-01): 以回傳之寫入後之列(鎖內新鮮讀取)更新 store, 本頁依既有流程以之重建畫面與基準;
                //其後抵達之同內容推播摘要相同, 不視為他人更新. 不以自己送出之值當新基準(clearXSS 等會改寫字串). 回傳不含列(舊伺服端、讀回失敗)時退回等推播
                applySavedRows('targets', savedRes, (t, rs) => vo.$store.commit(vo.$store.types.UpdateTableData, { tableName: t, data: rs, source: 'savedRows' }))

                //alert（showCheckYes 前關 loading，避免 modal 等待期間 loading 疊在底下）
                vo.$ui.updateLoading(false)
                await vo.$dg.showCheckYes(vo.$t('targetSaveTargetsSuccess'), { type: 'success' }) //標的頁之成功訊息不變(被清理之權限數已於確認框告知)

            }

            //runSubmit: 儲存流程(至結果訊息框關閉)進行中再觸發即略過; opt.pm 為儲存鈕之 promiseUnlock 鎖, 於請求結束(updateLoading(false))時釋放 (ADR-025)
            return vo.$ui.runSubmit('saveTargets', (unlockBtn) => {
                return core(unlockBtn)
                    .catch((err) => {
                        console.log('catch', err)
                        vo.$alert(vo.$t('anUnexpectedErrorOccurred'), { type: 'error' })
                    })
                    .finally(() => {

                        //非預期例外時亦歸零, 避免之後之推播永遠被當成自己存檔所致
                        vo.saveMark.saving = false

                        //hide loading
                        vo.$ui.updateLoading(false)

                    })
            }, opt)

        },

    }
}
</script>

<style scoped>
/* 「資料已被更新」橫幅之重新載入鈕: 底色 #fff(同工具鈕底)、hover #f2f2f2(同工具鈕 hover)、邊線 #ddd(同橫幅邊線)、文字 #444(同橫幅文字), 與橫幅同字級 */
.staleReloadBtn {
    margin-left: 8px;
    padding: 1px 10px;
    font-size: 0.8rem;
    color: #444;
    background: #fff;
    border: 1px solid #ddd;
    border-radius: 4px;
    cursor: pointer;
}
.staleReloadBtn:hover {
    background: #f2f2f2;
}
</style>
