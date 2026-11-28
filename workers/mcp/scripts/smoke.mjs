#!/usr/bin/env node
// Smoke test for a deployed Does It ARM MCP server.
// Usage: node scripts/smoke.mjs [https://mcp.doesitarm.com/mcp]
// Runs initialize, tools/list and a few tools/call requests, checks that real
// data comes back, that structuredContent matches each tool's outputSchema,
// and fails if raw scan data (Info.plist / Mach-O) leaks.

import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv'

const endpoint = process.argv[2] || process.env.MCP_URL || 'https://mcp.doesitarm.com/mcp'
const RAW_MARKERS = [ 'Macho Meta', 'Info Plist', 'CFBundleIdentifier', 'loadCommandsInfo', 'cputype', '.app.zip' ]

let id = 0
let failures = 0

async function rpc ( method, params ) {
    const response = await fetch( endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream',
            'Mcp-Protocol-Version': '2025-11-25',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
    })
    const raw = await response.text()
    if ( !response.ok ) throw new Error( `${ method } returned HTTP ${ response.status }: ${ raw.slice( 0, 300 ) }` )
    // Accept either a JSON body or a single SSE "data:" event.
    const body = raw.trim().startsWith('{') ? JSON.parse( raw ) : JSON.parse( raw.split('\n').find( line => line.startsWith('data:') ).slice( 5 ) )
    if ( body.error ) throw new Error( `${ method } error: ${ JSON.stringify( body.error ) }` )
    return { result: body.result, raw }
}

function check ( label, condition, detail = '' ) {
    console.log( `${ condition ? 'PASS' : 'FAIL' } ${ label }${ detail ? ` — ${ detail }` : '' }` )
    if ( !condition ) failures += 1
}

function noLeak ( label, raw ) {
    const leaked = RAW_MARKERS.filter( marker => raw.includes( marker ) )
    check( `${ label } has no raw scan dump`, leaked.length === 0, leaked.join(', ') )
}

const validator = new AjvJsonSchemaValidator()
const outputSchemas = {}

async function call ( name, args ) {
    const { result, raw } = await rpc( 'tools/call', { name, arguments: args } )
    noLeak( name, raw )
    if ( !result.isError && outputSchemas[ name ] ) {
        const { valid, errorMessage } = validator.getValidator( outputSchemas[ name ] )( result.structuredContent )
        check( `${ name } structuredContent matches outputSchema`, valid, errorMessage )
    }
    return { result, text: result.content?.[0]?.text || '', raw }
}

console.log( `Smoke testing ${ endpoint }` )

const init = await rpc( 'initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'doesitarm-smoke', version: '1.1.0' } } )
check( 'initialize', init.result.serverInfo?.name === 'doesitarm', `${ init.result.serverInfo?.name } ${ init.result.serverInfo?.version }, protocol ${ init.result.protocolVersion }` )
check( 'initialize description and instructions', Boolean( init.result.serverInfo?.description ) && /Apple Silicon/.test( init.result.instructions || '' ), init.result.serverInfo?.description )

const list = await rpc( 'tools/list', {} )
const tools = list.result.tools
const names = tools.map( tool => tool.name )
check( 'tools/list', names.length === 7, names.join(', ') )
for ( const tool of tools ) {
    outputSchemas[ tool.name ] = tool.outputSchema
    check( `${ tool.name } metadata`, Boolean( tool.title ) && tool.annotations?.title === tool.title && tool.annotations?.readOnlyHint === true && tool.outputSchema?.type === 'object', tool.title )
}

const search = await call( 'search_apps', { query: 'Spotify', limit: 3 } )
check( 'search_apps Spotify', search.text.includes('https://doesitarm.com/app/spotify'), search.text.split('\n')[1] )

const app = await call( 'get_app', { app: 'Spotify' } )
check( 'get_app Spotify', /Apple Silicon/i.test( app.text ) && app.result.structuredContent?.listing?.versionHistory?.length > 0, app.text.split('\n').slice( 0, 2 ).join(' | ') )

const bulk = await call( 'check_apps', { names: [ 'Photoshop', 'Logic Pro', 'Docker', 'Zoom', 'Definitely Not A Real App 123' ] } )
check( 'check_apps', bulk.result.structuredContent?.results?.length === 5, bulk.text.split('\n')[0] )

const categories = await call( 'list_categories', {} )
check( 'list_categories', categories.result.structuredContent?.categories?.length > 5, categories.text.split('\n')[0] )

const category = await call( 'list_by_category', { category: 'music-and-audio-tools', limit: 3 } )
check( 'list_by_category', category.result.structuredContent?.results?.length === 3, category.text.split('\n')[0] )

const recent = await call( 'recent_updates', { limit: 3 } )
check( 'recent_updates', recent.result.structuredContent?.results?.length === 3, recent.text.split('\n')[1] )

const devices = await call( 'list_devices', {} )
check( 'list_devices', devices.result.structuredContent?.results?.length > 0, `${ devices.result.structuredContent?.results?.length } devices` )

const formula = await call( 'get_app', { app: 'ffmpeg', kind: 'homebrew' } )
check( 'get_app ffmpeg (homebrew)', formula.text.includes('/formula/ffmpeg'), formula.text.split('\n')[1] )

const miss = await call( 'search_apps', { query: 'Definitely Not A Real App 123' } )
check( 'search_apps miss is an ordinary result', !miss.result.isError && miss.result.structuredContent?.total === 0, miss.text )

const blank = await call( 'check_apps', { names: [ ' ' ] } )
check( 'check_apps all blank is a recoverable error', blank.result.isError === true && blank.text.includes('non-blank'), blank.text )

const range = await call( 'search_apps', { query: 'Spotify', limit: 500 } )
check( 'search_apps limit out of range names the field', range.result.isError === true && range.text.includes('limit must be a whole number from 1 to 50'), range.text.split('\n').pop() )

console.log( failures === 0 ? 'All smoke checks passed.' : `${ failures } smoke check(s) failed.` )
process.exit( failures === 0 ? 0 : 1 )
