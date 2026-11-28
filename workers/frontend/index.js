import { handle } from '@astrojs/cloudflare/handler'
import { cookieRegionPath, requiresCookieConsent } from '../../helpers/cookie-consent.js'

const scannerPage = '/apple-silicon-app-test'
const scannerApi = new Set([ '/api/scan', '/api/resolve', '/api/scan-download' ])
// The scanner shell resolves its assets and data relative to the page.
const scannerAsset = /^\/(?:pkg\/)?[a-z0-9_-]+\.(?:css|js|json|wasm)$/

function uncached ( response, policy = 'no-store' ) {
    const result = new Response( response.body, { status: response.status, headers: response.headers } )
    result.headers.set( 'Cache-Control', policy )
    result.headers.set( 'Cloudflare-CDN-Cache-Control', 'no-store' )
    result.headers.set( 'X-Robots-Tag', 'noindex, nofollow' )
    result.headers.delete( 'Age' )
    result.headers.delete( 'CF-Cache-Status' )
    return result
}

function redirectPreview ( url ) {
    return uncached( new Response( null, {
        status: 307,
        headers: { Location: `${ url.pathname }${ url.search }` }
    } ) )
}

function plainHeaders ( source ) {
    const headers = new Headers( source )
    for ( const name of [ 'If-Modified-Since', 'If-None-Match', 'Range', 'Authorization' ] ) headers.delete( name )
    return headers
}

function fetchScanner ( scanner, request, url, assetPath ) {
    if ( assetPath ) {
        url.pathname = assetPath
        url.search = ''
    }

    // Forward the public hostname, browser fetch metadata, and client IP.
    const headers = new Headers( request.headers )
    headers.delete( 'Authorization' )
    headers.delete( 'Cookie' )
    if ( assetPath === '/' || assetPath === '/scanner-fragment' ) {
        headers.delete( 'If-Modified-Since' )
        headers.delete( 'If-None-Match' )
        headers.delete( 'Range' )
    }

    return scanner.fetch( new Request( url, {
        method: request.method,
        headers,
        body: request.body,
        redirect: 'manual'
    } ) )
}

const scannerAssets = `<link rel="stylesheet" href="${ scannerPage }/style.css"><link rel="stylesheet" href="${ scannerPage }/bigfolder.css">
    <script type="module" src="${ scannerPage }/app.js"></script>`

// Mount the scanner inside the site's own rendered page: the layout's head, navbar,
// footer and analytics stay as the default page renders them.
function mountScanner ( page, fragment ) {
    const switcher = `<p class="scanner-switch"><span>Scanner v3 (preview)</span> · <a href="?v=1">Switch to v1</a></p>`
    let mounted = false

    return new HTMLRewriter()
        .on( 'head', { element: element => element.append(
            `<meta name="robots" content="noindex">${ scannerAssets }`,
            { html: true }
        ) } )
        .on( 'link[rel="canonical"]', { element: element => element.setAttribute( 'href', `https://doesitarm.com${ scannerPage }` ) } )
        .on( 'nav a[aria-current="page"]', { element: element => element.setAttribute( 'href', '?v=3' ) } )
        .on( 'div.app-main', { element: element => {
            if ( mounted ) return
            mounted = true
            element.setInnerContent( fragment
                .replace( '<div class="dia-scanner"', '<div class="dia-scanner" data-embedded' )
                .replace( '<!--scanner-switch-->', switcher ), { html: true } )
        } } )
        .transform( page )
}

export default {
    async fetch ( request, env, context ) {
        const url = new URL( request.url )
        const { pathname, searchParams } = url
        // Keep the visitor-specific flag out of shared HTML caches.
        if ( request.method === 'GET' && pathname === cookieRegionPath ) {
            return uncached( Response.json( { consentRequired: requiresCookieConsent( request.cf ) } ) )
        }

        const scanner = env.SCANNER_V3
        if ( !scanner ) return handle( request, env, context )

        if ( scannerApi.has( pathname ) ) {
            return uncached( await fetchScanner( scanner, request, url ) )
        }

        if ( request.method !== 'GET' && request.method !== 'HEAD' ) {
            return handle( request, env, context )
        }

        if ( pathname === scannerPage || pathname === `${ scannerPage }/` ) {
            const version = searchParams.get( 'v' )
            if ( version === '3' && searchParams.get( 'scanner' ) !== 'next' ) {
                if ( pathname === scannerPage ) {
                    url.pathname = `${ scannerPage }/`
                    return redirectPreview( url )
                }

                const [ upstream, page ] = await Promise.all( [
                    fetchScanner( scanner, request, new URL( url ), '/scanner-fragment' ),
                    handle( new Request( new URL( scannerPage, url ), {
                        method: 'GET',
                        headers: plainHeaders( request.headers )
                    } ), env, context )
                ] )
                if ( !upstream.ok || !page.ok ) {
                    return uncached( new Response( 'Scanner v3 is temporarily unavailable. Return to the scanner page with ?v=1.', {
                        status: 502,
                        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
                    } ) )
                }
                const response = uncached( page, 'no-store, no-transform' )
                response.headers.delete( 'ETag' )
                response.headers.delete( 'Last-Modified' )
                response.headers.delete( 'Content-Length' )
                return request.method === 'HEAD' ? response : mountScanner( response, await upstream.text() )
            }

            if ( version === '1' && searchParams.has( 'version' ) ) {
                searchParams.delete( 'version' )
                return redirectPreview( url )
            }
        }

        if ( pathname.startsWith( `${ scannerPage }/` ) ) {
            const asset = pathname.slice( scannerPage.length )
            if ( scannerAsset.test( asset ) ) return fetchScanner( scanner, request, url, asset )
        }

        return handle( request, env, context )
    }
}
