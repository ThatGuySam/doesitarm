import { confirmationPath, deliverConfirmations, handleConfirmation } from './confirmations.js'
import { handleUnsubscribe, saveInterest, subscriptionPage, tokenPattern } from './interests.js'
import { acceptRosettaReview, previewRosettaReview, runRosettaCheck } from './notifications.js'
import { rosettaLaunchEnabled, rosettaSignupsClosedMessage } from '../../../helpers/rosetta-launch.js'

const allowedOrigins = new Set([
    'https://doesitarm.com',
    'https://cf.doesitarm.com',
    'https://master--doesitarm.netlify.app'
])
const healthPath = '/api/subscriptions/health'
const interestPath = '/api/subscriptions/interests'
const maximumBodyBytes = 4096
const rosettaCheckPath = '/api/subscriptions/check-rosetta'
const rosettaReviewPath = '/api/subscriptions/review-rosetta'
const subscriptionPath = '/api/subscriptions'
const unsubscribePath = '/api/subscriptions/unsubscribe'

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

function isAllowedOrigin ( request, required = false ) {
    const origin = request.headers.get( 'Origin' )

    return ( origin === null && !required ) || allowedOrigins.has( origin )
}

function isValidEmail ( email ) {
    return email.length <= 254 &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test( email )
}

function isFormRequest ( request ) {
    return request.headers.get( 'Content-Type' )?.toLowerCase()
        .startsWith( 'application/x-www-form-urlencoded' ) || false
}

async function readSubscriptionBody ( request ) {
    if ( !request.body ) return ''

    const reader = request.body.getReader()
    const decoder = new TextDecoder()
    let bytes = 0
    let text = ''

    try {
        while ( true ) {
            const { done, value } = await reader.read()
            if ( done ) return text + decoder.decode()
            bytes += value.byteLength
            if ( bytes > maximumBodyBytes ) {
                await reader.cancel()
                return null
            }
            text += decoder.decode( value, { stream: true } )
        }
    } finally {
        reader.releaseLock()
    }
}

async function parseSubscription ( request, allowForm = false ) {
    const contentType = request.headers.get( 'Content-Type' )?.toLowerCase() || ''
    const isForm = allowForm && isFormRequest( request )

    if ( !isForm && !contentType.includes( 'application/json' ) ) {
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

    const bodyText = await readSubscriptionBody( request )
    if ( bodyText === null ) {
        return {
            error: 'Request body is too large.',
            status: 413
        }
    }

    let body

    try {
        body = isForm
            ? Object.fromEntries( new URLSearchParams( bodyText ) )
            : JSON.parse( bodyText )
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
        body,
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

function interestResponse ( request, error, status, headers = {} ) {
    if ( isFormRequest( request ) && request.headers.get( 'Accept' ) !== 'application/json' ) {
        return error
            ? subscriptionPage( 'Signup unsuccessful', `<p>${ error }</p>`, status, headers )
            : subscriptionPage( 'Check your email', '<p>If this signup needs confirmation, use your latest Does It ARM confirmation email.</p>' )
    }

    return error
        ? makeJsonResponse( request, { error, ok: false }, status, headers )
        : makeJsonResponse( request, { ok: true } )
}

async function rateLimitKey ( value ) {
    const digest = await crypto.subtle.digest( 'SHA-256', new TextEncoder().encode( value ) )
    return Array.from( new Uint8Array( digest ), byte => byte.toString( 16 ).padStart( 2, '0' ) ).join( '' )
}

async function handleInterestRequest ( request, env, context ) {
    const tooManyRequests = () => interestResponse( request, 'Too many signup attempts. Try again in a minute.', 429, {
        'Retry-After': '60'
    } )

    const connection = request.headers.get( 'CF-Connecting-IP' ) || 'unavailable'
    const ipLimit = await env.INTEREST_IP_RATE_LIMIT.limit( { key: await rateLimitKey( connection ) } )
    if ( !ipLimit.success ) return tooManyRequests()

    const parsed = await parseSubscription( request, true )
    if ( parsed.error || parsed.honeypot ) return interestResponse( request, parsed.error, parsed.status )

    const emailLimit = await env.INTEREST_EMAIL_RATE_LIMIT.limit( { key: await rateLimitKey( parsed.email ) } )
    if ( !emailLimit.success ) return tooManyRequests()

    const { kind, key, source } = parsed.body
    const signup = await saveInterest( env.SUBSCRIPTIONS_DB, { email: parsed.email, kind, key, source } )
    if ( !signup ) return interestResponse( request, 'This subscription is unavailable.', 422 )
    if ( signup.atCapacity ) return interestResponse( request,
        'Too many pending signups. Use your latest confirmation email or try again later.', 409 )

    if ( signup.confirmationToken && env.ROSETTA_EMAIL_MODE === 'live' && context ) {
        context.waitUntil( deliverConfirmations( env, signup.confirmationToken ).then( result => {
            if ( result.blocked ) console.warn( 'Cloudflare Email Sending blocked a Rosetta confirmation.' )
        } ).catch( () => {
            console.error( 'Rosetta confirmation delivery failed.' )
        } ) )
    }

    return interestResponse( request )
}

async function hasCheckAuthorization ( request, secret ) {
    const authorization = request.headers.get( 'Authorization' ) || ''
    if ( !secret || !authorization.startsWith( 'Bearer ' ) || authorization.length > 512 ) {
        return false
    }

    const encoder = new TextEncoder()
    const [expected, received] = await Promise.all( [
        crypto.subtle.digest( 'SHA-256', encoder.encode( `Bearer ${ secret }` ) ),
        crypto.subtle.digest( 'SHA-256', encoder.encode( authorization ) )
    ] )
    const receivedBytes = new Uint8Array( received )

    return new Uint8Array( expected ).reduce(
        ( difference, byte, index ) => difference | ( byte ^ receivedBytes[index] ),
        0
    ) === 0
}

function rosettaCommand ( method, path ) {
    return `curl -sS -X ${method} -H "Authorization: Bearer $ROSETTA_CHECK_TOKEN" 'https://doesitarm.com${path}'`
}

function recoveryCommands ( observation ) {
    const retryCommand = rosettaCommand( 'POST', rosettaCheckPath )
    if ( !observation.reviewable ) {
        return { message: 'Check the published catalog and retry for the latest observation.', retryCommand }
    }

    const path = `${rosettaReviewPath}?observation=${observation.id}`
    return {
        message: 'Review the refused catalog and email count before accepting it.',
        reviewCommand: rosettaCommand( 'GET', path ),
        acceptSilentlyCommand: rosettaCommand( 'POST', path ),
        retryCommand
    }
}

async function handleRosettaReview ( request, env ) {
    const { searchParams } = new URL( request.url )
    const id = searchParams.get( 'observation' ) || ''
    const notify = searchParams.get( 'notify' )
    const expectedMode = searchParams.get( 'mode' )
    const expectedNotifications = notify === null ? null : Number( notify )
    const notifyQueryValid = notify === null ? expectedMode === null
        : request.method === 'POST' && /^\d+$/.test( notify ) && Number.isSafeInteger( expectedNotifications )
            && ( expectedMode === 'live' || expectedMode === 'dry-run' )
    if ( !tokenPattern.test( id ) || !notifyQueryValid ) {
        return makeJsonResponse( request, {
            ok: false, error: 'Provide an observation ID and, to notify, the reviewed email count and delivery mode.'
        }, 400 )
    }

    const path = `${rosettaReviewPath}?observation=${id}`
    const recovery = recoveryCommands( { id, reviewable: true } )
    if ( request.method === 'GET' ) {
        const review = await previewRosettaReview( env.SUBSCRIPTIONS_DB, id )
        if ( !review ) {
            return makeJsonResponse( request, {
                ok: false, error: 'This observation is no longer available for review.',
                retryCommand: recovery.retryCommand
            }, 404 )
        }

        const mode = rosettaLaunchEnabled && env.ROSETTA_EMAIL_MODE === 'live' ? 'live' : 'dry-run'
        const notifyPath = `${path}&notify=${review.notificationCount}&mode=${mode}`
        return makeJsonResponse( request, {
            ok: true, ...review,
            mode,
            acceptSilentlyCommand: recovery.acceptSilentlyCommand,
            acceptAndNotifyCommand: review.canNotify ? rosettaCommand( 'POST', notifyPath ) : null,
            checkCommand: recovery.retryCommand
        } )
    }

    const result = await acceptRosettaReview( env, id, expectedNotifications, expectedMode )
    return result
        ? makeJsonResponse( request, { ok: true, ...result, checkCommand: recovery.retryCommand } )
        : makeJsonResponse( request, {
            ok: false, error: 'Approval is unavailable or the reviewed email count or delivery mode has changed.',
            reviewCommand: recovery.reviewCommand, retryCommand: recovery.retryCommand
        }, 409 )
}

async function checkRosetta ( env ) {
    const confirmations = await deliverConfirmations( env )
    const result = await runRosettaCheck( env )
    const recovery = result.observation.status === 'refused' ? recoveryCommands( result.observation ) : undefined
    return { ...result, confirmations, recovery }
}

export async function handleRequest ( request, env, context ) {
    const { pathname } = new URL( request.url )

    if ( pathname === confirmationPath && !rosettaLaunchEnabled ) {
        return makeJsonResponse( request, { error: 'Not found.', ok: false }, 404 )
    }

    if ( pathname === unsubscribePath || pathname === confirmationPath ) {
        if ( request.method === 'GET' || request.method === 'POST' ) {
            const database = env.SUBSCRIPTIONS_DB
            if ( pathname === unsubscribePath ) return await handleUnsubscribe( request, database )

            const formBody = request.method === 'POST' && isFormRequest( request )
                ? await readSubscriptionBody( request ) : null
            return await handleConfirmation( request, database, formBody === null ? null : new URLSearchParams( formBody ) )
        }

        return makeJsonResponse( request, { error: 'Method not allowed.', ok: false }, 405, {
            'Allow': 'GET, POST'
        } )
    }

    if ( pathname === rosettaCheckPath || pathname === rosettaReviewPath ) {
        const reviewing = pathname === rosettaReviewPath
        if ( request.method !== 'POST' && !( reviewing && request.method === 'GET' ) ) {
            return makeJsonResponse( request, { error: 'Method not allowed.', ok: false }, 405, {
                'Allow': reviewing ? 'GET, POST' : 'POST'
            } )
        }

        if ( !await hasCheckAuthorization( request, env.ROSETTA_CHECK_TOKEN ) ) {
            return makeJsonResponse( request, { error: 'Unauthorized.', ok: false }, 401 )
        }

        if ( reviewing ) return await handleRosettaReview( request, env )

        const result = await checkRosetta( env )
        const status = result.observation.status === 'refused' ? 409
            : result.deliveries.blocked || result.confirmations.blocked ? 502 : 200

        return makeJsonResponse( request, { ok: status === 200, ...result }, status )
    }

    if ( pathname !== subscriptionPath && pathname !== healthPath && pathname !== interestPath ) {
        return makeJsonResponse( request, {
            error: 'Not found.',
            ok: false
        }, 404 )
    }

    if ( !isAllowedOrigin( request, pathname === interestPath ) ) {
        if ( pathname === interestPath && request.method === 'POST' ) {
            return interestResponse( request, 'Origin is not allowed.', 403 )
        }
        return makeJsonResponse( request, {
            error: 'Origin is not allowed.',
            ok: false
        }, 403 )
    }

    if ( request.method === 'OPTIONS' && pathname !== healthPath ) {
        return new Response( null, {
            headers: {
                ...makeCorsHeaders( request ),
                'Cache-Control': 'no-store'
            },
            status: 204
        } )
    }

    if ( request.method === 'GET' && pathname === healthPath ) {
        return await handleHealthRequest( request, env.SUBSCRIPTIONS_DB )
    }

    if ( request.method !== 'POST' || pathname === healthPath ) {
        return makeJsonResponse( request, {
            error: 'Method not allowed.',
            ok: false
        }, 405, {
            'Allow': pathname === healthPath
                ? 'GET'
                : 'POST, OPTIONS'
        } )
    }

    if ( pathname === interestPath ) {
        if ( !rosettaLaunchEnabled ) return interestResponse( request, rosettaSignupsClosedMessage, 404 )

        return await handleInterestRequest( request, env, context )
    }

    return await handleSubscriptionRequest( request, env.SUBSCRIPTIONS_DB )
}

export default {
    async fetch ( request, env, context ) {
        try {
            return await handleRequest( request, env, context )
        } catch {
            console.error( 'Subscription request failed.' )

            if ( new URL( request.url ).pathname === interestPath ) {
                return interestResponse( request, 'Subscription service is temporarily unavailable.', 503 )
            }
            return makeJsonResponse( request, {
                error: 'Subscription service is temporarily unavailable.',
                ok: false
            }, 503 )
        }
    },
    async scheduled ( controller, env ) {
        const result = await checkRosetta( env )
        console.info( 'Scheduled Rosetta check completed.', result )
        if ( result.deliveries.blocked || result.confirmations.blocked ) {
            throw new Error( 'Cloudflare Email Sending is unavailable for this Worker.' )
        }
    }
}
