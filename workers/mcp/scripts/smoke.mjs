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

const init = await rpc( 'initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'doesitarm-smoke', version: '1.3.0' } } )
check( 'initialize', init.result.serverInfo?.name === 'com.doesitarm/mcp', `${ init.result.serverInfo?.name } ${ init.result.serverInfo?.version }, protocol ${ init.result.protocolVersion }` )
check( 'initialize icons', init.result.serverInfo?.icons?.[0]?.mimeType === 'image/png', init.result.serverInfo?.icons?.[0]?.src )
check( 'initialize description and instructions', Boolean( init.result.serverInfo?.description ) && /Apple Silicon/.test( init.result.instructions || '' ), init.result.serverInfo?.description )

const list = await rpc( 'tools/list', {} )
const tools = list.result.tools
const names = tools.map( tool => tool.name )
check( 'tools/list', names.length === 8 && names.includes('check_inventory'), names.join(', ') )
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

const SCANNER_URL = 'https://doesitarm.com/apple-silicon-app-test/?v=3'
const inventoryRows = [
    { name: 'Slack', bundle_id: 'com.tinyspeck.slackmacgap', version: '4.41.105' },
    { name: 'Docker', bundle_id: 'com.docker.docker', version: '4.36.0' },
    { name: 'Spotify', bundle_id: 'com.spotify.client', version: '1.2.7.1277.g2b3ce637' },
    { name: 'Microsoft Word', version: '16.89' },
    { name: 'Smoke Test Internal Tool', bundle_id: 'com.example.smoke-internal', version: '1.0' },
    { name: 'Slack', bundle_id: 'com.tinyspeck.slackmacgap', version: '4.41.105' },
]
const inventory = await call( 'check_inventory', { rows: inventoryRows, target_macos: 28 } )
const counts = inventory.result.structuredContent?.counts || {}
check( 'check_inventory mixed batch counts', counts.received === 6 && counts.duplicates === 1 && counts.unique === 5 && counts.native >= 2 && counts.unknown >= 2 && counts.native + counts.rosetta + counts.unsupported + counts.unknown === counts.unique, JSON.stringify( counts ) )
check( 'check_inventory matches by bundle ID first', inventory.result.structuredContent?.results?.[0]?.match === 'bundle_id' && inventory.result.structuredContent.results[0].catalog_hint?.url === 'https://doesitarm.com/app/slack', inventory.text.split('\n')[2] )
check( 'check_inventory scanner reference is the fixed URL', inventory.result.structuredContent?.scanner_reference?.url === SCANNER_URL && inventory.result.structuredContent.scanner_reference.catalog_submission === 'unavailable', inventory.result.structuredContent?.scanner_reference?.url )

const csvInventory = await call( 'check_inventory', { csv: 'name,bundle_identifier,bundle_short_version,bundle_version\nSlack,com.tinyspeck.slackmacgap,4.41.105,441050\n' } )
check( 'check_inventory osquery CSV', csvInventory.result.structuredContent?.counts?.native === 1 && csvInventory.result.structuredContent.scanner_reference === null, csvInventory.text.split('\n')[0] )

const badHeader = await call( 'check_inventory', { csv: 'name,hostname\nSlack,smoke-host' } )
check( 'check_inventory unknown header is a recoverable error without the value', badHeader.result.isError === true && badHeader.text.includes('column 2 is not recognized') && !badHeader.text.includes('smoke-host'), badHeader.text.slice( 0, 80 ) )

console.log( failures === 0 ? 'All smoke checks passed.' : `${ failures } smoke check(s) failed.` )
process.exit( failures === 0 ? 0 : 1 )
