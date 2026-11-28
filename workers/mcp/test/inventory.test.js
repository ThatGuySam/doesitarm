import { describe, expect, it } from 'vitest'

import { claimVersion, compareVersions, normalizeName, parseDelimited, scanVerdict } from '../src/inventory.js'

describe( 'inventory helpers', () => {
    it( 'reads version-scoped catalog statements', () => {
        expect( claimVersion('✅ Yes, Full Native Apple Silicon Support as of 4.13.0') ).toBe('4.13.0')
        expect( claimVersion('✅ Yes, full native Apple Silicon support as of 5.4.7 (59780.1220)') ).toBe('5.4.7')
        expect( claimVersion('✅ Native Apple Silicon Support reported as of v1.5.5') ).toBe('1.5.5')
        expect( claimVersion('✅ Yes, Full Native Apple Silicon Support') ).toBeNull()
    })

    it( 'compares leading dotted numbers and refuses to guess otherwise', () => {
        expect( compareVersions( '4.41.105', '4.13.0' ) ).toBe( 1 )
        expect( compareVersions( '4.13', '4.13.0' ) ).toBe( 0 )
        expect( compareVersions( '4.9', '4.13.0' ) ).toBe( -1 )
        expect( compareVersions( '1.2.7.1277.g2b3ce637', '1.2' ) ).toBe( 1 )
        expect( compareVersions( 'beta', '1.0' ) ).toBeNull()
        expect( compareVersions( null, '1.0' ) ).toBeNull()
    })

    it( 'normalizes case, whitespace and a terminal .app', () => {
        expect( normalizeName( '  Microsoft   Word.APP ' ) ).toBe('microsoft word')
        expect( normalizeName( 'zoom.us' ) ).toBe('zoom.us')
    })

    it( 'parses quoted fields, doubled quotes and embedded newlines', () => {
        const records = parseDelimited( 'name,version\n"A ""quoted"", app","1.0"\n"Two\nLines",2\n', ',' )
        expect( records.map( record => record.fields ) ).toEqual([ [ 'name', 'version' ], [ 'A "quoted", app', '1.0' ], [ 'Two\nLines', '2' ] ])
        expect( records[2].line ).toBe( 3 )
    })

    it( 'keeps split Intel and Apple Silicon builds of one version unknown', () => {
        const split = [ { version: '2.0', architectures: [ 'ARM' ] }, { version: '1.0', architectures: [ 'X86' ] } ]
        expect( scanVerdict( split, [ '2.0' ] ) ).toMatchObject({ status: 'unknown', reason: 'conflicting_variants' })
        expect( scanVerdict( [ { version: '2.0', architectures: [ 'ARM' ] }, { version: '2.0', architectures: [ 'X86' ] } ], [ '2.0' ] ) ).toMatchObject({ reason: 'conflicting_variants' })
        expect( scanVerdict( [ { version: '2.0', architectures: [ 'X86', 'ARM' ] }, ...split ], [ '2.0' ] ) ).toMatchObject({ status: 'unknown' })
        expect( scanVerdict( [ { version: '3.0', architectures: [ 'X86', 'ARM' ] }, ...split ], [ '3.0' ] ) ).toMatchObject({ status: 'native' })
        expect( scanVerdict( [ { version: '2.0', architectures: [ 'ARM' ] } ], [ '2.0' ] ) ).toMatchObject({ status: 'native' })
        expect( scanVerdict( [ { version: '2.0', architectures: [] } ], [ '2.0' ] ) ).toBeNull()
        expect( scanVerdict( split, [ '9.9' ] ) ).toBeNull()
    })
})
