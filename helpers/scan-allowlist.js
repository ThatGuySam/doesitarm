// The one list of what a Does It ARM scan may send and publish.
//
// Scan contributions send ONLY:
//   - the Info.plist keys in INFO_PLIST_ALLOWED_KEYS, as string, number or
//     boolean values, each string capped at MAX_VALUE_LENGTH characters;
//   - `architectures`: the CPU architectures of the app's main executable
//     (names from ARCHITECTURE_NAMES), derived from its Mach-O headers;
//   - the pass/fail `result`, the app version and the app bundle base name
//     (for example "Slack.app") that the result store needs to match scans.
// Nothing else: no full Info.plist, no Mach-O metadata or load commands, no
// file paths, no feed URLs, no signing data.
//
// Published reports (app pages, the public API JSON) carry even less:
// see PUBLIC_SCAN_FIELDS and toPublicScanReport().
//
// The privacy policy (src/pages/privacy.astro) lists these same keys. Change
// both together.

export const MAX_VALUE_LENGTH = 256

export const INFO_PLIST_ALLOWED_KEYS = Object.freeze([
    'CFBundleIdentifier',
    'CFBundleName',
    'CFBundleDisplayName',
    'CFBundleShortVersionString',
    'CFBundleVersion',
    'CFBundlePackageType',
    'LSMinimumSystemVersion',
    'LSMinimumSystemVersionByArchitecture',
    'LSArchitecturePriority',
    'LSRequiresNativeExecution',
    'NSHumanReadableCopyright',
    'DTSDKName',
    'DTXcode',
])

export const ARCHITECTURE_NAMES = Object.freeze([
    'arm64',
    'arm64e',
    'x86_64',
    'x86_64h',
    'i386',
])

const APPLE_SILICON_ARCHITECTURES = new Set([ 'arm64', 'arm64e' ])
const INTEL_ARCHITECTURES = new Set([ 'x86_64', 'x86_64h', 'i386' ])

// Fields of a published scan report. Everything else stays in the private store.
export const PUBLIC_SCAN_FIELDS = Object.freeze([
    'App Version',
    'Result',
    'architectures',
    'minimumMacOS',
])

function isPlainObject ( value ) {
    return value !== null && typeof value === 'object' && !Array.isArray( value )
}

// A string, finite number or boolean, with strings trimmed and capped.
// Anything else (objects, arrays, dates, null) returns undefined.
export function cleanScalar ( value, maxLength = MAX_VALUE_LENGTH ) {
    if ( typeof value === 'string' ) return value.slice( 0, maxLength )
    if ( typeof value === 'number' ) return Number.isFinite( value ) ? value : undefined
    if ( typeof value === 'boolean' ) return value

    return undefined
}

// Copy only the allowlisted Info.plist keys with scalar values.
export function pickAllowedInfoPlist ( infoPlist ) {
    if ( !isPlainObject( infoPlist ) ) return null

    const picked = {}

    for ( const key of INFO_PLIST_ALLOWED_KEYS ) {
        if ( !Object.prototype.hasOwnProperty.call( infoPlist, key ) ) continue

        const value = cleanScalar( infoPlist[ key ] )
        if ( value === undefined ) continue

        picked[ key ] = value
    }

    return picked
}

function normalizeArchitectureName ( name ) {
    const value = String( name ).trim().toLowerCase()

    if ( ARCHITECTURE_NAMES.includes( value ) ) return value
    if ( value === 'x86-64' || value === 'amd64' ) return 'x86_64'
    if ( value === 'aarch64' ) return 'arm64'

    return null
}

// Map one parsed Mach-O architecture entry (from either scanner's parser:
// { processorType, processorSubType, bits, header: { cputype, cpusubtype } })
// to an architecture name, or null when it is not one we report.
export function architectureName ( architecture ) {
    if ( typeof architecture === 'string' ) return normalizeArchitectureName( architecture )
    if ( !isPlainObject( architecture ) ) return null

    const type = String( architecture.processorType ?? '' ).trim().toLowerCase()
    const subType = String( architecture.processorSubType ?? '' ).trim().toLowerCase()
    const header = isPlainObject( architecture.header ) ? architecture.header : {}
    const is64Bit = String( architecture.bits ?? '' ).includes( '64' ) ||
        type.includes( '64' ) ||
        ( Number( header.cputype ) & 0x01000000 ) !== 0

    const direct = normalizeArchitectureName( type )
    if ( direct ) return direct

    if ( type.includes( 'arm' ) ) {
        if ( !is64Bit ) return null
        if ( subType === '2' || subType === 'arm64e' ) return 'arm64e'
        return 'arm64'
    }

    if ( type.includes( 'x86' ) || type.includes( 'i386' ) ) {
        if ( !is64Bit ) return 'i386'
        if ( subType === '8' || subType === 'x86_64h' || subType === 'haswell' ) return 'x86_64h'
        return 'x86_64'
    }

    return null
}

// Derive the architecture list from Mach-O metadata. Accepts the object form
// ({ architectures: [...] }), the older array-of-files form, or a plain list.
export function architecturesFromMachoMeta ( machoMeta ) {
    let entries = []

    if ( Array.isArray( machoMeta ) ) {
        entries = machoMeta.flatMap( item => {
            if ( isPlainObject( item ) && Array.isArray( item.architectures ) ) return item.architectures
            return [ item ]
        } )
    } else if ( isPlainObject( machoMeta ) && Array.isArray( machoMeta.architectures ) ) {
        entries = machoMeta.architectures
    }

    const names = new Set()

    for ( const entry of entries ) {
        const name = architectureName( entry )
        if ( name ) names.add( name )
    }

    return ARCHITECTURE_NAMES.filter( name => names.has( name ) )
}

// "Slack.app.zip", "/Users/me/Downloads/Slack.zip" -> "Slack.app".
// Only the base name is kept, never a path.
export function appBundleBaseName ( filename ) {
    if ( typeof filename !== 'string' ) return null

    let name = filename.split( /[\\/]/ ).pop().trim()

    // Strip archive and installer extensions
    name = name.replace( /(\.(zip|dmg|pkg|tar|gz|tgz|bz2|xz|7z|rar))+$/i, '' )

    if ( name.length === 0 ) return null

    if ( !/\.app$/i.test( name ) ) name = `${ name }.app`

    return name.slice( 0, MAX_VALUE_LENGTH )
}

// The exact body a scanner POSTs to the result store. Field names match what
// doesitarm-functions api/test-results-store.js reads; machoMeta and infoPlist
// are JSON strings because the store writes them to sheet cells as is.
export function buildScanSubmission ({
    filename = null,
    appVersion = null,
    result = null,
    machoMeta = null,
    infoPlist = null,
} = {}) {
    const architectures = architecturesFromMachoMeta( machoMeta )
    const allowedInfoPlist = pickAllowedInfoPlist( infoPlist )

    return {
        filename: appBundleBaseName( filename ),
        appVersion: cleanScalar( appVersion ) ?? null,
        result: cleanScalar( result ) ?? null,
        architectures,
        machoMeta: JSON.stringify( machoMeta ? { architectures } : null ),
        infoPlist: JSON.stringify( allowedInfoPlist ),
    }
}

// "Universal", "Apple Silicon", "Intel" or null.
export function architectureLabel ( architectures = [] ) {
    const list = Array.isArray( architectures ) ? architectures : []
    const hasAppleSilicon = list.some( name => APPLE_SILICON_ARCHITECTURES.has( name ) )
    const hasIntel = list.some( name => INTEL_ARCHITECTURES.has( name ) )

    if ( hasAppleSilicon && hasIntel ) return 'Universal'
    if ( hasAppleSilicon ) return 'Apple Silicon'
    if ( hasIntel ) return 'Intel'

    return null
}

function parseMaybeJson ( value ) {
    if ( typeof value !== 'string' ) return value

    try {
        return JSON.parse( value )
    } catch {
        return null
    }
}

// Project a stored scan row (raw historical data from the result store, or an
// already projected report) to the fields we publish.
export function toPublicScanReport ( report ) {
    if ( !isPlainObject( report ) ) return null

    const infoPlist = pickAllowedInfoPlist( parseMaybeJson( report['Info Plist'] ) ) || {}

    const architectures = Array.isArray( report.architectures )
        ? architecturesFromMachoMeta( report.architectures )
        : architecturesFromMachoMeta( parseMaybeJson( report['Macho Meta'] ) )

    const minimumMacOS = typeof report.minimumMacOS === 'string'
        ? cleanScalar( report.minimumMacOS )
        : ( typeof infoPlist.LSMinimumSystemVersion === 'string' ? infoPlist.LSMinimumSystemVersion : null )

    return {
        'App Version': cleanScalar( report['App Version'] ) ?? '',
        'Result': cleanScalar( report['Result'] ) ?? '',
        architectures,
        minimumMacOS,
    }
}

// The most relevant scan for a bundle: the newest version reported native,
// otherwise the newest version. Mirrors how the scans feed picks the scan
// behind a listing's status. `versions` is the sorted [ version, report ] list.
export function selectRelevantScan ( versions = [] ) {
    if ( !Array.isArray( versions ) || versions.length === 0 ) return null

    const native = versions.find( ([ , report ]) => String( report?.Result ?? '' ).trim().startsWith( '✅' ) )

    return native || versions[0]
}

// The handful of label/value rows shown on an app page for one scan.
export function scanSummaryRows ({ bundleIdentifier, version, report }) {
    const publicReport = toPublicScanReport( report ) || { architectures: [], minimumMacOS: null }
    const label = architectureLabel( publicReport.architectures )

    return [
        [ 'App version', version ? String( version ) : null ],
        [ 'Bundle ID', bundleIdentifier || null ],
        [ 'Architectures', label ? `${ label } (${ publicReport.architectures.join( ', ' ) })` : null ],
        [ 'Minimum macOS', publicReport.minimumMacOS || null ],
    ].filter( ([ , value ]) => value !== null && String( value ).trim().length > 0 )
}
