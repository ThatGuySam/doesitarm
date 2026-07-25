import {
    describe,
    expect,
    it,
    vi
} from 'vitest'

import subscriptionWorker, {
    handleRequest
} from '~/workers/subscriptions/src/index.js'

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
