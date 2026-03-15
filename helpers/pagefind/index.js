import fs from 'fs-extra'
import * as pagefind from 'pagefind'

import {
    isNonEmptyArray,
    isNonEmptyString
} from '~/helpers/check-types.js'
import {
    getRouteType
} from '~/helpers/app-derived.js'
import {
    getAppCategory
} from '~/helpers/categories.js'
import {
    pagefindLanguage,
    pagefindOutputPath
} from '~/helpers/pagefind/config.js'

function getSearchListing ( sitemapEntry ) {
    return sitemapEntry.payload.app || sitemapEntry.payload.listing || sitemapEntry.payload.video || null
}

function pushContentPart ( parts, value ) {
    if ( !isNonEmptyString( value ) ) return

    parts.push( value.trim() )
}

function pushListContentPart ( parts, values ) {
    if ( !isNonEmptyArray( values ) ) return

    pushContentPart( parts, values.join(', ') )
}

function normalizeFilterValue ( value ) {
    if ( !isNonEmptyString( value ) ) return null

    return value.replaceAll('-', '_').trim()
}

export function shouldIndexSitemapEntry ( sitemapEntry ) {
    return getSearchListing( sitemapEntry ) !== null
}

export function makePagefindTitle ( sitemapEntry ) {
    const listing = getSearchListing( sitemapEntry )
    const routeType = getRouteType( sitemapEntry.route )

    let title = listing?.name || sitemapEntry.route

    if ( routeType === 'benchmarks' ) {
        title = `${ title } Benchmarks`
    }

    return title
}

export function makePagefindContent ( sitemapEntry ) {
    const listing = getSearchListing( sitemapEntry )
    const routeType = getRouteType( sitemapEntry.route )
    const parts = []

    pushContentPart( parts, makePagefindTitle( sitemapEntry ) )
    pushContentPart( parts, listing?.text )
    pushContentPart( parts, listing?.content )
    pushContentPart( parts, listing?.description )
    pushListContentPart( parts, listing?.aliases )
    pushListContentPart( parts, listing?.tags )
    pushListContentPart( parts, listing?.timestamps?.map( timestamp => timestamp.fullText ) )
    pushListContentPart( parts, listing?.appLinks?.map( appLink => appLink.name ) )
    pushContentPart( parts, listing?.category?.label )
    pushContentPart( parts, listing?.status )

    if ( routeType === 'benchmarks' ) {
        pushContentPart( parts, 'Benchmarks')
        pushContentPart( parts, 'Apple Silicon App Tested')
    }

    return parts.join('\n\n')
}

export function makePagefindFilters ( sitemapEntry ) {
    const listing = getSearchListing( sitemapEntry )
    const routeType = getRouteType( sitemapEntry.route )
    const filters = {
        type: [ normalizeFilterValue( routeType ) ]
    }

    const status = normalizeFilterValue( listing?.status )

    if ( status !== null ) {
        filters.status = [ status ]
    }

    if ( listing?.category?.slug ) {
        filters.category = [ getAppCategory( listing ).snakeSlug ]
    }

    return filters
}

export function mapSitemapEntryToPagefindRecord ( sitemapEntry ) {
    if ( !shouldIndexSitemapEntry( sitemapEntry ) ) return null

    const listing = getSearchListing( sitemapEntry )
    const routeType = getRouteType( sitemapEntry.route )
    const lastUpdatedTimestamp = String( listing?.lastUpdated?.timestamp || 0 )

    return {
        url: sitemapEntry.route,
        content: makePagefindContent( sitemapEntry ),
        language: pagefindLanguage,
        meta: {
            title: makePagefindTitle( sitemapEntry ),
            text: listing?.text || '',
            slug: listing?.slug || sitemapEntry.route,
            categorySlug: listing?.category?.slug || 'uncategorized',
            routeType,
            lastUpdatedTimestamp
        },
        filters: makePagefindFilters( sitemapEntry ),
        sort: {
            updated: lastUpdatedTimestamp
        }
    }
}

export async function writePagefindIndex ( sitemapEndpoints, {
    outputPath = pagefindOutputPath
} = {} ) {
    await fs.remove( outputPath )

    const {
        errors,
        index
    } = await pagefind.createIndex({
        forceLanguage: pagefindLanguage
    })

    if ( errors.length > 0 ) {
        throw new Error(`Pagefind createIndex errors: ${ errors.join(', ') }`)
    }

    if ( !index ) {
        throw new Error('Pagefind index was not created')
    }

    let recordCount = 0

    try {
        for ( const sitemapEntry of sitemapEndpoints ) {
            const record = mapSitemapEntryToPagefindRecord( sitemapEntry )

            if ( record === null ) continue

            const response = await index.addCustomRecord( record )

            if ( response.errors.length > 0 ) {
                throw new Error(`Pagefind addCustomRecord errors for ${ sitemapEntry.route }: ${ response.errors.join(', ') }`)
            }

            recordCount += 1
        }

        const writeResponse = await index.writeFiles({
            outputPath
        })

        if ( writeResponse.errors.length > 0 ) {
            throw new Error(`Pagefind writeFiles errors: ${ writeResponse.errors.join(', ') }`)
        }

        return {
            outputPath,
            recordCount
        }
    } finally {
        await index.deleteIndex().catch( () => null )
        await pagefind.close().catch( () => null )
    }
}
