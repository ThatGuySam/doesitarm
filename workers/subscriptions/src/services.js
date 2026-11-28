// Service card A/B events and service requests (waitlist, scope, revival).
// Events hold no personal data. Requests hold the email the visitor typed and
// the short setup details they chose to send.

export const serviceEventsPath = '/api/subscriptions/service-events'
export const serviceRequestsPath = '/api/subscriptions/service-requests'

const idPattern = /^[a-z0-9-]{1,40}$/
const pathPattern = /^\/(?:[a-z0-9._-]+\/)*[a-z0-9._-]*\/?$/
const serviceEvents = new Set( [ 'impression', 'click', 'submit' ] )
const browserPattern = /^[a-f0-9-]{16,40}$/
export const serviceOffers = new Set( [
    'studio-upgrade-audit',
    'app-revival',
    'mac-fleet-readiness',
    'audio-session-rescue',
    'legacy-studio-hardware',
    'windows-arm-purchase-check',
    'verified-test-report'
] )
const requestKinds = new Set( [ 'waitlist', 'scope', 'revival' ] )
const detailFields = {
    moveDate: 40,
    daw: 80,
    plugin: 120,
    appName: 120,
    note: 500
}

function optionalId ( value ) {
    if ( value === undefined || value === null || value === '' ) return ''
    return typeof value === 'string' && idPattern.test( value ) ? value : null
}

function cleanPath ( value ) {
    if ( typeof value !== 'string' ) return null
    const path = value.split( /[?#]/ )[0]
    return path.length <= 200 && !path.startsWith( '//' ) && pathPattern.test( path ) ? path : null
}

export function parseServiceEvent ( body ) {
    if ( !body || typeof body !== 'object' || Array.isArray( body ) ) return null

    const { event } = body
    const card = optionalId( body.card )
    const variant = optionalId( body.variant )
    const control = optionalId( body.control )
    const experiment = optionalId( body.experiment )
    const path = cleanPath( body.path )
    const browser = body.browser === undefined || body.browser === '' ? ''
        : typeof body.browser === 'string' && browserPattern.test( body.browser ) ? body.browser : null

    if ( !serviceEvents.has( event ) || !card || !variant || control === null || experiment === null ||
        browser === null || path === null ) return null

    return { event, card, variant, control, experiment, browser, path }
}

export async function saveServiceEvent ( database, serviceEvent ) {
    await database
        .prepare( `
            INSERT INTO service_events (event, card, variant, control, experiment, browser, path)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
        ` )
        .bind(
            serviceEvent.event,
            serviceEvent.card,
            serviceEvent.variant,
            serviceEvent.control,
            serviceEvent.experiment,
            serviceEvent.browser,
            serviceEvent.path
        )
        .run()

    // First exposure per browser, card type and experiment. Later impressions are ignored here.
    if ( serviceEvent.event === 'impression' && serviceEvent.browser ) {
        await database
            .prepare( `
                INSERT OR IGNORE INTO service_exposures (experiment, card, browser, variant, path)
                VALUES (?1, ?2, ?3, ?4, ?5)
            ` )
            .bind( serviceEvent.experiment, serviceEvent.card, serviceEvent.browser, serviceEvent.variant, serviceEvent.path )
            .run()
    }
}

export function parseServiceRequest ( body, email ) {
    const { offer, kind } = body
    const appSlug = optionalId( body.app )
    const card = optionalId( body.card )
    const variant = optionalId( body.variant )
    const source = cleanPath( body.source )

    if ( !serviceOffers.has( offer ) || !requestKinds.has( kind ) || appSlug === null ||
        card === null || variant === null || source === null ) {
        return null
    }

    if ( ( kind === 'revival' ) !== ( offer === 'app-revival' ) ) return null

    const details = {}
    for ( const [ field, maximum ] of Object.entries( detailFields ) ) {
        const value = body[field]
        if ( value === undefined || value === '' ) continue
        if ( typeof value !== 'string' ) return null
        const trimmed = value.trim()
        if ( trimmed.length > maximum ) return null
        if ( trimmed ) details[field] = trimmed
    }

    // A revival request names its app: the listing slug from a card, or a typed name from /services/
    if ( kind === 'revival' && !appSlug && !details.appName ) return null

    return { email, offer, kind, appSlug, details, card, variant, source }
}

export async function saveServiceRequest ( database, request ) {
    const saved = await database
        .prepare( `
            INSERT INTO service_requests (email, offer, kind, app_slug, details, card, variant, source)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
            ON CONFLICT (email, offer, kind, app_slug) DO UPDATE SET
                details = excluded.details,
                card = excluded.card,
                variant = excluded.variant,
                source = excluded.source,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            RETURNING created_at, created_at = updated_at AS inserted
        ` )
        .bind(
            request.email,
            request.offer,
            request.kind,
            request.appSlug,
            JSON.stringify( request.details ),
            request.card,
            request.variant,
            request.source
        )
        .first()

    return {
        createdAt: saved?.created_at || new Date().toISOString(),
        inserted: saved ? saved.inserted === 1 : true
    }
}

const turnstileHosts = new Set( [ 'doesitarm.com', 'cf.doesitarm.com' ] )

// Checks a Turnstile token with Cloudflare. Skipped while TURNSTILE_SECRET is unset.
export async function verifyTurnstile ( env, token, remoteIp ) {
    const secret = env.TURNSTILE_SECRET?.trim()
    if ( !secret ) return true
    if ( typeof token !== 'string' || !token || token.length > 2048 ) return false

    const form = new FormData()
    form.append( 'secret', secret )
    form.append( 'response', token )
    if ( remoteIp ) form.append( 'remoteip', remoteIp )

    try {
        const response = await fetch( 'https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            body: form,
            signal: AbortSignal.timeout( 8000 )
        } )
        const result = await response.json()
        const extraHosts = ( env.TURNSTILE_EXTRA_HOSTS || '' ).split( ',' ).map( host => host.trim() ).filter( Boolean )

        return result.success === true &&
            ( turnstileHosts.has( result.hostname ) || extraHosts.includes( result.hostname ) )
    } catch {
        console.error( 'Turnstile verification failed to run.' )
        return false
    }
}

export function makeServiceRequestEmail ( request, saved, from, to ) {
    const app = request.appSlug
        ? `${ request.appSlug } (https://doesitarm.com/app/${ request.appSlug }/)`
        : request.details.appName || '-'
    const details = Object.entries( request.details )
        .map( ( [ field, value ] ) => `  ${ field }: ${ value }` )
        .join( '\n' ) || '  (none)'
    const label = saved.inserted ? 'New' : 'Updated'

    return {
        from: { email: from, name: 'Does It ARM services' },
        to,
        replyTo: request.email,
        subject: `${ label } service request: ${ request.offer } (${ request.kind })`,
        text: [
            `${ label } Does It ARM service request`,
            '',
            `Offer: ${ request.offer }`,
            `Kind: ${ request.kind }`,
            `App: ${ app }`,
            `Card: ${ request.card || '-' } / variant ${ request.variant || '-' }`,
            `Page: https://doesitarm.com${ request.source }`,
            `From: ${ request.email }`,
            `Time: ${ saved.createdAt }`,
            '',
            'Details:',
            details,
            '',
            'Reply to this email to answer the visitor directly.'
        ].join( '\n' )
    }
}

// Emails Sam about a request. Never throws: the request is already saved.
export async function notifyServiceRequest ( env, request, saved ) {
    const to = env.SERVICE_NOTIFY_TO?.trim()
    const from = env.SERVICE_NOTIFY_FROM?.trim()
    if ( !env.SERVICE_EMAIL || !to || !from ) {
        console.warn( 'Service request email skipped: notification is not configured.' )
        return { sent: false }
    }

    try {
        await env.SERVICE_EMAIL.send( makeServiceRequestEmail( request, saved, from, to ) )
        return { sent: true }
    } catch ( error ) {
        console.error( 'Service request email failed.', error?.code || '', error?.message || '' )
        return { sent: false }
    }
}
