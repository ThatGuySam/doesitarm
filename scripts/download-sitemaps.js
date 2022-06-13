import fs from 'fs-extra'
import 'dotenv/config'
import axios from 'axios'

import {
    sitemapLocation,
    sitemapIndexFileName,
} from '~/helpers/constants.js'

import { parseSitemapXml } from '~/helpers/api/sitemap/parse.js'


;(async () => {

    // Build Sitemap Index URL
    const sitemapIndexUrl = new URL( `${ sitemapLocation.split('static')[1] }${ sitemapIndexFileName }`, process.env.PUBLIC_API_DOMAIN )

    // Fetch Sitemap Index
    const sitemapIndexXML = await axios.get( sitemapIndexUrl.href ).then( response => response.data )

    // Save Sitemap Index
    const sitemapIndexFilePath = `${ sitemapLocation }${ sitemapIndexFileName }`
    await fs.writeFile( sitemapIndexFilePath, sitemapIndexXML )

    const urlEntries = parseSitemapXml( sitemapIndexXML )


    // Fetch each sitemap
    for ( const entry of urlEntries ) {

        // Build Sitemap Index URL
        const sitemapUrl = new URL( entry.loc )
        const apiSitemapUrl = new URL( sitemapUrl.pathname, process.env.PUBLIC_API_DOMAIN )

        // sitemapUrl.origin = process.env.PUBLIC_API_DOMAIN

        // Fetch Sitemap Index
        const sitemapXML = await axios.get( apiSitemapUrl.href ).then( response => response.data )

        // const sitemap = parse( sitemapXML )

        // console.log( 'sitemap', sitemap )

        // console.log( 'apiSitemapUrl', apiSitemapUrl )

        const sitemapFileName = apiSitemapUrl.pathname.split('/')[1]
        const sitemapIndexFilePath = `${ sitemapLocation }${ sitemapFileName }`

        // Save file
        await fs.writeFile( sitemapIndexFilePath, sitemapXML )
    }


    process.exit()
})()
