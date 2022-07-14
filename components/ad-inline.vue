<template>
    <div
        v-if="name !== 'default'"
        class="w-full"
    >
        <a
            :href="ad.url"
        >
            <div
                class="relative w-full border border-gray-700 rounded-lg shadow-lg flex overflow-hidden"
            >
                <div class="flex flex-col text-center">
                    <img
                        :src="ad.imageSrc"
                        :alt="ad.imageAlt"
                        class="w-32 h-full aspect-video object-cover"
                    >
                </div>
                <div class="flex flex-col justify-center text-center opacity-50 p-4">
                    {{ ad.copy }}
                </div>
                <div
                    class="absolute bottom-0 right-0 border-t border-l rounded-tl uppercase opacity-25 px-1"
                    style="font-size: 0.45rem;"
                >
                    {{ ad.corner }}
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

const ads = {
    'new-world-1': {
        url: 'https://amzn.to/3bllXrC',
        imageSrc: 'https://vumbnail.com/OKnUBs-Ko44.jpg',
        imageAlt: 'Skull figure with menacing red eyes',
        copy: 'New World: Carve Your Destiny',
        corner: 'Ads via Amazon'
    },
    'codeable-1': {
        url: 'https://www.codeable.io/why-codeable/?ref=ZlTAB',
        imageSrc: 'https://vumbnail.com/712179177.jpg',
        imageAlt: 'Codeable logo',
        copy: 'Keep Productivity High & Clients Happy',
        corner: 'Ad'
    },
}

export default {
    components: {
        CarbonInline
    },
    props: {
        name: {
            type: String,
            default: 'default'
        }
    },
    computed: {
        ad () {
            return ads[ this.name ]
        }
    },
}
</script>
