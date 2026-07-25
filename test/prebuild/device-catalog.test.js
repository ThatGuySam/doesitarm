import { describe, expect, it } from 'vitest'

import {
    deviceCatalog,
    getListedDeviceListings
} from '~/helpers/device-catalog.js'
import buildDeviceList from '~/helpers/build-device-list.js'

function makeEditorialWordSet ( device ) {
    const pageText = [
        device.name,
        device.description,
        device.seoTitle,
        device.seoDescription,
        ...device.intro,
        ...device.facts.flatMap( fact => [ fact.label, fact.value ] ),
        device.comparison.heading,
        device.comparison.body,
        device.decisionGuide.heading,
        device.decisionGuide.summary,
        ...device.decisionGuide.points
    ].join( ' ' ).toLowerCase()

    return new Set( pageText.match( /[a-z0-9]+/gu ) )
}

function jaccardSimilarity ( leftWords, rightWords ) {
    const intersectionSize = Array.from( leftWords )
        .filter( word => rightWords.has( word ) )
        .length
    const unionSize = new Set( [
        ...leftWords,
        ...rightWords
    ] ).size

    return intersectionSize / unionSize
}

describe( 'Apple silicon device catalog', () => {
    it( 'lists the five Mac models Apple introduced in 2026', () => {
        const listedDevices = getListedDeviceListings()

        expect( deviceCatalog.lastReviewed ).toBe( '2026-07-25' )
        expect( listedDevices ).toHaveLength( 5 )
        expect( listedDevices.map( device => device.slug ) ).toEqual([
            '2026-macbook-neo-a18-pro',
            '2026-macbook-air-13-inch-m5',
            '2026-macbook-air-15-inch-m5',
            '2026-macbook-pro-14-inch-m5-pro-m5-max',
            '2026-macbook-pro-16-inch-m5-pro-m5-max'
        ])
        expect( new Set( listedDevices.flatMap( device => device.chips ) ) ).toEqual(
            new Set( [ 'A18 Pro', 'M5', 'M5 Pro', 'M5 Max' ] )
        )
    })

    it( 'uses the checked-in JSON instead of a remote device endpoint', async () => {
        await expect( buildDeviceList() ).resolves.toEqual( getListedDeviceListings() )
    })

    it( 'keeps every fact traceable to official Apple sources', () => {
        for ( const device of getListedDeviceListings() ) {
            expect( device.releaseYear ).toBe( 2026 )
            expect( device.facts.length ).toBeGreaterThanOrEqual( 8 )
            expect( device.officialSources.length ).toBeGreaterThanOrEqual( 2 )
            expect( device.decisionGuide.points.length ).toBeGreaterThanOrEqual( 3 )

            for ( const source of device.officialSources ) {
                const sourceUrl = new URL( source.url )

                expect( sourceUrl.hostname.endsWith( 'apple.com' ) ).toBe( true )
            }
        }
    })

    it( 'gives each indexable page unique metadata and substantive model facts', () => {
        const listedDevices = getListedDeviceListings()

        expect( new Set( listedDevices.map( device => device.seoTitle ) ).size ).toBe( listedDevices.length )
        expect( new Set( listedDevices.map( device => device.seoDescription ) ).size ).toBe( listedDevices.length )
        expect( new Set( listedDevices.map( device => device.description ) ).size ).toBe( listedDevices.length )
    })

    it( 'keeps editorial page copy below the project similarity guard', () => {
        const listedDevices = getListedDeviceListings()
        const maximumProjectSimilarity = 0.7

        for ( const [ leftIndex, leftDevice ] of listedDevices.entries() ) {
            for ( const rightDevice of listedDevices.slice( leftIndex + 1 ) ) {
                const similarity = jaccardSimilarity(
                    makeEditorialWordSet( leftDevice ),
                    makeEditorialWordSet( rightDevice )
                )

                expect(
                    similarity,
                    `${ leftDevice.slug } is too similar to ${ rightDevice.slug }`
                ).toBeLessThan( maximumProjectSimilarity )
            }
        }
    })
})
