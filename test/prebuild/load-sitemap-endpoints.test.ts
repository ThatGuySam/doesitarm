import {
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest'

import axios from 'axios'

import {
    fetchJsonWithRetries,
    shouldRetryError
} from '~/helpers/pagefind/load-sitemap-endpoints'

vi.mock( 'axios', () => {
    return {
        default: {
            get: vi.fn()
        }
    }
} )

describe( 'load sitemap endpoints helper', () => {
    beforeEach( () => {
        vi.mocked( axios.get ).mockReset()
    } )

    it( 'retries transient 5xx errors and eventually resolves', async () => {
        const axiosGet = vi.mocked( axios.get )

        axiosGet
            .mockRejectedValueOnce({
                response: {
                    status: 502
                }
            })
            .mockResolvedValueOnce({
                data: {
                    ok: true
                }
            } )

        const data = await fetchJsonWithRetries( 'https://api.doesitarm.com/sitemap-endpoints.json', {
            attempts: 2,
            delayMs: 0
        } )

        expect( data ).toEqual({
            ok: true
        } )
        expect( axiosGet ).toHaveBeenCalledTimes( 2 )
    } )

    it( 'does not retry non-5xx errors', async () => {
        const axiosGet = vi.mocked( axios.get )

        axiosGet.mockRejectedValueOnce({
            response: {
                status: 404
            }
        })

        await expect( fetchJsonWithRetries( 'https://api.doesitarm.com/sitemap-endpoints.json', {
            attempts: 3,
            delayMs: 0
        } ) ).rejects.toEqual({
            response: {
                status: 404
            }
        })

        expect( axiosGet ).toHaveBeenCalledTimes( 1 )
    } )

    it( 'classifies retryable server errors', () => {
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
