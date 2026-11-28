// Submission helpers mirrored from helpers/scan-allowlist.js on master.
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
