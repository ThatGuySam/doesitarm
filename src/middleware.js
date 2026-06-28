import { defineMiddleware } from 'astro:middleware'

// Content redirects ported from netlify.toml — the runtime getNetlifyRedirect
// path can't read the file on workerd, so apply them here, in a request handler
// (legal), for every route. Keep in sync with netlify.toml when rules change.
const REDIRECTS = new Map([
    [ '/app/node',                 { to: '/app/nodejs',                       status: 301 } ],
    [ '/app/git',                  { to: '/app/git-version-control',          status: 301 } ],
    [ '/app/electron',             { to: '/app/electron-framework',           status: 301 } ],
    [ '/app/vectornator',          { to: '/app/linearity-curve',              status: 301 } ],
    [ '/device/apple-silicon-imac',{ to: '/device/m1-imac/',                  status: 307 } ],
    [ '/kind/entertainment',       { to: '/kind/entertainment-and-media-apps/', status: 301 } ],
    [ '/kind/photo-tools',         { to: '/kind/photo-and-graphic-tools/',    status: 301 } ],
    [ '/%E3%80%82',                { to: '/',                                 status: 301 } ],
    [ '/\u3002',                   { to: '/',                                 status: 301 } ],
])

export const onRequest = defineMiddleware( async ( context, next ) => {
    const rule = REDIRECTS.get( context.url.pathname )
    if ( rule ) return context.redirect( rule.to, rule.status )

    const response = await next()

    // Keep the cf.doesitarm.com preview out of search vs the production apex.
    try {
        response.headers.set( 'X-Robots-Tag', 'noindex, nofollow' )
    } catch {}

    return response
} )
