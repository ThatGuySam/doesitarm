import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest'

import {
    getJson,
    getText,
    headOk,
    postJson,
    requestJson,
    shouldRetryError
} from '~/helpers/http.js'

describe( 'http helper', () => {
    const fetchMock = vi.fn()

    beforeEach( () => {
        vi.stubGlobal( 'fetch', fetchMock )
    } )

    afterEach( () => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
        fetchMock.mockReset()
    } )

    it( 'retries transient 5xx errors and eventually resolves JSON', async () => {
        fetchMock
            .mockResolvedValueOnce( new Response( JSON.stringify({
                ok: false
            }), {
                headers: {
                    'Content-Type': 'application/json'
                },
                status: 502
            } ) )
            .mockResolvedValueOnce( new Response( JSON.stringify({
                ok: true
            }), {
                headers: {
                    'Content-Type': 'application/json'
                },
                status: 200
            } ) )

        await expect( getJson( 'https://api.doesitarm.com/sitemap-endpoints.json', {
            attempts: 2,
            delayMs: 0
        } ) ).resolves.toEqual({
            ok: true
        } )

        expect( fetchMock ).toHaveBeenCalledTimes( 2 )
    } )

    it( 'does not retry non-5xx errors', async () => {
        fetchMock.mockResolvedValueOnce( new Response( JSON.stringify({
            ok: false
        }), {
            headers: {
                'Content-Type': 'application/json'
            },
            status: 404
        } ) )

        await expect( getJson( 'https://api.doesitarm.com/sitemap-endpoints.json', {
            attempts: 3,
            delayMs: 0
        } ) ).rejects.toMatchObject({
            response: {
                status: 404
            }
        })

        expect( fetchMock ).toHaveBeenCalledTimes( 1 )
    } )

    it( 'returns text responses', async () => {
        fetchMock.mockResolvedValueOnce( new Response( '<xml />', {
            headers: {
                'Content-Type': 'application/xml'
            },
            status: 200
        } ) )

        await expect( getText( 'https://doesitarm.com/sitemap.xml' ) ).resolves.toBe( '<xml />' )
    } )

    it( 'posts JSON payloads and parses JSON responses', async () => {
        fetchMock.mockResolvedValueOnce( new Response( JSON.stringify({
            supportedVersionNumber: '2.1.0'
        }), {
            headers: {
                'Content-Type': 'application/json'
            },
            status: 200
        } ) )

        await expect( postJson( 'https://doesitarm.com/api/test-results', {
            filename: 'App.zip'
        } ) ).resolves.toEqual({
            supportedVersionNumber: '2.1.0'
        } )

        expect( fetchMock ).toHaveBeenCalledWith(
            'https://doesitarm.com/api/test-results',
            expect.objectContaining({
                body: JSON.stringify({
                    filename: 'App.zip'
                }),
                method: 'POST'
            })
        )
    } )

    it( 'supports config-object JSON requests for the API client', async () => {
        fetchMock.mockResolvedValueOnce( new Response( JSON.stringify({
            ok: true
        }), {
            headers: {
                'Content-Type': 'application/json'
            },
            status: 200
        } ) )

        await expect( requestJson({
            method: 'GET',
            url: 'https://doesitarm.com/api/app/spotify.json'
        }) ).resolves.toEqual({
            ok: true
        } )
    } )

    it( 'maps head requests to booleans', async () => {
        fetchMock
            .mockResolvedValueOnce( new Response( null, {
                status: 200
            } ) )
            .mockResolvedValueOnce( new Response( null, {
                status: 404
            } ) )

        await expect( headOk( 'https://doesitarm.com/sitemap.xml' ) ).resolves.toBe( true )
        await expect( headOk( 'https://doesitarm.com/missing.xml' ) ).resolves.toBe( false )
    } )

    it( 'classifies retryable errors by HTTP status', () => {
        expect( shouldRetryError( {
            response: {
                status: 502
            }
        } ) ).toBe( true )
        expect( shouldRetryError( {
            response: {
                status: 503
            }
        } ) ).toBe( true )
        expect( shouldRetryError( {
            response: {
                status: 404
            }
        } ) ).toBe( false )
        expect( shouldRetryError( new Error( 'network' ) ) ).toBe( false )
    } )
} )
