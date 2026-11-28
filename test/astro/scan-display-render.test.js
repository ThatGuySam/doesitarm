import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { describe, expect, it } from 'vitest'

import Bundles from '../../src/components/listing-parts/bundles.astro'

describe( 'app page scan fields', () => {
    it( 'shows the narrow fields and no raw dumps', async () => {
        const container = await AstroContainer.create()
        const html = await container.renderToString( Bundles, {
            props: {
                listing: {
                    bundles: [ [ 'com.tinyspeck.slackmacgap', [
                        [ '5.0.0', { 'App Version': '5.0.0', 'Result': '🔶', architectures: [ 'x86_64' ], minimumMacOS: '10.15' } ],
                        [ '4.41.105', { 'App Version': '4.41.105', 'Result': '✅', architectures: [ 'arm64', 'x86_64' ], minimumMacOS: '11.0' } ],
                    ] ] ],
                },
            },
        } )

        expect( html ).toContain( 'bundle-scan-summary' )
        expect( html ).toContain( 'Universal (arm64, x86_64)' )
        expect( html ).toContain( 'Minimum macOS' )
        expect( html ).toContain( '4.41.105' )
        expect( html ).not.toContain( 'Full Info Plist' )
        expect( html ).not.toContain( 'Full Meta Details' )
    } )

    it( 'does not render raw fields even from an unprojected report', async () => {
        const container = await AstroContainer.create()
        const html = await container.renderToString( Bundles, {
            props: {
                listing: {
                    bundles: [ [ 'com.example.raw', [
                        [ '1.0', {
                            'App Version': '1.0',
                            'Result': '✅',
                            'Info Plist': { CFBundleIdentifier: 'com.example.raw', LSMinimumSystemVersion: '12.0', SUFeedURL: 'https://example.com/feed.xml' },
                            'Macho Meta': { architectures: [ { bits: '64-bit', processorType: 'ARM', loadCommandsInfo: [ { description: 'LC_SECRET' } ] } ] },
                        } ],
                    ] ] ],
                },
            },
        } )

        expect( html ).toContain( 'Apple Silicon (arm64)' )
        expect( html ).toContain( '12.0' )
        expect( html ).not.toContain( 'SUFeedURL' )
        expect( html ).not.toContain( 'LC_SECRET' )
    } )
} )
