<template>
    <section class="container py-24">
        <div class="flex flex-col items-center">
            <h1 class="title text-3xl md:text-5xl font-hairline leading-tight text-center pb-4">
                {{ pluralLabel }} that are reported to support Apple Silicon
            </h1>

            <h2
                v-if="supportedAppList.length !== 0"
                class="subtitle md:text-xl text-center"
            >
                Supported apps include {{ supportedAppList.join(', ') }}.
            </h2>

            <Search
                :app-list="categoryAppList"
                :quick-buttons="quickButtons"
                @update:query="query = $event"
            />


            <div class="flex flex-col md:flex-row space-x-0 space-y-4 md:space-y-0 md:space-x-4">
                <template v-if="category.requestLinks">
                    <LinkButton
                        v-for="link in category.requestLinks"
                        :key="link.label"
                        :href="link.href"
                        class="text-xs"
                    >
                        {{ link.label }}
                    </LinkButton>
                </template>
                <template v-else>
                    <ListEndButtons :query="query" />
                </template>
            </div>

        </div>
    </section>
</template>

<script>
import Search from '~/components/search.vue'
import LinkButton from '~/components/link-button.vue'
import ListEndButtons from '~/components/list-end-buttons.vue'

import { categories, getAppCategory } from '~/helpers/categories.js'

export default {
    async asyncData ({ params: { slug } }) {
        const { sortedAppList, allList, allVideoAppsList, makeAppSearchLinks } = await import('~/helpers/get-list.js')
        const { default: gameList } = await import('~/static/game-list.json')
        const { default: videoList } = await import('~/static/video-list.json')

        const filteredList = allList.filter(app => {
            return app.category.slug === slug
        })

        return {
            slug,
            categoryAppList: filteredList.map( app => {
                return {
                    name: app.name,
                    status: app.status,
                    slug: app.slug,
                    // endpoint: app.endpoint,
                    text: app.text,
                    lastUpdated: app.lastUpdated,
                    category: app.category,
                    searchLinks: makeAppSearchLinks( app, (new Set(videoList)) )
                }
            })
        }
    },
    components: {
        Search,
        LinkButton,
        ListEndButtons
    },
    data: function () {
        return {
            query: '',
            quickButtons: [
                {
                    label: '✅ Native Support',
                    query: 'status:native'
                },
                {
                    label: '✳️ Rosetta',
                    query: 'status:rosetta'
                },
                {
                    label: '🚫 Unsupported',
                    query: 'status:no'
                },
            ]
        }
    },
    computed: {
        category () {
            if ( categories.hasOwnProperty( this.slug ) ) {
                return categories[this.slug]
            }

            // Try to find the category info within the passed apps
            const appWithCategory = this.categoryAppList.find( app => {
                return app.category.slug === this.slug
            })

            // console.log('appWithCategory', appWithCategory)

            return appWithCategory.category
        },
        pluralLabel () {
            if ( this.category.hasOwnProperty('pluralLabel') ) {
                return this.category.pluralLabel
            }

            return this.category.label
        },
        supportedAppList () {
            return this.categoryAppList.filter(app => {
                return app.status.includes('yes')
            }).map(app => app.name)
        },
        title () {
            return `List of ${this.pluralLabel || this.category.label} that work on Apple Silicon?`
        },
        description () {
            return `Check the the latest reported support status of ${this.pluralLabel || this.category.label} on Apple Silicon and Apple M1 Pro and M1 Max Processors. `
        },
        structuredData () {
            return {
                "@context": "https://schema.org",
                // https://developers.google.com/search/docs/data-types/faqpage
                // https://schema.org/FAQPage
                "@type": "FAQPage",
                "mainEntity": this.categoryAppList.map( app => {
                    return {
                        // https://schema.org/Question
                        "@type": "Question",
                        "name": `Does ${app.name} work on Apple Silicon and Apple M1 Pro and M1 Max Macs?`,
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
