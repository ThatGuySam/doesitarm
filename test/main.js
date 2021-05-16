import { promises as fs } from 'fs'

import test from 'ava'
import parser from 'fast-xml-parser'
import { structuredDataTest } from 'structured-data-testing-tool'
import { Google, Twitter } from 'structured-data-testing-tool/presets'

// require('dotenv').config()



async function testStructuredData ( options ) {
    const {
        pageUrls,
        // Check for compliance with Google, Twitter and Facebook recommendations
        presets = [
            Google
        ],
        // Check the page includes a specific Schema (see https://schema.org/docs/full.html for a list)
        schemas
    } = options

    for ( const url of pageUrls ) {

        const pagePath = `./dist${ url.pathname }/index.html`
        const pageHtml = await fs.readFile( pagePath , 'utf-8' )

        // https://github.com/glitchdigital/structured-data-testing-tool#api
        await structuredDataTest( pageHtml , {
            presets,
            schemas
        }).then(res => {
            return res
        }).catch(err => {
            // console.log( 'err.res.failed', err.res.failed )

            if (err.type === 'VALIDATION_FAILED') {

                // t.fail( 'Some structured data tests failed.' )
                const validationError = new Error( 'Some structured data tests failed.' )

                validationError.failed = err.res.failed

                throw validationError

                // return
            }

            throw new Error( 'Structured data testing error.', err )
        })

        // console.log('result', tvUrl.pathname, Object.keys( result ))
    }


}



test.before(async t => {
    const sitemapXml = await fs.readFile('./dist/sitemap.xml', 'utf-8')
    const sitemap = parser.parse( sitemapXml )

    // Store sitemap urls to context
    t.context.sitemapUrls = sitemap.urlset.url.map( tag => new URL( tag.loc ) )
})

test('Sitemap contains no double slashes in paths', (t) => {
    // console.log('t.context.sitemapUrls', t.context.sitemapUrls)

    const urlsWithDoubleSlashes = t.context.sitemapUrls.filter( url => url.pathname.includes('//') )

    if ( urlsWithDoubleSlashes.length > 0) {
        t.fail( `${ urlsWithDoubleSlashes.length } urls with doubles slashes found including ${ urlsWithDoubleSlashes[0] }` )
    }

    t.pass()
})

test('All Category pages have valid FAQPage structured data', async (t) => {

    const categoryUrls = t.context.sitemapUrls.filter( url => url.pathname.startsWith('/kind/') )


    try {

        await testStructuredData({
            pageUrls: categoryUrls,
            schemas: [ 'FAQPage' ],
            presets: [
                Google,
                // Twitter
            ],
        })

    } catch ( error ) {
        console.log('failed', error.failed)
        t.fail( error.message )
    }

    t.pass()

})


test('All Device pages have valid FAQPage structured data', async (t) => {

    const deviceUrls = t.context.sitemapUrls.filter( url => url.pathname.startsWith('/device/') )


    try {

        await testStructuredData({
            pageUrls: deviceUrls,
            schemas: [ 'FAQPage' ],
            presets: [
                Google,
                // Twitter
            ],
        })

    } catch ( error ) {
        console.log('failed', error.failed)
        t.fail( error.message )
    }

    t.pass()

})


test('All TV pages have valid VideoObject structured data', async (t) => {

    const tvUrls = t.context.sitemapUrls.filter( url => url.pathname.startsWith('/tv/') )


    try {

        await testStructuredData({
            pageUrls: tvUrls,
            schemas: [ 'VideoObject' ]
        })

    } catch ( error ) {
        console.log('failed', error.failed)
        t.fail( error.message )
    }

    t.pass()

})
