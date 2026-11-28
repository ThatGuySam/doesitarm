import { experimental_AstroContainer as AstroContainer } from 'astro/container'
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

        expect( devices.length ).toBeGreaterThan( 0 )
        for ( const device of devices ) {
            expect( html ).toContain( `✅ ${ device.name }` )
            expect( html ).toContain( getDeviceAmazonUrl( device ).replaceAll( '&', '&amp;' ) )
            expect( html ).toContain( device.productUrl )
        }
        expect( html.match( /rel="sponsored nofollow noopener"/g ) ).toHaveLength( devices.length )
        expect( html ).toContain( 'Apple specs' )
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
