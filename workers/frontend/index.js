import { handle } from '@astrojs/cloudflare/handler'

const scannerPage = '/apple-silicon-app-test/'
const scanEndpoint = '/api/scan'
// The scanner shell resolves its browser assets and data relative to the page.
const scannerAsset = /^\/(?:pkg\/)?[a-z0-9_-]+\.(?:css|js|json|wasm)$/

function previewPage ( response, { status = response.status, noTransform = false } = {} ) {
    const preview = new Response( response.body, { headers: response.headers, status } )
    preview.headers.set( 'Cache-Control', noTransform ? 'no-store, no-transform' : 'no-store' )
    preview.headers.set( 'Cloudflare-CDN-Cache-Control', 'no-store' )
    preview.headers.set( 'X-Robots-Tag', 'noindex, nofollow' )
    preview.headers.delete( 'Age' )
    preview.headers.delete( 'CF-Cache-Status' )
    preview.headers.delete( 'ETag' )
    preview.headers.delete( 'Last-Modified' )
    return preview
}

function fetchScanner ( service, request, path ) {
    const url = new URL( request.url )
    if ( path !== scanEndpoint ) {
        url.pathname = path
        url.search = ''
    }

    // Retain the public origin, client address, and fetch metadata for the
    // scanner's same-origin, egress, and rate-limit checks.
    const headers = new Headers( request.headers )
    headers.delete( 'Authorization' )
    headers.delete( 'Cookie' )
    if ( path === '/' ) {
        headers.delete( 'If-Modified-Since' )
        headers.delete( 'If-None-Match' )
        headers.delete( 'Range' )
    }
    return service.fetch( new Request( url, { method: request.method, headers, redirect: 'manual' } ) )
}

async function scanResponse ( service, request ) {
    const response = await fetchScanner( service, request, scanEndpoint )
    if ( response.status !== 400 ) return previewPage( response )

    // The scanner rejects disallowed IP addresses before fetching them. Expose
    // that refusal as forbidden while retaining its JSON and other 400 errors.
    const failure = await response.clone().json().catch( () => null )
    const deniedAddress = failure?.error === 'Private and reserved addresses are blocked.'
    return previewPage( response, { status: deniedAddress ? 403 : response.status } )
}

function addVersionNotice ( response, version ) {
    const v3 = version === '3'
    const switchTo = v3 ? '1' : '3'
    const notice = `<aside class="scanner-version-notice" aria-label="Scanner version">
        <span>You are using scanner v${version}${v3 ? ' (preview)' : ''}.</span>
        <a href="?v=${switchTo}">Switch to v${switchTo}</a>
        <button type="button" aria-label="Dismiss scanner version notice" hidden>Dismiss</button>
    </aside>`
    const rewriter = new HTMLRewriter()
        .on( 'head', { element: element => element.append(
            '<link rel="stylesheet" href="/scanner-version.css"><script src="/scanner-version.js" defer></script>',
            { html: true }
        ) } )
        .on( v3 ? 'main' : '.app-main', { element: element => element.before( notice, { html: true } ) } )

    if ( v3 ) {
        rewriter.on( 'nav a[aria-current="page"]', { element: element => element.setAttribute( 'href', '?v=3' ) } )
    }

    // Keep the scanner's CSP and prevent the edge from injecting a beacon it blocks.
    return rewriter.transform( previewPage( response, { noTransform: v3 } ) )
}

function redirectPreview ( url ) {
    return previewPage( Response.redirect( url, 307 ) )
}

export default {
    async fetch ( request, env, context ) {
        const url = new URL( request.url )
        const { pathname, searchParams } = url
        const scanner = env.SCANNER_V3
        if ( !scanner ) return handle( request, env, context )

        if ( pathname === scanEndpoint ) {
            return scanResponse( scanner, request )
        }

        if ( request.method !== 'GET' && request.method !== 'HEAD' ) {
            return handle( request, env, context )
        }

        if ( pathname === scannerPage || pathname === scannerPage.slice( 0, -1 ) ) {
            const version = searchParams.get( 'v' )
            if ( version === '3' ) {
                if ( pathname !== scannerPage ) {
                    url.pathname = scannerPage
                    return redirectPreview( url )
                }

                const response = await fetchScanner( scanner, request, '/' )
                if ( !response.ok ) {
                    return previewPage( new Response( 'Scanner v3 is temporarily unavailable. Return to the scanner page with ?v=1.', {
                        status: 502,
                        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
                    } ) )
                }
                return request.method === 'HEAD'
                    ? previewPage( response, { noTransform: true } )
                    : addVersionNotice( response, version )
            }

            if ( version === '1' ) {
                if ( searchParams.has( 'version' ) ) {
                    searchParams.delete( 'version' )
                    return redirectPreview( url )
                }
                const response = await handle( request, env, context )
                if ( !response.ok ) return response
                return request.method === 'HEAD' ? previewPage( response ) : addVersionNotice( response, version )
            }
        }

        if ( pathname.startsWith( scannerPage ) ) {
            const asset = pathname.slice( scannerPage.length - 1 )
            if ( scannerAsset.test( asset ) ) return fetchScanner( scanner, request, asset )
        }

        return handle( request, env, context )
    }
}
