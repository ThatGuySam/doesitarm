import {
    afterEach,
    describe,
    expect,
    it,
    vi
} from 'vitest'

import { handleRequest } from '~/workers/subscriptions/src/index.js'

function makeDatabase () {
    const calls = []

    return {
        calls,
        prepare ( sql ) {
            const call = { bindings: [], sql }
            calls.push( call )

            return {
                bind ( ...bindings ) {
                    call.bindings = bindings
                    return this
                },
                async first () {
                    return null
                },
                async run () {
                    return { success: true }
                }
            }
        }
    }
}

const allow = { limit: async () => ( { success: true } ) }
const deny = { limit: async () => ( { success: false } ) }

function makeEnv ( overrides = {} ) {
    return {
        SUBSCRIPTIONS_DB: makeDatabase(),
        INTEREST_IP_RATE_LIMIT: allow,
        INTEREST_EMAIL_RATE_LIMIT: allow,
        SERVICE_EVENT_RATE_LIMIT: allow,
        ...overrides
    }
}

function post ( path, body, { origin = 'https://doesitarm.com', contentType = 'application/json' } = {} ) {
    const headers = { 'Content-Type': contentType }
    if ( origin ) headers.Origin = origin

    return new Request( `https://doesitarm.com${ path }`, {
        method: 'POST',
        headers,
        body: typeof body === 'string' ? body : JSON.stringify( body )
    } )
}

const event = {
    event: 'click',
    card: 'audio',
    variant: 'b1',
    control: 'primary',
    path: '/app/native-access/'
}

describe( 'service card events', () => {
    it( 'stores an anonymous event sent by sendBeacon as text/plain', async () => {
        const env = makeEnv()
        const response = await handleRequest( post( '/api/subscriptions/service-events', event, { contentType: 'text/plain;charset=UTF-8' } ), env )

        expect( response.status ).toBe( 200 )
        expect( env.SUBSCRIPTIONS_DB.calls ).toHaveLength( 1 )
        expect( env.SUBSCRIPTIONS_DB.calls[0].sql ).toContain( 'INSERT INTO service_events' )
        expect( env.SUBSCRIPTIONS_DB.calls[0].bindings ).toEqual( [ 'click', 'audio', 'b1', 'primary', '', '', '/app/native-access/' ] )
    } )

    it( 'records the experiment, browser and first exposure of an impression', async () => {
        const env = makeEnv()
        const browser = '3f2b8c1e-5d4a-4b6f-9a7e-2c1d0e9f8a7b'
        const impression = { ...event, event: 'impression', control: '', experiment: 'audio-headlines-v1', browser }
        const response = await handleRequest( post( '/api/subscriptions/service-events', impression ), env )

        expect( response.status ).toBe( 200 )
        expect( env.SUBSCRIPTIONS_DB.calls ).toHaveLength( 2 )
        expect( env.SUBSCRIPTIONS_DB.calls[0].bindings ).toEqual( [ 'impression', 'audio', 'b1', '', 'audio-headlines-v1', browser, '/app/native-access/' ] )
        expect( env.SUBSCRIPTIONS_DB.calls[1].sql ).toContain( 'INSERT OR IGNORE INTO service_exposures' )
        expect( env.SUBSCRIPTIONS_DB.calls[1].bindings ).toEqual( [ 'audio-headlines-v1', 'audio', browser, 'b1', '/app/native-access/' ] )
    } )

    it( 'does not record an exposure for clicks or impressions without a browser id', async () => {
        for ( const body of [ { ...event, browser: '3f2b8c1e5d4a4b6f9a7e2c1d0e9f8a7b' }, { ...event, event: 'impression', control: '' } ] ) {
            const env = makeEnv()
            await handleRequest( post( '/api/subscriptions/service-events', body ), env )
            expect( env.SUBSCRIPTIONS_DB.calls ).toHaveLength( 1 )
        }
    } )

    it( 'drops the query string from the page path', async () => {
        const env = makeEnv()
        await handleRequest( post( '/api/subscriptions/service-events', { ...event, path: '/services/studio-upgrade-audit/?email=a@b.co' } ), env )

        expect( env.SUBSCRIPTIONS_DB.calls[0].bindings[6] ).toBe( '/services/studio-upgrade-audit/' )
    } )

    it( 'rejects unknown events and bad ids', async () => {
        for ( const body of [ { ...event, event: 'view' }, { ...event, variant: 'B 1' }, { ...event, card: '' },
            { ...event, browser: 'not a browser id' }, { ...event, experiment: 'Bad Id' }, 'not json' ] ) {
            const env = makeEnv()
            const response = await handleRequest( post( '/api/subscriptions/service-events', body ), env )
            expect( response.status ).toBe( 422 )
            expect( env.SUBSCRIPTIONS_DB.calls ).toHaveLength( 0 )
        }
    } )

    it( 'requires an allowed origin', async () => {
        const env = makeEnv()
        const response = await handleRequest( post( '/api/subscriptions/service-events', event, { origin: null } ), env )

        expect( response.status ).toBe( 403 )
        expect( env.SUBSCRIPTIONS_DB.calls ).toHaveLength( 0 )
    } )

    it( 'rate limits events per connection', async () => {
        const env = makeEnv( { SERVICE_EVENT_RATE_LIMIT: deny } )
        const response = await handleRequest( post( '/api/subscriptions/service-events', event ), env )

        expect( response.status ).toBe( 429 )
    } )
} )

const scopeRequest = {
    email: ' Producer@Example.com ',
    offer: 'studio-upgrade-audit',
    kind: 'scope',
    moveDate: '2027-01',
    daw: 'Logic Pro 11.2',
    plugin: 'Omnisphere 2',
    card: 'service-page',
    variant: 'b1',
    source: '/services/studio-upgrade-audit/',
    website: ''
}

describe( 'service requests', () => {
    it( 'stores a scope request with its setup details', async () => {
        const env = makeEnv()
        const response = await handleRequest( post( '/api/subscriptions/service-requests', scopeRequest ), env )
        const body = await response.json()

        expect( response.status ).toBe( 200 )
        expect( body ).toEqual( { ok: true } )
        const [ call ] = env.SUBSCRIPTIONS_DB.calls
        expect( call.sql ).toContain( 'INSERT INTO service_requests' )
        expect( call.bindings ).toEqual( [
            'producer@example.com',
            'studio-upgrade-audit',
            'scope',
            '',
            JSON.stringify( { moveDate: '2027-01', daw: 'Logic Pro 11.2', plugin: 'Omnisphere 2' } ),
            'service-page',
            'b1',
            '/services/studio-upgrade-audit/'
        ] )
    } )

    it( 'accepts a revival form post for an app', async () => {
        const env = makeEnv()
        const form = new URLSearchParams( {
            email: 'fan@example.com', offer: 'app-revival', kind: 'revival', app: 'true-fi',
            note: 'Headphone EQ', card: 'revival', variant: 'r1', source: '/app/true-fi/'
        } ).toString()
        const response = await handleRequest( post( '/api/subscriptions/service-requests', form, { contentType: 'application/x-www-form-urlencoded' } ), env )

        expect( response.status ).toBe( 200 )
        expect( env.SUBSCRIPTIONS_DB.calls[0].bindings.slice( 1, 4 ) ).toEqual( [ 'app-revival', 'revival', 'true-fi' ] )
    } )

    it( 'rejects unknown offers, mismatched kinds and long fields', async () => {
        const bad = [
            { ...scopeRequest, offer: 'free-money' },
            { ...scopeRequest, kind: 'revival' },
            { ...scopeRequest, offer: 'app-revival', kind: 'revival' },
            { ...scopeRequest, offer: 'app-revival', kind: 'revival', appName: '   ' },
            { ...scopeRequest, note: 'x'.repeat( 501 ) },
            { ...scopeRequest, source: 'https://evil.example/' }
        ]
        for ( const body of bad ) {
            const env = makeEnv()
            const response = await handleRequest( post( '/api/subscriptions/service-requests', body ), env )
            expect( response.status ).toBe( 422 )
            expect( env.SUBSCRIPTIONS_DB.calls ).toHaveLength( 0 )
        }
    } )

    it( 'rejects an invalid email and accepts the honeypot silently', async () => {
        const invalid = makeEnv()
        expect( ( await handleRequest( post( '/api/subscriptions/service-requests', { ...scopeRequest, email: 'nope' } ), invalid ) ).status ).toBe( 422 )

        const bot = makeEnv()
        expect( ( await handleRequest( post( '/api/subscriptions/service-requests', { ...scopeRequest, website: 'x' } ), bot ) ).status ).toBe( 200 )
        expect( bot.SUBSCRIPTIONS_DB.calls ).toHaveLength( 0 )
    } )

    it( 'stays open while the Rosetta launch switch is off', async () => {
        const env = makeEnv()
        const response = await handleRequest( post( '/api/subscriptions/service-requests', { ...scopeRequest, kind: 'waitlist' } ), env )

        expect( response.status ).toBe( 200 )
    } )
} )

describe( 'service request offers', () => {
    it( 'accepts a waitlist for each new service page offer', async () => {
        for ( const offer of [ 'mac-fleet-readiness', 'audio-session-rescue', 'legacy-studio-hardware', 'windows-arm-purchase-check', 'verified-test-report' ] ) {
            const env = makeEnv()
            const response = await handleRequest( post( '/api/subscriptions/service-requests', {
                email: 'admin@example.com', offer, kind: 'waitlist', note: 'macOS 27', card: 'service-page', variant: 'direct', source: `/services/${ offer }/`
            } ), env )
            expect( response.status, offer ).toBe( 200 )
            expect( env.SUBSCRIPTIONS_DB.calls[0].bindings[1] ).toBe( offer )
        }
    } )

    it( 'accepts a revival request that names the app instead of a listing', async () => {
        const env = makeEnv()
        const response = await handleRequest( post( '/api/subscriptions/service-requests', {
            email: 'fan@example.com', offer: 'app-revival', kind: 'revival', appName: 'Aperture', note: 'Old libraries',
            card: 'service-page', variant: 'direct', source: '/services/abandoned-app-revival/'
        } ), env )

        expect( response.status ).toBe( 200 )
        expect( env.SUBSCRIPTIONS_DB.calls[0].bindings[3] ).toBe( '' )
        expect( JSON.parse( env.SUBSCRIPTIONS_DB.calls[0].bindings[4] ) ).toEqual( { appName: 'Aperture', note: 'Old libraries' } )
    } )

    it( 'stores the app slug from a prefilled revival page with the app name', async () => {
        const env = makeEnv()
        const response = await handleRequest( post( '/api/subscriptions/service-requests', {
            email: 'fan@example.com', offer: 'app-revival', kind: 'revival', app: 'true-fi', appName: 'True-Fi',
            card: 'service-page', variant: 'r1', source: '/services/abandoned-app-revival/'
        } ), env )

        expect( response.status ).toBe( 200 )
        expect( env.SUBSCRIPTIONS_DB.calls[0].bindings.slice( 1, 4 ) ).toEqual( [ 'app-revival', 'revival', 'true-fi' ] )
        expect( JSON.parse( env.SUBSCRIPTIONS_DB.calls[0].bindings[4] ) ).toEqual( { appName: 'True-Fi' } )
    } )
} )

describe( 'service request Turnstile', () => {
    afterEach( () => vi.unstubAllGlobals() )

    function stubSiteverify ( result ) {
        const fetchMock = vi.fn( async () => Response.json( result ) )
        vi.stubGlobal( 'fetch', fetchMock )
        return fetchMock
    }

    it( 'stores the request when Cloudflare accepts the token', async () => {
        const fetchMock = stubSiteverify( { success: true, hostname: 'doesitarm.com' } )
        const env = makeEnv( { TURNSTILE_SECRET: 'secret' } )
        const response = await handleRequest( post( '/api/subscriptions/service-requests', { ...scopeRequest, turnstile: 'token-1' } ), env )

        expect( response.status ).toBe( 200 )
        expect( fetchMock ).toHaveBeenCalledOnce()
        expect( String( fetchMock.mock.calls[0][0] ) ).toContain( 'turnstile/v0/siteverify' )
        expect( fetchMock.mock.calls[0][1].body.get( 'response' ) ).toBe( 'token-1' )
        expect( env.SUBSCRIPTIONS_DB.calls ).toHaveLength( 1 )
    } )

    it( 'rejects a missing, failed or foreign-host token without storing it', async () => {
        const cases = [
            [ undefined, { success: true, hostname: 'doesitarm.com' } ],
            [ 'token', { success: false, hostname: 'doesitarm.com' } ],
            [ 'token', { success: true, hostname: 'evil.example' } ]
        ]
        for ( const [ turnstile, result ] of cases ) {
            stubSiteverify( result )
            const env = makeEnv( { TURNSTILE_SECRET: 'secret' } )
            const response = await handleRequest( post( '/api/subscriptions/service-requests', { ...scopeRequest, turnstile } ), env )
            expect( response.status ).toBe( 403 )
            expect( env.SUBSCRIPTIONS_DB.calls ).toHaveLength( 0 )
        }
    } )

    it( 'skips the check while the secret is unset', async () => {
        const fetchMock = stubSiteverify( { success: false } )
        const env = makeEnv()
        const response = await handleRequest( post( '/api/subscriptions/service-requests', scopeRequest ), env )

        expect( response.status ).toBe( 200 )
        expect( fetchMock ).not.toHaveBeenCalled()
    } )
} )

describe( 'service request email', () => {
    it( 'emails the request details to the configured address', async () => {
        const sent = []
        const env = makeEnv( {
            SERVICE_EMAIL: { send: async message => { sent.push( message ) } },
            SERVICE_NOTIFY_TO: 'owner@example.net',
            SERVICE_NOTIFY_FROM: 'services@doesitarm.com'
        } )
        const response = await handleRequest( post( '/api/subscriptions/service-requests', scopeRequest ), env )

        expect( response.status ).toBe( 200 )
        expect( sent ).toHaveLength( 1 )
        expect( sent[0].to ).toBe( 'owner@example.net' )
        expect( sent[0].from.email ).toBe( 'services@doesitarm.com' )
        expect( sent[0].replyTo ).toBe( 'producer@example.com' )
        expect( sent[0].subject ).toBe( 'New service request: studio-upgrade-audit (scope)' )
        for ( const text of [ 'Offer: studio-upgrade-audit', 'Kind: scope', 'Card: service-page / variant b1', 'From: producer@example.com', 'plugin: Omnisphere 2', 'Time: ' ] ) {
            expect( sent[0].text ).toContain( text )
        }
    } )

    it( 'still accepts the request when the email fails', async () => {
        const env = makeEnv( {
            SERVICE_EMAIL: { send: async () => { throw new Error( 'destination not verified' ) } },
            SERVICE_NOTIFY_TO: 'owner@example.net',
            SERVICE_NOTIFY_FROM: 'services@doesitarm.com'
        } )
        const response = await handleRequest( post( '/api/subscriptions/service-requests', scopeRequest ), env )

        expect( response.status ).toBe( 200 )
        expect( await response.json() ).toEqual( { ok: true } )
    } )
} )
