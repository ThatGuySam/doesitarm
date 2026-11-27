import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

import {
    MAX_CHECK_NAMES,
    checkApps,
    getApp,
    listByCategory,
    listCategories,
    listDevices,
    recentUpdates,
    searchApps,
} from './tools.js'

export const SERVER_INFO = {
    name: 'doesitarm',
    title: 'Does It ARM',
    version: '1.0.0',
    websiteUrl: 'https://doesitarm.com',
}

export const SERVER_INSTRUCTIONS = `Does It ARM (https://doesitarm.com) tracks whether Mac apps, games and Homebrew formulae run natively on Apple silicon (M-series and A-series Macs), run through Rosetta 2, or are unsupported.

- Use search_apps to find listings by name, alias or bundle ID; check_apps to check a whole list of apps at once (up to ${ MAX_CHECK_NAMES }); get_app for one listing's full page details.
- Statuses: native = runs natively on Apple silicon; rosetta = runs through Rosetta 2 translation; no = not supported; no-in-progress = not supported yet, support in progress; unreported = no native report yet.
- Every result includes the canonical doesitarm.com URL. Cite and link it when you share a result.
- Data is read-only and refreshed from the public site; if an app is not listed, suggest requesting it at https://github.com/ThatGuySam/doesitarm/issues.`

const STATUS = z.enum([ 'native', 'rosetta', 'no', 'no-in-progress', 'unreported' ])
const SEARCH_KIND = z.enum([ 'app', 'game', 'homebrew', 'all' ])

const READ_ONLY = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
}

function wrap ( handler, data ) {
    return async ( args ) => {
        try {
            const { text, data: structured } = await handler( args || {}, data )
            return {
                content: [ { type: 'text', text } ],
                structuredContent: structured,
            }
        } catch ( error ) {
            return {
                isError: true,
                content: [ { type: 'text', text: `Does It ARM data is temporarily unavailable: ${ error.message }` } ],
            }
        }
    }
}

export function createMcpServer ( data ) {
    const server = new McpServer( SERVER_INFO, { instructions: SERVER_INSTRUCTIONS } )

    server.registerTool( 'search_apps', {
        title: 'Search Apple silicon compatibility',
        description: 'Search Does It ARM listings by app name, alias or bundle ID and return each match\'s Apple silicon status (native, Rosetta, unsupported) with a link to its doesitarm.com page.',
        inputSchema: {
            query: z.string().min( 1 ).max( 200 ).describe( 'App, game or Homebrew formula name, alias, or bundle ID, e.g. "Photoshop" or "com.spotify.client"' ),
            kind: SEARCH_KIND.default( 'all' ).describe( 'Limit to Mac apps, games, Homebrew formulae, or all' ),
            status: STATUS.optional().describe( 'Only return listings with this status' ),
            limit: z.number().int().min( 1 ).max( 50 ).default( 10 ).describe( 'Maximum results' ),
        },
        annotations: { title: 'Search apps', ...READ_ONLY },
    }, wrap( searchApps, data ) )

    server.registerTool( 'get_app', {
        title: 'Get one listing',
        description: 'Get the full public details for one Does It ARM listing: status headline, category, aliases, last update, links, per-device support, bundle version history with architectures, game reports and related benchmark videos. Accepts a name, slug, or doesitarm.com URL. Also works for Mac device pages.',
        inputSchema: {
            app: z.string().min( 1 ).max( 300 ).describe( 'Name, slug, or URL, e.g. "Spotify", "spotify", or "https://doesitarm.com/app/spotify"' ),
            kind: z.enum([ 'app', 'game', 'homebrew', 'device', 'all' ]).default( 'all' ).describe( 'Which kind of listing to look up when a name is ambiguous' ),
        },
        annotations: { title: 'Get app details', ...READ_ONLY },
    }, wrap( getApp, data ) )

    server.registerTool( 'check_apps', {
        title: 'Check many apps at once',
        description: `Check Apple silicon status for a list of up to ${ MAX_CHECK_NAMES } app names in one call, for example everything in someone's Applications folder before they move to an Apple silicon Mac. Returns the best match and status for each name, or "not listed".`,
        inputSchema: {
            names: z.array( z.string().min( 1 ).max( 200 ) ).min( 1 ).max( MAX_CHECK_NAMES ).describe( 'App names to check' ),
            kind: SEARCH_KIND.default( 'all' ).describe( 'Limit to Mac apps, games, Homebrew formulae, or all' ),
        },
        annotations: { title: 'Check apps', ...READ_ONLY },
    }, wrap( checkApps, data ) )

    server.registerTool( 'list_categories', {
        title: 'List categories',
        description: 'List Does It ARM categories with listing counts and overall native/Rosetta/unsupported percentages.',
        inputSchema: {},
        annotations: { title: 'List categories', ...READ_ONLY },
    }, wrap( listCategories, data ) )

    server.registerTool( 'list_by_category', {
        title: 'List apps in a category',
        description: 'List Does It ARM listings in one category (for example music-and-audio-tools, developer-tools, games, homebrew), optionally filtered by status, with paging.',
        inputSchema: {
            category: z.string().min( 1 ).max( 100 ).describe( 'Category slug or label from list_categories' ),
            status: STATUS.optional().describe( 'Only return listings with this status' ),
            limit: z.number().int().min( 1 ).max( 100 ).default( 25 ).describe( 'Maximum results' ),
            offset: z.number().int().min( 0 ).default( 0 ).describe( 'Results to skip, for paging' ),
        },
        annotations: { title: 'List by category', ...READ_ONLY },
    }, wrap( listByCategory, data ) )

    server.registerTool( 'recent_updates', {
        title: 'Recently updated apps',
        description: 'List the most recently updated app listings on Does It ARM, newest first.',
        inputSchema: {
            limit: z.number().int().min( 1 ).max( 100 ).default( 20 ).describe( 'Maximum results' ),
        },
        annotations: { title: 'Recent updates', ...READ_ONLY },
    }, wrap( recentUpdates, data ) )

    server.registerTool( 'list_devices', {
        title: 'List Apple silicon Macs',
        description: 'List the Apple silicon Mac models that have device compatibility pages on Does It ARM.',
        inputSchema: {},
        annotations: { title: 'List devices', ...READ_ONLY },
    }, wrap( listDevices, data ) )

    return server
}
