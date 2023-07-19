<template>
    <div
        style="height:100%;"
        v-domresize
        @domresize="resizePanel"
        :changeGroups="changeGroups"
    >

        <div
            style="border-bottom:1px solid #ddd;"
            v-domresize
            @domresize="resizeHead"
        >

            <!-- 標題區 -->
            <div style="padding:30px 25px 0px 20px; background:#fff;">
                <div style="padding:5px 15px 5px 5px; display:inline-block; border-bottom:3px solid #FF9100;">
                    <div style="display:flex; align-items:center;">

                        <WIcon
                            :icon="mdiStackOverflow"
                            :color="'#FF9800'"
                        ></WIcon>

                        <div style="padding-left:10px; font-size:1.3rem; color:#d3912c;">
                            管理權限群組
                        </div>

                    </div>
                </div>
            </div>

            <!-- 編輯設定區 -->
            <div style="background:#fff;">

                <div style="padding:20px 20px 15px 20px; background:#fff;">

                    <div style="display:flex;">
                        <WSwitch
                            :text="'是否編輯'"
                            :checkedSwitchCircleColor="'#D81B60'"
                            :checkedSwitchCircleColorHover="'#f26'"
                            :checkedSwitchBarColor="'#F8BBD0'"
                            :checkedSwitchBarColorHover="'#F8BBD0'"
                            v-model="isOperatable"
                        ></WSwitch>
                    </div>

                    <div style="padding-top:5px; font-size:0.8rem; _color:#f26;" v-if="isOperatable">
                        <div style="padding:3px 0px;">
                            1. 請依照系統管理需求創建適合各類使用者適合的權限群組。
                        </div>
                        <div style="padding:3px 0px;">
                            2. 開啟編輯時可拖曳權限群組變更其相對順序。
                        </div>
                        <div style="padding:3px 0px;">
                            3. 此區域變更時將自動儲存。
                        </div>
                    </div>

                </div>

                <div
                    style="padding:10px 10px 12px 10px; border-top:1px solid #F48FB1; border-bottom:1px solid #F48FB1; background:#FCE4EC; display:flex; align-items:center; justify-content:flex-end;"
                    v-if="isModified"
                >

                    <WButtonChip
                        :paddingStyle="{v:0,h:11}"
                        :text="'儲存變更'"
                        :icon="mdiCloudUploadOutline"
                        :backgroundColor="'rgba(255,0,50,0.7)'"
                        :backgroundColorHover="'rgba(255,0,50,0.8)'"
                        :textColor="'#eee'"
                        :textColorHover="'#fff'"
                        :iconColor="'#eee'"
                        :iconColorHover="'#fff'"
                        @click="saveGroups"
                    ></WButtonChip>

                </div>

            </div>

        </div>

        <div :style="`padding:${spacePading}px;`" v-if="!firstLoading">

            <div style="background:#fff; box-shadow:0 3px 1px -2px rgba(0,0,0,.2), 0 2px 2px 0 rgba(0,0,0,.14), 0 1px 5px 0 rgba(0,0,0,.12);">

                <div
                    v-domresize
                    @domresize="resizeGroupInfor"
                >

                    <!-- 權限群組區(含新增) -->
                    <div style="padding:10px 20px; border-bottom:3px solid #ddd;">

                        <WGroupTags
                            :keyText="'name'"
                            :draggable="isOperatable"
                            :editableClose="isOperatable"
                            :editableInput="isOperatable"
                            :addButtonText="'新增群組'"
                            :addButtonTooltip="'新增權限群組'"
                            :addButtonTextColor="'#eee'"
                            :addButtonTextColorHover="'#fff'"
                            :addButtonIconColor="'#eee'"
                            :addButtonIconColorHover="'#fff'"
                            :addButtonBackgroundColor="'rgba(255,0,50,0.7)'"
                            :addButtonBackgroundColorHover="'rgba(255,0,50,0.8)'"
                            :value="groupsTrans"
                            @input="dragGroupsOrder"
                            @click="clickGroup"
                            @click-add="clickAddGroup"
                            @click-close="clickRemoveGroup"
                        ></WGroupTags>

                    </div>

                </div>

                <ruleGroup
                    :height="ruleGroupHeight"
                    :group="pickGroup"
                    :editable="isOperatable"
                    @update="modifyGroup"
                    v-if="pickGroup"
                ></ruleGroup>

                <div
                    style="padding:20px; _color:#666; font-size:0.85rem;"
                    v-else
                >
                    未選擇權限群組，請點擇上方任一權限群組以顯示管理範圍。
                </div>

            </div>

        </div>

        <div style="padding:10px 15px; font-size:0.8rem;" v-else>
            載入中...
        </div>

    </div>
</template>

<script>
import { mdiStackOverflow, mdiVectorPolylinePlus, mdiCheckboxMarkedCircle, mdiCloudUploadOutline } from '@mdi/js/mdi.js'
import get from 'lodash/get'
import each from 'lodash/each'
import map from 'lodash/map'
import find from 'lodash/find'
import size from 'lodash/size'
import max from 'lodash/max'
import sortBy from 'lodash/sortBy'
import isEqual from 'lodash/isEqual'
import cloneDeep from 'lodash/cloneDeep'
import genID from 'wsemi/src/genID.mjs'
import isestr from 'wsemi/src/isestr.mjs'
import iseobj from 'wsemi/src/iseobj.mjs'
import waitFun from 'wsemi/src/waitFun.mjs'
import WIcon from 'w-component-vue/src/components/WIcon.vue'
import WButtonChip from 'w-component-vue/src/components/WButtonChip.vue'
import WSwitch from 'w-component-vue/src/components/WSwitch.vue'
import WGroupTags from 'w-component-vue/src/components/WGroupTags.vue'
import ruleGroup from './ruleGroup.vue'


export default {
    components: {
        WIcon,
        WButtonChip,
        WSwitch,
        WGroupTags,
        ruleGroup,
    },
    props: {
    },
    data: function() {
        return {
            mdiStackOverflow,
            mdiVectorPolylinePlus,
            mdiCheckboxMarkedCircle,
            mdiCloudUploadOutline,

            panelWidth: 100,
            panelHeight: 100,
            headHeight: 100,
            groupInforHeight: 100,

            firstLoading: true,
            isOperatable: false,
            isModified: false,

            groupsTrans: [],

            pickGroupId: '',

        }
    },
    computed: {

        ruleGroups: function() {
            return get(this, `$store.state.ruleGroups`)
        },

        groups: function() {
            // console.log('computed groups')

            let vo = this

            //rs, 此區程式碼等同於ruleGroups, 若確認後續無需求再移除
            let rs = map(vo.ruleGroups, (v) => {
                // let rules = JSON.parse(v.crules)
                return {
                    ...v,
                    // rules,
                }
            })

            //sortBy
            rs = sortBy(rs, 'order')

            return rs
        },

        changeGroups: function() {
            // console.log('computed changeGroups')

            let vo = this

            //default
            vo.groupsTrans = []

            //check
            if (size(vo.groups) === 0) { //不能用被修改的groupsTrans, 否則會反覆觸發
                return ''
            }

            //save
            vo.groupsTrans = cloneDeep(vo.groups)

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

        ruleGroupHeight: function() {
            let vo = this

            //h
            let h = vo.panelHeight - vo.headHeight - 2 * vo.spacePading - vo.groupInforHeight
            h = Math.max(h, 0)

            return h
        },

        pickGroup: function() {
            // console.log('computed pickGroup')

            let vo = this

            //find, 點擊權限按鈕提供權限物件, 刪除後找不到亦可自動清空
            let r = find(vo.groupsTrans, { id: vo.pickGroupId })

            return r
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

        resizeGroupInfor: function(msg) {
            // console.log('methods resizeGroupInfor', msg)

            let vo = this

            //groupInforHeight
            vo.groupInforHeight = msg.snew.offsetHeight

        },

        getDescription: function(g) {
            // console.log('methods getDescription', g)

            //r
            let r = get(g, 'description', '')

            //check
            if (!isestr(r)) {
                r = '無說明'
            }

            return r
        },

        clickGroup: function(msg) {
            // console.log('methods clickGroup', msg)

            let vo = this

            //g
            let g = get(msg, 'item', {})
            // console.log('g', g)

            //id
            let id = get(g, 'id', '')

            //save
            vo.pickGroupId = id

        },

        clickAddGroup: function() {
            // console.log('methods clickAddGroup')

            let vo = this

            async function core() {
                let errTemp = null

                //show loading
                vo.$ui.updateLoading(true)

                //orderMax
                let orderMax = null
                orderMax = map(vo.groupsTrans, 'order')
                orderMax = max(orderMax) + 1

                //g
                let g = {
                    id: genID(),
                    name: '新權限群組',
                    crules: `{ "___all___": { "show": "n", "active": "n" } }`,
                    order: orderMax,
                }

                //save
                await vo.$fapi.ruleGroups.insert(g)
                    .catch((err) => {
                        errTemp = err
                    })

                //check
                if (errTemp !== null) {
                    vo.$alert(`新增權限群組失敗: ${errTemp}`, { type: 'error' })
                }

                //gn
                let gn = null
                await waitFun(() => {
                    gn = find(vo.groupsTrans, { id: g.id })
                    let b = iseobj(gn) //確認g.id已存在
                    // console.log('waitFun', gn, b)
                    return b
                })
                // console.log('gn', gn)

                //alert
                vo.$alert(`新增權限群組成功`)

            }

            //core
            core()
                // .then((res) => {
                //     console.log('then', res)
                // })
                .catch((err) => {
                    console.log('catch', err)
                    vo.$alert(`發生非預期錯誤，請洽管理員`, { type: 'error' })
                })
                .finally(() => {

                    //hide loading
                    vo.$ui.updateLoading(false)

                })

        },

        clickRemoveGroup: function(msg) {
            // console.log('methods clickRemoveGroup', msg)

            let vo = this

            async function core() {
                let errTemp = null

                //g
                let g = get(msg, 'item', {})

                //name
                let name = get(g, 'name', '未知')

                //showCheckYesNo
                let bExit = false
                await vo.$dg.showCheckYesNo(`確認是否刪除權限群組「${name}」?`)
                    .catch(() => {
                        bExit = true
                    })
                if (bExit) {
                    return
                }

                //show loading
                vo.$ui.updateLoading(true)

                //save
                await vo.$fapi.ruleGroups.del(g)
                    .catch((err) => {
                        errTemp = err
                    })

                //check
                if (errTemp !== null) {
                    vo.$alert(`刪除權限群組失敗: ${errTemp}`, { type: 'error' })
                    return
                }

                //gn
                let gn = null
                await waitFun(() => {
                    gn = find(vo.groupsTrans, { id: g.id })
                    let b = !iseobj(gn) //確認g.id已不存在
                    // console.log('waitFun', gn, b)
                    return b
                })
                // console.log('gn', gn)

                //alert
                vo.$alert(`刪除權限群組成功`)

            }

            //core
            core()
                // .then((res) => {
                //     console.log('then', res)
                // })
                .catch((err) => {
                    console.log('catch', err)
                    vo.$alert(`發生非預期錯誤，請洽管理員`, { type: 'error' })
                })
                .finally(() => {

                    //hide loading
                    vo.$ui.updateLoading(false)

                })

        },

        dragGroupsOrder: function(groupsNew) {
            // console.log('dragGroupsOrder', groupsNew)

            let vo = this

            async function core() {
                let errTemp = null

                //check, 新增或刪除皆跳出, 僅處理排序之操作
                if (size(vo.groupsTrans) !== size(groupsNew)) {
                    return
                }
                // console.log(`size(vo.groupsTrans)`, size(vo.groupsTrans))
                // console.log(`size(groupsNew)`, size(groupsNew))

                //show loading
                vo.$ui.updateLoading(true)

                //gs
                let gs = []
                each(groupsNew, (v, k) => {
                    gs.push({
                        id: v.id,
                        order: k,
                    })
                })
                // console.log('gs', gs)

                //save
                await vo.$fapi.ruleGroups.save(gs)
                    .catch((err) => {
                        errTemp = err
                    })

                //check
                if (errTemp !== null) {
                    vo.$alert(`變更權限群組順序失敗: ${errTemp}`, { type: 'error' })
                    return
                }

                //gsn
                let gsn = null
                await waitFun(() => {
                    gsn = map(vo.groupsTrans, (v, k) => {
                        return {
                            id: v.id,
                            order: k,
                        }
                    })
                    return isEqual(gsn, gs)
                })
                // console.log('gsn', gsn)

                //alert
                vo.$alert(`變更權限群組順序成功`)

            }

            //core
            core()
                // .then((res) => {
                //     console.log('then', res)
                // })
                .catch((err) => {
                    console.log('catch', err)
                    vo.$alert(`發生非預期錯誤，請洽管理員`, { type: 'error' })
                })
                .finally(() => {

                    //hide loading
                    vo.$ui.updateLoading(false)

                })

        },

        modifyGroup: function(group) {
            // console.log('methods modifyGroup', group)

            let vo = this

            //check
            if (!isestr(group.name)) {
                vo.$alert(`權限群組名稱請記得給予`, { type: 'warning' })
            }

            //modify
            each(vo.groupsTrans, (v, k) => {
                if (v.id === group.id) {
                    vo.groupsTrans[k] = group
                }
            })
            // console.log('vo.groupsTrans', cloneDeep(vo.groupsTrans))

            //isModified
            vo.isModified = true

        },

        saveGroups: function() {
            // console.log('methods saveGroups')

            let vo = this

            async function core() {
                let errTemp = null

                //check
                let b = false
                each(vo.groupsTrans, (v, k) => {
                    if (!isestr(v.name)) {
                        vo.$alert(`第 ${k + 1} 個權限群組名稱為空`, { type: 'error' })
                        b = true
                    }
                })
                if (b) {
                    return
                }

                //show loading
                vo.$ui.updateLoading(true)

                //groups
                let groups = map(vo.groupsTrans, (group) => {
                    let g = {
                        id: group.id,
                        name: group.name,
                        description: group.description,
                        crules: group.crules,
                    }
                    return g
                })

                //save
                await vo.$fapi.ruleGroups.save(groups)
                    .catch((err) => {
                        errTemp = err
                    })

                //check
                if (errTemp !== null) {
                    vo.$alert(`儲存權限群組失敗: ${errTemp}`, { type: 'error' })
                    return
                }

                //isModified
                vo.isModified = false

                //alert
                vo.$alert(`儲存權限群組成功`)

            }

            //core
            core()
                // .then((res) => {
                //     console.log('then', res)
                // })
                .catch((err) => {
                    console.log('catch', err)
                    vo.$alert(`發生非預期錯誤，請洽管理員`, { type: 'error' })
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
