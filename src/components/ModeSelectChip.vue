<template>
    <div
        ref="frame"
        :style="useFrameStyle"
        @mouseenter="hovered=true"
        @mouseleave="hovered=false"
        @click="clickFrame"
    >
        <WTextSuggestCore
            ref="core"
            style="width:100%;"
            :mode="'select'"
            :items="items"
            :value="value"
            :textFontSize="'12px'"
            :textColor="useTextColor"
            :itemTextFontSize="'12px'"
            :itemPaddingStyle="{v:6,h:6}"
            :expansionIcon="editable?undefined:''"
            :expansionIconSize="14"
            :expansionIconColor="useIconColor"
            :minWidth="width"
            :placementDistX="placementDistX"
            :labelContent="labelContent"
            :editable="editable"
            :showPanel="opened"
            @update:showPanel="(v)=>{opened=v}"
            @input="(item)=>{$emit('input',item)}"
        ></WTextSuggestCore>
    </div>
</template>

<script>
import WTextSuggestCore from 'w-component-vue/src/components/WTextSuggestCore.vue'


//合併模式(OR/AND)控制項: 自繪單層外框 + WTextSuggestCore(觸發文字、隨開合旋轉之箭頭、Teleport 至 body 之選項清單, 清單屬性 wtlp 為 labelContent)
//  - 為何不再用 WTextSelect: WTextSelect 之外框由 WShellEllipse 以「單一圓角值」繪製 1px 邊框, 無法只圓左側兩角;
//    舊版改以外層 border-radius + overflow:hidden 裁切一個方角邊框, 實測四角往內 2px 皆為底色(缺角)且下邊框被整條裁掉
//    (2026-09-17, tmp/probe-redesign-before.mjs)。現改由本元件之單一 div 直接畫邊框與圓角, 不再有任何裁切層。
//  - 獨立使用(VeCgrups/VeCpemis 之「合併…模式」欄): attached=false, 四角圓角 4px
//  - 嵌於本項 chip 之左段(RelationChip): attached=true, 只圓左側兩角, 右邊框為與名稱段之分隔色
//  - 尺寸: 寬 56 = 最長項 'AND' 於 12px 之墨跡 27 + 左內距 5 + 箭頭 14 + 右內距 3 + 邊框 1×2 + 餘裕 5 (固定寬使 OR/AND 切換時不跳動);
//          高 22 = line-height 20 + 上下邊框 1×2, 於 27px 儲存格內須由呼叫端以 flex 置中(上下各 2.5)
//  - 狀態: hover 或清單開啟中 → 加深色; 唯讀(editable=false) → 整體透明度 0.6、無箭頭、無手指游標、點擊不展開(唯讀時箭頭是空承諾)
//  - 可點範圍: 內核之點擊觸發只綁在文字區(WTooltip 之 divTrigger), 外框內距與邊框原為死區; 有手指游標就須整顆可點(全域 §10.6-4),
//    故外框 click 若不在觸發區內即自行開啟清單
//  - 清單對齊(全域 §10.6-6): 清單左緣錨定觸發文字左緣(外框 + 邊框 1 + 左內距 5), placementDistX=-6 使清單左緣退回外框左緣;
//    項目文字左緣由 itemPaddingStyle.h=6(邊框 1 + 內距 5)決定, 與觸發區文字左緣貼齊
export default {
    components: {
        WTextSuggestCore,
    },
    props: {
        value: {
            type: String,
            default: 'OR',
        },
        editable: {
            type: Boolean,
            default: true,
        },
        highlight: { //true 為本項(醒目色, 與 chip 醒目態同色), false 為一般(白底灰邊)
            type: Boolean,
            default: false,
        },
        attached: { //true 為嵌於 chip 左段(只圓左側兩角)
            type: Boolean,
            default: false,
        },
        width: {
            type: Number,
            default: 56,
        },
        placementDistX: { //清單浮層錨定於觸發文字, 往左退回內距 5 與邊框 1 使清單左緣對齊控制項外框左緣
            type: Number,
            default: -6,
        },
        labelContent: {
            type: String,
            default: 'modeSelect',
        },
    },
    data: function() {
        return {
            items: ['OR', 'AND'],
            hovered: false,
            opened: false,
        }
    },
    computed: {

        active: function() {
            let vo = this
            return vo.editable && (vo.hovered || vo.opened)
        },

        useTextColor: function() {
            let vo = this
            return vo.highlight ? '#fff' : '#555'
        },

        useIconColor: function() {
            let vo = this
            return vo.highlight ? '#fff' : '#777'
        },

        useBackgroundColor: function() {
            let vo = this
            if (vo.highlight) {
                return vo.active ? '#ac2451' : '#be295a' //同色系加深, 不翻轉
            }
            return vo.active ? '#f5f5f5' : '#fff'
        },

        useBorderColor: function() {
            let vo = this
            if (vo.highlight) {
                return vo.active ? '#9e2149' : '#ac2451'
            }
            return vo.active ? '#888' : '#aaa'
        },

        useBorderRightColor: function() { //嵌於 chip 時右邊框為與名稱段之分隔線, 與 RelationChip 唯讀模式段之分隔色一致
            let vo = this
            if (vo.attached && vo.highlight) {
                return '#9e2149'
            }
            return vo.useBorderColor
        },

        useFrameStyle: function() {
            let vo = this
            return [
                'display:inline-flex;',
                'align-items:center;',
                'box-sizing:border-box;',
                `width:${vo.width}px;`,
                'height:22px;',
                'line-height:20px;',
                'padding:0 3px 0 5px;',
                `border:1px solid ${vo.useBorderColor};`,
                `border-right-color:${vo.useBorderRightColor};`,
                `border-radius:${vo.attached ? '4px 0 0 4px' : '4px'};`,
                `background:${vo.useBackgroundColor};`,
                `opacity:${vo.editable ? 1 : 0.6};`,
                `cursor:${vo.editable ? 'pointer' : 'default'};`,
                'transition:background-color 0.3s, border-color 0.3s;',
                'vertical-align:middle;',
                'white-space:nowrap;',
            ].join(' ')
        },

    },
    methods: {

        clickFrame: function(e) {
            let vo = this

            //check
            if (!vo.editable || vo.opened) {
                return
            }

            //點在觸發區(文字與箭頭)內者由內核自行開啟, 此處只補外框內距與邊框之死區
            let core = vo.$refs.core
            let elCore = core && core.$el
            if (elCore && elCore.contains(e.target)) {
                return
            }

            //open
            vo.opened = true

        },

    },
}
</script>

<style scoped>
</style>
