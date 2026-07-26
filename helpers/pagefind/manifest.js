const searchableListingKeys = [
    'name',
    'text',
    'content',
    'description',
    'aliases',
    'tags',
    'timestamps',
    'appLinks',
    'category',
    'status',
    'slug',
    'endpoint',
    'lastUpdated'
]

const searchablePayloadKeys = [
    'app',
    'listing',
    'video'
]

function compactListing ( listing ) {
    if ( listing === null || typeof listing !== 'object' ) return null

    return Object.fromEntries(
        searchableListingKeys.flatMap( key => {
            if ( typeof listing[ key ] === 'undefined' ) return []

            return [[ key, listing[ key ] ]]
        } )
    )
}

export function makePagefindSitemapEntry ({
    route,
    payload
}) {
    const compactPayload = {}

    for ( const key of searchablePayloadKeys ) {
        const listing = compactListing( payload?.[ key ] )

        if ( listing !== null ) {
            compactPayload[ key ] = listing
            break
        }
    }

    return {
        route,
        payload: compactPayload
    }
}
