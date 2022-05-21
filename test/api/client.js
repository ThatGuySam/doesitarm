import test from 'ava'

import {
    generateAPI
} from '~/helpers/api/client.js'


const listingsCases = [

    // Spotify
    [
        '/app/spotify',
        {
            generateOptions: {},
            method: DoesItAPI => DoesItAPI.app.spotify.get(),
            expected: {
                name: 'Spotify',
            }
        }
    ],

    // Electron
    [
        '/app/electron-framework',
        {
            generateOptions: {},
            method: DoesItAPI => DoesItAPI.app('electron-framework').get(),
            expected: {
                name: 'Electron Framework',
            }
        }
    ],

    // Express VPN Benchmarks
    [
        '/app/expressvpn/benchmarks/',
        {
            generateOptions: {},
            method: DoesItAPI => DoesItAPI.app.expressvpn.get(),
            expected: {
                name: 'ExpressVPN',
            }
        }
    ],

    // Solo App URL
    [
        '/app/solo',
        {
            generateOptions: {},
            method: DoesItAPI => DoesItAPI.app('solo').url,
            expected: result => result.includes( '/app/solo' )
        }
    ],
]


test( 'API has valid responses', async t => {
    // const { listingsDetails } = t.context

    for ( const [ caseEndpoint, listingCase ] of listingsCases ) {

        // const apiPath = listingsDetails[ caseEndpoint ].apiEndpointPath

        const DoesItAPI = generateAPI( listingCase.generateOptions )

        const result = await listingCase.method( DoesItAPI )

        // If expected is a function then call it
        // Otherwise, compare the result to the expected
        if ( typeof listingCase.expected === 'function' ) {
            t.assert( listingCase.expected( result ), `API case method check for '${ caseEndpoint }'` )

            continue
        }

        t.like( result, listingCase.expected, `${ caseEndpoint } has a valid api endpoint` )
    }
})
