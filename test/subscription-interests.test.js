import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { appStatusConsent, rosettaNewsConsent, waitlists } from '../helpers/subscription-interests.js'
import subscriptionWorker from '../workers/subscriptions/src/index.js'
import { makeSubscriptionsDatabase } from './helpers/subscriptions-database.js'

const launch = vi.hoisted( () => ( { enabled: false } ) )
vi.mock( '../helpers/rosetta-launch.js', async importOriginal => ( {
    ...await importOriginal(),
    get rosettaLaunchEnabled () { return launch.enabled }
} ) )
vi.mock( '../helpers/rosetta-catalog.js', async importOriginal => ( { ...await importOriginal(), rosettaBaselineMinimum: 1 } ) )

const workerUrl = 'https://doesitarm.com/api/subscriptions'
const catalogUrl = 'https://api.doesitarm.com/app-list.json'
const origin = 'https://doesitarm.com'
const app = { endpoint: '/app/example-app', name: 'Example App', status: 'rosetta' }
const appSignup = { email: '  Reader@Example.COM ', kind: 'app-status', key: 'example-app', source: '/app/example-app/' }
const newsSignup = { ...appSignup, kind: 'rosetta-news', key: '', source: '/rosetta-at-risk' }

let sqlite
let env
let fetchUpstream
let remoteWork
let providerStatus
let catalog

beforeEach( () => {
    const local = makeSubscriptionsDatabase()
    sqlite = local.sqlite
    env = {
        SUBSCRIPTIONS_DB: local.database,
        INTEREST_IP_RATE_LIMIT: { limit: vi.fn().mockResolvedValue( { success: true } ) },
        INTEREST_EMAIL_RATE_LIMIT: { limit: vi.fn().mockResolvedValue( { success: true } ) }
    }
    launch.enabled = true
    catalog = [app]
    remoteWork = []
    providerStatus = 200
    fetchUpstream = vi.fn( async ( url, options ) => {
        if ( url === catalogUrl ) return Response.json( catalog )
        if ( providerStatus !== 200 ) return new Response( null, { status: providerStatus } )
        return Response.json( { success: true, result: { queued: [JSON.parse( options.body ).to], message_id: 'fake-message-id' } } )
    } )
    vi.stubGlobal( 'fetch', fetchUpstream )
} )

afterEach( () => {
    sqlite.close()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
} )

function request ( path, options ) {
    return subscriptionWorker.fetch( new Request( path.startsWith( 'https://' ) ? path : `${workerUrl}/${path}`, options ),
        env, { waitUntil: promise => remoteWork.push( promise ) } )
}

function signUp ( input, { form = false, requestOrigin = origin, accept, ip = '192.0.2.1' } = {} ) {
    const headers = new Headers( { 'CF-Connecting-IP': ip, 'User-Agent': 'example-agent' } )
    if ( requestOrigin ) headers.set( 'Origin', requestOrigin )
    if ( !form ) headers.set( 'Content-Type', 'application/json' )
    if ( accept ) headers.set( 'Accept', accept )
    return request( 'interests', {
        method: 'POST', headers, body: form ? new URLSearchParams( input ) : JSON.stringify( input )
    } )
}

function subscriptions () {
    return sqlite.prepare( 'SELECT * FROM interest_subscriptions ORDER BY id' ).all()
}

function confirmations () {
    return sqlite.prepare( 'SELECT * FROM interest_confirmations ORDER BY rowid' ).all()
}

function mockLiveSender () {
    Object.assign( env, {
        ROSETTA_EMAIL_MODE: 'live', CLOUDFLARE_EMAIL_ACCOUNT_ID: 'a'.repeat( 32 ),
        CLOUDFLARE_EMAIL_API_TOKEN: 'fake-token', ROSETTA_EMAIL_FROM: 'test@example.com', ROSETTA_MAILING_ADDRESS: 'Test mailing address'
    } )
}

function deliveredMessages () {
    return fetchUpstream.mock.calls.filter( ( [url] ) => url !== catalogUrl ).map( ( [, options] ) => JSON.parse( options.body ) )
}

function check ( token ) {
    return request( 'check-rosetta', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {} } )
}

function linkPath ( kind, token ) {
    return `${kind}?token=${token}`
}

function appInterests ( count ) {
    catalog = Array.from( { length: count }, ( _, index ) => ( { ...app, endpoint: `/app/example-app-${index}` } ) )
    return catalog.map( entry => ( { ...appSignup, key: entry.endpoint.slice( '/app/'.length ), source: entry.endpoint } ) )
}

async function confirmationForm ( path ) {
    const response = await request( path )
    expect( response.status ).toBe( 200 )
    const html = await response.text()
    const action = html.match( /<form method="post" action="([^"]+)"/ )[1]
    const interests = [...html.matchAll( /<input type="checkbox" name="interest" value="(\d+)">/g )].map( match => match[1] )
    expect( html ).toContain( '<input type="hidden" name="reviewed" value="1">' )
    expect( html ).not.toMatch( /<input[^>]*\schecked\b/ )
    return { action: new URL( action, origin ).href, interests, html }
}

function submitConfirmation ( form, interests ) {
    const body = new URLSearchParams( { reviewed: '1' } )
    for ( const id of interests ) body.append( 'interest', id )
    return request( form.action, { method: 'POST', body } )
}

async function confirmAll ( path ) {
    const form = await confirmationForm( path )
    return submitConfirmation( form, form.interests )
}

describe( 'subscription interests', () => {
    it( 'reports closed signups to both forms and keeps confirmation hidden with the launch switch off', async () => {
        launch.enabled = false
        mockLiveSender()
        const preview = 'https://cf.doesitarm.com'
        const response = await signUp( appSignup, { form: true, accept: 'application/json', requestOrigin: preview } )
        expect( response.status ).toBe( 404 )
        expect( response.headers.get( 'Access-Control-Allow-Origin' ) ).toBe( preview )
        expect( await response.json() ).toEqual( { error: 'Signups are not open yet', ok: false } )

        const nativeForm = await signUp( appSignup, { form: true, requestOrigin: preview } )
        expect( nativeForm.status ).toBe( 404 )
        expect( nativeForm.headers.get( 'Content-Type' ) ).toContain( 'text/html' )
        expect( await nativeForm.text() ).toContain( 'Signups are not open yet' )

        const preflight = await request( 'interests', { method: 'OPTIONS', headers: { Origin: preview } } )
        expect( preflight.status ).toBe( 204 )
        expect( preflight.headers.get( 'Access-Control-Allow-Origin' ) ).toBe( preview )
        expect( ( await request( linkPath( 'confirm', crypto.randomUUID() ) ) ).status ).toBe( 404 )
        expect( subscriptions() ).toEqual( [] )
        expect( confirmations() ).toEqual( [] )
        expect( fetchUpstream ).not.toHaveBeenCalled()
        expect( env.INTEREST_IP_RATE_LIMIT.limit ).not.toHaveBeenCalled()
    } )

    it( 'allows CORS preflight only for an allowed site origin', async () => {
        const preflight = requestOrigin => request( 'interests', {
            method: 'OPTIONS', headers: { Origin: requestOrigin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'Content-Type' }
        } )
        const allowed = await preflight( 'https://cf.doesitarm.com' )
        expect( allowed.status ).toBe( 204 )
        expect( allowed.headers.get( 'Access-Control-Allow-Origin' ) ).toBe( 'https://cf.doesitarm.com' )
        expect( allowed.headers.get( 'Access-Control-Allow-Methods' ) ).toBe( 'POST, OPTIONS' )
        expect( allowed.headers.get( 'Access-Control-Allow-Headers' ) ).toBe( 'Content-Type' )
        const denied = await preflight( 'https://example.com' )
        expect( denied.status ).toBe( 403 )
        expect( denied.headers.get( 'Access-Control-Allow-Origin' ) ).toBeNull()
        expect( env.INTEREST_IP_RATE_LIMIT.limit ).not.toHaveBeenCalled()
    } )

    it( 'returns JSON to the enhanced form without requiring a cross-origin preflight', async () => {
        const preview = 'https://cf.doesitarm.com'
        const response = await signUp( newsSignup, { form: true, accept: 'application/json', requestOrigin: preview } )

        expect( response.status ).toBe( 200 )
        expect( response.headers.get( 'Access-Control-Allow-Origin' ) ).toBe( preview )
        expect( await response.json() ).toEqual( { ok: true } )
        expect( subscriptions() ).toHaveLength( 1 )
    } )

    it( 'stores consent by interest without client metadata and leaves confirmations queued in dry-run', async () => {
        expect( await ( await signUp( appSignup ) ).json() ).toEqual( { ok: true } )
        expect( ( await signUp( newsSignup ) ).status ).toBe( 200 )
        const waitlist = await signUp( { ...newsSignup, kind: 'waitlist', key: 'plugin-audit' }, { form: true } )
        expect( waitlist.headers.get( 'Content-Type' ) ).toContain( 'text/html' )
        expect( await waitlist.text() ).toContain( 'Check your email' )
        const rows = subscriptions()
        expect( rows ).toMatchObject( [
            { email: 'reader@example.com', kind: 'app-status', interest_key: 'example-app', source: '/app/example-app', consent: appStatusConsent, confirmed_at: null },
            { email: 'reader@example.com', kind: 'rosetta-news', interest_key: '', source: '/rosetta-at-risk', consent: rosettaNewsConsent, confirmed_at: null },
            { email: 'reader@example.com', kind: 'waitlist', interest_key: 'plugin-audit', source: '/rosetta-at-risk', consent: waitlists['plugin-audit'].consent, confirmed_at: null }
        ] )
        expect( Object.keys( rows[0] ).sort() ).toEqual( [
            'confirmed_at', 'consent', 'created_at', 'email', 'id', 'interest_key', 'kind', 'source', 'unsubscribe_token', 'unsubscribed_at'
        ] )
        expect( sqlite.prepare( 'SELECT COUNT(*) AS count FROM email_subscriptions' ).get().count ).toBe( 0 )
        const queued = confirmations()
        expect( queued ).toHaveLength( 1 )
        expect( queued[0] ).toMatchObject( { email: 'reader@example.com', state: 'pending', attempted_at: null, valid_until: null } )
        expect( ( await request( linkPath( 'confirm', queued[0].token ), { method: 'POST' } ) ).status ).toBe( 400 )
        env.ROSETTA_CHECK_TOKEN = 'correct-token'
        const dryRun = await check( 'correct-token' )
        expect( dryRun.status ).toBe( 200 )
        expect( ( await dryRun.json() ).confirmations ).toMatchObject( { pending: 1, accepted: 0 } )
        expect( confirmations() ).toEqual( queued )
        expect( deliveredMessages() ).toEqual( [] )
    } )

    it( 'rejects unknown app slugs, invalid scopes, missing origins and invalid source paths', async () => {
        expect( ( await signUp( { ...appSignup, key: 'missing-app' } ) ).status ).toBe( 422 )
        expect( ( await signUp( { ...appSignup, key: '/app/example-app' } ) ).status ).toBe( 422 )
        expect( ( await signUp( { ...appSignup, kind: 'waitlist', key: 'constructor' } ) ).status ).toBe( 422 )
        expect( ( await signUp( { ...appSignup, source: '//example.com' } ) ).status ).toBe( 422 )
        expect( ( await signUp( { ...appSignup, source: '/app/example-app?email=example' } ) ).status ).toBe( 422 )
        expect( ( await signUp( appSignup, { requestOrigin: 'https://example.com' } ) ).status ).toBe( 403 )
        expect( ( await signUp( appSignup, { requestOrigin: null } ) ).status ).toBe( 403 )
        expect( ( await signUp( { ...appSignup, website: 'https://example.com' } ) ).status ).toBe( 200 )
        expect( subscriptions() ).toEqual( [] )
        expect( confirmations() ).toEqual( [] )
        expect( fetchUpstream ).toHaveBeenCalledTimes( 1 )
    } )

    it( 'renders a form-encoded error page without reflecting field input', async () => {
        const response = await signUp( { ...appSignup, email: '<img src=x onerror=alert(1)>' }, { form: true } )
        expect( response.status ).toBe( 422 )
        expect( response.headers.get( 'Content-Type' ) ).toContain( 'text/html' )
        expect( response.headers.get( 'Cache-Control' ) ).toBe( 'no-store' )
        const html = await response.text()
        expect( html ).toContain( 'Enter a valid email address.' )
        expect( html ).not.toContain( '<img' )
    } )

    it( 'rate limits the connection before lookup and the normalized address across interests', async () => {
        env.INTEREST_IP_RATE_LIMIT.limit.mockResolvedValueOnce( { success: false } )
        const connectionLimited = await signUp( appSignup )
        expect( connectionLimited.status ).toBe( 429 )
        expect( connectionLimited.headers.get( 'Retry-After' ) ).toBe( '60' )
        expect( env.INTEREST_IP_RATE_LIMIT.limit.mock.calls[0][0].key ).toMatch( /^[a-f0-9]{64}$/ )
        expect( env.INTEREST_EMAIL_RATE_LIMIT.limit ).not.toHaveBeenCalled()

        env.INTEREST_EMAIL_RATE_LIMIT.limit.mockResolvedValue( { success: false } )
        expect( ( await signUp( appSignup ) ).status ).toBe( 429 )
        expect( ( await signUp( { ...newsSignup, email: 'reader@example.com' }, { form: true } ) ).status ).toBe( 429 )
        const [[first], [second]] = env.INTEREST_EMAIL_RATE_LIMIT.limit.mock.calls
        expect( first.key ).toMatch( /^[a-f0-9]{64}$/ )
        expect( first.key ).toBe( second.key )
        expect( fetchUpstream ).not.toHaveBeenCalled()
        expect( subscriptions() ).toEqual( [] )
    } )

    it( 'sends one confirmation, requires POST consent, and requires new consent after one-click unsubscribe without an Origin', async () => {
        mockLiveSender()
        await signUp( newsSignup )
        await signUp( { ...newsSignup, source: '/rosetta-checker' } )
        await Promise.all( remoteWork )
        const [initial] = subscriptions()
        const [message] = deliveredMessages()
        const confirmUrl = message.text.match( /https:\/\/[^\s]+/ )[0]
        expect( message ).toMatchObject( { to: 'reader@example.com', subject: 'Confirm your Does It ARM signup' } )
        expect( message.text ).toContain( rosettaNewsConsent )
        expect( message.text ).toContain( 'Confirm within 48 hours' )
        expect( deliveredMessages() ).toHaveLength( 1 )
        expect( initial ).toMatchObject( { source: '/rosetta-at-risk', confirmed_at: null } )

        const form = await confirmationForm( confirmUrl )
        expect( subscriptions()[0].confirmed_at ).toBeNull()
        expect( ( await submitConfirmation( form, form.interests ) ).status ).toBe( 200 )
        expect( subscriptions()[0].confirmed_at ).not.toBeNull()
        expect( ( await request( confirmUrl, { method: 'POST' } ) ).status ).toBe( 400 )
        await signUp( newsSignup )
        expect( deliveredMessages() ).toHaveLength( 1 )
        expect( remoteWork ).toHaveLength( 1 )

        const optOut = () => request( linkPath( 'unsubscribe', initial.unsubscribe_token ), {
            method: 'POST', body: new URLSearchParams( { 'List-Unsubscribe': 'One-Click' } )
        } )
        expect( ( await optOut() ).status ).toBe( 200 )
        expect( subscriptions()[0].unsubscribed_at ).not.toBeNull()
        await signUp( newsSignup )
        await Promise.all( remoteWork )
        const [rejoined] = subscriptions()
        expect( rejoined.id ).toBe( initial.id )
        expect( rejoined.unsubscribe_token ).not.toBe( initial.unsubscribe_token )
        expect( rejoined.confirmed_at ).toBeNull()
        expect( rejoined.unsubscribed_at ).toBeNull()
        expect( ( await request( confirmUrl, { method: 'POST' } ) ).status ).toBe( 400 )
        const renewal = confirmations().at( -1 )
        expect( ( await confirmAll( linkPath( 'confirm', renewal.token ) ) ).status ).toBe( 200 )
        await optOut()
        expect( subscriptions()[0] ).toMatchObject( { unsubscribed_at: null } )
        expect( subscriptions()[0].confirmed_at ).not.toBeNull()
    } )

    it( 'rejects an expired link and issues a new one after signup for a different interest', async () => {
        const start = Date.now()
        const time = vi.spyOn( Date, 'now' ).mockReturnValue( start )
        mockLiveSender()
        await signUp( newsSignup )
        await Promise.all( remoteWork )
        const [first] = confirmations()
        time.mockReturnValue( first.valid_until )
        expect( ( await request( linkPath( 'confirm', first.token ), { method: 'POST' } ) ).status ).toBe( 400 )
        expect( subscriptions()[0].confirmed_at ).toBeNull()
        await signUp( appSignup )
        await Promise.all( remoteWork )
        expect( confirmations()[0].state ).toBe( 'cancelled' )
        expect( confirmations().at( -1 ).token ).not.toBe( first.token )
        expect( deliveredMessages() ).toHaveLength( 2 )
        expect( subscriptions().map( row => row.interest_key ) ).toEqual( ['', 'example-app'] )
    } )

    it( 'confirms only checked interests when someone adds interests after delivery and after the page opens', async () => {
        mockLiveSender()
        const [firstApp, otherApp] = appInterests( 2 )
        await Promise.all( [signUp( newsSignup ), signUp( firstApp )] )
        await Promise.all( remoteWork )
        const [message] = deliveredMessages()
        const confirmUrl = message.text.match( /https:\/\/[^\s]+/ )[0]

        await signUp( { ...newsSignup, kind: 'waitlist', key: 'plugin-audit' } )
        const form = await confirmationForm( confirmUrl )
        expect( form.html ).toContain( firstApp.key )
        expect( form.html ).toContain( rosettaNewsConsent )
        expect( form.html ).toContain( waitlists['plugin-audit'].consent )
        expect( form.interests ).toHaveLength( 3 )

        await signUp( otherApp )
        await Promise.all( remoteWork )
        expect( deliveredMessages() ).toHaveLength( 1 )
        expect( confirmations() ).toHaveLength( 1 )
        const chosen = subscriptions().filter( row => ['rosetta-news', 'app-status'].includes( row.kind )
            && row.interest_key !== otherApp.key ).map( row => String( row.id ) )
        expect( chosen.every( id => form.interests.includes( id ) ) ).toBe( true )
        expect( ( await submitConfirmation( form, chosen ) ).status ).toBe( 200 )
        expect( subscriptions().map( row => String( row.id ) ) ).toEqual( chosen )
        expect( subscriptions().every( row => row.confirmed_at !== null ) ).toBe( true )
        expect( ( await submitConfirmation( form, chosen ) ).status ).toBe( 400 )
    } )

    it( 'keeps a recent pending choice confirmable when all 20 slots are protected', async () => {
        mockLiveSender()
        const start = Date.now()
        const time = vi.spyOn( Date, 'now' ).mockReturnValue( start )
        const [ownInterest, ...otherInterests] = appInterests( 21 )
        expect( ( await signUp( ownInterest ) ).status ).toBe( 200 )
        for ( const interest of otherInterests.slice( 0, 19 ) ) {
            expect( ( await signUp( interest, { ip: '192.0.2.2' } ) ).status ).toBe( 200 )
        }
        await Promise.all( remoteWork )
        const rows = subscriptions()
        const queued = confirmations()
        const form = await confirmationForm( linkPath( 'confirm', queued[0].token ) )
        const ownId = String( rows[0].id )
        expect( form.interests ).toHaveLength( 20 )
        expect( form.interests ).toContain( ownId )

        time.mockReturnValue( start + 15 * 60 * 1000 - 1 )
        const extraInterest = otherInterests.at( -1 )
        const apiResponse = await signUp( extraInterest, { ip: '192.0.2.2' } )
        const message = 'Too many pending signups. Use your latest confirmation email or try again later.'
        expect( apiResponse.status ).toBe( 409 )
        expect( await apiResponse.json() ).toEqual( { ok: false, error: message } )
        const formResponse = await signUp( extraInterest, { ip: '192.0.2.2', form: true } )
        expect( formResponse.status ).toBe( 409 )
        expect( await formResponse.text() ).toContain( message )
        expect( subscriptions() ).toEqual( rows )
        expect( confirmations() ).toEqual( queued )
        expect( remoteWork ).toHaveLength( 1 )

        expect( ( await submitConfirmation( form, [ownId] ) ).status ).toBe( 200 )
        expect( subscriptions() ).toMatchObject( [{ interest_key: ownInterest.key, confirmed_at: expect.any( String ) }] )
    } )

    it( 'replaces the oldest pending interest when it reaches 15 minutes and all 20 slots are full', async () => {
        mockLiveSender()
        const start = Date.now()
        const time = vi.spyOn( Date, 'now' )
        const interests = appInterests( 21 ).map( interest => ( { ...interest, email: 'victim@example.com' } ) )
        for ( const [index, interest] of interests.slice( 0, 20 ).entries() ) {
            time.mockReturnValue( start + index * 20000 )
            expect( ( await signUp( interest ) ).status ).toBe( 200 )
        }
        await Promise.all( remoteWork )
        expect( subscriptions() ).toHaveLength( 20 )

        const ownInterest = interests.at( -1 )
        time.mockReturnValue( start + 15 * 60 * 1000 )
        const beforeRetry = subscriptions()
        expect( ( await signUp( interests[0] ) ).status ).toBe( 200 )
        expect( subscriptions() ).toEqual( beforeRetry )
        expect( ( await signUp( ownInterest, { ip: '192.0.2.2', form: true } ) ).status ).toBe( 200 )
        const rows = subscriptions()
        expect( rows.map( row => row.interest_key ) ).toEqual( interests.slice( 1 ).map( row => row.key ) )
        expect( deliveredMessages() ).toHaveLength( 1 )
        const [message] = deliveredMessages()
        const form = await confirmationForm( message.text.match( /https:\/\/[^\s]+/ )[0] )
        const ownId = String( rows.at( -1 ).id )
        expect( form.interests ).toHaveLength( 20 )
        expect( form.interests ).toContain( ownId )

        expect( ( await submitConfirmation( form, [ownId] ) ).status ).toBe( 200 )
        expect( subscriptions() ).toMatchObject( [{ interest_key: ownInterest.key, confirmed_at: expect.any( String ) }] )
    } )

    it( 'discards every unchecked interest and preserves notification history from a prior subscription', async () => {
        mockLiveSender()
        await signUp( appSignup )
        await Promise.all( remoteWork )
        await confirmAll( linkPath( 'confirm', confirmations()[0].token ) )
        const [prior] = subscriptions()
        sqlite.prepare( `
            INSERT INTO rosetta_app_changes (app_key, app_name, current_status, observed_at)
            VALUES ('example-app', 'Example App', 'native', 1)
        ` ).run()
        sqlite.prepare( `
            INSERT INTO rosetta_notifications (change_id, subscription_id, subscription_created_at, mode, state)
            VALUES (1, ?, ?, 'live', 'accepted')
        ` ).run( prior.id, prior.created_at )
        await request( linkPath( 'unsubscribe', prior.unsubscribe_token ), { method: 'POST' } )

        await signUp( appSignup )
        await signUp( newsSignup )
        await Promise.all( remoteWork )
        const form = await confirmationForm( linkPath( 'confirm', confirmations().at( -1 ).token ) )
        expect( form.interests ).toHaveLength( 2 )
        const response = await submitConfirmation( form, [] )
        expect( response.status ).toBe( 200 )
        expect( await response.text() ).toContain( 'Signups discarded' )
        expect( subscriptions() ).toMatchObject( [{ id: prior.id, confirmed_at: null, unsubscribed_at: expect.any( String ) }] )
        expect( sqlite.prepare( 'SELECT state FROM rosetta_notifications WHERE subscription_id = ?' ).get( prior.id ) )
            .toEqual( { state: 'accepted' } )
    } )

    it( 'expires an interest 72 hours after signup even when the same interest is requested again', async () => {
        const start = Date.now()
        const time = vi.spyOn( Date, 'now' ).mockReturnValue( start )
        const hour = 60 * 60 * 1000
        await signUp( newsSignup )
        const originalRows = subscriptions()
        time.mockReturnValue( start + 71 * hour )
        expect( ( await signUp( newsSignup ) ).status ).toBe( 200 )
        expect( subscriptions() ).toEqual( originalRows )
        await signUp( appSignup )
        mockLiveSender()
        env.ROSETTA_CHECK_TOKEN = 'correct-token'
        expect( ( await check( 'correct-token' ) ).status ).toBe( 200 )
        const path = linkPath( 'confirm', confirmations()[0].token )
        const original = await confirmationForm( path )
        expect( original.interests ).toHaveLength( 2 )

        time.mockReturnValue( start + 72 * hour )
        const current = await confirmationForm( path )
        expect( current.interests ).toEqual( original.interests.slice( 1 ) )
        expect( ( await submitConfirmation( original, original.interests ) ).status ).toBe( 409 )
        expect( subscriptions().every( row => row.confirmed_at === null ) ).toBe( true )
        expect( ( await check( 'correct-token' ) ).status ).toBe( 200 )
        expect( subscriptions().map( row => row.interest_key ) ).toEqual( ['example-app'] )
        expect( ( await submitConfirmation( current, current.interests ) ).status ).toBe( 200 )
    } )

    it( 'prunes expired dry-run signups and cancels empty confirmations before live delivery', async () => {
        const start = Date.now()
        const time = vi.spyOn( Date, 'now' ).mockReturnValue( start )
        await signUp( newsSignup )
        await signUp( { ...newsSignup, email: 'other@example.com' } )
        time.mockReturnValue( start + 72 * 60 * 60 * 1000 )
        await signUp( appSignup )
        expect( subscriptions().map( row => row.kind ) ).toEqual( ['rosetta-news', 'app-status'] )
        expect( confirmations().map( row => row.state ) ).toEqual( ['cancelled', 'pending', 'pending'] )

        mockLiveSender()
        env.ROSETTA_CHECK_TOKEN = 'correct-token'
        expect( ( await ( await check( 'correct-token' ) ).json() ).confirmations ).toMatchObject( { pending: 0, accepted: 1 } )
        expect( confirmations().map( row => row.state ) ).toEqual( ['cancelled', 'cancelled', 'accepted'] )
        expect( subscriptions().map( row => row.interest_key ) ).toEqual( ['example-app'] )
        expect( deliveredMessages().map( message => message.to ) ).toEqual( ['reader@example.com'] )
    } )

    it( 'caps unconfirmed interests per normalized address even when concurrent requests pass both edge limiters', async () => {
        const interests = appInterests( 25 )
        const results = await Promise.all( interests.map( interest => signUp( interest ) ) )
        const accepted = interests.filter( ( _, index ) => results[index].status === 200 )

        expect( accepted ).toHaveLength( 20 )
        expect( results.filter( result => result.status === 409 ) ).toHaveLength( 5 )
        const rows = subscriptions()
        expect( rows.map( row => row.interest_key ).sort() ).toEqual( accepted.map( row => row.key ).sort() )
        expect( rows.every( row => row.email === 'reader@example.com' && row.confirmed_at === null ) ).toBe( true )
        expect( confirmations() ).toHaveLength( 1 )
    } )

    it( 'limits an address to three confirmation sends per rolling day and dispatches queued work when the window clears', async () => {
        const start = Date.now()
        const time = vi.spyOn( Date, 'now' ).mockReturnValue( start )
        const day = 24 * 60 * 60 * 1000
        env.ROSETTA_CHECK_TOKEN = 'correct-token'
        mockLiveSender()
        const interests = appInterests( 4 )

        for ( const interest of interests.slice( 0, 3 ) ) {
            await signUp( interest )
            await Promise.all( remoteWork )
            const path = linkPath( 'confirm', confirmations().at( -1 ).token )
            expect( ( await confirmAll( path ) ).status ).toBe( 200 )
        }
        await signUp( interests[3] )
        await Promise.all( remoteWork )
        expect( deliveredMessages() ).toHaveLength( 3 )
        expect( confirmations().at( -1 ) ).toMatchObject( { state: 'pending', attempted_at: null, valid_until: null } )

        time.mockReturnValue( start + day - 1 )
        expect( ( await ( await check( 'correct-token' ) ).json() ).confirmations ).toMatchObject( { pending: 1, accepted: 0 } )
        expect( deliveredMessages() ).toHaveLength( 3 )
        time.mockReturnValue( start + day )
        expect( ( await ( await check( 'correct-token' ) ).json() ).confirmations ).toMatchObject( { pending: 0, accepted: 1 } )
        expect( deliveredMessages() ).toHaveLength( 4 )
    } )

    it( 'sends confirmations queued in dry-run with a full 48-hour window from live dispatch', async () => {
        const queuedAt = Date.now()
        const time = vi.spyOn( Date, 'now' ).mockReturnValue( queuedAt )
        const lifetime = 48 * 60 * 60 * 1000
        env.ROSETTA_CHECK_TOKEN = 'correct-token'
        await signUp( newsSignup )
        const [queued] = confirmations()
        const path = linkPath( 'confirm', queued.token )
        expect( ( await request( path ) ).status ).toBe( 400 )

        const sentAt = queuedAt + lifetime / 2
        time.mockReturnValue( sentAt )
        mockLiveSender()
        expect( ( await ( await check( 'correct-token' ) ).json() ).confirmations ).toMatchObject( { pending: 0, accepted: 1 } )
        expect( deliveredMessages() ).toHaveLength( 1 )
        expect( confirmations()[0] ).toMatchObject( { token: queued.token, attempted_at: sentAt, valid_until: sentAt + lifetime } )
        time.mockReturnValue( sentAt + lifetime - 1 )
        expect( ( await request( path ) ).status ).toBe( 200 )
        time.mockReturnValue( sentAt + lifetime )
        expect( ( await request( path ) ).status ).toBe( 400 )
    } )
} )

describe( 'Rosetta check triggers', () => {
    it( 'requires a configured bearer token and establishes a baseline after deploy', async () => {
        expect( ( await check() ).status ).toBe( 401 )
        env.ROSETTA_CHECK_TOKEN = 'correct-token'
        expect( ( await check( 'wrong-token' ) ).status ).toBe( 401 )
        expect( fetchUpstream ).not.toHaveBeenCalled()

        const result = await check( 'correct-token' )
        expect( result.status ).toBe( 200 )
        expect( await result.json() ).toMatchObject( { ok: true, changes: 0, notifications: 0, mode: 'dry-run' } )
        expect( fetchUpstream ).toHaveBeenCalledTimes( 1 )
        expect( sqlite.prepare( 'SELECT status FROM rosetta_app_snapshot' ).get().status ).toBe( 'rosetta' )
    } )

    it( 'returns the refusal reason and counts to the authenticated caller', async () => {
        env.ROSETTA_CHECK_TOKEN = 'correct-token'
        catalog = [app, { ...app, endpoint: '/app/other-app' }]
        expect( ( await check( 'correct-token' ) ).status ).toBe( 200 )
        catalog = [app]
        const result = await check( 'correct-token' )
        expect( result.status ).toBe( 409 )
        expect( await result.json() ).toMatchObject( {
            ok: false, observation: { status: 'refused', reason: 'catalog-shrank', previousCount: 2, incomingCount: 1 }
        } )
    } )

    it( 'reports a blocked sender and leaves confirmations pending for retry', async () => {
        await signUp( newsSignup )
        mockLiveSender()
        providerStatus = 403
        env.ROSETTA_CHECK_TOKEN = 'correct-token'
        const result = await check( 'correct-token' )
        expect( result.status ).toBe( 502 )
        expect( await result.json() ).toMatchObject( { ok: false, confirmations: { blocked: true, pending: 1 } } )
        expect( confirmations()[0] ).toMatchObject( { state: 'pending', valid_until: null } )
        expect( subscriptions()[0].confirmed_at ).toBeNull()

        launch.enabled = false
        providerStatus = 200
        expect( ( await check( 'correct-token' ) ).status ).toBe( 200 )
        expect( confirmations()[0].state ).toBe( 'pending' )
        expect( deliveredMessages() ).toHaveLength( 1 )
    } )

    it( 'uses the same baseline check for its scheduled event', async () => {
        const log = vi.spyOn( console, 'info' ).mockImplementation( () => {} )
        catalog = [{ ...app, status: 'native' }]

        await subscriptionWorker.scheduled( { cron: '0 14 * * *' }, env )

        expect( sqlite.prepare( 'SELECT status FROM rosetta_app_snapshot' ).get().status ).toBe( 'native' )
        expect( log ).toHaveBeenCalledWith( 'Scheduled Rosetta check completed.', expect.objectContaining( {
            mode: 'dry-run', changes: 0, notifications: 0
        } ) )
    } )
} )
