import { describe, expect, it } from 'vitest'

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
} )
