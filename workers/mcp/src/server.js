import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

import { OUTPUT_SCHEMAS } from './schemas.js'
import {
    MAX_CHECK_NAMES,
    ToolInputError,
    checkApps,
    getApp,
    listByCategory,
    listCategories,
    listDevices,
    recentUpdates,
    searchApps,
} from './tools.js'
import { FIELD_LIMITS, FILTERS, INVENTORY_LIMITS, TARGETS, checkInventory } from './inventory.js'
import { RAW_FORMATS, RAW_FORMAT_ERROR, RAW_LIMITS, RAW_SIZE_ERROR } from './raw-inventory.js'

export const SERVER_DESCRIPTION = 'Check Apple Silicon compatibility for Mac apps, games, and Homebrew formulae.'

// Registry name, also reported as the runtime serverInfo.name so the
// protocol identity, server.json and the server card agree.
export const SERVER_NAME = 'com.doesitarm/mcp'
export const SERVER_VERSION = '1.4.0'

export const SERVER_ICONS = [
    { src: 'https://doesitarm.com/images/mcp-icon-256.png', mimeType: 'image/png', sizes: [ '256x256' ] },
]

export const SERVER_INFO = {
    name: SERVER_NAME,
    title: 'Does It ARM',
    version: SERVER_VERSION,
    description: SERVER_DESCRIPTION,
    websiteUrl: 'https://doesitarm.com',
    icons: SERVER_ICONS,
}

export const SERVER_INSTRUCTIONS = 'Does It ARM is a read-only catalog of reported Apple Silicon compatibility for Mac apps, games, and Homebrew formulae, with reference pages for Mac models. Results link to the relevant catalog pages when available. A missing listing means compatibility is unknown from this catalog. Unreported means native support has yet to be reported.'

export const UNAVAILABLE_TEXT = 'The Does It ARM catalog is temporarily unavailable. Retry in a moment, or consult https://doesitarm.com/.'

const STATUS_DESCRIPTION = 'Filter by reported status. native means native support, rosetta means Rosetta 2, no means unsupported, no-in-progress means support is in progress, and unreported means native support has yet to be reported. Omit to include any status.'
const KIND_DESCRIPTION = 'Limit results to app (Mac app), game, or homebrew (formula). Defaults to all, which covers all three.'

const STATUS = z.enum([ 'native', 'rosetta', 'no', 'no-in-progress', 'unreported' ])
const SEARCH_KIND = z.enum([ 'app', 'game', 'homebrew', 'all' ])

function limitSchema ( max, fallback, description ) {
    const error = `limit must be a whole number from 1 to ${ max }. Omit it to use the default of ${ fallback }.`
    return z.number({ error }).int({ error }).min( 1, { error } ).max( max, { error } ).default( fallback ).describe( description )
}

const READ_ONLY = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
}

// Title and description for each tool. The title goes in both tool.title and
// annotations.title so clients that read either field show the same label.
export const TOOL_COPY = {
    search_apps: {
        title: 'Search Apple Silicon Compatibility',
        description: 'Find Does It ARM listings for a Mac app, game, or Homebrew formula by name, alias, or bundle ID. Returns ranked candidates with reported Apple Silicon status and listing links. Useful when the exact listing is unclear.',
    },
    get_app: {
        title: 'Get Compatibility Listing Details',
        description: 'Read one Does It ARM listing for a Mac app, game, Homebrew formula, or Mac model. A Does It ARM listing path or URL identifies the catalog record directly. A name or slug can resolve to the best catalog match. A miss may include suggestions. Details can include app version history, device support, game reports, related videos, or Mac model specifications.',
    },
    check_apps: {
        title: 'Compare Apple Silicon Compatibility',
        description: `Check reported Apple Silicon compatibility for up to ${ MAX_CHECK_NAMES } software names in one call, including lists for a Mac migration. Returns the best Does It ARM catalog match, reported status, and listing link for each distinct name. Names without a sufficiently close match are marked as not listed.`,
    },
    list_categories: {
        title: 'List Compatibility Categories',
        description: 'Discover the categories available in the Does It ARM catalog. Returns each category’s slug, listing count, and page link, plus compatibility percentages across Mac apps, games, and formulae when available.',
    },
    list_by_category: {
        title: 'Browse Compatibility by Category',
        description: 'Browse Mac apps, games, or Homebrew formulae in one Does It ARM category. Optionally filter by reported Apple Silicon status. Each page includes listing links and returns the next offset when more results are available.',
    },
    recent_updates: {
        title: 'List Recent App Compatibility Updates',
        description: 'See the latest dated Mac app compatibility updates in the Does It ARM catalog. Returns Apple Silicon status and listing links, newest update first.',
    },
    list_devices: {
        title: 'List Apple Silicon Mac Models',
        description: 'Find the Apple Silicon Mac models covered by Does It ARM. Returns model names, chips, availability dates when present, and links to the device pages. The listing detail tool can read a selected device page.',
    },
    check_inventory: {
        title: 'Check Mac App Inventory for Apple Silicon',
        description: `Check Apple Silicon compatibility for installed Mac apps from Jamf Pro, Iru Prism, Intune, Fleet, JumpCloud, MunkiReport, or system_profiler exports, or from up to ${ INVENTORY_LIMITS.maxRows } app-only rows. Raw exports are grouped by app, version and build and return device counts where available. Results include paged verdicts and evidence from version-scoped catalog statements and the ten most recent scanned versions per bundle ID. Name-only matches remain unknown and include a catalog hint where available.`,
    },
}

export const TOOL_NAMES = Object.keys( TOOL_COPY )

const INPUT_SCHEMAS = {
    search_apps: {
        query: z.string().min( 1 ).max( 200 ).describe( 'Mac app, game, or Homebrew formula name or alias, or a Mac app bundle ID such as com.spotify.client.' ),
        kind: SEARCH_KIND.default( 'all' ).describe( KIND_DESCRIPTION ),
        status: STATUS.optional().describe( STATUS_DESCRIPTION ),
        limit: limitSchema( 50, 10, 'Maximum number of ranked matches to return, from 1 to 50. Defaults to 10.' ),
    },
    get_app: {
        app: z.string().min( 1 ).max( 300 ).describe( 'One listing name, slug, or Does It ARM page path or URL, such as Spotify, /app/spotify, or https://doesitarm.com/app/spotify/.' ),
        kind: z.enum([ 'app', 'game', 'homebrew', 'device', 'all' ]).default( 'all' ).describe( 'For a name or slug, narrow the lookup to app, game, homebrew (formula), or device (Mac model). Defaults to all, which covers all four. A listing path or URL determines its own kind.' ),
    },
    check_apps: {
        names: z.array( z.string().max( 200 ) ).min( 1 ).max( MAX_CHECK_NAMES ).describe( `One to ${ MAX_CHECK_NAMES } software names, one per array item, such as Spotify or Docker. Blank entries are skipped and identical trimmed names are checked once.` ),
        kind: SEARCH_KIND.default( 'all' ).describe( KIND_DESCRIPTION ),
    },
    list_categories: {},
    list_by_category: {
        category: z.string().min( 1 ).max( 100 ).describe( 'Category slug or label, such as music-and-audio-tools or Homebrew.' ),
        status: STATUS.optional().describe( STATUS_DESCRIPTION ),
        limit: limitSchema( 100, 25, 'Maximum listings per page, from 1 to 100. Defaults to 25.' ),
        offset: z.number().int().min( 0 ).default( 0 ).describe( 'Number of matching listings to skip. Defaults to 0. For the next page, use nextOffset with the same category and status. A null nextOffset means the last page.' ),
    },
    recent_updates: {
        limit: limitSchema( 100, 20, 'Maximum updated app listings to return, from 1 to 100. Defaults to 20.' ),
    },
    list_devices: {},
    check_inventory: inventoryInputSchema(),
}

function inventoryInputSchema () {
    const field = ( name, description ) => z.string({ error: `${ name } must be a string.` }).optional().describe( `${ description } Up to ${ FIELD_LIMITS[ name ] } characters after trimming; longer values mark the row invalid.` )
    const rowsError = `rows must be an array of 1 to ${ INVENTORY_LIMITS.maxRows } objects with only name, bundle_id, version, build and publisher string fields.`
    const offsetError = `offset must be a whole number from 0 to ${ RAW_LIMITS.maxRows - 1 }. Omit it to start at 0.`
    const jsonError = 'json must be JSON text, an object, or an array.'

    return z.strictObject({
        rows: z.array( z.strictObject({
            name: field( 'name', 'App name as shown in the inventory, such as Slack or Slack.app.' ),
            bundle_id: field( 'bundle_id', 'CFBundleIdentifier, such as com.tinyspeck.slackmacgap. Matched before the name.' ),
            version: field( 'version', 'Installed CFBundleShortVersionString, as a string.' ),
            build: field( 'build', 'Installed CFBundleVersion, as a string.' ),
            publisher: field( 'publisher', 'Publisher or vendor name. Used only to group rows that have no bundle ID.' ),
        }, { error: rowsError }), { error: rowsError }).min( 1, { error: rowsError } ).max( INVENTORY_LIMITS.maxRows, { error: rowsError } ).optional()
            .describe( `App-only input, 1 to ${ INVENTORY_LIMITS.maxRows } rows with a nonblank name or bundle_id. Mutually exclusive with csv and json.` ),
        csv: z.string({ error: 'csv must be a string.' }).max( RAW_LIMITS.maxBytes, { error: RAW_SIZE_ERROR } ).optional()
            .describe( `Delimited export text. Recognized raw formats support 1 MiB and ${ RAW_LIMITS.maxRows } rows. App-only CSV or TSV supports ${ INVENTORY_LIMITS.maxRows } rows and 64 KiB. Mutually exclusive with rows and json.` ),
        json: z.union([ z.string().max( RAW_LIMITS.maxBytes, { error: RAW_SIZE_ERROR } ), z.looseObject({}), z.array( z.unknown() ) ], { error: jsonError }).optional()
            .describe( `Jamf Pro inventory or system_profiler export as JSON text, an object, or an array. Maximum 1 MiB and ${ RAW_LIMITS.maxRows } rows. Mutually exclusive with rows and csv.` ),
        format: z.enum( RAW_FORMATS, { error: RAW_FORMAT_ERROR } ).optional()
            .describe( 'Raw export profile for csv or json. Omission enables detection from the export headers or JSON shape.' ),
        target_macos: z.union( TARGETS.map( value => z.literal( value ) ), { error: `target_macos must be one of ${ TARGETS.join(', ') }. Omit it for architecture evidence only.` } ).optional()
            .describe( 'macOS major version to assess, 26, 27 or 28. 28 is the first release without general-purpose Rosetta 2. Omit for architecture evidence only.' ),
        filter: z.enum( FILTERS, { error: `filter must be one of ${ FILTERS.join(', ') }.` } ).default( 'all' ).describe( 'Return only rows with this status. Defaults to all. Counts always cover the whole batch.' ),
        offset: z.number({ error: offsetError }).int({ error: offsetError }).min( 0, { error: offsetError } ).max( RAW_LIMITS.maxRows - 1, { error: offsetError } ).default( 0 )
            .describe( 'Number of filtered unique rows to skip. Defaults to 0. Maximum 249 for app-only input and 4999 for raw exports. next_offset refers to the same input, target_macos, filter and catalog_revision.' ),
        limit: limitSchema( INVENTORY_LIMITS.maxLimit, INVENTORY_LIMITS.defaultLimit, `Maximum rows per page, from 1 to ${ INVENTORY_LIMITS.maxLimit }. Defaults to ${ INVENTORY_LIMITS.defaultLimit }.` ),
        catalog_revision: z.string({ error: 'catalog_revision must be a string.' }).max( INVENTORY_LIMITS.maxRevisionLength, { error: `catalog_revision must be at most ${ INVENTORY_LIMITS.maxRevisionLength } characters.` } ).optional()
            .describe( 'catalog_revision from the first page. A changed catalog returns an error so pages are not mixed across revisions.' ),
    })
}

const HANDLERS = {
    search_apps: searchApps,
    get_app: getApp,
    check_apps: checkApps,
    list_categories: listCategories,
    list_by_category: listByCategory,
    recent_updates: recentUpdates,
    list_devices: listDevices,
    check_inventory: checkInventory,
}

function wrap ( name, handler, data ) {
    return async ( args ) => {
        try {
            const { text, data: structured } = await handler( args || {}, data )
            return {
                content: [ { type: 'text', text } ],
                structuredContent: structured,
            }
        } catch ( error ) {
            if ( error instanceof ToolInputError ) {
                return { isError: true, content: [ { type: 'text', text: error.message } ] }
            }
            if ( name === 'check_inventory' ) console.error( 'doesitarm-mcp check_inventory failed' )
            else console.error( `doesitarm-mcp ${ name } failed:`, error )
            return { isError: true, content: [ { type: 'text', text: UNAVAILABLE_TEXT } ] }
        }
    }
}

export function createMcpServer ( data ) {
    const server = new McpServer( SERVER_INFO, { instructions: SERVER_INSTRUCTIONS } )

    for ( const name of TOOL_NAMES ) {
        const { title, description } = TOOL_COPY[ name ]
        server.registerTool( name, {
            title,
            description,
            inputSchema: INPUT_SCHEMAS[ name ],
            outputSchema: OUTPUT_SCHEMAS[ name ],
            annotations: { title, ...READ_ONLY },
        }, wrap( name, HANDLERS[ name ], data ) )
    }

    // The tool list is fixed and this stateless server has no stream for
    // list_changed notifications, so do not advertise them.
    server.server.registerCapabilities({ tools: { listChanged: false } })

    return server
}
