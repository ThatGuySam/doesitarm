// Service card A/B events and service requests (waitlist, scope, revival).
// Events hold no personal data. Requests hold the email the visitor typed and
// the short setup details they chose to send.

export const serviceEventsPath = '/api/subscriptions/service-events'
export const serviceRequestsPath = '/api/subscriptions/service-requests'

const idPattern = /^[a-z0-9-]{1,40}$/
const pathPattern = /^\/(?:[a-z0-9._-]+\/)*[a-z0-9._-]*\/?$/
const serviceEvents = new Set( [ 'impression', 'click', 'submit' ] )
const offers = new Set( [ 'studio-upgrade-audit', 'app-revival' ] )
const requestKinds = new Set( [ 'waitlist', 'scope', 'revival' ] )
const detailFields = {
    moveDate: 40,
    daw: 80,
    plugin: 120,
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
    const path = cleanPath( body.path )

    if ( !serviceEvents.has( event ) || !card || !variant || control === null || path === null ) return null

    return { event, card, variant, control, path }
}

export async function saveServiceEvent ( database, serviceEvent ) {
    await database
        .prepare( 'INSERT INTO service_events (event, card, variant, control, path) VALUES (?1, ?2, ?3, ?4, ?5)' )
        .bind( serviceEvent.event, serviceEvent.card, serviceEvent.variant, serviceEvent.control, serviceEvent.path )
        .run()
}

export function parseServiceRequest ( body, email ) {
    const { offer, kind } = body
    const appSlug = optionalId( body.app )
    const card = optionalId( body.card )
    const variant = optionalId( body.variant )
    const source = cleanPath( body.source )

    if ( !offers.has( offer ) || !requestKinds.has( kind ) || appSlug === null ||
        card === null || variant === null || source === null ) {
        return null
    }

    if ( ( kind === 'revival' ) !== ( offer === 'app-revival' ) ) return null
    if ( kind === 'revival' && !appSlug ) return null

    const details = {}
    for ( const [ field, maximum ] of Object.entries( detailFields ) ) {
        const value = body[field]
        if ( value === undefined || value === '' ) continue
        if ( typeof value !== 'string' ) return null
        const trimmed = value.trim()
        if ( trimmed.length > maximum ) return null
        if ( trimmed ) details[field] = trimmed
    }

    return { email, offer, kind, appSlug, details, card, variant, source }
}

export async function saveServiceRequest ( database, request ) {
    await database
        .prepare( `
            INSERT INTO service_requests (email, offer, kind, app_slug, details, card, variant, source)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
            ON CONFLICT (email, offer, kind, app_slug) DO UPDATE SET
                details = excluded.details,
                card = excluded.card,
                variant = excluded.variant,
                source = excluded.source,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
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
        .run()
}
