import { describe, expect, it } from 'vitest'

import { isMacVideo, selectBenchmarkVideos } from '~/helpers/benchmark-videos.js'

const video = ( name, tags = [] ) => ({ name, tags })

describe( 'benchmark videos', () => {
    it( 'keeps Mac and Apple Silicon titles and drops general tech ones', () => {
        expect( isMacVideo( video( 'helldivers 2 | macbook pro m4 max — performance benchmark' ) ) ).toBe( true )
        expect( isMacVideo( video( 'The M6 Mac mini Had Me Checking My Numbers' ) ) ).toBe( true )
        expect( isMacVideo( video( 'M5 Ultra… Apple Wasn’t Messing Around' ) ) ).toBe( true )
        expect( isMacVideo( video( 'M1 MacBook Pro - Diva Beta Test in Logic Pro X' ) ) ).toBe( true )

        expect( isMacVideo( video( 'iPhone Duo. I got hands on. Erm...' ) ) ).toBe( false )
        expect( isMacVideo( video( '128GB AI Desktops… HUGE Price difference (ACTUALLY Tested)' ) ) ).toBe( false )
        expect( isMacVideo( video( '8 RTX Pro 6000’s Wasn’t What I Expected' ) ) ).toBe( false )
    } )

    it( 'uses the newest Mac benchmark as the hero', () => {
        const videos = [
            video( 'iPhone Duo. I got hands on. Erm...', [ 'benchmark' ] ),
            video( 'M6 MacBook Pro after a week… a developer’s machine' ),
            video( 'Cyberpunk 2077 — MacBook Pro M5 FPS Performance Test', [ 'benchmark', 'games' ] ),
            video( 'Stray on MacBook Air M4', [ 'benchmark', 'games' ] )
        ]

        const { macVideos, heroVideo } = selectBenchmarkVideos( videos )

        expect( heroVideo ).toBe( videos[2] )
        expect( macVideos ).toEqual( videos.slice( 1 ) )
    } )

    it( 'falls back to the newest Mac video, then the newest video', () => {
        const noBenchmarks = [ video( 'iPhone Duo' ), video( 'M6 Mac mini review' ) ]
        const noMacs = [ video( 'iPhone Duo' ), video( 'RTX Pro 6000' ) ]

        expect( selectBenchmarkVideos( noBenchmarks ).heroVideo ).toBe( noBenchmarks[1] )
        expect( selectBenchmarkVideos( noMacs ).heroVideo ).toBe( noMacs[0] )
    } )
} )
