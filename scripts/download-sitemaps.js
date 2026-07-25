import fs from 'fs-extra'
import 'dotenv/config.js'

import {
    sitemapLocation,
    sitemapIndexFileName,
} from '~/helpers/constants.js'

import { getListedDeviceListings } from '~/helpers/device-catalog.js'
import { replaceDeviceUrlsInSitemap } from '~/helpers/api/sitemap/devices.js'
import { parseSitemapXml } from '~/helpers/api/sitemap/parse.js'
import { getText } from '~/helpers/http.js'
import { getSiteUrl } from '~/helpers/url.js'


;(async () => {

    // Build Sitemap Index URL
    const sitemapIndexUrl = new URL( `${ sitemapLocation.split('static')[1] }${ sitemapIndexFileName }`, process.env.PUBLIC_API_DOMAIN )

    // Fetch Sitemap Index
    const sitemapIndexXML = await getText( sitemapIndexUrl.href )

    // Save Sitemap Index
    const sitemapIndexFilePath = `${ sitemapLocation }${ sitemapIndexFileName }`
    await fs.writeFile( sitemapIndexFilePath, sitemapIndexXML )

    const urlEntries = parseSitemapXml( sitemapIndexXML )


    const downloadedSitemapPaths = []

    // Fetch each sitemap
    for ( const entry of urlEntries ) {

        // Build Sitemap Index URL
        const sitemapUrl = new URL( entry.loc )
        const apiSitemapUrl = new URL( sitemapUrl.pathname, process.env.PUBLIC_API_DOMAIN )

        // sitemapUrl.origin = process.env.PUBLIC_API_DOMAIN

        // Fetch Sitemap Index
        const sitemapXML = await getText( apiSitemapUrl.href )

        // const sitemap = parse( sitemapXML )

        // console.log( 'sitemap', sitemap )

        // console.log( 'apiSitemapUrl', apiSitemapUrl )

        const sitemapFileName = apiSitemapUrl.pathname.split('/')[1]
        const sitemapIndexFilePath = `${ sitemapLocation }${ sitemapFileName }`

        // Save file
        await fs.writeFile( sitemapIndexFilePath, sitemapXML )
        downloadedSitemapPaths.push( sitemapIndexFilePath )
    }

    const siteUrl = getSiteUrl()
    const deviceUrls = getListedDeviceListings().map( device => {
        return new URL( device.endpoint, siteUrl ).href
    } )

    for ( const [ index, sitemapPath ] of downloadedSitemapPaths.entries() ) {
        const sitemapXml = await fs.readFile( sitemapPath, 'utf8' )
        const updatedSitemapXml = replaceDeviceUrlsInSitemap(
            sitemapXml,
            index === 0 ? deviceUrls : []
        )

        await fs.writeFile( sitemapPath, updatedSitemapXml )
    }


    process.exit()
})()
