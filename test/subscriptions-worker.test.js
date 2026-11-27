import {
    describe,
    expect,
    it,
    vi
} from 'vitest'

import subscriptionWorker, {
    handleRequest
} from '~/workers/subscriptions/src/index.js'
import {
    subscribeToKit
} from '~/workers/subscriptions/src/kit.js'

function makeDatabase () {
    const calls = []

    return {
        calls,
        prepare ( sql ) {
            const call = {
                bindings: [],
                sql
            }
            calls.push( call )

            return {
                bind ( ...bindings ) {
                    call.bindings = bindings

                    return this
                },
                async first () {
                    return {
                        healthy: 1
                    }
                },
                async run () {
                    return {
                        success: true
                    }
                }
            }
        }
    }
}

function makeRequest ( body, options = {} ) {
    return new Request( 'https://doesitarm.com/api/subscriptions', {
        body: body === undefined
            ? undefined
            : JSON.stringify( body ),
        headers: {
            'Content-Type': 'application/json',
            'Origin': 'https://doesitarm.com',
            ...options.headers
        },
        method: options.method || 'POST'
    } )
}

describe( 'Cloudflare subscription Worker', () => {
    it( 'stores a normalized email with a prepared statement', async () => {
        const database = makeDatabase()
        const request = makeRequest({
            email: '  Person@Example.COM  ',
            website: ''
        })

        const response = await handleRequest( request, {
            SUBSCRIPTIONS_DB: database
        } )
        const responseText = await response.text()

        expect( response.status ).toBe( 200 )
        expect( JSON.parse( responseText ) ).toEqual({
            confirmationSent: false,
            ok: true
        } )
        expect( responseText ).not.toContain( 'person@example.com' )
        expect( database.calls ).toHaveLength( 1 )
        expect( database.calls[0].sql ).toContain( 'ON CONFLICT (email)' )
        expect( database.calls[0].bindings ).toEqual([
            'person@example.com'
        ] )
    } )

    it( 'rejects invalid email without querying D1', async () => {
        const database = makeDatabase()
        const response = await handleRequest( makeRequest({
            email: 'not-an-email'
        }), {
            SUBSCRIPTIONS_DB: database
        } )

        expect( response.status ).toBe( 422 )
        expect( database.calls ).toHaveLength( 0 )
    } )

    it( 'silently accepts the honeypot without storing data', async () => {
        const database = makeDatabase()
        const response = await handleRequest( makeRequest({
            email: 'bot@example.com',
            website: 'https://spam.example'
        }), {
            SUBSCRIPTIONS_DB: database
        } )

        expect( response.status ).toBe( 200 )
        expect( database.calls ).toHaveLength( 0 )
    } )

    it( 'rejects disallowed browser origins', async () => {
        const database = makeDatabase()
        const response = await handleRequest( makeRequest({
            email: 'person@example.com'
        }, {
            headers: {
                'Origin': 'https://example.com'
            }
        }), {
            SUBSCRIPTIONS_DB: database
        } )

        expect( response.status ).toBe( 403 )
        expect( response.headers.get( 'Access-Control-Allow-Origin' ) ).toBeNull()
        expect( database.calls ).toHaveLength( 0 )
    } )

    it( 'returns scoped CORS headers for the Netlify fallback', async () => {
        const request = makeRequest( undefined, {
            headers: {
                'Origin': 'https://master--doesitarm.netlify.app'
            },
            method: 'OPTIONS'
        } )
        const response = await handleRequest( request, {
            SUBSCRIPTIONS_DB: makeDatabase()
        } )

        expect( response.status ).toBe( 204 )
        expect( response.headers.get( 'Access-Control-Allow-Origin' ) )
            .toBe( 'https://master--doesitarm.netlify.app' )
        expect( response.headers.get( 'Access-Control-Allow-Methods' ) )
            .toBe( 'POST, OPTIONS' )
    } )

    it( 'checks the D1 binding without exposing subscriber data', async () => {
        const database = makeDatabase()
        const request = new Request(
            'https://doesitarm.com/api/subscriptions/health'
        )
        const response = await handleRequest( request, {
            SUBSCRIPTIONS_DB: database
        } )

        expect( response.status ).toBe( 200 )
        expect( await response.json() ).toEqual({
            ok: true,
            service: 'doesitarm-subscriptions'
        } )
        expect( database.calls[0].sql ).toBe( 'SELECT 1 AS healthy' )
    } )

    it( 'returns a generic response when D1 is unavailable', async () => {
        const consoleError = vi
            .spyOn( console, 'error' )
            .mockImplementation( () => {} )
        const request = makeRequest({
            email: 'person@example.com'
        })
        const response = await subscriptionWorker.fetch( request, {
            SUBSCRIPTIONS_DB: {
                prepare () {
                    throw new Error( 'Database detail that must stay private.' )
                }
            }
        } )
        const responseText = await response.text()

        expect( response.status ).toBe( 503 )
        expect( responseText ).not.toContain( 'Database detail' )
        expect( consoleError ).toHaveBeenCalledTimes( 1 )

        consoleError.mockRestore()
    } )
} )


describe( 'Kit forwarding', () => {
    const kitEnv = {
        KIT_API_KEY: 'test-key',
        KIT_FORM_ID: '123'
    }

    function makeKitFetch ( statuses = [ 201, 201 ] ) {
        const calls = []
        const fetchImpl = vi.fn( async ( url, init ) => {
            calls.push({ url, init, body: JSON.parse( init.body ) })
            return new Response( '{}', { status: statuses[ calls.length - 1 ] } )
        } )
        return { calls, fetchImpl }
    }

    it( 'does nothing until Kit is configured', async () => {
        const { calls, fetchImpl } = makeKitFetch()

        await expect( subscribeToKit( 'a@example.com', {}, fetchImpl ) )
            .resolves.toEqual({ sent: false, reason: 'not-configured' })
        await expect( subscribeToKit( 'a@example.com', { KIT_API_KEY: 'k', KIT_FORM_ID: 'abc' }, fetchImpl ) )
            .resolves.toMatchObject({ sent: false })
        expect( calls ).toHaveLength( 0 )
    })

    it( 'creates an inactive subscriber, then adds them to the form', async () => {
        const { calls, fetchImpl } = makeKitFetch()

        const result = await subscribeToKit( 'a@example.com', kitEnv, fetchImpl )

        expect( result ).toEqual({ sent: true, alreadyOnForm: false })
        expect( calls.map( call => call.url ) ).toEqual([
            'https://api.kit.com/v4/subscribers',
            'https://api.kit.com/v4/forms/123/subscribers'
        ])
        expect( calls[0].body ).toEqual({ email_address: 'a@example.com', state: 'inactive' })
        expect( calls[1].body.email_address ).toBe( 'a@example.com' )
        expect( calls[0].init.headers['X-Kit-Api-Key'] ).toBe( 'test-key' )
    })

    it( 'throws a status-only error when Kit rejects', async () => {
        const { fetchImpl } = makeKitFetch([ 422 ])
        const error = await subscribeToKit( 'a@example.com', kitEnv, fetchImpl ).catch( caught => caught )

        expect( error.message ).toMatch( /422/ )
        expect( error.message ).not.toMatch( /example\.com/ )
    })

    it( 'still stores the signup when Kit is down', async () => {
        const database = makeDatabase()
        const originalFetch = globalThis.fetch
        globalThis.fetch = vi.fn( async () => new Response( '', { status: 500 } ) )
        const errorSpy = vi.spyOn( console, 'error' ).mockImplementation( () => {} )

        try {
            const response = await handleRequest( makeRequest({ email: 'b@example.com', website: '' }), {
                SUBSCRIPTIONS_DB: database,
                ...kitEnv
            } )

            expect( response.status ).toBe( 200 )
            expect( await response.json() ).toEqual({ confirmationSent: false, ok: true })
            expect( database.calls ).toHaveLength( 1 )
        } finally {
            globalThis.fetch = originalFetch
            errorSpy.mockRestore()
        }
    })

    it( 'reports a sent confirmation when Kit accepts', async () => {
        const originalFetch = globalThis.fetch
        globalThis.fetch = vi.fn( async () => new Response( '{}', { status: 201 } ) )

        try {
            const response = await handleRequest( makeRequest({ email: 'c@example.com', website: '' }), {
                SUBSCRIPTIONS_DB: makeDatabase(),
                ...kitEnv
            } )

            expect( await response.json() ).toEqual({ confirmationSent: true, ok: true })
        } finally {
            globalThis.fetch = originalFetch
        }
    })
})
