<template>
    <section class="container py-24">
        <div class="flex flex-col items-center">
            <h1 class="title text-4xl md:text-6xl font-hairline leading-tight text-center">
                Does it ARM?
            </h1>
            <h2 class="subtitle md:text-xl font-light text-center">
                Apps that are reported to support Apple Silicon
            </h2>

            <Search
                :app-list="allList"
                :quick-buttons="quickButtons"
                :initial-limit="100"
                @update:query="onQueryUpdate"
            >
                <template v-slot:before-search>
                    <div class="list-summary-wrapper flex justify-center text-center text-sm my-4">

                        <ListSummary
                            :custom-numbers="customSummaryNumbers"
                            class="max-w-4xl"
                        />

                    </div>
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
            </div>

            <AllUpdatesSubscribe
                :input-class-groups="{
                    shadow: 'hover:neumorphic-shadow',
                    bg: '',
                    focus: 'bg-transparent neumorphic-shadow pl-8',
                    blur: 'placeholder-white text-center border border-transparent bg-transparent opacity-50 hover:opacity-100 px-3',
                }"
                class="my-12"
            />

        </div>
    </section>
</template>

<script>
import axios from 'axios'

import getListSummaryNumbers from '~/helpers/get-list-summary-numbers.js'

import Search from '~/components/search.vue'
import LinkButton from '~/components/link-button.vue'
import AllUpdatesSubscribe from '~/components/all-updates-subscribe.vue'
import ListSummary from '~/components/list-summary.vue'

export default {
    async asyncData () {
        // const { default: appList } = await import('~/static/app-list.json')
        // const { default: gamelist } = await import('~/static/game-list.json')

        const { sortedAppList, allList } = await import('~/helpers/get-list.js')



        return {
            // Filter app list to leave out data not needed for search
            initialAppList: sortedAppList.map( app => {
                return {
                    name: app.name,
                    status: app.status,
                    slug: app.slug,
                    // endpoint: app.endpoint,
                    text: app.text,
                    lastUpdated: app.lastUpdated,
                    category: app.category,
                }
            }),
            customSummaryNumbers: getListSummaryNumbers(allList)
        }
    },
    components: {
        Search,
        LinkButton,
        AllUpdatesSubscribe,
        ListSummary
    },
    data: function () {
        return {
            query: '',
            fetchedAppList: [],
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
                {
                    label: '🎮 Games',
                    query: 'Games'
                },
                {
                    label: '🍺 Homebrew Formulae',
                    query: 'Homebrew'
                },
                {
                    label: 'Music Tools',
                    query: 'Music'
                },
                {
                    label: 'Developer Tools',
                    query: 'Developer'
                },
                {
                    label: 'Photo Tools',
                    query: 'Photo'
                },
                {
                    label: 'Video Tools',
                    query: 'Video'
                },
                {
                    label: 'Productivity Tools',
                    query: 'Productivity'
                },
            ]
        }
    },
    computed: {
        allList () {
            return [
                ...this.initialAppList,
                ...this.fetchedAppList
            ]
        }
    },
    methods: {
        async onQueryUpdate ( $event ) {
            // console.log('$event', $event)
            this.query = $event

            // If fetched lists have already been loaded in
            // OR if there's no query
            // then stop
            if (this.fetchedAppList.length !== 0 || this.query.trim().length === 0) return

            const fetchedListUrls = [
                '/game-list.json',
                '/homebrew-list.json'
            ]

            const fetchedLists = await Promise.all(fetchedListUrls.map( async listUrl => {
                // Fetch List
                const response = await axios.get(listUrl)
                // Extract apps from response data
                const fetchedApps = response.data

                return fetchedApps
            }))

            // console.log('fetchedLists', fetchedLists)

            this.fetchedAppList = fetchedLists.flat(1)

            return
        }
    }
}
</script>
