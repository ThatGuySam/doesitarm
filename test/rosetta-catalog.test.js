import { describe, expect, it, vi } from 'vitest'
import {
    fetchRosettaCatalog,
    findRosettaApps,
    getRosettaSearchQuery,
    loadRosettaCatalog,
    parseRosettaCatalog,
    rosettaSearchLength,
    rosettaStatus,
    summarizeRosettaCatalog
} from '../helpers/rosetta-catalog.js'
import { rosettaPage404 } from '../helpers/rosetta-launch.js'

const apps = [
    { name: 'Writer', endpoint: '/app/writer', aliases: ['Studio'], status: 'rosetta', category: { slug: 'productivity', label: 'Productivity' } },
    { name: 'Studio', endpoint: '/app/studio', aliases: ['Studio Mac'], status: 'native' },
    { name: 'Mix Board', endpoint: '/app/mix-board', status: 'rosetta', category: { slug: 'audio', label: 'Audio' } },
    { name: 'Audio Utility', endpoint: '/app/audio-utility', status: 'rosetta', category: { slug: 'audio', label: 'Audio' } },
    { name: 'Old Plug-in', endpoint: '/app/old-plug-in', status: 'no' },
    { name: 'Unverified Tool', endpoint: '/app/unverified-tool', status: 'unreported' },
    { name: 'Microsoft Office 365', endpoint: '/app/microsoft-office-365', status: 'native' }
]

describe( 'Rosetta catalog', () => {
    it( 'counts unknown apps separately and lists only Rosetta entries by category', () => {
        const summary = summarizeRosettaCatalog( apps )
        expect( summary.atRisk ).toBe( 3 )
        expect( summary.unknown ).toBe( 1 )
        expect( summary.categories.map( group => [group.name, group.apps.map( app => app.name )] ) )
            .toEqual( [['Audio', ['Audio Utility', 'Mix Board']], ['Productivity', ['Writer']]] )
    } )

    it( 'uses the four checker outcomes without treating unreported apps as supported', () => {
        expect( ['rosetta', 'native', 'no', 'no-in-progress', 'unreported', undefined].map( rosettaStatus ) )
            .toEqual( [
                'At risk (Rosetta)',
                'Native Apple silicon support reported',
                'Unsupported on Apple silicon',
                'Unsupported on Apple silicon',
                'Compatibility unknown',
                'Compatibility unknown'
            ] )
    } )

    it( 'keeps exact alias matches when an app shares the same name', () => {
        expect( findRosettaApps( apps, ' studio ' ).apps.map( app => app.name ) ).toEqual( ['Studio', 'Writer'] )
        expect( findRosettaApps( apps, 'STUDIO  MAC' ).apps.map( app => app.name ) ).toEqual( ['Studio'] )
    } )

    it( 'matches parts of names and reports a bounded list of results', () => {
        expect( findRosettaApps( apps, 'office' ).apps.map( app => app.name ) ).toEqual( ['Microsoft Office 365'] )
        expect( findRosettaApps( apps, 'not listed' ) ).toEqual( { apps: [], count: 0 } )

        const tools = Array.from( { length: 20 }, ( _, i ) => ({ name: `Tool ${ i }` }) )
        expect( findRosettaApps( tools, 'tool' ) ).toMatchObject( { count: 20 } )
        expect( findRosettaApps( tools, 'tool' ).apps ).toHaveLength( 8 )
    } )

    it( 'keeps an HTML-injection search as ordinary query text and does not produce a result for it', () => {
        const injection = '"><img src=x onerror=alert(1)>'
        const url = new URL( `https://doesitarm.com/rosetta-checker?q=${encodeURIComponent( injection )}` )
        const query = getRosettaSearchQuery( url.searchParams.get( 'q' ) )

        expect( query ).toBe( injection )
        expect( findRosettaApps( apps, query ) ).toEqual( { apps: [], count: 0 } )
        expect( getRosettaSearchQuery( 'x'.repeat( 500 ) ) ).toHaveLength( rosettaSearchLength )
    } )

    it.each( [
        ['unexpected status', { name: 'Bad', endpoint: '/app/bad', status: 'beta' }, ['bad'], 0],
        ['odd slug', { name: 'Bad', endpoint: '/app/bad%20slug', status: 'rosetta' }, [], 1],
        ['duplicate', { name: 'Bad', endpoint: '/app/writer/', status: 'native' }, ['writer'], 0],
        ['missing name', { endpoint: '/app/bad', status: 'rosetta' }, ['bad'], 0]
    ] )( 'skips and counts a single bad row with %s', ( _, row, invalidAppKeys, unkeyedRows ) => {
        const catalog = parseRosettaCatalog( [...apps, row] )

        expect( catalog ).toMatchObject( { badRows: 1, totalRows: 8, invalidAppKeys, unkeyedRows } )
        expect( catalog.apps.map( app => app.name ) ).toEqual( apps.map( app => app.name ) )
        expect( summarizeRosettaCatalog( catalog.apps ) ).toMatchObject( { atRisk: 3, unknown: 1 } )
    } )

    it( 'rejects a catalog with more than two percent bad rows', () => {
        const mostlyGood = Array.from( { length: 100 }, ( _, i ) => ( {
            name: `App ${i}`, endpoint: `/app/app-${i}`, status: 'native'
        } ) )
        mostlyGood[98] = null
        mostlyGood[99] = null
        expect( parseRosettaCatalog( mostlyGood ) ).toMatchObject( { badRows: 2, totalRows: 100 } )

        mostlyGood[97] = null
        expect( () => parseRosettaCatalog( mostlyGood ) ).toThrow( expect.objectContaining( {
            badRows: 3, totalRows: 100
        } ) )
    } )

    it( 'reuses one validated edge cache entry across different page URLs and searches', async () => {
        const entries = new Map()
        const cache = {
            match: vi.fn( async key => entries.get( key )?.clone() ),
            put: vi.fn( async ( key, response ) => entries.set( key, response ) )
        }
        const fetchCatalog = vi.fn( async () => Response.json( apps ) )
        const paths = ['/rosetta-at-risk', '/rosetta-checker?q=writer', '/rosetta-checker?q=studio']
        for ( const path of paths ) {
            const { origin } = new URL( path, 'https://cf.doesitarm.com' )
            await expect( loadRosettaCatalog( fetchCatalog, { cache, cacheOrigin: origin } ) )
                .resolves.toMatchObject( { badRows: 0, totalRows: apps.length } )
        }

        expect( fetchCatalog ).toHaveBeenCalledTimes( 1 )
        expect( cache.put ).toHaveBeenCalledTimes( 1 )
        const [key, response] = cache.put.mock.calls[0]
        expect( new URL( key ).origin ).toBe( 'https://cf.doesitarm.com' )
        expect( new URL( key ).search ).toBe( '' )
        expect( response.headers.get( 'Cache-Control' ) ).toBe( 'public, max-age=300' )
    } )

    it( 'rejects upstream errors and an empty catalog instead of reporting no risk', async () => {
        const cache = { match: vi.fn(), put: vi.fn() }
        await expect( loadRosettaCatalog( async () => new Response( null, { status: 503 } ), { cache } ) )
            .rejects.toThrow( 'request failed' )
        await expect( loadRosettaCatalog( async () => Response.json( [] ), { cache } ) )
            .rejects.toThrow( 'Invalid app catalog' )
        expect( cache.put ).not.toHaveBeenCalled()

        const fetchCatalog = vi.fn( async () => Response.json( apps ) )
        await expect( fetchRosettaCatalog( fetchCatalog ) ).resolves.toMatchObject( {
            badRows: 0, totalRows: apps.length
        } )
        expect( fetchCatalog ).toHaveBeenCalledWith(
            'https://api.doesitarm.com/app-list.json',
            expect.objectContaining( { cache: 'no-store', signal: expect.any( AbortSignal ) } )
        )
    } )
} )

describe( 'Rosetta launch switch', () => {
    it( 'rewrites to the site 404 without caching it when the launch switch is off', async () => {
        const html = '<h1>Page not found</h1>'
        const rewrite = vi.fn( async () => new Response( html, {
            status: 404, headers: { 'Cache-Control': 's-maxage=1', 'Content-Type': 'text/html' }
        } ) )
        const hidden = await rosettaPage404( rewrite )

        expect( rewrite ).toHaveBeenCalledWith( '/404' )
        expect( hidden.status ).toBe( 404 )
        expect( hidden.headers.get( 'Cache-Control' ) ).toBe( 'no-store' )
        await expect( hidden.text() ).resolves.toBe( html )
        expect( await rosettaPage404( rewrite, true ) ).toBeNull()
        expect( rewrite ).toHaveBeenCalledTimes( 1 )
    } )
} )
