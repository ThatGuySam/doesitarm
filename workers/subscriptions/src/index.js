const allowedOrigins = new Set([
    'https://doesitarm.com',
    'https://cf.doesitarm.com',
    'https://master--doesitarm.netlify.app'
])
const healthPath = '/api/subscriptions/health'
const maximumBodyBytes = 4096
const subscriptionPath = '/api/subscriptions'

function makeCorsHeaders ( request ) {
    const origin = request.headers.get( 'Origin' )

    if ( !origin || !allowedOrigins.has( origin ) ) {
        return {}
    }

    return {
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Max-Age': '86400',
        'Vary': 'Origin'
    }
}

function makeJsonResponse ( request, body, status = 200, headers = {} ) {
    return Response.json( body, {
        headers: {
            'Cache-Control': 'no-store',
            'Content-Type': 'application/json; charset=utf-8',
            'X-Content-Type-Options': 'nosniff',
            ...makeCorsHeaders( request ),
            ...headers
        },
        status
    } )
}

function isAllowedOrigin ( request ) {
    const origin = request.headers.get( 'Origin' )

    return origin === null || allowedOrigins.has( origin )
}

function isValidEmail ( email ) {
    return email.length <= 254 &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test( email )
}

async function parseSubscription ( request ) {
    const contentType = request.headers.get( 'Content-Type' ) || ''

    if ( !contentType.toLowerCase().includes( 'application/json' ) ) {
        return {
            error: 'Content-Type must be application/json.',
            status: 415
        }
    }

    const contentLength = Number( request.headers.get( 'Content-Length' ) )

    if ( Number.isFinite( contentLength ) && contentLength > maximumBodyBytes ) {
        return {
            error: 'Request body is too large.',
            status: 413
        }
    }

    const bodyText = await request.text()
    const bodyBytes = new TextEncoder().encode( bodyText ).byteLength

    if ( bodyBytes > maximumBodyBytes ) {
        return {
            error: 'Request body is too large.',
            status: 413
        }
    }

    let body

    try {
        body = JSON.parse( bodyText )
    } catch {
        return {
            error: 'Request body must be valid JSON.',
            status: 400
        }
    }

    if ( !body || typeof body !== 'object' || Array.isArray( body ) ) {
        return {
            error: 'Request body must be a JSON object.',
            status: 400
        }
    }

    const website = typeof body.website === 'string'
        ? body.website.trim()
        : ''

    if ( website.length > 0 ) {
        return {
            honeypot: true
        }
    }

    if ( typeof body.email !== 'string' ) {
        return {
            error: 'Enter a valid email address.',
            status: 422
        }
    }

    const email = body.email.trim().toLowerCase()

    if ( !isValidEmail( email ) ) {
        return {
            error: 'Enter a valid email address.',
            status: 422
        }
    }

    return {
        email
    }
}

async function handleHealthRequest ( request, database ) {
    const result = await database
        .prepare( 'SELECT 1 AS healthy' )
        .first()

    if ( result?.healthy !== 1 ) {
        throw new Error( 'D1 health query failed.' )
    }

    return makeJsonResponse( request, {
        ok: true,
        service: 'doesitarm-subscriptions'
    } )
}

async function handleSubscriptionRequest ( request, database ) {
    const parsed = await parseSubscription( request )

    if ( parsed.error ) {
        return makeJsonResponse( request, {
            error: parsed.error,
            ok: false
        }, parsed.status )
    }

    if ( parsed.honeypot ) {
        return makeJsonResponse( request, {
            ok: true
        } )
    }

    await database
        .prepare(`
            INSERT INTO email_subscriptions (
                email,
                status,
                source,
                created_at,
                updated_at
            )
            VALUES (
                ?1,
                'subscribed',
                'site-footer',
                strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            )
            ON CONFLICT (email) DO UPDATE SET
                status = 'subscribed',
                source = excluded.source,
                updated_at = excluded.updated_at
        `)
        .bind( parsed.email )
        .run()

    return makeJsonResponse( request, {
        ok: true
    } )
}

export async function handleRequest ( request, env ) {
    const url = new URL( request.url )

    if ( url.pathname !== subscriptionPath && url.pathname !== healthPath ) {
        return makeJsonResponse( request, {
            error: 'Not found.',
            ok: false
        }, 404 )
    }

    if ( !isAllowedOrigin( request ) ) {
        return makeJsonResponse( request, {
            error: 'Origin is not allowed.',
            ok: false
        }, 403 )
    }

    if ( request.method === 'OPTIONS' && url.pathname === subscriptionPath ) {
        return new Response( null, {
            headers: {
                ...makeCorsHeaders( request ),
                'Cache-Control': 'no-store'
            },
            status: 204
        } )
    }

    if ( request.method === 'GET' && url.pathname === healthPath ) {
        return await handleHealthRequest( request, env.SUBSCRIPTIONS_DB )
    }

    if ( request.method !== 'POST' || url.pathname !== subscriptionPath ) {
        return makeJsonResponse( request, {
            error: 'Method not allowed.',
            ok: false
        }, 405, {
            'Allow': url.pathname === healthPath
                ? 'GET'
                : 'POST, OPTIONS'
        } )
    }

    return await handleSubscriptionRequest( request, env.SUBSCRIPTIONS_DB )
}

export default {
    async fetch ( request, env ) {
        try {
            return await handleRequest( request, env )
        } catch {
            console.error( 'Subscription request failed.' )

            return makeJsonResponse( request, {
                error: 'Subscription service is temporarily unavailable.',
                ok: false
            }, 503 )
        }
    }
}
