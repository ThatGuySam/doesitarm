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
    // Since Vue renders the ad on the server
    // but destroys the ad when hydrating on
    // the browser, we render an empty placeholder ad
    // so that it get's properly rendered at the browser
    // and so that our ad css still get's imported.
    'placeholder': {
        url: '/',
        imageSrc: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
        imageAlt: '',
        copy: '',
        corner: '',
    },

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
    'jotform-for-developers-1': {
        url: 'https://link.jotform.com/doesitarm-er2mEdHP4F',
        imageSrc: 'https://vumbnail.com/wUFOq6jLGOU.jpg',
        imageAlt: 'Jotform logo',
        copy: '<form>Easy Forms for Developers.</form>',
        corner: 'Ad'
    },
    'wondershare-arm-1': {
        url: 'https://shrsl.com/3mbnp',
        imageSrc: 'https://vumbnail.com/QYmz3KdNRhs.jpg',
        imageAlt: 'Wondershare Filmora on a macOS Desktop',
        copy: 'Filmora X now supports ARM',
        corner: 'Ad'
    },
    'expressvpn-bounty': {
        url: 'http://www.xvuslink.com/blog/bug-bounty-bonus-vpn-server-vulnerabilities/?a_aid=doesitarm',
        imageSrc: 'https://vumbnail.com/7uE7kFcJ_Pk.jpg',
        imageAlt: 'Protect Your Online Privacy Now With ExpressVPN',
        copy: 'ExpressVPN\'s $100,000 bug bounty bonus for VPN server vulnerabilities',
        corner: 'Ad'
    }
}

export default {
    components: {
        CarbonInline
    },
    props: {
        name: {
            type: String,
            default: 'default'
        },
    },
    computed: {
        ad () {
            return ads[ this.name ]
        }
    },
}
</script>
