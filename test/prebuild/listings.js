import has from 'just-has'
import test from 'ava'
import axios from 'axios'
import { JSDOM } from 'jsdom'

import {
    isValidHttpUrl,
    isValidImageUrl,
    isNonEmptyString,
    isPositiveNumberString
} from '~/helpers/check-types.js'
import { ListingDetails } from '~/helpers/listing-page.js'
import { PageHead } from '~/helpers/config.js'



const listings = [

    // Spotify
    {
        endpoint: '/app/spotify'
    },

    // Electron
    {
        endpoint: '/app/electron-framework'
    }
]



test.before(async t => {
    t.context.listings = await Promise.all(
        listings.map(async listing => {
            const { endpoint } = listing
            const { data } = await axios.get(`${ process.env.PUBLIC_API_DOMAIN }/api${ endpoint }.json`)

            return data
        })
    )
})



const headPropertyTypes = {
    'meta[charset]': {
        charset: isNonEmptyString
    },

    // <meta name="viewport" content="width=device-width,initial-scale=1">
    'meta[name="viewport"]': {
        content: isNonEmptyString
    },

    // <meta property="og:image" content="https://doesitarm.com/images/og-image.png">
    'meta[property="og:image"]': {
        content: isValidImageUrl
    },

    // <meta property="og:image:width" content="1200">
    'meta[property="og:image:width"]': {
        content: isPositiveNumberString
    },

    // <meta property="og:image:height" content="627">
    'meta[property="og:image:height"]': {
        content: isPositiveNumberString
    },

    // <meta property="og:image:alt" content="Does It ARM Logo">
    'meta[property="og:image:alt"]': {
        content: isNonEmptyString
    },

    // <meta property="twitter:card" content="summary">
    'meta[property="twitter:card"]': {
        content: isNonEmptyString
    },

    // <meta property="twitter:title" content="Does It ARM">
    'meta[property="twitter:title"]': {
        content: isNonEmptyString
    },

    // <meta property="twitter:description" content="Find out the latest app support for Apple Silicon and the Apple M1 Pro and M1 Max Processors">
    'meta[property="twitter:description"]': {
        content: isNonEmptyString
    },

    // <meta property="twitter:url" content="https://doesitarm.com">
    'meta[property="twitter:url"]': {
        content: isValidHttpUrl
    },

    // <meta property="twitter:image" content="https://doesitarm.com/images/mark.png">
    'meta[property="twitter:image"]': {
        content: isValidImageUrl,
    },

    // <meta data-hid="description" name="description" content={ headDescription }>
    'meta[name="description"]': {
        content: isNonEmptyString
    },

    // <meta data-hid="twitter:title" property="twitter:title" content="Apple Silicon and Apple M1 Pro and M1 Max app and game compatibility list">
    'meta[property="twitter:title"]': {
        content: isNonEmptyString
    },

    // <link rel="icon" type="image/x-icon" href="/favicon.ico">
    'link[rel="icon"]': {
        href: isNonEmptyString
    },

    // <!-- Preconnect Assets -->
    // <link rel="preconnect" href="https://www.googletagmanager.com">
    // <link rel="preconnect" href="https://cdn.carbonads.com">
    // <link rel="preconnect" href="https://srv.carbonads.net">
    // <link rel="preconnect" href="https://cdn4.buysellads.net"></link>
    'link[rel="preconnect"]': {
        href: isValidHttpUrl
    },
}

function parseHTML ( htmlString ) {
    const dom = new JSDOM( htmlString )

    return {
        dom,
        window: dom.window,
        document: dom.window.document
    }
}

test('Listings have valid headings', async t => {
    const { listings } = t.context

    for ( const listing of listings ) {
        // Build listing details
        const listingDetails = new ListingDetails( listing )
        const listingPageHead = new PageHead( listingDetails.headOptions )

        // console.log( 'pageMeta', listingPageHead.metaMarkup )

        // Parse into dom
        // so we can get data via selectors
        const { document } = parseHTML( listingPageHead.metaAndLinkMarkup )

        for ( const [ selector, checks ] of Object.entries( headPropertyTypes ) ) {
            const elements = document.querySelectorAll( selector )

            let count = 1

            if ( has( checks, ['count'] ) ) {
                count = checks.count
                delete checks.count
            }

            if ( count !== false ) {
                // Fail if there's more or less than one element
                t.is( elements.length, count, `${ selector } count is ${ elements.length } but should be ${ count }` )
            }

            for( const element of elements ) {
                for ( const [ check, checkMethod ] of Object.entries( checks ) ) {
                    console.log( `Ckecking ${ selector } ${ check }` )

                    const value = element.getAttribute( check )

                    t.assert( checkMethod( value ), `${ check } on ${ selector } failed` )
                }
            }

        }

    }
})
