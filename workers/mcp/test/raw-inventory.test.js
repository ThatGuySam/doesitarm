import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { handleRequest } from '../src/index.js'

const origin = 'https://mcp.doesitarm.com'
const fixtures = new URL( '../../../tools/inventory-import/test/fixtures/', import.meta.url )
const cases = [
    [ 'jamf-pro-applications.csv', 'jamf-pro-applications', [ 2, 1 ] ],
    [ 'jamf-pro-inventory.json', 'jamf-pro-inventory', [ 2, 1, 1 ] ],
    [ 'iru-prism-apps.csv', 'iru-prism-apps', [ 2, 1 ] ],
    [ 'intune-discovered-apps.csv', 'intune-discovered-apps', [ 2, 1, 1 ] ],
    [ 'fleet-report.csv', 'fleet-csv', [ 2, 1 ] ],
    [ 'jumpcloud-system-app.csv', 'jumpcloud-system-app', [ 2, 1 ] ],
    [ 'munkireport-applications.csv', 'munkireport-applications', [ 2, 1 ] ],
    [ 'system-profiler.json', 'system-profiler-json', [ 1, 1, 1 ] ],
]

async function mcp ( args, env ) {
    const response = await handleRequest( new Request( `${ origin }/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'check_inventory', arguments: args } }),
    }), env )
    return { response, body: await response.json() }
}

async function rest ( body, type = 'text/csv', query = '', env ) {
    const response = await handleRequest( new Request( `${ origin }/v1/inventory${ query }`, {
        method: 'POST',
        headers: type ? { 'Content-Type': type } : undefined,
        duplex: 'half',
        body,
    }), env )
    return { response, body: await response.json() }
}

const edgeCache = {
    put: vi.fn(),
    match: vi.fn(),
}

const fetchCatalog = vi.fn( async () => Response.json( [] ) )
const env = { PUBLIC_API_DOMAIN: 'https://catalog.example.test' }

afterEach( () => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

describe( 'raw inventory over MCP and REST', () => {
    it.each( cases )( 'accepts %s with auto-detection and an explicit profile', async ( filename, format, counts ) => {
        vi.stubGlobal( 'fetch', fetchCatalog )
        const file = readFileSync( new URL( filename, fixtures ), 'utf8' )
        const isJson = filename.endsWith( '.json' )
        const type = isJson ? 'application/json' : 'text/csv'
        const args = isJson ? { json: JSON.parse( file ) } : { csv: file }

        const { response: mcpResponse, body: { result } } = await mcp( args, env )
        expect( result.isError, result.content?.[0]?.text ).toBeFalsy()
        expect( mcpResponse.headers.get( 'Cache-Control' ) ).toBe( 'no-store' )
        const { structuredContent } = result
        expect( structuredContent.format ).toBe( format )
        expect( structuredContent.results.map( finding => finding.device_count ) ).toEqual( counts )
        expect( structuredContent.results.every( finding => finding.app.name ) ).toBe( true )
        expect( JSON.stringify( result ) ).not.toMatch( /synthetic|\/Applications\/|example\.invalid|000000000000000000009001|"900[12]"/i )

        const explicitArgs = isJson ? { json: file, format } : { ...args, format }
        expect( ( await mcp( explicitArgs, env ) ).body.result.structuredContent ).toEqual( structuredContent )

        const upload = await rest( file, type, '', env )
        expect( upload.response.status ).toBe( 200 )
        expect( upload.response.headers.get( 'Access-Control-Allow-Origin' ) ).toBe( '*' )
        expect( upload.response.headers.get( 'Cache-Control' ) ).toBe( 'no-store' )
        expect( upload.body ).toEqual( structuredContent )

        const form = new FormData()
        form.append( 'file', new Blob( [ file ] ), filename )
        const explicit = await rest( form, null, `?format=${ format }&limit=1&offset=1`, env )
        expect( explicit.response.status ).toBe( 200 )
        expect( explicit.body ).toEqual({ ...structuredContent, results: structuredContent.results.slice( 1, 2 ), next_offset: counts.length > 2 ? 2 : null })
    })

    it( 'counts distinct installations per tuple and preserves distinct builds', async () => {
        vi.stubGlobal( 'fetch', fetchCatalog )
        const csv = [
            'host_id,host_display_name,name,bundle_identifier,bundle_short_version,bundle_version',
            '1,shared-label,Example,com.example.app,1.0,1',
            '1,renamed-label,Example,com.example.app,1.0,1',
            '2,shared-label,Example,com.example.app,1.0,1',
            '1,renamed-label,Example,com.example.app,1.0,2',
        ].join( '\n' )
        const { body } = await rest( csv, 'text/csv', '', env )
        expect( body.counts ).toMatchObject({ received: 4, duplicates: 2, unique: 2 })
        expect( body.results.map( row => [ row.requested_build, row.device_count ] ) ).toEqual([ [ '1', 2 ], [ '2', 1 ] ])
    })

    it( 'paginates up to 5000 raw rows and rejects the next row for CSV and JSON', async () => {
        vi.stubGlobal( 'fetch', fetchCatalog )
        const header = 'host_id,name,bundle_identifier,bundle_short_version\n'
        const csv = header + Array.from( { length: 5000 }, ( _, index ) => `7,Example,com.example.app,${ index }\n` ).join('')
        const page = await rest( csv, 'text/csv', '?limit=1&offset=4999', env )
        expect( page.response.status ).toBe( 200 )
        expect( page.body.counts.unique ).toBe( 5000 )
        expect( page.body.results ).toMatchObject([ { requested_version: '4999', device_count: 1 } ])
        expect( page.body.next_offset ).toBeNull()

        const over = csv + '7,Example,com.example.app,5000\n'
        const json = { results: [ { id: '7', applications: Array.from( { length: 5001 }, () => ({ name: 'Example' }) ) } ] }
        for ( const [ body, type, args ] of [ [ over, 'text/csv', { csv: over } ], [ JSON.stringify( json ), 'application/json', { json } ] ] ) {
            const upload = await rest( body, type, '', env )
            expect( upload.response.status ).toBe( 413 )
            expect( upload.body.error ).toContain( '5000 raw rows' )
            const rpc = await mcp( args, env )
            expect( rpc.body.result ).toMatchObject({ isError: true, content: [ { text: upload.body.error } ] })
        }
    })

    it( 'enforces UTF-8 byte limits, including streaming and multipart uploads', async () => {
        const size = 1024 * 1024
        const file = 'é'.repeat( size / 2 + 1 )
        const stream = new ReadableStream({
            start ( controller ) {
                controller.enqueue( new TextEncoder().encode( file ) )
                controller.close()
            },
        })
        const form = new FormData()
        form.append( 'file', new Blob( [ file ], { type: 'text/csv' } ), 'export.csv' )

        for ( const upload of [ await rest( file ), await rest( stream ), await rest( form, null ) ] ) {
            expect( upload.response.status ).toBe( 413 )
            expect( upload.body.error ).toContain( '1048576 bytes' )
        }
        for ( const args of [ { csv: file }, { json: file }, { json: { device: file } }, { json: 'a'.repeat( size + 1 ) } ] ) {
            const { body } = await mcp( args )
            expect( body.result.isError ).toBe( true )
            expect( body.result.content[0].text ).toContain( '1048576 bytes' )
        }
    })

    it( 'keeps device values out of the response, cache and all console methods', async () => {
        vi.stubGlobal( 'fetch', fetchCatalog )
        vi.stubGlobal( 'caches', { default: edgeCache } )
        vi.spyOn( Date, 'now' ).mockReturnValue( Date.now() + 10 * 60 * 1000 )
        const spies = Object.getOwnPropertyNames( console ).filter( method => typeof console[method] === 'function' )
            .map( method => vi.spyOn( console, method ).mockImplementation( () => {} ) )
        const privateValue = 'PRIVATE-FIELD-5237'
        const csv = `host_id,host_display_name,user,serial,path,name,bundle_identifier,bundle_short_version\n${ privateValue },${ privateValue },${ privateValue },${ privateValue },/Users/${ privateValue },Example,com.example.app,1.0\n`
        const broken = csv + `"${ privateValue }\n`
        const parts = new FormData()
        parts.append( 'file', new Blob( [ broken ] ), `${ privateValue }.csv` )
        const calls = [
            () => mcp( { csv }, env ),
            () => rest( csv, 'text/csv', '', env ),
            () => mcp( { csv: broken }, env ),
            () => rest( parts, null, '', env ),
            () => mcp( { json: `{"device":"${ privateValue }"` }, env ),
            () => rest( `{"device":"${ privateValue }"`, 'application/json', '', env ),
            () => mcp( { csv, format: privateValue }, env ),
            () => rest( csv, 'text/csv', `?format=${ privateValue }`, env ),
        ]
        const responses = []
        for ( const call of calls ) responses.push( ( await call() ).body )
        const logCalls = spies.flatMap( spy => spy.mock.calls )
        expect( logCalls ).toEqual( [] )
        expect( JSON.stringify( responses ) ).not.toContain( privateValue )
        expect( responses[0].result.structuredContent.results[0].device_count ).toBe( 1 )
        expect( responses[1].results[0].device_count ).toBe( 1 )
        expect( responses[2].result ).toMatchObject({ isError: true })
        expect( responses[3].error ).toContain( 'malformed' )
        expect( responses[4].result.content[0].text ).toContain( 'Malformed JSON inventory' )
        expect( responses[5].error ).toContain( 'Malformed JSON inventory' )
        expect( responses[6].result.content[0].text ).toContain( 'Unknown inventory format' )
        expect( responses[7].error ).toContain( 'Unknown inventory format' )
        expect( edgeCache.put ).not.toHaveBeenCalled()
        expect( fetchCatalog ).toHaveBeenCalledWith( 'https://catalog.example.test/app-list.json', expect.objectContaining({ cf: { cacheTtl: 600, cacheEverything: true } }) )
        expect( JSON.stringify( fetchCatalog.mock.calls ) ).not.toContain( privateValue )
    })

    it( 'uses the MCP rate limiter and handles CORS preflight and invalid REST requests', async () => {
        const limit = vi.fn( async () => ({ success: false }) )
        const requestEnv = { ...env, MCP_RATE_LIMIT: { limit } }
        const upload = await rest( 'anything', 'text/csv', '', requestEnv )
        const rpc = await mcp( { csv: 'anything' }, requestEnv )
        expect( upload.response.status ).toBe( 429 )
        expect( rpc.response.status ).toBe( 429 )
        expect( upload.response.headers.get( 'Retry-After' ) ).toBe( '60' )
        expect( limit.mock.calls ).toEqual([ [ { key: 'unknown' } ], [ { key: 'unknown' } ] ])
        const preflight = await handleRequest( new Request( `${ origin }/v1/inventory`, { method: 'OPTIONS' } ), requestEnv )
        expect( preflight.status ).toBe( 204 )
        expect( preflight.headers.get( 'Access-Control-Allow-Origin' ) ).toBe( '*' )
        expect( limit ).toHaveBeenCalledTimes( 2 )
        expect( ( await handleRequest( new Request( `${ origin }/v1/inventory` ) ) ).status ).toBe( 405 )
        expect( ( await rest( 'anything', 'text/plain' ) ).response.status ).toBe( 415 )
        expect( ( await rest( 'anything', 'text/csv', '?limit=51' ) ).response.status ).toBe( 400 )
        expect( ( await rest( 'anything', 'text/csv', '?offset=5000' ) ).response.status ).toBe( 400 )
        expect( await ( await handleRequest( new Request( origin ) ) ).text() ).toContain( `POST ${ origin }/v1/inventory` )
    })
})
