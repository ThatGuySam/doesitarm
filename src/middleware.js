import { defineMiddleware } from 'astro:middleware'

import {
    getRedirectRule,
    isProductionHostname
} from './middleware-rules.js'

// Content redirects ported from netlify.toml — the runtime getNetlifyRedirect
// path can't read the file on workerd, so apply them here, in a request handler
// (legal), for every route. Keep in sync with netlify.toml when rules change.
export const onRequest = defineMiddleware( async ( context, next ) => {
    const rule = getRedirectRule( context.url.pathname )
    if ( rule ) return context.redirect( rule.to, rule.status )

    const response = await next()

    // Preview, workers.dev, Netlify preview, and local hosts must not compete
    // with the canonical production domain in search.
    if ( !isProductionHostname( context.url.hostname ) ) {
        try {
            response.headers.set( 'X-Robots-Tag', 'noindex, nofollow' )
        } catch {}
    }

    return response
} )
