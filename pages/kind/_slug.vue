<template>
    <section class="container py-24">
        <div class="flex flex-col items-center">
            <h1 class="title text-3xl md:text-5xl font-hairline leading-tight text-center pb-4">
                {{ category.pluralLabel || category.label }} that are reported to support Apple Silicon
            </h1>

            <h2
                v-if="supportedAppList.length !== 0"
                class="subtitle md:text-xl font-light text-center"
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
                </template>
            </div>

        </div>
    </section>
</template>

<script>
import Search from '~/components/search.vue'
import LinkButton from '~/components/link-button.vue'

import { categories, getAppCategory } from '~/helpers/categories.js'

export default {
    async asyncData ({ params: { slug } }) {
        const { sortedAppList, allList, allVideoAppsList, makeAppSearchLinks } = await import('~/helpers/get-list.js')
        const { default: gameList } = await import('~/static/game-list.json')

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
                    searchLinks: makeAppSearchLinks(app)
                }
            })
        }
    },
    components: {
        Search,
        LinkButton
    },
    data: function () {
        return {
            query: '',
            quickButtons: [
                {
                    label: '✅ Full Native Support',
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
            return categories[this.slug]
        },
        supportedAppList () {
            return this.categoryAppList.filter(app => {
                return app.status.includes('yes')
            }).map(app => app.name)
        },
        title () {
            return `List of ${this.category.pluralLabel || this.category.label} that work on Apple Silicon?`
        },
        description () {
            return `Check the the latest reported support status of ${this.category.pluralLabel || this.category.label} on Apple Silicon and Apple M1 Processors. `
        },
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
            ]
        }
    }
}
</script>
