// import { promises as fs } from 'fs'


import fs from 'fs-extra'
import test from 'ava'
import parser from 'fast-xml-parser'
import axios from 'axios'
import { structuredDataTest } from 'structured-data-testing-tool'
import { Google } from 'structured-data-testing-tool/presets'

import {
    sitemapIndexFileName
} from '~/helpers/constants.js'
import { logArraysDifference } from '~/helpers/array.js'
import {
    parseSitemapXml,
    getAllUrlsFromLocalSitemap
} from '~/helpers/api/sitemap/parse.js'

require('dotenv').config()


async function pageContains ( needle, pageUrlString ) {
    const pageUrlInstance = new URL( pageUrlString )
    const pagePath = `./dist${ pageUrlInstance.pathname }/index.html`
    const pageHtml = await fs.readFile( pagePath , 'utf-8' )

    return pageHtml.includes( needle )
}

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

const sitemapFilesToTry = [
    sitemapIndexFileName,
    'sitemap.xml'
]

async function getSitemapThatExists () {
    for ( const sitemapFile of sitemapFilesToTry ) {

        const sitemapPath = `./dist/${ sitemapFile }`

        if ( await fs.pathExists( sitemapPath ) ) {
            return sitemapPath
        }
    }
}

test.before(async t => {


    const sitemapXml = await getSitemapThatExists()
    const urls = await getAllUrlsFromLocalSitemap( sitemapXml )

    // Store sitemap urls to context
    t.context.sitemapUrls = urls.map( tag => new URL( tag.loc ) )
})

test('Sitemap contains no double slashes in paths', (t) => {
    // console.log('t.context.sitemapUrls', t.context.sitemapUrls)

    const urlsWithDoubleSlashes = t.context.sitemapUrls.filter( url => url.pathname.includes('//') )

    if ( urlsWithDoubleSlashes.length > 0) {
        t.fail( `${ urlsWithDoubleSlashes.length } urls with doubles slashes found including ${ urlsWithDoubleSlashes[0] }` )
    }

    t.log( `${t.context.sitemapUrls.length} valid sitemap listings` )
    t.pass()
})


test('Sitemap mostly matches production', async (t) => {
    // console.log('t.context.sitemapUrls', t.context.sitemapUrls)

    const theshold = 10

    const urlsNotOnLive = new Set()
    // const newLocalUrls = new Set()

    const liveSitemapXml = await axios( 'https://doesitarm.com/sitemap.xml' ).then( response => response.data )
    const liveSitemap = parser.parse( liveSitemapXml )

    // Store sitemap urls to context
    const liveSitemapUrls = new Map( liveSitemap.urlset.url.map( tag => [ tag.loc, new URL( tag.loc )] ) )


    for ( const localUrl of t.context.sitemapUrls ) {
        const theoreticalLiveUrl = `https://doesitarm.com${ localUrl.pathname }`

        if ( liveSitemapUrls.has( theoreticalLiveUrl ) ) {
            liveSitemapUrls.delete( theoreticalLiveUrl )
            continue
        }

        // localUrl is either: Missing or New
        urlsNotOnLive.add( theoreticalLiveUrl )

    }

    const message = `${ urlsNotOnLive.size } new or missing from live and ${ liveSitemapUrls.size } not found locally`
    const totalDifferences = urlsNotOnLive.size + liveSitemapUrls.size

    const liveSitemapUrlStrings = new Set( liveSitemapUrls.keys() )

    if ( totalDifferences >= 0 ) {
        t.log( 'Missing from live', urlsNotOnLive )
        t.log( 'Not found locally', liveSitemapUrlStrings )
    }

    if ( totalDifferences >= theshold ) {
        t.fail( message )
    }

    t.log( message )
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

    t.log( `${categoryUrls.length} valid pages` )
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

    t.log( `${deviceUrls.length} valid pages` )
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

    t.log( `${tvUrls.length} valid pages` )
    t.pass()

})

test('All App pages with bundle data have bundle data visuals', async (t) => {

    const appUrls = t.context.sitemapUrls.filter( url => url.pathname.startsWith('/app/') )

    const appsWithBundleIds = await fs.readJson('./static/app-list.json', 'utf-8').then( appList => {
        return appList.filter( app => {
            return app.bundleIds.length > 0
        })
    })

    t.log(`${appsWithBundleIds.length} apps with bundle IDs`)

    try {

        for ( const app of appsWithBundleIds ) {
            const hasAppBundlesSection = await pageContains( 'App Bundles', `${ process.env.URL }${app.endpoint}` )

            if ( !hasAppBundlesSection ) throw new Error(`Couldn't find App Bundles section on ${ app.endpoint }`)
        }

    } catch ( error ) {
        console.log('failed', error)
        t.fail( error.message )
    }

    t.log( `${appsWithBundleIds.length} valid app pages` )
    t.pass()

})
