import { describe, expect, it } from 'vitest'

import {
    INFO_PLIST_ALLOWED_KEYS,
    MAX_VALUE_LENGTH,
    PUBLIC_SCAN_FIELDS,
    appBundleBaseName,
    architectureLabel,
    architecturesFromMachoMeta,
    buildScanSubmission,
    pickAllowedInfoPlist,
    scanSummaryRows,
    selectRelevantScan,
    toPublicScanReport,
} from '../../helpers/scan-allowlist.js'
import { projectScanVersions } from '../../helpers/build-app-list.js'
import { supportedArchitectures } from '../../helpers/bundles.js'

const rawInfoPlist = {
    CFBundleIdentifier: 'com.tinyspeck.slackmacgap',
    CFBundleName: 'Slack',
    CFBundleShortVersionString: '4.41.105',
    CFBundleVersion: 441105,
    LSMinimumSystemVersion: '11.0',
    LSRequiresNativeExecution: false,
    LSMinimumSystemVersionByArchitecture: { arm64: '11.0', x86_64: '10.15' },
    LSArchitecturePriority: [ 'arm64', 'x86_64' ],
    SUFeedURL: 'https://slack.com/updates/feed.xml',
    CFBundleExecutable: 'Slack',
    CFBundleURLTypes: [ { CFBundleURLSchemes: [ 'slack' ] } ],
    NSHumanReadableCopyright: 'x'.repeat( 1000 ),
}

// Shapes produced by the v1 and v2 Mach-O parsers
const rawMachoMeta = {
    fileSize: 4.4,
    file: { name: '/Users/someone/Downloads/Slack.app/Contents/MacOS/Slack' },
    architectures: [
        { bits: '64-bit', processorType: 'X86', processorSubType: 3, header: { cputype: 7, ncmds: 28 }, loadCommandsInfo: [ { description: 'LC_LOAD_DYLIB', offset: '0x20' } ] },
        { bits: '64-bit', processorType: 'ARM', processorSubType: 'all', header: { cputype: 12 }, loadCommandsInfo: [] },
        { bits: '32-bit', processorType: 0, processorSubType: 'v7em', header: { cputype: 0 } },
    ],
}

describe( 'pickAllowedInfoPlist', () => {
    it( 'keeps only allowlisted keys with scalar values', () => {
        const picked = pickAllowedInfoPlist( rawInfoPlist )

        expect( Object.keys( picked ).every( key => INFO_PLIST_ALLOWED_KEYS.includes( key ) ) ).toBe( true )
        expect( picked ).not.toHaveProperty( 'SUFeedURL' )
        expect( picked ).not.toHaveProperty( 'CFBundleExecutable' )
        expect( picked ).not.toHaveProperty( 'CFBundleURLTypes' )
        expect( picked.CFBundleIdentifier ).toBe( 'com.tinyspeck.slackmacgap' )
        expect( picked.CFBundleVersion ).toBe( 441105 )
        expect( picked.LSRequiresNativeExecution ).toBe( false )
    } )

    it( 'drops nested values even for allowlisted keys', () => {
        const picked = pickAllowedInfoPlist( rawInfoPlist )

        expect( picked ).not.toHaveProperty( 'LSMinimumSystemVersionByArchitecture' )
        expect( picked ).not.toHaveProperty( 'LSArchitecturePriority' )
        expect( pickAllowedInfoPlist({ CFBundleName: null, DTXcode: NaN }) ).toEqual( {} )
    } )

    it( 'truncates long strings', () => {
        const picked = pickAllowedInfoPlist( rawInfoPlist )

        expect( picked.NSHumanReadableCopyright ).toHaveLength( MAX_VALUE_LENGTH )
    } )

    it( 'returns null for anything that is not a plist object', () => {
        expect( pickAllowedInfoPlist( null ) ).toBeNull()
        expect( pickAllowedInfoPlist( [ 'CFBundleName' ] ) ).toBeNull()
        expect( pickAllowedInfoPlist( 'CFBundleName' ) ).toBeNull()
    } )
} )

describe( 'architecturesFromMachoMeta', () => {
    it( 'derives names from parser output and drops unknown entries', () => {
        expect( architecturesFromMachoMeta( rawMachoMeta ) ).toEqual( [ 'arm64', 'x86_64' ] )
    } )

    it( 'handles arm64e, x86_64h, i386 and the older array form', () => {
        expect( architecturesFromMachoMeta( [
            { architectures: [ { bits: '64-bit', processorType: 'ARM', processorSubType: 2 } ] },
            { architectures: [ { bits: '64-bit', processorType: 'X86', processorSubType: 8 } ] },
            { architectures: [ { bits: '32-bit', processorType: 'X86', processorSubType: 3 } ] },
        ] ) ).toEqual( [ 'arm64e', 'x86_64h', 'i386' ] )
        expect( architecturesFromMachoMeta({ architectures: [ { processorType: 'ARM64' } ] }) ).toEqual( [ 'arm64' ] )
        expect( architecturesFromMachoMeta( [ 'x86_64', 'arm64', 'ppc' ] ) ).toEqual( [ 'arm64', 'x86_64' ] )
        expect( architecturesFromMachoMeta( null ) ).toEqual( [] )
    } )
} )

describe( 'appBundleBaseName', () => {
    it( 'keeps only the app bundle base name', () => {
        expect( appBundleBaseName( 'Slack.app.zip' ) ).toBe( 'Slack.app' )
        expect( appBundleBaseName( '/Users/someone/Downloads/Slack.zip' ) ).toBe( 'Slack.app' )
        expect( appBundleBaseName( 'C:\\Users\\someone\\Slack.dmg' ) ).toBe( 'Slack.app' )
        expect( appBundleBaseName( '' ) ).toBeNull()
        expect( appBundleBaseName( undefined ) ).toBeNull()
    } )
} )

describe( 'buildScanSubmission', () => {
    it( 'sends only the allowlisted fields', () => {
        const body = buildScanSubmission({
            filename: '/Users/someone/Downloads/Slack.app.zip',
            appVersion: '4.41.105',
            result: '✅',
            machoMeta: rawMachoMeta,
            infoPlist: rawInfoPlist,
        })

        expect( Object.keys( body ).sort() ).toEqual( [ 'appVersion', 'architectures', 'filename', 'infoPlist', 'machoMeta', 'result' ] )
        expect( body.filename ).toBe( 'Slack.app' )
        expect( body.architectures ).toEqual( [ 'arm64', 'x86_64' ] )
        expect( JSON.parse( body.machoMeta ) ).toEqual( { architectures: [ 'arm64', 'x86_64' ] } )
        expect( JSON.parse( body.infoPlist ) ).toEqual( pickAllowedInfoPlist( rawInfoPlist ) )

        const serialized = JSON.stringify( body )
        for ( const marker of [ 'SUFeedURL', 'loadCommandsInfo', 'cputype', 'Users/someone', 'CFBundleExecutable', 'fileSize' ] ) {
            expect( serialized ).not.toContain( marker )
        }
    } )

    it( 'keeps error scans readable by the result store', () => {
        const body = buildScanSubmission({ filename: 'Broken.zip', result: 'error_no_macho_files' })

        expect( body.infoPlist ).toBe( 'null' )
        expect( body.machoMeta ).toBe( 'null' )
        expect( body.architectures ).toEqual( [] )
    } )
} )

describe( 'published scan reports', () => {
    const rawRow = {
        'Date': '2024-01-01T00:00:00.000Z',
        'Filename': 'Slack.app.zip',
        'App Version': '4.41.105',
        'Result': '✅',
        'Macho Meta': rawMachoMeta,
        'Info Plist': rawInfoPlist,
    }

    it( 'projects raw rows to the public fields only', () => {
        const report = toPublicScanReport( rawRow )

        expect( Object.keys( report ).sort() ).toEqual( [ ...PUBLIC_SCAN_FIELDS ].sort() )
        expect( report ).toEqual( {
            'App Version': '4.41.105',
            'Result': '✅',
            architectures: [ 'arm64', 'x86_64' ],
            minimumMacOS: '11.0',
        } )
    } )

    it( 'parses JSON string cells and is idempotent', () => {
        const fromStrings = toPublicScanReport({
            ...rawRow,
            'Macho Meta': JSON.stringify( rawMachoMeta ),
            'Info Plist': JSON.stringify( rawInfoPlist ),
        })

        expect( toPublicScanReport( fromStrings ) ).toEqual( fromStrings )
    } )

    it( 'projects a whole scans-feed versions object', () => {
        const versions = projectScanVersions({ '4.41.105': rawRow, broken: null })
        const serialized = JSON.stringify( versions )

        expect( Object.keys( versions ) ).toEqual( [ '4.41.105' ] )
        for ( const marker of [ 'Info Plist', 'Macho Meta', 'SUFeedURL', 'loadCommandsInfo', 'Filename', 'Date' ] ) {
            expect( serialized ).not.toContain( marker )
        }
        expect( supportedArchitectures( versions['4.41.105'] ) ).toEqual( [ 'arm64', 'x86_64' ] )
    } )
} )

describe( 'app page scan summary', () => {
    const versions = [
        [ '5.0.0', { 'App Version': '5.0.0', 'Result': '🔶', architectures: [ 'x86_64' ], minimumMacOS: '10.15' } ],
        [ '4.41.105', { 'App Version': '4.41.105', 'Result': '✅', architectures: [ 'arm64', 'x86_64' ], minimumMacOS: '11.0' } ],
    ]

    it( 'labels architectures', () => {
        expect( architectureLabel( [ 'arm64', 'x86_64' ] ) ).toBe( 'Universal' )
        expect( architectureLabel( [ 'arm64e' ] ) ).toBe( 'Apple Silicon' )
        expect( architectureLabel( [ 'x86_64', 'i386' ] ) ).toBe( 'Intel' )
        expect( architectureLabel( [] ) ).toBeNull()
    } )

    it( 'prefers the newest native scan, else the newest scan', () => {
        expect( selectRelevantScan( versions )[0] ).toBe( '4.41.105' )
        expect( selectRelevantScan( versions.slice( 0, 1 ) )[0] ).toBe( '5.0.0' )
        expect( selectRelevantScan( [] ) ).toBeNull()
    } )

    it( 'shows only the narrow fields', () => {
        const [ version, report ] = selectRelevantScan( versions )

        expect( scanSummaryRows({ bundleIdentifier: 'com.tinyspeck.slackmacgap', version, report }) ).toEqual( [
            [ 'App version', '4.41.105' ],
            [ 'Bundle ID', 'com.tinyspeck.slackmacgap' ],
            [ 'Architectures', 'Universal (arm64, x86_64)' ],
            [ 'Minimum macOS', '11.0' ],
        ] )
    } )

    it( 'skips empty fields', () => {
        expect( scanSummaryRows({ bundleIdentifier: 'com.example', version: '1.0', report: { 'Result': '🔶' } }) ).toEqual( [
            [ 'App version', '1.0' ],
            [ 'Bundle ID', 'com.example' ],
        ] )
    } )
} )
