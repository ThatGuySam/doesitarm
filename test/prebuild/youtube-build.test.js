import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
    publishedYouTubeVideosUrl,
    saveYouTubeVideos,
    youtubeVideoPath
} from '~/helpers/api/youtube/build.js'

const primarySource = 'https://videos.example.test/youtube-videos.json'

function jsonResponse ( body, status = 200 ) {
    return new Response( JSON.stringify( body ), {
        status,
        headers: { 'Content-Type': 'application/json' }
    } )
}

async function readSavedVideos () {
    return JSON.parse( await readFile( youtubeVideoPath, 'utf8' ) )
}

describe( 'saveYouTubeVideos', () => {
    const fetchMock = vi.fn()
    let originalCwd
    let workDir

    beforeEach( async () => {
        originalCwd = process.cwd()
        workDir = await mkdtemp( join( tmpdir(), 'youtube-build-' ) )
        process.chdir( workDir )
        vi.stubGlobal( 'fetch', fetchMock )
        vi.spyOn( console, 'log' ).mockImplementation( () => {} )
        vi.spyOn( console, 'warn' ).mockImplementation( () => {} )
    } )

    afterEach( async () => {
        process.chdir( originalCwd )
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
        fetchMock.mockReset()
        await rm( workDir, { recursive: true, force: true } )
    } )

    it( 'copies the video snapshot into static/api unchanged', async () => {
        const snapshot = {
            'video-1': { title: 'A video', description: '', timestamps: [], tags: [ 'benchmark' ] }
        }

        fetchMock.mockResolvedValueOnce( jsonResponse( snapshot ) )

        await saveYouTubeVideos({ sources: [ primarySource ] })

        expect( String( fetchMock.mock.calls[0][0] ) ).toBe( primarySource )
        expect( await readSavedVideos() ).toEqual( snapshot )
    } )

    it( 'falls back to the next source when the first returns a non-JSON page', async () => {
        const snapshot = { 'video-2': { title: 'Fallback video' } }

        fetchMock
            .mockResolvedValueOnce( new Response( 'The deployment has been removed', { status: 200 } ) )
            .mockResolvedValueOnce( jsonResponse( snapshot ) )

        await saveYouTubeVideos({ sources: [ primarySource, publishedYouTubeVideosUrl ] })

        expect( String( fetchMock.mock.calls[1][0] ) ).toBe( publishedYouTubeVideosUrl )
        expect( await readSavedVideos() ).toEqual( snapshot )
        expect( console.warn ).toHaveBeenCalledWith( expect.stringContaining( primarySource ) )
    } )

    it( 'writes an empty list instead of failing when every source is broken', async () => {
        fetchMock
            .mockResolvedValueOnce( new Response( 'The deployment has been removed', { status: 200 } ) )
            .mockResolvedValueOnce( jsonResponse({ error: 'not found' }, 404 ) )

        await expect( saveYouTubeVideos({ sources: [ primarySource, publishedYouTubeVideosUrl ] }) ).resolves.toEqual( {} )

        expect( await readSavedVideos() ).toEqual( {} )
    } )

    it( 'rejects JSON that is not a video map', async () => {
        fetchMock.mockResolvedValueOnce( jsonResponse([ 'not', 'a', 'map' ]) )

        await saveYouTubeVideos({ sources: [ primarySource ] })

        expect( await readSavedVideos() ).toEqual( {} )
    } )

    it( 'tries the published API copy after VIDEO_SOURCE by default', async () => {
        vi.stubEnv( 'VIDEO_SOURCE', primarySource )
        fetchMock.mockResolvedValue( new Response( 'gone', { status: 200 } ) )

        await saveYouTubeVideos()

        expect( fetchMock.mock.calls.map( call => String( call[0] ) ) ).toEqual([
            primarySource,
            publishedYouTubeVideosUrl
        ])

        vi.unstubAllEnvs()
    } )
} )
