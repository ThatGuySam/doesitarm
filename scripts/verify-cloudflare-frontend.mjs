#!/usr/bin/env node

import fs from 'node:fs'

import { replaceDeviceUrlsInSitemap } from '../helpers/api/sitemap/devices.js'

const DEFAULT_HOST = 'https://cf.doesitarm.com'
const API_HOST = 'https://api.doesitarm.com'
const PRODUCTION_HOST = 'https://doesitarm.com'

const deviceCatalog = JSON.parse(
    fs.readFileSync(
        new URL( '../data/apple-silicon-devices.json', import.meta.url ),
        'utf8'
    )
)

function getHost () {
    const hostArgument = process.argv.find( argument => {
        return argument.startsWith( '--host=' )
    } )

    return new URL(
        hostArgument
            ? hostArgument.slice( '--host='.length )
            : DEFAULT_HOST
    )
}

async function fetchOk ( url, options = {} ) {
    const response = await fetch( url, options )

    if ( !response.ok ) {
        throw new Error( `${ url } returned ${ response.status }` )
    }

    return response
}

function sitemapUrls ( xml ) {
    return new Set(
        [ ...xml.matchAll( /<loc>(.*?)<\/loc>/g ) ].map( match => match[ 1 ] )
    )
}

function setDifference ( left, right ) {
    return [ ...left ].filter( value => !right.has( value ) )
}

async function verifyIndexingHeader ( host ) {
    const response = await fetchOk( new URL( '/', host ) )
    const robotsHeader = response.headers.get( 'x-robots-tag' ) || ''
    const isProduction = [
        'doesitarm.com',
        'www.doesitarm.com'
    ].includes( host.hostname )

    if ( isProduction && /noindex/i.test( robotsHeader ) ) {
        throw new Error( `${ host.hostname } is incorrectly marked noindex` )
    }

    if ( !isProduction && !/noindex/i.test( robotsHeader ) ) {
        throw new Error( `${ host.hostname } preview is missing noindex` )
    }
}

async function verifyRedirects ( host ) {
    const redirects = new Map([
        [ '/categories', '/categories/' ],
        [ '/games', '/games/' ],
        [ '/app/node', '/app/nodejs' ],
        [ '/device/apple-silicon-imac', '/device/m1-imac/' ]
    ])

    for ( const [ path, expectedPath ] of redirects ) {
        const response = await fetch( new URL( path, host ), {
            redirect: 'manual'
        } )
        const location = response.headers.get( 'location' )
        const actualPath = location
            ? new URL( location, host ).pathname
            : null

        if ( response.status < 300 || response.status >= 400 ) {
            throw new Error( `${ path } returned ${ response.status }, expected a redirect` )
        }

        if ( actualPath !== expectedPath ) {
            throw new Error( `${ path } redirected to ${ actualPath }, expected ${ expectedPath }` )
        }
    }
}

async function verifyFreshHomepage ( host ) {
    const apiResponse = await fetchOk( `${ API_HOST }/api/kind/app/1.json` )
    const appPage = await apiResponse.json()
    const latestApp = appPage.items?.[ 0 ]

    if ( !latestApp?.name || !latestApp?.endpoint ) {
        throw new Error( 'Current API response has no latest app record' )
    }

    const homepageResponse = await fetchOk( new URL( '/', host ) )
    const homepage = await homepageResponse.text()

    if ( !homepage.includes( latestApp.name ) || !homepage.includes( latestApp.endpoint ) ) {
        throw new Error( `${ host.hostname } homepage is missing current API app ${ latestApp.name }` )
    }
}

async function verifySitemapParity ( host ) {
    const [ deployedResponse, apiResponse ] = await Promise.all([
        fetchOk( new URL( '/sitemap-0.xml', host ) ),
        fetchOk( `${ API_HOST }/sitemap-0.xml` )
    ])
    const deployed = sitemapUrls( await deployedResponse.text() )
    const deviceUrls = deviceCatalog.devices
        .filter( device => device.listed )
        .map( device => new URL( device.endpoint, PRODUCTION_HOST ).href )
    const expectedSitemap = replaceDeviceUrlsInSitemap(
        await apiResponse.text(),
        deviceUrls
    )
    const current = sitemapUrls( expectedSitemap )
    const missing = setDifference( current, deployed )
    const extra = setDifference( deployed, current )

    if ( missing.length > 0 || extra.length > 0 ) {
        throw new Error(
            `Sitemap mismatch: ${ missing.length } missing, ${ extra.length } extra`
        )
    }

    console.log( `Sitemap parity: ${ deployed.size } URLs` )
}

async function verifyStaticAssets ( host ) {
    for ( const path of [
        '/robots.txt',
        '/sitemap-index.xml',
        '/pagefind/pagefind.js'
    ] ) {
        await fetchOk( new URL( path, host ) )
    }
}

async function main () {
    const host = getHost()

    await verifyIndexingHeader( host )
    await verifyRedirects( host )
    await verifyFreshHomepage( host )
    await verifySitemapParity( host )
    await verifyStaticAssets( host )

    console.log( `Cloudflare frontend verification passed for ${ host.origin }` )
}

main().catch( error => {
    console.error( error )
    process.exit( 1 )
} )
