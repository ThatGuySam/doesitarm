import fs from 'fs-extra'
import has from 'just-has'
import test from 'ava'
import axios from 'axios'
import { JSDOM } from 'jsdom'


import {
    makeApiPathFromEndpoint,
    getVideoImages,
    ListingDetails
} from '~/helpers/listing-page.js'
import { headPropertyTypes } from '~/test/helpers/head.js'
import { PageHead } from '~/helpers/config-node.js'



const listingsCases = {

    // Spotify
    '/app/spotify': {
        endpoint: '/app/spotify',
        apiEndpointPath: '/api/app/spotify.json',
        expectInitialVideo: true,
    },

    // Electron
    '/app/electron-framework': {
        endpoint: '/app/electron-framework',
        apiEndpointPath: '/api/app/electron-framework.json',
        expectInitialVideo: false,
    },

    // Express VPN Benchmarks
    '/app/expressvpn/benchmarks/': {
        endpoint: '/app/expressvpn/benchmarks/',
        apiEndpointPath: '/api/app/expressvpn.json',
        expectInitialVideo: true,
    }
}

const listingCaseEntries = Object.entries( listingsCases )

test.before(async t => {

    t.context.listings = {}

    for ( const [ caseEndpoint, listingCase ] of listingCaseEntries ) {
        const { endpoint } = listingCase

        const apiPath = makeApiPathFromEndpoint( caseEndpoint )
        const localPath = `./static${ apiPath }`

        // Check if the endpoint exists locally
        // so we don't have to wait for the API
        if ( await fs.pathExists( localPath ) ) {
            console.log('Using local endpoint data for', endpoint)
            t.context.listings[ caseEndpoint ] = await fs.readJson( localPath )
            continue
        }

        const { data } = await axios.get(`${ process.env.PUBLIC_API_DOMAIN }${ apiPath }`)

        t.context.listings[ caseEndpoint ] = data
    }

    t.context.listingsDetails = {}

    for ( const [ caseEndpoint ] of listingCaseEntries ) {
        t.context.listingsDetails[ caseEndpoint ] = new ListingDetails( t.context.listings[ caseEndpoint ] )
    }
})


function parseHTML ( htmlString ) {
    const dom = new JSDOM( htmlString )

    return {
        dom,
        window: dom.window,
        document: dom.window.document
    }
}

test( 'Listings have valid api endpoints', async t => {
    const { listingsDetails } = t.context

    for ( const [ caseEndpoint, listingCase ] of listingCaseEntries ) {

        const apiPath = listingsDetails[ caseEndpoint ].apiEndpointPath

        t.assert( listingCase.apiEndpointPath === apiPath, `${ caseEndpoint } has a valid api endpoint` )
    }
})

test( 'Listings with videos have preload data for initialVideo', async t => {
    const { listingsDetails } = t.context

    for ( const [ caseEndpoint, listingCase ] of listingCaseEntries ) {

        const listingDetails = listingsDetails[ caseEndpoint ]

        t.assert( listingDetails.hasInitialVideo === listingCase.expectInitialVideo, `${ caseEndpoint } has initial video` )

        // Stop here if we don't have an initial video
        if ( !listingDetails.hasInitialVideo ) continue

        // t.log('listingDetails.initialVideo', listingDetails.initialVideo)

        // Get headProperties for image preloading
        const preloadHeadChecks = headPropertyTypes[ 'link[rel="preload"]' ]

        const images = getVideoImages( listingDetails.initialVideo )

        // Check if the head object properties are correct
        for ( const preload of images.preloads ) {
            for ( const [ propertyName, checkMethod ] of Object.entries( preloadHeadChecks ) ) {
                // Skip count property
                if ( propertyName === 'count' ) continue

                const value = preload[ propertyName ]

                t.assert( checkMethod( value ), `${ propertyName } failed. Value is '${ value }' for '${ images.imgSrc }'` )
            }
        }
    }
})


test('Listings have valid headings', async t => {
    const { listingsDetails } = t.context

    for ( const [ caseEndpoint, listingCase ] of listingCaseEntries ) {


        // Build listing details
        const listingDetails = listingsDetails[ caseEndpoint ]
        const listingPageHead = new PageHead( listingDetails.headOptions )

        // console.log( 'pageMeta', listingPageHead.metaMarkup )

        // Parse into dom
        // so we can get data via selectors
        const { document } = parseHTML( listingPageHead.metaAndLinkMarkup )

        for ( const [ selector, checks ] of Object.entries( headPropertyTypes ) ) {
            const elements = document.querySelectorAll( selector )

            let count = 1

            if ( has( checks, 'count' ) ) {
                count = checks.count
                // delete checks.count
            }

            if ( count !== false ) {
                // Fail if there's more or less than one element
                t.is( elements.length, count, `${ selector } count is ${ elements.length } but should be ${ count }` )
            }

            for( const element of elements ) {
                for ( const [ check, checkMethod ] of Object.entries( checks ) ) {
                    // console.log( `Ckecking ${ selector } ${ check }` )

                    const value = element.getAttribute( check )

                    t.assert( checkMethod( value ), `${ check } on ${ selector } failed. Value is '${ value }'` )
                }
            }

        }

    }
})
