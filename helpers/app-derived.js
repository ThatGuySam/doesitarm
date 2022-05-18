// App Data that is derived from other app data

import {
    categories,
    categoryTemplate
} from '~/helpers/categories.js'

export function isDevice ( listing ) {
    if ( !listing.hasOwnProperty('endpoint') ) return false

    return listing.endpoint.startsWith('/device/')
}

export function isVideo ( app ) {
    return app.hasOwnProperty('thumbnail') && app.hasOwnProperty('timestamps')
}

export function getAppType ( app ) {

    // Videos don't have a category
    // so we check for videos here
    if ( isVideo( app ) ) {
        return 'video'
    }

    if ( isDevice( app ) ) {
        return 'device'
    }

    if(app.category !== Object(app.category)) {
        console.warn('app has no categories', app)

        return null
    }

    if (app.category.slug === 'homebrew') return 'formula'

    if (app.category.slug === 'games') return 'game'

    return 'app'
}

export function getAppEndpoint ( app ) {
    // console.log('app', app)

    if(app.category !== Object(app.category)) {
        console.warn('app has no categories', app)
    }

    const appType = getAppType( app )

    // if (app.category.slug === 'homebrew') return `/formula/${app.slug}`

    // if (app.category.slug === 'games') return `/game/${app.slug}`

    return `/${appType}/${app.slug}`
}

export function getVideoEndpoint ( video ) {

    return `/tv/${video.slug}`
}

export function getRouteType ( routeString ) {
    // Catch non-string routes
    if ( typeof routeString !== 'string' ) {
        console.warn( 'routeString is not a string', routeString )
        throw new Error('Route is not a string')
    }

    // Remove first slash and split by remaining
    // slashes to get first part of route
    const [ routeType, , subType = null ] = routeString.substring(1).split('/')

    if ( subType === 'benchmarks' ) return 'benchmarks'

    return routeType
}

export function getIconForListing ( listing ) {
    const routeType = getRouteType( listing.endpoint )

    if ( routeType === 'tv' || routeType === 'benchmarks' ) return '▶️'

    if ( routeType === 'device' ) return '🖥'

    if ( routeType === 'formula' ) return categories.homebrew.icon

    if ( routeType === 'game' ) return categories.games.icon

    // Just use default icon
    return categoryTemplate.icon
}
