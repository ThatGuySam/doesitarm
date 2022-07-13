// Esbuild Setup - https://github.com/cloudflare/miniflare/blob/dc55621c0767e462b05635f8dd6ba79f4f9445f7/docs/src/content/developing/esbuild.md#-developing-with-esbuild
// Miniflare Documentation - https://miniflare.dev/
import { gaMeasurementId } from '../../../helpers/constants.js'


// const GTM_URL = `https://www.googletagmanager.com/gtm.js?id=${ gaMeasurementId }`;
const GTM_URL = `https://www.googletagmanager.com/gtag/js?id=${ gaMeasurementId }`;
const CACHE_EXPIRY = 30; // cache timeout in seconds


// Listen to any incoming requests and apply our function
addEventListener('fetch', function(event) {
    try {
        event.respondWith(handleRequest(event))
    } catch(e) {
        console.error(e)
    }
})

async function handleRequest(event) {
    const request = event.request

    // Only GET requests work with this proxy.
    if (request.method !== 'GET') return MethodNotAllowed(request)

    // https://developers.cloudflare.com/workers/examples/cache-api
    const cacheURL = new URL(request.url);

    const cacheKey = new Request(cacheURL.toString(), request);
    const cache = caches.default

    let response = await cache.match(cacheKey);

    if (!response) {
        // If not in cache, get it from origin
        response = await fetch(GTM_URL);

        // Must use Response constructor to inherit all of response's fields
        response = new Response(response.body, response)

        response.headers.append("Cache-Control", `s-maxage=${CACHE_EXPIRY}`)

        // Store the fetched response as cacheKey
        // Use waitUntil so you can return the response without blocking on
        // writing to cache
        event.waitUntil(cache.put(cacheKey, response.clone()))
    }

    return response
}

// Use the following when the request is not a valid GET request
function MethodNotAllowed(request) {
    return new Response(`Method ${request.method} not allowed.`, {
        status: 405,
        headers: {
            'Allow': 'GET'
        }
    })
}
