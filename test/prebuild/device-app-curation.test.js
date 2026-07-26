import { describe, expect, it } from 'vitest'

import { makeCuratedDeviceAppPage } from '~/helpers/device-app-curation.js'

function makeListing ({
    slug,
    category,
    timestamp = 0
}) {
    return {
        name: slug,
        slug,
        endpoint: `/app/${ slug }`,
        category: {
            slug: category
        },
        lastUpdated: {
            timestamp
        },
        bundles: [ 'large-field' ],
        relatedVideos: [ 'large-field' ]
    }
}

const device = {
    buyerProfile: {
        featuredAppSlugs: [
            'anchor-one',
            'anchor-two',
            'anchor-three',
            'anchor-four'
        ],
        appCategories: [
            {
                slug: 'productivity-tools'
            },
            {
                slug: 'developer-tools'
            }
        ]
    }
}

const featuredListings = [
    makeListing({
        slug: 'anchor-one',
        category: 'productivity-tools'
    }),
    makeListing({
        slug: 'anchor-two',
        category: 'productivity-tools'
    }),
    makeListing({
        slug: 'anchor-three',
        category: 'developer-tools'
    }),
    makeListing({
        slug: 'anchor-four',
        category: 'developer-tools'
    })
]

describe( 'device app curation', () => {
    it( 'interleaves stable profile apps with the newest category matches', () => {
        const page = makeCuratedDeviceAppPage({
            device,
            featuredListings,
            categoryPages: {
                'productivity-tools': {
                    items: [
                        makeListing({
                            slug: 'old-productivity',
                            category: 'productivity-tools',
                            timestamp: 100
                        }),
                        makeListing({
                            slug: 'new-productivity',
                            category: 'productivity-tools',
                            timestamp: 200
                        })
                    ]
                },
                'developer-tools': {
                    items: [
                        makeListing({
                            slug: 'new-developer',
                            category: 'developer-tools',
                            timestamp: 300
                        })
                    ]
                }
            }
        })

        expect( page.items.map( listing => listing.slug ) ).toEqual([
            'anchor-one',
            'anchor-two',
            'new-productivity',
            'anchor-three',
            'anchor-four',
            'new-developer',
            'old-productivity'
        ])
        expect( page.items.every( listing => listing.bundles === undefined ) ).toBe( true )
        expect( page.items.every( listing => listing.relatedVideos === undefined ) ).toBe( true )
    })

    it( 'swaps a rotating slot when a newer category report arrives', () => {
        const baseCategoryPages = {
            'productivity-tools': {
                items: [
                    makeListing({
                        slug: 'current-productivity',
                        category: 'productivity-tools',
                        timestamp: 200
                    })
                ]
            },
            'developer-tools': {
                items: []
            }
        }
        const originalPage = makeCuratedDeviceAppPage({
            device,
            featuredListings,
            categoryPages: baseCategoryPages,
            listSize: 5
        })
        const refreshedPage = makeCuratedDeviceAppPage({
            device,
            featuredListings,
            categoryPages: {
                ...baseCategoryPages,
                'productivity-tools': {
                    items: [
                        ...baseCategoryPages[ 'productivity-tools' ].items,
                        makeListing({
                            slug: 'newer-productivity',
                            category: 'productivity-tools',
                            timestamp: 300
                        })
                    ]
                }
            },
            listSize: 5
        })

        expect( originalPage.items.map( listing => listing.slug ) )
            .toContain( 'current-productivity' )
        expect( refreshedPage.items.map( listing => listing.slug ) )
            .toContain( 'newer-productivity' )
        expect( refreshedPage.items.map( listing => listing.slug ) )
            .not.toContain( 'current-productivity' )
    })
})
