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

import { byTimeThenNull } from '~/helpers/sort-list.js'

import { categories, getAppCategory } from '~/helpers/categories.js'

import appList from '~/static/app-list.json'
import gamelist from '~/static/game-list.json'
import homebrewList from '~/static/homebrew-list.json'

const allList = [
    ...appList.sort(byTimeThenNull),
    ...homebrewList,
    ...gamelist,
]

export default {
    async asyncData ({ params: { slug } }) {
        // Maybe I could import() here to reduce client script size
        return {
            slug,
            // app: appList.find(app => (app.slug === slug))
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
        categoryAppList () {

            const filteredList = allList.filter(app => {
                return app.category.slug === this.slug
            })

            // const sortedList = list.sort(byTimeThenNull)

            // if (this.category.slug === 'homebrew') {
            //     return filteredList.slice(0, 300)
            // }

            return filteredList
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
