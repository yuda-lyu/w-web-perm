<template>
    <div
        style="height:100%;"
        v-domresize
        @domresize="resizePanel"
        :changeLang="changeLang"
    >

        <div
            style="height:100%; background:#f9fafb; overflow-y:auto;"
            v-if="!errMsg"
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
                            <!-- 控制區: 全部加總 + 時間分組; 各事件之顯示切換由圖表圖例提供, 不另設 checklist -->
                            <div class="staCtrl">

                                <!-- 全部加總 + 時間分組 -->
                                <div class="staCtrlRight">
                                    <div class="flex items-center">
                                        <input id="staShowTotal" type="checkbox" v-model="showTotal" @change="updateChartsDebounce" class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500">
                                        <label for="staShowTotal" class="ml-2 text-sm font-medium text-gray-900">{{$t('staTotal')}}</label>
                                    </div>
                                    <select v-model="timeInterval" @change="changeTimeInterval" class="border rounded px-2 py-1 text-sm">
                                        <option value="hr">{{$t('staTimeHr')}}</option>
                                        <option value="day">{{$t('staTimeDay')}}</option>
                                    </select>
                                </div>

                            </div>

                            <WEchartsVue
                                style="width:100%; height:300px;"
                                :options="optEvent"
                                v-if="optEvent"
                            ></WEchartsVue>

                            <!-- 載入中: 與圖同高之轉圈佔位 (不跳版); 載入後無資料才顯示 staNoData -->
                            <div
                                style="height:300px; display:flex; align-items:center; justify-content:center; gap:8px; font-size:0.8rem; color:#6b7280;"
                                v-else-if="loadingEvent"
                            >
                                <WIconLoading :name="'cir-rotate'" :size="24" :color="'#6b7280'"></WIconLoading>
                                <span>{{$t('waitingData')}}</span>
                            </div>

                            <div
                                style="padding:0px; font-size:0.8rem; color:#777;"
                                v-else
                            >
                                {{$t('staNoData')}}
                            </div>

                        </div>
                    </div>

                    <!-- 事件統計表區塊 -->
                    <div>
                        <div class="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
                            <div class="pb-2 flex items-center font-semibold text-gray-700">
                                <WIcon :icon="mdiTableLarge" :size="24" :color="'currentColor'" :colorHover="'currentColor'" class="text-purple-600 mr-2"></WIcon>
                                <span class="text-lg">{{$t('staTableTitle')}}</span>
                            </div>

                            <div v-if="eventTable.length > 0" class="overflow-x-auto relative shadow-md mt-2">
                                <table class="w-full text-sm text-left text-gray-500 border-collapse">
                                    <thead class="text-xs text-gray-700 bg-gray-50">
                                        <tr>
                                            <th scope="col" class="py-3 px-6 border border-solid border-gray-200">{{$t('staColEvent')}}</th>
                                            <th scope="col" class="py-3 px-6 border border-solid border-gray-200">{{$t('staColLast1Day')}}</th>
                                            <th scope="col" class="py-3 px-6 border border-solid border-gray-200">{{$t('staColLast8Hour')}}</th>
                                            <th scope="col" class="py-3 px-6 border border-solid border-gray-200">{{$t('staColLast4Hour')}}</th>
                                            <th scope="col" class="py-3 px-6 border border-solid border-gray-200">{{$t('staColLast1Hour')}}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr v-for="(row, index) in displayEventTable" :key="index" class="hover:bg-gray-50 transition-colors">
                                            <td class="py-4 px-6 border border-solid border-gray-200">{{ row.event }}</td>
                                            <td class="py-4 px-6 border border-solid border-gray-200">{{ formatNumber(row.last1Day) }}</td>
                                            <td class="py-4 px-6 border border-solid border-gray-200">{{ formatNumber(row.last8Hour) }}</td>
                                            <td class="py-4 px-6 border border-solid border-gray-200">{{ formatNumber(row.last4Hour) }}</td>
                                            <td class="py-4 px-6 border border-solid border-gray-200">{{ formatNumber(row.last1Hour) }}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            <!-- 載入中: 轉圈佔位; 載入後無資料才顯示 staNoData -->
                            <div
                                style="padding:12px 0px; display:flex; align-items:center; gap:8px; font-size:0.8rem; color:#6b7280;"
                                v-else-if="loadingTable"
                            >
                                <WIconLoading :name="'cir-rotate'" :size="20" :color="'#6b7280'"></WIconLoading>
                                <span>{{$t('waitingData')}}</span>
                            </div>

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
import sortBy from 'lodash-es/sortBy.js'
import reverse from 'lodash-es/reverse.js'
import debounce from 'wsemi/src/debounce.mjs'
import isearr from 'wsemi/src/isearr.mjs'
import WEchartsVue from 'w-echarts-vue/src/components/WEchartsVue.vue'
import { mdiChartBoxOutline, mdiTableLarge } from '@mdi/js/mdi.js'
import WIcon from 'w-component-vue/src/components/WIcon.vue'
import WIconLoading from 'w-component-vue/src/components/WIconLoading.vue'


export default {
    components: {
        WEchartsVue,
        WIcon,
        WIconLoading,
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
            mdiTableLarge,

            dbc: debounce(300),

            panelHeight: 100,

            //各區塊各自 loading 旗標 (先到先畫): 圖以 optEvent 是否為 null 與 loadingEvent 切換轉圈; 表以 eventTable 長度與 loadingTable 切換
            loadingEvent: true,
            loadingTable: true,
            errMsg: '',

            timeLength: 7,
            timeInterval: 'hr',

            showTotal: false,

            freqEvent: [],

            optEvent: null,

            eventTable: [],

        }
    },
    mounted: function() {
        // console.log('mounted')

        let vo = this

        //errMsg
        vo.errMsg = ''

        //getAndRelaData, 圖與表各自於資料到達時渲染 (先到先畫), 任一 reject 才整頁切為 errMsg
        vo.getAndRelaData()
            .catch((err) => {
                console.log(err)
                vo.errMsg = vo.$t('getDataError')
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

        //allEvents: 從 freqEvent 各桶 data 取 event 名 union (排除 count), 排序; 決定圖表要畫哪些事件系列
        allEvents: function() {
            let vo = this
            let evs = []
            map(vo.freqEvent, (entry) => {
                let evNames = keys(omit(get(entry, 'data', {}), 'count'))
                evs = union(evs, evNames)
            })
            return evs.sort()
        },

        //displayEventTable: 後端已依 last1Day 降序, 前端保險再 sortBy last1Day desc
        displayEventTable: function() {
            let vo = this
            return reverse(sortBy(vo.eventTable.slice(), 'last1Day'))
        },

    },
    methods: {

        resizePanel: function(msg) {
            // console.log('methods resizePanel', msg)

            let vo = this

            //panelWidth, panelHeight
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
                    top: 0, //須明給: echarts 6 起 legend 預設由 top:0 改為 bottom, 不給會落到底部壓住 x 軸時間標籤
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
            vo.loadingEvent = true
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
                .finally(() => {
                    vo.loadingEvent = false
                })

        },

        grStaEventTable: async function() {
            let vo = this

            //getStaEventTable
            vo.loadingTable = true
            await vo.$fapi.getStaEventTable()
                .then((res) => {
                    // console.log('getStaEventTable(eventTable)', res)
                    vo.eventTable = res
                })
                .catch((err) => {
                    console.log('getStaEventTable catch', err)
                    throw err
                })
                .finally(() => {
                    vo.loadingTable = false
                })

        },

        getAndRelaData: async function() {
            let vo = this

            //圖與表並行取得, 各自到達即渲染 (先到先畫); 任一 reject 即向上 propagate 至呼叫端 .catch 設 errMsg
            await Promise.all([
                vo.grStaEvent(),
                vo.grStaEventTable(),
            ])

        },

        updateCharts: function() {
            let vo = this

            //ksEvent: showTotal 時前置 count 加總線, 其後接全部 event (各一條系列); 使用者要隱藏哪條由圖表圖例切換
            let ksEvent = [
                ...(vo.showTotal ? ['count'] : []),
                ...vo.allEvents,
            ]

            //optEvent
            vo.optEvent = vo.genOpt(vo.$t('staEventTitle'), vo.freqEvent, ksEvent)

        },

        updateChartsDebounce: function() {
            let vo = this
            vo.dbc(() => {
                vo.updateCharts()
            })
        },

        formatNumber: function(num) {
            if (num === null || num === undefined) {
                return 0
            }
            return num.toLocaleString()
        },

        changeTimeInterval: function() {
            let vo = this

            //切換時間分組須重新向後端取數據 (hr/day 對應不同 time 粒度); 既有圖表維持顯示直到新資料到達 (不閃整頁等待)
            vo.errMsg = ''
            vo.getAndRelaData()
                .catch((err) => {
                    console.log(err)
                    vo.errMsg = vo.$t('getDataError')
                })

        },

    }
}
</script>

<style scoped>
/* === Tailwind utility (非響應式) 同名定義: LayoutContentStaInfor; 由實際 Tailwind v3 產生規則抽出, 與 CDN 逐字一致 === */
.bg-gray-100 { --tw-bg-opacity: 1; background-color: rgb(243 244 246 / var(--tw-bg-opacity, 1)); }
.bg-gray-50 { --tw-bg-opacity: 1; background-color: rgb(249 250 251 / var(--tw-bg-opacity, 1)); }
.bg-white { --tw-bg-opacity: 1; background-color: rgb(255 255 255 / var(--tw-bg-opacity, 1)); }
.border { border-width: 1px; }
.border-collapse { border-collapse: collapse; }
.border-solid { border-style: solid; }
.border-gray-200 { --tw-border-opacity: 1; border-color: rgb(229 231 235 / var(--tw-border-opacity, 1)); }
.border-gray-300 { --tw-border-opacity: 1; border-color: rgb(209 213 219 / var(--tw-border-opacity, 1)); }
.flex { display: flex; }
.focus\:ring-blue-500:focus { --tw-ring-opacity: 1; --tw-ring-color: rgb(59 130 246 / var(--tw-ring-opacity, 1)); }
.font-medium { font-weight: 500; }
.font-semibold { font-weight: 600; }
.h-4 { height: 1rem; }
.hover\:bg-gray-50:hover { --tw-bg-opacity: 1; background-color: rgb(249 250 251 / var(--tw-bg-opacity, 1)); }
.items-center { align-items: center; }
.justify-end { justify-content: flex-end; }
.mb-8 { margin-bottom: 2rem; }
.ml-2 { margin-left: 0.5rem; }
.mr-2 { margin-right: 0.5rem; }
.mt-2 { margin-top: 0.5rem; }
.overflow-x-auto { overflow-x: auto; }
.p-5 { padding: 1.25rem; }
.pb-2 { padding-bottom: 0.5rem; }
.px-2 { padding-left: 0.5rem; padding-right: 0.5rem; }
.px-6 { padding-left: 1.5rem; padding-right: 1.5rem; }
.py-1 { padding-top: 0.25rem; padding-bottom: 0.25rem; }
.py-3 { padding-top: 0.75rem; padding-bottom: 0.75rem; }
.py-4 { padding-top: 1rem; padding-bottom: 1rem; }
.relative { position: relative; }
.rounded { border-radius: 0.25rem; }
.rounded-lg { border-radius: 0.5rem; }
.shadow-md { --tw-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1); --tw-shadow-colored: 0 4px 6px -1px var(--tw-shadow-color), 0 2px 4px -2px var(--tw-shadow-color); box-shadow: var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow); }
.space-x-4 > :not([hidden]) ~ :not([hidden]) { --tw-space-x-reverse: 0; margin-right: calc(1rem * var(--tw-space-x-reverse)); margin-left: calc(1rem * calc(1 - var(--tw-space-x-reverse))); }
.space-y-8 > :not([hidden]) ~ :not([hidden]) { --tw-space-y-reverse: 0; margin-top: calc(2rem * calc(1 - var(--tw-space-y-reverse))); margin-bottom: calc(2rem * var(--tw-space-y-reverse)); }
.text-blue-600 { --tw-text-opacity: 1; color: rgb(37 99 235 / var(--tw-text-opacity, 1)); }
.text-gray-500 { --tw-text-opacity: 1; color: rgb(107 114 128 / var(--tw-text-opacity, 1)); }
.text-gray-700 { --tw-text-opacity: 1; color: rgb(55 65 81 / var(--tw-text-opacity, 1)); }
.text-gray-900 { --tw-text-opacity: 1; color: rgb(17 24 39 / var(--tw-text-opacity, 1)); }
.text-left { text-align: left; }
.text-lg { font-size: 1.125rem; line-height: 1.75rem; }
.text-purple-600 { --tw-text-opacity: 1; color: rgb(147 51 234 / var(--tw-text-opacity, 1)); }
.text-sm { font-size: 0.875rem; line-height: 1.25rem; }
.text-xs { font-size: 0.75rem; line-height: 1rem; }
.transition-colors { transition-property: color, background-color, border-color, text-decoration-color, fill, stroke, -webkit-text-decoration-color; transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1); transition-duration: 150ms; }
.w-4 { width: 1rem; }
.w-full { width: 100%; }

/* === 控制區 (全部加總 + 時間分組), RWD flex-wrap === */
.staCtrl { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-start; gap: 12px; padding: 8px 0; }
.staCtrlRight { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; }
</style>
