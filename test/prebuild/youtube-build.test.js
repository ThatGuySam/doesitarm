import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
    getPlaylistsItems,
    getYouTubeVideos,
    youtubePlaylistItemsEndpoint
} from '~/helpers/api/youtube/build.js'
import { playlists, benchmarksPlaylistId } from '~/helpers/api/youtube/playlists.js'

function jsonResponse ( body, status = 200 ) {
    return new Response( JSON.stringify( body ), {
        status,
        headers: { 'Content-Type': 'application/json' }
    } )
}

function makeItem ( { videoId, playlistId, title = videoId, description = '' } ) {
    return {
        kind: 'youtube#playlistItem',
        snippet: { title, description, playlistId },
        contentDetails: { videoId }
    }
}

describe( 'YouTube playlist fetching without googleapis', () => {
    const fetchMock = vi.fn()

    beforeEach( () => {
        vi.stubGlobal( 'fetch', fetchMock )
        vi.spyOn( console, 'log' ).mockImplementation( () => {} )
    } )

    afterEach( () => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
        fetchMock.mockReset()
    } )

    it( 'calls the playlistItems endpoint with the same parameters googleapis sent', async () => {
        fetchMock.mockResolvedValueOnce( jsonResponse({ items: [] }) )

        await getPlaylistsItems({ playlistId: 'PL-test', apiKey: 'test-key' })

        expect( fetchMock ).toHaveBeenCalledTimes( 1 )

        const url = new URL( fetchMock.mock.calls[0][0] )

        expect( `${ url.origin }${ url.pathname }` ).toBe( youtubePlaylistItemsEndpoint )
        expect( Object.fromEntries( url.searchParams ) ).toEqual({
            key: 'test-key',
            part: 'snippet,contentDetails',
            playlistId: 'PL-test',
            maxResults: '50'
        })
    } )

    it( 'follows nextPageToken until the last page and keeps item order', async () => {
        fetchMock
            .mockResolvedValueOnce( jsonResponse({
                items: [ makeItem({ videoId: 'a', playlistId: 'PL-test' }) ],
                nextPageToken: 'page-2'
            }) )
            .mockResolvedValueOnce( jsonResponse({
                items: [ makeItem({ videoId: 'b', playlistId: 'PL-test' }) ],
                nextPageToken: 'page-3'
            }) )
            .mockResolvedValueOnce( jsonResponse({
                items: [ makeItem({ videoId: 'c', playlistId: 'PL-test' }) ]
            }) )

        const items = await getPlaylistsItems({ playlistId: 'PL-test', apiKey: 'k' })

        expect( items.map( item => item.contentDetails.videoId ) ).toEqual([ 'a', 'b', 'c' ])
        expect( fetchMock ).toHaveBeenCalledTimes( 3 )
        expect( new URL( fetchMock.mock.calls[0][0] ).searchParams.has( 'pageToken' ) ).toBe( false )
        expect( new URL( fetchMock.mock.calls[1][0] ).searchParams.get( 'pageToken' ) ).toBe( 'page-2' )
        expect( new URL( fetchMock.mock.calls[2][0] ).searchParams.get( 'pageToken' ) ).toBe( 'page-3' )
    } )

    it( 'throws when the API returns an error instead of returning partial data', async () => {
        fetchMock.mockResolvedValueOnce( jsonResponse({
            error: { code: 403, message: 'quotaExceeded' }
        }, 403 ) )

        await expect( getPlaylistsItems({ playlistId: 'PL-test', apiKey: 'k' }) ).rejects.toMatchObject({
            status: 403
        })
    } )

    it( 'requires a playlist id', async () => {
        await expect( getPlaylistsItems({ apiKey: 'k' }) ).rejects.toThrow( 'playlistId' )
        expect( fetchMock ).not.toHaveBeenCalled()
    } )

    it( 'builds the same video map shape, with benchmark tags and timestamps', async () => {
        fetchMock.mockImplementation( async input => {
            const playlistId = new URL( input ).searchParams.get( 'playlistId' )

            if ( playlistId === benchmarksPlaylistId ) {
                return jsonResponse({
                    items: [ makeItem({ videoId: 'bench-1', playlistId }) ]
                })
            }

            if ( playlistId === playlists[0].id ) {
                return jsonResponse({
                    items: [
                        makeItem({
                            videoId: 'bench-1',
                            playlistId,
                            title: 'Benchmark video',
                            description: 'Intro\n1:05 Geekbench\nno time here\n1:02:03 Wrap up'
                        }),
                        makeItem({ videoId: 'plain-1', playlistId, title: 'Plain video' })
                    ]
                })
            }

            return jsonResponse({ items: [] })
        } )

        const videos = await getYouTubeVideos()

        expect( Object.keys( videos ).sort() ).toEqual([ 'bench-1', 'plain-1' ])
        expect( videos['bench-1'] ).toMatchObject({
            title: 'Benchmark video',
            tags: [ 'benchmark' ],
            timestamps: [
                { time: '1:05', fullText: '1:05 Geekbench' },
                { time: '1:02:03', fullText: '1:02:03 Wrap up' }
            ]
        })
        expect( videos['bench-1'].rawData.contentDetails.videoId ).toBe( 'bench-1' )
        expect( videos['plain-1'] ).toMatchObject({ tags: [], timestamps: [] })
    } )
} )
