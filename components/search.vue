<template>
    <div class="search w-full">
        <div class="list-summary-wrapper flex justify-center text-center text-sm my-4">

            <ListSummary
                :app-list="appList"
                class="max-w-4xl"
            />

        </div>

        <div class="search-input relative">
            <input
                id="search"
                ref="search"
                v-model="query"
                aria-label="Type here to Search"
                class="appearance-none w-full text-white font-hairline sm:text-5xl outline-none bg-transparent p-3"
                type="search"
                placeholder="Type to Search"
                autofocus
                autocomplete="off"
                @keyup="queryResults(query); scrollInputToTop()"
            >
            <div class="search-input-separator border-white border-t-2" />
            <div class="quick-buttons overflow-x-auto whitespace-no-wrap py-2 space-x-2">
                <button
                    v-for="button in quickButtons"
                    :key="button.query"
                    class="inline-block text-xs neumorphic-shadow-inner rounded-lg py-1 px-2"
                    @click="query = button.query; queryResults(query)"
                >{{ button.label }}</button>
            </div>
        </div>
        <div
            ref="search-container"
            class="search-container relative divide-y divide-gray-700 w-full rounded-lg border border-gray-700 bg-gradient-to-br from-darker to-dark my-8 px-5"
        >

            <svg style="display: none;">
                <defs>
                    <path
                        id="chevron-right"
                        fill-rule="evenodd"
                        d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                        clip-rule="evenodd"
                    />
                </defs>
            </svg>

            <!-- hasStartedAnyQuery: {{ hasStartedAnyQuery }} -->

            <div
                v-if="chunkedResults.length === 0"
                class="text-center py-4"
            >
                No apps found
            </div>

            <ul
                v-for="(results, i) in chunkedResults"
                :key="`results-chunk-${i}`"
                class="results-container divide-y divide-gray-700"
            >
                <li
                    v-for="(app, i) in results"
                    :key="`${app.slug}-${i}`"
                    :ref="`${app.slug}-row`"
                    :data-app-slug="app.slug"
                    class="relative"
                >
                    <a
                        :href="app.endpoint"
                        class="flex flex-col justify-center inset-x-0 hover:bg-darkest border-2 border-white border-opacity-0 hover:border-opacity-50 focus:outline-none focus:bg-gray-50 duration-300 ease-in-out rounded-lg space-y-2 -mx-5 pl-5 md:pl-20 pr-6 md:pr-64 py-6 "
                        style="transition-property: border;"
                    >
                        <template v-if="seenItems[app.slug] === false && hasStartedAnyQuery === false">
                            {{ app.endpoint.includes('/game/') ? `🕹${app.name}` : app.name }}
                            <div class="text-sm leading-5 font-bold">
                                {{ app.text }}
                            </div>
                        </template>
                        <template v-else>
                            <client-only>
                                <div class="absolute hidden left-0 h-12 w-12 rounded-full md:flex items-center justify-center bg-darker">
                                    {{ app.name.charAt(0) }}
                                </div>
                            </client-only>

                            {{ app.endpoint.includes('/game/') ? `🕹${app.name}` : app.name }}
                            <div class="text-sm leading-5 font-bold">
                                {{ app.text }}
                            </div>
                            <!-- app.lastUpdated: {{ app.lastUpdated }} -->
                            <client-only v-if="app.lastUpdated">
                                <small
                                    class="text-xs opacity-50"
                                >
                                    <RelativeTime
                                        :timestamp="app.lastUpdated.timestamp"
                                        class="text-xs opacity-50"
                                    />
                                </small>
                                <small
                                    slot="placeholder"
                                    class="text-xs opacity-50"
                                >
                                    ⏳
                                </small>
                            </client-only>

                            <client-only>
                                <svg
                                    class="absolute right-0 h-5 w-5 text-gray-400"
                                    viewBox="0 0 20 20"
                                    fill="currentColor"
                                >
                                    <use href="#chevron-right" />
                                </svg>
                            </client-only>
                        </template>

                    </a>

                    <client-only v-if="seenItems[app.slug] || hasStartedAnyQuery">
                        <div
                            class="search-item-options relative md:absolute md:inset-0 w-full pointer-events-none"
                        >

                            <div class="search-item-options-container h-full flex justify-center md:justify-end items-center pb-4 md:py-4 md:px-12">

                                <div
                                    v-if="!app.endpoint.includes('/game/')"
                                    class="subscribe space-y-6 sm:space-x-6"
                                >
                                    <EmailSubscribe
                                        :app-name="app.name"
                                        :input-class-groups="{
                                            shadow: 'hover:neumorphic-shadow',
                                            bg: '',
                                            focus: 'bg-transparent neumorphic-shadow pl-8',
                                            blur: 'placeholder-white text-center border border-transparent bg-transparent opacity-50 hover:opacity-100 px-3',
                                        }"
                                        class="pointer-events-auto"
                                    />
                                </div>

                            </div>

                        </div>
                    </client-only>
                </li>
            </ul>

        </div>
    </div>
</template>

<script>
import scrollIntoView from 'scroll-into-view-if-needed'

// import appList from '~/static/app-list.json'

// import EmailSubscribe from '~/components/email-subscribe.vue'
// import RelativeTime from '~/components/relative-time.vue'
import ListSummary from '~/components/list-summary.vue'

// import overlayStore from './mixins/store'
// import modalRouter from '~/components/modals/mixins/router'
// import Card from '~/components/cards/Default.vue'
// import CardsRow from '~/components/cards/Row.vue'
// import ComingSoonImage from '~/components/partials/ComingSoonImage.vue'
// import InfoCircle from '~/assets/svg/info-circle.svg?inline'
// import PlayCircle from '~/assets/svg/play-circle.svg?inline'

export default {
    components: {
        EmailSubscribe: () => process.client ? import('~/components/email-subscribe.vue') : null,
        ListSummary,
        RelativeTime: () => process.client ? import('~/components/relative-time.vue') : null
    },
    props: {
        appList: {
            type: Array,
            required: true
        },
        noEmailSubscribe: {
            type: Boolean,
            default: false
        },
        quickButtons: {
            type: Array,
            default: () => [
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
    data: function () {
        return {
            // appList,
            query: '',
            hasStartedAnyQuery: false,
            observer: null,
            seenItems: Object.fromEntries(this.appList.map(app => {
                return [app.slug, false]
            })),
            // results: [],
            titleStartsWithResults: [],
            titleContainsResults: [],
            sectionContainsResults: [],
            statusResults: [],
            // store: overlayStore.state
        }
    },
    computed: {
        results () {
            if (!this.hasSearchInputText) return this.appList

            return [
                ...this.titleStartsWithResults,
                ...this.titleContainsResults,
                ...this.sectionContainsResults,
                ...this.statusResults
            ]
        },
        // Chunk results to avoid having a parent node with more than 60 child nodes.
        chunkedResults () {

            const results = [
                ...this.results
            ]

            const size = 25
            const chunks = []

            while (results.length > 0)
                chunks.push(results.splice(0, size))

            return chunks
        },
        hasSearchInputText () {
            return this.query.length > 0
        },
    },
    beforeDestroy() {
        this.observer.disconnect()
    },
    // watch: {
    //     'store.mode': function (newMode) {
    //         // If we're showing the search
    //         // then focus on the search input
    //         // on the next tick when our input
    //         // exists
    //         if (newMode === 'search') {
    //             this.$nextTick(() => {
    //                 this.$refs.search.focus()
    //             })
    //         }
    //     }
    // },
    mounted () {
        // console.log(this.$el)

        this.observer = new IntersectionObserver(this.onElementObserved, {
            // root: this.$el,
            threshold: 1.0,
        })

        // Start observing all search rows
        this.appList.forEach(app => {
            // console.log('this.$refs[`${app.slug}-row`]', this.$refs[`${app.slug}-row`][0])
            this.observer.observe(this.$refs[`${app.slug}-row`][0])
        })

        console.log('appList', this.appList.length)
    },
    methods: {
        // Search priorities
        titleStartsWith (query, app) {
            const matches = app.name.toLowerCase().startsWith(query)
            if (matches) {
                this.titleStartsWithResults.push(app)
            }
            return matches
        },
        titleContains (query, app) {
            const matches = app.name.toLowerCase().includes(query)
            if (matches) {
                this.titleContainsResults.push(app)
            }
            return matches
        },
        sectionContains (query, app) {
            const matches = app.section.label.toLowerCase().includes(query)
            if (matches) {
                this.sectionContainsResults.push(app)
            }
            return matches
        },
        statusIs (query, app) {

            // if (typeof app.status !== 'string') {
            //     console.log('app', app)
            //     console.log('status', status)
            //     console.log('app.status.includes(status)', app.status.includes(status))
            // }

            if (!query.includes('status:')) return

            const [_, status] = query.split(':')

            const matches = app.status.includes(status) || app.status === status

            if (matches) {
                this.statusResults.push(app)
            }

            return matches
        },
        // Search tools
        pluck (array, index) {
            const pluckedItem = array[index]
            array.splice(index, 1)
            return pluckedItem
        },
        scrollInputToTop () {
            scrollIntoView(this.$refs['search'], {
                block: 'start',
                behavior: 'smooth'
            })
        },
        onElementObserved(entries) {
            entries.forEach(({ target, isIntersecting }) => {
                if (!isIntersecting) {
                    return
                }

                this.observer.unobserve(target)

                // console.log('Observed target', target)

                const appSlug = target.getAttribute('data-app-slug')

                this.seenItems[appSlug] = true
            });
        },
        queryResults (rawQuery) {
            // Clear any results from before
            this.titleStartsWithResults = []
            this.titleContainsResults = []
            this.sectionContainsResults = []
            this.statusResults = []


            // Snap results scroll position back to top
            this.$refs['search-container'].scrollTop = 0

            this.$emit('update:query', rawQuery)


            // If our query is empty
            // then bail
            if (rawQuery.length === 0) return
            const query = rawQuery.toLowerCase()

            this.hasStartedAnyQuery = true


            // Search App List
            this.appList.forEach(app => {
                const matchers = [
                    this.titleStartsWith,
                    this.titleContains,
                    this.sectionContains,
                    this.statusIs
                ]

                // Run through our search priorities
                for (const method of matchers){
                    // iterations++
                    const appMatches = method(query, app)
                    if (appMatches) {
                        // We've found a match for this app
                        // so let's stop trying match methods
                        // and search the next app
                        break
                    }
                }
            })
            // console.log('query', query)
            // console.log('iterations', iterations)
        }
    }
}
</script>
