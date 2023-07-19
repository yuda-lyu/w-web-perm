<template>
    <WDialog
        :show.sync="bShow"
        :icon="mdiAccountEdit"
        _maxWidth="1200"
        _minWidth="1200"
        :fullscreen="true"
        :title="'編修使用者'"
        :save-btn-tooltip="'儲存'"
        :close-btn-tooltip="'關閉'"
        @click-save="clickSave"
        @click-close="clickClose"
        @resize="resize"
    >
        <template v-slot:content>
            <div style="min-height:400px;">

                <div style="padding-top:20px;"></div>

                <div style="padding:0px 20px 20px 20px; display:flex; align-items:center;">

                    <div style="padding-right:10px; color:#777; white-space:nowrap;">使用者姓名:</div>

                    <WText
                        style="width:100%;"
                        v-model="u.name"
                    ></WText>

                </div>

                <div style="padding:0px 20px 20px 20px; display:flex; align-items:center;">

                    <div style="padding-right:10px; color:#777; white-space:nowrap;">電子郵件:</div>

                    <WText
                        style="width:100%;"
                        v-model="u.email"
                    ></WText>

                </div>

                <div style="padding:0px 20px 20px 20px; display:flex; align-items:center;">

                    <div style="padding-right:10px; color:#777; white-space:nowrap;">來源:</div>

                    <WTextSuggest
                        style="width:200px;"
                        :noResultsText="'無'"
                        :items="userFroms"
                        v-model="u.from"
                    ></WTextSuggest>

                </div>

                <div style="padding-top:20px; border-top:1px solid #ddd;"></div>

                <div style="padding:0px 20px 20px 20px;">

                    <div style="padding-bottom:5px; color:#777; white-space:nowrap;">隸屬權限群組:</div>

                    <div
                        style="display:inline-block; padding:0px 15px 15px 0px;"
                        :key="kg"
                        v-for="(g,kg) in groups"
                    >

                        <div style="padding:3px 15px 3px 0px; _border-radius:30px; _border:1px dashed #aaa; display:flex; align-content:center;">

                            <WCheckbox
                                :value="kpugs[g.id]"
                                _checkedIconColor="'rgba(200,70,20,0.8)'"
                                _uncheckedIconColor="'rgba(200,70,20,0.8)'"
                                @input="(v)=>{modifyUserRuleGroupsIds(g.id,v)}"
                            ></WCheckbox>

                            <div>
                                {{g.name}}
                            </div>

                        </div>

                    </div>

                    <div style="padding-bottom:5px; color:#777; white-space:nowrap;">使用者可用區塊:</div>

                    <div style="border:1px dashed #f26; background:rgba(255,50,100,0.05);">

                    <ruleGroup
                        :height="600"
                        :group="mergedGroup"
                        :showHead="false"
                        :editable="false"
                    ></ruleGroup>

                    </div>

                </div>

                <div style="padding-top:20px; border-top:1px solid #ddd;"></div>

                <div style="padding:0px 20px 20px 20px; display:flex; align-items:center;">

                    <div style="padding-right:10px; color:#777; white-space:nowrap;">是否為管理者:</div>

                    <WSwitch
                        :value="u.isAdmin==='y'"
                        @input="(v)=>{u.isAdmin=v?'y':'n'}"
                    ></WSwitch>

                </div>

                <div style="padding:0px 20px 20px 20px; display:flex; align-items:center;">

                    <div style="padding-right:10px; color:#777; white-space:nowrap;">是否有效:</div>

                    <WSwitch
                        :value="u.isActive==='y'"
                        @input="(v)=>{u.isActive=v?'y':'n'}"
                    ></WSwitch>

                </div>

                <div style="padding-top:20px; border-top:1px solid #ddd;"></div>

                <div style="padding:0px 20px 20px 20px; display:flex; align-items:center;">

                    <div style="padding-right:10px; color:#777; white-space:nowrap;">備註:</div>

                    <WText
                        style="width:100%;"
                        v-model="u.description"
                    ></WText>

                </div>

                <div style="padding-top:20px; border-top:1px solid #ddd;"></div>

                <div style="padding:0px 20px 20px 20px; display:flex; align-items:center;">

                    <div style="padding-right:10px; color:#777; white-space:nowrap;">創建日期:</div>

                    <div style="padding:0px 7px; border-radius:20px; font-size:0.8rem; color:#fff; background:#A1887F;">
                        {{getCreateDay(u)}}
                    </div>

                </div>

            </div>
        </template>
    </WDialog>
</template>

<script>
import { mdiAccountEdit, mdiFileTree } from '@mdi/js/mdi.js'
import Vue from 'vue'
import get from 'lodash/get'
import each from 'lodash/each'
import map from 'lodash/map'
import trim from 'lodash/trim'
import uniq from 'lodash/uniq'
import filter from 'lodash/filter'
import join from 'lodash/join'
import sortBy from 'lodash/sortBy'
import cloneDeep from 'lodash/cloneDeep'
import genPm from 'wsemi/src/genPm.mjs'
import sep from 'wsemi/src/sep.mjs'
import timemsTZ2day from 'wsemi/src/timemsTZ2day.mjs'
import isernot from 'wsemi/src/isernot.mjs'
import isestr from 'wsemi/src/isestr.mjs'
import WDialog from 'w-component-vue/src/components/WDialog.vue'
import WText from 'w-component-vue/src/components/WText.vue'
import WTextSuggest from 'w-component-vue/src/components/WTextSuggest.vue'
import WSwitch from 'w-component-vue/src/components/WSwitch.vue'
import WCheckbox from 'w-component-vue/src/components/WCheckbox.vue'
import { getUserRules } from '../plugins/mShare.mjs'
import ruleGroup from './ruleGroup.vue'


export default {
    components: {
        WDialog,
        WText,
        WTextSuggest,
        WSwitch,
        WCheckbox,
        ruleGroup,
    },
    props: {
    },
    data: function() {
        return {
            mdiAccountEdit,
            mdiFileTree,

            bShow: false,
            pm: null,

            // panelHeight: 100,

            u: null,
            kpugs: {},
            mergedGroup: {},

        }
    },
    mounted: function() {
        //console.log('mounted')

        let vo = this

        //set
        Vue.prototype.$dg.showVeUser = vo.show

    },
    computed: {

        targets: function() {
            return get(this, `$store.state.targets`)
        },

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

        users: function() {
            return get(this, `$store.state.users`)
        },

        userFroms: function() {
            let vo = this
            let froms = map(vo.users, 'from')
            froms = uniq(froms)
            froms = filter(froms, isernot)
            froms = sortBy(froms)
            return froms
        },

    },
    methods: {

        resize: function(msg) {
            // console.log('methods resize', msg)

            let vo = this

            // //panelHeight
            // vo.panelHeight = msg.contentHeightMax - 59 //- 61.6

        },

        getCreateDay: function(u) {
            let timeCreate = get(u, 'timeCreate', '')
            return timemsTZ2day(timeCreate)
        },

        modifyUserRuleGroupsIds: function(ruleGroupsId, b) {
            // console.log('methods modifyUserRuleGroupsIds', ruleGroupsId, b)

            let vo = this

            //kpugs, 因kugs初始化可能不是全部群組, 得用set才能觸發所有checkbox的value記憶體變更
            // vo.kpugs[ruleGroupsId] = b
            vo.$set(vo.kpugs, ruleGroupsId, b)

            //modify ruleGroupsIds
            let ruleGroupsIds = []
            each(vo.kpugs, (v, k) => {
                if (v) {
                    ruleGroupsIds.push(k)
                }
            })
            ruleGroupsIds = join(ruleGroupsIds, ';')
            vo.u.ruleGroupsIds = ruleGroupsIds
            // console.log('ruleGroupsIds', ruleGroupsIds)

            //calcMergedGroup
            vo.calcMergedGroup()

        },

        calcMergedGroup: function() {
            let vo = this

            //save
            let u = cloneDeep(vo.u)

            //getUserRules
            let urs = getUserRules(u, vo.ruleGroups, vo.targets)
            // console.log('urs', urs)

            //mergedGroup
            let mergedGroup = {
                id: 'merged-group',
                name: 'merged-group',
                crules: JSON.stringify(urs),
            }

            //mergedGroup
            vo.mergedGroup = mergedGroup

        },

        clickSave: function(msg) {
            //console.log('methods clickSave', msg)

            let vo = this

            async function core() {
                let errTemp = null

                //check
                if (!isestr(vo.u.name)) {
                    vo.$alert(`使用者名稱不得為空`, { type: 'error' })
                    return
                }

                //show loading
                vo.$ui.updateLoading(true)

                //u
                let u = {
                    id: vo.u.id,
                    name: trim(vo.u.name),
                    email: trim(vo.u.email),
                    description: trim(vo.u.description),
                    ruleGroupsIds: trim(vo.u.ruleGroupsIds),
                    from: trim(vo.u.from),
                    isVirtual: 'n', //儲存時則更改為非虛擬使用者, 也就是將外部系統(如SSO或AD)使用者資料另存至資料庫中, 用以識別
                    isAdmin: vo.u.isAdmin,
                    isActive: vo.u.isActive,
                    // userId, //insert時自動由後端給予
                    // timeCreate, //insert時自動由後端給予
                    // userIdUpdate: userId, //虛擬使用者皆與創建者相同
                    // timeUpdate: timeCreate,
                }

                //mode
                let mode = 'save'
                if (vo.u.isVirtual === 'y') { //若是儲存虛擬使用者, 代表是第1次儲存至資料庫中, 故需要insert來自動給予userId與timeCreate
                    mode = 'insert'
                }
                // console.log('vo.u.isVirtual', vo.u.isVirtual)

                //insert or save
                await vo.$fapi.users[mode](u)
                    .catch((err) => {
                        errTemp = err
                    })

                //check
                if (errTemp !== null) {
                    vo.$alert(`變更使用者失敗: ${errTemp}`, { type: 'error' })
                    return
                }

                //alert
                vo.$alert(`變更使用者成功`)

            }

            //core
            core()
                .then(() => {

                    //resolve
                    vo.pm.resolve()

                    //hide
                    vo.bShow = false

                })
                .catch(() => { })
                .finally(() => {

                    //save按鈕解除loading
                    msg.pm.resolve()

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

        show: function (u) {
            // console.log('methods show', u)

            let vo = this

            //pm
            vo.pm = genPm()

            //save u
            u = cloneDeep(u)
            vo.u = u

            //save kpugs
            let kpugs = {}
            let ruleGroupsIds = get(u, 'ruleGroupsIds', '')
            let s = sep(ruleGroupsIds, ';')
            each(s, (v) => {
                kpugs[v] = true
            })
            vo.kpugs = kpugs

            //calcMergedGroup
            vo.calcMergedGroup()

            //bShow
            vo.bShow = true

            return vo.pm
        },

    }
}
</script>

<style scoped>
</style>
