<template>
    <div
        style="height:100%; width:100%;"
        v-domresize
        @domresize="resize"
    >

        <template v-if="syncState">

            <WDrawer
                :style="`height:${panelHeight}px; width:100%;`"
                v-model="drawer"
                :drawerWidth.sync="drawerWidth"
                :drawerWidthMin="drawerWidthMin"
                :drawerWidthMax="drawerWidthMax"
                :mode="'from-left'"
                :afloat="drawerAfloat"
                :dragDrawerWidth="true"
            >

                <template v-slot:drawer="props">

                    <!-- 因drawer內部resize觸發可能不足或有容許誤差, 使用props.height可能會有多1px情形, 導致出現垂直捲軸 -->
                    <div :style="`height:${panelHeight}px; background:#fff; position:relative;`">

                        <WListVertical
                            style="height:100%;"
                            :items="menus"
                            :itemActive="menuActive"
                            :item-text-color="'#222'"
                            :item-text-color-hover="'#444'"
                            :item-text-color-active="'#EF6C00'"
                            :item-icon-color="'#222'"
                            :item-icon-color-hover="'#444'"
                            :item-icon-color-active="'#EF6C00'"
                            :item-background-color="'#fff'"
                            :item-background-color-hover="'#f2f2f2'"
                            :item-background-color-active="'#FFF3E0'"
                            :paddingStyle="{v:15,h:15}"
                            @click="(menu)=>{menuKey=menu.key}"
                        ></WListVertical>

                        <div
                            :style="`position:absolute; top:1px; right:4px;`"
                            v-if="drawer"
                        >
                            <WButtonCircle
                                :paddingStyle="{v:3,h:3}"
                                :icon="'mdi-arrow-left'"
                                :iconSize="16"
                                :backgroundColor="'#fff'"
                                :backgroundColorHover="'#eee'"
                                :backgroundColorFocus="'#fff'"
                                :borderColor="'transparent'"
                                :borderColorHover="'#eee'"
                                :borderColorFocus="'#eee'"
                                :tooltip="$t('menuTreeHide')"
                                :shadow="true"
                                @click="drawer=false"
                            ></WButtonCircle>
                        </div>

                    </div>

                </template>

                <template v-slot:content="props">
                    <!-- 因drawer內部resize觸發可能不足或有容許誤差, 使用props.height可能會有多1px情形, 導致出現垂直捲軸 -->
                    <div :style="`height:${panelHeight}px; width:${props.width}px; position:relative;`">

                        <template>

                            <LayoutContentTargets
                                v-if="menuKey==='blocks'"
                            ></LayoutContentTargets>

                            <LayoutContentGroups
                                v-if="menuKey==='groups'"
                            ></LayoutContentGroups>

                            <LayoutContentUsers
                                v-if="menuKey==='users'"
                            ></LayoutContentUsers>

                        </template>

                        <div
                            :style="`position:absolute; top:1px; left:4px;`"
                            v-if="!drawer"
                        >
                            <WButtonCircle
                                :paddingStyle="{v:3,h:3}"
                                :icon="'mdi-arrow-right'"
                                :iconSize="16"
                                :backgroundColor="'#fff'"
                                :backgroundColorHover="'#eee'"
                                :backgroundColorFocus="'#fff'"
                                :borderColor="'transparent'"
                                :borderColorHover="'#eee'"
                                :borderColorFocus="'#eee'"
                                :tooltip="$t('menuTreeShow')"
                                :shadow="true"
                                @click="drawer=true"
                            ></WButtonCircle>
                        </div>

                    </div>
                </template>

            </WDrawer>

        </template>

        <template v-else>
            <div
                style="padding:20px; font-size:0.9rem;"
            >
                {{$t('waitingData')}}
            </div>
        </template>

    </div>
</template>

<script>
import { mdiGamepadCircle, mdiStackOverflow, mdiAccountGroupOutline, mdiBallotRecountOutline } from '@mdi/js/mdi.js'
import get from 'lodash/get'
// import map from 'lodash/map'
// import each from 'lodash/each'
// import cloneDeep from 'lodash/cloneDeep'
// import pmSeries from 'wsemi/src/pmSeries.mjs'
import WDrawer from 'w-component-vue/src/components/WDrawer.vue'
import WButtonCircle from 'w-component-vue/src/components/WButtonCircle.vue'
import WListVertical from 'w-component-vue/src/components/WListVertical.vue'
import LayoutContentTargets from './LayoutContentTargets.vue'
import LayoutContentGroups from './LayoutContentGroups.vue'
import LayoutContentUsers from './LayoutContentUsers.vue'


export default {
    components: {
        WDrawer,
        WButtonCircle,
        WListVertical,
        LayoutContentTargets,
        LayoutContentGroups,
        LayoutContentUsers,
    },
    props: {
        // menuKey: {
        //     type: String,
        //     default: '',
        // },
    },
    data: function() {
        let menus = [
            {
                key: 'blocks',
                text: '管理區塊',
                icon: mdiGamepadCircle,
            },
            {
                key: 'groups',
                text: '權限群組',
                icon: mdiStackOverflow,
            },
            {
                key: 'users',
                text: '使用者權限',
                icon: mdiAccountGroupOutline,
            },
            // {
            //     key: 'logs',
            //     text: '事件紀錄',
            //     icon: mdiBallotRecountOutline,
            // },
        ]
        return {

            menuKey: 'blocks',
            menus,
            menuActive: menus[0],

            panelWidth: 0,
            panelWidthTemp: 0,
            panelHeight: 0,

            drawer: true,
            drawerAfloat: false,
            drawerWidth: 180,
            drawerWidthMin: 150,
            drawerWidthMax: 300,

        }
    },
    computed: {

        syncState: function() {
            return get(this, '$store.state.syncState')
        },

    },
    methods: {

        resize: function(msg) {
            // console.log('methods resize', msg)

            let vo = this

            //save
            vo.panelWidth = msg.snew.clientWidth
            vo.panelHeight = msg.snew.clientHeight
            // console.log('vo.panelHeight', vo.panelHeight)

            //modeResize
            let modeResize = '' //寬度可能相同故得有預設空字串的種類
            if (vo.panelWidth > vo.panelWidthTemp) {
                modeResize = 'toLarge'
            }
            else if (vo.panelWidth < vo.panelWidthTemp) {
                modeResize = 'toSmall'
            }
            // console.log('modeResize', modeResize, vo.panelWidth, vo.panelWidthTemp)

            //drawer
            if (vo.drawer && modeResize === 'toSmall' && vo.panelWidth < 1.7 * vo.drawerWidthMax) { //已開啟抽屜且為變窄時才偵測
                vo.drawer = false
            }
            else if (!vo.drawer && modeResize === 'toLarge' && vo.panelWidth >= 1.7 * vo.drawerWidthMax) { //已隱藏抽屜且為變寬時才偵測
                vo.drawer = true
            }

            //drawerAfloat
            vo.drawerAfloat = vo.panelWidth < 1.7 * vo.drawerWidthMax

            //save
            vo.panelWidthTemp = vo.panelWidth

        },

    }
}
</script>

<style scoped>
</style>
