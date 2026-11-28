import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { INFO_PLIST_ALLOWED_KEYS } from '../../helpers/scan-allowlist.js'

const privacy = readFileSync( new URL( '../../src/pages/privacy.astro', import.meta.url ), 'utf8' )
const terms = readFileSync( new URL( '../../src/pages/terms.astro', import.meta.url ), 'utf8' )

describe( 'legal pages', () => {
    it( 'privacy policy describes every allowlisted scan key', () => {
        expect( privacy ).toContain( "import { INFO_PLIST_ALLOWED_KEYS, MAX_VALUE_LENGTH } from '~/helpers/scan-allowlist.js'" )
        for ( const key of INFO_PLIST_ALLOWED_KEYS ) {
            expect( privacy ).toMatch( new RegExp( `\\n    ${ key }: '` ) )
        }
        expect( privacy ).toContain( '<code>architectures</code>' )
    } )

    it( 'names the operator and courts', () => {
        for ( const page of [ privacy, terms ] ) {
            expect( page ).toContain( 'Sam Carlton Creative LLC, an Oklahoma limited liability company, doing business as Does It ARM' )
        }
        expect( terms ).toContain( 'state or federal courts located in Tulsa County, Oklahoma' )
    } )
} )
