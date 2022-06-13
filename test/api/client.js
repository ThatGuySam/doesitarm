import test from 'ava'

import {
    generateAPI
} from '~/helpers/api/client.js'

import {
    isString
} from '~/helpers/check-types.js'

const listingsCases = [

    // Spotify
    [
        '/api/app/spotify.json',
        {
            generateOptions: {},
            method: DoesItAPI => DoesItAPI.app.spotify,
            expected: {
                name: 'Spotify',
            }
        }
    ],

    // Electron
    [
        '/api/app/electron-framework.json',
        {
            generateOptions: {},
            method: DoesItAPI => DoesItAPI.app('electron-framework'),
            expected: { name: 'Electron Framework' }
        }
    ],

    // Express VPN
    [
        '/api/app/expressvpn.json',
        {
            generateOptions: {},
            method: DoesItAPI => DoesItAPI.app.expressvpn,
            expected: { name: 'ExpressVPN' }
        }
    ],

    // Solo App URL
    [
        '/api/app/solo.json',
        {
            generateOptions: {},
            method: DoesItAPI => DoesItAPI.app('solo'),
            expected: { name: 'SOLO' }
        }
    ],

    // Page 2 of App Kinds
    [
        '/api/kind/app/2.json',
        {
            generateOptions: {},
            method: DoesItAPI => DoesItAPI('kind/app')(2),
            expected: result => isString( result.nextPage )
        }
    ]
]


test( 'API has valid responses', async t => {
    // const { listingsDetails } = t.context

    for ( const [ caseEndpoint, listingCase ] of listingsCases ) {

        // const apiPath = listingsDetails[ caseEndpoint ].apiEndpointPath

        const DoesItAPI = generateAPI( listingCase.generateOptions )

        const apiMethod = listingCase.method( DoesItAPI )

        // Assert that the apiMethod url is correct
        t.is( (new URL(apiMethod.url)).pathname, caseEndpoint, `API endpoint '${ caseEndpoint }'` )

        // Run get request to fetch our data
        const result = await apiMethod.get()

        // If expected is a function then call it
        // Otherwise, compare the result to the expected
        if ( typeof listingCase.expected === 'function' ) {
            t.assert( listingCase.expected( result ), `API case method check for '${ caseEndpoint }'` )

            continue
        }

        t.like( result, listingCase.expected, `${ caseEndpoint } has a valid api endpoint` )
    }
})
