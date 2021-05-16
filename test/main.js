import { promises as fs } from 'fs'

import test from 'ava'
import parser from 'fast-xml-parser'
import { structuredDataTest } from 'structured-data-testing-tool'
import { Google } from 'structured-data-testing-tool/presets'

// require('dotenv').config()

test.before(async t => {
    const sitemapXml = await fs.readFile('./dist/sitemap.xml', 'utf-8')
    const sitemap = parser.parse( sitemapXml )

    // Store sitemap urls to context
    t.context.sitemapUrls = sitemap.urlset.url.map( tag => new URL( tag.loc ) )
})


test('All TV pages have valid structured data', async (t, page) => {

    const tvUrls = t.context.sitemapUrls.filter( url => url.pathname.startsWith('/tv/') )

    // console.log('tvUrls', tvUrls )

    for ( const tvUrl of tvUrls ) {

        const pagePath = `./dist${ tvUrl.pathname }/index.html`
        const pageHtml = await fs.readFile( pagePath , 'utf-8' )

        const result = await structuredDataTest( pageHtml , {
            // Check for compliance with Google, Twitter and Facebook recommendations
            presets: [
                Google
            ],
            // Check the page includes a specific Schema (see https://schema.org/docs/full.html for a list)
            schemas: [ 'VideoObject' ]
        }).then(res => {
            return res
        }).catch(err => {
            console.log( 'err.res.failed', err.res.failed )

            if (err.type === 'VALIDATION_FAILED') {

                t.fail( 'Some structured data tests failed.' )

                return
            }

            throw new Error( err )
        })

        // console.log('result', tvUrl.pathname, Object.keys( result ))
    }


    t.pass()

})
