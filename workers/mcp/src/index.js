// doesitarm-mcp: public, read-only, stateless remote MCP server for Does It ARM.
// Streamable HTTP endpoint at /mcp, no auth.

import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'

import { createDataSource } from './data.js'
import { SERVER_DESCRIPTION, SERVER_INFO, SERVER_INSTRUCTIONS, TOOL_COPY, TOOL_NAMES, createMcpServer } from './server.js'

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID',
    'Access-Control-Expose-Headers': 'Mcp-Session-Id, Mcp-Protocol-Version',
    'Access-Control-Max-Age': '86400',
}

// Protocol versions exercised end to end with tool calls and structured results.
export const SUPPORTED_PROTOCOL_VERSIONS = [ '2025-11-25', '2025-06-18' ]

// One data source per isolate so lists are shared between requests.
let sharedData = null

function withCors ( response ) {
    const headers = new Headers( response.headers )
    for ( const [ key, value ] of Object.entries( CORS_HEADERS ) ) headers.set( key, value )
    return new Response( response.body, { status: response.status, statusText: response.statusText, headers } )
}

function json ( body, status = 200, extra = {} ) {
    return new Response( JSON.stringify( body, null, 2 ), {
        status,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300', ...extra },
    })
}

// Legacy server card at /.well-known/mcp/server-card.json, kept for anyone
// who already reads it. Its format came from an earlier, closed proposal and
// has no resolvable schema, so it carries no $schema and no capability
// claims. Live tools/list is the source of truth for tools.
export function serverCard ( origin ) {
    return {
        version: '1.0',
        protocolVersion: SUPPORTED_PROTOCOL_VERSIONS[0],
        supportedProtocolVersions: SUPPORTED_PROTOCOL_VERSIONS,
        serverInfo: SERVER_INFO,
        description: SERVER_DESCRIPTION,
        documentationUrl: 'https://github.com/ThatGuySam/doesitarm/blob/master/docs/mcp.md',
        transport: { type: 'streamable-http', endpoint: `${ origin }/mcp` },
        authentication: { required: false },
        instructions: SERVER_INSTRUCTIONS,
        tools: TOOL_NAMES,
    }
}

function infoPage ( origin ) {
    const endpoint = `${ origin }/mcp`
    const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Does It ARM MCP server</title>
<meta name="description" content="${ SERVER_DESCRIPTION } Public, read-only MCP server from Does It ARM.">
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:46rem;margin:2rem auto;padding:0 1rem;color:#e5e7eb;background:#111827}a{color:#93c5fd}code,pre{background:#1f2937;border-radius:6px;padding:.15rem .35rem}pre{padding:.75rem;overflow:auto}</style>
</head><body>
<h1>🦾 Does It ARM MCP server</h1>
<p>${ SERVER_DESCRIPTION } The public <a href="https://doesitarm.com">Does It ARM</a> <a href="https://modelcontextprotocol.io">MCP</a> server is read-only and requires no account. Connect over Streamable HTTP at the endpoint below. See the <a href="https://github.com/ThatGuySam/doesitarm/blob/master/docs/mcp.md">tool reference and examples</a>.</p>
<p>Endpoint (Streamable HTTP): <code>${ endpoint }</code></p>
<h2>Install</h2>
<p><b>Claude</b> (Settings → Connectors → Add custom connector): paste <code>${ endpoint }</code></p>
<p><b>Claude Code</b></p>
<pre>claude mcp add --transport http doesitarm ${ endpoint }</pre>
<p><b>Cursor</b> (<code>~/.cursor/mcp.json</code>) / <b>VS Code</b> (<code>.vscode/mcp.json</code>, use <code>"servers"</code>)</p>
<pre>{ "mcpServers": { "doesitarm": { "url": "${ endpoint }" } } }</pre>
<h2>Tools</h2>
<ul>${ TOOL_NAMES.map( name => `<li><code>${ name }</code> — ${ TOOL_COPY[ name ].title }</li>` ).join('') }</ul>
<p>Results link back to the matching doesitarm.com page. Docs: <a href="https://github.com/ThatGuySam/doesitarm/blob/master/docs/mcp.md">docs/mcp.md</a> · <a href="/.well-known/mcp/server-card.json">legacy server card</a></p>
</body></html>`

    return new Response( html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' } } )
}

async function rateLimited ( request, env ) {
    if ( !env?.MCP_RATE_LIMIT ) return false
    const key = request.headers.get('CF-Connecting-IP') || 'unknown'
    try {
        const { success } = await env.MCP_RATE_LIMIT.limit({ key })
        return !success
    } catch {
        return false
    }
}

async function handleMcp ( request, env ) {
    if ( request.method === 'GET' ) {
        // Stateless server: no standalone SSE stream. Browsers get the info page.
        const accept = request.headers.get('Accept') || ''
        if ( accept.includes('text/event-stream') ) {
            return new Response( 'This stateless server does not offer a GET event stream. POST JSON-RPC messages to /mcp.', { status: 405, headers: { Allow: 'POST, OPTIONS' } } )
        }
        return null
    }

    if ( request.method === 'DELETE' ) {
        return new Response( null, { status: 405, headers: { Allow: 'POST, OPTIONS' } } )
    }

    if ( request.method !== 'POST' ) {
        return new Response( 'Method not allowed', { status: 405, headers: { Allow: 'GET, POST, OPTIONS' } } )
    }

    if ( await rateLimited( request, env ) ) {
        return json( { jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Rate limit exceeded. Try again in a minute.' } }, 429, { 'Retry-After': '60', 'Cache-Control': 'no-store' } )
    }

    sharedData = sharedData || createDataSource({ apiUrl: env?.PUBLIC_API_DOMAIN })
    const server = createMcpServer( sharedData )
    const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
    })

    await server.connect( transport )
    return transport.handleRequest( request )
}

export async function handleRequest ( request, env = {} ) {
    const url = new URL( request.url )
    const origin = url.origin

    if ( request.method === 'OPTIONS' ) {
        return new Response( null, { status: 204, headers: CORS_HEADERS } )
    }

    if ( url.pathname === '/mcp' || url.pathname === '/mcp/' ) {
        const response = await handleMcp( request, env )
        if ( response ) return withCors( response )
        return withCors( infoPage( origin ) )
    }

    if ( request.method !== 'GET' && request.method !== 'HEAD' ) {
        return withCors( new Response( 'Not found', { status: 404 } ) )
    }

    if ( url.pathname === '/' ) return withCors( infoPage( origin ) )

    if ( url.pathname === '/.well-known/mcp/server-card.json' || url.pathname === '/.well-known/mcp.json' ) {
        return withCors( json( serverCard( origin ) ) )
    }

    if ( url.pathname === '/health' ) return withCors( json( { ok: true }, 200, { 'Cache-Control': 'no-store' } ) )

    if ( url.pathname === '/robots.txt' ) {
        return new Response( 'User-agent: *\nAllow: /\n', { headers: { 'Content-Type': 'text/plain' } } )
    }

    return withCors( new Response( 'Not found. The MCP endpoint is /mcp.', { status: 404 } ) )
}

export default {
    fetch: ( request, env ) => handleRequest( request, env ),
}
