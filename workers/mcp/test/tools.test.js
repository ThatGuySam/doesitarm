import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { createDataSource, endpointFromInput } from '../src/data.js'
import { checkApps, getApp, listByCategory, listCategories, listDevices, recentUpdates, scoreListing, searchApps } from '../src/tools.js'
import { handleRequest } from '../src/index.js'

const fixture = name => JSON.parse( readFileSync( new URL( `./fixtures/${ name }.json`, import.meta.url ), 'utf8' ) )

const apps = fixture('apps').filter( ( app, index, list ) => list.findIndex( other => other.slug === app.slug ) === index )

const routes = {
    '/app-list.json': apps,
    '/game-list.json': fixture('games'),
    '/homebrew-list.json': fixture('homebrew'),
    '/device-list.json': fixture('devices'),
    '/api/kind/index.json': fixture('categories'),
    '/api/all-apps-summary.json': fixture('summary'),
    '/api/app/spotify.json': fixture('spotify'),
    '/api/game/among-us.json': fixture('game'),
}

function fakeFetch ( url ) {
    const path = new URL( url ).pathname
    if ( path in routes ) return Promise.resolve( new Response( JSON.stringify( routes[ path ] ), { status: 200 } ) )
    return Promise.resolve( new Response( 'Not found', { status: 404 } ) )
}

const data = createDataSource({ fetchImpl: fakeFetch })

// Strings that only appear inside raw scan data (Info.plist / Mach-O dump).
const RAW_MARKERS = [ 'Macho Meta', 'Info Plist', 'CFBundle', 'loadCommandsInfo', 'cputype', 'Filename', '.app.zip' ]

function expectNoRawDump ( value ) {
    const serialized = JSON.stringify( value )
    for ( const marker of RAW_MARKERS ) expect( serialized ).not.toContain( marker )
}

describe( 'endpointFromInput', () => {
    it( 'accepts paths, slugs with kind and site URLs', () => {
        expect( endpointFromInput('https://doesitarm.com/app/spotify/benchmarks') ).toBe('/app/spotify')
        expect( endpointFromInput('/formula/ffmpeg') ).toBe('/formula/ffmpeg')
        expect( endpointFromInput('Spotify') ).toBeNull()
        expect( endpointFromInput('https://evil.example/app/spotify') ).toBeNull()
    })
})

describe( 'scoreListing', () => {
    it( 'prefers exact names, then aliases and bundle IDs', () => {
        const spotify = apps.find( app => app.slug === 'spotify' )
        expect( scoreListing( spotify, 'spotify' ) ).toBe( 100 )
        expect( scoreListing( spotify, 'Spotify Installer' ) ).toBeGreaterThanOrEqual( 90 )
        expect( scoreListing( spotify, 'com.spotify.client' ) ).toBe( 98 )
        expect( scoreListing( spotify, 'photoshop' ) ).toBe( 0 )
    })
})

describe( 'search_apps', () => {
    it( 'finds apps with status text and canonical URLs', async () => {
        const { text, data: result } = await searchApps( { query: 'spotify' }, data )
        expect( result.results[0] ).toMatchObject({ name: 'Spotify', kind: 'app', status: 'native', url: 'https://doesitarm.com/app/spotify' })
        expect( text ).toContain('https://doesitarm.com/app/spotify')
    })

    it( 'filters by kind and status', async () => {
        const { data: games } = await searchApps( { query: 'among', kind: 'game' }, data )
        expect( games.results.every( item => item.kind === 'game' ) ).toBe( true )

        const { data: none } = await searchApps( { query: 'spotify', status: 'rosetta' }, data )
        expect( none.total ).toBe( 0 )
    })

    it( 'explains when nothing matches', async () => {
        const { text } = await searchApps( { query: 'zzzz-not-an-app' }, data )
        expect( text ).toContain('No Does It ARM listing matched')
        expect( text ).toContain('Compatibility is unknown from this catalog')
    })
})

describe( 'get_app', () => {
    it( 'returns visible page details and no raw scan dump', async () => {
        const { text, data: result } = await getApp( { app: 'Spotify' }, data )
        const listing = result.listing

        expect( listing.name ).toBe('Spotify')
        expect( listing.statusText ).toContain('Native Apple Silicon')
        expect( listing.aliases ).toContain('Spotify Installer')
        expect( listing.category.slug ).toBe('entertainment-and-media-apps')
        expect( listing.versionHistory[0].bundleId ).toBe('com.spotify.client')
        expect( listing.versionHistory[0].versions[0].architectures ).toEqual([ 'X86' ])
        expect( listing.versionHistory[0].versions.length ).toBeLessThanOrEqual( 10 )
        expect( listing.relatedVideos.length ).toBe( 10 )
        expect( listing.relatedVideos[0].url ).toMatch( /^https:\/\/doesitarm\.com\/app\/spotify\/benchmarks#/ )
        expect( listing.deviceSupport[0].result ).toBe('✅')
        expect( text ).toContain('Bundle version history')

        expectNoRawDump( result )
        expectNoRawDump( text )
    })

    it( 'accepts a site URL and returns game reports', async () => {
        const { data: result, text } = await getApp( { app: 'https://doesitarm.com/game/among-us' }, data )
        expect( result.listing.kind ).toBe('game')
        expect( result.listing.reports[0].specs ).toContain('M1')
        expect( text ).toContain('Thomas Schranz')
    })

    it( 'falls back to list data when the detail file is missing', async () => {
        const { data: result } = await getApp( { app: 'NotchNook' }, data )
        expect( result.found ).toBe( true )
        expect( result.listing.lastUpdated ).toBeTruthy()
    })

    it( 'suggests close matches for unknown apps', async () => {
        const { data: result, text } = await getApp( { app: 'Totally Unknown App' }, data )
        expect( result.found ).toBe( false )
        expect( text ).toContain('No Does It ARM listing matched')
    })
})

describe( 'check_apps', () => {
    it( 'checks many names and reports unlisted ones', async () => {
        const { data: result, text } = await checkApps( { names: [ 'Spotify', 'python', 'Not A Real App', 'Spotify' ] }, data )
        expect( result.results ).toHaveLength( 3 )
        expect( result.results[0] ).toMatchObject({ found: true, status: 'native' })
        expect( result.results[2].found ).toBe( false )
        expect( text ).toContain('not listed')
    })

    it( 'caps the list at 50 names', async () => {
        const names = Array.from( { length: 80 }, ( _, index ) => `App ${ index }` )
        const { data: result } = await checkApps( { names }, data )
        expect( result.results ).toHaveLength( 50 )
    })
})

describe( 'categories, recent updates and devices', () => {
    it( 'lists categories with counts and summary', async () => {
        const { data: result, text } = await listCategories( {}, data )
        expect( result.categories.find( category => category.slug === 'games' ).count ).toBe( 2 )
        expect( text ).toContain('3764')
    })

    it( 'lists a category with paging', async () => {
        const { data: result } = await listByCategory( { category: 'homebrew', limit: 2 }, data )
        expect( result.total ).toBe( 3 )
        expect( result.nextOffset ).toBe( 2 )

        const { data: bad } = await listByCategory( { category: 'nope' }, data )
        expect( bad.found ).toBe( false )
    })

    it( 'sorts recent updates newest first', async () => {
        const { data: result } = await recentUpdates( { limit: 3 }, data )
        const dates = result.results.map( item => Date.parse( item.lastUpdated ) )
        expect( dates ).toEqual( [ ...dates ].sort( ( a, b ) => b - a ) )
    })

    it( 'lists devices', async () => {
        const { data: result } = await listDevices( {}, data )
        expect( result.results[0].url ).toMatch( /^https:\/\/doesitarm\.com\/device\// )
    })
})

describe( 'Worker HTTP handler', () => {
    it( 'serves an info page and CORS preflight', async () => {
        const page = await handleRequest( new Request('https://mcp.doesitarm.com/') )
        expect( page.status ).toBe( 200 )
        const html = await page.text()
        expect( html ).toContain('claude mcp add --transport http doesitarm')

        const vscode = new URL( html.match(/href="([^"]+)">Add to VS Code<\/a>/)[1].replace( '&amp;', '&' ) )
        const cursor = new URL( html.match(/href="([^"]+)">Add to Cursor<\/a>/)[1].replace( '&amp;', '&' ) )
        expect( vscode.origin + vscode.pathname ).toBe('https://insiders.vscode.dev/redirect/mcp/install')
        expect( cursor.origin + cursor.pathname ).toBe('https://cursor.com/install-mcp')
        expect( vscode.searchParams.get('name') ).toBe('doesitarm')
        expect( cursor.searchParams.get('name') ).toBe('doesitarm')
        expect( JSON.parse( vscode.searchParams.get('config') ) ).toEqual({ type: 'http', url: 'https://mcp.doesitarm.com/mcp' })
        expect( JSON.parse( atob( cursor.searchParams.get('config') ) ) ).toEqual({ url: 'https://mcp.doesitarm.com/mcp' })

        const preflight = await handleRequest( new Request( 'https://mcp.doesitarm.com/mcp', { method: 'OPTIONS' } ) )
        expect( preflight.status ).toBe( 204 )
        expect( preflight.headers.get('Access-Control-Allow-Origin') ).toBe('*')
    })

    it( 'answers initialize and tools/list over Streamable HTTP', async () => {
        const post = body => handleRequest( new Request( 'https://mcp.doesitarm.com/mcp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream', 'Mcp-Protocol-Version': '2025-06-18' },
            body: JSON.stringify( body ),
        }) )

        const init = await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } } })
        expect( init.status ).toBe( 200 )
        const initBody = await init.json()
        expect( initBody.result.serverInfo.name ).toBe('com.doesitarm/mcp')
        expect( initBody.result.serverInfo.icons[0].src ).toBe('https://doesitarm.com/images/mcp-icon-256.png')
        expect( initBody.result.instructions ).toContain('Apple Silicon')

        const list = await post({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
        const tools = ( await list.json() ).result.tools
        expect( tools.map( tool => tool.name ).sort() ).toEqual([ 'check_apps', 'check_inventory', 'get_app', 'list_by_category', 'list_categories', 'list_devices', 'recent_updates', 'search_apps' ])
        expect( tools.every( tool => tool.annotations.readOnlyHint === true ) ).toBe( true )
    })
})
