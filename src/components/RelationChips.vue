<template>
    <div
        ref="root"
        :style="`position:relative; display:flex; align-items:center; gap:${gap}px; height:100%; min-width:0; overflow:hidden; white-space:nowrap;`"
    >

        <!-- 儲存格內之標籤: 本項永遠第 1 顆(唯一可編輯者, 永不被收合); 只渲染放得下的前 nShow 顆 -->
        <!-- 用 v-if 不用 v-show: RelationChip 根元素之 style 含 display:inline-flex, 父層任何無關之重繪(如 hoverAll、vw 變動)會使 Vue 2 之 style 模組
             把 display 寫回 inline-flex, 而 v-show 值未變不會重套 display:none, 被收合之標籤即重新顯示(2026-09-17 實測: 收合後再縮窄一級, 2 顆與「+1」同時可見);
             寬度已於量測時快取, 卸載不影響計算 -->
        <template v-for="(item, kitem) in itemsSorted">
            <RelationChip
                :key="`c-${item.name}`"
                :ref="`chip${kitem}`"
                :style="useChipStyle(kitem)"
                :name="item.name"
                :mode="item.mode"
                :isCurrent="item.enable==='y'"
                :editable="editable"
                :labelContent="labelContent"
                @input="(v)=>{$emit('input',v)}"
                v-if="measuring || kitem < nShow"
            ></RelationChip>
        </template>

        <!-- 溢出指示「+K」: 只在確有標籤放不下時出現, K 為看不到的數量, 接在最後一顆可見標籤之後(對標 antd Select maxTagCount=responsive、MUI Autocomplete limitTags) -->
        <!-- line-height:0: 切斷儲存格 27px 行高之繼承, 否則 WPopup 內之 WTooltip 觸發層會自成 27px 行框, 使指示偏下並溢出儲存格被裁(實測上 6.03／下 −1.03) -->
        <WPopup
            style="flex:0 0 auto; line-height:0;"
            :displayType="'block'"
            :isolated="true"
            :placement="'bottom-start'"
            :paddingStyle="{v:8,h:10}"
            :minWidth="usePopupMinWidth"
            :maxWidth="usePopupMaxWidth"
            :labelContent="labelContentAll"
            v-if="!measuring && nHidden > 0"
        >
            <template v-slot:trigger>
                <div
                    :style="useIndicatorStyle"
                    :title="tooltipAll"
                    @mouseenter="hoverAll=true"
                    @mouseleave="hoverAll=false"
                >
                    +{{ nHidden }}
                </div>
            </template>
            <template v-slot:content>
                <div style="font-size:12px; color:#666; padding-bottom:6px;">
                    {{ usePopupTitle }}
                </div>
                <!-- 列出全部標籤, 本項排第 1 顆且與儲存格內同樣可改模式(展開狀態即操作狀態, 不是唯讀預覽); 最大高 50vh 超過即於浮層內捲動 -->
                <div :style="`display:flex; flex-wrap:wrap; gap:4px 6px; max-height:50vh; max-width:${usePopupMaxWidth}px; overflow:auto;`">
                    <RelationChip
                        v-for="item in itemsSorted"
                        :key="`p-${item.name}`"
                        :name="item.name"
                        :mode="item.mode"
                        :isCurrent="item.enable==='y'"
                        :editable="editable"
                        :nameMaxWidth="520"
                        :labelContent="labelContent"
                        @input="(v)=>{$emit('input',v)}"
                    ></RelationChip>
                </div>
            </template>
        </WPopup>

        <!-- 量測用: 預留「+{n−1}」位數之指示寬度, 使收合顆數不因 K 之位數變化而來回跳動; 不可見、不佔版面 -->
        <div
            ref="indicatorMeasure"
            :style="`${useIndicatorStyle} position:absolute; left:-9999px; top:0; visibility:hidden; pointer-events:none;`"
            aria-hidden="true"
        >
            +{{ Math.max(n - 1, 1) }}
        </div>

    </div>
</template>

<script>
import get from 'lodash-es/get.js'
import size from 'lodash-es/size.js'
import filter from 'lodash-es/filter.js'
import sum from 'lodash-es/sum.js'
import WPopup from 'w-component-vue/src/components/WPopup.vue'
import RelationChip from './RelationChip.vue'


//關聯標籤列(供 VeGrupBlngUsers 之「所屬權限群組名稱」欄與 VePemiBlngGrups 之「所屬權限名稱」欄)
//  - items: genItems 產生之 grups/pemis 陣列, 各項含 name、mode、enable('y' 為本項)
//  - 顯示順序: enable='y'(本項)永遠第 1 顆, 其餘依原順序; 只改顯示, 不改儲存之 cgrups/cpemis 字串(權限合併結果與順序無關, 見 mShare.mjs 之 mergeRules)
//  - 溢出(2026-09-17 重設計, 取代「標籤數 ≥ 2 即於最左出現⋯N」):
//      依實測寬度決定顯示前幾顆; 全部放得下即不出現任何指示; 放不下時於最後一顆可見標籤之後出現「+K」(K＝看不到的數量),
//      點開浮層列出全部標籤。舊版以數量代替溢出, 實測權限頁 4 列標籤總寬 165～192px、儲存格可用 295px, 全部放得下卻 4 列都出鈕。
//      至少顯示第 1 顆(本項); 連第 1 顆都放不下時由其名稱段收縮讓位(省略號), 模式段與「+K」維持完整
//  - 量測: 標籤自然寬於資料變動時量一次並快取(量測期間暫時全部顯示且不收縮); 欄寬變動只以快取重算顆數, 不重繪
//  - 浮層內本項標籤與儲存格內同樣可改模式(舊版浮層一律唯讀, 展開後反而不能改); 改動後由呼叫端 revRows 重繪列,
//    本元件隨儲存格重建而卸載、浮層隨之關閉——該列唯一可改之項已改完, 關閉符合預期
//  - 垂直置中: 根元素 flex 置中且 height:100%(其百分比高度之包含塊為 .ag-cell), 標籤與指示於 27px 儲存格內上下各 2.5
//  - 尺寸監聽用原生 ResizeObserver, 不用元件庫之 v-domresize(wsemi domDetect): 後者每實例一個 20ms setInterval 輪詢 offsetWidth,
//    且比較基準為「上一次取樣」, 連續 ≤1px 之變化永不觸發(2026-09-17 讀碼定案並實測: 視窗逐 1px 縮窄時表格欄寬始終不重算),
//    每列一實例時輪詢成本隨可見列數累積; ResizeObserver 為事件驅動、任何寬度變化皆觸發。根元素寬由儲存格決定(overflow:hidden),
//    子元素增減不改變根寬, 無 ResizeObserver 迴圈之虞; 回呼以 requestAnimationFrame 合併
export default {
    components: {
        WPopup,
        RelationChip,
    },
    props: {
        items: {
            type: Array,
            default: () => [],
        },
        editable: {
            type: Boolean,
            default: false,
        },
        popupTitle: { //浮層標題所用之欄名(如「所屬權限名稱」), 與數量合成 chipsPopupTitle
            type: String,
            default: '',
        },
        tooltipAll: {
            type: String,
            default: '',
        },
        labelContent: { //本項標籤之模式下拉浮層之 wtlp 屬性值
            type: String,
            default: 'modeSelect',
        },
        labelContentAll: { //展開全部之浮層之 wtlp 屬性值
            type: String,
            default: 'relationChipsAll',
        },
    },
    data: function() {
        return {
            gap: 4, //相鄰標籤與指示之間距, 以根元素 CSS gap 實作(未顯示者 display:none 不產生間距), 與 relayout 之計算模型一致
            measuring: true,
            measured: false,
            chipWidths: [],
            indicatorWidth: 0,
            nShow: 0,
            hoverAll: false,
            vw: typeof window !== 'undefined' ? window.innerWidth : 1440, //視窗寬, 供浮層寬度上限(窄視窗不超出)
        }
    },
    mounted: function() {
        let vo = this
        vo.measure()

        //ResizeObserver: 根元素寬度變化(儲存格欄寬改變、視窗變動致表格重算欄寬)即重算
        if (typeof window !== 'undefined' && window.ResizeObserver) {
            vo.ro = new window.ResizeObserver(() => {
                if (vo.rafId) {
                    return
                }
                vo.rafId = window.requestAnimationFrame(() => {
                    vo.rafId = null
                    vo.relayout()
                })
            })
            vo.ro.observe(vo.$refs.root)
        }

    },
    beforeDestroy: function() {
        let vo = this
        if (vo.ro) {
            vo.ro.disconnect()
            vo.ro = null
        }
        if (vo.rafId) {
            window.cancelAnimationFrame(vo.rafId)
            vo.rafId = null
        }
    },
    watch: {
        items: {
            handler: function() {
                let vo = this
                vo.measure()
            },
            deep: true,
        },
        nHidden: function(v) {
            let vo = this
            //指示被移除時重設 hover 態: 游標停在指示上時拉寬使其消失, 被移除之節點不保證收到 mouseleave, 否則下次出現會殘留 hover 色
            if (v === 0) {
                vo.hoverAll = false
            }
        },
    },
    computed: {

        n: function() {
            let vo = this
            return size(vo.items)
        },

        nHidden: function() {
            let vo = this
            return Math.max(vo.n - vo.nShow, 0)
        },

        itemsSorted: function() {
            let vo = this
            let a = filter(vo.items, (v) => get(v, 'enable', '') === 'y')
            let b = filter(vo.items, (v) => get(v, 'enable', '') !== 'y')
            return [...a, ...b]
        },

        usePopupTitle: function() {
            let vo = this
            let t = vo.$t('chipsPopupTitle')
            t = t.replace('{title}', vo.popupTitle)
            t = t.replace('{n}', vo.n)
            return t
        },

        //浮層寬度: 內容寬(不含 paddingStyle 左右各 10)不超過「視窗寬 − 內距 20 − 左右各留 16」, 使 320 寬視窗開啟時浮層仍完整在視窗內;
        //  寬視窗時維持原設計之最小 320、最大 540（元件庫 minWidth/maxWidth 不含 padding, 見 WTooltip.vue 之 prop 說明）
        usePopupMaxWidth: function() {
            let vo = this
            return Math.max(120, Math.min(540, vo.vw - 52))
        },

        usePopupMinWidth: function() {
            let vo = this
            return Math.min(320, vo.usePopupMaxWidth)
        },

        useIndicatorStyle: function() {
            let vo = this
            let h = vo.hoverAll
            return [
                'display:inline-flex;',
                'align-items:center;',
                'box-sizing:border-box;',
                'height:22px;',
                'padding:0 6px;',
                `border:1px solid ${h ? '#888' : '#aaa'};`,
                'border-radius:4px;',
                `background:${h ? '#f5f5f5' : '#fff'};`,
                `color:${h ? '#333' : '#555'};`,
                'font-size:12px;',
                'line-height:20px;',
                'white-space:nowrap;',
                'cursor:pointer;',
                'user-select:none;',
                'transition:background-color 0.3s, border-color 0.3s, color 0.3s;',
            ].join(' ')
        },

    },
    methods: {

        useChipStyle: function(kitem) {
            let vo = this
            //量測期間一律不收縮以取自然寬; 平時只有第 1 顆可收縮(連它都放不下時由名稱段讓位)
            let flex = (!vo.measuring && kitem === 0) ? '0 1 auto' : '0 0 auto'
            return `flex:${flex}; min-width:0;`
        },

        //縮放係數: 視覺寬(getBoundingClientRect, 受 transform 影響) ÷ 版面寬(offsetWidth, 不受 transform 影響)
        //  對話框開啟時有縮放動畫(實測量到 0.2 倍寬), 以此係數把視覺寬還原為版面寬, 取得次像素精度而不受縮放污染
        getScale: function() {
            let vo = this
            let el = vo.$refs.root
            let lw = el ? el.offsetWidth : 0
            if (lw <= 0) {
                return 0
            }
            let s = el.getBoundingClientRect().width / lw
            return s > 0 ? s : 0
        },

        measure: function() {
            let vo = this

            //暫時全部顯示且不收縮, 下一幀量自然寬
            vo.measuring = true
            vo.$nextTick(() => {

                //chipWidths, 逐索引取 ref(Vue 2 之 v-for 同名 ref 陣列不保證與資料順序一致, 故每顆各給 chip{k})
                //  寬度 = getBoundingClientRect().width ÷ 縮放係數: 不可直接用 getBoundingClientRect——對話框開啟有縮放動畫,
                //  動畫中量得縮放後之寬(2026-09-17 實測 21/15.7, 實為 105.2/78.7 之 0.2 倍), 會誤判「全部放得下」而永不出現「+K」;
                //  亦不直接用 offsetWidth——其為整數, 需逐顆補 +1 保守值, 誤差隨顆數累積而提早收合(2026-09-17 審計查出)
                let scale = vo.getScale()
                let wOf = (el) => (scale > 0 && el && el.offsetWidth > 0) ? el.getBoundingClientRect().width / scale : 0
                let ws = []
                for (let k = 0; k < vo.n; k++) {
                    let c = get(vo, ['$refs', `chip${k}`, 0], null)
                    ws.push(wOf(c && c.$el))
                }
                vo.chipWidths = ws

                //indicatorWidth
                vo.indicatorWidth = wOf(vo.$refs.indicatorMeasure)

                //尚未排版(元素未顯示時寬為 0)者視為未量測, 待下次尺寸變動再量
                vo.measured = ws.length > 0 && ws.every((w) => w > 0) && vo.indicatorWidth > 0

                //relayout
                vo.measuring = false
                if (!vo.measured) {
                    //量不到(元素尚未顯示): 先全部顯示避免儲存格空白, 不在此重試(否則元素持續不可見時會每幀互相呼叫), 待元素顯示使根寬改變、ResizeObserver 觸發 relayout 時再量
                    vo.nShow = vo.n
                    return
                }
                vo.relayout()

            })
        },

        relayout: function() {
            let vo = this

            //check
            if (vo.measuring) {
                return
            }
            let n = vo.n
            if (n === 0) {
                vo.nShow = 0
                return
            }

            //尚未量得有效寬度(掛載時元素未顯示)者, 趁此次尺寸變動重量, 量完會再呼叫本函式
            if (!vo.measured) {
                vo.measure()
                return
            }

            //vw, 供浮層寬度上限
            vo.vw = window.innerWidth

            //avail, 與標籤寬同一計算模型(視覺寬 ÷ 縮放係數)
            let scale = vo.getScale()
            if (scale <= 0) {
                return
            }
            let avail = vo.$refs.root.getBoundingClientRect().width / scale
            let eps = 0.01 //浮點誤差

            //全部放得下: 各顆寬 + 顆間間距(CSS gap 只在相鄰已顯示者之間, 最後一顆之後無間距)
            let ws = vo.chipWidths
            let all = sum(ws) + vo.gap * (n - 1)
            if (all <= avail + eps) {
                vo.nShow = n
                return
            }

            //放不下: 前 k 顆 + k 個間距(k 顆之間 k−1 個, 加最後一顆與指示之間 1 個) + 指示寬, 取最大 k; 至少 1 顆(本項永不收合)
            let used = 0
            let k = 0
            for (let i = 0; i < n; i++) {
                let need = used + ws[i] + vo.gap + vo.indicatorWidth
                if (need > avail + eps) {
                    break
                }
                used += ws[i] + vo.gap
                k = i + 1
            }
            vo.nShow = Math.max(k, 1)

        },

    },
}
</script>

<style scoped>
</style>
