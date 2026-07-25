import { describe, expect, it } from 'vitest'

import { replaceDeviceUrlsInSitemap } from '~/helpers/api/sitemap/devices.js'

describe( 'device sitemap URLs', () => {
    it( 'replaces remote legacy device URLs with the checked-in catalog URLs', () => {
        const sitemapXml = [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
            '<url><loc>https://doesitarm.com/app/example</loc></url>',
            '<url><loc>https://doesitarm.com/device/2023-m3-imac</loc><lastmod>2023-11-01</lastmod></url>',
            '<url><loc>https://doesitarm.com/device/intel-macs</loc></url>',
            '</urlset>'
        ].join( '' )

        const updatedSitemapXml = replaceDeviceUrlsInSitemap( sitemapXml, [
            'https://doesitarm.com/device/2026-macbook-neo-a18-pro',
            'https://doesitarm.com/device/2026-macbook-air-13-inch-m5'
        ])

        expect( updatedSitemapXml ).toContain( 'https://doesitarm.com/app/example' )
        expect( updatedSitemapXml ).not.toContain( '/device/2023-m3-imac' )
        expect( updatedSitemapXml ).not.toContain( '/device/intel-macs' )
        expect( updatedSitemapXml ).toContain( '/device/2026-macbook-neo-a18-pro' )
        expect( updatedSitemapXml ).toContain( '/device/2026-macbook-air-13-inch-m5' )
    })

    it( 'rejects non-urlset XML', () => {
        expect( () => replaceDeviceUrlsInSitemap( '<sitemapindex />', [] ) )
            .toThrow( 'without a urlset root' )
    })
})
