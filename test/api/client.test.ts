/**
 * Tests API client responses for various endpoints
 * Verifies that the API returns expected data structures
 * 
 * @example
 * $ na vitest test/api/client.test.ts
 */
import { expect, test } from 'vitest'
import { generateAPI } from '~/helpers/api/client.js'
import { isString } from '~/helpers/check-types.js'

type DoesItAPIClient = any // TODO: Add proper type from client.js

interface APICase {
    generateOptions: Record<string, unknown>;
    method(api: DoesItAPIClient): any;
    expected: Record<string, unknown> | ((result: any) => boolean);
}

type TestCase = [string, APICase]

const listingsCases: TestCase[] = [
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
            expected: (result: any) => isString(result.nextPage)
        }
    ]
]

test('API has valid responses', async () => {
    for (const [caseEndpoint, listingCase] of listingsCases) {
        const DoesItAPI = generateAPI(listingCase.generateOptions)
        const apiMethod = listingCase.method(DoesItAPI)

        // Assert that the apiMethod url is correct
        expect(
            (new URL(apiMethod.url)).pathname,
            `API endpoint '${caseEndpoint}'`
        ).toBe(caseEndpoint)

        // Run get request to fetch our data
        const result = await apiMethod.get()

        // If expected is a function then call it
        if (typeof listingCase.expected === 'function') {
            expect(
                listingCase.expected(result),
                `API case method check for '${caseEndpoint}'`
            ).toBeTruthy()
            continue
        }

        expect(
            result,
            `${caseEndpoint} has a valid api endpoint`
        ).toEqual(
            expect.objectContaining(listingCase.expected)
        )
    }
}) 