import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { parse } from 'node-html-parser'
import { describe, expect, it } from 'vitest'

import ListingMeta from '../../src/components/listing-parts/listing-meta.astro'

describe( 'listing metadata', () => {
    it( 'shows the listing date with the aliases and preserves the source timestamp', async () => {
        const container = await AstroContainer.create()
        const raw = '2026-11-28T03:04:01Z'
        const html = await container.renderToString( ListingMeta, {
            props: { listing: { aliases: [ 'Example', 'Alternate' ], lastUpdated: { raw } } }
        } )
        const meta = parse( html ).querySelector( '.listing-meta' )
        const time = meta.querySelector( 'time' )

        expect( meta.text ).toMatch( /May also be known as Example or Alternate\s*·\s*Updated Nov 28, 2026/ )
        expect( time.getAttribute( 'datetime' ) ).toBe( raw )
    } )

    it( 'omits metadata when a listing has no date or extra names', async () => {
        const container = await AstroContainer.create()
        const html = await container.renderToString( ListingMeta, {
            props: { listing: { aliases: [ 'Example' ], lastUpdated: null } }
        } )

        expect( parse( html ).querySelector( '.listing-meta' ) ).toBeNull()
    } )
} )
