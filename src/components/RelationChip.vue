<template>
    <div
        :style="`display:inline-flex; align-items:stretch; height:22px; min-width:0; max-width:100%; line-height:20px; font-size:12px; vertical-align:middle; white-space:nowrap;`"
        :title="name"
    >

        <!-- 模式段: 本項且可編輯時為下拉控制項, 其餘為純文字 -->
        <ModeSelectChip
            style="flex:0 0 auto;"
            :value="mode"
            :editable="true"
            :highlight="true"
            :attached="true"
            :labelContent="labelContent"
            @input="(item)=>{$emit('input',item)}"
            v-if="modeEditable"
        ></ModeSelectChip>
        <div
            :style="`flex:0 0 auto; box-sizing:border-box; height:22px; padding:0 5px; border-radius:4px 0 0 4px; border:1px solid ${useModeBorderColor}; border-right-color:${useModeBorderRightColor}; background:${useModeBackgroundColor}; color:${useTextColor};`"
            v-else
        >
            {{ mode }}
        </div>

        <!-- 名稱段: 超長名稱以省略號截斷, 全名放於 title; 空間不足時由名稱段收縮讓位(模式段永遠完整, 本項之下拉永遠點得到) -->
        <div
            :style="`flex:0 1 auto; min-width:0; box-sizing:border-box; height:22px; padding:0 5px; border-radius:0 4px 4px 0; border:1px solid ${useNameBorderColor}; border-left:none; background:${useNameBackgroundColor}; color:${useTextColor}; max-width:${nameMaxWidth}px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;`"
        >
            {{ name }}
        </div>

    </div>
</template>

<script>
import ModeSelectChip from './ModeSelectChip.vue'


//單顆關聯 chip: [模式段 | 名稱段], 整顆高 22px、方角 4px、字 12px
//  - isCurrent=true 為本項(該列與對話框當前對象之關係), 醒目色; 其餘為白底灰邊之一般色
//  - editable=true 且 isCurrent=true 時, 模式段即 ModeSelectChip(chip 即下拉); 其他 chip 之模式段只顯示不可改
export default {
    components: {
        ModeSelectChip,
    },
    props: {
        name: {
            type: String,
            default: '',
        },
        mode: {
            type: String,
            default: 'OR',
        },
        isCurrent: {
            type: Boolean,
            default: false,
        },
        editable: {
            type: Boolean,
            default: false,
        },
        nameMaxWidth: {
            type: Number,
            default: 240,
        },
        labelContent: {
            type: String,
            default: 'modeSelect',
        },
    },
    computed: {

        modeEditable: function() {
            let vo = this
            return vo.editable && vo.isCurrent
        },

        useTextColor: function() {
            let vo = this
            return vo.isCurrent ? '#fff' : '#555'
        },

        useModeBackgroundColor: function() {
            let vo = this
            return vo.isCurrent ? '#be295a' : '#fff'
        },

        useModeBorderColor: function() {
            let vo = this
            return vo.isCurrent ? '#ac2451' : '#aaa'
        },

        useModeBorderRightColor: function() {
            let vo = this
            return vo.isCurrent ? '#9e2149' : '#aaa'
        },

        useNameBackgroundColor: function() {
            let vo = this
            return vo.isCurrent ? '#d22f64' : '#eee'
        },

        useNameBorderColor: function() {
            let vo = this
            return vo.isCurrent ? '#ac2451' : '#aaa'
        },

    },
}
</script>

<style scoped>
</style>
