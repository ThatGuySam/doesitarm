import { filterSeparator } from '~/helpers/constants.js'

import { isString } from '~/helpers/check-types.js'

import {
    storkIndexRelativeURL,
    storkScriptURL
} from '~/helpers/stork/config.js'

export function makeHighlightedMarkup ( options = {} ) {
    const {
        text,
        highlight_ranges,
        withElipsis = true,
    } = options

    if ( highlight_ranges.length === 0 ) return [ text ]

    const highlighted_text = highlight_ranges.map( range => {
        const {
            beginning,
            end
        } = range

        const before = text.slice( 0, beginning )
        const target = text.slice( beginning, end + 1 )
        const after = text.slice( end + 1 )

        // console.log({
        //     before,
        //     target,
        //     after
        // })

        // `<span class="stork-highlighted-text">${ highlighted_text }</span>`

        return [
            withElipsis ? '...' : '',
            before.trim(),
            /* html */` <span class="stork-highlighted-text font-bold text-white bg-green-800 rounded px-1">${ target.trim() }</span> `,
            after.trim(),
            withElipsis ? '...' : '',
        ].join('')
    } )

    return highlighted_text
}

export function makeHighlightedResultTitle ( result ) {
    const [ highlightedTitleMarkup ] = makeHighlightedMarkup({
        text: result.entry.title,
        highlight_ranges: result.title_highlight_ranges,
        withElipsis: false
    })

    // console.log('highlightedTitleMarkup', highlightedTitleMarkup)
    // console.log('result', result)

    if ( !isString( highlightedTitleMarkup ) ) throw new Error('highlightedTitleMarkup is not a string')

    return highlightedTitleMarkup
}

export class StorkClient {
    constructor ( options = {} ) {

        this.name = options.name || 'index'
        this.url = options.url || storkIndexRelativeURL

        // Configuration Reference - https://stork-search.net/docs/js-ref#showProgress
        // Example - https://github.com/jameslittle230/stork/blob/ff49f163db06734e18ab690c188b45a3c68442ae/js/config.ts#L4
        this.config = {
            minimumQueryLength: 1,
            showScores: true,
            ...options.config || {}
        }

        // Stork instance
        this.stork = options.stork || null

        this.cancelCurrentQuery = null
    }

    setupState = 'not-setup'

    get isSetup () {
        return this.setupState === 'complete'
    }

    resultHasTerm ( result, term ) {
        const {
            entry: {
                url,
                title
            },
            excerpts
        } = result

        if ( title.toLowerCase().includes( term.toLowerCase() ) ) return true

        if ( url.toLowerCase().includes( term.toLowerCase() ) ) return true

        for ( const excerpt of excerpts ) {
            if ( excerpt.text.toLowerCase().includes( term.toLowerCase() ) ) return true
        }

        return false
    }

    resultHasAnyTerm ( result, terms ) {
        for ( const term of terms ) {
            if ( this.resultHasTerm( result, term ) ) return true
        }

        return false
    }

    resultHasAllTerms ( result, terms ) {
        for ( const term of terms ) {
            if ( !this.resultHasTerm( result, term ) ) return false
        }

        return true
    }

    search ( query ) {
        if ( !this.isSetup ) throw new Error('Not setup')

        // search() - https://github.com/jameslittle230/stork/blob/ff49f163db06734e18ab690c188b45a3c68442ae/js/main.ts#L55
        return this.stork.search( this.name, query )
    }

    // Loads the Stork WASM and Index into the browser on first query
    // so that we don't have to load them initially.
    async lazyQuery ( query, requiredTerms = [] ) {

        // Sleep
        // await new Promise( resolve => setTimeout( resolve, 50000000 ) )

        const result = await new Promise( async ( resolve, reject ) => {

            // If there an existing query to cancel
            // then cancel it
            // so that we don't race bad conditions
            // such as earrly queries beating the final one
            if ( this.cancelCurrentQuery !== null ) {
                this.cancelCurrentQuery()
            }

            // Plugin this promise to our cancel method
            this.cancelCurrentQuery = () => { reject({ message: `Cancelled previous query for ${ query }`, canceled: true }) }

            if ( !this.isSetup ) await this.setup()

            // console.log('debounce', this.query)

            const queryResponse = this.search( query )

            if ( requiredTerms.length !== 0 ) {
                // Filter out results that don't have the required terms
                const filteredResults = queryResponse.results.filter( result => {
                    return this.resultHasAllTerms( result, requiredTerms )
                })


                resolve( {
                    ...queryResponse,
                    results: filteredResults
                } )

                return
            }

            resolve( queryResponse )

        }).catch( err => {
            console.log('Query rejected', err)
            return null
        })

        console.log( 'result', result )

        return result
    }

    waitForSetup () {
        return new Promise( resolve => {
            if ( this.isSetup ) resolve()

            // Start timer to check for setup
            const timer = setInterval( () => {
                if ( this.isSetup ) {
                    clearInterval( timer )
                    resolve()
                }
            }, 50 )
        })
    }

    loadStorkScript () {

        return new Promise((resolve, reject) => {
            if ( !!this.stork ) resolve()

            if ( !!window.stork ) {
                this.stork = window.stork
                resolve()
            }

            const s = document.createElement('script')
            let r = false
            s.type = 'text/javascript'
            s.src = storkScriptURL
            s.async = true
            s.onerror = function(err) {
                reject(err, s)
            }

            s.onload = s.onreadystatechange = () => {
                // console.log(this.readyState); // uncomment this line to see which ready states are called.
                if (!r && (!this.readyState || this.readyState == 'complete')) {
                    r = true

                    this.stork = window.stork

                    // console.log('window.stork', typeof window.stork)
                    resolve()
                }
            }

            const t = document.getElementsByTagName('script')[0]
            t.parentElement.insertBefore(s, t)
        })
    }

    // https://github.com/jameslittle230/stork/blob/ff49f163db06734e18ab690c188b45a3c68442ae/js/main.ts#L40
    async setup () {
        // Prevent multiple setups
        if ( this.setupState !== 'not-setup' ) {
            await this.waitForSetup()
            return
        }

        // We're the first to setup
        // so let's set the state to prevent duplicates
        this.setupState = 'pending'

        // Load Stork Script
        if ( !this.stork ) {
            // console.log('Loading stork script...')
            await this.loadStorkScript()
        }

        const {
            initialize,
            downloadIndex,
        } = this.stork

        // Stork JavaScript Reference - https://stork-search.net/docs/js-ref

        // initialize() - https://github.com/jameslittle230/stork/blob/ff49f163db06734e18ab690c188b45a3c68442ae/js/main.ts#L14
        const initPromise = initialize()

        // downloadIndex() - https://github.com/jameslittle230/stork/blob/ff49f163db06734e18ab690c188b45a3c68442ae/js/main.ts#L20
        const downloadPromise = downloadIndex( this.name, this.url, this.config )

        // This silly `then` call turns a [(void), (void)] into a (void), which is
        // only necessary to make Typescript happy.
        // You begin to wonder if you write Typescript code, or if Typescript code writes you.
        await Promise.all([ initPromise, downloadPromise ])

        // Mark setup as complete
        this.setupState = 'complete'

        return
    }
}

export class StorkFilters {
    constructor({
        initialFilters = {}
    } = {}) {
        this.initialFilters = initialFilters

        this.filters = {
            ...initialFilters
        }
    }

    get list () {
        return Object.entries( this.filters ).map( ([ filterKey, filterValue ]) => {
            return `${ filterKey }${ filterSeparator }${ filterValue }`
        } )
    }

    get asQuery () {
        return this.list.join(' ')
    }

    getByKey ( key ) {
        return `${ key }${ filterSeparator }${ this.filters[ key ] }`
    }

    isQueryValue ( filterNameOrQueryValue ) {
        return filterNameOrQueryValue.includes( filterSeparator )
    }

    getKeyAndValue ( filterQueryValue ) {
        const key = filterQueryValue.substring(0, filterQueryValue.indexOf( filterSeparator ))
        const value = filterQueryValue.substring(filterQueryValue.indexOf( filterSeparator )+1)

        return { key, value }
    }

    getFilterNameAndValueFromString ( filterNameOrQueryValue ) {
        if ( this.isQueryValue( filterNameOrQueryValue ) ) {
            return this.getKeyAndValue( filterNameOrQueryValue )
        }

        return {
            key: filterNameOrQueryValue,
            value: null
        }
    }

    remove ( filterName ) {
        // Throw error if it's not a valid filter name
        if ( this.isQueryValue( filterName ) ) throw new Error(`${ filterName } is not a valid filter name`)

        delete this.filters[ filterName ]
    }

    setFromStringArray ( filterStringArray ) {
        filterStringArray.forEach( filterString => {
            const { key, value } = this.getFilterNameAndValueFromString( filterString )

            this.filters[ key ] = value
        })
    }

    setFromString ( filterNameOrQueryValue ) {
        const {
            key,
            value = ''
        } = this.getFilterNameAndValueFromString( filterNameOrQueryValue )

        // Throw for empty values
        if ( value.trim().length === 0 ) throw new Error(`${ filterNameOrQueryValue } is not a valid filter value`)

        this.set( key, value )
    }

    set ( filterName, filterValue ) {
        // Throw error if it's not a valid filter name
        if ( this.isQueryValue( filterName ) ) throw new Error(`${ filterName } is not a valid filter name`)

        this.filters[ filterName ] = filterValue
    }

    toggleFilter ( filterNameOrQueryValue, filterValue = null ) {

        const fromString = this.getFilterNameAndValueFromString( filterNameOrQueryValue )

        const filterName = fromString.key
        filterValue = filterValue || fromString.value

        // If the filter is already set, remove it
        if ( this.has( filterNameOrQueryValue ) ) {
            this.remove( filterName )

            return
        }

        // Throw error if filter value is not a string
        if ( typeof filterValue !== 'string' ) {
            throw new Error(`Filter value must be a string. Got ${ typeof filterValue }`)
        }

        this.set( filterName, filterValue )
    }

    has ( filterNameOrQueryValue ) {

        const {
            key : filterName,
            value : filterValue = null
        } = this.getFilterNameAndValueFromString( filterNameOrQueryValue )

        // If this filter is a name and value, check if it's set
        if ( isString( filterValue ) ) {
            return !!this.filters[ filterName ] && this.filters[ filterName ] === filterValue
        }

        return !!this.filters[ filterName ]
    }
}
