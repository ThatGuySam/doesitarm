<template>
    <div v-if="name !== 'default'">
        <a href="https://amzn.to/3bllXrC">
            <div
                class="relative border border-gray-700 rounded-lg shadow-lg flex overflow-hidden"
            >
                <div class="flex flex-col text-center">
                    <img
                        src="https://vumbnail.com/OKnUBs-Ko44.jpg"
                        class="w-32 aspect-video object-cover"
                        alt="Skull figure with menacing red eyes"
                    >
                </div>
                <div class="flex flex-col justify-center text-center opacity-50 p-4">
                    New World: Carve Your Destiny
                </div>
                <div
                    class="absolute bottom-0 right-0 border-t border-l rounded-tl uppercase opacity-25 px-1"
                    style="font-size: 0.45rem;"
                >
                    Ads via Amazon
                </div>
            </div>
        </a>
    </div>
    <CarbonInline
        v-else
        class="carbon-inline-wide w-full"
    />
</template>

<script>
/* Carbon ads */
import CarbonInline from './carbon-inline.vue'

export default {
    components: {
        CarbonInline
    },
    props: {
        name: {
            type: String,
            default: 'default'
        }
    }
}
</script>
