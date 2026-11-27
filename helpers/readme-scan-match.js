// Decide whether a README entry absorbs a scanned app.
// See docs/app-name-collisions.md for the rules and the evidence behind them.

import { eitherMatches } from './matching.js'

// Bundle ID prefixes that carry no vendor, so a partial name match through them
// is not trusted:
// - `com.electron.*` and `com.github.electron.*` are Electron's and
//   electron-builder's default IDs. Real apps ship with them (Zettlr, Guilded)
//   as well as repackaged ones (a nativefier Discord), and the ID never names
//   the vendor.
// - Automator stubs, Fluid web wrappers, Parallels Windows-app shims and
//   CrossOver launchers wrap another app and carry its name.
const VENDORLESS_BUNDLE_PREFIXES = [
    'com.electron.',
    'com.github.electron.',
    'com.apple.automator.',
    'com.fluidapp.',
    'com.parallels.winapp.',
    'com.codeweavers.crossoverhelper.',
]

// First bundle ID segments that are top-level domains, not the vendor. Every
// two-letter segment is a country code; these are the longer ones in use.
const TOP_LEVEL_SEGMENTS = new Set( 'com org net edu gov biz info app dev design download'.split( ' ' ) )
// Second-level parts after a top-level domain: `kr.co.vcnc`, `au.id.x`, `es.gob.x`
const SECOND_LEVEL_SEGMENTS = new Set( 'co com ac or ne go org net gov edu id gob gouv govt mil nom'.split( ' ' ) )

// README link hosts that say nothing about the app's vendor
const GENERIC_LINK_HOST = /(^|\.)(apple\.com|github\.com|github\.io|gitlab\.com|sourceforge\.net|sourceforge\.io|sjv\.io|prf\.hn)$/

// Vendors that now publish under another name, so old bundle IDs still count.
// Only cases seen in the scans feed belong here.
const VENDOR_SUCCESSORS = {
    // Maxon acquired Red Giant: PluralEyes ships as com.redgiant.*
    redgiant: [ 'maxon' ],
}

// Pairs no rule can separate: the README name is the scan's own name plus a
// qualifier, or the scan's name plus extra words, and the bundle ID gives no
// usable vendor signal. Keyed by README name (a test checks every key is still
// a README entry). Values are scan bundle IDs, or { bundleId, displayNamePrefix }
// when the bundle ID alone would also catch the real app; the prefix also
// covers renames such as `Testlum Desktop 2`.
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
    // A community build of Signal Desktop, not Signal's own release
    [ 'Signal', [ 'com.dennisameling.signal-desktop' ] ],
    // Testlum Desktop is built on IntelliJ Community and keeps its bundle ID
    [ 'IntelliJ IDEA', [ { bundleId: 'com.jetbrains.intellij.ce', displayNamePrefix: 'Testlum' } ] ],
] )

const squash = string => ( string || '' ).toLowerCase().replace( /[^\p{L}\p{N}]/gu, '' )
const wordsOf = string => ( string || '' ).toLowerCase().split( /[^\p{L}\p{N}]+/u ).filter( Boolean )

export function isVendorlessBundleId ( bundleId ) {
    const id = ( bundleId || '' ).toLowerCase()

    return VENDORLESS_BUNDLE_PREFIXES.some( prefix => id.startsWith( prefix ) )
}

// How strongly a scan owns its display name when another scan has the same slug:
// 0 a wrapper or default ID, a Chrome web-app stub (`com.google.Chrome.app.*`,
//   which still merges into Chrome), a template placeholder
//   (`com.yourcompany.*`, `*.identifier`) or a dotted ID with no vendor;
// 1 a vendor that matches neither the name nor appears with it in the ID;
// 2 the name appears in the bundle ID (`org.niltsh.MPlayerX`), or a dotless ID
//   equals the name (`IPScanner` for `IP Scanner`);
// 3 the vendor is the name or one of its words (`com.instagram`, `tv.plex.desktop`).
export function getSlugClaimStrength ( bundleId, displayName ) {
    const id = bundleId || ''

    if ( isVendorlessBundleId( id ) || /^com\.google\.chrome\.app\./i.test( id ) ) return 0
    if ( /^com\.(yourcompany|company|example)\./i.test( id ) || /\.identifier$/i.test( id ) ) return 0

    const name = squash( displayName )

    if ( !id.includes( '.' ) ) return name.length >= 3 && squash( id ) === name ? 2 : 0

    const vendor = getBundleVendor( id )
    if ( vendor.length === 0 ) return 0

    if ( vendor.length >= 3 && ( vendor === name || wordsOf( displayName ).includes( vendor ) ) ) return 3
    if ( name.length >= 3 && squash( id ).includes( name ) ) return 2

    return 1
}

// Whether a later scan takes a slug from an earlier one. Only a clearly
// stronger claim (two or more levels, or any real claim over a wrapper) beats
// feed order, so near-equal claims keep the later scan as before: qView,
// Self-Service, PDF Toolkit and VK Messenger keep their pages. One exception
// for near-equal claims: a scan with no version does not replace one with a
// version (`sddda.Plex` does not replace `tv.plex.desktop`).
// Scans are { bundleId, name, version }.
export function laterScanTakesSlug ( earlier, later ) {
    const earlierClaim = getSlugClaimStrength( earlier.bundleId, earlier.name )
    const laterClaim = getSlugClaimStrength( later.bundleId, later.name )

    if ( ( earlierClaim === 0 ) !== ( laterClaim === 0 ) ) return laterClaim > 0
    if ( Math.abs( earlierClaim - laterClaim ) >= 2 ) return laterClaim > earlierClaim

    const hasVersion = scan => String( scan.version ?? '' ).trim().length > 0
    if ( Math.abs( earlierClaim - laterClaim ) === 1 && hasVersion( earlier ) && !hasVersion( later ) ) return false

    return true
}

// The vendor segment of a bundle ID, squashed: `com.blackmagic-design.X` gives
// `blackmagicdesign`. Empty when the ID has no usable vendor.
export function getBundleVendor ( bundleId ) {
    if ( isVendorlessBundleId( bundleId ) ) return ''

    let segments = ( bundleId || '' ).toLowerCase().split( '.' ).filter( Boolean )

    if ( segments[ 0 ] === 'maccatalyst' ) segments = segments.slice( 1 )

    // Unity games use unity.<Company>.<Product>
    if ( segments[ 0 ] === 'unity' && segments.length > 2 ) return squash( segments[ 1 ] )

    if ( segments.length < 2 ) return ''

    let index = 0
    const first = segments[ 0 ]

    if ( first.length === 2 || TOP_LEVEL_SEGMENTS.has( first ) ) index = 1

    // Skip further domain-like parts, but never the last segment:
    // `com.design.spline` gives `spline`, `app.seashore` gives `seashore`
    while ( index > 0 && index < segments.length - 1 &&
        ( SECOND_LEVEL_SEGMENTS.has( segments[ index ] ) || TOP_LEVEL_SEGMENTS.has( segments[ index ] ) ) ) index++

    return squash( segments[ index ] )
}

function getBundleProductWords ( bundleId, vendor ) {
    const segments = ( bundleId || '' ).toLowerCase().split( '.' )
    const vendorIndex = segments.findIndex( segment => squash( segment ) === vendor )

    return new Set( segments.slice( vendorIndex + 1 ).flatMap( wordsOf ) )
}

function getHostName ( url ) {
    try {
        return new URL( url ).hostname
    } catch {
        return ''
    }
}

function getLinkHostHint ( url ) {
    const host = getHostName( url )

    if ( host === '' || GENERIC_LINK_HOST.test( host ) ) return ''

    return squash( host.replace( /^www\./, '' ).replace( /\.[a-z]+$/, '' ) )
}

// The first label of the scan's download host (`10base-t` for 10base-t.com)
function getDownloadHostLabel ( scan ) {
    const download = ( scan.relatedLinks || [] ).find( link => link.label === 'View' || link.label === 'App Website' )

    return download ? getHostName( download.href ).replace( /^www\./, '' ).split( '.' )[ 0 ] : ''
}

function isListedSeparate ( name, scan ) {
    const bundleId = ( scan.bundleIds?.[ 0 ] || '' ).toLowerCase()

    return ( SEPARATE_PRODUCTS.get( name ) || [] ).some( entry => typeof entry === 'string'
        ? entry.toLowerCase() === bundleId
        : entry.bundleId.toLowerCase() === bundleId &&
            ( scan.aliases[ 0 ] || '' ).toLowerCase().startsWith( entry.displayNamePrefix.toLowerCase() ) )
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

// Returns every scan alias that ties the scan to the README entry (empty if none).
export function findReadmeMatchAliases ( { name, url }, scan ) {
    const accepted = []
    const bundleId = scan.bundleIds?.[ 0 ] || ''

    if ( isListedSeparate( name, scan ) ) return accepted

    const displayName = scan.aliases[ 0 ] || ''
    const vendor = getBundleVendor( bundleId )
    const squashedName = squash( name )
    const squashedBundleId = squash( bundleId )
    const linkHostHint = getLinkHostHint( url )
    const alternativeNames = getAlternativeNames( name )

    // The scan's vendor appears in the README name or the README link host
    const vendorAgrees = vendor.length >= 3 && ( squashedName.includes( vendor ) || linkHostHint.includes( vendor ) )

    // The download host only counts for scans whose bundle ID has no vendor
    const downloadHostLabel = vendor.length === 0 ? getDownloadHostLabel( scan ) : ''
    const downloadHostWords = wordsOf( downloadHostLabel )
    const scanWords = new Set( [
        ...wordsOf( bundleId.replace( /\./g, ' ' ) ),
        ...scan.aliases.flatMap( wordsOf ),
        ...downloadHostWords,
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
            if ( isDisplayName || vendorAgrees || ( squashedName.length >= 3 && squashedBundleId.includes( squashedName ) ) ) { accepted.push( alias ); continue }
            continue
        }

        // Partial matches from here on

        // Default and wrapper bundle IDs say nothing about the vendor
        if ( isVendorlessBundleId( bundleId ) ) continue

        // A secondary alias that is only the vendor word (`Yandex`, `Maxon`)
        if ( !isDisplayName && vendor.length > 0 && squash( alias ) === vendor ) continue

        // README name inside a longer scan name
        if ( lowerAlias.length > name.length ) {
            if ( vendorAgrees ) { accepted.push( alias ); continue }

            // Only the scan's own name, and only when it starts with the
            // README name: `Discord PTB`, not `Hello Kitty` or `Ironhidegames ... Steam`
            if ( isDisplayName && lowerAlias.startsWith( name.toLowerCase() ) ) { accepted.push( alias ); continue }

            // `Avid Pro Tools` for `Pro Tools`: the alias is the scan's vendor
            // plus the README name. Only when the README link names no vendor
            // (App Store, GitHub); a vendor link that disagrees wins.
            const aliasWords = wordsOf( alias )
            const nameWords = wordsOf( name )
            const vendorWordCount = aliasWords.length - nameWords.length
            const isVendorPlusName = vendorWordCount > 0 &&
                nameWords.every( ( word, offset ) => aliasWords[ vendorWordCount + offset ] === word ) &&
                squash( aliasWords.slice( 0, vendorWordCount ).join( '' ) ) === vendor

            if ( isVendorPlusName && linkHostHint === '' ) { accepted.push( alias ); continue }
            continue
        }

        // Scan name inside a longer README name
        const nameWords = wordsOf( name )
        const aliasWords = wordsOf( alias )
        const position = findWordPosition( nameWords, aliasWords )
        const leadingWords = position > 0 ? nameWords.slice( 0, position ) : []

        // Words in front of the scan name (`Warp` in `Warp Terminal`) usually name
        // the vendor. The scan must carry them in its bundle ID, aliases or
        // download host. A scan with neither a vendor nor a download link
        // (`Influx`, bundle ID `TODO`) gives no evidence either way and is kept.
        if ( leadingWords.length > 0 ) {
            // A one-word download host counts when the leading words, joined, start
            // it: `angryip.org` carries `angry`. Four letters at least, so `mac`
            // does not match `macupdate.com`.
            const joinedLeadingWords = leadingWords.join( '' )
            const startsDownloadHost = joinedLeadingWords.length >= 4 && squash( downloadHostLabel ).startsWith( joinedLeadingWords )
            const carriesLeadingWords = leadingWords.every( word => scanWords.has( word ) ) || startsDownloadHost ||
                squashedScanText.includes( joinedLeadingWords + squash( alias ) )
            const hasNoEvidence = vendor.length === 0 && downloadHostWords.length === 0

            if ( carriesLeadingWords || hasNoEvidence ) { accepted.push( alias ); continue }
            continue
        }

        // README name = scan name + qualifier (`Arduino IDE`)
        if ( isDisplayName ) { accepted.push( alias ); continue }

        // A secondary alias such as an executable name (`Electron`, `Focus`)
        // needs the vendor, or must be the product part of the bundle ID
        const productWords = getBundleProductWords( bundleId, vendor )

        if ( vendorAgrees || ( vendor.length > 0 && aliasWords.every( word => productWords.has( word ) ) ) ) { accepted.push( alias ); continue }
    }

    return accepted
}

// Returns the first scan alias that ties the scan to the README entry, or null.
export function findReadmeMatchAlias ( entry, scan ) {
    return findReadmeMatchAliases( entry, scan )[ 0 ] ?? null
}

// 2 when the alias equals the README name, 1 when it equals an alternative
// name (`XLD` for `X Lossless Decoder (XLD)`), 0 for a partial match
export function getExactMatchLevel ( name, alias ) {
    const lowerAlias = alias.toLowerCase()

    if ( lowerAlias === name.toLowerCase() ) return 2

    return getAlternativeNames( name ).includes( lowerAlias ) ? 1 : 0
}

// Give each scan to its best README entry instead of the first one in the file:
// 1. an exact name match, the full name before an alternative name;
// 2. then the entry with the most name words found in the scan's aliases and
//    bundle ID (`Lightroom Classic` over `Lightroom` for Adobe Lightroom Classic);
// 3. then the fewest name words the scan lacks (`Acrobat Pro` over `Acrobat Reader`);
// 4. then file order.
// `entries` are { name, url, absorbsScans }. Returns Map scanKey -> { index, alias }.
export function assignScansToReadmeEntries ( entries, scanListMap ) {
    const assignments = new Map()

    scanListMap.forEach( ( scan, key ) => {
        const scanWords = new Set( [
            ...wordsOf( ( scan.bundleIds?.[ 0 ] || '' ).replace( /\./g, ' ' ) ),
            ...scan.aliases.flatMap( wordsOf ),
        ] )
        let best = null

        entries.forEach( ( entry, index ) => {
            if ( entry.absorbsScans === false ) return

            const aliases = findReadmeMatchAliases( entry, scan )
            if ( aliases.length === 0 ) return

            // Rank by the best accepted alias, not the first one
            const exactLevels = aliases.map( alias => getExactMatchLevel( entry.name, alias ) )
            const exactLevel = Math.max( ...exactLevels )
            const alias = aliases[ exactLevels.indexOf( exactLevel ) ]

            const nameWords = wordsOf( entry.name )
            const foundWords = nameWords.filter( word => scanWords.has( word ) ).length
            const rank = [ exactLevel, foundWords, foundWords - nameWords.length ]

            const isBetter = best === null || rank.some( ( value, position ) =>
                value > best.rank[ position ] && rank.slice( 0, position ).every( ( earlier, i ) => earlier === best.rank[ i ] ) )

            if ( isBetter ) best = { index, alias, rank }
        } )

        if ( best !== null ) assignments.set( key, { index: best.index, alias: best.alias } )
    } )

    return assignments
}
