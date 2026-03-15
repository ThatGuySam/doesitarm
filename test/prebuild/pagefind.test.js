import { describe, it, expect } from 'vitest'

import {
    mapSitemapEntryToPagefindRecord,
    shouldIndexSitemapEntry
} from '~/helpers/pagefind/index.js'

describe('Pagefind records', () => {
    it('should skip sitemap entries without searchable payloads', () => {
        expect( shouldIndexSitemapEntry({
            route: '/games',
            payload: {}
        }) ).toBe( false )
    })

    it('should map benchmark entries to Pagefind records', () => {
        const record = mapSitemapEntryToPagefindRecord({
            route: '/app/example/benchmarks',
            payload: {
                app: {
                    name: 'Example App',
                    text: '✅ Native support',
                    content: 'Runs fast on Apple Silicon',
                    aliases: [ 'Example' ],
                    tags: [ 'Utilities' ],
                    status: 'no-in-progress',
                    slug: 'example',
                    category: {
                        slug: 'system-tools',
                        label: 'System Tools'
                    },
                    lastUpdated: {
                        timestamp: 1234567890
                    }
                }
            }
        })

        expect( record ).toMatchObject({
            url: '/app/example/benchmarks',
            language: 'en',
            meta: {
                title: 'Example App Benchmarks',
                text: '✅ Native support',
                slug: 'example',
                categorySlug: 'system-tools',
                routeType: 'benchmarks',
                lastUpdatedTimestamp: '1234567890'
            },
            filters: {
                status: [ 'no_in_progress' ],
                category: [ 'system_tools' ],
                type: [ 'benchmarks' ]
            },
            sort: {
                updated: '1234567890'
            }
        })

        expect( record.content ).toContain('Example App Benchmarks')
        expect( record.content ).toContain('Runs fast on Apple Silicon')
        expect( record.content ).toContain('Apple Silicon App Tested')
    })
})
