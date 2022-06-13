import path from 'path'
import fs from 'fs-extra'
import axios from 'axios'
import { parse } from 'fast-xml-parser'

import {
    sitemapLocation,
    sitemapIndexFileName,
} from '~/helpers/constants.js'
import { isValidHttpUrl } from '~/helpers/check-types.js'

const sitemapFilesToTry = [
    sitemapIndexFileName,
    'sitemap.xml'
]

function getDomainFromString ( urlString ) {
    const url = new URL( urlString )

    return url.hostname
}

function getPathFromUrl ( urlString ) {
    const url = new URL( urlString )

    return url.pathname
}

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
    return await getAllUrlsFromSitemap( sitemapPath, {
        getMethod: async ( sitemapPath ) => {
            const sitemapXml = await fs.readFile( sitemapPath, 'utf8' )

            return sitemapXml
        }
    })
}

export async function getAllUrlsFromSitemap ( sitemapSource, { getMethod } = {} ) {

    const sitemapPath = isValidHttpUrl( sitemapSource ) ? getPathFromUrl( sitemapSource ) : sitemapSource

    // console.log('sitemapPath', sitemapPath)

    // Get intial sitemap
    const sitemapXml = await getMethod( sitemapSource )// fs.readFile( sitemapPath, 'utf8' )
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

        return await getAllUrlsFromSitemap( childSitemapPath, { getMethod } )
    }))

    // Flatten array
    return sitemaps.flat()
}

export async function fetchAllUrlsFromSitemaps ( urlString ) {
    // const domain = getDomainFromString( urlString )

    const allUrls = new Map()

    for ( const sitemapFile of sitemapFilesToTry ) {

        const sitemapUrl = new URL( sitemapFile, urlString )

        // console.log( 'sitemapUrl', sitemapUrl.href )

        // Just do a quich HEAD request to see if the file exists with getting the whole body
        const exists = await axios.head( sitemapUrl.href )
            .catch( () => false )
            .then( response => {
                // console.log( 'response', response.status )
                return response.status < 300
            } )

        // console.log( 'exists', exists )

        // Skip if sitemap doesn't exist
        if ( !exists ) continue

        // Fetch the whole sitemap
        const urls = await getAllUrlsFromSitemap( sitemapUrl.href , {
            getMethod: async sitemapPath => {
                const sitemapUrl = new URL( sitemapPath, urlString )

                const sitemapXml = await axios.get( sitemapUrl.href )
                    .then( response => response.data )

                return sitemapXml
            }
        })

        // console.log( 'Sitemap urls', urls )

        // Set our urls to the map
        urls.forEach( tag => allUrls.set( tag.loc, new URL( tag.loc ) ) )

        // Store sitemap urls to context
        // const urlsMap = new Map( urls.map( tag => [ tag.loc, new URL( tag.loc )] ) )

    }

    return allUrls
}
