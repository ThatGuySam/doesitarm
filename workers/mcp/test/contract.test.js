// MCP contract tests: tool metadata, output schemas and error paths, checked
// through a real SDK client so the published JSON Schema is what gets tested.

import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv'

import { createDataSource } from '../src/data.js'
import { SERVER_DESCRIPTION, SERVER_INFO, SERVER_INSTRUCTIONS, TOOL_NAMES, UNAVAILABLE_TEXT, createMcpServer } from '../src/server.js'
import { handleRequest } from '../src/index.js'

const fixture = name => JSON.parse( readFileSync( new URL( `./fixtures/${ name }.json`, import.meta.url ), 'utf8' ) )
const serverJson = JSON.parse( readFileSync( new URL( '../server.json', import.meta.url ), 'utf8' ) )

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

async function connect ( data ) {
    const server = createMcpServer( data )
    const client = new Client({ name: 'contract-test', version: '0' })
    const [ clientTransport, serverTransport ] = InMemoryTransport.createLinkedPair()
    await Promise.all([ server.connect( serverTransport ), client.connect( clientTransport ) ])
    return client
}

const validator = new AjvJsonSchemaValidator()
let client
let tools

beforeAll( async () => {
    client = await connect( createDataSource({ fetchImpl: fakeFetch }) )
    tools = Object.fromEntries( ( await client.listTools() ).tools.map( tool => [ tool.name, tool ] ) )
})

// Calls a tool and checks structuredContent against the advertised outputSchema.
async function callValid ( name, args = {} ) {
    const result = await client.callTool({ name, arguments: args })
    expect( result.isError, result.content?.[0]?.text ).toBeFalsy()
    const check = validator.getValidator( tools[ name ].outputSchema )( result.structuredContent )
    expect( check.errorMessage ).toBeUndefined()
    expect( check.valid ).toBe( true )
    expect( result.content[0].type ).toBe('text')
    return result
}

describe( 'server identity', () => {
    it( 'reports identity, instructions and fixed tool list', () => {
        expect( client.getServerVersion() ).toMatchObject({ name: 'doesitarm', title: 'Does It ARM', version: '1.1.0', description: SERVER_DESCRIPTION })
        expect( client.getInstructions() ).toBe( SERVER_INSTRUCTIONS )
        expect( SERVER_INSTRUCTIONS.length ).toBeLessThan( 512 )
        expect( client.getServerCapabilities().tools.listChanged ).toBe( false )
    })

    it( 'matches server.json', () => {
        expect( serverJson.name ).toBe('com.doesitarm/mcp')
        expect( serverJson.version ).toBe( SERVER_INFO.version )
        expect( serverJson.description ).toBe( SERVER_DESCRIPTION )
        expect( serverJson.description.length ).toBeLessThanOrEqual( 100 )
        expect( serverJson.remotes ).toEqual([ { type: 'streamable-http', url: 'https://mcp.doesitarm.com/mcp' } ])
    })
})

describe( 'tool metadata', () => {
    it( 'keeps the seven callable names', () => {
        expect( Object.keys( tools ).sort() ).toEqual( [ ...TOOL_NAMES ].sort() )
        expect( TOOL_NAMES ).toHaveLength( 7 )
    })

    it( 'uses one title in both title fields, read-only hints and an output schema', () => {
        for ( const tool of Object.values( tools ) ) {
            expect( tool.title ).toBeTruthy()
            expect( tool.annotations.title ).toBe( tool.title )
            expect( tool.annotations ).toMatchObject({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true })
            expect( tool.description.length ).toBeGreaterThan( 80 )
            expect( tool.outputSchema?.type ).toBe('object')
            for ( const [ param, schema ] of Object.entries( tool.inputSchema.properties || {} ) ) {
                expect( schema.description, `${ tool.name }.${ param }` ).toBeTruthy()
            }
        }
    })

    it( 'advertises the real limits and defaults', () => {
        expect( tools.search_apps.inputSchema.properties.limit ).toMatchObject({ minimum: 1, maximum: 50, default: 10 })
        expect( tools.list_by_category.inputSchema.properties.limit ).toMatchObject({ minimum: 1, maximum: 100, default: 25 })
        expect( tools.recent_updates.inputSchema.properties.limit ).toMatchObject({ minimum: 1, maximum: 100, default: 20 })
        expect( tools.check_apps.inputSchema.properties.names.maxItems ).toBe( 50 )
        expect( tools.list_by_category.inputSchema.properties.offset.description ).toContain('nextOffset')
    })
})

describe( 'structuredContent matches outputSchema', () => {
    it( 'search_apps: hit, miss and status-filtered miss', async () => {
        const hit = await callValid( 'search_apps', { query: 'com.spotify.client' } )
        expect( hit.structuredContent.results[0].url ).toBe('https://doesitarm.com/app/spotify')

        const miss = await callValid( 'search_apps', { query: 'zzzz-not-an-app' } )
        expect( miss.structuredContent ).toEqual({ query: 'zzzz-not-an-app', total: 0, results: [] })
        expect( miss.content[0].text ).toBe('No Does It ARM listing matched “zzzz-not-an-app”. Compatibility is unknown from this catalog. Try a shorter name or a Mac app bundle ID.')

        const filtered = await callValid( 'search_apps', { query: 'spotify', status: 'rosetta' } )
        expect( filtered.structuredContent.total ).toBe( 0 )
        expect( filtered.content[0].text ).toContain('Omit status')
    })

    it( 'get_app: app, game, formula, device and both miss branches', async () => {
        const app = await callValid( 'get_app', { app: 'Spotify' } )
        expect( app.structuredContent ).toMatchObject({ found: true, listing: { kind: 'app' } })

        const game = await callValid( 'get_app', { app: 'https://doesitarm.com/game/among-us' } )
        expect( game.structuredContent.listing.kind ).toBe('game')

        const formula = await callValid( 'get_app', { app: 'ffmpeg', kind: 'homebrew' } )
        expect( formula.structuredContent.listing.kind ).toBe('homebrew')

        const deviceName = fixture('devices')[0].name
        const device = await callValid( 'get_app', { app: deviceName, kind: 'device' } )
        expect( device.structuredContent.listing.kind ).toBe('device')

        const byName = await callValid( 'get_app', { app: 'Totally Unknown App' } )
        expect( byName.structuredContent.found ).toBe( false )
        expect( byName.structuredContent.listing ).toBeUndefined()
        expect( Array.isArray( byName.structuredContent.suggestions ) ).toBe( true )

        const byUrl = await callValid( 'get_app', { app: 'https://doesitarm.com/app/not-a-real-listing' } )
        expect( byUrl.structuredContent ).toEqual({ found: false, query: 'https://doesitarm.com/app/not-a-real-listing', suggestions: [] })
        expect( byUrl.content[0].text ).toBe('No Does It ARM listing exists at https://doesitarm.com/app/not-a-real-listing. Try a search by software name.')
    })

    it( 'check_apps: hits, misses, blanks and duplicates', async () => {
        const result = await callValid( 'check_apps', { names: [ 'Spotify', '  ', 'Not A Real App', 'Spotify ', 'python' ] } )
        expect( result.structuredContent.results.map( entry => entry.query ) ).toEqual([ 'Spotify', 'Not A Real App', 'python' ])
        expect( result.structuredContent.results[1] ).toMatchObject({ found: false })
        expect( result.structuredContent.counts['not-listed'] ).toBe( 1 )
    })

    it( 'list_categories, list_by_category, recent_updates and list_devices', async () => {
        await callValid( 'list_categories' )

        const page = await callValid( 'list_by_category', { category: 'homebrew', limit: 2 } )
        expect( page.structuredContent ).toMatchObject({ found: true, category: 'homebrew', nextOffset: 2 })

        const last = await callValid( 'list_by_category', { category: 'Homebrew', limit: 2, offset: 2 } )
        expect( last.structuredContent.nextOffset ).toBeNull()

        const empty = await callValid( 'list_by_category', { category: 'homebrew', offset: 999 } )
        expect( empty.structuredContent ).toMatchObject({ found: true, results: [], nextOffset: null })

        const unknown = await callValid( 'list_by_category', { category: 'nope' } )
        expect( unknown.structuredContent ).toEqual({ found: false, category: 'nope' })
        expect( unknown.content[0].text ).toContain('“nope” is not a Does It ARM category. Call list_categories for valid category slugs.')

        await callValid( 'recent_updates', { limit: 3 } )
        const devices = await callValid( 'list_devices' )
        expect( devices.structuredContent.results.length ).toBeGreaterThan( 0 )
    })
})

describe( 'error paths', () => {
    it( 'rejects all-blank names with a recoverable message', async () => {
        const result = await client.callTool({ name: 'check_apps', arguments: { names: [ ' ', '' ] } })
        expect( result.isError ).toBe( true )
        expect( result.content[0].text ).toBe('Enter at least one non-blank software name in names.')
    })

    it( 'names the field and range when limit is out of bounds', async () => {
        const result = await client.callTool({ name: 'search_apps', arguments: { query: 'spotify', limit: 500 } })
        expect( result.isError ).toBe( true )
        expect( result.content[0].text ).toContain('limit must be a whole number from 1 to 50. Omit it to use the default of 10.')

        const recent = await client.callTool({ name: 'recent_updates', arguments: { limit: 0 } })
        expect( recent.content[0].text ).toContain('from 1 to 100. Omit it to use the default of 20.')
    })

    it( 'hides upstream details when the catalog is down', async () => {
        const errorLog = vi.spyOn( console, 'error' ).mockImplementation( () => {} )
        const down = await connect( createDataSource({ fetchImpl: () => Promise.resolve( new Response( 'boom', { status: 503 } ) ) }) )
        const result = await down.callTool({ name: 'search_apps', arguments: { query: 'spotify' } })
        expect( result.isError ).toBe( true )
        expect( result.content[0].text ).toBe( UNAVAILABLE_TEXT )
        expect( result.content[0].text ).not.toContain('503')
        expect( errorLog ).toHaveBeenCalled()
        errorLog.mockRestore()
    })

    it( 'returns a protocol error for an unknown tool', async () => {
        const result = await client.callTool({ name: 'not_a_tool', arguments: {} }).catch( error => ({ thrown: error }) )
        // The SDK reports unknown tools as an error result or a JSON-RPC error.
        expect( result.thrown || result.isError ).toBeTruthy()
    })
})

describe( 'legacy server card', () => {
    it( 'serves current identity without a dead schema or capability claims', async () => {
        const response = await handleRequest( new Request('https://mcp.doesitarm.com/.well-known/mcp/server-card.json') )
        const card = await response.json()
        expect( card.$schema ).toBeUndefined()
        expect( card.capabilities ).toBeUndefined()
        expect( card.serverInfo.version ).toBe('1.1.0')
        expect( card.description ).toBe( SERVER_DESCRIPTION )
        expect( card.transport.endpoint ).toBe('https://mcp.doesitarm.com/mcp')
        expect( card.tools ).toEqual( TOOL_NAMES )
    })
})
