import { DEFAULT_NEGOTIATED_PROTOCOL_VERSION, SUPPORTED_PROTOCOL_VERSIONS } from '@modelcontextprotocol/sdk/types.js'

import { TOOL_NAMES } from './server.js'

export const INVENTORY_ROUTE = '/v1/inventory'

const clientFamilies = new Map([
    [ 'claude', 'claude' ],
    [ 'claude-ai', 'claude' ],
    [ 'claude-code', 'claude-code' ],
    [ 'claude-desktop', 'claude-desktop' ],
    [ 'chatgpt', 'chatgpt' ],
    [ 'codex', 'codex' ],
    [ 'codex-mcp-client', 'codex' ],
    [ 'cursor', 'cursor' ],
    [ 'gemini-cli', 'gemini-cli' ],
    [ 'visual-studio-code', 'vscode' ],
    [ 'vscode', 'vscode' ],
    [ 'mcp-inspector', 'mcp-inspector' ],
    [ 'mcp-inspector-client', 'mcp-inspector' ],
])

function clientLabel ( info ) {
    const { name, version } = info ?? {}
    const family = typeof name === 'string' && name.length <= 64
        ? clientFamilies.get( name.trim().toLowerCase().replace( /[ _]+/g, '-' ) )
        : undefined
    if ( !family ) return 'unknown'
    const release = typeof version === 'string' && version.length <= 32
        ? /^v?(\d{1,3}(?:\.\d{1,3}){0,2})(?:[-+][a-z0-9.+-]+)?$/i.exec( version.trim() )?.[1]
        : undefined
    return release ? `${ family }/${ release }` : family
}

function inventoryBucket ( rows ) {
    if ( !Number.isSafeInteger( rows ) || rows < 0 ) return 'unknown'
    if ( rows === 0 ) return '0'
    if ( rows <= 10 ) return '1-10'
    if ( rows <= 100 ) return '11-100'
    if ( rows <= 1000 ) return '101-1000'
    return '1001+'
}

export function usageWriter ( dataset, request ) {
    const country = request.cf?.country
    const protocol = request.headers.get( 'MCP-Protocol-Version' ) ?? DEFAULT_NEGOTIATED_PROTOCOL_VERSION

    return ( name, result, started, { client = 'unknown', rows } = {} ) => {
        try {
            const rest = name === INVENTORY_ROUTE
            dataset?.writeDataPoint({
                indexes: [ name ],
                blobs: [
                    name,
                    client,
                    result,
                    /^[A-Z]{2}$/.test( country ) ? country : 'unknown',
                    !rest && SUPPORTED_PROTOCOL_VERSIONS.includes( protocol ) ? protocol : 'unknown',
                    rest || name === 'check_inventory' ? inventoryBucket( rows ) : '',
                ],
                doubles: [ Math.max( 0, Date.now() - started ) ],
            })
        } catch {
            // Analytics Engine queues writes in the runtime. A failed marker is disposable.
        }
    }
}

export function observeToolUsage ( transport, write ) {
    const calls = new Map()
    let initializedClient
    transport.onmessage = message => {
        if ( message.method === 'initialize' ) {
            initializedClient = clientLabel( message.params?.clientInfo )
        }
        if ( message.method !== 'tools/call' || message.id === undefined ) return
        const name = TOOL_NAMES.includes( message.params?.name ) ? message.params.name : 'unknown'
        calls.set( message.id, {
            name,
            started: Date.now(),
            client: clientLabel( message.params?._meta?.['io.modelcontextprotocol/clientInfo'] ),
        })
    }

    // Observe each SDK reply, including validation errors that bypass the tool handler.
    const send = transport.send.bind( transport )
    transport.send = ( message, options ) => {
        const call = calls.get( message.id )
        if ( call && ( message.result || message.error ) ) {
            calls.delete( message.id )
            let result = 'ok'
            if ( message.error ) {
                result = !call.outcome && [ -32600, -32602 ].includes( message.error.code ) ? 'invalid' : 'error'
            } else if ( message.result.isError ) {
                result = call.outcome === 'ok' ? 'error' : call.outcome ?? 'invalid'
            }
            const rows = result === 'ok' && call.name === 'check_inventory'
                ? message.result.structuredContent?.counts?.received
                : undefined
            write( call.name, result, call.started, {
                client: call.client === 'unknown' ? initializedClient ?? 'unknown' : call.client,
                rows,
            })
        }
        return send( message, options )
    }

    return ( id, outcome ) => {
        const call = calls.get( id )
        if ( call ) call.outcome = outcome
    }
}
