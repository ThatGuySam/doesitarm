<template>
    <div class="flex flex-col items-center">
        <div class="search-input container relative">
            <input
                id="search"
                ref="search"
                v-model="query"
                aria-label="Type here to Search"
                class="appearance-none w-full text-white font-bold sm:text-5xl outline-none bg-transparent p-3"
                type="search"
                placeholder="Type to Search"
                autofocus
                autocomplete="off"
                @keyup="queryResults(query)"
            >
            <div class="search-input-separator border-white border-t-4" />
        </div>
        <div
            ref="search-container"
            class="search-container relative w-full overflow-scroll scroll-elastic overscroll-contain"
        >
            <div class="search-wrapper flex justify-center pb-32">
                <div class="search-scroller container w-full relative min-h-screen px-5">

                    <div class="search-results py-8">

                        <div class="results-container">
                            <div
                                v-for="(app, i) in results"
                                :key="`${app.slug}-${i}`"
                            >
                                {{ app.name }}
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    </div>
</template>

<script>
import appList from '~/assets/app-list.json'

// import overlayStore from './mixins/store'
// import modalRouter from '~/components/modals/mixins/router'
// import Card from '~/components/cards/Default.vue'
// import CardsRow from '~/components/cards/Row.vue'
// import ComingSoonImage from '~/components/partials/ComingSoonImage.vue'
// import InfoCircle from '~/assets/svg/info-circle.svg?inline'
// import PlayCircle from '~/assets/svg/play-circle.svg?inline'

export default {
    data: function () {
        return {
            appList,
            query: '',
            // results: [],
            titleStartsWithResults: [],
            titleContainsResults: [],
            descriptionContainsResults: [],
            // store: overlayStore.state
        }
    },
    computed: {
        results () {
            if (!this.hasSearchInputText) return appList

            return [
                ...this.titleStartsWithResults,
                ...this.titleContainsResults,
                ...this.descriptionContainsResults
            ]
        },
        hasSearchInputText () {
            return this.query.length > 0
        },
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
    // mounted () {
    // },
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
        descriptionContains (query, app) {
            const matches = app.description.toLowerCase().includes(query)
            if (matches) {
                this.descriptionContainsResults.push(app)
            }
            return matches
        },
        // Search tools
        pluck (array, index) {
            const pluckedItem = array[index]
            array.splice(index, 1)
            return pluckedItem
        },
        queryResults (rawQuery) {
            // Clear any results from before
            this.titleStartsWithResults = []
            this.titleContainsResults = []
            this.descriptionContainsResults = []


            // Snap results scroll position back to top
            this.$refs['search-container'].scrollTop = 0


            // If our query is empty
            // then bail
            if (rawQuery.length === 0) return
            const query = rawQuery.toLowerCase()


            // Search App List
            this.appList.forEach(app => {
                const matchers = [
                    this.titleStartsWith,
                    this.titleContains,
                    // this.descriptionContains
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
