// check_inventory: match a Mac app inventory export against the public app
// catalog. Rows come only from the tool arguments. They are never logged,
// cached or stored; only upstream catalog JSON is cached (see data.js).
// Error messages name the field, row number or bound and never echo values.

import { scannedVersions, siteUrl } from './data.js'
import { ToolInputError } from './tools.js'

export const INVENTORY_LIMITS = {
    maxRows: 250,
    maxInputBytes: 64 * 1024,
    maxArgumentBytes: 96 * 1024,
    maxOffset: 249,
    maxLimit: 50,
    defaultLimit: 20,
    maxRevisionLength: 128,
    maxInvalidPreview: 10,
    maxCandidates: 3,
    // Distinct listings whose scanned-version history is read per call.
    maxDetailLookups: 25,
}

export const FIELD_LIMITS = { name: 160, bundle_id: 255, version: 80, build: 80, publisher: 160 }
export const FIELDS = Object.keys( FIELD_LIMITS )
export const TARGETS = [ 26, 27, 28 ]
export const FILTERS = [ 'all', 'native', 'rosetta', 'unsupported', 'unknown' ]

export const SCANNER_REFERENCE = Object.freeze({
    title: 'Does It ARM App Scanner v3 (preview)',
    url: 'https://doesitarm.com/apple-silicon-app-test/?v=3',
    scope: 'Local Mach-O architecture inspection and file export for selected Mac apps or folders.',
    catalog_submission: 'unavailable',
})

export const SCANNER_TEXT = 'App Scanner v3 preview provides local Mach-O inspection and file export for selected Mac apps or folders. Local scan results are separate from the public catalog.'

// CSV header aliases from common inventory exports, compared after
// lowercasing and dropping everything but letters and digits. A generic
// "version" column is the short version, never the build.
export const HEADER_ALIASES = {
    name: [ 'name', 'appname', 'applicationname', 'displayname', 'title' ],
    bundle_id: [ 'bundleid', 'bundleidentifier', 'cfbundleidentifier' ],
    version: [ 'version', 'shortversion', 'bundleshortversion', 'cfbundleshortversionstring', 'applicationversion' ],
    build: [ 'build', 'bundleversion', 'cfbundleversion', 'buildversion' ],
    publisher: [ 'publisher', 'applicationpublisher', 'vendor', 'developer' ],
}

const HEADER_FIELD = Object.fromEntries( Object.entries( HEADER_ALIASES ).flatMap( ([ field, aliases ]) => aliases.map( alias => [ alias, field ] ) ) )
const ALLOWED_HEADERS_TEXT = Object.entries( HEADER_ALIASES ).map( ([ field, aliases ]) => `${ field } (${ aliases.join(', ') })` ).join('; ')

const encoder = new TextEncoder()
const byteLength = value => encoder.encode( value ).length
const headerKey = value => String( value ).toLowerCase().replace( /[^a-z0-9]/g, '' )

// RFC 4180 style parser: quoted fields, doubled quotes, CRLF, BOM. Returns
// records with their one-based starting line. Blank lines are skipped.
export function parseDelimited ( text, delimiter ) {
    const records = []
    let record = []
    let field = ''
    let quoted = false
    let line = 1
    let recordLine = 1
    let fieldStarted = false

    const pushField = () => { record.push( field ); field = ''; fieldStarted = false }
    const pushRecord = () => {
        pushField()
        if ( !( record.length === 1 && record[0].trim() === '' ) ) records.push({ line: recordLine, fields: record })
        record = []
    }

    for ( let index = 0; index < text.length; index++ ) {
        const char = text[ index ]
        if ( quoted ) {
            if ( char === '"' ) {
                if ( text[ index + 1 ] === '"' ) { field += '"'; index++ }
                else quoted = false
            } else {
                if ( char === '\n' ) line++
                field += char
            }
            continue
        }
        if ( char === '"' && !fieldStarted && field.trim() === '' ) { quoted = true; fieldStarted = true; field = ''; continue }
        if ( char === delimiter ) { pushField(); continue }
        if ( char === '\r' && text[ index + 1 ] === '\n' ) continue
        if ( char === '\n' || char === '\r' ) { pushRecord(); line++; recordLine = line; continue }
        field += char
        if ( char.trim() !== '' ) fieldStarted = true
    }

    if ( quoted ) throw new ToolInputError( `csv is malformed: a quoted field starting on or after line ${ recordLine } is not closed.` )
    if ( field !== '' || record.length > 0 ) pushRecord()
    return records
}

function mapHeader ( fields ) {
    return fields.map( value => HEADER_FIELD[ headerKey( value ) ] || null )
}

// Turns a headered CSV or TSV string into raw rows with data row numbers.
export function rowsFromCsv ( csv ) {
    if ( byteLength( csv ) > INVENTORY_LIMITS.maxInputBytes ) {
        throw new ToolInputError( `csv must be at most ${ INVENTORY_LIMITS.maxInputBytes } bytes of UTF-8 text.` )
    }
    const text = csv.replace( /^\uFEFF/, '' )
    const firstLine = text.split( /\r?\n/ ).find( value => value.trim() !== '' ) || ''

    // Prefer tab when the header row is fully recognized as TSV.
    const delimiter = firstLine.includes('\t') && mapHeader( firstLine.split('\t') ).every( Boolean ) ? '\t' : ','
    const records = parseDelimited( text, delimiter )
    if ( records.length < 2 ) {
        throw new ToolInputError( 'csv needs a header row and at least one data row. Expected headers: name, bundle_id, version, build, publisher.' )
    }

    const header = records[0].fields
    const columns = mapHeader( header )
    const unknown = columns.map( ( field, index ) => field ? null : index + 1 ).filter( Boolean )
    if ( unknown.length ) {
        throw new ToolInputError( `csv header column${ unknown.length === 1 ? '' : 's' } ${ unknown.join(', ') } ${ unknown.length === 1 ? 'is' : 'are' } not recognized. Allowed headers: ${ ALLOWED_HEADERS_TEXT }. Remove other columns, such as host or user columns, before sending.` )
    }
    const seen = {}
    for ( const [ index, field ] of columns.entries() ) {
        if ( seen[ field ] ) throw new ToolInputError( `csv header columns ${ seen[ field ] } and ${ index + 1 } both map to ${ field }. Keep one.` )
        seen[ field ] = index + 1
    }
    if ( !seen.name && !seen.bundle_id ) throw new ToolInputError( 'csv needs a name or bundle_id column.' )

    const data = records.slice( 1 )
    if ( data.length > INVENTORY_LIMITS.maxRows ) {
        throw new ToolInputError( `csv accepts at most ${ INVENTORY_LIMITS.maxRows } data rows after the header; it has ${ data.length }.` )
    }

    return data.map( ( record, index ) => {
        if ( record.fields.length > columns.length ) return { row: index + 1, extraFields: true }
        const values = {}
        columns.forEach( ( field, column ) => { values[ field ] = record.fields[ column ] } )
        return { row: index + 1, values }
    })
}

// Trims fields and applies per-row limits. Returns accepted rows plus
// invalid row numbers with reason codes (never the values).
export function validateRows ( rawRows ) {
    const accepted = []
    const invalid = []

    for ( const raw of rawRows ) {
        if ( raw.extraFields ) { invalid.push({ row: raw.row, code: 'invalid_field' }); continue }
        const row = { row: raw.row }
        let tooLong = false
        for ( const field of FIELDS ) {
            const value = typeof raw.values[ field ] === 'string' ? raw.values[ field ].trim() : ''
            if ( value.length > FIELD_LIMITS[ field ] ) tooLong = true
            row[ field ] = value || null
        }
        if ( tooLong ) invalid.push({ row: raw.row, code: 'invalid_field' })
        else if ( !row.name && !row.bundle_id ) invalid.push({ row: raw.row, code: 'missing_identity' })
        else accepted.push( row )
    }

    return { accepted, invalid }
}

export function normalizeName ( value = '' ) {
    return String( value ).normalize('NFKC').trim().replace( /\.app$/i, '' ).replace( /\s+/g, ' ' ).trim().toLowerCase()
}

// Bundle ID and exact name/alias indexes over the public app list, cached
// per list object (catalog data only).
const indexCache = new WeakMap()

export function catalogIndex ( apps ) {
    const cached = indexCache.get( apps )
    if ( cached ) return cached

    const byId = new Map()
    const byName = new Map()
    let newest = 0

    apps.forEach( ( item, position ) => {
        for ( const id of Array.isArray( item.bundleIds ) ? item.bundleIds : [] ) {
            if ( typeof id !== 'string' || !id.trim() ) continue
            const key = id.trim().toLowerCase()
            if ( !byId.has( key ) ) byId.set( key, { position, bundleId: id.trim() } )
        }
        const names = [ [ item.name, 'name' ], ...( Array.isArray( item.aliases ) ? item.aliases : [] ).map( alias => [ alias, 'alias' ] ) ]
        for ( const [ name, via ] of names ) {
            if ( typeof name !== 'string' ) continue
            const key = normalizeName( name )
            if ( !key ) continue
            const hits = byName.get( key ) || new Map()
            // A listing's own name outranks its aliases.
            if ( !hits.has( position ) || via === 'name' ) hits.set( position, via )
            byName.set( key, hits )
        }
        const stamp = Number( item?.lastUpdated?.timestamp ) || Date.parse( item?.lastUpdated?.raw || '' ) || 0
        if ( stamp > newest ) newest = stamp
    })

    const index = { byId, byName, revision: `apps-${ apps.length }-${ newest.toString( 36 ) }` }
    indexCache.set( apps, index )
    return index
}

// "as of v4.13.0", "as of 5.4.7 (59780.1220)" → [ 4, 13, 0 ]
export function claimVersion ( text = '' ) {
    const match = String( text ).match( /\bas of v?(\d+(?:\.\d+)*)/i )
    return match ? match[1] : null
}

function numericParts ( version ) {
    const match = String( version || '' ).trim().match( /^v?(\d+(?:\.\d+)*)/i )
    return match ? match[1].split('.').map( Number ) : null
}

// Compares leading dotted numbers. Null when either side has none.
export function compareVersions ( a, b ) {
    const left = numericParts( a )
    const right = numericParts( b )
    if ( !left || !right ) return null
    for ( let index = 0; index < Math.max( left.length, right.length ); index++ ) {
        const diff = ( left[ index ] || 0 ) - ( right[ index ] || 0 )
        if ( diff !== 0 ) return Math.sign( diff )
    }
    return 0
}

const hasArm = architectures => architectures.some( arch => /^arm/i.test( arch ) )
const hasIntel = architectures => architectures.some( arch => /^(x86|i386)/i.test( arch ) )

// Classifies an exact installed version from the scanned-version history.
export function scanVerdict ( versions, installed = [] ) {
    const wanted = installed.filter( Boolean )
    const exact = versions.filter( record => wanted.includes( record.version ) && record.architectures.length > 0 )
    if ( exact.length === 0 ) return null

    const architectures = [ ...new Set( exact.flatMap( record => record.architectures ) ) ]
    const kinds = new Set( exact.map( record => hasArm( record.architectures ) && hasIntel( record.architectures ) ? 'universal' : hasArm( record.architectures ) ? 'arm' : hasIntel( record.architectures ) ? 'intel' : 'other' ) )
    const observed = exact[0].version

    if ( kinds.size === 1 && kinds.has('universal') ) return { status: 'native', architectures, observed }
    if ( kinds.size > 1 || kinds.has('other') ) return { status: 'unknown', reason: 'conflicting_variants', architectures, observed }

    // Single-architecture builds of the same bundle in both directions point
    // to split Intel and Apple Silicon downloads, so one version string can
    // name either build.
    const split = versions.some( record => hasArm( record.architectures ) && !hasIntel( record.architectures ) )
        && versions.some( record => hasIntel( record.architectures ) && !hasArm( record.architectures ) )
    if ( split ) return { status: 'unknown', reason: 'conflicting_variants', architectures, observed }

    return kinds.has('arm')
        ? { status: 'native', architectures, observed }
        : { status: 'rosetta', architectures, observed }
}

function targetAssessment ( status, target ) {
    if ( target === null ) return null
    if ( status === 'native' ) return 'needs_validation'
    if ( status === 'rosetta' ) return target >= 28 ? 'rosetta_unavailable' : 'rosetta_available_if_installed'
    if ( status === 'unsupported' ) return 'explicitly_unsupported'
    return 'unknown'
}

function hint ( item ) {
    return { title: item.name, url: siteUrl( item.endpoint ), reported_status: item.status || null }
}

function candidate ( item ) {
    return { title: item.name, url: siteUrl( item.endpoint ) }
}

// Identity matching for one row. Bundle ID first; a bundle ID the catalog
// does not know never borrows a status from a name match.
function matchRow ( row, apps, index ) {
    const nameHits = row.name ? [ ...( index.byName.get( normalizeName( row.name ) ) || new Map() ).entries() ] : []

    if ( row.bundle_id ) {
        const hit = index.byId.get( row.bundle_id.toLowerCase() )
        if ( hit ) return { match: 'bundle_id', item: apps[ hit.position ], bundleId: hit.bundleId }

        if ( nameHits.length > 0 && nameHits.every( ([ position ]) => ( apps[ position ].bundleIds || [] ).length > 0 ) ) {
            return { match: 'none', reason: 'bundle_id_conflict', candidates: nameHits.slice( 0, INVENTORY_LIMITS.maxCandidates ).map( ([ position ]) => candidate( apps[ position ] ) ) }
        }
    }

    if ( nameHits.length === 1 ) {
        const [ position, via ] = nameHits[0]
        return { match: via, item: apps[ position ], reason: 'ambiguous_identity' }
    }
    if ( nameHits.length > 1 ) {
        return { match: 'ambiguous', reason: 'ambiguous_identity', candidates: nameHits.slice( 0, INVENTORY_LIMITS.maxCandidates ).map( ([ position ]) => candidate( apps[ position ] ) ) }
    }
    return { match: 'none', reason: 'unlisted' }
}

function dedupeKey ( row ) {
    const identity = row.bundle_id ? `id:${ row.bundle_id.toLowerCase() }` : `name:${ normalizeName( row.name ) }|${ normalizeName( row.publisher || '' ) }`
    return `${ identity }|${ row.version || '' }|${ row.build || '' }`
}

function emptyFinding ( row ) {
    return {
        row: row.row,
        duplicate_rows: 0,
        match: 'none',
        status: 'unknown',
        unknown_reason: null,
        target_assessment: null,
        requested_version: row.version,
        requested_build: row.build,
        evidence: null,
        catalog_hint: null,
        candidates: [],
    }
}

function statusLabel ( status ) {
    return { native: 'native', rosetta: 'Rosetta', unsupported: 'unsupported', unknown: 'unknown' }[ status ]
}

const REASON_TEXT = {
    unlisted: 'not in the catalog',
    ambiguous_identity: 'name match only, bundle ID needed for identity',
    bundle_id_conflict: 'bundle ID differs from the catalog listing with this name',
    version_missing: 'no installed version',
    version_unverified: 'no version-scoped evidence for this version',
    conflicting_variants: 'Intel and Apple Silicon builds share this version',
    stale_evidence: 'evidence too old for this decision',
    insufficient_evidence: 'no compatibility report yet',
}

function findingLine ( finding ) {
    const label = finding.catalog_hint?.title || ( finding.candidates.length ? `${ finding.candidates.length } candidate listings` : 'no listing' )
    const version = finding.requested_version ? ` ${ finding.requested_version }` : ''
    const detail = finding.status === 'unknown'
        ? REASON_TEXT[ finding.unknown_reason ]
        : finding.evidence.basis === 'catalog_statement'
            ? `catalog reports native as of ${ finding.evidence.observed_version }`
            : `scanned ${ finding.evidence.observed_version }: ${ finding.evidence.architectures.join(', ') }`
    const url = finding.catalog_hint?.url || finding.candidates[0]?.url
    return `- Row ${ finding.row }${ finding.duplicate_rows ? ` (+${ finding.duplicate_rows } duplicate${ finding.duplicate_rows === 1 ? '' : 's' })` : '' }: ${ label }${ version } → ${ statusLabel( finding.status ) } (${ detail })${ finding.target_assessment ? `, target: ${ finding.target_assessment }` : '' }${ url ? ` · ${ url }` : '' }`
}

export async function checkInventory ( args, data ) {
    const {
        rows,
        csv,
        target_macos: target = null,
        filter = 'all',
        offset = 0,
        limit = INVENTORY_LIMITS.defaultLimit,
        catalog_revision: requestedRevision,
    } = args

    if ( ( rows === undefined ) === ( csv === undefined ) ) {
        throw new ToolInputError( 'Provide exactly one of rows or csv.' )
    }
    if ( byteLength( JSON.stringify( args ) ) > INVENTORY_LIMITS.maxArgumentBytes ) {
        throw new ToolInputError( `check_inventory arguments must be at most ${ INVENTORY_LIMITS.maxArgumentBytes } bytes when serialized.` )
    }

    let rawRows
    if ( rows !== undefined ) {
        if ( rows.length > INVENTORY_LIMITS.maxRows ) throw new ToolInputError( `rows accepts at most ${ INVENTORY_LIMITS.maxRows } records; it has ${ rows.length }.` )
        if ( byteLength( JSON.stringify( rows ) ) > INVENTORY_LIMITS.maxInputBytes ) {
            throw new ToolInputError( `rows must total at most ${ INVENTORY_LIMITS.maxInputBytes } bytes of UTF-8 text.` )
        }
        rawRows = rows.map( ( values, index ) => ({ row: index + 1, values }) )
    } else {
        rawRows = rowsFromCsv( csv )
    }

    const { accepted, invalid } = validateRows( rawRows )
    if ( accepted.length === 0 ) {
        throw new ToolInputError( `No valid rows. Each row needs a nonblank name or bundle_id within the field limits (name ${ FIELD_LIMITS.name }, bundle_id ${ FIELD_LIMITS.bundle_id }, version ${ FIELD_LIMITS.version }, build ${ FIELD_LIMITS.build }, publisher ${ FIELD_LIMITS.publisher } characters). Invalid rows: ${ invalid.slice( 0, INVENTORY_LIMITS.maxInvalidPreview ).map( entry => entry.row ).join(', ') }${ invalid.length > INVENTORY_LIMITS.maxInvalidPreview ? ` and ${ invalid.length - INVENTORY_LIMITS.maxInvalidPreview } more` : '' }.` )
    }

    const apps = await data.list('app')
    const index = catalogIndex( apps )
    if ( requestedRevision !== undefined && requestedRevision !== index.revision ) {
        throw new ToolInputError( 'catalog_revision no longer matches the current catalog. Restart from offset 0 without catalog_revision to get results for the current revision.' )
    }

    // Deduplicate by identity, version and build, keeping first position.
    const unique = []
    const byKey = new Map()
    for ( const row of accepted ) {
        const key = dedupeKey( row )
        const existing = byKey.get( key )
        if ( existing ) { existing.duplicates += 1; continue }
        const entry = { row, duplicates: 0 }
        byKey.set( key, entry )
        unique.push( entry )
    }

    // First pass: identity and catalog statements.
    const pending = []
    for ( const entry of unique ) {
        const { row } = entry
        const finding = emptyFinding( row )
        finding.duplicate_rows = entry.duplicates
        const matched = matchRow( row, apps, index )
        finding.match = matched.match
        finding.candidates = matched.candidates || []
        if ( matched.item ) finding.catalog_hint = hint( matched.item )
        entry.finding = finding

        if ( matched.match !== 'bundle_id' ) { finding.unknown_reason = matched.reason; continue }

        const item = matched.item
        if ( !row.version && !row.build ) { finding.unknown_reason = 'version_missing'; continue }

        const claimed = item.status === 'native' ? claimVersion( item.text ) : null
        const comparison = claimed ? compareVersions( row.version, claimed ) : null
        if ( comparison !== null && comparison >= 0 ) {
            finding.status = 'native'
            finding.evidence = {
                basis: 'catalog_statement',
                observed_version: claimed,
                observed_build: null,
                observed_at: null,
                architectures: [],
                source_url: siteUrl( item.endpoint ),
            }
            continue
        }

        finding.unknown_reason = [ 'unreported', 'no-in-progress' ].includes( item.status ) ? 'insufficient_evidence' : 'version_unverified'
        pending.push({ entry, item, bundleId: matched.bundleId })
    }

    // Second pass: exact installed version against scanned-version history,
    // for a bounded number of listings in input order.
    const endpoints = [ ...new Set( pending.map( task => task.item.endpoint ) ) ].slice( 0, INVENTORY_LIMITS.maxDetailLookups )
    const details = new Map( await Promise.all( endpoints.map( async endpoint => [ endpoint, await data.detail( endpoint ).catch( () => null ) ] ) ) )

    for ( const { entry, item, bundleId } of pending ) {
        const raw = details.get( item.endpoint )
        if ( !raw ) continue
        const verdict = scanVerdict( scannedVersions( raw, bundleId ), [ entry.row.version, entry.row.build ] )
        if ( !verdict ) continue
        const finding = entry.finding
        finding.evidence = {
            basis: 'binary_architecture',
            observed_version: verdict.observed,
            observed_build: null,
            observed_at: null,
            architectures: verdict.architectures,
            source_url: siteUrl( item.endpoint ),
        }
        finding.status = verdict.status
        finding.unknown_reason = verdict.status === 'unknown' ? verdict.reason : null
    }

    const findings = unique.map( entry => {
        entry.finding.target_assessment = targetAssessment( entry.finding.status, target )
        if ( entry.finding.status !== 'unknown' ) entry.finding.unknown_reason = null
        return entry.finding
    })

    const counts = {
        received: rawRows.length,
        accepted: accepted.length,
        invalid: invalid.length,
        duplicates: accepted.length - unique.length,
        unique: unique.length,
        native: 0,
        rosetta: 0,
        unsupported: 0,
        unknown: 0,
    }
    for ( const finding of findings ) counts[ finding.status ] += 1

    const filtered = filter === 'all' ? findings : findings.filter( finding => finding.status === filter )
    const page = filtered.slice( offset, offset + limit )
    const nextOffset = offset + page.length < filtered.length ? offset + page.length : null
    const scanner = counts.unknown > 0 ? { ...SCANNER_REFERENCE, unknown_rows: counts.unknown } : null

    const text = [
        `Checked ${ counts.received } inventory row${ counts.received === 1 ? '' : 's' } against the Does It ARM catalog (revision ${ index.revision }): ${ counts.unique } unique app version${ counts.unique === 1 ? '' : 's' }, ${ counts.native } native, ${ counts.rosetta } Rosetta, ${ counts.unsupported } unsupported, ${ counts.unknown } unknown.${ counts.duplicates ? ` ${ counts.duplicates } duplicate row${ counts.duplicates === 1 ? '' : 's' } collapsed.` : '' }${ counts.invalid ? ` ${ counts.invalid } invalid row${ counts.invalid === 1 ? '' : 's' } (${ invalid.slice( 0, INVENTORY_LIMITS.maxInvalidPreview ).map( entry => `row ${ entry.row }: ${ entry.code }` ).join(', ') }).` : '' }${ target !== null ? ` Target: macOS ${ target }.` : '' }`,
        `${ filter === 'all' ? 'Results' : `Results with status ${ filter }` } ${ page.length ? `${ offset + 1 }–${ offset + page.length }` : 'none' } of ${ filtered.length }:`,
        ...page.map( findingLine ),
        ...( nextOffset !== null ? [ `Next page: offset ${ nextOffset } with the same rows, target_macos, filter and catalog_revision ${ index.revision }.` ] : [] ),
        ...( scanner ? [ '', `${ SCANNER_TEXT } ${ SCANNER_REFERENCE.url }` ] : [] ),
        '',
        'Source: Does It ARM (https://doesitarm.com).',
    ].join('\n')

    return {
        text,
        data: {
            catalog_revision: index.revision,
            target_macos: target,
            counts,
            invalid_rows: invalid.slice( 0, INVENTORY_LIMITS.maxInvalidPreview ),
            filtered_count: filtered.length,
            results: page,
            next_offset: nextOffset,
            scanner_reference: scanner,
        },
    }
}
