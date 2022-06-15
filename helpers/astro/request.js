import { getNetlifyRedirect } from '~/helpers/config-node.js'


const ONE_HOUR = 60 * 60
const ONE_SECOND = 1

function trimTrailingSlash ( url ) {
    return url.replace( /\/$/, '' )
}

// We use a set of top level list pages
// so that our list searching time is as fast as possible
const topLevelListPages = new Set([
    '', // Homepage
    '/games',
    '/devices',
    '/benchmarks',
    '/categories'
])

function getMaxAgeForUrl ( Astro ) {
    const requestUrl = new URL( Astro.request.url )
    const urlPath = trimTrailingSlash( requestUrl.pathname )

    // Top level list pages
    if ( topLevelListPages.has( urlPath ) ) {
        return ONE_HOUR
    }

    // Kind page
    if ( requestUrl.pathname.startsWith( '/kind/' ) ) {
        return ONE_HOUR
    }

    return ONE_SECOND
}

export async function applyResponseDefaults ( Astro ) {
    const maxAgeSeconds = getMaxAgeForUrl( Astro )

    // 'stale-while-revalidate' tells Cloudflare to cache the response for X seconds
    // but update the cache in the background
    // so the user always gets a fast and cached response.
    //
    // This also means our Astro SSR entry function on Netlify
    // only gets called from Cloudflare instead of the user's browser
    // so that our actual number of requests to Netlify are minimized.
    //
    // Cache-Control: s-maxage=1, stale-while-revalidate
    Astro.response.headers.set( 'Cache-Control', `s-maxage=${ maxAgeSeconds }, stale-while-revalidate` )
}


export async function catchRedirectResponse ( Astro ) {
    const requestUrl = new URL( Astro.request.url )

    const netlifyRedirectUrl = await getNetlifyRedirect( requestUrl.pathname )

    // console.log('netlifyRedirectUrl', netlifyRedirectUrl)

    if ( netlifyRedirectUrl !== null ) {
        return Astro.redirect( netlifyRedirectUrl.to )
    }

    return null
}


