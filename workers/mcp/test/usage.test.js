import { afterEach, describe, expect, it, vi } from 'vitest'

import { handleRequest } from '../src/index.js'
import worker from '../src/worker.js'

const origin = 'https://mcp.doesitarm.com'
const clientInfo = 'io.modelcontextprotocol/clientInfo'
const app = 'PrivateApp_MarkerTest'
const bundleId = 'com.private.markertest'
const query = 'PrivateQuery_MarkerTest'

function rpc ( id, method, params ) {
    return { jsonrpc: '2.0', id, method, params }
}

function call ( id, name, args, info ) {
    return rpc( id, 'tools/call', {
        name,
        arguments: args,
        ...(info ? { _meta: { [clientInfo]: info } } : {}),
    })
}

function request ( path, body, headers = {} ) {
    const req = new Request( origin + path, {
        method: 'POST',
        headers: {
            Accept: 'application/json, text/event-stream',
            'Content-Type': 'application/json',
            'CF-Connecting-IP': '192.0.2.15',
            'User-Agent': 'PrivateAgent_MarkerTest',
            ...headers,
        },
        body,
    })
    Object.defineProperty( req, 'cf', { value: { country: 'US', city: 'PrivateCity_MarkerTest' } } )
    return req
}

function binding () {
    return { MCP_USAGE: { writeDataPoint: vi.fn() } }
}

function expectPoints ( env, expected ) {
    const points = env.MCP_USAGE.writeDataPoint.mock.calls
    expect( points ).toHaveLength( expected.length )
    expect( points ).toEqual( expect.arrayContaining( expected.map( blobs => [{
        blobs,
        doubles: [ expect.any( Number ) ],
        indexes: [ blobs[0] ],
    }] ) ) )
    expect( points.every( ([point]) => Number.isFinite( point.doubles[0] ) && point.doubles[0] >= 0 ) ).toBe( true )
}

afterEach( () => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
} )

describe( 'privacy-safe request markers', () => {
    it( 'writes once per tool reply and strips query, arguments, unknown tool names and raw client metadata', async () => {
        vi.stubGlobal( 'fetch', vi.fn( async () => Response.json( [] ) ) )
        const env = binding()
        const payload = [
            call( 1, 'search_apps', { query }, { name: ' Claude Code ', version: 'v2.3.4+' + app.replaceAll( '_', '-' ) } ),
            call( 2, 'check_inventory', { rows: [{ name: app, bundle_id: bundleId }] }, { name: app, version: query } ),
            call( 3, 'search_apps', { query: [ query ] } ),
            call( 4, 'check_inventory', { json: { [app]: 'private_export' } } ),
            call( 5, app, { query: bundleId } ),
        ]
        const response = await worker.fetch( request( '/mcp', JSON.stringify( payload ), { 'MCP-Protocol-Version': '2025-11-25' } ), env )
        const replies = await response.json()
        expect( response.status ).toBe( 200 )
        expect( replies.map( row => row.result.isError ?? false ) ).toEqual( [ false, false, true, true, true ] )
        expectPoints( env, [
            [ 'search_apps', 'claude-code/2.3.4', 'ok', 'US', '2025-11-25', '' ],
            [ 'check_inventory', 'unknown', 'ok', 'US', '2025-11-25', '1-10' ],
            [ 'search_apps', 'unknown', 'invalid', 'US', '2025-11-25', '' ],
            [ 'check_inventory', 'unknown', 'invalid', 'US', '2025-11-25', 'unknown' ],
            [ 'unknown', 'unknown', 'invalid', 'US', '2025-11-25', '' ],
        ] )
    } )

    it( 'does not link initialize calls to separate requests or count lifecycle calls', async () => {
        vi.stubGlobal( 'fetch', vi.fn( async () => Response.json( [] ) ) )
        const env = binding()
        const init = rpc( 1, 'initialize', {
            clientInfo: { name: 'Claude Code', version: '2.3.4' },
            capabilities: {},
            protocolVersion: '2025-11-25',
        } )
        const response = await handleRequest( request( '/mcp', JSON.stringify( init ) ), env )
        expect( (await response.json()).result.serverInfo.version ).toBe( '1.4.1' )
        expect( env.MCP_USAGE.writeDataPoint ).not.toHaveBeenCalled()
        const later = await handleRequest( request( '/mcp', JSON.stringify( call( 2, 'search_apps', { query } ) ) ), env )
        expect( later.status ).toBe( 200 )
        expectPoints( env, [[ 'search_apps', 'unknown', 'ok', 'US', '2025-03-26', '' ]] )
    } )

    it( 'writes only an inventory bucket for upload contents and never captures URL parameters', async () => {
        vi.stubGlobal( 'fetch', vi.fn( async () => Response.json( [] ) ) )
        const env = binding()
        const csv = `name,bundle_id,version\n${ app },${ bundleId },PrivateVersion_MarkerTest\n`
        const headers = { 'Content-Type': 'text/csv', 'MCP-Protocol-Version': '2025-11-25' }
        const valid = await handleRequest( request( `/v1/inventory?private=${ query }`, csv, headers ), env )
        const invalid = await handleRequest( request( `/v1/inventory?limit=${ query }`, csv, headers ), env )
        expect( valid.status ).toBe( 200 )
        expect( invalid.status ).toBe( 400 )
        expectPoints( env, [
            [ '/v1/inventory', 'unknown', 'ok', 'US', 'unknown', '1-10' ],
            [ '/v1/inventory', 'unknown', 'invalid', 'US', 'unknown', 'unknown' ],
        ] )
    } )

    it( 'preserves normal responses when writes throw', async () => {
        vi.stubGlobal( 'fetch', vi.fn( async () => Response.json( [] ) ) )
        const env = binding()
        env.MCP_USAGE.writeDataPoint.mockImplementation( () => { throw new Error( 'analytics unavailable' ) } )
        const mcp = await handleRequest( request( '/mcp', JSON.stringify( call( 1, 'search_apps', { query } ) ) ), env )
        const rest = await handleRequest( request( '/v1/inventory', null ), env )
        expect( (await mcp.json()).result.isError ).toBeFalsy()
        expect( rest.status ).toBe( 400 )
        expect( env.MCP_USAGE.writeDataPoint ).toHaveBeenCalledTimes( 2 )
    } )

    it( 'counts inventory rate limits, preflights and unsupported methods', async () => {
        const env = { ...binding(), MCP_RATE_LIMIT: { limit: async () => ({ success: false }) } }
        const url = origin + '/v1/inventory'
        expect( (await handleRequest( request( '/v1/inventory', null ), env )).status ).toBe( 429 )
        expect( (await handleRequest( new Request( url, { method: 'OPTIONS' } ), env )).status ).toBe( 204 )
        expect( (await handleRequest( new Request( url ), env )).status ).toBe( 405 )
        expectPoints( env, [
            [ '/v1/inventory', 'unknown', 'error', 'US', 'unknown', 'unknown' ],
            [ '/v1/inventory', 'unknown', 'ok', 'unknown', 'unknown', 'unknown' ],
            [ '/v1/inventory', 'unknown', 'invalid', 'unknown', 'unknown', 'unknown' ],
        ] )
    } )
} )
