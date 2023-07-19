<template>
    <div
        style="height:100%;"
        v-domresize
        @domresize="resizePanel"
        :changeUsers="changeUsers"
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
                            :icon="mdiAccountGroupOutline"
                            :color="'#FF9800'"
                        ></WIcon>

                        <div style="padding-left:10px; font-size:1.3rem; color:#d3912c;">
                            使用者權限
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
                            1. 請依照使用者身份給予適合之權限群組。
                        </div>
                        <div style="padding:3px 0px;">
                            2. 請確認新增使用者為核可之使用者。
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
                    style="padding:20px; display:flex; align-items:center; border-bottom:3px solid #ddd;"
                    v-domresize
                    @domresize="resizeGroupInfor"
                >

                    <div style="color:#666; font-size:1.1rem;">
                        使用者分類清單
                    </div>

                    <template v-if="isOperatable">

                        <div style="padding-left:10px;"></div>

                        <WButtonChip
                            :paddingStyle="{v:0,h:11}"
                            :text="'新增使用者'"
                            :icon="mdiAccountPlusOutline"
                            :backgroundColor="'rgba(255,0,50,0.7)'"
                            :backgroundColorHover="'rgba(255,0,50,0.8)'"
                            :textColor="'#eee'"
                            :textColorHover="'#fff'"
                            :iconColor="'#eee'"
                            :iconColorHover="'#fff'"
                            @click="clickAddUser"
                        ></WButtonChip>

                    </template>

                </div>

                <WPanelScrolly
                    :style="`height:${usersGroupsHeight}px; _overflow-y:auto;`"
                >
                    <div style="padding:10px;">

                        <div
                            style="padding:10px;"
                            :key="'kus:'+kus"
                            v-for="(us,kus) in usersGroups"
                        >

                            <div style="padding-bottom:5px; display:flex; align-items:center; border-bottom:1px dashed #ddd;">
                                <div style="padding-right:5px; color:#888; font-size:0.8rem;">
                                    來源:
                                </div>
                                <div style="color:#000; font-size:0.8rem;">
                                    {{getFrom(kus)}}
                                </div>
                            </div>

                            <div style="padding-top:10px;">

                                <div
                                    style="display:inline-block; margin:0px 10px 10px 0px;"
                                    :key="'ku:'+ku"
                                    v-for="(u,ku) in us"
                                >

                                    <WButtonChip
                                        :text="u.name"
                                        :paddingStyle="{
                                            v: u.isVirtual!=='y' ? 2 : 4,
                                            h: 12,
                                        }"
                                        :icon="getIsAdmin(u)?mdiChessRook:''"
                                        :backgroundColor="getIsNotActive(u)?'rgba(130,130,130,0.8)':getIsAdmin(u)?'rgba(216, 27, 96, 0.8)':'rgba(50,110,230,0.8)'"
                                        :backgroundColorHover="getIsNotActive(u)?'rgba(130,130,130,0.9)':getIsAdmin(u)?'rgba(216, 27, 96, 0.9)':'rgba(50,110,230,0.9)'"
                                        :textColor="'#eee'"
                                        :textColorHover="'#fff'"
                                        :iconColor="'#eee'"
                                        :iconColorHover="'#fff'"
                                        :close="isOperatable?(u.isVirtual!=='y'):false"
                                        @click="clickEditUser(u)"
                                        @click-close="clickRemoveUser(u)"
                                    ></WButtonChip>

                                </div>

                            </div>

                        </div>

                    </div>
                </WPanelScrolly>

            </div>

        </div>

        <div style="padding:10px 15px; font-size:0.8rem;" v-else>
            載入中...
        </div>

    </div>
</template>

<script>
import { mdiAccountGroupOutline, mdiAccountPlusOutline, mdiCheckboxMarkedCircle, mdiChessRook } from '@mdi/js/mdi.js'
import get from 'lodash/get'
import each from 'lodash/each'
import keys from 'lodash/keys'
import sortBy from 'lodash/sortBy'
import find from 'lodash/find'
import size from 'lodash/size'
import groupBy from 'lodash/groupBy'
import genID from 'wsemi/src/genID.mjs'
import isestr from 'wsemi/src/isestr.mjs'
import iseobj from 'wsemi/src/iseobj.mjs'
import waitFun from 'wsemi/src/waitFun.mjs'
import WIcon from 'w-component-vue/src/components/WIcon.vue'
import WButtonChip from 'w-component-vue/src/components/WButtonChip.vue'
import WSwitch from 'w-component-vue/src/components/WSwitch.vue'
import WPanelScrolly from 'w-component-vue/src/components/WPanelScrolly.vue'


export default {
    components: {
        WIcon,
        WButtonChip,
        WSwitch,
        WPanelScrolly,
    },
    props: {
    },
    data: function() {
        return {
            mdiAccountGroupOutline,
            mdiAccountPlusOutline,
            mdiCheckboxMarkedCircle,
            mdiChessRook,

            panelWidth: 100,
            panelHeight: 100,
            headHeight: 100,
            groupInforHeight: 100,

            firstLoading: true,
            isOperatable: false,
            isModified: false,

            pickGroupId: '',

        }
    },
    computed: {

        users: function() {
            return get(this, `$store.state.users`)
        },

        usersGroups: function() {
            let gs = groupBy(this.users, 'from')
            let ks = keys(gs)
            ks = sortBy(ks)
            let gsTemp = {}
            each(ks, (k) => {
                gsTemp[k] = gs[k]
            })
            gs = gsTemp
            return gs
        },

        changeUsers: function() {
            // console.log('computed changeUsers')

            let vo = this

            //check
            if (size(vo.users) === 0) {
                return ''
            }

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

        usersGroupsHeight: function() {
            let vo = this

            //h
            let h = vo.panelHeight - vo.headHeight - 2 * vo.spacePading - vo.groupInforHeight
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

        resizeGroupInfor: function(msg) {
            // console.log('methods resizeGroupInfor', msg)

            let vo = this

            //groupInforHeight
            vo.groupInforHeight = msg.snew.offsetHeight

        },

        getFrom: function(kus) {
            // console.log('methods getFrom', kus)
            if (!isestr(kus)) {
                kus = '無'
            }
            return kus
        },

        getIsAdmin: function(u) {
            return get(u, 'isAdmin') === 'y'
        },

        getIsNotActive: function(u) {
            return get(u, 'isActive') === 'n'
        },

        clickAddUser: function() {
            // console.log('methods clickAddUser')

            let vo = this

            async function core() {
                let errTemp = null

                //show loading
                vo.$ui.updateLoading(true)

                //u
                let u = {
                    id: genID(),
                    name: '新使用者',
                    from: '',
                    isVirtual: 'n', //新增使用者代表為權限使用者, 故非虛擬使用者
                    isAdmin: 'n',
                    isActive: 'y',
                }

                //save
                await vo.$fapi.users.insert(u)
                    .catch((err) => {
                        errTemp = err
                    })

                //check
                if (errTemp !== null) {
                    vo.$alert(`新增權限群組失敗: ${errTemp}`, { type: 'error' })
                }

                //un
                let un = null
                await waitFun(() => {
                    un = find(vo.users, { id: u.id })
                    return iseobj(un) //確認g.id已存在
                })
                // console.log('un', un)

                //showVeUser
                vo.$dg.showVeUser(un)
                    .catch(() => {})

                //alert
                vo.$alert(`新增使用者成功`)

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

        clickRemoveUser: function(u) {
            // console.log('methods clickRemoveUser', u)

            let vo = this

            async function core() {
                let errTemp = null

                //showCheckYesNo
                let bExit = false
                await vo.$dg.showCheckYesNo(`確認是否刪除使用者「${u.name}」?`)
                    .catch(() => {
                        bExit = true
                    })
                if (bExit) {
                    return
                }

                //show loading
                vo.$ui.updateLoading(true)

                //save
                await vo.$fapi.users.del(u)
                    .catch((err) => {
                        errTemp = err
                    })

                //check
                if (errTemp !== null) {
                    vo.$alert(`刪除使用者失敗: ${errTemp}`, { type: 'error' })
                    return
                }

                //un
                let un = null
                await waitFun(() => {
                    un = find(vo.users, (v) => {
                        return v.id === u.id && v.isVirtual !== 'y' //找到id, 且不能為虛擬使用者, 才能代表已刪除
                    })
                    return !iseobj(un) //確認g.id已不存在
                })
                // console.log('un', un)

                //alert
                vo.$alert(`刪除使用者成功`)

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

        clickEditUser: function(u) {
            // console.log('clickEditGroup', u)

            let vo = this

            //check
            if (!vo.isOperatable) {
                vo.$alert(`非編輯模式無法查閱使用者詳細資訊`, { type: 'error' })
                return
            }

            //showVeUser
            vo.$dg.showVeUser(u)
                .catch(() => {})

        },

    }
}
</script>

<style scoped>
</style>
