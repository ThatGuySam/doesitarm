<template>
    <div
        ref="search-container"
        class="search-container w-full space-y-4"
    >
        <slot name="before-search">
            <div class="list-summary-wrapper flex justify-center text-center text-sm">
                <ListSummary
                    v-if="summary !== null"
                    :custom-numbers="summary"
                    class="max-w-4xl"
                />
            </div>
        </slot>

        <div class="search-input relative space-y-4">
            <div>
                <input
                    id="search"
                    ref="search"
                    v-model="userTextQuery"
                    :autofocus="autofocus"
                    aria-label="Type here to Search"
                    class="appearance-none w-full text-white font-hairline sm:text-5xl outline-none bg-transparent p-3"
                    type="search"
                    placeholder="Type to Search"
                    autocomplete="off"
                    @keyup="handleSearchInput"
                >
                <div class="search-input-separator border-white border-t-2" />
            </div>
            <div class="quick-buttons overflow-x-auto whitespace-no-wrap space-x-2">
                <button
                    v-for="button in quickButtons"
                    :key="button.query"
                    :class="[
                        'inline-block text-xs rounded-lg py-1 px-2',
                        'border-2 border-white focus:outline-none',
                        hasActiveFilter( button.query ) ? 'border-opacity-50 bg-darkest' : 'border-opacity-0 neumorphic-shadow-inner'
                    ]"
                    :aria-label="`Filter list by ${button.label}`"
                    @click="toggleFilter(button.query); queryResults(query)"
                >{{ button.label }}</button>
            </div>
        </div>

        <div class="slot-wrapper">
            <slot name="ad-inline">
                <AdInline
                    v-once
                    :name="isSSR ? 'placeholder' : 'default'"
                    :page="kindPage"
                />
            </slot>
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

            <template v-if="chunkedListings.length === 0">
                <div
                    class="text-center py-4"
                >
                    <span>No apps found for</span>
                    <span
                        v-for="term in userTerms"
                        :key="term"
                        class="font-bold border rounded px-1 pb-1 mx-1"
                    >{{ term }}</span>

                    <template v-if="isFilteredList">
                        <span>within</span>

                        <span
                            v-for="term in baseFilters"
                            :key="term"
                            class="font-bold border rounded px-1 pb-1 mx-1"
                        >{{ term }}</span>
                    </template>
                </div>

                <div
                    v-if="baseFilters.length > 0"
                    class="w-full flex justify-center p-6"
                >
                    <LinkButton
                        href="/"
                        :class="[
                            'px-3 py-2 rounded-md text-sm pointer-events-auto focus:outline-none focus:text-white focus:bg-gray-700 transition duration-150 ease-in-out',
                            'text-gray-300 hover:bg-darker hover:neumorphic-shadow'
                        ]"
                        :class-groups="{
                            shadow: 'hover:neumorphic-shadow',
                            bg: 'hover:bg-darker',
                        }"
                        label="🌎 Search Everything"
                    />
                </div>
            </template>

            <ul
                v-for="(listingsChunk, chunkIndex) in chunkedListings"
                :key="`listings-chunk-${ chunkIndex }`"
                class="listings-container divide-y divide-gray-700"
            >
                <!-- <pre>
                    {{ listingsChunk }}
                </pre> -->
                <li
                    v-for="(listing, listingIndex) in listingsChunk"
                    :key="`${ listing.slug }-${ listingIndex }`"
                    :ref="`${ listing.slug }-row`"
                    :data-app-slug="listing.slug"
                    class="relative"
                >
                    <!-- app.endpoint: {{ app.endpoint }} -->
                    <a
                        :href="listing.endpoint"
                        :class="[
                            'flex flex-col justify-center inset-x-0 hover:bg-darkest border-2 border-white border-opacity-0 hover:border-opacity-50 focus:outline-none focus:bg-gray-50 duration-300 ease-in-out rounded-lg space-y-2 -mx-5 pl-5 md:pl-20 pr-6 md:pr-64 py-5',
                            listing?.linkClass
                        ]"
                        style="transition-property: border;"
                    >


                        <div class="absolute hidden left-0 h-12 w-12 rounded-full md:flex items-center justify-center bg-darker">
                            {{ getIconForListing( listing ) }}
                        </div>

                        <h3
                            v-html="listing.name"
                        />

                        <div class="text-sm leading-5 font-bold">
                            {{ listing.text }}
                        </div>

                        <div
                            v-if="listing.storkResult"
                            class="text-xs leading-5 font-light"
                        >
                            <div
                                v-for="(excerpt, excerptIndex) in listing.storkResult.excerpts"
                                :key="`excerpt-${ excerptIndex }`"
                                class="result-excerpt space-y-3"
                            >
                                <div
                                    v-for="(range, rangeIndex) in makeHighlightedMarkup( excerpt )"
                                    :key="`range-${ rangeIndex }`"

                                    v-html="range"
                                />
                            </div>
                        </div>
                        <!-- listing.lastUpdated: {{ listing.lastUpdated }} -->
                        <template v-if="listing.lastUpdated">
                            <small
                                class="text-xs opacity-50"
                            >
                                <RelativeTime
                                    :timestamp="listing.lastUpdated.timestamp"
                                    class="text-xs opacity-50"
                                />
                            </small>
                        </template>

                        <!-- listing.endpoint: {{ listing.endpoint }} -->

                    </a>


                    <div
                        class="search-item-options relative md:absolute md:inset-0 w-full pointer-events-none"
                    >
                        <div class="search-item-options-container h-full flex justify-center md:justify-end items-center pb-4 md:py-4 md:px-4">
                            <LinkButton
                                v-for="link in getSearchLinks( listing )"
                                :key="`${ listing.slug }-${ link.label.toLowerCase() }`"
                                :href="link.href"
                                :class="[
                                    'px-3 py-2 rounded-md text-sm pointer-events-auto focus:outline-none focus:text-white focus:bg-gray-700 transition duration-150 ease-in-out',
                                    'text-gray-300 hover:bg-darker hover:neumorphic-shadow'
                                ]"
                                :class-groups="{
                                    // general: 'relative inline-flex items-center rounded-md px-4 py-2',
                                    // font: 'leading-5 font-bold',
                                    // text: 'text-white',
                                    // border: 'border border-transparent focus:outline-none focus:border-indigo-600',
                                    shadow: 'hover:neumorphic-shadow',
                                    bg: 'hover:bg-darker',
                                    // transition: 'transition duration-150 ease-in-out'
                                }"
                                :label="link.label"
                            />

                            <LinkButton
                                v-if="listing.endpoint.length"
                                :href="listing.endpoint"
                                :class="[
                                    'px-3 py-2 rounded-md text-sm pointer-events-auto focus:outline-none focus:text-white focus:bg-gray-700 transition duration-150 ease-in-out',
                                    'text-gray-300 hover:bg-darker hover:neumorphic-shadow'
                                ]"
                                :class-groups="{
                                    // general: 'relative inline-flex items-center rounded-md px-4 py-2',
                                    // font: 'leading-5 font-bold',
                                    // text: 'text-white',
                                    // border: 'border border-transparent focus:outline-none focus:border-indigo-600',
                                    shadow: 'hover:neumorphic-shadow',
                                    bg: 'hover:bg-darker',
                                    // transition: 'transition duration-150 ease-in-out'
                                }"
                            >
                                <span>Details</span>

                                <svg
                                    class="h-5 w-5 -mr-2"
                                    viewBox="0 0 20 20"
                                    fill="currentColor"
                                >
                                    <use href="#chevron-right" />
                                </svg>
                            </LinkButton>
                        </div>
                    </div>
                </li>

                <li
                    v-if="showingInitialList"
                    class="list-navigation"
                >
                    <nav
                        class="pagination w-full flex gap-6 justify-center py-4"
                    >
                        <LinkButton
                            v-if="previousPageUrl"
                            :href="previousPageUrl"

                            :class="[
                                'w-32 justify-end',
                                'rounded-md text-sm pointer-events-auto focus:outline-none focus:text-white focus:bg-gray-700 transition duration-150 ease-in-out px-3 py-2',
                                'text-gray-300 hover:bg-darker hover:neumorphic-shadow'
                            ]"
                            :class-groups="{
                                shadow: 'hover:neumorphic-shadow',
                                bg: 'hover:bg-darker',
                            }"
                        >
                            <svg
                                class="-scale-x-100 h-5 w-5"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                            >
                                <use href="#chevron-right" />
                            </svg>

                            <span>Previous</span>
                        </LinkButton>

                        <LinkButton
                            v-if="nextPageUrl"
                            :href="nextPageUrl"

                            :class="[
                                'w-32',
                                'px-3 py-2 rounded-md text-sm pointer-events-auto focus:outline-none focus:text-white focus:bg-gray-700 transition duration-150 ease-in-out',
                                'text-gray-300 hover:bg-darker hover:neumorphic-shadow'
                            ]"
                            :class-groups="{
                                shadow: 'hover:neumorphic-shadow',
                                bg: 'hover:bg-darker',
                            }"
                        >
                            <span>Next</span>

                            <svg
                                class="h-5 w-5"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                            >
                                <use href="#chevron-right" />
                            </svg>
                        </LinkButton>
                    </nav>
                </li>
            </ul>
        </div>

        <div class="list-end-area flex justify-center py-6">
            <ListEndButtons
                :query="userTextQuery"
            />
        </div>

    </div>
</template>

<script>
import scrollIntoView from 'scroll-into-view-if-needed'

import {
    defaultStatusFilters,
} from '~/helpers/statuses.js'
import {
    getIconForListing
} from '~/helpers/app-derived.js'
import {
    StorkClient,
    StorkFilters,
    makeHighlightedMarkup,
    makeHighlightedResultTitle
} from '~/helpers/stork/browser.js'

import AdInline from '~/components/ad-inline.vue'
import LinkButton from '~/components/link-button.vue'
import RelativeTime from '~/components/relative-time.vue'
import ListSummary from '~/components/list-summary.vue'
import ListEndButtons from '~/components/list-end-buttons.vue'

let storkClient = null

export default {
    components: {
        AdInline,
        ListSummary,
        RelativeTime,
        LinkButton,
        ListEndButtons
    },
    props: {
        kindPage: {
            type: Object,
            required: true
        },
        initialLimit: {
            type: Number,
            default: null
        },
        autofocus: {
            type: Boolean,
            default: false
        },
        quickButtons: {
            type: Array,
            default: () => defaultStatusFilters
        },
        baseFilters: {
            type: Array,
            default: () => []
        },
        listSummary: {
            type: Object,
            default: () => null
        },
    },
    data: function () {
        return {
            userTextQuery: '',
            filterQueryList: [],
            hasStartedAnyQuery: false,
            listingsResults: [],
            waitingForQuery: false,
            isSSR: import.meta.env.SSR
        }
    },
    computed: {
        storkQuery () {
            return [
                this.userTextQuery.trim(),
                ...this.filterQueryList
            ].join(' ')
        },
        appList () {
            return this.kindPage.items
        },
        initialList () {
            return this.initialLimit !== null ? this.appList.slice(0, this.initialLimit) : this.appList
        },
        listings () {
            // Build filler listings to use while loading results
            if ( this.waitingForQuery ) return Array( 10 ).fill({ name: 'Loading', slug: 'loading', endpoint: '', linkClass: 'shimmer pointer-events-none' })

            if ( this.showingInitialList ) return this.initialList

            return this.listingsResults
        },
        // Chunk results to avoid having a parent node with more than 60 child nodes.
        chunkedListings () {

            const listings = [
                ...this.listings
            ]

            const size = 25
            const chunks = []

            while (listings.length > 0)
                chunks.push(listings.splice(0, size))

            return chunks
        },
        isFilteredList () {
            return this.baseFilters.length > 0
        },
        hasSearchInputText () {
            return this.userTextQuery.length > 0
        },
        hasAnyUserFilters () {
            return this.userFilters.length > 0
        },
        hasAnyUserTerms () {
            return this.userTerms.length > 0
        },
        showingInitialList () {
            return !this.hasAnyUserTerms
        },
        inputTerms () {
            return this.userTextQuery.trim().split(' ')
        },
        userFilters () {
            // console.log('filterQueryList', )
            return this.filterQueryList.filter( filterTerm => {
                return !this.baseFilters.includes( filterTerm )
            })
        },
        userTerms () {
            // If out input is empty, return just the user filters
            if ( !this.hasSearchInputText ) return this.userFilters

            return [
                ...this.inputTerms,
                ...this.userFilters
            ]
        },
        summary () {
            if ( this.listSummary !== null ) {
                return this.listSummary
            }

            if ( !!this.kindPage.summary ) {
                return this.kindPage.summary
            }

            return null
        },
        previousPageUrl () {
            if ( this.kindPage.previousPage.length === 0 ) return null

            return this.kindPage.previousPage
        },
        nextPageUrl () {
            if ( this.kindPage.nextPage.length === 0 ) return null

            return this.kindPage.nextPage
        }
    },
    mounted () {
        // Setup stork client
        storkClient = new StorkClient()

        // Store filter instance
        this.storkFilters = new StorkFilters()

        // Add initial filters
        this.storkFilters.setFromStringArray( this.baseFilters )

    },
    methods: {
        makeHighlightedMarkup,
        makeHighlightedResultTitle,

        getIconForListing,

        getSearchLinks (app) {
            return app?.searchLinks || []
        },
        // Search tools
        hasActiveFilter ( filter ) {
            return this.filterQueryList.includes( filter )
        },
        toggleFilter ( newFilterQuery ) {

            this.storkFilters.toggleFilter( newFilterQuery )

            this.filterQueryList = this.storkFilters.list
        },
        scrollInputToTop () {
            scrollIntoView(this.$refs['search-container'], {
                block: 'start',
                behavior: 'smooth'
            })
        },

        // Called on input and when a filter is toggled
        async queryResults ( rawQuery ) {

            console.log( 'query', this.storkQuery )

            // If our query is empty
            // then bail
            if ( this.storkQuery.trim().length === 0 ) return

            this.waitingForQuery = true

            this.$emit('update:query', rawQuery)

            // Declare that at least one query has been made
            this.hasStartedAnyQuery = true

            // console.log('rawQuery', rawQuery)

            const requiredTerms = this.storkQuery.split(' ')

            const storkQuery = await storkClient.lazyQuery( this.storkQuery, requiredTerms )

            // If the query response is empty
            // then return
            if ( storkQuery === null ) {
                return
            }

            // console.log( 'storkQuery', storkQuery )

            this.listingsResults = storkQuery.results.map( result => {
                return {
                    name: makeHighlightedResultTitle( result ),
                    endpoint: result.entry.url,
                    slug: '',
                    category: {
                        slug: 'uncategorized'
                    },
                    storkResult: result
                }
            })

            // Switch from loading state and reveal the results
            this.waitingForQuery = false

            // console.log('this.listingsResults', this.listingsResults)
        },

        handleSearchInput ( event ) {
            const inputValue = event.target.value

            this.scrollInputToTop()
            this.queryResults( inputValue )
        },
    }
}
</script>
