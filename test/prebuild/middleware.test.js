import { describe, expect, it, vi } from 'vitest'

import { catchRedirectResponse } from '../../helpers/astro/request.js'
import {
    getRedirectRule,
    isProductionHostname
} from '../../src/middleware-rules.js'

describe( 'site middleware', () => {
    it.each([
        [ '/categories', '/categories/' ],
        [ '/games', '/games/' ],
        [ '/app/node', '/app/nodejs' ]
    ])( 'redirects %s to %s', ( path, expectedLocation ) => {
        const rule = getRedirectRule( path )

        expect( rule.status ).toBe( 301 )
        expect( rule.to ).toBe( expectedLocation )
    } )

    it( 'recognizes production hosts', () => {
        expect( isProductionHostname( 'doesitarm.com' ) ).toBe( true )
        expect( isProductionHostname( 'www.doesitarm.com' ) ).toBe( true )
    } )

    it( 'does not recognize preview hosts as production', () => {
        expect( isProductionHostname( 'cf.doesitarm.com' ) ).toBe( false )
        expect( isProductionHostname( 'doesitarm-preview.workers.dev' ) ).toBe( false )
    } )

    it( 'resolves redirects without reading Netlify runtime config', async () => {
        const redirect = vi.fn()

        const response = await catchRedirectResponse({
            request: {
                url: 'https://doesitarm.com/app/electron'
            },
            redirect
        })

        expect( response ).toBeUndefined()
        expect( redirect ).toHaveBeenCalledWith( '/app/electron-framework', 301 )
    } )
} )
