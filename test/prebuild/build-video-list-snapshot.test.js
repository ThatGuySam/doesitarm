import { describe, expect, it } from 'vitest'

import { buildVideoListingFromFetchedVideo } from '~/helpers/build-video-list.js'
import { byTimeThenNull } from '~/helpers/sort-list.js'

// Shape of an entry newly extracted by the doesitarm-youtube snapshot Worker
function snapshotVideo ( { id, title, publishedAt, tags = [] } ) {
    const thumbnail = ( name, width, height ) => ({ url: `https://i.ytimg.com/vi/${ id }/${ name }.jpg`, width, height })

    return {
        title,
        description: 'Testing the new Mac.',
        timestamps: [],
        tags,
        rawData: {
            kind: 'youtube#playlistItem',
            snippet: {
                publishedAt,
                channelId: 'UCchannel',
                title,
                description: 'Testing the new Mac.',
                thumbnails: {
                    default: thumbnail( 'default', 120, 90 ),
                    medium: thumbnail( 'mqdefault', 320, 180 ),
                    high: thumbnail( 'hqdefault', 480, 360 ),
                    standard: thumbnail( 'sddefault', 640, 480 )
                },
                channelTitle: 'Playlist Owner',
                playlistId: 'PLexample00000',
                position: 0,
                resourceId: { kind: 'youtube#video', videoId: id }
            },
            contentDetails: { videoId: id, videoPublishedAt: publishedAt }
        }
    }
}

describe( 'video listings from the snapshot Worker', () => {
    it( 'builds a listing with date, thumbnail and source tags', async () => {
        const listing = await buildVideoListingFromFetchedVideo(
            snapshotVideo({ id: 'abcdefghijk', title: 'Cyberpunk 2077 — MacBook Pro M5', publishedAt: '2026-11-26T00:00:00Z', tags: [ 'benchmark' ] }),
            'abcdefghijk',
            []
        )

        expect( listing.lastUpdated.raw ).toBe( '2026-11-26T00:00:00Z' )
        expect( listing.lastUpdated.timestamp ).toBe( Date.parse( '2026-11-26T00:00:00Z' ) )
        expect( listing.tags ).toContain( 'benchmark' )
        expect( listing.thumbnail.src ).toBe( 'https://i.ytimg.com/vi/abcdefghijk/default.jpg' )
        expect( listing.thumbnail.srcset ).toContain( 'sddefault.jpg 640w' )
        expect( listing.channel ).toEqual({ name: 'Playlist Owner', id: 'UCchannel' })
    } )

    it( 'sorts new snapshot videos ahead of old ones', async () => {
        const entries = [
            [ 'old00000000', snapshotVideo({ id: 'old00000000', title: 'M1 Mac test', publishedAt: '2023-01-18T15:00:00Z' }) ],
            [ 'new00000000', snapshotVideo({ id: 'new00000000', title: 'M6 Mac mini test', publishedAt: '2026-11-26T00:00:00Z' }) ],
            [ 'mid00000000', snapshotVideo({ id: 'mid00000000', title: 'M4 Mac mini test', publishedAt: '2025-03-01T00:00:00Z' }) ]
        ]

        const listings = await Promise.all( entries.map( ( [ id, video ] ) => buildVideoListingFromFetchedVideo( video, id, [] ) ) )

        expect( listings.sort( byTimeThenNull ).map( listing => listing.id ) ).toEqual([ 'new00000000', 'mid00000000', 'old00000000' ])
    } )
} )
