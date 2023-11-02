<template>
    <WDialog
        :show.sync="loading"
        :maxWidth="barWidth+barPadding*2"
    >

        <template v-slot:panel>

            <div :style="`padding:${barPadding-5}px ${barPadding}px ${barPadding}px ${barPadding}px;`">


                <div style="padding-bottom:3px; font-size:0.9rem; color:#666;">

                    <span v-if="msg!==''">{{msg}}</span>

                    <span v-else>{{$t('processing')}}</span>

                </div>

                <WProgressBar
                    :style="`width:${barWidth}px;`"
                    :height="3"
                    :enableContinuous="true"
                    :progColor="'deep-purple lighten-1'"
                    :progBackgroundColor="'deep-purple lighten-4'"
                ></WProgressBar>

            </div>

        </template>

    </WDialog>
</template>

<script>
import Vue from 'vue'
import get from 'lodash/get'
import WDialog from 'w-component-vue/src/components/WDialog.vue'
import WProgressBar from 'w-component-vue/src/components/WProgressBar.vue'


export default {
    components: {
        WDialog,
        WProgressBar,
    },
    props: {
    },
    data: function() {
        return {
            barPadding: 20,
            barWidth: 600,
            msg: '',
        }
    },
    mounted: function() {
        //console.log('mounted')

        let vo = this

        //set
        Vue.prototype.$dg.setLoadingWinBarMessage = vo.setMessage

    },
    computed: {

        loading: function() {
            //console.log('computed loading')

            let vo = this

            return get(vo, `$store.state.loading`)
        },

    },
    methods: {

        setMessage: function(msg) {
            this.msg = msg
        },

    }
}
</script>

<style scoped>
</style>
