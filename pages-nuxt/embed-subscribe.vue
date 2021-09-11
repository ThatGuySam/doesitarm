<template>
    <AllUpdatesSubscribe
        class="w-100 h-100 absolute inset-0 flex justify-center items-center"
    />
</template>

<script>

import AllUpdatesSubscribe from '~/components/all-updates-subscribe.vue'

export default {
    layout: 'embed',

    components: {
        AllUpdatesSubscribe
    },

    data: function () {
        return {}
    },

    head() {
        return {
            title: 'Subscribe',
            // meta: [
            //     // hid is used as unique identifier. Do not use `vmid` for it as it will not work
            //     {
            //         hid: 'description',
            //         name: 'description',
            //         content: 'My custom description'
            //     }
            // ]
        }
    }
}
</script>
