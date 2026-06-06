import { afterEach, describe, expect, it, vi } from 'vitest'

import buildGamesList from '~/helpers/build-game-list.js'

const originalGamesSource = process.env.GAMES_SOURCE

afterEach(() => {
    vi.unstubAllGlobals()

    if ( originalGamesSource === undefined ) {
        delete process.env.GAMES_SOURCE
        return
    }

    process.env.GAMES_SOURCE = originalGamesSource
})

describe( 'game list builder', () => {
    it( 'builds from the committed Tosh game snapshot when GAMES_SOURCE is unavailable', async () => {
        delete process.env.GAMES_SOURCE

        const games = await buildGamesList()
        const amongUs = games.find( game => game.slug === 'among-us' )

        expect( games.length ).toBeGreaterThan( 20 )
        expect( amongUs ).toMatchObject({
            category: {
                slug: 'games'
            },
            endpoint: '/game/among-us',
            name: 'Among Us',
            status: 'native'
        })
        expect(
            amongUs.reports.some( report => report.Source === 'source\nyoutube' )
        ).toBe( true )
    })

    it( 'does not call the stale GAMES_SOURCE endpoint during builds', async () => {
        const fetchMock = vi.fn()
        vi.stubGlobal( 'fetch', fetchMock )
        process.env.GAMES_SOURCE = 'https://script.google.com/macros/s/stale-rhino-endpoint/exec'

        const games = await buildGamesList()

        expect( games.find( game => game.slug === 'among-us' ) ).toMatchObject({
            name: 'Among Us',
            status: 'native'
        })
        expect( fetchMock ).not.toHaveBeenCalled()
    })
})
