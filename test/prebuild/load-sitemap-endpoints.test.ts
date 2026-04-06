import {
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest'

import fs from 'fs-extra'

import {
    loadSitemapEndpoints
} from '~/helpers/pagefind/load-sitemap-endpoints'
import { getJson } from '~/helpers/http.js'

vi.mock( 'fs-extra', () => {
    return {
        default: {
            pathExists: vi.fn(),
            readJson: vi.fn()
        }
    }
} )

vi.mock( '~/helpers/http.js', () => {
    return {
        getJson: vi.fn(),
        shouldRetryError: vi.fn()
    }
} )

describe( 'load sitemap endpoints', () => {
    beforeEach( () => {
        vi.mocked( fs.pathExists ).mockReset()
        vi.mocked( fs.readJson ).mockReset()
        vi.mocked( getJson ).mockReset()
    } )

    it( 'reads the local sitemap-endpoints file when it exists', async () => {
        vi.mocked( fs.pathExists ).mockResolvedValueOnce( true )
        vi.mocked( fs.readJson ).mockResolvedValueOnce({
            endpoints: [ '/api/app/spotify.json' ]
        } )

        await expect( loadSitemapEndpoints() ).resolves.toEqual({
            endpoints: [ '/api/app/spotify.json' ]
        })

        expect( getJson ).not.toHaveBeenCalled()
    } )

    it( 'falls back to the remote sitemap-endpoints JSON when the local file is missing', async () => {
        vi.mocked( fs.pathExists ).mockResolvedValueOnce( false )
        vi.mocked( getJson ).mockResolvedValueOnce({
            endpoints: [ '/api/app/electron-framework.json' ]
        } )
        process.env.PUBLIC_API_DOMAIN = 'https://api.doesitarm.com'

        await expect( loadSitemapEndpoints() ).resolves.toEqual({
            endpoints: [ '/api/app/electron-framework.json' ]
        } )

        expect( getJson ).toHaveBeenCalledWith( 'https://api.doesitarm.com/sitemap-endpoints.json', {
            attempts: 3,
            delayMs: 1000
        })
    } )
} )
