// Esbuild Setup - https://github.com/cloudflare/miniflare/blob/dc55621c0767e462b05635f8dd6ba79f4f9445f7/docs/src/content/developing/esbuild.md#-developing-with-esbuild
// Miniflare Documentation - https://miniflare.dev/

// import gaHandleRequest from './ga-handler.js';


// addEventListener('fetch', event => {
//     event.respondWith(gaHandleRequest(event.request, event))
// });


addEventListener('fetch', event => {
    event.respondWith(handleRequest(event.request))
})


// Alter Headers - https://developers.cloudflare.com/workers/examples/alter-headers
async function handleRequest(request) {
    const response = await fetch(request)

    // Clone the response so that it's no longer immutable
    const newResponse = new Response(response.body, response)

    // Add a custom header with a value
    newResponse.headers.append("x-workers-hello", "Hello from Cloudflare Workers")

    // // Delete headers
    // newResponse.headers.delete("x-header-to-delete")
    // newResponse.headers.delete("x-header2-to-delete")

    // // Adjust the value for an existing header
    // newResponse.headers.set("x-header-to-change", "NewValue")

    return newResponse
}
