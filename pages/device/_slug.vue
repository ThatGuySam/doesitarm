<template>
    <section class="container py-24">
        <div class="flex flex-col items-center">
            <h1 class="title text-3xl md:text-5xl font-hairline leading-tight text-center pb-4">
                App support for {{ device.name }}
            </h1>

            <h2
                v-if="supportedAppList.length !== 0"
                class="subtitle md:text-xl text-center"
            >
                Supported apps include {{ supportedAppList.join(', ') }}.
            </h2>

            <Search
                :app-list="deviceAppList"
                :quick-buttons="quickButtons"
                @update:query="query = $event"
            >
                <template v-slot:before-search>
                    <div class="empty-div" />
                </template>
            </Search>


            <div class="flex flex-col md:flex-row space-x-0 space-y-4 md:space-y-0 md:space-x-4">

                <LinkButton
                    :href="`https://github.com/ThatGuySam/doesitarm/issues?q=is%3Aissue+${query}`"
                    class="text-xs"
                >
                    Request an App with Github
                </LinkButton>

                <LinkButton
                    :href="`https://twitter.com/DoesItARM/status/1330027384041508865`"
                    class="text-xs"
                >
                    Request an App with Twitter
                </LinkButton>

                <LinkButton
                    :href="`/apple-silicon-app-test/`"
                    class="text-xs"
                >
                    Scan Your Own App
                </LinkButton>

            </div>

        </div>
    </section>
</template>

<script>
import Search from '~/components/search.vue'
import LinkButton from '~/components/link-button.vue'

// import { categories } from '~/helpers/categories.js'
import { deviceSupportsApp } from '~/helpers/devices.js'

export default {
    async asyncData ({ params: { slug } }) {
        const { default: Chance } = await import('chance')

        const { allList } = await import('~/helpers/get-list.js')
        const { default: deviceList } = await import('~/static/device-list.json')
        // const { default: gameList } = await import('~/static/game-list.json')
        // const { default: videoList } = await import('~/static/video-list.json')

        const charCode = slug.charCodeAt( slug.length-2 )
        const shuffler = new Chance( charCode )

        const device = deviceList.find( device => {
            return device.slug === slug
        })

        const deviceAppList = allList.map( app => {
            const appIsSupported = deviceSupportsApp( device, app )

            return {
                name: app.name,
                status: app.status,
                slug: app.slug,
                // endpoint: app.endpoint,
                text: appIsSupported ? `✅ Supported on ${device.name}` : `🚫 Not yet reported working on ${device.name}`,
                lastUpdated: app.lastUpdated,
                category: app.category,
                // searchLinks: makeAppSearchLinks( app, (new Set(videoList)) )
            }
        })

        const supportedApps = deviceAppList.filter( app => {
            const supported = app.text.startsWith('✅')
            const hasNotAllowedCategory = ([
                'no-category',
                'homebrew',
                'games',
            ]).some( categorySlug => (app.category.slug === categorySlug) )

            // console.log('hasNonStandardCategory', app.category.slug, hasNonStandardCategory)

            return supported && !hasNotAllowedCategory
        })

        const featuredApps = shuffler.shuffle( supportedApps ).slice(0, 12)

        // console.log('featuredApps', featuredApps[0])

        return {
            slug,
            device,
            featuredApps,
            deviceAppList
        }
    },
    components: {
        Search,
        LinkButton
    },
    data: function () {
        return {
            query: '',
            quickButtons: []
        }
    },
    computed: {
        supportedAppList () {
            return this.featuredApps.map(app => app.name)
        },
        title () {
            return `App support list for ${this.device.name}`
        },
        description () {
            return `Check the the latest reported support status of apps and software on ${this.device.name}.`
        },
        structuredData () {
            return {
                "@context": "https://schema.org",
                // https://developers.google.com/search/docs/data-types/faqpage
                // https://schema.org/FAQPage
                "@type": "FAQPage",
                "mainEntity": this.deviceAppList.map( app => {
                    return {
                        // https://schema.org/Question
                        "@type": "Question",
                        "name": `Does ${app.name} work on ${ this.device.name }?`,
                        "acceptedAnswer": {
                            // https://schema.org/Answer
                            "@type": "Answer",
                            "text": app.text
                        }
                    }
                })
            }
        }
    },
    head() {
        return {
            title: this.title,
            meta: [
                // hid is used as unique identifier. Do not use `vmid` for it as it will not work
                {
                    'hid': 'description',
                    'name': 'description',
                    'content': this.description
                },

                // Twitter Card
                {
                    'hid': 'twitter:title',
                    'property':  'twitter:title',
                    'content': this.title
                },
                {
                    'hid': 'twitter:description',
                    'property':  'twitter:description',
                    'content': this.description
                },
                {
                    'property':  'twitter:url',
                    'content': `${process.env.URL}${this.$nuxt.$route.path}`
                },
            ],
            __dangerouslyDisableSanitizers: ['script'],
            script: [{ innerHTML: JSON.stringify(this.structuredData), type: 'application/ld+json' }]
        }
    }
}
</script>
