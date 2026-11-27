// Tool handlers for the Does It ARM MCP server. Each handler takes plain
// arguments plus a data source and returns { text, data }. They have no MCP
// SDK dependency so they can be unit tested with fixture data.

import {
    KINDS,
    STATUS_LABELS,
    endpointFromInput,
    kindFromEndpoint,
    sanitizeListing,
    siteUrl,
    summarizeListing,
} from './data.js'

export const MAX_CHECK_NAMES = 50
const MATCH_THRESHOLD = 60

export function normalize ( value = '' ) {
    return String( value )
        .normalize('NFKD')
        .replace( /[\u0300-\u036f]/g, '' )
        .toLowerCase()
        .replace( /&/g, ' and ' )
        .replace( /[^a-z0-9]+/g, ' ' )
        .trim()
}

function compact ( value ) {
    return normalize( value ).replace( / /g, '' )
}

function slugOf ( item ) {
    return String( item.endpoint || '' ).split('/').filter( Boolean )[1] || ''
}

// Scores how well a listing matches a query. 0 means no match.
export function scoreListing ( item, query ) {
    const q = normalize( query )
    if ( !q ) return 0
    const qCompact = q.replace( / /g, '' )
    const qTokens = q.split(' ')

    const names = [ item.name, ...( Array.isArray( item.aliases ) ? item.aliases : [] ) ]
        .filter( name => typeof name === 'string' && name.length > 0 )

    let best = 0
    names.forEach( ( name, index ) => {
        const n = normalize( name )
        const nCompact = n.replace( / /g, '' )
        const aliasPenalty = index === 0 ? 0 : 2
        let score = 0

        if ( n === q || nCompact === qCompact ) score = 100
        else if ( n.startsWith( q + ' ' ) || n.startsWith( q ) ) score = 80 - Math.min( 10, n.length - q.length ) / 2
        else if ( qTokens.every( token => n.split(' ').includes( token ) ) ) score = 70 - Math.min( 10, n.length - q.length ) / 2
        else if ( nCompact.includes( qCompact ) && qCompact.length >= 3 ) score = 55
        else if ( qTokens.every( token => n.includes( token ) ) && q.length >= 3 ) score = 50

        best = Math.max( best, score - aliasPenalty )
    })

    if ( compact( slugOf( item ) ) === qCompact ) best = Math.max( best, 95 )

    if ( Array.isArray( item.bundleIds ) ) {
        const raw = String( query ).trim().toLowerCase()
        if ( item.bundleIds.some( id => typeof id === 'string' && id.toLowerCase() === raw ) ) best = Math.max( best, 98 )
    }

    return best
}

function kindsFor ( kind = 'all' ) {
    if ( kind === 'all' || !kind ) return [ 'app', 'game', 'homebrew' ]
    return [ kind ]
}

async function loadKinds ( data, kinds ) {
    const lists = await Promise.all( kinds.map( kind => data.list( kind ) ) )
    return kinds.flatMap( ( kind, index ) => lists[ index ].map( item => ({ item, kind }) ) )
}

const KIND_ORDER = { app: 0, game: 1, homebrew: 2, device: 3 }

function rank ( entries, query ) {
    return entries
        .map( entry => ({ ...entry, score: scoreListing( entry.item, query ) }) )
        .filter( entry => entry.score > 0 )
        .sort( ( a, b ) => ( b.score - a.score ) || ( KIND_ORDER[ a.kind ] - KIND_ORDER[ b.kind ] ) || ( a.item.name.length - b.item.name.length ) )
}

function line ( summary ) {
    const parts = [ `**${ summary.name }**` ]
    if ( summary.kind !== 'app' ) parts.push( `(${ summary.kind })` )
    if ( summary.statusText ) parts.push( `— ${ summary.statusText }` )
    if ( summary.description ) parts.push( `— ${ summary.description }` )
    if ( summary.category && summary.kind === 'app' ) parts.push( `· ${ summary.category }` )
    parts.push( `· ${ summary.url }` )
    return `- ${ parts.join(' ') }`
}

const ATTRIBUTION = 'Source: Does It ARM (https://doesitarm.com). Link to the listing URL when you cite a result.'


export async function searchApps ( { query, kind = 'all', status, limit = 10 }, data ) {
    const entries = await loadKinds( data, kindsFor( kind ) )
    let ranked = rank( entries, query )
    if ( status ) ranked = ranked.filter( entry => entry.item.status === status )

    const results = ranked.slice( 0, limit ).map( entry => summarizeListing( entry.item, entry.kind ) )

    if ( results.length === 0 ) {
        return {
            text: `No Does It ARM listings match "${ query }". Try a shorter name, or check https://doesitarm.com/?search=${ encodeURIComponent( query ) }. Unlisted apps can be requested at https://github.com/ThatGuySam/doesitarm/issues.`,
            data: { query, total: 0, results: [] },
        }
    }

    return {
        text: [
            `${ ranked.length } match${ ranked.length === 1 ? '' : 'es' } for "${ query }"${ ranked.length > results.length ? ` (showing ${ results.length })` : '' }:`,
            ...results.map( line ),
            '',
            ATTRIBUTION,
        ].join('\n'),
        data: { query, total: ranked.length, results },
    }
}


async function resolveListing ( input, kind, data ) {
    const endpoint = endpointFromInput( input )
    if ( endpoint ) return { endpoint, kind: kindFromEndpoint( endpoint ) }

    const kinds = kind && kind !== 'all' ? [ kind ] : [ 'app', 'game', 'homebrew', 'device' ]
    const ranked = rank( await loadKinds( data, kinds ), input )
    if ( ranked.length === 0 || ranked[0].score < MATCH_THRESHOLD ) {
        return { endpoint: null, suggestions: ranked.slice( 0, 5 ).map( entry => summarizeListing( entry.item, entry.kind ) ) }
    }

    return { endpoint: ranked[0].item.endpoint, kind: ranked[0].kind, fallback: ranked[0].item }
}

function renderListing ( listing ) {
    if ( listing.kind === 'device' ) return renderDevice( listing )

    const out = [
        `# ${ listing.name }${ listing.kind === 'homebrew' ? ' (Homebrew formula)' : listing.kind === 'game' ? ' (game)' : '' }`,
        listing.statusText || STATUS_LABELS[ listing.status ] || '',
        `Page: ${ listing.url }`,
    ]

    if ( listing.category ) out.push( `Category: ${ listing.category.label } (${ listing.category.url })` )
    if ( listing.lastUpdated ) out.push( `Updated: ${ listing.lastUpdated }` )
    if ( listing.aliases?.length > 1 ) out.push( `Also known as: ${ listing.aliases.join(', ') }` )
    if ( listing.links.length ) {
        out.push( '', 'Links:' )
        listing.links.forEach( link => out.push( `- ${ link.label }: ${ link.url }` ) )
    }
    if ( listing.deviceSupport.length ) {
        out.push( '', 'Device support:' )
        listing.deviceSupport.forEach( device => out.push( `- ${ device.result } ${ device.device } (${ device.url })` ) )
    }
    if ( listing.reports?.length ) {
        out.push( '', 'Reports:' )
        listing.reports.forEach( report => out.push( `- ${ Object.entries( report ).map( ([ key, value ]) => `${ key }: ${ value }` ).join('; ') }` ) )
        out.push( listing.attribution )
    }
    if ( listing.versionHistory?.length ) {
        out.push( '', 'Bundle version history (newest first):' )
        listing.versionHistory.forEach( bundle => {
            out.push( `- ${ bundle.bundleId } (${ bundle.totalVersions } scanned version${ bundle.totalVersions === 1 ? '' : 's' })` )
            bundle.versions.forEach( version => out.push( `  - v${ version.version }: ${ version.status }${ version.architectures.length ? ` [${ version.architectures.join(', ') }]` : '' }` ) )
        })
    }
    if ( listing.relatedVideos.length ) {
        out.push( '', `Related videos (${ listing.relatedVideos.length } of ${ listing.relatedVideoCount }):` )
        listing.relatedVideos.forEach( video => out.push( `- ${ video.benchmark ? '[Benchmark] ' : '' }${ video.title }${ video.channel ? ` — ${ video.channel }` : '' } (${ video.url })` ) )
    }

    out.push( '', ATTRIBUTION )
    return out.filter( value => value !== null ).join('\n')
}

function renderDevice ( device ) {
    const out = [
        `# ${ device.name }`,
        device.description,
        `Page: ${ device.url }`,
    ]
    if ( device.chips.length ) out.push( `Chip: ${ device.chips.join(', ') }` )
    if ( device.availableDate ) out.push( `Available: ${ device.availableDate }` )
    if ( device.appleSpecsUrl ) out.push( `Apple specs: ${ device.appleSpecsUrl }` )
    if ( device.intro.length ) out.push( '', ...device.intro )
    if ( device.facts.length ) {
        out.push( '', 'Specifications:' )
        device.facts.forEach( fact => out.push( `- ${ fact.label }: ${ fact.value }` ) )
    }
    if ( device.comparison ) out.push( '', `${ device.comparison.heading }: ${ device.comparison.body }${ device.comparison.url ? ` (${ device.comparison.url })` : '' }` )
    if ( device.decisionGuide ) {
        out.push( '', `${ device.decisionGuide.heading }: ${ device.decisionGuide.summary }` )
        device.decisionGuide.points.forEach( point => out.push( `- ${ point }` ) )
    }
    if ( device.buyerProfile ) {
        out.push( '', `Why people choose it: ${ device.buyerProfile.primaryReason }` )
        device.buyerProfile.useCases.forEach( useCase => out.push( `- ${ useCase.label }: ${ useCase.description }` ) )
    }
    out.push( '', ATTRIBUTION )
    return out.join('\n')
}

export async function getApp ( { app, kind = 'all' }, data ) {
    const resolved = await resolveListing( app, kind, data )

    if ( !resolved.endpoint ) {
        const suggestions = resolved.suggestions || []
        return {
            text: [
                `"${ app }" is not listed on Does It ARM.`,
                ...( suggestions.length ? [ 'Closest listings:', ...suggestions.map( line ) ] : [] ),
                'Unlisted apps can be requested at https://github.com/ThatGuySam/doesitarm/issues.',
            ].join('\n'),
            data: { found: false, query: app, suggestions },
        }
    }

    const [ raw, categories ] = await Promise.all([
        data.detail( resolved.endpoint ),
        data.categories().catch( () => ({}) ),
    ])

    const source = raw || resolved.fallback
    if ( !source ) {
        return {
            text: `No Does It ARM listing exists at ${ siteUrl( resolved.endpoint ) }.`,
            data: { found: false, query: app },
        }
    }

    const listing = sanitizeListing( { ...source, endpoint: source.endpoint || resolved.endpoint }, categories )
    return { text: renderListing( listing ), data: { found: true, listing } }
}


export async function checkApps ( { names, kind = 'all' }, data ) {
    const unique = [ ...new Set( names.map( name => String( name ).trim() ).filter( Boolean ) ) ].slice( 0, MAX_CHECK_NAMES )
    const entries = await loadKinds( data, kindsFor( kind ) )

    const results = unique.map( name => {
        const ranked = rank( entries, name )
        const top = ranked[0]
        if ( !top || top.score < MATCH_THRESHOLD ) {
            return { query: name, found: false, closest: ranked.slice( 0, 2 ).map( entry => entry.item.name ) }
        }
        return { query: name, found: true, ...summarizeListing( top.item, top.kind ) }
    })

    const counts = results.reduce( ( acc, result ) => {
        const key = result.found ? result.status : 'not-listed'
        acc[ key ] = ( acc[ key ] || 0 ) + 1
        return acc
    }, {} )

    const text = [
        `Checked ${ results.length } name${ results.length === 1 ? '' : 's' }: ${ Object.entries( counts ).map( ([ key, count ]) => `${ count } ${ key }` ).join(', ') }.`,
        ...results.map( result => result.found
            ? `- ${ result.query } → ${ result.name === result.query ? '' : `${ result.name }: ` }${ result.statusText } · ${ result.url }`
            : `- ${ result.query } → not listed${ result.closest.length ? ` (closest: ${ result.closest.join(', ') })` : '' }` ),
        '',
        ATTRIBUTION,
    ].join('\n')

    return { text, data: { counts, results } }
}


export async function listCategories ( _args, data ) {
    const [ categories, summary, apps, games, homebrew ] = await Promise.all([
        data.categories(),
        data.summary().catch( () => null ),
        data.list('app'),
        data.list('game'),
        data.list('homebrew'),
    ])

    const counts = {}
    for ( const item of apps ) {
        const slug = item?.category?.slug || 'uncategorized'
        counts[ slug ] = ( counts[ slug ] || 0 ) + 1
    }
    counts.games = games.length
    counts.homebrew = homebrew.length

    const list = Object.values( categories ).map( category => ({
        slug: category.slug,
        label: category.label,
        count: counts[ category.slug ] || 0,
        url: siteUrl( `/kind/${ category.slug }` ),
    }) )

    const text = [
        summary ? `Does It ARM tracks ${ summary.total } apps and tools: ${ summary.nativePercent }% native, ${ summary.rosettaPercent }% Rosetta, ${ summary.unsupportedPercent }% unsupported, ${ summary.unreportedPercent }% not yet reported.` : '',
        'Categories (use the slug with list_by_category):',
        ...list.map( category => `- ${ category.label } — slug \`${ category.slug }\`, ${ category.count } listings · ${ category.url }` ),
        '',
        ATTRIBUTION,
    ].filter( Boolean ).join('\n')

    return { text, data: { summary, categories: list } }
}


export async function listByCategory ( { category, status, limit = 25, offset = 0 }, data ) {
    const slug = String( category ).trim().toLowerCase().replace( /[^a-z0-9]+/g, '-' ).replace( /^-|-$/g, '' )
    const categories = await data.categories()
    const known = categories[ slug ] || Object.values( categories ).find( entry => normalize( entry.label ) === normalize( category ) )

    if ( !known ) {
        return {
            text: `Unknown category "${ category }". Valid slugs: ${ Object.keys( categories ).join(', ') }.`,
            data: { found: false, category },
        }
    }

    let items
    if ( known.slug === 'games' ) items = ( await data.list('game') ).map( item => ({ item, kind: 'game' }) )
    else if ( known.slug === 'homebrew' ) items = ( await data.list('homebrew') ).map( item => ({ item, kind: 'homebrew' }) )
    else items = ( await data.list('app') ).filter( item => ( item?.category?.slug || 'uncategorized' ) === known.slug ).map( item => ({ item, kind: 'app' }) )

    if ( status ) items = items.filter( entry => entry.item.status === status )

    const page = items.slice( offset, offset + limit ).map( entry => summarizeListing( entry.item, entry.kind ) )
    const nextOffset = offset + page.length < items.length ? offset + page.length : null

    const text = [
        `${ known.label }${ status ? ` (${ status })` : '' }: ${ items.length } listings, showing ${ page.length ? `${ offset + 1 }–${ offset + page.length }` : 'none' }. Page: ${ siteUrl( `/kind/${ known.slug }` ) }`,
        ...page.map( line ),
        ...( nextOffset !== null ? [ `More: call again with offset ${ nextOffset }.` ] : [] ),
        '',
        ATTRIBUTION,
    ].join('\n')

    return { text, data: { category: known.slug, label: known.label, total: items.length, offset, nextOffset, results: page } }
}


export async function recentUpdates ( { limit = 20 }, data ) {
    const apps = await data.list('app')
    const recent = apps
        .filter( item => item?.lastUpdated?.timestamp || item?.lastUpdated?.raw )
        .sort( ( a, b ) => ( b.lastUpdated.timestamp || Date.parse( b.lastUpdated.raw ) ) - ( a.lastUpdated.timestamp || Date.parse( a.lastUpdated.raw ) ) )
        .slice( 0, limit )
        .map( item => summarizeListing( item, 'app' ) )

    const text = [
        `${ recent.length } most recently updated app listings:`,
        ...recent.map( item => `- ${ item.lastUpdated.slice( 0, 10 ) } **${ item.name }** — ${ item.statusText } · ${ item.url }` ),
        '',
        ATTRIBUTION,
    ].join('\n')

    return { text, data: { results: recent } }
}


export async function listDevices ( _args, data ) {
    const devices = ( await data.list('device') ).filter( device => device.listed !== false )
    const results = devices.map( device => ({
        ...summarizeListing( device, 'device' ),
        slug: device.slug,
        chips: device.chips || [],
        availableDate: device.availableDate || null,
    }) )

    return {
        text: [
            'Apple silicon Macs with device pages on Does It ARM (use get_app with the URL or name for details):',
            ...results.map( device => `- **${ device.name }** (${ device.chips.join(', ') }) · ${ device.url }` ),
            '',
            ATTRIBUTION,
        ].join('\n'),
        data: { results },
    }
}

export const TOOL_KINDS = KINDS
