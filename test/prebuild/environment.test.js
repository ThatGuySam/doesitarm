import { describe, expect, it } from 'vitest'

import {
    isBrowserContext,
    isDarwin,
    isLinux
} from '~/helpers/environment.js'

describe( 'environment helpers', () => {
    it( 'does not treat Node 22 navigator as a browser runtime', () => {
        expect( isBrowserContext() ).toBe( false )
    })

    it( 'detects darwin directly from process.platform', () => {
        expect( isDarwin() ).toBe( process.platform === 'darwin' )
    })

    it( 'detects linux-like runtimes directly from process.platform', () => {
        expect( isLinux() ).toBe([
            'linux',
            'openbsd'
        ].includes( process.platform ) )
    })
})
