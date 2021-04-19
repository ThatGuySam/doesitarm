<template>
    <section class="container py-24">
        <div class="flex flex-col">
            <h1 class="title text-2xl leading-tight mb-6">
                Devices
            </h1>

            <div class="line-separator border-white border-t-2 mb-12" />

            <!-- deviceList: {{ deviceList }} -->

            <ul class="device-list space-y-3">
                <li
                    v-for="(device, i) in deviceList"
                    :key="`${device.slug}-${i}`"
                    :ref="`${device.slug}-row`"
                    class="relative"
                >
                    <!-- device.endpoint: {{ device.endpoint }} -->
                    <a
                        :href="device.endpoint"
                        class="flex justify-start items-center inset-x-0 text-3xl md:text-4xl hover:bg-darkest border-2 border-white border-opacity-0 hover:border-opacity-50 focus:outline-none focus:bg-gray-50 duration-300 ease-in-out rounded-lg space-x-3 -mx-5 px-5 md:pr-64 py-3"
                        style="transition-property: border;"
                    >
                        <div class="font-hairline">
                            <div>{{ device.name }}</div>
                            <!-- <div class="text-xs opacity-75 mb-3">{{ device.appNames }}</div> -->
                        </div>
                        <div>➔</div>
                    </a>

                </li>
            </ul>

        </div>
    </section>
</template>

<script>
import LinkButton from '~/components/link-button.vue'

export default {
    async asyncData () {
        const { default: deviceList } = await import('~/static/device-list.json')

        return {
            deviceList
        }

    },
    components: {
        LinkButton
    },
    data: function () {
        return {}
    },
    // computed: {
    //     deviceList () {
    //         return deviceList
    //     }
    // },
    head() {
        return {
            title: `Categories of App Support for Apple Silicon - Does It ARM`,
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
