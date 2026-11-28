import {
    describe,
    expect,
    it
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
        expect( env.SUBSCRIPTIONS_DB.calls[0].bindings ).toEqual( [ 'click', 'audio', 'b1', 'primary', '/app/native-access/' ] )
    } )

    it( 'drops the query string from the page path', async () => {
        const env = makeEnv()
        await handleRequest( post( '/api/subscriptions/service-events', { ...event, path: '/services/studio-upgrade-audit/?email=a@b.co' } ), env )

        expect( env.SUBSCRIPTIONS_DB.calls[0].bindings[4] ).toBe( '/services/studio-upgrade-audit/' )
    } )

    it( 'rejects unknown events and bad ids', async () => {
        for ( const body of [ { ...event, event: 'view' }, { ...event, variant: 'B 1' }, { ...event, card: '' }, 'not json' ] ) {
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
