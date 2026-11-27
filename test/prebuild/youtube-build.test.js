import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe( 'saveYouTubeVideos', () => {
    const fetchMock = vi.fn()
    let originalCwd
    let workDir

    beforeEach( async () => {
        originalCwd = process.cwd()
        workDir = await mkdtemp( join( tmpdir(), 'youtube-build-' ) )
        process.chdir( workDir )
        vi.stubGlobal( 'fetch', fetchMock )
        vi.stubEnv( 'VIDEO_SOURCE', 'https://videos.example.test/youtube-videos.json' )
    } )

    afterEach( async () => {
        process.chdir( originalCwd )
        vi.unstubAllGlobals()
        vi.unstubAllEnvs()
        fetchMock.mockReset()
        await rm( workDir, { recursive: true, force: true } )
    } )

    it( 'copies the saved video snapshot into static/api unchanged', async () => {
        const snapshot = {
            'video-1': { title: 'A video', description: '', timestamps: [], tags: [ 'benchmark' ] }
        }

        fetchMock.mockResolvedValueOnce( new Response( JSON.stringify( snapshot ), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        } ) )

        const { saveYouTubeVideos, youtubeVideoPath } = await import( '~/helpers/api/youtube/build.js' )

        await saveYouTubeVideos()

        expect( String( fetchMock.mock.calls[0][0] ) ).toBe( 'https://videos.example.test/youtube-videos.json' )
        expect( JSON.parse( await readFile( youtubeVideoPath, 'utf8' ) ) ).toEqual( snapshot )
    } )

    it( 'fails the build when the snapshot cannot be fetched', async () => {
        fetchMock.mockResolvedValueOnce( new Response( JSON.stringify({ error: 'not found' }), { status: 404 } ) )

        const { saveYouTubeVideos } = await import( '~/helpers/api/youtube/build.js' )

        await expect( saveYouTubeVideos() ).rejects.toMatchObject({ status: 404 })
    } )
} )
