// import fs from 'fs-extra'
import { simpleSitemapAndIndex } from 'sitemap'


import { 
    sitemapLocation 
} from '~/helpers/constants.js'

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
