import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { parse } from 'node-html-parser'
import { describe, expect, it } from 'vitest'

import Devices from '../../src/components/listing-parts/devices.astro'
import { amazonAffiliateTag, getDeviceAmazonUrl, getListedDeviceListings } from '../../helpers/device-catalog.js'

describe( 'app page device support', () => {
    it( 'links each device to Amazon with the affiliate tag and keeps Apple specs', async () => {
        const container = await AstroContainer.create()
        const html = await container.renderToString( Devices, {
            props: { listing: { name: 'Pro Tools', text: '✅ Yes, Native Apple Silicon Support' } }
        } )
        const devices = getListedDeviceListings()
        const rows = parse( html ).querySelectorAll( 'ul.device-support-apps li' )

        expect( devices.length ).toBeGreaterThan( 0 )
        expect( rows ).toHaveLength( devices.length )
        for ( const [ index, device ] of devices.entries() ) {
            const [ name, pricing, specs ] = rows[ index ].querySelectorAll( 'a' )

            expect( name.text ).toBe( `✅ ${ device.name }` )
            expect( name.getAttribute( 'href' ) ).toBe( device.endpoint )
            expect( pricing.text ).toBe( 'Check Pricing' )
            expect( pricing.getAttribute( 'href' ) ).toBe( getDeviceAmazonUrl( device ) )
            expect( pricing.getAttribute( 'rel' ) ).toBe( 'sponsored nofollow noopener' )
            expect( specs.text ).toBe( 'Specs' )
            expect( specs.getAttribute( 'href' ) ).toBe( device.productUrl )
            expect( specs.getAttribute( 'aria-label' ) ).toContain( 'Apple Specs' )
        }
        expect( html ).toContain( 'As an Amazon Associate' )
    } )

    it( 'builds an Amazon search with the doesitarm-20 tag', () => {
        const url = new URL( getDeviceAmazonUrl( { shortName: 'MacBook Neo', chips: [ 'A18 Pro' ] } ) )

        expect( amazonAffiliateTag ).toBe( 'doesitarm-20' )
        expect( url.origin ).toBe( 'https://www.amazon.com' )
        expect( url.searchParams.get( 'k' ) ).toBe( 'Apple MacBook Neo A18 Pro' )
        expect( url.searchParams.get( 'tag' ) ).toBe( 'doesitarm-20' )
    } )
} )
