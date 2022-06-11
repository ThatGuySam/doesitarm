import glob from 'fast-glob'
import { simpleSitemapAndIndex } from 'sitemap'


import {
    sitemapLocation
} from '~/helpers/constants.js'
import { getSiteUrl } from '~/helpers/url.js'

const astroPageTemplatePath = './src/pages'

export async function getUrlsForAstroDefinedPages () {
    const siteUrl = getSiteUrl()
    const filesPaths = await glob( `${ astroPageTemplatePath }/**/*.astro` )

    const urls = []

    for ( const filePath of filesPaths ) {
        const urlPath = filePath
            .replace( astroPageTemplatePath, '' )
            .replace( '.astro', '' )
            .replace( '/index', '/' )

        // Skip any paths for templates that include '['
        if ( urlPath.includes( '[' ) ) continue

        console.log( 'urlPath', urlPath )

        // Create a new url object from the site url and the path
        const url = new URL( urlPath, siteUrl )

        urls.push( url.pathname )
    }

    return urls
}

export async function saveSitemap ( sitemapUrls ) {

    await simpleSitemapAndIndex({
        hostname: process.env.PUBLIC_URL,
        destinationDir: sitemapLocation,
        gzip: false,
        // [{ url: '/page-1/', changefreq: 'daily'}, ...],
        sourceData: sitemapUrls.map( url => {
            return {
                url,
                // Google doesn't care about changefreq and priority - https://www.seroundtable.com/google-priority-change-frequency-xml-sitemap-20273.html
                // changefreq: 'daily'
            }
        }),
    })

}
