import {
    isNonEmptyString
} from '~/helpers/check-types.js'
import {
    pagefindBundleRelativeURL,
    pagefindScriptURL
} from '~/helpers/pagefind/config.js'

const pagefindGlobalKey = '__doesItArmPagefind'
const pagefindLoaderPromiseKey = '__doesItArmPagefindLoaderPromise'
const pagefindLoaderTimeoutMs = 10 * 1000

function escapeHtml ( text = '' ) {
    return text
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;')
}

function escapeRegExp ( value ) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function makeHighlightedPagefindTitle ( title, terms = [] ) {
    const highlightedTerms = terms
        .filter( term => isNonEmptyString( term ) )
        .map( term => term.trim() )
        .filter( term => term.length > 0 )
        .sort( ( a, b ) => b.length - a.length )

    const titleMarkup = escapeHtml( title || '' )

    if ( highlightedTerms.length === 0 ) {
        return titleMarkup
    }

    const pattern = highlightedTerms.map( escapeRegExp ).join('|')

    return titleMarkup.replace(
        new RegExp(`(${ pattern })`, 'gi'),
        '<span class="stork-highlighted-text font-bold text-white bg-green-800 rounded px-1">$1</span>'
    )
}

export function normalizePagefindExcerptMarkup ( excerptMarkup = '' ) {
    if ( !isNonEmptyString( excerptMarkup ) ) return ''

    return excerptMarkup
        .replace(/<mark[^>]*>/g, '<span class="stork-highlighted-text font-bold text-white bg-green-800 rounded px-1">')
        .replace(/<\/mark>/g, '</span>')
}

export function mapPagefindDataToListing ( resultData, {
    highlightTerms = []
} = {} ) {
    const lastUpdatedTimestamp = Number( resultData.meta?.lastUpdatedTimestamp || 0 )

    return {
        name: makeHighlightedPagefindTitle( resultData.meta?.title || resultData.url, highlightTerms ),
        text: resultData.meta?.text || resultData.url,
        endpoint: resultData.url,
        slug: resultData.meta?.slug || resultData.url,
        category: {
            slug: resultData.meta?.categorySlug || 'uncategorized'
        },
        lastUpdated: lastUpdatedTimestamp > 0 ? {
            timestamp: lastUpdatedTimestamp
        } : null,
        resultExcerptsMarkup: isNonEmptyString( resultData.excerpt ) ? [
            normalizePagefindExcerptMarkup( resultData.excerpt )
        ] : []
    }
}

function getPagefindModuleSource () {
    return [
        `import * as pagefindModule from ${ JSON.stringify( pagefindScriptURL ) }`,
        `globalThis.${ pagefindGlobalKey } = pagefindModule.default || pagefindModule`
    ].join('\n')
}

function waitForPagefindGlobal () {
    return new Promise( ( resolve, reject ) => {
        if ( globalThis[ pagefindGlobalKey ] ) {
            resolve( globalThis[ pagefindGlobalKey ] )
            return
        }

        const startedAt = Date.now()
        const timer = setInterval( () => {
            if ( globalThis[ pagefindGlobalKey ] ) {
                clearInterval( timer )
                resolve( globalThis[ pagefindGlobalKey ] )
                return
            }

            if ( Date.now() - startedAt >= pagefindLoaderTimeoutMs ) {
                clearInterval( timer )
                reject( new Error(`Timed out waiting for Pagefind browser module at ${ pagefindScriptURL }`) )
            }
        }, 20 )
    } )
}

async function loadPagefindBrowserModule () {
    if ( typeof document === 'undefined' ) {
        throw new Error('PagefindClient can only load in a browser document')
    }

    if ( globalThis[ pagefindGlobalKey ] ) {
        return globalThis[ pagefindGlobalKey ]
    }

    if ( !globalThis[ pagefindLoaderPromiseKey ] ) {
        globalThis[ pagefindLoaderPromiseKey ] = new Promise( async ( resolve, reject ) => {
            const script = document.createElement('script')

            script.async = true
            script.type = 'module'
            script.textContent = getPagefindModuleSource()

            script.onerror = () => {
                delete globalThis[ pagefindLoaderPromiseKey ]
                reject( new Error(`Failed to load Pagefind browser module from ${ pagefindScriptURL }`) )
            }

            document.head.append( script )

            try {
                resolve( await waitForPagefindGlobal() )
            } catch ( err ) {
                delete globalThis[ pagefindLoaderPromiseKey ]
                reject( err )
            }
        } )
    }

    return await globalThis[ pagefindLoaderPromiseKey ]
}

export class PagefindClient {
    constructor ( options = {} ) {
        this.bundlePath = options.bundlePath || pagefindBundleRelativeURL
        this.pagefind = options.pagefind || null
        this.debounceMs = options.debounceMs || 100
        this.cancelCurrentQuery = null
    }

    setupState = 'not-setup'

    get isSetup () {
        return this.setupState === 'complete'
    }

    waitForSetup () {
        return new Promise( resolve => {
            if ( this.isSetup ) resolve()

            const timer = setInterval( () => {
                if ( this.isSetup ) {
                    clearInterval( timer )
                    resolve()
                }
            }, 50 )
        })
    }

    async loadPagefindScript () {
        if ( this.pagefind ) return

        const pagefindModule = await loadPagefindBrowserModule()
        this.pagefind = pagefindModule.default || pagefindModule

        this.pagefind.options({
            bundlePath: this.bundlePath
        })
    }

    async setup () {
        if ( this.setupState !== 'not-setup' ) {
            await this.waitForSetup()
            return
        }

        this.setupState = 'pending'

        await this.loadPagefindScript()

        if ( typeof this.pagefind.init === 'function' ) {
            await this.pagefind.init()
        }

        this.setupState = 'complete'
    }

    async lazyQuery ( query, {
        filters = {},
        sort = {}
    } = {} ) {
        const searchOptions = {}

        if ( Object.keys( filters ).length > 0 ) {
            searchOptions.filters = filters
        }

        if ( Object.keys( sort ).length > 0 ) {
            searchOptions.sort = sort
        }

        const trimmedQuery = query.trim()

        const result = await new Promise( async ( resolve, reject ) => {
            if ( this.cancelCurrentQuery !== null ) {
                this.cancelCurrentQuery()
            }

            this.cancelCurrentQuery = () => { reject({ message: `Cancelled previous query for ${ trimmedQuery }`, canceled: true }) }

            if ( !this.isSetup ) await this.setup()

            if ( trimmedQuery.length === 0 ) {
                resolve( await this.pagefind.search( null, searchOptions ) )
                return
            }

            resolve( await this.pagefind.debouncedSearch( trimmedQuery, searchOptions, this.debounceMs ) )
        }).catch( err => {
            console.log('Query rejected', err)
            return null
        })

        this.cancelCurrentQuery = null

        return result
    }
}
