// Decide whether a README entry absorbs a scanned app.
// See docs/app-name-collisions.md for the rules and the evidence behind them.

import { eitherMatches } from './matching.js'

// Bundle ID prefixes that name a wrapper or launcher, not the app's vendor.
// Electron's default ID, Automator stubs, Fluid web wrappers, Parallels
// Windows-app shims and CrossOver launchers.
const WRAPPER_BUNDLE_PREFIXES = [
    'com.electron.',
    'com.github.electron.',
    'com.apple.automator.',
    'com.fluidapp.',
    'com.parallels.winapp.',
    'com.codeweavers.crossoverhelper.',
]

// Leading bundle ID segments that are domain parts, not the vendor
const DOMAIN_SEGMENTS = new Set( 'com org net io co cc us jp ru uk de fr nl it at ch ca kr cn in pl no tv md ai app dev me info design download'.split( ' ' ) )

// README link hosts that say nothing about the app's vendor
const GENERIC_LINK_HOST = /(^|\.)(apple\.com|github\.com|github\.io|gitlab\.com|sourceforge\.net|sourceforge\.io|sjv\.io|prf\.hn)$/

// Vendors that now publish under another name, so old bundle IDs still count
const VENDOR_SUCCESSORS = {
    // Maxon acquired Red Giant: PluralEyes ships as com.redgiant.*
    redgiant: [ 'maxon' ],
}

// Pairs no rule can separate: the README name is the scan's own name plus a
// qualifier, or the scan's name plus extra words, and the bundle ID gives no
// usable vendor signal. Keyed by README name, values are scan bundle IDs.
export const SEPARATE_PRODUCTS = new Map( [
    // README name = scan name + qualifier
    [ 'Mail Designer 365', [ 'com.apple.mail' ] ],
    [ 'News Explorer', [ 'com.apple.news' ] ],
    [ 'Magic Window Air', [ 'com.joogps.Magic' ] ],
    [ 'Session for Mac', [ 'com.loki-project.messenger-desktop' ] ],
    [ 'start for Mac', [ 'com.tencent.start.mac.Start' ] ],
    [ 'AdBlock Pro for Safari', [ 'com.betafish.adblock-mac' ] ],
    [ 'Remote Buddy', [ 'com.sony.Remote' ] ],
    // Scan name = README name + extra words, from another vendor
    [ 'Anki', [ 'maccatalyst.social.street.MemoryAssistant' ] ],
    [ 'Dolphin', [ 'com.aldelaro5.dolphin-memory-engine' ] ],
    [ 'Surge', [ 'org.surge-synth-team.surge-xt' ] ],
    [ 'Vienna', [ 'at.co.vsl.viennaensemblepro', 'at.co.vsl.viennaensemblepro.au3', 'at.co.vsl.standalone' ] ],
] )

const squash = string => ( string || '' ).toLowerCase().replace( /[^\p{L}\p{N}]/gu, '' )
const wordsOf = string => ( string || '' ).toLowerCase().split( /[^\p{L}\p{N}]+/u ).filter( Boolean )

export function isWrapperBundleId ( bundleId ) {
    const id = ( bundleId || '' ).toLowerCase()

    return WRAPPER_BUNDLE_PREFIXES.some( prefix => id.startsWith( prefix ) )
}

// The vendor segment of a bundle ID, squashed: `com.blackmagic-design.X` gives
// `blackmagicdesign`. Empty when the ID has no usable vendor.
export function getBundleVendor ( bundleId ) {
    if ( isWrapperBundleId( bundleId ) ) return ''

    let segments = ( bundleId || '' ).toLowerCase().split( '.' ).filter( Boolean )

    if ( segments[ 0 ] === 'maccatalyst' ) segments = segments.slice( 1 )

    // Unity games use unity.<Company>.<Product>
    if ( segments[ 0 ] === 'unity' && segments.length > 2 ) return squash( segments[ 1 ] )

    if ( segments.length < 2 ) return ''

    let index = 0
    while ( index < segments.length - 1 && DOMAIN_SEGMENTS.has( segments[ index ] ) ) index++

    return squash( segments[ index ] )
}

function getBundleProductWords ( bundleId, vendor ) {
    const segments = ( bundleId || '' ).toLowerCase().split( '.' )
    const vendorIndex = segments.findIndex( segment => squash( segment ) === vendor )

    return new Set( segments.slice( vendorIndex + 1 ).flatMap( wordsOf ) )
}

function getLinkHostHint ( url ) {
    let host = ''

    try {
        host = new URL( url ).hostname
    } catch {
        return ''
    }

    if ( GENERIC_LINK_HOST.test( host ) ) return ''

    return squash( host.replace( /^www\./, '' ).replace( /\.[a-z]+$/, '' ) )
}

// Names in parentheses are alternative names: `X Lossless Decoder (XLD)`
function getAlternativeNames ( name ) {
    const alternatives = [ ...name.matchAll( /\(([^)]+)\)/g ) ].map( match => match[ 1 ].trim() )
    const withoutParentheses = name.replace( /\s*\([^)]*\)\s*/g, ' ' ).trim()

    return [ name, withoutParentheses, ...alternatives ]
        .filter( alternative => alternative.length > 0 )
        .map( alternative => alternative.toLowerCase() )
}

// Index of the alias's words inside the name's words, or -1
function findWordPosition ( nameWords, aliasWords ) {
    for ( let index = 0; index + aliasWords.length <= nameWords.length; index++ ) {
        if ( aliasWords.every( ( word, offset ) => nameWords[ index + offset ] === word ) ) return index
    }

    return -1
}

// Returns the scan alias that ties the scan to the README entry, or null.
export function findReadmeMatchAlias ( { name, url }, scan ) {
    const bundleId = scan.bundleIds?.[ 0 ] || ''
    const separate = SEPARATE_PRODUCTS.get( name ) || []

    if ( separate.some( id => id.toLowerCase() === bundleId.toLowerCase() ) ) return null

    const displayName = scan.aliases[ 0 ] || ''
    const vendor = getBundleVendor( bundleId )
    const squashedName = squash( name )
    const squashedBundleId = squash( bundleId )
    const linkHostHint = getLinkHostHint( url )
    const alternativeNames = getAlternativeNames( name )

    // The scan's vendor appears in the README name or the README link host
    const vendorAgrees = vendor.length >= 3 && ( squashedName.includes( vendor ) || linkHostHint.includes( vendor ) )

    const scanWords = new Set( [
        ...wordsOf( bundleId.replace( /\./g, ' ' ) ),
        ...scan.aliases.flatMap( wordsOf ),
        ...( VENDOR_SUCCESSORS[ vendor ] || [] ),
    ] )
    const squashedScanText = [ squashedBundleId, ...scan.aliases.map( squash ) ].join( ' ' )

    for ( const alias of scan.aliases ) {
        if ( typeof alias !== 'string' || alias.trim().length === 0 ) continue

        const lowerAlias = alias.toLowerCase()
        const isDisplayName = alias === displayName
        const isExact = alternativeNames.includes( lowerAlias )

        if ( !isExact && !eitherMatches( alias, name ) ) continue

        // Exact name: the scan's own name always counts. A secondary alias,
        // such as an executable name (`firefox` in Tor Browser), needs the
        // vendor or the README name in the bundle ID.
        if ( isExact ) {
            if ( isDisplayName || vendorAgrees || ( squashedName.length >= 3 && squashedBundleId.includes( squashedName ) ) ) return alias
            continue
        }

        // Partial matches from here on

        // Wrapper bundles carry another app's name
        if ( isWrapperBundleId( bundleId ) ) continue

        // A secondary alias that is only the vendor word (`Yandex`, `Maxon`)
        if ( !isDisplayName && vendor.length > 0 && squash( alias ) === vendor ) continue

        // README name inside a longer scan name
        if ( lowerAlias.length > name.length ) {
            if ( vendorAgrees ) return alias

            // Only the scan's own name, and only when it starts with the
            // README name: `Discord PTB`, not `Hello Kitty` or `Ironhidegames ... Steam`
            if ( isDisplayName && lowerAlias.startsWith( name.toLowerCase() ) ) return alias
            continue
        }

        // Scan name inside a longer README name
        const nameWords = wordsOf( name )
        const aliasWords = wordsOf( alias )
        const position = findWordPosition( nameWords, aliasWords )
        const leadingWords = position > 0 ? nameWords.slice( 0, position ) : []

        // Words in front of the scan name (`Warp` in `Warp Terminal`) usually name
        // the vendor. The scan must carry them, unless its bundle ID has no vendor.
        if ( leadingWords.length > 0 ) {
            const carriesLeadingWords = leadingWords.every( word => scanWords.has( word ) ) ||
                squashedScanText.includes( leadingWords.join( '' ) + squash( alias ) )

            if ( carriesLeadingWords || vendor.length === 0 ) return alias
            continue
        }

        // README name = scan name + qualifier (`Arduino IDE`)
        if ( isDisplayName ) return alias

        // A secondary alias such as an executable name (`Electron`, `Focus`)
        // needs the vendor, or must be the product part of the bundle ID
        const productWords = getBundleProductWords( bundleId, vendor )

        if ( vendorAgrees || ( vendor.length > 0 && aliasWords.every( word => productWords.has( word ) ) ) ) return alias
    }

    return null
}
