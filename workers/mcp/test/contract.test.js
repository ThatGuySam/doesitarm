// MCP contract tests: tool metadata, output schemas and error paths, checked
// through a real SDK client so the published JSON Schema is what gets tested.

import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv'

import { createDataSource } from '../src/data.js'
import { SERVER_DESCRIPTION, SERVER_ICONS, SERVER_INFO, SERVER_INSTRUCTIONS, TOOL_NAMES, UNAVAILABLE_TEXT, createMcpServer } from '../src/server.js'
import { SUPPORTED_PROTOCOL_VERSIONS, handleRequest } from '../src/index.js'
import { SCANNER_REFERENCE } from '../src/inventory.js'

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
        expect( client.getServerVersion() ).toMatchObject({ name: 'com.doesitarm/mcp', title: 'Does It ARM', version: '1.4.1', description: SERVER_DESCRIPTION })
        expect( client.getServerVersion().icons ).toEqual([ { src: 'https://doesitarm.com/images/mcp-icon-256.png', mimeType: 'image/png', sizes: [ '256x256' ] } ])
        expect( client.getInstructions() ).toBe( SERVER_INSTRUCTIONS )
        expect( SERVER_INSTRUCTIONS.length ).toBeLessThan( 512 )
        expect( client.getServerCapabilities().tools.listChanged ).toBe( false )
    })

    it( 'matches server.json', () => {
        expect( serverJson.name ).toBe('com.doesitarm/mcp')
        expect( serverJson.name ).toBe( SERVER_INFO.name )
        expect( serverJson.title ).toBe( SERVER_INFO.title )
        expect( serverJson.icons ).toEqual( SERVER_ICONS )
        expect( serverJson.version ).toBe( SERVER_INFO.version )
        expect( serverJson.description ).toBe( SERVER_DESCRIPTION )
        expect( serverJson.description.length ).toBeLessThanOrEqual( 100 )
        expect( serverJson.remotes ).toEqual([ { type: 'streamable-http', url: 'https://mcp.doesitarm.com/mcp' } ])
    })
})

describe( 'tool metadata', () => {
    it( 'keeps the seven original names and adds check_inventory', () => {
        expect( Object.keys( tools ).sort() ).toEqual( [ ...TOOL_NAMES ].sort() )
        expect( TOOL_NAMES ).toEqual([ 'search_apps', 'get_app', 'check_apps', 'list_categories', 'list_by_category', 'recent_updates', 'list_devices', 'check_inventory' ])
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
        expect( card.serverInfo.version ).toBe('1.4.1')
        expect( card.serverInfo.name ).toBe('com.doesitarm/mcp')
        expect( card.serverInfo.icons ).toEqual( SERVER_ICONS )
        expect( card.description ).toBe( SERVER_DESCRIPTION )
        expect( card.transport.endpoint ).toBe('https://mcp.doesitarm.com/mcp')
        expect( card.tools ).toEqual( TOOL_NAMES )
    })
})

describe( 'server card', () => {
    it( 'serves the extension card at <endpoint>/server-card, consistent with server.json', async () => {
        const response = await handleRequest( new Request('https://mcp.doesitarm.com/mcp/server-card') )
        expect( response.status ).toBe( 200 )
        expect( response.headers.get('Content-Type') ).toContain('application/mcp-server-card+json')
        expect( response.headers.get('Access-Control-Allow-Origin') ).toBe('*')
        const card = await response.json()
        expect( card.$schema ).toBe('https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json')
        expect( card.name ).toBe( SERVER_INFO.name )
        expect( card.version ).toBe( SERVER_INFO.version )
        expect( card.description ).toBe( SERVER_DESCRIPTION )
        expect( card.description.length ).toBeLessThanOrEqual( 100 )
        expect( card.icons ).toEqual( serverJson.icons )
        expect( card.repository ).toEqual( serverJson.repository )
        expect( card.remotes ).toEqual([ { ...serverJson.remotes[0], supportedProtocolVersions: SUPPORTED_PROTOCOL_VERSIONS } ])
        expect( card.tools ).toBeUndefined()
    })
})


describe( 'check_inventory', () => {
    const inventoryRoutes = {
        ...routes,
        '/app-list.json': [ ...apps, ...fixture('inventory-apps') ],
        '/api/app/legacy-tool.json': fixture('legacy-tool'),
    }
    const inventoryFetch = url => {
        const path = new URL( url ).pathname
        if ( path in inventoryRoutes ) return Promise.resolve( new Response( JSON.stringify( inventoryRoutes[ path ] ), { status: 200 } ) )
        return Promise.resolve( new Response( 'Not found', { status: 404 } ) )
    }
    let inv

    beforeAll( async () => {
        inv = await connect( createDataSource({ fetchImpl: inventoryFetch }) )
    })

    async function check ( args ) {
        const result = await inv.callTool({ name: 'check_inventory', arguments: args })
        expect( result.isError, result.content?.[0]?.text ).toBeFalsy()
        const valid = validator.getValidator( tools.check_inventory.outputSchema )( result.structuredContent )
        expect( valid.errorMessage ).toBeUndefined()
        const { counts } = result.structuredContent
        expect( counts.received ).toBe( counts.accepted + counts.invalid )
        expect( counts.unique ).toBe( counts.accepted - counts.duplicates )
        expect( counts.native + counts.rosetta + counts.unsupported + counts.unknown ).toBe( counts.unique )
        return result
    }

    async function fails ( args ) {
        const result = await inv.callTool({ name: 'check_inventory', arguments: args })
        expect( result.isError ).toBe( true )
        return result.content[0].text
    }

    it( 'publishes the memo title, annotations, limits and a strict input schema', () => {
        const tool = tools.check_inventory
        expect( tool.title ).toBe('Check Mac App Inventory for Apple Silicon')
        expect( tool.description ).toContain('Check Apple Silicon compatibility for installed Mac apps')
        expect( tool.description ).toContain('ten most recent scanned versions per bundle ID')
        expect( tool.inputSchema.additionalProperties ).toBe( false )
        expect( tool.inputSchema.properties.rows ).toMatchObject({ minItems: 1, maxItems: 250 })
        expect( tool.inputSchema.properties.rows.items.additionalProperties ).toBe( false )
        expect( tool.inputSchema.properties.limit ).toMatchObject({ minimum: 1, maximum: 50, default: 20 })
        expect( tool.inputSchema.properties.offset ).toMatchObject({ minimum: 0, maximum: 4999, default: 0 })
        expect( tool.inputSchema.properties.csv.maxLength ).toBe( 1048576 )
        expect( tool.inputSchema.properties.format.enum ).toHaveLength( 8 )
        expect( tool.outputSchema.properties.results.items.properties.device_count ).toBeDefined()
        expect( tool.inputSchema.properties.catalog_revision.maxLength ).toBe( 128 )
    })

    it( 'all matched: native by catalog statement, no scanner reference', async () => {
        const result = await check({ rows: [
            { name: 'Slack', bundle_id: 'com.tinyspeck.slackmacgap', version: '4.41.105' },
            { name: 'zoom.us.app', bundle_id: 'US.ZOOM.XOS', version: '6.2.11' },
        ] })
        const data = result.structuredContent
        expect( data.counts ).toMatchObject({ received: 2, unique: 2, native: 2, unknown: 0 })
        expect( data.scanner_reference ).toBeNull()
        expect( data.target_macos ).toBeNull()
        expect( data.results[0] ).toMatchObject({
            row: 1, match: 'bundle_id', status: 'native', unknown_reason: null, target_assessment: null,
            evidence: { basis: 'catalog_statement', observed_version: '4.13.0', source_url: 'https://doesitarm.com/app/slack' },
            catalog_hint: { title: 'Slack', url: 'https://doesitarm.com/app/slack', reported_status: 'native' },
        })
        expect( data.results[1].catalog_hint.url ).toBe('https://doesitarm.com/app/zoom')
        expect( result.content[0].text ).not.toContain('App Scanner')
    })

    it( 'mixed: scan evidence, target assessment, duplicates, invalid rows and paging', async () => {
        const rows = [
            { name: 'Legacy Tool', bundle_id: 'com.example.legacytool', version: '2.0' },
            { name: 'Slack', bundle_id: 'com.tinyspeck.slackmacgap', version: '4.41.105' },
            { name: 'Legacy Tool', bundle_id: 'com.example.legacytool', version: '3.0' },
            { publisher: 'Nobody' },
            { name: 'Slack', bundle_id: 'com.tinyspeck.slackmacgap', version: '4.41.105' },
            { name: 'Slack', bundle_id: 'com.tinyspeck.slackmacgap', version: '4.0' },
            { name: 'Slack', bundle_id: 'com.tinyspeck.slackmacgap' },
            { name: 'Spotify', bundle_id: 'com.spotify.client', version: '1.2.7.1277.g2b3ce637' },
            { name: 'LuLu', bundle_id: 'com.objective-see.lulu', version: '2.6' },
            { name: 'x'.repeat( 161 ) },
        ]
        const first = await check({ rows, target_macos: 28, limit: 4 })
        const data = first.structuredContent
        expect( data.counts ).toEqual({ received: 10, accepted: 8, invalid: 2, duplicates: 1, unique: 7, native: 2, rosetta: 1, unsupported: 0, unknown: 4 })
        expect( data.invalid_rows ).toEqual([ { row: 4, code: 'missing_identity' }, { row: 10, code: 'invalid_field' } ])
        expect( data.results.map( finding => finding.row ) ).toEqual([ 1, 2, 3, 6 ])
        expect( data.results[0] ).toMatchObject({ status: 'rosetta', target_assessment: 'rosetta_unavailable', evidence: { basis: 'binary_architecture', architectures: [ 'X86' ], observed_version: '2.0' } })
        expect( data.results[1] ).toMatchObject({ status: 'native', duplicate_rows: 1, target_assessment: 'needs_validation' })
        expect( data.results[2] ).toMatchObject({ status: 'native', evidence: { basis: 'binary_architecture', architectures: [ 'X86', 'ARM' ] } })
        // An older version than the catalog statement keeps the hint but not the status.
        expect( data.results[3] ).toMatchObject({ status: 'unknown', unknown_reason: 'version_unverified', target_assessment: 'unknown', catalog_hint: { reported_status: 'native' } })
        expect( data.next_offset ).toBe( 4 )
        expect( data.scanner_reference ).toEqual({ ...SCANNER_REFERENCE, unknown_rows: 4 })

        const second = await check({ rows, target_macos: 28, limit: 4, offset: 4, catalog_revision: data.catalog_revision })
        expect( second.structuredContent.results.map( finding => [ finding.row, finding.unknown_reason ] ) ).toEqual([ [ 7, 'version_missing' ], [ 8, 'conflicting_variants' ], [ 9, 'insufficient_evidence' ] ])
        expect( second.structuredContent.next_offset ).toBeNull()

        const unknownOnly = await check({ rows, filter: 'unknown' })
        expect( unknownOnly.structuredContent.filtered_count ).toBe( 4 )
        expect( unknownOnly.structuredContent.counts.unique ).toBe( 7 )

        const rosettaTarget27 = await check({ rows: rows.slice( 0, 1 ), target_macos: 27 })
        expect( rosettaTarget27.structuredContent.results[0].target_assessment ).toBe('rosetta_available_if_installed')
    })

    it( 'all unknown: fixed scanner reference with the unknown count', async () => {
        const result = await check({ rows: [ { name: 'In-House Tool One' }, { bundle_id: 'com.acme.private' } ] })
        const data = result.structuredContent
        expect( data.counts ).toMatchObject({ unique: 2, unknown: 2, native: 0 })
        expect( data.results.every( finding => finding.unknown_reason === 'unlisted' && finding.match === 'none' ) ).toBe( true )
        expect( data.scanner_reference ).toEqual({
            title: 'Does It ARM App Scanner v3 (preview)',
            url: 'https://doesitarm.com/apple-silicon-app-test/?v=3',
            scope: 'Local Mach-O architecture inspection and file export for selected Mac apps or folders.',
            catalog_submission: 'unavailable',
            unknown_rows: 2,
        })
        expect( result.content[0].text ).toContain('Local scan results are separate from the public catalog.')
    })

    it( 'scanner reference never takes values from the input', async () => {
        const result = await check({ rows: [ { name: 'https://evil.example/?v=3', bundle_id: 'https://evil.example' } ] })
        expect( result.structuredContent.scanner_reference.url ).toBe('https://doesitarm.com/apple-silicon-app-test/?v=3')
        expect( JSON.stringify( result.structuredContent ) ).not.toContain('evil.example')
        expect( result.content[0].text ).not.toContain('evil.example')
    })

    it( 'bundle ID beats the name; name-only, alias, ambiguous and conflicting rows stay unknown', async () => {
        const result = await check({ rows: [
            { name: 'Zoom', bundle_id: 'com.tinyspeck.slackmacgap', version: '4.41.105' },
            { name: 'Microsoft Word', version: '16.89' },
            { name: 'zoom.us', version: '6.2.11' },
            { name: 'Shared Notes', version: '5.0' },
            { name: 'Slack', bundle_id: 'com.example.fakeslack', version: '9.0' },
        ] })
        const [ byId, byName, byAlias, ambiguous, conflict ] = result.structuredContent.results
        expect( byId ).toMatchObject({ match: 'bundle_id', status: 'native', catalog_hint: { title: 'Slack' } })
        expect( byName ).toMatchObject({ match: 'name', status: 'unknown', unknown_reason: 'ambiguous_identity', evidence: null, catalog_hint: { title: 'Microsoft Word', reported_status: 'native' } })
        expect( byAlias ).toMatchObject({ match: 'alias', status: 'unknown', catalog_hint: { title: 'Zoom' } })
        expect( ambiguous ).toMatchObject({ match: 'ambiguous', status: 'unknown', unknown_reason: 'ambiguous_identity', catalog_hint: null })
        expect( ambiguous.candidates.map( entry => entry.title ).sort() ).toEqual([ 'Notes Plus', 'Notes Pro' ])
        expect( conflict ).toMatchObject({ match: 'none', status: 'unknown', unknown_reason: 'bundle_id_conflict', catalog_hint: null, candidates: [ { title: 'Slack', url: 'https://doesitarm.com/app/slack' } ] })
    })

    it( 'accepts CSV and TSV exports with BOM, CRLF, quotes and aliases', async () => {
        const csv = '﻿name,bundle_identifier,bundle_short_version,bundle_version\r\n"Slack, Inc. Slack",com.tinyspeck.slackmacgap,4.41.105,441050\r\n\r\nZoom,us.zoom.xos,"6.2.11",\r\n'
        const result = await check({ csv })
        expect( result.structuredContent.counts ).toMatchObject({ received: 2, native: 2 })
        expect( result.structuredContent.results[0] ).toMatchObject({ row: 1, requested_version: '4.41.105', requested_build: '441050' })
        expect( result.structuredContent.results[1].row ).toBe( 2 )

        const tsv = await check({ csv: 'ApplicationName\tApplicationVersion\tApplicationPublisher\nMicrosoft Word\t16.89\tMicrosoft Corporation\n' })
        expect( tsv.structuredContent.results[0] ).toMatchObject({ match: 'name', requested_version: '16.89' })
    })

    const SECRET = 'SENTINEL-acme-payroll-7731'

    it( 'limit and shape errors name the bound without echoing values', async () => {
        expect( await fails({}) ).toBe('Provide exactly one of rows, csv or json.')
        expect( await fails({ rows: [ { name: 'Slack' } ], csv: 'name\nSlack' }) ).toBe('Provide exactly one of rows, csv or json.')
        expect( await fails({ rows: [] }) ).toContain('rows must be an array of 1 to 250 objects')
        expect( await fails({ rows: Array.from( { length: 251 }, ( _, index ) => ({ name: `App ${ index }` }) ) }) ).toContain('rows must be an array of 1 to 250 objects')
        expect( await fails({ rows: [ { name: 'Slack', host: SECRET } ] }) ).not.toContain( SECRET )
        expect( await fails({ csv: `name\n${ Array.from( { length: 251 }, ( _, index ) => `App ${ index }` ).join('\n') }` }) ).toBe('csv accepts at most 250 data rows after the header; it has 251.')
        expect( await fails({ csv: `name\n${ 'é'.repeat( 40000 ) }` }) ).toBe('csv must be at most 65536 bytes of UTF-8 text.')
        expect( await fails({ csv: 'a'.repeat( 70000 ) }) ).toContain('csv must be at most 65536 bytes')
        expect( await fails({ csv: 'name' }) ).toContain('csv needs a header row and at least one data row.')
        expect( await fails({ csv: '' }) ).toContain('csv needs a header row and at least one data row.')
        const header = await fails({ csv: `name,${ SECRET }\nSlack,x` })
        expect( header ).toContain('csv header column 2 is not recognized. Allowed headers: name (')
        expect( header ).not.toContain( SECRET )
        expect( await fails({ csv: 'version,ApplicationVersion,name\n1,2,Slack' }) ).toBe('csv header columns 1 and 2 both map to version. Keep one.')
        expect( await fails({ csv: 'version,publisher\n1,x' }) ).toBe('csv needs a name or bundle_id column.')
        expect( await fails({ csv: `name\n"${ SECRET }` }) ).toContain('csv is malformed: a quoted field')
        const invalid = await fails({ rows: [ { publisher: SECRET }, { name: '   ' } ] })
        expect( invalid ).toContain('No valid rows. Each row needs a nonblank name or bundle_id')
        expect( invalid ).toContain('Invalid rows: 1, 2.')
        expect( invalid ).not.toContain( SECRET )
        expect( await fails({ rows: [ { name: 'Slack' } ], limit: 51 }) ).toContain('limit must be a whole number from 1 to 50. Omit it to use the default of 20.')
        expect( await fails({ rows: [ { name: 'Slack' } ], offset: 250 }) ).toContain('offset must be a whole number from 0 to 249.')
        expect( await fails({ rows: [ { name: 'Slack' } ], target_macos: 25 }) ).toContain('target_macos must be one of 26, 27, 28.')
        expect( await fails({ rows: [ { name: 'Slack', version: 4 } ] }) ).toContain('version must be a string. at rows[0].version')
        expect( await fails({ rows: [ { name: 'Slack' } ], catalog_revision: 'apps-0-0' }) ).toContain('catalog_revision no longer matches the current catalog.')
    })

    it( 'never writes inventory rows to logs, even when the catalog fails', async () => {
        const methods = [ 'log', 'info', 'warn', 'error', 'debug', 'trace' ]
        const spies = methods.map( method => vi.spyOn( console, method ).mockImplementation( () => {} ) )
        const rows = [ { name: SECRET, bundle_id: `com.${ SECRET }`, version: SECRET, build: SECRET, publisher: SECRET }, { name: 'Slack', bundle_id: 'com.tinyspeck.slackmacgap', version: '4.41.105' } ]

        await check({ rows })
        await check({ csv: `name,bundle_id\n${ SECRET },com.${ SECRET }\n` })
        await fails({ csv: `name,${ SECRET }\nx,y` })
        await fails({ rows: [ { publisher: SECRET } ] })

        const down = await connect( createDataSource({ fetchImpl: () => Promise.resolve( new Response( 'boom', { status: 503 } ) ) }) )
        const result = await down.callTool({ name: 'check_inventory', arguments: { rows } })
        expect( result.isError ).toBe( true )
        expect( result.content[0].text ).toBe( UNAVAILABLE_TEXT )

        const logged = spies.flatMap( spy => spy.mock.calls ).map( args => args.map( arg => arg instanceof Error ? `${ arg.message } ${ arg.stack }` : typeof arg === 'string' ? arg : JSON.stringify( arg ) ).join(' ') ).join('\n')
        expect( spies.find( ( _, index ) => methods[ index ] === 'error' ).mock.calls.length ).toBeGreaterThan( 0 )
        expect( logged ).not.toContain( SECRET )
        spies.forEach( spy => spy.mockRestore() )
    })
})
