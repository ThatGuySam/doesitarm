import { appListingPath } from './subscription-interests.js'

const catalogUrl = 'https://api.doesitarm.com/app-list.json'
const catalogCachePath = '/__cache/rosetta-catalog-v1.json'
const catalogCacheSeconds = 300
const maximumBadRowShare = 0.02
const catalogStatuses = new Set( ['native', 'rosetta', 'no', 'no-in-progress', 'unreported'] )
export const rosettaSearchLength = 120
// Smaller first catalogs require silent approval before they can seed the notification baseline.
export const rosettaBaselineMinimum = 2800

const labels = {
    rosetta: 'At risk (Rosetta)',
    native: 'Native Apple silicon support reported',
    unsupported: 'Unsupported on Apple silicon',
    unknown: 'Compatibility unknown'
}

export class RosettaCatalogError extends Error {
    constructor ( badRows, totalRows ) {
        super( 'Invalid app catalog' )
        this.badRows = badRows
        this.totalRows = totalRows
    }
}

export function parseRosettaCatalog ( rows ) {
    if ( !Array.isArray( rows ) || !rows.length ) throw new RosettaCatalogError( 0, 0 )

    const apps = []
    const keys = new Set()
    const invalidAppKeys = new Set()
    let badRows = 0
    let unkeyedRows = 0

    for ( const row of rows ) {
        const endpoint = typeof row?.endpoint === 'string' ? row.endpoint.replace( /\/$/, '' ) : ''
        const key = appListingPath.exec( endpoint )?.[1]
        const name = typeof row?.name === 'string' ? row.name.trim().replace( /\s+/g, ' ' ) : ''

        if ( !key || !name || !catalogStatuses.has( row.status ) || keys.has( key ) ) {
            badRows++
            if ( key ) invalidAppKeys.add( key )
            else unkeyedRows++
            continue
        }

        keys.add( key )
        const { status, category, aliases, text } = row
        apps.push( {
            name,
            endpoint,
            status,
            aliases: Array.isArray( aliases ) ? aliases.filter( alias => typeof alias === 'string' ) : [],
            category: {
                slug: typeof category?.slug === 'string' && /^[a-z0-9-]+$/.test( category.slug )
                    ? category.slug : 'uncategorized',
                label: typeof category?.label === 'string' && category.label ? category.label : 'Uncategorized'
            },
            text: typeof text === 'string' ? text : ''
        } )
    }

    if ( !apps.length || badRows > Math.max( 1, Math.floor( rows.length * maximumBadRowShare ) ) ) {
        throw new RosettaCatalogError( badRows, rows.length )
    }

    return { apps, invalidAppKeys: [...invalidAppKeys], badRows, totalRows: rows.length, unkeyedRows }
}

export async function fetchRosettaCatalog ( fetchCatalog = fetch, { timeout = 3000 } = {} ) {
    const response = await fetchCatalog( catalogUrl, {
        cache: 'no-store',
        signal: AbortSignal.timeout( timeout )
    } )
    if ( !response.ok ) throw new Error( 'App catalog request failed' )

    return parseRosettaCatalog( await response.json() )
}

export async function loadRosettaCatalog ( fetchCatalog = fetch, {
    cache = globalThis.caches?.default,
    cacheOrigin = 'https://doesitarm.com'
} = {} ) {
    const cacheKey = new URL( catalogCachePath, cacheOrigin ).href

    if ( cache ) {
        try {
            const cached = await cache.match( cacheKey )
            if ( cached ) return await cached.json()
        } catch {
            // A cache read failure can still fall back to the origin.
        }
    }

    const catalog = await fetchRosettaCatalog( fetchCatalog )

    if ( cache ) {
        try {
            await cache.put( cacheKey, Response.json( catalog, {
                headers: { 'Cache-Control': `public, max-age=${catalogCacheSeconds}` }
            } ) )
        } catch {
            // The fetched catalog is still usable if the cache write fails.
        }
    }

    return catalog
}

export function rosettaStatus ( status ) {
    if ( status === 'rosetta' || status === 'native' ) return labels[status]
    if ( status === 'no' || status === 'no-in-progress' ) return labels.unsupported
    return labels.unknown
}

const byName = ( a, b ) => a.name.localeCompare( b.name, 'en' )

export function summarizeRosettaCatalog ( apps ) {
    const groups = new Map()
    let atRisk = 0
    let unknown = 0

    for ( const app of apps ) {
        if ( rosettaStatus( app.status ) === labels.unknown ) unknown++
        if ( app.status !== 'rosetta' ) continue
        atRisk++

        const { slug = 'uncategorized', label = 'Uncategorized' } = app.category || {}
        if ( !groups.has( slug ) ) groups.set( slug, { slug, name: label, apps: [] } )
        groups.get( slug ).apps.push( app )
    }

    const categories = [...groups.values()].sort( byName )
    categories.forEach( group => group.apps.sort( byName ) )
    return { categories, atRisk, unknown }
}

function normalizeName ( name ) {
    return name.normalize( 'NFKC' ).toLowerCase().trim().replace( /\s+/g, ' ' )
}

export function getRosettaSearchQuery ( rawQuery ) {
    return ( rawQuery || '' ).trim().slice( 0, rosettaSearchLength )
}

export function findRosettaApps ( apps, query ) {
    const needle = normalizeName( query )
    if ( !needle ) return { apps: [], count: 0 }

    const exact = []
    const prefix = []
    const partial = []
    for ( const app of apps ) {
        const name = normalizeName( app.name )
        const aliases = Array.isArray( app.aliases )
            ? app.aliases.filter( alias => typeof alias === 'string' ).map( normalizeName )
            : []

        if ( name === needle || aliases.includes( needle ) ) {
            exact.push( { app, byAlias: name !== needle } )
        } else if ( needle.length > 1 ) {
            const names = [name, ...aliases]
            if ( names.some( candidate => candidate.startsWith( needle ) ) ) {
                prefix.push( app )
            } else if ( names.some( candidate => candidate.includes( needle ) ) ) {
                partial.push( app )
            }
        }
    }

    const matches = exact.length
        ? exact.sort( ( a, b ) => Number( a.byAlias ) - Number( b.byAlias ) || byName( a.app, b.app ) ).map( match => match.app )
        : [...prefix.sort( byName ), ...partial.sort( byName )]

    return { apps: matches.slice( 0, 8 ), count: matches.length }
}
