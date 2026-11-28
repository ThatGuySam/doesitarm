// Data access for the Does It ARM MCP server.
//
// Everything comes from the existing public API (api.doesitarm.com), the same
// JSON the website is built from. Listing details are reduced to an explicit
// allowlist of fields a visitor sees when a page first loads. Raw scan data
// (Info.plist and Mach-O metadata) is never copied into MCP output; the public
// API itself now publishes only the fields in helpers/scan-allowlist.js.

export const SITE_URL = 'https://doesitarm.com'
export const DEFAULT_API_URL = 'https://api.doesitarm.com'

export const KINDS = [ 'app', 'game', 'homebrew', 'device' ]

const LIST_FILES = {
    app: '/app-list.json',
    game: '/game-list.json',
    homebrew: '/homebrew-list.json',
    device: '/device-list.json',
}

const KIND_BY_PATH = {
    app: 'app',
    game: 'game',
    formula: 'homebrew',
    device: 'device',
}

export const STATUS_LABELS = {
    'native': '✅ Native Apple Silicon support',
    'rosetta': '✳️ Runs through Rosetta 2',
    'no-in-progress': '⏹ Not yet supported, support in progress',
    'no': '🚫 Not supported',
    'unreported': '🔶 Not yet reported as native',
}

const MAX_VERSIONS_PER_BUNDLE = 10
const MAX_VIDEOS = 10

export function siteUrl ( endpoint = '/' ) {
    if ( typeof endpoint !== 'string' || endpoint.length === 0 ) return SITE_URL
    if ( /^https?:\/\//.test( endpoint ) ) return endpoint
    return `${ SITE_URL }${ endpoint.startsWith('/') ? '' : '/' }${ endpoint }`
}

export function kindFromEndpoint ( endpoint = '' ) {
    const first = String( endpoint ).split('/').filter( Boolean )[0]
    return KIND_BY_PATH[ first ] || null
}

// Turns "/app/spotify", "app/spotify" or "https://doesitarm.com/app/spotify/benchmarks"
// into "/app/spotify". Returns null for anything that is not a listing path.
export function endpointFromInput ( input = '' ) {
    let value = String( input ).trim()
    if ( value.length === 0 ) return null

    try {
        if ( /^https?:\/\//i.test( value ) ) {
            const url = new URL( value )
            if ( !/(^|\.)doesitarm\.com$/i.test( url.hostname ) ) return null
            value = url.pathname
        }
    } catch {
        return null
    }

    const parts = value.split(/[?#]/)[0].split('/').filter( Boolean )
    if ( parts.length < 2 ) return null
    if ( !KIND_BY_PATH[ parts[0] ] ) return null
    if ( !/^[a-z0-9][a-z0-9-_.]*$/i.test( parts[1] ) ) return null

    return `/${ parts[0] }/${ parts[1].toLowerCase() }`
}

function cleanString ( value ) {
    return typeof value === 'string' ? value.trim() : ''
}

function cleanLinks ( links ) {
    if ( !Array.isArray( links ) ) return []

    return links
        .filter( link => link && typeof link.href === 'string' )
        .map( link => ({
            label: cleanString( link.label ) || link.href,
            url: siteUrl( link.href ),
        }) )
}

function dateRaw ( lastUpdated ) {
    if ( !lastUpdated ) return null
    if ( typeof lastUpdated === 'string' ) return lastUpdated
    return cleanString( lastUpdated.raw ) || null
}

// Mirrors helpers/statuses.js getStatusOfScan( report, false )
function scanStatusText ( result = '' ) {
    return String( result ).trim().startsWith('✅')
        ? '✅ Yes, Native Apple Silicon Support'
        : '🔶 App has not yet been reported to be native to Apple Silicon'
}

// Mirrors helpers/bundles.js supportedArchitectures(). Published reports carry
// a plain `architectures` list of names (helpers/scan-allowlist.js). Older API
// builds still nest them under Mach-O metadata; only the derived names leave
// this function, never the metadata itself.
const ARCHITECTURE_NAMES = new Set([ 'arm64', 'arm64e', 'x86_64', 'x86_64h', 'i386' ])

function scanArchitectures ( report = {} ) {
    if ( Array.isArray( report?.architectures ) ) {
        return report.architectures.filter( name => ARCHITECTURE_NAMES.has( name ) )
    }

    const architectures = report?.['Macho Meta']?.architectures
    if ( !Array.isArray( architectures ) ) return []

    return architectures
        .map( architecture => architecture?.processorType )
        .filter( type => typeof type === 'string' && type.length > 0 && Number( type ) !== 0 )
}

function versionHistory ( bundles ) {
    if ( !Array.isArray( bundles ) ) return []

    return bundles
        .filter( entry => Array.isArray( entry ) && typeof entry[0] === 'string' )
        .map( ([ bundleId, versions = [] ]) => {
            const list = Array.isArray( versions ) ? versions : []

            return {
                bundleId,
                totalVersions: list.length,
                versions: list.slice( 0, MAX_VERSIONS_PER_BUNDLE ).map( ([ version, report ]) => ({
                    version: String( version ),
                    status: scanStatusText( report?.Result ),
                    architectures: scanArchitectures( report ),
                }) ),
            }
        })
}

// The same ten-version projection get_app returns, for one bundle ID: version
// strings and derived architecture names only. Scan dates and file names are
// left out, as everywhere else in MCP output.
export function scannedVersions ( raw, bundleId ) {
    const wanted = String( bundleId ).toLowerCase()
    const bundle = versionHistory( raw?.bundles ).find( entry => entry.bundleId.toLowerCase() === wanted )
    return bundle ? bundle.versions.map( ({ version, architectures }) => ({ version, architectures }) ) : []
}

function deviceSupport ( list ) {
    if ( !Array.isArray( list ) ) return []

    return list.map( device => ({
        device: cleanString( device.name ),
        result: cleanString( device.emoji ),
        summary: cleanString( device.ariaLabel ).replace( /\s+/g, ' ' ),
        url: siteUrl( device.endpoint ),
    }) )
}

function relatedVideos ( videos ) {
    if ( !Array.isArray( videos ) ) return []

    return videos.slice( 0, MAX_VIDEOS ).map( video => ({
        title: cleanString( video.name ),
        channel: cleanString( video?.channel?.name ),
        benchmark: Array.isArray( video.tags ) && video.tags.includes('benchmark'),
        published: dateRaw( video.lastUpdated ),
        url: siteUrl( video.endpoint ),
        youtubeUrl: video.id ? `https://www.youtube.com/watch?v=${ encodeURIComponent( video.id ) }` : null,
    }) )
}

const GAME_REPORT_FIELDS = {
    Playable: 'playable',
    Distribution: 'distribution',
    Environment: 'environment',
    API: 'graphicsApi',
    Resolution: 'resolution',
    FPS: 'fps',
    Settings: 'settings',
    Specs: 'specs',
    Notes: 'notes',
    Source: 'source',
}

function gameReports ( reports ) {
    if ( !Array.isArray( reports ) ) return []

    return reports.map( report => {
        const out = {}
        for ( const [ from, to ] of Object.entries( GAME_REPORT_FIELDS ) ) {
            const value = cleanString( report?.[ from ] ).replace( /\s+/g, ' ' )
            if ( value && value !== '?' ) out[ to ] = value
        }
        return out
    })
}

// A small summary row used by search, category lists and bulk checks.
export function summarizeListing ( item, kind = kindFromEndpoint( item?.endpoint ) ) {
    const summary = {
        name: cleanString( item.name ),
        kind,
        url: siteUrl( item.endpoint ),
    }

    if ( kind === 'device' ) {
        summary.description = cleanString( item.description )
        return summary
    }

    summary.status = item.status || null
    summary.statusText = cleanString( item.text )
    if ( item?.category?.label || item?.category?.slug ) {
        summary.category = cleanString( item.category.label ) || cleanString( item.category.slug )
    }
    const updated = dateRaw( item.lastUpdated )
    if ( updated ) summary.lastUpdated = updated

    return summary
}

// Full listing detail limited to what a visitor sees on page load.
export function sanitizeListing ( raw, categories = {} ) {
    const kind = kindFromEndpoint( raw?.endpoint )

    if ( kind === 'device' ) return sanitizeDevice( raw )

    const categorySlug = cleanString( raw?.category?.slug )
    const categoryLabel = cleanString( raw?.category?.label ) || cleanString( categories?.[ categorySlug ]?.label ) || categorySlug

    const listing = {
        name: cleanString( raw.name ),
        kind,
        url: siteUrl( raw.endpoint ),
        status: raw.status || null,
        statusText: cleanString( raw.text ),
        category: categorySlug ? { label: categoryLabel, slug: categorySlug, url: siteUrl( `/kind/${ categorySlug }` ) } : null,
        lastUpdated: dateRaw( raw.lastUpdated ),
        aliases: Array.isArray( raw.aliases ) ? raw.aliases.filter( alias => typeof alias === 'string' ) : [],
        links: cleanLinks( raw.relatedLinks ),
        deviceSupport: deviceSupport( raw.deviceSupport ),
        relatedVideos: relatedVideos( raw.relatedVideos ),
        relatedVideoCount: Array.isArray( raw.relatedVideos ) ? raw.relatedVideos.length : 0,
    }

    if ( kind === 'app' ) {
        listing.bundleIds = Array.isArray( raw.bundleIds ) ? raw.bundleIds.filter( id => typeof id === 'string' ) : []
        listing.versionHistory = versionHistory( raw.bundles )
    }

    if ( kind === 'game' ) {
        listing.reports = gameReports( raw.reports )
        listing.attribution = 'Includes data generously provided by Thomas Schranz via Apple Silicon Games.'
    }

    if ( kind === 'homebrew' ) {
        listing.installedVia = 'Homebrew'
    }

    return listing
}

export function sanitizeDevice ( raw ) {
    return {
        name: cleanString( raw.name ),
        shortName: cleanString( raw.shortName ),
        kind: 'device',
        url: siteUrl( raw.endpoint ),
        type: cleanString( raw.type ),
        chips: Array.isArray( raw.chips ) ? raw.chips : [],
        releaseYear: raw.releaseYear ?? null,
        announcedDate: cleanString( raw.announcedDate ) || null,
        availableDate: cleanString( raw.availableDate ) || null,
        appleSpecsUrl: cleanString( raw.productUrl ) || null,
        description: cleanString( raw.description ),
        intro: Array.isArray( raw.intro ) ? raw.intro.filter( line => typeof line === 'string' ) : [],
        facts: Array.isArray( raw.facts ) ? raw.facts.map( fact => ({ label: cleanString( fact.label ), value: cleanString( fact.value ) }) ) : [],
        comparison: raw.comparison ? {
            heading: cleanString( raw.comparison.heading ),
            body: cleanString( raw.comparison.body ),
            url: raw.comparison.href ? siteUrl( raw.comparison.href ) : null,
        } : null,
        decisionGuide: raw.decisionGuide ? {
            heading: cleanString( raw.decisionGuide.heading ),
            summary: cleanString( raw.decisionGuide.summary ),
            points: Array.isArray( raw.decisionGuide.points ) ? raw.decisionGuide.points.filter( point => typeof point === 'string' ) : [],
        } : null,
        buyerProfile: raw.buyerProfile ? {
            primaryReason: cleanString( raw.buyerProfile.primaryReason ),
            evidenceSummary: cleanString( raw.buyerProfile.evidenceSummary ),
            useCases: Array.isArray( raw.buyerProfile.useCases ) ? raw.buyerProfile.useCases.map( useCase => ({ label: cleanString( useCase.label ), description: cleanString( useCase.description ) }) ) : [],
        } : null,
        officialSources: Array.isArray( raw.officialSources ) ? raw.officialSources.map( source => ({ label: cleanString( source.label ), url: cleanString( source.url ) }) ) : [],
    }
}


// Fetches JSON from the public API with edge caching plus a short in-isolate
// memo so one MCP request does not refetch the same list twice.
export function createDataSource ({
    apiUrl = DEFAULT_API_URL,
    fetchImpl = ( ...args ) => fetch( ...args ),
    listTtlMs = 5 * 60 * 1000,
    edgeCacheTtl = 600,
} = {} ) {
    const memo = new Map()
    const base = apiUrl.replace( /\/$/, '' )

    async function getJson ( path, { memoize = true, allow404 = false } = {} ) {
        const cached = memo.get( path )
        if ( memoize && cached && cached.expires > Date.now() ) return cached.promise

        const promise = ( async () => {
            const response = await fetchImpl( `${ base }${ path }`, {
                headers: { 'Accept': 'application/json', 'User-Agent': 'doesitarm-mcp' },
                cf: { cacheTtl: edgeCacheTtl, cacheEverything: true },
            })
            if ( allow404 && response.status === 404 ) return null
            if ( !response.ok ) throw new Error( `Does It ARM API returned ${ response.status } for ${ path }` )
            return response.json()
        })()

        if ( memoize ) {
            memo.set( path, { promise, expires: Date.now() + listTtlMs } )
            promise.catch( () => memo.delete( path ) )
        }

        return promise
    }

    return {
        async list ( kind ) {
            const file = LIST_FILES[ kind ]
            if ( !file ) throw new Error( `Unknown kind ${ kind }` )
            const list = await getJson( file )
            return Array.isArray( list ) ? list : []
        },
        async categories () {
            return ( await getJson( '/api/kind/index.json' ) ) || {}
        },
        async summary () {
            return getJson( '/api/all-apps-summary.json' )
        },
        // Returns the raw detail JSON or null when the listing does not exist.
        async detail ( endpoint ) {
            return getJson( `/api${ endpoint }.json`, { memoize: false, allow404: true } )
        },
    }
}
