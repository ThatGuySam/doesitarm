import { describe, expect, it } from 'vitest'

import {
    getDeviceListingBySlug,
    getVideoListingBySlug
} from '~/helpers/site-listings.js'

describe( 'site listing fallbacks', () => {
    it( 'loads known devices from the bundled device list', () => {
        expect( getDeviceListingBySlug( 'm1-imac' ) ).toMatchObject({
            name: 'M1 iMac',
            endpoint: '/device/m1-imac'
        })
    })

    it( 'rebuilds known tv listings from the bundled YouTube source', async () => {
        await expect(
            getVideoListingBySlug( 'install-instagram-app-on-m1-macbook-air-apple-silicon-tutorial-i-vfbmworal6i' )
        ).resolves.toMatchObject({
            endpoint: '/tv/install-instagram-app-on-m1-macbook-air-apple-silicon-tutorial-i-vfbmworal6i'
        })
    })

    it( 'returns null for missing tv slugs', async () => {
        await expect(
            getVideoListingBySlug( 'apple-silicon-gaming-is-here' )
        ).resolves.toBeNull()
    })
})
