const defaultListSize = 12

function isAppListing ( value ) {
    return value !== null
        && typeof value === 'object'
        && typeof value.slug === 'string'
        && typeof value.endpoint === 'string'
        && value.endpoint.startsWith( '/app/' )
}

function withoutHeavyListingFields ( listing ) {
    return {
        ...listing,
        bundles: undefined,
        relatedVideos: undefined
    }
}

function getListingTimestamp ( listing ) {
    const timestamp = Number( listing?.lastUpdated?.timestamp )

    return Number.isFinite( timestamp ) ? timestamp : 0
}

function sortNewestFirst ( left, right ) {
    const timestampDifference = getListingTimestamp( right ) - getListingTimestamp( left )

    if ( timestampDifference !== 0 ) return timestampDifference

    return left.name.localeCompare( right.name )
}

function addUniqueListing ( target, seenSlugs, listing ) {
    if ( !isAppListing( listing ) || seenSlugs.has( listing.slug ) ) return false

    target.push( withoutHeavyListingFields( listing ) )
    seenSlugs.add( listing.slug )

    return true
}

function getRotatingCategoryMatches ({
    device,
    categoryPages,
    excludedSlugs
}) {
    return device.buyerProfile.appCategories.flatMap( category => {
        const page = categoryPages[ category.slug ]
        const items = Array.isArray( page?.items ) ? page.items : []
        const candidates = items
            .filter( listing => {
                return isAppListing( listing )
                    && listing.category?.slug === category.slug
                    && !excludedSlugs.has( listing.slug )
            })
            .sort( sortNewestFirst )
        const supportedCandidates = candidates.filter( listing => {
            return ![
                'unreported',
                'no'
            ].includes( listing.status )
        } )
        const rotationCandidates = supportedCandidates.length > 0
            ? supportedCandidates
            : candidates
        const rotationOffset = Number.isInteger( category.rotationOffset )
            ? category.rotationOffset
            : 0
        const rotatedMatch = rotationCandidates.length > 0
            ? rotationCandidates[ rotationOffset % rotationCandidates.length ]
            : null

        return rotatedMatch ? [ rotatedMatch ] : []
    } )
}

export function makeCuratedDeviceAppPage ({
    device,
    featuredListings = [],
    categoryPages = {},
    listSize = defaultListSize
}) {
    const featuredBySlug = new Map(
        featuredListings
            .filter( isAppListing )
            .map( listing => [ listing.slug, listing ] )
    )
    const stableListings = device.buyerProfile.featuredAppSlugs
        .flatMap( slug => {
            const listing = featuredBySlug.get( slug )

            return listing ? [ listing ] : []
        } )
    const stableSlugs = new Set( stableListings.map( listing => listing.slug ) )
    const rotatingListings = getRotatingCategoryMatches({
        device,
        categoryPages,
        excludedSlugs: stableSlugs
    })
    const items = []
    const seenSlugs = new Set()
    let rotatingIndex = 0

    for ( const [ stableIndex, listing ] of stableListings.entries() ) {
        addUniqueListing( items, seenSlugs, listing )

        const shouldAddRotatingListing = ( stableIndex + 1 ) % 2 === 0

        if ( shouldAddRotatingListing && rotatingIndex < rotatingListings.length ) {
            addUniqueListing(
                items,
                seenSlugs,
                rotatingListings[ rotatingIndex ]
            )
            rotatingIndex += 1
        }
    }

    while ( rotatingIndex < rotatingListings.length ) {
        addUniqueListing( items, seenSlugs, rotatingListings[ rotatingIndex ] )
        rotatingIndex += 1
    }

    if ( items.length < listSize ) {
        const remainingCategoryListings = device.buyerProfile.appCategories
            .flatMap( category => categoryPages[ category.slug ]?.items || [] )
            .filter( isAppListing )
            .sort( sortNewestFirst )

        for ( const listing of remainingCategoryListings ) {
            addUniqueListing( items, seenSlugs, listing )

            if ( items.length >= listSize ) break
        }
    }

    return {
        items: items.slice( 0, listSize ),
        summary: null,
        previousPage: '',
        nextPage: ''
    }
}

async function settleRequests ( requestMap ) {
    const entries = Object.entries( requestMap )
    const settled = await Promise.allSettled(
        entries.map( ( [ , request ] ) => request )
    )

    return Object.fromEntries(
        settled.flatMap( ( result, index ) => {
            if ( result.status !== 'fulfilled' ) return []

            return [[ entries[ index ][ 0 ], result.value ]]
        } )
    )
}

export async function getCuratedDeviceAppPage ( device ) {
    const {
        DoesItAPI
    } = await import( './api/client.js' )
    const profile = device.buyerProfile
    const featuredRequests = Object.fromEntries(
        profile.featuredAppSlugs.map( slug => [
            slug,
            DoesItAPI.app( slug ).get()
        ] )
    )
    const categoryRequests = Object.fromEntries(
        profile.appCategories.map( category => [
            category.slug,
            DoesItAPI.kind( category.slug )( 1 ).get()
        ] )
    )
    const [
        featuredBySlug,
        categoryPages
    ] = await Promise.all([
        settleRequests( featuredRequests ),
        settleRequests( categoryRequests )
    ])

    return makeCuratedDeviceAppPage({
        device,
        featuredListings: profile.featuredAppSlugs.flatMap( slug => {
            const listing = featuredBySlug[ slug ]

            return listing ? [ listing ] : []
        } ),
        categoryPages
    })
}
