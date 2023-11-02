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
            <div style="display:inline-block; vertical-align:top; padding:10px 0px 5px 20px;">
                <div style="display:flex; align-items:center; padding:5px 15px 5px 5px; border-bottom:3px solid #FF9100;">

                    <WIcon
                        :icon="mdiGamepadCircle"
                        :color="'#FF9800'"
                    ></WIcon>

                    <div style="padding-left:10px; font-size:1.3rem; color:#d3912c;">
                        {{$t('managementTargets')}}
                    </div>

                </div>
            </div>

            <!-- 編輯設定區 -->
            <div style="display:inline-block; vertical-align:top;">

                <div style="padding:15px 20px 15px 20px; background:#fff;">

                    <div style="display:flex;">
                        <WSwitch
                            :text="$t('isEditabled')"
                            :checkedSwitchCircleColor="'#D81B60'"
                            :checkedSwitchCircleColorHover="'#f26'"
                            :checkedSwitchBarColor="'#F8BBD0'"
                            :checkedSwitchBarColorHover="'#F8BBD0'"
                            _v-model="isOperatable"
                            :value="isOperatable"
                            @input="updateIsOperatable"
                        ></WSwitch>
                    </div>

                    <div style="padding-top:5px; font-size:0.8rem; _color:#f26;" v-if="isOperatable">
                        <div style="padding:3px 0px;">
                            1. {{$t('targetMsg1')}}
                        </div>
                        <div style="padding:3px 0px;">
                            2. {{$t('targetMsg2')}}
                        </div>
                    </div>

                </div>

            </div>

            <!-- 儲存變更提示區 -->
            <div
                style="padding:10px 10px 12px 10px; border-top:1px solid #F48FB1; border-bottom:1px solid #F48FB1; background:#FCE4EC; display:flex; align-items:center; justify-content:flex-end;"
                v-if="isModified"
            >

                <WButtonChip
                    :paddingStyle="{v:0,h:11}"
                    :text="$t('saveChanges')"
                    :icon="mdiCloudUploadOutline"
                    :backgroundColor="'rgba(255,0,50,0.7)'"
                    :backgroundColorHover="'rgba(255,0,50,0.8)'"
                    :textColor="'#eee'"
                    :textColorHover="'#fff'"
                    :iconColor="'#eee'"
                    :iconColorHover="'#fff'"
                    @click="saveRuleGroupsAndTargets"
                ></WButtonChip>

            </div>

        </div>

        <div :style="`padding:${spacePading}px;`" v-if="!firstLoading">

            <div style="background:#fff; box-shadow:0 3px 1px -2px rgba(0,0,0,.2), 0 2px 2px 0 rgba(0,0,0,.14), 0 1px 5px 0 rgba(0,0,0,.12);">
                <WTree
                    ref="wt"
                    :viewHeightMax="treeHeight"
                    :separatorColor="'rgba(0,0,0,0.1)'"
                    :data.sync="treeBlocks"
                    :indent="0.5"
                    :iconToggleColor="'#666'"
                    :iconToggleBackgroundColor="'transparent'"
                    :iconToggleBackgroundColorHover="'transparent'"
                    :operatable="isOperatable"
                    :operateBtnTooltip="$t('edit')"
                    :operateItemTextForRename="$t('changeName')"
                    :operateItemTextForInsertBefore="$t('insertBefore')"
                    :operateItemTextForInsertChild="$t('insertChild')"
                    :operateItemTextForInsertAfter="$t('insertAfter')"
                    :operateItemTextForDelete="$t('deleteTarget')"
                    :editorRenameSaveBtnText="$t('save')"
                    :editorRenameSaveBtnTextColor="'#444'"
                    :editorRenameSaveBtnTextColorHover="'#222'"
                    :editorRenameCancelBtnText="$t('cancel')"
                    :editorRenameCancelBtnTextColor="'#444'"
                    :editorRenameCancelBtnTextColorHover="'#222'"
                    @click-operate-item="clickOperateItem"
                ></WTree>
            </div>

        </div>

        <div style="padding:10px 15px; font-size:0.8rem;" v-else>
            {{$t('waitingData')}}
        </div>

    </div>
</template>

<script>
import { mdiGamepadCircle, mdiStackOverflow, mdiAccountGroupOutline, mdiBallotRecountOutline, mdiCloudUploadOutline } from '@mdi/js/mdi.js'
import JSON5 from 'json5'
import get from 'lodash/get'
import set from 'lodash/set'
import each from 'lodash/each'
import map from 'lodash/map'
import size from 'lodash/size'
import dropRight from 'lodash/dropRight'
import cloneDeep from 'lodash/cloneDeep'
import haskey from 'wsemi/src/haskey.mjs'
import genID from 'wsemi/src/genID.mjs'
import delay from 'wsemi/src/delay.mjs'
import flattenTree from 'wsemi/src/flattenTree.mjs'
import WIcon from 'w-component-vue/src/components/WIcon.vue'
import WButtonChip from 'w-component-vue/src/components/WButtonChip.vue'
import WSwitch from 'w-component-vue/src/components/WSwitch.vue'
import WTree from 'w-component-vue/src/components/WTree.vue'
import { getTreeBlocks } from '../plugins/mShare.mjs'


//dlm
let dlm = '.'


export default {
    components: {
        WIcon,
        WButtonChip,
        WSwitch,
        WTree,
    },
    props: {
    },
    data: function() {
        return {
            mdiGamepadCircle,
            mdiStackOverflow,
            mdiAccountGroupOutline,
            mdiBallotRecountOutline,
            mdiCloudUploadOutline,

            panelWidth: 100,
            panelHeight: 100,
            headHeight: 100,

            firstLoading: true,
            isOperatable: true,
            isModified: false,

            treeBlocks: null,
            listRename: [],

        }
    },
    mounted: function() {
        // console.log('mounted')

        let vo = this

        //clear
        vo.listRename = []

    },
    computed: {

        targets: function() {
            return get(this, `$store.state.targets`)
        },

        ruleGroups: function() {
            return get(this, `$store.state.ruleGroups`)
        },

        changeTargets: function() {
            // console.log('computed changeTargets')

            let vo = this

            //check
            if (size(vo.targets) === 0) {
                return ''
            }

            //getTreeBlocks
            let treeBlocks = getTreeBlocks(vo.targets)
            // console.log('targets', vo.targets)
            // console.log('treeBlocks', treeBlocks)

            //save
            vo.treeBlocks = treeBlocks

            //firstLoading
            vo.firstLoading = false

            return ''
        },

        spacePading: function() {
            let vo = this
            if (vo.panelWidth < 400) {
                return 0
            }
            else if (vo.panelWidth < 800) {
                return 10
            }
            return 20
        },

        treeHeight: function() {
            let vo = this

            //h
            let h = vo.panelHeight - vo.headHeight - 2 * vo.spacePading
            h = Math.max(h, 0)

            return h
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

        updateIsOperatable: function(isOperatable) {
            // console.log('methods updateIsOperatable', isOperatable)

            let vo = this

            async function core() {
                // let errTemp = null

                //show loading
                vo.$ui.updateLoading(true)

                //isOperatable
                if (isOperatable) {
                    //切換至編輯模式時
                    try {

                        //先顯示全部節點
                        let toUnfolding = true
                        let toLevel = null
                        vo.$refs.wt.toggleItemsAll(toUnfolding, toLevel)

                        //若節點多顯示全部節點須一些時間, 故延遲變更
                        await delay(300)

                        //update
                        vo.isOperatable = isOperatable


                    }
                    catch (err) {}
                }
                else {
                    //切換至顯示模式時

                    //update
                    vo.isOperatable = isOperatable

                }

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

        clickOperateItem: function(msg) {
            // console.log('methods clickOperateItem', msg)

            let vo = this

            async function core() {

                //fun, 僅處理並回傳新項目, 不處理其他項目
                let fun = async function() {
                    let id = genID()
                    let text = vo.$t('newTarget')
                    let dataNew = {
                        id,
                        text,
                    }
                    return dataNew
                }

                //targetInd
                let targetInd = msg.rowItem.index

                //operateItem
                await msg.operateItem(targetInd, msg.opItem.key, fun)

                //modifyTreeBlocks
                vo.modifyTreeBlocks()

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

        },

        modifyTreeBlocks: function() {
            // console.log('methods modifyTreeBlocks')

            let vo = this

            //treeBlocksTemp
            let treeBlocksTemp = cloneDeep(vo.treeBlocks)

            //flattenTree
            let blocksNew = flattenTree(treeBlocksTemp)
            // console.log('blocksNew', cloneDeep(blocksNew))

            //calc id, parentId, order
            each(blocksNew, (v, k) => {
                if (size(v.nk) === 1) {
                    v.parentId = ''
                    v.id = v.text
                }
                else { //size(v.nk)>=3
                    let nkParent = dropRight(v.nk, 2)
                    let p = get(treeBlocksTemp, nkParent)
                    v.parentId = p.id
                    v.id = `${v.parentId}${dlm}${v.text}` //[tag:dlm]
                }
                v.order = k //需重新給予order
                set(treeBlocksTemp, v.nk, v)
            })

            //save
            vo.treeBlocks = treeBlocksTemp
            // console.log('treeBlocks', cloneDeep(treeBlocksTemp))

            //isModified
            vo.isModified = true

        },

        saveRuleGroupsAndTargets: function() {
            // console.log('method saveRuleGroupsAndTargets')

            let vo = this

            //replaceObjKeys
            let replaceObjKeys = (obj, kpKeys) => {
            // console.log('methods replaceObjKeys', obj, kpKeys)

                //r
                let b = false
                let r = {}
                each(obj, (v, k) => {
                    if (haskey(kpKeys, k)) {
                        b = true
                        let kk = kpKeys[k]
                        r[kk] = v
                    }
                    else {
                        r[k] = v
                    }
                })

                return {
                    obj: r,
                    isChanged: b,
                }
            }

            async function core() {
                let errTemp = null

                //show loading
                vo.$ui.updateLoading(true)

                //treeBlocksTemp
                let treeBlocksTemp = cloneDeep(vo.treeBlocks)

                //flattenTree
                let blocksNew = flattenTree(treeBlocksTemp)
                // console.log('blocksNew1', cloneDeep(blocksNew))

                //kpDiffs
                let kpDiffs = {}
                map(blocksNew, (v, k) => {
                    if (v.id !== v.idTemp) {
                        kpDiffs[v.idTemp] = v.id
                    }
                })
                // console.log('kpDiffs', kpDiffs)

                //gs
                let gs = []
                each(vo.ruleGroups, (v) => {
                    let rules = JSON5.parse(v.crules)
                    let r = replaceObjKeys(rules, kpDiffs)
                    if (r.isChanged) {
                        gs.push({
                            id: v.id,
                            crules: JSON.stringify(r.obj),
                        })
                    }
                })
                // console.log('ruleGroups', vo.ruleGroups, gs)

                //save
                await vo.$fapi.ruleGroups.save(gs)
                    .catch((err) => {
                        errTemp = err
                    })

                //check
                if (errTemp !== null) {
                    vo.$alert(`${vo.$t('failedToChangePermissionGroups')}: ${errTemp}`, { type: 'error' })
                    return
                }

                //rs
                let rs = map(blocksNew, (v, k) => {
                    return {
                        id: v.id,
                        order: v.order,
                    }
                })
                // console.log('targets rs', rs)

                //delAll
                await vo.$fapi.targets.delAll()
                    .catch((err) => {
                        errTemp = err
                    })

                //check
                if (errTemp !== null) {
                    vo.$alert(`${vo.$t('failedToClearTargets')}: ${errTemp}`, { type: 'error' })
                    return
                }

                //save
                await vo.$fapi.targets.save(rs)
                    .catch((err) => {
                        errTemp = err
                    })

                //check
                if (errTemp !== null) {
                    vo.$alert(`${vo.$t('failedToSaveTargets')}: ${errTemp}`, { type: 'error' })
                    return
                }

                //isModified
                vo.isModified = false

                //alert
                vo.$alert(vo.$t('successfulToSaveTargets'))

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
