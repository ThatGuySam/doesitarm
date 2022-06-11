import path from 'path'
import fs from 'fs-extra'
import axios from 'axios'
import { parse } from 'fast-xml-parser'

import {
    sitemapLocation,
    sitemapIndexFileName,
} from '~/helpers/constants.js'

const sitemapFilesToTry = [
    sitemapIndexFileName,
    'sitemap.xml'
]

export function parseSitemapXml ( sitemapXml ) {
    // Get URLs from index
    const sitemapRoot = parse( sitemapXml )

    const {
        sitemapindex = null,
        urlset = null,
    } = sitemapRoot


    if ( sitemapindex !== null ) {
        const {
            sitemap
        } = sitemapindex

        const urlEntries = Array.isArray( sitemap ) ? sitemap : [ sitemap ]

        return urlEntries
    }

    // console.log( 'sitemapRoot', sitemapRoot )

    return urlset.url
}

export async function getAllUrlsFromLocalSitemap ( sitemapPath ) {
    // Get intial sitemap
    const sitemapXml = await fs.readFile( sitemapPath, 'utf8' )
    const sitemapDirectory = path.dirname( sitemapPath )

    // Get URLs from index
    const urlEntries = parseSitemapXml( sitemapXml )

    // Check if url entries are sitemaps
    const isSitemapIndex = !!urlEntries[0].loc && urlEntries[0].loc.includes('.xml')

    if ( !isSitemapIndex ) return urlEntries


    // Get urls from our sitemap
    const sitemaps = await Promise.all( urlEntries.map( async entry => {
        // Build Sitemap Index URL
        const sitemapUrl = new URL( entry.loc )

        const childSitemapPath = path.join( sitemapDirectory, sitemapUrl.pathname )

        return await getAllUrlsFromLocalSitemap( childSitemapPath )
    }))

    // Flatten array
    return sitemaps.flat()
}

export async function fetchParsedSitemapXmlForDomain ( domain ) {
    for ( const sitemapFile of sitemapFilesToTry ) {

    }
}
