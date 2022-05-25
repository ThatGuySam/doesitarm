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
                    v-model="query"
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
                        hasQueryPart( button.query ) ? 'border-opacity-50 bg-darkest' : 'border-opacity-0 neumorphic-shadow-inner'
                    ]"
                    :aria-label="`Filter list by ${button.label}`"
                    @click="toggleFilter(button.query); queryResults(query)"
                >{{ button.label }}</button>
            </div>
        </div>

        <Carbon class="carbon-inline-wide" />

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
                v-if="chunkedListings.length === 0"
                class="text-center py-4"
            >
                No apps found
            </div>

            <ul
                v-for="(listings, i) in chunkedListings"
                :key="`listings-chunk-${i}`"
                class="listings-container divide-y divide-gray-700"
            >
                <!-- <pre>
                    {{ listings }}
                </pre> -->
                <li
                    v-for="(listing, i) in listings"
                    :key="`${ listing.slug }-${i}`"
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

                        <div
                            v-if="listing.storkResult"
                            class="text-xs leading-5 font-light"
                        >
                            <div
                                v-for="(excerpt, i) in listing.storkResult.excerpts"
                                :key="`excerpt-${i}`"
                                class="result-excerpt space-y-3"
                            >
                                <div
                                    v-for="(range, i) in makeHighlightedMarkup( excerpt )"
                                    :key="`range-${i}`"

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
                            <small
                                slot="placeholder"
                                class="text-xs opacity-50"
                            >
                                ⏳
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
                            >
                                {{ link.label }}
                            </LinkButton>

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
            </ul>

        </div>
    </div>
</template>

<script>
import scrollIntoView from 'scroll-into-view-if-needed'

import {
    defaultStatusFilters,
    statusFilterPrefix,
    statusFilterSeparator,
} from '~/helpers/statuses.js'
import { getAppCategory } from '~/helpers/categories.js'
import {
    getAppEndpoint,
    getIconForListing
} from '~/helpers/app-derived.js'
import {
    StorkClient,
    makeHighlightedMarkup,
    makeHighlightedResultTitle
} from '~/helpers/stork/browser.js'

import Carbon from '~/components/carbon-inline.vue'
import LinkButton from '~/components/link-button.vue'
import RelativeTime from '~/components/relative-time.vue'
import ListSummary from '~/components/list-summary.vue'

let storkClient = null

export default {
    components: {
        Carbon,
        ListSummary,
        RelativeTime,
        LinkButton,
    },
    props: {
        kindPage: {
            type: Object,
            required: true
        },
        noEmailSubscribe: {
            type: Boolean,
            default: false
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
        listSummary : {
            type: Object,
            default: () => null
        },
    },
    data: function () {
        return {
            query: '',
            hasStartedAnyQuery: false,
            listingsResults: [],
            waitingForQuery: false
        }
    },
    computed: {
        appList () {
            return this.kindPage.items
        },
        initialList () {
            return this.initialLimit !== null ? this.appList.slice(0, this.initialLimit) : this.appList
        },
        listings () {
            // Build filler listings to use while loading results
            if ( this.waitingForQuery ) return Array( 10 ).fill({ name: 'Loading', slug: 'loading', endpoint: '', linkClass: 'shimmer pointer-events-none' })

            if (!this.hasSearchInputText) return this.initialList

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
        hasSearchInputText () {
            return this.query.length > 0
        },
        queryParts () {
            return this.query.split(/\s+/).filter(part => part.length > 0)
        },
        summary () {
            if ( this.listSummary !== null ) {
                return this.listSummary
            }

            if ( !!this.kindPage.summary ) {
                return this.kindPage.summary
            }

            return null
        }
    },
    mounted () {
        // Setup stork client
        storkClient = new StorkClient()
    },
    methods: {
        makeHighlightedMarkup,
        makeHighlightedResultTitle,

        getAppCategory,
        getAppEndpoint,
        getIconForListing,

        getSearchLinks (app) {
            return app?.searchLinks || []
        },

        statusIs (query, app) {

            // console.log('query', query)

            if (!query.includes( statusFilterPrefix + statusFilterSeparator )) return

            const status = query.substring(query.indexOf( statusFilterSeparator )+1)


            const matches = app.status.includes(status) || app.status === status

            return matches
        },
        // Search tools
        getFilterKeyAndValue (query) {
            const key = query.substring(0, query.indexOf( statusFilterSeparator ))
            const value = query.substring(query.indexOf( statusFilterSeparator )+1)
            return { key, value }
        },
        hasQueryPart (part) {
            return this.queryParts.includes( part )
        },
        toggleFilter ( newFilterQuery ) {

            // Get the key and value from our filter
            // const [
            //     newFilterKey, // This will always have a value
            //     newFilterValue = null
            // ] = newFilterQuery.split( statusFilterSeparator )

            const {
                key: newFilterKey,
                value: newFilterValue = null
            } = this.getFilterKeyAndValue( newFilterQuery )

            const oldQueryWords = this.query.split(' ')

            let oldHasStatus = false
            let oldHasWords = false

            oldQueryWords.forEach( word => {
                if (word.includes( statusFilterPrefix + statusFilterSeparator )) {
                    oldHasStatus = true
                    return
                }

                if (word.trim().length !== 0) oldHasWords = true
            })

            // If this filter is already present
            // then remove it
            if ( this.hasQueryPart( newFilterQuery ) ) {
                this.query = oldQueryWords.filter( word => word !== newFilterQuery ).join(' ')

                //this.query.replace(newFilterQuery, '').trim()

                return
            }

            // If there is only an existing status and we're adding a plain words
            // and the newQuery is not
            // then prepend the words to the existing status
            if (oldHasStatus && !oldHasWords && newFilterValue === null) {
                this.query = [
                    newFilterQuery,
                    this.query.trim()
                ].join(' ')

                return
            }

            // There is no filter key
            // then update the whole query
            if (newFilterValue === null) {
                this.query = newFilterQuery

                return
            }

            // However, if the query already has a status
            // then update the existing status
            if ( this.hasQueryPart( newFilterQuery ) ) {

                // const queryWords = this.query.split(' ')

                this.query = this.queryParts.map( word => {
                    // If this the filter word
                    // then update it to the new one
                    if (word.includes(newFilterKey)) return newFilterQuery

                    return word.trim()
                }).join(' ')

                return


            // Otherwise add to the end of our current query
            } else {
                const queryWords = []

                // If the query is not empty
                // then add it to our updated query
                if (this.query.trim().length) queryWords.push(this.query.trim())

                // Append the new filter
                queryWords.push(newFilterQuery)

                // Update the query
                this.query = queryWords.join(' ')
            }
        },
        scrollInputToTop () {
            scrollIntoView(this.$refs['search-container'], {
                block: 'start',
                behavior: 'smooth'
            })
        },

        // Called on input and when a filter is toggled
        async queryResults ( rawQuery ) {

            // If our query is empty
            // then bail
            if ( rawQuery.trim().length === 0 ) return

            this.waitingForQuery = true

            this.$emit('update:query', rawQuery)

            // Declare that at least one query has been made
            this.hasStartedAnyQuery = true

            // console.log('rawQuery', rawQuery)

            const storkQuery = await storkClient.lazyQuery( rawQuery )

            // If the query response is empty
            // then return
            if ( storkQuery === null ) {
                return
            }

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
