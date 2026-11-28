// doesitarm-mcp: public, read-only, stateless remote MCP server for Does It ARM.
// Streamable HTTP endpoint at /mcp, no auth.

const OPENAI_APPS_CHALLENGE = 'hq_KyAhk0VbVSvNvSQbX-RJK9SXWW1-JfraQ9UDwedg'

import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'

import { createDataSource } from './data.js'
import { handleInventoryUpload } from './inventory-http.js'
import { RAW_LIMITS } from './raw-inventory.js'
import { SERVER_DESCRIPTION, SERVER_ICONS, SERVER_INFO, SERVER_INSTRUCTIONS, SERVER_NAME, SERVER_VERSION, TOOL_COPY, TOOL_NAMES, createMcpServer } from './server.js'
import { INVENTORY_ROUTE, observeToolUsage, usageWriter } from './usage.js'

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

// Server card from the MCP server card extension (SEP-2127), served at the
// reserved <endpoint>/server-card location. The extension is still marked
// experimental and its $schema URL does not resolve yet, so the card is not
// advertised in an AI Catalog. It describes identity and transport only;
// live tools/list stays the source of truth for tools.
export const SERVER_CARD_SCHEMA = 'https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json'
export const SERVER_CARD_CONTENT_TYPE = 'application/mcp-server-card+json'

export function serverCardV1 () {
    return {
        $schema: SERVER_CARD_SCHEMA,
        name: SERVER_NAME,
        title: SERVER_INFO.title,
        description: SERVER_DESCRIPTION,
        version: SERVER_VERSION,
        websiteUrl: SERVER_INFO.websiteUrl,
        icons: SERVER_ICONS,
        repository: {
            url: 'https://github.com/ThatGuySam/doesitarm',
            source: 'github',
            subfolder: 'workers/mcp',
        },
        remotes: [
            {
                type: 'streamable-http',
                url: 'https://mcp.doesitarm.com/mcp',
                supportedProtocolVersions: SUPPORTED_PROTOCOL_VERSIONS,
            },
        ],
    }
}

function infoPage ( origin ) {
    const endpoint = `${ origin }/mcp`
    const vscodeConfig = encodeURIComponent( JSON.stringify({ type: 'http', url: endpoint }) )
    const cursorConfig = encodeURIComponent( btoa( JSON.stringify({ url: endpoint }) ) )
    const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Does It ARM MCP server</title>
<meta name="description" content="${ SERVER_DESCRIPTION } Public, read-only MCP server from Does It ARM.">
<link rel="icon" type="image/png" sizes="256x256" href="${ SERVER_ICONS[0].src }">
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:46rem;margin:2rem auto;padding:0 1rem;color:#e5e7eb;background:#111827}a{color:#93c5fd}code,pre{background:#1f2937;border-radius:6px;padding:.15rem .35rem}pre{padding:.75rem;overflow:auto}</style>
</head><body>
<h1><img src="${ SERVER_ICONS[0].src }" alt="" width="48" height="48" style="vertical-align:middle;border-radius:10px;margin-right:.5rem">Does It ARM MCP server</h1>
<p>${ SERVER_DESCRIPTION } The public <a href="https://doesitarm.com">Does It ARM</a> <a href="https://modelcontextprotocol.io">MCP</a> server is read-only and requires no account. Connect over Streamable HTTP at the endpoint below. See the <a href="https://github.com/ThatGuySam/doesitarm/blob/master/docs/mcp.md">tool reference and examples</a>.</p>
<p>Endpoint (Streamable HTTP): <code>${ endpoint }</code></p>
<h2>Install</h2>
<p><a href="https://insiders.vscode.dev/redirect/mcp/install?name=doesitarm&amp;config=${ vscodeConfig }">Add to VS Code</a> · <a href="https://cursor.com/install-mcp?name=doesitarm&amp;config=${ cursorConfig }">Add to Cursor</a></p>
<p><b>Claude</b> (Settings → Connectors → Add custom connector): paste <code>${ endpoint }</code></p>
<p><b>Claude Code</b></p>
<pre>claude mcp add --transport http doesitarm ${ endpoint }</pre>
<p><b>Cursor</b> (<code>~/.cursor/mcp.json</code>) / <b>VS Code</b> (<code>.vscode/mcp.json</code>, use <code>"servers"</code>)</p>
<pre>{ "mcpServers": { "doesitarm": { "url": "${ endpoint }" } } }</pre>
<h2>Inventory REST API</h2>
<p><code>POST ${ origin }/v1/inventory</code> checks raw Mac app exports. The response is the same JSON returned by <code>check_inventory</code>. Uploads are processed in memory and are never stored, cached, or logged.</p>
<pre>curl -H 'Content-Type: text/csv' --data-binary @inventory.csv '${ origin }/v1/inventory'</pre>
<p><a href="https://github.com/ThatGuySam/doesitarm/blob/master/docs/mcp.md#rest-inventory-api">Supported formats and upload examples</a></p>
<h2>Tools</h2>
<ul>${ TOOL_NAMES.map( name => `<li><code>${ name }</code> — ${ TOOL_COPY[ name ].title }</li>` ).join('') }</ul>
<p>Results link back to the matching doesitarm.com page. Docs: <a href="https://github.com/ThatGuySam/doesitarm/blob/master/docs/mcp.md">docs/mcp.md</a> · <a href="/mcp/server-card">server card</a> · <a href="/.well-known/mcp/server-card.json">legacy server card</a></p>
<p><a href="https://doesitarm.com/privacy">Privacy Policy</a> · <a href="https://doesitarm.com/terms">Terms of Use</a></p>
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

function dataSource ( env ) {
    return sharedData ||= createDataSource({ apiUrl: env?.PUBLIC_API_DOMAIN })
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

    const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
        // JSON-RPC can escape each raw text byte to a six-byte sequence.
        maxRequestBodySize: 6 * RAW_LIMITS.maxBytes + 16 * 1024,
    })

    const markToolResult = env?.MCP_USAGE && observeToolUsage( transport, usageWriter( env.MCP_USAGE, request ) )
    const server = createMcpServer( dataSource( env ), markToolResult )
    await server.connect( transport )
    return transport.handleRequest( request )
}

async function handleInventory ( request, url, env ) {
    if ( request.method === 'OPTIONS' ) return { response: new Response( null, { status: 204 } ) }
    if ( request.method !== 'POST' ) {
        return { response: json( { error: 'Method not allowed. Use POST.' }, 405, { Allow: 'POST, OPTIONS', 'Cache-Control': 'no-store' } ) }
    }
    if ( await rateLimited( request, env ) ) {
        return { response: json( { error: 'Rate limit exceeded. Try again in a minute.' }, 429, { 'Retry-After': '60', 'Cache-Control': 'no-store' } ) }
    }
    return handleInventoryUpload( request, url.searchParams, dataSource( env ) )
}

export async function handleRequest ( request, env = {} ) {
    const url = new URL( request.url )
    const origin = url.origin

    if ( url.pathname === INVENTORY_ROUTE ) {
        const started = Date.now()
        const { response, rows } = await handleInventory( request, url, env )
        const status = response.status
        const result = response.ok ? 'ok' : status === 429 || status >= 500 ? 'error' : 'invalid'
        if ( env?.MCP_USAGE ) usageWriter( env.MCP_USAGE, request )( INVENTORY_ROUTE, result, started, { rows } )
        return withCors( response )
    }

    if ( request.method === 'OPTIONS' ) {
        return new Response( null, { status: 204, headers: CORS_HEADERS } )
    }

    if ( url.pathname === '/mcp/server-card' && ( request.method === 'GET' || request.method === 'HEAD' ) ) {
        return withCors( json( serverCardV1(), 200, { 'Content-Type': `${ SERVER_CARD_CONTENT_TYPE }; charset=utf-8` } ) )
    }

    if ( url.pathname === '/mcp' || url.pathname === '/mcp/' ) {
        const response = await handleMcp( request, env )
        if ( response ) {
            const result = withCors( response )
            if ( request.method === 'POST' ) result.headers.set( 'Cache-Control', 'no-store' )
            return result
        }
        return withCors( infoPage( origin ) )
    }

    if ( request.method !== 'GET' && request.method !== 'HEAD' ) {
        return withCors( new Response( 'Not found', { status: 404 } ) )
    }

    if ( url.pathname === '/' ) return withCors( infoPage( origin ) )

    if ( url.pathname === '/.well-known/mcp/server-card.json' || url.pathname === '/.well-known/mcp.json' ) {
        return withCors( json( serverCard( origin ) ) )
    }

    // OpenAI plugin directory domain verification for this MCP host.
    if ( url.pathname === '/.well-known/openai-apps-challenge' ) {
        return new Response( OPENAI_APPS_CHALLENGE, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } } )
    }

    if ( url.pathname === '/health' ) return withCors( json( { ok: true }, 200, { 'Cache-Control': 'no-store' } ) )

    if ( url.pathname === '/robots.txt' ) {
        return new Response( 'User-agent: *\nAllow: /\n', { headers: { 'Content-Type': 'text/plain' } } )
    }

    return withCors( new Response( 'Not found. The MCP endpoint is /mcp.', { status: 404 } ) )
}
