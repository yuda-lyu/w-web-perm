<template>
    <div
        style="height:100%;"
        v-domresize
        @domresize="resizePanel"
        :changeLang="changeLang"
    >

        <div
            style="height:100%; background:#f9fafb; overflow-y:auto;"
            v-if="!firstLoading && !errMsg"
        >

            <div style="padding:20px 30px;">

                <!-- 頁面標題 -->
                <div class="mb-8">
                    <div style="font-size:1.5rem; font-weight:600;">{{$t('mmStaInfor')}}</div>
                </div>

                <div class="space-y-8">

                    <!-- 事件發生頻率區塊 -->
                    <div>
                        <div class="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
                            <div class="pb-2 flex items-center font-semibold text-gray-700">
                                <WIcon :icon="mdiChartBoxOutline" :size="24" :color="'currentColor'" :colorHover="'currentColor'" class="text-purple-600 mr-2"></WIcon>
                                <span class="text-lg">{{$t('staEventTitle')}}</span>
                            </div>
                            <div class="flex justify-end items-center">
                                <div class="flex items-center space-x-4">
                                    <div class="flex items-center">
                                        <input id="staShowIndividually" type="checkbox" v-model="showIndividually" @change="updateChartsDebounce" class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500">
                                        <label for="staShowIndividually" class="ml-2 text-sm font-medium text-gray-900">{{$t('staShowIndividually')}}</label>
                                    </div>
                                    <select v-model="timeInterval" @change="changeTimeInterval" class="border rounded px-2 py-1 text-sm">
                                        <option value="hr">{{$t('staTimeHr')}}</option>
                                        <option value="day">{{$t('staTimeDay')}}</option>
                                    </select>
                                </div>
                            </div>

                            <WEchartsVueDyn
                                style="width:100%; height:300px;"
                                :options="optEvent"
                                v-if="optEvent"
                            ></WEchartsVueDyn>

                            <div
                                style="padding:0px; font-size:0.8rem; color:#777;"
                                v-else
                            >
                                {{$t('staNoData')}}
                            </div>

                        </div>
                    </div>

                </div>

            </div>

        </div>
        <template v-else>
            <div
                style="padding:10px 15px; font-size:0.8rem;"
                v-if="firstLoading"
            >
                {{$t('waitingData')}}
            </div>
            <div
                style="padding:10px 15px; font-size:0.8rem;"
                v-if="errMsg"
            >
                {{errMsg}}
            </div>
        </template>

    </div>
</template>

<script>
import ot from 'dayjs'
import get from 'lodash-es/get.js'
import map from 'lodash-es/map.js'
import size from 'lodash-es/size.js'
import keys from 'lodash-es/keys.js'
import union from 'lodash-es/union.js'
import omit from 'lodash-es/omit.js'
import debounce from 'wsemi/src/debounce.mjs'
import isearr from 'wsemi/src/isearr.mjs'
import WEchartsVueDyn from 'w-component-vue/src/components/WEchartsVueDyn.vue'
import { mdiChartBoxOutline } from '@mdi/js/mdi.js'
import WIcon from 'w-component-vue/src/components/WIcon.vue'


export default {
    components: {
        WEchartsVueDyn,
        WIcon,
    },
    props: {
        drawer: {
            type: Boolean,
            default: false,
        },
    },
    data: function() {
        return {

            mdiChartBoxOutline,

            dbc: debounce(300),

            panelWidth: 100,
            panelHeight: 100,

            firstLoading: true,
            errMsg: '',

            timeLength: 7,
            timeInterval: 'hr',

            showIndividually: false,

            freqEvent: [],

            optEvent: null,

        }
    },
    mounted: function() {
        // console.log('mounted')

        let vo = this

        //firstLoading, errMsg
        vo.firstLoading = true
        vo.errMsg = ''

        //getAndRelaData
        vo.getAndRelaData()
            .catch((err) => {
                console.log(err)
                vo.errMsg = vo.$t('getDataError')
            })
            .finally(() => {
                vo.firstLoading = false
            })

    },
    computed: {

        lang: function() {
            let vo = this
            return get(vo, `$store.state.lang`, '')
        },

        changeLang: function() {
            let vo = this
            let lang = vo.lang
            vo.updateChartsDebounce(lang)
            return ''
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

        genOpt: function(title, arr, keysPick) {
            let vo = this

            //check
            if (size(arr) === 0) {
                return null
            }

            //keysPick to array
            if (!isearr(keysPick)) {
                keysPick = [keysPick]
            }

            //colors
            let colors = [
                '#3b82f6', // blue-500
                '#ef4444', // red-500
                '#10b981', // emerald-500
                '#f97316', // orange-500
                '#8b5cf6', // violet-500
                '#6366f1', // indigo-500
                '#eab308', // yellow-500
                '#ec4899', // pink-500
                '#14b8a6', // teal-500
                '#a855f7', // purple-500
            ]
            function getColor(k) {
                return colors[k % colors.length]
            }

            //getName: count 系列顯示為「全部」, 其餘 event 名照原字串
            let getName = (valueKey) => {
                if (valueKey === 'count') {
                    return vo.$t('staTotal')
                }
                return valueKey
            }

            //series: 折線圖, 每個 keysPick 一條系列, 缺值補 0
            let series = map(keysPick, (valueKey, k) => {
                let name = getName(valueKey)
                let color = getColor(k)
                return {
                    name,
                    type: 'line',
                    smooth: true,
                    data: map(arr, item => get(item, `data.${valueKey}`, 0)),
                    itemStyle: {
                        color,
                    },
                    emphasis: {
                        focus: 'series'
                    },
                }
            })

            //formatX: hr 顯示 MM/DD HH:mm, day 顯示 MM/DD
            let formatX = 'MM/DD'
            if (vo.timeInterval === 'hr') {
                formatX = 'MM/DD\nHH:mm'
            }

            //opt
            let opt = {
                title: {
                    text: title,
                    show: false, // 不顯示標題，由組件的HTML提供
                },
                tooltip: {
                    trigger: 'axis',
                },
                grid: {
                    left: '3%',
                    right: '4%',
                    bottom: '3%',
                    containLabel: true
                },
                legend: {
                    show: true,
                },
                xAxis: [
                    {
                        type: 'category',
                        boundaryGap: false,
                        data: map(arr, item => ot(item.time).format(formatX)),
                        axisTick: {
                            alignWithLabel: true
                        }
                    }
                ],
                yAxis: [
                    {
                        type: 'value'
                    }
                ],
                series,
            }
            return opt
        },

        grStaEvent: async function() {
            let vo = this

            //getStaEvent
            await vo.$fapi.getStaEvent(vo.timeLength, vo.timeInterval)
                .then((res) => {
                    // console.log('getStaEvent(freqEvent)', res)
                    vo.freqEvent = res
                    vo.updateCharts()
                })
                .catch((err) => {
                    console.log('getStaEvent catch', err)
                    throw err
                })

        },

        getAndRelaData: async function() {
            let vo = this

            //grStaEvent
            await vo.grStaEvent()

        },

        updateCharts: function() {
            let vo = this

            //ksEvent
            let ksEvent
            if (!vo.showIndividually) {
                //全部: 單一系列 count
                ksEvent = ['count']
            }
            else {
                //各事件分別: 收集所有 time 出現過的 event 名 (排除 count), 各一條系列
                ksEvent = []
                map(vo.freqEvent, (entry) => {
                    let evNames = keys(omit(get(entry, 'data', {}), 'count'))
                    ksEvent = union(ksEvent, evNames)
                })
            }

            //optEvent
            vo.optEvent = vo.genOpt(vo.$t('staEventTitle'), vo.freqEvent, ksEvent)

        },

        updateChartsDebounce: function() {
            let vo = this
            vo.dbc(() => {
                vo.updateCharts()
            })
        },

        changeTimeInterval: function() {
            let vo = this

            //切換時間分組須重新向後端取數據 (hr/day 對應不同 time 粒度)
            vo.firstLoading = true
            vo.errMsg = ''
            vo.getAndRelaData()
                .catch((err) => {
                    console.log(err)
                    vo.errMsg = vo.$t('getDataError')
                })
                .finally(() => {
                    vo.firstLoading = false
                })

        },

    }
}
</script>

<style scoped>
/* === Tailwind utility (非響應式) 同名定義: LayoutContentStaInfor; 由實際 Tailwind v3 產生規則抽出, 與 CDN 逐字一致 === */
.bg-gray-100 { --tw-bg-opacity: 1; background-color: rgb(243 244 246 / var(--tw-bg-opacity, 1)); }
.bg-white { --tw-bg-opacity: 1; background-color: rgb(255 255 255 / var(--tw-bg-opacity, 1)); }
.border { border-width: 1px; }
.border-gray-200 { --tw-border-opacity: 1; border-color: rgb(229 231 235 / var(--tw-border-opacity, 1)); }
.border-gray-300 { --tw-border-opacity: 1; border-color: rgb(209 213 219 / var(--tw-border-opacity, 1)); }
.flex { display: flex; }
.focus\:ring-blue-500:focus { --tw-ring-opacity: 1; --tw-ring-color: rgb(59 130 246 / var(--tw-ring-opacity, 1)); }
.font-medium { font-weight: 500; }
.font-semibold { font-weight: 600; }
.h-4 { height: 1rem; }
.items-center { align-items: center; }
.justify-end { justify-content: flex-end; }
.mb-8 { margin-bottom: 2rem; }
.ml-2 { margin-left: 0.5rem; }
.mr-2 { margin-right: 0.5rem; }
.p-5 { padding: 1.25rem; }
.pb-2 { padding-bottom: 0.5rem; }
.px-2 { padding-left: 0.5rem; padding-right: 0.5rem; }
.py-1 { padding-top: 0.25rem; padding-bottom: 0.25rem; }
.rounded { border-radius: 0.25rem; }
.rounded-lg { border-radius: 0.5rem; }
.shadow-sm { --tw-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05); --tw-shadow-colored: 0 1px 2px 0 var(--tw-shadow-color); box-shadow: var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow); }
.space-x-4 > :not([hidden]) ~ :not([hidden]) { --tw-space-x-reverse: 0; margin-right: calc(1rem * var(--tw-space-x-reverse)); margin-left: calc(1rem * calc(1 - var(--tw-space-x-reverse))); }
.space-y-8 > :not([hidden]) ~ :not([hidden]) { --tw-space-y-reverse: 0; margin-top: calc(2rem * calc(1 - var(--tw-space-y-reverse))); margin-bottom: calc(2rem * var(--tw-space-y-reverse)); }
.text-blue-600 { --tw-text-opacity: 1; color: rgb(37 99 235 / var(--tw-text-opacity, 1)); }
.text-gray-700 { --tw-text-opacity: 1; color: rgb(55 65 81 / var(--tw-text-opacity, 1)); }
.text-gray-900 { --tw-text-opacity: 1; color: rgb(17 24 39 / var(--tw-text-opacity, 1)); }
.text-lg { font-size: 1.125rem; line-height: 1.75rem; }
.text-purple-600 { --tw-text-opacity: 1; color: rgb(147 51 234 / var(--tw-text-opacity, 1)); }
.text-sm { font-size: 0.875rem; line-height: 1.25rem; }
.w-4 { width: 1rem; }
</style>
