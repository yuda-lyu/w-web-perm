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
                        :icon="mdiAccountGroupOutline"
                        :color="'#000'"
                        :size="32"
                    ></WIcon>

                    <div style="padding-left:12px;">

                        <div style="font-size:1.4rem; color:#000;">
                            {{$t('mmUsers')}}
                        </div>

                        <div style="padding-top:2px; font-size:0.8rem; color:#666;">
                            {{$t('mmUsersMsg')}}
                        </div>

                    </div>

                </div>
            </div>

            <!-- 功能區 -->
            <div
                data-fmid="users-toolbar"
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

                <template v-if="isEditableIdentity">

                    <WButtonCircle
                        :paddingStyle="{v:6,h:6}"
                        :tooltip="$t('userAdd')"
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

                <template v-if="isEditableIdentity && hasItemCheckOne">

                    <WButtonCircle
                        :paddingStyle="{v:6,h:6}"
                        :tooltip="$t('userCopy')"
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

                <template v-if="isEditableIdentity && hasItemsCheck">

                    <WButtonCircle
                        :paddingStyle="{v:6,h:6}"
                        :tooltip="$t('userDeleteCheckUsers')"
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
                        @click="saveUsers"
                    ></WButtonCircle>

                    <div style="padding-left:4px;"></div>

                </template>

            </div>

            <!-- 外部列提示與外部同步警示橫幅(bannerLines 為空時 v-for 不渲染任何節點, 畫面與 DOM 同未啟用前) -->
            <div
                v-for="(b, kb) in bannerLines"
                :key="kb"
                :data-fmid="`users-banner-${b.kind}`"
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
                data-fmid="users-banner-stale"
                :style="getBannerStyle('warn')"
            >
                <img style="vertical-align:sub; width:16px; height:16px; margin-right:4px;" :src="$ui.getIcon('warning')" />
                <span>{{ $t('staleDraftNotice') }}</span>
                <button class="staleReloadBtn" data-fmid="users-banner-stale-reload" @click="reloadDraft">{{ $t('staleDraftReload') }}</button>
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
                            <span v-for="loc in lockOfRow(props.row)" :key="loc.from" :title="getLockTitle(loc)" style="margin-right:4px;"><svg style="vertical-align:sub;" width="16" height="16" viewBox="0 0 24 24"><path :d="mdiLock" fill="#666"></path></svg></span>
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
                        <template v-else-if="props.key==='email'">
                            <span v-if="errItemsByEmail[props.value]" :title="errItemsByEmail[props.value]">
                                <span style="color:#F57C00;">{{ props.value }}</span>
                                <img style="vertical-align:sub; width:16px; height:16px;" :src="$ui.getIcon('warning')" />
                            </span>
                            <span v-else-if="warnItemsByEmail[props.value]" :title="warnItemsByEmail[props.value]">
                                <img style="vertical-align:sub; width:16px; height:16px; margin-right:4px;" :src="$ui.getIcon('warning')" />
                                <span style="color:#F57C00;">{{ props.value }}</span>
                            </span>
                            <span v-else>{{ props.value }}</span>
                        </template>
                        <template v-else-if="props.key==='cgrups'">
                            <div v-if="warnCgrupsById[props.row.id]" style="display:flex; align-items:center; gap:4px;" @click.stop.prevent @mousedown.stop.prevent>
                                <span :title="warnCgrupsById[props.row.id]" style="display:flex; align-items:center; flex:0 0 auto;">
                                    <img style="vertical-align:sub; width:16px; height:16px;" :src="$ui.getIcon('warning')" />
                                </span>
                                <button style="flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" @click="$dg.showVeCgrupsById(props.row.id)">{{ getCgrupsText(props.value) }}</button>
                            </div>
                            <div v-else @click.stop.prevent @mousedown.stop.prevent>
                                <button style="width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" @click="$dg.showVeCgrupsById(props.row.id)">{{ getCgrupsText(props.value) }}</button>
                            </div>
                        </template>
                        <input v-else-if="props.key==='isAdmin'" type="checkbox" :checked="props.value === 'y'" @click="toggleItemIsAdminById(props.row.id)" :disabled="!isEditableIdentity || isLockedRow(props.row)" />
                        <input v-else-if="props.key==='isActive'" type="checkbox" :checked="props.value === 'y'" @click="toggleItemIsActiveById(props.row.id)" :disabled="!isEditableIdentity || isLockedRow(props.row)" />
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
import { mdiAccountGroupOutline, mdiVectorPolylinePlus, mdiCheckboxMarkedCircle, mdiCloudUploadOutline, mdiTrashCanOutline, mdiTableHeadersEye, mdiPlus, mdiPencilOutline, mdiContentCopy, mdiLock } from '@mdi/js/mdi.js'
import JSON5 from 'json5'
import get from 'lodash-es/get.js'
import set from 'lodash-es/set.js'
import each from 'lodash-es/each.js'
import size from 'lodash-es/size.js'
import filter from 'lodash-es/filter.js'
import sortBy from 'lodash-es/sortBy.js'
import cloneDeep from 'lodash-es/cloneDeep.js'
import isestr from 'wsemi/src/isestr.mjs'
import iseobj from 'wsemi/src/iseobj.mjs'
import isnum from 'wsemi/src/isnum.mjs'
import isEmail from 'wsemi/src/isEmail.mjs'
import cdbl from 'wsemi/src/cdbl.mjs'
import arrPull from 'wsemi/src/arrPull.mjs'
import eachOwn from '../js/eachOwn.mjs'
import cvKpToObj from '../js/cvKpToObj.mjs'
import { getRefWarns, getRefWarnText, fmtWarn } from '../js/getAuthWarn.mjs'
import { getNameErrs, mapNameKp } from '../js/getNameErrs.mjs'
import { isExternalRow } from '../js/externalRows.mjs'
import { makeBaseline } from '../js/rowDigest.mjs'
import { refsChanged, planDraftSync, isDraftStale } from '../js/draftSync.mjs'
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
            mdiAccountGroupOutline,
            mdiVectorPolylinePlus,
            mdiCheckboxMarkedCircle,
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
            modeEditUsers: '', //settings.modeEditUsers 原值: 'y' 全可編 / 'n' 全唯讀 / 'for:grups' 僅可編使用者所屬群組(身分欄與新增複製刪除鎖定)
            isModified: false,

            tabKeys: [
                'id',
                'name',
                'email',
                'description',
                'from',
                'cgrups',
                'isAdmin',
                'isActive',
                'userId',
                'timeCreate',
                'userIdUpdate',
                'timeUpdate',
            ],
            tabKeysPick: [
                'name',
                'email',
                'description',
                'from',
                'cgrups',
                'isAdmin',
                'isActive',
                'userId',
                'timeCreate',
                'userIdUpdate',
                'timeUpdate',
            ],
            tabKeysShow: [
                'name',
                'email',
                'description',
                // 'from',
                'cgrups',
                'isAdmin',
                'isActive',
                // 'userId',
                // 'timeCreate',
                // 'userIdUpdate',
                // 'timeUpdate',
            ],

            widthUsersName: null,
            widthUsersEmail: null,
            widthUsersDescription: null,

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

        //註冊至$dg供使用
        vo.$dg.showVeCgrupsById = vo.showVeCgrupsById
        vo.$dg.toggleItemIsAdminById = vo.toggleItemIsAdminById
        vo.$dg.toggleItemIsActiveById = vo.toggleItemIsActiveById

        //firstSetting
        if (vo.firstSetting) {
            // console.log('webInfor', vo.webInfor)

            let showModeEditUsers = get(vo, 'webInfor.showModeEditUsers', '')
            vo.showIsEditable = showModeEditUsers === 'y'
            let modeEditUsers = get(vo, 'webInfor.modeEditUsers', '')
            vo.modeEditUsers = modeEditUsers
            vo.isEditable = modeEditUsers === 'y' || modeEditUsers === 'for:grups' //for:grups 仍進編輯模式, 但身分欄位由 isEditableIdentity 鎖定

            vo.widthUsersName = get(vo, 'webInfor.widthUsersName', '')
            vo.widthUsersEmail = get(vo, 'webInfor.widthUsersEmail', '')
            vo.widthUsersDescription = get(vo, 'webInfor.widthUsersDescription', '')

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

        //isEditableIdentity, 使用者身分(name/email/description/from/isAdmin/isActive/排序)與新增複製刪除是否可編;
        //modeEditUsers='for:grups'(使用者來自外部單一登入系統之部署, 身分由該系統同步)時鎖定, 僅群組指派(VeCgrups)依 isEditable
        isEditableIdentity: function() {
            let vo = this
            return vo.isEditable && vo.modeEditUsers !== 'for:grups'
        },

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

            //清單上方橫幅各行: 外部列提示(啟用保護且有外部列)＋本表之外部同步警示(users 無同名異 id 之偵測, 通常無); 皆無為空陣列, 不渲染任何節點
            return getBannerLines({ keyTable: 'users', kind: 'User', rows: vo.users, lock: vo.isLockExternal, syncWarns: get(vo, 'webInfor.syncWarns', []), $t: (k) => vo.$t(k) })
        },

        changeParams: function() {
            // console.log('computed changeParams')

            let vo = this

            //trigger
            let isEditable = vo.isEditable
            let rows = vo.users

            //草稿同步(R-PRINCIPLE-00 原則 7, draftSync.planDraftSync): store 變新(推播)時, 無未存編輯 → 重建 items 與基準(同修改前); 有未存編輯 → 保留草稿與其載入時之基準, 不重建, 只判定是否提示「資料已被更新」
            let act = planDraftSync({
                first: vo.syncMark.refs === null || vo.syncMark.tick !== vo.syncTick, //首次載入或使用者按了「重新載入」(syncTick 遞增)
                editChanged: vo.syncMark.editable !== isEditable,
                storeChanged: refsChanged(vo.syncMark.refs, [rows]),
                hasDraft: () => vo.syncMark.dirty === true,
                saving: () => vo.saveMark.saving === true, //自己之存檔請求進行中所致之推播 → 'keepQuiet'(不改過期提示)
            })
            if (act === 'rebuild') {
                vo.rebuildDraft(rows, isEditable)
            }
            else if (act === 'keep') {
                vo.staleNotice = isDraftStale({ keys: vo.$ds.users.keys, rows, baseline: vo.syncMark.baseline })
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

            //只擋「本次造成或觸及」者(R-PRINCIPLE-00 g、h, R-NAME-UNIQ-02): 本次新增或改成空值／撞名之列擋存; 庫內既有的歷史同名／空值(僅外部同步可造成)不擋、改為警告圖示;
            //重複之判準與伺服端同一份(findTouchedDup), 基準為 store 之 users(最近一次由伺服端載入的列). mappingBy 前端不知(伺服端選項), 前端一律採「只擋本次造成或觸及」,
            //伺服端依 mappingBy 另有更嚴之檢查, 被擋時以伺服端回的錯誤鍵經 showCheckYes 顯示
            return getNameErrs(get(vo, 'opt.rows', []), vo.baseRows, 'name', { badScope: 'touched' })
        },

        emailErrs: function() {
            let vo = this

            //同 nameErrs; 另 email 須合格式(isEmail)
            return getNameErrs(get(vo, 'opt.rows', []), vo.baseRows, 'email', { badScope: 'touched', isValid: isEmail })
        },

        errItemsByName: function() {
            let vo = this

            //擋存者(本次造成或觸及之空名稱／重複): 既有呈現(橘色名稱＋圖示), 決定 isError;
            //重複者之一為外部列(from 非空)時, 提示改為「外部來源 X 已使用此名稱」(dupExternal; 外部列由外部擁有, 須改自己之名稱)
            return mapNameKp(vo.nameErrs.errBlock, (kind, name) => {
                if (kind === 'dup' && name in vo.nameErrs.dupExternal) {
                    return fmtVars(vo.$t('nameUsedByExternal'), { name, from: vo.nameErrs.dupExternal[name] })
                }
                return vo.$t(kind === 'empty' ? `userNameEmpty` : `userNameDuplicate`)
            })
        },

        errItemsByEmail: function() {
            let vo = this

            //擋存者(本次造成或觸及之空值／格式錯誤／重複): 既有呈現, 決定 isError
            return mapNameKp(vo.emailErrs.errBlock, (kind) => {
                return vo.$t(kind === 'empty' ? `userEmailEmpty` : (kind === 'invalid' ? `userEmailError` : `userEmailDuplicate`))
            })
        },

        warnItemsByName: function() {
            let vo = this

            //歷史同名／歷史空名稱(不擋存, 與 errItemsByName 互斥): 同樣顯示橘色名稱＋圖示, tooltip 說明為既有資料
            let kp = mapNameKp(vo.nameErrs.warnHist, (n) => {
                return fmtWarn(vo.$t('warnUserNameHistDup'), { n })
            })
            return Object.assign(kp, mapNameKp(vo.nameErrs.warnHistBad, () => {
                return vo.$t('warnUserNameHistEmpty')
            }))
        },

        warnItemsByEmail: function() {
            let vo = this

            //歷史同 email／歷史空值／歷史格式錯誤(不擋存, 與 errItemsByEmail 互斥)
            let kp = mapNameKp(vo.emailErrs.warnHist, (n) => {
                return fmtWarn(vo.$t('warnUserEmailHistDup'), { n })
            })
            return Object.assign(kp, mapNameKp(vo.emailErrs.warnHistBad, (kind) => {
                return vo.$t(kind === 'empty' ? 'warnUserEmailHistEmpty' : 'warnUserEmailHistInvalid')
            }))
        },

        warnCgrupsById: function() {
            let vo = this

            //cgrups 引用清單之衝突提示(R-PRINCIPLE-00 b、c、d、e、f): 列 id → tooltip 文字, 只含有衝突之列(無衝突之列不入表, 畫面維持原樣);
            //引用比對的被引用表為 store 之 grups(群組頁已儲存之列), 判準與伺服端 getUserRules 同一份(findRefRows)
            let kp = Object.create(null)
            let rows = get(vo, 'opt.rows', [])
            each(rows, (r) => {
                let res = getRefWarns(get(r, 'cgrups', ''), vo.grups)
                if (res.hasWarn) {
                    kp[get(r, 'id', '')] = getRefWarnText(res, (k) => vo.$t(k), 'warnKindGrup')
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
                return c
            }
            b = iseobj(vo.errItemsByEmail)
            if (b) {
                c = vo.$t('errInEmails')
                return c
            }

            return ''
        },

        kpHead: function() {
            let vo = this

            let kp = {
                'id': vo.$t('id'),
                'name': vo.$t('name'),
                'email': vo.$t('email'),
                'description': vo.$t('description'),
                'from': vo.$t('from'),
                'cgrups': vo.$t('userCgrups'),
                'isAdmin': vo.$t('isAdmin'),
                'isActive': vo.$t('isActive'),
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

        isLockedRow: function(row) {
            let vo = this

            //啟用外部列保護且該列為外部列(from 非空)
            return vo.isLockExternal && isExternalRow(row)
        },

        lockOfRow: function(row) {
            let vo = this

            //啟用外部列保護且該列為外部列者回 [{ from }](首欄顯示鎖頭), 否則回空陣列(供 v-for 渲染 0 或 1 個節點: 無外部列時 DOM 同未啟用前, 不留 v-if 之註解節點)
            if (vo.isLockedRow(row)) {
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
            let baseline = makeBaseline(items, vo.$ds.users.keys)

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

        },

        curRefs: function() {
            //目前各來源 store 之參照(與 changeParams 之 refsChanged 同一組)
            let vo = this
            return [vo.users]
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
                if (vo.isEditableIdentity) { //身分欄位編輯/拖曳排序/列勾選(供複製刪除)皆屬身分編修, for:grups 時鎖定

                    //外部列(from 非空)之身分／結構欄逐列唯讀(啟用保護時以函數判定: w-aggrid-vue 之 setobj 原樣取 kpCellEditable[key] 指給 ag-grid colDef.editable, 其接受 (params) => boolean);
                    //isAdmin／isActive 為 cell-render 之核選方塊(以 :disabled 逐列鎖定); 指派欄(cgrups)走開窗按鈕, 不受影響; from 欄於所有列皆唯讀(外部同步所擁有, 後台新增列 from 恆為空)
                    let editable = vo.isLockExternal ? (params) => !isExternalRow(params.data) : true
                    kpCellEditable = {
                        'name': editable,
                        'email': editable,
                        'description': editable,
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
                        'name': isnum(vo.widthUsersName) ? cdbl(vo.widthUsersName) : 200,
                        'email': isnum(vo.widthUsersEmail) ? cdbl(vo.widthUsersEmail) : 300,
                        'description': isnum(vo.widthUsersDescription) ? cdbl(vo.widthUsersDescription) : 300,
                        'cgrups': 300,
                        'isAdmin': 100,
                        'isActive': 100,
                        'timeCreate': 220,
                        'timeUpdate': 220,
                    },
                    kpHeadFilterType: {
                        'id': 'text',
                        'name': 'text',
                        'email': 'text',
                        'description': 'text',
                        'from': 'text',
                        'cgrups': 'text',
                        'isAdmin': 'text',
                        'isActive': 'text',
                        'userId': 'text',
                        'timeCreate': 'text',
                        'userIdUpdate': 'text',
                        'timeUpdate': 'text',
                    },
                    kpCellEditable,
                    kpRowDrag,
                    kpHeadCheckBox,
                    kpHeadFilter: {
                        'cgrups': false,
                    },
                    kpHeadSort: {
                        'cgrups': false,
                    },
                    kpHeadFocusHighlight: { //本欄內容為開窗按鈕(cell 之 padding 亦可被點), 焦點框徒增干擾故關閉; w-aggrid-vue 2.0.87 起規則含 :focus-within, 按鈕取得焦點(如鍵盤 Tab)時亦不顯示焦點框——2.0.86 只擋 :focus, 按鈕聚焦仍現藍框, 即本註解原載「效果不完全」之由, 2026-09-16 實測已修
                        'cgrups': false,
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

            //showKeys, applyOrder:false 僅切換顯示與隱藏、維持目前欄序(w-aggrid-vue 2.0.88 起提供)
            //  why: tabKeysShow 為 WInputCheckbox 之 v-model, 重新勾選之項一律被 push 到陣列尾端(WInputCheckbox.vue:379-381),
            //  若沿用預設 applyOrder:true, 欄序會跟著點擊序走, 使用者隱藏再顯示某欄即跑到最右; 初始欄序由 opt.keys 決定, 本函式只在勾選時呼叫, 故不受影響
            cmp.showKeys(vo.tabKeysShow, { applyOrder: false })
            // console.log('tabKeysShow', vo.tabKeysShow)

        },

        toggleItemIsAdminById: function(id) {
            // console.log('toggleItemIsAdminById', id)

            let vo = this

            //k
            let k = 'isAdmin'

            //check
            if (!isestr(id)) {
                vo.$alert(`${vo.$t('userEditNoUserId')}`, { type: 'error' })
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
                vo.$alert(`${vo.$t('userEditNoUserData')}`, { type: 'error' })
                return
            }

            //外部列(啟用保護時)之身分欄唯讀: 核選方塊已 :disabled, 此為防呆(不變更、不標修改)
            if (vo.isLockedRow(r)) {
                vo.refresh()
                return
            }

            //v
            let _v = get(r, k, 'n')
            let v = _v === 'y' ? 'n' : 'y'
            // console.log(k, v)

            //set
            set(vo, `opt.rows[${kr}].${k}`, v)
            // console.log('vo.opt.rows[kr]', cloneDeep(vo.opt.rows[kr]))

            //refresh
            vo.refresh()

            //isModified
            vo.isModified = true

        },

        toggleItemIsActiveById: function(id) {
            // console.log('toggleItemIsActiveById', id)

            let vo = this

            //k
            let k = 'isActive'

            //check
            if (!isestr(id)) {
                vo.$alert(`${vo.$t('userEditNoUserId')}`, { type: 'error' })
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
                vo.$alert(`${vo.$t('userEditNoUserData')}`, { type: 'error' })
                return
            }

            //外部列(啟用保護時)之身分欄唯讀: 核選方塊已 :disabled, 此為防呆(不變更、不標修改)
            if (vo.isLockedRow(r)) {
                vo.refresh()
                return
            }

            //v
            let _v = get(r, k, 'n')
            let v = _v === 'y' ? 'n' : 'y'
            // console.log(k, v)

            //set
            set(vo, `opt.rows[${kr}].${k}`, v)
            // console.log('vo.opt.rows[kr]', cloneDeep(vo.opt.rows[kr]))

            //refresh
            vo.refresh()

            //isModified
            vo.isModified = true

        },

        addItem: function() {
            // console.log('method addItem')

            let vo = this

            //cloneDeep
            let rows = get(vo, 'opt.rows', [])

            //cloneDeep
            rows = cloneDeep(rows)

            //r
            let r = vo.$ds.users.funNew()
            r.name = vo.$s.getNameNew(rows, 'name', '', vo.$t('userAddNameNew'))
            r.userId = `{${vo.$t('userAddIdNew')}}`
            r.timeCreate = `{${vo.$t('userAddIdNew')}}`
            r.userIdUpdate = `{${vo.$t('userAddIdNew')}}`
            r.timeUpdate = `{${vo.$t('userAddIdNew')}}`
            //transient 欄位 _isNew: 標記未儲存之新列, 隨列送後端供「新增列已存在即拒絕」(saveNewRowExists), 後端檢查後剝除不入庫 (ADR-025)
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
            let nameOld = r.name
            let _r = vo.$ds.users.funNew()
            r.id = _r.id //使用新建方式預先產生id避免重複
            r.from = '' //複製出之列為後台新增列, 不繼承來源(來源非空即外部列, 後台新增列 from 須為空, 否則伺服端 saveFromNotAllowed; 不論是否啟用外部列保護)
            r.name = vo.$s.getNameNew(rows, 'name', nameOld, vo.$t('userCopyNameNew'))
            r.userId = `{${vo.$t('userAddIdNew')}}`
            r.timeCreate = `{${vo.$t('userAddIdNew')}}`
            r.userIdUpdate = `{${vo.$t('userAddIdNew')}}`
            r.timeUpdate = `{${vo.$t('userAddIdNew')}}`
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
                console.log(`size(vo.itemsCheck) === 0`, vo.itemsCheck)
                vo.$alert(`${vo.$t('anUnexpectedErrorOccurred')}`, { type: 'error' })
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

        getCgrupsText: function(cgrups) {
            // console.log('method getCgrupsText', cgrups)

            let vo = this

            //kpGrup
            let kpGrup = {}
            try {
                // console.log('cgrups', cgrups)
                kpGrup = cvKpToObj(JSON5.parse(cgrups), { hasMode: true }) //陣列形式經共用解碼(R-AUTH-LIST-01): 修前把陣列索引當群組名
            }
            catch (err) {}

            let vs = []
            eachOwn(kpGrup, (v, k) => {
                // console.log(k, 'v', v)

                //isActive
                let isActive = get(v, 'isActive', '')
                if (isActive !== 'y') {
                    return true //跳出換下一個
                }
                // console.log(k, '_isActive', _isActive)

                //push
                vs.push(k)

            })

            //cgrupsText
            let cgrupsText = vo.$t('userRnderCgrupsNoGroup')
            let t = vo.$t('userRnderCgrupsHasNGroups')
            let n = size(vs)
            if (n > 0) {
                t = t.replace('{n}', n)
                if (n === 1) {
                    t = t.replace('{nms}', `(${vs[0] === '' ? '""' : vs[0]})`) //空字串名稱(R-PRINCIPLE-00 f 照原樣保留)顯示為 "", 否則括號內看不到而像是消失
                }
                else {
                    t = t.replace('{nms}', '')
                }
                cgrupsText = t
            }

            return cgrupsText
        },

        showVeCgrupsById: function(id) {
            // console.log('method showVeCgrupsById', id)

            let vo = this

            //check
            if (!isestr(id)) {
                vo.$alert(`${vo.$t('userEditCgrupsNoUserId')}`, { type: 'error' })
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
                vo.$alert(`${vo.$t('userEditCgrupsNoUserData')}`, { type: 'error' })
                return
            }

            // //getUserRules
            // let kur = vo.$s.getUserRules(r, vo.grups, vo.pemis, vo.targets)
            // // console.log('getUserRules kur', kur)

            //baseline0: 開啟編輯器當下之載入基準(整表, F-26、原則 7 表級比對, 外審 sol R1 與 run11 第 1 點): 編輯器開著時若他人／外部同步改了任何一列或增刪列, 而父頁當時無未存編輯, 推播會重建 items 與基準,
            //編輯器回傳之字串仍是舊版內容, 回填後存檔會以「新基準」證明過期內容新鮮(還原已被撤銷之授權, 或繞過同表別列已被改動之整表比對); 故回填前比對「草稿現所依據之那份表」與開框時之基準, 有異即放棄回填並提示重新載入.
            //父頁已有未存編輯時推播只保留草稿與其基準(baseRows 不變), 此比對不誤擋, 存檔時由伺服端表級比對拒收
            let baseline0 = cloneDeep(vo.baseline)
            //showVeCgrups
            vo.$dg.showVeCgrups({
                isEditable: vo.isEditable,
                user: r,
            })
                .then((cgrups) => {
                    // console.log('cgrups', cgrups)

                    //以 id 於「現在」之 opt.rows 重新找列(R-REL-PAIR-01): 對話框開啟期間 store 更新會重建 opt.rows(他人增刪、改 order), 開框時之列索引可能已指向另一列; 該列已不存在則提示並放棄回填
                    let krNow = -1
                    each(get(vo, 'opt.rows', []), (v, k) => {
                        if (get(v, 'id', '') === id) {
                            krNow = k
                            return false //跳出
                        }
                    })
                    if (krNow < 0) {
                        vo.$alert(`${vo.$t('userEditCgrupsNoUserData')}`, { type: 'error' })
                        return
                    }

                    //草稿所依據之表於編輯器開啟後已被改動(整表指紋與開框時之基準不同; 僅 order／伺服器管理欄不同不算): 放棄回填並提示重新載入(同伺服端 saveStale 之語意)
                    if (isDraftStale({ keys: vo.$ds.users.keys, rows: vo.baseRows, baseline: baseline0 })) {
                        vo.$alert(`${vo.$t('saveStale')}`, { type: 'warning' })
                        return
                    }

                    //set
                    set(vo, `opt.rows[${krNow}].cgrups`, cgrups)
                    // console.log('vo.opt.rows[krNow]', cloneDeep(vo.opt.rows[krNow]))

                    //refresh
                    vo.refresh()

                    //isModified
                    vo.isModified = true

                })
                .catch(() => {})

        },

        saveUsers: function(msg) {
            //promiseUnlock 之鎖交由 doSaveUsers 之 runSubmit 於請求結束時釋放, 不於此解鎖: 請求期間儲存鈕之滑鼠與鍵盤 Enter 皆擋 (ADR-025;
            //原第一行即 msg.pm.resolve(), 鎖立即解除, 焦點留在儲存鈕時連按 Enter 可送出 2 次)
            let vo = this
            vo.doSaveUsers({ pm: msg.pm })
        },

        doSaveUsers: function(opt = {}) {
            // console.log('method doSaveUsers')

            let vo = this

            async function core(unlockBtn) {

                //1) 同步檢測 (在開 loading 之前); 早退之訊息框前以 unlockBtn() 釋放儲存鈕之 promiseUnlock 鎖: 按鈕鎖只涵蓋請求期間,
                //結果訊息框出現時按鈕已恢復(與打 API 之路徑一致); 流程狀態仍由 runSubmit 保持至訊息框關閉 (ADR-025)
                if (isestr(vo.isError)) {
                    unlockBtn()
                    await vo.$dg.showCheckYes(`${vo.isError}`)
                    return
                }

                //rows, baseline: 與 rows 同一刻(同步)擷取——兩者於 changeParams 同一處同時產生, 之後若推播重建清單, 仍帶「草稿所依據之那一版」之基準(F-26), 不由最新 store 重算
                let rows = get(vo, 'opt.rows', [])
                let baseline = cloneDeep(vo.baseline)

                //check
                if (size(rows) === 0) {
                    unlockBtn()
                    await vo.$dg.showCheckYes(`${vo.$t('userAddEmpty')}`)
                    return
                }

                //外部列保護(啟用時): 外部列之身分／結構欄以逐列唯讀與刪除過濾擋下, 但貼上(Ctrl+V)等路徑可繞過逐列唯讀, 送出前再比對一次(基準為 store 之 users);
                //有違規即不送出並提示(伺服端同樣整次拒收 saveExternalRowChanged); 於開 loading 之前, 訊息框前釋放按鈕鎖
                if (vo.isLockExternal && getExternalEdits({ keyTable: 'users', keys: vo.$ds.users.keys, rowsNew: rows, rowsOld: vo.baseRows }) !== null) {
                    unlockBtn()
                    await vo.$dg.showCheckYes(vo.$t('saveExternalRowChanged'), { type: 'warning' })
                    return
                }

                //新增列之 transient 欄位 _isNew(addItem / copyItem 標記)隨列送後端: 後端據以拒絕「標為新增但 id 已存在」之列
                //(同一包重送時不把剛建立之列當修改覆寫, 回 saveNewRowExists), 檢查後由 ltdtmapping 依 schema 取欄時剝除不入庫 (ADR-025);
                //modeEditUsers='for:grups' 時後端不採納新增列(mergePickKeysOnly), 亦不檢查

                //2) 確定打 API 才開 loading
                vo.$ui.updateLoading(true)

                //3) updateUsers, 各自 catch + 旗標短路; 第 2 參 { baseline } 為載入基準(伺服端於表鎖內比對本次將寫入之列是否仍與草稿所依據之版本相同, 否則整次拒收 saveStale)
                let okSave = false
                vo.saveMark.saving = true //自己之存檔請求進行中: 此期間之推播不是他人更新(changeParams 的 planDraftSync 回 'keepQuiet'); 回應(成功或失敗)一到即歸零
                await vo.$fapi.updateUsers(rows, { baseline })
                    .then(() => {
                        okSave = true
                        vo.saveMark.saving = false
                    })
                    .catch(async (err) => {
                        vo.saveMark.saving = false
                        vo.staleNotice = isDraftStale({ keys: vo.$ds.users.keys, rows: vo.users, baseline: vo.syncMark.baseline }) //失敗(含 saveStale 被拒): 請求進行中被安靜保留之推播, 此時依目前 store 重算過期提示(同 changeParams 之保留分支)
                        vo.$ui.updateLoading(false) //showCheckYes 前關 loading（modal 阻斷期間避免 loading 疊在底下）
                        await vo.$dg.showCheckYes(`${vo.$t('userSaveUsersFail')}: ${vo.$tErr(err)}`)
                    })
                if (!okSave) return

                //isModified
                vo.isModified = false

                //alert（showCheckYes 前關 loading，避免 modal 等待期間 loading 疊在底下）
                vo.$ui.updateLoading(false)
                await vo.$dg.showCheckYes(vo.$t('userSaveUsersSuccess'), { type: 'success' })

            }

            //runSubmit: 儲存流程(至結果訊息框關閉)進行中再觸發即略過; opt.pm 為儲存鈕之 promiseUnlock 鎖, 於請求結束(updateLoading(false))時釋放 (ADR-025)
            return vo.$ui.runSubmit('saveUsers', (unlockBtn) => {
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
