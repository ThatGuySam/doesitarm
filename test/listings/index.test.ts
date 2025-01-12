import fs from 'fs-extra'
import has from 'just-has'
import { test, expect, beforeAll } from 'vitest'
import axios from 'axios'
import { JSDOM } from 'jsdom'
import { structuredDataTestHtml } from 'structured-data-testing-tool'
import { Google } from 'structured-data-testing-tool/presets'

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
        shouldHaveVideoStructuredData: false,
    },

    // Electron
    '/app/electron-framework': {
        endpoint: '/app/electron-framework',
        apiEndpointPath: '/api/app/electron-framework.json',
        expectInitialVideo: false,
        shouldHaveVideoStructuredData: false,
    },

    // Express VPN Benchmarks
    '/app/expressvpn/benchmarks/': {
        endpoint: '/app/expressvpn/benchmarks/',
        apiEndpointPath: '/api/app/expressvpn.json',
        expectInitialVideo: true,
        shouldHaveVideoStructuredData: true
    },

    // Express VPN Benchmarks
    '/tv/install-instagram-app-on-m1-macbook-air-apple-silicon-tutorial-i-vfbmworal6i/': {
        endpoint: '/tv/install-instagram-app-on-m1-macbook-air-apple-silicon-tutorial-i-vfbmworal6i/',
        apiEndpointPath: '/api/tv/install-instagram-app-on-m1-macbook-air-apple-silicon-tutorial-i-vfbmworal6i.json',
        expectInitialVideo: true,
        shouldHaveVideoStructuredData: true
    }
}

const listingCaseEntries = Object.entries(listingsCases)

interface TestContext {
    listings: Record<string, any>;
    listingsDetails: Record<string, ListingDetails>;
}

let context: TestContext = {
    listings: {},
    listingsDetails: {}
}

beforeAll(async () => {
    for (const [caseEndpoint, listingCase] of listingCaseEntries) {
        const { endpoint } = listingCase
        const apiPath = makeApiPathFromEndpoint(caseEndpoint)
        const localPath = `./static${apiPath}`

        // Check if endpoint exists locally to avoid API calls
        if (await fs.pathExists(localPath)) {
            console.log('Using local endpoint data for', endpoint)
            context.listings[caseEndpoint] = await fs.readJson(localPath)
            continue
        }

        const { data } = await axios.get(`${process.env.PUBLIC_API_DOMAIN}${apiPath}`)
        context.listings[caseEndpoint] = data
    }

    // Initialize listing details
    for (const [caseEndpoint] of listingCaseEntries) {
        context.listingsDetails[caseEndpoint] = new ListingDetails(context.listings[caseEndpoint])
    }
})

function parseHTML(htmlString: string) {
    const dom = new JSDOM(htmlString)
    return {
        dom,
        window: dom.window,
        document: dom.window.document
    }
}

test('Listings have valid api endpoints', async () => {
    const { listingsDetails } = context

    for (const [caseEndpoint, listingCase] of listingCaseEntries) {
        const apiPath = listingsDetails[caseEndpoint].apiEndpointPath
        expect(listingCase.apiEndpointPath).toBe(apiPath)
    }
})

test.todo('Listings with videos have preload data for initialVideo', async () => {
    const { listingsDetails } = context

    for (const [caseEndpoint, listingCase] of listingCaseEntries) {
        const listingDetails = listingsDetails[caseEndpoint]

        expect(
            listingDetails.hasInitialVideo === listingCase.expectInitialVideo,
            `${caseEndpoint} has initial video`
        ).toBeTruthy()

        // Stop here if we don't have an initial video
        if (!listingDetails.hasInitialVideo) continue

        // Get headProperties for image preloading
        const preloadHeadChecks = headPropertyTypes['link[rel="preload"]']
        const images = getVideoImages(listingDetails.initialVideo)

        // Check if the head object properties are correct
        for (const preload of images.preloads) {
            for (const [propertyName, checkMethod] of Object.entries(preloadHeadChecks)) {
                // Skip count property
                if (propertyName === 'count') continue

                const value = preload[propertyName]
                expect(
                    checkMethod,
                    `${propertyName} failed. Value is '${value}' for '${images.imgSrc}'`
                ).toBeTruthy()
            }
        }
    }
})

test.todo('Listings have valid headings', async () => {
    const { listingsDetails } = context

    for (const [caseEndpoint] of listingCaseEntries) {
        // Build listing details
        const listingDetails = listingsDetails[caseEndpoint]
        const listingPageHead = new PageHead(listingDetails.headOptions)

        // Parse into dom so we can get data via selectors
        const { document } = parseHTML(listingPageHead.metaAndLinkMarkup)

        for (const [selector, checks] of Object.entries(headPropertyTypes)) {
            const elements = document.querySelectorAll(selector)

            let count = 1
            if (has(checks, 'count')) {
                count = checks.count
            }

            if ( count !== 0 ) {
                // Fail if there's more or less than one element
                expect(
                    elements.length,
                    `${selector} count is ${elements.length} but should be ${count}`
                ).toBe(count)
            }

            for (const element of elements) {
                for (const [check, checkMethod] of Object.entries(checks)) {
                    const value = element.getAttribute(check)
                    expect(
                        checkMethod,
                        `${check} on ${selector} failed. Value is '${value}'`
                    ).toBeTruthy()
                }
            }
        }
    }
})

test.todo('Listings with videos have structured data', async () => {
    const { listingsDetails } = context

    for (const [caseEndpoint, listingCase] of listingCaseEntries) {
        const listingDetails = listingsDetails[caseEndpoint]
        const listingPageHead = new PageHead({
            ...listingDetails.headOptions,
            pathname: caseEndpoint
        })

        // Stop here if we're not expecting Video Structured Data
        if (!listingCase.shouldHaveVideoStructuredData) {
            // Check that the non-video listing doesn't have video structured data
            expect(
                !listingPageHead.structuredDataMarkup.includes('VideoObject'),
                `${caseEndpoint} has video structured data`
            ).toBeTruthy()
            continue
        }

        // Assert that the structured data is not empty
        expect(
            listingPageHead.structuredDataMarkup.trim() !== '',
            `${caseEndpoint} has structured data`
        ).toBeTruthy()

        try {
            const testResult = await structuredDataTestHtml(
                listingPageHead.allHeadMarkup,
                {
                    presets: [Google],
                    schemas: ['VideoObject']
                }
            )

            // Assert that no Structured Data tests failed
            expect(
                testResult.failed.length,
                `${caseEndpoint} has valid structured data`
            ).toBe(0)
        } catch (err) {
            if (err.type === 'VALIDATION_FAILED') {
                console.error({
                    failed: err.res.failed,
                    // errors: Array.from(err.res.failed).map(fail => fail?.error!)
                })
                throw new Error('Some structured data tests failed. ')
            }
            throw new Error('Structured data testing error.', err.error)
        }
    }
})
